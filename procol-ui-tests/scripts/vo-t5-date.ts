// T5: B date shows a date but Submit says "Please fill 'B date'". Reopen, Submit as is; then pick a day from the calendar (not Today) and Submit.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import * as F from "./vo-form.js";
import { vendorUiLogin } from "./vo-vendor-ui.js";
const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/vo-e2e";
const setup = JSON.parse(readFileSync(`${OUT}/setup.json`, "utf8")); const pro = setup.prospects.T5;
const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage(); page.setDefaultNavigationTimeout(120000); page.setDefaultTimeout(60000);
const saves: string[] = []; page.on("request", (r) => { if (/draft|page_responses|template_responses/.test(r.url()) && r.method() !== "GET") saves.push(`${r.method()} ${r.url().replace(/^.*\/api/, "")} ${(r.postData() ?? "").slice(0, 300)}`); });
console.log("login", await vendorUiLogin(page, pro.email)); await F.openOnboardingForm(page);
const dateShown = async () => F.field(page, "b_date").locator("input").first().inputValue().catch(() => "?");
console.log("reopened: B date shows", JSON.stringify(await dateShown()), "| C doc:", await F.fieldText(page, "c_doc"));
let s = await F.submit(page); console.log("submit as reopened →", JSON.stringify(s));
await page.screenshot({ path: `${OUT}/shots/VOE-T5-V06-reopened.png`, fullPage: true });
if (!/success/i.test(s.text)) {
  await F.field(page, "b_date").locator(".ant-calendar-picker input").first().click(); await page.waitForTimeout(800);
  const day = page.locator(".ant-calendar-date").filter({ hasText: /^15$/ }).first(); await day.click(); await page.waitForTimeout(1500);
  console.log("picked the 15th: B date shows", JSON.stringify(await dateShown()));
  console.log("draft saves after pick:", saves.slice(-2).join(" || ") || "none");
  s = await F.submit(page); console.log("submit after picking a day →", JSON.stringify(s));
  await page.waitForTimeout(3000); await page.screenshot({ path: `${OUT}/shots/VOE-T5-V06-after.png`, fullPage: true });
}
await browser.close();
