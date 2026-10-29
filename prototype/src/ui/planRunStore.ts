import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CLIENT } from "../../config/settings.js";

/**
 * TYPED BROWSER RUNS, KEPT AS SESSIONS.
 *
 * A test case typed and run in the browser (/api/plan-run: a compiled plan,
 * or the explorer working it out on screen) left its steps only in the UI
 * suite's working folder (procol-ui-tests/.plans/<run>-result.json). Sessions
 * lists API runs, browser journeys and PO runs, so these never showed there:
 * a passing "publish an RFQ, bid, award" run on 14 Oct could not be found
 * again once its tab moved on.
 *
 * Now each one is written here when it ends: what was asked, for which
 * client, when, how it ended and every step. Runs from before this file
 * existed are read from their result files, so they appear too; what those
 * did not record (the words typed, the client) is filled in as well as it can
 * be and marked `recovered`.
 */

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, "..", "..", "data", "plan-runs");
const PLANS = join(here, "..", "..", "..", "procol-ui-tests", ".plans");
const EVIDENCE = join(here, "..", "..", "..", "procol-ui-tests", "evidence");
const SAFE_ID = /^plan-[a-z0-9]+$/i;

export interface PlanRunStep {
  step: string;
  status: string;
  detail?: string;
  args?: Record<string, unknown>;
  shot?: string;
  replayed?: boolean;
  /** done by the tester in the browser (take control), not tested by the run */
  byHand?: boolean;
  /** no step for it and not done (ask_tester skipped or unanswered): not tested */
  untested?: boolean;
  ms?: number;
}

export interface PlanRunRecord {
  runId: string;
  /** what was typed */
  ask: string;
  companyId: number | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  exitCode: number | null;
  /** worked out on screen by the explorer, not a compiled plan */
  explored: boolean;
  title: string;
  passed: boolean;
  steps: PlanRunStep[];
  /** why it stopped (explorer), when it did not pass */
  reason?: string;
  /** the words on screen that showed the goal was reached (explorer) */
  proof?: string;
  /** the explorer saved its route for next time */
  routeSaved?: boolean;
  /**
   * Steps the tester did in the browser after taking control: the run did not
   * test them, so a run with any is "Partly tested", never a pass — also when
   * it is opened again from Sessions (15 Oct).
   */
  byHand?: number;
  /** Parts with no step that were skipped or left unanswered (ask_tester, 21 Oct): also "Partly tested". */
  untested?: number;
  /** rebuilt from the result file of a run from before runs were kept */
  recovered?: boolean;
}

const readJson = (f: string): any => {
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return null;
  }
};

/** A finished run's record, from what the server knew and the result the run wrote. */
export function buildPlanRun(o: {
  runId: string;
  ask: string;
  companyId: number | null;
  startedAt: number;
  exitCode: number | null;
  explored: boolean;
  result: any;
}): PlanRunRecord {
  const r = o.result ?? {};
  const ended = Date.now();
  return {
    runId: o.runId,
    ask: o.ask,
    companyId: o.companyId,
    startedAt: new Date(o.startedAt).toISOString(),
    endedAt: new Date(ended).toISOString(),
    durationMs: ended - o.startedAt,
    exitCode: o.exitCode,
    explored: o.explored || r.explored === true,
    title: String(r.title ?? o.ask).slice(0, 300),
    passed: r.passed === true && (o.exitCode === 0 || o.exitCode === null),
    steps: stepsOf(r),
    reason: r.reason ? String(r.reason) : undefined,
    proof: r.proof ? String(r.proof) : undefined,
    routeSaved: !!r.route?.savedTo,
    byHand: byHandOf(r),
    untested: untestedOf(r),
  };
}

/** How many parts had no step and were not done (runPlan ask_tester): the result's count, else its marked steps. */
const untestedOf = (r: any): number =>
  Math.max((Array.isArray(r?.steps) ? r.steps : []).filter((s: any) => s?.untested).length, typeof r?.untested === "number" ? r.untested : 0);

/** How many steps the tester did by hand: the result's count, else its marked steps (the explorer says only true). */
const byHandOf = (r: any): number => {
  const marked = (Array.isArray(r?.steps) ? r.steps : []).filter((s: any) => s?.byHand).length;
  return Math.max(marked, typeof r?.byHand === "number" ? r.byHand : r?.byHand ? 1 : 0);
};

const stepsOf = (r: any): PlanRunStep[] =>
  (Array.isArray(r?.steps) ? r.steps : []).map((s: any) => ({
    step: String(s.step ?? ""),
    status: String(s.status ?? ""),
    ...(s.detail ? { detail: String(s.detail).slice(0, 600) } : {}),
    ...(s.args && Object.keys(s.args).length ? { args: s.args } : {}),
    ...(s.shot ? { shot: String(s.shot) } : {}),
    ...(s.replayed ? { replayed: true } : {}),
    ...(s.byHand ? { byHand: true } : {}),
    ...(s.untested ? { untested: true } : {}),
    ...(Number.isFinite(s.ms) ? { ms: s.ms } : {}),
  }));

export function savePlanRun(rec: PlanRunRecord): void {
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, `${rec.runId}.json`), JSON.stringify(rec, null, 2));
  } catch {
    // A record that cannot be written must never change how the run ended.
  }
}

/** A run from before records were kept, rebuilt from the files the UI suite left. */
function recover(runId: string): PlanRunRecord | null {
  const resultFile = join(PLANS, `${runId}-result.json`);
  if (!existsSync(resultFile)) return null;
  const result = readJson(resultFile);
  if (!result) return null;
  const goal = readJson(join(PLANS, `${runId}-explore.json`));
  const planFile = join(PLANS, `${runId}.json`);
  const plan = readJson(planFile);
  const explored = !!goal || result.explored === true;
  const ended = statSync(resultFile).mtimeMs;
  const began = existsSync(planFile) ? statSync(planFile).mtimeMs : goal ? statSync(join(PLANS, `${runId}-explore.json`)).mtimeMs : ended;
  return {
    runId,
    // The words typed were not kept then; the explorer's goal is them, a plan's title is the next best.
    ask: String(goal?.goal ?? result.goal ?? plan?.title ?? result.title ?? "Typed test case").slice(0, 600),
    // Nor was the client: these runs were made from this dashboard, whose default client it was.
    companyId: DEFAULT_CLIENT.companyId,
    startedAt: new Date(began).toISOString(),
    endedAt: new Date(ended).toISOString(),
    durationMs: Math.max(0, ended - began),
    exitCode: result.passed === true ? 0 : 1,
    explored,
    title: String(result.title ?? plan?.title ?? goal?.goal ?? "Typed test case").slice(0, 300),
    passed: result.passed === true,
    steps: stepsOf(result),
    reason: result.reason ? String(result.reason) : undefined,
    proof: result.proof ? String(result.proof) : undefined,
    routeSaved: !!result.route?.savedTo,
    byHand: byHandOf(result),
    untested: untestedOf(result),
    recovered: true,
  };
}

export function readPlanRun(runId: string): PlanRunRecord | null {
  if (!SAFE_ID.test(runId)) return null;
  const kept = readJson(join(DIR, `${runId}.json`));
  return kept ?? recover(runId);
}

/** The newest typed browser runs, kept and recovered, newest first. */
export function listPlanRuns(limit = 20): PlanRunRecord[] {
  const ids = new Set<string>();
  if (existsSync(DIR)) for (const f of readdirSync(DIR)) if (f.endsWith(".json")) ids.add(f.slice(0, -5));
  if (existsSync(PLANS)) for (const f of readdirSync(PLANS)) {
    const m = f.match(/^(plan-[a-z0-9]+)-result\.json$/i);
    if (m) ids.add(m[1]);
  }
  return [...ids]
    .map((id) => readPlanRun(id))
    .filter((r): r is PlanRunRecord => !!r)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);
}

/** Gone for good: the record and the files a recovered copy would be rebuilt from. */
export function deletePlanRun(runId: string): boolean {
  if (!SAFE_ID.test(runId)) return false;
  let removed = false;
  const kept = join(DIR, `${runId}.json`);
  if (existsSync(kept)) {
    rmSync(kept, { force: true });
    removed = true;
  }
  if (existsSync(PLANS)) {
    for (const f of readdirSync(PLANS)) {
      if (f === `${runId}.json` || f.startsWith(`${runId}-`)) {
        rmSync(join(PLANS, f), { force: true });
        removed = true;
      }
    }
  }
  // Its step records, pictures and trace too (evidence/<run> and evidence/<run>-gapN) — they
  // outlived the run before (27 Oct: 21 folders of deleted runs were still on disk).
  if (removed && existsSync(EVIDENCE)) {
    for (const f of readdirSync(EVIDENCE)) {
      if (f === runId || new RegExp(`^${runId}-gap\\d+$`).test(f)) rmSync(join(EVIDENCE, f), { recursive: true, force: true });
    }
  }
  return removed;
}
