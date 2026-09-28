/**
 * 04 — SURROGATE BID (happy path), requests 4.1 to 4.15.
 *
 * The buyer answers the published RFP round on behalf of an invited vendor —
 * the vendor who cannot log in, or asked the buyer to submit for them. Runs
 * only when "Bidding → Surrogate bid" is ticked; otherwise a run stops at the
 * publish.
 *
 * It bids on the event this run published, or on sb_event_group_uuid when
 * that is set. The bidding window has to be open; this run's event opens as
 * soon as it is published.
 */
import { expect } from "@playwright/test";

import { cfgBool, cfgInt, cfgJson, cfgList, cfgStr } from "../src/config.js";
import { now, rfpCase, sameSet, uniq } from "../src/harness.js";
import { schemaErrors } from "../src/schemas.js";
import type { SbForm } from "../src/state.js";
import { buildSurrogateBody } from "../src/surrogate.js";

const q = encodeURIComponent;

rfpCase(
  {
    id: "4.1",
    title: "Pre-bid Event Group — GET event_groups/:uuid",
    plain: "Open the event to bid on and check it is live and its bidding window is open right now.",
    expected: "The event reads (200), is active, its RFP round is active, and bidding is open (started, not yet closed).",
    anchor: "4.1",
    part: "surrogate",
    kind: "step",
    mode: "rfp",
    modeNote: "the surrogate bid covers RFP rounds only — this run is an RFQ, and an RFQ price bid needs its own flow",
  },
  async (t) => {
    const errs: string[] = [];
    if (!((cfgInt("num_surrogate_bids") ?? 0) >= 1) && !cfgList("surrogate_vendor_uuids").length) errs.push("num_surrogate_bids must be at least 1");
    try {
      const o = cfgJson("surrogate_field_values");
      if (o && (typeof o !== "object" || Array.isArray(o))) errs.push("surrogate_field_values must be a JSON object");
    } catch (e) {
      errs.push((e as Error).message);
    }
    t.critical("The surrogate settings are valid", () => expect(errs, errs.join(" | ")).toEqual([]));
    const eg = cfgStr("sb_event_group_uuid") || (t.state.published ? t.state.eventGroupUuid : "");
    if (!eg) t.skip("there is no published event to bid on — the publish flow did not publish one, and sb_event_group_uuid is not set");
    t.state.sbEg = eg;

    const res = await t.api.call("GET", `/api/event_groups/${q(eg!)}`);
    t.basic(res, { status: 200, sla: "heavy", schema: "eventGroup", critical: true });
    const b = res.json;
    t.critical("The event is published (active)", () => expect(b.status).toBe("active"));
    const wanted = cfgStr("sb_trade_uuid") || (eg === t.state.eventGroupUuid ? t.state.tradeUuid : "") || b.current_stage_uuid;
    const st = (b.stages || []).find((s: any) => s.uuid === wanted);
    t.critical(`The round ${wanted} belongs to the event`, () => expect(st, `rounds: ${(b.stages || []).map((s: any) => s.uuid).join(", ")}`).toBeTruthy());
    t.critical("The round is active", () => expect(st.status).toBe("active"));
    t.check("The round is an RFP or RFQ", () => expect(["rfp", "rfq"]).toContain(st.rfx_mode));
    if (!cfgBool("surrogate_skip_window_check")) {
      const n = now();
      t.critical("Bidding is open now (started, not yet closed)", () => {
        expect(st.starting_from, "the round has not started yet").toBeLessThanOrEqual(n + 5);
        expect(st.ending_at, `bidding closed at ${new Date(st.ending_at * 1000).toISOString()}`).toBeGreaterThan(n);
      });
    }
    t.state.sbTrade = st.uuid;
    t.state.sbBuyerCompany = b.company.uuid;
    t.state.sbUser = b.user_details.uuid;
    t.state.sbTiming = { start: st.starting_from, end: st.ending_at, extra: st.extra_closing_time };
    t.state.sbBaseline = {
      total_bids: st.participants_data.total_bids,
      active_participants: st.participants_data.active_participants,
      total_participants: st.participants_data.total_participants,
      revised_bids: st.participants_data.revised_bids,
    };
    t.actual(`“${b.title}” is live; round ${st.ref_id} is open until ${new Date(st.ending_at * 1000).toISOString().slice(11, 16)} UTC with ${st.participants_data.total_bids} bid(s) so far.`);
  },
);

rfpCase(
  {
    id: "4.2",
    title: "Pre-bid Stage Schema — GET schema",
    plain: "Read the round's forms: every question a bid has to answer, and which are required.",
    expected: "The forms come back (200), each with exactly one page, at least one line-item form, and every required dropdown has options.",
    anchor: "4.2",
    part: "surrogate",
    kind: "step",
    needs: ["sbTrade"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/v1/trade/${q(t.state.sbTrade!)}/schema?response_type=template&additional_fields=order_details`);
    t.basic(res, { status: 200, schema: "stageSchema", critical: true });
    const b = res.json;
    t.check("It is the round being bid on", () => expect(b.uuid).toBe(t.state.sbTrade));
    t.check("It belongs to the event", () => expect(b.event_group_uuid).toBe(t.state.sbEg));
    t.check("The round is active", () => expect(b.status).toBe("active"));
    t.check("Reply matches the participantsList schema", () => {
      const errs = schemaErrors("participantsList", b);
      expect(errs, errs ?? "").toBeNull();
    });
    t.check("bid_count equals the number of bidders listed", () => expect(b.bid_count).toBe((b.participants_data || []).length));
    const forms: SbForm[] = [];
    const errs: string[] = [];
    for (const f of b.sheets.forms) {
      if (!f.page_uuids || f.page_uuids.length !== 1) errs.push(`${f.name} has ${(f.page_uuids || []).length} pages`);
      const headers = f.page_response_headers
        .filter(
          (h: any) =>
            h.key_attribute !== "evaluation_score" &&
            (h.configuration || {}).mode_type !== "read" &&
            ((h.configuration || {}).field_type || "participant") === "participant",
        )
        .map((h: any) => ({
          key: h.key_attribute,
          name: h.name,
          input_type: h.input_type,
          required: !!(h.configuration || {}).is_required,
          description: h.description,
          options: (h.configuration || {}).cell_options || null,
        }));
      forms.push({ form_uuid: f.uuid, name: f.name, page_uuid: (f.page_uuids || [])[0], egli: f.egli_uuid || null, headers });
    }
    t.critical("Every form has exactly one page", () => expect(errs, errs.join(" | ")).toEqual([]));
    t.check("At least one line-item form", () => expect(forms.filter((f) => f.egli).length).toBeGreaterThan(0));
    t.check("Question keys are unique within each form", () =>
      forms.forEach((f) => {
        const k = f.headers.map((h) => h.key);
        expect(uniq(k).length, f.name).toBe(k.length);
      }),
    );
    t.check("Every required dropdown has options to pick from", () =>
      forms.forEach((f) =>
        f.headers.filter((h) => h.required && h.input_type === "dropdown").forEach((h) => expect((h.options || []).length, `${f.name}/${h.name}`).toBeGreaterThan(0)),
      ),
    );
    t.state.sbForms = forms;
    t.state.sbBaseline = { ...t.state.sbBaseline!, bid_count: b.bid_count, already_bid: (b.participants_data || []).map((p: any) => p.key) };
    t.actual(`${forms.length} form(s) to answer: ${forms.map((f) => `${f.name} (${f.headers.length} question${f.headers.length === 1 ? "" : "s"})`).join("; ")}.`);
  },
);

rfpCase(
  {
    id: "4.3",
    title: "Eligible Bidders — GET audience_for_product (show_bidders)",
    plain: "List the vendors who can bid on the round, and pick the one(s) to bid for.",
    expected: "The eligible bidders come back (200) — exactly the vendors invited — and enough of them have not bid yet.",
    anchor: "4.3",
    part: "surrogate",
    kind: "step",
    needs: ["sbForms"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/companies/audience_for_product?&trade_request_uuid=${q(t.state.sbTrade!)}&show_bidders=true`);
    t.basic(res, { status: 200, schema: "audienceBidders", critical: true });
    const b = res.json;
    t.check("Eligible bidders are unique", () => {
      const u = b.companies.map((c: any) => c.uuid);
      expect(uniq(u).length).toBe(u.length);
    });
    t.check("Every eligible bidder is a selling firm", () =>
      b.companies.forEach((c: any) => expect(["selling_firm", "vendor", "seller"], c.name).toContain(c.category)),
    );
    if (t.state.sbEg === t.state.eventGroupUuid) {
      const invited = (t.state.vendors ?? []).map((v) => v.uuid);
      t.check("The eligible bidders are exactly the vendors invited", () => expect(sameSet(b.companies.map((c: any) => c.uuid), invited)).toBe(true));
    }
    const base = t.state.sbBaseline!;
    const already = base.already_bid ?? [];
    const given = cfgList("surrogate_vendor_uuids");
    let chosen: any[];
    if (given.length) {
      const unknown = given.filter((g) => !b.companies.find((c: any) => c.uuid === g));
      t.critical("The vendors named are invited to this event", () => expect(unknown, `not invited: ${unknown.join(", ")}`).toEqual([]));
      chosen = given.map((g) => b.companies.find((c: any) => c.uuid === g)).filter(Boolean);
      const again = chosen.filter((c) => already.includes(c.uuid));
      if (again.length) t.note(`Already bid, so this is a revision: ${again.map((c) => c.name).join(", ")}.`);
    } else {
      const n = cfgInt("num_surrogate_bids")!;
      const pool = b.companies.filter((c: any) => c.status === "active" && !c.is_vendor_tna && !already.includes(c.uuid));
      t.critical(`${n} invited vendor(s) without a bid yet`, () => expect(pool.length, `only ${pool.length} have not bid yet`).toBeGreaterThanOrEqual(n));
      chosen = pool.slice(0, n);
    }
    t.state.sbVendors = chosen.map((c) => ({ uuid: c.uuid, name: c.name }));
    t.state.sbEligible = b.companies.map((c: any) => ({ uuid: c.uuid, name: c.name }));
    t.state.sbSent = {};
    t.state.sbResults = {};
    t.actual(`${b.companies.length} vendor(s) can bid; bidding for ${chosen.map((c) => c.name).join(", ")}.`);
  },
);

rfpCase(
  {
    id: "4.4",
    title: "Pre-bid Bidder Stats — GET bidders_delivery_stats",
    plain: "Read who has and hasn't bid before placing the bid.",
    expected: "The stats come back (200); bid placed + not placed adds up to everyone invited, and the chosen vendor has invited users.",
    anchor: "4.4",
    part: "surrogate",
    kind: "step",
    needs: ["sbVendors"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/trade/${q(t.state.sbTrade!)}/bidders_delivery_stats`);
    if (!t.basic(res, { status: 200, schema: "bidderStats" })) return;
    const b = res.json;
    t.state.sbBaseline = {
      ...t.state.sbBaseline!,
      bid_placed_companies: uniq(b.bid_placed.map((x: any) => x.user.company_uuid)),
      invited_users: b.invited.length,
    };
    t.check("bid placed + not placed = invited", () => expect(b.bid_placed.length + b.bid_not_placed.length).toBe(b.invited.length));
    t.check("The chosen vendors have invited users", () =>
      (t.state.sbVendors ?? []).forEach((v) => expect(b.invited.map((x: any) => x.user.company_uuid), v.name).toContain(v.uuid)),
    );
    t.actual(`${b.invited.length} invited user(s); ${b.bid_placed.length} have bid, ${b.bid_not_placed.length} have not.`);
  },
);

rfpCase(
  {
    id: "4.5",
    title: "Place Surrogate Bid — POST create_surrogate_response",
    plain: "Place the technical bid on the vendor's behalf, answering every question on every form.",
    expected: "Each bid is accepted (200) with success: true.",
    anchor: "4.5",
    part: "surrogate",
    kind: "step",
    needs: ["sbVendors"],
  },
  async (t) => {
    const vendors = t.state.sbVendors!;
    let placed = 0;
    for (const [i, v] of vendors.entries()) {
      const body = buildSurrogateBody(t.state, v, i);
      t.state.sbSent![v.uuid] = body;
      const res = await t.api.call("POST", "/api/template_responses/create_surrogate_response", { body });
      const tag = vendors.length > 1 ? ` for ${v.name}` : "";
      t.basic(res, { status: 200, schema: "success", critical: true });
      t.critical(`success is true${tag}`, () => expect(res.json?.success).toBe(true));
      placed += 1;
    }
    t.state.sbPlaced = placed === vendors.length;
    t.actual(`Placed ${placed} surrogate bid(s): ${vendors.map((v) => v.name).join(", ")}.`);
  },
);

rfpCase(
  {
    id: "4.6",
    title: "Post-bid Stage Schema — GET schema",
    plain: "Read the round again and check the vendor now shows as an active bidder, inside the window, with a quote.",
    expected: "Each vendor is listed as an active, editable bidder with a quote id, bid_count went up by the new bids, and line-item forms move to evaluation.",
    anchor: "4.6",
    part: "surrogate",
    kind: "step",
    needs: ["sbPlaced"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/v1/trade/${q(t.state.sbTrade!)}/schema?response_type=template&additional_fields=order_details`);
    t.basic(res, { status: 200, schema: "stageSchema", critical: true });
    const b = res.json;
    const base = t.state.sbBaseline!;
    const already = base.already_bid ?? [];
    const tm = t.state.sbTiming!;
    for (const v of t.state.sbVendors!) {
      const p = (b.participants_data || []).find((x: any) => x.key === v.uuid);
      t.critical(`${v.name} is listed as a bidder`, () => expect(p, JSON.stringify((b.participants_data || []).map((x: any) => x.key))).toBeTruthy());
      t.check(`${v.name}: label is the vendor's name`, () => expect(p.label).toBe(v.name));
      t.check(`${v.name}: a vendor with an active bid`, () => {
        expect(p.type).toBe("vendor");
        expect(p.bid_status).toBe("active");
      });
      t.check(`${v.name}: has a quote id`, () => expect(typeof p.sheet_uuid === "string" && p.sheet_uuid.length > 0).toBe(true));
      t.check(`${v.name}: bid time is inside the bidding window`, () => {
        expect(p.created_at).toBeGreaterThanOrEqual(tm.start - 5);
        if (!cfgBool("surrogate_skip_window_check")) expect(p.created_at).toBeLessThanOrEqual(tm.end);
      });
      t.check(`${v.name}: the bid can still be edited while the event is live`, () => expect(p.is_bid_allowed_to_edit).toBe(true));
      t.check(`${v.name}: not marked TNA`, () => expect(p.is_vendor_tna).toBe(false));
      t.state.sbResults![v.uuid] = p.sheet_uuid;
    }
    const newBids = t.state.sbVendors!.filter((v) => !already.includes(v.uuid)).length;
    t.check(`bid_count is ${(base.bid_count ?? 0) + newBids} (before + new bids)`, () => expect(b.bid_count).toBe((base.bid_count ?? 0) + newBids));
    t.check("Line-item forms move to evaluation once a bid exists", () =>
      b.sheets.forms.filter((f: any) => f.egli_uuid).forEach((f: any) => expect(["draft", "pending", "in_progress"], f.name).toContain(f.evaluation_status)),
    );
    t.state.sbPostBidCount = b.bid_count;
    t.actual(`${b.bid_count} bid(s) on the round now; ${t.state.sbVendors!.map((v) => `${v.name} → quote ${t.state.sbResults![v.uuid]}`).join("; ")}.`);
  },
);

rfpCase(
  {
    id: "4.7",
    title: "Quote Details — GET quote_details/:sheet",
    plain: "Open each bid and check every answer was stored exactly as sent, marked as a surrogate bid placed by the buyer.",
    expected: "Each quote (200) belongs to the vendor, was placed by the buyer as a surrogate bid, has one response per form, and every answer matches what was sent.",
    anchor: "4.7",
    part: "surrogate",
    kind: "step",
    needs: ["sbPlaced", "sbPostBidCount"],
  },
  async (t) => {
    const forms = t.state.sbForms!;
    for (const v of t.state.sbVendors!) {
      const sheet = t.state.sbResults![v.uuid];
      const res = await t.api.call("GET", `/api/v1/trade/${q(t.state.sbTrade!)}/quote_details/${q(sheet)}`);
      if (!t.basic(res, { status: 200, schema: "quoteDetails" })) continue;
      const b = res.json;
      const sent = t.state.sbSent![v.uuid];
      const pre = t.state.sbVendors!.length > 1 ? `${v.name}: ` : "";
      t.check(`${pre}It is the quote asked for`, () => expect(b.sheet_uuid).toBe(sheet));
      t.check(`${pre}Placed in the last 10 minutes`, () => expect(Math.abs(b.placed_at - now())).toBeLessThan(600));
      t.check(`${pre}The bid is ${v.name}'s`, () => {
        expect(b.participants.company.uuid).toBe(v.uuid);
        expect(b.participants.company.name).toBe(v.name);
      });
      t.check(`${pre}Placed by the buyer (surrogate)`, () => expect(b.participants.user.uuid).toBe(t.state.sbUser));
      t.check(`${pre}Marked as a surrogate bid`, () => expect(b.participants.bid_config.is_surrogate_bid).toBe(true));
      t.check(`${pre}Counted as the buyer's own bid`, () => expect(b.participants.bid_config.is_my_bid).toBe(true));
      t.check(`${pre}Active, and not an unregistered bid`, () => {
        expect(b.participants.status).toBe("active");
        expect(b.participants.is_unregistered_bid).toBe(false);
      });
      t.check(`${pre}No revisions on a first bid`, () => expect(b.participants.revised_bids).toEqual([]));
      t.check(`${pre}Surrogate remarks stored`, () => {
        const r = b.participants.surrogate_remarks || {};
        const want = cfgStr("surrogate_remarks");
        if (want) expect(r.remarks).toBe(want);
        else expect([undefined, null, ""]).toContain(r.remarks);
      });
      const rows = b.data[v.uuid] || [];
      t.check(`${pre}Answers are filed under the vendor`, () => expect(Object.keys(b.data)).toContain(v.uuid));
      t.check(`${pre}One response per form (${forms.length})`, () => expect(rows).toHaveLength(forms.length));
      t.check(`${pre}Response ids are unique`, () => {
        const u = rows.map((r: any) => r.form_response_uuid);
        expect(uniq(u).length).toBe(u.length);
      });
      for (const f of forms) {
        const r = rows.find((x: any) => x.form_uuid === f.form_uuid);
        const tag = `${pre}${f.name}`;
        t.check(`${tag}: has a response`, () => expect(r).toBeTruthy());
        if (!r) continue;
        t.check(`${tag}: answers filed under its page`, () => expect(Array.isArray(r[f.page_uuid])).toBe(true));
        t.check(`${tag}: line item not regretted`, () => expect(r.is_egli_regretted).toBe(false));
        const got: any[] = r[f.page_uuid] || [];
        for (const s of sent.page_responses[f.page_uuid] || []) {
          const g = got.find((x) => x.key_attribute === s.key_attribute);
          const h = f.headers.find((x) => x.key === s.key_attribute) || { name: s.key_attribute };
          t.check(`${tag} / ${h.name}: stored exactly as sent`, () => {
            expect(g, `missing ${s.key_attribute}`).toBeTruthy();
            const want = Object.prototype.hasOwnProperty.call(s, "value") ? s.value : null;
            if (typeof want === "number") expect(Number(g.value)).toBe(want);
            else expect(g.value === undefined ? null : g.value).toEqual(want);
          });
        }
        t.check(`${tag}: nothing stored that was not asked`, () =>
          got.filter((x) => x.key_attribute !== "evaluation_score").forEach((x) => expect(f.headers.map((h) => h.key), x.key_attribute).toContain(x.key_attribute)),
        );
        t.check(`${tag}: evaluation score is empty (not evaluated yet)`, () => {
          const e = got.find((x) => x.key_attribute === "evaluation_score");
          if (e) expect(e.value).toBeNull();
        });
        t.check(`${tag}: required answers are not blank`, () =>
          f.headers.filter((h) => h.required).forEach((h) => {
            const g = got.find((x) => x.key_attribute === h.key);
            expect([null, undefined, ""], h.name).not.toContain(g && g.value);
          }),
        );
      }
    }
    t.actual(`Opened ${t.state.sbVendors!.length} quote(s); every answer checked against what was sent.`);
  },
);

rfpCase(
  {
    id: "4.8",
    title: "Post-bid Bidder Stats — GET bidders_delivery_stats",
    plain: "Check the vendor moved from \"not bid\" to \"bid placed\", and nobody else changed.",
    expected: "Bid placed = those who had bid before + the surrogate vendors; the invited list is unchanged.",
    anchor: "4.8",
    part: "surrogate",
    kind: "step",
    needs: ["sbPlaced"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/trade/${q(t.state.sbTrade!)}/bidders_delivery_stats`);
    if (!t.basic(res, { status: 200, schema: "bidderStats" })) return;
    const b = res.json;
    const base = t.state.sbBaseline!;
    const vendors = t.state.sbVendors!;
    const placed = uniq(b.bid_placed.map((x: any) => x.user.company_uuid)) as string[];
    const expected = uniq([...(base.bid_placed_companies ?? []), ...vendors.map((v) => v.uuid)]);
    t.check("Bid placed = before + the surrogate vendors", () => expect(sameSet(placed, expected), JSON.stringify(placed)).toBe(true));
    t.check("The surrogate vendors left \"not bid\"", () =>
      vendors.forEach((v) => expect(b.bid_not_placed.map((x: any) => x.user.company_uuid), v.name).not.toContain(v.uuid)),
    );
    t.check("bid placed + not placed = invited", () => expect(b.bid_placed.length + b.bid_not_placed.length).toBe(b.invited.length));
    t.check("The invited list did not change", () => expect(b.invited.length).toBe(base.invited_users));
    t.note(`total_active_bids = ${b.total_active_bids} (the HAR this was built from showed 0 after a surrogate bid).`);
    t.actual(`${b.bid_placed.length} user(s) now show a bid placed; ${b.bid_not_placed.length} still to bid.`);
  },
);

rfpCase(
  {
    id: "4.9",
    title: "Post-bid Event Group — GET event_groups/:uuid",
    plain: "Read the event again and check its bid counts went up by exactly the new bids, and nothing else moved.",
    expected: "The event and round are still active; total bids and active participants went up by the new bids; participants, revisions and timings unchanged.",
    anchor: "4.9",
    part: "surrogate",
    kind: "step",
    needs: ["sbPlaced"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/event_groups/${q(t.state.sbEg!)}`);
    if (!t.basic(res, { status: 200, sla: "heavy", schema: "eventGroup" })) return;
    const b = res.json;
    const st = (b.stages || []).find((s: any) => s.uuid === t.state.sbTrade);
    const base = t.state.sbBaseline!;
    const newBids = t.state.sbVendors!.filter((v) => !(base.already_bid ?? []).includes(v.uuid)).length;
    const tm = t.state.sbTiming!;
    t.check("The event is still active", () => expect(b.status).toBe("active"));
    t.check("The round is still active", () => expect(st?.status).toBe("active"));
    t.check(`Total bids = ${base.total_bids} + ${newBids}`, () => expect(st.participants_data.total_bids).toBe(base.total_bids + newBids));
    t.check(`Active participants = ${base.active_participants} + ${newBids}`, () =>
      expect(st.participants_data.active_participants).toBe(base.active_participants + newBids),
    );
    t.check("Total participants unchanged", () => expect(st.participants_data.total_participants).toBe(base.total_participants));
    t.check("Revised bids unchanged", () => expect(st.participants_data.revised_bids).toBe(base.revised_bids));
    t.check("Timings unchanged by bidding", () => {
      expect(st.starting_from).toBe(tm.start);
      expect(st.ending_at).toBe(tm.end);
      expect(st.extra_closing_time).toBe(tm.extra);
    });
    t.note(`is_any_bid_placed = ${st?.is_any_bid_placed} (the HAR showed false after a surrogate bid).`);
    t.actual(`The round shows ${st?.participants_data?.total_bids} bid(s) and ${st?.participants_data?.active_participants} active participant(s).`);
  },
);

const simpleRead = (id: string, title: string, plain: string, expected: string, path: (s: any) => string, schema: any, extra?: (t: any, res: any) => void, statuses?: number[]) =>
  rfpCase({ id, title, plain, expected, anchor: id, part: "surrogate", kind: "step", needs: ["sbPlaced"] }, async (t) => {
    const res = await t.api.call("GET", path(t.state));
    const ok = t.basic(res, { status: statuses ?? 200, schema, json: statuses ? res.status !== 204 : undefined });
    if (ok) extra?.(t, res);
  });

simpleRead(
  "4.10",
  "Approvals — GET get_approvals",
  "Check placing a surrogate bid did not start an approval.",
  "The approvals come back (200) as an empty list.",
  (s) => `/api/v1/trade/${q(s.sbTrade)}/get_approvals`,
  "approvals",
  (t, res) => t.check("No approval was created by the surrogate bid", () => expect(res.json).toEqual([])),
);
simpleRead(
  "4.11",
  "Viewing Stats — GET viewing_stats",
  "Read who has viewed the round.",
  "The viewing stats come back (200) with valid timestamps.",
  (s) => `/api/event_tracking/viewing_stats?item_type=TradeRequest&item_uuid=${q(s.sbTrade)}`,
  "viewingSeen",
  (t, res) => t.check("Every 'seen' time is in the past", () => res.json.seen.forEach((x: any) => expect(x.last_seen_at).toBeLessThanOrEqual(now() + 5))),
);
simpleRead(
  "4.12",
  "Unresolved Queries — GET get_unresolved_queries_count",
  "Read the count of open vendor queries on the round.",
  "The count comes back (200).",
  (s) => `/api/v1/chats/get_unresolved_queries_count?event_uuid=${q(s.sbTrade)}`,
  "objectAny",
);
simpleRead(
  "4.13",
  "Summary View Sheet — GET sheets/schema",
  "Open the event's summary sheet.",
  "The summary sheet comes back (200, or 204 when there is nothing to show).",
  (s) => `/api/sheets/schema?view_type=summary_view&event_group_uuid=${q(s.sbEg)}`,
  undefined,
  (t, res) => {
    if (res.status === 204) t.check("A 204 has an empty body", () => expect(res.text).toBe(""));
  },
  [200, 204],
);
simpleRead(
  "4.14",
  "Event Indicators — GET event_indicators",
  "Read the round's indicators after the bid.",
  "The indicators come back (200).",
  (s) => `/api/v1/trade/${q(s.sbTrade)}/event_indicators`,
  "eventIndicators",
);
simpleRead(
  "4.15",
  "Bidders after bid + Summary — GET audience_for_product",
  "Check the vendor is still an eligible bidder after bidding.",
  "The bidders come back (200) and still include every surrogate vendor.",
  (s) => `/api/companies/audience_for_product?&trade_request_uuid=${q(s.sbTrade)}&show_bidders=true`,
  "audienceBidders",
  (t, res) => {
    t.check("The surrogate vendors are still eligible bidders", () =>
      t.state.sbVendors.forEach((v: any) => expect(res.json.companies.map((c: any) => c.uuid)).toContain(v.uuid)),
    );
    t.actual(`Surrogate bid(s) on ${t.state.sbEg}: ${t.state.sbVendors.map((v: any) => `${v.name} → ${t.state.sbResults[v.uuid]}`).join("; ")}.`);
  },
);
