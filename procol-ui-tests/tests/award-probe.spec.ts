import { test } from "@playwright/test";
import { CONFIG, NAV } from "../src/config.js";
import { AwardPage } from "../src/pages/AwardPage.js";

/**
 * The control case: load the awarding screen directly and tick the vendor's
 * Select All, snapshotting the grid on either side. Diffed against the same
 * snapshots taken inside a full plan run, where the identical tick fails.
 */
test("award probe on a fresh page load", async ({ page }) => {
  test.setTimeout(240_000);
  const id = process.env.AWARD_EVENT_ID;
  if (!id) throw new Error("set AWARD_EVENT_ID to a published event that has a bid");
  await page.goto(`${CONFIG.appUrl.replace(/\/$/, "")}/awarding/${id}`, NAV);
  const award = new AwardPage(page);
  await page.locator(".rdg-cell").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(6000);
  await (award as unknown as { dismissDistractions(): Promise<void> }).dismissDistractions();
  const result = await award.allocate(process.env.AWARD_VENDOR).catch((e) => {
    console.log("PROBE allocate failed:", String(e).split("\n")[0].slice(0, 160));
    return null;
  });
  console.log("PROBE result:", JSON.stringify(result));
});
