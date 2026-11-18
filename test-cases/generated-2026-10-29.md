# Generated test cases — drafts (2026-10-29)

Every case below was written by the spine.ai assistant when someone typed a test case that no existing case covered.
They are DRAFTS: nothing here is in the catalog until a person reviews it and moves it into a catalog file
(the importer does not read `generated-*.md`, and `GEN-` ids are not parsed).

## 1. Drafts from the assistant

### GEN-JRN-065 — Publish is refused when the technical stage has no evaluator

- **Why it matters.** A senior tester's addition to the journey "Create an RFP + RFQ event from an existing PR with 1 line item, invite 2 vendors and publish it. One vendor logs into th", grounded in rule R-4. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFP + RFQ event from an existing PR with 1 line it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A draft RFP and RFQ event from an existing PR has one line item, a completed technical questionnaire and two invited vendors, but no evaluator is assigned to the RFP stage.
- **Test data.** Product: the existing PR line item; quantity: 1; vendors: QA_Platform Vendor A and QA_Platform Vendor B
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the draft event 3. Click the RFP stage tab 4. Open the "Evaluator" section 5. Remove the assigned evaluator 6. Click "Publish" 7. Confirm the publish action
- **Expected.** The event remains in Draft status and is not published. The app shows "Please add Evaluator in the Technical Stage".
- **Oracle.** The event remains in Draft status and is not published. The app shows "Please add Evaluator in the Technical Stage".
- **Trace.** Critical · Negative · draft · `GEN-JRN-065` · layer ui · coverage none · typed: “journey: Create an RFP + RFQ event from an existing PR with 1 line item, invite 2 vendors and publish it. One vendor logs into the vendor portal, answers the technical sheet and quotes 95; for the oth”

### GEN-JRN-066 — Publish is refused when a technical section has no question

- **Why it matters.** A senior tester's addition to the journey "Create an RFP + RFQ event from an existing PR with 1 line item, invite 2 vendors and publish it. One vendor logs into th", grounded in rule R-8. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFP + RFQ event from an existing PR with 1 line it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A draft RFP and RFQ event has one line item and an RFP technical section whose only row has no question. An evaluator is assigned and two vendors are invited.
- **Test data.** Product: the existing PR line item; quantity: 1; question: blank; vendors: QA_Platform Vendor A and QA_Platform Vendor B
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the draft event 3. Click the RFP stage tab 4. Click "Edit" in the technical questionnaire 5. Leave the only question row blank 6. Click "Save as draft" 7. Click "Publish" 8. Confirm the publish action
- **Expected.** The event remains in Draft status. The app shows "Some sections are empty, please check and try again".
- **Oracle.** The event remains in Draft status. The app shows "Some sections are empty, please check and try again".
- **Trace.** High · Negative · draft · `GEN-JRN-066` · layer ui · coverage none · typed: “journey: Create an RFP + RFQ event from an existing PR with 1 line item, invite 2 vendors and publish it. One vendor logs into the vendor portal, answers the technical sheet and quotes 95; for the oth”

### GEN-JRN-067 — A vendor cannot submit a bid before the technical response is complete

- **Why it matters.** A senior tester's addition to the journey "Create an RFP + RFQ event from an existing PR with 1 line item, invite 2 vendors and publish it. One vendor logs into th", grounded in rule R-2. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFP + RFQ event from an existing PR with 1 line it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A published RFP and RFQ event is open. QA_Platform Vendor A has completed the RFP response, but QA_Platform Vendor B has not answered the technical questionnaire.
- **Test data.** Product: the existing PR line item; quantity: 1; QA_Platform Vendor A bid: 95; QA_Platform Vendor B bid: 100
- **Steps.** 1. Log in to Procol (vendor side) with the QA_Platform Vendor B user 2. Open the published event 3. Click the RFP stage tab 4. Click the RFQ stage tab 5. Type 100 in the price field 6. Click "Submit Bid"
- **Expected.** The bid is not submitted because the technical stage is incomplete. Record the exact refusal message and the RFQ stage status shown on screen.
- **Oracle.** The bid is not submitted because the technical stage is incomplete. Record the exact refusal message and the RFQ stage status shown on screen.
- **Trace.** Critical · Negative · draft · `GEN-JRN-067` · layer ui · coverage none · typed: “journey: Create an RFP + RFQ event from an existing PR with 1 line item, invite 2 vendors and publish it. One vendor logs into the vendor portal, answers the technical sheet and quotes 95; for the oth”

### GEN-JRN-068 — Technical scores cannot be submitted before bidding ends

- **Why it matters.** A senior tester's addition to the journey "Create an RFP + RFQ event from an existing PR with 1 line item, invite 2 vendors and publish it. One vendor logs into th", grounded in rule R-7. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFP + RFQ event from an existing PR with 1 line it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A published two-stage event is still open for bidding. Both vendors have submitted technical responses and bids, but the RFQ bidding window has not ended.
- **Test data.** QA_Platform Vendor A technical score: 8; QA_Platform Vendor B technical score: 6
- **Steps.** 1. Log in to Procol (buyer side) with the evaluator user 2. Open the live event 3. Click "Master QCS" 4. Open the RFP technical evaluation panel 5. Type 8 for QA_Platform Vendor A 6. Type 6 for QA_Platform Vendor B 7. Click "Submit Evaluation"
- **Expected.** The evaluation is not submitted while bidding is open. The event still shows bidding as open, and the score fields or "Submit Evaluation" control is disabled or the app shows a refusal. Record the exact message shown.
- **Oracle.** The evaluation is not submitted while bidding is open. The event still shows bidding as open, and the score fields or "Submit Evaluation" control is disabled or the app shows a refusal. Record the exact message shown.
- **Trace.** High · Negative · draft · `GEN-JRN-068` · layer ui · coverage none · typed: “journey: Create an RFP + RFQ event from an existing PR with 1 line item, invite 2 vendors and publish it. One vendor logs into the vendor portal, answers the technical sheet and quotes 95; for the oth”

### GEN-JRN-069 — Technical score boundary values are handled consistently

- **Why it matters.** A senior tester's addition to the journey "Create an RFP + RFQ event from an existing PR with 1 line item, invite 2 vendors and publish it. One vendor logs into th", grounded in rule R-7. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFP + RFQ event from an existing PR with 1 line it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A closed event has completed technical responses for both vendors and is ready for evaluation. The evaluator has access to the RFP evaluation panel.
- **Test data.** QA_Platform Vendor A score: 0; QA_Platform Vendor B score: 10; then try QA_Platform Vendor A score: -1 and 10.1
- **Steps.** 1. Log in to Procol (buyer side) with the evaluator user 2. Open the closed event 3. Click "Master QCS" 4. Open the RFP technical evaluation panel 5. Type 0 for QA_Platform Vendor A 6. Type 10 for QA_Platform Vendor B 7. Click "Submit Evaluation" 8. Reopen the RFP technical evaluation panel 9. Type -1 for QA_Platform Vendor A 10. Type 10.1 for QA_Platform Vendor B 11. Click "Submit Evaluation"
- **Expected.** Record what happens for scores 0 and 10 and whether the evaluation becomes submitted. Record the validation message or field behavior for -1 and 10.1; values outside the allowed range must not be silently saved as valid scores.
- **Oracle.** Record what happens for scores 0 and 10 and whether the evaluation becomes submitted. Record the validation message or field behavior for -1 and 10.1; values outside the allowed range must not be silently saved as valid scores.
- **Trace.** Medium · Edge · draft · `GEN-JRN-069` · layer ui · coverage none · typed: “journey: Create an RFP + RFQ event from an existing PR with 1 line item, invite 2 vendors and publish it. One vendor logs into the vendor portal, answers the technical sheet and quotes 95; for the oth”

### GEN-JRN-070 — Master QCS shows the submitted technical results and both commercial bids

- **Why it matters.** A senior tester's addition to the journey "Create an RFP + RFQ event from an existing PR with 1 line item, invite 2 vendors and publish it. One vendor logs into th", grounded in rule R-6. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; the automation covers part of it — not yet: see the gaps.
- **Module / scenario.** Journey — Create an RFP + RFQ event from an existing PR with 1 line it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A closed event has one line item with quantity 1. QA_Platform Vendor A submitted a technical score of 8 and a bid of 95. QA_Platform Vendor B submitted a technical score of 6 and a bid of 100. The evaluation is submitted.
- **Test data.** Quantity: 1; QA_Platform Vendor A: score 8, price 95; QA_Platform Vendor B: score 6, price 100
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the closed event 3. Click "Master QCS" 4. Open the comparison sheet for the RFP stage 5. Open the comparison sheet for the RFQ stage
- **Expected.** The RFP comparison sheet shows both vendors with scores 8 and 6. The RFQ comparison sheet shows both bids, 95 and 100, for the one line item. The event is closed and neither vendor is shown as awarded before the buyer starts awarding.
- **Oracle.** The RFP comparison sheet shows both vendors with scores 8 and 6. The RFQ comparison sheet shows both bids, 95 and 100, for the one line item. The event is closed and neither vendor is shown as awarded before the buyer starts awarding.
- **Trace.** High · Positive · draft · `GEN-JRN-070` · layer ui · coverage partial · typed: “journey: Create an RFP + RFQ event from an existing PR with 1 line item, invite 2 vendors and publish it. One vendor logs into the vendor portal, answers the technical sheet and quotes 95; for the oth”

### GEN-JRN-071 — The lower bidder receives the one-unit award with the correct total

- **Why it matters.** A senior tester's addition to the journey "Create an RFP + RFQ event from an existing PR with 1 line item, invite 2 vendors and publish it. One vendor logs into th", grounded in rule R-6. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFP + RFQ event from an existing PR with 1 line it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A closed event has one line item with quantity 1. QA_Platform Vendor A quoted 95 and QA_Platform Vendor B quoted 100. The technical evaluation is submitted with scores 8 and 6, and there is no approval flow.
- **Test data.** Allocate quantity 1 to QA_Platform Vendor A; price 95; expected calculation 1 × 95 = 95
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the closed event 3. Click "Master QCS" 4. Click "Start Awarding" 5. Type 1 against QA_Platform Vendor A 6. Click "Create Proposal" 7. Complete the required proposal fields 8. Click "Submit Proposal"
- **Expected.** The award allocates 1 unit to QA_Platform Vendor A, the lowest bidder. The proposal shows 1 × 95 = 95 and total 95, shows no quantity allocated to QA_Platform Vendor B, creates one purchase order for QA_Platform Vendor A, and moves the event to History or the awarded status.
- **Oracle.** The award allocates 1 unit to QA_Platform Vendor A, the lowest bidder. The proposal shows 1 × 95 = 95 and total 95, shows no quantity allocated to QA_Platform Vendor B, creates one purchase order for QA_Platform Vendor A, and moves the event to History or the awarded status.
- **Trace.** Critical · Positive · draft · `GEN-JRN-071` · layer ui · coverage none · typed: “journey: Create an RFP + RFQ event from an existing PR with 1 line item, invite 2 vendors and publish it. One vendor logs into the vendor portal, answers the technical sheet and quotes 95; for the oth”

### GEN-JRN-072 — Awarding does not accept more than the available line quantity

- **Why it matters.** A senior tester's addition to the journey "Create an RFP + RFQ event from an existing PR with 1 line item, invite 2 vendors and publish it. One vendor logs into th", grounded in rule R-6. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFP + RFQ event from an existing PR with 1 line it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A closed event has one line item with quantity 1. QA_Platform Vendor A quoted 95 and QA_Platform Vendor B quoted 100. The buyer has opened Master QCS and is on the awarding screen.
- **Test data.** Attempted allocation: 2 units to QA_Platform Vendor A; available quantity: 1
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the closed event 3. Click "Master QCS" 4. Click "Start Awarding" 5. Type 2 against QA_Platform Vendor A 6. Click "Create Proposal"
- **Expected.** The proposal is not created with an over-allocation. The app blocks the action or shows a validation message, and the displayed allocated quantity never exceeds 1. Record the exact message shown.
- **Oracle.** The proposal is not created with an over-allocation. The app blocks the action or shows a validation message, and the displayed allocated quantity never exceeds 1. Record the exact message shown.
- **Trace.** High · Negative · draft · `GEN-JRN-072` · layer ui · coverage none · typed: “journey: Create an RFP + RFQ event from an existing PR with 1 line item, invite 2 vendors and publish it. One vendor logs into the vendor portal, answers the technical sheet and quotes 95; for the oth”

### GEN-JRN-073 — Submission time extension is refused when the reason is blank

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to exte", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes and  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a submission end time of 15:00 and no award proposal submitted. Vendors were invited with "Invite Vendor".
- **Test data.** Preset: 15 Mins; Reason: blank
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ 3. Click "Extend time" 4. Select "Submission" 5. Select "Preset" 6. Select "15 Mins" 7. Leave the "Reason" field blank 8. Click "Save"
- **Expected.** The extension is refused. The submission end time remains 15:00. Record what happens for the refusal message and whether the "Reason" field is marked as required.
- **Oracle.** The extension is refused. The submission end time remains 15:00. Record what happens for the refusal message and whether the "Reason" field is marked as required.
- **Trace.** High · Negative · draft · `GEN-JRN-073` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to extend by 0 minutes and check it is refused; then try a fixed time in the p”

### GEN-JRN-074 — A submission extension records its reason in the event history

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to exte", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes and  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a submission end time of 15:00 and no award proposal submitted. Vendors were invited with "Invite Vendor".
- **Test data.** Preset: 15 Mins; Reason: Buyer needs 15 more minutes to complete responses
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ 3. Click "Extend time" 4. Select "Submission" 5. Select "Preset" 6. Select "15 Mins" 7. Type "Buyer needs 15 more minutes to complete responses" in the "Reason" field 8. Click "Save" 9. Open the event history or activity log
- **Expected.** The submission end time changes from 15:00 to 15:15. The event history or activity log shows a submission-time extension with the reason "Buyer needs 15 more minutes to complete responses".
- **Oracle.** The submission end time changes from 15:00 to 15:15. The event history or activity log shows a submission-time extension with the reason "Buyer needs 15 more minutes to complete responses".
- **Trace.** High · Positive · draft · `GEN-JRN-074` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to extend by 0 minutes and check it is refused; then try a fixed time in the p”

### GEN-JRN-075 — A one-minute submission extension moves the end time by exactly one minute

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to exte", grounded in rule R-2. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes and  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a submission end time of 15:00 and no award proposal submitted. Vendors were invited with "Invite Vendor".
- **Test data.** Amount: 1; Unit: minutes; Reason: One-minute boundary check
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ 3. Click "Extend time" 4. Select "Submission" 5. Select "Custom" 6. Type "1" in the amount field 7. Select "minutes" as the unit 8. Type "One-minute boundary check" in the "Reason" field 9. Click "Save"
- **Expected.** The extension is saved. The submission end time changes from 15:00 to 15:01, not 15:00:01 or 15:02.
- **Oracle.** The extension is saved. The submission end time changes from 15:00 to 15:01, not 15:00:01 or 15:02.
- **Trace.** High · Edge · draft · `GEN-JRN-075` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to extend by 0 minutes and check it is refused; then try a fixed time in the p”

### GEN-JRN-076 — Submission time cannot be changed after an award proposal is submitted

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to exte", grounded in rule R-13. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes and  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with an award proposal already submitted for its lot and a submission end time of 15:00. Vendors were invited with "Invite Vendor".
- **Test data.** Preset: 15 Mins; Reason: Attempt after proposal submission
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ 3. Click "Extend time" 4. Select "Submission" 5. Select "Preset" 6. Select "15 Mins" 7. Type "Attempt after proposal submission" in the "Reason" field 8. Click "Save"
- **Expected.** The extension is refused with the message "You cannot edit the time as proposals are already submitted." The submission end time remains 15:00.
- **Oracle.** The extension is refused with the message "You cannot edit the time as proposals are already submitted." The submission end time remains 15:00.
- **Trace.** Critical · Negative · draft · `GEN-JRN-076` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to extend by 0 minutes and check it is refused; then try a fixed time in the p”

### GEN-JRN-077 — A normal buyer cannot reopen an expired submission window

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to exte", grounded in rule R-9. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes and  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** An RFQ whose submission window ended at 15:00 and whose status is closed or expired. No award proposal has been submitted.
- **Configs needed.** is_super_admin_allowed_to_reopen_event = Off — prevents a super admin from reopening an expired event
- **Test data.** Fixed time: 15:15; Reason: Attempt to reopen expired RFQ
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the closed or expired RFQ 3. Click "Extend time" 4. Select "Submission" 5. Select "Fixed" 6. Set the time to 15:15 7. Type "Attempt to reopen expired RFQ" in the "Reason" field 8. Click "Save"
- **Expected.** The time change is refused. The event remains closed or expired and its submission end time remains 15:00. Record what happens for the refusal message.
- **Oracle.** The time change is refused. The event remains closed or expired and its submission end time remains 15:00. Record what happens for the refusal message.
- **Trace.** Critical · Negative · draft · `GEN-JRN-077` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to extend by 0 minutes and check it is refused; then try a fixed time in the p”

### GEN-JRN-078 — Extending submission time re-locks bids that were unlocked

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to exte", grounded in rule R-8. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes and  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a submission end time of 15:00, no award proposal submitted, and bids already unlocked for buyer viewing.
- **Test data.** Preset: 15 Mins; Reason: Re-lock check after extension
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ 3. Confirm that the bids are currently unlocked 4. Click "Extend time" 5. Select "Submission" 6. Select "Preset" 7. Select "15 Mins" 8. Type "Re-lock check after extension" in the "Reason" field 9. Click "Save"
- **Expected.** The submission end time changes from 15:00 to 15:15. The bids change back to a locked state and cannot be opened while the submission window is live.
- **Oracle.** The submission end time changes from 15:00 to 15:15. The bids change back to a locked state and cannot be opened while the submission window is live.
- **Trace.** High · Positive · draft · `GEN-JRN-078` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to extend by 0 minutes and check it is refused; then try a fixed time in the p”

### GEN-SCR-410 — An invalid tab value opens the Live tab

- **Why it matters.** The orders page must replace an unsupported tab value with the Live tab. Written from the orders screen; grounded in R-FLA-002-1 (src/viewModels/orders/useOrdersListViewModel.js:82-110); screenshot procol-ui-tests/evidence/plan-mvu2vo6c/01-open_event.png. **Draft, needs review** — written by the assistant on 2026-10-29 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Module / scenario.** Screen — orders — state
- **Who.** Buyer · Buyer portal
- **Setup.** The buyer can access the orders page.
- **Test data.** URL: /orders?tab=INVALID
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open /orders?tab=INVALID in the browser 3. Wait for the orders page to finish loading
- **Expected.** The orders page opens on the "Live 9354" tab, and the browser URL contains ?tab=live instead of ?tab=INVALID.
- **Oracle.** The screen behaves as R-FLA-002-1 says: `?tab=` must be one of `live|history|draft|recurring` (lower-cased compare); anything else is replaced (history replace) by `?tab=live` — src/viewModels/orders/useOrdersListViewModel.js:82-110, src/vi
- **Trace.** High · Negative · draft · `GEN-SCR-410` · layer ui · coverage full · typed: “screen orders (/orders)”

### GEN-SCR-411 — Create Event M opens the old auction creation screen when eRFX is off

- **Why it matters.** The Create Event M button must use the configured old creation route when eRFX is disabled and the old flow is selected. Written from the orders screen; grounded in R-FLA-009-2 (src/views/orders/components/projectTable.jsx:125-137); screenshot procol-ui-tests/evidence/plan-mvu2vo6c/01-open_event.png. **Draft, needs review** — written by the assistant on 2026-10-29 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Assert that the old auction creation screen opened.; Assert that the quick-create screen did not open.; Verify that eRFX is disabled for the tenant..
- **Module / scenario.** Screen — orders — button
- **Who.** Buyer · Buyer portal
- **Setup.** The buyer is on the orders page.
- **Configs needed.** rfx_project_enabled = Off — eRFX projects; old_creation_flow_config = show_old_flow — uses the old auction creation route when eRFX is off
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the orders page 3. Click "Create Event M"
- **Expected.** The old auction creation screen opens. The quick-create screen does not open.
- **Oracle.** The screen behaves as R-FLA-009-2 says: `rfx_project_enabled` off → `old_creation_flow_config = "show_old_flow"` goes to the old auction create route, anything else to the quick-create route — src/views/orders/components/projectTable.jsx:12
- **Trace.** High · Positive · draft · `GEN-SCR-411` · layer ui · coverage none · typed: “screen orders (/orders)”

### GEN-SCR-412 — A Live search with no matches shows the filtered no-result state

- **Why it matters.** A Live tab with a filter and no matching events must show the filtered no-result state instead of the unfiltered empty-state action. Written from the orders screen; grounded in R-FLA-009-3 (src/views/orders/components/projectTable.jsx:699-720); screenshot procol-ui-tests/evidence/plan-mvu2vo6c/01-open_event.png. **Draft, needs review** — written by the assistant on 2026-10-29 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Module / scenario.** Screen — orders — state
- **Who.** Buyer · Buyer portal
- **Setup.** The buyer has access to the orders page, and no event title or reference contains the test search text.
- **Test data.** Search Title: QA_NO_MATCH_987654
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the orders page 3. Click "Live 9354" 4. Type "QA_NO_MATCH_987654" in "Search Title" 5. Wait at least 1 second for the search to apply
- **Expected.** The Live list shows the app's filtered no-result copy. The unfiltered empty Live state is not shown, and the repeated "Create Event M" action is not shown as the empty-state replacement.
- **Oracle.** The screen behaves as R-FLA-009-3 says: Empty Live tab without filters repeats the New Event button; with filters it shows the "no result" copy instead — src/views/orders/components/projectTable.jsx:699-720
- **Trace.** Medium · Negative · draft · `GEN-SCR-412` · layer ui · coverage full · typed: “screen orders (/orders)”

### GEN-SCR-413 — Date range fields are disabled on History and their Live-tab state is recorded

- **Why it matters.** The screen shows both date range fields disabled on the selected History tab; changing to Live checks what state enables them. Written from the orders screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/plan-mvu2vo6c/01-open_event.png. **Draft, needs review** — written by the assistant on 2026-10-29 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Module / scenario.** Screen — orders — state
- **Who.** Buyer · Buyer portal
- **Setup.** The buyer is on the orders page with the History tab selected.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the orders page 3. Confirm that "History 2077" is selected 4. Check that "Starting from" is disabled 5. Check that "Ending at" is disabled 6. Click "Live 9354" 7. Check the state of "Starting from" 8. Check the state of "Ending at"
- **Expected.** "Starting from" and "Ending at" are disabled while "History 2077" is selected. After clicking "Live 9354", Record what happens to both fields, including whether either field becomes enabled.
- **Oracle.** What the tester sees on the orders screen.
- **Trace.** Medium · Edge · draft · `GEN-SCR-413` · layer ui · coverage full · typed: “screen orders (/orders)”

### GEN-JRN-079 — Submission time extension requires a reason

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to exte", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; the automation covers part of it — not yet: see the gaps.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes and  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with submission still open and no award proposal submitted.
- **Test data.** Custom extension: 15 minutes; reason: leave blank
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Click "Extend Time" 5. Select "Submission" 6. Select "Custom" 7. Type 15 in the minutes field 8. Leave the "Reason" field blank 9. Click "Save"
- **Expected.** The extension is refused. The submission end time does not change, and an error message says that a reason is required; record the exact message shown.
- **Oracle.** The extension is refused. The submission end time does not change, and an error message says that a reason is required; record the exact message shown.
- **Trace.** High · Negative · draft · `GEN-JRN-079` · layer ui · coverage partial · typed: “journey: On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to extend by 0 minutes and check it is refused; then try a fixed time in the p”

### GEN-JRN-080 — A saved extension records its reason and locks the bids again

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to exte", grounded in rule R-5. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes and  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with submission still open, existing vendor bids, and bids currently unlocked.
- **Test data.** Custom extension: 15 minutes; reason: Extend submission for QA
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Record the current submission end time 5. Click "Extend Time" 6. Select "Submission" 7. Select "Custom" 8. Type 15 in the minutes field 9. Type "Extend submission for QA" in the "Reason" field 10. Click "Save" 11. Refresh the RFQ page 12. Open the RFQ stage's "Responses" tab
- **Expected.** The submission end time is exactly 15 minutes after the recorded time. The RFQ remains live, the bids show as locked again, and the activity or event history contains the reason "Extend submission for QA".
- **Oracle.** The submission end time is exactly 15 minutes after the recorded time. The RFQ remains live, the bids show as locked again, and the activity or event history contains the reason "Extend submission for QA".
- **Trace.** High · Positive · draft · `GEN-JRN-080` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to extend by 0 minutes and check it is refused; then try a fixed time in the p”

### GEN-JRN-081 — A whitespace-only reason does not save a submission extension

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to exte", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes and  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with submission still open and no award proposal submitted.
- **Test data.** Custom extension: 15 minutes; reason: three spaces
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Record the current submission end time 5. Click "Extend Time" 6. Select "Submission" 7. Select "Custom" 8. Type 15 in the minutes field 9. Type three spaces in the "Reason" field 10. Click "Save"
- **Expected.** The extension is refused because the reason contains no visible text; an error message is shown, and the submission end time is unchanged. Record the exact message shown.
- **Oracle.** The extension is refused because the reason contains no visible text; an error message is shown, and the submission end time is unchanged. Record the exact message shown.
- **Trace.** Medium · Edge · draft · `GEN-JRN-081` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to extend by 0 minutes and check it is refused; then try a fixed time in the p”

### GEN-JRN-082 — A negative custom extension is refused

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to exte". **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes and  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with submission still open and no award proposal submitted.
- **Test data.** Custom extension: -1 minute; reason: Negative value check
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Record the current submission end time 5. Click "Extend Time" 6. Select "Submission" 7. Select "Custom" 8. Type -1 in the minutes field 9. Type "Negative value check" in the "Reason" field 10. Click "Save"
- **Expected.** The extension is not saved. The submission end time remains unchanged and the page either blocks the negative value or shows an error message; record the exact control state and message.
- **Oracle.** The extension is not saved. The submission end time remains unchanged and the page either blocks the negative value or shows an error message; record the exact control state and message.
- **Trace.** Medium · Edge · draft · `GEN-JRN-082` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to extend by 0 minutes and check it is refused; then try a fixed time in the p”

### GEN-JRN-083 — A fixed submission time equal to the current end is not treated as an extension

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to exte". **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes and  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with submission still open and no award proposal submitted.
- **Test data.** Fixed time: exactly the current submission end time shown on screen; reason: Same end time check
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Record the current submission end date and time 5. Click "Extend Time" 6. Select "Submission" 7. Select "Fixed" 8. Enter the recorded submission end date and time 9. Type "Same end time check" in the "Reason" field 10. Click "Save"
- **Expected.** Record what happens when the fixed time is exactly equal to the current submission end time. The displayed submission end time, RFQ status, and any refusal message are captured.
- **Oracle.** Record what happens when the fixed time is exactly equal to the current submission end time. The displayed submission end time, RFQ status, and any refusal message are captured.
- **Trace.** Medium · Edge · draft · `GEN-JRN-083` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes and check the new end time is 15 minutes later; then try to extend by 0 minutes and check it is refused; then try a fixed time in the p”

### GEN-SCR-414 — Click here opens the response template

- **Why it matters.** Checks the response-template link displayed beside the no-bids message. Written from the project-id-id screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/plan-mvu2y673/01-open_prepared.png. **Draft, needs review** — written by the assistant on 2026-10-29 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Buyer-side login is not represented by a catalog step.; There is no catalog assertion for the response template's opened state or a structured step to record all fields and values shown in that template..
- **Module / scenario.** Screen — project-id-id — button
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with no bids placed.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live project 3. Click "RFQ" 4. Click "Responses" 5. Click "Click here"
- **Expected.** The response template opens. Record the fields and values shown in the response template.
- **Oracle.** What the tester sees on the project-id-id screen.
- **Trace.** Medium · Positive · draft · `GEN-SCR-414` · layer ui · coverage partial · typed: “screen project-id-id (/project/UXBrY2Rk/UVFOa1Fj)”

### GEN-SCR-415 — Overview shows the project identifier and creation details

- **Why it matters.** Checks the Overview values and the conditional Open Tender Event field. Written from the project-id-id screen; grounded in R-FLA-018-1 (src/views/projectDetails/projectDetails.jsx:545-564); screenshot procol-ui-tests/evidence/plan-mvu2y673/01-open_prepared.png. **Draft, needs review** — written by the assistant on 2026-10-29 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Assert the Project ID value in the format #<refId>; Assert the project's creation date and time; Assert that Open Tender Event is shown as Yes.
- **Module / scenario.** Screen — project-id-id — button
- **Who.** Buyer · Buyer portal
- **Setup.** A live project with a known reference ID and creation date.
- **Configs needed.** is_show_under_open_events = On — shows the Open Tender Event value on project details
- **Test data.** Expected reference ID and creation date from the project record
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live project 3. Click "Overview"
- **Expected.** The Overview page shows "Project ID" as "#<refId>", "Created at" as the project's date and time, and "Open Tender Event" as "Yes".
- **Oracle.** The screen behaves as R-FLA-018-1 says: Overview: "Project ID" = `#<refId>`, "Created at" = DATE_TIME, "Open Tender Event: Yes" only when config `is_show_under_open_events` — src/views/projectDetails/projectDetails.jsx:545-564
- **Trace.** High · Positive · draft · `GEN-SCR-415` · layer ui · coverage none · typed: “screen project-id-id (/project/UXBrY2Rk/UVFOa1Fj)”

### GEN-SCR-416 — Participants shows response count tags for the line items and vendors

- **Why it matters.** Checks that the line-item and participant panel headers display response count tags. Written from the project-id-id screen; grounded in R-FLA-018-4 (src/views/projectDetails/projectDetails.jsx:916-946); screenshot procol-ui-tests/evidence/plan-mvu2y673/01-open_prepared.png. **Draft, needs review** — written by the assistant on 2026-10-29 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Assert that the line-item and participant panel headers display response-count tags.; Assert that the response-count tags specifically display 0 when there are no bids or participant responses.; Compare or report differences in the header wording..
- **Module / scenario.** Screen — project-id-id — state
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with one line item, Vendor A and Vendor B invited, and no bids or participant responses.
- **Test data.** Product: QA Test Product; Quantity: 1
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live project 3. Click "Project Details" 4. Click "Participants"
- **Expected.** The line-item and participant panel headers show count tags. With no bids or participant responses, the displayed response counts are 0. Record any difference in the header wording or count.
- **Oracle.** The screen behaves as R-FLA-018-4 says: Line Items / Participants panel headers show count tags from the line-item and participant responses — src/views/projectDetails/projectDetails.jsx:916-946, src/redux/project/selectors.js:867-876
- **Trace.** Medium · Positive · draft · `GEN-SCR-416` · layer ui · coverage partial · typed: “screen project-id-id (/project/UXBrY2Rk/UVFOa1Fj)”

### GEN-JRN-084 — The second extension starts from the first new end time

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, the", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a known submission end time and no award proposal submitted
- **Test data.** First extension: 15 minutes. Second extension: 2 hours.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Record the submission end time shown on the page 5. Click "Extend Time" 6. Select "Submission" 7. Select "Custom" 8. Type 15 in the amount field 9. Select "Minutes" 10. Click "Save" 11. Record the new submission end time shown on the page 12. Click "Extend Time" 13. Select "Submission" 14. Select "Custom" 15. Type 2 in the amount field 16. Select "Hours" 17. Click "Save" 18. Open the RFQ stage's "Responses" tab again
- **Expected.** After the first save, the event remains live and the submission end is exactly 15 minutes after the original end. After the second save, the submission end is exactly 2 hours after the first new end, which is 2 hours 15 minutes after the original end. The live status badge remains visible and no bid or response count changes.
- **Oracle.** After the first save, the event remains live and the submission end is exactly 15 minutes after the original end. After the second save, the submission end is exactly 2 hours after the first new end, which is 2 hours 15 minutes after the original end. The live status badge remains visible and no bid or response count changes.
- **Trace.** Critical · Positive · draft · `GEN-JRN-084` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, then extend again by 2 hours and check the end moved by 2 more hours”

### GEN-JRN-085 — Zero minutes is not accepted as a custom extension

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, the". **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a known submission end time and no award proposal submitted
- **Test data.** Custom submission extension: 0 minutes.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Record the submission end time shown on the page 5. Click "Extend Time" 6. Select "Submission" 7. Select "Custom" 8. Type 0 in the amount field 9. Select "Minutes" 10. Click "Save"
- **Expected.** The extension is refused. The submission end does not change and the RFQ remains live. Record the exact validation message shown by Procol.
- **Oracle.** The extension is refused. The submission end does not change and the RFQ remains live. Record the exact validation message shown by Procol.
- **Trace.** High · Negative · draft · `GEN-JRN-085` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, then extend again by 2 hours and check the end moved by 2 more hours”

### GEN-JRN-086 — A negative custom extension is not accepted

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, the". **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a known submission end time and no award proposal submitted
- **Test data.** Custom submission extension: -1 minutes.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Record the submission end time shown on the page 5. Click "Extend Time" 6. Select "Submission" 7. Select "Custom" 8. Type -1 in the amount field 9. Select "Minutes" 10. Click "Save"
- **Expected.** The extension is refused. The submission end does not change and the RFQ remains live. Record the exact validation message shown by Procol.
- **Oracle.** The extension is refused. The submission end does not change and the RFQ remains live. Record the exact validation message shown by Procol.
- **Trace.** High · Negative · draft · `GEN-JRN-086` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, then extend again by 2 hours and check the end moved by 2 more hours”

### GEN-JRN-087 — Submission time cannot be extended after an award proposal is submitted

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, the", grounded in rule R-5. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with an award proposal already submitted and a known submission end time
- **Test data.** Custom submission extension: 15 minutes.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the RFQ with the submitted award proposal 3. Open the RFQ stage's "Responses" tab 4. Record the submission end time shown on the page 5. Click "Extend Time" 6. Select "Submission" 7. Select "Custom" 8. Type 15 in the amount field 9. Select "Minutes" 10. Click "Save"
- **Expected.** The extension is refused with Procol's award-proposal restriction and error code 801, or the equivalent message shown in the interface. The submission end is unchanged and the submitted award proposal remains present.
- **Oracle.** The extension is refused with Procol's award-proposal restriction and error code 801, or the equivalent message shown in the interface. The submission end is unchanged and the submitted award proposal remains present.
- **Trace.** Critical · Negative · draft · `GEN-JRN-087` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, then extend again by 2 hours and check the end moved by 2 more hours”

### GEN-JRN-088 — Extending submission time ends an active best-offer window

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, the", grounded in rule R-4. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a running best-offer window and a known submission end time
- **Test data.** Custom submission extension: 15 minutes.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Confirm that the best-offer window is shown as running 5. Record the submission end time shown on the page 6. Click "Extend Time" 7. Select "Submission" 8. Select "Custom" 9. Type 15 in the amount field 10. Select "Minutes" 11. Click "Save" 12. Refresh the RFQ stage's "Responses" tab
- **Expected.** The submission end moves exactly 15 minutes later. The best-offer window is no longer shown as running and is shown as ended, while the RFQ itself remains live until the new submission end.
- **Oracle.** The submission end moves exactly 15 minutes later. The best-offer window is no longer shown as running and is shown as ended, while the RFQ itself remains live until the new submission end.
- **Trace.** High · Positive · draft · `GEN-JRN-088` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, then extend again by 2 hours and check the end moved by 2 more hours”

### GEN-JRN-089 — The extension notification is sent only for the active RFQ stage

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, the", grounded in rule R-7. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with vendors added through "Invite Vendor", each vendor having an invitation email address, and no award proposal submitted
- **Test data.** Custom submission extension: 15 minutes.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Record the submission end time shown on the page 5. Click "Extend Time" 6. Select "Submission" 7. Select "Custom" 8. Type 15 in the amount field 9. Select "Minutes" 10. Click "Save" 11. Open the email inboxes for the invited vendors 12. Open the submission-time extension email for this RFQ
- **Expected.** Each invited vendor with an invitation email receives one submission-time extension email for the active RFQ. The email identifies this RFQ and shows the revised submission end. No email is sent for an inactive stage. Record the exact subject and displayed end-time format.
- **Oracle.** Each invited vendor with an invitation email receives one submission-time extension email for the active RFQ. The email identifies this RFQ and shows the revised submission end. No email is sent for an inactive stage. Record the exact subject and displayed end-time format.
- **Trace.** Medium · Positive · draft · `GEN-JRN-089` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, then extend again by 2 hours and check the end moved by 2 more hours”

### GEN-JRN-090 — The submission end remains unchanged when saving an invalid custom value

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, the". **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a known submission end time and no award proposal submitted
- **Test data.** Custom submission extension: 1.5 minutes.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Record the submission end time shown on the page 5. Click "Extend Time" 6. Select "Submission" 7. Select "Custom" 8. Type 1.5 in the amount field 9. Select "Minutes" 10. Click "Save"
- **Expected.** Record what happens. If Procol refuses the value, the original submission end remains unchanged and the RFQ remains live. If Procol accepts it, record the exact resulting end time and whether the value was rounded.
- **Oracle.** Record what happens. If Procol refuses the value, the original submission end remains unchanged and the RFQ remains live. If Procol accepts it, record the exact resulting end time and whether the value was rounded.
- **Trace.** Medium · Edge · draft · `GEN-JRN-090` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, then extend again by 2 hours and check the end moved by 2 more hours”

### GEN-SCR-417 — Overview shows the project ID, created date and open tender status when enabled

- **Why it matters.** Confirms the Overview information and the company-controlled Open Tender Event value. Written from the project-id-id screen; grounded in R-FLA-018-1 (src/views/projectDetails/projectDetails.jsx:545-564); screenshot procol-ui-tests/evidence/plan-mvu32nwt/01-open_prepared.png. **Draft, needs review** — written by the assistant on 2026-10-29 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Verify that the Project ID value is the project reference preceded by #.; Verify that the Created at value is a valid date and time.; Verify that Open Tender Event: Yes is shown specifically because the tenant setting is enabled..
- **Module / scenario.** Screen — project-id-id — state
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ project with a known reference ID and creation date.
- **Configs needed.** is_show_under_open_events = On — shows Open Tender Event on the project Overview
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live project 3. Click "Project Details" 4. Click "Overview"
- **Expected.** The Overview shows Project ID as the project reference preceded by #, Created at as a date and time, and Open Tender Event: Yes.
- **Oracle.** The screen behaves as R-FLA-018-1 says: Overview: "Project ID" = `#<refId>`, "Created at" = DATE_TIME, "Open Tender Event: Yes" only when config `is_show_under_open_events` — src/views/projectDetails/projectDetails.jsx:545-564
- **Trace.** High · Positive · draft · `GEN-SCR-417` · layer ui · coverage partial · typed: “screen project-id-id (/project/UXBOY2Rk/UVFRa1Fj)”

### GEN-SCR-418 — Overview does not show the open tender status when the setting is disabled

- **Why it matters.** Confirms that Open Tender Event is controlled by the company setting. Written from the project-id-id screen; grounded in R-FLA-018-1 (src/views/projectDetails/projectDetails.jsx:545-564); screenshot procol-ui-tests/evidence/plan-mvu32nwt/01-open_prepared.png. **Draft, needs review** — written by the assistant on 2026-10-29 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Assert Project ID is shown as the project reference preceded by #; Assert Created at is shown as a date and time; Assert Open Tender Event is not shown when the setting is disabled.
- **Module / scenario.** Screen — project-id-id — state
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ project with a known reference ID and creation date.
- **Configs needed.** is_show_under_open_events = Off — hides Open Tender Event from the project Overview
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live project 3. Click "Project Details" 4. Click "Overview"
- **Expected.** The Overview shows Project ID as the project reference preceded by # and Created at as a date and time. Open Tender Event is not shown.
- **Oracle.** The screen behaves as R-FLA-018-1 says: Overview: "Project ID" = `#<refId>`, "Created at" = DATE_TIME, "Open Tender Event: Yes" only when config `is_show_under_open_events` — src/views/projectDetails/projectDetails.jsx:545-564
- **Trace.** High · Negative · draft · `GEN-SCR-418` · layer ui · coverage none · typed: “screen project-id-id (/project/UXBOY2Rk/UVFRa1Fj)”

### GEN-SCR-419 — Line Items and Participants show response count tags

- **Why it matters.** Confirms that the Line Items and Participants panel headers display response count tags. Written from the project-id-id screen; grounded in R-FLA-018-4 (src/views/projectDetails/projectDetails.jsx:916-946); screenshot procol-ui-tests/evidence/plan-mvu32nwt/01-open_prepared.png. **Draft, needs review** — written by the assistant on 2026-10-29 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Whether the Line Items header displays a response count tag; Whether the Participants header displays a response count tag; Whether both response count tags show 0 when there are no bids or responses.
- **Module / scenario.** Screen — project-id-id — state
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with one line item and Vendor A invited, with no bids or responses placed.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live project 3. Click "Project Details"
- **Expected.** The Line Items and Participants panel headers each show a count tag. With no bids or responses, the response counts are 0.
- **Oracle.** The screen behaves as R-FLA-018-4 says: Line Items / Participants panel headers show count tags from the line-item and participant responses — src/views/projectDetails/projectDetails.jsx:916-946, src/redux/project/selectors.js:867-876
- **Trace.** High · Positive · draft · `GEN-SCR-419` · layer ui · coverage none · typed: “screen project-id-id (/project/UXBOY2Rk/UVFRa1Fj)”

### GEN-SCR-420 — Click here opens the response template from the no-bids message

- **Why it matters.** Confirms the link shown in the no-bids message opens the response template. Written from the project-id-id screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/plan-mvu32nwt/01-open_prepared.png. **Draft, needs review** — written by the assistant on 2026-10-29 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Assert that the response template opens or that the no-bids message is replaced by the response-template view..
- **Module / scenario.** Screen — project-id-id — button
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with no bids placed yet.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live project 3. Click "RFQ" 4. Click "Responses" 5. Click "Click here"
- **Expected.** The response template opens. The no-bids message is replaced by, or the browser navigates to, the response-template view.
- **Oracle.** What the tester sees on the project-id-id screen.
- **Trace.** Medium · Positive · draft · `GEN-SCR-420` · layer ui · coverage partial · typed: “screen project-id-id (/project/UXBOY2Rk/UVFRa1Fj)”

### GEN-JRN-091 — Submission time cannot be extended without a reason

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, the", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a future submission end time and no award proposal submitted
- **Test data.** Option: Custom; Amount: 15; Unit: minutes; Reason: blank
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Click "Extend Time" 5. Select "Submission" 6. Select "Custom" 7. Type "15" in "Amount" 8. Select "minutes" in "Unit" 9. Leave "Reason" blank 10. Click "Save"
- **Expected.** The submission end time does not change. The extension is refused and the form shows the app's message that a reason is required. Record the exact message shown.
- **Oracle.** The submission end time does not change. The extension is refused and the form shows the app's message that a reason is required. Record the exact message shown.
- **Trace.** High · Negative · draft · `GEN-JRN-091` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, then extend again by 2 hours and check the end moved by 2 more hours, then”

### GEN-JRN-092 — A zero-minute submission extension is refused

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, the". **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a future submission end time and no award proposal submitted
- **Test data.** Option: Custom; Amount: 0; Unit: minutes; Reason: "QA zero-minute extension"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Record the current submission end time 5. Click "Extend Time" 6. Select "Submission" 7. Select "Custom" 8. Type "0" in "Amount" 9. Select "minutes" in "Unit" 10. Type "QA zero-minute extension" in "Reason" 11. Click "Save"
- **Expected.** The submission end time remains unchanged. The extension is refused with the app's validation message for a non-positive amount. Record the exact message shown.
- **Oracle.** The submission end time remains unchanged. The extension is refused with the app's validation message for a non-positive amount. Record the exact message shown.
- **Trace.** Medium · Negative · draft · `GEN-JRN-092` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, then extend again by 2 hours and check the end moved by 2 more hours, then”

### GEN-JRN-093 — A negative submission extension is refused

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, the". **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a future submission end time and no award proposal submitted
- **Test data.** Option: Custom; Amount: -1; Unit: minutes; Reason: "QA negative extension"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Record the current submission end time 5. Click "Extend Time" 6. Select "Submission" 7. Select "Custom" 8. Type "-1" in "Amount" 9. Select "minutes" in "Unit" 10. Type "QA negative extension" in "Reason" 11. Click "Save"
- **Expected.** The submission end time remains unchanged. The extension is refused with the app's validation message for an invalid amount. Record the exact message shown.
- **Oracle.** The submission end time remains unchanged. The extension is refused with the app's validation message for an invalid amount. Record the exact message shown.
- **Trace.** Medium · Negative · draft · `GEN-JRN-093` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, then extend again by 2 hours and check the end moved by 2 more hours, then”

### GEN-JRN-094 — A fixed submission end time before the current end is refused

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, the", grounded in rule R-2. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ whose submission end time has already been extended twice and is still in the future
- **Test data.** Option: Fixed; Time: 10 minutes before the current submission end time; Reason: "QA earlier fixed end time"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Record the current submission end time 5. Click "Extend Time" 6. Select "Submission" 7. Select "Fixed" 8. Enter a time exactly 10 minutes before the recorded submission end time in the fixed time field 9. Type "QA earlier fixed end time" in "Reason" 10. Click "Save"
- **Expected.** The submission end time does not move backwards. The fixed-time change is refused with the app's message that the new submission end time is invalid. Record the exact message shown.
- **Oracle.** The submission end time does not move backwards. The fixed-time change is refused with the app's message that the new submission end time is invalid. Record the exact message shown.
- **Trace.** Critical · Negative · draft · `GEN-JRN-094` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, then extend again by 2 hours and check the end moved by 2 more hours, then”

### GEN-JRN-095 — An ended RFQ cannot be reopened by extending submission time

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, the", grounded in rule R-11. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** An ended RFQ whose submission end time is in the past and no award proposal submitted
- **Configs needed.** is_super_admin_allowed_to_reopen_event = Off — prevents a super admin from reopening an ended event
- **Test data.** Option: Custom; Amount: 15; Unit: minutes; Reason: "QA reopen attempt"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the ended RFQ 3. Open the RFQ stage's "Responses" tab 4. Click "Extend Time" 5. Select "Submission" 6. Select "Custom" 7. Type "15" in "Amount" 8. Select "minutes" in "Unit" 9. Type "QA reopen attempt" in "Reason" 10. Click "Save"
- **Expected.** The RFQ remains ended and its submission end time does not change. The extension is refused with the app's message that an ended event cannot be reopened.
- **Oracle.** The RFQ remains ended and its submission end time does not change. The extension is refused with the app's message that an ended event cannot be reopened.
- **Trace.** High · Negative · draft · `GEN-JRN-095` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, then extend again by 2 hours and check the end moved by 2 more hours, then”

### GEN-JRN-096 — An RFQ extension cannot make its end later than the RFP end

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, the", grounded in rule R-6. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live project with an active RFP stage ending before the live RFQ stage, with no award proposal submitted
- **Test data.** Option: Custom; Amount: 2; Unit: hours; Reason: "QA cross-stage extension"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live project 3. Open the RFQ stage's "Responses" tab 4. Record the current RFQ submission end time 5. Record the RFP stage end time 6. Click "Extend Time" 7. Select "Submission" 8. Select "Custom" 9. Type "2" in "Amount" 10. Select "hours" in "Unit" 11. Type "QA cross-stage extension" in "Reason" 12. Click "Save"
- **Expected.** If the requested RFQ end would be later than the RFP end, the extension is refused. The RFQ end time is unchanged and the app shows its message that the RFP end cannot be later than the RFQ end. Record the exact message shown.
- **Oracle.** If the requested RFQ end would be later than the RFP end, the extension is refused. The RFQ end time is unchanged and the app shows its message that the RFP end cannot be later than the RFQ end. Record the exact message shown.
- **Trace.** High · Negative · draft · `GEN-JRN-096` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, then extend again by 2 hours and check the end moved by 2 more hours, then”

### GEN-JRN-097 — The extension reason is retained in the event history

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, the", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a future submission end time and no award proposal submitted
- **Test data.** Option: Custom; Amount: 15; Unit: minutes; Reason: "QA submission extension 15 minutes"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Record the current submission end time 5. Click "Extend Time" 6. Select "Submission" 7. Select "Custom" 8. Type "15" in "Amount" 9. Select "minutes" in "Unit" 10. Type "QA submission extension 15 minutes" in "Reason" 11. Click "Save" 12. Open the event's activity log or history 13. Find the latest submission-time extension entry
- **Expected.** The submission end time is 15 minutes later than the recorded time. The latest activity entry identifies the submission-time extension and retains the reason "QA submission extension 15 minutes".
- **Oracle.** The submission end time is 15 minutes later than the recorded time. The latest activity entry identifies the submission-time extension and retains the reason "QA submission extension 15 minutes".
- **Trace.** Medium · Positive · draft · `GEN-JRN-097` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end time is 15 minutes later, then extend again by 2 hours and check the end moved by 2 more hours, then”

### GEN-JRN-098 — A zero or negative custom extension is refused

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 2 hours using Custom and check the end moved by exactly 2 hours, then exten". **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 2 hours using C — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a submission end time more than 2 hours in the future.
- **Test data.** Try amount "0" and amount "-1" separately; unit: Hours; Reason: "QA boundary check"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ 3. Note the current submission end time 4. Click "Extend Time" 5. Select "Submission" 6. Select "Custom" 7. Type "0" in the amount field 8. Select "Hours" 9. Type "QA boundary check" in the "Reason" field 10. Click "Save" 11. Repeat the extension with "-1" in the amount field
- **Expected.** Neither extension is saved. The submission end time remains unchanged for both attempts, and the amount field or form shows a validation message. Record the exact message shown for amount "0" and amount "-1".
- **Oracle.** Neither extension is saved. The submission end time remains unchanged for both attempts, and the amount field or form shows a validation message. Record the exact message shown for amount "0" and amount "-1".
- **Trace.** High · Edge · draft · `GEN-JRN-098` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 2 hours using Custom and check the end moved by exactly 2 hours, then extend again by 1 day and check the end moved by exactly 1 more day, then tr”

### GEN-JRN-099 — A fixed submission time equal to the current end is refused

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 2 hours using Custom and check the end moved by exactly 2 hours, then exten". **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 2 hours using C — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a known current submission end time.
- **Test data.** Fixed time: exactly the current submission end time; Reason: "QA fixed-time boundary check"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ 3. Note the current submission end time including minutes 4. Click "Extend Time" 5. Select "Submission" 6. Select "Fixed" 7. Enter the noted current submission end time 8. Type "QA fixed-time boundary check" in the "Reason" field 9. Click "Save"
- **Expected.** The fixed time is not saved. The submission end time remains unchanged and the app shows a refusal or validation message stating that the selected time must be later than the current end. Record the exact message shown.
- **Oracle.** The fixed time is not saved. The submission end time remains unchanged and the app shows a refusal or validation message stating that the selected time must be later than the current end. Record the exact message shown.
- **Trace.** High · Edge · draft · `GEN-JRN-099` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 2 hours using Custom and check the end moved by exactly 2 hours, then extend again by 1 day and check the end moved by exactly 1 more day, then tr”

### GEN-JRN-100 — Extending submission time re-locks unlocked bids

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 2 hours using Custom and check the end moved by exactly 2 hours, then exten", grounded in rule R-6. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 2 hours using C — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ whose submission window is still active and whose bids have already been unlocked.
- **Test data.** Extension: Custom, 1 hour; Reason: "QA re-lock check"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ 3. Open the "Responses" tab 4. Confirm that the bids are unlocked and bid details are visible 5. Click "Extend Time" 6. Select "Submission" 7. Select "Custom" 8. Type "1" in the amount field 9. Select "Hours" 10. Type "QA re-lock check" in the "Reason" field 11. Click "Save" 12. Refresh the RFQ page 13. Open the "Responses" tab
- **Expected.** The submission end moves 1 hour later. The bids are locked again after the extension: bid details and bid actions that require unlocked bids are hidden or disabled, and the event remains live.
- **Oracle.** The submission end moves 1 hour later. The bids are locked again after the extension: bid details and bid actions that require unlocked bids are hidden or disabled, and the event remains live.
- **Trace.** Critical · Positive · draft · `GEN-JRN-100` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 2 hours using Custom and check the end moved by exactly 2 hours, then extend again by 1 day and check the end moved by exactly 1 more day, then tr”

### GEN-JRN-101 — Extending submission time ends a running best-offer window

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 2 hours using Custom and check the end moved by exactly 2 hours, then exten", grounded in rule R-7. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 2 hours using C — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a running Best Offer window and a submission end time more than 1 hour in the future.
- **Test data.** Extension: Custom, 1 hour; Reason: "QA best-offer state check"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ 3. Open the current Best Offer or best-offer window 4. Confirm that the best-offer window is running 5. Click "Extend Time" 6. Select "Submission" 7. Select "Custom" 8. Type "1" in the amount field 9. Select "Hours" 10. Type "QA best-offer state check" in the "Reason" field 11. Click "Save" 12. Refresh the RFQ page
- **Expected.** The submission end moves 1 hour later. The running Best Offer window ends immediately, its status changes from running to ended or closed, and no active Best Offer countdown remains.
- **Oracle.** The submission end moves 1 hour later. The running Best Offer window ends immediately, its status changes from running to ended or closed, and no active Best Offer countdown remains.
- **Trace.** High · Positive · draft · `GEN-JRN-101` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 2 hours using Custom and check the end moved by exactly 2 hours, then extend again by 1 day and check the end moved by exactly 1 more day, then tr”

### GEN-JRN-102 — An RFQ extension cannot move past the RFP end

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 2 hours using Custom and check the end moved by exactly 2 hours, then exten", grounded in rule R-8. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 2 hours using C — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live project with an active commercial RFQ and a technical RFP whose end time is earlier than the proposed new RFQ end time.
- **Test data.** Custom submission extension that would set the RFQ end 1 hour after the RFP end; Reason: "QA stage end boundary check"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live project 3. Open the commercial RFQ stage 4. Note the RFP end time and the current RFQ submission end time 5. Click "Extend Time" 6. Select "Submission" 7. Select "Custom" 8. Enter an amount that sets the RFQ end 1 hour after the RFP end 9. Select the appropriate time unit 10. Type "QA stage end boundary check" in the "Reason" field 11. Click "Save"
- **Expected.** The extension is refused. The RFQ submission end remains unchanged, and the app shows a message that the RFQ end cannot be later than the RFP end. Record the exact message shown.
- **Oracle.** The extension is refused. The RFQ submission end remains unchanged, and the app shows a message that the RFQ end cannot be later than the RFP end. Record the exact message shown.
- **Trace.** High · Negative · draft · `GEN-JRN-102` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 2 hours using Custom and check the end moved by exactly 2 hours, then extend again by 1 day and check the end moved by exactly 1 more day, then tr”

### GEN-JRN-103 — Reopening an ended RFQ depends on the super-admin setting

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 2 hours using Custom and check the end moved by exactly 2 hours, then exten", grounded in rule R-10. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 2 hours using C — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** An ended RFQ whose submission window has already closed.
- **Configs needed.** is_super_admin_allowed_to_reopen_event = Off — prevents a super admin from reopening an ended event
- **Test data.** Fixed submission time: 1 hour after the original end; Reason: "QA reopen permission check"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the ended RFQ 3. Click "Extend Time" 4. Select "Submission" 5. Select "Fixed" 6. Enter a time 1 hour after the original submission end 7. Type "QA reopen permission check" in the "Reason" field 8. Click "Save"
- **Expected.** The RFQ is not reopened. Its status remains ended, the submission end does not change, and the app shows a refusal message that the user is not allowed to reopen the event. Record the exact message shown.
- **Oracle.** The RFQ is not reopened. Its status remains ended, the submission end does not change, and the app shows a refusal message that the user is not allowed to reopen the event. Record the exact message shown.
- **Trace.** Critical · Negative · draft · `GEN-JRN-103` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 2 hours using Custom and check the end moved by exactly 2 hours, then extend again by 1 day and check the end moved by exactly 1 more day, then tr”

### GEN-JRN-104 — Submission end moves forward exactly one hour with 1‑Hour preset

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time with the an hour preset and check the end moved by exactly one hour; then set ", grounded in rule R-13. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time with the an hour p — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with submission end time at 12:00 PM, no extensions yet.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live RFQ 3. Click the three dots (⋮) at the top right of the project page and choose "Extend time" 4. In the "Extend time" drawer select "Submission" as the time to extend 5. Select "Preset" as the option and choose "1 Hour" from the list 6. Click "Apply"
- **Expected.** The submission end badge now shows 1:00 PM (exactly one hour after the previous end). A toast appears with the message "Submission deadline extended by 1 hour".
- **Oracle.** The submission end badge now shows 1:00 PM (exactly one hour after the previous end). A toast appears with the message "Submission deadline extended by 1 hour".
- **Trace.** Critical · Positive · draft · `GEN-JRN-104` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time with the an hour preset and check the end moved by exactly one hour; then set a fixed time 30 minutes after the current end and check the end is exac”

### GEN-JRN-105 — Submission end moves to exact fixed time 30 minutes after current end

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time with the an hour preset and check the end moved by exactly one hour; then set ", grounded in rule R-13. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time with the an hour p — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ whose current submission end time is 1:00 PM (after the previous 1‑hour preset extension).
- **Test data.** Fixed time = 1:30 PM
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live RFQ 3. Click the three dots (⋮) at the top right of the project page and choose "Extend time" 4. In the "Extend time" drawer select "Submission" as the time to extend 5. Select "Fixed" as the option and type "1:30 PM" into the "New end time" field 6. Click "Apply"
- **Expected.** The submission end badge now shows 1:30 PM. A toast appears with the message "Submission deadline set to 1:30 PM".
- **Oracle.** The submission end badge now shows 1:30 PM. A toast appears with the message "Submission deadline set to 1:30 PM".
- **Trace.** High · Positive · draft · `GEN-JRN-105` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time with the an hour preset and check the end moved by exactly one hour; then set a fixed time 30 minutes after the current end and check the end is exac”

### GEN-JRN-106 — Fixed‑time extension 10 minutes before current end is refused

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time with the an hour preset and check the end moved by exactly one hour; then set ", grounded in rule R-13. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time with the an hour p — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ whose current submission end time is 1:30 PM (after the previous fixed‑time extension).
- **Test data.** Fixed time = 1:20 PM (10 minutes before current end)
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live RFQ 3. Click the three dots (⋮) at the top right of the project page and choose "Extend time" 4. In the "Extend time" drawer select "Submission" as the time to extend 5. Select "Fixed" as the option and type "1:20 PM" into the "New end time" field 6. Click "Apply"
- **Expected.** A modal appears with the error message "New end time must be later than the current submission deadline" and the "Apply" button remains disabled.
- **Oracle.** A modal appears with the error message "New end time must be later than the current submission deadline" and the "Apply" button remains disabled.
- **Trace.** Critical · Negative · draft · `GEN-JRN-106` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time with the an hour preset and check the end moved by exactly one hour; then set a fixed time 30 minutes after the current end and check the end is exac”

### GEN-JRN-107 — Fixed‑time extension to a past date is refused

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time with the an hour preset and check the end moved by exactly one hour; then set ", grounded in rule R-13. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time with the an hour p — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ whose current submission end time is 1:30 PM on 2026‑11‑01.
- **Test data.** Fixed time = 2026‑10‑31 11:00 AM (a past date)
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live RFQ 3. Click the three dots (⋮) at the top right of the project page and choose "Extend time" 4. In the "Extend time" drawer select "Submission" as the time to extend 5. Select "Fixed" as the option and type "2026‑10‑31 11:00 AM" into the "New end time" field 6. Click "Apply"
- **Expected.** A modal appears with the error message "New end time cannot be in the past" and the "Apply" button remains disabled.
- **Oracle.** A modal appears with the error message "New end time cannot be in the past" and the "Apply" button remains disabled.
- **Trace.** Critical · Negative · draft · `GEN-JRN-107` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time with the an hour preset and check the end moved by exactly one hour; then set a fixed time 30 minutes after the current end and check the end is exac”

### GEN-SCR-421 — Ask Clara starts the awarding flow for an analyze_data task

- **Why it matters.** Clara must show the awarding-flow success message and navigate to the URL returned for the task. Written from the project-id-details screen; grounded in R-FLA-017-4 (src/views/projectDetails/projectDetails.jsx:439-448); screenshot procol-ui-tests/evidence/plan-mvu39xh5/09-publish.png. **Draft, needs review** — written by the assistant on 2026-10-29 from what a screen shows and the rules in Procol's code; the automation built for it covers all of it.
- **Module / scenario.** Screen — project-id-details — button
- **Who.** Buyer · Buyer portal
- **Setup.** A project with a Clara todo whose type is analyze_data and a returned redirect_url of /awarding/UU5wY2Rk.
- **Configs needed.** isClaraEnabled = On — enables Clara on the project details page
- **Test data.** todo type = analyze_data; redirect_url = /awarding/UU5wY2Rk
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open /project/UU5wY2Rk/details 3. Click "Ask Clara"
- **Expected.** The message "Awarding initiated successfully, redirecting to awarding flow..." appears, and the browser navigates to /awarding/UU5wY2Rk.
- **Oracle.** The screen behaves as R-FLA-017-4 says: Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
- **Trace.** High · Positive · draft · `GEN-SCR-421` · layer ui · coverage full · typed: “screen project-id-details (/project/UU5wY2Rk/details)”

### GEN-SCR-422 — The copy control copies the displayed project ID

- **Why it matters.** The project details screen displays a Copy control next to the project information. Written from the project-id-details screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/plan-mvu39xh5/09-publish.png. **Draft, needs review** — written by the assistant on 2026-10-29 from what a screen shows and the rules in Procol's code; no automation could be built for it yet — Verify that the clipboard contains the displayed project ID after clicking Copy.; Paste the clipboard value into a plain-text editor.; Record the exact copied value and any confirmation shown..
- **Module / scenario.** Screen — project-id-details — button
- **Who.** Buyer · Buyer portal
- **Setup.** An open project whose displayed Project ID is #PRJ-2025-001.
- **Test data.** Project ID = #PRJ-2025-001
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open /project/UU5wY2Rk/details 3. Click "Copy" 4. Paste the clipboard value into a plain-text editor
- **Expected.** The value copied by "Copy" is available in the editor. It is the project value associated with the control; record the exact copied value and any confirmation shown.
- **Oracle.** What the tester sees on the project-id-details screen.
- **Trace.** Medium · Positive · draft · `GEN-SCR-422` · layer ui · coverage none · typed: “screen project-id-details (/project/UU5wY2Rk/details)”

### GEN-SCR-423 — Project opens its linked destination

- **Why it matters.** The screen shows a Project link that must open its linked project destination. Written from the project-id-details screen; grounded in what the screen shows; screenshot procol-ui-tests/evidence/plan-mvu39xh5/09-publish.png. **Draft, needs review** — written by the assistant on 2026-10-29 from what a screen shows and the rules in Procol's code; the automation covers part of it — not yet: Verify the URL changes from /project/UU5wY2Rk/details; Record the destination URL; Confirm the destination opened in the current tab; Record the resulting page title.
- **Module / scenario.** Screen — project-id-details — button
- **Who.** Buyer · Buyer portal
- **Setup.** The buyer is viewing /project/UU5wY2Rk/details for an existing project.
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open /project/UU5wY2Rk/details 3. Click "Project"
- **Expected.** The linked Project destination opens in the current tab, the URL changes from /project/UU5wY2Rk/details, and the resulting page is displayed. Record the destination URL and page title.
- **Oracle.** What the tester sees on the project-id-details screen.
- **Trace.** Medium · Positive · draft · `GEN-SCR-423` · layer ui · coverage partial · typed: “screen project-id-details (/project/UU5wY2Rk/details)”

### GEN-JRN-108 — Submission time cannot be saved without a reason

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time with the an hour preset and check the end moved by exactly one hour; then set ", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time with the an hour p — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with submission end time E and no award proposal submitted
- **Test data.** Preset: an hour; Reason: -
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Click "Extend Time" 5. Select "Submission" 6. Select "An hour" 7. Leave the "Reason" field empty 8. Click "Save"
- **Expected.** The time change is not saved. The submission end remains E, and a validation message is shown for the required "Reason" field; record the exact message.
- **Oracle.** The time change is not saved. The submission end remains E, and a validation message is shown for the required "Reason" field; record the exact message.
- **Trace.** High · Negative · draft · `GEN-JRN-108` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time with the an hour preset and check the end moved by exactly one hour; then set a fixed time 30 minutes after the current end and check the end is exac”

### GEN-JRN-109 — A one-hour extension records the reason and changes the event state

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time with the an hour preset and check the end moved by exactly one hour; then set ", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time with the an hour p — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with submission end time E and no award proposal submitted
- **Test data.** Preset: an hour; Reason: QA one-hour submission extension
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Click "Extend Time" 5. Select "Submission" 6. Select "An hour" 7. Type "QA one-hour submission extension" in the "Reason" field 8. Click "Save" 9. Refresh the RFQ page 10. Open the event activity or change history
- **Expected.** The live status badge is still shown. The submission end is E + 1 hour, with no minute or second difference. The activity or change history shows the submission extension and the reason "QA one-hour submission extension"; record the displayed timestamp and actor.
- **Oracle.** The live status badge is still shown. The submission end is E + 1 hour, with no minute or second difference. The activity or change history shows the submission extension and the reason "QA one-hour submission extension"; record the displayed timestamp and actor.
- **Trace.** High · Positive · draft · `GEN-JRN-109` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time with the an hour preset and check the end moved by exactly one hour; then set a fixed time 30 minutes after the current end and check the end is exac”

### GEN-JRN-110 — A fixed submission end equal to the current end is handled consistently

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time with the an hour preset and check the end moved by exactly one hour; then set ", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time with the an hour p — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with current submission end E and no award proposal submitted
- **Test data.** Fixed time: exactly E; Reason: QA unchanged submission end
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the live RFQ 3. Open the RFQ stage's "Responses" tab 4. Click "Extend Time" 5. Select "Submission" 6. Select "Fixed time" 7. Enter the current submission end E in the date and time fields 8. Type "QA unchanged submission end" in the "Reason" field 9. Click "Save"
- **Expected.** Record whether the save is accepted or refused. If it is accepted, the submission end remains exactly E and the event remains live. If it is refused, the submission end remains E and the app's displayed message is recorded.
- **Oracle.** Record whether the save is accepted or refused. If it is accepted, the submission end remains exactly E and the event remains live. If it is refused, the submission end remains E and the app's displayed message is recorded.
- **Trace.** Medium · Edge · draft · `GEN-JRN-110` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time with the an hour preset and check the end moved by exactly one hour; then set a fixed time 30 minutes after the current end and check the end is exac”

### GEN-JRN-111 — An ended RFQ cannot be reopened by a normal buyer

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time with the an hour preset and check the end moved by exactly one hour; then set ", grounded in rule R-10. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time with the an hour p — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** An RFQ whose submission end has passed and whose status is ended, with no award proposal submitted
- **Configs needed.** is_super_admin_allowed_to_reopen_event = Off — prevents a super admin from reopening an ended event
- **Test data.** Fixed time: current time + 30 minutes; Reason: QA reopen attempt
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the ended RFQ 3. Open the RFQ stage's "Responses" tab 4. Click "Extend Time" 5. Select "Submission" 6. Select "Fixed time" 7. Enter a time 30 minutes after the current time in the date and time fields 8. Type "QA reopen attempt" in the "Reason" field 9. Click "Save"
- **Expected.** The extension is refused because saving it would reopen the ended RFQ. The status remains ended, the submission end does not change, and the app shows the reopen refusal message; record the exact message.
- **Oracle.** The extension is refused because saving it would reopen the ended RFQ. The status remains ended, the submission end does not change, and the app shows the reopen refusal message; record the exact message.
- **Trace.** Critical · Negative · draft · `GEN-JRN-111` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time with the an hour preset and check the end moved by exactly one hour; then set a fixed time 30 minutes after the current end and check the end is exac”

### GEN-JRN-112 — A permitted super admin can reopen an ended RFQ

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time with the an hour preset and check the end moved by exactly one hour; then set ", grounded in rule R-10. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time with the an hour p — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** An RFQ whose submission end has passed and whose status is ended, with the logged-in buyer user also having super admin access
- **Configs needed.** is_super_admin_allowed_to_reopen_event = On — allows a super admin to reopen an ended event
- **Test data.** Fixed time: current time + 30 minutes; Reason: QA approved reopen
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" and open the ended RFQ 3. Open the RFQ stage's "Responses" tab 4. Click "Extend Time" 5. Select "Submission" 6. Select "Fixed time" 7. Enter a time 30 minutes after the current time in the date and time fields 8. Type "QA approved reopen" in the "Reason" field 9. Click "Save" 10. Refresh the RFQ page
- **Expected.** The save is accepted for the permitted super admin. The submission end is exactly 30 minutes after the time entered at save, the status changes from ended to live or the app's equivalent active status, and the reason "QA approved reopen" is recorded in the event history.
- **Oracle.** The save is accepted for the permitted super admin. The submission end is exactly 30 minutes after the time entered at save, the status changes from ended to live or the app's equivalent active status, and the reason "QA approved reopen" is recorded in the event history.
- **Trace.** High · Positive · draft · `GEN-JRN-112` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time with the an hour preset and check the end moved by exactly one hour; then set a fixed time 30 minutes after the current end and check the end is exac”

### GEN-JRN-113 — A reason is required when the submission end is extended

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly t", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, set the submission end with Fixed time to 30  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a known current submission end time E. The event was created with Invite Vendor and has not ended.
- **Test data.** Submission end: E + 30 minutes; Reason: blank
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ's summary 3. Click the submission end time control 4. Select "Fixed time" 5. Enter E + 30 minutes in the fixed time field 6. Leave the "Reason" field blank 7. Click "Save"
- **Expected.** The submission end is not changed. The RFQ remains live, and the form shows a refusal or validation message that a reason is required. Record the exact message shown.
- **Oracle.** The submission end is not changed. The RFQ remains live, and the form shows a refusal or validation message that a reason is required. Record the exact message shown.
- **Trace.** High · Negative · draft · `GEN-JRN-113` · layer ui · coverage none · typed: “journey: On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly that time; then try a fixed time 10 minutes before the current end and c”

### GEN-JRN-114 — The reason for an extension is retained in the event history

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly t", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, set the submission end with Fixed time to 30  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a known current submission end time E. The event was created with Invite Vendor and has not ended.
- **Test data.** Submission end: E + 30 minutes; Reason: "QA extension check"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ's summary 3. Click the submission end time control 4. Select "Fixed time" 5. Enter E + 30 minutes in the fixed time field 6. Type "QA extension check" in the "Reason" field 7. Click "Save" 8. Open the RFQ's "Activity" or event history view
- **Expected.** The submission end shows exactly E + 30 minutes. The event history contains an entry for the submission-end change with the reason "QA extension check" and the changed end time.
- **Oracle.** The submission end shows exactly E + 30 minutes. The event history contains an entry for the submission-end change with the reason "QA extension check" and the changed end time.
- **Trace.** High · Positive · draft · `GEN-JRN-114` · layer ui · coverage none · typed: “journey: On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly that time; then try a fixed time 10 minutes before the current end and c”

### GEN-JRN-115 — A fixed submission end equal to the current end is handled at the boundary

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly t". **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, set the submission end with Fixed time to 30  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with a known current submission end time E. The event was created with Invite Vendor and has not ended.
- **Test data.** Submission end: exactly E; Reason: "QA equal-end boundary"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ's summary 3. Click the submission end time control 4. Select "Fixed time" 5. Enter exactly E in the fixed time field 6. Type "QA equal-end boundary" in the "Reason" field 7. Click "Save"
- **Expected.** Record what happens when the fixed time is exactly equal to the current submission end, including whether the save is accepted or refused, the message shown, the displayed end time, and the RFQ status.
- **Oracle.** Record what happens when the fixed time is exactly equal to the current submission end, including whether the save is accepted or refused, the message shown, the displayed end time, and the RFQ status.
- **Trace.** Medium · Edge · draft · `GEN-JRN-115` · layer ui · coverage none · typed: “journey: On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly that time; then try a fixed time 10 minutes before the current end and c”

### GEN-JRN-116 — A refused earlier time does not change a previously extended end

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly t", grounded in rule R-6. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, set the submission end with Fixed time to 30  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ whose original submission end was E and whose submission end has already been changed successfully to E + 30 minutes.
- **Test data.** New fixed submission end: E + 20 minutes, which is 10 minutes before the current end; Reason: "QA earlier-time check"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ's summary 3. Confirm that the submission end shows E + 30 minutes 4. Click the submission end time control 5. Select "Fixed time" 6. Enter E + 20 minutes in the fixed time field 7. Type "QA earlier-time check" in the "Reason" field 8. Click "Save"
- **Expected.** The app refuses the change and shows its refusal message. The submission end remains exactly E + 30 minutes, the RFQ remains live, and no new successful end-time change is shown in the event history.
- **Oracle.** The app refuses the change and shows its refusal message. The submission end remains exactly E + 30 minutes, the RFQ remains live, and no new successful end-time change is shown in the event history.
- **Trace.** Critical · Negative · draft · `GEN-JRN-116` · layer ui · coverage none · typed: “journey: On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly that time; then try a fixed time 10 minutes before the current end and c”

### GEN-JRN-117 — A buyer cannot reopen an expired RFQ by setting a later fixed time

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly t", grounded in rule R-4. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, set the submission end with Fixed time to 30  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** An expired RFQ whose submission end has passed and whose status is ended. The event was created with Invite Vendor.
- **Configs needed.** is_user_allowed_to_reopen_event = Off — prevents a regular user from reopening an expired event
- **Test data.** Fixed submission end: current time + 30 minutes; Reason: "QA expired-event check"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the expired RFQ's summary 3. Click the submission end time control 4. Select "Fixed time" 5. Enter current time + 30 minutes in the fixed time field 6. Type "QA expired-event check" in the "Reason" field 7. Click "Save"
- **Expected.** The app refuses to reopen the expired RFQ and shows its refusal message. The status remains ended, the submission end is unchanged, and no live bidding window is opened.
- **Oracle.** The app refuses to reopen the expired RFQ and shows its refusal message. The status remains ended, the submission end is unchanged, and no live bidding window is opened.
- **Trace.** Critical · Negative · draft · `GEN-JRN-117` · layer ui · coverage none · typed: “journey: On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly that time; then try a fixed time 10 minutes before the current end and c”

### GEN-JRN-118 — A permitted super admin can reopen an expired RFQ

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly t", grounded in rule R-4. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, set the submission end with Fixed time to 30  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** An expired RFQ whose submission end has passed and whose status is ended. The event was created with Invite Vendor.
- **Configs needed.** is_super_admin_allowed_to_reopen_event = On — allows a super admin to reopen an expired RFQ
- **Test data.** Fixed submission end: current time + 30 minutes; Reason: "QA authorised reopen"
- **Steps.** 1. Log in to Procol (buyer side) with the super admin user 2. Open the expired RFQ's summary 3. Click the submission end time control 4. Select "Fixed time" 5. Enter current time + 30 minutes in the fixed time field 6. Type "QA authorised reopen" in the "Reason" field 7. Click "Save"
- **Expected.** The RFQ reopens successfully. Its status changes to live, the submission end shows exactly current time + 30 minutes, bidding controls are available again, and the event history records the reason "QA authorised reopen".
- **Oracle.** The RFQ reopens successfully. Its status changes to live, the submission end shows exactly current time + 30 minutes, bidding controls are available again, and the event history records the reason "QA authorised reopen".
- **Trace.** High · Positive · draft · `GEN-JRN-118` · layer ui · coverage none · typed: “journey: On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly that time; then try a fixed time 10 minutes before the current end and c”

### GEN-JRN-119 — A fixed submission extension keeps the entered reason in the activity log

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly t", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, set the submission end with Fixed time to 30  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with the submission end displayed as 15 June 2025 15:00, no award proposal submitted, and at least one invited vendor
- **Test data.** New fixed submission end: 15 June 2025 15:30
Reason: Buyer-approved 30 minute extension
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the prepared live RFQ 3. Open the RFQ summary 4. Click the submission end time control 5. Select "Fixed time" 6. Enter 15 June 2025 15:30 in the end time field 7. Enter Buyer-approved 30 minute extension in the reason field 8. Click "Save" 9. Open the activity log
- **Expected.** The submission end on the summary is 15 June 2025 15:30, exactly 30 minutes after 15:00. The activity log shows the submission-time change and the reason "Buyer-approved 30 minute extension".
- **Oracle.** The submission end on the summary is 15 June 2025 15:30, exactly 30 minutes after 15:00. The activity log shows the submission-time change and the reason "Buyer-approved 30 minute extension".
- **Trace.** High · Positive · draft · `GEN-JRN-119` · layer ui · coverage none · typed: “journey: On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly that time; then try a fixed time 10 minutes before the current end and c”

### GEN-JRN-120 — The submission end cannot be changed without a reason

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly t", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, set the submission end with Fixed time to 30  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with the submission end displayed as 15 June 2025 15:00 and no award proposal submitted
- **Test data.** New fixed submission end: 15 June 2025 15:30
Reason: blank
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the prepared live RFQ 3. Open the RFQ summary 4. Click the submission end time control 5. Select "Fixed time" 6. Enter 15 June 2025 15:30 in the end time field 7. Leave the reason field blank 8. Click "Save"
- **Expected.** The change is not saved. The reason field is marked as required and the app shows a validation message containing "reason". The submission end remains 15 June 2025 15:00.
- **Oracle.** The change is not saved. The reason field is marked as required and the app shows a validation message containing "reason". The submission end remains 15 June 2025 15:00.
- **Trace.** High · Negative · draft · `GEN-JRN-120` · layer ui · coverage none · typed: “journey: On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly that time; then try a fixed time 10 minutes before the current end and c”

### GEN-JRN-121 — A fixed submission end one second after the current end is accepted

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly t". **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, set the submission end with Fixed time to 30  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with the submission end displayed as 15 June 2025 15:00:00 and no award proposal submitted
- **Test data.** New fixed submission end: 15 June 2025 15:00:01
Reason: One-second boundary check
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the prepared live RFQ 3. Open the RFQ summary 4. Click the submission end time control 5. Select "Fixed time" 6. Enter 15 June 2025 15:00:01 in the end time field 7. Enter One-second boundary check in the reason field 8. Click "Save"
- **Expected.** The app accepts the change and shows the submission end as 15 June 2025 15:00:01. The event remains live and the new end is one second after the previous end.
- **Oracle.** The app accepts the change and shows the submission end as 15 June 2025 15:00:01. The event remains live and the new end is one second after the previous end.
- **Trace.** Medium · Edge · draft · `GEN-JRN-121` · layer ui · coverage none · typed: “journey: On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly that time; then try a fixed time 10 minutes before the current end and c”

### GEN-JRN-122 — A refused submission-time change does not alter the saved end

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly t", grounded in rule R-8. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, set the submission end with Fixed time to 30  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with the submission end displayed as 15 June 2025 15:00 and no award proposal submitted
- **Test data.** New fixed submission end: 15 June 2025 14:50
Reason: Invalid earlier end
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the prepared live RFQ 3. Open the RFQ summary 4. Note the displayed submission end 5. Click the submission end time control 6. Select "Fixed time" 7. Enter 15 June 2025 14:50 in the end time field 8. Enter Invalid earlier end in the reason field 9. Click "Save" 10. Refresh the RFQ summary
- **Expected.** The app refuses the change and shows its refusal message. After refresh, the submission end is still 15 June 2025 15:00, the event is still live, and no additional time-change entry is created for 15 June 2025 14:50.
- **Oracle.** The app refuses the change and shows its refusal message. After refresh, the submission end is still 15 June 2025 15:00, the event is still live, and no additional time-change entry is created for 15 June 2025 14:50.
- **Trace.** High · Negative · draft · `GEN-JRN-122` · layer ui · coverage none · typed: “journey: On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly that time; then try a fixed time 10 minutes before the current end and c”

### GEN-JRN-123 — A submission extension is refused after an award proposal is submitted

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly t", grounded in rule R-8. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, set the submission end with Fixed time to 30  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with the submission end displayed as 15 June 2025 15:00 and an award proposal already submitted
- **Test data.** New fixed submission end: 15 June 2025 15:30
Reason: Extension after proposal
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the live RFQ with the submitted award proposal 3. Open the RFQ summary 4. Click the submission end time control 5. Select "Fixed time" 6. Enter 15 June 2025 15:30 in the end time field 7. Enter Extension after proposal in the reason field 8. Click "Save"
- **Expected.** The app refuses the change with its award-proposal restriction message, including error code or text "801" if shown. The submission end remains 15 June 2025 15:00.
- **Oracle.** The app refuses the change with its award-proposal restriction message, including error code or text "801" if shown. The submission end remains 15 June 2025 15:00.
- **Trace.** Critical · Negative · draft · `GEN-JRN-123` · layer ui · coverage none · typed: “journey: On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly that time; then try a fixed time 10 minutes before the current end and c”

### GEN-JRN-124 — A live RFQ does not become expired while a future fixed end is saved

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly t", grounded in rule R-6. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, set the submission end with Fixed time to 30  — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with the submission end displayed as 15 June 2025 15:00 and the current time before 15 June 2025 15:30
- **Test data.** New fixed submission end: 15 June 2025 15:30
Reason: Confirm future live window
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Open the prepared live RFQ 3. Open the RFQ summary 4. Click the submission end time control 5. Select "Fixed time" 6. Enter 15 June 2025 15:30 in the end time field 7. Enter Confirm future live window in the reason field 8. Click "Save" 9. Close and reopen the RFQ summary
- **Expected.** The submission end remains 15 June 2025 15:30 after reopening. The status badge remains "Live" and the RFQ still accepts submissions until that displayed end time; it is not marked "Expired" or "Closed".
- **Oracle.** The submission end remains 15 June 2025 15:30 after reopening. The status badge remains "Live" and the RFQ still accepts submissions until that displayed end time; it is not marked "Expired" or "Closed".
- **Trace.** High · Positive · draft · `GEN-JRN-124` · layer ui · coverage none · typed: “journey: On a live RFQ, set the submission end with Fixed time to 30 minutes after the current end and check the end is exactly that time; then try a fixed time 10 minutes before the current end and c”

### GEN-JRN-125 — Custom submission time increases the end by exactly 15 minutes

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end is 15 minutes later", grounded in rule R-7. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with no submitted award proposal and a submission end time of 10:00.
- **Test data.** Custom; amount 15; unit Minutes
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" 3. Open the live RFQ 4. Open the event's "Responses" tab 5. Click "Extend Time" 6. Select "Custom" 7. Type 15 in the amount field 8. Select "Minutes" 9. Click "Save"
- **Expected.** The extension is saved. The RFQ remains live, and the submission end changes from 10:00 to 10:15. The time shown in the event and the extension control is 15 minutes later than before.
- **Oracle.** The extension is saved. The RFQ remains live, and the submission end changes from 10:00 to 10:15. The time shown in the event and the extension control is 15 minutes later than before.
- **Trace.** Critical · Positive · draft · `GEN-JRN-125` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end is 15 minutes later”

### GEN-JRN-126 — A submitted award proposal prevents submission time extension

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end is 15 minutes later", grounded in rule R-2. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ whose award proposal has already been submitted.
- **Test data.** Custom; amount 15; unit Minutes
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" 3. Open the live RFQ 4. Open the event's "Responses" tab 5. Click "Extend Time" 6. Select "Custom" 7. Type 15 in the amount field 8. Select "Minutes" 9. Click "Save"
- **Expected.** The submission end does not change and the RFQ does not move to a new submission window. The application refuses the save with its own award-proposal validation message. Record the exact message shown.
- **Oracle.** The submission end does not change and the RFQ does not move to a new submission window. The application refuses the save with its own award-proposal validation message. Record the exact message shown.
- **Trace.** Critical · Negative · draft · `GEN-JRN-126` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end is 15 minutes later”

### GEN-JRN-127 — A zero-minute custom extension is not accepted

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end is 15 minutes later". **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with no submitted award proposal and a submission end time of 10:00.
- **Test data.** Custom; amount 0; unit Minutes
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" 3. Open the live RFQ 4. Open the event's "Responses" tab 5. Click "Extend Time" 6. Select "Custom" 7. Type 0 in the amount field 8. Select "Minutes" 9. Click "Save"
- **Expected.** The application does not create a later submission end for a zero-minute extension. Record whether the field validation or the save response refuses the value, including the exact message shown.
- **Oracle.** The application does not create a later submission end for a zero-minute extension. Record whether the field validation or the save response refuses the value, including the exact message shown.
- **Trace.** High · Edge · draft · `GEN-JRN-127` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end is 15 minutes later”

### GEN-JRN-128 — A custom extension with no amount is not saved

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end is 15 minutes later". **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with no submitted award proposal and a submission end time of 10:00.
- **Test data.** Custom; amount blank; unit Minutes
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" 3. Open the live RFQ 4. Open the event's "Responses" tab 5. Click "Extend Time" 6. Select "Custom" 7. Leave the amount field blank 8. Select "Minutes" 9. Click "Save"
- **Expected.** The application does not save the extension. The amount field shows its required-field validation, the submission end remains 10:00, and the RFQ remains live.
- **Oracle.** The application does not save the extension. The amount field shows its required-field validation, the submission end remains 10:00, and the RFQ remains live.
- **Trace.** High · Negative · draft · `GEN-JRN-128` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end is 15 minutes later”

### GEN-JRN-129 — The vendor submission task ends at the extended submission time

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end is 15 minutes later", grounded in rule R-4. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with Vendor A as a participant, a submission end time of 10:00, and an active vendor task named "Submit RFQ Bid".
- **Test data.** Custom; amount 15; unit Minutes
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" 3. Open the live RFQ 4. Open the event's "Responses" tab 5. Click "Extend Time" 6. Select "Custom" 7. Type 15 in the amount field 8. Select "Minutes" 9. Click "Save" 10. Log out of the buyer portal 11. Log in to Procol (vendor side) with the QA test vendor user for Vendor A 12. Open the "Submit RFQ Bid" task for the RFQ
- **Expected.** The buyer sees the submission end at 10:15. Vendor A's "Submit RFQ Bid" task remains available and its due time is 10:15, not 10:00.
- **Oracle.** The buyer sees the submission end at 10:15. Vendor A's "Submit RFQ Bid" task remains available and its due time is 10:15, not 10:00.
- **Trace.** High · Positive · draft · `GEN-JRN-129` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end is 15 minutes later”

### GEN-JRN-130 — The extension control does not save after the RFQ has ended without reopening

- **Why it matters.** A senior tester's addition to the journey "On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end is 15 minutes later", grounded in rule R-2. **Draft, needs review** — written by the assistant on 2026-10-29 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — On a live RFQ, extend the submission time by 15 minutes usin — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** An ended RFQ with a submission end time of 10:00 and no submitted award proposal.
- **Test data.** Custom; amount 15; unit Minutes
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" 3. Open the ended RFQ 4. Open the event's "Responses" tab 5. Click "Extend Time" 6. Select "Custom" 7. Type 15 in the amount field 8. Select "Minutes" 9. Click "Save"
- **Expected.** Record what happens when an ended RFQ is given a later submission end: whether the application reopens the RFQ and changes the end to 10:15, or refuses the save. The resulting status badge, end time, and exact application message are recorded.
- **Oracle.** Record what happens when an ended RFQ is given a later submission end: whether the application reopens the RFQ and changes the end to 10:15, or refuses the save. The resulting status badge, end time, and exact application message are recorded.
- **Trace.** Medium · Edge · draft · `GEN-JRN-130` · layer ui · coverage none · typed: “journey: On a live RFQ, extend the submission time by 15 minutes using Custom and check the new end is 15 minutes later”

