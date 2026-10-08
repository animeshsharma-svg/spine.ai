/**
 * 08 — VENDOR BID NEGATIVE & EDGE, requests 5B.1.1 to 5B.3.99.
 *
 * The vendor portal's login, its access rules, and the bid sheet — each with
 * one thing broken. A wrongly accepted bid would show up as an extra bidder on
 * the round; 5B.3.99 counts them.
 */
import { expect } from "@playwright/test";

import type { AuthMode } from "../src/api.js";
import { cfgStr } from "../src/config.js";
import { rfpCase, type CaseKind, type Ctx } from "../src/harness.js";
import type { RunState } from "../src/state.js";
import { asVendor, bidProductsBody, bidSubmitBody, CURRENCIES, round2, vbPageBody, vbRfqCheckRows, vbRfqRows, vendorAppToken, vendorSessionToken } from "../src/vendor.js";

const q = encodeURIComponent;
const FAKE = "WFhYWFhYWFg=";
const first = (s: RunState) => (s.vbVendors ?? [])[0];

interface Req {
  method: "GET" | "POST" | "PUT" | "PATCH";
  path: string;
  body?: unknown;
  raw?: string;
  /** vendor app token, a logged-in vendor, none, the buyer, or a given token */
  as: "app" | "vendor" | "none" | "buyer" | { token: string; shown: string };
  notApplicable?: string;
}

/**
 * A fresh session for the first vendor.
 *
 * Some refusals end the vendor's session on the server (every later call is
 * 401 "Authentication failed"), which turned the cases after them into tests of
 * a dead login. A case that needs a working vendor signs in again first.
 */
async function freshVendorLogin(t: Ctx) {
  const v = (t.state.vbVendors ?? [])[0];
  if (!v) return;
  await asVendor(t.api, vendorAppToken(), "$VENDOR_APP_TOKEN", "POST", "/api/v1/generate_otp", { body: { email: v.email } });
  const res = await asVendor(t.api, vendorAppToken(), "$VENDOR_APP_TOKEN", "POST", "/api/v1/verify_otp", {
    body: { email: v.email, otp: cfgStr("vendor_otp"), device_id: "neg-relogin", device_info: { browser: "Playwright", os: "API" } },
  });
  if (res.json?.access_token) v.token = vendorSessionToken(res.json.access_token);
}

function neg(n: {
  id: string;
  title: string;
  plain: string;
  anchor: string;
  kind?: CaseKind;
  mode?: "reject" | "graceful";
  codes?: number[];
  needs?: Array<keyof RunState>;
  req: (s: RunState) => Req;
  more?: (t: Ctx, res: Awaited<ReturnType<Ctx["api"]["call"]>>) => void;
  /** only for this kind of round: the bid-sheet cases are RFP, the price-bid cases RFQ */
  onlyFor?: "rfp" | "rfq";
}) {
  const mode = n.mode ?? "reject";
  rfpCase(
    {
      id: n.id,
      title: n.title,
      plain: n.plain,
      expected:
        mode === "reject"
          ? `The app refuses it${n.codes ? ` with ${n.codes.join(" or ")}` : " with a 4xx"} and says why — no server error.`
          : "No server error. Whatever the app does with it is recorded.",
      anchor: n.anchor,
      part: "vendor",
      kind: n.kind ?? (mode === "graceful" ? "edge" : "negative"),
      mode: n.onlyFor,
      needs: n.needs ?? ["vbSubmitted"],
    },
    async (t) => {
      const r = n.req(t.state);
      if (r.notApplicable) t.skip(r.notApplicable);
      // Signing in again never decides the case: its own request is the last call.
      if (r.as === "vendor") await freshVendorLogin(t);
      let auth: AuthMode | undefined;
      if (r.as === "app") auth = { token: vendorAppToken(), shown: "$VENDOR_APP_TOKEN" };
      else if (r.as === "vendor") auth = { token: first(t.state)!.token!, shown: "$VENDOR_TOKEN" };
      else if (r.as === "none") auth = "none";
      else if (r.as === "buyer") auth = "default";
      else auth = r.as;
      const vendorSide = r.as !== "buyer";
      const res = await t.api.call(r.method, r.path, {
        body: r.body,
        raw: r.raw,
        auth,
        appVersion: vendorSide ? cfgStr("vendor_app_version") : undefined,
        headers: vendorSide ? { "X-Proc-Client": "vendor" } : undefined,
      });
      t.negative(res, { mode, codes: n.codes, sla: "heavy" });
      n.more?.(t, res);
      t.actual(
        res.status >= 500
          ? `Server error ${res.status}: ${res.text.slice(0, 160) || "(empty body)"}`
          : res.status >= 400
            ? `Refused with ${res.status}: ${res.text.slice(0, 160) || "(empty body)"}`
            : `Accepted with ${res.status}: ${res.text.slice(0, 120)}`,
      );
    },
  );
}

const sheetBody = (s: RunState, extra: Record<string, unknown> = {}) => ({ item_uuid: s.bidTrade, item_type: "TradeRequest", company_uuid: first(s)?.uuid, ...extra });
const otherVendor = (s: RunState) => (s.bidList ?? []).find((v) => v.uuid !== first(s)?.uuid)?.uuid ?? FAKE;
/**
 * A valid page of answers with one thing broken — on the first of the
 * vendor's forms that has something to break (a required question, a
 * dropdown…), not only the first form.
 */
const pageReq = (s: RunState, mut: (b: any, f: any) => boolean | void, sheet?: string): Req => {
  const v = first(s)!;
  const forms = v.forms ?? [];
  if (!forms.length) return { method: "PUT", path: "", as: "vendor", notApplicable: "the vendor had no form to answer" };
  for (const f of forms) {
    const b: any = vbPageBody(s, f, v, 0);
    if (mut(b, f) === false) continue;
    return { method: "PUT", path: `/api/template_responses/${q(sheet ?? v.sheet!)}/create_page_responses`, body: b, as: "vendor" };
  }
  return { method: "PUT", path: "", as: "vendor", notApplicable: "none of the round's forms has what this case breaks (e.g. a required question or a dropdown)" };
};

// ── 5B.1 login ────────────────────────────────────────────────────────────
neg({
  id: "5B.1.1",
  title: "generate_otp unknown email → user does not exist",
  plain: "Ask for a login OTP for an email nobody has.",
  anchor: "4B.1",
  mode: "graceful",
  needs: ["vbVendors"],
  req: () => ({ method: "POST", path: "/api/v1/generate_otp", body: { email: `nobody.${Date.now()}@example.invalid` }, as: "app" }),
  more: (t, res) => {
    if (res.status === 200) t.check("It says no user exists for that email", () => expect(res.json.is_user_exist).toBe(false));
  },
});
neg({ id: "5B.1.2", title: "generate_otp invalid email format → 4xx", plain: 'Ask for a login OTP for "not-an-email".', anchor: "4B.1", needs: ["vbVendors"], req: () => ({ method: "POST", path: "/api/v1/generate_otp", body: { email: "not-an-email" }, as: "app" }) });
neg({ id: "5B.1.3", title: "generate_otp missing email → 4xx", plain: "Ask for a login OTP without an email.", anchor: "4B.1", needs: ["vbVendors"], req: () => ({ method: "POST", path: "/api/v1/generate_otp", body: {}, as: "app" }) });
neg({
  id: "5B.1.4",
  title: "generate_otp without app token → 401",
  plain: "Ask for a login OTP without the vendor app's own token.",
  anchor: "4B.1",
  kind: "security",
  codes: [401, 403],
  needs: ["vbVendors"],
  req: (s) => ({ method: "POST", path: "/api/v1/generate_otp", body: { email: first(s)?.email || "x@y.z" }, as: "none" }),
});
neg({
  id: "5B.1.5",
  title: "verify_otp wrong OTP → 4xx",
  plain: "Log a vendor in with the wrong OTP.",
  anchor: "4B.2",
  kind: "security",
  codes: [400, 401, 403, 422],
  needs: ["vbVendors"],
  req: (s) => ({ method: "POST", path: "/api/v1/verify_otp", body: { email: first(s)?.email, otp: "000001", device_id: "neg", device_info: {} }, as: "app" }),
  more: (t, res) => t.check("No session was issued", () => expect(res.json?.access_token).toBeUndefined()),
});
neg({ id: "5B.1.6", title: "verify_otp missing otp → 4xx", plain: "Log a vendor in without an OTP.", anchor: "4B.2", needs: ["vbVendors"], req: (s) => ({ method: "POST", path: "/api/v1/verify_otp", body: { email: first(s)?.email, device_id: "neg" }, as: "app" }) });
neg({
  id: "5B.1.7",
  title: "verify_otp OTP as number / wrong type → 4xx",
  plain: "Log a vendor in with the OTP sent as a list instead of text.",
  anchor: "4B.2",
  needs: ["vbVendors"],
  req: (s) => ({ method: "POST", path: "/api/v1/verify_otp", body: { email: first(s)?.email, otp: [cfgStr("vendor_otp")], device_id: "neg" }, as: "app" }),
});

// ── 5B.2 access ───────────────────────────────────────────────────────────
neg({ id: "5B.2.1", title: "Create bid sheet WITHOUT token → 401", plain: "Start a bid with no vendor login at all.", anchor: "4B.7", kind: "security", codes: [401, 403], req: (s) => ({ method: "POST", path: "/api/template_responses", body: sheetBody(s), as: "none" }) });
neg({
  id: "5B.2.2",
  title: "Create bid sheet with tampered vendor token → 401",
  plain: "Start a bid with a vendor's token that has been tampered with.",
  anchor: "4B.7",
  kind: "security",
  codes: [401, 403],
  req: (s) => ({ method: "POST", path: "/api/template_responses", body: sheetBody(s), as: { token: `${first(s)!.token}TAMPERED`, shown: "${VENDOR_TOKEN}TAMPERED" } }),
});
neg({
  id: "5B.2.3",
  title: "Vendor bids as ANOTHER invited company → 403/4xx",
  plain: "Log in as one vendor and try to start a bid as a different invited vendor.",
  anchor: "4B.7",
  kind: "security",
  codes: [400, 401, 403, 404, 422],
  req: (s) => ({ method: "POST", path: "/api/template_responses", body: sheetBody(s, { company_uuid: otherVendor(s) }), as: "vendor" }),
});
neg({
  id: "5B.2.4",
  title: "Vendor reads buyer-only audience → 403/404",
  plain: "As a vendor, try to read the event's whole invite list — which only the buyer may see.",
  anchor: "4B.4",
  kind: "security",
  codes: [401, 403, 404],
  req: (s) => ({ method: "GET", path: `/api/event_groups/${q(s.bidEg!)}/get_audience`, as: "vendor" }),
});
neg({
  id: "5B.2.5",
  title: "Vendor reads buyer stage schema (all bids) → 403/404",
  plain: "As a vendor, try to read the buyer's view of the round, which lists every vendor's bid.",
  anchor: "4B.5",
  kind: "security",
  mode: "graceful",
  req: (s) => ({ method: "GET", path: `/api/v1/trade/${q(s.bidTrade!)}/schema?response_type=template&additional_fields=order_details`, as: "vendor" }),
  more: (t, res) => {
    if (res.status === 200) {
      t.check("The vendor sees no other vendor's bid", () =>
        (res.json.participants_data || []).forEach((p: any) => expect(p.key, "another vendor's bid is visible").toBe(first(t.state)!.uuid)),
      );
    }
  },
});
neg({ id: "5B.2.6", title: "Vendor reads random quote → 404", plain: "As a vendor, open a quote that does not exist.", anchor: "4B.11", codes: [403, 404, 422, 400], req: (s) => ({ method: "GET", path: `/api/v1/trade/${q(s.bidTrade!)}/quote_details/${FAKE}`, as: "vendor" }) });
neg({
  id: "5B.2.7",
  title: "Vendor bid-sheet endpoint called with BUYER token (not surrogate API) → 4xx",
  plain: "Call the vendor's bid endpoint with the buyer's login — the buyer must use the surrogate bid instead.",
  anchor: "4B.7",
  kind: "security",
  codes: [400, 401, 403, 404, 422],
  req: (s) => ({ method: "POST", path: "/api/template_responses", body: sheetBody(s), as: "buyer" }),
});

// ── 5B.3 the bid sheet ────────────────────────────────────────────────────
neg({ id: "5B.3.1", onlyFor: "rfp", title: "Invalid trade uuid → 4xx", plain: "Start a bid on a round that does not exist.", anchor: "4B.7", req: (s) => ({ method: "POST", path: "/api/template_responses", body: sheetBody(s, { item_uuid: FAKE }), as: "vendor" }) });
neg({ id: "5B.3.2", onlyFor: "rfp", title: "Invalid item_type → 4xx", plain: 'Start a bid on an item of the type "Nope".', anchor: "4B.7", req: (s) => ({ method: "POST", path: "/api/template_responses", body: sheetBody(s, { item_type: "Nope" }), as: "vendor" }) });
neg({
  id: "5B.3.3", onlyFor: "rfp",
  title: "Missing company_uuid → 4xx",
  plain: "Start a bid without saying which company it is for.",
  anchor: "4B.7",
  req: (s) => {
    const b: any = sheetBody(s);
    delete b.company_uuid;
    return { method: "POST", path: "/api/template_responses", body: b, as: "vendor" };
  },
});
const reqField = (s: RunState, value: unknown) =>
  pageReq(s, (b, f) => {
    const h = f.headers.find((x: any) => x.required);
    if (!h) return false;
    b.page_responses[f.page_uuid].find((x: any) => x.key_attribute === h.key).value = value;
  });
neg({ id: "5B.3.4", onlyFor: "rfp", title: "Required field blank → 4xx", plain: "Save a form with a required answer left blank.", anchor: "4B.8", req: (s) => reqField(s, "") });
neg({ id: "5B.3.5", onlyFor: "rfp", title: "Required field null → 4xx", plain: "Save a form with a required answer set to nothing.", anchor: "4B.8", req: (s) => reqField(s, null) });
neg({
  id: "5B.3.6", onlyFor: "rfp",
  title: "Unknown page uuid → 4xx",
  plain: "Save answers for a form page that does not exist.",
  anchor: "4B.8",
  req: (s) =>
    pageReq(s, (b, f) => {
      b.page_responses = { [FAKE]: b.page_responses[f.page_uuid] };
      b.page_uuids = [FAKE];
    }),
});
neg({ id: "5B.3.7", onlyFor: "rfp", title: "Unknown form uuid → 4xx", plain: "Save answers for a form that does not exist.", anchor: "4B.8", req: (s) => pageReq(s, (b) => void (b.form_uuid = FAKE)) });
neg({
  id: "5B.3.8", onlyFor: "rfp",
  title: "Unknown key_attribute → 4xx",
  plain: "Save an answer to a question that is not on the form.",
  anchor: "4B.8",
  req: (s) => pageReq(s, (b, f) => void b.page_responses[f.page_uuid].push({ key_attribute: "zzzzz", value: "x" })),
});
neg({
  id: "5B.3.9", onlyFor: "rfp",
  title: "Dropdown value not in options → 4xx",
  plain: "Save a dropdown answer that is not one of its options.",
  anchor: "4B.8",
  req: (s) =>
    pageReq(s, (b, f) => {
      const dd = f.headers.filter((h: any) => h.input_type === "dropdown");
      if (!dd.length) return false;
      dd.forEach((h: any) => (b.page_responses[f.page_uuid].find((x: any) => x.key_attribute === h.key).value = "NOT_AN_OPTION"));
    }),
});
neg({
  id: "5B.3.10", onlyFor: "rfp",
  title: "Write read-only evaluation_score → 4xx",
  plain: "Save a form that also sets the vendor's own evaluation score.",
  anchor: "4B.8",
  kind: "security",
  req: (s) => pageReq(s, (b, f) => void b.page_responses[f.page_uuid].push({ key_attribute: "evaluation_score", value: 5 })),
});
neg({ id: "5B.3.11", onlyFor: "rfp", title: "Page responses on a random sheet → 404", plain: "Save answers to a bid sheet that does not exist.", anchor: "4B.8", codes: [403, 404, 422, 400], req: (s) => pageReq(s, () => {}, FAKE) });
neg({
  id: "5B.3.12", onlyFor: "rfp",
  title: "Submit with invalid status → 4xx",
  plain: 'Submit the bid with the status "not_a_status".',
  anchor: "4B.9",
  req: (s) => ({ method: "PATCH", path: `/api/template_responses/${q(first(s)!.sheet!)}`, body: sheetBody(s, { status: "not_a_status" }), as: "vendor" }),
});
neg({ id: "5B.3.13", onlyFor: "rfp", title: "Submit a random sheet → 404", plain: "Submit a bid sheet that does not exist.", anchor: "4B.9", codes: [403, 404, 422, 400], req: (s) => ({ method: "PATCH", path: `/api/template_responses/${FAKE}`, body: sheetBody(s, { status: "active" }), as: "vendor" }) });
neg({ id: "5B.3.14", onlyFor: "rfp", title: "Malformed JSON → 400", plain: "Start a bid with a body cut off half way.", anchor: "4B.7", codes: [400, 422], req: () => ({ method: "POST", path: "/api/template_responses", raw: '{"item_uuid":', as: "vendor" }) });
neg({
  id: "5B.3.15", onlyFor: "rfp",
  title: "EDGE second bid sheet for same vendor & stage",
  plain: "Start a second bid sheet for a vendor that already has one on this round.",
  anchor: "4B.7",
  mode: "graceful",
  req: (s) => ({ method: "POST", path: "/api/template_responses", body: sheetBody(s), as: "vendor" }),
  more: (t, res) => {
    if (res.status === 200) t.check("It returns the existing bid sheet instead of a duplicate", () => expect(res.json.uuid).toBe(first(t.state)!.sheet));
  },
});

// ── 5B.4 the RFQ price bid ────────────────────────────────────────────────

const rqCreate = (s: RunState, mut: (b: any) => void = () => {}): Req => {
  const b: any = { trade_request_uuid: s.bidTrade, company_uuid: first(s)?.uuid, currency_preference: CURRENCIES.INR, broker_company_uuid: false };
  mut(b);
  return { method: "POST", path: "/api/v1/bids", body: b, as: "vendor" };
};
/** The vendor's valid priced rows with one thing broken. */
const rqRows = (s: RunState, mut: (rows: any[]) => void, bid?: string): Req => {
  const v = first(s)!;
  const r = vbRfqRows(v.rfqRows ?? [], v.rfqPad ?? {}, 0);
  mut(r.rows);
  return { method: "POST", path: `/api/v1/bids/${q(bid ?? v.bid!)}/create_bid_products`, body: bidProductsBody(s, v.uuid, r.rows), as: "vendor" };
};
const rq = (id: string, title: string, plain: string, req: (s: RunState) => Req, extra: Partial<Parameters<typeof neg>[0]> = {}) =>
  neg({ id, title, plain, anchor: id.startsWith("5B.4.1") && id.length === 7 ? "4B.9q" : "4B.8q", onlyFor: "rfq", req, ...extra });

rq("5B.4.1", "RFQ create bid WITHOUT token → 401", "Start a price bid with no vendor login at all.", (s) => ({ ...rqCreate(s), as: "none" }), { kind: "security", codes: [401, 403], anchor: "4B.7q" });
rq("5B.4.2", "RFQ create bid as ANOTHER company → 4xx", "Log in as one vendor and start a price bid as a different invited vendor.", (s) => rqCreate(s, (b) => (b.company_uuid = otherVendor(s))), {
  kind: "security",
  codes: [400, 401, 403, 404, 422],
  anchor: "4B.7q",
});
rq("5B.4.3", "RFQ create bid for unknown trade → 4xx", "Start a price bid on a round that does not exist.", (s) => rqCreate(s, (b) => (b.trade_request_uuid = FAKE)), { anchor: "4B.7q" });
rq("5B.4.4", "RFQ create bid with unknown currency → 4xx", 'Start a price bid in the currency "ZZZ".', (s) => rqCreate(s, (b) => (b.currency_preference = { code: "ZZZ" })), { anchor: "4B.7q" });
rq("5B.4.5", "Price 0 → 4xx", "Bid a price of zero.", (s) =>
  rqRows(s, (rows) => {
    rows[0].price.value = 0;
    if (rows[0].total_amount) rows[0].total_amount.value = 0;
  }),
);
rq("5B.4.6", "Negative price → 4xx", "Bid a price of −10.", (s) => rqRows(s, (rows) => (rows[0].price.value = -10)));
rq("5B.4.7", "Price as text → 4xx", 'Bid a price of "abc".', (s) => rqRows(s, (rows) => (rows[0].price.value = "abc")));
rq("5B.4.8", "Price missing (required) → 4xx", "Bid without a price on a line item.", (s) => rqRows(s, (rows) => delete rows[0].price.value));
rq("5B.4.9", "Offered qty 0 → 4xx", "Offer a quantity of zero.", (s) => rqRows(s, (rows) => (rows[0].participant_quantity.value = "0")));
neg({
  id: "5B.4.10",
  title: "Offered qty > requested",
  plain: "Offer ten times the quantity asked for.",
  anchor: "4B.8q",
  onlyFor: "rfq",
  // Refused, unless the round allows offering more than asked (is_over_quantity_allowed).
  mode: "reject",
  req: (s) => rqRows(s, (rows) => (rows[0].participant_quantity.value = String(Number(rows[0].creator_quantity.value) * 10))),
});
rq("5B.4.11", "GST above 100% → 4xx", "Bid with 150% GST.", (s) => rqRows(s, (rows) => rows[0].gst && (rows[0].gst.value = 150)));
rq("5B.4.12", "Row for unknown line item → 4xx", "Price a line item that is not on the round.", (s) => rqRows(s, (rows) => (rows[0].product.event_group_line_item_uuid = FAKE)));
rq("5B.4.13", "Empty rows → 4xx", "Save a price bid with no rows at all.", (s) => rqRows(s, (rows) => (rows.length = 0)));
rq("5B.4.14", "create_bid_products on unknown bid → 404", "Save prices on a bid that does not exist.", (s) => rqRows(s, () => {}, FAKE), { codes: [403, 404, 422, 400] });
rq("5B.4.15", "EDGE tampered total_amount (server must recompute)", "Send a line total of 1 — the server should work the total out itself.", (s) => rqRows(s, (rows) => rows[0].total_amount && (rows[0].total_amount.value = 1)), { mode: "graceful" });
rq("5B.4.16", "Submit with invalid status → 4xx", 'Submit the price bid with the status "not_a_status".', (s) => ({ method: "PATCH", path: `/api/v1/bids/${q(first(s)!.bid!)}`, body: bidSubmitBody(s, first(s)!.uuid, first(s)!.gross!, "not_a_status"), as: "vendor" }), { anchor: "4B.9q" });
rq("5B.4.17", "EDGE submit with wrong gross_total (server must recompute)", "Submit the price bid claiming a gross total of 1.", (s) => ({ method: "PATCH", path: `/api/v1/bids/${q(first(s)!.bid!)}`, body: bidSubmitBody(s, first(s)!.uuid, 1), as: "vendor" }), {
  mode: "graceful",
  anchor: "4B.9q",
});

rfpCase(
  {
    id: "5B.4.98",
    title: "Restore the valid RFQ bid (re-save rows + submit)",
    plain: "Put the vendor's real prices back after the broken ones, and submit again.",
    expected: "The valid rows save (200) and the bid submits (200).",
    anchor: "4B.9q",
    part: "vendor",
    kind: "step",
    mode: "rfq",
    needs: ["vbSubmitted"],
  },
  async (t) => {
    await freshVendorLogin(t);
    const v = first(t.state)!;
    const r = vbRfqRows(v.rfqRows ?? [], v.rfqPad ?? {}, 0);
    const a = await asVendor(t.api, v.token!, "$VENDOR_TOKEN", "POST", `/api/v1/bids/${q(v.bid!)}/create_bid_products`, { body: bidProductsBody(t.state, v.uuid, r.rows) });
    t.basic(a, { status: 200 });
    const b = await asVendor(t.api, v.token!, "$VENDOR_TOKEN", "PATCH", `/api/v1/bids/${q(v.bid!)}`, { body: bidSubmitBody(t.state, v.uuid, v.gross!) });
    t.basic(b, { status: 200 });
    t.actual(`${v.name}'s real prices are back and the bid is submitted (gross ${v.gross}).`);
  },
);

rfpCase(
  {
    id: "5B.4.99",
    title: "RFQ bid still correct after negatives (vendor trade view)",
    plain: "After every broken price, read the vendor's bid back: its prices, quantities and gross total are still the real ones, and it is still one bid.",
    expected: "The round (200) shows the vendor's real prices and gross total — tampered totals ignored — and exactly one bid from the vendor.",
    anchor: "4B.9q",
    part: "vendor",
    kind: "negative",
    mode: "rfq",
    needs: ["vbSubmitted"],
  },
  async (t) => {
    await freshVendorLogin(t);
    const v = first(t.state)!;
    const res = await asVendor(t.api, v.token!, "$VENDOR_TOKEN", "GET", `/api/trade/${q(t.state.bidTrade!)}?response_type=template&additional_fields=order_details`);
    if (!t.basic(res, { status: 200 })) return;
    vbRfqCheckRows(t, res.json, v, "After the negatives: ");
    t.check("Still exactly one bid from this vendor", () =>
      expect(Object.values(res.json.participants || {}).filter((p: any) => p.company.uuid === v.uuid).length).toBe(1),
    );
    const g = ((res.json.sheets.global_price_components.global_data || {})[v.uuid] || {}).gross_total;
    t.actual(`Gross total on the round: ${round2(g?.value)} (the real one is ${v.gross}).`);
  },
);

rfpCase(
  {
    id: "5B.3.99",
    title: "VB NEG Summary — buyer bid_count unchanged",
    plain: "After every invalid vendor request, count the bids on the round as the buyer: none of them may have landed.",
    expected: "The round reads (200) and its bid count is what it was straight after the vendor bid.",
    anchor: "4B.9",
    part: "vendor",
    kind: "negative",
    needs: ["vbPostBidCount"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/v1/trade/${q(t.state.bidTrade!)}/schema?response_type=template&additional_fields=order_details`);
    t.basic(res, { status: 200 });
    const before = t.state.vbPostBidCount!;
    if (res.json) t.check(`bid_count is still ${before} — no invalid request left a bid`, () => expect(res.json.bid_count).toBe(before));
    t.actual(`The round has ${res.json?.bid_count ?? "?"} bid(s); it had ${before} after the vendor bid.`);
  },
);
