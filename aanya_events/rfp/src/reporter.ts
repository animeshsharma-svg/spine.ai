/**
 * THE TEST REPORT.
 *
 * Its spine is the collection: steps 1.1 → 2.10, in order, one plain
 * sentence each. Every negative and edge case sits under the step it attacks
 * (a broken quantity under "Create the draft event", a stage that ends before
 * it starts under "Add the technical stage"), so a reader sees the happy path
 * and everything that was thrown at each step of it in one place.
 *
 * Each row says what should happen — written before the request went out —
 * what did happen, and the verdict; open it for every check, and for the call
 * the verdict turns on as a curl you can paste.
 *
 * Also prints one `[rfp-case] {…}` line per case as it finishes, which the QA
 * platform reads to show the run live.
 */
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { CallRecord } from "./api.js";
import { ACCOUNT, REPORTS_DIR, featuresOf, resolvedConfig, runScope, scenario } from "./config.js";
import type { CaseMeta, CaseRecord, CheckRecord } from "./harness.js";
import { renderHtml } from "./reportHtml.js";
import { loadState } from "./state.js";

export type Verdict = "pass" | "fail" | "not-run";

export interface ReportCase {
  order: number;
  id: string;
  title: string;
  plain: string;
  expected: string;
  actual: string;
  verdict: Verdict;
  reason?: string;
  anchor: string;
  part: CaseMeta["part"];
  kind: CaseMeta["kind"];
  /** the platform features this case tests (features.json) */
  features: string[];
  checks: CheckRecord[];
  calls: CallRecord[];
  notes: string[];
  produced?: Record<string, string>;
  durationMs: number;
}

export interface ReportStep extends ReportCase {
  cases: ReportCase[];
}

export interface ReportModel {
  suite: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  baseUrl: string;
  scenario: string | null;
  parts: string[];
  status: FullResult["status"];
  summary: { total: number; passed: number; failed: number; notRun: number; checks: number; checksFailed: number };
  byPart: Record<string, { total: number; passed: number; failed: number; notRun: number }>;
  stoppedAt?: { at: string; reason: string };
  event: {
    eventGroupUuid?: string;
    tradeUuid?: string;
    title?: string;
    published: boolean;
    template?: string | null;
    lineItems: Array<{ name: string; quantity: number; unit: string | null; variant: string | null }>;
    vendors: Array<{ uuid: string; name?: string }>;
    negativeDraft?: string;
  };
  config: Record<string, string>;
  /** Configurable System: what the account itself is set to, as read in 1.1 and on the way */
  system: {
    eventDurationSec?: number;
    evaluationDurationSec?: number;
    closingMode?: string;
    rfpEvaluationMode?: string;
    termsAndConditions?: string | null;
    templateType?: string;
    templatesListed?: number;
    evaluatorsAvailable?: number;
    timing?: { start: number; end: number; extra: number };
  };
  steps: ReportStep[];
  /** cases whose anchor is not a step of this run (should be none) */
  loose: ReportCase[];
}

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
/** Set by the QA platform, which reads the machine lines instead of the readable ones. */
const STREAM = process.env.RFP_STREAM === "1";

function ann(test: TestCase, result: TestResult, type: string): string | undefined {
  const a = [...result.annotations, ...test.annotations].filter((x) => x.type === type);
  return a.length ? a[a.length - 1].description : undefined;
}

/** Numeric sort for "1.10" after "1.9", "3.2.10" after "3.2.9". */
const idPart = (x: string) => {
  const m = x.match(/^(\d+)([a-z]?)$/);
  return m ? Number(m[1]) + (m[2] ? (m[2].charCodeAt(0) - 96) / 100 : 0) : Number(x);
};
const byId = (a: string, b: string) => {
  const pa = a.split(".").map(idPart);
  const pb = b.split(".").map(idPart);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d) return d;
  }
  return 0;
};

function actualFor(rec: CaseRecord | undefined, verdict: Verdict, reason?: string): string {
  if (verdict === "not-run") return `Not run — ${reason ?? "skipped"}.`;
  if (rec?.actual) return rec.actual;
  const last = rec?.calls[rec.calls.length - 1];
  const checks = rec?.checks ?? [];
  const failed = checks.filter((c) => !c.pass);
  const head = last ? `HTTP ${last.status} in ${last.ms} ms.` : "No request was made.";
  return failed.length
    ? `${head} ${failed.length} of ${checks.length} checks failed: ${failed.map((f) => f.name).join("; ")}.`
    : `${head} All ${checks.length} checks held.`;
}

export default class RfpReporter implements Reporter {
  private cases: ReportCase[] = [];
  private startedAt = new Date();
  private order = 0;

  onBegin(): void {
    this.startedAt = new Date();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const metaRaw = ann(test, result, "rfp-meta");
    if (!metaRaw) return;
    const meta = JSON.parse(metaRaw) as CaseMeta;
    const recRaw = ann(test, result, "rfp-case");
    const rec = recRaw ? (JSON.parse(recRaw) as CaseRecord) : undefined;

    let verdict: Verdict;
    let reason: string | undefined;
    if (result.status === "skipped") {
      verdict = "not-run";
      reason = ann(test, result, "skip") ?? "skipped";
    } else if (result.status === "passed") {
      verdict = "pass";
    } else {
      verdict = "fail";
    }
    // A part this run did not include is not a result at all — not "not run",
    // just not asked for. It stays out of the output, the report and the counts.
    if (verdict === "not-run" && reason?.startsWith("not part of this run")) return;
    const checks = rec?.checks ?? [];
    // A crash outside any check (a timeout, a thrown error) still has to show as a reason.
    if (verdict === "fail" && !checks.some((c) => !c.pass)) {
      const msg = (result.error?.message ?? "the test failed").replace(ANSI, "").split("\n")[0].slice(0, 300);
      checks.push({ name: "The case ran to the end", pass: false, detail: msg });
    }

    const rc: ReportCase = {
      order: ++this.order,
      id: meta.id,
      title: meta.title,
      plain: meta.plain,
      expected: meta.expected,
      actual: actualFor(rec ? { ...rec, checks } : undefined, verdict, reason),
      verdict,
      reason,
      anchor: meta.anchor,
      part: meta.part,
      kind: meta.kind,
      features: featuresOf(meta.id),
      checks,
      calls: rec?.calls ?? [],
      notes: rec?.notes ?? [],
      produced: rec?.produced,
      durationMs: result.duration,
    };
    this.cases.push(rc);

    const last = rc.calls[rc.calls.length - 1];
    if (!STREAM) {
      // A person at a terminal: one readable line per case, the reason under a failure.
      const mark = rc.verdict === "pass" ? "✓" : rc.verdict === "fail" ? "✗" : "–";
      const http = last ? ` ${last.status} ${last.ms}ms` : "";
      process.stdout.write(`${mark} ${rc.id.padEnd(7)}${rc.title}${http}\n`);
      if (rc.verdict === "fail") {
        for (const c of checks.filter((x) => !x.pass).slice(0, 3)) {
          process.stdout.write(`    ✗ ${c.name}${c.detail ? ` — ${c.detail.slice(0, 160)}` : ""}\n`);
        }
      } else if (rc.verdict === "not-run" && rc.reason) {
        process.stdout.write(`    not run: ${rc.reason.slice(0, 160)}\n`);
      }
      return;
    }
    // One line per case for the platform's live view. Kept small: the full
    // record is in the JSON report the platform reads at the end.
    process.stdout.write(
      "[rfp-case] " +
        JSON.stringify({
          order: rc.order,
          id: rc.id,
          title: rc.title,
          plain: rc.plain,
          anchor: rc.anchor,
          part: rc.part,
          kind: rc.kind,
          features: rc.features,
          verdict: rc.verdict,
          reason: rc.reason,
          expected: rc.expected,
          actual: rc.actual,
          ms: last?.ms ?? 0,
          status: last?.status ?? null,
          method: last?.method ?? null,
          path: last ? last.path.replace(/^\/api/, "") : null,
          failed: checks.filter((c) => !c.pass).map((c) => c.name),
        }) +
        "\n",
    );
  }

  onEnd(result: FullResult): void {
    // `--list` and a run with nothing selected end here too; neither is a run
    // worth replacing the last report with.
    if (!this.cases.length) return;
    const state = loadState();
    const endedAt = new Date();
    const steps: ReportStep[] = this.cases
      .filter((c) => c.kind === "step" && c.anchor === c.id)
      .sort((a, b) => byId(a.id, b.id))
      .map((s) => ({ ...s, cases: [] }));
    const loose: ReportCase[] = [];
    for (const c of this.cases) {
      if (c.kind === "step" && c.anchor === c.id) continue;
      const host = steps.find((s) => s.id === c.anchor);
      if (host) host.cases.push(c);
      else loose.push(c);
    }
    for (const s of steps) s.cases.sort((a, b) => byId(a.id, b.id));

    const tally = (list: ReportCase[]) => ({
      total: list.length,
      passed: list.filter((c) => c.verdict === "pass").length,
      failed: list.filter((c) => c.verdict === "fail").length,
      notRun: list.filter((c) => c.verdict === "not-run").length,
    });
    const byPart: ReportModel["byPart"] = {};
    for (const p of ["publish", "verify", "negative", "surrogate"]) byPart[p] = tally(this.cases.filter((c) => c.part === p));
    const allChecks = this.cases.flatMap((c) => c.checks);

    const sc = scenario();
    const model: ReportModel = {
      suite: "RFP event publish",
      startedAt: this.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - this.startedAt.getTime(),
      baseUrl: ACCOUNT.baseUrl,
      scenario: sc ? `${sc.n}. ${sc.name}` : null,
      parts: runScope(),
      status: result.status,
      summary: { ...tally(this.cases), checks: allChecks.length, checksFailed: allChecks.filter((c) => !c.pass).length },
      byPart,
      stoppedAt: state.stopped,
      event: {
        eventGroupUuid: state.eventGroupUuid,
        tradeUuid: state.tradeUuid,
        title: state.titleResolved,
        published: !!state.published,
        template: state.template?.name ?? (state.template ? null : undefined),
        lineItems: (state.selProducts ?? []).map((s) => ({ name: s.name, quantity: s.quantity, unit: s.unit, variant: s.variant_name })),
        vendors: state.vendors ?? [],
        negativeDraft: state.negEventGroupUuid,
      },
      config: resolvedConfig(),
      system: {
        eventDurationSec: state.cfgDefaults?.event_duration,
        evaluationDurationSec: state.cfgDefaults?.evaluation_duration,
        closingMode: state.cfgDefaults?.auction_closing_mode,
        rfpEvaluationMode: state.cfgDefaults?.rfp_evaluation_mode,
        termsAndConditions: state.tnc ? state.tnc.title : null,
        templateType: state.templateType,
        evaluatorsAvailable: state.evaluatorPool?.length,
        timing: state.timing ? { start: state.timing.start, end: state.timing.end, extra: state.timing.extra } : undefined,
      },
      steps,
      loose,
    };

    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(join(REPORTS_DIR, "rfp-run.json"), JSON.stringify(model, null, 2));
    writeFileSync(join(REPORTS_DIR, "rfp-report.html"), renderHtml(model));
    if (STREAM) {
      process.stdout.write(
        `[rfp-done] ${JSON.stringify({ ...model.summary, eventGroupUuid: model.event.eventGroupUuid, published: model.event.published })}\n`,
      );
    } else {
      const sm = model.summary;
      process.stdout.write(
        `\n${model.event.published ? `Published “${model.event.title}” (${model.event.eventGroupUuid})` : "The event was NOT published"}` +
          (model.stoppedAt ? ` — the flow stopped at ${model.stoppedAt.at}` : "") +
          `\n${sm.passed} passed · ${sm.failed} failed · ${sm.notRun} not run  (of ${sm.total})` +
          `\nReport: ${join(REPORTS_DIR, "rfp-report.html")}\n`,
      );
    }
  }

  printsToStdio(): boolean {
    return true;
  }
}
