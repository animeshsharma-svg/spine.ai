# Product KB test cases — Vendor Dashboard

Generated from the Procol Notion Knowledge Base (help-centre articles) — each case is grounded in the article it traces to. Source pages are read-only; re-derive from Notion rather than editing facts here.

## 1. How to place a bid in a Technical Stage

#### PRD-KBVDB-001 — Vendor submits a Technical Stage response after choosing to participate

- **Why it matters.** The technical bid is the vendor's entry into the create→publish→bid→award path; if it cannot be submitted, the buyer has nothing to evaluate before the commercial round.
- **Setup.** Vendor (or Broker) invited to a live Technical Stage event; logged in to the vendor dashboard.
- **Steps.**
  1. Click the Event card to open the Event Overview screen.
  2. Click the blue "I will participate" button.
  3. On the Technical Stage screen, click "Select an option" and choose a vendor response (e.g. manufacturer, trader, seller).
  4. Fill the Vendor Assessments and Line Item Specifications.
  5. Scroll to the bottom and click "Submit".
- **Expected.** The Technical Stage response is submitted and a confirmation appears at the top of the screen; the response now waits for evaluation by the buyer/technical Evaluator.
- **Oracle.** Confirmation shown at the top of the screen after Submit; the vendor's Technical Stage response is recorded for the buyer to evaluate.
- **Trace.** P0 · automate-later · `50f92226c8b282f3bc690133226cadc6` · `how-to-place-a-bid-in-a-technical-stage` · Notion KB › Vendor Dashboard › How to place a bid in a Technical Stage

#### PRD-KBVDB-002 — Vendor type is chosen from the "Select an option" list

- **Why it matters.** The vendor-type answer is part of the vendor assessment the buyer scores; each option must be selectable.
- **Setup.** Vendor who has clicked "I will participate" on a Technical Stage event and is on the Technical Stage screen.
- **Steps.**
  1. Click "Select an option" in the vendor responses.
  2. Choose one of the options (manufacturer, trader, seller, etc.).
  3. Repeat with each of the other options.
- **Expected.** Each listed option (manufacturer, trader, seller, etc.) can be selected and is held as the vendor response.
- **Oracle.** The selected option is shown in the vendor response field after selection.
- **Trace.** P2 · automate-later · `50f92226c8b282f3bc690133226cadc6` · `how-to-place-a-bid-in-a-technical-stage` · Notion KB › Vendor Dashboard › How to place a bid in a Technical Stage

#### PRD-KBVDB-003 — Quick Fill "Same as requested" copies the buyer's values into all responses

- **Why it matters.** Quick Fill is the fast path for compliant vendors; a wrong copy would submit specifications the vendor never agreed to.
- **Setup.** Vendor on the Technical Stage screen of an event whose buyer specified values for the questions.
- **Steps.**
  1. Click the "⚡Quick Fill" option.
  2. Select "Same as requested".
- **Expected.** The values specified by the buyer are immediately copy-pasted into the vendor's responses for all the specified questions.
- **Oracle.** Every vendor response field for the specified questions shows the buyer's requested value.
- **Trace.** P2 · automate-later · `50f92226c8b282f3bc690133226cadc6` · `how-to-place-a-bid-in-a-technical-stage` · Notion KB › Vendor Dashboard › How to place a bid in a Technical Stage

#### PRD-KBVDB-004 — Quick Fill "Regret Item" marks an item as not being bid in the Technical Stage

- **Why it matters.** Regretting is the vendor's item-level opt-out; the buyer must see that no bid will come for that item.
- **Setup.** Vendor on the Technical Stage screen of an event with at least one line item.
- **Steps.**
  1. Click the "⚡Quick Fill" option for a line item.
  2. Press "Regret Item".
- **Expected.** The item is regretted, meaning the vendor will not be placing a bid for this item.
- **Oracle.** The line item shows as regretted on the Technical Stage screen (at the article's level of detail; see the Regret Items article for the exact effect).
- **Trace.** P2 · manual · `50f92226c8b282f3bc690133226cadc6` · `how-to-place-a-bid-in-a-technical-stage` · Notion KB › Vendor Dashboard › How to place a bid in a Technical Stage

#### PRD-KBVDB-005 — Technical Stage tab reached manually when not opened automatically

- **Why it matters.** If the automatic hop fails, the vendor must still be able to find the Technical Stage form.
- **Setup.** Vendor who has clicked "I will participate" on a Technical Stage event but is not automatically taken to the Technical Stage.
- **Steps.**
  1. Click the tab next to "Details".
- **Expected.** The Technical Stage screen opens, where Vendor Assessments and Line Item Specifications are filled.
- **Oracle.** The Technical Stage screen with Vendor Assessments and Line Item Specifications is displayed.
- **Trace.** P2 · automate-later · `50f92226c8b282f3bc690133226cadc6` · `how-to-place-a-bid-in-a-technical-stage` · Notion KB › Vendor Dashboard › How to place a bid in a Technical Stage

#### PRD-KBVDB-006 — Technical response can be changed and re-submitted while submission time is running

- **Why it matters.** Vendors correct mistakes before the deadline; the latest submission must be the one the buyer evaluates.
- **Setup.** Vendor who has already submitted a Technical Stage response; the event's submission time is still running.
- **Steps.**
  1. Reopen the Technical Stage screen.
  2. Change one or more responses.
  3. Scroll to the bottom and click "Submit" again.
- **Expected.** The changes are accepted and the response is re-submitted.
- **Oracle.** Confirmation appears at the top of the screen again and the changed values are what the response now holds.
- **Trace.** P2 · automate-later · `50f92226c8b282f3bc690133226cadc6` · `how-to-place-a-bid-in-a-technical-stage` · Notion KB › Vendor Dashboard › How to place a bid in a Technical Stage

#### PRD-KBVDB-007 — Broker can place a Technical Stage bid

- **Why it matters.** The article names Brokers as a persona for this flow; a broker login must be able to complete it too.
- **Setup.** Broker account invited to a live Technical Stage event.
- **Steps.**
  1. Click the Event card, then "I will participate".
  2. Fill the Technical Stage responses.
  3. Scroll to the bottom and click "Submit".
- **Expected.** The broker's Technical Stage response is submitted, same as for a vendor.
- **Oracle.** Confirmation appears at the top of the screen after Submit for the broker login.
- **Trace.** P2 · manual · `50f92226c8b282f3bc690133226cadc6` · `how-to-place-a-bid-in-a-technical-stage` · Notion KB › Vendor Dashboard › How to place a bid in a Technical Stage

## 2. How to not Participate in an Event

#### PRD-KBVDB-008 — Vendor declines an event with a reason

- **Why it matters.** Declining tells the buyer early that no bid is coming, so the buyer can chase other vendors.
- **Setup.** Vendor invited to a live event, on the Event Overview screen (opened from the Event card).
- **Steps.**
  1. Click the blue "I don't wish to participate" button.
  2. In the dialogue box that opens, select a reason for not participating.
  3. Confirm by clicking "I will not participate".
- **Expected.** The non-participation is recorded and the bottom of the screen shows "You've decided to not participate, Want to change your response?"
- **Oracle.** The text "You've decided to not participate, Want to change your response?" is displayed at the bottom of the screen.
- **Trace.** P1 · automate-later · `bca92226c8b282818c5301f10623d0ab` · `how-to-not-participate-in-an-event` · Notion KB › Vendor Dashboard › How to not Participate in an Event

#### PRD-KBVDB-009 — Declined vendor undoes the decision with "I will participate"

- **Why it matters.** The article promises the decline can be undone at any time; a vendor locked out after a mis-click is lost to the event.
- **Setup.** Vendor who has declined the event (bottom bar shows "You've decided to not participate, Want to change your response?").
- **Steps.**
  1. Click "I will participate".
- **Expected.** The non-participation is undone and the vendor is participating in the event.
- **Oracle.** The "You've decided to not participate" state is no longer shown and the vendor can proceed as a participant.
- **Trace.** P2 · manual · `bca92226c8b282818c5301f10623d0ab` · `how-to-not-participate-in-an-event` · Notion KB › Vendor Dashboard › How to not Participate in an Event

#### PRD-KBVDB-010 — Buyer is informed of the vendor's participation choice

- **Why it matters.** The article describes the choice as the way the buyer learns the vendor's willingness to participate.
- **Setup.** Vendor declined an event with a reason; buyer who owns the event.
- **Steps.**
  1. As the vendor, decline the event with a reason and confirm "I will not participate".
  2. As the buyer, open the event and look at that vendor's participation.
- **Expected.** The buyer can see that the vendor chose not to participate.
- **Oracle.** The buyer's view of the event shows the vendor's non-participation (at the article's level of detail).
- **Trace.** P2 · manual · `bca92226c8b282818c5301f10623d0ab` · `how-to-not-participate-in-an-event` · Notion KB › Vendor Dashboard › How to not Participate in an Event

## 3. How to Regret Items in a sourcing events?

#### PRD-KBVDB-011 — Regret Item writes "Regret" into every vendor response for the item

- **Why it matters.** Item-level regret must be unambiguous to the buyer; every response for the item should read as a regret.
- **Setup.** Vendor participating in an event, on the Technical Stage Event tab, with at least one line item.
- **Steps.**
  1. Click the ⚡ Quick Fill option for a line item.
  2. Press "Regret Item".
- **Expected.** All Vendor Responses for that item are written as "Regret".
- **Oracle.** Each vendor response field for the item shows "Regret".
- **Trace.** P1 · automate-later · `f5892226c8b282679cd4814d4e1f350f` · `how-to-regret-items-in-a-sourcing-events` · Notion KB › Vendor Dashboard › How to Regret Items in a sourcing events?

#### PRD-KBVDB-012 — Regretted item is crossed out in the Technical Stage and in later RFQ and RA stages

- **Why it matters.** The regret must carry forward; an item reappearing as biddable in RFQ or RA would contradict what the vendor told the buyer.
- **Setup.** Vendor who regretted a line item in the Technical Stage of a multi-stage event with RFQ and RA stages.
- **Steps.**
  1. Regret a line item via ⚡ Quick Fill → "Regret Item" in the Technical Stage.
  2. View the item in the Technical Stage.
  3. When the RFQ stage and the RA stage open, view the same item there.
- **Expected.** The line item is crossed out in the technical stage and in all future stages (RFQ and RA).
- **Oracle.** The item is shown struck through in the Technical Stage, the RFQ stage and the RA stage.
- **Trace.** P1 · automate-later · `f5892226c8b282679cd4814d4e1f350f` · `how-to-regret-items-in-a-sourcing-events` · Notion KB › Vendor Dashboard › How to Regret Items in a sourcing events?

#### PRD-KBVDB-013 — Regretted item is crossed out in the buyer's QCS

- **Why it matters.** The buyer compares bids in the QCS; a regretted item must not look like a missing or zero bid.
- **Setup.** Vendor regretted a line item; buyer who owns the event with access to the QCS.
- **Steps.**
  1. As the vendor, regret a line item via ⚡ Quick Fill → "Regret Item".
  2. As the buyer, open the QCS for the event.
- **Expected.** The regretted line item is crossed out in the QCS for the buyer.
- **Oracle.** The item for that vendor is shown struck through in the buyer's QCS.
- **Trace.** P1 · automate-later · `f5892226c8b282679cd4814d4e1f350f` · `how-to-regret-items-in-a-sourcing-events` · Notion KB › Vendor Dashboard › How to Regret Items in a sourcing events?

#### PRD-KBVDB-014 — Vendor cannot place a commercial bid for a regretted item

- **Why it matters.** The article states a hard restriction; allowing a commercial bid after a regret would corrupt the comparison.
- **Setup.** Vendor who regretted a line item in the Technical Stage; the commercial (RFQ/RA) stage is open.
- **Steps.**
  1. Open the commercial stage of the event.
  2. Try to enter a price for the regretted item.
- **Expected.** The vendor is not able to place a commercial bid for the item.
- **Oracle.** No bid can be entered or submitted for the regretted item.
- **Trace.** P1 · automate-later · `f5892226c8b282679cd4814d4e1f350f` · `how-to-regret-items-in-a-sourcing-events` · Notion KB › Vendor Dashboard › How to Regret Items in a sourcing events?

#### PRD-KBVDB-015 — Regretting one item leaves the vendor participating in the rest of the event

- **Why it matters.** Regret is item-level only; it must not knock the vendor out of the whole event.
- **Setup.** Vendor participating in an event with two or more line items.
- **Steps.**
  1. Regret one line item via ⚡ Quick Fill → "Regret Item".
  2. Fill responses for the other line items and submit.
- **Expected.** Non-participation applies only to the regretted item; the vendor still participates in the rest of the event.
- **Oracle.** The other line items keep their responses and are submitted; only the regretted item shows "Regret".
- **Trace.** P2 · automate-later · `f5892226c8b282679cd4814d4e1f350f` · `how-to-regret-items-in-a-sourcing-events` · Notion KB › Vendor Dashboard › How to Regret Items in a sourcing events?

## 4. Discovering the Vendor Dashboard

No test cases — the article has no content yet in Notion.

## 5. How to participate in Events as a Vendor?

#### PRD-KBVDB-016 — Vendor participates in a live event and submits the Quote sheet

- **Why it matters.** This is the vendor bid submission on the core create→publish→bid→award path.
- **Setup.** Vendor invited to a live event; logged in to the vendor dashboard where the live event appears as an Event card.
- **Steps.**
  1. Click the Event Card.
  2. On the Event Overview screen, click the blue "I will participate" button.
  3. Fill the Quote sheet, scrolling through the sections and filling all the Mandatory fields.
  4. Scroll to the bottom and click "Submit".
- **Expected.** The response is submitted, a confirmation appears at the top of the screen, and the response waits for evaluation by the buyer.
- **Oracle.** Confirmation at the top of the screen after Submit; the submitted response is shown to the vendor.
- **Trace.** P0 · automate-later · `36892226c8b28239953c81274a00497d` · `how-to-participate-in-events-as-a-vendor` · Notion KB › Vendor Dashboard › How to participate in Events as a Vendor?

#### PRD-KBVDB-017 — Quote sheet tab reached manually when not opened automatically

- **Why it matters.** If the automatic hop after "I will participate" fails, the vendor must still reach the form to bid.
- **Setup.** Vendor who clicked "I will participate" but was not automatically taken to the next tab.
- **Steps.**
  1. Click the tab next to "Event Overview".
- **Expected.** The form to fill and submit (Quote sheet) is shown.
- **Oracle.** The Quote sheet / form tab is displayed.
- **Trace.** P2 · automate-later · `36892226c8b28239953c81274a00497d` · `how-to-participate-in-events-as-a-vendor` · Notion KB › Vendor Dashboard › How to participate in Events as a Vendor?

#### PRD-KBVDB-018 — All Mandatory fields of the form must be filled before submitting

- **Why it matters.** The article instructs vendors to fill every Mandatory field; an incomplete bid reaching the buyer would be unusable.
- **Setup.** Vendor on the event's form after clicking "I will participate".
- **Steps.**
  1. Leave one Mandatory field empty and fill the rest.
  2. Scroll to the bottom and click "Submit".
  3. Fill the empty Mandatory field and click "Submit" again.
- **Expected.** A complete submission requires all Mandatory fields; with all filled, the submission succeeds with the confirmation at the top of the screen.
- **Oracle.** Record how the form treats the empty Mandatory field; confirm the submission goes through only once all Mandatory fields are filled.
- **Trace.** P1 · manual · `36892226c8b28239953c81274a00497d` · `how-to-participate-in-events-as-a-vendor` · Notion KB › Vendor Dashboard › How to participate in Events as a Vendor?

#### PRD-KBVDB-019 — Quote can be changed and re-submitted while submission time is running

- **Why it matters.** Vendors revise their quote before the deadline; the buyer must see the latest version.
- **Setup.** Vendor who has already submitted a response; the event's submission time is still running.
- **Steps.**
  1. Reopen the Quote sheet.
  2. Change one or more values.
  3. Scroll to the bottom and click "Submit".
- **Expected.** The changes are accepted and the response is re-submitted.
- **Oracle.** Confirmation appears at the top of the screen again and the changed values are held in the submitted response.
- **Trace.** P2 · automate-later · `36892226c8b28239953c81274a00497d` · `how-to-participate-in-events-as-a-vendor` · Notion KB › Vendor Dashboard › How to participate in Events as a Vendor?

## 6. How do I add Subsidiaries as a Broker?

#### PRD-KBVDB-020 — Broker adds a supplier with a Tax ID

- **Why it matters.** Brokers can only bid on behalf of suppliers they have onboarded; this is how a supplier gets there.
- **Setup.** Broker logged in to the Vendor/Supplier Dashboard.
- **Steps.**
  1. Click the Profile icon on the top-right corner and click "Manage Suppliers".
  2. Click the "Add Supplier" button at the top-right.
  3. Fill Full Name, Phone Number (select country code and enter number), Email Address, and Business Location (searchable dropdown).
  4. Enter the Tax ID in the field that appears for the selected location.
  5. Click "Done".
- **Expected.** A tooltip confirms "Vendor Created." and the broker is redirected back to the Suppliers List, where the new supplier is visible.
- **Oracle.** "Vendor Created." tooltip shown; the new supplier appears in the Suppliers List.
- **Trace.** P1 · automate-later · `2f192226c8b2823ba22581b474102507` · `how-do-i-add-subsidiaries-as-a-broker` · Notion KB › Vendor Dashboard › How do I add Subsidiaries as a Broker?

#### PRD-KBVDB-021 — Profile menu shows Manage Suppliers, My Profile and Logout

- **Why it matters.** The profile menu is the only entry point to supplier management described for brokers.
- **Setup.** Broker logged in to the Vendor/Supplier Dashboard.
- **Steps.**
  1. Hover over the Profile icon on the top-right corner.
- **Expected.** Three options are shown: Manage Suppliers, My Profile, Logout.
- **Oracle.** The menu lists exactly "Manage Suppliers", "My Profile" and "Logout".
- **Trace.** P3 · automate-later · `2f192226c8b2823ba22581b474102507` · `how-do-i-add-subsidiaries-as-a-broker` · Notion KB › Vendor Dashboard › How do I add Subsidiaries as a Broker?

#### PRD-KBVDB-022 — Manage Suppliers page lists already-onboarded suppliers

- **Why it matters.** Brokers need to see which suppliers they can already bid for before adding new ones.
- **Setup.** Broker who has onboarded at least one supplier.
- **Steps.**
  1. Open Profile → "Manage Suppliers".
- **Expected.** The Manage Suppliers page shows all suppliers the broker has already onboarded.
- **Oracle.** Every previously onboarded supplier appears in the list.
- **Trace.** P2 · automate-later · `2f192226c8b2823ba22581b474102507` · `how-do-i-add-subsidiaries-as-a-broker` · Notion KB › Vendor Dashboard › How do I add Subsidiaries as a Broker?

#### PRD-KBVDB-023 — Business Location India shows a GST Tax ID field

- **Why it matters.** The tax identifier must match the supplier's country for compliance.
- **Setup.** Broker on the Add Supplier form.
- **Steps.**
  1. Select India in Business Location.
- **Expected.** A Tax ID field labelled GST appears automatically.
- **Oracle.** The Tax ID field shown is GST.
- **Trace.** P2 · automate-later · `2f192226c8b2823ba22581b474102507` · `how-do-i-add-subsidiaries-as-a-broker` · Notion KB › Vendor Dashboard › How do I add Subsidiaries as a Broker?

#### PRD-KBVDB-024 — Business Location Estonia shows a VAT Tax ID field

- **Why it matters.** Non-Indian suppliers need their own country's tax identifier, not GST.
- **Setup.** Broker on the Add Supplier form.
- **Steps.**
  1. Select Estonia in Business Location.
  2. Select another country and note the Tax ID field shown.
- **Expected.** For Estonia a Tax ID field labelled VAT appears; other countries show their respective Tax ID.
- **Oracle.** The Tax ID field shown is VAT for Estonia and changes with the selected country.
- **Trace.** P2 · automate-later · `2f192226c8b2823ba22581b474102507` · `how-do-i-add-subsidiaries-as-a-broker` · Notion KB › Vendor Dashboard › How do I add Subsidiaries as a Broker?

#### PRD-KBVDB-025 — Supplier without a Tax ID is added with company name, address and city

- **Why it matters.** Suppliers without a Tax ID must still be onboardable, with company details captured manually.
- **Setup.** Broker on the Add Supplier form; Full Name, Phone Number and Email Address filled.
- **Steps.**
  1. Click the blue highlighted text under the Tax ID field.
  2. Enter Company Name and Company Address.
  3. Select City from the searchable dropdown.
  4. Click "Done".
- **Expected.** The Business Location and Tax ID fields are hidden and Company Name, Company Address and City are shown instead; after Done, "Vendor Created." appears and the supplier is in the Suppliers List.
- **Oracle.** Business Location and Tax ID fields disappear after the click; "Vendor Created." tooltip; supplier listed in the Suppliers List.
- **Trace.** P2 · automate-later · `2f192226c8b2823ba22581b474102507` · `how-do-i-add-subsidiaries-as-a-broker` · Notion KB › Vendor Dashboard › How do I add Subsidiaries as a Broker?

#### PRD-KBVDB-026 — Blue highlighted text toggles back to the Tax ID option

- **Why it matters.** A broker who switched to manual company details by mistake must be able to return to Tax ID entry.
- **Setup.** Broker on the Add Supplier form who has clicked the blue highlighted text (manual company fields shown).
- **Steps.**
  1. Click the blue highlighted text again.
- **Expected.** The form returns to using the Tax ID option.
- **Oracle.** Business Location and Tax ID fields are shown again.
- **Trace.** P2 · automate-later · `2f192226c8b2823ba22581b474102507` · `how-do-i-add-subsidiaries-as-a-broker` · Notion KB › Vendor Dashboard › How do I add Subsidiaries as a Broker?

#### PRD-KBVDB-027 — Broker can bid on behalf of a newly added supplier in a future event

- **Why it matters.** Bidding on behalf of suppliers is the purpose of adding them; it touches the bid path.
- **Setup.** Broker who has just added a supplier (visible in the Suppliers List); a later event the broker is invited to.
- **Steps.**
  1. Open the future event as the broker.
  2. Place a bid on behalf of the newly added supplier.
- **Expected.** The broker can bid on behalf of the supplier in the event.
- **Oracle.** The bid is recorded against the supplier (at the article's level of detail; the article gives no further UI steps).
- **Trace.** P1 · manual · `2f192226c8b2823ba22581b474102507` · `how-do-i-add-subsidiaries-as-a-broker` · Notion KB › Vendor Dashboard › How do I add Subsidiaries as a Broker?

## 7. How to do Cost Breakdown as a Vendor?

#### PRD-KBVDB-028 — Vendor bids on the Sum Total in the auction and submits a locked cost breakdown

- **Why it matters.** Cost breakdown turns a lump-sum auction bid into per-item prices used for PO, audit and comparison; it is money on the award path.
- **Setup.** Vendor participating in a live auction in Cost Breakdown Mode, with RFQ quotes already submitted.
- **Steps.**
  1. In the auction, reduce the Sum Total bid and click "Revise Bid".
  2. Wait for the auction submission time to end so the Cost Breakdown Time (CBD time) begins.
  3. Review the auto breakdown the system fills in across line items.
  4. Click "Submit Cost Breakdown".
  5. In the confirmation dialog, click "Yes, Submit".
- **Expected.** The cost breakdown is locked and a confirmation message shows that the cost breakdown has been successfully submitted and justified.
- **Oracle.** Confirmation message after "Yes, Submit"; item prices are no longer editable.
- **Trace.** P0 · automate-later · `41592226c8b282d8ad86817e533d809a` · `how-to-do-cost-breakdown-as-a-vendor` · Notion KB › Vendor Dashboard › How to do Cost Breakdown as a Vendor?

#### PRD-KBVDB-029 — During the auction the vendor can only bid on the Sum Total

- **Why it matters.** The article restricts auction bidding to the lot total; per-item bidding here would bypass the breakdown step.
- **Setup.** Vendor in a live auction in Cost Breakdown Mode.
- **Steps.**
  1. Open the auction bidding screen.
  2. Read the message shown and look for the bid inputs available.
- **Expected.** The message reads "You are bidding on the total lot amount we received from your RFQ Quotes. A request for line item-wise cost breakdown will be triggered once the auction submission time ends." and only the Sum Total can be bid on.
- **Oracle.** The message text is shown; no per-line-item bid input is available during the auction.
- **Trace.** P1 · automate-later · `41592226c8b282d8ad86817e533d809a` · `how-to-do-cost-breakdown-as-a-vendor` · Notion KB › Vendor Dashboard › How to do Cost Breakdown as a Vendor?

#### PRD-KBVDB-030 — Sum Total reduced by a Fixed Value

- **Why it matters.** The reduction method decides the price the vendor commits to; the new bid must equal the total minus the fixed amount.
- **Setup.** Vendor in a live auction in Cost Breakdown Mode with a Sum Total (e.g. ₹11,204.34).
- **Steps.**
  1. In the dropdown next to "Fixed Value", keep "Fixed Value".
  2. Enter a reduction (e.g. ₹204.34).
  3. Click "Revise Bid".
- **Expected.** The vendor sees the new current bid reflecting the fixed-value reduction.
- **Oracle.** Current bid equals the Sum Total minus the entered fixed value.
- **Trace.** P0 · automate-later · `41592226c8b282d8ad86817e533d809a` · `how-to-do-cost-breakdown-as-a-vendor` · Notion KB › Vendor Dashboard › How to do Cost Breakdown as a Vendor?

#### PRD-KBVDB-031 — Sum Total reduced by a Percentage

- **Why it matters.** Percentage discounts are the second reduction method; the computed bid must match the percentage applied.
- **Setup.** Vendor in a live auction in Cost Breakdown Mode with a Sum Total.
- **Steps.**
  1. In the dropdown next to "Fixed Value", select "Percentage".
  2. Enter a discount (e.g. 10%).
  3. Click "Revise Bid".
- **Expected.** The discount is applied on the Sum Total and the new current bid reflects the reduction.
- **Oracle.** Current bid equals the Sum Total reduced by the entered percentage.
- **Trace.** P0 · automate-later · `41592226c8b282d8ad86817e533d809a` · `how-to-do-cost-breakdown-as-a-vendor` · Notion KB › Vendor Dashboard › How to do Cost Breakdown as a Vendor?

#### PRD-KBVDB-032 — Cost Breakdown Time begins automatically when auction submission time ends

- **Why it matters.** Vendors must be prompted to break down their bid without any manual trigger, or per-item prices never get captured.
- **Setup.** Vendor who placed a Sum Total bid in a Cost Breakdown Mode auction.
- **Steps.**
  1. Wait for the auction submission time to end.
- **Expected.** The Cost Breakdown Time (CBD time) begins automatically and the vendor is prompted to break down the submitted total bid across line items.
- **Oracle.** CBD time is shown and the line-item breakdown screen is presented without vendor action.
- **Trace.** P1 · automate-later · `41592226c8b282d8ad86817e533d809a` · `how-to-do-cost-breakdown-as-a-vendor` · Notion KB › Vendor Dashboard › How to do Cost Breakdown as a Vendor?

#### PRD-KBVDB-033 — Auto breakdown is pre-filled pro rata and each discount or price is editable

- **Why it matters.** The pro-rata default saves effort, but vendors must be able to shape their per-item prices.
- **Setup.** Vendor in Cost Breakdown Time after an auction.
- **Steps.**
  1. Open the breakdown screen and review the pre-filled values.
  2. Change the discount applied to one line item.
  3. Manually edit the price of another line item.
- **Expected.** The system has already filled an auto breakdown (discounts by pro rata distribution); the vendor can manually change each discount and manually edit each price.
- **Oracle.** Pre-filled per-item values present on open; edited discount and price are held in the fields.
- **Trace.** P1 · automate-later · `41592226c8b282d8ad86817e533d809a` · `how-to-do-cost-breakdown-as-a-vendor` · Notion KB › Vendor Dashboard › How to do Cost Breakdown as a Vendor?

#### PRD-KBVDB-034 — Line item price above the RFQ value is rejected with the amount to reduce

- **Why it matters.** The breakdown must never raise any item above what was quoted in the RFQ.
- **Setup.** Vendor in Cost Breakdown Time.
- **Steps.**
  1. Edit one line item's price to a value greater than its RFQ value.
  2. Try to submit the cost breakdown.
- **Expected.** An error message is shown and the system indicates how much needs to be reduced further.
- **Oracle.** Error message visible with the remaining reduction amount; the breakdown is not accepted.
- **Trace.** P0 · automate-later · `41592226c8b282d8ad86817e533d809a` · `how-to-do-cost-breakdown-as-a-vendor` · Notion KB › Vendor Dashboard › How to do Cost Breakdown as a Vendor?

#### PRD-KBVDB-035 — Breakdown total that does not match the auction bid is rejected

- **Why it matters.** Per-item prices must add up to the price won in the auction, or PO values drift from the award.
- **Setup.** Vendor in Cost Breakdown Time.
- **Steps.**
  1. Edit line item prices so their total exceeds the submitted auction bid.
  2. Try to submit the cost breakdown.
- **Expected.** An error message is shown and the system indicates how much needs to be reduced further; the total must match the submitted auction bid.
- **Oracle.** Error message with the remaining reduction amount; submission only succeeds once the total equals the auction bid.
- **Trace.** P0 · automate-later · `41592226c8b282d8ad86817e533d809a` · `how-to-do-cost-breakdown-as-a-vendor` · Notion KB › Vendor Dashboard › How to do Cost Breakdown as a Vendor?

#### PRD-KBVDB-036 — Final-submission warning and lock after "Yes, Submit"

- **Why it matters.** Once submitted the per-item prices are final; the vendor must be warned and the lock must hold.
- **Setup.** Vendor in Cost Breakdown Time with a valid breakdown.
- **Steps.**
  1. Click "Submit Cost Breakdown".
  2. Read the confirmation dialog.
  3. Click "Yes, Submit".
  4. Try to edit an item price.
- **Expected.** The dialog reads "This is the final submission for item prices. Once submitted, you won't be able to change these item prices."; after "Yes, Submit" the breakdown is locked and item prices cannot be changed.
- **Oracle.** Dialog text shown; after submission the item price fields are not editable.
- **Trace.** P0 · automate-later · `41592226c8b282d8ad86817e533d809a` · `how-to-do-cost-breakdown-as-a-vendor` · Notion KB › Vendor Dashboard › How to do Cost Breakdown as a Vendor?

#### PRD-KBVDB-037 — Submitted breakdown can only be revised if the buyer reopens the window or shares counteroffers

- **Why it matters.** The lock has two stated exceptions; they must re-enable revision and nothing else should.
- **Setup.** Vendor with a submitted cost breakdown; buyer who owns the event.
- **Steps.**
  1. As the vendor, confirm the breakdown cannot be revised.
  2. As the buyer, reopen the cost breakdown window (or share counteroffers).
  3. As the vendor, try to revise the breakdown again.
- **Expected.** The vendor cannot revise the breakdown unless the buyer reopens the window or shares counteroffers.
- **Oracle.** Revision blocked before the buyer action and possible after it (buyer-side steps are not described in the article).
- **Trace.** P1 · manual · `41592226c8b282d8ad86817e533d809a` · `how-to-do-cost-breakdown-as-a-vendor` · Notion KB › Vendor Dashboard › How to do Cost Breakdown as a Vendor?
