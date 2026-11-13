/**
 * COMPILE EVERY BROWSER CASE WRITTEN AS TEXT — once, overnight, several at a time.
 *
 *   npx tsx scripts/night-compile.ts --dry                      which cases, in what order, nothing compiled
 *   npx tsx scripts/night-compile.ts --workers 4 --budget-min 360
 *     --redo none,partial,fallback   also compile again the stored plans with these verdicts
 *     --groups SRC,DRV               only these group prefixes (default: every text case)
 *     --ids SRC-RJB-001,DRV-AUC-003  exactly these
 *     --limit 40                     at most this many compiles (a measurement run)
 *     --stale                        also compile again plans older than the compiler / step catalog
 *
 * Which cases: every browser case that is not a screen case (UI-…, which has its own store,
 * scripts/run-ui-cases.ts) and not marked manual: the test sheets (SRC-, DRV-, EXP-, RCA-,
 * TYP-, EMA-, PRA-) and the product-sheet cases (PRD-). Until tonight these compiled only at
 * run time, so routing could not say whether the vocabulary reaches them.
 *
 * How: one process, a pool of N compiles in flight (the gap ledger is written synchronously
 * inside this process, so concurrent compiles do not race on it), FAST tier only, 180 s per
 * compile, resumable (a stored plan is skipped unless --redo / --stale says otherwise), and
 * bounded by the gateway's budget: when Slingring says the budget is gone, or the model stops
 * answering (five fallbacks in a row), the pass stops and writes what is left.
 *
 * A sheet case is compiled the way the sheet runner compiles it (sheetPrep → prepared state and
 * screen, VALUE_KEYS); a case that starts from a state the set-up does not build yet is still
 * compiled (from scratch) and stored with meta.unbuilt, so the vocabulary verdict is known even
 * though the case cannot start today. A product-sheet case is compiled from its catalog prose.
 *
 * Stored: data/compiled-plans/ui-text/<id>.json (compiledUiText.ts). Progress every 25 cases:
 * data/night/compile-progress.json and the console.
 */
import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "45000";

import { allCases, caseAsProse, type CatalogCase } from "../src/checks/testCatalog.js";
import { sheetCaseById, sheetCaseProse, sheetPrep } from "../src/checks/sheetCases.js";
import { VALUE_KEYS } from "../src/agents/screenModel.js";
import { compileTestCase } from "../src/agents/planner.js";
import { saveTextPlan, storedTextPlan, textPlanIsFresh, textPlanCounts, type TextPlanMeta } from "../src/checks/compiledUiText.js";
import { withWatchdog } from "../src/checks/resilience.js";
import { slingringOverBudget, usageReport } from "../src/ai/llm.js";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(`--${n}`);
const DRY = flag("dry");
const WORKERS = Math.max(1, Number(arg("workers")) || 4);
const BUDGET_MS = (Number(arg("budget-min")) || 360) * 60_000;
const LIMIT = Number(arg("limit")) || Infinity;
const REDO = new Set((arg("redo") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const GROUPS = (arg("groups") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const IDS = (arg("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const STALE = flag("stale");
const OUT_DIR = join(here, "..", "data", "night");
const PROGRESS = join(OUT_DIR, "compile-progress.json");
mkdirSync(OUT_DIR, { recursive: true });
const T0 = Date.now();
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

// ── which cases, in what order ───────────────────────────────────────────────
/** sheets first (the user's own cases), then the product sheet — sourcing areas before the others */
const ORDER = ["SRC", "RCA", "TYP", "DRV", "EXP", "EMA", "PRA", "PRD"];
const PRD_FIRST = ["PRD-KBSRC", "PRD-RFQ", "PRD-RFX", "PRD-RA", "PRD-RFP", "PRD-AE", "PRD-KBINT", "PRD-VM", "PRD-KBVON", "PRD-PR", "PRD-INTK", "PRD-PO"];
const prefix = (c: CatalogCase) => c.group.split("-")[0].toUpperCase();
const rank = (c: CatalogCase) => {
  const p = ORDER.indexOf(prefix(c));
  const sub = c.group.startsWith("PRD-") ? (PRD_FIRST.indexOf(c.group) + 1 || 99) : 0;
  return (p < 0 ? 50 : p) * 100 + sub;
};
const isText = (c: CatalogCase) => c.layer === "ui" && c.verdict !== "manual" && !/^UI-/.test(c.group);

let pick = allCases().filter(isText);
if (IDS.length) pick = pick.filter((c) => IDS.includes(c.id));
if (GROUPS.length) pick = pick.filter((c) => GROUPS.includes(prefix(c)) || GROUPS.includes(c.group.toUpperCase()));
pick.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));

const skipped: Record<string, number> = {};
const todo = pick.filter((c) => {
  const sp = storedTextPlan(c.id);
  if (!sp) return true;
  const verdict = sp.meta.source === "fallback" ? "fallback" : sp.meta.coverage;
  if (REDO.has(verdict)) return true;
  if (STALE && !textPlanIsFresh(sp)) return true;
  skipped[verdict] = (skipped[verdict] ?? 0) + 1;
  return false;
}).slice(0, LIMIT);

log(`${pick.length} text case(s); ${todo.length} to compile${Object.keys(skipped).length ? ` (stored already: ${Object.entries(skipped).map(([k, n]) => `${k} ${n}`).join(", ")})` : ""}; ${WORKERS} at a time; stored so far ${JSON.stringify(textPlanCounts())}`);
if (DRY) {
  const byGroup: Record<string, number> = {};
  for (const c of todo) byGroup[c.group] = (byGroup[c.group] ?? 0) + 1;
  for (const [g, n] of Object.entries(byGroup)) console.log(`  ${String(n).padStart(4)}  ${g}`);
  process.exit(0);
}

// ── one compile ──────────────────────────────────────────────────────────────
async function compileOne(c: CatalogCase): Promise<TextPlanMeta> {
  const t0 = Date.now();
  const sheet = sheetCaseById(c.id);
  const sp = sheet ? sheetPrep(sheet) : null;
  const prose = sheet ? sheetCaseProse(sheet) : caseAsProse(c);
  const prepared = sp?.prepared && !sp.unbuilt
    ? { prepared: { state: sp.state, screen: sp.screen, screenWhat: sp.screenWhat, valueKeys: VALUE_KEYS[sp.state] ?? [], technical: sp.technical, ...(sp.shape ? { shape: sp.shape } : {}) } }
    : {};
  const r = await withWatchdog(compileTestCase(prose, "events", { tier: "fast", ...prepared }), 300_000, `compiling ${c.id}`);
  const plan = (r.plan ?? { steps: [] }) as { steps?: Array<{ step: string }> };
  const meta: TextPlanMeta = {
    caseId: c.id,
    title: c.title,
    group: c.group,
    ...(sheet ? { sheet: sheet.sheet } : {}),
    compiledAt: new Date().toISOString(),
    tier: "fast",
    coverage: r.coverage,
    gaps: r.gaps ?? [],
    warnings: r.warnings ?? [],
    source: r.source,
    steps: plan.steps?.length ?? 0,
    stepNames: (plan.steps ?? []).map((s) => s.step),
    ...(sp?.prepared && !sp.unbuilt ? { state: sp.state, screen: sp.screen } : {}),
    ...(sp?.unbuilt ? { unbuilt: `${sp.why} ${sp.unbuilt}`.trim() } : {}),
    ms: Date.now() - t0,
  };
  // A compile the model did not answer (fallback: a generic plan) never replaces a real stored plan — a rate-limited
  // gateway turned SRC-AWD-057's partial plan into a fallback on 12 Nov. It is counted, and tried again next run.
  const prev = storedTextPlan(c.id);
  if (r.source === "fallback" && prev && prev.meta.source !== "fallback") return { ...meta, kept: prev.meta.coverage } as TextPlanMeta;
  saveTextPlan({ meta, plan: r.plan });
  return meta;
}

// ── the pool ─────────────────────────────────────────────────────────────────
const tally = { done: 0, full: 0, partial: 0, none: 0, fallback: 0, failed: 0, unbuilt: 0, usd: 0, startedAt: new Date().toISOString(), lastId: "", stoppedWhy: "" };
let fallbacksInARow = 0;
let stop = "";
let next = 0;

function progress() {
  tally.usd = Number(usageReport().totalUsd.toFixed(3));
  writeFileSync(PROGRESS, JSON.stringify({ ...tally, left: todo.length - next, elapsedMin: Math.round((Date.now() - T0) / 60_000), stored: textPlanCounts() }, null, 1));
}

async function worker(id: number): Promise<void> {
  while (!stop) {
    if (Date.now() - T0 > BUDGET_MS) { stop = "the time budget for the pass ran out"; break; }
    if (slingringOverBudget()) { stop = "Slingring said the budget is exhausted"; break; }
    const i = next++;
    if (i >= todo.length) break;
    const c = todo[i];
    try {
      const m = await compileOne(c);
      tally.done++;
      tally.lastId = c.id;
      if (m.source === "fallback") { tally.fallback++; fallbacksInARow++; } else { tally[m.coverage]++; fallbacksInARow = 0; }
      if (m.unbuilt) tally.unbuilt++;
      log(`w${id} ${String(i + 1).padStart(4)}/${todo.length} ${c.id.padEnd(14)} ${m.source === "fallback" ? "FALLBACK" : m.coverage.padEnd(7)} ${String(m.steps).padStart(2)} steps ${Math.round(m.ms / 1000)}s${m.unbuilt ? " · start state not built" : ""}${m.coverage !== "full" && m.gaps.length ? ` · ${m.gaps[0].slice(0, 90)}` : ""}`);
      if (fallbacksInARow >= 5) stop = "the model stopped answering (five fallbacks in a row)";
    } catch (e) {
      tally.failed++;
      log(`w${id} ${c.id} FAILED: ${(e as Error).message.slice(0, 160)}`);
    }
    if (tally.done % 25 === 0) progress();
  }
}

await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i + 1)));
tally.stoppedWhy = stop || (next >= todo.length ? "every case compiled" : "");
progress();
const u = usageReport();
log(`done: ${tally.done} compiled — full ${tally.full} · partial ${tally.partial} · none ${tally.none} · fallback ${tally.fallback} · failed ${tally.failed} · start state not built ${tally.unbuilt}; left ${todo.length - Math.min(next, todo.length)}; ${Math.round((Date.now() - T0) / 60_000)} min; spend $${u.totalUsd.toFixed(2)}${stop ? ` — stopped: ${stop}` : ""}`);
log(`stored now: ${JSON.stringify(textPlanCounts())}`);
process.exit(0);
