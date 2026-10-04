import type { StepSpec } from "./steps.js";
import { SCREEN_NAMES } from "./screens.js";

/** The prepared-state and expectation steps (executor: expectations.ts). Kept free of Playwright so the catalog dump stays light. */
export const EXPECTATION_STEPS: StepSpec[] = [
  {
    name: "open_prepared",
    purpose:
      "FIRST STEP of a case whose starting state was built through the API: open the named screen on that event (no create, no publish, no search). Waits for the API calls that feed the screen and fails as 'could not tell' if they never come.",
    args: { screen: `one of: ${SCREEN_NAMES.join(" | ")}` },
  },
  {
    name: "expect_navigated",
    assertion: true,
    purpose: "Assert the browser is now on a named screen (after a click that should move it): the URL matches the screen's route and the screen is ready.",
    args: { screen: `one of: ${SCREEN_NAMES.join(" | ")}`, path: "or: a substring the URL must contain" },
  },
  {
    name: "expect_field_error",
    assertion: true,
    purpose: "Assert an inline error is shown AT a field (its form item / cell), optionally containing text — not a toast somewhere else.",
    args: { field: "the field's label as on screen", message: "substring the error must contain (optional)" },
  },
  {
    name: "expect_toast",
    assertion: true,
    purpose: "Assert a toast appeared after the previous action — of a kind (success | error | warning | any), optionally containing text. Reads toasts that already faded.",
    args: { kind: '"success" | "error" | "warning" | "any"', text: "substring (optional)" },
  },
  {
    name: "expect_api_value",
    assertion: true,
    purpose:
      "Assert the screen shows a value the API holds for this case's event — the event title, the vendor's name, the line item’s quantity and unit, the bid price and bid total — compared as a person reads it (₹, commas and .00 ignored).",
    args: { key: '"title" | "vendorName" | "quantity" | "unit" | "bidPrice" | "bidTotal"', within: "region text (optional)" },
  },
  {
    name: "expect_order",
    assertion: true,
    purpose:
      "Assert order on screen: either the given texts appear in exactly this order, or the cells of a column/list (role+name/text) are sorted asc/desc (numbers compared as numbers).",
    args: { items: "array of texts in the expected order (optional)", text: "a text every compared cell contains (optional)", by: '"asc" | "desc" (with text/role)' },
  },
  {
    name: "expect_screen_clean",
    assertion: true,
    purpose:
      "Assert the current screen passes the observation rules: no NaN / undefined / null / raw ids on screen, no server error or page crash since the previous look.",
  },
  {
    name: "expect_request",
    assertion: true,
    purpose:
      'Assert the screen SENT a request to the backend during this run (and how it was answered) — for cases that say "the screen calls GET /templates/…" or "POST /event_groups with …". Matches the request path (a fragment, ids may be left out), optionally its method, a query fragment and the answer status. Waits up to timeoutMs for it. It cannot read request bodies.',
    args: { path: 'a path fragment, e.g. "/templates/excel_template"', method: '"GET" | "POST" | "PATCH" (optional)', query: "a query-string fragment (optional)", status: "expected HTTP status (optional; default any 2xx)", timeoutMs: "optional, default 15000" },
  },
];

export const EXPECTATION_NAMES = EXPECTATION_STEPS.map((s) => s.name);

