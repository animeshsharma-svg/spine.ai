/**
 * Run one browser plan from the terminal, through the same runner the dashboard uses
 * (src/ui/uiFlowRunner.ts: the single browser slot, live frames, spotlight pictures).
 *
 *   npx tsx scripts/ui-plan-run.ts <plan.json | '{"title":…,"steps":[…]}'> [--c 198678] [--headed]
 *
 * Prints the run's log lines (never the frames), every spotlight picture as it is taken, and
 * where the result landed. Exit code 0 when the plan passed.
 */
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
const { runUiPlan, readPlanResult } = await import("../src/ui/uiFlowRunner.js");

const argv = process.argv.slice(2);
const arg = (k: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const src = argv.find((a) => !a.startsWith("--") && a !== arg("c"));
if (!src) {
  console.log("usage: npx tsx scripts/ui-plan-run.ts <plan.json | json> [--c 198678] [--headed]");
  process.exit(1);
}
const plan = JSON.parse(existsSync(src) ? readFileSync(src, "utf8") : src);
const companyId = Number(arg("c") ?? 198678);
const runId = `plan-${Date.now().toString(36)}`;
const t = () => new Date().toISOString().slice(11, 19);
console.log(`[${t()}] run ${runId} · ${plan.title} · ${plan.steps?.length ?? 0} step(s) · company ${companyId}`);

const code = await new Promise<number>((resolve) => {
  runUiPlan({ plan, companyId, runId, headed: argv.includes("--headed") }, (e: any) => {
    if (e.type === "frame") return;
    if (e.type === "spot") return console.log(`[${t()}] 📸 ${e.spot.action} · ${e.spot.target} → ${e.spot.file}`);
    if (e.type === "log") return console.log(`[${t()}] ${String(e.line).slice(0, 220)}`);
    if (e.type === "queued") return console.log(`[${t()}] ${e.line}`);
    if (e.type === "done" || e.type === "run-error") {
      const r: any = readPlanResult(runId);
      console.log(`[${t()}] ${e.type} exit=${e.exitCode ?? "?"} passed=${r?.passed ?? "?"}`);
      for (const s of r?.steps ?? []) console.log(`   ${s.status === "ok" ? "✓" : s.status === "failed" ? "✗" : "·"} ${s.step} ${s.detail ? `— ${String(s.detail).slice(0, 140)}` : ""}${s.spotlights?.length ? ` [${s.spotlights.length} picture(s)]` : ""}`);
      console.log(`result: procol-ui-tests/.plans/${runId}-result.json`);
      resolve(r?.passed ? 0 : 1);
    }
  });
});
process.exit(code);
