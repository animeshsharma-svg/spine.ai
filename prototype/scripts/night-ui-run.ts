/**
 * RUN THE COMPILED TEXT CASES IN THE BROWSER — one at a time, all night, on the single browser slot.
 *
 *   npx tsx scripts/night-ui-run.ts --dry                     which cases, in what order, nothing run
 *   npx tsx scripts/night-ui-run.ts --c 198678 --budget-min 420 [--groups SRC,DRV] [--chunk 20] [--limit N]
 *     --coverage full,partial   which stored verdicts to run (default both, full first)
 *     --skip-ran                leave out cases a sheet run already recorded tonight (default on; --no-skip-ran to rerun)
 *     --skip-groups SRC-AUC     leave these groups out (a known automation trap)
 *     --repair                  switch on the sheet runner's repair pass (teach a stuck locator, build steps from the screen library)
 *
 * What it runs: every case the night compile stored (data/compiled-plans/ui-text, compiledUiText.ts)
 * with coverage full or partial and no unbuilt start state — the test sheets first (SRC-, RCA-,
 * TYP-, DRV-, EXP-, EMA-, PRA-), the product-sheet cases after — P0 before P3, full before partial.
 * Each chunk is one sheet run (data/sheet-runs, the Test sheets page shows it live), so progress is
 * visible and a stop loses at most the case in flight. The sheet runner reuses the stored plan
 * (no compile), builds the start state by API, switches the company settings the case names and
 * restores them, asks a tester for at most 2 minutes, and never marks a Fail without evidence.
 *
 * Bounded: a time budget for the whole night; a stop file (data/night/ui-run.stop) ends it after the
 * case in flight; another Playwright run on this machine is waited for (10 min), never joined.
 */
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
process.env.SPINE_QA_VENDORS_ONLY ??= "1";
delete process.env.SPINE_ALLOW_REAL_VENDORS;
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "45000";
process.env.SLINGRING_429_RETRIES ??= "5";

// An idle connection of a database pool timing out emits an unhandled socket 'error' (read EADDRNOTAVAIL /
// ECONNRESET / ETIMEDOUT) that killed the whole night between two cases, twice on 10 Nov. A dropped idle
// connection is not a verdict about anything: log it and keep going. Anything else still ends the run.
process.on("uncaughtException", (e: any) => {
  if (/EADDRNOTAVAIL|ECONNRESET|ETIMEDOUT|EPIPE|ENETUNREACH/.test(String(e?.code ?? e?.message))) { console.log(`[${new Date().toISOString().slice(11, 19)}] a dropped connection (${e.code ?? e.message}) — the run goes on`); return; }
  console.error(e);
  process.exit(1);
});
process.on("unhandledRejection", (e: any) => console.log(`[${new Date().toISOString().slice(11, 19)}] unhandled rejection (kept going): ${String(e?.message ?? e).slice(0, 200)}`));
import { sheetCaseById, type SheetCase } from "../src/checks/sheetCases.js";
import { allStoredTextPlans } from "../src/checks/compiledUiText.js";
import { runSheetCases, listSheetRuns, loadSheetRun } from "../src/checks/sheetRunner.js";
import { allCases } from "../src/checks/testCatalog.js";
import { closeSpineDb } from "../src/db/spineDb.js";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(`--${n}`);
const DRY = flag("dry");
const COMPANY = Number(arg("c") ?? 198678);
const BUDGET_MS = (Number(arg("budget-min")) || 420) * 60_000;
const CHUNK = Math.max(1, Number(arg("chunk")) || 20);
const LIMIT = Number(arg("limit")) || Infinity;
const COVERAGE = new Set((arg("coverage") ?? "full,partial").split(",").map((s) => s.trim()));
const GROUPS = (arg("groups") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
/** groups left out tonight (e.g. SRC-AUC while the single-stage auction drawer trap is open) */
const SKIP = (arg("skip-groups") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const SKIP_RAN = !flag("no-skip-ran");
const REPAIR = flag("repair");
const OUT_DIR = join(here, "..", "data", "night");
const STOP = join(OUT_DIR, "ui-run.stop");
const PROGRESS = join(OUT_DIR, "ui-run-progress.json");
mkdirSync(OUT_DIR, { recursive: true });
const T0 = Date.now();
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

// ── which cases ──────────────────────────────────────────────────────────────
const ORDER = ["SRC", "RCA", "TYP", "DRV", "EXP", "EMA", "PRA", "PRD"];
const PRANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const byId = new Map(allCases().map((c) => [c.id, c]));
const prefix = (id: string) => id.split("-")[0].toUpperCase();

/** case ids with a result in any sheet run started tonight (after this script's day began) */
function ranTonight(): Set<string> {
  const out = new Set<string>();
  const since = new Date(T0 - 12 * 3600_000).toISOString();
  for (const r of listSheetRuns(500)) {
    if (r.startedAt < since) continue;
    const full = loadSheetRun(r.id);
    for (const c of full?.cases ?? []) if (c.status !== "Not run") out.add(c.id);
  }
  return out;
}
const ran = SKIP_RAN ? ranTonight() : new Set<string>();

type Pick = { sheetCase: SheetCase; coverage: string; priority: string };
/** the compiled cases not run yet — re-read every round, because the night compile keeps adding plans */
function pickCases(): { picks: Pick[]; left: Record<string, number> } {
const picks: Pick[] = [];
const left: Record<string, number> = {};
for (const sp of allStoredTextPlans()) {
  const m = sp.meta;
  if (m.source === "fallback" || !COVERAGE.has(m.coverage) || m.unbuilt || !sp.plan?.steps?.length) { left[m.unbuilt ? "start state not built" : m.source === "fallback" ? "fallback" : m.coverage] = (left[m.unbuilt ? "start state not built" : m.source === "fallback" ? "fallback" : m.coverage] ?? 0) + 1; continue; }
  if (GROUPS.length && !GROUPS.includes(prefix(m.caseId)) && !GROUPS.includes(m.group.toUpperCase())) continue;
  if (SKIP.length && (SKIP.includes(prefix(m.caseId)) || SKIP.includes(m.group.toUpperCase()))) { left["skipped group"] = (left["skipped group"] ?? 0) + 1; continue; }
  if (ran.has(m.caseId)) { left["ran already"] = (left["ran already"] ?? 0) + 1; continue; }
  // a plan older than the compiler still runs: the sheet runner compiles it afresh at run time (compiledUiText.textPlanIsFresh)
  const sc = sheetCaseById(m.caseId);
  if (!sc) { left["not a sheet case (product-sheet cases run from Run tests)"] = (left["not a sheet case (product-sheet cases run from Run tests)"] ?? 0) + 1; continue; }
  picks.push({ sheetCase: sc, coverage: m.coverage, priority: byId.get(m.caseId)?.priority ?? "P2" });
}
picks.sort((a, b) =>
  (ORDER.indexOf(prefix(a.sheetCase.id)) + 1 || 50) - (ORDER.indexOf(prefix(b.sheetCase.id)) + 1 || 50) ||
  (a.coverage === "full" ? 0 : 1) - (b.coverage === "full" ? 0 : 1) ||
  (PRANK[a.priority] ?? 9) - (PRANK[b.priority] ?? 9) ||
  a.sheetCase.id.localeCompare(b.sheetCase.id));
return { picks, left };
}
let { picks, left } = pickCases();
let todo = picks.slice(0, LIMIT);
log(`${todo.length} case(s) to run on client ${COMPANY}${Object.keys(left).length ? ` (left out: ${Object.entries(left).map(([k, n]) => `${k} ${n}`).join(", ")})` : ""}`);
if (DRY) {
  const byG: Record<string, number> = {};
  for (const p of todo) byG[`${p.sheetCase.sheet} · ${p.coverage}`] = (byG[`${p.sheetCase.sheet} · ${p.coverage}`] ?? 0) + 1;
  for (const [g, n] of Object.entries(byG)) console.log(`  ${String(n).padStart(4)}  ${g}`);
  process.exit(0);
}

// ── one browser on this machine ──────────────────────────────────────────────
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
  while (Date.now() < until) {
    if (!otherBrowserRun()) return true;
    await new Promise((r) => setTimeout(r, 15_000));
  }
  return false;
}

// ── the night ────────────────────────────────────────────────────────────────
const tally: Record<string, number> = { Pass: 0, Fail: 0, "Partly checked": 0, "Couldn't tell": 0, "Not run": 0 };
let done = 0;
const runs: string[] = [];
const progress = (why = "") => writeFileSync(PROGRESS, JSON.stringify({ done, total, tally, runs, elapsedMin: Math.round((Date.now() - T0) / 60_000), stoppedWhy: why }, null, 1));

let stopWhy = "";
let total = todo.length;
while (!stopWhy) {
  if (Date.now() - T0 > BUDGET_MS) { stopWhy = "the time budget ran out"; break; }
  if (existsSync(STOP)) { stopWhy = "the stop file was found"; break; }
  if (!todo.length) {
    // the night compile keeps storing plans: look again for new ones, every five minutes, until the budget ends
    if (Number.isFinite(LIMIT) && done >= LIMIT) { stopWhy = "the limit was reached"; break; }
    ({ picks } = pickCases());
    todo = picks.filter((p) => !ran.has(p.sheetCase.id)).slice(0, Number.isFinite(LIMIT) ? Math.max(0, LIMIT - done) : undefined);
    total = done + todo.length;
    if (!todo.length) { log("nothing new compiled yet — looking again in 5 minutes"); await new Promise((r) => setTimeout(r, 5 * 60_000)); continue; }
    log(`${todo.length} newly compiled case(s) picked up`);
  }
  if (!(await waitForBrowserFree())) { stopWhy = `another browser run kept the slot: ${otherBrowserRun()}`; break; }
  const chunk = todo.splice(0, CHUNK);
  // one sheet run per chunk, named after the sheet the chunk mostly comes from
  const sheetName = chunk[0].sheetCase.sheet;
  log(`chunk: ${chunk.length} case(s) from ${sheetName} (${chunk[0].sheetCase.id} … ${chunk[chunk.length - 1].sheetCase.id})`);
  const t0 = Date.now();
  const run = await runSheetCases(chunk.map((p) => p.sheetCase), {
    companyId: COMPANY,
    sheet: sheetName,
    headed: false,
    repair: REPAIR,
    emit: (e: any) => {
      if (e.type === "case-start") log(`  ▶ ${e.id} (${e.index}/${e.total}) ${String(e.title).slice(0, 70)}`);
      if (e.type === "case-done") log(`  ■ ${e.result?.id} ${e.result?.status ?? ""} — ${String(e.result?.why ?? "").slice(0, 140)}`);
      if (e.type === "line" && /Starts from|Plan reused|Repair|setting/i.test(String(e.line))) log(`    ${String(e.line).slice(0, 140)}`);
    },
  });
  runs.push(run.id);
  for (const c of run.cases) { tally[c.status] = (tally[c.status] ?? 0) + 1; done++; ran.add(c.id); }
  log(`chunk done in ${Math.round((Date.now() - t0) / 60_000)} min — run ${run.id}: ${Object.entries(tally).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
  progress();
}
progress(stopWhy || "every picked case ran");
log(`night done: ${done}/${total} ran in ${Math.round((Date.now() - T0) / 60_000)} min — ${Object.entries(tally).map(([k, n]) => `${k} ${n}`).join(" · ")}${stopWhy ? ` — stopped: ${stopWhy}` : ""}`);
await closeSpineDb().catch(() => {});
process.exit(0);
