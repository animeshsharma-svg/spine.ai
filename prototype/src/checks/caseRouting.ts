import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UI_FLOWS } from "../ui/uiFlowRunner.js";
import { ALL_SUITES } from "./suites.js";
import type { CatalogCase } from "./testCatalog.js";
import { allCases } from "./testCatalog.js";
import { loadCases, heldCases, unrunnableReason, type TestCaseRecord } from "./caseLibrary.js";
import { STEP_CODE } from "./apiAssertions.js";
import { gate } from "./dynamicChecks.js";
import { STEP_META, type StepKind } from "./journeyModel.js";
import { hasStoredFullPlan, storedApiPlan } from "./compiledPlans.js";

/**
 * How a written case reaches an actual runner — and, just as importantly, when
 * it does not.
 *
 * The catalog has thousands of cases and the frameworks do not implement all of
 * them. Pretending otherwise would be the worst outcome available: a dashboard
 * where every case shows a Run button, half of them quietly run something
 * generic that proves nothing, and the pass rate becomes meaningless. So each
 * case is routed to the most specific runner that genuinely exists for it, a
 * case with no runner says so, and every route carries a STRENGTH — how much a
 * green result on that runner says about this case.
 *
 * Order matters — most specific first:
 *   ui-crosscheck  the UI↔API cross-check runs it by its own id
 *   ui-journey     a hand-written, healed browser journey covers it exactly
 *   api-case       the API framework implements it (BE-x.y)
 *   api-library    the API case library runs this case's own request
 *   api-template   the template field check runs it (npm run template:check)
 *   api-matrix     a bidding-matrix combination runs it (Mx)
 *   api-field      a field check, judged on every API journey
 *   api-section    only the framework's cases for the same AREA (weaker)
 *   api-suite      a validation suite for the same section (weaker)
 *   api-plan       the API test compiler can turn the prose into requests (when it is installed)
 *   ui-compile     the browser compiler builds a plan from the prose
 *   manual         the catalog itself says a person must do this
 *   none           honestly unrunnable today
 */
const here = dirname(fileURLToPath(import.meta.url));
const API_REGISTRY = join(here, "..", "..", "..", "procol test", "src", "flows", "eventsContract.ts");
const MATRIX_SRC = join(here, "biddingMatrix.ts");
/**
 * The API test compiler (Phase 9) and its runner. Feature-detected: routing
 * offers the compiler only once BOTH exist — a compiler with nothing to run
 * its plans would turn an area run the picker can do today into nothing.
 */
const API_PLANNER = join(here, "..", "agents", "apiPlanner.ts");
const API_PLAN_RUNNER = join(here, "apiPlanRunner.ts");

export type RouteKind =
  | "ui-journey"
  | "api-case"
  | "api-library"
  | "api-template"
  | "api-matrix"
  | "api-field"
  | "ui-crosscheck"
  | "api-section"
  | "api-suite"
  | "api-plan"
  | "ui-compile"
  | "manual"
  | "none";

/**
 * How much a green result on the route says about THIS case.
 *
 *   exact         the runner sends this case's own request and judges it the way the case says
 *   same-request  the runner sends this case's request, but asserts less (e.g. "no crash"
 *                 where the case documents a refusal that depends on a company setting)
 *   approximate   the runner sends a request on the right endpoint, inferred from the section,
 *                 and checks only that the server answers without crashing
 *   weak          the runner sends the endpoint's generic valid request — the change the case
 *                 is about is not in it, so a pass proves nothing about the case
 *   area          only other cases for the same area run
 *   compile       a plan is compiled from the prose at run time; whether it covers the
 *                 case is only known then
 *   none          nothing runs it
 */
export type RouteStrength = "exact" | "same-request" | "approximate" | "weak" | "area" | "compile" | "none";

export interface CaseRoute {
  kind: RouteKind;
  /** The journey key, BE- id, library id, suite id or combination this case runs as. */
  target?: string;
  /** Why this route, in one line, for the dashboard to show on hover. */
  because: string;
  /**
   * Whether the case picker (/api/case-run) can run this one case on its own.
   * A case can reach a real runner without that — see `runner` and `runsNow`.
   */
  runnable: boolean;
  /** How much a result on this route says about this case. */
  strength: RouteStrength;
  /**
   * True when a runner that exists TODAY runs this case (or exactly its request):
   * strength exact / same-request, or a compiled browser plan in a compilable
   * area. Area-only, approximate and weak routes are not counted.
   */
  runsNow: boolean;
  /**
   * Where the case really runs, in words, when that is not the case picker:
   * the API case library (EDGE-…, VBU-…, the written imports) runs from the API
   * automation tree, every field check (API-F…) runs on every API journey.
   */
  runner?: {
    where: "api-library" | "api-journey" | "ui-crosscheck" | "template-check" | "bidding-matrix" | "api-plan";
    id?: string;
    how: string;
  };
  /**
   * The result ids that count as THIS case having run: its own id plus the
   * exact / same-request runner ids (library twin, its per-event-type copies,
   * the BE- case). Area-only runs are deliberately not here.
   */
  resultIds: string[];
}

const FLOW_KEYS = new Set(UI_FLOWS.map((f) => f.key));
const SUITE_IDS = new Set(ALL_SUITES.map((s) => s.id));

let apiCaseIds: Set<string> | null = null;

/**
 * The case ids the API framework actually implements, read from its own
 * registry rather than kept as a second list here. A list maintained by hand
 * would drift the first time someone adds a case there.
 *
 * Scoped to the `CASE_RUNNERS` object on purpose. The same file also holds a
 * `SKIP_REASONS` map keyed by the same ids — counting those as implemented
 * would claim a runner for every case the framework has explicitly declared it
 * cannot run yet, which is the opposite of what that map means.
 */
function implementedApiCases(): Set<string> {
  if (apiCaseIds) return apiCaseIds;
  apiCaseIds = new Set();
  if (!existsSync(API_REGISTRY)) return apiCaseIds;
  try {
    const src = readFileSync(API_REGISTRY, "utf8");
    // Anchor on the DECLARATION. Plain "CASE_RUNNERS" first matches the file's
    // own doc comment, which slices out a window containing no cases at all.
    const start = src.indexOf("export const CASE_RUNNERS");
    const end = start >= 0 ? src.indexOf("\nexport const", start + 1) : -1;
    const registry = start >= 0 ? src.slice(start, end > 0 ? end : undefined) : "";
    for (const m of registry.matchAll(/["'](BE-\d+\.\d+)["']\s*:/g)) apiCaseIds.add(m[1]);
  } catch {
    /* the API project may not be checked out — routing degrades, nothing breaks */
  }
  return apiCaseIds;
}

let matrixCombos: Set<string> | null = null;
/** The bidding-matrix combinations that exist (M1…), read from its source. */
function implementedCombos(): Set<string> {
  if (matrixCombos) return matrixCombos;
  matrixCombos = new Set();
  try {
    const src = readFileSync(MATRIX_SRC, "utf8");
    for (const m of src.matchAll(/\bid:\s*"(M\d+)"/g)) matrixCombos.add(m[1]);
  } catch {
    /* no matrix — those cases route to none */
  }
  return matrixCombos;
}

/** Whether the API test compiler (Phase 9) is installed. Checked once per process. */
let plannerPresent: boolean | null = null;
export function apiPlannerInstalled(): boolean {
  const has = (f: string) => existsSync(f) || existsSync(f.replace(/\.ts$/, ".js"));
  return (plannerPresent ??= has(API_PLANNER) && has(API_PLAN_RUNNER));
}

/**
 * Catalog section → the API framework's own section that covers the same
 * ground, mapped from the section comments in its `CASE_RUNNERS` registry
 * (`1.x creation`, `3.x line items`, and so on).
 *
 * This is a WEAKER claim than `api-case` and is labelled as one: running BE-3.x
 * exercises line items at the HTTP layer, but it is not running this specific
 * written case. Offering it is still worth more than nothing — it is real
 * traffic against the right endpoints — as long as nobody reads it as the case
 * itself having passed.
 */
const SECTION_TO_BE_GROUP: Record<string, { group: number; what: string }> = {
  "API-EG": { group: 1, what: "creating the draft event group" },
  "API-STG": { group: 1, what: "stage creation" },
  "API-PUB": { group: 2, what: "activation" },
  "API-LC": { group: 9, what: "state transitions" },
  "API-LI": { group: 3, what: "line items" },
  "API-AUD": { group: 4, what: "audience and participants" },
  "API-BID": { group: 5, what: "bids" },
  "API-SUR": { group: 5, what: "bids" },
  "API-AWD": { group: 6, what: "awarding" },
  "API-CONV": { group: 7, what: "RFQ → Auction conversion" },
  "API-PERM": { group: 8, what: "authorization" },
};

/** The implemented case ids in one of the framework's sections. */
function beGroupCases(group: number): string[] {
  return [...implementedApiCases()].filter((id) => id.startsWith(`BE-${group}.`));
}

/**
 * The sections the browser step catalog can actually express.
 *
 * Derived from the steps the planner owns (create/compose/template/line items/
 * sheet/schedule/invite/publish/bid/evaluate/award), which are all sourcing
 * event operations. Anything outside this list compiles into a default events
 * plan, which is not the case someone asked for. When the general UI steps
 * (Phase 8) land, their areas belong here.
 */
const COMPILABLE_SECTIONS = new Set([
  "UI-EG",
  "UI-STG",
  "UI-LI",
  "UI-TPL",
  "UI-SCH",
  "UI-VND",
  "UI-PUB",
  "UI-BID",
  "UI-EVL",
  "UI-AWD",
  "UI-AUC",
  "UI-CONV",
]);

/** Section code → the validation suite that covers it, where one does. */
const SECTION_SUITES: Record<string, string> = {
  "API-EG": "events.rfp_rfq",
  "API-STG": "events.rfp_rfq",
  "API-VAL": "events.rfp_rfq",
};

/**
 * WRITTEN CASE → THE LIBRARY CASE THAT SENDS ITS REQUEST, checked by hand.
 *
 * The written events-api.md cases were imported with one generic body per
 * endpoint (scripts/import-written-api-cases.mjs), so most of their own
 * library copies cannot test the change they describe. The edge library
 * (data/api-cases-extra/*.json) was written later, per guard in the backend,
 * and many of its cases send exactly the request a written case describes.
 * Each link below was read side by side: same endpoint, same single change,
 * same documented outcome.
 *
 *   assert: "same"   — the library case asserts what the written case expects
 *   assert: "less"   — same request, but the library case asserts only "no
 *                      crash", because the refusal depends on a company setting
 *                      or a state it cannot guarantee (its expectedResult says so)
 */
const CURATED_LINKS: Record<string, { to: string; assert: "same" | "less" }> = {
  "API-AUD-004": { to: "EDGE-PUB-031", assert: "same" }, // 501 audience companies → 511
  "API-AUD-014": { to: "EDGE-PUB-053", assert: "same" }, // reject participant, blank remarks → 752
  "API-PUB-012": { to: "EDGE-PUB-024", assert: "same" }, // attachment from another company's bucket
  "API-TECH-008": { to: "EDGE-BID-039", assert: "less" }, // technical response submitted twice
  "API-BID-009": { to: "EDGE-BID-046", assert: "less" }, // buyer bids on own event
  "API-BID-016": { to: "EDGE-BID-065", assert: "same" }, // negative quantity on bid products
  "API-BID-017": { to: "EDGE-BID-066", assert: "same" }, // negative GST on bid products
  "API-BID-026": { to: "EDGE-BID-087", assert: "same" }, // revise a non-existent bid
  "API-BID-038": { to: "EDGE-BID-097", assert: "less" }, // non-surrogate bid on a staggered event
  "API-SUR-004": { to: "EDGE-BID-094", assert: "less" }, // surrogate bid disabled by the company
  "API-SUR-009": { to: "EDGE-BID-095", assert: "less" }, // surrogate bid after the vendor already bid
  "API-CONV-002": { to: "AUC-CONV-003", assert: "same" }, // second conversion of the same RFQ
  "API-CONV-009": { to: "AUC-INC-004", assert: "same" }, // fast bidding on a single line item
  "API-AWD-018": { to: "EDGE-BID-088", assert: "less" }, // revise a bid already selected for award
  "API-LC-001": { to: "EDGE-PUB-076", assert: "same" }, // withdraw with remarks succeeds
  "API-LC-007": { to: "EDGE-PUB-109", assert: "same" }, // clone a live event
  "API-LC-013": { to: "EDGE-PUB-107", assert: "less" }, // amendment publish without remarks
};

// ── the library, indexed ────────────────────────────────────────────────────

let libById: Map<string, TestCaseRecord> | null = null;
let heldIds: Set<string> | null = null;
let byWrittenRef: Map<string, TestCaseRecord[]> | null = null;

function library() {
  if (!libById) {
    const held = heldCases();
    const all = [...loadCases(), ...held];
    libById = new Map(all.map((c) => [c.id, c]));
    heldIds = new Set(held.map((c) => c.id));
    byWrittenRef = new Map();
    for (const c of all) {
      const ref = String((c as any).writtenRef ?? "").split(" ")[0];
      if (ref) byWrittenRef.set(ref, [...(byWrittenRef.get(ref) ?? []), c]);
    }
  }
  return { libById: libById!, heldIds: heldIds!, byWrittenRef: byWrittenRef! };
}

/** Every placeholder resolves to a stand-in id: only the endpoint is being asked about. */
const ANY_ID = new Proxy({} as Record<string, string>, { get: () => "QA0RouteProbe" });

/**
 * Whether the case runner would let this request out at all. The runner sends
 * library cases only to endpoints on its allowlist (dynamicChecks.ts `gate`);
 * a case on any other endpoint is skipped at run time, every time, so it does
 * not run today however exact its request is. Asked of the gate itself, so the
 * answer moves the moment the allowlist does.
 */
const gateCache = new Map<string, string | null>();
function allowlistBlock(lc: TestCaseRecord): string | null {
  if (gateCache.has(lc.id)) return gateCache.get(lc.id)!;
  let why: string | null = null;
  try {
    const r = gate(
      { method: lc.method, path: lc.path, body: lc.body, expected: lc.expected, title: lc.title } as any,
      ANY_ID as any,
      {} as any,
      lc.feature,
      lc.id,
      lc.feature,
      true,
    );
    if (!r.check && r.reason && /allowlist|not permitted/.test(r.reason)) {
      why = `the case runner does not send ${lc.method} ${String(lc.path).split("?")[0].replace(/\{\{\w+\}\}/g, ":id")} yet (it is not on its list of allowed endpoints)`;
    }
  } catch {
    why = null; // the gate could not judge it here; the run will
  }
  gateCache.set(lc.id, why);
  return why;
}

/** Why a library case cannot give an informative result as written, or null. */
function libraryBlock(lc: TestCaseRecord): string | null {
  const { heldIds } = library();
  if (heldIds.has(lc.id)) {
    // Held by the paraphrase quarantine. Edge stage cases carry the full body
    // (widgets + data + configurations) and are held anyway, because the
    // quarantine matches the endpoint rather than the body — say which.
    const full = !!(lc.body && typeof lc.body === "object" && "widgets" in lc.body);
    return full
      ? "held out by the case library's quarantine of stage-creation requests, although this case sends a full stage body — the quarantine needs to exempt full bodies before it can run"
      : "its request body is a summary of the real stage payload, so the case library holds it out of runs";
  }
  return unrunnableReason(lc) ?? allowlistBlock(lc);
}

interface Twin {
  ids: string[];
  strength: RouteStrength;
  block?: string;
}

/**
 * The library case(s) that run this catalog case, and how strongly.
 *
 * Looked for in order: a curated link (above), the case's own id, a library id
 * named in its trace, the EDGE twin of an API-X case, and the written import's
 * own copies (one per event type for the fanned-out sections).
 */
function libraryTwin(c: CatalogCase): Twin | undefined {
  const { libById, byWrittenRef } = library();
  const curated = CURATED_LINKS[c.id];
  if (curated && libById.has(curated.to)) {
    const lc = libById.get(curated.to)!;
    const block = libraryBlock(lc);
    return { ids: [lc.id], strength: block ? "none" : curated.assert === "same" ? "exact" : "same-request", ...(block ? { block } : {}) };
  }
  const direct =
    (libById.has(c.id) ? c.id : undefined) ?? c.refs.find((r) => libById.has(r)) ?? edgeTwin(c.id, libById);
  if (direct) {
    const lc = libById.get(direct)!;
    const imported = !!(lc as any).writtenRef;
    const block = libraryBlock(lc);
    if (block) return { ids: [direct], strength: "none", block };
    // A written import is only as good as the request the importer could build.
    return { ids: [direct], strength: imported ? importStrength(lc) : "exact" };
  }
  const copies = byWrittenRef.get(c.id);
  if (copies?.length) {
    const block = libraryBlock(copies[0]);
    if (block) return { ids: copies.map((x) => x.id), strength: "none", block };
    return { ids: copies.map((x) => x.id), strength: importStrength(copies[0]) };
  }
  return undefined;
}

/**
 * How faithfully the importer could build a written case's request.
 *
 * Only a PERTURBED copy carries the change the case is about. "Stated" means
 * the case named its endpoint — the body is still the importer's one generic
 * body for it. That is the case itself only when the case is the plain
 * success ("a surrogate bid is accepted"), i.e. it expects `accept`. Seen on
 * 2026-10-03: five surrogate cases ("a repeat bid revises", "needs approval",
 * "negative price"…) all sent the same generic body and were being counted as
 * exact runs of five different cases.
 */
function importStrength(lc: TestCaseRecord): RouteStrength {
  if (lc.weakReason) return "weak";
  const src = (lc as any).pathSource as string | undefined;
  if (src === "perturbed") return "exact";
  if (src === "stated" && lc.expected === "accept") return "exact";
  return "approximate"; // generic body, or an endpoint carried over / taken from the section's anchor
}

function edgeTwin(id: string, lib: Map<string, unknown>): string | undefined {
  const m = id.match(/^API-X([A-Z]+)-(\d{3})$/);
  const t = m ? `EDGE-${m[1]}-${m[2]}` : undefined;
  return t && lib.has(t) ? t : undefined;
}
const CODE_STEP = new Map(Object.entries(STEP_CODE).map(([k, v]) => [v, k as StepKind]));
/** "API-FPUBLISH" → "publish" */
function fieldCheckStep(group: string): StepKind | undefined {
  const m = group.match(/^API-F([A-Z]+)$/);
  return m ? CODE_STEP.get(m[1]) : undefined;
}
function requestNegativeStep(group: string): StepKind | undefined {
  const m = group.match(/^API-N([A-Z]+)$/);
  return m ? CODE_STEP.get(m[1]) : undefined;
}

const RUNS = (s: RouteStrength) => s === "exact" || s === "same-request";
const LIB_HOW = "Runs from the API case library — tick its feature under API automation, or `npx tsx scripts/run-all-runnable.ts`.";

/** The API-plan route, offered only when the API test compiler is installed. */
function apiPlanRoute(c: CatalogCase, why: string, ids: string[]): CaseRoute | null {
  if (!apiPlannerInstalled()) return null;
  // Compiled once (fast tier), validated in code and stored: it runs without
  // a model, so it runs today (data/compiled-plans/api, compiledPlans.ts).
  if (hasStoredFullPlan(c.id)) {
    const sp = storedApiPlan(c.id)!;
    return {
      kind: "api-plan",
      because: `${why} — a plan compiled from its prose is stored and validated (${sp.meta.endpoints.length} request${sp.meta.endpoints.length === 1 ? "" : "s"}), so it runs without the AI`,
      runnable: false,
      strength: "compile",
      runsNow: true,
      runner: { where: "api-plan", id: c.id, how: "Runs its stored, validated API plan (scripts/run-all-runnable.ts --plans, or /api/api-plan/run)." },
      resultIds: ids,
    };
  }
  return {
    kind: "api-plan",
    because: `${why} — the API test compiler can turn this case's prose into requests`,
    runnable: false,
    strength: "compile",
    // Whether its plan covers the case is only known when it compiles.
    runsNow: false,
    runner: { where: "api-plan", id: c.id, how: "Compiled into requests by the API test compiler (/api/api-plan)." },
    resultIds: ids,
  };
}

export function routeFor(c: CatalogCase): CaseRoute {
  const own = [c.id];

  // 0 · the UI↔API cross-check cases run through procol-ui-tests/tests/crosscheck.spec.ts,
  //     started from /api/crosscheck/start — not from the case picker, so `runnable`
  //     stays false and `runner` says where they do run. UI-XCHK-060/061 are automate-later.
  if (/^UI-XCHK-/.test(c.id)) {
    if (/automate-later/i.test(`${c.verdict} ${c.source}`)) {
      return { kind: "none", because: "written for the UI↔API cross-check, not automated yet — automate later", runnable: false, strength: "none", runsNow: false, resultIds: own };
    }
    const how = "Runs in the UI↔API cross-check: it opens the event on screen and compares every value with the API.";
    return { kind: "ui-crosscheck", target: c.id, because: "runs in the UI↔API cross-check (crosscheck.spec.ts)", runnable: false, strength: "exact", runsNow: true, runner: { where: "ui-crosscheck", id: c.id, how }, resultIds: own };
  }

  // 1 · a built journey named in the trace line beats everything: it is
  //     deterministic, healed, and needs no compile step.
  const journey = c.refs.find((r) => FLOW_KEYS.has(r));
  if (journey && c.layer === "ui") {
    return { kind: "ui-journey", target: journey, because: `the "${journey}" journey covers this`, runnable: true, strength: "exact", runsNow: true, resultIds: own };
  }

  // 2 · the API framework may already implement this exact case.
  const be = c.refs.concat(c.source.match(/BE-\d+\.\d+/g) ?? []).find((r) => implementedApiCases().has(r));
  if (be && c.layer === "api") {
    return { kind: "api-case", target: be, because: `the API framework implements this as ${be}`, runnable: true, strength: "exact", runsNow: true, resultIds: library().libById.has(c.id) ? [be] : [c.id, be] };
  }

  // The API case library may run this case — by its own id, a curated link,
  // the library twin its trace names, or the written import's own copies.
  const twin = c.layer === "api" ? libraryTwin(c) : undefined;
  const twinRuns = !!twin && RUNS(twin.strength);
  const runner: CaseRoute["runner"] = twin && !twin.block
    ? { where: "api-library", id: twin.ids[0], how: LIB_HOW }
    : undefined;
  /**
   * A written case's own id is ALSO its library copy's id (API-EG-002 is both).
   * When that copy is weak, approximate or blocked, results recorded under the
   * id are the copy's — a generic request, not this case — so they must not
   * make this case count as run.
   */
  const ownIds = twin && !twinRuns && twin.ids.includes(c.id) ? [] : own;

  if (c.verdict === "manual") {
    return { kind: "manual", because: "the catalog marks this one for a person", runnable: false, strength: "none", runsNow: false, ...(runner ? { runner } : {}), resultIds: ownIds };
  }

  // 3 · an exact library twin beats an area run: it is THIS case's request.
  if (twin && twinRuns) {
    const n = twin.ids.length;
    const what = n > 1 ? `${twin.ids[0]} and ${n - 1} per-event-type cop${n === 2 ? "y" : "ies"}` : twin.ids[0];
    return {
      kind: "api-library",
      target: twin.ids.join(","),
      because:
        twin.strength === "exact"
          ? `runs from the API case library as ${what} — the same request this case describes`
          : `runs from the API case library as ${what} — the same request, but it only checks the server does not crash (the refusal depends on a setting or state the run cannot guarantee)`,
      runnable: false,
      strength: twin.strength,
      runsNow: true,
      runner,
      resultIds: [c.id, ...twin.ids],
    };
  }

  // 4 · template field checks and bidding-matrix combinations run by their own runners.
  if (c.group === "API-XTPL") {
    return {
      kind: "api-template",
      target: "template:check",
      because: "runs in the template field check (npm run template:check, or Product knowledge → Templates)",
      runnable: false,
      strength: "exact",
      runsNow: true,
      runner: { where: "template-check", id: c.id, how: "Runs in the template field check: it opens a real template and tries every field rule against the API." },
      resultIds: ownIds,
    };
  }
  if (c.group === "API-XMAT") {
    const combo = c.source.match(/combination (M\d+)/)?.[1];
    if (combo && implementedCombos().has(combo)) {
      return {
        kind: "api-matrix",
        target: combo,
        because: `runs in the bidding scenarios as combination ${combo}`,
        runnable: false,
        strength: "exact",
        runsNow: true,
        runner: { where: "bidding-matrix", id: combo, how: `Runs in Bidding scenarios, scenario ${combo}.` },
        resultIds: [c.id, `matrix:${combo}`],
      };
    }
  }

  // 5 · a field check runs against the live reply of its journey step, on every API journey.
  if (c.layer === "api") {
    const step = fieldCheckStep(c.group);
    if (step) {
      return {
        kind: "api-field",
        target: step,
        because: `checked on every API journey, against the reply of “${STEP_META[step].title}”`,
        runnable: false,
        strength: "exact",
        runsNow: true,
        runner: { where: "api-journey", how: `Checked on every API journey run, against the reply of “${STEP_META[step].title}”.` },
        resultIds: ownIds,
      };
    }
  }

  // What is left for an API case is weaker than its own request. Say how weak.
  const twinNote = twin
    ? twin.block
      ? ` (its library copy ${twin.ids[0]} cannot run: ${twin.block})`
      : twin.strength === "weak"
        ? ` (its library copy ${twin.ids[0]} sends the endpoint's generic valid request, without the change this case is about)`
        : twin.strength === "approximate"
          ? ` (its library copy ${twin.ids[0]} sends a request inferred from the section and only checks for a crash)`
          : ""
    : "";

  // 6 · the API test compiler, once it is installed, is a better answer than an area run.
  if (c.layer === "api") {
    const planned = apiPlanRoute(c, `no exact runner${twinNote}`, ownIds);
    if (planned) return planned;
  }

  // 7 · the framework may cover this AREA without covering this case.
  const area = SECTION_TO_BE_GROUP[c.group];
  if (c.layer === "api" && area) {
    const ids = beGroupCases(area.group);
    if (ids.length) {
      return {
        kind: "api-section",
        target: ids.join(","),
        because: `no exact runner${twinNote} — the API framework covers ${area.what} as ${ids.length} case(s) (BE-${area.group}.x)`,
        runnable: true,
        strength: "area",
        runsNow: false,
        ...(runner ? { runner } : {}),
        resultIds: ownIds,
      };
    }
  }

  // 8 · a validation suite covering the same ground is the last area answer.
  const suite = SECTION_SUITES[c.group];
  if (c.layer === "api" && suite && SUITE_IDS.has(suite)) {
    return { kind: "api-suite", target: suite, because: `no exact runner${twinNote} — the "${suite}" validation suite covers this section`, runnable: true, strength: "area", runsNow: false, ...(runner ? { runner } : {}), resultIds: ownIds };
  }

  if (c.layer === "api") {
    if (twin) {
      return {
        kind: "api-library",
        target: twin.ids.join(","),
        because: twin.block
          ? `its library copy ${twin.ids[0]} cannot run: ${twin.block}`
          : `runs from the API case library as ${twin.ids[0]}, but not as this case${twinNote}`,
        runnable: false,
        strength: twin.block ? "none" : twin.strength,
        runsNow: false,
        ...(runner ? { runner } : {}),
        resultIds: ownIds,
      };
    }
    // Request negatives (API-N<step>-…) are written from the journey's bodies but not wired to a runner yet.
    if (requestNegativeStep(c.group)) {
      return { kind: "none", because: "written from the journey's requests, not wired to a runner yet — automate later", runnable: false, strength: "none", runsNow: false, resultIds: ownIds };
    }
  }

  /**
   * 9 · the compiler, but only where it can actually build a plan.
   *
   * It writes plans from a step catalog that covers sourcing events and
   * nothing else: create an event, stages, template, line items, sheet,
   * schedule, invite a vendor, publish, bid, evaluate, award. For a case about
   * anything else — purchase orders, GRNs, invoices, bills, auth, settings —
   * the model finds no usable steps and a default events journey gets
   * substituted. Calling those "runnable" is what made 588 of 648 look ready
   * when a fraction of that is, so they are counted honestly instead.
   */
  if (c.layer === "ui" && c.verdict !== "manual") {
    if (COMPILABLE_SECTIONS.has(c.group)) {
      return {
        kind: "ui-compile",
        because: "no journey covers this — the compiler builds a plan from the prose",
        runnable: true,
        strength: "compile",
        runsNow: true,
        resultIds: ownIds,
      };
    }
    return {
      kind: "ui-compile",
      because:
        "the browser step catalog covers sourcing events only, so the compiler cannot build a plan " +
        "for this area yet",
      runnable: false,
      strength: "none",
      runsNow: false,
      resultIds: ownIds,
    };
  }

  return {
    kind: "none",
    because: c.layer === "api" ? "no API runner for this section yet" : "no runner for this case yet",
    runnable: false,
    strength: "none",
    runsNow: false,
    resultIds: ownIds,
  };
}

/** Coverage, counted rather than claimed. */
export function routingCoverage() {
  const byKind: Record<string, number> = {};
  const byStrength: Record<string, number> = {};
  let runnable = 0;
  let reachesRunner = 0;
  let runsNow = 0;
  for (const c of allCases()) {
    const r = routeFor(c);
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    byStrength[r.strength] = (byStrength[r.strength] ?? 0) + 1;
    if (r.runnable) runnable += 1;
    if (r.runnable || r.runner) reachesRunner += 1;
    if (r.runsNow) runsNow += 1;
  }
  const total = allCases().length;
  return { total, runnable, runsNow, reachesRunner, unrunnable: total - runnable, byKind, byStrength };
}
