/**
 * THE MORNING NOTE FOR THE NIGHT'S AUTOMATION — counted, not claimed.
 *
 *   npx tsx scripts/night-report.ts                 prints the note and writes data/night/report-<date>.md
 *
 * What it counts: how many catalog cases reach a runner now against the baseline measured at the
 * start of the night (10 Nov 2026 00:30 IST), by route; the compiler's verdicts over the text cases
 * (sheets, product sheet) by group; the stored API plans; the screen-case plans; the browser runs
 * of the night (data/sheet-runs since the night began) with their verdicts; the API batch summary;
 * and the three agents' notes if present (data/night/<agent>.md, merged branches).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allCases } from "../src/checks/testCatalog.js";
import { routeFor } from "../src/checks/caseRouting.js";
import { allStoredTextPlans, textPlanCounts } from "../src/checks/compiledUiText.js";
import { allStoredApiPlans, planSpeaksForCase } from "../src/checks/compiledPlans.js";
import { listSheetRuns, loadSheetRun } from "../src/checks/sheetRunner.js";

const here = dirname(fileURLToPath(import.meta.url));
const NIGHT = join(here, "..", "data", "night");
const SINCE = process.argv.includes("--since") ? process.argv[process.argv.indexOf("--since") + 1] : "2026-11-09T19:00:00.000Z";

/** measured 10 Nov 2026 00:30 IST, before anything ran */
const BASELINE = { total: 8940, runsNow: 2401, byKind: { "ui-compile": 197, "api-plan": 59, "api-field": 1020, "api-library": 965, "api-matrix": 45, "api-template": 40, "ui-crosscheck": 36, "api-case": 22, "ui-journey": 17 } as Record<string, number>, uiText: { compiled: 0 }, apiStored: { total: 164, full: 5, partial: 104, none: 55 }, uiPrepared: { total: 274, full: 61, partial: 87, none: 125 } };

const lines: string[] = [];
const out = (s = "") => lines.push(s);

// ── reachability ─────────────────────────────────────────────────────────────
const cases = allCases();
const byKind: Record<string, { n: number; runsNow: number }> = {};
const notNow: Record<string, number> = {};
let runsNow = 0;
for (const c of cases) {
  const r = routeFor(c);
  byKind[r.kind] ??= { n: 0, runsNow: 0 };
  byKind[r.kind].n++;
  if (r.runsNow) { byKind[r.kind].runsNow++; runsNow++; } else if (r.kind !== "manual") {
    const why = r.because.replace(/[“”].*?[”“]|\(.*?\)|[A-Z]+-[A-Z0-9-]+|\d+/g, "").replace(/\s+/g, " ").slice(0, 100);
    notNow[why] = (notNow[why] ?? 0) + 1;
  }
}
out(`# The night's automation — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);
out();
out(`## Cases that reach a runner now`);
out();
out(`| | start of the night | now |`);
out(`|---|---:|---:|`);
out(`| catalog | ${BASELINE.total} | ${cases.length} |`);
out(`| run now (a runner exists today and its result speaks for the case) | ${BASELINE.runsNow} | ${runsNow} |`);
for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1].n - a[1].n)) out(`| ${k} | ${BASELINE.byKind[k] ?? 0} | ${v.runsNow} of ${v.n} |`);
out();
out(`Why the rest does not run yet (automatable cases only):`);
out();
for (const [w, n] of Object.entries(notNow).sort((a, b) => b[1] - a[1]).slice(0, 14)) out(`- ${n} — ${w}`);
out();

// ── the compiler's verdicts over the text cases ──────────────────────────────
const tp = allStoredTextPlans();
const tc = textPlanCounts();
out(`## Text cases compiled (sheets + product sheet)`);
out();
out(`${tc.total} compiled: full ${tc.full} · partial ${tc.partial} · none ${tc.none} · model did not answer ${tc.fallback} · start state not built ${tc.unbuilt}`);
out();
const byGroup: Record<string, { n: number; full: number; partial: number; none: number; unbuilt: number }> = {};
for (const p of tp) {
  const g = p.meta.group.split("-").slice(0, 2).join("-");
  byGroup[g] ??= { n: 0, full: 0, partial: 0, none: 0, unbuilt: 0 };
  byGroup[g].n++;
  if (p.meta.source !== "fallback") byGroup[g][p.meta.coverage]++;
  if (p.meta.unbuilt) byGroup[g].unbuilt++;
}
out(`| group | compiled | full | partial | none | start state not built |`);
out(`|---|---:|---:|---:|---:|---:|`);
for (const [g, v] of Object.entries(byGroup).sort((a, b) => b[1].n - a[1].n)) out(`| ${g} | ${v.n} | ${v.full} | ${v.partial} | ${v.none} | ${v.unbuilt} |`);
out();
const gapCount: Record<string, number> = {};
for (const p of tp) for (const g of p.meta.gaps) { const k = g.replace(/[“”"].*?[”“"]/g, "…").slice(0, 90); gapCount[k] = (gapCount[k] ?? 0) + 1; }
out(`Most frequent gaps the compiler named:`);
out();
for (const [g, n] of Object.entries(gapCount).sort((a, b) => b[1] - a[1]).slice(0, 20)) out(`- ${n} — ${g}`);
out();

// ── API plans ────────────────────────────────────────────────────────────────
const ap = allStoredApiPlans();
const byCase = new Map(cases.map((c) => [c.id, c]));
let speaks = 0;
for (const p of ap) { const c = byCase.get(p.meta.caseId); if (p.meta.validated && c && planSpeaksForCase(c.id, `${c.title} ${c.setup} ${c.steps} ${c.expected}`)) speaks++; }
const apiIndex = (() => { try { return JSON.parse(readFileSync(join(here, "..", "data", "compiled-plans", "api", "index.json"), "utf8")); } catch { return null; } })();
const idxCases = apiIndex?.cases ? Object.values(apiIndex.cases) as Array<{ coverage: string }> : [];
out(`## API plans stored`);
out();
out(`| | start of the night | now |`);
out(`|---|---:|---:|`);
out(`| tried (index) | ${BASELINE.apiStored.total} | ${idxCases.length} |`);
out(`| full | ${BASELINE.apiStored.full} | ${idxCases.filter((x) => x.coverage === "full").length} |`);
out(`| partial | ${BASELINE.apiStored.partial} | ${idxCases.filter((x) => x.coverage === "partial").length} |`);
out(`| none | ${BASELINE.apiStored.none} | ${idxCases.filter((x) => x.coverage === "none").length} |`);
out(`| stored plans that speak for their case | — | ${speaks} of ${ap.length} |`);
out();

// ── screen-case plans ────────────────────────────────────────────────────────
const prepDir = join(here, "..", "data", "compiled-plans", "ui-prepared");
const prep = { total: 0, full: 0, partial: 0, none: 0 };
if (existsSync(prepDir)) for (const f of readdirSync(prepDir)) {
  if (!f.endsWith(".json") || f.startsWith("_")) continue;
  try { const m = JSON.parse(readFileSync(join(prepDir, f), "utf8")).meta; if (m?.coverage) { prep.total++; (prep as any)[m.coverage]++; } } catch { /* skip */ }
}
out(`## Screen-case plans (UI-…)`);
out();
out(`start of the night: ${BASELINE.uiPrepared.total} stored (full ${BASELINE.uiPrepared.full} · partial ${BASELINE.uiPrepared.partial} · none ${BASELINE.uiPrepared.none}) → now ${prep.total} (full ${prep.full} · partial ${prep.partial} · none ${prep.none})`);
out();

// ── the browser runs of the night ────────────────────────────────────────────
out(`## Browser runs tonight (Test sheets)`);
out();
const tally: Record<string, number> = {};
const fails: string[] = [];
let ranCases = 0;
const runs = listSheetRuns(500).filter((r) => r.startedAt >= SINCE);
for (const r of runs) {
  const full = loadSheetRun(r.id);
  for (const c of full?.cases ?? []) {
    ranCases++;
    tally[c.status] = (tally[c.status] ?? 0) + 1;
    if (c.status === "Fail") fails.push(`${c.id} — ${c.title.slice(0, 70)}: ${String(c.why).slice(0, 140)}`);
  }
}
out(`${runs.length} run(s), ${ranCases} case(s): ${Object.entries(tally).map(([k, n]) => `${k} ${n}`).join(" · ") || "none yet"}`);
out();
if (fails.length) { out(`Fails to re-read against their evidence before anyone reports them:`); out(); for (const f of fails) out(`- ${f}`); out(); }

// ── the API batch ────────────────────────────────────────────────────────────
const sumFile = join(NIGHT, "api-run-summary.json");
if (existsSync(sumFile)) {
  try {
    const s = JSON.parse(readFileSync(sumFile, "utf8"));
    out(`## API batch (run-all-runnable)`);
    out();
    out("```");
    out(JSON.stringify(s, null, 1).slice(0, 2500));
    out("```");
    out();
  } catch { /* skip */ }
}

// ── the agents' notes ────────────────────────────────────────────────────────
for (const a of ["api-vocab", "ui-vocab", "start-states"]) {
  const f = join(NIGHT, `${a}.md`);
  if (!existsSync(f)) continue;
  out(`## Agent notes — ${a}`);
  out();
  out(readFileSync(f, "utf8").trim().slice(0, 6000));
  out();
}

const text = lines.join("\n");
const outFile = join(NIGHT, `report-${new Date().toISOString().slice(0, 10)}.md`);
writeFileSync(outFile, text);
console.log(text);
console.log(`\n(written to ${outFile})`);
process.exit(0);
