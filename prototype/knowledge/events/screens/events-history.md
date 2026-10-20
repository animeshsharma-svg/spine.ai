# Screen: events-history (/orders)

Captured 2026-10-20 on company 198678. 10 controls, 10 with a known effect, 5 test cases written from it.

## How to reach the events-history screen

Plan steps: open_events_list → expect_events_list → filter_events {"tab":"History"}. Path: `/orders`.

## What each control on events-history does

- **Ask Clara** (button): Clicking Ask Clara opens the Clara assistant. Affects: Nothing in the event data.. Leads to: Clara assistant drawer or dialog. Check: Click Ask Clara and verify that the Clara assistant appears.
- **Export** (button): Clicking Export starts an export of the events shown in the history view. Affects: Creates an export from the currently displayed event records without changing the events.. Leads to: Download or export result while staying on this screen. Check: Click Export and verify that an export is generated or downloaded.
- **Create Event M** (button): Clicking Create Event M opens the event-creation screen. Affects: Starts the event-creation flow without publishing an event.. Leads to: Create-event screen. Check: Click Create Event M and verify that the create-event screen opens.
- **Live 8583** (tab): Clicking Live 8583 switches the list to live events. Affects: Changes the displayed event stage from history to live events.. Leads to: Live events list. Check: Click Live 8583 and verify that live events are displayed and the Live tab is selected.
- **History 2035** (tab): Clicking History 2035 keeps the history list selected. Affects: Selects the history event stage and displays historical events.. Leads to: History events list; stays here. Check: Verify that History remains selected and historical events are displayed.
- **Drafts 183** (tab): Clicking Drafts 183 switches the list to draft events. Affects: Changes the displayed event stage to drafts.. Leads to: Drafts list. Check: Click Drafts 183 and verify that draft events are displayed and the Drafts tab is selected.
- **Recurring** (tab): Clicking Recurring opens the recurring-events view. Affects: Changes the displayed event collection from history to recurring events.. Leads to: Recurring events screen. Check: Click Recurring and verify that the recurring-events view opens.
- **Search Title** (field): Entering text in Search Title filters the history list by event title. Affects: Changes which history event records are displayed without modifying their data.. Leads to: Filtered history list; stays here. Check: Enter a title fragment and verify that only matching history events remain visible.
- **Starting from** (field, disabled): The disabled Starting from field cannot be filled or activated. Affects: Nothing because the date filter is disabled.. Leads to: stays here. Check: Attempt to click or type in Starting from and verify that its value does not change.
- **Ending at** (field, disabled): The disabled Ending at field cannot be filled or activated. Affects: Nothing because the date filter is disabled.. Leads to: stays here. Check: Attempt to click or type in Ending at and verify that its value does not change.

## Test cases written from the events-history screen

- GEN-SCR-060: Open Ask Clara from event history. Steps: Click "Ask Clara". Expected: An Ask Clara assistant panel or screen opens without leaving the events area. [plan: partial]
- GEN-SCR-061: Open the event export flow. Steps: Click "Export". Expected: An export dialog, menu, or download flow opens for the historical events. [plan: partial]
- GEN-SCR-062: Switch between event status tabs. Steps: Click "Live 8583". Click "Drafts 183". Click "Recurring". Click "History 2035". Expected: Each clicked tab becomes selected and displays its corresponding event view. "History 2035" is selected at the end. [plan: partial]
- GEN-SCR-063: Search history with no matching title. Steps: Enter a unique string that is not the title of any historical event in "Search Title". Expected: The history list shows no matching events and displays the screen's empty-results state. [plan: full]
- GEN-SCR-064: Verify date fields are unavailable on history. Steps: Click "Starting from". Try to enter a date. Click "Ending at". Try to enter a date. Expected: "Starting from" and "Ending at" remain disabled, do not accept focus or input, and do not change the event list. [plan: partial]
