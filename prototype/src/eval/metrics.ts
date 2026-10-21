/**
 * EVAL METRICS — one pure function per metric, so every number on a report can be recomputed
 * by hand from the outcomes listed beside it. Definitions and sources: docs/METRICS.md.
 *
 * Counting rules, the same everywhere:
 *   • a case's LABEL comes from outside the agent: "bug" (the bug sheet, verified by a person on
 *     fresh events), "planted" (we injected it, so it is a bug by construction), "clean" (it
 *     passed every time it ran before, and nothing links it to a bug);
 *   • an OUTCOME is what the agent said on one run: reported (failed), passed, or excluded
 *     (couldn't tell / not run / setup or environment failure);
 *   • excluded runs never count as a detection or a false alarm — they are counted separately
 *     ("couldn't tell"), so a run cannot hide a miss by giving up;
 *   • one bug counts once however many cases or runs report it (dedup by bugKey).
 * Every proportion carries k, n, a Wilson 95% interval and the ids behind k and n.
 */

export type Label = "bug" | "planted" | "clean";
export type Said = "reported" | "passed" | "excluded";

export interface Outcome {
  /** the case (plus the planted bug, for planted cases) — one row per run */
  caseId: string;
  label: Label;
  /** a bug identity: BUG-60, or caseId#plantClass — the dedup key */
  bugKey?: string;
  /** planted bug class, for per-class breakdowns */
  plantClass?: string;
  run: number;
  said: Said;
  /** for planted bugs: the failure points at the call that was planted */
  rightPlace?: boolean;
  /** why it was excluded, when it was */
  excludedWhy?: string;
  ms?: number;
}

export interface Proportion {
  key: string;
  value: number | null;
  k: number;
  n: number;
  ci: [number, number] | null;
  /** the ids counted in k, and the ids in n that are not in k */
  ids: { counted: string[]; rest: string[] };
  note?: string;
}

/** Wilson score interval (95% by default) for k successes in n trials. null when n = 0. */
export function wilson(k: number, n: number, z = 1.959963984540054): [number, number] | null {
  if (!Number.isFinite(k) || !Number.isFinite(n) || n <= 0 || k < 0 || k > n) return null;
  const p = k / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  const r = (x: number) => Math.round(x * 1e6) / 1e6;
  return [r(Math.max(0, centre - half)), r(Math.min(1, centre + half))];
}

export function proportion(key: string, counted: string[], rest: string[], note?: string): Proportion {
  const k = counted.length;
  const n = k + rest.length;
  return { key, value: n ? Math.round((k / n) * 1e6) / 1e6 : null, k, n, ci: wilson(k, n), ids: { counted: [...counted].sort(), rest: [...rest].sort() }, ...(note ? { note } : {}) };
}

/**
 * Collapse runs into one verdict per bug (dedup) and per clean case, by majority-free rules:
 *   • a bug is DETECTED when any non-excluded run reported it (in the right place, for planted);
 *     MISSED when it had at least one non-excluded run and none detected it; EXCLUDED when every
 *     run was excluded;
 *   • a clean case is a FALSE ALARM when any non-excluded run reported it; CLEAN when it had at
 *     least one non-excluded run and none reported; EXCLUDED otherwise.
 * "Any run reported" is deliberately the strict reading for false alarms: a clean case that is
 * flagged once in k runs is a false alarm a person would have seen.
 */
export function tally(outcomes: Outcome[]) {
  const bugs = new Map<string, Outcome[]>();
  const clean = new Map<string, Outcome[]>();
  for (const o of outcomes) {
    if (o.label === "clean") (clean.get(o.caseId) ?? clean.set(o.caseId, []).get(o.caseId)!).push(o);
    else {
      const key = o.bugKey ?? o.caseId;
      (bugs.get(key) ?? bugs.set(key, []).get(key)!).push(o);
    }
  }
  const detected: string[] = [], missed: string[] = [], bugExcluded: string[] = [];
  for (const [key, runs] of bugs) {
    const live = runs.filter((r) => r.said !== "excluded");
    if (!live.length) bugExcluded.push(key);
    else if (live.some((r) => r.said === "reported" && (r.label !== "planted" || r.rightPlace !== false))) detected.push(key);
    else missed.push(key);
  }
  const falseAlarm: string[] = [], quiet: string[] = [], cleanExcluded: string[] = [];
  for (const [id, runs] of clean) {
    const live = runs.filter((r) => r.said !== "excluded");
    if (!live.length) cleanExcluded.push(id);
    else if (live.some((r) => r.said === "reported")) falseAlarm.push(id);
    else quiet.push(id);
  }
  return { detected, missed, bugExcluded, falseAlarm, quiet, cleanExcluded, bugs, clean };
}

/** Precision: real bugs among everything the agent reported. TP = detected bugs, FP = false alarms. */
export function precision(t: ReturnType<typeof tally>): Proportion {
  return proportion("precision", t.detected, t.falseAlarm, "detected bugs ÷ (detected bugs + clean cases reported as bugs)");
}

/**
 * Precision on REAL cases: known bugs detected ÷ (known bugs detected + false alarms). Planted
 * bugs are left out — catching an injected 500 is easy and would flatter the number. This is the
 * one the precision gate judges.
 */
export function precisionReal(t: ReturnType<typeof tally>): Proportion {
  const real = t.detected.filter((key) => t.bugs.get(key)?.[0]?.label === "bug");
  return proportion("precision_real", real, t.falseAlarm, "known bugs detected ÷ (known bugs detected + clean cases reported) — planted bugs left out");
}

/** Recall: bugs the agent caught among the bugs that existed (known + planted, deduplicated). */
export function recall(t: ReturnType<typeof tally>, which?: Label): Proportion {
  const keep = (key: string) => !which || t.bugs.get(key)?.[0]?.label === which;
  return proportion(which ? `recall_${which}` : "recall", t.detected.filter(keep), t.missed.filter(keep), "detected ÷ (detected + missed); excluded bugs are listed, not counted");
}

/** False-positive rate: clean cases reported as bugs ÷ clean cases that ran. */
export function falseAlarmRate(t: ReturnType<typeof tally>): Proportion {
  return proportion("false_alarm_rate", t.falseAlarm, t.quiet, "clean cases reported ÷ clean cases with a usable run");
}

/** F-beta (β = 0.5 weighs precision twice as much as recall). null when either side is unknown or both are 0. */
export function fBeta(p: number | null, r: number | null, beta = 0.5): number | null {
  if (p === null || r === null) return null;
  const b2 = beta * beta;
  const den = b2 * p + r;
  return den === 0 ? null : Math.round(((1 + b2) * p * r / den) * 1e6) / 1e6;
}

/** Mutation score: planted bugs caught in the right place ÷ planted bugs with a usable run. */
export function mutationScore(t: ReturnType<typeof tally>, plantClass?: string): Proportion {
  const keep = (key: string) => {
    const o = t.bugs.get(key)?.[0];
    return o?.label === "planted" && (!plantClass || o.plantClass === plantClass);
  };
  return proportion(plantClass ? `mutation_${plantClass}` : "mutation_score", t.detected.filter(keep), t.missed.filter(keep));
}

/**
 * pass^k (τ-bench): a case passes^k when ALL k runs gave the verdict its label expects
 * (reported for bug/planted, passed for clean). Cases with any excluded run are left out and listed.
 */
export function passK(outcomes: Outcome[], k: number): Proportion {
  const groups = new Map<string, Outcome[]>();
  for (const o of outcomes) {
    const g = `${o.caseId}${o.bugKey && o.label === "planted" ? `#${o.plantClass}` : ""}`;
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(o);
  }
  const ok: string[] = [], bad: string[] = [], skipped: string[] = [];
  for (const [g, runs] of groups) {
    if (runs.length < k || runs.some((r) => r.said === "excluded")) {
      skipped.push(g);
      continue;
    }
    const want: Said = runs[0].label === "clean" ? "passed" : "reported";
    (runs.slice(0, k).every((r) => r.said === want && (r.label !== "planted" || r.rightPlace !== false)) ? ok : bad).push(g);
  }
  const p = proportion(`pass^${k}`, ok, bad, skipped.length ? `${skipped.length} case(s) left out (fewer than ${k} usable runs): ${skipped.slice(0, 8).join(", ")}${skipped.length > 8 ? " …" : ""}` : undefined);
  return p;
}

/** Flaky rate: cases whose verdict changed between runs ÷ cases with ≥2 usable runs. */
export function flakyRate(outcomes: Outcome[]): Proportion {
  const groups = new Map<string, Said[]>();
  for (const o of outcomes) {
    if (o.said === "excluded") continue;
    const g = `${o.caseId}${o.label === "planted" ? `#${o.plantClass}` : ""}`;
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(o.said);
  }
  const flaky: string[] = [], steady: string[] = [];
  for (const [g, says] of groups) {
    if (says.length < 2) continue;
    (new Set(says).size > 1 ? flaky : steady).push(g);
  }
  return proportion("flaky_rate", flaky, steady, "cases whose verdict changed across runs ÷ cases with ≥2 usable runs");
}

/** Couldn't-tell rate: runs the agent could not judge ÷ all runs. Never hidden inside other metrics. */
export function couldntTellRate(outcomes: Outcome[]): Proportion {
  const id = (o: Outcome) => `${o.caseId}${o.plantClass ? `#${o.plantClass}` : ""}@${o.run}`;
  return proportion("couldnt_tell_rate", outcomes.filter((o) => o.said === "excluded").map(id), outcomes.filter((o) => o.said !== "excluded").map(id));
}

/** DDP (ISTQB): bugs the agent found ÷ (found + found later elsewhere, e.g. support tickets). */
export function ddp(foundByAgent: string[], foundLater: string[]): Proportion {
  const later = foundLater.filter((x) => !foundByAgent.includes(x));
  return proportion("ddp", [...new Set(foundByAgent)], [...new Set(later)], "bugs found by the agent ÷ (found by the agent + escaped and found later)");
}

/** Defect leakage: escaped bugs ÷ all bugs known (agent-found + escaped). */
export function leakage(foundByAgent: string[], escaped: string[]): Proportion {
  const esc = [...new Set(escaped.filter((x) => !foundByAgent.includes(x)))];
  return proportion("leakage", esc, [...new Set(foundByAgent)], "escaped bugs ÷ (escaped + found by the agent)");
}

/** Nearest-rank percentile; null for an empty list. */
export function percentile(values: number[], p: number): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const rank = Math.min(v.length, Math.max(1, Math.ceil((p / 100) * v.length)));
  return v[rank - 1];
}

/** Composite score (ISO 25040-style): every input normalised to 0–1, weights from config. */
export function composite(parts: Record<string, number | null>, weights: Record<string, number>): { score: number | null; used: Record<string, number>; missing: string[] } {
  let sum = 0;
  let wsum = 0;
  const used: Record<string, number> = {};
  const missing: string[] = [];
  for (const [k, w] of Object.entries(weights)) {
    const v = parts[k];
    if (v === null || v === undefined || !Number.isFinite(v)) {
      missing.push(k);
      continue;
    }
    const x = Math.max(0, Math.min(1, v));
    sum += x * w;
    wsum += w;
    used[k] = x;
  }
  // re-weighted over what could be measured; the missing inputs are listed, never treated as 0 or 1
  return { score: wsum ? Math.round((sum / wsum) * 1e4) / 1e4 : null, used, missing };
}

export interface Gate {
  key: string;
  op: ">=" | "<=";
  threshold: number;
  value: number | null;
  status: "pass" | "fail" | "unknown";
}
export function gate(key: string, value: number | null, op: ">=" | "<=", threshold: number): Gate {
  const status = value === null ? "unknown" : (op === ">=" ? value >= threshold : value <= threshold) ? "pass" : "fail";
  return { key, op, threshold, value, status };
}
