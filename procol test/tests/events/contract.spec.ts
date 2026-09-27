import { test } from "@playwright/test";

import { asBuyer, asEvaluator, asVendorEmail } from "../../src/identities.js";
import type { Identity } from "../../src/identities.js";
import { CONFIG } from "../../src/config.js";
import {
  loadContractCases,
  extractExpectedErrorCode,
  buildContractFixtures,
  CASE_RUNNERS,
  SKIP_REASONS,
  CONTRACT_CHECKS,
  ANY_REJECTION_OK,
  ContractFixtures,
  plainContractCase,
  expectedContractSentence,
  areaLabel,
} from "../../src/flows/eventsContract.js";
import { declareCase, recordActual } from "../../src/report/caseSpec.js";
import { judgeContractCase } from "../../src/oracle/oracle.js";
import { recordFinding } from "../../src/oracle/findings.js";
import { newEvidence, routeShape } from "../../src/oracle/evidence.js";

/**
 * Runs the mined backend-test-cases.json (events module) against the LIVE
 * API and classifies every outcome with the API Oracle — the contract-driven
 * counterpart to `tests/master.spec.ts`'s hand-written flows.
 *
 *   npx playwright test tests/events/contract.spec.ts
 *
 * Each JSON case becomes its own Playwright test. A case not automated (see
 * `SKIP_REASONS` in `src/flows/eventsContract.ts`) skips with a reason, same
 * as a config-gated flow in the master registry. An automated case that does
 * not match the documented contract fails with the Oracle's verdict leading
 * the error message — a red test here means "look at this", not "the
 * harness broke" (see `README.md` / `REFERENCE.md` for the live known
 * exception: PATCH /api/event_groups/:id currently 500s in this
 * environment, which most `activation`-area cases will reproduce).
 */

const EVENTS_CASES = loadContractCases().filter((c) => c.module === "events");

let buyer: Identity;
let evaluator: Identity;
let vendor: Identity | undefined;
let fx: ContractFixtures;

const coverage = { ran: 0, passed: 0, failed: 0, skipped: 0 };
const skipReasonCounts = new Map<string, number>();

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

// Plain describe (not `.serial`) — a failing case should NOT stop the rest
// of the suite from running (each case is an independent contract check, not
// a dependent step). Playwright still executes these in file order inside
// one worker (fullyParallel: false, workers: 1 in playwright.config.ts), so
// the shared `fx` built in beforeAll is safe to reuse across every case.
test.describe("events API contract (backend-test-cases.json)", () => {
  test.beforeAll(async () => {
    test.setTimeout(180_000);
    buyer = await asBuyer();
    evaluator = await asEvaluator();
    try {
      vendor = await asVendorEmail(CONFIG.inputs.vendorEmail);
    } catch {
      vendor = undefined; // BE-4.2 self-skips without it
    }
    fx = await buildContractFixtures(
      buyer.api,
      CONFIG.catalog.vendorBidCompanyUuid,
      evaluator.login.userUuid!,
      vendor,
    );
  });

  test.afterAll(async () => {
    const lines = [`\n▶ events contract coverage — ${EVENTS_CASES.length} mined cases`];
    lines.push(
      `  ran ${coverage.ran} (passed ${coverage.passed}, failed ${coverage.failed}) · skipped ${coverage.skipped}`,
    );
    if (skipReasonCounts.size) {
      lines.push("  top skip reasons:");
      const sorted = [...skipReasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      for (const [reason, n] of sorted) lines.push(`    ${n}× ${reason}`);
    }
    // eslint-disable-next-line no-console
    console.log(lines.join("\n") + "\n");
    await buyer?.api.dispose();
    await evaluator?.api.dispose();
    await vendor?.api.dispose();
  });

  for (const c of EVENTS_CASES) {
    test(`${c.id} [${c.area}] ${c.title}`, async () => {
      test.setTimeout(60_000);

      // Declared before anything is sent — and before the skip below — so
      // every mined case appears in the report with the contract's own
      // expectation attached, whether it ran or not.
      declareCase({
        plain: plainContractCase(c),
        expected: expectedContractSentence(c),
        // Grouped by the stage of an event's life, not by case id: one module
        // per stage in the report, rather than a hundred modules of one case.
        // The case's own id travels as `ref`, so a row is still traceable back
        // to the mined file it came from.
        flow: `events.contract.${c.area}`,
        flowTitle: `Documented backend cases — ${areaLabel(c.area)}`,
        area: areaLabel(c.area),
        ref: c.id,
        kind: c.expected.status >= 400 ? "negative" : "positive",
        expect: c.expected.status >= 400 ? "reject" : "accept",
        because: `Mined from ${c.source.join(", ")}. Documented response: ${c.expected.status} — ${c.expected.shape}. Oracle: ${c.oracle.kind} — ${c.oracle.detail}.`,
        basis: "oracle",
      });

      const runner = CASE_RUNNERS[c.id];
      if (!runner) {
        const reason = SKIP_REASONS[c.id] ?? "not automated in this pass";
        coverage.skipped++;
        bump(skipReasonCounts, reason);
        test.skip(true, reason);
        return;
      }

      const attempt = await runner(buyer.api, fx);
      if ("skip" in attempt) {
        coverage.skipped++;
        bump(skipReasonCounts, attempt.skip);
        test.skip(true, attempt.skip);
        return;
      }

      coverage.ran++;
      const flowKey = `events.contract.${c.id}`;
      const shapedPath = routeShape(attempt.path) || attempt.path;

      const verdict = judgeContractCase({
        flowKey,
        title: c.title,
        severity: c.severity,
        method: attempt.method,
        path: shapedPath,
        url: attempt.path,
        requestBody: attempt.requestBody,
        expectedStatus: c.expected.status,
        expectedErrorCode: extractExpectedErrorCode(c),
        actualStatus: attempt.raw.status,
        actualErrorCode: attempt.raw.errorCode,
        actualErrorMessage: attempt.raw.errorMessage,
        actualBody: attempt.raw.data,
        contractCheck: CONTRACT_CHECKS[c.id],
        anyRejectionAcceptable: ANY_REJECTION_OK.has(c.id),
        reproduction: [
          `${c.id}: ${c.title}`,
          `source: ${c.source.join(", ")}`,
          `documented: ${c.expected.status} — ${c.expected.shape}`,
          `oracle: ${c.oracle.kind} — ${c.oracle.detail}`,
        ],
      });

      const evidence = newEvidence(flowKey);
      evidence.notes.push(...verdict.reproduction);
      if (verdict.kind !== "pass") {
        const bodyText =
          typeof attempt.raw.data === "string" ? attempt.raw.data : JSON.stringify(attempt.raw.data ?? "");
        evidence.httpFailures.push({
          method: attempt.method,
          url: shapedPath,
          path: shapedPath,
          status: attempt.raw.status,
          requestBody:
            attempt.requestBody == null ? null : JSON.stringify(attempt.requestBody).slice(0, 4000),
          responseBody: bodyText.slice(0, 1000),
          at: new Date().toISOString(),
        });
      }

      // The Oracle knows more than the HTTP layer does: not just what came
      // back, but what the gap between that and the contract MEANS. So it,
      // rather than the report's own status-code reading, writes this case's
      // actual result.
      recordActual(
        verdict.kind === "pass"
          ? `Matches the contract. ${attempt.method} ${shapedPath} returned HTTP ${attempt.raw.status}${
              attempt.raw.errorCode ? ` with error code ${attempt.raw.errorCode}` : ""
            }${attempt.raw.errorMessage ? `, saying “${attempt.raw.errorMessage}”` : ""}.`
          : `${verdict.kind.replace(/_/g, " ")} (${verdict.severity}). ${verdict.rationale}`,
      );

      const finding = recordFinding(evidence, verdict);
      if (finding) {
        coverage.failed++;
        // eslint-disable-next-line no-console
        console.log(`[oracle] ${verdict.kind.toUpperCase()} · ${verdict.severity} — ${verdict.title}`);
      } else {
        coverage.passed++;
      }

      if (verdict.kind !== "pass") {
        throw new Error(`[${verdict.kind}] ${verdict.title}\n${verdict.rationale}`);
      }
    });
  }
});
