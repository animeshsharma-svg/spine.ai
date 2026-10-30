# Screen: events-recurring (/orders)

Captured 2026-10-21 on company 198678. 7 controls, 7 with a known effect, 2 test cases written from it.

## How to reach the events-recurring screen

Plan steps: open_events_list → expect_events_list → filter_events {"tab":"History"} → filter_events {"tab":"Drafts"} → filter_events {"tab":"Recurring"}. Path: `/orders`.

## What each control on events-recurring does

- **Ask Clara** (button): It opens the Clara assistant. Affects: It does not change the event's data or workflow.. Leads to: Clara assistant drawer. Check: Click Ask Clara and verify that the Clara assistant opens without changing the event list.
- **Create Event M** (button): It starts creating a new event. Affects: It begins a new event creation flow without changing an existing event record.. Leads to: Old auction creation or quick-create screen, depending on the creation-flow configuration. Rule R-FLA-009-2. Check: Click Create Event and verify that the configured event creation screen opens.
- **Live 8641** (tab): It selects the Live tab and loads live events. Affects: It changes the active tab to live and loads the live-events list, including its live polling flow.. Leads to: Live events list. Rule R-FLA-013-1. Check: Click Live and verify that the URL contains `?tab=live` and live event cards are shown.
- **History 2036** (tab): It selects the History tab and loads historical events. Affects: It changes the active tab to history and loads the paginated history records.. Leads to: History events list. Rule R-FLA-003-3. Check: Click History and verify that the URL contains `?tab=history` and historical event records load.
- **Drafts 185** (tab): It selects the Drafts tab and loads draft events. Affects: It changes the active tab to draft and loads draft event records.. Leads to: Drafts events list. Rule R-FLA-003-3. Check: Click Drafts and verify that the URL contains `?tab=draft` and draft records load.
- **Recurring** (tab): It selects the Recurring tab and loads recurring events. Affects: It changes the active tab to recurring and loads scheduled recurring event records.. Leads to: Recurring events list. Rule R-FLA-003-3. Check: Click Recurring and verify that the URL contains `?tab=recurring` and recurring event records load.
- **Search Title** (field): It filters the event list by the title text entered by the buyer. Affects: It changes the current list filter and limits the displayed recurring events to matching titles.. Leads to: Stays here. Check: Enter a title fragment and verify that only matching recurring event cards remain, or that the recurring empty state appears when none match.

## Test cases written from the events-recurring screen

- GEN-SCR-070: Show no results for an unmatched recurring-event title. Steps: Enter "ZZZ-no-matching-recurring-event-99999" in "Search Title". Wait for the list to update. Expected: No recurring events are listed for the unmatched title, and the screen shows its no-results or empty-list state. [plan: full]
- GEN-SCR-303: Recurring tab remains selected after loading recurring events. Steps: Click "Recurring". Expected: The "Recurring" tab remains visibly selected and recurring event cards are displayed. [plan: partial]
