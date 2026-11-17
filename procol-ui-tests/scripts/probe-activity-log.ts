/**
 * The Order Activity lines of an event, read from the app the way its Activity drawer reads them (GET /activity_logs).
 * Read-only.  COMPANY_ID=198678 npx tsx scripts/probe-activity-log.ts "<event title>"
 */
import { chromium, type Response } from "@playwright/test";
import { AUTH_FILE } from "../src/config.js";
import { EventsPage } from "../src/pages/EventsPage.js";
import { EventActionsPage } from "../src/pages/EventActionsPage.js";

const title = process.argv[2];
if (!title) throw new Error("give the event title");
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: AUTH_FILE, viewport: { width: 1400, height: 950 } });
const page = await ctx.newPage();
page.on("response", async (r: Response) => {
  if (!/\/activity_logs/.test(r.url())) return;
  const j = await r.json().catch(() => null);
  const items: any[] = j?.activity_logs ?? j?.data ?? (Array.isArray(j) ? j : []);
  console.log(`[${r.status()}] ${new URL(r.url()).search.slice(0, 160)} → ${items.length} line(s)`);
  for (const it of items.slice(0, 30)) console.log("   ", String(it.message ?? it.text ?? JSON.stringify(it)).replace(/<[^>]+>/g, "").slice(0, 160));
});
if (/^https?:/.test(title)) await page.goto(title, { waitUntil: "domcontentloaded" });
else {
  const events = new EventsPage(page);
  await events.goto();
  await events.openEvent({ title });
}
const ev = new EventActionsPage(page);
await ev.gotoStage("auction").catch(() => "");
await ev.choose("Order Activity").catch((e) => console.log("choose:", (e as Error).message.slice(0, 120)));
await page.waitForTimeout(8000);
const drawer = page.locator(".ant-drawer-content").filter({ hasText: /activity/i }).last();
console.log("drawer text:", ((await drawer.innerText().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 900));
await browser.close();
