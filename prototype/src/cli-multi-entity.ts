/** Run the multi-entity (vendor entity mapping) API automation. Safe/read + negatives only.
 *   npm run multi-entity -- 56777
 */
import { runMultiEntityChecks } from "./flows/multiEntityChecks.js";

const companyId = Number(process.argv[2] || 56777);
console.error(`\n⏳ Running multi-entity API checks for company ${companyId} (safe cases only)…\n`);
const results = await runMultiEntityChecks(companyId);
let pass = 0;
for (const r of results) {
  r.pass ? pass++ : null;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id}  [${r.category}/${r.severity}]  ${r.scenario}`);
  console.log(`      → ${r.verdict}`);
}
console.log(`\n==== ${pass}/${results.length} passed ====`);
