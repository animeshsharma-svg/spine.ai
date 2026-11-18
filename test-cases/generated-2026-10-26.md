# Generated test cases — drafts (2026-10-26)

Every case below was written by the spine.ai assistant when someone typed a test case that no existing case covered.
They are DRAFTS: nothing here is in the catalog until a person reviews it and moves it into a catalog file
(the importer does not read `generated-*.md`, and `GEN-` ids are not parsed).

## 1. Drafts from the assistant

### GEN-JRN-001 — Reject publishing without an event title

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with 2 line items, invite the vendors and publish it", grounded in rule R-14. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; the automation covers part of it — not yet: see the gaps.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Leave the event title blank. 2. Set the stage to RFQ. 3. Add two line items and complete the pricing sheet. 4. Invite the required vendors. 5. Click Publish.
- **Expected.** The event is not published and the screen shows "Please fill project title!"
- **Oracle.** The event is not published and the screen shows "Please fill project title!"
- **Trace.** P1 · draft · `GEN-JRN-001` · layer ui · coverage partial · typed: “journey: Create an RFQ with 2 line items, invite the vendors and publish it”

### GEN-JRN-002 — Reject publishing without participants

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with 2 line items, invite the vendors and publish it", grounded in rule R-14. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; the automation covers part of it — not yet: see the gaps.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Enter an event title. 2. Set the stage to RFQ. 3. Add two line items and complete the pricing sheet. 4. Leave Participants empty. 5. Click Publish.
- **Expected.** The event is not published and the screen shows "Please add participants!"
- **Oracle.** The event is not published and the screen shows "Please add participants!"
- **Trace.** P1 · draft · `GEN-JRN-002` · layer ui · coverage partial · typed: “journey: Create an RFQ with 2 line items, invite the vendors and publish it”

### GEN-JRN-003 — Require review of every stage before confirmation

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with 2 line items, invite the vendors and publish it", grounded in rule R-9. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Complete the event setup. 2. Click Publish. 3. Leave at least one stage tab unopened. 4. Inspect the confirmation modal.
- **Expected.** The confirmation modal shows "Please review all stages before publishing." and its OK control is disabled.
- **Oracle.** The confirmation modal shows "Please review all stages before publishing." and its OK control is disabled.
- **Trace.** P2 · draft · `GEN-JRN-003` · layer ui · coverage none · typed: “journey: Create an RFQ with 2 line items, invite the vendors and publish it”

### GEN-JRN-004 — Enable confirmation only after reviewing all stages

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with 2 line items, invite the vendors and publish it", grounded in rule R-9. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Complete the event setup. 2. Click Publish. 3. Open every stage tab in the confirmation modal. 4. Inspect the OK control.
- **Expected.** The review warning is cleared and OK is enabled.
- **Oracle.** The review warning is cleared and OK is enabled.
- **Trace.** P2 · draft · `GEN-JRN-004` · layer ui · coverage none · typed: “journey: Create an RFQ with 2 line items, invite the vendors and publish it”

### GEN-JRN-005 — Reject a blank stage title

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with 2 line items, invite the vendors and publish it", grounded in rule R-6. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open the RFQ stage settings. 2. Clear the stage title. 3. Click Save as draft. 4. Inspect the validation message.
- **Expected.** The stage is not saved and the screen shows "Title is missing".
- **Oracle.** The stage is not saved and the screen shows "Title is missing".
- **Trace.** P1 · draft · `GEN-JRN-005` · layer ui · coverage none · typed: “journey: Create an RFQ with 2 line items, invite the vendors and publish it”

### GEN-JRN-006 — Require quantity and unit for every created item

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with 2 line items, invite the vendors and publish it", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; the automation covers part of it — not yet: see the gaps.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open Items. 2. Add a line item. 3. Leave its quantity blank. 4. Leave its unit unset. 5. Click Create Project.
- **Expected.** The project is not created; the incomplete line item remains on screen with quantity and unit validation.
- **Oracle.** The project is not created; the incomplete line item remains on screen with quantity and unit validation.
- **Trace.** P1 · draft · `GEN-JRN-006` · layer ui · coverage partial · typed: “journey: Create an RFQ with 2 line items, invite the vendors and publish it”

### GEN-JRN-007 — Preserve item serials, products, and quantities in the RFQ

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with 2 line items, invite the vendors and publish it", grounded in rule R-4. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Create the first item with quantity 1 and a unit. 2. Create the second item with quantity 999999 and a unit. 3. Save the schedule. 4. Open Items and inspect the RFQ pricing sheet.
- **Expected.** The RFQ contains exactly two item rows: serial 1 has quantity 1 and serial 2 has quantity 999999; each row retains its selected product.
- **Oracle.** The RFQ contains exactly two item rows: serial 1 has quantity 1 and serial 2 has quantity 999999; each row retains its selected product.
- **Trace.** P1 · draft · `GEN-JRN-007` · layer ui · coverage none · typed: “journey: Create an RFQ with 2 line items, invite the vendors and publish it”

### GEN-JRN-008 — Reject an inactive delivery location

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with 2 line items, invite the vendors and publish it", grounded in rule R-13. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open Items. 2. Select an inactive delivery location for a line item. 3. Save the schedule.
- **Expected.** The schedule is not saved and the screen shows "Delivery location not found / inactive".
- **Oracle.** The schedule is not saved and the screen shows "Delivery location not found / inactive".
- **Trace.** P1 · draft · `GEN-JRN-008` · layer ui · coverage none · typed: “journey: Create an RFQ with 2 line items, invite the vendors and publish it”

### GEN-SCR-384 — Ask Clara starts the AI RFP flow when line items exist

- **Why it matters.** Confirms that Clara uses the project's line items to start the AI RFP request. Written from the orders-quick-create screen; grounded in R-FCR-042-4 (src/views/eventCreation/components/aiRfpGenerator/api.js:3-11); screenshot procol-ui-tests/evidence/plan-mvp5bhwz/01-open_create.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The specific AI RFP result or status content shown after completion is not identified by the case and cannot be asserted with a known catalog value..
- **Setup.** Open a project with at least one saved line item.
- **Steps.** 1. Click "Ask Clara". 2. Inspect the network requests. 3. Wait for the request to finish.
- **Expected.** The app sends POST /ask_ai_chats/rfp_questions and then GET /external_requests/:uuid. The AI RFP result or status is shown after the request completes.
- **Oracle.** The screen behaves as R-FCR-042-4 says: AI RFP → `POST /ask_ai_chats/rfp_questions`, then `GET /external_requests/:uuid`; the AI button needs project line items — src/views/eventCreation/components/aiRfpGenerator/api.js:3-11, src/views/even
- **Trace.** P1 · draft · `GEN-SCR-384` · layer ui · coverage partial · typed: “screen orders-quick-create (/orders/quick-create)”

### GEN-SCR-385 — Save as draft auto-generates an untouched project title

- **Why it matters.** Confirms that saving an untitled project gives it a usable generated title. Written from the orders-quick-create screen; grounded in R-FCR-014-5 (src/views/projectCreation/projectCreation.jsx:2289-2301); screenshot procol-ui-tests/evidence/plan-mvp5bhwz/01-open_create.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Saving the draft from a completely untouched create screen before selecting a template and adding a line item..
- **Setup.** Open a new project with valid line items and leave "Enter the title of the project" empty.
- **Steps.** 1. Click "Save as draft". 2. Wait for the save to complete.
- **Expected.** The draft saves successfully. "Enter the title of the project" shows an auto-generated project title instead of remaining empty.
- **Oracle.** The screen behaves as R-FCR-014-5 says: After save, an untouched empty project title is auto-generated (`use_pr_number_in_title`) — src/views/projectCreation/projectCreation.jsx:2289-2301
- **Trace.** P1 · draft · `GEN-SCR-385` · layer ui · coverage partial · typed: “screen orders-quick-create (/orders/quick-create)”

### GEN-SCR-386 — Whitespace-only project title is accepted past client validation

- **Why it matters.** Checks the boundary between an empty title and a title containing only whitespace. Written from the orders-quick-create screen; grounded in R-FCR-013-7 (src/views/projectCreation/projectCreation.jsx); screenshot procol-ui-tests/evidence/plan-mvp5bhwz/01-open_create.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Inspecting the publish request itself and asserting that its body contains the whitespace title because the catalog requires a request path, and no publish endpoint path is provided..
- **Setup.** Open a project with valid line items and participants.
- **Steps.** 1. Click "Enter the title of the project". 2. Enter one or more spaces. 3. Click "Publish". 4. Inspect the publish request.
- **Expected.** The app does not show "Please fill project title!". The publish flow proceeds to its next validation or request, and the request contains the whitespace title.
- **Oracle.** The screen behaves as R-FCR-013-7 says: whitespace-only project title is accepted client-side; backend event_groups update has no title check (event-groups.md) — candidate API test with `title:" "`.
- **Trace.** P1 · draft · `GEN-SCR-386` · layer ui · coverage partial · typed: “screen orders-quick-create (/orders/quick-create)”

### GEN-SCR-387 — Events opens the events list

- **Why it matters.** Confirms the navigation destination of the Events link. Written from the orders-quick-create screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/plan-mvp5bhwz/01-open_create.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the orders quick-create screen.
- **Steps.** 1. Click "Events".
- **Expected.** The app navigates away from orders-quick-create to the events list.
- **Oracle.** What the tester sees on the orders-quick-create screen.
- **Trace.** P2 · draft · `GEN-SCR-387` · layer ui · coverage full · typed: “screen orders-quick-create (/orders/quick-create)”

### GEN-SCR-388 — Copy controls copy their associated project value

- **Why it matters.** Verify both visible copy controls provide their associated value without changing the project. Written from the project-TlpnY2RO-details screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/plan-mvp5bhwz/11-publish.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Inspect the clipboard contents after clicking Copy.; Inspect the clipboard contents after clicking icon: copy.; Directly verify that no project data changed..
- **Setup.** Open the project details screen with both copy controls visible and their associated values populated.
- **Steps.** 1. Click Copy. 2. Inspect the clipboard. 3. Click icon: copy. 4. Inspect the clipboard again.
- **Expected.** Each control copies the value associated with it to the clipboard. The page remains on project details and no project data changes.
- **Oracle.** What the tester sees on the project-TlpnY2RO-details screen.
- **Trace.** P1 · draft · `GEN-SCR-388` · layer ui · coverage partial · typed: “screen project-TlpnY2RO-details (/project/TlpnY2RO/details)”

### GEN-SCR-389 — Project link returns to the project listing

- **Why it matters.** Verify the breadcrumb link opens the project list rather than leaving the user on the details screen. Written from the project-TlpnY2RO-details screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/plan-mvp5bhwz/11-publish.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the project details screen.
- **Steps.** 1. Click Project.
- **Expected.** The project listing opens and the project details screen is no longer displayed.
- **Oracle.** What the tester sees on the project-TlpnY2RO-details screen.
- **Trace.** P1 · draft · `GEN-SCR-389` · layer ui · coverage full · typed: “screen project-TlpnY2RO-details (/project/TlpnY2RO/details)”

### GEN-SCR-390 — Ask Clara starts the awarding flow for an analyze-data todo

- **Why it matters.** Verify Clara handles the analyze_data todo and uses the returned redirect URL. Written from the project-TlpnY2RO-details screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/plan-mvp5bhwz/11-publish.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The exact dynamic redirect_url returned by the Clara action.
- **Setup.** Open a project whose Clara todo is analyze_data. Ensure the analyze request returns a redirect_url.
- **Steps.** 1. Click Ask Clara. 2. Wait for the Clara action to complete.
- **Expected.** The message "Awarding initiated successfully, redirecting to awarding flow..." appears, then the browser navigates to the returned redirect_url.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P0 · draft · `GEN-SCR-390` · layer ui · coverage partial · typed: “screen project-TlpnY2RO-details (/project/TlpnY2RO/details)”

### GEN-JRN-009 — Reject publishing when the project title is empty

- **Why it matters.** A senior tester's addition to the journey "Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused", grounded in rule R-2. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; the automation covers part of it — not yet: see the gaps.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Clear the project title. 2. Keep both line items and the completed pricing sheet. 3. Leave Participants empty. 4. Click Publish.
- **Expected.** Publishing is refused with "Please fill project title!". The project remains in draft and the publish confirmation modal does not open.
- **Oracle.** Publishing is refused with "Please fill project title!". The project remains in draft and the publish confirmation modal does not open.
- **Trace.** P1 · draft · `GEN-JRN-009` · layer ui · coverage partial · typed: “journey: Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused”

### GEN-JRN-010 — Preserve the two-item draft without participants

- **Why it matters.** A senior tester's addition to the journey "Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused". **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Click Save as draft. 2. Leave the create screen. 3. Reopen the draft. 4. Open Items. 5. Open Participants.
- **Expected.** The project is shown as a draft. Items shows exactly 2 line items, the saved pricing data is present for both items, and Participants shows no invited vendors.
- **Oracle.** The project is shown as a draft. Items shows exactly 2 line items, the saved pricing data is present for both items, and Participants shows no invited vendors.
- **Trace.** P2 · draft · `GEN-JRN-010` · layer ui · coverage none · typed: “journey: Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused”

### GEN-JRN-011 — Maintain the item count after replacing a line item

- **Why it matters.** A senior tester's addition to the journey "Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused". **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; the automation covers part of it — not yet: see the gaps.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open Items. 2. Delete one line item. 3. Add one line item. 4. Complete its required pricing fields. 5. Save the schedule.
- **Expected.** Items shows exactly 2 line items, and the pricing sheet contains one pricing row for each line item.
- **Oracle.** Items shows exactly 2 line items, and the pricing sheet contains one pricing row for each line item.
- **Trace.** P2 · draft · `GEN-JRN-011` · layer ui · coverage partial · typed: “journey: Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused”

### GEN-JRN-012 — Do not create an active event after the participant refusal

- **Why it matters.** A senior tester's addition to the journey "Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused", grounded in rule R-2. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Confirm the project has a title, 2 priced line items, and no participants. 2. Click Publish. 3. Dismiss the validation message if necessary. 4. Refresh the page. 5. Open Participants.
- **Expected.** The project remains a draft, no publish confirmation is completed, and Participants still shows no invited vendors.
- **Oracle.** The project remains a draft, no publish confirmation is completed, and Participants still shows no invited vendors.
- **Trace.** P2 · draft · `GEN-JRN-012` · layer ui · coverage none · typed: “journey: Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused”

### GEN-JRN-013 — Require stage review before confirming a valid publish

- **Why it matters.** A senior tester's addition to the journey "Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused", grounded in rule R-4. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open Participants. 2. Select any available vendor without creating a new vendor. 3. Click Publish. 4. Open the publish confirmation modal. 5. Do not open the RFQ stage tab.
- **Expected.** The confirmation modal shows OK disabled and displays "Please review all stages before publishing."
- **Oracle.** The confirmation modal shows OK disabled and displays "Please review all stages before publishing."
- **Trace.** P1 · draft · `GEN-JRN-013` · layer ui · coverage none · typed: “journey: Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused”

### GEN-JRN-014 — Enable confirmation only after every stage tab is reviewed

- **Why it matters.** A senior tester's addition to the journey "Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused", grounded in rule R-4. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open Participants. 2. Select any available vendor without creating a new vendor. 3. Click Publish. 4. Open the publish confirmation modal. 5. Open every stage tab, including the RFQ tab.
- **Expected.** The review warning is cleared and OK becomes enabled, provided no other validation error remains.
- **Oracle.** The review warning is cleared and OK becomes enabled, provided no other validation error remains.
- **Trace.** P2 · draft · `GEN-JRN-014` · layer ui · coverage none · typed: “journey: Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused”

### GEN-JRN-015 — Reject publishing when the project title is empty

- **Why it matters.** A senior tester's addition to the journey "Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused", grounded in rule R-2. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Clear the project title. 2. Keep both line items and the completed pricing sheet. 3. Leave Participants empty. 4. Click Publish.
- **Expected.** Publishing is refused with "Please fill project title!". The project remains in draft and the publish confirmation modal does not open.
- **Oracle.** Publishing is refused with "Please fill project title!". The project remains in draft and the publish confirmation modal does not open.
- **Trace.** P1 · draft · `GEN-JRN-015` · layer ui · coverage none · typed: “journey: Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused”

### GEN-JRN-016 — Preserve the two-item draft without participants

- **Why it matters.** A senior tester's addition to the journey "Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused". **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Click Save as draft. 2. Leave the create screen. 3. Reopen the draft. 4. Open Items. 5. Open Participants.
- **Expected.** The project is shown as a draft. Items shows exactly 2 line items, the saved pricing data is present for both items, and Participants shows no invited vendors.
- **Oracle.** The project is shown as a draft. Items shows exactly 2 line items, the saved pricing data is present for both items, and Participants shows no invited vendors.
- **Trace.** P2 · draft · `GEN-JRN-016` · layer ui · coverage none · typed: “journey: Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused”

### GEN-JRN-017 — Maintain the item count after replacing a line item

- **Why it matters.** A senior tester's addition to the journey "Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused". **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; the automation covers part of it — not yet: see the gaps.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open Items. 2. Delete one line item. 3. Add one line item. 4. Complete its required pricing fields. 5. Save the schedule.
- **Expected.** Items shows exactly 2 line items, and the pricing sheet contains one pricing row for each line item.
- **Oracle.** Items shows exactly 2 line items, and the pricing sheet contains one pricing row for each line item.
- **Trace.** P2 · draft · `GEN-JRN-017` · layer ui · coverage partial · typed: “journey: Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused”

### GEN-JRN-018 — Do not create an active event after the participant refusal

- **Why it matters.** A senior tester's addition to the journey "Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused", grounded in rule R-2. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Confirm the project has a title, 2 priced line items, and no participants. 2. Click Publish. 3. Dismiss the validation message if necessary. 4. Refresh the page. 5. Open Participants.
- **Expected.** The project remains a draft, no publish confirmation is completed, and Participants still shows no invited vendors.
- **Oracle.** The project remains a draft, no publish confirmation is completed, and Participants still shows no invited vendors.
- **Trace.** P2 · draft · `GEN-JRN-018` · layer ui · coverage none · typed: “journey: Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused”

### GEN-JRN-019 — Require stage review before confirming a valid publish

- **Why it matters.** A senior tester's addition to the journey "Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused", grounded in rule R-4. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open Participants. 2. Select any available vendor without creating a new vendor. 3. Click Publish. 4. Open the publish confirmation modal. 5. Do not open the RFQ stage tab.
- **Expected.** The confirmation modal shows OK disabled and displays "Please review all stages before publishing."
- **Oracle.** The confirmation modal shows OK disabled and displays "Please review all stages before publishing."
- **Trace.** P1 · draft · `GEN-JRN-019` · layer ui · coverage none · typed: “journey: Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused”

### GEN-JRN-020 — Enable confirmation only after every stage tab is reviewed

- **Why it matters.** A senior tester's addition to the journey "Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused", grounded in rule R-4. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open Participants. 2. Select any available vendor without creating a new vendor. 3. Click Publish. 4. Open the publish confirmation modal. 5. Open every stage tab, including the RFQ tab.
- **Expected.** The review warning is cleared and OK becomes enabled, provided no other validation error remains.
- **Oracle.** The review warning is cleared and OK becomes enabled, provided no other validation error remains.
- **Trace.** P2 · draft · `GEN-JRN-020` · layer ui · coverage none · typed: “journey: Try to publish an RFQ with 2 line items but no vendor invited; publishing must be refused”

### GEN-JRN-021 — Reject publishing without a project title

- **Why it matters.** A senior tester's addition to the journey "create an event from pr with 3 vendors place a bid from one and publish it", grounded in rule R-7. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open the eRFX create screen. 2. Select the PR and add one line item. 3. Complete the pricing sheet. 4. Add three vendors in Participants. 5. Leave the project title blank. 6. Click Publish.
- **Expected.** Publishing is blocked and the screen shows "Please fill project title!".
- **Oracle.** Publishing is blocked and the screen shows "Please fill project title!".
- **Trace.** P1 · draft · `GEN-JRN-021` · layer ui · coverage none · typed: “journey: create an event from pr with 3 vendors place a bid from one and publish it”

### GEN-JRN-022 — Prevent an invalid RFP and RFQ end-date sequence

- **Why it matters.** A senior tester's addition to the journey "create an event from pr with 3 vendors place a bid from one and publish it", grounded in rule R-7. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Create a valid event with RFP and RFQ stages. 2. Set the RFP end time later than the RFQ end time. 3. Open every stage tab in the Publish confirmation modal. 4. Try to confirm publishing.
- **Expected.** Publishing is blocked because the RFP end time must be earlier than or equal to the RFQ end time.
- **Oracle.** Publishing is blocked because the RFP end time must be earlier than or equal to the RFQ end time.
- **Trace.** P2 · draft · `GEN-JRN-022` · layer ui · coverage none · typed: “journey: create an event from pr with 3 vendors place a bid from one and publish it”

### GEN-JRN-023 — Preserve one PR line item and its quantity and unit

- **Why it matters.** A senior tester's addition to the journey "create an event from pr with 3 vendors place a bid from one and publish it", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open the eRFX create screen from the PR. 2. Add exactly one PR line item. 3. Set its quantity and unit. 4. Save the event as a draft. 5. Reopen the draft. 6. Open Items.
- **Expected.** Items shows exactly one line item with the saved PR quantity and unit; no additional line item is created.
- **Oracle.** Items shows exactly one line item with the saved PR quantity and unit; no additional line item is created.
- **Trace.** P2 · draft · `GEN-JRN-023` · layer ui · coverage none · typed: “journey: create an event from pr with 3 vendors place a bid from one and publish it”

### GEN-JRN-024 — Keep a saved draft unpublished

- **Why it matters.** A senior tester's addition to the journey "create an event from pr with 3 vendors place a bid from one and publish it", grounded in rule R-2. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Create an event with a title, one priced line item, and three participants. 2. Click Save as draft. 3. Leave the create screen. 4. Reopen the event.
- **Expected.** The event is still a draft, its title, one line item, pricing, and three participants are retained, and no published-stage or vendor-bidding state is shown.
- **Oracle.** The event is still a draft, its title, one line item, pricing, and three participants are retained, and no published-stage or vendor-bidding state is shown.
- **Trace.** P2 · draft · `GEN-JRN-024` · layer ui · coverage none · typed: “journey: create an event from pr with 3 vendors place a bid from one and publish it”

### GEN-JRN-025 — Prevent a non-participant from creating a bid

- **Why it matters.** A senior tester's addition to the journey "create an event from pr with 3 vendors place a bid from one and publish it", grounded in rule R-5. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Publish a valid event with exactly three participants. 2. Open the vendor portal with a vendor account that is not in Participants. 3. Open the event stage. 4. Try to start a bid.
- **Expected.** The vendor cannot create a draft bid or submit a bid for the stage.
- **Oracle.** The vendor cannot create a draft bid or submit a bid for the stage.
- **Trace.** P1 · draft · `GEN-JRN-025` · layer ui · coverage none · typed: “journey: create an event from pr with 3 vendors place a bid from one and publish it”

### GEN-JRN-026 — Create one complete bid for the single line item

- **Why it matters.** A senior tester's addition to the journey "create an event from pr with 3 vendors place a bid from one and publish it", grounded in rule R-3. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Publish a valid event with one line item and three participants. 2. Open the vendor portal as one invited participant. 3. Open the live stage. 4. Start a bid. 5. Enter a quote for the single line item. 6. Save the bid. 7. Submit the bid. 8. Reopen the submitted bid.
- **Expected.** The bid contains exactly one line-item quote, has submitted status, and the vendor cannot create a second submitted bid for the same stage.
- **Oracle.** The bid contains exactly one line-item quote, has submitted status, and the vendor cannot create a second submitted bid for the same stage.
- **Trace.** P1 · draft · `GEN-JRN-026` · layer ui · coverage none · typed: “journey: create an event from pr with 3 vendors place a bid from one and publish it”

### GEN-JRN-027 — Retain PR linkage and requisition item values after reopening the draft

- **Why it matters.** A senior tester's addition to the journey "Go to the PR page in Procol, select a purchase requisition, and create an eRFX event from that PR. Verify that the event", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open the PR page. 2. Select a purchase requisition. 3. Create an eRFX project from the PR. 4. Open Items. 5. Record each requisition-derived product, quantity, and unit. 6. Click Save as draft. 7. Leave the event and reopen the draft.
- **Expected.** The draft still shows the source PR and the same requisition-derived products, quantities, and units; no extra line item is created.
- **Oracle.** The draft still shows the source PR and the same requisition-derived products, quantities, and units; no extra line item is created.
- **Trace.** P2 · draft · `GEN-JRN-027` · layer ui · coverage none · typed: “journey: Go to the PR page in Procol, select a purchase requisition, and create an eRFX event from that PR. Verify that the event retains its PR linkage and requisition-derived line items. Complete th”

### GEN-JRN-028 — Reject zero and negative requisition quantities

- **Why it matters.** A senior tester's addition to the journey "Go to the PR page in Procol, select a purchase requisition, and create an eRFX event from that PR. Verify that the event", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open the eRFX create screen from a purchase requisition. 2. Open Items. 3. Set one item quantity to 0. 4. Try to save the item. 5. Set the quantity to -1. 6. Try to save the item again.
- **Expected.** The item cannot be saved with either quantity, and the quantity field remains invalid until a positive value is entered.
- **Oracle.** The item cannot be saved with either quantity, and the quantity field remains invalid until a positive value is entered.
- **Trace.** P2 · draft · `GEN-JRN-028` · layer ui · coverage none · typed: “journey: Go to the PR page in Procol, select a purchase requisition, and create an eRFX event from that PR. Verify that the event retains its PR linkage and requisition-derived line items. Complete th”

### GEN-JRN-029 — Handle the known broken event template

- **Why it matters.** A senior tester's addition to the journey "Go to the PR page in Procol, select a purchase requisition, and create an eRFX event from that PR. Verify that the event", grounded in rule R-12. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open the template selector. 2. Select test template for event detailed. 3. Try to continue to the next create step.
- **Expected.** The template does not open and the screen reports a server error; no partially configured event is created.
- **Oracle.** The template does not open and the screen reports a server error; no partially configured event is created.
- **Trace.** P1 · draft · `GEN-JRN-029` · layer ui · coverage none · typed: “journey: Go to the PR page in Procol, select a purchase requisition, and create an eRFX event from that PR. Verify that the event retains its PR linkage and requisition-derived line items. Complete th”

### GEN-JRN-030 — Block a technical stage without evaluators

- **Why it matters.** A senior tester's addition to the journey "Go to the PR page in Procol, select a purchase requisition, and create an eRFX event from that PR. Verify that the event", grounded in rule R-10. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Create an eRFX project with a Technical stage. 2. Open the Technical stage. 3. Leave Vendor Assessment without an evaluator. 4. Try to continue or publish the event.
- **Expected.** The event is blocked and shows: "Please add Evaluator in the Technical Stage".
- **Oracle.** The event is blocked and shows: "Please add Evaluator in the Technical Stage".
- **Trace.** P1 · draft · `GEN-JRN-030` · layer ui · coverage none · typed: “journey: Go to the PR page in Procol, select a purchase requisition, and create an eRFX event from that PR. Verify that the event retains its PR linkage and requisition-derived line items. Complete th”

### GEN-JRN-031 — Require all required vendor template fields before bid submission

- **Why it matters.** A senior tester's addition to the journey "Go to the PR page in Procol, select a purchase requisition, and create an eRFX event from that PR. Verify that the event", grounded in rule R-5. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open the vendor portal for the invited vendor. 2. Open the event bid form. 3. Leave at least one required field blank. 4. Enter prices for all line items. 5. Submit the bid.
- **Expected.** The bid is not submitted; the missing required field is highlighted and the vendor remains on the bid form.
- **Oracle.** The bid is not submitted; the missing required field is highlighted and the vendor remains on the bid form.
- **Trace.** P1 · draft · `GEN-JRN-031` · layer ui · coverage none · typed: “journey: Go to the PR page in Procol, select a purchase requisition, and create an eRFX event from that PR. Verify that the event retains its PR linkage and requisition-derived line items. Complete th”

### GEN-JRN-032 — Preserve RFQ products and quantities when starting awarding

- **Why it matters.** A senior tester's addition to the journey "Go to the PR page in Procol, select a purchase requisition, and create an eRFX event from that PR. Verify that the event", grounded in rule R-9. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open the published RFQ with the submitted bid. 2. Click Start Awarding. 3. Open Items. 4. Try to edit a product or quantity.
- **Expected.** The awarding event retains the RFQ products and quantities, and those values cannot be modified.
- **Oracle.** The awarding event retains the RFQ products and quantities, and those values cannot be modified.
- **Trace.** P2 · draft · `GEN-JRN-032` · layer ui · coverage none · typed: “journey: Go to the PR page in Procol, select a purchase requisition, and create an eRFX event from that PR. Verify that the event retains its PR linkage and requisition-derived line items. Complete th”

### GEN-JRN-033 — Use the configured default unit when adding an item through the purchase template

- **Why it matters.** A senior tester's addition to the journey "Go to the PR page in Procol, select a purchase requisition, and create an eRFX event from that PR. Verify that the event", grounded in rule R-6. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Create an RFQ using Project Purchase Template. 2. Open Items. 3. Add a catalogue product without changing its unit. 4. Save the item.
- **Expected.** The new line item uses KG as its default unit and retains that unit after saving.
- **Oracle.** The new line item uses KG as its default unit and retains that unit after saving.
- **Trace.** P1 · draft · `GEN-JRN-033` · layer ui · coverage none · typed: “journey: Go to the PR page in Procol, select a purchase requisition, and create an eRFX event from that PR. Verify that the event retains its PR linkage and requisition-derived line items. Complete th”

### GEN-JRN-034 — Refuse saving a project with no line items

- **Why it matters.** A senior tester's addition to the journey "create an event from a pr", grounded in rule R-4. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Select a stage in the Add Line Items drawer. 2. Create the project without adding a line item. 3. Click Save as draft.
- **Expected.** Save as draft is disabled and shows the tooltip "Please add line items".
- **Oracle.** Save as draft is disabled and shows the tooltip "Please add line items".
- **Trace.** P1 · draft · `GEN-JRN-034` · layer ui · coverage none · typed: “journey: create an event from a pr”

### GEN-JRN-035 — Refuse saving a stage without a template

- **Why it matters.** A senior tester's addition to the journey "create an event from a pr", grounded in rule R-4. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Add exactly one line item. 2. Select a stage that requires a template. 3. Leave the template unselected. 4. Click Save as draft.
- **Expected.** Save as draft is disabled and shows the tooltip "Please select template for <stage title>".
- **Oracle.** Save as draft is disabled and shows the tooltip "Please select template for <stage title>".
- **Trace.** P1 · draft · `GEN-JRN-035` · layer ui · coverage none · typed: “journey: create an event from a pr”

### GEN-JRN-036 — Verify the template chooser starts unselected

- **Why it matters.** A senior tester's addition to the journey "create an event from a pr", grounded in rule R-6. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open the template chooser for a fresh stage. 2. Inspect the selected value and available templates.
- **Expected.** No template is preselected, and the current template is not listed as an available choice.
- **Oracle.** No template is preselected, and the current template is not listed as an available choice.
- **Trace.** P2 · draft · `GEN-JRN-036` · layer ui · coverage none · typed: “journey: create an event from a pr”

### GEN-JRN-037 — Hide draft saving for RFQ-to-Auction projects

- **Why it matters.** A senior tester's addition to the journey "create an event from a pr", grounded in rule R-10. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Create an eRFX Project with RFQ and Auction stages. 2. Open the project creation screen. 3. Inspect the project header controls.
- **Expected.** Save as draft is not shown for the RFQ-to-Auction project.
- **Oracle.** Save as draft is not shown for the RFQ-to-Auction project.
- **Trace.** P1 · draft · `GEN-JRN-037` · layer ui · coverage none · typed: “journey: create an event from a pr”

### GEN-JRN-038 — Close Items without changes

- **Why it matters.** A senior tester's addition to the journey "create an event from a pr", grounded in rule R-11. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Add one line item. 2. Click Items 1. 3. Do not change the product, variant, quantity, or item count. 4. Click Save in the Manage Line Items drawer.
- **Expected.** The Manage Line Items drawer closes without changing the line-item list.
- **Oracle.** The Manage Line Items drawer closes without changing the line-item list.
- **Trace.** P2 · draft · `GEN-JRN-038` · layer ui · coverage none · typed: “journey: create an event from a pr”

### GEN-JRN-039 — Preserve quantities and units for multiple project items

- **Why it matters.** A senior tester's addition to the journey "create an event from a pr", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open Items. 2. Add a second line item. 3. Set the first quantity to 2 with its unit. 4. Set the second quantity to 5 with its unit. 5. Click Save.
- **Expected.** The Items control shows 2 items, and reopening Items shows quantities 2 and 5 with their corresponding units on the same line items.
- **Oracle.** The Items control shows 2 items, and reopening Items shows quantities 2 and 5 with their corresponding units on the same line items.
- **Trace.** P1 · draft · `GEN-JRN-039` · layer ui · coverage none · typed: “journey: create an event from a pr”

### GEN-JRN-040 — Keep the saved draft editable

- **Why it matters.** A senior tester's addition to the journey "create an event from a pr". **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; the automation covers part of it — not yet: see the gaps.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Save the completed project as a draft. 2. Open the event from the Drafts tab. 3. Inspect the project header and Items control.
- **Expected.** The event opens in an editable creation screen; the selected template and saved line-item count remain present, and Publish or Start Awarding has not been triggered.
- **Oracle.** The event opens in an editable creation screen; the selected template and saved line-item count remain present, and Publish or Start Awarding has not been triggered.
- **Trace.** P2 · draft · `GEN-JRN-040` · layer ui · coverage partial · typed: “journey: create an event from a pr”

### GEN-JRN-041 — Reject zero or negative PR quantities

- **Why it matters.** A senior tester's addition to the journey "create an event from a purchase requisition (PR), invite three vendors, accept one bid", grounded in rule R-3. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open the eRFX Project drawer. 2. Add one PR item. 3. Set quantity to 0. 4. Select a unit. 5. Press Create Project. 6. Repeat with quantity -1.
- **Expected.** The project is not created for either value. The quantity field shows a validation error or Create Project remains unavailable.
- **Oracle.** The project is not created for either value. The quantity field shows a validation error or Create Project remains unavailable.
- **Trace.** P2 · draft · `GEN-JRN-041` · layer ui · coverage none · typed: “journey: create an event from a purchase requisition (PR), invite three vendors, accept one bid”

### GEN-JRN-042 — Calculate the line-item amount correctly

- **Why it matters.** A senior tester's addition to the journey "create an event from a purchase requisition (PR), invite three vendors, accept one bid". **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Add one line item with quantity 4. 2. Enter unit price 25.50 in the pricing sheet. 3. Save the schedule. 4. Reopen the pricing sheet.
- **Expected.** The line total is 102.00, calculated as 4 × 25.50, and the saved value remains 102.00 after reopening.
- **Oracle.** The line total is 102.00, calculated as 4 × 25.50, and the saved value remains 102.00 after reopening.
- **Trace.** P1 · draft · `GEN-JRN-042` · layer ui · coverage none · typed: “journey: create an event from a purchase requisition (PR), invite three vendors, accept one bid”

### GEN-JRN-043 — Require a project title before publishing

- **Why it matters.** A senior tester's addition to the journey "create an event from a purchase requisition (PR), invite three vendors, accept one bid", grounded in rule R-12. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Clear the event title. 2. Keep the invited participants and stages configured. 3. Press Publish. 4. Inspect the publish validation.
- **Expected.** Publishing is blocked and the screen shows "Please fill project title!"
- **Oracle.** Publishing is blocked and the screen shows "Please fill project title!"
- **Trace.** P1 · draft · `GEN-JRN-043` · layer ui · coverage none · typed: “journey: create an event from a purchase requisition (PR), invite three vendors, accept one bid”

### GEN-JRN-044 — Prevent bidding after the schedule closes

- **Why it matters.** A senior tester's addition to the journey "create an event from a purchase requisition (PR), invite three vendors, accept one bid", grounded in rule R-6. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Close the published event. 2. Open the vendor portal for the event. 3. Open the closed pricing schedule. 4. Enter a changed bid. 5. Press the bid submission control.
- **Expected.** The vendor cannot submit the bid. The schedule is shown as closed or expired and no new bid is recorded.
- **Oracle.** The vendor cannot submit the bid. The schedule is shown as closed or expired and no new bid is recorded.
- **Trace.** P2 · draft · `GEN-JRN-044` · layer ui · coverage none · typed: “journey: create an event from a purchase requisition (PR), invite three vendors, accept one bid”

### GEN-JRN-045 — Show the correct award action for the PO configuration

- **Why it matters.** A senior tester's addition to the journey "create an event from a purchase requisition (PR), invite three vendors, accept one bid", grounded in rule R-13. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Close the event. 2. Press Start Awarding. 3. Allocate the selected bid. 4. Open the create-action menu.
- **Expected.** The primary action is "Create Proposal" when skip_custom_po is enabled; otherwise it is "Create PO". If contract creation is available, the Proceed menu also includes "Create Contract".
- **Oracle.** The primary action is "Create Proposal" when skip_custom_po is enabled; otherwise it is "Create PO". If contract creation is available, the Proceed menu also includes "Create Contract".
- **Trace.** P2 · draft · `GEN-JRN-045` · layer ui · coverage none · typed: “journey: create an event from a purchase requisition (PR), invite three vendors, accept one bid”

### GEN-JRN-046 — Create the order once when the bid becomes selected

- **Why it matters.** A senior tester's addition to the journey "create an event from a purchase requisition (PR), invite three vendors, accept one bid", grounded in rule R-2. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Close the event. 2. Press Start Awarding. 3. Allocate the full selected bid. 4. Create and submit the award proposal. 5. Refresh the awarding view. 6. Inspect the event status and generated order records.
- **Expected.** The selected bid has one corresponding order or purchase-order record, the event has a closed_at value, and refreshing does not create a duplicate order.
- **Oracle.** The selected bid has one corresponding order or purchase-order record, the event has a closed_at value, and refreshing does not create a duplicate order.
- **Trace.** P2 · draft · `GEN-JRN-046` · layer ui · coverage none · typed: “journey: create an event from a purchase requisition (PR), invite three vendors, accept one bid”

### GEN-SCR-391 — Open Clara from the purchase requisitions page

- **Why it matters.** Confirms the assistant entry point opens from this page. Written from the purchase-requisitions screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mvpbk1tu-look0/02-inventory-purchase-requisitions.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: That Clara visibly opens or that its panel/dialog is displayed after clicking Ask Clara..
- **Setup.** Remain on /purchase-requisitions.
- **Steps.** 1. Click "Ask Clara".
- **Expected.** Clara opens without leaving the purchase requisitions workflow.
- **Oracle.** What the tester sees on the purchase-requisitions screen.
- **Trace.** P1 · draft · `GEN-SCR-391` · layer ui · coverage partial · typed: “screen purchase-requisitions (/purchase-requisitions)”

### GEN-SCR-392 — Open demand aggregation information

- **Why it matters.** Verifies that the demand aggregation information link works. Written from the purchase-requisitions screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mvpbk1tu-look0/02-inventory-purchase-requisitions.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Demand aggregation information is not a known catalog screen or observable subject.; The Learn More control is not a known catalog label.; Whether the information opens and what content it contains cannot be asserted with the catalog..
- **Setup.** Remain on /purchase-requisitions and confirm the demand aggregation message is visible.
- **Steps.** 1. Click "Learn More".
- **Expected.** Information about demand aggregation opens.
- **Oracle.** What the tester sees on the purchase-requisitions screen.
- **Trace.** P1 · draft · `GEN-SCR-392` · layer ui · coverage none · typed: “screen purchase-requisitions (/purchase-requisitions)”

### GEN-SCR-393 — Open requisition search

- **Why it matters.** Confirms the search entry point is available for finding requisitions. Written from the purchase-requisitions screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mvpbk1tu-look0/02-inventory-purchase-requisitions.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Observe or assert that the requisition search interface opens after clicking Search Shift+F..
- **Setup.** Remain on /purchase-requisitions.
- **Steps.** 1. Click "Search Shift+F".
- **Expected.** The requisition search interface opens.
- **Oracle.** What the tester sees on the purchase-requisitions screen.
- **Trace.** P1 · draft · `GEN-SCR-393` · layer ui · coverage none · typed: “screen purchase-requisitions (/purchase-requisitions)”

### GEN-SCR-394 — Verify unavailable actions without a selected item

- **Why it matters.** Checks that item-dependent actions are unavailable before an eligible requisition item is selected. Written from the purchase-requisitions screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mvpbk1tu-look0/02-inventory-purchase-requisitions.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — The starting screen containing Reorder, Purchase Items, and Decrease Value is not specified and has no dedicated catalog navigation step.; The catalog cannot verify that the controls remain disabled specifically because no item is selected.; The catalog cannot verify that the page content is unchanged after each attempted activation..
- **Setup.** Open /purchase-requisitions with no requisition item selected.
- **Steps.** 1. Verify "Reorder" is disabled. 2. Verify "Purchase Items" is disabled. 3. Verify "Decrease Value" is disabled. 4. Try to activate each disabled control.
- **Expected.** "Reorder", "Purchase Items", and "Decrease Value" remain disabled and do not open an action or change the page.
- **Oracle.** What the tester sees on the purchase-requisitions screen.
- **Trace.** P1 · draft · `GEN-SCR-394` · layer ui · coverage none · typed: “screen purchase-requisitions (/purchase-requisitions)”

### GEN-JRN-047 — Block publishing until every stage is reviewed

- **Why it matters.** A senior tester's addition to the journey "create an event from a purchase requisition (PR), invite three vendors, accept one bid", grounded in rule R-10. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Create the eRFX project from the PR. 2. Complete the title, template, line item, pricing, schedule, and participants. 3. Open only one stage tab. 4. Select Publish. 5. Inspect the confirmation modal.
- **Expected.** The confirmation modal remains blocked and shows "Please review all stages before publishing."
- **Oracle.** The confirmation modal remains blocked and shows "Please review all stages before publishing."
- **Trace.** P1 · draft · `GEN-JRN-047` · layer ui · coverage none · typed: “journey: create an event from a purchase requisition (PR), invite three vendors, accept one bid”

### GEN-JRN-048 — Require an evaluator for a technical stage

- **Why it matters.** A senior tester's addition to the journey "create an event from a purchase requisition (PR), invite three vendors, accept one bid", grounded in rule R-11. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Create an eRFX project with a Technical stage. 2. Add the PR line item and complete its pricing. 3. Leave the Technical stage evaluator empty. 4. Review the other stage tabs. 5. Select Publish.
- **Expected.** Publishing is refused and the Technical stage shows "Please add Evaluator in the Technical Stage".
- **Oracle.** Publishing is refused and the Technical stage shows "Please add Evaluator in the Technical Stage".
- **Trace.** P1 · draft · `GEN-JRN-048` · layer ui · coverage none · typed: “journey: create an event from a purchase requisition (PR), invite three vendors, accept one bid”

### GEN-JRN-049 — Prevent a technical end time after the RFQ end time

- **Why it matters.** A senior tester's addition to the journey "create an event from a purchase requisition (PR), invite three vendors, accept one bid", grounded in rule R-12. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open the schedule for the technical and RFQ stages. 2. Set the technical stage to end after the RFQ stage. 3. Select Save. 4. Review the schedule.
- **Expected.** The schedule is not saved with the invalid ordering; the technical stage end remains at or before the RFQ end.
- **Oracle.** The schedule is not saved with the invalid ordering; the technical stage end remains at or before the RFQ end.
- **Trace.** P2 · draft · `GEN-JRN-049` · layer ui · coverage none · typed: “journey: create an event from a purchase requisition (PR), invite three vendors, accept one bid”

### GEN-JRN-050 — Keep PR quantity and unit on the created line

- **Why it matters.** A senior tester's addition to the journey "create an event from a purchase requisition (PR), invite three vendors, accept one bid", grounded in rule R-3. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open the eRFX Project drawer from the PR. 2. Select one PR product. 3. Enter its PR quantity and unit. 4. Select Create Project. 5. Open Items.
- **Expected.** Items shows exactly one line with the selected PR product, the entered quantity, and the entered unit; no additional line is created.
- **Oracle.** Items shows exactly one line with the selected PR product, the entered quantity, and the entered unit; no additional line is created.
- **Trace.** P1 · draft · `GEN-JRN-050` · layer ui · coverage none · typed: “journey: create an event from a purchase requisition (PR), invite three vendors, accept one bid”

### GEN-JRN-051 — Stop bidding after an award proposal is submitted

- **Why it matters.** A senior tester's addition to the journey "create an event from a purchase requisition (PR), invite three vendors, accept one bid", grounded in rule R-6. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Publish the event and submit a vendor bid. 2. Open Awarding and allocate the submitted bid. 3. Select the configured proposal action. 4. Submit the award proposal for approval. 5. Return to the vendor bidding screen. 6. Attempt to submit another bid.
- **Expected.** Submitting the proposal ends the still-open commercial schedule; the vendor cannot submit another bid.
- **Oracle.** Submitting the proposal ends the still-open commercial schedule; the vendor cannot submit another bid.
- **Trace.** P2 · draft · `GEN-JRN-051` · layer ui · coverage none · typed: “journey: create an event from a purchase requisition (PR), invite three vendors, accept one bid”

### GEN-JRN-052 — Create the configured purchasing record only for the selected allocation

- **Why it matters.** A senior tester's addition to the journey "create an event from a purchase requisition (PR), invite three vendors, accept one bid", grounded in rule R-2. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Close the event. 2. Select Start Awarding. 3. Allocate part of the ordered quantity to one submitted bid. 4. Create the proposal or purchase order. 5. Submit it. 6. Open the resulting purchasing record and bid details.
- **Expected.** The allocated bid is selected, its allocated quantity and commercial total are carried into the purchasing record, and the record is created for that selected bid only.
- **Oracle.** The allocated bid is selected, its allocated quantity and commercial total are carried into the purchasing record, and the record is created for that selected bid only.
- **Trace.** P1 · draft · `GEN-JRN-052` · layer ui · coverage none · typed: “journey: create an event from a purchase requisition (PR), invite three vendors, accept one bid”

### GEN-SCR-395 — Verify the empty list state

- **Why it matters.** Confirm the screen clearly represents that no purchase requisition items are available. Written from the purchase-requisitions-reorder-multiple screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mvpbyold-look0/02-inventory-purchase-requisitions-reorder-multiple.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: unconfirmed label "Item Code" (expect_text) — not among the labels known from the app nor in the case; unconfirmed label "Event Id" (expect_text) — not among the labels known from the app nor in the case.
- **Setup.** Open /purchase-requisitions/reorder-multiple with no available requisition items.
- **Steps.** 1. Inspect the list area. 2. Inspect the column headers.
- **Expected.** The screen shows "No Data" and displays the listed column headers without any line-item rows.
- **Oracle.** What the tester sees on the purchase-requisitions-reorder-multiple screen.
- **Trace.** P1 · draft · `GEN-SCR-395` · layer ui · coverage partial · typed: “screen purchase-requisitions-reorder-multiple (/purchase-requisitions/reorder-multiple)”

### GEN-SCR-396 — Open Purchase Requisitions

- **Why it matters.** Verify that the return navigation control takes the tester away from the reorder-multiple screen. Written from the purchase-requisitions-reorder-multiple screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mvpbyold-look0/02-inventory-purchase-requisitions-reorder-multiple.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: unconfirmed label "Reorder Item(s)" in an absence check (expect_visible) — a name the product does not use is always absent, so this proves nothing until the label is confirmed.
- **Setup.** Open /purchase-requisitions/reorder-multiple.
- **Steps.** 1. Click "Purchase Requisitions".
- **Expected.** The Purchase Requisitions page opens, and the reorder-multiple screen is no longer displayed.
- **Oracle.** What the tester sees on the purchase-requisitions-reorder-multiple screen.
- **Trace.** P1 · draft · `GEN-SCR-396` · layer ui · coverage partial · typed: “screen purchase-requisitions-reorder-multiple (/purchase-requisitions/reorder-multiple)”

### GEN-SCR-397 — Open Ask Clara

- **Why it matters.** Verify that the assistant entry point opens its associated interface. Written from the purchase-requisitions-reorder-multiple screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mvpbyold-look0/02-inventory-purchase-requisitions-reorder-multiple.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The specific Clara interface content or unique post-click state is not named in the available screen labels..
- **Setup.** Open /purchase-requisitions/reorder-multiple.
- **Steps.** 1. Click "Ask Clara".
- **Expected.** The Clara interface opens without an error, while the tester can see the interface associated with "Ask Clara".
- **Oracle.** What the tester sees on the purchase-requisitions-reorder-multiple screen.
- **Trace.** P1 · draft · `GEN-SCR-397` · layer ui · coverage partial · typed: “screen purchase-requisitions-reorder-multiple (/purchase-requisitions/reorder-multiple)”

### GEN-SCR-398 — Open Select RFQ and Vendor

- **Why it matters.** Verify that the RFQ and vendor selection entry point opens its associated interface. Written from the purchase-requisitions-reorder-multiple screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mvpbyold-look0/02-inventory-purchase-requisitions-reorder-multiple.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: A unique dialog, drawer, or selection-interface container opening cannot be directly observed because no post-click label or unique visible text is provided..
- **Setup.** Open /purchase-requisitions/reorder-multiple.
- **Steps.** 1. Click "Select RFQ and Vendor".
- **Expected.** The RFQ and vendor selection interface opens without an error.
- **Oracle.** What the tester sees on the purchase-requisitions-reorder-multiple screen.
- **Trace.** P1 · draft · `GEN-SCR-398` · layer ui · coverage partial · typed: “screen purchase-requisitions-reorder-multiple (/purchase-requisitions/reorder-multiple)”

### GEN-SCR-399 — Open PR Line Item Details

- **Why it matters.** Verify that the purchase requisition line-item details entry point opens its associated interface. Written from the purchase-requisitions-reorder-multiple screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mvpbyold-look0/02-inventory-purchase-requisitions-reorder-multiple.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The specific rendered content and exact interface identity of the opened PR line-item details view..
- **Setup.** Open /purchase-requisitions/reorder-multiple.
- **Steps.** 1. Click "PR Line Item Details".
- **Expected.** The purchase requisition line-item details interface opens without an error.
- **Oracle.** What the tester sees on the purchase-requisitions-reorder-multiple screen.
- **Trace.** P1 · draft · `GEN-SCR-399` · layer ui · coverage partial · typed: “screen purchase-requisitions-reorder-multiple (/purchase-requisitions/reorder-multiple)”

### GEN-SCR-400 — Handle Reorder Item(s) with no available data

- **Why it matters.** Check the enabled reorder action when the screen shows no available data. Written from the purchase-requisitions-reorder-multiple screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mvpbyold-look0/02-inventory-purchase-requisitions-reorder-multiple.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Whether the reorder action submitted a purchase requisition to the backend..
- **Setup.** Open /purchase-requisitions/reorder-multiple and confirm that "No Data" is shown.
- **Steps.** 1. Click "Reorder Item(s)".
- **Expected.** The reorder action responds without an application error and does not display or submit a purchase requisition line item that is not present on the screen.
- **Oracle.** What the tester sees on the purchase-requisitions-reorder-multiple screen.
- **Trace.** P1 · draft · `GEN-SCR-400` · layer ui · coverage partial · typed: “screen purchase-requisitions-reorder-multiple (/purchase-requisitions/reorder-multiple)”

### GEN-SCR-401 — Verify the empty reorder list state

- **Why it matters.** Confirms the screen handles an empty list without expecting item rows. Written from the purchase-requisitions-reorder-multiple screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mvpc4ke5-look0/02-inventory-purchase-requisitions-reorder-multiple.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: No line-item rows are shown: the catalog provides no known row name or selector for asserting that the list contains zero data rows..
- **Setup.** Open the reorder-multiple screen for an account with no reorderable purchase requisition items.
- **Steps.** 1. Observe the list area. 2. Check the column headers.
- **Expected.** The message "No Data" is visible. No line-item rows are shown. The listed column headers remain visible.
- **Oracle.** What the tester sees on the purchase-requisitions-reorder-multiple screen.
- **Trace.** P1 · draft · `GEN-SCR-401` · layer ui · coverage partial · typed: “screen purchase-requisitions-reorder-multiple (/purchase-requisitions/reorder-multiple)”

### GEN-SCR-402 — Open Ask Clara from the reorder screen

- **Why it matters.** Confirms the assistant entry point opens from this screen. Written from the purchase-requisitions-reorder-multiple screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mvpc4ke5-look0/02-inventory-purchase-requisitions-reorder-multiple.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Whether the Clara assistant interface opens after selecting Ask Clara..
- **Setup.** Open the reorder-multiple screen.
- **Steps.** 1. Select "Ask Clara".
- **Expected.** The Clara assistant interface opens.
- **Oracle.** What the tester sees on the purchase-requisitions-reorder-multiple screen.
- **Trace.** P2 · draft · `GEN-SCR-402` · layer ui · coverage none · typed: “screen purchase-requisitions-reorder-multiple (/purchase-requisitions/reorder-multiple)”

### GEN-SCR-403 — Open the reorder item flow

- **Why it matters.** Confirms the primary reorder action opens its flow. Written from the purchase-requisitions-reorder-multiple screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mvpc4ke5-look0/02-inventory-purchase-requisitions-reorder-multiple.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open the reorder-multiple screen.
- **Steps.** 1. Select "Reorder Item(s)".
- **Expected.** The reorder item flow opens.
- **Oracle.** What the tester sees on the purchase-requisitions-reorder-multiple screen.
- **Trace.** P1 · draft · `GEN-SCR-403` · layer ui · coverage full · typed: “screen purchase-requisitions-reorder-multiple (/purchase-requisitions/reorder-multiple)”

### GEN-SCR-404 — View the demand aggregation notice and information

- **Why it matters.** Confirms the aggregation notice is visible and that its information link opens the related guidance. Written from the purchase-requisitions screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mvpc6dtx-look0/02-inventory-purchase-requisitions.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Assert the specific demand aggregation information view opened or verify its contents because no resulting dialog, drawer, page, or text is named in the catalog..
- **Setup.** Open purchase-requisitions with the current demand aggregation notice visible.
- **Steps.** 1. Verify the notice says "Demand aggregation for your assigned items will run in 0:04:50. Learn More". 2. Verify the separate notice says "Demand aggregation for your assigned items will run in 0:04:50.". 3. Click "Learn More".
- **Expected.** The demand aggregation information opens. The countdown is displayed as "0:04:50" before it decreases.
- **Oracle.** What the tester sees on the purchase-requisitions screen.
- **Trace.** P1 · draft · `GEN-SCR-404` · layer ui · coverage partial · typed: “screen purchase-requisitions (/purchase-requisitions)”

### GEN-SCR-405 — Open Ask Clara

- **Why it matters.** Verifies that the assistant entry point opens its available interface. Written from the purchase-requisitions screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mvpc6dtx-look0/02-inventory-purchase-requisitions.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The Clara assistant interface opening, because no known rendered dialog, drawer, or assistant-specific control is provided for assertion..
- **Setup.** Open purchase-requisitions.
- **Steps.** 1. Click "Ask Clara".
- **Expected.** The Clara assistant interface opens without navigating away from the purchase requisitions experience.
- **Oracle.** What the tester sees on the purchase-requisitions screen.
- **Trace.** P1 · draft · `GEN-SCR-405` · layer ui · coverage partial · typed: “screen purchase-requisitions (/purchase-requisitions)”

### GEN-SCR-406 — Open the Actions menu

- **Why it matters.** Verifies that the available requisition actions can be accessed. Written from the purchase-requisitions screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mvpc6dtx-look0/02-inventory-purchase-requisitions.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: The specific menu options and their states are not provided as known labels..
- **Setup.** Open purchase-requisitions.
- **Steps.** 1. Click "Actions".
- **Expected.** An actions menu opens.
- **Oracle.** What the tester sees on the purchase-requisitions screen.
- **Trace.** P1 · draft · `GEN-SCR-406` · layer ui · coverage partial · typed: “screen purchase-requisitions (/purchase-requisitions)”

### GEN-SCR-407 — Keep unavailable actions disabled without a selection

- **Why it matters.** Confirms that controls shown as disabled cannot be used in the current screen state. Written from the purchase-requisitions screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/exp-mvpc6dtx-look0/02-inventory-purchase-requisitions.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Setup.** Open purchase-requisitions without changing the current state.
- **Steps.** 1. Verify "Reorder" is disabled. 2. Verify "Purchase Items" is disabled. 3. Verify "Decrease Value" is disabled. 4. Verify "Previous page" is disabled. 5. Attempt to click each disabled control.
- **Expected.** Each control remains disabled and no action, navigation, or menu opens.
- **Oracle.** What the tester sees on the purchase-requisitions screen.
- **Trace.** P0 · draft · `GEN-SCR-407` · layer ui · coverage full · typed: “screen purchase-requisitions (/purchase-requisitions)”

### GEN-JRN-053 — Reject RFQ and direct Auction as sibling stages

- **Why it matters.** A senior tester's addition to the journey "create a rfq event from start but while publishing it final change the event type to auction then publish", grounded in rule R-8. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open the eRFX create screen. 2. Enter an event title. 3. Select RFQ in the stages control. 4. Select Auction without removing RFQ. 5. Add one line item and save the schedule. 6. Press Publish and confirm.
- **Expected.** The platform refuses the RFQ-plus-direct-Auction combination. The event is not published and RFQ remains the valid stage configuration.
- **Oracle.** The platform refuses the RFQ-plus-direct-Auction combination. The event is not published and RFQ remains the valid stage configuration.
- **Trace.** P1 · draft · `GEN-JRN-053` · layer ui · coverage none · typed: “journey: create a rfq event from start but while publishing it final change the event type to auction then publish”

### GEN-JRN-054 — Persist the final Auction configuration in a draft

- **Why it matters.** A senior tester's addition to the journey "create a rfq event from start but while publishing it final change the event type to auction then publish". **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; the automation covers part of it — not yet: see the gaps.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open the eRFX create screen. 2. Enter an event title. 3. Select RFQ, add one line item, and save the schedule. 4. Change the selected stage to Auction. 5. Save as draft. 6. Leave the create screen and reopen the draft.
- **Expected.** The reopened draft shows the same title, one line item, saved pricing values, selected Auction stage, and the invited participant selections; no stale RFQ stage is included.
- **Oracle.** The reopened draft shows the same title, one line item, saved pricing values, selected Auction stage, and the invited participant selections; no stale RFQ stage is included.
- **Trace.** P2 · draft · `GEN-JRN-054` · layer ui · coverage partial · typed: “journey: create a rfq event from start but while publishing it final change the event type to auction then publish”

### GEN-JRN-055 — Require pricing for every line item

- **Why it matters.** A senior tester's addition to the journey "create a rfq event from start but while publishing it final change the event type to auction then publish". **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Add one line item. 2. Leave its required unit price blank. 3. Save the schedule. 4. Press Publish.
- **Expected.** The pricing sheet identifies the missing required price, the schedule is not saved as complete, and Publish does not publish the event.
- **Oracle.** The pricing sheet identifies the missing required price, the schedule is not saved as complete, and Publish does not publish the event.
- **Trace.** P1 · draft · `GEN-JRN-055` · layer ui · coverage none · typed: “journey: create a rfq event from start but while publishing it final change the event type to auction then publish”

### GEN-JRN-056 — Reject zero and negative quantities

- **Why it matters.** A senior tester's addition to the journey "create a rfq event from start but while publishing it final change the event type to auction then publish". **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Open Items. 2. Set the line-item quantity to 0. 3. Save the schedule. 4. Set the quantity to -1. 5. Save the schedule.
- **Expected.** Each invalid quantity is rejected, the line item cannot be saved with a non-positive quantity, and no line total is calculated from either value.
- **Oracle.** Each invalid quantity is rejected, the line item cannot be saved with a non-positive quantity, and no line total is calculated from either value.
- **Trace.** P2 · draft · `GEN-JRN-056` · layer ui · coverage none · typed: “journey: create a rfq event from start but while publishing it final change the event type to auction then publish”

### GEN-JRN-057 — Calculate the line and event totals correctly

- **Why it matters.** A senior tester's addition to the journey "create a rfq event from start but while publishing it final change the event type to auction then publish". **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Add one line item. 2. Set its quantity to 3. 3. Enter a unit price of 12.50. 4. Save the pricing sheet.
- **Expected.** The line total is 37.50 and the event total is 37.50, with no rounding difference introduced by the decimal unit price.
- **Oracle.** The line total is 37.50 and the event total is 37.50, with no rounding difference introduced by the decimal unit price.
- **Trace.** P1 · draft · `GEN-JRN-057` · layer ui · coverage none · typed: “journey: create a rfq event from start but while publishing it final change the event type to auction then publish”

### GEN-JRN-058 — Prevent a second publication after publishing

- **Why it matters.** A senior tester's addition to the journey "create a rfq event from start but while publishing it final change the event type to auction then publish". **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Complete the Auction setup. 2. Invite the suggested participants. 3. Press Publish and confirm. 4. Refresh the event page. 5. Try to use Publish again.
- **Expected.** The event remains published after refresh, and Publish is unavailable or the second publication is refused; no duplicate event or duplicate participant invitations are created.
- **Oracle.** The event remains published after refresh, and Publish is unavailable or the second publication is refused; no duplicate event or duplicate participant invitations are created.
- **Trace.** P2 · draft · `GEN-JRN-058` · layer ui · coverage none · typed: “journey: create a rfq event from start but while publishing it final change the event type to auction then publish”

### GEN-JRN-059 — Lock RFQ products and quantities when moving to Auction

- **Why it matters.** A senior tester's addition to the journey "create a rfq event from start but while publishing it final change the event type to auction then publish", grounded in rule R-10. **Draft, needs review** — written by the assistant on 2026-10-26 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Setup.** A buyer signed in to the client under test.
- **Steps.** 1. Create and publish an RFQ with one line item. 2. Use the RFQ's Move to auction action. 3. Open Items in the resulting Auction stage. 4. Try to change the item quantity. 5. Try to add or remove a product.
- **Expected.** The RFQ is locked for the Auction transition and the app shows "You cannot modify the products or quantities"; the original product and quantity remain unchanged.
- **Oracle.** The RFQ is locked for the Auction transition and the app shows "You cannot modify the products or quantities"; the original product and quantity remain unchanged.
- **Trace.** P2 · draft · `GEN-JRN-059` · layer ui · coverage none · typed: “journey: create a rfq event from start but while publishing it final change the event type to auction then publish”

### GEN-SCR-408 — Start Clara awarding analysis

- **Why it matters.** Confirms the Clara analyze_data action reports success and opens the returned awarding flow. Written from the project-id-details screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/plan-mvpcobpp/17-publish.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Assert navigation to the dynamically returned redirect_url or verify its exact destination.
- **Setup.** Use a project with an analyze_data Clara todo and a successful response containing redirect_url.
- **Steps.** 1. Click Ask Clara. 2. Wait for the action to complete.
- **Expected.** The screen shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned redirect_url.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** P1 · draft · `GEN-SCR-408` · layer ui · coverage partial · typed: “screen project-id-details (/project/ZGtwY2RO/details)”

### GEN-SCR-409 — Use the project link and copy controls

- **Why it matters.** Confirms the visible navigation and copy controls perform their screen-level actions. Written from the project-id-details screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/plan-mvpcobpp/17-publish.png. **Draft, needs review** — written by the assistant on 2026-10-26 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Verify that the Project link opens its destination defined by the link.; Paste the clipboard value into a text area.; Verify that the pasted value from Copy matches the associated displayed project value.; Paste the clipboard value from icon: copy into a text area.; Verify that the pasted value from icon: copy matches the associated displayed project value..
- **Setup.** Open a project details screen and note the destination shown for Project and the values associated with each copy control.
- **Steps.** 1. Open the Project link destination in the current tab. 2. Return to the project details screen. 3. Click Copy. 4. Paste the clipboard value into a text area. 5. Return to the project details screen. 6. Click icon: copy. 7. Paste the clipboard value into a text area.
- **Expected.** Project opens the destination defined by its link. Each copy control places its associated displayed project value on the clipboard, and the pasted value matches that displayed value.
- **Oracle.** What the tester sees on the project-id-details screen.
- **Trace.** P2 · draft · `GEN-SCR-409` · layer ui · coverage none · typed: “screen project-id-details (/project/ZGtwY2RO/details)”

