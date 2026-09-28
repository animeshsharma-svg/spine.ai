# Product KB test cases — Sourcing › Creating Events

Generated from the Procol Notion Knowledge Base (help-centre articles) — each case is grounded in the article it traces to. Source pages are read-only; re-derive from Notion rather than editing facts here.

## 1. How to create a Single Stage Event (RFP, RFQ, Auction)?

#### PRD-KBSRC-001 — Create and publish a Single Stage RFQ event end to end

- **Why it matters.** Single-stage create → publish is the entry point of the core sourcing path; if it breaks no vendor can bid.
- **Setup.** Buyer / Procurement Manager; at least one product in the catalogue with mapped vendors; a predefined template available.
- **Steps.**
  1. Navigate to the **Events** page from the left navigation panel.
  2. Click the "+ New Event" button.
  3. In the panel that opens, choose "Single Stage".
  4. Click the **Rank on Line** badge and choose **RFQ (Request for Quotation)** in the side drawer; set the Awarding Type (Lot or Line).
  5. Click Select Template and choose a predefined template.
  6. Add products by clicking the cell beneath the "Products" column and selecting from the dropdown.
  7. Fill in all mandatory fields in the template table.
  8. Click the blue "Invite Vendors" in the green tip to add the suggested vendors as participants.
  9. Click the blue "Publish Event" button, review the event details in the pop-up and click the blue "Publish" button.
- **Expected.** The event is published and is now Live; an email notification is sent to all added participants inviting them to participate.
- **Oracle.** "You Have Successfully Published your Event" confirmation; the event shows as live on the Events page; each invited participant receives the invitation email.
- **Trace.** P0 · automate-later · `daa92226c8b282118fe581522bc01e3e` · `how-to-create-a-single-stage-event-rfp-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Single Stage Event (RFP, RFQ, Auction)?

#### PRD-KBSRC-002 — New Single Stage event defaults to Rank on Line and offers three event types

- **Why it matters.** A wrong default event type silently turns an intended RFQ into a reverse auction.
- **Setup.** Buyer / Procurement Manager on the Events page.
- **Steps.**
  1. Click "+ New Event" and choose "Single Stage".
  2. Observe the Event Type on the event setup screen.
  3. Click the **Rank on Line** badge.
- **Expected.** By default the Event Type is **Rank on Line** (a type of Reverse Auction); clicking the badge opens a side drawer with exactly three options: RFP (Request for Proposal), RFQ (Request for Quotation), Reverse Auction.
- **Oracle.** Badge text on the setup screen reads Rank on Line; the side drawer lists the three event types.
- **Trace.** P2 · automate-later · `daa92226c8b282118fe581522bc01e3e` · `how-to-create-a-single-stage-event-rfp-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Single Stage Event (RFP, RFQ, Auction)?

#### PRD-KBSRC-003 — Each event type asks for its own configurations

- **Why it matters.** Awarding type and auction strategy decide how bids are ranked and awarded; missing or extra config fields break the award path.
- **Setup.** Buyer / Procurement Manager on the Single Stage event setup screen with the event-type side drawer open.
- **Steps.**
  1. Select **RFP** and note the configurations shown.
  2. Select **RFQ** and note the configurations shown.
  3. Select **Reverse Auction** and note the configurations shown.
- **Expected.** RFP: no configurations required. RFQ: Awarding Type (Lot or Line) and an optional Delivery Date. Reverse Auction: Auction Strategy (Rank Based, Price Based, Traffic Light, Knockout, Dutch), Awarding Type (Lot or Line), optional Rank Type Configurations and optional Serial Bidding.
- **Oracle.** The configuration fields rendered for each selected event type match the article's table.
- **Trace.** P1 · automate-later · `daa92226c8b282118fe581522bc01e3e` · `how-to-create-a-single-stage-event-rfp-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Single Stage Event (RFP, RFQ, Auction)?

#### PRD-KBSRC-004 — Line items are limited to 65 per event

- **Why it matters.** The article states a hard limit; exceeding it silently could lose line items from the event.
- **Setup.** Buyer / Procurement Manager on the Single Stage event setup screen with a template selected; at least 66 products available.
- **Steps.**
  1. Add products row by row beneath the "Products" column (a new row is added automatically each time).
  2. Continue adding until 65 line items are present.
  3. Attempt to add a 66th line item.
- **Expected.** Up to 65 line items can be added; the product can not go beyond the stated limit of 65 line items.
- **Oracle.** Count of line-item rows in the template table never exceeds 65 (the article does not state the exact UI reaction at the limit — tester records what happens).
- **Trace.** P1 · manual · `daa92226c8b282118fe581522bc01e3e` · `how-to-create-a-single-stage-event-rfp-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Single Stage Event (RFP, RFQ, Auction)?

#### PRD-KBSRC-005 — Adding a product auto-adds a new row; typing narrows the product search

- **Why it matters.** Line-item entry is the bulk of event creation effort; the auto-row and search behaviours are what the article promises.
- **Setup.** Buyer / Procurement Manager on the Single Stage event setup screen with a template selected.
- **Steps.**
  1. Click the cell beneath the "Products" column and type part of a product name.
  2. Select the product from the dropdown.
- **Expected.** Typing narrows the product dropdown; after a product is added a new empty row is automatically added beneath it.
- **Oracle.** Dropdown options filter to the typed text; row count increases by one after selection.
- **Trace.** P2 · automate-later · `daa92226c8b282118fe581522bc01e3e` · `how-to-create-a-single-stage-event-rfp-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Single Stage Event (RFP, RFQ, Auction)?

#### PRD-KBSRC-006 — Buyer cannot fill shaded vendor-side fields in the template table

- **Why it matters.** Vendor-owned fields (e.g. price) must stay vendor-owned; a buyer pre-filling them would corrupt quotes.
- **Setup.** Buyer / Procurement Manager on the event setup screen with a template and at least one product added.
- **Steps.**
  1. Locate the shaded-out fields in the template table.
  2. Try to click into and type in a shaded-out field.
- **Expected.** Shaded-out fields cannot be filled in by the buyer; they are for the Vendor to fill.
- **Oracle.** The shaded cell does not accept input from the buyer.
- **Trace.** P1 · automate-later · `daa92226c8b282118fe581522bc01e3e` · `how-to-create-a-single-stage-event-rfp-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Single Stage Event (RFP, RFQ, Auction)?

#### PRD-KBSRC-007 — Suggested vendors are added as participants via "Invite Vendors"

- **Why it matters.** The vendor-suggestion shortcut is how most events get their participants; a broken mapping means an event with nobody to bid.
- **Setup.** Buyer / Procurement Manager; products added to the template that have vendors mapped to them.
- **Steps.**
  1. After adding products, find the green tip showing suggested vendors mapped to the products.
  2. Click the blue "Invite Vendors".
- **Expected.** The vendors mapped to the added products are automatically added as participants.
- **Oracle.** The suggested vendors appear in the event's Participants list.
- **Trace.** P1 · automate-later · `daa92226c8b282118fe581522bc01e3e` · `how-to-create-a-single-stage-event-rfp-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Single Stage Event (RFP, RFQ, Auction)?

#### PRD-KBSRC-008 — Add vendors manually from Participants

- **Why it matters.** Buyers must be able to invite vendors that are not suggested by product mapping.
- **Setup.** Buyer / Procurement Manager on the event setup screen.
- **Steps.**
  1. Click on Participants.
  2. Search or filter for a vendor on the screen that shows up.
  3. Add the vendor.
- **Expected.** The Participants screen opens with search and filter; the chosen vendor is added as a participant.
- **Oracle.** The manually added vendor is listed among the event's participants.
- **Trace.** P2 · automate-later · `daa92226c8b282118fe581522bc01e3e` · `how-to-create-a-single-stage-event-rfp-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Single Stage Event (RFP, RFQ, Auction)?

#### PRD-KBSRC-009 — Event title is auto-generated from product and location and is editable

- **Why it matters.** Vendors see the title in invitations; it must be meaningful and correctable.
- **Setup.** Buyer / Procurement Manager on the event setup screen with a product and location filled.
- **Steps.**
  1. Observe the event title after adding a product and location.
  2. Edit the title text.
- **Expected.** Procol auto-generates the event title using product and location names; the buyer can edit it.
- **Oracle.** The initial title contains the product and location names; the edited title persists on the event.
- **Trace.** P2 · automate-later · `daa92226c8b282118fe581522bc01e3e` · `how-to-create-a-single-stage-event-rfp-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Single Stage Event (RFP, RFQ, Auction)?

#### PRD-KBSRC-010 — "Edit Schedule" from the publish pop-up schedules the event for later

- **Why it matters.** Buyers must be able to defer going live instead of publishing immediately.
- **Setup.** Buyer / Procurement Manager with a fully filled Single Stage event.
- **Steps.**
  1. Click the blue "Publish Event" button.
  2. In the pop-up, press "Edit Schedule" instead of "Publish".
  3. Set a later start.
- **Expected.** The event is scheduled for later rather than going Live immediately.
- **Oracle.** The event's schedule shows the future start; vendors are not invited as live until then (tester verifies at the article's level of detail).
- **Trace.** P2 · manual · `daa92226c8b282118fe581522bc01e3e` · `how-to-create-a-single-stage-event-rfp-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Single Stage Event (RFP, RFQ, Auction)?

## 2. How to create a Sourcing Project (Technical Stage, RFQ, Auction)?

#### PRD-KBSRC-011 — Create and publish an eRFX Project with a Technical Stage and an RFQ

- **Why it matters.** The multi-stage project is the main create → publish path for technical + commercial sourcing.
- **Setup.** Buyer / Procurement Manager; products in the catalogue with mapped vendors; RFQ and RFP templates available; a user who can be assigned as technical evaluator.
- **Steps.**
  1. Navigate to the **Events** page and click "+ New Event".
  2. In the panel that opens, choose "eRFX Project".
  3. In the side drawer, search and add Line Items via the search bar on top.
  4. Click the blue "Create Project" button on the bottom right.
  5. Select the Technical Stage and RFQ events and click "Create Project" again.
  6. On the RFQ, click Select Template, choose a predefined template, and fill mandatory fields like Delivery Location.
  7. Click on Technical Stage, click Select Template to apply an RFP template to all line items via Bulk Action.
  8. Under the "Vendor Assessment" section click select template; click "+ Add Evaluator" under each line item and search the user to assign.
  9. Scroll to the bottom of the RFQ page and click the blue "Invite Vendors" in the green tip.
  10. Click the blue "Publish Event" button at the top right, review the pop-up and click the blue "Publish" button.
- **Expected.** A Project is created with the selected stages (Technical Stage and RFQ); on publish, an email notification is sent to all added participants inviting them to the event that is now Live.
- **Oracle.** Project creation screen shows both stages; "You Have Successfully Published your Event" confirmation; participants receive the invitation email.
- **Trace.** P0 · automate-later · `0da92226c8b283928ce601a58da61765` · `how-to-create-a-sourcing-project-technical-stage-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Sourcing Project (Technical Stage, RFQ, Auction)?

#### PRD-KBSRC-012 — Project cart: edit quantity, change UOM, remove items, item count on Create Project

- **Why it matters.** Quantities and units chosen in the cart flow into every stage of the project.
- **Setup.** Buyer / Procurement Manager in the "eRFX Project" side drawer with at least two line items added.
- **Steps.**
  1. Click a quantity box in the cart and type a new value.
  2. Click the small dropdown near the UOM, search, and select a different UOM.
  3. Click the trash icon next to one line.
  4. Look at the "Create Project" button.
- **Expected.** Quantity is editable in the cart; the UOM changes to the selected one; the trashed item is removed; the "Create Project" button shows how many items are selected.
- **Oracle.** Cart rows reflect the new quantity and UOM, the removed row is gone, and the count on "Create Project" matches the remaining rows.
- **Trace.** P2 · automate-later · `0da92226c8b283928ce601a58da61765` · `how-to-create-a-sourcing-project-technical-stage-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Sourcing Project (Technical Stage, RFQ, Auction)?

#### PRD-KBSRC-013 — An RFQ and an Auction cannot be created together; max 2 stages at creation

- **Why it matters.** Stated restriction on project structure; the auction must come from converting the RFQ.
- **Setup.** Buyer / Procurement Manager at the stage-selection step after clicking "Create Project" in the cart.
- **Steps.**
  1. Select the RFQ stage.
  2. Attempt to also select the Auction stage.
  3. Attempt to select more than 2 stages in total.
- **Expected.** Only one of RFQ or Auction can be chosen; at most 2 stages can be chosen during creation.
- **Oracle.** The stage selector does not allow RFQ and Auction together nor a third stage.
- **Trace.** P1 · automate-later · `0da92226c8b283928ce601a58da61765` · `how-to-create-a-sourcing-project-technical-stage-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Sourcing Project (Technical Stage, RFQ, Auction)?

#### PRD-KBSRC-014 — Selecting a template prefills products and quantities; Technical Stage bulk template applies to all line items

- **Why it matters.** Templates drive what vendors are asked for; bulk apply must reach every line item.
- **Setup.** Buyer / Procurement Manager on the project creation screen with a Technical Stage and RFQ.
- **Steps.**
  1. On the RFQ tab click Select Template and choose a predefined template.
  2. Click on Technical Stage, then Select Template to apply an RFP template via Bulk Action.
- **Expected.** Products and quantities are prefilled after selecting the template; on the Technical Stage, the same template is applied for all line items.
- **Oracle.** RFQ table shows the cart's products and quantities; every Technical Stage line item shows the chosen RFP template.
- **Trace.** P2 · automate-later · `0da92226c8b283928ce601a58da61765` · `how-to-create-a-sourcing-project-technical-stage-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Sourcing Project (Technical Stage, RFQ, Auction)?

#### PRD-KBSRC-015 — Technical evaluator must be assigned on every line item

- **Why it matters.** The technical stage cannot be evaluated (T1/T2/T3 or TA/TNA) without an evaluator on each line item; the article says "without fail".
- **Setup.** Buyer / Procurement Manager on the Technical Stage of a project with multiple line items; an internal user to assign as evaluator.
- **Steps.**
  1. Under the "Vendor Assessment" section, click select template.
  2. Click "+ Add Evaluator" under the first line item and search the user.
  3. Repeat for all line items.
- **Expected.** Each line item has the assigned technical evaluator; that evaluator is the user who will assess vendor responses in this stage and can assign ranks (T1, T2, T3) or TA (Technically Accepted) / TNA (Technically Not Accepted).
- **Oracle.** Every line item lists the evaluator; the tester records what happens if one line item is left without an evaluator (not stated in the article).
- **Trace.** P1 · manual · `0da92226c8b283928ce601a58da61765` · `how-to-create-a-sourcing-project-technical-stage-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Sourcing Project (Technical Stage, RFQ, Auction)?

#### PRD-KBSRC-016 — Vendor suggestion does not appear on the Technical Stage tab

- **Why it matters.** Stated behaviour; testers must look for suggestions on the right tab.
- **Setup.** Buyer / Procurement Manager on a project with a Technical Stage and an RFQ; products with mapped vendors.
- **Steps.**
  1. Open the Technical Stage tab and scroll to the bottom.
  2. Open the RFQ tab and scroll to the bottom.
- **Expected.** The vendor suggestion green tip with "Invite Vendors" does not appear on the Technical Stage tab; it appears only on RFQ and Auction tabs.
- **Oracle.** Presence of the suggestion tip on RFQ tab, absence on Technical Stage tab.
- **Trace.** P1 · automate-later · `0da92226c8b283928ce601a58da61765` · `how-to-create-a-sourcing-project-technical-stage-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Sourcing Project (Technical Stage, RFQ, Auction)?

#### PRD-KBSRC-017 — Participants are project-level and common to all stages

- **Why it matters.** A vendor invited on the RFQ must also be in the Technical Stage; divergence would let unqualified vendors bid.
- **Setup.** Buyer / Procurement Manager on a project with a Technical Stage and an RFQ.
- **Steps.**
  1. On the RFQ tab, add vendors (via "Invite Vendors" or Participants).
  2. Open the Technical Stage tab and view Participants.
- **Expected.** Participants added are on a project-level and are common for all stages.
- **Oracle.** The same vendor list is shown for both stages.
- **Trace.** P1 · automate-later · `0da92226c8b283928ce601a58da61765` · `how-to-create-a-sourcing-project-technical-stage-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Sourcing Project (Technical Stage, RFQ, Auction)?

#### PRD-KBSRC-018 — Crossed-out eye marks a stage not yet reviewed

- **Why it matters.** Visual cue that the buyer has not reviewed a stage before publishing.
- **Setup.** Buyer / Procurement Manager on a newly created project with a Technical Stage.
- **Steps.**
  1. Without opening the Technical Stage, look at its tab.
  2. Click on Technical Stage to review it.
- **Expected.** A crossed-out eye is shown next to the technical stage until it has been reviewed by the user.
- **Oracle.** Icon present before review; tester checks whether it clears after review.
- **Trace.** P3 · automate-later · `0da92226c8b283928ce601a58da61765` · `how-to-create-a-sourcing-project-technical-stage-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Sourcing Project (Technical Stage, RFQ, Auction)?

#### PRD-KBSRC-019 — Vendor-wise technical evaluation moves the evaluator to the Vendor Assessment section

- **Why it matters.** Alternate evaluation mode lets one person evaluate all line items.
- **Setup.** Buyer / Procurement Manager on the Technical Stage of a project.
- **Steps.**
  1. Click on Technical stage under Event Type.
  2. Switch to Vendor wise evaluation.
  3. Add the Evaluator in the Vendor Assessment section.
- **Expected.** All line items are evaluated by one person; the evaluator is added in the Vendor Assessment section rather than per line item.
- **Oracle.** Evaluator field appears in the Vendor Assessment section instead of under each line item.
- **Trace.** P2 · manual · `0da92226c8b283928ce601a58da61765` · `how-to-create-a-sourcing-project-technical-stage-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Sourcing Project (Technical Stage, RFQ, Auction)?

#### PRD-KBSRC-020 — Project-level actions: attachments, project-level T&Cs, Manage Items

- **Why it matters.** Project-level artefacts apply across stages and are distinct from stage-level ones.
- **Setup.** Buyer / Procurement Manager on the project creation screen.
- **Steps.**
  1. Add Project Level Attachments.
  2. Add Project Level T&Cs.
  3. Click Manage Items.
- **Expected.** Attachments and T&Cs are added at project level (project T&Cs are different from event-specific T&Cs but follow the same method); Manage Items opens the cart functionality.
- **Oracle.** Project shows the attachment and T&Cs; the cart opens on Manage Items.
- **Trace.** P2 · manual · `0da92226c8b283928ce601a58da61765` · `how-to-create-a-sourcing-project-technical-stage-rfq-auction` · Notion KB › Sourcing › Creating Events › How to create a Sourcing Project (Technical Stage, RFQ, Auction)?

## 3. How to set Savings references in an Event?

#### PRD-KBSRC-021 — Gross Total savings with default references (Budget, Historical Price, Existing Proposal)

- **Why it matters.** Savings references are the baseline for measuring cost savings during evaluation and awarding.
- **Setup.** Buyer / Procurement manager creating a new event.
- **Steps.**
  1. While creating a new event, click the "Savings" option at the bottom-left corner.
  2. In the side panel, select **Gross Total**.
  3. Enter a single reference value for one or more of Budget, Historical Price and Existing Proposal.
- **Expected.** The side panel shows saving calculation settings with three default Savings References; with Gross Total a single reference value per category is accepted for the full event.
- **Oracle.** The saved panel shows Gross Total selected and the entered reference values.
- **Trace.** P1 · automate-later · `6ec92226c8b283a0b50c01fed41a8ec2` · `how-to-set-savings-references-in-an-event` · Notion KB › Sourcing › Creating Events › How to set Savings references in an Event?

#### PRD-KBSRC-022 — Line Item savings based on Price vs Total Amount

- **Why it matters.** Price is quantity-independent while Total Amount multiplies by quantity; choosing wrongly misstates savings.
- **Setup.** Buyer / Procurement manager creating a new event with line items of quantity greater than 1.
- **Steps.**
  1. Open the "Savings" panel and select **Line Item**.
  2. Choose **Price** and enter reference values per line item.
  3. Switch to **Total Amount**.
- **Expected.** With Price, savings are per unit excluding quantity; with Total Amount, savings are calculated on price multiplied by quantity.
- **Oracle.** Tester compares computed savings on the evaluation/award view against reference × 1 vs reference × quantity (the article does not show the savings output screen).
- **Trace.** P2 · manual · `6ec92226c8b283a0b50c01fed41a8ec2` · `how-to-set-savings-references-in-an-event` · Notion KB › Sourcing › Creating Events › How to set Savings references in an Event?

#### PRD-KBSRC-023 — Add a custom savings reference

- **Why it matters.** Custom strategies (e.g. Best Price) extend the three defaults.
- **Setup.** Buyer / Procurement manager with the Savings panel open.
- **Steps.**
  1. Click "Add a Custom Reference".
  2. Type a name (e.g. Best Price) and click "Save".
  3. Select the column to calculate savings on for this custom strategy.
- **Expected.** The custom reference is added alongside the defaults with the selected column.
- **Oracle.** The custom reference name appears in the Savings panel with its chosen column.
- **Trace.** P2 · automate-later · `6ec92226c8b283a0b50c01fed41a8ec2` · `how-to-set-savings-references-in-an-event` · Notion KB › Sourcing › Creating Events › How to set Savings references in an Event?

#### PRD-KBSRC-024 — Bulk-enter savings references with "Paste from CSV"

- **Why it matters.** Large events need bulk entry of reference values.
- **Setup.** Buyer / Procurement manager creating an event with several line items; reference values in an Excel sheet.
- **Steps.**
  1. Copy the values from Excel.
  2. Go to the saving panel.
  3. Click "Paste from CSV".
- **Expected.** The values are pasted in the cells automatically.
- **Oracle.** Each reference cell holds the corresponding copied value.
- **Trace.** P2 · automate-later · `6ec92226c8b283a0b50c01fed41a8ec2` · `how-to-set-savings-references-in-an-event` · Notion KB › Sourcing › Creating Events › How to set Savings references in an Event?

## 4. How to Edit Currencies in my Event

#### PRD-KBSRC-025 — Set up Multi Currency with conversion factors

- **Why it matters.** Lets foreign vendors bid in their currency while the buyer compares in the default currency.
- **Setup.** Buyer / Procurement manager creating a new event.
- **Steps.**
  1. Click the "Edit Currencies" option at the bottom-left of the page.
  2. In the pop-up panel, select **Multi Currency**.
  3. Tick the checkbox next to each currency to add.
  4. Add a conversion factor in the input box next to each currency.
  5. Click OK.
- **Expected.** The event keeps its default currency and allows vendors to bid in the added currencies at the defined conversion rates.
- **Oracle.** Reopening "Edit Currencies" shows Multi Currency with the ticked currencies and their conversion factors.
- **Trace.** P1 · automate-later · `94e92226c8b2834494cf81dcb83af5d2` · `how-to-edit-currencies-in-my-event` · Notion KB › Sourcing › Creating Events › How to Edit Currencies in my Event

#### PRD-KBSRC-026 — Bids in another currency convert to the default currency in the QCS

- **Why it matters.** Award comparison depends on correct conversion; a wrong factor misranks vendors.
- **Setup.** Published RFQ or Auction configured with Multi Currency and a conversion factor; a participating vendor.
- **Steps.**
  1. As the vendor, place a bid in one of the added currencies.
  2. As the buyer, open the RFQ/Auction QCS.
- **Expected.** The bid is converted to the default currency using the defined conversion rate and populates the QCS.
- **Oracle.** QCS value equals vendor bid × configured conversion factor, shown in the default currency.
- **Trace.** P0 · manual · `94e92226c8b2834494cf81dcb83af5d2` · `how-to-edit-currencies-in-my-event` · Notion KB › Sourcing › Creating Events › How to Edit Currencies in my Event

#### PRD-KBSRC-027 — Change the event's Base Currency

- **Why it matters.** The base currency is what all vendors bid in and what the buyer compares in.
- **Setup.** Buyer / Procurement manager creating a new event.
- **Steps.**
  1. Click "Edit Currencies" and select **Base Currency**.
  2. Click "Select Base Currency" and choose the new currency from the dropdown.
  3. Add a conversion factor in the input box below the dropdown.
  4. Click OK.
- **Expected.** The default or base currency of that event changes to the selected currency.
- **Oracle.** The event shows the new base currency; reopening the panel shows it with the conversion factor.
- **Trace.** P1 · automate-later · `94e92226c8b2834494cf81dcb83af5d2` · `how-to-edit-currencies-in-my-event` · Notion KB › Sourcing › Creating Events › How to Edit Currencies in my Event

## 5. How to add Terms and Conditions for my Vendors in my Events?

#### PRD-KBSRC-028 — Add project-level T&Cs from previous sets, own text and uploads

- **Why it matters.** T&Cs ensure vendors formally acknowledge commercial and legal expectations before participating.
- **Setup.** Buyer on the Event Creation screen; T&Cs used previously under other projects or events exist; a PDF to upload.
- **Steps.**
  1. Next to the event title, click the 'Add T&Cs' button.
  2. In the side panel, use the checkboxes to select previously used T&Cs.
  3. Type terms in the text box labeled 'Add your own terms and conditions' and click the plus (+) button.
  4. Upload a file using the **Upload** button.
  5. Click **Done** at the bottom right.
- **Expected.** The selected, typed and uploaded T&Cs are attached at project level and apply to all events under the project.
- **Oracle.** Reopening 'Add T&Cs' shows all added items; each event under the project carries them.
- **Trace.** P1 · automate-later · `9e892226c8b2826c8a37012c17486ea9` · `how-to-add-terms-and-conditions-for-my-vendors-in-my-events` · Notion KB › Sourcing › Creating Events › How to add Terms and Conditions for my Vendors in my Events?

#### PRD-KBSRC-029 — Add event-specific T&Cs via 'Edit Terms and Conditions'

- **Why it matters.** Stage-level T&Cs apply only to a specific RFQ, Auction or Technical Round.
- **Setup.** Buyer on the event configuration screen.
- **Steps.**
  1. Click the 'Edit Terms and Conditions' button towards the bottom left.
  2. Select from recent or previously used T&Cs and manually enter new terms.
  3. Upload files or documents if needed.
  4. Click **Done** at the bottom right.
- **Expected.** The T&Cs are added to that event only.
- **Oracle.** The event's T&C panel lists the added terms; other stages of the same project do not show them.
- **Trace.** P1 · automate-later · `9e892226c8b2826c8a37012c17486ea9` · `how-to-add-terms-and-conditions-for-my-vendors-in-my-events` · Notion KB › Sourcing › Creating Events › How to add Terms and Conditions for my Vendors in my Events?

#### PRD-KBSRC-030 — Mandatory T&Cs must be accepted by vendors before submitting bids

- **Why it matters.** Compliance gate: a vendor must not be able to bid without accepting mandatory terms.
- **Setup.** Buyer publishes an event whose event-level T&Cs are marked mandatory; a participating vendor.
- **Steps.**
  1. As buyer, in 'Edit Terms and Conditions' mark all T&Cs as mandatory, click Done and publish.
  2. As vendor, open the event and try to submit a bid without accepting the T&Cs.
  3. Accept the T&Cs and submit the bid.
- **Expected.** Vendors are required to accept the T&Cs before submitting bids.
- **Oracle.** Bid submission is not possible until the T&Cs are accepted; after acceptance the bid submits.
- **Trace.** P0 · automate-later · `9e892226c8b2826c8a37012c17486ea9` · `how-to-add-terms-and-conditions-for-my-vendors-in-my-events` · Notion KB › Sourcing › Creating Events › How to add Terms and Conditions for my Vendors in my Events?

#### PRD-KBSRC-031 — Remove a T&C with the cross next to it

- **Why it matters.** Buyers must be able to correct wrongly attached terms before publishing.
- **Setup.** Buyer with the T&C panel open and at least two T&Cs added.
- **Steps.**
  1. Click the cross next to one T&C.
  2. Click **Done**.
- **Expected.** The removed term no longer appears; the remaining terms stay.
- **Oracle.** Reopened panel lists only the remaining T&Cs.
- **Trace.** P2 · automate-later · `9e892226c8b2826c8a37012c17486ea9` · `how-to-add-terms-and-conditions-for-my-vendors-in-my-events` · Notion KB › Sourcing › Creating Events › How to add Terms and Conditions for my Vendors in my Events?

## 6. How do I Schedule Events and change Event Duration?

#### PRD-KBSRC-032 — Start Now with a preset duration

- **Why it matters.** The default schedule decides when vendors can bid and when bidding closes.
- **Setup.** Planner / Buyer / Procurement manager on the event creation page.
- **Steps.**
  1. Click the date range label beside the "Schedule" option at the bottom-right corner.
  2. In the side panel, under Start Time keep "Start Now".
  3. Under End Time, open the "Duration" drop-down and choose a preset (30 minutes, 1 hour, 4 hours or 1 day).
- **Expected.** The side panel shows Start Time, End Time and Evaluation Time; with Start Now the event starts immediately at the current date and time shown, and ends after the chosen duration.
- **Oracle.** The schedule label shows a range from now to now + chosen duration.
- **Trace.** P1 · automate-later · `e9892226c8b283249ccf819201c93727` · `how-do-i-schedule-events-and-change-event-duration` · Notion KB › Sourcing › Creating Events › How do I Schedule Events and change Event Duration?

#### PRD-KBSRC-033 — Schedule for Later with a chosen start date and time

- **Why it matters.** Future-dated events must not go live early.
- **Setup.** Planner / Buyer / Procurement manager with the Schedule side panel open.
- **Steps.**
  1. Under Start Time, change the drop-down to **Schedule for Later**.
  2. Click the date field and pick a future date in the calendar widget.
  3. Click the time field and type or pick a time.
- **Expected.** The event is set to start at the chosen future date and time.
- **Oracle.** The schedule label shows the chosen start; the event does not go live before it.
- **Trace.** P1 · automate-later · `e9892226c8b283249ccf819201c93727` · `how-do-i-schedule-events-and-change-event-duration` · Notion KB › Sourcing › Creating Events › How do I Schedule Events and change Event Duration?

#### PRD-KBSRC-034 — Custom end-time duration in Minutes, Hours or Days

- **Why it matters.** Non-preset durations are common for real events.
- **Setup.** Planner / Buyer / Procurement manager with the Schedule side panel open.
- **Steps.**
  1. Under End Time, click **Custom Duration**.
  2. In the dialog box enter a numeric value and choose the unit (Minutes, Hours, Days).
  3. Click **Save**.
- **Expected.** The custom duration is confirmed as the event's end-time duration.
- **Oracle.** End time equals start + the entered value in the chosen unit.
- **Trace.** P2 · automate-later · `e9892226c8b283249ccf819201c93727` · `how-do-i-schedule-events-and-change-event-duration` · Notion KB › Sourcing › Creating Events › How do I Schedule Events and change Event Duration?

#### PRD-KBSRC-035 — Fixed Time end instead of a duration

- **Why it matters.** Some events must close at an exact date and time.
- **Setup.** Planner / Buyer / Procurement manager with the Schedule side panel open.
- **Steps.**
  1. Under End Time, change the drop-down from **Duration** to **Fixed Time**.
  2. Use the date picker to choose the exact end date and time.
- **Expected.** The event is set to end at the chosen date and time.
- **Oracle.** The schedule label shows the chosen end date and time.
- **Trace.** P2 · automate-later · `e9892226c8b283249ccf819201c93727` · `how-do-i-schedule-events-and-change-event-duration` · Notion KB › Sourcing › Creating Events › How do I Schedule Events and change Event Duration?

#### PRD-KBSRC-036 — Evaluation Time duration (preset or custom)

- **Why it matters.** Evaluation time controls how long the event remains open for evaluation after it ends.
- **Setup.** Planner / Buyer / Procurement manager with the Schedule side panel open.
- **Steps.**
  1. Under Evaluation Time, open the drop-down named "Duration".
  2. Choose a preset (30 minutes, 1 hour, 4 hours, 1 day), or choose Custom Duration, enter a numeric value and unit (Minutes, Hours, Days) and click **Save**.
- **Expected.** The event remains open for evaluation for the chosen duration after it ends.
- **Oracle.** Evaluation Time shows the chosen value; after the end time, evaluation stays available for that duration.
- **Trace.** P2 · automate-later · `e9892226c8b283249ccf819201c93727` · `how-do-i-schedule-events-and-change-event-duration` · Notion KB › Sourcing › Creating Events › How do I Schedule Events and change Event Duration?

#### PRD-KBSRC-037 — Evaluation Time "Not Applicable" keeps the evaluation window open indefinitely

- **Why it matters.** Stated behaviour: no expiry on evaluation.
- **Setup.** Planner / Buyer / Procurement manager with the Schedule side panel open.
- **Steps.**
  1. Under Evaluation Time, choose **Not Applicable**.
  2. Publish the event and let it pass its end time.
- **Expected.** The evaluation window stays open indefinitely (no expiry).
- **Oracle.** Evaluation remains available long after the event end time.
- **Trace.** P2 · manual · `e9892226c8b283249ccf819201c93727` · `how-do-i-schedule-events-and-change-event-duration` · Notion KB › Sourcing › Creating Events › How do I Schedule Events and change Event Duration?

## 7. How do I add additional columns to a Template?

#### PRD-KBSRC-038 — Add a Creator column (e.g. Price Cap) and fill it as buyer

- **Why it matters.** Creator columns enforce pricing rules such as price caps and tick sizes on the event.
- **Setup.** Buyer / Purchaser on the RFQ Event Creation page with line items added.
- **Steps.**
  1. Click "+Add Columns" above the RFQ Sheet on the right side.
  2. Choose **Creator**.
  3. Pick a column from the list (Price Cap, Creator Attachments, Tick Size, Min Quantity, Custom Column, Tick Size Percentage).
  4. Fill in values in the new column's cells.
- **Expected.** The dropdown offers Creator and Participant; the Creator list shows the six options; the selected column shows up in the RFQ/Auction Sheet and the buyer can fill its cells.
- **Oracle.** New column header visible in the sheet with the buyer-entered values.
- **Trace.** P1 · automate-later · `98e92226c8b28227abc2016fcb9b294b` · `how-do-i-add-additional-columns-to-a-template` · Notion KB › Sourcing › Creating Events › How do I add additional columns to a Template?

#### PRD-KBSRC-039 — Add a Participant column (e.g. Freight Charges) for the vendor to fill

- **Why it matters.** Participant columns collect extra vendor data such as freight and attachments.
- **Setup.** Buyer / Purchaser on the RFQ Event Creation page; a participating vendor to verify.
- **Steps.**
  1. Click "+Add Columns" and choose **Participant**.
  2. Pick a column (Freight Charges, Participant Attachments, Custom Column).
  3. Publish and, as the vendor, open the event.
- **Expected.** The column shows up in the RFQ/Auction Sheet and is filled in by the vendor.
- **Oracle.** Column visible in the buyer's sheet and editable by the vendor when bidding.
- **Trace.** P1 · automate-later · `98e92226c8b28227abc2016fcb9b294b` · `how-do-i-add-additional-columns-to-a-template` · Notion KB › Sourcing › Creating Events › How do I add additional columns to a Template?

#### PRD-KBSRC-040 — An added column disappears from its dropdown list

- **Why it matters.** Prevents adding the same column twice.
- **Setup.** Buyer / Purchaser on the RFQ Event Creation page.
- **Steps.**
  1. Add a column (e.g. Tick Size) via "+Add Columns" › Creator.
  2. Open "+Add Columns" › Creator again.
- **Expected.** The dropdown value disappears from its respective list after being added.
- **Oracle.** The added column's name is no longer in the list.
- **Trace.** P2 · automate-later · `98e92226c8b28227abc2016fcb9b294b` · `how-do-i-add-additional-columns-to-a-template` · Notion KB › Sourcing › Creating Events › How do I add additional columns to a Template?

## 8. How do I fill my tempate by uploading an Excel Sheet?

#### PRD-KBSRC-041 — Fill the product sheet by uploading a filled Excel template

- **Why it matters.** Bulk upload is how large RFQs get their line items.
- **Setup.** Buyer on the RFQ Event Creation page; Google Sheets or Microsoft Excel available.
- **Steps.**
  1. Click "Upload Sheet" above the RFQ Sheet on the right side.
  2. In the pop-up click "Download template".
  3. Open the sheet, fill in the line item details, and download it as an .xlsx file.
  4. Upload the filled file in the modal and click OK.
- **Expected.** The Product Sheet is updated with the filled in details.
- **Oracle.** RFQ sheet rows match the rows in the uploaded .xlsx.
- **Trace.** P1 · automate-later · `8eb92226c8b28252ab93812002a9d33a` · `how-do-i-fill-my-tempate-by-uploading-an-excel-sheet` · Notion KB › Sourcing › Creating Events › How do I fill my tempate by uploading an Excel Sheet?

#### PRD-KBSRC-042 — "Download template" gives a sheet that opens in Google Sheets or Excel

- **Why it matters.** The downloadable template is the contract for the upload format.
- **Setup.** Buyer on the RFQ Event Creation page.
- **Steps.**
  1. Click "Upload Sheet".
  2. Click "Download template" in the pop-up.
  3. Open the downloaded file in Google Sheets or Microsoft Excel.
- **Expected.** A template sheet for filling in line item details is downloaded and opens in either application.
- **Oracle.** A downloaded file exists and opens with line-item columns.
- **Trace.** P2 · automate-later · `8eb92226c8b28252ab93812002a9d33a` · `how-do-i-fill-my-tempate-by-uploading-an-excel-sheet` · Notion KB › Sourcing › Creating Events › How do I fill my tempate by uploading an Excel Sheet?

## 9. Dynamic Event Extension

_This article has no content yet in Notion — no cases written._
