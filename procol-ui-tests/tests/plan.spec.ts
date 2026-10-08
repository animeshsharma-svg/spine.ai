import { NOISE_CONTAINER_TEXT } from "../src/oracle/noise.js";
import { test } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { validatePlan } from "../src/plan/steps.js";
import { runPlan } from "../src/plan/runPlan.js";
import { EvidenceCollector } from "../src/oracle/evidence.js";
import { FlowRecorder } from "../src/support/flowRecorder.js";
import { judge } from "../src/oracle/oracle.js";
import { recordFinding } from "../src/oracle/findings.js";
import { Watchdog } from "../src/support/watchdog.js";
import { BasePage } from "../src/pages/BasePage.js";
import { COMPANY_ID } from "../src/config.js";
import { loginAsCompany, loginOnScreen } from "../src/db/dbLogin.js";
import { closeDb } from "../src/db/multiClient.js";

const companyId = COMPANY_ID ? Number(COMPANY_ID) : null;

test.afterAll(async () => {
  await closeDb().catch(() => {});
});

/**
 * Run a compiled test plan.
 *
 * The plan arrives as a file (UI_PLAN_FILE) rather than through an env string,
 * because plans get long and a shell has opinions about quoting. Results go to
 * UI_PLAN_RESULT so the caller can read what each step did without parsing
 * stdout.
 *
 * A planned run is judged by the same Oracle as a hand-written journey — an
 * AI-authored test that failed because the server threw a 500 is a product
 * defect, exactly as it would be if a person had written the same steps.
 */
const planFile = process.env.UI_PLAN_FILE;

test.skip(!planFile, "no UI_PLAN_FILE given");

test("planned test case", async ({ page }) => {
  const parsed = JSON.parse(readFileSync(planFile!, "utf8"));
  const check = validatePlan(parsed);
  if (!check.ok) throw new Error(`the plan is not runnable: ${check.reason}`);
  const plan = check.plan;
  // A closed-event plan waits for a real bidding window to lapse — the
  // product's smallest preset is 30 minutes and this tenant has no force-end.
  // The default 6-minute test budget killed the wait at 137s; give such plans
  // the time the product demands, and only such plans.
  const waitsForWindow = plan.steps.some((st: { step: string }) => st.step === "close_event");
  test.setTimeout(waitsForWindow ? 48 * 60_000 : 360_000);

  const collector = new EvidenceCollector(page, `plan.${plan.title.replace(/\s+/g, "_").slice(0, 40)}`);
  await collector.installToastRecorder();
  collector.start();

  /**
   * LIVE FRAMES FOR THE DASHBOARD'S SPLIT VIEW.
   *
   * This spec only ever runs through `runUiPlan` (see `test.skip` above), so
   * there is exactly one caller and no reason to gate this behind a flag. A
   * screenshot every 800ms, printed as a stdout line, rides the same pipe the
   * step log already uses (`launch()` in uiFlowRunner.ts pumps every line back
   * to the server) — no new transport, no CDP session, just one more line
   * format the server recognises. Low quality JPEG keeps each line small
   * enough that this stays "watch what's happening now", not a recording.
   */
  let frameTimer: ReturnType<typeof setInterval> | null = setInterval(async () => {
    try {
      const buf = await page.screenshot({ type: "jpeg", quality: 40 });
      console.log(`[frame] ${buf.toString("base64")}`);
    } catch {
      // Mid-navigation or the page just closed — skip this tick, not fatal.
    }
  }, 800);

  // Record the flow's real /api/* calls when asked (UI_RECORD_FLOW=<name>) —
  // no headers, so the token never lands on disk. Piggybacks on the run.
  const recorder = process.env.UI_RECORD_FLOW ? new FlowRecorder(page) : null;
  recorder?.start();

  const base = new (class extends BasePage {})(page);
  const watchdog = new Watchdog(page, {
    stuckAfterMs: Number(process.env.UI_STUCK_MS) || 60_000,
    recover: async () => {
      await base.dismissDistractions();
      return true;
    },
  });
  watchdog.start();

  // Pop-ups unrelated to the test (notification prompt, tours, cookie bars …)
  // are closed BEFORE EVERY ACTION, like a manual QA would — never a failure.
  // Playwright runs this handler whenever the locator is visible before an
  // action or an expectation (oracle/noise.ts holds the list).
  await page
    .addLocatorHandler(
      page.locator(".ant-notification-notice, .ant-message-notice, [role='dialog'], [role='alert'], [class*='popup' i], [class*='banner' i], [class*='cookie' i]").filter({ hasText: NOISE_CONTAINER_TEXT }).first(),
      async () => {
        const closed = await base.dismissDistractions().catch(() => false);
        if (!closed) await page.keyboard.press("Escape").catch(() => {});
        collector.note?.("dismissed an unrelated pop-up (notification prompt / tour / banner)");
      },
      { noWaitAfter: true },
    )
    .catch(() => {});

  // Sign in as the company the dashboard picked, the same way the journeys do
  // (ui-master.spec.ts): on screen when asked (UI_SHOW_LOGIN=1), otherwise the
  // company's session is dropped into the browser. Plans used to lean on the
  // saved clientA session instead — which ran every plan as clientA, and once
  // that session aged out, failed in the OTP setup before step 1.
  if (process.env.UI_SHOW_LOGIN === "1") {
    console.log("[plan] showing the login in this window before the plan runs");
    const who = await loginOnScreen(page, companyId);
    console.log(`[plan] signed in — ${who.how === "on-screen" ? "on screen" : `saved session (${who.fellBackBecause ?? "screen unavailable"})`}`);
  } else if (companyId) {
    await loginAsCompany(page, companyId);
    console.log(`[plan] signed in as company ${companyId}`);
  }

  let failure: Error | null = null;
  let result;
  try {
    result = await runPlan(page, plan);
    // Screen crawl (UI_CRAWL_OUT=<file>): record every control name on the screen the plan
    // ended on — buttons, tabs, menu items, field labels, placeholders, grid headers — so the
    // compiler names things the way the product does (scripts/crawl-screens.ts merges them).
    if (process.env.UI_CRAWL_OUT) {
      const names = await page.evaluate(() => {
        const clean = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim();
        const visible = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const out: Array<{ kind: string; text: string }> = [];
        const add = (kind: string, t: string) => { const x = clean(t); if (x && x.length <= 80 && !/^\d+([.,]\d+)?$/.test(x)) out.push({ kind, text: x }); };
        document.querySelectorAll("button, [role='button']").forEach((el) => visible(el) && add("button", (el as HTMLElement).innerText || el.getAttribute("aria-label") || ""));
        document.querySelectorAll("[role='tab']").forEach((el) => visible(el) && add("tab", (el as HTMLElement).innerText));
        document.querySelectorAll("[role='menuitem']").forEach((el) => visible(el) && add("menuitem", (el as HTMLElement).innerText));
        document.querySelectorAll("label, .ant-form-item-label").forEach((el) => visible(el) && add("label", (el as HTMLElement).innerText));
        document.querySelectorAll("input[placeholder], textarea[placeholder]").forEach((el) => visible(el) && add("placeholder", el.getAttribute("placeholder") || ""));
        document.querySelectorAll("th, .data-grid-container table tr:first-child td").forEach((el) => visible(el) && add("column", (el as HTMLElement).innerText.replace(/\*/g, "")));
        document.querySelectorAll("h1, h2, h3, .ant-drawer-title, .ant-modal-title").forEach((el) => visible(el) && add("heading", (el as HTMLElement).innerText));
        const seen = new Set<string>();
        return out.filter((o) => { const k = `${o.kind}|${o.text}`; if (seen.has(k)) return false; seen.add(k); return true; });
      });
      const { appendFileSync } = await import("node:fs");
      appendFileSync(process.env.UI_CRAWL_OUT, JSON.stringify({ url: new URL(page.url()).pathname, at: new Date().toISOString(), names }) + "\n");
    }
    // Debug only (UI_DUMP_SHEET=1): print the sheet grid's real DOM and what a double-click does.
    if (process.env.UI_DUMP_SHEET === "1") {
      const dump = await page.evaluate(async () => {
        const table = document.querySelector(".data-grid-container table");
        if (!table) return "no grid";
        const rows = [...table.querySelectorAll("tr")];
        const heads = [...rows[0].querySelectorAll("td,th")].map((c) => (c.textContent || "").trim());
        const cells = rows[1] ? [...rows[1].querySelectorAll("td")] : [];
        return JSON.stringify({ heads, cells: cells.slice(0, 10).map((c, i) => ({ i, head: heads[i], cls: c.className, inner: c.innerHTML.slice(0, 140) })) }, null, 1);
      });
      console.log("SHEETDUMP", dump);
      for (const i of [2, 4, 8]) {
        const td = page.locator(".data-grid-container table tr").nth(1).locator("td").nth(i);
        await td.dblclick().catch(() => {});
        await page.waitForTimeout(700);
        const after = await td.evaluate((el) => ({ cls: el.className, inner: el.innerHTML.slice(0, 200), active: document.activeElement ? `${document.activeElement.tagName}.${(document.activeElement as HTMLElement).className}` : null, activeIn: el.contains(document.activeElement) }));
        console.log("DBLCLICK", i, JSON.stringify(after));
        await page.keyboard.press("Escape");
      }
    }
    if (!result.passed) {
      const bad = result.steps.find((s) => s.status === "failed");
      failure = new Error(`step "${bad?.step}" failed: ${bad?.detail}`);
    }
  } catch (err) {
    failure = err instanceof Error ? err : new Error(String(err));
  }

  watchdog.stop();
  if (frameTimer) {
    clearInterval(frameTimer);
    frameTimer = null;
  }
  if (recorder) {
    const file = recorder.save(process.env.UI_RECORD_FLOW!);
    console.log(`[record] captured ${recorder.snapshot().length} API call(s) → ${file}`);
  }
  const evidence = await collector.stop();
  const verdict = judge(evidence, failure);
  recordFinding(evidence, verdict);

  if (result && process.env.UI_PLAN_RESULT) {
    mkdirSync(dirname(process.env.UI_PLAN_RESULT), { recursive: true });
    writeFileSync(process.env.UI_PLAN_RESULT, JSON.stringify({ ...result, verdict }, null, 2));
  }
  if (failure) {
    failure.message = `[${verdict.kind}] ${verdict.title}\n${verdict.rationale}\n\n${failure.message}`;
    throw failure;
  }
});
