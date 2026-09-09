import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileTestCase, lintPlan, type TestPlan } from "../src/agents/planner.js";
import { providerLabel } from "../src/ai/llm.js";

/**
 * Measure the COMPILER, the way eval-routing measures the router.
 *
 * Judging a plan needs no browser: a plan is wrong in ways you can see
 * statically — a step that does not exist, a publish with no schedule, a
 * two-stage event configured on one tab. Catching those here is worth far more
 * than catching them after a five-minute run against the live app, and it means
 * the compiler can be improved in a tight loop.
 *
 * What is NOT claimed: that a structurally valid plan passes. Only a real run
 * tells you that. This measures whether the compiler produces plans that COULD
 * pass — necessary, not sufficient.
 */
const here = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(here, "..", "prompts", "testcases.jsonl");
const CATALOG = join(here, "..", "..", "procol-ui-tests", "plan-catalog.json");

interface Case {
  id: string;
  testCase: string;
  /** Steps the plan must contain to be testing what was asked. */
  mustInclude?: string[];
  /** Steps that would mean it misunderstood. */
  mustExclude?: string[];
  note?: string;
}

const names: string[] = JSON.parse(readFileSync(CATALOG, "utf8")).names;

/** Structural rules a runnable plan must satisfy, independent of the test case. */
function invariants(plan: TestPlan): string[] {
  const steps = plan.steps.map((s) => s.step);
  const has = (n: string) => steps.includes(n);
  const at = (n: string) => steps.indexOf(n);
  const problems: string[] = [];

  for (const s of steps) if (!names.includes(s)) problems.push(`unknown step "${s}"`);
  if (steps[0] !== "open_create") problems.push("does not start with open_create");
  if (!has("set_title")) problems.push("never sets a title");
  if (has("add_line_items") && !has("select_template")) problems.push("adds line items with no template");
  if (has("add_line_items") && has("select_template") && at("select_template") > at("add_line_items"))
    problems.push("selects the template after adding line items");
  if (has("publish")) {
    if (!has("set_schedule")) problems.push("publishes without committing the schedule");
    if (!has("invite_vendor")) problems.push("publishes with no participants");
    if (at("set_schedule") > at("publish")) problems.push("saves the schedule after publishing");
  }
  const stages = (plan.steps.find((s) => s.step === "compose_stages")?.args?.stages as string[] | undefined) ?? [];
  if (stages.length > 1) {
    const switches = steps.filter((s) => s === "switch_stage").length;
    const templates = steps.filter((s) => s === "select_template").length;
    if (switches < stages.length) problems.push(`${stages.length} stages but only ${switches} switch_stage`);
    if (templates < stages.length) problems.push(`${stages.length} stages but only ${templates} select_template`);
  }
  if (stages.includes("rfp")) {
    if (!has("fill_questionnaires")) problems.push("technical stage without fill_questionnaires");
    if (!has("assign_evaluator")) problems.push("technical stage without assign_evaluator");
  }
  if (stages.includes("rfq") && stages.includes("auction")) problems.push("RFQ and Auction cannot coexist");
  return problems;
}

const cases: Case[] = readFileSync(CORPUS, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

console.log(`Compiling ${cases.length} test cases · ${providerLabel()}\n`);

let clean = 0;
let repaired = 0;
let broken = 0;
const results: unknown[] = [];

for (const c of cases) {
  let compiled;
  try {
    compiled = await compileTestCase(c.testCase);
  } catch (e) {
    console.log(`BROKEN ${c.id}: compiler threw — ${(e as Error).message}`);
    broken++;
    continue;
  }
  const problems = invariants(compiled.plan);
  const steps = compiled.plan.steps.map((s) => s.step);
  const missing = (c.mustInclude ?? []).filter((s) => !steps.includes(s));
  const forbidden = (c.mustExclude ?? []).filter((s) => steps.includes(s));
  const repairs = compiled.warnings.filter((w) => w.startsWith("added") || w.startsWith("rebuilt"));

  // A fallback plan is not the compiler working — count it as a failure even
  // when the generic plan happens to be structurally valid, or the score
  // measures the fallback rather than the thing under test.
  const fellBack = compiled.source === "fallback";
  const ok = !problems.length && !missing.length && !forbidden.length && !fellBack;
  if (!ok) {
    broken++;
    console.log(`FAIL  ${c.id}  ${c.testCase.slice(0, 60)}`);
    for (const p of problems) console.log(`        invariant: ${p}`);
    if (missing.length) console.log(`        missing: ${missing.join(", ")}`);
    if (forbidden.length) console.log(`        should not contain: ${forbidden.join(", ")}`);
    if (fellBack) console.log(`        the model was unreachable — this is the generic fallback, not a compiled plan`);
    console.log(`        plan: ${steps.join(" -> ")}`);
  } else if (repairs.length) {
    repaired++;
  } else {
    clean++;
  }
  results.push({ id: c.id, ok, problems, missing, forbidden, repairs, steps, source: compiled.source });
  await new Promise((r) => setTimeout(r, 1_500)); // free-tier friendly
}

const total = cases.length;
const runnable = clean + repaired;
console.log(`
Total test cases:      ${total}
Runnable plans:        ${((runnable / total) * 100).toFixed(1)}%  (${runnable}/${total})
  compiled clean:      ${clean}
  needed repair:       ${repaired}   (the linter fixed these; the compiler should not have needed it)
Not runnable:          ${broken}
`);

writeFileSync(join(here, "..", "prompts", "last-planner-eval.json"), JSON.stringify(results, null, 2));
const min = Number(process.env.EVAL_MIN_RUNNABLE ?? 0.9);
if (runnable / total < min) {
  console.log(`FAIL: ${(runnable / total * 100).toFixed(1)}% runnable is below the ${(min * 100).toFixed(0)}% threshold.`);
  process.exit(1);
}
console.log(`OK: ${(runnable / total * 100).toFixed(1)}% of test cases compiled into runnable plans.`);
