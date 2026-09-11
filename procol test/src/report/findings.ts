import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Product findings, read from config/findings.json and rendered into the
 * report.
 *
 * Hand-written on purpose. A run can show that a call returned 500; it cannot
 * decide whether that is a defect, test data, or a wrong expectation. Someone
 * judges it, and `status` records how far that judgement got — so a reader is
 * never left guessing which entries are solid.
 *
 * JSON rather than YAML: this project has no YAML dependency, and adding one
 * for a config file would be the wrong trade.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
export const FINDINGS_PATH = join(ROOT, "config", "findings.json");

export type FindingStatus = "confirmed" | "intermittent" | "unconfirmed" | "not-a-bug";

export interface Finding {
  id: string;
  title: string;
  status: FindingStatus;
  severity: "high" | "medium" | "low" | "none";
  /** flow or module this belongs to, e.g. "events.rfp_rfq" */
  flow?: string;
  endpoint?: string;
  detail: string;
  /** the case or command that shows it */
  evidence?: string;
}

/** Most serious first, and anything ruled out last. */
const STATUS_ORDER: Record<FindingStatus, number> = {
  confirmed: 0,
  intermittent: 1,
  unconfirmed: 2,
  "not-a-bug": 3,
};
const SEVERITY_ORDER: Record<Finding["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

export function loadFindings(file: string = FINDINGS_PATH): Finding[] {
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { findings?: Finding[] };
    return [...(parsed.findings ?? [])].sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        a.title.localeCompare(b.title),
    );
  } catch {
    // A malformed findings file must not stop a report being written.
    return [];
  }
}
