/**
 * RUN PARAMETERS — makes the UI journeys dynamic instead of hard-coded.
 *
 * Every journey used to bake its own values in (e.g. multi-line-item RFQ always
 * built exactly three rows: "a"/10, "b"/20, "c"/15). That meant changing the
 * line-item count from the dashboard had no effect on what actually ran.
 *
 * Now the count comes from the environment, so one journey covers "1 line item"
 * and "40 line items" without editing code:
 *
 *   UI_LINE_ITEMS=5   — line items for a normal (non-BOQ) event
 *   UI_BOQ_ITEMS=25   — line items for a BOQ event
 *   UI_QUIET_MAP=1    — don't print the full capability map (one journey per run)
 *
 * The caller is responsible for capping these to the client's own
 * `allowed_maximum_line_items` config ({boq, non_boq}) — the dashboard does that
 * before it ever launches Playwright.
 */

/** Read a positive integer from the environment, or fall back. */
function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** How many line items a normal (non-BOQ) event should build. Default 1. */
export function lineItemCount(): number {
  return intFromEnv("UI_LINE_ITEMS", 1);
}

/** How many line items a BOQ event should build. Default 10. */
export function boqItemCount(): number {
  return intFromEnv("UI_BOQ_ITEMS", 10);
}

/** True when the runner only wants the selected journey's output. */
export function quietCapabilityMap(): boolean {
  return process.env.UI_QUIET_MAP === "1";
}

export interface ProductSpec {
  searchText: string;
  quantity: string;
}

/**
 * Build N line-item specs.
 *
 * Search terms cycle through single letters (a, b, c…), which is what the
 * existing flows used — a one-letter search reliably returns products in the
 * picker. Quantities step up so each row is visibly distinct in the sheet,
 * which makes a screenshot of a failure easy to read.
 */
export function buildProducts(count: number): ProductSpec[] {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const n = Math.max(1, count);
  return Array.from({ length: n }, (_, i) => ({
    searchText: letters[i % letters.length],
    quantity: String((i + 1) * 10),
  }));
}

/** Line items for a normal event, ready to hand to createAndPublishErfx. */
export function normalLineItems(): ProductSpec[] {
  return buildProducts(lineItemCount());
}

/** Line items for a BOQ event. */
export function boqLineItems(): ProductSpec[] {
  return buildProducts(boqItemCount());
}

/** One-line summary for the test log, so a run says what it actually used. */
export function paramSummary(): string {
  return `line items: ${lineItemCount()} (non-BOQ) · ${boqItemCount()} (BOQ)`;
}

/**
 * Which template a journey should pick, by name substring.
 *
 * Empty means "the first one offered", which is the default every flow used
 * before. The point of reading it here is that the choice becomes a run-time
 * parameter like the line-item count, so the dashboard — or the AI, from a
 * typed instruction — can drive it without touching a flow.
 */
export function templateChoice(): string | undefined {
  const v = (process.env.UI_TEMPLATE ?? "").trim();
  return v || undefined;
}

/** Should the journey open the schedule drawer and edit the window? */
export function editSchedule(): boolean {
  return process.env.UI_EDIT_SCHEDULE === "1";
}

/** Minutes the event should run for, when the schedule is being edited. */
export function scheduleMinutes(): number | undefined {
  const n = Number(process.env.UI_SCHEDULE_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
