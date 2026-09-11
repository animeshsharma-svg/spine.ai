import { test } from "@playwright/test";
import { CONFIG, COMPANY_ID } from "../src/config.js";
import { ClientConfig } from "../src/master/config.js";
import { REGISTRY, registryByCategory } from "../src/master/registry.js";
import { UiFlowContext } from "../src/master/types.js";
import { resolveCompanyLogin, closeDb } from "../src/db/multiClient.js";
import { quietCapabilityMap, paramSummary } from "../src/master/params.js";
import { closeHealer, healerEnabled } from "../src/ai/healer.js";
import { loginAsCompany } from "../src/db/dbLogin.js";
import { EvidenceCollector } from "../src/oracle/evidence.js";
import { judge } from "../src/oracle/oracle.js";
import { FINDINGS_DIR, recordFinding, runId } from "../src/oracle/findings.js";
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

    // Multi-client: DB-login as the target company before running the flow.
    if (companyId) await loginAsCompany(page, companyId);

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
    let failure: Error | null = null;
    try {
      await mod.run(ctx);
    } catch (err) {
      failure = err instanceof Error ? err : new Error(String(err));
    }

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
    });

    if (failure) {
      // Lead with the verdict so the reporter's first line already says whether
      // a human should look at the product or at the test.
      failure.message = `[${verdict.kind}] ${verdict.title}\n${verdict.rationale}\n\n${failure.message}`;
      throw failure;
    }
  });
}
