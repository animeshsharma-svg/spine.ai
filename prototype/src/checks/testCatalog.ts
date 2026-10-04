import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The written test catalog, as data.
 *
 * `test-cases/*.md` are the source of truth — thousands of cases written for
 * people to read (events UI/API, field checks, edge cases, product modules…).
 * `scripts/import-test-cases.ts` derives `data/test-cases.json` from them; this
 * module is how the rest of the platform reads that, so nothing else has to
 * know the prose format. Which runner (if any) runs each case is decided in
 * `caseRouting.ts`; how much of the catalog really runs is counted in
 * `metrics.ts` (`npm run coverage:report`, the Success page).
 *
 * The catalog is deliberately NOT a set of scripts. A case says what to do and
 * how to tell whether it worked; turning one into steps is the compiler's job
 * (`agents/planner.ts`) and the executor's. That separation is what lets a
 * human pick a case by hand and get the same run the AI would have produced.
 */
const here = dirname(fileURLToPath(import.meta.url));
const CATALOG = join(here, "..", "..", "data", "test-cases.json");

export interface CatalogCase {
  id: string;
  layer: "ui" | "api";
  group: string;
  section: string;
  sectionNo: number;
  title: string;
  why: string;
  setup: string;
  steps: string;
  expected: string;
  oracle: string;
  priority: string;
  verdict: string;
  gate?: string;
  recordsCurrentBehaviour?: boolean;
  refs: string[];
  source: string;
}

let cache: CatalogCase[] | null = null;

/** Every case, in catalog order. Read once and kept. */
export function allCases(): CatalogCase[] {
  if (cache) return cache;
  if (!existsSync(CATALOG)) {
    console.warn(`[catalog] ${CATALOG} is missing — run: npx tsx scripts/import-test-cases.ts`);
    return (cache = []);
  }
  try {
    const parsed = JSON.parse(readFileSync(CATALOG, "utf8"));
    cache = Array.isArray(parsed) ? parsed : (parsed.cases ?? []);
  } catch (err) {
    console.warn(`[catalog] could not read the catalog: ${(err as Error).message}`);
    cache = [];
  }
  return cache!;
}

/** Forget the cached catalog (after `cases:import` rewrote data/test-cases.json). */
export function reloadCatalog(): void {
  cache = null;
}

/** One case by id, case-insensitively (`ui-cre-001` finds `UI-CRE-001`). */
export function caseById(id: string): CatalogCase | null {
  const want = id.trim().toUpperCase();
  return allCases().find((c) => c.id.toUpperCase() === want) ?? null;
}

export interface CatalogFilter {
  layer?: "ui" | "api";
  group?: string;
  verdict?: string;
  priority?: string;
  /** Free text matched against the id, title, why, steps and expected. */
  q?: string;
}

export function findCases(f: CatalogFilter = {}): CatalogCase[] {
  const q = f.q?.trim().toLowerCase();
  return allCases().filter((c) => {
    if (f.layer && c.layer !== f.layer) return false;
    if (f.group && c.group !== f.group) return false;
    if (f.verdict && c.verdict !== f.verdict) return false;
    if (f.priority && c.priority !== f.priority) return false;
    if (q) {
      const hay = `${c.id} ${c.title} ${c.why} ${c.steps} ${c.expected} ${c.section}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * The sections, in the order the catalog lists them, with counts.
 *
 * This is what a person navigates by — "Awarding", not "UI-AWD" — so the
 * dashboard renders these rather than inventing its own taxonomy.
 */
export function sections(layer?: "ui" | "api") {
  const byGroup = new Map<string, { group: string; layer: string; section: string; sectionNo: number; total: number; automatable: number }>();
  for (const c of allCases()) {
    if (layer && c.layer !== layer) continue;
    const s =
      byGroup.get(c.group) ??
      { group: c.group, layer: c.layer, section: c.section, sectionNo: c.sectionNo, total: 0, automatable: 0 };
    s.total += 1;
    if (c.verdict === "automate") s.automatable += 1;
    byGroup.set(c.group, s);
  }
  return [...byGroup.values()].sort((a, b) => (a.layer === b.layer ? a.sectionNo - b.sectionNo : a.layer === "ui" ? -1 : 1));
}

/**
 * A case rendered as the prose the compiler expects.
 *
 * The compiler takes a test case in plain English, so a catalog case needs no
 * special path into it: hand over the same words a person would have typed.
 * Setup and Oracle are included because they carry the preconditions and the
 * pass condition — dropping them would compile a plan that runs and proves
 * nothing.
 */
export function caseAsProse(c: CatalogCase): string {
  const parts = [`${c.id} — ${c.title}`];
  if (c.setup) parts.push(`Setup: ${c.setup}`);
  parts.push(`Steps: ${c.steps}`);
  parts.push(`Expected: ${c.expected}`);
  if (c.oracle) parts.push(`Oracle: ${c.oracle}`);
  return parts.join("\n");
}

export function catalogStats() {
  const all = allCases();
  const count = (k: keyof CatalogCase, v: string) => all.filter((c) => c[k] === v).length;
  return {
    total: all.length,
    ui: count("layer", "ui"),
    api: count("layer", "api"),
    automate: count("verdict", "automate"),
    automateLater: count("verdict", "automate-later"),
    manual: count("verdict", "manual"),
    p0: count("priority", "P0"),
    gated: all.filter((c) => c.gate).length,
  };
}
