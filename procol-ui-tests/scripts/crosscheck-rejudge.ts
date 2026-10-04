/**
 * Re-judge a finished cross-check run OFFLINE: re-reads its captured network
 * and screen snapshots and runs the current maps again. No browser, no Procol
 * call — used to check a map change against evidence already collected.
 *
 *   npx tsx scripts/crosscheck-rejudge.ts <runId> [screenKeyFilter]
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CROSSCHECK_DIR } from "../src/crosscheck/report.js";
import { loadMaps, type Vars } from "../src/crosscheck/fieldMap.js";
import { runScreen } from "../src/crosscheck/engine.js";

const [runId, filter] = process.argv.slice(2);
const dir = join(CROSSCHECK_DIR, runId);
const rec = JSON.parse(readFileSync(join(dir, "result.json"), "utf8"));
const net = JSON.parse(readFileSync(join(dir, "network.json"), "utf8"));
const maps = loadMaps();
for (const sc of rec.screens as Array<{ key: string; map: string }>) {
  if (filter && !sc.key.includes(filter)) continue;
  const file = join(dir, "screens", `${sc.key.replace(/[^a-z0-9@_-]+/gi, "_")}.json`);
  let snap;
  try {
    snap = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    continue;
  }
  const ev = net.find((r: any) => r.screen === "summary" && /^\/api\/event_groups\/[^/?]+$/.test(r.path))?.body ?? {};
  const st = (ev.stages ?? []).find((s: any) => sc.key.endsWith(`@${s.ref_id}`));
  const vars: Vars = { eventUuid: rec.event.uuid, title: rec.event.title, stage0Title: ev.stages?.[0]?.title?.trim(), stage1Title: ev.stages?.[1]?.title?.trim(), stageUuid: st?.uuid, proposalUuid: sc.key.startsWith("proposal@") ? sc.key.slice(9).replace(/_$/, "=") : undefined };
  const extra = sc.map === "responses" ? (["rfp", "rfi"].includes(st?.rfx_mode) ? ["technical"] : ["standings"]) : [];
  for (const m of maps.filter((x) => [sc.map, ...extra].includes(x.screen))) {
    for (const r of runScreen(m, sc.key, snap, net, vars, [], {})) {
      if (r.case === "UI-XCHK-050") continue;
      console.log(`${r.case} ${sc.key}: ${r.verdict} — ${r.reason}`);
      for (const f of r.findings) console.log(`   ✗ ${f.title.slice(0, 220)}`);
    }
  }
}
void readdirSync;
