/** Run the orchestrator and print the detailed test cases it designed. */
import { runOrchestrator } from "../src/agents/orchestrator.js";

const q = process.argv[2] || "Create and award an RFQ event for this client, and try to break the inputs";
const companyId = Number(process.argv[3] || 198678);

const { state, provider } = await runOrchestrator(q, companyId);
console.log("\nPROVIDER:", provider);
console.log("REQUEST :", q);
console.log("CASES   :", (state.cases ?? []).length, "\n" + "=".repeat(70));
for (const c of state.cases ?? []) {
  console.log(`\n[${c.id}]  ${c.category}  ·  ${c.priority}/${c.severity}  ·  ${c.role}`);
  console.log(`  ${c.module}${c.component ? " › " + c.component : ""}  —  ${c.scenario}`);
  console.log(`  Pre : ${c.preconditions}`);
  console.log(`  Step: ${c.steps.join("  ")}`);
  console.log(`  Data: ${c.testData}`);
  console.log(`  Exp : ${c.expectedResult}`);
}
console.log("\n" + "=".repeat(70) + "\nREPORT:", state.report?.headline);
