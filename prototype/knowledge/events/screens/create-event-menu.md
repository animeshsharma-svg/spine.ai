# Screen: create-event-menu (/orders)

Captured 2026-10-20 on company 198678. 12 controls, 12 with a known effect, 3 test cases written from it.

## How to reach the create-event-menu screen

Plan steps: open_events_list → expect_events_list → filter_events {"tab":"History"} → filter_events {"tab":"Drafts"} → filter_events {"tab":"Recurring"} → filter_events {"tab":"Live"} → expect_create_options. Path: `/orders`.

## What each control on create-event-menu does

- **Ask Clara** (button): Opens the Clara assistant. Affects: nothing. Leads to: Clara assistant drawer. Check: Click Ask Clara and verify that the assistant drawer opens.
- **Create Event M** (button): Opens the event-creation options. Affects: nothing until an event type is selected. Leads to: event-creation options menu. Check: Click Create Event M and verify that the available event-creation options appear.
- **Live 8583** (tab): Shows the live events list. Affects: the displayed event records are filtered to live events. Leads to: live events list. Check: Verify that Live 8583 is selected and live events are displayed.
- **History 2035** (tab): Shows the event history. Affects: the displayed event records are changed to historical events. Leads to: history events list. Check: Click History 2035 and verify that historical events are displayed.
- **Drafts 183** (tab): Shows draft events. Affects: the displayed event records are filtered to drafts. Leads to: draft events list. Check: Click Drafts 183 and verify that draft events are displayed.
- **Recurring** (tab): Shows recurring events. Affects: the displayed event records are filtered to recurring events. Leads to: recurring events list. Check: Click Recurring and verify that the recurring-events view is displayed.
- **Single Stage Source through RFP / RFQ / Auction** (menuitem): Starts creation of a single-stage source event through an RFP, RFQ, or auction. Affects: creates or begins a single-stage event flow rather than a multi-stage eRFX project. Leads to: single-stage event creation screen. Check: Select the option and verify that the single-stage event-creation screen opens.
- **eRFX Project Manage sourcing via a project approach** (menuitem): Starts creation of an eRFX sourcing project. Affects: begins the multi-stage project-creation flow and enables project-based sourcing configuration. Leads to: eRFX project creation screen. Check: Select the option and verify that the eRFX project-creation screen opens.
- **BOQ based RFX Project Source BOQ via a project approach** (menuitem): Starts creation of a BOQ-based RFX project. Affects: begins the BOQ project flow and enables BOQ-based sourcing configuration. Leads to: BOQ project creation screen. Check: Select the option and verify that the BOQ project-creation screen opens.
- **Search Title** (field): Accepts a title search term when enabled. Affects: filters the displayed event records by title. Leads to: stays here. Check: Enter a title and verify that the displayed events are filtered by that title.
- **Starting from** (field, disabled): Cannot be edited because it is disabled. Affects: nothing. Leads to: stays here. Check: Try to enter a start date and verify that the field remains disabled and unchanged.
- **Ending at** (field, disabled): Cannot be edited because it is disabled. Affects: nothing. Leads to: stays here. Check: Try to enter an end date and verify that the field remains disabled and unchanged.

## Test cases written from the create-event-menu screen

- GEN-SCR-071: Project creation options open their corresponding project flows. Steps: Click "Create Event M". Click "eRFX Project Manage sourcing via a project approach". Confirm that the project creation screen opens. Return to /orders. Click "Create Event M". Click "BOQ based RFX Project Source BOQ via a project approach". Expected: The eRFX option opens the project creation screen. The BOQ option opens the BOQ-based project creation flow. [plan: partial]
- GEN-SCR-072: Event list tabs switch the displayed event set. Steps: Click "History 2035". Click "Drafts 183". Click "Recurring". Click "Live 8583". Expected: Each clicked tab becomes selected and its corresponding event list view is displayed. "Live 8583" is selected again at the end. [plan: partial]
- GEN-SCR-073: Search Title filters the event list. Steps: Click "Search Title". Enter a distinctive part of the identified event title. Wait for the list to refresh. Expected: The list shows matching event titles and excludes events that do not match the entered text. [plan: partial]
