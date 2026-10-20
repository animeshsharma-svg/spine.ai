# Screen: create-erfx (/orders/quick-create)

Captured 2026-10-20 on company 198678. 16 controls, 15 with a known effect, 6 test cases written from it.

## How to reach the create-erfx screen

Plan steps: open_create {"path":"erfx"}. Path: `/orders/quick-create`.

It shows: Please add line items in the manage line items section and choose a template to proceed!.

## What each control on create-erfx does

- **Ask Clara** (button): Opens the Ask Clara assistant. Affects: Nothing until Clara is used to generate or update event content.. Leads to: Ask Clara panel. Rule R-FCR-042-4. Check: Click Ask Clara and verify that the assistant panel opens.
- **Add Attachments** (button): Opens the interface for adding attachments. Affects: Adds attachment records to the event when files are selected.. Leads to: Attachments drawer or dialog. Check: Click Add Attachments and verify that a file-selection interface appears.
- **Add T&Cs** (button): Opens the terms and conditions editor. Affects: Changes the event's terms_and_conditions data when clauses or attachments are saved.. Leads to: Terms and conditions drawer or dialog. Rule R-FCR-008-3. Check: Click Add T&Cs and verify that the terms editor opens.
- **Items 0** (button): Opens the line-item manager showing zero items. Affects: Allows the event's line_items collection to be added, edited, or deleted.. Leads to: Manage line items drawer or dialog. Rule R-FCR-014-4. Check: Click Items 0 and verify that the manage line items interface opens with no items.
- **Save as draft** (button, disabled): Cannot save the event as a draft because the control is disabled. Affects: Nothing because no draft save request is made.. Leads to: stays here. Rule R-FCR-024-2. Check: Verify that clicking Save as draft produces no request or navigation and that the disabled state remains.
- **Publish** (button): Validates the project and publishes the event when the required title, template, line items, and participants are present. Affects: Creates or activates the event and advances it from creation toward the published event flow.. Leads to: Published event or project details screen. Rule R-FCR-019-2. Check: Complete the required fields, click Publish, and verify a successful event-creation result and navigation.
- **Rank on lot** (button): Opens or changes the auction setting for ranking bids by lot. Affects: Changes the auction's ranking or lot-based closing configuration.. Leads to: Auction configuration drawer or stays here. Rule R-FCR-009-1. Check: Click Rank on lot and verify that the lot-ranking setting changes or its configuration opens.
- **Select Templates** (button): Opens template selection for the event stage. Affects: Sets the stage template required to configure and proceed with the event.. Leads to: Template selection drawer. Rule R-FCR-026-4. Check: Click Select Templates and verify that available templates are displayed.
- **Participants** (button): Opens participant management. Affects: Changes the event's audience_company_uuids and therefore which vendors can participate.. Leads to: Participants drawer. Rule R-FCR-017-1. Check: Click Participants and verify that vendors can be added or removed.
- **Savings** (button, disabled): Button is disabled because savings can only be configured after a template with savings enabled is selected. Affects: nothing (disabled).. Leads to: stays here. Rule R-FCR-024-2. Check: Hover and confirm tooltip "Please choose a template and add a product".
- **Terms & Conditions** (button, disabled): Button is disabled because T&C editing requires a selected template and at least one line item. Affects: nothing (disabled).. Leads to: stays here. Rule R-FCR-024-2. Check: Hover and verify the same tooltip as other disabled footer buttons.
- **Auction** (tab): Keeps the Auction event-mode tab selected. Affects: The event remains in auction mode rather than switching to another event mode.. Leads to: stays here. Rule R-FCR-009-1. Check: Verify that Auction is highlighted and that its configuration content is displayed.
- **Events** (link): Navigates back to the Events area. Affects: Nothing in the current event data.. Leads to: Events screen. Check: Click Events and verify that the Events page loads.
- **Enter the title of the project** (field): Accepts and updates the project title. Affects: Changes the event group's title used in draft or publish payloads and validation.. Leads to: stays here. Rule R-FCR-013-1. Check: Enter a title and verify that the field value is retained.
- **Search vendors you want to add** (select, disabled): Cannot search for or add vendors because the vendor selector is disabled. Affects: No participant or audience_company_uuids record can be changed from this field.. Leads to: stays here. Rule R-FCR-017-1. Check: Verify that the selector cannot be focused or opened while disabled.

Not yet described: "Now - 01:09 am, 21st Oct ( 30 Mins )".

## Test cases written from the create-erfx screen

- GEN-SCR-074: Save as draft becomes enabled after adding a line item and selecting a template. Steps: Click button "Select Templates". Choose any template from the list. Click button "Items 0". Add a line item with a product and quantity. Observe the state of button "Save as draft". Expected: Button "Save as draft" is now enabled. Tooltip on the button is no longer shown. [plan: full]
- GEN-SCR-075: Publish button shows tooltip when no participants are added. Steps: Click button "Publish". Expected: A toast or modal appears with message "Please add participants to proceed!" and publishing is blocked. [plan: full]
- GEN-SCR-076: Attempt to publish with empty project title shows validation message. Steps: Click button "Publish". Expected: A validation toast appears with text "Please fill project title!" and the publish action is aborted. [plan: full]
- GEN-SCR-077: Changing the selected template prompts confirmation dialog. Steps: Click button "Select Templates". Choose a different template. Expected: A modal appears with message "Changing template will reset data. Are you sure?" and options "Yes" and "Cancel". [plan: partial]
- GEN-SCR-078: Publish with auction mode but no valid auction strategy shows error. Steps: Click button "Publish". Expected: A toast appears with message "Please select a valid auction strategy" and the project is not published. [plan: partial]
- GEN-SCR-079: Disabled "Now - 01:09 am, 21st Oct ( 30 Mins )" button shows tooltip until schedule is set. Steps: Hover over button "Now - 01:09 am, 21st Oct ( 30 Mins )". Expected: Button remains disabled and a tooltip appears with text "Please select template for <stage title>" or "Please add line items". [plan: partial]
