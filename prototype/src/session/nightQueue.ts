/**
 * The overnight queue of the guided session (19 Nov 2026).
 *
 * A session's "P0–P1 now, the rest overnight" writes the rest here (`data/night/queue.json`). Until today nothing read
 * the file, so the queued cases never ran. `drainNightQueue` runs each waiting entry through the sheet runner — the
 * same engine as the session's own Run (fresh event per case, one verdict) — records the run id on the entry and on the
 * session it came from, so the session's report shows those verdicts the next morning. `npm run night:queue` drains it
 * by hand; `npm run nightly` drains it first, before the journeys (never two browsers at once).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sheetCases } from "../checks/sheetCases.js";
import { runSheetCases, type SheetEvent } from "../checks/sheetRunner.js";
import { loadSession, updateSession } from "./store.js";

const here = dirname(fileURLToPath(import.meta.url));
export const NIGHT_QUEUE = join(here, "..", "..", "data", "night", "queue.json");

export interface QueueEntry {
  sheet: string;
  ids: string[];
  at: string;
  companyId?: number;
  sessionId?: string;
  /** set once the entry has run */
  runId?: string;
  ranAt?: string;
  /** why an entry could not run (sheet gone, no cases left) */
  skipped?: string;
}

export function readQueue(): QueueEntry[] {
  try {
    return existsSync(NIGHT_QUEUE) ? (JSON.parse(readFileSync(NIGHT_QUEUE, "utf8")) as QueueEntry[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(q: QueueEntry[]): void {
  mkdirSync(dirname(NIGHT_QUEUE), { recursive: true });
  writeFileSync(NIGHT_QUEUE, JSON.stringify(q, null, 1));
}

export function enqueue(e: Omit<QueueEntry, "at">): void {
  const q = readQueue();
  q.push({ ...e, at: new Date().toISOString() });
  writeQueue(q);
}

/** cases still waiting for a sheet (entries that have not run) */
export function waitingFor(sheet: string): number {
  return readQueue().filter((q) => q.sheet === sheet && !q.runId && !q.skipped).reduce((n, q) => n + q.ids.length, 0);
}

/** Run every waiting entry, oldest first. Returns one line per entry. */
export async function drainNightQueue(opts: { emit?: (e: SheetEvent) => void; log?: (line: string) => void; dry?: boolean } = {}): Promise<string[]> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const out: string[] = [];
  const waiting = readQueue().filter((q) => !q.runId && !q.skipped);
  if (!waiting.length) { log("The overnight queue is empty."); return out; }
  for (const entry of waiting) {
    const want = new Set(entry.ids.map((x) => x.toUpperCase()));
    const cases = sheetCases(entry.sheet).filter((c) => want.has(c.id.toUpperCase()));
    const companyId = entry.companyId ?? (entry.sessionId ? (loadSession(entry.sessionId)?.env as any)?.companyId : undefined) ?? 198678;
    const head = `${entry.sheet}: ${cases.length} of ${entry.ids.length} queued case(s) on company ${companyId}${entry.sessionId ? ` (session ${entry.sessionId})` : ""}`;
    if (opts.dry) { out.push(`would run ${head}`); log(`would run ${head}`); continue; }
    const mark = (patch: Partial<QueueEntry>) => {
      const q = readQueue();
      const i = q.findIndex((x) => x.at === entry.at && x.sheet === entry.sheet);
      if (i >= 0) { q[i] = { ...q[i], ...patch }; writeQueue(q); }
    };
    if (!cases.length) { mark({ skipped: "none of the queued cases is on the sheet any more" }); out.push(`skipped ${head}`); log(`skipped ${head}`); continue; }
    log(`running ${head}`);
    const run = await runSheetCases(cases, { companyId, sheet: entry.sheet, headed: false, repair: true, emit: opts.emit ?? (() => {}) });
    mark({ runId: run.id, ranAt: new Date().toISOString() });
    const owner = entry.sessionId ? loadSession(entry.sessionId) : null;
    if (owner) {
      updateSession(owner, (f) => {
        const prev = (f.execution as any) ?? { runIds: [] };
        f.execution = { ...prev, runIds: [...(prev.runIds ?? []), run.id], lastRunAt: new Date().toISOString() };
      });
    }
    const tally: Record<string, number> = {};
    for (const c of run.cases) tally[c.status] = (tally[c.status] ?? 0) + 1;
    const line = `${head} → run ${run.id} ${JSON.stringify(tally)}`;
    out.push(line);
    log(line);
  }
  return out;
}
