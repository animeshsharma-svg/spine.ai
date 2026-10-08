import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * TRIAGE STORE — the human half of the bug sheet.
 *
 * Everything else in a bug row is DERIVED: the platform found the defect, so
 * it owns the title, the evidence, the blast radius. What it cannot know is
 * what a person decided about it — whether it is fixed, who owns it, which
 * sprint it landed in, what engineering said.
 *
 * Those edits live here, keyed on the defect's fingerprint, and are merged
 * over the derived row at render time. Kept apart on purpose: a re-run
 * recomputes every defect from scratch, and a human's decision must survive
 * that. The fingerprint is the endpoint + status + message, so the same defect
 * found again picks its triage back up.
 */

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, "..", "data", "bug-triage.json");

/** Only the columns a person fills in. Anything absent falls back to derived. */
export interface Triage {
  status?: string;
  devEta?: string;
  priority?: string;
  blocker?: string;
  devType?: string;
  /** Who chose the Dev type, when a person did; without it the page shows spine.ai's suggestion. */
  devTypeBy?: string;
  devComment?: string;
  sprintWeek?: string;
  userType?: string;
  module?: string;
  notes?: string;
  updatedAt?: string;
}

export type TriageStore = Record<string, Triage>;

const FIELDS: (keyof Triage)[] = [
  "status",
  "devEta",
  "priority",
  "blocker",
  "devType",
  "devTypeBy",
  "devComment",
  "sprintWeek",
  "userType",
  "module",
  "notes",
];

export function isTriageField(name: string): name is keyof Triage {
  return (FIELDS as string[]).includes(name);
}

export function loadTriage(): TriageStore {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as TriageStore;
  } catch {
    // A corrupt file must not take the bug report down with it.
    return {};
  }
}

/**
 * Records one edit and returns the row's new triage.
 *
 * One field per call, because that is how a spreadsheet is edited: a person
 * changes a cell and moves on. Last write wins, and nothing else in the row is
 * touched, so two people editing different columns cannot clobber each other.
 */
export function saveTriageField(id: string, field: keyof Triage, value: string): Triage {
  const store = loadTriage();
  const row: Triage = { ...(store[id] ?? {}) };
  const clean = value.trim();
  if (clean === "") delete row[field];
  else row[field] = clean.slice(0, 2_000);
  row.updatedAt = new Date().toISOString();
  store[id] = row;

  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(store, null, 2));
  return row;
}
