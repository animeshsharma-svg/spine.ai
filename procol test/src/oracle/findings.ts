import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { Evidence, HttpFailure } from "./evidence.js";
import { Verdict } from "./oracle.js";

/**
 * Where a run's findings land — SAME shape and SAME directory convention as
 * `procol-ui-tests/src/oracle/findings.ts` (one JSON file per finding + an
 * appended run index), so the QA platform's `/api/findings` and report
 * generator pick these up unchanged, without knowing whether a finding came
 * from a browser flow or a raw API call.
 */
export const FINDINGS_DIR = join(process.cwd(), "findings");

export interface Finding {
  id: string;
  /** identity of "this defect on this flow" (see procol-ui-tests for why). */
  fingerprint: string;
  /** identity of the defect ALONE, flow left out — collapses repeats. */
  defectFingerprint: string;
  flowKey: string;
  kind: Verdict["kind"];
  severity: Verdict["severity"];
  title: string;
  rationale: string;
  reproduction: string[];
  actionable: boolean;
  evidence: Evidence;
  runId: string;
  createdAt: string;
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

export function runId(): string {
  return process.env.QA_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-");
}

function failureSignature(f: HttpFailure): string {
  return `${f.method} ${f.path} ${f.status}`;
}

export function recordFinding(evidence: Evidence, verdict: Verdict): Finding | null {
  if (verdict.kind === "pass") return null;
  mkdirSync(FINDINGS_DIR, { recursive: true });
  const rid = runId();
  const signature = [
    evidence.flowKey,
    verdict.kind,
    evidence.httpFailures.map(failureSignature).join(","),
    evidence.toasts.filter((t) => t.severity === "error").map((t) => t.text).join(","),
  ].join("|");
  const defectSignature = signature.slice(signature.indexOf("|") + 1);
  const finding: Finding = {
    id: `${rid}__${slug(evidence.flowKey)}`,
    fingerprint: createHash("sha1").update(signature).digest("hex").slice(0, 12),
    defectFingerprint: createHash("sha1").update(defectSignature).digest("hex").slice(0, 12),
    flowKey: evidence.flowKey,
    kind: verdict.kind,
    severity: verdict.severity,
    title: verdict.title,
    rationale: verdict.rationale,
    reproduction: verdict.reproduction,
    actionable: verdict.actionable,
    evidence,
    runId: rid,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(FINDINGS_DIR, `${finding.id}.json`), JSON.stringify(finding, null, 2));

  const indexPath = join(FINDINGS_DIR, `run-${rid}.json`);
  const index: Array<Omit<Finding, "evidence">> = existsSync(indexPath)
    ? JSON.parse(readFileSync(indexPath, "utf8"))
    : [];
  const { evidence: _drop, ...summary } = finding;
  index.push(summary);
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  return finding;
}
