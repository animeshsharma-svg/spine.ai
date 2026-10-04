/**
 * COMPILE THE API CASES THAT NEED THE MODEL — once, store what validates.
 *
 *   npx tsx scripts/compile-api-plans.ts --dry                 which cases, no model calls
 *   npx tsx scripts/compile-api-plans.ts                       P0 cases (fast tier only)
 *     --priority P0,P1    which priorities (default P0)
 *     --limit 60          at most this many cases
 *     --ids API-X,API-Y   exactly these catalog ids
 *     --force             compile again even when a plan is stored
 *     --all-verdicts      also cases not marked "automate" (default: automate only)
 *     --revalidate        no model: re-check every stored plan in code (validator + actor/app/role rules)
 *
 * Which cases: written API cases whose route is the API test compiler
 * (caseRouting.ts kind "api-plan") and that do NOT already compile to a full
 * plan without a model (library case or fixed rule). Each is compiled with the
 * fast tier only — never the reason tier — and the answer is accepted only when
 * the planner's own validator (validatePlan) passes it again here. Then:
 *
 *   full     → stored as data/compiled-plans/api/<id>.json; routing counts it
 *              runnable (it runs without a model from now on)
 *   partial  → stored with its named gaps, NOT counted runnable
 *   none     → not stored; the reason goes into index.json
 *
 * Bounded: one case at a time, a 120 s limit per case, a spend report at the end.
 */
import { config } from "dotenv";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

import { allCases } from "../src/checks/testCatalog.js";
import { routeFor } from "../src/checks/caseRouting.js";
import { compileApiPlan, validatePlan, PLAN_VERSION, planInWords } from "../src/agents/apiPlanner.js";
import { COMPILED_API_DIR, storedApiPlan, allStoredApiPlans, storedPlanProblems } from "../src/checks/compiledPlans.js";
import { catalogCaseText } from "../src/agents/apiPlanner.js";
import { caseById } from "../src/checks/testCatalog.js";
import { llmMode, usageReport } from "../src/ai/llm.js";
import { withWatchdog } from "../src/checks/resilience.js";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(`--${n}`);
const DRY = flag("dry");
const REVALIDATE = flag("revalidate");
const FORCE = flag("force");
const PRIORITIES = new Set((arg("priority") ?? "P0").split(",").map((s) => s.trim().toUpperCase()));
const LIMIT = Number(arg("limit")) || 60;
const ALL_VERDICTS = flag("all-verdicts");
const IDS = new Set((arg("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

// ── re-check what is stored, without a model ───────────────────────────────
if (REVALIDATE) {
  const idxFile = join(COMPILED_API_DIR, "index.json");
  const idx = existsSync(idxFile) ? JSON.parse(readFileSync(idxFile, "utf8")) : { cases: {} };
  for (const sp of allStoredApiPlans()) {
    const v = await validatePlan(sp.plan);
    const cat = caseById(sp.meta.caseId);
    const extra = v.ok ? await storedPlanProblems(v.plan, cat ? catalogCaseText(cat) : sp.meta.title) : v.errors;
    const was = sp.meta.coverage;
    if (!v.ok) sp.meta.validated = false;
    if (extra.length && sp.meta.coverage === "full") sp.meta.coverage = "partial";
    // Earlier code findings are replaced, not piled up.
    sp.meta.gaps = [...new Set([...extra, ...sp.meta.gaps.filter((g) => !/^the plan has the |^the case needs a caller who is not/.test(g))])];
    writeFileSync(join(COMPILED_API_DIR, `${sp.meta.caseId}.json`), JSON.stringify(sp, null, 1));
    if (idx.cases[sp.meta.caseId]) Object.assign(idx.cases[sp.meta.caseId], { coverage: sp.meta.coverage, why: sp.meta.gaps });
    if (was !== sp.meta.coverage || extra.length) log(`${sp.meta.caseId}: ${was} → ${sp.meta.coverage}${extra.length ? ` — ${extra.join("; ").slice(0, 220)}` : ""}`);
  }
  writeFileSync(idxFile, JSON.stringify({ ...idx, updatedAt: new Date().toISOString() }, null, 1));
  log(`re-checked ${allStoredApiPlans().length} stored plan(s): ${allStoredApiPlans().filter((p) => p.meta.validated && p.meta.coverage === "full").length} full`);
  process.exit(0);
}

// ── which cases ─────────────────────────────────────────────────────────────
const wanted = allCases().filter((c) => {
  if (c.layer !== "api") return false;
  if (IDS.size) return IDS.has(c.id);
  // "automate" cases only (the build order's own filter), unless asked otherwise.
  if (!ALL_VERDICTS && c.verdict !== "automate") return false;
  return PRIORITIES.has(String(c.priority).toUpperCase()) && routeFor(c).kind === "api-plan";
});
const todo: typeof wanted = [];
const already: string[] = [];
for (const c of wanted) {
  if (!FORCE && storedApiPlan(c.id)) {
    already.push(c.id);
    continue;
  }
  // Without the model first: a case that already compiles in full needs nothing stored.
  const quick = await compileApiPlan({ caseId: c.id }, { llm: false });
  if (quick.plan && quick.coverage === "full") continue;
  todo.push(c);
}
log(`${wanted.length} case(s) route to the API test compiler at ${[...PRIORITIES].join("/")}; ${already.length} already stored; ${todo.length} need the model`);
if (DRY) {
  for (const c of todo.slice(0, LIMIT)) log(`  ${c.id}  ${c.title}`);
  process.exit(0);
}
if (llmMode() === "fallback") {
  log("no model is configured (SLINGRING_API_KEY) — nothing compiled");
  process.exit(1);
}

mkdirSync(COMPILED_API_DIR, { recursive: true });
const indexFile = join(COMPILED_API_DIR, "index.json");
const index: Record<string, any> = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, "utf8")).cases ?? {} : {};
const before = usageReport().totalUsd;
const tally = { full: 0, partial: 0, none: 0 };

for (const c of todo.slice(0, LIMIT)) {
  let r: Awaited<ReturnType<typeof compileApiPlan>> | undefined;
  try {
    r = await withWatchdog(compileApiPlan({ caseId: c.id }, { llm: true, allowReason: false }), 120_000, `compiling ${c.id}`);
  } catch (e) {
    index[c.id] = { coverage: "none", title: c.title, why: [`the compile did not finish: ${(e as Error).message}`], at: new Date().toISOString() };
    tally.none += 1;
    log(`${c.id}  none — ${(e as Error).message}`);
    continue;
  }
  // The planner validated it; validate again here, in code, before storing.
  const v = r.plan ? await validatePlan(r.plan) : null;
  const extra = v?.ok ? await storedPlanProblems(v.plan, catalogCaseText(c)) : [];
  if (extra.length) r.gaps = [...extra, ...r.gaps];
  const coverage: "full" | "partial" | "none" = !r.plan || !v?.ok ? "none" : extra.length && r.coverage === "full" ? "partial" : r.coverage;
  const why = coverage === "none" ? [...(v && !v.ok ? v.errors : []), ...r.errors, ...r.gaps].filter(Boolean) : r.gaps;
  index[c.id] = {
    coverage,
    title: c.title,
    source: r.source,
    why,
    endpoints: r.endpoints,
    usd: Number(r.llm.usd.toFixed(4)),
    at: new Date().toISOString(),
  };
  tally[coverage] += 1;
  if (coverage !== "none" && v) {
    const plan = { ...v.plan, caseId: c.id, title: c.title };
    writeFileSync(
      join(COMPILED_API_DIR, `${c.id}.json`),
      JSON.stringify(
        {
          meta: {
            caseId: c.id,
            title: c.title,
            compiledAt: new Date().toISOString(),
            planVersion: PLAN_VERSION,
            source: r.source,
            coverage,
            gaps: r.gaps,
            warnings: v.warnings,
            validated: true,
            endpoints: r.endpoints,
            llm: { calls: r.llm.calls, promptTokens: r.llm.promptTokens, completionTokens: r.llm.completionTokens, usd: Number(r.llm.usd.toFixed(4)) },
            words: planInWords(plan),
          },
          plan,
        },
        null,
        1,
      ),
    );
  }
  log(`${c.id}  ${coverage}${why.length ? ` — ${why.slice(0, 2).join("; ").slice(0, 200)}` : ""}`);
}

writeFileSync(
  indexFile,
  JSON.stringify({ updatedAt: new Date().toISOString(), planVersion: PLAN_VERSION, cases: index }, null, 1),
);
const spent = usageReport().totalUsd - before;
log(`done: ${tally.full} full (stored, runnable), ${tally.partial} partial (stored, not counted), ${tally.none} none — model spend $${spent.toFixed(3)} (fast tier only)`);
process.exit(0);
