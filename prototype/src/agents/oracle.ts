import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { recall } from "../rag/knowledgeBase.js";
import type { Emit } from "./agents.js";
import type { RunState } from "../ai/types.js";

const here = dirname(fileURLToPath(import.meta.url));
/**
 * Both test layers write findings, and the report reads both.
 *
 * The UI journey and the API suite reach the product by completely different
 * routes, so when they land on the same defect that is corroboration a single
 * layer cannot give you — and when only one sees it, that itself is
 * informative. Reading one directory would have hidden half the evidence.
 */
const FINDINGS_DIRS = [
  join(here, "..", "..", "..", "procol-ui-tests", "findings"),
  join(here, "..", "..", "..", "procol test", "findings"),
];

/**
 * THE ORACLE — decides whether what happened is actually WRONG.
 *
 * Every other agent in the graph is concerned with "can I perform the action?".
 * This one answers the harder question: given the evidence, is the product
 * broken, is the test broken, or is the environment broken? Three rules keep it
 * honest:
 *
 *  1. The verdict is DETERMINISTIC. It comes from HTTP status codes, the app's
 *     own error strings, and the final URL — never from an LLM's impression.
 *     An LLM that is allowed to decide whether a test passed will eventually
 *     tell you a 500 looked fine.
 *  2. It hunts for CONTRADICTIONS across layers. A UI that says "Order
 *     confirmed" while the API returned 500 is a worse defect than either
 *     signal alone, and neither layer can see it by itself.
 *  3. It asks memory whether this is NEW. A finding the platform has already
 *     reported six times is a known issue, not a discovery, and saying so is
 *     the difference between a useful report and noise.
 */

export type VerdictKind =
  | "product_defect"
  | "product_rejected_input"
  | "automation_defect"
  | "environment"
  | "contradiction";

export interface OracleVerdict {
  source: "ui" | "api";
  kind: VerdictKind;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  rationale: string;
  evidence: string[];
  reproduction: string[];
  /** True when a human should look at the product rather than the test. */
  actionable: boolean;
  fingerprint?: string;
  /** How many times memory has seen this before — 0 means it is new. */
  seenBefore: number;
}

interface UiFinding {
  id: string;
  fingerprint?: string;
  defectFingerprint?: string;
  runId?: string;
  createdAt?: string;
  flowKey: string;
  kind: VerdictKind;
  severity: OracleVerdict["severity"];
  title: string;
  rationale: string;
  reproduction?: string[];
  actionable?: boolean;
  evidence?: {
    url?: string;
    httpFailures?: Array<{ method: string; path: string; status: number; responseBody?: string }>;
    toasts?: Array<{ severity: string; text: string }>;
  };
}

/** Findings the UI framework's own Oracle wrote for this run. */
function readUiFindings(runId: string | undefined, opts: { all?: boolean } = {}): UiFinding[] {
  const out: UiFinding[] = [];
  // No browser run belongs to this verdict pass: there are no UI findings to
  // read. Reading "all of them" pulled every finding ever written into an
  // API-only run's verdicts. Only the cross-run summary asks for all.
  if (!runId && !opts.all) return out;
  for (const dir of FINDINGS_DIRS) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter(
      (f) => f.endsWith(".json") && !f.startsWith("run-") && (!runId || f.startsWith(`${runId}__`)),
    );
    for (const f of files) {
      try {
        out.push(JSON.parse(readFileSync(join(dir, f), "utf8")));
      } catch {
        /* a half-written finding is not worth failing a run over */
      }
    }
  }
  return out;
}

function uiVerdict(f: UiFinding): OracleVerdict {
  const http = f.evidence?.httpFailures ?? [];
  const toasts = f.evidence?.toasts ?? [];
  const evidence = [
    ...http.map((h) => `${h.method} ${h.path} → HTTP ${h.status}${h.responseBody ? ` — ${h.responseBody.slice(0, 160)}` : ""}`),
    ...toasts.map((t) => `App ${t.severity}: "${t.text}"`),
    f.evidence?.url ? `Ended on ${f.evidence.url}` : "",
  ].filter(Boolean);

  // The contradiction case: the browser never left the create screen and the
  // app said nothing, yet the API failed. The user would see a form that simply
  // does nothing — the worst kind of bug to report from the UI alone.
  const serverFailed = http.some((h) => h.status >= 500);
  const appSilent = toasts.filter((t) => t.severity === "error").length === 0;
  if (serverFailed && appSilent) {
    return {
      source: "ui",
      kind: "contradiction",
      severity: "critical",
      title: f.title,
      rationale:
        `${f.rationale} The interface showed the user no error at all while the API call failed, so the ` +
        `screen appears to do nothing when the action is pressed — a silent failure, which is harder to ` +
        `notice and harder to report than a visible one.`,
      evidence,
      reproduction: f.reproduction ?? [],
      actionable: true,
      fingerprint: f.fingerprint,
      seenBefore: 0,
    };
  }
  return {
    source: "ui",
    kind: f.kind,
    severity: f.severity,
    title: f.title,
    rationale: f.rationale,
    evidence,
    reproduction: f.reproduction ?? [],
    actionable: f.actionable ?? true,
    fingerprint: f.fingerprint,
    seenBefore: 0,
  };
}

/** The same deterministic rules, applied to the API framework's check results. */
function apiVerdicts(checks: Array<Record<string, any>>): OracleVerdict[] {
  return checks
    .filter((c) => !c.pass)
    .map((c) => {
      const status = c.httpStatus ?? 0;
      const evidence = [
        `Input: ${c.inputSummary ?? "n/a"}`,
        `Result: HTTP ${c.httpStatus ?? "error"}${c.message ? ` — ${c.message}` : ""}`,
      ];
      if (status >= 500) {
        return {
          source: "api" as const,
          kind: "product_defect" as const,
          severity: "critical" as const,
          title: `[${c.id}] ${c.scenario}`,
          rationale:
            `The endpoint answered ${status} instead of a clean 4xx. Invalid input reached code that ` +
            `could not handle it, which is a defect regardless of what was sent.`,
          evidence,
          reproduction: [c.scenario ?? ""].filter(Boolean),
          actionable: true,
          seenBefore: 0,
        };
      }
      if (c.expected === "reject") {
        return {
          source: "api" as const,
          kind: "product_defect" as const,
          severity: (c.severity?.toLowerCase?.() ?? "medium") as OracleVerdict["severity"],
          title: `[${c.id}] ${c.scenario}`,
          rationale:
            `The rules say this input should be rejected and the API accepted it. Server-side validation ` +
            `is more lenient than the specification.`,
          evidence,
          reproduction: [c.scenario ?? ""].filter(Boolean),
          actionable: true,
          seenBefore: 0,
        };
      }
      return {
        source: "api" as const,
        kind: "product_rejected_input" as const,
        severity: (c.severity?.toLowerCase?.() ?? "medium") as OracleVerdict["severity"],
        title: `[${c.id}] ${c.scenario}`,
        rationale: `The API rejected input the rules say is valid: ${c.verdict ?? c.message ?? "no message"}.`,
        evidence,
        reproduction: [c.scenario ?? ""].filter(Boolean),
        actionable: true,
        seenBefore: 0,
      };
    });
}

/**
 * Verdicts for one journey run, without going through the graph.
 *
 * A single-journey run from the dashboard has no LangGraph around it, but it
 * still deserves a verdict rather than a bare exit code.
 */
export function readRunVerdicts(runId: string): OracleVerdict[] {
  return readUiFindings(runId)
    .map(uiVerdict)
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
}

/** One defect, however many journeys tripped over it. */
export interface DefectGroup {
  defectFingerprint: string;
  kind: VerdictKind;
  severity: OracleVerdict["severity"];
  title: string;
  rationale: string;
  /** Every journey that hits this defect — the blast radius. */
  flows: string[];
  runs: string[];
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  evidence: string[];
  reproduction: string[];
  actionable: boolean;
  /** The QA-sheet row this defect was already logged as, when it was. */
  knownBug?: import("../report/knownBugs.js").KnownBugRef;
}

/**
 * Group every finding on disk by the DEFECT, not by the journey.
 *
 * Seven event flows failing on `PATCH /api/event_groups/:id -> 500` is one
 * release blocker with a blast radius of seven, and reporting it as seven
 * criticals is how a triage queue becomes useless. Grouping also makes the
 * severity real: a defect that breaks seven journeys outranks one that breaks a
 * single edge case even when both are "critical".
 */
/**
 * The defect's identity, derived from the EVIDENCE rather than read from the
 * finding.
 *
 * Trusting a stored `defectFingerprint` means findings written by an older
 * version of the platform never group with new ones — the field simply is not
 * there — and a memory that cannot recognise its own older records is not a
 * memory. Recomputing from the failing calls and the app's messages also means
 * the grouping rule can be improved without rewriting history.
 */
function defectKey(f: UiFinding): string {
  const http = (f.evidence?.httpFailures ?? [])
    .map((h) => `${h.method} ${h.path} ${h.status}`)
    .sort()
    .join(",");
  const toasts = (f.evidence?.toasts ?? [])
    .filter((t) => t.severity === "error")
    .map((t) => t.text)
    .sort()
    .join(",");
  const signal = [http, toasts].filter(Boolean).join("|");
  // With no evidence at all there is nothing to group on, so keep such findings
  // separate rather than lumping unrelated harness failures together.
  return signal ? `${f.kind}|${signal}` : `${f.kind}|${f.flowKey}|${f.title}`;
}

/** Drop the "events.rfq_only: " prefix — a group is about the defect, not one journey. */
function defectTitle(f: UiFinding): string {
  return f.title.replace(/^[\w.]+\s*:\s*/, "").trim() || f.title;
}

export function summariseFindings(): DefectGroup[] {
  const all = readUiFindings(undefined, { all: true });
  const byDefect = new Map<string, DefectGroup>();
  for (const f of all) {
    const key = defectKey(f);
    const v = uiVerdict(f);
    const when = f.createdAt ?? new Date().toISOString();
    const existing = byDefect.get(key);
    if (!existing) {
      byDefect.set(key, {
        defectFingerprint: key,
        kind: v.kind,
        severity: v.severity,
        title: defectTitle(f),
        rationale: v.rationale,
        flows: [f.flowKey],
        runs: f.runId ? [f.runId] : [],
        occurrences: 1,
        firstSeen: when,
        lastSeen: when,
        evidence: v.evidence,
        reproduction: v.reproduction,
        actionable: v.actionable,
      });
      continue;
    }
    existing.occurrences += 1;
    if (!existing.flows.includes(f.flowKey)) existing.flows.push(f.flowKey);
    if (f.runId && !existing.runs.includes(f.runId)) existing.runs.push(f.runId);
    if (when < existing.firstSeen) existing.firstSeen = when;
    if (when > existing.lastSeen) existing.lastSeen = when;
  }
  return [...byDefect.values()].sort(
    (a, b) =>
      SEV_RANK[a.severity] - SEV_RANK[b.severity] ||
      b.flows.length - a.flows.length ||
      Number(b.actionable) - Number(a.actionable),
  );
}

const SEV_RANK: Record<OracleVerdict["severity"], number> = { critical: 0, high: 1, medium: 2, low: 3 };

export async function oracleAgent(
  state: RunState & { uiRunId?: string; verdicts?: OracleVerdict[] },
  emit: Emit,
): Promise<Partial<RunState & { verdicts: OracleVerdict[] }>> {
  emit({ agent: "Oracle", status: "start", title: "Judging the evidence" });

  const ui = readUiFindings(state.uiRunId).map(uiVerdict);
  const api = apiVerdicts((state.checkResults ?? []) as Array<Record<string, any>>);
  const verdicts = [...ui, ...api].sort(
    (a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || Number(b.actionable) - Number(a.actionable),
  );

  // Ask memory whether each finding is new. A repeat is worth reporting
  // differently: "still broken after 6 runs" is a different message to a
  // triager than "new since this change".
  for (const v of verdicts) {
    try {
      const { experience } = await recall(v.title, undefined, 4);
      v.seenBefore = experience.filter(
        (e) => (v.fingerprint && e.labels?.includes(v.fingerprint)) || e.score > 0.85,
      ).length;
    } catch {
      /* memory not built yet — a new platform has no history, which is fine */
    }
  }

  const productDefects = verdicts.filter(
    (v) => v.kind === "product_defect" || v.kind === "contradiction",
  ).length;
  const harness = verdicts.filter((v) => v.kind === "automation_defect").length;
  const env = verdicts.filter((v) => v.kind === "environment").length;
  const gaps = verdicts.filter((v) => v.kind === "product_rejected_input").length;

  emit({
    agent: "Oracle",
    status: "done",
    title:
      `${verdicts.length} verdict(s): ${productDefects} product defect(s), ${gaps} validation gap(s), ` +
      `${harness} harness issue(s), ${env} environment`,
    reasoning:
      productDefects > 0
        ? `The evidence supports ${productDefects} defect(s) in the product itself — a failing request or a ` +
          `contradiction between what the interface showed and what the API returned. Those are the ones ` +
          `worth a human's time; the rest are gaps in the tests or the environment.`
        : `Nothing in the evidence points at the product. The failures that did occur are harness or ` +
          `environment problems, which means the run proved less than it appears to.`,
    data: { verdicts },
  });

  return { verdicts } as Partial<RunState & { verdicts: OracleVerdict[] }>;
}
