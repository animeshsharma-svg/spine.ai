# Screen: create-single-stage (/orders/quick-create)

Captured 2026-10-20 on company 198678. 10 controls, 5 with a known effect, 5 test cases written from it.

## How to reach the create-single-stage screen

Plan steps: open_create {"path":"single-stage"}. Path: `/orders/quick-create`.

## What each control on create-single-stage does

- **Ask Clara** (button): Opens the Clara assistance interface for generating or helping configure the RFP. Affects: May create or populate RFP questions, subject to the event having project line items.. Leads to: Clara panel or drawer. Rule R-FCR-042-4. Check: Click Ask Clara and verify that the Clara interface opens or the required line-item message appears.
- **RFP** (button): Selects the RFP event type. Affects: Changes the event mode and the fields and configuration available for this event.. Leads to: Stays here. Check: Click RFP and verify that the event is configured as an RFP.
- **Participants** (button): Opens the participant management interface. Affects: Changes the event's vendor audience when participants are added or removed.. Leads to: Participants drawer or screen. Check: Click Participants and verify that vendor participants can be managed.
- **Events** (link): Navigates back to the Events area. Affects: Nothing in the event data.. Leads to: Events screen. Check: Click Events and verify that the Events screen loads.
- **Enter the title of this event** (field): Accepts the title of the event. Affects: Updates the event title and supplies the title value used during validation and creation.. Leads to: Stays here. Rule R-FCR-025-1. Check: Enter a title and verify that the field retains it and that the title error is cleared.

Not yet described: "Select Templates", "Terms & Conditions", "Now - 01:23 am, 21st Oct ( 30 Mins )", "Publish Event", "Search vendors you want to add".

## Test cases written from the create-single-stage screen

- GEN-SCR-108: RFP opens the RFP event setup. Steps: Click "RFP". Expected: The RFP event setup opens or the current event type changes to RFP. No unrelated page is opened. [plan: full]
- GEN-SCR-109: Events returns to the events list. Steps: Click "Events". Expected: The events list opens and the create-single-stage screen is left. [plan: full]
- GEN-SCR-110: Template selection explains why it is disabled. Steps: Hover over "Select Templates". Expected: The control remains disabled and its tooltip says "Please add line items". [plan: full]
- GEN-SCR-111: Terms and Conditions is unavailable before its prerequisite is met. Steps: Observe "Terms & Conditions". Attempt to click "Terms & Conditions". Expected: "Terms & Conditions" is visibly disabled and does not open a terms editor. [plan: full]
- GEN-SCR-112: Required event title remains empty when not provided. Steps: Click "Enter the title of this event". Leave the field empty. Observe "Publish Event". Expected: "Publish Event" remains disabled while the title is empty. The event is not published. [plan: full]
