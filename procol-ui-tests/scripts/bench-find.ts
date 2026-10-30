import { chromium } from "@playwright/test";
import { countVisible, findVisible, scopeFor, type Target } from "../src/plan/generic/find.js";

/**
 * Ask the executor's finder what it sees on a page: open the page, perform
 * optional click/hover actions, then run findVisible for a JSON target and
 * print the strategy that matched (or every strategy that did not).
 *
 *   APP_URL=https://qa-agents-bench.com npx tsx scripts/bench-find.ts /sandbox/h-11/ '{"role":"row","name":"Q3 $4.8M","within":"2025 results"}' [hover=Text] [click=Text]
 */
const [path, targetJson, ...actions] = process.argv.slice(2);
const base = process.env.APP_URL ?? "https://qa-agents-bench.com";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(base + path);
await page.waitForTimeout(600);
for (const act of actions) {
  const [verb, ...rest] = act.split("=");
  const arg = rest.join("=");
  if (verb === "hover") await page.getByText(arg).first().hover();
  if (verb === "click") await page.getByText(arg).first().click({ timeout: 5_000 });
  await page.waitForTimeout(500);
}
const t = JSON.parse(targetJson) as Target;
if (t.within) {
  const sc = await scopeFor(page, t.within);
  const root = sc.root as import("@playwright/test").Locator;
  const n = typeof (root as any).count === "function" ? await root.count().catch(() => -1) : -1;
  console.log(`scope${sc.note}: ${n} element(s)`);
  if (n > 0) console.log(`  scope[0]: ${(await root.first().evaluate((el) => (el as HTMLElement).outerHTML.replace(/ style="[^"]*"/g, ""))).slice(0, 240)}`);
}
const started = Date.now();
const found = await findVisible(page, t, 5_000);
if (found) {
  console.log(`found in ${Date.now() - started}ms by: ${found.strategy} (${found.visible} visible)`);
  console.log(`  first match: ${(await found.locator.evaluate((n) => (n as HTMLElement).outerHTML.replace(/ style="[^"]*"/g, ""))).slice(0, 300)}`);
  console.log(`  checked: ${await found.locator.isChecked().catch(() => "n/a")}`);
}
else console.log(`not found: ${(await countVisible(page, t)).strategy}`);
await browser.close();
