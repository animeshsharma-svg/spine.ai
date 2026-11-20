/**
 * STEP 5 — RUN THE APPROVED CASES, AND READ THE RESULT.
 *
 * The frozen sheet runs through the sheet runner — start states by API, settings switched and restored,
 * one browser, a screenshot per action, verdicts with the fairness rules, bugs in the tester's format.
 * Scope: everything, P0–P1 now (the rest queued for the night runner — session/nightQueue.ts drains it), or named sections. A failure can
 * be run again alone on a fresh event before anyone calls it a bug. The report gathers every run of the
 * session: tally, bugs, the report and workbook links the Test sheets page already serves.
 */
import { sheetCases, type SheetCase } from "../checks/sheetCases.js";
import { loadSheetRun, runSheetCases, type SheetEvent, type SheetRun } from "../checks/sheetRunner.js";
import { updateSession, type Session } from "./store.js";
import { askAndWait, plural } from "./questions.js";
import { enqueue, waitingFor } from "./nightQueue.js";


export type Scope = "all" | "p0p1" | "sections";
export type ExecEvent = SheetEvent | { type: "queued"; sheet: string; ids: string[]; note: string } | { type: "error"; why: string };

function frozenSheet(s: Session): string | null {
  return (s.review as any)?.sheetId ?? null;
}

function pick(cases: SheetCase[], scope: Scope, sections?: string[]): { now: SheetCase[]; later: SheetCase[] } {
  if (scope === "p0p1") return { now: cases.filter((c) => /^P[01]$/.test(c.priority)), later: cases.filter((c) => !/^P[01]$/.test(c.priority)) };
  if (scope === "sections" && sections?.length) { const want = new Set(sections.map((x) => x.toLowerCase())); return { now: cases.filter((c) => want.has(c.scenario.split(" — ")[0].toLowerCase())), later: [] }; }
  return { now: cases, later: [] };
}

export async function runExecution(s: Session, scope: Scope, sections: string[] | undefined, overnightRest: boolean, emit: (e: ExecEvent) => void): Promise<Session> {
  const sheet = frozenSheet(s);
  if (!sheet) { emit({ type: "error", why: "Approve the cases first: the run takes the approved, frozen sheet." }); return s; }
  if (!s.env || s.env.kind !== "uat") { emit({ type: "error", why: "The run needs a company on Procol's UAT (the start states are built from its database)." }); return s; }
  const all = sheetCases(sheet);
  let { now, later } = pick(all, scope, sections);
  if (!now.length) { emit({ type: "error", why: `Nothing to run for scope "${scope}"${sections?.length ? ` (${sections.join(", ")})` : ""}: the sheet has ${all.length} case(s).` }); return s; }
  if (later.length && overnightRest) { enqueue({ sheet, ids: later.map((c) => c.id), companyId: s.env.companyId, sessionId: s.id }); emit({ type: "queued", sheet, ids: later.map((c) => c.id), note: `${later.length} case(s) queued for the night runner.` }); }
  // cases this company cannot carry: ask before the browser is held (run anyway / leave out / stop)
  const kept = await askAboutUnrunnable(s, now, emit);
  if (!kept) return s;
  now = kept;
  const run: SheetRun = await runSheetCases(now, { companyId: s.env.companyId, sheet, headed: false, repair: true, emit });
  updateSession(s, (f) => { const prev = (f.execution as any) ?? { runIds: [] }; f.execution = { ...prev, runIds: [...(prev.runIds ?? []), run.id], lastRunAt: new Date().toISOString() }; });
  return s;
}

/**
 * What this company cannot do for a case: a setting to switch (only done on PROCOL DEMO), a vendor to
 * invite (the company has no QA test vendor). When any case needs one, the platform asks on screen and
 * waits up to five minutes; the suggestion (leave them out) stands when nobody answers. Returns the cases
 * to run, or null when the tester stopped the run.
 */
async function askAboutUnrunnable(s: Session, now: SheetCase[], emit: (e: ExecEvent) => void): Promise<SheetCase[] | null> {
  const company = s.env?.companyName ?? `company ${s.env?.companyId}`;
  const demo = s.env?.companyId === 198678;
  const noVendor = (s.env?.snapshot?.vendors?.count ?? 0) === 0;
  const reasons = new Map<string, string>();
  for (const c of now) {
    const needsSetting = !!c.configs && c.configs.trim() !== "None" && c.configs.trim() !== "-";
    const invites = /\b(invite|vendor|supplier)\b/i.test(`${c.steps.join(" ")} ${c.preconditions}`);
    if (needsSetting && !demo) reasons.set(c.id, "needs a company setting changed, which I only do on PROCOL DEMO");
    else if (invites && noVendor) reasons.set(c.id, `invites a vendor, and ${company} has no QA test vendor`);
  }
  if (!reasons.size) return now;
  const distinct = [...new Set(reasons.values())];
  const a = await askAndWait(s, {
    step: "run", source: "run", kind: "one",
    text: `${plural(reasons.size, "case")} of the ${now.length} need something I can't do on ${company}. What should I do with them?`,
    why: distinct.length === 1 ? `Each of them ${distinct[0]}.` : `Some ${distinct[0]}; others ${distinct[1]}.`,
    options: [
      { value: "out", label: "Leave them out this time", means: "The rest run now; these stay “Not run” on the report." },
      { value: "anyway", label: "Run them anyway", means: "They will most likely come back “Couldn't tell”, with the reason." },
      { value: "stop", label: "Stop", means: "Nothing runs; fix the company or pick another environment first." },
    ],
    suggested: "out",
    ref: { caseIds: [...reasons.keys()].join(",") },
  }, 5 * 60_000);
  const pick = a.answer === null ? "stop" : /^(stop)/i.test(a.answer) ? "stop" : /^(anyway|run)/i.test(a.answer) ? "anyway" : "out";
  if (pick === "stop") { emit({ type: "error", why: "Stopped before the run, as you chose." }); return null; }
  if (pick === "anyway") { emit({ type: "line", id: "run", line: `Running all ${now.length}, as you chose; ${reasons.size} will most likely come back “Couldn't tell”.` }); return now; }
  const kept = now.filter((c) => !reasons.has(c.id));
  emit({ type: "line", id: "run", line: `${reasons.size} case(s) left out this time (${[...reasons.keys()].slice(0, 8).join(", ")}${reasons.size > 8 ? ", …" : ""}); running ${kept.length}.` });
  if (!kept.length) { emit({ type: "error", why: "Every case in this scope was left out, so nothing ran." }); return null; }
  return kept;
}

/** Run one case again, alone, on a fresh event (a failure is confirmed this way before it is a bug). */
export async function rerunCase(s: Session, caseId: string, emit: (e: ExecEvent) => void): Promise<Session> {
  const sheet = frozenSheet(s);
  const c = sheet ? sheetCases(sheet).find((x) => x.id.toUpperCase() === caseId.toUpperCase()) : undefined;
  if (!sheet || !c) { emit({ type: "error", why: `No case ${caseId} on the approved sheet.` }); return s; }
  if (!s.env || s.env.kind !== "uat") { emit({ type: "error", why: "The run needs a company on Procol's UAT." }); return s; }
  const run = await runSheetCases([c], { companyId: s.env.companyId, sheet, headed: false, repair: true, emit });
  updateSession(s, (f) => { const prev = (f.execution as any) ?? { runIds: [] }; f.execution = { ...prev, runIds: [...(prev.runIds ?? []), run.id], lastRunAt: new Date().toISOString() }; });
  return s;
}

export interface Report {
  sheet: string | null;
  runs: Array<{ id: string; startedAt: string; endedAt?: string; status: string; total: number; tally: Record<string, number>; report: string; workbook: string }>;
  tally: Record<string, number>;
  /** the latest verdict per case */
  latest: Record<string, { id: string; status: string; why: string; runId: string }>;
  bugs: Array<{ caseId: string; title: string; severity?: string; whatHappened?: string; expected?: string; runId: string; event?: string; repeat: Repeat }>;
  /** failed once, then passed when run again on a fresh event: not a bug until it fails again */
  flaky: Array<{ caseId: string; failedRun: string; passedRun: string; why: string }>;
  /** every run of this session, for the Bugs page (#/bugs?run=a,b) */
  bugsLink: string | null;
  queued: number;
}

/**
 * Whether a standing failure was repeated on a fresh event (a Fail is a bug only after that, plan §8):
 * "confirmed" — it failed the same way on a second, different event; "once" — it has failed one time only;
 * "same event" — it failed twice, but both runs were on one event, so the repeat proves nothing new.
 */
export type Repeat = { state: "confirmed" | "once" | "same event"; words: string };

export function report(s: Session): Report {
  const sheet = frozenSheet(s);
  const ids: string[] = (s.execution as any)?.runIds ?? [];
  const runs: Report["runs"] = [];
  const latest: Report["latest"] = {};
  const bugs: Report["bugs"] = [];
  const tally: Record<string, number> = {};
  // every run of each case, in order: the re-run history a bug's confirmation is read from
  const history = new Map<string, Array<{ status: string; runId: string; event?: { key: string; label: string }; ownEvent: boolean }>>();
  for (const id of ids) {
    const r = loadSheetRun(id);
    if (!r) continue;
    const t: Record<string, number> = {};
    for (const c of r.cases) {
      t[c.status] = (t[c.status] ?? 0) + 1;
      latest[c.id] = { id: c.id, status: c.status, why: c.why, runId: r.id };
      // a case with no start state creates its own event in the browser, so each run of it is on a new one
      if (!/^Not run$/.test(c.status)) history.set(c.id, [...(history.get(c.id) ?? []), { status: c.status, runId: r.id, event: c.event ?? eventInWords(c.steps), ownEvent: !c.startedFrom }]);
      if (c.bug) bugs.push({ caseId: c.id, title: c.bug.title, severity: (c.bug as any).severity, whatHappened: (c.bug as any).whatHappened, expected: (c.bug as any).expected, runId: r.id, event: (c.event ?? eventInWords(c.steps))?.label, repeat: { state: "once", words: "" } });
    }
    runs.push({ id: r.id, startedAt: r.startedAt, endedAt: r.endedAt, status: r.status, total: r.total, tally: t, report: `/api/sheets/report?run=${r.id}`, workbook: `/api/sheets/export?run=${r.id}` });
  }
  for (const v of Object.values(latest)) tally[v.status] = (tally[v.status] ?? 0) + 1;
  // the latest verdict of a case decides whether its bug still stands
  const standing = bugs.filter((b) => latest[b.caseId]?.runId === b.runId && latest[b.caseId]?.status === "Fail");
  for (const b of standing) b.repeat = repeatOf(history.get(b.caseId) ?? []);
  const flaky: Report["flaky"] = [];
  for (const [caseId, h] of history) {
    const last = h.at(-1);
    const failed = [...h].reverse().find((x) => x.status === "Fail");
    if (last?.status === "Pass" && failed && fresh(failed, last))
      flaky.push({ caseId, failedRun: failed.runId, passedRun: last.runId, why: `Failed in ${failed.runId}${failed.event ? ` on ${failed.event.label}` : ""}, then passed on a fresh event${last.event ? ` (${last.event.label})` : ""}. Not a bug unless it fails again.` });
  }
  const queued = sheet ? waitingFor(sheet) : 0;
  return { sheet, runs, tally, latest, bugs: standing, flaky, bugsLink: runs.length ? `#/bugs?run=${runs.map((r) => r.id).join(",")}` : null, queued };
}

/** a run saved before cases recorded their event: the publish step's own words name it ("published as Z2tna2dj") */
function eventInWords(steps: Array<{ detail?: string }>): Seen["event"] {
  const id = steps.map((x) => x.detail?.match(/\b(?:published as|project) ((?=[A-Za-z]*\d)[A-Za-z0-9]{6,12})\b/)?.[1]).filter((x): x is string => !!x).at(-1);
  return id ? { key: id, label: `project ${id}` } : undefined;
}
export type Seen = { status: string; runId: string; event?: { key: string; label: string }; ownEvent: boolean };
/** two runs were on different events: both events known and different, or the case makes its own each time */
function fresh(a: Seen, b: Seen): boolean {
  if (a.event && b.event) return a.event.key !== b.event.key;
  return a.ownEvent && b.ownEvent;
}
export function repeatOf(h: Seen[]): Repeat {
  const fails = h.filter((x) => x.status === "Fail");
  const last = fails.at(-1);
  if (!last || fails.length < 2) return { state: "once", words: "Failed once. Run it again on a fresh event before reporting it." };
  const other = fails.slice(0, -1).reverse().find((x) => fresh(x, last));
  if (other) return { state: "confirmed", words: `Failed the same way on a fresh event: ${other.event?.label ?? `the event of ${other.runId}`}, then ${last.event?.label ?? `the event of ${last.runId}`}.` };
  return { state: "same event", words: `Failed ${fails.length} times, but on the same event${last.event ? ` (${last.event.label})` : ""}; run it again on a fresh event.` };
}
