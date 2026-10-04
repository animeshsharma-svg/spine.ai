/**
 * THE ASSISTANT — one turn of "I typed a test case into the chat box".
 *
 *   understand → match → (existing) resolve where each matched case runs → run it → say what happened
 *                      → (new / only partly covered) build the automation → run its API part
 *                        → keep its UI part as a compiled plan → store it as a DRAFT → say what happened
 *
 * Every decision here is deterministic except two optional, fast-tier writing
 * jobs (confirming the top match candidates' meaning; writing the draft's prose
 * and its API variation). Pass and fail come only from the engine's classify()
 * and the journey's own verdicts — the same oracle every other run uses.
 *
 * Existing cases run through the platform's EXISTING endpoints, called over
 * HTTP on the same server (`/api/case-run` for cases the API framework
 * implements, `/api/features-run` for library cases and the event journey),
 * so a match runs exactly the way a person ticking the case would run it — and
 * the run is saved to history the same way. UI cases are never run here: they
 * drive a browser and only one browser run is allowed at a time; the exact
 * call to run them is returned instead.
 */
import { matchTestCase, type MatchCandidate, type MatchResult } from "../checks/caseMatcher.js";
import { caseById, type CatalogCase } from "../checks/testCatalog.js";
import { routeFor } from "../checks/caseRouting.js";
import { loadCases, heldCases, unrunnableReason, resolveCaseContext, type TestCaseRecord } from "../checks/caseLibrary.js";
import { isJourneyFeature } from "../checks/journeyModel.js";
import { gate, type DynamicContext, type DynamicSpec } from "../checks/dynamicChecks.js";
import { runCheck } from "../checks/engine.js";
import { buildEventFixture } from "../checks/eventsFixture.js";
import { openClientContext } from "../executor.js";
import { usageReport } from "../ai/llm.js";
import type { CheckResult } from "../ai/types.js";
import { buildAutomation, planSummary, type BuiltAutomation } from "./caseBuilder.js";
import { RECIPES, validatePlan, type ApiPlan } from "./apiPlanner.js";
import { runApiPlan, type PlanRunResult } from "../checks/apiPlanRunner.js";
import { nextDraftId, saveDraft, recordTurn, getDraftAutomation, updateDraftRun } from "./drafts.js";
import { EVENT_PLACEHOLDERS } from "./caseBuilder.js";

export type AssistantEmit = (event: string, data: unknown) => void;

export interface AssistantOptions {
  companyId: number;
  /** run what can be run (default true) */
  run: boolean;
  /** let the fast model confirm matches and write drafts (default true) */
  llm: boolean;
  /** compile a UI plan for a new case (reason tier; default true) */
  compile: boolean;
  /** build + store a draft when the case is new (default true) */
  build: boolean;
  /** allow runs that walk the whole event journey (minutes; default true) */
  journey: boolean;
  /** this server's own address, for calling the existing run endpoints */
  baseUrl: string;
  stageSeconds?: number;
}

// ── where a matched case runs ───────────────────────────────────────────────

export interface RunTarget {
  caseId: string;
  title: string;
  /** case-run = the API framework's own case · library = a library case through features-run ·
   *  journey = a field check on the event journey · ui = a browser plan (not run here) · none = cannot run */
  how: "case-run" | "library" | "journey" | "ui" | "none";
  /** plain English */
  where: string;
  libraryIds?: string[];
  features?: string[];
  /** the exact call that runs it */
  call?: string;
  reason?: string;
}

/** Journey step → the features to tick so the journey includes that step. */
function featuresForStep(step: string): string[] {
  if (/^(?:surrogate_tech)$/.test(step)) return ["events.rfp_rfq", "bids.surrogate"];
  if (/^surrogate/.test(step)) return ["events.rfq_only", "bids.surrogate"];
  if (step === "counter_offer") return ["events.rfq_only", "bids.counter_offer"];
  if (step === "convert_auction") return ["events.rfq_only", "auction.convert"];
  if (step === "version") return ["events.rfq_only", "events.versioning"];
  if (/rfp|technical|^tech_|^eval|evaluator/.test(step)) return ["events.rfp_rfq"];
  return ["events.rfq_only"];
}

export function resolveTarget(c: CatalogCase, companyId: number): RunTarget {
  const base = { caseId: c.id, title: c.title };
  const route = routeFor(c);
  if (route.runnable && (route.kind === "api-case" || route.kind === "api-section" || route.kind === "api-suite")) {
    return {
      ...base,
      how: "case-run",
      where: route.kind === "api-case" ? "the API framework runs this exact case" : `the API framework covers this area (${route.because})`,
      call: `/api/case-run?ids=${c.id}&c=${companyId}`,
    };
  }
  // A written case that names a library case (EDGE-…, VBU-…) runs as that case.
  const lib = new Map(loadCases().map((x) => [x.id, x]));
  const held = new Map(heldCases().map((x) => [x.id, x]));
  const libIds = c.refs.filter((r) => lib.has(r) || held.has(r));
  if (libIds.length) {
    const runnable = libIds.filter((id) => lib.has(id) && !unrunnableReason(lib.get(id)!));
    if (!runnable.length) {
      const r = libIds.map((id) => (lib.get(id) ? unrunnableReason(lib.get(id)!) : "its request body is a summary of the real one, so it is held out of runs")).find(Boolean);
      return { ...base, how: "none", where: "the library case it maps to cannot run as written", reason: r ?? "not runnable", libraryIds: libIds };
    }
    const features = [...new Set(runnable.map((id) => lib.get(id)!.feature))];
    const journey = features.some(isJourneyFeature);
    return {
      ...base,
      how: "library",
      where: journey
        ? `library case ${runnable.join(", ")} — runs after the event journey builds an event for it (a few minutes)`
        : `library case ${runnable.join(", ")}`,
      libraryIds: runnable,
      features,
      call: `/api/features-run?c=${companyId}&features=${features.join(",")}&cases=${runnable.join(",")}`,
    };
  }
  // A field check on a journey step (API-F…): the journey itself checks it.
  const step = /^API-F[A-Z]+-\d+$/.test(c.id) ? c.refs.find((r) => /^[a-z_]+$/.test(r)) : undefined;
  if (step) {
    const features = featuresForStep(step);
    return {
      ...base,
      how: "journey",
      where: `a field check on the event journey's "${step.replace(/_/g, " ")}" step (the whole journey runs, a few minutes)`,
      features,
      call: `/api/features-run?c=${companyId}&features=${features.join(",")}&cases=none&edges=0`,
    };
  }
  if (c.layer === "ui" && route.runnable) {
    return {
      ...base,
      how: "ui",
      where: route.kind === "ui-journey" ? `the "${route.target}" browser journey` : "a browser plan compiled from the case",
      call: `/api/case-run?ids=${c.id}&c=${companyId}`,
      reason: "it drives a browser, and browser runs are not started from the assistant",
    };
  }
  return { ...base, how: "none", where: "no runner exists for it yet", reason: route.because };
}

// ── calling the existing endpoints ──────────────────────────────────────────

async function sse(url: string, onEvent: (event: string, data: any) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error(`${url.split("?")[0]} answered HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = block.match(/^event: (.+)$/m)?.[1] ?? "message";
      const raw = block.match(/^data: (.*)$/m)?.[1];
      let data: any = raw;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        /* keep the raw text */
      }
      onEvent(ev, data);
    }
  }
}

// ── plain-English results ───────────────────────────────────────────────────

export interface HumanResult {
  caseId: string;
  verdict: "passed" | "failed" | "couldn't tell" | "not run" | "partial";
  /** one sentence a person reads */
  line: string;
  /** the raw evidence, for a Details section */
  details?: Record<string, unknown>;
}

export function humanizeCheck(r: CheckResult): { verdict: HumanResult["verdict"]; line: string } {
  const status = r.httpStatus ?? 0;
  if (r.inconclusive) {
    const why =
      status === 401
        ? "the session was not allowed to reach that part of the product"
        : /DIFFERENT reason/.test(r.verdict)
          ? "the app refused it, but for a different reason than the case is about"
          : "the record it acts on was not in a usable state";
    return { verdict: "couldn't tell", line: `Couldn't tell — ${why}, so nothing was proved either way.` };
  }
  if (r.pass) {
    return {
      verdict: "passed",
      line:
        r.expected === "reject"
          ? "Passed — the app refused it, as it should."
          : r.expected === "accept"
            ? "Passed — the app accepted it, as it should."
            : "Passed — the app handled it without crashing.",
    };
  }
  if (status >= 500) return { verdict: "failed", line: "Failed — the server crashed instead of answering. That is a defect." };
  return {
    verdict: "failed",
    line: r.expected === "reject" ? "Failed — the app accepted something it should have refused." : "Failed — the app refused a request that should have worked.",
  };
}

// ── running matched cases ───────────────────────────────────────────────────

async function runTargets(targets: RunTarget[], opts: AssistantOptions, emit: AssistantEmit): Promise<{ results: HumanResult[]; runIds: string[] }> {
  const results: HumanResult[] = [];
  const runIds: string[] = [];
  const base = opts.baseUrl.replace(/\/$/, "");

  // (1) cases the API framework implements: one call for all of them
  const caseRun = targets.filter((t) => t.how === "case-run");
  if (caseRun.length) {
    const ids = caseRun.map((t) => t.caseId);
    emit("step", { name: "run", status: "start", line: `Running ${ids.length} case(s) through the API framework: ${ids.join(", ")}` });
    const apiResults = new Map<string, any[]>();
    try {
      await sse(`${base}/api/case-run?ids=${ids.join(",")}&c=${opts.companyId}`, (ev, d) => {
        if (ev === "api-case") apiResults.set(d.id, [...(apiResults.get(d.id) ?? []), d.result]);
        if (ev === "note") emit("line", { line: `${d.id ?? ""} ${d.line}` });
        if (ev === "case" && d.status !== "running") {
          const v: HumanResult["verdict"] = d.status === "passed" ? "passed" : d.status === "failed" ? "failed" : d.status === "partial" ? "partial" : "not run";
          const r: HumanResult = {
            caseId: d.id,
            verdict: v,
            line:
              v === "passed"
                ? `Passed — ${d.summary ?? "the API framework's checks for it passed"}.`
                : v === "failed"
                  ? `Failed — ${d.summary ?? "at least one check failed"}.`
                  : `Not run — ${d.reason ?? d.summary ?? "no runner"}.`,
            details: { route: d.route, summary: d.summary, apiCases: apiResults.get(d.id) ?? [] },
          };
          results.push(r);
          emit("result", r);
        }
      });
    } catch (e) {
      for (const id of ids) if (!results.some((r) => r.caseId === id)) results.push({ caseId: id, verdict: "not run", line: `Not run — the run endpoint failed: ${(e as Error).message}.` });
    }
  }

  // (2) library cases and journey field checks: one features-run call
  const fr = targets.filter((t) => t.how === "library" || t.how === "journey");
  if (fr.length) {
    const features = [...new Set(fr.flatMap((t) => t.features ?? []))];
    const libIds = [...new Set(fr.flatMap((t) => t.libraryIds ?? []))];
    const journey = features.some(isJourneyFeature);
    if (journey && !opts.journey) {
      for (const t of fr) {
        const r: HumanResult = { caseId: t.caseId, verdict: "not run", line: "Not run — it needs the full event journey (a few minutes), and journey runs were turned off for this turn (journey=0)." };
        results.push(r);
        emit("result", r);
      }
    } else {
      const q = new URLSearchParams({ c: String(opts.companyId), features: features.join(","), cases: libIds.length ? libIds.join(",") : "none" });
      if (!fr.some((t) => t.how === "library" && (t.libraryIds ?? []).some((id) => /^EDGE-/.test(id)))) q.set("edges", "0");
      if (opts.stageSeconds) q.set("stageSeconds", String(opts.stageSeconds));
      emit("step", {
        name: "run",
        status: "start",
        line: journey
          ? `Walking the event journey (${features.join(", ")}) and running ${libIds.length} library case(s) on it — this takes a few minutes.`
          : `Running ${libIds.length} library case(s): ${libIds.join(", ")}`,
      });
      const checks = new Map<string, CheckResult>();
      const assertions = new Map<string, any>();
      const skipped = new Map<string, string>();
      let journeyOutcome: string | undefined;
      let error: string | undefined;
      try {
        await sse(`${base}/api/features-run?${q}`, (ev, d) => {
          if (ev === "journey-step") {
            const st = d.step;
            emit("line", { line: `journey · ${st?.title ?? st?.kind}: ${st?.verdict}` });
            for (const a of st?.assertions?.results ?? []) assertions.set(a.id, { ...a, step: st.title });
          }
          if (ev === "check" && d.check) checks.set(d.check.id, d.check);
          if (ev === "plan") for (const s of d.skipped ?? []) skipped.set(s.id, s.reason);
          if (ev === "skips") for (const s of d.skipped ?? []) skipped.set(s.id, s.reason);
          if (ev === "journey") journeyOutcome = d.journey?.outcome;
          if (ev === "run-error" || ev === "fatal") error = d.line ?? d.message;
          if (ev === "done" && d.runId) runIds.push(d.runId);
        });
      } catch (e) {
        error = (e as Error).message;
      }
      for (const t of fr) {
        let r: HumanResult;
        if (t.how === "journey") {
          const a = assertions.get(t.caseId);
          r = a
            ? {
                caseId: t.caseId,
                verdict: a.pass === true ? "passed" : a.pass === false ? "failed" : "couldn't tell",
                line: a.pass === true ? `Passed — ${a.humanActual ?? "the field check held"}.` : a.pass === false ? `Failed — ${a.humanActual ?? a.actual ?? "the field check did not hold"}.` : "Couldn't tell — the reply did not carry the field to check.",
                details: { step: a.step, check: a.humanTitle ?? a.title, expected: a.humanExpected ?? a.expected, actual: a.actual },
              }
            : { caseId: t.caseId, verdict: "not run", line: `Not run — the journey did not reach the step this check belongs to${journeyOutcome ? ` (journey outcome: ${journeyOutcome})` : ""}${error ? `; ${error}` : ""}.` };
        } else {
          const got = (t.libraryIds ?? []).map((id) => checks.get(id)).filter((x): x is CheckResult => !!x);
          if (!got.length) {
            const why = (t.libraryIds ?? []).map((id) => skipped.get(id)).find(Boolean);
            r = { caseId: t.caseId, verdict: "not run", line: `Not run — ${why ?? error ?? "the run did not reach it"}.` };
          } else {
            const h = got.map(humanizeCheck);
            const worst = h.find((x) => x.verdict === "failed") ?? h.find((x) => x.verdict === "couldn't tell") ?? h[0];
            r = {
              caseId: t.caseId,
              verdict: worst.verdict,
              line: worst.line,
              details: { libraryCases: got.map((c) => ({ id: c.id, verdict: c.verdict, httpStatus: c.httpStatus, request: c.request ? `${c.request.method} ${c.request.path}` : c.inputSummary })) },
            };
          }
        }
        results.push(r);
        emit("result", r);
      }
    }
  }

  // (3) what is not run here, with how to run it
  for (const t of targets.filter((x) => x.how === "ui" || x.how === "none")) {
    const r: HumanResult =
      t.how === "ui"
        ? { caseId: t.caseId, verdict: "not run", line: `Not run here — ${t.reason}. It runs as ${t.where}.`, details: { call: t.call } }
        : { caseId: t.caseId, verdict: "not run", line: `Cannot run yet — ${t.reason ?? t.where}.` };
    results.push(r);
    emit("result", r);
  }
  return { results, runIds };
}

// ── running a new draft's API part ──────────────────────────────────────────

export interface DraftRun {
  ran: boolean;
  verdict: HumanResult["verdict"];
  line: string;
  fixture?: { title: string; steps: number } | null;
  details?: Record<string, unknown>;
}

export async function runApiDraft(built: BuiltAutomation, companyId: number, emit: AssistantEmit): Promise<DraftRun> {
  const api = built.api;
  if (!api || !api.gate.ok) return { ran: false, verdict: "not run", line: `Not run — ${built.apiSkipped ?? "there is no API part"}.` };
  emit("line", { line: "Opening a session for this client…" });
  let client: Awaited<ReturnType<typeof openClientContext>> | undefined;
  try {
    client = await openClientContext(companyId);
    const ctx: DynamicContext = await resolveCaseContext(client);
    let fixture: DraftRun["fixture"] = null;
    if (api.needsEvent) {
      emit("line", { line: "This request acts on an event, so a fresh test event (QA_Platform_Fixture_…) is being built first…" });
      const fx = await buildEventFixture(client as any);
      if (!fx.fixture) return { ran: false, verdict: "not run", line: `Not run — the test event it needs could not be built (${fx.error}).` };
      Object.assign(ctx, { eventGroupUuid: fx.fixture.eventGroupUuid, tradeId: fx.fixture.tradeId, lineItemUuid: fx.fixture.lineItemUuid });
      fixture = { title: fx.fixture.title, steps: fx.fixture.steps.length };
    }
    const rec = api.record;
    const spec: DynamicSpec = {
      scenario: rec.title,
      method: rec.method,
      path: rec.path,
      body: rec.body,
      expected: rec.expected,
      category: rec.type,
      severity: rec.severity,
      rationale: rec.rationale ?? "",
    };
    // The same gate an AI-generated check passes — not the curated one.
    const g = gate(spec, ctx, client, rec.feature, rec.id, "Assistant draft", false);
    if (!g.check) return { ran: false, verdict: "not run", line: `Not run — the safety gate refused it: ${g.reason}.`, fixture };
    (g.check as any).expectedResult = rec.expectedResult;
    emit("line", { line: `Running the new API case ${rec.id}…` });
    const result = await runCheck(client, g.check);
    const h = humanizeCheck(result);
    return {
      ran: true,
      verdict: h.verdict,
      line: h.line,
      fixture,
      details: {
        request: result.request ? `${result.request.method} ${result.request.path}` : result.inputSummary,
        body: result.request?.body,
        httpStatus: result.httpStatus,
        message: result.message,
        verdict: result.verdict,
        weakened: (result as any).weakenedTo5xxOnly,
      },
    };
  } catch (e) {
    return { ran: false, verdict: "not run", line: `Not run — ${(e as Error).message}.` };
  } finally {
    await client?.dispose().catch(() => {});
  }
}

// ── running a new draft's API PLAN (the API test compiler) ──────────────────

const PLAN_VERDICT: Record<PlanRunResult["verdict"], HumanResult["verdict"]> = { passed: "passed", failed: "failed", "couldn't tell": "couldn't tell", "not run": "not run" };

/**
 * Run a compiled API plan on its own fresh record (apiPlanRunner.ts). The
 * setup is a journey run, so it is held to the same switch as journey runs.
 */
export async function runPlanDraft(plan: ApiPlan, caseId: string, opts: Pick<AssistantOptions, "companyId" | "journey">, emit: AssistantEmit): Promise<DraftRun> {
  const recipe = RECIPES[plan.setup.recipe];
  if (recipe && recipe.eventType !== null && !opts.journey)
    return { ran: false, verdict: "not run", line: `Not run — the plan builds a fresh event first (about ${recipe.minutes} min), and journey runs were turned off for this turn (journey=0).` };
  const v = await validatePlan({ ...plan, caseId });
  if (!v.ok) return { ran: false, verdict: "not run", line: `Not run — the stored plan no longer validates: ${v.errors.slice(0, 3).join("; ")}.` };
  const r = await runApiPlan(v.plan, { companyId: opts.companyId, onLine: (line) => emit("line", { line }), confirm: true });
  return {
    ran: r.verdict !== "not run",
    verdict: PLAN_VERDICT[r.verdict],
    line: `${{ passed: "Passed", failed: "Failed", "couldn't tell": "Couldn't tell", "not run": "Not run" }[r.verdict]} — ${r.reason}`,
    fixture: r.setup.title ? { title: r.setup.title, steps: r.setup.steps.length } : null,
    details: {
      kind: "api-plan",
      runId: r.runId,
      recipe: plan.setup.recipe,
      setup: { ok: r.setup.ok, reason: r.setup.reason, event: r.setup.title },
      steps: r.steps.map((s) => ({ phase: s.phase, n: s.n, title: s.title, verdict: s.verdict, actual: s.actual, request: s.call ? `${s.call.method} ${s.call.path}` : undefined, httpStatus: s.status, code: s.code })),
      confirmed: r.confirmed,
      confirmation: r.confirmation ? { verdict: r.confirmation.verdict, reason: r.confirmation.reason } : undefined,
    },
  };
}

// ── one turn ────────────────────────────────────────────────────────────────

export interface AssistantTurn {
  typed: string;
  decision: MatchResult["decision"];
  match: MatchResult;
  targets: RunTarget[];
  results: HumanResult[];
  built?: BuiltAutomation;
  draftRun?: DraftRun;
  draftSaved?: { id: string; mdFile: string; stored: string; error?: string };
  answer: string[];
  runIds: string[];
  usage: { calls: number; promptTokens: number; completionTokens: number; byModel: Record<string, unknown>; usd: number };
  turnId?: number | null;
  ms: number;
}

const brief = (c: MatchCandidate) => `${c.id} — ${c.title}`;

export async function runAssistant(typed: string, opts: AssistantOptions, emit: AssistantEmit): Promise<AssistantTurn> {
  const started = Date.now();
  const before = usageReport();

  emit("step", { name: "understand", status: "start", line: "Reading what you typed…" });
  const match = await matchTestCase(typed, { llm: opts.llm });
  const u = match.understood;
  emit("step", {
    name: "understand",
    status: "done",
    line: `I read it as: “${u.normalized}”${u.repairs.length ? ` (assumed ${u.repairs.join(", ")})` : ""}. It is about ${u.concepts.map((c) => c.said).join(", ") || "nothing I recognise"}; expected outcome: ${{ refuse: "it is refused", crash: "it must not crash", success: "it succeeds", neutral: "not stated" }[u.polarity]}.`,
  });
  emit("match", {
    decision: match.decision,
    headline: match.headline,
    same: match.same.map(slim),
    partial: match.partial.map(slim),
    others: match.candidates.filter((c) => c.relation === "unrelated" && c.origin === "catalog").slice(0, 3).map(slim),
    closest: match.closest,
    nearDraft: match.nearDraft ?? null,
    memory: match.memory,
    llm: match.llm,
  });
  emit("step", { name: "match", status: "done", line: match.headline });

  const answer: string[] = [match.headline];
  let targets: RunTarget[] = [];
  let results: HumanResult[] = [];
  let runIds: string[] = [];
  let built: BuiltAutomation | undefined;
  let draftRun: DraftRun | undefined;
  let draftSaved: AssistantTurn["draftSaved"];

  // A draft written earlier already says this: point at it (and run its stored
  // automation) instead of writing a second one. Drafts never count as coverage.
  const nearDraft = match.decision !== "existing" ? match.nearDraft : undefined;
  if (nearDraft) {
    const dc = match.candidates.find((c) => c.id === nearDraft.id);
    if (dc) match.same = [...match.same, dc];
    answer.push(`You already have a draft for this: “${nearDraft.title}” (${nearDraft.id}), still waiting for review — review it rather than writing another. No new draft was written.`);
    emit("step", { name: "build", status: "done", line: `Not written again — you already have a draft that says this: “${nearDraft.title}”. Review it in the drafts list.` });
  }

  if (match.decision === "existing" || nearDraft) {
    targets = match.same.map((c) => caseById(c.id)).filter((c): c is CatalogCase => !!c).map((c) => resolveTarget(c, opts.companyId));
    emit("plan", { targets });
    const runnableHere = targets.filter((t) => t.how === "case-run" || t.how === "library" || t.how === "journey");
    emit("step", {
      name: "resolve",
      status: "done",
      line:
        `${runnableHere.length} of ${targets.length} catalog case(s) can run here (API); ${targets.filter((t) => t.how === "ui").length} need a browser; ${targets.filter((t) => t.how === "none").length} have no runner yet.` +
        (match.same.some((c) => c.origin === "draft") ? ` ${match.same.filter((c) => c.origin === "draft").length} assistant draft(s) run their stored request.` : ""),
    });
    if (opts.run) {
      const r = await runTargets(targets, opts, emit);
      results = r.results;
      runIds = r.runIds;
    } else {
      results = targets.map((t) => ({ caseId: t.caseId, verdict: "not run" as const, line: `Not run — this turn was a dry run (run=0). It would run as ${t.where}.` }));
    }
    // Drafts the assistant wrote earlier run their own stored API request.
    for (const d of match.same.filter((c) => c.origin === "draft")) {
      const auto = await getDraftAutomation(d.id);
      let r: HumanResult;
      const storedPlan = (auto?.apiCase as { apiPlan?: ApiPlan } | null)?.apiPlan;
      if (storedPlan && opts.run) {
        const dr = await runPlanDraft(storedPlan, d.id, opts, emit);
        await updateDraftRun(d.id, dr);
        r = { caseId: d.id, verdict: dr.verdict, line: `${dr.line}${auto!.coverage !== "full" ? ` (the draft's automation covers only part of it: ${auto!.gaps.join("; ")})` : ""}`, details: dr.details };
      } else if (storedPlan) r = { caseId: d.id, verdict: "not run", line: "Not run — this turn was a dry run (run=0). Its stored API plan would run on a fresh record." };
      else if (!auto?.apiCase) r = { caseId: d.id, verdict: "not run", line: `Not run — draft ${d.id} has no API request${auto?.uiPlan ? "; its UI plan runs in a browser" : ""}.` };
      else if (!opts.run) r = { caseId: d.id, verdict: "not run", line: "Not run — this turn was a dry run (run=0). Its stored API request would run." };
      else {
        const rec = auto.apiCase;
        const lite = {
          api: { record: rec, gate: { ok: true }, covers: auto.coverage === "full" ? "full" : "partial", notCovered: [], needsEvent: EVENT_PLACEHOLDERS.some((p) => JSON.stringify({ a: rec.path, b: rec.body ?? null }).includes(`{{${p}}}`)) },
        } as unknown as BuiltAutomation;
        const dr = await runApiDraft(lite, opts.companyId, emit);
        await updateDraftRun(d.id, dr);
        r = { caseId: d.id, verdict: dr.verdict, line: `${dr.line}${auto.coverage !== "full" ? ` (the draft's automation covers only part of it: ${auto.gaps.join("; ")})` : ""}`, details: dr.details };
      }
      results.push(r);
      emit("result", r);
    }
    for (const r of results) answer.push(`${r.caseId}: ${r.line}`);
    // Nothing that matched can run here: point at the closest case that can.
    if (!runnableHere.length && !match.same.some((c) => c.origin === "draft")) {
      const near = match.partial
        .map((c) => caseById(c.id))
        .filter((c): c is CatalogCase => !!c)
        .map((c) => resolveTarget(c, opts.companyId))
        .find((t) => t.how === "case-run" || t.how === "library" || t.how === "journey");
      if (near) {
        emit("suggest", { target: near, why: "the closest PARTIAL match that does have a runner" });
        answer.push(`The closest case that can run here is ${near.caseId} (${near.title}) — it covers part of what you typed. To run it: ${near.call}.`);
      }
    }
    const drafts = match.same.filter((c) => c.origin === "draft");
    if (drafts.length && !nearDraft) answer.push(`${drafts.map((d) => d.id).join(", ")} ${drafts.length > 1 ? "are drafts" : "is a draft"} written earlier by the assistant — still waiting for review.`);
  } else if (opts.build) {
    emit("step", { name: "build", status: "start", line: "Nothing covers this fully, so I am writing a test case and the automation for it…" });
    const area = (await import("./drafts.js")).areaFor(u.concepts);
    const id = await nextDraftId(area);
    built = await buildAutomation(typed, match, { id, companyId: opts.companyId, llm: opts.llm, compileUi: opts.compile });
    emit("built", {
      id: built.id,
      draft: built.draft,
      coverage: built.coverage,
      gaps: built.gaps,
      layer: built.layer,
      api: built.api ? { gate: built.api.gate, covers: built.api.covers, basedOn: built.api.record.basedOn, generatedBy: built.api.record.generatedBy, request: `${built.api.record.method} ${built.api.record.path}`, body: built.api.record.body, expected: built.api.record.expected } : null,
      apiSkipped: built.apiSkipped,
      apiPlan: built.apiPlan
        ? { used: !!built.usesPlan, plan: built.apiPlan.plan, coverage: built.apiPlan.coverage, gaps: built.apiPlan.gaps, source: built.apiPlan.source, endpoints: built.apiPlan.endpoints, errors: built.apiPlan.errors }
        : null,
      ui: built.ui.compiled ? { steps: built.ui.compiled.plan.steps.map((s) => s.step), coverage: built.ui.compiled.coverage, gaps: built.ui.compiled.gaps, source: built.ui.compiled.source, executeCall: built.ui.executeCall } : { skipped: built.ui.skipped },
    });
    if (opts.run && built.usesPlan && built.apiPlan?.plan) {
      emit("step", { name: "run", status: "start", line: `Running the API plan of ${built.id} on a fresh record…` });
      draftRun = await runPlanDraft(built.apiPlan.plan, built.id, opts, emit);
      emit("draft-result", { id: built.id, ...draftRun });
    } else if (opts.run && built.api?.gate.ok) {
      emit("step", { name: "run", status: "start", line: `Running the API part of ${built.id}…` });
      draftRun = await runApiDraft(built, opts.companyId, emit);
      emit("draft-result", { id: built.id, ...draftRun });
    }
    draftSaved = await saveDraft({
      id: built.id,
      area: built.area,
      typed,
      title: built.draft.title,
      why: built.draft.why || "Typed into the assistant as a test case; nothing in the catalog covered it.",
      setup: built.draft.setup,
      steps: built.draft.steps,
      expected: built.draft.expected,
      oracle: built.draft.oracle || "The outcome in Expected is observed.",
      priority: built.draft.priority,
      layer: built.layer,
      coverage: built.coverage,
      gaps: built.gaps,
      partialOf: match.partial.map((c) => c.id),
      apiCase: built.api?.record,
      apiPlan: built.usesPlan ? built.apiPlan?.plan ?? undefined : undefined,
      uiPlan: built.ui.compiled?.plan,
      lastRun: draftRun,
      companyId: opts.companyId,
    });
    emit("draft", { ...draftSaved, status: "draft", needsReview: true });
    emit("step", { name: "store", status: "done", line: `Saved as ${built.id} — a draft that needs review (${draftSaved.stored}).` });

    const cov = { full: "covers all of it", partial: "covers part of it", none: "could not cover it yet" }[built.coverage];
    answer.push(`I wrote it up as ${built.id} — “${built.draft.title}” — and built an automation that ${cov}.`);
    if (built.usesPlan && built.apiPlan?.plan) answer.push(`API part: ${planSummary(built.apiPlan)}${draftRun ? ` — ${draftRun.line}` : " (not run this turn)."}`);
    else if (built.api?.gate.ok) answer.push(`API part: one request, a variation of library case ${built.api.record.basedOn ?? "?"}${draftRun ? ` — ${draftRun.line}` : " (not run this turn)."}`);
    else if (built.wantsApi) answer.push(`API part: none — ${built.apiSkipped}.`);
    if (built.ui.compiled && built.ui.compiled.source === "llm")
      answer.push(`UI part: a ${built.ui.compiled.plan.steps.length}-step browser plan (coverage ${built.ui.compiled.coverage}), compiled but not run — browser runs are started separately.`);
    else if (built.wantsUi) answer.push(`UI part: none — ${built.ui.skipped ?? "nothing compiled"}.`);
    if (built.gaps.length) answer.push(`Not covered yet: ${built.gaps.join("; ")}.`);
    answer.push("It is a draft: it is not in the catalog until someone reviews it.");
  }

  const after = usageReport();
  const sum = (r: ReturnType<typeof usageReport>, k: "calls" | "promptTokens" | "completionTokens") => Object.values(r.byModel).reduce((n, t) => n + t[k], 0);
  const usage = {
    calls: sum(after, "calls") - sum(before, "calls"),
    promptTokens: sum(after, "promptTokens") - sum(before, "promptTokens"),
    completionTokens: sum(after, "completionTokens") - sum(before, "completionTokens"),
    byModel: after.byModel,
    usd: after.totalUsd - before.totalUsd,
  };
  const turn: AssistantTurn = { typed, decision: match.decision, match, targets, results, built, draftRun, draftSaved, answer, runIds, usage, ms: Date.now() - started };
  turn.turnId = await recordTurn({
    typed,
    companyId: opts.companyId,
    decision: match.decision,
    matched: match.same.map((c) => c.id),
    partial: match.partial.map((c) => c.id),
    generatedId: built?.id ?? null,
    runIds,
    answer: answer.join("\n"),
    record: { ...turn, match: { ...match, candidates: match.candidates.map(slim) } },
  });
  emit("answer", { paragraphs: answer, decision: match.decision, usage, ms: turn.ms, turnId: turn.turnId });
  return turn;
}

function slim(c: MatchCandidate) {
  return { id: c.id, title: c.title, relation: c.relation, why: c.why, matchWhy: c.matchWhy, differs: c.differs, missing: c.missing, origin: c.origin, layer: c.layer, scores: c.scores, llm: c.llm };
}

export { brief };
export type { TestCaseRecord };
