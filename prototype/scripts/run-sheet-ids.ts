/**
 * Run sheet cases by id through the real sheet runner (start state, settings, stored plan, verdict) — the quickest
 * proof that a newly runnable case really runs.   npx tsx scripts/run-sheet-ids.ts SRC-NEG-024 EXP-CREATEMENU-024
 * Company 198678 (PROCOL DEMO). One browser: wait for any other Playwright run first.
 */
import "dotenv/config";
import { sheetCases } from "../src/checks/sheetCases.js";
import { runSheetCases } from "../src/checks/sheetRunner.js";
const ids = process.argv.slice(2);
const all = sheetCases();
const picked = ids.map((id) => all.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
const run = await runSheetCases(picked, {
  companyId: 198678, sheet: picked[0].sheet, repair: false,
  emit: (e: any) => { if (e.type === "line") console.log(`  ${e.id} · ${e.line}`); if (e.type === "case-start") console.log(`▶ ${e.id} ${e.title}`); if (e.type === "case-done") console.log(`■ ${e.result.id} ${e.result.status} — ${e.result.why}\n   steps: ${e.result.steps.map((s: any) => `${s.n}.${s.words} [${s.outcome}]`).join(" | ").slice(0, 1500)}`); },
});
console.log("RUN", run.id, run.cases.map((c) => `${c.id}=${c.status}`).join(" "));
process.exit(0);
