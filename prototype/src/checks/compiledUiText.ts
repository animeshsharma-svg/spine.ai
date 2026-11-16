/**
 * STORED BROWSER PLANS FOR THE CASES WRITTEN AS TEXT — sheet cases and the product-sheet cases.
 *
 * The screen cases (UI-…) keep their compiled plans in data/compiled-plans/ui-prepared
 * (scripts/run-ui-cases.ts). Every other browser case — the test sheets (SRC-, DRV-, EXP-,
 * RCA-, TYP-, EMA-, PRA-) and the product-sheet cases (PRD-) — was compiled only at run time,
 * so until a case ran nobody knew whether the compiler could express it, and routing had to
 * say "the browser step catalog covers sourcing events only" for 3,120 of them.
 *
 * scripts/night-compile.ts compiles each of them once (fast tier) and stores the answer here:
 *
 *   data/compiled-plans/ui-text/<CASE-ID>.json   { meta, plan }
 *
 * meta.coverage is the compiler's own verdict (full / partial / none) and meta.gaps its words
 * for what it cannot express. Routing (caseRouting.ts) reads this store without a model: a
 * stored full or partial plan makes the case reachable; "none" says exactly what is missing;
 * a case that starts from a state the API set-up does not build yet is stored with
 * meta.unbuilt so the dashboard says so instead of running the nearest steps.
 *
 * The sheet runner reuses a stored plan at run time when it is newer than the compiler and
 * the step catalog (otherwise it compiles again, as before), so a stored plan is never older
 * than the vocabulary it runs on.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const COMPILED_TEXT_DIR = join(here, "..", "..", "data", "compiled-plans", "ui-text");
/** what a stored plan's steps were written against: the compiler and the step catalog */
const VOCABULARY_SOURCES = [
  join(here, "..", "agents", "planner.ts"),
  join(here, "..", "..", "..", "procol-ui-tests", "plan-catalog.json"),
  join(here, "..", "..", "..", "procol-ui-tests", "src", "plan", "steps.ts"),
];

export interface TextPlanMeta {
  caseId: string;
  title: string;
  group: string;
  /** the test sheet the case came from, when it is a sheet case */
  sheet?: string;
  compiledAt: string;
  tier: "fast" | "reason";
  coverage: "full" | "partial" | "none";
  gaps: string[];
  warnings: string[];
  /** "llm" | "fallback" (the model did not answer — not a verdict on the case) */
  source: string;
  steps: number;
  stepNames: string[];
  /** the prepared start state and screen, when the sheet runner builds one by API */
  state?: string;
  screen?: string;
  /** the start state the API set-up does not build yet (the case is compiled, but cannot start) */
  unbuilt?: string;
  ms: number;
}

export interface StoredTextPlan {
  meta: TextPlanMeta;
  plan: any;
}

let cache: Map<string, StoredTextPlan> | null = null;
let cacheAt = 0;

function load(): Map<string, StoredTextPlan> {
  // the compile runs all night while the server answers: re-read every minute
  if (cache && Date.now() - cacheAt < 60_000) return cache;
  cache = new Map();
  cacheAt = Date.now();
  if (!existsSync(COMPILED_TEXT_DIR)) return cache;
  for (const f of readdirSync(COMPILED_TEXT_DIR)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    try {
      const sp = JSON.parse(readFileSync(join(COMPILED_TEXT_DIR, f), "utf8")) as StoredTextPlan;
      if (sp?.meta?.caseId) cache.set(sp.meta.caseId, sp);
    } catch {
      /* a damaged file is simply not a stored plan */
    }
  }
  return cache;
}

export function reloadTextPlans(): void {
  cache = null;
}

export function storedTextPlan(caseId: string): StoredTextPlan | undefined {
  return load().get(caseId);
}

export function allStoredTextPlans(): StoredTextPlan[] {
  return [...load().values()];
}

/** The newest change to the compiler or the step catalog — a plan stored before it is stale. */
export function vocabularyChangedAt(): number {
  let t = 0;
  for (const f of VOCABULARY_SOURCES) if (existsSync(f)) t = Math.max(t, Math.round(statSync(f).mtimeMs));
  return t;
}

/** True when the stored plan was compiled after the last change to the vocabulary. */
export function textPlanIsFresh(sp: StoredTextPlan): boolean {
  return Date.parse(sp.meta.compiledAt) >= vocabularyChangedAt();
}

/** Write a plan atomically (the compile runs while the server reads the folder). */
export function saveTextPlan(sp: StoredTextPlan): void {
  mkdirSync(COMPILED_TEXT_DIR, { recursive: true });
  const f = join(COMPILED_TEXT_DIR, `${sp.meta.caseId}.json`);
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(sp, null, 1));
  renameSync(tmp, f);
  if (cache) cache.set(sp.meta.caseId, sp);
}

/** The counts the dashboard and the night report show. */
export function textPlanCounts(): { total: number; full: number; partial: number; none: number; fallback: number; unbuilt: number } {
  const out = { total: 0, full: 0, partial: 0, none: 0, fallback: 0, unbuilt: 0 };
  for (const sp of load().values()) {
    out.total++;
    if (sp.meta.source === "fallback") out.fallback++;
    else out[sp.meta.coverage]++;
    if (sp.meta.unbuilt) out.unbuilt++;
  }
  return out;
}
