/**
 * Run a flow (or the capability map) from the command line, print JSON.
 *
 *   npx tsx src/cli-run-flow.ts events.rfp_only 198678
 *   npx tsx src/cli-run-flow.ts vendor.discovery 198678
 *   npx tsx src/cli-run-flow.ts --map 198678
 *
 * This is a hand-testing tool for Day 2. The AI agents will call the same
 * functions in executor.ts directly (not through this CLI).
 */
import { runFlow, getCapabilityMap, openClientContext } from "./executor.js";
import { runPhoneValidation } from "./flows/validationRunner.js";
import { DEFAULT_CLIENT } from "../config/settings.js";

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--validate") {
    const companyId = Number(args[1] ?? DEFAULT_CLIENT.companyId);
    console.error(`\n⏳ Probing phone-field validation for client ${companyId}…\n`);
    const client = await openClientContext(companyId);
    try {
      const results = await runPhoneValidation(client.ctx.buyerApi);
      console.log(JSON.stringify(results, null, 2));
    } finally {
      await client.dispose().catch(() => {});
    }
    return;
  }

  if (args[0] === "--map") {
    const companyId = Number(args[1] ?? DEFAULT_CLIENT.companyId);
    console.error(`\n⏳ Loading capability map for client ${companyId}…\n`);
    const map = await getCapabilityMap(companyId);
    console.log(JSON.stringify(map, null, 2));
    return;
  }

  const flowId = args[0];
  const companyId = Number(args[1] ?? DEFAULT_CLIENT.companyId);
  if (!flowId) {
    console.error("Usage: tsx src/cli-run-flow.ts <flowId> [companyId]");
    console.error("       tsx src/cli-run-flow.ts --map [companyId]");
    process.exit(1);
  }

  console.error(`\n⏳ Running "${flowId}" for client ${companyId} against UAT…\n`);
  const result = await runFlow(flowId, companyId);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === "failed" ? 1 : 0);
}

main().catch((err) => {
  console.error("Executor crashed:", err);
  process.exit(1);
});
