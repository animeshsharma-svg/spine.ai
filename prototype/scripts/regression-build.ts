/**
 * Build the regression suite index (data/regression/suite.json) from the three case stores and print what it holds.
 *   npx tsx scripts/regression-build.ts            build and summarise
 *   npx tsx scripts/regression-build.ts --sample   also print a few rows per module, in plain words
 */
import { buildSuite, STAGES } from "../src/regression/suite.js";

const t0 = Date.now();
const s = buildSuite();
const pad = (x: string | number, n: number) => String(x).padStart(n);
console.log(`${s.counts.total} cases (${s.counts.ui} UI, ${s.counts.api} API) in ${Math.round((Date.now() - t0) / 100) / 10}s`);
console.log(`by source   ${Object.entries(s.counts.bySource).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`runnable    ${Object.entries(s.counts.byRunnable).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`by stage    ${Object.entries(s.counts.byStage).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`by priority ${Object.entries(s.counts.byPriority).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log("\nmodules:");
for (const m of s.modules) {
  const other = m.features.find((f) => f.id.endsWith(".other"))?.count ?? 0;
  console.log(`  ${pad(m.step ?? "-", 2)}  ${pad(m.count, 5)}  ${m.label}${other ? `  (${other} under "other")` : ""}`);
}
console.log("\nset-up chain:");
for (const n of s.setup) console.log(`  ${pad(n.count, 5)}  ${n.state.padEnd(18)} ← ${n.needs ? n.needs.slice(6) : "nothing"}  · ${STAGES[n.stage]}  · ${n.label}${n.caseId ? `  [${n.caseId}]` : ""}`);
if (process.argv.includes("--sample")) {
  for (const m of s.modules) {
    const rows = s.cases.filter((c) => c.module === m.id).slice(0, 3);
    if (!rows.length) continue;
    console.log(`\n── ${m.label}`);
    for (const c of rows) console.log(`  ${c.id} [${c.layer} ${c.priority} ${c.kind} ${c.runnable}${c.state ? ` from:${c.state}` : ""}] ${c.title}\n     steps: ${c.steps.slice(0, 3).join(" / ").slice(0, 220)}\n     expect: ${c.expected.slice(0, 160)}`);
  }
}
