# Generated test cases — drafts (2026-10-20)

Every case below was written by the spine.ai assistant when someone typed a test case that no existing case covered.
They are DRAFTS: nothing here is in the catalog until a person reviews it and moves it into a catalog file
(the importer does not read `generated-*.md`, and `GEN-` ids are not parsed).

## 1. Drafts from the assistant

### GEN-SCR-048 — Invalid tab query parameter falls back to Live tab

- **Why it matters.** The URL query `?tab=` must be one of the allowed values; any other value should be replaced with `live`. Written from the events-list screen; grounded in R-FLA-002-1 (src/viewModels/orders/useOrdersListViewModel.js:82-110); screenshot procol-ui-tests/evidence/plan-mvh1fiaf/03-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the events‑list screen with the URL `…/orders?tab=unknown`.
- **Steps.** 1. Observe which tab is selected.
- **Expected.** The Live tab ("Live 8583") is selected, confirming the invalid value was replaced by `live`.
- **Oracle.** The screen behaves as R-FLA-002-1 says: `?tab=` must be one of `live|history|draft|recurring` (lower-cased compare); anything else is replaced (history replace) by `?tab=live` — src/viewModels/orders/useOrdersListViewModel.js:82-110, src/vi
- **Trace.** P1 · draft · `GEN-SCR-048` · layer ui · coverage full · typed: “screen events-list (/orders)”

### GEN-SCR-049 — Empty Live tab without filters repeats the Create Event button

- **Why it matters.** When there are no Live events and no filters applied, the UI should show the New Event button repeatedly. Written from the events-list screen; grounded in R-FLA-009-3 (src/views/orders/components/projectTable.jsx:699-720); screenshot procol-ui-tests/evidence/plan-mvh1fiaf/03-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Ensure there are no Live events and clear any filters in the Search Title field.
- **Steps.** 1. Navigate to the Live tab. 2. Verify the screen shows the "Create Event M" button.
- **Expected.** The "Create Event M" button appears in the empty‑state area (repeated as per design).
- **Oracle.** The screen behaves as R-FLA-009-3 says: Empty Live tab without filters repeats the New Event button; with filters it shows the "no result" copy instead — src/views/orders/components/projectTable.jsx:699-720
- **Trace.** P0 · draft · `GEN-SCR-049` · layer ui · coverage full · typed: “screen events-list (/orders)”

### GEN-SCR-050 — History and Drafts badges are not displayed

- **Why it matters.** The project table expects badge counts, but the page never provides them; the UI should therefore not show any badges. Written from the events-list screen; grounded in R-FLA-002-5 (src/views/orders/components/projectTable.jsx:292-293); screenshot procol-ui-tests/evidence/plan-mvh1fiaf/03-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Assert that no numeric badge element is displayed next to the History tab.; Assert that no numeric badge element is displayed next to the Drafts tab..
- **Setup.** Navigate to the History tab and then to the Drafts tab.
- **Steps.** 1. Look for badge elements next to the tab labels.
- **Expected.** No badge with a number is shown on either the History or Drafts tabs.
- **Oracle.** The screen behaves as R-FLA-002-5 says: History and Drafts badges are never shown: ProjectTable expects `pastProjectCount` / `draftProjectCount` but OrdersListPage never passes them — src/views/orders/components/projectTable.jsx:292-293, 75
- **Trace.** P2 · draft · `GEN-SCR-050` · layer ui · coverage none · typed: “screen events-list (/orders)”

### GEN-SCR-051 — Clicking "Ask Clara" opens the AI assistance modal

- **Why it matters.** The Ask Clara button should launch the AI help dialog. Written from the events-list screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/plan-mvh1fiaf/03-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Be on the events‑list screen with no modal open.
- **Steps.** 1. Click the "Ask Clara" button.
- **Expected.** A modal dialog titled "Ask Clara" appears, allowing the user to type a question.
- **Oracle.** What the tester sees on the events-list screen.
- **Trace.** P2 · draft · `GEN-SCR-051` · layer ui · coverage full · typed: “screen events-list (/orders)”

### GEN-SCR-052 — Publish with empty project title displays validation error

- **Why it matters.** Verifies that attempting to publish without a project title blocks the action and displays the mandatory error message before any other checks. Written from the create-line-items screen; grounded in R-FCR-013-1 (src/views/projectCreation/projectCreation.jsx:1599-1602); screenshot procol-ui-tests/evidence/plan-mvh1fiaf/10-inventory-create-line-items.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Leave the project title field completely blank.
- **Steps.** 1. Click the 'Publish' button.
- **Expected.** The system stops execution and displays the error message 'Please fill project title!'.
- **Oracle.** The screen behaves as R-FCR-013-1 says: Publish with empty project title → "Please fill project title!" before any other check; a whitespace-only title passes (truthiness check) — src/views/projectCreation/projectCreation.jsx:1599-1602
- **Trace.** P0 · draft · `GEN-SCR-052` · layer ui · coverage full · typed: “screen create-line-items (/orders/quick-create)”

### GEN-SCR-053 — Add Attachments modal opens successfully

- **Why it matters.** Ensures the Add Attachments control opens the file upload interface for the event. Written from the create-line-items screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/plan-mvh1fiaf/10-inventory-create-line-items.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Be on the quick-create event screen.
- **Steps.** 1. Click the 'Add Attachments' button.
- **Expected.** The file attachment drawer or modal opens allowing document uploads.
- **Oracle.** What the tester sees on the create-line-items screen.
- **Trace.** P2 · draft · `GEN-SCR-053` · layer ui · coverage full · typed: “screen create-line-items (/orders/quick-create)”

### GEN-SCR-054 — Save event progress as draft

- **Why it matters.** Verifies that clicking Save as draft persists the current state as a draft event group via API. Written from the create-line-items screen; grounded in R-FCR-014-4 (src/views/projectCreation/projectCreation.jsx:2259-2269); screenshot procol-ui-tests/evidence/plan-mvh1fiaf/10-inventory-create-line-items.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Fill in the mandatory project title and at least one line item.
- **Steps.** 1. Click the 'Save as draft' button.
- **Expected.** The project is saved successfully as a draft and a success confirmation is displayed.
- **Oracle.** The screen behaves as R-FCR-014-4 says: First save → `POST /event_groups` `{status:"draft", title, line_items:[{product_uuid, quantity:{unitSymbol,value}, product_quality_uuid, serial_number, pr_line_item_uuid, pr_id}]}`; later saves → `PAT
- **Trace.** P1 · draft · `GEN-SCR-054` · layer ui · coverage full · typed: “screen create-line-items (/orders/quick-create)”

### GEN-SCR-055 — History events use date grouping and show no badge counts

- **Why it matters.** History results should be grouped under formatted date headers. Written from the events-list screen; grounded in R-FLA-004-3 (src/views/orders/components/projectTable.jsx:846-858); screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/03-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Date-based grouping of History cards under application-formatted date headers for 2035; Absence of a separate History badge count.
- **Setup.** Use an account with history events on at least two dates.
- **Steps.** 1. Select History 2035. 2. Review the event list.
- **Expected.** History cards are grouped under date headers formatted as application dates. No separate History badge count is shown.
- **Oracle.** The screen behaves as R-FLA-004-3 says: History/Drafts cards are grouped under a date header formatted `appFormatDate(date, DATE)` — src/views/orders/components/projectTable.jsx:846-858, 900-913
- **Trace.** P1 · draft · `GEN-SCR-055` · layer ui · coverage partial · typed: “screen events-list (/orders)”

### GEN-SCR-056 — Drafts and Recurring tabs show their correct empty states

- **Why it matters.** Users need clear, tab-specific feedback when these lists contain no events. Written from the events-list screen; grounded in R-FLA-004-4 (src/views/orders/components/projectTable.jsx:699-708); screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/03-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use an account with no draft events and no recurring events.
- **Steps.** 1. Select Drafts 183. 2. Review the empty state. 3. Select Recurring. 4. Review the empty state.
- **Expected.** Drafts shows "No Drafts Found". Recurring shows "No Recurring Events Found".
- **Oracle.** The screen behaves as R-FLA-004-4 says: Empty states: filtered → "no result" copy; Drafts → "No Drafts Found"; Recurring → "No Recurring Events Found" — src/views/orders/components/projectTable.jsx:699-708, 914-920, 965-971
- **Trace.** P1 · draft · `GEN-SCR-056` · layer ui · coverage full · typed: “screen events-list (/orders)”

### GEN-SCR-057 — Search Title placeholder includes reference ID when configured

- **Why it matters.** The placeholder must tell configured users that reference IDs are searchable. Written from the events-list screen; grounded in R-FLA-014-3 (src/views/orders/components/filters.jsx:84-110); screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/03-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Assert that the Search Title placeholder includes the text "or reference id"..
- **Setup.** Use an account with showReferenceId enabled.
- **Steps.** 1. Open the events list. 2. Inspect Search Title before entering text.
- **Expected.** Search Title includes the text "or reference id" in its placeholder.
- **Oracle.** The screen behaves as R-FLA-014-3 says: Title filter placeholder adds "or reference id" when user `showReferenceId` — src/views/orders/components/filters.jsx:84-110
- **Trace.** P2 · draft · `GEN-SCR-057` · layer ui · coverage none · typed: “screen events-list (/orders)”

### GEN-SCR-058 — Date range fields remain unavailable on the current screen

- **Why it matters.** Disabled controls must not accept input or imply that a date range can currently be applied. Written from the events-list screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/03-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Directly focus Starting from or Ending at to verify focus is rejected; Verify the fields' values remain unchanged after attempted input.
- **Setup.** Open the events list on the selected Live 8583 tab.
- **Steps.** 1. Try to focus Starting from. 2. Try to focus Ending at. 3. Try to enter a date in each field.
- **Expected.** Both fields remain disabled, cannot receive input, and do not change value.
- **Oracle.** What the tester sees on the events-list screen.
- **Trace.** P1 · draft · `GEN-SCR-058` · layer ui · coverage partial · typed: “screen events-list (/orders)”

### GEN-SCR-059 — Header actions open their intended destinations

- **Why it matters.** The primary header actions must open the workflows represented by their labels. Written from the events-list screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/03-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog has no dedicated step that identifies or verifies the Clara interface destination after selecting Ask Clara..
- **Setup.** Open the events list.
- **Steps.** 1. Select Ask Clara. 2. Verify that the Clara interface opens. 3. Return to the events list. 4. Select Create Event M.
- **Expected.** Ask Clara opens the Clara interface. Create Event M opens the event-creation screen.
- **Oracle.** What the tester sees on the events-list screen.
- **Trace.** P1 · draft · `GEN-SCR-059` · layer ui · coverage partial · typed: “screen events-list (/orders)”

### GEN-SCR-060 — Open Ask Clara from event history

- **Why it matters.** Confirms the assistant entry point opens from the history screen. Written from the events-history screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/05-inventory-events-history.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact Ask Clara assistant panel or screen opening state is not defined by a domain assertion step.; The specific event-row context in which Ask Clara is available is not expressible without a known event title or project id..
- **Setup.** Load /orders with History 2035 selected.
- **Steps.** 1. Click "Ask Clara".
- **Expected.** An Ask Clara assistant panel or screen opens without leaving the events area.
- **Oracle.** What the tester sees on the events-history screen.
- **Trace.** P1 · draft · `GEN-SCR-060` · layer ui · coverage partial · typed: “screen events-history (/orders)”

### GEN-SCR-061 — Open the event export flow

- **Why it matters.** Confirms the visible export action opens its export flow. Written from the events-history screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/05-inventory-events-history.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: An export menu opening instead of a dialog; A file download being initiated or completed.
- **Setup.** Load /orders with History 2035 selected and at least one historical event visible.
- **Steps.** 1. Click "Export".
- **Expected.** An export dialog, menu, or download flow opens for the historical events.
- **Oracle.** What the tester sees on the events-history screen.
- **Trace.** P1 · draft · `GEN-SCR-061` · layer ui · coverage partial · typed: “screen events-history (/orders)”

### GEN-SCR-062 — Switch between event status tabs

- **Why it matters.** Confirms each visible event-status tab changes the displayed list and selected state. Written from the events-history screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/05-inventory-events-history.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Direct assertion that each clicked tab has selected state styling; Verification of the numeric tab counts: Live 8583, Drafts 183, and History 2035.
- **Setup.** Load /orders with "History 2035" selected.
- **Steps.** 1. Click "Live 8583". 2. Click "Drafts 183". 3. Click "Recurring". 4. Click "History 2035".
- **Expected.** Each clicked tab becomes selected and displays its corresponding event view. "History 2035" is selected at the end.
- **Oracle.** What the tester sees on the events-history screen.
- **Trace.** P1 · draft · `GEN-SCR-062` · layer ui · coverage partial · typed: “screen events-history (/orders)”

### GEN-SCR-063 — Search history with no matching title

- **Why it matters.** Confirms the title search handles a query that matches no historical event. Written from the events-history screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/05-inventory-events-history.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Load /orders with "History 2035" selected.
- **Steps.** 1. Enter a unique string that is not the title of any historical event in "Search Title".
- **Expected.** The history list shows no matching events and displays the screen's empty-results state.
- **Oracle.** What the tester sees on the events-history screen.
- **Trace.** P1 · draft · `GEN-SCR-063` · layer ui · coverage full · typed: “screen events-history (/orders)”

### GEN-SCR-064 — Verify date fields are unavailable on history

- **Why it matters.** Confirms the date controls shown as disabled cannot be edited. Written from the events-history screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/05-inventory-events-history.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Prove that the event list contents remain exactly unchanged after the attempted date interactions..
- **Setup.** Load /orders with "History 2035" selected.
- **Steps.** 1. Click "Starting from". 2. Try to enter a date. 3. Click "Ending at". 4. Try to enter a date.
- **Expected.** "Starting from" and "Ending at" remain disabled, do not accept focus or input, and do not change the event list.
- **Oracle.** What the tester sees on the events-history screen.
- **Trace.** P1 · draft · `GEN-SCR-064` · layer ui · coverage partial · typed: “screen events-history (/orders)”

### GEN-SCR-065 — Ask Clara opens the assistant

- **Why it matters.** Confirms the assistant control opens its available experience. Written from the events-drafts screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/07-inventory-events-drafts.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog has no dedicated assertion that the visible dialog is specifically the Clara assistant or that its assistant content rendered correctly..
- **Setup.** Load /orders.
- **Steps.** 1. Click Ask Clara.
- **Expected.** The Clara assistant opens.
- **Oracle.** What the tester sees on the events-drafts screen.
- **Trace.** P1 · draft · `GEN-SCR-065` · layer ui · coverage partial · typed: “screen events-drafts (/orders)”

### GEN-SCR-066 — Live 8583 shows live events

- **Why it matters.** Verifies navigation from the selected Drafts list to live events. Written from the events-drafts screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/07-inventory-events-drafts.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Direct assertion that the Live tab is selected.; Direct assertion that the displayed rows are live events rather than drafts..
- **Setup.** Load /orders with Drafts 183 selected.
- **Steps.** 1. Click Live 8583.
- **Expected.** Live 8583 becomes selected and the list shows live events instead of drafts.
- **Oracle.** What the tester sees on the events-drafts screen.
- **Trace.** P0 · draft · `GEN-SCR-066` · layer ui · coverage partial · typed: “screen events-drafts (/orders)”

### GEN-SCR-067 — History 2035 shows historical events

- **Why it matters.** Verifies navigation to the historical-events list. Written from the events-drafts screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/07-inventory-events-drafts.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Whether the History tab is selected rather than merely visible; Whether the displayed rows are historical events rather than drafts.
- **Setup.** Load /orders with Drafts 183 selected.
- **Steps.** 1. Click History 2035.
- **Expected.** History 2035 becomes selected and the list shows historical events instead of drafts.
- **Oracle.** What the tester sees on the events-drafts screen.
- **Trace.** P1 · draft · `GEN-SCR-067` · layer ui · coverage partial · typed: “screen events-drafts (/orders)”

### GEN-SCR-068 — Recurring shows recurring events

- **Why it matters.** Verifies navigation to recurring events. Written from the events-drafts screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/07-inventory-events-drafts.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Directly assert that the Recurring tab is selected.; Directly assert that the opened list is specifically the recurring-events dataset when recurring events are present..
- **Setup.** Load /orders.
- **Steps.** 1. Click Recurring.
- **Expected.** Recurring becomes selected and the recurring-events list opens.
- **Oracle.** What the tester sees on the events-drafts screen.
- **Trace.** P1 · draft · `GEN-SCR-068` · layer ui · coverage partial · typed: “screen events-drafts (/orders)”

### GEN-SCR-069 — Search Title filters draft events

- **Why it matters.** Confirms title search works within the currently selected drafts list. Written from the events-drafts screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/07-inventory-events-drafts.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The case does not provide a specific non-matching draft title to verify as hidden.; The catalog has no assertion that every remaining draft row matches the search query..
- **Setup.** Load /orders with Drafts 183 selected. Ensure one draft title contains "Alpha" and another visible draft does not.
- **Steps.** 1. Enter Alpha in Search Title.
- **Expected.** Only matching draft events remain visible in the list. Non-matching drafts are hidden.
- **Oracle.** What the tester sees on the events-drafts screen.
- **Trace.** P0 · draft · `GEN-SCR-069` · layer ui · coverage partial · typed: “screen events-drafts (/orders)”

### GEN-SCR-070 — Show no results for an unmatched recurring-event title

- **Why it matters.** Checks the empty-result behavior for a title that does not exist in the recurring-events list. Written from the events-recurring screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/09-inventory-events-recurring.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Load /orders with "Recurring" selected.
- **Steps.** 1. Enter "ZZZ-no-matching-recurring-event-99999" in "Search Title". 2. Wait for the list to update.
- **Expected.** No recurring events are listed for the unmatched title, and the screen shows its no-results or empty-list state.
- **Oracle.** What the tester sees on the events-recurring screen.
- **Trace.** P2 · draft · `GEN-SCR-070` · layer ui · coverage full · typed: “screen events-recurring (/orders)”

### GEN-SCR-071 — Project creation options open their corresponding project flows

- **Why it matters.** Verify both project-creation menu options are actionable and open project flows. Written from the create-event-menu screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/12-inventory-create-event-menu.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog cannot definitively assert that the second creation screen is the BOQ-specific flow rather than another generic create screen; no BOQ-specific navigation assertion or screen step is available..
- **Setup.** Open /orders.
- **Steps.** 1. Click "Create Event M". 2. Click "eRFX Project Manage sourcing via a project approach". 3. Confirm that the project creation screen opens. 4. Return to /orders. 5. Click "Create Event M". 6. Click "BOQ based RFX Project Source BOQ via a project approach".
- **Expected.** The eRFX option opens the project creation screen. The BOQ option opens the BOQ-based project creation flow.
- **Oracle.** What the tester sees on the create-event-menu screen.
- **Trace.** P0 · draft · `GEN-SCR-071` · layer ui · coverage partial · typed: “screen create-event-menu (/orders)”

### GEN-SCR-072 — Event list tabs switch the displayed event set

- **Why it matters.** Verify each visible event-list tab can be selected and changes the current view. Written from the create-event-menu screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/12-inventory-create-event-menu.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact selected state of each tab, including the numeric labels History 2035, Drafts 183, and Live 8583; That each tab displays its corresponding event set or exact event count.
- **Setup.** Open /orders with "Live 8583" selected.
- **Steps.** 1. Click "History 2035". 2. Click "Drafts 183". 3. Click "Recurring". 4. Click "Live 8583".
- **Expected.** Each clicked tab becomes selected and its corresponding event list view is displayed. "Live 8583" is selected again at the end.
- **Oracle.** What the tester sees on the create-event-menu screen.
- **Trace.** P1 · draft · `GEN-SCR-072` · layer ui · coverage partial · typed: “screen create-event-menu (/orders)”

### GEN-SCR-073 — Search Title filters the event list

- **Why it matters.** Verify the visible title search can narrow the currently selected event list. Written from the create-event-menu screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvh1ywqj/12-inventory-create-event-menu.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The distinctive part of the identified event title to enter was not provided.; A concrete nonmatching event title or list-wide assertion that every nonmatching event is excluded cannot be expressed with the available catalog steps..
- **Setup.** Open /orders with "Live 8583" selected and identify a visible event title.
- **Steps.** 1. Click "Search Title". 2. Enter a distinctive part of the identified event title. 3. Wait for the list to refresh.
- **Expected.** The list shows matching event titles and excludes events that do not match the entered text.
- **Oracle.** What the tester sees on the create-event-menu screen.
- **Trace.** P1 · draft · `GEN-SCR-073` · layer ui · coverage partial · typed: “screen create-event-menu (/orders)”

### GEN-SCR-074 — Save as draft becomes enabled after adding a line item and selecting a template

- **Why it matters.** Footer buttons are disabled until a template and at least one product exist; tooltip explains the requirement. Written from the create-erfx screen; grounded in R-FCR-016-2 (src/views/projectCreation/projectCreation.jsx:1457-1481); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Screen is loaded with no line items and no template selected.
- **Steps.** 1. Click button "Select Templates". 2. Choose any template from the list. 3. Click button "Items 0". 4. Add a line item with a product and quantity. 5. Observe the state of button "Save as draft".
- **Expected.** Button "Save as draft" is now enabled. Tooltip on the button is no longer shown.
- **Oracle.** The screen behaves as R-FCR-016-2 says: Disabled with tooltip "Please select template for <stage title>" for any non-RFP stage without a template, or "Please add line items" — src/views/projectCreation/projectCreation.jsx:1457-1481
- **Trace.** P0 · draft · `GEN-SCR-074` · layer ui · coverage full · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-075 — Publish button shows tooltip when no participants are added

- **Why it matters.** Project cannot be published without participants; a specific message should appear. Written from the create-erfx screen; grounded in R-FCR-017-1 (src/views/projectCreation/projectCreation.jsx:1604-1609); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Template selected and at least one line item added, but no participants added.
- **Steps.** 1. Click button "Publish".
- **Expected.** A toast or modal appears with message "Please add participants to proceed!" and publishing is blocked.
- **Oracle.** The screen behaves as R-FCR-017-1 says: No participant in the project → "Please add participants to proceed!" (stops) — src/views/projectCreation/projectCreation.jsx:1604-1609
- **Trace.** P0 · draft · `GEN-SCR-075` · layer ui · coverage full · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-076 — Attempt to publish with empty project title shows validation message

- **Why it matters.** Publish must validate that the project title is not empty. Written from the create-erfx screen; grounded in R-FCR-013-1 (src/views/projectCreation/projectCreation.jsx:1599-1602); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Leave the title field blank, select a template and add a line item.
- **Steps.** 1. Click button "Publish".
- **Expected.** A validation toast appears with text "Please fill project title!" and the publish action is aborted.
- **Oracle.** The screen behaves as R-FCR-013-1 says: Publish with empty project title → "Please fill project title!" before any other check; a whitespace-only title passes (truthiness check) — src/views/projectCreation/projectCreation.jsx:1599-1602
- **Trace.** P0 · draft · `GEN-SCR-076` · layer ui · coverage full · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-077 — Changing the selected template prompts confirmation dialog

- **Why it matters.** Switching templates should warn the user that data will be reset. Written from the create-erfx screen; grounded in R-FCR-026-4 (src/views/eventCreation/templateSelection.jsx:349-360); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Reliably choose a different template when the case provides no alternative template name..
- **Setup.** A template is already selected and line items are added.
- **Steps.** 1. Click button "Select Templates". 2. Choose a different template.
- **Expected.** A modal appears with message "Changing template will reset data. Are you sure?" and options "Yes" and "Cancel".
- **Oracle.** The screen behaves as R-FCR-026-4 says: Changing an existing template asks "Do you really want to change the template?" (project) / "Changing template will reset data. Are you sure?" (quick-create), OK "Yes" — templateSelection.jsx:349-360,
- **Trace.** P1 · draft · `GEN-SCR-077` · layer ui · coverage partial · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-078 — Publish with auction mode but no valid auction strategy shows error

- **Why it matters.** Auction events require a valid strategy; missing strategy should block publish. Written from the create-erfx screen; grounded in R-FCR-029-4 (src/views/eventCreation/components/auctionConfiguration/auctionConfiguration.jsx:421-424); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog cannot unset or create an invalid auction strategy; configure_single_stage only accepts valid strategies and defaults to Rank..
- **Setup.** Create a quick‑create auction project, select a template and add at least one line item, but leave the auction strategy unset.
- **Steps.** 1. Click button "Publish".
- **Expected.** A toast appears with message "Please select a valid auction strategy" and the project is not published.
- **Oracle.** The screen behaves as R-FCR-029-4 says: Save with mode auction and type "auction" → "Please select a valid auction strategy" — auctionConfiguration.jsx:421-424, src/translations/en.json errorMessages.quickCreateOrder.notAValidAuctionStrateg
- **Trace.** P1 · draft · `GEN-SCR-078` · layer ui · coverage partial · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-079 — Disabled "Now - 01:09 am, 21st Oct ( 30 Mins )" button shows tooltip until schedule is set

- **Why it matters.** Schedule button is disabled when no template or line items are present, showing a tooltip. Written from the create-erfx screen; grounded in R-FCR-016-2 (src/views/projectCreation/projectCreation.jsx:1457-1481); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog cannot assert an OR condition accepting either the exact stage-specific message "Please select template for <stage title>" or "Please add line items"; it checks the template guidance substring only..
- **Setup.** Screen loaded with no template selected and no line items.
- **Steps.** 1. Hover over button "Now - 01:09 am, 21st Oct ( 30 Mins )".
- **Expected.** Button remains disabled and a tooltip appears with text "Please select template for <stage title>" or "Please add line items".
- **Oracle.** The screen behaves as R-FCR-016-2 says: Disabled with tooltip "Please select template for <stage title>" for any non-RFP stage without a template, or "Please add line items" — src/views/projectCreation/projectCreation.jsx:1457-1481
- **Trace.** P2 · draft · `GEN-SCR-079` · layer ui · coverage partial · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-080 — Select Templates is blocked until a line item is added

- **Why it matters.** Verify the disabled template control explains its dependency and becomes usable after adding a line item. Written from the create-stages-rfp-rfq screen; grounded in R-FCR-016-2 (src/views/projectCreation/projectCreation.jsx:1457-1481); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/05-inventory-create-stages-rfp-rfq.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Start with the screen showing "Items 0".
- **Steps.** 1. Hover over "Select Templates". 2. Click "Items 0" and add one line item. 3. Return to the Vendor Assessment screen. 4. Hover over "Select Templates".
- **Expected.** Before a line item is added, "Select Templates" is disabled and shows the tooltip "Please add line items". After a line item is added, the control is enabled or its disabled tooltip is no longer shown.
- **Oracle.** The screen behaves as R-FCR-016-2 says: Disabled with tooltip "Please select template for <stage title>" for any non-RFP stage without a template, or "Please add line items" — src/views/projectCreation/projectCreation.jsx:1457-1481
- **Trace.** P1 · draft · `GEN-SCR-080` · layer ui · coverage full · typed: “screen create-stages-rfp-rfq (/orders/quick-create)”

### GEN-SCR-081 — Publish reports missing payment terms

- **Why it matters.** Verify payment terms are mandatory even when the other publish requirements are complete. Written from the create-stages-rfp-rfq screen; grounded in R-FCR-039-3 (src/views/projectCreation/helpers.js:278-280); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/05-inventory-create-stages-rfp-rfq.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Configure Payment Terms and Conditions or explicitly set them to an incomplete state before publishing; Configure or bypass tenant-specific mandatory savings and other publish gates that could prevent the payment-terms message from being reached.
- **Setup.** Prepare a valid event with a title, line items, participants, and required evaluators. Do not save payment terms.
- **Steps.** 1. Click "Publish".
- **Expected.** The event is not published. The message "Payment Terms and Conditions are mandatory" appears.
- **Oracle.** The screen behaves as R-FCR-039-3 says: Enabled but not saved → "Payment Terms and Conditions are mandatory" at publish; sent as `configurations.payment_tnc` — src/views/projectCreation/helpers.js:278-280, src/redux/orders/helpers.js:1072-1
- **Trace.** P1 · draft · `GEN-SCR-081` · layer ui · coverage partial · typed: “screen create-stages-rfp-rfq (/orders/quick-create)”

### GEN-SCR-082 — Publish opens the event confirmation dialog

- **Why it matters.** Verify the primary publish action opens the confirmation step before any event is created. Written from the create-stages-rfp-rfq screen; grounded in R-FCR-020-2 (src/views/eventCreation/components/footer/confirmModal.jsx:52-60); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/05-inventory-create-stages-rfp-rfq.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Directly verify through the backend that no event record has been created yet..
- **Setup.** Prepare a valid event with a project title, line items, participants, evaluators, and saved payment terms.
- **Steps.** 1. Click "Publish".
- **Expected.** A confirmation dialog opens with the title "Publish Event" and an action labeled "Publish". The event has not yet been created.
- **Oracle.** The screen behaves as R-FCR-020-2 says: Title: "Send to Auction Team" / project title truncated to 45 / "Publish Event"; OK text "Send to Auction Team" or "Publish"; Cancel is "Edit Schedule" and opens the schedule drawer — src/views/eventC
- **Trace.** P0 · draft · `GEN-SCR-082` · layer ui · coverage partial · typed: “screen create-stages-rfp-rfq (/orders/quick-create)”

### GEN-SCR-083 — Add Attachments opens the attachment interface

- **Why it matters.** Verify the attachment action opens the interface used to add event attachments. Written from the create-stages-rfp-rfq screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/05-inventory-create-stages-rfp-rfq.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Selecting or adding an attachment within the attachment interface.
- **Setup.** Remain on the Vendor Assessment screen.
- **Steps.** 1. Click "Add Attachments".
- **Expected.** The attachment interface opens, allowing the tester to select or add an attachment. The Vendor Assessment screen remains available after closing the interface.
- **Oracle.** What the tester sees on the create-stages-rfp-rfq screen.
- **Trace.** P2 · draft · `GEN-SCR-083` · layer ui · coverage partial · typed: “screen create-stages-rfp-rfq (/orders/quick-create)”

### GEN-SCR-084 — Items 0 opens line-item management

- **Why it matters.** Verify that the line-item count control opens the area used to add line items. Written from the create-technical-template screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/08-inventory-create-technical-template.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use a new project with zero line items.
- **Steps.** 1. Click "Items 0".
- **Expected.** The Manage Line Items section opens. The screen indicates that line items must be added before continuing.
- **Oracle.** What the tester sees on the create-technical-template screen.
- **Trace.** P1 · draft · `GEN-SCR-084` · layer ui · coverage full · typed: “screen create-technical-template (/orders/quick-create)”

### GEN-SCR-085 — Save as draft is disabled without line items

- **Why it matters.** Verify the disabled draft-save state and its reason when no line items exist. Written from the create-technical-template screen; grounded in R-FCR-016-2 (src/views/projectCreation/projectCreation.jsx:1457-1481); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/08-inventory-create-technical-template.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use a non-RFP stage without line items.
- **Steps.** 1. Confirm that "Save as draft" cannot be clicked. 2. Hover over "Save as draft".
- **Expected.** "Save as draft" remains disabled. A tooltip shows "Please add line items".
- **Oracle.** The screen behaves as R-FCR-016-2 says: Disabled with tooltip "Please select template for <stage title>" for any non-RFP stage without a template, or "Please add line items" — src/views/projectCreation/projectCreation.jsx:1457-1481
- **Trace.** P1 · draft · `GEN-SCR-085` · layer ui · coverage full · typed: “screen create-technical-template (/orders/quick-create)”

### GEN-SCR-086 — Blacklisted and TNA vendors cannot be selected

- **Why it matters.** Verify that restricted vendors are visibly disabled in participant search. Written from the create-technical-template screen; grounded in R-FCR-035-3 (src/views/projectCreation/projectCreation.jsx:255-256); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/08-inventory-create-technical-template.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The test does not provide the blacklisted vendor or TNA vendor names, so their individual rows cannot be targeted.; No catalog step can assert that each specific vendor row is disabled or that attempting to select either vendor is refused..
- **Setup.** Use a fresh project. Ensure the vendor search results include one blacklisted vendor and one TNA vendor, with no URL option allowing TNA vendors to bid.
- **Steps.** 1. Click "Participants". 2. Open "Search vendors you want to add". 3. View the blacklisted vendor and the TNA vendor in the results.
- **Expected.** The blacklisted vendor is disabled and marked "Blocked". The TNA vendor is disabled and marked "TNA". Neither vendor can be selected.
- **Oracle.** The screen behaves as R-FCR-035-3 says: In search results blacklisted vendors are disabled with "Blocked"; TNA vendors are disabled with "TNA" unless the URL has `allowTnaVendorsToBid=true` (so on a fresh create every TNA vendor is unselect
- **Trace.** P1 · draft · `GEN-SCR-086` · layer ui · coverage partial · typed: “screen create-technical-template (/orders/quick-create)”

### GEN-SCR-087 — Save as draft sends the first draft event-group request

- **Why it matters.** Verify that the first save creates a draft with the project title and line-item data. Written from the create-line-items screen; grounded in R-FCR-014-4 (src/views/projectCreation/projectCreation.jsx:2259-2269); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/12-inventory-create-line-items.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact line-item values sent in the request because the case does not specify concrete values for the required cells.; That the observed POST is definitively the first event-group request rather than merely a request sent during the run..
- **Setup.** Open a new quick-create RFQ with both line items available.
- **Steps.** 1. Enter a project title in "Enter the title of the project". 2. Complete the required cells under all required columns. 3. Open browser developer tools and monitor network requests. 4. Click "Save as draft".
- **Expected.** The first save sends a POST request to create the event group with status "draft", the entered title, and the line-item values. The screen remains in the draft flow without publishing the event.
- **Oracle.** The screen behaves as R-FCR-014-4 says: First save → `POST /event_groups` `{status:"draft", title, line_items:[{product_uuid, quantity:{unitSymbol,value}, product_quality_uuid, serial_number, pr_line_item_uuid, pr_id}]}`; later saves → `PAT
- **Trace.** P0 · draft · `GEN-SCR-087` · layer ui · coverage partial · typed: “screen create-line-items (/orders/quick-create)”

### GEN-SCR-088 — Publish refuses an event with no participants

- **Why it matters.** Ensure publishing stops when no vendor has been added. Written from the create-line-items screen; grounded in R-FCR-017-1 (src/views/projectCreation/projectCreation.jsx:1604-1609); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/12-inventory-create-line-items.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open a new RFQ with no vendor selected.
- **Steps.** 1. Enter a project title in "Enter the title of the project". 2. Complete the required cells under all required columns. 3. Leave "Search vendors you want to add" empty. 4. Click "Publish".
- **Expected.** Publishing stops and the app shows "Please add participants to proceed!". The event is not published.
- **Oracle.** The screen behaves as R-FCR-017-1 says: No participant in the project → "Please add participants to proceed!" (stops) — src/views/projectCreation/projectCreation.jsx:1604-1609
- **Trace.** P0 · draft · `GEN-SCR-088` · layer ui · coverage full · typed: “screen create-line-items (/orders/quick-create)”

### GEN-SCR-089 — Ask Clara opens AI assistance when line items exist

- **Why it matters.** Verify that the AI RFP action is available and starts the AI request only when project line items exist. Written from the create-line-items screen; grounded in R-FCR-042-4 (src/views/eventCreation/components/aiRfpGenerator/api.js:3-11); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/12-inventory-create-line-items.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Whether the AI RFP assistant visibly opens, because the catalog has no assertion specific to the assistant's resulting UI..
- **Setup.** Open the screen with the two displayed line items.
- **Steps.** 1. Confirm that "Items 2" is displayed. 2. Open browser developer tools and monitor network requests. 3. Click "Ask Clara".
- **Expected.** The AI RFP assistant opens. The app sends a POST request to "/ask_ai_chats/rfp_questions" and then requests the generated data from "/external_requests/:uuid".
- **Oracle.** The screen behaves as R-FCR-042-4 says: AI RFP → `POST /ask_ai_chats/rfp_questions`, then `GET /external_requests/:uuid`; the AI button needs project line items — src/views/eventCreation/components/aiRfpGenerator/api.js:3-11, src/views/even
- **Trace.** P1 · draft · `GEN-SCR-089` · layer ui · coverage partial · typed: “screen create-line-items (/orders/quick-create)”

### GEN-SCR-090 — Add Columns opens the column selection view

- **Why it matters.** Verify the column configuration control opens its column selection interface. Written from the create-pricing-sheet screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/14-inventory-create-pricing-sheet.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Verify the complete column-selection interface contents and that all additional available columns can be reviewed.; Verify the exact set of selectable columns or whether already-added columns are disabled in the Add Columns menu..
- **Setup.** Open the create-pricing-sheet screen.
- **Steps.** 1. Click Add Columns.
- **Expected.** A column selection interface opens. The existing pricing-sheet columns remain visible and additional available columns can be reviewed.
- **Oracle.** What the tester sees on the create-pricing-sheet screen.
- **Trace.** P1 · draft · `GEN-SCR-090` · layer ui · coverage partial · typed: “screen create-pricing-sheet (/orders/quick-create)”

### GEN-SCR-091 — Required pricing-sheet columns are marked

- **Why it matters.** Verify the screen identifies which line-item columns are mandatory. Written from the create-pricing-sheet screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/14-inventory-create-pricing-sheet.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Whether Product, Product Variant, Quantity Requested, Delivery location, Price, Quantity Available, and Total Amount show required markers.; Whether GST omits its required marker..
- **Setup.** Open the create-pricing-sheet screen with Items 2 displayed.
- **Steps.** 1. Inspect the column headers. 2. Compare the required markers on each column.
- **Expected.** Product, Product Variant, Quantity Requested, Delivery location, Price, Quantity Available, and Total Amount show required markers. GST does not show a required marker.
- **Oracle.** What the tester sees on the create-pricing-sheet screen.
- **Trace.** P0 · draft · `GEN-SCR-091` · layer ui · coverage partial · typed: “screen create-pricing-sheet (/orders/quick-create)”

### GEN-SCR-092 — Saving a draft updates the existing draft instead of creating a duplicate

- **Why it matters.** Verify the first save creates a draft and a later save updates that draft. Written from the create-pricing-sheet screen; grounded in R-FCR-014-4 (src/views/projectCreation/projectCreation.jsx:2259-2269); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/14-inventory-create-pricing-sheet.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The UI does not expose the draft's persistent identifier, so it cannot prove that the second save updated the same backend record rather than replacing it with a new record having the same title..
- **Setup.** Open a new unsaved create-pricing-sheet screen with the two existing line items.
- **Steps.** 1. Enter a unique value in Enter the title of the project. 2. Click Save as draft. 3. Wait for the save to complete. 4. Change the value in Enter the title of the project. 5. Click Save as draft again.
- **Expected.** The first save creates one draft. The second save updates the same draft with the new title and does not create a second draft.
- **Oracle.** The screen behaves as R-FCR-014-4 says: First save → `POST /event_groups` `{status:"draft", title, line_items:[{product_uuid, quantity:{unitSymbol,value}, product_quality_uuid, serial_number, pr_line_item_uuid, pr_id}]}`; later saves → `PAT
- **Trace.** P0 · draft · `GEN-SCR-092` · layer ui · coverage partial · typed: “screen create-pricing-sheet (/orders/quick-create)”

### GEN-SCR-093 — Publish shows the schedule confirmation before completion

- **Why it matters.** Verify Publish displays the event schedule summary and confirmation step. Written from the create-pricing-sheet screen; grounded in R-FCR-020-3 (src/views/eventCreation/components/footer/confirmModal.jsx:150-181); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/14-inventory-create-pricing-sheet.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact dynamic ending time corresponding to the 30-minute duration; The specific invited vendor identity in the confirmation summary when the case does not name a vendor; unconfirmed label "30" (expect_text) — not among the labels known from the app nor in the case.
- **Setup.** Open a valid event setup with at least one participant and leave the displayed 30-minute schedule unchanged.
- **Steps.** 1. Click Publish. 2. Do not confirm the publish action.
- **Expected.** A publish confirmation appears. It shows "Starts on: Now" and an ending time with the 30-minute duration, including the event's vendor and schedule summary. The event is not published until the confirmation is completed.
- **Oracle.** The screen behaves as R-FCR-020-3 says: Per stage: "Starts on:" (date-time or "Now"), "Ending at: <date-time> (<duration>)", "Evaluation time:" when > 0, "Vendors invited:" de-duplicated count — src/views/eventCreation/components/footer/con
- **Trace.** P0 · draft · `GEN-SCR-093` · layer ui · coverage partial · typed: “screen create-pricing-sheet (/orders/quick-create)”

### GEN-SCR-094 — Reject publishing when the project title is empty

- **Why it matters.** The project cannot be published without a title. Written from the create-technical-questionnaire screen; grounded in R-FCR-013-1 (src/views/projectCreation/projectCreation.jsx:1599-1602); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/18-inventory-create-technical-questionnaire.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Have at least one vendor participant and one line item configured. Leave the title empty.
- **Steps.** 1. Click "Publish".
- **Expected.** The event is not published. The message "Please fill project title!" appears.
- **Oracle.** The screen behaves as R-FCR-013-1 says: Publish with empty project title → "Please fill project title!" before any other check; a whitespace-only title passes (truthiness check) — src/views/projectCreation/projectCreation.jsx:1599-1602
- **Trace.** P0 · draft · `GEN-SCR-094` · layer ui · coverage full · typed: “screen create-technical-questionnaire (/orders/quick-create)”

### GEN-SCR-095 — Reject publishing when no vendor is added

- **Why it matters.** Publishing must stop when the project has no participants. Written from the create-technical-questionnaire screen; grounded in R-FCR-017-1 (src/views/projectCreation/projectCreation.jsx:1604-1609); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/18-inventory-create-technical-questionnaire.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog cannot explicitly clear or verify that the event audience is empty; omitting invite_vendor relies on the create screen starting with no valid participants..
- **Setup.** Enter a valid project title and leave the project without participants.
- **Steps.** 1. Click "Publish".
- **Expected.** The event is not published. The message "Please add participants to proceed!" appears.
- **Oracle.** The screen behaves as R-FCR-017-1 says: No participant in the project → "Please add participants to proceed!" (stops) — src/views/projectCreation/projectCreation.jsx:1604-1609
- **Trace.** P0 · draft · `GEN-SCR-095` · layer ui · coverage partial · typed: “screen create-technical-questionnaire (/orders/quick-create)”

### GEN-SCR-096 — Show blocked vendors as unavailable during vendor search

- **Why it matters.** Blacklisted vendors must not be selectable for a new event. Written from the create-technical-questionnaire screen; grounded in R-FCR-035-3 (src/views/projectCreation/projectCreation.jsx:255-256); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/18-inventory-create-technical-questionnaire.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The test does not name the blacklisted vendor, so the exact vendor cannot be searched or matched.; No catalog step can assert that the specific matching vendor search result is disabled; expect_disabled requires a known control name..
- **Setup.** Have a blacklisted vendor available in the vendor search results.
- **Steps.** 1. Open "Search vendors you want to add". 2. Search for the blacklisted vendor.
- **Expected.** The blacklisted vendor appears disabled and is labeled "Blocked".
- **Oracle.** The screen behaves as R-FCR-035-3 says: In search results blacklisted vendors are disabled with "Blocked"; TNA vendors are disabled with "TNA" unless the URL has `allowTnaVendorsToBid=true` (so on a fresh create every TNA vendor is unselect
- **Trace.** P1 · draft · `GEN-SCR-096` · layer ui · coverage partial · typed: “screen create-technical-questionnaire (/orders/quick-create)”

### GEN-SCR-097 — Open the line-item details from Items 2

- **Why it matters.** The item control should expose the two configured items for review. Written from the create-technical-questionnaire screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/18-inventory-create-technical-questionnaire.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the technical questionnaire screen with two items present.
- **Steps.** 1. Click "Items 2".
- **Expected.** The line-item details view or panel opens and shows the two items with their specification, description, and vendor response columns.
- **Oracle.** What the tester sees on the create-technical-questionnaire screen.
- **Trace.** P1 · draft · `GEN-SCR-097` · layer ui · coverage full · typed: “screen create-technical-questionnaire (/orders/quick-create)”

### GEN-SCR-098 — Open vendor invitation from Invite Vendor

- **Why it matters.** The vendor invitation control should open the participant-selection flow. Written from the create-technical-questionnaire screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/18-inventory-create-technical-questionnaire.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Remain on the technical questionnaire screen.
- **Steps.** 1. Click "Invite Vendor".
- **Expected.** The vendor invitation or participant-selection view opens, with "Search vendors you want to add" available.
- **Oracle.** What the tester sees on the create-technical-questionnaire screen.
- **Trace.** P1 · draft · `GEN-SCR-098` · layer ui · coverage full · typed: “screen create-technical-questionnaire (/orders/quick-create)”

### GEN-SCR-099 — Open technical-stage configuration

- **Why it matters.** The stage control should open the configuration for the current technical stage. Written from the create-technical-questionnaire screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/18-inventory-create-technical-questionnaire.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog has no dedicated assertion for the technical-stage configuration drawer or its complete configuration state; visibility of the Technical Stage view is used as the closest observable outcome..
- **Setup.** Remain on the selected Technical Stage tab.
- **Steps.** 1. Click "Technical Stage".
- **Expected.** The technical-stage configuration view or drawer opens for the current stage.
- **Oracle.** What the tester sees on the create-technical-questionnaire screen.
- **Trace.** P1 · draft · `GEN-SCR-099` · layer ui · coverage partial · typed: “screen create-technical-questionnaire (/orders/quick-create)”

### GEN-SCR-100 — Publish confirmation shows the scheduled event summary

- **Why it matters.** Verify that the publish confirmation summarizes timing and invited vendors. Written from the create-schedule screen; grounded in R-FCR-020-3 (src/views/eventCreation/components/footer/confirmModal.jsx:150-181); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/21-inventory-create-schedule.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog cannot prove that the displayed vendor count is de-duplicated from duplicate vendor invitations.; The catalog cannot compare the displayed dynamic ending time directly against the schedule configuration; it can only check visible summary text and the configured duration.; unconfirmed label "Ends on:" (expect_text) — not among the labels known from the app nor in the case; unconfirmed label "30" (expect_text) — not among the labels known from the app nor in the case; unconfirmed label "2" (expect_text) — not among the labels known from the app nor in the case.
- **Setup.** Use the displayed start chip. Add two vendors, including the same vendor twice if the vendor selector permits it. Complete the required line-item values.
- **Steps.** 1. Click "Publish". 2. Review the event summary in the confirmation dialog. 3. Close the dialog without confirming.
- **Expected.** The summary shows "Starts on: Now", an ending time with the duration, and "Vendors invited:" with the de-duplicated vendor count. The displayed timing matches the event schedule.
- **Oracle.** The screen behaves as R-FCR-020-3 says: Per stage: "Starts on:" (date-time or "Now"), "Ending at: <date-time> (<duration>)", "Evaluation time:" when > 0, "Vendors invited:" de-duplicated count — src/views/eventCreation/components/footer/con
- **Trace.** P1 · draft · `GEN-SCR-100` · layer ui · coverage partial · typed: “screen create-schedule (/orders/quick-create)”

### GEN-SCR-101 — Custom duration requires an end time before publishing

- **Why it matters.** Verify the refusal when Custom duration has no end time. Written from the create-schedule screen; grounded in R-FCR-022-7 (src/views/projectCreation/components/projectScheduler/stageSchedulerCard/stageSchedulerCard.jsx:302-314); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/21-inventory-create-schedule.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the schedule settings. Use "Duration" to choose Custom duration. Do not enter an end time.
- **Steps.** 1. Close the duration popover. 2. Click "Save Schedule". 3. Click "Publish".
- **Expected.** "Save Schedule" accepts the schedule, but publishing is refused with exactly "Please add end time for the event".
- **Oracle.** The screen behaves as R-FCR-022-7 says: choosing "Custom duration" first sets end to undefined; closing the popover then Save passes (NaN comparisons) and publish fails "Please add end time for the event" — stageSchedulerCard.jsx:302-314. B
- **Trace.** P0 · draft · `GEN-SCR-101` · layer ui · coverage full · typed: “screen create-schedule (/orders/quick-create)”

### GEN-SCR-102 — Back discards unsaved schedule changes

- **Why it matters.** Verify that schedule changes are not stored until Save Schedule succeeds. Written from the create-schedule screen; grounded in R-FCR-022-6 (src/views/projectCreation/components/projectScheduler/projectScheduler.jsx:83-111); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/21-inventory-create-schedule.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Directly select the schedule control labeled "Select time" and verify the exact changed time because no dedicated schedule-time selection step is available.; Directly assert the schedule's previously saved time value; the plan compares the captured Start time display instead..
- **Setup.** Open an existing unsaved schedule state and note the current value in "Select time".
- **Steps.** 1. Change "Select time". 2. Click "Back". 3. Reopen the schedule screen without saving.
- **Expected.** The changed time is not retained. The schedule returns to its previously saved values.
- **Oracle.** The screen behaves as R-FCR-022-6 says: Nothing is stored on the stage until Save Schedule passes; Back discards — projectScheduler.jsx:83-111, 37-39
- **Trace.** P1 · draft · `GEN-SCR-102` · layer ui · coverage partial · typed: “screen create-schedule (/orders/quick-create)”

### GEN-SCR-103 — Recurring configuration is copied to every stage

- **Why it matters.** Verify that saving recurring settings applies the same configuration to all stages. Written from the create-schedule screen; grounded in R-FCR-021-3 (src/views/projectCreation/components/projectScheduler/projectScheduler.jsx:92-106); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/21-inventory-create-schedule.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use a project containing both the Technical Stage and RFQ stages.
- **Steps.** 1. Select "Technical Stage". 2. Turn on "Mark as Recurring EventSet this event to repeat automaticall". 3. Configure the recurrence. 4. Click "Save Schedule". 5. Select "RFQ". 6. Review the recurrence settings.
- **Expected.** The RFQ stage has the same recurring configuration as the Technical Stage, including the recurrence type, interval, and ending settings.
- **Oracle.** The screen behaves as R-FCR-021-3 says: Save Schedule copies the same recurring config onto every stage — src/views/projectCreation/components/projectScheduler/projectScheduler.jsx:92-106
- **Trace.** P1 · draft · `GEN-SCR-103` · layer ui · coverage full · typed: “screen create-schedule (/orders/quick-create)”

### GEN-SCR-104 — Select date remains unavailable for a Now start

- **Why it matters.** Verify the displayed disabled state and the relationship between immediate and scheduled starts. Written from the create-schedule screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/21-inventory-create-schedule.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the schedule screen with "Start now" selected.
- **Steps.** 1. Review "Select date". 2. Review "Select time". 3. Change "Start now" to a scheduled start option.
- **Expected.** "Select date" is disabled while "Start now" is selected. After choosing a scheduled start option, the date and time controls become available for entry.
- **Oracle.** What the tester sees on the create-schedule screen.
- **Trace.** P1 · draft · `GEN-SCR-104` · layer ui · coverage full · typed: “screen create-schedule (/orders/quick-create)”

### GEN-SCR-105 — Duration shows the configured preset values

- **Why it matters.** Confirms that the duration menu provides the supported default or template duration presets. Written from the create-participants screen; grounded in R-FCR-022-5 (src/views/projectCreation/components/projectScheduler/constants.js:1-1); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/23-inventory-create-participants.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Verify the complete set of available duration presets, including the configured values or the exact defaults of 30 minutes, 1 hour, 4 hours, and 24 hours.; Verify that the schedule summary displays the exact duration preset selected..
- **Setup.** Open the schedule drawer for an RFQ event using the default duration configuration.
- **Steps.** 1. Open Duration. 2. Review the available duration choices. 3. Choose a duration preset. 4. Review the schedule summary.
- **Expected.** The menu contains the configured duration presets, or the defaults 30 mins, 1 hour, 4 hours, and 24 hours. The schedule summary reflects the selected duration.
- **Oracle.** The screen behaves as R-FCR-022-5 says: Duration menu = template `event_duration_predefined_values[mode].event_duration` or default 30 min, 1 h, 4 h, 24 h; switching to "Fixed time" presets now + 30 min — stageSchedulerCard.jsx:68-71, 213-2
- **Trace.** P1 · draft · `GEN-SCR-105` · layer ui · coverage partial · typed: “screen create-participants (/orders/quick-create)”

### GEN-SCR-106 — Recurring event changes the Publish label

- **Why it matters.** Verifies that the publish action reflects the current stage's recurring status. Written from the create-participants screen; grounded in R-FCR-013-6 (src/views/projectCreation/projectCreation.jsx:3390-3400); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/23-inventory-create-participants.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open a new RFQ event that is not currently recurring.
- **Steps.** 1. Turn on Mark as Recurring EventSet this event to repeat automaticall. 2. Review the publish action label.
- **Expected.** The action label changes from "Publish" to "Save Recurring Event".
- **Oracle.** The screen behaves as R-FCR-013-6 says: Publish label: "Send to Auction team" when publishToDraft, "Save Recurring Event" when the CURRENT stage is recurring, else "Publish" — src/views/projectCreation/projectCreation.jsx:3390-3400
- **Trace.** P1 · draft · `GEN-SCR-106` · layer ui · coverage full · typed: “screen create-participants (/orders/quick-create)”

### GEN-SCR-107 — Required line-item columns are marked

- **Why it matters.** Confirms which line-item values the screen requires before an RFQ can be completed. Written from the create-participants screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh23wdj/23-inventory-create-participants.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Whether Product, Product Variant, Quantity Requested, Delivery location, Price, Quantity Available, and Total Amount headers show required markers; Whether the GST header lacks a required marker.
- **Setup.** Open a new RFQ event with the items grid visible.
- **Steps.** 1. Review the column headers in the items grid. 2. Compare the required markers on each header.
- **Expected.** Product, Product Variant, Quantity Requested, Delivery location, Price, Quantity Available, and Total Amount show required markers. GST does not show a required marker.
- **Oracle.** What the tester sees on the create-participants screen.
- **Trace.** P1 · draft · `GEN-SCR-107` · layer ui · coverage none · typed: “screen create-participants (/orders/quick-create)”

### GEN-SCR-108 — RFP opens the RFP event setup

- **Why it matters.** Verify the event type control opens or selects the RFP setup. Written from the create-single-stage screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvh2lqms/02-inventory-create-single-stage.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open create-single-stage.
- **Steps.** 1. Click "RFP".
- **Expected.** The RFP event setup opens or the current event type changes to RFP. No unrelated page is opened.
- **Oracle.** What the tester sees on the create-single-stage screen.
- **Trace.** P1 · draft · `GEN-SCR-108` · layer ui · coverage full · typed: “screen create-single-stage (/orders/quick-create)”

### GEN-SCR-109 — Events returns to the events list

- **Why it matters.** Verify the navigation link opens the events area. Written from the create-single-stage screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvh2lqms/02-inventory-create-single-stage.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open create-single-stage.
- **Steps.** 1. Click "Events".
- **Expected.** The events list opens and the create-single-stage screen is left.
- **Oracle.** What the tester sees on the create-single-stage screen.
- **Trace.** P1 · draft · `GEN-SCR-109` · layer ui · coverage full · typed: “screen create-single-stage (/orders/quick-create)”

### GEN-SCR-110 — Template selection explains why it is disabled

- **Why it matters.** Verify the disabled template control explains the missing prerequisite. Written from the create-single-stage screen; grounded in R-FCR-016-2 (src/views/projectCreation/projectCreation.jsx:1457-1481); screenshot procol-ui-tests/evidence/walk-single-stage-mvh2lqms/02-inventory-create-single-stage.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the screen with no line items and no selected template.
- **Steps.** 1. Hover over "Select Templates".
- **Expected.** The control remains disabled and its tooltip says "Please add line items".
- **Oracle.** The screen behaves as R-FCR-016-2 says: Disabled with tooltip "Please select template for <stage title>" for any non-RFP stage without a template, or "Please add line items" — src/views/projectCreation/projectCreation.jsx:1457-1481
- **Trace.** P1 · draft · `GEN-SCR-110` · layer ui · coverage full · typed: “screen create-single-stage (/orders/quick-create)”

### GEN-SCR-111 — Terms and Conditions is unavailable before its prerequisite is met

- **Why it matters.** Verify the screen prevents opening Terms & Conditions while the control is disabled. Written from the create-single-stage screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvh2lqms/02-inventory-create-single-stage.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open create-single-stage in its initial state.
- **Steps.** 1. Observe "Terms & Conditions". 2. Attempt to click "Terms & Conditions".
- **Expected.** "Terms & Conditions" is visibly disabled and does not open a terms editor.
- **Oracle.** What the tester sees on the create-single-stage screen.
- **Trace.** P1 · draft · `GEN-SCR-111` · layer ui · coverage full · typed: “screen create-single-stage (/orders/quick-create)”

### GEN-SCR-112 — Required event title remains empty when not provided

- **Why it matters.** Verify an event cannot be published without a project title. Written from the create-single-stage screen; grounded in R-FCR-013-1 (src/views/projectCreation/projectCreation.jsx:1599-1602); screenshot procol-ui-tests/evidence/walk-single-stage-mvh2lqms/02-inventory-create-single-stage.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open create-single-stage with the title empty.
- **Steps.** 1. Click "Enter the title of this event". 2. Leave the field empty. 3. Observe "Publish Event".
- **Expected.** "Publish Event" remains disabled while the title is empty. The event is not published.
- **Oracle.** The screen behaves as R-FCR-013-1 says: Publish with empty project title → "Please fill project title!" before any other check; a whitespace-only title passes (truthiness check) — src/views/projectCreation/projectCreation.jsx:1599-1602
- **Trace.** P0 · draft · `GEN-SCR-112` · layer ui · coverage full · typed: “screen create-single-stage (/orders/quick-create)”

### GEN-SCR-113 — Publish is disabled until a template is selected

- **Why it matters.** Verify the disabled publish state explains that the auction stage needs a template. Written from the single-stage-configured-auction screen; grounded in R-FCR-016-2 (src/views/projectCreation/projectCreation.jsx:1457-1481); screenshot procol-ui-tests/evidence/walk-single-stage-mvh2lqms/04-inventory-single-stage-configured-auction.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: expected message "Please select template for Auction" is neither a known product message nor quoted by the case.
- **Setup.** Open an auction stage with line items and participants but without a selected template.
- **Steps.** 1. Hover over the disabled "Publish Event". 2. Read the tooltip. 3. Select "Select Templates". 4. Choose a template and save it. 5. Return to the event screen.
- **Expected.** The tooltip says "Please select template for <stage title>" with the current stage title. After a template is selected, the template-related disabled reason is removed from "Publish Event".
- **Oracle.** The screen behaves as R-FCR-016-2 says: Disabled with tooltip "Please select template for <stage title>" for any non-RFP stage without a template, or "Please add line items" — src/views/projectCreation/projectCreation.jsx:1457-1481
- **Trace.** P0 · draft · `GEN-SCR-113` · layer ui · coverage partial · typed: “screen single-stage-configured-auction (/orders/quick-create)”

### GEN-SCR-114 — Publishing without participants is refused

- **Why it matters.** Verify publishing stops when the project has no participants. Written from the single-stage-configured-auction screen; grounded in R-FCR-017-1 (src/views/projectCreation/projectCreation.jsx:1604-1609); screenshot procol-ui-tests/evidence/walk-single-stage-mvh2lqms/04-inventory-single-stage-configured-auction.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Guaranteeing that no tenant-audience participants are implicitly available for publishing; Verifying the participant view's exact close action beyond pressing Escape.
- **Setup.** Open an auction with a title, template, and line items, and ensure no participants are added.
- **Steps.** 1. Select "Participants". 2. Confirm that no participant is present. 3. Close the participant view. 4. Select "Publish Event".
- **Expected.** Publishing stops and the app shows "Please add participants to proceed!".
- **Oracle.** The screen behaves as R-FCR-017-1 says: No participant in the project → "Please add participants to proceed!" (stops) — src/views/projectCreation/projectCreation.jsx:1604-1609
- **Trace.** P0 · draft · `GEN-SCR-114` · layer ui · coverage partial · typed: “screen single-stage-configured-auction (/orders/quick-create)”

### GEN-SCR-115 — Participant search marks blocked and TNA vendors as unavailable

- **Why it matters.** Verify vendor eligibility labels are shown in the participant selection view. Written from the single-stage-configured-auction screen; grounded in R-FCR-035-3 (src/views/projectCreation/projectCreation.jsx:255-256); screenshot procol-ui-tests/evidence/walk-single-stage-mvh2lqms/04-inventory-single-stage-configured-auction.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Identify the specific blacklisted vendor and TNA vendor in the search results because the case does not provide vendor names and no catalog step can inspect result-row identity.; Assert that those specific vendor result rows are disabled/unavailable; the catalog has no participant-row disabled-state assertion tied to search results..
- **Setup.** Prepare an account with a blacklisted vendor and a TNA vendor available in the vendor search results. Use a fresh event without the allowTnaVendorsToBid URL parameter.
- **Steps.** 1. Select "Participants". 2. Inspect the vendor search results.
- **Expected.** The blacklisted vendor is disabled and marked "Blocked". The TNA vendor is disabled and marked "TNA".
- **Oracle.** The screen behaves as R-FCR-035-3 says: In search results blacklisted vendors are disabled with "Blocked"; TNA vendors are disabled with "TNA" unless the URL has `allowTnaVendorsToBid=true` (so on a fresh create every TNA vendor is unselect
- **Trace.** P1 · draft · `GEN-SCR-115` · layer ui · coverage partial · typed: “screen single-stage-configured-auction (/orders/quick-create)”

### GEN-SCR-116 — Disabled schedule and configuration controls show their current state

- **Why it matters.** Verify the controls that are unavailable on the current screen cannot be used before their prerequisites are met. Written from the single-stage-configured-auction screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvh2lqms/04-inventory-single-stage-configured-auction.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the supplied single-stage configured auction screen without changing its initial state.
- **Steps.** 1. Inspect "Savings". 2. Inspect "Terms & Conditions". 3. Inspect "Now - 01:23 am, 21st Oct ( 30 Mins )". 4. Inspect "Publish Event". 5. Inspect "Search vendors you want to add".
- **Expected.** All five controls appear disabled. No disabled control opens or changes the event when selected.
- **Oracle.** What the tester sees on the single-stage-configured-auction screen.
- **Trace.** P1 · draft · `GEN-SCR-116` · layer ui · coverage full · typed: “screen single-stage-configured-auction (/orders/quick-create)”

### GEN-SCR-117 — Custom duration without an end time blocks publishing

- **Why it matters.** Verify the missing-end-time validation after selecting a custom duration. Written from the single-stage-sheet screen; grounded in R-FCR-022-7 (src/views/projectCreation/components/projectScheduler/stageSchedulerCard/stageSchedulerCard.jsx:302-314); screenshot procol-ui-tests/evidence/walk-single-stage-mvh2lqms/09-inventory-single-stage-sheet.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact interaction with the displayed 'Now - 01:23 am, 21st Oct ( 30 Mins )' duration summary and confirmation that the custom-duration popover closes while its end time remains unset cannot be expressed precisely by a catalog step..
- **Setup.** Use an otherwise valid event with a title, required line-item data, and at least one participant.
- **Steps.** 1. Click "Now - 01:23 am, 21st Oct ( 30 Mins )". 2. Choose the custom duration option. 3. Close the duration popover without setting an end time. 4. Click "Publish Event".
- **Expected.** Publishing fails and the exact message "Please add end time for the event" appears.
- **Oracle.** The screen behaves as R-FCR-022-7 says: choosing "Custom duration" first sets end to undefined; closing the popover then Save passes (NaN comparisons) and publish fails "Please add end time for the event" — stageSchedulerCard.jsx:302-314. B
- **Trace.** P1 · draft · `GEN-SCR-117` · layer ui · coverage partial · typed: “screen single-stage-sheet (/orders/quick-create)”

### GEN-SCR-118 — Participants opens participant management

- **Why it matters.** Verify that the participant controls expose vendor management. Written from the single-stage-sheet screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvh2lqms/09-inventory-single-stage-sheet.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the event creation screen.
- **Steps.** 1. Click "Participants". 2. Click "Invite Vendor". 3. Use "Search vendors you want to add".
- **Expected.** The participant area opens, the vendor invitation flow opens, and the vendor search is available for finding vendors to add.
- **Oracle.** What the tester sees on the single-stage-sheet screen.
- **Trace.** P1 · draft · `GEN-SCR-118` · layer ui · coverage full · typed: “screen single-stage-sheet (/orders/quick-create)”

### GEN-SCR-119 — Display published stage columns and formatted values

- **Why it matters.** Verify published stage data, participant counts, date formatting, and conditional Stage Code visibility. Written from the auction-live screen; grounded in R-FLA-026-1 (src/views/projectDetails/components/publishedStagesTable.jsx:31-99); screenshot procol-ui-tests/evidence/walk-single-stage-mvh2lqms/14-inventory-auction-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Correlating each row's ref_id presence with whether its Stage Code is shown or omitted; Verifying the exact active/total Participants value for each row, including missing counts rendered as 0; Verifying that every populated date uses the expected DATE_TIME format rather than another rendered date string; unconfirmed label "-" (expect_text) — not among the labels known from the app nor in the case.
- **Setup.** Use a project with two published stages. Give one stage a ref_id and leave the other without a ref_id. Include a stage with missing participant counts and a stage with missing dates.
- **Steps.** 1. Click "Published Stages". 2. Review the published stages table. 3. Check the row with a ref_id. 4. Check the row without a ref_id. 5. Check rows with missing counts or dates.
- **Expected.** The table shows Stage Title, Pending Actions, Participants, Bidding Starts At, and Bidding Ends At. Participants shows active/total and missing values display as 0. Dates display as DATE_TIME values or "-". Stage Code is shown when a row has a ref_id and is omitted when no row has a ref_id.
- **Oracle.** The screen behaves as R-FLA-026-1 says: Columns: Stage Code (dropped when no row has `ref_id`), Stage Title, Pending Actions, Participants "active/total" (missing → 0), Bidding Starts At / Ends At (DATE_TIME or "-") — src/views/projectDetai
- **Trace.** P1 · draft · `GEN-SCR-119` · layer ui · coverage partial · typed: “screen auction-live (/project/Y2NwY1hk/details)”

### GEN-SCR-120 — Show response counts in panel headers

- **Why it matters.** Verify that the Line Items and Participants headers expose response counts. Written from the auction-live screen; grounded in R-FLA-018-4 (src/views/projectDetails/projectDetails.jsx:916-946); screenshot procol-ui-tests/evidence/walk-single-stage-mvh2lqms/14-inventory-auction-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Confirm that 3 and 2 are specifically response-count tags rather than other text within the Line Items and Participants panels.; unconfirmed label "3" (expect_text) — not among the labels known from the app nor in the case; unconfirmed label "2" (expect_text) — not among the labels known from the app nor in the case.
- **Setup.** Use a project whose line-item responses count to 3 and participant responses count to 2.
- **Steps.** 1. View the project details screen. 2. Inspect the Line Items and Participants panel headers.
- **Expected.** The Line Items header shows its response count as a count tag, and the Participants header shows its response count as a count tag. The displayed values are 3 and 2 respectively.
- **Oracle.** The screen behaves as R-FLA-018-4 says: Line Items / Participants panel headers show count tags from the line-item and participant responses — src/views/projectDetails/projectDetails.jsx:916-946, src/redux/project/selectors.js:867-876
- **Trace.** P1 · draft · `GEN-SCR-120` · layer ui · coverage partial · typed: “screen auction-live (/project/Y2NwY1hk/details)”

### GEN-SCR-121 — Filter participants with a debounced search

- **Why it matters.** Verify participant search behavior and the table page-size limit. Written from the auction-live screen; grounded in R-FLA-024-5 (src/views/projectDetails/components/participantsTable.jsx:265-267); screenshot procol-ui-tests/evidence/walk-single-stage-mvh2lqms/14-inventory-auction-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The unique vendor name or code to enter was not provided.; An explicit wait of at least 300 milliseconds for debounce cannot be expressed.; The matching participant cannot be asserted without the vendor name or code..
- **Setup.** Use a project with more than 20 participants and at least one participant whose name or code is unique.
- **Steps.** 1. Click "Search participants". 2. Enter the unique vendor name or code. 3. Wait at least 300 milliseconds. 4. Review the participant results. 5. Clear the search value. 6. Review the first page of results.
- **Expected.** The results filter after the debounce period and show the matching participant. With the search cleared, no page contains more than 20 participant rows. The participant table shows Vendor Name, Vendor Code, Location, Type, Tags, and Reason for not participating.
- **Oracle.** The screen behaves as R-FLA-024-5 says: Search debounced 300 ms; page size 20; proposal page reuses this table without the reject option — src/views/projectDetails/components/participantsTable.jsx:265-267, 397, src/views/projectProposal/pro
- **Trace.** P1 · draft · `GEN-SCR-121` · layer ui · coverage partial · typed: “screen auction-live (/project/Y2NwY1hk/details)”

### GEN-SCR-122 — Open a draft RFQ-to-auction stage

- **Why it matters.** Verify that selecting a draft RFQ-to-auction stage opens the create screen with the draft event context. Written from the auction-live screen; grounded in R-FLA-026-2 (src/views/projectDetails/components/publishedStagesTable.jsx:15-29); screenshot procol-ui-tests/evidence/walk-single-stage-mvh2lqms/14-inventory-auction-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Verify that the screen receives the draftEventId for the selected stage.; Verify that no auction-team check blocks navigation internally..
- **Setup.** Use a project containing a draft RFQ-to-auction stage with a known draft event ID.
- **Steps.** 1. Click "Published Stages". 2. Click the draft stage named "spine-ui-automation-68664046". 3. Wait for navigation to finish.
- **Expected.** The create screen opens for the draft RFQ-to-auction stage. The screen receives the draftEventId for that stage. No auction-team check blocks navigation.
- **Oracle.** The screen behaves as R-FLA-026-2 says: Clicking a draft rfq→auction stage opens the create screen with `draftEventId` (no auction-team check); other stages switch tab — src/views/projectDetails/components/publishedStagesTable.jsx:15-29
- **Trace.** P0 · draft · `GEN-SCR-122` · layer ui · coverage partial · typed: “screen auction-live (/project/Y2NwY1hk/details)”

### GEN-SCR-123 — Show overview project metadata

- **Why it matters.** Verify the Overview panel displays the project identifier, creation timestamp, and conditional open-tender value. Written from the auction-live screen; grounded in R-FLA-018-1 (src/views/projectDetails/projectDetails.jsx:545-564); screenshot procol-ui-tests/evidence/walk-single-stage-mvh2lqms/14-inventory-auction-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Repeat the check with is_show_under_open_events disabled because no catalog step changes or verifies that tenant configuration.; Assert the exact dynamic project ID format such as #12345.; Assert that Created at contains a valid DATE_TIME value.; Assert that Open Tender Event displays Yes only when the setting is enabled..
- **Setup.** Use a project with refId 12345 and a known creation timestamp. Run once with is_show_under_open_events enabled and once with it disabled.
- **Steps.** 1. Click "Overview". 2. Review the project metadata. 3. Repeat with is_show_under_open_events disabled.
- **Expected.** Project ID displays as "#12345" and Created at displays as DATE_TIME. Open Tender Event displays "Yes" only when is_show_under_open_events is enabled; it is not shown as Yes when the configuration is disabled.
- **Oracle.** The screen behaves as R-FLA-018-1 says: Overview: "Project ID" = `#<refId>`, "Created at" = DATE_TIME, "Open Tender Event: Yes" only when config `is_show_under_open_events` — src/views/projectDetails/projectDetails.jsx:545-564
- **Trace.** P1 · draft · `GEN-SCR-123` · layer ui · coverage partial · typed: “screen auction-live (/project/Y2NwY1hk/details)”

### GEN-SCR-124 — Publish is blocked when no template or BOQ sheet is provided

- **Why it matters.** Verify the initial validation message and the controls that represent the missing prerequisites. Written from the create-boq screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-boq-draft-mvh2rgjh/02-inventory-create-boq.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open /orders/quick-create with no template and no BOQ sheet.
- **Steps.** 1. Click "Publish".
- **Expected.** The event is not published. The screen shows "Please choose a template and upload a BOQ sheet to proceed". "Select Templates" remains disabled until the screen permits template selection, and "Add Attachments" is available for uploading the BOQ sheet.
- **Oracle.** What the tester sees on the create-boq screen.
- **Trace.** P0 · draft · `GEN-SCR-124` · layer ui · coverage full · typed: “screen create-boq (/orders/quick-create)”

### GEN-SCR-125 — Add Attachments opens the BOQ upload flow

- **Why it matters.** Verify that the control provided for the required BOQ sheet opens an attachment or upload interface. Written from the create-boq screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-boq-draft-mvh2rgjh/02-inventory-create-boq.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Confirm that the uploaded file is specifically recognized as a BOQ sheet.
- **Setup.** Open /orders/quick-create without an uploaded BOQ sheet.
- **Steps.** 1. Click "Add Attachments".
- **Expected.** An attachment or file-upload interface opens, allowing the tester to choose a BOQ sheet. The create screen remains available after closing the interface.
- **Oracle.** What the tester sees on the create-boq screen.
- **Trace.** P1 · draft · `GEN-SCR-125` · layer ui · coverage partial · typed: “screen create-boq (/orders/quick-create)”

### GEN-SCR-126 — Add T&Cs opens terms and conditions editing

- **Why it matters.** Verify that terms can be added from the create screen and that the terms control reflects the configured state. Written from the create-boq screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-boq-draft-mvh2rgjh/02-inventory-create-boq.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Entering or selecting terms and conditions in the editor or picker; Saving terms and returning to the create screen; Asserting that the Terms & Conditions configuration becomes enabled after saved terms are added.
- **Setup.** Open /orders/quick-create with no terms and conditions configured.
- **Steps.** 1. Click "Add T&Cs".
- **Expected.** A terms and conditions editor or picker opens. After closing it without saving, "Terms & Conditions" remains disabled. After adding terms and returning to the screen, the terms configuration is available from the create screen.
- **Oracle.** What the tester sees on the create-boq screen.
- **Trace.** P1 · draft · `GEN-SCR-126` · layer ui · coverage partial · typed: “screen create-boq (/orders/quick-create)”

### GEN-SCR-127 — Open the Messages panel

- **Why it matters.** Verify that the messaging control opens its related panel. Written from the responses-bids-in screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh2tsju/02-inventory-responses-bids-in.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact Messages panel/drawer identity if it is not exposed as an accessible dialog; That opening Messages leaves the project URL unchanged.
- **Setup.** Remain on the RFQ Responses screen.
- **Steps.** 1. Click "Messages".
- **Expected.** A Messages panel or drawer opens without leaving the project.
- **Oracle.** What the tester sees on the responses-bids-in screen.
- **Trace.** P1 · draft · `GEN-SCR-127` · layer ui · coverage partial · typed: “screen responses-bids-in (/project/Y2taY1hk/WlhEa2Rr)”

### GEN-SCR-128 — Open the Actions menu

- **Why it matters.** Verify that available project actions are exposed from the Actions control. Written from the responses-bids-in screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh2tsju/02-inventory-responses-bids-in.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Remain on the RFQ Responses screen.
- **Steps.** 1. Click "Actions".
- **Expected.** An actions menu opens.
- **Oracle.** What the tester sees on the responses-bids-in screen.
- **Trace.** P1 · draft · `GEN-SCR-128` · layer ui · coverage full · typed: “screen responses-bids-in (/project/Y2taY1hk/WlhEa2Rr)”

### GEN-SCR-129 — Change the response table view by product

- **Why it matters.** Verify that the response table supports the displayed product-based view. Written from the responses-bids-in screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh2tsju/02-inventory-responses-bids-in.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: A dedicated assertion that the response table's active view is specifically the product-based view rather than merely showing product-related content..
- **Setup.** Remain on the RFQ Responses screen with the response row visible.
- **Steps.** 1. Click "View by Product".
- **Expected.** The response table changes to the product-based view and remains on the Responses screen.
- **Oracle.** What the tester sees on the responses-bids-in screen.
- **Trace.** P1 · draft · `GEN-SCR-129` · layer ui · coverage partial · typed: “screen responses-bids-in (/project/Y2taY1hk/WlhEa2Rr)”

### GEN-SCR-130 — Open a new project version flow

- **Why it matters.** Verify that creating a new version opens the appropriate flow. Written from the responses-bids-in screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh2tsju/02-inventory-responses-bids-in.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Verify that no new version is created in the backend before confirmation.
- **Setup.** Remain on the RFQ Responses screen.
- **Steps.** 1. Click "Create New Version".
- **Expected.** A create-new-version flow opens. No new version is created without further confirmation.
- **Oracle.** What the tester sees on the responses-bids-in screen.
- **Trace.** P1 · draft · `GEN-SCR-130` · layer ui · coverage partial · typed: “screen responses-bids-in (/project/Y2taY1hk/WlhEa2Rr)”

### GEN-SCR-131 — Verify Overview project details

- **Why it matters.** Verify the Overview details use the required project identifier and date formats. Written from the responses-bids-in screen; grounded in R-FLA-018-1 (src/views/projectDetails/projectDetails.jsx:545-564); screenshot procol-ui-tests/evidence/walk-compare-award-mvh2tsju/02-inventory-responses-bids-in.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Verify the Project ID equals the exact value "#<refId>".; Verify that Created at contains a valid date and time value rather than only the field label.; Verify the Open Tender Event: Yes indicator appears only when open-tender configuration is enabled.; Inspect or change the open-tender configuration state..
- **Setup.** Use a project with a known refId and created timestamp. Remain on the project screen.
- **Steps.** 1. Click "Project Details".
- **Expected.** The overview shows Project ID as "#<refId>" and Created at as a date and time. "Open Tender Event: Yes" appears only when the open-tender configuration is enabled.
- **Oracle.** The screen behaves as R-FLA-018-1 says: Overview: "Project ID" = `#<refId>`, "Created at" = DATE_TIME, "Open Tender Event: Yes" only when config `is_show_under_open_events` — src/views/projectDetails/projectDetails.jsx:545-564
- **Trace.** P1 · draft · `GEN-SCR-131` · layer ui · coverage partial · typed: “screen responses-bids-in (/project/Y2taY1hk/WlhEa2Rr)”

### GEN-SCR-132 — Show response panel count tags

- **Why it matters.** Verifies that response panels display counts for line-item and participant responses. Written from the analytics screen; grounded in R-FLA-018-4 (src/views/projectDetails/projectDetails.jsx:916-946); screenshot procol-ui-tests/evidence/walk-compare-award-mvh2tsju/04-inventory-analytics.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Assert the line-item response panel header displays a count tag.; Assert the participant response panel header displays a count tag.; Assert the two panel count tags match their respective line-item and participant response counts..
- **Setup.** Use a project with known line-item response and participant response counts.
- **Steps.** 1. Click "Responses". 2. Inspect the line-item and participant panel headers.
- **Expected.** The panel headers show count tags matching the line-item response count and participant response count.
- **Oracle.** The screen behaves as R-FLA-018-4 says: Line Items / Participants panel headers show count tags from the line-item and participant responses — src/views/projectDetails/projectDetails.jsx:916-946, src/redux/project/selectors.js:867-876
- **Trace.** P1 · draft · `GEN-SCR-132` · layer ui · coverage none · typed: “screen analytics (/project/Y2taY1hk/WlhEa2Rr)”

### GEN-SCR-133 — Start Clara awarding analysis

- **Why it matters.** Verifies the awarding flow when Clara has an analyze_data todo. Written from the analytics screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/walk-compare-award-mvh2tsju/04-inventory-analytics.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact control for starting the available awarding analysis is not defined in the catalog; unconfirmed label: Start Awarding Analysis; The returned redirect URL cannot be captured or compared dynamically; unconfirmed label "Start Awarding Analysis" (click) — not among the labels known from the app nor in the case.
- **Setup.** Use a project for which Clara returns an analyze_data todo and a redirect URL.
- **Steps.** 1. Click "Ask Clara". 2. Start the available awarding analysis.
- **Expected.** The app shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned redirect URL.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P1 · draft · `GEN-SCR-133` · layer ui · coverage partial · typed: “screen analytics (/project/Y2taY1hk/WlhEa2Rr)”

### GEN-SCR-134 — Open project messages

- **Why it matters.** Verifies what the Messages action opens from the project screen. Written from the analytics screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh2tsju/04-inventory-analytics.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: That the browser remains on the same project route after opening Messages.; The specific messages view or drawer content, beyond a visible dialog surface..
- **Setup.** Remain on this project screen.
- **Steps.** 1. Click "Messages".
- **Expected.** The project messages view or drawer opens without leaving the project screen.
- **Oracle.** What the tester sees on the analytics screen.
- **Trace.** P2 · draft · `GEN-SCR-134` · layer ui · coverage partial · typed: “screen analytics (/project/Y2taY1hk/WlhEa2Rr)”

### GEN-SCR-135 — Open a non-draft vendor proposal

- **Why it matters.** Verify that a non-draft proposal opens its proposal page with the lot number. Written from the master-qcs-bids-in screen; grounded in R-FLA-030-2 (src/components/masterQcs/masterQcs.jsx:354-391); screenshot procol-ui-tests/evidence/walk-compare-award-mvh2tsju/06-inventory-master-qcs-bids-in.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact proposal URL including the dynamic project id, proposalUuid, and lotNo query value; Verification that the selected proposal is non-draft.
- **Setup.** Use a lot whose proposal for QA_Platform Vendor 1 1790820862139 has a non-draft status.
- **Steps.** 1. Click QA_Platform Vendor 1 1790820862139.
- **Expected.** The proposal page opens at /project/<id>/proposal/<proposalUuid>?lotNo=<lotNo>.
- **Oracle.** The screen behaves as R-FLA-030-2 says: Draft proposal → `/awarding/:id?lotNo=`; non-draft → `/project/:id/proposal/:proposalUuid?lotNo=`; contracts non-draft → `/contract-details?contracts_uuids=` — src/components/masterQcs/masterQcs.jsx:3
- **Trace.** P0 · draft · `GEN-SCR-135` · layer ui · coverage partial · typed: “screen master-qcs-bids-in (/project/Y2taY1hk/master_qcs)”

### GEN-SCR-136 — Toggle hidden fields

- **Why it matters.** Verify that the field-visibility control changes the QCS display. Written from the master-qcs-bids-in screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh2tsju/06-inventory-master-qcs-bids-in.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Assert that every bid-detail field, rather than the known Price field, is hidden and restored as a group..
- **Setup.** Remain on the current Master QCS screen with the bid values visible.
- **Steps.** 1. Click Hide fields. 2. Observe the bid details. 3. Click Hide fields again.
- **Expected.** The bid detail fields are hidden after the first click and visible again after the second click.
- **Oracle.** What the tester sees on the master-qcs-bids-in screen.
- **Trace.** P1 · draft · `GEN-SCR-136` · layer ui · coverage partial · typed: “screen master-qcs-bids-in (/project/Y2taY1hk/master_qcs)”

### GEN-SCR-137 — Download the QCS report

- **Why it matters.** Verify that the report control starts a report download. Written from the master-qcs-bids-in screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh2tsju/06-inventory-master-qcs-bids-in.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Whether a report download starts; Whether the downloaded report file is present in the browser or filesystem.
- **Setup.** Remain on the current Master QCS screen.
- **Steps.** 1. Click Download Report.
- **Expected.** A report download starts, or the browser shows the downloaded report file.
- **Oracle.** What the tester sees on the master-qcs-bids-in screen.
- **Trace.** P1 · draft · `GEN-SCR-137` · layer ui · coverage none · typed: “screen master-qcs-bids-in (/project/Y2taY1hk/master_qcs)”

### GEN-SCR-138 — Show the awarded-vendor summary when no vendor is awarded

- **Why it matters.** Confirms the summary handles an empty award correctly and displays the vendor counter. Written from the awarding screen; grounded in R-FLA-032-4 (src/views/awardingFlow/constants.jsx:13-25); screenshot procol-ui-tests/evidence/walk-compare-award-mvh2tsju/08-inventory-awarding.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The absence of a vendor summary specifically containing awarded amounts or awarded items cannot be asserted semantically because the catalog has no region- or field-level step for that summary..
- **Setup.** Use the current proposal with no awarded vendors.
- **Steps.** 1. Open the awarding screen. 2. Inspect the awarded-vendor summary.
- **Expected.** The counter shows "Awarded Vendors (0/1)". The summary shows "No vendors awarded" and does not show a vendor summary with awarded amounts or items.
- **Oracle.** The screen behaves as R-FLA-032-4 says: Summary card per vendor: name, vendor code, tag, "L1 Amount", "L1 Items Awarded", "Non L1 Amount", "Non L1 Items Awarded", "Total Amount", "Awarded Items"; none → "No vendors awarded" — src/views/awar
- **Trace.** P1 · draft · `GEN-SCR-138` · layer ui · coverage partial · typed: “screen awarding (/awarding/Y2taY1hk)”

### GEN-SCR-139 — Open the hidden-fields list

- **Why it matters.** Confirms that the hidden-field control opens the available hidden-field view. Written from the awarding screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh2tsju/08-inventory-awarding.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Assert that the displayed fields exactly match the columns currently hidden from the awarding sheet..
- **Setup.** Open the current awarding screen.
- **Steps.** 1. Click "8 hidden fields".
- **Expected.** A hidden-fields view or menu opens and shows the fields currently hidden from the awarding sheet.
- **Oracle.** What the tester sees on the awarding screen.
- **Trace.** P2 · draft · `GEN-SCR-139` · layer ui · coverage partial · typed: “screen awarding (/awarding/Y2taY1hk)”

### GEN-SCR-140 — Enter and exit fullscreen view

- **Why it matters.** Confirms that the fullscreen control changes the awarding screen presentation. Written from the awarding screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh2tsju/08-inventory-awarding.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Whether the awarding screen expands into browser fullscreen after clicking Fullscreen; Whether the screen returns to its normal layout after exiting fullscreen; Whether fullscreen is exited through the browser controls.
- **Setup.** Open the current awarding screen in a window that is not already fullscreen.
- **Steps.** 1. Click "Fullscreen". 2. Inspect the awarding screen. 3. Exit fullscreen using the browser or displayed fullscreen exit action.
- **Expected.** The awarding screen expands to fullscreen after the click and returns to the normal layout after exiting fullscreen.
- **Oracle.** What the tester sees on the awarding screen.
- **Trace.** P2 · draft · `GEN-SCR-140` · layer ui · coverage none · typed: “screen awarding (/awarding/Y2taY1hk)”

### GEN-SCR-141 — Document panel loads the proposal document template

- **Why it matters.** Verify that the configured proposal document is loaded and its answer fields are available. Written from the proposal screen; grounded in R-FLA-045-1 (src/views/projectProposal/projectProposal.jsx:650-673); screenshot procol-ui-tests/evidence/walk-proposal-mvh30mzh/02-inventory-proposal.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Assert that the first saved document template, specifically, was selected.; Move to another document section because no catalog step can identify or navigate document sections.; Verify that the changed section was saved automatically after navigation..
- **Setup.** Use a proposal where ntd_required_on_proposal is enabled and a saved document template exists.
- **Steps.** 1. Select Document. 2. Wait for the document content to load. 3. Enter a valid answer in Enter answer here.... 4. Move to another document section.
- **Expected.** The first saved document template is loaded. The document fields are shown, and the changed section is saved automatically.
- **Oracle.** The screen behaves as R-FLA-045-1 says: Config `ntd_required_on_proposal` → "Document" panel; templates GET `/templates/?type_identifier=document` (first saved template default), form GET `/documents/reference_forms?template_uuid=&resource_
- **Trace.** P1 · draft · `GEN-SCR-141` · layer ui · coverage partial · typed: “screen proposal (/project/Y2tEY1hk/proposal/RGtEa1E%3D)”

### GEN-SCR-142 — Submitting with an empty required field is refused

- **Why it matters.** Verify that proposal submission cannot continue while a required field is empty. Written from the proposal screen; grounded in R-FLA-045-3 (src/views/projectProposal/projectProposal.jsx:380-400); screenshot procol-ui-tests/evidence/walk-proposal-mvh30mzh/02-inventory-proposal.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use a draft proposal with at least one required field empty.
- **Steps.** 1. Leave Enter answer here... empty. 2. Select Submit Proposal.
- **Expected.** The proposal is not submitted. The message "Please fill all the required fields" is shown.
- **Oracle.** The screen behaves as R-FLA-045-3 says: Submit with NTD: required-field errors → "Please fill all the required fields"; then `skip_custom_po` → approval modal, else Create PO form — src/views/projectProposal/projectProposal.jsx:380-400
- **Trace.** P0 · draft · `GEN-SCR-142` · layer ui · coverage full · typed: “screen proposal (/project/Y2tEY1hk/proposal/RGtEa1E%3D)”

### GEN-SCR-143 — A non-creator cannot submit a proposal

- **Why it matters.** Verify that the submit action is displayed to a non-creator but the backend refuses the submission. Written from the proposal screen; grounded in R-FLA-042-5 (src/views/projectProposal/projectProposal.jsx:872-880); screenshot procol-ui-tests/evidence/walk-proposal-mvh30mzh/02-inventory-proposal.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Establishing that the current user is a non-creator of the proposal.
- **Setup.** Sign in as a viewer who is not the proposal creator. Use a draft proposal with all required fields completed.
- **Steps.** 1. Select Submit Proposal.
- **Expected.** The submit request is refused and the message "Insufficient parameters" is shown. The proposal remains unsubmitted.
- **Oracle.** The screen behaves as R-FLA-042-5 says: Submit is offered to non-creators; backend proposal#submit returns 2 "Insufficient parameters" for anyone but the creator — src/views/projectProposal/projectProposal.jsx:872-880, procol-backend app/co
- **Trace.** P0 · draft · `GEN-SCR-143` · layer ui · coverage partial · typed: “screen proposal (/project/Y2tEY1hk/proposal/RGtEa1E%3D)”

### GEN-SCR-144 — Comparison Sheets shows stage rows and the proposed PO form

- **Why it matters.** Verify the comparison sheet sequence for a proposal. Written from the proposal screen; grounded in R-FLA-044-1 (src/views/projectProposal/projectProposal.jsx:494-610); screenshot procol-ui-tests/evidence/walk-proposal-mvh30mzh/02-inventory-proposal.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use a proposal containing at least one lot stage and one non-RFQ or auction stage. Do not configure skip_custom_po.
- **Steps.** 1. Select Comparison Sheets. 2. Review the displayed rows from top to bottom.
- **Expected.** The rows show each applicable stage, followed by Master QCS, followed by Proposed PO form.
- **Oracle.** The screen behaves as R-FLA-044-1 says: Comparison Sheets: one row per stage (lot proposals keep the lot's stages plus non-RFQ/auction stages), then Master QCS, then "Proposed PO form" unless `skip_custom_po` — src/views/projectProposal/pro
- **Trace.** P1 · draft · `GEN-SCR-144` · layer ui · coverage full · typed: “screen proposal (/project/Y2tEY1hk/proposal/RGtEa1E%3D)”

### GEN-SCR-145 — Document is read-only after the proposal leaves draft status

- **Why it matters.** Verify that document responses cannot be changed on a submitted or otherwise non-draft proposal. Written from the proposal screen; grounded in R-FLA-045-4 (src/views/projectProposal/projectProposal.jsx:1005-1006); screenshot procol-ui-tests/evidence/walk-proposal-mvh30mzh/02-inventory-proposal.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Whether an attempted change is autosaved or whether no autosave request is sent.
- **Setup.** Open a proposal whose status is not draft.
- **Steps.** 1. Select Document. 2. Select Enter answer here.... 3. Try to change the displayed response.
- **Expected.** The document content is read-only. The response cannot be edited or autosaved.
- **Oracle.** The screen behaves as R-FLA-045-4 says: Document is read-only once the proposal is not draft — src/views/projectProposal/projectProposal.jsx:1005-1006, 686-697
- **Trace.** P0 · draft · `GEN-SCR-145` · layer ui · coverage partial · typed: “screen proposal (/project/Y2tEY1hk/proposal/RGtEa1E%3D)”

### GEN-SCR-146 — Select date remains disabled until its prerequisite is met

- **Why it matters.** Verify the disabled state shown for the date control and prevent entry while it is unavailable. Written from the proposal screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-proposal-mvh30mzh/02-inventory-proposal.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The specific prerequisite for enabling Select date and the transition to an enabled state cannot be identified or verified with the catalog..
- **Setup.** Open the proposal in its current state without completing any prerequisite that could make the date applicable.
- **Steps.** 1. Try to select Select date. 2. Try to enter a date.
- **Expected.** Select date is visibly disabled and does not open or accept input.
- **Oracle.** What the tester sees on the proposal screen.
- **Trace.** P1 · draft · `GEN-SCR-146` · layer ui · coverage partial · typed: “screen proposal (/project/Y2tEY1hk/proposal/RGtEa1E%3D)”

### GEN-SCR-147 — Published Stages formats columns and omits Stage Code without ref_id

- **Why it matters.** Verifies stage column visibility, participant totals, and date formatting. Written from the project-proposal-summary screen; grounded in R-FLA-026-1 (src/views/projectDetails/components/publishedStagesTable.jsx:31-99); screenshot procol-ui-tests/evidence/walk-proposal-mvh30mzh/04-inventory-project-proposal-summary.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Verify Participants values use the active/total format for each row.; Verify populated Bidding Starts At and Bidding Ends At values use DATE_TIME formatting.; Verify the exact rows and values displayed in the Published Stages table.; unconfirmed label "-" (expect_text) — not among the labels known from the app nor in the case.
- **Setup.** Use a project with at least one published stage without ref_id, one stage with pending actions, and stages with and without bidding dates.
- **Steps.** 1. Open Published Stages. 2. Inspect the table headers. 3. Inspect the Participants values. 4. Inspect the Bidding Starts At and Bidding Ends At values.
- **Expected.** Stage Code is absent when no row has ref_id. Stage Title, Pending Actions, Participants, Bidding Starts At, and Bidding Ends At are shown. Participants use active/total values and missing values show 0. Dates use DATE_TIME formatting and missing dates show '-'.
- **Oracle.** The screen behaves as R-FLA-026-1 says: Columns: Stage Code (dropped when no row has `ref_id`), Stage Title, Pending Actions, Participants "active/total" (missing → 0), Bidding Starts At / Ends At (DATE_TIME or "-") — src/views/projectDetai
- **Trace.** P1 · draft · `GEN-SCR-147` · layer ui · coverage partial · typed: “screen project-proposal-summary (/project/Y2tEY1hk/details)”

### GEN-SCR-148 — Line Items and Participants show response counts

- **Why it matters.** Verifies that both panel headers display count tags from the response data. Written from the project-proposal-summary screen; grounded in R-FLA-018-4 (src/views/projectDetails/projectDetails.jsx:916-946); screenshot procol-ui-tests/evidence/walk-proposal-mvh30mzh/04-inventory-project-proposal-summary.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Changing either the line-item or participant response count; Refreshing the project details page after changing a response count and proving the updated tags persist.
- **Setup.** Use a project whose line-item response count and participant response count are known.
- **Steps.** 1. Inspect Line Items 1. 2. Inspect Participants 1. 3. Refresh the project details page after changing either response count.
- **Expected.** Each panel header shows its response count tag. After refresh, the tags reflect the latest line-item and participant response counts.
- **Oracle.** The screen behaves as R-FLA-018-4 says: Line Items / Participants panel headers show count tags from the line-item and participant responses — src/views/projectDetails/projectDetails.jsx:916-946, src/redux/project/selectors.js:867-876
- **Trace.** P1 · draft · `GEN-SCR-148` · layer ui · coverage partial · typed: “screen project-proposal-summary (/project/Y2tEY1hk/details)”

### GEN-SCR-149 — Ask Clara completes the analyze-data action and redirects

- **Why it matters.** Verifies the success message and navigation for Clara's analyze_data todo. Written from the project-proposal-summary screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/walk-proposal-mvh30mzh/04-inventory-project-proposal-summary.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact selection or completion of the internal "analyze-data" action if it is not exposed with that visible label; The exact redirect_url returned by the action.
- **Setup.** Use a project with an analyze_data todo and a returned redirect_url.
- **Steps.** 1. Select Ask Clara. 2. Wait for the action to complete.
- **Expected.** The app shows 'Awarding initiated successfully, redirecting to awarding flow...' and navigates to the returned redirect_url.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P1 · draft · `GEN-SCR-149` · layer ui · coverage partial · typed: “screen project-proposal-summary (/project/Y2tEY1hk/details)”

### GEN-SCR-150 — Line item delete requires the exact confirmation

- **Why it matters.** Verifies the destructive action's confirmation step without completing the deletion. Written from the project-proposal-summary screen; grounded in R-FLA-025-2 (src/views/projectDetails/components/lineItemTable.jsx:139-170); screenshot procol-ui-tests/evidence/walk-proposal-mvh30mzh/04-inventory-project-proposal-summary.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact dynamic confirmation text containing the generated line-item title and quantity cannot be asserted because the case provides neither value.; The specific target line item cannot be identified because no product or title is provided..
- **Setup.** Use a project with a line item whose title is known and whose quantity is known.
- **Steps.** 1. Open Line Items 1. 2. Open the row menu under Actions for the target line item. 3. Choose the delete option. 4. Do not confirm the deletion.
- **Expected.** A confirmation appears stating 'Are you sure you want to delete <title> line item with <qty> quantity'. The line item remains present because deletion is not confirmed.
- **Oracle.** The screen behaves as R-FLA-025-2 says: Delete confirm "Are you sure you want to delete <title> line item with <qty> quantity" → PATCH project with the item `status: "deleted"` → "Line item deleted successfully" — src/views/projectDetails/c
- **Trace.** P1 · draft · `GEN-SCR-150` · layer ui · coverage partial · typed: “screen project-proposal-summary (/project/Y2tEY1hk/details)”

### GEN-SCR-151 — Overview displays project identity and conditional open-tender status

- **Why it matters.** Verifies the overview metadata and configuration-dependent tender indicator. Written from the project-proposal-summary screen; grounded in R-FLA-018-1 (src/views/projectDetails/projectDetails.jsx:545-564); screenshot procol-ui-tests/evidence/walk-proposal-mvh30mzh/04-inventory-project-proposal-summary.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact Project ID value rendered as '#<refId>'; Created at uses DATE_TIME formatting; Open Tender Event shows 'Yes' only when is_show_under_open_events is enabled and is not 'Yes' when disabled; Selecting Project Details before opening Overview.
- **Setup.** Use a project with a known refId and creation timestamp. Test once with is_show_under_open_events enabled and once with it disabled.
- **Steps.** 1. Select Project Details. 2. Open Overview. 3. Inspect Project ID and Created at. 4. Inspect Open Tender Event.
- **Expected.** Project ID is shown as '#<refId>'. Created at uses DATE_TIME formatting. Open Tender Event shows 'Yes' only when is_show_under_open_events is enabled; it is not shown as Yes when the configuration is disabled.
- **Oracle.** The screen behaves as R-FLA-018-1 says: Overview: "Project ID" = `#<refId>`, "Created at" = DATE_TIME, "Open Tender Event: Yes" only when config `is_show_under_open_events` — src/views/projectDetails/projectDetails.jsx:545-564
- **Trace.** P1 · draft · `GEN-SCR-151` · layer ui · coverage partial · typed: “screen project-proposal-summary (/project/Y2tEY1hk/details)”

### GEN-SCR-152 — Published stages show the correct columns and fallback values

- **Why it matters.** Verify stage table columns and display fallbacks when stage reference data or participant counts are missing. Written from the rfq-live screen; grounded in R-FLA-026-1 (src/views/projectDetails/components/publishedStagesTable.jsx:31-99); screenshot procol-ui-tests/evidence/walk-convert-mvh36z53/11-inventory-rfq-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Create or load a published-stage fixture with missing participant data so the table displays "0".; Create or load a published-stage fixture with missing bidding dates so the table displays "-"..
- **Setup.** Use a project whose stages have no ref_id on any row, one stage with no participant count, and missing bidding dates.
- **Steps.** 1. Click "Published Stages". 2. Inspect the stage table headers and row values.
- **Expected.** "Stage Code" is not shown. The table shows "Stage Title", "Pending Actions", "Participants", "Bidding Starts At", and "Bidding Ends At". A missing participant count displays as "0". Missing bidding dates display as "-".
- **Oracle.** The screen behaves as R-FLA-026-1 says: Columns: Stage Code (dropped when no row has `ref_id`), Stage Title, Pending Actions, Participants "active/total" (missing → 0), Bidding Starts At / Ends At (DATE_TIME or "-") — src/views/projectDetai
- **Trace.** P1 · draft · `GEN-SCR-152` · layer ui · coverage partial · typed: “screen rfq-live (/project/Y2tYY1hk/details)”

### GEN-SCR-153 — Valid project detail tabs switch to their content

- **Why it matters.** Verify supported tab keys render the corresponding project sections. Written from the rfq-live screen; grounded in R-FLA-016-5 (src/views/projectDetails/projectDetails.jsx:1018-1022); screenshot procol-ui-tests/evidence/walk-convert-mvh36z53/11-inventory-rfq-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog has no dedicated assertion for the RFQ tab's exact content or route; the RFQ check uses a known visible content label instead..
- **Setup.** Use a project with an RFQ stage and Master QCS data available.
- **Steps.** 1. Click "RFQ". 2. Inspect the page content. 3. Click "Master QCS". 4. Inspect the page content. 5. Click "Project Details".
- **Expected.** Each selected tab renders its corresponding content. Returning to "Project Details" renders the project details screen again.
- **Oracle.** The screen behaves as R-FLA-016-5 says: A tabKey that is not details/master_qcs/a stage uuid renders nothing — src/views/projectDetails/projectDetails.jsx:1018-1022
- **Trace.** P1 · draft · `GEN-SCR-153` · layer ui · coverage partial · typed: “screen rfq-live (/project/Y2tYY1hk/details)”

### GEN-SCR-154 — Create New Version opens the supported clone explanation

- **Why it matters.** Verify the version-cloning action explains which stage types are supported before cloning. Written from the rfq-live screen; grounded in R-FLA-021-1 (src/views/projectDetails/components/cloneProjectModal.jsx:17-53); screenshot procol-ui-tests/evidence/walk-convert-mvh36z53/11-inventory-rfq-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use a project containing Technical and RFQ stages.
- **Steps.** 1. Click "Create New Version". 2. Inspect the dialog.
- **Expected.** A cloning dialog opens and says "Cloning is supported only for the Technical and RFQ stages." Do not confirm the clone.
- **Oracle.** The screen behaves as R-FLA-021-1 says: Clone: POST `/event_groups/:id/create_clone` (no body); success "Project cloned successfully" → `/project/<event_group_uuid>/details`; modal says "Cloning is supported only for the Technical and RFQ s
- **Trace.** P1 · draft · `GEN-SCR-154` · layer ui · coverage full · typed: “screen rfq-live (/project/Y2tYY1hk/details)”

### GEN-SCR-155 — Publish is refused when no participants are added

- **Why it matters.** Ensures publishing stops when the project has no participants. Written from the boq-template-selected screen; grounded in R-FCR-017-1 (src/views/projectCreation/projectCreation.jsx:1604-1609); screenshot procol-ui-tests/evidence/combo-b1-mvh49912/06-inventory-boq-template-selected.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open a valid auction project with no participants. Leave the product sheet valid and enter a project title.
- **Steps.** 1. Enter a project title. 2. Click "Publish".
- **Expected.** Publishing stops. The message "Please add participants to proceed!" appears.
- **Oracle.** The screen behaves as R-FCR-017-1 says: No participant in the project → "Please add participants to proceed!" (stops) — src/views/projectCreation/projectCreation.jsx:1604-1609
- **Trace.** P0 · draft · `GEN-SCR-155` · layer ui · coverage full · typed: “screen boq-template-selected (/orders/quick-create)”

### GEN-SCR-156 — Save as draft becomes available only for eligible projects

- **Why it matters.** Verifies the disabled draft-save state and the conditions that enable it. Written from the boq-template-selected screen; grounded in R-FCR-016-1 (src/views/projectCreation/projectCreation.jsx:292-296); screenshot procol-ui-tests/evidence/combo-b1-mvh49912/06-inventory-boq-template-selected.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Whether Save as draft is disabled when draft project creation is disabled by a tenant setting..
- **Setup.** Use a project that is not an RFQ-to-Auction conversion, is not a recurring stage, is not routed to the Auction Team, and is not a service-RFP grouping. Enable draft project creation for the tenant.
- **Steps.** 1. Open the project creation screen. 2. Verify the state of "Save as draft". 3. Repeat with draft project creation disabled or with a recurring stage.
- **Expected.** "Save as draft" is enabled only when all eligibility conditions are met. It is disabled when draft project creation is unavailable or the project is recurring.
- **Oracle.** The screen behaves as R-FCR-016-1 says: Shown only when not RFQ→Auction, `allow_draft_project_creation` on, not (service-RFP grouping AND `groupServiceActivitiesInRfp`), auctions not routed to the auction team, and the current stage is not 
- **Trace.** P1 · draft · `GEN-SCR-156` · layer ui · coverage partial · typed: “screen boq-template-selected (/orders/quick-create)”

### GEN-SCR-157 — Publishing without an end time is rejected

- **Why it matters.** Checks the failure caused by selecting a custom duration and leaving its end time empty. Written from the boq-template-selected screen; grounded in R-FCR-022-7 (src/views/projectCreation/components/projectScheduler/stageSchedulerCard/stageSchedulerCard.jsx:302-314); screenshot procol-ui-tests/evidence/combo-b1-mvh49912/06-inventory-boq-template-selected.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open a valid project with at least one participant and a valid title.
- **Steps.** 1. Click "Now - 02:09 am, 21st Oct ( 30 Mins )". 2. Choose a custom duration. 3. Leave the end time empty. 4. Close the schedule popover. 5. Click "Publish".
- **Expected.** Publishing fails with the message "Please add end time for the event".
- **Oracle.** The screen behaves as R-FCR-022-7 says: choosing "Custom duration" first sets end to undefined; closing the popover then Save passes (NaN comparisons) and publish fails "Please add end time for the event" — stageSchedulerCard.jsx:302-314. B
- **Trace.** P1 · draft · `GEN-SCR-157` · layer ui · coverage full · typed: “screen boq-template-selected (/orders/quick-create)”

### GEN-SCR-158 — Publish confirmation uses the Auction Team wording

- **Why it matters.** Verifies the confirmation modal title, project-title truncation, and action wording for an event routed to the Auction Team. Written from the boq-template-selected screen; grounded in R-FCR-020-2 (src/views/eventCreation/components/footer/confirmModal.jsx:52-60); screenshot procol-ui-tests/evidence/combo-b1-mvh49912/06-inventory-boq-template-selected.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact character-count validation that the project title is truncated to precisely 45 characters, including whether an ellipsis is rendered..
- **Setup.** Configure the event to publish to the Auction Team. Add participants and enter a project title longer than 45 characters.
- **Steps.** 1. Click "Publish". 2. Inspect the confirmation modal.
- **Expected.** The modal title is "Send to Auction Team". The project title shown in the modal is truncated to 45 characters. The modal shows "Publish Event" and an OK action labeled "Send to Auction Team".
- **Oracle.** The screen behaves as R-FCR-020-2 says: Title: "Send to Auction Team" / project title truncated to 45 / "Publish Event"; OK text "Send to Auction Team" or "Publish"; Cancel is "Edit Schedule" and opens the schedule drawer — src/views/eventC
- **Trace.** P1 · draft · `GEN-SCR-158` · layer ui · coverage partial · typed: “screen boq-template-selected (/orders/quick-create)”

### GEN-SCR-159 — Locked product fields cannot be edited during RFQ-to-Auction conversion

- **Why it matters.** Confirms that product, creator quantity, and variant data remain locked when creating an Auction from an existing RFQ. Written from the boq-template-selected screen; grounded in R-FCR-026-6 (src/views/eventCreation/templateSelection.jsx:248-272); screenshot procol-ui-tests/evidence/combo-b1-mvh49912/06-inventory-boq-template-selected.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Directly attempting to replace the Product or Quantity Requested values and asserting the edit is refused.; Verifying that no product or quantity value changed after an attempted edit.; The conversion-specific explanatory copy stating that product changes are unavailable..
- **Setup.** Open quick-create from an existing RFQ and select an Auction event using the existing BOQ template.
- **Steps.** 1. Try to edit a cell under "Product". 2. Try to edit a cell under "Quantity Requested". 3. Try to replace the product or quantity value.
- **Expected.** The product and requested quantity cells are read-only. No product or quantity value can be changed from this screen.
- **Oracle.** The screen behaves as R-FCR-026-6 says: In project creation `product`, `creator_quantity`, `variant` are locked; PR events also lock READ_ONLY_WIDGETS_IN_PR_TO_AUCTION and `blockEditFromPr` widgets — templateSelection.jsx:248-272
- **Trace.** P1 · draft · `GEN-SCR-159` · layer ui · coverage partial · typed: “screen boq-template-selected (/orders/quick-create)”

### GEN-SCR-160 — Ask Clara opens the summary panel in the disabled-Clara configuration

- **Why it matters.** Checks the documented inverted rendering condition for the Clara summary panel. Written from the boq-template-selected screen; grounded in R-FCR-011-5 (src/views/projectCreation/projectCreation.jsx:3405-3409); screenshot procol-ui-tests/evidence/combo-b1-mvh49912/06-inventory-boq-template-selected.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Configure the tenant with Clara disabled.; Provide or verify the project's existing Clara summary content..
- **Setup.** Use a project that has a claraSummary and a tenant where Clara is disabled.
- **Steps.** 1. Click "Ask Clara".
- **Expected.** The Clara summary panel renders and displays the project's existing summary.
- **Oracle.** The screen behaves as R-FCR-011-5 says: Clara summary panel renders when `isClaraEnabled` is FALSE and the project has a claraSummary (FE-15.2 states the inverse) — src/views/projectCreation/projectCreation.jsx:3405-3409
- **Trace.** P2 · draft · `GEN-SCR-160` · layer ui · coverage partial · typed: “screen boq-template-selected (/orders/quick-create)”

### GEN-SCR-161 — Title remains locked during RFQ-to-auction conversion

- **Why it matters.** Conversion should prevent editing of the project title and existing product, variant, and quantity data. Written from the convert-to-auction screen; grounded in R-FCR-026-6 (src/views/eventCreation/templateSelection.jsx:248-272). **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open an RFQ-to-auction conversion containing at least one existing line item.
- **Steps.** 1. Click "Enter the title of the project". 2. Try to change the title. 3. Try to edit the Product, Product Variant, and Quantity Requested values.
- **Expected.** The title field cannot be edited. Existing Product, Product Variant, and Quantity Requested values remain locked.
- **Oracle.** The screen behaves as R-FCR-026-6 says: In project creation `product`, `creator_quantity`, `variant` are locked; PR events also lock READ_ONLY_WIDGETS_IN_PR_TO_AUCTION and `blockEditFromPr` widgets — templateSelection.jsx:248-272
- **Trace.** P1 · draft · `GEN-SCR-161` · layer ui · coverage full · typed: “screen convert-to-auction (/orders/quick-create)”

### GEN-SCR-162 — Blacklisted and TNA vendors cannot be selected

- **Why it matters.** Vendor search must prevent adding vendors that are blacklisted or unavailable because of TNA restrictions. Written from the convert-to-auction screen; grounded in R-FCR-035-3 (src/views/projectCreation/projectCreation.jsx:255-256). **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Search for the blacklisted vendor and identify its result; Assert the blacklisted vendor result is disabled and shows "Blocked"; Try to select the blacklisted vendor and assert that selection is refused; Search for the TNA vendor and identify its result; Assert the TNA vendor result is disabled and shows "TNA"; Try to select the TNA vendor and assert that selection is refused.
- **Setup.** Use a fresh event where the search results include one blacklisted vendor and one TNA vendor.
- **Steps.** 1. Search for the blacklisted vendor. 2. Inspect the vendor result. 3. Search for the TNA vendor. 4. Inspect the vendor result. 5. Try to select each restricted vendor.
- **Expected.** The blacklisted vendor is disabled and shows "Blocked". The TNA vendor is disabled and shows "TNA". Neither vendor can be selected.
- **Oracle.** The screen behaves as R-FCR-035-3 says: In search results blacklisted vendors are disabled with "Blocked"; TNA vendors are disabled with "TNA" unless the URL has `allowTnaVendorsToBid=true` (so on a fresh create every TNA vendor is unselect
- **Trace.** P1 · draft · `GEN-SCR-162` · layer ui · coverage none · typed: “screen convert-to-auction (/orders/quick-create)”

### GEN-SCR-163 — Publish refuses an event with no participants

- **Why it matters.** An event must not proceed when all participants have been removed. Written from the convert-to-auction screen; grounded in R-FCR-017-1 (src/views/projectCreation/projectCreation.jsx:1604-1609). **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open a conversion that has the displayed participant selected.
- **Steps.** 1. Click "Clear". 2. Click "Publish".
- **Expected.** Publishing stops and the app shows "Please add participants to proceed!".
- **Oracle.** The screen behaves as R-FCR-017-1 says: No participant in the project → "Please add participants to proceed!" (stops) — src/views/projectCreation/projectCreation.jsx:1604-1609
- **Trace.** P0 · draft · `GEN-SCR-163` · layer ui · coverage full · typed: “screen convert-to-auction (/orders/quick-create)”

### GEN-SCR-164 — Ask Clara generates a summary for an event with line items

- **Why it matters.** Ask Clara requires project line items and should request and load the AI-generated RFP response. Written from the convert-to-auction screen; grounded in R-FCR-042-4 (src/views/eventCreation/components/aiRfpGenerator/api.js:3-11). **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Whether the AI request was submitted to the backend because the request endpoint is not specified.; Whether the response contains a correct Clara summary for the event's line items.; A response panel that is not exposed as a named or dialog accessibility element..
- **Setup.** Open a conversion containing at least one completed line item with Product and Quantity Requested values.
- **Steps.** 1. Click "Ask Clara". 2. Wait for the AI response to load.
- **Expected.** The AI request is submitted and the resulting Clara summary or response panel appears for the event.
- **Oracle.** The screen behaves as R-FCR-042-4 says: AI RFP → `POST /ask_ai_chats/rfp_questions`, then `GET /external_requests/:uuid`; the AI button needs project line items — src/views/eventCreation/components/aiRfpGenerator/api.js:3-11, src/views/even
- **Trace.** P1 · draft · `GEN-SCR-164` · layer ui · coverage partial · typed: “screen convert-to-auction (/orders/quick-create)”

### GEN-SCR-165 — Buy Template is unavailable on the conversion screen

- **Why it matters.** The screen shows Buy Template as disabled, so a tester should verify that its disabled state prevents interaction. Written from the convert-to-auction screen; grounded in what the screen shows. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the convert-to-auction screen.
- **Steps.** 1. Inspect "Buy Template". 2. Try to click "Buy Template".
- **Expected.** "Buy Template" is visibly disabled and no template-purchase action or new screen opens.
- **Oracle.** What the tester sees on the convert-to-auction screen.
- **Trace.** P2 · draft · `GEN-SCR-165` · layer ui · coverage full · typed: “screen convert-to-auction (/orders/quick-create)”

### GEN-SCR-166 — Publish opens the conversion confirmation

- **Why it matters.** Publishing a converted event requires a confirmation step before sending it to the Auction Team or publishing it. Written from the convert-to-auction screen; grounded in R-FCR-020-2 (src/views/eventCreation/components/footer/confirmModal.jsx:52-60). **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open a valid conversion with a title, at least one line item, and at least one participant.
- **Steps.** 1. Click "Publish". 2. Do not confirm the action.
- **Expected.** A confirmation dialog opens with title "Send to Auction Team" and the action text "Send to Auction Team" or "Publish". The dialog also offers "Edit Schedule" as the cancellation action.
- **Oracle.** The screen behaves as R-FCR-020-2 says: Title: "Send to Auction Team" / project title truncated to 45 / "Publish Event"; OK text "Send to Auction Team" or "Publish"; Cancel is "Edit Schedule" and opens the schedule drawer — src/views/eventC
- **Trace.** P0 · draft · `GEN-SCR-166` · layer ui · coverage full · typed: “screen convert-to-auction (/orders/quick-create)”

### GEN-SCR-167 — Auction detail sections open from their buttons

- **Why it matters.** Verify the main configuration buttons expose their corresponding auction sections. Written from the converted-auction-create screen; grounded in what the screen shows. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Directly verify that the displayed content changes to the corresponding section rather than only confirming the named section text is visible..
- **Setup.** Open the converted-auction-create screen.
- **Steps.** 1. Click "Details". 2. Click "Price Components". 3. Click "Participants".
- **Expected.** Each click opens or selects the section named on the button. The displayed content changes to the corresponding details, price components, or participants section.
- **Oracle.** What the tester sees on the converted-auction-create screen.
- **Trace.** P1 · draft · `GEN-SCR-167` · layer ui · coverage partial · typed: “screen converted-auction-create (/orders/quick-create)”

### GEN-SCR-168 — Ask Clara starts the AI request when line items exist

- **Why it matters.** Verify the AI RFP action is available for a project containing line items and starts its request flow. Written from the converted-auction-create screen; grounded in R-FCR-042-4 (src/views/eventCreation/components/aiRfpGenerator/api.js:3-11). **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Assert the exact Clara panel or flow opened after clicking Ask Clara.
- **Setup.** Open a converted auction containing at least one line item. Enable network inspection.
- **Steps.** 1. Click "Ask Clara".
- **Expected.** The Clara panel or flow opens. A POST request is sent to "/ask_ai_chats/rfp_questions", followed by a GET request to "/external_requests/:uuid".
- **Oracle.** The screen behaves as R-FCR-042-4 says: AI RFP → `POST /ask_ai_chats/rfp_questions`, then `GET /external_requests/:uuid`; the AI button needs project line items — src/views/eventCreation/components/aiRfpGenerator/api.js:3-11, src/views/even
- **Trace.** P1 · draft · `GEN-SCR-168` · layer ui · coverage partial · typed: “screen converted-auction-create (/orders/quick-create)”

### GEN-SCR-169 — Drafts shows its empty state

- **Why it matters.** Verifies the dedicated empty-state message for the selected Drafts list. Written from the draft-two-stage-in-list screen; grounded in R-FLA-004-4 (src/views/orders/components/projectTable.jsx:699-708); screenshot procol-ui-tests/evidence/combo-e9-mvh3p6ng/20-inventory-draft-two-stage-in-list.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use an account with no draft events.
- **Steps.** 1. Click Drafts 185.
- **Expected.** The Drafts list shows No Drafts Found.
- **Oracle.** The screen behaves as R-FLA-004-4 says: Empty states: filtered → "no result" copy; Drafts → "No Drafts Found"; Recurring → "No Recurring Events Found" — src/views/orders/components/projectTable.jsx:699-708, 914-920, 965-971
- **Trace.** P1 · draft · `GEN-SCR-169` · layer ui · coverage full · typed: “screen draft-two-stage-in-list (/orders)”

### GEN-SCR-170 — Search with no matching title shows the filtered empty state

- **Why it matters.** Checks that filtering does not show an unrelated empty state when no event matches. Written from the draft-two-stage-in-list screen; grounded in R-FLA-004-4 (src/views/orders/components/projectTable.jsx:699-708); screenshot procol-ui-tests/evidence/combo-e9-mvh3p6ng/20-inventory-draft-two-stage-in-list.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the Drafts tab with at least one event available.
- **Steps.** 1. Enter a title that does not match any event in Search Title. 2. Wait for the list to refresh.
- **Expected.** The list shows the app's no-result copy for a filtered list instead of No Drafts Found.
- **Oracle.** The screen behaves as R-FLA-004-4 says: Empty states: filtered → "no result" copy; Drafts → "No Drafts Found"; Recurring → "No Recurring Events Found" — src/views/orders/components/projectTable.jsx:699-708, 914-920, 965-971
- **Trace.** P1 · draft · `GEN-SCR-170` · layer ui · coverage full · typed: “screen draft-two-stage-in-list (/orders)”

### GEN-SCR-171 — Ticket and feedback controls open their destinations

- **Why it matters.** Verifies both ticket entry points and the feedback entry point open the intended destinations. Written from the draft-two-stage-in-list screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/combo-e9-mvh3p6ng/20-inventory-draft-two-stage-in-list.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — The destination opened by the View Tickets button cannot be observed because no tickets-view screen or known route assertion is available.; The destination opened by the View Tickets link cannot be observed because no tickets-view screen or known route assertion is available.; The feedback form destination cannot be observed because no feedback-form screen or known route assertion is available..
- **Setup.** Open /orders.
- **Steps.** 1. Click the View Tickets button. 2. Return to /orders. 3. Click the View Tickets link. 4. Return to /orders. 5. Click Give Feedback.
- **Expected.** Each View Tickets control opens the tickets view. Give Feedback opens the feedback form.
- **Oracle.** What the tester sees on the draft-two-stage-in-list screen.
- **Trace.** P1 · draft · `GEN-SCR-171` · layer ui · coverage none · typed: “screen draft-two-stage-in-list (/orders)”

### GEN-SCR-172 — Proposal column opens the correct destination for each proposal status

- **Why it matters.** Verifies proposal navigation for draft, non-draft, and contract proposals. Written from the live-auction-erfx screen; grounded in R-FLA-030-2 (src/components/masterQcs/masterQcs.jsx:354-391); screenshot procol-ui-tests/evidence/combo-e1-mvh3axeu/15-inventory-live-auction-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Selecting the exact proposal column entry for the draft, non-draft, and contract proposal statuses cannot be expressed with a known catalog control name..
- **Setup.** Prepare the Master QCS with a draft proposal, a submitted non-draft proposal, and a non-draft contract proposal.
- **Steps.** 1. Click the proposal column for the draft proposal. 2. Return to the Master QCS. 3. Click the proposal column for the non-draft proposal. 4. Return to the Master QCS. 5. Click the proposal column for the contract proposal.
- **Expected.** The draft proposal opens `/awarding/:id?lotNo=`. The non-draft proposal opens `/project/:id/proposal/:proposalUuid?lotNo=`. The non-draft contract opens `/contract-details?contracts_uuids=`.
- **Oracle.** The screen behaves as R-FLA-030-2 says: Draft proposal → `/awarding/:id?lotNo=`; non-draft → `/project/:id/proposal/:proposalUuid?lotNo=`; contracts non-draft → `/contract-details?contracts_uuids=` — src/components/masterQcs/masterQcs.jsx:3
- **Trace.** P0 · draft · `GEN-SCR-172` · layer ui · coverage partial · typed: “screen live-auction-erfx (/project/Y0RnY1hk/master_qcs)”

### GEN-SCR-173 — Ask Clara redirects after analyze-data processing

- **Why it matters.** Verifies the Clara awarding handoff. Written from the live-auction-erfx screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/combo-e1-mvh3axeu/15-inventory-live-auction-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact redirect_url returned by the backend cannot be inspected or compared..
- **Setup.** Use a project where Clara has an `analyze_data` todo and the response provides a valid `redirect_url`.
- **Steps.** 1. Click "Ask Clara". 2. Wait for the Clara action to complete.
- **Expected.** The message "Awarding initiated successfully, redirecting to awarding flow..." appears, then the browser navigates to the returned `redirect_url`.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P0 · draft · `GEN-SCR-173` · layer ui · coverage partial · typed: “screen live-auction-erfx (/project/Y0RnY1hk/master_qcs)”

### GEN-SCR-174 — Project Details shows overview values and conditional open-tender status

- **Why it matters.** Checks the project overview data and configuration-dependent field. Written from the live-auction-erfx screen; grounded in R-FLA-018-1 (src/views/projectDetails/projectDetails.jsx:545-564); screenshot procol-ui-tests/evidence/combo-e1-mvh3axeu/15-inventory-live-auction-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Assert Project ID is formatted as #<refId>; Assert Created at equals the supplied DATE_TIME; Assert Open Tender Event shows Yes only when is_show_under_open_events is enabled; Disable or otherwise change the is_show_under_open_events configuration and repeat the observation; Compare the overview results between enabled and disabled configuration states.
- **Setup.** Use a project with a known `refId` and creation timestamp. Run once with `is_show_under_open_events` enabled and once disabled.
- **Steps.** 1. Click "Project Details". 2. Locate the project overview. 3. Repeat with the configuration disabled.
- **Expected.** The overview shows Project ID as `#<refId>` and Created at as the supplied DATE_TIME. Open Tender Event shows Yes only when `is_show_under_open_events` is enabled.
- **Oracle.** The screen behaves as R-FLA-018-1 says: Overview: "Project ID" = `#<refId>`, "Created at" = DATE_TIME, "Open Tender Event: Yes" only when config `is_show_under_open_events` — src/views/projectDetails/projectDetails.jsx:545-564
- **Trace.** P1 · draft · `GEN-SCR-174` · layer ui · coverage none · typed: “screen live-auction-erfx (/project/Y0RnY1hk/master_qcs)”

### GEN-SCR-175 — Master QCS panel headers show response counts

- **Why it matters.** Verifies count tags on the key Master QCS panels. Written from the live-auction-erfx screen; grounded in R-FLA-018-4 (src/views/projectDetails/projectDetails.jsx:916-946); screenshot procol-ui-tests/evidence/combo-e1-mvh3axeu/15-inventory-live-auction-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact response count shown in the Line Items header; Exact response count shown in the Participants header.
- **Setup.** Use a project with known line-item response and participant response totals.
- **Steps.** 1. Click "Master QCS". 2. Inspect the Line Items and Participants panel headers.
- **Expected.** The Line Items header shows the line-item response count, and the Participants header shows the participant response count.
- **Oracle.** The screen behaves as R-FLA-018-4 says: Line Items / Participants panel headers show count tags from the line-item and participant responses — src/views/projectDetails/projectDetails.jsx:916-946, src/redux/project/selectors.js:867-876
- **Trace.** P1 · draft · `GEN-SCR-175` · layer ui · coverage partial · typed: “screen live-auction-erfx (/project/Y0RnY1hk/master_qcs)”

### GEN-SCR-176 — Long or withdrawn project tabs show the correct tab presentation

- **Why it matters.** Checks truncation tooltips and withdrawn-stage labeling. Written from the live-auction-erfx screen; grounded in R-FLA-016-4 (src/views/projectDetails/projectTabs.jsx:112-135); screenshot procol-ui-tests/evidence/combo-e1-mvh3axeu/15-inventory-live-auction-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact long stage tab title and its 20-character truncation cannot be asserted because the case provides no title.; The long tab's tooltip containing the full title cannot be targeted or verified without the tab's actual visible name..
- **Setup.** Use a project with a stage title longer than 20 characters and an `in_active` stage.
- **Steps.** 1. Open the project tabs. 2. Hover over the long stage tab. 3. Inspect the withdrawn stage tab.
- **Expected.** The long tab title is truncated to 20 characters and its tooltip contains the full title. The `in_active` stage displays a Withdrawn tag.
- **Oracle.** The screen behaves as R-FLA-016-4 says: Tab titles truncated to 20 chars with tooltip; withdrawn (`in_active`) stages carry a "Withdrawn" tag — src/views/projectDetails/projectTabs.jsx:112-135, 173-175
- **Trace.** P1 · draft · `GEN-SCR-176` · layer ui · coverage partial · typed: “screen live-auction-erfx (/project/Y0RnY1hk/master_qcs)”

### GEN-SCR-177 — Verify published stage columns and value formatting

- **Why it matters.** Confirms stage table columns, participant totals, dates, and conditional Stage Code behavior. Written from the live-technical-auction screen; grounded in R-FLA-026-1 (src/views/projectDetails/components/publishedStagesTable.jsx:31-99); screenshot procol-ui-tests/evidence/combo-e7-mvh3lfrs/17-inventory-live-technical-auction.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Compare a project with at least one stage ref_id against a separate project with no stage ref_id to verify conditional Stage Code visibility.; Verify the exact participant active/total value for a specific row, including coercion of a missing participant value to 0, without known fixture values or a row-scoped value assertion.; Verify that missing date values render '-' in the specific affected row.; Verify all other listed columns as structured table columns rather than visible text.; unconfirmed label "-" (expect_text) — not among the labels known from the app nor in the case.
- **Setup.** Prepare one project with a published stage row containing ref_id and one project where no stage row contains ref_id. Include a missing participant count and a missing bidding date.
- **Steps.** 1. Click Published Stages. 2. Inspect the project with a stage ref_id. 3. Inspect the project with no stage ref_id. 4. Check the participant and date values.
- **Expected.** The table shows Stage Code when at least one row has ref_id and omits it when no row has ref_id. Participants shows active/total, using 0 for a missing value. Missing dates show '-'. Other listed columns are present.
- **Oracle.** The screen behaves as R-FLA-026-1 says: Columns: Stage Code (dropped when no row has `ref_id`), Stage Title, Pending Actions, Participants "active/total" (missing → 0), Bidding Starts At / Ends At (DATE_TIME or "-") — src/views/projectDetai
- **Trace.** P1 · draft · `GEN-SCR-177` · layer ui · coverage partial · typed: “screen live-technical-auction (/project/Y3BkY1hk/details)”

### GEN-SCR-178 — Verify line item and participant count tags

- **Why it matters.** Confirms panel headers display response counts. Written from the live-technical-auction screen; grounded in R-FLA-018-4 (src/views/projectDetails/projectDetails.jsx:916-946); screenshot procol-ui-tests/evidence/combo-e7-mvh3lfrs/17-inventory-live-technical-auction.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use the displayed project with two line-item responses and one participant response.
- **Steps.** 1. Inspect the Line Items 2 header. 2. Inspect the Participants 1 header.
- **Expected.** The line-item panel header shows a count tag of 2 and the participant panel header shows a count tag of 1.
- **Oracle.** The screen behaves as R-FLA-018-4 says: Line Items / Participants panel headers show count tags from the line-item and participant responses — src/views/projectDetails/projectDetails.jsx:916-946, src/redux/project/selectors.js:867-876
- **Trace.** P1 · draft · `GEN-SCR-178` · layer ui · coverage full · typed: “screen live-technical-auction (/project/Y3BkY1hk/details)”

### GEN-SCR-179 — Open a draft RFQ-to-auction stage

- **Why it matters.** Confirms a draft RFQ-to-auction stage opens the creation flow with its draft event context. Written from the live-technical-auction screen; grounded in R-FLA-026-2 (src/views/projectDetails/components/publishedStagesTable.jsx:15-29); screenshot procol-ui-tests/evidence/combo-e7-mvh3lfrs/17-inventory-live-technical-auction.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Whether an internal auction-team check was evaluated or bypassed, beyond observing successful navigation; That the draftEventId belongs to the selected Auction stage rather than merely being present in the URL.
- **Setup.** Prepare a non-draft project containing a draft RFQ-to-auction stage.
- **Steps.** 1. Click Published Stages. 2. Click the Auction stage entry. 3. Inspect the destination screen and URL.
- **Expected.** The create screen opens for the draft stage and carries the draftEventId for that stage. No auction-team check prevents the navigation.
- **Oracle.** The screen behaves as R-FLA-026-2 says: Clicking a draft rfq→auction stage opens the create screen with `draftEventId` (no auction-team check); other stages switch tab — src/views/projectDetails/components/publishedStagesTable.jsx:15-29
- **Trace.** P1 · draft · `GEN-SCR-179` · layer ui · coverage partial · typed: “screen live-technical-auction (/project/Y3BkY1hk/details)”

### GEN-SCR-180 — Verify overview project identity and open tender visibility

- **Why it matters.** Confirms the overview renders project identity, creation time, and configuration-controlled open tender status. Written from the live-technical-auction screen; grounded in R-FLA-018-1 (src/views/projectDetails/projectDetails.jsx:545-564); screenshot procol-ui-tests/evidence/combo-e7-mvh3lfrs/17-inventory-live-technical-auction.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Inspect that Project ID is formatted exactly as '#<refId>'; Verify that Created at uses DATE_TIME formatting; Toggle is_show_under_open_events to disabled and repeat the check; Verify Open Tender Event changes between 'Yes' and not 'Yes' across the enabled and disabled tenant states.
- **Setup.** Prepare one project with refId and created-at data, with is_show_under_open_events enabled. Repeat with the configuration disabled.
- **Steps.** 1. Click Overview. 2. Inspect the Project ID and Created at values. 3. Check the Open Tender Event value. 4. Repeat with is_show_under_open_events disabled.
- **Expected.** Project ID is shown as '#<refId>' and Created at uses DATE_TIME formatting. Open Tender Event shows 'Yes' only when is_show_under_open_events is enabled; it is not shown as Yes when disabled.
- **Oracle.** The screen behaves as R-FLA-018-1 says: Overview: "Project ID" = `#<refId>`, "Created at" = DATE_TIME, "Open Tender Event: Yes" only when config `is_show_under_open_events` — src/views/projectDetails/projectDetails.jsx:545-564
- **Trace.** P1 · draft · `GEN-SCR-180` · layer ui · coverage partial · typed: “screen live-technical-auction (/project/Y3BkY1hk/details)”

### GEN-SCR-181 — Start Clara awarding flow from an analyze-data todo

- **Why it matters.** Confirms Clara handles an analyze_data todo and follows the returned awarding URL. Written from the live-technical-auction screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/combo-e7-mvh3lfrs/17-inventory-live-technical-auction.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact returned redirect_url value; The specific analyze-data todo context.
- **Setup.** Prepare the project with an analyze_data Clara todo and configure the response with a valid redirect_url.
- **Steps.** 1. Click Ask Clara. 2. Wait for the Clara action to complete. 3. Observe the notification and destination.
- **Expected.** The message 'Awarding initiated successfully, redirecting to awarding flow...' appears, then the browser navigates to the returned redirect_url.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P1 · draft · `GEN-SCR-181` · layer ui · coverage partial · typed: “screen live-technical-auction (/project/Y3BkY1hk/details)”

### GEN-SCR-182 — Published Stages table shows the correct columns and values

- **Why it matters.** Verify published-stage rows display the configured stage information and participant counts. Written from the live-technical-only screen; grounded in R-FLA-026-1 (src/views/projectDetails/components/publishedStagesTable.jsx:31-99); screenshot procol-ui-tests/evidence/combo-e5-mvh3hs6y/12-inventory-live-technical-only.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact Participants active/total value, including the required 0 fallback for missing values; Whether Bidding Starts At and Bidding Ends At cells contain correctly formatted DATE_TIME values.
- **Setup.** Use a project with one published stage, no stage row with ref_id, missing participant totals, and configured start and end dates.
- **Steps.** 1. Click "Published Stages". 2. Review the table headers and stage row.
- **Expected.** The Stage Code column is not shown because no row has ref_id. Stage Title and Pending Actions are shown. Participants shows the active/total value, using 0 for missing values. Bidding Starts At and Bidding Ends At show DATE_TIME values.
- **Oracle.** The screen behaves as R-FLA-026-1 says: Columns: Stage Code (dropped when no row has `ref_id`), Stage Title, Pending Actions, Participants "active/total" (missing → 0), Bidding Starts At / Ends At (DATE_TIME or "-") — src/views/projectDetai
- **Trace.** P1 · draft · `GEN-SCR-182` · layer ui · coverage partial · typed: “screen live-technical-only (/project/Y3BjY1hk/details)”

### GEN-SCR-183 — Line Items and Participants counts match response data

- **Why it matters.** Verify the panel headers show response counts rather than stale or hard-coded values. Written from the live-technical-only screen; grounded in R-FLA-018-4 (src/views/projectDetails/projectDetails.jsx:916-946); screenshot procol-ui-tests/evidence/combo-e5-mvh3hs6y/12-inventory-live-technical-only.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Directly verify that the displayed counts match the backend response data..
- **Setup.** Use a project whose line-item response count is 0 and participant response count is 1.
- **Steps.** 1. Open the project details screen. 2. Review the Line Items and Participants panel headers.
- **Expected.** The headers show Line Items 0 and Participants 1.
- **Oracle.** The screen behaves as R-FLA-018-4 says: Line Items / Participants panel headers show count tags from the line-item and participant responses — src/views/projectDetails/projectDetails.jsx:916-946, src/redux/project/selectors.js:867-876
- **Trace.** P1 · draft · `GEN-SCR-183` · layer ui · coverage partial · typed: “screen live-technical-only (/project/Y3BjY1hk/details)”

### GEN-SCR-184 — Search participants is debounced and limits results to 20

- **Why it matters.** Verify participant search waits for the debounce interval and uses the expected page size. Written from the live-technical-only screen; grounded in R-FLA-024-5 (src/views/projectDetails/components/participantsTable.jsx:265-267); screenshot procol-ui-tests/evidence/combo-e5-mvh3hs6y/12-inventory-live-technical-only.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Verify that exactly one search request is applied after the final keystroke and no earlier request is applied.; Verify the returned participants match a specific vendor because the case provides no partial vendor name or expected Vendor Name/Vendor Code..
- **Setup.** Use a project with more than 20 participants and at least two participants whose Vendor Name or Vendor Code contains the same search text.
- **Steps.** 1. Enter a partial vendor name in "Search participants". 2. Continue typing before 300 milliseconds elapse. 3. Wait at least 300 milliseconds after the final keystroke. 4. Review the participant results using Vendor Name and Vendor Code.
- **Expected.** Only one search is applied after the final keystroke. Matching participant results are shown, with no more than 20 results on the page.
- **Oracle.** The screen behaves as R-FLA-024-5 says: Search debounced 300 ms; page size 20; proposal page reuses this table without the reject option — src/views/projectDetails/components/participantsTable.jsx:265-267, 397, src/views/projectProposal/pro
- **Trace.** P1 · draft · `GEN-SCR-184` · layer ui · coverage partial · typed: “screen live-technical-only (/project/Y3BjY1hk/details)”

### GEN-SCR-185 — Invalid project-details tab renders no content

- **Why it matters.** Verify an unsupported tab key does not render project details or an unintended stage. Written from the live-technical-only screen; grounded in R-FLA-016-5 (src/views/projectDetails/projectDetails.jsx:1018-1022); screenshot procol-ui-tests/evidence/combo-e5-mvh3hs6y/12-inventory-live-technical-only.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Set the browser to the unsupported tabKey and verify that no project-detail panel is rendered for that invalid tabKey..
- **Setup.** Open the project details URL with a tabKey that is not details, master_qcs, or a valid stage UUID.
- **Steps.** 1. Observe the page content. 2. Click "Project Details". 3. Click "Technical Stage". 4. Click "Master QCS".
- **Expected.** With the unsupported tabKey, no project-detail panel is rendered. The valid tabs remain available and render their corresponding content when selected.
- **Oracle.** The screen behaves as R-FLA-016-5 says: A tabKey that is not details/master_qcs/a stage uuid renders nothing — src/views/projectDetails/projectDetails.jsx:1018-1022
- **Trace.** P2 · draft · `GEN-SCR-185` · layer ui · coverage partial · typed: “screen live-technical-only (/project/Y3BjY1hk/details)”

### GEN-SCR-186 — Proposal selection opens the correct route for each proposal type

- **Why it matters.** Verify proposal navigation differs for draft, regular non-draft, and contract proposals. Written from the master-qcs-rfq-one-bid screen; grounded in R-FLA-030-2 (src/components/masterQcs/masterQcs.jsx:354-391); screenshot procol-ui-tests/evidence/combo-e3-mvh3e1w5/15-inventory-master-qcs-rfq-one-bid.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Select or switch between the three distinct prepared projects containing the draft, non-draft, and non-draft contract proposals.; Prove that each prepared project has the stated proposal type before clicking the vendor proposal..
- **Setup.** Prepare three equivalent projects: one with a draft proposal, one with a non-draft proposal, and one with a non-draft contract proposal.
- **Steps.** 1. Open the Master QCS view for the project with the draft proposal. 2. Click the vendor proposal in "QA_Platform Vendor 1 1790820862139". 3. Repeat with the project containing the non-draft proposal. 4. Repeat with the project containing the non-draft contract proposal.
- **Expected.** The draft proposal opens `/awarding/:id?lotNo=`. The non-draft proposal opens `/project/:id/proposal/:proposalUuid?lotNo=`. The non-draft contract opens `/contract-details?contracts_uuids=`.
- **Oracle.** The screen behaves as R-FLA-030-2 says: Draft proposal → `/awarding/:id?lotNo=`; non-draft → `/project/:id/proposal/:proposalUuid?lotNo=`; contracts non-draft → `/contract-details?contracts_uuids=` — src/components/masterQcs/masterQcs.jsx:3
- **Trace.** P1 · draft · `GEN-SCR-186` · layer ui · coverage partial · typed: “screen master-qcs-rfq-one-bid (/project/Y0ROY1hk/master_qcs)”

### GEN-SCR-187 — Proposal status uses the correct display copy

- **Why it matters.** Verify every supported proposal status is presented with the required user-facing text. Written from the master-qcs-rfq-one-bid screen; grounded in R-FLA-030-3 (src/views/projectDetails/constants.js:85-97); screenshot procol-ui-tests/evidence/combo-e3-mvh3e1w5/15-inventory-master-qcs-rfq-one-bid.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Open each of the four specific projects corresponding to Draft, requested, selected, and rejected because no project IDs or titles are provided.; Verify each expected status against its corresponding project and vendor row across separate Master QCS screens..
- **Setup.** Prepare four projects with the vendor proposal statuses draft, requested, selected, and rejected.
- **Steps.** 1. Open each project in Master QCS. 2. Inspect the proposal status in "QA_Platform Vendor 1 1790820862139".
- **Expected.** Draft displays "Draft"; requested displays "Approval in Progress"; selected displays "PO Generated"; rejected displays "Rejected".
- **Oracle.** The screen behaves as R-FLA-030-3 says: Proposal status copy: draft "Draft", requested "Approval in Progress", selected "PO Generated", rejected "Rejected" — src/views/projectDetails/constants.js:85-97
- **Trace.** P1 · draft · `GEN-SCR-187` · layer ui · coverage partial · typed: “screen master-qcs-rfq-one-bid (/project/Y0ROY1hk/master_qcs)”

### GEN-SCR-188 — Line item and participant searches debounce and limit results

- **Why it matters.** Verify search timing and the maximum page size for both tables. Written from the single-stage-auction-price-live screen; grounded in R-FLA-024-5 (src/views/projectDetails/components/participantsTable.jsx:265-267); screenshot procol-ui-tests/evidence/combo-s6-mvh42bs3/11-inventory-single-stage-auction-price-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Waiting at least 300 milliseconds before each result update; Proving intermediate keystrokes do not trigger separate visible searches; Proving that each search waits for the debounce interval before updating.
- **Setup.** Use a project with more than 20 line items and more than 20 participants.
- **Steps.** 1. Enter several characters quickly in "Search line items". 2. Wait at least 300 milliseconds. 3. Review the line-item results. 4. Clear "Search line items". 5. Enter several characters quickly in "Search participants". 6. Wait at least 300 milliseconds. 7. Review the participant results.
- **Expected.** Each search waits for the debounce interval before updating. Intermediate keystrokes do not trigger separate visible searches. Each table displays no more than 20 results on the page.
- **Oracle.** The screen behaves as R-FLA-024-5 says: Search debounced 300 ms; page size 20; proposal page reuses this table without the reject option — src/views/projectDetails/components/participantsTable.jsx:265-267, 397, src/views/projectProposal/pro
- **Trace.** P1 · draft · `GEN-SCR-188` · layer ui · coverage partial · typed: “screen single-stage-auction-price-live (/project/Y2RkY1hk/details)”

### GEN-SCR-189 — Project tabs truncate long titles and identify withdrawn stages

- **Why it matters.** Verify tab title truncation and withdrawn-stage labeling. Written from the single-stage-auction-price-live screen; grounded in R-FLA-016-4 (src/views/projectDetails/projectTabs.jsx:112-135); screenshot procol-ui-tests/evidence/combo-s6-mvh42bs3/11-inventory-single-stage-auction-price-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Cannot create or reach a project containing a withdrawn stage tab.; Cannot assert that a stage tab is truncated to exactly 20 characters.; Cannot hover a truncated stage tab and assert that its tooltip contains the full title.; Cannot assert that the inactive stage tab carries a Withdrawn tag..
- **Setup.** Use a project with a stage title longer than 20 characters and an inactive or withdrawn stage.
- **Steps.** 1. Review the project tabs. 2. Hover over the truncated stage tab. 3. Review the tab for the inactive stage.
- **Expected.** The long tab title is truncated to 20 characters and its tooltip shows the full title. The inactive stage tab carries a "Withdrawn" tag.
- **Oracle.** The screen behaves as R-FLA-016-4 says: Tab titles truncated to 20 chars with tooltip; withdrawn (`in_active`) stages carry a "Withdrawn" tag — src/views/projectDetails/projectTabs.jsx:112-135, 173-175
- **Trace.** P1 · draft · `GEN-SCR-189` · layer ui · coverage none · typed: “screen single-stage-auction-price-live (/project/Y2RkY1hk/details)”

### GEN-SCR-190 — Ask Clara starts awarding and redirects to the returned flow

- **Why it matters.** Verify the analyze_data Clara action and redirect. Written from the single-stage-auction-price-live screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/combo-s6-mvh42bs3/11-inventory-single-stage-auction-price-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The dynamic returned redirect_url and navigation to the awarding flow cannot be asserted.; The awarding flow destination screen cannot be named with expect_navigated because awarding is not an available screen value..
- **Setup.** Use a project where the Ask Clara todo is analyze_data. Stub the successful response with a valid redirect_url.
- **Steps.** 1. Select "Ask Clara". 2. Wait for the action to complete.
- **Expected.** The app shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned redirect_url.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P1 · draft · `GEN-SCR-190` · layer ui · coverage partial · typed: “screen single-stage-auction-price-live (/project/Y2RkY1hk/details)”

### GEN-SCR-191 — Proposal status copy matches each proposal state

- **Why it matters.** Verifies that vendor proposal states use the required user-facing labels. Written from the single-stage-auction-rank-live screen; grounded in R-FLA-030-3 (src/views/projectDetails/constants.js:85-97); screenshot procol-ui-tests/evidence/combo-s4-mvh3zwyk/14-inventory-single-stage-auction-rank-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Selecting each prepared proposal state independently; Repeating the check across all four states and proving the mapping Draft→Draft, requested→Approval in Progress, selected→PO Generated, and rejected→Rejected; Reliably asserting that each status is specifically beside QA_Platform Vendor 1 1790820862139 rather than merely present on the screen.
- **Setup.** Prepare the same lot with proposals in draft, requested, selected, and rejected states one at a time.
- **Steps.** 1. Select the "Master QCS" tab. 2. Review the proposal status beside "QA_Platform Vendor 1 1790820862139". 3. Repeat for each prepared proposal state.
- **Expected.** Draft shows "Draft"; requested shows "Approval in Progress"; selected shows "PO Generated"; rejected shows "Rejected".
- **Oracle.** The screen behaves as R-FLA-030-3 says: Proposal status copy: draft "Draft", requested "Approval in Progress", selected "PO Generated", rejected "Rejected" — src/views/projectDetails/constants.js:85-97
- **Trace.** P1 · draft · `GEN-SCR-191` · layer ui · coverage partial · typed: “screen single-stage-auction-rank-live (/project/Y2RjY1hk/master_qcs)”

### GEN-SCR-192 — Vendor proposal opens the correct destination by type and status

- **Why it matters.** Verifies that proposal and contract rows route to their correct detail pages. Written from the single-stage-auction-rank-live screen; grounded in R-FLA-030-2 (src/components/masterQcs/masterQcs.jsx:354-391); screenshot procol-ui-tests/evidence/combo-s4-mvh3zwyk/14-inventory-single-stage-auction-rank-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Reliably identify and select the vendor column for the draft proposal because no catalog step or confirmed screen label describes that column.; Reliably identify and select the vendor column for the non-draft proposal because no catalog step or confirmed screen label describes that column.; Reliably identify and select the vendor column for the non-draft contract because no catalog step or confirmed screen label describes that column..
- **Setup.** Prepare three lots: one with a draft proposal, one with a non-draft proposal, and one with a non-draft contract. Record each lot number and identifier.
- **Steps.** 1. Select the "Master QCS" tab. 2. Select the vendor column for the draft proposal. 3. Return to "Master QCS". 4. Select the vendor column for the non-draft proposal. 5. Return to "Master QCS". 6. Select the vendor column for the non-draft contract.
- **Expected.** The draft proposal opens `/awarding/:id?lotNo=`. The non-draft proposal opens `/project/:id/proposal/:proposalUuid?lotNo=`. The non-draft contract opens `/contract-details?contracts_uuids=`.
- **Oracle.** The screen behaves as R-FLA-030-2 says: Draft proposal → `/awarding/:id?lotNo=`; non-draft → `/project/:id/proposal/:proposalUuid?lotNo=`; contracts non-draft → `/contract-details?contracts_uuids=` — src/components/masterQcs/masterQcs.jsx:3
- **Trace.** P0 · draft · `GEN-SCR-192` · layer ui · coverage partial · typed: “screen single-stage-auction-rank-live (/project/Y2RjY1hk/master_qcs)”

### GEN-SCR-193 — Project Details overview shows configured project metadata

- **Why it matters.** Checks the required overview values and conditional open-tender display. Written from the single-stage-auction-rank-live screen; grounded in R-FLA-018-1 (src/views/projectDetails/projectDetails.jsx:545-564); screenshot procol-ui-tests/evidence/combo-s4-mvh3zwyk/14-inventory-single-stage-auction-rank-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Assert that Project ID equals the configured value in the format #<refId> because no catalog assertion supports project ID values.; Assert that Created at equals the configured DATE_TIME because no catalog assertion supports created-at values.; Disable is_show_under_open_events and repeat the overview check because the catalog cannot change this configuration or establish the disabled fixture state.; The labels Project ID and Created at are not listed as known labels for the overview screen..
- **Setup.** Prepare a project with a known `refId` and creation timestamp. Run once with `is_show_under_open_events` enabled and once disabled.
- **Steps.** 1. Select "Project Details". 2. Review the project overview. 3. Repeat with the configuration disabled.
- **Expected.** The overview shows "Project ID" as `#<refId>` and "Created at" as the configured DATE_TIME. "Open Tender Event: Yes" appears only when `is_show_under_open_events` is enabled.
- **Oracle.** The screen behaves as R-FLA-018-1 says: Overview: "Project ID" = `#<refId>`, "Created at" = DATE_TIME, "Open Tender Event: Yes" only when config `is_show_under_open_events` — src/views/projectDetails/projectDetails.jsx:545-564
- **Trace.** P1 · draft · `GEN-SCR-193` · layer ui · coverage partial · typed: “screen single-stage-auction-rank-live (/project/Y2RjY1hk/master_qcs)”

### GEN-SCR-194 — Project details are refetched every 30 seconds while mounted

- **Why it matters.** Verifies live project-detail polling on the mounted screen. Written from the single-stage-auction-rank-live screen; grounded in R-FLA-017-1 (src/views/projectDetails/projectDetails.jsx:415-430); screenshot procol-ui-tests/evidence/combo-s4-mvh3zwyk/14-inventory-single-stage-auction-rank-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Keep the page mounted for at least 60 seconds; Verify the requests repeat exactly every 30000 ms; Verify the exact number of refresh requests during the 60-second period.
- **Setup.** Enable network inspection and open the project with the project UUID available.
- **Steps.** 1. Select "Master QCS". 2. Record the initial GET request for the project. 3. Keep the page open for at least 60 seconds. 4. Review the network requests.
- **Expected.** A GET request for the project occurs when the page opens and repeats every 30000 ms while the page remains mounted.
- **Oracle.** The screen behaves as R-FLA-017-1 says: GET `/event_groups/:id` on open and every 30000 ms (`PROJECT_DETAILS_POOL_TIME`) while the page is mounted — src/views/projectDetails/projectDetails.jsx:415-430, src/views/projectDetails/constants.js:
- **Trace.** P1 · draft · `GEN-SCR-194` · layer ui · coverage partial · typed: “screen single-stage-auction-rank-live (/project/Y2RjY1hk/master_qcs)”

### GEN-SCR-195 — Ask Clara analyzes data and redirects to awarding

- **Why it matters.** The analyze_data Clara action must show a success message and use the returned redirect URL. Written from the single-stage-rfq-live screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/combo-s1-mvh3wueu/14-inventory-single-stage-rfq-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact redirect_url returned by the backend cannot be inspected or compared..
- **Setup.** Mock the Ask Clara action as an analyze_data todo and return a valid redirect_url.
- **Steps.** 1. Click "Ask Clara". 2. Wait for the action to complete.
- **Expected.** The app shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned redirect_url.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P0 · draft · `GEN-SCR-195` · layer ui · coverage partial · typed: “screen single-stage-rfq-live (/project/Y1hOY1hk/master_qcs)”

### GEN-SCR-196 — Participant search waits for typing to stop and limits results

- **Why it matters.** Verifies debounced participant filtering, page size, and the participant table data. Written from the single-stage-traffic-light-live screen; grounded in R-FLA-024-5 (src/views/projectDetails/components/participantsTable.jsx:265-267); screenshot procol-ui-tests/evidence/combo-s8-mvh4544b/11-inventory-single-stage-traffic-light-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Timing the continued typing so it occurs before 300 milliseconds elapse; Waiting at least 300 milliseconds after typing stops; Proving filtering does not occur once per keystroke.
- **Setup.** Use a project with more than 20 participants and several participants whose names or codes match the same search text.
- **Steps.** 1. Enter a partial value in "field: Search participants". 2. Continue typing before 300 milliseconds elapse. 3. Stop typing. 4. Wait at least 300 milliseconds. 5. Count the displayed participant rows. 6. Enter a value with no matching participant.
- **Expected.** Filtering occurs after typing stops, not once per keystroke. At most 20 participant rows are displayed on the page. A value with no match shows no participant rows.
- **Oracle.** The screen behaves as R-FLA-024-5 says: Search debounced 300 ms; page size 20; proposal page reuses this table without the reject option — src/views/projectDetails/components/participantsTable.jsx:265-267, 397, src/views/projectProposal/pro
- **Trace.** P1 · draft · `GEN-SCR-196` · layer ui · coverage partial · typed: “screen single-stage-traffic-light-live (/project/Y1FEY1hk/details)”

### GEN-SCR-197 — Long stage tab titles are truncated and expose the full title

- **Why it matters.** Checks stage-tab presentation for long names and withdrawn-stage status. Written from the single-stage-traffic-light-live screen; grounded in R-FLA-016-4 (src/views/projectDetails/projectTabs.jsx:112-135); screenshot procol-ui-tests/evidence/combo-s8-mvh4544b/11-inventory-single-stage-traffic-light-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Creating or renaming a stage with the exact long title and verifying truncation to exactly 20 characters.; Asserting the tooltip contains the complete original stage title because the full title is not provided and no dedicated stage-title assertion exists.; Verifying that the "Withdrawn" tag belongs specifically to an in_active stage tab rather than another page element..
- **Setup.** Use a project with a stage title longer than 20 characters and a withdrawn in_active stage.
- **Steps.** 1. Inspect "tab: spine-ui-automation-...". 2. Hover over the truncated tab title. 3. Inspect the withdrawn stage tab.
- **Expected.** The long tab title is truncated to 20 characters and its tooltip shows the full title. A withdrawn in_active stage tab carries a "Withdrawn" tag.
- **Oracle.** The screen behaves as R-FLA-016-4 says: Tab titles truncated to 20 chars with tooltip; withdrawn (`in_active`) stages carry a "Withdrawn" tag — src/views/projectDetails/projectTabs.jsx:112-135, 173-175
- **Trace.** P2 · draft · `GEN-SCR-197` · layer ui · coverage partial · typed: “screen single-stage-traffic-light-live (/project/Y1FEY1hk/details)”

### GEN-SCR-198 — Vendor selection stays blocked until a template and line item exist

- **Why it matters.** Verify the disabled vendor selector explains each missing prerequisite and becomes usable after both prerequisites are met. Written from the create-erfx screen; grounded in R-FCR-016-2 (src/views/projectCreation/projectCreation.jsx:1457-1481); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: expected message "Please select template for Auction" is neither a known product message nor quoted by the case.
- **Setup.** Open the quick-create screen with no template and no line items.
- **Steps.** 1. Hover over Search vendors you want to add. 2. Verify the tooltip says "Please select template for <stage title>". 3. Click Select Templates. 4. Choose a template. 5. Hover over Search vendors you want to add. 6. Verify the tooltip says "Please add line items". 7. Click Items 0. 8. Add one line item in the manage line items section. 9. Close the manage line items section. 10. Verify Search vendors you want to add is enabled.
- **Expected.** The vendor selector is disabled first with the applicable exact tooltip, then becomes enabled after a template and at least one line item are present.
- **Oracle.** The screen behaves as R-FCR-016-2 says: Disabled with tooltip "Please select template for <stage title>" for any non-RFP stage without a template, or "Please add line items" — src/views/projectCreation/projectCreation.jsx:1457-1481
- **Trace.** P1 · draft · `GEN-SCR-198` · layer ui · coverage partial · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-199 — Save as draft enables after a template and product are added

- **Why it matters.** Verify the disabled footer control is enabled only after the auction has a template and at least one product. Written from the create-erfx screen; grounded in R-FCR-024-2 (src/views/eventCreation/eventCreation.jsx:407-411); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use the default Auction stage. Leave the title empty, with no template and no line items.
- **Steps.** 1. Verify Save as draft is disabled. 2. Enter a project title in Enter the title of the project. 3. Click Select Templates. 4. Choose a template. 5. Click Items 0. 6. Add one product line item. 7. Close the manage line items section.
- **Expected.** Save as draft becomes enabled after a template and at least one product exist.
- **Oracle.** The screen behaves as R-FCR-024-2 says: Footer buttons disabled until a template and at least one product exist (RFI: template data), tooltip " Please choose a template and add a product"; never disabled for RFP — src/views/eventCreation/ev
- **Trace.** P1 · draft · `GEN-SCR-199` · layer ui · coverage full · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-200 — Ask Clara requires project line items

- **Why it matters.** Verify Clara can generate RFP questions only after the project has line items. Written from the create-erfx screen; grounded in R-FCR-042-4 (src/views/eventCreation/components/aiRfpGenerator/api.js:3-11); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Assert that the Clara response contains generated RFP questions after the AI requests complete..
- **Setup.** Select a template and add at least one project line item.
- **Steps.** 1. Click Ask Clara. 2. Wait for the Clara response to load.
- **Expected.** The Clara panel opens and generated RFP questions are displayed after the AI requests complete.
- **Oracle.** The screen behaves as R-FCR-042-4 says: AI RFP → `POST /ask_ai_chats/rfp_questions`, then `GET /external_requests/:uuid`; the AI button needs project line items — src/views/eventCreation/components/aiRfpGenerator/api.js:3-11, src/views/even
- **Trace.** P1 · draft · `GEN-SCR-200` · layer ui · coverage partial · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-201 — Publish opens the confirmation modal with the truncated project title

- **Why it matters.** Verify Publish opens the correct confirmation step and truncates a long project title. Written from the create-erfx screen; grounded in R-FCR-020-2 (src/views/eventCreation/components/footer/confirmModal.jsx:52-60); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use a standard Auction that is not routed to the auction team. Select a template, add one line item, and add at least one participant.
- **Steps.** 1. Enter a project title longer than 45 characters in Enter the title of the project. 2. Click Publish.
- **Expected.** A confirmation modal opens showing the exact text "Publish Event". The project title is truncated to 45 characters, and the confirmation action text is "Publish".
- **Oracle.** The screen behaves as R-FCR-020-2 says: Title: "Send to Auction Team" / project title truncated to 45 / "Publish Event"; OK text "Send to Auction Team" or "Publish"; Cancel is "Edit Schedule" and opens the schedule drawer — src/views/eventC
- **Trace.** P0 · draft · `GEN-SCR-201` · layer ui · coverage full · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-202 — Disabled scheduling control cannot be changed from the create screen

- **Why it matters.** Verify the displayed schedule is visibly locked on this screen and cannot be edited through the disabled control. Written from the create-erfx screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the quick-create screen with its default schedule displayed.
- **Steps.** 1. Verify Now - 02:33 am, 21st Oct ( 30 Mins ) is disabled. 2. Try to click Now - 02:33 am, 21st Oct ( 30 Mins ).
- **Expected.** The control remains disabled and no schedule editor opens.
- **Oracle.** What the tester sees on the create-erfx screen.
- **Trace.** P2 · draft · `GEN-SCR-202` · layer ui · coverage full · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-203 — Select Templates is blocked until line items are added

- **Why it matters.** Verify the disabled template control explains its prerequisite and becomes available after adding a line item. Written from the create-stages-rfp-rfq screen; grounded in R-FCR-016-2 (src/views/projectCreation/projectCreation.jsx:1457-1481); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/05-inventory-create-stages-rfp-rfq.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open a new Technical Stage with no line items.
- **Steps.** 1. Hover over Select Templates. 2. Verify the tooltip. 3. Select Items 0. 4. Add one line item in the Manage Line Items section. 5. Return to the Vendor Assessment screen.
- **Expected.** The disabled Select Templates control shows the tooltip "Please add line items". After a line item is added, Select Templates is enabled.
- **Oracle.** The screen behaves as R-FCR-016-2 says: Disabled with tooltip "Please select template for <stage title>" for any non-RFP stage without a template, or "Please add line items" — src/views/projectCreation/projectCreation.jsx:1457-1481
- **Trace.** P1 · draft · `GEN-SCR-203` · layer ui · coverage full · typed: “screen create-stages-rfp-rfq (/orders/quick-create)”

### GEN-SCR-204 — Publish refuses an empty project title

- **Why it matters.** Verify publishing stops before event creation when the project title is empty. Written from the create-stages-rfp-rfq screen; grounded in R-FCR-013-1 (src/views/projectCreation/projectCreation.jsx:1599-1602); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/05-inventory-create-stages-rfp-rfq.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Prepare a valid event with at least one line item, participant, evaluator, and saved required configuration.
- **Steps.** 1. Clear Enter the title of the project. 2. Select Publish.
- **Expected.** The event is not published. The app shows "Please fill project title!".
- **Oracle.** The screen behaves as R-FCR-013-1 says: Publish with empty project title → "Please fill project title!" before any other check; a whitespace-only title passes (truthiness check) — src/views/projectCreation/projectCreation.jsx:1599-1602
- **Trace.** P0 · draft · `GEN-SCR-204` · layer ui · coverage full · typed: “screen create-stages-rfp-rfq (/orders/quick-create)”

### GEN-SCR-205 — Publish requires saved payment terms

- **Why it matters.** Verify payment terms are mandatory even when the Terms & Conditions area is available. Written from the create-stages-rfp-rfq screen; grounded in R-FCR-039-3 (src/views/projectCreation/helpers.js:278-280); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/05-inventory-create-stages-rfp-rfq.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Explicitly open and verify the Payment Terms modal fields are blank or that no valid paymentTnc object has been saved..
- **Setup.** Prepare an event with a title, line item, participant, and evaluator. Open Terms & Conditions and leave payment terms unset or unsaved.
- **Steps.** 1. Select Publish.
- **Expected.** The event is not published. The app shows "Payment Terms and Conditions are mandatory".
- **Oracle.** The screen behaves as R-FCR-039-3 says: Enabled but not saved → "Payment Terms and Conditions are mandatory" at publish; sent as `configurations.payment_tnc` — src/views/projectCreation/helpers.js:278-280, src/redux/orders/helpers.js:1072-1
- **Trace.** P0 · draft · `GEN-SCR-205` · layer ui · coverage partial · typed: “screen create-stages-rfp-rfq (/orders/quick-create)”

### GEN-SCR-206 — Items 0 opens line-item management

- **Why it matters.** Verify the visible line-item control takes the tester to the section needed to resolve the on-screen missing-line-items message. Written from the create-stages-rfp-rfq screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/05-inventory-create-stages-rfp-rfq.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the Vendor Assessment screen with no line items.
- **Steps.** 1. Select Items 0.
- **Expected.** The Manage Line Items section opens, where line items can be added. The screen's message "Line Items are not added, please add them in Manage Line Items section" identifies the required next action.
- **Oracle.** What the tester sees on the create-stages-rfp-rfq screen.
- **Trace.** P1 · draft · `GEN-SCR-206` · layer ui · coverage full · typed: “screen create-stages-rfp-rfq (/orders/quick-create)”

### GEN-SCR-207 — Publish refuses a project with no line items

- **Why it matters.** Verify the visible zero-item state prevents publishing. Written from the create-technical-template screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/08-inventory-create-technical-template.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Leave the project with zero line items. Enter a project title.
- **Steps.** 1. Confirm "Items 0" is shown. 2. Click "Publish".
- **Expected.** The event is not published. The app shows "Line Items are not added, please add them in Manage Line Items section".
- **Oracle.** What the tester sees on the create-technical-template screen.
- **Trace.** P0 · draft · `GEN-SCR-207` · layer ui · coverage full · typed: “screen create-technical-template (/orders/quick-create)”

### GEN-SCR-208 — Save as draft becomes available after adding a line item

- **Why it matters.** Verify the disabled draft action is enabled when the missing line-item requirement is satisfied. Written from the create-technical-template screen; grounded in R-FCR-016-2 (src/views/projectCreation/projectCreation.jsx:1457-1481); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/08-inventory-create-technical-template.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the screen with no line items, so "Save as draft" is disabled.
- **Steps.** 1. Click "Items 0". 2. Add one line item in the Manage Line Items section. 3. Return to the Vendor Assessment screen.
- **Expected.** "Save as draft" is enabled and no longer disabled.
- **Oracle.** The screen behaves as R-FCR-016-2 says: Disabled with tooltip "Please select template for <stage title>" for any non-RFP stage without a template, or "Please add line items" — src/views/projectCreation/projectCreation.jsx:1457-1481
- **Trace.** P1 · draft · `GEN-SCR-208` · layer ui · coverage full · typed: “screen create-technical-template (/orders/quick-create)”

### GEN-SCR-209 — Publish refuses missing payment terms

- **Why it matters.** Verify payment terms are required when they have not been saved. Written from the create-technical-template screen; grounded in R-FCR-039-3 (src/views/projectCreation/helpers.js:278-280); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/08-inventory-create-technical-template.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Enter a project title, add at least one line item and participant, and leave payment terms unsaved.
- **Steps.** 1. Click "Publish".
- **Expected.** The event is not published. The app shows "Payment Terms and Conditions are mandatory".
- **Oracle.** The screen behaves as R-FCR-039-3 says: Enabled but not saved → "Payment Terms and Conditions are mandatory" at publish; sent as `configurations.payment_tnc` — src/views/projectCreation/helpers.js:278-280, src/redux/orders/helpers.js:1072-1
- **Trace.** P1 · draft · `GEN-SCR-209` · layer ui · coverage full · typed: “screen create-technical-template (/orders/quick-create)”

### GEN-SCR-210 — Ask Clara refuses when no line items exist

- **Why it matters.** Verify the AI RFP generator requires project line items. Written from the create-line-items screen; grounded in R-FCR-042-4 (src/views/eventCreation/components/aiRfpGenerator/api.js:3-11); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/12-inventory-create-line-items.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Directly verify that no questions were generated after the refusal..
- **Setup.** Open a quick-create event with no line items.
- **Steps.** 1. Click "Ask Clara".
- **Expected.** The AI RFP generator does not start because the project has no line items. No questions are generated.
- **Oracle.** The screen behaves as R-FCR-042-4 says: AI RFP → `POST /ask_ai_chats/rfp_questions`, then `GET /external_requests/:uuid`; the AI button needs project line items — src/views/eventCreation/components/aiRfpGenerator/api.js:3-11, src/views/even
- **Trace.** P1 · draft · `GEN-SCR-210` · layer ui · coverage partial · typed: “screen create-line-items (/orders/quick-create)”

### GEN-SCR-211 — Add Attachments opens the attachment interface

- **Why it matters.** Verify the attachment control opens the interface for adding files. Written from the create-line-items screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/12-inventory-create-line-items.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The specific attachment interface controls for choosing or uploading a file.
- **Setup.** Open the create-line-items screen.
- **Steps.** 1. Click "Add Attachments".
- **Expected.** An attachment interface opens, allowing the tester to choose or upload an attachment. The create event screen remains available after the interface is closed.
- **Oracle.** What the tester sees on the create-line-items screen.
- **Trace.** P1 · draft · `GEN-SCR-211` · layer ui · coverage partial · typed: “screen create-line-items (/orders/quick-create)”

### GEN-SCR-212 — Publish opens the event confirmation with schedule details

- **Why it matters.** Verify the publish confirmation presents the configured schedule and vendor summary before completion. Written from the create-line-items screen; grounded in R-FCR-020-3 (src/views/eventCreation/components/footer/confirmModal.jsx:150-181); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/12-inventory-create-line-items.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog cannot configure a specific evaluation duration or verify its exact value in the confirmation.; The catalog cannot prove that the displayed vendor count is de-duplicated across repeated vendor assignments.; The catalog cannot directly assert that publication has not completed beyond observing that the confirmation dialog remains open..
- **Setup.** Use a titled event with valid line items and at least one participant. Leave the displayed schedule unchanged.
- **Steps.** 1. Click "Publish".
- **Expected.** A publish confirmation opens. It shows the start time, ending time with duration, evaluation time when configured, and the de-duplicated vendor count. Publishing has not completed.
- **Oracle.** The screen behaves as R-FCR-020-3 says: Per stage: "Starts on:" (date-time or "Now"), "Ending at: <date-time> (<duration>)", "Evaluation time:" when > 0, "Vendors invited:" de-duplicated count — src/views/eventCreation/components/footer/con
- **Trace.** P0 · draft · `GEN-SCR-212` · layer ui · coverage partial · typed: “screen create-line-items (/orders/quick-create)”

### GEN-SCR-213 — Publish refuses a project without participants

- **Why it matters.** Verify publishing stops when no vendor has been added. Written from the create-pricing-sheet screen; grounded in R-FCR-017-1 (src/views/projectCreation/projectCreation.jsx:1604-1609); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/14-inventory-create-pricing-sheet.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Enter a valid project title and valid values for all required line-item columns. Leave "Search vendors you want to add" empty.
- **Steps.** 1. Click "Publish".
- **Expected.** Publishing stops and the app shows "Please add participants to proceed!".
- **Oracle.** The screen behaves as R-FCR-017-1 says: No participant in the project → "Please add participants to proceed!" (stops) — src/views/projectCreation/projectCreation.jsx:1604-1609
- **Trace.** P0 · draft · `GEN-SCR-213` · layer ui · coverage full · typed: “screen create-pricing-sheet (/orders/quick-create)”

### GEN-SCR-214 — Save as draft creates the initial draft event

- **Why it matters.** Verify the first save creates an event group in draft status with its line-item data. Written from the create-pricing-sheet screen; grounded in R-FCR-014-4 (src/views/projectCreation/projectCreation.jsx:2259-2269); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/14-inventory-create-pricing-sheet.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Enter a project title and valid values for all required line-item columns.
- **Steps.** 1. Click "Save as draft".
- **Expected.** The event is saved as a draft. The draft retains the entered title and line-item values.
- **Oracle.** The screen behaves as R-FCR-014-4 says: First save → `POST /event_groups` `{status:"draft", title, line_items:[{product_uuid, quantity:{unitSymbol,value}, product_quality_uuid, serial_number, pr_line_item_uuid, pr_id}]}`; later saves → `PAT
- **Trace.** P0 · draft · `GEN-SCR-214` · layer ui · coverage full · typed: “screen create-pricing-sheet (/orders/quick-create)”

### GEN-SCR-215 — Changing the selected template asks for confirmation

- **Why it matters.** Verify that changing an existing template warns that current data will be reset. Written from the create-pricing-sheet screen; grounded in R-FCR-026-4 (src/views/eventCreation/templateSelection.jsx:349-360); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/14-inventory-create-pricing-sheet.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Reliably choose and verify a different template from the template picker..
- **Setup.** Open a pricing sheet that already has a template and populated event data.
- **Steps.** 1. Click "Buy Template". 2. Choose a different template. 3. Stop at the confirmation dialog.
- **Expected.** The confirmation dialog shows "Changing template will reset data. Are you sure?" and the confirmation action is labeled "Yes".
- **Oracle.** The screen behaves as R-FCR-026-4 says: Changing an existing template asks "Do you really want to change the template?" (project) / "Changing template will reset data. Are you sure?" (quick-create), OK "Yes" — templateSelection.jsx:349-360,
- **Trace.** P1 · draft · `GEN-SCR-215` · layer ui · coverage partial · typed: “screen create-pricing-sheet (/orders/quick-create)”

### GEN-SCR-216 — Pricing sheet navigation controls open their sections

- **Why it matters.** Verify that the visible section controls open the corresponding pricing-sheet areas. Written from the create-pricing-sheet screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/14-inventory-create-pricing-sheet.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact matching section identity for every navigation control when the product does not expose a distinct known heading inside the opened overlay..
- **Setup.** Open the create-pricing-sheet screen.
- **Steps.** 1. Click "Items 2" and verify the item section opens. 2. Close the item section. 3. Click "Add Columns" and verify the column selector opens. 4. Close the column selector. 5. Click "Add Attachments" and verify the attachment area opens. 6. Close the attachment area. 7. Click "Add T&Cs" and verify the terms editor opens. 8. Close the terms editor. 9. Click each of "Details", "Price Components", "Participants", "Savings", and "Terms & Conditions". 10. Click "Now - 02:33 am, 21st Oct ( 30 Mins )" and verify the schedule editor opens.
- **Expected.** Each control opens its matching section or editor without navigating away from the create-pricing-sheet screen.
- **Oracle.** What the tester sees on the create-pricing-sheet screen.
- **Trace.** P1 · draft · `GEN-SCR-216` · layer ui · coverage partial · typed: “screen create-pricing-sheet (/orders/quick-create)”

### GEN-SCR-217 — Block blacklisted and TNA vendors during vendor selection

- **Why it matters.** Verifies that restricted vendors cannot be selected during a fresh event setup. Written from the create-technical-questionnaire screen; grounded in R-FCR-035-3 (src/views/projectCreation/projectCreation.jsx:255-256); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/18-inventory-create-technical-questionnaire.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Search for the specifically named blacklisted vendor because no vendor name is provided and no catalog step can perform a vendor search with an unknown value.; Search for the specifically named TNA vendor because no vendor name is provided and no catalog step can perform a vendor search with an unknown value.; Assert that each specific vendor result is disabled and associate the disabled state with the corresponding Blocked or TNA label..
- **Setup.** Have one blacklisted vendor and one TNA vendor available in the vendor search results.
- **Steps.** 1. Click "Invite Vendor". 2. Open "Search vendors you want to add". 3. Search for the blacklisted vendor. 4. Inspect the vendor result. 5. Search for the TNA vendor. 6. Inspect the vendor result.
- **Expected.** The blacklisted vendor is disabled and marked "Blocked". The TNA vendor is disabled and marked "TNA".
- **Oracle.** The screen behaves as R-FCR-035-3 says: In search results blacklisted vendors are disabled with "Blocked"; TNA vendors are disabled with "TNA" unless the URL has `allowTnaVendorsToBid=true` (so on a fresh create every TNA vendor is unselect
- **Trace.** P1 · draft · `GEN-SCR-217` · layer ui · coverage partial · typed: “screen create-technical-questionnaire (/orders/quick-create)”

### GEN-SCR-218 — Disable the project title while adding a stage to an existing project

- **Why it matters.** Verifies that the project title cannot be changed when a new stage is added to an existing project. Written from the create-technical-questionnaire screen; grounded in R-FCR-013-2 (src/views/projectCreation/projectCreation.jsx:1433-1435); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/18-inventory-create-technical-questionnaire.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Directly open the technical-stage creation flow for an existing project without first creating a new version..
- **Setup.** Open an existing project and start adding a new technical stage.
- **Steps.** 1. Open the technical stage creation screen. 2. Inspect "Enter the title of the project".
- **Expected.** "Enter the title of the project" is disabled while the new stage is being added to the existing project.
- **Oracle.** The screen behaves as R-FCR-013-2 says: Project title input is disabled when adding a new stage to an existing project — src/views/projectCreation/projectCreation.jsx:1433-1435, 3283-3292
- **Trace.** P1 · draft · `GEN-SCR-218` · layer ui · coverage partial · typed: “screen create-technical-questionnaire (/orders/quick-create)”

### GEN-SCR-219 — Save the draft with the complete project payload

- **Why it matters.** Verifies that saving a draft sends the project, line-item, participant, and terms data expected by the create flow. Written from the create-technical-questionnaire screen; grounded in R-FCR-008-1 (src/redux/project/actions.js:52-88); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/18-inventory-create-technical-questionnaire.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Set or verify a project description in the draft payload; Verify draft trade request UUID values specifically; Verify audience company UUID values specifically; Verify the line-item status, UUID, product UUID, and product quality UUID as exact nested fields and values; Create or verify a terms_and_conditions object containing clauses and attachments.
- **Setup.** Enter a project title, complete the required Specification, Description, and Vendor Response data, add a participant, and enable request inspection in the browser.
- **Steps.** 1. Click "Save as draft". 2. Inspect the save request body.
- **Expected.** The request includes title, description, status, draft trade request UUIDs, audience company UUIDs, line items with status, UUID, quantity, product UUID, and product quality UUID, and a terms_and_conditions object with clauses and attachments.
- **Oracle.** The screen behaves as R-FCR-008-1 says: Body: `title`, `description`, `status`, `draft_trade_request_uuids`, `audience_company_uuids`, `line_items` (kept + deleted, each `{status, uuid, quantity, product_uuid, product_quality_uuid}`), `term
- **Trace.** P1 · draft · `GEN-SCR-219` · layer ui · coverage partial · typed: “screen create-technical-questionnaire (/orders/quick-create)”

### GEN-SCR-220 — Open the item list from the item count

- **Why it matters.** Verifies that the visible item-count control opens the project's item list. Written from the create-technical-questionnaire screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/18-inventory-create-technical-questionnaire.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Directly assert that the opened item list or details view displays exactly two configured item rows..
- **Setup.** Open the technical questionnaire with two configured items.
- **Steps.** 1. Click "Items 2".
- **Expected.** The item list or item details view opens and shows the two configured items.
- **Oracle.** What the tester sees on the create-technical-questionnaire screen.
- **Trace.** P2 · draft · `GEN-SCR-220` · layer ui · coverage partial · typed: “screen create-technical-questionnaire (/orders/quick-create)”

### GEN-SCR-221 — Custom duration requires an end time before publishing

- **Why it matters.** Verify the different validation behavior after selecting a custom duration. Written from the create-schedule screen; grounded in R-FCR-022-7 (src/views/projectCreation/components/projectScheduler/stageSchedulerCard/stageSchedulerCard.jsx:302-314); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/21-inventory-create-schedule.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Create a schedule with a valid title and line items.
- **Steps.** 1. Select Custom duration from Duration. 2. Leave the end time unset. 3. Click Save Schedule. 4. Click Publish.
- **Expected.** Save Schedule succeeds without requesting an end time. Publishing fails with "Please add end time for the event".
- **Oracle.** The screen behaves as R-FCR-022-7 says: choosing "Custom duration" first sets end to undefined; closing the popover then Save passes (NaN comparisons) and publish fails "Please add end time for the event" — stageSchedulerCard.jsx:302-314. B
- **Trace.** P1 · draft · `GEN-SCR-221` · layer ui · coverage full · typed: “screen create-schedule (/orders/quick-create)”

### GEN-SCR-222 — Back discards unsaved schedule changes

- **Why it matters.** Verify that schedule changes are not stored until Save Schedule is used. Written from the create-schedule screen; grounded in R-FCR-022-6 (src/views/projectCreation/components/projectScheduler/projectScheduler.jsx:83-111); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/21-inventory-create-schedule.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Change the schedule duration without committing it; Change the project title as part of the unsaved schedule edit state; Verify that Back discards the unsaved title and duration changes.
- **Setup.** Open an existing schedule and note its current title and duration.
- **Steps.** 1. Change the value in Enter the title of the project. 2. Change Duration. 3. Click Back. 4. Reopen the same schedule.
- **Expected.** The schedule returns to the previous screen without saving the changes. Reopening it shows the original title and duration.
- **Oracle.** The screen behaves as R-FCR-022-6 says: Nothing is stored on the stage until Save Schedule passes; Back discards — projectScheduler.jsx:83-111, 37-39
- **Trace.** P1 · draft · `GEN-SCR-222` · layer ui · coverage none · typed: “screen create-schedule (/orders/quick-create)”

### GEN-SCR-223 — The schedule chip shows the current start, end, and duration

- **Why it matters.** Verify the schedule summary format and its refresh behavior for a now-starting event. Written from the create-schedule screen; grounded in R-FCR-024-1 (src/views/eventCreation/components/footer/footer.jsx:37-72); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/21-inventory-create-schedule.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Confirming that the Start now option is selected in the schedule drawer; Verifying the end time equals the actual current time plus the selected duration; Waiting at least 10 seconds and confirming that the schedule chip refreshes as time advances; unconfirmed label "30 Mins" (expect_text) — not among the labels known from the app nor in the case.
- **Setup.** Use a schedule configured to start now.
- **Steps.** 1. Confirm that Start now is selected. 2. Set Duration to a known duration. 3. Observe the schedule chip. 4. Wait at least 10 seconds and observe it again.
- **Expected.** The chip shows "Now - <end> (<duration>)". The end time reflects the current time plus the selected duration, and the chip refreshes as time advances.
- **Oracle.** The screen behaves as R-FCR-024-1 says: Schedule chip: "Now - <end>" or "<start> to <end>" plus "(duration)"; start format "h:mm a", end "hh:mm a, Do MMM", start gets the long format past 24 h, both get the year when years differ; refreshes
- **Trace.** P1 · draft · `GEN-SCR-223` · layer ui · coverage partial · typed: “screen create-schedule (/orders/quick-create)”

### GEN-SCR-224 — Custom duration without an end time is rejected on publish

- **Why it matters.** Verifies that a custom duration cannot be published when no end time is provided. Written from the create-participants screen; grounded in R-FCR-022-7 (src/views/projectCreation/components/projectScheduler/stageSchedulerCard/stageSchedulerCard.jsx:302-314); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/23-inventory-create-participants.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Directly assert that the schedule was persisted successfully after clicking Save Schedule..
- **Setup.** Open a new RFQ event with the schedule drawer available.
- **Steps.** 1. Open Duration. 2. Select Custom duration. 3. Close the duration popover without entering an end time. 4. Click Save Schedule. 5. Click Publish.
- **Expected.** The schedule saves, but publishing is refused with "Please add end time for the event".
- **Oracle.** The screen behaves as R-FCR-022-7 says: choosing "Custom duration" first sets end to undefined; closing the popover then Save passes (NaN comparisons) and publish fails "Please add end time for the event" — stageSchedulerCard.jsx:302-314. B
- **Trace.** P1 · draft · `GEN-SCR-224` · layer ui · coverage partial · typed: “screen create-participants (/orders/quick-create)”

### GEN-SCR-225 — Fixed-time scheduling enables the date field

- **Why it matters.** Verifies the schedule controls change when the event is switched from starting now to a fixed time. Written from the create-participants screen; grounded in R-FCR-022-5 (src/views/projectCreation/components/projectScheduler/constants.js:1-1); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/23-inventory-create-participants.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open a new RFQ event. Confirm Select date is initially disabled.
- **Steps.** 1. Open Start now. 2. Select Fixed time. 3. Review Select date and Select time.
- **Expected.** Select date is enabled for input, and Select time is available for the fixed-time schedule.
- **Oracle.** The screen behaves as R-FCR-022-5 says: Duration menu = template `event_duration_predefined_values[mode].event_duration` or default 30 min, 1 h, 4 h, 24 h; switching to "Fixed time" presets now + 30 min — stageSchedulerCard.jsx:68-71, 213-2
- **Trace.** P1 · draft · `GEN-SCR-225` · layer ui · coverage full · typed: “screen create-participants (/orders/quick-create)”

### GEN-SCR-226 — Recurring scheduling is copied to every stage

- **Why it matters.** Verifies that saving recurring configuration applies the same configuration to every stage. Written from the create-participants screen; grounded in R-FCR-021-3 (src/views/projectCreation/components/projectScheduler/projectScheduler.jsx:92-106); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/23-inventory-create-participants.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open a project containing both a Technical Stage and an RFQ stage.
- **Steps.** 1. Open the schedule for the current stage. 2. Turn on Mark as Recurring EventSet this event to repeat automaticall. 3. Configure the recurring schedule. 4. Click Save Schedule. 5. Open Technical Stage and review its schedule. 6. Open RFQ and review its schedule.
- **Expected.** Both stages show the same recurring configuration after the schedule is saved.
- **Oracle.** The screen behaves as R-FCR-021-3 says: Save Schedule copies the same recurring config onto every stage — src/views/projectCreation/components/projectScheduler/projectScheduler.jsx:92-106
- **Trace.** P1 · draft · `GEN-SCR-226` · layer ui · coverage full · typed: “screen create-participants (/orders/quick-create)”

### GEN-SCR-227 — Required line-item columns are visibly marked

- **Why it matters.** Verifies that the screen identifies every required line-item column before the event is saved or published. Written from the create-participants screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/23-inventory-create-participants.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Assert that Product, Product Variant, Quantity Requested, Delivery location, Price, Quantity Available, and Total Amount each display a required marker.; Assert that GST does not display a required marker..
- **Setup.** Open the line-item grid on the RFQ event.
- **Steps.** 1. Review the headers Product, Product Variant, Quantity Requested, Delivery location, Price, Quantity Available, and Total Amount.
- **Expected.** Each listed header displays a required marker. GST does not display a required marker.
- **Oracle.** What the tester sees on the create-participants screen.
- **Trace.** P1 · draft · `GEN-SCR-227` · layer ui · coverage none · typed: “screen create-participants (/orders/quick-create)”

### GEN-SCR-228 — Published Stages shows the correct columns and values

- **Why it matters.** Verify published-stage headers, participant counts, pending actions, and date formatting. Written from the project-live screen; grounded in R-FLA-026-1 (src/views/projectDetails/components/publishedStagesTable.jsx:31-99); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/26-inventory-project-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Verify that Stage Code is shown only when at least one specific stage row has a ref_id.; Verify the active/total participant format and missing 0 values on the specific corresponding stage rows.; Verify missing dates show '-' on the specific corresponding stage rows.; unconfirmed label "0" (expect_text) — not among the labels known from the app nor in the case; unconfirmed label "-" (expect_text) — not among the labels known from the app nor in the case.
- **Setup.** Use a project with one stage that has a ref_id, one stage without a ref_id, pending actions, and participant totals.
- **Steps.** 1. Click "Published Stages". 2. Inspect the table headers and stage rows. 3. Check the stage with a ref_id. 4. Check the stage without a ref_id.
- **Expected.** The table shows Stage Title, Pending Actions, Participants, Bidding Starts At, and Bidding Ends At. Stage Code is shown only when at least one row has a ref_id. Participants use the active/total format, missing values show 0, and missing dates show "-".
- **Oracle.** The screen behaves as R-FLA-026-1 says: Columns: Stage Code (dropped when no row has `ref_id`), Stage Title, Pending Actions, Participants "active/total" (missing → 0), Bidding Starts At / Ends At (DATE_TIME or "-") — src/views/projectDetai
- **Trace.** P1 · draft · `GEN-SCR-228` · layer ui · coverage partial · typed: “screen project-live (/project/a2dOY1hk/details)”

### GEN-SCR-229 — Line Items and Participants headings show response counts

- **Why it matters.** Verify the panel count tags reflect line-item and participant responses. Written from the project-live screen; grounded in R-FLA-018-4 (src/views/projectDetails/projectDetails.jsx:916-946); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/26-inventory-project-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use a project with two line-item responses and one participant response.
- **Steps.** 1. Open the project details screen. 2. Inspect the Line Items heading. 3. Inspect the Participants heading.
- **Expected.** The headings show the response counts as Line Items 2 and Participants 1.
- **Oracle.** The screen behaves as R-FLA-018-4 says: Line Items / Participants panel headers show count tags from the line-item and participant responses — src/views/projectDetails/projectDetails.jsx:916-946, src/redux/project/selectors.js:867-876
- **Trace.** P1 · draft · `GEN-SCR-229` · layer ui · coverage full · typed: “screen project-live (/project/a2dOY1hk/details)”

### GEN-SCR-230 — Draft RFQ-to-auction stage opens the create screen with its draft event

- **Why it matters.** Verify that selecting a draft RFQ-to-auction stage uses the draft event identifier and opens the correct create screen. Written from the project-live screen; grounded in R-FLA-026-2 (src/views/projectDetails/components/publishedStagesTable.jsx:15-29); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/26-inventory-project-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog cannot directly observe whether an auction-team permission check was executed or skipped internally..
- **Setup.** Use a project containing a draft RFQ-to-auction stage.
- **Steps.** 1. Click "RFQ". 2. Wait for navigation to finish.
- **Expected.** The create screen opens for the draft stage and retains the draftEventId. No auction-team permission check blocks the navigation.
- **Oracle.** The screen behaves as R-FLA-026-2 says: Clicking a draft rfq→auction stage opens the create screen with `draftEventId` (no auction-team check); other stages switch tab — src/views/projectDetails/components/publishedStagesTable.jsx:15-29
- **Trace.** P1 · draft · `GEN-SCR-230` · layer ui · coverage partial · typed: “screen project-live (/project/a2dOY1hk/details)”

### GEN-SCR-231 — Overview displays the project identifier and creation time

- **Why it matters.** Verify the overview values and conditional open-tender indicator. Written from the project-live screen; grounded in R-FLA-018-1 (src/views/projectDetails/projectDetails.jsx:545-564); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/26-inventory-project-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Validate that Project ID is specifically formatted as '#<refId>' rather than merely displaying a Project ID value; Validate that Created at contains a correctly formatted date and time value; Toggle or compare the is_show_under_open_events configuration between enabled and disabled states; Assert that 'Open Tender Event: Yes' is absent when is_show_under_open_events is disabled.
- **Setup.** Use a project with a known refId and created-at value. Run once with is_show_under_open_events enabled and once with it disabled.
- **Steps.** 1. Click "Overview". 2. Inspect Project ID and Created at. 3. Check the open-tender indicator with the configuration enabled. 4. Check the indicator with the configuration disabled.
- **Expected.** Project ID is displayed as "#<refId>" and Created at is displayed as a date and time. "Open Tender Event: Yes" appears only when is_show_under_open_events is enabled.
- **Oracle.** The screen behaves as R-FLA-018-1 says: Overview: "Project ID" = `#<refId>`, "Created at" = DATE_TIME, "Open Tender Event: Yes" only when config `is_show_under_open_events` — src/views/projectDetails/projectDetails.jsx:545-564
- **Trace.** P1 · draft · `GEN-SCR-231` · layer ui · coverage partial · typed: “screen project-live (/project/a2dOY1hk/details)”

### GEN-SCR-232 — Participant search waits for debounce and limits results

- **Why it matters.** Verify participant filtering behavior and the page-size limit. Written from the project-live screen; grounded in R-FLA-024-5 (src/views/projectDetails/components/participantsTable.jsx:265-267); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/26-inventory-project-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: 300-millisecond debounce timing after the final character; Filtering not occurring for each intermediate keystroke; Replacing the search with a specific vendor code and verifying the matching results; Exact vendor name and vendor code values are not provided; Observing that returned results match the entered vendor name or code.
- **Setup.** Use more than 20 participants, including several whose vendor name or code matches a unique search term.
- **Steps.** 1. Enter a vendor name in "Search participants". 2. Continue typing before 300 milliseconds elapse. 3. Wait at least 300 milliseconds after the final character. 4. Inspect the participant results. 5. Replace the search with a vendor code and wait again.
- **Expected.** Filtering occurs after the 300-millisecond debounce, not for every intermediate keystroke. Results match the vendor name or vendor code, and no more than 20 results appear on the page.
- **Oracle.** The screen behaves as R-FLA-024-5 says: Search debounced 300 ms; page size 20; proposal page reuses this table without the reject option — src/views/projectDetails/components/participantsTable.jsx:265-267, 397, src/views/projectProposal/pro
- **Trace.** P1 · draft · `GEN-SCR-232` · layer ui · coverage partial · typed: “screen project-live (/project/a2dOY1hk/details)”

### GEN-SCR-233 — Open the response template from the no-bids message

- **Why it matters.** Verify that the response-template link in the no-bids message opens the intended content. Written from the project-settings-menu screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/28-inventory-project-settings-menu.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Assert that the response template opens or verify the template screen's route and contents..
- **Setup.** Open the project with the message "No bids placed yet.Click hereto view response template."
- **Steps.** 1. Click "Click here".
- **Expected.** The response template opens.
- **Oracle.** What the tester sees on the project-settings-menu screen.
- **Trace.** P1 · draft · `GEN-SCR-233` · layer ui · coverage none · typed: “screen project-settings-menu (/project/a2dOY1hk/Y3Bka2Rr)”

### GEN-SCR-234 — Open the withdrawal confirmation without completing withdrawal

- **Why it matters.** Verify that withdrawal requires a non-blank remark or an attachment before confirmation is enabled. Written from the project-settings-menu screen; grounded in R-FLA-020-1 (src/views/projectDetails/components/withdrawProjectModal.jsx:19-19); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/28-inventory-project-settings-menu.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog cannot explicitly assert that no attachment was added beyond leaving the attachment field untouched..
- **Setup.** Use a project that can be withdrawn.
- **Steps.** 1. Click "Actions". 2. Click "Withdraw". 3. Inspect the withdrawal dialog without entering a remark or adding an attachment.
- **Expected.** The withdrawal dialog opens. "Withdrawal Remarks" is marked with *. The confirmation action is disabled while the remark is blank and no attachment is added.
- **Oracle.** The screen behaves as R-FLA-020-1 says: "Yes, Withdraw Project" disabled only when remarks are blank (after trim) AND no attachment is added — a file alone enables it although "Withdrawal Remarks" is marked * — src/views/projectDetails/comp
- **Trace.** P0 · draft · `GEN-SCR-234` · layer ui · coverage partial · typed: “screen project-settings-menu (/project/a2dOY1hk/Y3Bka2Rr)”

### GEN-SCR-235 — Keep Request for Re-evaluation disabled when the screen has no eligible response

- **Why it matters.** Verify the disabled state shown for Request for Re-evaluation on this screen. Written from the project-settings-menu screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/28-inventory-project-settings-menu.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the displayed project with no bids placed.
- **Steps.** 1. Click "Actions". 2. Inspect "Request for Re-evaluation".
- **Expected.** "Request for Re-evaluation" is disabled and cannot be selected.
- **Oracle.** What the tester sees on the project-settings-menu screen.
- **Trace.** P1 · draft · `GEN-SCR-235` · layer ui · coverage full · typed: “screen project-settings-menu (/project/a2dOY1hk/Y3Bka2Rr)”

### GEN-SCR-236 — Start Clara data analysis and follow its redirect

- **Why it matters.** Verify the successful analyze_data flow and redirect returned by the service. Written from the project-settings-menu screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/28-inventory-project-settings-menu.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Starting Clara data analysis as a distinct action is not represented by a dedicated catalog step.; The exact redirect_url returned by the backend cannot be asserted; only a URL substring can be checked..
- **Setup.** Use a project where the Clara todo action is analyze_data and the service returns a redirect_url.
- **Steps.** 1. Click "Ask Clara".
- **Expected.** The message "Awarding initiated successfully, redirecting to awarding flow..." appears, then the browser navigates to the returned redirect_url.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P1 · draft · `GEN-SCR-236` · layer ui · coverage partial · typed: “screen project-settings-menu (/project/a2dOY1hk/Y3Bka2Rr)”

### GEN-SCR-237 — Create New Version opens the cloning flow

- **Why it matters.** Verifies the available project cloning entry point and its stage restriction. Written from the participants-live screen; grounded in R-FLA-021-1 (src/views/projectDetails/components/cloneProjectModal.jsx:17-53); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/31-inventory-participants-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open a project containing Technical and RFQ stages.
- **Steps.** 1. Click "Create New Version".
- **Expected.** A cloning modal opens and says "Cloning is supported only for the Technical and RFQ stages." Do not confirm the clone.
- **Oracle.** The screen behaves as R-FLA-021-1 says: Clone: POST `/event_groups/:id/create_clone` (no body); success "Project cloned successfully" → `/project/<event_group_uuid>/details`; modal says "Cloning is supported only for the Technical and RFQ s
- **Trace.** P1 · draft · `GEN-SCR-237` · layer ui · coverage full · typed: “screen participants-live (/project/a2dOY1hk/Y3Bwa2Rr)”

### GEN-SCR-238 — Ask Clara starts awarding when an analyze_data todo exists

- **Why it matters.** Verifies the Clara awarding action and its success navigation. Written from the participants-live screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/31-inventory-participants-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: That an analyze_data todo specifically existed before clicking Ask Clara; The exact returned redirect URL; only navigation to the /awarding/ route can be asserted.
- **Setup.** Open a project with an Ask Clara analyze_data todo and a returned awarding redirect URL.
- **Steps.** 1. Click "Ask Clara".
- **Expected.** The message "Awarding initiated successfully, redirecting to awarding flow..." appears, then the page navigates to the returned redirect URL.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P1 · draft · `GEN-SCR-238` · layer ui · coverage partial · typed: “screen participants-live (/project/a2dOY1hk/Y3Bwa2Rr)”

### GEN-SCR-239 — RFQ returns to the RFQ Responses view

- **Why it matters.** Verifies navigation back to the currently displayed RFQ response content. Written from the participants-live screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/31-inventory-participants-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the project and first click "Project Details".
- **Steps.** 1. Click the "RFQ" tab. 2. Click the "Responses" tab.
- **Expected.** The RFQ Responses view opens. The no-bids message is visible: "No bids placed yet.Click hereto view response template."
- **Oracle.** What the tester sees on the participants-live screen.
- **Trace.** P1 · draft · `GEN-SCR-239` · layer ui · coverage full · typed: “screen participants-live (/project/a2dOY1hk/Y3Bwa2Rr)”

### GEN-SCR-240 — Selected-vendor switch changes the participant list

- **Why it matters.** Verify the visible selected-vendor filter can be changed and the list responds. Written from the surrogate-bid-placed screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/34-inventory-surrogate-bid-placed.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Cannot independently assert that every vendor shown with the switch on is selected or that every vendor shown with it off is unselected..
- **Setup.** Use a project containing both selected and unselected vendors.
- **Steps.** 1. Confirm the switch is on. 2. Record the vendors shown. 3. Turn the switch off. 4. Compare the vendor list with the recorded list. 5. Turn the switch on again.
- **Expected.** With the switch on, only selected vendors are shown. With the switch off, the list can include unselected vendors. Turning it on again restores the selected-vendor view.
- **Oracle.** What the tester sees on the surrogate-bid-placed screen.
- **Trace.** P1 · draft · `GEN-SCR-240` · layer ui · coverage partial · typed: “screen surrogate-bid-placed (/project/a2dOY1hk/Y3Bwa2Rr)”

### GEN-SCR-241 — Ask Clara starts the awarding flow

- **Why it matters.** Verify the Clara awarding action displays its success message and follows the returned destination. Written from the surrogate-bid-placed screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/34-inventory-surrogate-bid-placed.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact redirect URL returned by the Ask Clara action cannot be captured and compared dynamically.; The underlying action response payload cannot be inspected..
- **Setup.** Use a project where the Ask Clara action has an analyze_data todo and the service returns a redirect URL.
- **Steps.** 1. Click Ask Clara. 2. Wait for the action to finish.
- **Expected.** The message "Awarding initiated successfully, redirecting to awarding flow..." appears, and the browser navigates to the returned redirect URL.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P1 · draft · `GEN-SCR-241` · layer ui · coverage partial · typed: “screen surrogate-bid-placed (/project/a2dOY1hk/Y3Bwa2Rr)”

### GEN-SCR-242 — Add Price Cap opens its price-cap interface

- **Why it matters.** Verify the enabled price-cap action opens the interface needed to configure a cap. Written from the surrogate-bid-placed screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/34-inventory-surrogate-bid-placed.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open an RFQ project where Add Price Cap is visible.
- **Steps.** 1. Click Add Price Cap.
- **Expected.** The price-cap configuration interface opens without navigating away from the project details page.
- **Oracle.** What the tester sees on the surrogate-bid-placed screen.
- **Trace.** P1 · draft · `GEN-SCR-242` · layer ui · coverage full · typed: “screen surrogate-bid-placed (/project/a2dOY1hk/Y3Bwa2Rr)”

### GEN-SCR-243 — Messages and Settings open their respective panels

- **Why it matters.** Verify the two enabled project actions open the expected project interfaces. Written from the surrogate-bid-placed screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/34-inventory-surrogate-bid-placed.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The specific Messages interface opening and its contents cannot be uniquely asserted because no messages-panel or messages-screen assertion exists..
- **Setup.** Open the project details screen.
- **Steps.** 1. Click Messages. 2. Verify the messages interface opens. 3. Return to the project details screen. 4. Click Settings.
- **Expected.** Messages opens the project's messaging interface. Settings opens the project's settings interface.
- **Oracle.** What the tester sees on the surrogate-bid-placed screen.
- **Trace.** P1 · draft · `GEN-SCR-243` · layer ui · coverage partial · typed: “screen surrogate-bid-placed (/project/a2dOY1hk/Y3Bwa2Rr)”

### GEN-SCR-244 — Create New Version opens the supported-stage clone confirmation

- **Why it matters.** Verify that cloning starts with the correct confirmation and stage restriction. Written from the master-qcs-live screen; grounded in R-FLA-021-1 (src/views/projectDetails/components/cloneProjectModal.jsx:17-53); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/36-inventory-master-qcs-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open a project on the Master QCS screen.
- **Steps.** 1. Click "Create New Version".
- **Expected.** A clone confirmation modal appears and says "Cloning is supported only for the Technical and RFQ stages."
- **Oracle.** The screen behaves as R-FLA-021-1 says: Clone: POST `/event_groups/:id/create_clone` (no body); success "Project cloned successfully" → `/project/<event_group_uuid>/details`; modal says "Cloning is supported only for the Technical and RFQ s
- **Trace.** P1 · draft · `GEN-SCR-244` · layer ui · coverage full · typed: “screen master-qcs-live (/project/a2dOY1hk/master_qcs)”

### GEN-SCR-245 — Ask Clara analyzes data and redirects to the returned awarding URL

- **Why it matters.** Verify the Clara analysis todo completes with the required message and navigation. Written from the master-qcs-live screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/36-inventory-master-qcs-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact returned redirect_url value; Completion and response of the analysis request because its endpoint is unspecified.
- **Setup.** Open a project whose Clara todo is "analyze_data". Configure the analysis response with a valid redirect_url.
- **Steps.** 1. Click "Ask Clara". 2. Wait for the analysis request to complete.
- **Expected.** The app shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned redirect_url.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P1 · draft · `GEN-SCR-245` · layer ui · coverage partial · typed: “screen master-qcs-live (/project/a2dOY1hk/master_qcs)”

### GEN-SCR-246 — Project Details overview shows project identity and creation information

- **Why it matters.** Verify the overview renders the required project metadata and conditional open-tender value. Written from the master-qcs-live screen; grounded in R-FLA-018-1 (src/views/projectDetails/projectDetails.jsx:545-564); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/36-inventory-master-qcs-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact Project ID value formatted as #<refId> because refId is not provided and no catalog assertion reads it.; Exact Created at value matching the configured DATE_TIME because no catalog step can assert this field's dynamic timestamp..
- **Setup.** Configure a project with refId, a known creation date, and is_show_under_open_events enabled. Open the project.
- **Steps.** 1. Click "Project Details". 2. Inspect the overview information.
- **Expected.** The overview shows "Project ID" as "#<refId>", "Created at" as the configured DATE_TIME, and "Open Tender Event: Yes".
- **Oracle.** The screen behaves as R-FLA-018-1 says: Overview: "Project ID" = `#<refId>`, "Created at" = DATE_TIME, "Open Tender Event: Yes" only when config `is_show_under_open_events` — src/views/projectDetails/projectDetails.jsx:545-564
- **Trace.** P1 · draft · `GEN-SCR-246` · layer ui · coverage partial · typed: “screen master-qcs-live (/project/a2dOY1hk/master_qcs)”

### GEN-SCR-247 — Master QCS uses the defined proposal status labels

- **Why it matters.** Verify that proposal states are presented with the correct user-facing copy. Written from the master-qcs-live screen; grounded in R-FLA-030-3 (src/views/projectDetails/constants.js:85-97); screenshot procol-ui-tests/evidence/walk-create-erfx-mvh53smf/36-inventory-master-qcs-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Verify that each status label is attached to the correct vendor column or proposal.; Verify the underlying proposal state-to-label mapping for each individual proposal..
- **Setup.** Prepare Master QCS data containing proposals in draft, requested, selected, and rejected states for the displayed vendor column.
- **Steps.** 1. Click "Master QCS". 2. Inspect the proposal status values in the vendor column.
- **Expected.** Draft proposals show "Draft", requested proposals show "Approval in Progress", selected proposals show "PO Generated", and rejected proposals show "Rejected".
- **Oracle.** The screen behaves as R-FLA-030-3 says: Proposal status copy: draft "Draft", requested "Approval in Progress", selected "PO Generated", rejected "Rejected" — src/views/projectDetails/constants.js:85-97
- **Trace.** P1 · draft · `GEN-SCR-247` · layer ui · coverage partial · typed: “screen master-qcs-live (/project/a2dOY1hk/master_qcs)”

### GEN-SCR-248 — Verify blocked setup controls explain the missing BOQ data

- **Why it matters.** Confirm the screen prevents saving or selecting a template while the BOQ setup message is displayed. Written from the create-boq screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-boq-mvh5oxw4/02-inventory-create-boq.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open /orders/quick-create with the screen in its current state.
- **Steps.** 1. Observe the message near the project setup area. 2. Observe Save as draft. 3. Observe Select Templates.
- **Expected.** The message says "Please choose a template and upload a BOQ sheet to proceed". Save as draft and Select Templates are disabled.
- **Oracle.** What the tester sees on the create-boq screen.
- **Trace.** P1 · draft · `GEN-SCR-248` · layer ui · coverage full · typed: “screen create-boq (/orders/quick-create)”

### GEN-SCR-249 — Open Clara from the create screen

- **Why it matters.** Verify the Clara control opens the Clara assistance interface. Written from the create-boq screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-boq-mvh5oxw4/02-inventory-create-boq.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog has no dedicated step to verify the Clara panel or drawer specifically; unconfirmed accessible name: Clara.
- **Setup.** Open the create screen.
- **Steps.** 1. Click Ask Clara.
- **Expected.** The Clara assistance panel or dialog opens.
- **Oracle.** What the tester sees on the create-boq screen.
- **Trace.** P2 · draft · `GEN-SCR-249` · layer ui · coverage partial · typed: “screen create-boq (/orders/quick-create)”

### GEN-SCR-250 — Return to the events area

- **Why it matters.** Verify the Events link navigates away from the create screen to the events area. Written from the create-boq screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-boq-mvh5oxw4/02-inventory-create-boq.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open /orders/quick-create.
- **Steps.** 1. Click Events.
- **Expected.** The events area opens and the create screen is no longer displayed.
- **Oracle.** What the tester sees on the create-boq screen.
- **Trace.** P1 · draft · `GEN-SCR-250` · layer ui · coverage full · typed: “screen create-boq (/orders/quick-create)”

### GEN-SCR-251 — Publish opens the event confirmation

- **Why it matters.** Confirms the publish confirmation text and the option to return to scheduling. Written from the boq-template-selected screen; grounded in R-FCR-020-2 (src/views/eventCreation/components/footer/confirmModal.jsx:52-60); screenshot procol-ui-tests/evidence/walk-boq-mvh5oxw4/06-inventory-boq-template-selected.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use a valid BOQ with a project title, required line-item values, and at least one participant.
- **Steps.** 1. Click "Publish". 2. Inspect the confirmation dialog. 3. Do not confirm the publish.
- **Expected.** A confirmation dialog appears with the title "Publish Event". The dialog shows an OK action labeled "Publish" and a cancel action labeled "Edit Schedule". Choosing "Edit Schedule" opens the schedule drawer.
- **Oracle.** The screen behaves as R-FCR-020-2 says: Title: "Send to Auction Team" / project title truncated to 45 / "Publish Event"; OK text "Send to Auction Team" or "Publish"; Cancel is "Edit Schedule" and opens the schedule drawer — src/views/eventC
- **Trace.** P0 · draft · `GEN-SCR-251` · layer ui · coverage full · typed: “screen boq-template-selected (/orders/quick-create)”

### GEN-SCR-252 — Changing the selected BOQ shows a reset warning

- **Why it matters.** Protects existing BOQ data when the buyer selects another template. Written from the boq-template-selected screen; grounded in R-FCR-026-4 (src/views/eventCreation/templateSelection.jsx:349-360); screenshot procol-ui-tests/evidence/walk-boq-mvh5oxw4/06-inventory-boq-template-selected.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the screen with the current BOQ populated with at least one line item.
- **Steps.** 1. Click "New BOQ 2". 2. Inspect the warning. 3. Do not confirm the template change.
- **Expected.** A warning appears stating "Changing template will reset data. Are you sure?". The confirmation option is labeled "Yes".
- **Oracle.** The screen behaves as R-FCR-026-4 says: Changing an existing template asks "Do you really want to change the template?" (project) / "Changing template will reset data. Are you sure?" (quick-create), OK "Yes" — templateSelection.jsx:349-360,
- **Trace.** P1 · draft · `GEN-SCR-252` · layer ui · coverage full · typed: “screen boq-template-selected (/orders/quick-create)”

### GEN-SCR-253 — Save as draft is disabled on the initial screen

- **Why it matters.** Verifies the disabled state shown for draft saving. Written from the boq-template-selected screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-boq-mvh5oxw4/06-inventory-boq-template-selected.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the screen in its initial state.
- **Steps.** 1. Inspect "Save as draft". 2. Try to click "Save as draft".
- **Expected.** "Save as draft" is visibly disabled and cannot be activated. No draft-save action starts.
- **Oracle.** What the tester sees on the boq-template-selected screen.
- **Trace.** P1 · draft · `GEN-SCR-253` · layer ui · coverage full · typed: “screen boq-template-selected (/orders/quick-create)”

### GEN-SCR-254 — Add Attachments opens the attachment interface

- **Why it matters.** Verifies that attachments can be started from the BOQ creation screen. Written from the boq-template-selected screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-boq-mvh5oxw4/06-inventory-boq-template-selected.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Whether a native browser file picker opens; The exact attachment panel or picker controls and whether they allow beginning an upload.
- **Setup.** Open the BOQ creation screen.
- **Steps.** 1. Click "Add Attachments".
- **Expected.** An attachment picker or attachment panel opens, allowing the tester to begin adding an attachment without leaving the BOQ creation screen.
- **Oracle.** What the tester sees on the boq-template-selected screen.
- **Trace.** P1 · draft · `GEN-SCR-254` · layer ui · coverage partial · typed: “screen boq-template-selected (/orders/quick-create)”

### GEN-SCR-255 — Rank on lot opens lot-ranking configuration

- **Why it matters.** Verifies the auction configuration entry point for lot-based ranking. Written from the boq-template-selected screen; grounded in R-FCR-009-1 (src/views/projectCreation/helpers.js:61-95); screenshot procol-ui-tests/evidence/walk-boq-mvh5oxw4/06-inventory-boq-template-selected.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the BOQ auction creation screen.
- **Steps.** 1. Click "Rank on lot". 2. Inspect the configuration that opens.
- **Expected.** The lot-ranking auction configuration opens. It shows rank-based evaluation for the lot rather than product-level ranking.
- **Oracle.** The screen behaves as R-FCR-009-1 says: mode `auction`, type `Rank`, strategy `rank`, closingOn `lot_based`, rfpEvaluationOn `line_item_based`, rfpCreationOn `template`, trafficType price, offersOn base price, dutchClosingOn single vendor —
- **Trace.** P1 · draft · `GEN-SCR-255` · layer ui · coverage full · typed: “screen boq-template-selected (/orders/quick-create)”

### GEN-SCR-256 — Open project messages

- **Why it matters.** Verify that project communication can be opened from the screen. Written from the responses-bids-in screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/02-inventory-responses-bids-in.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Cannot assert the exact messages view or drawer implementation if it does not expose itself as a dialog.; Cannot verify the messages panel contents or that it remains on the same project..
- **Setup.** Stay on the RFQ Responses screen.
- **Steps.** 1. Click "Messages".
- **Expected.** The project messages view or drawer opens.
- **Oracle.** What the tester sees on the responses-bids-in screen.
- **Trace.** P1 · draft · `GEN-SCR-256` · layer ui · coverage partial · typed: “screen responses-bids-in (/project/a1pjY1hk/Y05aa2Rr)”

### GEN-SCR-257 — Open project settings

- **Why it matters.** Verify that project settings are accessible from the responses screen. Written from the responses-bids-in screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/02-inventory-responses-bids-in.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Stay on the RFQ Responses screen.
- **Steps.** 1. Click "Settings".
- **Expected.** The project settings view or menu opens.
- **Oracle.** What the tester sees on the responses-bids-in screen.
- **Trace.** P1 · draft · `GEN-SCR-257` · layer ui · coverage full · typed: “screen responses-bids-in (/project/a1pjY1hk/Y05aa2Rr)”

### GEN-SCR-258 — Open the actions menu

- **Why it matters.** Verify that available project actions are displayed without executing a destructive action. Written from the responses-bids-in screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/02-inventory-responses-bids-in.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog cannot assert the complete or exact set of action names available in the menu..
- **Setup.** Stay on the RFQ Responses screen.
- **Steps.** 1. Click "Actions".
- **Expected.** An actions menu opens and lists the available project actions. No action is executed automatically.
- **Oracle.** What the tester sees on the responses-bids-in screen.
- **Trace.** P1 · draft · `GEN-SCR-258` · layer ui · coverage partial · typed: “screen responses-bids-in (/project/a1pjY1hk/Y05aa2Rr)”

### GEN-SCR-259 — Switch from responses to project details

- **Why it matters.** Verify navigation between the project detail sections. Written from the responses-bids-in screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/02-inventory-responses-bids-in.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Whether the Project Details tab is visually marked as selected.
- **Setup.** Stay on the RFQ Responses screen, where "Responses" is selected.
- **Steps.** 1. Click "Project Details".
- **Expected.** The Project Details section opens, and "Project Details" is shown as selected.
- **Oracle.** What the tester sees on the responses-bids-in screen.
- **Trace.** P1 · draft · `GEN-SCR-259` · layer ui · coverage partial · typed: “screen responses-bids-in (/project/a1pjY1hk/Y05aa2Rr)”

### GEN-SCR-260 — Copy copies the visible project value

- **Why it matters.** Verify the visible copy action places its associated project value on the clipboard. Written from the analytics screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/04-inventory-analytics.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Verify the clipboard contains the associated visible project value; Paste the copied value into a text editor and compare it with the visible project value.
- **Setup.** Open the analytics screen and keep the current event loaded.
- **Steps.** 1. Click "Copy". 2. Paste into a text editor.
- **Expected.** The associated value from the screen is pasted into the text editor without changing the page.
- **Oracle.** What the tester sees on the analytics screen.
- **Trace.** P1 · draft · `GEN-SCR-260` · layer ui · coverage none · typed: “screen analytics (/project/a1pjY1hk/Y05aa2Rr)”

### GEN-SCR-261 — Ask Clara opens the Clara flow

- **Why it matters.** Verify the Clara action opens its available analysis or assistance flow. Written from the analytics screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/04-inventory-analytics.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact Clara analysis response or destination after the flow loads.
- **Setup.** Open the analytics screen and keep the current event loaded.
- **Steps.** 1. Click "Ask Clara". 2. Wait for the response or destination to load.
- **Expected.** A Clara analysis or assistance flow opens, and the analytics screen does not show an unhandled error.
- **Oracle.** What the tester sees on the analytics screen.
- **Trace.** P1 · draft · `GEN-SCR-261` · layer ui · coverage partial · typed: “screen analytics (/project/a1pjY1hk/Y05aa2Rr)”

### GEN-SCR-262 — Messages opens event messages

- **Why it matters.** Verify the messages control opens messages for this event. Written from the analytics screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/04-inventory-analytics.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The messages view is specifically scoped to this event.; The drawer's message thread or event context contents..
- **Setup.** Open the analytics screen and keep the current event loaded.
- **Steps.** 1. Click "Messages".
- **Expected.** The event messages view or drawer opens, showing the messages context for this event.
- **Oracle.** What the tester sees on the analytics screen.
- **Trace.** P1 · draft · `GEN-SCR-262` · layer ui · coverage partial · typed: “screen analytics (/project/a1pjY1hk/Y05aa2Rr)”

### GEN-SCR-263 — View by Product changes the response grouping

- **Why it matters.** Verify the product-view control changes how response data is presented. Written from the analytics screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/04-inventory-analytics.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Directly verify that the response rows are regrouped by product rather than another grouping mode.
- **Setup.** Open the analytics screen with the displayed product response row visible.
- **Steps.** 1. Click "View by Product". 2. Observe the response table and visible product grouping.
- **Expected.** The response data changes to the product-based view, and the product information remains available without an error.
- **Oracle.** What the tester sees on the analytics screen.
- **Trace.** P1 · draft · `GEN-SCR-263` · layer ui · coverage partial · typed: “screen analytics (/project/a1pjY1hk/Y05aa2Rr)”

### GEN-SCR-264 — Ask Clara handles an analyze_data request

- **Why it matters.** Verifies the Clara awarding handoff and its success message. Written from the master-qcs-bids-in screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/06-inventory-master-qcs-bids-in.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact returned redirect_url value cannot be asserted; only navigation to a URL containing /awarding/ can be checked..
- **Setup.** Use a project with a Clara analyze_data todo and a valid returned redirect_url.
- **Steps.** 1. Click "Ask Clara". 2. Wait for Clara to process the request.
- **Expected.** The app shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned redirect_url.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P1 · draft · `GEN-SCR-264` · layer ui · coverage partial · typed: “screen master-qcs-bids-in (/project/a1pjY1hk/master_qcs)”

### GEN-SCR-265 — Create New Version opens version creation

- **Why it matters.** Confirms the version-creation action opens the appropriate flow without changing the current project. Written from the master-qcs-bids-in screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/06-inventory-master-qcs-bids-in.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Verify that the current Master QCS remains unchanged until the new version is submitted..
- **Setup.** Remain on the Master QCS screen for the bid event.
- **Steps.** 1. Click "Create New Version".
- **Expected.** The version-creation flow opens. The current Master QCS remains unchanged until the new version is submitted.
- **Oracle.** What the tester sees on the master-qcs-bids-in screen.
- **Trace.** P1 · draft · `GEN-SCR-265` · layer ui · coverage partial · typed: “screen master-qcs-bids-in (/project/a1pjY1hk/master_qcs)”

### GEN-SCR-266 — Messages opens project messages

- **Why it matters.** Verifies that the project communication action opens its messages view. Written from the master-qcs-bids-in screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/06-inventory-master-qcs-bids-in.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Whether the opened Messages interface is implemented as a drawer or a full project view if it is not exposed as a dialog..
- **Setup.** Remain on the Master QCS screen.
- **Steps.** 1. Click "Messages".
- **Expected.** The project messages view or drawer opens for this event.
- **Oracle.** What the tester sees on the master-qcs-bids-in screen.
- **Trace.** P1 · draft · `GEN-SCR-266` · layer ui · coverage partial · typed: “screen master-qcs-bids-in (/project/a1pjY1hk/master_qcs)”

### GEN-SCR-267 — Vendor proposal navigation uses the proposal status

- **Why it matters.** Verifies that selecting a vendor proposal routes according to whether the proposal is draft or non-draft. Written from the master-qcs-bids-in screen; grounded in R-FLA-030-2 (src/components/masterQcs/masterQcs.jsx:354-391); screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/06-inventory-master-qcs-bids-in.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Selecting a distinct draft proposal state for the same vendor and verifying that it navigates to /awarding/:id?lotNo=..
- **Setup.** Prepare one non-draft vendor proposal for this lot, then repeat with a draft proposal.
- **Steps.** 1. Click the "QA_Platform Vendor 1 1790820862139" column. 2. Record the destination URL. 3. Return to Master QCS. 4. Repeat the action with the draft proposal.
- **Expected.** For the non-draft proposal, the app opens /project/:id/proposal/:proposalUuid?lotNo=. For the draft proposal, it opens /awarding/:id?lotNo=.
- **Oracle.** The screen behaves as R-FLA-030-2 says: Draft proposal → `/awarding/:id?lotNo=`; non-draft → `/project/:id/proposal/:proposalUuid?lotNo=`; contracts non-draft → `/contract-details?contracts_uuids=` — src/components/masterQcs/masterQcs.jsx:3
- **Trace.** P1 · draft · `GEN-SCR-267` · layer ui · coverage partial · typed: “screen master-qcs-bids-in (/project/a1pjY1hk/master_qcs)”

### GEN-SCR-268 — Hide fields toggles the Master QCS fields

- **Why it matters.** Confirms the visible field columns can be collapsed and restored through the screen control. Written from the master-qcs-bids-in screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/06-inventory-master-qcs-bids-in.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact set of configurable fields that must be hidden; Direct verification that the table remains interactive without losing vendor context; unconfirmed label "AAC BLOCKS" (expect_text) — not among the labels known from the app nor in the case.
- **Setup.** Remain on Master QCS with the line-item and vendor fields visible.
- **Steps.** 1. Click "Hide fields". 2. Inspect the Master QCS table.
- **Expected.** The configurable fields are hidden and the table remains usable without losing the project or vendor context.
- **Oracle.** What the tester sees on the master-qcs-bids-in screen.
- **Trace.** P2 · draft · `GEN-SCR-268` · layer ui · coverage partial · typed: “screen master-qcs-bids-in (/project/a1pjY1hk/master_qcs)”

### GEN-SCR-269 — Awarded Vendors counter matches vendor award entries and available vendor layers

- **Why it matters.** Confirms both parts of the Awarded Vendors counter are calculated from the proposal and vendor layers. Written from the awarding screen; grounded in R-FLA-032-3 (src/views/awardingFlow/awardingFlow.jsx:59-65); screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/08-inventory-awarding.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Explicitly reloading the awarding screen after the award and observing the proposal refetch; Observing the transient "Calculating ..." state during proposal refetch; Independently verifying available vendor layers beyond the awarding control and counter.
- **Setup.** Open a proposal with one vendor layer and no awarded vendors. Repeat with one awarded vendor.
- **Steps.** 1. Observe "Awarded Vendors (0/1)". 2. Award the vendor in the test fixture and reload the awarding screen. 3. Observe the Awarded Vendors counter while the proposal is refetched.
- **Expected.** The counter shows 0/1 before the award and 1/1 after the award. It shows "Calculating ..." while the proposal is being refetched, if the refetch is observable.
- **Oracle.** The screen behaves as R-FLA-032-3 says: "Awarded Vendors (a/b)": a = entries of `vendor_wise_information`, b = all vendor layers in the sheet; "Calculating ..." while the proposal refetches — src/views/awardingFlow/awardingFlow.jsx:59-65, 1
- **Trace.** P1 · draft · `GEN-SCR-269` · layer ui · coverage partial · typed: “screen awarding (/awarding/a1pjY1hk)”

### GEN-SCR-270 — Empty award summary shows no vendors awarded

- **Why it matters.** Confirms the empty vendor summary state and prevents misleading amount or item totals. Written from the awarding screen; grounded in R-FLA-032-4 (src/views/awardingFlow/constants.jsx:13-25); screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/08-inventory-awarding.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Precise absence of dynamic vendor amount values and awarded-item values in the expanded summary.
- **Setup.** Open a proposal with no awarded vendors.
- **Steps.** 1. Click "Awarded Vendors (0/1)". 2. Inspect the vendor summary.
- **Expected.** The summary shows "No vendors awarded" and does not show vendor amount or awarded-item values.
- **Oracle.** The screen behaves as R-FLA-032-4 says: Summary card per vendor: name, vendor code, tag, "L1 Amount", "L1 Items Awarded", "Non L1 Amount", "Non L1 Items Awarded", "Total Amount", "Awarded Items"; none → "No vendors awarded" — src/views/awar
- **Trace.** P1 · draft · `GEN-SCR-270` · layer ui · coverage partial · typed: “screen awarding (/awarding/a1pjY1hk)”

### GEN-SCR-271 — No-bid proposal displays the no-bids message

- **Why it matters.** Confirms the awarding screen clearly handles a proposal with no vendor bids. Written from the awarding screen; grounded in R-FLA-033-5 (src/views/awardingFlow/awardingQCS.jsx:656-662); screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/08-inventory-awarding.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Conditionally click "AAC BLOCKS" only when the item section is collapsed.; Assert generically that no bid values are displayed within the AAC BLOCKS item section without known value text or a dedicated bid-value absence assertion..
- **Setup.** Open an awarding proposal for an event where no vendor has placed a bid.
- **Steps.** 1. Observe the awarding content. 2. Click "AAC BLOCKS" if the item section is collapsed. 3. Observe the item section.
- **Expected.** The screen displays "No bids are placed yet!" and does not display bid values for the item.
- **Oracle.** The screen behaves as R-FLA-033-5 says: No bids → "No bids are placed yet!"; excel-awarded proposal shows "Awarding is done via the award sheet. To change it, upload a revised sheet." — src/views/awardingFlow/awardingQCS.jsx:656-662, 747-75
- **Trace.** P1 · draft · `GEN-SCR-271` · layer ui · coverage partial · typed: “screen awarding (/awarding/a1pjY1hk)”

### GEN-SCR-272 — View Tickets controls open the tickets view

- **Why it matters.** Confirms both visible View Tickets controls provide access to the event's tickets without changing the award. Written from the awarding screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/08-inventory-awarding.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — No catalog assertion identifies or verifies that the tickets view opened.; No catalog step returns from the tickets view to the awarding screen.; No catalog assertion verifies that awarding data was not modified.; The second View Tickets control cannot be reached and verified after returning to awarding..
- **Setup.** Open the awarding screen with tickets available.
- **Steps.** 1. Click the button labeled "View Tickets". 2. Verify that the tickets view opens. 3. Return to the awarding screen. 4. Click the link labeled "View Tickets".
- **Expected.** Each View Tickets control opens the tickets view. The awarding data is not modified.
- **Oracle.** What the tester sees on the awarding screen.
- **Trace.** P2 · draft · `GEN-SCR-272` · layer ui · coverage none · typed: “screen awarding (/awarding/a1pjY1hk)”

### GEN-SCR-273 — Awarded vendor summary shows required metrics

- **Why it matters.** Checks the per-vendor summary content and the empty-state wording. Written from the awarding-allocated screen; grounded in R-FLA-032-4 (src/views/awardingFlow/constants.jsx:13-25); screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/10-inventory-awarding-allocated.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The specific awarded vendor name, vendor code, and tag because the case does not provide expected values.; The numeric values for L1 Amount, L1 Items Awarded, Non L1 Amount, Non L1 Items Awarded, Total Amount, and Awarded Items because no expected values are provided.; A distinct action to open the Awarded Vendors summary; the catalog only observes it after allocation on the awarding screen..
- **Setup.** Use one proposal with an awarded vendor and populate L1 and non-L1 amounts and item counts. Repeat with no awarded vendors.
- **Steps.** 1. Open the Awarded Vendors (1/1) summary. 2. Review the vendor summary. 3. Repeat with a proposal that has no awarded vendors.
- **Expected.** The vendor summary shows the vendor name, vendor code, tag, "L1 Amount", "L1 Items Awarded", "Non L1 Amount", "Non L1 Items Awarded", "Total Amount", and "Awarded Items". When no vendors are awarded, it shows "No vendors awarded".
- **Oracle.** The screen behaves as R-FLA-032-4 says: Summary card per vendor: name, vendor code, tag, "L1 Amount", "L1 Items Awarded", "Non L1 Amount", "Non L1 Items Awarded", "Total Amount", "Awarded Items"; none → "No vendors awarded" — src/views/awar
- **Trace.** P1 · draft · `GEN-SCR-273` · layer ui · coverage partial · typed: “screen awarding-allocated (/awarding/a1pjY1hk)”

### GEN-SCR-274 — Hidden fields menu opens from the awarding page

- **Why it matters.** Confirms the hidden-field control opens its field-selection view. Written from the awarding-allocated screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/10-inventory-awarding-allocated.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Enumerating the individual fields listed in the hidden-fields menu; Selecting exactly eight hidden fields from the menu.
- **Setup.** Load the awarding page with the current hidden-field configuration.
- **Steps.** 1. Select 8 hidden fields.
- **Expected.** A hidden-fields menu opens and lists the fields currently hidden from the awarding view. The awarding page remains available after the menu is opened.
- **Oracle.** What the tester sees on the awarding-allocated screen.
- **Trace.** P2 · draft · `GEN-SCR-274` · layer ui · coverage partial · typed: “screen awarding-allocated (/awarding/a1pjY1hk)”

### GEN-SCR-275 — Fullscreen opens the expanded awarding view

- **Why it matters.** Verifies the important page-view control changes the awarding view without changing award data. Written from the awarding-allocated screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-compare-award-mvh5sp4n/10-inventory-awarding-allocated.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Direct assertion that the awarding view expanded to fullscreen.; Verification that an unspecified displayed vendor value remains unchanged.; unconfirmed label "AAC BLOCKS" (remember) — not among the labels known from the app nor in the case; unconfirmed label "₹ 3,335" (remember) — not among the labels known from the app nor in the case.
- **Setup.** Load the awarding page with the displayed vendor and line-item data.
- **Steps.** 1. Select Fullscreen. 2. Observe the awarding view.
- **Expected.** The awarding view expands to fullscreen. The displayed vendor, line-item, and amount data remains unchanged.
- **Oracle.** What the tester sees on the awarding-allocated screen.
- **Trace.** P2 · draft · `GEN-SCR-275` · layer ui · coverage partial · typed: “screen awarding-allocated (/awarding/a1pjY1hk)”

### GEN-SCR-276 — Messages opens the project messaging view

- **Why it matters.** Verify the messaging control opens the project's messages view. Written from the counter-offer-sent screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/combo-e11-mvh656bl/04-inventory-counter-offer-sent.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact project's messages view or panel opening without leaving the project context cannot be reliably asserted..
- **Setup.** Remain on the counter-offer-sent project screen.
- **Steps.** 1. Click button: "Messages".
- **Expected.** The project's messages view or panel opens without leaving the project context.
- **Oracle.** What the tester sees on the counter-offer-sent screen.
- **Trace.** P1 · draft · `GEN-SCR-276` · layer ui · coverage partial · typed: “screen counter-offer-sent (/project/a1pkY1hk/Y05Ya2Rr)”

### GEN-SCR-277 — Settings opens project settings

- **Why it matters.** Verify the settings control opens the available project settings. Written from the counter-offer-sent screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/combo-e11-mvh656bl/04-inventory-counter-offer-sent.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Whether the project settings view or panel opens after clicking Settings..
- **Setup.** Remain on the counter-offer-sent project screen.
- **Steps.** 1. Click button: "Settings".
- **Expected.** The project settings view or panel opens.
- **Oracle.** What the tester sees on the counter-offer-sent screen.
- **Trace.** P1 · draft · `GEN-SCR-277` · layer ui · coverage none · typed: “screen counter-offer-sent (/project/a1pkY1hk/Y05Ya2Rr)”

### GEN-SCR-278 — Actions opens the available project actions

- **Why it matters.** Verify the actions control exposes the actions available for this project state. Written from the counter-offer-sent screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/combo-e11-mvh656bl/04-inventory-counter-offer-sent.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact list of actions that must be available or absent for the current project state..
- **Setup.** Remain on the counter-offer-sent project screen.
- **Steps.** 1. Click button: "Actions".
- **Expected.** An actions menu opens and shows only actions available for the current project state.
- **Oracle.** What the tester sees on the counter-offer-sent screen.
- **Trace.** P1 · draft · `GEN-SCR-278` · layer ui · coverage partial · typed: “screen counter-offer-sent (/project/a1pkY1hk/Y05Ya2Rr)”

### GEN-SCR-279 — Ask Clara redirects when awarding analysis is requested

- **Why it matters.** Verify Clara's awarding analysis completes with the required message and redirect. Written from the counter-offer-sent screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/combo-e11-mvh656bl/04-inventory-counter-offer-sent.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact equality between the browser URL and the dynamically returned redirect_url.
- **Setup.** Use a project where the Clara todo action is analyze_data and the response contains a redirect_url.
- **Steps.** 1. Click button: "Ask Clara". 2. Wait for the request to complete.
- **Expected.** The message "Awarding initiated successfully, redirecting to awarding flow..." appears, then the browser navigates to the returned redirect_url.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P1 · draft · `GEN-SCR-279` · layer ui · coverage partial · typed: “screen counter-offer-sent (/project/a1pkY1hk/Y05Ya2Rr)”

### GEN-SCR-280 — Project link returns to the project list context

- **Why it matters.** Verify the breadcrumb link navigates away from the project details screen to the project context. Written from the counter-offer-sent screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/combo-e11-mvh656bl/04-inventory-counter-offer-sent.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Remain on the counter-offer-sent project screen.
- **Steps.** 1. Click link: "Project".
- **Expected.** The project context or project list page opens, and the counter-offer details screen is no longer displayed.
- **Oracle.** What the tester sees on the counter-offer-sent screen.
- **Trace.** P2 · draft · `GEN-SCR-280` · layer ui · coverage full · typed: “screen counter-offer-sent (/project/a1pkY1hk/Y05Ya2Rr)”

### GEN-SCR-281 — Start awarding from a lot without a proposal

- **Why it matters.** Verifies that the awarding action available for this lot opens the awarding flow when no proposal exists. Written from the master-qcs-two-vendors screen; grounded in R-FLA-028-1 (src/components/masterQcs/masterQcs.jsx:266-286); screenshot procol-ui-tests/evidence/combo-e4-mvh62uce/17-inventory-master-qcs-two-vendors.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use a lot with no proposal and open its Master QCS screen.
- **Steps.** 1. Click Start Awarding.
- **Expected.** The awarding flow opens for the current lot.
- **Oracle.** The screen behaves as R-FLA-028-1 says: "Start Awarding" shows only on Project Details' Master QCS when no proposal exists for this lot (no lot → first proposal) — src/components/masterQcs/masterQcs.jsx:266-286
- **Trace.** P0 · draft · `GEN-SCR-281` · layer ui · coverage full · typed: “screen master-qcs-two-vendors (/project/a1pwY1hk/master_qcs)”

### GEN-SCR-282 — Open a vendor proposal from the Master QCS

- **Why it matters.** Verifies that selecting a vendor proposal routes according to whether the proposal is draft, non-draft, or a contract. Written from the master-qcs-two-vendors screen; grounded in R-FLA-030-2 (src/components/masterQcs/masterQcs.jsx:354-391); screenshot procol-ui-tests/evidence/combo-e4-mvh62uce/17-inventory-master-qcs-two-vendors.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Select or establish the draft, non-draft, and non-draft contract proposal states independently.; Verify that the clicked vendor column is specifically the proposal column rather than another occurrence of the vendor text.; Assert the exact dynamic project, proposal, lot, or contract identifier values in each URL.; unconfirmed label "QA_Platform Vendor 1 1790820862139" (click) — not among the labels known from the app nor in the case.
- **Setup.** Prepare three versions of the lot: one with a draft proposal, one with a non-draft proposal, and one with a non-draft contract proposal.
- **Steps.** 1. Click the vendor column for the draft proposal. 2. Return to Master QCS. 3. Click the vendor column for the non-draft proposal. 4. Return to Master QCS. 5. Click the vendor column for the non-draft contract proposal.
- **Expected.** The draft proposal opens `/awarding/:id?lotNo=`. The non-draft proposal opens `/project/:id/proposal/:proposalUuid?lotNo=`. The non-draft contract opens `/contract-details?contracts_uuids=`.
- **Oracle.** The screen behaves as R-FLA-030-2 says: Draft proposal → `/awarding/:id?lotNo=`; non-draft → `/project/:id/proposal/:proposalUuid?lotNo=`; contracts non-draft → `/contract-details?contracts_uuids=` — src/components/masterQcs/masterQcs.jsx:3
- **Trace.** P1 · draft · `GEN-SCR-282` · layer ui · coverage partial · typed: “screen master-qcs-two-vendors (/project/a1pwY1hk/master_qcs)”

### GEN-SCR-283 — Ask Clara analyzes data and redirects

- **Why it matters.** Verifies the success message and redirect when Clara returns an awarding URL. Written from the master-qcs-two-vendors screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/combo-e4-mvh62uce/17-inventory-master-qcs-two-vendors.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact redirect_url returned by the backend cannot be captured or compared; only that the resulting URL contains /awarding can be asserted..
- **Setup.** Use a project where the Clara todo is `analyze_data` and the request returns a valid `redirect_url`.
- **Steps.** 1. Click Ask Clara.
- **Expected.** The app shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url`.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P1 · draft · `GEN-SCR-283` · layer ui · coverage partial · typed: “screen master-qcs-two-vendors (/project/a1pwY1hk/master_qcs)”

### GEN-SCR-284 — Hide and restore Master QCS fields

- **Why it matters.** Confirms that the field-visibility control changes the Master QCS layout and allows the fields to be restored. Written from the master-qcs-two-vendors screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/combo-e4-mvh62uce/17-inventory-master-qcs-two-vendors.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: unconfirmed label "AAC BLOCKS" (expect_text) — not among the labels known from the app nor in the case; unconfirmed label "AAC BLOCKS" in an absence check (expect_text) — a name the product does not use is always absent, so this proves nothing until the label is confirmed.
- **Setup.** Open the Master QCS screen with visible vendor columns and field values.
- **Steps.** 1. Click Hide fields. 2. Observe the Master QCS. 3. Click Hide fields again.
- **Expected.** The fields are hidden after the first click and visible again after the second click.
- **Oracle.** What the tester sees on the master-qcs-two-vendors screen.
- **Trace.** P2 · draft · `GEN-SCR-284` · layer ui · coverage partial · typed: “screen master-qcs-two-vendors (/project/a1pwY1hk/master_qcs)”

### GEN-SCR-285 — Open project messages

- **Why it matters.** Verifies that the Messages control opens the project's message view without leaving the project context. Written from the master-qcs-two-vendors screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/combo-e4-mvh62uce/17-inventory-master-qcs-two-vendors.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The detailed contents and exact panel implementation of the project's messages view..
- **Setup.** Open the Master QCS screen for a project with accessible messages.
- **Steps.** 1. Click Messages.
- **Expected.** The project's messages view or panel opens.
- **Oracle.** What the tester sees on the master-qcs-two-vendors screen.
- **Trace.** P2 · draft · `GEN-SCR-285` · layer ui · coverage partial · typed: “screen master-qcs-two-vendors (/project/a1pwY1hk/master_qcs)”

### GEN-SCR-286 — Published Stages shows the correct columns and values

- **Why it matters.** Confirms stage-code visibility, participant totals, pending actions, and date formatting. Written from the single-stage-rfp-live screen; grounded in R-FLA-026-1 (src/views/projectDetails/components/publishedStagesTable.jsx:31-99); screenshot procol-ui-tests/evidence/combo-s3-mvh66o5z/11-inventory-single-stage-rfp-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Open a separate project with no stage ref_id using a supplied project identity.; Assert the Stage Code column is omitted specifically on that no-ref_id project.; Verify exact active/total participant values and missing-date '-' values without known fixture values.; unconfirmed label "0" (expect_text) — not among the labels known from the app nor in the case; unconfirmed label "-" (expect_text) — not among the labels known from the app nor in the case.
- **Setup.** Prepare one project with a published stage containing ref_id, participant counts, pending actions, and bidding dates. Prepare another project whose stages have no ref_id.
- **Steps.** 1. Open Published Stages. 2. Check the stage table columns and values. 3. Open the project with no stage ref_id. 4. Check the stage table columns.
- **Expected.** The table shows Stage Code, Stage Title, Pending Actions, Participants, Bidding Starts At, and Bidding Ends At when at least one row has ref_id. Participants show active/total, with missing values shown as 0. Missing dates show "-". Stage Code is omitted when no row has ref_id.
- **Oracle.** The screen behaves as R-FLA-026-1 says: Columns: Stage Code (dropped when no row has `ref_id`), Stage Title, Pending Actions, Participants "active/total" (missing → 0), Bidding Starts At / Ends At (DATE_TIME or "-") — src/views/projectDetai
- **Trace.** P1 · draft · `GEN-SCR-286` · layer ui · coverage partial · typed: “screen single-stage-rfp-live (/project/a2NaY1hk/details)”

### GEN-SCR-287 — Line Items and Participants show response counts

- **Why it matters.** Validates that the panel count tags reflect line-item and participant responses. Written from the single-stage-rfp-live screen; grounded in R-FLA-018-4 (src/views/projectDetails/projectDetails.jsx:916-946); screenshot procol-ui-tests/evidence/combo-s3-mvh66o5z/11-inventory-single-stage-rfp-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The identifiers or titles of the first and second projects are not provided, so the second project cannot be opened reliably.; The catalog has no assertion that compares Line Items and Participants count tags with response totals across two projects..
- **Setup.** Use a project with zero line-item responses and one participant response. Prepare a second project with different response counts.
- **Steps.** 1. Open the project details screen. 2. Check Line Items 0. 3. Check Participants 1. 4. Open the second project and compare both count tags with its response totals.
- **Expected.** Line Items shows the line-item response count, and Participants shows the participant response count. The count tags update to match each project's data.
- **Oracle.** The screen behaves as R-FLA-018-4 says: Line Items / Participants panel headers show count tags from the line-item and participant responses — src/views/projectDetails/projectDetails.jsx:916-946, src/redux/project/selectors.js:867-876
- **Trace.** P1 · draft · `GEN-SCR-287` · layer ui · coverage partial · typed: “screen single-stage-rfp-live (/project/a2NaY1hk/details)”

### GEN-SCR-288 — Overview shows project identity and open tender status

- **Why it matters.** Checks the overview values and the configuration-dependent Open Tender Event field. Written from the single-stage-rfp-live screen; grounded in R-FLA-018-1 (src/views/projectDetails/projectDetails.jsx:545-564); screenshot procol-ui-tests/evidence/combo-s3-mvh66o5z/11-inventory-single-stage-rfp-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact dynamic Project ID value formatted as #<refId>; Exact DATE_TIME value for Created at; Repeating the check with is_show_under_open_events disabled, because no catalog step changes or observes that tenant configuration flag.
- **Setup.** Prepare one project with a refId and created timestamp while is_show_under_open_events is enabled. Prepare another with the flag disabled.
- **Steps.** 1. Open Project Details. 2. Click Overview. 3. Check Project ID and Created at. 4. Check Open Tender Event. 5. Repeat with the flag disabled.
- **Expected.** Project ID is shown as "#<refId>". Created at shows the DATE_TIME value. Open Tender Event shows "Yes" only when is_show_under_open_events is enabled; it is not shown as Yes when the flag is disabled.
- **Oracle.** The screen behaves as R-FLA-018-1 says: Overview: "Project ID" = `#<refId>`, "Created at" = DATE_TIME, "Open Tender Event: Yes" only when config `is_show_under_open_events` — src/views/projectDetails/projectDetails.jsx:545-564
- **Trace.** P1 · draft · `GEN-SCR-288` · layer ui · coverage partial · typed: “screen single-stage-rfp-live (/project/a2NaY1hk/details)”

### GEN-SCR-289 — Participant search is debounced and limits results to one page

- **Why it matters.** Verifies participant filtering, the debounce delay, and the page-size limit. Written from the single-stage-rfp-live screen; grounded in R-FLA-024-5 (src/views/projectDetails/components/participantsTable.jsx:265-267); screenshot procol-ui-tests/evidence/combo-s3-mvh66o5z/11-inventory-single-stage-rfp-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The partial vendor name to enter is not provided.; Typing continuation before 300 milliseconds and waiting at least 300 milliseconds after the final keystroke cannot be expressed.; The search request's final query text cannot be asserted without the search value and request path.; That every displayed participant row matches the search text cannot be asserted as a collection-wide condition..
- **Setup.** Prepare more than 20 participants, including several whose Vendor Name contains the same search term.
- **Steps.** 1. Enter a partial vendor name in Search participants. 2. Continue typing before 300 milliseconds elapse. 3. Wait at least 300 milliseconds after the final keystroke. 4. Check the participant rows. 5. Count the displayed rows.
- **Expected.** The search request uses the final search text after the debounce period. Displayed rows match the search text, and no more than 20 participant rows appear on the page.
- **Oracle.** The screen behaves as R-FLA-024-5 says: Search debounced 300 ms; page size 20; proposal page reuses this table without the reject option — src/views/projectDetails/components/participantsTable.jsx:265-267, 397, src/views/projectProposal/pro
- **Trace.** P1 · draft · `GEN-SCR-289` · layer ui · coverage partial · typed: “screen single-stage-rfp-live (/project/a2NaY1hk/details)”

### GEN-SCR-290 — Ask Clara starts awarding for an analyze_data todo

- **Why it matters.** Confirms the Clara awarding action displays its success message and follows the returned redirect. Written from the single-stage-rfp-live screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/combo-s3-mvh66o5z/11-inventory-single-stage-rfp-live.png. **Draft, needs review** — written by the assistant on 2026-10-20 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact comparison of the browser URL with the dynamic redirect_url returned by the analyze_data action.
- **Setup.** Prepare the project with an Ask Clara analyze_data todo. Stub the action response with a valid redirect_url.
- **Steps.** 1. Click Ask Clara. 2. Wait for the action to finish.
- **Expected.** The app shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned redirect_url.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P1 · draft · `GEN-SCR-290` · layer ui · coverage partial · typed: “screen single-stage-rfp-live (/project/a2NaY1hk/details)”

