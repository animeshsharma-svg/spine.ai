import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

import { readApiCalls, PROJECT_ROOT } from "../src/report/apiLog.js";
import { buildModel, ExecutedTest, TestStatus } from "../src/report/model.js";
import { renderReport } from "../src/report/html.js";
import { CONFIG } from "../src/config.js";
import { activeCompanyId } from "../src/context.js";

/** Strips terminal colour codes so an error message reads cleanly in HTML. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/**
 * Writes reports/api-report.html once the run is over.
 *
 * A reporter rather than a separate script: it already holds every test result,
 * and it runs after the last worker has exited, so the JSONL evidence on disk is
 * guaranteed complete by the time it reads it.
 */
export default class ApiReporter implements Reporter {
  private readonly tests: ExecutedTest[] = [];
  private startedAt?: string;

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.startedAt = new Date().toISOString();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // The `setup` project's login is infrastructure, not a case under test.
    const project = test.titlePath().filter(Boolean)[0] ?? "";
    if (project === "setup") return;

    const annotations = test.annotations.map((a) => ({
      type: a.type,
      description: a.description,
    }));
    const skipReason =
      result.status === "skipped"
        ? annotations.find((a) => a.type === "skip")?.description ??
          result.error?.message ??
          "gated off — no reason recorded"
        : undefined;

    this.tests.push({
      id: test.id,
      title: test.title,
      // filter(Boolean) drops Playwright's empty root title, so this matches
      // the titlePath the recorder captured from inside the test.
      titlePath: test.titlePath().filter(Boolean),
      file: test.location.file.replace(`${PROJECT_ROOT}/`, ""),
      project,
      status: result.status as TestStatus,
      durationMs: result.duration,
      startedAt: result.startTime?.toISOString(),
      retries: result.retry,
      errorMessage: result.error?.message?.replace(ANSI, ""),
      skipReason,
      annotations,
    });
  }

  onEnd(result: FullResult): void {
    const calls = readApiCalls();

    const notes: string[] = [];
    if (!process.env.DATABASE_URL) {
      notes.push(
        "DATABASE_URL is not set, so the DB-driven flows (master registry, client selection, " +
          "DB-as-oracle verification) could not run. Their cases appear as not run.",
      );
    }
    if (calls.length === 0) {
      notes.push(
        "No API calls were recorded. Either nothing reached the network, or the run " +
          "did not go through ApiClient.",
      );
    }

    const model = buildModel({
      tests: this.tests,
      calls,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      environment: {
        clientId: CONFIG.name,
        baseUrl: CONFIG.baseURL,
        companyId: process.env.COMPANY_ID ? activeCompanyId() : undefined,
      },
      notes,
    });

    const out = join(PROJECT_ROOT, "reports", "api-report.html");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, renderReport(model), "utf8");

    // Also keep the model as JSON — the dashboard in `prototype/` and any CI
    // gate can read it without parsing HTML.
    writeFileSync(
      join(PROJECT_ROOT, "reports", "api-report.json"),
      JSON.stringify(model, null, 2),
      "utf8",
    );

    const t = model.totals;
    process.stdout.write(
      `\nAPI report  reports/api-report.html\n` +
        `  ${t.tests} cases (${t.passed} passed, ${t.failed} failed, ${t.skipped} not run)` +
        `  ·  positive ${t.byKind.positive.total} / negative ${t.byKind.negative.total} / edge ${t.byKind.edge.total}\n` +
        `  ${t.calls} API calls, ${t.failedCalls} failed  ·  p50 ${t.p50Ms}ms  p95 ${t.p95Ms}ms  max ${t.maxMs}ms\n` +
        `  run status ${result.status}\n\n`,
    );
  }
}
