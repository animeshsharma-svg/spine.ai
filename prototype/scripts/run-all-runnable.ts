/**
 * RUN EVERY RUNNABLE EVENTS CASE FOR ONE CLIENT — in safe batches, API only.
 *
 *   npx tsx scripts/run-all-runnable.ts --c 198678 --dry          what would run, and why
 *   npx tsx scripts/run-all-runnable.ts --c 198678                run it (bounded)
 *     --budget-min 150   stop starting new batches after this many minutes (default 150)
 *     --batch 40         cases per batch; each batch starts on a FRESH copy of the event (default 40)
 *     --only never-run   only cases with no result on this client yet (default: never-run first, then the rest)
 *     --types rfq_only,rfp_rfq   limit the event types
 *     --no-be            skip the API framework's BE- cases
 *     --summary <file>   also write the pass's summary (batches, re-checks) as JSON
 *     --cases A,B,C      only these library case ids (also ones no catalog case routes to)
 *     --never-recheck    record first results as they are (default: every new failure is re-run alone)
 *     --plans            ALSO run the stored, validated API plans (data/compiled-plans/api, full coverage);
 *     --plans-only       ONLY those (each builds its own fresh record; a failure is re-checked on a second one)
 *
 * What it runs: every catalog case whose route (src/checks/caseRouting.ts) is
 * an exact or same-request API runner — the case library (EDGE-…, the written
 * imports, the mined cases) and the API framework's BE- cases. Field checks
 * (API-F…) are judged on every journey this script walks. Browser cases are
 * never run here (one browser at a time, and it belongs to another agent);
 * vendor bulk upload is left out (it creates prospects and emails a team);
 * template field checks and bidding scenarios have their own runners.
 *
 * How, in the order the dashboard's own runs do it:
 *   1. per event type, ONE journey walks the whole collection (sign in, draft,
 *      rounds, publish, vendor, bid, evaluate, award) and builds a second copy
 *      of the event for the cases;
 *   2. the cases run in batches; each batch gets a fresh copy, a case that
 *      crashes or ends the copy moves the rest onto another fresh copy, and
 *      destructive cases go last (same rules as server.ts /api/features-run);
 *   3. EVERY failure that this client has not seen fail before is re-run ALONE
 *      on its OWN fresh copy before it is recorded as a failure. If it does not
 *      fail again, the recorded verdict is the fresh one and the note says so.
 *   4. each batch is saved as a normal run (data/runs + the spine database), so
 *      the Success page and the coverage report pick it up.
 *
 * Bounded everywhere: a budget for the whole pass, a cap on rebuilds, a deadline
 * on every look-up before the first case, and a stop on a dead session.
 */
import { writeFileSync } from "node:fs";
import { allCases } from "../src/checks/testCatalog.js";
import { routeFor } from "../src/checks/caseRouting.js";
import { allResults } from "../src/checks/metrics.js";
import {
  loadCases,
  buildChecksFromCases,
  resolveCaseContext,
  resolveActor,
  configRequirementOf,
  idsFromReply,
  orderForSharedCopy,
  type TestCaseRecord,
} from "../src/checks/caseLibrary.js";
import { disposeVendorSession } from "../src/checks/actors.js";
import { allStoredApiPlans, storedPlanProblems } from "../src/checks/compiledPlans.js";
import { validatePlan } from "../src/agents/apiPlanner.js";
import { runApiPlan } from "../src/checks/apiPlanRunner.js";
import { openClientContext } from "../src/executor.js";
import { runEventJourney, journeyToSetupSteps, journeyToSetupSummary } from "../src/checks/eventJourney.js";
import { journeyPlan, EVENT_TYPES, type EventType } from "../src/checks/journeyModel.js";
import { runCheck } from "../src/checks/engine.js";
import { loadCompanyConfig, featureConfigState, isFlagOn } from "../src/checks/companyConfig.js";
import { featureGatesFor, mergeConfigState, offReason } from "../src/checks/featureGates.js";
import { findFeature } from "../config/featureTree.js";
import { saveRun, newRunId } from "../src/runStore.js";
import { runApiCases, resetApiSession } from "../src/checks/apiCaseRunner.js";
import { closeSpineDb } from "../src/db/spineDb.js";
import type { CheckResult } from "../src/ai/types.js";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(`--${n}`);

/**
 * An idle connection of Procol's read-only database pool (procol test) timing
 * out emits an unhandled 'error' on the pool, which would kill the whole pass
 * between two cases (seen 2026-10-03: read ETIMEDOUT). That is a dropped idle
 * socket, not a result — note it and carry on; the pool reconnects on demand.
 */
process.on("uncaughtException", (e: any) => {
  if (/ETIMEDOUT|ECONNRESET|Connection terminated|EPIPE/i.test(`${e?.code ?? ""} ${e?.message ?? ""}`)) {
    console.log(`[${new Date().toISOString().slice(11, 19)}] a database connection dropped while idle (${e?.code ?? e?.message}) — carrying on`);
    return;
  }
  console.error(e);
  process.exit(1);
});

const COMPANY = Number(arg("c") ?? 198678);
const DRY = flag("dry");
const BUDGET_MS = (Number(arg("budget-min")) || 150) * 60_000;
const BATCH = Math.max(5, Number(arg("batch")) || 40);
const ONLY_NEVER = arg("only") === "never-run";
const TYPES = (arg("types") ?? "").split(",").map((s) => s.trim()).filter(Boolean) as EventType[];
const NO_BE = flag("no-be");
const ONLY_CASES = new Set((arg("cases") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
/** A run never builds more than this many own copies (cases that must not share one). */
const MAX_OWN_COPIES = Number(arg("max-own-copies")) || 60;
const T0 = Date.now();
const WITH_PLANS = flag("plans") || flag("plans-only");
const PLANS_ONLY = flag("plans-only");
const NEVER_RECHECK = flag("never-recheck");
/** re-check every failure on a fresh copy, not only the ones this client has not seen fail before */
const RECHECK_ALL = flag("recheck-all");
const left = () => BUDGET_MS - (Date.now() - T0);
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

/** Bounded wait with a stated fallback — nothing before the first case may hang. */
async function bounded<T>(p: Promise<T>, ms: number, what: string, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      log(`${what} took longer than ${Math.round(ms / 1000)} s — carrying on without it`);
      resolve(fallback);
    }, ms);
  });
  try {
    return await Promise.race([p.catch(() => fallback), late]);
  } finally {
    clearTimeout(timer);
  }
}

// ── 1. what to run ──────────────────────────────────────────────────────────

const EVENTS_GROUP = /^API-(?!XVBU|XTPL|XMAT|F[A-Z])/; // events API cases, minus the ones with their own runners
const featureType = new Map(Object.entries(EVENT_TYPES).map(([k, v]) => [v.feature, k as EventType]));
/**
 * The event a case needs. Its own `eventType` (the written imports), its
 * feature's type, and otherwise what its request addresses: a case that names
 * the technical round, its form or a technical response needs an event that
 * HAS one (technical + RFQ); the rest run on the plain RFQ event.
 */
const NEEDS_TECHNICAL = /\{\{(rfpTradeId|evalFormUuid|templateResponseUuid|techFormUuid|techPageUuid|technicalTradeUuid)\}\}/;
const typeOf = (lc: TestCaseRecord): EventType =>
  ((lc as any).eventType as EventType) ??
  featureType.get(lc.feature) ??
  (NEEDS_TECHNICAL.test(JSON.stringify({ p: lc.path, b: lc.body })) ? "rfp_rfq" : "rfq_only");

const lib = new Map(loadCases().map((c) => [c.id, c]));
const { map: history } = await allResults(COMPANY);

const libTargets = new Map<string, { lc: TestCaseRecord; catalog: string[] }>();
const beTargets = new Map<string, string[]>();
for (const c of allCases()) {
  if (c.layer !== "api" || !EVENTS_GROUP.test(c.group)) continue;
  const r = routeFor(c);
  if (!r.runsNow) continue;
  if (r.kind === "api-library") {
    for (const id of (r.target ?? "").split(",").filter(Boolean)) {
      const lc = lib.get(id);
      if (!lc || lc.bulk) continue;
      const t = libTargets.get(id) ?? { lc, catalog: [] };
      t.catalog.push(c.id);
      libTargets.set(id, t);
    }
  } else if (r.kind === "api-case" && r.target) {
    beTargets.set(r.target, [...(beTargets.get(r.target) ?? []), c.id]);
  }
}
// Asked for by id: run them even when no catalog case routes to them.
for (const id of ONLY_CASES) {
  const lc = lib.get(id);
  if (lc && !lc.bulk && !libTargets.has(id)) libTargets.set(id, { lc, catalog: [] });
}
if (ONLY_CASES.size) for (const id of [...libTargets.keys()]) if (!ONLY_CASES.has(id)) libTargets.delete(id);
const everRan = (id: string) => (history.get(id)?.runs ?? 0) > 0;
const failedBefore = (id: string) => (history.get(id)?.fail ?? 0) > 0;

const byType = new Map<EventType, TestCaseRecord[]>();
for (const { lc } of libTargets.values()) {
  if (ONLY_NEVER && everRan(lc.id)) continue;
  const t = typeOf(lc);
  if (TYPES.length && !TYPES.includes(t)) continue;
  byType.set(t, [...(byType.get(t) ?? []), lc]);
}
// Never-run first inside each type; the order inside each part is the library's.
for (const [t, list] of byType) byType.set(t, [...list.filter((c) => !everRan(c.id)), ...list.filter((c) => everRan(c.id))]);

const beIds = NO_BE || ONLY_CASES.size || PLANS_ONLY ? [] : [...beTargets.keys()].filter((id) => !ONLY_NEVER || !everRan(id));

log(`client ${COMPANY} · ${libTargets.size} library case(s) and ${beTargets.size} BE case(s) route here exactly`);
for (const [t, list] of byType) {
  log(`  ${t.padEnd(11)} ${String(list.length).padStart(4)} case(s), ${list.filter((c) => !everRan(c.id)).length} never run on this client`);
}
log(`  BE cases    ${String(beIds.length).padStart(4)}, ${beIds.filter((id) => !everRan(id)).length} never run on this client`);
const storedPlans = WITH_PLANS
  ? allStoredApiPlans().filter((sp) => sp.meta.validated && sp.meta.coverage === "full" && (!ONLY_CASES.size || ONLY_CASES.has(sp.meta.caseId)))
  : [];
if (WITH_PLANS) log(`  stored API plans (full, validated): ${storedPlans.length}`);
if (PLANS_ONLY) byType.clear();
if (DRY) {
  await closeSpineDb();
  process.exit(0);
}

// ── 2. run ──────────────────────────────────────────────────────────────────

const summary: any = { company: COMPANY, startedAt: new Date().toISOString(), batches: [], verified: [], stopped: null as string | null };
const isEdge = (cs: TestCaseRecord) => /^EDGE-/.test(cs.id);
const ENDS_LIFE = /"status":"(withdrawn|closed|cancelled|draft|in_active|deleted)"|"force_end":|"withdraw_remark"/;
const destructive = (cs: TestCaseRecord) =>
  /destructive|own copy|run it last/i.test(`${cs.preconditions ?? ""} ${cs.title ?? ""}`) ||
  /withdraw|cancel|force_?(end|close)|close_trade|revert/i.test(cs.path) ||
  ENDS_LIFE.test(JSON.stringify(cs.body ?? {}));

type Sandbox = { eventGroupUuid: string; tradeId?: string; lineItemUuid: string };

function retarget(checks: any[], from: Sandbox, to: Sandbox) {
  const pairs = (["eventGroupUuid", "tradeId", "lineItemUuid"] as const)
    .map((k) => [from[k], to[k]] as const)
    .filter(([a, b]) => a && b && a !== b) as Array<readonly [string, string]>;
  const swap = (x: string) => pairs.reduce((acc, [a, b]) => acc.split(a).join(b), x);
  for (const c of checks) {
    if (!c?.request) continue;
    const body = c.request.body === undefined ? undefined : JSON.parse(swap(JSON.stringify(c.request.body)));
    c.request = { ...c.request, path: swap(String(c.request.path)), ...(body === undefined ? {} : { body }) };
    if (typeof c.inputSummary === "string") c.inputSummary = swap(c.inputSummary);
  }
}

const touches = (chk: any, sb: Sandbox) => {
  const req = chk.request ?? {};
  const text = `${req.path ?? ""} ${JSON.stringify(req.body ?? {})}`;
  return text.includes(sb.eventGroupUuid) || (!!sb.tradeId && text.includes(sb.tradeId));
};

let client: any = null;
/** Contexts replaced by a renewal; disposed at the end (they share a request context). */
const stale: any[] = [];
let renewed = false;
try {
  log("opening a session for this client…");
  client = await bounded(openClientContext(COMPANY), 120_000, "opening the client", null);
  if (!client) throw new Error("could not open a session for this client within two minutes");
  const companyCfg = await bounded(loadCompanyConfig(client, COMPANY), 60_000, "reading the company's settings", {
    companyId: COMPANY, flags: {}, permissions: [], loaded: false, error: "timed out",
  } as any);
  const gates = await bounded(featureGatesFor(COMPANY), 60_000, "reading which features this client has", null);
  const actor = await bounded(resolveActor(client), 60_000, "finding out who the run acts as", {} as any);
  const baseCtx = await bounded(resolveCaseContext(client), 90_000, "reading the ids the cases need", {} as any);
  summary.companyName = companyCfg.companyName ?? null;

  for (const [eventType, list] of byType) {
    if (left() < 10 * 60_000) {
      summary.stopped = `budget reached before the ${eventType} cases`;
      break;
    }
    // The journey: the whole collection, once per type, plus a copy for the cases.
    const features = [EVENT_TYPES[eventType].feature, ...new Set(list.map((c) => c.feature))];
    const plan = journeyPlan(features);
    log(`── ${EVENT_TYPES[eventType].label}: journey (${plan.steps.length} steps) then ${list.length} case(s)`);
    const jStart = Date.now();
    const walked = await runEventJourney(client, plan, {
      stageSeconds: 45,
      buildVariationsEvent: true,
      onLine: (l: string) => /fresh copy|second copy|could not|refused/i.test(l) && log(`   ${l}`),
    });
    const journey = walked.journey;
    log(`   journey: ${journey.outcome}`);
    if (!walked.forCases || !walked.rebuildForCases) {
      summary.batches.push({ eventType, journey: journey.outcome, ran: 0, note: "no copy of the event could be built for the cases" });
      saveRun({
        id: newRunId(), ts: new Date(jStart).toISOString(), request: `run-all: ${eventType} journey`, companyId: COMPANY,
        companyName: companyCfg.companyName ?? null, provider: "deterministic", durationMs: Date.now() - jStart,
        report: undefined, events: [], flowResults: [], validationResults: [], checkResults: [],
        journey, setupSteps: journeyToSetupSteps(journey), setupSummary: journeyToSetupSummary(journey),
      } as any);
      continue;
    }
    // A copy-builder is bound to the session it was made with; after a renewal
    // the journey is walked again on the new session to get a working one.
    let rebuild = walked.rebuildForCases;
    let rebuildSession = client;
    const made = journey.made ?? {};

    // Gate the cases exactly as the dashboard does: feature off → skip; a case
    // whose expected outcome needs a setting the other way → skip.
    const skipped: Array<{ id: string; title: string; reason: string }> = [];
    const allowed: TestCaseRecord[] = [];
    for (const cs of list) {
      const feat = findFeature(cs.feature);
      const st = mergeConfigState(featureConfigState(companyCfg, feat?.requiresConfig), feat ? gates?.[feat.id] : undefined);
      if (st.state === "off") {
        skipped.push({ id: cs.id, title: cs.title, reason: `${offReason(st, companyCfg.companyName ?? "this company")} — the feature isn't enabled here` });
        continue;
      }
      const rule = companyCfg.loaded ? configRequirementOf(cs.preconditions, companyCfg.flags) : null;
      if (rule) {
        const on = isFlagOn(companyCfg.flags[rule.flag]);
        if (rule.mustBe === "on" ? !on : on) {
          skipped.push({ id: cs.id, title: cs.title, reason: `only holds when "${rule.flag}" is ${rule.mustBe.toUpperCase()}; it is ${on ? "ON" : "OFF"} here` });
          continue;
        }
      }
      allowed.push(cs);
    }

    let first = true;
    for (let i = 0; i < allowed.length; i += BATCH) {
      if (left() < 4 * 60_000) {
        summary.stopped = `budget reached in the ${eventType} cases after ${i} of ${allowed.length}`;
        break;
      }
      const chunk = allowed.slice(i, i + BATCH);
      // Buyer cases, then the vendor's (a bid changes what later buyer cases
      // see), then the destructive ones; own-copy cases are unaffected.
      const ordered = orderForSharedCopy(chunk, destructive);
      const bStart = Date.now();
      // A fresh copy per batch (the journey's own copy for the first one).
      if (rebuildSession !== client) {
        log("   the session was renewed — walking the journey again on the new session for fresh copies");
        const again = await runEventJourney(client, plan, { stageSeconds: 45, buildVariationsEvent: true });
        if (again.rebuildForCases) {
          rebuild = again.rebuildForCases;
          rebuildSession = client;
        }
      }
      let sandbox: Sandbox | undefined = first ? walked.forCases : await bounded(rebuild(), 180_000, "building a fresh copy", undefined);
      first = false;
      if (!sandbox) {
        log("   could not build a fresh copy — skipping this batch");
        summary.batches.push({ eventType, batch: i / BATCH + 1, ran: 0, note: "no fresh copy" });
        continue;
      }
      const ctx: Record<string, unknown> = { ...baseCtx, ...sandbox, stamp: String(Date.now()) };
      for (const [k, v] of Object.entries(made)) if (v && ctx[k] === undefined) ctx[k] = v;
      if (made.technicalTradeUuid) ctx.rfpTradeId = made.technicalTradeUuid;
      const live: Record<string, unknown> = { ...ctx };
      const harvest = (data: unknown, chk: any) => Object.assign(live, idsFromReply(chk.request?.path ?? "", data));

      const built = buildChecksFromCases(client, ordered, ctx as any, actor);
      const results: CheckResult[] = [];
      let rebuilds = 0;
      let ownCopies = 0;
      let authFails = 0;
      let dead = false;
      const runAll = async (checks: any[]) => {
        for (let k = 0; k < checks.length; k++) {
          if (left() < 60_000) break;
          const chk = checks[k];
          // A case that changes the copy in a way the next case would inherit
          // gets a fresh copy of its own; the shared one stays as it was.
          let ranOn = sandbox;
          if (chk.ownCopy && sandbox) {
            const own = ownCopies < MAX_OWN_COPIES ? await bounded(rebuild(), 180_000, "building a copy for one case", undefined) : undefined;
            if (!own) {
              skipped.push({ id: chk.id, title: chk.scenario, reason: `needs a fresh copy of its own (${chk.ownCopy}) and ${ownCopies >= MAX_OWN_COPIES ? `this pass already built ${MAX_OWN_COPIES}` : "one could not be built"} — not run, rather than run on a shared copy` });
              continue;
            }
            ownCopies += 1;
            retarget([chk], sandbox, own);
            ranOn = own;
          }
          const res = await runCheck(client, chk, harvest);
          (res as any).__check = chk;
          (res as any).__sandbox = ranOn;
          results.push(res);
          // The vendor's 401s say nothing about the buyer's session.
          if (chk.actor !== "vendor") authFails = res.httpStatus === 401 ? authFails + 1 : 0;
          if (authFails >= 3) {
            // Three refusals in a row is either a dead session or endpoints that
            // want the vendor's token (the bids API refuses the buyer's). Ask.
            const probe = async () => {
              try {
                const r = await client?.ctx?.buyerApi?.attempt?.("GET", "/v1/dashboard_configuration", {});
                return { ok: r?.ok === true, status: r?.status, message: r?.message };
              } catch (e) {
                return { ok: false, status: 0, message: (e as Error).message };
              }
            };
            let p = await probe();
            if (!p.ok && !renewed) {
              renewed = true;
              log(`   the session probe was refused (${p.status} ${p.message ?? ""}) — opening a new session once`);
              const old = client;
              const fresh = await bounded(openClientContext(COMPANY), 120_000, "opening a new session", null);
              if (fresh) {
                client = fresh;
                stale.push(old);
                p = await probe();
              }
            }
            if (!p.ok) {
              dead = true;
              summary.stopped = `the session died after ${results.length} case(s) in a ${eventType} batch (probe answered ${p.status} ${p.message ?? ""}) — someone needs to sign in to this client again`;
              return;
            }
            authFails = 0;
          }
          // Crash or end-of-life on the shared copy → the rest move to a fresh one.
          const m = String(chk.request?.method ?? "GET").toUpperCase();
          if (m !== "GET" && !chk.ownCopy && sandbox && touches(chk, sandbox) && rebuilds < 15) {
            const crashed = (res.httpStatus ?? 0) >= 500;
            const ended = !crashed && (res.httpStatus ?? 0) >= 200 && (res.httpStatus ?? 0) < 300 &&
              (ENDS_LIFE.test(JSON.stringify(chk.request?.body ?? {})) || /withdraw|cancel|force_?(end|close)|close_trade|revert/i.test(String(chk.request?.path ?? "")));
            if (crashed || ended) {
              rebuilds += 1;
              const fresh = await bounded(rebuild(), 180_000, "building a fresh copy", undefined);
              if (fresh) {
                retarget(checks.slice(k + 1), sandbox, fresh);
                Object.assign(live, fresh);
                sandbox = fresh;
              }
            }
          }
        }
      };
      await runAll(built.checks);
      // Cases that were waiting on a record an earlier case made — one more pass.
      if (!dead && built.deferred.length) {
        const again = buildChecksFromCases(client, built.deferred.map((d) => d.record), live as any, actor);
        await runAll(again.checks);
        for (const d of again.deferred) skipped.push({ id: d.record.id, title: d.record.title, reason: `needs ${d.needs.join(", ")}, which nothing in this run produced` });
        skipped.push(...again.skipped);
      }
      skipped.push(...built.skipped);

      // 3 · a NEW failure is a bug only if it fails again on its own fresh copy.
      for (const res of results) {
        if (res.pass || res.inconclusive || (!RECHECK_ALL && failedBefore(res.id)) || NEVER_RECHECK || left() < 60_000) continue;
        const chk = (res as any).__check;
        const ranOn: Sandbox | undefined = (res as any).__sandbox;
        const fresh = await bounded(rebuild(), 180_000, "building a fresh copy for a re-check", undefined);
        if (!fresh || !ranOn) {
          summary.verified.push({ id: res.id, reproduced: null, note: "no fresh copy could be built to re-check it" });
          continue;
        }
        // The check itself is moved: its sender reads the request it carries
        // when it runs, so a shallow copy of it would still go to the old
        // event. (It did, until 2026-10-03 — re-checks ran on the first copy.)
        retarget([chk], ranOn, fresh);
        const again = await runCheck(client, chk);
        const reproduced = !again.pass && !again.inconclusive;
        summary.verified.push({ id: res.id, reproduced, first: res.verdict, fresh: again.verdict, status: [res.httpStatus, again.httpStatus] });
        if (!reproduced) {
          // The fresh verdict stands; the first attempt is kept in words.
          Object.assign(res, again, {
            message: `First attempt failed (${res.verdict}); re-run alone on a fresh copy of the event: ${again.verdict}. Recorded as the fresh result.`,
          });
        } else {
          res.message = `${res.message ?? ""} — confirmed: failed again when re-run alone on a fresh copy of the event.`.trim();
        }
        log(`   re-checked ${res.id} on a fresh copy: ${reproduced ? "FAILED AGAIN (real)" : "did not fail again"}`);
      }
      for (const r of results) {
        delete (r as any).__check;
        delete (r as any).__sandbox;
      }

      const p = results.filter((r) => r.pass && !r.inconclusive).length;
      const f = results.filter((r) => !r.pass && !r.inconclusive).length;
      const n = results.filter((r) => r.inconclusive).length;
      log(`   batch ${i / BATCH + 1}: ${results.length} ran — ${p} passed, ${f} failed, ${n} couldn't tell, ${skipped.length} skipped · ${Math.round((Date.now() - bStart) / 1000)} s`);
      saveRun({
        id: newRunId(),
        ts: new Date(bStart).toISOString(),
        request: `run-all: ${eventType} batch ${i / BATCH + 1}`,
        companyId: COMPANY,
        companyName: companyCfg.companyName ?? null,
        provider: "deterministic",
        durationMs: Date.now() - bStart + (i === 0 ? bStart - jStart : 0),
        report: undefined,
        events: [{ agent: "System", kind: "plan", text: "run-all batch", data: { skipped } } as any],
        flowResults: [],
        validationResults: [],
        checkResults: results,
        // The journey belongs to the type's first batch only, so its steps count once.
        ...(i === 0 ? { journey, setupSteps: journeyToSetupSteps(journey), setupSummary: journeyToSetupSummary(journey) } : {}),
      } as any);
      summary.batches.push({ eventType, batch: i / BATCH + 1, ran: results.length, passed: p, failed: f, inconclusive: n, skipped: skipped.length, journey: i === 0 ? journey.outcome : undefined });
      skipped.length = 0;
      if (dead) break;
    }
    if (summary.stopped) break;
  }

  // ── stored API plans: validated again, then each on its own fresh record
  if (!summary.stopped && storedPlans.length) {
    log(`── stored API plans: ${storedPlans.length}`);
    for (const sp of storedPlans) {
      if (left() < 15 * 60_000) {
        summary.stopped = "budget reached in the stored API plans";
        break;
      }
      const v = await validatePlan(sp.plan);
      if (!v.ok) {
        summary.batches.push({ eventType: "api-plan", id: sp.meta.caseId, ran: 0, note: `stored plan no longer validates: ${v.errors.join("; ")}` });
        log(`   ${sp.meta.caseId}: not run — the stored plan no longer validates (${v.errors.join("; ").slice(0, 160)})`);
        continue;
      }
      const problems = await storedPlanProblems(v.plan, sp.meta.title);
      if (problems.length) {
        summary.batches.push({ eventType: "api-plan", id: sp.meta.caseId, ran: 0, note: problems.join("; ") });
        log(`   ${sp.meta.caseId}: not run — ${problems.join("; ").slice(0, 200)}`);
        continue;
      }
      const r = await runApiPlan({ ...v.plan, caseId: sp.meta.caseId }, { companyId: COMPANY, client, confirm: true, save: true, onLine: () => {} });
      summary.batches.push({ eventType: "api-plan", id: sp.meta.caseId, verdict: r.verdict, confirmed: r.confirmed ?? null, reason: r.reason.slice(0, 300) });
      if (r.confirmation) summary.verified.push({ id: sp.meta.caseId, reproduced: !!r.confirmed, first: "failed", fresh: r.confirmation.verdict });
      log(`   ${sp.meta.caseId}: ${r.verdict} — ${r.reason.slice(0, 220)}`);
    }
  }

  // ── the API framework's BE- cases, in process, on its own fixtures
  if (!summary.stopped && beIds.length && left() > 5 * 60_000) {
    log(`── API framework: ${beIds.length} BE case(s)`);
    const bStart = Date.now();
    const outs = await runApiCases(beIds, () => {}, (l) => log(`   ${l}`));
    // New failures: rebuilt fixtures, run alone.
    for (const o of outs) {
      if (o.status !== "failed" || failedBefore(o.id) || o.verdict === "automation_defect" || left() < 60_000) continue;
      resetApiSession();
      const [again] = await runApiCases([o.id], () => {});
      const reproduced = again?.status === "failed";
      summary.verified.push({ id: o.id, reproduced, first: o.verdict, fresh: again?.verdict });
      if (!reproduced && again) Object.assign(o, again, { message: `First attempt failed (${o.verdict}); re-run alone on fresh fixtures: ${again.status}.` });
      log(`   re-checked ${o.id} on fresh fixtures: ${reproduced ? "FAILED AGAIN (real)" : "did not fail again"}`);
    }
    const checkResults = outs
      .filter((o) => o.status !== "skipped")
      .map((o) => ({
        id: o.id, flowId: "events.contract", module: "events", scenario: o.title, type: "Functional", category: o.area,
        priority: "P1", severity: o.severity ?? "Medium", expected: "accept", layer: "api", inputSummary: `${o.method ?? ""} ${o.path ?? ""}`,
        httpStatus: o.httpStatus ?? null, accepted: o.status === "passed",
        // A thrown runner is the harness's problem, not the product's.
        inconclusive: o.verdict === "automation_defect" ? true : undefined,
        message: o.message ?? o.reason ?? null, durationMs: o.durationMs, pass: o.status === "passed", verdict: o.verdict ?? o.status,
      }));
    saveRun({
      id: newRunId(), ts: new Date(bStart).toISOString(), request: "run-all: API framework BE cases", companyId: COMPANY,
      companyName: summary.companyName, provider: "deterministic", durationMs: Date.now() - bStart, report: undefined,
      events: [{ agent: "System", kind: "plan", text: "run-all BE", data: { skipped: outs.filter((o) => o.status === "skipped").map((o) => ({ id: o.id, title: o.title, reason: o.reason })) } } as any],
      flowResults: [], validationResults: [], checkResults: checkResults as any,
    } as any);
    summary.batches.push({ eventType: "be", ran: checkResults.length, passed: outs.filter((o) => o.status === "passed").length, failed: outs.filter((o) => o.status === "failed").length, skipped: outs.filter((o) => o.status === "skipped").length });
    log(`   BE: ${outs.filter((o) => o.status === "passed").length} passed, ${outs.filter((o) => o.status === "failed").length} failed, ${outs.filter((o) => o.status === "skipped").length} skipped`);
  }
} catch (e) {
  summary.stopped = `stopped by an error: ${(e as Error).message}`;
  log(summary.stopped);
} finally {
  await disposeVendorSession(client);
  await client?.dispose?.().catch?.(() => {});
  for (const old of stale) {
    await disposeVendorSession(old);
    await old?.dispose?.().catch?.(() => {});
  }
}

summary.finishedAt = new Date().toISOString();
summary.minutes = Math.round((Date.now() - T0) / 60000);
const sumFile = arg("summary");
if (sumFile) {
  try {
    writeFileSync(sumFile, JSON.stringify(summary, null, 1));
  } catch {
    /* the summary is also printed */
  }
}
console.log(JSON.stringify({ batches: summary.batches, verified: summary.verified, stopped: summary.stopped }, null, 1));
log(`done in ${summary.minutes} min${summary.stopped ? ` — ${summary.stopped}` : ""}`);
log(`re-checked ${summary.verified.length} new failure(s): ${summary.verified.filter((v: any) => v.reproduced).length} failed again, ${summary.verified.filter((v: any) => v.reproduced === false).length} did not`);
// Let the background database copies of the saved runs land before closing (bounded).
await (await import("../src/runStore.js")).whenRunsSaved();
await closeSpineDb();
process.exit(0);
