import { test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NAV } from "../src/config.js";
import { heal, healerEnabled } from "../src/ai/healer.js";
import { recipesFor } from "../src/ai/learned.js";
import { STUCK_DIR, type StuckReport } from "../src/oracle/stuck.js";
import { BasePage } from "../src/pages/BasePage.js";

/**
 * TEACH THE AUTOMATION a locator it got stuck on.
 *
 * Driven by the dashboard's fix button: it reopens the screen the run got stuck
 * on, asks the AI to find the element, and — if it finds it confidently — the
 * healer writes the recipe into the learned-locator store, so the step is
 * deterministic from then on and never asks the AI again.
 *
 * The honest limit: this reopens a URL, so it can teach page-level controls.
 * A control that only exists inside a drawer opened six steps earlier cannot be
 * reproduced this way, and the run says so rather than pretending.
 */
test("teach a stuck locator", async ({ page }) => {
  test.setTimeout(180_000);
  const id = process.env.TEACH_STUCK_ID;
  if (!id) throw new Error("set TEACH_STUCK_ID to the id of a stuck report");
  if (!healerEnabled()) {
    throw new Error("teaching needs the AI: set UI_AI_HEAL=1 and GOOGLE_API_KEY");
  }

  const report = JSON.parse(readFileSync(join(STUCK_DIR, `${id}.json`), "utf8")) as StuckReport;
  console.log(`[teach] "${report.label}" — reopening ${report.url}`);
  await page.goto(report.url, NAV);
  const base = new (class extends BasePage {})(page);
  await base.dismissDistractions();
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

  // Describe the target in the words of the step that failed. The label is the
  // intent ("open-line-items-drawer"); the message often names the control.
  const instruction =
    process.env.TEACH_INSTRUCTION ??
    `find and click the control for "${report.label.replace(/[-_]/g, " ")}" on this screen`;

  const before = recipesFor(report.label).length;
  const healed = await heal(page, instruction, report.label);
  const after = recipesFor(report.label).length;

  if (!healed) {
    console.log(
      `[teach] FAILED — the AI could not find "${report.label}" on ${report.url}. ` +
        "If that control only appears deeper in the journey, this screen cannot teach it; " +
        "the stuck report's accessibility tree is the thing to read next.",
    );
    throw new Error(`could not teach "${report.label}" from ${report.url}`);
  }
  console.log(
    `[teach] LEARNED "${report.label}" — the store now holds ${after} recipe(s) (was ${before}). ` +
      "Future runs will try it before the built-in candidates.",
  );
});
