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
  // The route is PATCH (procol-backend config/routes.rb: patch 'add_audience'); a POST entry never matched.
  { method: "PATCH", re: /^\/v1\/trade\/add_audience(\?|$)/, what: "invite vendors to a stage" },
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

  // ── Vendor bulk upload ────────────────────────────────────────────────
  // Every fixture names its vendors QA_Platform_VBU_<stamp>_… with
  // qa_…@example.com contacts; row-rule fixtures carry a "tripwire" value that
  // stops the row in validation, so a rule that fails to fire still creates
  // nothing. Cases that would email the client's vendor-management team are
  // skipped unless a run opts in (realMail=1) — see vendorBulk.ts.
  { method: "POST", re: /^\/v1\/bulk_create_vendor$/, what: "vendor bulk upload (QA fixtures)" },
  { method: "GET", re: /^\/v1\/bulk_create_vendor_(template|status)$/, what: "vendor bulk template / job status" },
  { method: "GET", re: /^\/v1\/bulk_create_vendor_error_sheet(\?|$)/, what: "vendor bulk error sheet" },
  { method: "GET", re: /^\/v1\/bulk_create_vendor_template\?as=/, what: "vendor bulk template as another user" },
  { method: "GET", re: /^\/v1\/bulk_create_vendor_status\?as=/, what: "vendor bulk job status as another user" },
  // The manual Invite Vendor call, for the cases that compare it with bulk
  // upload: QA_Platform_ names, qa_…@example.com or no contact, skip onboarding.
  { method: "POST", re: /^\/invitations\/send_invite$/, what: "single-vendor invite (QA test vendors)" },
];

/**
 * EXTRA endpoints for the "sourcing events in depth" cases ONLY
 * (data/api-cases-extra/deep-*.json, ids EDGE-D<AREA>-NNN).
 *
 * Scoped by case id, not opened to the whole curated library, on purpose:
 * each deep case on these paths was written against the backend source AND
 * run live on a fresh test event before it was kept. Older cases on some of
 * the same paths (EDGE-PUB change_ownership/create_clone, EDGE-AWD counter
 * offers) have not had that live pass, so they stay held until someone does
 * it — opening the path for them would put unreviewed verdicts in every run.
 *
 * Every write here acts on the run's own sandbox event, the journey's own
 * event, the run's own buyer user, or a bogus id that cannot resolve.
 */
const ALLOW_DEEP: AllowRule[] = [
  // ── reads ──
  { method: "GET", re: /^\/event_groups(\?|$)/, what: "the events list" },
  { method: "POST", re: /^\/event_groups\/search$/, what: "event lookup (read)" },
  { method: "GET", re: /^\/proposal\/[^/]+(\/[a-z_]+)?(\?|$)/, what: "read an award proposal" },
  { method: "GET", re: /^\/trade\/[^/]+\/[a-z_]+(\?|$)/, what: "read a stage's reports" },
  { method: "GET", re: /^\/v1\/trade\/[^/]+\/[a-z_0-9]+(\/[^/?]+)?(\?|$)/, what: "read a stage's comparison data" },
  { method: "GET", re: /^\/v1\/trade\/new_request_config(\?|$)/, what: "stage configuration" },
  { method: "GET", re: /^\/v1\/additional_requests\/([^/]+\/counter_offer_details|pending_tasks)(\?|$)/, what: "counter-offer reads" },
  { method: "GET", re: /^\/sheets\/(schema|details)(\?|$)/, what: "Master QCS sheet reads" },
  { method: "GET", re: /^\/mqcs_report_templates(\/[^/?]+)?(\?|$)/, what: "Master QCS report templates" },
  { method: "GET", re: /^\/versions_log\/all(\?|$)/, what: "change history" },
  { method: "GET", re: /^\/approval_workflow\/(approval_requests|approval_flows)(\/[^?]*)?(\?|$)/, what: "approval reads" },
  { method: "GET", re: /^\/delegations\/[^/?]+(\?|$)/, what: "read a delegation" },
  { method: "GET", re: /^\/bids\/([^/]+\/get_approvals|approval_workflows_for_surrogate_bid_create)(\?|$)/, what: "bid approval reads" },
  { method: "GET", re: /^\/reports\/download_bulk_report(\?|$)/, what: "events-list export (refusals only: no date range)" },
  { method: "GET", re: /^\/bids\/(get_bid_details|get_suspicious_bids_detail)(\?|$)/, what: "bid detail reads (rule coverage)" },
  // ── writes: sandbox / journey event / own user / bogus ids only (see each case) ──
  { method: "POST", re: /^\/additional_request\/(raise_additional_request|raise_bulk_counter_offer)$/, what: "counter offer on the journey's QA-vendor bid" },
  { method: "PATCH", re: /^\/additional_request\/(resolve_additional_request|revoke_additional_requests)$/, what: "counter offer resolve/revoke (bogus ids)" },
  { method: "POST", re: /^\/ask_ai_chats\/counter_offer$/, what: "counter-offer suggestion (sandbox)" },
  { method: "POST", re: /^\/event_groups\/[^/]+\/(create_clone|change_ownership)$/, what: "clone the sandbox / hand it to self or a bogus user" },
  { method: "PATCH", re: /^\/event_groups\/[^/]+\/(save_draft_lots|reset_to_smart_lots)(\?|$)/, what: "sandbox lot plan" },
  { method: "POST", re: /^\/trade\/create_new_lot$/, what: "split a lot (sandbox / bogus)" },
  { method: "PATCH", re: /^\/trade\/[^/]+(\/staggered_time)?$/, what: "edit a stage (sandbox / journey / bogus)" },
  { method: "PATCH", re: /^\/v1\/trade\/[^/]+\/(currency_exchange_rates|widgets)$/, what: "stage rates / widgets (sandbox / bogus)" },
  { method: "PATCH", re: /^\/v1\/trade\/(add_audience|remove_audience)(\?|$)/, what: "live audience with no vendor list" },
  { method: "POST", re: /^\/v1\/trade\/[^/]+\/(add_new_stage_in_live_event|close_bid|close_bid\/approval_workflows|send_otp_for_unlocking_bids|verify_otp_for_unlocking_bids|upload_bid_excel)$/, what: "stage actions (sandbox / bogus)" },
  { method: "POST", re: /^\/reports\/download_report$/, what: "report download (refused bodies)" },
  { method: "POST", re: /^\/remarks$/, what: "a chat message on the sandbox round (mentions only the signed-in buyer or a bogus user)" },
  { method: "POST", re: /^\/templates\/product_sheet_params$/, what: "sheet upload (no file / bogus template)" },
  { method: "POST", re: /^\/approval_workflow\/approval_requests(\/(resolve_approval|bulk_resolve|[^/]+\/withdraw_approval))?$/, what: "approval actions (bogus ids only)" },
  { method: "PATCH", re: /^\/approval_workflow\/approval_requests\/[^/]+$/, what: "approval update (bogus id)" },
];
// EDGE-D… are the deep-dig twins; EDGE-EVR… the rule-coverage twins (data/api-cases-extra/rules-*.json).
const DEEP_CASE = /^EDGE-(D[A-Z]+|EVR[A-Z]{3})-\d{3}$/;

/**
 * Publish / audience / participation edge cases that act ONLY on the run's
 * own copy of the event (path and body name {{eventGroupUuid}} / {{tradeId}},
 * the run's QA vendor, the run's own buyer, or a bogus id), and whose starting
 * state a fresh copy has. Each runs on a copy of its own (caseLibrary.ts
 * ownCopyReason), so whatever it changes, no other case inherits it.
 *
 * Scoped by case id, like ALLOW_DEEP: the endpoints are opened for these cases
 * and no others. Cases on the same paths that need a state a fresh copy does
 * not have (a closed stage, a proposal, a versioned event, a second buyer…)
 * are listed with their reason in caseLibrary.ts STATE_NOT_BUILT; EDGE-BID-007
 * (a user-intent row aimed at a real user record) and EDGE-BID-013/014 (a
 * vendor outside the audience / a stage whose window is over) are left out.
 */
export const SANDBOX_PUB_CASES = new Set([
  // PATCH /trade/:id — extend, end, close or cancel the copy's live stage
  "EDGE-PUB-058", "EDGE-PUB-059", "EDGE-PUB-060", "EDGE-PUB-067", "EDGE-PUB-069", "EDGE-PUB-070",
  "EDGE-PUB-071", "EDGE-PUB-072", "EDGE-PUB-073", "EDGE-PUB-074",
  // PATCH /v1/trade/remove_audience — the invited vendor tries to remove a vendor
  "EDGE-PUB-042",
  // POST /event_groups/:id/participants — the invited vendor joins an open tender
  "EDGE-PUB-049", "EDGE-PUB-051",
  // PATCH /event_groups/:id/reject_participant — remarks missing / not participated / vendor caller
  "EDGE-PUB-053", "EDGE-PUB-054", "EDGE-PUB-056",
  // POST /event_groups/:id/change_ownership — blank owner / vendor caller
  "EDGE-PUB-090", "EDGE-PUB-092",
  // POST /event_groups/:id/create_clone — the copy cloned / a vendor tries
  "EDGE-PUB-109", "EDGE-PUB-113",
  // POST /user_intents — the invited vendor declines (or accepts) the copy's stage
  "EDGE-BID-001", "EDGE-BID-002", "EDGE-BID-003", "EDGE-BID-004", "EDGE-BID-005", "EDGE-BID-006",
  "EDGE-BID-008", "EDGE-BID-009", "EDGE-BID-010", "EDGE-BID-011", "EDGE-BID-012",
]);

/** Methods exactly as procol-backend config/routes.rb declares them. */
const ALLOW_SANDBOX_PUB: AllowRule[] = [
  // resources :trade, only: [:show, :update] → PATCH /trade/:id
  { method: "PATCH", re: /^\/trade\/[^/?]+$/, what: "edit the copy's stage (extend / end / close)" },
  // v1 scope :trade → patch 'remove_audience' => 'trade#remove_audience_live_auction'
  { method: "PATCH", re: /^\/v1\/trade\/remove_audience(\?|$)/, what: "remove a vendor from the copy's stage" },
  // event_groups scope → post ':id/participants' => 'event_groups#participate'
  { method: "POST", re: /^\/event_groups\/[^/]+\/participants$/, what: "join the copy as a vendor" },
  // patch '/:id/reject_participant' => 'event_groups#reject_participant'
  { method: "PATCH", re: /^\/event_groups\/[^/]+\/reject_participant$/, what: "reject a participant of the copy" },
  // post ':id/change_ownership' / post ':id/create_clone'
  { method: "POST", re: /^\/event_groups\/[^/]+\/(change_ownership|create_clone)$/, what: "hand over / clone the copy" },
  // resources :user_intents, only: [:create] → POST /user_intents
  { method: "POST", re: /^\/user_intents$/, what: "the vendor's participate / decline answer on the copy" },
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
  /** a marker for the bulk-upload fixture; the real base64 is loaded when the case runs */
  vbuSheet?: string;
  /** this workspace's vendor bulk upload settings (vendorBulk.ts), read once per run */
  vbu?: import("./vendorBulk.js").VbuWorkspace | null;
  /** run bulk cases that create a Prospect (and so email the vendor-management team) */
  vbuRealMail?: boolean;
  /** false = skip bulk cases that create test vendors */
  vbuCreate?: boolean;
  /** company settings some edge cases depend on (caseLibrary.ts resolveCaseSettings); null = could not be read */
  caseSettings?: Record<string, boolean | null>;
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
      // Keys too: award bodies are keyed by vendor / line-item uuid, and a
      // literal "{{vendorUuid}}" key went out on the wire before.
      for (const [k, val] of Object.entries(v)) o[walk(k)] = walk(val);
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
  // One request stages the whole sheet; the bulk runner then reads each row's
  // outcome, so a documented success is fully checkable here.
  /^\/v1\/bulk_create_vendor$/,
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

  const allowed = curated
    ? [...ALLOW, ...ALLOW_CURATED, ...(DEEP_CASE.test(id) ? ALLOW_DEEP : []), ...(SANDBOX_PUB_CASES.has(id) ? ALLOW_SANDBOX_PUB : [])]
    : ALLOW;
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
  let weakenedTo5xxOnly: string | undefined;
  if (expected === "accept" && !SIMPLE_CREATE.some((r) => r.test(path))) {
    expected = "no-5xx";
    // Recorded, not hidden. The report shows this next to the case's own
    // documented expectation so nobody reads "didn't crash" as "works".
    weakenedTo5xxOnly =
      `This case documents a specific success, but ${method} ${path.split("?")[0]} needs a payload ` +
      `this runner cannot build in full (a real template, timing and the ids of a live chain). ` +
      `It was therefore only checked for "did not crash" — a pass here does NOT mean the documented ` +
      `behaviour happened.`;
  }
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
    ...(weakenedTo5xxOnly ? { weakenedTo5xxOnly } : {}),
    layer: "api",
    inputSummary:
      `${method} ${path}` + (body && Object.keys(body).length ? ` · ${JSON.stringify(body).slice(0, 160)}` : ""),
    // The whole request, untruncated, so the report can print a curl that runs.
    request: { method, path, body },
    // Read the request when it RUNS, not when it was built: the runner may move
    // the check onto a fresh copy of the event (new ids), and a renewed session
    // arrives as a new client.
    exec: (runClient?: Client) => {
      const r = check.request!;
      const a = runClient?.ctx?.buyerApi ?? api;
      return r.method === "GET"
        ? apiGet(a, r.path)
        : r.method === "PATCH" || r.method === "PUT"
          ? apiPatch(a, r.path, r.body)
          : apiAttempt(a, r.path, r.body);
    },
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
