/** Launch the headed UI automation and print each step. */
import { runUiAutomation } from "../src/ui/browserRunner.js";

const companyId = Number(process.argv[2] || 198678);
const results = await runUiAutomation(companyId, (e) => {
  const tag = e.status === "check" ? "  →" : e.status === "shot" ? "  📸" : "•";
  console.log(`${tag} ${e.title}`);
});
console.log("\n==== UI checks ====");
for (const r of results) console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.id}  ${r.scenario}  ::  ${r.observed}`);
