# Approvals around sourcing events — deep cases

Deep cases for every approval that can stand between a buyer and a sourcing outcome: holding a
stage for approval when it is published, approving a bid selection (close bid), approving a
surrogate bid, approving an award (proposal, approval flow v1 and v2), and the approval engine
underneath all of them — resolve, bulk resolve, withdraw, the approval inbox, adding approvers,
delegation, escalation and e-mail approvals. Each case is grounded in `procol-backend` at
`origin/main` (file:line in the Trace) or, for UI-XDAPR cases, in `procol-client-dashboard`.
API cases with a runnable twin share their number with `EDGE-DAPR-NNN` in
`prototype/data/api-cases-extra/deep-apr.json`.

**Read before running.** Uuids are decoded by `ParamsAuth#check_for_uuid`: any key containing
`uuid` becomes the matching `_id` (`approver_uuid` → `approver_id`, `approver_uuids` → `approver_ids`),
and a string that does not decode becomes nil. `Z2dnWmdaUWtnZw==` decodes to id 999999999 (no such row);
`WrongUuid1=` decodes to nil. Which engine applies is a company setting: `approval_flow_version`
(`v1` default, `v2` = the approval_requests engine; `app/models/company.rb:870-872`). Approval writes in
the runnable twins only ever carry the two bogus ids above, so no real approval can be resolved or
withdrawn. **Never call `/approval_workflow/email_approvals/resolve_from_email` from a dashboard session:**
that app is not allowed to use it, the answer is HTTP 401, and every 401 marks the caller's session
inactive (`app/controllers/concerns/json_helpers.rb:26,31-35`) — the rest of the run would be logged out.

## 1. Holding a stage for approval when the event is published

#### API-XDAPR-001 — An RFQ stage that needs creation approval is held as "requested" and its closing time is pushed out
- **Why it matters.** On approval flow v2 the stage must not go live to vendors until the approvers agree. The
  backend also moves the stage's closing time out by the whole approval chain's expiry, so the bid window is not
  eaten by the wait. If either part regresses, vendors bid on an unapproved event or the window closes while it waits.
- **Setup.** Company on approval flow version v2 with an active create-trade ("Trade Creation") approval flow whose
  trigger matches the stage (for example any RFQ for the buyer's team). Needs a live publish, so no runnable twin
  (stage creation is `POST /trade/template_input`, which the runner holds back).
- **Steps.** 1. Create a draft RFQ event and publish it with `PATCH /event_groups/:uuid` (status active).
  2. `GET /trade/:stage_uuid` and `GET /v1/trade/:stage_uuid/get_approvals`.
- **Expected.** The stage status is `requested`, not `active`; one pending approval request with title
  "Trade Creation Requested" exists; the stage's `closed_at` equals the scheduled end plus the sum of every step's
  `expires_in`; `misc.approver_identifiers` holds the approvers so they can open the stage.
- **Oracle.** Stage status requested; the approvals list has one pending request whose steps match the flow;
  closed_at moved by the total expiry.
- **Trace.** P0 · automate-later · `app/controllers/concerns/trade_controller_helper.rb:4527-4536` · `app/controllers/concerns/trade_controller_helper.rb:4583-4590` · `app/models/approval_workflow/approval_request.rb:320-322`

#### API-XDAPR-002 — A technical (RFP/RFI) round is never held for creation approval
- **Why it matters.** The same publish code skips creation approval for technical rounds on purpose; a buyer who
  configured "approve every event" may expect the technical round to wait too. Pin the behaviour so a change is
  noticed either way.
- **Setup.** Approval flow version v2 with a create-trade flow that would match; an event with an RFP round and an RFQ round.
- **Steps.** 1. Publish the event. 2. Read both stages.
- **Expected.** The RFP round goes `active` immediately and no approval request is created for it; only the RFQ
  round is `requested`. `status = … && !trade_request.is_rfi_or_rfp? ? "requested" : "active"`.
- **Oracle.** RFP stage active with an empty approvals list; RFQ stage requested.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:4536` · `app/controllers/concerns/trade_controller_helper.rb:4583`

#### API-XDAPR-003 — An auction that must be routed to the auction team still goes to approval instead of draft
- **Why it matters.** When the company routes auctions to an auction team, a buyer outside that team publishes into
  `draft`. But if a creation approval also applies, the later approval block overwrites the status with `requested`,
  so the auction skips the auction team and goes straight to approvers — defect-in-waiting.
- **Setup.** Company with an active "auction" team (routing on) and a v2 create-trade flow that matches; publishing
  buyer is not in the auction team.
- **Steps.** 1. Publish an event with an auction stage as that buyer. 2. Read the stage.
- **Expected.** Should stay `draft` for the auction team. Today: status set to "draft" at line 4538, then
  `start_approval_process?` succeeds and sets `requested` at line 4585.
- **Oracle.** Stage status and whether an approval request exists.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:4537-4539` · `app/controllers/concerns/trade_controller_helper.rb:4583-4585`

#### API-XDAPR-004 — When the approver approves, the stage is re-published under the approver's identity
- **Why it matters.** Final approval calls `publish_auction` again with `Current.user` = the approver. The auction-team
  routing check then looks at the APPROVER's team, so an approved auction can land in `draft` (approver not in the
  auction team) — the event silently never goes live.
- **Setup.** As in API-XDAPR-003 but routing does not apply to the publishing buyer; the last approver is not in the auction team.
- **Steps.** 1. Publish (stage requested). 2. Approver approves the last step.
- **Expected.** Stage becomes `active` and vendors are notified. Risk: `publish_auction(self)` runs with the approver
  as Current.user, so `is_allowed_to_route_to_auction_team? && !Current.user.is_part_of_auction_team?` can push it to draft.
- **Oracle.** Stage status after approval; trade creation e-mails sent.
- **Trace.** P1 · manual · `app/models/trade_request.rb:2054-2060` · `app/controllers/concerns/trade_controller_helper.rb:4537-4539`

#### API-XDAPR-005 — Rejecting a creation approval configured as "revert to previous approver" strands the stage
- **Why it matters.** The flow config `handle_approval_rejection_as = revert_to_prev_approver` is a TODO: the stage is
  put back to `requested` with no pending approval left, so nobody can act and the event is stuck.
- **Setup.** v2 create-trade flow whose config has `handle_approval_rejection_as: "revert_to_prev_approver"`.
- **Steps.** 1. Publish (requested). 2. Approver rejects with remarks. 3. Read the stage and its approvals.
- **Expected.** Today: approval request `rejected`, stage stays `requested` forever (no pending request, no way out
  except withdraw/clone). Should either re-open the previous step or withdraw the stage.
- **Oracle.** Stage status requested + approvals list shows only a rejected request.
- **Trace.** P1 · manual · `app/models/trade_request.rb:2065-2077`

#### API-XDAPR-006 — An expired or withdrawn creation approval withdraws the stage
- **Why it matters.** Vendors must never see a stage whose approval lapsed. The stage is withdrawn and closed at once.
- **Setup.** v2 create-trade flow with a short step expiry (or the buyer withdraws the request).
- **Steps.** 1. Publish. 2. Let the step expire (ExpireApprovalStepWorker) or withdraw the request. 3. Read the stage.
- **Expected.** Stage status `withdrawn`, `closed_at` ≈ now; the approval request is `expired` / `withdrawn`.
- **Oracle.** Stage status withdrawn; stage absent from vendors' live list.
- **Trace.** P1 · manual · `app/models/trade_request.rb:2061-2064` · `app/helpers/approval_workflow/approval_step_helper.rb:15-23`

#### API-XDAPR-007 — A stage whose creation approval is already complete is not asked again
- **Why it matters.** Re-publishing or extending an approved stage must not start a second approval (the approvers
  would be asked twice and the stage would drop back to requested).
- **Setup.** A stage whose create-trade approval is completed (approval_status approval_completed).
- **Steps.** 1. Trigger the publish path again (e.g. extend the deadline). 2. Read approvals.
- **Expected.** No new approval request; stage stays active. Guard: `!approval_completed? && !approval_pending?`.
- **Oracle.** Approvals list still has exactly one (completed) request.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:4530-4531`

## 2. Reading a stage's approval timeline — GET /v1/trade/:id/get_approvals

#### API-XDAPR-008 — The approval timeline of a freshly published stage is an empty list
- **Why it matters.** This is the request behind the stage's approval panel. With no bids and no creation approval it
  must answer an empty list, not an error — a crash here blanks the whole event page.
- **Setup.** {{tradeId}} is the sandbox RFQ stage: published, window open, no bids.
- **Steps.** `GET /v1/trade/{{tradeId}}/get_approvals`. 1. Read the stage approvals as the owning buyer.
- **Expected.** HTTP 200 with `[]` (or one create-trade request if the company holds stages for approval). Never 5xx.
- **Oracle.** Array response; every element has status, title, approval_steps.
- **Trace.** P1 · automate · `EDGE-DAPR-008` · `app/controllers/api/v1/trade_controller.rb:941-961`

#### API-XDAPR-009 — The approval timeline of a stage that does not exist is refused
- **Why it matters.** A well-formed id with no row must be a clean "not found", not a crash or another event's data.
- **Setup.** None beyond a buyer session.
- **Steps.** `GET /v1/trade/Z2dnWmdaUWtnZw==/get_approvals`. 1. Read approvals of stage id 999999999.
- **Expected.** HTTP 422, code 4 'Request not found' (`TradeRequest.find_by_id` returns nil).
- **Oracle.** 422 + code 4.
- **Trace.** P1 · automate · `EDGE-DAPR-009` · `app/controllers/api/v1/trade_controller.rb:944-945`

#### API-XDAPR-010 — An undecodable stage id is answered as a missing parameter
- **Why it matters.** Documents the guard order: a uuid that does not decode becomes nil and is caught by the blank
  check (code 2), before the lookup (code 4). Clients that branch on the code see the difference.
- **Setup.** None.
- **Steps.** `GET /v1/trade/WrongUuid1=/get_approvals`. 1. Read approvals with an undecodable id.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DAPR-010` · `app/controllers/api/v1/trade_controller.rb:942-943`

#### API-XDAPR-011 — Malformed filters on the approval timeline must not crash it
- **Why it matters.** DEFECT-IN-WAITING. When `filters` is not JSON, `CommonFunctions.parse_filters` swallows the error
  and returns nil, so `@filters` stays nil; the RFQ branch then reads `@filters['vendor_ids']` → NoMethodError → 500.
- **Setup.** {{tradeId}} is the sandbox RFQ stage.
- **Steps.** `GET /v1/trade/{{tradeId}}/get_approvals?filters=QA_Platform_not_json`. 1. Send a non-JSON filters value.
- **Expected.** Should be 200 (filters ignored) or 422. Today: HTTP 500 from `nil['vendor_ids']`.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DAPR-011` · `lib/common_functions.rb:83-95` · `app/controllers/concerns/trade_controller_filter_helper.rb:555-574` · `app/controllers/concerns/trade_controller_helper.rb:5412`

#### API-XDAPR-012 — Filtering the timeline by two approval types must not crash
- **Why it matters.** DEFECT-IN-WAITING. The approval-type filter is bound with `= ?`; an array of two keys expands to
  `= 'close_trade','surrogate_bid_create'`, which is invalid SQL → 500. The UI filter is multi-select.
- **Setup.** {{tradeId}} is the sandbox RFQ stage.
- **Steps.** `GET /v1/trade/{{tradeId}}/get_approvals?filters={"approval_type":["close_trade","surrogate_bid_create"]}` (URL-encoded).
  1. Filter by bid-selection and surrogate-bid approvals together.
- **Expected.** Should be 200 with requests of either type (`IN (?)`). Today: PG syntax error → HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DAPR-012` · `app/controllers/concerns/trade_controller_helper.rb:5419-5420`

#### API-XDAPR-013 — An approval-type filter sent as text must not crash
- **Why it matters.** `@filters['approval_type'].map` assumes an array; a single string raises NoMethodError → 500.
- **Setup.** {{tradeId}} is the sandbox RFQ stage.
- **Steps.** `GET /v1/trade/{{tradeId}}/get_approvals?filters={"approval_type":"close_trade"}` (URL-encoded). 1. Send one type as a string.
- **Expected.** Should be 200 or 422. Today: HTTP 500 (String has no map).
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-DAPR-013` · `app/controllers/concerns/trade_controller_helper.rb:5419`

#### API-XDAPR-014 — An unknown approval type filters the bid approvals down to nothing
- **Why it matters.** Unknown keys map to nil and the filter becomes `= NULL` (no rows); the stage's own creation
  approval is still returned because the filter is applied to bid approvals only. Pins the behaviour.
- **Setup.** {{tradeId}} is the sandbox RFQ stage.
- **Steps.** `GET /v1/trade/{{tradeId}}/get_approvals?filters={"approval_type":["QA_Platform_unknown"]}` (URL-encoded). 1. Filter by an invented type.
- **Expected.** HTTP 200; no bid approvals; create-trade approvals (if any) still listed. Never 5xx.
- **Oracle.** Status 200; no element with approval_key_attribute close_trade.
- **Trace.** P2 · automate · `EDGE-DAPR-014` · `app/controllers/concerns/trade_controller_helper.rb:5419-5423`

#### API-XDAPR-015 — An award approval does not appear on the pricing stage's timeline
- **Why it matters.** Award (proposal) approvals live on the EVENT, not on the stage. A buyer looking at the RFQ's
  approval panel after submitting an award sees only creation/bid approvals; the award shows on the event timeline
  (API-XDAPR-019). A regression that mixes them double-counts approvals.
- **Setup.** {{pricingTradeUuid}} is the journey's closed RFQ with one bid and a submitted award proposal.
- **Steps.** `GET /v1/trade/{{pricingTradeUuid}}/get_approvals`. 1. Read the journey stage's approvals.
- **Expected.** HTTP 200; no element with approval_key_attribute close_event_group. Never 5xx.
- **Oracle.** Status 200 and no award (close_event_group) entries.
- **Trace.** P2 · automate · `EDGE-DAPR-015` · `app/controllers/concerns/trade_controller_helper.rb:5393-5431`

#### API-XDAPR-016 — The technical round's timeline lists technical-evaluation approvals
- **Why it matters.** For an RFP round the timeline is built from proposals running in approval (technical
  evaluation), through a different branch; it must not crash when there are none.
- **Setup.** {{rfpTradeId}} is the sandbox RFP round (only on an RFP + RFQ run).
- **Steps.** `GET /v1/trade/{{rfpTradeId}}/get_approvals`. 1. Read the RFP round's approvals.
- **Expected.** HTTP 200 with `[]` (no evaluation submitted yet). Never 5xx.
- **Oracle.** Status 200.
- **Trace.** P2 · automate · `EDGE-DAPR-016` · `app/controllers/concerns/trade_controller_helper.rb:5394-5398`

#### API-XDAPR-017 — A buyer of another company cannot read a stage's approvals
- **Why it matters.** Approval trails carry remarks, amounts and approver names.
- **Setup.** Needs a second company's buyer session — no twin.
- **Steps.** 1. As a buyer of company B, `GET /v1/trade/:companyA_stage/get_approvals`.
- **Expected.** HTTP 422, code 455 'You are not authorized to perform this action' — `get_approvals?` requires
  `show?` and the stage company in the caller's allowed companies.
- **Oracle.** 422 + code 455.
- **Trace.** P0 · manual · `app/policies/trade_request_policy.rb:117-119`

#### API-XDAPR-018 — Filtering the timeline by vendor is accepted
- **Why it matters.** The vendor filter narrows bid approvals; `vendor_uuids` is decoded into `vendor_ids` inside the filters.
- **Setup.** {{tradeId}} is the sandbox RFQ stage; {{vendorUuid}} the first vendor of the client (read only).
- **Steps.** `GET /v1/trade/{{tradeId}}/get_approvals?filters={"vendor_uuids":["{{vendorUuid}}"]}` (URL-encoded). 1. Filter by one vendor.
- **Expected.** HTTP 200 with `[]` on the sandbox (no bids). Never 5xx.
- **Oracle.** Status 200.
- **Trace.** P2 · automate · `EDGE-DAPR-018` · `app/controllers/concerns/trade_controller_helper.rb:5411-5412`

## 3. The event's award-approval timeline — GET /event_groups/:id/get_approvals

#### API-XDAPR-019 — The award timeline of an event with no award is an empty list
- **Why it matters.** Feeds the approvals side panel of the event / proposal page.
- **Setup.** {{eventGroupUuid}} is the sandbox event: published, no proposals.
- **Steps.** `GET /event_groups/{{eventGroupUuid}}/get_approvals`. 1. Read the event's award approvals.
- **Expected.** HTTP 200 with `[]`. Never 5xx.
- **Oracle.** Status 200, empty array.
- **Trace.** P1 · automate · `EDGE-DAPR-019` · `app/controllers/api/event_groups_controller.rb:654-684`

#### API-XDAPR-020 — The award timeline of an event that does not exist is refused as a missing parameter
- **Why it matters.** This endpoint answers 2, not 4, for a missing event — the opposite of the stage endpoint.
  Clients mapping codes to messages must know.
- **Setup.** None.
- **Steps.** `GET /event_groups/Z2dnWmdaUWtnZw==/get_approvals`. 1. Read approvals of event id 999999999.
- **Expected.** HTTP 422, code 2 'Insufficient parameters' (lookup before authorize).
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DAPR-020` · `app/controllers/api/event_groups_controller.rb:656-657`

#### API-XDAPR-021 — An undecodable event id is refused the same way
- **Why it matters.** nil id must not match anything.
- **Setup.** None.
- **Steps.** `GET /event_groups/WrongUuid1=/get_approvals`. 1. Read with an undecodable id.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DAPR-021` · `app/controllers/api/event_groups_controller.rb:655-657`

#### API-XDAPR-022 — A hostile lot number does not break the award timeline
- **Why it matters.** `lot_no` goes into a SQL scope; it is bound as a parameter, so a quote-laden value must just match nothing.
- **Setup.** {{eventGroupUuid}} is the sandbox event.
- **Steps.** `GET /event_groups/{{eventGroupUuid}}/get_approvals?lot_no=' OR '1'='1` (URL-encoded). 1. Send an SQL-ish lot number.
- **Expected.** HTTP 200 with `[]`. Never 5xx.
- **Oracle.** Status 200, empty array.
- **Trace.** P2 · automate · `EDGE-DAPR-022` · `app/models/proposal.rb:44`

#### API-XDAPR-023 — A stage uuid sent where an event uuid belongs is not rejected by type
- **Why it matters.** Uuids are untyped encodings of integer ids: a stage uuid decodes to a stage id and is looked up as
  an EVENT id, so it can hit an unrelated event (another company's → 455, own → its approvals). The only safe outcome is "never 5xx".
- **Setup.** {{tradeId}} is the sandbox stage uuid.
- **Steps.** `GET /event_groups/{{tradeId}}/get_approvals`. 1. Use the stage uuid as an event uuid.
- **Expected.** 200 (some own event or empty), 422 code 2 (no event with that id) or 422 code 455 (another company's event). Never 5xx.
- **Oracle.** Status < 500; if 200, every element belongs to the caller's company.
- **Trace.** P2 · automate · `EDGE-DAPR-023` · `app/controllers/api/event_groups_controller.rb:655-658` · `app/policies/event_group_policy.rb:72-74`

#### API-XDAPR-024 — Reading award approvals needs no event-read permission
- **Why it matters.** `get_approvals?` only checks the company, unlike `show?` which needs trade read permission and a
  visible stage. A member who cannot open the event can still read its award amounts, approvers and remarks.
- **Setup.** A user of the same company whose role has no `trade` read permission and is not on the event. No twin
  (needs a second user).
- **Steps.** 1. As that user, `GET /event_groups/:uuid/get_approvals` for an event with a submitted award.
- **Expected.** Should be 455 like `GET /event_groups/:uuid`. Today: 200 with the full award approval trail.
- **Oracle.** Compare with `GET /event_groups/:uuid` for the same user (455).
- **Trace.** P1 · manual · `app/policies/event_group_policy.rb:52-54` · `app/policies/event_group_policy.rb:72-74`

#### API-XDAPR-025 — A withdrawn award request stays on the timeline with who withdrew it and why
- **Why it matters.** Audit: after withdrawal the old request must remain, marked withdrawn, with remarks and the user.
- **Setup.** An award submitted into approval and then withdrawn by its creator.
- **Steps.** 1. `GET /event_groups/:uuid/get_approvals`.
- **Expected.** The request has status `withdrawn` and `withdrawn_approval_data` (remarks, attachments, step at which it
  was withdrawn, time, withdrawing user); its pending steps and approvers are `withdrawn`.
- **Oracle.** Fields present and correct.
- **Trace.** P2 · manual · `app/models/approval_workflow/has_approval_methods.rb:97-134` · `app/serializers/approval_workflow/resource_approval_serializer.rb:64-74`

## 4. Bid-selection (close bid) approval — /v1/trade/:id/close_bid

#### API-XDAPR-026 — Listing bid-close approval flows for a bid that does not exist must not crash
- **Why it matters.** DEFECT-IN-WAITING. The `transform_bid_products` before_action finds the stage FROM the bid when
  no trade_request_id is sent: `Bid.find_by_id(bid_id).trade_request` → NoMethodError on nil → 500, before the action's own 4.
- **Setup.** {{tradeId}} is the sandbox RFQ stage.
- **Steps.** `POST /v1/trade/{{tradeId}}/close_bid/approval_workflows` with body
  `{"bid_uuid": "Z2dnWmdaUWtnZw==", "po_details": {"lot": {}, "line": {}}}`. 1. Ask which approval flows apply to closing bid 999999999.
- **Expected.** Should be 422 code 4. Today: HTTP 500 from the before_action.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DAPR-026` · `app/controllers/concerns/trade_template_helper.rb:5548-5551` · `app/controllers/api/v1/trade_controller.rb:26`

#### API-XDAPR-027 — Listing bid-close approval flows without a usable bid is refused
- **Why it matters.** With an undecodable bid the before_action falls back to the stage, and the action refuses: 101
  when the stage only allows closing in the extra closing time, else 4 because there is no such active bid.
- **Setup.** {{tradeId}} is the sandbox RFQ stage (window open, owned by the run's buyer).
- **Steps.** `POST /v1/trade/{{tradeId}}/close_bid/approval_workflows` with body
  `{"bid_uuid": "WrongUuid1=", "po_details": {"lot": {}, "line": {}}}`. 1. Ask for flows with an undecodable bid.
- **Expected.** HTTP 422 with code 4 (no active bid) or code 101 (stage closes only in extra time) — no flows listed.
- **Oracle.** 422 with code 4 or 101.
- **Trace.** P2 · automate · `EDGE-DAPR-027` · `app/controllers/api/v1/trade_controller.rb:919-934` · `app/controllers/concerns/trade_controller_helper.rb:3222-3236`

#### API-XDAPR-028 — Listing bid-close approval flows on a stage that does not exist is refused
- **Why it matters.** The before_action resolves the stage first and answers 4 itself.
- **Setup.** None.
- **Steps.** `POST /v1/trade/Z2dnWmdaUWtnZw==/close_bid/approval_workflows` with body `{"po_details": {"lot": {}, "line": {}}}`. 1. Ask for flows on stage 999999999.
- **Expected.** HTTP 422, code 4 'Request not found'.
- **Oracle.** 422 + code 4.
- **Trace.** P2 · automate · `EDGE-DAPR-028` · `app/controllers/concerns/trade_template_helper.rb:5552-5555`

#### API-XDAPR-029 — Listing bid-close approval flows without PO details crashes
- **Why it matters.** DEFECT-IN-WAITING. `generate_data_for_bid_close` does `params['po_details'].to_unsafe_h`; an API
  client (or the mobile app) that omits po_details gets a 500 instead of the flow list. The dashboard always sends it.
- **Setup.** A live RFQ (closing window open) with one active bid; caller owns the stage. No twin: the sandbox has no bids.
- **Steps.** 1. `POST /v1/trade/:uuid/close_bid/approval_workflows` with `{"bid_uuid": "<active bid>"}` only.
- **Expected.** Should be 200 (flows computed without PO data) or 422 code 2. Today: NoMethodError on nil → 500.
- **Oracle.** Status < 500.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:5165-5166`

#### API-XDAPR-030 — Team approval flows win over company flows, and only triggered flows are offered
- **Why it matters.** Which approver chain a bid selection goes to is decided here. If any TEAM flow's trigger rule is
  true, company-level flows are not offered at all; amount rules use `po_value` (the bid gross total before currency
  conversion), `bid_rank`, `bids_count`, savings and PO fields.
- **Setup.** v2 company with a team flow (trigger `po_value > 100000`) and a company flow (always true). A bid of 50 000
  and another of 150 000.
- **Steps.** 1. List flows for each bid.
- **Expected.** 50 000 → only the company flow; 150 000 → only the team flow (company flow hidden). Exactly-at-threshold
  (100 000) → company flow (rule is strict `>`).
- **Oracle.** Flow uuids returned per bid.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:5139-5155` · `app/models/bid.rb:1600-1622`

#### API-XDAPR-031 — Closing a bid that does not exist must not crash
- **Why it matters.** DEFECT-IN-WAITING, same before_action as API-XDAPR-026 on the write endpoint the Select Bid
  button calls: a stale or deleted bid uuid answers 500.
- **Setup.** {{tradeId}} is the sandbox RFQ stage.
- **Steps.** `POST /v1/trade/{{tradeId}}/close_bid` with body `{"bid_uuid": "Z2dnWmdaUWtnZw==", "remarks": "QA_Platform_close_{{stamp}}"}`. 1. Select bid 999999999.
- **Expected.** Should be 422 code 4. Today: HTTP 500 before the action. Nothing is closed either way.
- **Oracle.** Status < 500; the sandbox stays active with no selected bid.
- **Trace.** P1 · automate · `EDGE-DAPR-031` · `app/controllers/concerns/trade_template_helper.rb:5548-5551`

#### API-XDAPR-032 — Closing without naming a bid is refused
- **Why it matters.** Without a bid there is nothing to approve or close; the answer must be a clean 4.
- **Setup.** {{tradeId}} is the sandbox RFQ stage.
- **Steps.** `POST /v1/trade/{{tradeId}}/close_bid` with body `{"remarks": "QA_Platform_close_{{stamp}}"}`. 1. Close with no bid.
- **Expected.** HTTP 422, code 4 'Request not found' (bid lookup returns nil before any permission or approval check).
- **Oracle.** 422 + code 4; stage unchanged.
- **Trace.** P2 · automate · `EDGE-DAPR-032` · `app/controllers/concerns/trade_controller_helper.rb:4672-4695`

#### API-XDAPR-033 — A refused close still flips the stage to line-item awarding
- **Why it matters.** `all_line_items_selected: false` writes `config.award_line_item_wise = true` on the stage BEFORE the
  bid is even looked up; a request that is then refused (4, 101) has already changed how the stage is awarded.
- **Setup.** A live stage with `award_line_item_wise` false. Not twinned: it would change the sandbox for later cases.
- **Steps.** 1. `POST /v1/trade/:uuid/close_bid` with `{"bid_uuid": "Z2dnWmdaUWtnZw==", "all_line_items_selected": false}`. 2. Read the stage config.
- **Expected.** Should be refused with no change. Today: config.award_line_item_wise becomes true (and the request
  crashes in the before_action for this bogus bid; with no bid it answers 4 after the write).
- **Oracle.** `GET /trade/:uuid` config before vs after.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:4677-4682`

#### API-XDAPR-034 — The first bid lookup when closing is not tied to the stage in the URL
- **Why it matters.** SECURITY. `Bid.where(status: …).find_by_id(bid_id)` is not scoped to the stage, so a bid from
  ANOTHER event passes the first checks. On a stage with participant approval for partial closing, the bid's products are
  turned into a counter offer on that foreign bid (`create_additional_request_for_bid`) before the inner, scoped lookup.
- **Setup.** Two events of the same buyer; stage A has `is_participant_approval_required_partial_closing`; bid X belongs to stage B.
- **Steps.** 1. `POST /v1/trade/:stageA/close_bid` with `bid_uuid` = X and a partial `bid_products` payload.
- **Expected.** Should be 4 (bid not on this stage). Risk: a counter offer is raised on stage B's bid through stage A.
- **Oracle.** No additional request created on bid X.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:4693` · `app/controllers/concerns/trade_controller_helper.rb:4735-4754`

#### API-XDAPR-035 — Closing with an approval flow that does not apply is refused
- **Why it matters.** On v2, naming a flow that is not applicable (wrong team, trigger false, unknown id) must not close
  the bid silently.
- **Setup.** v2 company; live stage with an active bid; a flow id that does not match this bid.
- **Steps.** 1. `POST /v1/trade/:uuid/close_bid` with that `approval_flow_uuid`.
- **Expected.** HTTP 422, code 523 'Invalid Approval'; bid stays active.
- **Oracle.** 422 + 523; bid status active.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:5043-5060`

#### API-XDAPR-036 — Closing without choosing a flow still goes to the first applicable flow
- **Why it matters.** Not a bypass: when no flow is named, the engine picks the first applicable team flow, else
  company flow. The bid becomes `requested`, its products `requested`, and the closing window is extended by the
  approval's total expiry so the approval can finish.
- **Setup.** v2 company with one applicable close_trade flow; live stage with an active bid.
- **Steps.** 1. `POST /v1/trade/:uuid/close_bid` without approval_flow_uuid. 2. Read the bid and stage.
- **Expected.** Bid status requested; an extra-closing-time schedule ends at max(now + total expiry, closed_at);
  stage `misc.approver_identifiers` updated.
- **Oracle.** Bid status, trade_schedules, approvals list.
- **Trace.** P1 · manual · `app/models/approval_workflow/has_approval_methods.rb:161-175` · `app/controllers/concerns/trade_controller_helper.rb:5068-5099`

#### API-XDAPR-037 — A bid already waiting for approval cannot be closed again
- **Why it matters.** Double click / second buyer: the bid is `requested`, so the outer lookup (active only) misses it.
- **Setup.** A bid in close approval; the stage does not allow multiple POs per bid.
- **Steps.** 1. `POST /v1/trade/:uuid/close_bid` again for the same bid.
- **Expected.** HTTP 422, code 4 'Request not found'; still one pending approval request.
- **Oracle.** One approval request.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:4687-4695`

#### API-XDAPR-038 — On approval flow v1 the old approval path is used and v2 is skipped
- **Why it matters.** Companies still on v1 raise approvals through `Approvals::RaiseApproval`; the bid goes to
  `requested` and the v2 engine is never touched.
- **Setup.** Company on approval flow version v1 with a close_trade approval configured.
- **Steps.** 1. Close a bid. 2. Read the bid; read `/approval_workflow/approval_requests/get_pending_approvals` (101 on v1).
- **Expected.** Bid requested with approval type close_trade; no approval_requests row.
- **Oracle.** Bid status; no v2 request.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:5009-5017`

#### API-XDAPR-039 — Selecting more than the requested quantity is refused on v2
- **Why it matters.** Over-quantity selection under v2 is refused instead of being sent for approval.
- **Setup.** v2 company; a bid quoting more than the line quantity.
- **Steps.** 1. Close that bid.
- **Expected.** HTTP 422, code 561 'You cannot select bid with more than requested quantity.'
- **Oracle.** 422 + 561.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:5033-5036`

#### API-XDAPR-040 — A peer reviewer outside the buyer's teams is refused when closing a bid
- **Why it matters.** With peer review on, the peer becomes an extra first step; any user id must not be accepted.
- **Setup.** Setting peer_review_enabled is ON; v2; a user who is not in the caller's active teams.
- **Steps.** 1. Close a bid with `peer_uuid` of that user.
- **Expected.** HTTP 422, code 70 'User does not exist'. With the setting off, peer_uuid is ignored.
- **Oracle.** 422 + 70.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:5038-5042`

#### API-XDAPR-041 — Knockout and Dutch auctions skip the v2 bid-selection approval
- **Why it matters.** Pins a deliberate exception: automated auctions close without v2 approval even when a flow applies.
- **Setup.** v2 company with an applicable close_trade flow; a knockout auction with an accepted offer.
- **Steps.** 1. Close the winning bid.
- **Expected.** No approval request; bid selected directly.
- **Oracle.** Approvals list empty.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:5033`

#### API-XDAPR-042 — A bid-selection approval that completes after the stage closed is ignored
- **Why it matters.** If the stage is already `closed` when the last approver approves, the completion hook returns
  early: the approval says completed but the bid stays `requested` and no PO is made.
- **Setup.** A bid in close approval; the stage gets closed (e.g. another bid selected) before the approval finishes.
- **Steps.** 1. Approver approves. 2. Read bid and stage.
- **Expected.** Today: approval completed, bid unchanged. Should at least be reported to the requester.
- **Oracle.** Bid status vs approval status.
- **Trace.** P2 · manual · `app/models/bid.rb:1740-1746`

## 5. Surrogate-bid approval

#### API-XDAPR-043 — Listing surrogate-bid approval flows without naming the stage is refused
- **Why it matters.** The drawer calls this before a buyer adds a bid on a vendor's behalf.
- **Setup.** Buyer session.
- **Steps.** `GET /bids/approval_workflows_for_surrogate_bid_create`. 1. Ask for flows with no trade_request_uuid.
- **Expected.** HTTP 422, code 2 (Insufficient parameters), or code 455 when the caller lacks approval-flow read permission (checked first).
- **Oracle.** 422 with code 2 or 455.
- **Trace.** P2 · automate · `EDGE-DAPR-043` · `app/controllers/api/bids_controller.rb:87-90` · `app/policies/bid_policy.rb:49-51`

#### API-XDAPR-044 — Listing surrogate-bid approval flows for the sandbox stage
- **Why it matters.** Returns only TEAM flows; an empty list makes the dashboard skip the approval drawer and post the bid directly (UI-XDAPR-010).
- **Setup.** {{tradeId}} is the sandbox RFQ stage of the caller's company.
- **Steps.** `GET /bids/approval_workflows_for_surrogate_bid_create?trade_request_uuid={{tradeId}}`. 1. List the flows.
- **Expected.** HTTP 200 with an array (team flows with key surrogate_bid_create), or 422 code 10 when the stage forbids
  surrogate bids, or 455 without approval-flow read permission. Never 5xx.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DAPR-044` · `app/controllers/api/bids_controller.rb:87-101` · `app/controllers/concerns/bids_controller_helper.rb:2775-2779`

#### API-XDAPR-045 — Listing surrogate-bid approval flows for a stage that does not exist must not crash
- **Why it matters.** DEFECT-IN-WAITING. The stage lookup returns nil and is passed straight into
  `is_surrogate_bidding_and_is_allowed?`, which calls `nil.current_status` → 500. The dashboard then shows no approval
  drawer and posts the surrogate bid without approval.
- **Setup.** Caller has approval-flow read permission (otherwise 455 comes first).
- **Steps.** `GET /bids/approval_workflows_for_surrogate_bid_create?trade_request_uuid=Z2dnWmdaUWtnZw==`. 1. Ask for flows of stage 999999999.
- **Expected.** Should be 422 code 4. Today: HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DAPR-045` · `app/controllers/api/bids_controller.rb:92-96` · `app/controllers/concerns/bids_controller_helper.rb:2130-2131`

#### API-XDAPR-046 — An undecodable stage id for surrogate flows is refused as missing
- **Why it matters.** Guard order: the undecodable uuid becomes nil and hits the blank check.
- **Setup.** Buyer session.
- **Steps.** `GET /bids/approval_workflows_for_surrogate_bid_create?trade_request_uuid=WrongUuid1=`. 1. Ask with an undecodable id.
- **Expected.** HTTP 422, code 2 (or 455 without approval-flow read permission).
- **Oracle.** 422 with code 2 or 455.
- **Trace.** P2 · automate · `EDGE-DAPR-046` · `app/controllers/api/bids_controller.rb:89-90`

#### API-XDAPR-047 — A surrogate bid sent without an approval flow skips approval entirely
- **Why it matters.** P0 DEFECT-IN-WAITING. Surrogate approval only starts when the REQUEST names a flow that is in the
  caller's team list (`params['approval_flow_id'].in?(approval_flow_ids)`); otherwise the bid is created `active`. Any
  API client — or the dashboard when the flow list failed to load — can put a buyer-entered bid straight into the
  ranking although the company requires approval.
- **Setup.** v2 company with an active team surrogate_bid_create flow for the buyer's team; live RFQ; a QA vendor
  invited. Not twinned: a successful bid would change the sandbox (no bids) for every later case.
- **Steps.** 1. `POST /bids/template_input` (surrogate body) WITHOUT approval_flow_uuid. 2. Read the bid.
- **Expected.** Should be refused or held in approval. Today: bid status `active`, no approval request.
- **Oracle.** Bid status; `GET /v1/trade/:uuid/get_approvals` has no surrogate request.
- **Trace.** P0 · manual · `app/controllers/api/bids_controller.rb:63` · `app/controllers/api/bids_controller.rb:669-672` · `app/controllers/concerns/bids_controller_helper.rb:2654-2658`

#### API-XDAPR-048 — A surrogate bid naming a flow outside the caller's team list also skips approval
- **Why it matters.** Same hole with a wrong id: a flow uuid that is not one of the team flows (another team's,
  a company-level one, or 999999999) silently means "no approval" instead of 523.
- **Setup.** As API-XDAPR-047.
- **Steps.** 1. Create a surrogate bid with `approval_flow_uuid: "Z2dnWmdaUWtnZw=="`.
- **Expected.** Should be 422 code 523 'Invalid Approval'. Today: bid created active.
- **Oracle.** Bid status active, no approval request.
- **Trace.** P0 · manual · `app/controllers/concerns/bids_controller_helper.rb:2655-2657`

#### API-XDAPR-049 — Company-level surrogate approval flows are never offered or applied
- **Why it matters.** The listing returns team flows only and the trigger requires the id to be in that list, so a
  company-wide surrogate approval policy (no team) has no effect at all.
- **Setup.** v2 company with ONLY a company-level surrogate_bid_create flow.
- **Steps.** 1. List flows (empty). 2. Create a surrogate bid.
- **Expected.** Today: no flows listed, bid active without approval. Should list and apply the company flow.
- **Oracle.** Listing result; bid status.
- **Trace.** P1 · manual · `app/controllers/concerns/bids_controller_helper.rb:2775-2779`

#### API-XDAPR-050 — Over-quantity surrogate bid answers a misleading "v2 is required" message
- **Why it matters.** The over-quantity guard returns code 781 whose text is 'Approval flow version v2 is required' —
  wrong reason shown to the buyer on a company that IS on v2.
- **Setup.** v2 company; surrogate bid with quantity above the line quantity and a valid team flow.
- **Steps.** 1. Create the surrogate bid.
- **Expected.** Refused (422 code 781) — but the message should say the quantity exceeds the requirement.
- **Oracle.** Code 781 and its message.
- **Trace.** P2 · manual · `app/controllers/concerns/bids_controller_helper.rb:2793-2795`

#### API-XDAPR-051 — The surrogate approval outcome decides the bid's fate
- **Why it matters.** Approved → bid `active` (ranks); rejected → `rejected`; expired or withdrawn → `in_active`.
- **Setup.** A surrogate bid in approval (status approval_requested).
- **Steps.** 1. Approve / reject / let expire / withdraw. 2. Read the bid each time.
- **Expected.** Statuses as above; the bid appears in the ranking only after approval.
- **Oracle.** Bid status and leaderboard.
- **Trace.** P1 · manual · `app/models/bid.rb:1780-1790`

#### API-XDAPR-052 — The bid approvals route has no action behind it
- **Why it matters.** `GET /bids/:id/get_approvals` is routed and allowed for the dashboard app, but BidsController has
  no `get_approvals` method — any client relying on it gets 404. Documents a dead route.
- **Setup.** {{bidUuid}} is the journey's submitted bid.
- **Steps.** `GET /bids/{{bidUuid}}/get_approvals`. 1. Read a bid's approvals.
- **Expected.** HTTP 404 (action not found), never 5xx and never data.
- **Oracle.** 404.
- **Trace.** P2 · automate · `EDGE-DAPR-052` · `config/routes.rb:319`

## 6. Award (proposal) approval — flows, submit and outcome

#### API-XDAPR-053 — Award approval flows are still listed for a proposal that is no longer a draft
- **Why it matters.** The listing only checks the creator, not the status, so a submitted proposal still shows its
  flows — harmless, but a client must not take a non-empty list as "you can submit". Also: a caller on an evaluating
  team gets 204 with no body (precedence bug, see API-XAWD-117).
- **Setup.** {{proposalUuid}} is the journey's award proposal (requested when a flow applied, else still draft), created by the run's buyer; the buyer is not on an evaluating team.
- **Steps.** `GET /proposal/{{proposalUuid}}/approval_workflows`. 1. List award flows.
- **Expected.** HTTP 200 with the applicable close_event_group flows (team flows if any team flow triggers, else company flows). Never 5xx.
- **Oracle.** Status 200; if {{approvalFlowUuid}} was used, it is in the list.
- **Trace.** P2 · automate · `EDGE-DAPR-053` · `app/controllers/api/proposal_controller.rb:69-77` · `app/helpers/api/proposal_approval_helper.rb:45-63`

#### API-XDAPR-054 — Award approval flows of a proposal that does not exist are refused
- **Why it matters.** Clean not-found for a stale link.
- **Setup.** Caller is not on an evaluating team (that answers 204 first).
- **Steps.** `GET /proposal/Z2dnWmdaUWtnZw==/approval_workflows`. 1. List flows of proposal 999999999.
- **Expected.** HTTP 422, code 4 'Request not found'.
- **Oracle.** 422 + code 4.
- **Trace.** P2 · automate · `EDGE-DAPR-054` · `app/controllers/api/proposal_controller.rb:72-73`

#### API-XDAPR-055 — An undecodable proposal id is refused the same way
- **Why it matters.** nil id with the creator scope must match nothing.
- **Setup.** Caller is not on an evaluating team.
- **Steps.** `GET /proposal/WrongUuid1=/approval_workflows`. 1. List flows with an undecodable id.
- **Expected.** HTTP 422, code 4 'Request not found'.
- **Oracle.** 422 + code 4.
- **Trace.** P2 · automate · `EDGE-DAPR-055` · `app/controllers/api/proposal_controller.rb:72-73`

#### API-XDAPR-056 — After submit the proposal shows where it is in the approval
- **Why it matters.** Read-back oracle for every award-approval case: the proposal's status and its approval flow.
- **Setup.** {{proposalUuid}} is the journey's award proposal.
- **Steps.** `GET /proposal/{{proposalUuid}}`. 1. Read the proposal.
- **Expected.** HTTP 200; status `requested` when it went to approval, `selected` when awarded directly, `draft` when it
  was never submitted (no flow on the company). Never 5xx.
- **Oracle.** Status field matches the journey's award_submit outcome.
- **Trace.** P1 · automate · `EDGE-DAPR-056` · `app/controllers/api/proposal_controller.rb:14-43`

#### API-XDAPR-057 — An award flow that depends on the budget is offered but cannot be used, and leaving it out skips approval
- **Why it matters.** P0 DEFECT-IN-WAITING. Only the LISTING adds `total_proposal_value_not_exceeding_budget` to the
  data the trigger rules see. Submit re-checks the flow and starts it with the plain proposal data, where that key is
  missing, so a budget-based rule evaluates to nothing: naming the flow → 523, and leaving it out → the "is an approval
  required?" check also misses it → the award is closed directly with no approval.
- **Setup.** v2 company with rfx projects; the only close_event_group flow has a trigger using
  total_proposal_value_not_exceeding_budget (e.g. `= 0`, award above budget); an award above budget.
- **Steps.** 1. `GET /proposal/:uuid/approval_workflows` (flow listed). 2. `POST /proposal/:uuid/submit` with that flow.
  3. On a fresh proposal, submit without approval_flow_uuid.
- **Expected.** Should go to approval. Today: step 2 → 422 code 523 'Invalid Approval'; step 3 → proposal `selected`, bids closed, no approval.
- **Oracle.** Proposal status; approvals list on the event.
- **Trace.** P0 · manual · `app/helpers/api/proposal_approval_helper.rb:45-52` · `app/helpers/api/proposal_approval_helper.rb:10-41` · `app/models/proposal.rb:340-344`

#### API-XDAPR-058 — When a team award flow applies, company award flows disappear from the choice
- **Why it matters.** `get_approval_flows_for_proposal` returns team flows if any triggers, else company flows. Submit
  validates against the same list, so a company flow uuid (seen earlier or by another user) answers 523.
- **Setup.** v2 company with one team and one company close_event_group flow, both triggered.
- **Steps.** 1. List flows (team only). 2. Submit with the company flow uuid.
- **Expected.** 422 code 523 'Invalid Approval'; proposal stays draft.
- **Oracle.** 422 + 523.
- **Trace.** P2 · manual · `app/helpers/api/proposal_approval_helper.rb:56-62` · `app/helpers/api/proposal_approval_helper.rb:2-8`

#### API-XDAPR-059 — Amount-based award approval picks the flow at the exact threshold
- **Why it matters.** Award approval tiers are usually by value. The value is `total_l1_proposal + total_non_l1_proposal`
  from the proposal; a boundary mistake sends a large award to a junior approver.
- **Setup.** Company flows: A `total_proposal_value <= 1000000`, B `total_proposal_value > 1000000`. Awards worth
  999 999, 1 000 000 and 1 000 001.
- **Steps.** 1. List flows for each award.
- **Expected.** 999 999 and 1 000 000 → A only; 1 000 001 → B only. Rules are Dentaku expressions over the proposal data.
- **Oracle.** Flow list per award.
- **Trace.** P1 · manual · `app/models/proposal.rb:212-232` · `app/models/approval_workflow/has_approval_methods.rb:177-194`

#### API-XDAPR-060 — A single-bidder award can be routed to extra approval
- **Why it matters.** `bidders_count` is part of the award data, so "only one vendor responded" policies work.
- **Setup.** Company flow with trigger `bidders_count < 2`; event with one bidder.
- **Steps.** 1. Award the one vendor and list flows.
- **Expected.** The single-bid flow is listed; with two bidders it is not.
- **Oracle.** Flow list.
- **Trace.** P2 · manual · `app/models/proposal.rb:215-228`

#### API-XDAPR-061 — Submitting into an approval locks the award and lets approvers see the event
- **Why it matters.** On submit with a flow the proposal becomes `requested`, LOA generation is deferred, every stage
  of the event gets the approvers in `misc.approver_identifiers` (so approvers can open it), and the latest commercial
  stage's submission time is expired so vendors cannot keep revising.
- **Setup.** v2 company with an applicable award flow; journey-like event with a populated draft proposal.
- **Steps.** 1. `POST /proposal/:uuid/submit` with the flow. 2. Read proposal, stages and event approvals.
- **Expected.** Proposal requested; one pending approval request; approvers present on all stages; vendors can no longer revise.
- **Oracle.** As listed.
- **Trace.** P1 · manual · `app/helpers/api/proposal_helper.rb:168-186` · `app/models/proposal.rb:393-405`

#### API-XDAPR-062 — A refused award submit leaves pending counter offers untouched
- **Why it matters.** Submit revokes pending counter offers before checking the approval; when the check then refuses
  (523 / 570), the early return inside the transaction must roll the revocation back (Rails 7.0 rolls back on early return).
- **Setup.** Draft proposal; one pending counter offer on the event; an invalid approval flow id.
- **Steps.** 1. Submit with `approval_flow_uuid: "Z2dnWmdaUWtnZw=="`. 2. Read the counter offer.
- **Expected.** 422 code 523; the counter offer is still pending.
- **Oracle.** Counter offer status.
- **Trace.** P1 · manual · `app/helpers/api/proposal_helper.rb:127-176`

#### API-XDAPR-063 — What happens to the award when its approval ends
- **Why it matters.** Each outcome must leave the buyer able to continue: approved → bids closed, proposal `selected`;
  rejected → proposal `rejected` and a NEW draft copy to re-award; withdrawn → `withdrawn` + new draft; expired → the old
  proposal is set to `active` (not expired) + new draft — suspicious: an expired award reads as live.
- **Setup.** Four awards in approval on four events.
- **Steps.** 1. Approve / reject / withdraw / let expire. 2. Read each event's proposals.
- **Expected.** As above; exactly one draft per event afterwards.
- **Oracle.** Proposal statuses; `meta_data.previous_proposal_id` on the new draft.
- **Trace.** P1 · manual · `app/helpers/api/proposal_helper.rb:378-460` · `app/models/proposal.rb:351-372`

#### API-XDAPR-064 — With owner-only visibility, the new draft after a rejection moves to the event owner
- **Why it matters.** When `restrict_event_visibility_to_owner` is set and the submitter is not a super admin user, the
  re-created draft is owned by the event owner, so the buyer who submitted it can no longer open, edit or resubmit
  (every proposal lookup is scoped to its creator).
- **Setup.** Event config restrict_event_visibility_to_owner; award submitted by a colleague of the owner; rejected.
- **Steps.** 1. As the submitter, `POST /proposal/:new_draft/add_response`.
- **Expected.** Today: 721 'Proposal does not exists' for the submitter. Decide whether that is intended.
- **Oracle.** created_by_user_id of the new draft.
- **Trace.** P2 · manual · `app/helpers/api/proposal_helper.rb:437-445`

#### API-XDAPR-065 — Approving a technical evaluation marks the evaluations final
- **Why it matters.** RFP proposals use the technical_evaluation key; approval records the evaluator, marks scores
  active and the proposal selected; rejection puts scores back so evaluators can redo them.
- **Setup.** RFP round with section-wise scoring off; evaluation submitted into a technical_evaluation flow.
- **Steps.** 1. Approve. 2. Read evaluations and proposal.
- **Expected.** Proposal selected; evaluation scores active; trade misc evaluated users updated.
- **Oracle.** As listed.
- **Trace.** P2 · manual · `app/helpers/api/proposal_helper.rb:378-399` · `app/helpers/api/proposal_approval_helper.rb:47-48`

## 7. Approving and rejecting — resolve_approval and bulk_resolve

#### API-XDAPR-066 — A decision without a resolution is refused before anything else
- **Why it matters.** The resolution check is a before_action, so it answers 734 even when the approver is also missing.
- **Setup.** Buyer session. Bogus approver only.
- **Steps.** `POST /approval_workflow/approval_requests/resolve_approval` with body `{"approver_uuid": "Z2dnWmdaUWtnZw=="}`. 1. Resolve without a resolution.
- **Expected.** HTTP 422, code 734 'Invalid resolution value. Please choose either Approve or Reject.'
- **Oracle.** 422 + 734; no approver changed.
- **Trace.** P1 · automate · `EDGE-DAPR-066` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:6-8` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:256-263`

#### API-XDAPR-067 — The button label is not a valid resolution
- **Why it matters.** Only `accepted` and `not_accepted` exist; "approve" (what a human types) must be refused.
- **Setup.** Bogus approver only.
- **Steps.** `POST /approval_workflow/approval_requests/resolve_approval` with body `{"approver_uuid": "Z2dnWmdaUWtnZw==", "resolution": "approve", "remarks": "QA_Platform_{{stamp}}"}`. 1. Resolve with "approve".
- **Expected.** HTTP 422, code 734 'Invalid resolution value. Please choose either Approve or Reject.'
- **Oracle.** 422 + 734.
- **Trace.** P2 · automate · `EDGE-DAPR-067` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:259`

#### API-XDAPR-068 — A resolution sent as a list is refused
- **Why it matters.** Wrong type must not be coerced into "accepted".
- **Setup.** Bogus approver only.
- **Steps.** `POST /approval_workflow/approval_requests/resolve_approval` with body `{"approver_uuid": "Z2dnWmdaUWtnZw==", "resolution": ["accepted"]}`. 1. Send the resolution as an array.
- **Expected.** HTTP 422, code 734 'Invalid resolution value. Please choose either Approve or Reject.'
- **Oracle.** 422 + 734.
- **Trace.** P2 · automate · `EDGE-DAPR-068` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:259`

#### API-XDAPR-069 — Approving without saying which approval is refused
- **Why it matters.** No approver → nothing to resolve.
- **Setup.** Buyer session.
- **Steps.** `POST /approval_workflow/approval_requests/resolve_approval` with body `{"resolution": "accepted", "remarks": "QA_Platform_{{stamp}}"}`. 1. Approve with no approver.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DAPR-069` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:133-137`

#### API-XDAPR-070 — Rejecting without a reason is refused
- **Why it matters.** A rejection without remarks leaves the requester with no idea what to fix; the backend enforces
  it (approval remarks for APPROVE are only enforced by the UI).
- **Setup.** Bogus approver only.
- **Steps.** `POST /approval_workflow/approval_requests/resolve_approval` with body `{"approver_uuid": "Z2dnWmdaUWtnZw==", "resolution": "not_accepted"}`. 1. Reject with no remarks.
- **Expected.** HTTP 422, code 2 'Insufficient parameters' (before_action, before the approver lookup).
- **Oracle.** 422 + code 2.
- **Trace.** P1 · automate · `EDGE-DAPR-070` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:260-262`

#### API-XDAPR-071 — Rejecting with only spaces as the reason is refused
- **Why it matters.** Whitespace is not a reason.
- **Setup.** Bogus approver only.
- **Steps.** `POST /approval_workflow/approval_requests/resolve_approval` with body `{"approver_uuid": "Z2dnWmdaUWtnZw==", "resolution": "not_accepted", "remarks": "   "}`. 1. Reject with blank remarks.
- **Expected.** HTTP 422, code 2 'Insufficient parameters' (`remarks.blank?`).
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DAPR-071` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:260-262`

#### API-XDAPR-072 — Approving an approval that does not exist is refused
- **Why it matters.** The approver row is looked up together with the caller's approver identifiers; nothing found → 4.
  Also proves the force-resolve path adds nothing for a missing row.
- **Setup.** Bogus approver only.
- **Steps.** `POST /approval_workflow/approval_requests/resolve_approval` with body `{"approver_uuid": "Z2dnWmdaUWtnZw==", "resolution": "accepted", "remarks": "QA_Platform_{{stamp}}"}`. 1. Approve approver 999999999.
- **Expected.** HTTP 422, code 4 'Request not found' (`approve` returns nil → `raise "4"` → rendered as 4).
- **Oracle.** 422 + code 4.
- **Trace.** P1 · automate · `EDGE-DAPR-072` · `app/models/approval_workflow/is_approver_methods.rb:23-26` · `app/controllers/concerns/approval_workflow_controller_helpers/approval_request_controller_helper.rb:13-14`

#### API-XDAPR-073 — Approving with an undecodable approver id is refused as missing
- **Why it matters.** nil after decoding must not resolve "any" approver.
- **Setup.** None.
- **Steps.** `POST /approval_workflow/approval_requests/resolve_approval` with body `{"approver_uuid": "WrongUuid1=", "resolution": "accepted", "remarks": "QA_Platform_{{stamp}}"}`. 1. Approve with an undecodable id.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DAPR-073` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:137`

#### API-XDAPR-074 — Approving the same step twice is refused, but as "not found"
- **Why it matters.** Double click / two tabs. The second call finds the approver no longer pending, so `approve`
  returns nil and the answer is 4 'Request not found' — not 491 'Step is already approved'. Only one trail, one remark, one e-mail.
- **Setup.** A real pending approval where the caller is the approver (needs an approver session and a request).
- **Steps.** 1. Approve. 2. Approve again with the same approver uuid.
- **Expected.** First 200; second 422 code 4. One ApproverTrail (completed).
- **Oracle.** Codes; trail count.
- **Trace.** P1 · manual · `app/models/approval_workflow/is_approver_methods.rb:24-26`

#### API-XDAPR-075 — Approving after the requester withdrew is refused
- **Why it matters.** Withdrawal marks pending approvers `withdrawn`; a late approval must not revive the award.
- **Setup.** Award in approval; requester withdraws; approver still has the old link.
- **Steps.** 1. Approver resolves accepted.
- **Expected.** 422 code 4; proposal stays withdrawn; no bids closed.
- **Oracle.** Code; proposal status.
- **Trace.** P0 · manual · `app/models/approval_workflow/has_approval_methods.rb:108-116` · `app/models/approval_workflow/is_approver_methods.rb:26`

#### API-XDAPR-076 — A later step cannot be approved before the earlier one (sequential flow)
- **Why it matters.** Steps after the first are `scheduled`; their approvers are `scheduled` too, so approving early answers 4.
  Only when step 1 completes is step 2 moved to pending (and gets a fresh expiry).
- **Setup.** Two-step flow, different approvers; step 1 pending.
- **Steps.** 1. Step-2 approver approves. 2. Step-1 approver approves. 3. Step-2 approver approves.
- **Expected.** 1 → 422 code 4; 2 → 200, step 2 pending; 3 → 200, request completed.
- **Oracle.** Step statuses and current_step after each call.
- **Trace.** P0 · manual · `app/models/approval_workflow/approval_request.rb:128-160` · `app/controllers/concerns/approval_workflow_controller_helpers/approval_request_controller_helper.rb:52-61` · `app/models/approval_workflow/approval_step.rb:175-187`

#### API-XDAPR-077 — In a parallel step the second approver is told the step is already approved — even when rejecting
- **Why it matters.** Without acceptance/rejection conditions the first decision closes the step, but the other
  approvers stay `pending`. Their later action passes `approve`/`reject` and then fails with 491 'Step is already
  approved' (the transaction rolls back), including when the step was actually REJECTED — a misleading message.
- **Setup.** One step with two approvers, no conditions.
- **Steps.** 1. Approver A rejects. 2. Approver B approves.
- **Expected.** 2 → 422 code 491 'Step is already approved' although the step is rejected. Message should reflect the real state.
- **Oracle.** Code 491; step status rejected.
- **Trace.** P2 · manual · `app/controllers/concerns/approval_workflow_controller_helpers/approval_request_controller_helper.rb:19-20` · `app/controllers/concerns/approval_workflow_controller_helpers/approval_request_controller_helper.rb:44-66`

#### API-XDAPR-078 — A step that needs every approver waits for all of them
- **Why it matters.** `acceptance_condition` (e.g. `accepted_approvers = all_approvers`) keeps the step pending after the
  first approval; team approvers are counted as users of the team with that role.
- **Setup.** Step config conditions.acceptance_condition `accepted_approvers = all_approvers`, three approvers.
- **Steps.** 1. Two approve. 2. Read step. 3. Third approves.
- **Expected.** After 2: step pending, request pending. After 3: step completed, next step or completion.
- **Oracle.** Step status after each call.
- **Trace.** P1 · manual · `app/controllers/concerns/approval_workflow_controller_helpers/approval_request_controller_helper.rb:23-42`

#### API-XDAPR-079 — A rejection on an expired step is turned into "expired" and the request moves on
- **Why it matters.** DEFECT-IN-WAITING. Between the step's expiry time and the expiry worker, an approver can still
  act. The resolver overwrites the step status with `expired`, and an expired non-last step ADVANCES to the next step —
  so a REJECTION becomes a pass.
- **Setup.** Two-step flow; step 1 past its expiration_date but not yet swept; flow config without stop_expiry_in_approval.
- **Steps.** 1. Step-1 approver rejects with remarks. 2. Read the request.
- **Expected.** Should be rejected (or refused as expired). Today: step 1 expired, current_step 2 pending, request still pending.
- **Oracle.** Request status and current_step.
- **Trace.** P1 · manual · `app/controllers/concerns/approval_workflow_controller_helpers/approval_request_controller_helper.rb:44-61`

#### API-XDAPR-080 — The requester can approve their own request
- **Why it matters.** SEGREGATION OF DUTIES. Nothing compares the approver with `requested_by_user_id`. A buyer who is
  in the approving role (`c-<company>#ur-<role>` or a team approver) — or who picked themselves in an "approver select"
  step through `step_uuid_vs_user_uuid` — can approve their own award or bid selection.
- **Setup.** v2 award flow with a step "approver select" (any user) or a role step that includes the initiator's role.
- **Steps.** 1. Submit the award choosing yourself (`step_uuid_vs_user_uuid: {<step>: <own uuid>}`). 2. Approve it yourself.
- **Expected.** Should be refused. Today: 200 and the award completes.
- **Oracle.** Approval completed with requested_by = approver.
- **Trace.** P0 · manual · `app/models/approval_workflow/has_approval_methods.rb:220-238` · `app/models/approval_workflow/is_approver_methods.rb:23-30`

#### API-XDAPR-081 — A force-resolve user can resolve approvals of any company
- **Why it matters.** SECURITY. For roles in `allowed_user_roles_to_force_resolve_approval_requests` the resolver adds the
  identifier of WHATEVER approver id is sent, with no company scope — an approver id from another tenant is resolvable.
- **Setup.** Company A config allowed_user_roles_to_force_resolve_approval_requests includes the caller's role; a pending approver id of company B.
- **Steps.** 1. As A's user, resolve B's approver id.
- **Expected.** Should be 4. Today: resolved.
- **Oracle.** B's approval status.
- **Trace.** P0 · manual · `app/controllers/concerns/approval_workflow_controller_helpers/approval_request_controller_helper.rb:123-130` · `app/models/user.rb:1046-1053`

#### API-XDAPR-082 — Notifications go out for decisions that were rolled back
- **Why it matters.** `ApprovalStatusWorker.perform_async` is queued inside the transaction. In a bulk decision where a
  later item fails, the earlier decisions roll back but their status e-mails/notifications are already queued.
- **Setup.** Two pending approvals of the caller; the second approver id is invalid.
- **Steps.** 1. `POST bulk_resolve` with [valid, invalid].
- **Expected.** 422 code 4 and nothing changed — and no notification. Today: notification for the first one is sent.
- **Oracle.** Sidekiq / mail log.
- **Trace.** P2 · manual · `app/controllers/concerns/approval_workflow_controller_helpers/approval_request_controller_helper.rb:137` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:163-167`

#### API-XDAPR-083 — The approval remark is lost when the approver already has a trail
- **Why it matters.** In `approve`/`reject`, when a trail for this user already exists (copied into a modified request),
  `new_trail` is nil, so the Remark is saved against `NilClass` / nil id — the approver's remark vanishes from the timeline.
- **Setup.** A request modified by adding a step (approval_requests update) after an approver had acted, then that approver acts again on the new request.
- **Steps.** 1. Approve with remarks. 2. Read the timeline.
- **Expected.** Remark visible. Risk: remark stored with item_type NilClass.
- **Oracle.** Remarks on the approver trail.
- **Trace.** P2 · manual · `app/models/approval_workflow/is_approver_methods.rb:34-43` · `app/models/approval_workflow/is_approver_methods.rb:61-70`

#### API-XDAPR-084 — A bulk decision on approvals that do not exist is refused as a whole
- **Why it matters.** Bulk must be all-or-nothing.
- **Setup.** Bogus approvers only.
- **Steps.** `POST /approval_workflow/approval_requests/bulk_resolve` with body `{"approver_uuids": ["Z2dnWmdaUWtnZw==", "WrongUuid1="], "resolution": "accepted", "remarks": "QA_Platform_{{stamp}}"}`. 1. Bulk-approve two bogus approvers.
- **Expected.** HTTP 422, code 4 'Request not found'.
- **Oracle.** 422 + code 4.
- **Trace.** P1 · automate · `EDGE-DAPR-084` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:153-175`

#### API-XDAPR-085 — Bulk approver ids sent as text must not crash
- **Why it matters.** DEFECT-IN-WAITING. `approver_ids` (not a uuid key, so not split by ParamsAuth) is iterated with
  `.each`; a string raises NoMethodError, the rescue only maps numeric messages, so it re-raises → 500.
- **Setup.** None.
- **Steps.** `POST /approval_workflow/approval_requests/bulk_resolve` with body `{"approver_ids": "QA_Platform_{{stamp}}", "resolution": "not_accepted", "remarks": "QA_Platform_{{stamp}}"}`. 1. Send ids as a string.
- **Expected.** Should be 422 code 2. Today: HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DAPR-085` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:158-172`

#### API-XDAPR-086 — A bulk decision with an empty selection is refused
- **Why it matters.** The dashboard sends an empty list when none of the selected rows needs the caller's action (UI-XDAPR-003).
- **Setup.** None.
- **Steps.** `POST /approval_workflow/approval_requests/bulk_resolve` with body `{"approver_uuids": [], "resolution": "accepted", "remarks": "QA_Platform_{{stamp}}"}`. 1. Bulk-approve nothing.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DAPR-086` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:158`

#### API-XDAPR-087 — A bulk decision with an invented resolution is refused
- **Why it matters.** Same before_action as single resolve.
- **Setup.** Bogus approver only.
- **Steps.** `POST /approval_workflow/approval_requests/bulk_resolve` with body `{"approver_uuids": ["Z2dnWmdaUWtnZw=="], "resolution": "approved", "remarks": "QA_Platform_{{stamp}}"}`. 1. Bulk with "approved".
- **Expected.** HTTP 422, code 734 'Invalid resolution value. Please choose either Approve or Reject.'
- **Oracle.** 422 + 734.
- **Trace.** P2 · automate · `EDGE-DAPR-087` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:256-259`

## 8. Withdrawing an approval request

#### API-XDAPR-088 — Withdrawing a request that does not exist is refused
- **Why it matters.** The lookup is scoped to pending requests raised by the caller; a bogus id must be 4.
- **Setup.** None.
- **Steps.** `POST /approval_workflow/approval_requests/Z2dnWmdaUWtnZw==/withdraw_approval` with body `{"remarks": "QA_Platform_withdraw_{{stamp}}", "attachments": []}`. 1. Withdraw request 999999999.
- **Expected.** HTTP 422, code 4 'Request not found'.
- **Oracle.** 422 + code 4.
- **Trace.** P1 · automate · `EDGE-DAPR-088` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:177-179`

#### API-XDAPR-089 — Withdrawing with an undecodable id is refused
- **Why it matters.** nil id must match nothing.
- **Setup.** None.
- **Steps.** `POST /approval_workflow/approval_requests/WrongUuid1=/withdraw_approval` with body `{"remarks": "QA_Platform_withdraw_{{stamp}}"}`. 1. Withdraw with an undecodable id.
- **Expected.** HTTP 422, code 4 'Request not found'.
- **Oracle.** 422 + code 4.
- **Trace.** P2 · automate · `EDGE-DAPR-089` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:178-179`

#### API-XDAPR-090 — Only the requester can withdraw, and only while it is pending
- **Why it matters.** A colleague or an approver must not pull an award out of approval; a completed approval cannot be undone by withdrawal.
- **Setup.** Award in approval raised by buyer A; buyer B of the same company; another request already completed.
- **Steps.** 1. As B, withdraw A's request. 2. As A, withdraw the completed one.
- **Expected.** Both 422 code 4 (lookup scoped to `status: pending, requested_by_user_id: Current.user.id`); policy check is a second guard.
- **Oracle.** Codes; statuses unchanged.
- **Trace.** P0 · manual · `app/controllers/api/approval_workflow/approval_requests_controller.rb:178-180` · `app/policies/approval_workflow/approval_request_policy.rb:23-25`

#### API-XDAPR-091 — Withdrawing an award puts it back to a fresh draft with the same allocation
- **Why it matters.** After withdrawal the buyer must be able to fix and resubmit: the request is `withdrawn` (with
  ended_at), pending steps/approvers withdrawn, the proposal `withdrawn`, and a draft copy carries the same vendors and quantities.
- **Setup.** Award in approval.
- **Steps.** 1. Withdraw with remarks. 2. Read the event's proposals; open the new draft; resubmit.
- **Expected.** Withdraw answers 'Approval request withdrawn successfully'; new draft has the same responses_hash; resubmit starts a new request.
- **Oracle.** Two proposals (withdrawn + draft); second approval request pending.
- **Trace.** P1 · manual · `app/controllers/api/approval_workflow/approval_requests_controller.rb:181-197` · `app/helpers/api/proposal_helper.rb:426-460`

## 9. The approval inbox, step details and adding approvers

#### API-XDAPR-092 — The pending-approvals inbox answers on either engine version
- **Why it matters.** Feeds the approvals drawer. On v1 it is refused (101) and the dashboard does not call it; on v2 it lists the caller's pending approver rows.
- **Setup.** Buyer session.
- **Steps.** `GET /approval_workflow/approval_requests/get_pending_approvals`. 1. Read the inbox.
- **Expected.** v2: HTTP 200 `{pending_tasks: [...]}`; v1: 422 code 101. Never 5xx.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-DAPR-092` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:115-130`

#### API-XDAPR-093 — Step details of a request that does not exist are refused
- **Why it matters.** Drives the "edit approvers" drawer.
- **Setup.** None.
- **Steps.** `GET /approval_workflow/approval_requests/Z2dnWmdaUWtnZw==/approval_steps_details`. 1. Read steps of request 999999999.
- **Expected.** v2: HTTP 422 code 4; v1: 422 code 455 (policy needs v2).
- **Oracle.** 422 with code 4 or 455.
- **Trace.** P2 · automate · `EDGE-DAPR-093` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:200-204` · `app/policies/approval_workflow/approval_request_policy.rb:19-21`

#### API-XDAPR-094 — Searching approvers without a search term is refused
- **Why it matters.** Empty search must not list the whole company.
- **Setup.** None.
- **Steps.** `GET /approval_workflow/approval_requests/Z2dnWmdaUWtnZw==/search_approvers`. 1. Search with no query.
- **Expected.** v2: 422 code 2; v1: 422 code 455.
- **Oracle.** 422 with code 2 or 455.
- **Trace.** P2 · automate · `EDGE-DAPR-094` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:227-230`

#### API-XDAPR-095 — The approvals list without an output format must not crash
- **Why it matters.** DEFECT-IN-WAITING. `generate_response(params["file_format"])` raises "Invalid view format" for
  anything but json/csv/excel, so an API client that omits file_format gets a 500.
- **Setup.** Approval flow version v2 (on v1 the policy answers 455 first).
- **Steps.** `GET /approval_workflow/approval_requests?view_type=approver`. 1. List approvals with no file_format.
- **Expected.** Should default to json or answer 422. Today on v2: HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DAPR-095` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:44-57` · `app/services/base_view_service.rb:10-21`

#### API-XDAPR-096 — An invented approvals tab answers 200 with nothing instead of an error
- **Why it matters.** `sanitize_params_for_index` returns code 2 for an unknown view_type, but `handle_json` drops the
  error key, so the client gets 200 with null data — a silent empty inbox. (`all_approvals` without approval_status
  returns code 45, which has no entry in en-IN.yml; it is swallowed the same way.)
- **Setup.** Approval flow version v2.
- **Steps.** `GET /approval_workflow/approval_requests?view_type=QA_Platform_bogus&file_format=json`. 1. Ask for an unknown tab.
- **Expected.** Should be 422 code 2. Today: HTTP 200 with null approvals. Never 5xx.
- **Oracle.** Status < 500; body shape.
- **Trace.** P2 · automate · `EDGE-DAPR-096` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:245-254` · `app/services/approval_requests/view_service.rb:49-52` · `app/services/approval_requests/view_service.rb:116-128`

#### API-XDAPR-097 — Adding approvers with an empty list is refused
- **Why it matters.** The "add approval step" call must carry at least one step.
- **Setup.** None.
- **Steps.** `PATCH /approval_workflow/approval_requests/Z2dnWmdaUWtnZw==` with body `{"additional_steps": [], "is_step_modified": false}`. 1. Add zero steps.
- **Expected.** v2: 422 code 2; v1: 422 code 455.
- **Oracle.** 422 with code 2 or 455.
- **Trace.** P2 · automate · `EDGE-DAPR-097` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:59-65`

#### API-XDAPR-098 — Adding approvers to a request that does not exist is refused
- **Why it matters.** The request lookup is scoped to the company's flows; bogus id → 4 before any step is built.
- **Setup.** None. The approver named is the run's own buyer.
- **Steps.** `PATCH /approval_workflow/approval_requests/Z2dnWmdaUWtnZw==` with body `{"additional_steps": [{"order": 0, "approvers": [{"uuid": "{{buyerUserUuid}}"}]}], "is_step_modified": false}`. 1. Add a step to request 999999999.
- **Expected.** v2: 422 code 4; v1: 422 code 455.
- **Oracle.** 422 with code 4 or 455.
- **Trace.** P2 · automate · `EDGE-DAPR-098` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:67-69`

#### API-XDAPR-099 — Anyone on v2 can add approvers to any request of the company
- **Why it matters.** SECURITY. The UI shows the settings cog only when `is_allowed_to_edit_approval` is not hidden
  (company `allow_additional_approval_steps`, approver/initiator/super admin user, pending status, max steps). The API
  checks none of it: any v2 user can insert approvers — including themselves — into any pending request of the company.
- **Setup.** v2 company with allow_additional_approval_steps OFF; a pending award approval; a member who is neither approver nor initiator.
- **Steps.** 1. As the member, PATCH the request with an extra step containing themselves.
- **Expected.** Should be 455. Today: 200, a modified request with the new step.
- **Oracle.** approval_steps_details shows the added step.
- **Trace.** P0 · manual · `app/controllers/api/approval_workflow/approval_requests_controller.rb:59-95` · `app/models/approval_workflow/approval_request.rb:419-451`

#### API-XDAPR-100 — An added step with its order as text crashes
- **Why it matters.** Validation uses `step[:order].to_i`, but the builder does `step[:order] + 1` → TypeError for "1" → 500.
- **Setup.** v2; a pending request the caller can modify.
- **Steps.** 1. PATCH with `additional_steps: [{"order": "1", "approvers": [{"uuid": "<user>"}]}]`.
- **Expected.** Should be 200 or 422 code 796. Today: 500.
- **Oracle.** Status < 500.
- **Trace.** P2 · manual · `app/controllers/api/approval_workflow/approval_requests_controller.rb:300-305` · `app/models/approval_workflow/has_approval_methods.rb:58-60`

#### API-XDAPR-101 — The initiator can add themselves as an approver
- **Why it matters.** The approver search excludes the initiator and existing approvers, but the update validator only
  checks uniqueness and presence — the initiator can be added by uuid and then approve (see API-XDAPR-080).
- **Setup.** v2; pending request raised by the caller.
- **Steps.** 1. PATCH with a step whose approver is the caller.
- **Expected.** Should be 797 'Invalid approvers: Each approver must be unique and valid'. Today: accepted.
- **Oracle.** Steps list.
- **Trace.** P1 · manual · `app/controllers/concerns/approval_workflow_controller_helpers/approval_request_controller_helper.rb:741-755` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:300-316`

#### API-XDAPR-102 — Technical-evaluation approvals never reach the pending inbox
- **Why it matters.** `filter_pending_approvers` drops pending rows whose resource is a Proposal on a TradeRequest
  (technical evaluation). An approver of a technical evaluation must find it elsewhere (the approvals page) or it expires unseen.
- **Setup.** v2; technical_evaluation flow with the caller as approver; an evaluation submitted into it.
- **Steps.** 1. `GET get_pending_approvals`. 2. `GET /approval_workflow/approval_requests?view_type=approver&file_format=json`.
- **Expected.** 1 does not list it; 2 does. Decide whether that is intended.
- **Oracle.** Presence in each list.
- **Trace.** P2 · manual · `app/controllers/concerns/approval_workflow_controller_helpers/approval_request_controller_helper.rb:510-526`

## 10. Starting an approval by hand and reading flows

#### API-XDAPR-103 — Starting an approval with nothing is refused
- **Why it matters.** `POST /approval_workflow/approval_requests` has no policy check at all, so its parameter guards are the only protection.
- **Setup.** None.
- **Steps.** `POST /approval_workflow/approval_requests` with body `{}`. 1. Start an approval with no fields.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DAPR-103` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:10-11` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:265-269`

#### API-XDAPR-104 — Starting an approval on an unknown kind of record is refused
- **Why it matters.** resource_type is classified and matched against models that have approvals; anything else → 888.
- **Setup.** None.
- **Steps.** `POST /approval_workflow/approval_requests` with body `{"resource_type": "QA_Platform_unknown_{{stamp}}", "resource_uuid": "Z2dnWmdaUWtnZw==", "approval_flow_uuid": "Z2dnWmdaUWtnZw=="}`. 1. Start an approval on an invented type.
- **Expected.** HTTP 422, code 888 'Invalid Parameters'.
- **Oracle.** 422 + code 888.
- **Trace.** P2 · automate · `EDGE-DAPR-104` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:12-14`

#### API-XDAPR-105 — Starting an approval on a stage that does not exist is refused
- **Why it matters.** Not-found guard on the resource.
- **Setup.** None.
- **Steps.** `POST /approval_workflow/approval_requests` with body `{"resource_type": "trade_request", "resource_uuid": "Z2dnWmdaUWtnZw==", "approval_flow_uuid": "Z2dnWmdaUWtnZw=="}`. 1. Start an approval on stage 999999999.
- **Expected.** HTTP 422, code 4 (code 888 if the model list was not loaded).
- **Oracle.** 422 with code 4 or 888.
- **Trace.** P2 · automate · `EDGE-DAPR-105` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:16-17`

#### API-XDAPR-106 — Starting an approval on the sandbox stage with a flow that does not exist is refused
- **Why it matters.** The flow must be one of the flows that apply to this record and this initiator; unknown → 523,
  and the second guard inside the transaction would also refuse.
- **Setup.** {{tradeId}} is the sandbox stage of the caller's company.
- **Steps.** `POST /approval_workflow/approval_requests` with body `{"resource_type": "trade_request", "resource_uuid": "{{tradeId}}", "approval_flow_uuid": "Z2dnWmdaUWtnZw==", "remarks": "QA_Platform_{{stamp}}"}`. 1. Start with flow 999999999.
- **Expected.** HTTP 422, code 523 'Invalid Approval'; the stage is unchanged.
- **Oracle.** 422 + 523; stage approvals list empty.
- **Trace.** P1 · automate · `EDGE-DAPR-106` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:19-20` · `app/controllers/api/approval_workflow/approval_requests_controller.rb:271-288`

#### API-XDAPR-107 — An approval can be started on another company's record
- **Why it matters.** SECURITY. The resource is found by id across ALL companies (`resource_class.find_by(id:)`) and
  there is no authorize call; the flow is checked against the CALLER's company flows. So a user can start an approval
  (and set approval_pending) on another tenant's bid or stage using their own flow.
- **Setup.** Company A user with an applicable A flow; the uuid of a company B bid or stage.
- **Steps.** 1. POST approval_requests with resource_uuid of B's record and A's flow.
- **Expected.** Should be 4/455. Today: 200 and B's record is pending approval.
- **Oracle.** B's record approval_status.
- **Trace.** P0 · manual · `app/controllers/api/approval_workflow/approval_requests_controller.rb:10-41`

#### API-XDAPR-108 — Reading an approval flow that does not exist is refused
- **Why it matters.** Flow details page.
- **Setup.** None.
- **Steps.** `GET /approval_workflow/approval_flows/Z2dnWmdaUWtnZw==`. 1. Read flow 999999999.
- **Expected.** HTTP 422 code 570 (Approval Flow not found), or 455 when the caller lacks approval-flow read permission (checked first).
- **Oracle.** 422 with code 570 or 455.
- **Trace.** P2 · automate · `EDGE-DAPR-108` · `app/controllers/api/approval_workflow/approval_flows_controller.rb:5-6` · `app/controllers/api/approval_workflow/approval_flows_controller.rb:142-145`

#### API-XDAPR-109 — The approval types on offer depend on the company's modules and settings
- **Why it matters.** Award approval (close_event_group) and technical-evaluation approval are only offered when
  `rfx_project_enabled` is on; bid selection, creation and surrogate approvals need the trade module.
- **Setup.** Buyer session.
- **Steps.** `GET /approval_workflow/approval_flows/trigger_conditions`. 1. Read the approval types.
- **Expected.** HTTP 200 with approvals_types including create_trade and close_trade; close_event_group only when rfx_project_enabled is on. Never 5xx.
- **Oracle.** Keys present.
- **Trace.** P2 · automate · `EDGE-DAPR-109` · `app/helpers/approval_workflow/approval_flow_helper.rb:188-202`

## 11. Delegation, escalation and e-mail approvals

#### API-XDAPR-110 — Reading a delegation that does not exist is refused
- **Why it matters.** The delegation drawer loads by id.
- **Setup.** None.
- **Steps.** `GET /delegations/Z2dnWmdaUWtnZw==`. 1. Read delegation 999999999.
- **Expected.** HTTP 404, code 679 'Delegation not found' (lookup before the policy).
- **Oracle.** 404 + 679.
- **Trace.** P2 · automate · `EDGE-DAPR-110` · `app/controllers/api/delegations_controller.rb:6-11`

#### API-XDAPR-111 — A delegation without a start time crashes
- **Why it matters.** `Time.at(params['start_time'])` with nil raises TypeError → 500 instead of 422.
- **Setup.** v2 company; caller has no active delegation. Not twinned: if the crash is fixed by defaulting, a real delegation would be created for the run's buyer.
- **Steps.** 1. `POST /delegations` with `delegation_type: all_approvals`, a delegatee and an end_time but no start_time.
- **Expected.** Should be 422. Today: 500.
- **Oracle.** Status < 500.
- **Trace.** P2 · manual · `app/controllers/concerns/delegations_controller_helper.rb:10-18`

#### API-XDAPR-112 — A user can delegate approvals to themselves
- **Why it matters.** No check that delegatee differs from delegator; the delegation is created and every pending
  approval gets a duplicate approver row for the same user.
- **Setup.** v2; caller without delegations.
- **Steps.** 1. `POST /delegations` with delegatee_uuid = own uuid.
- **Expected.** Should be refused. Today: created.
- **Oracle.** Delegation exists with delegator = delegatee.
- **Trace.** P2 · manual · `app/controllers/api/delegations_controller.rb:18-42` · `app/controllers/concerns/delegations_controller_helper.rb:38-63`

#### API-XDAPR-113 — Team-wise delegation over two teams only hands over the first team's approvals
- **Why it matters.** DEFECT-IN-WAITING. Inside the loop `approver_identifiers` is reassigned to the first team's subset,
  so for the second team the filter runs on an already-filtered list and finds nothing — those approvals are never delegated.
- **Setup.** Delegator in teams T1 and T2, with pending approvals in both; team-wise delegation T1→U1, T2→U2.
- **Steps.** 1. Let the delegation start. 2. Read U2's pending approvals.
- **Expected.** U2 sees T2's approvals. Today: none.
- **Oracle.** Approver rows with delegation_id for T2 steps.
- **Trace.** P1 · manual · `app/models/delegation.rb:78-95`

#### API-XDAPR-114 — During a delegation both people can act, and the first decision wins
- **Why it matters.** Delegation ADDS an approver row for the delegatee; the delegator's row stays. The second person to act gets 4 or 491.
- **Setup.** Active all-approvals delegation; a pending approval of the delegator.
- **Steps.** 1. Delegatee approves. 2. Delegator approves.
- **Expected.** 1 → 200; 2 → 422 code 491 (step already done) or 4.
- **Oracle.** One decision on the step.
- **Trace.** P1 · manual · `app/models/delegation.rb:108-131`

#### API-XDAPR-115 — After a delegation is cancelled the delegatee can no longer act
- **Why it matters.** Cancelling marks the delegatee's pending rows `delegatee_in_active`.
- **Setup.** Active delegation with a delegated pending approval.
- **Steps.** 1. Delegator cancels. 2. Delegatee approves.
- **Expected.** 2 → 422 code 4.
- **Oracle.** Code 4; approval still pending for the delegator.
- **Trace.** P1 · manual · `app/models/delegation.rb:178-195`

#### API-XDAPR-116 — An escalated-to user sees the request but cannot decide it
- **Why it matters.** Escalation is notify-only: it logs the escalation and mails the target; it does not add an approver identifier.
- **Setup.** Escalation matrix module on; a rule escalating step approver X to user E; step expired.
- **Steps.** 1. E lists view_type escalated_to_me. 2. E resolves the approver row.
- **Expected.** 1 lists it; 2 → 422 code 4.
- **Oracle.** As above.
- **Trace.** P2 · manual · `app/services/approval_workflow/escalation_service.rb:7-17` · `app/models/user.rb:730-732`

#### API-XDAPR-117 — E-mail approval trusts the e-mail address it is given
- **Why it matters.** SECURITY / trust boundary. Only the "howler" e-mail service app may call resolve_from_email (no
  login needed); it REPLACES Current.user with whoever owns `actioner_email`. Anyone holding that app key, or a spoofed
  reply that the service forwards, decides as that approver. Not twinned: from the dashboard app the call answers 401
  'This app is not authorized to use this API' AND marks the caller's session inactive.
- **Setup.** Review only; or a test environment with the howler app credentials.
- **Steps.** 1. Inspect how howler authenticates the sender before calling. 2. From a dashboard session, confirm the 401 and that the next call is logged out.
- **Expected.** Decision tied to a signed token, not just an address.
- **Oracle.** Code review; session status after the 401.
- **Trace.** P1 · manual · `app/controllers/api/approval_workflow/email_approvals_controller.rb:13-43` · `config/app_auth_config.yml:2097` · `app/controllers/concerns/json_helpers.rb:26-35`

#### API-XDAPR-118 — An e-mail rejection without a comment is acknowledged but does nothing
- **Why it matters.** The controller answers success after queuing the worker; the worker then returns `requires_comment`
  without rejecting. The approver believes they rejected.
- **Setup.** Email approvals enabled; a pending award approval.
- **Steps.** 1. Reply "reject" with no comment.
- **Expected.** Approver is told a comment is required; today the API said success and the approval stays pending.
- **Oracle.** Approval still pending.
- **Trace.** P2 · manual · `app/controllers/api/approval_workflow/email_approvals_controller.rb:17-30` · `app/services/email_approvals/approval_resolution_service.rb:23-25`

#### API-XDAPR-119 — An e-mail decision by someone who is not an approver fails with an unrelated message
- **Why it matters.** The worker raises code 701, whose text is about editing a Procol employee.
- **Setup.** Email approvals enabled; a reply from a user who is not on the current step.
- **Steps.** 1. Send an approve reply from that address.
- **Expected.** Refused — with a message about not being an approver; today 701 'You are not allowed to edit details of Procol Employee'.
- **Oracle.** Worker log / notification text.
- **Trace.** P2 · manual · `app/services/email_approvals/approval_resolution_service.rb:18-21`

## 12. What the screens show (procol-client-dashboard)

#### UI-XDAPR-001 — Bulk approve and reject both stay disabled until a remark is typed
- **Why it matters.** On the Approvals page the "Add Response" popover disables BOTH buttons without remarks, although
  the backend only requires remarks to reject. Users of a company that does not require approval remarks cannot approve
  silently from this screen (they can from the single-approval card only with a remark too, UI-XDAPR-004).
- **Setup.** v2 company; caller has two pending approvals; Approvals page, "approver" tab.
- **Steps.** 1. Select both rows. 2. Open Add Response. 3. Leave remarks empty.
- **Expected.** Approve and Reject disabled; enabled once text is entered.
- **Oracle.** Button disabled state.
- **Trace.** P2 · automate · `procol-client-dashboard/src/views/approvalRequests/approvalRequests.jsx:494-526`

#### UI-XDAPR-002 — Rows can only be selected on the tab of approvals waiting for me
- **Why it matters.** Bulk actions must not be offered on "initiated by me" or "upcoming" tabs.
- **Setup.** Approvals page.
- **Steps.** 1. Switch through the tabs. 2. Look for row checkboxes and the Add Response button.
- **Expected.** Checkboxes only on the approver tab; Add Response disabled until at least one row is selected.
- **Oracle.** Presence of rowSelection; button disabled.
- **Trace.** P2 · automate · `procol-client-dashboard/src/views/approvalRequests/approvalRequests.jsx:133` · `procol-client-dashboard/src/views/approvalRequests/approvalRequests.jsx:733` · `procol-client-dashboard/src/views/approvalRequests/approvalRequests.jsx:770-771`

#### UI-XDAPR-003 — Bulk approve only sends the approvals that actually need me
- **Why it matters.** The screen collects approver rows with `my_approval_required`; a selection where none qualifies sends
  an empty list and the backend answers 'Insufficient parameters' (API-XDAPR-086) — shown as an error toast.
- **Setup.** Approver tab with a row whose step was just completed by a co-approver (stale page).
- **Steps.** 1. Select only that row. 2. Approve with a remark.
- **Expected.** An error message, no success toast, no row change.
- **Oracle.** Network body `approver_uuids: []`; toast text.
- **Trace.** P2 · automate · `procol-client-dashboard/src/views/approvalRequests/approvalRequests.jsx:426-475`

#### UI-XDAPR-004 — The approval card shows Approve/Reject only to the person whose action is pending
- **Why it matters.** The card renders the remarks box and buttons only when one of the step's approvers has
  `my_approval_required` (pending approver, pending step, caller's identifier). Both buttons require a non-blank remark.
- **Setup.** Award in approval; open the proposal page as (a) the approver, (b) the requester, (c) a step-2 approver.
- **Steps.** 1. Look at the approvals side panel in each session. 2. As (a), click Approve with an empty remark.
- **Expected.** Only (a) sees the buttons; empty remark shows the "enter remarks" error and sends nothing.
- **Oracle.** Buttons present/absent; no network call on empty remark.
- **Trace.** P1 · automate · `procol-client-dashboard/src/views/projectProposal/approvalSection/approvalCard.jsx:102-107` · `procol-client-dashboard/src/views/projectProposal/approvalSection/approvalCard.jsx:348-427` · `procol-client-dashboard/src/redux/orders/helpers.js:1728` · `app/models/approval_workflow/approver.rb:52-58`

#### UI-XDAPR-005 — Users allowed to force-resolve see Approve/Reject on any pending step
- **Why it matters.** `my_approval_required` is also true for force-resolve roles on pending steps, so those users get
  the buttons on approvals they are not named in — check this matches the company's intent.
- **Setup.** Company setting allowed_user_roles_to_force_resolve_approval_requests includes the viewer's role.
- **Steps.** 1. Open an event with a pending award approval where the viewer is not an approver.
- **Expected.** Buttons visible; clicking resolves the step.
- **Oracle.** Buttons; approval trail shows the viewer.
- **Trace.** P2 · manual · `app/serializers/approval_workflow/approver_serializer.rb:8-15`

#### UI-XDAPR-006 — Only the person who submitted the award can withdraw it, and must give a reason
- **Why it matters.** The "Withdraw Proposal" menu appears only when the proposal is `requested` and the viewer created
  it; the modal needs a reason or an attachment; on success it returns to Master QCS and the proposal shows a
  "withdrawn by … at …" banner.
- **Setup.** Award in approval; sessions for the submitter and a colleague.
- **Steps.** 1. Open the proposal as each. 2. As the submitter, open Withdraw, try with empty reason, then with a reason.
- **Expected.** Menu only for the submitter; Withdraw Request disabled until a reason; success toast and redirect; banner with name and date.
- **Oracle.** Menu presence; button state; banner text.
- **Trace.** P1 · automate · `procol-client-dashboard/src/views/projectProposal/projectProposal.jsx:316-318` · `procol-client-dashboard/src/views/projectProposal/withdrawApprovalModal/withdrawApprovalModal.jsx:26-46` · `procol-client-dashboard/src/views/projectProposal/projectProposal.jsx:185-194`

#### UI-XDAPR-007 — Submitting an award picks the only flow automatically and asks for approvers where needed
- **Why it matters.** With one applicable flow the modal auto-selects it and the button reads Submit; with several it
  reads Next and shows a summary; steps marked "approver select" must each have an approver or submit is blocked.
- **Setup.** Event with an award ready; companies with 1 and 2 applicable award flows; a flow with an approver-select step.
- **Steps.** 1. Click Submit Proposal. 2. Observe the flow choice and button label. 3. Try submitting without choosing the step's approver.
- **Expected.** As described; "Please select at least one approver to proceed." when a step is unfilled.
- **Oracle.** Button text; request body carries approval_flow_uuid and step_uuid_vs_user_uuid.
- **Trace.** P1 · automate · `procol-client-dashboard/src/views/awardingFlow/approvalModal.jsx:70-121` · `procol-client-dashboard/src/views/orderDetails/approvalFlowSelection/approvalFlowSelection.jsx:43-50`

#### UI-XDAPR-008 — With no award flow listed, the award is submitted without one
- **Why it matters.** The modal sends no approval_flow_uuid when the list is empty. If the company has a flow that is
  hidden from the list but still "exists" for the 570 check, the user gets 'Approval Flow not found'; if it is the
  budget case (API-XDAPR-057), the award closes with no approval at all.
- **Setup.** Company with no applicable award flow (and, separately, the budget-flow setup of API-XDAPR-057).
- **Steps.** 1. Submit the award.
- **Expected.** No flows → proposal selected immediately with the "Proposal submitted successfully" toast. Budget case → should go to approval.
- **Oracle.** Network body; proposal status afterwards.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/awardingFlow/approvalModal.jsx:104-121` · `app/helpers/api/proposal_approval_helper.rb:41`

#### UI-XDAPR-009 — Selecting a bid shows the approval step only when approval selection is enabled
- **Why it matters.** The dashboard setting approval_selection_enabled adds an approval-flow step to the Select Bid
  drawer; the final button reads "Request approval" when a flow is chosen, otherwise "Select bid". With the setting off
  no flow is sent and the backend auto-picks (API-XDAPR-036).
- **Setup.** Company setting approval_selection_enabled ON (and a second run with it OFF); live RFQ with a bid.
- **Steps.** 1. Click Select on a bid and step through the drawer.
- **Expected.** ON: approval step, flow list from close_bid/approval_workflows, approver-select validation ("Please select approvers in all approval steps"). OFF: no approval step.
- **Oracle.** Drawer steps; request body of close_bid.
- **Trace.** P1 · automate · `procol-client-dashboard/src/views/orderDetails/selectBidDrawer.jsx:551-575` · `procol-client-dashboard/src/views/orderDetails/selectBidDrawer.jsx:886-901` · `procol-client-dashboard/src/redux/user/index.js:463`

#### UI-XDAPR-010 — A surrogate bid goes in without approval whenever the flow list is empty or fails
- **Why it matters.** The Add Bid drawer opens the approval drawer only when the surrogate flow list is non-empty. A
  failed list (500 for a bad stage, 455 without read permission) or a company-level-only policy yields `[]`, and the
  bid is posted directly — combined with API-XDAPR-047 nothing stops it.
- **Setup.** v2 company with a surrogate approval flow; a buyer without approval-flow read permission.
- **Steps.** 1. Add a bid on behalf of a vendor.
- **Expected.** Should require approval. Today: the button reads "Submit quote/bid" and the bid is created active.
- **Oracle.** Network calls; bid status.
- **Trace.** P0 · manual · `procol-client-dashboard/src/views/orderDetails/addBidDrawer.jsx:144-147` · `procol-client-dashboard/src/views/orderDetails/addBidDrawer.jsx:399-412` · `procol-client-dashboard/src/views/orderDetails/surrogateBidApprovalDrawer/query.js:5-13`

#### UI-XDAPR-011 — The approvals drawer only asks the new engine on v2 companies
- **Why it matters.** The drawer merges old additional-request tasks with v2 pending approvals, fetching the v2 list
  only when approval_flow_version is v2 (the backend answers 101 otherwise). Approving from the drawer may send no remark.
- **Setup.** One v1 and one v2 company, each with a pending approval for the viewer.
- **Steps.** 1. Open the approvals drawer in each. 2. Approve one item from the drawer.
- **Expected.** v1: no call to get_pending_approvals; v2: call made and items listed; approve works with or without remark.
- **Oracle.** Network calls; item disappears after approve.
- **Trace.** P2 · automate · `procol-client-dashboard/src/redux/pendingTasks/actions.js:12-40` · `procol-client-dashboard/src/views/approvalsDrawer/approvalsDrawer.jsx:82-98`

#### UI-XDAPR-012 — The approval timeline shows a countdown on the pending step and refreshes when it ends
- **Why it matters.** Approvers need to see how long they have; when the timer hits zero the card refetches so an
  expired step is shown as expired. Withdrawn steps carry a "withdrawn" tag; delegated approvers show delegator → delegatee.
- **Setup.** Award approval with a short step expiry; a delegated approver; a withdrawn request in history.
- **Steps.** 1. Watch the pending step until it expires. 2. Open Request History.
- **Expected.** Countdown on the pending step only; refetch at zero; expired icon after; withdrawn tag; delegation names.
- **Oracle.** Rendered tags/icons; network refetch at expiry.
- **Trace.** P2 · automate · `procol-client-dashboard/src/views/orderDetails/approvalSection/approvalStepTitle.jsx:18-34` · `procol-client-dashboard/src/views/orderDetails/approvalSection/approvalExpiryTimer.jsx:30-37` · `procol-client-dashboard/src/views/orderDetails/approvalSection/approvalStepCard.jsx:19-60` · `procol-client-dashboard/src/views/orderDetails/approvalSection/approvalStepCard.jsx:96-99`

#### UI-XDAPR-013 — The "add approver" cog appears only when the backend says editing is allowed
- **Why it matters.** The cog depends on `is_allowed_to_edit_approval` (company allow_additional_approval_steps, viewer
  is approver/initiator/super admin user, request pending, under the max steps). The API itself does not enforce this (API-XDAPR-099), so the screen is the only gate.
- **Setup.** Company with allow_additional_approval_steps ON then OFF; pending award approval.
- **Steps.** 1. Open the approval card as approver, as initiator, as an unrelated member.
- **Expected.** Cog only for approver/initiator when ON; hidden when OFF; disabled with a reason when not pending or at the step limit.
- **Oracle.** Cog presence and tooltip.
- **Trace.** P2 · automate · `procol-client-dashboard/src/redux/orders/helpers.js:1704-1712` · `app/models/approval_workflow/approval_request.rb:419-451`

#### UI-XDAPR-014 — Only live approvals are shown; finished ones fold into Request History
- **Why it matters.** The panel shows pending requests first; with none pending it shows only the latest finished one and
  folds the rest into "Request History (n)" — the approval currently being viewed is always kept visible.
- **Setup.** Event with one rejected, one withdrawn and one pending award approval.
- **Steps.** 1. Open the proposal approvals panel. 2. Expand Request History.
- **Expected.** Pending visible; two in history; opening an older proposal pins its approval on top.
- **Oracle.** Rendered card order and counts.
- **Trace.** P2 · automate · `procol-client-dashboard/src/views/projectProposal/approvalSection/helpers.js:11-41` · `procol-client-dashboard/src/views/projectProposal/approvalSection/approvalSection.jsx:153-200`
