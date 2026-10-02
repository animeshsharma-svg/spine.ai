import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { JourneyStep } from "./journeySteps.js";

/**
 * WHAT A JOURNEY DID, KEPT.
 *
 * The journey itself writes its outcome (passed/broke, a screenshot, the URL
 * it ended on). What it cannot write is the trail — the narration it printed
 * on the way — because that only exists as stdout, and stdout goes to whoever
 * spawned it. The platform is the only thing holding both, so it keeps the
 * trail here, keyed by run id, for the report to read afterwards.
 *
 * Without this, a failed run could say THAT it failed but never where.
 */
const here = dirname(fileURLToPath(import.meta.url));
const TRAIL_DIR = join(here, "..", "..", "data", "ui-trails");

export interface JourneyTrailRecord {
  runId: string;
  flowKey: string;
  companyId: number | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  /** 0 is a pass; anything else is how Playwright exited. */
  exitCode: number | null;
  steps: JourneyStep[];
  /** The last thing that actually happened, which is where it stopped. */
  stoppedAt?: JourneyStep;
}

/** How many trails to keep. They are small; this is roughly a fortnight of runs. */
const KEPT = 60;

export function saveTrail(record: JourneyTrailRecord): void {
  try {
    mkdirSync(TRAIL_DIR, { recursive: true });
    writeFileSync(join(TRAIL_DIR, `${record.runId}.json`), JSON.stringify(record, null, 2));
    prune();
  } catch {
    // A trail that cannot be written must never change a run's verdict.
  }
}

export function readTrail(runId: string): JourneyTrailRecord | null {
  try {
    const file = join(TRAIL_DIR, `${runId}.json`);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf8")) as JourneyTrailRecord;
  } catch {
    return null;
  }
}

/** Every trail, newest first. */
export function listTrails(limit = KEPT): JourneyTrailRecord[] {
  if (!existsSync(TRAIL_DIR)) return [];
  const out: JourneyTrailRecord[] = [];
  for (const name of readdirSync(TRAIL_DIR).filter((n) => n.endsWith(".json")).sort().reverse()) {
    if (out.length >= limit) break;
    try {
      out.push(JSON.parse(readFileSync(join(TRAIL_DIR, name), "utf8")) as JourneyTrailRecord);
    } catch {
      /* skip a half-written file */
    }
  }
  return out.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
}

/** Remove one journey's trail. */
export function deleteTrail(runId: string): boolean {
  try {
    const safe = runId.replace(/[^0-9a-zA-Z_-]/g, "");
    const file = join(TRAIL_DIR, `${safe}.json`);
    if (!existsSync(file)) return false;
    rmSync(file, { force: true });
    return true;
  } catch {
    return false;
  }
}

function prune(): void {
  try {
    // Oldest first by name: run ids are time-ordered, so the tail is the past.
    const names = readdirSync(TRAIL_DIR).filter((n) => n.endsWith(".json")).sort();
    for (const stale of names.slice(0, Math.max(0, names.length - KEPT))) {
      rmSync(join(TRAIL_DIR, stale), { force: true });
    }
  } catch {
    /* pruning is housekeeping, never worth an error */
  }
}
