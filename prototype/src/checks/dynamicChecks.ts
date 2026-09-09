/**
 * REQUEST-DRIVEN EXECUTABLE CHECKS — the bridge that makes the platform dynamic.
 *
 * THE PROBLEM THIS SOLVES
 * Until now the platform had two disconnected halves: the LLM wrote test cases as
 * PROSE (shown in the UI), while the checks that actually EXECUTED came from
 * hardcoded suites. So "test bidding and awarding" ran the same title/quantity
 * fuzzing as every other event request — the automation could never follow the
 * user's actual command.
 *
 * WHAT THIS DOES
 * The LLM now writes EXECUTABLE checks — real method + path + body + expected
 * outcome — grounded in Procol's real endpoints, which the same engine then fires
 * live. Ask for "technical event bid and award" and you get stage, bid and award
 * checks; ask about vendors and you get vendor checks.
 *
 * SAFETY (non-negotiable)
 * An LLM must never be free to fire arbitrary requests at a live system, so every
 * generated check passes a hard gate before it can run:
 *   1. the method+path must match the ALLOWLIST below — anything else is dropped;
 *   2. DELETE is never allowed, at all;
 *   3. any title/name we send is forced to the QA_Platform_ sandbox prefix;
 *   4. unresolved {{placeholders}} mean the check is dropped, never fired blind.
 * Dropped checks are reported, never silently swallowed.
 */
import { chat } from "../ai/llm.js";
import { TUNABLES } from "../../config/settings.js";
import type { TestType } from "../ai/types.js";
import { Check, Client, apiAttempt, apiGet, apiPatch } from "./engine.js";

// ── 1. the allowlist: the only requests a generated check may ever make ────
interface AllowRule {
  method: "GET" | "POST" | "PATCH" | "PUT";
  re: RegExp;
  what: string;
}
const ALLOW: AllowRule[] = [
  // reads — always safe
  { method: "GET", re: /^\/orders(\?|$)/, what: "list events/orders" },
  { method: "GET", re: /^\/event_groups\/[^/]+(\/[a-z_]+)?(\?|$)/, what: "read an event group" },
  { method: "GET", re: /^\/trade\/[^/]+(\?|$)/, what: "read a trade/stage" },
  { method: "GET", re: /^\/v1\/trade\/[^/]+\/[a-z_]+(\?|$)/, what: "read trade schema/indicators" },
  { method: "GET", re: /^\/purchase_requests(\/[^/]+)?(\?|$)/, what: "read purchase requests" },
  { method: "GET", re: /^\/products(\/|\?|$)/, what: "read products" },
  { method: "GET", re: /^\/product_categories(\/|\?|$)/, what: "read categories" },
  { method: "GET", re: /^\/buyer_hubs(\/|\?|$)/, what: "read locations" },
  { method: "GET", re: /^\/teams(\/|\?|$)/, what: "read teams" },
  { method: "GET", re: /^\/get_all_users(\?|$)/, what: "read users" },
  { method: "GET", re: /^\/companies\/(all_vendors|vendorlist_filtered)(\?|$)/, what: "read vendors" },
  { method: "GET", re: /^\/templates(\/|\?|$)/, what: "read templates" },
  { method: "GET", re: /^\/cities\/autocomplete(\?|$)/, what: "city lookup" },
  { method: "GET", re: /^\/vendor_entity_mappings(\/[a-z_]+)?(\?|$)/, what: "read vendor-entity mappings" },
  { method: "GET", re: /^\/v1\/dashboard_configuration(\?|$)/, what: "read dashboard config" },
  // writes — only these sandbox-safe creates, always QA_Platform_-prefixed
  { method: "POST", re: /^\/event_groups$/, what: "create a draft event" },
  { method: "POST", re: /^\/trade\/template_input(\?|$)/, what: "add a stage to an event" },
  { method: "POST", re: /^\/trade\/move_to_auction$/, what: "convert a stage to auction" },
  { method: "POST", re: /^\/v1\/trade\/add_audience(\?|$)/, what: "invite vendors to a stage" },
  { method: "POST", re: /^\/template_responses(\/[^/]+\/create_page_responses)?$/, what: "technical response" },
  { method: "POST", re: /^\/template_responses\/create_surrogate_response$/, what: "surrogate technical response" },
  { method: "POST", re: /^\/bids\/template_input$/, what: "surrogate RFQ bid" },
  { method: "POST", re: /^\/v1\/bids$/, what: "create a bid" },
  { method: "POST", re: /^\/evaluations(\/submit)?$/, what: "evaluate a technical stage" },
  { method: "POST", re: /^\/proposal$/, what: "create an award proposal" },
  { method: "POST", re: /^\/proposal\/[^/]+\/(add_response|approval_workflows|submit)(\?|$)/, what: "award proposal steps" },
  { method: "POST", re: /^\/product_categories$/, what: "create a category" },
  { method: "POST", re: /^\/products$/, what: "create a product" },
  { method: "POST", re: /^\/teams$/, what: "create a team" },
  { method: "POST", re: /^\/buyer_hubs\/create$/, what: "create a location" },
  { method: "POST", re: /^\/users\/create_user$/, what: "create a user" },
  { method: "PATCH", re: /^\/event_groups\/[^/]+$/, what: "publish/update an event" },
  { method: "PATCH", re: /^\/v1\/bids\/[^/]+$/, what: "submit a bid" },
];

/**
 * EXTRA endpoints allowed ONLY for the curated case library — never for
 * AI-generated checks.
 *
 * Why the split: every curated case here was written and reviewed against the
 * backend source, so we know (for example) that the vendor-entity-mapping
 * negatives all reject BEFORE the ERP dispatch fires. An LLM improvising at run
 * time has no such guarantee, so it stays on the narrower list above and can
 * never reach an endpoint that might call a customer's ERP.
 */
const ALLOW_CURATED: AllowRule[] = [
  { method: "PATCH", re: /^\/purchase_requests\/partial_close$/, what: "partially close PR items" },
  { method: "POST", re: /^\/event_groups\/[^/]+\/pri_to_draft_project$/, what: "pull PR items into a draft event" },
  // Negative cases only — these reject before any ERP sync (verified in source).
  { method: "POST", re: /^\/vendor_entity_mappings$/, what: "vendor-entity mapping validation ladder" },
  { method: "GET", re: /^\/teams\/get_all(\?|$)/, what: "team names" },
  { method: "GET", re: /^\/cities\/[a-z_]+(\?|$)/, what: "city lookups" },
  { method: "POST", re: /^\/item_versions$/, what: "version an event's items" },
  { method: "POST", re: /^\/v1\/bids\/[^/]+\/create_bid_products$/, what: "add products to a bid" },

  // ── Intake / PO / delivery / payment ──────────────────────────────────
  // Reviewed individually. Every WRITE case on these paths is neutralised by a
  // bogus id, a garbage payload, or a token that doesn't resolve — so it fails
  // before any side effect. The only case that can persist anything creates a
  // clearly-labelled QA_Platform_ sandbox intake.
  { method: "GET", re: /^\/intake_requests\/(configs|draft)(\?|$)/, what: "intake config/draft reads" },
  { method: "GET", re: /^\/intake_requests\/[^/]+\/[a-z_]+(\?|$)/, what: "intake approvals/steps reads" },
  { method: "POST", re: /^\/intake_requests$/, what: "create an intake (sandbox record)" },
  { method: "POST", re: /^\/intake_requests\/[^/]+\/(issue_request|withdraw_request|purchase_request)$/, what: "intake actions" },
  { method: "PATCH", re: /^\/intake_requests\/[^/]+(\/(share|publish))?$/, what: "intake update/share/publish" },
  { method: "PUT", re: /^\/intake_requests\/[^/]+$/, what: "intake update" },
  { method: "GET", re: /^\/orders(\/[^/]+)?(\?|$)/, what: "order/PO reads" },
  { method: "GET", re: /^\/purchase_orders(\/[a-z_-]+)?(\?|$)/, what: "purchase-order list reads" },
  { method: "POST", re: /^\/orders\/[^/]+\/create_po$/, what: "PO creation (negatives only)" },
  { method: "POST", re: /^\/orders\/(update_po_status|update_po)$/, what: "PO status/detail update (negatives only)" },
  { method: "PATCH", re: /^\/orders\/(retry_po|vendor_code)$/, what: "PO retry / vendor code (negatives only)" },
  { method: "GET", re: /^\/released_notes(\?|$)/, what: "released notes read" },
  { method: "GET", re: /^\/delivery\/all(\?|$)/, what: "delivery tracking read" },
  { method: "POST", re: /^\/delivery\/add_dispatch_details$/, what: "dispatch details (negatives only)" },
  { method: "POST", re: /^\/vendor_payments\/submit_proof$/, what: "payment proof (negatives only)" },
];

/** The endpoint menu the LLM is shown — kept in sync with ALLOW above. */
const ENDPOINT_MENU = `
READS (safe, use freely for negative/robustness checks):
  GET /orders                                   list this client's events
  GET /event_groups/{uuid}                      read one event group
  GET /event_groups/{uuid}/get_line_items       its line items
  GET /event_groups/{uuid}/get_audience         invited vendors
  GET /trade/{tradeId}?response_type=template   read a stage
  GET /v1/trade/{tradeId}/event_indicators      stage indicators
  GET /purchase_requests?page=1                 list PRs
  GET /products/search?query=X                  product search
  GET /get_all_users?filters={"statuses":["active"]}
  GET /companies/all_vendors?page=1             vendor list

WRITES (sandbox-safe; every title/name MUST start with "QA_Platform_"):
  POST /event_groups                            {status:"draft", title, line_items:[{product_uuid, product_quality_uuid, quantity:{unitSymbol:"Nos", value:10}}]}
  POST /trade/template_input?template_name=trade&additional_fields=order_details
                                                add a stage: {event_group_uuid, stage_no, rfx_mode:"rfp"|"rfq"|"auction", ...}
  POST /trade/move_to_auction                   {trade_request_uuid}
  POST /v1/trade/add_audience?id={tradeId}      {audience_company_uuids:[...]}
  POST /template_responses/create_surrogate_response   buyer answers a technical stage for a vendor
  POST /bids/template_input                     surrogate RFQ bid
  POST /evaluations   /evaluations/submit       score a technical stage
  POST /proposal                                start an award proposal
  POST /proposal/{proposalUuid}/add_response    add award lines
  POST /proposal/{proposalUuid}/submit          submit the award
  PATCH /event_groups/{uuid}                    publish: {status:"active", draft_trade_request_uuids:[...], audience_company_uuids:[...]}
`.trim();

/** Values the LLM may reference as {{placeholders}} — we substitute real ones. */
export interface DynamicContext {
  productUuid?: string;
  productQualityUuid?: string;
  locationUuid?: string;
  vendorUuid?: string;
  eventGroupUuid?: string;
  tradeId?: string;
  stamp?: string;
  // Resolved from the live client by resolveCaseContext() for library cases.
  prId?: string | number;
  prItemId?: string | number;
  vendorCompanyId?: string | number;
  categoryUuid?: string;
  familyUuid?: string;
  cityUuid?: string;
  teamUuid?: string;
  userUuid?: string;
  bidUuid?: string;
  proposalUuid?: string;
  // Downstream documents (PO → invoice → GRN → bill). Like tradeId/proposalUuid
  // these name REAL financial records, so they resolve only behind the
  // allowExistingRecordWrites opt-in.
  orderUuid?: string;
  poUuid?: string;
  invoiceUuid?: string;
  grnUuid?: string;
  billUuid?: string;
}

export interface DynamicSpec {
  scenario: string;
  method: string;
  path: string;
  body?: any;
  expected: string;
  category: string;
  severity: string;
  rationale: string;
}

export interface GenerationOutcome {
  checks: Check[];
  dropped: { scenario: string; reason: string }[];
  raw: number;
}

// ── 2. generation ─────────────────────────────────────────────────────────
function buildPrompt(request: string, ctx: DynamicContext, flows: string[]): string {
  const available = Object.entries(ctx)
    .filter(([, v]) => v)
    .map(([k]) => `{{${k}}}`)
    .join(", ");
  return `You are a senior QA engineer at Procol (a B2B procurement platform). Write EXECUTABLE API checks for this exact request:

REQUEST: "${request}"
Flows the planner selected: ${flows.join(", ") || "(none)"}

${ENDPOINT_MENU}

Placeholders you MUST use instead of inventing ids: ${available || "(none available)"}
Never invent a uuid. If you need an id that has no placeholder, do not write that check.

Write 8-14 checks that specifically test THIS request — the feature named in it, its
validation rules, its boundaries and its failure paths. Do NOT write generic checks
about unrelated features.

COVERAGE (both rules matter):
1. SPREAD the checks ACROSS EVERY endpoint the request touches — not just the first
   one. For "technical event, bid and award" that means checks against the stage
   endpoint (/trade/template_input), the audience endpoint (add_audience), the
   surrogate response, the bid endpoint (/bids/template_input), evaluations AND the
   proposal/award endpoints. Aim for at least one check per relevant endpoint.
   A set of checks that only hits /event_groups is a FAILURE to follow the request.
2. Within each endpoint, favour NEGATIVE and VALIDATION cases (missing required
   field, blank value, bad enum, zero/negative quantity, non-existent id, wrong
   state transition, injection payloads) — those are precise and verifiable from a
   single request. The valid multi-step happy path is already covered by a separate
   end-to-end flow, so at most ONE valid-creation check is useful.

Each check is one object:
{
  "scenario": "short, specific description of what is being tested",
  "method": "GET" | "POST" | "PATCH",
  "path": "/exact/path?with=params",
  "body": { ... },              // omit for GET
  "expected": "accept" | "reject" | "no-5xx",
  "category": "Functional" | "Data Validation" | "Boundary" | "Edge" | "Security" | "Negative",
  "severity": "Critical" | "High" | "Medium" | "Low",
  "rationale": "why a senior QA tests this"
}

"expected" rules:
  accept  = a VALID request that must succeed
  reject  = an INVALID request that must be refused (missing/blank required field,
            bad enum, negative quantity, non-existent id, wrong state transition)
  no-5xx  = hostile/garbage input where either serving or refusing is fine, but a
            server crash is not (use for injection/oversized/garbage payloads)

Rules: every title/name you send MUST start with "QA_Platform_". Prefer the specific
endpoints of the requested feature. Mix valid, invalid, boundary and security cases.

Return ONLY a JSON array of the check objects. No prose, no markdown fence.`;
}

function extractJsonArray(raw: string): any[] {
  const s = raw.indexOf("[");
  if (s === -1) return [];
  // Try the whole array, then progressively salvage complete objects if the
  // model's output was truncated mid-stream.
  const slice = raw.slice(s);
  try {
    const v = JSON.parse(slice);
    if (Array.isArray(v)) return v;
  } catch {
    /* fall through to salvage */
  }
  const out: any[] = [];
  let depth = 0,
    start = -1,
    inStr = false,
    esc = false;
  for (let i = 0; i < slice.length; i++) {
    const c = slice[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          out.push(JSON.parse(slice.slice(start, i + 1)));
        } catch {
          /* skip a malformed object */
        }
        start = -1;
      }
    }
  }
  return out;
}

// ── 3. the safety gate ────────────────────────────────────────────────────
export function substitute(value: any, ctx: DynamicContext): { value: any; missing: string[] } {
  const missing: string[] = [];
  const walk = (v: any): any => {
    if (typeof v === "string") {
      return v.replace(/\{\{(\w+)\}\}/g, (_m, key) => {
        const hit = (ctx as any)[key];
        if (hit === undefined || hit === null || hit === "") {
          missing.push(key);
          return `{{${key}}}`;
        }
        return String(hit);
      });
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o: any = {};
      for (const [k, val] of Object.entries(v)) o[k] = walk(val);
      return o;
    }
    return v;
  };
  return { value: walk(value), missing };
}

/** Force every title/name we SEND to carry the sandbox prefix. */
function enforceSandboxNaming(body: any): any {
  if (!body || typeof body !== "object") return body;
  const P = TUNABLES.titlePrefix;
  const walk = (v: any): any => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o: any = {};
      for (const [k, val] of Object.entries(v)) {
        if (
          typeof val === "string" &&
          /^(title|name)$/i.test(k) &&
          val.trim() !== "" &&
          !val.startsWith(P) &&
          // don't prefix deliberately hostile values — that's the test itself
          val.length < 200 &&
          !/[<>]|drop table|select .* from/i.test(val)
        ) {
          o[k] = P + val;
        } else o[k] = walk(val);
      }
      return o;
    }
    return v;
  };
  return walk(body);
}

/**
 * Single-step creates where a COMPLETE valid payload is constructible in one
 * request — only here can a generated "accept" check be trusted as a real
 * pass/fail signal (see the accuracy guard in gate()).
 */
const SIMPLE_CREATE: RegExp[] = [
  /^\/event_groups$/,
  /^\/product_categories$/,
  /^\/products$/,
  /^\/teams$/,
  /^\/buyer_hubs\/create$/,
  /^\/users\/create_user$/,
];

const VALID_EXPECTED = new Set(["accept", "reject", "no-5xx"]);
const SEVERITIES = new Set(["Critical", "High", "Medium", "Low"]);

function catToType(category: string): TestType {
  if (category === "Functional") return "functional";
  if (category === "Security") return "non-functional";
  if (category === "Boundary" || category === "Edge") return "edge";
  return "data-validation";
}
const sevToPri: Record<string, string> = { Critical: "P0", High: "P1", Medium: "P2", Low: "P2" };

/**
 * Validate one generated spec and turn it into a runnable Check.
 * Returns null (with a reason) when the spec must not be executed.
 */
export function gate(
  spec: DynamicSpec,
  ctx: DynamicContext,
  client: Client,
  flowId: string,
  id: string,
  moduleLabel = "AI-generated",
  /** true only for the reviewed case library — unlocks ALLOW_CURATED. */
  curated = false,
): { check: Check | null; reason?: string } {
  const method = String(spec.method || "").toUpperCase();
  if (!["GET", "POST", "PATCH", "PUT"].includes(method))
    return { check: null, reason: `method ${method || "(none)"} is not permitted` };

  const sub = substitute({ path: spec.path, body: spec.body }, ctx);
  if (sub.missing.length)
    return { check: null, reason: `unresolved placeholder(s): ${[...new Set(sub.missing)].join(", ")}` };

  const path: string = sub.value.path;
  if (typeof path !== "string" || !path.startsWith("/"))
    return { check: null, reason: "path is missing or not absolute" };

  const allowed = curated ? [...ALLOW, ...ALLOW_CURATED] : ALLOW;
  const rule = allowed.find((r) => r.method === method && r.re.test(path));
  if (!rule) return { check: null, reason: `${method} ${path} is not on the allowlist` };

  let expected = VALID_EXPECTED.has(spec.expected) ? (spec.expected as any) : "no-5xx";
  // ACCURACY GUARD — the most important rule in this file.
  // A generated "accept" check asserts a VALID request succeeds. For multi-step
  // endpoints (stage / bid / evaluation / award) a valid payload depends on a
  // whole chain of real uuids, templates and timing that a single LLM call cannot
  // construct. If such a request is refused we CANNOT tell whether the product is
  // broken or the generated payload was simply incomplete — so calling it a bug
  // would be a false positive. We downgrade those to "must not crash": a 5xx is
  // still a definite defect, a clean 4xx is not evidence of anything.
  // The genuine happy path IS still covered — by the real registry flow
  // (create → bid → award), which builds a complete payload and DB-verifies it.
  if (expected === "accept" && !SIMPLE_CREATE.some((r) => r.test(path))) expected = "no-5xx";
  const severity = SEVERITIES.has(spec.severity) ? spec.severity : "Medium";
  const category = spec.category || "Data Validation";
  const body = method === "GET" ? undefined : enforceSandboxNaming(sub.value.body ?? {});

  const api = client.ctx.buyerApi;
  const check: Check = {
    id,
    flowId,
    module: moduleLabel,
    scenario: spec.scenario || `${method} ${path}`,
    type: catToType(category),
    category,
    priority: sevToPri[severity] ?? "P2",
    severity,
    expected,
    layer: "api",
    inputSummary:
      `${method} ${path}` + (body && Object.keys(body).length ? ` · ${JSON.stringify(body).slice(0, 160)}` : ""),
    exec: () =>
      method === "GET"
        ? apiGet(api, path)
        : method === "PATCH" || method === "PUT"
          ? apiPatch(api, path, body)
          : apiAttempt(api, path, body),
  };
  return { check };
}

// ── 4. public entry point ─────────────────────────────────────────────────
/**
 * Generate executable checks for THIS request. Returns the runnable checks plus
 * an honest list of what was dropped and why (never silently discarded).
 */
export async function generateDynamicChecks(
  client: Client,
  request: string,
  plannedFlowIds: string[],
  ctxIn: DynamicContext = {},
): Promise<GenerationOutcome> {
  const ctx: DynamicContext = {
    productUuid: client.ctx.catalog?.productUuid,
    productQualityUuid: client.ctx.catalog?.productQualityUuid,
    locationUuid: client.ctx.catalog?.locationUuid,
    stamp: String(Date.now()),
    ...ctxIn,
  };

  const raw = await chat(
    [
      { role: "system", content: "You output only valid JSON arrays. No prose, no markdown fences." },
      { role: "user", content: buildPrompt(request, ctx, plannedFlowIds) },
    ],
    { temperature: 0.25, maxTokens: 2600 },
  );

  const specs = extractJsonArray(raw) as DynamicSpec[];
  const checks: Check[] = [];
  const dropped: { scenario: string; reason: string }[] = [];
  let n = 1;
  for (const spec of specs) {
    const id = `CHK-AI-${String(n++).padStart(2, "0")}`;
    const { check, reason } = gate(spec, ctx, client, plannedFlowIds[0] ?? "ai.dynamic", id);
    if (check) checks.push(check);
    else dropped.push({ scenario: spec?.scenario ?? "(unnamed)", reason: reason ?? "rejected" });
  }
  return { checks, dropped, raw: specs.length };
}
