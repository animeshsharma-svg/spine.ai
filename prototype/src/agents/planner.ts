import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chat, llmMode } from "../ai/llm.js";
import { recall } from "../rag/knowledgeBase.js";

const here = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = join(here, "..", "..", "..", "procol-ui-tests", "plan-catalog.json");

/**
 * THE COMPILER — turns a test case written in English into a runnable plan.
 *
 * This is the piece that makes a written test case executable. It is a
 * COMPILER, not a code generator: the output is a list of steps drawn from a
 * fixed vocabulary the executor already implements, and a step the executor
 * does not have is rejected before anything runs. A model that can only choose
 * from verbs the machine can actually perform cannot produce a run that
 * silently tests nothing.
 *
 * It plans with the QA memory in hand — the mined rules for the area under
 * test, and what has broken there before — because the ordering constraints on
 * this product are not guessable. A template must precede line items; a
 * technical stage needs its questionnaires and an evaluator; the schedule must
 * be committed before publish. A model told none of that writes a plausible
 * plan that fails on step three.
 */

export interface StepSpec {
  name: string;
  purpose: string;
  args?: Record<string, string>;
  assertion?: boolean;
}

export interface PlanStep {
  step: string;
  args?: Record<string, unknown>;
  note?: string;
}

export interface TestPlan {
  title: string;
  steps: PlanStep[];
}

export interface CompileResult {
  plan: TestPlan;
  /** Why the compiler shaped the plan this way — shown in the run log. */
  reasoning: string;
  /** The memory it consulted, so a reader can see what informed the plan. */
  context: { expectations: string[]; experience: string[] };
  source: "llm" | "fallback";
  warnings: string[];
}

function loadCatalog(): { steps: StepSpec[]; names: string[] } {
  if (!existsSync(CATALOG_PATH)) {
    throw new Error(
      `the step vocabulary is missing at ${CATALOG_PATH} — run ` +
        "`npx tsx scripts/dump-plan-catalog.ts` in procol-ui-tests to publish it",
    );
  }
  return JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
}

function catalogForPrompt(steps: StepSpec[]): string {
  return steps
    .map((s) => {
      const args = s.args
        ? " ARGS: " + Object.entries(s.args).map(([k, v]) => `${k} = ${v}`).join("; ")
        : " (no arguments)";
      return `- ${s.name}${s.assertion ? " [assertion]" : ""}: ${s.purpose}${args}`;
    })
    .join("\n");
}

/**
 * Ordering rules the product enforces and no model could infer.
 * Every one of these was learned the hard way against the live app.
 */
/**
 * The vendor account the framework can actually sign in as.
 *
 * A vendor-portal bid needs credentials, and only this account has them
 * configured — so a plan that invites "some vendor" and then tries to sign in
 * as them cannot work.
 */
const DEFAULT_VENDOR = process.env.UI_DEFAULT_VENDOR ?? "AMD";

const DOMAIN_RULES = `
Ordering the product enforces (violating any of these makes the run fail):
- open_create must come first. Use path "erfx" unless the test explicitly says single-stage or non-eRFX: the eRFX screen is the one with stage tabs.
- compose_stages, switch_stage and expect_stages EXIST ONLY on the eRFX screen. The single-stage screen has no stage tabs — its event type is chosen in a configuration drawer — so never combine path "single-stage" with those steps.
- set_title is MANDATORY on every create test. Publishing without a title is refused, and the title is how a human finds the event afterwards. Include it even when the test case does not mention naming the event.
- The default stage is AUCTION. So: a test about an RFQ, a technical/RFP stage, or any two-stage event MUST call compose_stages. Only a plain auction test may omit it.
- compose_stages before anything stage-specific. The screen starts with ONE Auction stage; asking for RFQ or a technical stage is a real change. RFQ and Auction cannot coexist. At most two stages.
- select_template BEFORE add_line_items: the Items drawer is inert until a template is chosen.
- fill_sheet after add_line_items.
- On a technical (rfp) stage: fill_questionnaires AND assign_evaluator, or publish is refused.
- set_schedule before publish: the schedule looks set but is not committed until saved.
- invite_vendor before publish: an event with no participants is not a usable event.
- On a MULTI-STAGE event, every stage needs its own configuration on its own tab: switch_stage, then select_template, then fill_sheet (rfq/auction) or fill_questionnaires + assign_evaluator (rfp). A template applies only to the tab that is showing.
- Line items are project-level: add them once, on the first stage.
- NEVER invent a vendor name. Use a name only if the test case itself names one. When it just says "a vendor" or "two vendors", set count on invite_vendor and leave vendors out, and leave vendor out of the bid steps — the product's own audience supplies them.
- Bidding needs a PUBLISHED event: publish first, then bid.
- Two different things are called "bidding" and the test case tells you which:
  * the VENDOR bidding for themselves -> place_bid. It signs into the vendor portal, so the vendor must have been invited BY NAME: invite_vendor{vendors:["<name>"]}.
  * the BUYER bidding on a vendor's behalf (surrogate) -> place_surrogate_bid. It never leaves the console. Unavailable for knockout and dutch auctions and for technical stages.
- "on behalf of", "surrogate", "for the vendor" mean place_surrogate_bid. "as the vendor", "from the vendor portal", "from the supplier hub", "the vendor submits", "the vendor logs in" mean place_bid. If the test mentions bidding AT ALL, one of these two steps must be in the plan.
- Follow either with expect_bid_submitted when the test asserts the bid landed.
- Assertions go immediately after the step they check.
`.trim();

const SYSTEM = `You compile QA test cases into runnable plans for Procol, a B2B procurement product.

Reply with ONLY a JSON object, no prose and no code fence:
{"title":"<short name for this test>","reasoning":"<2 sentences: what you are testing and why the plan is shaped this way>","steps":[{"step":"<name from the catalog>","args":{...},"note":"<why this step>"}]}

Rules:
- Use ONLY step names from the catalog. Never invent one. If the test case asks for something no step covers, leave it out and say so in reasoning.
- Include the assertions the test case implies. A test that acts but never checks proves nothing.
- Omit args you have no value for rather than inventing one; the executor has sensible defaults.
- Prefer the shortest plan that genuinely tests what was asked.`;

/** No LLM key: a sane default plan for the commonest case. */
function fallbackPlan(testCase: string): TestPlan {
  const items = Number(testCase.match(/(\d+)\s*(?:line\s*items?|products?|items?)/i)?.[1] ?? 1);
  const technical = /technical|rfp/i.test(testCase);
  const steps: PlanStep[] = [
    { step: "open_create", args: { path: "erfx" } },
    { step: "compose_stages", args: { stages: [technical ? "rfp" : "rfq"] } },
    { step: "set_title" },
    { step: "select_template" },
    { step: "add_line_items", args: { count: items } },
    { step: "expect_line_items", args: { count: items } },
  ];
  if (technical) steps.push({ step: "fill_questionnaires" }, { step: "assign_evaluator" });
  else steps.push({ step: "fill_sheet" });
  steps.push({ step: "set_schedule" }, { step: "invite_vendor" }, { step: "publish" }, { step: "expect_published" });
  return { title: testCase.slice(0, 60), steps };
}

/**
 * Repair a plan against the invariants the product enforces.
 *
 * The model is told the ordering rules and mostly follows them, but "mostly"
 * is not a property you want in a test runner: a plan missing `set_title` or
 * `fill_sheet` fails at publish, and the failure looks like a product defect
 * rather than a plan that was never going to work. So the invariants are
 * checked deterministically and the missing steps inserted, with a warning
 * naming each repair — silent correction would hide a compiler that needs
 * improving.
 */
export function lintPlan(plan: TestPlan, testCase = ""): { plan: TestPlan; repairs: string[] } {
  const steps = [...plan.steps];
  const repairs: string[] = [];
  const has = (name: string) => steps.some((s) => s.step === name);
  const indexOf = (name: string) => steps.findIndex((s) => s.step === name);
  const insertBefore = (name: string, step: PlanStep, why: string) => {
    const at = indexOf(name);
    steps.splice(at < 0 ? steps.length : at, 0, step);
    repairs.push(why);
  };

  // The default stage is Auction, so a plan that never composes stages is
  // testing an auction whatever the test case says. Asking for an RFQ or a
  // technical stage and getting an auction is the quietest possible wrong
  // answer: everything passes, and the thing under test was never on screen.
  if (!has("compose_stages") && /\brfq\b|technical|\brfp\b/i.test(testCase)) {
    const wanted: string[] = [];
    if (/technical|\brfp\b/i.test(testCase)) wanted.push("rfp");
    if (/\brfq\b/i.test(testCase)) wanted.push("rfq");
    steps.unshift({ step: "compose_stages", args: { stages: wanted } });
    repairs.push(`added compose_stages(${wanted.join(", ")}) — the screen defaults to an Auction stage, so this test would have run against the wrong stage`);
  }

  if (!has("open_create")) {
    steps.unshift({ step: "open_create", args: { path: "erfx" } });
    repairs.push("added open_create — every create test has to start somewhere");
  } else if (indexOf("open_create") !== 0) {
    // Present but not first. Every other step acts on the create screen, so
    // anything before it runs against whatever page happens to be open.
    const [open] = steps.splice(indexOf("open_create"), 1);
    steps.unshift(open);
    repairs.push("moved open_create to the front — the steps before it had no create screen to act on");
  }

  // Stage steps only exist on the eRFX screen. Pairing them with the
  // single-stage path fails on step two with "the create screen shows [none]",
  // which reads like a broken reconciler rather than the wrong screen.
  const openStep = steps.find((s) => s.step === "open_create");
  const stageSteps = ["compose_stages", "switch_stage", "expect_stages"];
  const usesStages = steps.some((s) => stageSteps.includes(s.step));
  if (usesStages && String(openStep?.args?.path ?? "") === "single-stage") {
    if (/single[- ]stage|non-?erfx/i.test(testCase)) {
      for (let i = steps.length - 1; i >= 0; i--) if (stageSteps.includes(steps[i].step)) steps.splice(i, 1);
      repairs.push("dropped the stage steps — the single-stage screen has no stage tabs, its event type is set in a drawer");
    } else {
      openStep!.args = { ...(openStep!.args ?? {}), path: "erfx" };
      repairs.push('switched open_create to the eRFX screen — the plan composes stages, which only that screen has');
    }
  }

  // RFQ and Auction are mutually exclusive (isValidStage). A plan asking for
  // both can never run, so keep whichever the test actually named.
  const compose = steps.find((s) => s.step === "compose_stages");
  const asked = (compose?.args?.stages as string[] | undefined) ?? [];
  if (asked.includes("rfq") && asked.includes("auction")) {
    const keep = /\bauction\b/i.test(testCase) && !/\brfq\b/i.test(testCase) ? "auction" : "rfq";
    compose!.args = { ...(compose!.args ?? {}), stages: asked.filter((x) => x === keep || x === "rfp") };
    repairs.push(`dropped the other trade stage — the product forbids RFQ and Auction together, so kept ${keep}`);
  }

  // Strip invented vendor names. A name the test case never mentions cannot be
  // matched against a real audience: the invite falls back silently and the bid
  // then searches for a company that does not exist. Keeping only names the
  // test actually used makes fabrication impossible rather than unlikely.
  const mentions = (name: string) => testCase.toLowerCase().includes(name.trim().toLowerCase());
  for (const step of steps) {
    if (step.step === "invite_vendor" && Array.isArray(step.args?.vendors)) {
      const given = (step.args!.vendors as unknown[]).map(String);
      const real = given.filter(mentions);
      if (real.length !== given.length) {
        const dropped = given.filter((n) => !real.includes(n));
        if (real.length) step.args!.vendors = real;
        else delete step.args!.vendors;
        if (!step.args!.count) step.args!.count = given.length;
        repairs.push(
          `dropped invented vendor name(s) ${dropped.join(", ")} — the test case never named them, so the product's audience supplies the vendors instead`,
        );
      }
    }
    if ((step.step === "place_bid" || step.step === "place_surrogate_bid") && step.args?.vendor) {
      if (!mentions(String(step.args.vendor))) {
        const bad = String(step.args.vendor);
        delete step.args.vendor;
        repairs.push(`dropped invented vendor name ${bad} from ${step.step} — it will bid for whoever is on the event`);
      }
    }
  }

  // The two kinds of bidding are easy to confuse and mean different things.
  // The test case says which, so honour the words rather than the model's pick.
  const wantsSurrogate = /surrogate|on (their|the vendor's|his|her) behalf|on behalf of/i.test(testCase);
  const wantsVendorSide = /vendor portal|supplier hub|as the vendor|vendor logs? in|vendor (themselves|submits)/i.test(testCase);
  if (wantsSurrogate && has("place_bid")) {
    steps[indexOf("place_bid")] = { step: "place_surrogate_bid", note: "the test asks the buyer to bid on the vendor's behalf" };
    repairs.push("swapped place_bid for place_surrogate_bid — the test asks the BUYER to bid for the vendor, which never leaves the console");
  }
  if (wantsVendorSide && !wantsSurrogate && has("place_surrogate_bid")) {
    steps[indexOf("place_surrogate_bid")] = { step: "place_bid", note: "the test asks the vendor to bid for themselves" };
    repairs.push("swapped place_surrogate_bid for place_bid — the test asks the VENDOR to sign in and bid");
  }
  if ((wantsSurrogate || wantsVendorSide) && !has("place_bid") && !has("place_surrogate_bid")) {
    const step = wantsSurrogate ? "place_surrogate_bid" : "place_bid";
    const at = has("expect_published") ? indexOf("expect_published") + 1 : has("publish") ? indexOf("publish") + 1 : steps.length;
    steps.splice(at, 0, { step });
    repairs.push(`added ${step} — the test is about bidding and no bid step was planned`);
  }

  // A nameless event is refused at publish, and the title is also how a human
  // finds the event afterwards.
  if (!has("set_title")) {
    const after = Math.max(indexOf("open_create"), indexOf("compose_stages"));
    steps.splice(after + 1, 0, { step: "set_title" });
    repairs.push("added set_title — publishing without a title is refused");
  }

  // The Items drawer is inert until a template exists.
  if (has("add_line_items") && !has("select_template")) {
    insertBefore("add_line_items", { step: "select_template" }, "added select_template — the Items drawer stays inert without one");
  }

  const stages = (steps.find((s) => s.step === "compose_stages")?.args?.stages as string[] | undefined) ?? [];
  const wantsTrade = !stages.length || stages.some((s) => s === "rfq" || s === "auction");
  const wantsTechnical = stages.includes("rfp");

  // A plan asserting publish is BLOCKED is deliberately incomplete — repairing
  // it into a valid event would remove the precondition under test.
  const submits = (has("publish") || has("save_draft")) && !has("expect_publish_blocked");
  if (stages.length > 1 && submits) {
    // Every stage needs configuring on its OWN tab: template, sheet,
    // questionnaires and evaluator all act on whichever tab is showing. A
    // two-stage plan with a single select_template leaves the other stage
    // template-less, and the app then refuses at publish with "Please select a
    // valid column for savings" — which reads as a savings bug and is really a
    // missing template. Rebuild the per-stage section so each is complete.
    const firstConfig = steps.findIndex((s) =>
      ["select_template", "add_line_items", "fill_sheet", "fill_questionnaires", "assign_evaluator", "switch_stage"].includes(
        s.step,
      ),
    );
    const tailStart = steps.findIndex((s) => ["set_schedule", "invite_vendor", "publish", "save_draft"].includes(s.step));
    if (firstConfig >= 0 && (tailStart < 0 || tailStart > firstConfig)) {
      const head = steps.slice(0, firstConfig);
      const tail = tailStart >= 0 ? steps.slice(tailStart) : [];
      const lineItems = steps.find((s) => s.step === "add_line_items");
      const lineItemCheck = steps.find((s) => s.step === "expect_line_items");

      const rebuilt: PlanStep[] = [...head];
      stages.forEach((stage, i) => {
        rebuilt.push({ step: "switch_stage", args: { stage }, note: `configure the ${stage} stage on its own tab` });
        rebuilt.push({ step: "select_template", note: `${stage} needs its own template` });
        // Line items are project-level: added once, on the first stage.
        if (i === 0 && lineItems) {
          rebuilt.push(lineItems);
          if (lineItemCheck) rebuilt.push(lineItemCheck);
        }
        if (stage === "rfp") {
          rebuilt.push({ step: "fill_questionnaires" }, { step: "assign_evaluator" });
        } else {
          rebuilt.push({ step: "fill_sheet" });
        }
      });
      rebuilt.push(...tail);
      steps.length = 0;
      steps.push(...rebuilt);
      repairs.push(
        `rebuilt the plan for ${stages.length} stages — each stage is configured on its own tab, since a template applies only to the tab showing`,
      );
    }
  }

  if (stages.length <= 1 && submits) {
    if (wantsTrade && has("add_line_items") && !has("fill_sheet")) {
      const at = indexOf("expect_line_items") >= 0 ? indexOf("expect_line_items") + 1 : indexOf("add_line_items") + 1;
      steps.splice(at, 0, { step: "fill_sheet" });
      repairs.push("added fill_sheet — a pricing stage will not publish with an unfilled sheet");
    }
    if (wantsTechnical && !has("fill_questionnaires")) {
      insertBefore("publish", { step: "fill_questionnaires" }, "added fill_questionnaires — a technical stage will not publish with empty questionnaires");
    }
    if (wantsTechnical && !has("assign_evaluator")) {
      insertBefore("publish", { step: "assign_evaluator" }, "added assign_evaluator — a technical stage needs one");
    }
  }

  if (has("publish")) {
    if (!has("set_schedule")) insertBefore("publish", { step: "set_schedule" }, "added set_schedule — the schedule is displayed but not committed until saved");
    if (!has("invite_vendor")) insertBefore("publish", { step: "invite_vendor" }, "added invite_vendor — an event with no participants cannot be bid on");
  }

  // Bidding needs something to bid on, and the vendor portal needs to know
  // WHICH vendor. A bid step before publish, or with an anonymous audience,
  // fails in a way that looks like a bidding defect.
  const bidAt = Math.max(indexOf("place_bid"), indexOf("place_surrogate_bid"));
  if (bidAt >= 0) {
    if (!has("publish")) {
      steps.splice(bidAt, 0, { step: "publish" });
      repairs.push("added publish — a bid needs a published event to bid on");
    } else if (indexOf("publish") > bidAt) {
      const [bid] = steps.splice(bidAt, 1);
      steps.splice(indexOf("publish") + 1, 0, bid);
      repairs.push(`moved ${bid.step} after publish — bidding on an unpublished event is not possible`);
    }
    if (has("place_bid")) {
      const invite = steps.find((s) => s.step === "invite_vendor");
      const named = Array.isArray(invite?.args?.vendors) && (invite!.args!.vendors as unknown[]).length > 0;
      if (invite && !named) {
        invite.args = { ...(invite.args ?? {}), vendors: [DEFAULT_VENDOR] };
        repairs.push(
          `named ${DEFAULT_VENDOR} on invite_vendor — place_bid signs into the vendor portal, so the invited vendor cannot be whoever the audience happened to contain`,
        );
      }
    }
  }

  return { plan: { ...plan, steps }, repairs };
}

const KNOWLEDGE_DIR = join(here, "..", "..", "knowledge");

/**
 * Expand a case id into the case itself.
 *
 * The catalogs hold 296 cases with ids like `FE-9.7` and `BE-2.11`, and typing
 * the id is how a tester actually refers to one. Compiling the literal string
 * "FE-9.7" would produce a plan for nothing, so the id is resolved to its
 * title, steps and expected result first — which also hands the compiler a far
 * better specification than a sentence someone typed from memory.
 */
export function resolveCaseId(input: string): { text: string; id: string } | null {
  const id = input.trim().match(/^((?:FE|BE|PR)-[\w.-]+)$/i)?.[1];
  if (!id) return null;
  if (!existsSync(KNOWLEDGE_DIR)) return null;

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".json")) files.push(full);
    }
  };
  walk(KNOWLEDGE_DIR);

  for (const f of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(f, "utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    const found = (parsed as Array<Record<string, any>>).find(
      (c) => String(c.id ?? "").toLowerCase() === id.toLowerCase(),
    );
    if (!found) continue;
    const parts = [
      found.title,
      found.preconditions?.length ? `Given: ${found.preconditions.join("; ")}` : "",
      found.steps?.length ? `Steps: ${found.steps.join(" then ")}` : "",
      found.expected ? `Expected: ${typeof found.expected === "string" ? found.expected : JSON.stringify(found.expected)}` : "",
      found.oracle?.detail ? `Check: ${found.oracle.detail}` : "",
    ].filter(Boolean);
    return { text: parts.join(". "), id: String(found.id) };
  }
  return null;
}

export async function compileTestCase(testCase: string, moduleHint = "events"): Promise<CompileResult> {
  const catalog = loadCatalog();
  const warnings: string[] = [];

  // "FE-9.7" is a reference, not a test case. Resolve it before planning.
  const resolved = resolveCaseId(testCase);
  if (resolved) {
    warnings.push(`resolved ${resolved.id} from the test-case catalog`);
    testCase = `${resolved.id}: ${resolved.text}`;
  } else if (/^(?:FE|BE|PR)-[\w.-]+$/i.test(testCase.trim())) {
    warnings.push(`no case with id "${testCase.trim()}" exists in the catalog — planned from the text as written`);
  }

  // Ground the plan in what the platform knows about this area.
  let expectations: string[] = [];
  let experience: string[] = [];
  try {
    const memory = await recall(testCase, moduleHint, 5);
    expectations = memory.expectations.map((r) => r.text.slice(0, 300));
    experience = memory.experience.map((r) => r.text.slice(0, 300));
  } catch {
    warnings.push("the QA memory is not built, so the plan was written without it — run `npm run rag:build`");
  }

  if (llmMode() === "fallback") {
    warnings.push("no LLM key is set, so a default plan was used rather than one compiled from your test case");
    return {
      plan: fallbackPlan(testCase),
      reasoning: "Compiled without a language model: a standard create-and-publish plan shaped by the words in the test case.",
      context: { expectations, experience },
      source: "fallback",
      warnings,
    };
  }

  const prompt = [
    `STEP CATALOG:\n${catalogForPrompt(catalog.steps)}`,
    DOMAIN_RULES,
    expectations.length ? `WHAT THE RULES SAY ABOUT THIS AREA:\n${expectations.map((e) => `- ${e}`).join("\n")}` : "",
    experience.length ? `WHAT HAS BROKEN HERE BEFORE (worth asserting):\n${experience.map((e) => `- ${e}`).join("\n")}` : "",
    `TEST CASE:\n${testCase}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // Retry with backoff. A free-tier rate limit that quietly degrades into the
  // generic fallback plan is the worst failure mode available here: the run
  // still goes green-ish and nobody can tell the compiler never ran. Three
  // attempts, and if all fail the fallback is used AND said out loud.
  let raw = "";
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      raw = await chat([{ role: "system", content: SYSTEM }, { role: "user", content: prompt }], {
        temperature: 0,
        // Generous: a plan is ~600 tokens of JSON, and the model needs headroom
        // for its reasoning pass before it writes any of it.
        maxTokens: 3_000,
      });
      if (raw.trim()) {
        lastErr = undefined;
        break;
      }
      lastErr = new Error("the model returned nothing");
    } catch (e) {
      lastErr = e;
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2_000));
  }
  if (lastErr || !raw.trim()) {
    warnings.push(
      `the model could not be reached after 3 attempts (${
        lastErr instanceof Error ? lastErr.message : "empty response"
      }) — this plan is the generic default, NOT compiled from your test case`,
    );
    return { plan: fallbackPlan(testCase), reasoning: "Model unavailable.", context: { expectations, experience }, source: "fallback", warnings };
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    warnings.push("the model did not return JSON — used a default plan instead");
    return { plan: fallbackPlan(testCase), reasoning: "Unparseable model output.", context: { expectations, experience }, source: "fallback", warnings };
  }

  let parsed: { title?: string; reasoning?: string; steps?: PlanStep[] };
  try {
    parsed = JSON.parse(match[0]);
  } catch (e) {
    warnings.push(`the model's JSON was malformed (${(e as Error).message}) — used a default plan instead`);
    return { plan: fallbackPlan(testCase), reasoning: "Malformed model output.", context: { expectations, experience }, source: "fallback", warnings };
  }

  // Drop steps the executor does not have rather than failing the whole plan:
  // a model that invents one step usually got the rest right, and saying which
  // step was discarded is more useful than refusing outright.
  const known = new Set(catalog.names);
  const steps = (parsed.steps ?? []).filter((s) => {
    if (known.has(s?.step)) return true;
    warnings.push(`dropped "${s?.step}" — no such step exists`);
    return false;
  });

  if (!steps.length) {
    warnings.push("the model produced no runnable steps — used a default plan instead");
    return { plan: fallbackPlan(testCase), reasoning: "No usable steps.", context: { expectations, experience }, source: "fallback", warnings };
  }

  const linted = lintPlan({ title: String(parsed.title ?? testCase.slice(0, 60)), steps }, testCase);
  warnings.push(...linted.repairs);
  return {
    plan: linted.plan,
    reasoning: String(parsed.reasoning ?? ""),
    context: { expectations, experience },
    source: "llm",
    warnings,
  };
}
