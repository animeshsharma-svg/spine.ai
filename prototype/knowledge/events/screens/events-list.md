# Screen: events-list (/orders)

Captured 2026-10-21 on company 198678. 9 controls, 9 with a known effect, 14 test cases written from it.

## How to reach the events-list screen

Plan steps: open_events_list → expect_events_list. Path: `/orders`.

## What each control on events-list does

- **Ask Clara** (button): Opens the Clara assistant. Affects: Nothing in the event records or list state.. Leads to: Clara assistant drawer.. Check: Click Ask Clara and verify that the assistant drawer opens.
- **Create Event M** (button): It starts the configured event-creation flow. Affects: no event record until the buyer completes creation.. Leads to: event creation screen. Rule R-FLA-009-2. Check: Click Create Event and verify that the configured new-event screen opens.
- **Live 8641** (tab): It selects the Live events tab. Affects: the list query and URL tab state change to live, and the table scrolls to the top.. Leads to: Live events list. Rule R-FLA-002-4. Check: Click Live and verify the URL contains tab=live and the table scrolls to the top.
- **History 2036** (tab): It selects the History events tab. Affects: the list query and URL tab state change to history, and the table scrolls to the top.. Leads to: History events list. Rule R-FLA-002-4. Check: Click History and verify the URL contains tab=history and historical events load.
- **Drafts 185** (tab): It selects the Drafts events tab. Affects: the list query and URL tab state change to draft, and the table scrolls to the top.. Leads to: Drafts events list. Rule R-FLA-002-4. Check: Click Drafts and verify the URL contains tab=draft and draft events load.
- **Recurring** (tab): It selects the Recurring events tab. Affects: the list query and URL tab state change to recurring, and the table scrolls to the top.. Leads to: Recurring events list. Rule R-FLA-002-4. Check: Click Recurring and verify the URL contains tab=recurring and recurring events load.
- **Search Title** (field): It accepts a title search string. Affects: the URL search parameter and the list request's filters.title on every tab after the search is trimmed and debounced.. Leads to: stays here. Check: Enter a title, wait at least one second, and verify the URL and returned cards are filtered by that title.
- **Starting from** (field, disabled): It cannot be edited because the field is disabled. Affects: nothing.. Leads to: stays here. Check: Attempt to focus or type in Starting from and verify that its value and the list do not change.
- **Ending at** (field, disabled): It cannot be edited because the field is disabled. Affects: nothing.. Leads to: stays here. Check: Attempt to focus or type in Ending at and verify that its value and the list do not change.

## Test cases written from the events-list screen

- GEN-SCR-048: Invalid tab query parameter falls back to Live tab. Steps: Observe which tab is selected. Expected: The Live tab ("Live 8583") is selected, confirming the invalid value was replaced by `live`. [plan: full]
- GEN-SCR-049: Empty Live tab without filters repeats the Create Event button. Steps: Navigate to the Live tab. Verify the screen shows the "Create Event M" button. Expected: The "Create Event M" button appears in the empty‑state area (repeated as per design). [plan: partial]
- GEN-SCR-050: History and Drafts badges are not displayed. Steps: Look for badge elements next to the tab labels. Expected: No badge with a number is shown on either the History or Drafts tabs. [plan: full]
- GEN-SCR-051: Clicking "Ask Clara" opens the AI assistance modal. Steps: Click the "Ask Clara" button. Expected: A modal dialog titled "Ask Clara" appears, allowing the user to type a question. [plan: full]
- GEN-SCR-055: History events use date grouping and show no badge counts. Steps: Select History 2035. Review the event list. Expected: History cards are grouped under date headers formatted as application dates. No separate History badge count is shown. [plan: partial]
- GEN-SCR-056: Drafts and Recurring tabs show their correct empty states. Steps: Select Drafts 183. Review the empty state. Select Recurring. Review the empty state. Expected: Drafts shows "No Drafts Found". Recurring shows "No Recurring Events Found". [plan: full]
- GEN-SCR-057: Search Title placeholder includes reference ID when configured. Steps: Open the events list. Inspect Search Title before entering text. Expected: Search Title includes the text "or reference id" in its placeholder. [plan: full]
- GEN-SCR-058: Date range fields remain unavailable on the current screen. Steps: Try to focus Starting from. Try to focus Ending at. Try to enter a date in each field. Expected: Both fields remain disabled, cannot receive input, and do not change value. [plan: partial]
- GEN-SCR-059: Header actions open their intended destinations. Steps: Select Ask Clara. Verify that the Clara interface opens. Return to the events list. Select Create Event M. Expected: Ask Clara opens the Clara interface. Create Event M opens the event-creation screen. [plan: partial]
- GEN-SCR-291: Invalid tab parameter falls back to Live. Steps: Load the page. Inspect the URL and selected tab. Expected: The URL is replaced with ?tab=live, and Live 8641 is selected. [plan: partial]
- GEN-SCR-292: History events are grouped under formatted date headers. Steps: Click History 2036. Review the event list. Expected: History cards are grouped under date headers, and each header uses the app's formatted date format. [plan: partial]
- GEN-SCR-293: Drafts empty state shows the required copy. Steps: Click Drafts 185. Review the page content. Expected: The page shows "No Drafts Found". [plan: full]
- GEN-SCR-294: Recurring cards show frequency, invited count, and status. Steps: Click Recurring. Review each recurring event card. Expected: Each card shows "Frequency" with its schedule text or "-", the invited count, and an Active, Paused, or Cancelled status tag. [plan: partial]
- GEN-SCR-295: Date range fields are disabled on the current screen. Steps: Inspect Starting from. Inspect Ending at. Try to focus or enter text in each field. Expected: Both fields appear disabled and do not accept focus or input. [plan: full]
