import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import * as F from "./vo-form.js";
import { vendorUiLogin } from "./vo-vendor-ui.js";
const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/vo-e2e";
const setup = JSON.parse(readFileSync(`${OUT}/setup.json`, "utf8"));
const pro = setup.prospects["T2C"];
const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
await vendorUiLogin(page, pro.email); await F.openOnboardingForm(page);
const good: Record<string, string> = { pan: "ABCPE1234F", gstin: "27ABCPE1234F1Z5", account_number: "000123456789", reenter_account_number: "000123456789", ifsc: "HDFC0001234", mobile: "9876543210" };
const log: string[] = [];
for (const [k, v] of Object.entries(good)) { await F.fillText(page, k, v); await page.waitForTimeout(1500); }
await page.waitForTimeout(5000);
await F.fillText(page, "pan", "ABCD1234F"); await page.waitForTimeout(6000);
log.push(`PAN 'ABCD1234F' (wrong format), everything else valid → Submit: '${(await F.submit(page)).text}'`);
await page.screenshot({ path: `${OUT}/shots/VOE-T2C-pan-format.png`, fullPage: true });
await F.fillText(page, "pan", "ABCPE1234F"); await page.waitForTimeout(6000);
// change one answer and press Submit straight away
const box = F.field(page, "mobile").locator("input").first(); await box.fill("9999999999");
const s = await F.submit(page); log.push(`mobile changed to 9999999999 and Submit pressed at once → '${s.text}'`);
await page.waitForTimeout(3000);
log.push(`mobile shown after submit: '${await F.valueOf(page, "mobile")}'`);
await page.screenshot({ path: `${OUT}/shots/VOE-T2C-race.png`, fullPage: true });
writeFileSync(`${OUT}/race.json`, JSON.stringify(log, null, 2)); console.log(log.join("\n"));
await browser.close();
const { closePool } = await import("file:///Users/animesh/Desktop/procol/procol%20test/src/db/pool.ts"); await closePool();
