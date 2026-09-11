import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DefectGroup } from "../agents/oracle.js";

/**
 * THE CURATED BUG LIST — the rows a person wrote.
 *
 * The platform finds defects on its own, but the list the team actually reads
 * in standup is the hand-written one: D__001, D__002, each with a description
 * in the language of the product rather than an endpoint signature. That list
 * lives in the API suite's config/findings.yaml and is emitted as
 * reports/findings.json by `npm run report:bugs`.
 *
 * Read here so ONE sheet shows both: what someone judged and wrote up, then
 * what the last runs turned up. Two lists in two places is how a bug gets
 * fixed twice or not at all.
 */

const here = dirname(fileURLToPath(import.meta.url));

/** Newest copy across the maintained suite and the older sibling. */
const SOURCES = [
  join(here, "..", "..", "..", "api-suite", "reports", "findings.json"),
  join(here, "..", "..", "..", "..", "reports", "findings.json"),
  join(here, "..", "..", "..", "procol test", "reports", "findings.json"),
];

/** One row exactly as the suite resolved it — every sheet column filled in. */
export interface CuratedBug {
  id: string;
  issueId: string;
  title: string;
  status: string;
  severity: string;
  devStatus: string;
  devEta: string;
  priority: string;
  blocker: boolean;
  devType: string;
  devComment: string;
  sprintWeek: string;
  userType: string;
  module: string;
  description: string;
  detail: string;
  note: string;
  highlight: boolean;
  client?: string;
  endpoint?: string;
  evidence?: string;
}

export function loadCuratedBugs(): { bugs: CuratedBug[]; generatedAt?: string; source?: string } {
  const file = SOURCES.filter(existsSync).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  if (!file) return { bugs: [] };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as {
      generatedAt?: string;
      findings?: CuratedBug[];
    };
    return { bugs: parsed.findings ?? [], generatedAt: parsed.generatedAt, source: file };
  } catch {
    return { bugs: [] };
  }
}

/**
 * A curated row in the shape the sheet renders.
 *
 * Mapped onto DefectGroup so both lists go through one row renderer: a reader
 * must not be able to tell, from the layout, which half of the sheet they are
 * looking at — only from the "raised by" column.
 */
export function curatedAsDefects(bugs: CuratedBug[]): Array<DefectGroup & { curated: CuratedBug }> {
  const severity = (s: string): DefectGroup["severity"] =>
    s === "high" ? "high" : s === "medium" ? "medium" : s === "low" ? "low" : "medium";

  return bugs.map((b) => ({
    // Prefixed so a curated row and an auto-found one can never collide in the
    // triage store, even if they describe the same defect.
    defectFingerprint: `curated:${b.id}`,
    kind: b.status === "not-a-bug" ? "environment" : "product_defect",
    severity: b.blocker ? "critical" : severity(b.severity),
    title: b.description || b.title,
    rationale: b.detail,
    flows: b.module ? [b.module] : [],
    runs: [],
    occurrences: 1,
    firstSeen: "",
    lastSeen: "",
    evidence: b.evidence ? [b.evidence] : [],
    reproduction: b.evidence ? [b.evidence] : [],
    actionable: b.status !== "not-a-bug",
    curated: b,
  }));
}
