/**
 * Compile ONE case with the model and print the result — a smoke test of the
 * API test compiler and the gateway (latency, tokens, what came back).
 *   npx tsx scripts/compile-api-plans-smoke.ts API-NPRICESTG-005
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });
import { compileApiPlan } from "../src/agents/apiPlanner.js";
import { usageReport, llmMode } from "../src/ai/llm.js";

console.log("mode", llmMode());
const t0 = Date.now();
const r = await compileApiPlan({ caseId: process.argv[2] ?? "API-NPRICESTG-005" }, { llm: true, allowReason: false });
console.log(JSON.stringify({ coverage: r.coverage, source: r.source, gaps: r.gaps, errors: r.errors, warnings: r.warnings, llm: r.llm, ms: Date.now() - t0, text: r.text, plan: r.plan }, null, 1).slice(0, 5000));
console.log("usage", JSON.stringify(usageReport()));
process.exit(0);
