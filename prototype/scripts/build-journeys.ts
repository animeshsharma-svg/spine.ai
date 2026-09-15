import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildJourneys } from "../src/checks/journeys.js";

/**
 * Dump the derived journeys to data/journeys.json — for sharing, and as a
 * static fallback. `npm run cases:journeys` (also runs after cases:import).
 */
const here = dirname(fileURLToPath(import.meta.url));
const { journeys, orphans } = buildJourneys();
const total = journeys.reduce((n, j) => n + j.counts.total, 0);
for (const j of journeys) {
  console.log(
    `${String(j.order).padStart(2)}. ${j.title.padEnd(34)} ${j.persona.padEnd(16)} ` +
      `cases:${String(j.counts.total).padStart(3)} (ui ${j.counts.ui}, api ${j.counts.api}, runnable ${j.counts.runnable})`,
  );
}
console.log(`\nTOTAL placed: ${total} · orphans: ${orphans.length}${orphans.length ? " → " + orphans.slice(0, 10).join(", ") : ""}`);
writeFileSync(join(here, "..", "data", "journeys.json"), JSON.stringify({ generatedAt: new Date().toISOString(), journeys, orphans }, null, 2));
console.log("Wrote data/journeys.json");
