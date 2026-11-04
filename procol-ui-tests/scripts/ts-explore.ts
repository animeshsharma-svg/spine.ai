// Look around Manage Templates on cpanel with the saved clientA session (read-only).
import { chromium } from "@playwright/test";
const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/template-studio";
const APP = process.env.APP ?? "https://cpanel.ag-ri.in";
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: ".auth/user.json", viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const log: string[] = [];
page.on("response", (r) => { const u = r.url(); if (/\/api\/(templates|widget_data|ask_ai|external_req)/.test(u)) log.push(`${r.request().method()} ${r.status()} ${u.replace(/^https:\/\/[^/]+/, "")}`); });
for (const path of ["/controls", "/template-studio"]) {
  await page.goto(APP + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/explore${path.replace(/\//g, "_")}.png` });
  console.log("==", path, "→", page.url());
  console.log((await page.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, 1500));
}
console.log(log.join("\n"));
await browser.close();
