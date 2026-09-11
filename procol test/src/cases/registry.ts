import { Endpoints } from "../api/endpoints.js";
import { ApiCase } from "./types.js";

/**
 * THE CASE TABLE — every negative and edge case the framework knows how to run,
 * grouped by the flow it belongs to.
 *
 * Read alongside `src/master/registry.ts`, which holds the positive flows. That
 * registry proves the product does what it should; this one proves it refuses
 * what it should and holds together at the boundaries.
 *
 * To add a case, add an entry. Nothing else changes.
 */

/** A base64 string that decodes to nonsense — not the app's key:secret:token.
 * Exported so the runner sends exactly the value this case describes. */
export const MALFORMED_ACCESS_TOKEN = Buffer.from("not-a-real-token").toString("base64");

/** A uuid-shaped value that is well-formed but belongs to nothing. */
const ABSENT_UUID = "ZZZZZZZZ";

/** Path segments that must be treated as data, never interpreted. */
const HOSTILE_SEGMENTS = {
  traversal: "../../../etc/passwd",
  sqlish: "1' OR '1'='1",
  script: "<script>alert(1)</script>",
};

const validLineItem = (ctx: { catalog: { productUuid: string; productQualityUuid: string } }) => ({
  product_uuid: ctx.catalog.productUuid,
  quantity: { unitSymbol: "kg", value: 10 },
  product_quality_uuid: ctx.catalog.productQualityUuid,
});

export const CASES: ApiCase[] = [
  // ══════════════════════════════════════════════════════════════════════
  // auth — the credential contract
  // ══════════════════════════════════════════════════════════════════════
  {
    id: "auth.no_credentials",
    flowKey: "auth",
    flowTitle: "Authentication & authorization",
    title: "an authenticated endpoint refuses a request with no credentials",
    kind: "negative",
    expects: "reject",
    because:
      "any 2xx here means the endpoint serves tenant data to anyone who knows the URL",
    build: () => ({
      method: "GET",
      path: Endpoints.dashboardConfiguration(),
      auth: "none",
    }),
  },
  {
    id: "auth.malformed_token",
    flowKey: "auth",
    flowTitle: "Authentication & authorization",
    title: "a malformed access-token is refused, not parsed loosely",
    kind: "negative",
    expects: "reject",
    because:
      "the token is base64(key:secret:session); a value that does not decode to three parts must fail closed",
    build: () => ({
      method: "GET",
      path: Endpoints.dashboardConfiguration(),
      auth: "malformed",
    }),
  },
  {
    id: "auth.wrong_secret",
    flowKey: "auth",
    flowTitle: "Authentication & authorization",
    title: "a correctly shaped token with the wrong app secret is refused",
    kind: "negative",
    expects: "reject",
    because:
      "the shape of the token must not be mistaken for proof of it — the secret has to be verified",
    build: () => ({
      method: "GET",
      path: Endpoints.dashboardConfiguration(),
      auth: "wrongSecret",
    }),
  },
  {
    id: "auth.no_lightspeed_token",
    flowKey: "auth",
    flowTitle: "Authentication & authorization",
    title: "a valid access-token with no lightspeed-token gets a deliberate answer",
    kind: "edge",
    expects: "no-server-error",
    because:
      "the app always sends both headers, so the server's behaviour with one missing is undocumented — it must be decided, not accidental",
    build: () => ({
      method: "GET",
      path: Endpoints.dashboardConfiguration(),
      auth: "noLightspeed",
    }),
  },
  {
    id: "auth.token_in_query",
    flowKey: "auth",
    flowTitle: "Authentication & authorization",
    title: "credentials passed as a query parameter are not accepted",
    kind: "negative",
    expects: "reject",
    because:
      "a token accepted from the query string ends up in access logs, proxies and browser history",
    build: (ctx) => ({
      method: "GET",
      path: Endpoints.dashboardConfiguration(),
      params: { "access-token": ctx.buyer.authTokens.accessToken },
      auth: "none",
    }),
  },

  // ══════════════════════════════════════════════════════════════════════
  // reads.orders — pagination and filter robustness
  // ══════════════════════════════════════════════════════════════════════
  {
    id: "reads.orders.page_zero",
    flowKey: "reads.orders",
    flowTitle: "Purchase order list (reads)",
    title: "page=0 is handled without a server error",
    kind: "edge",
    expects: "no-server-error",
    because: "pages are 1-based; 0 is the classic off-by-one a UI sends by accident",
    build: () => ({ method: "GET", path: Endpoints.orders(), params: { page: 0 } }),
  },
  {
    id: "reads.orders.page_negative",
    flowKey: "reads.orders",
    flowTitle: "Purchase order list (reads)",
    title: "a negative page number is handled without a server error",
    kind: "edge",
    expects: "no-server-error",
    because: "a negative offset reaching the query layer is how pagination turns into an error page",
    build: () => ({ method: "GET", path: Endpoints.orders(), params: { page: -1 } }),
  },
  {
    id: "reads.orders.page_beyond_end",
    flowKey: "reads.orders",
    flowTitle: "Purchase order list (reads)",
    title: "a page far past the last one returns an empty list, not an error",
    kind: "edge",
    expects: "accept",
    because: "paging past the end is normal client behaviour and must be answered, not refused",
    build: () => ({ method: "GET", path: Endpoints.orders(), params: { page: 999999 } }),
  },
  {
    id: "reads.orders.page_not_a_number",
    flowKey: "reads.orders",
    flowTitle: "Purchase order list (reads)",
    title: "a non-numeric page is handled without a server error",
    kind: "negative",
    expects: "no-server-error",
    because: "type coercion on a query param must happen before it reaches the database",
    build: () => ({ method: "GET", path: Endpoints.orders(), params: { page: "not-a-number" } }),
  },
  {
    id: "reads.orders.unknown_tab",
    flowKey: "reads.orders",
    flowTitle: "Purchase order list (reads)",
    title: "an unknown tab value is handled without a server error",
    kind: "negative",
    expects: "no-server-error",
    because:
      "tab drives a server-side filter; an unrecognised value must not fall through to an unfiltered or failing query",
    build: () => ({ method: "GET", path: Endpoints.orders(), params: { tab: "not-a-real-tab" } }),
  },
  {
    id: "reads.orders.huge_per_page",
    flowKey: "reads.orders",
    flowTitle: "Purchase order list (reads)",
    title: "an oversized per_page is capped or refused, not served in full",
    kind: "edge",
    expects: "no-server-error",
    because:
      "an uncapped page size is a one-request denial of service and a slow path for every caller",
    build: () => ({ method: "GET", path: Endpoints.orders(), params: { page: 1, per_page: 100000 } }),
  },
  {
    id: "reads.orders.sql_in_filter",
    flowKey: "reads.orders",
    flowTitle: "Purchase order list (reads)",
    title: "SQL syntax in a filter value is treated as data",
    kind: "negative",
    expects: "no-server-error",
    because:
      "the value must reach the database as a bound parameter; a 500 here suggests it reached it as SQL",
    build: () => ({
      method: "GET",
      path: Endpoints.orders(),
      params: { tab: HOSTILE_SEGMENTS.sqlish },
    }),
  },

  // ══════════════════════════════════════════════════════════════════════
  // reads.event — addressing a single record
  // ══════════════════════════════════════════════════════════════════════
  {
    id: "reads.event.absent_uuid",
    flowKey: "reads.event",
    flowTitle: "Event group detail (reads)",
    title: "a well-formed uuid that matches no event returns a client error",
    kind: "negative",
    expects: "reject",
    because: "a missing record is a 404, never a 200 with an empty body or a 500",
    build: () => ({ method: "GET", path: Endpoints.eventGroup(ABSENT_UUID) }),
  },
  {
    id: "reads.event.path_traversal",
    flowKey: "reads.event",
    flowTitle: "Event group detail (reads)",
    title: "a path-traversal sequence in the uuid is not interpreted as a path",
    kind: "negative",
    expects: "reject",
    because: "the segment must be treated as an identifier, never joined onto a filesystem path",
    build: () => ({
      method: "GET",
      path: Endpoints.eventGroup(encodeURIComponent(HOSTILE_SEGMENTS.traversal)),
    }),
  },
  {
    id: "reads.event.script_in_uuid",
    flowKey: "reads.event",
    flowTitle: "Event group detail (reads)",
    title: "a script tag in the uuid is refused cleanly",
    kind: "edge",
    expects: "reject",
    because: "the id is echoed in error messages; it must be inert wherever it is rendered",
    build: () => ({
      method: "GET",
      path: Endpoints.eventGroup(encodeURIComponent(HOSTILE_SEGMENTS.script)),
    }),
  },
  {
    id: "reads.event.wrong_identity",
    flowKey: "reads.event",
    flowTitle: "Event group detail (reads)",
    title: "an existing event cannot be read without credentials",
    kind: "negative",
    expects: "reject",
    because:
      "object-level authorization has to be checked per request, not assumed from knowing the uuid",
    needsExistingEvent: true,
    build: (ctx) => ({
      method: "GET",
      path: Endpoints.eventGroup(ctx.existingEventUuid!),
      auth: "none",
    }),
  },

  // ══════════════════════════════════════════════════════════════════════
  // events.create — the create-event payload contract
  // ══════════════════════════════════════════════════════════════════════
  {
    id: "events.create.valid_draft",
    flowKey: "events.create",
    flowTitle: "Create event group (validation)",
    title: "a draft event group with one valid line item is accepted",
    kind: "positive",
    expects: "accept",
    because:
      "the baseline every negative case below is measured against — without it, a server refusing everything would look correct",
    build: (ctx) => ({
      method: "POST",
      path: Endpoints.eventGroups(),
      body: { status: "draft", line_items: [validLineItem(ctx)] },
    }),
  },
  {
    id: "events.create.empty_body",
    flowKey: "events.create",
    flowTitle: "Create event group (validation)",
    title: "an empty request body is refused",
    kind: "negative",
    expects: "reject",
    because: "mandatory fields must be enforced server-side, not only by the form that submits them",
    build: () => ({ method: "POST", path: Endpoints.eventGroups(), body: {} }),
  },
  {
    id: "events.create.no_line_items",
    flowKey: "events.create",
    flowTitle: "Create event group (validation)",
    title: "an event group with no line_items key is refused",
    kind: "negative",
    expects: "reject",
    because: "an event with nothing to buy is not a valid document",
    build: () => ({ method: "POST", path: Endpoints.eventGroups(), body: { status: "draft" } }),
  },
  {
    id: "events.create.empty_line_items",
    flowKey: "events.create",
    flowTitle: "Create event group (validation)",
    title: "an event group with an empty line_items array is refused",
    kind: "negative",
    expects: "reject",
    because:
      "an empty array is a different bug from a missing key — it passes a presence check but is equally meaningless",
    build: () => ({
      method: "POST",
      path: Endpoints.eventGroups(),
      body: { status: "draft", line_items: [] },
    }),
  },
  {
    id: "events.create.absent_product",
    flowKey: "events.create",
    flowTitle: "Create event group (validation)",
    title: "a line item naming a product that does not exist is refused",
    kind: "negative",
    expects: "reject",
    because:
      "the product uuid is client-supplied; accepting an unknown one creates an event referencing nothing. Observed: HTTP 500, so the unknown id reaches code that assumes it resolved.",
    build: (ctx) => ({
      method: "POST",
      path: Endpoints.eventGroups(),
      body: {
        status: "draft",
        line_items: [{ ...validLineItem(ctx), product_uuid: ABSENT_UUID }],
      },
    }),
  },
  {
    id: "events.create.foreign_product",
    flowKey: "events.create",
    flowTitle: "Create event group (validation)",
    title: "a product uuid is validated against the caller's own company",
    kind: "negative",
    expects: "reject",
    because:
      "product uuids are per company; one from another tenant must not be usable, and this is where that would show",
    skip:
      "needs a product uuid belonging to a different company — fill one in to enable this case",
    build: (ctx) => ({
      method: "POST",
      path: Endpoints.eventGroups(),
      body: { status: "draft", line_items: [validLineItem(ctx)] },
    }),
  },
  {
    id: "events.create.negative_quantity",
    flowKey: "events.create",
    flowTitle: "Create event group (validation)",
    title: "a negative quantity is refused",
    kind: "negative",
    expects: "reject",
    because:
      "you cannot tender for a negative amount, whatever the column type allows. Observed: HTTP 200 — the draft is created with quantity -5.",
    build: (ctx) => ({
      method: "POST",
      path: Endpoints.eventGroups(),
      body: {
        status: "draft",
        line_items: [{ ...validLineItem(ctx), quantity: { unitSymbol: "kg", value: -5 } }],
      },
    }),
  },
  {
    id: "events.create.zero_quantity",
    flowKey: "events.create",
    flowTitle: "Create event group (validation)",
    title: "a zero quantity gets a deliberate answer",
    kind: "edge",
    expects: "no-server-error",
    because:
      "zero is a real number and a plausible draft state; whether it is allowed must be a decision, not an accident",
    build: (ctx) => ({
      method: "POST",
      path: Endpoints.eventGroups(),
      body: {
        status: "draft",
        line_items: [{ ...validLineItem(ctx), quantity: { unitSymbol: "kg", value: 0 } }],
      },
    }),
  },
  {
    id: "events.create.text_quantity",
    flowKey: "events.create",
    flowTitle: "Create event group (validation)",
    title: "text in the numeric quantity field is refused",
    kind: "negative",
    expects: "reject",
    because:
      "type enforcement must happen server-side, not only in the UI's number input. Observed: HTTP 200 — a non-numeric quantity is stored.",
    build: (ctx) => ({
      method: "POST",
      path: Endpoints.eventGroups(),
      body: {
        status: "draft",
        line_items: [
          { ...validLineItem(ctx), quantity: { unitSymbol: "kg", value: "not-a-number" } },
        ],
      },
    }),
  },
  {
    id: "events.create.huge_quantity",
    flowKey: "events.create",
    flowTitle: "Create event group (validation)",
    title: "a quantity beyond a 64-bit float's exact range does not corrupt the value",
    kind: "edge",
    expects: "no-server-error",
    because:
      "quantity feeds every downstream total; silent precision loss would misprice the whole event",
    build: (ctx) => ({
      method: "POST",
      path: Endpoints.eventGroups(),
      body: {
        status: "draft",
        line_items: [
          { ...validLineItem(ctx), quantity: { unitSymbol: "kg", value: 9_007_199_254_740_993 } },
        ],
      },
    }),
  },
  {
    id: "events.create.unknown_unit",
    flowKey: "events.create",
    flowTitle: "Create event group (validation)",
    title: "an unrecognised quantity unit is refused",
    kind: "negative",
    expects: "reject",
    because:
      "the unit travels with the number everywhere; an unknown symbol makes every later comparison meaningless. Observed: HTTP 200 — the unknown unit is accepted.",
    build: (ctx) => ({
      method: "POST",
      path: Endpoints.eventGroups(),
      body: {
        status: "draft",
        line_items: [
          { ...validLineItem(ctx), quantity: { unitSymbol: "NOT_A_UNIT", value: 10 } },
        ],
      },
    }),
  },
  {
    id: "events.create.unknown_status",
    flowKey: "events.create",
    flowTitle: "Create event group (validation)",
    title: "an unknown status value is refused",
    kind: "negative",
    expects: "reject",
    because:
      "status is a state machine; an unrecognised value must not create a record in a state nothing can handle. Observed: HTTP 500 rather than a validation error.",
    build: (ctx) => ({
      method: "POST",
      path: Endpoints.eventGroups(),
      body: { status: "not-a-status", line_items: [validLineItem(ctx)] },
    }),
  },
  {
    id: "events.create.active_without_stages",
    flowKey: "events.create",
    flowTitle: "Create event group (validation)",
    title: "an event cannot be created already active, skipping its stages",
    kind: "negative",
    expects: "reject",
    because:
      "publishing is a separate, validated step; creating in the published state would bypass every check in it. Observed: HTTP 500 rather than a refusal.",
    build: (ctx) => ({
      method: "POST",
      path: Endpoints.eventGroups(),
      body: { status: "active", line_items: [validLineItem(ctx)] },
    }),
  },
  {
    id: "events.create.wrong_content_type",
    flowKey: "events.create",
    flowTitle: "Create event group (validation)",
    title: "a JSON body sent as text/plain gets a deliberate answer",
    kind: "edge",
    expects: "no-server-error",
    because:
      "plenty of APIs deliberately ignore Content-Type, so a 4xx is not required here — what matters is that the server decides rather than crashing. Observed: it accepts the body and creates the record.",
    build: (ctx) => ({
      method: "POST",
      path: Endpoints.eventGroups(),
      body: { status: "draft", line_items: [validLineItem(ctx)] },
      headers: { "Content-Type": "text/plain" },
    }),
  },
  {
    id: "events.create.unauthenticated",
    flowKey: "events.create",
    flowTitle: "Create event group (validation)",
    title: "an event group cannot be created without credentials",
    kind: "negative",
    expects: "reject",
    because: "a write endpoint reachable anonymously lets anyone put records in another tenant",
    build: (ctx) => ({
      method: "POST",
      path: Endpoints.eventGroups(),
      body: { status: "draft", line_items: [validLineItem(ctx)] },
      auth: "none",
    }),
  },
  {
    id: "events.create.duplicate_line_items",
    flowKey: "events.create",
    flowTitle: "Create event group (validation)",
    title: "the same product twice in one event gets a deliberate answer",
    kind: "edge",
    expects: "no-server-error",
    because:
      "buyers do split one product across delivery locations, so this is either valid or must be refused clearly",
    build: (ctx) => ({
      method: "POST",
      path: Endpoints.eventGroups(),
      body: { status: "draft", line_items: [validLineItem(ctx), validLineItem(ctx)] },
    }),
  },

  // ══════════════════════════════════════════════════════════════════════
  // method contract — the same path under the wrong verb
  // ══════════════════════════════════════════════════════════════════════
  {
    id: "http.delete_event_groups_collection",
    flowKey: "http.methods",
    flowTitle: "HTTP method contract",
    title: "DELETE on the event-group collection is not allowed",
    kind: "negative",
    expects: "reject",
    because:
      "a collection-level DELETE that is not explicitly refused is the worst possible accident",
    build: () => ({ method: "DELETE", path: Endpoints.eventGroups() }),
  },
  {
    id: "http.put_dashboard_configuration",
    flowKey: "http.methods",
    flowTitle: "HTTP method contract",
    title: "PUT on a read-only configuration endpoint is not allowed",
    kind: "negative",
    expects: "reject",
    because: "a read endpoint that quietly accepts writes is an unaudited way to change tenant config",
    build: () => ({
      method: "PUT",
      path: Endpoints.dashboardConfiguration(),
      body: { anything: true },
    }),
  },
  {
    id: "http.unknown_path",
    flowKey: "http.methods",
    flowTitle: "HTTP method contract",
    title: "an unknown path returns a client error, not a server error",
    kind: "edge",
    expects: "reject",
    because: "a 500 on an unrouted path leaks stack traces and framework versions",
    build: () => ({ method: "GET", path: "/v1/this_endpoint_does_not_exist" }),
  },
  {
    id: "http.malformed_json",
    flowKey: "http.methods",
    flowTitle: "HTTP method contract",
    title: "a syntactically invalid JSON body is refused with a client error",
    kind: "negative",
    expects: "reject",
    because: "a broken body is the caller's fault; it must read as 400, not as the server failing",
    build: () => ({
      method: "POST",
      path: Endpoints.eventGroups(),
      // rawBody, not body: `body` would JSON-encode this into a valid JSON
      // string and the server would never see malformed input.
      rawBody: "{ this is not valid json",
    }),
  },
];

/** Cases grouped by flow, in table order. */
export function casesByFlow(): Map<string, ApiCase[]> {
  const byFlow = new Map<string, ApiCase[]>();
  for (const testCase of CASES) {
    byFlow.set(testCase.flowKey, [...(byFlow.get(testCase.flowKey) ?? []), testCase]);
  }
  return byFlow;
}
