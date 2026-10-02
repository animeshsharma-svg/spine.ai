import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FINDINGS_DIR } from "../oracle/findings.js";
import type { CaseResult, CrossFinding } from "./engine.js";
import type { DiscoveredField } from "./discover.js";

/**
 * Where a cross-check run lands, for the platform to read:
 *
 *   findings/crosscheck/<runId>/result.json   — the run: cases, findings, screens
 *   findings/crosscheck/<runId>/network.json  — every API response, tokens masked
 *   findings/crosscheck/<runId>/screens/*.json — what each screen showed
 *   findings/crosscheck/<runId>/shots/*.png    — a picture of each screen
 *   findings/crosscheck/index.json             — one line per run, newest last
 */
export const CROSSCHECK_DIR = join(FINDINGS_DIR, "crosscheck");

export interface CaseSummary {
  case: string;
  title: string;
  verdict: "passed" | "failed" | "inconclusive" | "not-run";
  reason: string;
  screens: string[];
  counts: CaseResult["counts"];
  findings: CrossFinding[];
  /** Per-screen detail, items included, for the Details section. */
  results: CaseResult[];
}

export interface RunRecord {
  runId: string;
  kind: "ui-api-crosscheck";
  startedAt: string;
  finishedAt: string;
  companyId: number | null;
  event: { uuid: string; title?: string; ref?: string; dbId?: number | null; createdByThisRun?: boolean };
  screens: Array<{ key: string; map: string; url: string; screenshot: string; responses: number; failedResponses: number; notArrived: string[] }>;
  verdict: "passed" | "failed" | "inconclusive";
  summary: string;
  cases: CaseSummary[];
  findings: CrossFinding[];
  discovered: Record<string, DiscoveredField[]>;
  notes: string[];
}

export function aggregate(results: CaseResult[], titles: Map<string, string>, notRun: Array<{ case: string; title: string; reason: string }>): CaseSummary[] {
  const by = new Map<string, CaseResult[]>();
  for (const r of results) by.set(r.case, [...(by.get(r.case) ?? []), r]);
  const out: CaseSummary[] = [];
  for (const [id, rs] of [...by.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const counts = rs.reduce(
      (a, r) => ({
        checked: a.checked + r.counts.checked,
        passed: a.passed + r.counts.passed,
        failed: a.failed + r.counts.failed,
        skipped: a.skipped + r.counts.skipped,
        unread: a.unread + r.counts.unread,
      }),
      { checked: 0, passed: 0, failed: 0, skipped: 0, unread: 0 },
    );
    const failed = rs.filter((r) => r.verdict === "failed");
    const verdict = failed.length ? "failed" : rs.some((r) => r.verdict === "passed") ? "passed" : "inconclusive";
    const reason =
      verdict === "failed"
        ? `${counts.failed} value(s) on ${failed.map((r) => r.screenTitle).join(", ")} disagree with the API`
        : verdict === "passed"
          ? `${counts.passed} value(s) checked on ${rs.length} screen(s), all match the API`
          : rs.map((r) => r.reason).join("; ");
    out.push({ case: id, title: titles.get(id) ?? rs[0].title, verdict, reason, screens: rs.map((r) => r.screen), counts, findings: rs.flatMap((r) => r.findings), results: rs });
  }
  for (const n of notRun) {
    if (!by.has(n.case))
      out.push({ case: n.case, title: n.title, verdict: "not-run", reason: n.reason, screens: [], counts: { checked: 0, passed: 0, failed: 0, skipped: 0, unread: 0 }, findings: [], results: [] });
  }
  return out.sort((a, b) => a.case.localeCompare(b.case));
}

export function writeRun(dir: string, rec: RunRecord): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "result.json");
  writeFileSync(file, JSON.stringify(rec, null, 2));
  const indexFile = join(CROSSCHECK_DIR, "index.json");
  let index: unknown[] = [];
  try {
    index = existsSync(indexFile) ? (JSON.parse(readFileSync(indexFile, "utf8")) as unknown[]) : [];
  } catch {
    index = [];
  }
  index = index.filter((r) => (r as { runId?: string }).runId !== rec.runId);
  index.push({
    runId: rec.runId,
    startedAt: rec.startedAt,
    finishedAt: rec.finishedAt,
    companyId: rec.companyId,
    event: rec.event,
    verdict: rec.verdict,
    summary: rec.summary,
    cases: rec.cases.map((c) => ({ case: c.case, verdict: c.verdict })),
    findings: rec.findings.length,
  });
  writeFileSync(indexFile, JSON.stringify(index.slice(-200), null, 2));
  return file;
}
