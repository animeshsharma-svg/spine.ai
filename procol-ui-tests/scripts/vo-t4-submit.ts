// T4 finish: choose currency by typing (long list), fill supplier code, submit; then read the vendor record (DB, read-only) for the written-back code.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import * as F from "./vo-form.js";
import { vendorUiLogin } from "./vo-vendor-ui.js";
const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/vo-e2e";
const setup = JSON.parse(readFileSync(`${OUT}/setup.json`, "utf8")); const pro = setup.prospects.T4;
const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage(); page.setDefaultNavigationTimeout(120000); page.setDefaultTimeout(60000);
const errs: string[] = []; page.on("pageerror", (e) => errs.push("pageerror: " + e.message.slice(0, 200))); page.on("console", (m) => { if (m.type() === "error" && !/WebSocket|favicon|404/.test(m.text())) errs.push("console: " + m.text().slice(0, 200)); });
const posts: string[] = []; page.on("response", async (r) => { if (r.request().method() !== "GET" && /sec-api|api\./.test(r.url())) posts.push(`${r.request().method()} ${r.status()} ${r.url().replace(/^.*\/api/, "")} ${(await r.text().catch(() => "")).slice(0, 200)}`); });
console.log("login", await vendorUiLogin(page, pro.email)); await F.openOnboardingForm(page);
for (const [k, typed] of [["currency", "INR"], ["country", "India"]] as const) {
  await F.field(page, k).locator(".ant-select-selection").first().click(); await page.waitForTimeout(1500);
  await page.keyboard.type(typed); await page.waitForTimeout(1500); await page.keyboard.press("Enter"); await page.waitForTimeout(1500);
  await page.locator("text=Submission Sheet").first().click({ force: true }).catch(() => {}); console.log(k, "→", await F.selected(page, k));
}
await F.field(page, "region").locator(".ant-select-selection").first().click(); await page.waitForTimeout(1500); await page.keyboard.type("Maharashtra"); await page.waitForTimeout(1200); await page.keyboard.press("Enter"); await page.waitForTimeout(1000);
await page.locator("text=Submission Sheet").first().click({ force: true }).catch(() => {}); console.log("region →", await F.selected(page, "region"));
await F.fillText(page, "supplier_code", `QAVOE-${setup.stamp}`);
console.log("prefill kept: legal", JSON.stringify(await F.valueOf(page, "legal_name")), "email", JSON.stringify(await F.valueOf(page, "company_email")));
await page.screenshot({ path: `${OUT}/shots/VOE-T4-V05-filled.png`, fullPage: true });
posts.length = 0; errs.length = 0;
const s = await F.submit(page); console.log("submit →", JSON.stringify(s));
await page.waitForTimeout(3000); console.log("after submit body chars:", (await page.locator("body").innerText().catch(() => "")).length, "| url:", page.url());
console.log("requests after Submit:\n  " + posts.join("\n  ")); console.log("page errors:\n  " + (errs.join("\n  ") || "none"));
await page.waitForTimeout(4000); await page.screenshot({ path: `${OUT}/shots/VOE-T4-V05-after.png`, fullPage: true });
await browser.close();
try { const { query, closePool } = await import("file:///Users/animesh/Desktop/procol/procol%20test/src/db/pool.ts");
for (let i = 0; i < 6; i++) {
  const r = await query("select id, name, misc->>'supplier_code' sc from companies where name ilike $1", [`${pro.firm}%`]);
  console.log("vendor record:", JSON.stringify(r)); if (r.some((x: any) => x.sc)) break; await new Promise((z) => setTimeout(z, 5000));
}
await closePool(); } catch (e) { console.log("DB check failed:", (e as Error).message); }
