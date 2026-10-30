# Screen: events-history (/orders)

Captured 2026-10-21 on company 198678. 10 controls, 10 with a known effect, 9 test cases written from it.

## How to reach the events-history screen

Plan steps: open_events_list → expect_events_list → filter_events {"tab":"History"}. Path: `/orders`.

## What each control on events-history does

- **Ask Clara** (button): Opens the Clara assistant. Affects: Nothing in the event data or workflow.. Leads to: Clara assistant drawer. Check: Click Ask Clara and verify that the Clara assistant opens without changing the selected tab.
- **Export** (button): Exports the events list using the currently selected custom filter. Affects: The export request excludes the search text and stage filter from its filters.. Leads to: Export download or export response. Rule R-FLA-008-2. Check: Apply a custom filter and search text, export the list, and verify that only the custom filter is included in the request.
- **Create Event M** (button): Starts creation of a new event. Affects: Creates a new event-creation flow without changing an existing event record.. Leads to: Event creation screen. Rule R-FLA-009-2. Check: Click Create Event M and verify that the configured old or quick event-creation route opens.
- **Live 8641** (tab): Switches the list to Live events. Affects: Changes the active list tab and causes the live-events request and live event flow to be used.. Leads to: Live events list. Rule R-FLA-002-4. Check: Click Live and verify that the URL contains `?tab=live` and the table scrolls to the top.
- **History 2036** (tab): Keeps or switches the list to History events. Affects: Changes the active list tab to history and uses the history request with cursor-based pagination.. Leads to: History events list. Rule R-FLA-013-1. Check: Verify that History is selected, the URL contains `?tab=history`, and history records load.
- **Drafts 185** (tab): Switches the list to Draft events. Affects: Changes the active list tab to drafts and applies the draft-list empty-state and event flow.. Leads to: Drafts list. Rule R-FLA-002-4. Check: Click Drafts and verify that the URL contains `?tab=draft` and draft events are displayed.
- **Recurring** (tab): Switches the list to recurring events. Affects: Changes the active list tab to recurring and applies recurring-event listing and empty-state behavior.. Leads to: Recurring events list. Rule R-FLA-002-1. Check: Click Recurring and verify that the URL contains `?tab=recurring` and recurring events are displayed.
- **Search Title** (field): Filters the event list by the entered title or reference text after the search is debounced. Affects: Writes the trimmed value to the search query and sends it as `filters.title` on every tab.. Leads to: Filtered events list. Check: Enter a title, wait at least one second, and verify that the URL and list request contain the trimmed search value.
- **Starting from** (field, disabled): Does not accept input because the Starting from field is disabled. Affects: Nothing in the event data or list filters.. Leads to: stays here. Check: Click or type in Starting from and verify that no value is entered and no request is sent.
- **Ending at** (field, disabled): Does not accept input because the Ending at field is disabled. Affects: Nothing in the event data or list filters.. Leads to: stays here. Check: Click or type in Ending at and verify that no value is entered and no request is sent.

## Test cases written from the events-history screen

- GEN-SCR-060: Open Ask Clara from event history. Steps: Click "Ask Clara". Expected: An Ask Clara assistant panel or screen opens without leaving the events area. [plan: full]
- GEN-SCR-061: Open the event export flow. Steps: Click "Export". Expected: An export dialog, menu, or download flow opens for the historical events. [plan: full]
- GEN-SCR-062: Switch between event status tabs. Steps: Click "Live 8583". Click "Drafts 183". Click "Recurring". Click "History 2035". Expected: Each clicked tab becomes selected and displays its corresponding event view. "History 2035" is selected at the end. [plan: partial]
- GEN-SCR-063: Search history with no matching title. Steps: Enter a unique string that is not the title of any historical event in "Search Title". Expected: The history list shows no matching events and displays the screen's empty-results state. [plan: full]
- GEN-SCR-064: Verify date fields are unavailable on history. Steps: Click "Starting from". Try to enter a date. Click "Ending at". Try to enter a date. Expected: "Starting from" and "Ending at" remain disabled, do not accept focus or input, and do not change the event list. [plan: partial]
- GEN-SCR-296: Date fields enable on the Live tab. Steps: Verify that "Starting from" is disabled. Verify that "Ending at" is disabled. Select "Live 8641". Expected: "Starting from" and "Ending at" become enabled on the Live tab. [plan: full]
- GEN-SCR-297: Export excludes the title search from filters. Steps: Enter `completed` in "Search Title". Select "Export". Inspect the export request. Expected: The export request is sent with the custom filter value only. The search text `completed` and any stage filter are not included in `filters`. [plan: partial]
- GEN-SCR-298: History search with no matches shows the filtered empty state. Steps: Select "History 2036". Enter `ZZZ-no-match-987` in "Search Title". Wait for the search results to refresh. Expected: The list shows the filtered "no result" copy instead of event cards. [plan: full]
- GEN-SCR-299: Empty Drafts tab shows its specific empty state. Steps: Select "Drafts 185". Expected: The page shows "No Drafts Found". [plan: full]
