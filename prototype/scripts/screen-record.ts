/**
 * Turn a run's screen inventories into screen-library records (src/agents/screenModel.ts):
 * copy the pictures, ground the code rules, describe every control, write cases, save the
 * memory page.
 *
 *   npx tsx scripts/screen-record.ts <…inventory.json> [--c 198678] [--no-cases] [--max 6]
 *   npx tsx scripts/screen-record.ts --run plan-mvh1fiaf        every inventory of that run
 *   npx tsx scripts/screen-record.ts --all                       every inventory under evidence/
 *   npx tsx scripts/screen-record.ts --fill-cases                every library screen that has no cases yet
 *                                                                (its controls stay as described; only cases are written)
 */
import { config } from "dotenv";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "45000";
const { recordScreen, listScreens, getScreen } = await import("../src/agents/screenModel.js");

const argv = process.argv.slice(2);
const arg = (k: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flag = (k: string) => argv.includes(`--${k}`);
const EVIDENCE = join(here, "..", "..", "procol-ui-tests", "evidence");
const t = () => new Date().toISOString().slice(11, 19);

function inventoriesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...inventoriesUnder(p));
    else if (f.endsWith(".inventory.json")) out.push(p);
  }
  return out.sort();
}

let files = argv.filter((a) => a.endsWith(".inventory.json"));
if (arg("run")) files = inventoriesUnder(join(EVIDENCE, arg("run")!));
if (flag("all")) files = inventoriesUnder(EVIDENCE);
const fillCases = flag("fill-cases");
const reachOf = new Map<string, Array<{ step: string; args?: Record<string, unknown> }>>();
if (fillCases) {
  files = [];
  for (const s of listScreens()) {
    if (s.cases > 0) continue;
    const r = getScreen(s.id);
    if (r?.evidence.inventory && existsSync(r.evidence.inventory)) {
      files.push(r.evidence.inventory);
      reachOf.set(r.evidence.inventory, r.reachedBy);
    }
  }
  console.log(`[${t()}] ${files.length} screen(s) without cases`);
}
if (!files.length) {
  console.log("usage: npx tsx scripts/screen-record.ts <…inventory.json> | --run <runId> | --all | --fill-cases   [--c 198678] [--no-cases] [--max 6]");
  process.exit(fillCases ? 0 : 1);
}
const seen: Array<{ id: string; title: string }> = [];
for (const f of files) {
  console.log(`[${t()}] ${f.replace(EVIDENCE + "/", "")}`);
  const r = await recordScreen(f, { companyId: Number(arg("c") ?? 198678), cases: !flag("no-cases"), effects: !fillCases, reachedBy: reachOf.get(f), maxCases: Number(arg("max") ?? 6), seen, onLine: (l) => console.log(`[${t()}]   ${l}`) }).catch((e) => {
    console.log(`[${t()}]   failed: ${(e as Error).message}`);
    return null;
  });
  if (r) console.log(`[${t()}]   → ${r.id}: ${r.controls.length} controls, ${r.effects.filter((e) => e.confidence !== "unknown").length} described, ${r.cases.length} cases · data/screens/${r.id}.json`);
}
process.exit(0);
