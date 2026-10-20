# Screen: create-technical-template (/orders/quick-create)

Captured 2026-10-20 on company 198678. 21 controls, 21 with a known effect, 3 test cases written from it.

## How to reach the create-technical-template screen

Plan steps: open_create {"path":"erfx"} → set_title → compose_stages {"stages":["rfp","rfq"]} → switch_stage {"stage":"rfp"} → select_template. Path: `/orders/quick-create`.
Headings on it: Vendor Assessment.
It shows: Line Items are not added, please add them in Manage Line Items section.

## What each control on create-technical-template does

- **Ask Clara** (button): Opens Clara to help generate or manage the technical questions. Affects: May add or modify technical-stage line-item questions, but requires project line items.. Leads to: Ask Clara drawer. Rule R-FCR-042-4. Check: Click Ask Clara and verify that the Clara drawer opens or the missing-line-items requirement is shown.
- **Add Attachments** (button): Opens the attachment interface for adding files to the event. Affects: Adds event attachments to the event data.. Leads to: Attachments drawer or dialog. Check: Click Add Attachments and verify that an attachment picker or drawer opens.
- **Add T&Cs** (button): Opens the terms-and-conditions interface. Affects: Changes the event's terms and conditions configuration.. Leads to: Terms and conditions drawer or dialog. Rule R-FCR-008-3. Check: Click Add T&Cs and verify that the terms-and-conditions editor opens.
- **Items 0** (button): Opens the line-item manager, currently showing that no items have been added. Affects: Adds or edits the technical-stage line items used by the event.. Leads to: Manage Line Items drawer or section. Rule R-FCR-016-2. Check: Click Items 0 and verify that the Manage Line Items interface opens.
- **Save as draft** (button, disabled): Remains unavailable because the event has no line items. Affects: Blocks saving the event as a draft until the required setup is present.. Leads to: stays here. Rule R-FCR-016-2. Check: Verify that Save as draft is disabled and that its explanation says to add line items.
- **Publish** (button): Attempts to publish the project. Affects: Runs publish validation and, if valid, changes the event from creation into its published flow.. Leads to: Publish confirmation or validation error. Rule R-FCR-013-1. Check: Click Publish and verify that a confirmation or a specific validation error appears.
- **Technical Stage** (button): Opens the Technical Stage configuration or selection interface. Affects: Changes the configuration of the technical stage.. Leads to: Technical Stage configuration drawer or view. Check: Click Technical Stage and verify that technical-stage configuration is displayed.
- **Test** (button): Opens a test or preview of the technical stage. Affects: Does not publish the event, but lets the buyer inspect the configured technical-stage experience.. Leads to: Technical-stage test or preview screen. Check: Click Test and verify that a test or preview view opens without publishing the event.
- **Add Evaluator** (button): Opens the evaluator assignment interface. Affects: Assigns evaluators to the technical stage or its line-item sections.. Leads to: Evaluator drawer or dialog. Rule R-FCR-041-4. Check: Click Add Evaluator and verify that an evaluator-selection interface opens.
- **Participants** (button): Opens the participant-management interface. Affects: Adds or removes vendors invited to participate in the event.. Leads to: Participants drawer or section. Rule R-FCR-017-1. Check: Click Participants and verify that the participant list and vendor controls are shown.
- **Terms & Conditions** (button): Opens the event's terms-and-conditions interface. Affects: Changes the terms and conditions saved with the event.. Leads to: Terms and conditions drawer or section. Rule R-FCR-008-3. Check: Click Terms & Conditions and verify that the saved terms and conditions can be viewed or edited.
- **Now - 01:09 am, 21st Oct ( 30 Mins )** (button): Opens the schedule editor for the current start time and duration. Affects: Changes the stage start, end, duration, or recurrence scheduling data.. Leads to: Schedule drawer or popover. Rule R-FCR-022-7. Check: Click the current schedule and verify that the timing editor opens with the displayed start and duration.
- **Technical Stage** (tab): Displays the Technical Stage tab as the active stage. Affects: Changes only which stage configuration is visible.. Leads to: stays here. Check: Verify that Technical Stage is selected and its configuration content is visible.
- **RFQ** (tab): Switches to the RFQ stage tab. Affects: Changes the visible stage configuration from Technical Stage to RFQ.. Leads to: RFQ stage view. Check: Click RFQ and verify that the RFQ configuration becomes visible and the tab is selected.
- **Events** (link): Navigates back to the events listing. Affects: nothing. Leads to: Events screen. Check: Click Events and verify that the events list opens.
- **Enter the title of the project** (field): Accepts the project title entered by the buyer. Affects: Updates the project title used when saving or publishing the event.. Leads to: stays here. Rule R-FCR-013-1. Check: Enter a title and verify that the field retains it and that publishing no longer fails for an empty title.
- **Search vendors you want to add** (select): Searches for vendors and allows eligible search results to be selected. Affects: Adds selected vendors to the event participants.. Leads to: stays here. Rule R-FCR-035-3. Check: Search for a vendor and verify that an eligible result can be selected while blocked results cannot.
- **#** (column): Displays the line-item number column. Affects: nothing. Leads to: stays here. Check: Verify that the line-item table shows the # column heading.
- **Specification** (column): Displays the required Specification column for technical-stage items. Affects: Defines the specification field that must be populated for each applicable item.. Leads to: stays here. Check: Verify that the Specification heading is visible and marked required.
- **Description** (column): Displays the required Description column for technical-stage items. Affects: Defines the description field captured for each applicable item.. Leads to: stays here. Check: Verify that the Description heading is visible and marked required.
- **Vendor Response** (column): Displays the required Vendor Response column for supplier answers. Affects: Defines the vendor-response data captured during technical evaluation.. Leads to: stays here. Check: Verify that the Vendor Response heading is visible and marked required.

## Test cases written from the create-technical-template screen

- GEN-SCR-084: Items 0 opens line-item management. Steps: Click "Items 0". Expected: The Manage Line Items section opens. The screen indicates that line items must be added before continuing. [plan: full]
- GEN-SCR-085: Save as draft is disabled without line items. Steps: Confirm that "Save as draft" cannot be clicked. Hover over "Save as draft". Expected: "Save as draft" remains disabled. A tooltip shows "Please add line items". [plan: full]
- GEN-SCR-086: Blacklisted and TNA vendors cannot be selected. Steps: Click "Participants". Open "Search vendors you want to add". View the blacklisted vendor and the TNA vendor in the results. Expected: The blacklisted vendor is disabled and marked "Blocked". The TNA vendor is disabled and marked "TNA". Neither vendor can be selected. [plan: partial]
