import type { TestCaseRecord } from "./caseLibrary.js";

/**
 * HOW MANY LINE ITEMS AN EVENT IS BUILT WITH.
 *
 * The count used to be invisible: every case body carried one line item,
 * hard-coded, and the tree offered "Line items" as a locked tick-box that said
 * nothing about size. But the count is a test dimension, not a feature — serial
 * numbering, multi-product events and the delete-the-last-one rules only mean
 * anything at a size you choose. So it became a knob, and this file is what
 * makes the knob safe to turn.
 *
 * The danger is obvious once stated: rewriting a case's request can destroy
 * the very thing the case proves. "Deleting the only line item is refused"
 * tests nothing if the run quietly gave it five, and it would go green while
 * proving the opposite. So expansion is conservative by construction — it
 * happens only where the body is plainly a generic one-item seed, and every
 * case held back at its own count is REPORTED rather than silently skipped.
 * Over-holding costs coverage; over-expanding costs the truth.
 */

/**
 * Whether a line item can be cloned — and if not, why not, in the reader's
 * terms.
 *
 * The reason matters as much as the answer. An earlier version returned a bare
 * boolean and reported every refusal as "deliberately malformed", which was
 * simply untrue of the PR-linked items and told anyone reading the run
 * something false about their own test data.
 */
function seedRefusal(item: unknown): string | undefined {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return "the case's line item is not an object, so there is nothing to duplicate";
  }
  const row = item as Record<string, unknown>;

  // A line item taken from a purchase request is a specific PR row. Putting the
  // same row on an event twice is not "two line items", it is double-booking
  // one demand — and the product refuses it. These cases keep their own shape.
  if (row.pr_line_item_id !== undefined || row.pr_line_item_uuid !== undefined) {
    return "this line item comes from a purchase request row, and the same row cannot be put on one event twice";
  }

  // A valid item names a product and a quantity. Anything else belongs to a
  // case about malformed input — "malformed line items are refused, not
  // coerced" — where duplicating it multiplies the malformation, not the event.
  if (typeof row.product_uuid !== "string" || !row.product_uuid) {
    return "the case's line item names no product, so it is testing a malformed request rather than a real one";
  }
  if (!row.quantity || typeof row.quantity !== "object") {
    return "the case's line item carries no quantity object, so it is testing a malformed request rather than a real one";
  }
  return undefined;
}

/**
 * Language that means the case owns its own line-item count.
 *
 * Matched against the case's title, documented expected result and steps —
 * the case's own words, not a list of ids maintained beside it, because an id
 * list goes stale the moment cases are regenerated and nobody notices.
 *
 * Deliberately broad. A case wrongly held back still runs, at the count its
 * author wrote; a case wrongly expanded runs a different test from the one it
 * claims and reports the answer as if nothing happened.
 */
const COUNT_OWNED =
  /\b(only|last|last remaining|single|sole)\s+(\*?active\*?\s+)?line[\s_-]?item|\b(one|two|three|four|five|both|no|empty|zero)\s+line[\s_-]?items?\b|\bline[\s_-]?items?\s+(count|serial|sequence)|serial numbers?\b|\bwithout line[\s_-]?items\b|\bboq\b/i;

export interface HeldCase {
  id: string;
  title: string;
  /** the count the case keeps */
  count: number;
  reason: string;
}

export interface LineItemOutcome {
  body: unknown;
  /** how many items the body ended up with, when it has a line_items array */
  count?: number;
  /** set when the body was left alone although a different count was asked for */
  held?: string;
}

/**
 * Returns the body this case should actually send.
 *
 * Never mutates the input: case records are loaded once and shared across
 * runs, so editing a body in place would leak one run's line-item count into
 * the next one.
 */
export function applyLineItemCount(
  record: Pick<TestCaseRecord, "id" | "title" | "expectedResult" | "steps" | "body">,
  requested: number | undefined,
): LineItemOutcome {
  const body = record.body as Record<string, unknown> | undefined;
  const items = body?.line_items;
  if (!body || !Array.isArray(items)) return { body: record.body };

  const current = items.length;
  if (!requested || requested === current) return { body: record.body, count: current };

  if (current === 0) {
    return { body: record.body, count: 0, held: "the case is about sending no line items at all" };
  }
  if (current > 1) {
    return {
      body: record.body,
      count: current,
      held: `the case was written with ${current} line items of its own`,
    };
  }
  const refusal = seedRefusal(items[0]);
  if (refusal) return { body: record.body, count: 1, held: refusal };

  const words = [record.title, record.expectedResult, ...(record.steps ?? [])].join(" ");
  if (COUNT_OWNED.test(words)) {
    return {
      body: record.body,
      count: 1,
      held: "the case's own wording depends on how many line items there are",
    };
  }

  // Clone the seed verbatim — same product, same quantity. The backend accepts
  // repeats of one product (verified live: two identical items, HTTP 200), and
  // varying the clones would quietly change what a quantity or product case is
  // asserting.
  const seed = items[0];
  const expanded = Array.from({ length: requested }, () =>
    JSON.parse(JSON.stringify(seed)) as unknown,
  );
  return { body: { ...body, line_items: expanded }, count: requested };
}

/**
 * Applies the count across a whole case set and reports what it did.
 *
 * The report is the point. A knob that silently applies to some cases and not
 * others is worse than no knob: the run looks like it tested five line items
 * throughout when a third of it tested one.
 */
export function planLineItems(
  records: Array<Pick<TestCaseRecord, "id" | "title" | "expectedResult" | "steps" | "body">>,
  requested: number | undefined,
): { bodies: Map<string, unknown>; expanded: number; held: HeldCase[]; eligible: number } {
  const bodies = new Map<string, unknown>();
  const held: HeldCase[] = [];
  let expanded = 0;
  let eligible = 0;

  for (const record of records) {
    const body = record.body as Record<string, unknown> | undefined;
    if (!body || !Array.isArray(body.line_items)) continue;
    eligible++;
    const outcome = applyLineItemCount(record, requested);
    bodies.set(record.id, outcome.body);
    if (outcome.held) {
      held.push({ id: record.id, title: record.title, count: outcome.count ?? 1, reason: outcome.held });
    } else if (outcome.count === requested && requested !== undefined) {
      expanded++;
    }
  }
  return { bodies, expanded, held, eligible };
}
