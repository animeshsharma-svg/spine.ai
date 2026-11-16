// Sign in on the vendor portal as a QA test vendor and look at its onboarding event (read-only).
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/vo-e2e";
const env = Object.fromEntries(readFileSync(".env", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).trim()]));
const email = process.argv[2];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
const calls: string[] = [];
page.on("response", (r) => { const u = r.url(); if (/\/api\//.test(u) && !/\.(js|css|png)/.test(u)) calls.push(`${r.request().method()} ${r.status()} ${u.replace(/^https:\/\/[^/]+\/api/, "").slice(0, 120)}`); });
await page.goto("https://quotes.ag-ri.in/login", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(4000);
const txt = async () => (await page.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, 900);
console.log("LOGIN:", await txt());
await page.getByText(/Continue with email/i).first().click().catch(() => {});
await page.waitForTimeout(800);
await page.locator('input[type="email"], input[placeholder*="mail" i]').first().fill(email);
await page.getByRole("button", { name: /send otp|continue|get otp/i }).first().click();
await page.waitForTimeout(2500);
const otpInputs = page.locator('input[autocomplete="one-time-code"], input[maxlength="1"], input[placeholder*="OTP" i]');
const n = await otpInputs.count();
if (n > 1) { for (let i = 0; i < n; i++) await otpInputs.nth(i).fill(env.CLIENTA_OTP[i] ?? ""); } else await otpInputs.first().fill(env.CLIENTA_OTP);
await page.getByRole("button", { name: /login|verify|submit|continue/i }).first().click().catch(() => {});
await page.waitForTimeout(7000);
for (const b of ["Got it", "Not now", "Skip"]) await page.getByRole("button", { name: b }).first().click({ timeout: 1500 }).catch(() => {});
console.log("AFTER LOGIN url:", page.url()); console.log(await txt());
await page.screenshot({ path: `${OUT}/vendor-home.png` });
for (const nav of ["Events", "Business Partners"]) {
  await page.getByText(nav, { exact: true }).first().click().catch((e) => console.log("nav fail", nav));
  await page.waitForTimeout(5000);
  console.log("==", nav, page.url()); console.log(await txt());
  await page.screenshot({ path: `${OUT}/vendor-${nav.replace(/ /g, "-").toLowerCase()}.png` });
}
console.log(calls.filter((c) => !/generate_otp|verify_otp/.test(c)).slice(0, 30).join("\n"));
await browser.close();
