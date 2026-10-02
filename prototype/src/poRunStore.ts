import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * WHAT A PO RUN DID, KEPT PER RUN.
 *
 * The API suite writes its report to one fixed path and overwrites it every
 * time, so "the PO report" only ever means "the last one". That is fine for
 * the suite, whose reader is standing in the terminal that just ran it, and
 * wrong for the platform, where a run is something you open afterwards — and
 * dangerously wrong when a run stops early, because the file left on disk then
 * belongs to a DIFFERENT, earlier run.
 *
 * Copying the report here at the end of each run gives every PO run its own
 * evidence: the steps it reached, the calls it made, and which of them the app
 * refused. The bug sheet and the run report are then answerable for one run
 * rather than for whichever ran last.
 */
const here = dirname(fileURLToPath(import.meta.url));
const PO_RUN_DIR = join(here, "..", "data", "po-runs");

/** How many to keep. They are a few hundred KB each, so this is deliberate. */
const KEPT = 40;

export interface PoRunRecord {
  runId: string;
  startedAt: string;
  endedAt: string;
  exitCode: number | null;
  companyId: number | null;
  companyName?: string;
  /**
   * Outcomes the call log cannot show.
   *
   * A step whose every call returned 2xx is "passed" by the report's rule, and
   * that rule is right for calls and wrong for documents: a purchase order the
   * platform declined to take into approval never issues a failing request —
   * the automation simply stops before making one. So the run finished with
   * ten green steps, zero failed calls, and a purchase order sitting in draft,
   * and the bug sheet had nothing to raise. These are the lines the run said
   * out loud about what it could not finish.
   */
  issues?: string[];
  /** The suite's own report model, verbatim. */
  report: unknown;
}

export function savePoRun(record: PoRunRecord): void {
  try {
    mkdirSync(PO_RUN_DIR, { recursive: true });
    writeFileSync(join(PO_RUN_DIR, `${record.runId}.json`), JSON.stringify(record, null, 2));
    prune();
  } catch {
    // A run that cannot be filed must still be a run that happened.
  }
}

/**
 * Keep the run's rendered report too.
 *
 * `/api/po-report` served the suite's single HTML file, which is the same
 * "whichever ran last" problem the JSON had: open the report for a run from an
 * hour ago and read a different run's page. A copy per run costs a few hundred
 * KB and makes the link on a finished run mean what it says.
 */
export function savePoRunHtml(runId: string, html: string): void {
  try {
    mkdirSync(PO_RUN_DIR, { recursive: true });
    writeFileSync(join(PO_RUN_DIR, `${runId}.html`), html);
  } catch {
    /* the run still happened */
  }
}

/** Newest first — for the run history, which keeps every kind of run. */
export function listPoRuns(limit = KEPT): PoRunRecord[] {
  try {
    if (!existsSync(PO_RUN_DIR)) return [];
    const out: PoRunRecord[] = [];
    for (const name of readdirSync(PO_RUN_DIR).filter((n) => n.endsWith(".json")).sort().reverse()) {
      if (out.length >= limit) break;
      try {
        out.push(JSON.parse(readFileSync(join(PO_RUN_DIR, name), "utf8")) as PoRunRecord);
      } catch {
        /* skip a half-written file */
      }
    }
    return out.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
  } catch {
    return [];
  }
}

export function readPoRunHtml(runId: string): string | null {
  try {
    const file = join(PO_RUN_DIR, `${runId}.html`);
    return existsSync(file) ? readFileSync(file, "utf8") : null;
  } catch {
    return null;
  }
}

export function readPoRun(runId: string): PoRunRecord | null {
  try {
    const file = join(PO_RUN_DIR, `${runId}.json`);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf8")) as PoRunRecord;
  } catch {
    return null;
  }
}

/** Remove one PO run's record and its saved report page. */
export function deletePoRun(runId: string): boolean {
  const safe = runId.replace(/[^0-9a-zA-Z_-]/g, "");
  let gone = false;
  for (const ext of [".json", ".html"]) {
    const file = join(PO_RUN_DIR, `${safe}${ext}`);
    if (existsSync(file)) {
      rmSync(file, { force: true });
      gone = true;
    }
  }
  return gone;
}

function prune(): void {
  try {
    const files = readdirSync(PO_RUN_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();
    for (const stale of files.slice(0, Math.max(0, files.length - KEPT))) {
      rmSync(join(PO_RUN_DIR, stale), { force: true });
      rmSync(join(PO_RUN_DIR, stale.replace(/\.json$/, ".html")), { force: true });
    }
  } catch {
    /* pruning is housekeeping, never a failure */
  }
}
