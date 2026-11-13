/**
 * Probe a LIVE traffic-light auction on the active client: what the buyer's event page and each vendor's
 * portal page draw for the zone (green / yellow / red), the rank and the best price.
 *   COMPANY_ID=198678 npx tsx scripts/probe-traffic-zones.ts "<event title>" [vendorsToLookAt=2]
 * Buyer side: the runner's saved session (.auth/user.json). Vendor side: the client's QA vendors
 * (qaVendorLogins), signed in the way place_bid does. Prints text only; screenshots go to PROBE_OUT.
 */
import { chromium, type Page } from "@playwright/test";
import { CONFIG, AUTH_FILE } from "../src/config.js";
import { EventsPage } from "../src/pages/EventsPage.js";
import { EventActionsPage } from "../src/pages/EventActionsPage.js";
import { VendorPortalPage } from "../src/pages/VendorPortalPage.js";
import { qaVendorLogins, closeQaVendorDb } from "../src/db/qaVendors.js";

const OUT = process.env.PROBE_OUT || "/tmp";
const title = process.argv[2];
const vendorsToLookAt = Number(process.argv[3] || 2);
if (!title) throw new Error("give the event title");
const browser = await chromium.launch();

async function colourWords(page: Page, tag: string) {
  const text = ((await page.locator("body").innerText().catch(() => "")) || "").replace(/[ \t]+/g, " ");
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => /green|yellow|red|zone|rank|best price|l1\b|lowest/i.test(l));
  console.log(`[${tag}] lines with zone / rank / best-price words:`, JSON.stringify(lines.slice(0, 30)));
  const coloured = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      const cls = el.className && typeof el.className === "string" ? el.className : "";
      const st = getComputedStyle(el);
      const bg = st.backgroundColor;
      const isZoneClass = /traffic|zone|green|yellow|red/i.test(cls);
      const tip = el.getAttribute("title") || el.getAttribute("aria-label") || "";
      if (isZoneClass || /traffic|zone/i.test(tip)) {
        const t = (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60);
        out.push(`<${el.tagName.toLowerCase()} class="${cls.slice(0, 80)}" title="${tip.slice(0, 40)}" bg=${bg}> ${t}`);
      }
      if (out.length > 40) break;
    }
    return out;
  }).catch(() => [] as string[]);
  console.log(`[${tag}] zone-ish elements:`, JSON.stringify(coloured));
  await page.screenshot({ path: `${OUT}/zones-${tag}.png`, fullPage: true }).catch(() => {});
}

// ── buyer ──
{
  const ctx = await browser.newContext({ storageState: AUTH_FILE, viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const events = new EventsPage(page);
  await events.goto();
  const where = await events.openEvent({ title });
  console.log("buyer: opened", where, "at", page.url());
  await page.waitForTimeout(4000);
  await colourWords(page, "buyer-event");
  // the stage tab is the event's own title on a single-stage event (14 Nov): open it
  const stageTab = page.getByRole("tab").filter({ hasText: /spine-ui-automation|RA-\d+/i }).first();
  console.log("stage tab count:", await stageTab.count(), "text:", ((await stageTab.innerText().catch(() => "")) || "").trim());
  if (await stageTab.count()) { await stageTab.click({ timeout: 5000 }); await page.waitForTimeout(4000); console.log("stage url:", page.url()); await colourWords(page, "buyer-stage"); }
  // the vendor column header on Responses: the coloured dot beside the name (14 Nov screenshot)
  const head = page.locator("[role='columnheader'], .MuiDataGrid-columnHeader").filter({ hasText: /@|PRIVATE LIMITED/i }).first();
  console.log("vendor header count:", await head.count());
  if (await head.count()) {
    console.log("vendor header html:", ((await head.evaluate((e) => e.outerHTML).catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 2500));
    const dot = head.locator("svg, [class*='dot' i], [class*='circle' i], [class*='indicator' i], [class*='status' i]").first();
    if (await dot.count()) { await dot.hover({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(800); console.log("tooltip after hover:", JSON.stringify(await page.locator(".ant-tooltip-inner, [role='tooltip']").allInnerTexts().catch(() => []))); }
  }
  for (const sub of ["Overview", "Participants"]) {
    const t = page.getByRole("tab", { name: new RegExp(`^\\s*${sub}\\s*$`, "i") }).first();
    if (await t.count()) { await t.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(3000); await colourWords(page, `buyer-${sub.toLowerCase()}`); console.log(`${sub} ant-tags:`, JSON.stringify(await page.locator(".ant-tag").allInnerTexts().catch(() => []))); }
  }
  console.log("sub tabs:", JSON.stringify((await page.getByRole("tab").allInnerTexts().catch(() => [])).map((t) => t.trim())));
  console.log("ant-tags on stage:", JSON.stringify(await page.locator(".ant-tag").allInnerTexts().catch(() => [])));
  console.log("tooltips/titles with colour:", JSON.stringify(await page.locator("[title]").evaluateAll((els) => els.map((e) => e.getAttribute("title") || "").filter((t) => /green|yellow|red/i.test(t))).catch(() => [])));
  // the bidders filter (actionBar.jsx → biddersFilter.jsx): "<vendor> • Green" tags
  const filterBtn = page.locator("button, [role='button']").filter({ has: page.locator(".anticon-filter, .anticon-check, .anticon-warning") }).first();
  console.log("bidders filter button count:", await filterBtn.count());
  if (await filterBtn.count()) {
    await filterBtn.click({ timeout: 5000 }).catch((e) => console.log("filter click failed:", e.message.slice(0, 100)));
    await page.waitForTimeout(1000);
    const menu = page.locator(".ant-dropdown:visible .ant-menu, .ant-dropdown-menu:visible").last();
    console.log("filter menu text:", ((await menu.innerText().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 400));
    console.log("filter tags:", JSON.stringify(await menu.locator(".ant-tag").allInnerTexts().catch(() => [])));
    await page.screenshot({ path: `${OUT}/zones-buyer-filter.png` }).catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
  }
  // Responses tab
  try {
    const ev = new EventActionsPage(page);
    const r = await ev.readResponses("auction");
    console.log("responses:", JSON.stringify(r).slice(0, 600));
    await colourWords(page, "buyer-responses");
  } catch (e) { console.log("responses read failed:", (e as Error).message.slice(0, 200)); }
  await ctx.close();
}

// ── vendors ──
const logins = process.env.VENDORS ? process.env.VENDORS.split(",").map((e) => ({ name: e.trim().split("@")[0], email: e.trim() })) : await qaVendorLogins(Number(process.env.COMPANY_ID) || undefined);
console.log("QA vendor logins:", logins.length);
for (const v of logins.slice(0, vendorsToLookAt)) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const portal = new VendorPortalPage(page);
  try {
    await portal.goto();
    const how = await portal.login(v.email);
    console.log(`\nvendor ${v.name} <${v.email}> signed in (${how})`);
    await portal.openEvent(title);
    await page.waitForTimeout(3000);
    console.log("vendor overview url:", page.url());
    await colourWords(page, `vendor-${v.name.replace(/\W+/g, "_")}-overview`);
    await portal.startBidding(title).catch((e) => console.log("startBidding:", (e as Error).message.slice(0, 120)));
    await page.waitForTimeout(3000);
    console.log("vendor round url:", page.url());
    await colourWords(page, `vendor-${v.name.replace(/\W+/g, "_")}-round`);
  } catch (e) {
    console.log(`vendor ${v.email} failed:`, (e as Error).message.slice(0, 200));
  }
  await ctx.close();
}
await closeQaVendorDb().catch(() => {});
await browser.close();
