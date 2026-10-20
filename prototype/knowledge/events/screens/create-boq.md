# Screen: create-boq (/orders/quick-create)

Captured 2026-10-20 on company 198678. 15 controls, 12 with a known effect, 3 test cases written from it.

## How to reach the create-boq screen

Plan steps: open_create {"path":"boq"}. Path: `/orders/quick-create`.

It shows: Please choose a template and upload a BOQ sheet to proceed.

## What each control on create-boq does

- **Ask Clara** (button): Opens the Clara assistant or summary panel. Affects: Nothing in the event data.. Leads to: Clara panel. Rule R-FCR-011-5. Check: Click Ask Clara and verify that the Clara panel appears.
- **Add Attachments** (button): Opens the attachment picker or attachment drawer. Affects: Adds selected files to the event attachments.. Leads to: Attachment picker or drawer. Check: Click Add Attachments and verify that an attachment selection interface opens.
- **Add T&Cs** (button): Opens the terms and conditions editor. Affects: Updates the event's terms_and_conditions data when clauses or files are saved.. Leads to: Terms and conditions editor. Rule R-FCR-008-3. Check: Click Add T&Cs and verify that the terms and conditions editor opens.
- **Save as draft** (button, disabled): Cannot be clicked while disabled. Affects: Nothing because the draft cannot currently be saved.. Leads to: stays here. Rule R-FCR-024-2. Check: Verify that Save as draft is disabled until the required template and product data are present.
- **Publish** (button): Runs publish validation and publishes the event when all required data is valid. Affects: Creates or activates the event and moves it into the published event flow.. Leads to: The created event or an event-details screen. Rule R-FCR-019-2. Check: With valid title, template, items, and participants, click Publish and verify that the event is created.
- **Rank on lot** (button): Selects ranking by lot for the auction. Affects: Changes the auction configuration so bids are ranked at lot level.. Leads to: stays here. Rule R-FCR-009-1. Check: Click Rank on lot and verify that the lot-based ranking option becomes selected.
- **Select Templates** (button, disabled): Cannot be clicked while disabled. Affects: Nothing because template selection is currently blocked.. Leads to: stays here. Rule R-FCR-016-2. Check: Verify that Select Templates cannot be activated in the current incomplete state.
- **Participants** (button): Opens the participant management interface. Affects: Adds or changes the event's audience participants.. Leads to: Participants drawer or screen. Rule R-FCR-017-1. Check: Click Participants and verify that the participant management interface opens.
- **Savings** (button, disabled): Cannot be clicked while disabled. Affects: Nothing because savings configuration is unavailable in the current state.. Leads to: stays here. Rule R-FCR-024-2. Check: Verify that Savings is disabled and does not open a configuration view.
- **Auction** (tab): Keeps the event in Auction mode because the Auction tab is already selected. Affects: The event remains configured as an auction rather than another event mode.. Leads to: stays here. Rule R-FCR-009-1. Check: Verify that Auction remains highlighted and the event mode does not change.
- **Events** (link): Navigates back to the Events area. Affects: Nothing in the event data.. Leads to: Events screen. Check: Click Events and verify that the Events screen opens.
- **Enter the title of the project** (field): Sets or edits the project title. Affects: Updates the event title field that is sent in the project payload.. Leads to: stays here. Rule R-FCR-008-1. Check: Enter text and verify that the title field retains the entered value.

Not yet described: "Terms & Conditions", "Now - 01:27 am, 21st Oct ( 30 Mins )", "Search vendors you want to add".

## Test cases written from the create-boq screen

- GEN-SCR-124: Publish is blocked when no template or BOQ sheet is provided. Steps: Click "Publish". Expected: The event is not published. The screen shows "Please choose a template and upload a BOQ sheet to proceed". "Select Templates" remains disabled until the screen permits template selection, and "Add Attachments" is available for uploading the BOQ sheet. [plan: full]
- GEN-SCR-125: Add Attachments opens the BOQ upload flow. Steps: Click "Add Attachments". Expected: An attachment or file-upload interface opens, allowing the tester to choose a BOQ sheet. The create screen remains available after closing the interface. [plan: partial]
- GEN-SCR-126: Add T&Cs opens terms and conditions editing. Steps: Click "Add T&Cs". Expected: A terms and conditions editor or picker opens. After closing it without saving, "Terms & Conditions" remains disabled. After adding terms and returning to the screen, the terms configuration is available from the create screen. [plan: partial]
