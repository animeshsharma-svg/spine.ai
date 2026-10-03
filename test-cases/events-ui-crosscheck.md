# Events — UI ↔ API cross-check, second batch of screens

The first batch (`ui-api-crosscheck.md`, UI-XCHK-001 … 061) covers the events list,
Project Details, a stage's Responses grid and Overview tab, and Master QCS. This file
adds the screens after bidding: the award proposal, the technical (RFP) responses and
their evaluation, ranks and the live countdown, a stage's Participants and Price Trends
tabs, the Overview's Product Sheet and Bidding Summary, and the proposal status on
Master QCS.

How every case here is judged (the same rules as the first batch, plus two):

- **The API is the reference.** What the backend sent for this screen, captured from
  the browser's own traffic while the screen was open.
- **Comparisons are by meaning.** "₹ 2,925" equals 2925; a time is compared in India
  time to the minute; a status is compared with the words the console uses for it.
- **What the screen is supposed to show comes from the console's own code.** Every
  field a case checks was traced to the line of the console's code that renders it;
  the trace is kept with the check and shown in the result's Details. A difference the
  console makes on purpose (a zero shown as a dash, a long name cut short) is not a
  disagreement.
- **A disagreement is reported only when it repeats on a second fresh test event**,
  the raw API value and the raw screen text are both kept, and the company's own
  display settings are ruled out. Anything else is "couldn't tell", with the reason.
- **Couldn't tell is never a pass.** A screen the automation could not read is not a
  product failure.

Run them (read-only, on an existing event):
`COMPANY_ID=198678 CROSSCHECK_EVENT=<event id> npx playwright test tests/crosscheck.spec.ts --project=chromium --no-deps`
— the event should have bids and an award proposal, e.g. one built by
`npx tsx scripts/xchk-build-event.ts` in prototype/ (QA test vendors only).

**Contents**

1. [The award proposal page](#1-the-award-proposal-page)
2. [The technical stage's responses and evaluation](#2-the-technical-stages-responses-and-evaluation)
3. [Ranks and time left](#3-ranks-and-time-left)
4. [A stage's Participants tab](#4-a-stages-participants-tab)
5. [A stage's Price Trends tab](#5-a-stages-price-trends-tab)
6. [The Overview's Product Sheet and Bidding Summary](#6-the-overviews-product-sheet-and-bidding-summary)
7. [The proposal's status on Master QCS](#7-the-proposals-status-on-master-qcs)

## 1. The award proposal page

#### UI-XCHK-PROP-001 — The proposal's Overview shows the selected line items, total, L1 and non-L1 proposal values the API computed
- **Why it matters.** Approvers decide on these totals. A total that differs from what
  the system computed means money is approved on a wrong figure.
- **Setup.** A published event with bids and an award proposal.
- **Steps.** 1. Open the event. 2. Open Master QCS. 3. Click "Bid Selection Proposal".
  4. Read the Overview panel.
- **Expected.** "Tot. selected line items" reads awarded items out of all items;
  "Tot. Proposal Value", "Tot. L1 Proposal Value" and "Tot. Non L1 Proposal Value" are
  the amounts the system computed for the proposal.
- **Oracle.** Each value next to its label; amounts compared as numbers.
- **Trace.** P0 · automate · `tests/crosscheck.spec.ts` · map `06-proposal.json` · `projectProposal.jsx:1020-1038`

#### UI-XCHK-PROP-002 — The proposal names the event's RFX number, who recommended it, and its approval workflow and conditions as the API returns them
- **Why it matters.** The approval conditions explain why this approver was asked;
  a wrong threshold in the sentence misleads the approver.
- **Setup.** As UI-XCHK-PROP-001, with an approval workflow that applies.
- **Steps.** 1. Open the proposal. 2. Read "RFX No", "Proposal Recommended By",
  "Approval Workflow Name" and "Approval Workflow Conditions".
- **Expected.** The values match the proposal; the conditions read as the console
  writes them, e.g. "Total Proposal Value is more than 1".
- **Oracle.** Values next to their labels; the conditions sentence rebuilt with the
  console's own rule and compared.
- **Trace.** P2 · automate · `tests/crosscheck.spec.ts` · map `06-proposal.json` · `projectProposal.jsx:127-183`

#### UI-XCHK-PROP-003 — The Allocation Summary lists every awarded vendor with the items selected and total amount the API returns
- **Why it matters.** This table is the award: which vendor gets how many items for
  how much. A wrong amount on a vendor's row is an award letter with the wrong value.
- **Setup.** As UI-XCHK-PROP-001; ideally a split award to three vendors.
- **Steps.** 1. Open the proposal. 2. Read the Allocation Summary.
- **Expected.** One row per awarded vendor; "Total Items selected", "Total Amount"
  (and the L1 columns when present) match the proposal.
- **Oracle.** Each value in its column on the vendor's row.
- **Trace.** P0 · automate · `tests/crosscheck.spec.ts` · map `06-proposal.json` · `allocationColumns.js:1-42`

#### UI-XCHK-PROP-004 — The Note for Approval shows the note the buyer wrote, as the API stores it
- **Why it matters.** The note is the buyer's justification to the approver.
- **Setup.** As UI-XCHK-PROP-001, with a note.
- **Steps.** 1. Open the proposal. 2. Read "Note for Approval".
- **Expected.** The note's text, as written.
- **Oracle.** The stored rich-text note turned into plain text is on the page.
- **Trace.** P3 · automate · `tests/crosscheck.spec.ts` · map `06-proposal.json` · `projectProposal.jsx:1112-1147`

#### UI-XCHK-PROP-005 — The proposal's Participants panel lists every invited vendor, numbered 1, 2, 3 …, with each stage's bid status
- **Why it matters.** Approvers check who was invited and who bid before approving.
  A row without a number, or a wrong status, undermines that check.
- **Setup.** As UI-XCHK-PROP-001.
- **Steps.** 1. Open the proposal. 2. Open the Participants panel. 3. Read "S No.",
  Location, Type and each stage's column for every vendor.
- **Expected.** Rows numbered 1, 2, 3 … in order; location, invitation type and each
  stage's status ("Bid placed", "Not Participated" …) as the system records them.
- **Oracle.** Each value in its column on the vendor's row; the serial number is the
  row's position.
- **Trace.** P2 · automate · `tests/crosscheck.spec.ts` · map `06-proposal.json` · `participantsTable.jsx:153-155` · `projectProposal.jsx:1175`

#### UI-XCHK-PROP-006 — The proposal's Order Allocation shows each awarded vendor's offered and awarded quantity, rates and totals as the API returns them
- **Why it matters.** "Qty Awarded" is what the vendor will be asked to deliver.
- **Setup.** As UI-XCHK-PROP-001.
- **Steps.** 1. Open the proposal. 2. Read the Order Allocation grid.
- **Expected.** A column per vendor; Qty Offer, Qty Awarded, rates and Sum Total match
  the proposal sheet (hidden fields excepted).
- **Oracle.** Each value on its row (the template's field name) in the vendor's column,
  below the Order Allocation heading.
- **Trace.** P0 · automate · `tests/crosscheck.spec.ts` · map `06-proposal.json` · `projectTransforms.js:445-575`

## 2. The technical stage's responses and evaluation

#### UI-XCHK-TECH-001 — Every vendor that responded to the technical stage has a column, with the time its response was submitted
- **Why it matters.** Evaluators must see every response; the submission time settles
  disputes about late responses.
- **Setup.** A published technical + pricing event where a QA vendor submitted a
  technical response.
- **Steps.** 1. Open the event. 2. Click the technical stage's tab. 3. Read the vendor
  columns and the time under each vendor's name.
- **Expected.** A column per responding vendor; the submission time (India time, to
  the minute) is the one the system recorded.
- **Oracle.** Vendor name on screen; the time beside it, allowing for the console's own
  clock adjustment.
- **Trace.** P1 · automate · `tests/crosscheck.spec.ts` · map `07-technical.json` · `comparisonHeaderFormatter.jsx:698-700`

#### UI-XCHK-TECH-002 — Each section of the technical sheet shows the line item's code and quantity, its evaluation status and its evaluator as the API returns them
- **Why it matters.** "TR Submitted" against the wrong section, or the wrong evaluator,
  sends the evaluation to the wrong person.
- **Setup.** As UI-XCHK-TECH-001, after the evaluation was submitted.
- **Steps.** 1. Open the technical stage. 2. Read each section header.
- **Expected.** Item code, quantity, status ("TR Submitted" when scored) and the
  evaluator's name match the stage.
- **Oracle.** Each value on the page in the console's words.
- **Trace.** P2 · automate · `tests/crosscheck.spec.ts` · map `07-technical.json` · `constants.js:242-253`

#### UI-XCHK-TECH-003 — Every answer and evaluation score a vendor gave is shown on its question's row, in that vendor's column
- **Why it matters.** Evaluators score what they see. An answer on the wrong row, or
  in the wrong vendor's column, gets the wrong score.
- **Setup.** As UI-XCHK-TECH-001.
- **Steps.** 1. Open the technical stage. 2. For each question, read the vendor's answer.
- **Expected.** Each answer on the row titled with the question (and its description),
  under the vendor who gave it; a score shows its label.
- **Oracle.** Answer text on the question's line inside the vendor's column.
- **Trace.** P1 · automate · `tests/crosscheck.spec.ts` · map `07-technical.json` · `selectors.js:1510-1515`

## 3. Ranks and time left

#### UI-XCHK-RANK-001 — Each bidder's rank badge and each line's Rank cell show the rank the API gives
- **Why it matters.** In an auction the rank is the whole game: the buyer awards and
  negotiates on it. A badge that says 1 for the second-best bidder is a costly error.
- **Setup.** An auction (or rank-showing RFQ) with at least two QA vendors' bids.
- **Steps.** 1. Open the auction stage. 2. Read the badge by each bidder's name and
  the Rank cell on each line.
- **Expected.** Badge and Rank cell show the system's current rank for that bidder.
  Where the console hides the badge by its settings, the case says so instead.
- **Oracle.** The number next to the bidder's name and in the bidder's Rank column,
  using the same source the console uses (live rank indicators first).
- **Trace.** P0 · automate · `tests/crosscheck.spec.ts` · map `08-standings.json` · `selectors.js:5681-5690,5912-5941`

#### UI-XCHK-RANK-002 — While a stage is live, the header timer shows the time left to the API's closing time
- **Why it matters.** Vendors and buyers act on the countdown; a timer off by minutes
  makes people miss the close.
- **Setup.** A stage that is open for bidding when the screen is read (or in its
  extra closing time).
- **Steps.** 1. Open the live stage. 2. Read the timer in the header.
- **Expected.** The time left equals the closing time minus now, within a few seconds.
- **Oracle.** Timer text in seconds against the closing time and the moment the screen
  was read (15 seconds' slack plus the measured clock difference).
- **Trace.** P1 · automate · `tests/crosscheck.spec.ts` · map `08-standings.json` · `helpers.js:720-756`

## 4. A stage's Participants tab

#### UI-XCHK-PART-001 — The stage's Participants tab lists every vendor invited to the stage, with the email the API returns
- **Why it matters.** This is where a buyer checks who was invited and enters a bid on
  a vendor's behalf; a missing vendor cannot be bid for.
- **Setup.** A published stage with QA vendors invited.
- **Steps.** 1. Open the stage. 2. Click Participants. 3. Turn on "Show only selected
  vendors". 4. Read the list.
- **Expected.** Every invited vendor is listed, with its email.
- **Oracle.** Vendor name on screen; its email on the same line.
- **Trace.** P2 · automate · `tests/crosscheck.spec.ts` · map `09-participants.json` · `audienceList.jsx:421-449`

## 5. A stage's Price Trends tab

#### UI-XCHK-TRND-001 — Price Trends Details lists every past deal the API returns with its price, quantity, location, vendor and closing time in India time
- **Why it matters.** Buyers use past prices to judge today's bids.
- **Setup.** A pricing stage for a product with past deals.
- **Steps.** 1. Open the stage. 2. Click Price Trends. 3. Read the chart legend and the
  first page of "Price Trends Details".
- **Expected.** The legend counts the deals per product; the first ten deals, newest
  first, each show price, quantity, location and vendor on the row with its closing
  time.
- **Oracle.** A row found by its closing time; every other value on that row.
- **Trace.** P2 · automate · `tests/crosscheck.spec.ts` · map `10-price-trends.json` · `priceTrendsHistory/columns.jsx:12-58`

## 6. The Overview's Product Sheet and Bidding Summary

#### UI-XCHK-OVW-001 — The Product Sheet shows each line item's requested quantity, unit, delivery location and other buyer values as the API returns them
- **Why it matters.** The Product Sheet is the buyer's own record of what was asked for.
- **Setup.** A published pricing stage.
- **Steps.** 1. Open the stage. 2. Click Overview. 3. Read the Product Sheet.
- **Expected.** For every line, each buyer column (Quantity Requested with its unit,
  Delivery location, Product Variant …) matches the stage.
- **Oracle.** Each value under its column on the product's row.
- **Trace.** P1 · automate · `tests/crosscheck.spec.ts` · map `11-overview-more.json` · `eventDetails.jsx:1825-1913`

#### UI-XCHK-OVW-002 — The Bidding Summary lists every rank's vendor and quoted price, best first, as the API ranks them
- **Why it matters.** A summary that puts the second-best vendor under "Best Market
  Price" points the buyer at the wrong vendor.
- **Setup.** A pricing stage with at least two bids.
- **Steps.** 1. Open the stage's Overview. 2. Read "Line Item Wise" in the Bidding
  Summary.
- **Expected.** Under "Best Market Price", "Rank 2 Market Price" … the vendor and price
  of that rank.
- **Oracle.** Each rank's value in its position on the row, left to right.
- **Trace.** P0 · automate · `tests/crosscheck.spec.ts` · map `11-overview-more.json` · `biddingSummary.jsx:23-84`

#### UI-XCHK-OVW-003 — Order Details show the stage's location as the API returns it
- **Why it matters.** Vendors price delivery to this location.
- **Setup.** A published stage.
- **Steps.** 1. Open the stage's Overview. 2. Read "Location" under Order Details.
- **Expected.** The stage's location text (the console takes it from the stage's
  description).
- **Oracle.** Value next to the label.
- **Trace.** P3 · automate · `tests/crosscheck.spec.ts` · map `11-overview-more.json` · `eventDetails.jsx:1479-1490`

#### UI-XCHK-OVW-004 — When savings are compared on the whole lot, the Overview's Savings Summary shows the same savings the stage's Responses tab shows
- **Why it matters.** A buyer who reads "–" for savings on the Overview and ₹30 on the
  Responses tab for the same stage cannot tell which one to report.
- **Setup.** A pricing or auction stage whose savings are compared on the whole lot
  (not per line item), with a bid below the reference price.
- **Steps.** 1. Open the stage. 2. Read the savings on the Responses tab. 3. Click
  Overview. 4. Read Savings Summary.
- **Expected.** The Savings Summary shows the same savings amount as the Responses tab.
- **Oracle.** The amount next to "Savings" equals the stage's computed savings. The
  console reads the first bidder's own savings record here, so a difference means the
  two values the system sends disagree.
- **Trace.** P1 · automate · `tests/crosscheck.spec.ts` · map `11-overview-more.json` · `eventDetails.jsx:473-498`

## 7. The proposal's status on Master QCS

#### UI-XCHK-MQCS-001 — Master QCS shows the award proposal's button with the status the API gives the proposal
- **Why it matters.** "Approval in Progress" versus "Draft" tells the buyer whether the
  award has left their hands.
- **Setup.** A published event with an award proposal.
- **Steps.** 1. Open the event. 2. Open Master QCS. 3. Read the tag on "Bid Selection
  Proposal".
- **Expected.** The tag reads the proposal's status in the console's words (Draft,
  Approval in Progress, Rejected, or the purchase-order status once selected).
- **Oracle.** Status next to the button label.
- **Trace.** P2 · automate · `tests/crosscheck.spec.ts` · map `12-qcs-proposal.json` · `masterQcs.jsx:1013-1046`
