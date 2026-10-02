import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STEP_CATALOG, STEP_NAMES } from "../src/plan/steps.js";

/**
 * Publish the step vocabulary as JSON.
 *
 * The planner lives in the sibling `prototype` package, which cannot import
 * TypeScript across the project boundary. Rather than let the two drift — a
 * planner offering a step the executor does not have produces a plan that dies
 * on step one — the vocabulary is written out here and read there.
 */
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "plan-catalog.json");
writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), steps: STEP_CATALOG, names: STEP_NAMES }, null, 2));
console.log(`wrote ${out} — ${STEP_NAMES.length} steps`);
