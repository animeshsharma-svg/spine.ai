import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Evidence } from "./evidence.js";
import { Verdict } from "./oracle.js";
import { createHash } from "node:crypto";

/**
 * Where a run's findings land so the QA platform can read them.
 *
 * One JSON file per finding plus an appended index. Files rather than a
 * database on purpose: the dashboard spawns Playwright as a child process, and
 * a file the child writes is the simplest thing both sides can agree on.
 */
export const FINDINGS_DIR = join(process.cwd(), "findings");

export interface Finding {
  id: string;
  /**
   * Stable identity for "this same defect". Two runs that both hit
   * `PATCH /api/event_groups/:id -> 500` on the same flow produce the same
   * fingerprint, which is what lets the platform say "known issue, seen 6
   * times since Tuesday" instead of filing a seventh identical bug.
   */
  fingerprint: string;
  /**
   * Identity of the DEFECT alone, with the flow left out.
   *
   * `fingerprint` answers "have we seen this on this journey before"; this
   * answers "is this the same bug". Seven event flows all dying on
   * `PATCH /api/event_groups/:id -> 500` are one release blocker with seven
   * symptoms, and a report that lists them as seven separate criticals sends a
   * triager chasing seven ghosts.
   */
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

export function recordFinding(evidence: Evidence, verdict: Verdict): Finding | null {
  if (verdict.kind === "pass") return null;
  mkdirSync(FINDINGS_DIR, { recursive: true });
  const rid = runId();
  const signature = [
    evidence.flowKey,
    verdict.kind,
    evidence.httpFailures.map((f) => `${f.method} ${f.path} ${f.status}`).join(","),
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

  // Append to the run index so the dashboard can read one file for a summary.
  const indexPath = join(FINDINGS_DIR, `run-${rid}.json`);
  const index: Array<Omit<Finding, "evidence">> = existsSync(indexPath)
    ? JSON.parse(readFileSync(indexPath, "utf8"))
    : [];
  const { evidence: _drop, ...summary } = finding;
  index.push(summary);
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  return finding;
}
