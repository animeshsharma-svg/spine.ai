/**
 * API TEST COMPILER EVAL — does `compileApiPlan` (src/agents/apiPlanner.ts)
 * turn a test case into the right API plan?
 *
 * Corpus: prompts/apiplans.jsonl — typed cases (as a person writes them in
 * the chat box, one in Hinglish, two that are out of scope on purpose) and
 * catalog API cases (by id), each with the expected plan SHAPE:
 *   recipe     the setup recipes that build the right starting state (any of)
 *   endpoints  the decisive request's endpoint (any of)
 *   uses       endpoints that must appear somewhere in the plan (all of)
 *   outcome    accept | reject | no-5xx (or a list: a case whose catalog text says "should be refused"
 *              while its library twin records today's behaviour as "no crash" accepts either)
 *   code       the app's error code, when the case names one
 *   verify     true = the plan must read something back
 *   none       true = an out-of-scope case: no plan (or only a partial one that names the gap)
 *
 * Metrics (over rows that expect a plan, unless said):
 *   validity   a plan came back and passed the vocabulary validation
 *   recipe     its setup is one of the expected recipes
 *   endpoint   its decisive request is one of the expected endpoints (and every `uses` appears)
 *   outcome    its expected outcome is the expected one
 *   code       its error code matches (rows that name a code)
 *   verify     it reads back when the row says it must
 *   exact      all of the above on one row
 *   none-detect  out-of-scope rows that got no plan, or a partial one with the gap named
 *
 * Usage:
 *   npx tsx scripts/eval-apiplanner.ts                full compiler (library-case path, fast-tier model, rules)
 *   npx tsx scripts/eval-apiplanner.ts --model-only   the fast-tier model alone (no library-case path, no rules)
 *   npx tsx scripts/eval-apiplanner.ts --no-llm       deterministic paths only
 *   --limit N   --only T01,C03   --concurrency 3   --out prompts/last-apiplan-eval.json
 *
 * Never uses the reason tier. Sends nothing to Procol.
 */
import { config as loadEnv } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, "..", ".env") });
// A compile is worth waiting for: give the fast tier the patience the 4 s
// inner-loop default does not (this process only).
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "45000";

const { compileApiPlan } = await import("../src/agents/apiPlanner.js");
const { usageReport } = await import("../src/ai/llm.js");

interface Row {
  id: string;
  source: "typed" | "catalog";
  text?: string;
  caseId?: string;
  expect: { recipe?: string[]; endpoints?: string[]; uses?: string[]; outcome?: string | string[]; code?: string; verify?: boolean; none?: boolean };
}

const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const arg = (f: string) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
const modelOnly = flag("--model-only");
const noLlm = flag("--no-llm");
const limit = Number(arg("--limit")) || Infinity;
const only = arg("--only")?.split(",");
const conc = Math.max(1, Number(arg("--concurrency")) || 3);
const outFile = arg("--out") ?? join(here, "..", "prompts", modelOnly ? "last-apiplan-eval-model-only.json" : noLlm ? "last-apiplan-eval-no-llm.json" : "last-apiplan-eval.json");

const rows: Row[] = readFileSync(join(here, "..", "prompts", "apiplans.jsonl"), "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l))
  .filter((r: Row) => !only || only.includes(r.id))
  .slice(0, limit);

interface Scored {
  id: string;
  source: string;
  input: string;
  compiledBy: string;
  coverage: string;
  plan: unknown;
  gaps: string[];
  errors: string[];
  checks: Record<string, boolean | null>;
  exact: boolean | null;
  ms: number;
}

const before = usageReport();
const t0 = Date.now();
const results: Scored[] = new Array(rows.length);
let next = 0;
async function worker() {
  for (;;) {
    const i = next++;
    if (i >= rows.length) return;
    const r = rows[i];
    const c = await compileApiPlan(r.caseId ? { caseId: r.caseId } : { text: r.text }, { llm: !noLlm, modelOnly, allowReason: false });
    const e = r.expect;
    const checks: Record<string, boolean | null> = {};
    let exact: boolean | null = null;
    if (e.none) {
      checks.noneDetect = !c.plan || (c.coverage === "partial" && c.gaps.length > 0);
    } else {
      const p = c.plan;
      checks.validity = !!p;
      checks.recipe = p ? !!e.recipe?.includes(p.setup.recipe) : false;
      const dec = (c.decisiveEndpoint ?? "").split(" + ").filter(Boolean);
      const usesOk = (e.uses ?? []).every((u) => c.endpoints.includes(u));
      checks.endpoint = p ? dec.some((d) => e.endpoints?.includes(d)) && usesOk : false;
      checks.outcome = p ? (Array.isArray(e.outcome) ? e.outcome : [e.outcome]).includes(p.expected.outcome) : false;
      checks.code = e.code ? (p ? p.expected.code === e.code : false) : null;
      checks.verify = e.verify ? (p ? p.verify.length > 0 : false) : null;
      exact = Object.values(checks).every((x) => x !== false);
    }
    results[i] = {
      id: r.id,
      source: r.source,
      input: r.caseId ?? r.text ?? "",
      compiledBy: c.source,
      coverage: c.coverage,
      plan: c.plan,
      gaps: c.gaps,
      errors: c.errors,
      checks,
      exact,
      ms: c.ms,
    };
    const marks = Object.entries(checks)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => `${v ? "✓" : "✗"}${k}`)
      .join(" ");
    console.log(`${r.id.padEnd(4)} ${c.source.padEnd(12)} ${c.coverage.padEnd(7)} ${marks}${c.plan ? `  [${c.plan.setup.recipe} → ${c.decisiveEndpoint ?? "—"} → ${c.plan.expected.outcome}${c.plan.expected.code ? ` ${c.plan.expected.code}` : ""}]` : `  (no plan: ${c.gaps[0]?.slice(0, 90) ?? ""}${c.errors[0] ? ` · ${c.errors[0].slice(0, 90)}` : ""})`}`);
  }
}
await Promise.all(Array.from({ length: Math.min(conc, rows.length) }, worker));

const after = usageReport();
const sum = (u: ReturnType<typeof usageReport>, k: "calls" | "promptTokens" | "completionTokens") => Object.values(u.byModel).reduce((n, x) => n + x[k], 0);
const planRows = results.filter((r) => !rows.find((x) => x.id === r.id)!.expect.none);
const rate = (k: string, set = planRows) => {
  const xs = set.map((r) => r.checks[k]).filter((x) => x !== null && x !== undefined);
  return { n: xs.length, ok: xs.filter(Boolean).length, pct: xs.length ? Math.round((100 * xs.filter(Boolean).length) / xs.length) : null };
};
const noneRows = results.filter((r) => rows.find((x) => x.id === r.id)!.expect.none);
const bySource = (src: string) => {
  const set = planRows.filter((r) => r.source === src);
  return { rows: set.length, validity: rate("validity", set), recipe: rate("recipe", set), endpoint: rate("endpoint", set), outcome: rate("outcome", set), exact: { n: set.length, ok: set.filter((r) => r.exact).length } };
};
const summary = {
  at: new Date().toISOString(),
  mode: modelOnly ? "model-only (fast tier)" : noLlm ? "deterministic only" : "full compiler (library-case path + fast tier + rules)",
  rows: results.length,
  validity: rate("validity"),
  recipe: rate("recipe"),
  endpoint: rate("endpoint"),
  outcome: rate("outcome"),
  code: rate("code"),
  verify: rate("verify"),
  exact: { n: planRows.length, ok: planRows.filter((r) => r.exact).length, pct: planRows.length ? Math.round((100 * planRows.filter((r) => r.exact).length) / planRows.length) : null },
  noneDetect: rate("noneDetect", noneRows),
  typed: bySource("typed"),
  catalog: bySource("catalog"),
  compiledBy: results.reduce<Record<string, number>>((m, r) => ((m[r.compiledBy] = (m[r.compiledBy] ?? 0) + 1), m), {}),
  coverage: results.reduce<Record<string, number>>((m, r) => ((m[r.coverage] = (m[r.coverage] ?? 0) + 1), m), {}),
  llm: {
    calls: sum(after, "calls") - sum(before, "calls"),
    promptTokens: sum(after, "promptTokens") - sum(before, "promptTokens"),
    completionTokens: sum(after, "completionTokens") - sum(before, "completionTokens"),
    usd: Number((after.totalUsd - before.totalUsd).toFixed(4)),
    byModel: after.byModel,
  },
  wallMs: Date.now() - t0,
};
const pct = (x: { ok: number; n: number; pct: number | null }) => `${x.ok}/${x.n}${x.pct !== null ? ` (${x.pct}%)` : ""}`;
console.log(`\n── ${summary.mode} — ${summary.rows} rows, ${Math.round(summary.wallMs / 1000)} s ──`);
console.log(`validity ${pct(summary.validity)} · recipe ${pct(summary.recipe)} · endpoint ${pct(summary.endpoint)} · outcome ${pct(summary.outcome)} · code ${pct(summary.code)} · verify ${pct(summary.verify)} · exact ${pct(summary.exact)} · none-detect ${pct(summary.noneDetect)}`);
console.log(`typed: exact ${summary.typed.exact.ok}/${summary.typed.exact.n} · catalog: exact ${summary.catalog.exact.ok}/${summary.catalog.exact.n}`);
console.log(`compiled by ${JSON.stringify(summary.compiledBy)} · coverage ${JSON.stringify(summary.coverage)} · llm calls ${summary.llm.calls}, ${summary.llm.promptTokens}+${summary.llm.completionTokens} tokens, $${summary.llm.usd}`);
writeFileSync(outFile, JSON.stringify({ summary, results }, null, 1));
console.log(`written ${outFile}`);
process.exit(0);
