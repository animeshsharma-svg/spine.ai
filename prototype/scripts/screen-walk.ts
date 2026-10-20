/**
 * Walk the events flow from the terminal (src/agents/screenWalk.ts): the browser goes through
 * the flow, photographs every section, and each screen becomes knowledge and test cases.
 *
 *   npx tsx scripts/screen-walk.ts [--c 198678] [--walks list,create-erfx,single-stage] [--no-cases] [--max 6]
 *   npx tsx scripts/screen-walk.ts --list
 *
 * The same walk can be started from the dashboard (#/screens); this prints what that page shows.
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "45000";
const { startWalk, subscribeWalk, WALKS } = await import("../src/agents/screenWalk.js");

const argv = process.argv.slice(2);
const arg = (k: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
if (argv.includes("--list")) {
  for (const w of WALKS) console.log(`${w.id.padEnd(14)} ${w.title} — ${w.steps.filter((s) => s.step === "inventory_screen").length} screens, ~${w.minutes} min${w.state !== "none" ? ` (needs a "${w.state}" event built by API)` : ""}`);
  process.exit(0);
}
const t = () => new Date().toISOString().slice(11, 19);
const r = startWalk({ companyId: Number(arg("c") ?? 198678), walks: arg("walks")?.split(",").map((s) => s.trim()).filter(Boolean), cases: !argv.includes("--no-cases"), maxCases: Number(arg("max") ?? 6) });
if (!r.id) {
  console.log(`cannot walk: ${r.why}`);
  process.exit(1);
}
console.log(`[${t()}] walk ${r.id}`);
await new Promise<void>((resolve) => {
  subscribeWalk(r.id!, (event, data: any) => {
    switch (event) {
      case "walk":
        console.log(`[${t()}] ▶ ${data.title} (${data.runId})`);
        break;
      case "progress":
        console.log(`[${t()}]   · ${data.line}`);
        break;
      case "log":
        console.log(`[${t()}]   ${data.text}`);
        break;
      case "spot":
        console.log(`[${t()}]   📸 ${data.action} · ${data.target}`);
        break;
      case "screen":
        console.log(`[${t()}] 📷 ${data.label}: ${data.controls} controls, ${data.known} described, ${data.cases} cases`);
        break;
      case "done":
        console.log(`[${t()}] ${data.status}: ${data.summary}`);
        resolve();
        break;
    }
  });
});
process.exit(0);
