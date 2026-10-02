import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
      // Stamped as each test ENDS. Under this project's `workers: 1,
      // fullyParallel: false` that is exactly the order the run executed them,
      // and it is what the report's step numbering is built on.
      order: this.tests.length,
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
    const out = join(PROJECT_ROOT, "reports", "api-report.html");

    // `playwright test --list` runs every reporter but executes nothing, and
    // it skips globalSetup — so the evidence directory still holds whatever
    // previous runs left there. Writing then would publish a case-less report
    // built entirely from stale calls, over the top of a real one. A run with
    // no results has nothing to say, so it says nothing.
    if (this.tests.length === 0) {
      process.stdout.write(
        `\nNo test results in this run — ${
          existsSync(out) ? "keeping the existing" : "not writing a"
        } reports/api-report.html.\n\n`,
      );
      return;
    }

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

    mkdirSync(dirname(out), { recursive: true });

    // The model goes to disk FIRST. It is the evidence; the HTML is a view of
    // it. Writing it up front means a rendering bug costs a page, not a run's
    // worth of results — and the dashboard in `prototype/` and any CI gate can
    // read it without parsing HTML either way.
    writeFileSync(
      join(PROJECT_ROOT, "reports", "api-report.json"),
      JSON.stringify(model, null, 2),
      "utf8",
    );

    try {
      writeFileSync(out, renderReport(model), "utf8");
    } catch (error) {
      process.stderr.write(
        `\nThe HTML report could not be rendered: ${
          error instanceof Error ? error.stack ?? error.message : String(error)
        }\n` + `reports/api-report.json still holds the full run.\n\n`,
      );
    }

    const t = model.totals;
    process.stdout.write(
      `\nAPI report  reports/api-report.html\n` +
        `  ${t.tests} cases (${t.passed} passed, ${t.failed} failed, ${t.skipped} not run)` +
        `  ·  positive ${t.byKind.positive.total} / negative ${t.byKind.negative.total} / edge ${t.byKind.edge.total}\n` +
        `  ${t.calls} API calls, ${t.failedCalls} failed  ·  p50 ${t.p50Ms}ms  p95 ${t.p95Ms}ms  max ${t.maxMs}ms\n` +
        (t.disagreements
          ? `  ⚠ ${t.disagreements} case(s) where the HTTP evidence contradicts the recorded verdict\n`
          : "") +
        `  run status ${result.status}\n\n`,
    );
  }
}
