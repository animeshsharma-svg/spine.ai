/**
 * What spine.ai has achieved, counted — the numbers behind the Success page
 * (/api/metrics, public/success.js) and `npm run coverage:report`.
 *
 * Five pillars, each a handful of plain-language metrics with today's value,
 * a target and (where history allows) a 14-day trend:
 *
 *   1. Real bugs found — the verified bug sheet in docs/bugs, plus the share of
 *      reported bugs Procol accepted (a number only the team can give; stored
 *      in spine.ai's database, table metric_inputs).
 *   2. Trust — how often a result is "couldn't tell", how often a case flips
 *      between pass and fail, how often a full journey gets to the end.
 *   3. Coverage — of the written catalog: what can run today, what has ever
 *      run, and how it last came out.
 *   4. AI quality — the latest evaluations of the matcher, the router and the
 *      planner (prompts/last-*.json).
 *   5. Worth it — how long a run takes and what the AI costs per run.
 *
 * Everything is computed from data that already exists: the spine database
 * (runs, results), the catalog, eval result files, the bug workbook, matrix
 * and cross-check result files. With the database down, the history comes
 * from data/runs/*.json instead and inputs cannot be saved — nothing throws.
 *
 * Counting rules that keep the numbers honest:
 *   - "Couldn't tell" is never a pass.
 *   - A case counts as run only through its own result id or an exact /
 *     same-request runner (caseRouting `resultIds`). Running other cases for
 *     the same area does not make this one "run".
 *   - "Not run" results (skipped, blocked) are not runs.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { allCases, type CatalogCase } from "./testCatalog.js";
import { routeFor, type CaseRoute, type RouteStrength } from "./caseRouting.js";
import { spineDb } from "../db/spineDb.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
const REPO = join(ROOT, "..");
const DATA = join(ROOT, "data");
const PROMPTS = join(ROOT, "prompts");
const BUGS_DIR = join(REPO, "docs", "bugs");
const MATRIX_DIR = join(DATA, "matrix");
const RUNS_DIR = join(DATA, "runs");
const CROSSCHECK_DIR = join(REPO, "procol-ui-tests", "findings", "crosscheck");

export type Outcome = "pass" | "fail" | "inconclusive";

/** Every verdict word the runners write, folded to three. `null` = not a run. */
export function foldVerdict(v: string | null | undefined): Outcome | null {
  const s = String(v ?? "").toLowerCase();
  if (s === "pass" || s === "passed" || s === "worked" || s === "ok") return "pass";
  if (s === "fail" || s === "failed" || s === "broken" || s === "refused" || s === "defect") return "fail";
  if (s === "inconclusive" || s === "couldn't tell" || s === "partial") return "inconclusive";
  return null; // not-run, skipped, blocked…
}

// ── results, from every place a verdict is kept ─────────────────────────────

export interface ResultTally {
  runs: number;
  pass: number;
  fail: number;
  inconclusive: number;
  last: Outcome;
  lastAt: string;
  firstAt: string;
}

function add(map: Map<string, ResultTally>, id: string, o: Outcome, at: string) {
  const t = map.get(id);
  if (!t) {
    map.set(id, { runs: 1, pass: o === "pass" ? 1 : 0, fail: o === "fail" ? 1 : 0, inconclusive: o === "inconclusive" ? 1 : 0, last: o, lastAt: at, firstAt: at });
    return;
  }
  t.runs += 1;
  t[o] += 1;
  // Two results of one run under one id (a template case's field checks): a fail is the verdict.
  if (at > t.lastAt || (at === t.lastAt && (o === "fail" || t.last === "inconclusive"))) {
    t.lastAt = at;
    t.last = o;
  }
  if (at < t.firstAt) t.firstAt = at;
}

/**
 * The key a result is counted under. A compiled API plan (apiPlanRunner.ts,
 * feature "api-plan") records its verdict under the CATALOG id, which for a
 * written case is also the id of its weak library copy — so plan results are
 * kept apart as `plan:<id>`. Its per-step rows (`<id>·act1`) are not cases.
 */
function resultKey(caseId: string, feature: string | null | undefined): string {
  if (feature === "api-plan") return caseId.includes("·") ? `plan-step:${caseId}` : `plan:${caseId}`;
  return caseId;
}

/**
 * The template field check (model/templateCheck.ts) records each field check of
 * catalog case API-XTPL-005 as API-XTPL-005.01, .02… — the case listens for its
 * own id, so until 15 Oct no template check ever counted for its case. A field
 * check's result is ALSO counted under its case: ran once any of them ran, and
 * failed when any of them failed.
 */
function caseOfFieldCheck(caseId: string): string | null {
  return /^(API-XTPL-\d+)\.\d+$/.exec(caseId)?.[1] ?? null;
}

/** Results by result id, from the spine database (or the run files when it is down). */
async function resultsFromHistory(companyId?: number, asOf?: string): Promise<{ map: Map<string, ResultTally>; source: "database" | "files" }> {
  const map = new Map<string, ResultTally>();
  const db = await spineDb().catch(() => null);
  if (db) {
    try {
      const params: unknown[] = [asOf ?? "9999-12-31"];
      if (companyId) params.push(companyId);
      const r = await db.query(
        `SELECT case_id, feature, verdict, created_at FROM results
          WHERE verdict NOT IN ('not-run','skipped') AND created_at <= $1::timestamptz ${companyId ? "AND company_id = $2" : ""}`,
        params,
      );
      for (const row of r.rows) {
        const o = foldVerdict(row.verdict);
        if (!o) continue;
        const at = new Date(row.created_at).toISOString();
        add(map, resultKey(row.case_id, row.feature), o, at);
        const parent = caseOfFieldCheck(row.case_id);
        if (parent) add(map, parent, o, at);
      }
      return { map, source: "database" };
    } catch {
      /* fall through to the files */
    }
  }
  // The run files are the source of truth the database copies; slower, same answer.
  const { resultRows } = await import("../db/runHistory.js");
  if (existsSync(RUNS_DIR)) {
    for (const f of readdirSync(RUNS_DIR).filter((n) => n.endsWith(".json"))) {
      try {
        const rec = JSON.parse(readFileSync(join(RUNS_DIR, f), "utf8"));
        if (companyId && rec.companyId !== companyId) continue;
        if (asOf && rec.ts > asOf) continue;
        for (const row of resultRows(rec)) {
          const o = foldVerdict(row.verdict);
          if (!o) continue;
          add(map, resultKey(row.case_id, row.feature), o, rec.ts);
          const parent = caseOfFieldCheck(row.case_id);
          if (parent) add(map, parent, o, rec.ts);
        }
      } catch {
        /* a damaged file is skipped */
      }
    }
  }
  return { map, source: "files" };
}

/** Bidding-matrix runs (data/matrix/*.json): one result per combination, as `matrix:M1`. */
function resultsFromMatrix(map: Map<string, ResultTally>, companyId?: number, asOf?: string) {
  if (!existsSync(MATRIX_DIR)) return;
  for (const f of readdirSync(MATRIX_DIR).filter((n) => n.endsWith(".json"))) {
    try {
      const run = JSON.parse(readFileSync(join(MATRIX_DIR, f), "utf8"));
      if (companyId && run.companyId !== companyId) continue;
      if (asOf && String(run.startedAt ?? "") > asOf) continue;
      for (const c of run.combos ?? []) {
        const o = foldVerdict(c.verdict);
        if (o && c.id) add(map, `matrix:${c.id}`, o, run.startedAt ?? "");
      }
    } catch {
      /* skip */
    }
  }
}

/** UI↔API cross-check runs: one result per UI-XCHK case. */
function resultsFromCrosscheck(map: Map<string, ResultTally>, companyId?: number, asOf?: string) {
  if (!existsSync(CROSSCHECK_DIR)) return;
  for (const d of readdirSync(CROSSCHECK_DIR)) {
    const file = join(CROSSCHECK_DIR, d, "result.json");
    if (!existsSync(file)) continue;
    try {
      const run = JSON.parse(readFileSync(file, "utf8"));
      if (companyId && run.companyId !== companyId) continue;
      if (asOf && String(run.startedAt ?? "") > asOf) continue;
      for (const c of run.cases ?? []) {
        const o = foldVerdict(c.verdict);
        if (o && c.case) add(map, c.case, o, run.startedAt ?? "");
      }
    } catch {
      /* skip */
    }
  }
}

/** Every result, optionally only those recorded up to `asOf` (ISO time) — for before/after comparisons. */
export async function allResults(companyId?: number, asOf?: string) {
  const { map, source } = await resultsFromHistory(companyId, asOf);
  resultsFromMatrix(map, companyId, asOf);
  resultsFromCrosscheck(map, companyId, asOf);
  return { map, source };
}

// ── coverage of the written catalog ─────────────────────────────────────────

interface JourneyDef {
  id: string;
  title: string;
  order: number;
  uiGroups: string[];
  apiGroups: string[];
}

function journeyDefs(): JourneyDef[] {
  try {
    const j = JSON.parse(readFileSync(join(DATA, "journeys.json"), "utf8"));
    return (j.journeys ?? []).map((x: any) => ({ id: x.id, title: x.title, order: x.order, uiGroups: x.uiGroups ?? [], apiGroups: x.apiGroups ?? [] }));
  } catch {
    return [];
  }
}

export interface CaseCoverage {
  id: string;
  layer: "ui" | "api";
  group: string;
  section: string;
  title: string;
  priority: string;
  verdict: string;
  journey: string | null;
  route: CaseRoute["kind"];
  strength: RouteStrength;
  runsNow: boolean;
  because: string;
  everRun: boolean;
  runs: number;
  last: Outcome | null;
  lastAt: string | null;
  firstAt: string | null;
}

export interface Bucket {
  key: string;
  label: string;
  total: number;
  /** cases not marked "for a person" */
  automatable: number;
  runsNow: number;
  everRun: number;
  pass: number;
  fail: number;
  inconclusive: number;
}

const emptyBucket = (key: string, label: string): Bucket => ({ key, label, total: 0, automatable: 0, runsNow: 0, everRun: 0, pass: 0, fail: 0, inconclusive: 0 });
function addTo(b: Bucket, c: CaseCoverage) {
  b.total += 1;
  if (c.verdict !== "manual") b.automatable += 1;
  if (c.runsNow) b.runsNow += 1;
  if (c.everRun) b.everRun += 1;
  if (c.last) b[c.last] += 1;
}

/** Plain names for the catalog's group prefixes, for the per-area table. */
function areaOf(c: CatalogCase): { key: string; label: string } {
  const g = c.group;
  if (/^API-F[A-Z]+$/.test(g)) return { key: "api-field", label: "Field checks on every journey reply" };
  if (/^API-N[A-Z]+$/.test(g) && g !== "API-NFR") return { key: "api-negatives", label: "Request negatives (one field wrong at a time)" };
  if (g === "API-XVBU") return { key: "api-vbu", label: "Vendor bulk upload" };
  if (g.startsWith("API-XREV")) return { key: "api-reval", label: "Vendor revalidation" };
  if (g === "PRD-VREV") return { key: "prd-reval", label: "Vendor revalidation (manual)" };
  if (g === "API-XTPL") return { key: "api-template", label: "Template field rules" };
  if (g === "API-XMAT") return { key: "api-matrix", label: "Bidding scenarios" };
  if (/^API-X/.test(g)) return { key: "api-edge", label: "Edge cases from the backend code" };
  if (/^API-/.test(g)) return { key: "api-written", label: "Written API cases (events)" };
  if (g === "UI-XCHK") return { key: "ui-crosscheck", label: "Screen vs API cross-check" };
  if (/^UI-/.test(g)) return { key: "ui-events", label: "Written screen cases (events)" };
  if (/^PRD-KB/.test(g)) return { key: "prd-kb", label: "Product knowledge base cases" };
  if (/^PRD-/.test(g)) return { key: "prd-modules", label: "Product modules beyond events" };
  return { key: "other", label: "Other" };
}

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

/**
 * Which API-plan cases the API test compiler covers FULLY without the model
 * (rules and library cases only — deterministic, no AI spend, ~4 s for ~600
 * cases). Feature-detected: without the compiler this is an empty map. Kept for
 * ten minutes per process.
 */
let planCov: { at: number; map: Map<string, "full" | "partial" | "none"> } | null = null;
async function planCoverage(ids: string[]): Promise<Map<string, "full" | "partial" | "none">> {
  if (planCov && Date.now() - planCov.at < 10 * 60_000 && ids.every((id) => planCov!.map.has(id))) return planCov.map;
  const map = new Map<string, "full" | "partial" | "none">();
  if (!ids.length) return map;
  try {
    const mod: any = await import("../agents/apiPlanner.js");
    if (typeof mod.compileApiPlan !== "function") return map;
    const deadline = Date.now() + 30_000;
    for (const id of ids) {
      if (Date.now() > deadline) break; // bounded: the rest stay "not known"
      try {
        const r = await mod.compileApiPlan({ caseId: id }, { llm: false });
        map.set(id, r?.plan && r.coverage === "full" ? "full" : r?.coverage === "partial" ? "partial" : "none");
      } catch {
        map.set(id, "none");
      }
    }
  } catch {
    return map; // no compiler installed
  }
  planCov = { at: Date.now(), map };
  return map;
}

export interface CoverageTruth {
  generatedAt: string;
  companyId: number | null;
  historySource: "database" | "files";
  totals: Bucket & { automatedPct: number; everRunPct: number; byStrength: Record<string, number>; byRoute: Record<string, number> };
  byJourney: Bucket[];
  byArea: Bucket[];
  /** The P0/P1 "automate" cases with no runner today, most important first — what to build next. */
  buildOrder: Array<Pick<CaseCoverage, "id" | "title" | "priority" | "group" | "section" | "journey" | "route" | "strength" | "because">>;
  buildOrderTotal: number;
  cases: CaseCoverage[];
}

/**
 * Every catalog case with its real route, whether it runs today, and its
 * track record. `companyId` limits the history to one client.
 */
export async function coverageTruth(opts: { companyId?: number; withCases?: boolean; asOf?: string } = {}): Promise<CoverageTruth> {
  const { map, source } = await allResults(opts.companyId, opts.asOf);
  const journeys = journeyDefs();
  const journeyOfGroup = new Map<string, JourneyDef>();
  for (const j of journeys) for (const g of [...j.uiGroups, ...j.apiGroups]) journeyOfGroup.set(g, j);

  const routes = new Map(allCases().map((c) => [c.id, routeFor(c)]));
  const plans = await planCoverage([...routes].filter(([, r]) => r.kind === "api-plan").map(([id]) => id));

  const rows: CaseCoverage[] = [];
  for (const c of allCases()) {
    const r0 = routes.get(c.id)!;
    // A case the API test compiler covers fully, from rules and library cases
    // alone, can run today through it.
    const r =
      r0.kind === "api-plan" && plans.get(c.id) === "full"
        ? { ...r0, runsNow: true, because: `${r0.because} (it compiles to a full plan without the AI)` }
        : r0.kind === "api-plan" && plans.has(c.id)
          ? { ...r0, because: `${r0.because} (without the AI it compiles to a ${plans.get(c.id) === "partial" ? "partial" : "no"} plan)` }
          : r0;
    const ids = c.layer === "api" ? [...r.resultIds, `plan:${c.id}`] : r.resultIds;
    let runs = 0;
    let last: Outcome | null = null;
    let lastAt: string | null = null;
    let firstAt: string | null = null;
    for (const id of new Set(ids)) {
      const t = map.get(id);
      if (!t) continue;
      runs += t.runs;
      if (!lastAt || t.lastAt > lastAt) {
        lastAt = t.lastAt;
        last = t.last;
      }
      if (!firstAt || t.firstAt < firstAt) firstAt = t.firstAt;
    }
    rows.push({
      id: c.id,
      layer: c.layer,
      group: c.group,
      section: c.section,
      title: c.title,
      priority: c.priority,
      verdict: c.verdict,
      journey: journeyOfGroup.get(c.group)?.id ?? null,
      route: r.kind,
      strength: r.strength,
      runsNow: r.runsNow,
      because: r.because,
      everRun: runs > 0,
      runs,
      last,
      lastAt,
      firstAt,
    });
  }

  const totals = { ...emptyBucket("all", "Whole catalog"), automatedPct: 0, everRunPct: 0, byStrength: {} as Record<string, number>, byRoute: {} as Record<string, number> };
  const jb = new Map(journeys.map((j) => [j.id, emptyBucket(j.id, j.title)]));
  const ab = new Map<string, Bucket>();
  for (const row of rows) {
    addTo(totals, row);
    totals.byStrength[row.strength] = (totals.byStrength[row.strength] ?? 0) + 1;
    totals.byRoute[row.route] = (totals.byRoute[row.route] ?? 0) + 1;
    if (row.journey && jb.has(row.journey)) addTo(jb.get(row.journey)!, row);
    const a = areaOf(row as unknown as CatalogCase);
    if (!ab.has(a.key)) ab.set(a.key, emptyBucket(a.key, a.label));
    addTo(ab.get(a.key)!, row);
  }
  totals.automatedPct = totals.automatable ? totals.runsNow / totals.automatable : 0;
  totals.everRunPct = totals.total ? totals.everRun / totals.total : 0;

  const order = new Map(journeys.map((j) => [j.id, j.order]));
  const missing = rows
    .filter((r) => !r.runsNow && r.verdict === "automate" && (r.priority === "P0" || r.priority === "P1"))
    .sort(
      (a, b) =>
        (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
        (order.get(a.journey ?? "") ?? 99) - (order.get(b.journey ?? "") ?? 99) ||
        a.id.localeCompare(b.id),
    );

  return {
    generatedAt: new Date().toISOString(),
    companyId: opts.companyId ?? null,
    historySource: source,
    totals,
    byJourney: [...jb.values()].sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99)),
    byArea: [...ab.values()].sort((a, b) => b.total - a.total),
    buildOrder: missing.slice(0, 50).map(({ id, title, priority, group, section, journey, route, strength, because }) => ({ id, title, priority, group, section, journey, route, strength, because })),
    buildOrderTotal: missing.length,
    cases: opts.withCases === false ? [] : rows,
  };
}

// ── pillar 1: real bugs ─────────────────────────────────────────────────────

export interface BugSheet {
  file: string | null;
  verified: number;
  toConfirm: number;
  dataProblems: number;
  bySeverity: Record<string, number>;
  byArea: Record<string, number>;
  /** "Last confirmed" date per bug, for the trend */
  confirmedOn: string[];
  bugs: Array<{ id: string; area: string; title: string; severity: string; confirmed: string }>;
}

let bugCache: { mtime: number; file: string; sheet: BugSheet } | null = null;

/** The newest docs/bugs/Procol_bugs_found_*.xlsx, read once per change. */
export function readBugSheet(): BugSheet {
  const empty: BugSheet = { file: null, verified: 0, toConfirm: 0, dataProblems: 0, bySeverity: {}, byArea: {}, confirmedOn: [], bugs: [] };
  if (!existsSync(BUGS_DIR)) return empty;
  const files = readdirSync(BUGS_DIR).filter((f) => /^Procol_bugs_found_.*\.xlsx$/.test(f)).sort();
  const name = files[files.length - 1];
  if (!name) return empty;
  const file = join(BUGS_DIR, name);
  try {
    const { mtimeMs } = statSync(file);
    if (bugCache && bugCache.file === file && bugCache.mtime === mtimeMs) return bugCache.sheet;
    const wb = XLSX.read(readFileSync(file), { type: "buffer", cellDates: true });
    const rows = (sheet: string): any[] => (wb.Sheets[sheet] ? XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: "" }) : []);
    const bugs = rows("Bugs")
      .filter((r) => /^BUG-\d+/.test(String(r["Bug #"] ?? "")))
      .map((r) => ({
        id: String(r["Bug #"]),
        area: String(r["Area"] ?? ""),
        title: String(r["Bug"] ?? ""),
        severity: String(r["Severity"] ?? "").trim() || "Unrated",
        confirmed: toDay(r["Last confirmed"]),
      }));
    const sheet: BugSheet = {
      file: `docs/bugs/${name}`,
      verified: bugs.length,
      toConfirm: rows("Needs confirmation").filter((r) => /^Q-\d+/.test(String(r["#"] ?? ""))).length,
      dataProblems: rows("Data problems").filter((r) => /^D-\d+/.test(String(r["#"] ?? ""))).length,
      bySeverity: count(bugs.map((b) => b.severity)),
      byArea: count(bugs.map((b) => b.area)),
      confirmedOn: bugs.map((b) => b.confirmed).filter(Boolean),
      bugs,
    };
    bugCache = { mtime: mtimeMs, file, sheet };
    return sheet;
  } catch {
    return { ...empty, file: `docs/bugs/${name}` };
  }
}

function toDay(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  const iso = s.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function count(xs: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
}

// ── inputs and daily snapshots (spine database) ────────────────────────────

/** Keys a person may set from the Success page. Anything else is refused. */
export const INPUT_KEYS = {
  bugs_reported: "Bugs reported to Procol",
  bugs_accepted: "Of those, accepted by Procol as real bugs",
  bugs_rejected: "Of those, turned down (not a bug / works as intended)",
} as const;
export type InputKey = keyof typeof INPUT_KEYS;

export function isInputKey(k: string): k is InputKey | `target:${string}` {
  return k in INPUT_KEYS || /^target:[a-z_]+$/.test(k);
}

export async function readInputs(): Promise<{ values: Record<string, { value: number; updatedAt: string; updatedBy: string | null; note: string | null }>; stored: boolean }> {
  const db = await spineDb().catch(() => null);
  if (!db) return { values: {}, stored: false };
  try {
    const r = await db.query(`SELECT key, value, note, updated_by, updated_at FROM metric_inputs`);
    const values: Record<string, any> = {};
    for (const row of r.rows) values[row.key] = { value: Number(row.value), updatedAt: new Date(row.updated_at).toISOString(), updatedBy: row.updated_by, note: row.note };
    return { values, stored: true };
  } catch {
    return { values: {}, stored: false }; // table not migrated yet
  }
}

export async function saveInput(key: string, value: number, by?: string, note?: string): Promise<{ ok: boolean; error?: string }> {
  if (!isInputKey(key)) return { ok: false, error: `unknown input "${key}"` };
  if (!Number.isFinite(value) || value < 0 || value > 1e6) return { ok: false, error: "the value must be a number of zero or more" };
  const db = await spineDb().catch(() => null);
  if (!db) return { ok: false, error: "spine.ai's database is not running, so the number cannot be saved" };
  try {
    await db.query(
      `INSERT INTO metric_inputs (key, value, note, updated_by, updated_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [key, value, note ?? null, by ?? null],
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `could not save: ${(e as Error).message}` };
  }
}

async function writeSnapshot(values: Record<string, number | null>): Promise<void> {
  const db = await spineDb().catch(() => null);
  if (!db) return;
  try {
    for (const [k, v] of Object.entries(values)) {
      if (v === null || !Number.isFinite(v)) continue;
      await db.query(
        `INSERT INTO metric_snapshots (day, key, value) VALUES ((now() AT TIME ZONE 'Asia/Kolkata')::date, $1, $2)
         ON CONFLICT (day, key) DO UPDATE SET value = EXCLUDED.value, at = now()`,
        [k, v],
      );
    }
  } catch {
    /* not migrated yet — the trend simply starts later */
  }
}

async function readSnapshots(days: string[]): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  const db = await spineDb().catch(() => null);
  if (!db) return out;
  try {
    const r = await db.query(`SELECT day::text AS day, key, value FROM metric_snapshots WHERE day >= $1::date`, [days[0]]);
    for (const row of r.rows) {
      if (!out.has(row.key)) out.set(row.key, new Map());
      out.get(row.key)!.set(row.day, Number(row.value));
    }
  } catch {
    /* none yet */
  }
  return out;
}

// ── the 14 days ─────────────────────────────────────────────────────────────

/** The last n days, oldest first, as India dates (the team's day). */
function lastDays(n: number): string[] {
  const out: string[] = [];
  const now = Date.now() + 5.5 * 3600_000;
  for (let i = n - 1; i >= 0; i--) out.push(new Date(now - i * 86400_000).toISOString().slice(0, 10));
  return out;
}

interface DailyHistory {
  /** per day: case results pass/fail/inconclusive */
  cases: Map<string, { pass: number; fail: number; inconclusive: number }>;
  /** per day: journeys run, and how many reached the end */
  journeys: Map<string, { runs: number; ok: number }>;
  /** per day: run durations (ms) of API runs */
  durations: Map<string, number[]>;
  /** per day: checks per run */
  checks: Map<string, number[]>;
}

async function dailyHistory(days: string[], companyId?: number): Promise<DailyHistory | null> {
  const db = await spineDb().catch(() => null);
  if (!db) return null;
  const from = days[0];
  const params: unknown[] = [from];
  if (companyId) params.push(companyId);
  const co = companyId ? "AND company_id = $2" : "";
  try {
    const cases = new Map<string, { pass: number; fail: number; inconclusive: number }>();
    const r1 = await db.query(
      `SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS day, verdict, count(*)::int AS n
         FROM results WHERE kind = 'case' AND case_id NOT LIKE '%·%' AND created_at >= ($1::date - interval '1 day') ${co}
        GROUP BY 1, 2`,
      params,
    );
    for (const row of r1.rows) {
      const o = foldVerdict(row.verdict);
      if (!o) continue;
      const d = cases.get(row.day) ?? { pass: 0, fail: 0, inconclusive: 0 };
      d[o] += row.n;
      cases.set(row.day, d);
    }
    const journeys = new Map<string, { runs: number; ok: number }>();
    const durations = new Map<string, number[]>();
    const checks = new Map<string, number[]>();
    const r2 = await db.query(
      `SELECT (r.started_at AT TIME ZONE 'Asia/Kolkata')::date::text AS day, r.outcome, r.duration_ms, r.request,
              (SELECT count(*)::int FROM results x WHERE x.run_id = r.id) AS checks
         FROM runs r WHERE r.started_at >= ($1::date - interval '1 day') ${co}`,
      params,
    );
    for (const row of r2.rows) {
      if (row.outcome) {
        const j = journeys.get(row.day) ?? { runs: 0, ok: 0 };
        j.runs += 1;
        if (/^All \d+ steps/.test(row.outcome)) j.ok += 1;
        journeys.set(row.day, j);
      }
      if (/^features:|^run-all/.test(String(row.request ?? "")) && row.duration_ms) {
        durations.set(row.day, [...(durations.get(row.day) ?? []), Number(row.duration_ms)]);
        checks.set(row.day, [...(checks.get(row.day) ?? []), Number(row.checks)]);
      }
    }
    return { cases, journeys, durations, checks };
  } catch {
    return null;
  }
}

/** Overall trust numbers over all history (or the window), from the database. */
async function trustTotals(companyId?: number, sinceDays = 30) {
  const db = await spineDb().catch(() => null);
  if (!db) return null;
  const params: unknown[] = [sinceDays];
  if (companyId) params.push(companyId);
  const co = companyId ? "AND company_id = $2" : "";
  try {
    const v = await db.query(
      // A compiled plan's sub-steps (`<id>·act1`) are kept as rows of their own
      // but are not cases: counting them inflated the denominator (db:reconcile).
      `SELECT verdict, count(*)::int AS n FROM results
        WHERE kind = 'case' AND case_id NOT LIKE '%·%' AND created_at >= now() - ($1 || ' days')::interval ${co} GROUP BY 1`,
      params,
    );
    const t = { pass: 0, fail: 0, inconclusive: 0 };
    for (const row of v.rows) {
      const o = foldVerdict(row.verdict);
      if (o) t[o] += row.n;
    }
    // Flaky: a case that both passed and failed on the SAME client in the window.
    const f = await db.query(
      `SELECT count(*) FILTER (WHERE p > 0 AND x > 0)::int AS flaky, count(*)::int AS repeated FROM (
         SELECT company_id, case_id,
                count(*) FILTER (WHERE verdict IN ('pass','worked')) AS p,
                count(*) FILTER (WHERE verdict IN ('fail','broken','refused')) AS x
           FROM results
          WHERE kind IN ('case','field-check') AND case_id NOT LIKE '%·%' AND verdict IN ('pass','worked','fail','broken','refused')
            AND created_at >= now() - ($1 || ' days')::interval ${co}
          GROUP BY 1, 2 HAVING count(*) >= 2) s`,
      params,
    );
    const j = await db.query(
      `SELECT count(*)::int AS runs, count(*) FILTER (WHERE outcome ~ '^All [0-9]+ steps')::int AS ok
         FROM runs WHERE outcome IS NOT NULL AND started_at >= now() - ($1 || ' days')::interval ${co}`,
      params,
    );
    return { verdicts: t, flaky: f.rows[0].flaky as number, repeated: f.rows[0].repeated as number, journeys: j.rows[0] as { runs: number; ok: number } };
  } catch {
    return null;
  }
}

// ── pillar 4: AI quality ────────────────────────────────────────────────────

function readJson<T = any>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function aiEvals() {
  const fileDate = (f: string) => {
    try {
      return statSync(f).mtime.toISOString();
    } catch {
      return null;
    }
  };
  const matcherRules = readJson<any>(join(PROMPTS, "last-matcher-eval.json"));
  const matcherLlm = readJson<any>(join(PROMPTS, "last-matcher-eval-llm.json"));
  const routing = readJson<any>(join(PROMPTS, "last-eval.json"));
  const plannerFile = join(PROMPTS, "last-planner-eval.json");
  const planner = readJson<any[]>(plannerFile);
  const apiPlan = readJson<any>(join(PROMPTS, "last-apiplan-eval.json"))?.summary;
  const best = matcherLlm?.all ? matcherLlm : matcherRules;
  return {
    matcher: best?.all
      ? {
          mode: best.mode as string,
          at: best.generatedAt as string,
          cases: (best.all.n?.same ?? 0) + (best.all.n?.new ?? 0) + (best.all.n?.partial ?? 0),
          top1: best.all.top1 as number,
          precision: best.all.precision as number,
          recall: best.all.recall as number,
          rulesOnlyTop1: matcherRules?.all?.top1 as number | undefined,
          usd: best.usage?.totalUsd ?? 0,
          tokens: Object.values(best.usage?.byModel ?? {}).reduce((n: number, m: any) => n + (m.promptTokens ?? 0) + (m.completionTokens ?? 0), 0),
        }
      : null,
    routing: routing?.summary
      ? { at: routing.generatedAt as string, cases: routing.total as number, accuracy: routing.summary.overallExactAccuracy as number }
      : null,
    apiPlanner: apiPlan?.exact?.n
      ? { at: apiPlan.at as string, cases: apiPlan.exact.n as number, ok: apiPlan.exact.ok as number, accuracy: apiPlan.exact.ok / apiPlan.exact.n, mode: apiPlan.mode as string }
      : null,
    planner: Array.isArray(planner) && planner.length
      ? { at: fileDate(plannerFile), cases: planner.length, ok: planner.filter((p) => p?.ok).length, accuracy: planner.filter((p) => p?.ok).length / planner.length }
      : null,
  };
}

// ── the page ────────────────────────────────────────────────────────────────

export interface Metric {
  key: string;
  /** what it is, in plain words */
  label: string;
  /** today's value: a number (rate as 0–1 when `unit` is "%") */
  value: number | null;
  unit: "count" | "%" | "minutes" | "usd";
  target: number | null;
  /** "higher" — more is better; "lower" — less is better */
  better: "higher" | "lower";
  /** met | close | missed | unknown */
  status: "met" | "close" | "missed" | "unknown";
  /** one or two sentences a person can read without the glossary */
  says: string;
  /** daily values, oldest first; null where there was nothing that day */
  trend: Array<{ day: string; value: number | null }>;
  /** where the number comes from, for the Details section */
  source: string;
}

export interface Pillar {
  key: "bugs" | "trust" | "coverage" | "ai" | "worth";
  title: string;
  question: string;
  metrics: Metric[];
}

/** Targets the team can override (metric_inputs key `target:<metric>`). */
export const DEFAULT_TARGETS: Record<string, number> = {
  bugs_verified: 30,
  bug_acceptance: 0.8,
  couldnt_tell: 0.1,
  flaky: 0.05,
  journey_success: 0.9,
  runnable_now: 0.6,
  ever_run: 0.5,
  last_pass: 0.85,
  matcher_top1: 0.95,
  routing_accuracy: 0.95,
  planner_ok: 0.9,
  api_planner_exact: 0.85,
  run_minutes: 20,
  ai_usd_per_run: 0.5,
};

function status(value: number | null, target: number | null, better: "higher" | "lower"): Metric["status"] {
  if (value === null || target === null) return "unknown";
  if (better === "higher") return value >= target ? "met" : value >= target * 0.85 ? "close" : "missed";
  return value <= target ? "met" : value <= target * 1.25 ? "close" : "missed";
}

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 1000) / 10}%`);
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export interface SuccessPayload {
  generatedAt: string;
  companyId: number | null;
  days: string[];
  database: boolean;
  pillars: Pillar[];
  inputs: { keys: typeof INPUT_KEYS; values: Record<string, { value: number; updatedAt: string; updatedBy: string | null }>; stored: boolean };
  coverage: Omit<CoverageTruth, "cases">;
  bugs: BugSheet;
}

/** Everything the Success page shows. */
export async function successMetrics(opts: { companyId?: number } = {}): Promise<SuccessPayload> {
  const days = lastDays(14);
  const [cov, inputs, hist, trust, evals] = await Promise.all([
    coverageTruth({ companyId: opts.companyId, withCases: true }),
    readInputs(),
    dailyHistory(days, opts.companyId),
    trustTotals(opts.companyId),
    Promise.resolve(aiEvals()),
  ]);
  const bugs = readBugSheet();
  const target = (k: string) => inputs.values[`target:${k}`]?.value ?? DEFAULT_TARGETS[k] ?? null;

  // ── coverage, today and rebuilt over the 14 days from first-run dates
  const t = cov.totals;
  const runnableRate = ratio(t.runsNow, t.automatable);
  const everRunRate = ratio(t.everRun, t.total);
  const lastPassRate = ratio(t.pass, t.pass + t.fail + t.inconclusive);
  const firstRuns = cov.cases.filter((c) => c.firstAt).map((c) => toIstDay(c.firstAt!));
  const everRunTrend = days.map((d) => ({ day: d, value: ratio(firstRuns.filter((x) => x <= d).length, t.total) }));

  const snaps = await readSnapshots(days);
  const snapTrend = (key: string, today: number | null) =>
    days.map((d, i) => ({ day: d, value: i === days.length - 1 ? today : (snaps.get(key)?.get(d) ?? null) }));

  // ── trust
  const v = trust?.verdicts;
  const judged = v ? v.pass + v.fail + v.inconclusive : 0;
  const couldntTell = v ? ratio(v.inconclusive, judged) : null;
  const flaky = trust ? ratio(trust.flaky, trust.repeated) : null;
  const journeyOk = trust ? ratio(trust.journeys.ok, trust.journeys.runs) : null;
  const dayRate = (d: string) => {
    const x = hist?.cases.get(d);
    return x ? ratio(x.inconclusive, x.pass + x.fail + x.inconclusive) : null;
  };
  const dayJourney = (d: string) => {
    const x = hist?.journeys.get(d);
    return x ? ratio(x.ok, x.runs) : null;
  };

  // ── bugs
  const reported = inputs.values.bugs_reported?.value ?? null;
  const accepted = inputs.values.bugs_accepted?.value ?? null;
  const rejected = inputs.values.bugs_rejected?.value ?? null;
  const decided = (accepted ?? 0) + (rejected ?? 0);
  const acceptance = accepted !== null && decided > 0 ? accepted / decided : null;
  const bugTrend = days.map((d) => ({ day: d, value: bugs.confirmedOn.filter((x) => x <= d).length || null }));

  // ── worth it
  const allDur = [...(hist?.durations.values() ?? [])].flat();
  const medMin = median(allDur) !== null ? median(allDur)! / 60000 : null;
  const allChecks = [...(hist?.checks.values() ?? [])].flat();

  const m = (x: Omit<Metric, "status">): Metric => ({ ...x, status: status(x.value, x.target, x.better) });

  const pillars: Pillar[] = [
    {
      key: "bugs",
      title: "Real bugs found",
      question: "Is spine.ai finding problems in Procol that matter?",
      metrics: [
        m({
          key: "bugs_verified",
          label: "Verified bugs",
          value: bugs.verified,
          unit: "count",
          target: target("bugs_verified"),
          better: "higher",
          says: `${bugs.verified} bugs confirmed on fresh test records${bugs.toConfirm ? `, ${bugs.toConfirm} more waiting for the product team to say whether they are intended` : ""}${bugs.dataProblems ? `, and ${bugs.dataProblems} problems in the clients' own data` : ""}.`,
          trend: bugTrend,
          source: bugs.file ? `${bugs.file} (Bugs sheet; trend by "Last confirmed")` : "no bug workbook in docs/bugs",
        }),
        m({
          key: "bug_acceptance",
          label: "Bugs Procol accepted",
          value: acceptance,
          unit: "%",
          target: target("bug_acceptance"),
          better: "higher",
          says:
            acceptance === null
              ? "Not filled in yet. Enter how many reported bugs Procol accepted and how many it turned down — only the team knows this."
              : `${accepted} of ${decided} decided bugs were accepted as real${reported !== null ? ` (${reported} reported in total)` : ""}.`,
          trend: snapTrend("bug_acceptance", acceptance),
          source: "entered by the team on this page (spine database, metric_inputs)",
        }),
      ],
    },
    {
      key: "trust",
      title: "Trust",
      question: "Can a result be believed without checking it by hand?",
      metrics: [
        m({
          key: "couldnt_tell",
          label: "Results that couldn't tell",
          value: couldntTell,
          unit: "%",
          target: target("couldnt_tell"),
          better: "lower",
          says: v
            ? `${pct(couldntTell)} of the last 30 days' ${judged} case results could not say pass or fail (never counted as a pass).`
            : "No run history available.",
          trend: days.map((d) => ({ day: d, value: dayRate(d) })),
          source: "results of single cases, last 30 days (spine database)",
        }),
        m({
          key: "flaky",
          label: "Cases that flip between pass and fail",
          value: flaky,
          unit: "%",
          target: target("flaky"),
          better: "lower",
          says: trust
            ? `${trust.flaky} of ${trust.repeated} cases run more than once on the same client both passed and failed in the last 30 days.`
            : "No run history available.",
          trend: snapTrend("flaky", flaky),
          source: "cases and field checks with two or more results on one client, last 30 days",
        }),
        m({
          key: "journey_success",
          label: "Journeys that reached the end",
          value: journeyOk,
          unit: "%",
          target: target("journey_success"),
          better: "higher",
          says: trust
            ? `${trust.journeys.ok} of ${trust.journeys.runs} full event journeys in the last 30 days ran every step they attempted.`
            : "No run history available.",
          trend: days.map((d) => ({ day: d, value: dayJourney(d) })),
          source: "runs with a journey, by their one-line outcome",
        }),
      ],
    },
    {
      key: "coverage",
      title: "Coverage",
      question: "How much of the written catalog is really automated?",
      metrics: [
        m({
          key: "runnable_now",
          label: "Cases that can run today",
          value: runnableRate,
          unit: "%",
          target: target("runnable_now"),
          better: "higher",
          says: `${t.runsNow} of the ${t.automatable} cases meant for automation have a runner that runs that case itself today. Runs of other cases in the same area are not counted.`,
          trend: snapTrend("runnable_now", runnableRate),
          source: "catalog routing (src/checks/caseRouting.ts)",
        }),
        m({
          key: "ever_run",
          label: "Cases that have ever run",
          value: everRunRate,
          unit: "%",
          target: target("ever_run"),
          better: "higher",
          says: `${t.everRun} of all ${t.total} written cases have at least one real result.`,
          trend: everRunTrend,
          source: "results by case (spine database, matrix and cross-check files)",
        }),
        m({
          key: "last_pass",
          label: "Cases passing on their last run",
          value: lastPassRate,
          unit: "%",
          target: target("last_pass"),
          better: "higher",
          says: `Of the cases that have run: ${t.pass} passed last time, ${t.fail} failed and ${t.inconclusive} couldn't tell.`,
          trend: snapTrend("last_pass", lastPassRate),
          source: "latest result per case",
        }),
      ],
    },
    {
      key: "ai",
      title: "AI quality",
      question: "Do the AI parts pick the right thing?",
      metrics: [
        m({
          key: "matcher_top1",
          label: "Finding the matching test case",
          value: evals.matcher?.top1 ?? null,
          unit: "%",
          target: target("matcher_top1"),
          better: "higher",
          says: evals.matcher
            ? `Given a description, the right existing case came first ${pct(evals.matcher.top1)} of the time over ${evals.matcher.cases} labelled examples (${evals.matcher.mode === "rules" ? "rules only" : "rules plus AI"}; rules alone: ${pct(evals.matcher.rulesOnlyTop1 ?? null)}).`
            : "No matcher evaluation on file.",
          trend: snapTrend("matcher_top1", evals.matcher?.top1 ?? null),
          source: "prompts/last-matcher-eval*.json",
        }),
        m({
          key: "routing_accuracy",
          label: "Choosing the right flow for a request",
          value: evals.routing?.accuracy ?? null,
          unit: "%",
          target: target("routing_accuracy"),
          better: "higher",
          says: evals.routing ? `${pct(evals.routing.accuracy)} of ${evals.routing.cases} requests were sent to exactly the right flow and settings.` : "No routing evaluation on file.",
          trend: snapTrend("routing_accuracy", evals.routing?.accuracy ?? null),
          source: "prompts/last-eval.json",
        }),
        m({
          key: "planner_ok",
          label: "Turning a written case into correct steps",
          value: evals.planner?.accuracy ?? null,
          unit: "%",
          target: target("planner_ok"),
          better: "higher",
          says: evals.planner ? `${evals.planner.ok} of ${evals.planner.cases} written cases became a plan with every required step and nothing forbidden.` : "No planner evaluation on file.",
          trend: snapTrend("planner_ok", evals.planner?.accuracy ?? null),
          source: "prompts/last-planner-eval.json",
        }),
        m({
          key: "api_planner_exact",
          label: "Turning a written case into the right API requests",
          value: evals.apiPlanner?.accuracy ?? null,
          unit: "%",
          target: target("api_planner_exact"),
          better: "higher",
          says: evals.apiPlanner
            ? `${evals.apiPlanner.ok} of ${evals.apiPlanner.cases} labelled cases compiled to exactly the expected setup, request and outcome.`
            : "No API test compiler evaluation on file.",
          trend: snapTrend("api_planner_exact", evals.apiPlanner?.accuracy ?? null),
          source: "prompts/last-apiplan-eval.json (summary.exact)",
        }),
      ],
    },
    {
      key: "worth",
      title: "Worth it",
      question: "Is a run fast and cheap enough to do every day?",
      metrics: [
        m({
          key: "run_minutes",
          label: "Typical run time",
          value: medMin,
          unit: "minutes",
          target: target("run_minutes"),
          better: "lower",
          says:
            medMin === null
              ? "No API runs in the last two weeks."
              : `A typical API run took ${medMin < 1 ? "under a minute" : `${Math.round(medMin)} minute${Math.round(medMin) === 1 ? "" : "s"}`} and produced ${median(allChecks) ?? 0} results.`,
          trend: days.map((d) => {
            const x = median(hist?.durations.get(d) ?? []);
            return { day: d, value: x === null ? null : x / 60000 };
          }),
          source: "runs.duration_ms of API runs (median)",
        }),
        m({
          key: "ai_usd_per_run",
          label: "AI cost per run",
          value: 0,
          unit: "usd",
          target: target("ai_usd_per_run"),
          better: "lower",
          says:
            "API runs use no AI: requests, checks and verdicts are all rule-based, so they cost nothing in AI. " +
            "AI cost of assistant and compiled browser runs is not recorded per run yet" +
            (evals.matcher?.tokens ? ` (the last matcher evaluation used ${evals.matcher.tokens.toLocaleString("en-IN")} AI tokens).` : "."),
          trend: days.map((d) => ({ day: d, value: hist?.durations.get(d)?.length ? 0 : null })),
          source: "API runs are deterministic; per-run AI usage is only tallied in memory (src/ai/llm.ts usageReport)",
        }),
      ],
    },
  ];

  // Today's values for the numbers history cannot rebuild — for the whole
  // platform only, so a one-client view never overwrites the day's figure.
  if (!opts.companyId) await writeSnapshot({
    runnable_now: runnableRate,
    ever_run: everRunRate,
    last_pass: lastPassRate,
    flaky,
    bug_acceptance: acceptance,
    matcher_top1: evals.matcher?.top1 ?? null,
    routing_accuracy: evals.routing?.accuracy ?? null,
    planner_ok: evals.planner?.accuracy ?? null,
    api_planner_exact: evals.apiPlanner?.accuracy ?? null,
    runnable_count: t.runsNow,
    ever_run_count: t.everRun,
  });

  const { cases: _drop, ...covSummary } = cov;
  return {
    generatedAt: new Date().toISOString(),
    companyId: opts.companyId ?? null,
    days,
    database: inputs.stored || cov.historySource === "database",
    pillars,
    inputs: { keys: INPUT_KEYS, values: inputs.values, stored: inputs.stored },
    coverage: covSummary,
    bugs,
  };
}

function toIstDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}
