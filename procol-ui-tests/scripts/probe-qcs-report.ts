/**
 * Master QCS "Download Report" on a finished event: what the click opens (a panel? a file?), the file that lands,
 * its sheets and first rows — and the grid as the screen shows it. Read-only on Procol.
 *   COMPANY_ID=198678 npx tsx scripts/probe-qcs-report.ts "<event title or project URL>"
 */
import { chromium } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AUTH_FILE } from "../src/config.js";
import { EventsPage } from "../src/pages/EventsPage.js";
import { AwardPage } from "../src/pages/AwardPage.js";

const title = process.argv[2];
if (!title) throw new Error("give the event title");
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: AUTH_FILE, viewport: { width: 1400, height: 950 }, acceptDownloads: true });
const page = await ctx.newPage();
const dir = mkdtempSync(join(tmpdir(), "qcs-report-"));
page.on("download", async (d) => { const p = join(dir, d.suggestedFilename()); await d.saveAs(p); console.log("DOWNLOADED:", p); });
if (/^https?:/.test(title)) await page.goto(title, { waitUntil: "domcontentloaded" });
else {
  const events = new EventsPage(page);
  await events.goto();
  await events.openEvent({ title });
}
await new AwardPage(page).openMasterQcs();
await page.waitForTimeout(4000);
console.log("url:", page.url());
const grid = page.locator(".rdg, [role='grid'], .data-grid-container").first();
console.log("grid text:", ((await grid.innerText().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 900));
console.log("buttons:", JSON.stringify((await page.getByRole("button").allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean).slice(0, 40)));
const btn = page.getByRole("button", { name: /download report/i }).first();
console.log("Download Report buttons:", await btn.count());
if (await btn.count()) {
  await btn.click({ timeout: 5000 }).catch((e) => console.log("click failed:", (e as Error).message.slice(0, 100)));
  await page.waitForTimeout(3000);
  const panel = page.locator(".ant-drawer:not(.ant-drawer-hidden) .ant-drawer-content, .ant-modal:visible .ant-modal-content, .ant-popover:visible, .ant-dropdown:not(.ant-dropdown-hidden)").filter({ visible: true }).last();
  console.log("panel count:", await panel.count(), "text:", ((await panel.innerText().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 600));
  console.log("panel buttons:", JSON.stringify(await panel.getByRole("button").allInnerTexts().catch(() => [])));
  const excel = panel.getByRole("button", { name: /download excel|excel|download/i }).first();
  if (await excel.count()) { await excel.click({ timeout: 5000 }).catch((e) => console.log("excel click failed:", (e as Error).message.slice(0, 100))); await page.waitForTimeout(8000); }
  else await page.waitForTimeout(8000);
  console.log("toasts:", JSON.stringify(await page.locator(".ant-message, .ant-notification").allInnerTexts().catch(() => [])));
  await page.screenshot({ path: join(dir, "after-download.png") }).catch(() => {});
  console.log("screenshot:", join(dir, "after-download.png"));
}
await browser.close();
