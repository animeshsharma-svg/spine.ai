/**
 * Vendor revalidation — the Validation Status filter and search on the
 * buyer's vendor list (preview dashboard), read-only, with screenshots.
 *
 *   APP_URL=https://client-feat-vendor-revalidation-details.preview.procol.tech \
 *   API_URL=https://rfx-uat-api.ag-ri.in/api npx tsx scripts/reval-filters.ts
 *
 * Signs in as GMMCO's buyer with a saved session, opens Vendors → filter
 * panel, applies each Validation Status value, replays the request the screen
 * made to count every page, compares with the database, then adds a name
 * search on top. Real vendors are masked before each picture.
 * Writes PNGs and report.json to prototype/data/evidence/reval-filters/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type Page, type Request } from "@playwright/test";

import { resolveCompanyLogin } from "../src/db/multiClient.js";
import { CONFIG, STORAGE_KEYS } from "../src/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "..", "prototype", "data", "evidence", "reval-filters");
mkdirSync(OUT, { recursive: true });
const CLIENT = 47053;
const TAB_STATUS: Record<string, number[]> = { unverified: [2], verified: [1, 7] };
const STATUS_CODE: Record<string, number> = { Passed: 1, Failed: 2, Skipped: 3, "System Error": 4 };
const pool = await import(pathToFileURL(join(here, "..", "..", "procol test", "src", "db", "pool.ts")).href);
const q = pool.query as (sql: string, p?: unknown[]) => Promise<any[]>;

const login: any = await resolveCompanyLogin(CLIENT);
const H = { "access-token": login.accessToken, "app-version": "9.4.448", "Content-Type": "application/json" };
const cfg: any = await fetch(`${CONFIG.apiUrl}/v1/dashboard_configuration`, { headers: { ...H, "app-version": String(login.appVersion) } }).then((r) => r.json());
const meta: any = await fetch(`${CONFIG.appUrl}/meta.json`).then((r) => r.json());
const report: any = { at: new Date().toISOString(), appUrl: CONFIG.appUrl, checks: [] as any[], notes: [] as string[] };
const check = (id: string, ok: boolean, what: string, extra: Record<string, unknown> = {}) => { report.checks.push({ id, ok, what, ...extra }); console.log(`${ok ? "PASS" : "FAIL"} ${id} ${what}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
let lastListing: { url: string; method: string; body: string | null } | null = null;
page.on("request", (r: Request) => { if (/all_vendors|vendorlist_filtered/.test(r.url())) lastListing = { url: r.url(), method: r.method(), body: r.postData() }; });
await page.addInitScript((d: any) => { localStorage.setItem(d.keys.accessToken, JSON.stringify(d.token)); localStorage.setItem(d.keys.selectedApi, d.api); localStorage.setItem("procol_user_profile", JSON.stringify(d.profile)); localStorage.setItem("procol_app_version", JSON.stringify(d.ver)); localStorage.setItem("procol_login_validity", String(Math.floor(Date.now() / 1000) + 86400)); }, { token: login.accessToken, api: CONFIG.apiUrl, profile: cfg.user, ver: meta.version, keys: STORAGE_KEYS });

const settle = async () => { await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => {}); await page.waitForTimeout(1500); };
const mask = async () => page.evaluate(`(() => {
  const TEST = /^QA_Platform_|Internal Procol vendor|^Abcd$/i;
  const headers = Array.from(document.querySelectorAll("th")).map((t) => (t.textContent || "").trim());
  const col = (re) => headers.findIndex((h) => re.test(h));
  const nameCol = col(/company name/i), cols = [col(/^pan no/i), col(/bank account number/i), col(/ifsc/i), col(/^email$/i), col(/contact person/i)], errCol = col(/validation errors/i);
  for (const tr of document.querySelectorAll("tbody tr")) { const tds = tr.querySelectorAll("td"); const name = (tds[nameCol] ? tds[nameCol].textContent : "").trim(); if (TEST.test(name)) continue;
    if (tds[nameCol]) tds[nameCol].textContent = "(real vendor — hidden)";
    for (const c of cols) if (c >= 0 && tds[c] && (tds[c].textContent || "").trim() !== "-") tds[c].textContent = "••••••••";
    if (errCol >= 0 && tds[errCol]) tds[errCol].textContent = (tds[errCol].textContent || "").replace(/\\b[A-Z]{5}[0-9]{4}[A-Z]\\b/g, "••••••").replace(/\\b\\d{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}\\b/g, "•••••••••••••••").replace(/\\b\\d{9,18}\\b/g, "••••••••"); }
})()`);
const scrollToValidation = async () => { await page.evaluate(`(() => { const th = Array.from(document.querySelectorAll("th")).find((t) => /validation status/i.test(t.textContent || "")); let el = th; while (el && el.scrollWidth <= el.clientWidth) el = el.parentElement; if (el && th) el.scrollLeft = Math.max(0, th.offsetLeft - 420); })()`); await page.waitForTimeout(600); };
const shot = async (name: string) => { await mask(); await page.screenshot({ path: join(OUT, `${name}.png`) }); return `${name}.png`; };

/** replay the screen's own listing request for every page and count rows */
async function countFiltered(expectStatus?: string, nameLike?: string) {
  if (!lastListing) throw new Error("no listing request captured");
  const u = new URL(lastListing.url);
  let total = 0, wrong = 0, pages = 1, names: string[] = [];
  for (let p = 1; p <= Math.min(pages, 60); p++) {
    u.searchParams.set("page", String(p));
    const r = await fetch(u.toString(), { method: lastListing.method, headers: H, body: lastListing.method === "POST" ? lastListing.body : undefined, signal: AbortSignal.timeout(90_000) });
    const j: any = await r.json();
    pages = Number(j.total_pages ?? 1);
    for (const c of j.companies ?? []) { total++; if (expectStatus && c.vendor_validation_status !== expectStatus) wrong++; if (nameLike && !String(c.name).includes(nameLike)) wrong++; names.push(c.name); }
    if (!j.companies?.length) break;
  }
  return { total, wrong, pages, request: `${lastListing.method} ${u.pathname}?${decodeURIComponent(u.search).slice(1, 300)}${lastListing.body ? " body=" + lastListing.body.slice(0, 300) : ""}` };
}
async function dbCount(tab: string, status: string, nameLike?: string) {
  const r = await q(`SELECT count(*)::int n FROM buyer_seller_company_mappings b JOIN companies c ON c.id = b.dealing_with_company_id
      WHERE b.client_company_id = $1 AND b.status = ANY($2::int[]) AND c.status = 1 AND c.category IN (1, 2, 4) AND b.vendor_validation_status = $3 ${nameLike ? "AND c.name LIKE $4" : ""}`, nameLike ? [CLIENT, TAB_STATUS[tab], STATUS_CODE[status], `%${nameLike}%`] : [CLIENT, TAB_STATUS[tab], STATUS_CODE[status]]);
  return r[0].n as number;
}
// the popover: the smallest box holding the left list of filter names and the Apply button
const panel = () => page.locator("[class*=_optionKeyWrapper_]").first().locator("xpath=ancestor::div[.//button[contains(., 'Apply')]][1]");
const panelItem = (name: string) => page.locator("[class*=_optionKey_]").filter({ hasText: new RegExp(`^${name}$`) }).first();
const panelOpen = async () => (await page.locator("[class*=_optionKey_]").first().isVisible().catch(() => false));
async function openPanel() {
  if (await panelOpen()) return;
  const addTag = page.getByRole("button", { name: /add tag/i }).first();
  const box = await addTag.boundingBox();
  if (!box) throw new Error("Add Tag button not found — the filter icon sits next to it");
  await page.mouse.click(box.x + box.width + 30, box.y + box.height / 2);
  await page.waitForTimeout(1200);
  if (!(await panelOpen())) throw new Error("the filter panel did not open");
}
async function closePanel() {
  for (let i = 0; i < 3 && (await panelOpen()); i++) {
    await clickAt("Cancel", page.getByRole("button", { name: /^cancel$/i })).catch(async () => page.keyboard.press("Escape"));
    await page.waitForTimeout(600);
  }
}
/** click an element by its centre, the way the probe did; name the step on failure */
async function clickAt(step: string, loc: ReturnType<Page["locator"]>) {
  const b = await loc.first().boundingBox().catch(() => null);
  if (!b) { await page.screenshot({ path: join(OUT, `debug-${step.replace(/\W+/g, "-")}.png`) }); throw new Error(`${step}: element not visible`); }
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
async function applyStatus(status: string) {
  await openPanel();
  await clickAt("open Validation Status", panelItem("Validation Status"));
  await page.waitForTimeout(800);
  const options = (await page.locator("[class*=_checkboxFilter_]").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  await clickAt(`tick ${status}`, page.locator("[class*=_checkboxFilter_]").filter({ hasText: new RegExp(`^${status}$`) }));
  await page.waitForTimeout(400);
  lastListing = null;
  await clickAt("Apply", page.getByRole("button", { name: /^apply$/i }));
  await settle();
  await closePanel();
  return options;
}
async function clearFilters() { await openPanel(); await clickAt("Clear Filter", page.getByText(/clear filter/i)); await page.waitForTimeout(800); if (await panelOpen()) await clickAt("Apply after clear", page.getByRole("button", { name: /^apply$/i })).catch(() => {}); await settle(); await closePanel(); }

try {
  await page.goto(`${CONFIG.appUrl}/vendors`, { waitUntil: "domcontentloaded" });
  await settle();
  const tab = "unverified"; // the Prospects tab the list opens on
  // the panel: which filters exist
  await openPanel();
  const filterNames = (await page.locator("[class*=_optionKey_]").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  const hasValidation = filterNames.some((t) => /^validation status$/i.test(t));
  const hasDate = filterNames.some((t) => /last validated|validated at|date/i.test(t));
  await page.screenshot({ path: join(OUT, "filter-panel.png") });
  check("H-06a", hasValidation, `the filter panel offers "Validation Status"`, { filters: [...new Set(filterNames)].slice(0, 20) });
  check("H-07", hasDate, `the filter panel offers a "Last Validated At" date range (guide H-07 / TRD)`, { filters: [...new Set(filterNames)].slice(0, 20) });
  await closePanel();

  let options: string[] = [];
  for (const status of ["Passed", "Failed", "System Error", "Skipped"]) {
    options = await applyStatus(status);
    const c = await countFiltered(status);
    const db = await dbCount(tab, status);
    await scrollToValidation();
    const png = await shot(`filter-${status.toLowerCase().replace(/\s+/g, "-")}`);
    check(`H-06 ${status}`, c.wrong === 0 && c.total === db, `filter "${status}" on the Prospects tab: ${c.total} vendor(s) over ${c.pages} page(s), all ${status}: ${c.wrong === 0 ? "yes" : c.wrong + " not"}; database says ${db}`, { request: c.request, screenshot: png });
    await clearFilters();
  }
  check("H-06 Pending", options.some((o) => /pending|not validated|never/i.test(o)), `the Validation Status filter offers a "Pending / not validated" choice (options seen: ${options.join(", ") || "none read"})`, { options });

  // H-08: a status filter together with a name search
  await applyStatus("Failed");
  const search = page.getByPlaceholder(/search/i).first();
  await search.fill("QA_Platform");
  await search.press("Enter");
  await settle();
  const c = await countFiltered("Failed", "QA_Platform");
  const db = await dbCount(tab, "Failed", "QA_Platform");
  await scrollToValidation();
  const png = await shot("filter-failed-plus-search");
  check("H-08", c.wrong === 0 && c.total === db, `filter "Failed" + search "QA_Platform": ${c.total} vendor(s), all Failed and named QA_Platform: ${c.wrong === 0 ? "yes" : c.wrong + " not"}; database says ${db}`, { request: c.request, screenshot: png });
} catch (e) {
  report.error = (e as Error).message.split("\n")[0];
  await page.screenshot({ path: join(OUT, "error-state.png") }).catch(() => {});
  console.log("ERROR", report.error);
} finally {
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  await pool.closePool();
}
process.exit(0);
