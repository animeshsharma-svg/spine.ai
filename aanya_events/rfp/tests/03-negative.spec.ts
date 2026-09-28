/**
 * 03 — NEGATIVE & EDGE CASES, requests 3.0 to 3.5.99.
 *
 * Each case takes a valid body from the publish flow and breaks one thing.
 * "Reject" cases must be refused with a 4xx and a message; "edge" cases must
 * not cause a server error, and what the app did is written down either way.
 *
 * They act on a separate draft (3.0) so nothing here can touch the event the
 * publish flow published — except 3.4.6 and 3.4.8, which aim at it on purpose.
 */
import { expect } from "@playwright/test";

import type { AuthMode } from "../src/api.js";
import { buildPublishBody, buildStageBody } from "../src/builders.js";
import { ACCOUNT, cfgStr, isRfq } from "../src/config.js";
import { rfpCase, type CaseKind, type Ctx } from "../src/harness.js";
import type { RunState } from "../src/state.js";

const q = encodeURIComponent;
const FAKE = "WFhYWFhYWFg=";
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const LI = (s: RunState) => clone(s.lineItems!);
const STAGE = (s: RunState) => buildStageBody(s, s.negEventGroupUuid!, s.negEgli!).body;
const stagePath = () => `/api/trade/template_input?template_name=${q(cfgStr("trade_template_name"))}&additional_fields=order_details`;

type Method = "GET" | "POST" | "PATCH" | "DELETE";
interface Req {
  method: Method;
  path: string;
  body?: unknown;
  raw?: string;
  contentType?: string;
  auth?: AuthMode;
}

interface Neg {
  id: string;
  title: string;
  plain: string;
  anchor: string;
  kind?: CaseKind;
  /** reject (the default) or graceful */
  mode?: "reject" | "graceful";
  codes?: number[];
  heavy?: boolean;
  needs?: Array<keyof RunState>;
  expected?: string;
  req: (s: RunState, t: Ctx) => Req;
  /** extra checks, run after the standard ones */
  more?: (t: Ctx, res: Awaited<ReturnType<Ctx["api"]["call"]>>, s: RunState) => void;
  /** an RFQ price-sheet case — left out of an RFP run */
  onlyRfq?: boolean;
}

function neg(n: Neg) {
  const mode = n.mode ?? "reject";
  const kind: CaseKind = n.kind ?? (mode === "graceful" ? "edge" : "negative");
  const expected =
    n.expected ??
    (mode === "reject"
      ? `The app refuses it${n.codes ? ` with ${n.codes.join(" or ")}` : " with a 4xx"} and says why — no server error.`
      : "No server error. Whatever the app does with it is recorded.");
  rfpCase(
    {
      id: n.id,
      title: n.title,
      plain: n.plain,
      expected,
      anchor: n.anchor,
      part: "negative",
      kind,
      mode: n.onlyRfq ? "rfq" : undefined,
      // Every case waits for 1.1: with a dead token the run says so once,
      // instead of eighty cases each failing for the same reason.
      needs: ["cfgDefaults", ...(n.needs ?? ["negEventGroupUuid"])],
    },
    async (t) => {
      const r = n.req(t.state, t);
      const res = await t.api.call(r.method, r.path, { body: r.body, raw: r.raw, contentType: r.contentType, auth: r.auth });
      t.negative(res, { mode, codes: n.codes, sla: n.heavy ? "heavy" : "normal" });
      n.more?.(t, res, t.state);
      const refused = res.status >= 400 && res.status < 500;
      t.actual(
        res.status >= 500
          ? `Server error ${res.status}: ${res.text.slice(0, 160) || "(empty body)"}`
          : refused
            ? `Refused with ${res.status}: ${res.text.slice(0, 160) || "(empty body)"}`
            : r.method === "POST" && res.json?.uuid
              ? `Accepted with ${res.status} — created ${res.json.uuid}.`
              : r.method === "PATCH" && res.json?.uuid
                ? `Accepted with ${res.status} — ${res.json.uuid} was changed (status now "${res.json.status}").`
                : `Accepted with ${res.status}.`,
      );
    },
  );
}

// ── 3.0 setup ─────────────────────────────────────────────────────────────

rfpCase(
  {
    id: "3.0",
    title: "NEG Setup — Create draft event group for negative tests",
    plain: "Create a second, throwaway draft for the negative cases to act on.",
    expected: "A draft event comes back (200).",
    anchor: "1.8",
    part: "negative",
    kind: "step",
    needs: ["lineItems"],
  },
  async (t) => {
    const res = await t.api.call("POST", "/api/event_groups", { body: { status: "draft", line_items: LI(t.state) } });
    if (!t.basic(res, { status: 200, sla: "heavy", schema: "eventGroup", critical: true })) return;
    t.state.negEventGroupUuid = res.json.uuid;
    t.state.negEgli = res.json.event_group_line_item_ids;
    t.state.negLeaks = [];
    t.produced = { negEventGroupUuid: res.json.uuid };
    t.actual(`Throwaway draft ${res.json.uuid} was created.`);
  },
);

// ── 3.1 Auth & security ───────────────────────────────────────────────────

const draftBody = (s: RunState) => ({ status: "draft", line_items: LI(s) });

neg({
  id: "3.1.1",
  title: "Create event group WITHOUT access-token → 401",
  plain: "Try to create an event without signing in.",
  anchor: "1.8",
  kind: "security",
  codes: [401, 403],
  req: (s) => ({ method: "POST", path: "/api/event_groups", body: draftBody(s), auth: "none" }),
});
neg({
  id: "3.1.2",
  title: "Create event group with INVALID access-token → 401",
  plain: "Try to create an event with a made-up token.",
  anchor: "1.8",
  kind: "security",
  codes: [401, 403],
  req: (s) => ({ method: "POST", path: "/api/event_groups", body: draftBody(s), auth: { token: "invalid_token_123", shown: "invalid_token_123" } }),
});
neg({
  id: "3.1.3",
  title: "Create event group with EXPIRED-format token (tampered) → 401",
  plain: "Try to create an event with a real token that has been tampered with.",
  anchor: "1.8",
  kind: "security",
  codes: [401, 403],
  req: (s) => ({
    method: "POST",
    path: "/api/event_groups",
    body: draftBody(s),
    auth: { token: `${ACCOUNT.token}TAMPERED`, shown: "${ACCESS_TOKEN}TAMPERED" },
  }),
});
neg({
  id: "3.1.4",
  title: "Publish WITHOUT token → 401",
  plain: "Try to publish an event without signing in.",
  anchor: "1.10",
  kind: "security",
  codes: [401, 403],
  req: (s) => ({
    method: "PATCH",
    path: `/api/event_groups/${q(s.negEventGroupUuid!)}`,
    body: { title: "x", status: "active", draft_trade_request_uuids: [] },
    auth: "none",
  }),
});
neg({
  id: "3.1.5",
  title: "GET event group WITHOUT token → 401",
  plain: "Try to read an event without signing in.",
  anchor: "2.1",
  kind: "security",
  codes: [401, 403],
  req: (s) => ({ method: "GET", path: `/api/event_groups/${q(s.negEventGroupUuid!)}`, auth: "none" }),
});
neg({
  id: "3.1.6",
  title: "GET new_request_config WITHOUT token → 401",
  plain: "Try to read the account's event settings without signing in.",
  anchor: "1.1",
  kind: "security",
  codes: [401, 403],
  needs: [],
  req: () => ({ method: "GET", path: "/api/v1/trade/new_request_config?additional_fields=terms_and_conditions", auth: "none" }),
});
neg({
  id: "3.1.7",
  title: "Product search SQL injection payload → no 5xx, no leak",
  plain: "Search products for ' OR 1=1-- and make sure no database error leaks out.",
  anchor: "1.2",
  kind: "security",
  mode: "graceful",
  heavy: true,
  needs: [],
  expected: "No server error, and no SQL error text in the reply.",
  req: () => ({ method: "GET", path: "/api/products/search?query=%27%20OR%201%3D1--" }),
  more: (t, res) =>
    t.check("No SQL error text leaked", () =>
      expect(res.text).not.toMatch(/syntax error|PG::|SQLSTATE|mysql|ActiveRecord::StatementInvalid/i),
    ),
});
neg({
  id: "3.1.8",
  title: "Product search XSS payload → no 5xx, not reflected raw",
  plain: "Search products for a <script> tag and make sure it is not echoed back unescaped.",
  anchor: "1.2",
  kind: "security",
  mode: "graceful",
  heavy: true,
  needs: [],
  expected: "No server error, and the script tag is not reflected as-is.",
  req: () => ({ method: "GET", path: "/api/products/search?query=%3Cscript%3Ealert(1)%3C%2Fscript%3E" }),
  more: (t, res) => t.check("The script tag is not reflected unescaped", () => expect(res.text).not.toContain("<script>alert(1)</script>")),
});
neg({
  id: "3.1.9",
  title: "Access another random event group uuid → 403/404",
  plain: "Try to open an event id that does not exist.",
  anchor: "2.1",
  kind: "security",
  codes: [403, 404, 422, 400],
  needs: [],
  req: () => ({ method: "GET", path: "/api/event_groups/ZZZZZZZZ" }),
});
rfpCase(
  {
    id: "3.1.10",
    title: "Response does not expose server stack / version headers",
    plain: "Read an event and check the reply gives nothing away about the server.",
    expected: "The event reads (200) with no X-Powered-By header and no stack trace.",
    anchor: "2.1",
    part: "negative",
    kind: "security",
    needs: ["negEventGroupUuid"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/event_groups/${q(t.state.negEventGroupUuid!)}`);
    t.basic(res, { status: 200, sla: "heavy" });
    t.check("No X-Powered-By header", () => expect(res.headers["x-powered-by"]).toBeUndefined());
    t.check("No stack trace in the body", () => expect(res.text).not.toMatch(/\.rb:\d+:in|Traceback|at .*\.js:\d+/));
  },
);

// ── 3.2 Create event group — validation ───────────────────────────────────

const first = (s: RunState, change: (li: any) => void) => {
  const li = LI(s);
  change(li[0]);
  return { method: "POST" as const, path: "/api/event_groups", body: { status: "draft", line_items: [li[0]] } };
};

const createCases: Array<Omit<Neg, "anchor">> = [
  { id: "3.2.1", title: "Empty line_items [] → 4xx", plain: "Create an event with no line items.", req: () => ({ method: "POST", path: "/api/event_groups", body: { status: "draft", line_items: [] } }) },
  { id: "3.2.2", title: "Missing line_items key → 4xx", plain: "Create an event without saying what it sources.", req: () => ({ method: "POST", path: "/api/event_groups", body: { status: "draft" } }) },
  { id: "3.2.3", title: "Empty body {} → 4xx", plain: "Create an event from an empty body.", req: () => ({ method: "POST", path: "/api/event_groups", body: {} }) },
  { id: "3.2.4", title: "Non-existent product_uuid → 4xx", plain: "Create an event for a product that does not exist.", req: (s) => first(s, (li) => (li.product_uuid = FAKE)) },
  { id: "3.2.5", title: "product_uuid null → 4xx", plain: "Create an event whose line item names no product.", req: (s) => first(s, (li) => (li.product_uuid = null)) },
  { id: "3.2.6", title: "Quantity 0 → 4xx", plain: "Create an event asking for zero of a product.", req: (s) => first(s, (li) => (li.quantity.value = 0)) },
  { id: "3.2.7", title: "Negative quantity → 4xx", plain: "Create an event asking for −5 of a product.", req: (s) => first(s, (li) => (li.quantity.value = -5)) },
  { id: "3.2.8", title: 'Quantity as string "abc" → 4xx', plain: 'Create an event whose quantity is the word "abc".', req: (s) => first(s, (li) => (li.quantity.value = "abc")) },
  { id: "3.2.9", title: "Quantity null → 4xx", plain: "Create an event whose quantity is empty.", req: (s) => first(s, (li) => (li.quantity.value = null)) },
  { id: "3.2.10", title: "Quantity object missing → 4xx", plain: "Create an event whose line item has no quantity at all.", req: (s) => first(s, (li) => delete li.quantity) },
  { id: "3.2.11", title: "Invalid unitSymbol → 4xx", plain: "Create an event in a unit that does not exist.", req: (s) => first(s, (li) => (li.quantity.unitSymbol = "NOT_A_UNIT")) },
  {
    id: "3.2.12",
    title: "Variant of another product (mismatch) → 4xx",
    plain: "Create an event where a product is given another product's variant.",
    req: (s) => {
      const li = LI(s);
      if (li.length < 2) {
        li[0].product_quality_uuid = FAKE;
        return { method: "POST", path: "/api/event_groups", body: { status: "draft", line_items: [li[0]] } };
      }
      li[0].product_quality_uuid = li[1].product_quality_uuid;
      return { method: "POST", path: "/api/event_groups", body: { status: "draft", line_items: [li[0]] } };
    },
  },
  { id: "3.2.13", title: "Invalid status value → 4xx", plain: 'Create an event with the status "not_a_status".', req: (s) => ({ method: "POST", path: "/api/event_groups", body: { status: "not_a_status", line_items: LI(s) } }) },
  { id: "3.2.14", title: "line_items not an array → 4xx", plain: 'Create an event whose line items are the text "abc".', req: () => ({ method: "POST", path: "/api/event_groups", body: { status: "draft", line_items: "abc" } }) },
  {
    id: "3.2.15",
    title: "Malformed JSON → 400",
    plain: "Create an event from a body that is cut off half way.",
    codes: [400, 422],
    req: () => ({ method: "POST", path: "/api/event_groups", raw: '{"status": "draft", "line_items": [ {"product_uuid": ' }),
  },
  {
    id: "3.2.16",
    title: "Wrong Content-Type text/plain → 4xx/415",
    plain: "Create an event but label the body as plain text.",
    req: (s) => ({ method: "POST", path: "/api/event_groups", raw: JSON.stringify(draftBody(s)), contentType: "text/plain" }),
  },
  { id: "3.2.17", title: "Unsupported method DELETE on collection → 404/405", plain: "Try to DELETE the whole events collection.", codes: [404, 405], req: () => ({ method: "DELETE", path: "/api/event_groups" }) },
  {
    id: "3.2.18",
    title: "EDGE decimal quantity 0.5 → accepted & persisted exactly",
    plain: "Create an event asking for half a unit.",
    mode: "graceful",
    req: (s) => first(s, (li) => (li.quantity.value = 0.5)),
    more: (t, res) => {
      if (res.status === 200) t.check("One line item was created", () => expect(res.json.event_group_line_item_ids).toHaveLength(1));
    },
  },
  { id: "3.2.19", title: "EDGE minimum quantity 0.001 (precision)", plain: "Create an event asking for 0.001 of a unit.", mode: "graceful", req: (s) => first(s, (li) => (li.quantity.value = 0.001)) },
  { id: "3.2.20", title: "EDGE very large quantity 999999999999", plain: "Create an event asking for a trillion units.", mode: "graceful", req: (s) => first(s, (li) => (li.quantity.value = 999999999999)) },
  { id: "3.2.21", title: 'EDGE quantity as numeric string "5"', plain: 'Create an event whose quantity is the text "5".', mode: "graceful", req: (s) => first(s, (li) => (li.quantity.value = "5")) },
  {
    id: "3.2.22",
    title: "EDGE same product added twice",
    plain: "Create an event with the same product on two line items.",
    mode: "graceful",
    req: (s) => {
      const li = LI(s);
      return { method: "POST", path: "/api/event_groups", body: { status: "draft", line_items: [li[0], clone(li[0])] } };
    },
    more: (t, res) => {
      if (res.status === 200) t.note(`Duplicate product accepted — ${res.json.event_group_line_item_ids.length} line item(s) created.`);
    },
  },
  {
    id: "3.2.23",
    title: "EDGE status=active directly on create (skip draft)",
    plain: "Create an event that is live from the start, with no stage.",
    mode: "graceful",
    req: (s) => ({ method: "POST", path: "/api/event_groups", body: { status: "active", line_items: LI(s) } }),
    more: (t, res) => {
      if (res.status === 200) t.check("An event with no stage is not active", () => expect(res.json.status).not.toBe("active"));
    },
  },
  {
    id: "3.2.24",
    title: "EDGE unknown extra fields are ignored",
    plain: "Create an event with made-up fields, one of them trying to set another company as owner.",
    mode: "graceful",
    req: (s) => ({ method: "POST", path: "/api/event_groups", body: { status: "draft", line_items: LI(s), hacker_field: true, company_uuid: "WFhYWFg=" } }),
    more: (t, res) => {
      if (res.status === 200) t.check("The owner cannot be changed through the body", () => expect(res.json.company.uuid).not.toBe("WFhYWFg="));
    },
  },
  {
    id: "3.2.25",
    title: "EDGE unitSymbol case-changed (lowercase)",
    plain: "Create an event with the unit written in lower case.",
    mode: "graceful",
    req: (s) => first(s, (li) => (li.quantity.unitSymbol = String(li.quantity.unitSymbol).toLowerCase())),
  },
];
for (const c of createCases) neg({ ...c, anchor: "1.8", needs: c.needs ?? ["lineItems", "negEventGroupUuid"] });

// ── 3.3 Create stage — validation ─────────────────────────────────────────

const stage = (s: RunState, change?: (b: any) => void, path = stagePath()): Req => {
  const b = STAGE(s);
  change?.(b);
  return { method: "POST", path, body: b };
};
const lastForm = (b: any) => b.forms[b.forms.length - 1];

/**
 * The RFQ version of a stage case. An RFQ round has widgets and data rows
 * where an RFP has forms, so the same mistake is made in its own shape.
 */
function rfqAlt(b: any, kind: string) {
  const inl = b.widgets.inline_components;
  if (kind === "tpl") b.configurations.template_uuid = FAKE;
  if (kind === "egli") b.data[0].product.event_group_line_item_uuid = FAKE;
  if (kind === "itype")
    inl.push({ name: "bad", key_attribute: "bad_widget", input_type: "not_a_type", widget_type: "default", validation: {}, configuration: { field_type: "participant", mode_type: "write", is_required: false, options: [] } });
  if (kind === "dupkey") inl.push(clone(inl.find((w: any) => w.key_attribute === "price")));
  if (kind === "nohub") delete b.data[0].buyer_hub;
  if (kind === "noname")
    inl.push({ name: "", key_attribute: "noname_w", input_type: "number", widget_type: "default", validation: {}, configuration: { field_type: "participant", mode_type: "write", is_required: true, options: [] } });
  if (kind === "badhub") b.data[0].buyer_hub.uuid = FAKE;
  if (kind === "empty") b.data = [];
  return b;
}
/** RFP: change(b). RFQ: the rfqAlt of the same mistake. */
const either = (s: RunState, rfp: (b: any) => void, rfq: string): Req => stage(s, (b) => (b.forms ? rfp(b) : rfqAlt(b, rfq)));

const stageCases: Array<Omit<Neg, "anchor">> = [
  { id: "3.3.1", title: "Non-existent event_group_uuid → 4xx", plain: "Add a stage to an event that does not exist.", req: (s) => stage(s, (b) => (b.configurations.event_group_uuid = FAKE)) },
  { id: "3.3.2", title: "bid_end_time before bid_start_time → 4xx", plain: "Add a stage that ends before it starts.", req: (s) => stage(s, (b) => (b.configurations.bid_end_time = b.configurations.bid_start_time - 600)) },
  { id: "3.3.3", title: "bid_end_time == bid_start_time (zero duration) → 4xx", plain: "Add a stage that ends the moment it starts.", req: (s) => stage(s, (b) => (b.configurations.bid_end_time = b.configurations.bid_start_time)) },
  { id: "3.3.4", title: "extra_closing_time before bid_end_time → 4xx", plain: "Add a stage whose evaluation closes before bidding does.", req: (s) => stage(s, (b) => (b.configurations.extra_closing_time = b.configurations.bid_end_time - 600)) },
  { id: "3.3.5", title: "Invalid audience vendor uuid → 4xx", plain: "Add a stage inviting a vendor that does not exist.", req: (s) => stage(s, (b) => (b.audience_company_uuids = [FAKE])) },
  {
    id: "3.3.6",
    title: "Invalid template_uuid → 4xx",
    plain: "Add a stage built from a template that does not exist.",
    req: (s) =>
      either(
        s,
        (b) => {
          b.configurations.template_uuid = FAKE;
          b.forms.forEach((f: any) => {
            if (f.template_uuid) f.template_uuid = FAKE;
          });
        },
        "tpl",
      ),
  },
  {
    id: "3.3.7",
    title: "Form/row points to unknown event_group_line_item_uuid → 4xx",
    plain: "Add a stage whose form (RFP) or row (RFQ) belongs to a line item that does not exist.",
    req: (s) => either(s, (b) => (b.forms.find((x: any) => x.event_group_line_item_uuid).event_group_line_item_uuid = FAKE), "egli"),
  },
  { id: "3.3.8", title: "Invalid rfx_mode → 4xx", plain: 'Add a stage in the mode "not_a_mode".', req: (s) => stage(s, (b) => (b.configurations.rfx_mode = "not_a_mode")) },
  { id: "3.3.9", title: "Missing configurations → 4xx", plain: "Add a stage with no configuration at all.", req: (s) => stage(s, (b) => delete b.configurations) },
  {
    id: "3.3.10",
    title: "Invalid header/widget input_type → 4xx",
    plain: "Add a stage with a question (RFP) or price widget (RFQ) of an unknown type.",
    req: (s) =>
      either(s, (b) =>
        lastForm(b).page_response_headers.push({
          key_attribute: "bad01",
          name: "bad",
          description: "",
          input_type: "not_a_type",
          configuration: { field_type: "participant", is_required: false },
          widget_type: "default",
        }),
      "itype"),
  },
  { id: "3.3.11", title: "Invalid auction_closing_mode → 4xx", plain: 'Add a stage that closes in the mode "xyz".', req: (s) => stage(s, (b) => (b.configurations.auction_closing_mode = "xyz")) },
  { id: "3.3.12", title: "bid times as strings → 4xx", plain: 'Add a stage that starts "tomorrow".', req: (s) => stage(s, (b) => (b.configurations.bid_start_time = "tomorrow")) },
  {
    id: "3.3.13",
    title: "Duplicate key_attribute (form question / RFQ widget) → 4xx",
    plain: "Add a stage with the same question (RFP) or price widget (RFQ) twice.",
    req: (s) =>
      either(s, (b) => {
        const f = lastForm(b);
        const h = f.page_response_headers[0] || {
          key_attribute: "dup01",
          name: "a",
          description: "",
          input_type: "multiline_text",
          configuration: { field_type: "participant", is_required: false },
          widget_type: "default",
        };
        f.page_response_headers.push(clone(h), clone(h));
      }, "dupkey"),
  },
  {
    id: "3.3.14",
    title: "RFP dropdown without options / RFQ row without delivery location → 4xx",
    plain: "Add a stage with a dropdown question that has no options (RFP), or a line item with nowhere to deliver it (RFQ).",
    req: (s) =>
      either(s, (b) =>
        lastForm(b).page_response_headers.push({
          key_attribute: "dd001",
          name: "dd",
          description: "",
          input_type: "dropdown",
          configuration: { field_type: "participant", is_required: false },
          widget_type: "default",
        }),
      "nohub"),
  },
  {
    id: "3.3.15",
    title: "Empty header/widget name → 4xx",
    plain: "Add a stage with a required question (RFP) or widget (RFQ) that has no name.",
    req: (s) =>
      either(s, (b) =>
        lastForm(b).page_response_headers.push({
          key_attribute: "nm001",
          name: "",
          description: "",
          input_type: "multiline_text",
          configuration: { field_type: "participant", is_required: true },
          widget_type: "default",
        }),
      "noname"),
  },
  {
    id: "3.3.16",
    title: "RFP invalid evaluator / RFQ invalid delivery location → 4xx",
    plain: "Add a stage with an evaluator who does not exist (RFP), or a delivery location that does not exist (RFQ).",
    req: (s) => either(s, (b) => (lastForm(b).evaluators = [{ shared_with_uuid: "WFhYWFg=", shared_with_type: "User" }]), "badhub"),
  },
  {
    id: "3.3.17",
    title: "Unsupported template_name query param → 4xx",
    plain: 'Add a stage through the template "not_a_template".',
    req: (s) => stage(s, undefined, "/api/trade/template_input?template_name=not_a_template&additional_fields=order_details"),
  },
  {
    id: "3.3.18",
    title: "EDGE bid_start_time 1 day in the past",
    plain: "Add a stage that started yesterday.",
    mode: "graceful",
    req: (s) =>
      stage(s, (b) => {
        const c = b.configurations;
        const d = c.bid_end_time - c.bid_start_time;
        const e = c.extra_closing_time - c.bid_end_time;
        c.bid_start_time -= 86400;
        c.bid_end_time = c.bid_start_time + d;
        c.extra_closing_time = c.bid_end_time + e;
      }),
  },
  {
    id: "3.3.19",
    title: "EDGE start in the future (+1 day) keeps schedule",
    plain: "Add a stage that starts tomorrow and check the start time is kept.",
    mode: "graceful",
    req: (s, t) =>
      stage(s, (b) => {
        const c = b.configurations;
        c.bid_start_time += 86400;
        c.bid_end_time += 86400;
        c.extra_closing_time += 86400;
        t.produced.edgeStart = String(c.bid_start_time);
      }),
    more: (t, res) => {
      if (res.status === 200) t.check("The future start time was kept", () => expect(res.json.starting_from).toBe(Number(t.produced.edgeStart)));
    },
  },
  { id: "3.3.20", title: "EDGE empty audience on draft stage", plain: "Add a draft stage inviting nobody.", mode: "graceful", req: (s) => stage(s, (b) => (b.audience_company_uuids = [])) },
  {
    id: "3.3.21",
    title: "EDGE duplicate vendors in audience",
    plain: "Add a stage inviting every vendor twice.",
    mode: "graceful",
    req: (s) => stage(s, (b) => (b.audience_company_uuids = b.audience_company_uuids.concat(b.audience_company_uuids))),
  },
  { id: "3.3.22", title: "EDGE forms / RFQ rows empty []", plain: "Add a stage with no forms (RFP) or no priced rows (RFQ).", mode: "graceful", req: (s) => either(s, (b) => (b.forms = []), "empty") },
  { id: "3.3.23", title: "EDGE very long stage title (300 chars)", plain: "Add a stage with a 300-character title.", mode: "graceful", req: (s) => stage(s, (b) => (b.configurations.title = "T".repeat(300))) },
  {
    id: "3.3.24",
    title: "EDGE unicode / special chars in title",
    plain: "Add a stage titled in Hindi with HTML characters, and check the title comes back unchanged.",
    mode: "graceful",
    req: (s, t) =>
      stage(s, (b) => {
        b.configurations.title = `Tech Stage नमस्ते <b>&"'`;
        t.produced.edgeTitle = b.configurations.title;
      }),
    more: (t, res) => {
      if (res.status === 200) t.check("The title round-trips unchanged", () => expect(res.json.title).toBe(t.produced.edgeTitle));
    },
  },
];

// ── 3.3.25 – 3.3.37: RFQ only — the price sheet's own rules ──────────────
const rfqOnly = (id: string, title: string, plain: string, change: (b: any) => void, mode?: "graceful"): Omit<Neg, "anchor"> => ({
  id,
  title,
  plain,
  mode,
  onlyRfq: true,
  req: (s) => stage(s, change),
});
stageCases.push(
  rfqOnly("3.3.25", "RFQ creator_quantity 0 → 4xx", "Ask vendors to price zero of a product.", (b) => (b.data[0].creator_quantity.value = 0)),
  rfqOnly("3.3.26", "RFQ creator_quantity negative → 4xx", "Ask vendors to price −3 of a product.", (b) => (b.data[0].creator_quantity.value = -3)),
  rfqOnly("3.3.27", "RFQ creator_quantity text → 4xx", 'Ask vendors to price "abc" of a product.', (b) => (b.data[0].creator_quantity.value = "abc")),
  rfqOnly("3.3.28", "RFQ row product uuid differs from its line item → 4xx", "Put another product on a line item's price row.", (b) => {
    if (b.data.length > 1) b.data[0].product.uuid = b.data[1].product.uuid;
    else b.data[0].product.uuid = FAKE;
  }),
  rfqOnly("3.3.29", "RFQ invalid variant uuid → 4xx", "Price a variant that does not exist.", (b) => (b.data[0].variant.uuid = FAKE)),
  rfqOnly("3.3.30", "RFQ missing product widget → 4xx", "Build the price sheet without a product column.", (b) => {
    b.widgets.inline_components = b.widgets.inline_components.filter((w: any) => w.key_attribute !== "product");
  }),
  rfqOnly("3.3.31", "RFQ missing price widget → 4xx", "Build the price sheet without a price column.", (b) => {
    b.widgets.inline_components = b.widgets.inline_components.filter((w: any) => w.key_attribute !== "price");
    b.data.forEach((r: any) => delete r.price);
  }),
  rfqOnly("3.3.32", "RFQ invalid order_type → 4xx", 'Make the RFQ a "lease" instead of a buy or sell.', (b) => (b.configurations.order_type = "lease")),
  rfqOnly("3.3.33", "RFQ duplicate row for the same line item → 4xx", "Put the same line item on the price sheet twice.", (b) => {
    const r = clone(b.data[0]);
    r.order = b.data.length + 1;
    b.data.push(r);
  }),
  rfqOnly("3.3.34", "RFQ row order values not sequential", "Number the price rows 10, 20, 30 instead of 1, 2, 3.", (b) => b.data.forEach((r: any, i: number) => (r.order = (i + 1) * 10)), "graceful"),
  rfqOnly("3.3.35", "EDGE RFQ creator pre-fills participant price", "Fill in the vendor's price on the buyer's side.", (b) => (b.data[0].price.value = 100), "graceful"),
  rfqOnly("3.3.36", "EDGE RFQ creator_quantity differs from event line item qty", "Ask vendors to price a different quantity than the event's line item.", (b) => (b.data[0].creator_quantity.value = Number(b.data[0].creator_quantity.value) + 1), "graceful"),
  rfqOnly("3.3.37", "EDGE RFQ formula widget changed to write mode", "Make a calculated total editable.", (b) => {
    const w = b.widgets.inline_components.find((x: any) => x.input_type === "formula");
    if (w) w.configuration.mode_type = "write";
  }, "graceful"),
);
for (const c of stageCases) neg({ ...c, anchor: "1.9", heavy: true, needs: ["negEventGroupUuid", "cfgDefaults", "vendors"] });

// ── 3.4 Publish — validation ──────────────────────────────────────────────

/**
 * A publish aimed at the throwaway draft. If the app wrongly accepts it, the
 * draft goes live under this name — "_NEG" keeps it apart from the real event.
 */
const patchNeg = (s: RunState, body: any): Req => {
  if (body.title) body.title = `${body.title}_NEG`;
  return { method: "PATCH", path: `/api/event_groups/${q(s.negEventGroupUuid!)}`, body };
};

const publishCases: Array<Omit<Neg, "anchor">> = [
  {
    id: "3.4.1",
    title: "Publish non-existent event group → 404",
    plain: "Publish an event that does not exist.",
    codes: [404, 422, 400],
    req: (s) => ({ method: "PATCH", path: `/api/event_groups/${FAKE}`, body: buildPublishBody(s, FAKE) }),
  },
  { id: "3.4.2", title: "Publish with non-existent draft_trade_request_uuid → 4xx", plain: "Publish the draft with a stage that does not exist.", req: (s) => patchNeg(s, buildPublishBody(s, FAKE)) },
  {
    id: "3.4.3",
    title: "Publish with no stages (draft_trade_request_uuids []) → 4xx",
    plain: "Publish the draft with no stage at all.",
    req: (s) => {
      const b = buildPublishBody(s, "x");
      b.draft_trade_request_uuids = [];
      return patchNeg(s, b);
    },
    more: (t, res) => {
      if (res.status === 200) t.check("An event with no stage does not become active", () => expect(res.json.status).not.toBe("active"));
    },
  },
  {
    id: "3.4.4",
    title: "Publish with empty title → 4xx",
    plain: "Publish the draft with no title.",
    req: (s) => {
      const b = buildPublishBody(s, "x");
      b.title = "";
      b.draft_trade_request_uuids = [];
      return patchNeg(s, b);
    },
  },
  {
    id: "3.4.5",
    title: "Publish with invalid status → 4xx",
    plain: 'Publish the draft with the status "not_a_status".',
    req: (s) => {
      const b = buildPublishBody(s, "x");
      b.status = "not_a_status";
      b.draft_trade_request_uuids = [];
      return patchNeg(s, b);
    },
  },
  {
    id: "3.4.6",
    title: "Publish stage of ANOTHER event group → 4xx",
    plain: "Publish the throwaway draft using the stage that belongs to the real event.",
    needs: ["negEventGroupUuid", "tradeUuid"],
    req: (s) => patchNeg(s, buildPublishBody(s, s.tradeUuid!)),
  },
  {
    id: "3.4.7",
    title: "Publish with invalid audience vendor → 4xx",
    plain: "Publish the draft to a vendor that does not exist.",
    req: (s) => {
      const b = buildPublishBody(s, "x");
      b.draft_trade_request_uuids = [];
      b.audience_company_uuids = [FAKE];
      return patchNeg(s, b);
    },
  },
  {
    id: "3.4.8",
    title: "EDGE re-publish already published event (idempotency)",
    plain: "Publish the real event a second time and check nothing is duplicated.",
    mode: "graceful",
    needs: ["published"],
    req: (s) => ({ method: "PATCH", path: `/api/event_groups/${q(s.eventGroupUuid!)}`, body: buildPublishBody(s, s.tradeUuid!) }),
    more: (t, res) => {
      if (res.status === 200) {
        t.check("Still active", () => expect(res.json.status).toBe("active"));
        t.check("No duplicate stage was created", () => expect(res.json.stages).toHaveLength(1));
      }
    },
  },
];
for (const c of publishCases) neg({ ...c, anchor: "1.10", heavy: true, needs: c.needs ?? ["negEventGroupUuid", "selProducts"] });

// ── 3.5 Read endpoints — edge ─────────────────────────────────────────────

const li = (s: RunState, qs: string): Req => ({ method: "GET", path: `/api/event_groups/${q(s.eventGroupUuid!)}/get_line_items?${qs}` });

neg({ id: "3.5.1", title: "GET event group invalid uuid → 404", plain: "Open an event that does not exist.", anchor: "2.1", codes: [404, 403, 422, 400], needs: [], req: () => ({ method: "GET", path: `/api/event_groups/${FAKE}` }) });
neg({
  id: "3.5.2",
  title: "get_line_items page beyond last → empty data",
  plain: "Ask for page 9999 of the event's line items.",
  anchor: "2.2",
  mode: "graceful",
  needs: ["published"],
  req: (s) => li(s, "filters=%7B%7D&page=9999&query=&prevent_pagination=false"),
  more: (t, res) => {
    if (res.status === 200) t.check("No rows on a page past the end", () => expect(res.json.data).toEqual([]));
  },
});
neg({
  id: "3.5.3",
  title: "get_line_items query with no match → 0",
  plain: "Search the event's line items for text nothing contains.",
  anchor: "2.2",
  mode: "graceful",
  needs: ["published"],
  req: (s) => li(s, "filters=%7B%7D&page=1&query=zzqqxx_nomatch&prevent_pagination=false"),
  more: (t, res) => {
    if (res.status === 200) t.check("No rows", () => expect(res.json.data).toEqual([]));
  },
});
rfpCase(
  {
    id: "3.5.4",
    title: "get_line_items query by first product name → only matching rows",
    plain: "Search the event's line items for the first product's name.",
    expected: "The search works (200) and every row it returns is that product.",
    anchor: "2.2",
    part: "negative",
    kind: "edge",
    needs: ["published"],
  },
  async (t) => {
    const name = t.state.selProducts?.[0]?.name ?? "";
    const res = await t.api.call("GET", `/api/event_groups/${q(t.state.eventGroupUuid!)}/get_line_items?filters=%7B%7D&page=1&query=${q(name)}&prevent_pagination=false`);
    t.basic(res, { status: 200 });
    if (name && res.json?.data) {
      t.check("Every row matches the search", () =>
        res.json.data.forEach((d: any) => expect(String(d.title).toLowerCase()).toContain(name.toLowerCase())),
      );
    }
    t.actual(`${res.json?.data?.length ?? 0} row(s) for "${name}".`);
  },
);
neg({ id: "3.5.5", title: "get_line_items invalid filters JSON → no 5xx", plain: "Filter the event's line items with broken JSON.", anchor: "2.2", mode: "graceful", needs: ["published"], req: (s) => li(s, "filters=%7Bbad&page=1&query=&prevent_pagination=false") });
neg({ id: "3.5.6", title: "get_line_items page=0 / negative → no 5xx", plain: "Ask for page −1 of the event's line items.", anchor: "2.2", mode: "graceful", needs: ["published"], req: (s) => li(s, "filters=%7B%7D&page=-1&query=&prevent_pagination=false") });
neg({ id: "3.5.7", title: "Stage schema invalid trade uuid → 404", plain: "Open the forms of a stage that does not exist.", anchor: "2.5", codes: [404, 403, 422, 400], needs: [], req: () => ({ method: "GET", path: `/api/v1/trade/${FAKE}/schema?response_type=template&additional_fields=order_details` }) });
neg({ id: "3.5.8", title: "Template detail invalid uuid → 404", plain: "Open a template that does not exist.", anchor: "1.5", codes: [404, 403, 422, 400], needs: [], req: () => ({ method: "GET", path: `/api/templates/${FAKE}` }) });
neg({
  id: "3.5.9",
  title: "Templates list invalid type_identifier → empty or 4xx",
  plain: "List templates of a type that does not exist.",
  anchor: "1.4",
  mode: "graceful",
  needs: [],
  req: () => ({ method: "GET", path: "/api/templates?type_identifier=not_a_type&hide_onboarding_v2_templates=true" }),
  more: (t, res) => {
    if (res.status === 200) t.check("No templates for an unknown type", () => expect((res.json.saved || []).length).toBe(0));
  },
});
neg({
  id: "3.5.10",
  title: "Vendor list page beyond total_pages → empty",
  plain: "Ask for page 9999 of the vendor list.",
  anchor: "1.7",
  mode: "graceful",
  needs: ["productCsv"],
  req: (s) => ({ method: "GET", path: `/api/companies/vendorlist_filtered?query=a&product_uuids=${s.productCsv}&page=9999` }),
  more: (t, res) => {
    if (res.status === 200) t.check("No vendors on a page past the end", () => expect(res.json.companies).toEqual([]));
  },
});
neg({ id: "3.5.11", title: "Vendor list with invalid product uuid → no 5xx", plain: "List vendors for a product that does not exist.", anchor: "1.7", mode: "graceful", needs: [], req: () => ({ method: "GET", path: `/api/companies/vendorlist_filtered?query=a&product_uuids=${FAKE}&page=1` }) });
neg({ id: "3.5.12", title: "Product search empty query → no 5xx", plain: "Search products for nothing.", anchor: "1.2", mode: "graceful", heavy: true, needs: [], req: () => ({ method: "GET", path: "/api/products/search?query=" }) });
neg({
  id: "3.5.13",
  title: "Product search no match → empty products",
  plain: "Search products for text nothing contains.",
  anchor: "1.2",
  mode: "graceful",
  heavy: true,
  needs: [],
  req: () => ({ method: "GET", path: "/api/products/search?query=zzqqxx_nomatch_987" }),
  more: (t, res) => {
    if (res.status === 200) t.check("No products", () => expect(res.json.products).toEqual([]));
  },
});
neg({ id: "3.5.14", title: "get_all_users invalid filters JSON → no 5xx", plain: "Filter users with broken JSON.", anchor: "1.6", mode: "graceful", needs: [], req: () => ({ method: "GET", path: "/api/get_all_users?filters=%7Bbad&include_current_user=false" }) });
neg({ id: "3.5.15", title: "Bidder stats invalid trade uuid → 404", plain: "Read the invitations of a stage that does not exist.", anchor: "2.6", codes: [404, 403, 422, 400], needs: [], req: () => ({ method: "GET", path: `/api/trade/${FAKE}/bidders_delivery_stats` }) });

rfpCase(
  {
    id: "3.5.99",
    title: "NEG Summary — leaked resources",
    plain: "After all the negative cases, check the throwaway draft is still a draft and no invalid payload created anything.",
    expected: "The draft is still a draft (200), and no invalid request created a record.",
    anchor: "1.10",
    part: "negative",
    kind: "negative",
    needs: ["negEventGroupUuid"],
  },
  async (t) => {
    const res = await t.api.call("GET", `/api/event_groups/${q(t.state.negEventGroupUuid!)}`);
    t.basic(res, { status: 200, sla: "heavy" });
    if (res.json) t.check("The throwaway draft is still a draft (no invalid publish activated it)", () => expect(res.json.status).toBe("draft"));
    const leaks = t.state.negLeaks ?? [];
    t.check("No invalid payload created a record", () => expect(leaks, JSON.stringify(leaks)).toEqual([]));
    t.actual(
      leaks.length
        ? `${leaks.length} invalid request(s) created a record: ${leaks.map((l) => `${l.request} → ${l.uuid}`).join("; ")}.`
        : `The draft is ${res.json?.status}; no invalid request created a record.`,
    );
  },
);
