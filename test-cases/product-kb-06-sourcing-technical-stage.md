# Product KB test cases — Sourcing › RFP / Technical Stage

Generated from the Procol Notion Knowledge Base (help-centre articles) — each case is grounded in the article it traces to. Source pages are read-only; re-derive from Notion rather than editing facts here.

## 1. How to setup a Technical Stage Event?

#### PRD-KBSRC-395 — Apply one RFP template to all line items via bulk Select Template

- **Why it matters.** The technical stage needs a template on every line item before vendors can respond.
- **Setup.** Buyer creating a sourcing event that has a Technical Stage and several line items.
- **Steps.**
  1. Click on Technical Stage to review it.
  2. Click on Select Template to apply an RFP Template for all the Line Items via Bulk Action.
- **Expected.** The same template is applied to all line items.
- **Oracle.** Every line item shows the selected RFP template.
- **Trace.** P1 · automate-later · `54492226c8b282f3906301d6cbfe2ca2` · `how-to-setup-a-technical-stage-event` · Notion KB › Sourcing › RFP / Technical Stage › How to setup a Technical Stage Event?

#### PRD-KBSRC-396 — Select a Vendor Assessment template

- **Why it matters.** The vendor assessment collects vendor-level technical information in the stage.
- **Setup.** Buyer on the Technical Stage of a sourcing event being created.
- **Steps.**
  1. Click on select template under the "Vendor Assessment" section.
  2. Choose a template.
- **Expected.** The chosen template is set for the Vendor Assessment section.
- **Oracle.** The Vendor Assessment section shows the selected template.
- **Trace.** P2 · automate-later · `54492226c8b282f3906301d6cbfe2ca2` · `how-to-setup-a-technical-stage-event` · Notion KB › Sourcing › RFP / Technical Stage › How to setup a Technical Stage Event?

#### PRD-KBSRC-397 — Assign a technical evaluator to a line item

- **Why it matters.** Without an evaluator nobody can rank the line item and the stage cannot complete.
- **Setup.** Buyer on the Technical Stage of a sourcing event being created; the intended evaluator is a user in the org.
- **Steps.**
  1. Click on "+ Add Evaluator" under the first line item.
  2. Search the user to assign as technical evaluator and select them.
- **Expected.** The user is assigned as technical evaluator for that line item.
- **Oracle.** The evaluator's name appears under the line item.
- **Trace.** P1 · automate-later · `54492226c8b282f3906301d6cbfe2ca2` · `how-to-setup-a-technical-stage-event` · Notion KB › Sourcing › RFP / Technical Stage › How to setup a Technical Stage Event?

#### PRD-KBSRC-398 — Every line item needs an evaluator assigned

- **Why it matters.** The article says to repeat the assignment for all line items "without fail".
- **Setup.** Buyer on the Technical Stage with several line items.
- **Steps.**
  1. Assign an evaluator to only some of the line items.
  2. Try to proceed with the event.
- **Expected.** Each line item must have a technical evaluator assigned.
- **Oracle.** A tester checks whether the product flags or blocks line items without an evaluator (the article does not state the behaviour).
- **Trace.** P1 · manual · `54492226c8b282f3906301d6cbfe2ca2` · `how-to-setup-a-technical-stage-event` · Notion KB › Sourcing › RFP / Technical Stage › How to setup a Technical Stage Event?

#### PRD-KBSRC-399 — Evaluators can rank T1/T2/T3 or TA/TNA

- **Why it matters.** The rank types define what the buyer later sees as technical outcome.
- **Setup.** Technical evaluator assigned on a technical stage with vendor responses.
- **Steps.**
  1. As the evaluator, open a line item's evaluation.
  2. Review the available rank options.
- **Expected.** The evaluator can assign ranks (T1, T2, T3) or (TA - Technically Accepted or TNA - Technically Not Accepted).
- **Oracle.** The rank options offered match these values.
- **Trace.** P2 · automate-later · `54492226c8b282f3906301d6cbfe2ca2` · `how-to-setup-a-technical-stage-event` · Notion KB › Sourcing › RFP / Technical Stage › How to setup a Technical Stage Event?

## 2. How to run a Technical Stage Event?

#### PRD-KBSRC-400 — Send vendor submissions to evaluation

- **Why it matters.** Send to Evaluation hands the stage to the technical evaluators; without it nothing gets ranked.
- **Setup.** Buyer with a published RFX event that has a Technical Stage; all vendors have submitted bids.
- **Steps.**
  1. Navigate to the Technical Stage Tab.
  2. Wait for the vendors to place their bids.
  3. Click the blue **"Send to Evaluation"** button.
- **Expected.** A notification is sent and the technical evaluator gets access to evaluate and assign technical ranks to all line items; the Evaluation time starts.
- **Oracle.** The evaluator receives the notification and can open the stage for evaluation; an Evaluation time is shown.
- **Trace.** P1 · automate-later · `84c92226c8b28359ba4501eb60a2619b` · `how-to-run-a-technical-stage-event` · Notion KB › Sourcing › RFP / Technical Stage › How to run a Technical Stage Event?

#### PRD-KBSRC-401 — Technical Stage screen updates as vendors place bids

- **Why it matters.** Buyers track vendor technical submissions from this screen.
- **Setup.** Buyer with a published RFX event that has a Technical Stage.
- **Steps.**
  1. Open the Technical Stage Tab before vendors bid.
  2. Have a vendor place a bid and reopen the tab.
- **Expected.** Once vendors place their bids, the screen shows their submissions.
- **Oracle.** The vendor's submission appears on the Technical Stage tab.
- **Trace.** P2 · automate-later · `84c92226c8b28359ba4501eb60a2619b` · `how-to-run-a-technical-stage-event` · Notion KB › Sourcing › RFP / Technical Stage › How to run a Technical Stage Event?

#### PRD-KBSRC-402 — Buyer increases the Evaluation time

- **Why it matters.** Evaluators may need more time than first allowed.
- **Setup.** Buyer on a technical stage after Send to Evaluation.
- **Steps.**
  1. Increase the Evaluation time.
- **Expected.** The Evaluation time is increased.
- **Oracle.** A tester confirms the evaluation end time moved (the article does not name the control).
- **Trace.** P2 · manual · `84c92226c8b28359ba4501eb60a2619b` · `how-to-run-a-technical-stage-event` · Notion KB › Sourcing › RFP / Technical Stage › How to run a Technical Stage Event?

#### PRD-KBSRC-403 — Buyer cannot see technical evaluations before ranks are submitted and approved

- **Why it matters.** Technical results must stay hidden from the buyer until verified, to keep commercial decisions clean.
- **Setup.** Buyer on a technical stage; the evaluator has not yet submitted ranks, or approval is pending.
- **Steps.**
  1. As buyer, open the Technical Stage while evaluation or approval is pending.
  2. After the evaluator submits and all approvals are provided, open it again.
- **Expected.** Only once the evaluator submits the technical rankings and the necessary approvals are provided can the buyer see the technical evaluations.
- **Oracle.** Rankings are hidden before approval and visible after.
- **Trace.** P1 · automate-later · `84c92226c8b28359ba4501eb60a2619b` · `how-to-run-a-technical-stage-event` · Notion KB › Sourcing › RFP / Technical Stage › How to run a Technical Stage Event?

## 3. How do I Evaluate a Technical Stage?

#### PRD-KBSRC-404 — Evaluator finds events marked "Evaluation Needed"

- **Why it matters.** Evaluators rely on the widget to know which events await them.
- **Setup.** Technical Evaluator assigned to an event that has been sent to evaluation.
- **Steps.**
  1. Log in and navigate to the **Events** page.
  2. Locate the event.
  3. Click on it to open the **Project Details** page.
- **Expected.** The event card carries a status widget "Evaluation Needed", and clicking it opens Project Details.
- **Oracle.** The "Evaluation Needed" widget is on the card and the Project Details page opens.
- **Trace.** P1 · automate-later · `2a492226c8b282d0b9e681eaa9204a55` · `how-do-i-evaluate-a-technical-stage` · Notion KB › Sourcing › RFP / Technical Stage › How do I Evaluate a Technical Stage?

#### PRD-KBSRC-405 — Evaluate line items and submit the score for approval

- **Why it matters.** Submitting scores creates the Technical Recommendation that goes to approval.
- **Setup.** Technical Evaluator on an event with vendor submissions and an approval workflow configured.
- **Steps.**
  1. From **Project Details**, click the **Technical Stage** tab.
  2. In a submission's evaluation section click the plus icon / **"Add Evaluation"**.
  3. Select a rank and add a remark, then click **"OK"**; repeat for all vendors and line items.
  4. Click **"Submit Score"** (blue, top right).
  5. Select an Approval Workflow and click Next.
  6. Enter closing remarks, review the workflow and click **"Submit"**.
- **Expected.** The evaluation is sent for approval and the evaluator is taken to the **Approval Page** showing workflow progress.
- **Oracle.** The Approval Page is displayed with the workflow progress.
- **Trace.** P1 · automate-later · `2a492226c8b282d0b9e681eaa9204a55` · `how-do-i-evaluate-a-technical-stage` · Notion KB › Sourcing › RFP / Technical Stage › How do I Evaluate a Technical Stage?

#### PRD-KBSRC-406 — Binary evaluation: Technically Accepted / Technically Not Accepted

- **Why it matters.** Binary acceptance is one of the two ranking modes.
- **Setup.** Technical Evaluator on a technical stage using binary evaluation.
- **Steps.**
  1. Click "Add Evaluation" on a line item.
  2. Choose Technically Accepted (TA) or Technically Not Accepted (DNA), add a remark and click "OK".
- **Expected.** The chosen binary rank is saved on the line item.
- **Oracle.** The line item shows TA or DNA.
- **Trace.** P2 · automate-later · `2a492226c8b282d0b9e681eaa9204a55` · `how-do-i-evaluate-a-technical-stage` · Notion KB › Sourcing › RFP / Technical Stage › How do I Evaluate a Technical Stage?

#### PRD-KBSRC-407 — Ranked evaluation: T1, T2, T3

- **Why it matters.** Ranked evaluation orders vendors technically.
- **Setup.** Technical Evaluator on a technical stage using ranked evaluation.
- **Steps.**
  1. Click "Add Evaluation" on a line item.
  2. Assign a technical rank such as T1, T2 or T3, add a remark and click "OK".
- **Expected.** The rank is saved on the line item.
- **Oracle.** The line item shows the assigned T-rank.
- **Trace.** P2 · automate-later · `2a492226c8b282d0b9e681eaa9204a55` · `how-do-i-evaluate-a-technical-stage` · Notion KB › Sourcing › RFP / Technical Stage › How do I Evaluate a Technical Stage?

#### PRD-KBSRC-408 — Evaluation level follows the buyer's setting (line item or lot)

- **Why it matters.** Evaluators must evaluate at the level the buyer chose.
- **Setup.** Two events: one set by the buyer to line item level, one to lot level.
- **Steps.**
  1. As evaluator, click "Add Evaluation" in each event.
- **Expected.** Evaluation is at line item level or lot level (entire vendor), as set by the buyer.
- **Oracle.** The line-item event asks for a rank per line item; the lot event asks for one per vendor.
- **Trace.** P2 · automate-later · `2a492226c8b282d0b9e681eaa9204a55` · `how-do-i-evaluate-a-technical-stage` · Notion KB › Sourcing › RFP / Technical Stage › How do I Evaluate a Technical Stage?

#### PRD-KBSRC-409 — Remarks are mandatory to submit an evaluation

- **Why it matters.** The article states remarks are required; evaluations without justification must not be accepted.
- **Setup.** Technical Evaluator adding an evaluation.
- **Steps.**
  1. Click "Add Evaluation", select a rank and leave the remark empty.
  2. Click "OK".
- **Expected.** The evaluation cannot be submitted without a remark.
- **Oracle.** The evaluation is not saved until a remark is entered.
- **Trace.** P1 · automate-later · `2a492226c8b282d0b9e681eaa9204a55` · `how-do-i-evaluate-a-technical-stage` · Notion KB › Sourcing › RFP / Technical Stage › How do I Evaluate a Technical Stage?

#### PRD-KBSRC-410 — Vendor specification changes are highlighted in yellow in the QCS

- **Why it matters.** Evaluators must spot vendor deviations from spec.
- **Setup.** Technical stage where a vendor changed a specification in their submission.
- **Steps.**
  1. As evaluator, open the Technical Stage and view the QCS.
- **Expected.** Changes made by the vendor are highlighted in yellow in the QCS.
- **Oracle.** The changed specification cells are yellow.
- **Trace.** P2 · automate-later · `2a492226c8b282d0b9e681eaa9204a55` · `how-do-i-evaluate-a-technical-stage` · Notion KB › Sourcing › RFP / Technical Stage › How do I Evaluate a Technical Stage?

#### PRD-KBSRC-411 — Regretted line items are clearly marked

- **Why it matters.** Evaluators need to know which items the vendor will not supply.
- **Setup.** Technical stage where a vendor regretted a line item.
- **Steps.**
  1. As evaluator, open the Technical Stage and view that vendor's submission.
- **Expected.** Regretted line items are clearly marked, indicating the vendor will not supply them.
- **Oracle.** The regretted line item carries a visible regret marker.
- **Trace.** P2 · automate-later · `2a492226c8b282d0b9e681eaa9204a55` · `how-do-i-evaluate-a-technical-stage` · Notion KB › Sourcing › RFP / Technical Stage › How do I Evaluate a Technical Stage?

#### PRD-KBSRC-412 — Approval workflow is chosen by conditions when submitting scores

- **Why it matters.** The routing decides who must approve the technical recommendation.
- **Setup.** Technical Evaluator who has completed all evaluations; workflows with conditions exist.
- **Steps.**
  1. Click **"Submit Score"**.
  2. Select an approval workflow and click Next.
- **Expected.** The evaluator selects an Approval Workflow based on conditions such as the number of DNA vendors or line items.
- **Oracle.** The closing-remarks dialog shows the selected approval workflow for review.
- **Trace.** P1 · automate-later · `2a492226c8b282d0b9e681eaa9204a55` · `how-do-i-evaluate-a-technical-stage` · Notion KB › Sourcing › RFP / Technical Stage › How do I Evaluate a Technical Stage?

#### PRD-KBSRC-413 — After submission the evaluator only watches approval progress

- **Why it matters.** The evaluator's part ends at submission until approval completes.
- **Setup.** Technical Evaluator who has submitted scores.
- **Steps.**
  1. Look at the Approval Page after submitting.
- **Expected.** The workflow progress is displayed and no further action is required from the evaluator until approval is completed.
- **Oracle.** The Approval Page shows progress with no pending action for the evaluator.
- **Trace.** P2 · automate-later · `2a492226c8b282d0b9e681eaa9204a55` · `how-do-i-evaluate-a-technical-stage` · Notion KB › Sourcing › RFP / Technical Stage › How do I Evaluate a Technical Stage?

## 4. How do I approve a TR (Technical Recommendation)?

#### PRD-KBSRC-414 — Approve a Technical Recommendation through all approvers

- **Why it matters.** TR approval is the gate that releases technical rankings to the buyer.
- **Setup.** Approver (e.g. Department Head, Procurement Manager or CXO) on the workflow of a submitted TR.
- **Steps.**
  1. Navigate to the **Approvals** tab from the left-hand panel.
  2. Click **"Pending on Me"**.
  3. Locate the approval entry and click the **arrow icon** to open the proposal.
  4. Review the proposal, enter remarks in the comment box and click **"Approve"**.
  5. Repeat as each remaining approver in the workflow.
- **Expected.** Once all approvers have approved, the proposal is marked as approved and the buyer can see the technical rankings in the event.
- **Oracle.** The TR shows approved and the buyer's event view shows the technical rankings.
- **Trace.** P0 · automate-later · `72e92226c8b28215a1f4814528a262e4` · `how-do-i-approve-a-tr-technical-recommendation` · Notion KB › Sourcing › RFP / Technical Stage › How do I approve a TR (Technical Recommendation)?

#### PRD-KBSRC-415 — Approval moves the TR to the next approver

- **Why it matters.** Multi-stage workflows must route in order.
- **Setup.** TR with a workflow of two or more approvers; first approver logged in.
- **Steps.**
  1. As the first approver, open the TR from "Pending on Me", add remarks and click **"Approve"**.
  2. Log in as the second approver and open "Pending on Me".
- **Expected.** The proposal moves to the next approver in the workflow.
- **Oracle.** The TR appears in the second approver's "Pending on Me"; the workflow stage advances.
- **Trace.** P0 · automate-later · `72e92226c8b28215a1f4814528a262e4` · `how-do-i-approve-a-tr-technical-recommendation` · Notion KB › Sourcing › RFP / Technical Stage › How do I approve a TR (Technical Recommendation)?

#### PRD-KBSRC-416 — Reject a TR; the evaluator revises and resends it

- **Why it matters.** Rejection is how incorrect technical evaluations are corrected before they reach the buyer.
- **Setup.** Approver on the workflow of a submitted TR; the evaluator who submitted it.
- **Steps.**
  1. As approver, open the TR from "Pending on Me", enter remarks and click **"Reject"**.
  2. As the evaluator, revise the evaluation and resend it for approval.
- **Expected.** The proposal is rejected; the evaluator can revise and resend it for approval.
- **Oracle.** The TR shows rejected, then reappears in the approvers' queue after resending.
- **Trace.** P0 · automate-later · `72e92226c8b28215a1f4814528a262e4` · `how-do-i-approve-a-tr-technical-recommendation` · Notion KB › Sourcing › RFP / Technical Stage › How do I approve a TR (Technical Recommendation)?

#### PRD-KBSRC-417 — Technical rankings are hidden from the buyer until the TR is approved

- **Why it matters.** Technical approval is required before buyers can view technical evaluations.
- **Setup.** Event whose TR is submitted but not fully approved; buyer of that event.
- **Steps.**
  1. As buyer, open the event while the TR is pending approval.
  2. After all approvers approve, open it again.
- **Expected.** The buyer cannot view technical evaluations before approval, and can see the technical rankings after it.
- **Oracle.** Rankings are absent before full approval and present after.
- **Trace.** P0 · automate-later · `72e92226c8b28215a1f4814528a262e4` · `how-do-i-approve-a-tr-technical-recommendation` · Notion KB › Sourcing › RFP / Technical Stage › How do I approve a TR (Technical Recommendation)?

#### PRD-KBSRC-418 — TR proposal page shows status, reference, ranks, stages, comments and specification

- **Why it matters.** Approvers need the full context to approve correctly.
- **Setup.** Approver with a TR pending on them.
- **Steps.**
  1. Open the TR proposal from "Pending on Me" via the arrow icon.
- **Expected.** The page shows TR Status, Project Reference ID, Technical Ranks, Approval Workflow Stages, Comments (from earlier approvers or the technical evaluator) and Technical Specification.
- **Oracle.** All six items are visible on the proposal page.
- **Trace.** P2 · automate-later · `72e92226c8b28215a1f4814528a262e4` · `how-do-i-approve-a-tr-technical-recommendation` · Notion KB › Sourcing › RFP / Technical Stage › How do I approve a TR (Technical Recommendation)?

#### PRD-KBSRC-419 — "Pending on Me" lists approvals awaiting the user

- **Why it matters.** Approvers find their work from this list.
- **Setup.** Approver with at least one TR pending on them.
- **Steps.**
  1. Open the **Approvals** tab and click **"Pending on Me"**.
- **Expected.** All approvals awaiting the user's action are listed.
- **Oracle.** The pending TR appears in the list.
- **Trace.** P2 · automate-later · `72e92226c8b28215a1f4814528a262e4` · `how-do-i-approve-a-tr-technical-recommendation` · Notion KB › Sourcing › RFP / Technical Stage › How do I approve a TR (Technical Recommendation)?

## 5. How do I Request for Revaluation?

#### PRD-KBSRC-420 — Buyer requests re-evaluation of selected line items

- **Why it matters.** Re-evaluation is the buyer's route to correct a disputed technical ranking.
- **Setup.** Buyer / Procurement Owner on a sourcing event in Evaluation Time with line items in "TR Submitted".
- **Steps.**
  1. Navigate to the Technical Stage of the sourcing event.
  2. Click the "Settings" dropdown and select "Request for Re-Evaluation."
  3. In the "Request Re-Evaluation" side drawer, fill in the reason.
  4. Under "Select Line Items," choose the line items.
  5. Click the blue "Send Request" button.
- **Expected.** The selected line items are marked as "Re-evaluation Requested," and the technical evaluators must take action.
- **Oracle.** The line items show the status "Re-evaluation Requested."
- **Trace.** P1 · automate-later · `71c92226c8b282aa8ed481f38b4148c9` · `how-do-i-request-for-revaluation` · Notion KB › Sourcing › RFP / Technical Stage › How do I Request for Revaluation?

#### PRD-KBSRC-421 — Request for Re-Evaluation is enabled only in Evaluation Time

- **Why it matters.** The article restricts re-evaluation requests to the evaluation window.
- **Setup.** Buyer on a sourcing event outside Evaluation Time, and one inside it.
- **Steps.**
  1. Open the "Settings" dropdown on the Technical Stage outside Evaluation Time.
  2. Repeat inside Evaluation Time.
- **Expected.** "Request for Re-Evaluation" is enabled only in the Evaluation Time.
- **Oracle.** The option is disabled outside Evaluation Time and enabled inside it.
- **Trace.** P1 · automate-later · `71c92226c8b282aa8ed481f38b4148c9` · `how-do-i-request-for-revaluation` · Notion KB › Sourcing › RFP / Technical Stage › How do I Request for Revaluation?

#### PRD-KBSRC-422 — Re-evaluation reason is mandatory

- **Why it matters.** Evaluators need to know why re-evaluation is requested.
- **Setup.** Buyer with the "Request Re-Evaluation" drawer open.
- **Steps.**
  1. Select line items but leave the reason empty.
  2. Try to click "Send Request".
- **Expected.** The request cannot be sent without a reason.
- **Oracle.** The request is not sent and the line items do not change status.
- **Trace.** P1 · automate-later · `71c92226c8b282aa8ed481f38b4148c9` · `how-do-i-request-for-revaluation` · Notion KB › Sourcing › RFP / Technical Stage › How do I Request for Revaluation?

#### PRD-KBSRC-423 — Only "TR Submitted" line items are eligible for re-evaluation

- **Why it matters.** Items not yet evaluated must not be sent back.
- **Setup.** Buyer with the "Request Re-Evaluation" drawer open; the event has line items in "TR Submitted" and others not.
- **Steps.**
  1. Look at "Select Line Items" and try to select a line item not in "TR Submitted".
- **Expected.** Only items in the "TR Submitted" stage are eligible.
- **Oracle.** Non-"TR Submitted" items cannot be selected.
- **Trace.** P1 · automate-later · `71c92226c8b282aa8ed481f38b4148c9` · `how-do-i-request-for-revaluation` · Notion KB › Sourcing › RFP / Technical Stage › How do I Request for Revaluation?

#### PRD-KBSRC-424 — Select all or specific line items for re-evaluation

- **Why it matters.** Buyers may dispute the whole evaluation or just part of it.
- **Setup.** Buyer with the "Request Re-Evaluation" drawer open; several eligible line items.
- **Steps.**
  1. Select all eligible line items and send the request.
  2. On another event, select only specific items and send.
- **Expected.** Both all and specific selections are accepted, and only the selected items are marked.
- **Oracle.** Exactly the selected items show "Re-evaluation Requested."
- **Trace.** P2 · automate-later · `71c92226c8b282aa8ed481f38b4148c9` · `how-do-i-request-for-revaluation` · Notion KB › Sourcing › RFP / Technical Stage › How do I Request for Revaluation?

## 6. How do Re-Evaluate Line items in Technical Stage?

#### PRD-KBSRC-425 — Evaluator accepts a re-evaluation request and resubmits

- **Why it matters.** Accepting is how disputed ranks get corrected.
- **Setup.** Technical Evaluator on an event with line items marked "Re-evaluation Requested".
- **Steps.**
  1. Open the Technical Stage and identify the "Re-evaluation Requested" line items.
  2. Review the reason and choose **Accept**; click "Accept and Re-evaluate" in the confirmation dialog.
  3. Modify the technical scores and recommendations (e.g. reassign T1, T2).
  4. Click Submit under the TR status widget.
  5. Add closing remarks, select the approval flow if workflows are enabled, and click **Submit**.
- **Expected.** The updated evaluation is finalised.
- **Oracle.** The confirmation "You have successfully Re-evaluated the Line Items!" is shown with the updated ranks.
- **Trace.** P1 · automate-later · `4bf92226c8b28358a41801bb13d445f3` · `how-do-re-evaluate-line-items-in-technical-stage` · Notion KB › Sourcing › RFP / Technical Stage › How do Re-Evaluate Line items in Technical Stage?

#### PRD-KBSRC-426 — Evaluator rejects a re-evaluation request; ranks stay unchanged

- **Why it matters.** The evaluator can stand by the original evaluation.
- **Setup.** Technical Evaluator on an event with line items marked "Re-evaluation Requested".
- **Steps.**
  1. Open the Technical Stage and choose **Reject** on the request.
  2. In the dialog listing the line items, enter a rejection reason.
  3. Click **Reject Re-evaluation**.
- **Expected.** The technical rankings remain unchanged and the status returns to "TR Submitted."
- **Oracle.** The line items show "TR Submitted" with their original ranks.
- **Trace.** P1 · automate-later · `4bf92226c8b28358a41801bb13d445f3` · `how-do-re-evaluate-line-items-in-technical-stage` · Notion KB › Sourcing › RFP / Technical Stage › How do Re-Evaluate Line items in Technical Stage?

#### PRD-KBSRC-427 — Rejection reason is mandatory before Reject Re-evaluation is enabled

- **Why it matters.** The buyer must learn why their request was rejected.
- **Setup.** Technical Evaluator with the reject dialog open.
- **Steps.**
  1. Leave the rejection reason empty and look at the **Reject Re-evaluation** button.
  2. Enter a reason.
- **Expected.** The reason is mandatory; the button becomes clickable (turns blue) only after a reason is entered.
- **Oracle.** The button is inactive with an empty reason and turns blue once text is entered.
- **Trace.** P1 · automate-later · `4bf92226c8b28358a41801bb13d445f3` · `how-do-re-evaluate-line-items-in-technical-stage` · Notion KB › Sourcing › RFP / Technical Stage › How do Re-Evaluate Line items in Technical Stage?

#### PRD-KBSRC-428 — Re-evaluation request shows reason, requester and original scores

- **Why it matters.** Evaluators need the context to decide whether to accept.
- **Setup.** Technical Evaluator on an event with a re-evaluation request.
- **Steps.**
  1. Open a "Re-evaluation Requested" line item.
- **Expected.** The reason, the buyer who raised the request, and the original technical scores and recommendations are visible.
- **Oracle.** All three are shown on the request.
- **Trace.** P2 · automate-later · `4bf92226c8b28358a41801bb13d445f3` · `how-do-re-evaluate-line-items-in-technical-stage` · Notion KB › Sourcing › RFP / Technical Stage › How do Re-Evaluate Line items in Technical Stage?

#### PRD-KBSRC-429 — Approval flow selection on re-evaluation submit when workflows are enabled

- **Why it matters.** Revised ranks must go through approval again where workflows apply.
- **Setup.** Technical Evaluator who accepted a re-evaluation on an org with approval workflows enabled.
- **Steps.**
  1. After modifying scores, click Submit under the TR status widget.
  2. Add closing remarks and select the approval flow.
  3. Click **Submit**.
- **Expected.** The appropriate approval flow is selected for the updated evaluation.
- **Oracle.** The submission shows the chosen approval flow.
- **Trace.** P2 · automate-later · `4bf92226c8b28358a41801bb13d445f3` · `how-do-re-evaluate-line-items-in-technical-stage` · Notion KB › Sourcing › RFP / Technical Stage › How do Re-Evaluate Line items in Technical Stage?
