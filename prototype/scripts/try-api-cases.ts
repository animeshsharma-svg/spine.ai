import { runApiCases } from "../src/checks/apiCaseRunner.js";
const ids = process.argv.slice(2);
await runApiCases(
  ids.length ? ids : ["BE-1.1", "BE-1.2", "BE-3.1"],
  (r) => {
    const badge = r.status === "passed" ? "PASS" : r.status === "failed" ? "FAIL" : "SKIP";
    console.log(`${badge}  ${r.id}  ${r.method ?? ""} ${r.path ?? ""}  ${r.httpStatus ?? ""} (want ${r.expectedStatus ?? "?"})  ${Math.round(r.durationMs)}ms`);
    if (r.message) console.log(`      ${r.message.slice(0, 200)}`);
    if (r.reason) console.log(`      skipped: ${r.reason.slice(0, 200)}`);
  },
  (l) => console.log(`  · ${l}`),
);
