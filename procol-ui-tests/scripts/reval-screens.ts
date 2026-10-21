/**
 * Vendor revalidation on the buyer's screen — screenshots for the bug sheet.
 *
 *   APP_URL=https://client-feat-vendor-revalidation-details.preview.procol.tech \
 *   API_URL=https://rfx-uat-api.ag-ri.in/api \
 *   npx tsx scripts/reval-screens.ts [vendor path, default /vendors/RGtwWkRr?tab=info]
 *
 * Signs in as GMMCO's buyer with a session from the database (no OTP, nothing
 * typed), opens the vendor page and the vendor list, and photographs the
 * revalidation status. Read-only: it only opens pages and switches tabs.
 * Writes PNGs and the text it read to prototype/data/evidence/reval-screens/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";

import { resolveCompanyLogin } from "../src/db/multiClient.js";
import { CONFIG, STORAGE_KEYS } from "../src/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "..", "prototype", "data", "evidence", "reval-screens");
const VENDOR_PATH = process.argv[2] ?? "/vendors/RGtwWkRr?tab=info";
const CLIENT = Number(process.env.COMPANY_ID ?? 47053);
mkdirSync(OUT, { recursive: true });

const report: Record<string, unknown> = { appUrl: CONFIG.appUrl, apiUrl: CONFIG.apiUrl, client: CLIENT, vendorPath: VENDOR_PATH, at: new Date().toISOString() };
const shot = async (page: Page, name: string, full = true) => {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full });
  return `${name}.png`;
};
const settle = async (page: Page) => {
  await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(2500);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
const apiCalls: Array<{ url: string; status: number }> = [];
page.on("response", (r) => {
  const u = r.url();
  // every non-asset request, so a bounce to /login can be explained
  if (!/\.(js|css|svg|png|woff2?|ico|json)(\?|$)/.test(u)) apiCalls.push({ url: u.replace(/access-token=[^&]+/, "access-token=<removed>").slice(0, 160), status: r.status() });
});
page.on("requestfailed", (r) => apiCalls.push({ url: `FAILED ${r.url().slice(0, 140)} ${r.failure()?.errorText ?? ""}`, status: 0 }));

try {
  // The build's own version: the app compares it with meta.json at boot and,
  // on a mismatch, clears its storage and reloads — which is a bounce to /login.
  const meta: any = await fetch(`${CONFIG.appUrl.replace(/\/$/, "")}/meta.json`).then((r) => r.json()).catch(() => ({}));
  const ver = String(process.env.APP_VERSION ?? meta.version ?? "");
  const login = await resolveCompanyLogin(CLIENT);
  if (!login) throw new Error(`no usable saved session for company ${CLIENT}`);
  const validity = Math.floor(Date.now() / 1000) + 24 * 3600;
  // This build restores a session only when the user's profile is stored too
  // (redux/user/actions.js restoreSession) — the same object the API returns
  // as `user` in dashboard_configuration.
  const cfg: any = await fetch(`${CONFIG.apiUrl.replace(/\/$/, "")}/v1/dashboard_configuration`, {
    headers: { "access-token": login.accessToken, "app-version": String(login.appVersion), "Content-Type": "application/json" },
    signal: AbortSignal.timeout(90_000),
  }).then((r) => r.json()).catch(() => null);
  const profile = cfg?.user ?? cfg?.config?.user ?? null;
  if (!profile) throw new Error("could not read the user's profile from dashboard_configuration");
  await page.addInitScript(
    (d: { token: string; api: string; ver: string; validity: number; profile: unknown; keys: { accessToken: string; selectedApi: string } }) => {
      localStorage.setItem(d.keys.accessToken, JSON.stringify(d.token));
      localStorage.setItem(d.keys.selectedApi, d.api);
      localStorage.setItem("procol_user_profile", JSON.stringify(d.profile));
      if (d.ver) localStorage.setItem("procol_app_version", JSON.stringify(d.ver));
      localStorage.setItem("procol_login_validity", String(d.validity));
    },
    { token: login.accessToken, api: CONFIG.apiUrl, ver, validity, profile, keys: STORAGE_KEYS },
  );
  report.signedInAs = { userId: login.userId, how: "saved session from the database (no OTP typed)", appVersion: ver || login.appVersion };

  // 1. the vendor page, as reached by clicking a vendor in the list
  await page.goto(`${CONFIG.appUrl.replace(/\/$/, "")}${VENDOR_PATH}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  report.vendorPageUrl = page.url();
  report.vendorPageTitle = (await page.locator("h1, h2, h3").first().textContent().catch(() => null))?.trim();
  report.vendorPage = await shot(page, "vendor-page-full");
  // the revalidation block, if the page has one
  const block = page.getByText(/revalidation|validation status|last validated/i).first();
  if (await block.count()) {
    await block.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(800);
    report.vendorPageView = await shot(page, "vendor-page-revalidation", false);
    const section = block.locator("xpath=ancestor::*[self::section or self::div][3]");
    report.revalidationText = (await section.innerText().catch(() => ""))?.slice(0, 4000);
  } else {
    report.revalidationText = "no text mentioning revalidation / validation status / last validated was found on the vendor page";
  }
  // any tab named like revalidation / validation
  const tab = page.getByRole("tab", { name: /revalidation|validation/i }).first();
  if (await tab.count()) {
    await tab.click();
    await settle(page);
    report.revalidationTab = await shot(page, "vendor-page-revalidation-tab");
    report.revalidationTabText = (await page.locator("main, body").first().innerText().catch(() => "")).slice(0, 4000);
  }

  // 2. the vendor list with its validation columns
  await page.goto(`${CONFIG.appUrl.replace(/\/$/, "")}/vendors`, { waitUntil: "domcontentloaded" });
  await settle(page);
  report.listing = await shot(page, "vendor-list");
  const headers = await page.locator("th, [role=columnheader]").allInnerTexts().catch(() => []);
  report.listingHeaders = headers.map((h) => h.trim()).filter(Boolean);
  // scroll the table to its validation columns so all three are in the picture
  const scrollToValidation = async () => {
    await page.evaluate(`(() => {
      const th = Array.from(document.querySelectorAll("th")).find((t) => /validation status/i.test(t.textContent || ""));
      let el = th;
      while (el && el.scrollWidth <= el.clientWidth) el = el.parentElement;
      if (el && th) el.scrollLeft = Math.max(0, th.offsetLeft - 260);
    })()`);
    await page.waitForTimeout(800);
  };
  // Real vendors' PAN / bank numbers are masked in OUR browser before the
  // picture is taken (test vendors QA_Platform_* / Internal Procol vendor stay).
  const maskRealVendors = async () => {
    await page.evaluate(`(() => {
      const TEST = /^QA_Platform_|Internal Procol vendor|^Abcd$/i;
      const headers = Array.from(document.querySelectorAll("th")).map((t) => (t.textContent || "").trim());
      const col = (re) => headers.findIndex((h) => re.test(h));
      const nameCol = col(/company name/i), panCol = col(/^pan no/i), acctCol = col(/bank account number/i), ifscCol = col(/ifsc/i), errCol = col(/validation errors/i), emailCol = col(/^email$/i), contactCol = col(/contact person/i);
      for (const tr of document.querySelectorAll("tbody tr")) {
        const tds = tr.querySelectorAll("td");
        const name = (tds[nameCol] ? tds[nameCol].textContent : "").trim();
        if (TEST.test(name)) continue;
        if (tds[nameCol]) tds[nameCol].textContent = "(real vendor — hidden)";
        for (const c of [panCol, acctCol, ifscCol, emailCol, contactCol]) if (c >= 0 && tds[c] && (tds[c].textContent || "").trim() !== "-") tds[c].textContent = "••••••••";
        if (errCol >= 0 && tds[errCol]) tds[errCol].textContent = (tds[errCol].textContent || "").replace(/\\b[A-Z]{5}[0-9]{4}[A-Z]\\b/g, "••••••").replace(/\\b\\d{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}\\b/g, "•••••••••••••••").replace(/\\b\\d{9,18}\\b/g, "••••••••");
      }
    })()`);
  };
  if (await page.getByText(/validation status/i).first().count()) {
    await scrollToValidation();
    await maskRealVendors();
    report.listingColumns = await shot(page, "vendor-list-validation-columns", false);
  }

  // open one vendor per status (links found from the API beforehand) and
  // photograph the Revalidation Details card — or its absence
  report.vendorsOpened = [] as unknown[];
  const picks: Record<string, { uuid: string; name: string; errors: string }> = JSON.parse(process.env.VENDOR_PICKS ?? "{}");
  for (const [status, v] of Object.entries(picks)) {
    await page.goto(`${CONFIG.appUrl.replace(/\/$/, "")}/vendors/${v.uuid}?tab=info`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const slug = status.toLowerCase().replace(/\s+/g, "-");
    if (/hidden/.test(v.name)) await page.evaluate(`(() => { for (const h of document.querySelectorAll("h1, h2")) if (!/revalidation|details/i.test(h.textContent || "")) h.textContent = "(real vendor — name hidden)"; })()`);
    const card = page.getByText(/revalidation details/i).first();
    const entry: any = { listStatus: status, vendor: v.name, url: page.url(), listErrors: v.errors, hasRevalidationCard: (await card.count()) > 0 };
    // scroll the page's own container to the bottom so the whole Info tab is rendered
    await page.evaluate(`(() => { for (const e of document.querySelectorAll("*")) { if (e.scrollHeight > e.clientHeight + 50) e.scrollTop = e.scrollHeight; } window.scrollTo(0, document.body.scrollHeight); })()`);
    await page.waitForTimeout(1200);
    entry.hasRevalidationCard = (await card.count()) > 0;
    entry.pageHeadings = (await page.locator("h1, h2, h3").allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean).slice(0, 20);
    if (entry.hasRevalidationCard) {
      await card.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(800);
      const section = card.locator("xpath=ancestor::*[contains(@class,'card') or self::section][1]");
      const target = (await section.count()) ? section : card;
      await target.screenshot({ path: join(OUT, `vendor-page-revalidation-${slug}.png`) }).catch(async () => shot(page, `vendor-page-revalidation-${slug}`, false));
      entry.screenshot = `vendor-page-revalidation-${slug}.png`;
      entry.text = (await target.innerText().catch(() => "")).slice(0, 2500);
    } else {
      entry.screenshot = await shot(page, `vendor-page-${slug}-bottom`, false);
    }
    (report.vendorsOpened as unknown[]).push(entry);
  }
} catch (e) {
  report.error = (e as Error).message.split("\n")[0];
  await shot(page, "error-state").catch(() => {});
} finally {
  report.apiCalls = apiCalls.slice(0, 40);
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ ...report, revalidationText: String(report.revalidationText ?? "").slice(0, 600), revalidationTabText: undefined, apiCalls: apiCalls.length }, null, 2));
process.exit(0);
