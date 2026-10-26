# Screen: events-drafts (/orders)

Captured 2026-10-21 on company 198678. 7 controls, 7 with a known effect, 8 test cases written from it.

## How to reach the events-drafts screen

Plan steps: open_events_list → expect_events_list → filter_events {"tab":"History"} → filter_events {"tab":"Drafts"}. Path: `/orders`.

## What each control on events-drafts does

- **Ask Clara** (button): Opens Clara's assistant. Affects: nothing in the event data.. Leads to: Clara assistant drawer. Check: Click Ask Clara and verify that the assistant drawer opens without changing the event list.
- **Create Event M** (button): Starts creating a new event. Affects: the new event creation flow and its eventual event record.. Leads to: event creation screen or the configured legacy creation route. Rule R-FLA-009-2. Check: Click Create Event and verify that an event creation screen opens using the route selected by the dashboard configuration.
- **Live 8641** (tab): Selects the Live events tab. Affects: the active tab and the live-events list data loaded for the event list.. Leads to: Live tab with the table scrolled to the top. Rule R-FLA-002-4. Check: Click Live and verify that the URL contains `?tab=live` and live events are loaded.
- **History 2036** (tab): Selects the History events tab. Affects: the active tab and the paged history-events data loaded for the event list.. Leads to: History tab with the table scrolled to the top. Rule R-FLA-003-3. Check: Click History and verify that the URL contains `?tab=history` and history data is requested.
- **Drafts 185** (tab): Selects the Drafts events tab. Affects: the active tab and the draft-events data loaded for the event list.. Leads to: Drafts tab with the table scrolled to the top. Rule R-FLA-003-3. Check: Verify that Drafts is selected, the URL contains `?tab=draft`, and draft data is requested.
- **Recurring** (tab): Selects the Recurring events tab. Affects: the active tab and the scheduled recurring-events data loaded for the event list.. Leads to: Recurring tab with the table scrolled to the top. Rule R-FLA-003-3. Check: Click Recurring and verify that the URL contains `?tab=recurring` and scheduled-event data is requested.
- **Search Title** (field): Filters the current event list by the entered title text. Affects: the current tab's list filter and the matching event results.. Leads to: stays here. Check: Enter a title and verify that only matching results remain in the current list.

## Test cases written from the events-drafts screen

- GEN-SCR-065: Ask Clara opens the assistant. Steps: Click Ask Clara. Expected: The Clara assistant opens. [plan: full]
- GEN-SCR-066: Live 8583 shows live events. Steps: Click Live 8583. Expected: Live 8583 becomes selected and the list shows live events instead of drafts. [plan: full]
- GEN-SCR-067: History 2035 shows historical events. Steps: Click History 2035. Expected: History 2035 becomes selected and the list shows historical events instead of drafts. [plan: full]
- GEN-SCR-068: Recurring shows recurring events. Steps: Click Recurring. Expected: Recurring becomes selected and the recurring-events list opens. [plan: full]
- GEN-SCR-069: Search Title filters draft events. Steps: Enter Alpha in Search Title. Expected: Only matching draft events remain visible in the list. Non-matching drafts are hidden. [plan: partial]
- GEN-SCR-300: Draft entry opens the restricted draft creation screen. Steps: Select the draft stage entry. Inspect the opened creation screen and its URL or state. Expected: The creation screen opens with the draft stage IDs, project creation context, project ID, title, and RFQ-to-auction state. Editing is not allowed (`isEditingAllowed=false`). [plan: partial]
- GEN-SCR-301: Draft cards are grouped by formatted date. Steps: Select Drafts 185. Wait for the list to load. Expected: Draft cards are grouped beneath date headers. Each header uses the application's `appFormatDate(date, DATE)` format, and drafts from the same date share one header. [plan: none]
- GEN-SCR-302: Create Event M opens the configured creation flow. Steps: Select Create Event M. Wait for navigation to complete. Expected: With `rfx_project_enabled` off and `old_creation_flow_config=show_old_flow`, the old auction create route opens. With any other configuration, the quick-create route opens. [plan: partial]
