/**
 * STEP 5 — RUN THE APPROVED CASES, AND READ THE RESULT.
 *
 * The frozen sheet runs through the sheet runner — start states by API, settings switched and restored,
 * one browser, a screenshot per action, verdicts with the fairness rules, bugs in the tester's format.
 * Scope: everything, P0–P1 now (the rest queued for the night runner), or named sections. A failure can
 * be run again alone on a fresh event before anyone calls it a bug. The report gathers every run of the
 * session: tally, bugs, the report and workbook links the Test sheets page already serves.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sheetCases, type SheetCase } from "../checks/sheetCases.js";
import { loadSheetRun, runSheetCases, type SheetEvent, type SheetRun } from "../checks/sheetRunner.js";
import { saveSession, type Session } from "./store.js";

const here = dirname(fileURLToPath(import.meta.url));
const QUEUE = join(here, "..", "..", "data", "night", "queue.json");

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

/** Queue cases for the night runner (data/night/queue.json; the night runner reads it before its own picks). */
function queueForNight(sheet: string, ids: string[]): void {
  mkdirSync(dirname(QUEUE), { recursive: true });
  const q: Array<{ sheet: string; ids: string[]; at: string }> = existsSync(QUEUE) ? JSON.parse(readFileSync(QUEUE, "utf8")) : [];
  q.push({ sheet, ids, at: new Date().toISOString() });
  writeFileSync(QUEUE, JSON.stringify(q, null, 1));
}

export async function runExecution(s: Session, scope: Scope, sections: string[] | undefined, overnightRest: boolean, emit: (e: ExecEvent) => void): Promise<Session> {
  const sheet = frozenSheet(s);
  if (!sheet) { emit({ type: "error", why: "Approve the cases first: the run takes the approved, frozen sheet." }); return s; }
  if (!s.env || s.env.kind !== "uat") { emit({ type: "error", why: "The run needs a company on Procol's UAT (the start states are built from its database)." }); return s; }
  const all = sheetCases(sheet);
  const { now, later } = pick(all, scope, sections);
  if (!now.length) { emit({ type: "error", why: `Nothing to run for scope "${scope}"${sections?.length ? ` (${sections.join(", ")})` : ""}: the sheet has ${all.length} case(s).` }); return s; }
  if (later.length && overnightRest) { queueForNight(sheet, later.map((c) => c.id)); emit({ type: "queued", sheet, ids: later.map((c) => c.id), note: `${later.length} case(s) queued for the night runner.` }); }
  const run: SheetRun = await runSheetCases(now, { companyId: s.env.companyId, sheet, headed: false, repair: true, emit });
  const prev = (s.execution as any) ?? { runIds: [] };
  s.execution = { ...prev, runIds: [...(prev.runIds ?? []), run.id], lastRunAt: new Date().toISOString() };
  saveSession(s);
  return s;
}

/** Run one case again, alone, on a fresh event (a failure is confirmed this way before it is a bug). */
export async function rerunCase(s: Session, caseId: string, emit: (e: ExecEvent) => void): Promise<Session> {
  const sheet = frozenSheet(s);
  const c = sheet ? sheetCases(sheet).find((x) => x.id.toUpperCase() === caseId.toUpperCase()) : undefined;
  if (!sheet || !c) { emit({ type: "error", why: `No case ${caseId} on the approved sheet.` }); return s; }
  if (!s.env || s.env.kind !== "uat") { emit({ type: "error", why: "The run needs a company on Procol's UAT." }); return s; }
  const run = await runSheetCases([c], { companyId: s.env.companyId, sheet, headed: false, repair: true, emit });
  const prev = (s.execution as any) ?? { runIds: [] };
  s.execution = { ...prev, runIds: [...(prev.runIds ?? []), run.id], lastRunAt: new Date().toISOString() };
  saveSession(s);
  return s;
}

export interface Report {
  sheet: string | null;
  runs: Array<{ id: string; startedAt: string; endedAt?: string; status: string; total: number; tally: Record<string, number>; report: string; workbook: string }>;
  tally: Record<string, number>;
  /** the latest verdict per case */
  latest: Record<string, { status: string; why: string; runId: string }>;
  bugs: Array<{ caseId: string; title: string; severity?: string; whatHappened?: string; expected?: string; runId: string }>;
  queued: number;
}

export function report(s: Session): Report {
  const sheet = frozenSheet(s);
  const ids: string[] = (s.execution as any)?.runIds ?? [];
  const runs: Report["runs"] = [];
  const latest: Report["latest"] = {};
  const bugs: Report["bugs"] = [];
  const tally: Record<string, number> = {};
  for (const id of ids) {
    const r = loadSheetRun(id);
    if (!r) continue;
    const t: Record<string, number> = {};
    for (const c of r.cases) { t[c.status] = (t[c.status] ?? 0) + 1; latest[c.id] = { status: c.status, why: c.why, runId: r.id }; if (c.bug) bugs.push({ caseId: c.id, title: c.bug.title, severity: (c.bug as any).severity, whatHappened: (c.bug as any).whatHappened, expected: (c.bug as any).expected, runId: r.id }); }
    runs.push({ id: r.id, startedAt: r.startedAt, endedAt: r.endedAt, status: r.status, total: r.total, tally: t, report: `/api/sheets/report?run=${r.id}`, workbook: `/api/sheets/export?run=${r.id}` });
  }
  for (const v of Object.values(latest)) tally[v.status] = (tally[v.status] ?? 0) + 1;
  // the latest verdict of a case decides whether its bug still stands
  const standing = bugs.filter((b) => latest[b.caseId]?.runId === b.runId && latest[b.caseId]?.status === "Fail");
  let queued = 0;
  try { if (existsSync(QUEUE) && sheet) queued = (JSON.parse(readFileSync(QUEUE, "utf8")) as Array<{ sheet: string; ids: string[] }>).filter((q) => q.sheet === sheet).reduce((n, q) => n + q.ids.length, 0); } catch { /* none */ }
  return { sheet, runs, tally, latest, bugs: standing, queued };
}
