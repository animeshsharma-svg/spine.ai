import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * WHAT THE WRITTEN CASES ASK FOR THAT THE AUTOMATION CANNOT DO YET.
 *
 * The compiler has a fixed vocabulary of steps. When a test case needs
 * something outside it — "open the Create Event menu", "set the auction
 * decrement" — the honest answer is to say so, not to substitute the nearest
 * step and go green. Every such refusal is written here, grouped by what was
 * missing and counted by how many cases needed it.
 *
 * That makes this file the to-do list for growing the automation: the gap
 * asked for by 30 cases is the next step worth building, and the moment it
 * exists those 30 cases compile without anyone touching them. It is how the
 * automation follows the test cases rather than the other way round.
 */
const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, "..", "..", "data", "vocabulary-gaps.json");

export interface VocabularyGap {
  /** The missing capability, in the model's words. */
  need: string;
  /** Case ids (or the first words of an ad-hoc case) that needed it. */
  askedBy: string[];
  firstSeen: string;
  lastSeen: string;
}

function load(): VocabularyGap[] {
  if (!existsSync(FILE)) return [];
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return [];
  }
}

function key(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Record what a case needed — and forget what it no longer needs.
 *
 * A case is compiled again every time it runs. When a step has since been
 * built, the case stops listing that gap, and the ledger must drop the case
 * from it (and drop the gap entirely once nobody asks for it), or the to-do
 * list would keep showing work that is already done.
 */
export function recordVocabularyGaps(askedBy: string, needs: string[]): void {
  const gaps = load();
  const now = new Date().toISOString();
  const current = new Set(needs.map(key).filter(Boolean));
  for (const g of gaps) {
    if (!current.has(key(g.need))) g.askedBy = g.askedBy.filter((a) => a !== askedBy);
  }
  for (let i = gaps.length - 1; i >= 0; i--) if (!gaps[i].askedBy.length) gaps.splice(i, 1);
  for (const need of needs) {
    const k = key(need);
    if (!k) continue;
    const existing = gaps.find((g) => key(g.need) === k);
    if (existing) {
      if (!existing.askedBy.includes(askedBy)) existing.askedBy.push(askedBy);
      existing.lastSeen = now;
    } else {
      gaps.push({ need: need.trim(), askedBy: [askedBy], firstSeen: now, lastSeen: now });
    }
  }
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(gaps, null, 2));
}

/** Most-asked-for first: that is the order they are worth building in. */
export function readVocabularyGaps(): VocabularyGap[] {
  return load().sort((a, b) => b.askedBy.length - a.askedBy.length);
}
