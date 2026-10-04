# Live and closed event actions (V1 trade controller) — backend digest (procol-backend origin/main ae36e86894)

## Overview
`Api::V1::TradeController` (app/controllers/api/v1/trade_controller.rb) holds the actions a buyer uses on a live or closed event: award (select) a bid via close_bid, add or remove vendors, add a new stage to a running project, unlock sealed bids with a finance-user OTP, request and resolve technical re-evaluation, and the read endpoints behind the live page (schema, quote details, ranks, L1, rejected bids, remarks). Routes are under `/api/v1/trade/...` (config/routes.rb:953-992, mounted by config/routes.rb:68-70 inside `namespace :api`). The logic lives in TradeControllerHelper, BidsControllerHelper, TradeTemplateHelper, CommonControllerHelper, AdditionalRequestResolutionHelper and the AddNewStage services. Most actions are console-only (data/app-access.json apps.console.v1.trade). The vendor website may call only accept_auction_tnc, download_event_details, event_schema, get_participated_auctions, history, home_page_request, quote_details, quote_summary, reevaluation_remarks, show and upload_bid_excel (apps.vendor.v1.trade).

### v1 trade — shared gates: app check, permission check, validate_event
Every v1 trade action runs these gates before its own checks.
Checks, in order:
1. The calling app is not listed for this v1 action → "app_error_auth_failed" "This app is not authorized to use this API" (HTTP 401), and the session is signed out — app/controllers/concerns/api_auth.rb:86-88; app/controllers/concerns/json_helpers.rb:31-35
2. A policy check (`authorize`) fails → 455 "You are not authorized to perform this action" (HTTP 422) — api_auth.rb:16,117-118
3. validate_event (most read actions): event missing, void or cancelled → 4 "Request not found" (HTTP 422); the user cannot view the event → 536 "You are not allowed to view this event." (HTTP 422); an old mobile app → 201 "Update your app to view this" (HTTP 422) — app/controllers/concerns/trade_controller_helper.rb:2214-2271
"Trade read permission" below means the policy show? = trade module read_record — app/policies/trade_request_policy.rb:9-11,40-42

### trade#close_bid — POST /api/v1/trade/:id/close_bid — award (select) a bid: lookups (part 1)
The buyer awards a vendor's bid. The route comment says "when buyer selects a bid". It does NOT end bidding early, and the event closes only when every line is awarded (part 7). There is no `authorize`; permission is checked in code. Console only.
Checks, in order:
1. If bid_id is sent without trade_request_id, the event is found through `Bid.find_by_id(bid_id).trade_request`, so an unknown bid_id raises → untyped 500 (defect-shaped) — app/controllers/concerns/trade_template_helper.rb:5548-5550
2. The event is not active, or its final close time `closed_at` has passed → 4 "Request not found" (HTTP 422) — trade_controller_helper.rb:4672-4674; app/models/trade_request.rb:232
3. The bid is not active (active or requested when multiple POs are allowed) → 4 (HTTP 422) — trade_controller_helper.rb:4687-4695
4. The user may not close (part 2) → 101 "You are not allowed to perform this action" (HTTP 422) — trade_controller_helper.rb:4697-4698
Cites: config/routes.rb:969, app/controllers/api/v1/trade_controller.rb:889-897

### trade#close_bid — POST /api/v1/trade/:id/close_bid — can a buyer award while bidding is open? (part 2)
Yes, by default: from bid start until `closed_at`. Only the event creator or a buyer-company super admin may award.
Checks, in order (is_allowed_to_close_bid), each → 101 (HTTP 422):
1. Vendor blacklisted, or unverified when the event does not allow unverified vendors — app/controllers/concerns/trade_controller_helper.rb:3223-3227
2. Event config `is_order_allowed_to_close_in_extra_closing_time_only` is on and the bid end time has not passed. Award is then possible only in the evaluation (extra closing) window — trade_controller_helper.rb:3229-3231; app/models/model_helpers/trade_request_model_helper.rb:124-126
3. Not the creator and not a company super admin, or bid start time not reached — trade_controller_helper.rb:3233; app/models/trade_request.rb:672-674
4. `closed_at` has passed — trade_controller_helper.rb:3229,3236
Rule 2 is repeated later as 9 "Unable to close the order at this time. Please wait for the bidding to end" (HTTP 422) — trade_controller_helper.rb:4951-4952

### trade#close_bid — POST /api/v1/trade/:id/close_bid — award a bid: budget tolerance and timing (part 3)
These checks run after the permission check.
Checks, in order:
1. Company configs `budget_tolerance_limit` and `bid_tolerance_reference_key` are both set, and a line price is above the linked PR item's reference price plus the tolerance % → 889 "Bid price exceeds the budget tolerance limit" (HTTP 422). Skipped when either config is blank, or when a line has no PR link or no reference price — app/controllers/concerns/trade_controller_helper.rb:4700-4701,4776-4809
2. The bid is not one of this event's active or requested bids → 4 "Request not found" (HTTP 422) — trade_controller_helper.rb:4964-4966
3. `closed_at` has passed → 33 "Order not active" (HTTP 422) — trade_controller_helper.rb:4967
4. The user is not the creator, a company super admin, a same-company user or the broker → 4 (HTTP 422) — trade_controller_helper.rb:4968-4972
5. `awarded_quantities` is sent, `is_partial_awarding_enabled` is on and the event is standalone → it is validated (unverified: validator codes not read) — trade_controller_helper.rb:4997-5006

### trade#close_bid — POST /api/v1/trade/:id/close_bid — award a bid: vendor, quantity and vendor-code checks (part 4)
Run at selection time (bid_valid_to_close?), in order:
1. Vendor blacklisted → 755 "Can't select bid of a blacklisted vendor" (HTTP 422) — app/controllers/concerns/bids_controller_helper.rb:2006-2007
2. Vendor unverified and not allowed → 588 "You cannot select bid for an unverified vendor." (HTTP 422) — bids_controller_helper.rb:2008-2010
3. Bid is revised → 832 "Bid cannot be awarded as it is already revised." (HTTP 422) — bids_controller_helper.rb:2011-2017
4. Standalone (dummy-project) events only, not offline/over-quantity: selected quantity + this bid's quantity is more than the line quantity → 126 "You cannot close this bid as final quantity exceeds the original quantity" (HTTP 422) — bids_controller_helper.rb:2018-2028
5. PO integration on, event is an integration template or has PRs, vendor has no vendor code → 502 "Unable to create order, Vendor Code is not present." (HTTP 422). Skipped by `allow_po_without_vendor_code`; applies to every event — app/controllers/concerns/trade_controller_helper.rb:5203-5211,5129-5130

### trade#close_bid — POST /api/v1/trade/:id/close_bid — partial award and counter offer (part 5)
Changing a line's quantity or price, or striking it off (status "negotiated") in `bid_products`, makes a partial close.
State rules: no counter offer for lot closing (lot-closed, multi-line, `all_line_items_selected`), knockout auctions or multiple-PO events. `all_line_items_selected: false` saves `config.award_line_item_wise = true` — app/controllers/concerns/trade_controller_helper.rb:4677-4682,4703-4707
Checks, in order:
1. Struck-off line on a lot-based close → 101 (HTTP 422); quantity or price outside the counter-offer rules → that validator's code — trade_controller_helper.rb:5217-5262
2. Selected quantity + new quantity is more than the line quantity → 126 (HTTP 422); skipped for offline/over-quantity events — trade_controller_helper.rb:5267-5292
Side effects: with `is_participant_approval_required_partial_closing` (not surrogate, not multiple PO), a counter offer "counter_offer_for_partial_closing" goes to the vendor and nothing is awarded yet. Otherwise the bid is revised for the buyer, then awarded — trade_controller_helper.rb:4735-4770

### trade#close_bid — POST /api/v1/trade/:id/close_bid — award approvals and approval-window extension (part 6)
Awarding can stop at approval instead of selecting the bid.
Checks, in order:
1. Approval flow v1 rule matches (close_trade) → bid becomes "requested", approval raised, success returned without awarding — app/controllers/concerns/trade_controller_helper.rb:5010-5017
2. Company on approval flow v2 (not knockout/Dutch) and the bid needs over-quantity approval → 561 "You cannot select bid with more than requested quantity." (HTTP 422) — trade_controller_helper.rb:5032-5036
3. `peer_id` sent, `peer_review_enabled` on, user is not a team peer → 70 "User does not exist" (HTTP 422) — trade_controller_helper.rb:5038-5042
4. v2, `approval_flow_id` sent, no approval started → 523 "Invalid Approval" (HTTP 422) — trade_controller_helper.rb:5058-5060
Side effects: a started v2 approval makes the bid and its lines "requested". The extra-closing schedule (auction_extra_closing_time, or rfq_extra_closing_time for RFQ) is created or extended, and `closed_at` moves to now + approval expiry — trade_controller_helper.rb:5068-5099

### trade#close_bid — POST /api/v1/trade/:id/close_bid — what awarding changes (part 7)
With no approval, the bid is selected in one transaction.
State rules: awarded lines become "selected" and remaining quantity is reduced. A standalone event keeps a line "active" while quantity remains, otherwise "closed" — app/controllers/concerns/bids_controller_helper.rb:1568-1577. The bid becomes "selected" (or the multiple-PO status) — bids_controller_helper.rb:1620-1627. The event becomes "closed" with `closed_at` = now once every valid line is closed (unless over-quantity to multiple vendors), or for BOQ projects with `trade_request_close_on_partial_boq` — bids_controller_helper.rb:1628-1635. A closing knockout auction voids future rounds; a Dutch auction drops the winner from later rounds — bids_controller_helper.rb:1636-1647
Checks: a save fails → 15 "Operation failed" (HTTP 422) — app/controllers/concerns/trade_controller_helper.rb:5133
Side effects: remarks are saved as "bid_selection_remark"; `lowest_bid_not_selected` and `less_bids_approval_remark` are saved on the event — trade_controller_helper.rb:4974-4982,5101

### trade#close_bid — POST /api/v1/trade/:id/close_bid — multiple purchase orders on one bid (part 8)
Event config `allow_multiple_po_on_same_bid` lets a buyer raise several POs on one bid, each with its own `po_details`.
Checks, in order:
1. Another close on the same bid is running (3-second cache lock) → 516 "Transaction in Progress" (HTTP 422) — app/controllers/concerns/bid_multiple_po_helper.rb:36-45,112-119
2. The PO cannot be added (MAX_MULTIPLE_PO_COUNT = 20) → 17 "Maximum number of purchase orders reached" (HTTP 422) — app/controllers/concerns/trade_controller_helper.rb:4857-4862; bid_multiple_po_helper.rb:34 (unverified: the add rules were not read)
3. A line in the PO is not active → 16 "These items are not available for selection" (HTTP 422) — trade_controller_helper.rb:4868-4873
4. No PO identifier at selection → 15 "Operation failed" (HTTP 422) — app/controllers/concerns/bids_controller_helper.rb:1557-1559
State rules: requested bids are accepted too, there are no counter offers, and the bid moves to `bid_status_for_multiple_po` — trade_controller_helper.rb:4689-4691,4705; bids_controller_helper.rb:1620-1624

### trade#approval_workflows_for_bid_close — POST /api/v1/trade/:id/close_bid/approval_workflows — preview award approval flows
Before awarding, the console asks which approval flows would apply. It uses the same award rules as close_bid but changes nothing (the bid is read-only). Console only.
Checks, in order:
1. The event is not active, or `closed_at` has passed → 4 "Request not found" (HTTP 422) — app/controllers/api/v1/trade_controller.rb:924-925
2. The user may not close (creator or company super admin, after start; extra-closing-only config) → 101 (HTTP 422) — trade_controller.rb:926-929
3. The bid is not this event's active bid (active or requested with multiple PO) → 4 (HTTP 422) — trade_controller.rb:931-934
Side effects: none. It returns the matching team approvals, or else the matching company approvals — app/controllers/concerns/trade_controller_helper.rb:5139-5154
Cites: config/routes.rb:970

### trade#add_audience_live_auction — PATCH /api/v1/trade/add_audience — add vendors to a live event: checks
The buyer adds vendors to an active or draft event (`id` in the body). Console only.
Checks, in order:
1. The event is not active or draft → 95 "Trade Request not found" (HTTP 422) — app/controllers/api/v1/trade_controller.rb:30-34
2. Policy add_audience_live_auction? (trade read and can view the event) → 455 (HTTP 422) — trade_controller.rb:35; app/policies/trade_request_policy.rb:125-127
3. The project is not its latest version → 101 (HTTP 422) — trade_controller.rb:36
4. Event config `is_user_allowed_to_modify_audience` is false and the user is not a super admin → 685 "You are not allowed to update the audience" (HTTP 422). Skipped when the config is not set — trade_controller.rb:37; app/models/model_helpers/trade_request_model_helper.rb:936-941
5. `audience_to_add` / `audience_to_add_ids` is empty → 2 "Insufficient parameters" (HTTP 422) — trade_controller.rb:38-40
There is no bid-time check: vendors can be added while bidding is running or after it ends, as long as the event is active.

### trade#add_audience_live_auction — PATCH /api/v1/trade/add_audience — add vendors to a live event: effects
What happens after the checks pass.
State rules: blacklisted vendors are dropped silently. Only vendors whose onboarding status is allowed for the buyer company are added. Hidden audience rows become visible again — app/controllers/concerns/common_controller_helper.rb:7-11,31-36,110-114
Side effects: for an RFQ, non-dummy vendors are also added to the project's technical round (RFP) — common_controller_helper.rb:13-21. Knockout and Dutch auction round participants are updated, an "update_audience" email goes to the newly added vendors, and a vendor_added activity is logged with `update_remarks` — common_controller_helper.rb:42-44. The MCP cache is cleared — app/controllers/api/v1/trade_controller.rb:42
Cites: config/routes.rb:971

### trade#remove_audience_live_auction — PATCH /api/v1/trade/remove_audience — remove vendors from a live event
The buyer removes vendors from an ACTIVE event (draft not accepted, unlike add). Console only.
Checks, in order:
1. Event not active → 95 "Trade Request not found" (HTTP 422) — app/controllers/api/v1/trade_controller.rb:47-51
2. Policy add_audience_live_auction? → 455; not the latest project version → 101; audience changes not allowed → 685 (HTTP 422) — trade_controller.rb:52-54
3. `audience_to_remove` / `audience_to_remove_ids` empty → 2 (HTTP 422) — trade_controller.rb:55-57
4. Technical round (RFI/RFP) and a removed vendor has responded → 512 "You cannot remove a vendor who has already participated." (HTTP 422) — trade_controller.rb:59-62
5. A removed vendor (or broker) has an active, selected or requested bid → 512 (HTTP 422) — trade_controller.rb:64-66
State rules: an "everyone" audience becomes "except_for"; otherwise the rows are hidden — trade_controller.rb:1667-1687
Side effects: per-vendor line validations removed, knockout/Dutch rounds updated, vendor_removed logged; no email — trade_controller.rb:68-71

### trade#add_new_stage_in_live_event — POST /api/v1/trade/:id/add_new_stage_in_live_event — add a stage to a running project: lookups (part 1)
From a technical round (RFP), the buyer adds a new commercial round (RFQ) to a live project; `event_group_id` is a param. Console only.
Checks, in order:
1. The stage `:id` is not in the current workspace → 95 "Trade Request not found" (HTTP 422) — app/controllers/api/v1/trade_controller.rb:1120-1121
2. Policy add_new_stage_in_live_event? (event creator, or trade create permission plus sourcing access) → 455 (HTTP 422) — trade_controller.rb:1122; app/policies/trade_request_policy.rb:13-16,192-194
3. The project is not active or not in the workspace → 533 "Project does not exist." (HTTP 422) — trade_controller.rb:1123-1124
4. Validation and creation run under a row lock on the project, so two adds at the same time run one after the other — trade_controller.rb:1128-1140
5. Company config `is_add_new_stage_allowed` is not true → 1127 "Adding a new stage to a live event is not enabled for this company" (HTTP 422) — app/services/add_new_stage/validate_service.rb:21-27
Cites: config/routes.rb:990

### trade#add_new_stage_in_live_event — POST /api/v1/trade/:id/add_new_stage_in_live_event — add a stage: link, RFP and auction rules (part 2)
Only stages in status active, closed, requested or draft are counted (VALID_ADD_NEW_STAGE_STATUSES — app/models/trade_request.rb:319; app/services/add_new_stage/validate_service.rb:10).
Checks, in order:
1. The stage is not part of that project → 2000 "Trade request and event group are not linked" (HTTP 422) — validate_service.rb:29-35
2. The stage is not RFI/RFP → 2001 "New stage cannot be added unless the referring stage is an RFP" (HTTP 422) — validate_service.rb:37-43
3. Any counted stage is an auction or RFQ-then-auction → 1128 "New stage cannot be added to an auction event" (HTTP 422) — validate_service.rb:45-52
Continued in part 3 (712 and the remaining checks).

### trade#add_new_stage_in_live_event — POST /api/v1/trade/:id/add_new_stage_in_live_event — add a stage: shape rules and 712 (part 3)
Checks continue after part 2, in order:
1. Exactly 2 counted stages, and they are RFP + RFQ → 1129 "New stage cannot be added to an RFP and RFQ event" (HTTP 422) — app/services/add_new_stage/validate_service.rb:54-59
2. No counted stage → 1131 "Referring trade is not in a valid state to add a new stage" (HTTP 422) — validate_service.rb:60-64
3. The last counted stage (highest id) is an RFQ that is not live (bidding window not open and not in response review) → 712 "RFP duration exceeds RFQ end time. Please adjust." (HTTP 422). The message is reused and does not describe this case (defect-shaped wording) — validate_service.rb:65-68; app/models/trade_request.rb:1191-1194
4. An RFQ stage is in status closed → 1130 "New stage cannot be added to a closed commercial stage" (HTTP 422) — validate_service.rb:72-78
In practice, an RFP-only project passes and gets an RFQ added.

### trade#add_new_stage_in_live_event — POST /api/v1/trade/:id/add_new_stage_in_live_event — add a stage: what gets created (part 4)
After validation, AddNewStage::CreateService creates the stage.
State rules: from an RFI/RFP it creates an RFQ with stage_no = referring stage_no + 1, using the company's first default "trade" template and the project's last purchase request, with `is_new_stage_addition: true` — app/services/add_new_stage/create_service.rb:16-17,39-54. The RFQ→RFP branch (create_service.rb:18-19,56-70) cannot be reached here, because part 2 requires an RFP.
Checks:
1. The RFQ creator returns a code → that code is returned (unverified: TradeRequests::Create::Rfq codes not read) — create_service.rb:21-24
2. A CustomException → its own code and message — create_service.rb:27-28
3. Any other exception → code 500 "Internal server error". Code 500's locale status is 422, so the response is HTTP 422 with code 500, not a real HTTP 500 — create_service.rb:29-33; config/locales/en-IN.yml:1766-1768
Response: `event_group_uuid` and the new `trade_uuid` — app/controllers/api/v1/trade_controller.rb:1141-1145

### trade#send_otp_for_unlocking_bids — POST /api/v1/trade/:id/send_otp_for_unlocking_bids — send OTP to unlock sealed bids
On a sealed price round (`lock_bid_by_default`), buyers see no bids until a finance user's OTP is entered. This emails the OTP to finance user `user_id`. Console only.
Checks, in order:
1. Trade read permission → 455; id/user_id missing or user inactive → 2 "Insufficient parameters" (HTTP 422) — app/controllers/api/v1/trade_controller.rb:1249-1254
2. User's designation here is not finance_user → 10 "You are not allowed to use this functionality" (HTTP 422) — trade_controller.rb:1255; app/models/user.rb:595-597
3. Event not active or not in this workspace → 4; validate_event codes — trade_controller.rb:1256-1259
4. Event not sealed → 10 (HTTP 422) — trade_controller.rb:1260
5. Technical round has `restrict_unlock_bid_before_evaluation` and is not evaluated → 790 "Bids can't be unlocked until technical evaluation is done" (HTTP 422) — trade_controller.rb:1261-1264
6. Finance user has no email → 543 "Email not present for verification" (HTTP 422) — app/services/otp_service.rb:30-34
Side effects: a 6-digit OTP for this event is stored hashed and emailed — otp_service.rb:9-17

### trade#verify_otp_for_unlocking_bids — POST /api/v1/trade/:id/verify_otp_for_unlocking_bids — enter OTP and unlock sealed bids
The buyer enters the finance user's OTP and chooses who may see bids (`bid_visibility`). Console only.
Checks, in order:
1. Trade read permission → 455; id/user_id/otp missing → 2; user not found → 4 "Request not found" (send gives 2 here) (HTTP 422) — app/controllers/api/v1/trade_controller.rb:1274-1279
2. Not a finance user → 10; event not active or not in this workspace → 4; validate_event codes; not sealed → 10 (HTTP 422) — trade_controller.rb:1280-1285
3. Wrong OTP → 6 "Invalid OTP" (HTTP 422) — trade_controller.rb:1286-1288
OTP rules: valid 30 minutes from sending and not used up on success, so it can be reused in that window. The environment's verified email OTP also works — app/models/otp.rb:29,111-116,132-139
Side effects: `bid_visibility` "everyone" → all buyers see bids; "self" → only the caller; "none" → locked again; any other value changes nothing but returns success — app/controllers/concerns/trade_controller_helper.rb:5633-5647; trade_controller.rb:1289-1291

### Sealed (locked) bids — how bid locking hides prices on the live page
Background for the OTP actions, event_schema, event_indicators and quote_details.
State rules: bids are locked for a buyer-company user when the event has `lock_bid_by_default`, is not RFI/RFP, and has no active "bid_visibility" containing "everyone" or that user's id — app/models/model_helpers/trade_request_model_helper.rb:273-284. Locked bids, or the closed-envelope/bidding-stats configs while the event is upcoming or running, make event_masking_enabled? true. Auction-team members are never masked — trade_request_model_helper.rb:258-270
Effects: event_indicators returns {} (app/controllers/api/v1/trade_controller.rb:538-540). quote_details returns 32 "Bid not found" (HTTP 422) (trade_controller.rb:734-736). The savings actions return 577 "Savings will be visible after bidding ends" (HTTP 422) (trade_controller.rb:567,580). l1_data_for_event has no masking check (trade_controller.rb:549-558).
Extending the end time through PATCH /api/trade/:id locks bids again — app/controllers/api/trade_controller.rb:679

### trade#get_users_for_bid_visibility — GET /api/v1/trade/:id/get_users_for_bid_visibility — list finance users for unlocking
Lists the workspace's finance users (uuid, name, email); the buyer picks one to receive the unlock OTP. Console only.
Checks, in order:
1. Trade read permission → 455; id missing → 2 (HTTP 422) — app/controllers/api/v1/trade_controller.rb:1297-1298
2. The event is not active or not in this workspace → 4 (HTTP 422); validate_event codes — trade_controller.rb:1300-1303
3. The event is not sealed → 10 "You are not allowed to use this functionality" (HTTP 422) — trade_controller.rb:1304
Side effects: none. Finance users are active users with the finance_user designation — app/controllers/concerns/trade_controller_helper.rb:5625-5631
Cites: config/routes.rb:981

### trade#line_items_for_reevaluation — GET /api/v1/trade/:id/line_items_for_reevaluation — list items eligible for technical re-evaluation
Lists the technical round's evaluation forms (line items, or sections when section-wise scoring is on) with their proposal, order and evaluation status. The buyer picks from these for request_tr_reevaluation. Console only.
Checks, in order:
1. Trade read permission → 455; id missing → 2 (HTTP 422) — app/controllers/api/v1/trade_controller.rb:1312-1313
2. Not an active RFI/RFP in this workspace → 4 "Request not found" (HTTP 422) — trade_controller.rb:1314-1315
3. Not in evaluation time → 101 (HTTP 422). Evaluation time means: an extra closing time exists, now is not after its end, and now is not before the later of the bid end time and the response-review end — trade_controller.rb:1316; app/models/trade_request.rb:954-968
Side effects: none.
Cites: config/routes.rb:982

### trade#request_tr_reevaluation — PATCH /api/v1/trade/:id/request_tr_reevaluation — ask an evaluator to re-score (part 1)
During evaluation time the buyer asks the original evaluator to re-score chosen technical-round forms (`form_ids`, `remarks`). Console only.
Checks, in order:
1. Trade read permission → 455; id missing → 2; not an active RFI/RFP in this workspace → 4; not in evaluation time → 101 (HTTP 422) — app/controllers/api/v1/trade_controller.rb:1348-1352
2. Lot-level evaluation (not section-wise): `form_ids` is replaced by the lot's RFP forms — trade_controller.rb:1354-1361
3. form_ids missing or not all the user's forms → 786 "Select correct line items for reevaluation" (HTTP 422); ids must be integers — trade_controller.rb:1363-1366
4. An item is blocked (line deleted, TR in approval or pending, already requested, proposal/order) → 786 (HTTP 422) — trade_controller.rb:1375-1382; app/controllers/concerns/trade_controller_helper.rb:5649-5693
The UI rule "super admin or event creator only" (app/models/model_helpers/trade_request_model_helper.rb:1507-1521) is not enforced here: any workspace user with trade read passes.

### trade#request_tr_reevaluation — PATCH /api/v1/trade/:id/request_tr_reevaluation — what gets created (part 2)
For each chosen form, a re-evaluation request is created on the form's evaluation scores.
Checks:
1. A request is already open for that item → 787 "Reevaluation already Requested" (HTTP 422) — app/helpers/api/additional_requests_helper.rb:550-555
2. The form has no evaluation scores → `nil.first` raises → untyped 500 (defect-shaped; unverified whether part 1 always stops this case first) — additional_requests_helper.rb:551-552
State rules: one AdditionalRequest per score (resolution "requested", change status "reevaluated", sent to the original evaluator, grouped by item). Each score moves to "reevaluation_requested" — additional_requests_helper.rb:560-582. This runs in one transaction — app/controllers/concerns/trade_controller_helper.rb:5743-5750
Side effects: TrReevaluationNotificationWorker("trigger") runs and the MCP cache is cleared — app/controllers/api/v1/trade_controller.rb:1386-1390
Cites: config/routes.rb:983

### trade#resolve_tr_reevaluation_request — PATCH /api/v1/trade/:id/resolve_tr_reevaluation_request/:form_uuid — evaluator accepts or rejects re-evaluation: checks
The evaluator who was asked accepts or rejects (`request_action`, `form_id`, `remarks`). The path's `:form_uuid` is ignored; the code reads `params[:form_id]`. Console only.
Checks, in order:
1. Trade read permission → 455; id missing → 2; not an active RFI/RFP in this workspace → 4; not in evaluation time → 101 (HTTP 422) — app/controllers/api/v1/trade_controller.rb:1396-1400
2. request_action is not "accept" or "reject" → 2 (HTTP 422) — app/helpers/additional_request_resolution_helper.rb:1146
3. form_id is not one of the user's forms (compared as an integer) → 101 (HTTP 422) — additional_request_resolution_helper.rb:1147-1149
4. No open request for the form → 4 "Request not found" (HTTP 422) — additional_request_resolution_helper.rb:1155-1156
5. The caller is not the user the request was sent to → 101 (HTTP 422) — additional_request_resolution_helper.rb:1160
Cites: config/routes.rb:984

### trade#resolve_tr_reevaluation_request — PATCH /api/v1/trade/:id/resolve_tr_reevaluation_request/:form_uuid — accept or reject: effects
What happens after the checks pass, in one transaction.
State rules: reject → the scores go back to "active" and the request becomes not_accepted with the resolution remarks — app/helpers/additional_request_resolution_helper.rb:1162-1178. Accept → the request becomes accepted and the score becomes "reevaluated". A new evaluation is created from the old score, and proposals that used that score become "reevaluated" — additional_request_resolution_helper.rb:1179-1186,1197-1211. A failure creating the new evaluation returns that code.
Side effects: TrReevaluationNotificationWorker(action) runs — additional_request_resolution_helper.rb:1190. The MCP cache is cleared — app/controllers/api/v1/trade_controller.rb:1408

### trade#event_schema — GET /api/v1/trade/:id/schema — live/closed event page payload (part 1)
The main payload for the event page (layers, sheets, participants, configs). Console and vendor.
Checks, in order:
1. Trade read permission (event_schema? = show?) → 455 (HTTP 422) — app/controllers/api/v1/trade_controller.rb:262; app/policies/trade_request_policy.rb:60-62
2. validate_event: missing, void or cancelled → 4; cannot view → 536; old mobile app → 201 (HTTP 422) — trade_controller.rb:276-277
3. Price round (not RFI/RFP), `caching_enabled?` and the event is not masked → may answer 304 Not Modified, based on the event's updated_at — trade_controller.rb:343-348
4. Template layout: a sheet-building error → that code — trade_controller.rb:437-440
Side effects: a "seen" event is logged to DynamoDB for users who are not Procol staff — trade_controller.rb:279-282. Procol staff see the companies they are CSM for — trade_controller.rb:270-274

### trade#event_schema — GET /api/v1/trade/:id/schema — flags the live page uses (part 2)
Flags in the payload that decide what the buyer can do.
State rules:
- `is_allowed_to_close_bid` (Award button) follows the close_bid rule: creator or company super admin, after start, before `closed_at`, with extra-closing-only respected — app/controllers/api/v1/trade_controller.rb:324-326
- `show_auction_report` is true for the buyer company once the bid end time has passed or the event is closed — trade_controller.rb:302-306
- Lot-closed price rounds get ranks when `should_show_rank?` and the caller is the buyer company; loading factors apply if enabled — trade_controller.rb:352-361
- `show_bidding_stats_only` = masked (sealed or closed envelope); `show_placed_bids_stats_only` follows config — trade_controller.rb:289-290
- After more than 5 dynamic time extensions on a non-sealed event, `show_sealbid_feature_notification` is set — trade_controller.rb:315-318
- Technical round: `is_allowed_to_evaluate` for approvers, planners or purchasers with evaluator/owner access who have not evaluated yet — trade_controller.rb:380-389

### trade#quote_details — GET /api/v1/trade/:id/quote_details/:quote_id — one vendor's quote (price round)
Shows one bid's line and global data, with its revisions, rejections and counter offers. Console and vendor.
Checks, in order:
1. Trade read permission → 455; validate_event codes (4/536/201) — app/controllers/api/v1/trade_controller.rb:644-649
2. `quote_id` is not a non-inactive bid on this event → 32 "Bid not found" (HTTP 422) — trade_controller.rb:731-732
3. The event is masked for the caller (sealed bids still locked, or closed envelope), and this is not a surrogate bid awaiting approval → 32 (HTTP 422) — trade_controller.rb:734-736
4. The caller may not view this bid (for example a vendor opening another vendor's bid) → 32 (HTTP 422) — trade_controller.rb:737
State rules: line ranks are included for inline-rank auctions. Prices are converted to the original currency for a non-buyer caller. `is_allowed_to_close_bid` is worked out for this bid (false for blacklisted or unverified vendors) — trade_controller.rb:743-768
Cites: config/routes.rb:958

### trade#quote_details — GET /api/v1/trade/:id/quote_details/:quote_id — one vendor's response (technical round)
For RFI/RFP stages, `quote_id` is a TemplateResponse id. Console and vendor.
Checks, in order:
1. Trade read permission → 455; validate_event codes — app/controllers/api/v1/trade_controller.rb:644-649
2. Not vendor-onboarding v3, and the response is not a non-inactive response on this event → 4 "Request not found" (HTTP 422) — trade_controller.rb:664-668
3. `proposal_id` is given and the caller fails the Proposal show policy → 455 (HTTP 422). With a proposal, the evaluation is shown as it was when the proposal was made — trade_controller.rb:670-672
State rules: `show_surrogate_bid` shows the buyer-entered (surrogate) response. Vendor names are masked per `mask_participant_name?`. Vendor-onboarding update events include the old data — trade_controller.rb:673-711

### trade#event_indicators — GET /api/v1/trade/:id/event_indicators — live ranks and auction indicators
Returns the auction indicator list and its data (ranks, best price and so on) for the live page. It was split out of quote_details for caching. Console only.
Checks, in order:
1. Trade read permission → 455 (HTTP 422) — app/controllers/api/v1/trade_controller.rb:532
2. validate_event codes (4/536/201) — trade_controller.rb:536-537
3. The event is masked for the caller (sealed bids locked, or closed-envelope/bidding-stats config while running) → returns {} with HTTP 200, not an error — trade_controller.rb:538-540
Company setting: `display_vendor_rank_in_auction_qcs` controls whether vendor ranks are shown — trade_controller.rb:541-542
Side effects: none.
Cites: config/routes.rb:963

### trade#l1_data_for_event — GET /api/v1/trade/:id/l1_data_for_event — lowest (L1) vendor's line values
For each line, returns the negotiable widget values from the top-ranked vendor's bid line. Used to pre-fill counter offers. Console only.
Checks, in order:
1. The event id is not found → 4 "Request not found" (HTTP 422) — app/controllers/api/v1/trade_controller.rb:551-552
2. Policy l1_data_for_event? (trade read only) → 455 (HTTP 422) — trade_controller.rb:553; app/policies/trade_request_policy.rb:188-190
3. validate_event codes — trade_controller.rb:554-555
State rules: returns {} when there are no scores. Lines where the L1 vendor has no active/requested line are skipped — app/controllers/concerns/trade_template_helper.rb:389-410
Gaps: no sealed-bid masking check, unlike event_indicators and savings. If a line has no active/requested bid lines at all, `nil.select` raises → untyped 500 (defect-shaped, unverified) — trade_template_helper.rb:402

### trade#rejected_bids — GET /api/v1/trade/:id/rejected_bids — bids the buyer rejected
Lists bids in status "rejected", grouped by vendor, newest first. Console only.
Checks, in order:
1. Trade read permission → 455 (HTTP 422) — app/controllers/api/v1/trade_controller.rb:598
2. validate_event: missing, void or cancelled → 4; cannot view → 536; old app → 201 (HTTP 422) — trade_controller.rb:601-602
State rules: vendor names are masked per `mask_participant_name?`. Amounts are converted to the original currency when the caller is not from the buyer company — trade_controller.rb:603-605
Side effects: none.
Cites: config/routes.rb:964

### trade#bidder_remarks — GET /api/v1/trade/:id/bidder_remarks — remarks vendors left on bids
Lists every non-draft, non-inactive bid that has `other_details.remarks`, with its vendor and user. Console only.
Checks, in order:
1. Trade read permission → 455 (HTTP 422) — app/controllers/api/v1/trade_controller.rb:623
2. validate_event codes (4/536/201) — trade_controller.rb:626-627
State rules: vendor names are masked per `mask_participant_name?`. There is no sealed-bid masking check — trade_controller.rb:629-630
Side effects: none.
Cites: config/routes.rb:965

### trade#trade_config — GET /api/v1/trade/new_request_config — event-creation defaults and company configs
Returns the company defaults the create and edit screens use: event type, closing mode, RFP evaluation mode (lot_based for BOQ projects), dynamic time extension, auto-award defaults, multi-currency rates and recent terms and conditions. Console only.
Checks, in order:
1. Policy trade_config? (trade create_record permission) → 455 (HTTP 422) — app/controllers/api/v1/trade_controller.rb:130; app/policies/trade_request_policy.rb:172-174
State rules: `is_publish_auction_in_draft` is true when the company has an auction team and the user is not in it — app/controllers/concerns/trade_controller_helper.rb:5431-5436. `is_allowed_to_modify_audience` = config `is_user_allowed_to_modify_audience`, or super admin — trade_controller_helper.rb:5588. `additional_fields=terms_and_conditions` adds the last 10 T&Cs, plus project T&Cs when `rfx_project_enabled` — trade_controller.rb:141-150
Side effects: updates the session login time — trade_controller.rb:136
Cites: config/routes.rb:956

### trade#upload_bid_excel — POST /api/v1/trade/:id/upload_bid_excel — parse a bid sheet into bid data
Parses an uploaded bid Excel ("My Quote" sheet, or "Global Fields" for BOQ) into inline and global bid values for the bidding screen. It does NOT place a bid. Console and vendor.
Checks, in order:
1. id missing → 2; the event is not active → 4 (HTTP 422) — app/controllers/api/v1/trade_controller.rb:1067-1069
2. Policy upload_bid_excel? (trade read and can view the event) → 455 (HTTP 422) — trade_controller.rb:1070; app/policies/trade_request_policy.rb:184-186
3. The Excel cannot be parsed → the converter's code — app/controllers/concerns/trade_controller_helper.rb:6754-6768
4. Cost-breakdown (CBD) time is running → `component.slice!` uses an undefined variable → untyped 500 (defect-shaped) — trade_controller_helper.rb:6658-6659
Side effects: the file is stored privately in S3 and a Report row is saved BEFORE parsing, so failed uploads also leave a Report — trade_controller.rb:1071-1074
Cites: config/routes.rb:968

### trade#update_widgets — PATCH /api/v1/trade/:id/widgets — edit an event's price-sheet columns (Procol staff only)
Adds, updates, deletes or field-edits widgets (inline or global price components) on an event. Procol employees only.
Checks, in order:
1. Event not active → 4 (HTTP 422) — app/controllers/api/v1/trade_controller.rb:1637-1638
2. Event has no widgets → 891 "Widgets are not configured for this trade request" (HTTP 422), checked before permission — trade_controller.rb:1640
3. Not a Procol employee → 455 (HTTP 422) — trade_controller.rb:1642; app/policies/trade_request_policy.rb:208-210
4. `operations` missing → 892 "Operations parameter is required" (HTTP 400); not array/object → 893 "Operations must be an array" (HTTP 422) — trade_controller.rb:1644-1649
5. Bad operation (add, update, delete, update_field), bad widget_type, or missing fields; key_attribute and widget_type cannot be changed → 894 with the first error as the message (HTTP 422) — trade_controller.rb:1452-1455; app/services/widget_update_service.rb:7-10,37-103
Side effects: saved with update_columns (no callbacks or versions) — trade_controller.rb:1457

### trade#update_currency_exchange_rates — PATCH /api/v1/trade/:id/currency_exchange_rates — change exchange rates before bids
The buyer changes rate_in_base for a multi-currency event's allowed currencies. Console only.
Checks, in order:
1. Event not active → 4 (HTTP 422) — app/controllers/api/v1/trade_controller.rb:1467-1468
2. Policy update? (buyer company, trade create, sourcing access) → 455 (HTTP 422) — trade_controller.rb:1470; app/policies/trade_request_policy.rb:74-90
3. No currency configuration → 879 "Multi-currency is not configured for this trade request." (HTTP 422) — trade_controller.rb:1472
4. Any active or requested bid → 877 "Exchange rates cannot be updated after bids have been placed." (HTTP 422) — trade_controller.rb:1473
5. `currency_rates` missing/not an array, a currency not allowed, or the base currency → 2 (HTTP 422) — trade_controller.rb:1475-1486
6. Rate not greater than 0 → 878 "Invalid exchange rate: rate_in_base must be a positive number." (HTTP 422) — trade_controller.rb:1487
Side effects: misc.currency_configuration is updated; the save result is not checked — trade_controller.rb:1490-1495

### trade#update_planner — PATCH /api/v1/trade/update_planner — reassign the technical evaluator (lot-based)
With `trade_request_uuid(s)`, the evaluator/owner of a lot-based RFP (or the chosen `section_uuids`) is moved to `new_user_uuid`. Console only. All refusals use custom messages.
Checks, in order:
1. Stage not found, or cancelled/withdrawn → 4 "Trade request not found" (HTTP 422) — app/controllers/api/v1/trade_controller.rb:1518-1521
2. Not lot-based RFP evaluation → 2 "Trade request must be a lot-based RFP" (HTTP 422) — trade_controller.rb:1522
3. New user inactive → 4 "User not found"; not in the planning team → 101 "User is not part of the planning team" (HTTP 422) — trade_controller.rb:1524-1527
4. Policy update_planner? (read, own workspace, workspace allows this user) → 455 (HTTP 422) — trade_controller.rb:1529; app/policies/trade_request_policy.rb:216-218
5. New user not mapped to the workspace → 101 (HTTP 422) — trade_controller.rb:1530-1531
6. A section is in peer review or approval → 2 "Evaluator cannot be changed while section is in approval" (HTTP 422) — trade_controller.rb:1538,1554-1558

### trade#update_planner — PATCH /api/v1/trade/update_planner — reassign the evaluator (line-item based)
Without trade uuids, the evaluator/owner of up to 10 project line items (`event_group_line_item_uuids` or `_ids`) is moved to the new user, one project at a time. Console only.
Checks, in order:
1. No line items → 2 "event_group_line_item_ids is required"; more than 10 → 2 "At most 10 line items are allowed at once" (HTTP 422) — app/controllers/api/v1/trade_controller.rb:1566-1567
2. None found → 4 "Line items not found"; new user inactive → 4 "User not found"; not in the planning team → 101 (HTTP 422) — trade_controller.rb:1569-1575
3. For each project's RFI/RFP stage: policy update_planner? → 455; new user not mapped to the workspace → 101 (HTTP 422). Projects with no such stage are skipped silently — trade_controller.rb:1579-1586
Side effects: the access lists on the line-item mappings are reassigned — trade_controller.rb:1588-1597

### trade#accept_auction_tnc — PATCH /api/v1/trade/:id/accept_auction_tnc — vendor accepts event terms
A vendor accepts the event's terms-and-conditions popup. Vendor website (and console).
Checks, in order:
1. The event is not active → 4 (HTTP 422) — app/controllers/api/v1/trade_controller.rb:900-901
2. Policy accept_auction_tnc? (Procol staff, super admin, buyer company, or a participant company) → 455 (HTTP 422) — trade_controller.rb:902; app/policies/trade_request_policy.rb:68-72
3. No vendor company can be found (no response on the project's technical rounds, and no audience company mapped to the user) → 101 (HTTP 422) — trade_controller.rb:903-913
Side effects: accept_tnc_popup! records the acceptance for that company — trade_controller.rb:915
Cites: config/routes.rb:991

### Where extend deadline, end early and live-auction mechanics live (not in V1 trade)
These features are not part of the V1 trade controller.
- Extending the bid end time, extra closing (evaluation) time or response-review time, `extend_rfq_time` from an RFP, and `force_end` (end early) are in PATCH /api/trade/:id (api trade#update), through update_trade_schedule — app/controllers/api/trade_controller.rb:399,659-671. Extending also locks sealed bids again — api/trade_controller.rb:679. RFP-driven RFQ extension can refuse with 818/819/820 — app/controllers/concerns/trade_controller_helper.rb:5754-5773.
- Live-auction bidding and move_to_auction (POST /api/trade/move_to_auction, config/routes.rb:121) are covered in another digest.
- An award approval pushes `closed_at` out automatically (close_bid part 6).

### trade — other actions (one line each, part 1)
- history — GET /api/v1/trade/history: past events list, from the read replica; trade read permission — app/controllers/api/v1/trade_controller.rb:77-127. Console and vendor.
- home_page_request — GET /api/v1/trade/home: live events home list — trade_controller.rb:183-219. Console and vendor.
- get_participated_auctions — GET /api/v1/trade/get_participated_auctions: the vendor's events; skips events where `not_allow_rebidding_to_sellers` includes the vendor — trade_controller.rb:221-258. Vendor.
- aggregate_savings / best_line_wise_savings — GET /api/v1/trade/:id/...: buyer company only; 577 while masked — trade_controller.rb:560-595; app/policies/trade_request_policy.rb:104-110.
- alternate_bidding_leader_board: 101 unless alternate bidding is on — trade_controller.rb:865-887.
- quote_summary — GET /api/v1/trade/:id/quote_summary/:quote_id: tab summary; 101 if the event has no tabs — trade_controller.rb:806-823.

### trade — other actions (one line each, part 2)
- reevaluation_remarks — GET /api/v1/trade/reevaluation_remarks/:id: re-evaluation request and reject history for a project line item — app/controllers/api/v1/trade_controller.rb:825-863.
- get_approvals — GET /api/v1/trade/:id/get_approvals: approval requests on the event; buyer company only — trade_controller.rb:941-961; app/policies/trade_request_policy.rb:117-119.
- download_event_details: Excel of an active or draft event — trade_controller.rb:1039-1063.
- trade_history — GET /api/v1/trade/:id/trade_history: Excel of bid history; Procol staff only — trade_controller.rb:1412-1436; trade_request_policy.rb:204-206.
- create_custom_buyer_form, buyer_form_schema, buyer_form_details, validate_custom_buyer_form_data: vendor-onboarding events only (else 101); 477 "Template not found" when there is no buyer-form template — trade_controller.rb:1080-1244.

## Error codes in this area

### Error codes 2–10
- 2 (HTTP 422) "Insufficient parameters" — add/remove audience empty list (trade_controller.rb:40,57), OTP actions (1250-1254,1276-1277), re-evaluation (1349,1397; additional_request_resolution_helper.rb:1146), currency rates (1477,1485-1486), update_planner custom messages (1522,1538,1566-1567)
- 4 (HTTP 422) "Request not found" — validate_event (trade_controller_helper.rb:2215-2218), close_bid (trade_controller_helper.rb:4674,4695,4966,4971), approval_workflows_for_bid_close (trade_controller.rb:925,934), OTP (1257,1279,1282), re-evaluation (1315,1351,1399), widgets (1638), currency (1468)
- 6 (HTTP 422) "Invalid OTP" — verify_otp_for_unlocking_bids (trade_controller.rb:1288)
- 9 (HTTP 422) "Unable to close the order at this time. Please wait for the bidding to end" — close_bid before the bid end time with extra-closing-only config (trade_controller_helper.rb:4951-4952)
- 10 (HTTP 422) "You are not allowed to use this functionality" — OTP and bid visibility when the user is not a finance user or the event is not sealed (trade_controller.rb:1255,1260,1280,1285,1304)

### Error codes 15–70
- 15 (HTTP 422) "Operation failed" — close_bid save failure (trade_controller_helper.rb:5133); multiple PO without an identifier (bids_controller_helper.rb:1557-1559)
- 16 (HTTP 422) "These items are not available for selection" — multiple-PO lines not active (trade_controller_helper.rb:4868-4873)
- 17 (HTTP 422) "Maximum number of purchase orders reached" — multiple PO (trade_controller_helper.rb:4857-4862)
- 32 (HTTP 422) "Bid not found" — quote_details price round: missing bid, masked event, or bid not viewable (trade_controller.rb:732,734-738)
- 33 (HTTP 422) "Order not active" — close_bid after `closed_at` (trade_controller_helper.rb:4967)
- 70 (HTTP 422) "User does not exist" — close_bid peer_id is not a team peer (trade_controller_helper.rb:5038-5042)

### Error codes 95–455
- 95 (HTTP 422) "Trade Request not found" — add/remove audience (trade_controller.rb:33,50), add_new_stage_in_live_event (1121)
- 101 (HTTP 422) "You are not allowed to perform this action" — close_bid not allowed (trade_controller_helper.rb:4698), approval_workflows_for_bid_close (trade_controller.rb:929), project not the latest version (36,53), re-evaluation outside evaluation time (1316,1352,1400), resolve by the wrong user or form (additional_request_resolution_helper.rb:1149,1160), update_planner (1527,1531), accept_auction_tnc (913)
- 126 (HTTP 422) "You cannot close this bid as final quantity exceeds the original quantity" — close_bid (bids_controller_helper.rb:2018-2028; trade_controller_helper.rb:5267-5292)
- 201 (HTTP 422) "Update your app to view this" — validate_event on old mobile apps (trade_controller_helper.rb:2223-2268)
- 455 (HTTP 422) "You are not authorized to perform this action" — any failed policy (api_auth.rb:16,117-118)

### Error codes 500–536
- 500 (HTTP 422) — the locale message is "Product Category not found", but add_new_stage_in_live_event sends code 500 with "Internal server error" for any unexpected exception, still with HTTP 422 (add_new_stage/create_service.rb:29-33)
- 502 (HTTP 422) "Unable to create order, Vendor Code is not present." — close_bid with PO integration (trade_controller_helper.rb:5203-5211)
- 512 (HTTP 422) "You cannot remove a vendor who has already participated." — remove_audience_live_auction (trade_controller.rb:61,66)
- 516 (HTTP 422) "Transaction in Progress" — close_bid multiple-PO lock (bid_multiple_po_helper.rb:112-119)
- 523 (HTTP 422) "Invalid Approval" — close_bid with approval_flow_id and no approval started (trade_controller_helper.rb:5058-5060)
- 533 (HTTP 422) "Project does not exist." — add_new_stage_in_live_event (trade_controller.rb:1124)
- 536 (HTTP 422) "You are not allowed to view this event." — validate_event (trade_controller_helper.rb:2219-2222)

### Error codes 543–712
- 543 (HTTP 422) "Email not present for verification" — unlock-bid OTP when the finance user has no email (otp_service.rb:30-34)
- 561 (HTTP 422) "You cannot select bid with more than requested quantity." — close_bid with approval flow v2 (trade_controller_helper.rb:5033-5036)
- 577 (HTTP 422) "Savings will be visible after bidding ends" — savings actions while masked (trade_controller.rb:567,580)
- 588 (HTTP 422) "You cannot select bid for an unverified vendor." — close_bid (bids_controller_helper.rb:2008-2010)
- 685 (HTTP 422) "You are not allowed to update the audience" — add/remove audience (trade_controller.rb:37,54)
- 712 (HTTP 422) "RFP duration exceeds RFQ end time. Please adjust." — add_new_stage_in_live_event when the latest stage is an RFQ that is not live (add_new_stage/validate_service.rb:65-68); the message does not match this case

### Error codes 755–790
- 755 (HTTP 422) "Can't select bid of a blacklisted vendor" — close_bid (bids_controller_helper.rb:2007)
- 786 (HTTP 422) "Select correct line items for reevaluation" — request_tr_reevaluation (trade_controller.rb:1365,1381)
- 787 (HTTP 422) "Reevaluation already Requested" — request_tr_reevaluation (additional_requests_helper.rb:555)
- 790 (HTTP 422) "Bids can't be unlocked until technical evaluation is done" — send_otp_for_unlocking_bids (trade_controller.rb:1261-1264)
- 832 (HTTP 422) "Bid cannot be awarded as it is already revised." — close_bid (bids_controller_helper.rb:2011-2017)

### Error codes 877–894
- 877 (HTTP 422) "Exchange rates cannot be updated after bids have been placed." — update_currency_exchange_rates (trade_controller.rb:1473)
- 878 (HTTP 422) "Invalid exchange rate: rate_in_base must be a positive number." — update_currency_exchange_rates (trade_controller.rb:1487)
- 879 (HTTP 422) "Multi-currency is not configured for this trade request." — update_currency_exchange_rates (trade_controller.rb:1472)
- 889 (HTTP 422) "Bid price exceeds the budget tolerance limit" — close_bid (trade_controller_helper.rb:4700-4701,4776-4808)
- 891 (HTTP 422) "Widgets are not configured for this trade request" — update_widgets (trade_controller.rb:1640)
- 892 (HTTP 400) "Operations parameter is required" — update_widgets (trade_controller.rb:1645)
- 893 (HTTP 422) "Operations must be an array" — update_widgets (trade_controller.rb:1647-1649)
- 894 (HTTP 422) "Widget update failed", with the message replaced by the first service error — update_widgets (trade_controller.rb:1452-1455)

### Error codes 1127–2001 and the app gate
- 1127 (HTTP 422) "Adding a new stage to a live event is not enabled for this company" — add_new_stage (validate_service.rb:21-27)
- 1128 (HTTP 422) "New stage cannot be added to an auction event" — add_new_stage (validate_service.rb:45-52)
- 1129 (HTTP 422) "New stage cannot be added to an RFP and RFQ event" — add_new_stage (validate_service.rb:54-59)
- 1130 (HTTP 422) "New stage cannot be added to a closed commercial stage" — add_new_stage (validate_service.rb:72-78)
- 1131 (HTTP 422) "Referring trade is not in a valid state to add a new stage" — add_new_stage (validate_service.rb:60-64)
- 2000 (HTTP 422) "Trade request and event group are not linked" — add_new_stage (validate_service.rb:29-35)
- 2001 (HTTP 422) "New stage cannot be added unless the referring stage is an RFP" — add_new_stage (validate_service.rb:37-43)
- app_error_auth_failed (HTTP 401) "This app is not authorized to use this API" — any v1 action called from the wrong app (api_auth.rb:86-88)
