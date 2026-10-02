/**
 * 05 — SURROGATE BID NEGATIVE & EDGE, requests 5.1.1 to 5.3.99.
 *
 * Each case takes a valid surrogate bid and breaks one thing. The bid is
 * placed for an invited vendor who has NOT bid yet where there is one, so a
 * wrongly accepted payload shows up as an extra bidder — 5.3.99 counts them.
 * The edge cases 5.3.1–5.3.3 deliberately re-bid for the vendor from 4.5,
 * which is a revision, not a new bid.
 */
import { expect } from "@playwright/test";

import type { AuthMode } from "../src/api.js";
import { rfpCase, type CaseKind, type Ctx } from "../src/harness.js";
import type { RunState } from "../src/state.js";
import { buildSurrogateBody } from "../src/surrogate.js";

const q = encodeURIComponent;
const FAKE = "WFhYWFhYWFg=";
const SB = "/api/template_responses/create_surrogate_response";

/** A valid body for a vendor who has not bid — or for the 4.5 vendor when `bidVendor`. */
function sb(s: RunState, opts: { bidVendor?: boolean } = {}) {
  const vendors = s.sbVendors!;
  const used = [...vendors.map((v) => v.uuid), ...(s.sbBaseline?.already_bid ?? [])];
  const spare = (s.sbEligible ?? []).find((e) => !used.includes(e.uuid));
  const v = opts.bidVendor ? vendors[0] : spare || vendors[0];
  return buildSurrogateBody(s, v, 0);
}

/** Change the first required answer, if the template has one. */
function firstRequired(s: RunState, b: any, mut: (arr: any[], i: number) => void): boolean {
  for (const f of s.sbForms!) {
    const h = f.headers.find((x) => x.required);
    if (!h) continue;
    const arr = b.page_responses[f.page_uuid];
    const i = arr.findIndex((x: any) => x.key_attribute === h.key);
    mut(arr, i);
    return true;
  }
  return false;
}

/** Break every answer of one input type; false when the template has none. */
function everyOfType(s: RunState, b: any, type: string, value: unknown): boolean {
  let found = false;
  for (const f of s.sbForms!) {
    for (const h of f.headers.filter((x) => x.input_type === type)) {
      const e = b.page_responses[f.page_uuid].find((x: any) => x.key_attribute === h.key);
      if (e) {
        e.value = value;
        found = true;
      }
    }
  }
  return found;
}

interface Req {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  raw?: string;
  auth?: AuthMode;
  /** the template has nothing this case can break */
  notApplicable?: string;
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
  req: (s: RunState, t: Ctx) => Req;
  more?: (t: Ctx, res: Awaited<ReturnType<Ctx["api"]["call"]>>) => void;
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
      part: "surrogate",
      kind: n.kind ?? (mode === "graceful" ? "edge" : "negative"),
      needs: n.needs ?? ["sbPlaced"],
    },
    async (t) => {
      const r = n.req(t.state, t);
      if (r.notApplicable) t.skip(r.notApplicable);
      const res = await t.api.call(r.method, r.path, { body: r.body, raw: r.raw, auth: r.auth });
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

const post = (body: unknown, auth?: AuthMode): Req => ({ method: "POST", path: SB, body, auth });
const edit = (s: RunState, f: (b: any) => void) => {
  const b = sb(s);
  f(b);
  return post(b);
};

// ── 5.1 auth & payload ────────────────────────────────────────────────────
neg({ id: "5.1.1", title: "Surrogate bid WITHOUT token → 401", plain: "Place a surrogate bid with no buyer login at all — as an anonymous caller, not the signed-in buyer.", anchor: "4.5", kind: "security", codes: [401, 403], req: (s) => post(sb(s), "none") });
neg({ id: "5.1.2", title: "Surrogate bid with INVALID token → 401", plain: "Place a surrogate bid with a made-up buyer token.", anchor: "4.5", kind: "security", codes: [401, 403], req: (s) => post(sb(s), { token: "invalid_token_123", shown: "invalid_token_123" }) });
neg({ id: "5.1.3", title: "Non-existent item_uuid (stage) → 4xx", plain: "Bid on a round that does not exist.", anchor: "4.5", req: (s) => edit(s, (b) => (b.item_uuid = FAKE)) });
neg({ id: "5.1.4", title: "item_uuid missing → 4xx", plain: "Bid without saying which round.", anchor: "4.5", req: (s) => edit(s, (b) => delete b.item_uuid) });
neg({ id: "5.1.5", title: "Invalid item_type → 4xx", plain: 'Bid on an item of the type "NotATradeRequest".', anchor: "4.5", req: (s) => edit(s, (b) => (b.item_type = "NotATradeRequest")) });
neg({ id: "5.1.6", title: "Vendor company NOT invited (random uuid) → 4xx", plain: "Bid for a company that was never invited.", anchor: "4.5", req: (s) => edit(s, (b) => (b.company_uuid = FAKE)) });
neg({ id: "5.1.7", title: "Buyer own company as bidder → 4xx", plain: "Bid with the buyer's own company as the vendor.", anchor: "4.5", req: (s) => edit(s, (b) => (b.company_uuid = s.sbBuyerCompany)) });
neg({ id: "5.1.8", title: "company_uuid missing → 4xx", plain: "Bid without saying for which vendor.", anchor: "4.5", req: (s) => edit(s, (b) => delete b.company_uuid) });
neg({ id: "5.1.9", title: "page_responses missing → 4xx", plain: "Bid with no answers at all.", anchor: "4.5", req: (s) => edit(s, (b) => delete b.page_responses) });
neg({ id: "5.1.10", title: "page_responses empty {} → 4xx", plain: "Bid with an empty set of answers.", anchor: "4.5", req: (s) => edit(s, (b) => (b.page_responses = {})) });
neg({
  id: "5.1.11",
  title: "page_uuids missing a form → 4xx",
  plain: "Bid leaving out one of the round's forms.",
  anchor: "4.5",
  req: (s) =>
    edit(s, (b) => {
      const last = b.page_uuids.pop();
      delete b.page_responses[last];
    }),
});
neg({
  id: "5.1.12",
  title: "Unknown page uuid → 4xx",
  plain: "Bid with answers for a form page that does not exist.",
  anchor: "4.5",
  req: (s) =>
    edit(s, (b) => {
      b.page_responses[FAKE] = [{ key_attribute: "abcde", value: "x" }];
      b.page_uuids.push(FAKE);
    }),
});
neg({ id: "5.1.13", title: "Malformed JSON → 400", plain: "Bid with a body cut off half way.", anchor: "4.5", codes: [400, 422], req: () => ({ method: "POST", path: SB, raw: '{"item_type":"TradeRequest","item_uuid":' }) });
neg({ id: "5.1.14", title: "Empty body {} → 4xx", plain: "Bid with an empty body.", anchor: "4.5", req: () => post({}) });
neg({ id: "5.1.15", title: "Wrong method GET → 404/405", plain: "GET the bid endpoint instead of POSTing to it.", anchor: "4.5", codes: [404, 405], req: () => ({ method: "GET", path: SB }) });

// ── 5.2 field level ───────────────────────────────────────────────────────
const noReq = "this round's template has no required question to break";
const reqCase = (id: string, title: string, plain: string, mut: (a: any[], i: number) => void) =>
  neg({
    id,
    title,
    plain,
    anchor: "4.5",
    req: (s) => {
      const b = sb(s);
      return firstRequired(s, b, mut) ? post(b) : { method: "POST", path: SB, notApplicable: noReq };
    },
  });
reqCase("5.2.1", 'Required field blank "" → 4xx', "Bid with a required answer left blank.", (a, i) => (a[i].value = ""));
reqCase("5.2.2", "Required field null → 4xx", "Bid with a required answer set to nothing.", (a, i) => (a[i].value = null));
reqCase("5.2.3", "Required field key removed → 4xx", "Bid with a required question missing entirely.", (a, i) => a.splice(i, 1));
reqCase("5.2.4", "Required field whitespace only → 4xx", "Bid with a required answer of only spaces.", (a, i) => (a[i].value = "   "));
neg({
  id: "5.2.5",
  title: "Unknown key_attribute → 4xx",
  plain: "Bid answering a question that is not on the form.",
  anchor: "4.5",
  req: (s) => edit(s, (b) => b.page_responses[b.page_uuids[0]].push({ key_attribute: "zzzzz", value: "x" })),
});
const typeCase = (id: string, title: string, plain: string, type: string, value: unknown) =>
  neg({
    id,
    title,
    plain,
    anchor: "4.5",
    req: (s) => {
      const b = sb(s);
      return everyOfType(s, b, type, value) ? post(b) : { method: "POST", path: SB, notApplicable: `this round's template has no ${type} question` };
    },
  });
typeCase("5.2.6", "Dropdown value not in options → 4xx", "Bid picking a dropdown value that is not one of its options.", "dropdown", "NOT_AN_OPTION");
typeCase("5.2.7", "Date field with invalid date text → 4xx", 'Bid with "not-a-date" in a date question.', "date", "not-a-date");
typeCase("5.2.8", "Number field with text → 4xx", 'Bid with "abc" in a number question.', "number", "abc");
typeCase("5.2.9", "Attachment field with a plain string → 4xx", "Bid with plain text where a file is expected.", "attachment", "not_a_file");
neg({
  id: "5.2.10",
  title: "Try to write read-only evaluation_score → 4xx",
  plain: "Bid that also tries to set its own evaluation score.",
  anchor: "4.5",
  kind: "security",
  req: (s) =>
    edit(s, (b) => {
      const f = s.sbForms!.find((x) => x.egli)!;
      b.page_responses[f.page_uuid].push({ key_attribute: "evaluation_score", value: 5 });
    }),
});

// ── 5.3 edge & reads ──────────────────────────────────────────────────────
neg({
  id: "5.3.1",
  title: "EDGE very long text (5000 chars) — as revision of existing bid",
  plain: "Revise the vendor's bid with a 5,000-character answer.",
  anchor: "4.5",
  mode: "graceful",
  req: (s) => {
    const b = sb(s, { bidVendor: true });
    firstRequired(s, b, (a, i) => (a[i].value = "L".repeat(5000)));
    return post(b);
  },
});
neg({
  id: "5.3.2",
  title: "EDGE unicode + HTML in text — as revision of existing bid",
  plain: "Revise a bid with Hindi text and a <script> tag in an answer.",
  anchor: "4.5",
  mode: "graceful",
  req: (s) => {
    const b = sb(s);
    firstRequired(s, b, (a, i) => (a[i].value = 'नमस्ते <script>alert(1)</script> & "q"'));
    return post(b);
  },
});
neg({
  id: "5.3.3",
  title: "EDGE re-submit for vendor who already bid (revision)",
  plain: "Submit again for the vendor who already has a surrogate bid.",
  anchor: "4.5",
  mode: "graceful",
  req: (s) => post(sb(s, { bidVendor: true })),
  more: (t, res) => {
    if (res.status === 200) t.note("The re-submission was accepted — check revised_bids on the quote.");
  },
});
neg({ id: "5.3.4", title: "quote_details invalid sheet uuid → 404", plain: "Open a quote that does not exist.", anchor: "4.7", codes: [404, 403, 422, 400], req: (s) => ({ method: "GET", path: `/api/v1/trade/${q(s.sbTrade!)}/quote_details/${FAKE}` }) });
neg({
  id: "5.3.5",
  title: "quote_details WITHOUT token → 401",
  plain: "Open the vendor's quote with no buyer login at all.",
  anchor: "4.7",
  kind: "security",
  codes: [401, 403],
  needs: ["sbPostBidCount"],
  req: (s) => ({ method: "GET", path: `/api/v1/trade/${q(s.sbTrade!)}/quote_details/${q(Object.values(s.sbResults ?? {})[0] ?? FAKE)}`, auth: "none" }),
});
neg({
  id: "5.3.6",
  title: "quote_details with sheet under wrong trade → 4xx",
  plain: "Open the vendor's quote through a round it does not belong to.",
  anchor: "4.7",
  codes: [404, 403, 422, 400],
  needs: ["sbPostBidCount"],
  req: (s) => ({ method: "GET", path: `/api/v1/trade/${FAKE}/quote_details/${q(Object.values(s.sbResults ?? {})[0] ?? FAKE)}` }),
});
neg({ id: "5.3.7", title: "get_approvals invalid trade → 404", plain: "Read approvals for a round that does not exist.", anchor: "4.10", codes: [404, 403, 422, 400], needs: ["sbTrade"], req: () => ({ method: "GET", path: `/api/v1/trade/${FAKE}/get_approvals` }) });
neg({ id: "5.3.8", title: "unresolved_queries_count invalid event → no 5xx", plain: "Count queries on a round that does not exist.", anchor: "4.12", mode: "graceful", needs: ["sbTrade"], req: () => ({ method: "GET", path: `/api/v1/chats/get_unresolved_queries_count?event_uuid=${FAKE}` }) });
neg({ id: "5.3.9", title: "audience_for_product show_bidders invalid trade → no 5xx", plain: "List bidders for a round that does not exist.", anchor: "4.3", mode: "graceful", needs: ["sbTrade"], req: () => ({ method: "GET", path: `/api/companies/audience_for_product?&trade_request_uuid=${FAKE}&show_bidders=true` }) });

rfpCase(
  {
    id: "5.3.99",
    title: "SB NEG Summary — no bids leaked from invalid payloads",
    plain: "After every invalid bid, count the bidders on the round: none of the invalid ones may have landed.",
    expected: "The round reads (200) and its bid count is still what it was straight after 4.5.",
    anchor: "4.5",
    part: "surrogate",
    kind: "negative",
    needs: ["sbPostBidCount"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/v1/trade/${q(t.state.sbTrade!)}/schema?response_type=template&additional_fields=order_details`);
    t.basic(res, { status: 200 });
    const before = t.state.sbPostBidCount!;
    const b = res.json;
    if (b) {
      t.check(`bid_count is still ${before} — no invalid bid landed`, () =>
        expect(b.bid_count, `bidders now: ${JSON.stringify((b.participants_data || []).map((p: any) => p.label))}`).toBe(before),
      );
    }
    t.actual(`The round has ${b?.bid_count ?? "?"} bid(s); it had ${before} after the surrogate bid.`);
  },
);
