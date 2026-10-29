import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A TYPED CASE IS COMPILED ONCE — "Run it again" and the same words typed again reuse the steps
 * (Aanya, 27 Oct: "why does it take so much time? too slow the whole platform" — every re-run spent
 * 20–60 s, and a reasoning-model call, compiling the very text it had just compiled).
 *
 * The plan is reused only while nothing that made it has changed: the compiler (planner.ts) and the
 * step catalog (procol-ui-tests plan-catalog.json and steps.ts) are part of the key, so a fix to
 * either compiles afresh. Only plans that could run are kept (steps, and not "none" coverage, and no
 * "the AI did not answer"). Kept a week, in data/compile-cache/, so a server restart keeps them.
 */
const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, "..", "..", "data", "compile-cache");
const SOURCES = [
  join(here, "planner.ts"),
  join(here, "..", "..", "..", "procol-ui-tests", "plan-catalog.json"),
  join(here, "..", "..", "..", "procol-ui-tests", "src", "plan", "steps.ts"),
];
const WEEK = 7 * 24 * 3600_000;

const mtimes = () => SOURCES.map((f) => (existsSync(f) ? Math.round(statSync(f).mtimeMs) : 0)).join(",");
const keyOf = (testCase: string) => createHash("sha1").update(`${testCase.trim().toLowerCase().replace(/\s+/g, " ")}|${mtimes()}`).digest("hex").slice(0, 24);

export interface Cached<T> {
  result: T;
  /** reused from an earlier compile of the same words */
  reused: boolean;
  /** how long ago that compile was, when reused */
  ageMs?: number;
}

export async function compileCached<T extends { plan?: { steps?: unknown[] }; coverage?: string; warnings?: string[] }>(
  testCase: string,
  compile: (testCase: string) => Promise<T>,
): Promise<Cached<T>> {
  const file = join(DIR, `${keyOf(testCase)}.json`);
  try {
    if (existsSync(file)) {
      const kept = JSON.parse(readFileSync(file, "utf8")) as { at: number; result: T };
      const age = Date.now() - kept.at;
      // A fresh copy every time: a run adds to its plan (context, steps inserted mid-run).
      if (age < WEEK) return { result: kept.result, reused: true, ageMs: age };
    }
  } catch {
    /* an unreadable entry is compiled again */
  }
  const result = await compile(testCase);
  const runnable = (result.plan?.steps?.length ?? 0) > 0 && result.coverage !== "none" && !(result.warnings ?? []).some((w) => /could not be reached|did not return JSON|did not answer|default plan|no LLM/i.test(w));
  if (runnable) {
    try {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(file, JSON.stringify({ at: Date.now(), testCase, result }));
    } catch {
      /* not kept: the next run compiles again */
    }
  }
  return { result, reused: false };
}
