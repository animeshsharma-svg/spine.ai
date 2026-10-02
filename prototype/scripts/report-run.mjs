/**
 * Turn a saved /api/features-run SSE log into a readable report.
 *
 *   node scripts/report-run.mjs <path-to-log>
 *
 * Prints, in order: the headline tally, every DEFECT grouped by kind (server
 * errors first — a 5xx is always a defect), the inconclusive checks with the
 * reason they could not judge, per-feature coverage, and what was skipped.
 */
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/report-run.mjs <log>");
  process.exit(1);
}

const checks = [];
let plan = null;
for (const line of readFileSync(file, "utf8").split("\n")) {
  if (!line.startsWith("data: ")) continue;
  let obj;
  try {
    obj = JSON.parse(line.slice(6));
  } catch {
    continue;
  }
  if (obj.check) checks.push(obj.check);
  else if (obj.features && obj.cases !== undefined) plan = obj;
}

const passed = checks.filter((c) => c.pass);
const inconc = checks.filter((c) => c.inconclusive);
const failed = checks.filter((c) => !c.pass && !c.inconclusive);
const serverErrors = failed.filter((c) => (c.httpStatus ?? 0) >= 500);
const gaps = failed.filter((c) => (c.httpStatus ?? 0) < 500);

const bar = "─".repeat(74);
console.log(bar);
console.log("SPINE.AI — LIVE RUN REPORT");
console.log(bar);
if (plan) console.log(`cases in scope: ${plan.cases}   runnable: ${plan.runnable}   skipped: ${plan.skipped.length}`);
console.log(
  `executed: ${checks.length}   ✓ passed: ${passed.length}   ✗ failed: ${failed.length}   ≈ inconclusive: ${inconc.length}`,
);

if (serverErrors.length) {
  console.log(`\n${bar}\nSERVER ERRORS (${serverErrors.length}) — a 5xx is always a defect\n${bar}`);
  for (const c of serverErrors) {
    console.log(`  ${c.id}  [${c.severity}]  ${c.scenario}`);
    console.log(`      ${c.method ?? ""} ${c.inputSummary}`.slice(0, 118));
    if (c.expectedResult) console.log(`      expected: ${String(c.expectedResult).slice(0, 104)}`);
  }
}

if (gaps.length) {
  console.log(`\n${bar}\nVALIDATION GAPS (${gaps.length}) — accepted something it should refuse\n${bar}`);
  for (const c of gaps) {
    console.log(`  ${c.id}  [${c.severity}]  ${c.scenario}`);
    console.log(`      ${c.verdict}`.slice(0, 118));
  }
}

if (inconc.length) {
  console.log(`\n${bar}\nINCONCLUSIVE (${inconc.length}) — refused for a different reason; NOT bugs\n${bar}`);
  for (const c of inconc) console.log(`  ${c.id}  ${c.scenario}`.slice(0, 118));
}

// Per-feature roll-up.
const byFeature = {};
for (const c of checks) {
  const f = (byFeature[c.flowId] ??= { pass: 0, fail: 0, inc: 0 });
  c.inconclusive ? f.inc++ : c.pass ? f.pass++ : f.fail++;
}
console.log(`\n${bar}\nPER-FEATURE RESULTS\n${bar}`);
for (const [f, s] of Object.entries(byFeature).sort()) {
  const flag = s.fail ? "✗" : s.inc ? "≈" : "✓";
  console.log(`  ${flag} ${f.padEnd(28)} ${s.pass} passed  ${s.fail} failed  ${s.inc} inconclusive`);
}

if (plan?.skipped?.length) {
  const reasons = {};
  for (const s of plan.skipped) reasons[s.reason] = (reasons[s.reason] ?? 0) + 1;
  console.log(`\n${bar}\nSKIPPED (${plan.skipped.length}) — could not run here, and why\n${bar}`);
  for (const [r, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}x  ${r}`);
}
console.log();
