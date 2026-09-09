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
import { recordFinding } from "../src/oracle/findings.js";
import { Watchdog } from "../src/support/watchdog.js";
import { BasePage } from "../src/pages/BasePage.js";

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
    if (stalls) evidence.notes.push(`the screen stalled ${stalls} time(s) during this run`);
    const verdict = judge(evidence, failure);
    const finding = recordFinding(evidence, verdict);
    if (finding) {
      console.log(`[oracle] ${verdict.kind.toUpperCase()} · ${verdict.severity} — ${verdict.title}`);
      console.log(`[oracle] ${verdict.rationale}`);
    }

    if (failure) {
      // Lead with the verdict so the reporter's first line already says whether
      // a human should look at the product or at the test.
      failure.message = `[${verdict.kind}] ${verdict.title}\n${verdict.rationale}\n\n${failure.message}`;
      throw failure;
    }
  });
}
