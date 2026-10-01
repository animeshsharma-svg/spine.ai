/**
 * MATCHER EVAL — how well does `matchTestCase` (src/checks/caseMatcher.ts)
 * recognise a typed test case as the catalog case(s) it already is, and a
 * genuinely new case as new?
 *
 * Corpus: prompts/matching.jsonl — typed variants (paraphrase, typo, Hinglish,
 * partial description) of real catalog cases with the ids that cover them,
 * genuinely new cases (expect NEW), and a few "existing case + one extra
 * expectation" rows (expect PARTIAL). Each row is tagged dev or test: the
 * thresholds were tuned on dev only; test is reported separately so the
 * numbers are not just the tuning set read back.
 *
 * Usage:
 *   npx tsx scripts/eval-matcher.ts              rules only (no model)
 *   npx tsx scripts/eval-matcher.ts --llm        rules + fast-tier confirmation
 *   npx tsx scripts/eval-matcher.ts --tune       grid-search thresholds on dev (from the cache; no calls)
 *   --cache <file>   reuse / write the per-row candidate features (default prompts/.matcher-cache.json)
 *   --fresh          ignore the cache
 *
 * Metrics (case-level):
 *   recall      a "same" row has at least one expected id marked SAME
 *   precision   of all SAME marks on "same" rows, the share that are expected ids
 *   top-1/top-3 an expected id is first / in the first three candidates
 *   new detect  a "new" row gets no SAME (strict: nothing SAME or PARTIAL)
 *   partial     a "partial" row finds an expected id as SAME or PARTIAL (strict: PARTIAL)
 */
import { config as loadEnv } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, "..", ".env") });

const { matchTestCase, THRESHOLDS, finalScore, decideRelation } = await import("../src/checks/caseMatcher.js");
const { usageReport } = await import("../src/ai/llm.js");
type Thresholds = typeof THRESHOLDS;

interface Row {
  id: string;
  typed: string;
  expect: { relation: "same" | "new" | "partial"; match: string[] };
  split: "dev" | "test";
  style: string;
}
interface Cand {
  id: string;
  memoryRaw: number;
  words: number;
  concepts: number;
  clash: boolean;
  relation: string;
  ruleRelation: string;
}
interface Got {
  id: string;
  decision: string;
  cands: Cand[];
}

const args = process.argv.slice(2);
const useLlm = args.includes("--llm");
const tune = args.includes("--tune");
const fresh = args.includes("--fresh");
const cacheArg = args.indexOf("--cache");
const CACHE = cacheArg >= 0 ? args[cacheArg + 1] : join(here, "..", "prompts", ".matcher-cache.json");

const rows: Row[] = readFileSync(join(here, "..", "prompts", "matching.jsonl"), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => JSON.parse(l));

// ── collect ─────────────────────────────────────────────────────────────────
let got: Got[];
const rescoreArg = args.indexOf("--rescore");
const cacheOk = !useLlm && !fresh && existsSync(CACHE);
if (rescoreArg >= 0) {
  // Score a previous run's saved answers against the (possibly corrected) labels — no calls.
  got = JSON.parse(readFileSync(args[rescoreArg + 1], "utf8")).rows;
  console.log(`(answers from ${args[rescoreArg + 1]})`);
} else if (cacheOk || (tune && existsSync(CACHE))) {
  got = JSON.parse(readFileSync(CACHE, "utf8"));
  console.log(`(features from ${CACHE})`);
} else {
  got = [];
  const t0 = Date.now();
  for (const r of rows) {
    const m = await matchTestCase(r.typed, { llm: useLlm, top: 20 });
    got.push({
      id: r.id,
      decision: m.decision,
      cands: m.candidates.map((c) => ({
        id: c.id,
        memoryRaw: c.scores.memoryRaw,
        words: c.scores.words,
        concepts: c.scores.concepts,
        clash: c.clash,
        relation: c.relation,
        ruleRelation: c.ruleRelation,
      })),
    });
    process.stdout.write(".");
  }
  console.log(`\n${rows.length} rows in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (!useLlm) writeFileSync(CACHE, JSON.stringify(got));
}
const byId = new Map(got.map((g) => [g.id, g]));

// ── score ───────────────────────────────────────────────────────────────────
/** Re-derive relations from the features under thresholds T (rules only). */
function relabel(g: Got, T: Thresholds): Array<Cand & { rel: string; final: number }> {
  const withFinal = g.cands.map((c) => ({ ...c, final: finalScore(c.memoryRaw, c.words, c.concepts, T) }));
  const best = Math.max(0, ...withFinal.map((c) => c.final));
  return withFinal
    .map((c) => ({ ...c, rel: decideRelation({ final: c.final, concepts: c.concepts, clash: c.clash }, best, T) }))
    .sort((a, b) => rank(b.rel) - rank(a.rel) || b.final - a.final);
}
const rank = (r: string) => (r === "same" ? 2 : r === "partial" ? 1 : 0);

interface Metrics {
  n: { same: number; new: number; partial: number };
  recall: number;
  precision: number;
  top1: number;
  top3: number;
  newDetect: number;
  newStrict: number;
  partialFound: number;
  partialStrict: number;
  classAcc: number;
  misses: string[];
}

function score(split: "dev" | "test" | "all", T: Thresholds | null): Metrics {
  const rs = rows.filter((r) => split === "all" || r.split === split);
  let sameN = 0, recallHit = 0, top1 = 0, top3 = 0, sameMarks = 0, sameGood = 0;
  let newN = 0, newOk = 0, newStrict = 0, partN = 0, partOk = 0, partStrict = 0, classOk = 0;
  const misses: string[] = [];
  for (const r of rs) {
    const g = byId.get(r.id)!;
    const list = T ? relabel(g, T) : g.cands.map((c) => ({ ...c, rel: c.relation, final: 0 }));
    const exp = new Set(r.expect.match);
    const same = list.filter((c) => c.rel === "same");
    const partial = list.filter((c) => c.rel === "partial");
    const isExisting = same.length > 0;
    if (r.expect.relation === "same") {
      sameN++;
      const hit = same.some((c) => exp.has(c.id));
      if (hit) recallHit++;
      else misses.push(`${r.id} [recall] "${r.typed}" → SAME: ${same.map((c) => c.id).join(",") || "none"}; top: ${list.slice(0, 3).map((c) => `${c.id}(${c.rel})`).join(",")}`);
      if (exp.has(list[0]?.id)) top1++;
      if (list.slice(0, 3).some((c) => exp.has(c.id))) top3++;
      sameMarks += same.length;
      sameGood += same.filter((c) => exp.has(c.id)).length;
      const extra = same.filter((c) => !exp.has(c.id));
      if (extra.length) misses.push(`${r.id} [extra SAME] "${r.typed}" → ${extra.map((c) => c.id).join(",")}`);
      if (isExisting) classOk++;
    } else if (r.expect.relation === "new") {
      newN++;
      if (!isExisting) { newOk++; classOk++; }
      else misses.push(`${r.id} [new] "${r.typed}" → wrongly SAME: ${same.map((c) => c.id).join(",")}`);
      if (!isExisting && !partial.length) newStrict++;
    } else {
      partN++;
      const found = list.some((c) => (c.rel === "same" || c.rel === "partial") && exp.has(c.id));
      if (found) partOk++;
      if (list.some((c) => c.rel === "partial" && exp.has(c.id)) && !same.some((c) => exp.has(c.id))) partStrict++;
      if (!isExisting) classOk++;
      if (!found) misses.push(`${r.id} [partial] "${r.typed}" → ${list.slice(0, 3).map((c) => `${c.id}(${c.rel})`).join(",")}`);
    }
  }
  const pct = (a: number, b: number) => (b ? a / b : 0);
  return {
    n: { same: sameN, new: newN, partial: partN },
    recall: pct(recallHit, sameN),
    precision: pct(sameGood, sameMarks),
    top1: pct(top1, sameN),
    top3: pct(top3, sameN),
    newDetect: pct(newOk, newN),
    newStrict: pct(newStrict, newN),
    partialFound: pct(partOk, partN),
    partialStrict: pct(partStrict, partN),
    classAcc: pct(classOk, sameN + newN + partN),
    misses,
  };
}

const fmt = (m: Metrics) =>
  `recall ${(m.recall * 100).toFixed(1)}% · precision ${(m.precision * 100).toFixed(1)}% · top-1 ${(m.top1 * 100).toFixed(1)}% · top-3 ${(m.top3 * 100).toFixed(1)}% · ` +
  `new ${(m.newDetect * 100).toFixed(1)}% (strict ${(m.newStrict * 100).toFixed(1)}%) · partial found ${(m.partialFound * 100).toFixed(1)}% (strict ${(m.partialStrict * 100).toFixed(1)}%) · ` +
  `existing-vs-new ${(m.classAcc * 100).toFixed(1)}%  [n same=${m.n.same} new=${m.n.new} partial=${m.n.partial}]`;

// ── tune (dev only) ─────────────────────────────────────────────────────────
if (tune) {
  const objective = (m: Metrics) => 0.35 * m.recall + 0.25 * m.precision + 0.3 * m.newDetect + 0.1 * m.partialFound;
  let best = { T: { ...THRESHOLDS }, v: -1 };
  const grid = {
    memLow: [0.35, 0.4, 0.45],
    memHigh: [0.68, 0.72, 0.76],
    wMemory: [0.4, 0.5, 0.6],
    wWords: [0.1, 0.2, 0.3],
    sameFinal: [0.5, 0.55, 0.6, 0.65, 0.7, 0.75],
    sameConcepts: [0.6, 0.7, 0.8, 0.9],
    sameMargin: [0.05, 0.08, 0.12, 0.2],
    partialFinal: [0.35, 0.45],
    partialConcepts: [0.3, 0.5],
  };
  for (const memLow of grid.memLow)
    for (const memHigh of grid.memHigh)
      for (const wMemory of grid.wMemory)
        for (const wWords of grid.wWords) {
          const wConcepts = +(1 - wMemory - wWords).toFixed(2);
          if (wConcepts <= 0) continue;
          for (const sameFinal of grid.sameFinal)
            for (const sameConcepts of grid.sameConcepts)
              for (const sameMargin of grid.sameMargin)
                for (const partialFinal of grid.partialFinal)
                  for (const partialConcepts of grid.partialConcepts) {
                    const T = { memLow, memHigh, wMemory, wWords, wConcepts, sameFinal, sameConcepts, sameMargin, partialFinal, partialConcepts };
                    const v = objective(score("dev", T));
                    if (v > best.v + 1e-9) best = { T, v };
                  }
        }
  console.log("\nBest thresholds on DEV:", JSON.stringify(best.T));
  console.log("  dev :", fmt(score("dev", best.T)));
  console.log("  test:", fmt(score("test", best.T)));
  console.log("\nCurrent THRESHOLDS:", JSON.stringify(THRESHOLDS));
  console.log("  dev :", fmt(score("dev", THRESHOLDS)));
  console.log("  test:", fmt(score("test", THRESHOLDS)));
  process.exit(0);
}

// ── report ──────────────────────────────────────────────────────────────────
const T = useLlm || rescoreArg >= 0 ? null : THRESHOLDS; // with the model (or a rescore) the relations are the ones recorded
const out = { dev: score("dev", T), test: score("test", T), all: score("all", T) };
console.log(`\nmode: ${useLlm ? "rules + fast-tier confirmation" : "rules only"}`);
console.log("  dev :", fmt(out.dev));
console.log("  test:", fmt(out.test));
console.log("  all :", fmt(out.all));
console.log(`\nmisses (${out.all.misses.length}):`);
for (const m of out.all.misses) console.log("  " + m);
const usage = usageReport();
if (useLlm) console.log("\nLLM usage:", JSON.stringify(usage));
if (rescoreArg < 0) writeFileSync(
  join(here, "..", "prompts", useLlm ? "last-matcher-eval-llm.json" : "last-matcher-eval.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), mode: useLlm ? "rules+llm" : "rules", thresholds: THRESHOLDS, usage, ...out, rows: got }, null, 2),
);
process.exit(0);
