# Trade stages (RFP / RFQ / auction stage add + edit) — backend digest (procol-backend origin/main ae36e86894)

## Overview
A "trade request" is one stage of a sourcing event (project / event group): technical round (RFP, rfx_mode rfp), price round (RFQ, rfx_mode rfq), auction (auction / rfq_then_auction), RFI, offline trade. Stages are added with POST /trade/template_input and edited with PATCH /trade/:id/template_input or PATCH /trade/:id (trade#update), all in app/controllers/api/trade_controller.rb ("trade_controller.rb"), which calls app/controllers/concerns/trade_controller_helper.rb ("trade_controller_helper.rb") and app/controllers/concerns/trade_template_helper.rb ("trade_template_helper.rb"); time windows are app/models/trade_schedule.rb rows, statuses are in app/models/trade_request.rb. Only the buyer web console may call these actions (config/app_auth_config.yml client_admin_dashboard / procol_admin_dashboard); the vendor website may call only show, upload_file and add_variants — anything else answers 401 app_error_auth_failed "This app is not authorized to use this API" and signs the session out (json_helpers.rb:31-35, api_auth.rb:78-106). A Pundit refusal renders 455 "You are not authorized to perform this action" (HTTP 422) (api_auth.rb:117-118). Rails is 7.0.8.4, so a refusal rendered inside a transaction block rolls it back.

### trade#template_input — POST /trade/template_input — add a stage: licence, permission and unit checks (part 1)
Console-only: creates one new stage (RFQ, RFP, auction…) from the sheet-template payload (`data` rows + `configurations`), then runs trade#create in-process (trade#create has no route of its own; its check_operating_time before_action does NOT run).
Checks, in order:
1. Company has licensing and the user's sourcing licence is not "creator" → refused with 763 "Only users with creator role can create/update event. Please contact CSM to upgrade License." (HTTP 422) — trade_controller.rb:26, 2132-2138
2. No trade create_record permission or no sourcing-events access → 455 (HTTP 422) — trade_controller.rb:29, trade_request_policy.rb:13-16
3. A row has no unit (no creator_quantity suffix, no product.unit_type) → 574 "Unit cannot be blank" (HTTP 422) — trade_template_helper.rb:1393-1395
4. A unit symbol (lower-cased) is not one of the workspace's units → 495 with custom message "The unit kg is not present" / "The units a, b are not present" (HTTP 422) — trade_template_helper.rb:1396-1416

### trade#template_input — POST /trade/template_input — add a stage: payload parsing rules (part 2)
How each `data` row of the add-stage request becomes a line item.
Checks, in order:
1. No `configurations` and no active stage id → 33 "Order not active" (HTTP 422) — trade_template_helper.rb:1425-1432
2. Company setting is_saving_configuration_mandatory on, rfx_mode rfq/auction, not alternate bidding, no savings_configuration → 719 "Saving Configurations is mandatory for Event" (HTTP 422) — trade_template_helper.rb:1436-1437
3. Staggered (line-item closing) auction: each row's start/end must be inside bid start/end with start < end → 507 "Invalid Time Input" (HTTP 422) — trade_template_helper.rb:1520-1522, 1684-1705
Rules: quantity 0 or missing makes the row "rate only" (display unit "unit"), so error 35 is not hit from this path — trade_template_helper.rb:1449, 1475. A row missing the product, variant or creator_quantity object → NoMethodError, untyped 500 (defect-shaped) — trade_template_helper.rb:1465-1469. configurations keys are merged into top-level params — trade_template_helper.rb:1622-1624.

### trade#template_input — POST /trade/template_input — add a stage: workspace, location and product checks (part 3)
First business checks of trade#create when a buyer adds a stage.
Checks, in order:
1. Workspace trade_mode is "sell" → 101 "You are not allowed to perform this action" (HTTP 422) — trade_controller.rb:124-126
2. A delivery location (buyer hub) outside the user's companies → 483 "You are not authorized to add delivery location" (HTTP 422) — trade_controller.rb:128-131, trade_controller_helper.rb:5348-5351
3. A product category outside the user's team categories (free_text / activity products exempt) → 482 "You are not authorized to add product" (HTTP 422) — trade_controller_helper.rb:5353-5356
4. A product id that exists but is not active → 80 "Product not found" (HTTP 422); unknown ids pass here and fail later with 80 — trade_controller.rb:132-135, trade_controller_helper.rb:5389-5391, 1714-1717
Cites: trade_controller.rb:122-137

### trade#template_input — POST /trade/template_input — add a stage: attachments, basket and company checks (part 4)
Further trade#create checks when a buyer adds a stage.
Checks, in order:
1. A line item with more than 15 creator attachments → 489 "Maximum attachment limit exceeded." (HTTP 422) — trade_controller.rb:136, trade_product.rb:55
2. auction_config book_building / knockout / dutch together with is_basket_auction → 474 "Sorry, trade with this configuration is not allowed" (HTTP 422) — trade_controller.rb:141-143
3. company_id not in the user's allowed companies → 5 "Not authorized" (HTTP 422) — trade_controller.rb:150-153
4. Configuration errors (see parts 5-7) — trade_controller.rb:165-166
5. Not RFI/RFP and no line items → 80 "Product not found" (HTTP 422) — trade_controller.rb:167-169
6. RFI/RFP template/form errors → their code — trade_controller.rb:170-171, trade_template_helper.rb:1710-1720
7. Audience over 500 new vendors → 511 "Participants limit exceeded. Maximum 500 participants are allowed." (HTTP 422) — trade_controller.rb:180-183, trade_controller_helper.rb:728-729

### trade#template_input — POST /trade/template_input — add a stage to a project: lookup and lock (part 5)
When `event_group_id` is sent (adding a stage to an existing project), set_configurations_for_trade calls check_if_allowed_to_add_trade_to_event_group.
Checks, in order:
1. Project not found in the stage's company → 888 "Invalid Parameters" (HTTP 422) — trade_controller_helper.rb:3648-3649
2. A line item / form references a project line item of another project (or not active/draft) → 890 "Event group line item does not belong to the specified event group" (HTTP 422) — trade_controller_helper.rb:3651-3652, 3679-3689
3. Project lock key present in cache (another write in flight) → 516 "Transaction in Progress" (HTTP 422) — trade_controller_helper.rb:3653-3654
State rules: an active scheduled-template project is moved to draft and its scheduled job paused; stage gets event_group_id and stage_no — trade_controller_helper.rb:3299-3303, 5962-5980.
Cites: trade_controller_helper.rb:3295-3304

### trade#template_input — POST /trade/template_input — add a stage to a project: duplicate stage type rules (part 6)
Can a project have two RFQs / two RFPs? (check_if_allowed_to_add_trade_to_event_group)
Checks, in order:
1. DRAFT project, more than one stage of the same rfx_mode → 854 "Same type of stage already exists for this rfx. Please delete the existing stage to create a new one" (HTTP 422) — trade_controller_helper.rb:3664, 3694
2. DRAFT project, exactly one other such stage → no error: it is silently voided, its line items/forms deleted — trade_controller_helper.rb:3692-3708
3. Live project, same rfx_mode stage active/closed/scheduled/draft and no config is_new_stage_addition → 830 "Same type of event already exists for this Project." (HTTP 422) — trade_controller_helper.rb:3665-3667, 3671-3677
Skips: lot stages compare only their lot; auction-team-routed stages ignored — trade_controller_helper.rb:3658-3662, 3673-3675.
Unverified: params "id" (string) vs integer id at :3695 — an edited draft stage sent with event_group_id may void itself.

### trade#template_input — POST /trade/template_input — add a stage: configuration checks (part 7)
set_configurations_for_trade rebuilds the whole stage config from template/company config + params (it replaces, not merges) — trade_controller_helper.rb:3327-3329.
Checks, in order:
1. Dynamic closing with last_n_minutes blank, < 1, or over half the time left → 501 "Invalid Trigger Time for Dynamic Time Extension." (HTTP 422) — trade_controller_helper.rb:3316-3320, 6259-6266
2. fast_bidding_mode_enabled with line-item closing outside RFQ→auction, or rfx_mode not allowed → 101 — trade_controller_helper.rb:3354-3359
3. Traffic-light auction without valid ranges → 269 "You have not provided valid traffic light ranges." — trade_controller_helper.rb:3440-3444
4. Knockout/dutch price/round checks → 106, 248, 237, 238, 241-243 (messages: Error codes 4/11) — trade_controller_helper.rb:3453-3497
5. rfx_mode rfq/auction/rfq_then_auction without order_type (web) → 53 "Order Type not mentioned" (HTTP 422) — trade_controller_helper.rb:3530-3531
Config gate: is_order_allowed_to_close_in_extra_closing_time_only → evaluation end defaults to bid end + 30 min — trade_controller_helper.rb:3524-3526.

### trade#template_input — POST /trade/template_input — add a stage: bid start/end time windows (part 8)
set_trade_schedules builds the new stage's TradeSchedule windows.
Checks, in order:
1. RFP end later than the project's RFQ end, or RFQ end earlier than the RFP end → 712 "RFP duration exceeds RFQ end time. Please adjust." (HTTP 422) — trade_controller_helper.rb:501-502 (see the 712 section)
State rules: window type is bidding_time for RFI/RFP, rfq while rfqing, offline_trade, else auction — trade_controller_helper.rb:1976-1987. bid_start_time missing → start = now; offline_trade end = now — trade_controller_helper.rb:505-512, 2004-2007. closed_at = latest end — trade_controller_helper.rb:1997-2001.
No check found that bid end is after bid start or in the future (TradeSchedule has no validations) — trade_schedule.rb:20-70 (unverified: the client may enforce it).
Cites: trade_controller.rb:186-187

### trade#template_input — POST /trade/template_input — add a stage: evaluation and review windows (part 9)
How the evaluation time (extra_closing_time) and best-offer / cost-breakdown review time are stored for a new stage.
State rules:
- response_review_time_for_participant + end_time_type sent → a review window from bid end (or response_review_start_time_for_participant) — trade_controller_helper.rb:514-518
- extra_closing_time sent → evaluation window from bid end (or from review end) — trade_controller_helper.rb:521-531
- RFP with config send_rfp_to_evaluation_manually (user in purchase / customer_success mode) → no evaluation window; only config evaluation_duration = extra_closing_time − bid_end_time is stored, evaluation starts later via trigger_evaluation — trade_controller_helper.rb:523-524, trade_request.rb:1388-1391, trade_request_model_helper.rb:1169-1174
- extra closing window type: extra_closing_time (RFI/RFP), rfq_extra_closing_time (rfqing), else auction_extra_closing_time — trade_controller_helper.rb:1977-1980
Side effects: evaluation-start notification to planners for RFP — trade_schedule.rb:85-90.

### trade_controller_helper#validate_rfp_rfq_bid_end_time — the RFP-end-must-not-exceed-RFQ-end rule (712)
Shared check run when a stage is added, rescheduled, its configuration edited, or its submission time extended.
Checks, in order:
1. Stage is an RFP (technical round) and the new bid_end_time is after the latest not-cancelled/withdrawn RFQ's bidding end → 712 "RFP duration exceeds RFQ end time. Please adjust." (HTTP 422) — trade_controller_helper.rb:651-653, 668-669
2. Stage is an RFQ (price round) and the new bid end is before the RFP's bidding end → 712 (HTTP 422) — trade_controller_helper.rb:654-656, 670-671
Skips: stage itself is draft; params from_mcp present; no project; no opposite stage; opposite is a draft RFP added as a new stage (is_new_stage_addition) while this stage is active/closed/requested/scheduled — trade_controller_helper.rb:646-663. Auction stages are never compared.
Cites: trade_controller_helper.rb:643-675

### trade_controller_helper#validate_rfp_rfq_bid_end_time — callers and crash cases of the 712 rule
Where the RFP/RFQ end-time rule runs and when it crashes instead of answering 712.
Callers: set_trade_schedules (add stage) — trade_controller_helper.rb:501; edit_trade_schedules (reschedule, configuration edit, draft save) — :538; update_trade_schedule when a new bid end is given (extend submission time, staggered changes, extend RFQ with RFP) — :2025. Same rule in event_groups/update_service.rb:303-311 and add_new_stage/validate_service.rb:66.
Defect-shaped: the opposite stage has no bidding window (bidding end nil), or bid_end_time missing from params (configuration edit) → untyped 500 (nil comparison / Time.at(nil)) — trade_controller_helper.rb:665-670.
Note: on draft publish via trade#update the stage is still draft when schedules are written, so the 712 rule does not run there — trade_controller_helper.rb:646, 5443-5447.

### trade#template_input — POST /trade/template_input — add a stage: line item and PR checks (part 10)
create_trade_product validates each line item of the new stage.
Checks, in order:
1. Delivery location not found / inactive → 125 "Delivery location not found" (HTTP 422) — trade_controller_helper.rb:855
2. Product missing or inactive → 80 "Product not found" (HTTP 422) — trade_controller_helper.rb:1714-1717
3. PR-linked line: PR item not valid / not open → 557 "Purchase request items are not valid"; quantity above open qty × (1 + company over_quantity_tolerance_percentage) → 558 "Quantity should be less than open quantity"; unit differs from the PR uom (case-insensitive) → 559 "Quantity should be in same unit as requested" (all HTTP 422) — trade_controller_helper.rb:1735-1763
Skips (check 3): BOQ-based projects, RFQ→auction, PR item in a draft project, rate-only PR item, new-stage addition — trade_controller_helper.rb:1735-1747, 1756.
Defect-shaped: a line item carrying delivery_schedules hits undefined `common_delivery_schedules` → NameError, untyped 500 — trade_controller_helper.rb:1182.

### trade#template_input — POST /trade/template_input — add a stage: quantity and price cap checks (part 11)
Line-item quantity, price cap (ceil price), floor price and floor quantity rules for a new stage.
Checks, in order:
1. Quantity 0 and not rate-only, unless config allow_quantity_less_auction → 35 "Quantity must be greater than zero" (HTTP 422) — trade_controller_helper.rb:1826-1832, 3184-3186
2. Traffic-light bounds invalid → 269 — trade_controller_helper.rb:1926-1928
3. Price cap / floor qty / floor price given but template config can_add_ceil_price / can_add_floor_quantity / can_add_floor_price not true → 10 "You are not allowed to use this functionality" (HTTP 422) — trade_validation.rb:43-62
4. Negative price cap → 202; negative floor price → 203; negative floor quantity → 204; floor quantity above quantity → 205 (HTTP 422) — trade_validation.rb:64-87
5. Savings reference column not a price/amount column → 575 "Savings Column not found" (HTTP 422) — trade_controller_helper.rb:1086-1090
Cites: trade_controller_helper.rb:1938-1949

### trade#template_input — POST /trade/template_input — add a stage: title, save and approval (part 12)
Final steps of creating the stage.
Checks, in order:
1. Sheet-template stage with blank title (not basket) → 55 "Title is missing"; legacy layout with several items and no title/description → 54 "Title or Description missing" (HTTP 422) — trade_controller_helper.rb:1408-1436
2. Model save fails → error with NO code, HTTP 422, first model message, e.g. "An auction has already been made for this event." (second RFQ→auction for one parent) — trade_controller.rb:222, 261, trade_request.rb:3100-3105
3. Knockout/dutch created as active → publish_auction errors — trade_controller.rb:274-277
4. Weightages invalid → weightage error code — trade_controller.rb:318-322
5. Dormant PR → 1125 "One or more PRs are dormant and locked from sourcing events"; bulk line-item insert invalid → 15 "Operation failed" with DB message (HTTP 422) — trade_controller.rb:347-352
State rules: status = params status or "active"; not draft and approval required → "requested" — trade_controller.rb:138, 245-257.

### trade#template_input — POST /trade/template_input — add a stage: side effects and response (part 13)
What happens after a new stage is saved.
Side effects: line items bulk-inserted with project line-item and PR mappings — trade_controller.rb:217-225, trade_controller_helper.rb:911-950. RFI/RFP evaluators added — trade_controller.rb:263-265. Staggered auction item time map stored — :268-271. Basket auction: one extra stage per further product — :278-315. Approval raised (v1) or approval process started (v2, closed_at pushed by approval expiry) — :325-340. Auction drafts routed to the auction team when the company enables it — :343-345. draft_id deactivated — :356-361. after_create_commit: creation notifications/mails, event-group details, auto-award worker, latest stage time — trade_request.rb:281-284 (skipped for scheduled templates — :306-310).
Response: TradeTemplateSerializer with sheets, {uuid} when minimal_response=true, or TradeSerializer for legacy layout — trade_controller.rb:378-395.

### trade#template_input_trade_update — PATCH /trade/:id/template_input — edit a stage via the template
Console-only: re-parses the template rows like template_input, then runs trade#update for that stage.
Checks, in order:
1. Licence not creator → 763 (HTTP 422) — trade_controller.rb:26, 2132-2138
2. No trade create permission → 455 (HTTP 422) — trade_controller.rb:37
3. Unit blank → 574; unit not in workspace → 495 "The unit X is not present" (HTTP 422) — trade_template_helper.rb:1392-1416
4. Stage not active (draft, closed RFQ…; BOQ exempt) and no `configurations` sent → 33 "Order not active" (HTTP 422) — trade_template_helper.rb:1418-1432
5. Saving configuration mandatory → 719 — trade_template_helper.rb:1436-1437
6. Scheduled-events company, project is a scheduled template not at its latest version → 101 (HTTP 422) — trade_controller.rb:41-42
State rules: scheduled template → project + stages set draft, job paused, `status` param dropped so it saves as draft — trade_controller.rb:41-47.
Skips: staggered item times are not validated on edit — trade_template_helper.rb:1675-1682.

### trade#update — PATCH /trade/:id — edit a stage: entry gates (part 1)
Console-only: one endpoint for many stage edits; the first matching branch wins.
Checks, in order:
1. Stage id not found → 4 "Request not found" (HTTP 422) — trade_controller.rb:401-402
2. Project is not the latest version → 101 (HTTP 422) — trade_controller.rb:403
3. Policy update? fails (company not allowed, no create_record, no sourcing access; Procol employees always pass) → 455 (HTTP 422) — trade_controller.rb:404, trade_request_policy.rb:74-90
4. Workspace trade_mode sell → 101 — trade_controller.rb:405-407
5. RFQ in an rfx-project with an auction already made or an award proposal requested/selected → 769 "You cannot edit rfq once the auction is created." (HTTP 422) — trade_controller.rb:408, trade_request_model_helper.rb:1434-1444
6. Vendor-onboarding v2 initiator / sourcing access missing → 101 — trade_controller.rb:409-414
Cites: trade_controller.rb:399-414

### trade#update — PATCH /trade/:id — edit a stage: time and product gates (part 2)
More trade#update gates, run before any branch.
Checks, in order:
1. force_end sent (company trade_force_close on, stage in a window) without remarks → 783 "Missing Remarks" (HTTP 422) — trade_controller.rb:423-425, trade_controller_helper.rb:5905
2. end_time_type or increase_auction_time while an award proposal is requested/active/selected (same lot when lots exist) → 801 "You cannot edit the time as proposals are already submitted." (HTTP 422) — trade_controller.rb:438-440, trade_controller_helper.rb:6794-6805
3. end_time_type not request_for_best_price / request_for_cost_break_down → 2 "Insufficient parameters" (HTTP 422) — trade_controller.rb:442-443, trade_schedule.rb:69
4. trade_products with products/locations not allowed → 483 / 482 (HTTP 422) — trade_controller.rb:450-456
Skips: vendor onboarding force_start_evaluation_time sets the submission end to now — trade_controller.rb:433-437.

### trade#update — PATCH /trade/:id — quick edits that run before the status check (part 3)
These branches save and return 200 immediately, BEFORE the status whitelist, so they also work on closed or withdrawn stages.
Checks, in order:
1. is_demo_event sent by a non-Procol user → 101 (HTTP 422) — trade_controller.rb:475-480
2. other_auction_indicators_config → indicator config saved; save failure 15 — trade_controller.rb:494-502
3. title on a non-draft stage → rename (54/55 rules); save failure → 463 "Failed to edit title" (HTTP 422) — trade_controller.rb:504-509
4. auction_remark → remark added (remark error code) — trade_controller.rb:534-538
5. show_quantity_requested / show_remaining_quantity_to_sellers (dutch) → 15 on save failure — trade_controller.rb:542-552
Config gates: is_english_auction_enabled, read_only_mode_enabled, is_vendor_masking_enabled are applied only when the stage allows them and persist only if a later branch saves — trade_controller.rb:482-492.

### trade#update — PATCH /trade/:id — knockout/dutch auction round edits (part 4)
Buyer edits tick size, round time, start/end price, round extension or minimum quantity of a running knockout/dutch auction (edit_type "knockout"/"dutch").
Checks, in order:
1. increase_auction_time on knockout/dutch in an rfx-project company → 969 "Increasing auction time is not allowed in Dutch/Knockout auctions" (HTTP 422) — trade_controller.rb:555-558
2. time_difference < 30 s → 248; beyond bid end → 245 — trade_controller.rb:848-850
3. Dutch tick size past end price → 243; start price after an accepted bid → 236; start vs end price → 241/242; end price → 244; end price on a closed auction → 151 "Sorry, You cannot perform this action at this time" (HTTP 403) — trade_controller.rb:853-885
4. Round extension past auction end → 235; minimum quantity without multi-vendor closing → 247 — trade_controller.rb:894-911
Side effects: current round voided and re-versioned; future rounds regenerated; push notifications — trade_controller.rb:896-959. (Live auction is covered in another digest.)

### trade#update — PATCH /trade/:id — status whitelist and draft routing (part 5)
After the quick edits, the remaining branches need an editable stage.
Checks, in order:
1. Stage status not active / draft / requested (closed allowed only for BOQ and RFP) → 4 "Request not found" (HTTP 422) — trade_controller.rb:590-594
2. client_company_id the user cannot act for → 101 — trade_controller.rb:595-597
3. Neither the stage company nor its broker company allowed → 101 — trade_controller.rb:598-599
State rules: RFI/RFP with evaluators (or lot RFP evaluation / both-evaluation forms) → evaluators replaced — trade_controller.rb:600-602, 1848-1857. Draft stage → edit_draft (save or publish) — trade_controller.rb:603. Otherwise the first matching branch runs: reschedule, withdraw (status), time extension / evaluation / review time, send to evaluation, line items, T&C, configurations — trade_controller.rb:605-741.
So an RFQ that is closed cannot be edited, withdrawn or reopened through these branches (answer 4).

### trade#update (edit_draft) — PATCH /trade/:id — save a draft stage: checks
Draft stage, status not "active": rebuilds the draft from the payload.
Checks, in order:
1. status "cancelled" → only drafts can be cancelled: anyone in a draft project; otherwise only auction stages by super admin, owner or auction team → else 101 — trade_controller_helper.rb:3907-3909, 187-188, trade_request_model_helper.rb:1495-1504
2. company_id not allowed → 5 "Not authorized" (HTTP 422) — trade_controller_helper.rb:3911-3913
3. Configuration / template checks as when adding a stage (501, 53, 830, 854…) — trade_controller_helper.rb:3916-3920
4. bid_end_time missing → Time.at(nil), untyped 500 (defect-shaped) — trade_controller_helper.rb:545
5. Line item and title rules (80, 125, 557-559, 54/55…) — trade_controller_helper.rb:4612-4626
Skips: the 712 RFP/RFQ end rule does not run (stage is draft) — trade_controller_helper.rb:646.

### trade#update (edit_draft) — PATCH /trade/:id — save a draft stage: what gets replaced
What a draft save does to existing data.
Side effects: RFI/RFP forms and their access lists deleted and recreated — trade_controller_helper.rb:3918, 3951-3966. All line items voided and project line-item mappings set in_active, then recreated from the payload — :3927, 3938-3949, 4619. All bids of the draft set in_active and event scores reset — :3930-3931. Delivery schedules voided and recreated — :4617, 685-690. Bidding window updated in place (start = now if no bid_start_time) — :540-558. Company / broker company reassigned — :3925-3926.
Response: TradeTemplateSerializer with sheets/forms, or {success:true} with minimal_response=true — trade_controller.rb:812-824.
Cites: trade_controller.rb:796-825

### trade#update (edit_draft) — PATCH /trade/:id status=active — publish a draft stage: checks
Buyer publishes a draft stage.
Checks, in order:
1. Stage no longer draft under a row lock (someone else published) → 1121 "This event was just published by another user. Please refresh to see the latest status." (HTTP 422) — trade_controller.rb:800-801
2. Company has any auction team and the user is not in one → 586 "You cannot publish an auction" (HTTP 422) — trade_controller_helper.rb:5441, 5431-5436
3. Configuration checks (501, 53, 101…) → that code — trade_controller_helper.rb:5450-5451
4. Weightage error → its code — trade_controller_helper.rb:5453-5454
5. Knockout/dutch in an rfx-project: multi-product without fast bidding → 101; start price below RFQ global charges → 965; start price above RFQ L1 → 966; end price above L1 → 968 (HTTP 422) — trade_controller_helper.rb:4552-4560, 5776-5820
Defect-shaped: audience error 511 is overwritten and ignored — trade_controller_helper.rb:5442.

### trade#update (edit_draft) — PATCH /trade/:id status=active — publish a draft stage: state and time shift
What publishing does.
State rules: approval needed (not RFI/RFP) → "requested"; company routes auctions to the auction team and the user is not in it → stays "draft"; else "active" — trade_controller_helper.rb:4536-4540. If the bid start time is already past, start moves to now and end to now + original duration (evaluation window too) — trade_controller_helper.rb:4541-4551, trade_schedule.rb:138-148. closed_at = new end — :4545-4550.
Side effects: knockout/dutch rounds created and round scheduler queued — trade_controller_helper.rb:4562-4573; weighted scores computed — :4575-4577; approvals raised — :4580-4590; RFQ bids copied into an RFQ→auction stage — :5464-5471; project set active — :5460; owner added to access list for auction team — :5457.
Cites: trade_controller_helper.rb:5438-5462

### trade#update — PATCH /trade/:id — reschedule an upcoming stage (bid_start_time + bid_end_time)
Sent with both bid_start_time and bid_end_time and no `configurations` on a non-draft stage.
Checks, in order:
1. Bid start already passed → 258 "You cannot re-schedule this event!" (HTTP 422) — trade_controller.rb:605-606
2. RFP/RFQ end rule → 712 (HTTP 422) — trade_controller.rb:610-611, trade_controller_helper.rb:538-539
3. Window save fails → 15 "Operation failed" — trade_controller_helper.rb:553-558, trade_controller.rb:620
4. A delivery schedule id not on this stage → 15 — trade_controller.rb:622-629
State rules: window start/end replaced; closed_at = max(bid end, evaluation end, review end, approval-pending end) — trade_controller_helper.rb:540-547. No check that the new end is after the new start or in the future (unverified: client may enforce).
Defect-shaped: no bidding window → undefined `requested_state` → NameError untyped 500 — trade_controller_helper.rb:559-560.
Side effects: staggered item times shifted; knockout/dutch rounds rescheduled; reschedule notifications — trade_controller.rb:614-621, trade_request.rb:294.

### trade#update — PATCH /trade/:id — extend or reopen submission time (increase_auction_time): checks
Buyer moves the bid end time of a live or ended stage.
Checks, in order:
1. Award proposals already submitted → 801 — trade_controller.rb:438-440
2. RFP/RFQ end rule on the new end → 712 (HTTP 422) — trade_controller_helper.rb:2025-2026
3. No active bidding window → 4 "Request not found" (HTTP 422) — trade_controller_helper.rb:2032-2042
4. RFQ / auction whose window already ended and the user may not reopen → 496 "You are not allowed to reopen an expired event" (HTTP 422). May reopen: Procol employee; super admin with config is_super_admin_allowed_to_reopen_event; config is_user_allowed_to_reopen_event; any RFP — trade_controller_helper.rb:2028-2029, 5830-5832
State rules: no check that the new end is in the future. A closed RFP goes back to active — trade_controller.rb:674-676.
Cites: trade_controller.rb:642-692

### trade#update — PATCH /trade/:id — extend or reopen submission time (increase_auction_time): effects
What happens to other windows and vendors when submission time is extended.
State rules: a running best-offer window is ended now (no second best offer after reopen) — trade_controller_helper.rb:5836-5838; cost-breakdown and evaluation windows shift to start after the new end — :5839, 5524-5560; closed_at = latest active window end — trade_controller.rb:690, trade_controller_helper.rb:2079-2082.
Config gate: lock_bid_by_default → bids hidden again — trade_controller.rb:678-680.
Side effects: buyer time-increase notification, previous end stored — trade_controller.rb:681-684; SavingsCalculatorWorker at the new close — :692; vendor-onboarding reminders rescheduled — :694-699; CreateTemplateResponsesWorker — :776.

### trade#update — PATCH /trade/:id — extend the RFP and the RFQ together (extend_rfq_time)
On an RFP stage, increase_auction_time with extend_rfq_time=true first moves the project's RFQ (price round) end to the same time, then extends the RFP.
Checks, in order:
1. Project has valid lots → 818 "You cannot extend the RFQ time after lot creation" (HTTP 422) — trade_controller_helper.rb:5756
2. Latest commercial stage is an auction / RFQ→auction → 819 "You cannot extend the RFQ time after auction is created" (HTTP 422) — trade_controller_helper.rb:5757-5760
3. No RFQ stage → 820 "RFQ not found" (HTTP 422) — trade_controller_helper.rb:5761
4. RFQ window errors (4, 496, 712) or save failure 15 — trade_controller_helper.rb:5762-5772
Side effects: RFQ bids re-locked if lock_bid_by_default; RFQ closed_at recomputed — trade_controller_helper.rb:5767-5771.
Cites: trade_controller.rb:659-662

### trade#update — PATCH /trade/:id — extend or reopen evaluation time (extra_closing_time)
Buyer changes the evaluation (extra closing) end of a stage.
Checks, in order:
1. RFP with send_rfp_to_evaluation_manually, user not in purchase/customer_success mode, and no evaluation window yet → 746 "You are not allowed to increase the evaluation time" (HTTP 422) — trade_controller.rb:647-649, trade_request_model_helper.rb:1176-1182
2. Evaluation already ended and user may not reopen evaluation → 496 "You are not allowed to reopen an expired event" (HTTP 422); allowed: Procol employee, config allow_event_evaluation_reopen_for_everyone, super admin with is_super_admin_allowed_to_reopen_evaluation — trade_controller_helper.rb:2030-2031, 5885-5888
3. New end before now or before the window start → 195 "Invalid time." (HTTP 422) — trade_controller_helper.rb:5889-5891
State rules: send-to-evaluation user with no window yet → only config evaluation_duration grows — trade_controller.rb:650-652. No window → one is created from bid end — trade_controller_helper.rb:5894-5899.

### trade#update — PATCH /trade/:id — best offer / cost breakdown round and force end
end_time_type + end_time opens a "request for best price" or "request for cost break down" review window after bidding; force_end ends the current window now.
Checks, in order:
1. end_time_type invalid → 2 (HTTP 422) — trade_controller.rb:442-443
2. Award proposals submitted → 801 — trade_controller.rb:438-440
3. force_end without remarks → 783 "Missing Remarks" (HTTP 422) — trade_controller_helper.rb:5905
Config gate: force end only with company setting trade_force_close and the stage in submission, evaluation, cost-breakdown or best-offer time — trade_request_model_helper.rb:1621-1624, trade_controller_helper.rb:5928-5930.
State rules: review window created/updated; end_time_applicable_vendor_ids stored as allowed participants; best-offer submitted list reset — trade_controller.rb:444-447, 579-581, trade_controller_helper.rb:2073-2077, 5843-5869. Force end sets the matching end to now and stores a remark — :5903-5926, trade_controller.rb:686-689.
Side effects: best-offer notifications/reminders; cost-breakdown tasks — trade_schedule.rb:49-55.

### trade#update — PATCH /trade/:id — send RFP to evaluation (trigger_evaluation)
Buyer manually starts evaluation of an RFP (technical round) after bidding ended.
Checks, in order:
1. Allowed only when RFP + config send_rfp_to_evaluation_manually + user in purchase/customer_success mode + bidding expired + stage not in_active + no evaluation window yet — trade_request_model_helper.rb:1184-1189. If not allowed the branch is silently skipped (no error; later branches run and 200 is returned) — trade_controller.rb:700
2. No evaluation_duration configured → 825 "No evaluation time present. Set evaluation time to send RFP to evaluation." (HTTP 422) — trade_controller.rb:701-702
3. Window errors → 4 / 496 / 195; save failure → 15 — trade_controller.rb:704-708
State rules: evaluation end = now + evaluation_duration; misc is_rfp_send_to_evaluation = true; closed_at = evaluation end — trade_controller.rb:703, 709, trade_controller_helper.rb:2084-2087.
Side effects: planners notified at evaluation start — trade_schedule.rb:85-90.

### trade#update — PATCH /trade/:id — edit line items of a live stage (trade_products / widgets)
Checks, in order:
1. Bidding ended (non-BOQ) → 4 "Request not found" (HTTP 422) — trade_controller_helper.rb:331-333
2. Legacy layout: each listed item modified; save failure 15 — trade_controller_helper.rb:341-348
3. Sheet layout, no submitted bids: ALL line items replaced (project line items deleted and recreated, old items voided, draft bids in_active); any add-stage line-item error (80, 125, 557-559…) — trade_controller_helper.rb:349-381
4. Sheet layout with bids: only tick size, price cap/floor and savings widgets change. Price cap below the highest bid → 15 "Price Cap should be greater than or equal to <price> for <product>"; floor above the lowest bid → 15 "Floor Price should be less than or equal to …" (HTTP 422); savings column missing → 575 — trade_controller_helper.rb:404-466, 474-498
Side effects: audience notified (kept / removed / new vendors) — trade_controller_helper.rb:383-403; update notification — :467.
Cites: trade_controller.rb:711-713

### trade#update — PATCH /trade/:id — edit T&C or configuration of a live stage
Checks, in order:
1. terms_and_conditions / t_and_c attachments, or `configurations`, when bids exist AND bidding ended → 4 "Request not found" (HTTP 422) — trade_controller.rb:714-717, 723-726
2. Configurations: company not allowed and user not CSM → 5 "Not authorized" — trade_controller.rb:727-730
3. Configuration checks as when adding a stage (501, 53, 269, 830…) and savings-config errors — trade_controller.rb:733-736
4. RFP/RFQ end rule with params bid_end_time → 712; bid_end_time missing while an opposite stage exists → untyped 500 — trade_controller.rb:738-739, trade_controller_helper.rb:668-670
State rules: the whole config is rebuilt (replaced); only the window TYPE is updated, not times — trade_controller_helper.rb:3327-3329, 550-552.
Side effects: update notification to vendors — trade_controller.rb:722, 740, trade_request.rb:2423-2427.

### trade#update — PATCH /trade/:id — raw trade_config and delivery date overwrite
Two unvalidated writes that run after any non-returning branch of trade#update on a live stage.
State rules: `trade_config` param replaces the stage config wholesale with no validation, for non-Procol users only (Procol employees are ignored); single-product stages copy price_change_slab to the item — trade_controller.rb:748-757.
Defect-shaped: `delivery_schedules` are looked up by id with no stage scoping (any delivery schedule id can be changed) and an unknown id → NoMethodError, untyped 500 — trade_controller.rb:759-765.
Side effects: dropdown widgets refreshed; save failure → 15 with model message; staggered item map recomputed (507 possible) — trade_controller.rb:767-775.
Cites: trade_controller.rb:743-777

### trade#update — PATCH /trade/:id — withdraw or cancel a live stage (status): checks
status sent on a non-draft stage ("withdrawn", "in_active", "0" → in_active, "cancelled").
Checks, in order:
1. "cancelled" on a non-draft stage → 101 (only drafts can be cancelled) — trade_controller_helper.rb:187-188, trade_request_model_helper.rb:1495-1496
2. Award proposal selected/requested (for the stage's lot, or any) → 841 "Cannot withdraw the event as proposals are already submitted." (HTTP 422) — trade_controller_helper.rb:192-199
3. withdraw_remark given and a PR item was short-closed by integration → 753 "Cannot withdraw event with short closed purchase request items" (HTTP 422) — trade_controller_helper.rb:292-295
4. Saving stage/items fails → 1106 "Failed to update lot configuration. Please try again." (HTTP 422) — trade_controller_helper.rb:215-247
Note: status is not whitelisted — any enum value is written (unknown string → ArgumentError, untyped 500; unverified) — trade_controller_helper.rb:201.
Cites: trade_controller.rb:638-641

### trade#update — PATCH /trade/:id — withdraw or cancel a live stage (status): effects
What a withdrawal does.
State rules: closed_at = now and closed_by set; future windows in_active; running window ends now; active line items take the same status — trade_controller_helper.rb:202-212, 217-224, 308-325. Last stage of a lot withdrawn → lot back to draft and parent RFQ released — :229-241, 274-282. All stages withdrawn → project withdrawn with remark "All Stages were Withdrawn" — :255-265.
Side effects: push "trade_request_withdrawn" + "trade_withdraw" email with remark; future knockout/dutch rounds voided; additional requests revoked; precomputed data refreshed; RFQ→auction parent cache touched — trade_controller_helper.rb:250-253, 266-269, 300-306.

### trade#update_vendor_validations_for_trade — PATCH /trade/:id/update_vendor_validations — vendor-specific price caps
Console-only: sets a per-vendor price cap (buy) or floor price (sell) per line item.
Checks, in order:
1. Stage not active/draft → 4 "Request not found" (HTTP 422) — trade_controller.rb:785-786
2. productwise_vendor_validations missing → 2 "Insufficient parameters" — trade_controller.rb:787
3. User cannot view the event → 455 — trade_controller.rb:788, trade_request_policy.rb:129-131, 222-224
4. Template config can_add_ceil_price (or can_add_floor_price) not true → 10 "You are not allowed to use this functionality" (HTTP 422) — trade_validation.rb:43-62
5. Negative cap → 202; negative floor → 203 — trade_validation.rb:64-74
Payload: { trade_product_uuid: { vendor_company_uuid: value } } — trade_controller_helper.rb:2957-2974.
Defect-shaped: a line item uuid not on this stage → NoMethodError, untyped 500 — trade_controller_helper.rb:2976-2979.
Side effects: item validations saved via autosave — trade_controller_helper.rb:2982-2983, trade_request.rb:115.

### trade#staggered_time — PATCH /trade/:id/staggered_time — change line-item times of a staggered auction
Console-only: moves start/end times of individual line items in a line-item-closing staggered auction.
Checks, in order:
1. Stage not active, or not staggered (auction_closing_mode line_item_based + staggered) → 4 "Request not found" (HTTP 422) — trade_controller.rb:1410-1412, trade_template_helper.rb:1626-1630
2. trade_products_time missing → 80 "Product not found" (HTTP 422) — trade_controller.rb:1414-1415
3. Item start before bid start, start ≥ end, or new start/end earlier than the current ones → 507 "Invalid Time Input" (HTTP 422) — trade_controller_helper.rb:2121-2123
4. Latest item end after bid end → bid end extended (4/496 apply); window save failure returns code 422, which has no yml entry → HTTP 500 "Something went wrong!" — trade_controller_helper.rb:2131-2141, 2179-2198
No authorize call and no company check (any console user can call it for any active staggered stage id) — trade_controller.rb:1408-1423. Unknown item key → untyped 500 — trade_controller_helper.rb:2123.

### trade#reopen_line_items — POST /trade/:id/reopen_line_items — reopen closed items of a staggered auction
Console-only: gives chosen closed line items a fresh bidding slot each, one after another.
Checks, in order:
1. No trade create permission → 455 (HTTP 422) — trade_controller.rb:1427
2. Stage not active, not in the workspace, or not staggered → 4 "Request not found" (HTTP 422) — trade_controller.rb:1429-1431
3. trade_product_ids blank or reopen_time_extension missing/≤ 0 → 2 "Insufficient parameters" — trade_controller.rb:1433-1437
4. Any chosen item still live or upcoming → 15 "Operation failed" — trade_controller_helper.rb:2149-2150, 6771-6781
5. Bidding window already ended and user may not reopen events → 496 — trade_controller_helper.rb:2171-2172, 5830-5832
6. Window save failure → code 422 → HTTP 500 "Something went wrong!" — trade_controller_helper.rb:2187, 2197
State rules: slots start now (in evaluation) or at bid end, each reopen_time_extension seconds; bid end = last slot end; evaluation window shifted equally — trade_controller_helper.rb:2155-2176, 2188-2192.

### trade#create_new_lot — POST /trade/create_new_lot — split an RFQ into lot RFQs: checks
Console-only: converts an RFQ (price round) into one new RFQ stage per lot of line items.
Checks, in order:
1. trade_request_id not an active RFQ → 95 "Trade Request not found" (HTTP 422) — trade_controller.rb:1821-1822
2. No read permission → 455 — trade_controller.rb:1823
3. RFQ still live (bidding open) → 740 "RFQ event cannot be converted to lots as it is still live." (HTTP 422) — trade_controller.rb:1824
4. RFQ changes restricted (auction made / proposal submitted) → 769 — trade_controller.rb:1825
5. A line item already in an active/in-progress lot, or the RFQ is itself a lot (has parent) → 739 "A lot for one or more items already exists." (HTTP 422) — trade_controller.rb:1826-1829
6. Company not allowed → 101 — trade_controller.rb:1830
7. Service failure → its code or message — trade_controller.rb:1831-1832, create_event_lots/create_service.rb:69-74
Defect-shaped: `lots` missing → NoMethodError untyped 500 — trade_controller.rb:1827.

### trade#create_new_lot — POST /trade/create_new_lot — split an RFQ into lot RFQs: effects
What lot creation does.
State rules: lots marked in_progress before the transaction (set back to draft on failure) — create_service.rb:33, 69-70. Each lot RFQ copies the parent, gets parent_id, stage_no + 1, lot_no/title — create_service.rb:209-217. Times come from the latest sibling lot RFQ (or the parent), evaluation end from company setting event_duration_predefined_values rfq.default_evaluation if set — create_service.rb:121-131, 229-239. Parent RFQ windows end now and is_converted_to_lots = true — create_service.rb:195-200. Lot config set active with stage ids — create_service.rb:58-65.
Side effects: parent's active/requested bids copied into each lot with global amount charges prorated; bid-justification requests; precomputed scores refreshed; lot-split notification — create_service.rb:156-193, 219-227, 76-77.

### trade#upload_file — POST /trade/upload_file — upload a T&C or product-sheet file
Console and vendor website: uploads a base64 file to private S3 and returns url + pre-signed public_url.
Checks, in order:
1. No read permission (or intake-request view) → 455 (HTTP 422) — trade_controller.rb:1743, trade_request_policy.rb:200-202
2. name, data or type missing → 2 "Insufficient parameters" (HTTP 422) — trade_controller.rb:1747-1749
3. type not t_and_c / product_sheet → 2 — trade_controller.rb:1751-1752, s3_upload.rb:9-12
4. Extension not in .xlsx .xls .csv .pdf .zip .jpg .jpeg .png .doc .docx .txt .msg .eml .dwg .cdr (case-insensitive) → 484 "File type not allowed" (HTTP 422) — trade_controller.rb:1757, utils.rb:746-749
Side effects: S3 object under trade_files/<folder>/<company>_<id>/ — trade_controller.rb:1755-1763.

### trade#add_variants — PATCH /trade/:id/add_variants — bidder adds an alternate variant (alternate bidding)
Vendor website and console: in an alternate-bidding stage, creates a product variant and a new line item for it.
Checks, in order:
1. id, product_id or variant_name missing → 2 (HTTP 422) — trade_controller_helper.rb:2510-2512
2. Stage not active, or not currently running → 4 "Request not found" — trade_controller_helper.rb:2514-2516
3. User cannot view the stage, or stage not alternate bidding → 101 — trade_controller_helper.rb:2517-2518
4. Product not active → Product.active.find raises RecordNotFound (not rescued; the 4 check after it is dead code) — trade_controller_helper.rb:2522-2523
5. Product not owned by the buyer's companies → 101 — trade_controller_helper.rb:2524-2525
6. New line item save fails → 15 with model message — trade_controller.rb:1399-1404
No Pundit authorize. Defect-shaped: product not on this stage → variant saved, then nil.dup → untyped 500 — trade_controller.rb:1378-1392.

### trade#edit_weight_parameters — PATCH /trade/:id/edit_weight_parameters — edit weighted-scoring weights
Console-only: sets or changes weightages (weighted bid ranking) on an active stage.
Checks, in order:
1. Stage not active, or weightages / weightage_on missing → 2 "Insufficient parameters" (HTTP 422) — trade_controller.rb:1777-1783
2. Stage company not in the user's companies → 455 — trade_controller.rb:1784, trade_request_policy.rb:100-102
3. Bids exist and config disallows weight edits (allow_edit_weight_param_auction for auction/RFQ→auction, allow_edit_weight_param_rfq for RFQ) → 15 "Operation failed" (HTTP 422) — trade_controller.rb:1786-1788
4. Validate / create service errors → their code and message (HTTP 422) — trade_controller.rb:1790-1802 (unverified: codes live in Weightages services)
Side effects: misc weightage keys + "Weighted Total" saved; removed keys cleaned — trade_controller.rb:1804-1816.

### trade — other actions (one line each)
- trade#show (GET /trade/:id) — stage detail; console + vendor — trade_controller.rb:1046.
- trade#create_vendor_onboarding_events (POST) — vendor-onboarding invites; 4 if order_type is not vendor_onboarding — trade_controller.rb:52-84.
- trade#create_update_vendor_onboarding_event (POST, supplier_suite) — vendor detail update event; 516 if one is in flight — trade_controller.rb:86-120.
- trade#move_to_auction — RFQ→auction; covered by another digest — trade_controller.rb:963.
- get_channel_identifiers, get_event_group_uuid, get_seller_delivery_stats, get_price_trends, trade_config, auction_report_data, detailed_report, event_summary — read/report only — trade_controller.rb:1360, 1767, 1447, 1527, 1587, 1625, 1668, 1709.

## Error codes in this area

### Error codes — generic (1/11)
- 2 (HTTP 422) "Insufficient parameters" — trade#update end_time_type (trade_controller.rb:443), reopen_line_items (:1436), upload_file (:1748, 1752), update_vendor_validations (:787), edit_weight_parameters (:1782), add_variants (trade_controller_helper.rb:2511)
- 4 (HTTP 422) "Request not found" — trade#update (trade_controller.rb:402, 594, 716, 725), staggered_time (:1411-1412), reopen_line_items (:1430-1431), line-item edit after close (trade_controller_helper.rb:332), no bidding window (:2042)
- 5 (HTTP 422) "Not authorized" — trade_controller.rb:153, 729, trade_controller_helper.rb:3913
- 10 (HTTP 422) "You are not allowed to use this functionality" — trade_validation.rb:48, 53, 58
- 15 (HTTP 422) "Operation failed" — trade_controller.rb:352, 620, 1787; trade_controller_helper.rb:448, 461, 6779
- 33 (HTTP 422) "Order not active" — trade_template_helper.rb:1431
- 35 (HTTP 422) "Quantity must be greater than zero" — trade_controller_helper.rb:1830
- 53 (HTTP 422) "Order Type not mentioned" — trade_controller_helper.rb:3531

### Error codes — products, titles, permissions (2/11)
- 54 (HTTP 422) "Title or Description missing" — trade_controller_helper.rb:1431
- 55 (HTTP 422) "Title is missing" — trade_controller_helper.rb:1420
- 80 (HTTP 422) "Product not found" — trade_controller.rb:134, 168, 1415; trade_controller_helper.rb:1716
- 95 (HTTP 422) "Trade Request not found" — create_new_lot (trade_controller.rb:1822)
- 101 (HTTP 422) "You are not allowed to perform this action" — trade_controller.rb:125, 403, 406, 599, 1830; trade_controller_helper.rb:188, 3358, 2517
- 125 (HTTP 422) "Delivery location not found" — trade_controller_helper.rb:855
- 151 (HTTP 403) "Sorry, You cannot perform this action at this time" — trade_controller.rb:885
- 195 (HTTP 422) "Invalid time." — trade_controller_helper.rb:5890

### Error codes — price caps and validations (3/11)
- 200 (HTTP 422) "You cannot decrease the Price Cap." — trade_validation.rb:79
- 202 (HTTP 422) "Price Cap cannot be negative" — trade_validation.rb:67
- 203 (HTTP 422) "Floor Price cannot be negative" — trade_validation.rb:73
- 204 (HTTP 422) "Floor Quantity cannot be negative" — trade_validation.rb:76
- 205 (HTTP 422) "Floor Quantity cannot be greater than the Total Quantity" — trade_validation.rb:83
- 258 (HTTP 422) "You cannot re-schedule this event!" — trade_controller.rb:606
- 269 (HTTP 422) "You have not provided valid traffic light ranges." — trade_controller_helper.rb:1928, 3440-3444
- 455 (HTTP 422) "You are not authorized to perform this action" — any Pundit refusal (api_auth.rb:117-118)

### Error codes — knockout/dutch prices (4/11)
- 106 (HTTP 422) "Please enter a valid price" — trade_controller_helper.rb:3453, 3483
- 235 (HTTP 422) "You cannot extend round time beyond auction expiry time. Please extend auction time first." — trade_controller.rb:905
- 236 (HTTP 422) "Accepted bid exists. You cannot perform this action." — trade_controller.rb:866
- 237 (HTTP 422) "Please enter all the required entries for creating the auction." — trade_controller_helper.rb:3459, 3486
- 238 (HTTP 422) "Time difference cannot be greater than auction time." — trade_controller_helper.rb:3462, 3497
- 241 (HTTP 422) "Start Price cannot be greater than End Price" — trade_controller.rb:873, trade_controller_helper.rb:3489
- 242 (HTTP 422) "Start Price cannot be less than End Price" — trade_controller.rb:871, trade_controller_helper.rb:3493
- 243 (HTTP 422) "Invalid Tick Size" — trade_controller.rb:857-859, trade_controller_helper.rb:3490, 3494

### Error codes — knockout/dutch rounds, title, attachments (5/11)
- 244 (HTTP 422) "Invalid End Price" — trade_controller.rb:880-882
- 245 (HTTP 422) "Time difference cannot exceed auction end time" — trade_controller.rb:850
- 247 (HTTP 422) "Quantity is required in case of multiple vendor closing" — trade_controller.rb:911
- 248 (HTTP 422) "Time difference cannot be less than 30 seconds" — trade_controller.rb:849, trade_controller_helper.rb:3456
- 463 (HTTP 422) "Failed to edit title" — trade_controller.rb:507
- 474 (HTTP 422) "Sorry, trade with this configuration is not allowed" — trade_controller.rb:143
- 482 (HTTP 422) "You are not authorized to add product" — trade_controller_helper.rb:5356
- 483 (HTTP 422) "You are not authorized to add delivery location" — trade_controller_helper.rb:5351

### Error codes — files, units, reopen, time (6/11)
- 484 (HTTP 422) "File type not allowed" — trade_controller.rb:1757
- 489 (HTTP 422) "Maximum attachment limit exceeded." — trade_controller.rb:136
- 495 (HTTP 422) "Unit not found" (rendered with custom message "The unit X is not present") — trade_template_helper.rb:1408-1415
- 496 (HTTP 422) "You are not allowed to reopen an expired event" — trade_controller_helper.rb:5831, 5887
- 501 (HTTP 422) "Invalid Trigger Time for Dynamic Time Extension." — trade_controller_helper.rb:3319
- 507 (HTTP 422) "Invalid Time Input" — trade_template_helper.rb:1689, trade_controller_helper.rb:2122-2123
- 511 (HTTP 422) "Participants limit exceeded. Maximum 500 participants are allowed." — trade_controller_helper.rb:729 (ignored on draft publish, :5442)
- 516 (HTTP 422) "Transaction in Progress" — trade_controller_helper.rb:3654

### Error codes — PR items, savings, publish (7/11)
- 557 (HTTP 422) "Purchase request items are not valid" — trade_controller_helper.rb:1748, 1763
- 558 (HTTP 422) "Quantity should be less than open quantity" — trade_controller_helper.rb:1757
- 559 (HTTP 422) "Quantity should be in same unit as requested" — trade_controller_helper.rb:1759
- 574 (HTTP 422) "Unit cannot be blank" — trade_template_helper.rb:1395
- 575 (HTTP 422) "Savings Column not found" — trade_controller_helper.rb:1090
- 586 (HTTP 422) "You cannot publish an auction" — trade_controller_helper.rb:5441
- 712 (HTTP 422) "RFP duration exceeds RFQ end time. Please adjust." — trade#template_input / trade#update reschedule, configuration edit, time extension (trade_controller_helper.rb:669, 671), event_groups#update publish (event_groups/update_service.rb:311), add new stage (add_new_stage/validate_service.rb:66)
- 719 (HTTP 422) "Saving Configurations is mandatory for Event" — trade_template_helper.rb:1437

### Error codes — lots, evaluation, licence (8/11)
- 739 (HTTP 422) "A lot for one or more items already exists." — trade_controller.rb:1828-1829
- 740 (HTTP 422) "RFQ event cannot be converted to lots as it is still live." — trade_controller.rb:1824
- 746 (HTTP 422) "You are not allowed to increase the evaluation time" — trade_controller.rb:649
- 753 (HTTP 422) "Cannot withdraw event with short closed purchase request items" — trade_controller_helper.rb:294
- 763 (HTTP 422) "Only users with creator role can create/update event. Please contact CSM to upgrade License." — trade_controller.rb:2137
- 769 (HTTP 422) "You cannot edit rfq once the auction is created." — trade_controller.rb:408, 1825
- 783 (HTTP 422) "Missing Remarks" — trade_controller_helper.rb:5905
- 801 (HTTP 422) "You cannot edit the time as proposals are already submitted." — trade_controller.rb:439

### Error codes — RFQ extension, project stages (9/11)
- 818 (HTTP 422) "You cannot extend the RFQ time after lot creation" — trade_controller_helper.rb:5756
- 819 (HTTP 422) "You cannot extend the RFQ time after auction is created" — trade_controller_helper.rb:5759
- 820 (HTTP 422) "RFQ not found" — trade_controller_helper.rb:5761
- 825 (HTTP 422) "No evaluation time present. Set evaluation time to send RFP to evaluation." — trade_controller.rb:702
- 830 (HTTP 422) "Same type of event already exists for this Project." — trade_controller_helper.rb:3666
- 841 (HTTP 422) "Cannot withdraw the event as proposals are already submitted." — trade_controller_helper.rb:195, 198
- 854 (HTTP 422) "Same type of stage already exists for this rfx. Please delete the existing stage to create a new one" — trade_controller_helper.rb:3694
- 888 (HTTP 422) "Invalid Parameters" — trade_controller_helper.rb:3649

### Error codes — line items, auction price, lots (10/11)
- 890 (HTTP 422) "Event group line item does not belong to the specified event group" — trade_controller_helper.rb:3688
- 965 (HTTP 422) "Starting price cannot be less than the maximum global charge of RFQ bids" — trade_controller_helper.rb:5807
- 966 (HTTP 422) "Starting price cannot be more than the lowest RFQ (L1) Sum Total" — trade_controller_helper.rb:5815
- 968 (HTTP 422) "End price cannot be more than the lowest RFQ (L1) Sum Total" — trade_controller_helper.rb:5818
- 969 (HTTP 422) "Increasing auction time is not allowed in Dutch/Knockout auctions" — trade_controller.rb:557
- 1106 (HTTP 422) "Failed to update lot configuration. Please try again." — trade_controller_helper.rb:221, 226, 245

### Error codes — concurrency, dormant PRs, untyped (11/11)
- 1121 (HTTP 422) "This event was just published by another user. Please refresh to see the latest status." — trade_controller.rb:801
- 1125 (HTTP 422) "One or more PRs are dormant and locked from sourcing events" — trade_controller.rb:347-348
- 422 as a code (no yml entry) → HTTP 500 "Something went wrong!" — trade_controller_helper.rb:2187, 2197
- app_error_auth_failed (HTTP 401) "This app is not authorized to use this API" — api_auth.rb:87-94
