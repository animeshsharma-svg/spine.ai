# Getting an award approved (note for approval) — what submitting locks, and what approving completes

Deep cases for the award's approval as seen from the event: submitting the award into its approval flow, what that
locks (no second award, no edits, no discarding), the approver approving each step in turn, and the award becoming
final only after the last step. The approval engine's own rules (who may approve, delegation, rejection routes) are in
events-deep-apr.md (API-XDAPR); this file checks what the approval does to the AWARD and the EVENT. Grounded in
`procol-backend` at `origin/main` ae36e86894. Cases whose Trace names `EVD3-S1` / `EVD3-S3` are run by
`prototype/scripts/run-deep3.ts` on their own fresh events.

**Read before running.** Award approvals use approval key `close_event_group` ("Bid Proposal"). The flow offered is
chosen by its trigger rule against the award's values (`app/helpers/api/proposal_approval_helper.rb:45-63`). At
PROCOL DEMO 198678 several applicable flows have the signed-in QA buyer as approver on every step, so the runner can
approve its own award; at Demo Account 2 32461 the approver is a different user, so cases needing the approver are
"not run" there. Proposal statuses: draft 3, requested 4, selected 2 (`app/models/proposal.rb:50`).

## 1. Submitting locks the award

#### API-EVDNFA-001 — Submitting the award puts it into approval, no longer a draft
- **Why it matters.** Once the buyer sends an award for approval, what the approver sees must be what was submitted.
- **Setup.** A closed RFQ with a built award (S1 or S3); an applicable award approval flow.
- **Steps.** 1. Submit the award, choosing an applicable approval flow. 2. Read the award's status.
- **Expected.** Accepted; the award is "waiting for approval" (requested).
- **Oracle.** `POST /proposal/:id/submit` 200; `proposals.status` = 4.
- **Trace.** P0 · automate · `EVD3-S1` `EVD3-S3` · `app/helpers/api/proposal_helper.rb:169-182, 252-268`

#### API-EVDNFA-002 — No second award can be started while one is in approval
- **Why it matters.** Two awards for one event in parallel could both be approved and double the order.
- **Setup.** As API-EVDNFA-001, award in approval.
- **Steps.** 1. Start a new award on the same event.
- **Expected.** Refused: "The proposal has already been submitted".
- **Oracle.** `POST /proposal` → 422 code 573.
- **Trace.** P0 · automate · `EVD3-S1` `EVD3-S3` · `app/helpers/api/proposal_helper.rb:22-24, 931-938`

#### API-EVDNFA-003 — The submitted award cannot be changed
- **Why it matters.** An approver must not approve one allocation and see another executed.
- **Setup.** As API-EVDNFA-001.
- **Steps.** 1. Try to change a vendor's awarded quantity on the submitted award.
- **Expected.** Refused: only a draft can be changed ("Proposal does not exists").
- **Oracle.** `POST /proposal/:id/add_response` → 422 code 721 (or 573).
- **Trace.** P0 · automate · `EVD3-S1` `EVD3-S3` · `app/controllers/api/proposal_controller.rb:61-62` · `app/helpers/api/proposal_helper.rb:44-46`

#### API-EVDNFA-004 — The submitted award cannot be discarded as if it were a draft
- **Why it matters.** Discarding is for drafts; a submitted award is withdrawn through the approval, leaving a trail.
- **Setup.** As API-EVDNFA-001.
- **Steps.** 1. Discard the submitted award.
- **Expected.** Refused: "Invalid Parameters".
- **Oracle.** `POST /proposal/discard_draft_proposal` → 422 code 888.
- **Trace.** P1 · automate · `EVD3-S1` `EVD3-S3` · `app/controllers/api/proposal_controller.rb:181-186`

## 2. Approving completes the award

#### API-EVDNFA-005 — Approving every step makes the award final
- **Why it matters.** Only a fully approved award may close the bids and create purchase orders.
- **Setup.** As API-EVDNFA-001; the signed-in buyer is the approver of every step of the chosen flow (198678).
- **Steps.** 1. Approve step 1. 2. Approve step 2 (and any further step). 3. Read the award's status.
- **Expected.** Each approval is accepted; after the last one the award is final (selected) — not before.
- **Oracle.** `POST /approval_workflow/approval_requests/resolve_approval` 200 per step; `proposals.status` 4 → 2.
- **Trace.** P0 · automate · `EVD3-S1` `EVD3-S3` · `app/models/proposal.rb:351-372` · `app/helpers/api/proposal_helper.rb:394-397`

#### API-EVDNFA-006 — Approving an already-approved step again changes nothing
- **Why it matters.** A double click or a second tab must not approve twice or re-run the award.
- **Setup.** As API-EVDNFA-005, after the award is final.
- **Steps.** 1. Approve the first step again.
- **Expected.** Refused: the step is no longer pending ("Request not found").
- **Oracle.** 422 code 4 (code 491 "already approved" is also acceptable wording).
- **Trace.** P1 · automate · `EVD3-S1` `EVD3-S3` · `app/models/approval_workflow/is_approver_methods.rb:23-26`

## 3. Not run by the runner

#### API-EVDNFA-007 — The buyer can approve its own award
- **Why it matters.** At PROCOL DEMO the buyer who submits the award is also the approver of both steps of several flows: the "four eyes" rule is configuration only, nothing in the code prevents self-approval.
- **Setup.** A flow whose approvers include the requester (several exist at 198678, e.g. the recent requests 32607–32609 had the requester as approver of both steps).
- **Steps.** 1. Submit an award into such a flow. 2. Approve it as the same user.
- **Expected (today).** Accepted. Should a requester be barred from approving their own request? Product decision; record it.
- **Oracle.** resolve_approval 200 with approver identifier = requested_by_user_id.
- **Trace.** P2 · manual · configuration observation · `app/models/approval_workflow/is_approver_methods.rb:23-26`

#### API-EVDNFA-008 — A rejected award comes back as a new draft carrying the same allocation
- **Why it matters.** After a rejection the buyer reworks the award; losing the allocation would force a rebuild from scratch.
- **Setup.** An award in approval; the approver rejects it.
- **Steps.** 1. Reject. 2. Read the event's awards.
- **Expected.** The rejected award is "rejected"; a new draft exists that points back to it and holds the same vendors and quantities.
- **Oracle.** `proposals` rows; `meta_data.previous_proposal_id`.
- **Trace.** P1 · automate-later · `app/helpers/api/proposal_helper.rb:402-470`

#### API-EVDNFA-009 — Submitting an award while bidding is still open stops the bidding
- **Why it matters.** Awarding mid-bidding is allowed by default; once an award is in approval no vendor may revise under it.
- **Setup.** An RFQ still open; an award built and submitted into a flow.
- **Steps.** 1. Submit. 2. As a vendor, try to bid.
- **Expected.** The round's submission time is expired by the submit; the vendor's bid is refused.
- **Oracle.** `proposal_helper.rb:252-268` expires the latest commercial round; vendor bid → 422 code 33.
- **Trace.** P1 · automate-later · `app/helpers/api/proposal_helper.rb:169-182, 252-268` · `app/controllers/concerns/event_group_controller_helper.rb:629-648`
