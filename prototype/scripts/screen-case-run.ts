/**
 * Run screen cases from the terminal exactly as the Screens page does: the case's plan (compiled
 * for the state its screen needs), the event the API builds for that state, the browser with the
 * spotlight on.
 *
 *   npx tsx scripts/screen-case-run.ts GEN-SCR-012 [GEN-SCR-040 …] [--c 198678] [--screen <id>]
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "45000";
const { planForScreenCase } = await import("../src/agents/screenModel.js");
const { buildUiState } = await import("../src/ui/uiSetup.js");
const { runUiPlan, readPlanResult } = await import("../src/ui/uiFlowRunner.js");

const argv = process.argv.slice(2);
const arg = (k: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const ids = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--c" && argv[i - 1] !== "--screen");
const companyId = Number(arg("c") ?? 198678);
const t = () => new Date().toISOString().slice(11, 19);
if (!ids.length) {
  console.log("usage: npx tsx scripts/screen-case-run.ts <GEN-SCR-…> [...] [--c 198678] [--screen <id>]");
  process.exit(1);
}
let failed = 0;
for (const id of ids) {
  console.log(`[${t()}] ${id}`);
  const r = await planForScreenCase(id, arg("screen"), (l) => console.log(`[${t()}]   ${l}`));
  if (r.why || !r.plan?.steps?.length) {
    console.log(`[${t()}]   ✗ ${r.why ?? "no plan"}`);
    failed++;
    continue;
  }
  console.log(`[${t()}]   plan (${r.coverage}): ${(r.plan.steps as Array<{ step: string }>).map((s) => s.step).join(" → ")}`);
  let context: Record<string, unknown> | undefined;
  if (r.prep?.prepared) {
    console.log(`[${t()}]   building a "${r.prep.state}" event by API…`);
    const b: any = await buildUiState(companyId, r.prep.state, { technical: r.prep.technical, onLine: (l) => console.log(`[${t()}]     ${l}`) }).catch((e) => ({ ok: false, why: (e as Error).message }));
    const x = b.ok ? b.context : null;
    if (!x) {
      console.log(`[${t()}]   ✗ the API could not build the ${r.prep.state} state: ${b.why}`);
      failed++;
      continue;
    }
    context = { state: x.state, eventGroupUuid: x.eventGroupUuid, stageUuid: x.stageUuid, technicalStageUuid: x.technicalStageUuid, proposalUuid: x.made?.proposalUuid, title: x.title, vendorName: x.vendorName, vendorEmail: x.vendorEmail, values: x.values, buyerUserId: x.buyerUserId };
    console.log(`[${t()}]   event ready: "${x.title ?? x.eventGroupUuid}"${x.vendorName ? ` · vendor ${x.vendorName}` : ""}`);
  }
  const runId = `scrcase-${id.toLowerCase()}-${Date.now().toString(36)}`;
  const result: any = await new Promise((resolve) => {
    runUiPlan({ plan: { ...r.plan, ...(context ? { context } : {}) }, companyId, runId, headed: false }, (e: any) => {
      if (e.type === "spot") console.log(`[${t()}]   📸 ${e.spot.action} · ${e.spot.target}`);
      const line = String(e.line ?? "");
      if (e.type === "log" && /\[plan\] \d+\/\d+ /.test(line)) console.log(`[${t()}]   ${line.replace(/^.*\[plan\]\s*/, "").slice(0, 220)}`);
      if (e.type === "done" || e.type === "run-error") resolve(readPlanResult(runId));
    });
  });
  const ok = result?.steps?.filter((s: any) => s.status === "ok").length ?? 0;
  console.log(`[${t()}]   ${result?.passed ? "✓ passed" : "✗ failed"} — ${ok}/${result?.steps?.length ?? "?"} steps · evidence procol-ui-tests/evidence/${runId}/`);
  if (!result?.passed) failed++;
}
process.exit(failed ? 1 : 0);
