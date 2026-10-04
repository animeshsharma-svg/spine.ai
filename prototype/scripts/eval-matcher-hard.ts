/**
 * HARD MATCHER EVAL — data/evals/matcher-hard.json: ~120 requests typed the way
 * a buyer / QA engineer types them (Hinglish, typos, vague, multi-part,
 * negations, questions), each labelled with the catalog case ids that cover it
 * (grounded by reading each case) or "new".
 *
 *   npx tsx scripts/eval-matcher-hard.ts                 the current matcher, rules only
 *   npx tsx scripts/eval-matcher-hard.ts --llm           with the fast-tier confirmation
 *   npx tsx scripts/eval-matcher-hard.ts --module <dir>  a frozen copy (dir holds caseMatcher.ts + drafts.ts)
 *   --tune            grid-search the thresholds on DEV from the cached features (no calls), report DEV and TEST
 *   --cache <file>    features cache (default prompts/.matcher-hard-cache.json)   --fresh  ignore it
 *   --out <file>      write the report
 *
 * Metrics (catalog candidates only — drafts never count as coverage):
 *   top-1 / top-3   an expected id is the best / among the best three catalog candidates (same + partial rows)
 *   SAME recall     a "same" row has an expected id marked SAME
 *   SAME precision  of all SAME marks (on every row), the share that are expected ids
 *   new precision / recall   decision "new" vs rows labelled new
 *   decision acc    existing for same rows, partial-or-new for partial rows, new-or-partial for new rows (no SAME)
 */
import { config as loadEnv } from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, "..", ".env") });
const args = process.argv.slice(2);
const arg = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (n: string) => args.includes(`--${n}`);
const moduleDir = arg("module");
const useLlm = flag("llm");
const CACHE = arg("cache") ?? join(here, "..", "prompts", moduleDir ? ".matcher-hard-cache-module.json" : ".matcher-hard-cache.json");

const M = moduleDir ? await import(join(moduleDir, "caseMatcher.ts")) : await import("../src/checks/caseMatcher.js");
await (moduleDir ? import(join(moduleDir, "drafts.ts")) : import("../src/agents/drafts.js"));

interface Row { id: string; typed: string; relation: "same" | "partial" | "new"; match: string[]; near?: string[]; style: string; split: "dev" | "test" }
const rows: Row[] = JSON.parse(readFileSync(join(here, "..", "data", "evals", "matcher-hard.json"), "utf8")).rows;

interface Cand { id: string; origin: string; relation: string; f: Record<string, number | boolean> }
interface Got { id: string; decision: string; cands: Cand[] }

let got: Got[];
if (!flag("fresh") && !useLlm && existsSync(CACHE) && (flag("tune") || flag("try") || flag("cached"))) {
  got = JSON.parse(readFileSync(CACHE, "utf8"));
  console.log(`(features from ${CACHE})`);
} else {
  got = [];
  const t0 = Date.now();
  for (const r of rows) {
    const m = await M.matchTestCase(r.typed, { llm: useLlm, top: 25 });
    got.push({
      id: r.id,
      decision: m.decision,
      cands: m.candidates.map((c: any) => ({ id: c.id, origin: c.origin, relation: c.relation, f: { ...c.scores, clash: c.clash, ...(c.features ?? {}) } })),
    });
    process.stdout.write(".");
  }
  console.log(`\n${rows.length} rows in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (!useLlm) writeFileSync(CACHE, JSON.stringify(got));
}
const byId = new Map(got.map((g) => [g.id, g]));
const rank = (r: string) => (r === "same" ? 2 : r === "partial" ? 1 : 0);

/** Re-decide from cached features (only for a matcher that exports rescore). */
function relabel(g: Got, T: any): { cands: Array<Cand & { rel: string; final: number }>; decision: string } {
  if (!T || !M.rescore) {
    const cands = g.cands.map((c) => ({ ...c, rel: c.relation, final: Number(c.f.final ?? 0) }));
    return { cands, decision: g.decision };
  }
  return M.rescore(g.cands, T);
}

interface Metrics { n: number; top1: number; top3: number; sameRecall: number; samePrecision: number; newPrecision: number; newRecall: number; decisionAcc: number; misses: string[] }
function score(split: "dev" | "test" | "all", T: any): Metrics {
  const rs = rows.filter((r) => split === "all" || r.split === split);
  let covN = 0, t1 = 0, t3 = 0, sameN = 0, sameHit = 0, marks = 0, good = 0, predNew = 0, predNewOk = 0, newN = 0, decOk = 0;
  const misses: string[] = [];
  for (const r of rs) {
    const g = byId.get(r.id);
    if (!g) continue;
    const { cands, decision } = relabel(g, T);
    const cat = cands.filter((c) => c.origin !== "draft").sort((a, b) => b.final - a.final || rank(b.rel) - rank(a.rel));
    const ordered = T ? cat : cands.filter((c) => c.origin !== "draft"); // the module's own order when not re-scored
    const exp = new Set(r.match);
    const same = cat.filter((c) => c.rel === "same");
    marks += same.length;
    good += same.filter((c) => exp.has(c.id)).length;
    if (decision === "new") {
      predNew++;
      if (r.relation === "new") predNewOk++;
    }
    if (r.relation === "new") {
      newN++;
      if (!same.length && decision !== "existing") decOk++;
      else misses.push(`${r.id} [new→${decision}] "${r.typed}" SAME: ${same.map((c) => c.id).join(",")}`);
      continue;
    }
    covN++;
    if (exp.has(ordered[0]?.id)) t1++;
    if (ordered.slice(0, 3).some((c) => exp.has(c.id))) t3++;
    else misses.push(`${r.id} [top3] "${r.typed}" → ${ordered.slice(0, 3).map((c) => `${c.id}(${c.rel})`).join(", ")}`);
    if (r.relation === "same") {
      sameN++;
      if (same.some((c) => exp.has(c.id))) sameHit++;
      if (decision === "existing" && same.some((c) => exp.has(c.id))) decOk++;
    } else if (decision !== "existing" || same.some((c) => exp.has(c.id))) decOk++;
  }
  const pc = (a: number, b: number) => (b ? a / b : 0);
  return { n: rs.length, top1: pc(t1, covN), top3: pc(t3, covN), sameRecall: pc(sameHit, sameN), samePrecision: pc(good, marks), newPrecision: pc(predNewOk, predNew), newRecall: pc(predNewOk, newN), decisionAcc: pc(decOk, rs.length), misses };
}
const p = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmt = (m: Metrics) =>
  `top-1 ${p(m.top1)} · top-3 ${p(m.top3)} · SAME recall ${p(m.sameRecall)} · SAME precision ${p(m.samePrecision)} · new P ${p(m.newPrecision)} R ${p(m.newRecall)} · decision ${p(m.decisionAcc)}  [n=${m.n}]`;

// --try '<json>' … : score threshold sets (merged over THRESHOLDS) from the cache, DEV and TEST
if (flag("try")) {
  for (const [i, a] of args.entries()) {
    if (a !== "--try") continue;
    const T = { ...M.THRESHOLDS, ...JSON.parse(args[i + 1]) };
    console.log(args[i + 1]);
    console.log("  dev :", fmt(score("dev", T)));
    console.log("  test:", fmt(score("test", T)));
  }
  process.exit(0);
}
if (flag("tune")) {
  if (!M.rescore || !M.TUNE_GRID) {
    console.log("this matcher has no rescore/TUNE_GRID — nothing to tune");
    process.exit(1);
  }
  const objective = (m: Metrics) => 0.3 * m.top1 + 0.1 * m.top3 + 0.2 * m.samePrecision + 0.15 * m.sameRecall + 0.25 * (2 * m.newPrecision * m.newRecall / Math.max(1e-9, m.newPrecision + m.newRecall));
  const combos: any[] = M.TUNE_GRID();
  let best = { T: M.THRESHOLDS, v: -1 };
  for (const T of combos) {
    const v = objective(score("dev", T));
    if (v > best.v + 1e-9) best = { T, v };
  }
  console.log(`grid ${combos.length} combos. Best on DEV: ${JSON.stringify(best.T)}`);
  console.log("  dev :", fmt(score("dev", best.T)));
  console.log("  test:", fmt(score("test", best.T)));
  console.log("Current THRESHOLDS:");
  console.log("  dev :", fmt(score("dev", M.THRESHOLDS)));
  console.log("  test:", fmt(score("test", M.THRESHOLDS)));
  process.exit(0);
}

const T = null;
const out = { dev: score("dev", T), test: score("test", T), all: score("all", T) };
console.log(`\nmatcher: ${moduleDir ?? "src/checks/caseMatcher.ts"} · ${useLlm ? "rules + fast-tier confirmation" : "rules only"}`);
console.log("  dev :", fmt(out.dev));
console.log("  test:", fmt(out.test));
console.log("  all :", fmt(out.all));
const styles = [...new Set(rows.map((r) => r.style))];
for (const st of styles) {
  const ids = new Set(rows.filter((r) => r.style === st).map((r) => r.id));
  const saveRows = rows.splice(0, rows.length, ...rows.filter((r) => ids.has(r.id)));
  console.log(`  · ${st.padEnd(10)} ${fmt(score("all", T)).replace(/\s+\[n=.*$/, "")} [n=${ids.size}]`);
  rows.splice(0, rows.length, ...saveRows);
}
console.log(`\nmisses (${out.all.misses.length}):`);
for (const m of out.all.misses) console.log("  " + m);
const o = arg("out");
if (o) writeFileSync(o, JSON.stringify({ generatedAt: new Date().toISOString(), matcher: moduleDir ?? "current", llm: useLlm, dev: out.dev, test: out.test, all: out.all, rows: got }, null, 1));
process.exit(0);
