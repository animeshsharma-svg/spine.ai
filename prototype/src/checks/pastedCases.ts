/**
 * TEST CASES PASTED INTO THE DASHBOARD, RUN ONE BY ONE.
 *
 * Someone pastes a numbered list of cases in their own words. Each becomes a
 * row on the live panel, runs in turn, and ends with a verdict, the call
 * behind it, and — when the failure is one QA already has on a sheet — the
 * sheet row it reproduces. The run is saved like any other so the test report
 * and the bug sheet can be opened for it.
 *
 * Execution is scripted today (see config/demoCases.ts). The parser, the row
 * shapes and the emitted events are what a real executor slots into.
 */
import type { CheckResult } from "../ai/types.js";
import type { TestCaseRecord } from "./caseLibrary.js";
import { DEMO_CASES, GENERIC_OUTCOME, type DemoCase } from "../../config/demoCases.js";
import { knownBugById, refOf } from "../report/knownBugs.js";

export interface PastedCase {
  /** position in the paste, 1-based */
  n: number;
  /** id in the paste when it had one (TC-03, 3.), otherwise TC-nn */
  id: string;
  text: string;
}

/**
 * One case per numbered line; unnumbered lines belong to the case above them.
 * A paste with no numbering at all is one case per non-empty line.
 */
export function parsePastedCases(text: string): PastedCase[] {
  const lines = text.split(/\r?\n/);
  const starts = /^\s*(?:(TC|DC|QA|BM)[-_ ]?(\d+)|(\d+))\s*[.):|-]?\s+(.*)$/i;
  const numbered = lines.some((l) => starts.test(l));
  const out: PastedCase[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = numbered ? starts.exec(raw) : null;
    if (m) {
      const n = out.length + 1;
      const id = m[1] ? `${m[1].toUpperCase()}-${m[2].padStart(2, "0")}` : `TC-${String(n).padStart(2, "0")}`;
      out.push({ n, id, text: m[4].trim() });
    } else if (!numbered) {
      const n = out.length + 1;
      out.push({ n, id: `TC-${String(n).padStart(2, "0")}`, text: line });
    } else if (out.length) {
      out[out.length - 1].text += ` ${line}`;
    }
  }
  return out;
}

/** Does this paste read as a list of test cases rather than one instruction? */
export function looksLikeCaseList(text: string): boolean {
  return parsePastedCases(text).length >= 3;
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => w.replace(/(ing|ed|es|s)$/, "")),
  );
}
const STOP = new Set(["the", "and", "with", "must", "from", "into", "that", "this", "then", "after", "when", "their", "them", "its", "for", "not", "are", "was", "has", "have", "can", "still", "expect", "expected", "should"]);

/**
 * How well a pasted case fits a scripted one: mostly how many of the script's
 * title words appear in the paste, plus a nudge when one of its keyword
 * groups is present in full. Title overlap decides between neighbours that
 * share keywords ("bid", "vendor"); the keyword groups catch paraphrases.
 */
function fit(text: string, c: DemoCase): number {
  const t = tokens(text);
  const title = tokens(c.title);
  let hit = 0;
  for (const w of title) if (t.has(w)) hit++;
  const overlap = title.size ? hit / title.size : 0;
  const lower = text.toLowerCase();
  const keyed = c.match.some((g) => g.every((k) => lower.includes(k.toLowerCase())));
  return overlap * 10 + (keyed ? 1.5 : 0);
}

export function matchDemoCase(text: string): DemoCase | undefined {
  let best: { c: DemoCase; s: number } | undefined;
  for (const c of DEMO_CASES) {
    const s = fit(text, c);
    if (s >= 3 && (!best || s > best.s)) best = { c, s };
  }
  return best?.c;
}

/** The library-shaped record a pasted case is reported through. */
export function recordFor(p: PastedCase, d: DemoCase | undefined): TestCaseRecord {
  const title = p.text.replace(/\s*(expected|expect|then)\s*:.*$/i, "").trim() || d?.title || `Case ${p.n}`;
  return {
    id: p.id,
    feature: d?.feature ?? "platform.hardening",
    title: title.length > 140 ? `${title.slice(0, 137)}…` : title,
    type: d?.type ?? "Functional",
    priority: d?.priority ?? "P1",
    severity: d?.severity ?? "High",
    steps: d?.steps ?? [p.text],
    method: d?.method ?? "GET",
    path: d?.path ?? "/v1/dashboard_configuration",
    body: d?.body,
    expected: d?.expected ?? "accept",
    expectedResult: d?.expectedResult ?? /expected\s*:\s*(.+)$/i.exec(p.text)?.[1] ?? "The steps complete as written.",
  } as TestCaseRecord;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface PastedRunEmit {
  check: (c: CheckResult) => void;
  line: (text: string) => void;
  progress: (done: number, total: number) => void;
}

/**
 * Run the pasted cases in order, narrating each. Pace is the scripted `ms`
 * spread over the narration lines; PACE scales it (0 for tests).
 */
export async function runPastedCases(
  cases: PastedCase[],
  emit: PastedRunEmit,
  pace = Number(process.env.SPINE_SCRIPTED_PACE ?? 1),
): Promise<{ results: CheckResult[]; records: TestCaseRecord[] }> {
  const results: CheckResult[] = [];
  const records: TestCaseRecord[] = [];
  let done = 0;
  for (const p of cases) {
    const d = matchDemoCase(p.text);
    const rec = recordFor(p, d);
    records.push(rec);
    const o = d?.outcome ?? GENERIC_OUTCOME;
    const inputSummary = `${rec.method} ${rec.path}${rec.body ? ` · ${JSON.stringify(rec.body).slice(0, 120)}` : ""}`;
    const base: CheckResult = {
      id: rec.id,
      flowId: rec.feature,
      module: rec.feature,
      scenario: rec.title,
      type: rec.type === "Robustness" ? "data-validation" : rec.type === "Negative" ? "edge" : "functional",
      category: rec.type,
      priority: rec.priority,
      severity: rec.severity,
      expected: rec.expected,
      layer: d?.layer ?? "api",
      inputSummary,
      request: { method: rec.method, path: rec.path, body: rec.body },
      httpStatus: null,
      accepted: false,
      message: null,
      durationMs: 0,
      pass: false,
      verdict: "running…",
    };
    emit.check({ ...base, _running: true } as CheckResult);
    const per = (o.ms * pace) / Math.max(1, o.narration.length);
    for (const n of o.narration) {
      emit.line(`${rec.id} · ${n}`);
      await sleep(per);
    }
    const known = o.knownBug ? knownBugById(o.knownBug) : undefined;
    const final: CheckResult = {
      ...base,
      httpStatus: o.httpStatus,
      accepted: o.accepted,
      message: o.message,
      durationMs: Math.round(o.ms * (0.85 + Math.random() * 0.3)),
      pass: o.pass,
      verdict: o.verdict,
      knownBug: known ? refOf(known) : undefined,
    };
    results.push(final);
    emit.check(final);
    emit.progress(++done, cases.length);
  }
  return { results, records };
}
