/**
 * THE CASE BOOK — every written test case, arranged by user journey, with the
 * latest real result beside it.
 *
 * The catalog says what each case expects; the runs say what happened. A
 * tester reading the book wants both on one row, as a QA sheet has them:
 * test case, steps, expected result, actual result, result. This joins them:
 *
 *   API field checks (API-F…)  → the newest API-journey run that evaluated them
 *                                (data/runs/*.json, journey.steps[].assertions)
 *   written UI cases (UI-…)    → the newest browser run of that case
 *                                (procol-ui-tests/.plans/case-<ID>-…-result.json)
 *   everything else            → "not run yet", said plainly rather than guessed
 *
 * Nothing here judges anything: every result is copied from a run that
 * happened, with the run it came from, so a reader can open that report.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildJourneys } from "./journeys.js";

const here = dirname(fileURLToPath(import.meta.url));
const RUNS = join(here, "..", "..", "data", "runs");
const PLANS = join(here, "..", "..", "..", "procol-ui-tests", ".plans");

export type CaseResult = "passed" | "failed" | "not-checked";

export interface LastResult {
  result: CaseResult;
  /** what actually happened, in plain words */
  actual: string;
  /** ISO time of the run */
  at: string;
  /** the saved run it came from, for the report link (API journey runs) */
  runId?: string;
  /** where in that run: "API journey · RFQ only · step 5 — Read the event back" */
  where: string;
}

/** Newest-first map of case id → its latest result. */
export function lastResults(): Map<string, LastResult> {
  const out = new Map<string, LastResult>();

  // API field checks, from the journey runs (newest run first; first seen wins).
  if (existsSync(RUNS)) {
    const files = readdirSync(RUNS).filter((f) => f.endsWith(".json")).sort().reverse();
    for (const f of files) {
      let run: any;
      try {
        run = JSON.parse(readFileSync(join(RUNS, f), "utf8"));
      } catch {
        continue;
      }
      const j = run?.journey;
      if (!j?.steps) continue;
      for (const st of j.steps) {
        for (const r of st.assertions?.results ?? []) {
          if (out.has(r.id)) continue;
          out.set(r.id, {
            result: r.pass === true ? "passed" : r.pass === false ? "failed" : "not-checked",
            actual: r.humanActual ?? r.actual ?? "",
            at: run.ts ?? st.startedAt,
            runId: run.id ?? f.replace(/\.json$/, ""),
            where: `API journey · ${j.label} · step ${st.n} — ${st.title}`,
          });
        }
      }
    }
  }

  // Written UI cases, from their browser runs.
  if (existsSync(PLANS)) {
    const files = readdirSync(PLANS)
      .filter((f) => /^case-.+-result\.json$/.test(f))
      .map((f) => ({ f, t: statSync(join(PLANS, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const { f, t } of files) {
      const id = f.match(/^case-(.+?)-[a-z0-9]{6,10}-result\.json$/)?.[1];
      if (!id || out.has(id)) continue;
      let r: any;
      try {
        r = JSON.parse(readFileSync(join(PLANS, f), "utf8"));
      } catch {
        continue;
      }
      const steps: any[] = r.steps ?? [];
      const failed = steps.find((s) => s.status && s.status !== "ok");
      const passed = r.passed === true || r.verdict?.kind === "pass";
      const actual = passed
        ? `${r.verdict?.rationale ?? "The flow finished and every check held."} (${steps.length} step${steps.length === 1 ? "" : "s"})`
        : failed
          ? `Stopped at “${failed.step}”: ${failed.detail ?? failed.status}.`
          : (r.verdict?.rationale ?? r.verdict?.title ?? "The run did not pass.");
      out.set(id, {
        result: passed ? "passed" : r.verdict?.kind === "inconclusive" ? "not-checked" : "failed",
        actual,
        at: new Date(t).toISOString(),
        where: `Browser run · ${r.title ?? id}`,
      });
    }
  }
  return out;
}

export function buildCaseBook() {
  const { journeys, orphans } = buildJourneys();
  const last = lastResults();
  const tally = { cases: 0, passed: 0, failed: 0, notChecked: 0, notRun: 0 };
  const book = journeys.map((j) => {
    const r = { passed: 0, failed: 0, notChecked: 0, notRun: 0 };
    const cases = j.cases.map((c) => {
      const l = last.get(c.id);
      if (!l) r.notRun++;
      else if (l.result === "passed") r.passed++;
      else if (l.result === "failed") r.failed++;
      else r.notChecked++;
      return {
        id: c.id,
        layer: c.layer,
        group: c.group,
        section: c.section,
        title: c.title,
        why: c.why,
        setup: c.setup,
        steps: c.steps,
        expected: c.expected,
        oracle: c.oracle,
        priority: c.priority,
        verdict: c.verdict,
        ...(l ? { last: l } : {}),
      };
    });
    tally.cases += cases.length;
    tally.passed += r.passed;
    tally.failed += r.failed;
    tally.notChecked += r.notChecked;
    tally.notRun += r.notRun;
    return { id: j.id, title: j.title, persona: j.persona, goal: j.goal, order: j.order, results: r, cases };
  });
  return { generatedAt: new Date().toISOString(), tally, orphans, journeys: book };
}
