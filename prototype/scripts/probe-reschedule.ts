/**
 * Live probe of the reschedule_event step on a fresh UPCOMING event built through the API
 * (QA vendors only): a past start must be refused, a later start must save.
 *   npx tsx scripts/probe-reschedule.ts [--c 198678]
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
const { buildUiState } = await import("../src/ui/uiSetup.js");
const { runUiPlan } = await import("../src/ui/uiFlowRunner.js");
const i = process.argv.indexOf("--c");
const COMPANY = Number(i >= 0 ? process.argv[i + 1] : 198678);

const b: any = await buildUiState(COMPANY, "upcoming" as any, {});
if (!b.ok) {
  console.log(`could not build the upcoming state: ${b.why}`);
  process.exit(1);
}
const x = b.context;
const context = { state: x.state, eventGroupUuid: x.eventGroupUuid, stageUuid: x.stageUuid, title: x.title, vendorName: x.vendorName, vendorEmail: x.vendorEmail, values: x.values };
const plan = {
  title: "probe reschedule_event",
  context,
  steps: [
    { step: "open_prepared", args: { screen: "summary" } },
    { step: "reschedule_event", args: { start: "-30m", expect: "refused", message: "Scheduled time is invalid" } },
    { step: "reschedule_event", args: { start: "-2d", expect: "refused" } },
    { step: "reschedule_event", args: { start: "+3h" } },
  ],
};
await new Promise<void>((resolve) => {
  runUiPlan({ plan, companyId: COMPANY, runId: `probe-${Date.now().toString(36)}`, headed: false }, (e: any) => {
    if (e.type === "log" && /\[plan\]|\[reschedule\]|Error|✗/.test(e.line ?? "")) console.log(String(e.line).trim().slice(0, 260));
    if (e.type === "done" || e.type === "run-error") {
      console.log(`exit ${e.exitCode ?? "?"}`);
      resolve();
    }
  });
});
process.exit(0);
