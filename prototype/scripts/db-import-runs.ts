/**
 * Copy every run already saved under data/runs into spine.ai's database.
 *
 *   npm run db:import-runs
 *
 * Safe to repeat: a run already there is replaced, not duplicated. New runs are
 * copied automatically when they are saved; this is for the ones from before.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { importRuns } from "../src/db/runHistory.js";
import { closeSpineDb } from "../src/db/spineDb.js";
import type { RunRecord } from "../src/runStore.js";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "runs");
const recs: RunRecord[] = [];
let skipped = 0;
for (const f of readdirSync(RUNS).filter((n) => n.endsWith(".json")).sort()) {
  try {
    const r = JSON.parse(readFileSync(join(RUNS, f), "utf8")) as RunRecord;
    if (r?.id && r?.ts) recs.push(r);
    else skipped++;
  } catch {
    skipped++;
  }
}
try {
  const { runs, results } = await importRuns(recs);
  console.log(`Imported ${runs} runs with ${results} results${skipped ? ` (${skipped} unreadable file(s) skipped)` : ""}.`);
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeSpineDb();
}
