# 6. Gap backlog — what still cannot run, and how to build it

Numbers: sourcing-side cases from the 12 Nov baseline census (`data/gap-close/census-baseline.json`, before the
12 Nov fixes). Re-run `scripts/gap-census.ts` for today's numbers. Ordered by value ÷ effort.

## Next (high value, contained)

### Award split — BUILT 12 Nov, catalog not yet published
`allocate_award{vendor: name | 1 | 2, quantity, line}` + `expect_award_counters{proposal, l1, nonL1}` work live on
PROCOL DEMO (closed_two_bids ZE5wY1Fw: 6 to Vendor B, 4 to Vendor A → Tot. Proposal Value ₹940, L1 ₹540, Non-L1 ₹400,
Awarded Vendors 2/2). How the product does it (dashboard `comparisonSelectionFormatter.jsx`): with partial awarding on,
the LINE's "Select for Awarding" checkbox opens "Are you sure you want to award this vendor?" with "Quantity Offered *"
(placeholder "Enter quantity") + "Award"; an awarded vendor is unticked and awarded again to change its quantity; the grid
re-renders after every change. The vendor's column is found by the column header's ACCESSIBLE name (the visible text
is cut short in the page). To let the compiler use it: `dump-plan-catalog.ts`, then recompile the award-split cases
(publishing marks every stored plan stale — see 4.1 step 5).

#### The original analysis (67 cases, `award-split`)
"Type 6 against Vendor B and 4 against Vendor A", "4 units remain unawarded", proposal totals 540 + 400 = 940.
- PROCOL DEMO has `is_partial_awarding_enabled = true` (company override). The start state exists (`closed_two_bids`).
- Build: `allocate_award{vendor, quantity}` (and `award_event{split:[{vendor, quantity}]}`) in `steps.ts` +
  `AwardPage.allocateQuantity(vendor, line, qty)` in `src/pages/AwardPage.ts` from the live awarding grid
  (see `data/gap-close/probe-award.log` for the controls learnt on 12 Nov); `expect_award_counters` already reads
  "Awarded Vendors"; add `expect_proposal_lines{vendor, quantity, amount}` reading the proposal page.
- Then the proposal fill+submit (`award_event` does it whole; a case that checks the proposal's own fields needs
  `create_proposal{submit:false}` + `expect_*` + `submit_proposal`).

Seen live on 12 Nov (event ZE5wY1Fw, closed_two_bids, screenshot
`procol-ui-tests/evidence/probe-award-mwdkidzx/map-05-awarding-two-bids-allocated.png`): the awarding grid has one
column per vendor ("QA_Platform Vendor N … Select All"), rows Selection (Select for Awarding / Awarded), a second
Selection row (an editable cell while the vendor is not awarded), Product, Qty Offer ("10 KG"), Freight Custom,
GST Custom, Account Assignment, Last Purchase Price, and under "Rfq Final" Sum Total and PQ Rating; the top bar
reads Tot. selected line items "1/1", Tot. Proposal Value, Tot. L1 / Non L1 Proposal Value; "8 hidden fields" hides
more rows (the award quantity is expected there — `probe-award-hidden.log`). Ticking Vendor 2's Select All gave
1/1 items, "Awarded Vendors (1/2)", proposal ₹900 = L1. The built event's product is the journey catalog's
(AAC Block 600x250x150MM, Variant 1), not the sheet's CYLINDER WITH KEY & KNOB — a case that names the product needs
the test-data map or the journey's product switched.

### An RFQ in evaluation (start-state, SRC-SET-003 — 63 cases)
`closed_two_bids` ends the bidding window, but whether an evaluation window is running depends on the company's
default evaluation time; "Send Bulk Counter Offer" and other evaluation-time actions need one running (12 Nov,
SRC-NEG-024 ran on closed_two_bids: the stage menu offered Recreate Order, Extend Submission Time, Withdraw, Convert
to Auction, Rejected Bids, Order Activity, Edit Evaluation Time). Build `evaluation_two_bids`: the round's
configurations with an evaluation time (the create screen's "Evaluation time" in the Schedule drawer → the stage
body's evaluation fields; read them from a stage made on screen first), stop after wait_close, read it back.

### Per-line quantities and prices, a third bidder (start-state, ~25 cases)
"line 1 (10 units: A 100, B 90) and line 2 (5 units: A 50, B 60)", "A 100, B 90, C 95".
- `eventJourney.ts`: `lineQuantities?: number[]` used by create_draft's line_items; `bidPrices?: number[][]`
  (per bidder, per line) used by bid_products' rows; `extraBidders` from `qaVendorsFor` (DEMO has 4 QA vendors).
- `uiSetup.ts`: bidders = prices.length; `StateShape.lines` from per-line words.
- `sheetCases.ts shapeFromWords`: read "line N (Q units: A p, B q)" and "C 95". The case's words override the set-up
  event's default shape (merge, words win).

### Before/after unchanged (48 cases, `unchanged`)
"nothing on the event changes until …", "no new event was created", "exactly one new event".
- `remember{key, target}` / `expect_remembered{same}` exist for screen values; add an API read-back pair:
  `remember_record{what: event|events_count|orders_count}` / `expect_record_unchanged{what}` (the run's own event via
  `context.eventGroupUuid`, counts via the read-only DB) — the strongest proof of "nothing changed".

### Events list per tab (21 cases, `events-list`)
"absent from History, Drafts and Recurring", "moves from Drafts to Live with the same title".
- `expect_event_in_list{title, tab, present}` exists; give it `tabs:[…]` and teach the compiler that the run's own
  event title is `context.title` (the API renames to `spine-API-automation-<n>`: match by uuid read back).

### Absolute date-time (18 cases, `absolute-time`)
"enter 01 January 2020 12:00 PM" in Extend / Reschedule / Edit Evaluation Time.
- `extend_time` / `reschedule_event` take relative values ("-10m", "+2h"); add `at:"<ISO or dd MMM yyyy hh:mm a>"`
  typed through the date picker formats already tried in turn (commit 99858cd).

### Activity log (27 cases, `activity-log`)
"Order Activity contains an entry for the extension, with the buyer and the time".
- Read the Order Activity drawer (summary page) and the API it calls; `expect_activity{contains, by, after}`.
  RCA observation EVT-016: the drawer was empty after an extension (API 200 `{"items":[]}`) — the step must tell an
  empty log from an unread one.

### Files (47 cases, `files`)
Upload attachments with fixtures (`procol-ui-tests/fixtures/`: a small PDF, an xlsx, a >limit file) and download a
report (Playwright `waitForEvent("download")`, read the xlsx with `xlsx`, compare with Master QCS).

## Needs a capability, not a step

### Identity vault (98 cases, `identity`)
Approver approves/rejects, the planner without permission, the assignee's bell, a second vendor's own portal view.
- A tester grants named TEST identities once (`config/identities.json`: company, role, user id; QA users only,
  `qa_…@example.com`, created by the tester), the runner mints their session (`tokenMint.ts`, the company's UAT OTP
  rule) and a `switch_identity{role}` step opens a second browser context as them. Until granted: Blocked with the
  exact text to check. Never a real person (DLF 4 Nov: refused, correctly).

### Mailbox (102 cases, `mailbox` — the EMA approval-by-email cases)
They need the tester's own inbox (plus-alias trap: memory `procol-email-approvals-run`). A mailbox reader over the
tester-owned account (IMAP / Gmail API with the tester's consent) behind `expect_email{to, subject, contains}` and
`reply_email{action}`. Until then: Blocked.

### PO and PR records (87 cases, `po-records`)
`create_po` + `expect_po_items` exist when the buyer is the approver; add read-backs of the PO / PR status
(`expect_po{vendor, quantity, amount}`, `expect_pr_status{Open|In Progress|Ordered}`) from the API + DB. Needs the
award split first for "one PO per vendor with the split quantities".

## Leave manual (say so in the case)
Mobile app (7), a phone/SMS, outside systems (SAP), PRD-roadmap cases about plan tiers (Growth/Enterprise) and RBAC
roles the test company does not have.

## Platform bugs found while closing gaps (12 Nov)
- Derived sheets reuse case ids across sheets (DRV-CO-001 in 6 sheets with different content): stored plans keyed by
  id overwrite each other. Fix: prefix derived ids with the sheet's slug, or key stored plans by sheet + id.
- A model failure during a batch compile stored a generic fallback over a real plan (fixed in night-compile: a
  fallback never replaces a stored real plan).
- To verify (product, small): a vendor newly awarded beside another keeps "–" in its "Qty Awarded" cell until the
  awarding screen is reloaded, while the totals already count its units (seen twice, 12 Nov, ZE5wY1Fw).
- To verify (product, possibly a data leak): on `closed_two_bids` the build's INV-ISOLATION check saw QA Vendor 2's
  unit price (90), bid total (900) and company name in data read in QA Vendor 1's session (stage
  `inline_components…prices_hash`, `increase_auction_slot`, `participants_data`). Confirm from the vendor portal's own
  network (vendor 1 signed in) on a fresh event before reporting — 10 Nov saw the company name only, unconfirmed.
