/**
 * 07 — VENDOR BID FROM THE VENDOR PORTAL, requests 4.0a–4.0c and 4B.1–4B.16.
 *
 * On an RFP the vendor answers the round's question forms (4B.7–4B.9); on an
 * RFQ it places a price bid instead (4B.7q–4B.9q): a price, an offered
 * quantity and GST per line item, then the gross total.
 *
 * The vendor itself signs in (email + OTP, with the vendor app's key) and
 * answers the published RFP round: a draft bid sheet, one page of answers per
 * form, then the submit — then the buyer checks it sees the bid. Runs only
 * when "Place a bid" is ticked. Every vendor picked goes through every step;
 * each step reports all of them.
 */
import { expect } from "@playwright/test";

import { cfgBool, cfgInt, cfgJson, cfgList, cfgStr } from "../src/config.js";
import { now, rfpCase, uniq } from "../src/harness.js";
import type { RunState } from "../src/state.js";
import {
  asVendor,
  bidProductsBody,
  bidSubmitBody,
  CURRENCIES,
  parseForms,
  round2,
  vbCheckQuote,
  vbPageBody,
  vbRfqCheckRows,
  vbRfqRows,
  vendorAppToken,
  vendorSessionToken,
} from "../src/vendor.js";

const q = encodeURIComponent;
type V = NonNullable<RunState["vbVendors"]>[number];
const vendors = (s: RunState) => s.vbVendors ?? [];
const multi = (s: RunState) => vendors(s).length > 1;
const tag = (s: RunState, v: V) => (multi(s) ? `${v.name}: ` : "");

// ── 4.0 setup: which event, which vendors ────────────────────────────────

rfpCase(
  {
    id: "4.0a",
    title: "Bid Setup — GET event group",
    plain: "Open the event to bid on and check it is live and its bidding window is open right now.",
    expected: "The event reads (200), is active, its round is active and bidding is open.",
    anchor: "4.0a",
    part: "vendor",
    kind: "step",
  },
  async (t) => {
    const eg = cfgStr("sb_event_group_uuid") || (t.state.published ? t.state.eventGroupUuid : "");
    if (!eg) t.skip("there is no published event to bid on — the publish flow did not publish one, and sb_event_group_uuid is not set");
    t.state.bidEg = eg;
    const res = await t.api.call("GET", `/api/event_groups/${q(eg!)}`);
    t.basic(res, { status: 200, sla: "heavy", schema: "eventGroup", critical: true });
    const b = res.json;
    t.critical("The event is live", () => expect(b.status).toBe("active"));
    const wanted = cfgStr("sb_trade_uuid") || (eg === t.state.eventGroupUuid ? t.state.tradeUuid : "") || b.current_stage_uuid;
    const st = (b.stages || []).find((s: any) => s.uuid === wanted);
    t.critical("The round is found and active", () => {
      expect(st).toBeTruthy();
      expect(st.status).toBe("active");
    });
    if (!cfgBool("surrogate_skip_window_check")) {
      t.critical("Bidding is open now", () => {
        expect(st.starting_from).toBeLessThanOrEqual(now() + 5);
        expect(st.ending_at, `closed at ${new Date(st.ending_at * 1000).toISOString()}`).toBeGreaterThan(now());
      });
    }
    t.check("It is an RFP or an RFQ round", () => expect(["rfp", "rfq"]).toContain(st.rfx_mode));
    t.state.bidRfx = st.rfx_mode;
    t.state.bidTrade = st.uuid;
    t.state.bidStage = {
      start: st.starting_from,
      end: st.ending_at,
      extra: st.extra_closing_time,
      total_bids: st.participants_data?.total_bids ?? 0,
      active_participants: st.participants_data?.active_participants ?? 0,
    };
    t.actual(`“${b.title}” is live; round ${st.ref_id} is open until ${new Date(st.ending_at * 1000).toISOString().slice(11, 16)} UTC with ${st.participants_data?.total_bids ?? 0} bid(s).`);
  },
);

rfpCase(
  {
    id: "4.0b",
    title: "Bid Setup — GET bidders_delivery_stats",
    plain: "Read who has already bid, and each invited vendor's login email.",
    expected: "The stats come back (200) with every invited user and who has bid.",
    anchor: "4.0b",
    part: "vendor",
    kind: "step",
    needs: ["bidTrade"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/trade/${q(t.state.bidTrade!)}/bidders_delivery_stats`);
    if (!t.basic(res, { status: 200, schema: "bidderStats" })) return;
    const b = res.json;
    t.state.bidAlready = uniq(b.bid_placed.map((x: any) => x.user.company_uuid));
    t.state.bidInvitedUsers = b.invited.map((x: any) => ({ company: x.user.company_uuid, email: x.user.email, name: x.user.firm_name }));
    t.actual(`${b.invited.length} invited user(s); ${t.state.bidAlready!.length} vendor(s) have bid.`);
  },
);

rfpCase(
  {
    id: "4.0c",
    title: "Vendor Picker — GET invited vendors",
    plain: "List the invited vendors and pick the one(s) to bid as — named in the settings, or the first without a bid — each with the email it logs in with.",
    expected: "The invited vendors come back (200); enough of them have not bid, and each picked vendor has a login email.",
    anchor: "4.0c",
    part: "vendor",
    kind: "step",
    needs: ["bidTrade"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/companies/audience_for_product?&trade_request_uuid=${q(t.state.bidTrade!)}&show_bidders=true`);
    t.basic(res, { status: 200, schema: "audienceBidders", critical: true });
    const b = res.json;
    const already = t.state.bidAlready ?? [];
    const users = t.state.bidInvitedUsers ?? [];
    const emailOv = cfgJson<Record<string, string>>("vendor_emails") || {};
    const list = b.companies.map((c: any) => ({
      uuid: c.uuid,
      name: c.name,
      email: emailOv[c.uuid] || c.email || users.find((u) => u.company === c.uuid)?.email || "",
      vendor_code: c.vendor_code || "",
      status: c.status,
      has_bid: already.includes(c.uuid),
    }));
    t.check("There are invited vendors", () => expect(list.length).toBeGreaterThan(0));
    t.check("Invited vendors are unique", () => expect(uniq(list.map((v: any) => v.uuid)).length).toBe(list.length));
    const given = cfgList("bid_vendor_uuids");
    let sel: any[];
    if (given.length) {
      const unknown = given.filter((g) => !list.find((v: any) => v.uuid === g));
      t.critical("The vendors named are invited to this event", () => expect(unknown, `not invited: ${unknown.join(", ")}`).toEqual([]));
      sel = given.map((g) => list.find((v: any) => v.uuid === g)).filter(Boolean);
    } else {
      const n = cfgInt("num_bids") || 1;
      const pool = list.filter((v: any) => !v.has_bid && ["active", "invited"].includes(v.status));
      t.critical(`${n} invited vendor(s) without a bid yet`, () => expect(pool.length, `only ${pool.length} have not bid`).toBeGreaterThanOrEqual(n));
      sel = pool.slice(0, n);
    }
    t.critical("Every vendor picked has a login email (vendor_emails can set one)", () =>
      sel.forEach((v) => expect(typeof v.email === "string" && v.email.length > 0, v.name).toBe(true)),
    );
    t.state.bidList = list;
    t.state.vbVendors = sel.map((v) => ({ uuid: v.uuid, name: v.name, email: v.email }));
    t.actual(`${list.length} vendor(s) invited; bidding as ${sel.map((v) => `${v.name} <${v.email}>`).join(", ")}.`);
  },
);

// ── 4B: as the vendor ────────────────────────────────────────────────────

rfpCase(
  {
    id: "4B.1",
    title: "Vendor Login — POST generate_otp",
    plain: "Ask the vendor portal to send each vendor its login OTP.",
    expected: "Each request is accepted (200): the OTP is sent, and a user exists for the email.",
    anchor: "4B.1",
    part: "vendor",
    kind: "step",
    needs: ["vbVendors"],
  },
  async (t) => {
    for (const v of vendors(t.state)) {
      const res = await asVendor(t.api, vendorAppToken(), "$VENDOR_APP_TOKEN", "POST", "/api/v1/generate_otp", { body: { email: v.email } });
      t.basic(res, { status: 200, schema: "generateOtp", critical: true });
      t.critical(`${tag(t.state, v)}OTP sent to ${v.email}`, () => expect(res.json.otp_sent).toBe(true));
      t.critical(`${tag(t.state, v)}a user exists for ${v.email}`, () => expect(res.json.is_user_exist).toBe(true));
    }
    t.actual(`OTP sent to ${vendors(t.state).map((v) => v.email).join(", ")}.`);
  },
);

rfpCase(
  {
    id: "4B.2",
    title: "Vendor Login — POST verify_otp",
    plain: "Log each vendor in with the OTP.",
    expected: "Each login is accepted (200) with a session, as an active seller of the invited company.",
    anchor: "4B.2",
    part: "vendor",
    kind: "step",
    needs: ["vbVendors"],
  },
  async (t) => {
    for (const v of vendors(t.state)) {
      const device = Array.from({ length: 32 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
      const res = await asVendor(t.api, vendorAppToken(), "$VENDOR_APP_TOKEN", "POST", "/api/v1/verify_otp", {
        body: { email: v.email, otp: cfgStr("vendor_otp"), device_id: device, device_info: { browser: "Playwright", os: "API", browser_version: "1", resolution: "0x0" } },
      });
      t.basic(res, { status: 200, sla: "heavy", schema: "verifyOtp", critical: true });
      const b = res.json;
      const p = tag(t.state, v);
      t.critical(`${p}a session came back`, () => expect(typeof b.access_token === "string" && b.access_token.length > 0).toBe(true));
      t.check(`${p}logged in as ${v.email}`, () => expect(String(b.user.email).toLowerCase()).toBe(v.email.toLowerCase()));
      t.check(`${p}the user is a seller`, () => expect(b.user.category).toBe("seller"));
      t.check(`${p}the user is active`, () => expect(b.user.status).toBe("active"));
      t.check(`${p}the company is a selling firm`, () => expect(b.user.company.category).toBe("selling_firm"));
      // One vendor user can act for more than one company, so its own firm
      // name may differ from the invited one. Whether it may bid AS the invited
      // company is the real question — 4B.6 checks exactly that.
      const firm = String(b.user.firm_name || b.user.company?.name || "").trim();
      if (b.user.company?.uuid !== v.uuid && firm.toLowerCase() !== String(v.name).trim().toLowerCase()) {
        t.note(`${p}this user's own firm is "${firm}", not ${v.name}; step 4B.6 checks it may bid as ${v.name}.`);
      }
      v.token = vendorSessionToken(b.access_token);
      v.user = b.user.uuid;
    }
    t.state.vbLoggedIn = true;
    t.actual(`Logged in: ${vendors(t.state).map((v) => v.name).join(", ")}.`);
  },
);

rfpCase(
  {
    id: "4B.3",
    title: "Vendor — GET server_current_time",
    plain: "Read the server's clock as the vendor, and check bidding is open by the server's time.",
    expected: "The time comes back (200), within 2 minutes of this machine's, and inside the bidding window.",
    anchor: "4B.3",
    part: "vendor",
    kind: "step",
    needs: ["vbLoggedIn"],
  },
  async (t) => {
    const v = vendors(t.state)[0];
    const res = await asVendor(t.api, v.token!, "$VENDOR_TOKEN", "GET", "/api/server_current_time");
    if (!t.basic(res, { status: 200, schema: "serverTime" })) return;
    const st = res.json.server_time;
    t.check("The server's clock is within 2 minutes of this machine's", () => expect(Math.abs(st - now())).toBeLessThan(120));
    const w = t.state.bidStage;
    if (w && !cfgBool("surrogate_skip_window_check")) {
      t.critical("By the server's clock, bidding is open", () => {
        expect(st).toBeGreaterThanOrEqual(w.start - 5);
        expect(st).toBeLessThan(w.end);
      });
    }
    t.actual(`Server time ${new Date(st * 1000).toISOString().slice(11, 19)} UTC; bidding closes ${new Date((w?.end ?? 0) * 1000).toISOString().slice(11, 16)} UTC.`);
  },
);

rfpCase(
  {
    id: "4B.4",
    title: "Vendor — GET event group (pre-bid)",
    plain: "Open the event as each vendor: the round is there, open, unlocked, and shows nothing only the buyer should see.",
    expected: "The event reads (200) for each vendor with the round active and unlocked, no bid placed yet, and no bidder counts.",
    anchor: "4B.4",
    part: "vendor",
    kind: "step",
    needs: ["vbLoggedIn"],
  },
  async (t) => {
    for (const v of vendors(t.state)) {
      const p = tag(t.state, v);
      const res = await asVendor(t.api, v.token!, "$VENDOR_TOKEN", "GET", `/api/event_groups/${q(t.state.bidEg!)}`);
      t.basic(res, { status: 200, sla: "heavy", schema: "vendorEventGroup", critical: true });
      const st = (res.json.stages || []).find((s: any) => s.uuid === t.state.bidTrade);
      t.critical(`${p}the vendor can see the round`, () => expect(st, "not visible to this vendor — not invited?").toBeTruthy());
      t.check(`${p}the round is active`, () => expect(st.status).toBe("active"));
      t.check(`${p}the round is not locked`, () => expect(st.is_stage_locked).toBe(false));
      if (!(t.state.bidAlready ?? []).includes(v.uuid)) t.check(`${p}no bid placed yet`, () => expect(st.is_bid_placed).toBe(false));
      t.check(`${p}the vendor does not see bidder counts`, () => expect(st.participants_data).toBeUndefined());
    }
  },
);

rfpCase(
  {
    id: "4B.5",
    title: "Vendor — GET trade (forms)",
    plain: "Open the round's forms as each vendor — the questions it has to answer.",
    expected: "The round reads (200), active and linked to the event; the vendor sees no other bidder; every form has one page.",
    anchor: "4B.5",
    part: "vendor",
    kind: "step",
    needs: ["vbLoggedIn"],
  },
  async (t) => {
    for (const v of vendors(t.state)) {
      const p = tag(t.state, v);
      const res = await asVendor(t.api, v.token!, "$VENDOR_TOKEN", "GET", `/api/trade/${q(t.state.bidTrade!)}?response_type=template&additional_fields=order_details`);
      if (t.state.bidRfx === "rfq") {
        // An RFQ has price rows, not question forms.
        t.basic(res, { status: 200, sla: "heavy", schema: "vendorTradeRfq", critical: true });
        const b = res.json;
        const rows: any[] = b.order_details;
        t.check(`${p}it is the round`, () => expect(b.uuid).toBe(t.state.bidTrade));
        t.check(`${p}the round is active and taking quotes ("rfqing")`, () => {
          expect(b.status).toBe("active");
          expect(b.current_status).toBe("rfqing");
        });
        t.check(`${p}it belongs to the event`, () => expect(b.event_group_uuid).toBe(t.state.bidEg));
        t.check(`${p}the vendor sees no other bidders`, () => expect(Object.keys(b.participants || {})).toEqual([]));
        t.critical(`${p}every line item has a product and a quantity asked for`, () =>
          rows.forEach((r) => {
            expect(typeof r.product.event_group_line_item_uuid).toBe("string");
            expect(Number(r.creator_quantity.value)).toBeGreaterThan(0);
          }),
        );
        t.check(`${p}prices are empty before bidding`, () => rows.forEach((r) => expect([null, undefined, ""]).toContain(r.price.value)));
        if (b.trade_config?.is_prefilled_value) {
          t.check(`${p}the offered quantity starts as the quantity asked for`, () =>
            rows.forEach((r) => expect(Number(r.participant_quantity.value)).toBe(Number(r.creator_quantity.value))),
          );
        }
        t.check(`${p}every product has its details (image, quality parameters)`, () =>
          rows.forEach((r) => expect(typeof (b.sheets.inline_components.product_additional_data || {})[r.product.uuid], r.product.value).toBe("object")),
        );
        const w = b.sheets.inline_components.widgets.map((x: any) => x.key_attribute);
        t.check(`${p}the vendor has price and quantity columns to fill`, () => ["price", "participant_quantity"].forEach((k) => expect(w).toContain(k)));
        v.rfqRows = rows;
        v.rfqPad = b.sheets.inline_components.product_additional_data || {};
        v.tradeCfg = { over_qty: b.trade_config?.is_over_quantity_allowed, fixed_qty: b.trade_config?.allow_fixed_quantity_for_bidding };
        v.forms = [];
        v.tradeBidCount = b.bid_count;
        continue;
      }
      t.basic(res, { status: 200, sla: "heavy", schema: "vendorTrade", critical: true });
      const b = res.json;
      t.check(`${p}it is the round`, () => expect(b.uuid).toBe(t.state.bidTrade));
      t.check(`${p}the round is active`, () => expect(b.status).toBe("active"));
      t.check(`${p}it belongs to the event`, () => expect(b.event_group_uuid).toBe(t.state.bidEg));
      t.check(`${p}the vendor sees no other bidders`, () => expect(Object.keys(b.participants || {})).toEqual([]));
      const forms = parseForms(b.sheets.forms);
      t.critical(`${p}every form has one page`, () => forms.forEach((f) => expect(typeof f.page_uuid, f.name).toBe("string")));
      v.forms = cfgBool("vendor_submit_all_forms") ? forms : forms.filter((f) => f.egli);
      v.tradeBidCount = b.bid_count;
    }
    const v0 = vendors(t.state)[0];
    t.actual(
      t.state.bidRfx === "rfq"
        ? `${(v0.rfqRows ?? []).length} line item(s) to price: ${(v0.rfqRows ?? []).map((r: any) => `${r.product.value} (${r.creator_quantity.value})`).join(", ")}.`
        : `${(v0.forms ?? []).length} form(s) to answer: ${(v0.forms ?? []).map((f) => f.name).join(", ")}.`,
    );
  },
);

rfpCase(
  {
    id: "4B.6",
    title: "Vendor — GET placed_bid_config",
    plain: "Check each vendor can bid as the company that was invited.",
    expected: "The bid config (200) lists the invited company among those the vendor can bid as.",
    anchor: "4B.6",
    part: "vendor",
    kind: "step",
    needs: ["vbLoggedIn"],
  },
  async (t) => {
    for (const v of vendors(t.state)) {
      const p = tag(t.state, v);
      const res = await asVendor(t.api, v.token!, "$VENDOR_TOKEN", "GET", `/api/companies/placed_bid_config?trade_request_uuid=${q(t.state.bidTrade!)}`);
      t.basic(res, { status: 200, schema: "placedBidConfig", critical: true });
      const c = res.json.companies.find((x: any) => x.uuid === v.uuid);
      t.critical(`${p}the vendor can bid as ${v.name}`, () => expect(c, `companies: ${res.json.companies.map((x: any) => x.uuid).join(", ")}`).toBeTruthy());
      t.check(`${p}the company name matches`, () => expect(c && c.name).toBe(v.name));
    }
  },
);

rfpCase(
  {
    id: "4B.7",
    title: "Vendor — POST template_responses (draft bid sheet)",
    plain: "Start each vendor's bid: a draft bid sheet for the round.",
    expected: "A draft bid sheet comes back (200) for the round, owned by the vendor who logged in, for the invited company.",
    anchor: "4B.7",
    part: "vendor",
    kind: "step",
    mode: "rfp",
    needs: ["vbLoggedIn"],
  },
  async (t) => {
    for (const v of vendors(t.state)) {
      const p = tag(t.state, v);
      const res = await asVendor(t.api, v.token!, "$VENDOR_TOKEN", "POST", "/api/template_responses", {
        body: { item_uuid: t.state.bidTrade, item_type: "TradeRequest", company_uuid: v.uuid },
      });
      t.basic(res, { status: 200, schema: "templateResponse", critical: true });
      const b = res.json;
      t.check(`${p}a draft bid sheet`, () => expect(b.status).toBe("draft"));
      t.check(`${p}for this round`, () => {
        expect(b.item_uuid).toBe(t.state.bidTrade);
        expect(b.item_type).toBe("TradeRequest");
      });
      t.check(`${p}owned by the vendor who logged in`, () => expect(b.user_uuid).toBe(v.user));
      t.check(`${p}for the invited company`, () => expect(b.company_uuid).toBe(v.uuid));
      v.sheet = b.uuid;
    }
    t.actual(`Draft bid sheet(s): ${vendors(t.state).map((v) => `${v.name} → ${v.sheet}`).join("; ")}.`);
  },
);

rfpCase(
  {
    id: "4B.8",
    title: "Vendor — PUT create_page_responses (per form)",
    plain: "Fill in every form of each vendor's bid, one page of answers at a time.",
    expected: "Every form's answers are saved (200, success: true).",
    anchor: "4B.8",
    part: "vendor",
    kind: "step",
    mode: "rfp",
    needs: ["vbLoggedIn"],
  },
  async (t) => {
    for (const [n, v] of vendors(t.state).entries()) {
      v.sent = {};
      for (const f of v.forms ?? []) {
        const body = vbPageBody(t.state, f, v, n);
        v.sent[f.page_uuid] = body.page_responses[f.page_uuid];
        const res = await asVendor(t.api, v.token!, "$VENDOR_TOKEN", "PUT", `/api/template_responses/${q(v.sheet!)}/create_page_responses`, { body });
        t.basic(res, { status: 200, schema: "success", critical: true });
        t.critical(`${tag(t.state, v)}"${f.name}" saved`, () => expect(res.json.success).toBe(true));
      }
    }
    t.actual(`Answered ${vendors(t.state).map((v) => `${(v.forms ?? []).length} form(s) for ${v.name}`).join("; ")}.`);
  },
);

rfpCase(
  {
    id: "4B.9",
    title: "Vendor — PATCH submit bid (status active)",
    plain: "Submit each vendor's bid.",
    expected: "Each bid sheet comes back active (200) — submitted — for the same sheet and company.",
    anchor: "4B.9",
    part: "vendor",
    kind: "step",
    mode: "rfp",
    needs: ["vbLoggedIn"],
  },
  async (t) => {
    for (const v of vendors(t.state)) {
      const p = tag(t.state, v);
      const res = await asVendor(t.api, v.token!, "$VENDOR_TOKEN", "PATCH", `/api/template_responses/${q(v.sheet!)}`, {
        body: { status: "active", item_uuid: t.state.bidTrade, item_type: "TradeRequest", company_uuid: v.uuid },
      });
      t.basic(res, { status: 200, schema: "templateResponse", critical: true });
      t.critical(`${p}the bid is submitted (active)`, () => expect(res.json.status).toBe("active"));
      t.check(`${p}the same bid sheet`, () => expect(res.json.uuid).toBe(v.sheet));
      t.check(`${p}the same company`, () => expect(res.json.company_uuid).toBe(v.uuid));
      v.submitted = true;
    }
    t.state.vbSubmitted = vendors(t.state).every((v) => v.submitted);
    t.actual(`Submitted: ${vendors(t.state).map((v) => v.name).join(", ")}.`);
  },
);

// ── 4B.7q–4B.9q: the RFQ price bid ───────────────────────────────────────

rfpCase(
  {
    id: "4B.7q",
    title: "RFQ — POST v1/bids (create price bid)",
    plain: "Start each vendor's price bid on the RFQ, in the account's currency.",
    expected: "A bid id comes back (200) for each vendor.",
    anchor: "4B.7q",
    part: "vendor",
    kind: "step",
    mode: "rfq",
    needs: ["vbLoggedIn"],
  },
  async (t) => {
    const code = cfgStr("bid_currency_code");
    for (const v of vendors(t.state)) {
      const res = await asVendor(t.api, v.token!, "$VENDOR_TOKEN", "POST", "/api/v1/bids", {
        body: { trade_request_uuid: t.state.bidTrade, company_uuid: v.uuid, currency_preference: CURRENCIES[code] || { code }, broker_company_uuid: false },
      });
      t.basic(res, { status: 200, schema: "bidCreate", critical: true });
      t.critical(`${tag(t.state, v)}a bid id came back`, () => expect(typeof res.json.bid_uuid === "string" && res.json.bid_uuid.length > 0).toBe(true));
      v.bid = res.json.bid_uuid;
      v.sheet = res.json.bid_uuid;
    }
    t.actual(`Price bid(s) started: ${vendors(t.state).map((v) => `${v.name} → ${v.bid}`).join("; ")}.`);
  },
);

rfpCase(
  {
    id: "4B.8q",
    title: "RFQ — POST create_bid_products (price, qty, GST per line item)",
    plain: "Price every line item of each vendor's bid: price per unit, the quantity offered, and GST. Each later vendor bids a little higher, so the first is L1.",
    expected: "Each vendor's priced rows are saved (200, success: true).",
    anchor: "4B.8q",
    part: "vendor",
    kind: "step",
    mode: "rfq",
    needs: ["vbLoggedIn"],
  },
  async (t) => {
    for (const [n, v] of vendors(t.state).entries()) {
      const r = vbRfqRows(v.rfqRows ?? [], v.rfqPad ?? {}, n);
      v.plan = r.plan;
      v.gross = r.gross;
      const res = await asVendor(t.api, v.token!, "$VENDOR_TOKEN", "POST", `/api/v1/bids/${q(v.bid!)}/create_bid_products`, { body: bidProductsBody(t.state, v.uuid, r.rows) });
      t.basic(res, { status: 200, schema: "success", critical: true });
      t.critical(`${tag(t.state, v)}the priced rows are saved`, () => expect(res.json.success).toBe(true));
    }
    t.actual(
      vendors(t.state)
        .map((v) => `${v.name}: ${(v.plan ?? []).map((e) => `${e.name} ${e.qty} × ${e.price}${e.gst != null ? ` +${e.gst}%` : ""} = ${e.total}`).join(", ")} — gross ${v.gross}`)
        .join("; ") + ".",
    );
  },
);

rfpCase(
  {
    id: "4B.9q",
    title: "RFQ — PATCH v1/bids/:bid (submit, gross_total)",
    plain: "Submit each vendor's price bid with its gross total.",
    expected: "Each bid is submitted (200, success: true).",
    anchor: "4B.9q",
    part: "vendor",
    kind: "step",
    mode: "rfq",
    needs: ["vbLoggedIn"],
  },
  async (t) => {
    for (const v of vendors(t.state)) {
      const res = await asVendor(t.api, v.token!, "$VENDOR_TOKEN", "PATCH", `/api/v1/bids/${q(v.bid!)}`, { body: bidSubmitBody(t.state, v.uuid, v.gross!) });
      t.basic(res, { status: 200, schema: "success", critical: true });
      t.critical(`${tag(t.state, v)}the RFQ bid is submitted`, () => expect(res.json.success).toBe(true));
      v.submitted = true;
    }
    t.state.vbSubmitted = vendors(t.state).every((v) => v.submitted);
    t.actual(`Submitted: ${vendors(t.state).map((v) => `${v.name} (gross ${v.gross})`).join(", ")}.`);
  },
);

rfpCase(
  {
    id: "4B.10",
    title: "Vendor — GET trade (post-bid)",
    plain: "Open the round again as each vendor and check its own bid is there, active and not a surrogate bid — and on an RFQ, every price, quantity, GST, line total and the gross total.",
    expected: "The round (200) shows the vendor's own bid — active, editable while live, placed by the vendor, no revisions.",
    anchor: "4B.10",
    part: "vendor",
    kind: "step",
    needs: ["vbSubmitted"],
  },
  async (t) => {
    for (const v of vendors(t.state)) {
      const p = tag(t.state, v);
      const res = await asVendor(t.api, v.token!, "$VENDOR_TOKEN", "GET", `/api/trade/${q(t.state.bidTrade!)}?response_type=template&additional_fields=order_details`);
      if (t.state.bidRfx === "rfq") {
        if (!t.basic(res, { status: 200, sla: "heavy", schema: "vendorTradeRfq" })) continue;
        const b = res.json;
        const bp = (b.participants || {})[v.bid!];
        t.check(`${p}the round's bid count went up`, () => expect(b.bid_count).toBeGreaterThanOrEqual((v.tradeBidCount ?? 0) + 1));
        t.check(`${p}its own bid is visible`, () => expect(bp, JSON.stringify(Object.keys(b.participants || {}))).toBeTruthy());
        if (bp) {
          t.check(`${p}the bid is active`, () => expect(bp.status).toBe("active"));
          t.check(`${p}the bid is the vendor's, placed by the vendor who logged in`, () => {
            expect(bp.company.uuid).toBe(v.uuid);
            expect(bp.user.uuid).toBe(v.user);
          });
          t.check(`${p}a real vendor bid, not a surrogate one`, () => {
            expect(bp.bid_config.is_surrogate_bid).toBe(false);
            expect(bp.bid_config.is_my_bid).toBe(true);
          });
          t.check(`${p}not a fast bid`, () => {
            if (bp.bid_config.is_fast_bid !== undefined) expect(bp.bid_config.is_fast_bid).toBe(false);
          });
          t.check(`${p}no revisions or rejections`, () => {
            expect(bp.revised_bids || []).toEqual([]);
            expect(bp.rejected_bids || []).toEqual([]);
          });
        }
        vbRfqCheckRows(t, b, v, p);
        continue;
      }
      if (!t.basic(res, { status: 200, sla: "heavy", schema: "vendorTrade" })) continue;
      const b = res.json;
      const bp = (b.participants || {})[v.sheet!];
      // Each vendor's own count was read before any of this run's vendors bid.
      t.check(`${p}the round's bid count went up`, () => expect(b.bid_count).toBeGreaterThanOrEqual((v.tradeBidCount ?? 0) + 1));
      t.check(`${p}its own bid is visible`, () => expect(bp, JSON.stringify(Object.keys(b.participants || {}))).toBeTruthy());
      if (!bp) continue;
      t.check(`${p}the bid is the vendor's company`, () => expect(bp.company.uuid).toBe(v.uuid));
      t.check(`${p}placed by the vendor who logged in`, () => expect(bp.user.uuid).toBe(v.user));
      t.check(`${p}active, not a surrogate bid`, () => {
        expect(bp.status).toBe("active");
        expect(bp.bid_config.is_surrogate_bid).toBe(false);
        expect(bp.bid_config.is_my_bid).toBe(true);
      });
      t.check(`${p}editable while the event is live`, () => expect(bp.bid_config.is_allowed_to_edit_bid).toBe(true));
      t.check(`${p}no revisions yet`, () => expect(bp.revised_bids).toEqual([]));
    }
  },
);

rfpCase(
  {
    id: "4B.11",
    title: "Vendor — GET quote_details",
    plain: "Open each vendor's bid as the vendor and check every answer was stored exactly as sent.",
    expected: "Each quote (200) is the vendor's own real bid, one response per form, every answer as sent.",
    anchor: "4B.11",
    part: "vendor",
    kind: "step",
    mode: "rfp",
    needs: ["vbSubmitted"],
  },
  async (t) => {
    for (const v of vendors(t.state)) {
      const res = await asVendor(t.api, v.token!, "$VENDOR_TOKEN", "GET", `/api/v1/trade/${q(t.state.bidTrade!)}/quote_details/${q(v.sheet!)}`);
      if (t.basic(res, { status: 200, schema: "quoteDetails" })) vbCheckQuote(t, res.json, v, "vendor");
    }
  },
);

rfpCase(
  {
    id: "4B.12",
    title: "Vendor — GET event group (post-bid)",
    plain: "Open the event again as each vendor and check it now shows the bid placed.",
    expected: "The event (200) shows, for each vendor, its bid placed.",
    anchor: "4B.12",
    part: "vendor",
    kind: "step",
    needs: ["vbSubmitted"],
  },
  async (t) => {
    for (const v of vendors(t.state)) {
      const p = tag(t.state, v);
      const res = await asVendor(t.api, v.token!, "$VENDOR_TOKEN", "GET", `/api/event_groups/${q(t.state.bidEg!)}`);
      if (!t.basic(res, { status: 200, sla: "heavy", schema: "vendorEventGroup" })) continue;
      const st = (res.json.stages || []).find((s: any) => s.uuid === t.state.bidTrade);
      t.check(`${p}the vendor's bid shows as placed`, () => expect(st.is_bid_placed).toBe(true));
      t.check(`${p}the round shows a bid placed`, () => expect(st.is_any_bid_placed).toBe(true));
    }
  },
);

// ── 4B.13–16: the buyer sees the bids ────────────────────────────────────

rfpCase(
  {
    id: "4B.13",
    title: "Buyer — GET stage schema (sees vendor bids)",
    plain: "As the buyer, read the round and check every vendor bid is listed with its bid sheet.",
    expected: "The round (200) lists each vendor's bid with the same bid sheet, and the bid count went up by the new bids.",
    anchor: "4B.13",
    part: "vendor",
    kind: "step",
    needs: ["vbSubmitted"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/v1/trade/${q(t.state.bidTrade!)}/schema?response_type=template&additional_fields=order_details`);
    if (!t.basic(res, { status: 200, schema: t.state.bidRfx === "rfq" ? "rfqStage" : "stageSchema" })) return;
    const b = res.json;
    for (const v of vendors(t.state)) {
      const p = (b.participants_data || []).find((x: any) => x.key === v.uuid);
      t.check(`The buyer sees ${v.name}'s bid`, () => expect(p).toBeTruthy());
      if (p) t.check(`${v.name}'s bid sheet is the one submitted`, () => expect(p.sheet_uuid).toBe(v.sheet));
    }
    const newBids = vendors(t.state).filter((v) => !(t.state.bidAlready ?? []).includes(v.uuid)).length;
    t.check(`bid_count = ${t.state.bidStage!.total_bids} + ${newBids}`, () => expect(b.bid_count).toBe(t.state.bidStage!.total_bids + newBids));
    t.state.vbPostBidCount = b.bid_count;
    t.actual(`The buyer sees ${b.bid_count} bid(s) on the round, including ${vendors(t.state).map((v) => v.name).join(", ")}.`);
  },
);

rfpCase(
  {
    id: "4B.14",
    title: "Buyer — GET quote_details (first vendor bid)",
    plain: "As the buyer, open the first vendor's bid and check it is the vendor's own, not the buyer's.",
    expected: "The quote (200) is a real vendor bid, placed by the vendor's user, not the buyer.",
    anchor: "4B.14",
    part: "vendor",
    kind: "step",
    needs: ["vbSubmitted"],
  },
  async (t) => {
    const v = vendors(t.state)[0];
    const res = await t.api.call("GET", `/api/v1/trade/${q(t.state.bidTrade!)}/quote_details/${q(v.sheet!)}`);
    if (t.state.bidRfx === "rfq") {
      if (!t.basic(res, { status: 200, schema: "rfqQuote" })) return;
      const b = res.json;
      t.check("Buyer view: a real vendor bid, not a surrogate one", () => {
        expect(b.participants.bid_config.is_surrogate_bid).toBe(false);
        expect(b.participants.company.uuid).toBe(v.uuid);
      });
      const rows = b.inline_data[v.uuid] || [];
      for (const e of v.plan ?? []) {
        const r = rows.find((x: any) => x.product.event_group_line_item_uuid === e.egli);
        t.check(`Buyer view — ${e.name}: price ${e.price}, quantity ${e.qty}`, () => {
          expect(Number(r.price.value)).toBe(e.price);
          expect(Number(r.participant_quantity.value)).toBe(e.qty);
        });
      }
      const g = ((b.global_data || {})[v.uuid] || {}).gross_total;
      if (g) t.check(`Buyer view: gross total ${v.gross}`, () => expect(round2(g.value)).toBe(v.gross));
      t.actual(`The buyer sees ${v.name}'s price bid, gross ${v.gross}.`);
      return;
    }
    if (!t.basic(res, { status: 200, schema: "quoteDetails" })) return;
    const b = res.json;
    t.check("Buyer view: a real vendor bid, not a surrogate one", () => {
      expect(b.participants.bid_config.is_surrogate_bid).toBe(false);
      expect(b.participants.company.uuid).toBe(v.uuid);
    });
    t.check("Buyer view: not placed by the buyer", () => expect(b.participants.user.uuid).not.toBe(t.state.currentUserUuid || "__none__"));
    t.check("Buyer view: the answers are filed under the vendor", () => expect(Object.keys(b.data)).toContain(v.uuid));
    vbCheckQuote(t, b, v, "buyer");
  },
);

rfpCase(
  {
    id: "4B.15",
    title: "Buyer — GET bidders_delivery_stats",
    plain: "As the buyer, check every vendor that bid moved to \"bid placed\".",
    expected: "Every vendor bid is in bid placed; bid placed + not placed = invited.",
    anchor: "4B.15",
    part: "vendor",
    kind: "step",
    needs: ["vbSubmitted"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/trade/${q(t.state.bidTrade!)}/bidders_delivery_stats`);
    if (!t.basic(res, { status: 200, schema: "bidderStats" })) return;
    const b = res.json;
    const placed = uniq(b.bid_placed.map((x: any) => x.user.company_uuid)) as string[];
    t.check("Every vendor that bid is in \"bid placed\"", () => vendors(t.state).forEach((v) => expect(placed, v.name).toContain(v.uuid)));
    t.check("bid placed + not placed = invited", () => expect(b.bid_placed.length + b.bid_not_placed.length).toBe(b.invited.length));
  },
);

rfpCase(
  {
    id: "4B.16",
    title: "Buyer — GET event group + Summary",
    plain: "As the buyer, read the event and check its bid counts went up by exactly the new bids.",
    expected: "The round is still active; total bids and active participants went up by the new bids.",
    anchor: "4B.16",
    part: "vendor",
    kind: "step",
    needs: ["vbSubmitted"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/event_groups/${q(t.state.bidEg!)}`);
    if (!t.basic(res, { status: 200, sla: "heavy", schema: "eventGroup" })) return;
    const st = (res.json.stages || []).find((s: any) => s.uuid === t.state.bidTrade);
    const base = t.state.bidStage!;
    const newBids = vendors(t.state).filter((v) => !(t.state.bidAlready ?? []).includes(v.uuid)).length;
    t.check(`Total bids = ${base.total_bids} + ${newBids}`, () => expect(st.participants_data.total_bids).toBe(base.total_bids + newBids));
    t.check(`Active participants = ${base.active_participants} + ${newBids}`, () => expect(st.participants_data.active_participants).toBe(base.active_participants + newBids));
    t.check("The round is still active", () => expect(st.status).toBe("active"));
    t.actual(`Vendor bid(s) on ${t.state.bidEg}: ${vendors(t.state).map((v) => `${v.name} → ${v.sheet}`).join("; ")}.`);
  },
);
