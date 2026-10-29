import type { StepSpec } from "./steps.js";

/**
 * MASTER QCS AND PARTICIPANT-LIST STEPS (executor: qcsAudienceSteps.ts).
 *
 * The two screens the gap ledger asked for most (data/vocabulary-gaps.json,
 * 19 Oct 2026): reading the comparison grid cell by cell (Qty Offer, Rank,
 * rate, amount = price × quantity, Sum Total, ranks against totals), and
 * working a published event's Participants list (search a vendor, read its
 * row, count the round's vendors, select a QA vendor). Kept free of Playwright
 * so the catalog dump stays light.
 */
export const QCS_AUDIENCE_STEPS: StepSpec[] = [
  {
    name: "expect_qcs_vendors",
    assertion: true,
    purpose:
      "On Master QCS (after open_master_qcs or open_prepared master_qcs), assert the comparison grid's VENDOR COLUMNS: how many there are, which vendors they are, and that each is headed by a real company name, not a placeholder (\"Vendor 1\", \"undefined\", \"-\"). Use for \"one column for the vendor\", \"both vendors appear\", \"the names are the real ones\".",
    args: {
      count: "exact number of vendor columns (optional)",
      vendors: "array of vendor names that must head a column (optional)",
      realNames: "true (default) to fail on a placeholder column name",
    },
  },
  {
    name: "expect_qcs_cell",
    assertion: true,
    purpose:
      "On Master QCS, read ONE cell of the comparison grid — a row (\"Qty Offer\", \"Rank\", \"RFQ Rate\", \"RFQ Amount\", \"Sum Total\", …) for one vendor column on one line item — and assert it. Compare with a fixed value, a number, or a value the API holds for this case (key). With no comparison it asserts the cell is filled. Row labels follow the template; the closest label is used and named in the result. A key (a value the API holds) exists only on a PREPARED state (open_prepared); in a plan that creates its own event, compare with number = the price the plan typed into place_surrogate_bid.",
    args: {
      row: 'the row label as the screen shows it, e.g. "Rank", "Qty Offer", "RFQ Rate", "Sum Total"',
      vendor: "vendor name or 1-based column number (optional; the only column, or the case's vendor)",
      product: "substring of the line item's heading (optional; the first line item that has the row)",
      equals: "exact text expected, as a person reads it — ₹, commas and spaces ignored (optional)",
      number: "a number the CASE ITSELF states, e.g. 1 for Rank 1 (optional) — never a guessed figure: for the quantity, the price or the total use key",
      key: 'compare with a value the API holds: "quantity" (Qty Offer), "bidPrice" (the rate), "bidTotal" (the amount) (optional) — the way to check any figure the case says must equal the bid',
      contains: "substring the cell must contain (optional)",
    },
  },
  {
    name: "expect_qcs_amounts",
    assertion: true,
    purpose:
      "On Master QCS, check the arithmetic the grid shows: for each vendor and line item the amount equals rate × quantity, and the vendor's Sum Total equals the sum of its line amounts. Use for \"Amount = price × quantity\", \"correct per-line and total amounts\". Lines a vendor did not bid are skipped and named.",
    args: {
      vendor: "vendor name or 1-based column number (optional; every vendor column)",
      product: "substring of one line item's heading (optional; every line item, and then the Sum Total too)",
      rate: 'row label of the unit price (optional; e.g. "RFQ Rate", found by default)',
      qty: 'row label of the quantity (optional; default "Qty Offer")',
      amount: 'row label of the line amount (optional; e.g. "RFQ Amount", found by default)',
      total: "false to skip the Sum Total check (optional)",
    },
  },
  {
    name: "expect_qcs_ranks",
    assertion: true,
    purpose:
      "On Master QCS, assert the ranks follow the amounts on every line item: on a buy event the lowest amount is Rank 1 and a higher amount never ranks better (order \"highest\" for a sell event). With one vendor it asserts that vendor is Rank 1. Use for \"lowest total is rank 1\", \"ranks follow the amounts\".",
    args: {
      by: 'row label the ranks follow (optional; the line amount, e.g. "RFQ Amount")',
      order: '"lowest" (buy, default) | "highest" (sell)',
      product: "substring of one line item's heading (optional)",
      atLeast: "the case needs at least this many ranked vendors (optional; fewer = could not tell)",
    },
  },
  {
    name: "search_participants",
    purpose:
      "On a PUBLISHED event's Participants list (open_prepared participants, or open_participants), type a vendor's name into \"Search vendors\" and wait for the list to narrow. Changes nothing on the event. Use before reading or acting on one vendor's row — the list is paginated, so a named vendor is usually not on page 1.",
    args: { vendor: "vendor name or email to search for (optional; the vendor select_participant added in this plan, else the case's own vendor)" },
  },
  {
    name: "expect_participant",
    assertion: true,
    purpose:
      "On a published event's Participants list, search a vendor and assert ITS ROW (the name is read from the row, not from a button): that it is listed (present) or not, whether its box is ticked (selected = on this round), and whether it offers Add Bid. Use for \"the vendor's row is visible with its Add Bid control\", \"the vendor appears in the selected list\", \"no Add Bid for this vendor\". A vendor the case itself calls nonexistent or made up (\"Acme Nonexistent Supplier\") is never asserted present: assert the fallback instead — expect_participant_count{atLeast:1}, or present:false for that name.",
    args: {
      vendor: "vendor name or email (optional; the vendor select_participant added in this plan, else the case's own vendor)",
      present: "true (default) the row must be listed; false it must not be",
      selected: "true / false — the row's box must be ticked / unticked (optional)",
      addBid: "true / false — the row must / must not offer Add Bid (optional)",
    },
  },
  {
    name: "expect_participant_count",
    assertion: true,
    purpose:
      "On a published event's Participants list, count the vendors on this round — \"Show only selected vendors\" on, search cleared, every page — and assert the number. Use for \"the count includes it\", \"the audience is not doubled\", \"exactly N participants\".",
    args: {
      count: "exact number (optional)",
      atLeast: "minimum number (optional)",
      grewBy: "after select_participant: how many more than the round held before it (e.g. 1) — use this, not count, after adding a vendor (optional)",
    },
  },
  {
    name: "select_participant",
    purpose:
      "On a published event's Participants list, add a vendor to the round: show every vendor, search it, tick its box (confirming if the app asks) and report what the app did. The vendor comes from the product's own list (the run may be set to QA test vendors only, and then refuses any other before clicking). Never invent a vendor name: name one only if the case does. Follow with expect_participant (no vendor = the one it added) and expect_participant_count{grewBy:1} — the round already holds the starting state's vendor, so never assert a fixed count after adding — or expect_error / expect_message for a refusal.",
    args: { vendor: "vendor name, only if the case gives a specific company name (optional). A case that names no specific company — \"a vendor\", \"a known test vendor company\" — leaves it out: the step adds a vendor from the product's own list not yet on the round, which is what such a case means" },
  },
];

export const QCS_AUDIENCE_NAMES = QCS_AUDIENCE_STEPS.map((s) => s.name);
