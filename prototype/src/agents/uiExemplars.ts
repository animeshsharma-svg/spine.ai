/**
 * UI EXEMPLARS — the memory of how screen cases were automated before
 * (docs/ui-automation-design.md §7; the browser twin of exemplars.ts).
 *
 * Every PASSING browser run of a written screen case files its step trace
 * here: the case's words, the state the API built, the screen it opened and
 * the steps that ran green on the real app. When the compiler meets a screen
 * case, it asks for the closest exemplars — same screen first, then same
 * section, then by words (and the memory's concepts) — and
 *
 *   • REUSES one outright, without a model, when the new case says exactly
 *     what the exemplar's case said (same words after normalising) and starts
 *     on the same state and screen — the plan still goes through the step
 *     validation and the deterministic verdict like any other; or
 *   • shows the closest few to the model as WORKED EXAMPLES ("this case was
 *     automated as these steps, and they passed on the real app").
 *
 * Nothing here decides pass or fail.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeText, conceptsIn } from "../checks/caseMatcher.js";

const here = dirname(fileURLToPath(import.meta.url));
export const UI_EXEMPLARS_FILE = join(here, "..", "..", "data", "ui-exemplars.json");

export interface UiExemplar {
  caseId: string;
  title: string;
  /** the case's words (title + steps + expected), normalised */
  words: string;
  group: string;
  state: string;
  screen: string;
  steps: Array<{ step: string; args?: Record<string, unknown> }>;
  companyId: number;
  passedAt: string;
  runId?: string;
}

let cache: UiExemplar[] | null = null;

export function loadUiExemplars(): UiExemplar[] {
  if (cache) return cache;
  try {
    cache = existsSync(UI_EXEMPLARS_FILE) ? (JSON.parse(readFileSync(UI_EXEMPLARS_FILE, "utf8")).exemplars ?? []) : [];
  } catch {
    cache = [];
  }
  return cache!;
}

export const caseWords = (c: { title: string; steps?: string; expected?: string }): string =>
  normalizeText(`${c.title}. ${c.steps ?? ""}. ${c.expected ?? ""}`).text.trim();

/** File a passing run's step trace (the latest pass per case wins). */
export function addUiExemplar(e: UiExemplar): void {
  const all = loadUiExemplars().filter((x) => x.caseId !== e.caseId);
  // The plan's context (ids of one run's event) is never part of an exemplar.
  all.push({ ...e, steps: e.steps.map((s) => ({ step: s.step, ...(s.args ? { args: s.args } : {}) })) });
  cache = all.sort((a, b) => a.caseId.localeCompare(b.caseId));
  writeFileSync(UI_EXEMPLARS_FILE, JSON.stringify({ about: "Passing browser step traces of written screen cases (src/agents/uiExemplars.ts). The compiler reuses them.", updatedAt: new Date().toISOString(), exemplars: cache }, null, 1));
}

const tokens = (s: string) => new Set(s.split(/\s+/).filter((w) => w.length > 2));

/** The closest exemplars to a case starting on this state and screen, best first. */
export function closestUiExemplars(
  c: { id: string; group: string; title: string; steps?: string; expected?: string },
  where: { state: string; screen: string },
  k = 2,
): Array<{ exemplar: UiExemplar; score: number; exact: boolean }> {
  const words = caseWords(c);
  const mine = tokens(words);
  const myConcepts = new Set(conceptsIn(words).map((x) => x.id));
  const out: Array<{ exemplar: UiExemplar; score: number; exact: boolean }> = [];
  for (const e of loadUiExemplars()) {
    if (e.caseId === c.id) continue;
    const theirs = tokens(e.words);
    const inter = [...mine].filter((w) => theirs.has(w)).length;
    const jacc = inter / Math.max(1, mine.size + theirs.size - inter);
    const concepts = conceptsIn(e.words).map((x) => x.id);
    const shared = concepts.filter((x) => myConcepts.has(x)).length;
    const score = (e.screen === where.screen ? 2 : 0) + (e.state === where.state ? 0.5 : 0) + (e.group === c.group ? 1 : 0) + jacc * 4 + Math.min(shared, 4) * 0.25;
    const exact = e.words === words && e.screen === where.screen && e.state === where.state;
    out.push({ exemplar: e, score, exact });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, k).filter((x) => x.exact || x.score >= 2.5);
}

/** Worked examples for the compiler's prompt. */
export function exemplarPrompt(list: Array<{ exemplar: UiExemplar }>): string {
  if (!list.length) return "";
  return (
    "WORKED EXAMPLES — screen cases automated before, whose steps PASSED on the real app (reuse their shape and labels where the case is alike):\n" +
    list
      .map(({ exemplar: e }) => `- ${e.caseId} "${e.title}" (state ${e.state}, screen ${e.screen}): ${JSON.stringify(e.steps)}`)
      .join("\n")
  );
}
