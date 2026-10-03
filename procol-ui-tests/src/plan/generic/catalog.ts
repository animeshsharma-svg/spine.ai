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
      screen: '"stage" | "responses" | "overview" | "participants" | "analytics" | "price_trends" | "participant_remarks" | "tab" | "path" | "events_list" | "event" | "master_qcs"',
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
      "Click an element named by role+name, label or text (e.g. the toolbar \"Items\" button, a menu item, a radio). Fails if the element is not found or is disabled — use attempt{step:\"click\"} when the case expects the click to be refused.",
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
    purpose: "Type a value into a text field found by its label or placeholder (or role textbox + name), then confirm the field holds it.",
    args: { label: "field label or placeholder", value: "text to type" },
  },
  {
    name: "select",
    generic: true,
    purpose: "Choose an option in a dropdown/select found by its label (antd or native), then confirm the select shows it.",
    args: { label: "the select's label or placeholder", option: "visible text of the option to choose" },
  },
  {
    name: "toggle",
    generic: true,
    purpose: "Set a switch or checkbox found by its label to on or off, then confirm its state.",
    args: { label: "switch/checkbox label", on: "true | false" },
  },
  {
    name: "upload",
    generic: true,
    purpose: "Attach a fixture file to an upload control found by its label/text (opens the file chooser or fills the file input).",
    args: { label: "the upload control's label or text", file: '"sample.pdf" | "sample.png" | "sample.csv" | "sample.txt" (fixtures only)' },
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
export const GENERIC_READS = new Set(["expect_text", "expect_visible", "expect_count", "expect_value", "expect_message", "expect_remembered", "remember", "hover", "press"]);
