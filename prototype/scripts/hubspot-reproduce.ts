/**
 * REPRODUCE SUPPORT-TICKET DEFECTS ON FRESH TEST EVENTS — the gate to the bug sheet.
 *
 *   npm run hubspot:reproduce -- --dry                      which cases, compile only (no live run)
 *   npm run hubspot:reproduce -- --limit 2 --company 198678 run two, live, on PROCOL DEMO
 *     --ids HS-900000001-1,HS-900000003-1   exactly these cases
 *     --company <id>     run on this client (default: the ticket's client when known, else 198678)
 *     --recompile        ignore the cached plan in data/hubspot/plans/
 *     --all              also cases already tried
 *
 * Per case, one at a time (one live journey at a time):
 *   1  the case's words → an API plan (agents/apiPlanner.ts): a library twin
 *      when the case cites one, otherwise the Slingring FAST tier only (never
 *      the reason tier; Groq/Gemini are switched off for this process so the
 *      ticket-derived text cannot leave through a fallback). Cached, git-ignored.
 *   2  the plan runs on its OWN fresh event (checks/apiPlanRunner.ts runApiPlan);
 *      a failure is run again on a SECOND fresh event; QA vendors only; every
 *      request through the guarded sender.
 *   3  the verdict goes back into support_tickets:
 *        reproduced          failed on both fresh events AT THE DECISIVE STEP (the
 *                            step the ticket is about) AND the plan covers the case
 *                            in full AND a backend line confirms the rule
 *        needs_confirmation  failed on both, but at another step (a different finding,
 *                            kept in the evidence), or coverage is partial, or no
 *                            backend line is cited yet — a person decides
 *        not_reproduced      passed (the defect did not show), or the run could
 *                            not tell (the evidence says which)
 *        not_automatable     no plan could be compiled
 *        not_tried           no session could be opened — nothing ran
 */
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
// Ticket-derived text may reach Slingring (approved) and nothing else: no Groq, no Gemini fallback.
delete process.env.GROQ_API_KEY;
delete process.env.GOOGLE_API_KEY;
// The gateway's fast model takes ~10 s; llm.ts's 4 s default for the inner loop would time every compile out.
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "45000";

import { compileApiPlan, validatePlan, planInWords, recipeForLibraryCase, type ApiPlan } from "../src/agents/apiPlanner.js";
import { loadCases } from "../src/checks/caseLibrary.js";
import { PATTERNS } from "../src/hubspot/patterns.js";
import { runApiPlan, type PlanRunResult } from "../src/checks/apiPlanRunner.js";
import { caseById } from "../src/checks/testCatalog.js";
import { withWatchdog } from "../src/checks/resilience.js";
import { usageReport } from "../src/ai/llm.js";
import { HUBSPOT_DIR } from "../src/hubspot/mapFeature.js";
import { loadRows, saveReproduction, type TicketRow } from "../src/hubspot/store.js";
import { closeSpineDb } from "../src/db/spineDb.js";
import type { ReproStatus } from "../src/hubspot/types.js";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(`--${n}`);
const DRY = flag("dry");
const LIMIT = Number(arg("limit")) || 2;
const COMPANY = Number(arg("company")) || undefined;
const IDS = new Set((arg("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
const PLANS = join(HUBSPOT_DIR, "plans");
const DEFAULT_CLIENT = 198678;

// ── which cases ─────────────────────────────────────────────────────────────
const { rows, from } = await loadRows();
const byCase = new Map<string, TicketRow[]>();
for (const r of rows) {
  if (r.classification !== "defect" || !r.inEventsScope) continue;
  for (const id of r.linkedCaseIds) byCase.set(id, [...(byCase.get(id) ?? []), r]);
}
const todo = [...byCase.entries()].filter(([id, ts]) => {
  if (IDS.size) return IDS.has(id);
  if (ts.every((t) => t.reproductionStatus === "not_automatable")) return false;
  return flag("all") || ts.some((t) => t.reproductionStatus === "not_tried");
});
log(`${byCase.size} regression case(s) from ${rows.length} stored ticket(s) (${from}); ${todo.length} to try${IDS.size ? "" : `, at most ${LIMIT}`}`);
if (!todo.length) {
  await closeSpineDb();
  process.exit(0);
}

// ── the words to compile ────────────────────────────────────────────────────
function caseText(caseId: string, t: TicketRow): { text: string; useCatalog: boolean } {
  const sc = t.scenario;
  // A model-written scenario lives only in spine.ai; the catalog holds a placeholder for it.
  if (sc && sc.modelWritten) {
    return { text: [`A support-reported defect (${t.featureKey})`, `Setup: ${sc.preconditions}`, `Steps: ${sc.steps.join(" ")}`, `Expected: ${sc.expected}`].join("\n"), useCatalog: false };
  }
  if (caseById(caseId)) return { text: "", useCatalog: true };
  return { text: sc ? [`Setup: ${sc.preconditions}`, `Steps: ${sc.steps.join(" ")}`, `Expected: ${sc.expected}`].join("\n") : "", useCatalog: false };
}

/**
 * The "nearest step" trap: a compiled plan that sends a library case's request
 * without first building the state that case assumes ("an RFP ending after the
 * RFQ") would fail for the wrong reason — on two fresh events, every time.
 * Such a plan is refused here rather than run.
 */
function unbuiltPrecondition(plan: ApiPlan): string | null {
  const lib = new Map(loadCases().map((c) => [c.id, c]));
  for (const [i, a] of plan.act.entries()) {
    if (a.op !== "library" || !a.caseId) continue;
    const c = lib.get(a.caseId);
    if (!c) continue;
    const r = recipeForLibraryCase(c);
    const arranged = plan.act.slice(0, i).some((x) => x.op !== "wait");
    if (r.unbuilt && !arranged) return `its request is library case ${a.caseId}, which assumes “${r.unbuilt}”, and nothing in the plan builds that state first`;
  }
  return null;
}

async function planFor(caseId: string, t: TicketRow): Promise<{ plan: ApiPlan | null; coverage: string; gaps: string[]; source: string; cached: boolean }> {
  // 1 · a hand-written plan for the ticket's defect pattern, when there is one
  const pattern = PATTERNS.find((p) => p.id === t.scenario?.pattern);
  if (pattern?.plan) {
    const v = await validatePlan({ ...pattern.plan, caseId });
    if (v.ok) return { plan: v.plan, coverage: "full", gaps: [], source: "pattern (hand-written, validated)", cached: false };
    log(`  the pattern's own plan did not validate (${v.errors.join("; ")}) — compiling the words instead`);
  }
  const file = join(PLANS, `${caseId}.json`);
  if (!flag("recompile") && existsSync(file)) {
    const j = JSON.parse(readFileSync(file, "utf8"));
    const v = j.plan ? await validatePlan(j.plan) : null;
    // Only a valid plan is reused; a failed compile is tried again next time.
    if (j.plan && v?.ok) return { plan: v.plan, coverage: j.meta.coverage, gaps: j.meta.gaps, source: j.meta.source, cached: true };
  }
  const { text, useCatalog } = caseText(caseId, t);
  const r = await withWatchdog(
    compileApiPlan(useCatalog ? { caseId } : { text, caseId }, { llm: true, allowReason: false }),
    150_000,
    `compiling ${caseId}`,
  ).catch((e) => ({ plan: null, coverage: "none" as const, gaps: [`the compile did not finish: ${(e as Error).message}`], source: "none" as const, errors: [] as string[] }));
  let plan = r.plan ? { ...r.plan, caseId, title: r.plan.title || caseId } : null;
  const trap = plan ? unbuiltPrecondition(plan) : null;
  if (trap) {
    r.gaps = [`refused before running: ${trap}`, ...r.gaps];
    (r as any).coverage = "none";
    plan = null;
  }
  mkdirSync(PLANS, { recursive: true });
  writeFileSync(file, JSON.stringify({ meta: { caseId, compiledAt: new Date().toISOString(), source: r.source, coverage: r.coverage, gaps: r.gaps, errors: (r as any).errors ?? [] }, plan }, null, 1));
  return { plan, coverage: r.coverage, gaps: r.gaps, source: r.source, cached: false };
}

// ── run ─────────────────────────────────────────────────────────────────────
const spendBefore = usageReport().totalUsd;
let ran = 0;
for (const [caseId, tickets] of todo) {
  if (!IDS.size && ran >= LIMIT) break;
  const lead = tickets[0];
  const companyId = COMPANY ?? lead.scenario?.clientId ?? DEFAULT_CLIENT;
  const store = async (status: ReproStatus, evidence: Record<string, unknown>) => {
    for (const t of tickets) await saveReproduction(t.ticketId, status, { caseId, companyId, at: new Date().toISOString(), ...evidence });
  };
  log(`${caseId} (ticket${tickets.length > 1 ? "s" : ""} ${tickets.map((t) => t.ticketId).join(", ")}) — compiling`);
  const p = await planFor(caseId, lead);
  log(`  plan: ${p.plan ? `${p.plan.setup.recipe} → ${p.plan.act.map((a) => a.op).join(", ")} · expected ${p.plan.expected.outcome}${p.plan.expected.code ? ` ${p.plan.expected.code}` : ""}` : "none"} · coverage ${p.coverage} · source ${p.source}${p.cached ? " (cached)" : ""}`);
  if (p.gaps.length) log(`  gaps: ${p.gaps.join(" | ").slice(0, 300)}`);
  if (!p.plan || p.coverage === "none") {
    if (!DRY) await store("not_automatable", { because: `no API plan could be compiled: ${p.gaps.join("; ")}`, coverage: p.coverage, planSource: p.source });
    continue;
  }
  if (DRY) {
    const words = planInWords(p.plan);
    log(`  would run on client ${companyId}: ${words.preconditions} | ${words.steps.join(" ")} | ${words.expected}`);
    continue;
  }
  ran += 1;
  log(`  running live on client ${companyId} (fresh event; a failure is re-run on a second fresh event)…`);
  const res: PlanRunResult = await runApiPlan(p.plan, { companyId, confirm: true, onLine: (l) => log(`    ${l}`) });
  const decisive = res.steps.find((s) => s.decisive) ?? res.steps.filter((s) => s.phase === "act").slice(-1)[0];
  const cite = lead.scenario?.backendCite;
  const evidence = {
    verdict: res.verdict,
    reason: res.reason,
    confirmed: res.confirmed ?? false,
    coverage: p.coverage,
    gaps: p.gaps,
    planSource: p.source,
    recipe: p.plan.setup.recipe,
    firstEvent: res.setup.eventGroupUuid ?? null,
    secondEvent: res.confirmation?.setup.eventGroupUuid ?? null,
    decisiveStep: decisive ? { title: decisive.title, status: decisive.status, code: decisive.code, verdict: decisive.verdict, actual: decisive.actual } : null,
    backendCite: cite ?? null,
    runId: res.runId ?? null,
    minutes: Number((res.ms / 60_000).toFixed(1)),
  };
  // The defect the ticket reports is the DECISIVE step. A failure anywhere else — even a server
  // error while building the precondition — is a different finding: it is recorded, never
  // counted as this ticket reproducing.
  const firstFailure = (steps: PlanRunResult["steps"]) => steps.find((s) => s.verdict === "failed");
  const f1 = firstFailure(res.steps);
  const f2 = firstFailure(res.confirmation?.steps ?? []);
  const onDecisive = !!(f1?.decisive && f2?.decisive);
  const otherFinding =
    res.verdict === "failed" && res.confirmed && !onDecisive && f1
      ? { step: f1.title, status: f1.status ?? null, code: f1.code ?? null, actual: f1.actual, phase: f1.phase, note: "failed the same way on both fresh events, but NOT at the step the ticket is about — a separate finding to verify against the backend code, not this ticket's defect" }
      : null;
  let status: ReproStatus;
  if (res.verdict === "failed" && res.confirmed) status = onDecisive && p.coverage === "full" && cite ? "reproduced" : "needs_confirmation";
  else if (res.verdict === "not run") status = "not_tried";
  else status = "not_reproduced";
  await store(status, { ...evidence, failedOnDecisiveStep: onDecisive, otherFinding, inconclusive: res.verdict === "couldn't tell" });
  log(`  → ${status}: ${res.verdict} — ${res.reason.slice(0, 300)}`);
}
log(`model spend this run: $${(usageReport().totalUsd - spendBefore).toFixed(4)} (fast tier only)`);
await closeSpineDb();
process.exit(0);
