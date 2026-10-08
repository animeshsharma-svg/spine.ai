/**
 * RUN STORE — the platform's own small memory.
 *
 * Every QA run is saved to disk (data/runs/*.json): the request, the client,
 * the AI provider, the full agent trace, the flow + validation results, and the
 * final report. This is the platform's "own database" — separate from Procol's
 * — so past runs can be listed and re-opened without re-running anything.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentEvent, Report, CheckResult } from "./ai/types.js";
import type { TestCaseRecord } from "./checks/caseLibrary.js";
import type { JourneyRecord } from "./checks/journeyModel.js";
import { recordRun, removeRun } from "./db/runHistory.js";
import { relevantStepAssertions } from "./checks/apiAssertions.js";

const here = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = join(here, "..", "data", "runs");

export interface RunRecord {
  id: string;
  ts: string;
  request: string;
  companyId: number;
  companyName: string | null;
  provider: string;
  durationMs: number;
  report: Report | undefined;
  events: AgentEvent[];
  flowResults: any[];
  validationResults: any[];
  checkResults?: CheckResult[];
  /**
   * The calls that BUILT the thing this run tested, before any case ran.
   *
   * A reader's first question about an events run is "what did it make?" — the
   * report opens the section with these, so the cases read as things done to a
   * specific event rather than as a list of verdicts about nothing in
   * particular.
   */
  setupSteps?: Array<{
    n: number;
    did: string;
    method: string;
    path: string;
    status: number;
    ms: number;
    ok: boolean;
  }>;
  /** what the setup produced, for the report's heading */
  setupSummary?: { title: string; status: string; eventGroupUuid: string; tradeId?: string; stageCount: number };
  /**
   * The journey this run walked before any case ran: sign in, build the
   * event, respond as the vendor, wait for the window, evaluate, award — one
   * record per step, narrated. `setupSteps` and `setupSummary` above are
   * derived from it for readers that predate the journey; this is the source.
   */
  journey?: JourneyRecord;
  /**
   * Cases that were pasted into the dashboard for this run, in the library's
   * shape. The test report reads its rows from here instead of the library,
   * because these cases exist only in this run.
   */
  pastedCases?: TestCaseRecord[];
  /**
   * Who or what started the run, when the caller knows: manual | assistant |
   * ci | nightly | backend-watch | hubspot | agent. Optional — without it the
   * database infers it from `request` and says so (trigger_basis 'inferred').
   * SPINE_TRIGGER in the environment does the same for a whole process.
   */
  trigger?: "manual" | "assistant" | "ci" | "nightly" | "backend-watch" | "hubspot" | "agent";
  /** the person or service behind `trigger`, in words ("nightly", an email) */
  triggeredBy?: string;
}

export interface RunSummary {
  id: string;
  ts: string;
  request: string;
  companyName: string | null;
  headline: string;
  passed: number;
  failed: number;
  /** Checks that proved nothing either way — never counted as passes. */
  inconclusive: number;
  /** How many checks the run ran at all, report or no report. */
  checks: number;
  findings: number;
  mismatches: number;
  provider: string;
  /**
   * The journey in one line, for the Recent-runs card: how many steps worked
   * of how many, and where it stopped if it did. A feature run's verdict is
   * this sentence far more than its check counts.
   */
  journey?: { outcome: string; worked: number; steps: number; stoppedAt?: number; fieldChecks?: { total: number; passed: number; failed: number } };
}

function ensureDir() {
  if (!existsSync(RUNS_DIR)) mkdirSync(RUNS_DIR, { recursive: true });
}

/** A sortable, filesystem-safe id: 2026-09-02T12-30-05-123Z */
export function newRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Database copies still in flight (see whenRunsSaved). */
const pendingCopies = new Set<Promise<void>>();

export function saveRun(rec: RunRecord): void {
  ensureDir();
  writeFileSync(join(RUNS_DIR, `${rec.id}.json`), JSON.stringify(rec, null, 0));
  // A copy in spine.ai's database, for track records across runs. Best-effort
  // and in the background: the file above is what the run depends on.
  const p: Promise<void> = recordRun(rec).finally(() => pendingCopies.delete(p));
  pendingCopies.add(p);
}

/**
 * Wait (bounded) for the background database copies of saved runs to finish.
 *
 * A script that calls process.exit() right after saveRun() cuts its copy off:
 * the run is on disk but not in the database, so /api/metrics and the
 * history do not count it (db:reconcile found 9 such runs). Call this before
 * exiting. Resolves true when every copy finished, false when `timeoutMs`
 * passed first (the copy is then left to `npm run db:backfill`).
 */
export async function whenRunsSaved(timeoutMs = 15_000): Promise<boolean> {
  if (!pendingCopies.size) return true;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
    timer.unref?.();
  });
  const done = Promise.allSettled([...pendingCopies]).then(() => true);
  try {
    return await Promise.race([done, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function getRun(id: string): RunRecord | null {
  const safe = id.replace(/[^0-9a-zA-Z_-]/g, "");
  const file = join(RUNS_DIR, `${safe}.json`);
  if (!existsSync(file)) return null;
  const run = JSON.parse(readFileSync(file, "utf8")) as RunRecord;
  // Runs saved before the field-check relevance rule are held to it on the way out.
  if (run.journey?.steps) run.journey = { ...run.journey, steps: run.journey.steps.map(relevantStepAssertions) };
  return run;
}

/**
 * Throw a run away.
 *
 * A run is a record of something that really happened, so nothing deletes one
 * on its own — but a run made while testing the platform itself, or one that
 * wrote a purchase order nobody wanted, is noise in the history and in every
 * report built from it. Returns false when there was nothing there, so the
 * caller can say "already gone" rather than claiming a deletion it did not do.
 */
export function deleteRun(id: string): boolean {
  const safe = id.replace(/[^0-9a-zA-Z_-]/g, "");
  const file = join(RUNS_DIR, `${safe}.json`);
  if (!existsSync(file)) return false;
  rmSync(file, { force: true });
  void removeRun(safe);
  return true;
}

/** Newest first. */
export function listRuns(limit = 20): RunSummary[] {
  ensureDir();
  const files = readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit);
  const out: RunSummary[] = [];
  for (const f of files) {
    try {
      const r = JSON.parse(readFileSync(join(RUNS_DIR, f), "utf8")) as RunRecord;
      /**
       * Counted from the checks when there is no agent report.
       *
       * Only the agent pipeline writes `report`; a feature run keeps its
       * results in `checkResults`. Reading the report alone meant every
       * feature run in the history showed "0✓ 0✗ · clean" — including runs
       * that had found real failures.
       */
      const checks = r.checkResults ?? [];
      const checkPassed = checks.filter((c: any) => c.pass).length;
      const checkInconclusive = checks.filter((c: any) => !c.pass && c.inconclusive).length;
      const checkFailed = checks.length - checkPassed - checkInconclusive;

      out.push({
        id: r.id,
        ts: r.ts,
        request: r.request,
        companyName: r.companyName,
        headline: r.report?.headline ?? "—",
        passed: r.report?.passed ?? checkPassed,
        failed: r.report?.failed ?? checkFailed,
        inconclusive: checkInconclusive,
        checks: checks.length,
        findings: r.report?.findings?.length ?? 0,
        mismatches: (r.validationResults ?? []).filter((v: any) => v.mismatch).length,
        provider: r.provider,
        journey: r.journey
          ? {
              outcome: r.journey.outcome,
              worked: (r.journey.steps ?? []).filter((s) => s.verdict === "worked").length,
              steps: (r.journey.steps ?? []).length,
              ...(r.journey.stoppedAt ? { stoppedAt: r.journey.stoppedAt } : {}),
              // Postman-style field checks on every request, when the run made any.
              ...(() => {
                const fc = (r.journey.steps ?? []).map(relevantStepAssertions).reduce(
                  (t, st: any) => (st.assertions ? { total: t.total + st.assertions.total, passed: t.passed + st.assertions.passed, failed: t.failed + st.assertions.failed } : t),
                  { total: 0, passed: 0, failed: 0 },
                );
                return fc.total ? { fieldChecks: fc } : {};
              })(),
            }
          : undefined,
      });
    } catch {
      /* skip a corrupt file */
    }
  }
  return out;
}
