import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const STORE = join(here, "..", "..", "locators.learned.json");

/**
 * WHAT THE AUTOMATION HAS LEARNED.
 *
 * The healer can find an element the deterministic candidates missed — but it
 * costs a model call and a few seconds, and it forgets the moment the run
 * ends. So the next run pays the same price for the same discovery, which is
 * not healing, it is limping.
 *
 * This is the memory: when the healer succeeds, the way it reached the element
 * is written here against the step's label; on later runs that recipe is tried
 * FIRST, before the hand-written candidates. A locator that drifted once is
 * then permanently cheap, and the file itself is a readable record of every
 * place the product moved out from under us.
 *
 * It is deliberately additive and never destructive: a learned recipe is tried
 * before the built-in candidates but never replaces them, so a recipe that
 * later goes stale costs one failed attempt rather than breaking the step.
 */

export interface LearnedRecipe {
  /** How to reach the element: a role+name pair, a testid, or a selector. */
  kind: "role" | "testid" | "text" | "selector";
  value: string;
  /** For role recipes, the accessible name. */
  name?: string;
  learnedAt: string;
  /** How many runs have used it successfully since. */
  hits: number;
  /** The page it was learned on, for the human reading this file. */
  url?: string;
}

type Store = Record<string, LearnedRecipe[]>;

function load(): Store {
  if (!existsSync(STORE)) return {};
  try {
    return JSON.parse(readFileSync(STORE, "utf8")) as Store;
  } catch {
    // A corrupt store must never break a run: it is a cache, not a source.
    return {};
  }
}

function save(store: Store): void {
  mkdirSync(dirname(STORE), { recursive: true });
  writeFileSync(STORE, JSON.stringify(store, null, 2));
}

/** Recipes previously learned for this step, best-performing first. */
export function recipesFor(label: string): LearnedRecipe[] {
  const store = load();
  return [...(store[label] ?? [])].sort((a, b) => b.hits - a.hits);
}

/**
 * Remember how an element was reached.
 *
 * Recorded against the step's LABEL rather than the page or the selector,
 * because the label is the stable thing — "open-line-items-drawer" means the
 * same intent however the markup changes underneath it.
 */
export function learn(label: string, recipe: Omit<LearnedRecipe, "learnedAt" | "hits">): void {
  const store = load();
  const existing = store[label] ?? [];
  const already = existing.find((r) => r.kind === recipe.kind && r.value === recipe.value && r.name === recipe.name);
  if (already) {
    already.hits += 1;
    already.learnedAt = new Date().toISOString();
  } else {
    existing.unshift({ ...recipe, learnedAt: new Date().toISOString(), hits: 1 });
  }
  // Keep the store readable: a step needs a handful of recipes, not a history.
  store[label] = existing.slice(0, 5);
  save(store);
  console.log(`[learned] "${label}" ← ${recipe.kind}:${recipe.name ?? recipe.value}`);
}

/** Note that a learned recipe worked again, so it keeps its priority. */
export function reinforce(label: string, recipe: LearnedRecipe): void {
  const store = load();
  const found = (store[label] ?? []).find(
    (r) => r.kind === recipe.kind && r.value === recipe.value && r.name === recipe.name,
  );
  if (!found) return;
  found.hits += 1;
  save(store);
}

/** Everything learned so far, for the dashboard to show. */
export function allLearned(): Store {
  return load();
}
