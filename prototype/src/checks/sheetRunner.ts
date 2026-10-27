/**
 * RUN A TEST-CASE SHEET — every case one by one, then one report.
 *
 * For each case (sheetCases.ts):
 *   UI   build the event its pre-conditions name by API (sheetPrep), compile its plain-language steps into
 *        browser steps, run them with the spotlight on, and read the result;
 *   API  compile it into requests with status, schema and data checks (apiPlanner), send them for real.
 * Each case ends as Pass, Fail, Partly checked, Couldn't tell or Not run, with the reason in plain words.
 * A Fail is a bug candidate (the screen or the app contradicted the expected result) and carries its
 * screenshots; when the automation itself could not do a step it is "Couldn't tell", never a bug.
 * The run is kept in data/sheet-runs/<id>.json; sheetReport.ts turns it into the report and the sheet.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sheetCaseProse, sheetPrep, type SheetCase } from "./sheetCases.js";
import { compileTestCase } from "../agents/planner.js";
import { compileApiPlan, applyLineItemCount } from "../agents/apiPlanner.js";
import { runApiPlan } from "./apiPlanRunner.js";
import { apiResultInWords, API_CHECK_GUIDE, isServerError, wrongPlaceOnly, type HumanApiStep } from "./humanApi.js";
import { runUiPlan, readPlanResult } from "../ui/uiFlowRunner.js";
import { contextForPlan } from "../ui/prepareForPlan.js";
import { VALUE_KEYS } from "../agents/screenModel.js";
import { stepWords, expectedWords } from "../agents/journeyCases.js";
import { addToBacklog, clearFromBacklog, screenFor, stuckSince, teachStuck, type ScreenGround } from "./selfRepair.js";
import { settingsFor, withSettings } from "./companySettings.js";

const here = dirname(fileURLToPath(import.meta.url));
const RUNS = join(here, "..", "..", "data", "sheet-runs");

export type SheetVerdict = "Pass" | "Fail" | "Partly checked" | "Couldn't tell" | "Not run";
export interface Shot { file: string; caption: string }
export interface SheetBug {
  title: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  whatHappened: string;
  expected: string;
  where?: string;
  appSaid?: string;
  rule?: string;
  shots: Shot[];
}
export interface SheetRunCase {
  id: string;
  title: string;
  module: string;
  layer: "ui" | "api";
  priority: string;
  status: SheetVerdict;
  /** one or two plain sentences: why this verdict */
  why: string;
  startedFrom?: string;
  /** the steps the run did, in words, each with its outcome */
  steps: Array<{ n: number; words: string; outcome: "done" | "failed" | "not reached" | "checked"; detail?: string }>;
  shots: Shot[];
  bug?: SheetBug;
  api?: { summary: string; steps: HumanApiStep[] };
  ms: number;
  planRunId?: string;
  /** set when the agent repaired its own automation and ran the case again */
  repaired?: { how: string; before: string };
  /** the page the browser was on when it stopped (for repairs) */
  lastUrl?: string;
  /** the plan step it failed at (for second opinions) */
  failedStep?: string;
  /** company settings switched for this case (and switched back after) */
  settings?: Array<{ key: string; from: unknown; to: unknown }>;
  case: SheetCase;
}
export interface SheetRun {
  id: string;
  sheet: string;
  companyId: number;
  startedAt: string;
  endedAt?: string;
  status: "running" | "done" | "stopped";
  total: number;
  cases: SheetRunCase[];
}
export type SheetEvent =
  | { type: "case-start"; id: string; title: string; index: number; total: number }
  | { type: "line"; id: string; line: string }
  | { type: "frame"; frame: string }
  | { type: "spot"; spot: unknown }
  | { type: "case-done"; result: SheetRunCase }
  | { type: "done"; run: SheetRun };

const mask = (s: string) => String(s ?? "").replace(/(access-token|lightspeed-token|token|authorization)=([^&\s'"]+)/gi, "$1=…").replace(/eyJ[A-Za-z0-9_-]{20,}/g, "…");
const ASSERT = /^(expect_|attempt$)/;

let active: { id: string; stop: () => void } | null = null;
export function activeSheetRun(): string | null {
  return active?.id ?? null;
}
export function stopSheetRun(id: string): boolean {
  if (!active || active.id !== id) return false;
  active.stop();
  return true;
}

function save(run: SheetRun): void {
  mkdirSync(RUNS, { recursive: true });
  writeFileSync(join(RUNS, `${run.id}.json`), JSON.stringify(run, null, 1));
}
export function loadSheetRun(id: string): SheetRun | null {
  const f = join(RUNS, `${id.replace(/[^\w.-]/g, "")}.json`);
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as SheetRun) : null;
}
export function listSheetRuns(limit = 30): Array<Pick<SheetRun, "id" | "sheet" | "startedAt" | "endedAt" | "status" | "total"> & { counts: Record<string, number> }> {
  if (!existsSync(RUNS)) return [];
  return readdirSync(RUNS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ f, t: statSync(join(RUNS, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(0, limit)
    .map(({ f }) => {
      const r = JSON.parse(readFileSync(join(RUNS, f), "utf8")) as SheetRun;
      const counts: Record<string, number> = {};
      for (const c of r.cases) counts[c.status] = (counts[c.status] ?? 0) + 1;
      return { id: r.id, sheet: r.sheet, startedAt: r.startedAt, endedAt: r.endedAt, status: r.status, total: r.total, counts };
    });
}

const SEV: Record<string, SheetBug["severity"]> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

/** Run the cases one by one. Resolves with the finished run; events stream through `emit`. */
export async function runSheetCases(cases: SheetCase[], opts: { companyId: number; sheet: string; headed?: boolean; repair?: boolean; emit: (e: SheetEvent) => void }): Promise<SheetRun> {
  if (active) throw new Error(`a sheet run is already going (${active.id}) — wait for it or stop it`);
  const run: SheetRun = { id: `sheet-${Date.now().toString(36)}`, sheet: opts.sheet, companyId: opts.companyId, startedAt: new Date().toISOString(), status: "running", total: cases.length, cases: [] };
  let stopped = false;
  let stopChild: (() => void) | null = null;
  active = { id: run.id, stop: () => { stopped = true; stopChild?.(); } };
  save(run);
  try {
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      if (stopped) {
        run.cases.push(base(c, "Not run", "The run was stopped before this case.", 0));
        continue;
      }
      opts.emit({ type: "case-start", id: c.id, title: c.title, index: i + 1, total: cases.length });
      const line = (l: string) => opts.emit({ type: "line", id: c.id, line: mask(l) });
      const t0 = Date.now();
      let r: SheetRunCase;
      try {
        const runOne = () => (c.layer === "api" ? runApiCase(c, opts.companyId, line) : runUiWithRepair(c, opts, line, (s) => (stopChild = s), (e) => opts.emit(e)));
        // A case that needs a company set up a certain way: find the setting, switch it for this case, switch it back.
        const setting = companySetting(c.preconditions);
        if (setting) {
          const needed = await settingsFor(setting).catch(() => null);
          if (!needed) {
            r = base(c, "Not run", `It needs ${setting}, and no company setting in Procol's settings catalogue clearly means that, so the company could not be set up for it. Run it on a company set up as it says.`, 0);
            addToBacklog(c, "starting event not built", r.why, ["looked for a matching company setting"]);
          } else {
            line(`This case needs ${setting} — that is the company setting ${needed.map((n) => `${n.key} = ${JSON.stringify(n.value)}`).join(", ")}.`);
            const out = await withSettings(opts.companyId, needed, c.id, line, runOne);
            if ("refused" in out) {
              r = base(c, "Not run", `It needs ${setting} (${needed.map((n) => n.key).join(", ")}), but the setting could not be switched: ${out.refused}.`, 0);
            } else {
              r = out.result;
              r.settings = out.changed;
              if (out.changed.length) r.why += ` Ran with ${out.changed.map((ch) => `${ch.key} switched from ${JSON.stringify(ch.from)} to ${JSON.stringify(ch.to)}`).join(", ")}; switched back afterwards.`;
            }
          }
        } else r = await runOne();
      } catch (e) {
        r = base(c, "Couldn't tell", `The run broke before it could finish: ${mask((e as Error).message)}.`, 0);
      }
      r.ms = Date.now() - t0;
      run.cases.push(r);
      save(run);
      opts.emit({ type: "case-done", result: r });
    }
  } finally {
    run.status = stopped ? "stopped" : "done";
    run.endedAt = new Date().toISOString();
    save(run);
    active = null;
  }
  opts.emit({ type: "done", run });
  return run;
}

function base(c: SheetCase, status: SheetVerdict, why: string, ms: number): SheetRunCase {
  return { id: c.id, title: c.title, module: c.module, layer: c.layer, priority: c.priority, status, why, steps: [], shots: [], ms, case: c };
}

/** A pre-condition that needs a particular company configuration ("Company with eRFX switched off"). */
export function companySetting(pre: string): string | null {
  const t = String(pre ?? "").trim();
  if (!t || /^the buyer can (create events|see purchase requisitions)/i.test(t)) return null;
  const m = t.match(/\b((?:a |the )?compan(?:y|ies) (?:with|where|whose|that|which|without)[^.;]*|[^.;]*\b(?:switched|turned) (?:on|off)\b[^.;]*|[^.;]*\bconfig(?:uration)? (?:is )?(?:on|off|enabled|disabled)\b[^.;]*)/i);
  return m ? m[1].trim().replace(/^(a|the) /i, "a ") : null;
}

async function runUiWithRepair(c: SheetCase, opts: { companyId: number; headed?: boolean; repair?: boolean }, line: (l: string) => void, setStop: (s: () => void) => void, emit: (e: SheetEvent) => void): Promise<SheetRunCase> {
  const t0 = Date.now();
  const r = await runUiCase(c, opts, line, setStop, emit);
  if (opts.repair === false) return r;
  // A failure at a generic check (text / visible / value / count) may be the plan's own mistake (it read the
  // wrong control): get a second opinion — steps rebuilt from the photographed screen — before calling it a bug.
  if (r.status === "Fail" && /^expect_(text|visible|value|count|disabled|enabled)$/.test(r.failedStep ?? "")) {
    const g = screenFor(c, r.lastUrl);
    if (g) {
      line(`Second opinion: the failure was at a generic check, so the steps are rebuilt from the "${g.label}" screen and the case runs again.`);
      const again = await runUiCase(c, opts, line, setStop, emit, g);
      again.repaired = { how: `checked again with steps rebuilt from the "${g.label}" screen`, before: `${r.status} — ${r.why}` };
      if (again.status === "Fail") {
        again.why += " A second, independently built plan failed the same check, so this is reported.";
        return again;
      }
      if (again.status === "Pass" || again.status === "Partly checked") {
        clearFromBacklog(c.id);
        return again;
      }
      // the rebuilt plan could not decide: the first failure is not trusted either
      again.why = `The first plan failed at a generic check (${r.why}), but a rebuilt plan could not confirm it: ${again.why}`;
      return again;
    }
  }
  if (r.status === "Pass" || r.status === "Fail" || r.status === "Partly checked") {
    clearFromBacklog(c.id);
    return r;
  }
  if (r.status === "Not run" && /^It starts from this/.test(r.why)) {
    addToBacklog(c, "starting event not built", r.why, []);
    return r;
  }
  const noStep = r.status === "Not run";
  const tried: string[] = [];
  let how = "";
  let ground: ScreenGround | null = null;
  if (!noStep) {
    const st = stuckSince(t0);
    if (st) {
      line(`Repairing the automation: asking the AI to find the control it could not use ("${st.label}")…`);
      const learnt = await teachStuck(st.id, line, setStop);
      tried.push(`taught the locator for "${st.label}"${learnt ? "" : " — nothing was learnt"}`);
      if (learnt) how = `learnt how to find "${st.label}" on that screen`;
    }
  }
  if (!how) {
    ground = screenFor(c, r.lastUrl);
    if (ground) {
      how = `built new steps from the "${ground.label}" screen in the screen library (its ${ground.controls.length} controls, named as on screen)`;
      tried.push(how);
    }
  }
  if (!how) {
    addToBacklog(c, noStep ? "missing step" : "control not found", r.why, tried.length ? tried : ["no photographed screen matches this case — walk that screen first"]);
    return r;
  }
  line(`Repaired: ${how}. Running the case again.`);
  const again = await runUiCase(c, opts, line, setStop, emit, ground ?? undefined);
  again.repaired = { how, before: `${r.status} — ${r.why}` };
  if (again.status === "Pass" || again.status === "Fail" || again.status === "Partly checked") clearFromBacklog(c.id);
  else addToBacklog(c, again.status === "Not run" ? "missing step" : "control not found", again.why, tried);
  if (again.status === "Fail" && again.bug && ground) again.bug.whatHappened += " This was found with steps the agent built itself from the screen library — review those steps before reporting.";
  return again;
}

async function runUiCase(c: SheetCase, opts: { companyId: number; headed?: boolean }, line: (l: string) => void, setStop: (s: () => void) => void, emit: (e: SheetEvent) => void, ground?: ScreenGround): Promise<SheetRunCase> {
  const sp = sheetPrep(c);
  if (sp?.unbuilt) return { ...base(c, "Not run", `It starts from this: ${sp.why} ${sp.unbuilt[0].toUpperCase() + sp.unbuilt.slice(1)}. Run its set-up case first and give that event's title, or run it by hand.`, 0), startedFrom: sp.why };
  const prose = sheetCaseProse(c);
  line(sp?.prepared ? `Starts from: ${sp.why} — built by API, opened on ${sp.screenWhat}.` : "Starts from scratch: the steps create what they need.");
  const compiled = await compileTestCase(prose, "events", {
    ...(sp?.prepared ? { prepared: { state: sp.state, screen: sp.screen, screenWhat: sp.screenWhat, valueKeys: VALUE_KEYS[sp.state] ?? [], technical: sp.technical } } : {}),
    ...(ground ? { screen: { label: ground.label, path: ground.path, controls: ground.controls, headings: ground.headings } } : {}),
  });
  const plan = compiled.plan as { title?: string; steps: Array<{ step: string; args?: Record<string, unknown> }>; context?: Record<string, unknown> };
  if (compiled.source === "fallback") return { ...base(c, "Not run", "The steps could not be turned into browser actions (the model gave no usable plan). Nothing was run in its place.", 0), startedFrom: sp?.why };
  if (compiled.coverage === "none" || !plan.steps.length)
    return { ...base(c, "Not run", `The automation has no step yet for: ${compiled.gaps.join("; ") || "what this case checks"}. Nothing was run in its place.`, 0), startedFrom: sp?.why };
  line(`Plan: ${plan.steps.length} steps — ${plan.steps.map((s) => s.step).join(" → ")}`);
  const prep = await contextForPlan(prose, plan, opts.companyId, line, sp?.prepared ? { state: sp.state, technical: sp.technical, auction: sp.auction } : undefined);
  if (prep.why) return { ...base(c, "Couldn't tell", `The starting event could not be built: ${mask(prep.why)}.`, 0), startedFrom: sp?.why };
  const planRunId = `sheet-${c.id}-${Date.now().toString(36)}`;
  const toRun = prep.context ? { ...plan, context: prep.context } : plan;
  await new Promise<void>((resolve) => {
    const h = runUiPlan({ plan: toRun, companyId: opts.companyId, runId: planRunId, headed: !!opts.headed }, (e: any) => {
      if (e.type === "frame" && e.frame) emit({ type: "frame", frame: e.frame });
      if (e.type === "spot") emit({ type: "spot", spot: e.spot ?? e });
      if (e.type === "log" && /\[plan\] \d+\/\d+/.test(String(e.line ?? ""))) line(String(e.line).replace(/^.*\[plan\]\s*/, ""));
      if (e.type === "done" || e.type === "run-error") resolve();
    });
    setStop(() => {
      h.stop();
      resolve();
    });
  });
  const result = readPlanResult(planRunId) as { steps?: Array<{ step: string; args?: Record<string, unknown>; status: string; detail?: string; evidence?: { screenshot?: string; url?: string; appSaid?: string; rule?: string }; spotlights?: Array<{ file: string; action?: string; target?: string; step?: number }> }>; observations?: Array<{ step: number; stepName: string; url: string; findings: Array<{ rule: string; detail: string }>; screenshot?: string }> } | null;
  const r = base(c, "Couldn't tell", "", 0);
  r.planRunId = planRunId;
  r.startedFrom = sp?.why ? `${sp.why}${sp.note ? ` (${sp.note})` : ""}` : undefined;
  if (!result?.steps?.length) {
    r.why = "The browser run ended without a result (it may have been stopped, or the login failed). Nothing can be concluded.";
    return r;
  }
  const steps = result.steps;
  r.steps = steps.map((s, i) => ({
    n: i + 1,
    words: ASSERT.test(s.step) ? `Check: ${expectedWords({ step: s.step, args: s.args })}` : stepWords({ step: s.step, args: s.args }),
    outcome: s.status === "ok" ? (ASSERT.test(s.step) ? "checked" : "done") : s.status === "failed" ? "failed" : "not reached",
    detail: s.detail ? mask(s.detail).slice(0, 400) : undefined,
  }));
  const failedAt = steps.findIndex((s) => s.status === "failed");
  if (failedAt >= 0) {
    r.lastUrl = steps[failedAt].evidence?.url;
    r.failedStep = steps[failedAt].step;
  }
  // pictures: the failing step's screenshot and frames; for a pass, the last verified picture
  const spot = (s: (typeof steps)[number] | undefined, n: number) => (s?.spotlights ?? []).map((p) => ({ file: p.file, caption: `Step ${n} · ${p.action ?? ""}${p.target ? ` · ${p.target}` : ""}` }));
  if (failedAt >= 0) {
    const f = steps[failedAt];
    if (f.evidence?.screenshot) r.shots.push({ file: f.evidence.screenshot, caption: `Step ${failedAt + 1} — the screen when it failed` });
    r.shots.push(...spot(f, failedAt + 1).slice(-2), ...(failedAt > 0 ? spot(steps[failedAt - 1], failedAt).slice(-1) : []));
  } else {
    const lastVerify = [...steps.keys()].reverse().find((i) => (steps[i].spotlights ?? []).length);
    if (lastVerify !== undefined) r.shots.push(...spot(steps[lastVerify], lastVerify + 1).slice(-2));
  }
  const serverErrors = (result.observations ?? []).filter((o) => o.findings.some((f) => f.rule === "server-error"));
  if (failedAt < 0) {
    r.status = compiled.coverage === "partial" ? "Partly checked" : "Pass";
    r.why = compiled.coverage === "partial"
      ? `Every step the automation could do worked, but part of the case has no step yet: ${compiled.gaps.join("; ")}. That part was not checked.`
      : `All ${steps.length} steps worked and every check on the screen held.`;
  } else {
    const f = steps[failedAt];
    const d = mask(f.detail ?? "");
    const words = r.steps[failedAt].words;
    if (/^(not checked|could not tell|couldn't tell)\b[:\s]/i.test(d) || /\bcould not tell:/i.test(d.slice(0, 120))) {
      r.status = "Couldn't tell";
      r.why = `Step ${failedAt + 1} (${words}) could not be checked: ${d.replace(/^.*?(not checked|could not tell|couldn't tell):\s*/i, "")}. This is not a product failure.`;
    } else if (ASSERT.test(f.step) || f.evidence?.appSaid) {
      r.status = "Fail";
      r.why = ASSERT.test(f.step)
        ? `At step ${failedAt + 1} the screen did not show what the case expects. ${words.replace(/^Check: /, "Expected: ")} What it showed instead: ${d}`
        : `At step ${failedAt + 1} (${words}) the app refused: “${mask(f.evidence!.appSaid!)}”.${f.evidence?.rule ? ` That message comes from the app's rule ${f.evidence.rule}.` : ""} The case expects this step to work.`;
      r.bug = {
        title: `${c.title} — ${ASSERT.test(f.step) ? "the screen did not match the expected result" : "the app refused a step that should work"}`,
        severity: SEV[c.priority.toLowerCase()] ?? "Medium",
        whatHappened: r.why,
        expected: c.expected,
        where: f.evidence?.url,
        appSaid: f.evidence?.appSaid ? mask(f.evidence.appSaid) : undefined,
        rule: f.evidence?.rule,
        shots: r.shots,
      };
    } else {
      r.status = "Couldn't tell";
      r.why = `The automation could not do step ${failedAt + 1} (${words}): ${d}. The app did not refuse anything, so this is an automation gap, not a product bug.`;
    }
  }
  if (serverErrors.length) {
    const o = serverErrors[0];
    const detail = o.findings.filter((f) => f.rule === "server-error").map((f) => f.detail).join("; ");
    const shots = o.screenshot ? [{ file: o.screenshot, caption: `After step ${o.step} — a server error happened here` }] : [];
    r.shots.push(...shots);
    if (!r.bug) {
      r.bug = { title: `${c.title} — the server answered with an error`, severity: "Critical", whatHappened: `While the case ran, the app's server failed: ${mask(detail)}. The screen may still have looked fine. Re-check on a fresh event before reporting.`, expected: c.expected, where: o.url, shots };
      if (r.status === "Pass") r.why += ` But the server failed once along the way (${mask(detail)}) — see the bug.`;
    }
  }
  return r;
}

async function runApiCase(c: SheetCase, companyId: number, line: (l: string) => void): Promise<SheetRunCase> {
  const prose = `${sheetCaseProse(c)}\n${API_CHECK_GUIDE}`;
  line("Writing the API test from the case's steps…");
  const compiled = applyLineItemCount(await compileApiPlan({ text: prose }, { llm: true, allowReason: false }).catch(() => null as any));
  if (!compiled?.plan || compiled.coverage === "none" || compiled.errors?.length)
    return base(c, "Not run", compiled?.gaps?.length ? `The API test could not be written: ${compiled.gaps.join("; ")}.` : "The API test could not be written from these steps.", 0);
  // a failure is re-checked on a second fresh record before it counts (confirm), so one flaky answer is not a bug
  const result = await runApiPlan(compiled.plan, { companyId, confirm: true, onLine: line });
  const h = apiResultInWords(result);
  let status: SheetVerdict = result.verdict === "passed" ? (compiled.gaps?.length ? "Partly checked" : "Pass") : result.verdict === "failed" ? "Fail" : result.verdict === "not run" ? "Not run" : "Couldn't tell";
  let why = h.summary + (status === "Partly checked" ? ` Not covered: ${compiled.gaps.join("; ")}.` : "");
  if (status === "Fail" && !h.serverErrors && wrongPlaceOnly(h.failedChecks)) {
    status = "Couldn't tell";
    why = `Every request was answered as expected, but the API test checked the wrong place: it expected the whole reply to be a list, and the app keeps the list inside a field (usually "data"). That check proves nothing about the product. ${h.failedChecks.join("; ")}`;
  } else if (status === "Fail" && result.confirmation) {
    if (!/second fresh record/.test(why)) why += result.confirmed ? " It failed the same way on a second fresh record." : " On a second fresh record it did not fail the same way — treat it as flaky and re-check.";
  }
  const r = base(c, status, why, 0);
  r.api = { summary: h.summary, steps: h.steps };
  r.steps = h.steps.map((s, i) => ({ n: i + 1, words: `${s.title.replace(/^Step \d+ — /, "")} — ${s.sent}`, outcome: s.verdict === "failed" ? "failed" : s.verdict === "not run" ? "not reached" : "done", detail: `Came back: ${s.cameBack}${s.appSaid ? ` ${s.appSaid}` : ""}` }));
  if ((status === "Fail" && result.confirmed !== false) || h.serverErrors) {
    const decisive = result.steps.find((s) => s.decisive) ?? result.steps.find((s) => s.verdict === "failed");
    r.bug = {
      title: `${c.title} — ${h.serverErrors ? "the server answered with an error" : "the API did not answer as the case expects"}`,
      severity: h.serverErrors || isServerError(decisive?.status) ? "Critical" : SEV[c.priority.toLowerCase()] ?? "Medium",
      whatHappened: `${h.summary}${h.failedChecks.length ? ` Checks that failed: ${h.failedChecks.join("; ")}.` : ""}`,
      expected: c.expected,
      where: decisive?.call ? `${decisive.call.method} ${decisive.call.path}` : undefined,
      appSaid: decisive?.message,
      shots: [],
    };
  }
  return r;
}
