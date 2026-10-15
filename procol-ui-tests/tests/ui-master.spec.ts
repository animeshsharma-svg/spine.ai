import { test } from "@playwright/test";
import { lastVerification } from "../src/flows/shared/verifyEvent.js";
import { CONFIG, COMPANY_ID } from "../src/config.js";
import { ClientConfig } from "../src/master/config.js";
import { REGISTRY, registryByCategory } from "../src/master/registry.js";
import { UiFlowContext } from "../src/master/types.js";
import { resolveCompanyLogin, closeDb } from "../src/db/multiClient.js";
import { quietCapabilityMap, paramSummary } from "../src/master/params.js";
import { closeHealer, healerEnabled } from "../src/ai/healer.js";
import { loginAsCompany, loginOnScreen, type SignedIn } from "../src/db/dbLogin.js";
import { EvidenceCollector } from "../src/oracle/evidence.js";
import { judge } from "../src/oracle/oracle.js";
import { FINDINGS_DIR, recordFinding, runId } from "../src/oracle/findings.js";
import { Watchdog } from "../src/support/watchdog.js";
import { BasePage } from "../src/pages/BasePage.js";
import { startLiveFrames } from "../src/support/liveCursor.js";
import { orchestrate } from "../src/support/orchestrator.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Config-gated UI master runner — the UI twin of the API framework's
 * tests/master.spec.ts. For the active client it:
 *   1. loads the client's config once (read-only probe),
 *   2. prints a per-client capability map,
 *   3. runs each enabled flow (skips disabled ones with a reason).
 *
 * Run: npx playwright test tests/ui-master.spec.ts
 * Switch client: ACTIVE_CLIENT=<name> npx playwright test tests/ui-master.spec.ts
 */

let config: ClientConfig;
const companyId = COMPANY_ID ? Number(COMPANY_ID) : null;

/** Screenshot of the screen the journey ended on, saved beside the findings. */
async function captureShot(
  page: import("@playwright/test").Page,
  flowKey: string,
  kind: "failed" | "final",
): Promise<string | undefined> {
  try {
    const dir = join(FINDINGS_DIR, "shots");
    mkdirSync(dir, { recursive: true });
    const name = `${runId()}__${flowKey.replace(/[^a-z0-9]+/gi, "-")}__${kind}.png`;
    await page.screenshot({ path: join(dir, name), fullPage: false });
    return `shots/${name}`;
  } catch {
    return undefined;
  }
}

/**
 * The outcome of every journey, pass included.
 *
 * Findings only exist for failures, so a passing run left nothing behind and
 * the platform's report had nothing to show for it — which is exactly when
 * someone asks "it said it passed, where is the report?". One record per
 * journey per run, written whatever happened, is what the report reads.
 */
async function recordResult(result: {
  flowKey: string;
  title: string;
  category: string;
  covers?: string;
  status: "passed" | "broke";
  startedAt: string;
  durationMs: number;
  companyId: number | null;
  url?: string;
  screenshot?: string;
  error?: string;
  httpFailures?: number;
  toasts?: number;
  /**
   * The failing requests and console errors THEMSELVES, not just how many.
   *
   * Only the counts used to be written, so a journey that passed while the app
   * answered two 500s in the background reported "httpFailures: 2" — a number
   * with nothing behind it, on a green run nobody looked at twice. The rows
   * are what make that actionable: the method, the route and the status are
   * the whole finding.
   *
   * Bodies are deliberately left out here. They can run to a kilobyte each and
   * can carry whatever the API echoed back; the finding path already keeps
   * them for a run that actually broke, and this record is written on every
   * run, passing ones included.
   */
  failedRequests?: Array<{ method: string; path: string; status: number; at?: string }>;
  consoleErrors?: string[];
  errorToasts?: string[];
  /**
   * What the event turned out to be when the journey read it back — the
   * difference between "the script finished" and "the event is the one we
   * asked for". See `src/flows/shared/verifyEvent.ts`.
   */
  verified?: { via: string; reason?: string; checks: unknown[] };
  /** How the journey signed in — through the login screen, or with an injected session. */
  signedIn?: SignedIn;
}): Promise<void> {
  try {
    const dir = join(FINDINGS_DIR, "results");
    mkdirSync(dir, { recursive: true });
    const name = `${runId()}__${result.flowKey.replace(/[^a-z0-9]+/gi, "-")}.json`;
    writeFileSync(join(dir, name), JSON.stringify({ runId: runId(), ...result }, null, 2));
  } catch {
    // A report-writing problem must never change a journey's verdict.
  }
}

test.beforeAll(async () => {
  if (companyId) {
    // Multi-client: load THIS company's config via its DB-session token.
    const login = await resolveCompanyLogin(companyId);
    config = await ClientConfig.load(CONFIG, login?.accessToken);
  } else {
    config = await ClientConfig.load(CONFIG);
  }

  // When the dashboard runs ONE journey it sets UI_QUIET_MAP=1 — printing the
  // whole capability map there makes it look like every flow is executing.
  if (quietCapabilityMap()) {
    console.log(`UI run — client "${CONFIG.name}"${COMPANY_ID ? ` (COMPANY_ID=${COMPANY_ID})` : ""} · ${paramSummary()} · AI healer ${healerEnabled() ? "ON" : "off"}`);
    return;
  }

  const byCat = registryByCategory();
  const lines: string[] = [];
  lines.push("");
  lines.push("════════════════════════════════════════════════════════════════");
  lines.push(` UI capability map — client "${CONFIG.name}"${COMPANY_ID ? ` (COMPANY_ID=${COMPANY_ID})` : ""}`);
  lines.push(`   app: ${CONFIG.appUrl}`);
  lines.push(`   api: ${CONFIG.apiUrl}`);
  lines.push(`   config: ${config.loaded ? `loaded (${config.moduleNames().length} modules)` : `NOT loaded — ${config.note ?? "unknown"} (gates fail-open)`}`);
  lines.push("────────────────────────────────────────────────────────────────");
  for (const [cat, mods] of Object.entries(byCat)) {
    lines.push(` [${cat}]`);
    for (const m of mods) {
      const g = m.enabledFor(config);
      lines.push(`   ${g.enabled ? "✓" : "–"} ${m.key} — ${m.title}${g.enabled ? "" : `  (skip: ${g.reason})`}`);
    }
  }
  lines.push("════════════════════════════════════════════════════════════════");
  console.log(lines.join("\n"));
});

test.afterAll(async () => {
  await closeHealer().catch(() => {});
  await closeDb().catch(() => {});
});

for (const mod of REGISTRY) {
  test(`${mod.key} — ${mod.title}`, async ({ page }) => {
    const g = mod.enabledFor(config);
    test.skip(!g.enabled, `disabled for ${companyId ?? CONFIG.name}: ${g.reason}`);
    // Pop-ups are closed by one watcher in the page from the first screen on (support/orchestrator.ts).
    await orchestrate(page);

    // Live frames for the dashboard's split view — the same "[frame] <jpeg>"
    // lines plan.spec.ts prints, so a journey shows its browser beside its
    // steps the way a typed test case does. Only when the dashboard asks
    // (UI_LIVE_FRAMES=1); started before sign-in so an on-screen login is seen.
    if (process.env.UI_LIVE_FRAMES === "1") {
      // Plus one each time the pointer lands on an element before an action
      // (liveCursor.ts); the feed stops when the page closes.
      startLiveFrames(page);
    }

    // Sign in. On screen when asked (UI_SHOW_LOGIN=1 — the dashboard's
    // "sign in on screen" switch), so a watcher sees the login and the login
    // page itself is exercised; otherwise the multi-client fast path drops the
    // target company's session into the browser before the flow starts.
    let signedIn: SignedIn | undefined;
    if (process.env.UI_SHOW_LOGIN === "1") signedIn = await loginOnScreen(page, companyId);
    else if (companyId) await loginAsCompany(page, companyId);

    const ctx: UiFlowContext = { page, profile: CONFIG, config };

    // Evidence in, verdict out. A red test on its own says nothing useful — the
    // same "waitForURL timed out" covers a broken selector and a 500 from the
    // publish API. The collector records what the app actually did (its HTTP
    // failures, its own toasts, its console) and the Oracle classifies the
    // outcome deterministically, so a run reports findings a human can act on
    // instead of a wall of red.
    const collector = new EvidenceCollector(page, mod.key);
    await collector.installToastRecorder();
    collector.start();

    const startedMs = Date.now();

    // A frozen screen is its own failure mode, distinct from a wrong locator.
    // The watchdog notices when nothing has changed for a minute and tries the
    // cheap recoveries a human would, so a stall has a chance to resolve
    // instead of burning the step's whole timeout.
    const base = new (class extends BasePage {})(page);
    const watchdog = new Watchdog(page, {
      stuckAfterMs: Number(process.env.UI_STUCK_MS) || 60_000,
      onStuck: ({ forMs, url }) =>
        console.log(`[watchdog] stalled ${Math.round(forMs / 1000)}s on ${url}`),
      recover: async () => {
        await base.dismissDistractions();
        return true;
      },
    });
    watchdog.start();

    let failure: Error | null = null;
    try {
      await mod.run(ctx);
    } catch (err) {
      failure = err instanceof Error ? err : new Error(String(err));
    }

    const { stalls } = watchdog.stop();
    if (stalls) console.log(`[watchdog] ${stalls} stall(s) during this journey`);
    const evidence = await collector.stop();

    /**
     * A picture of the moment it broke.
     *
     * Playwright already keeps a screenshot on failure, but it is filed under
     * a directory named after the test title, which the platform would have to
     * guess at. Taking one here and recording the path WITH the finding means
     * the report can show the screen the journey died on — which is usually
     * the fastest way to see whether the app moved a button or actually broke.
     * Failure to capture must never mask the original failure, hence catch().
     */
    // A picture either way: the screen it died on, or the screen it finished on.
    // On a pass that is the published event — the proof the journey did what it
    // claims, which is worth as much in a report as a failure shot.
    const shot = await captureShot(page, mod.key, failure ? "failed" : "final");
    if (failure) evidence.screenshot = shot;
    if (stalls) evidence.notes.push(`the screen stalled ${stalls} time(s) during this run`);
    const verdict = judge(evidence, failure);
    const finding = recordFinding(evidence, verdict);
    if (finding) {
      console.log(`[oracle] ${verdict.kind.toUpperCase()} · ${verdict.severity} — ${verdict.title}`);
      console.log(`[oracle] ${verdict.rationale}`);
    }

    await recordResult({
      flowKey: mod.key,
      title: mod.title,
      category: mod.category,
      covers: mod.covers,
      status: failure ? "broke" : "passed",
      startedAt: evidence.startedAt,
      durationMs: Date.now() - startedMs,
      companyId,
      url: evidence.url,
      screenshot: shot,
      error: failure?.message?.split("\n")[0],
      httpFailures: evidence.httpFailures?.length ?? 0,
      toasts: (evidence.toasts ?? []).filter((t) => t.severity === "error").length,
      // Capped: a journey that trips one broken endpoint on a loop would
      // otherwise write hundreds of identical rows into a result file that is
      // kept for every run.
      failedRequests: (evidence.httpFailures ?? [])
        .slice(0, 25)
        .map((f) => ({ method: f.method, path: f.path, status: f.status, at: f.at })),
      consoleErrors: (evidence.consoleErrors ?? []).slice(0, 25),
      errorToasts: (evidence.toasts ?? [])
        .filter((t) => t.severity === "error")
        .slice(0, 25)
        .map((t) => t.text),
      verified: lastVerification() ?? undefined,
      signedIn,
    });

    if (failure) {
      // Lead with the verdict so the reporter's first line already says whether
      // a human should look at the product or at the test.
      failure.message = `[${verdict.kind}] ${verdict.title}\n${verdict.rationale}\n\n${failure.message}`;
      throw failure;
    }
  });
}
