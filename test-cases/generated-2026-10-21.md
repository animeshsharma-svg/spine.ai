# Generated test cases — drafts (2026-10-21)

Every case below was written by the spine.ai assistant when someone typed a test case that no existing case covered.
They are DRAFTS: nothing here is in the catalog until a person reviews it and moves it into a catalog file
(the importer does not read `generated-*.md`, and `GEN-` ids are not parsed).

## 1. Drafts from the assistant

### GEN-SCR-291 — Invalid tab parameter falls back to Live

- **Why it matters.** Prevents unsupported tab values from loading an invalid events view. Written from the events-list screen; grounded in R-FLA-002-1 (src/viewModels/orders/useOrdersListViewModel.js:82-110); screenshot procol-ui-tests/evidence/walk-list-mvhyvlec/03-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Direct assertion that the Live tab is selected rather than merely visible; Exact URL equality ensuring the invalid tab parameter was replaced and no other query parameters changed.
- **Setup.** Open /orders?tab=unknown.
- **Steps.** 1. Load the page. 2. Inspect the URL and selected tab.
- **Expected.** The URL is replaced with ?tab=live, and Live 8641 is selected.
- **Oracle.** The screen behaves as R-FLA-002-1 says: `?tab=` must be one of `live|history|draft|recurring` (lower-cased compare); anything else is replaced (history replace) by `?tab=live` — src/viewModels/orders/useOrdersListViewModel.js:82-110, src/vi
- **Trace.** P1 · draft · `GEN-SCR-291` · layer ui · coverage partial · typed: “screen events-list (/orders)”

### GEN-SCR-292 — History events are grouped under formatted date headers

- **Why it matters.** Makes historical events easier to scan by event date. Written from the events-list screen; grounded in R-FLA-004-3 (src/views/orders/components/projectTable.jsx:846-858); screenshot procol-ui-tests/evidence/walk-list-mvhyvlec/03-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: That History event cards are grouped under date headers.; That each date header uses the app's formatted date format..
- **Setup.** Use an account with history events created on at least two different dates.
- **Steps.** 1. Click History 2036. 2. Review the event list.
- **Expected.** History cards are grouped under date headers, and each header uses the app's formatted date format.
- **Oracle.** The screen behaves as R-FLA-004-3 says: History/Drafts cards are grouped under a date header formatted `appFormatDate(date, DATE)` — src/views/orders/components/projectTable.jsx:846-858, 900-913
- **Trace.** P1 · draft · `GEN-SCR-292` · layer ui · coverage partial · typed: “screen events-list (/orders)”

### GEN-SCR-293 — Drafts empty state shows the required copy

- **Why it matters.** Provides a clear result when the user has no draft events. Written from the events-list screen; grounded in R-FLA-004-4 (src/views/orders/components/projectTable.jsx:699-708); screenshot procol-ui-tests/evidence/walk-list-mvhyvlec/03-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use an account with no draft events.
- **Steps.** 1. Click Drafts 185. 2. Review the page content.
- **Expected.** The page shows "No Drafts Found".
- **Oracle.** The screen behaves as R-FLA-004-4 says: Empty states: filtered → "no result" copy; Drafts → "No Drafts Found"; Recurring → "No Recurring Events Found" — src/views/orders/components/projectTable.jsx:699-708, 914-920, 965-971
- **Trace.** P1 · draft · `GEN-SCR-293` · layer ui · coverage full · typed: “screen events-list (/orders)”

### GEN-SCR-294 — Recurring cards show frequency, invited count, and status

- **Why it matters.** Confirms recurring event summaries expose their key scheduling and status information. Written from the events-list screen; grounded in R-FLA-012-4 (src/views/orders/components/projectCard/projectCard.jsx:318-337); screenshot procol-ui-tests/evidence/walk-list-mvhyvlec/03-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Verify every recurring card has its own Frequency value containing its schedule text or '-'; Verify the invited count for each individual recurring card; Verify that each individual card has exactly one Active, Paused, or Cancelled status tag.
- **Setup.** Use an account with recurring events having schedule text, invited vendors, and Active, Paused, or Cancelled statuses.
- **Steps.** 1. Click Recurring. 2. Review each recurring event card.
- **Expected.** Each card shows "Frequency" with its schedule text or "-", the invited count, and an Active, Paused, or Cancelled status tag.
- **Oracle.** The screen behaves as R-FLA-012-4 says: Recurring card shows "Frequency <scheduleDisplayText or ->", invited count, and status tag Active/Paused/Cancelled — src/views/orders/components/projectCard/projectCard.jsx:318-337, 421-439
- **Trace.** P1 · draft · `GEN-SCR-294` · layer ui · coverage partial · typed: “screen events-list (/orders)”

### GEN-SCR-295 — Date range fields are disabled on the current screen

- **Why it matters.** Confirms the date range controls cannot be used while they are disabled. Written from the events-list screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvhyvlec/03-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open /orders with the default Live 8641 tab selected.
- **Steps.** 1. Inspect Starting from. 2. Inspect Ending at. 3. Try to focus or enter text in each field.
- **Expected.** Both fields appear disabled and do not accept focus or input.
- **Oracle.** What the tester sees on the events-list screen.
- **Trace.** P1 · draft · `GEN-SCR-295` · layer ui · coverage full · typed: “screen events-list (/orders)”

### GEN-SCR-296 — Date fields enable on the Live tab

- **Why it matters.** The screen currently shows both date fields disabled; switching to the tab that supports date filtering should enable them. Written from the events-history screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvhyvlec/05-inventory-events-history.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the events list on the selected History tab.
- **Steps.** 1. Verify that "Starting from" is disabled. 2. Verify that "Ending at" is disabled. 3. Select "Live 8641".
- **Expected.** "Starting from" and "Ending at" become enabled on the Live tab.
- **Oracle.** What the tester sees on the events-history screen.
- **Trace.** P1 · draft · `GEN-SCR-296` · layer ui · coverage full · typed: “screen events-history (/orders)”

### GEN-SCR-297 — Export excludes the title search from filters

- **Why it matters.** Export must send only the custom filter value, not the title search or stage filter. Written from the events-history screen; grounded in R-FLA-008-2 (src/views/orders/components/projectTable.jsx:329-331); screenshot procol-ui-tests/evidence/walk-list-mvhyvlec/05-inventory-events-history.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The specific custom filter value to retain is not provided, so the plan cannot assert that only that exact value remains in filters.; The exact export request path is not specified by the catalog..
- **Setup.** Open browser network inspection on the History events list.
- **Steps.** 1. Enter `completed` in "Search Title". 2. Select "Export". 3. Inspect the export request.
- **Expected.** The export request is sent with the custom filter value only. The search text `completed` and any stage filter are not included in `filters`.
- **Oracle.** The screen behaves as R-FLA-008-2 says: Export `filters` = the custom filter value only (search text and stage filter are not sent) — src/views/orders/components/projectTable.jsx:329-331, 503-509
- **Trace.** P1 · draft · `GEN-SCR-297` · layer ui · coverage partial · typed: “screen events-history (/orders)”

### GEN-SCR-298 — History search with no matches shows the filtered empty state

- **Why it matters.** A search that matches no History event must show the filtered no-result state. Written from the events-history screen; grounded in R-FLA-004-4 (src/views/orders/components/projectTable.jsx:699-708); screenshot procol-ui-tests/evidence/walk-list-mvhyvlec/05-inventory-events-history.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use a History list containing no event with the title `ZZZ-no-match-987`.
- **Steps.** 1. Select "History 2036". 2. Enter `ZZZ-no-match-987` in "Search Title". 3. Wait for the search results to refresh.
- **Expected.** The list shows the filtered "no result" copy instead of event cards.
- **Oracle.** The screen behaves as R-FLA-004-4 says: Empty states: filtered → "no result" copy; Drafts → "No Drafts Found"; Recurring → "No Recurring Events Found" — src/views/orders/components/projectTable.jsx:699-708, 914-920, 965-971
- **Trace.** P1 · draft · `GEN-SCR-298` · layer ui · coverage full · typed: “screen events-history (/orders)”

### GEN-SCR-299 — Empty Drafts tab shows its specific empty state

- **Why it matters.** The Drafts tab has a dedicated empty-state message. Written from the events-history screen; grounded in R-FLA-004-4 (src/views/orders/components/projectTable.jsx:699-708); screenshot procol-ui-tests/evidence/walk-list-mvhyvlec/05-inventory-events-history.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use an account with no draft events.
- **Steps.** 1. Select "Drafts 185".
- **Expected.** The page shows "No Drafts Found".
- **Oracle.** The screen behaves as R-FLA-004-4 says: Empty states: filtered → "no result" copy; Drafts → "No Drafts Found"; Recurring → "No Recurring Events Found" — src/views/orders/components/projectTable.jsx:699-708, 914-920, 965-971
- **Trace.** P1 · draft · `GEN-SCR-299` · layer ui · coverage full · typed: “screen events-history (/orders)”

### GEN-SCR-300 — Draft entry opens the restricted draft creation screen

- **Why it matters.** Auction-team users need the correct creation context when continuing an RFQ-to-auction draft. Written from the events-drafts screen; grounded in R-FLA-010-5 (src/views/orders/components/projectCard/projectCard.jsx:168-197); screenshot procol-ui-tests/evidence/walk-list-mvhyvlec/07-inventory-events-drafts.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: draft stage IDs are present; project ID is present in state; the expected project title is loaded; RFQ-to-auction state is present; isEditingAllowed=false.
- **Setup.** Sign in as an auction-team user. Prepare a draft containing an RFQ-to-auction stage, or an auction stage with `route_auctions_to_auction_team` enabled. Open the Drafts tab.
- **Steps.** 1. Select the draft stage entry. 2. Inspect the opened creation screen and its URL or state.
- **Expected.** The creation screen opens with the draft stage IDs, project creation context, project ID, title, and RFQ-to-auction state. Editing is not allowed (`isEditingAllowed=false`).
- **Oracle.** The screen behaves as R-FLA-010-5 says: Stage row click on a draft stage that is rfq→auction, or auction with `route_auctions_to_auction_team`, for an auction-team user with Drafts tab on → create screen with `draftStageIds, projectCreation
- **Trace.** P0 · draft · `GEN-SCR-300` · layer ui · coverage partial · typed: “screen events-drafts (/orders)”

### GEN-SCR-301 — Draft cards are grouped by formatted date

- **Why it matters.** Date grouping makes multiple draft events easier to scan. Written from the events-drafts screen; grounded in R-FLA-004-3 (src/views/orders/components/projectTable.jsx:846-858); screenshot procol-ui-tests/evidence/walk-list-mvhyvlec/07-inventory-events-drafts.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Date headers are present for draft card groups; Headers use the application's appFormatDate(date, DATE) format; Drafts from the same date share one header.
- **Setup.** Prepare drafts with at least two different creation or update dates, including multiple drafts on one date.
- **Steps.** 1. Select Drafts 185. 2. Wait for the list to load.
- **Expected.** Draft cards are grouped beneath date headers. Each header uses the application's `appFormatDate(date, DATE)` format, and drafts from the same date share one header.
- **Oracle.** The screen behaves as R-FLA-004-3 says: History/Drafts cards are grouped under a date header formatted `appFormatDate(date, DATE)` — src/views/orders/components/projectTable.jsx:846-858, 900-913
- **Trace.** P1 · draft · `GEN-SCR-301` · layer ui · coverage none · typed: “screen events-drafts (/orders)”

### GEN-SCR-302 — Create Event M opens the configured creation flow

- **Why it matters.** The creation entry point must honor the configured old or quick creation flow. Written from the events-drafts screen; grounded in R-FLA-009-2 (src/views/orders/components/projectTable.jsx:125-137); screenshot procol-ui-tests/evidence/walk-list-mvhyvlec/07-inventory-events-drafts.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Cannot set or inspect rfx_project_enabled and old_creation_flow_config for the current tenant.; Cannot assert both conditional outcomes: the old auction create route when rfx_project_enabled is off with old_creation_flow_config=show_old_flow, and the quick-create route for all other configurations..
- **Setup.** Run the test once with `rfx_project_enabled` off and `old_creation_flow_config=show_old_flow`. Run it again with any other configuration.
- **Steps.** 1. Select Create Event M. 2. Wait for navigation to complete.
- **Expected.** With `rfx_project_enabled` off and `old_creation_flow_config=show_old_flow`, the old auction create route opens. With any other configuration, the quick-create route opens.
- **Oracle.** The screen behaves as R-FLA-009-2 says: `rfx_project_enabled` off → `old_creation_flow_config = "show_old_flow"` goes to the old auction create route, anything else to the quick-create route — src/views/orders/components/projectTable.jsx:12
- **Trace.** P0 · draft · `GEN-SCR-302` · layer ui · coverage partial · typed: “screen events-drafts (/orders)”

### GEN-SCR-303 — Recurring tab remains selected after loading recurring events

- **Why it matters.** The selected tab must identify the currently displayed event list. Written from the events-recurring screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvhyvlec/09-inventory-events-recurring.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Directly verify that the Recurring tab has its selected/active state.; Verify that the displayed rows are specifically recurring event cards rather than generic event-list rows..
- **Setup.** Use an account with at least one recurring event.
- **Steps.** 1. Click "Recurring".
- **Expected.** The "Recurring" tab remains visibly selected and recurring event cards are displayed.
- **Oracle.** What the tester sees on the events-recurring screen.
- **Trace.** P1 · draft · `GEN-SCR-303` · layer ui · coverage partial · typed: “screen events-recurring (/orders)”

### GEN-SCR-304 — Create Event menu shows the available creation flows

- **Why it matters.** Verify the main creation control opens the correct creation choices. Written from the create-event-menu screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvhyvlec/12-inventory-create-event-menu.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: A dedicated assertion that each selected menu item semantically maps to its exact creation flow rather than relying on the destination URL and flow-specific visible text..
- **Setup.** Use a tenant with eRFX and BOQ project creation enabled.
- **Steps.** 1. Open /orders. 2. Select Create Event M. 3. Select Single Stage Source through RFP / RFQ / Auction. 4. Return to /orders. 5. Select Create Event M. 6. Select eRFX Project Manage sourcing via a project approach. 7. Return to /orders. 8. Select Create Event M. 9. Select BOQ based RFX Project Source BOQ via a project approach.
- **Expected.** Create Event M opens a menu containing all three listed menu items. Single Stage Source through RFP / RFQ / Auction opens single-stage creation. eRFX Project Manage sourcing via a project approach opens the project line-item flow. BOQ based RFX Project Source BOQ via a project approach opens BOQ project creation.
- **Oracle.** What the tester sees on the create-event-menu screen.
- **Trace.** P1 · draft · `GEN-SCR-304` · layer ui · coverage partial · typed: “screen create-event-menu (/orders)”

### GEN-SCR-305 — Create Event uses the configured old or quick creation route

- **Why it matters.** Verify the creation route changes according to the tenant configuration when eRFX is disabled. Written from the create-event-menu screen; grounded in R-FLA-009-2 (src/views/orders/components/projectTable.jsx:125-137); screenshot procol-ui-tests/evidence/walk-list-mvhyvlec/12-inventory-create-event-menu.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Change or set old_creation_flow_config to show_old_flow or another value; Repeat the flow under a second configuration; Assert the exact old auction create route because its route is not provided.
- **Setup.** Run the test once with rfx_project_enabled off and old_creation_flow_config set to show_old_flow. Run it again with rfx_project_enabled off and old_creation_flow_config set to any other value.
- **Steps.** 1. Open /orders. 2. Select Create Event M. 3. Observe the destination in the first configuration. 4. Repeat the steps with the second configuration.
- **Expected.** With old_creation_flow_config set to show_old_flow, Create Event M opens the old auction create route. With any other value, it opens the quick-create route.
- **Oracle.** The screen behaves as R-FLA-009-2 says: `rfx_project_enabled` off → `old_creation_flow_config = "show_old_flow"` goes to the old auction create route, anything else to the quick-create route — src/views/orders/components/projectTable.jsx:12
- **Trace.** P1 · draft · `GEN-SCR-305` · layer ui · coverage partial · typed: “screen create-event-menu (/orders)”

### GEN-SCR-306 — Filtered Live results show the filtered no-result state

- **Why it matters.** Verify a search with no matching event does not show the unfiltered empty-state action. Written from the create-event-menu screen; grounded in R-FLA-009-3 (src/views/orders/components/projectTable.jsx:699-720); screenshot procol-ui-tests/evidence/walk-list-mvhyvlec/12-inventory-create-event-menu.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use a Live list containing events. Choose a title that does not exist.
- **Steps.** 1. Select Live 8641. 2. Enter the non-existent title in Search Title. 3. Wait for the list to refresh.
- **Expected.** The list shows the filtered no-result copy. It does not show the unfiltered Live empty state that repeats the new-event action.
- **Oracle.** The screen behaves as R-FLA-009-3 says: Empty Live tab without filters repeats the New Event button; with filters it shows the "no result" copy instead — src/views/orders/components/projectTable.jsx:699-720
- **Trace.** P1 · draft · `GEN-SCR-306` · layer ui · coverage full · typed: “screen create-event-menu (/orders)”

### GEN-SCR-307 — Drafts and Recurring empty states use their specific messages

- **Why it matters.** Verify each empty list communicates the correct reason for having no events. Written from the create-event-menu screen; grounded in R-FLA-004-4 (src/views/orders/components/projectTable.jsx:699-708); screenshot procol-ui-tests/evidence/walk-list-mvhyvlec/12-inventory-create-event-menu.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use an account with no draft events and no recurring events.
- **Steps.** 1. Select Drafts 185. 2. Wait for the list to load. 3. Select Recurring. 4. Wait for the list to load.
- **Expected.** Drafts shows "No Drafts Found". Recurring shows "No Recurring Events Found".
- **Oracle.** The screen behaves as R-FLA-004-4 says: Empty states: filtered → "no result" copy; Drafts → "No Drafts Found"; Recurring → "No Recurring Events Found" — src/views/orders/components/projectTable.jsx:699-708, 914-920, 965-971
- **Trace.** P1 · draft · `GEN-SCR-307` · layer ui · coverage full · typed: “screen create-event-menu (/orders)”

### GEN-SCR-308 — Starting and ending date fields remain unavailable on this screen

- **Why it matters.** Verify the date controls are visibly disabled and cannot be edited from the create-event menu screen. Written from the create-event-menu screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-list-mvhyvlec/12-inventory-create-event-menu.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Whether Starting from rejects keyboard focus; Whether Ending at rejects keyboard focus; Whether typing into Starting from is rejected; Whether typing into Ending at is rejected; Whether date changes are rejected for either field; Whether no date filter is applied after interaction.
- **Setup.** Open /orders and leave the screen in its initial state.
- **Steps.** 1. Inspect Starting from. 2. Inspect Ending at. 3. Try to focus each field. 4. Try to enter a date in each field.
- **Expected.** Starting from and Ending at are disabled. They do not accept focus, typing, or date changes, and no date filter is applied.
- **Oracle.** What the tester sees on the create-event-menu screen.
- **Trace.** P2 · draft · `GEN-SCR-308` · layer ui · coverage partial · typed: “screen create-event-menu (/orders)”

### GEN-SCR-309 — Open the manage line items section from Items 0

- **Why it matters.** Verify that the empty line-item control opens the area used to add products. Written from the create-erfx screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open /orders/quick-create with no line items.
- **Steps.** 1. Click "Items 0".
- **Expected.** The manage line items section opens and shows that no line items have been added.
- **Oracle.** What the tester sees on the create-erfx screen.
- **Trace.** P1 · draft · `GEN-SCR-309` · layer ui · coverage full · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-310 — Show the no-items refusal in the manage line items section

- **Why it matters.** Verify that an event cannot proceed when all line items are removed. Written from the create-erfx screen; grounded in R-FCR-014-3 (src/views/projectCreation/components/manageLineItemsModal.jsx:86-88); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open /orders/quick-create with no line items.
- **Steps.** 1. Click "Items 0". 2. Leave the manage line items section empty. 3. Attempt to continue from the manage line items section.
- **Expected.** The message "Please add atleast one item to proceed!" appears.
- **Oracle.** The screen behaves as R-FCR-014-3 says: No items left → "Please add atleast one item to proceed!" — src/views/projectCreation/components/manageLineItemsModal.jsx:86-88, 127-130
- **Trace.** P1 · draft · `GEN-SCR-310` · layer ui · coverage full · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-311 — Open template selection and verify the disabled draft-save reason

- **Why it matters.** Verify that saving is blocked without a template and that the user receives the correct reason. Written from the create-erfx screen; grounded in R-FCR-016-2 (src/views/projectCreation/projectCreation.jsx:1457-1481); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open /orders/quick-create with no selected template and no line items.
- **Steps.** 1. Hover over "Save as draft". 2. Click "Select Templates".
- **Expected.** Before a template is selected, "Save as draft" is disabled and its tooltip says "Please select template for <stage title>" or "Please add line items". Clicking "Select Templates" opens the template selector.
- **Oracle.** The screen behaves as R-FCR-016-2 says: Disabled with tooltip "Please select template for <stage title>" for any non-RFP stage without a template, or "Please add line items" — src/views/projectCreation/projectCreation.jsx:1457-1481
- **Trace.** P1 · draft · `GEN-SCR-311` · layer ui · coverage full · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-312 — Reject publishing when the project title is empty

- **Why it matters.** Verify that title validation occurs before other publish validations. Written from the create-erfx screen; grounded in R-FCR-013-1 (src/views/projectCreation/projectCreation.jsx:1599-1602); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Have a valid template, at least one line item, and at least one participant configured. Leave "Enter the title of the project" empty.
- **Steps.** 1. Click "Publish".
- **Expected.** Publishing is stopped and the message "Please fill project title!" appears.
- **Oracle.** The screen behaves as R-FCR-013-1 says: Publish with empty project title → "Please fill project title!" before any other check; a whitespace-only title passes (truthiness check) — src/views/projectCreation/projectCreation.jsx:1599-1602
- **Trace.** P0 · draft · `GEN-SCR-312` · layer ui · coverage full · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-313 — Reject publishing when no participants are configured

- **Why it matters.** Verify that a project with no participants cannot proceed to publish. Written from the create-erfx screen; grounded in R-FCR-017-1 (src/views/projectCreation/projectCreation.jsx:1604-1609); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Enter a non-empty project title. Have a valid template and at least one line item. Ensure that no participants are configured.
- **Steps.** 1. Click "Publish".
- **Expected.** Publishing is stopped and the message "Please add participants to proceed!" appears.
- **Oracle.** The screen behaves as R-FCR-017-1 says: No participant in the project → "Please add participants to proceed!" (stops) — src/views/projectCreation/projectCreation.jsx:1604-1609
- **Trace.** P0 · draft · `GEN-SCR-313` · layer ui · coverage full · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-314 — Show the publish confirmation for a valid auction

- **Why it matters.** Verify the confirmation content shown before publishing a valid event. Written from the create-erfx screen; grounded in R-FCR-020-2 (src/views/eventCreation/components/footer/confirmModal.jsx:52-60); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact truncation to exactly 45 characters, including whether an ellipsis is used..
- **Setup.** Enter a project title of 45 characters or fewer. Configure a valid template, at least one line item, and at least one participant.
- **Steps.** 1. Click "Publish".
- **Expected.** A confirmation modal opens with title "Publish Event". The project title is truncated to 45 characters when necessary. The modal shows an OK action labeled "Publish" and a cancel action labeled "Edit Schedule"; selecting "Edit Schedule" opens the schedule drawer.
- **Oracle.** The screen behaves as R-FCR-020-2 says: Title: "Send to Auction Team" / project title truncated to 45 / "Publish Event"; OK text "Send to Auction Team" or "Publish"; Cancel is "Edit Schedule" and opens the schedule drawer — src/views/eventC
- **Trace.** P0 · draft · `GEN-SCR-314` · layer ui · coverage partial · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-315 — Publish refuses an empty project title

- **Why it matters.** Verify the title validation runs before other publish checks. Written from the create-stages-rfp-rfq screen; grounded in R-FCR-013-1 (src/views/projectCreation/projectCreation.jsx:1599-1602); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/05-inventory-create-stages-rfp-rfq.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open a new create event.
- **Steps.** 1. Leave "Enter the title of the project" empty. 2. Click "Publish".
- **Expected.** Publishing stops and the app shows "Please fill project title!".
- **Oracle.** The screen behaves as R-FCR-013-1 says: Publish with empty project title → "Please fill project title!" before any other check; a whitespace-only title passes (truthiness check) — src/views/projectCreation/projectCreation.jsx:1599-1602
- **Trace.** P0 · draft · `GEN-SCR-315` · layer ui · coverage full · typed: “screen create-stages-rfp-rfq (/orders/quick-create)”

### GEN-SCR-316 — Publish refuses an event without participants

- **Why it matters.** Verify a project with no vendors cannot be published. Written from the create-stages-rfp-rfq screen; grounded in R-FCR-017-1 (src/views/projectCreation/projectCreation.jsx:1604-1609); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/05-inventory-create-stages-rfp-rfq.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Directly confirm that no vendor is selected in the Participants panel..
- **Setup.** Open a project with a title and at least one line item, with no participants selected.
- **Steps.** 1. Open "Participants". 2. Confirm that no vendor is selected. 3. Return to the create screen. 4. Click "Publish".
- **Expected.** Publishing stops and the app shows "Please add participants to proceed!".
- **Oracle.** The screen behaves as R-FCR-017-1 says: No participant in the project → "Please add participants to proceed!" (stops) — src/views/projectCreation/projectCreation.jsx:1604-1609
- **Trace.** P0 · draft · `GEN-SCR-316` · layer ui · coverage partial · typed: “screen create-stages-rfp-rfq (/orders/quick-create)”

### GEN-SCR-317 — Publish requires payment terms

- **Why it matters.** Verify payment terms are required even when the other publish data is valid. Written from the create-stages-rfp-rfq screen; grounded in R-FCR-039-3 (src/views/projectCreation/helpers.js:278-280); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/05-inventory-create-stages-rfp-rfq.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Explicitly configure, clear, or verify the absence of Payment Terms and Conditions before publishing..
- **Setup.** Open a project with a title, line item, participant, and evaluator. Leave payment terms unsaved.
- **Steps.** 1. Click "Publish".
- **Expected.** Publishing stops and the app shows "Payment Terms and Conditions are mandatory".
- **Oracle.** The screen behaves as R-FCR-039-3 says: Enabled but not saved → "Payment Terms and Conditions are mandatory" at publish; sent as `configurations.payment_tnc` — src/views/projectCreation/helpers.js:278-280, src/redux/orders/helpers.js:1072-1
- **Trace.** P1 · draft · `GEN-SCR-317` · layer ui · coverage partial · typed: “screen create-stages-rfp-rfq (/orders/quick-create)”

### GEN-SCR-318 — Blocked and TNA vendors cannot be selected

- **Why it matters.** Verify vendor eligibility states are shown in participant search results. Written from the create-stages-rfp-rfq screen; grounded in R-FCR-035-3 (src/views/projectCreation/projectCreation.jsx:255-256); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/05-inventory-create-stages-rfp-rfq.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The actual names of the blacklisted and TNA vendors are not provided, so the plan cannot search for or assert the exact vendor rows.; No catalog step can semantically verify that those exact vendor rows are disabled beyond matching a supplied control name..
- **Setup.** Use an account with one blacklisted vendor and one TNA vendor in the vendor search results. Do not enable the allow-TNA URL option.
- **Steps.** 1. Open "Search vendors you want to add". 2. Search for the blacklisted vendor. 3. Search for the TNA vendor.
- **Expected.** The blacklisted vendor is disabled and marked "Blocked". The TNA vendor is disabled and marked "TNA".
- **Oracle.** The screen behaves as R-FCR-035-3 says: In search results blacklisted vendors are disabled with "Blocked"; TNA vendors are disabled with "TNA" unless the URL has `allowTnaVendorsToBid=true` (so on a fresh create every TNA vendor is unselect
- **Trace.** P1 · draft · `GEN-SCR-318` · layer ui · coverage partial · typed: “screen create-stages-rfp-rfq (/orders/quick-create)”

### GEN-SCR-319 — Select Templates explains why it is disabled without line items

- **Why it matters.** Verify the disabled template control becomes usable only after the required line-item setup. Written from the create-stages-rfp-rfq screen; grounded in R-FCR-016-2 (src/views/projectCreation/projectCreation.jsx:1457-1481); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/05-inventory-create-stages-rfp-rfq.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open a non-RFP stage without a selected template and with the screen showing "Items 0".
- **Steps.** 1. Hover over "Select Templates". 2. Click "Items 0" and add a line item in the line-item manager. 3. Return to the stage screen.
- **Expected.** Before a line item is added, "Select Templates" is disabled and its tooltip says "Please add line items". After a line item is added, the control is enabled.
- **Oracle.** The screen behaves as R-FCR-016-2 says: Disabled with tooltip "Please select template for <stage title>" for any non-RFP stage without a template, or "Please add line items" — src/views/projectCreation/projectCreation.jsx:1457-1481
- **Trace.** P1 · draft · `GEN-SCR-319` · layer ui · coverage full · typed: “screen create-stages-rfp-rfq (/orders/quick-create)”

### GEN-SCR-320 — Publish does not retain created stage identifiers after a failed retry

- **Why it matters.** Verify a retry does not create duplicate stages after the project update fails. Written from the create-stages-rfp-rfq screen; grounded in R-FCR-019-4 (src/views/projectCreation/projectCreation.jsx:1826-1839); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/05-inventory-create-stages-rfp-rfq.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Force the project update to fail after clicking Publish; Retry Publish without changing stages; Inspect whether the retry request reuses returned stage UUIDs rather than stored identifiers; Assert that no duplicate stage is created specifically after a successful retry.
- **Setup.** Use a project with valid title, line item, participant, evaluator, and terms. Configure the first project update to fail after the stage creation succeeds.
- **Steps.** 1. Click "Publish". 2. Confirm the project update fails. 3. Retry "Publish" without changing the stages.
- **Expected.** The retry sends the existing stage data again rather than using stored returned stage UUIDs. No duplicate stage is created after a successful retry.
- **Oracle.** The screen behaves as R-FCR-019-4 says: Publish never stores the returned stage uuids (only Save as draft does), so a retry after a failed project PATCH (e.g. 712) POSTs every stage again — src/views/projectCreation/projectCreation.jsx:1826
- **Trace.** P1 · draft · `GEN-SCR-320` · layer ui · coverage partial · typed: “screen create-stages-rfp-rfq (/orders/quick-create)”

### GEN-SCR-321 — Publish refuses a project with no line items

- **Why it matters.** The screen shows that no line items have been added and provides the exact refusal message. Written from the create-technical-template screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/08-inventory-create-technical-template.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the create technical template screen.
- **Steps.** 1. Enter a project title. 2. Confirm "Items 0" is shown. 3. Click "Publish".
- **Expected.** The event is not published. The app shows "Line Items are not added, please add them in Manage Line Items section".
- **Oracle.** What the tester sees on the create-technical-template screen.
- **Trace.** P0 · draft · `GEN-SCR-321` · layer ui · coverage full · typed: “screen create-technical-template (/orders/quick-create)”

### GEN-SCR-322 — Save as draft is disabled until required setup is complete

- **Why it matters.** The screen shows Save as draft disabled while the project has zero line items. Written from the create-technical-template screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/08-inventory-create-technical-template.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the create technical template screen.
- **Steps.** 1. Confirm "Items 0" is displayed. 2. Try to click "Save as draft".
- **Expected.** "Save as draft" remains unavailable and no draft is saved.
- **Oracle.** What the tester sees on the create-technical-template screen.
- **Trace.** P1 · draft · `GEN-SCR-322` · layer ui · coverage full · typed: “screen create-technical-template (/orders/quick-create)”

### GEN-SCR-323 — Required assessment columns are visibly marked

- **Why it matters.** The screen marks the assessment columns as required. Written from the create-technical-template screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/08-inventory-create-technical-template.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Assert that the Specification column header displays a required marker.; Assert that the Description column header displays a required marker.; Assert that the Vendor Response column header displays a required marker..
- **Setup.** Open the create technical template screen.
- **Steps.** 1. Inspect the column headers.
- **Expected.** "Specification", "Description", and "Vendor Response" each display a required marker.
- **Oracle.** What the tester sees on the create-technical-template screen.
- **Trace.** P1 · draft · `GEN-SCR-323` · layer ui · coverage partial · typed: “screen create-technical-template (/orders/quick-create)”

### GEN-SCR-324 — Terms and Conditions opens its editor

- **Why it matters.** Verify that both visible Terms and Conditions entry points open the terms editor. Written from the create-technical-template screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/08-inventory-create-technical-template.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog has no dedicated assertion that the opened panel is specifically the Terms and Conditions editor rather than another dialog..
- **Setup.** Open the create technical template screen.
- **Steps.** 1. Click "Terms & Conditions". 2. Close the opened editor. 3. Click "Add T&Cs".
- **Expected.** Each click opens the Terms and Conditions editor or panel without navigating away from project creation.
- **Oracle.** What the tester sees on the create-technical-template screen.
- **Trace.** P1 · draft · `GEN-SCR-324` · layer ui · coverage partial · typed: “screen create-technical-template (/orders/quick-create)”

### GEN-SCR-325 — Required line-item columns are shown

- **Why it matters.** Required line-item data must be identifiable before the event is saved or published. Written from the create-line-items screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/12-inventory-create-line-items.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Assert that Product, Product Variant, Quantity Requested, Delivery location, Price, Quantity Available, and Total Amount are marked required.; Assert that GST is not marked required..
- **Setup.** Open the create-line-items screen.
- **Steps.** 1. Inspect the line-item columns. 2. Click "Items 2". 3. Review the line-item editor.
- **Expected.** The line-item editor opens. Product, Product Variant, Quantity Requested, Delivery location, Price, Quantity Available, and Total Amount are marked required. GST is not marked required.
- **Oracle.** What the tester sees on the create-line-items screen.
- **Trace.** P1 · draft · `GEN-SCR-325` · layer ui · coverage partial · typed: “screen create-line-items (/orders/quick-create)”

### GEN-SCR-326 — Publish opens the event confirmation

- **Why it matters.** A valid event must show the publish confirmation before it is submitted. Written from the create-line-items screen; grounded in R-FCR-020-2 (src/views/eventCreation/components/footer/confirmModal.jsx:52-60); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/12-inventory-create-line-items.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog cannot assert the exact character count of the truncated title or verify the precise truncation/ellipsis format..
- **Setup.** Enter a valid title, complete the required line-item data, and select at least one vendor.
- **Steps.** 1. Click "Publish". 2. Review the confirmation dialog.
- **Expected.** A confirmation dialog opens with the title "Publish Event". The dialog shows the project title, truncated to 45 characters when necessary, and provides "Publish" and "Edit Schedule" actions.
- **Oracle.** The screen behaves as R-FCR-020-2 says: Title: "Send to Auction Team" / project title truncated to 45 / "Publish Event"; OK text "Send to Auction Team" or "Publish"; Cancel is "Edit Schedule" and opens the schedule drawer — src/views/eventC
- **Trace.** P0 · draft · `GEN-SCR-326` · layer ui · coverage partial · typed: “screen create-line-items (/orders/quick-create)”

### GEN-SCR-327 — Saving a draft uses create then update behavior

- **Why it matters.** The first draft save creates the event group, while later saves must update the existing draft. Written from the create-line-items screen; grounded in R-FCR-014-4 (src/views/projectCreation/projectCreation.jsx:2259-2269); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/12-inventory-create-line-items.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog cannot correlate the second PATCH request to the exact event-group ID created by the first POST or prove directly that no second event group was created..
- **Setup.** Open a new create-line-items screen and prepare valid title and required line-item data.
- **Steps.** 1. Enter a title in "Enter the title of the project". 2. Click "Items 2" and complete the required line-item data. 3. Click "Save as draft". 4. Change the title in "Enter the title of the project". 5. Click "Save as draft" again. 6. Review the network requests or saved draft result.
- **Expected.** The first save sends a draft event-group creation request. The second save updates the same draft rather than creating a second event group.
- **Oracle.** The screen behaves as R-FCR-014-4 says: First save → `POST /event_groups` `{status:"draft", title, line_items:[{product_uuid, quantity:{unitSymbol,value}, product_quality_uuid, serial_number, pr_line_item_uuid, pr_id}]}`; later saves → `PAT
- **Trace.** P1 · draft · `GEN-SCR-327` · layer ui · coverage partial · typed: “screen create-line-items (/orders/quick-create)”

### GEN-SCR-328 — Ask Clara opens the AI RFP flow when line items exist

- **Why it matters.** The AI RFP flow requires project line items. Written from the create-line-items screen; grounded in R-FCR-042-4 (src/views/eventCreation/components/aiRfpGenerator/api.js:3-11); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/12-inventory-create-line-items.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The specific backend request for generating RFP questions and retrieval of the external request for the project cannot be asserted without the request path or endpoint..
- **Setup.** Add at least one project line item through "Items 2".
- **Steps.** 1. Click "Ask Clara". 2. Review the resulting screen or drawer.
- **Expected.** The AI RFP flow opens. The application sends the RFP questions request and retrieves the external request for the project.
- **Oracle.** The screen behaves as R-FCR-042-4 says: AI RFP → `POST /ask_ai_chats/rfp_questions`, then `GET /external_requests/:uuid`; the AI button needs project line items — src/views/eventCreation/components/aiRfpGenerator/api.js:3-11, src/views/even
- **Trace.** P1 · draft · `GEN-SCR-328` · layer ui · coverage partial · typed: “screen create-line-items (/orders/quick-create)”

### GEN-SCR-329 — Attachment and terms controls open their editors

- **Why it matters.** Both controls must expose the corresponding project configuration area. Written from the create-line-items screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/12-inventory-create-line-items.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Directly verify that neither action sent a save or publish request without a known backend request path..
- **Setup.** Open the create-line-items screen.
- **Steps.** 1. Click "Add Attachments". 2. Verify that the attachment interface opens. 3. Close the attachment interface if applicable. 4. Click "Add T&Cs". 5. Verify that the terms and conditions interface opens.
- **Expected.** "Add Attachments" opens the attachment interface, and "Add T&Cs" opens the terms and conditions interface. Neither action publishes or saves the event by itself.
- **Oracle.** What the tester sees on the create-line-items screen.
- **Trace.** P1 · draft · `GEN-SCR-329` · layer ui · coverage partial · typed: “screen create-line-items (/orders/quick-create)”

### GEN-SCR-330 — Save as draft creates a draft event with line items

- **Why it matters.** Verify the first draft save sends the project and line-item data as a draft. Written from the create-pricing-sheet screen; grounded in R-FCR-014-4 (src/views/projectCreation/projectCreation.jsx:2259-2269); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/14-inventory-create-pricing-sheet.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact line-item values under Product, Product Variant, Quantity Requested, Delivery location, Price, Quantity Available, and Total Amount are not provided and no catalog step can generically verify all cell values..
- **Setup.** Use a new RFQ with at least one completed line item and a valid project title. Open the browser network log.
- **Steps.** 1. Enter a project title in "Enter the title of the project". 2. Verify the line-item values under "Product", "Product Variant", "Quantity Requested", "Delivery location", "Price", "Quantity Available", and "Total Amount". 3. Click "Save as draft".
- **Expected.** The event is saved as a draft. The first save sends a POST request to the event-groups endpoint with status "draft", the project title, and the line items. A later save uses PATCH for the event group.
- **Oracle.** The screen behaves as R-FCR-014-4 says: First save → `POST /event_groups` `{status:"draft", title, line_items:[{product_uuid, quantity:{unitSymbol,value}, product_quality_uuid, serial_number, pr_line_item_uuid, pr_id}]}`; later saves → `PAT
- **Trace.** P1 · draft · `GEN-SCR-330` · layer ui · coverage partial · typed: “screen create-pricing-sheet (/orders/quick-create)”

### GEN-SCR-331 — Add Columns opens the column selection control

- **Why it matters.** Verify that buyers can open the column configuration from the pricing sheet. Written from the create-pricing-sheet screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/14-inventory-create-pricing-sheet.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the RFQ pricing sheet.
- **Steps.** 1. Click "Add Columns".
- **Expected.** A column selection or configuration panel opens for the pricing sheet.
- **Oracle.** What the tester sees on the create-pricing-sheet screen.
- **Trace.** P2 · draft · `GEN-SCR-331` · layer ui · coverage full · typed: “screen create-pricing-sheet (/orders/quick-create)”

### GEN-SCR-332 — Required technical questionnaire columns are marked

- **Why it matters.** Verify the required fields shown on the technical questionnaire. Written from the create-technical-questionnaire screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/18-inventory-create-technical-questionnaire.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Whether the Specification column has a required marker; Whether the Description column has a required marker; Whether the Vendor Response column has a required marker.
- **Setup.** Open the create technical questionnaire screen.
- **Steps.** 1. Review the questionnaire columns.
- **Expected.** Specification, Description, and Vendor Response each show a required marker.
- **Oracle.** What the tester sees on the create-technical-questionnaire screen.
- **Trace.** P1 · draft · `GEN-SCR-332` · layer ui · coverage partial · typed: “screen create-technical-questionnaire (/orders/quick-create)”

### GEN-SCR-333 — Whitespace-only project title passes client-side validation

- **Why it matters.** Verify whitespace-only titles are not rejected by the client. Written from the create-technical-questionnaire screen; grounded in R-FCR-013-7 (src/views/projectCreation/projectCreation.jsx); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/18-inventory-create-technical-questionnaire.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open a new technical questionnaire with at least one participant and all other publish requirements completed.
- **Steps.** 1. Enter one space in Enter the title of the project. 2. Click Publish.
- **Expected.** The message "Please fill project title!" does not appear. The publish request proceeds to the next validation or publish step.
- **Oracle.** The screen behaves as R-FCR-013-7 says: whitespace-only project title is accepted client-side; backend event_groups update has no title check (event-groups.md) — candidate API test with `title:" "`.
- **Trace.** P1 · draft · `GEN-SCR-333` · layer ui · coverage full · typed: “screen create-technical-questionnaire (/orders/quick-create)”

### GEN-SCR-334 — Ask Clara starts AI questionnaire generation

- **Why it matters.** Verify Clara can be used when the project has line items. Written from the create-technical-questionnaire screen; grounded in R-FCR-042-4 (src/views/eventCreation/components/aiRfpGenerator/api.js:3-11); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/18-inventory-create-technical-questionnaire.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact backend request and proof that it is sent only after line items exist, because no request path is provided.; The AI response loading state, Clara questionnaire-generation panel, or generated technical questions because no catalog assertion identifies those results..
- **Setup.** Open the screen with the two existing items shown by Items 2.
- **Steps.** 1. Click Ask Clara. 2. Wait for the AI response to load.
- **Expected.** The AI questionnaire flow opens or generated technical questions appear. The request is sent only after the project has line items.
- **Oracle.** The screen behaves as R-FCR-042-4 says: AI RFP → `POST /ask_ai_chats/rfp_questions`, then `GET /external_requests/:uuid`; the AI button needs project line items — src/views/eventCreation/components/aiRfpGenerator/api.js:3-11, src/views/even
- **Trace.** P1 · draft · `GEN-SCR-334` · layer ui · coverage partial · typed: “screen create-technical-questionnaire (/orders/quick-create)”

### GEN-SCR-335 — Custom duration requires an end time when publishing

- **Why it matters.** Verify the schedule can be saved after selecting a custom duration but cannot be published without an end time. Written from the create-schedule screen; grounded in R-FCR-022-7 (src/views/projectCreation/components/projectScheduler/stageSchedulerCard/stageSchedulerCard.jsx:302-314); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/21-inventory-create-schedule.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the schedule settings for the RFQ stage.
- **Steps.** 1. Open Duration. 2. Choose Custom duration. 3. Close the duration popover without entering an end time. 4. Click Save Schedule. 5. Click Publish and complete the displayed confirmation flow.
- **Expected.** Save Schedule succeeds. Publishing is refused with the exact message "Please add end time for the event".
- **Oracle.** The screen behaves as R-FCR-022-7 says: choosing "Custom duration" first sets end to undefined; closing the popover then Save passes (NaN comparisons) and publish fails "Please add end time for the event" — stageSchedulerCard.jsx:302-314. B
- **Trace.** P0 · draft · `GEN-SCR-335` · layer ui · coverage full · typed: “screen create-schedule (/orders/quick-create)”

### GEN-SCR-336 — Fixed time enables date selection

- **Why it matters.** Verify the disabled date control becomes usable when the schedule changes from starting now to a fixed time. Written from the create-schedule screen; grounded in R-FCR-022-5 (src/views/projectCreation/components/projectScheduler/constants.js:1-1); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/21-inventory-create-schedule.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Choose a specific date because the case does not provide a date and no catalog step can select an arbitrary calendar date.; Set a time using the Select time control and verify the schedule summary reflects the chosen fixed start..
- **Setup.** Open the schedule settings.
- **Steps.** 1. Confirm Select date is disabled while Start now is selected. 2. Open Start now. 3. Choose Fixed time. 4. Open Select date. 5. Choose a date and set a time with Select time.
- **Expected.** Select date becomes enabled after Fixed time is selected. A date and time can be entered, and the schedule reflects the fixed start instead of Now.
- **Oracle.** The screen behaves as R-FCR-022-5 says: Duration menu = template `event_duration_predefined_values[mode].event_duration` or default 30 min, 1 h, 4 h, 24 h; switching to "Fixed time" presets now + 30 min — stageSchedulerCard.jsx:68-71, 213-2
- **Trace.** P1 · draft · `GEN-SCR-336` · layer ui · coverage partial · typed: “screen create-schedule (/orders/quick-create)”

### GEN-SCR-337 — Recurring event changes the publish action label

- **Why it matters.** Verify the publish action identifies a recurring event. Written from the create-schedule screen; grounded in R-FCR-013-6 (src/views/projectCreation/projectCreation.jsx:3390-3400); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/21-inventory-create-schedule.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the create schedule screen with a non-recurring stage.
- **Steps.** 1. Turn on Mark as Recurring EventSet this event to repeat automaticall. 2. Inspect Publish.
- **Expected.** The publish action label changes from "Publish" to "Save Recurring Event".
- **Oracle.** The screen behaves as R-FCR-013-6 says: Publish label: "Send to Auction team" when publishToDraft, "Save Recurring Event" when the CURRENT stage is recurring, else "Publish" — src/views/projectCreation/projectCreation.jsx:3390-3400
- **Trace.** P1 · draft · `GEN-SCR-337` · layer ui · coverage full · typed: “screen create-schedule (/orders/quick-create)”

### GEN-SCR-338 — Back discards unsaved schedule changes

- **Why it matters.** Verify schedule changes are not stored until Save Schedule is used. Written from the create-schedule screen; grounded in R-FCR-022-6 (src/views/projectCreation/components/projectScheduler/projectScheduler.jsx:83-111); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/21-inventory-create-schedule.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Identify the existing saved project because no project title or id was provided and no catalog step can select an unspecified event.; Perform the intended browser or page Back navigation from the create screen; the available Back control is documented for the schedule drawer.; Assert that the reopened title equals the specific previously saved title because that value was not provided.; Prove that the unsaved title change was discarded rather than merely observing the reopened title..
- **Setup.** Open an editable schedule with an existing project title.
- **Steps.** 1. Change the value in Enter the title of the project. 2. Click Back. 3. Return to the create schedule screen through Events.
- **Expected.** The unsaved title change is discarded. The previously saved project title remains.
- **Oracle.** The screen behaves as R-FCR-022-6 says: Nothing is stored on the stage until Save Schedule passes; Back discards — projectScheduler.jsx:83-111, 37-39
- **Trace.** P1 · draft · `GEN-SCR-338` · layer ui · coverage none · typed: “screen create-schedule (/orders/quick-create)”

### GEN-SCR-339 — Save as draft preserves required project and line-item data

- **Why it matters.** Verify the first draft save creates a draft containing the project title and line-item values. Written from the create-schedule screen; grounded in R-FCR-014-4 (src/views/projectCreation/projectCreation.jsx:2259-2269); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/21-inventory-create-schedule.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact preservation comparison for Product values; Exact preservation comparison for Product Variant values; Exact preservation comparison for Quantity Requested values; Exact preservation comparison for Delivery location values; Exact preservation comparison for Price values; Exact preservation comparison for Quantity Available values; Exact preservation comparison for Total Amount values; A direct assertion that the first save created a new draft rather than updated an existing draft, beyond the creation-success toast and Draft status.
- **Setup.** Use a new project with at least one completed line item.
- **Steps.** 1. Enter a project title. 2. Click Items 2. 3. Verify values are present for Product, Product Variant, Quantity Requested, Delivery location, Price, Quantity Available, and Total Amount. 4. Click Save as draft. 5. Reopen the saved draft.
- **Expected.** The draft is saved and reopens with the entered project title and line-item values preserved. The initial save creates the draft rather than updating an existing draft.
- **Oracle.** The screen behaves as R-FCR-014-4 says: First save → `POST /event_groups` `{status:"draft", title, line_items:[{product_uuid, quantity:{unitSymbol,value}, product_quality_uuid, serial_number, pr_line_item_uuid, pr_id}]}`; later saves → `PAT
- **Trace.** P0 · draft · `GEN-SCR-339` · layer ui · coverage partial · typed: “screen create-schedule (/orders/quick-create)”

### GEN-SCR-340 — Publish confirmation shows stage schedule and vendor details

- **Why it matters.** Verifies that the publish review includes the schedule and de-duplicated invited vendor count. Written from the create-participants screen; grounded in R-FCR-020-3 (src/views/eventCreation/components/footer/confirmModal.jsx:150-181); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/23-inventory-create-participants.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog cannot reliably assert that the duration is specifically rendered in parentheses or independently validate de-duplication beyond the displayed vendor count.; unconfirmed label "Starts on: Now" (expect_text) — not among the labels known from the app nor in the case; unconfirmed label "30" (expect_text) — not among the labels known from the app nor in the case; unconfirmed label "Vendors invited: 1" (expect_text) — not among the labels known from the app nor in the case.
- **Setup.** Set a start time, ending time, and add at least one vendor. Leave the event ready to publish.
- **Steps.** 1. Click "Publish". 2. Review the stage information in the confirmation modal. 3. Do not confirm the publish action.
- **Expected.** The modal shows "Starts on:", "Ending at:" with the duration in parentheses, and "Vendors invited:" with the de-duplicated vendor count. The event is not published.
- **Oracle.** The screen behaves as R-FCR-020-3 says: Per stage: "Starts on:" (date-time or "Now"), "Ending at: <date-time> (<duration>)", "Evaluation time:" when > 0, "Vendors invited:" de-duplicated count — src/views/eventCreation/components/footer/con
- **Trace.** P1 · draft · `GEN-SCR-340` · layer ui · coverage partial · typed: “screen create-participants (/orders/quick-create)”

### GEN-SCR-341 — Custom duration without an end time is refused on publish

- **Why it matters.** Covers the invalid custom-duration state where saving is accepted but publishing must require an end time. Written from the create-participants screen; grounded in R-FCR-022-7 (src/views/projectCreation/components/projectScheduler/stageSchedulerCard/stageSchedulerCard.jsx:302-314); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/23-inventory-create-participants.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the schedule drawer using the current schedule chip.
- **Steps.** 1. Open "Duration". 2. Choose "Custom duration". 3. Close the duration popover without entering an end time. 4. Click "Save Schedule". 5. Click "Publish".
- **Expected.** Saving the schedule completes, but publishing is refused with the message "Please add end time for the event".
- **Oracle.** The screen behaves as R-FCR-022-7 says: choosing "Custom duration" first sets end to undefined; closing the popover then Save passes (NaN comparisons) and publish fails "Please add end time for the event" — stageSchedulerCard.jsx:302-314. B
- **Trace.** P0 · draft · `GEN-SCR-341` · layer ui · coverage full · typed: “screen create-participants (/orders/quick-create)”

### GEN-SCR-342 — Published Stages shows the correct columns and values

- **Why it matters.** Verifies published-stage column visibility, participant counts, dates, and conditional Stage Code behavior. Written from the project-live screen; grounded in R-FLA-026-1 (src/views/projectDetails/components/publishedStagesTable.jsx:31-99); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/26-inventory-project-live.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Assert that Stage Code appears only when at least one stage row has a ref_id.; Assert that missing participant counts render specifically as 0 in the corresponding row.; Assert that missing dates render specifically as '-' in the corresponding row.; Assert that Bidding Starts At and Bidding Ends At use the required DATE_TIME format.; Assert that each row's Participants value is formatted as active/total..
- **Setup.** Prepare a project with one stage having a ref_id and one stage without a ref_id. Include missing participant counts and missing bidding dates.
- **Steps.** 1. Open Published Stages. 2. Review the table headers and stage rows.
- **Expected.** The table shows Stage Code only when at least one row has a ref_id. It shows Stage Title, Pending Actions, Participants, Bidding Starts At, and Bidding Ends At. Missing participant counts display as 0. Missing dates display as '-'. Dates use DATE_TIME format. Participants display as active/total.
- **Oracle.** The screen behaves as R-FLA-026-1 says: Columns: Stage Code (dropped when no row has `ref_id`), Stage Title, Pending Actions, Participants "active/total" (missing → 0), Bidding Starts At / Ends At (DATE_TIME or "-") — src/views/projectDetai
- **Trace.** P1 · draft · `GEN-SCR-342` · layer ui · coverage partial · typed: “screen project-live (/project/TlhjY1hk/details)”

### GEN-SCR-343 — Line item and participant counts match response totals

- **Why it matters.** Confirms that the panel count tags reflect the line-item and participant response counts. Written from the project-live screen; grounded in R-FLA-018-4 (src/views/projectDetails/projectDetails.jsx:916-946); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/26-inventory-project-live.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Independently compare the displayed counts with the response totals from the backend.
- **Setup.** Use a project whose line-item response count is 2 and participant response count is 199.
- **Steps.** 1. Open the project details screen. 2. Review Line Items 2 and Participants 199.
- **Expected.** The Line Items panel shows a count tag of 2, and the Participants panel shows a count tag of 199. The displayed counts match the response totals.
- **Oracle.** The screen behaves as R-FLA-018-4 says: Line Items / Participants panel headers show count tags from the line-item and participant responses — src/views/projectDetails/projectDetails.jsx:916-946, src/redux/project/selectors.js:867-876
- **Trace.** P1 · draft · `GEN-SCR-343` · layer ui · coverage partial · typed: “screen project-live (/project/TlhjY1hk/details)”

### GEN-SCR-344 — A draft RFQ-to-auction stage opens the create screen

- **Why it matters.** Verifies that a draft RFQ-to-auction stage routes to creation with the draft event identifier. Written from the project-live screen; grounded in R-FLA-026-2 (src/views/projectDetails/components/publishedStagesTable.jsx:15-29); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/26-inventory-project-live.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact stage draftEventId value because no expected ID is provided.; That the route succeeds specifically without auction-team permission..
- **Setup.** Prepare a project with a draft RFQ-to-auction stage. Capture the draft event ID.
- **Steps.** 1. Click RFQ.
- **Expected.** The create screen opens with the stage's draftEventId. No auction-team permission is required for this route.
- **Oracle.** The screen behaves as R-FLA-026-2 says: Clicking a draft rfq→auction stage opens the create screen with `draftEventId` (no auction-team check); other stages switch tab — src/views/projectDetails/components/publishedStagesTable.jsx:15-29
- **Trace.** P0 · draft · `GEN-SCR-344` · layer ui · coverage partial · typed: “screen project-live (/project/TlhjY1hk/details)”

### GEN-SCR-345 — Participant search is debounced and returns up to 20 rows

- **Why it matters.** Checks the participant search delay and page-size limit. Written from the project-live screen; grounded in R-FLA-024-5 (src/views/projectDetails/components/participantsTable.jsx:265-267); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/26-inventory-project-live.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Explicitly wait at least 300 milliseconds to verify debounce timing; Assert that the results contain participants matching the entered term without a specified term or expected participant names.
- **Setup.** Use a project with more than 20 participants whose names include the same search term.
- **Steps.** 1. Enter a participant search term in Search participants. 2. Wait at least 300 milliseconds. 3. Review the participant results.
- **Expected.** The search is applied after the debounce interval. The results contain matching participants and show no more than 20 rows on the page.
- **Oracle.** The screen behaves as R-FLA-024-5 says: Search debounced 300 ms; page size 20; proposal page reuses this table without the reject option — src/views/projectDetails/components/participantsTable.jsx:265-267, 397, src/views/projectProposal/pro
- **Trace.** P1 · draft · `GEN-SCR-345` · layer ui · coverage partial · typed: “screen project-live (/project/TlhjY1hk/details)”

### GEN-SCR-346 — Ask Clara starts the awarding flow

- **Why it matters.** Verifies the analyze_data Clara action and its redirect. Written from the project-live screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/26-inventory-project-live.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact returned redirect_url value..
- **Setup.** Prepare the project with an analyze_data Clara todo and a valid redirect_url returned by the awarding service.
- **Steps.** 1. Click Ask Clara.
- **Expected.** The screen shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned redirect_url.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P0 · draft · `GEN-SCR-346` · layer ui · coverage partial · typed: “screen project-live (/project/TlhjY1hk/details)”

### GEN-SCR-347 — Open the Actions menu and view the withdrawal confirmation

- **Why it matters.** Confirms that the project withdrawal flow starts with a confirmation step without completing the destructive action. Written from the project-settings-menu screen; grounded in R-FCR-045-2 (src/views/projectDetails/components/mutation.js:34-49); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/28-inventory-project-settings-menu.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Directly assert the project's persisted status remains unwithdrawn without confirming or reloading the event..
- **Setup.** Use the project shown on the screen.
- **Steps.** 1. Click "Actions". 2. Click "Withdraw". 3. Do not confirm the withdrawal.
- **Expected.** A withdrawal confirmation dialog opens. The project is not withdrawn.
- **Oracle.** The screen behaves as R-FCR-045-2 says: `PATCH /event_groups/:id` `{status:"withdrawn", withdraw_remark:{remarks, attachments:[]}}`; success "Draft project withdrawn successfully" and redirect `/orders?tab=live` — withdrawDraftProjectModal.
- **Trace.** P0 · draft · `GEN-SCR-347` · layer ui · coverage partial · typed: “screen project-settings-menu (/project/TlhjY1hk/WGtja2Rr)”

### GEN-SCR-348 — Verify Request for Re-evaluation is disabled

- **Why it matters.** Checks the disabled lifecycle action shown in the Actions menu. Written from the project-settings-menu screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/28-inventory-project-settings-menu.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use the project shown on the screen.
- **Steps.** 1. Click "Actions". 2. Observe "Request for Re-evaluation". 3. Try to click "Request for Re-evaluation".
- **Expected.** "Request for Re-evaluation" is visibly disabled and cannot be selected. No dialog or navigation opens.
- **Oracle.** What the tester sees on the project-settings-menu screen.
- **Trace.** P1 · draft · `GEN-SCR-348` · layer ui · coverage full · typed: “screen project-settings-menu (/project/TlhjY1hk/WGtja2Rr)”

### GEN-SCR-349 — Open the response template from the no-bids message

- **Why it matters.** Verifies the response-template link in the visible no-bids message. Written from the project-settings-menu screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/28-inventory-project-settings-menu.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Whether the response template opens after clicking Click here; The destination screen or URL for the response template.
- **Setup.** Use the project shown with the message "No bids placed yet.Click hereto view response template."
- **Steps.** 1. Click "Click here".
- **Expected.** The response template opens.
- **Oracle.** What the tester sees on the project-settings-menu screen.
- **Trace.** P1 · draft · `GEN-SCR-349` · layer ui · coverage none · typed: “screen project-settings-menu (/project/TlhjY1hk/WGtja2Rr)”

### GEN-SCR-350 — Start Clara analysis for an analyze_data task

- **Why it matters.** Verifies the success message and redirect when Clara completes the analyze_data task. Written from the project-settings-menu screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/28-inventory-project-settings-menu.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Start Clara analysis for an analyze_data task; Verify that the browser navigates to the returned redirect URL.
- **Setup.** Use a project with an available Clara "analyze_data" todo and a valid returned redirect URL.
- **Steps.** 1. Click "Ask Clara".
- **Expected.** The message "Awarding initiated successfully, redirecting to awarding flow..." appears, then the browser navigates to the returned redirect URL.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P1 · draft · `GEN-SCR-350` · layer ui · coverage none · typed: “screen project-settings-menu (/project/TlhjY1hk/WGtja2Rr)”

### GEN-SCR-351 — Messages opens the project messages view

- **Why it matters.** Verify the project communication action opens its messages view. Written from the participants-live screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/31-inventory-participants-live.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Directly assert that the project messages view or panel is open after clicking Messages..
- **Setup.** Open the Participants tab for a project with existing or empty project messages.
- **Steps.** 1. Click "Messages".
- **Expected.** The project messages view opens without leaving the current project context.
- **Oracle.** What the tester sees on the participants-live screen.
- **Trace.** P1 · draft · `GEN-SCR-351` · layer ui · coverage partial · typed: “screen participants-live (/project/TlhjY1hk/WGNRa2Rr)”

### GEN-SCR-352 — Vendor search is debounced and limited to twenty results

- **Why it matters.** Verify the participant search waits for the debounce interval and applies the page-size limit. Written from the participants-live screen; grounded in R-FLA-024-5 (src/views/projectDetails/components/participantsTable.jsx:265-267); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/31-inventory-participants-live.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: That the request is issued only after the 300-millisecond debounce interval rather than for each intermediate keystroke; Network activity or result updates before and after the 300-millisecond interval; The case-specific search term was not provided.
- **Setup.** Use a project with more than twenty vendors. Prepare a search term matching more than twenty vendors.
- **Steps.** 1. Enter the search term in "Search vendors". 2. Wait at least 300 milliseconds. 3. Observe the vendor results. 4. Check the network activity or result updates before and after the 300-millisecond interval.
- **Expected.** The search request is issued after the 300-millisecond debounce interval, not for every intermediate keystroke. No more than twenty vendor results are shown on the page.
- **Oracle.** The screen behaves as R-FLA-024-5 says: Search debounced 300 ms; page size 20; proposal page reuses this table without the reject option — src/views/projectDetails/components/participantsTable.jsx:265-267, 397, src/views/projectProposal/pro
- **Trace.** P1 · draft · `GEN-SCR-352` · layer ui · coverage partial · typed: “screen participants-live (/project/TlhjY1hk/WGNRa2Rr)”

### GEN-SCR-353 — City filter and selected-vendor switch refine participants

- **Why it matters.** Verify the participant list responds to both available filtering controls. Written from the participants-live screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/31-inventory-participants-live.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Selecting one city in the unconfirmed "Filter by city" control because no catalog step provides a known city option value; Asserting that every displayed vendor belongs to the chosen city; Clearing or resetting the "Filter by city" control and proving the combined city-and-selection filter is fully restored.
- **Setup.** Use a project containing vendors from at least two cities, including both selected and unselected vendors.
- **Steps.** 1. Choose one city in "Filter by city". 2. Confirm that only vendors from the chosen city are listed. 3. Turn on "Show only selected vendors Filter by city". 4. Confirm that the list contains only selected vendors from the chosen city. 5. Turn off "Show only selected vendors Filter by city". 6. Clear or reset "Filter by city".
- **Expected.** The list first narrows to the chosen city, then narrows further to selected vendors. Turning off the switch and clearing the city filter restores the unfiltered participant list.
- **Oracle.** What the tester sees on the participants-live screen.
- **Trace.** P1 · draft · `GEN-SCR-353` · layer ui · coverage partial · typed: “screen participants-live (/project/TlhjY1hk/WGNRa2Rr)”

### GEN-SCR-354 — Project navigation tabs switch their corresponding views

- **Why it matters.** Verify the available project and stage tabs navigate to their labeled views and preserve the selected-tab state. Written from the participants-live screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/31-inventory-participants-live.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Selected-tab styling/state after each click; That the newly opened view does not display content from the previously selected tab; The Project Details and stage-tab views cannot be verified with expect_navigated because those screens are not supported assertion targets.
- **Setup.** Open a project that has the listed tabs available.
- **Steps.** 1. Click "Project Details". 2. Click "Technical Stage". 3. Click "RFQ". 4. Click "Master QCS". 5. Click "Responses". 6. Click "Overview". 7. Click "Participants". 8. Click "Analytics". 9. Click "Price Trends". 10. Click "Participant Remarks".
- **Expected.** Each click opens the view named by the clicked tab. The clicked tab is shown as selected, and the view does not display the content of the previously selected tab.
- **Oracle.** What the tester sees on the participants-live screen.
- **Trace.** P1 · draft · `GEN-SCR-354` · layer ui · coverage partial · typed: “screen participants-live (/project/TlhjY1hk/WGNRa2Rr)”

### GEN-SCR-355 — Verify Overview project information

- **Why it matters.** Confirms the Overview values and conditional Open Tender Event display. Written from the surrogate-bid-placed screen; grounded in R-FLA-018-1 (src/views/projectDetails/projectDetails.jsx:545-564); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/34-inventory-surrogate-bid-placed.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact Project ID value formatted as #<refId>; Exact Created at project DATE_TIME value; Conditional verification that Open Tender Event shows Yes only when is_show_under_open_events is enabled; Reading or changing the is_show_under_open_events tenant setting.
- **Setup.** Use a project with a known refId, creation timestamp, and is_show_under_open_events configuration.
- **Steps.** 1. Click tab: "Overview".
- **Expected.** The screen shows Project ID as "#<refId>" and Created at as the project DATE_TIME. Open Tender Event shows "Yes" only when is_show_under_open_events is enabled.
- **Oracle.** The screen behaves as R-FLA-018-1 says: Overview: "Project ID" = `#<refId>`, "Created at" = DATE_TIME, "Open Tender Event: Yes" only when config `is_show_under_open_events` — src/views/projectDetails/projectDetails.jsx:545-564
- **Trace.** P1 · draft · `GEN-SCR-355` · layer ui · coverage partial · typed: “screen surrogate-bid-placed (/project/TlhjY1hk/WGNRa2Rr)”

### GEN-SCR-356 — Run Clara awarding analysis

- **Why it matters.** Verifies the awarding analysis todo completes and uses the returned destination. Written from the surrogate-bid-placed screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/34-inventory-surrogate-bid-placed.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Execute the analyze_data todo.; Assert navigation to the dynamically returned redirect_url..
- **Setup.** Configure Ask Clara with an analyze_data todo and a successful returned redirect_url.
- **Steps.** 1. Click button: "Ask Clara". 2. Run the analyze_data todo.
- **Expected.** The screen shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned redirect_url.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P1 · draft · `GEN-SCR-356` · layer ui · coverage partial · typed: “screen surrogate-bid-placed (/project/TlhjY1hk/WGNRa2Rr)”

### GEN-SCR-357 — Create a new project version

- **Why it matters.** Confirms that an allowed project can open the new-version creation flow. Written from the surrogate-bid-placed screen; grounded in R-FLA-019-3 (src/views/projectDetails/projectDetails.jsx:312-340); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/34-inventory-surrogate-bid-placed.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use a project where can_create_new_version is enabled and the required project identifiers are present.
- **Steps.** 1. Click button: "Create New Version".
- **Expected.** The create screen opens with projectCreation, projectId, draftStageIds, isEditingAllowed=true, and boqProject.
- **Oracle.** The screen behaves as R-FLA-019-3 says: "New version" allowed only when config `can_create_new_version`; success → create screen with `projectCreation, projectId, draftStageIds, isEditingAllowed=true, boqProject`; missing ids → "Error while
- **Trace.** P1 · draft · `GEN-SCR-357` · layer ui · coverage full · typed: “screen surrogate-bid-placed (/project/TlhjY1hk/WGNRa2Rr)”

### GEN-SCR-358 — Open the price cap entry flow

- **Why it matters.** Confirms that the price-cap action opens its entry interface. Written from the surrogate-bid-placed screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/34-inventory-surrogate-bid-placed.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The specific price-cap entry interface opens and displays its entry controls..
- **Setup.** Open an RFQ project where the price-cap action is available.
- **Steps.** 1. Click button: "Add Price Cap".
- **Expected.** The price-cap entry interface opens without navigating away from the project screen.
- **Oracle.** What the tester sees on the surrogate-bid-placed screen.
- **Trace.** P2 · draft · `GEN-SCR-358` · layer ui · coverage partial · typed: “screen surrogate-bid-placed (/project/TlhjY1hk/WGNRa2Rr)”

### GEN-SCR-359 — Open project messages

- **Why it matters.** Confirms that the Messages action opens the project messaging interface. Written from the surrogate-bid-placed screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/34-inventory-surrogate-bid-placed.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Directly assert that the project messages interface opened; Directly assert that the project screen remains available for returning to the current context.
- **Setup.** Open the project with the Messages action available.
- **Steps.** 1. Click button: "Messages".
- **Expected.** The project messages interface opens and the project screen remains available for returning to the current context.
- **Oracle.** What the tester sees on the surrogate-bid-placed screen.
- **Trace.** P2 · draft · `GEN-SCR-359` · layer ui · coverage partial · typed: “screen surrogate-bid-placed (/project/TlhjY1hk/WGNRa2Rr)”

### GEN-SCR-360 — Project Details shows the project overview values

- **Why it matters.** Verify the overview identifiers, timestamp, and conditional tender value. Written from the master-qcs-live screen; grounded in R-FLA-018-1 (src/views/projectDetails/projectDetails.jsx:545-564); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/36-inventory-master-qcs-live.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Verify that the Created at value matches the project creation DATE_TIME..
- **Setup.** Use a project with refId 1100000401 and a known creation date. Enable is_show_under_open_events.
- **Steps.** 1. Click Project Details. 2. Inspect the overview section.
- **Expected.** Project ID shows #1100000401. Created at shows the project creation DATE_TIME. Open Tender Event shows Yes.
- **Oracle.** The screen behaves as R-FLA-018-1 says: Overview: "Project ID" = `#<refId>`, "Created at" = DATE_TIME, "Open Tender Event: Yes" only when config `is_show_under_open_events` — src/views/projectDetails/projectDetails.jsx:545-564
- **Trace.** P1 · draft · `GEN-SCR-360` · layer ui · coverage partial · typed: “screen master-qcs-live (/project/TlhjY1hk/master_qcs)”

### GEN-SCR-361 — Master QCS displays proposal status copy

- **Why it matters.** Verify that proposal statuses are converted to the expected user-facing labels. Written from the master-qcs-live screen; grounded in R-FLA-030-3 (src/views/projectDetails/constants.js:85-97); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/36-inventory-master-qcs-live.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Create or prepare distinct draft, requested, selected, and rejected proposals in the same Master QCS view; Verify that each status label is associated with the correct proposal rather than merely visible on the page.
- **Setup.** Use a Master QCS containing proposals with draft, requested, selected, and rejected statuses.
- **Steps.** 1. Click Master QCS. 2. Inspect the proposal status values.
- **Expected.** Draft proposals show Draft. Requested proposals show Approval in Progress. Selected proposals show PO Generated. Rejected proposals show Rejected.
- **Oracle.** The screen behaves as R-FLA-030-3 says: Proposal status copy: draft "Draft", requested "Approval in Progress", selected "PO Generated", rejected "Rejected" — src/views/projectDetails/constants.js:85-97
- **Trace.** P1 · draft · `GEN-SCR-361` · layer ui · coverage partial · typed: “screen master-qcs-live (/project/TlhjY1hk/master_qcs)”

### GEN-SCR-362 — Ask Clara handles an analyze-data task

- **Why it matters.** Verify the successful Clara analysis response and redirect. Written from the master-qcs-live screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/36-inventory-master-qcs-live.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Submitting the specific analyze-data task to Ask Clara; Verifying the exact returned redirect_url value.
- **Setup.** Use a project with an analyze_data Clara todo. Configure the action to return a valid redirect_url.
- **Steps.** 1. Click Ask Clara. 2. Wait for the action to complete.
- **Expected.** The message 'Awarding initiated successfully, redirecting to awarding flow...' appears, then the browser navigates to the returned redirect_url.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P0 · draft · `GEN-SCR-362` · layer ui · coverage partial · typed: “screen master-qcs-live (/project/TlhjY1hk/master_qcs)”

### GEN-SCR-363 — Copy controls copy the displayed value

- **Why it matters.** Verify both visible copy controls place their associated displayed value on the clipboard. Written from the master-qcs-live screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-create-erfx-mvhz1832/36-inventory-master-qcs-live.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Paste the clipboard value into a text editor.; Verify that the clipboard contains the associated displayed value for the Copy control.; Return from the text editor to the original screen.; Verify that the clipboard contains the associated displayed value for the icon: copy control..
- **Setup.** Open the screen with a visible value associated with each copy control. Use a text editor or clipboard inspector.
- **Steps.** 1. Click Copy. 2. Paste the clipboard value into the text editor. 3. Return to the screen. 4. Click icon: copy. 5. Paste the clipboard value into the text editor.
- **Expected.** Each control copies its associated displayed value without changing the page.
- **Oracle.** What the tester sees on the master-qcs-live screen.
- **Trace.** P2 · draft · `GEN-SCR-363` · layer ui · coverage none · typed: “screen master-qcs-live (/project/TlhjY1hk/master_qcs)”

### GEN-SCR-364 — Validate the required event title

- **Why it matters.** An empty event title must be identified as invalid before publishing. Written from the create-single-stage screen; grounded in R-FCR-025-1 (src/views/eventCreation/eventCreation.jsx:1741-1761); screenshot procol-ui-tests/evidence/walk-single-stage-mvhzoauq/02-inventory-create-single-stage.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The title field's red outline styling.
- **Setup.** Open a fresh single-stage event.
- **Steps.** 1. Click "Enter the title of this event". 2. Leave the field empty. 3. Click outside the field.
- **Expected.** The field shows a red outline for the title error.
- **Oracle.** The screen behaves as R-FCR-025-1 says: Event title input (placeholder "Enter the title of this event") only when not projectCreation; red outline on `errors.title` — src/views/eventCreation/eventCreation.jsx:1741-1761, src/translations/en.
- **Trace.** P1 · draft · `GEN-SCR-364` · layer ui · coverage partial · typed: “screen create-single-stage (/orders/quick-create)”

### GEN-SCR-365 — Accept a whitespace-only event title

- **Why it matters.** Whitespace-only titles pass the client-side truthiness check. Written from the create-single-stage screen; grounded in R-FCR-013-7 (src/views/projectCreation/projectCreation.jsx); screenshot procol-ui-tests/evidence/walk-single-stage-mvhzoauq/02-inventory-create-single-stage.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The complete title field validation state or styling beyond absence of the known "Please fill project title!" message..
- **Setup.** Open a fresh single-stage event.
- **Steps.** 1. Click "Enter the title of this event". 2. Enter one or more spaces. 3. Click outside the field.
- **Expected.** The title field does not show the empty-title validation state caused by a blank value.
- **Oracle.** The screen behaves as R-FCR-013-7 says: whitespace-only project title is accepted client-side; backend event_groups update has no title check (event-groups.md) — candidate API test with `title:" "`.
- **Trace.** P1 · draft · `GEN-SCR-365` · layer ui · coverage partial · typed: “screen create-single-stage (/orders/quick-create)”

### GEN-SCR-366 — Open participant selection

- **Why it matters.** The Participants button must open the audience selection experience. Written from the create-single-stage screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvhzoauq/02-inventory-create-single-stage.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the create-single-stage screen.
- **Steps.** 1. Click "Participants".
- **Expected.** The participant selection view opens. Vendor search and selection options are displayed there.
- **Oracle.** What the tester sees on the create-single-stage screen.
- **Trace.** P1 · draft · `GEN-SCR-366` · layer ui · coverage full · typed: “screen create-single-stage (/orders/quick-create)”

### GEN-SCR-367 — Check disabled schedule and terms controls

- **Why it matters.** Disabled controls must not respond to clicks and must remain visibly unavailable until their prerequisites are met. Written from the create-single-stage screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvhzoauq/02-inventory-create-single-stage.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the create-single-stage screen without completing the event.
- **Steps.** 1. Click "Terms & Conditions". 2. Click "Now - 04:48 pm, 21st Oct ( 30 Mins )". 3. Click "Publish Event".
- **Expected.** None of the three controls opens a dialog, changes the page, or performs an action. Each remains visibly disabled.
- **Oracle.** What the tester sees on the create-single-stage screen.
- **Trace.** P1 · draft · `GEN-SCR-367` · layer ui · coverage full · typed: “screen create-single-stage (/orders/quick-create)”

### GEN-SCR-368 — Show the missing-template reason for disabled publishing

- **Why it matters.** A non-RFP stage without a template must prevent publishing and explain the missing requirement. Written from the single-stage-configured-auction screen; grounded in R-FCR-016-2 (src/views/projectCreation/projectCreation.jsx:1457-1481); screenshot procol-ui-tests/evidence/walk-single-stage-mvhzoauq/04-inventory-single-stage-configured-auction.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open a fresh auction stage with no template selected.
- **Steps.** 1. Hover over "Publish Event". 2. Click "Select Templates". 3. Return to the event configuration without selecting a template. 4. Hover over "Publish Event" again.
- **Expected.** "Publish Event" remains disabled and its tooltip says "Please select template for <stage title>".
- **Oracle.** The screen behaves as R-FCR-016-2 says: Disabled with tooltip "Please select template for <stage title>" for any non-RFP stage without a template, or "Please add line items" — src/views/projectCreation/projectCreation.jsx:1457-1481
- **Trace.** P0 · draft · `GEN-SCR-368` · layer ui · coverage full · typed: “screen single-stage-configured-auction (/orders/quick-create)”

### GEN-SCR-369 — Open Clara

- **Why it matters.** The Clara control must open its assistant or summary experience. Written from the single-stage-configured-auction screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvhzoauq/04-inventory-single-stage-configured-auction.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The Clara panel's open state and the specific available summary or assistance content cannot be directly asserted with a catalog step..
- **Setup.** Open an event that has a Clara summary available.
- **Steps.** 1. Click "Ask Clara".
- **Expected.** The Clara panel opens and displays the event's available summary or assistance.
- **Oracle.** What the tester sees on the single-stage-configured-auction screen.
- **Trace.** P2 · draft · `GEN-SCR-369` · layer ui · coverage partial · typed: “screen single-stage-configured-auction (/orders/quick-create)”

### GEN-SCR-370 — Verify disabled scheduling and publishing controls

- **Why it matters.** The screen shows these controls as disabled and they must not perform actions until their prerequisites are met. Written from the single-stage-configured-auction screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-single-stage-mvhzoauq/04-inventory-single-stage-configured-auction.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the quick-create auction screen in its initial state.
- **Steps.** 1. Click "Savings". 2. Click "Terms & Conditions". 3. Click "Now - 04:48 pm, 21st Oct ( 30 Mins )". 4. Click "Publish Event".
- **Expected.** None of the four controls responds or opens a new experience because each is disabled.
- **Oracle.** What the tester sees on the single-stage-configured-auction screen.
- **Trace.** P1 · draft · `GEN-SCR-370` · layer ui · coverage full · typed: “screen single-stage-configured-auction (/orders/quick-create)”

### GEN-SCR-371 — Blank event title is rejected

- **Why it matters.** A title is required before the event can be published. Written from the single-stage-sheet screen; grounded in R-FCR-025-1 (src/views/eventCreation/eventCreation.jsx:1741-1761); screenshot procol-ui-tests/evidence/walk-single-stage-mvhzoauq/09-inventory-single-stage-sheet.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The title field's red outline styling cannot be asserted directly..
- **Setup.** Use valid line-item data and select at least one vendor.
- **Steps.** 1. Leave "Enter the title of this event" blank. 2. Click "Publish Event".
- **Expected.** "Enter the title of this event" receives a red outline because the title has an error. The event is not published.
- **Oracle.** The screen behaves as R-FCR-025-1 says: Event title input (placeholder "Enter the title of this event") only when not projectCreation; red outline on `errors.title` — src/views/eventCreation/eventCreation.jsx:1741-1761, src/translations/en.
- **Trace.** P0 · draft · `GEN-SCR-371` · layer ui · coverage partial · typed: “screen single-stage-sheet (/orders/quick-create)”

### GEN-SCR-372 — Publish confirmation shows the schedule-edit option

- **Why it matters.** Publishing must require confirmation and provide a way to return to schedule editing. Written from the single-stage-sheet screen; grounded in R-FCR-020-2 (src/views/eventCreation/components/footer/confirmModal.jsx:52-60); screenshot procol-ui-tests/evidence/walk-single-stage-mvhzoauq/09-inventory-single-stage-sheet.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Enter an event title longer than 45 characters, complete valid line-item data, and add at least one vendor.
- **Steps.** 1. Click "Publish Event". 2. Do not confirm the publish action.
- **Expected.** A confirmation dialog opens with "Publish Event" and the project title truncated to 45 characters. The dialog shows OK text "Publish" and Cancel text "Edit Schedule".
- **Oracle.** The screen behaves as R-FCR-020-2 says: Title: "Send to Auction Team" / project title truncated to 45 / "Publish Event"; OK text "Send to Auction Team" or "Publish"; Cancel is "Edit Schedule" and opens the schedule drawer — src/views/eventC
- **Trace.** P0 · draft · `GEN-SCR-372` · layer ui · coverage full · typed: “screen single-stage-sheet (/orders/quick-create)”

### GEN-SCR-373 — Schedule control opens the duration menu

- **Why it matters.** The schedule control must expose the configured duration choices and the default duration. Written from the single-stage-sheet screen; grounded in R-FCR-022-5 (src/views/projectCreation/components/projectScheduler/constants.js:1-1); screenshot procol-ui-tests/evidence/walk-single-stage-mvhzoauq/09-inventory-single-stage-sheet.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the quick-create screen with no custom duration configuration.
- **Steps.** 1. Click "Now - 04:49 pm, 21st Oct ( 30 Mins )".
- **Expected.** A duration menu opens. It includes the default duration choices 30 min, 1 h, 4 h, and 24 h.
- **Oracle.** The screen behaves as R-FCR-022-5 says: Duration menu = template `event_duration_predefined_values[mode].event_duration` or default 30 min, 1 h, 4 h, 24 h; switching to "Fixed time" presets now + 30 min — stageSchedulerCard.jsx:68-71, 213-2
- **Trace.** P1 · draft · `GEN-SCR-373` · layer ui · coverage full · typed: “screen single-stage-sheet (/orders/quick-create)”

### GEN-SCR-374 — Verify Published Stages columns and row value formatting

- **Why it matters.** Checks stage-column visibility and boundary values for missing references, participants, and dates. Written from the auction-live screen; grounded in R-FLA-026-1 (src/views/projectDetails/components/publishedStagesTable.jsx:31-99); screenshot procol-ui-tests/evidence/walk-single-stage-mvhzoauq/14-inventory-auction-live.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Compare rows with and without ref_id to conditionally show or omit Stage Code; Assert Participants values use active/total formatting for each row, including missing values rendered as 0; Assert missing Bidding Starts At and Bidding Ends At values render as '-' for specific rows.
- **Setup.** Use one stage row with ref_id, one row without ref_id, one row with missing participant counts, and rows with and without bidding dates.
- **Steps.** 1. Click "Published Stages". 2. Review the table headers. 3. Compare the rows with and without ref_id. 4. Review participant and date values.
- **Expected.** The table shows Stage Title, Pending Actions, Participants, Bidding Starts At, and Bidding Ends At. Stage Code is shown when at least one row has ref_id and is omitted when no row has ref_id. Participants show active/total, with missing values shown as 0. Missing dates show "-".
- **Oracle.** The screen behaves as R-FLA-026-1 says: Columns: Stage Code (dropped when no row has `ref_id`), Stage Title, Pending Actions, Participants "active/total" (missing → 0), Bidding Starts At / Ends At (DATE_TIME or "-") — src/views/projectDetai
- **Trace.** P1 · draft · `GEN-SCR-374` · layer ui · coverage partial · typed: “screen auction-live (/project/WFpYY1hk/details)”

### GEN-SCR-375 — Verify Line Items and Participants count tags

- **Why it matters.** Confirms the panel headers display counts derived from line-item and participant responses. Written from the auction-live screen; grounded in R-FLA-018-4 (src/views/projectDetails/projectDetails.jsx:916-946); screenshot procol-ui-tests/evidence/walk-single-stage-mvhzoauq/14-inventory-auction-live.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Reloading the project details screen with a second response; Verifying that the Line Items and Participants tags update to new response counts after reload.
- **Setup.** Prepare a project response containing one line item and 199 participants. Also prepare a second response with changed counts.
- **Steps.** 1. Open the project details screen. 2. Read the count tags on "Line Items 1" and "Participants 199". 3. Reload with the second response.
- **Expected.** The headers show the response counts, initially "Line Items 1" and "Participants 199", and update to the new counts after the response changes.
- **Oracle.** The screen behaves as R-FLA-018-4 says: Line Items / Participants panel headers show count tags from the line-item and participant responses — src/views/projectDetails/projectDetails.jsx:916-946, src/redux/project/selectors.js:867-876
- **Trace.** P1 · draft · `GEN-SCR-375` · layer ui · coverage partial · typed: “screen auction-live (/project/WFpYY1hk/details)”

### GEN-SCR-376 — Open a draft RFQ-to-auction stage with its draft event

- **Why it matters.** Verifies that selecting a draft RFQ-to-auction stage opens the create screen with the correct draft event context. Written from the auction-live screen; grounded in R-FLA-026-2 (src/views/projectDetails/components/publishedStagesTable.jsx:15-29); screenshot procol-ui-tests/evidence/walk-single-stage-mvhzoauq/14-inventory-auction-live.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Verify that the URL carries the specific recorded draft event ID value, because the case does not provide that dynamic ID.; Verify that no auction-team permission is required for the table action..
- **Setup.** Use a project containing a draft RFQ-to-auction stage whose displayed title is truncated as "spine-ui-automation-...". Record its draft event ID.
- **Steps.** 1. Click "Published Stages". 2. Click "spine-ui-automation-...". 3. Inspect the opened create screen and its request or URL parameters.
- **Expected.** The create screen opens for the draft stage and carries the recorded draft event ID as draftEventId. No auction-team permission is required for this table action.
- **Oracle.** The screen behaves as R-FLA-026-2 says: Clicking a draft rfq→auction stage opens the create screen with `draftEventId` (no auction-team check); other stages switch tab — src/views/projectDetails/components/publishedStagesTable.jsx:15-29
- **Trace.** P1 · draft · `GEN-SCR-376` · layer ui · coverage partial · typed: “screen auction-live (/project/WFpYY1hk/details)”

### GEN-SCR-377 — Load NFA history only when the feature flag is enabled

- **Why it matters.** Verifies the approval-history request is gated by the user flag and occurs after the project UUID is known. Written from the auction-live screen; grounded in R-FLA-017-2 (src/views/projectDetails/projectDetails.jsx:432-437); screenshot procol-ui-tests/evidence/walk-single-stage-mvhzoauq/14-inventory-auction-live.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Enable or disable the isNfaHistoryEnabled feature flag; Repeat the flow with the feature flag disabled and assert that the approvals-history request is absent.
- **Setup.** Use a project with a known UUID. Run once with isNfaHistoryEnabled enabled and once disabled. Capture network requests.
- **Steps.** 1. Select the "Project Details" tab. 2. Wait for the project details request to complete. 3. Review the network requests. 4. Repeat with isNfaHistoryEnabled disabled.
- **Expected.** With the flag enabled, the app sends one GET request to /event_groups/:id/get_approvals?lot_no= after the project UUID is known. With the flag disabled, that request is not sent.
- **Oracle.** The screen behaves as R-FLA-017-2 says: User flag `isNfaHistoryEnabled` → GET `/event_groups/:id/get_approvals?lot_no=` once the project uuid is known — src/views/projectDetails/projectDetails.jsx:432-437, src/redux/project/actions.js:315-3
- **Trace.** P1 · draft · `GEN-SCR-377` · layer ui · coverage partial · typed: “screen auction-live (/project/WFpYY1hk/details)”

### GEN-SCR-378 — Enable Save as draft after adding the required template and product

- **Why it matters.** The footer controls must remain unavailable until a template and at least one product exist. Written from the create-boq screen; grounded in R-FCR-024-2 (src/views/eventCreation/eventCreation.jsx:407-411); screenshot procol-ui-tests/evidence/walk-boq-mvhzuomd/02-inventory-create-boq.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the screen with no selected template and no uploaded BOQ product.
- **Steps.** 1. Verify that "Save as draft" is disabled. 2. Click "Select Templates" and select a valid BOQ template. 3. Click "Add Attachments" and upload a valid BOQ sheet containing at least one product.
- **Expected.** Initially, "Save as draft" is disabled and the screen shows "Please choose a template and upload a BOQ sheet to proceed". After the template and product are added, "Save as draft" becomes enabled.
- **Oracle.** The screen behaves as R-FCR-024-2 says: Footer buttons disabled until a template and at least one product exist (RFI: template data), tooltip " Please choose a template and add a product"; never disabled for RFP — src/views/eventCreation/ev
- **Trace.** P0 · draft · `GEN-SCR-378` · layer ui · coverage full · typed: “screen create-boq (/orders/quick-create)”

### GEN-SCR-379 — Open the BOQ upload flow

- **Why it matters.** The attachment control must provide a way to upload the BOQ sheet required by the screen. Written from the create-boq screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-boq-mvhzuomd/02-inventory-create-boq.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The specific attachment/file-upload control and BOQ sheet selection capability inside the opened interface.
- **Setup.** Open the create screen without an uploaded BOQ sheet.
- **Steps.** 1. Click "Add Attachments".
- **Expected.** The attachment or file-upload interface opens, allowing a BOQ sheet to be selected.
- **Oracle.** What the tester sees on the create-boq screen.
- **Trace.** P1 · draft · `GEN-SCR-379` · layer ui · coverage partial · typed: “screen create-boq (/orders/quick-create)”

### GEN-SCR-380 — Show the publish confirmation before publishing

- **Why it matters.** Publishing must require a confirmation step with the correct event title and actions. Written from the create-boq screen; grounded in R-FCR-020-2 (src/views/eventCreation/components/footer/confirmModal.jsx:52-60); screenshot procol-ui-tests/evidence/walk-boq-mvhzuomd/02-inventory-create-boq.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use a valid template and BOQ product, enter a project title of 45 characters or fewer, add a participant, and configure a non-recurring auction.
- **Steps.** 1. Click "Publish".
- **Expected.** A confirmation modal opens. Its title is "Publish Event". The modal shows the confirmation action text "Publish" and the cancel action text "Edit Schedule". Do not confirm publishing.
- **Oracle.** The screen behaves as R-FCR-020-2 says: Title: "Send to Auction Team" / project title truncated to 45 / "Publish Event"; OK text "Send to Auction Team" or "Publish"; Cancel is "Edit Schedule" and opens the schedule drawer — src/views/eventC
- **Trace.** P0 · draft · `GEN-SCR-380` · layer ui · coverage full · typed: “screen create-boq (/orders/quick-create)”

### GEN-SCR-381 — Render the Clara summary when Clara is disabled but a summary exists

- **Why it matters.** The Clara summary panel must render for a project with a claraSummary even when Clara is disabled. Written from the create-boq screen; grounded in R-FCR-011-5 (src/views/projectCreation/projectCreation.jsx:3405-3409); screenshot procol-ui-tests/evidence/walk-boq-mvhzuomd/02-inventory-create-boq.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Disable Clara for the test tenant; Verify that the displayed summary is the existing project summary.
- **Setup.** Load a project that has a claraSummary and has Clara disabled.
- **Steps.** 1. Open the create screen. 2. Click "Ask Clara".
- **Expected.** The Clara summary panel renders and displays the existing project summary.
- **Oracle.** The screen behaves as R-FCR-011-5 says: Clara summary panel renders when `isClaraEnabled` is FALSE and the project has a claraSummary (FE-15.2 states the inverse) — src/views/projectCreation/projectCreation.jsx:3405-3409
- **Trace.** P1 · draft · `GEN-SCR-381` · layer ui · coverage none · typed: “screen create-boq (/orders/quick-create)”

### GEN-SCR-382 — Upload Sheet opens the sheet upload flow

- **Why it matters.** Verifies that the sheet upload control opens its upload interface. Written from the boq-template-selected screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-boq-mvhzuomd/06-inventory-boq-template-selected.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Remain on the boq-template-selected screen.
- **Steps.** 1. Click Upload Sheet.
- **Expected.** The sheet upload interface opens and allows the tester to choose a sheet for upload.
- **Oracle.** What the tester sees on the boq-template-selected screen.
- **Trace.** P1 · draft · `GEN-SCR-382` · layer ui · coverage full · typed: “screen boq-template-selected (/orders/quick-create)”

### GEN-SCR-383 — Add New creates a line-item row with required columns

- **Why it matters.** Verifies that a new BOQ line can be added and that required columns remain present. Written from the boq-template-selected screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/walk-boq-mvhzuomd/06-inventory-boq-template-selected.png. **Draft, needs review** — written by the assistant on 2026-10-21 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Whether Product, Quantity Requested, Price, Total Amount, and Total Amount after GST are marked required..
- **Setup.** Open the BOQ with no additional unsaved line-item row.
- **Steps.** 1. Click Add New.
- **Expected.** A new line-item row appears. Product, Quantity Requested, Price, Total Amount, and Total Amount after GST are present and marked required.
- **Oracle.** What the tester sees on the boq-template-selected screen.
- **Trace.** P1 · draft · `GEN-SCR-383` · layer ui · coverage partial · typed: “screen boq-template-selected (/orders/quick-create)”

