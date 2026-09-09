/** Run the executable check suites live and print pass/fail — real bug discovery. */
import { openClientContext } from "../src/executor.js";
import { buildChecksForFlow, hasSuite } from "../src/checks/suites.js";
import { runCheck } from "../src/checks/engine.js";

const companyId = Number(process.argv[2] || 198678);
const flows = (process.argv[3] || "masterdata.user_permissions,masterdata.category,events.rfp_rfq,masterdata.product").split(",");

const client = await openClientContext(companyId);
let pass = 0, fail = 0;
try {
  for (const flow of flows) {
    if (!hasSuite(flow)) continue;
    const checks = await buildChecksForFlow(client, flow);
    console.log(`\n\n### ${flow} — ${checks.length} checks ###`);
    for (const c of checks) {
      const r = await runCheck(client, c);
      r.pass ? pass++ : fail++;
      const mark = r.pass ? "PASS" : "FAIL";
      console.log(`  ${mark}  ${r.id}  [${r.category}/${r.severity}]  ${r.scenario}`);
      if (!r.pass) console.log(`         → ${r.verdict}`);
    }
  }
} finally {
  await client.dispose().catch(() => {});
}
console.log(`\n==== ${pass} passed · ${fail} failed (failed = potential bug) ====`);
