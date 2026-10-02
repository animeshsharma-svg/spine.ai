# Events — UI ↔ API cross-check cases

The backend can send the right data and the screen can still show something else:
a stale answer rendered over a fresh one, a number formatted with the wrong unit, a
status label that means one thing in the API and another on screen. These cases catch
exactly that. Each one opens a screen of an event, records every API response the
screen was built from, reads what the screen shows, and compares the two field by
field.

How every case here is judged:

- **The API is the reference.** What the backend sent for this screen, captured from
  the browser's own traffic while the screen was open (tokens masked).
- **Comparisons are by meaning, not by string.** "₹ 5,301" equals 5301; "30 September
  2026 05:18 PM" equals the epoch the API sent (India time, to the minute); "57.0 KG"
  equals 57 with the unit KG; "bid_placed" equals "Bid placed"; a visibly truncated
  name matches its full value.
- **Location matters.** A value counts only where it belongs — under its column, on
  its row, next to its label — not merely somewhere on the page.
- **Couldn't tell is never a pass.** If the API call behind a field was not seen, the
  case is inconclusive. A field the API leaves empty is recorded as "nothing to show".
- The field-to-screen map each case uses is reviewed and kept in
  `procol-ui-tests/src/crosscheck/maps/`; discovery runs list every payload value they
  found on screen in `maps/discovered/` so the map can be extended.

Run them all for one event (read-only):
`COMPANY_ID=198678 CROSSCHECK_EVENT=<event id> npx playwright test tests/crosscheck.spec.ts --project=chromium --no-deps`
— or a subset with `CROSSCHECK_CASES=UI-XCHK-011,UI-XCHK-013`.

**Contents**

1. [The events list](#1-the-events-list)
2. [The event's Project Details tab](#2-the-events-project-details-tab)
3. [A stage's Responses grid](#3-a-stages-responses-grid)
4. [A stage's Overview tab — summaries and schedule](#4-a-stages-overview-tab)
5. [Master QCS — the bid comparison](#5-master-qcs)
6. [Errors — the API and the screen must agree that something failed](#6-errors)
7. [The vendor's view](#7-the-vendors-view)

## 1. The events list

#### UI-XCHK-001 — The event's card in the list shows its title, reference, creator and item count as the API returns them
- **Why it matters.** The list is how a buyer finds an event. A card that shows the
  wrong reference or item count sends the buyer into the wrong event.
- **Setup.** A published event the signed-in buyer can see.
- **Steps.** 1. Open Events. 2. Type the event's title into the search box and press
  Enter. 3. Read the event's card.
- **Expected.** The card shows the event's title, its RFX reference, the creator's
  name and "N items", exactly as the backend returned them for this search.
- **Oracle.** Map `01-list.json`: each value must be inside the card (DOM row) that
  carries the event's reference; the item count on the card's first line.
- **Trace.** P1 · automate · `tests/crosscheck.spec.ts` · map `01-list.json`

#### UI-XCHK-002 — Each stage line on the event's card shows the stage code, title, participation and timeline the API returns
- **Why it matters.** The stage line is where a buyer sees, at a glance, how many
  vendors are active and whether a stage is overdue. A wrong count here is acted on.
- **Setup.** As UI-XCHK-001.
- **Steps.** 1. Search the list for the event. 2. Read each stage's line on its card.
- **Expected.** Each stage line shows its stage code, stage title, "active/invited"
  participants and timeline phrase (e.g. "Overdue by") as returned by the API.
- **Oracle.** Map `01-list.json`: values on the same visual line as the stage code.
- **Trace.** P1 · automate · `tests/crosscheck.spec.ts` · map `01-list.json`

#### UI-XCHK-003 — Searching the list by title shows exactly the events the API returned for that search
- **Why it matters.** When the list shows other events while the search box still
  holds the title, the buyer concludes the event does not exist — or opens a wrong one.
- **Setup.** As UI-XCHK-001. Run it twice: once after the list has loaded ("settled")
  and once typing as soon as the search box appears ("typed straight away").
- **Steps.** 1. Open Events. 2. Search for the event's title. 3. Read which events the
  list shows.
- **Expected.** The rows are exactly the events the search returned — here, the one
  event — and nothing else.
- **Oracle.** The RFX references on screen equal the references in the search
  response. When they differ, the run states which list request was sent before the
  search but answered after it.
- **Trace.** P0 · automate · `tests/crosscheck.spec.ts` · map `01-list.json` · special `list-search`

## 2. The event's Project Details tab

#### UI-XCHK-010 — The overview shows the event's title, project ID and creation time as the API returns them
- **Why it matters.** The project ID is quoted in every conversation about an event;
  the creation time is used in audits.
- **Setup.** A published event.
- **Steps.** 1. Open the event. 2. Read the title, "Project ID" and "Created at".
- **Expected.** Title, project ID and creation time (India time, to the minute) match
  the API.
- **Oracle.** Map `02-summary.json`: values next to their labels.
- **Trace.** P2 · automate · `tests/crosscheck.spec.ts` · map `02-summary.json`

#### UI-XCHK-011 — The Published Stages table shows each stage's code, title, participation and bidding window as the API returns them
- **Why it matters.** The bidding window on this table is what buyers tell vendors.
  A start or end time off by an hour (time zone) or a swapped column is a real loss.
- **Setup.** A published event with at least one stage.
- **Steps.** 1. Open the event. 2. Read each row of Published Stages.
- **Expected.** One row per stage the API returns; under each column — Stage Title,
  Participants, Bidding Starts At, Bidding Ends At — the API's value for that stage.
- **Oracle.** Map `02-summary.json`: row count equals the API's stage count; each value
  in its column on the stage's row.
- **Trace.** P1 · automate · `tests/crosscheck.spec.ts` · map `02-summary.json`

#### UI-XCHK-012 — Contact Info shows the buyer's name, email and phone as the API returns them
- **Why it matters.** Vendors are told to contact this person.
- **Setup.** A published event.
- **Steps.** 1. Open the event. 2. Read Contact Info.
- **Expected.** Buyer name, email and phone match the API.
- **Oracle.** Map `02-summary.json`: values next to their labels.
- **Trace.** P3 · automate · `tests/crosscheck.spec.ts` · map `02-summary.json`

#### UI-XCHK-013 — The Line Items table lists every line item the API returns, with its material code, category, subcategory and quantity
- **Why it matters.** Line items are what is being bought. A missing row or a wrong
  quantity or unit changes what vendors quote for.
- **Setup.** A published event with line items.
- **Steps.** 1. Open the event. 2. Read the Line Items count and table.
- **Expected.** The count next to "Line Items" equals the API's count; every line item
  the API returned for the page has a row; Material Code, Category, Subcategory and
  Quantity (number and unit) match.
- **Oracle.** Map `02-summary.json`: count + one row per item + each value in its column.
- **Trace.** P0 · automate · `tests/crosscheck.spec.ts` · map `02-summary.json`

#### UI-XCHK-014 — The Participants table lists every invited vendor the API returns, with location, invitation type and each stage's bid status
- **Why it matters.** This table answers "who has bid?". A vendor shown with the wrong
  status is chased for a bid it placed, or forgotten while it still could bid.
- **Setup.** A published event with invited vendors.
- **Steps.** 1. Open the event. 2. Read the Participants table.
- **Expected.** One row per vendor the API returns; Location and Type match; each
  stage column shows the vendor's status in that stage in the product's own words
  (Bid placed / Pending / Rejected / Not invited).
- **Oracle.** Map `02-summary.json`: the status labels are the ones the API itself
  publishes for its participant filter.
- **Trace.** P1 · automate · `tests/crosscheck.spec.ts` · map `02-summary.json`

## 3. A stage's Responses grid

#### UI-XCHK-020 — The stage's status chip agrees with the stage's status and bidding window in the API
- **Why it matters.** "Live" versus "Expired" decides whether a buyer waits for more
  bids or starts evaluating.
- **Setup.** A published event; open each stage.
- **Steps.** 1. Open the event. 2. Click the stage's tab. 3. Read the status chip.
- **Expected.** The chip is the status the API's status and times imply at that moment
  (upcoming, live, evaluation time, expired, closed, withdrawn).
- **Oracle.** The console's own rule applied to the API's times; the chip must be that
  word, and must not be another status word.
- **Trace.** P1 · automate · `tests/crosscheck.spec.ts` · map `03-responses.json` · special `stage-status`

#### UI-XCHK-021 — The Responses grid has a column for every bidder and shows every quoted value exactly as the API returns it
- **Why it matters.** This grid is where a buyer compares quotes. A price, quantity or
  tax shown differently from what the vendor submitted decides the award.
- **Setup.** A stage with at least one submitted bid.
- **Steps.** 1. Open the stage's tab (Responses opens first). 2. Read each bidder's
  columns on each line item's row.
- **Expected.** Every bidder the API lists has a column group; every value in each
  bidder's quote (price, quantity available, tax, other template fields) is shown in
  that bidder's column, on that line item's row, under the template's own column name.
  A column the buyer has hidden with "Hide fields" is noted, not failed.
- **Oracle.** Template-driven: the stage schema names the columns, each bidder's quote
  supplies the values.
- **Trace.** P0 · automate · `tests/crosscheck.spec.ts` · map `03-responses.json` · special `sheet-widgets`

#### UI-XCHK-022 — The Participation counter shows bids placed out of vendors invited, as the API counts them
- **Why it matters.** "1 / 38" is the buyer's whole sense of how the event is going.
- **Setup.** A published stage.
- **Steps.** 1. Open the stage's tab. 2. Read "Participation".
- **Expected.** "bids placed / invited" equals the API's bidder delivery counts.
- **Oracle.** Map `03-responses.json`.
- **Trace.** P2 · automate · `tests/crosscheck.spec.ts` · map `03-responses.json`

#### UI-XCHK-023 — The savings strip shows the savings amount and percentage the API computed
- **Why it matters.** Savings are reported upward; a wrong sign or figure misreports
  the event.
- **Setup.** A stage with a bid and a savings reference (e.g. last purchase price).
- **Steps.** 1. Open the stage's tab. 2. Read the savings strip at the bottom.
- **Expected.** Savings amount and percentage match the API.
- **Oracle.** Map `03-responses.json`.
- **Trace.** P2 · automate · `tests/crosscheck.spec.ts` · map `03-responses.json`

## 4. A stage's Overview tab

#### UI-XCHK-030 — The Participation Summary shows the participant, bid and counter-offer counts the API returns
- **Why it matters.** These counts are the stage's audit summary.
- **Setup.** A published stage.
- **Steps.** 1. Open the stage's tab. 2. Click Overview. 3. Read Participation Summary.
- **Expected.** Total and active participants, total, revised and rejected bids,
  counter offers (all, active, accepted) and dynamic time extended match the API.
- **Oracle.** Map `04-overview.json`: each value next to its label.
- **Trace.** P2 · automate · `tests/crosscheck.spec.ts` · map `04-overview.json`

#### UI-XCHK-031 — The Savings Summary shows the reference price, savings amount, percentage and per-line savings the API computed
- **Why it matters.** As UI-XCHK-023, in the place savings are usually read from.
- **Setup.** A stage with a bid and a savings reference.
- **Steps.** 1. Open the stage's Overview. 2. Read Savings Summary.
- **Expected.** Reference, savings amount, percentage and each line item's savings
  match the API.
- **Oracle.** Map `04-overview.json`.
- **Trace.** P2 · automate · `tests/crosscheck.spec.ts` · map `04-overview.json`

#### UI-XCHK-032 — The Bidding Summary names the best (L1) vendor and price for each line item as the API returns them
- **Why it matters.** L1 is the default award candidate.
- **Setup.** A stage with at least one bid.
- **Steps.** 1. Open the stage's Overview. 2. Read Bidding Summary.
- **Expected.** For each line item, the L1 vendor and price match the API.
- **Oracle.** Map `04-overview.json`.
- **Trace.** P1 · automate · `tests/crosscheck.spec.ts` · map `04-overview.json`

#### UI-XCHK-033 — Order Configurations show the stage's start time, duration, evaluation time, type, mode and template as the API returns them
- **Why it matters.** This is the schedule as the product records it. A duration shown
  wrongly makes a buyer extend or close a stage for no reason.
- **Setup.** A published stage.
- **Steps.** 1. Open the stage's Overview. 2. Read Order Configurations.
- **Expected.** Started At (India time), Order Duration (end minus start), Evaluation
  Time (extra closing time minus end), Order Type, Order Mode, Template and Event Title
  match the API.
- **Oracle.** Map `04-overview.json`: durations parsed and compared in seconds, within
  the unit the screen writes.
- **Trace.** P1 · automate · `tests/crosscheck.spec.ts` · map `04-overview.json`

## 5. Master QCS

#### UI-XCHK-040 — Master QCS has a column for every bidder and shows every bid value (quantities, rates, amounts, rank, totals) as the API returns it
- **Why it matters.** Master QCS is the award decision screen. Every number on it is
  used to choose a vendor.
- **Setup.** An event with at least one submitted bid.
- **Steps.** 1. Open the event. 2. Click Master QCS. 3. Read each bidder's column for
  each line item.
- **Expected.** Every bidder has a column; on each row (named by the template field),
  the bidder's value equals the API's — quantity offered and awarded, rank, rates,
  amounts, savings — and each bidder's Sum Total matches.
- **Oracle.** Template-driven, map `05-qcs.json`, special `qcs-cells`. Rows hidden with
  "Hide fields" are noted, not failed. No bids means inconclusive, never passed.
- **Trace.** P0 · automate · `tests/crosscheck.spec.ts` · map `05-qcs.json`

## 6. Errors

#### UI-XCHK-050 — No screen of the event looks fine while a request behind it failed, and none reports an error while its requests succeeded
- **Why it matters.** A screen that silently drops a failed request shows a partial
  picture as if it were whole; one that shows an error over good data stops work.
- **Setup.** Runs on every screen the other cases open.
- **Steps.** Open each screen and watch its requests and messages.
- **Expected.** Every failed request the screen depends on is visible to the user as
  an error; no success message appears for a failed request; no error appears when all
  requests succeeded.
- **Oracle.** Captured response statuses versus the app's own toasts and on-screen
  error text. Background calls (preferences, chat counters, viewing stats) excluded
  unless they fail with a server error.
- **Trace.** P0 · automate · `tests/crosscheck.spec.ts` · special `api-vs-screen-errors`

## 7. The vendor's view

#### UI-XCHK-060 — The vendor's view of the event shows the title, line items, quantities and closing time the buyer's API returns
- **Why it matters.** The vendor bids on what its screen shows. If it differs from
  what the buyer published, the bid answers a different question.
- **Setup.** A published event with an invited test vendor whose sign-in does not send
  mail to a real address.
- **Steps.** 1. Sign in to the supplier portal as the invited vendor. 2. Open the event.
  3. Read title, line items, quantities and closing time.
- **Expected.** They equal the buyer-side API's event, line items and stage end time.
- **Oracle.** Same comparison rules; reference values from the buyer's API capture.
- **Trace.** P1 · automate-later · `tests/crosscheck.spec.ts` · blocked: the configured vendor login sends an email OTP

#### UI-XCHK-061 — The vendor's bid form offers exactly the fields of the stage's template, with the buyer's quantities and units
- **Why it matters.** A field missing from the vendor's form is a value the buyer will
  never receive.
- **Setup.** As UI-XCHK-060, inside the bidding window.
- **Steps.** 1. Sign in as the vendor. 2. Open the event's bid form. 3. Read its columns
  and the quantity requested per line.
- **Expected.** Every participant field of the template is a column; quantities and
  units equal the buyer's.
- **Oracle.** Template widgets (participant fields) versus the form's headers.
- **Trace.** P1 · automate-later · `tests/crosscheck.spec.ts` · blocked: as UI-XCHK-060
