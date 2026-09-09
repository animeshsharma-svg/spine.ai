/** Run the multi-company (company switcher) API automation.
 *   npm run multi-company                         # sandbox (uses SANDBOX_* env)
 *   npm run multi-company -- https://sec-api-v1.ag-ri.in/api 16297   # dry-run vs UAT (skips: feature absent)
 *
 * Env (put in prototype/.env): SANDBOX_ACCESS_TOKEN=<procol_access_token from the logged-in preview>
 *   (or SANDBOX_APP_KEY + SANDBOX_APP_SECRET), SANDBOX_USER_ID, SANDBOX_APP_VERSION.
 */
import { runMultiCompanyChecks } from "./flows/multiCompanyChecks.js";

const SANDBOX = "https://procol-sandbox-demo-rfx-qa.ag-ri.in/api";
const baseUrl = process.argv[2] || process.env.SANDBOX_BASE_URL || SANDBOX;
const userId = Number(process.argv[3] || process.env.SANDBOX_USER_ID || 16297);

console.error(`\n⏳ Multi-company checks · env=${baseUrl} · user=${userId}`);
console.error(`   auth: ${process.env.SANDBOX_ACCESS_TOKEN ? "SANDBOX_ACCESS_TOKEN" : process.env.SANDBOX_APP_KEY ? "SANDBOX_APP_KEY/SECRET" : "default UAT console keys (dry-run)"}\n`);

const results = await runMultiCompanyChecks({
  baseUrl,
  userId,
  accessToken: process.env.SANDBOX_ACCESS_TOKEN,
  appKey: process.env.SANDBOX_APP_KEY,
  appSecret: process.env.SANDBOX_APP_SECRET,
  appVersion: process.env.SANDBOX_APP_VERSION,
});

let pass = 0;
for (const r of results) {
  if (r.pass) pass++;
  console.log(`${r.pass ? "PASS" : r.verdict.startsWith("SKIPPED") ? "SKIP" : "FAIL"}  ${r.id}  [${r.category}]  ${r.scenario}`);
  console.log(`      → ${r.verdict}`);
}
console.log(`\n==== ${pass}/${results.length} passed ====`);
