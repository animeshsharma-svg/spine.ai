# Generated test cases — drafts (2026-11-03)

Every case below was written by the spine.ai assistant when someone typed a test case that no existing case covered.
They are DRAFTS: nothing here is in the catalog until a person reviews it and moves it into a catalog file
(the importer does not read `generated-*.md`, and `GEN-` ids are not parsed).

## 1. Drafts from the assistant

### GEN-JRN-131 — Publish is refused when the event title is blank

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with 2 line items, Bolt quantity 100 and Nut quantity 200, invite the vendor and publish it. As the vendor", grounded in rule R-14. **Draft, needs review** — written by the assistant on 2026-11-03 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFQ with 2 line items, Bolt quantity 100 and Nut q — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A draft RFQ with Bolt quantity 100 and Nut quantity 200, with the event title left blank and all required pricing and schedule fields completed.
- **Test data.** Event title: blank; Bolt quantity: 100; Nut quantity: 200
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the draft RFQ 3. Leave the field with placeholder "Enter the title of this event" blank 4. Click the "Publish" button 5. Confirm the publish action if a confirmation dialog appears
- **Expected.** The RFQ is not published. The title field has a red outline and the message "Title is missing" is shown. The event remains in draft status.
- **Oracle.** The RFQ is not published. The title field has a red outline and the message "Title is missing" is shown. The event remains in draft status.
- **Trace.** High · Negative · draft · `GEN-JRN-131` · layer ui · coverage none · typed: “journey: Create an RFQ with 2 line items, Bolt quantity 100 and Nut quantity 200, invite the vendor and publish it. As the vendor open the event, check Bolt 100 and Nut 200 are shown, and place a bid ”

### GEN-JRN-132 — The event refuses a zero quantity during item setup

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with 2 line items, Bolt quantity 100 and Nut quantity 200, invite the vendor and publish it. As the vendor", grounded in rule R-5. **Draft, needs review** — written by the assistant on 2026-11-03 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFQ with 2 line items, Bolt quantity 100 and Nut q — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** The eRFX create screen is open for a new RFQ and the buyer is adding the Bolt line.
- **Test data.** Product: Bolt; Quantity: 0; Unit: the default unit
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the eRFX create screen 3. Set the stage to "RFQ" 4. Choose the available template 5. Search for "Bolt" in the product field 6. Type 0 in the "Quantity" field 7. Click the "Add" button for the line item
- **Expected.** The Bolt line is not added with quantity 0. A validation message is shown beside the quantity field or in a toast. Record the exact message shown.
- **Oracle.** The Bolt line is not added with quantity 0. A validation message is shown beside the quantity field or in a toast. Record the exact message shown.
- **Trace.** High · Edge · draft · `GEN-JRN-132` · layer ui · coverage none · typed: “journey: Create an RFQ with 2 line items, Bolt quantity 100 and Nut quantity 200, invite the vendor and publish it. As the vendor open the event, check Bolt 100 and Nut 200 are shown, and place a bid ”

### GEN-JRN-133 — A newer vendor bid makes the earlier bid revised

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with 2 line items, Bolt quantity 100 and Nut quantity 200, invite the vendor and publish it. As the vendor", grounded in rule R-3. **Draft, needs review** — written by the assistant on 2026-11-03 from a request typed in the chat box; the automation covers part of it — not yet: see the gaps.
- **Module / scenario.** Journey — Create an RFQ with 2 line items, Bolt quantity 100 and Nut q — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A published RFQ with Bolt quantity 100 and Nut quantity 200 is open for bidding, and the invited QA vendor has access to the event.
- **Test data.** First bid: Bolt 100, Nut 100; second bid: Bolt 110, Nut 110
- **Steps.** 1. Log in to Procol (vendor side) with the invited QA vendor 2. Open the published RFQ 3. Type 100 in the Bolt price field 4. Type 100 in the Nut price field 5. Click the "Submit Bid" button 6. Type 110 in the Bolt price field 7. Type 110 in the Nut price field 8. Click the "Submit Bid" button 9. Log in to Procol (buyer side) with the buyer user 10. Open the RFQ's "Responses" tab
- **Expected.** The vendor has one latest active bid showing Bolt 110 and Nut 110. The earlier bid is marked revised or superseded and is not treated as the active bid for ranking or awarding.
- **Oracle.** The vendor has one latest active bid showing Bolt 110 and Nut 110. The earlier bid is marked revised or superseded and is not treated as the active bid for ranking or awarding.
- **Trace.** High · Positive · draft · `GEN-JRN-133` · layer ui · coverage partial · typed: “journey: Create an RFQ with 2 line items, Bolt quantity 100 and Nut quantity 200, invite the vendor and publish it. As the vendor open the event, check Bolt 100 and Nut 200 are shown, and place a bid ”

### GEN-JRN-134 — A vendor cannot submit a bid after bidding has closed

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with 2 line items, Bolt quantity 100 and Nut quantity 200, invite the vendor and publish it. As the vendor", grounded in rule R-3. **Draft, needs review** — written by the assistant on 2026-11-03 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFQ with 2 line items, Bolt quantity 100 and Nut q — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A closed RFQ with Bolt quantity 100 and Nut quantity 200, where the invited QA vendor submitted 100 for each line before bidding closed.
- **Test data.** Attempted new bid: Bolt 101; Nut 101
- **Steps.** 1. Log in to Procol (vendor side) with the invited QA vendor 2. Open the closed RFQ 3. Type 101 in the Bolt price field 4. Type 101 in the Nut price field 5. Click the "Submit Bid" button
- **Expected.** The bid is not submitted. The bid fields or the "Submit Bid" button are disabled, or the application shows a refusal message. The existing bid of 100 on each line remains unchanged. Record the exact message shown if the application displays one.
- **Oracle.** The bid is not submitted. The bid fields or the "Submit Bid" button are disabled, or the application shows a refusal message. The existing bid of 100 on each line remains unchanged. Record the exact message shown if the application displays one.
- **Trace.** Critical · Negative · draft · `GEN-JRN-134` · layer ui · coverage none · typed: “journey: Create an RFQ with 2 line items, Bolt quantity 100 and Nut quantity 200, invite the vendor and publish it. As the vendor open the event, check Bolt 100 and Nut 200 are shown, and place a bid ”

### GEN-JRN-135 — The invited vendor is rank 1 for both submitted lines

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with 2 line items, Bolt quantity 100 and Nut quantity 200, invite the vendor and publish it. As the vendor", grounded in rule R-3. **Draft, needs review** — written by the assistant on 2026-11-03 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFQ with 2 line items, Bolt quantity 100 and Nut q — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A closed RFQ with exactly one invited QA vendor, with an active bid of 100 for Bolt quantity 100 and 100 for Nut quantity 200.
- **Test data.** Bolt bid: 100; Nut bid: 100
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the closed RFQ 3. Click "Master QCS" 4. Open the vendor ranking view if it is not already displayed
- **Expected.** The invited vendor appears in rank 1 for Bolt and rank 1 for Nut. The active bid values are 100 for both lines, with no revised, rejected, or withdrawn bid used for ranking.
- **Oracle.** The invited vendor appears in rank 1 for Bolt and rank 1 for Nut. The active bid values are 100 for both lines, with no revised, rejected, or withdrawn bid used for ranking.
- **Trace.** High · Positive · draft · `GEN-JRN-135` · layer ui · coverage none · typed: “journey: Create an RFQ with 2 line items, Bolt quantity 100 and Nut quantity 200, invite the vendor and publish it. As the vendor open the event, check Bolt 100 and Nut 200 are shown, and place a bid ”

### GEN-JRN-136 — Select All Items is available when awarding is enabled

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with 2 line items, Bolt quantity 100 and Nut quantity 200, invite the vendor and publish it. As the vendor", grounded in rule R-4. **Draft, needs review** — written by the assistant on 2026-11-03 from a request typed in the chat box; the automation covers part of it — not yet: see the gaps.
- **Module / scenario.** Journey — Create an RFQ with 2 line items, Bolt quantity 100 and Nut q — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A closed RFQ with one non-blacklisted invited QA vendor, an active bid on both awardable lines, and no lot awarding or Excel award in progress.
- **Configs needed.** enable_select_all_items_for_awarding = On — shows the vendor-level Select All Items control during awarding
- **Test data.** Bolt awarded quantity: 100; Nut awarded quantity: 200
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the closed RFQ 3. Click "Master QCS" 4. Click "Start Awarding" 5. Open the invited vendor's awarding row
- **Expected.** The "Select All Items" control is visible for the vendor. Both Bolt and Nut are available as awardable lines.
- **Oracle.** The "Select All Items" control is visible for the vendor. Both Bolt and Nut are available as awardable lines.
- **Trace.** Medium · Positive · draft · `GEN-JRN-136` · layer ui · coverage partial · typed: “journey: Create an RFQ with 2 line items, Bolt quantity 100 and Nut quantity 200, invite the vendor and publish it. As the vendor open the event, check Bolt 100 and Nut 200 are shown, and place a bid ”

### GEN-JRN-137 — Select All Items is hidden when awarding is disabled

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with 2 line items, Bolt quantity 100 and Nut quantity 200, invite the vendor and publish it. As the vendor", grounded in rule R-4. **Draft, needs review** — written by the assistant on 2026-11-03 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFQ with 2 line items, Bolt quantity 100 and Nut q — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A closed RFQ with one non-blacklisted invited QA vendor, an active bid on both awardable lines, and no lot awarding or Excel award in progress.
- **Configs needed.** enable_select_all_items_for_awarding = Off — hides the vendor-level Select All Items control during awarding
- **Test data.** Bolt awarded quantity: 100; Nut awarded quantity: 200
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the closed RFQ 3. Click "Master QCS" 4. Click "Start Awarding" 5. Open the invited vendor's awarding row
- **Expected.** The "Select All Items" control is not shown. The buyer can still award Bolt and Nut by entering their quantities individually.
- **Oracle.** The "Select All Items" control is not shown. The buyer can still award Bolt and Nut by entering their quantities individually.
- **Trace.** Medium · Negative · draft · `GEN-JRN-137` · layer ui · coverage none · typed: “journey: Create an RFQ with 2 line items, Bolt quantity 100 and Nut quantity 200, invite the vendor and publish it. As the vendor open the event, check Bolt 100 and Nut 200 are shown, and place a bid ”

### GEN-JRN-138 — An awarded zero quantity is saved as zero value

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with 2 line items, Bolt quantity 100 and Nut quantity 200, invite the vendor and publish it. As the vendor", grounded in rule R-6. **Draft, needs review** — written by the assistant on 2026-11-03 from a request typed in the chat box; the automation covers part of it — not yet: see the gaps.
- **Module / scenario.** Journey — Create an RFQ with 2 line items, Bolt quantity 100 and Nut q — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A closed RFQ where the invited QA vendor has an active bid of 100 on Bolt and Nut, with partial awarding enabled.
- **Configs needed.** is_partial_awarding_enabled = On — allows a line to be awarded with a specified partial quantity
- **Test data.** Bolt awarded quantity: 0 at price 100; Nut awarded quantity: 200 at price 100
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the closed RFQ 3. Click "Master QCS" 4. Click "Start Awarding" 5. Type 0 in the invited vendor's Bolt awarded quantity field 6. Type 200 in the invited vendor's Nut awarded quantity field 7. Click "Create Proposal" 8. Fill the required proposal fields 9. Click "Submit Proposal"
- **Expected.** The proposal records Bolt with awarded quantity 0 and value ₹0, and Nut with 200 × 100 = ₹20,000. The zero-quantity Bolt line is not converted to a positive awarded quantity.
- **Oracle.** The proposal records Bolt with awarded quantity 0 and value ₹0, and Nut with 200 × 100 = ₹20,000. The zero-quantity Bolt line is not converted to a positive awarded quantity.
- **Trace.** High · Edge · draft · `GEN-JRN-138` · layer ui · coverage partial · typed: “journey: Create an RFQ with 2 line items, Bolt quantity 100 and Nut quantity 200, invite the vendor and publish it. As the vendor open the event, check Bolt 100 and Nut 200 are shown, and place a bid ”

### GEN-SCR-453 — Create Sourcing Event opens the sourcing event creation flow

- **Why it matters.** Confirms that the main event-creation button opens the correct flow. Written from the purchase-orders-qc screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mw0d8e0e-look0/02-inventory-purchase-orders-qc.png. **Draft, needs review** — written by the assistant on 2026-11-03 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Module / scenario.** Screen — purchase-orders-qc — button
- **Who.** Buyer · Buyer portal
- **Setup.** The buyer is on the purchase-orders-qc home screen.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Click "Create Sourcing Event"
- **Expected.** The sourcing event creation screen opens. Record the page title, visible event setup fields, and any prefilled values.
- **Oracle.** What the tester sees on the purchase-orders-qc screen.
- **Trace.** High · Positive · draft · `GEN-SCR-453` · layer ui · coverage full · typed: “screen purchase-orders-qc (/home)”

### GEN-SCR-454 — New chat opens a blank chat

- **Why it matters.** Confirms that a buyer can start a new assistant conversation from the home screen. Written from the purchase-orders-qc screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mw0d8e0e-look0/02-inventory-purchase-orders-qc.png. **Draft, needs review** — written by the assistant on 2026-11-03 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Buyer-side login is not represented by a catalog step.; No previous chat messages shown: the catalog has no generic assertion for an empty chat-message history..
- **Module / scenario.** Screen — purchase-orders-qc — button
- **Who.** Buyer · Buyer portal
- **Setup.** The buyer is on the purchase-orders-qc home screen.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Click "New chat"
- **Expected.** A new blank chat opens. "Ask anything..." is visible and ready for a new question, with no previous chat messages shown.
- **Oracle.** What the tester sees on the purchase-orders-qc screen.
- **Trace.** Medium · Positive · draft · `GEN-SCR-454` · layer ui · coverage partial · typed: “screen purchase-orders-qc (/home)”

### GEN-SCR-455 — Search chats filters the chat list

- **Why it matters.** Confirms that the chat search field can find a visible existing chat. Written from the purchase-orders-qc screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mw0d8e0e-look0/02-inventory-purchase-orders-qc.png. **Draft, needs review** — written by the assistant on 2026-11-03 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Cannot assert that every nonmatching chat is hidden or, alternatively, ranked below the matching chat.; Cannot conditionally record a separate outcome only if filtering fails; the plan captures the result screen regardless..
- **Module / scenario.** Screen — purchase-orders-qc — positive
- **Who.** Buyer · Buyer portal
- **Setup.** The buyer is on the purchase-orders-qc home screen and the chat list contains "PR-1205 Technical RFQ".
- **Test data.** PR-1205
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Click the "Search chats" field 3. Type "PR-1205" into "Search chats"
- **Expected.** "PR-1205 Technical RFQ" remains visible as a matching chat, and chats that do not match "PR-1205" are hidden or ranked below it. Record what happens if the list does not filter.
- **Oracle.** What the tester sees on the purchase-orders-qc screen.
- **Trace.** Medium · Positive · draft · `GEN-SCR-455` · layer ui · coverage partial · typed: “screen purchase-orders-qc (/home)”

### GEN-JRN-139 — Publish refuses an event without a title

- **Why it matters.** A senior tester's addition to the journey "create an rfq event with 3 line items and publish it", grounded in rule R-6. **Draft, needs review** — written by the assistant on 2026-11-03 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — create an rfq event with 3 line items and publish it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A new eRFX project has the RFQ stage, a selected template, three line items with completed pricing, a saved schedule, and the suggested vendors invited. The event title is blank.
- **Test data.** Line items: QA Product 1 quantity 1, QA Product 2 quantity 1, QA Product 3 quantity 1; valid prices and delivery details; title: blank
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the eRFX create screen 3. Leave the field "Enter the title of this event" blank 4. Set the stage to "RFQ" 5. Choose a template 6. Open "Items" and add three line items 7. Fill the pricing sheet for all three line items 8. Open the schedule drawer and click "Save schedule" 9. Open "Participants" and click "Invite Vendor" to invite the suggested vendors 10. Click "Publish"
- **Expected.** The event is not published. The title field is marked as invalid or the application shows a title validation message. Record the exact message and the event status shown on screen.
- **Oracle.** The event is not published. The title field is marked as invalid or the application shows a title validation message. Record the exact message and the event status shown on screen.
- **Trace.** Critical · Negative · draft · `GEN-JRN-139` · layer ui · coverage none · typed: “journey: create an rfq event with 3 line items and publish it”

### GEN-JRN-140 — Publish refuses a line item with a missing required pricing value

- **Why it matters.** A senior tester's addition to the journey "create an rfq event with 3 line items and publish it", grounded in rule R-11. **Draft, needs review** — written by the assistant on 2026-11-03 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — create an rfq event with 3 line items and publish it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A new RFQ project has a title, three line items, a saved schedule, and the suggested vendors invited. One required pricing cell for the third line item is empty.
- **Test data.** Title: QA three-item RFQ; QA Product 1 quantity 2 and price 90; QA Product 2 quantity 3 and price 100; QA Product 3 quantity 1 and price blank
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the eRFX create screen 3. Type "QA three-item RFQ" in "Enter the title of this event" 4. Set the stage to "RFQ" 5. Choose a template 6. Open "Items" and add three line items 7. Enter quantity 2 and price 90 for "QA Product 1" 8. Enter quantity 3 and price 100 for "QA Product 2" 9. Enter quantity 1 for "QA Product 3" and leave its required price cell blank 10. Open the schedule drawer and click "Save schedule" 11. Open "Participants" and click "Invite Vendor" to invite the suggested vendors 12. Click "Publish"
- **Expected.** The event is not published. The empty required pricing cell or its line item is marked as invalid, and the application shows its validation message. Record the exact message if no message is shown.
- **Oracle.** The event is not published. The empty required pricing cell or its line item is marked as invalid, and the application shows its validation message. Record the exact message if no message is shown.
- **Trace.** High · Negative · draft · `GEN-JRN-140` · layer ui · coverage none · typed: “journey: create an rfq event with 3 line items and publish it”

### GEN-JRN-141 — Publish is blocked until the stage has been reviewed

- **Why it matters.** A senior tester's addition to the journey "create an rfq event with 3 line items and publish it", grounded in rule R-5. **Draft, needs review** — written by the assistant on 2026-11-03 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — create an rfq event with 3 line items and publish it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A new RFQ project has a title, three completely priced line items, a saved schedule, and the suggested vendors invited. The RFQ stage tab has not been opened before publishing.
- **Test data.** Title: QA review-gate RFQ; three line items with quantities 1, 1, 1 and prices 90, 100, 110
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the eRFX create screen 3. Type "QA review-gate RFQ" in "Enter the title of this event" 4. Set the stage to "RFQ" 5. Choose a template 6. Open "Items" and add three line items 7. Fill every required pricing cell 8. Open the schedule drawer and click "Save schedule" 9. Open "Participants" and click "Invite Vendor" to invite the suggested vendors 10. Do not open the "RFQ" stage tab 11. Click "Publish"
- **Expected.** The publish confirmation modal opens, but its "OK" button is disabled. The modal shows "Please review all stages before publishing." The event does not show a published status.
- **Oracle.** The publish confirmation modal opens, but its "OK" button is disabled. The modal shows "Please review all stages before publishing." The event does not show a published status.
- **Trace.** Critical · Negative · draft · `GEN-JRN-141` · layer ui · coverage none · typed: “journey: create an rfq event with 3 line items and publish it”

### GEN-JRN-142 — Cancel keeps the completed RFQ in its editable state

- **Why it matters.** A senior tester's addition to the journey "create an rfq event with 3 line items and publish it", grounded in rule R-5. **Draft, needs review** — written by the assistant on 2026-11-03 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — create an rfq event with 3 line items and publish it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A new RFQ project has a title, three completely priced line items, a saved schedule, and the suggested vendors invited. All stage tabs have been opened and reviewed.
- **Test data.** Title: QA cancelled-publish RFQ; three line items with quantities 2, 3, 1 and prices 90, 100, 110
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the eRFX create screen 3. Type "QA cancelled-publish RFQ" in "Enter the title of this event" 4. Set the stage to "RFQ" 5. Choose a template 6. Open "Items" and add three line items 7. Fill every required pricing cell 8. Open the schedule drawer and click "Save schedule" 9. Open "Participants" and click "Invite Vendor" to invite the suggested vendors 10. Open the "RFQ" stage tab 11. Click "Publish" 12. Click "Cancel" in the publish confirmation modal
- **Expected.** The confirmation modal closes. The project remains on the create screen with its title, three line items, saved schedule, and invited participants unchanged. The event does not have a published status.
- **Oracle.** The confirmation modal closes. The project remains on the create screen with its title, three line items, saved schedule, and invited participants unchanged. The event does not have a published status.
- **Trace.** High · Negative · draft · `GEN-JRN-142` · layer ui · coverage none · typed: “journey: create an rfq event with 3 line items and publish it”

### GEN-JRN-143 — Save as draft preserves all three line items after reopening

- **Why it matters.** A senior tester's addition to the journey "create an rfq event with 3 line items and publish it", grounded in rule R-9. **Draft, needs review** — written by the assistant on 2026-11-03 from a request typed in the chat box; the automation covers part of it — not yet: see the gaps.
- **Module / scenario.** Journey — create an rfq event with 3 line items and publish it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A new RFQ project is filled with a title, three line items, pricing, and a saved schedule. The suggested vendors have not yet been invited.
- **Configs needed.** allow_draft_project_creation = On — shows the "Save as draft" option for eligible projects
- **Test data.** Title: QA draft RFQ; QA Product 1 quantity 0.01 and price 0.01; QA Product 2 quantity 1 and price 999999.99; QA Product 3 quantity 10 and price 90
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the eRFX create screen 3. Type "QA draft RFQ" in "Enter the title of this event" 4. Set the stage to "RFQ" 5. Choose a template 6. Open "Items" and add three line items 7. Enter the quantities and prices from the test data 8. Open the schedule drawer and click "Save schedule" 9. Click "Save as draft" 10. Open the saved draft again from the drafts list
- **Expected.** The project opens with a draft status. The title is "QA draft RFQ", the item count is 3, and the quantities and prices remain 0.01 × 0.01, 1 × 999999.99, and 10 × 90. The project has not been published and no participant invitation is required to save the draft.
- **Oracle.** The project opens with a draft status. The title is "QA draft RFQ", the item count is 3, and the quantities and prices remain 0.01 × 0.01, 1 × 999999.99, and 10 × 90. The project has not been published and no participant invitation is required to save the draft.
- **Trace.** High · Positive · draft · `GEN-JRN-143` · layer ui · coverage partial · typed: “journey: create an rfq event with 3 line items and publish it”

### GEN-JRN-144 — Save as draft is unavailable when draft creation is switched off

- **Why it matters.** A senior tester's addition to the journey "create an rfq event with 3 line items and publish it", grounded in rule R-9. **Draft, needs review** — written by the assistant on 2026-11-03 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — create an rfq event with 3 line items and publish it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A new RFQ project is open with a title, three line items, completed pricing, and a saved schedule.
- **Configs needed.** allow_draft_project_creation = Off — hides the "Save as draft" option for eligible projects
- **Test data.** Title: QA no-draft RFQ; three line items with quantities 1, 1, 1 and prices 90, 100, 110
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the eRFX create screen 3. Type "QA no-draft RFQ" in "Enter the title of this event" 4. Set the stage to "RFQ" 5. Choose a template 6. Open "Items" and add three line items 7. Fill every required pricing cell 8. Open the schedule drawer and click "Save schedule"
- **Expected.** The "Save as draft" button is not shown on the project header. The project cannot be saved as a draft from this screen.
- **Oracle.** The "Save as draft" button is not shown on the project header. The project cannot be saved as a draft from this screen.
- **Trace.** High · Negative · draft · `GEN-JRN-144` · layer ui · coverage none · typed: “journey: create an rfq event with 3 line items and publish it”

### GEN-JRN-145 — An invalid delivery location blocks the third line item

- **Why it matters.** A senior tester's addition to the journey "create an rfq event with 3 line items and publish it", grounded in rule R-8. **Draft, needs review** — written by the assistant on 2026-11-03 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — create an rfq event with 3 line items and publish it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A new RFQ project has a title, three line items, and valid quantities and prices. The third line item uses a delivery location that does not exist or is inactive.
- **Test data.** Title: QA delivery-location RFQ; QA Product 1 quantity 1 and price 90 at an active delivery location; QA Product 2 quantity 1 and price 100 at an active delivery location; QA Product 3 quantity 1 and price 110 at delivery location "QA Inactive Delivery Location"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the eRFX create screen 3. Type "QA delivery-location RFQ" in "Enter the title of this event" 4. Set the stage to "RFQ" 5. Choose a template 6. Open "Items" and add three line items 7. Enter the quantities, prices, and delivery locations from the test data 8. Open the schedule drawer and click "Save schedule"
- **Expected.** The third line item is rejected or marked invalid with error code 125 and the message "Delivery location not found / inactive". The project cannot proceed with that line item until an active delivery location is selected.
- **Oracle.** The third line item is rejected or marked invalid with error code 125 and the message "Delivery location not found / inactive". The project cannot proceed with that line item until an active delivery location is selected.
- **Trace.** High · Negative · draft · `GEN-JRN-145` · layer ui · coverage none · typed: “journey: create an rfq event with 3 line items and publish it”

### GEN-JRN-146 — The smallest supported-looking quantity and price remain visible without rounding

- **Why it matters.** A senior tester's addition to the journey "create an rfq event with 3 line items and publish it". **Draft, needs review** — written by the assistant on 2026-11-03 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — create an rfq event with 3 line items and publish it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A new RFQ project has a title, three line items, a selected template, a saved schedule, and the suggested vendors invited. Two lines use boundary numeric values.
- **Test data.** Title: QA numeric-boundary RFQ; QA Product 1 quantity 0.01 and price 0.01; QA Product 2 quantity 1 and price 999999.99; QA Product 3 quantity 2.5 and price 90
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the eRFX create screen 3. Type "QA numeric-boundary RFQ" in "Enter the title of this event" 4. Set the stage to "RFQ" 5. Choose a template 6. Open "Items" and add three line items 7. Enter the quantities and prices from the test data 8. Open the schedule drawer and click "Save schedule" 9. Open "Participants" and click "Invite Vendor" to invite the suggested vendors 10. Open the "RFQ" stage tab 11. Click "Publish"
- **Expected.** Record what happens for the values 0.01, 999999.99, and 2.5. If publishing is allowed, the review screen retains the entered values without rounding or changing their decimal places; if the application refuses a value, record the exact field validation message and the value that was rejected.
- **Oracle.** Record what happens for the values 0.01, 999999.99, and 2.5. If publishing is allowed, the review screen retains the entered values without rounding or changing their decimal places; if the application refuses a value, record the exact field validation message and the value that was rejected.
- **Trace.** Medium · Edge · draft · `GEN-JRN-146` · layer ui · coverage none · typed: “journey: create an rfq event with 3 line items and publish it”

