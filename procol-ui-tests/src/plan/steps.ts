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
    name: "withdraw_event",
    purpose:
      'WITHDRAW an event, at any phase (live, after bids, after bidding closed, on any stage). The whole PROJECT is withdrawn from the project\'s ⋮ menu (the icon right after "Messages") → "Withdraw Project" → "Withdrawal Remarks" → "Yes, Withdraw Project"; one STAGE from that stage tab\'s Settings ▾ → "Withdraw" → "Please enter reason…" → Yes. Use for any "withdraw / cancel the event / project / RFQ / auction" in a case: scope "project" (default) for the event or project, "stage" when the case withdraws one round (e.g. "withdraw the RFQ stage"). noReason:true presses confirm with no remark — for cases that check the remark is required (the step reports Procol\'s refusal as blocked). Follow with expect_withdrawn.',
    args: {
      scope: '"project" (default) or "stage"',
      stage: 'the stage tab for scope "stage": "rfq" | "rfp" (technical) | "auction" (optional; the first stage tab otherwise)',
      reason: "the withdrawal remark (optional; a default is typed)",
      noReason: "true to confirm with NO remark — a case about the remark being required (optional)",
    },
  },
  {
    name: "expect_withdrawn",
    purpose: 'Assert the event is withdrawn — read from Procol\'s own records (project or stage, as withdraw_event did), with the page\'s "Withdrawn" shown beside. Use after withdraw_event.',
    args: {},
    assertion: true,
  },
  {
    name: "event_menu",
    purpose:
      'Open the event menu that holds an action and choose it — for ANY of these words in a case: from the project\'s ⋮ menu (beside Messages): "Send Reminders", "Withdraw Project"; from a stage tab\'s Settings ▾: "Shared With", "Extend Submission Time", "Withdraw", "Convert to Auction", "Rejected Bids", "Order Activity", "Edit Evaluation Time", "Send Bulk Counter Offer", "Recreate Order", "Reschedule Event". The step goes to a stage tab when needed. What each opens (check THESE words, not the item\'s name): Shared With → a “Participation Summary” drawer (Invited · Seen · Bid Placed · Bid Not Placed); Order Activity → an “Activity” drawer (“You created the event …”); Send Reminders → a “Send Reminders” drawer (“Offer submissions” with “N Pending” and View — never press Notify, that messages the vendor); Rejected Bids → “Rejected Bids”; Edit Evaluation Time → “Edit Evaluation Time” (“Evaluation will end at …”). What the item opens (a dialog, drawer or popover) stays open for the next steps (expect_text on its words, click on its buttons, do_on_screen for the rest) unless close:true. Prefer withdraw_event, extend_submission_time, convert_to_auction or reschedule_event where they fit; this is for the rest. A greyed-out item fails the step — to CHECK it is greyed out use expect_menu_item{enabled:false}.',
    args: {
      item: 'the menu item\'s words, e.g. "Order Activity"',
      stage: '"rfq" | "rfp" | "auction" — whose Settings menu (optional)',
      close: "true to close what it opened again (optional)",
    },
  },
  {
    name: "expect_menu_item",
    purpose:
      'Assert what an event menu offers: open the menu that holds the item (project ⋮ or a stage\'s Settings), read it, close it. enabled:false — the item is there but greyed out (e.g. "Recreate Order" on a live RFQ, "Send Bulk Counter Offer" with no bids); present:false — the menu does not offer it (e.g. "Withdraw Project" after the project is withdrawn).',
    args: {
      item: "the menu item's words",
      enabled: "false when it must be greyed out (optional; default it must be enabled)",
      present: "false when the menu must not offer it (optional)",
      stage: '"rfq" | "rfp" | "auction" (optional)',
    },
    assertion: true,
  },
  {
    name: "extend_submission_time",
    purpose:
      'On a published stage, Settings ▾ → "Extend Submission Time" → "Increase Event Time": choose "15 minutes", "30 minutes" or "an hour" → Ok. Use for "extend / increase the bidding / submission time". Returns the end time before the change and Procol\'s answer.',
    args: { by: '"15 minutes" (default) | "30 minutes" | "an hour"', stage: '"rfq" | "rfp" | "auction" (optional)' },
  },
  {
    name: "add_price_cap",
    purpose:
      'On a published RFQ\'s or auction\'s Participants list, a vendor\'s "+ Add Price Cap" → "Add Price Cap for <vendor>" → a price cap on every product (the cap applies to the Net Price) → OK. Use for any "price cap" / "maximum price" / "ceiling price" for a vendor. Put it BEFORE the surrogate bid it should limit. With no vendor named, the first ticked participant. A case that checks a cap is required or must be positive: noPrice:true, or a price of 0 or below — the step then reports Procol\'s refusal as blocked. To check the cap was saved, follow with expect_price_cap (never do_on_screen).',
    args: {
      vendor: "vendor name (optional)",
      price: "the cap, a number (default 100)",
      noPrice: "true to press OK with no cap entered (optional)",
    },
  },
  {
    name: "expect_price_cap",
    purpose:
      'Assert a vendor\'s SAVED price cap: on Participants the row\'s "Add Price Cap" becomes "Edit Price Cap" once saved; the step opens it, reads every product\'s Price cap and closes WITHOUT saving. Use for "verify / check / inspect / confirm the price cap (is N)" after add_price_cap. With no price, the cap add_price_cap just saved.',
    args: {
      vendor: "vendor name (optional)",
      price: "the cap it must read (optional; default the one just added)",
    },
    assertion: true,
  },
  {
    name: "expect_responses",
    purpose:
      'The BUYER\'s view of who responded on a stage, after vendors bid (place_bid from the vendor portal, place_surrogate_bid from the console): the stage\'s Responses tab, reloaded, has one column per vendor that responded — a surrogate one is tagged "Surrogate Bid", one from the vendor portal is not — and "Participation : x / y" (responded / invited). Same on an RFQ, a technical stage (RFP) and an auction. Use for "the buyer sees the response(s)", "both bids show for the buyer", "N of M vendors responded". On a two-stage event check each stage with stage:"rfp" / "rfq".',
    args: {
      count: "how many vendor columns (responses) exactly (optional)",
      atLeast: "at least this many (optional)",
      surrogate: "how many are tagged Surrogate Bid (optional)",
      direct: "how many came from the vendor portal — no Surrogate Bid tag (optional)",
      vendors: "vendor names that must have a column (optional)",
      participation: '"2/3" — responded / invited (optional)',
      stage: '"rfq" | "rfp" | "auction" — whose Responses (optional; default the first stage)',
    },
    assertion: true,
  },
  {
    name: "extend_time",
    purpose:
      'On an event\'s page, open Settings → "Extend Submission Time" (which:"submission", default) or "Edit Evaluation Time" (which:"evaluation") and set the new time in the "Increase Event Time" window: option "preset" (a ready slot — the app offers "15 minutes", "30 minutes", "an hour"; preset = its duration e.g. "1 hour"), "custom" (amount + unit minutes|hours|days; direction "decrease" for Edit Evaluation Time\'s "Decrease by"), or "fixed" (at = "E+30m" = 30 minutes after the event\'s CURRENT END — use E whenever the case says "after / before the current end"; "+2h" = two hours from NOW; "-10m" = in the past). Presses Ok and judges the window\'s own answer; when it saves, reads the event\'s end before and after and checks the SUM (new end = old end + duration, or now + duration when bidding had already ended). expect "refused" for a negative case (also passes when the item is not offered, or is greyed out WITH a tooltip; message = words of the refusal). Use for every "extend submission time / edit evaluation time" case: by preset, by custom minutes/hours/days, to a fixed time, zero, empty, past time, before the current end, during live / evaluation / after award.',
    args: { which: '"submission" (default) | "evaluation"', option: '"preset" | "custom" (default) | "fixed"', preset: "the slot's words (optional)", amount: "number for custom (may be 0, empty, letters for negative cases)", unit: '"minutes" | "hours" | "days"', direction: '"increase" (default) | "decrease"', at: '"E+30m" | "+2h" | "-10m" for fixed', expect: '"saved" (default) | "refused"', message: "words of the refusal (optional)", confirm: "false = fill but do not press Ok" },
    assertion: true,
  },
  {
    name: "expect_settings_menu",
    purpose:
      'Open the event\'s Settings menu and check what it offers in the event\'s CURRENT state: offered (must be there), absent (must not be there), greyed (must be greyed out), enabled (must be clickable). Every greyed-out item must show a tooltip saying why (tooltips:false turns that check off). Use for "is X allowed when the event is upcoming / live / in evaluation / awarded" — e.g. after award: absent ["Withdraw"], greyed ["Extend Submission Time"].',
    args: { offered: '["Withdraw", …]', absent: '["Reschedule Event", …]', greyed: '["Extend Submission Time", …]', enabled: '["Order Activity", …]', tooltips: "false = do not require tooltips on greyed items" },
    assertion: true,
  },
  {
    name: "probe_controls",
    purpose:
      'EXPLORATION, not a check: click every control the current screen offers (buttons, tabs, menu items, links, switches), one at a time on the screen reloaded each time, and record what the app did — the dialog it opened (title, fields, buttons), the menu, the new page, the message, the request it sent, an error, or nothing; a greyed-out control is hovered for its tooltip. Never presses the confirm inside a dialog. Controls that usually change the event (Publish, Submit, Save …) go last. Use only when the case asks to find out what each control does ("what happens if I click …", "explore this screen").',
    args: { within: '"Settings" | "Actions" | "⋮ (more)" — probe the ITEMS of the menu this control opens, opening it again before each item (optional)', include: '["Settings", …] only controls whose name contains one of these (optional)', skip: '["Publish", …] controls to leave alone (optional)', max: "most controls to click (default 30)", reload: "false = do not reload between clicks (default reloads)" },
  },
  {
    name: "expect_template_menu",
    purpose:
      'On the SINGLE STAGE create screen, open "Select Templates", read the name of every template the menu offers and close it without choosing. eventType (rfq | rfp | auction) switches the event type first; without it the type on screen is read. Checks the menu is not empty (min), names that must / must not be offered (contains / absent, matched as part of the name), and with distinctFrom that none of these templates is also offered for the other event type(s) — e.g. "RFP shows questionnaire templates, not the RFQ price templates" → {eventType:"rfp", distinctFrom:["rfq"]}. Use for "the template list matches the event type", "only RFQ templates are offered", "auction shows its own templates".',
    args: { eventType: '"rfq" | "rfp" | "auction" (optional — switch to it first)', min: "least number of templates (default 1)", contains: '["Buy", …] parts of names that must be offered (optional)', absent: '["Questionnaire", …] parts of names that must NOT be offered (optional)', distinctFrom: '["rfq", …] event types whose templates must not appear here (optional)' },
    assertion: true,
  },
  {
    name: "set_sheet_cell",
    purpose:
      'Type a value straight into one cell of the price / BOQ sheet (the data grid) like a person — click the cell (double-click if no editor opens), type, press Tab — and note what the cell shows afterwards. Columns are named by header text ("Quantity Requested", "Price", "GST" …). A locked (read-only) cell takes no typing; that is recorded, not failed. Follow with expect_sheet_cell to judge it. Use for "enter a negative quantity", "type letters into the price", "enter 0", "enter 1,00,000.555". For choosing a product use the product steps, not this.',
    args: { row: "data row number (default 1)", column: "header text of the column", value: "what to type" },
  },
  {
    name: "expect_sheet_cell",
    purpose:
      'Read one cell of the price / BOQ sheet and check it. kept:true = the value typed by set_sheet_cell stayed (numbers compared without separators, so "1,000" = "1000") and the cell is not marked as an error; refused:true = the sheet did NOT keep it (cleared, changed, locked, or marked as an error). equals / contains / empty check the text the cell shows. Use after set_sheet_cell for "the sheet does not accept negative quantity", "letters are not allowed in price", "the value is saved as typed".',
    args: { row: "data row number (default 1)", column: "header text of the column", kept: "true = the typed value must stay (optional)", refused: "true = the typed value must be refused (optional)", equals: "exact text expected (optional)", contains: "part of the text expected (optional)", empty: "true / false (optional)" },
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
      'Assert what the create screen\'s icon-only "+" (Add Stages) menu allows, read from the menu itself (never use expect_visible / expect_disabled for stage names — the stage TABS carry the same names). disabled:true = the "+" is disabled (e.g. two stages is the ceiling); offers = stage names the menu must list; absent = stage names it must NOT list; reason = words the "+" tooltip must contain (e.g. "Remove RFQ to add Auction") — ONLY with disabled:true, since an enabled "+" has no reason. To check which stages are OFFERED, compose exactly ONE stage first — with two stages the "+" is always disabled.',
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
      "Buyer side, on Master QCS after a vendor has bid: open the vendor's Counter Offer from their column header, enter a counter price in the drawer's sheet, add a remark and send it. The product offers the control only while the bid is live and active. Use open_master_qcs first. To CHECK Counter Offer is greyed out (e.g. on a surrogate bid) use attempt{step:\"place_counter_offer\", expect:\"refused\"} — the control sits in the vendor column's header, where expect_disabled does not look.",
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
      "On a PUBLISHED event's page, make the event CLOSED: Settings → \"End <status>\" (the product's force-end, where the tenant allows it) — otherwise wait for the bidding window to lapse. The product's shortest window is 30 minutes (set_schedule{minutes: 30}), so a wait costs about half an hour. This step IS the waiting: a case that says to wait for the window to close, expire or end uses close_event{natural: true} — never ask_tester. Use before cases that need a closed event (Master QCS on a closed event, awarding after bidding has ended, evaluating a technical stage — it is evaluated once its window has closed).",
    args: { remark: "remark for the end-time modal (optional)", natural: "true when the case says to WAIT for the window to close: never force-end it", maxWaitMinutes: "how long to wait for the bidding window to lapse (default 36)" },
  },
  {
    name: "open_event",
    purpose:
      "Open an EXISTING event — by project id (direct) or by title (search the events list and click the row) — landing on its project page. Returns to the event this plan created when it created one. When the case names no event and the plan creates none, leave id and title out: the run opens the Live events list and clicks the event that best fits the steps after it — one with bids in and bidding over for Master QCS, awarding and counter offers (its own test events first); one still open for quotes otherwise. No search. Never invent a title.",
    args: { id: "project id from a URL (optional)", title: "event title the case names (optional; leave out to return to this plan's event, or to let the run pick a fitting existing one)", purpose: "\"evaluation\" when the case scores a vendor's technical response: the run picks an event whose TECHNICAL stage has closed with a vendor's answer waiting (optional)" },
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
    name: "ask_tester",
    purpose:
      "THE PART OF THE CASE NO OTHER STEP CAN DO: put this step exactly where it belongs in the order (e.g. after publish, for \"sign in as the evaluator and score the technical response\") and keep every step you DO have before and after it. The run stops there and asks the tester in the chat for the steps or a login (another user, a second company…), then carries them out; if the tester skips it, that part is reported as not tested. Use it instead of returning no steps or guessing: never drop a case because one part has no step, and never mark such a case as covered. One ask_tester per missing part (at most one per plan: ask once, for the one thing the platform truly cannot do — a credential it does not hold, a screen it has never seen), and list the same part under cannotExpress. Never ask_tester to sign in or to open a list the steps can reach. Before it, use the steps that DO exist for everything around it — a vendor's technical response is place_bid (it answers the Technical Stage of a two-stage event), a closed round is close_event — and name in `need` ONLY what no step can do, in one short plain sentence (\"sign in as the assigned evaluator and score the vendor's technical response\"), never the parts other steps do.",
    args: { need: "the missing part in the tester's words, as a task: \"sign in as the assigned evaluator and score the vendor's technical response\"" },
  },
  {
    name: "do_on_screen",
    purpose:
      "A PART NO OTHER STEP CAN DO, BUT ONE THE BUYER CAN DO ON SCREEN IN THIS SESSION (no other login, company, inbox or vendor portal): the run works it out in this browser itself, one action at a time with a screenshot each, and the step passes only when the screen proves the goal (then it counts as tested). If it gets stuck it asks the tester, as ask_tester does. Put it exactly where the part belongs in the order and keep every step you DO have before and after it. An event made from a PR is NOT this step: it starts with open_purchase_requisitions. Use ask_tester instead for anything that needs another user, another company, an email or the supplier portal.",
    args: { goal: "the part as a task with the screen it must end on: \"open an approved purchase request and create an event from it; stop on the event's create screen showing the PR's line items\"" },
  },
  {
    name: "open_purchase_requisitions",
    purpose: "FIRST STEP of an event made FROM A PURCHASE REQUEST (\"from a PR\", \"from the existing PR\"): open Purchase Requisitions. Then pr_tab{tab:\"Open\"}, select_pr, purchase_items, choose_stages, expect_pr_items, each stage's steps (switch_stage when more than one, select_template, fill_questionnaires + assign_evaluator for Technical, fill_sheet for RFQ / Auction), then set_title, set_schedule, invite_vendor, publish. Never open_create or add_line_items for such an event: it is made from the PR and keeps its items.",
  },
  {
    name: "pr_tab",
    purpose: "On Purchase Requisitions, switch to a tab. Only an Open PR can become an event, so use \"Open\" before select_pr (never Completed, In Progress, Rejected or Deleted).",
    args: { tab: "\"Open\" (default) | \"In Progress\" | \"Completed\" | \"Rejected\" | \"Deleted\"" },
  },
  {
    name: "select_pr",
    purpose: "Tick one PR's box on the current tab (the first row, or the PR the case names) and check that Purchase Items turns on. A case that wants \"a PR with N line items\" sets items: N — the step finds a PR with that many line items on the tab (each row is one line item) and ticks all of them.",
    args: { pr: "the PR number the case names (optional)", items: "how many of one PR's line items to tick, for \"a PR with 2 line items\" (optional)" },
  },
  {
    name: "purchase_items",
    purpose: "Click Purchase Items (never Actions) for the ticked PR, then Start New Project.",
  },
  {
    name: "choose_stages",
    purpose: "Pick the new event's stages and create it. Give `stages` ONLY when the case names the event (\"technical event\" → [\"rfp\"], \"technical + RFQ\" → [\"rfp\",\"rfq\"]); with none the run asks the tester (Technical, RFQ, Auction, Technical + RFQ, Technical + Auction) and adds that event's stage steps itself. RFQ and Auction never go together.",
    args: { stages: "from \"rfp\" (technical) | \"rfq\" | \"auction\" — only what the case names (optional)" },
  },
  {
    name: "expect_pr_items",
    purpose: "Assert the new event's create screen lists the PR's line items (the Items badge is above zero).",
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
  { name: "set_title", purpose: 'Type a title into the event\'s title box. LEAVE IT OUT when the case is about the AUTOMATIC title (auto title, "[RFQ] …", the title the app fills from the products / event type, "the title box stays empty"): typing one would replace what the case checks. When the case says to clear or edit the auto title, use the generic fill on "Enter the title of this event" instead.', args: { title: "string; omit to auto-generate a unique one" } },
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
    purpose: "Add line items through the Manage Line Items drawer. NEVER after open_create{path:\"boq\"}: BOQ line items arrive by sheet upload only, which no step does — a BOQ case that adds items gets one ask_tester for the upload (or cannotExpress), never add_line_items.",
    args: {
      count: "how many (1-50)",
      search: "optional product search text to use for all of them",
      quantity: "optional — type exactly this value (as a string) into every added line item's quantity field, including an invalid one like a negative number or a letter, to test the app's own validation. Omit to let the automation fill a normal default.",
    },
  },
  { name: "fill_sheet", purpose: "Fill the pricing sheet for every line item on screen." },
  {
    name: "fill_required",
    purpose:
      "Fill every mandatory field still empty on the create screen (whatever this client makes mandatory — custom fields, Payment Terms, dates, dropdowns), on every stage tab. Publish already does this for a case that expects the publish to go through; use it alone only to say so explicitly.",
    args: { said: "optional — the app's refusal naming what is missing (\"Payment Terms and Conditions are mandatory\"); the control with that name is opened, filled and saved" },
  },
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
      "Put vendors on the event. With no vendors named, the runner presses the product's own Invite Vendor and takes every vendor the products map to — the normal case. Name vendors ONLY when the test case itself names them (then each is searched for and added). count is EXACTLY the number the case says (“invite 2 vendors” = count:2) — never a spare: on a two-stage event the same vendors are on both stages, and one vendor may answer one stage by surrogate and another from the portal.",
    args: {
      vendors: 'array of vendor names copied from the test case — omit unless the case names a vendor; never invent one',
      count: "minimum number of participants required (e.g. 2 when two vendors must bid); QA test vendors top it up when the suggestion is short",
    },
  },
  { name: "publish", purpose: "Publish the event and wait for the outcome." },
  { name: "save_draft", purpose: "Save as draft instead of publishing. NOT on a single-stage screen (open_create{path:\"single-stage\"}): it has no Save as draft — for a case that asks to save one there, assert expect_count{role:\"button\", name:\"Save as draft\", count:0}, which is the product's answer." },
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
      "Sign into the VENDOR PORTAL as a vendor on the event and submit a quote for the event just published. This is the vendor bidding for themselves. Each place_bid without a vendor signs in as a DIFFERENT vendor on the event (the next one with a portal login that has not bid yet), so two vendors bidding = invite_vendor{count:2}, then place_bid twice — no vendor names needed. On a Technical + RFQ (two-stage) event ONE place_bid does both: it answers and submits the Technical Stage, then quotes the RFQ at the price (seen 27 Oct, VB04) — never a second step or ask_tester for the quote. It IS the vendor's technical response an evaluation needs; if Procol keeps Submit Quote disabled after the technical answer, the step says so. The vendor portal opens BESIDE the buyer's page in the live view, and the buyer's page stays open: follow with expect_responses (the buyer sees it). A case where one vendor bids from the portal and the buyer enters a surrogate bid for ANOTHER: invite_vendor{count:2}, place_surrogate_bid with no vendor and place_bid with no vendor, in the case's order — the surrogate bid never takes the portal vendor.",
    args: { vendor: "optional: a vendor name the test case gives, or a number (1, 2, …) for the 1st, 2nd … vendor on the event; default: the next vendor that has not bid yet", price: "number, default 100" },
  },
  {
    name: "place_surrogate_bid",
    purpose:
      "Enter a bid FOR a vendor from the buyer console, without leaving it (surrogate bidding). Use when the test says the buyer bids on a vendor's behalf. Not available for knockout or dutch auctions. On a TECHNICAL stage the row's Add Bid opens the vendor's technical response, and the step answers it (seen 27 Oct on a technical-only event: Participants offer + Add Bid, no Add Price Cap). A price Procol refuses (0 or below keeps Submit Bid disabled) is reported as blocked — wrap it in attempt{step:\"place_surrogate_bid\", args:{price}, expect:\"refused\"}. A bid submitted with NO price: attempt{step:\"place_surrogate_bid\", args:{noPrice:true}, expect:\"refused\"}.",
    args: { vendor: "vendor name; defaults to the first vendor offering Add Bid", price: "number, default 100", noPrice: "true to submit with no price (a case about the price being required)", stage: '"rfp" on a two-stage (RFP + RFQ) event to enter the vendor\'s TECHNICAL response on the Technical Stage; default the pricing stage (RFQ / auction)' },
  },
  {
    name: "evaluate_technical",
    purpose:
      'EVALUATOR SCORING of a technical (RFP) stage, after close_event: the stage\'s assigned evaluator signs in to a tab of their own beside the buyer\'s (Procol lets only them score), gives each vendor\'s technical answer a score label (the client\'s list, e.g. Preference P1 / P2 / P3, On Trial, Technically Not Accepted - TNA) with a remark, and Submits each line item. Use for “score / evaluate the technical responses”, “as the evaluator …”, “submit the evaluation”. Always after close_event (scoring opens only in the evaluation time that follows); before award_event.',
    args: {
      scores: 'optional: one label for every vendor ("Preference P1"), labels per vendor in column order, or numbers per vendor (higher = better label, e.g. [8, 6]); default the best label for all',
      remark: "optional remark (required by Procol; a default is used)",
    },
  },
  {
    name: "award_event",
    purpose:
      "Award the event after bidding: Master QCS -> Start Awarding -> allocate line items -> Create Proposal -> submit, ALL in this one step. Use it for ANY case that awards (“award the line / event to …”, “award in Master QCS”), after close_event; follow with expect_awarded (and approve_award when the case approves). Never start_awarding + expect_awarded for an award: start_awarding only enters the screen. Needs a closed event with bids.",
    args: { vendor: 'whom to award: a vendor name the case gives, or "lowest" (Rank 1 on Master QCS — “the lowest bidder”), "surrogate" (the vendor the buyer bid for in this plan), "portal" (a vendor who bid from the vendor portal); default whichever bid can be allocated' },
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
      "On Master QCS of a closed event with bids, press Start Awarding (or Bid Selection Proposal when a draft proposal exists) and land on the awarding screen. Use ONLY for cases about the awarding screen itself (its counters, allocating by hand); to award, use award_event.",
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
    args: { because: "optional: words of the APP'S OWN message, never a paraphrase. Without participants the app says \"Please add participants to proceed!\" — and it checks participants FIRST, so a publish missing a template or line items is refused with that message too; a technical stage without an evaluator: \"Please add Evaluator to all the line items in the Technical Stage\"" },
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
