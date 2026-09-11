import { FEATURE_TREE } from "../../config/featureTree.js";
import type { CheckResult } from "../ai/types.js";
import type { DefectGroup } from "../agents/oracle.js";
import { getRun, listRuns } from "../runStore.js";
import { toCurl } from "./curl.js";

/**
 * DEFECTS FROM CHECK RUNS — the bugs a "run ticked features" run found.
 *
 * The oracle only sees the agent pipeline's findings, so a feature run could
 * turn a check red and the bug report would stay empty. A failed check IS a
 * finding: the product accepted what it should have refused, refused what it
 * should have served, or returned a 5xx. This turns those into the same
 * DefectGroup shape the oracle produces, so one sheet shows both.
 *
 * Grouped by the DEFECT, not the case: seven cases failing on one
 * `PATCH /x -> 500` is one bug with a blast radius of seven, and filing it
 * seven times is how a triage queue stops being read.
 *
 * Inconclusive checks are deliberately NOT here. A 401, or a refusal for the
 * wrong reason, proves nothing about the product — the test report shows them
 * as inconclusive, and calling them bugs would fill this sheet with noise.
 */

/**
 * How many runs to draw on.
 *
 * Generous on purpose. At 12 the list silently forgot defects as soon as a
 * dozen newer runs existed — a bug does not stop being a bug because someone
 * ran the tests again, and a list that shrinks on its own cannot be trusted as
 * a work queue. The store is a few hundred small JSON files; reading them is
 * cheaper than being wrong.
 */
const RUNS_CONSIDERED = 500;

/** The defect's identity: the endpoint, what came back, and why that is wrong. */
function fingerprint(check: CheckResult): string {
  const request = check.request;
  const endpoint = request
    ? `${request.method} ${request.path.replace(/\/[A-Za-z0-9_-]{8,}/g, "/{id}").split("?")[0]}`
    : check.inputSummary.split(" · ")[0];
  const message = (check.message ?? "").toLowerCase().replace(/[0-9a-f-]{8,}/g, "{id}").slice(0, 60);
  return `${endpoint} -> ${check.httpStatus ?? "err"} ${message}`;
}

/** A 5xx is always critical; otherwise the case's own severity stands. */
function severityOf(check: CheckResult): DefectGroup["severity"] {
  if ((check.httpStatus ?? 0) >= 500) return "critical";
  const declared = String(check.severity ?? "").toLowerCase();
  if (declared === "critical" || declared === "high") return "high";
  if (declared === "low") return "low";
  return "medium";
}

/** A one-line statement of the defect, not of the test. */
function titleOf(check: CheckResult): string {
  const endpoint = check.request ? `${check.request.method} ${check.request.path.split("?")[0]}` : check.scenario;
  if ((check.httpStatus ?? 0) >= 500) return `${endpoint} returns HTTP ${check.httpStatus}`;
  if (check.expected === "reject" && check.accepted) return `${endpoint} accepts input it should reject`;
  if (check.expected === "accept" && !check.accepted)
    return `${endpoint} refuses a valid request (HTTP ${check.httpStatus ?? "error"})`;
  return `${endpoint}: ${check.scenario}`;
}

function featureLabel(featureId: string): string {
  const group = FEATURE_TREE.find((g) => g.id === featureId.split(".")[0]);
  return group?.label ?? featureId;
}

export function defectsFromRuns(limit = RUNS_CONSIDERED): DefectGroup[] {
  const groups = new Map<string, DefectGroup>();

  for (const summary of listRuns(limit)) {
    const run = getRun(summary.id);
    for (const check of run?.checkResults ?? []) {
      // Only real defects: a failure that is not inconclusive.
      if (check.pass || check.inconclusive) continue;

      const key = fingerprint(check);
      const existing = groups.get(key);
      const evidence = `${check.id} · ${check.inputSummary} → HTTP ${check.httpStatus ?? "error"}${
        check.message ? `: ${check.message}` : ""
      }`;

      if (existing) {
        existing.occurrences++;
        if (!existing.flows.includes(check.flowId)) existing.flows.push(check.flowId);
        if (!existing.runs.includes(summary.id)) existing.runs.push(summary.id);
        if (existing.evidence.length < 8) existing.evidence.push(evidence);
        existing.firstSeen = summary.ts < existing.firstSeen ? summary.ts : existing.firstSeen;
        existing.lastSeen = summary.ts > existing.lastSeen ? summary.ts : existing.lastSeen;
        continue;
      }

      groups.set(key, {
        defectFingerprint: key,
        kind: "product_defect",
        severity: severityOf(check),
        title: titleOf(check),
        rationale:
          `${check.verdict} The case "${check.scenario}" expected the API to ${check.expected}. ` +
          `Recorded against ${featureLabel(check.flowId)} (${check.flowId}).`,
        flows: [check.flowId],
        runs: [summary.id],
        occurrences: 1,
        firstSeen: summary.ts,
        lastSeen: summary.ts,
        evidence: [evidence],
        // The curl IS the reproduction — one command, no prose.
        reproduction: check.request
          ? toCurl(check.request, run?.companyId).split("\n")
          : [check.inputSummary],
        actionable: true,
      });
    }
  }

  const order: DefectGroup["severity"][] = ["critical", "high", "medium", "low"];
  return [...groups.values()].sort(
    (a, b) =>
      order.indexOf(a.severity) - order.indexOf(b.severity) ||
      b.occurrences - a.occurrences ||
      a.title.localeCompare(b.title),
  );
}
