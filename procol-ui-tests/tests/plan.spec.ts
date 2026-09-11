import { test } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { validatePlan } from "../src/plan/steps.js";
import { runPlan } from "../src/plan/runPlan.js";
import { EvidenceCollector } from "../src/oracle/evidence.js";
import { judge } from "../src/oracle/oracle.js";
import { recordFinding } from "../src/oracle/findings.js";
import { Watchdog } from "../src/support/watchdog.js";
import { BasePage } from "../src/pages/BasePage.js";
import { LoginPage } from "../src/pages/LoginPage.js";
import { CONFIG, STORAGE_KEYS } from "../src/config.js";

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

  const collector = new EvidenceCollector(page, `plan.${plan.title.replace(/\s+/g, "_").slice(0, 40)}`);
  await collector.installToastRecorder();
  collector.start();

  const base = new (class extends BasePage {})(page);
  const watchdog = new Watchdog(page, {
    stuckAfterMs: Number(process.env.UI_STUCK_MS) || 60_000,
    recover: async () => {
      await base.dismissDistractions();
      return true;
    },
  });
  watchdog.start();

  // A demo wants the login SEEN. The saved session skips it, and forcing the
  // setup project would open a second window. So: in this same window, drop
  // the saved token, go to the login page and log in for real, then run the
  // plan. Verification runs never set UI_SHOW_LOGIN.
  if (process.env.UI_SHOW_LOGIN === "1") {
    console.log("[plan] showing the login in this window before the plan runs");
    await page.goto(CONFIG.appUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.evaluate((k) => localStorage.removeItem(k), STORAGE_KEYS.accessToken).catch(() => {});
    await page.context().clearCookies().catch(() => {});
    const login = new LoginPage(page);
    await login.goto();
    await login.login();
    console.log(`[plan] logged in as the buyer — ${(await login.isLoggedIn()) ? "token present" : "token NOT present"}`);
  }

  let failure: Error | null = null;
  let result;
  try {
    result = await runPlan(page, plan);
    if (!result.passed) {
      const bad = result.steps.find((s) => s.status === "failed");
      failure = new Error(`step "${bad?.step}" failed: ${bad?.detail}`);
    }
  } catch (err) {
    failure = err instanceof Error ? err : new Error(String(err));
  }

  watchdog.stop();
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
