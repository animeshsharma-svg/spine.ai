import { NOISE_CONTAINER_TEXT } from "../src/oracle/noise.js";
import { test } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { startLiveFrames } from "../src/support/liveCursor.js";
import { orchestrate } from "../src/support/orchestrator.js";
import { EvidenceCollector } from "../src/oracle/evidence.js";
import { judge } from "../src/oracle/oracle.js";
import { recordFinding } from "../src/oracle/findings.js";
import { BasePage } from "../src/pages/BasePage.js";
import { COMPANY_ID } from "../src/config.js";
import { loginAsCompany, loginOnScreen } from "../src/db/dbLogin.js";
import { closeDb } from "../src/db/multiClient.js";
import { explore } from "../src/explore/explorer.js";
import { installSpotlight, beginStep } from "../src/plan/spotlight.js";

const companyId = COMPANY_ID ? Number(COMPANY_ID) : null;

test.afterAll(async () => {
  await closeDb().catch(() => {});
});

/**
 * A journey with no written steps, worked out on screen (src/explore/explorer.ts).
 *
 * Started by the dashboard when the step compiler has nothing for a typed case
 * (`runUiExplore` in prototype/src/ui/uiFlowRunner.ts). The goal arrives in a
 * file (UI_EXPLORE_FILE), the result goes where a plan's does (UI_PLAN_RESULT)
 * in the same shape, so the session, the verdict and the step screenshots all
 * read it the way they read a plan.
 *
 * No watchdog here, unlike plan.spec.ts: the explorer waits on the tester's
 * answers, and a watchdog that presses Escape after a quiet minute would close
 * the very dialog the question is about.
 */
const exploreFile = process.env.UI_EXPLORE_FILE;

test.skip(!exploreFile, "no UI_EXPLORE_FILE given");

test("explore a journey with no written steps", async ({ page }) => {
  const input = JSON.parse(readFileSync(exploreFile!, "utf8")) as { goal: string };
  const goal = String(input.goal ?? "").trim();
  if (!goal) throw new Error("no goal to explore");
  // Questions wait for a person; the run must outlive a few of them.
  test.setTimeout(Number(process.env.UI_EXPLORE_TIMEOUT_MS) || 90 * 60_000);
  const runId = process.env.QA_RUN_ID ?? `plan-${Date.now().toString(36)}`;

  await orchestrate(page);
  const collector = new EvidenceCollector(page, `explore.${goal.replace(/\s+/g, "_").slice(0, 40)}`);
  await collector.installToastRecorder();
  collector.start();
  let stopFrames: (() => void) | null = startLiveFrames(page);

  const base = new (class extends BasePage {})(page);
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

  if (process.env.UI_SHOW_LOGIN === "1") {
    console.log("[explore] showing the login in this window first");
    const who = await loginOnScreen(page, companyId);
    console.log(`[explore] signed in — ${who.how === "on-screen" ? "on screen" : `saved session (${who.fellBackBecause ?? "screen unavailable"})`}`);
  } else if (companyId) {
    await loginAsCompany(page, companyId);
    console.log(`[explore] signed in as company ${companyId}`);
  }
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  // A framed picture of every action, as a typed plan has (spotlight.ts) — from
  // here, after sign-in, so the login is not photographed (UI_SPOTLIGHT=0: off).
  installSpotlight(page, `${process.cwd()}/evidence/${runId.replace(/[^\w.-]+/g, "_")}`);
  beginStep(0, "working it out on screen", 0);

  let failure: Error | null = null;
  let result;
  try {
    result = await explore(page, { goal, runId, companyId });
    if (!result.passed) failure = new Error(`the journey was not completed: ${result.reason ?? "it stopped"}`);
  } catch (err) {
    failure = err instanceof Error ? err : new Error(String(err));
  }

  if (stopFrames) {
    stopFrames();
    stopFrames = null;
  }
  const evidence = await collector.stop();
  const verdict = judge(evidence, failure);
  // Only what the APP did wrong becomes a finding (a 5xx, an error message of
  // its own). An explorer that stopped because it was stuck, or because the
  // tester said stop, is not a harness bug for the Bugs page: the session's
  // closing box already says where and why it stopped.
  if (verdict.kind === "product_defect") recordFinding(evidence, verdict);

  if (process.env.UI_PLAN_RESULT) {
    mkdirSync(dirname(process.env.UI_PLAN_RESULT), { recursive: true });
    const out = result ?? { title: goal, goal, explored: true, passed: false, steps: [], told: [], route: {}, reason: failure?.message };
    writeFileSync(process.env.UI_PLAN_RESULT, JSON.stringify({ ...out, verdict }, null, 2));
  }
  if (failure) {
    failure.message = `[${verdict.kind}] ${verdict.title}\n${verdict.rationale}\n\n${failure.message}`;
    throw failure;
  }
});
