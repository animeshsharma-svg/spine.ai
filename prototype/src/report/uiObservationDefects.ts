import type { DefectGroup } from "../agents/oracle.js";
import { loadAllUiResults } from "./uiReport.js";

/**
 * WOBBLES THAT NEVER FAILED A RUN, ON THE BUG SHEET ANYWAY.
 *
 * A browser journey files a finding when it stops. It files nothing when the
 * app merely misbehaves and the automation copes — a dropdown that shuts
 * itself, a value that vanishes from a field and reappears, a select that only
 * takes on the third try. Every one of those is the product being wrong in
 * front of a user; the only reason they were invisible is that a retry loop
 * absorbed them and the run went green.
 *
 * They are recorded per run as `observations`, which put them in that run's
 * report. This puts them where work actually gets picked up: grouped by the
 * defect, counted across runs, in the sheet next to everything else.
 *
 * Severity is deliberately not "critical". Nothing here stopped a run, and
 * inflating it would push genuine blockers down the page — which is how a
 * triage queue stops being read.
 */

/** One row per distinct misbehaviour, not per occurrence. */
const KIND_TITLE: Record<string, (field: string) => string> = {
  "dropdown-closed": (f) => `The ${f} dropdown closes itself before a value can be picked`,
  "value-vanished": (f) => `A value chosen in ${f} disappears from the field, then comes back`,
  "needed-retries": (f) => `${f} only accepts a value after more than one attempt`,
};

const KIND_WHY: Record<string, string> = {
  "dropdown-closed":
    "The list opens and is gone again before anything can be chosen. The automation retries and " +
    "gets there; a person clicks into an empty field and tries again, usually without knowing why.",
  "value-vanished":
    "The field accepts the value, blanks itself, and fills back in a moment later. Nothing is lost, " +
    "but anyone watching has just seen their input thrown away — most will re-enter it.",
  "needed-retries":
    "The first attempt at setting this field did not take. The automation tried again and it stuck, " +
    "which means the app dropped an interaction it had already acknowledged.",
};

export function defectsFromObservations(): DefectGroup[] {
  const byDefect = new Map<string, DefectGroup>();

  for (const result of loadAllUiResults()) {
    for (const o of result.observations ?? []) {
      const field = o.field ?? "a field";
      // Grouped by WHAT misbehaved and WHERE — the same dropdown closing on
      // ten runs is one defect seen ten times, not ten defects.
      const key = `ui-wobble:${o.kind}:${field}`;
      const when = o.at ?? result.startedAt ?? new Date().toISOString();
      const existing = byDefect.get(key);

      if (existing) {
        existing.occurrences += 1;
        if (!existing.flows.includes(result.flowKey)) existing.flows.push(result.flowKey);
        if (!existing.runs.includes(result.runId)) existing.runs.push(result.runId);
        if (existing.evidence.length < 8) existing.evidence.push(o.detail);
        if (when < existing.firstSeen) existing.firstSeen = when;
        if (when > existing.lastSeen) existing.lastSeen = when;
        continue;
      }

      byDefect.set(key, {
        defectFingerprint: key,
        kind: "product_defect",
        // Survivable, and real. Medium says "fix this" without shouting over
        // something that actually stopped a release.
        severity: "medium",
        title: (KIND_TITLE[o.kind] ?? ((f: string) => `${f}: ${o.kind}`))(field),
        rationale:
          `${KIND_WHY[o.kind] ?? "Seen while the journey was filling this form."} ` +
          `Caught by the browser journey, which survived it — so this has never failed a run and ` +
          `would not appear in any pass/fail count.`,
        flows: [result.flowKey],
        runs: [result.runId],
        occurrences: 1,
        firstSeen: when,
        lastSeen: when,
        evidence: [o.detail],
        reproduction: [
          `Run the ${result.flowKey} browser journey, or open the purchase order form by hand`,
          `Set "${field}" from its dropdown and watch the field as the value lands`,
        ],
        actionable: true,
      });
    }
  }

  const order: DefectGroup["severity"][] = ["critical", "high", "medium", "low"];
  return [...byDefect.values()].sort(
    (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || b.occurrences - a.occurrences,
  );
}
