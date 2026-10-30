import type { StepSpec } from "../steps.js";

/**
 * THE GENERIC STEPS — read, verify, navigate and act on ANY screen by what a
 * person would call things.
 *
 * The domain steps (open_create, select_template, publish …) know the
 * product's flows. They could not say "check the tooltip on Items reads …",
 * "assert there are zero Add Bid buttons" or "pick Price in the Range type
 * select" — 48 of the 88 entries on the gap ledger were exactly that kind of
 * read/verify. These steps say it, with the element named by role + accessible
 * name, label, placeholder or visible text (tried in that order, and the one
 * that matched is recorded on the step).
 *
 * Rules every generic step obeys (enforced in generic/run.ts):
 *   - bounded: every wait has a limit, and a step that runs out FAILS;
 *   - never passes by not finding something, unless it is an explicit absence
 *     check — and an absence check first waits for the page-ready signal, so
 *     a slow screen cannot fake an absence;
 *   - an action that cannot find its element may ask the AI healer (if
 *     enabled) as the last resort; an assertion never does.
 */

/**
 * How every generic step names its element — separate keys, never one string.
 * The model once wrote target:"role button name Items 0", which no strategy
 * can match; the executor tolerates that shape, but the contract is the keys.
 */
const TARGET_ARGS: Record<string, string> = {
  role: "ARIA role when it is a control: button | link | tab | menuitem | checkbox | switch | radio | textbox | combobox | row | heading | dialog (optional)",
  name: "the control's visible name, exactly as on screen, e.g. \"Items\", \"Add Bid\" (with role)",
  label: "a form field's label (instead of role+name)",
  text: "plain visible text (instead of role+name)",
  placeholder: "an input's placeholder (instead of label)",
  within: 'optional region: "dialog" | "menu" | the text of the row/card it sits in',
};

export const GENERIC_STEPS: StepSpec[] = [
  {
    name: "go_to",
    generic: true,
    purpose:
      "Navigate to a screen that has no domain step: a published event's stage tab or one of its sub-tabs (responses, overview, participants, analytics, price trends, participant remarks), any tab by name, or a console path. Waits for the screen to be ready. Prefer open_events_list / open_event / open_create / open_master_qcs / open_participants when they fit.",
    args: {
      screen: '"stage" | "responses" | "overview" | "participants" | "analytics" | "price_trends" | "participant_remarks" | "tab" | "path" | "back" (the browser\'s back button) | "new_tab" (continue in the tab that just opened) | "url_on_screen" (open a URL that is written as text on the screen, e.g. in a mail preview; within = the text near it) | "events_list" | "event" | "master_qcs"',
      stage: 'for screen "stage": "rfq" | "rfp" | "auction" (optional; default the first stage tab)',
      name: 'for screen "tab": the tab\'s visible name',
      path: 'for screen "path": a console path such as "/orders" (no host)',
      title: 'for screen "event": the event title (default: this plan\'s own event)',
    },
  },
  {
    name: "click",
    generic: true,
    purpose:
      "Click an element named by role+name, label or text (e.g. the toolbar \"Items\" button, a menu item, a radio, a day in a calendar). Several matches: the first that can take a click (a covered or inert one is skipped). Fails if the element is not found or is disabled — use attempt{step:\"click\"} when the case expects the click to be refused.",
    args: { ...TARGET_ARGS },
  },
  {
    name: "hover",
    generic: true,
    purpose: "Hover an element (to reveal its tooltip or menu). Pair with expect_message{kind:\"tooltip\"}.",
    args: { ...TARGET_ARGS },
  },
  {
    name: "fill",
    generic: true,
    purpose:
      "Type a value into a field found by its label or placeholder (or role textbox + name), then confirm the field holds it. Also sets date/time/colour/number inputs (value as the input expects: YYYY-MM-DD, HH:MM, #rrggbb, a number), a range slider (the number), and chooses in a dropdown when the label is a select. A read-only field that opens a picker cannot be typed into — click the value in the picker.",
    args: { label: "field label or placeholder", value: "text to type", within: "optional region: the form, section, row or card the field sits in" },
  },
  {
    name: "select",
    generic: true,
    purpose: "Choose an option in a dropdown/select found by its label or its current text (native select, antd, a combobox or a button that opens a list, searchable lists), then confirm it shows the option.",
    args: { label: "the select's label, placeholder or current text (e.g. \"Select a country\")", option: "visible text of the option to choose", within: "optional region, e.g. the group \"Ship from\"" },
  },
  {
    name: "toggle",
    generic: true,
    purpose: "Set a switch or checkbox found by its label to on or off, then confirm its state. With only:true (\"keep only Nonstop\", \"show only Paid\") every other switch in the same group is turned off.",
    args: { label: "switch/checkbox label", on: "true | false", only: "true: turn the others in its group off (optional)" },
  },
  {
    name: "upload",
    generic: true,
    purpose: "Attach a file to an upload control found by its label/text (opens the file chooser or fills the file input), then confirm the screen shows it.",
    args: { label: "the upload control's label or text", file: 'a fixture ("sample.pdf" | "sample.png" | "sample.csv" | "sample.txt"), a path on the site under test ("files/orders.csv", fetched from it) or a URL' },
  },
  {
    name: "press",
    generic: true,
    purpose: "Press a keyboard key on the current screen (Escape to close a drawer, Enter to submit a search).",
    args: { key: '"Escape" | "Enter" | "Tab" | …' },
  },
  {
    name: "expect_text",
    generic: true,
    assertion: true,
    purpose:
      "Assert a text IS (present:true, default) or is NOT (present:false) visible on the current screen, optionally inside a region. An absence check waits for the screen to be ready first.",
    args: { text: "the text", present: "true | false", within: "region (optional)" },
  },
  {
    name: "expect_visible",
    generic: true,
    assertion: true,
    purpose:
      "Assert an element (by role+name / label / text) is visible (visible:true, default) or absent (visible:false). Use for 'the drawer opens', 'no price drawer', 'the Recurring toggle is shown'.",
    args: { ...TARGET_ARGS, visible: "true | false" },
  },
  {
    name: "expect_count",
    generic: true,
    assertion: true,
    purpose:
      "Count visible elements matching role+name / text and assert count (exact), min or max — e.g. zero \"Add Bid\" buttons, at least 1 row, exactly 2 stage tabs. Count 0 / max 0 is an absence check and waits for the screen to be ready.",
    args: { ...TARGET_ARGS, count: "exact number (optional)", min: "at least (optional)", max: "at most (optional)" },
  },
  {
    name: "expect_value",
    generic: true,
    assertion: true,
    purpose:
      "Assert the value a field/select/radio group SHOWS — the input's value, the select's chosen option, the checked radio — found by its label. Case-insensitive contains.",
    args: { label: "field/select label", value: "expected value text" },
  },
  {
    name: "expect_message",
    generic: true,
    assertion: true,
    purpose:
      "Assert the app shows a message of a kind — toast, error, warning, success, inline (form error), tooltip, modal — optionally containing text. For a tooltip, give `on` (the element to hover). Reads toasts that already faded via the run's toast journal.",
    args: { kind: '"toast" | "error" | "warning" | "success" | "inline" | "tooltip" | "modal" | "any"', text: "substring expected (optional)", on: "for tooltip: the visible name of the element to hover, e.g. \"Items\"" },
  },
  {
    name: "remember",
    generic: true,
    purpose: "Read and keep the text of an element or region under a key, so a later expect_remembered can compare (e.g. the line items before a rename).",
    args: { key: "a short name", ...TARGET_ARGS },
  },
  {
    name: "expect_remembered",
    generic: true,
    assertion: true,
    purpose: "Re-read what remember{key} read and assert it is the same (same:true, default) or changed (same:false).",
    args: { key: "the remember key", same: "true | false" },
  },
  {
    name: "switch_tab",
    generic: true,
    purpose: "Continue the plan in another browser tab: the one that just opened (default), or the tab whose title or URL contains the given text. Use when a click opens something in a new tab.",
    args: { title: "part of the tab's title (optional)", url: "part of the tab's URL (optional)" },
  },
  {
    name: "pick_date",
    generic: true,
    purpose:
      "Choose a date in a calendar picker: opens the field named by its label, turns the calendar to the right month (its next/previous buttons or month/year selects), presses the day. For a plain date input it types the date. Use for any check-in / departure / date-of-birth field that opens a calendar.",
    args: { label: "the date field's label (optional when the calendar is already open)", date: 'the date, e.g. "12 December 2026" or "2026-12-12"' },
  },
  {
    name: "choose_by_number",
    generic: true,
    purpose:
      "Compare the blocks on screen (rows, cards, list items) by a number each shows — a price, a unit price, hours, a rating — and press a control in the lowest or highest one: \"add the cheapest pack\", \"click the cheapest result that is not Sponsored\", \"open the longer-lasting model\". Reports the numbers it compared.",
    args: {
      by: '"lowest" (default) | "highest"',
      measure: '"price" (default: a money amount) | "number" | a regex with one capture group for the figure, e.g. "([\\d.]+)\\s*hours"',
      only: 'only blocks naming this, as whole words, take part — e.g. "Voltpine Alkaline AA" keeps the AA packs and not the AAA ones (optional)',
      exclude: "blocks containing this text are left out, e.g. \"Sponsored\" (optional)",
      within: "the region holding the blocks (optional)",
      ...TARGET_ARGS,
    },
  },
  {
    name: "scroll_to",
    generic: true,
    purpose: "Scroll the page (or the scrollable list/table on it) until an element named by role+name or text comes into view — for long pages and lists that load more as you scroll. Fails if it never appears.",
    args: { ...TARGET_ARGS, timeoutMs: "budget in ms (default 60000)" },
  },
  {
    name: "drag",
    generic: true,
    purpose: "Drag one element (a list row, card or handle named by its text) and drop it on another, before it by default; confirms the list changed.",
    args: { from: "text of the element to drag", to: "text of the element to drop it on", place: '"before" (default) | "after"' },
  },
  {
    name: "dialog",
    generic: true,
    purpose: "Arm the answer to the NEXT browser dialog (alert / confirm / prompt) BEFORE the click that opens it: accept or dismiss, with optional text for a prompt. Pair with expect_dialog to assert what it said.",
    args: { action: '"accept" (default) | "dismiss"', text: "text to type into a prompt (optional)" },
  },
  {
    name: "expect_dialog",
    generic: true,
    assertion: true,
    purpose: "Assert that a browser dialog appeared since it was armed and, optionally, that its message contained a text.",
    args: { text: "substring the dialog's message must contain (optional)" },
  },
  {
    name: "expect_download",
    generic: true,
    assertion: true,
    purpose:
      "Assert that the browser saved a file during this plan and check its contents: the file name, text it must contain or must not, its data-row count (CSV/log: lines below the header), or a JSON path's value. Works for text, CSV, JSON, logs and simple PDFs.",
    args: {
      name: "the file name expected, e.g. \"orders.csv\" (optional: the newest download)",
      contains: "text or array of texts the file must contain (optional)",
      notContains: "text or array of texts the file must not contain (optional)",
      rows: "expected number of data rows below the header (optional)",
      eachRow: "text every data row must contain, e.g. a status (optional)",
      json: 'a JSON path such as "orders[2].status" (optional, with equals)',
      equals: "the value the JSON path must equal",
    },
  },
  {
    name: "switch_company",
    generic: true,
    purpose:
      "Sign the console in as another QA test company (by company id) and reload — for cases comparing tenants. Only known QA tenants are allowed; never changes any setting.",
    args: { companyId: "numeric company id named by the case (e.g. 32461)" },
  },
  {
    name: "skip",
    generic: true,
    purpose:
      "NEGATIVE TESTS ONLY: mark a mandatory step as deliberately left out (e.g. skip{step:\"select_template\"}) so it is not repaired back in. Must be followed by an assertion of the block (expect_publish_blocked, attempt, expect_error, expect_message, expect_disabled).",
    args: { step: "the domain step deliberately omitted", reason: "why (the case's premise)" },
  },
  {
    name: "attempt",
    generic: true,
    assertion: true,
    purpose:
      "NEGATIVE TESTS: try an action the case says the app must REFUSE, and pass only on positive evidence of the refusal — an error/warning toast, an inline message, a disabled control, or (expect:\"nothing_opens\") no drawer/dialog opening on a ready screen. Fails if the app allows it, and fails as 'could not tell' if the action broke for our own reasons. For a refused PUBLISH prefer expect_publish_blocked.",
    args: {
      step: 'the action to try: "click" | "save_draft" | "publish" | "add_line_items" | "set_schedule" | "fill" | "select" | "toggle" | …',
      args: "the inner step's args as an object, e.g. {role:\"button\", name:\"Items\"} for a click",
      because: "substring the refusal message must contain (optional)",
      expect: '"refused" (default: a message or a disabled control) | "nothing_opens"',
    },
  },
];

export const GENERIC_NAMES = GENERIC_STEPS.map((s) => s.name);

/** Steps that only read the screen — no state changes. */
export const GENERIC_READS = new Set(["expect_text", "expect_visible", "expect_count", "expect_value", "expect_message", "expect_remembered", "remember", "hover", "press", "expect_download", "expect_dialog"]);
