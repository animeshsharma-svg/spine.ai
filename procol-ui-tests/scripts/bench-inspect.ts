import { chromium } from "@playwright/test";

/**
 * Look at a bench page the way the executor would: open it, perform a few
 * plain actions, and print the accessibility tree after each — the quickest
 * way to see why a generic step could not find what the case names.
 *
 *   APP_URL=https://qa-agents-bench.com npx tsx scripts/bench-inspect.ts /sandbox/r-15/ hover=TV\ Shows click=Charts fill=Email=a@b.c
 */
const [path, ...actions] = process.argv.slice(2);
const base = process.env.APP_URL ?? "https://qa-agents-bench.com";
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("dialog", (d) => console.log(`  [dialog ${d.type()}] ${d.message()}`));
await page.goto(base + path);
await page.waitForTimeout(800);
const dump = async (label: string) => {
  const snap = await page.locator("body").ariaSnapshot().catch(() => "(no snapshot)");
  const frames = page.frames().length - 1;
  console.log(`\n### after ${label} — url ${page.url().replace(base, "")}${frames ? ` — ${frames} child frame(s)` : ""}\n${snap.slice(0, Number(process.env.INSPECT_CHARS) || 3500)}`);
  for (const f of page.frames().slice(1)) console.log(`\n--- frame ${f.url().replace(base, "")}\n${(await f.locator("body").ariaSnapshot().catch(() => "")).slice(0, 1200)}`);
};
await dump("load");
for (const act of actions) {
  const [verb, ...rest] = act.split("=");
  const arg = rest.join("=");
  try {
    if (verb === "hover") await page.getByText(arg, { exact: false }).first().hover();
    else if (verb === "click") await page.getByText(arg, { exact: false }).first().click({ timeout: 5_000 });
    else if (verb === "clickrole") {
      const [role, name] = arg.split(":");
      await page.getByRole(role as any, { name }).first().click({ timeout: 5_000 });
    } else if (verb === "fill") {
      const [label, value] = arg.split("=");
      await page.getByLabel(label).first().fill(value);
    } else if (verb === "wait") await page.waitForTimeout(Number(arg));
    else if (verb === "type") {
      const [label, value] = arg.split("=");
      await page.getByLabel(label).first().pressSequentially(value, { delay: 40 });
    } else if (verb === "press") await page.keyboard.press(arg);
    else if (verb === "html") console.log((await page.locator(arg).first().evaluate((n) => n.outerHTML)).slice(0, 2500));
    else if (verb === "eval") console.log(String(await page.evaluate(arg)).slice(0, 3000));
  } catch (e) {
    console.log(`  !! ${act}: ${(e as Error).message.split("\n")[0]}`);
  }
  await page.waitForTimeout(600);
  if (verb !== "html") await dump(act);
}
await browser.close();
