import { chromium } from "@playwright/test";
const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/vo-e2e";
const email = process.argv[2];
const browser = await chromium.launch(); const ctx = await browser.newContext({ storageState: `.auth/vendor-${email.split("@")[0]}.json`, viewport: { width: 1500, height: 950 } }); const page = await ctx.newPage();
const net: string[] = []; page.on("response", (r) => { const u = r.url(); if (/\/api\//.test(u) && r.request().method() !== "OPTIONS") net.push(`${r.request().method()} ${r.status()} ${u.replace(/^https:\/\/[^/]+\/api/, "").slice(0, 150)}`); });
await page.goto("https://quotes.ag-ri.in/events", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(5000);
for (const b of ["Got it", "Not now"]) await page.getByRole("button", { name: b }).first().click({ timeout: 1200 }).catch(() => {});
await page.getByText(/Vendor Onboarding/).first().click(); await page.waitForTimeout(6000);
console.log("URL", page.url());
const txt = async () => (await page.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, 2500);
console.log("PAGE:", await txt()); await page.screenshot({ path: `${OUT}/vendor-form-1.png`, fullPage: true });
const btns = (await page.locator("button").allInnerTexts()).map((s) => s.trim()).filter(Boolean); console.log("BUTTONS:", btns.join(" | "));
const tabs = (await page.getByRole("tab").allInnerTexts()).map((s) => s.trim()); console.log("TABS:", tabs.join(" | "));
for (const t of tabs.filter((x) => !/overview/i.test(x)).slice(0, 1)) { await page.getByRole("tab", { name: t }).first().click(); await page.waitForTimeout(4000); console.log("TAB", t, await txt()); await page.screenshot({ path: `${OUT}/vendor-form-2.png`, fullPage: true }); }
const inputs = await page.evaluate(() => Array.from(document.querySelectorAll("input, textarea, [role=combobox]")).map((e: any) => `${e.tagName}|${e.type ?? ""}|${e.placeholder ?? ""}|${e.getAttribute("data-testid") ?? ""}|${(e.closest("[class]") as any)?.className?.toString().slice(0, 50)}`).slice(0, 30));
console.log("INPUTS:", inputs.join("\n  "));
console.log(net.filter((n) => !/notification|chats|countries|server_current|views\?/.test(n)).join("\n"));
await browser.close();
