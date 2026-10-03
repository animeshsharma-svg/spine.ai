import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STEP_CATALOG, STEP_NAMES } from "../src/plan/steps.js";
import { knownLabels, labelsForPrompt, seenLabels } from "../src/plan/generic/labels.js";

/**
 * Publish the step vocabulary as JSON.
 *
 * The planner lives in the sibling `prototype` package, which cannot import
 * TypeScript across the project boundary. Rather than let the two drift — a
 * planner offering a step the executor does not have produces a plan that dies
 * on step one — the vocabulary is written out here and read there.
 *
 * The labels the product is KNOWN to render (read from its source, plus those
 * generic steps found on live screens) travel with it: the compiler uses them
 * to tell a generic step that names a real control from one that guesses.
 */
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "plan-catalog.json");
const labels = labelsForPrompt();
writeFileSync(
  out,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      steps: STEP_CATALOG,
      names: STEP_NAMES,
      generic: STEP_CATALOG.filter((s) => s.generic).map((s) => s.name),
      labels,
      labelCounts: { fromSource: knownLabels().length, seenLive: seenLabels().length },
    },
    null,
    2,
  ),
);
console.log(`wrote ${out} — ${STEP_NAMES.length} steps (${STEP_CATALOG.filter((s) => s.generic).length} generic), ${knownLabels().length} known + ${seenLabels().length} seen labels`);
