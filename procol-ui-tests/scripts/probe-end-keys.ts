/**
 * Which keys in the app's own reads carry an event's END — on the buyer's stage page and on the supplier portal.
 *   VENDORS=samplevendor@vendortestt.co COMPANY_ID=198678 npx tsx scripts/probe-end-keys.ts "<event title>"
 * Prints, per JSON reply (GET), every epoch-looking value within ±2 days of now with its key path — so the reader
 * (plan/eventTime.ts endsIn) can be taught the keys that move after a dynamic time extension. Read-only.
 */
import { chromium, type Page, type Response } from "@playwright/test";
import { CONFIG, AUTH_FILE } from "../src/config.js";
import { EventsPage } from "../src/pages/EventsPage.js";
import { EventActionsPage } from "../src/pages/EventActionsPage.js";
import { VendorPortalPage } from "../src/pages/VendorPortalPage.js";

const title = process.argv[2];
if (!title) throw new Error("give the event title");
const browser = await chromium.launch();
const now = Math.round(Date.now() / 1000);
const near = (n: number) => Math.abs(n - now) < 2 * 86400;
const fmt = (n: number) => new Date(n * 1000).toISOString().slice(11, 19) + "Z";

function epochs(j: unknown): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  const seen = new Set<unknown>();
  const walk = (o: any, path: string, depth: number) => {
    if (!o || typeof o !== "object" || seen.has(o) || depth > 7) return;
    seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      const p = path ? `${path}.${k}` : k;
      if (typeof v === "number" && v > 1e9 && near(v > 1e12 ? v / 1000 : v)) out.push([p, v > 1e12 ? Math.round(v / 1000) : v]);
      else if (typeof v === "string" && /^\d{10,13}$/.test(v) && near(Number(v) > 1e12 ? Number(v) / 1000 : Number(v))) out.push([p, Number(v) > 1e12 ? Math.round(Number(v) / 1000) : Number(v)]);
      else if (typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) && near(Date.parse(v) / 1000)) out.push([p, Math.round(Date.parse(v) / 1000)]);
      else if (v && typeof v === "object") walk(v, p, depth + 1);
    }
  };
  walk(j, "", 0);
  return out;
}

function watch(page: Page, tag: string) {
  page.on("response", async (r: Response) => {
    if (r.request().method() !== "GET" || !/json/i.test(r.headers()["content-type"] ?? "")) return;
    const j = await r.json().catch(() => null);
    if (!j) return;
    const found = epochs(j);
    if (!found.length) return;
    const u = new URL(r.url());
    console.log(`[${tag}] ${u.pathname}${u.search.slice(0, 60)}`);
    for (const [p, n] of found.slice(0, 40)) console.log(`    ${p} = ${n} (${fmt(n)})`);
  });
}

// buyer
{
  const ctx = await browser.newContext({ storageState: AUTH_FILE, viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const events = new EventsPage(page);
  await events.goto();
  await events.openEvent({ title });
  watch(page, "buyer");
  await new EventActionsPage(page).gotoStage("auction").catch((e) => console.log("gotoStage:", (e as Error).message.slice(0, 100)));
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(8000);
  const body = ((await page.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ");
  console.log("[buyer] screen words about the end:", JSON.stringify(body.match(/.{0,40}(ends?|ending|closes|closing|extended).{0,60}/gi)?.slice(0, 6)));
  await ctx.close();
}
// vendor
const vendorEmail = (process.env.VENDORS || "").split(",")[0]?.trim();
if (vendorEmail) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const portal = new VendorPortalPage(page);
  await portal.goto();
  console.log("vendor signed in:", await portal.login(vendorEmail));
  watch(page, "vendor");
  await portal.openEvent(title);
  await portal.startBidding(title).catch((e) => console.log("startBidding:", (e as Error).message.slice(0, 100)));
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(8000);
  const body = ((await page.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ");
  console.log("[vendor] screen words about the end:", JSON.stringify(body.match(/.{0,40}(ends?|ending|closes|closing|extended).{0,60}/gi)?.slice(0, 6)));
  await ctx.close();
}
await browser.close();
