# Screen: create-stages-rfp-rfq (/orders/quick-create)

Captured 2026-10-20 on company 198678. 21 controls, 20 with a known effect, 4 test cases written from it.

## How to reach the create-stages-rfp-rfq screen

Plan steps: open_create {"path":"erfx"} → set_title → compose_stages {"stages":["rfp","rfq"]}. Path: `/orders/quick-create`.
Headings on it: Vendor Assessment.
It shows: Line Items are not added, please add them in Manage Line Items section.

## What each control on create-stages-rfp-rfq does

- **Ask Clara** (button): Clicking it opens Clara to help generate or manage RFP questions. Affects: It can generate technical-stage questions only when the event has line items.. Leads to: Clara assistant drawer.. Rule R-FCR-042-4. Check: With at least one line item, verify that clicking the button opens Clara and starts the RFP-question request.
- **Add Attachments** (button): Clicking it opens the attachment picker. Affects: It adds selected files to the event configuration.. Leads to: Attachment dialog or drawer.. Check: Select a file and verify that it appears as an attachment on the event.
- **Add T&Cs** (button): Clicking it opens the terms-and-conditions editor. Affects: It changes the event's terms and conditions, which are later submitted with the event.. Leads to: Terms-and-conditions drawer or dialog.. Rule R-FCR-039-3. Check: Enter terms, save them, and verify that the terms remain attached to the event.
- **Items 0** (button): Clicking it opens the line-item management view. Affects: It allows the event's line-item records to be added or edited.. Leads to: Manage Line Items drawer or screen.. Check: Verify that the line-item manager opens and that the count changes after adding an item.
- **Publish** (button): Clicking it validates the event and publishes it when all required data is present. Affects: It changes the event from creation data to a published event and starts the configured sourcing flow.. Leads to: Published event state or the event details screen.. Rule R-FCR-013-1. Check: Complete all required fields and verify that clicking Publish creates the event or shows the relevant validation error.
- **Technical Stage** (button): Clicking it opens the Technical Stage configuration or strategy view. Affects: It changes the selected technical-stage configuration, including its stage settings and potentially its title.. Leads to: Technical Stage strategy drawer.. Rule R-FCR-012-2. Check: Click the control and verify that the technical-stage configuration drawer opens.
- **Select Templates** (button, disabled): It is disabled and cannot be used to select a template. Affects: It prevents template selection until the required line-item or stage-template conditions are met.. Leads to: stays here. Rule R-FCR-016-2. Check: Hover over the disabled control and verify that the tooltip explains that a template or line item is required.
- **Add Evaluator** (button): Clicking it opens evaluator selection. Affects: It assigns an evaluator to the technical stage or its line-item sections.. Leads to: Evaluator selection drawer or dialog.. Rule R-FCR-041-4. Check: Select an evaluator and verify that the evaluator is displayed on the technical stage.
- **Participants** (button): Clicking it opens participant management. Affects: It changes the event's invited vendor or participant records.. Leads to: Participants drawer or screen.. Rule R-FCR-017-1. Check: Add a vendor and verify that the vendor appears in the participant list.
- **Terms & Conditions** (button): Clicking it opens the terms-and-conditions settings. Affects: It changes the event's terms and conditions, including payment terms when applicable.. Leads to: Terms-and-conditions drawer or dialog.. Rule R-FCR-039-3. Check: Save terms and verify that they are shown when the drawer is reopened.
- **Now - 01:09 am, 21st Oct ( 30 Mins )** (button): Clicking it opens the event schedule editor. Affects: It changes the stage start time, end time, duration, or recurrence settings.. Leads to: Schedule drawer or popover.. Rule R-FCR-022-7. Check: Change the duration and verify that the displayed event timing updates.
- **Technical Stage** (tab): Selecting it displays the Technical Stage configuration and keeps it marked as the active stage. Affects: It changes only the currently viewed stage, not the event records.. Leads to: stays here. Rule R-FLA-016-2. Check: Verify that the Technical Stage tab is highlighted and its fields are visible.
- **RFQ** (tab): Selecting it switches the builder to the RFQ stage. Affects: It changes the active stage being configured without changing the other stage's saved data.. Leads to: RFQ stage view.. Rule R-FLA-016-2. Check: Click RFQ and verify that the RFQ configuration fields replace the technical-stage fields.
- **Events** (link): Clicking it navigates to the events list. Affects: nothing. Leads to: Events screen.. Check: Click the link and verify that the events listing page opens.
- **Enter the title of the project** (field): Entering text in it updates the project title. Affects: It changes the event group's title used during draft saving and publishing.. Leads to: stays here. Rule R-FCR-013-1. Check: Enter a title and verify that the value remains in the field and is used in the publish validation.
- **Search vendors you want to add** (select): Typing in it searches for vendors and selecting a result adds that vendor as a participant. Affects: It changes the event's participant or audience-company records.. Leads to: Vendor search results or the participant list.. Rule R-FCR-035-3. Check: Search for an eligible vendor, select it, and verify that it appears as a participant while blocked vendors cannot be selected.
- **#** (column): Clicking the column header does not perform an action. Affects: nothing. Leads to: stays here. Check: Click the # header and verify that no navigation, sorting, or dialog occurs.
- **Specification** (column): Clicking the column header does not perform an action. Affects: nothing. Leads to: stays here. Check: Verify that the Specification header is displayed as a required column and that clicking it causes no navigation.
- **Description** (column): Clicking the column header does not perform an action. Affects: nothing. Leads to: stays here. Check: Verify that the Description header is displayed as a required column and that clicking it causes no navigation.
- **Vendor Response** (column): Clicking the column header does not perform an action. Affects: nothing. Leads to: stays here. Check: Verify that the Vendor Response header is displayed as a required column and that clicking it causes no navigation.

Not yet described: "Save as draft".

## Test cases written from the create-stages-rfp-rfq screen

- GEN-SCR-080: Select Templates is blocked until a line item is added. Steps: Hover over "Select Templates". Click "Items 0" and add one line item. Return to the Vendor Assessment screen. Hover over "Select Templates". Expected: Before a line item is added, "Select Templates" is disabled and shows the tooltip "Please add line items". After a line item is added, the control is enabled or its disabled tooltip is no longer shown. [plan: full]
- GEN-SCR-081: Publish reports missing payment terms. Steps: Click "Publish". Expected: The event is not published. The message "Payment Terms and Conditions are mandatory" appears. [plan: partial]
- GEN-SCR-082: Publish opens the event confirmation dialog. Steps: Click "Publish". Expected: A confirmation dialog opens with the title "Publish Event" and an action labeled "Publish". The event has not yet been created. [plan: partial]
- GEN-SCR-083: Add Attachments opens the attachment interface. Steps: Click "Add Attachments". Expected: The attachment interface opens, allowing the tester to select or add an attachment. The Vendor Assessment screen remains available after closing the interface. [plan: partial]
