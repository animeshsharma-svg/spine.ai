/**
 * Probe the single-stage "Configuration for Event" drawer on the active client through the step's own
 * configure(): traffic light (ranges left empty, awarded as one lot) and Dynamic Event Extension (trigger 0.5),
 * printing what the drawer reads at each stage and where configure() stops.
 *   npx tsx scripts/probe-single-stage-drawer.ts [traffic|dte|both]
 * Uses the runner's saved buyer session (.auth/user.json). Screenshots go to PROBE_OUT (default /tmp).
 */
import { chromium } from "@playwright/test";
import { CONFIG, AUTH_FILE } from "../src/config.js";
import { SingleStagePage } from "../src/pages/SingleStagePage.js";

const OUT = process.env.PROBE_OUT || "/tmp";
const which = process.argv[2] || "both";
const browser = await chromium.launch();

async function scenario(tag: string, cfg: Parameters<SingleStagePage["configure"]>[0]) {
  const ctx = await browser.newContext({ storageState: AUTH_FILE, viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  await page.goto(`${CONFIG.appUrl}/orders/quick-create?singleStage=true`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(5000);
  const single = new SingleStagePage(page);
  const d = single.drawer();
  const dump = async (t: string) => {
    const text = ((await d.innerText().catch(() => "(no drawer)")) || "").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n");
    console.log(`\n=== ${tag}: ${t} === visible=${await d.isVisible().catch(() => false)}\n${text.slice(0, 1800)}`);
    const inputs = await d.locator("input").evaluateAll((els) => els.map((i: any) => `${i.type}${i.getAttribute("aria-label") ? "@" + i.getAttribute("aria-label") : ""}${i.placeholder ? "(" + i.placeholder + ")" : ""}=${i.type === "checkbox" || i.type === "radio" ? i.checked : i.value}`));
    console.log("inputs:", JSON.stringify(inputs));
    await page.screenshot({ path: `${OUT}/probe-${tag}-${t}.png` }).catch(() => {});
  };
  const chip = async () => ((await page.getByRole("button", { name: /^(RFP|RFQ|Auction|rank|price|traffic|knockout|dutch)\b/i }).first().innerText({ timeout: 3000 }).catch(() => "")) || "").trim();
  console.log(`\n##### ${tag} — chip before: "${await chip()}"`);
  const started = Date.now();
  try {
    await single.configure(cfg);
    console.log(`configure ✓ in ${Date.now() - started}ms — chip after: "${await chip()}"`);
    await dump("after-configure");
  } catch (e) {
    console.log(`configure ✗ in ${Date.now() - started}ms — ${(e as Error).message.slice(0, 400)}`);
    await dump("at-failure");
    // reopen if closed, to see what the drawer holds now
    if (!(await d.isVisible().catch(() => false))) {
      await single.openConfigDrawer().catch((x) => console.log("reopen failed:", (x as Error).message.slice(0, 120)));
      await dump("reopened");
    }
  }
  await ctx.close();
}

if (which === "traffic" || which === "both") await scenario("traffic", { eventType: "auction", auctionSubtype: "traffic_light", awarding: "lot", rangeLower: "", rangeUpper: "" });
if (which === "dte" || which === "both") await scenario("dte", { eventType: "auction", dynamicExtension: true, triggerMinutes: "0.5" });
await browser.close();
