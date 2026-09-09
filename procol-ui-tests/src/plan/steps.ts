/**
 * THE STEP VOCABULARY — what a test case is allowed to ask for.
 *
 * This is the contract between the AI and the automation. A test case written
 * in English is compiled into a list of these steps, and only these steps ever
 * execute. That boundary is the whole point:
 *
 *   - The AI decides WHAT to do. It has real freedom — which journey, which
 *     template, how many line items, what to assert, in what order.
 *   - The automation owns HOW. Each step is the same deterministic, healed,
 *     self-verifying code the hand-written journeys use.
 *
 * The alternative — letting a model write Playwright and running it — fails in
 * a way that matters here: generated code that half-works produces a green run
 * that tested nothing, and you cannot tell from the outside. A step that does
 * not exist is refused at compile time instead.
 *
 * Adding a capability is one entry here plus one case in the executor, and the
 * AI can use it immediately — that is what makes every field dynamic.
 */

export type StageKeyLike = "rfp" | "rfq" | "auction";

export interface StepSpec {
  /** What the step is called in a plan. */
  name: string;
  /** One line, written for the model: when to use this and what it does. */
  purpose: string;
  /** Argument names and how to fill them, again written for the model. */
  args?: Record<string, string>;
  /** True when the step asserts rather than acts — used to shape the report. */
  assertion?: boolean;
}

export const STEP_CATALOG: StepSpec[] = [
  {
    name: "open_create",
    purpose: "Open the event-create screen. Always the first step of a create test.",
    args: { path: '"erfx" (multi-stage project, the default), "single-stage", or "boq"' },
  },
  {
    name: "compose_stages",
    purpose:
      "Set the stages exactly. RFQ and Auction cannot coexist; at most two stages. Auction is the default stage, so asking for anything else is a real change.",
    args: { stages: 'array of "rfp" | "rfq" | "auction", e.g. ["rfp","rfq"]' },
  },
  { name: "set_title", purpose: "Give the event a title.", args: { title: "string; omit to auto-generate a unique one" } },
  {
    name: "switch_stage",
    purpose:
      "Move to a stage's tab. Required on a multi-stage event: template, sheet, questionnaires and evaluator all apply to the CURRENT tab only, so each stage must be configured on its own tab.",
    args: { stage: '"rfp" | "rfq" | "auction"' },
  },
  {
    name: "select_template",
    purpose: "Pick the stage's pricing template. Required before line items can be added.",
    args: { name: "substring of the template name; omit to take the first offered" },
  },
  {
    name: "add_line_items",
    purpose: "Add line items through the Manage Line Items drawer.",
    args: { count: "how many (1-50)", search: "optional product search text to use for all of them" },
  },
  { name: "fill_sheet", purpose: "Fill the pricing sheet for every line item on screen." },
  {
    name: "fill_questionnaires",
    purpose:
      "Technical stages only: give every RFI section (the global Vendor Assessment and one per line item) a template and fill blank questions.",
  },
  { name: "assign_evaluator", purpose: "Technical stages only: assign an evaluator to every control that needs one." },
  {
    name: "set_schedule",
    purpose: "Open the schedule drawer and commit it. Needed before publish.",
    args: { minutes: "optional event duration in minutes" },
  },
  { name: "invite_vendor", purpose: "Ensure the event has participants, adding one if the audience is empty." },
  { name: "publish", purpose: "Publish the event and wait for the outcome." },
  { name: "save_draft", purpose: "Save as draft instead of publishing." },
  {
    name: "expect_line_items",
    purpose: "Assert the toolbar badge shows this many line items.",
    args: { count: "expected number" },
    assertion: true,
  },
  {
    name: "expect_published",
    purpose: "Assert the browser reached a real project page with an id.",
    assertion: true,
  },
  {
    name: "expect_no_error",
    purpose: "Assert the application showed no error message.",
    assertion: true,
  },
  {
    name: "expect_error",
    purpose: "Assert the application DID refuse, optionally matching its wording. Use for negative tests.",
    args: { contains: "optional substring the message must contain" },
    assertion: true,
  },
  {
    name: "expect_publish_blocked",
    purpose:
      "Assert the event CANNOT be published yet: press Publish and confirm either the confirm button is disabled or the app refuses. Use for tests about a precondition not being met.",
    args: { because: "optional substring of the message you expect" },
    assertion: true,
  },
  {
    name: "expect_stages",
    purpose: "Assert exactly these stage tabs are present.",
    args: { stages: 'array of "rfp" | "rfq" | "auction"' },
    assertion: true,
  },
];

export const STEP_NAMES = STEP_CATALOG.map((s) => s.name);

export interface PlanStep {
  step: string;
  args?: Record<string, unknown>;
  /** Why the compiler chose this step — carried into the run log. */
  note?: string;
}

export interface TestPlan {
  title: string;
  steps: PlanStep[];
}

/** A plan is only runnable if every step exists. Reject, never improvise. */
export function validatePlan(plan: unknown): { ok: true; plan: TestPlan } | { ok: false; reason: string } {
  if (!plan || typeof plan !== "object") return { ok: false, reason: "plan is not an object" };
  const p = plan as Partial<TestPlan>;
  if (!Array.isArray(p.steps) || !p.steps.length) return { ok: false, reason: "plan has no steps" };
  const unknown = p.steps
    .map((s) => (s as PlanStep)?.step)
    .filter((name) => !STEP_NAMES.includes(String(name)));
  if (unknown.length) {
    return {
      ok: false,
      reason: `plan asks for step(s) that do not exist: ${unknown.join(", ")}. Available: ${STEP_NAMES.join(", ")}`,
    };
  }
  return { ok: true, plan: { title: String(p.title ?? "Untitled test"), steps: p.steps as PlanStep[] } };
}

/** The catalog rendered for a prompt — the model's menu of what it may ask for. */
export function catalogForPrompt(): string {
  return STEP_CATALOG.map((s) => {
    const args = s.args
      ? " ARGS: " + Object.entries(s.args).map(([k, v]) => `${k} = ${v}`).join("; ")
      : " (no arguments)";
    return `- ${s.name}${s.assertion ? " [assertion]" : ""}: ${s.purpose}${args}`;
  }).join("\n");
}
