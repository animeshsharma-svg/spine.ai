import { chromium } from "@playwright/test";
import { EventsPage } from "../src/pages/EventsPage.js";
import { runGenericStep, type GenericCtx } from "../src/plan/generic/run.js";
import type { PlanStep } from "../src/plan/steps.js";

/**
 * Replay generic steps on a page, one JSON step per argument, printing each
 * step's outcome and how long it took — for finding where a step stalls.
 *
 *   APP_URL=https://qa-agents-bench.com npx tsx scripts/bench-step.ts \
 *     '{"step":"go_to","args":{"screen":"path","path":"/sandbox/r-28/"}}' \
 *     '{"step":"click","args":{"role":"button","name":"Get a shipping quote"}}' \
 *     '{"step":"select","args":{"label":"Select a country","option":"United States","within":"Ship from"}}'
 */
process.env.UI_LABELS_NO_LEARN = "1";
const steps = process.argv.slice(2).map((s) => JSON.parse(s) as PlanStep);
const browser = await chromium.launch();
const page = await browser.newPage();
const ctx: GenericCtx = { page, events: new EventsPage(page), title: "bench-step", memory: {}, prevMark: 0, downloads: [], site: true };
for (const step of steps) {
  const started = Date.now();
  try {
    const out = await runGenericStep(ctx, step, async () => undefined);
    console.log(`✓ ${step.step} ${Date.now() - started}ms — ${out?.detail ?? ""}${out?.strategy ? ` [${out.strategy}]` : ""}`);
  } catch (e) {
    console.log(`✗ ${step.step} ${Date.now() - started}ms — ${(e as Error).message.split("\n")[0].slice(0, 300)}`);
    break;
  }
}
await browser.close();
