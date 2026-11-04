import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import * as F from "./vo-form.js";
import { vendorUiLogin } from "./vo-vendor-ui.js";
const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/vo-e2e";
const setup = JSON.parse(readFileSync(`${OUT}/setup.json`, "utf8"));
const pro = setup.prospects[process.argv[2]];
const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
await vendorUiLogin(page, pro.email); await F.openOnboardingForm(page);
const state = async (k: string) => page.evaluate((key) => {
  const f = document.querySelector(`[class*=formQuestionWrapper][id$="#${key}"]`) as HTMLElement; if (!f) return "missing";
  const icons = Array.from(f.querySelectorAll("i[aria-label], .anticon, [class*=spin], img")).map((e) => (e.getAttribute("aria-label") || e.className.toString()).slice(0, 50));
  return icons.join(", ");
}, k);
const tip = async (k: string) => { const ic = F.field(page, k).locator("[class*=formHeader] .anticon, [class*=formHeader] i, [class*=formHeader] svg").first(); if (!(await ic.count())) return ""; await ic.hover().catch(() => {}); await page.waitForTimeout(800); const t = (await page.locator(".ant-tooltip:not(.ant-tooltip-hidden), .ant-popover:not(.ant-popover-hidden)").allInnerTexts()).join(" | "); await page.mouse.move(5, 5); return t; };
for (const [k, v] of [["pan", "ABCD1234F"], ["pan", "ABCPE1234F"], ["gstin", "27AAAAA0000A1Z5"], ["account_number", "000123456789"], ["reenter_account_number", "000123456780"], ["ifsc", "HDFC123"], ["mobile", "98765"]]) {
  await F.fillText(page, k, v); await page.waitForTimeout(6000);
  console.log(k, "=", v, "| icons:", await state(k), "| tooltip:", await tip(k));
}
await page.screenshot({ path: `${OUT}/shots/icons-probe.png`, fullPage: true });
const s = await F.submit(page); console.log("SUBMIT:", JSON.stringify(s));
await browser.close();
const { closePool } = await import("file:///Users/animesh/Desktop/procol/procol%20test/src/db/pool.ts"); await closePool();
