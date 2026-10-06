# Screen cases — a fresh event from Create Event to Master QCS and its report

Written from the flow map `prototype/knowledge/events/flow-map-create-to-mqcs.md` (7 Oct 2026):
the code of procol-client-dashboard and procol-backend, and what the automation has seen live.
Cases that record today's behaviour say so; they turn into pass/fail cases once the product team
answers the matching question in the flow map (Q-numbers).

## 1. The auto-generated title

#### UI-FTTL-001 — One product at one location titles the event "<product> - <location>"
- **Why it matters.** The auto title is what buyers and reports see when nobody types one; a
  wrong one travels into the PO reference.
- **Setup.** A fresh create screen, a priced template, an empty title.
- **Steps.** Add one product with one delivery location.
- **Expected.** The title reads `<product name> - <location>`, the product name cut at 70 characters.
- **Oracle.** Title field value. `generateTitle` (eventCreation.jsx:124).
- **Trace.** P2 · automate · eventCreation.jsx:124-160

#### UI-FTTL-002 — Several products of one family title "<family> products - <location>"
- **Why it matters.** The family name stands in for the list; a wrong family name misleads.
- **Setup.** Two products that share a family, one location.
- **Steps.** Add both.
- **Expected.** Title `<family> products - <location>`.
- **Oracle.** Title field value.
- **Trace.** P2 · automate · eventCreation.jsx:142-147

#### UI-FTTL-003 — Products of mixed families title "<first product> & more - <location>"
- **Setup.** Two products from different families, one location.
- **Steps.** Add both.
- **Expected.** Title `<first product> & more - <location>`.
- **Oracle.** Title field value.
- **Trace.** P2 · automate · eventCreation.jsx:148-150

#### UI-FTTL-004 — Several delivery locations title "… - N locations"
- **Setup.** Two products with different delivery locations.
- **Steps.** Add both.
- **Expected.** The title ends in `2 locations`.
- **Oracle.** Title field value.
- **Trace.** P2 · automate · eventCreation.jsx:152-160

#### UI-FTTL-005 — A title the buyer typed is never overwritten by the auto title
- **Why it matters.** The auto title must only fill an empty title (or replace its own previous value).
- **Setup.** A fresh create screen.
- **Steps.** Type a title; then add a product and a location.
- **Expected.** The typed title stays.
- **Oracle.** Title field value unchanged. eventCreation.jsx:1312 (`!title || title === autoTitle`).
- **Trace.** P1 · automate · eventCreation.jsx:1312-1320

#### UI-FTTL-006 — A row without a delivery location does not count toward the auto title
- **Setup.** A fresh create screen, empty title.
- **Steps.** Add a product and leave its delivery location empty.
- **Expected.** No auto title is produced until a location is set.
- **Oracle.** Title stays empty; then fills once the location is picked.
- **Trace.** P3 · automate · eventCreation.jsx:125-127

## 2. Extra columns: price cap, minimum quantity, tick size, custom columns

#### UI-FCOL-001 — Add Columns offers Creator and Participant sub-menus from the template
- **Why it matters.** The menu is the template's optional widgets split by who fills them.
- **Setup.** A create screen with a priced template chosen.
- **Steps.** Open Add Columns.
- **Expected.** Two sub-menus, Creator and Participant; Creator lists the template's creator widgets
  (e.g. Price Cap, Creator Attachments, Tick Size, Min Quantity, Custom Column, Tick Size Percentage).
- **Oracle.** Menu items equal the template's `mapped_widgets` with `field` creator / participant.
- **Trace.** P2 · automate · selectors.js:507-531 · productSheet.jsx:97-125

#### UI-FCOL-002 — A vendor bid above the price cap is refused with the cap in the message
- **Why it matters.** The cap is a hard commercial limit; a bid above it must never be accepted.
- **Setup.** A published RFQ with a Price Cap column set to X per unit on a line.
- **Steps.** As the QA vendor, enter a net price above X and submit.
- **Expected.** Refused: "Net Price should be less than ₹X/<unit>" (the target column's name if the
  template names it differently).
- **Oracle.** Validation rule `net_price <= ceil_price`; no bid saved.
- **Trace.** P0 · automate · trade_template_helper.rb get_validations_for_attributes

#### UI-FCOL-003 — A bid exactly at the price cap is accepted
- **Why it matters.** The rule is "less than or equal"; an off-by-one here blocks legitimate bids.
- **Setup.** As UI-FCOL-002.
- **Steps.** Bid exactly X.
- **Expected.** Accepted.
- **Oracle.** Rule `<=`; the bid is saved and shows on Responses.
- **Trace.** P1 · automate · trade_template_helper.rb (rule `<=ceil_price`)

#### UI-FCOL-004 — A bid quantity below Min Quantity is refused
- **Setup.** A published RFQ with a Min Quantity column set to Q on a line.
- **Steps.** As the vendor, offer a quantity below Q.
- **Expected.** Refused: "Quantity should be greater than Q <unit>".
- **Oracle.** Rule `floor_quantity <= participant_quantity`.
- **Trace.** P1 · automate · trade_template_helper.rb

#### UI-FCOL-005 — In an English auction a revised bid must improve by at least the tick size
- **Why it matters.** Tick size is what makes the auction move; a smaller step must be refused.
- **Setup.** A live English auction with Tick Size T on a line and one bid placed.
- **Steps.** The same vendor revises by less than T.
- **Expected.** Refused; a revision of T or more is accepted.
- **Oracle.** Tick validation on the target widget (`get_custom_validation_for_attributes`).
- **Trace.** P1 · automate-later · trade_template_helper.rb:59-71 · trade_product.rb:198-208

#### UI-FCOL-006 — Tick Size Percentage lowers the price cap by that percent once a bid exists
- **Setup.** A live English auction with a Price Cap and a Tick Size Percentage on a line; one bid placed.
- **Steps.** Read the cap offered to the next bidder.
- **Expected.** Cap = previous cap − (percent × cap / 100).
- **Oracle.** trade_product.rb:176-177.
- **Trace.** P2 · automate-later · trade_product.rb:176-177

#### UI-FCOL-007 — A creator Custom Column is read-only for the vendor; a participant one is editable
- **Setup.** A published event with one custom column of each kind.
- **Steps.** Open the vendor's bid sheet.
- **Expected.** The creator column shows the buyer's text and cannot be edited; the participant column
  takes the vendor's text.
- **Oracle.** Cell lock state on the vendor sheet (`_cellReadOnly_`).
- **Trace.** P2 · automate-later · widget.rb:855-857

## 3. Upload Sheet

#### UI-FUPL-001 — The downloaded template carries the chosen template's columns
- **Setup.** A create screen with a template chosen.
- **Steps.** Upload Sheet → Download template.
- **Expected.** The sheet's headers equal the product sheet's columns (mandatory ones marked).
- **Oracle.** Header row 2 of the file (`build_json_from_excel(header_row: 2)`).
- **Trace.** P2 · automate-later · uploadExcelModal.jsx · excel_to_json_conversion_service.rb:40

#### UI-FUPL-002 — A file over 10 MB is refused before upload
- **Setup.** A create screen.
- **Steps.** Pick a file larger than 10 MB.
- **Expected.** Refused on the screen; nothing is sent.
- **Oracle.** `MAX_FILE_SIZE = 10` (uploadSheetModal.jsx); no upload request.
- **Trace.** P3 · automate-later · uploadSheetModal.jsx:14-30

#### UI-FUPL-003 — Failed rows are counted and can be viewed
- **Setup.** A filled template with two bad rows (unknown product, text in a number cell).
- **Steps.** Upload.
- **Expected.** "Failed to upload 2 entries." with "View failed entries" listing the two rows and reasons;
  the good rows are added.
- **Oracle.** Message text and the rows in the sheet.
- **Trace.** P1 · automate-later · en.json quickCreateOrder.sheetUploadError

#### UI-FUPL-004 — A partially filled sheet is refused
- **Setup.** A filled template with a row missing a mandatory cell.
- **Steps.** Upload and publish.
- **Expected.** "Sheet partially filled, please check again."
- **Oracle.** Message text; publish blocked.
- **Trace.** P1 · automate-later · en.json quickCreateOrder.sheetPartiallyFilled

## 4. Vendors suggested from the products

#### UI-FVND-001 — The suggestion banner counts the products' mapped vendors not yet added
- **Why it matters.** The banner drives who gets invited; a wrong count hides or over-invites vendors.
- **Setup.** A client with `vendor_recommendation_on_product`; a product with mapped vendors.
- **Steps.** Add the product.
- **Expected.** "Suggestion: Invite N more participant based on the products", N = mapped vendors
  minus those already added minus blocked vendors.
- **Oracle.** `suggestedVendors` (participantsSelection.jsx:226-240) and the audience endpoint.
- **Trace.** P1 · automate · participantsSelection.jsx:226-240 · companies_controller.rb:827

#### UI-FVND-002 — A blocked vendor never appears in the suggestion
- **Setup.** A product whose mapped vendors include a blocked one.
- **Steps.** Add the product.
- **Expected.** The blocked vendor is not counted and not added.
- **Oracle.** `isBlockedVendor` filter.
- **Trace.** P1 · automate · participantsSelection.jsx:233

#### UI-FVND-003 — Clicking the banner adds exactly the suggested vendors
- **Why it matters.** Real suppliers are reached by this click; the automation never presses it
  on UAT. Verify with a product mapped only to QA vendors, or manually.
- **Setup.** A product mapped only to QA test vendors.
- **Steps.** Click Invite Vendor on the banner.
- **Expected.** Those vendors appear as participants; the banner disappears.
- **Oracle.** Participant chips.
- **Trace.** P1 · manual · participantsSelection.jsx:736-740

#### UI-FVND-004 — Removing a product removes the vendors it alone suggested (records current behaviour)
- **Setup.** Two products with different mapped vendors, both added through the banner.
- **Steps.** Delete the first product from the sheet.
- **Expected.** Records whether its vendors are removed from the participants (the code says they are,
  while manually added vendors stay). Flow-map Q9.
- **Oracle.** Participant chips after the deletion.
- **Trace.** P2 · automate-later · participantsSelection.jsx:240-280

#### UI-FVND-005 — Without the recommendation setting the banner never appears
- **Setup.** A client without `vendor_recommendation_on_product`.
- **Steps.** Add any product.
- **Expected.** No suggestion banner; vendors are added manually only.
- **Oracle.** Banner absent (the control is known on this screen).
- **Trace.** P2 · automate · product.rb:418-422

## 5. Savings

#### UI-FSAV-001 — Gross-total savings equal reference minus the best gross total
- **Why it matters.** Savings is the number procurement reports on; the formula must hold exactly.
- **Setup.** A closed RFQ with one bid; a gross-total Budget reference R.
- **Steps.** Open Overview (and Master QCS).
- **Expected.** Savings amount = R − best gross total; savings % = (R − best) / R × 100.
- **Oracle.** savings_calculator.rb:53-60 (buy formulas); the screen's figures.
- **Trace.** P0 · automate · savings_calculator.rb:35-60

#### UI-FSAV-002 — Line-item savings use the line's reference multiplied by quantity
- **Setup.** A closed RFQ with one bid; Line Item savings with a per-unit reference on the line.
- **Steps.** Read the line's savings.
- **Expected.** Reference × quantity − line final amount, and the matching percent.
- **Oracle.** savings_calculator.rb:112-118.
- **Trace.** P1 · automate · savings_calculator.rb:95-125

#### UI-FSAV-003 — A custom reference shows as its own savings row and in the report
- **Setup.** Savings with Add Custom Reference named "Last year".
- **Steps.** Close with a bid; open Overview; download the Master QCS report.
- **Expected.** A "Last year" savings figure on the screen and in the report, computed with the same formula.
- **Oracle.** Screen vs report equality.
- **Trace.** P2 · automate-later · savings_configuration.rb:154 · master_qcs_report_components/config.rb

#### UI-FSAV-004 — Negative savings on the default reference (records current behaviour)
- **Setup.** A Budget reference below the best bid.
- **Steps.** Close with a bid; read Overview.
- **Expected.** Records whether the figure shows negative, zero or is hidden (code handles this case
  specially — flow-map Q12).
- **Oracle.** Overview savings card.
- **Trace.** P2 · automate · savings_calculator.rb:41-43

## 6. Terms & conditions

#### UI-FTNC-001 — Choosing a template loads its default clauses and attachments
- **Setup.** A template with saved T&C.
- **Steps.** Choose it; open Terms & Conditions.
- **Expected.** The template's clauses and attachments are listed.
- **Oracle.** The T&C modal's list; templateSelection.jsx:330-334.
- **Trace.** P1 · automate · templateSelection.jsx:330-334

#### UI-FTNC-002 — A product's own clauses are merged into the default group without duplicates
- **Setup.** A product that carries terms and conditions.
- **Steps.** Add it (twice, or with another product sharing a clause).
- **Expected.** Each clause appears once under the default group.
- **Oracle.** `uniqueTncs` (eventCreation.jsx:1552-1565).
- **Trace.** P2 · automate · eventCreation.jsx:1550-1591

#### UI-FTNC-003 — With the mandatory switch on, the vendor cannot submit without accepting every clause and attachment
- **Why it matters.** The switch overrides per-clause modes; a vendor who skipped one must be stopped.
- **Setup.** A published event with `is_tnc_mandatory` on and two clauses, one marked optional.
- **Steps.** As the vendor, accept one clause only and submit.
- **Expected.** Refused until every clause and attachment is accepted.
- **Oracle.** `effective_tnc_mode` returns required for all (trade_request.rb:991-1000).
- **Trace.** P0 · automate-later · trade_request.rb:991-1000

#### UI-FTNC-004 — With the switch off, only clauses marked required block the vendor
- **Setup.** `is_tnc_mandatory` off; one required, one optional clause.
- **Steps.** Accept the required one only; submit.
- **Expected.** Accepted.
- **Oracle.** Per-item mode applies.
- **Trace.** P1 · automate-later · trade_request.rb:998

#### UI-FTNC-005 — Event-wise clauses show on every stage; stage-wise clauses only on theirs
- **Setup.** An eRFX with an RFP and an RFQ; clauses on the event group and different clauses on the RFQ.
- **Steps.** Open each stage's T&C as the vendor.
- **Expected.** Event clauses on both; the RFQ's clauses on the RFQ only.
- **Oracle.** event_group.rb:352-368 (group clauses win when present). Flow-map Q16.
- **Trace.** P2 · automate-later · event_group.rb:352-368

#### UI-FTNC-006 — Payment Terms and Incoterms are mandatory on the payment-terms form
- **Setup.** A create screen whose template shows the payment-terms form.
- **Steps.** Leave both empty and save.
- **Expected.** "Payment Terms is mandatory" and "Incoterms is mandatory".
- **Oracle.** paymentTerms.jsx:20-21.
- **Trace.** P2 · automate · paymentTerms.jsx:20-21

## 7. Schedule

#### UI-FSCH-001 — The start date cannot be before today or more than three months ahead
- **Setup.** Schedule drawer, start "a date".
- **Steps.** Open the date picker.
- **Expected.** Days before today and after today + 3 months are disabled.
- **Oracle.** `getDisabledDate` (projectScheduler/helpers.js:6).
- **Trace.** P2 · automate · projectScheduler/helpers.js:6

#### UI-FSCH-002 — A start time in the past is refused
- **Setup.** Schedule drawer.
- **Steps.** Pick today with a time already passed; save.
- **Expected.** "Start time cannot be less than the current time".
- **Oracle.** en.json eventScheduleDrawer:325.
- **Trace.** P1 · automate · en.json:325

#### UI-FSCH-003 — An end before the start is refused
- **Setup.** Schedule drawer with an absolute end.
- **Steps.** Set the end earlier than the start; save.
- **Expected.** "Start time should be less than end time".
- **Oracle.** en.json:326.
- **Trace.** P1 · automate · en.json:326

#### UI-FSCH-004 — Duration presets are 30 min, 1 h, 4 h and 24 h plus custom, or the client's own list
- **Setup.** Schedule drawer, end as Duration.
- **Steps.** Open the duration choices.
- **Expected.** The four presets and a custom option, unless the client sets `event_duration_predefined_values`.
- **Oracle.** constants.js `eventDurationSteps`; template config.
- **Trace.** P3 · automate · projectScheduler/constants.js

#### UI-FSCH-005 — "Event will end at" equals start plus duration
- **Setup.** Start now, Duration 30 min.
- **Steps.** Read the helper line.
- **Expected.** The shown end = start + 30 min (to the minute).
- **Oracle.** `getCalculatedEventSchedule`.
- **Trace.** P1 · automate · projectScheduler/helpers.js:12-44

#### UI-FSCH-006 — Evaluation time is added after the end
- **Setup.** Duration 30 min, Evaluation time 30 min.
- **Steps.** Publish; read the event's evaluation window.
- **Expected.** Evaluation ends at end + 30 min (after any cost-breakdown window).
- **Oracle.** API read-back of the schedule; helpers.js:30-35.
- **Trace.** P1 · automate · projectScheduler/helpers.js:30-35

#### UI-FSCH-007 — Publishing with a later start lands the event under Upcoming
- **Setup.** Start at a time 30 minutes ahead.
- **Steps.** Publish.
- **Expected.** The event shows as upcoming (not Live); bidding is closed until the start.
- **Oracle.** Event status; the vendor cannot bid before the start.
- **Trace.** P1 · automate · eventHeader.jsx (ORDER_STATUS.upcoming)

## 8. Publish

#### UI-FPUB-001 — With every mandatory field set, Publish lands on the project page as Live
- **Why it matters.** This is the contract of the screen: all set, one click, the event is live.
  A Publish that does nothing here is a bug.
- **Setup.** Title, template, one complete line, one QA participant, schedule saved.
- **Steps.** Publish.
- **Expected.** The browser lands on the project page; status Live; the stage tab shows the countdown.
- **Oracle.** URL `/project/…`; status badge; API status active.
- **Trace.** P0 · automate · eventCreation.jsx

#### UI-FPUB-002 — Missing participants is reported before a missing template
- **Setup.** Title only; no template, no participants.
- **Steps.** Publish.
- **Expected.** "Please add participants to proceed!" first; with a participant and still no template,
  the savings message follows.
- **Oracle.** Order of the two refusals. Flow-map Q19.
- **Trace.** P1 · automate · live 198678 (6 Oct 2026)

#### UI-FPUB-003 — Publish on an old version is refused
- **Setup.** An event with a newer version.
- **Steps.** Try to publish the old version through its create screen.
- **Expected.** Refused (error 101: not the latest version).
- **Oracle.** trade_controller.rb:395.
- **Trace.** P1 · automate-later · trade_controller.rb:395

#### UI-FPUB-004 — An end time already in the past is refused at publish
- **Setup.** An absolute end time earlier than now (edit after waiting).
- **Steps.** Publish.
- **Expected.** Refused; the schedule must be fixed first.
- **Oracle.** trade_controller_helper.rb:331 (BOQ excepted).
- **Trace.** P1 · automate-later · trade_controller_helper.rb:331

#### UI-FPUB-005 — A single product with "multiple vendor" closing is refused with its message
- **Setup.** One line item; closing mode set to multiple vendors.
- **Steps.** Publish.
- **Expected.** "In case of single product, please choose multiple vendor closing."
- **Oracle.** en.json quickCreateOrder.singleProductMultipleVendors.
- **Trace.** P2 · automate-later · en.json

## 9. Price cap and surrogate bids on the Participants tab

#### UI-FCAP-001 — A price cap added for one vendor caps only that vendor
- **Why it matters.** Per-vendor caps are a negotiation tool; leaking a cap to other vendors is a defect.
- **Setup.** A live RFQ with two QA vendors.
- **Steps.** Add Price Cap X for vendor A; bid above X as A and as B.
- **Expected.** A is refused with the cap message; B is accepted.
- **Oracle.** Each vendor's bid outcome.
- **Trace.** P0 · automate-later · en.json:758 · trade_template_helper.rb

#### UI-FCAP-002 — Price cap and surrogate bid are offered only after publish
- **Setup.** A draft and a live event.
- **Steps.** Look for Add Bid / Add Price Cap on each.
- **Expected.** Absent on the draft ("Bid & Price Cap can be added after event creation."); present on
  the live event.
- **Oracle.** Control presence.
- **Trace.** P1 · automate · en.json:647

#### UI-FCAP-003 — Editing a cap after a bid exists follows the increase/decrease rule (records current behaviour)
- **Setup.** A live RFQ with a cap and one bid.
- **Steps.** Raise the cap; lower the cap below the bid.
- **Expected.** Records what the product allows for each (flow-map Q20).
- **Oracle.** trade_controller_helper.rb:469-477.
- **Trace.** P2 · automate-later · trade_controller_helper.rb:469-477

## 10. Master QCS and its report

#### UI-FQCS-001 — Master QCS reads "No bids are placed yet!" until the first bid
- **Setup.** A live RFQ with no bids.
- **Steps.** Open Master QCS.
- **Expected.** The empty message; no vendor columns.
- **Oracle.** Text on screen.
- **Trace.** P1 · automate · live (crawl 6 Oct 2026)

#### UI-FQCS-002 — After the first bid a vendor column appears with rank and amounts
- **Setup.** A live RFQ; the QA vendor bids.
- **Steps.** Open Master QCS.
- **Expected.** One column for the vendor: Qty Offer, Rank 1, Auction/RFQ Amount = price × quantity,
  rate per unit, Sum Total in the Final section.
- **Oracle.** Figures equal the bid the API holds.
- **Trace.** P0 · automate · live

#### UI-FQCS-003 — Ranks follow the amounts: lowest total is rank 1 on a buy event
- **Setup.** Two QA vendors bidding different totals.
- **Steps.** Open Master QCS.
- **Expected.** The lower total shows Rank 1, the other Rank 2.
- **Oracle.** rank_calculator.rb `ranking_for_scores`.
- **Trace.** P0 · automate · rank_calculator.rb

#### UI-FQCS-004 — Two vendors tied at the best price (records current behaviour)
- **Why it matters.** The code gives every tied vendor rank 2 and nobody rank 1; the product team
  must say whether that is intended (flow-map Q23).
- **Setup.** Two QA vendors bidding the same total.
- **Steps.** Open Master QCS.
- **Expected.** Records the ranks shown.
- **Oracle.** rank_calculator.rb:26-29.
- **Trace.** P1 · automate · rank_calculator.rb:22-32

#### UI-FQCS-005 — The downloaded report equals the screen
- **Why it matters.** The report is what gets shared and approved; it must never disagree with the screen.
- **Setup.** A closed RFQ with two bids.
- **Steps.** Open Master QCS; Download Report.
- **Expected.** For every vendor and line: Rate, Gross Amount and Rank in the file equal Master QCS
  at download time; Sum Total equals the sum of line amounts.
- **Oracle.** Parse the workbook; compare cell by cell.
- **Trace.** P0 · automate · master_qcs_report_components/config.rb:54-64

#### UI-FQCS-006 — The report's summary block describes the event correctly
- **Setup.** As UI-FQCS-005.
- **Steps.** Read the summary rows.
- **Expected.** Event link, id, title, template name, date, start, end, duration, creator, vendors
  invited and participated, closed-at all match the event.
- **Oracle.** config.rb SUMMARY_COLUMNS vs the API's event.
- **Trace.** P1 · automate · master_qcs_report_components/config.rb:39-52

#### UI-FQCS-007 — Sum Total in Auction Final equals the sum of the line amounts
- **Setup.** A bid with two lines.
- **Steps.** Read Master QCS.
- **Expected.** Sum Total = Σ line amounts (exact decimals).
- **Oracle.** Independent recomputation (integrity rules).
- **Trace.** P0 · automate · live

#### UI-FQCS-008 — The report version follows the client's setting (records which)
- **Setup.** Each client.
- **Steps.** Download the report; read its file name.
- **Expected.** Records V1–V4 or a report template per client (flow-map Q24).
- **Oracle.** master_qcs_report_selector.rb; file name `<ref>_Master_QCS_Report_V4`.
- **Trace.** P2 · automate · master_qcs_report_selector.rb

#### UI-FQCS-009 — A vendor invited but not bidding (records current behaviour)
- **Setup.** Two QA vendors invited, one bids.
- **Steps.** Download the report.
- **Expected.** Records whether the silent vendor appears, and with what in its cells (flow-map Q25).
- **Oracle.** The workbook's vendor columns.
- **Trace.** P2 · automate · master_qcs_report_v4.rb:192 (participant_vendor_ids)
