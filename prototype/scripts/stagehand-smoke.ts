/**
 * Phase-1 smoke test for the Stagehand self-healing UI layer.
 * Run: npm run ui:stagehand
 * Needs GOOGLE_API_KEY in prototype/.env (free from aistudio.google.com).
 */
import { runStagehandProof, hasStagehandKey } from "../src/ui/stagehandRunner.js";

if (!hasStagehandKey()) {
  console.log(
    "\n⚠  No GOOGLE_API_KEY yet.\n" +
      "   1. aistudio.google.com → Get API key → Create API key (free, no billing)\n" +
      "   2. paste it into prototype/.env as  GOOGLE_API_KEY=...\n" +
      "   3. re-run:  npm run ui:stagehand\n",
  );
  process.exit(0);
}

const results = await runStagehandProof((e) => {
  console.log(`${e.status.toUpperCase().padEnd(9)} ${e.title}`);
});
const pass = results.filter((r) => r.pass).length;
console.log(`\n==== ${pass}/${results.length} Stagehand primitives worked ====`);
