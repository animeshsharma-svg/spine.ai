import { chromium } from "@playwright/test";
const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/vo-e2e";
const email = process.argv[2];
const browser = await chromium.launch(); const ctx = await browser.newContext({ storageState: `.auth/vendor-${email.split("@")[0]}.json`, viewport: { width: 1500, height: 950 } }); const page = await ctx.newPage();
await page.goto("https://quotes.ag-ri.in/events", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(5000);
for (const b of ["Got it", "Not now"]) await page.getByRole("button", { name: b }).first().click({ timeout: 1200 }).catch(() => {});
await page.getByText(/Vendor Onboarding/).first().click(); await page.waitForTimeout(5000);
await page.getByRole("tab").filter({ hasNotText: /overview/i }).first().click(); await page.waitForTimeout(5000);
await page.screenshot({ path: `${OUT}/vendor-t1-form.png`, fullPage: true });
const html = await page.evaluate(() => {
  const lab = Array.from(document.querySelectorAll("*")).find((e) => e.children.length === 0 && /^Legal name/.test((e.textContent || "").trim()));
  let c: any = lab; for (let i = 0; i < 12 && c; i++) { if (c.querySelectorAll("input,textarea,.ant-select,.ant-radio-group,.ant-upload").length > 6) break; c = c.parentElement; }
  return c ? c.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/ style="[^"]*"/g, "").replace(/ (aria-[a-z-]+|tabindex|unselectable|role)="[^"]*"/g, "") : "none";
});
console.log(html.slice(0, 9000));
await browser.close();
