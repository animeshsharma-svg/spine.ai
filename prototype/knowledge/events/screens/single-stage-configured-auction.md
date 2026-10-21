# Screen: single-stage-configured-auction (/orders/quick-create)

Captured 2026-10-20 on company 198678. 11 controls, 9 with a known effect, 4 test cases written from it.

## How to reach the single-stage-configured-auction screen

Plan steps: open_create {"path":"single-stage"} → configure_single_stage {"eventType":"auction","auctionSubtype":"rank","awarding":"lot"}. Path: `/orders/quick-create`.

## What each control on single-stage-configured-auction does

- **Ask Clara** (button): Opens the Ask Clara assistant or summary panel. Affects: Nothing is changed unless the assistant action is submitted.. Leads to: Ask Clara panel. Rule R-FCR-042-4. Check: Click the button and verify that the Clara panel appears.
- **Rank on lot** (button): Selects or configures ranking by lot. Affects: Changes the event's ranking or award strategy for lot-based comparison.. Leads to: stays here. Rule R-FCR-033-1. Check: Click the button and verify that the lot-ranking configuration is selected or opened.
- **Select Templates** (button): Opens template selection for the event. Affects: Changes the event template and may reset existing configured data when a different template is confirmed.. Leads to: Template selection drawer or dialog. Rule R-FCR-026-4. Check: Click the button and verify that available templates are shown.
- **Participants** (button): Opens participant management. Affects: Adds or removes vendors invited to the event.. Leads to: Participants drawer or dialog. Rule R-FCR-017-1. Check: Click the button and verify that participant management is displayed.
- **Terms & Conditions** (button, disabled): Does nothing because the Terms & Conditions button is disabled. Affects: Nothing; payment terms and conditions cannot be edited from this control while disabled.. Leads to: stays here. Rule R-FCR-039-3. Check: Verify that clicking the disabled button does not open a terms editor.
- **Now - 01:23 am, 21st Oct ( 30 Mins )** (button, disabled): Does nothing because the schedule control is disabled. Affects: Nothing; the displayed start and duration remain unchanged.. Leads to: stays here. Rule R-FCR-024-1. Check: Verify that clicking the disabled schedule control does not open scheduling or change the displayed time.
- **Events** (link): Navigates to the Events area. Affects: Nothing in the current event data.. Leads to: Events list. Check: Click the link and verify that the Events screen opens.
- **Enter the title of this event** (field): Accepts or edits the event title. Affects: Updates the event or stage title used in the event creation payload and title validation.. Leads to: stays here. Rule R-FCR-025-1. Check: Enter a title and verify that the field value changes and is included when the event is saved or published.
- **Search vendors you want to add** (select, disabled): Does nothing because vendor search and selection are disabled. Affects: No vendors are added to the event's participant list.. Leads to: stays here. Rule R-FCR-035-3. Check: Verify that the disabled vendor selector cannot be opened or used to add a vendor.

Not yet described: "Savings", "Publish Event".

## Test cases written from the single-stage-configured-auction screen

- GEN-SCR-113: Publish is disabled until a template is selected. Steps: Hover over the disabled "Publish Event". Read the tooltip. Select "Select Templates". Choose a template and save it. Return to the event screen. Expected: The tooltip says "Please select template for <stage title>" with the current stage title. After a template is selected, the template-related disabled reason is removed from "Publish Event". [plan: partial]
- GEN-SCR-114: Publishing without participants is refused. Steps: Select "Participants". Confirm that no participant is present. Close the participant view. Select "Publish Event". Expected: Publishing stops and the app shows "Please add participants to proceed!". [plan: partial]
- GEN-SCR-115: Participant search marks blocked and TNA vendors as unavailable. Steps: Select "Participants". Inspect the vendor search results. Expected: The blacklisted vendor is disabled and marked "Blocked". The TNA vendor is disabled and marked "TNA". [plan: partial]
- GEN-SCR-116: Disabled schedule and configuration controls show their current state. Steps: Inspect "Savings". Inspect "Terms & Conditions". Inspect "Now - 01:23 am, 21st Oct ( 30 Mins )". Inspect "Publish Event". Inspect "Search vendors you want to add". Expected: All five controls appear disabled. No disabled control opens or changes the event when selected. [plan: full]
