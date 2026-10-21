# Generated test cases — drafts (2026-10-12)

Every case below was written by the spine.ai assistant when someone typed a test case that no existing case covered.
They are DRAFTS: nothing here is in the catalog until a person reviews it and moves it into a catalog file
(the importer does not read `generated-*.md`, and `GEN-` ids are not parsed).

## 1. Drafts from the assistant

### GEN-SCR-001 — Publish without a project title

- **Why it matters.** Verify that the project title is validated before publishing. Written from the create-erfx screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/inv-create-erfx-mv5rqa96/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use a project with a template, at least one line item, and at least one participant. Leave the project title empty.
- **Steps.** 1. Leave "Enter the title of the project" empty. 2. Click "Publish".
- **Expected.** The project is not published. The message "Please fill project title!" appears.
- **Oracle.** What the tester sees on the create-erfx screen.
- **Trace.** P0 · draft · `GEN-SCR-001` · layer ui · coverage full · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-002 — Save as draft is gated by a template and product

- **Why it matters.** Verify the disabled draft-save control and the conditions that enable it. Written from the create-erfx screen; grounded in R-FCR-024-2 (src/views/eventCreation/eventCreation.jsx:407-411); screenshot procol-ui-tests/evidence/inv-create-erfx-mv5rqa96/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the screen with no selected template and no line items.
- **Steps.** 1. Hover over "Save as draft". 2. Verify that it is disabled. 3. Click "Select Templates" and select a template. 4. Click "Items 0" and add one product. 5. Return to the project header.
- **Expected.** While the template or product is missing, "Save as draft" remains disabled and shows the tooltip " Please choose a template and add a product". After both exist, "Save as draft" is enabled.
- **Oracle.** The screen behaves as R-FCR-024-2 says: Footer buttons disabled until a template and at least one product exist (RFI: template data), tooltip " Please choose a template and add a product"; never disabled for RFP — src/views/eventCreation/ev
- **Trace.** P1 · draft · `GEN-SCR-002` · layer ui · coverage full · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-003 — Vendor selector explains why it is disabled

- **Why it matters.** Verify the non-RFP participant selector is blocked until the stage has a template and line items. Written from the create-erfx screen; grounded in R-FCR-016-2 (src/views/projectCreation/projectCreation.jsx:1457-1481); screenshot procol-ui-tests/evidence/inv-create-erfx-mv5rqa96/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Before setup, observe that "Search vendors you want to add" is disabled.; Before setup, hover "Search vendors you want to add" and verify the tooltip "Please select template for Auction"..
- **Setup.** Open the Auction screen without a selected template or line items.
- **Steps.** 1. Hover over "Search vendors you want to add". 2. Select a template using "Select Templates". 3. Add one product using "Items 0". 4. Return to the participant area.
- **Expected.** Before setup is complete, "Search vendors you want to add" is disabled and shows "Please select template for Auction". After a template and line item exist, the selector is enabled.
- **Oracle.** The screen behaves as R-FCR-016-2 says: Disabled with tooltip "Please select template for <stage title>" for any non-RFP stage without a template, or "Please add line items" — src/views/projectCreation/projectCreation.jsx:1457-1481
- **Trace.** P1 · draft · `GEN-SCR-003` · layer ui · coverage partial · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-004 — Open the template picker

- **Why it matters.** Verify that the template action opens the template-selection interface. Written from the create-erfx screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/inv-create-erfx-mv5rqa96/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the create eRFX screen.
- **Steps.** 1. Click "Select Templates".
- **Expected.** The template picker opens and displays available templates for selection.
- **Oracle.** What the tester sees on the create-erfx screen.
- **Trace.** P1 · draft · `GEN-SCR-004` · layer ui · coverage full · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-005 — Open manage line items from Items 0

- **Why it matters.** Verify that the empty line-item control opens line-item management. Written from the create-erfx screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/inv-create-erfx-mv5rqa96/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the create eRFX screen with no line items.
- **Steps.** 1. Click "Items 0".
- **Expected.** The manage line items section opens and shows that no line items have been added.
- **Oracle.** What the tester sees on the create-erfx screen.
- **Trace.** P1 · draft · `GEN-SCR-005` · layer ui · coverage full · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-006 — Publish is refused when no participants exist

- **Why it matters.** Verify the project-wide participant gate. Written from the create-erfx screen; grounded in R-FCR-017-1 (src/views/projectCreation/projectCreation.jsx:1604-1609); screenshot procol-ui-tests/evidence/inv-create-erfx-mv5rqa96/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use a project with a title, selected template, line items, and no participants.
- **Steps.** 1. Verify that "Enter the title of the project" contains a title. 2. Click "Publish".
- **Expected.** Publishing stops and the message "Please add participants to proceed!" appears.
- **Oracle.** The screen behaves as R-FCR-017-1 says: No participant in the project → "Please add participants to proceed!" (stops) — src/views/projectCreation/projectCreation.jsx:1604-1609
- **Trace.** P0 · draft · `GEN-SCR-006` · layer ui · coverage full · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-007 — Publish is refused when evaluators are missing

- **Why it matters.** Verify that publishing checks for an evaluator in the Technical Stage. Written from the create-erfx screen; grounded in R-FCR-041-4 (src/views/projectCreation/helpers.js:320-339); screenshot procol-ui-tests/evidence/inv-create-erfx-mv5rqa96/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use a valid project with a title, template, line items, and participants, but leave the Technical Stage without an evaluator.
- **Steps.** 1. Verify that "Enter the title of the project" contains a title. 2. Click "Publish".
- **Expected.** Publishing stops and the message "Please add Evaluator in the Technical Stage" appears.
- **Oracle.** The screen behaves as R-FCR-041-4 says: Lot: global section (or every form section) must have an evaluator → "Please add Evaluator in the Technical Stage"; line: every item section → "Please add Evaluator to all the line items in the Techni
- **Trace.** P0 · draft · `GEN-SCR-007` · layer ui · coverage full · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-008 — Publish confirmation shows the correct actions

- **Why it matters.** Verify the confirmation modal and its available next actions. Written from the create-erfx screen; grounded in R-FCR-020-2 (src/views/eventCreation/components/footer/confirmModal.jsx:52-60); screenshot procol-ui-tests/evidence/inv-create-erfx-mv5rqa96/02-inventory-create-erfx.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog cannot independently verify that no event was published while leaving the confirmation modal open; this is inferred from not confirming the modal.; The catalog cannot assert the truncation length numerically, only the visible truncated prefix and absence of the full title..
- **Setup.** Use a valid project with a title, template, line items, participants, and evaluators. Configure the event so it is not routed to the auction team.
- **Steps.** 1. Click "Publish". 2. Do not confirm the publish action.
- **Expected.** A confirmation modal opens with the title "Publish Event". The project title is truncated to 45 characters when necessary. The confirmation action is "Publish" and the cancel action is "Edit Schedule". No event is published.
- **Oracle.** The screen behaves as R-FCR-020-2 says: Title: "Send to Auction Team" / project title truncated to 45 / "Publish Event"; OK text "Send to Auction Team" or "Publish"; Cancel is "Edit Schedule" and opens the schedule drawer — src/views/eventC
- **Trace.** P0 · draft · `GEN-SCR-008` · layer ui · coverage partial · typed: “screen create-erfx (/orders/quick-create)”

### GEN-SCR-009 — Open Clara with populated line items

- **Why it matters.** Verify the AI RFP flow is available only when project line items exist. Written from the create-erfx-filled screen; grounded in R-FCR-042-4 (src/views/eventCreation/components/aiRfpGenerator/api.js:3-11); screenshot procol-ui-tests/evidence/inv-create-erfx-filled-mv5rqzae/05-inventory-create-erfx-filled.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Whether the Clara AI RFP experience actually opens after clicking Ask Clara; Whether Clara can use the existing project line items to start an RFP question request.
- **Setup.** Open the filled eRFX creation screen with the two existing line items.
- **Steps.** 1. Click "Items 2" and confirm the line items are present. 2. Click "Ask Clara".
- **Expected.** The Clara AI RFP experience opens and can use the existing project line items to start the RFP question request.
- **Oracle.** The screen behaves as R-FCR-042-4 says: AI RFP → `POST /ask_ai_chats/rfp_questions`, then `GET /external_requests/:uuid`; the AI button needs project line items — src/views/eventCreation/components/aiRfpGenerator/api.js:3-11, src/views/even
- **Trace.** P1 · draft · `GEN-SCR-009` · layer ui · coverage partial · typed: “screen create-erfx-filled (/orders/quick-create)”

### GEN-SCR-010 — Show the publish confirmation with the truncated project title

- **Why it matters.** Verify the publish confirmation uses the expected title, project-title truncation, and actions. Written from the create-erfx-filled screen; grounded in R-FCR-020-2 (src/views/eventCreation/components/footer/confirmModal.jsx:52-60); screenshot procol-ui-tests/evidence/inv-create-erfx-filled-mv5rqzae/05-inventory-create-erfx-filled.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog cannot directly assert that the rendered truncated title is exactly 45 characters; it checks the expected 45-character prefix and that the full title is absent within the modal instead..
- **Setup.** Add at least one participant and enter a project title longer than 45 characters. Use a normal non-recurring event routed for direct publishing.
- **Steps.** 1. Click "Publish".
- **Expected.** A confirmation modal opens with the title "Publish Event". The project title is truncated to 45 characters. The confirmation action reads "Publish" and the cancel action reads "Edit Schedule".
- **Oracle.** The screen behaves as R-FCR-020-2 says: Title: "Send to Auction Team" / project title truncated to 45 / "Publish Event"; OK text "Send to Auction Team" or "Publish"; Cancel is "Edit Schedule" and opens the schedule drawer — src/views/eventC
- **Trace.** P0 · draft · `GEN-SCR-010` · layer ui · coverage partial · typed: “screen create-erfx-filled (/orders/quick-create)”

### GEN-SCR-011 — Include terms_and_conditions when saving without T&Cs

- **Why it matters.** Verify the save request always contains the terms_and_conditions object even when no T&Cs were added. Written from the create-erfx-filled screen; grounded in R-FCR-008-3 (src/redux/project/actions.js:71-82); screenshot procol-ui-tests/evidence/inv-create-erfx-filled-mv5rqzae/05-inventory-create-erfx-filled.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: compiled without a model, so this is a generic plan rather than this case.
- **Setup.** Do not add any terms or conditions. Open browser network tools and prepare a new draft with valid required line-item data.
- **Steps.** 1. Click "Save as draft". 2. Inspect the request body sent for the save.
- **Expected.** The request contains a terms_and_conditions object. Its clauses are undefined or absent as applicable, and attachments is an empty array.
- **Oracle.** The screen behaves as R-FCR-008-3 says: `terms_and_conditions` is ALWAYS present in the body, even when the caller passed no T&C (clauses undefined, attachments value []) — src/redux/project/actions.js:71-82
- **Trace.** P1 · draft · `GEN-SCR-011` · layer ui · coverage partial · typed: “screen create-erfx-filled (/orders/quick-create)”

### GEN-SCR-012 — Exclude blacklisted vendors and preselect tagged vendors

- **Why it matters.** Verify vendor suggestions respect blacklist status and automatic audience tags. Written from the create-erfx-filled screen; grounded in R-FCR-035-2 (src/views/eventCreation/components/participants/participantsSelection.jsx:226-280); screenshot procol-ui-tests/evidence/inv-create-erfx-filled-mv5rqzae/05-inventory-create-erfx-filled.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Assert that blacklisted vendors are absent from the suggested vendor list.; Assert that the tagged, non-blacklisted vendor is already selected when the audience loads.; Verify the vendor audience state against blacklist and product-tag data..
- **Setup.** Use a product whose audience contains at least one blacklisted vendor and one tagged, non-blacklisted vendor.
- **Steps.** 1. Open "Participants". 2. Open "Search vendors you want to add". 3. Review the suggested vendor list.
- **Expected.** Blacklisted vendors are not suggested. The tagged, non-blacklisted vendor is already selected when the product audience loads.
- **Oracle.** The screen behaves as R-FCR-035-2 says: Blacklisted vendors are never suggested; tagged (auto-generated tag) non-blacklisted vendors are pre-selected when the product audience loads — src/views/eventCreation/components/participants/particip
- **Trace.** P1 · draft · `GEN-SCR-012` · layer ui · coverage partial · typed: “screen create-erfx-filled (/orders/quick-create)”

### GEN-SCR-013 — Warn before changing the selected template

- **Why it matters.** Verify changing an existing template warns that current data will be reset. Written from the create-erfx-filled screen; grounded in R-FCR-026-4 (src/views/eventCreation/templateSelection.jsx:349-360); screenshot procol-ui-tests/evidence/inv-create-erfx-filled-mv5rqzae/05-inventory-create-erfx-filled.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Select a specifically different available template because the case does not provide a template name and the catalog cannot assert that the second selection differs from the first..
- **Setup.** Open the screen with an existing template selected and populated line-item data.
- **Steps.** 1. Click "Buy Template". 2. Select a different available template.
- **Expected.** A warning appears with the exact text "Changing template will reset data. Are you sure?". The confirmation action reads "Yes".
- **Oracle.** The screen behaves as R-FCR-026-4 says: Changing an existing template asks "Do you really want to change the template?" (project) / "Changing template will reset data. Are you sure?" (quick-create), OK "Yes" — templateSelection.jsx:349-360,
- **Trace.** P1 · draft · `GEN-SCR-013` · layer ui · coverage partial · typed: “screen create-erfx-filled (/orders/quick-create)”

### GEN-SCR-014 — Prevent saving when required line-item values are empty

- **Why it matters.** Verify the required markers shown on the line-item columns are enforced during save. Written from the create-erfx-filled screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/inv-create-erfx-filled-mv5rqzae/05-inventory-create-erfx-filled.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Clear Product, Product Variant, Quantity Requested, Delivery location, Price, Quantity Available, and Total Amount for one line item.; Click Save as draft after clearing those grid cells and verify that the draft is not saved.; Assert validation appears for each cleared required column.; Assert GST is not treated as required.; Observe the line-item drawer remaining open after the refused save..
- **Setup.** Open the filled screen and keep the two line items available for editing.
- **Steps.** 1. Open "Items 2". 2. Clear the values in "Product", "Product Variant", "Quantity Requested", "Delivery location", "Price", "Quantity Available", and "Total Amount" for one line item. 3. Click "Save as draft".
- **Expected.** The draft is not saved. Validation appears for the cleared required columns. "GST" is not treated as required.
- **Oracle.** What the tester sees on the create-erfx-filled screen.
- **Trace.** P0 · draft · `GEN-SCR-014` · layer ui · coverage none · typed: “screen create-erfx-filled (/orders/quick-create)”

### GEN-SCR-015 — Ask Clara opens the Clara assistant

- **Why it matters.** Users need access to the Clara assistant from the events list. Written from the events-list screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/inv-events-list-mv5rrrez/02-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the events list.
- **Steps.** 1. Click "Ask Clara".
- **Expected.** The Clara assistant opens without leaving the events list.
- **Oracle.** What the tester sees on the events-list screen.
- **Trace.** P1 · draft · `GEN-SCR-015` · layer ui · coverage full · typed: “screen events-list (/orders)”

### GEN-SCR-016 — Drafts and Recurring show their defined empty states

- **Why it matters.** Users need clear feedback when these event categories contain no cards. Written from the events-list screen; grounded in R-FLA-004-4 (src/views/orders/components/projectTable.jsx:699-708); screenshot procol-ui-tests/evidence/inv-events-list-mv5rrrez/02-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use an account with no draft events and no recurring events.
- **Steps.** 1. Click "DRAFTS174". 2. Verify the empty state. 3. Click "RECURRING". 4. Verify the empty state.
- **Expected.** Drafts shows "No Drafts Found". Recurring shows "No Recurring Events Found".
- **Oracle.** The screen behaves as R-FLA-004-4 says: Empty states: filtered → "no result" copy; Drafts → "No Drafts Found"; Recurring → "No Recurring Events Found" — src/views/orders/components/projectTable.jsx:699-708, 914-920, 965-971
- **Trace.** P1 · draft · `GEN-SCR-016` · layer ui · coverage full · typed: “screen events-list (/orders)”

### GEN-SCR-017 — Reference ID appears in the search placeholder when enabled

- **Why it matters.** Users must know that the search supports reference IDs when that capability is enabled. Written from the events-list screen; grounded in R-FLA-014-3 (src/views/orders/components/filters.jsx:84-110); screenshot procol-ui-tests/evidence/inv-events-list-mv5rrrez/02-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Use an account with showReferenceId enabled.
- **Steps.** 1. Open the events list. 2. Inspect the empty "Search Title" field.
- **Expected.** The placeholder includes "or reference id" in addition to the title-search text.
- **Oracle.** The screen behaves as R-FLA-014-3 says: Title filter placeholder adds "or reference id" when user `showReferenceId` — src/views/orders/components/filters.jsx:84-110
- **Trace.** P1 · draft · `GEN-SCR-017` · layer ui · coverage full · typed: “screen events-list (/orders)”

### GEN-SCR-018 — Date range fields remain unavailable while disabled

- **Why it matters.** Disabled filters must not accept input or appear usable. Written from the events-list screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/inv-events-list-mv5rrrez/02-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the events list and wait for the screen to finish loading.
- **Steps.** 1. Inspect "Starting from" and "Ending at". 2. Click "Starting from". 3. Click "Ending at". 4. Try to enter a date in each field.
- **Expected.** Both fields remain visibly disabled, do not open a date picker, and do not accept entered dates.
- **Oracle.** What the tester sees on the events-list screen.
- **Trace.** P1 · draft · `GEN-SCR-018` · layer ui · coverage full · typed: “screen events-list (/orders)”

### GEN-SCR-019 — Event cards show the required header and status details

- **Why it matters.** Card metadata helps buyers identify the event owner, reference, item count, hold state, and Clara-created status. Written from the events-list screen; grounded in R-FLA-010-1 (src/views/orders/components/projectCard/projectCard.jsx:262-297); screenshot procol-ui-tests/evidence/inv-events-list-mv5rrrez/02-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The creator name returned by the API is not specified and has no dedicated assertion.; The project reference ID returned by the API is not specified and has no dedicated assertion.; The exact API-derived item count in the N item(s) label cannot be asserted without the expected number.; The red visual styling of the Hold tag cannot be asserted; only its text can be checked..
- **Setup.** Use an account with a live event whose data includes a creator name, projectRefId, lineItemCount greater than zero, isProjectOnHold true, and isAutoCreated true.
- **Steps.** 1. Click "LIVE7899". 2. Inspect the event card header.
- **Expected.** The card shows the creator name, project reference ID, "N item(s)", a red "Hold" tag, and an "Auto created" Clara tag.
- **Oracle.** The screen behaves as R-FLA-010-1 says: Header shows creator name, `projectRefId`, "N item(s)" when `lineItemCount` > 0, red "Hold" tag when `isProjectOnHold`, "Auto created" Clara tag when `isAutoCreated` — src/views/orders/components/proj
- **Trace.** P1 · draft · `GEN-SCR-019` · layer ui · coverage partial · typed: “screen events-list (/orders)”

### GEN-SCR-020 — Recurring card shows frequency, invited count, and status

- **Why it matters.** Recurring-event users need its schedule, audience size, and current state on the card. Written from the events-list screen; grounded in R-FLA-012-4 (src/views/orders/components/projectCard/projectCard.jsx:318-337); screenshot procol-ui-tests/evidence/inv-events-list-mv5rrrez/02-inventory-events-list.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The expected dynamic scheduleDisplayText value cannot be asserted because no value is provided and no catalog step reads the recurring schedule label.; The exact invited participant count cannot be asserted because no expected count is provided and no catalog step exposes the card's participant-count tooltip/value.; The card's status cannot be asserted as the matching Active, Paused, or Cancelled value for the specific recurring event..
- **Setup.** Use an account with a recurring event containing scheduleDisplayText, an invited count, and a status of Active, Paused, or Cancelled.
- **Steps.** 1. Click "RECURRING". 2. Inspect the recurring event card.
- **Expected.** The card shows "Frequency <scheduleDisplayText>", the invited count, and the matching "Active", "Paused", or "Cancelled" status tag.
- **Oracle.** The screen behaves as R-FLA-012-4 says: Recurring card shows "Frequency <scheduleDisplayText or ->", invited count, and status tag Active/Paused/Cancelled — src/views/orders/components/projectCard/projectCard.jsx:318-337, 421-439
- **Trace.** P1 · draft · `GEN-SCR-020` · layer ui · coverage partial · typed: “screen events-list (/orders)”

### GEN-SCR-021 — Published Stages handles missing stage data and hides Stage Code when no ref_id exists

- **Why it matters.** Verifies fallback values and conditional column visibility in the Published Stages table. Written from the project-live screen; grounded in R-FLA-026-1 (src/views/projectDetails/components/publishedStagesTable.jsx:31-99); screenshot procol-ui-tests/evidence/inv-project-live-mv5rslcn/02-inventory-project-live.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: unconfirmed label "0/0" (expect_text) — not among the labels known from the app nor in the case; unconfirmed label "-" (expect_count) — not among the labels known from the app nor in the case.
- **Setup.** Use a project with at least one published stage. Ensure no stage has ref_id, one stage has no participant totals, and one or more bidding dates are absent.
- **Steps.** 1. Open the Project Details screen. 2. Inspect the Published Stages table. 3. Check the table headers and the stage row values.
- **Expected.** The Stage Code column is not shown. Participants display active/total with missing values treated as 0. Missing Bidding Starts At or Bidding Ends At values display as '-'. Stage Title and Pending Actions remain visible.
- **Oracle.** The screen behaves as R-FLA-026-1 says: Columns: Stage Code (dropped when no row has `ref_id`), Stage Title, Pending Actions, Participants "active/total" (missing → 0), Bidding Starts At / Ends At (DATE_TIME or "-") — src/views/projectDetai
- **Trace.** P1 · draft · `GEN-SCR-021` · layer ui · coverage partial · typed: “screen project-live (/project/ZFhOY1hj/details)”

### GEN-SCR-022 — Line Items and Participants headers show response counts

- **Why it matters.** Confirms that panel header count tags come from the corresponding response counts. Written from the project-live screen; grounded in R-FLA-018-4 (src/views/projectDetails/projectDetails.jsx:916-946); screenshot procol-ui-tests/evidence/inv-project-live-mv5rslcn/02-inventory-project-live.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog has no dedicated assertion that verifies a numeric count is semantically attached to a specific panel header if the UI formats the header differently than the asserted text..
- **Setup.** Use a project whose line-item response contains three line items and whose participant response contains two participants.
- **Steps.** 1. Open the Project Details screen. 2. Inspect the Line Items and Participants panel headers.
- **Expected.** The Line Items header shows a count of 3 and the Participants header shows a count of 2.
- **Oracle.** The screen behaves as R-FLA-018-4 says: Line Items / Participants panel headers show count tags from the line-item and participant responses — src/views/projectDetails/projectDetails.jsx:916-946, src/redux/project/selectors.js:867-876
- **Trace.** P1 · draft · `GEN-SCR-022` · layer ui · coverage partial · typed: “screen project-live (/project/ZFhOY1hj/details)”

### GEN-SCR-023 — Participant search waits for the debounce interval and limits results to 20 rows

- **Why it matters.** Checks participant search timing and result pagination. Written from the project-live screen; grounded in R-FLA-024-5 (src/views/projectDetails/components/participantsTable.jsx:265-267); screenshot procol-ui-tests/evidence/inv-project-live-mv5rslcn/02-inventory-project-live.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The search term is not specified, so the search cannot be executed against the intended participant.; The requirement to continue typing before 300 milliseconds and wait 300 milliseconds after the final keystroke cannot be expressed.; The requirement that exactly one search request is issued after the final keystroke cannot be expressed because expect_request does not assert request count or debounce timing.; That the displayed participants specifically match the intended search term cannot be verified without the term..
- **Setup.** Use a project with more than 20 participants, including several whose names contain the same search term.
- **Steps.** 1. Enter the search term in Search participants. 2. Continue typing before 300 milliseconds elapse. 3. Wait at least 300 milliseconds after the final keystroke. 4. Inspect the participant results.
- **Expected.** Only one search is issued after the final keystroke. Matching participants are shown, with no more than 20 rows on the page.
- **Oracle.** The screen behaves as R-FLA-024-5 says: Search debounced 300 ms; page size 20; proposal page reuses this table without the reject option — src/views/projectDetails/components/participantsTable.jsx:265-267, 397, src/views/projectProposal/pro
- **Trace.** P1 · draft · `GEN-SCR-023` · layer ui · coverage partial · typed: “screen project-live (/project/ZFhOY1hj/details)”

### GEN-SCR-024 — Search line items filters the displayed line items

- **Why it matters.** Verifies the visible line-item search control filters the table without changing unrelated project panels. Written from the project-live screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/inv-project-live-mv5rslcn/02-inventory-project-live.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The case's dynamically chosen distinctive part of one line-item name cannot be read from the table and reused as the Search line items value.; The catalog cannot assert that every displayed row matches the entered term or identify the exact expected matching row when product names are not supplied..
- **Setup.** Use a project with at least two line items having different names.
- **Steps.** 1. Enter a distinctive part of one line item name in Search line items. 2. Inspect the line-item table. 3. Clear Search line items.
- **Expected.** While the term is entered, only matching line items are shown. After clearing the field, the line-item list returns.
- **Oracle.** What the tester sees on the project-live screen.
- **Trace.** P1 · draft · `GEN-SCR-024` · layer ui · coverage partial · typed: “screen project-live (/project/ZFhOY1hj/details)”

### GEN-SCR-025 — Draft RFQ-to-auction stage opens the create screen with its draft event

- **Why it matters.** Verifies the published-stages navigation path for a draft RFQ-to-auction stage. Written from the project-live screen; grounded in R-FLA-026-2 (src/views/projectDetails/components/publishedStagesTable.jsx:15-29); screenshot procol-ui-tests/evidence/inv-project-live-mv5rslcn/02-inventory-project-live.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Exact draftEventId carried in route state when it is not encoded in the URL; Whether the auction-team permission check specifically allowed navigation, beyond observing that navigation succeeded.
- **Setup.** Use a live project containing a draft RFQ-to-auction stage. Ensure the stage is represented by the RFQ control.
- **Steps.** 1. Click RFQ. 2. Inspect the destination screen and its URL or route state.
- **Expected.** The create screen opens for the draft stage, carrying the stage's draftEventId. The auction-team permission check does not block the navigation.
- **Oracle.** The screen behaves as R-FLA-026-2 says: Clicking a draft rfq→auction stage opens the create screen with `draftEventId` (no auction-team check); other stages switch tab — src/views/projectDetails/components/publishedStagesTable.jsx:15-29
- **Trace.** P0 · draft · `GEN-SCR-025` · layer ui · coverage partial · typed: “screen project-live (/project/ZFhOY1hj/details)”

### GEN-SCR-026 — Long or withdrawn stage tabs show the required title treatment

- **Why it matters.** Checks truncation, tooltip behavior, and the withdrawn tag on stage tabs. Written from the project-live screen; grounded in R-FLA-016-4 (src/views/projectDetails/projectTabs.jsx:112-135); screenshot procol-ui-tests/evidence/inv-project-live-mv5rslcn/02-inventory-project-live.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — A fixture or action to provide a long custom RFQ stage title; An assertion that the displayed RFQ tab title is 20 characters or fewer; Hovering the unknown truncated tab title and asserting that its tooltip contains the full title; A stage-level withdrawn state and its association with the RFQ tab.
- **Setup.** Use a project with an RFQ stage whose title is longer than 20 characters and mark that stage withdrawn.
- **Steps.** 1. Inspect the RFQ stage tab. 2. Hover over the truncated tab title.
- **Expected.** The displayed tab title is truncated to 20 characters or fewer. A tooltip shows the full title. The withdrawn stage carries a Withdrawn tag.
- **Oracle.** The screen behaves as R-FLA-016-4 says: Tab titles truncated to 20 chars with tooltip; withdrawn (`in_active`) stages carry a "Withdrawn" tag — src/views/projectDetails/projectTabs.jsx:112-135, 173-175
- **Trace.** P1 · draft · `GEN-SCR-026` · layer ui · coverage none · typed: “screen project-live (/project/ZFhOY1hj/details)”

### GEN-SCR-027 — Messages opens the project messaging view

- **Why it matters.** Verifies the destination opened by the visible project messaging action. Written from the project-live screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/inv-project-live-mv5rslcn/02-inventory-project-live.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Assert that the displayed messaging content is associated with this specific project or thread; Dedicated assertion that the project messaging view or drawer opened successfully.
- **Setup.** Use the live project shown on this screen.
- **Steps.** 1. Click Messages. 2. Inspect the resulting view.
- **Expected.** The project's messaging view or drawer opens, and the tester can see messaging content associated with this project.
- **Oracle.** What the tester sees on the project-live screen.
- **Trace.** P1 · draft · `GEN-SCR-027` · layer ui · coverage partial · typed: “screen project-live (/project/ZFhOY1hj/details)”

### GEN-SCR-028 — Ask Clara opens the Clara interaction

- **Why it matters.** Verifies the visible Clara action opens its interaction rather than changing the project state immediately. Written from the project-live screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/inv-project-live-mv5rslcn/02-inventory-project-live.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact Clara interaction panel or page cannot be asserted because its rendered name and route are not defined in the catalog.; That no project stage, line item, or participant changed cannot be fully verified for all data; only selected known controls can be compared..
- **Setup.** Use the live project shown on this screen.
- **Steps.** 1. Click Ask Clara. 2. Inspect the resulting panel or page.
- **Expected.** The Clara interaction opens for the current project. No project stage, line item, or participant is changed merely by opening it.
- **Oracle.** What the tester sees on the project-live screen.
- **Trace.** P1 · draft · `GEN-SCR-028` · layer ui · coverage partial · typed: “screen project-live (/project/ZFhOY1hj/details)”

### GEN-SCR-029 — Participants panel displays response count tags

- **Why it matters.** Confirms that the panel headers expose the line-item and participant response counts. Written from the participants-live screen; grounded in R-FLA-018-4 (src/views/projectDetails/projectDetails.jsx:916-946); screenshot procol-ui-tests/evidence/inv-participants-live-mv5rt1bh/02-inventory-participants-live.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Assert the numeric count tags on the Line Items and Participants headers; Verify that each header count matches its corresponding response count.
- **Setup.** Use a project with known line-item and participant response counts.
- **Steps.** 1. Click the "Participants" tab. 2. Inspect the Line Items and Participants panel headers.
- **Expected.** The Line Items and Participants headers each show a count tag matching the corresponding response count.
- **Oracle.** The screen behaves as R-FLA-018-4 says: Line Items / Participants panel headers show count tags from the line-item and participant responses — src/views/projectDetails/projectDetails.jsx:916-946, src/redux/project/selectors.js:867-876
- **Trace.** P1 · draft · `GEN-SCR-029` · layer ui · coverage partial · typed: “screen participants-live (/project/ZFhOY1hj/REREa1hY)”

### GEN-SCR-030 — Participant search waits for the debounce interval and limits results

- **Why it matters.** Verifies the search debounce and participant page-size boundary. Written from the participants-live screen; grounded in R-FLA-024-5 (src/views/projectDetails/components/participantsTable.jsx:265-267); screenshot procol-ui-tests/evidence/inv-participants-live-mv5rt1bh/02-inventory-participants-live.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Typing additional characters before 300 milliseconds have elapsed; Waiting at least 300 milliseconds and verifying that the search executes only after the final input is idle; Verifying that intermediate keystrokes did not trigger searches.
- **Setup.** Use a project with more than 20 matching vendors.
- **Steps.** 1. Enter a vendor name in "Search vendors". 2. Continue typing before 300 milliseconds have elapsed. 3. Stop typing. 4. Wait at least 300 milliseconds. 5. Count the displayed vendor rows.
- **Expected.** The table does not search for every intermediate keystroke. It searches after the final input has been idle for at least 300 milliseconds and displays no more than 20 results on the page.
- **Oracle.** The screen behaves as R-FLA-024-5 says: Search debounced 300 ms; page size 20; proposal page reuses this table without the reject option — src/views/projectDetails/components/participantsTable.jsx:265-267, 397, src/views/projectProposal/pro
- **Trace.** P1 · draft · `GEN-SCR-030` · layer ui · coverage partial · typed: “screen participants-live (/project/ZFhOY1hj/REREa1hY)”

### GEN-SCR-031 — Published stages show the correct columns and fallback values

- **Why it matters.** Checks stage-table column visibility, participant counts, and missing-date handling. Written from the participants-live screen; grounded in R-FLA-026-1 (src/views/projectDetails/components/publishedStagesTable.jsx:31-99); screenshot procol-ui-tests/evidence/inv-participants-live-mv5rt1bh/02-inventory-participants-live.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Whether Stage Code appears only when at least one row has ref_id; Whether participant counts are formatted as active/total; Whether missing participant values are rendered as 0; Whether missing bidding dates are rendered as '-' in the correct cells; Whether available bidding dates are rendered as DATE_TIME values in the correct cells.
- **Setup.** Use a project containing stages with and without ref_id, missing participant counts, and missing bidding dates.
- **Steps.** 1. Click the "Project Details" tab. 2. Inspect the published stages table.
- **Expected.** The table shows Stage Title, Pending Actions, Participants, Bidding Starts At, and Bidding Ends At. Stage Code appears only when at least one row has ref_id. Participant counts use active/total, with missing values shown as 0. Missing bidding dates show "-"; available dates show DATE_TIME values.
- **Oracle.** The screen behaves as R-FLA-026-1 says: Columns: Stage Code (dropped when no row has `ref_id`), Stage Title, Pending Actions, Participants "active/total" (missing → 0), Bidding Starts At / Ends At (DATE_TIME or "-") — src/views/projectDetai
- **Trace.** P1 · draft · `GEN-SCR-031` · layer ui · coverage partial · typed: “screen participants-live (/project/ZFhOY1hj/REREa1hY)”

### GEN-SCR-032 — Long participant tab title is truncated with a tooltip

- **Why it matters.** Verifies the tab-label length boundary and accessible full title. Written from the participants-live screen; grounded in R-FLA-016-4 (src/views/projectDetails/projectTabs.jsx:112-135); screenshot procol-ui-tests/evidence/inv-participants-live-mv5rt1bh/02-inventory-participants-live.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Whether the displayed tab title is truncated to no more than 20 characters or uses an ellipsis..
- **Setup.** Open the project details screen with the standard tabs visible.
- **Steps.** 1. Locate the "Participant Remarks" tab. 2. Hover over the displayed tab title.
- **Expected.** The displayed title is truncated to no more than 20 characters, and the tooltip shows the full title "Participant Remarks".
- **Oracle.** The screen behaves as R-FLA-016-4 says: Tab titles truncated to 20 chars with tooltip; withdrawn (`in_active`) stages carry a "Withdrawn" tag — src/views/projectDetails/projectTabs.jsx:112-135, 173-175
- **Trace.** P2 · draft · `GEN-SCR-032` · layer ui · coverage partial · typed: “screen participants-live (/project/ZFhOY1hj/REREa1hY)”

### GEN-SCR-033 — Ask Clara awarding todo redirects after successful analysis

- **Why it matters.** Verifies the awarding-flow action exposed by Clara. Written from the participants-live screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/inv-participants-live-mv5rt1bh/02-inventory-participants-live.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact returned redirect_url cannot be captured or compared; only the resulting /awarding/ route can be asserted..
- **Setup.** Use a project for which Clara has an analyze_data todo and the service returns a redirect_url.
- **Steps.** 1. Click the "Ask Clara" button. 2. Wait for the awarding action to complete.
- **Expected.** The message "Awarding initiated successfully, redirecting to awarding flow..." appears, then the browser navigates to the returned redirect_url.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P1 · draft · `GEN-SCR-033` · layer ui · coverage partial · typed: “screen participants-live (/project/ZFhOY1hj/REREa1hY)”

### GEN-SCR-034 — Add Price Cap opens price-cap configuration

- **Why it matters.** Confirms that the visible price-cap action opens its configuration interface. Written from the participants-live screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/inv-participants-live-mv5rt1bh/02-inventory-participants-live.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Remain on the live RFQ Participants screen.
- **Steps.** 1. Click the "Add Price Cap" button.
- **Expected.** The price-cap configuration interface opens without navigating away from the project workflow.
- **Oracle.** What the tester sees on the participants-live screen.
- **Trace.** P1 · draft · `GEN-SCR-034` · layer ui · coverage full · typed: “screen participants-live (/project/ZFhOY1hj/REREa1hY)”

### GEN-SCR-035 — Copy copies the visible project value

- **Why it matters.** Verifies the visible copy action. Written from the participants-live screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/inv-participants-live-mv5rt1bh/02-inventory-participants-live.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Read the clipboard contents after clicking Copy; Paste the clipboard contents into a text editor; Compare the pasted content with the value associated with the Copy button.
- **Setup.** Ensure a copyable project value is visible next to the "Copy" button.
- **Steps.** 1. Click the "Copy" button. 2. Paste the clipboard contents into a text editor.
- **Expected.** The pasted content matches the value associated with the "Copy" button, and the screen remains on the current project.
- **Oracle.** What the tester sees on the participants-live screen.
- **Trace.** P2 · draft · `GEN-SCR-035` · layer ui · coverage none · typed: “screen participants-live (/project/ZFhOY1hj/REREa1hY)”

### GEN-SCR-036 — Ask Clara completes the awarding analysis flow

- **Why it matters.** Verifies the success message and redirect returned by the Clara awarding analysis. Written from the master-qcs-bid screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/inv-master-qcs-bid-mv5rtywl/02-inventory-master-qcs-bid.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Waiting for the analysis request to complete as a specific backend request, because its request path is not provided; Verifying navigation to the dynamically returned redirect_url; Asserting the awarding-flow route, because awarding is not a supported expect_navigated screen.
- **Setup.** Use a project in bid state with an Ask Clara todo of analyze_data. Configure the todo response with a valid redirect_url.
- **Steps.** 1. Click "Ask Clara". 2. Wait for the analysis request to complete.
- **Expected.** The screen shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned redirect_url.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P1 · draft · `GEN-SCR-036` · layer ui · coverage partial · typed: “screen master-qcs-bid (/project/ZFhRY1hj/master_qcs)”

### GEN-SCR-037 — Hide fields toggles the Master QCS field display

- **Why it matters.** Verifies the visible screen control changes the displayed Master QCS fields and can restore them. Written from the master-qcs-bid screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/inv-master-qcs-bid-mv5rtywl/02-inventory-master-qcs-bid.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Assert which Master QCS fields are hidden after the first Hide fields click.; Assert that the same fields are restored after the second Hide fields click..
- **Setup.** Use the current Master QCS view with the line-item fields visible.
- **Steps.** 1. Click "Hide fields". 2. Inspect the Master QCS. 3. Click "Hide fields" again.
- **Expected.** The first click hides the available fields. The second click restores the fields.
- **Oracle.** What the tester sees on the master-qcs-bid screen.
- **Trace.** P1 · draft · `GEN-SCR-037` · layer ui · coverage none · typed: “screen master-qcs-bid (/project/ZFhRY1hj/master_qcs)”

### GEN-SCR-038 — Create New Version opens the version creation flow

- **Why it matters.** Verifies the purpose and destination of the versioning action. Written from the master-qcs-bid screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/inv-master-qcs-bid-mv5rtywl/02-inventory-master-qcs-bid.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Remain on the current Master QCS screen.
- **Steps.** 1. Click "Create New Version". 2. Wait for the next screen to load.
- **Expected.** The project version creation flow opens.
- **Oracle.** What the tester sees on the master-qcs-bid screen.
- **Trace.** P1 · draft · `GEN-SCR-038` · layer ui · coverage full · typed: “screen master-qcs-bid (/project/ZFhRY1hj/master_qcs)”

### GEN-SCR-039 — Messages opens the project message view

- **Why it matters.** Verifies that the project communication action opens its message view. Written from the master-qcs-bid screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/inv-master-qcs-bid-mv5rtywl/02-inventory-master-qcs-bid.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The catalog has no dedicated step to assert that the opened view is the project-specific messages view or that its contents belong to this project..
- **Setup.** Remain on the current Master QCS screen.
- **Steps.** 1. Click "Messages". 2. Wait for the next view to load.
- **Expected.** The messages view for this project opens.
- **Oracle.** What the tester sees on the master-qcs-bid screen.
- **Trace.** P1 · draft · `GEN-SCR-039` · layer ui · coverage partial · typed: “screen master-qcs-bid (/project/ZFhRY1hj/master_qcs)”

### GEN-SCR-040 — Project opens the project details view

- **Why it matters.** Verifies navigation from the Master QCS screen to the parent project. Written from the master-qcs-bid screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/inv-master-qcs-bid-mv5rtywl/02-inventory-master-qcs-bid.png. **Draft, needs review** — written by the assistant on 2026-10-12 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Remain on the current Master QCS screen.
- **Steps.** 1. Click "Project". 2. Wait for the project view to load.
- **Expected.** The project details view for the current project opens.
- **Oracle.** What the tester sees on the master-qcs-bid screen.
- **Trace.** P1 · draft · `GEN-SCR-040` · layer ui · coverage full · typed: “screen master-qcs-bid (/project/ZFhRY1hj/master_qcs)”

### GEN-SCR-041 — Document opens the proposal document panel

- **Why it matters.** Verifies that the document panel loads the configured proposal template and its reference form. Written from the proposal screen; grounded in R-FLA-045-1 (src/views/projectProposal/projectProposal.jsx:650-673); screenshot procol-ui-tests/evidence/inv-proposal-mv5sbhfg/02-inventory-proposal.png. **Draft, needs review** — written by the assistant on 2026-10-12 from a request typed in the chat box; the automation covers part of it — not yet: That the first saved document template is selected by default in the Document panel.; That the proposal reference form is visibly loaded and rendered in the panel..
- **Setup.** Use a draft proposal with ntd_required_on_proposal enabled and at least one saved document template.
- **Steps.** 1. Click "Document".
- **Expected.** The Document panel opens. The first saved document template is selected by default, and the proposal reference form loads.
- **Oracle.** The screen behaves as R-FLA-045-1 says: Config `ntd_required_on_proposal` → "Document" panel; templates GET `/templates/?type_identifier=document` (first saved template default), form GET `/documents/reference_forms?template_uuid=&resource_
- **Trace.** P1 · draft · `GEN-SCR-041` · layer ui · coverage partial · typed: “screen proposal (/project/ZGRwY1hj/proposal/UWtEY2Q%3D)”

### GEN-SCR-042 — Changed document answers autosave

- **Why it matters.** Verifies that changes to a proposal document section are saved without a separate save action. Written from the proposal screen; grounded in R-FLA-045-2 (src/views/projectProposal/projectProposal.jsx:462-492); screenshot procol-ui-tests/evidence/inv-proposal-mv5sbhfg/02-inventory-proposal.png. **Draft, needs review** — written by the assistant on 2026-10-12 from a request typed in the chat box; the automation covers part of it — not yet: Reload the proposal page; Verify that the answer remains after an actual page reload.
- **Setup.** Use a draft proposal with the Document panel available.
- **Steps.** 1. Click "Document". 2. Enter a valid answer in "Enter answer here...". 3. Move focus away from "Enter answer here...". 4. Reload the proposal page. 5. Click "Document".
- **Expected.** The entered answer remains in "Enter answer here..." after the page reload.
- **Oracle.** The screen behaves as R-FLA-045-2 says: Each changed section autosaves PUT `/documents/draft_document_response` `{forms_data, resource_type:"Proposal", resource_uuid}` — src/views/projectProposal/projectProposal.jsx:462-492, src/models/proj
- **Trace.** P1 · draft · `GEN-SCR-042` · layer ui · coverage partial · typed: “screen proposal (/project/ZGRwY1hj/proposal/UWtEY2Q%3D)”

### GEN-SCR-043 — Submit Proposal refuses a draft with missing required fields

- **Why it matters.** Verifies the required-field validation before a proposal can enter the approval flow. Written from the proposal screen; grounded in R-FLA-045-3 (src/views/projectProposal/projectProposal.jsx:380-400); screenshot procol-ui-tests/evidence/inv-proposal-mv5sbhfg/02-inventory-proposal.png. **Draft, needs review** — written by the assistant on 2026-10-12 from a request typed in the chat box; the automation built for it covers all of it.
- **Setup.** Use a draft proposal with at least one required document answer blank.
- **Steps.** 1. Click "Submit Proposal".
- **Expected.** The proposal is not submitted. The message "Please fill all the required fields" appears.
- **Oracle.** The screen behaves as R-FLA-045-3 says: Submit with NTD: required-field errors → "Please fill all the required fields"; then `skip_custom_po` → approval modal, else Create PO form — src/views/projectProposal/projectProposal.jsx:380-400
- **Trace.** P0 · draft · `GEN-SCR-043` · layer ui · coverage full · typed: “screen proposal (/project/ZGRwY1hj/proposal/UWtEY2Q%3D)”

### GEN-SCR-044 — Comparison Sheets lists stages and the master QCS in order

- **Why it matters.** Verifies the comparison sheet sequence for a proposal containing multiple stages. Written from the proposal screen; grounded in R-FLA-044-1 (src/views/projectProposal/projectProposal.jsx:494-610); screenshot procol-ui-tests/evidence/inv-proposal-mv5sbhfg/02-inventory-proposal.png. **Draft, needs review** — written by the assistant on 2026-10-12 from a request typed in the chat box; the automation covers part of it — not yet: Exact one-row-per-stage coverage and the expected order of unnamed lot and non-RFQ/non-auction stages cannot be asserted without their visible stage names.; The skip_custom_po=false setup condition cannot be inspected or controlled; only the visible Proposed PO form row can be checked..
- **Setup.** Use a proposal with lot proposal stages and at least one non-RFQ or auction stage.
- **Steps.** 1. Click "Comparison Sheets".
- **Expected.** Comparison Sheets opens. One row appears for each stage in the expected order: the lot's stages, the non-RFQ or auction stages, "Master QCS", and then "Proposed PO form" when skip_custom_po is false.
- **Oracle.** The screen behaves as R-FLA-044-1 says: Comparison Sheets: one row per stage (lot proposals keep the lot's stages plus non-RFQ/auction stages), then Master QCS, then "Proposed PO form" unless `skip_custom_po` — src/views/projectProposal/pro
- **Trace.** P1 · draft · `GEN-SCR-044` · layer ui · coverage partial · typed: “screen proposal (/project/ZGRwY1hj/proposal/UWtEY2Q%3D)”

### GEN-SCR-045 — Document answers are read-only after the proposal leaves draft

- **Why it matters.** Verifies that submitted or otherwise non-draft proposal documents cannot be edited. Written from the proposal screen; grounded in R-FLA-045-4 (src/views/projectProposal/projectProposal.jsx:1005-1006); screenshot procol-ui-tests/evidence/inv-proposal-mv5sbhfg/02-inventory-proposal.png. **Draft, needs review** — written by the assistant on 2026-10-12 from a request typed in the chat box; the automation built for it covers all of it.
- **Setup.** Use a proposal whose status is not draft and which contains a previously saved document answer.
- **Steps.** 1. Click "Document". 2. Click "Enter answer here...". 3. Try to change the existing answer.
- **Expected.** The existing document answer cannot be changed. The Document panel is read-only.
- **Oracle.** The screen behaves as R-FLA-045-4 says: Document is read-only once the proposal is not draft — src/views/projectProposal/projectProposal.jsx:1005-1006, 686-697
- **Trace.** P0 · draft · `GEN-SCR-045` · layer ui · coverage full · typed: “screen proposal (/project/ZGRwY1hj/proposal/UWtEY2Q%3D)”

### GEN-SCR-046 — Non-creator submission is refused by the backend

- **Why it matters.** Verifies that the submission endpoint refuses a proposal submitted by someone other than its creator. Written from the proposal screen; grounded in R-FLA-042-5 (src/views/projectProposal/projectProposal.jsx:872-880); screenshot procol-ui-tests/evidence/inv-proposal-mv5sbhfg/02-inventory-proposal.png. **Draft, needs review** — written by the assistant on 2026-10-12 from a request typed in the chat box; the automation covers part of it — not yet: Sign in or otherwise establish that the current user is not the proposal creator; Complete an arbitrary displayed approval-flow step without changing proposal data; Verify that the refusal is specifically caused by the backend non-creator authorization rule.
- **Setup.** Use a complete draft proposal and sign in as a viewer who is not the proposal creator.
- **Steps.** 1. Click "Submit Proposal". 2. Complete any displayed approval-flow step without changing the proposal data.
- **Expected.** The submission fails and the message "Insufficient parameters" appears.
- **Oracle.** The screen behaves as R-FLA-042-5 says: Submit is offered to non-creators; backend proposal#submit returns 2 "Insufficient parameters" for anyone but the creator — src/views/projectProposal/projectProposal.jsx:872-880, procol-backend app/co
- **Trace.** P0 · draft · `GEN-SCR-046` · layer ui · coverage partial · typed: “screen proposal (/project/ZGRwY1hj/proposal/UWtEY2Q%3D)”

### GEN-SCR-047 — Select date remains unavailable on the proposal screen

- **Why it matters.** Verifies the disabled state shown for the date control. Written from the proposal screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/inv-proposal-mv5sbhfg/02-inventory-proposal.png. **Draft, needs review** — written by the assistant on 2026-10-12 from a request typed in the chat box; the automation covers part of it — not yet: Entering or selecting a date in the disabled Select date control; Directly asserting that a date picker does not open beyond the refused click.
- **Setup.** Open the proposal screen in its current proposal state.
- **Steps.** 1. Try to click "Select date". 2. Try to enter or select a date.
- **Expected.** "Select date" remains visibly disabled and does not accept input or open a date picker.
- **Oracle.** What the tester sees on the proposal screen.
- **Trace.** P2 · draft · `GEN-SCR-047` · layer ui · coverage partial · typed: “screen proposal (/project/ZGRwY1hj/proposal/UWtEY2Q%3D)”

