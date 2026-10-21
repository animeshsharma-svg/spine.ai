# Screen: events-drafts (/orders)

Captured 2026-10-20 on company 198678. 7 controls, 7 with a known effect, 5 test cases written from it.

## How to reach the events-drafts screen

Plan steps: open_events_list → expect_events_list → filter_events {"tab":"History"} → filter_events {"tab":"Drafts"}. Path: `/orders`.

## What each control on events-drafts does

- **Ask Clara** (button): Clicking it opens the Clara assistant. Affects: Nothing in the event data changes.. Leads to: Clara assistant drawer. Check: Click Ask Clara and verify that the assistant drawer opens without changing the drafts list.
- **Create Event M** (button): Clicking it opens the event-creation screen. Affects: Nothing is added to the event records until the buyer completes and saves or publishes the event.. Leads to: Create event screen. Check: Click Create Event M and verify that the event-creation screen is displayed.
- **Live 8583** (tab): Clicking it switches the list to live events. Affects: The visible event list changes from drafts to live events.. Leads to: Live events view. Check: Click Live 8583 and verify that live events are shown and the Live tab is selected.
- **History 2035** (tab): Clicking it switches the list to historical events. Affects: The visible event list changes from drafts to historical events.. Leads to: History view. Check: Click History 2035 and verify that historical events are shown and the History tab is selected.
- **Drafts 183** (tab): It keeps the buyer on the drafts view. Affects: The visible event list is filtered to draft events and no event data is modified.. Leads to: stays here. Check: Verify that Drafts 183 is selected and only draft events are displayed.
- **Recurring** (tab): Clicking it switches the list to recurring events. Affects: The visible event list changes from drafts to recurring events.. Leads to: Recurring events view. Check: Click Recurring and verify that recurring events are shown and the Recurring tab is selected.
- **Search Title** (field): Entering text filters the displayed events by title. Affects: Only matching event records remain visible in the current drafts list; event data is not changed.. Leads to: stays here. Check: Enter a known draft title and verify that matching titles remain while nonmatching titles are hidden.

## Test cases written from the events-drafts screen

- GEN-SCR-065: Ask Clara opens the assistant. Steps: Click Ask Clara. Expected: The Clara assistant opens. [plan: partial]
- GEN-SCR-066: Live 8583 shows live events. Steps: Click Live 8583. Expected: Live 8583 becomes selected and the list shows live events instead of drafts. [plan: partial]
- GEN-SCR-067: History 2035 shows historical events. Steps: Click History 2035. Expected: History 2035 becomes selected and the list shows historical events instead of drafts. [plan: partial]
- GEN-SCR-068: Recurring shows recurring events. Steps: Click Recurring. Expected: Recurring becomes selected and the recurring-events list opens. [plan: partial]
- GEN-SCR-069: Search Title filters draft events. Steps: Enter Alpha in Search Title. Expected: Only matching draft events remain visible in the list. Non-matching drafts are hidden. [plan: partial]
