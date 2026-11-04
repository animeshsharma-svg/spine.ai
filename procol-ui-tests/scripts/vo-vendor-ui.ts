// Vendor portal (quotes.ag-ri.in) sign-in for a QA test vendor with the UAT code (never printed) → storage state.
import { chromium, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
const PT = "/Users/animesh/Desktop/procol/procol test";
const { loginOtpCandidates } = await import(pathToFileURL(`${PT}/src/auth/uatOtp.ts`).href);
export async function vendorUiLogin(page: Page, email: string, tenant = 198678) {
  const cands: Array<{ otp: string }> = await loginOtpCandidates({ email }, tenant);
  await page.goto("https://quotes.ag-ri.in/login", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(3000);
  await page.getByText(/Continue with email/i).first().click(); await page.waitForTimeout(600);
  await page.locator('input[type="email"], input[placeholder*="mail" i]').first().fill(email);
  await page.getByRole("button", { name: /send otp|continue|get otp/i }).first().click(); await page.waitForTimeout(2500);
  for (const c of cands) {
    const inputs = page.locator('input[autocomplete="one-time-code"], input[maxlength="1"], input[placeholder*="OTP" i]');
    const n = await inputs.count();
    if (n > 1) { for (let i = 0; i < n; i++) await inputs.nth(i).fill(c.otp[i] ?? ""); } else await inputs.first().fill(c.otp);
    await page.getByRole("button", { name: /login|verify|submit|continue/i }).first().click().catch(() => {});
    await page.waitForTimeout(6000);
    const terms = page.getByRole("checkbox").first();
    if (/login/.test(page.url()) && (await page.getByText(/terms of use|privacy policy/i).count()) && (await terms.count())) { await terms.check().catch(() => {}); await page.getByRole("button", { name: /login|continue|accept/i }).first().click().catch(() => {}); await page.waitForTimeout(5000); }
    if (!/\/login/.test(page.url())) break;
  }
  for (const b of ["Got it", "Not now", "Skip", "Maybe later"]) await page.getByRole("button", { name: b }).first().click({ timeout: 1200 }).catch(() => {});
  return !/\/login/.test(page.url());
}
if (process.argv[1]?.endsWith("vo-vendor-ui.ts")) {
  const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/vo-e2e";
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } }); const page = await ctx.newPage();
  const net: string[] = []; page.on("response", (r) => { const u = r.url(); if (/\/api\//.test(u)) net.push(`${r.request().method()} ${r.status()} ${u.replace(/^https:\/\/[^/]+\/api/, "").slice(0, 150)}`); });
  console.log("signed in:", await vendorUiLogin(page, process.argv[2]), page.url());
  const txt = async () => (await page.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, 1500);
  console.log("HOME:", await txt()); await page.screenshot({ path: `${OUT}/vendor-prospect-home.png` });
  for (const nav of ["Business Partners"]) { await page.getByText(nav, { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(5000); console.log("==", nav, page.url(), await txt()); await page.screenshot({ path: `${OUT}/vendor-prospect-bp.png` }); }
  console.log(net.filter((n) => !/otp|notification|chats|countries|server_current/.test(n)).join("\n"));
  await ctx.storageState({ path: `.auth/vendor-${process.argv[2].split("@")[0]}.json` });
  const { closePool } = await import(pathToFileURL(`${PT}/src/db/pool.ts`).href); await closePool(); await browser.close();
}
