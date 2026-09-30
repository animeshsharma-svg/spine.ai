import { knownBugSentence } from "./knownBugs.js";
import { FEATURE_TREE } from "../../config/featureTree.js";
import type { CheckResult } from "../ai/types.js";
import type { DefectGroup } from "../agents/oracle.js";
import type { JourneyRecord, JourneyStepRecord } from "../checks/journeyModel.js";
import { getRun, listRuns } from "../runStore.js";
import { toCurl } from "./curl.js";
import { readJourney } from "./journeyReport.js";

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
 *
 * The JOURNEY's steps are here too. A run that walks the Postman collection
 * records each step as worked, refused, broken or not run; a step that broke
 * is the most direct defect a run can find — the buyer cannot publish, the
 * vendor cannot bid — and a step the app refused is one until its message
 * says otherwise. Steps that never ran are not defects: they are the shadow
 * of the one that stopped the journey, and filing them would count one bug
 * many times.
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

/** Fold one run's failed checks into the defect map, grouped by fingerprint. */
function collect(
  groups: Map<string, DefectGroup>,
  runId: string,
  ts: string,
  run: ReturnType<typeof getRun>,
): void {
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
      if (!existing.runs.includes(runId)) existing.runs.push(runId);
      if (existing.evidence.length < 8) existing.evidence.push(evidence);
      existing.firstSeen = ts < existing.firstSeen ? ts : existing.firstSeen;
      existing.lastSeen = ts > existing.lastSeen ? ts : existing.lastSeen;
      continue;
    }

    groups.set(key, {
      defectFingerprint: key,
      kind: "product_defect",
      severity: severityOf(check),
      title: check.knownBug ? check.knownBug.title : titleOf(check),
      rationale:
        `${check.verdict} The case "${check.scenario}" expected the API to ${check.expected}. ` +
        `Recorded against ${featureLabel(check.flowId)} (${check.flowId}).` +
        (check.knownBug ? ` ${knownBugSentence(check.knownBug)}` : ""),
      knownBug: check.knownBug,
      flows: [check.flowId],
      runs: [runId],
      occurrences: 1,
      firstSeen: ts,
      lastSeen: ts,
      evidence: [evidence],
      // The curl IS the reproduction — one command, no prose. A vendor bulk
      // upload case is reproduced with its sheet instead: the curl would only
      // carry a placeholder where the file goes.
      reproduction: (check as { evidenceRef?: string }).evidenceRef
        ? [
            `Download the exact sheet: /api/vbu/sheet?e=${encodeURIComponent((check as { evidenceRef?: string }).evidenceRef!)}&which=main`,
            "Upload it on Vendors → Bulk Upload in the same workspace (or POST /api/v1/bulk_create_vendor with its base64 as excel_data).",
            `Expected: ${String((check as { expectedResult?: string }).expectedResult ?? check.expected).replace(/ Rule: .*$/, "")}`,
            `Actual: ${check.verdict}`,
            `Full evidence (rows, records, code line): /api/test-report?run=${runId}#case-${check.id}`,
          ]
        : check.request
          ? toCurl(check.request, run?.companyId).split("\n")
          : [check.inputSummary],
      actionable: true,
    });
  }

  const journey = readJourney(run);
  if (journey) collectJourney(groups, runId, ts, journey, run?.companyId);
}

/**
 * A refusal that reads as the environment, not the product.
 *
 * "Order not active", "already awarded", "not found": the app is describing
 * the state of the record, and the step fired against a record in the wrong
 * state. That wants fixing in the run, not in the product, so it is filed as
 * an environment problem at medium — visible, but not on engineering's queue.
 */
const PRECONDITION_MESSAGE = /not active|still open|closed|already|not allowed|permission|not found|does not exist/i;

/**
 * A route with its ids blanked, and nothing else blanked.
 *
 * The check fingerprint above treats any long segment as an id, which turns
 * `/event_groups` into `{id}` too; it is left as it is so old groupings hold.
 * Here a segment is an id only when it looks like one — it carries a digit,
 * base64 padding or mixed case — so `POST /proposal/{id}/add_response` stays
 * legible in the sheet. Snake-case words never match because `_` is outside
 * the class, and short segments like `v1` are kept by the length floor.
 */
function routeWithIdsBlanked(path: string): string {
  return path
    .split("?")[0]
    .replace(/\/([A-Za-z0-9=-]{6,})(?=\/|$)/g, (whole, segment: string) =>
      /[0-9=]/.test(segment) || (/[a-z]/.test(segment) && /[A-Z]/.test(segment)) ? "/{id}" : whole,
    );
}

/** The step's identity: the route with ids blanked, what came back, and the start of the message. */
function journeyFingerprint(step: JourneyStepRecord): string {
  const endpoint = step.call
    ? `${step.call.method.toUpperCase()} ${routeWithIdsBlanked(step.call.path)}`
    : `step ${step.kind}`;
  const message = (step.message ?? "").toLowerCase().replace(/[0-9a-f-]{8,}/g, "{id}").slice(0, 60);
  return `${endpoint} -> ${step.status || "err"} ${message}`;
}

/** Fold one run's refused and broken journey steps into the defect map. */
function collectJourney(
  groups: Map<string, DefectGroup>,
  runId: string,
  ts: string,
  journey: JourneyRecord,
  companyId: number | undefined,
): void {
  for (const step of journey.steps) {
    // Only steps that were attempted and went wrong. A not-run step is the
    // consequence of one of these, never a defect of its own.
    if (step.verdict !== "broken" && step.verdict !== "refused") continue;

    const key = journeyFingerprint(step);
    const status = step.status ? `HTTP ${step.status}` : "no reply";
    const evidence =
      `Step ${step.n} · ${step.title} · ${step.call ? `${step.call.method.toUpperCase()} ${step.call.path.split("?")[0]}` : step.kind} → ` +
      `${status}${step.message ? `: ${step.message}` : ""}`;
    const flow = `journey.${journey.eventType}`;
    const existing = groups.get(key);

    if (existing) {
      existing.occurrences++;
      if (!existing.flows.includes(flow)) existing.flows.push(flow);
      if (!existing.runs.includes(runId)) existing.runs.push(runId);
      if (existing.evidence.length < 8) existing.evidence.push(evidence);
      existing.firstSeen = ts < existing.firstSeen ? ts : existing.firstSeen;
      existing.lastSeen = ts > existing.lastSeen ? ts : existing.lastSeen;
      continue;
    }

    const broke = step.verdict === "broken";
    const environment = !broke && PRECONDITION_MESSAGE.test(step.message ?? "");
    const verb = broke ? "broke" : "was refused";
    groups.set(key, {
      defectFingerprint: key,
      kind: environment ? "environment" : "product_defect",
      severity: broke ? "critical" : environment ? "medium" : "high",
      title: `Step ${step.n} — ${step.title} ${verb}: ${status}${step.message ? ` ${step.message}` : ""}`,
      rationale:
        `Step ${step.n} of the ${journey.label} journey ${verb}. ` +
        `Expected: ${step.expected} Actual: ${step.actual} ` +
        (broke
          ? "A 5xx or no reply on a step the collection walks is a defect regardless of the data sent."
          : environment
            ? "The message describes the state of the record rather than a wrong answer, so this is filed as an " +
              "environment problem to clear before the journey is run again."
            : "A clean refusal of a step the collection expects to work is a product defect until the message explains otherwise."),
      flows: [flow],
      runs: [runId],
      occurrences: 1,
      firstSeen: ts,
      lastSeen: ts,
      evidence: [evidence],
      reproduction: step.call ? toCurl(step.call, companyId).split("\n") : [evidence],
      actionable: true,
    });
  }
}

/** Worst first, then by how much of the suite the defect touches. */
function ordered(groups: Map<string, DefectGroup>): DefectGroup[] {
  const order: DefectGroup["severity"][] = ["critical", "high", "medium", "low"];
  return [...groups.values()].sort(
    (a, b) =>
      order.indexOf(a.severity) - order.indexOf(b.severity) ||
      b.occurrences - a.occurrences ||
      a.title.localeCompare(b.title),
  );
}

export function defectsFromRuns(limit = RUNS_CONSIDERED): DefectGroup[] {
  const groups = new Map<string, DefectGroup>();
  for (const summary of listRuns(limit)) {
    collect(groups, summary.id, summary.ts, getRun(summary.id));
  }
  return ordered(groups);
}

/**
 * What ONE run found — the sheet you open straight after pressing run.
 *
 * The all-time list answers "what is broken in the product"; this answers
 * "what did the thing I just ran turn up", which is the question being asked
 * while the run is still on screen. Same grouping, same evidence, one run.
 */
export function defectsFromRun(runId: string): DefectGroup[] {
  const run = getRun(runId);
  if (!run) return [];
  const groups = new Map<string, DefectGroup>();
  collect(groups, runId, run.ts, run);
  return ordered(groups);
}
