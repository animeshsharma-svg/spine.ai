# Screen: events-recurring (/orders)

Captured 2026-10-20 on company 198678. 7 controls, 7 with a known effect, 1 test cases written from it.

## How to reach the events-recurring screen

Plan steps: open_events_list → expect_events_list → filter_events {"tab":"History"} → filter_events {"tab":"Drafts"} → filter_events {"tab":"Recurring"}. Path: `/orders`.

## What each control on events-recurring does

- **Ask Clara** (button): Clicking “Ask Clara” opens the Clara assistant. Affects: nothing. Leads to: Clara assistant drawer. Check: Click “Ask Clara” and verify that the Clara assistant opens.
- **Create Event M** (button): Clicking “Create Event M” opens the event-creation flow. Affects: nothing until the buyer saves or publishes the event. Leads to: event creation screen. Check: Click the button and verify that the event-creation screen is displayed.
- **Live 8583** (tab): Clicking “Live 8583” switches to the live-events list. Affects: the event-list view by showing live events instead of recurring events. Leads to: Live events list. Check: Click the tab and verify that live events are listed and the Live tab is selected.
- **History 2035** (tab): Clicking “History 2035” switches to the historical-events list. Affects: the event-list view by showing historical events instead of recurring events. Leads to: History events list. Check: Click the tab and verify that historical events are listed and the History tab is selected.
- **Drafts 183** (tab): Clicking “Drafts 183” switches to the drafts list. Affects: the event-list view by showing draft events instead of recurring events. Leads to: Drafts list. Check: Click the tab and verify that draft events are listed and the Drafts tab is selected.
- **Recurring** (tab): Clicking the selected “Recurring” tab keeps the recurring-events list selected. Affects: nothing. Leads to: stays here. Check: Click the tab and verify that the Recurring tab remains selected and the recurring-events list stays visible.
- **Search Title** (field): Entering text in “Search Title” filters the displayed recurring events by title. Affects: the current list view only and does not change event records. Leads to: stays here. Check: Enter a title fragment and verify that only matching recurring events remain visible.

## Test cases written from the events-recurring screen

- GEN-SCR-070: Show no results for an unmatched recurring-event title. Steps: Enter "ZZZ-no-matching-recurring-event-99999" in "Search Title". Wait for the list to update. Expected: No recurring events are listed for the unmatched title, and the screen shows its no-results or empty-list state. [plan: full]
