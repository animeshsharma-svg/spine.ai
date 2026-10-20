# Screen: draft-two-stage-in-list (/orders)

Captured 2026-10-20 on company 198678. 10 controls, 10 with a known effect, 3 test cases written from it.

## How to reach the draft-two-stage-in-list screen

Plan steps: open_create {"path":"erfx"} → set_title → compose_stages {"stages":["rfp","rfq"]} → switch_stage {"stage":"rfp"} → select_template → fill_questionnaires → assign_evaluator → switch_stage {"stage":"rfq"} → select_template → add_line_items {"count":1} → fill_sheet → switch_stage {"stage":"rfq"} → set_schedule {"minutes":30} → invite_vendor {"count":1} → save_draft → expect_no_error → open_events_list → filter_events {"tab":"Drafts"} → expect_event_in_list. Path: `/orders`.
Headings on it: Hello Procol,.

## What each control on draft-two-stage-in-list does

- **Ask Clara** (button): Opens the Clara assistant. Affects: nothing. Leads to: Clara assistant drawer. Check: Click Ask Clara and verify that the Clara drawer opens.
- **Create Event M** (button): Starts creating a new event. Affects: Creates no event record until the creation flow is completed.. Leads to: Event creation screen. Rule R-FLA-009-2. Check: Click Create Event and verify that the event creation screen opens.
- **Give Feedback** (button): Opens the feedback flow. Affects: nothing until feedback is submitted.. Leads to: Feedback dialog or screen. Check: Click Give Feedback and verify that a feedback interface opens.
- **View Tickets** (button): Opens the support tickets view. Affects: nothing. Leads to: Tickets screen. Check: Click View Tickets and verify that the tickets screen opens.
- **Live 8595** (tab): Selects the Live tab. Affects: The active list stage changes to live events and the live event list is loaded or refreshed.. Leads to: Live tab list. Rule R-FLA-002-4. Check: Click Live and verify that the URL contains `?tab=live` and live events are shown.
- **History 2035** (tab): Selects the History tab. Affects: The active list stage changes to historical events and the history list is loaded with cursor-based pagination.. Leads to: History tab list. Rule R-FLA-003-3. Check: Click History and verify that the URL contains `?tab=history` and historical events are requested or displayed.
- **Drafts 185** (tab): Selects the Drafts tab. Affects: The active list stage remains drafts and draft event groups are loaded from the drafts endpoint.. Leads to: Drafts tab list. Rule R-FLA-003-3. Check: Verify that Drafts is selected, the URL contains `?tab=draft`, and draft events are displayed or the No Drafts Found state appears.
- **Recurring** (tab): Selects the Recurring tab. Affects: The active list stage changes to recurring events and scheduled event groups are loaded.. Leads to: Recurring tab list. Rule R-FLA-003-3. Check: Click Recurring and verify that the URL contains `?tab=recurring` and recurring events or the empty state are displayed.
- **View Tickets** (link): Opens the support tickets view. Affects: nothing. Leads to: Tickets screen. Check: Click the View Tickets link and verify that the tickets screen opens.
- **Search Title** (field): Filters the current event list by the entered title text. Affects: The displayed list and matching empty state change based on the title filter; the search text is not included in export filters.. Leads to: stays here. Rule R-FLA-008-2. Check: Enter a title that matches one event and verify that matching rows remain while nonmatching rows are hidden.

## Test cases written from the draft-two-stage-in-list screen

- GEN-SCR-169: Drafts shows its empty state. Steps: Click Drafts 185. Expected: The Drafts list shows No Drafts Found. [plan: full]
- GEN-SCR-170: Search with no matching title shows the filtered empty state. Steps: Enter a title that does not match any event in Search Title. Wait for the list to refresh. Expected: The list shows the app's no-result copy for a filtered list instead of No Drafts Found. [plan: full]
- GEN-SCR-171: Ticket and feedback controls open their destinations. Steps: Click the View Tickets button. Return to /orders. Click the View Tickets link. Return to /orders. Click Give Feedback. Expected: Each View Tickets control opens the tickets view. Give Feedback opens the feedback form. [plan: none]
