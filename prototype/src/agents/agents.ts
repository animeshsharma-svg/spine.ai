/**
 * THE SEVEN AGENTS. Each is one small worker with one job. They hand off in
 * order; the Critic can send work back to the Test-designer if coverage is thin.
 *
 * Design rule (matches the platform's "golden rule"): every agent makes REAL
 * decisions from real inputs (RAG evidence, the live capability map, real test
 * execution). The LLM only *narrates* that reasoning in nicer prose when a key
 * is present — so the whole pipeline runs correctly with ₹0 and no key.
 */
import { retrieve } from "../rag/knowledgeBase.js";
import { normalizeText } from "../checks/caseMatcher.js";
import { caseById } from "../checks/testCatalog.js";
import { narrate, chat, llmMode } from "../ai/llm.js";
import { runSelected, capabilityFromClient, openClientContext } from "../executor.js";
import { buildChecksForFlow, suiteKey } from "../checks/suites.js";
import { generateDynamicChecks, type DynamicContext } from "../checks/dynamicChecks.js";
import { runCheck } from "../checks/engine.js";
import type {
  RunState,
  PlannedFlow,
  TestCase,
  TestType,
  UserStory,
  Finding,
} from "../ai/types.js";

type Client = Awaited<ReturnType<typeof openClientContext>>;

export interface EmitInput {
  agent: string;
  status: "start" | "reasoning" | "done" | "error";
  title: string;
  reasoning?: string;
  data?: any;
}
export type Emit = (e: EmitInput) => void;

// Flows that are safe + fast to actually EXECUTE live (all verified green on UAT).
// (masterdata.user_permissions is excluded — it uses a Playwright-only call; its
// validation is exercised by the dedicated phone probe instead.)
const EXECUTABLE = [
  "events.surrogate_award", "events.rfp_rfq", "events.rfp_only", "events.rfq_only",
  "events.auction_rank", "events.auction_price", "events.boq", "events.versioning",
  "events.convert_to_auction", "entrypath.pr_to_event",
  "masterdata.category", "masterdata.product", "masterdata.location", "masterdata.team",
];

// Which flows a plain-English request maps to (first match wins, multiple can match).
const RULES: { re: RegExp; flows: string[] }[] = [
  { re: /\bboq\b|bill of quantit/i, flows: ["events.boq"] },
  { re: /convert.*auction|to auction/i, flows: ["events.convert_to_auction"] },
  { re: /auction/i, flows: ["events.auction_rank", "events.auction_price"] },
  { re: /version/i, flows: ["events.versioning"] },
  { re: /purchase request|\bpr\b|requisition/i, flows: ["entrypath.pr_to_event"] },
  { re: /award|surrogate|\brfq\b|\brfp\b|sourc|\bevent\b|tender|\bbid\b/i, flows: ["events.surrogate_award", "events.rfp_rfq"] },
  { re: /categor/i, flows: ["masterdata.category"] },
  { re: /\bproduct\b|\bitem\b|\bsku\b/i, flows: ["masterdata.product"] },
  { re: /location|buyer hub|\bhub\b|warehouse|delivery centre|delivery center/i, flows: ["masterdata.location"] },
  { re: /\bteam\b/i, flows: ["masterdata.team"] },
  // NOTE: deliberately NOT matching generic testing words ("input", "validate",
  // "field") — those describe HOW to test, not WHAT to test, and used to drag the
  // create-user suite into unrelated runs (e.g. "…break the inputs" on an event).
  { re: /\buser\b|permission|\bphone\b|onboard a person|\bmember\b|\brole\b/i, flows: ["masterdata.user_permissions"] },
  { re: /vendor|supplier/i, flows: ["vendor.discovery"] },
];

const WHY: Record<string, string> = {
  "events.surrogate_award": "Directly matches creating and awarding an event — creates it, bids, and opens the award.",
  "events.rfp_rfq": "A 2-stage RFP+RFQ event — the core sourcing happy path.",
  "events.auction_rank": "A rank-based reverse auction event.",
  "events.auction_price": "A price-based reverse auction event.",
  "events.boq": "A Bill-of-Quantities event built from an uploaded Excel sheet.",
  "events.versioning": "Re-versioning an existing event (F2).",
  "events.convert_to_auction": "Converting an RFQ stage into an auction (F5).",
  "entrypath.pr_to_event": "Turning an existing Purchase Request into an event.",
  "masterdata.category": "Creating a product category (master data).",
  "masterdata.product": "Creating a product (master data).",
  "masterdata.location": "Creating a delivery/buying location (master data).",
  "masterdata.team": "Creating a purchasing team (master data).",
  "masterdata.user_permissions": "Exercises the user-creation form's field validation (the 'break the inputs' ask).",
  "vendor.discovery": "Reading the client's vendor list.",
};

/** Flows whose keyword rule matches this text (the old router, kept as the fallback). */
export function keywordFlows(text: string): string[] {
  const ids: string[] = [];
  for (const rule of RULES) if (rule.re.test(text)) ids.push(...rule.flows);
  return [...new Set(ids)];
}

export interface FlowSelection {
  flows: string[];
  via: "memory" | "keywords" | "default";
  /** the memory hits that voted, strongest first */
  evidence: Array<{ id: string; title: string; score: number; flows: string[] }>;
}

/**
 * MEMORY-BASED FLOW SELECTION.
 *
 * The request is normalised the way the case matcher does it (Hinglish, typos,
 * synonyms), then the memory is asked for the catalog cases and flows closest
 * to it in meaning. Each hit votes, weighted by its score, for the flows its
 * own TITLE describes — titles are written in the product's vocabulary, so the
 * keyword rules that were brittle on a person's phrasing are reliable on them.
 * A flow needs at least 60% of the top flow's vote; at most three are chosen.
 * With the memory unavailable or silent, the rules run on the request itself,
 * as before.
 */
export async function selectFlows(request: string): Promise<FlowSelection> {
  const normalized = normalizeText(request).text || request;
  try {
    const hits = await retrieve(normalized, 12, { kinds: ["test-case", "flow"] });
    const votes = new Map<string, number>();
    const evidence: FlowSelection["evidence"] = [];
    for (const h of hits) {
      let title = "";
      let id = "";
      let flows: string[] = [];
      if (h.kind === "flow") {
        id = h.text.match(/^Flow ([a-z_]+\.[a-z_]+)/)?.[1] ?? "";
        title = h.text.slice(0, 120);
        if (id) flows = [id];
      } else {
        id = String(h.labels?.[0] ?? "");
        const c = caseById(id);
        title = c?.title ?? h.text.slice(0, 120);
        const named = (c?.refs ?? []).filter((r) => r in WHY);
        flows = named.length ? named : keywordFlows(title);
      }
      if (!flows.length) continue;
      evidence.push({ id, title, score: +h.score.toFixed(3), flows });
      for (const f of flows) votes.set(f, (votes.get(f) ?? 0) + h.score / flows.length);
    }
    const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length) {
      const top = ranked[0][1];
      return { flows: ranked.filter(([, v]) => v >= top * 0.6).slice(0, 3).map(([f]) => f), via: "memory", evidence };
    }
  } catch {
    /* memory not built or not reachable — fall back to the rules */
  }
  const kw = keywordFlows(normalized);
  if (kw.length) return { flows: kw, via: "keywords", evidence: [] };
  return { flows: ["events.rfp_rfq"], via: "default", evidence: [] };
}

interface CaseTpl { title: string; given: string; when: string; then: string; expectation?: string; }
interface FlowCases { functional: CaseTpl; validation?: CaseTpl[]; edge?: CaseTpl[]; nonFunctional?: CaseTpl[]; }

// Per-flow, domain-specific test cases so different requests yield ORIGINAL cases.
const FLOW_CASES: Record<string, FlowCases> = {
  "events.surrogate_award": {
    functional: { title: "Create and award an RFQ sourcing event", given: "a logged-in buyer with a resolved catalog", when: "they create an event, place a bid, and open an award proposal", then: "the event + stages persist and are verifiable in the database" },
    edge: [{ title: "Open an award when the bid window has already closed", given: "an event past its end time", when: "the buyer opens the award", then: "the system resolves it or fails with a clear reason" }],
    nonFunctional: [{ title: "Bid isolation — a vendor cannot see another vendor's bid", given: "an event with more than one invited vendor", when: "one vendor views the event", then: "competing bid values are never exposed" }],
  },
  "events.rfp_rfq": {
    functional: { title: "Create a 2-stage RFP + RFQ event", given: "a buyer with a template and a product", when: "they add a technical and a pricing stage and publish", then: "both stages persist in the database" },
    edge: [{ title: "Event with many line items (bulk)", given: "a large line-item list", when: "the event is created", then: "every line item persists without loss" }],
    nonFunctional: [{ title: "The events list loads under ~3 seconds", given: "a client with many events", when: "the list is opened", then: "it renders within the performance budget" }],
  },
  "events.auction_rank": {
    functional: { title: "Create a rank-based auction event", given: "a buyer", when: "they configure a rank-based auction and publish", then: "the auction stage is active and persisted" },
    edge: [{ title: "Auction with a bid window already closed", given: "a past end time", when: "the auction is opened", then: "bidding is blocked with a clear message" }],
    nonFunctional: [{ title: "Rank updates consistently as bids arrive", given: "multiple bids", when: "a lower bid lands", then: "ranks recompute correctly" }],
  },
  "events.auction_price": {
    functional: { title: "Create a price-based auction event", given: "a buyer", when: "they configure a price-based auction and publish", then: "the auction stage is active and persisted" },
    edge: [{ title: "Two identical lowest bids (tie)", given: "two equal bids", when: "ranking is computed", then: "the tie is resolved deterministically" }],
  },
  "events.boq": {
    functional: { title: "Create a BOQ event from an uploaded Excel sheet", given: "a BOQ template", when: "the sheet is parsed and an event group created", then: "the BOQ flag is saved in the database" },
    validation: [{ title: "A BOQ sheet missing a required product column is rejected", given: "an invalid sheet", when: "it is uploaded", then: "the upload is rejected with a clear error" }],
    edge: [{ title: "A BOQ sheet with hundreds of line items", given: "a very large sheet", when: "it is parsed", then: "all sections/line items are captured" }],
  },
  "events.versioning": {
    functional: { title: "Create a new version of an event group (F2)", given: "an existing event", when: "it is versioned", then: "the versioned trades are created" },
    edge: [{ title: "Version an event that was already versioned", given: "an event with an existing version", when: "it is versioned again", then: "versions chain without corruption" }],
  },
  "events.convert_to_auction": {
    functional: { title: "Convert an RFQ stage into an auction (F5)", given: "a live RFQ event", when: "the pricing stage is converted", then: "the auction stage becomes active" },
    edge: [{ title: "Convert after the RFQ stage has closed", given: "a closed RFQ stage", when: "conversion is attempted", then: "it is handled gracefully" }],
  },
  "entrypath.pr_to_event": {
    functional: { title: "Convert a Purchase Request into an event", given: "an existing PR with line items", when: "it is converted", then: "an event group is created carrying the PR's line items" },
    edge: [{ title: "A PR with no line items is rejected", given: "an empty PR", when: "conversion is attempted", then: "it is rejected with a clear message" }],
  },
  "masterdata.category": {
    functional: { title: "Create a product category", given: "an admin", when: "they create a category", then: "it persists in the database" },
    edge: [{ title: "Category name with special characters / emoji", given: "an unusual name", when: "the category is created", then: "it is stored correctly or rejected cleanly" }],
  },
  "masterdata.product": {
    functional: { title: "Create a product (category → family → product)", given: "an admin", when: "they create a product under a family", then: "it persists in the database" },
    validation: [{ title: "Product code and name are required", given: "a product form", when: "required fields are blank", then: "creation is blocked with clear errors" }],
    edge: [{ title: "Product name with emoji or a very long string", given: "an extreme name", when: "the product is created", then: "it is stored correctly or rejected cleanly" }],
  },
  "masterdata.location": {
    functional: { title: "Create a location (buyer hub)", given: "an admin", when: "they create a location with a valid city", then: "it persists in the database" },
    validation: [{ title: "A location requires a valid city", given: "a location form", when: "the city is missing/invalid", then: "creation is rejected with a clear message" }],
  },
  "masterdata.team": {
    functional: { title: "Create a purchasing team", given: "an admin", when: "they create a team", then: "it persists in the database" },
    nonFunctional: [{ title: "Team-based permissions restrict access", given: "a team with limited modules", when: "a member acts", then: "they cannot reach modules the team lacks" }],
  },
  "masterdata.user_permissions": {
    functional: { title: "Create a user with team-based permissions", given: "an admin and a team", when: "they create a user assigned to the team", then: "the user + team persist in the database" },
    validation: [{ title: "Phone must be a valid 10-digit number", given: "the create-user form", when: "a phone value is submitted", then: "valid is accepted; malformed is rejected with a clear message" }],
    edge: [{ title: "Phone with non-digit characters is rejected", given: "the create-user endpoint", when: "a 10-char value with letters is submitted", then: "the system rejects it — a phone must be numeric" }],
    nonFunctional: [{ title: "A new member cannot access modules their team lacks", given: "a limited team", when: "the new user signs in", then: "restricted modules stay hidden" }],
  },
  "vendor.discovery": {
    functional: { title: "Fetch the client's vendor list", given: "a buyer", when: "they open the vendor list", then: "vendors are returned" },
    nonFunctional: [{ title: "The vendor list loads quickly", given: "a client with many vendors", when: "the list is opened", then: "it renders within the performance budget" }],
  },
};

const DEFAULT_CASES: FlowCases = {
  functional: { title: "Run the requested flow end-to-end", given: "a logged-in client", when: "the flow executes", then: "it completes and is verifiable" },
  nonFunctional: [{ title: "The flow stays fast and corrupts nothing", given: "normal load", when: "the flow runs", then: "it finishes within budget with no side effects" }],
};

// Where each flow lives in the product (for professional test-case metadata).
const FLOW_META: Record<string, { module: string; role: string; component?: string }> = {
  "events.surrogate_award": { module: "Event Management", role: "Buyer", component: "Award / Surrogate Bid" },
  "events.rfp_rfq": { module: "Event Management", role: "Buyer", component: "Create eRFx Event" },
  "events.rfp_only": { module: "Event Management", role: "Buyer", component: "Technical (RFP) Stage" },
  "events.rfq_only": { module: "Event Management", role: "Buyer", component: "Pricing (RFQ) Stage" },
  "events.auction_rank": { module: "Event Management", role: "Buyer", component: "Reverse Auction (rank)" },
  "events.auction_price": { module: "Event Management", role: "Buyer", component: "Reverse Auction (price)" },
  "events.boq": { module: "Event Management", role: "Buyer", component: "BOQ Event" },
  "events.versioning": { module: "Event Management", role: "Buyer", component: "Event Versioning" },
  "events.convert_to_auction": { module: "Event Management", role: "Buyer", component: "Convert to Auction" },
  "entrypath.pr_to_event": { module: "Procurement Intake", role: "Buyer", component: "PR → Event" },
  "masterdata.category": { module: "Master Data", role: "Admin", component: "Product Category" },
  "masterdata.product": { module: "Master Data", role: "Admin", component: "Product" },
  "masterdata.location": { module: "Master Data", role: "Admin", component: "Buyer Hub / Location" },
  "masterdata.team": { module: "Master Data", role: "Admin", component: "Team" },
  "masterdata.user_permissions": { module: "User Management", role: "Admin", component: "Create User" },
  "vendor.discovery": { module: "Vendor Management", role: "Buyer", component: "Vendor List" },
};
const flowMeta = (id: string) => FLOW_META[id] ?? { module: "Procol", role: "Buyer" as string };

const capType: Record<TestType, string> = {
  functional: "Functional",
  "data-validation": "Data Validation",
  edge: "Edge",
  "non-functional": "Non-functional",
};

// ── 1 · ANALYST (RAG) ─────────────────────────────────────────────────────
export async function analyst(state: RunState, emit: Emit): Promise<Partial<RunState>> {
  emit({ agent: "Analyst", status: "start", title: "Reading the product (RAG)" });

  const hits = await retrieve(
    `${state.request}. Procol sourcing events, awarding, and user creation phone validation.`,
    6,
  );

  // The grounded PRD-vs-product delta this run centres on (from live probe + source).
  const deltas = [
    {
      topic: "Phone field validation (user creation)",
      prdSays: "Accept any 10-digit number; reject malformed input politely (PRD §4.3, §5).",
      productDoes:
        "The API checks phone LENGTH (rejects 9 or 11 digits) but NOT that characters are digits — it accepts a 10-char value containing letters. The frontend enforces digits-only, so the API is more lenient than the UI.",
      evidence: "console-config-map.md (validateCountryPhone), endpoints.md, live UAT probe",
      severityHint: "medium" as const,
    },
  ];

  const facts =
    `I searched Procol's own code, config map, endpoint list and PRD for: "${state.request}". ` +
    `Top evidence came from: ${[...new Set(hits.map((h) => h.source))].join(", ")}. ` +
    `The product supports creating multi-stage sourcing events (RFP/RFQ/auction), inviting vendors, and awarding, ` +
    `plus team-based user management. I found one spec-vs-product gap worth testing: the phone field — ` +
    `the PRD says accept any 10-digit number, but the backend only validates length, not digit-type.`;
  const reasoning = await narrate("Analyst", facts);

  emit({
    agent: "Analyst",
    status: "done",
    title: "Grounded spec built",
    reasoning,
    data: { evidence: hits.map((h) => ({ source: h.source, score: +h.score.toFixed(3) })), deltas },
  });
  return { spec: { summary: facts, evidence: hits, deltas } };
}

// ── 2 · PLANNER (RAG + catalog + config) ──────────────────────────────────
export async function planner(
  state: RunState,
  emit: Emit,
  client: Client,
): Promise<Partial<RunState>> {
  emit({ agent: "Planner", status: "start", title: "Selecting flows for this client" });

  const capability = capabilityFromClient(client);

  // Which flows: chosen from MEMORY (the catalog cases closest in meaning to
  // the request vote for the flows their titles describe), with the keyword
  // rules on the request itself only as a fallback.
  const selection = await selectFlows(state.request);
  const ids = selection.flows;
  emit({
    agent: "Planner",
    status: "reasoning",
    title: `Flows chosen by ${selection.via}`,
    data: { routing: selection.via, evidence: selection.evidence.slice(0, 6) },
  });

  const plan: PlannedFlow[] = [...new Set(ids)].map((id) => {
    const cap = capability.find((c: { id: string; title?: string; category?: string }) => c.id === id);
    return {
      flowId: id,
      name: cap?.title ?? id,
      category: cap?.category ?? "?",
      why: WHY[id] ?? "Relevant to the request.",
      enabled: cap?.enabled ?? false,
      gateReason: cap?.reason ?? null,
    };
  });

  const enabled = plan.filter((p) => p.enabled).length;
  const names = plan.map((p) => p.name).join(", ");
  const facts =
    `For client "${client.companyName}" I matched the request to ${plan.length} flow(s) ${selection.via === "memory" ? "using the closest test cases in memory" : selection.via === "keywords" ? "by keywords (the memory had nothing)" : "by default (nothing matched)"} — ` +
    `${names} — and checked each against the client's live configuration: ${enabled}/${plan.length} are enabled here. ` +
    `I'll focus execution on the enabled ones.`;
  const reasoning = await narrate("Planner", facts);

  emit({ agent: "Planner", status: "done", title: `${enabled}/${plan.length} flows enabled`, reasoning, data: { plan } });
  return { plan, companyName: client.companyName };
}

// ── 3 · TEST-DESIGNER (functional / data-validation / edge / non-functional) ─
export async function testDesigner(state: RunState, emit: Emit): Promise<Partial<RunState>> {
  const round = state.designRound ?? 0;
  emit({
    agent: "Test-designer",
    status: "start",
    title: round === 0 ? "Designing test cases" : `Filling coverage gaps (round ${round + 1})`,
  });

  const planned = (state.plan ?? []).filter((p) => p.enabled);
  const flows: PlannedFlow[] = planned.length
    ? planned
    : [{ flowId: "events.rfp_rfq", name: "Create RFP + RFQ event", category: "events", why: "", enabled: true }];

  // Which dimensions to design THIS round. Round 0 = happy path + boundaries;
  // the Critic then asks for non-functional, which round 1 supplies (the loop).
  const dims: TestType[] = round === 0 ? ["functional", "data-validation", "edge"] : ["non-functional"];

  let fresh: TestCase[] = [];
  let source = "templates";
  if (llmMode() === "groq") {
    try {
      fresh = await generateCasesLLM(state.request, flows, dims, round);
      if (fresh.length) source = "LLM (Groq, RAG-grounded)";
    } catch {
      fresh = [];
    }
  }
  if (!fresh.length) fresh = staticCases(flows, dims);

  // stable, prefixed ids continuing from what already exists
  const startIdx = (state.cases ?? []).length;
  fresh.forEach((c, i) => {
    c.flowId = c.flowId ?? matchFlow(c.module, flows);
    c.id = makeCaseId(c, startIdx + i + 1);
  });
  const cases = [...(state.cases ?? []), ...fresh];

  const present = [...new Set(cases.map((c) => c.type))];
  const facts =
    `I designed ${fresh.length} detailed test case(s) this pass (${source}) covering ${dims.join(", ")} for ` +
    `${flows.length} flow(s). Each has preconditions, numbered steps, positive/negative test data, and a precise ` +
    `expected result. Total so far: ${cases.length} cases across ${present.length} dimension(s).`;
  const reasoning = await narrate("Test-designer", facts);

  emit({ agent: "Test-designer", status: "done", title: `${cases.length} cases (${source})`, reasoning, data: { cases } });
  return { cases };
}

// ── Test-case generation helpers ──────────────────────────────────────────
const CASE_TYPES: TestType[] = ["functional", "data-validation", "edge", "non-functional"];

/** Ask the LLM for detailed, product-grounded cases in Procol's house style. */
async function generateCasesLLM(
  request: string,
  flows: PlannedFlow[],
  dims: TestType[],
  round: number,
): Promise<TestCase[]> {
  const evidence = await retrieve(
    `${request} ${flows.map((f) => f.flowId).join(" ")} validation edge security mandatory fields`,
    6,
  );
  const context = evidence.map((e) => `- (${e.source}) ${e.text}`).join("\n").slice(0, 4200);
  const flowLines = flows
    .map((f) => {
      const m = flowMeta(f.flowId);
      return `- ${f.flowId} — module "${m.module}", role ${m.role}: ${f.name}`;
    })
    .join("\n");

  const dimGuide = dims.includes("non-functional")
    ? "Focus on NON-FUNCTIONAL quality: performance/latency budgets, SECURITY (SQL injection, XSS, unauthorised access to another company's/vendor's data, unsafe file uploads), concurrency, and reliability/rollback."
    : "Cover FUNCTIONAL happy paths, DATA-VALIDATION (mandatory fields, formats, length limits, numeric-only, duplicates, case-sensitivity), and EDGE cases (boundaries, closed bid windows, very large inputs, special characters/emoji).";

  const system =
    "You are a senior QA engineer at Procol, a B2B procurement SaaS (sourcing events, RFP/RFQ/auctions, BOQ, vendors, approvals, master data). " +
    "Write detailed, professional test cases in Procol's house style. Ground every case ONLY in the PRODUCT CONTEXT provided — never invent endpoints, tables, or fields. " +
    "Return STRICT JSON only (an array), no markdown, no commentary.";
  const schema =
    'Each array item = {"type":"functional"|"data-validation"|"edge"|"non-functional","category":"short label e.g. Functional, Validation or Negative, Security","module":"string","component":"string","role":"Buyer"|"Vendor"|"Evaluator"|"Admin","scenario":"short title","preconditions":"string","steps":["1. ...","2. ..."],"testData":"Positive: … | Negative: …","expectedResult":"precise result incl. DB effect or exact error/validation message","priority":"P0"|"P1"|"P2","severity":"Critical"|"High"|"Medium"}';
  const user =
    `REQUEST: "${request}"\n\nFLOWS UNDER TEST:\n${flowLines}\n\nPRODUCT CONTEXT (ground truth — cite behaviours from here):\n${context}\n\n` +
    `TASK: ${dimGuide}\nWrite ${round === 0 ? "5 to 6" : "3"} SPECIFIC, realistic Procol test cases across these flows. ` +
    `Prefer concrete data (real field names, example values, exact error messages). \nSCHEMA: ${schema}\nReturn ONLY the JSON array.`;

  const raw = await chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.5, maxTokens: 4200 },
  );
  return extractJsonArray(raw)
    .map(normalizeCase)
    .filter((c): c is TestCase => !!c && dims.includes(c.type));
}

/** Build cases from the static library when the LLM is unavailable. */
function staticCases(flows: PlannedFlow[], dims: TestType[]): TestCase[] {
  const out: TestCase[] = [];
  for (const f of flows) {
    const fc = FLOW_CASES[f.flowId] ?? DEFAULT_CASES;
    const m = flowMeta(f.flowId);
    const push = (type: TestType, tpl: CaseTpl) => out.push(tplToCase(type, tpl, f.flowId, m));
    if (dims.includes("functional")) push("functional", fc.functional);
    if (dims.includes("data-validation")) (fc.validation ?? []).forEach((t) => push("data-validation", t));
    if (dims.includes("edge")) (fc.edge ?? []).forEach((t) => push("edge", t));
    if (dims.includes("non-functional")) (fc.nonFunctional ?? DEFAULT_CASES.nonFunctional!).forEach((t) => push("non-functional", t));
  }
  return out;
}

function tplToCase(type: TestType, tpl: CaseTpl, flowId: string, m: { module: string; role: string; component?: string }): TestCase {
  const priority = type === "data-validation" ? "P0" : type === "edge" ? "P2" : "P1";
  const severity = type === "edge" ? "Medium" : "High";
  return {
    id: "",
    type,
    category: capType[type],
    module: m.module,
    component: m.component,
    role: m.role,
    scenario: tpl.title,
    preconditions: tpl.given,
    steps: [`1. ${tpl.when}`],
    testData: type === "functional" ? "Valid inputs from the client's catalog" : "Positive: valid input | Negative: invalid / boundary input",
    expectedResult: tpl.then,
    priority,
    severity,
    flowId,
  };
}

function normalizeCase(o: any): TestCase | null {
  if (!o || typeof o !== "object" || !o.scenario) return null;
  const type: TestType = CASE_TYPES.includes(o.type) ? o.type : "functional";
  const steps = Array.isArray(o.steps) ? o.steps.map(String) : o.steps ? [String(o.steps)] : [];
  return {
    id: "",
    type,
    category: String(o.category ?? capType[type]),
    module: String(o.module ?? "Procol"),
    component: o.component ? String(o.component) : undefined,
    role: ["Buyer", "Vendor", "Evaluator", "Admin"].includes(o.role) ? o.role : "Buyer",
    scenario: String(o.scenario),
    preconditions: String(o.preconditions ?? "—"),
    steps,
    testData: String(o.testData ?? "—"),
    expectedResult: String(o.expectedResult ?? "—"),
    priority: ["P0", "P1", "P2"].includes(o.priority) ? o.priority : "P1",
    severity: ["Critical", "High", "Medium"].includes(o.severity) ? o.severity : "High",
  };
}

/** Parse a JSON array from an LLM reply, salvaging complete objects even if the
 * output was truncated mid-array (so we never lose everything to one bad tail). */
function extractJsonArray(raw: string): any[] {
  if (!raw) return [];
  const s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = s.indexOf("[");
  if (start < 0) return [];
  const end = s.lastIndexOf("]");
  if (end > start) {
    try {
      const parsed = JSON.parse(s.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through to salvage */
    }
  }
  // Salvage: walk the array and collect every complete top-level {...} object.
  const objs: any[] = [];
  let depth = 0, inStr = false, esc = false, objStart = -1;
  for (let i = start + 1; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          objs.push(JSON.parse(s.slice(objStart, i + 1)));
        } catch {
          /* skip a malformed object */
        }
        objStart = -1;
      }
    }
  }
  return objs;
}

function matchFlow(module: string, flows: PlannedFlow[]): string {
  const hit = flows.find((f) => flowMeta(f.flowId).module === module);
  return (hit ?? flows[0])?.flowId ?? "events.rfp_rfq";
}

function makeCaseId(c: TestCase, n: number): string {
  const id = c.flowId ?? "";
  const p = id.startsWith("events")
    ? "EVT"
    : id.startsWith("masterdata.user")
      ? "USR"
      : id.startsWith("masterdata")
        ? "MD"
        : id.startsWith("entrypath")
          ? "INT"
          : id.startsWith("vendor")
            ? "VND"
            : "TC";
  return `TC-${p}-${String(n).padStart(2, "0")}`;
}

// ── 4 · DATA AGENT ────────────────────────────────────────────────────────
export async function dataAgent(state: RunState, emit: Emit): Promise<Partial<RunState>> {
  emit({ agent: "Data", status: "start", title: "Generating test data" });

  // Summarise the concrete inputs implied by the designed edge/validation cases.
  const cases = state.cases ?? [];
  const probeInScope = cases.some((c) => c.flowId === "masterdata.user_permissions");
  const inputCases = cases.filter((c) => c.type === "data-validation" || c.type === "edge");

  const data = probeInScope
    ? {
        valid: [{ field: "phone", value: "98xxxxxxxx", note: "valid 10-digit mobile" }],
        edge: [
          { field: "phone", value: "9876543ABC", note: "10 chars but contains letters" },
          { field: "phone", value: "9 digits", note: "one digit short" },
          { field: "phone", value: "11 digits", note: "one digit too many" },
        ],
      }
    : { cases: inputCases.map((c) => ({ case: c.id, focus: c.scenario })) };

  const facts = probeInScope
    ? "I generated concrete inputs for the phone field: one valid 10-digit number, plus edge/invalid values " +
      "(letters, one too short, one too long). Valid should be accepted; the rest rejected."
    : `I generated valid, edge, and invalid inputs for ${inputCases.length} boundary case(s) across the planned flows ` +
      `(e.g. ${inputCases.slice(0, 2).map((c) => c.scenario).join("; ") || "the happy path only"}).`;
  const reasoning = await narrate("Data", facts);

  emit({ agent: "Data", status: "done", title: "Valid + edge + invalid data ready", reasoning, data });
  return {};
}

// ── 5 · CRITIC (loops back to the designer) ───────────────────────────────
export async function critic(state: RunState, emit: Emit): Promise<Partial<RunState>> {
  const round = state.designRound ?? 0;
  emit({ agent: "Critic", status: "start", title: "Reviewing coverage" });

  // A run is well-covered when it has: the happy path (functional), at least one
  // boundary/negative case (data-validation OR edge), and a non-functional check.
  // (Not every flow can produce all four dimensions, so we require what's achievable.)
  const types = new Set((state.cases ?? []).map((c) => c.type));
  const gaps: string[] = [];
  if (!types.has("functional")) gaps.push("functional");
  if (!types.has("data-validation") && !types.has("edge")) gaps.push("a boundary case (data-validation/edge)");
  if (!types.has("non-functional")) gaps.push("non-functional");
  const complete = gaps.length === 0 || round >= 2;

  const facts = complete
    ? `Coverage looks solid: the happy path, boundary cases, and a non-functional check are all present (${[...types].join(", ")}). Approving for execution.`
    : `Coverage gap found: missing ${gaps.join(", ")}. Sending the plan back to the Test-designer to add it before we run anything.`;
  const reasoning = await narrate("Critic", facts);

  emit({
    agent: "Critic",
    status: "done",
    title: complete ? "Approved ✓" : `Looping back — missing ${gaps.join(", ")}`,
    reasoning,
    data: { complete, gaps, round: round + 1 },
  });
  return {
    critique: { round: round + 1, complete, gaps, note: facts },
    designRound: complete ? round : round + 1,
  };
}

// ── 6 · EXECUTOR (calls the real runner + DB oracle + validation probe) ────
export async function executorAgent(
  state: RunState,
  emit: Emit,
  client: Client,
): Promise<Partial<RunState>> {
  emit({ agent: "Executor", status: "start", title: "Running automation live against UAT" });
  const planned = (state.plan ?? []).filter((p) => p.enabled);

  // 1) End-to-end functional flow (e.g. create → surrogate bid → award) if an
  //    executable event flow is planned — the real happy path, DB-verified.
  let flowResults: any[] = [];
  const eventFlow = planned.find((p) => p.category === "events" && EXECUTABLE.includes(p.flowId));
  if (eventFlow) {
    emit({ agent: "Executor", status: "reasoning", title: `End-to-end: ${eventFlow.flowId}…` });
    flowResults = await runSelected(client, [eventFlow.flowId]);
  }

  // 2) Field-aware automation suites for each planned flow (deduped by suite).
  emit({ agent: "Executor", status: "reasoning", title: "Building the automation suite…" });
  const seen = new Set<string>();
  const suite: Awaited<ReturnType<typeof buildChecksForFlow>> = [];
  for (const p of planned) {
    const key = suiteKey(p.flowId);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try {
      suite.push(...(await buildChecksForFlow(client, p.flowId)));
    } catch {
      /* a suite that can't set up (e.g. product family) is skipped */
    }
  }

  // 2b) REQUEST-DRIVEN checks: the LLM writes executable checks for THIS request
  //     (e.g. "bid and award" → stage/bid/award checks), safety-gated before they
  //     can run. This is what makes the automation follow the user's command
  //     instead of always firing the same static suite.
  try {
    const ctx: DynamicContext = {};
    // Give the generator a real event to target when we just created one.
    const created = flowResults?.[0] as any;
    if (created?.eventGroupUuid) ctx.eventGroupUuid = created.eventGroupUuid;
    const gen = await generateDynamicChecks(
      client,
      state.request,
      planned.map((p) => p.flowId),
      ctx,
    );
    if (gen.checks.length) {
      emit({
        agent: "Executor",
        status: "reasoning",
        title: `AI wrote ${gen.raw} checks for this request — ${gen.checks.length} passed the safety gate${
          gen.dropped.length ? `, ${gen.dropped.length} dropped` : ""
        }`,
        data: { generated: gen.checks.length, dropped: gen.dropped },
      });
      suite.push(...gen.checks);
    } else if (gen.raw > 0) {
      emit({
        agent: "Executor",
        status: "reasoning",
        title: `AI wrote ${gen.raw} checks but none passed the safety gate — running the standard suites`,
        data: { dropped: gen.dropped },
      });
    }
  } catch (e: any) {
    // Generation is a bonus layer — never let it break a run.
    emit({ agent: "Executor", status: "reasoning", title: `Request-specific generation unavailable (${e?.message ?? e})` });
  }

  // 3) Run every check live, streaming each result to the UI.
  emit({ agent: "Executor", status: "reasoning", title: `Executing ${suite.length} checks…` });
  const checkResults: any[] = [];
  for (const c of suite) {
    const r = await runCheck(client, c);
    checkResults.push(r);
    emit({
      agent: "Check",
      status: "done",
      title: `${r.id} ${r.pass ? "✓" : "✗"} ${r.scenario}`,
      data: { check: r },
    });
  }

  const passed = checkResults.filter((r) => r.pass).length;
  const failed = checkResults.length - passed;
  const serverErrors = checkResults.filter((r) => !r.pass && (r.httpStatus ?? 0) >= 500).length;
  const gaps = failed - serverErrors;
  const facts =
    `I ran ${checkResults.length} automated checks live against UAT` +
    (flowResults.length ? ` plus the end-to-end ${flowResults[0].flowId} flow (${flowResults[0].status}, DB-verified)` : "") +
    `: ${passed} passed, ${failed} failed — ${serverErrors} server error(s) (5xx) and ${gaps} validation gap(s).`;
  const reasoning = await narrate("Executor", facts);

  emit({
    agent: "Executor",
    status: "done",
    title: `${passed}/${checkResults.length} checks passed · ${failed} failed`,
    reasoning,
    data: { summary: { passed, failed, serverErrors, gaps }, flowResults },
  });
  return { checkResults, flowResults };
}

// ── 7 · REPORTER (RAG to explain failures) ────────────────────────────────
export async function reporter(state: RunState, emit: Emit): Promise<Partial<RunState>> {
  emit({ agent: "Reporter", status: "start", title: "Writing the report" });

  const checks = state.checkResults ?? [];
  const flowResults = state.flowResults ?? [];
  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.length - passed;

  const failedChecks = checks.filter((c) => !c.pass);
  const sevRank: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  // 5xx first, then by severity — the most serious bugs at the top.
  failedChecks.sort((a, b) => {
    const a5 = (a.httpStatus ?? 0) >= 500 ? 0 : 1;
    const b5 = (b.httpStatus ?? 0) >= 500 ? 0 : 1;
    return a5 - b5 || (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9);
  });

  const findings: Finding[] = failedChecks.slice(0, 8).map((c) => {
    const is5xx = (c.httpStatus ?? 0) >= 500;
    return {
      title: `[${c.id}] ${c.scenario}`,
      severity: is5xx ? "high" : c.severity === "Critical" || c.severity === "High" ? "high" : c.severity === "Medium" ? "medium" : "low",
      whatHappened: c.verdict,
      where: `${c.module}${c.field ? " · field: " + c.field : ""} (${c.flowId})`,
      likelyCause: is5xx
        ? "The server threw a 5xx instead of returning a clean 4xx — invalid input reached code that could not handle it."
        : c.expected === "reject"
          ? "Server-side validation is more lenient than it should be — it accepted input the rules say to reject."
          : "The product rejected an input that should be valid.",
      evidence: [`Input: ${c.inputSummary}`, `Result: HTTP ${c.httpStatus ?? "error"}${c.message ? " — " + c.message : ""}`, `Category: ${c.category} · ${c.severity}`],
      breaksProduct: is5xx,
    };
  });

  // Flow-level failures (the end-to-end flow) are the most serious.
  for (const f of flowResults.filter((r) => r.status === "failed")) {
    findings.unshift({
      title: `End-to-end flow failed: ${f.name}`,
      severity: "high",
      whatHappened: f.error ?? "The flow did not complete.",
      where: f.flowId,
      likelyCause: "A step threw before completion — see the error.",
      evidence: ["Executor result"],
      breaksProduct: true,
    });
  }

  // The Oracle has already judged the evidence — including everything the UI
  // journey found, which the API checks cannot see. Its verdicts go FIRST and
  // in its words: a report that re-derives severity from HTTP codes throws away
  // the contradiction detection and the "seen this before" history.
  const verdicts = state.verdicts ?? [];
  for (const v of [...verdicts].reverse()) {
    if (!v.actionable) continue;
    findings.unshift({
      title: v.seenBefore ? `${v.title} (known issue — seen ${v.seenBefore}× before)` : v.title,
      severity: v.severity === "critical" ? "high" : v.severity,
      whatHappened: v.rationale,
      where: `${v.source.toUpperCase()} · ${v.kind}`,
      likelyCause:
        v.kind === "contradiction"
          ? "The interface reported nothing while the API failed — the screen silently does nothing when the action is pressed."
          : v.kind === "product_defect"
            ? "The server could not handle a request the application itself built from a valid form."
            : v.kind === "product_rejected_input"
              ? "The product refused the submission — the journey is missing a step or the data is invalid."
              : "The harness could not drive the journey; the product was never exercised.",
      evidence: v.evidence.length ? v.evidence : ["No evidence captured"],
      breaksProduct: v.kind === "product_defect" || v.kind === "contradiction",
    });
  }

  const oracleDefects = verdicts.filter(
    (v) => v.kind === "product_defect" || v.kind === "contradiction",
  ).length;
  const serverErrors = failedChecks.filter((c) => (c.httpStatus ?? 0) >= 500).length;
  const gaps = failed - serverErrors;
  const headline = oracleDefects
    ? `${oracleDefects} product defect(s) confirmed by the Oracle` +
      (failed ? ` · ${failed} of ${checks.length} checks failed` : "")
    : failed
    ? `${failed} of ${checks.length} checks failed — ${serverErrors} server error(s), ${gaps} validation gap(s)`
    : checks.length
      ? `All ${checks.length} automated checks passed`
      : "No automated checks ran for this request.";
  const flowLine = flowResults.length
    ? `End-to-end ${flowResults[0].flowId}: ${flowResults[0].status} (DB-verified). `
    : "";
  const summary =
    `Ran ${checks.length} field-aware automated checks live against UAT for "${state.request}" (${state.companyName ?? state.companyId}). ` +
    `${passed} passed, ${failed} failed. ` +
    flowLine +
    (serverErrors ? `${serverErrors} check(s) triggered a 5xx server error (definite defects). ` : "");
  const recommendation = oracleDefects
    ? `Start with the ${oracleDefects} defect(s) the Oracle confirmed from evidence — each has a failing request or a UI/API contradiction behind it, so they are reproducible without guesswork.`
    : serverErrors
    ? "Fix the endpoints returning 5xx on invalid input (they should return a clean 400/422). Then close the validation gaps where invalid input was accepted."
    : gaps
      ? "Tighten server-side validation on the fields flagged below so the API rejects invalid input as the rules require."
      : "No defects found in this run — the tested validation behaved correctly.";

  const facts = `${summary}Top issue: ${findings[0]?.title ?? "none"}. ${recommendation}`;
  const reasoning = await narrate("Reporter", facts);

  const report = { headline, summary, passed, failed, findings, recommendation };
  emit({ agent: "Reporter", status: "done", title: headline, reasoning, data: { report } });
  return { report };
}
