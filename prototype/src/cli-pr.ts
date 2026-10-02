/**
 * Read a PR and generate its test plan.
 *   npm run pr -- backend 15221
 *   npm run pr -- frontend 5629
 */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });
import { readPr, analyzePr } from "./pr/prReader.js";

async function main() {
  const [repo, num] = process.argv.slice(2);
  if (!repo || !num) {
    console.error("Usage: tsx src/cli-pr.ts <backend|frontend> <prNumber>");
    process.exit(1);
  }
  console.error(`\n📖 Reading ${repo} PR #${num} from local git (read-only)…`);
  const pr = readPr(repo, num);
  console.log(`\nPR #${pr.number} — ${pr.subject}`);
  console.log(`commit ${pr.hash.slice(0, 10)} · ${pr.files.length} files changed`);
  console.error(`🤖 Analysing the diff…\n`);

  const a = await analyzePr(pr);
  console.log(`\n${"═".repeat(70)}\nFEATURE: ${a.feature}\n${a.summary}\n`);
  if (a.configFlags.length) console.log(`Config flags: ${a.configFlags.join(", ")}`);
  if (a.endpoints.length) {
    console.log(`\nEndpoints:`);
    for (const e of a.endpoints) console.log(`  ${e.method} ${e.path}  — ${e.note}`);
  }
  if (a.affectedFlows.length) console.log(`\nRegression-test: ${a.affectedFlows.join("; ")}`);

  console.log(`\n${"═".repeat(70)}\nTEST CASES (${a.testCases.length}) · provider ${a.provider}\n`);
  for (const c of a.testCases) {
    console.log(`[${c.id}] ${c.category} · ${c.priority}/${c.severity} · ${c.role}`);
    console.log(`  ${c.module}${c.component ? " › " + c.component : ""} — ${c.scenario}`);
    console.log(`  Pre : ${c.preconditions}`);
    console.log(`  Step: ${c.steps.join("  ")}`);
    console.log(`  Data: ${c.testData}`);
    console.log(`  Exp : ${c.expectedResult}\n`);
  }
}

main().catch((e) => {
  console.error("PR-reader error:", e.message ?? e);
  process.exit(1);
});
