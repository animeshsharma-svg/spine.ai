/**
 * WHAT QA HAS ALREADY WRITTEN DOWN, BY HAND.
 *
 * Five internal bug sheets — Amity, Blue Star, M3M Ind, M3M Noida, SLR — hold
 * the defects the team found before this platform existed. When a run trips
 * over one of them the report should say so: "this is not new, Aditya logged
 * it on 3 Aug and it is still open" is a different sentence from "new bug".
 *
 * The sheets live in `config/knownBugs.json`, one record per row, carrying the
 * sheet it came from, who logged it, when, and what the dev status was at the
 * time of import. A defect is tied to a sheet row either explicitly (a check
 * names the bug it reproduces) or by feature id, which is how the "still open
 * on these modules" table finds them.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, "..", "..", "config", "knownBugs.json");

export interface KnownBug {
  id: string;
  sheet: string;
  module: string;
  feature: string;
  priority: string;
  blocker: boolean;
  status: "OPEN" | "FIXED" | string;
  devType?: string;
  userType?: string;
  title: string;
  description: string;
  reported: string;
  resolved?: string;
  qa?: string;
  qaStatus?: string;
  qaComment?: string;
  link?: string;
}

/** What a check or defect carries when it matches a sheet row. */
export interface KnownBugRef {
  id: string;
  sheet: string;
  title: string;
  status: string;
  reported: string;
  resolved?: string;
  qa?: string;
  priority: string;
  blocker: boolean;
}

let CACHE: KnownBug[] | null = null;

export function loadKnownBugs(): KnownBug[] {
  if (CACHE) return CACHE;
  if (!existsSync(FILE)) {
    CACHE = [];
    return CACHE;
  }
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8"));
    CACHE = Array.isArray(parsed) ? parsed : [];
  } catch {
    CACHE = [];
  }
  return CACHE;
}

export function knownBugById(id: string): KnownBug | undefined {
  return loadKnownBugs().find((b) => b.id === id);
}

export function refOf(bug: KnownBug): KnownBugRef {
  return {
    id: bug.id,
    sheet: bug.sheet,
    title: bug.title,
    status: bug.status,
    reported: bug.reported,
    resolved: bug.resolved,
    qa: bug.qa,
    priority: bug.priority,
    blocker: bug.blocker,
  };
}

/** Sheet rows on the same feature, or the same module when nothing is that precise. */
export function knownBugsForFeatures(features: string[]): KnownBug[] {
  const exact = new Set(features);
  const modules = new Set(features.map((f) => f.split(".")[0]));
  return loadKnownBugs().filter((b) => exact.has(b.feature) || modules.has(b.feature.split(".")[0]));
}

/** "3 Aug 2026" from "2026-08-03". */
export function sheetDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** One sentence for a report: where this bug was first written down and where it stands. */
export function knownBugSentence(ref: KnownBugRef): string {
  // The sheet by its name, without the file it is kept in ("… (config/vbuBugs.json)").
  const sheet = ref.sheet.replace(/^Internal RFX_Bugs - /, "").replace(/\s*\([^)]*\.(json|xlsx|csv)\)\s*/g, " ").trim();
  const who = ref.qa ? ` by ${ref.qa}` : "";
  const fixed = /fixed|closed/i.test(ref.status);
  return fixed
    ? `Previously reported as ${ref.id} in the ${sheet} sheet${who} on ${sheetDate(ref.reported)}; marked FIXED${
        ref.resolved ? ` on ${sheetDate(ref.resolved)}` : ""
      }.`
    : `Previously reported as ${ref.id} in the ${sheet} sheet${who} on ${sheetDate(ref.reported)}; still ${ref.status} (${ref.priority}${
        ref.blocker ? ", blocker" : ""
      }).`;
}
