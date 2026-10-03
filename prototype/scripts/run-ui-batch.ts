/**
 * RUN COMPILED BROWSER CASES IN BULK — one at a time, on the single browser slot.
 *
 *   npx tsx scripts/run-ui-batch.ts --c 198678 --dry          which cases, nothing compiled or run
 *   npx tsx scripts/run-ui-batch.ts --c 198678 --limit 20     compile (fast tier, stored) and run 20
 *     --ids UI-EG-001,UI-PUB-004   exactly these catalog cases
 *     --budget-min 120             stop starting new cases after this many minutes (default 120)
 *     --case-min 15                limit for one case's browser run (default 15)
 *     --headed                     show the browser (default: headless)
 *     --recompile                  compile again even when a plan is stored
 *     --no-recheck                 record a failure without re-running it
 *
 * What it runs: written UI cases whose route is the browser compiler in an
 * area its steps cover (caseRouting.ts: kind "ui-compile", runsNow), "automate"
 * cases first, P0 → P1 → P2. Each case's plan is compiled once with the FAST
 * tier and stored (data/compiled-plans/ui/<id>.json) — a later batch reuses it
 * without a model. A plan the compiler says covers NONE of the case is not run.
 *
 * Safety:
 *   • one browser at a time: the in-process slot (src/ui/browserSlot.ts, used
 *     by runUiPlan) AND a check that no other Playwright run is going on this
 *     machine (another process holding a browser) before each case — waits up
 *     to 10 minutes, then skips the case with the reason;
 *   • QA test vendors only: any vendor a plan names that is not one of the
 *     client's QA vendors is removed before the run (procol-ui-tests runPlan
 *     filters again), and SPINE_ALLOW_REAL_VENDORS is never passed on;
 *   • bounded: a limit per case (the child is stopped), a budget for the batch.
 *
 * Verdicts (deterministic, never a model):
 *   passed         every step ran and the plan covers the whole case
 *   couldn't tell  the plan covers only part of the case; or a step could not
 *                  be PERFORMED (a control not found, a timeout) — automation,
 *                  not the product; or a failure did not happen again
 *   failed         never on this runner's word alone. An assertion step
 *                  (expect_…) or an app refusal that fails the same way again
 *                  on a second run with its own fresh event is recorded
 *                  "couldn't tell — to confirm" and listed for a person: the
 *                  plan was written by the compiler, and on 2026-10-03 both
 *                  such "failures" were the plan asserting the wrong thing
 *                  (UI-SCH-003 asserted "publish is blocked" where the case
 *                  also allows "publish succeeds"; UI-PUB-003 expected the
 *                  label "Draft" where the Drafts tab says "To Be Scheduled").
 *                  A plan that covers only part of the case never fails it.
 * Every case is saved as a normal run (data/runs + spine DB), so the coverage
 * report and the Success page count it.
 */
import { config } from "dotenv";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });

import { allCases, caseAsProse, type CatalogCase } from "../src/checks/testCatalog.js";
import { routeFor } from "../src/checks/caseRouting.js";
import { compileTestCase } from "../src/agents/planner.js";
import { runUiPlan, readPlanResult } from "../src/ui/uiFlowRunner.js";
import { saveRun, newRunId } from "../src/runStore.js";
import { closeSpineDb } from "../src/db/spineDb.js";
import { usageReport } from "../src/ai/llm.js";
import { withWatchdog } from "../src/checks/resilience.js";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(`--${n}`);
const COMPANY = Number(arg("c") ?? 198678);
const LIMIT = Number(arg("limit")) || 20;
const IDS = (arg("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const BUDGET_MS = (Number(arg("budget-min")) || 120) * 60_000;
const CASE_MS = (Number(arg("case-min")) || 15) * 60_000;
const HEADED = flag("headed");
const RECOMPILE = flag("recompile");
const RECHECK = !flag("no-recheck");
const DRY = flag("dry");
const T0 = Date.now();
const left = () => BUDGET_MS - (Date.now() - T0);
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
const UI_DIR = join(here, "..", "data", "compiled-plans", "ui");

// ── which cases ─────────────────────────────────────────────────────────────
const RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
let pick: CatalogCase[];
if (IDS.length) {
  const byId = new Map(allCases().map((c) => [c.id, c]));
  pick = IDS.map((id) => byId.get(id)).filter((c): c is CatalogCase => !!c);
} else {
  pick = allCases()
    .filter((c) => c.layer === "ui" && c.verdict === "automate")
    .filter((c) => {
      const r = routeFor(c);
      return r.kind === "ui-compile" && r.runsNow;
    })
    .sort((a, b) => (RANK[a.priority] ?? 9) - (RANK[b.priority] ?? 9) || a.id.localeCompare(b.id))
    .slice(0, LIMIT);
}
log(`client ${COMPANY} · ${pick.length} browser case(s): ${pick.map((c) => c.id).join(", ")}`);
if (DRY) process.exit(0);

// ── the client's QA vendors (SELECT only), to keep plans to them ───────────
async function qaVendorNames(): Promise<string[]> {
  try {
    const mod = await import(join(here, "..", "..", "procol-ui-tests", "src", "db", "qaVendors.ts"));
    return await withWatchdog<string[]>(mod.qaVendorNames(COMPANY), 30_000, "reading the QA vendors");
  } catch {
    return [];
  }
}
const qaNames = await qaVendorNames();
const isQa = (n: string) => qaNames.some((q) => q.toLowerCase() === String(n).toLowerCase());
const QA_EMAIL = /^qa_[a-z0-9_.-]+@example\.(com|org|net)$/i;

/** Remove any vendor a plan names that is not one of the client's QA vendors. */
function keepQaVendorsOnly(plan: any): string[] {
  const removed: string[] = [];
  for (const st of plan?.steps ?? []) {
    const a = st?.args;
    if (!a) continue;
    if (Array.isArray(a.vendors)) {
      const keep = a.vendors.filter((v: unknown) => isQa(String(v)));
      removed.push(...a.vendors.filter((v: unknown) => !isQa(String(v))).map(String));
      a.vendors = keep;
      if (!keep.length) delete a.vendors;
    }
    for (const [k, v] of Object.entries(a)) {
      if (typeof v === "string" && /@/.test(v) && /mail|email|vendor|user/i.test(k) && !QA_EMAIL.test(v)) {
        removed.push(v);
        delete (a as any)[k];
      }
    }
  }
  return removed;
}

// ── one browser on this machine ─────────────────────────────────────────────
function otherBrowserRun(): string | null {
  try {
    const out = execSync(`ps -axo pid,command | grep -E "playwright( |/cli\\.js )test" | grep -v grep || true`, { encoding: "utf8", timeout: 5_000 });
    return out.trim() ? out.trim().split("\n")[0].slice(0, 160) : null;
  } catch {
    return null;
  }
}
async function waitForBrowserFree(): Promise<boolean> {
  const until = Date.now() + 10 * 60_000;
  let said = false;
  while (Date.now() < until) {
    const other = otherBrowserRun();
    if (!other) return true;
    if (!said) {
      log(`   another browser run is going on this machine — waiting (up to 10 min): ${other}`);
      said = true;
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  return false;
}

// ── compile (stored) ────────────────────────────────────────────────────────
async function compiled(c: CatalogCase): Promise<{ plan: any; coverage: string; gaps: string[]; source: string; stored: boolean }> {
  const f = join(UI_DIR, `${c.id}.json`);
  if (!RECOMPILE && existsSync(f)) {
    try {
      const s = JSON.parse(readFileSync(f, "utf8"));
      if (s?.plan?.steps) return { plan: s.plan, coverage: s.meta.coverage, gaps: s.meta.gaps ?? [], source: s.meta.source, stored: true };
    } catch {
      /* compile again */
    }
  }
  const r = await withWatchdog(compileTestCase(caseAsProse(c), "events", { tier: "fast" }), 180_000, `compiling ${c.id}`);
  mkdirSync(UI_DIR, { recursive: true });
  // A generic fallback plan is not this case: it is not stored as one.
  if (r.source !== "fallback") {
    writeFileSync(
      f,
      JSON.stringify(
        { meta: { caseId: c.id, title: c.title, compiledAt: new Date().toISOString(), tier: "fast", source: r.source, coverage: r.coverage, gaps: r.gaps, warnings: r.warnings }, plan: r.plan },
        null,
        1,
      ),
    );
  }
  return { plan: r.plan, coverage: r.source === "fallback" ? "none" : r.coverage, gaps: r.source === "fallback" ? ["the compiler fell back to a generic plan — it is not this case"] : r.gaps, source: r.source, stored: false };
}

// ── run one plan, bounded ───────────────────────────────────────────────────
interface Ran {
  exitCode: number | null;
  steps: Array<{ step: string; status: string; detail?: string }>;
  timedOut: boolean;
  runId: string;
}
function runOnce(c: CatalogCase, plan: any): Promise<Ran> {
  const runId = `batch-${c.id}-${Date.now().toString(36)}`;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exitCode: number | null, timedOut: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const res = readPlanResult(runId) as { steps?: Ran["steps"] } | null;
      resolve({ exitCode, steps: res?.steps ?? [], timedOut, runId });
    };
    // SPINE_ALLOW_REAL_VENDORS must never reach the child.
    delete process.env.SPINE_ALLOW_REAL_VENDORS;
    const { stop } = runUiPlan({ plan, companyId: COMPANY, runId, headed: HEADED }, (e) => {
      if (e.type === "log" && /\[plan\]/.test(e.line ?? "")) log(`     ${String(e.line).trim().slice(0, 170)}`);
      if (e.type === "queued") log(`   ${e.line}`);
      if (e.type === "done" || e.type === "run-error") finish(e.exitCode ?? null, false);
    });
    const timer = setTimeout(() => {
      log(`   ${c.id}: no result within ${CASE_MS / 60_000} min — stopping the browser`);
      try {
        stop();
      } catch {
        /* already gone */
      }
      setTimeout(() => finish(null, true), 5_000);
    }, CASE_MS);
  });
}

type Verdict = { pass: boolean; inconclusive: boolean; verdict: string; candidate: boolean };
const PERFORM_FAILED = /timeout|waiting for|not found|not visible|no element|locator|detached|intercept|could not find|strict mode/i;
function judge(r: Ran, coverage: string, gaps: string[]): Verdict {
  if (r.timedOut) return { pass: false, inconclusive: true, verdict: "couldn't tell — the browser run did not finish in time and was stopped", candidate: false };
  const failedStep = r.steps.find((s) => s.status === "failed");
  if (!failedStep && r.steps.length && r.exitCode === 0) {
    if (coverage === "full") return { pass: true, inconclusive: false, verdict: `passed — all ${r.steps.length} steps ran and the plan covers the whole case`, candidate: false };
    return { pass: false, inconclusive: true, verdict: `couldn't tell — every step passed, but the plan covers only part of the case (no step yet for: ${gaps.join("; ") || "part of it"})`, candidate: false };
  }
  if (!failedStep) return { pass: false, inconclusive: true, verdict: `couldn't tell — the browser run ended (exit ${r.exitCode ?? "?"}) without a step result`, candidate: false };
  const where = `step “${failedStep.step}”: ${String(failedStep.detail ?? "").slice(0, 220)}`;
  const asserted = /^expect_/.test(failedStep.step) && !PERFORM_FAILED.test(String(failedStep.detail ?? ""));
  const appRefused = /rejected by the app|the app (said|refused|answered)|error message/i.test(String(failedStep.detail ?? ""));
  if (asserted || appRefused) return { pass: false, inconclusive: false, verdict: `failed at ${where}`, candidate: true };
  return { pass: false, inconclusive: true, verdict: `couldn't tell — the automation could not perform ${where}; that is not evidence about the product`, candidate: false };
}

// ── the batch ───────────────────────────────────────────────────────────────
const before = usageReport().totalUsd;
const summary: Array<Record<string, unknown>> = [];
for (const c of pick) {
  if (left() < 5 * 60_000) {
    log(`budget reached — stopping before ${c.id}`);
    break;
  }
  log(`── ${c.id} ${c.title}`);
  const t = Date.now();
  let comp: Awaited<ReturnType<typeof compiled>>;
  try {
    comp = await compiled(c);
  } catch (e) {
    summary.push({ id: c.id, ran: false, why: `compile failed: ${(e as Error).message}` });
    log(`   not run — compile failed: ${(e as Error).message}`);
    continue;
  }
  log(`   plan: ${comp.plan?.steps?.length ?? 0} step(s), coverage ${comp.coverage}${comp.stored ? " (stored)" : " (compiled now, fast tier)"}`);
  const record = (v: Verdict, extra: Record<string, unknown> = {}) => {
    const result = {
      id: c.id,
      flowId: "ui-compile",
      module: "Browser case",
      scenario: c.title,
      type: "functional",
      category: c.section,
      priority: c.priority,
      severity: c.priority === "P0" ? "High" : "Medium",
      expected: "accept",
      layer: "ui",
      inputSummary: `compiled browser plan · ${comp.plan?.steps?.length ?? 0} steps · coverage ${comp.coverage}`,
      httpStatus: null,
      accepted: v.pass,
      message: v.verdict,
      durationMs: Date.now() - t,
      pass: v.pass,
      inconclusive: v.inconclusive,
      verdict: v.verdict,
      steps: comp.plan?.steps?.map((s: any) => s.step),
      ...extra,
    };
    saveRun({
      id: newRunId(),
      ts: new Date(t).toISOString(),
      request: `ui-batch: ${c.id}`,
      companyId: COMPANY,
      companyName: null,
      provider: "deterministic",
      durationMs: Date.now() - t,
      report: undefined,
      events: [{ agent: "System", kind: "plan", text: "ui batch", data: { coverage: comp.coverage, gaps: comp.gaps, source: comp.source } } as any],
      flowResults: [],
      validationResults: [],
      checkResults: [result as any],
    } as any);
    summary.push({ id: c.id, verdict: v.inconclusive ? (v.candidate && comp.coverage === "full" && /to confirm/.test(v.verdict) ? "to confirm" : "couldn't tell") : v.pass ? "passed" : "failed", why: v.verdict, coverage: comp.coverage, minutes: Math.round((Date.now() - t) / 60000) });
    log(`   ${v.inconclusive ? "COULDN'T TELL" : v.pass ? "PASSED" : "FAILED"} — ${v.verdict}`);
  };
  if (comp.coverage === "none" || !comp.plan?.steps?.length) {
    summary.push({ id: c.id, ran: false, why: `no step can test what this case is about: ${comp.gaps.join("; ")}` });
    log(`   not run — the plan covers none of the case (${comp.gaps.join("; ").slice(0, 200)})`);
    continue;
  }
  const removed = keepQaVendorsOnly(comp.plan);
  if (removed.length) log(`   removed vendor(s) that are not this client's QA test vendors: ${removed.join(", ")}`);
  if (!(await waitForBrowserFree())) {
    summary.push({ id: c.id, ran: false, why: "another browser run held this machine for 10 minutes" });
    log("   not run — another browser run held the machine for 10 minutes");
    continue;
  }
  const first = await runOnce(c, comp.plan);
  let v = judge(first, comp.coverage, comp.gaps);
  if (v.candidate && RECHECK && left() > 5 * 60_000 && (await waitForBrowserFree())) {
    log("   it failed — running it again on its own fresh event before calling it a product failure");
    const again = await runOnce(c, comp.plan);
    const v2 = judge(again, comp.coverage, comp.gaps);
    if (v2.candidate && !v2.pass)
      v = {
        pass: false,
        inconclusive: true,
        candidate: true,
        verdict:
          comp.coverage === "full"
            ? `couldn't tell — to confirm: ${v.verdict.replace(/^failed at /, "it failed at ")}, and the same way again on a second run with its own fresh event; the plan was written by the compiler, so a person must check that this assertion is what the case asks before it counts as a product failure`
            : `couldn't tell — ${v.verdict.replace(/^failed at /, "it failed at ")} twice, but the plan covers only part of the case, so this is not a verdict on the case`,
      };
    else v = { pass: false, inconclusive: true, candidate: false, verdict: `couldn't tell — the first run ${v.verdict}, but a second run came out: ${v2.verdict}` };
  }
  // A failure that was not re-run is not a verdict either.
  if (v.candidate && !v.inconclusive) v = { ...v, inconclusive: true, verdict: `couldn't tell — ${v.verdict.replace(/^failed at /, "it failed at ")} once and was not re-run on a fresh event` };
  record(v, { planRun: first.runId });
}

const spent = usageReport().totalUsd - before;
console.log(JSON.stringify(summary, null, 1));
const n = (k: string) => summary.filter((s) => s.verdict === k).length;
log(`done in ${Math.round((Date.now() - T0) / 60000)} min — ${n("passed")} passed, ${n("failed")} failed, ${n("to confirm")} failed twice and wait for a person to confirm, ${n("couldn't tell")} couldn't tell, ${summary.filter((s) => s.ran === false).length} not run · model spend $${spent.toFixed(3)} (fast tier)`);
await new Promise((r) => setTimeout(r, 3000));
await closeSpineDb();
process.exit(0);
