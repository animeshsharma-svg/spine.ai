# Screen: create-single-stage (/orders/quick-create)

Captured 2026-11-02 on company 198678. 10 controls, 9 with a known effect, 15 test cases written from it.

## How to reach the create-single-stage screen

Plan steps: open_create {"path":"single-stage"}. Path: `/orders/quick-create`.

## What each control on create-single-stage does

- **Ask Clara** (button): It opens Clara's AI RFP assistance flow. Affects: It may generate RFP questions after the project has line items.. Leads to: Clara's AI question panel. Rule R-FCR-042-4. Check: Click the button and verify the Clara panel opens and requests cannot run without project line items.
- **RFP** (button): It selects RFP as the event type. Affects: It changes the current event strategy to RFP.. Leads to: stays here. Check: Click it and verify RFP is shown as the selected event type.
- **Select Templates** (button): It opens the template picker. Affects: It lets the buyer select or change the template used by this stage.. Leads to: Template picker. Check: Click it and verify templates can be listed, filtered, and selected.
- **Participants** (button): It opens participant management. Affects: It changes the vendors included in the event audience.. Leads to: Participants drawer. Check: Click it and verify the participant drawer opens with vendor search or selection controls.
- **Terms & Conditions** (button, disabled): Does nothing because the control is disabled. Affects: nothing. Leads to: stays here. Check: Verify that Terms & Conditions is disabled and clicking it does not open a drawer or change the form.
- **Publish Event** (button, disabled): It is disabled, so clicking it does not publish the event. Affects: Nothing because the event remains unpublished.. Leads to: stays here. Check: Verify the button is disabled and no publish confirmation or success state appears when it is clicked.
- **Events** (link): It navigates to the Events page. Affects: Nothing in the current event's data or flow.. Leads to: Events screen. Check: Click the link and verify the Events listing screen opens.
- **Enter the title of this event** (field): It lets the buyer enter or edit the event title. Affects: It changes the event title stored for the event and used by later publishing.. Leads to: stays here. Rule R-FCR-025-1. Check: Enter a title and verify the field value changes and the title is included in the event data.
- **Search vendors you want to add** (select, disabled): Does nothing because vendor search and selection are disabled. Affects: nothing. Leads to: stays here. Check: Verify that the vendor selector cannot be focused or used to select a vendor.

Not yet described: "Now - 04:46 pm, 2nd Nov ( 30 Mins )".

## Test cases written from the create-single-stage screen

- GEN-SCR-108: RFP opens the RFP event setup. Steps: Click "RFP". Expected: The RFP event setup opens or the current event type changes to RFP. No unrelated page is opened. [plan: full]
- GEN-SCR-109: Events returns to the events list. Steps: Click "Events". Expected: The events list opens and the create-single-stage screen is left. [plan: full]
- GEN-SCR-110: Template selection explains why it is disabled. Steps: Hover over "Select Templates". Expected: The control remains disabled and its tooltip says "Please add line items". [plan: full]
- GEN-SCR-111: Terms and Conditions is unavailable before its prerequisite is met. Steps: Observe "Terms & Conditions". Attempt to click "Terms & Conditions". Expected: "Terms & Conditions" is visibly disabled and does not open a terms editor. [plan: full]
- GEN-SCR-112: Required event title remains empty when not provided. Steps: Click "Enter the title of this event". Leave the field empty. Observe "Publish Event". Expected: "Publish Event" remains disabled while the title is empty. The event is not published. [plan: full]
- GEN-SCR-364: Validate the required event title. Steps: Click "Enter the title of this event". Leave the field empty. Click outside the field. Expected: The field shows a red outline for the title error. [plan: partial]
- GEN-SCR-365: Accept a whitespace-only event title. Steps: Click "Enter the title of this event". Enter one or more spaces. Click outside the field. Expected: The title field does not show the empty-title validation state caused by a blank value. [plan: partial]
- GEN-SCR-366: Open participant selection. Steps: Click "Participants". Expected: The participant selection view opens. Vendor search and selection options are displayed there. [plan: full]
- GEN-SCR-367: Check disabled schedule and terms controls. Steps: Click "Terms & Conditions". Click "Now - 04:48 pm, 21st Oct ( 30 Mins )". Click "Publish Event". Expected: None of the three controls opens a dialog, changes the page, or performs an action. Each remains visibly disabled. [plan: full]
- GEN-SCR-424: RFP opens the RFP event creation flow. Steps: Log in to Procol (buyer side) with the buyer user Click "RFP" Expected: The screen changes to the RFP event creation flow. Record the fields and sections shown after selecting "RFP". [plan: full]
- GEN-SCR-425: Select Templates opens the template picker. Steps: Log in to Procol (buyer side) with the buyer user Click "Select Templates" Expected: The template picker opens and shows the available RFP templates. Record the list, filter, and selection controls displayed. [plan: partial]
- GEN-SCR-426: Ask Clara starts AI RFP generation when line items exist. Steps: Log in to Procol (buyer side) with the buyer user Click "Ask Clara" Expected: The AI RFP generation flow opens or starts loading questions for the project. Record the questions, loading state, or message shown after "Ask Clara" is clicked. [plan: full]
- GEN-SCR-427: Terms & Conditions is disabled on the initial screen. Steps: Log in to Procol (buyer side) with the buyer user Click "Terms & Conditions" Expected: Nothing opens and no terms editor is displayed because "Terms & Conditions" is disabled. The control remains visibly disabled. [plan: full]
- GEN-SCR-428: The event schedule control is disabled on the initial screen. Steps: Log in to Procol (buyer side) with the buyer user Click "Now - 04:46 pm, 2nd Nov ( 30 Mins )" Expected: No schedule popover or drawer opens because "Now - 04:46 pm, 2nd Nov ( 30 Mins )" is disabled. The displayed schedule value remains unchanged. [plan: full]
- GEN-SCR-429: Publish Event is disabled until the event setup is complete. Steps: Log in to Procol (buyer side) with the buyer user Click "Enter the title of this event" Type "Quarterly QA office supplies sourcing event" Click "Publish Event" Expected: The event is not published. "Publish Event" remains disabled and no success message or event confirmation appears. [plan: full]
