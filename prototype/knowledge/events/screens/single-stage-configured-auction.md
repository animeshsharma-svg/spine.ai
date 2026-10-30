# Screen: single-stage-configured-auction (/orders/quick-create)

Captured 2026-10-21 on company 198678. 11 controls, 10 with a known effect, 7 test cases written from it.

## How to reach the single-stage-configured-auction screen

Plan steps: open_create {"path":"single-stage"} → configure_single_stage {"eventType":"auction","auctionSubtype":"rank","awarding":"lot"}. Path: `/orders/quick-create`.

## What each control on single-stage-configured-auction does

- **Ask Clara** (button): Clicking Ask Clara opens Clara for assistance with the event. Affects: nothing unless a Clara action is completed.. Leads to: Clara panel or dialog.. Check: Click Ask Clara and verify that the Clara interface opens.
- **Rank on lot** (button): Clicking Rank on lot selects lot-based ranking for the auction. Affects: The stage closing and ranking configuration used to compare bids.. Leads to: stays here.. Rule R-FCR-033-1. Check: Click Rank on lot and verify that lot-based ranking is selected.
- **Select Templates** (button): Clicking Select Templates opens the template picker. Affects: The stage's selected commercial template and the data derived from it.. Leads to: Template picker.. Check: Click Select Templates and verify that available templates are shown.
- **Participants** (button): Clicking Participants opens participant selection for the event. Affects: The event's invited vendor records.. Leads to: Participants drawer.. Check: Click Participants and verify that vendors can be viewed or selected.
- **Terms & Conditions** (button, disabled): Does nothing because the Terms & Conditions button is disabled. Affects: Nothing; payment terms and conditions cannot be edited from this control while disabled.. Leads to: stays here. Rule R-FCR-039-3. Check: Verify that clicking the disabled button does not open a terms editor.
- **Now - 04:48 pm, 21st Oct ( 30 Mins )** (button, disabled): The disabled schedule button shows the event's current start, end, and duration without allowing edits. Affects: nothing.. Leads to: stays here.. Rule R-FCR-024-1. Check: Verify that the button displays Now, the end time, and 30 Mins and cannot be opened.
- **Publish Event** (button, disabled): The disabled Publish Event button cannot submit the event. Affects: The event remains unpublished and no event record or invitations are created.. Leads to: stays here.. Rule R-FCR-016-2. Check: Verify that Publish Event is disabled and clicking it does not submit the event.
- **Events** (link): Clicking Events navigates to the events list. Affects: nothing.. Leads to: Events list.. Check: Click Events and verify that the events list loads.
- **Enter the title of this event** (field): Entering text in the title field sets the event title. Affects: The stage or project title used in validation and later event creation.. Leads to: stays here.. Rule R-FCR-025-1. Check: Enter a title and verify that the field contains it and the title error is cleared.
- **Search vendors you want to add** (select, disabled): Does nothing because vendor search and selection are disabled. Affects: No vendors are added to the event's participant list.. Leads to: stays here. Rule R-FCR-035-3. Check: Verify that the disabled vendor selector cannot be opened or used to add a vendor.

Not yet described: "Savings".

## Test cases written from the single-stage-configured-auction screen

- GEN-SCR-113: Publish is disabled until a template is selected. Steps: Hover over the disabled "Publish Event". Read the tooltip. Select "Select Templates". Choose a template and save it. Return to the event screen. Expected: The tooltip says "Please select template for <stage title>" with the current stage title. After a template is selected, the template-related disabled reason is removed from "Publish Event". [plan: partial]
- GEN-SCR-114: Publishing without participants is refused. Steps: Select "Participants". Confirm that no participant is present. Close the participant view. Select "Publish Event". Expected: Publishing stops and the app shows "Please add participants to proceed!". [plan: full]
- GEN-SCR-115: Participant search marks blocked and TNA vendors as unavailable. Steps: Select "Participants". Inspect the vendor search results. Expected: The blacklisted vendor is disabled and marked "Blocked". The TNA vendor is disabled and marked "TNA". [plan: partial]
- GEN-SCR-116: Disabled schedule and configuration controls show their current state. Steps: Inspect "Savings". Inspect "Terms & Conditions". Inspect "Now - 01:23 am, 21st Oct ( 30 Mins )". Inspect "Publish Event". Inspect "Search vendors you want to add". Expected: All five controls appear disabled. No disabled control opens or changes the event when selected. [plan: partial]
- GEN-SCR-368: Show the missing-template reason for disabled publishing. Steps: Hover over "Publish Event". Click "Select Templates". Return to the event configuration without selecting a template. Hover over "Publish Event" again. Expected: "Publish Event" remains disabled and its tooltip says "Please select template for <stage title>". [plan: full]
- GEN-SCR-369: Open Clara. Steps: Click "Ask Clara". Expected: The Clara panel opens and displays the event's available summary or assistance. [plan: partial]
- GEN-SCR-370: Verify disabled scheduling and publishing controls. Steps: Click "Savings". Click "Terms & Conditions". Click "Now - 04:48 pm, 21st Oct ( 30 Mins )". Click "Publish Event". Expected: None of the four controls responds or opens a new experience because each is disabled. [plan: full]
