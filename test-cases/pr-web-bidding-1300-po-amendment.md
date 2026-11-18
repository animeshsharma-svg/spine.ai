# PO amendment on the supplier portal — web-bidding PR #1300

Cases for [Procol-Tech/web-bidding#1300](https://github.com/Procol-Tech/web-bidding/pull/1300) "Feat: PO Amendment"
(branch `feat/po-amendment`, author Uday Kumar, +119/−25). This is the vendor's side of a sourcing amendment, the event
raised when a buyer amends a PO. The buyer side is client-dashboard PR 5755. The PR does three things:

1. **Blocked line items.** A row carrying `is_item_blocked_from_bidding` (a `{value}` object or a bare boolean, with
   `isBlockedFromBidding` as a fallback) is read-only in every widget, and that includes the row checkbox. Its price-group
   cells are prefilled from `prior_price`. The row is left out of the submit-time error checks, the error-summary panel
   and bid-sheet upload (`features/order/helpers.js`, `order/selector.js`, `bid/helpers.js`, `bid/placeBid.js`).
2. **Blocked technical (RFI) sections.** A blocked section is read-only, including question-group children (single and
   multi-response), and `handleFormValidation` skips it. The new `isSectionSubmissionSkipped` covers blocked, deleted and
   regretted sections (`components/rfiForm/helpers.js`).
3. **Currency lock.** When `currency_preferences[layerId].sourcing_amendment_locked` is true, the edit-currency pencil is
   hidden on both `PlaceBid` and `PlaceBidV2` (`selectIsBidCurrencyLocked`).

Preview build: <https://vendor-feat-po-amendment.preview.procol.tech>.

**Risks found while reading the diff (check these first):**
- **R1. PlaceBidV2 doesn't skip blocked rows.** Its submit validation (`ordersV2/placeBidV2.js:1362` `valueError`,
  `:1397` required-field `keyError`) still checks every row. Only the currency lock reached V2. A blocked row whose
  required field is empty or invalid will block submit on V2 but not on V1. See UI-POA-030 and UI-POA-031.
- **R2. A string flag would lock the row.** `Boolean(unwrapCellValue(...))` turns a string `"false"` into `true`. See
  UI-POA-008.
- **R3. Reviewer comment still open.** The PR doesn't check that the event is an amendment before honouring the per-item
  flag, so a stray flag on a normal event silently locks that row or section. See UI-POA-009 and UI-POA-025.
- **R4. Partial bid-sheet uploads.** When any blocked row exists, upload also skips non-blocked rows that are missing from
  the uploaded file, without any message. See UI-POA-021.

Setup used throughout: a buyer issues a PO from an awarded event and amends it. The amendment event goes to the same
vendor, with some line items unchanged (blocked, carrying that vendor's prior price) and some changed or new (open). Use a
fresh amendment event per run; shared events contaminate results (see `procol-false-positive-sources`).

## 1. Blocked line items — commercial sheet (V1 bid page)

#### UI-POA-001 — Blocked rows open read-only with the prior price filled in
- **Why it matters.** This is the core promise: the vendor can't re-quote items the amendment didn't touch.
- **Setup.** Amendment event with 3 rows. Rows 1 and 2 are blocked with prior prices 120 and 75. Row 3 is open.
- **Steps.** Sign in as the vendor on the preview build, open the event and go to Place Bid.
- **Expected.** Rows 1 and 2 show 120 and 75 in the price cell, and no cell in those rows accepts input. Row 3 is editable.
- **Oracle.** Typing, pasting or pressing Delete on any cell of rows 1 and 2 doesn't change it. Row 3 accepts input.
- **Trace.** P0 · automate · `order/selector.js` `selectDefaultSheetData` · `order/helpers.js` `normalizeInlineSheetsData`

#### UI-POA-002 — Every widget on a blocked row is locked, not just price
- **Why it matters.** The lock covers every widget. Remarks, GST, delivery date, lead time and attachment cells must not be editable either.
- **Setup.** Template with price, tax %, delivery date, remarks (text), an attachment column and a dropdown. One row is blocked.
- **Steps.** Try editing each cell type on the blocked row, and try uploading a file into its attachment cell.
- **Expected.** All cells are read-only and the attachment cell has no upload action.
- **Oracle.** No cell of the blocked row is in edit mode at any point, and no upload request fires.
- **Trace.** P0 · automate · `normalizeInlineSheetsData` blocked branch

#### UI-POA-003 — Only price-group widgets get the prior price; other cells keep their server value
- **Why it matters.** The prefill applies only to `input_group === price`. Other widgets should show what the server sent, not be blanked.
- **Setup.** A blocked row whose server payload has remarks "old remark" and tax 18.
- **Steps.** Open Place Bid.
- **Expected.** Price shows `prior_price`, remarks shows "old remark" and tax shows 18. Every price-group widget (base price, unit rate and so on, if there are several) shows the prior price.
- **Oracle.** Cell values match the `/trade` payload for that row, with price-group cells equal to `prior_price.value`.
- **Trace.** P1 · automate · `INPUT_GROUP.price` check

#### UI-POA-004 — A prior price of 0 is kept, not treated as missing
- **Why it matters.** The guard is `!== null && !== undefined`, so 0 is a real price and must show as 0.
- **Setup.** A blocked row with `prior_price: {value: 0}`.
- **Steps.** Open Place Bid.
- **Expected.** The price cell shows 0, not blank and not the server's default value.
- **Oracle.** The DOM cell reads 0, and the submit payload carries 0 for that row.
- **Trace.** P2 · automate · `getPriorBidPrice`

#### UI-POA-005 — A blocked row with no prior price
- **Why it matters.** With `prior_price` null or absent the cell isn't prefilled, but it's still read-only and skipped by validation, so it can go out empty.
- **Setup.** A blocked row with `prior_price: null`, or the key missing.
- **Steps.** Open Place Bid, fill the open rows and submit.
- **Expected.** The page doesn't crash. The blocked row shows the server value or blank. Submit either succeeds with the backend owning that row's price, or the backend refuses with a clear message. A silent empty price on an awarded item is a defect.
- **Oracle.** Record the submit payload and response for that row, and raise a bug if the price posted is empty and accepted.
- **Trace.** P1 · manual · `getPriorBidPrice` null path

#### UI-POA-006 — Both prior-price shapes work
- **Why it matters.** The code accepts `{value: N}` or a bare `N`. The PR thread says the backend always sends `{value}`, but the bare-number branch is still there.
- **Setup.** Intercept `/trade` and change one blocked row's `prior_price` to a bare `55` (via a dev proxy or a test hook).
- **Steps.** Open Place Bid.
- **Expected.** The row shows 55.
- **Oracle.** The cell reads 55 for both shapes.
- **Trace.** P3 · automate-later · `getPriorBidPrice`

#### UI-POA-007 — Both flag shapes lock the row, and false or null doesn't
- **Why it matters.** `isRowBlockedFromBidding` unwraps `{value}`, then falls back to `isBlockedFromBidding` only on null or undefined.
- **Setup.** Rows with `is_item_blocked_from_bidding` set to `{value:true}`, `true`, `{value:false}`, `false`, `{value:null}`, absent, and absent with `isBlockedFromBidding:true`.
- **Steps.** Open Place Bid.
- **Expected.** Locked: `{value:true}`, `true`, and absent with the fallback `true`. Editable: `{value:false}`, `false`, `{value:null}` without the fallback, and absent.
- **Oracle.** The editability of each row matches that list.
- **Trace.** P2 · automate-later · `isRowBlockedFromBidding`

#### UI-POA-008 — A string `"false"` flag (R2)
- **Why it matters.** `Boolean("false")` is true. If any serializer ever stringifies the flag, every row locks.
- **Setup.** Intercept and send `is_item_blocked_from_bidding: {value: "false"}` on one row.
- **Steps.** Open Place Bid.
- **Expected (product).** The row stays editable.
- **Oracle.** If the row locks, that's a fragility in the contract. Log it, and check that the backend serializer only ever emits real booleans.
- **Trace.** P3 · manual · `unwrapCellValue` + `Boolean`

#### UI-POA-009 — Regression: a normal RFQ with no flag is unchanged
- **Why it matters.** Every vendor bid goes through these helpers now.
- **Setup.** A normal published RFQ (not an amendment), with a vendor who has bid before and one who hasn't.
- **Steps.** Place a bid, revise it and upload a bid sheet.
- **Expected.** Behaviour is the same as on main: everything is editable, validation fires on every row, and no price is prefilled from `prior_price`.
- **Oracle.** Same results as the same steps on the current production vendor portal.
- **Trace.** P0 · automate · regression

#### UI-POA-010 — Totals and formulas include blocked rows at the prior price
- **Why it matters.** The bid total must cover every item, including the locked ones.
- **Setup.** Template with a formula total (`qty × price`). Blocked row: qty 10, prior price 100. Open row: qty 5.
- **Steps.** Enter 200 on the open row.
- **Expected.** Row totals are 1,000 and 1,000, and the grand total is 2,000, including any tax or landed-cost formula.
- **Oracle.** The UI total equals the hand calculation and the total in the submit payload.
- **Trace.** P0 · automate · formula on read-only rows

#### UI-POA-011 — Submit succeeds with only the open rows filled
- **Why it matters.** Blocked rows are left out of `valueError` and the required-field `keyError`, so the vendor isn't asked for them.
- **Setup.** Blocked rows where a required non-price field (for example delivery date) is empty in the server data.
- **Steps.** Fill all required fields on the open rows and submit.
- **Expected.** The bid submits, with no "required" error pointing at a blocked row.
- **Oracle.** The submit request goes out with 2xx, and the bid shows as submitted.
- **Trace.** P0 · automate · `placeBid.js` valueError / keyError skip

#### UI-POA-012 — Open rows are still validated
- **Why it matters.** Skipping blocked rows must not switch off validation for the rest.
- **Setup.** As in UI-POA-011.
- **Steps.** Leave a required field empty on an open row, then submit. Separately, enter a negative or out-of-range price on an open row.
- **Expected.** Submit is blocked in both cases, and the error names the open row.
- **Oracle.** No submit request goes out, and the error message or summary points at the open row.
- **Trace.** P0 · automate · validation still active

#### UI-POA-013 — The error-summary panel never lists a blocked row
- **Why it matters.** `getErrorWidgetsData` now returns early for blocked rows, so they can't appear in the summary.
- **Setup.** One blocked row with a value that would fail validation (for example a prior price below a min-price rule, or a required field blank). One open row with an error.
- **Steps.** Trigger validation.
- **Expected.** The summary lists only the open row.
- **Oracle.** No entry in the error panel refers to the blocked row's serial number.
- **Trace.** P1 · automate · `bid/helpers.js getErrorWidgetsData`

#### UI-POA-014 — Blocked rows can't be selected, bulk-edited or filled down
- **Why it matters.** `CHECKBOX_WIDGET` goes through the same lock. Bulk actions such as select-all, fill-down and paste must not write into blocked rows.
- **Setup.** 2 blocked rows and 3 open rows.
- **Steps.** Click select-all and use any bulk action (regret selected, apply value). Copy a cell, select a range that includes blocked rows and paste. Drag a fill handle across a blocked row.
- **Expected.** Blocked rows are never changed, and their checkboxes are disabled.
- **Oracle.** Blocked rows' values after the action equal the values before it.
- **Trace.** P1 · automate · checkbox widget lock

#### UI-POA-015 — Blocked rows can't be regretted
- **Why it matters.** A blocked item was already awarded. Regretting it would undo the PO.
- **Setup.** Amendment event with a regret option.
- **Steps.** Try to regret a blocked row, both directly and via the bulk regret on selected rows.
- **Expected.** There is no regret action for blocked rows.
- **Oracle.** The blocked row's status in the submit payload is unchanged.
- **Trace.** P1 · manual

#### UI-POA-016 — The lock survives a reload, a revise and a second visit
- **Why it matters.** The prefill happens when the sheet is normalized. A revised bid (`isRevisedBid`) or a draft reload must not reset it.
- **Setup.** Submit a bid once on the amendment event.
- **Steps.** Reload. Click Revise. Save a draft and reopen it.
- **Expected.** The blocked rows are still locked and still show the prior price.
- **Oracle.** Same values and same lock on every visit.
- **Trace.** P1 · automate

#### UI-POA-017 — The payload carries the prior price for blocked rows
- **Why it matters.** The display is only half the job; the posted bid must match it.
- **Setup.** As in UI-POA-001.
- **Steps.** Submit, and capture the bid request.
- **Expected.** Rows 1 and 2 post 120 and 75 (or are left out, if that's the backend contract; confirm which with BE). They must never post blank or 0.
- **Oracle.** The request body, plus a buyer-side read of the bid, shows the same prices.
- **Trace.** P0 · automate · end-to-end with buyer view

#### UI-POA-018 — Multi-stage: the lock follows each stage's own rows
- **Why it matters.** The flag is per row per stage, so a row blocked in RFQ stage 2 needn't be blocked in stage 1.
- **Setup.** A two-stage amendment event where the rows are blocked differently in each stage.
- **Steps.** Bid in stage 1, then move to stage 2.
- **Expected.** Each stage locks exactly its own flagged rows.
- **Oracle.** Editability per stage matches each stage's `/trade` payload.
- **Trace.** P2 · manual

## 2. Bid-sheet upload with blocked rows

#### UI-POA-019 — An uploaded sheet can't overwrite a blocked row
- **Why it matters.** Excel is the easiest way to get around a UI lock.
- **Setup.** Download the bid sheet on the amendment event, change the blocked rows' price to 999 and fill the open rows.
- **Steps.** Upload the sheet.
- **Expected.** Blocked rows keep the prior price and open rows take the uploaded values.
- **Oracle.** After upload, the grid shows the prior price on blocked rows, and the submit payload agrees.
- **Trace.** P0 · automate · `parseSheetDataForBidUpload` `shouldSkipRow`

#### UI-POA-020 — Uploaded validation errors on blocked rows are ignored
- **Why it matters.** The post-upload validation pass also skips blocked rows.
- **Setup.** In the uploaded file, put text ("abc") in a blocked row's price and a valid number in each open row.
- **Steps.** Upload, then submit.
- **Expected.** No error on the blocked row, and the bid submits.
- **Oracle.** No error marker on the blocked row, and the submit succeeds.
- **Trace.** P1 · automate

#### UI-POA-021 — Uploading a sheet without some open rows (R4)
- **Why it matters.** When the event has any blocked row, upload also skips non-blocked rows that are missing from the file. The vendor gets no message, so a deleted row in Excel quietly leaves that row unfilled.
- **Setup.** A sheet with the blocked rows and one open row deleted.
- **Steps.** Upload, then submit.
- **Expected (product).** The missing open row is still empty. Required-field validation blocks submit, or the upload warns that rows are missing. It must not submit with that row unpriced.
- **Oracle.** Submit is refused, naming the missing row. If it goes through, raise a bug.
- **Trace.** P1 · automate · `!isObject(serializeResponse[serial])`

#### UI-POA-022 — Regression: upload on a normal event
- **Why it matters.** `shouldSkipRow` only applies when blocked rows exist. Normal events keep the old path, and a missing row may still throw there (the existing behaviour).
- **Setup.** A normal RFQ. Upload a full sheet, then a sheet with one row deleted.
- **Steps.** Upload each.
- **Expected.** The full sheet works as it does today. For the partial sheet, record what happens and compare with main. It should be unchanged from main.
- **Oracle.** Same outcome as production.
- **Trace.** P1 · automate · regression

#### UI-POA-023 — Upload with serial numbers reordered or edited
- **Why it matters.** Rows are matched by `serial_number`. An edited serial must not move the prior price onto another row or unlock a row.
- **Setup.** Reorder the rows in the sheet, and change one open row's serial to a blocked row's serial.
- **Steps.** Upload.
- **Expected.** Reordering is harmless. The colliding serial updates neither the blocked row nor the wrong open row.
- **Oracle.** After upload, the blocked rows are unchanged and each open row's value comes from its own serial.
- **Trace.** P2 · manual

## 3. Technical (RFI) stage sections

#### UI-POA-024 — A blocked technical section is read-only, including question groups
- **Why it matters.** `setReadOnlyForSection` and `getNormalisedRfiTemplate` now honour the flag. Question-group children used to be the easy place to miss.
- **Setup.** A technical stage with 3 sections: one blocked, containing text, number, dropdown, attachment, a single-response question group and a multi-response question group; one open; one deleted.
- **Steps.** Open the technical response.
- **Expected.** Every field in the blocked section, including every question-group child, is read-only. The add-response button on the multi-response group is unavailable. The open section is editable.
- **Oracle.** No input in the blocked section accepts a change.
- **Trace.** P0 · automate · `rfiForm/helpers.js setReadOnlyForSection`

#### UI-POA-025 — Regression: a technical stage on a normal event
- **Why it matters.** Same helpers, normal event. Fields with `mode: read` must stay read-only and the rest editable (see R3).
- **Setup.** A normal RFP with technical sections, one of them containing a read-mode field.
- **Steps.** Respond.
- **Expected.** Behaviour is the same as on main.
- **Oracle.** Same editability as production.
- **Trace.** P0 · automate · regression

#### UI-POA-026 — Required fields in a blocked section don't block submit
- **Why it matters.** `handleFormValidation` skips sections where `isSectionSubmissionSkipped` is true.
- **Setup.** A blocked section with an empty required field. The open section is fully answered.
- **Steps.** Submit the technical response.
- **Expected.** It submits.
- **Oracle.** The request goes out with 2xx and no error marker shows on the blocked section.
- **Trace.** P0 · automate

#### UI-POA-027 — Required fields in an open section still block submit
- **Why it matters.** The skip must not leak into other sections.
- **Setup.** As in UI-POA-026, with a required field empty in the open section.
- **Steps.** Submit.
- **Expected.** Submit is blocked and the error points at the open section.
- **Oracle.** No request goes out.
- **Trace.** P0 · automate

#### UI-POA-028 — The regretted and deleted skips still work after the refactor
- **Why it matters.** The regret logic moved into `isSectionRegretted`. As the PR thread notes, a section with no text fields counts as "not regretted".
- **Setup.** (a) A section where every text and multiline field is the regret text. (b) A section with only number and dropdown fields, left empty but required. (c) A deleted section with an empty required field.
- **Steps.** Submit.
- **Expected.** (a) is skipped and submits. (b) is validated, so submit is blocked. (c) is skipped.
- **Oracle.** Same outcomes as on main for (a), (b) and (c).
- **Trace.** P1 · automate · `isSectionRegretted`, `isSectionSubmissionSkipped`

#### UI-POA-029 — A section that is both blocked and regretted, or blocked and deleted
- **Why it matters.** When conditions overlap there should be no crash and no double handling.
- **Setup.** A blocked section whose text fields hold the regret text, and a blocked section with status deleted.
- **Steps.** Open the technical response and submit.
- **Expected.** Both sections are read-only and skipped, and there's no console error.
- **Oracle.** Submit succeeds and the console is clean.
- **Trace.** P3 · automate-later

## 4. PlaceBidV2 (orders V2 bid page)

#### UI-POA-030 — V2: an invalid value on a blocked row blocks submit (R1)
- **Why it matters.** `placeBidV2.js:1362` still sets `valueError` from every row's `.error`. A blocked row carrying an error flag, for example a prior price outside a min/max rule set after the award, blocks the vendor, and the row is read-only so they can't fix it.
- **Setup.** A vendor and event that route to PlaceBidV2. One blocked row whose prior price breaks a validation rule on the amended template.
- **Steps.** Fill the open rows and submit.
- **Expected (product).** It submits, as V1 does after UI-POA-013.
- **Oracle.** If submit is blocked by an error on a read-only blocked row, raise a bug against PR #1300. The fix is to port the `isRowBlockedFromBidding` skip into V2's `valueError` and `keyError` loops.
- **Trace.** P0 · automate · `ordersV2/placeBidV2.js:1362`

#### UI-POA-031 — V2: an empty required field on a blocked row blocks submit (R1)
- **Why it matters.** V2's required-field loop (`:1397`) also checks every row.
- **Setup.** V2 event. A blocked row where a required participant field (delivery date, remarks) is empty in the server data.
- **Steps.** Fill the open rows and submit.
- **Expected (product).** It submits.
- **Oracle.** A "required" error naming the blocked row means R1 is confirmed.
- **Trace.** P0 · automate · `ordersV2/placeBidV2.js:1397`

#### UI-POA-032 — V2: blocked rows are locked and show the prior price
- **Why it matters.** The lock and prefill come from shared selectors and normalizers, so V2 should get them, but confirm it renders from that data.
- **Setup.** As in UI-POA-001, on V2.
- **Steps.** Open the bid page.
- **Expected.** Same as UI-POA-001.
- **Oracle.** As in UI-POA-001.
- **Trace.** P1 · automate

## 5. Currency lock

#### UI-POA-033 — The currency pencil is hidden when the amendment locks currency
- **Why it matters.** The amended PO must stay in the original PO currency.
- **Setup.** An amendment event with several allowed currencies and `sourcing_amendment_locked: true` on the current layer. The vendor hasn't bid yet.
- **Steps.** Open Place Bid on V1, then on V2.
- **Expected.** The currency code shows the locked currency and there is no edit icon.
- **Oracle.** No edit-currency icon is in the DOM on either page.
- **Trace.** P0 · automate · `selectIsBidCurrencyLocked`, `placeBid.js:3300`, `placeBidV2.js:3273`

#### UI-POA-034 — The pencil is still shown when unlocked
- **Why it matters.** Regression: on a normal event with several currencies and no bid yet, the pencil must stay.
- **Setup.** A normal event with several allowed currencies, `sourcing_amendment_locked` false or absent, and no bid.
- **Steps.** Open Place Bid.
- **Expected.** The edit icon shows and changing the currency works.
- **Oracle.** The icon is present and the currency changes.
- **Trace.** P0 · automate · regression

#### UI-POA-035 — The lock is read per layer
- **Why it matters.** The selector reads `currencyPreferences[layerId]`. A lock on one stage must not leak into another.
- **Setup.** A multi-stage event locked on stage 2 only.
- **Steps.** Open each stage's bid page.
- **Expected.** Stage 1 shows the pencil and stage 2 doesn't.
- **Oracle.** The icon's presence per stage matches the payload.
- **Trace.** P2 · manual

#### UI-POA-036 — The lock is enforced on the server too
- **Why it matters.** Hiding a pencil isn't enforcement.
- **Setup.** A locked amendment event.
- **Steps.** Send the bid API call with a different currency code, either by replaying the submit request with the currency changed, or by uploading a bid sheet whose currency column differs (if the template has one).
- **Expected.** The backend refuses the bid, or forces it back to the locked currency.
- **Oracle.** The stored bid's currency equals the locked currency. If the backend accepts the change, raise a backend bug.
- **Trace.** P0 · manual · API

#### UI-POA-037 — The surrogate bid drawer respects the lock
- **Why it matters.** A buyer bidding on the vendor's behalf goes through the console, not web-bidding. That part is covered by client PR 5755, but the stored outcome must match.
- **Setup.** A locked amendment event.
- **Steps.** Place a surrogate bid from the console.
- **Expected.** The currency can't be changed there either.
- **Oracle.** The stored currency is the locked one.
- **Trace.** P2 · manual · cross-PR

## 6. End-to-end

#### UI-POA-038 — Full PO amendment round trip
- **Why it matters.** This proves the vendor-side changes give the buyer a correct amended award and PO.
- **Setup.** An awarded event with a PO issued to vendor V for 3 items.
- **Steps.** (1) The buyer amends the PO, changing item 3's quantity and adding item 4. (2) V opens the amendment event: items 1 and 2 are blocked at the prior price, and items 3 and 4 are open. Currency is locked. (3) V fills items 3 and 4 and submits the technical and commercial responses. (4) The buyer views the bid, awards it and creates the amended PO.
- **Expected.** The amended PO has items 1 and 2 at the original prices, items 3 and 4 at the new prices, in the original currency, and the totals add up.
- **Oracle.** PO line prices equal `prior_price` for items 1 and 2 and the bid prices for items 3 and 4, and the PO currency is unchanged.
- **Trace.** P0 · manual · cross-PR with client-dashboard 5755

#### UI-POA-039 — No console errors on the amendment bid page
- **Why it matters.** `selectDefaultSheetData` and `normalizeInlineSheetsData` now do more per row, and a missing `prior_price` or flag must not throw.
- **Setup.** The amendment event, plus a normal event.
- **Steps.** Open, edit, upload and submit on both events, V1 and V2.
- **Expected.** No uncaught errors and no immer "cannot modify frozen object" errors.
- **Oracle.** `read_console_messages` with `onlyErrors` is empty.
- **Trace.** P1 · automate

#### UI-POA-040 — Performance with many blocked rows
- **Why it matters.** The bid page now does an extra flag lookup for every widget in every row.
- **Setup.** An amendment event with 500 rows, 450 of them blocked.
- **Steps.** Open the bid page, upload a sheet and submit.
- **Expected.** Load time and upload time are within 20% of a normal 500-row event.
- **Oracle.** Timing from page navigation and the upload handler.
- **Trace.** P3 · manual
