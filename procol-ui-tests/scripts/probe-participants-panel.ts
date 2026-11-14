/**
 * Where the stage's participants summary ("Total Participants … Dynamic time extended") is drawn, and how:
 *   COMPANY_ID=198678 npx tsx scripts/probe-participants-panel.ts "<event title>"
 * Opens the event as the buyer (saved session), goes to its stage, clicks each sub-tab and prints the lines
 * holding the summary words with the class chain of the element around "Dynamic time extended". Read-only.
 */
import { chromium } from "@playwright/test";
import { AUTH_FILE } from "../src/config.js";
import { EventsPage } from "../src/pages/EventsPage.js";
import { EventActionsPage } from "../src/pages/EventActionsPage.js";

const title = process.argv[2];
if (!title) throw new Error("give the event title");
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: AUTH_FILE, viewport: { width: 1400, height: 950 } });
const page = await ctx.newPage();
const events = new EventsPage(page);
await events.goto();
await events.openEvent({ title });
console.log("stage:", await new EventActionsPage(page).gotoStage("auction").catch((e) => (e as Error).message.slice(0, 100)));
await page.waitForTimeout(3000);
for (const sub of ["Overview", "Participants", "Analytics"]) {
  const t = page.getByRole("tab", { name: new RegExp(`^\\s*${sub}\\s*$`, "i") }).first();
  if (!(await t.count())) { console.log(`no ${sub} tab`); continue; }
  await t.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(3500);
  const text = ((await page.locator("body").innerText().catch(() => "")) || "").replace(/[ \t]+/g, " ");
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => /participants|total bids|revised|dynamic|extended|counter offer/i.test(l));
  console.log(`[${sub}] ${page.url()} lines:`, JSON.stringify(lines.slice(0, 20)));
  const info = await page.evaluate(() => {
    const out: string[] = [];
    const all = Array.from(document.querySelectorAll<HTMLElement>("*")).filter((e) => e.children.length === 0 && /dynamic time extended|total participants/i.test(e.textContent || ""));
    for (const el of all.slice(0, 3)) {
      let chain = "";
      let cur: HTMLElement | null = el;
      for (let i = 0; i < 5 && cur; i++) { chain += `<${cur.tagName.toLowerCase()} class="${(cur.className || "").toString().slice(0, 60)}"> ${i === 0 ? (cur.textContent || "").trim().slice(0, 40) : ""} ← `; cur = cur.parentElement; }
      const parent = el.parentElement;
      out.push(chain + " | parent text: " + (parent?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80));
    }
    return out;
  });
  console.log(`[${sub}] summary elements:`, JSON.stringify(info, null, 1));
}
await browser.close();
