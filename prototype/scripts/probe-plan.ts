/**
 * Run a hand-written step list live (debugging a step on the real screen) and print each
 * step's result. Optional --state builds that event state through the API first (QA vendors only).
 *   npx tsx scripts/probe-plan.ts --steps '[{"step":"open_create","args":{"path":"erfx"}}]' [--state live] [--c 198678]
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
const { buildUiState } = await import("../src/ui/uiSetup.js");
const { runUiPlan } = await import("../src/ui/uiFlowRunner.js");
const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const COMPANY = Number(arg("c") ?? 198678);
const steps = JSON.parse(arg("steps") ?? "[]");
const state = arg("state");
let context: any;
if (state && state !== "none") {
  const b: any = await buildUiState(COMPANY, state as any, {});
  if (!b.ok) {
    console.log(`could not build ${state}: ${b.why}`);
    process.exit(1);
  }
  const x = b.context;
  context = { state: x.state, eventGroupUuid: x.eventGroupUuid, stageUuid: x.stageUuid, technicalStageUuid: x.technicalStageUuid, proposalUuid: x.made?.proposalUuid, title: x.title, vendorName: x.vendorName, vendorEmail: x.vendorEmail, values: x.values, buyerUserId: x.buyerUserId };
}
await new Promise<void>((resolve) => {
  runUiPlan({ plan: { title: "probe", steps, ...(context ? { context } : {}) }, companyId: COMPANY, runId: `probe-${Date.now().toString(36)}`, headed: false }, (e: any) => {
    if (e.type === "log" && /\[plan\]|\[probe\]|\[reschedule\]|\[create-event\]|Error:|intercepts|waiting for/.test(e.line ?? "")) console.log(String(e.line).trim().slice(0, 900));
    if (e.type === "done" || e.type === "run-error") {
      console.log(`exit ${e.exitCode ?? "?"}`);
      resolve();
    }
  });
});
process.exit(0);
