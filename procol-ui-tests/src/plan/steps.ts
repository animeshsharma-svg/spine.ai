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

import { GENERIC_STEPS } from "./generic/catalog.js";
import { EXPECTATION_STEPS } from "./expectCatalog.js";
import { QCS_AUDIENCE_STEPS } from "./qcsAudienceCatalog.js";
import type { PlanContext } from "./screens.js";

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
  /**
   * True for the screen-neutral generic steps (generic/catalog.ts): they name
   * elements by role/label/text instead of knowing a flow. The compiler is
   * told to prefer a domain step whenever one fits.
   */
  generic?: boolean;
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
    name: "open_add_stage_menu",
    purpose:
      'On the create screen, open the "Add Stages" menu through its icon-only "+" button beside the stage tabs ("Add Stages" is the menu TITLE, never a button — do not click it). The menu lists only the stages that may still be added; a stage that may not be added is ABSENT (check with expect_hidden on its name), and the "+" tooltip says why (e.g. "Remove RFQ to add Auction"). With two stages the "+" is disabled. Leaves the menu open for expect_visible / expect_hidden / expect_text.',
    args: {},
  },
  {
    name: "expect_sheet_cells",
    purpose:
      'Assert which cells of the price / BOQ sheet (the data grid) a person can edit, read from the app\'s own locked-cell marking on the grid (nothing is clicked). Columns are named by their header text ("Product", "Quantity Requested", "Price", "GST", "Total Amount" …; the * is ignored). row = data row number, 1 = the first line item (the header row is never a data row). On an eRFX draft, cells filled from the line items (Product, Variant, Quantity Requested) and vendor columns (Price …) are read-only; Delivery location stays editable. Use for "product, quantity and variant stay read-only", "vendor cells are locked for the buyer", "only buyer columns are editable".',
    args: { row: "data row number (default 1)", editable: '["Price", …] columns that must be editable (optional)', readonly: '["Product", "Quantity Requested", …] columns that must be read-only (optional)' },
    assertion: true,
  },
  {
    name: "open_event_settings",
    purpose:
      'On a published event\'s page, open its Settings (gear) menu — data-testid event-settings-button — and leave it open. It holds the event actions: "Reschedule Event" (only while the event is UPCOMING), "Convert to Auction" (published RFQ), "Extend Bidding Time", "Withdraw" and more. Use before click{role:"menuitem", name:…}; expect_visible / expect_hidden on menuitem names then checks what is offered. An item can be PRESENT BUT DISABLED (e.g. "Send Bulk Counter Offer" with one bid or fewer) — check that with expect_disabled{control: name}, not expect_hidden. A DRAFT reopens on its create screen, which has NO Settings menu at all: to prove an action is not offered on a draft, use expect_hidden{name} for that action on the draft screen — never click a "Settings" button there.',
    args: {},
  },
  {
    name: "reschedule_event",
    purpose:
      'On an UPCOMING event\'s page, open Settings → "Reschedule Event" (if the dialog is not already open), set "Make Order Live At" (date + time) and optionally the Delivery / Pickup Date, press Ok, and judge the dialog\'s own answer. Times are RELATIVE to now: start "+2h", "+1d", "-30m" — or to the event\'s CURRENT start with an S: "S+2h" (minutes round up to the picker\'s 5-minute step). The dialog\'s buttons are Cancel / Ok — never click "Save Schedule" here (that is the create screen). Refusals it shows: "Scheduled time is invalid!" (a past time) and "Schedule time should be on or before Delivery Date" (start after delivery); days before today are disabled in the calendar, which also counts as refused. expect "refused" for a negative case (add message for the words), "saved" (default) when it should go through. When it saves, the step also reads what the save SENT and checks the round keeps its length and its closing grace (against the window the API built) — keepsLength:false turns that off. It closes the dialog when it is done, so never follow it with expect_field_error / expect_message on a dialog field: put the expected words in `message`. A past DAY ("-1d") is greyed out in the calendar and counts as refused.',
    args: { start: '"+2h" | "-30m" | "+3d" from now, or "S+2h" from the current start (optional)', delivery: '"+1d" relative day for Delivery / Pickup Date (optional)', expect: '"saved" (default) | "refused"', message: "words of the refusal (optional)", confirm: "false = set the fields but do not press Ok (optional)", keepsLength: "false = do not check the round length / closing grace the save sent (default checks)" },
    assertion: true,
  },
  {
    name: "expect_add_stage_options",
    purpose:
      'Assert what the create screen\'s icon-only "+" (Add Stages) menu allows, read from the menu itself (never use expect_visible / expect_disabled for stage names — the stage TABS carry the same names). disabled:true = the "+" is disabled (e.g. two stages is the ceiling); offers = stage names the menu must list; absent = stage names it must NOT list; reason = words the "+" tooltip must contain (e.g. "Remove RFQ to add Auction"). To check which stages are OFFERED, compose exactly ONE stage first — with two stages the "+" is always disabled.',
    args: { disabled: "true | false (optional)", offers: '["RFQ", "Auction", "Technical Stage"] (optional)', absent: "stage names that must not be offered (optional)", reason: "tooltip words (optional)" },
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
    name: "place_counter_offer",
    purpose:
      "Buyer side, on Master QCS after a vendor has bid: open the vendor's Counter Offer from their column header, enter a counter price in the drawer's sheet, add a remark and send it. The product offers the control only while the bid is live and active. Use open_master_qcs first.",
    args: { vendor: "vendor name whose bid to counter (default: the first with a Counter Offer control)", price: "the counter price (number)", remark: "optional remark text" },
  },
  {
    name: "expect_counter_offer_sent",
    purpose: "Assert the comparison grid now marks the vendor's bid with a counter offer (the 'Counter offer initiated' mark).",
    args: { vendor: "vendor name (optional)" },
    assertion: true,
  },
  {
    name: "close_event",
    purpose:
      "On a PUBLISHED event's page, make the event CLOSED: Settings → \"End <status>\" (the product's force-end, where the tenant allows it) — otherwise wait for the bidding window to lapse. Pair it with set_schedule{minutes: 3} before publish so the wait is short. Use before cases that need a closed event (Master QCS on a closed event, awarding after bidding has ended).",
    args: { remark: "remark for the end-time modal (optional)", maxWaitMinutes: "when the tenant has no force-end, how long to wait for the bidding window to lapse (default 6)" },
  },
  {
    name: "open_event",
    purpose:
      "Open an EXISTING event — by project id (direct) or by title (search the events list and click the row) — landing on its project page. Returns to the event this plan created when it created one. When the case names no event and the plan creates none, leave id and title out: the run opens the Live events list and clicks the event that best fits the steps after it — one with bids in and bidding over for Master QCS, awarding and counter offers (its own test events first); one still open for quotes otherwise. No search. Never invent a title.",
    args: { id: "project id from a URL (optional)", title: "event title the case names (optional; leave out to return to this plan's event, or to let the run pick a fitting existing one)" },
  },
  {
    name: "inventory_screen",
    purpose:
      "Record what the current screen offers — every button, tab, field, select, switch, column and banner, with disabled/required state — plus a screenshot and the accessibility tree. Asserts nothing. Used to write test cases from a screen; not for ordinary test cases.",
    args: { label: "short name for the screen, e.g. \"create-erfx\"" },
  },
  {
    name: "create_new_version",
    purpose:
      "On a PUBLISHED event's project page (after publish + expect_published, or open_event), create a new version: \"Create New Version\" → confirm. The old version is archived and its bids become read-only; the create screen opens in edit mode on the copy, with the same stages, templates and line items. Follow it with the edits the case asks for (remove_line_items, add_line_items), then set_schedule and publish to publish the version. Only possible BEFORE any award proposal is submitted — never after award_event.",
  },
  {
    name: "remove_line_items",
    purpose:
      "On the create screen (a new version, or a fresh event before publish), delete line items in the Manage Line Items panel — each row's trash icon, confirm Delete — then Save. Removes from the end; at least one item must remain.",
    args: { count: "how many line items to remove" },
  },
  {
    name: "accept_counter_offer",
    purpose:
      "VENDOR side: sign into the supplier portal as the vendor, open the event and accept the buyer's pending counter offer. Use after place_counter_offer. The vendor's view is a separate portal; when no Accept is offered, the step reports what that view shows.",
    args: { vendor: "vendor name (optional; the configured vendor identity is used)" },
  },
  {
    name: "expect_counter_offer_accepted",
    purpose: "Buyer side, on the stage's Responses grid: assert the vendor's header now marks the counter offer as accepted.",
    args: { vendor: "vendor name (optional)" },
    assertion: true,
  },
  {
    name: "capture_screen",
    purpose:
      "Record evidence of the current screen — a screenshot and the accessibility tree — under a label, without asserting anything. Use when a case wants to inspect or document a screen, or when the next thing to test has no step yet and a person needs to see the controls that exist.",
    args: { label: "short name for the capture, e.g. \"order-details-counter-offer\"" },
  },
  {
    name: "open_participants",
    purpose:
      "On a PUBLISHED event's project page, open the stage's Participants list (the surrogate-bid drawer lives here). Reaching the list is the success condition — it is paginated and only eligible vendors show an Add Bid control. Reports how many rows offer Add Bid.",
    args: {},
  },
  {
    name: "open_master_qcs",
    purpose:
      "On a published event with bids, open the Master QCS tab and assert the comparison grid rendered with its line items and bidding vendors. Optionally name vendors that must appear.",
    args: { vendors: "array of vendor names that must be in the grid (optional)" },
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
      rangeLower: "traffic light only: lower bound of the specified range (optional)",
      rangeUpper: "traffic light only: upper bound of the specified range (optional)",
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
    args: {
      count: "how many (1-50)",
      search: "optional product search text to use for all of them",
      quantity: "optional — type exactly this value (as a string) into every added line item's quantity field, including an invalid one like a negative number or a letter, to test the app's own validation. Omit to let the automation fill a normal default.",
    },
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
      "Put vendors on the event. With no vendors named, the runner presses the product's own Invite Vendor and takes every vendor the products map to — the normal case. Name vendors ONLY when the test case itself names them (then each is searched for and added).",
    args: {
      vendors: 'array of vendor names copied from the test case — omit unless the case names a vendor; never invent one',
      count: "minimum number of participants required (e.g. 2 when two vendors must bid); QA test vendors top it up when the suggestion is short",
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
      "Sign into the VENDOR PORTAL as a vendor on the event and submit a quote for the event just published. This is the vendor bidding for themselves. Each place_bid without a vendor signs in as a DIFFERENT vendor on the event (the next one with a portal login that has not bid yet), so two vendors bidding = invite_vendor{count:2}, then place_bid twice — no vendor names needed.",
    args: { vendor: "optional: a vendor name the test case gives, or a number (1, 2, …) for the 1st, 2nd … vendor on the event; default: the next vendor that has not bid yet", price: "number, default 100" },
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
    name: "approve_award",
    purpose:
      "After award_event, approve the submitted award on its proposal page (remark + Approve), step by step, while the run's buyer is the pending approver. When another person is the approver, the case is reported as not checked.",
    args: { remark: "approval remark (optional; the app requires one)" },
  },
  {
    name: "create_po",
    purpose:
      "After award_event, make the purchase order(s): approve the award to completion — the app then creates one PO per awarded vendor — and read the POs back. Use for \"create the PO\" / \"raise a purchase order\". Not available when the client makes POs through the custom PO form.",
  },
  {
    name: "expect_po_items",
    purpose:
      "After create_po, assert the purchase orders carry exactly the awarded line items (default: the event's current line items), each with a quantity; optionally a quantity every line must carry.",
    args: { count: "expected number of PO lines across all POs (optional)", quantity: "quantity every PO line must carry (optional)" },
    assertion: true,
  },
  {
    name: "start_awarding",
    purpose:
      "On Master QCS of a closed event with bids, press Start Awarding (or Bid Selection Proposal when a draft proposal exists) and land on the awarding screen. Use for cases about entering the award flow.",
  },
  {
    name: "allocate_award",
    purpose:
      "On the awarding screen (after start_awarding), allocate the line items to a vendor and confirm the screen's counters moved. Use for cases about allocating / selecting a vendor for award; follow with expect_award_counters.",
    args: { vendor: "vendor name (optional; the first that can be allocated)" },
  },
  {
    name: "expect_award_counters",
    purpose: 'On the awarding screen, assert the counters read as given: "Tot. selected line items" items (e.g. "1/1") and "Awarded Vendors" vendors (e.g. "1/1").',
    args: { items: 'expected "selected/total" for line items (optional)', vendors: 'expected "selected/total" for vendors (optional)' },
    assertion: true,
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

// The generic read/verify/navigate/act steps (generic/catalog.ts) close the
// largest family on the gap ledger: "assert this tooltip / count / value /
// message", "click this control", "this must NOT render".
STEP_CATALOG.push(...GENERIC_STEPS);
// Prepared-state + expectation steps (expectCatalog.ts / expectations.ts): open the
// screen on the state the API built, and the expectations a screen case needs.
STEP_CATALOG.push(...EXPECTATION_STEPS);
// Master QCS cell / arithmetic / rank checks and the published Participants list
// (qcsAudienceCatalog.ts / qcsAudienceSteps.ts): the two screens the gap ledger asked for most.
STEP_CATALOG.push(...QCS_AUDIENCE_STEPS);

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
  /** What the API built for this case (ids + values) — set by the runner, never by the model. */
  context?: PlanContext;
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
  // attempt / skip name another step; that one has to exist too.
  const nested = p.steps
    .filter((s) => (s as PlanStep)?.step === "attempt" || (s as PlanStep)?.step === "skip")
    .map((s) => String((s as PlanStep).args?.step ?? ""))
    .filter((name) => !STEP_NAMES.includes(name) || name === "attempt" || name === "skip");
  if (nested.length) {
    return { ok: false, reason: `attempt/skip name step(s) that cannot be used there: ${nested.join(", ") || "(none given)"}` };
  }
  return { ok: true, plan: { title: String(p.title ?? "Untitled test"), steps: p.steps as PlanStep[], ...(p.context && typeof p.context === "object" ? { context: p.context } : {}) } };
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
