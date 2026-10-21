/**
 * TEST COVERAGE BY MODULE — counted from what ran, never from what is written.
 *
 * Aanya, 15 Oct: "for the platform first of all I need the coverage metrics…
 * which module is covered — intake how much, PR how much, event how much, P2P
 * flow how much. I want the main coverage at least 80–90% in the events
 * module. First module-wise, then in events each submodule, in both API and
 * UI and individually. The true metrics."
 *
 * THE UNIT is a test case: every case of the written catalog (testCatalog.ts,
 * 6,461) plus every case of the API case library that no catalog case already
 * stands for (caseLibrary.ts, run by /api/features-run). Each gets a module,
 * a layer (API or UI) and a status:
 *   for a person   the catalog marks it manual — outside automation, shown apart
 *   not automated  no runner sends it yet
 *   automated      a runner can send it today, but no run has given it a verdict
 *   ran            at least one saved run gave it a pass or a fail
 *                  (a "couldn't tell" is not a verdict and does not count)
 * COVERAGE = ran ÷ (cases meant for automation). A failing case IS covered:
 * the product was tested and found wanting; its result is the pass rate.
 *
 * Where a run's verdict comes from: coverageTruth (metrics.ts) — the API runs,
 * the bidding matrix and the UI↔API cross-check — plus the browser journeys
 * (procol-ui-tests/findings/results), which coverageTruth did not read: a
 * screen case routed to a journey counts as run when that journey ran.
 *
 * Field checks — the per-reply checks on every journey step (API-F…) — are
 * many (1,020) and mostly green, so they are reported apart and never mixed
 * into a module's case coverage. Each step's first check, "<step> succeeds"
 * (API-F<STEP>-001), is that step of the main flow working end to end: it
 * counts as a case, and as the area's main flow.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FEATURE_TREE } from "../../config/featureTree.js";
import { allResults, coverageTruth, type CaseCoverage, type Outcome } from "../checks/metrics.js";
import { allCases } from "../checks/testCatalog.js";
import { routeFor } from "../checks/caseRouting.js";
import { loadCases, unrunnableReason } from "../checks/caseLibrary.js";
import { planSpeaksForCase, reloadStoredPlans, storedApiPlan } from "../checks/compiledPlans.js";

const here = dirname(fileURLToPath(import.meta.url));
const UI_RESULTS = join(here, "..", "..", "..", "procol-ui-tests", "findings", "results");

export type Layer = "api" | "ui";

export interface Tally {
  total: number;
  /** marked for a person (manual) */
  manual: number;
  /** total − manual: the denominator */
  automatable: number;
  /** a runner can send it today */
  automated: number;
  /** gave a pass or a fail at least once */
  ran: number;
  pass: number;
  fail: number;
  /** ran only through a compiled plan that checks part of the case, not its point — not in `ran` */
  partly: number;
}
const empty = (): Tally => ({ total: 0, manual: 0, automatable: 0, automated: 0, ran: 0, pass: 0, fail: 0, partly: 0 });

export interface Bucket {
  id: string;
  label: string;
  api: Tally;
  ui: Tally;
  both: Tally;
  /** per-reply field checks (API), kept apart */
  fieldChecks: { total: number; ran: number; pass: number; fail: number };
  /** the API journey's own steps in this area ("<step> succeeds") */
  mainFlow: { total: number; ran: number; pass: number; steps: Array<{ id: string; title: string; last: Outcome | null }> };
  /** browser journeys that drive this area, and how often they ran */
  journeys: Array<{ key: string; runs: number; passed: number; lastAt: string | null; last: Outcome | null }>;
  /** cases meant for automation that have not run yet, most important first (events submodules only) */
  missing?: Array<{ id: string; layer: Layer; title: string; priority: string; automated: boolean }>;
}

export interface CoverageReport {
  generatedAt: string;
  history: string;
  runsCounted: { api: number; browser: number };
  platform: Bucket;
  modules: Bucket[];
  /** PO → receipt → invoice → payment */
  p2pFlow: Bucket;
  events: Bucket;
  eventSubmodules: Bucket[];
  unassigned: number;
  target: number;
}

// ── where a case belongs ────────────────────────────────────────────────────

/** The report's modules, in the order Aanya named them, then the rest. */
const MODULES: Array<{ id: string; label: string; groups: string[] }> = [
  { id: "intake", label: "Intake", groups: ["intake"] },
  { id: "pr", label: "Purchase requests", groups: ["pr"] },
  { id: "events", label: "Sourcing events (RFx)", groups: ["events", "erfx", "eventfeatures", "auction", "bids", "evaluation", "negotiation", "award"] },
  { id: "po", label: "Purchase orders", groups: ["po"] },
  { id: "p2p", label: "Delivery & receiving", groups: ["p2p"] },
  { id: "finance", label: "Finance: invoices & payment", groups: ["finance"] },
  { id: "contracts", label: "Contracts", groups: ["contracts"] },
  { id: "masterdata", label: "Master data", groups: ["masterdata"] },
  { id: "users", label: "Users, roles & teams", groups: ["users"] },
  { id: "vendors", label: "Vendors", groups: ["vendors", "vendorbulk"] },
  { id: "platform", label: "Platform & config", groups: ["platform"] },
];
const EVENT_GROUPS = MODULES.find((m) => m.id === "events")!.groups;
const P2P_MODULES = ["po", "p2p", "finance"];

/** A catalog journey (data/journeys.json) → the feature-tree group it tests. */
const JOURNEY_GROUP: Record<string, string> = {
  arrive: "events", compose: "erfx", technical: "evaluation", auction: "auction", schedule: "erfx", invite: "events",
  publish: "events", "vendor-bid": "bids", surrogate: "bids", award: "award", convert: "auction", boq: "eventfeatures",
  pr: "pr", classic: "events", lifecycle: "eventfeatures", permissions: "events", robustness: "events",
  "product-vendor": "vendors", "product-auction": "auction", "product-po": "po", "product-contract": "contracts",
  "product-receipt": "p2p", "product-invoice": "finance", "product-insight": "platform", "product-ai": "intake",
  "vendor-bulk-upload": "vendorbulk", "ui-api-crosscheck": "events", "template-fields": "eventfeatures", "bidding-matrix": "bids",
  "deep-quote-comparison": "evaluation", "deep-counter-offers": "negotiation", "deep-auctions": "auction", "deep-amendments": "eventfeatures",
  "deep-approvals": "award", "deep-pr-to-event": "pr", "deep-boq": "eventfeatures", "deep-lots-currency": "events",
  "deep-events-list": "events", "deep-event-communication": "events", "deep-declines-rejections": "bids",
  "deep-timing-weights-drafts": "erfx", "deep-award-outcomes": "award", "deep-competition": "bids", "deep-bid-numbers": "evaluation",
};
/** Journeys that span modules: decided by the case's group (its id prefix). */
const GROUP_GROUP: Record<string, string> = {
  "PRD-MDM": "masterdata", "PRD-ADM": "platform", "PRD-PLT": "platform", "PRD-KBINT": "platform",
  "PRD-INTK": "intake", "PRD-KBPTP": "intake", "PRD-PR": "pr", "PRD-KBPR": "pr",
  "PRD-RFX": "erfx", "PRD-RFP": "evaluation", "PRD-RFQ": "eventfeatures", "PRD-KBSRC": "events",
  "PRD-BUD": "finance", "PRD-AE": "platform",
  // counter offers sit in the award journey but are negotiation
  "API-FCOUNTER": "negotiation", "API-NCOUNTER": "negotiation",
};

const groupOfFeature = new Map<string, string>();
for (const g of FEATURE_TREE as any[]) for (const f of g.children ?? g.features ?? []) groupOfFeature.set(f.id, g.id);
const GROUP_LABEL = new Map<string, string>((FEATURE_TREE as any[]).map((g) => [g.id, g.label]));
// The tree calls its first events group "Sourcing events (RFx)" — the module's own name. As a submodule it is this:
GROUP_LABEL.set("events", "Event types, setup & publishing");

const moduleOfGroup = (group: string) => MODULES.find((m) => m.groups.includes(group))?.id ?? null;

function groupOfCase(c: CaseCoverage): string | null {
  return GROUP_GROUP[c.group] ?? (c.journey ? JOURNEY_GROUP[c.journey] ?? null : null);
}

// ── browser journeys that ran ───────────────────────────────────────────────

interface JourneyTally { runs: number; passed: number; last: Outcome | null; lastAt: string | null }
function browserJourneys(): Map<string, JourneyTally> {
  const out = new Map<string, JourneyTally>();
  if (!existsSync(UI_RESULTS)) return out;
  for (const f of readdirSync(UI_RESULTS).filter((n) => n.endsWith(".json"))) {
    try {
      const r = JSON.parse(readFileSync(join(UI_RESULTS, f), "utf8"));
      const key = String(r.flowKey ?? "");
      const s = String(r.status ?? "").toLowerCase();
      const o: Outcome | null = s === "passed" ? "pass" : /broke|failed|fail|error/.test(s) ? "fail" : null;
      if (!key || !o) continue;
      const t = out.get(key) ?? { runs: 0, passed: 0, last: null, lastAt: null };
      t.runs += 1;
      if (o === "pass") t.passed += 1;
      const at = String(r.startedAt ?? "");
      if (!t.lastAt || at >= t.lastAt) {
        t.lastAt = at;
        t.last = o;
      }
      out.set(key, t);
    } catch {
      /* a half-written result is skipped */
    }
  }
  return out;
}

/** The feature-tree group a browser journey drives (its feature's uiFlow, or the feature of that id). */
function groupOfJourney(key: string): string | null {
  for (const g of FEATURE_TREE as any[]) for (const f of g.children ?? g.features ?? []) if (f.uiFlow === key || f.id === key) return g.id;
  if (key.startsWith("bid.")) return "bids";
  if (key.startsWith("event.")) return "events";
  return null;
}

// ── counting ────────────────────────────────────────────────────────────────

interface Row {
  id: string;
  layer: Layer;
  group: string | null;
  title: string;
  priority: string;
  manual: boolean;
  automated: boolean;
  /** ran only through a compiled plan that checks part of it, not its point (not counted as ran) */
  partly: boolean;
  field: boolean;
  /** a step of the API journey's main flow */
  step: boolean;
  last: Outcome | null;
  ran: boolean;
}

function add(t: Tally, r: Row) {
  t.total += 1;
  if (r.manual) {
    t.manual += 1;
    return;
  }
  t.automatable += 1;
  if (r.automated || r.ran) t.automated += 1;
  if (r.ran) {
    t.ran += 1;
    if (r.last === "pass") t.pass += 1;
    else if (r.last === "fail") t.fail += 1;
  } else if (r.partly) t.partly += 1;
}

function bucket(id: string, label: string, rows: Row[], journeys: Map<string, JourneyTally>, groups: string[]): Bucket {
  const b: Bucket = { id, label, api: empty(), ui: empty(), both: empty(), fieldChecks: { total: 0, ran: 0, pass: 0, fail: 0 }, mainFlow: { total: 0, ran: 0, pass: 0, steps: [] }, journeys: [] };
  for (const r of rows) {
    if (r.step) {
      b.mainFlow.total += 1;
      if (r.ran) b.mainFlow.ran += 1;
      if (r.ran && r.last === "pass") b.mainFlow.pass += 1;
      b.mainFlow.steps.push({ id: r.id, title: r.title.replace(/ succeeds$/, ""), last: r.ran ? r.last : null });
    }
    if (r.field) {
      b.fieldChecks.total += 1;
      if (r.ran) {
        b.fieldChecks.ran += 1;
        if (r.last === "pass") b.fieldChecks.pass += 1;
        else if (r.last === "fail") b.fieldChecks.fail += 1;
      }
      continue;
    }
    add(b[r.layer], r);
    add(b.both, r);
  }
  for (const [key, t] of journeys) {
    const g = groupOfJourney(key);
    if (g && groups.includes(g)) b.journeys.push({ key, runs: t.runs, passed: t.passed, last: t.last, lastAt: t.lastAt });
  }
  b.journeys.sort((x, y) => y.runs - x.runs);
  return b;
}

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export async function coverageReport(): Promise<CoverageReport> {
  const ct = await coverageTruth({ withCases: true });
  const { map } = await allResults();
  const journeys = browserJourneys();

  // The journey a screen case is routed to, to count that journey's runs for it.
  const catalog = new Map((allCases() as any[]).map((c) => [c.id, c]));
  const libById = new Map((loadCases() as any[]).map((c) => [c.id, c]));
  reloadStoredPlans(); // the compile script may have stored new plans since the last count
  const caseText = (id: string) => {
    const k = catalog.get(id);
    return k ? `${k.title ?? ""} ${k.expectedResult ?? ""} ${k.expected ?? ""}` : "";
  };
  // A full plan the compiler builds by rules is never stored: compile it again,
  // without the model, to judge it — for the cases a plan ran for or could run.
  const rulePlans = new Map<string, { plan: any; coverage: string; gaps?: string[] } | null>();
  {
    const { compileApiPlan } = await import("../agents/apiPlanner.js");
    for (const c of ct.cases) {
      if (c.layer !== "api" || c.route !== "api-plan" || storedApiPlan(c.id)) continue;
      if (!c.runsNow && !map.has(`plan:${c.id}`)) continue;
      try {
        const r = await compileApiPlan({ caseId: c.id }, { llm: false });
        rulePlans.set(c.id, r.plan ? { plan: r.plan, coverage: r.coverage, gaps: r.gaps } : null);
      } catch {
        rulePlans.set(c.id, null);
      }
    }
  }
  /**
   * A compiled plan's results, counted only when the plan that RAN is the plan
   * that was judged: the stored one, or the rules compile for a case with none.
   * /api/api-plan/run given a case id compiles it again, and a fresh model
   * compile is another plan — 15 Oct, 16 of the first 27 plan runs ran a plan
   * other than the stored one. Read from the run files, which keep the plan.
   */
  const norm = (p: any) => (p ? JSON.stringify({ setup: p.setup, act: p.act, verify: p.verify, outcome: p.expected?.outcome, code: p.expected?.code }) : "");
  const planRuns = new Map<string, { pass: number; fail: number; last: Outcome; lastAt: string }>();
  const otherPlanRan = new Set<string>();
  {
    const dir = join(here, "..", "..", "data", "runs");
    for (const f of existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")) : []) {
      try {
        const rec = JSON.parse(readFileSync(join(dir, f), "utf8"));
        const ran = rec.events?.find((e: any) => e?.title === "api plan")?.data?.plan;
        const main = (rec.checkResults ?? []).find((r: any) => r.flowId === "api-plan" && !String(r.id).includes("·"));
        if (!ran || !main || /^not run yet|^never ran/i.test(String(main.verdict ?? ""))) continue; // never ran: no verdict
        const id = String(main.id);
        const judged = storedApiPlan(id)?.plan ?? rulePlans.get(id)?.plan;
        const o: Outcome = main.inconclusive ? "inconclusive" : main.pass ? "pass" : "fail";
        if (!judged || norm(judged) !== norm(ran)) {
          if (o !== "inconclusive") otherPlanRan.add(id);
          continue;
        }
        const t = planRuns.get(`plan:${id}`) ?? { pass: 0, fail: 0, last: o, lastAt: "" };
        if (o === "pass") t.pass += 1;
        if (o === "fail") t.fail += 1;
        const at = String(rec.ts ?? "");
        if (at >= t.lastAt) {
          t.lastAt = at;
          t.last = o;
        }
        planRuns.set(`plan:${id}`, t);
      } catch {
        /* a damaged file is skipped */
      }
    }
  }
  const rows: Row[] = [];
  const stoodFor = new Set<string>();
  /** cases that ran only through a plan that does not speak for them, or not the plan that was judged */
  const partly = new Set<string>();
  /**
   * Covered once any run gave the case a pass or a fail — its LATEST result
   * may be a "couldn't tell". Reading only the latest made coverage fall when
   * a case that had passed was run again and could not tell (15 Oct: Bidding
   * went 46 → 44 after 40 of its cases ran for the first time). The outcome
   * shown is its latest pass or fail; with only a "couldn't tell" as the
   * latest, the more frequent of its earlier verdicts.
   */
  const verdictOf = (ids: string[]): Outcome | null => {
    let pass = 0;
    let fail = 0;
    let last: Outcome | null = null;
    let lastAt = "";
    for (const id of new Set(ids)) {
      const t = id.startsWith("plan:") ? planRuns.get(id) : map.get(id);
      if (!t) continue;
      pass += t.pass;
      fail += t.fail;
      if (t.last !== "inconclusive" && t.lastAt >= lastAt) {
        last = t.last;
        lastAt = t.lastAt;
      }
    }
    if (pass + fail === 0) return null;
    return last ?? (fail > pass ? "fail" : "pass");
  };
  for (const c of ct.cases) {
    const route = catalog.has(c.id) ? (routeFor(catalog.get(c.id)) as any) : null;
    // A compiled API plan's result counts only when the plan speaks for the
    // case (planSpeaksForCase): a partial plan that checks another outcome, or
    // needs a caller no run has, ran — but not as this case.
    const sound = c.layer === "api" && planSpeaksForCase(c.id, caseText(c.id), rulePlans.get(c.id));
    const own = route ? verdictOf(route.resultIds ?? []) : null;
    const decided = route ? (c.layer === "api" && sound ? verdictOf([...(route.resultIds ?? []), `plan:${c.id}`]) : own) : null;
    if (c.layer === "api" && !decided && ((!sound && verdictOf([`plan:${c.id}`])) || otherPlanRan.has(c.id))) partly.add(c.id);
    let ran = !!decided;
    let last: Outcome | null = decided;
    if (c.layer === "ui" && c.route === "ui-journey" && !ran) {
      const target = String(route?.target ?? "");
      const t = journeys.get(target);
      if (t) {
        ran = true;
        last = t.last;
      }
    }
    if (c.layer === "api" && route) {
      for (const id of route.resultIds ?? []) stoodFor.add(String(id));
      if (route.target) stoodFor.add(String(route.target));
    }
    // A library twin that every run sets aside (it needs a state no run builds,
    // sends the wrong request, needs another user) cannot run today, whatever
    // the route says: it is "no runner yet", not "can run today".
    const twin = route?.kind === "api-library" || route?.kind === "api-case" ? libById.get(String(route.target ?? "")) : undefined;
    rows.push({
      id: c.id,
      layer: c.layer,
      group: groupOfCase(c),
      title: c.title,
      priority: c.priority,
      manual: c.verdict === "manual",
      automated: (c.route === "api-plan" ? sound : c.runsNow) && !(twin && unrunnableReason(twin)),
      partly: partly.has(c.id),
      field: c.route === "api-field" && !/-001$/.test(c.id),
      step: c.route === "api-field" && /-001$/.test(c.id),
      last,
      ran,
    });
  }
  // The API case library's own cases that no catalog case stands for (e.g. PR-LIST-…).
  for (const lc of loadCases() as any[]) {
    if (catalog.has(lc.id) || stoodFor.has(lc.id)) continue;
    const decided = verdictOf([lc.id]);
    const ran = !!decided;
    rows.push({
      id: lc.id,
      layer: "api",
      group: groupOfFeature.get(lc.feature) ?? null,
      title: lc.title,
      priority: lc.priority ?? "P2",
      manual: false,
      automated: !unrunnableReason(lc),
      partly: false,
      field: false,
      step: false,
      last: decided,
      ran,
    });
  }

  const allGroups = MODULES.flatMap((m) => m.groups);
  const inModule = (m: { groups: string[] }) => rows.filter((r) => r.group && m.groups.includes(r.group));
  const modules = MODULES.map((m) => bucket(m.id, m.label, inModule(m), journeys, m.groups));
  const p2pGroups = MODULES.filter((m) => P2P_MODULES.includes(m.id)).flatMap((m) => m.groups);
  const p2pFlow = bucket("p2p-flow", "P2P flow: PO → receipt → invoice → payment", rows.filter((r) => r.group && p2pGroups.includes(r.group)), journeys, p2pGroups);
  const events = modules.find((m) => m.id === "events")!;
  const eventSubmodules = EVENT_GROUPS.map((g) => {
    const rs = rows.filter((r) => r.group === g);
    const b = bucket(g, GROUP_LABEL.get(g) ?? g, rs, journeys, [g]);
    b.missing = rs
      .filter((r) => !r.field && !r.manual && !r.ran)
      .sort((x, y) => (PRIORITY_RANK[x.priority] ?? 9) - (PRIORITY_RANK[y.priority] ?? 9) || Number(y.automated) - Number(x.automated) || x.id.localeCompare(y.id))
      .slice(0, 8)
      .map((r) => ({ id: r.id, layer: r.layer, title: r.title, priority: r.priority, automated: r.automated }));
    return b;
  });
  const platform = bucket("platform-all", "Whole platform", rows.filter((r) => r.group && allGroups.includes(r.group)), journeys, allGroups);

  const apiRuns = existsSync(join(here, "..", "..", "data", "runs")) ? readdirSync(join(here, "..", "..", "data", "runs")).filter((n) => n.endsWith(".json")).length : 0;
  const browserRuns = [...journeys.values()].reduce((n, t) => n + t.runs, 0);
  return {
    generatedAt: new Date().toISOString(),
    history: ct.historySource === "database" ? "the spine database (all clients)" : "the saved run files (all clients)",
    runsCounted: { api: apiRuns, browser: browserRuns },
    platform,
    modules,
    p2pFlow,
    events,
    eventSubmodules,
    unassigned: rows.filter((r) => !r.group || !allGroups.includes(r.group)).length,
    target: 0.8,
  };
}

/** Ten minutes is plenty: the inputs change when a run is saved, and it takes ~15 s to count. */
let cached: { at: number; report: CoverageReport } | null = null;
export async function cachedCoverageReport(fresh = false): Promise<CoverageReport> {
  if (!fresh && cached && Date.now() - cached.at < 10 * 60_000) return cached.report;
  const report = await coverageReport();
  cached = { at: Date.now(), report };
  return report;
}
