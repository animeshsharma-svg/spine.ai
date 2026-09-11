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
  /** At least one of these must appear — for cases with more than one right answer. */
  mustAnyOf?: string[];
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

  // A plan about the events LIST is a different shape, and demanding
  // open_create/set_title of it was this check assuming every test is a create
  // test. It must still assert something, or it proves nothing.
  if (steps[0] === "open_events_list") {
    if (!has("expect_events_list") && !has("expect_no_error")) {
      problems.push("opens the events list and asserts nothing about it");
    }
    return problems;
  }
  if (has("open_events_list")) problems.push("mixes the events list into a create plan");

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
  // Per-stage configuration is only required by a plan that SUBMITS. A test
  // about stage composition, or one asserting the app refuses something, is
  // complete without a template on every tab — demanding one there made every
  // negative test look broken.
  // A plan that expects publishing to be BLOCKED is deliberately incomplete —
  // that is the test. Requiring it to configure every stage would defeat the
  // very precondition it is checking.
  const submits = (has("publish") || has("save_draft")) && !has("expect_publish_blocked");
  if (stages.length > 1 && submits) {
    const switches = steps.filter((s) => s === "switch_stage").length;
    const templates = steps.filter((s) => s === "select_template").length;
    if (switches < stages.length) problems.push(`${stages.length} stages but only ${switches} switch_stage`);
    if (templates < stages.length) problems.push(`${stages.length} stages but only ${templates} select_template`);
  }
  if (stages.includes("rfp") && submits) {
    if (!has("fill_questionnaires")) problems.push("technical stage without fill_questionnaires");
    if (!has("assign_evaluator")) problems.push("technical stage without assign_evaluator");
  }
  if (stages.includes("rfq") && stages.includes("auction")) problems.push("RFQ and Auction cannot coexist");

  // Bidding needs a published event, and the vendor-portal route needs a named
  // vendor because it has to sign in as that company.
  const bidAt = Math.max(at("place_bid"), at("place_surrogate_bid"));
  if (bidAt >= 0) {
    if (!has("publish")) problems.push("bids without publishing anything");
    else if (at("publish") > bidAt) problems.push("bids before publishing");
    if (has("place_bid")) {
      const invite = plan.steps.find((s) => s.step === "invite_vendor");
      const named = Array.isArray(invite?.args?.vendors) && (invite!.args!.vendors as unknown[]).length > 0;
      if (!named) problems.push("place_bid without naming the vendor to sign in as");
    }
  }
  if (has("expect_bid_submitted") && bidAt < 0) problems.push("asserts a bid was submitted without placing one");

  // The stage steps only exist on the eRFX screen.
  const openArgs = plan.steps.find((s) => s.step === "open_create")?.args ?? {};
  if (String(openArgs.path ?? "") === "single-stage" && steps.some((s) => ["compose_stages", "switch_stage", "expect_stages"].includes(s))) {
    problems.push("composes stages on the single-stage screen, which has no stage tabs");
  }
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
  if (c.mustAnyOf?.length && !c.mustAnyOf.some((s) => steps.includes(s))) {
    missing.push(`one of: ${c.mustAnyOf.join(" / ")}`);
  }
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
