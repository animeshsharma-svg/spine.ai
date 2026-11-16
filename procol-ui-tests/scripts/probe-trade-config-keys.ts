/**
 * Which keys of the app's own trade read carry the auction STRATEGY (dynamic time extension, traffic light, auction
 * config) — for the API builder's read-back (uiSetup readRound). Read-only.
 *   COMPANY_ID=198678 npx tsx scripts/probe-trade-config-keys.ts "<event title>"
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
const WANT = /dynamic|extension|traffic|auction_config|strategy|rank_limit|closing/i;
page.on("response", async (r: Response) => {
  if (r.request().method() !== "GET" || !/json/i.test(r.headers()["content-type"] ?? "") || !/\/trade\//.test(r.url())) return;
  const j = await r.json().catch(() => null);
  if (!j) return;
  const out: string[] = [];
  const seen = new Set<unknown>();
  const walk = (o: any, path: string, depth: number) => {
    if (!o || typeof o !== "object" || seen.has(o) || depth > 6) return;
    seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      const p = path ? `${path}.${k}` : k;
      if (WANT.test(k) && (typeof v !== "object" || v === null)) out.push(`${p} = ${JSON.stringify(v)}`);
      else if (WANT.test(k) && typeof v === "object") out.push(`${p} = ${JSON.stringify(v).slice(0, 160)}`);
      if (v && typeof v === "object" && !(WANT.test(k) && Array.isArray(v))) walk(v, p, depth + 1);
    }
  };
  walk(j, "", 0);
  const u = new URL(r.url());
  console.log(`[${u.pathname}${u.search.slice(0, 50)}] top keys: ${Object.keys(j).slice(0, 25).join(", ")}`);
  for (const l of out.slice(0, 40)) console.log("   ", l);
});
const events = new EventsPage(page);
await events.goto();
await events.openEvent({ title });
await new EventActionsPage(page).gotoStage("auction").catch((e) => console.log("gotoStage:", (e as Error).message.slice(0, 80)));
await page.waitForTimeout(6000);
await browser.close();
