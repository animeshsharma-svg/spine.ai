/**
 * RUNS INTO THE PRODUCT TABLES (011–013): a run record → test_runs,
 * run_results, result_steps, result_assertions, evidence, test_records and
 * defect_occurrences.
 *
 * Two halves:
 *   map*()          pure: a run file / matrix run / cross-check run becomes a
 *                   LedgerRun. No database, unit-tested offline.
 *   writeLedgerRun  writes one LedgerRun in the caller's transaction. Re-writing
 *                   the same run replaces its rows (results, evidence, record
 *                   uses), never doubles them; an unchanged run (same record
 *                   hash) is skipped.
 *
 * Called by runHistory.writeRun inside the SAME transaction as the older
 * runs/results copy (behind a savepoint: a problem here never costs the older
 * copy), and by scripts/db-backfill.ts for everything saved before.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { RunRecord } from "../runStore.js";
import { CaseIndex, seedFromFiles, type CaseSeed } from "./catalogSync.js";
import { REPO, sha256 } from "./catalogSource.js";
import { jsonBytes, redactValue } from "./redact.js";
import { ensureCompany, spineGit, userIdByEmail, type OrgContext, type Queryable } from "./tenant.js";

// ── the shapes ──────────────────────────────────────────────────────────────

export type Verdict4 = "passed" | "failed" | "couldnt_tell" | "not_run";
export type ResultKind = "case" | "journey-step" | "matrix-combo" | "crosscheck-case" | "flow" | "validation";
export type Actor = "buyer" | "vendor" | "planner" | "admin" | "system" | "unknown";
export type Trigger = "manual" | "assistant" | "ci" | "nightly" | "backend-watch" | "hubspot" | "agent" | "unknown";
export type RecordType =
  | "event" | "stage" | "line-item" | "trade-product" | "bid" | "surrogate-bid" | "proposal" | "approval-flow"
  | "evaluation-form" | "technical-form" | "technical-page" | "template-response" | "event-version"
  | "purchase-order" | "vendor-company" | "vendor-user" | "buyer-user" | "other";

export interface LedgerEvidence {
  kind: "http-exchange" | "screenshot" | "file" | "log";
  label?: string;
  method?: string | null;
  path?: string | null;
  httpStatus?: number | null;
  request?: unknown;
  response?: unknown;
  filePath?: string | null;
  mime?: string | null;
  bytes: number;
  capturedAt: string;
}

export interface LedgerStep {
  kind: "plan-step" | "attempt" | "matrix-step" | "ui-step" | "crosscheck-item";
  key?: string | null;
  title: string;
  actor?: Actor | null;
  expected?: string | null;
  actual?: string | null;
  verdict: Verdict4;
  rawVerdict: string;
  httpStatus?: number | null;
  durationMs?: number | null;
  at?: string | null;
}

export interface LedgerAssertion {
  key: string;
  title: string;
  fieldPath?: string | null;
  op?: string | null;
  severity?: string | null;
  expected?: string | null;
  actual?: string | null;
  verdict: "passed" | "failed" | "not_run";
}

export interface LedgerResult {
  kind: ResultKind;
  subjectKey: string;
  /** for catalog-shaped results: what to resolve the case version from */
  seed: CaseSeed | null;
  title: string;
  verdict: Verdict4;
  rawVerdict: string;
  reason: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  durationMs: number | null;
  startedAt: string;
  actor: Actor;
  featureKey: string | null;
  /** the feature-tree key to resolve feature_id from, when it differs from featureKey */
  featureLookup?: string | null;
  details: Record<string, unknown>;
  steps: LedgerStep[];
  assertions: LedgerAssertion[];
  evidence: LedgerEvidence[];
}

export interface LedgerRecord {
  type: RecordType;
  uuid?: string | null;
  procolId?: number | null;
  ref?: string | null;
  title?: string | null;
  role: "created" | "used";
  label?: string | null;
  at: string;
  details?: Record<string, unknown>;
}

export interface LedgerRun {
  id: string;
  source: "run-file" | "matrix" | "crosscheck" | "ui-trail" | "po-run";
  sourcePath: string | null;
  kind: "feature-run" | "journey" | "api-plan" | "ui-batch" | "batch" | "template-check" | "agent-pipeline" | "pasted-cases" | "matrix" | "crosscheck" | "browser-journey" | "po-run" | "other";
  title: string;
  trigger: Trigger;
  triggerBasis: "recorded" | "inferred";
  triggeredByLabel: string | null;
  provider: string | null;
  procolCompanyId: number;
  companyName: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  journey: { eventType: string | null; outcome: string; steps: number; worked: number; completed: boolean } | null;
  report: { headline: string | null; passed: number | null; failed: number | null } | null;
  recordHash: string;
  results: LedgerResult[];
  runEvidence: LedgerEvidence[];
  records: LedgerRecord[];
}

// ── small pure rules ────────────────────────────────────────────────────────

/** Every verdict word any runner writes, folded to the four (same folding as metrics.ts). */
export function verdictOf(raw: unknown): Verdict4 {
  const s = String(raw ?? "").trim().toLowerCase();
  if (["pass", "passed", "worked", "ok"].includes(s)) return "passed";
  if (["fail", "failed", "broken", "refused", "defect"].includes(s)) return "failed";
  if (["inconclusive", "couldn't tell", "couldnt_tell", "couldnt tell", "partial", "unread"].includes(s)) return "couldnt_tell";
  return "not_run"; // not-run, skipped, blocked, and words nobody defined
}

export function actorOf(raw: unknown, fallback: Actor = "buyer"): Actor {
  const s = String(raw ?? "").toLowerCase();
  if (!s) return fallback;
  if (s.startsWith("vendor") || s.startsWith("supplier")) return "vendor";
  if (s.startsWith("buyer") || s === "evaluator" || s.startsWith("approver")) return "buyer";
  if (s.startsWith("planner")) return "planner";
  if (s.startsWith("admin")) return "admin";
  if (s === "platform" || s === "system") return "system";
  return "unknown";
}

/** Who started a run, from the record (recorded) or its request line (inferred). */
export function triggerOf(rec: { request?: string; trigger?: string; triggeredBy?: string }, envTrigger?: string | null): { trigger: Trigger; basis: "recorded" | "inferred"; label: string | null } {
  const known: Trigger[] = ["manual", "assistant", "ci", "nightly", "backend-watch", "hubspot", "agent"];
  const recorded = (rec.trigger ?? envTrigger ?? "").trim() as Trigger;
  if (known.includes(recorded)) return { trigger: recorded, basis: "recorded", label: rec.triggeredBy ?? null };
  const q = String(rec.request ?? "").trim();
  if (/^(run-all|ui-batch|api plan):/i.test(q)) return { trigger: "agent", basis: "inferred", label: q.split(":")[0] };
  if (/^service request/i.test(q) || /hubspot/i.test(q)) return { trigger: "hubspot", basis: "inferred", label: null };
  if (/^nightly/i.test(q)) return { trigger: "nightly", basis: "inferred", label: null };
  if (/^(features:|template check:|test cases:|browser journey:|PO automation|RFP event publish:)/i.test(q)) return { trigger: "manual", basis: "inferred", label: "dashboard" };
  if (q) return { trigger: "assistant", basis: "inferred", label: "typed request" };
  return { trigger: "unknown", basis: "inferred", label: null };
}

export function runKindOf(rec: Pick<RunRecord, "request" | "journey" | "report" | "pastedCases">): LedgerRun["kind"] {
  const q = String(rec.request ?? "");
  if (/^api plan:/i.test(q)) return "api-plan";
  if (/^ui-batch:/i.test(q)) return "ui-batch";
  if (/^run-all:/i.test(q)) return / journey$/i.test(q) ? "journey" : "batch";
  if (/^template check:/i.test(q)) return "template-check";
  if (/^test cases:/i.test(q) || rec.pastedCases?.length) return "pasted-cases";
  if (/^features:/i.test(q)) return rec.journey ? "journey" : "feature-run";
  if (rec.report) return "agent-pipeline";
  return rec.journey ? "journey" : "other";
}

/** A journey "reached the end" by the same rule the dashboard uses (metrics.ts). */
export const journeyCompleted = (outcome: string | null | undefined): boolean => /^All [0-9]+ steps/.test(String(outcome ?? ""));

const cap = (s: unknown, n = 4000): string | null => (s === null || s === undefined || s === "" ? null : String(s).slice(0, n));
const status = (n: unknown): number | null => (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 599 ? n : null);
const ms = (n: unknown): number | null => (typeof n === "number" && isFinite(n) && n >= 0 ? Math.round(Math.min(n, 2_000_000_000)) : null);
const iso = (s: unknown, fallback: string): string => (typeof s === "string" && !isNaN(Date.parse(s)) ? new Date(s).toISOString() : fallback);
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function exchange(label: string, call: { method?: string; path?: string; body?: unknown } | undefined, response: unknown, httpStatus: number | null, at: string): LedgerEvidence | null {
  if (!call?.path && response === undefined) return null;
  const method = String(call?.method ?? "").toUpperCase();
  const request = call ? redactValue({ method, path: call.path, ...(call.body !== undefined ? { body: call.body } : {}) }) : null;
  const resp = response === undefined ? null : redactValue(response);
  return {
    kind: "http-exchange",
    label,
    method: METHODS.has(method) ? method : null,
    path: call?.path ? String(call.path).slice(0, 2000) : null,
    httpStatus,
    request,
    response: resp,
    bytes: jsonBytes(request) + jsonBytes(resp),
    capturedAt: at,
  };
}

function fileEvidence(kind: "screenshot" | "file", repoRelative: string, label: string, at: string): LedgerEvidence | null {
  const abs = join(REPO, repoRelative);
  if (!existsSync(abs)) return null;
  const mime = /\.png$/i.test(repoRelative) ? "image/png" : /\.jpe?g$/i.test(repoRelative) ? "image/jpeg" : /\.json$/i.test(repoRelative) ? "application/json" : null;
  return { kind, label, filePath: repoRelative, mime, bytes: statSync(abs).size, capturedAt: at };
}

// ── run files (data/runs/*.json) ────────────────────────────────────────────

const MADE: Record<string, { type: RecordType; role: "created" | "used" }> = {
  eventGroupUuid: { type: "event", role: "created" },
  lineItemUuid: { type: "line-item", role: "created" },
  technicalTradeUuid: { type: "stage", role: "created" },
  pricingTradeUuid: { type: "stage", role: "created" },
  auctionTradeUuid: { type: "stage", role: "created" },
  tradeProductUuid: { type: "trade-product", role: "created" },
  bidUuid: { type: "bid", role: "created" },
  surrogateBidUuid: { type: "surrogate-bid", role: "created" },
  proposalUuid: { type: "proposal", role: "created" },
  approvalFlowUuid: { type: "approval-flow", role: "created" },
  evalFormUuid: { type: "evaluation-form", role: "created" },
  techFormUuid: { type: "technical-form", role: "created" },
  techPageUuid: { type: "technical-page", role: "created" },
  templateResponseUuid: { type: "template-response", role: "created" },
  versionUuid: { type: "event-version", role: "created" },
  versionedEventUuid: { type: "event", role: "created" },
  // signed in / invited, not made by the run
  vendorCompanyUuid: { type: "vendor-company", role: "used" },
  vendorUserUuid: { type: "vendor-user", role: "used" },
};

export function mapRunRecord(rec: RunRecord, opts: { sourcePath?: string | null; rawText?: string; envTrigger?: string | null } = {}): LedgerRun {
  const ts = iso(rec.ts, new Date().toISOString());
  const pasted = new Map((rec.pastedCases ?? []).map((p: any) => [String(p.id), p]));
  const results: LedgerResult[] = [];
  const byKey = new Map<string, LedgerResult>();

  // cases first (their plan steps attach to them), in the order the run kept them
  const checks = rec.checkResults ?? [];
  const parents = new Set(checks.filter((c) => !String(c.id).includes("·")).map((c) => String(c.id)));
  for (const c of checks) {
    const id = String(c.id);
    const raw = c.inconclusive ? "inconclusive" : c.pass ? "pass" : "fail";
    const parentKey = id.includes("·") ? id.split("·")[0] : null;
    if (parentKey && parents.has(parentKey)) {
      const parent = byKey.get(parentKey);
      if (parent) {
        parent.steps.push({
          kind: "plan-step",
          key: id,
          title: c.scenario ?? id,
          actor: actorOf((c as any).actor),
          expected: cap(c.expected, 200),
          actual: cap(c.verdict ?? c.message),
          verdict: verdictOf(raw),
          rawVerdict: raw,
          httpStatus: status(c.httpStatus),
          durationMs: ms(c.durationMs),
          at: ts,
        });
        continue;
      }
    }
    const seed: CaseSeed =
      seedFromFiles(id) ??
      (pasted.has(id)
        ? { key: id, origin: "pasted", title: String(pasted.get(id).title ?? c.scenario ?? id), layer: c.layer === "ui" ? "ui" : "api", featureKey: c.flowId ?? null, content: { automation: stripId(pasted.get(id)) }, source: `run ${rec.id}` }
        : {
            key: id,
            origin: c.flowId === "template-check" ? "template-check" : "observed",
            title: String(c.scenario ?? id),
            layer: c.layer === "ui" ? "ui" : c.layer === "api" ? "api" : "unknown",
            featureKey: c.flowId ?? null,
            content: { observed: { title: c.scenario ?? id, feature: c.flowId ?? null, layer: c.layer ?? null } },
            source: `run ${rec.id}`,
          });
    const ev: LedgerEvidence[] = [];
    const x = exchange("the request this case sent", c.request, { httpStatus: c.httpStatus ?? null, accepted: c.accepted, message: c.message ?? null, ...((c as any).errorCode ? { errorCode: (c as any).errorCode } : {}) }, status(c.httpStatus), ts);
    if (x && c.request) ev.push(x);
    const evRef = (c as any).evidenceRef;
    if (typeof evRef === "string" && /^\d{10,16}\/[A-Za-z0-9-]+$/.test(evRef)) {
      const f = fileEvidence("file", `prototype/data/evidence/${evRef}.json`, "the upload this case checked", ts);
      if (f) ev.push(f);
    }
    const r: LedgerResult = {
      kind: "case",
      subjectKey: id,
      seed,
      title: String(c.scenario ?? seed.title ?? id).slice(0, 2000),
      verdict: verdictOf(raw),
      rawVerdict: raw,
      reason: cap(c.verdict ?? c.message),
      httpStatus: status(c.httpStatus),
      errorCode: cap((c as any).errorCode, 40),
      durationMs: ms(c.durationMs),
      startedAt: ts,
      actor: actorOf((c as any).actor),
      featureKey: c.flowId ?? null,
      details: compact({
        expected: c.expected,
        layer: c.layer,
        type: c.type,
        category: c.category,
        priority: c.priority,
        severity: c.severity,
        module: c.module,
        field: c.field,
        inputSummary: c.inputSummary,
        knownBug: (c as any).knownBug?.id,
        ownDraft: (c as any).ownDraft,
        weakened: (c as any).weakenedTo5xxOnly ? true : undefined,
      }),
      steps: [],
      assertions: [],
      evidence: ev,
    };
    results.push(r);
    byKey.set(id, r);
  }

  // the journey: one result per step; earlier failed tries and field checks inside it
  const j = rec.journey;
  if (j) {
    for (const s of j.steps ?? []) {
      const at = iso(s.startedAt, ts);
      const ev: LedgerEvidence[] = [];
      const main = exchange("the request that decided this step", s.call, s.response, status(s.status), at);
      if (main) ev.push(main);
      for (const [i, a] of (s.alsoCalled ?? []).entries()) {
        const e = exchange(`an earlier request of this step (${i + 1})`, a, undefined, null, at);
        if (e) ev.push(e);
      }
      results.push({
        kind: "journey-step",
        subjectKey: s.kind,
        seed: null,
        title: s.title,
        verdict: verdictOf(s.verdict),
        rawVerdict: s.verdict,
        reason: cap(s.verdict === "worked" ? s.actual : (s.reason ?? s.message ?? s.actual)),
        httpStatus: status(s.status),
        errorCode: cap(s.errorCode, 40),
        durationMs: ms(s.ms),
        startedAt: at,
        actor: actorOf(s.actor),
        featureKey: j.eventType ?? null,
        featureLookup: j.eventType ? `events.${j.eventType}` : null,
        details: compact({ n: s.n, expected: s.expected, failureClass: s.failureClass, attempt: s.attempt, choices: s.choices }),
        steps: (s.attempts ?? []).map((a) => ({
          kind: "attempt" as const,
          key: `try ${a.attempt}`,
          title: `${s.title} (try ${a.attempt})`,
          actor: actorOf(s.actor),
          expected: cap(s.expected),
          actual: cap((a as { reason?: string }).reason ?? a.actual),
          verdict: verdictOf(a.verdict),
          rawVerdict: a.verdict,
          httpStatus: status(a.status),
          durationMs: ms(a.ms),
          at: iso(a.startedAt, at),
        })),
        assertions: (s.assertions?.results ?? []).map((a) => ({
          key: a.id,
          title: String(a.humanTitle ?? a.title ?? a.id),
          fieldPath: a.path ?? null,
          op: a.op ?? null,
          severity: a.severity ?? null,
          expected: cap(a.humanExpected ?? a.expected),
          actual: cap(a.humanActual ?? a.actual),
          verdict: a.pass === null || a.pass === undefined ? ("not_run" as const) : a.pass ? ("passed" as const) : ("failed" as const),
        })),
        evidence: ev,
      });
    }
  }

  // the older agent pipeline's flow and validation checks
  for (const f of rec.flowResults ?? []) {
    results.push({
      kind: "flow",
      subjectKey: String(f.flowId ?? f.name ?? "flow"),
      seed: null,
      title: String(f.name ?? f.flowId ?? "flow"),
      verdict: verdictOf(f.status),
      rawVerdict: String(f.status ?? ""),
      reason: cap(f.error),
      httpStatus: null,
      errorCode: null,
      durationMs: ms(f.durationMs),
      startedAt: iso(f.startedAt, ts),
      actor: "buyer",
      featureKey: f.flowId ?? null,
      details: compact({ category: f.category, verifiesDatabase: f.verifiesDatabase }),
      steps: [],
      assertions: [],
      evidence: [],
    });
  }
  for (const [i, v] of (rec.validationResults ?? []).entries()) {
    results.push({
      kind: "validation",
      subjectKey: `validation-${i + 1}`,
      seed: null,
      title: String(v.label ?? `validation ${i + 1}`),
      verdict: v.mismatch ? "failed" : "passed",
      rawVerdict: v.mismatch ? "mismatch" : "as-documented",
      reason: cap(v.message ?? (v.mismatch ? `expected ${v.expectedPerPrd}, the app ${v.accepted ? "accepted" : "refused"}` : null)),
      httpStatus: status(v.httpStatus),
      errorCode: null,
      durationMs: null,
      startedAt: ts,
      actor: "buyer",
      featureKey: null,
      details: compact({ expectedPerPrd: v.expectedPerPrd, accepted: v.accepted }),
      steps: [],
      assertions: [],
      evidence: v.input ? [{ kind: "http-exchange", label: "the input checked", request: redactValue({ body: v.input }), response: redactValue({ httpStatus: v.httpStatus, accepted: v.accepted, message: v.message }), httpStatus: status(v.httpStatus), bytes: jsonBytes(v.input), capturedAt: ts }] : [],
    });
  }

  // what the run made on UAT
  const records: LedgerRecord[] = [];
  const made = { ...(j?.made ?? {}) } as Record<string, string>;
  if (!j && rec.setupSummary?.eventGroupUuid) made.eventGroupUuid = rec.setupSummary.eventGroupUuid;
  for (const [k, v] of Object.entries(made)) {
    const m = MADE[k];
    if (!m || typeof v !== "string" || !v.trim()) continue;
    records.push({ type: m.type, uuid: v.trim(), role: m.role, title: m.type === "event" && k === "eventGroupUuid" ? (j?.title ?? rec.setupSummary?.title ?? null) : null, label: k, at: ts });
  }
  for (const c of checks) {
    const own = (c as any).ownDraft;
    if (typeof own === "string" && own.trim()) records.push({ type: "event", uuid: own.trim(), role: "created", label: `own draft for ${c.id}`, at: ts });
    const bid = (c as any).arrangedBid;
    if (typeof bid === "string" && bid.trim()) records.push({ type: "bid", uuid: bid.trim(), role: "created", label: `bid arranged for ${c.id}`, at: ts });
  }

  const trig = triggerOf(rec as any, opts.envTrigger);
  const journeySteps = j?.steps ?? [];
  return {
    id: rec.id,
    source: "run-file",
    sourcePath: opts.sourcePath === undefined ? `prototype/data/runs/${rec.id}.json` : opts.sourcePath,
    kind: runKindOf(rec),
    title: String(rec.request ?? "").trim() || "(no request text)",
    trigger: trig.trigger,
    triggerBasis: trig.basis,
    triggeredByLabel: trig.label,
    provider: rec.provider ?? null,
    procolCompanyId: Number(rec.companyId),
    companyName: rec.companyName ?? null,
    startedAt: ts,
    finishedAt: ms(rec.durationMs) !== null ? new Date(Date.parse(ts) + (ms(rec.durationMs) ?? 0)).toISOString() : null,
    durationMs: ms(rec.durationMs),
    journey: j
      ? {
          eventType: j.eventType ?? null,
          outcome: String(j.outcome ?? ""),
          steps: journeySteps.length,
          worked: journeySteps.filter((s) => s.verdict === "worked").length,
          completed: journeyCompleted(j.outcome),
        }
      : null,
    report: rec.report ? { headline: rec.report.headline ?? null, passed: rec.report.passed ?? null, failed: rec.report.failed ?? null } : null,
    recordHash: sha256(opts.rawText ?? JSON.stringify(rec)),
    results,
    runEvidence: [],
    records: dedupeRecords(records),
  };
}

function stripId(o: any): Record<string, unknown> {
  const { id: _id, ...rest } = o ?? {};
  return rest;
}

function compact(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") out[k] = v;
  return out;
}

function dedupeRecords(rs: LedgerRecord[]): LedgerRecord[] {
  const seen = new Map<string, LedgerRecord>();
  for (const r of rs) {
    const k = `${r.type}|${r.uuid ?? r.procolId}`;
    const prev = seen.get(k);
    if (!prev) seen.set(k, r);
    else if (r.role === "created") prev.role = "created";
  }
  return [...seen.values()];
}

// ── bidding-matrix runs (data/matrix/*.json) ────────────────────────────────

export function mapMatrixRun(fileBase: string, m: any, rawText: string): LedgerRun {
  const ts = iso(m.startedAt, new Date().toISOString());
  const results: LedgerResult[] = [];
  const records: LedgerRecord[] = [];
  for (const c of m.combos ?? []) {
    const at = iso(c.startedAt, ts);
    if (c.eventGroupUuid) records.push({ type: "event", uuid: String(c.eventGroupUuid), role: "created", label: `matrix ${c.id}`, at });
    results.push({
      kind: "matrix-combo",
      subjectKey: `matrix:${c.id}`,
      seed: { key: `matrix:${c.id}`, origin: "matrix", title: String(c.title ?? c.id), layer: "api", content: { matrix: { title: c.title ?? null, why: c.why ?? null } }, source: "src/checks/biddingMatrix.ts" },
      title: String(c.title ?? c.id),
      verdict: verdictOf(c.verdict),
      rawVerdict: String(c.verdict ?? ""),
      reason: cap(Array.isArray(c.notes) ? c.notes.join(" ") : c.notes),
      httpStatus: null,
      errorCode: null,
      durationMs: ms(c.durationMs),
      startedAt: at,
      actor: "buyer",
      featureKey: "bidding-matrix",
      details: compact({ counts: c.counts, why: c.why }),
      steps: (c.steps ?? []).map((s: any) => ({
        kind: "matrix-step" as const,
        key: `step ${s.n}`,
        title: String(s.title ?? `step ${s.n}`),
        actor: actorOf(s.actor),
        expected: cap(s.expected),
        actual: cap(s.actual),
        verdict: verdictOf(s.verdict),
        rawVerdict: String(s.verdict ?? ""),
        httpStatus: status(s.status),
        durationMs: ms(s.ms),
        at: iso(s.at, at),
      })),
      assertions: [],
      evidence: (c.steps ?? []).map((s: any) => exchange(`step ${s.n}: ${s.title}`, s.call, s.code || s.message ? { code: s.code ?? null, message: s.message ?? null } : undefined, status(s.status), iso(s.at, at))).filter(Boolean) as LedgerEvidence[],
    });
  }
  const passed = results.filter((r) => r.verdict === "passed").length;
  return {
    id: `matrix-${fileBase}`.slice(0, 120),
    source: "matrix",
    sourcePath: `prototype/data/matrix/${fileBase}.json`,
    kind: "matrix",
    title: `bidding matrix: ${results.length} combination(s), ${passed} passed`,
    trigger: "agent",
    triggerBasis: "inferred",
    triggeredByLabel: "bidding matrix (npm run matrix)",
    provider: "deterministic",
    procolCompanyId: Number(m.companyId),
    companyName: m.company ?? null,
    startedAt: ts,
    finishedAt: ms(m.durationMs) !== null ? new Date(Date.parse(ts) + (ms(m.durationMs) ?? 0)).toISOString() : null,
    durationMs: ms(m.durationMs),
    journey: null,
    report: null,
    recordHash: sha256(rawText),
    results,
    runEvidence: [],
    records: dedupeRecords(records),
  };
}

// ── UI↔API cross-check runs (procol-ui-tests/findings/crosscheck/<run>/result.json) ──

export function mapCrosscheckRun(dirName: string, x: any, rawText: string): LedgerRun {
  const ts = iso(x.startedAt, new Date().toISOString());
  const base = `procol-ui-tests/findings/crosscheck/${dirName}`;
  const runEvidence: LedgerEvidence[] = [];
  for (const s of x.screens ?? []) {
    if (typeof s.screenshot === "string" && /^[\w./-]+$/.test(s.screenshot) && !s.screenshot.includes("..")) {
      const f = fileEvidence("screenshot", `${base}/${s.screenshot}`, `screen "${s.key}"`, ts);
      if (f) runEvidence.push(f);
    }
  }
  const results: LedgerResult[] = (x.cases ?? []).map((c: any) => {
    const items = (c.results ?? []).flatMap((r: any) => r.items ?? []);
    return {
      kind: "crosscheck-case" as const,
      subjectKey: String(c.case),
      seed: seedFromFiles(String(c.case)) ?? {
        key: String(c.case),
        origin: "crosscheck" as const,
        title: String(c.title ?? c.case),
        layer: "api+ui" as const,
        content: { observed: { title: c.title ?? c.case } },
        source: "procol-ui-tests/src/crosscheck",
      },
      title: String(c.title ?? c.case),
      verdict: verdictOf(c.verdict),
      rawVerdict: String(c.verdict ?? ""),
      reason: cap(c.reason),
      httpStatus: null,
      errorCode: null,
      durationMs: null,
      startedAt: ts,
      actor: "buyer" as const,
      featureKey: "ui-api-crosscheck",
      details: compact({ screens: c.screens, counts: c.counts, findings: (c.findings ?? []).length || undefined }),
      steps: items.map((it: any) => ({
        kind: "crosscheck-item" as const,
        key: it.key ?? null,
        title: `${it.field ?? it.key ?? "field"} on ${it.screen ?? "screen"}`,
        actor: "buyer" as const,
        expected: cap(it.api),
        actual: cap(it.shown),
        verdict: verdictOf(it.verdict),
        rawVerdict: String(it.verdict ?? ""),
        httpStatus: null,
        durationMs: null,
        at: ts,
      })),
      assertions: [],
      evidence: [],
    };
  });
  const records: LedgerRecord[] = [];
  if (x.event?.uuid)
    records.push({
      type: "event",
      uuid: String(x.event.uuid),
      procolId: Number.isInteger(x.event.dbId) ? x.event.dbId : null,
      ref: x.event.ref ?? null,
      title: x.event.title ?? null,
      role: x.event.createdByThisRun ? "created" : "used",
      label: "UI↔API cross-check",
      at: ts,
    });
  const id = String(x.runId ?? dirName);
  return {
    id: (id.startsWith("xchk") ? id : `xchk-${id}`).slice(0, 120),
    source: "crosscheck",
    sourcePath: `${base}/result.json`,
    kind: "crosscheck",
    title: `UI↔API cross-check: ${x.summary ?? `${results.length} case(s)`}`,
    trigger: "agent",
    triggerBasis: "inferred",
    triggeredByLabel: "UI↔API cross-check",
    provider: "deterministic",
    procolCompanyId: Number(x.companyId),
    companyName: null,
    startedAt: ts,
    finishedAt: x.finishedAt ? iso(x.finishedAt, ts) : null,
    durationMs: x.finishedAt ? Math.max(0, Date.parse(x.finishedAt) - Date.parse(ts)) : null,
    journey: null,
    report: null,
    recordHash: sha256(rawText),
    results,
    runEvidence,
    records: dedupeRecords(records),
  };
}

// ── browser journeys (data/ui-trails/*.json) ────────────────────────────────

export function mapTrail(t: any, rawText: string): LedgerRun {
  const ts = iso(t.startedAt, new Date().toISOString());
  const ok = t.exitCode === 0;
  const lineVerdict: Record<string, Verdict4> = { ok: "passed", bad: "failed", warn: "couldnt_tell", info: "not_run" };
  const steps: LedgerStep[] = (t.steps ?? []).map((s: any) => ({
    kind: "ui-step" as const,
    key: s.phase ?? null,
    title: String(s.text ?? s.raw ?? "").slice(0, 2000) || "step",
    actor: "buyer" as const,
    expected: null,
    actual: cap(s.raw),
    verdict: lineVerdict[s.kind] ?? "not_run",
    rawVerdict: String(s.kind ?? ""),
    httpStatus: null,
    durationMs: null,
    at: typeof s.at === "number" ? new Date(Date.parse(ts) + s.at).toISOString() : null,
  }));
  return {
    id: String(t.runId).slice(0, 120),
    source: "ui-trail",
    sourcePath: `prototype/data/ui-trails/${t.runId}.json`,
    kind: "browser-journey",
    title: `browser journey: ${t.flowKey}`,
    trigger: "manual",
    triggerBasis: "inferred",
    triggeredByLabel: "dashboard",
    provider: null,
    procolCompanyId: Number(t.companyId),
    companyName: null,
    startedAt: ts,
    finishedAt: t.endedAt ? iso(t.endedAt, ts) : null,
    durationMs: ms(t.durationMs),
    journey: null,
    report: null,
    recordHash: sha256(rawText),
    results: [
      {
        kind: "flow",
        subjectKey: String(t.flowKey ?? "browser-journey"),
        seed: null,
        title: `browser journey: ${t.flowKey}`,
        verdict: ok ? "passed" : "failed",
        rawVerdict: `exit ${t.exitCode}`,
        reason: ok ? "The browser journey finished." : cap(t.stoppedAt?.text ? `Stopped at: ${t.stoppedAt.text}` : `The browser journey ended with exit code ${t.exitCode}.`),
        httpStatus: null,
        errorCode: null,
        durationMs: ms(t.durationMs),
        startedAt: ts,
        actor: "buyer",
        featureKey: t.flowKey ?? null,
        details: compact({ exitCode: t.exitCode, stoppedAt: t.stoppedAt?.text }),
        steps,
        assertions: [],
        evidence: [],
      },
    ],
    runEvidence: [],
    records: [],
  };
}

// ── purchase-order runs (data/po-runs/*.json) ──────────────────────────────

export function mapPoRun(p: any, rawText: string): LedgerRun {
  const ts = iso(p.startedAt, new Date().toISOString());
  const issues: string[] = Array.isArray(p.issues) ? p.issues.map(String) : [];
  // the dashboard's own rule (server.ts /api/runs): exit 0 and no issues = passed; issues = couldn't tell
  const verdict: Verdict4 = p.exitCode !== 0 ? "failed" : issues.length ? "couldnt_tell" : "passed";
  return {
    id: String(p.runId).slice(0, 120),
    source: "po-run",
    sourcePath: `prototype/data/po-runs/${p.runId}.json`,
    kind: "po-run",
    title: `PO automation on ${p.companyName ?? p.companyId}`,
    trigger: "manual",
    triggerBasis: "inferred",
    triggeredByLabel: "dashboard",
    provider: null,
    procolCompanyId: Number(p.companyId),
    companyName: p.companyName ?? null,
    startedAt: ts,
    finishedAt: p.endedAt ? iso(p.endedAt, ts) : null,
    durationMs: p.endedAt ? Math.max(0, Date.parse(p.endedAt) - Date.parse(ts)) : null,
    journey: null,
    report: null,
    recordHash: sha256(rawText),
    results: [
      {
        kind: "flow",
        subjectKey: "po-automation",
        seed: null,
        title: "Purchase order: create and take it through approval",
        verdict,
        rawVerdict: `exit ${p.exitCode}${issues.length ? `, ${issues.length} issue(s)` : ""}`,
        reason: cap(issues.length ? issues.join(" ") : verdict === "passed" ? "The purchase order went through the flow." : `The run ended with exit code ${p.exitCode}.`),
        httpStatus: null,
        errorCode: null,
        durationMs: null,
        startedAt: ts,
        actor: "buyer",
        featureKey: "po.generate",
        details: compact({ exitCode: p.exitCode, issues: issues.length || undefined, findings: Array.isArray(p.report?.findings) ? p.report.findings.length : undefined }),
        steps: [],
        assertions: [],
        evidence: [],
      },
    ],
    runEvidence: [],
    records: [],
  };
}

// ── writing ─────────────────────────────────────────────────────────────────

const CASE_LIKE = new Set<ResultKind>(["case", "matrix-combo", "crosscheck-case"]);

/** The run's own status from its results: any failure → failed; else any couldn't-tell; else passed; else not run. */
export function runStatus(results: Array<{ verdict: Verdict4 }>): "passed" | "failed" | "couldnt_tell" | "not_run" {
  if (results.some((r) => r.verdict === "failed")) return "failed";
  if (results.some((r) => r.verdict === "couldnt_tell")) return "couldnt_tell";
  if (results.some((r) => r.verdict === "passed")) return "passed";
  return "not_run";
}

const TRIGGER_USER: Partial<Record<Trigger, string>> = {
  nightly: "nightly@spine.local",
  ci: "ci@spine.local",
  "backend-watch": "backend-watch@spine.local",
  assistant: "assistant@spine.local",
  agent: "agent@spine.local",
  hubspot: "hubspot@spine.local",
};

export interface WriteOutcome {
  skipped: boolean;
  results: number;
  steps: number;
  assertions: number;
  evidence: number;
  records: number;
  occurrences: number;
}

/**
 * Write one run. Must run inside a transaction with service (or the run's
 * organisation) context. `basis` says how a case result's version is decided:
 * 'recorded' = the files as they are now (a live save), 'backfilled' = the
 * earliest version the database knows (an old run copied in later).
 */
export async function writeLedgerRun(c: Queryable, ctx: OrgContext, run: LedgerRun, opts: { basis: "recorded" | "backfilled"; force?: boolean; backendSha?: string | null }): Promise<WriteOutcome> {
  const none: WriteOutcome = { skipped: true, results: 0, steps: 0, assertions: 0, evidence: 0, records: 0, occurrences: 0 };
  if (!Number.isInteger(run.procolCompanyId) || run.procolCompanyId <= 0) throw new Error(`run ${run.id} names no company`);
  if (!opts.force) {
    const prev = await c.query(`SELECT record_hash FROM test_runs WHERE id = $1`, [run.id]);
    if (prev.rows[0]?.record_hash === run.recordHash) return none;
  }
  const companyId = await ensureCompany(c, ctx, run.procolCompanyId, run.companyName, run.startedAt);
  const idx = new CaseIndex(c, ctx);
  await idx.load(run.results.filter((r) => r.seed).map((r) => r.seed!.key));

  // resolve every case version first
  const resolved: Array<{ caseId: number | null; versionId: number | null; basis: "recorded" | "backfilled" | "none"; featureId: number | null }> = [];
  for (const r of run.results) {
    const featureId = await idx.featureId(r.featureLookup ?? r.featureKey);
    if (!r.seed) {
      resolved.push({ caseId: null, versionId: null, basis: "none", featureId });
      continue;
    }
    const existing = idx.get(r.seed.key);
    if (opts.basis === "backfilled" && existing?.firstVersionId) {
      resolved.push({ caseId: existing.id, versionId: existing.firstVersionId, basis: "backfilled", featureId });
      continue;
    }
    // a live run makes the files' current content the case's current version;
    // an observed/pasted case does not move a catalog case's pointer
    const makeCurrent = opts.basis === "recorded" && (r.seed.origin === "catalog" || r.seed.origin === "library");
    const e = await idx.ensure(r.seed, makeCurrent);
    resolved.push({ caseId: e.caseId, versionId: e.versionId, basis: opts.basis, featureId });
  }

  const caseLike = run.results.filter((r) => CASE_LIKE.has(r.kind));
  const count = (v: Verdict4) => caseLike.filter((r) => r.verdict === v).length;
  const git = run.source === "run-file" && opts.basis === "recorded" ? spineGit() : { sha: null, dirty: null };
  const userEmail = TRIGGER_USER[run.trigger];
  const userId = userEmail ? await userIdByEmail(c, userEmail) : null;

  await c.query(
    `INSERT INTO test_runs (id, org_id, environment_id, company_id, source, source_path, kind, title, trigger, trigger_basis,
        triggered_by_user_id, triggered_by_label, spine_git_sha, spine_git_dirty, backend_sha, provider, status, started_at, finished_at, duration_ms,
        results_total, results_passed, results_failed, results_couldnt_tell, results_not_run,
        journey_event_type, journey_outcome, journey_steps, journey_steps_worked, journey_completed,
        report_headline, report_passed, report_failed, record_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34)
     ON CONFLICT (id) DO UPDATE SET
        company_id = EXCLUDED.company_id, source = EXCLUDED.source, source_path = EXCLUDED.source_path, kind = EXCLUDED.kind,
        title = EXCLUDED.title, trigger = EXCLUDED.trigger, trigger_basis = EXCLUDED.trigger_basis,
        triggered_by_user_id = EXCLUDED.triggered_by_user_id, triggered_by_label = EXCLUDED.triggered_by_label,
        spine_git_sha = coalesce(EXCLUDED.spine_git_sha, test_runs.spine_git_sha), spine_git_dirty = coalesce(EXCLUDED.spine_git_dirty, test_runs.spine_git_dirty),
        backend_sha = coalesce(EXCLUDED.backend_sha, test_runs.backend_sha), provider = EXCLUDED.provider, status = EXCLUDED.status,
        started_at = EXCLUDED.started_at, finished_at = EXCLUDED.finished_at, duration_ms = EXCLUDED.duration_ms,
        results_total = EXCLUDED.results_total, results_passed = EXCLUDED.results_passed, results_failed = EXCLUDED.results_failed,
        results_couldnt_tell = EXCLUDED.results_couldnt_tell, results_not_run = EXCLUDED.results_not_run,
        journey_event_type = EXCLUDED.journey_event_type, journey_outcome = EXCLUDED.journey_outcome, journey_steps = EXCLUDED.journey_steps,
        journey_steps_worked = EXCLUDED.journey_steps_worked, journey_completed = EXCLUDED.journey_completed,
        report_headline = EXCLUDED.report_headline, report_passed = EXCLUDED.report_passed, report_failed = EXCLUDED.report_failed,
        record_hash = EXCLUDED.record_hash`,
    [
      run.id, ctx.orgId, ctx.environmentId, companyId, run.source, run.sourcePath, run.kind, run.title.slice(0, 4000), run.trigger, run.triggerBasis,
      userId, run.triggeredByLabel, git.sha, git.dirty, opts.backendSha ?? null, run.provider, runStatus(run.results), run.startedAt, run.finishedAt, run.durationMs,
      caseLike.length, count("passed"), count("failed"), count("couldnt_tell"), count("not_run"),
      run.journey?.eventType ?? null, run.journey?.outcome ?? null, run.journey?.steps ?? null, run.journey?.worked ?? null, run.journey ? run.journey.completed : null,
      run.report?.headline ?? null, run.report?.passed ?? null, run.report?.failed ?? null, run.recordHash,
    ],
  );

  // a re-save replaces the children (results cascade to steps, assertions, evidence, occurrences)
  await c.query(`DELETE FROM run_results WHERE run_id = $1`, [run.id]);
  await c.query(`DELETE FROM evidence WHERE run_id = $1`, [run.id]);
  await c.query(`DELETE FROM test_record_uses WHERE run_id = $1`, [run.id]);

  const out: WriteOutcome = { skipped: false, results: 0, steps: 0, assertions: 0, evidence: 0, records: 0, occurrences: 0 };
  const idByPos = new Map<number, number>();
  const CH = 1000;
  for (let i = 0; i < run.results.length; i += CH) {
    const slice = run.results.slice(i, i + CH);
    const cols: unknown[][] = Array.from({ length: 18 }, () => []);
    slice.forEach((r, j) => {
      const rs = resolved[i + j];
      const vals = [
        i + j + 1, r.kind, r.subjectKey.slice(0, 400), rs.caseId, rs.versionId, rs.basis, rs.featureId, r.featureKey, r.actor,
        r.title.slice(0, 2000) || r.subjectKey, r.verdict, r.rawVerdict || r.verdict, r.reason, r.httpStatus, r.errorCode, r.durationMs, r.startedAt,
        JSON.stringify(r.details ?? {}),
      ];
      vals.forEach((v, k) => cols[k].push(v));
    });
    const res = await c.query(
      `INSERT INTO run_results (org_id, run_id, company_id, position, kind, subject_key, case_id, case_version_id, version_basis, feature_id, feature_key,
                               actor, title, verdict, raw_verdict, reason, http_status, error_code, duration_ms, started_at, details)
       SELECT $1, $2, $3, u.* FROM unnest($4::int[], $5::text[], $6::text[], $7::bigint[], $8::bigint[], $9::text[], $10::bigint[], $11::text[], $12::text[],
                                     $13::text[], $14::text[], $15::text[], $16::text[], $17::int[], $18::text[], $19::int[], $20::timestamptz[], $21::jsonb[])
         AS u(position, kind, subject_key, case_id, case_version_id, version_basis, feature_id, feature_key, actor, title, verdict, raw_verdict, reason,
              http_status, error_code, duration_ms, started_at, details)
       RETURNING id, position`,
      [ctx.orgId, run.id, companyId, ...cols],
    );
    for (const row of res.rows) idByPos.set(Number(row.position), Number(row.id));
    out.results += res.rowCount ?? 0;
  }

  // steps, assertions, evidence — batched across all results
  const steps: unknown[][] = Array.from({ length: 13 }, () => []);
  const asserts: unknown[][] = Array.from({ length: 10 }, () => []);
  const evid: unknown[][] = Array.from({ length: 12 }, () => []);
  const pushEv = (resultId: number | null, e: LedgerEvidence) => {
    [resultId, e.kind, e.label ?? null, e.method ?? null, e.path ?? null, e.httpStatus ?? null,
      e.request === undefined || e.request === null ? null : JSON.stringify(e.request),
      e.response === undefined || e.response === null ? null : JSON.stringify(e.response),
      e.filePath ?? null, e.mime ?? null, e.bytes, e.capturedAt].forEach((v, k) => evid[k].push(v));
  };
  run.results.forEach((r, i) => {
    const rid = idByPos.get(i + 1)!;
    r.steps.forEach((s, j) => {
      [rid, j + 1, s.kind, s.key ?? null, s.title.slice(0, 2000) || s.kind, s.actor ?? null, s.expected ?? null, s.actual ?? null, s.verdict, s.rawVerdict || s.verdict,
        s.httpStatus ?? null, s.durationMs ?? null, s.at ?? null].forEach((v, k) => steps[k].push(v));
    });
    r.assertions.forEach((a, j) => {
      [rid, j + 1, a.key, a.title.slice(0, 2000) || a.key, a.fieldPath ?? null, a.op ?? null, a.severity ?? null, a.expected ?? null, a.actual ?? null, a.verdict].forEach((v, k) => asserts[k].push(v));
    });
    for (const e of r.evidence) pushEv(rid, e);
  });
  for (const e of run.runEvidence) pushEv(null, e);

  for (let i = 0; i < steps[0].length; i += 5000) {
    const s = steps.map((col) => col.slice(i, i + 5000));
    const r = await c.query(
      `INSERT INTO result_steps (org_id, result_id, position, kind, step_key, title, actor, expected, actual, verdict, raw_verdict, http_status, duration_ms, at)
       SELECT $1, u.* FROM unnest($2::bigint[], $3::int[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[], $12::int[], $13::int[], $14::timestamptz[])
         AS u(result_id, position, kind, step_key, title, actor, expected, actual, verdict, raw_verdict, http_status, duration_ms, at)`,
      [ctx.orgId, ...s],
    );
    out.steps += r.rowCount ?? 0;
  }
  for (let i = 0; i < asserts[0].length; i += 5000) {
    const a = asserts.map((col) => col.slice(i, i + 5000));
    const r = await c.query(
      `INSERT INTO result_assertions (org_id, result_id, position, assertion_key, title, field_path, op, severity, expected, actual, verdict)
       SELECT $1, u.* FROM unnest($2::bigint[], $3::int[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[])
         AS u(result_id, position, assertion_key, title, field_path, op, severity, expected, actual, verdict)`,
      [ctx.orgId, ...a],
    );
    out.assertions += r.rowCount ?? 0;
  }
  for (let i = 0; i < evid[0].length; i += 500) {
    const e = evid.map((col) => col.slice(i, i + 500));
    const r = await c.query(
      `INSERT INTO evidence (org_id, run_id, result_id, kind, label, method, path, http_status, request, response, file_path, mime, bytes, captured_at)
       SELECT $1, $2, u.* FROM unnest($3::bigint[], $4::text[], $5::text[], $6::text[], $7::text[], $8::int[], $9::jsonb[], $10::jsonb[], $11::text[], $12::text[], $13::int[], $14::timestamptz[])
         AS u(result_id, kind, label, method, path, http_status, request, response, file_path, mime, bytes, captured_at)`,
      [ctx.orgId, run.id, ...e],
    );
    out.evidence += r.rowCount ?? 0;
  }

  // the ledger of what this run made or used on UAT
  for (const rec of run.records) {
    const r = await c.query(
      `INSERT INTO test_records (org_id, environment_id, company_id, record_type, procol_uuid, procol_id, procol_ref, title,
                                 created_by_run_id, created_by_label, created_at, last_used_at, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12)
       ON CONFLICT (org_id, environment_id, record_type, procol_key) DO UPDATE SET
         -- the earliest run that made it stays its maker; later runs are uses
         created_by_run_id = CASE WHEN EXCLUDED.created_at < test_records.created_at AND EXCLUDED.created_by_run_id IS NOT NULL
                                  THEN EXCLUDED.created_by_run_id ELSE coalesce(test_records.created_by_run_id, EXCLUDED.created_by_run_id) END,
         created_by_label = CASE WHEN EXCLUDED.created_at < test_records.created_at AND EXCLUDED.created_by_run_id IS NOT NULL
                                 THEN EXCLUDED.created_by_label ELSE coalesce(test_records.created_by_label, EXCLUDED.created_by_label) END,
         created_at = least(test_records.created_at, EXCLUDED.created_at),
         last_used_at = greatest(test_records.last_used_at, EXCLUDED.last_used_at),
         procol_id = coalesce(test_records.procol_id, EXCLUDED.procol_id),
         procol_ref = coalesce(test_records.procol_ref, EXCLUDED.procol_ref),
         title = coalesce(test_records.title, EXCLUDED.title)
       RETURNING id`,
      [
        ctx.orgId, ctx.environmentId, companyId, rec.type, rec.uuid ?? null, rec.procolId ?? null, rec.ref ?? null, rec.title ?? null,
        rec.role === "created" ? run.id : null, rec.label ?? null, rec.at, JSON.stringify(rec.details ?? {}),
      ],
    );
    const recordId = Number(r.rows[0].id);
    await c.query(
      `INSERT INTO test_record_uses (org_id, record_id, run_id, role, at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (record_id, run_id) DO UPDATE SET role = CASE WHEN EXCLUDED.role = 'created' THEN 'created' ELSE test_record_uses.role END`,
      [ctx.orgId, recordId, run.id, rec.role, rec.at],
    );
    out.records++;
  }
  await c.query(
    `UPDATE test_records t SET use_count = greatest(1, (SELECT count(*) FROM test_record_uses u WHERE u.record_id = t.id))
      WHERE t.id IN (SELECT record_id FROM test_record_uses WHERE run_id = $1)`,
    [run.id],
  );

  out.occurrences = await linkOccurrences(c, ctx, run.id);
  return out;
}

/**
 * A failed result of one of a defect's OWN cases (defect_cases, exact id) is
 * an occurrence of that defect. Never by similarity.
 */
export async function linkOccurrences(c: Queryable, ctx: OrgContext, runId?: string): Promise<number> {
  const r = await c.query(
    `INSERT INTO defect_occurrences (org_id, defect_id, result_id, run_id, company_id, seen_at, basis)
     SELECT r.org_id, dc.defect_id, r.id, r.run_id, r.company_id, r.started_at, 'exact-case'
       FROM run_results r
       JOIN defect_cases dc ON dc.org_id = r.org_id AND dc.case_key = r.subject_key
      WHERE r.org_id = $1 AND r.kind = 'case' AND r.verdict = 'failed' ${runId ? "AND r.run_id = $2" : ""}
     ON CONFLICT (defect_id, result_id) DO NOTHING`,
    runId ? [ctx.orgId, runId] : [ctx.orgId],
  );
  await c.query(
    `UPDATE defects d SET first_seen_at = s.first_at, last_seen_at = s.last_at
       FROM (SELECT defect_id, min(seen_at) AS first_at, max(seen_at) AS last_at FROM defect_occurrences WHERE org_id = $1 GROUP BY defect_id) s
      WHERE d.id = s.defect_id AND (d.first_seen_at IS DISTINCT FROM s.first_at OR d.last_seen_at IS DISTINCT FROM s.last_at)`,
    [ctx.orgId],
  );
  return r.rowCount ?? 0;
}
