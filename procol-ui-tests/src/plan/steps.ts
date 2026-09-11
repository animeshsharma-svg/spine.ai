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
    // Without this step the compiler had nowhere to put "open the events
    // list": asked for a case about the LIST it reached for open_create, and
    // the plan passed while testing the create screen instead. A plan that
    // silently tests the wrong screen is worse than one that refuses to
    // compile, so the vocabulary has to be able to say this.
    name: "open_events_list",
    purpose:
      "Open the events list at /orders. Use this — not open_create — for any test about the list itself: its rows, filters, tabs, or the Create Event control.",
  },
  {
    name: "expect_events_list",
    purpose:
      "Assert the events list actually rendered: the Create Event control is present and no error is shown.",
    assertion: true,
  },
  {
    name: "expect_create_options",
    purpose:
      "Open the Create Event menu on the events list and assert which paths it offers. Use for any case about what a tenant is offered when creating an event (eRFX, single-stage, BOQ). Case-insensitive substring match per option.",
    args: {
      options: 'array of option texts that MUST be present, e.g. ["eRFX","Single Stage"]',
      absent: 'array of option texts that must NOT be present (optional)',
    },
    assertion: true,
  },
  {
    name: "expect_url_contains",
    purpose: "Assert the browser's current URL contains this text (a path, or a query parameter like projectCreation=true).",
    args: { text: "the substring the URL must contain" },
    assertion: true,
  },
  {
    name: "filter_events",
    purpose: "On the events list, switch to a tab: Live, History, Drafts or Recurring.",
    args: { tab: '"Live" | "History" | "Drafts" | "Recurring"' },
  },
  {
    name: "expect_event_in_list",
    purpose:
      "Search the events list by title and assert a matching row exists. Defaults to the title this plan gave its own event, so use it after publish or save_draft to prove the event is where the case says it should be.",
    args: { title: "title text to search for; omit to use this plan's own event title" },
    assertion: true,
  },
  {
    name: "expect_event_status",
    purpose:
      "On the events list, find the event's row by title and assert its status label contains this text (e.g. Draft, Live, RFQ in Progress, Closed). Defaults to this plan's own event title.",
    args: { status: "status text the row must show", title: "title to look for; omit to use this plan's own event" },
    assertion: true,
  },
  {
    name: "expect_template_selected",
    purpose: "Assert the current stage has a template applied — the picker no longer offers 'Select Templates' — and, when a name is given, that the stage shows it.",
    args: { name: "substring of the expected template name (optional)" },
    assertion: true,
  },
  {
    name: "expect_sheet_columns",
    purpose:
      "Assert the pricing sheet's header row has rendered from the template. With no args, asserts at least one column exists; with columns, asserts each named key is present (e.g. price, quantity, buyer_hub).",
    args: { columns: "array of header keys that must be present (optional)" },
    assertion: true,
  },
  {
    name: "open_stage_menu",
    purpose:
      "Open a stage tab's ⋮ overflow menu (Edit title / Delete …) and leave it open, so expect_disabled / expect_enabled can check its items. Defaults to the first stage tab.",
    args: { stage: '"rfp" | "rfq" | "auction" (optional)' },
  },
  {
    name: "expect_disabled",
    purpose:
      "Assert a named control on the current screen is DISABLED (greyed out / aria-disabled). Use for rules like 'Save as draft is disabled until…', 'Delete is disabled while one stage remains', 'Savings is disabled before a template'. Matches buttons, menu items and tabs by their visible text.",
    args: { control: "the control's visible text, e.g. \"Save as draft\", \"Delete\", \"Savings\"" },
    assertion: true,
  },
  {
    name: "expect_enabled",
    purpose: "Assert a named control on the current screen is ENABLED and clickable. The counterpart of expect_disabled.",
    args: { control: "the control's visible text" },
    assertion: true,
  },
  {
    name: "configure_single_stage",
    purpose:
      "On the SINGLE-STAGE create screen (open_create path single-stage), open the configuration drawer and set the event type; for an auction, its strategy and the awarding rule. This is where auction strategy is chosen on this build — rank, price or traffic light; knockout and dutch exist only through RFQ→Auction conversion.",
    args: {
      eventType: '"rfq" | "rfp" | "auction"',
      auctionSubtype: '"rank" | "price" | "traffic_light" (auction only; default rank)',
      awarding: '"lot" (entire lot to one vendor) | "line_item" (partially, multiple vendors)',
    },
  },
  {
    name: "convert_to_auction",
    purpose:
      "On a PUBLISHED RFQ's project page (after publish + expect_published), open Settings → Convert to Auction and continue. The app opens the converted event's create screen in a new tab, which becomes the page for every later step. Knockout and dutch auctions are reachable only this way.",
  },
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
  {
    name: "invite_vendor",
    purpose:
      "Put vendors on the event. Name them when the test cares WHICH vendor bids — a bid test must be able to sign in as that company — otherwise the product's own audience is used.",
    args: {
      vendors: 'array of vendor names, e.g. ["AMD"]',
      count: "minimum number of participants required; fails if the audience cannot supply it",
    },
  },
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
    name: "place_bid",
    purpose:
      "Sign into the VENDOR PORTAL as a vendor and submit a quote for the event just published. This is the vendor bidding for themselves. Needs the vendor to have been invited.",
    args: { vendor: "vendor name; defaults to the configured vendor account", price: "number, default 100" },
  },
  {
    name: "place_surrogate_bid",
    purpose:
      "Enter a bid FOR a vendor from the buyer console, without leaving it (surrogate bidding). Use when the test says the buyer bids on a vendor's behalf. Not available for knockout or dutch auctions, nor for technical stages.",
    args: { vendor: "vendor name; defaults to the first vendor offering Add Bid", price: "number, default 100" },
  },
  {
    name: "award_event",
    purpose:
      "Award the event after bidding: Master QCS -> Start Awarding -> allocate line items -> Create Proposal -> submit. Needs a published event that has at least one bid.",
    args: { vendor: "vendor to award to; defaults to whichever bid can be allocated" },
  },
  {
    name: "expect_awarded",
    purpose: "Assert the award went through (a proposal was created and submitted).",
    assertion: true,
  },
  {
    name: "expect_bid_submitted",
    purpose: "Assert the vendor's bid was accepted (the vendor portal shows the stage as Submitted).",
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
