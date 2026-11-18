# Generated test cases — drafts (2026-11-02)

Every case below was written by the spine.ai assistant when someone typed a test case that no existing case covered.
They are DRAFTS: nothing here is in the catalog until a person reviews it and moves it into a catalog file
(the importer does not read `generated-*.md`, and `GEN-` ids are not parsed).

## 1. Drafts from the assistant

### GEN-SCR-424 — RFP opens the RFP event creation flow

- **Why it matters.** Confirms that the event type control opens the RFP creation flow. Written from the create-single-stage screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/02-inventory-create-single-stage.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Module / scenario.** Screen — create-single-stage — button
- **Who.** Buyer · Buyer portal
- **Setup.** The create-single-stage screen is open with no event data entered.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Click "RFP"
- **Expected.** The screen changes to the RFP event creation flow. Record the fields and sections shown after selecting "RFP".
- **Oracle.** What the tester sees on the create-single-stage screen.
- **Trace.** High · Positive · draft · `GEN-SCR-424` · layer ui · coverage full · typed: “screen create-single-stage (/orders/quick-create)”

### GEN-SCR-425 — Select Templates opens the template picker

- **Why it matters.** Confirms that a buyer can open the template picker from the single-stage creation screen. Written from the create-single-stage screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/02-inventory-create-single-stage.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The picker’s filter and selection controls cannot be asserted individually by any catalog step; capture_screen can only record them..
- **Module / scenario.** Screen — create-single-stage — button
- **Who.** Buyer · Buyer portal
- **Setup.** The create-single-stage screen is open and the event type is RFP.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Click "Select Templates"
- **Expected.** The template picker opens and shows the available RFP templates. Record the list, filter, and selection controls displayed.
- **Oracle.** What the tester sees on the create-single-stage screen.
- **Trace.** High · Positive · draft · `GEN-SCR-425` · layer ui · coverage partial · typed: “screen create-single-stage (/orders/quick-create)”

### GEN-SCR-426 — Ask Clara starts AI RFP generation when line items exist

- **Why it matters.** The AI RFP flow requires project line items and then requests generated RFP questions. Written from the create-single-stage screen; grounded in R-FCR-042-4 (src/views/eventCreation/components/aiRfpGenerator/api.js:3-11); screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/02-inventory-create-single-stage.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Module / scenario.** Screen — create-single-stage — button
- **Who.** Buyer · Buyer portal
- **Setup.** The create-single-stage screen is open with at least one project line item already added.
- **Test data.** One line item with product QA_Test_Product and quantity 1
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Click "Ask Clara"
- **Expected.** The AI RFP generation flow opens or starts loading questions for the project. Record the questions, loading state, or message shown after "Ask Clara" is clicked.
- **Oracle.** The screen behaves as R-FCR-042-4 says: AI RFP → `POST /ask_ai_chats/rfp_questions`, then `GET /external_requests/:uuid`; the AI button needs project line items — src/views/eventCreation/components/aiRfpGenerator/api.js:3-11, src/views/even
- **Trace.** High · Positive · draft · `GEN-SCR-426` · layer ui · coverage full · typed: “screen create-single-stage (/orders/quick-create)”

### GEN-SCR-427 — Terms & Conditions is disabled on the initial screen

- **Why it matters.** Confirms the disabled state shown for the Terms & Conditions control. Written from the create-single-stage screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/02-inventory-create-single-stage.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Module / scenario.** Screen — create-single-stage — state
- **Who.** Buyer · Buyer portal
- **Setup.** The create-single-stage screen is open in its initial state.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Click "Terms & Conditions"
- **Expected.** Nothing opens and no terms editor is displayed because "Terms & Conditions" is disabled. The control remains visibly disabled.
- **Oracle.** What the tester sees on the create-single-stage screen.
- **Trace.** Medium · Negative · draft · `GEN-SCR-427` · layer ui · coverage full · typed: “screen create-single-stage (/orders/quick-create)”

### GEN-SCR-428 — The event schedule control is disabled on the initial screen

- **Why it matters.** Confirms the disabled schedule control shown on the screen. Written from the create-single-stage screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/02-inventory-create-single-stage.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Module / scenario.** Screen — create-single-stage — state
- **Who.** Buyer · Buyer portal
- **Setup.** The create-single-stage screen is open in its initial state.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Click "Now - 04:46 pm, 2nd Nov ( 30 Mins )"
- **Expected.** No schedule popover or drawer opens because "Now - 04:46 pm, 2nd Nov ( 30 Mins )" is disabled. The displayed schedule value remains unchanged.
- **Oracle.** What the tester sees on the create-single-stage screen.
- **Trace.** High · Negative · draft · `GEN-SCR-428` · layer ui · coverage full · typed: “screen create-single-stage (/orders/quick-create)”

### GEN-SCR-429 — Publish Event is disabled until the event setup is complete

- **Why it matters.** Confirms the initial disabled publish state and verifies that entering an event title alone does not publish the event. Written from the create-single-stage screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/02-inventory-create-single-stage.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Module / scenario.** Screen — create-single-stage — state
- **Who.** Buyer · Buyer portal
- **Setup.** The create-single-stage screen is open in its initial state with no participants, template, or completed event setup.
- **Test data.** Quarterly QA office supplies sourcing event
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Click "Enter the title of this event" 3. Type "Quarterly QA office supplies sourcing event" 4. Click "Publish Event"
- **Expected.** The event is not published. "Publish Event" remains disabled and no success message or event confirmation appears.
- **Oracle.** What the tester sees on the create-single-stage screen.
- **Trace.** Critical · Negative · draft · `GEN-SCR-429` · layer ui · coverage full · typed: “screen create-single-stage (/orders/quick-create)”

### GEN-SCR-430 — An empty event title is marked as invalid

- **Why it matters.** The event title is validated on the quick-create screen and receives an error outline when empty. Written from the single-stage-configured-auction screen; grounded in R-FCR-025-1 (src/views/eventCreation/eventCreation.jsx:1741-1761); screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/04-inventory-single-stage-configured-auction.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The title field has a red outline..
- **Module / scenario.** Screen — single-stage-configured-auction — negative
- **Who.** Buyer · Buyer portal
- **Setup.** A new single-stage auction on the quick-create screen with no title entered.
- **Test data.** Event title: -
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the single-stage auction quick-create screen 3. Click "Enter the title of this event" 4. Leave "Enter the title of this event" empty 5. Click "Rank on lot"
- **Expected.** "Enter the title of this event" has a red outline. No title text is shown in the field.
- **Oracle.** The screen behaves as R-FCR-025-1 says: Event title input (placeholder "Enter the title of this event") only when not projectCreation; red outline on `errors.title` — src/views/eventCreation/eventCreation.jsx:1741-1761, src/translations/en.
- **Trace.** High · Negative · draft · `GEN-SCR-430` · layer ui · coverage partial · typed: “screen single-stage-configured-auction (/orders/quick-create)”

### GEN-SCR-431 — Publish Event is disabled when the stage has no template

- **Why it matters.** A non-RFP stage without a selected template must remain unavailable for publishing and show the template requirement. Written from the single-stage-configured-auction screen; grounded in R-FCR-016-2 (src/views/projectCreation/projectCreation.jsx:1457-1481); screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/04-inventory-single-stage-configured-auction.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: expected message "Please select template for Auction" is neither a known product message nor quoted by the case.
- **Module / scenario.** Screen — single-stage-configured-auction — state
- **Who.** Buyer · Buyer portal
- **Setup.** A new single-stage auction with a valid event title, no selected template, and no other event data entered.
- **Test data.** Event title: QA template requirement auction
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the single-stage auction quick-create screen 3. Click "Enter the title of this event" 4. Type "QA template requirement auction" in "Enter the title of this event" 5. Move the mouse over "Publish Event"
- **Expected.** "Publish Event" is disabled and the tooltip says "Please select template for <stage title>".
- **Oracle.** The screen behaves as R-FCR-016-2 says: Disabled with tooltip "Please select template for <stage title>" for any non-RFP stage without a template, or "Please add line items" — src/views/projectCreation/projectCreation.jsx:1457-1481
- **Trace.** Critical · Negative · draft · `GEN-SCR-431` · layer ui · coverage partial · typed: “screen single-stage-configured-auction (/orders/quick-create)”

### GEN-SCR-432 — Participants opens the participant selection view

- **Why it matters.** The screen provides Participants as the entry point for adding vendors to the event. Written from the single-stage-configured-auction screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/04-inventory-single-stage-configured-auction.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Module / scenario.** Screen — single-stage-configured-auction — button
- **Who.** Buyer · Buyer portal
- **Setup.** A new single-stage auction on the quick-create screen.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the single-stage auction quick-create screen 3. Click "Participants"
- **Expected.** The participant-selection view opens and shows the event's vendor selection area.
- **Oracle.** What the tester sees on the single-stage-configured-auction screen.
- **Trace.** High · Positive · draft · `GEN-SCR-432` · layer ui · coverage full · typed: “screen single-stage-configured-auction (/orders/quick-create)”

### GEN-SCR-433 — Ask Clara opens the Clara panel

- **Why it matters.** Ask Clara is the screen control for opening the Clara assistance panel. Written from the single-stage-configured-auction screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/04-inventory-single-stage-configured-auction.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Module / scenario.** Screen — single-stage-configured-auction — button
- **Who.** Buyer · Buyer portal
- **Setup.** A new single-stage auction on the quick-create screen.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the single-stage auction quick-create screen 3. Click "Ask Clara"
- **Expected.** A Clara assistance panel opens on the screen. The single-stage auction details remain available behind or beside the panel.
- **Oracle.** What the tester sees on the single-stage-configured-auction screen.
- **Trace.** Medium · Positive · draft · `GEN-SCR-433` · layer ui · coverage full · typed: “screen single-stage-configured-auction (/orders/quick-create)”

### GEN-SCR-434 — Unavailable event controls are disabled before event setup is complete

- **Why it matters.** The screen shows these controls disabled before the required template, participant, and event configuration data has been added. Written from the single-stage-configured-auction screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/04-inventory-single-stage-configured-auction.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Module / scenario.** Screen — single-stage-configured-auction — state
- **Who.** Buyer · Buyer portal
- **Setup.** A new single-stage auction immediately after opening the quick-create screen, before adding a title, template, or participants.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the single-stage auction quick-create screen 3. Move the mouse over "Savings" 4. Move the mouse over "Terms & Conditions" 5. Move the mouse over "Now - 04:46 pm, 2nd Nov ( 30 Mins )" 6. Move the mouse over "Publish Event" 7. Move the mouse over "Search vendors you want to add"
- **Expected.** "Savings", "Terms & Conditions", "Now - 04:46 pm, 2nd Nov ( 30 Mins )", "Publish Event", and "Search vendors you want to add" are greyed out and cannot be activated. Record any tooltip shown for each disabled control.
- **Oracle.** What the tester sees on the single-stage-configured-auction screen.
- **Trace.** Medium · Negative · draft · `GEN-SCR-434` · layer ui · coverage full · typed: “screen single-stage-configured-auction (/orders/quick-create)”

### GEN-SCR-435 — Required event fields accept valid values

- **Why it matters.** Checks the required markers and that the required pricing-sheet fields can be completed with valid values. Written from the single-stage-sheet screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/09-inventory-single-stage-sheet.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Assert that the six required columns are visibly marked as required.; Select QA Copper Wire through the Product picker rather than typing directly into the Product cell..
- **Module / scenario.** Screen — single-stage-sheet — positive
- **Who.** Buyer · Buyer portal
- **Setup.** A new quick-create event with no existing event data.
- **Test data.** Title: QA Copper Wire RFQ; Product: QA Copper Wire; Product Variant: Standard; Quantity Requested: 10; Delivery location: QA Warehouse; Price: 90; Quantity Available: 10; Total Amount: 900
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the quick-create event screen 3. Type "QA Copper Wire RFQ" in "Enter the title of this event" 4. Enter "QA Copper Wire" in "Product" 5. Enter "Standard" in "Product Variant" 6. Enter "10" in "Quantity Requested" 7. Enter "QA Warehouse" in "Delivery location" 8. Enter "90" in "Price" 9. Enter "10" in "Quantity Available" 10. Review "Total Amount"
- **Expected.** The six required columns are marked as required on the screen. The entered values remain visible, and "Total Amount" shows 900 for the 10 × 90 line.
- **Oracle.** What the tester sees on the single-stage-sheet screen.
- **Trace.** High · Positive · draft · `GEN-SCR-435` · layer ui · coverage partial · typed: “screen single-stage-sheet (/orders/quick-create)”

### GEN-SCR-436 — Publish Event refuses an event with no participants

- **Why it matters.** Checks the exact refusal shown when the buyer tries to proceed without adding a participant. Written from the single-stage-sheet screen; grounded in R-FCR-017-1 (src/views/projectCreation/projectCreation.jsx:1604-1609); screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/09-inventory-single-stage-sheet.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Select the Product value "QA Copper Wire" using a product-selection flow; no catalog product-selection step is available.; Select the Product Variant value "Standard" using a product-selection flow; no catalog product-selection step is available..
- **Module / scenario.** Screen — single-stage-sheet — negative
- **Who.** Buyer · Buyer portal
- **Setup.** A new quick-create event with a valid title and all required line-item values entered, with no vendors added.
- **Test data.** Title: QA No Participant Event; Product: QA Copper Wire; Product Variant: Standard; Quantity Requested: 10; Delivery location: QA Warehouse; Price: 90; Quantity Available: 10; Total Amount: 900
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the quick-create event screen 3. Type "QA No Participant Event" in "Enter the title of this event" 4. Enter "QA Copper Wire" in "Product" 5. Enter "Standard" in "Product Variant" 6. Enter "10" in "Quantity Requested" 7. Enter "QA Warehouse" in "Delivery location" 8. Enter "90" in "Price" 9. Enter "10" in "Quantity Available" 10. Click "Publish Event"
- **Expected.** The event is not published. The message "Please add participants to proceed!" is shown.
- **Oracle.** The screen behaves as R-FCR-017-1 says: No participant in the project → "Please add participants to proceed!" (stops) — src/views/projectCreation/projectCreation.jsx:1604-1609
- **Trace.** Critical · Negative · draft · `GEN-SCR-436` · layer ui · coverage partial · typed: “screen single-stage-sheet (/orders/quick-create)”

### GEN-SCR-437 — Publish Event opens the publish confirmation

- **Why it matters.** Checks the confirmation shown before a normal event is published and the available confirmation actions. Written from the single-stage-sheet screen; grounded in R-FCR-020-2 (src/views/eventCreation/components/footer/confirmModal.jsx:52-60); screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/09-inventory-single-stage-sheet.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Enter or select "QA Copper Wire" in the Product column; the catalog has no product-selection step..
- **Module / scenario.** Screen — single-stage-sheet — button
- **Who.** Buyer · Buyer portal
- **Setup.** A valid new event with one participant, all required line-item values entered, and a normal publish flow rather than send-to-draft flow.
- **Test data.** Title: QA Publish Confirmation Event; Product: QA Copper Wire; Product Variant: Standard; Quantity Requested: 10; Delivery location: QA Warehouse; Price: 90; Quantity Available: 10; Total Amount: 900; Vendor: QA_Platform Vendor A
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the quick-create event screen 3. Type "QA Publish Confirmation Event" in "Enter the title of this event" 4. Enter "QA Copper Wire" in "Product" 5. Enter "Standard" in "Product Variant" 6. Enter "10" in "Quantity Requested" 7. Enter "QA Warehouse" in "Delivery location" 8. Enter "90" in "Price" 9. Enter "10" in "Quantity Available" 10. Click "Invite Vendor" 11. Search for "QA_Platform Vendor A" in "Search vendors you want to add" 12. Select "QA_Platform Vendor A" 13. Click "Publish Event"
- **Expected.** A publish confirmation opens. The confirmation shows "Publish Event" as its title, an OK action labelled "Publish", and a cancel action labelled "Edit Schedule". Selecting "Edit Schedule" would open the schedule drawer; do not confirm publishing.
- **Oracle.** The screen behaves as R-FCR-020-2 says: Title: "Send to Auction Team" / project title truncated to 45 / "Publish Event"; OK text "Send to Auction Team" or "Publish"; Cancel is "Edit Schedule" and opens the schedule drawer — src/views/eventC
- **Trace.** Critical · Positive · draft · `GEN-SCR-437` · layer ui · coverage partial · typed: “screen single-stage-sheet (/orders/quick-create)”

### GEN-SCR-438 — The event duration menu shows the predefined durations

- **Why it matters.** Checks that the duration menu uses the expected default predefined duration choices. Written from the single-stage-sheet screen; grounded in R-FCR-022-5 (src/views/projectCreation/components/projectScheduler/constants.js:1-1); screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/09-inventory-single-stage-sheet.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Module / scenario.** Screen — single-stage-sheet — state
- **Who.** Buyer · Buyer portal
- **Setup.** A new quick-create event using the default event schedule.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the quick-create event screen 3. Click "Now - 04:46 pm, 2nd Nov ( 30 Mins )"
- **Expected.** The duration menu opens and shows the predefined choices for 30 minutes, 1 hour, 4 hours, and 24 hours. The current selection is 30 minutes.
- **Oracle.** The screen behaves as R-FCR-022-5 says: Duration menu = template `event_duration_predefined_values[mode].event_duration` or default 30 min, 1 h, 4 h, 24 h; switching to "Fixed time" presets now + 30 min — stageSchedulerCard.jsx:68-71, 213-2
- **Trace.** Medium · Positive · draft · `GEN-SCR-438` · layer ui · coverage full · typed: “screen single-stage-sheet (/orders/quick-create)”

### GEN-SCR-439 — A blacklisted vendor is disabled in vendor search

- **Why it matters.** Checks that a blacklisted vendor cannot be selected from the vendor search results. Written from the single-stage-sheet screen; grounded in R-FCR-035-3 (src/views/projectCreation/projectCreation.jsx:255-256); screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/09-inventory-single-stage-sheet.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Module / scenario.** Screen — single-stage-sheet — state
- **Who.** Buyer · Buyer portal
- **Setup.** Vendor A is blacklisted for the buyer company, and a new quick-create event is open.
- **Test data.** Vendor search: QA_Platform Vendor A
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the quick-create event screen 3. Click "Invite Vendor" 4. Search for "QA_Platform Vendor A" in "Search vendors you want to add"
- **Expected.** The search result for QA_Platform Vendor A is disabled and displays the status "Blocked". The vendor cannot be selected.
- **Oracle.** The screen behaves as R-FCR-035-3 says: In search results blacklisted vendors are disabled with "Blocked"; TNA vendors are disabled with "TNA" unless the URL has `allowTnaVendorsToBid=true` (so on a fresh create every TNA vendor is unselect
- **Trace.** High · Negative · draft · `GEN-SCR-439` · layer ui · coverage full · typed: “screen single-stage-sheet (/orders/quick-create)”

### GEN-SCR-440 — Published Stages shows the correct columns and participant counts

- **Why it matters.** The published-stages table must show the defined columns, participant counts, and date values. Written from the auction-live screen; grounded in R-FLA-026-1 (src/views/projectDetails/components/publishedStagesTable.jsx:31-99); screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/14-inventory-auction-live.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Verify that the first stage specifically has Participants value 2/3.; Verify that the stage with missing participant counts specifically has 0/0.; Verify that both Bidding Starts At and Bidding Ends At columns individually show '-' for the stage with missing dates.; unconfirmed label "-" (expect_text) — not among the labels known from the app nor in the case.
- **Module / scenario.** Screen — auction-live — state
- **Who.** Buyer · Buyer portal
- **Setup.** A project with two published stages. One stage has ref_id, one stage has no ref_id. The first stage has 2 active participants out of 3, and the second stage has no participant counts or bidding dates.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the project details page for the project 3. Click "Published Stages" 4. Review the table headers "Stage Code", "Stage Title", "Pending Actions", "Participants", "Bidding Starts At", and "Bidding Ends At" 5. Review the values in the "Participants", "Bidding Starts At", and "Bidding Ends At" columns
- **Expected.** The table shows "Stage Code" because at least one row has ref_id. The "Participants" value for the first stage is "2/3". The stage with missing participant counts shows "0/0". A stage with missing bidding dates shows "-" in both date columns. The other listed columns are visible.
- **Oracle.** The screen behaves as R-FLA-026-1 says: Columns: Stage Code (dropped when no row has `ref_id`), Stage Title, Pending Actions, Participants "active/total" (missing → 0), Bidding Starts At / Ends At (DATE_TIME or "-") — src/views/projectDetai
- **Trace.** High · Positive · draft · `GEN-SCR-440` · layer ui · coverage partial · typed: “screen auction-live (/project/UWtRY1Fn/details)”

### GEN-SCR-441 — Line Items and Participants show their response counts

- **Why it matters.** The panel headers must display count tags calculated from line-item and participant responses. Written from the auction-live screen; grounded in R-FLA-018-4 (src/views/projectDetails/projectDetails.jsx:916-946); screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/14-inventory-auction-live.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Module / scenario.** Screen — auction-live — state
- **Who.** Buyer · Buyer portal
- **Setup.** A project with 1 line-item response and 3 participant responses.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the project details page for the project 3. Review the "Line Items 1" header 4. Review the "Participants 3" header
- **Expected.** The line-item panel header shows the count tag "1" next to "Line Items". The participant panel header shows the count tag "3" next to "Participants".
- **Oracle.** The screen behaves as R-FLA-018-4 says: Line Items / Participants panel headers show count tags from the line-item and participant responses — src/views/projectDetails/projectDetails.jsx:916-946, src/redux/project/selectors.js:867-876
- **Trace.** High · Positive · draft · `GEN-SCR-441` · layer ui · coverage full · typed: “screen auction-live (/project/UWtRY1Fn/details)”

### GEN-SCR-442 — Overview shows the project identifier and open-tender value when enabled

- **Why it matters.** The Overview panel must show the project reference and the open-tender value when the company setting is enabled. Written from the auction-live screen; grounded in R-FLA-018-1 (src/views/projectDetails/projectDetails.jsx:545-564); screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/14-inventory-auction-live.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — The Overview panel shows Project ID as #77803308; The Overview panel shows the project's Created at date and time; The Overview panel shows Open Tender Event: Yes.
- **Module / scenario.** Screen — auction-live — state
- **Who.** Buyer · Buyer portal
- **Setup.** A project with refId 77803308 and a recorded creation date.
- **Configs needed.** is_show_under_open_events = On — shows the project as an open tender event
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the project details page for the project 3. Click "Overview" 4. Review the project information
- **Expected.** The Overview panel shows "Project ID" as "#77803308", shows "Created at" with the project's date and time, and shows "Open Tender Event: Yes".
- **Oracle.** The screen behaves as R-FLA-018-1 says: Overview: "Project ID" = `#<refId>`, "Created at" = DATE_TIME, "Open Tender Event: Yes" only when config `is_show_under_open_events` — src/views/projectDetails/projectDetails.jsx:545-564
- **Trace.** High · Positive · draft · `GEN-SCR-442` · layer ui · coverage none · typed: “screen auction-live (/project/UWtRY1Fn/details)”

### GEN-SCR-443 — Overview does not show Open Tender Event as Yes when the setting is disabled

- **Why it matters.** The open-tender value must only be shown when the company setting is enabled. Written from the auction-live screen; grounded in R-FLA-018-1 (src/views/projectDetails/projectDetails.jsx:545-564); screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/14-inventory-auction-live.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Assert that the Overview panel shows Project ID #77803308.; Assert that the Overview panel shows the project's Created at date and time.; Assert that Open Tender Event: Yes is absent when the setting is disabled..
- **Module / scenario.** Screen — auction-live — negative
- **Who.** Buyer · Buyer portal
- **Setup.** A project with refId 77803308 and a recorded creation date.
- **Configs needed.** is_show_under_open_events = Off — does not show the project as an open tender event
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the project details page for the project 3. Click "Overview" 4. Review the project information
- **Expected.** The Overview panel shows "Project ID" as "#77803308" and shows "Created at" with the project's date and time. "Open Tender Event: Yes" is not shown.
- **Oracle.** The screen behaves as R-FLA-018-1 says: Overview: "Project ID" = `#<refId>`, "Created at" = DATE_TIME, "Open Tender Event: Yes" only when config `is_show_under_open_events` — src/views/projectDetails/projectDetails.jsx:545-564
- **Trace.** Medium · Negative · draft · `GEN-SCR-443` · layer ui · coverage none · typed: “screen auction-live (/project/UWtRY1Fn/details)”

### GEN-SCR-444 — Searching participants filters the participant list

- **Why it matters.** Participant search is debounced and must filter the participant table without changing the participant table columns. Written from the auction-live screen; grounded in R-FLA-024-5 (src/views/projectDetails/components/participantsTable.jsx:265-267); screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/14-inventory-auction-live.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: unconfirmed label "QA_Platform_Vendor_A" in an absence check (expect_visible) — a name the product does not use is always absent, so this proves nothing until the label is confirmed; unconfirmed label "QA_Platform_Vendor_C" in an absence check (expect_visible) — a name the product does not use is always absent, so this proves nothing until the label is confirmed.
- **Module / scenario.** Screen — auction-live — positive
- **Who.** Buyer · Buyer portal
- **Setup.** A project with exactly three participants: QA_Platform_Vendor_A, QA_Platform_Vendor_B, and QA_Platform_Vendor_C.
- **Test data.** Search participants: QA_Platform_Vendor_B
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the project details page for the project 3. Click "Participants 3" 4. Click the "Search participants" field 5. Type "QA_Platform_Vendor_B" 6. Wait at least 300 milliseconds
- **Expected.** The participant list shows only QA_Platform_Vendor_B. QA_Platform_Vendor_A and QA_Platform_Vendor_C are not shown. The participant table retains the headers "S No.", "Vendor Name", "Vendor Code", "Location", "Type", "Tags", and "Reason for not participating".
- **Oracle.** The screen behaves as R-FLA-024-5 says: Search debounced 300 ms; page size 20; proposal page reuses this table without the reject option — src/views/projectDetails/components/participantsTable.jsx:265-267, 397, src/views/projectProposal/pro
- **Trace.** High · Positive · draft · `GEN-SCR-444` · layer ui · coverage partial · typed: “screen auction-live (/project/UWtRY1Fn/details)”

### GEN-SCR-445 — Master QCS opens the master quality comparison screen

- **Why it matters.** The Master QCS tab must open the project's master quality comparison screen. Written from the auction-live screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvz4vj1m/14-inventory-auction-live.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The Master QCS tab's visual selected-state styling or selected accessibility attribute.
- **Module / scenario.** Screen — auction-live — button
- **Who.** Buyer · Buyer portal
- **Setup.** A project that has at least one published stage and response data.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the project details page for the project 3. Click the "Master QCS" tab
- **Expected.** The "Master QCS" tab becomes selected and the Master QCS screen opens. The project details content is replaced by the quality comparison content.
- **Oracle.** What the tester sees on the auction-live screen.
- **Trace.** High · Positive · draft · `GEN-SCR-445` · layer ui · coverage partial · typed: “screen auction-live (/project/UWtRY1Fn/details)”

### GEN-SCR-446 — Overview shows the project ID, creation time, and Open Tender Event when the setting is on

- **Why it matters.** Checks the overview values and the configuration-controlled Open Tender Event label. Written from the rfq-live screen; grounded in R-FLA-018-1 (src/views/projectDetails/projectDetails.jsx:545-564); screenshot procol-ui-tests/evidence/walk-convert-mvz52xy5/11-inventory-rfq-live.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Verify that the displayed Created at date and time exactly matches the project's actual created timestamp..
- **Module / scenario.** Screen — rfq-live — state
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with refId UXBaY1Fn and a known created timestamp.
- **Configs needed.** is_show_under_open_events = On — shows the Open Tender Event value in the project overview
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open project "spine-ui-automation-41396480" 3. Click "Project Details" 4. Click "Overview"
- **Expected.** The overview shows Project ID as "#UXBaY1Fn", shows Created at as the project's created date and time, and shows "Open Tender Event: Yes".
- **Oracle.** The screen behaves as R-FLA-018-1 says: Overview: "Project ID" = `#<refId>`, "Created at" = DATE_TIME, "Open Tender Event: Yes" only when config `is_show_under_open_events` — src/views/projectDetails/projectDetails.jsx:545-564
- **Trace.** High · Positive · draft · `GEN-SCR-446` · layer ui · coverage partial · typed: “screen rfq-live (/project/UXBaY1Fn/details)”

### GEN-SCR-447 — Participant search returns matching vendors after the search delay

- **Why it matters.** Checks the participant search delay and the page-size limit. Written from the rfq-live screen; grounded in R-FLA-024-5 (src/views/projectDetails/components/participantsTable.jsx:265-267); screenshot procol-ui-tests/evidence/walk-convert-mvz52xy5/11-inventory-rfq-live.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Wait at least 300 milliseconds before evaluating the result; Assert that no more than 20 participant rows are displayed because the participant-row locator is not specified.
- **Module / scenario.** Screen — rfq-live — boundary
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with more than 20 invited participants, including QA_Platform Vendor A, QA_Platform Vendor B, and QA_Platform Vendor C.
- **Test data.** Search participants = QA_Platform Vendor B
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open project "spine-ui-automation-41396480" 3. Click "Participants 3" 4. Click the "Search participants" field 5. Type "QA_Platform Vendor B" 6. Wait at least 300 milliseconds
- **Expected.** The participants list refreshes after the search delay and shows the matching QA test vendor "QA_Platform Vendor B". No more than 20 participant rows are displayed.
- **Oracle.** The screen behaves as R-FLA-024-5 says: Search debounced 300 ms; page size 20; proposal page reuses this table without the reject option — src/views/projectDetails/components/participantsTable.jsx:265-267, 397, src/views/projectProposal/pro
- **Trace.** Medium · Positive · draft · `GEN-SCR-447` · layer ui · coverage partial · typed: “screen rfq-live (/project/UXBaY1Fn/details)”

### GEN-SCR-448 — Ask Clara starts the awarding flow for an analyze_data todo

- **Why it matters.** Checks the success message and redirect when Clara's analyze_data todo starts awarding. Written from the rfq-live screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/walk-convert-mvz52xy5/11-inventory-rfq-live.png. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact redirect URL returned for the awarding flow cannot be asserted because it is dynamic and no catalog step exposes the returned URL.; The plan cannot independently verify that the Ask Clara action is specifically associated with an analyze_data todo because no catalog step observes or selects todo type..
- **Module / scenario.** Screen — rfq-live — button
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with an available Clara analyze_data todo and a configured redirect URL for the awarding flow.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open project "spine-ui-automation-41396480" 3. Click "Ask Clara"
- **Expected.** The message "Awarding initiated successfully, redirecting to awarding flow..." appears, and the browser navigates to the redirect URL returned for the awarding flow.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** High · Positive · draft · `GEN-SCR-448` · layer ui · coverage partial · typed: “screen rfq-live (/project/UXBaY1Fn/details)”

### GEN-SCR-449 — The project title cannot be changed while converting an RFQ to an auction

- **Why it matters.** A converted project must keep its source project title and prevent editing during project creation. Written from the convert-to-auction screen; grounded in R-FCR-026-6 (src/views/eventCreation/templateSelection.jsx:248-272). **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The field still shows the specific source RFQ title because that title is not provided and no catalog step can infer or compare it..
- **Module / scenario.** Screen — convert-to-auction — state
- **Who.** Buyer · Buyer portal
- **Setup.** An RFQ is being converted to an auction and the source RFQ already has a project title.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the RFQ conversion page 3. Check the "Enter the title of the project" field
- **Expected.** "Enter the title of the project" is disabled and still shows the source RFQ title. The title cannot be changed on the conversion screen.
- **Oracle.** The screen behaves as R-FCR-026-6 says: In project creation `product`, `creator_quantity`, `variant` are locked; PR events also lock READ_ONLY_WIDGETS_IN_PR_TO_AUCTION and `blockEditFromPr` widgets — templateSelection.jsx:248-272
- **Trace.** High · Negative · draft · `GEN-SCR-449` · layer ui · coverage partial · typed: “screen convert-to-auction (/orders/quick-create)”

### GEN-SCR-450 — The auction configuration keeps the default Rank and lot settings

- **Why it matters.** A newly created auction must use the configured auction mode, Rank strategy, lot-based closing and default duration. Written from the convert-to-auction screen; grounded in R-FCR-009-1 (src/views/projectCreation/helpers.js:61-95). **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The displayed auction mode value specifically being "auction" beyond the visible Auction tab selection; The strategy value specifically being "rank" after clicking Rank on lot; Line-item evaluation configuration; Template-based creation configuration; Price traffic configuration; Base-price offers configuration; Single-vendor Dutch closing configuration.
- **Module / scenario.** Screen — convert-to-auction — button
- **Who.** Buyer · Buyer portal
- **Setup.** A converted RFQ is open on the quick-create auction screen with one auction stage and the default auction configuration.
- **Test data.** Auction duration: 30 minutes
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the RFQ conversion page 3. Check that the "Auction" tab is selected 4. Click "Rank on lot" 5. Check the auction configuration shown on screen 6. Check the closing-time control showing "Now - 04:53 pm, 2nd Nov ( 30 Mins )"
- **Expected.** The auction configuration shows mode "auction", type "Rank", strategy "rank", lot-based closing, line-item evaluation, template-based creation, price traffic, base-price offers and single-vendor Dutch closing. The closing-time control shows a 30-minute duration from the current time.
- **Oracle.** The screen behaves as R-FCR-009-1 says: mode `auction`, type `Rank`, strategy `rank`, closingOn `lot_based`, rfpEvaluationOn `line_item_based`, rfpCreationOn `template`, trafficType price, offersOn base price, dutchClosingOn single vendor —
- **Trace.** High · Positive · draft · `GEN-SCR-450` · layer ui · coverage partial · typed: “screen convert-to-auction (/orders/quick-create)”

### GEN-SCR-451 — Publish refuses an auction that has no participants

- **Why it matters.** An event without participants must stop before it is published. Written from the convert-to-auction screen; grounded in R-FCR-017-1 (src/views/projectCreation/projectCreation.jsx:1604-1609). **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Module / scenario.** Screen — convert-to-auction — negative
- **Who.** Buyer · Buyer portal
- **Setup.** A converted RFQ has a valid auction stage and completed line item but no participants.
- **Test data.** Product: QA Stainless Bolt M10
Quantity Requested: 10
Delivery location: QA Warehouse
Price: 100
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the RFQ conversion page with no participants 3. Open the "Auction" tab 4. Click "Publish"
- **Expected.** Publishing stops and the message "Please add participants to proceed!" appears. No auction is created.
- **Oracle.** The screen behaves as R-FCR-017-1 says: No participant in the project → "Please add participants to proceed!" (stops) — src/views/projectCreation/projectCreation.jsx:1604-1609
- **Trace.** Critical · Negative · draft · `GEN-SCR-451` · layer ui · coverage full · typed: “screen convert-to-auction (/orders/quick-create)”

### GEN-SCR-452 — Add Attachments opens the attachment area for the auction

- **Why it matters.** The screen provides an attachment control, so the control must open the attachment area without changing the auction line items. Written from the convert-to-auction screen; grounded in what the screen shows. **Draft, needs review** — written by the assistant on 2026-11-02 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Verify that the attachment flow is specifically prepared for QA_Auction_Specification.pdf; upload fixtures are limited to sample.pdf, sample.png, sample.csv, and sample.txt.; Verify that the existing product, quantity, delivery location, and price values remain unchanged before and after opening the attachment area..
- **Module / scenario.** Screen — convert-to-auction — button
- **Who.** Buyer · Buyer portal
- **Setup.** A converted RFQ is open on the auction quick-create screen with its line item data already populated.
- **Test data.** Attachment: QA_Auction_Specification.pdf
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the RFQ conversion page 3. Click "Add Attachments"
- **Expected.** An attachment area or file-selection flow opens for adding "QA_Auction_Specification.pdf". The existing product, quantity, delivery location and price values remain unchanged.
- **Oracle.** What the tester sees on the convert-to-auction screen.
- **Trace.** Medium · Positive · draft · `GEN-SCR-452` · layer ui · coverage partial · typed: “screen convert-to-auction (/orders/quick-create)”

