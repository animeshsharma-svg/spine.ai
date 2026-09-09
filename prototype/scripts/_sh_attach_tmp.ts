import { Stagehand, localBrowser } from "@browserbasehq/stagehand";
const browser = await localBrowser.launch({ headless: true });
const sh = await Stagehand.create({ browser });      // no model = fine for non-LLM steps
const ctx: any = sh.browser.context;
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
const shot = await page.screenshot();
console.log("attach ok · navigated · screenshot bytes =", shot.length);
await sh.close();
console.log("closed ok");
