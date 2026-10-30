import { NOISE_CONTAINER_TEXT } from "../src/oracle/noise.js";
import { test } from "@playwright/test";
import { startLiveFrames } from "../src/support/liveCursor.js";
import { startRunVideo } from "../src/support/runVideo.js";
import { orchestrate } from "../src/support/orchestrator.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
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

// The run's own record replaces Playwright's: a text record per step (observe.ts), a picture where a
// step fails, and the full replay (trace) of a failed run kept beside its evidence — not in
// test-results, which the next run wipes. No video: the live view is the moving picture.
test.use({ trace: "off", video: "off", screenshot: "off" });

/** The plan file, checked; throws when it cannot run. */
function readPlan() {
  const parsed = JSON.parse(readFileSync(planFile!, "utf8"));
  const check = validatePlan(parsed);
  if (!check.ok) throw new Error(`the plan is not runnable: ${check.reason}`);
  return check.plan;
}

// A closed-event plan waits for a real bidding window to lapse — the
// product's smallest preset is 30 minutes and this tenant has no force-end.
// The default 6-minute test budget killed the wait at 137s; give such plans
// the time the product demands, and only such plans.
// 12 minutes for the rest, not 6: on a slow UAT day (23 Oct) a single invite took minutes and
// the 6-minute budget closed the browser mid-step (A16 rerun), after the case's real check had passed.
// An exploration (probe_controls) clicks each control on a reloaded screen, ~15 s a click: give it that time.
const budgetFor = (plan: { steps: Array<{ step: string; args?: Record<string, unknown> }> }) =>
  plan.steps.some((st) => st.step === "close_event") ? 48 * 60_000 : 12 * 60_000 + plan.steps.filter((st) => st.step === "probe_controls" && !st.args?.listOnly).length * 15 * 60_000;

/** Sign in as the company the dashboard picked (see the comment where the plan signs in below). */
async function signIn(page: import("@playwright/test").Page, buyerUserId?: number) {
  if (process.env.UI_SHOW_LOGIN === "1") {
    console.log("[plan] showing the login in this window before the plan runs");
    const who = await loginOnScreen(page, companyId);
    console.log(`[plan] signed in — ${who.how === "on-screen" ? "on screen" : `saved session (${who.fellBackBecause ?? "screen unavailable"})`}`);
  } else if (companyId) {
    const who = await loginAsCompany(page, companyId, buyerUserId || undefined);
    console.log(`[plan] signed in as company ${companyId}${buyerUserId ? ` (user ${who.userId}, the API setup's buyer)` : ""}`);
  }
}

/**
 * WARM START (UI_PLAN_WAIT=1): the server starts this run the moment it starts compiling, so the
 * browser opens and signs in while the case compiles (15–25 s) instead of after it (Aanya, 27 Oct:
 * "too slow", "boring for the user watching"). The plan file is written when the compile is done;
 * a `<run>-cancel.json` beside it means the server will not run a plan here after all (the case
 * went to the explorer, or nothing could be compiled) and this run ends without testing anything.
 */
async function waitForPlan(limitMs: number): Promise<{ plan: ReturnType<typeof readPlan> } | { cancelled: string }> {
  const cancelFile = planFile!.replace(/\.json$/, "-cancel.json");
  const until = Date.now() + limitMs;
  let said = false;
  while (Date.now() < until) {
    if (existsSync(cancelFile)) {
      const why = (() => {
        try {
          return String(JSON.parse(readFileSync(cancelFile, "utf8")).why ?? "");
        } catch {
          return "";
        }
      })();
      return { cancelled: why || "the server called it off" };
    }
    if (existsSync(planFile!)) {
      try {
        return { plan: readPlan() };
      } catch (e) {
        // Half-written: read it again on the next tick. A plan that cannot run throws once it is whole.
        if (!/JSON|Unexpected end/i.test(String((e as Error).message))) throw e;
      }
    }
    if (!said) {
      console.log("[plan] signed in; waiting for the compiled steps");
      said = true;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`the compiled steps did not arrive within ${Math.round(limitMs / 60_000)} min`);
}

test("planned test case", async ({ page }) => {
  const warm = process.env.UI_PLAN_WAIT === "1";
  // Warm: the budget covers the wait for the compile and the sign-in, and is set again once the plan is known.
  let plan = warm ? null : readPlan();
  test.setTimeout(plan ? budgetFor(plan) : 6 * 60_000);

  // Pop-ups are closed by one watcher in the page from the first screen on (support/orchestrator.ts).
  await orchestrate(page);
  let stopFrames: (() => void) | null = null;
  if (warm) {
    // The live view from second one: the sign-in is what the tester sees while the case compiles.
    stopFrames = startLiveFrames(page);
    console.log("[plan] opening the browser and signing in while your case compiles");
    const waitStarted = Date.now();
    await signIn(page);
    const got = await waitForPlan(5 * 60_000);
    if ("cancelled" in got) {
      console.log(`[plan] no plan to run in this browser — ${got.cancelled}`);
      stopFrames();
      return;
    }
    plan = got.plan;
    test.setTimeout(Date.now() - waitStarted + budgetFor(plan) + 60_000);
    // A plan on an API-built event runs as that event's buyer; the warm sign-in was the company's own.
    if (process.env.UI_SHOW_LOGIN !== "1" && Number(plan.context?.buyerUserId)) await signIn(page, Number(plan.context?.buyerUserId));
  }
  if (!plan) throw new Error("no plan");
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
  // The frames, plus one each time the pointer lands on an element before an
  // action, so every click and keystroke shows where it happened (liveCursor.ts).
  if (!stopFrames) stopFrames = startLiveFrames(page);

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
  // (A warm start signed in already, before its plan arrived.)
  if (!warm) await signIn(page, Number(plan.context?.buyerUserId) || undefined);

  // The full replay of the run (Playwright trace: each action, the page as it was, its requests),
  // started after sign-in so no one-time code is in it, and kept only when the run fails.
  const traceAt = join(process.cwd(), "evidence", String(process.env.QA_RUN_ID ?? "plan").replace(/[^\w.-]+/g, "_"), "trace.zip");
  const tracing = await page.context().tracing.start({ snapshots: true, screenshots: false, sources: false }).then(() => true).catch(() => false);
  // A video of the run, from the live view's own frames, kept only when it fails (runVideo.ts); no sign-in screen is in it.
  const video = startRunVideo(dirname(traceAt));

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

  // The screen the run ENDED on, kept as one picture numbered after the last step: a saved run's
  // Browser panel shows its highest-numbered picture, and with pictures only where something went
  // wrong that was a mid-run one (27 Oct: ZE5kY2RO had published, but the panel showed step 10's
  // create screen and read as "done without publishing").
  if (result?.steps?.length) {
    const n = String(Math.min(99, result.steps.length + 1)).padStart(2, "0");
    await page.screenshot({ path: join(dirname(traceAt), `${n}-end.png`) }).catch(() => {});
  }

  watchdog.stop();
  if (stopFrames) {
    stopFrames();
    stopFrames = null;
  }
  if (recorder) {
    const file = recorder.save(process.env.UI_RECORD_FLOW!);
    console.log(`[record] captured ${recorder.snapshot().length} API call(s) → ${file}`);
  }
  const evidence = await collector.stop();
  // What the case itself expected the app to refuse with, as its own steps saw
  // it ("blocked: Please fill project title!") — the oracle must not file that as the finding.
  const expectedSays = (result?.steps ?? [])
    .filter((s) => s.status === "ok" && (/blocked|refus|reject/i.test(s.step) || /^blocked:|refused by the app/i.test(String(s.detail ?? ""))))
    .flatMap((s) => [String((s.args as any)?.because ?? (s.args as any)?.message ?? ""), String(s.detail ?? "").replace(/^blocked:\s*/i, "").split(" — ").pop() ?? ""])
    .map((t) => t.replace(/^["“]|["”]$/g, "").trim())
    .filter((t) => t.length >= 4);
  const verdict = judge(evidence, failure, { expected: expectedSays });
  recordFinding(evidence, verdict);

  let trace: string | undefined;
  await video.finish(!!failure || (result ? !result.passed : true)).catch(() => null);
  if (tracing) {
    const keep = !!failure || (result ? !result.passed : true);
    if (keep) mkdirSync(dirname(traceAt), { recursive: true });
    trace = await page.context().tracing.stop(keep ? { path: traceAt } : undefined).then(() => (keep ? traceAt : undefined)).catch(() => undefined);
    if (trace) console.log(`[plan] the full replay of this failed run is kept: ${trace}`);
  }
  if (result && process.env.UI_PLAN_RESULT) {
    mkdirSync(dirname(process.env.UI_PLAN_RESULT), { recursive: true });
    writeFileSync(process.env.UI_PLAN_RESULT, JSON.stringify({ ...result, verdict, ...(trace ? { trace } : {}) }, null, 2));
  }
  if (failure) {
    failure.message = `[${verdict.kind}] ${verdict.title}\n${verdict.rationale}\n\n${failure.message}`;
    throw failure;
  }
});
