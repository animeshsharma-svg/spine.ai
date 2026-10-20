# Screen: create-boq (/orders/quick-create)

Captured 2026-10-20 on company 198678. 15 controls, 14 with a known effect, 6 test cases written from it.

## How to reach the create-boq screen

Plan steps: open_create {"path":"boq"}. Path: `/orders/quick-create`.

It shows: Please choose a template and upload a BOQ sheet to proceed.

## What each control on create-boq does

- **Ask Clara** (button): Opens the Clara assistance panel. Affects: Nothing unless Clara applies a change from the panel.. Leads to: Clara summary panel. Check: Click Ask Clara and verify that the Clara panel appears.
- **Add Attachments** (button): Opens the attachment control so the buyer can add files to the project. Affects: Adds project attachment data for later submission.. Leads to: Attachment drawer or dialog. Check: Click Add Attachments, select a file, and verify that the file is listed.
- **Add T&Cs** (button): Opens the terms and conditions editor. Affects: Changes the project's terms_and_conditions data.. Leads to: Terms and conditions drawer or dialog. Rule R-FCR-008-3. Check: Click Add T&Cs, enter a clause, and verify that it remains in the editor.
- **Save as draft** (button, disabled): Does nothing because the Save as draft button is disabled. Affects: Nothing.. Leads to: Stays here. Rule R-FCR-016-2. Check: Verify that clicking Save as draft produces no request or navigation.
- **Publish** (button): Attempts to publish the event after running the project's validation checks. Affects: If validation succeeds, creates or activates the event and stores its project and stage data.. Leads to: Published event or a validation error on this screen. Rule R-FCR-013-1. Check: Click Publish without a title or required BOQ data and verify that publication is blocked with an error.
- **Rank on lot** (button): Sets the auction to rank bids on lots. Affects: Changes the auction closing mode to lot-based ranking.. Leads to: Stays here. Rule R-FCR-009-1. Check: Click Rank on lot and verify that the lot-based ranking option is selected.
- **Select Templates** (button, disabled): Cannot be clicked while disabled. Affects: Nothing because template selection is currently blocked.. Leads to: stays here. Rule R-FCR-016-2. Check: Verify that Select Templates cannot be activated in the current incomplete state.
- **Participants** (button): Opens the project participants panel. Affects: Changes the event's audience_company_uuids participant list.. Leads to: Participants drawer or panel. Rule R-FCR-008-1. Check: Open Participants, add a vendor, and verify that the vendor appears in the participant list.
- **Savings** (button, disabled): Does nothing because Savings is disabled. Affects: Nothing.. Leads to: Stays here. Rule R-FCR-024-2. Check: Verify that clicking Savings does not open savings configuration while the required template and product are missing.
- **Terms & Conditions** (button, disabled): Does nothing because Terms & Conditions is disabled. Affects: Nothing.. Leads to: Stays here. Rule R-FCR-024-2. Check: Verify that clicking Terms & Conditions does not open its editor while the required template and product are missing.
- **Now - 02:49 am, 21st Oct ( 30 Mins )** (button, disabled): Does nothing because the schedule control is disabled. Affects: Nothing.. Leads to: Stays here. Rule R-FCR-024-2. Check: Verify that clicking the disabled schedule control does not open scheduling options.
- **Auction** (tab): Keeps the event in Auction mode. Affects: Sets the event mode used for auction configuration and validation.. Leads to: Auction configuration view. Rule R-FCR-009-1. Check: Verify that Auction remains highlighted and auction-specific controls are shown.
- **Events** (link): Navigates back to the Events area. Affects: Nothing in the event's data.. Leads to: Events list. Check: Click Events and verify that the events list loads.
- **Enter the title of the project** (field): Sets or edits the project title. Affects: Changes the title field sent in the project payload and used during publication.. Leads to: Stays here. Rule R-FCR-008-1. Check: Enter a title and verify that the value remains populated before publishing.

Not yet described: "Search vendors you want to add".

## Test cases written from the create-boq screen

- GEN-SCR-124: Publish is blocked when no template or BOQ sheet is provided. Steps: Click "Publish". Expected: The event is not published. The screen shows "Please choose a template and upload a BOQ sheet to proceed". "Select Templates" remains disabled until the screen permits template selection, and "Add Attachments" is available for uploading the BOQ sheet. [plan: full]
- GEN-SCR-125: Add Attachments opens the BOQ upload flow. Steps: Click "Add Attachments". Expected: An attachment or file-upload interface opens, allowing the tester to choose a BOQ sheet. The create screen remains available after closing the interface. [plan: partial]
- GEN-SCR-126: Add T&Cs opens terms and conditions editing. Steps: Click "Add T&Cs". Expected: A terms and conditions editor or picker opens. After closing it without saving, "Terms & Conditions" remains disabled. After adding terms and returning to the screen, the terms configuration is available from the create screen. [plan: partial]
- GEN-SCR-248: Verify blocked setup controls explain the missing BOQ data. Steps: Observe the message near the project setup area. Observe Save as draft. Observe Select Templates. Expected: The message says "Please choose a template and upload a BOQ sheet to proceed". Save as draft and Select Templates are disabled. [plan: full]
- GEN-SCR-249: Open Clara from the create screen. Steps: Click Ask Clara. Expected: The Clara assistance panel or dialog opens. [plan: partial]
- GEN-SCR-250: Return to the events area. Steps: Click Events. Expected: The events area opens and the create screen is no longer displayed. [plan: full]
