/**
 * READ-ENDPOINT ROBUSTNESS SUITES.
 *
 * The create-form suites (suites.ts) fuzz FIELDS. These fuzz PARAMETERS on
 * read/search endpoints — the other half of the API surface.
 *
 * Why they're valuable: a search box, a page number or a record id is the easiest
 * place to crash a backend. The rule here is simple and noise-free —
 * **hostile input must never produce a 5xx**. A search that returns 200 with no
 * results is fine; a search that returns 500 is a real bug. Bad record ids are
 * the exception: those must be REJECTED cleanly (404), never crash.
 *
 * Why they're safe: every check is a GET. Nothing is created, updated or deleted,
 * so these can run against any client with zero data footprint.
 */
import { Check, Client, apiGet } from "./engine.js";
import type { TestType } from "../ai/types.js";

type Sev = "Critical" | "High" | "Medium" | "Low";

/** One hostile value + why a senior QA tries it. */
interface Attack {
  label: string;
  value: string;
  category: string;
  severity: Sev;
  rationale: string;
}

const LONG = "A".repeat(2000);

/** The standard hostile-value set for a free-text query/search parameter. */
const TEXT_ATTACKS: Attack[] = [
  { label: "empty value", value: "", category: "Edge", severity: "Low", rationale: "An empty search must return a clean result, not an error." },
  { label: "whitespace only", value: "   ", category: "Edge", severity: "Low", rationale: "Whitespace should trim and behave like an empty search." },
  { label: "SQL injection", value: "x'); DROP TABLE users;--", category: "Security", severity: "High", rationale: "A SQLi payload must be parameterised away — never executed, never a 5xx." },
  { label: "XSS payload", value: "<script>alert('xss')</script>", category: "Security", severity: "High", rationale: "A script payload must be handled as plain text." },
  { label: "special characters", value: "<>&\"'/\\%", category: "Edge", severity: "Low", rationale: "Query-unsafe characters must be escaped, not crash the parser." },
  { label: "unicode & emoji", value: "QA✅Ω测试", category: "Edge", severity: "Low", rationale: "Unicode must be accepted without an encoding error." },
  { label: "very long (2000 chars)", value: LONG, category: "Boundary", severity: "Medium", rationale: "An oversized parameter must be rejected or truncated — not crash the server." },
  { label: "null byte", value: "abc%00def", category: "Security", severity: "Medium", rationale: "A null byte can break C-level string handling in the stack below." },
];

/** Hostile values for a numeric parameter (page numbers, counts). */
const NUMERIC_ATTACKS: Attack[] = [
  { label: "zero", value: "0", category: "Boundary", severity: "Medium", rationale: "Page zero is a classic off-by-one boundary." },
  { label: "negative", value: "-5", category: "Boundary", severity: "Medium", rationale: "A negative offset can produce an invalid SQL OFFSET." },
  { label: "non-numeric text", value: "abc", category: "Data Validation", severity: "High", rationale: "A numeric parameter must reject text without crashing." },
  { label: "decimal", value: "1.5", category: "Edge", severity: "Low", rationale: "A fractional page must be handled or rejected cleanly." },
  { label: "huge (99999999)", value: "99999999", category: "Boundary", severity: "Low", rationale: "A page far past the end must return empty, not error." },
  { label: "SQL injection", value: "1 OR 1=1", category: "Security", severity: "High", rationale: "Numeric parameters are a common injection point." },
];

/** Hostile values for a record identifier (uuid in a path). These must REJECT. */
const ID_ATTACKS: Attack[] = [
  { label: "malformed uuid", value: "not-a-uuid", category: "Negative", severity: "High", rationale: "A malformed id must give a clean 404/422, never a 500." },
  { label: "non-existent uuid", value: "00000000-0000-4000-8000-000000000000", category: "Negative", severity: "High", rationale: "A well-formed but unknown id must be a clean not-found." },
  { label: "SQL injection in id", value: "1' OR '1'='1", category: "Security", severity: "High", rationale: "An id is interpolated into a lookup — must be parameterised." },
  { label: "path traversal", value: "../../etc/passwd", category: "Security", severity: "High", rationale: "An id must never be treated as a path." },
];

function catToType(category: string): TestType {
  if (category === "Functional") return "functional";
  if (category === "Security") return "non-functional";
  if (category === "Boundary" || category === "Edge") return "edge";
  return "data-validation";
}
const sevToPri: Record<string, string> = { Critical: "P0", High: "P1", Medium: "P2", Low: "P2" };

interface ReadSuiteDef {
  flowId: string;
  label: string;
  module: string;
  idPrefix: string;
  /** A fully-valid request — the functional baseline. */
  validPath: string;
  validTitle: string;
  /** Builds the path for a hostile value; omit for baseline-only suites. */
  attackPath?: (encodedValue: string, rawValue: string) => string;
  attacks?: Attack[];
  /** Hostile ids must be REJECTED (everything else only must not 5xx). */
  attacksMustReject?: boolean;
  paramLabel?: string;
}

function buildReadSuite(def: ReadSuiteDef, client: Client): Check[] {
  const checks: Check[] = [];
  let n = 1;
  const nextId = () => `CHK-${def.idPrefix}-${String(n++).padStart(2, "0")}`;
  // The client is captured per-build (never a module global) so concurrent runs
  // for different clients can never cross-contaminate results.
  const get = (path: string) => apiGet(client.ctx.buyerApi, path);

  // 1) functional baseline — a valid read must work
  const basePath = def.validPath;
  checks.push({
    id: nextId(),
    flowId: def.flowId,
    module: def.module,
    scenario: def.validTitle,
    type: "functional",
    category: "Functional",
    priority: "P0",
    severity: "Critical",
    expected: "accept",
    layer: "api",
    inputSummary: `GET ${basePath}`,
    exec: () => get(basePath),
  });

  // 2) one check per hostile parameter value
  if (def.attackPath && def.attacks) {
    for (const a of def.attacks) {
      const path = def.attackPath(encodeURIComponent(a.value), a.value);
      checks.push({
        id: nextId(),
        flowId: def.flowId,
        module: def.module,
        field: def.paramLabel,
        scenario: `Should handle ${(def.paramLabel ?? "the parameter").toLowerCase()} being ${a.label}`,
        type: catToType(a.category),
        category: a.category,
        priority: sevToPri[a.severity] ?? "P2",
        severity: a.severity,
        // Hostile ids must be refused cleanly; hostile free-text/params only have
        // to not CRASH — a WAF 403 or an empty 200 are both correct outcomes.
        expected: def.attacksMustReject ? "reject" : "no-5xx",
        layer: "api",
        inputSummary: `GET ${path.length > 120 ? path.slice(0, 120) + "…" : path}`,
        exec: () => get(path),
      });
    }
  }
  return checks;
}

// ── the suites ────────────────────────────────────────────────────────────
const DEFS: ReadSuiteDef[] = [
  {
    flowId: "read.city_autocomplete",
    label: "City autocomplete (search param)",
    module: "Master Data",
    idPrefix: "RCITY",
    validPath: "/cities/autocomplete?query=mu&additional_fields=countries",
    validTitle: "City autocomplete returns matches for a valid query",
    attackPath: (v) => `/cities/autocomplete?query=${v}&additional_fields=countries`,
    attacks: TEXT_ATTACKS,
    paramLabel: "query",
  },
  {
    flowId: "read.product_search",
    label: "Product search (search param)",
    module: "Master Data",
    idPrefix: "RPRD",
    validPath: "/products/search?query=a",
    validTitle: "Product search returns results for a valid query",
    attackPath: (v) => `/products/search?query=${v}`,
    attacks: TEXT_ATTACKS,
    paramLabel: "query",
  },
  {
    flowId: "read.category_search",
    label: "Category search (search param)",
    module: "Master Data",
    idPrefix: "RCAT",
    validPath: "/product_categories/search?query=a&show_in_active=true",
    validTitle: "Category search returns results for a valid query",
    attackPath: (v) => `/product_categories/search?query=${v}&show_in_active=true`,
    attacks: TEXT_ATTACKS,
    paramLabel: "query",
  },
  {
    flowId: "read.hub_autocomplete",
    label: "Location autocomplete (search param)",
    module: "Master Data",
    idPrefix: "RHUB",
    validPath: "/buyer_hubs/autocomplete?query=a",
    validTitle: "Location autocomplete returns matches for a valid query",
    attackPath: (v) => `/buyer_hubs/autocomplete?query=${v}`,
    attacks: TEXT_ATTACKS,
    paramLabel: "query",
  },
  {
    flowId: "read.users_list",
    label: "User list (JSON filters param)",
    module: "User Management",
    idPrefix: "RUSR",
    validPath: `/get_all_users?filters=${encodeURIComponent('{"statuses":["active"]}')}`,
    validTitle: "User list returns users for a valid filter",
    attackPath: (v) => `/get_all_users?filters=${v}`,
    attacks: [
      { label: "malformed JSON", value: '{"statuses":[', category: "Data Validation", severity: "High", rationale: "A JSON parameter must be parsed defensively — malformed JSON must not 5xx." },
      { label: "wrong JSON shape", value: '{"statuses":"active"}', category: "Data Validation", severity: "Medium", rationale: "A string where an array is expected must not crash the query builder." },
      { label: "invalid status value", value: '{"statuses":["not_a_status"]}', category: "Data Validation", severity: "Medium", rationale: "An unknown enum in a filter must be ignored or rejected cleanly." },
      { label: "SQL injection in filter key", value: '{"statuses\'"); DROP TABLE users;--":["active"]}', category: "Security", severity: "High", rationale: "Filter KEYS are sometimes interpolated into SQL — the known extended-field risk." },
      { label: "not JSON at all", value: "active", category: "Edge", severity: "Low", rationale: "A plain string must not break JSON.parse handling." },
      { label: "empty value", value: "", category: "Edge", severity: "Low", rationale: "An empty filter must fall back to a default, not error." },
    ],
    paramLabel: "filters",
  },
  {
    flowId: "read.pr_list",
    label: "Purchase-request list (page param)",
    module: "Purchase Requests",
    idPrefix: "RPR",
    validPath: "/purchase_requests?page=1",
    validTitle: "Purchase-request list returns page 1",
    attackPath: (v) => `/purchase_requests?page=${v}`,
    attacks: NUMERIC_ATTACKS,
    paramLabel: "page",
  },
  {
    flowId: "read.orders_list",
    label: "Orders/events list (page param)",
    module: "Event Management",
    idPrefix: "RORD",
    validPath: "/orders",
    validTitle: "Orders list loads for the client",
    attackPath: (v) => `/orders?page=${v}`,
    attacks: NUMERIC_ATTACKS,
    paramLabel: "page",
  },
  {
    flowId: "read.templates",
    label: "Templates list (type param)",
    module: "Templates",
    idPrefix: "RTPL",
    validPath: "/templates?type_identifier=trade&hide_onboarding_v2_templates=true",
    validTitle: "Templates list returns trade templates",
    attackPath: (v) => `/templates?type_identifier=${v}&hide_onboarding_v2_templates=true`,
    attacks: TEXT_ATTACKS,
    paramLabel: "type_identifier",
  },
  {
    flowId: "read.event_group",
    label: "Event-group read (record id)",
    module: "Event Management",
    idPrefix: "REVT",
    // A valid read needs a real uuid, so the baseline uses the list endpoint.
    validPath: "/orders",
    validTitle: "Event listing works (baseline for the id checks)",
    attackPath: (v) => `/event_groups/${v}`,
    attacks: ID_ATTACKS,
    attacksMustReject: true,
    paramLabel: "event uuid",
  },
  {
    flowId: "read.purchase_request_id",
    label: "Purchase-request read (record id)",
    module: "Purchase Requests",
    idPrefix: "RPRID",
    validPath: "/purchase_requests?page=1",
    validTitle: "PR listing works (baseline for the id checks)",
    attackPath: (v) => `/purchase_requests/${v}`,
    attacks: ID_ATTACKS,
    attacksMustReject: true,
    paramLabel: "PR id",
  },
  {
    flowId: "read.team_names",
    label: "Team names (boolean param)",
    module: "Master Data",
    idPrefix: "RTEAM",
    validPath: "/teams/get_all?only_team_names=true",
    validTitle: "Team-name list loads",
    attackPath: (v) => `/teams/get_all?only_team_names=${v}`,
    attacks: [
      { label: "invalid boolean", value: "maybe", category: "Data Validation", severity: "Medium", rationale: "A non-boolean must be coerced or rejected, not crash." },
      { label: "numeric boolean", value: "2", category: "Edge", severity: "Low", rationale: "Boolean coercion of an out-of-range number must be safe." },
      { label: "empty value", value: "", category: "Edge", severity: "Low", rationale: "An empty boolean must fall back to a default." },
      { label: "SQL injection", value: "true' OR '1'='1", category: "Security", severity: "High", rationale: "Even a boolean parameter must be parameterised." },
    ],
    paramLabel: "only_team_names",
  },
  {
    flowId: "read.products_all",
    label: "All products (baseline read)",
    module: "Master Data",
    idPrefix: "RPALL",
    validPath: "/products/get_all_products",
    validTitle: "All-products read returns the catalog",
  },
  {
    flowId: "read.hubs_all",
    label: "All locations (baseline read)",
    module: "Master Data",
    idPrefix: "RHALL",
    validPath: "/buyer_hubs/all",
    validTitle: "All-locations read returns the client's hubs",
  },
];

const BY_ID = new Map(DEFS.map((d) => [d.flowId, d]));

/** Suite ids handled by this module (used by suiteKey/hasSuite). */
export const READ_SUITE_IDS: string[] = DEFS.map((d) => d.flowId);

/** Human labels for the UI. */
export const READ_SUITE_META = DEFS.map((d) => ({ id: d.flowId, label: d.label, module: d.module }));

export function isReadSuite(flowId: string): boolean {
  return BY_ID.has(flowId);
}

/** Build the checks for one read suite. */
export function buildReadChecks(client: Client, flowId: string): Check[] {
  const def = BY_ID.get(flowId);
  if (!def) return [];
  return buildReadSuite(def, client);
}
