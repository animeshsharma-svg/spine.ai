/**
 * Explore the important flows (src/checks/flowExplore.ts): click everything, then switch each deciding company
 * setting and look again; write the explored cases sheet and the questions.
 *
 *   npx tsx scripts/explore-flows.ts                       # every flow, with settings switched
 *   npx tsx scripts/explore-flows.ts --flows bid-rfq,closed-qcs --no-variants
 *   npx tsx scripts/explore-flows.ts --sheet-only          # rebuild the sheet from what was already explored
 */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, "..", ".env") });
loadEnv({ path: join(here, "..", "..", "procol test", ".env") });
loadEnv({ path: join(here, "..", "..", "procol-ui-tests", ".env") });
const { FLOWS, exploreFlow, writeExploredSheet, loadFlowResult } = await import("../src/checks/flowExplore.js");
const { restorePendingSettings } = await import("../src/checks/companySettings.js");

const args = process.argv.slice(2);
const pick = args.includes("--flows") ? args[args.indexOf("--flows") + 1].split(",") : FLOWS.map((f) => f.key);
const skipDone = args.includes("--skip-done");
await restorePendingSettings().catch(() => undefined);
if (!args.includes("--sheet-only"))
  for (const flow of FLOWS.filter((f) => pick.includes(f.key))) {
    if (skipDone && loadFlowResult(flow.key)) continue;
    const t0 = Date.now();
    const r = await exploreFlow(flow, { companyId: 198678, variants: !args.includes("--no-variants"), line: (l) => console.log(`[${flow.key}] ${l}`) }).catch((e) => {
      console.log(`[${flow.key}] FAILED: ${(e as Error).message}`);
      return null;
    });
    if (r) console.log(`[${flow.key}] done in ${Math.round((Date.now() - t0) / 60000)} min — ${r.baseline.reduce((n, b) => n + b.records.length, 0)} controls, ${r.variants.length} settings switched${r.why ? ` — ${r.why}` : ""}`);
  }
const out = await writeExploredSheet(undefined, { deep: !args.includes("--no-deep") });
console.log(`\nsheet: ${out.file} — ${out.cases} cases, ${out.questions.length} questions, ${out.bugs.length} bugs`);
for (const b of out.bugs) console.log(`  ✗ ${b}`);
for (const q of out.questions) console.log(`  ? ${q}`);
process.exit(0);
