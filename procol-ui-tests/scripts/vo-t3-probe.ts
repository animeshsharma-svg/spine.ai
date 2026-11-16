// T3 conditional-logic probe: one step at a time, what is shown and required after each answer, plus page errors.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import * as F from "./vo-form.js";
import { vendorUiLogin } from "./vo-vendor-ui.js";
const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/vo-e2e";
const setup = JSON.parse(readFileSync(`${OUT}/setup.json`, "utf8"));
const K = process.argv[2] ?? "T3";
const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } }); const page = await ctx.newPage();
const errs: string[] = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 160))); page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 160)); });
console.log("login", await vendorUiLogin(page, setup.prospects[K].email));
await F.openOnboardingForm(page);
console.log("reset draft:", await F.resetDraft(page)); await page.waitForTimeout(3000);
const keys = ["vendor_type", "gstin", "udyam_number", "annual_turnover", "company_name", "cin", "certifications", "iso_certificate", "country", "state"];
let n = 0;
async function snap(step: string) {
  const shown = await F.keysShown(page);
  const st = await Promise.all(keys.map(async (k) => !shown.includes(k) ? `${k}:—` : `${k}${(await F.isRequired(page, k)) ? "*" : ""}`));
  console.log(`[${++n}] ${step}\n     ${st.join("  ")}${errs.length ? `\n     errors: ${errs.splice(0).join(" || ")}` : ""}`);
  await page.screenshot({ path: `${OUT}/shots/probe-T3-${String(n).padStart(2, "0")}.png`, fullPage: true });
}
await snap("fresh form");
await F.chooseRadio(page, "vendor_type", "Foreign"); await snap("vendor type Foreign");
await F.chooseRadio(page, "vendor_type", "MSME"); await snap("vendor type MSME");
await F.chooseRadio(page, "vendor_type", "Indian"); await snap("vendor type Indian");
await F.fillText(page, "company_name", "QA Steel Pvt Ltd"); await snap("company 'QA Steel Pvt Ltd'");
await F.fillText(page, "company_name", "Pvt"); await snap("company exactly 'Pvt'");
await F.fillText(page, "company_name", "QA Steel"); await snap("company 'QA Steel'");
await F.fillText(page, "country", "India"); await snap("country 'India'");
await F.fillText(page, "country", ""); await snap("country cleared");
await F.chooseOption(page, "certifications", ["ISO 9001"]); await snap("cert ISO 9001");
await page.reload(); await page.waitForTimeout(12000); await page.getByRole("tab").filter({ hasNotText: /overview/i }).first().click().catch(() => {}); await page.waitForTimeout(9000);
await snap("after reload (draft restored)");
await browser.close();
