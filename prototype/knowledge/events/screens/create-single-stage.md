# Screen: create-single-stage (/orders/quick-create)

Captured 2026-10-21 on company 198678. 10 controls, 10 with a known effect, 9 test cases written from it.

## How to reach the create-single-stage screen

Plan steps: open_create {"path":"single-stage"}. Path: `/orders/quick-create`.

## What each control on create-single-stage does

- **Ask Clara** (button): Opens Clara's AI assistance for creating RFP content. Affects: May generate or update the event's RFP questions and related event data.. Leads to: Clara assistance panel. Rule R-FCR-042-4. Check: Click Ask Clara and verify that the Clara panel opens and an AI request can be started.
- **RFP** (button): Selects RFP as the event type. Affects: Changes the current event mode and the fields and validation used for the event.. Leads to: stays here. Check: Click RFP and verify that the event type is shown as RFP and the relevant RFP controls appear.
- **Select Templates** (button): Opens the template picker for selecting a template. Affects: Sets or changes the current stage's template, which supplies stage configuration and may unlock later actions.. Leads to: template picker. Check: Click Select Templates and verify that templates can be filtered and selected.
- **Participants** (button): Opens participant management for adding or removing event vendors. Affects: Changes the event's participant or audience records used when publishing and inviting vendors.. Leads to: participants drawer. Check: Click Participants and verify that the participant management drawer opens.
- **Terms & Conditions** (button, disabled): Does nothing because the control is disabled. Affects: nothing. Leads to: stays here. Check: Verify that Terms & Conditions is disabled and clicking it does not open a drawer or change the form.
- **Now - 04:48 pm, 21st Oct ( 30 Mins )** (button, disabled): Does nothing because the schedule control is disabled. Affects: nothing. Leads to: stays here. Check: Verify that the schedule button is disabled and clicking it does not open scheduling controls.
- **Publish Event** (button, disabled): Does nothing because publishing is disabled. Affects: nothing. Leads to: stays here. Check: Verify that Publish Event is disabled and clicking it does not create or publish an event.
- **Events** (link): Navigates back to the Events list. Affects: nothing. Leads to: Events list. Check: Click Events and verify that the events listing screen loads.
- **Enter the title of this event** (field): Accepts or edits the title of the event. Affects: Changes the event title stored in the draft and used during publish validation.. Leads to: stays here. Rule R-FCR-025-1. Check: Enter a title and verify that the field value changes and the title validation error clears.
- **Search vendors you want to add** (select, disabled): Does nothing because vendor search and selection are disabled. Affects: nothing. Leads to: stays here. Check: Verify that the vendor selector cannot be focused or used to select a vendor.

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
