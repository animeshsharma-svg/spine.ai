# Screen: create-boq (/orders/quick-create)

Captured 2026-10-21 on company 198678. 15 controls, 14 with a known effect, 10 test cases written from it.

## How to reach the create-boq screen

Plan steps: open_create {"path":"boq"}. Path: `/orders/quick-create`.

It shows: Please choose a template and upload a BOQ sheet to proceed.

## What each control on create-boq does

- **Ask Clara** (button): Opens the Clara assistant or summary panel. Affects: Nothing unless the assistant is used to update event content.. Leads to: Clara panel. Rule R-FCR-011-5. Check: Click Ask Clara and verify that a Clara panel opens.
- **Add Attachments** (button): Opens a control for adding file attachments. Affects: Adds attachment data to the event when a file is selected.. Leads to: Attachment picker or drawer. Check: Click Add Attachments and verify that a file-selection control opens.
- **Add T&Cs** (button): Opens the terms and conditions editor. Affects: Changes the event's terms_and_conditions data.. Leads to: Terms and Conditions drawer or dialog. Rule R-FCR-008-3. Check: Click Add T&Cs and verify that the terms editor opens.
- **Save as draft** (button, disabled): Cannot save the event as a draft because the required template and BOQ item prerequisites are not met. Affects: Nothing while disabled; when enabled it would create or update a draft project.. Leads to: stays here. Rule R-FCR-024-2. Check: Verify the button is disabled before selecting a template and adding a BOQ item.
- **Publish** (button): Attempts to publish the event, but it is currently blocked by the missing template and BOQ upload. Affects: When enabled, creates the event and moves it into its published or active flow.. Leads to: stays here. Rule R-FCR-024-2. Check: Verify Publish cannot proceed while the template and BOQ prerequisites are missing.
- **Rank on lot** (button): Opens the auction strategy configuration with ranking by lot selected or configurable. Affects: Changes the auction strategy and lot-level closing or evaluation configuration.. Leads to: Auction strategy drawer. Rule R-FCR-009-1. Check: Click Rank on lot and verify that the strategy drawer shows lot ranking settings.
- **Select Templates** (button): Opens the template selector for choosing a BOQ template. Affects: Sets the event template and enables template-dependent event configuration and actions.. Leads to: Template selection drawer. Rule R-FCR-026-4. Check: Click Select Templates and verify that available BOQ templates are listed.
- **Participants** (button): Opens the participant management view. Affects: Adds or removes audience companies or vendors for the event.. Leads to: Participants drawer or screen. Rule R-FCR-017-1. Check: Click Participants and verify that the event participant list can be viewed or edited.
- **Savings** (button, disabled): Cannot be opened because the event prerequisites are incomplete. Affects: Nothing while disabled; when configured it would expose savings settings or data.. Leads to: stays here. Rule R-FCR-024-2. Check: Verify Savings remains disabled before a template and BOQ item are provided.
- **Terms & Conditions** (button, disabled): Cannot be opened because the required event setup is incomplete. Affects: Nothing while disabled; when enabled it would open the event's terms and conditions configuration.. Leads to: stays here. Rule R-FCR-024-2. Check: Verify Terms & Conditions remains disabled until the required template and BOQ data are present.
- **Auction** (tab): Keeps the event in Auction mode and shows the auction configuration view. Affects: Sets or preserves the stage mode as auction and applies auction-specific settings.. Leads to: Auction configuration view. Rule R-FCR-009-1. Check: Verify Auction is highlighted and auction settings are displayed.
- **Events** (link): Navigates back to the Events area. Affects: Nothing in the current event.. Leads to: Events screen. Check: Click Events and verify that the Events listing opens.
- **Enter the title of the project** (field): Accepts the project title entered by the buyer. Affects: Updates the event or project title that is sent in the project payload and shown during publishing.. Leads to: stays here. Rule R-FCR-008-1. Check: Enter a title and verify that the field retains it and the title appears in the publish flow.
- **Search vendors you want to add** (select, disabled): Cannot search for or add vendors because participant selection is disabled before the required event setup is complete. Affects: Nothing while disabled; when enabled it would update the event audience participants.. Leads to: stays here. Rule R-FCR-017-1. Check: Verify the vendor selector is disabled and cannot accept a vendor search.

Not yet described: "Now - 04:53 pm, 21st Oct ( 30 Mins )".

## Test cases written from the create-boq screen

- GEN-SCR-124: Publish is blocked when no template or BOQ sheet is provided. Steps: Click "Publish". Expected: The event is not published. The screen shows "Please choose a template and upload a BOQ sheet to proceed". "Select Templates" remains disabled until the screen permits template selection, and "Add Attachments" is available for uploading the BOQ sheet. [plan: full]
- GEN-SCR-125: Add Attachments opens the BOQ upload flow. Steps: Click "Add Attachments". Expected: An attachment or file-upload interface opens, allowing the tester to choose a BOQ sheet. The create screen remains available after closing the interface. [plan: partial]
- GEN-SCR-126: Add T&Cs opens terms and conditions editing. Steps: Click "Add T&Cs". Expected: A terms and conditions editor or picker opens. After closing it without saving, "Terms & Conditions" remains disabled. After adding terms and returning to the screen, the terms configuration is available from the create screen. [plan: partial]
- GEN-SCR-248: Verify blocked setup controls explain the missing BOQ data. Steps: Observe the message near the project setup area. Observe Save as draft. Observe Select Templates. Expected: The message says "Please choose a template and upload a BOQ sheet to proceed". Save as draft and Select Templates are disabled. [plan: full]
- GEN-SCR-249: Open Clara from the create screen. Steps: Click Ask Clara. Expected: The Clara assistance panel or dialog opens. [plan: partial]
- GEN-SCR-250: Return to the events area. Steps: Click Events. Expected: The events area opens and the create screen is no longer displayed. [plan: full]
- GEN-SCR-378: Enable Save as draft after adding the required template and product. Steps: Verify that "Save as draft" is disabled. Click "Select Templates" and select a valid BOQ template. Click "Add Attachments" and upload a valid BOQ sheet containing at least one product. Expected: Initially, "Save as draft" is disabled and the screen shows "Please choose a template and upload a BOQ sheet to proceed". After the template and product are added, "Save as draft" becomes enabled. [plan: full]
- GEN-SCR-379: Open the BOQ upload flow. Steps: Click "Add Attachments". Expected: The attachment or file-upload interface opens, allowing a BOQ sheet to be selected. [plan: partial]
- GEN-SCR-380: Show the publish confirmation before publishing. Steps: Click "Publish". Expected: A confirmation modal opens. Its title is "Publish Event". The modal shows the confirmation action text "Publish" and the cancel action text "Edit Schedule". Do not confirm publishing. [plan: full]
- GEN-SCR-381: Render the Clara summary when Clara is disabled but a summary exists. Steps: Open the create screen. Click "Ask Clara". Expected: The Clara summary panel renders and displays the existing project summary. [plan: none]
