/**
 * THE CASE BUILDER — "this is new; here is the automation for it."
 *
 * When the matcher says nothing covers what was typed, this agent writes:
 *
 *   1. the TEST CASE itself, in the catalog's house style (title, setup,
 *      numbered steps, expected result, how to tell) — what a person reviews;
 *   2. an API CASE in the library's shape (method, path, body, expected
 *      outcome), when the typed case is about a request or a validation. It is
 *      written as a VARIATION of a real, working request taken from the case
 *      library (never invented from nothing), and it must pass the same safety
 *      gate AI-generated checks pass (dynamicChecks.gate: allowlisted
 *      endpoints only, no DELETE, only placeholders a run can fill, every
 *      name prefixed QA_Platform_);
 *   3. a UI PLAN, compiled by the existing compiler (planner.compileTestCase)
 *      from the typed words, when the case is about a screen. It is compiled,
 *      not executed — the browser belongs to one agent at a time — and the
 *      exact call to execute it later is returned with it.
 *
 * Coverage is said honestly: full / partial / none, with the gaps named. A
 * draft whose automation tests half of what was typed says so on its first
 * line, and the gaps go into the draft so a reviewer sees them.
 *
 * The model used here is the fast tier, for writing only (wording, choosing
 * which field of a known request to change). It decides nothing about pass or
 * fail — the API part is judged by the engine's deterministic classify().
 */
import { chat, llmMode, usageReport } from "../ai/llm.js";
import { loadCases, type TestCaseRecord } from "../checks/caseLibrary.js";
import { gate, type DynamicContext, type DynamicSpec } from "../checks/dynamicChecks.js";
import { caseById } from "../checks/testCatalog.js";
import type { MatchResult, Understood } from "../checks/caseMatcher.js";
import { compileTestCase, type CompileResult } from "./planner.js";
import { areaFor } from "./drafts.js";
import { STYLE_GUIDE, styleExamplesText, toHouseStyle } from "./caseStyle.js";
import { compileApiPlan, planInWords, RECIPES, type CompiledApiPlan } from "./apiPlanner.js";

/** Placeholders a draft may use: the ones a run can fill without touching live business records. */
export const DRAFT_PLACEHOLDERS = [
  "eventGroupUuid", "tradeId", "lineItemUuid", "stamp", "productUuid", "productQualityUuid", "locationUuid",
  "vendorUuid", "vendorCompanyId", "categoryUuid", "familyUuid", "cityUuid", "teamUuid", "userUuid", "prId", "prItemId",
];
/** Placeholders that need a fresh event built first. */
export const EVENT_PLACEHOLDERS = ["eventGroupUuid", "tradeId", "lineItemUuid"];

/** Endpoints where a complete valid payload fits in one request (dynamicChecks' SIMPLE_CREATE). */
const SIMPLE_CREATE_PATHS = [/^\/event_groups$/, /^\/product_categories$/, /^\/products$/, /^\/teams$/, /^\/buyer_hubs\/create$/, /^\/users\/create_user$/];
/** A case about what is true AFTERWARDS needs a read-back. */
const STATE_WORDS = /\bkeeps?\b|\bkept\b|\bretain\w*|\bpersist\w*|\bstill\b|\bafterwards?\b|\bread[- ]?back\b|\bunchanged\b|\breturned\b|\bstored\b|\bsaved (?:as|with)\b/;

const UI_WORDS = /\b(?:screen|page|button|click\w*|drawer|modal|popup|pop-up|tab|toast|tooltip|dropdown|menu|shown|visible|appear\w*|display\w*|render\w*|colou?r|highlight\w*|portal|grid|badge|icon|scroll|dark mode|keyboard|ctrl|print)\b/;
const API_WORDS = /\b(?:api|request|endpoint|payload|body|field|json|http|status code|4\d\d|5\d\d|422|crash\w*|server error|refus\w*|reject\w*|valid\w*|invalid|missing|without|empty|blank|null|negative|zero|non-?numeric|duplicate|twice|limit|max\w*)\b/;

export interface DraftCase {
  title: string;
  why: string;
  setup: string;
  steps: string[];
  expected: string;
  oracle: string;
  priority: string;
}

export interface ApiPart {
  /** library-shape record, placeholders unresolved */
  record: TestCaseRecord & { basedOn?: string; generatedBy: string };
  /** the gate's verdict on the record, checked with every placeholder filled by a dummy */
  gate: { ok: boolean; reason?: string };
  covers: "full" | "partial";
  notCovered: string[];
  needsEvent: boolean;
}

export interface UiPart {
  compiled: Pick<CompileResult, "plan" | "coverage" | "gaps" | "source" | "warnings" | "reasoning"> | null;
  skipped?: string;
  /** how to execute it later, on a dashboard server (drives a browser) */
  executeCall?: string;
}

export interface BuiltAutomation {
  id: string;
  area: string;
  draft: DraftCase;
  api: ApiPart | null;
  apiSkipped?: string;
  /**
   * The API TEST COMPILER's plan (apiPlanner.ts): setup recipe → acts →
   * read-backs → expected outcome. When it is valid it IS the API part — a
   * multi-step case is then automated in full rather than as one request —
   * and `api` (the single-request variation) is kept only as a fallback.
   */
  apiPlan?: CompiledApiPlan;
  ui: UiPart;
  layer: "api" | "ui" | "api+ui" | "none";
  coverage: "full" | "partial" | "none";
  gaps: string[];
  wantsApi: boolean;
  wantsUi: boolean;
  llm: { calls: number; promptTokens: number; completionTokens: number; reasonTierUsed: boolean };
  /** library cases the API part was a variation of */
  bases: string[];
  /** true when the API plan (not the single request) is the API part */
  usesPlan?: boolean;
}

// ── choosing the requests to vary ───────────────────────────────────────────

/** Library cases (with real request bodies) closest to the typed case. */
function baseRequests(u: Understood, match: MatchResult): TestCaseRecord[] {
  const lib = loadCases().filter((c) => !c.notRunnable && !c.bulk && c.method && c.path && c.method.toUpperCase() !== "DELETE");
  const byId = new Map(lib.map((c) => [c.id, c]));
  const picked: TestCaseRecord[] = [];
  // 1 · library cases the matched catalog cases point at (refs EDGE-…, VBU-…)
  for (const cand of [...match.same, ...match.partial, ...match.candidates].slice(0, 10)) {
    const c = caseById(cand.id);
    for (const r of c?.refs ?? []) {
      const lc = byId.get(r);
      if (lc && !picked.includes(lc)) picked.push(lc);
    }
  }
  // 2 · word overlap with the library itself (title, steps, path)
  const words = new Set(u.normalized.split(" ").filter((w) => w.length > 3));
  const scored = lib
    .map((c) => {
      const hay = `${c.title} ${(c.steps ?? []).join(" ")} ${c.path} ${c.feature}`.toLowerCase().replace(/_/g, " ");
      let s = 0;
      for (const w of words) if (hay.includes(w)) s++;
      return { c, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  for (const { c } of scored) {
    if (picked.length >= 4) break;
    if (!picked.includes(c)) picked.push(c);
  }
  // Only requests the gate would ever let a GENERATED check make.
  return picked.filter((c) => dryGate(c).ok).slice(0, 3);
}

/** Run the safety gate with every placeholder filled by a dummy: is the shape allowed at all? */
function dryGate(c: { method: string; path: string; body?: unknown; title?: string; expected?: string }): { ok: boolean; reason?: string } {
  const ctx: Record<string, string> = {};
  for (const p of DRAFT_PLACEHOLDERS) ctx[p] = p === "stamp" ? "1" : "00000000-0000-0000-0000-000000000000";
  const spec: DynamicSpec = {
    scenario: c.title ?? "",
    method: c.method,
    path: c.path,
    body: c.body,
    expected: c.expected ?? "reject",
    category: "Negative",
    severity: "Medium",
    rationale: "",
  };
  const unknown = [...JSON.stringify({ p: c.path, b: c.body ?? null }).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).filter((n) => !DRAFT_PLACEHOLDERS.includes(n));
  if (unknown.length) return { ok: false, reason: `uses ${[...new Set(unknown)].map((n) => `{{${n}}}`).join(", ")}, which a run cannot fill without touching a live record` };
  const fake = { ctx: { buyerApi: null } } as unknown as Parameters<typeof gate>[2];
  const g = gate(spec, ctx as DynamicContext, fake, "assistant.draft", "dry", "Assistant draft", false);
  return g.check ? { ok: true } : { ok: false, reason: g.reason };
}

// ── human wording ───────────────────────────────────────────────────────────

const PLACEHOLDER_WORDS: Record<string, string> = {
  productUuid: "a product", productQualityUuid: "its quality", eventGroupUuid: "the event", tradeId: "the stage",
  lineItemUuid: "the line item", vendorUuid: "a vendor", vendorCompanyId: "a vendor", categoryUuid: "a category",
  familyUuid: "a product family", cityUuid: "a city", teamUuid: "a team", userUuid: "a user", prId: "a purchase request",
  prItemId: "a purchase-request item", locationUuid: "a delivery location", stamp: "a unique number",
};
/** No placeholders, endpoints or JSON in what a person reads (they stay in the API record). */
export function humanText(t: string): string {
  return t
    .replace(/\{\{(\w+)\}\}/g, (_m, k) => PLACEHOLDER_WORDS[k] ?? "a test record")
    .replace(/\b(?:GET|POST|PATCH|PUT)\s+\/[^\s,;)]*/g, "the API")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\(\s*(?:a product|its quality|the event)\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function humanDraft(d: DraftCase): DraftCase {
  return { ...d, title: humanText(d.title), why: humanText(d.why), setup: humanText(d.setup), steps: d.steps.map(humanText), expected: humanText(d.expected), oracle: humanText(d.oracle) };
}

// ── deterministic fallback writer ───────────────────────────────────────────

function sentence(s: string): string {
  const t = s.trim().replace(/\s+/g, " ").replace(/[.!]+$/, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function expectedFor(u: Understood): string {
  if (u.polarity === "refuse") return "The app refuses it with a clear message (a 4xx at the API), and nothing is created or changed.";
  if (u.polarity === "crash") return "The app answers with a clean refusal or success — never a server error (HTTP 500).";
  if (u.polarity === "success") return "The action succeeds and the result is visible and correct afterwards.";
  return "The app behaves as the case describes, consistently, with no error.";
}

/** Without a model: a plain draft from the typed words, and a perturbation of the nearest base request. */
function fallbackDraft(u: Understood): DraftCase {
  return {
    title: sentence(u.typed).slice(0, 110),
    why: "Typed into the assistant as a test case; nothing in the catalog covered it.",
    setup: "A buyer signed in to the client under test.",
    steps: [sentence(u.typed)],
    expected: expectedFor(u),
    oracle: u.polarity === "refuse" ? "The response is a 4xx with an error message, and a read-back shows nothing changed." : "The outcome described in Expected is observed.",
    priority: "P2",
  };
}

/** Change ONE thing in a known-good request, the way the typed condition says. */
function perturb(base: TestCaseRecord, u: Understood): { body: any; what: string } | null {
  const cond = u.concepts.find((c) => c.kind === "condition");
  if (!cond || !base.body || typeof base.body !== "object") return null;
  const target = (cond.object?.[0] ?? u.concepts.find((c) => c.kind === "thing")?.said ?? "").toLowerCase().replace(/s$/, "");
  if (!target) return null;
  const body = JSON.parse(JSON.stringify(base.body));
  let hit: string | null = null;
  const walk = (o: any, path: string) => {
    if (hit || !o || typeof o !== "object") return;
    for (const k of Object.keys(o)) {
      if (hit) return;
      if (k.toLowerCase().includes(target)) {
        const where = path ? `${path}.${k}` : k;
        switch (cond.id) {
          case "missing": delete o[k]; hit = `removed ${where}`; break;
          case "negative": o[k] = -5; hit = `set ${where} to -5`; break;
          case "zero": o[k] = 0; hit = `set ${where} to 0`; break;
          case "invalid": o[k] = "abc"; hit = `set ${where} to "abc"`; break;
          case "special": o[k] = "<script>alert(1)</script>"; hit = `set ${where} to a script payload`; break;
          case "long": o[k] = "A".repeat(1000); hit = `set ${where} to 1,000 characters`; break;
          default: return;
        }
        return;
      }
      walk(o[k], path ? `${path}.${k}` : k);
    }
  };
  walk(body, "");
  return hit ? { body, what: hit } : null;
}

// ── the model writer (fast tier) ────────────────────────────────────────────

interface ModelOut {
  draft: DraftCase;
  api: (DynamicSpec & { basedOn?: string; expectedResult?: string; covers?: string; notCovered?: string }) | null;
  uiNeeded: boolean;
  uiWhy?: string;
}

async function writeWithModel(typed: string, u: Understood, bases: TestCaseRecord[], match: MatchResult): Promise<ModelOut | null> {
  if (llmMode() === "fallback" && !process.env.GOOGLE_API_KEY) return null;
  const baseText = bases
    .map(
      (b) =>
        `- id=${b.id} (${b.title})\n  ${b.method} ${b.path}\n  body: ${JSON.stringify(b.body ?? null).slice(0, 700)}\n  expected: ${b.expected} — ${String(b.expectedResult ?? "").slice(0, 160)}`,
    )
    .join("\n");
  const near = match.partial.concat(match.candidates.filter((c) => c.relation === "unrelated")).slice(0, 3).map((c) => `- ${c.id}: ${c.title}`).join("\n");
  const prompt =
    `A QA engineer typed this NEW test case for Procol (B2B procurement; sourcing events, RFQ/RFP/auctions, bids, awards, vendors):\n"""${typed.slice(0, 700)}"""\n` +
    `(normalised: "${u.normalized}")\n\nClosest existing cases (they do NOT fully cover it):\n${near || "- none"}\n\n` +
    `Known-good API requests you may vary (placeholders in {{…}} are filled at run time):\n${baseText || "- none"}\n\n` +
    `Write:\n1. "draft": the test case in plain English, like a senior QA engineer — title (short), why (one sentence), setup (the pre-conditions in words), configs (the company settings it needs, "setting_key = On|Off — what it does" per line, or None), testData, steps (list of short strings), expected, oracle (how to tell it worked), priority (Critical|High|Medium|Low), testType (Positive|Negative|Edge). Plain English only in the draft: no endpoints, no {{placeholders}}, no JSON, no field names.\n${STYLE_GUIDE}\nHow the voice looks:\n${styleExamplesText()}\n` +
    `2. "api": ONLY if the case is about something a single API request can check (a validation, a refusal, an accepted value, "must not crash"): ONE request that is a variation of one known-good request above — copy its method, path and body and change only what the case is about. Use only these placeholders: ${DRAFT_PLACEHOLDERS.map((p) => `{{${p}}}`).join(", ")}. Every title/name must start with "QA_Platform_". Fields: basedOn (the id), scenario, method, path, body, expected ("reject" = must be refused, "accept" = must succeed, "no-5xx" = either is fine but no crash), expectedResult (one sentence), category, severity, rationale, covers ("full" if this one request checks everything the case asks, else "partial"), notCovered (what it does not check, empty string when full). Use null when no request above fits — do not invent an endpoint.\n` +
    `3. "uiNeeded": true when part of the case is about what a screen shows or how a person uses it; "uiWhy": one sentence.\n` +
    `Reply with ONLY one JSON object: {"draft":{...},"api":{...}|null,"uiNeeded":true|false,"uiWhy":"..."}`;
  try {
    const raw = await chat(
      [
        { role: "system", content: "You write software test cases and API test requests. Reply with JSON only." },
        { role: "user", content: prompt },
      ],
      { tier: "fast", temperature: 1, maxTokens: 1400 },
    );
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const o = JSON.parse(m[0]);
    const d = o?.draft;
    if (!d || typeof d.title !== "string" || !Array.isArray(d.steps) || typeof d.expected !== "string") return null;
    const draft: DraftCase = {
      title: String(d.title).slice(0, 140),
      why: String(d.why ?? "").slice(0, 400),
      setup: String(d.setup ?? "").slice(0, 400),
      steps: d.steps.map((s: unknown) => String(s).slice(0, 300)).slice(0, 12),
      expected: String(d.expected).slice(0, 500),
      oracle: String(d.oracle ?? "").slice(0, 400),
      priority: /^P[0-3]$/.test(d.priority) ? d.priority : "P2",
    };
    let api: ModelOut["api"] = null;
    const a = o.api;
    if (a && typeof a === "object" && typeof a.method === "string" && typeof a.path === "string") {
      api = {
        basedOn: typeof a.basedOn === "string" ? a.basedOn : undefined,
        scenario: String(a.scenario ?? draft.title).slice(0, 200),
        method: a.method,
        path: a.path,
        body: a.body ?? undefined,
        expected: ["accept", "reject", "no-5xx"].includes(a.expected) ? a.expected : "no-5xx",
        expectedResult: String(a.expectedResult ?? "").slice(0, 300),
        category: String(a.category ?? "Negative"),
        severity: ["Critical", "High", "Medium", "Low"].includes(a.severity) ? a.severity : "Medium",
        rationale: String(a.rationale ?? "").slice(0, 300),
        covers: a.covers === "full" ? "full" : "partial",
        notCovered: typeof a.notCovered === "string" ? a.notCovered.slice(0, 300) : "",
      };
      // A request not derived from a known-good one is not accepted.
      if (!bases.some((b) => b.id === api!.basedOn && b.method.toUpperCase() === String(api!.method).toUpperCase())) {
        api = null;
      }
    }
    return { draft, api, uiNeeded: o.uiNeeded === true, uiWhy: typeof o.uiWhy === "string" ? o.uiWhy : undefined };
  } catch {
    return null;
  }
}

// ── the entry point ─────────────────────────────────────────────────────────

export interface BuildOptions {
  /** compile a UI plan with the planner (reason tier — costs money); default true */
  compileUi?: boolean;
  /** compile an API plan (setup → acts → read-backs) with the API test compiler; default true */
  compileApi?: boolean;
  /** use the fast model to write the draft and the API variation; default true */
  llm?: boolean;
  /** the id to file it under; computed by the caller (drafts.nextDraftId) */
  id: string;
  companyId: number;
}

export async function buildAutomation(typed: string, match: MatchResult, opts: BuildOptions): Promise<BuiltAutomation> {
  const u = match.understood;
  const area = areaFor(u.concepts);
  const before = usageReport();
  const bases = baseRequests(u, match);
  const wantsUiWords = UI_WORDS.test(u.normalized);
  const wantsApiWords = API_WORDS.test(u.normalized) || u.polarity === "refuse" || u.polarity === "crash";

  const [model, apiPlan] = await Promise.all([
    opts.llm === false ? Promise.resolve(null) : writeWithModel(typed, u, bases, match),
    opts.compileApi === false || (wantsUiWords && !wantsApiWords)
      ? Promise.resolve(undefined)
      : compileApiPlan({ text: typed }, { llm: opts.llm !== false, allowReason: false }).catch(() => undefined),
  ]);
  const planOk = !!apiPlan?.plan && apiPlan.coverage !== "none";
  const baseDraft = model?.draft ?? fallbackDraft(u);
  // With a plan, the draft's setup / steps / expected are the plan's own words
  // (what will actually run), unless the model already wrote richer prose.
  if (planOk && !model?.draft) {
    const w = planInWords(apiPlan!.plan!);
    baseDraft.setup = w.preconditions;
    baseDraft.steps = w.steps;
    baseDraft.expected = w.expected;
  }
  const draft = humanDraft(baseDraft);
  // the house style (caseStyle.ts): login first, words for priority, the sheet's columns
  {
    const h = toHouseStyle({ title: draft.title, steps: draft.steps, expected: draft.expected, setup: draft.setup, testData: (baseDraft as any).testData, priority: draft.priority, testType: (baseDraft as any).testType });
    draft.steps = h.steps;
    draft.priority = h.priority;
    Object.assign(draft, { role: h.role, portal: h.portal, testData: h.testData, testType: h.testType, configs: String((baseDraft as any).configs ?? "").trim() || "None" });
  }

  // ── API part ──
  let api: ApiPart | null = null;
  let apiSkipped: string | undefined;
  const wantsApi = wantsApiWords || !!model?.api;
  if (wantsApi) {
    let spec: (DynamicSpec & { basedOn?: string; expectedResult?: string; covers?: string; notCovered?: string }) | null = model?.api ?? null;
    let generatedBy = "fast-tier model, as a variation of a library request";
    if (!spec) {
      for (const b of bases) {
        const p = perturb(b, u);
        if (!p) continue;
        spec = {
          basedOn: b.id,
          scenario: draft.title,
          method: b.method,
          path: b.path,
          body: p.body,
          expected: u.polarity === "refuse" ? "reject" : u.polarity === "success" ? "accept" : "no-5xx",
          expectedResult: expectedFor(u),
          category: "Negative",
          severity: "Medium",
          rationale: `${b.id}'s working request with one change: ${p.what}.`,
          covers: wantsUiWords ? "partial" : "full",
          notCovered: wantsUiWords ? "what the screen shows" : "",
        };
        generatedBy = `rule: ${p.what} on ${b.id}'s request`;
        break;
      }
    }
    if (spec) {
      const g = dryGate({ method: spec.method, path: spec.path, body: spec.body, title: spec.scenario, expected: spec.expected });
      const base = bases.find((b) => b.id === spec!.basedOn);
      const record: ApiPart["record"] = {
        id: opts.id,
        feature: base?.feature ?? "assistant.draft",
        title: `QA_Platform_${opts.id}_${draft.title.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 60)}`,
        type: spec.category,
        priority: draft.priority,
        severity: spec.severity,
        preconditions: draft.setup,
        steps: draft.steps.map((s, i) => `${i + 1}. ${s}`),
        method: spec.method.toUpperCase(),
        path: spec.path,
        body: spec.body,
        expected: spec.expected as "accept" | "reject" | "no-5xx",
        expectedResult: spec.expectedResult || draft.expected,
        rationale: spec.rationale,
        basedOn: spec.basedOn,
        generatedBy,
      };
      const notCovered = [spec.notCovered ?? ""].filter((x) => x.trim());
      // Honest coverage, decided here and not by the model's own claim:
      //  · a case that is also about a screen is never fully covered by a request;
      //  · the request's expected outcome must be the outcome the case asks for
      //    (a refusal checked as "reject", a crash check as "no-5xx", a success as
      //    "accept" on an endpoint whose payload can be built in full);
      //  · a case about what is kept afterwards needs a read-back, which one
      //    request does not do.
      const weakened = spec.expected === "accept" && !SIMPLE_CREATE_PATHS.some((r) => r.test(spec!.path.split("?")[0]));
      const outcomeMatches =
        (u.polarity === "refuse" && spec.expected === "reject") ||
        (u.polarity === "crash" && spec.expected === "no-5xx") ||
        (u.polarity === "success" && spec.expected === "accept" && !weakened) ||
        (u.polarity === "neutral" && spec.expected === "accept" && !weakened);
      if (!outcomeMatches)
        notCovered.push(
          spec.expected === "no-5xx"
            ? "it only checks that the server does not crash, not the outcome the case expects"
            : weakened
              ? "a success on this endpoint can only be checked as \"did not crash\" (its full payload needs a live chain)"
              : "the outcome it checks is not the one the case expects",
        );
      const needsReadBack = STATE_WORDS.test(u.normalized);
      if (needsReadBack) notCovered.push("it does not read the record back to confirm what was kept");
      const covers: "full" | "partial" = spec.covers === "full" && !wantsUiWords && outcomeMatches && !needsReadBack ? "full" : "partial";
      if (covers === "partial" && wantsUiWords) notCovered.push("what the screen shows");
      api = {
        record,
        gate: g,
        covers,
        notCovered,
        needsEvent: EVENT_PLACEHOLDERS.some((p) => JSON.stringify({ a: spec!.path, b: spec!.body ?? null }).includes(`{{${p}}}`)),
      };
      if (!g.ok) apiSkipped = `the request was written but the safety gate refused it: ${g.reason}`;
    } else {
      apiSkipped = bases.length
        ? "no known-good request could be varied to express this case"
        : "no known-good request in the library is close enough to vary (and endpoints are never invented)";
    }
  } else {
    apiSkipped = "the case is about the screen, not a request";
  }

  // ── UI part ──
  const wantsUi = wantsUiWords || model?.uiNeeded === true || ((!api || !api.gate.ok) && !planOk);
  let ui: UiPart = { compiled: null };
  let reasonTierUsed = false;
  if (!wantsUi) ui.skipped = "the case is fully about a request; no screen step is needed";
  else if (opts.compileUi === false) ui.skipped = "UI compilation was turned off for this turn (compile=0)";
  else {
    try {
      const compiled = await compileTestCase(typed);
      reasonTierUsed = compiled.source === "llm";
      ui = {
        compiled: { plan: compiled.plan, coverage: compiled.coverage, gaps: compiled.gaps, source: compiled.source, warnings: compiled.warnings, reasoning: compiled.reasoning },
        executeCall: `GET /api/plan-run?c=${opts.companyId}&q=${encodeURIComponent(typed)}  (drives a browser; dry=1 to re-compile only)`,
      };
      if (compiled.source === "fallback") ui.skipped = "the compiler fell back to its generic plan, which is not this case — not counted as coverage";
    } catch (e) {
      ui = { compiled: null, skipped: `the compiler could not run: ${(e as Error).message}` };
    }
  }

  // ── honest coverage ──
  // A valid API plan is the API part; the single request is the fallback.
  const singleCov = api && api.gate.ok ? api.covers : "none";
  const planCov = planOk ? apiPlan!.coverage : "none";
  const usePlan = planOk && (planCov === "full" || singleCov !== "full");
  const apiCov = usePlan ? planCov : singleCov;
  const uiCov = ui.compiled && ui.compiled.source === "llm" ? ui.compiled.coverage : "none";
  const coverage: BuiltAutomation["coverage"] =
    apiCov === "full" || uiCov === "full" ? "full" : apiCov === "partial" || uiCov === "partial" ? "partial" : "none";
  const gaps = [
    ...(usePlan ? apiPlan!.gaps.map((g) => `API plan: ${g}`) : []),
    ...(!usePlan && api && api.gate.ok && api.covers === "partial" ? api.notCovered.map((g) => `API part: ${g}`) : []),
    ...(!usePlan && apiSkipped && wantsApi ? [`API part: ${apiSkipped}`] : []),
    ...(!usePlan && apiPlan && !planOk && wantsApi ? [`API plan: ${apiPlan.gaps.join("; ") || "none could be compiled"}`] : []),
    ...(ui.compiled && ui.compiled.coverage !== "full" ? ui.compiled.gaps.map((g) => `UI part: ${g}`) : []),
    ...(ui.skipped && wantsUi ? [`UI part: ${ui.skipped}`] : []),
  ];
  const layer: BuiltAutomation["layer"] =
    apiCov !== "none" && uiCov !== "none" ? "api+ui" : apiCov !== "none" ? "api" : uiCov !== "none" ? "ui" : "none";

  const after = usageReport();
  const sum = (r: ReturnType<typeof usageReport>, k: "calls" | "promptTokens" | "completionTokens") => Object.values(r.byModel).reduce((n, t) => n + t[k], 0);
  return {
    id: opts.id,
    area,
    draft,
    api,
    apiSkipped,
    ...(apiPlan ? { apiPlan: usePlan ? apiPlan : { ...apiPlan, plan: planOk ? apiPlan.plan : null } } : {}),
    ui,
    layer,
    coverage: coverage === "full" && gaps.length && apiCov !== "full" && uiCov !== "full" ? "partial" : coverage,
    gaps,
    wantsApi,
    wantsUi,
    llm: {
      calls: sum(after, "calls") - sum(before, "calls"),
      promptTokens: sum(after, "promptTokens") - sum(before, "promptTokens"),
      completionTokens: sum(after, "completionTokens") - sum(before, "completionTokens"),
      reasonTierUsed,
    },
    bases: bases.map((b) => b.id),
    usesPlan: usePlan,
  };
}

/** One line on the plan, for the assistant's answer. */
export function planSummary(c: CompiledApiPlan): string {
  if (!c.plan) return "no API plan could be compiled";
  const r = RECIPES[c.plan.setup.recipe];
  return `an API plan — ${c.plan.act.length} step(s) and ${c.plan.verify.length} read-back(s) on a fresh record (${(r ? r.title.replace(/\.$/, "").replace(/^A /, "a ") : c.plan.setup.recipe)}), expecting ${c.plan.expected.outcome === "reject" ? `a refusal${c.plan.expected.message ? ` (“${c.plan.expected.message}”)` : ""}` : c.plan.expected.outcome === "accept" ? "success" : "no server error"}`;
}
