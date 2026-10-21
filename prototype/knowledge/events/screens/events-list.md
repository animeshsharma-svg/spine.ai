# Screen: events-list (/orders)

Captured 2026-10-20 on company 198678. 9 controls, 9 with a known effect, 9 test cases written from it.

## How to reach the events-list screen

Plan steps: open_events_list → expect_events_list. Path: `/orders`.

## What each control on events-list does

- **Ask Clara** (button): Opens the Clara assistant. Affects: Nothing in the event records or list state.. Leads to: Clara assistant drawer.. Check: Click Ask Clara and verify that the assistant drawer opens.
- **Create Event M** (button): Starts creating a new event using the configured creation route. Affects: Begins a new event-creation flow without changing an existing event.. Leads to: Event creation screen.. Rule R-FLA-009-2. Check: Click Create Event and verify that the event creation screen opens.
- **Live 8583** (tab): Selects the Live events view. Affects: Changes the list query to live events and updates the tab URL state.. Leads to: Live events list.. Rule R-FLA-002-4. Check: Click Live and verify that the URL uses `tab=live` and live events are shown.
- **History 2035** (tab): Selects the History events view. Affects: Changes the list query to historical events and updates the tab URL state.. Leads to: History events list.. Rule R-FLA-002-4. Check: Click History and verify that the URL uses `tab=history` and historical events load.
- **Drafts 183** (tab): Selects the Drafts events view. Affects: Changes the list query to draft events and updates the tab URL state.. Leads to: Drafts events list.. Rule R-FLA-002-4. Check: Click Drafts and verify that the URL uses `tab=draft` and draft events load.
- **Recurring** (tab): Selects the Recurring events view. Affects: Changes the list query to recurring events and updates the tab URL state.. Leads to: Recurring events list.. Rule R-FLA-002-4. Check: Click Recurring and verify that the URL uses `tab=recurring` and recurring events load.
- **Search Title** (field): Accepts title search text to filter the displayed events. Affects: Changes the list filters used to retrieve or display matching event records.. Leads to: Stays here.. Rule R-FLA-013-1. Check: Enter a distinctive title and verify that only matching events remain or a no-result state appears.
- **Starting from** (field, disabled): Is disabled; the user cannot interact with it. Affects: nothing. Leads to: stays here. Check: Verify the field is visually disabled and cannot receive focus or input.
- **Ending at** (field, disabled): Is disabled; the user cannot interact with it. Affects: nothing. Leads to: stays here. Check: Verify the field is visually disabled and cannot receive focus or input.

## Test cases written from the events-list screen

- GEN-SCR-048: Invalid tab query parameter falls back to Live tab. Steps: Observe which tab is selected. Expected: The Live tab ("Live 8583") is selected, confirming the invalid value was replaced by `live`. [plan: full]
- GEN-SCR-049: Empty Live tab without filters repeats the Create Event button. Steps: Navigate to the Live tab. Verify the screen shows the "Create Event M" button. Expected: The "Create Event M" button appears in the empty‑state area (repeated as per design). [plan: full]
- GEN-SCR-050: History and Drafts badges are not displayed. Steps: Look for badge elements next to the tab labels. Expected: No badge with a number is shown on either the History or Drafts tabs. [plan: none]
- GEN-SCR-051: Clicking "Ask Clara" opens the AI assistance modal. Steps: Click the "Ask Clara" button. Expected: A modal dialog titled "Ask Clara" appears, allowing the user to type a question. [plan: full]
- GEN-SCR-055: History events use date grouping and show no badge counts. Steps: Select History 2035. Review the event list. Expected: History cards are grouped under date headers formatted as application dates. No separate History badge count is shown. [plan: partial]
- GEN-SCR-056: Drafts and Recurring tabs show their correct empty states. Steps: Select Drafts 183. Review the empty state. Select Recurring. Review the empty state. Expected: Drafts shows "No Drafts Found". Recurring shows "No Recurring Events Found". [plan: full]
- GEN-SCR-057: Search Title placeholder includes reference ID when configured. Steps: Open the events list. Inspect Search Title before entering text. Expected: Search Title includes the text "or reference id" in its placeholder. [plan: none]
- GEN-SCR-058: Date range fields remain unavailable on the current screen. Steps: Try to focus Starting from. Try to focus Ending at. Try to enter a date in each field. Expected: Both fields remain disabled, cannot receive input, and do not change value. [plan: partial]
- GEN-SCR-059: Header actions open their intended destinations. Steps: Select Ask Clara. Verify that the Clara interface opens. Return to the events list. Select Create Event M. Expected: Ask Clara opens the Clara interface. Create Event M opens the event-creation screen. [plan: partial]
