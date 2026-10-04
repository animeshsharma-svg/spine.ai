# Stage model layer (TradeRequest, TradeSchedule, TradeRound, TradeProduct, currency + savings config) — backend digest (procol-backend origin/main ae36e86894)

## Overview
A "stage" (RFQ, auction, RFQ-then-auction, RFI, RFP, offline trade, vendor onboarding) is one `TradeRequest` row inside a
project (`EventGroup`). This file covers the model layer the controllers (see trade-stages.md, trade-live-v1.md,
auction-templates.md, bids.md) sit on: enums and their integer values, save/commit callbacks and the jobs they schedule,
the time predicates (`is_running`, `in_submission_time?`, review/evaluation windows), the `config` / `misc` keys the model
reads with their defaults, price limits and tick size on `TradeProduct`, currency and savings configuration, and the
view/permission predicates controllers call. Files: app/models/trade_request.rb, app/models/model_helpers/
trade_request_model_helper.rb, app/models/trade_schedule.rb, app/models/trade_round.rb,
app/models/trade_requests/currency_configuration.rb, app/models/savings_configuration.rb, app/models/trade_product.rb,
plus the included concerns TermsAndConditionsStructurable, Versioning::Versionable, ApprovalWorkflow::HasApproval.
App time zone is `Kolkata` (config/application.rb:111); time checks compare instants, the zone only affects display.

### TradeRequest.status — stage statuses and their integer values
The `status` column of a stage. Controllers and scopes filter on it; several callbacks fire on changes to it.
Rules:
1. [state] `status` enum: in_active=0, active=1, closed=2, scheduled=3, void=4, withdrawn=5, requested=6, draft=7, cancelled=8 — app/models/trade_request.rb:162
2. [state] Code comments: `in_active` and `withdrawn` both mean a withdrawn stage; `void` is only set via ssh to hide a stage everywhere; `cancelled` removes a draft stage — app/models/trade_request.rb:159-161
3. [state] `requested` = waiting for creation approval; `draft` = not published (both set by publish_auction, see "Approval of a stage") — app/controllers/concerns/trade_controller_helper.rb:4536-4540
4. [state] Constants: CANCEL_AND_WITHDRAWN_STATUSES = in_active, withdrawn, cancelled; VALID_ADD_NEW_STAGE_STATUSES = active, closed, requested, draft; DISCARDED_STATUSES = in_active, void, cancelled — app/models/trade_request.rb:318-321
5. [state] Scope `valid` = active, scheduled, closed, withdrawn, requested; `not_in_active` = status 1,2,3; `not_draft_or_cancelled_or_withdrawn` excludes in_active, void, draft, cancelled, withdrawn — app/models/trade_request.rb:168-175
6. [state] `display_status`: active + running → "Open"; active + not running → "Expired"; closed → "Closed"; in_active → "Withdrawn"; anything else → the raw status string (e.g. "withdrawn", "draft") — app/models/trade_request.rb:1228-1238
Gaps: status `withdrawn` (5) is not mapped by `display_status` and is shown as raw "withdrawn" while `in_active` shows "Withdrawn" — app/models/trade_request.rb:1236-1237
Cites: app/models/trade_request.rb:159-175, 318-321, 1228-1238

### TradeRequest.rfx_mode, current_status, order_type, tender, customised_audience — stage type enums
These enums decide which schedule type is "the bidding time", which notifications fire and how vendors are targeted.
Rules:
1. [state] `rfx_mode`: auction=0, rfq=1, rfq_then_auction=2, offline_trade=3, rfi=4, rfp=5; column default `auction`, NOT NULL — app/models/trade_request.rb:164, 32
2. [state] `current_status`: auctioning=0, rfqing=1, offline_trading=2 (default auctioning); RFI/RFP stages are created with `current_status = nil` and `auction_config = nil` — app/models/trade_request.rb:165, 15; app/controllers/concerns/trade_controller_helper.rb:3583-3586
3. [state] Creation maps rfx_mode → current_status: rfq_then_auction/auction → auctioning, rfq → rfqing, offline_trade → offline_trading — app/controllers/concerns/trade_controller_helper.rb:3568-3590
4. [state] `order_type`: buy=0, sell=1, vendor_onboarding=2; `is_forward_auction?` = auction-type AND auctioning AND sell — app/models/trade_request.rb:163, 1523-1525
5. [state] `tender`: open=0, closed=1 (suffix `_tender`, default closed); `customised_audience`: everyone=0, restricted=1, except_for=2 (default everyone) — app/models/trade_request.rb:158, 167, 16, 36
6. [state] `is_auction?` is true for both `auction` and `rfq_then_auction` — app/models/trade_request.rb:1519-1521
7. [visibility] `stage_name`: auction/rfq_then_auction → "Auction", rfp/rfi → "Technical", rfq → "RFQ" — app/models/trade_request.rb:1240-1251
Gaps: trade_controller compares `trade_request.current_status == "auction"`, a value the enum never has (auctioning/rfqing/offline_trading), so that bids-group branch is dead — app/controllers/api/trade_controller.rb:1119; app/models/trade_request.rb:165
Cites: app/models/trade_request.rb:158-167, 1519-1525

### TradeRequest.auction_config — auction strategy enum and predicates
The auction strategy (rank, price, traffic light, knockout, dutch, book building).
Rules:
1. [state] `auction_config`: rank=0, price=1, rank_and_price=2, traffic_light=3, knockout=4, dutch=5, book_building=6; default `rank` — app/models/trade_request.rb:166, 8
2. [state] Predicates: `is_rank_based?` = rank; `is_price_based?` = price; `is_rank_and_price_based?` = rank_and_price; `is_traffic_light_bidding?` = traffic_light; `is_knockout_or_dutch_auction?` = knockout or dutch — app/models/trade_request.rb:1610-1633; app/models/model_helpers/trade_request_model_helper.rb:219-225
3. [config] Traffic light is rank-based only when `config.traffic_light_based_on_rank_or_price == "rank"`, otherwise price-based — app/models/model_helpers/trade_request_model_helper.rb:227-233
4. [visibility] `auction_strategy` returns `auction_config` only for auction-type stages, else "" — app/models/trade_request.rb:1916-1920
5. [calculation] Book-building stages count `number_of_products` as distinct (product, quality, buyer hub) triples — app/models/trade_request.rb:2255-2256
Cites: app/models/trade_request.rb:166, 1610-1633, 1916-1920

### TradeRequest before_save / validation — persisted bid_end_time, tender, unique auction per RFQ
Runs on every save of a stage.
Rules:
1. [time] `before_save :set_bid_end_time` copies the computed `bid_end_time` (from schedules, see next sections) into the `bid_end_time` column on every save — app/models/trade_request.rb:277, 3096-3098
2. [config] `before_save :set_tender_value`: tender = `open` only when the stage is NOT auction-type AND company custom config `enable_open_tender_events` is on AND project `config.show_under_open_events` is true (default false); otherwise `closed` — app/models/trade_request.rb:3152-3159; app/models/company.rb:215-217; app/models/event_group.rb:902-907
3. [validation] On create, a `rfq_then_auction` stage with a `parent_id` is refused when another stage with the same parent_id and event_group_id exists that is not in_active/void/draft/cancelled/withdrawn → base error "An auction has already been made for this event." — app/models/trade_request.rb:279, 3100-3105; config/locales/en-IN.yml:132-135
4. [side-effect] `before_update :update_ref_id` when rfx_mode changes: keeps the number, swaps the prefix (e.g. RFQ-12 → RA-12) — app/models/trade_request.rb:278, 388-394
5. [side-effect] Draft stages skip activity-log entries unless the save moves them to active — app/models/trade_request.rb:3255-3259
Gaps: `set_tender_value` calls `self.event_group.show_under_open_events?` without a nil guard (event_group is optional) → NoMethodError → untyped 500 on save of a non-auction stage without a project when open tenders are enabled — app/models/trade_request.rb:105, 3154
Cites: app/models/trade_request.rb:277-279, 3096-3105, 3152-3159

### TradeRequest after_create_commit — what is scheduled when a stage is created
Fires once per new stage (skipped for scheduled-template projects, see "skip_callback").
Rules:
1. [side-effect] `schedule_auto_award_worker`: if `config.auto_awarding_enabled` is present, appends {status: enabled, time} to `misc.auto_award_timeline` and schedules `AutoAwardWorker` at `bid_end_time + 3s` — app/models/trade_request.rb:281, 3227-3234; app/models/model_helpers/trade_request_model_helper.rb:1406-1419
2. [side-effect] `send_notification_and_mail_trade_creation` (see "Stage creation/publish notifications") — app/models/trade_request.rb:282, 1953-1975
3. [side-effect] `add_event_group_details`: if project `precomputed_data.trade_template_id` is blank and stage is not RFI/RFP, stores this stage's template_id; schedules `EventGroupUpdateWorker` at now+2s, at bid_start_time (if upcoming), at bid_end_time, at closed_at (if different from bid_end_time) and at review-time end (if any) — app/models/trade_request.rb:283, 3183-3197
4. [side-effect] `update_latest_stage_time_on_eg` sets project `latest_stage_time = created_at` — app/models/trade_request.rb:284, 3177-3181
5. [side-effect] `add_ref_id` (see "ref_id") and, when `misc.integration_type == "FxResponse"`, `FlexiModule::TradeReferenceUpdateService` — app/models/trade_request.rb:311-312, 2927-2934
Gaps: auto award is scheduled only at create; this callback does not move it when bid_end_time is later extended — app/models/trade_request.rb:281, 3232
Gaps: `add_event_group_details` dereferences `self.event_group.precomputed_data` without nil guard → crash on a stage with no project — app/models/trade_request.rb:3184
Cites: app/models/trade_request.rb:281-284, 311-312, 3177-3234

### TradeRequest after_save / after_commit — status and closed_at cascades
Callbacks that fire on later saves of a stage.
Rules:
1. [side-effect] Every save: `update_team_identifier` regenerates and `update_columns(team_identifier:)` (skipped for rfq_then_auction) — app/models/trade_request.rb:299, 1576-1580
2. [side-effect] Status saved as in_active/withdrawn/cancelled → all related pending tasks marked in_active — app/models/trade_request.rb:293, 3205-3208
3. [side-effect] Status saved → active on a rfq_then_auction stage → project `refresh_lpo_data(user_id:)` — app/models/trade_request.rb:300, 3011-3015
4. [side-effect] closed_at changed (not RFI/RFP) → `MarkEventClosedWorker` at closed_at — app/models/trade_request.rb:303, 358-361
5. [side-effect] closed_at changed and status did NOT change to active → `DeleteDraftBidsWorker` at bid_end_time — app/models/trade_request.rb:304, 3199-3203
6. [side-effect] Status saved → closed and company custom config `send_report_after_event_closed` present → `EventClosedReportWorker` now — app/models/trade_request.rb:305, 363-368
7. [side-effect] Status or closed_at changed → `EventGroupUpdateWorker` at now+2s, plus at bid end / closed_at / review end (running) or at closed_at — app/models/trade_request.rb:287, 3210-3225
8. [side-effect] Every update commit → push `update_trade_socket_ping` (+ `update_trade_notification` if `send_notification_on_trade_update`) — app/models/trade_request.rb:288, 2423-2428
9. [side-effect] Status → active/in_active/withdrawn/cancelled updates the item version; → active also the versioned ref id — app/models/versioning/versionable.rb:7-15
Gaps: `invalidate_mcp_cache` (every save commit) calls `self.event_group.…` unguarded → NoMethodError for a stage without a project — app/models/trade_request.rb:291, 370-372
Cites: app/models/trade_request.rb:285-305, 3199-3225

### TradeRequest savings recalculation schedule (calculate_savings)
`after_commit :calculate_savings` on every commit; it decides internally whether to queue savings jobs.
Rules:
1. [side-effect] Skipped for RFI/RFP and for knockout/dutch stages — app/models/trade_request.rb:342-344
2. [time] Queues jobs when (stage newly created OR closed_at changed) AND status is active/closed, OR status changed to active — app/models/trade_request.rb:349-350
3. [time] `SavingsCalculatorWorker` at closed_at + 5s; `CustomSavingsCalculatorWorker` at closed_at + 7s only if `company.show_custom_savings?`; `SpendAnalyticsWorker` at closed_at + 10s — app/models/trade_request.rb:351-354
4. [time] When a schedule extension shifts closed_at via `update_columns` (no callbacks), TradeSchedule queues `SavingsCalculatorWorker` at new end + 5s and `CustomSavingsCalculatorWorker` at new end + 2s itself — app/models/trade_schedule.rb:168-169
Gaps: `self.closed_at + 5.seconds` with closed_at nil (active stage never given closed_at) → NoMethodError in after_commit → untyped 500 — app/models/trade_request.rb:351
Cites: app/models/trade_request.rb:302, 342-356; app/models/trade_schedule.rb:168-169

### skip_callback — scheduled (recurring) template projects suppress stage callbacks
Stages belonging to a recurring template project, or being cloned, must not notify or schedule jobs.
Rules:
1. [config] `skip_callback` is true when `@skip_callback` was set (clone) OR the project `is_scheduled_template?` — app/models/trade_request.rb:273-275
2. [side-effect] When true, these commit callbacks do not run: send_push_notification_on_partial_request, send_notification_and_mail_trade_creation, add_event_group_details, schedule_auto_award_worker, update_latest_stage_time_on_eg — app/models/trade_request.rb:306-310
3. [side-effect] TradeSchedule applies the same rule (via its stage's project) to: increase_extra_closing_time_on_extension, set_count_for_dynamic_time_extension, notify_sellers_to_quote_best_offer, notify_planners_for_rfp_evaluation, schedules_handling_for_sealbid_extension, create_cost_break_down_tasks — app/models/trade_schedule.rb:42-44, 57-62
Gaps: savings, mark-closed, delete-draft-bids, slack and team-identifier callbacks are NOT in the skip list, so they still run for template stages — app/models/trade_request.rb:299-305
Cites: app/models/trade_request.rb:273-275, 306-310; app/models/trade_schedule.rb:42-62

### TradeRequest ref_id — stage reference number prefix and sequence
The human id of a stage, e.g. "RFQ-123".
Rules:
1. [calculation] Prefix: vendor assessment → "VA"; rfq → "RFQ"; rfi → "RFI"; rfp → "RFP"; otherwise buy → "RA", sell → "FA" — app/models/trade_request.rb:2527-2543
2. [calculation] Number = company `trade_requests_count` (counter cache) at create; for vendor assessment = count of the company's stages with the same `config.vendor_activity_type` — app/models/trade_request.rb:382-386; app/models/model_helpers/trade_request_model_helper.rb:1140-1145
3. [side-effect] `add_ref_id` sets ref_id after create unless a ref_id was given and the stage is not rfq_then_auction (rfq_then_auction always gets a fresh one) — app/models/trade_request.rb:374-380
4. [visibility] `show_reference_id` (config, default false) decides whether titles show "Title [ref_id]" and summaries show ref_id instead of uuid — app/models/trade_request.rb:455, 888-891; app/models/model_helpers/trade_request_model_helper.rb:1079-1081
Gaps: `display_title` / `title_ref` call `title.split` and `Company.find(audiences.first.audience_id)` (vendor onboarding v2) without guards → crash on nil title / no audience — app/models/trade_request.rb:889, 909
Cites: app/models/trade_request.rb:374-394, 2527-2543

### TradeRequest.user / user_id — stage owner is the project owner
Rules:
1. [permission] `user` and `user_id` are overridden: they return the project's (event_group's) user when the stage has a project, else the stage's own `user_id` column — app/models/trade_request.rb:3017-3023
2. [permission] So ownership checks such as `is_created_by_user?`, `allowed_to_cancel?` and `is_allowed_to_view_client_side?` (`self.user_id == user.id`) compare against the PROJECT owner, not the user who created the stage — app/models/model_helpers/trade_request_model_helper.rb:148-150, 444, 1502
3. [side-effect] After a project ownership change, the new project owner immediately counts as owner of every stage — app/models/trade_request.rb:3017-3023
Cites: app/models/trade_request.rb:3017-3023; app/models/model_helpers/trade_request_model_helper.rb:148-150, 444, 1502

### TradeRequest.bid_start_time / bid_end_time — which schedule decides the bidding window
The columns are overridden by readers that look at the stage's `trade_schedules` (excluding schedules with status void=5).
Rules:
1. [time] bid_start_time: rfqing → last `rfq` schedule start; auctioning → last `auction` start; offline_trading → last `offline_trade` start; RFI/RFP (current_status nil) → last `bidding_time` start — app/models/trade_request.rb:723-733
2. [time] bid_end_time: rfqing → last `rfq` end; auctioning → MAX end of `auction`, `dynamic_extra_time` and `sealbid_extension_time` schedules; offline → last `offline_trade` end; RFI/RFP → last `bidding_time` end — app/models/trade_request.rb:828-838
3. [time] So an auction's end includes dynamic time extensions and sealed-bid extensions; an RFQ's end does not consider them — app/models/trade_request.rb:830-832
4. [state] The `trade_schedules` association excludes schedules whose status = 5 (void) but includes in_active/withdrawn ones — app/models/trade_request.rb:111; app/models/trade_schedule.rb:30
5. [time] `has_started?` = bid_start_time < now; `upcoming?` = bid_start_time >= now — app/models/trade_request.rb:672-674, 1202-1204
6. [calculation] `duration` (hours) = (end − start)/3600, rounded to 1 decimal if < 1 h, else to integer — app/models/trade_request.rb:1140-1149
Cites: app/models/trade_request.rb:111, 723-733, 828-838, 1140-1149

### TradeRequest.extra_closing_time — evaluation / extra closing window
The window after bidding during which the buyer evaluates/awards ("evaluation time" for RFP).
Rules:
1. [time] extra_closing_time = end of the last ACTIVE schedule of type: rfqing → `rfq_extra_closing_time`; auctioning → `auction_extra_closing_time`; RFI/RFP → `extra_closing_time` — app/models/trade_request.rb:934-942
2. [time] `in_evaluation_time?` (alias of `is_auction_in_extra_closing_time?`) = extra_closing_time present AND extra_closing_time >= now AND max(bid_end_time, review-time end) <= now — app/models/trade_request.rb:954-968
3. [time] `evaluation_start_time` = bid_end_time; `evaluation_end_time` = extra_closing_time — app/models/model_helpers/trade_request_model_helper.rb:971-979
4. [calculation] RFP `add_evaluation_duration_config_for_rfp_stage` stores `config.evaluation_duration = extra_closing_time − bid_end_time` (seconds); if missing, `company.get_default_evaluation_duration(rfx_mode:)` is used — app/models/trade_request.rb:1388-1391, 1405-1411
5. [time] `get_send_for_evaluation_start_time` = start of the first (lowest id) extra_closing_time schedule — app/models/trade_request.rb:774-776
Gaps: `get_send_for_evaluation_start_time` calls `.first.start_time` with no guard → NoMethodError when no extra_closing_time schedule exists — app/models/trade_request.rb:775
Cites: app/models/trade_request.rb:934-968, 1388-1411

### Stage time predicates — is_running / live?, is_upcoming_or_running, is_expired?, in_submission_time?
Predicates controllers and serializers use for "is the event open".
Rules:
1. [time] `is_running` (alias `live?`) = (bid_start_time <= now AND bid_end_time >= now) OR during participant review time; both ends inclusive — app/models/trade_request.rb:1191-1195
2. [time] `is_upcoming_or_running` = (bid_end_time >= now OR during review time) AND status != closed — app/models/trade_request.rb:1197-1200
3. [time] `is_expired?` / `expired?` = now > closed_at (strict) — app/models/trade_request.rb:970-973
4. [time] `in_submission_time?` = bid_start_time present AND start <= now <= bid_end_time (review time NOT included) — app/models/trade_request.rb:975-977
5. [time] Scope `currently_running` = any schedule with start <= now AND end >= now; `currently_running_in_bidding_time` limits to rfq, auction, offline_trade, bidding_time, dynamic_extra_time, sealbid_extension_time; `for_live_page` = closed_at > now — app/models/trade_request.rb:192, 222-232
6. [time] `is_created_within_2_min?` = created_at >= now − 2 min — app/models/trade_request.rb:1927-1929
Gaps: `is_running`, `upcoming?`, `is_expired?` compare without nil guards — a stage with no matching schedule (nil bid_start_time / bid_end_time) or nil closed_at raises NoMethodError → untyped 500 wherever these are called — app/models/trade_request.rb:971, 1193, 1203
Cites: app/models/trade_request.rb:192-232, 970-977, 1191-1204

### Participant review time — best offer and cost-breakdown windows
A `response_review_time_for_participant` schedule with `meta_data.end_time_type` = `request_for_best_price` or `request_for_cost_break_down`.
Rules:
1. [time] The current review window is the LAST schedule of type response_review_time_for_participant; "during" = start <= now <= end (inclusive) — app/models/trade_request.rb:808-810, 1185-1189
2. [time] `in_best_offer_time?` / `in_cost_break_down_time?` require the matching end_time_type and start <= now <= end — app/models/trade_request.rb:979-991
3. [visibility] For a cost-breakdown window, review start/end/type are returned to everyone, even outside the window — app/models/trade_request.rb:780-782, 797-799, 814-816
4. [visibility] For a best-offer window, start/end/type are returned only during the window and only to buyer-company users or vendors listed in `config.allowed_participants_to_edit_in_bid_review_time` — app/models/trade_request.rb:783-788, 800-805, 817-825
5. [config] `allowed_participants_to_edit_in_bid_review_time` = all values of that config hash flattened (company ids), [] if absent — app/models/trade_request.rb:1206-1209
6. [side-effect] Changing `config.allowed_participants_to_edit_in_bid_review_time.request_for_best_price` on an existing stage re-queues `PrecomputationEngineWorker("precompute_bid")` in 10 s for each rankable bid of those vendors — app/models/trade_request.rb:292, 600-615
Cites: app/models/trade_request.rb:778-826, 979-991, 1185-1209

### TradeSchedule enums and constants — schedule types and statuses
Each stage has many schedules; type decides what the window means.
Rules:
1. [state] `schedule_type`: rfq=0, auction=1, rfq_extra_closing_time=2, auction_extra_closing_time=3, offline_trade=4, bidding_time=5, extra_closing_time=6, dynamic_extra_time=7, approval_pending_time=8, sealbid_extension_time=9, response_review_time_for_participant=10 — app/models/trade_schedule.rb:24-28
2. [state] `status`: in_active=0, active=1, closed=2, withdrawn=3, requested=4, void=5 — app/models/trade_schedule.rb:30
3. [state] BIDDING_TIME_SCHEDULE_TYPES = rfq, auction, offline_trade, bidding_time, dynamic_extra_time, sealbid_extension_time; EXTRA_CLOSING_SCHEDULE_TYPES = auction_extra_closing_time, rfq_extra_closing_time, extra_closing_time; VALID_RESPONSE_REVIEW_END_TIME_TYPES = request_for_best_price, request_for_cost_break_down — app/models/trade_schedule.rb:66-69
4. [state] Scope `for_bidding_time` = rfq, auction, bidding_time, dynamic_extra_time, sealbid_extension_time (offline_trade NOT included, unlike the constant) — app/models/trade_schedule.rb:35
5. [time] start_time, end_time, schedule_type, status are NOT NULL columns — app/models/trade_schedule.rb:6-10
6. [time] `get_approval_pending_schedule_end_time` = latest end of `approval_pending_time` schedules — app/models/trade_request.rb:2021-2023
Gaps: scope `is_closing_time` filters `trade_request_id` by schedule-type names instead of `schedule_type`, so it never matches — app/models/trade_schedule.rb:34
Cites: app/models/trade_schedule.rb:24-37, 66-71

### TradeSchedule — extension shifts the evaluation/review windows (shift_schedule_after_self_schedule)
When bidding time is extended, the windows after it are moved so they still start when bidding ends.
Rules:
1. [time] After ANY update commit of a non-closing schedule that is not withdrawn: rfq → shifts the `rfq_extra_closing_time`; bidding_time → `extra_closing_time`; any other type → `auction_extra_closing_time` (latest one not in_active/void/withdrawn) — app/models/trade_schedule.rb:52, 206-216
2. [time] If an active cost-breakdown review window exists, it is shifted first, then the extra closing time is shifted after it — app/models/trade_schedule.rb:218-222
3. [time] Shift: the moved schedule starts at this schedule's end and keeps its own duration, status set active — app/models/trade_schedule.rb:154-156
4. [time] Staggered (line-item closing) stages: the following schedule is NOT moved, only stage closed_at is set to its end — app/models/trade_schedule.rb:151-152, 158
5. [side-effect] Shift writes stage `closed_at` with update_columns (no stage callbacks), moves pending-task due dates for CBD/best-offer, queues savings workers and sets `closed_at` on all active/pending/requested bids — app/models/trade_schedule.rb:158-170
Gaps: when the review window is a BEST OFFER (not CBD), an update of the bidding schedule shifts the extra closing time to start right at bidding end, i.e. overlapping the best-offer window (the dynamic-extension path handles both types) — app/models/trade_schedule.rb:219-226 vs 196-199
Cites: app/models/trade_schedule.rb:150-171, 206-227

### TradeSchedule — dynamic time extension count and sealed-bid extension
Rules:
1. [side-effect] Creating a `dynamic_extra_time` schedule increments stage `misc.dynamic_time_extension_count` by 1 (update_columns) — app/models/trade_schedule.rb:48, 175-181
2. [time] Creating a `dynamic_extra_time` schedule shifts the review window (if any) after it and then the extra closing time after the review window; without a review window it shifts the extra closing time and moves counter-offer task due dates — app/models/trade_schedule.rb:190-204
3. [time] Saving a `sealbid_extension_time` schedule shifts the last active extra-closing schedule to start at its end — app/models/trade_schedule.rb:54, 183-188
4. [config] `get_dynamic_time_extension_count` reads `misc.dynamic_time_extension_count.to_i`; `last_n_minutes_for_time_extension` reads/writes `config.last_n_minutes_for_time_extension` — app/models/model_helpers/trade_request_model_helper.rb:1003-1014
5. [config] `is_dynamic_closing_time_allowed?` = `config.is_dynamic_closing_time_allowed == true`; `dynamic_closing_time_strategy` returned (and settable) only when allowed — app/models/model_helpers/trade_request_model_helper.rb:491-503
Cites: app/models/trade_schedule.rb:175-204; app/models/model_helpers/trade_request_model_helper.rb:491-503, 1003-1014

### TradeSchedule — best offer and cost-breakdown notifications
Rules:
1. [side-effect] Creating a best-offer window (end_time_type request_for_best_price) whose end is in the future: push + email `quote_best_offer`, `TradeRequestVendorStatusUpdateWorker` (best_offer_requested) in 2 s, and vendor reminder emails at 50% and 75% of the window — app/models/trade_schedule.rb:49, 107-113, 121-136
2. [side-effect] Changing a best-offer window's end_time: email `best_offer_ended` to buyer at the new end (immediately if already past) — app/models/trade_schedule.rb:50, 92-98
3. [side-effect] Changing a best-offer window's end_time to the future: push + email `best_offer_time_extension` and vendor-status refresh — app/models/trade_schedule.rb:51, 100-105
4. [side-effect] Creating a cost-breakdown window: pending tasks created for every active user of the allowed participant companies — app/models/trade_schedule.rb:55, 115-119; app/models/trade_request.rb:1211-1214
5. [side-effect] Start time change on an active RFP `extra_closing_time` schedule → `NotifyPlannersOnEvaluationStartWorker` at its start — app/models/trade_schedule.rb:53, 85-90
Cites: app/models/trade_schedule.rb:85-136

### TradeSchedule.change_auction_time — publishing after the planned start
Used by publish_auction (creation, approval completion) to re-base a schedule whose start already passed.
Rules:
1. [time] If schedule start_time > now it is unchanged — app/models/trade_schedule.rb:139
2. [time] Otherwise start = now (whole seconds) and end = now + ceil(original end − start), i.e. the original duration is preserved from publish time — app/models/trade_schedule.rb:140-147
3. [time] publish_auction applies it to the last bidding schedule and then to the last extra-closing schedule; stage closed_at = end of the extra-closing schedule if present, else end of bidding — app/controllers/concerns/trade_controller_helper.rb:4541-4551
4. [validation] Saving either shifted schedule fails → publish_auction returns 15 "Operation failed" (HTTP 422) — app/controllers/concerns/trade_controller_helper.rb:4544, 4549; config/locales/en-IN.yml:1144-1146
Gaps: both schedules are re-based to "now" independently, so a past extra-closing window is moved to start NOW (overlapping the re-based bidding window) instead of after it — app/controllers/concerns/trade_controller_helper.rb:4542, 4548
Cites: app/models/trade_schedule.rb:138-148; app/controllers/concerns/trade_controller_helper.rb:4541-4551

### TradeRound — knockout / dutch rounds
Rounds of a knockout or dutch auction (ordered by round_no).
Rules:
1. [state] `auction_strategy`: knockout=0, dutch=1; `status`: scheduled=0, active=1, executed=2, void=3 — app/models/trade_round.rb:27-28
2. [validation] An active round's `round_no` must be unique per (version, status, trade_request_id) → "Round no has already been taken" (Rails default message, unverified wording) — app/models/trade_round.rb:43-45
3. [time] `currently_running` = starts_at < now AND ends_at > now (both strict); `yet_to_start` = starts_at > now; `already_executed` = starts_at < now — app/models/trade_round.rb:30-38
4. [state] `participated_till_now_by(company_id)` = already-started rounds whose `round_participant_ids` contain the company — app/models/trade_round.rb:39-41
5. [state] Next round = active round with round_no + 1, highest version — app/models/trade_request.rb:735-737
6. [side-effect] On publish of an ACTIVE knockout/dutch stage, rounds are created for active non-broker audience companies; the first round's end schedules `TradeRoundSchedulerWorker` when the company has rfx_project enabled or the stage is dutch — app/controllers/concerns/trade_controller_helper.rb:4552-4573
Cites: app/models/trade_round.rb:27-45; app/models/trade_request.rb:141, 735-737

### Knockout / dutch strategy settings in misc.auction_strategy_config
Rules:
1. [config] Readers on `misc.auction_strategy_config`: bulk_price, latest_bulk_price, time_difference, price_difference, price_difference_percentage, end_price, is_auction_on_base_price, closing_mode — app/models/trade_request.rb:1635-1669
2. [config] `is_dutch_or_knockout_auction_on_total_amount?` = knockout/dutch AND `is_auction_on_base_price == false` (explicit false, nil does not count) — app/models/trade_request.rb:1639-1641
3. [config] Dutch closes on multiple vendors when `closing_mode == "multiple"` — app/models/trade_request.rb:1643-1645
4. [calculation] Fast-bidding bulk price: if template `configurations.dutch_knockout_bulk_price_formula` is set, it is evaluated with Dentaku over the submitted data (strings → float); else `data["bulk_price"]` — app/models/trade_request.rb:739-763
5. [validation] Formula variables missing from the data raise `ArgumentError "Missing required formula variables: …"` — app/models/trade_request.rb:751-755
6. [validation] Publishing knockout/dutch with rfx_project enabled returns 101 "You are not allowed to perform this action" (HTTP 422) when multi-product without fast bidding, or rfx_mode not auction/rfq_then_auction — app/controllers/concerns/trade_controller_helper.rb:4553-4556; config/locales/en-IN.yml:1258-1260
Gaps: `bulk_price`, `end_price`, etc. call `.with_indifferent_access` on `misc["auction_strategy_config"]` without a guard → NoMethodError when the key is absent; the ArgumentError and a nil `self.template` in the formula path are untyped 500s — app/models/trade_request.rb:740, 754, 1648-1669
Cites: app/models/trade_request.rb:739-763, 1635-1669

### Approval of a stage — handle_approval_completion_afterflow
Called by the approval workflow when a creation approval on a `requested` stage finishes.
Rules:
1. [state] Does nothing unless the stage status is `requested` — app/models/trade_request.rb:2055
2. [state] Approval completed → `publish_auction(self)` (active, or draft if routed to auction team; past schedules re-based to now), `save!`, creation notifications with `is_approved_event: true` — app/models/trade_request.rb:2057-2060
3. [state] Approval expired or withdrawn → status `withdrawn`, closed_at = now — app/models/trade_request.rb:2061-2064
4. [config] Approval rejected → by `config.handle_approval_rejection_as`: "set_withdrawn" → withdrawn + closed_at now; "revert_to_prev_approver" → stays `requested` (TODO in code); anything else → withdrawn + closed_at now — app/models/trade_request.rb:2065-2077
5. [state] Approval enum on the stage: approval_not_required=0, approval_pending=1, approval_completed=2, approval_expired=3, approval_rejected=4, approval_withdrawn=5 — app/models/approval_workflow/has_approval.rb:4
6. [side-effect] Approved stage notifications: push `new_trade_request` now; if start is in the future also `auction_notification` now, `auction_notification_scheduled` at start − 15 min and `new_trade_request` at start — app/models/trade_request.rb:1943-1951
Gaps: the error code returned by publish_auction (15/101/start-end price errors) is ignored for the save — `self.save!` and notifications run anyway, so a stage can go active after a failed publish step — app/models/trade_request.rb:2058-2060
Gaps: publish_auction reads `Current.user` (auction-team routing, round scheduler) → NoMethodError if approval completes without Current.user (unverified) — app/controllers/concerns/trade_controller_helper.rb:4537, 4572
Cites: app/models/trade_request.rb:2054-2080, 1943-1951

### Stage creation / publish notifications (send_notification_and_mail_trade_creation)
Runs after create commit, and again when a stage's status moves draft/requested → active.
Rules:
1. [state] Skipped while the project is draft (`event_group.reload.draft?`) — app/models/trade_request.rb:1954
2. [state] Skipped for RFQ stages that carry `misc.lot_no` (lot RFQs) — app/models/trade_request.rb:1955-1957
3. [side-effect] Draft rfq_then_auction stage with an active auction team in the company and an active project → only email `new_event_draft_to_buyer`; any other draft → nothing — app/models/trade_request.rb:1958-1963
4. [side-effect] Otherwise: push notifications, buyer emails, WhatsApp, vendor invite emails, manager notifications, and `RequisitionerNotificationWorker('rfq_floated')` if `company.send_requisitioner_notifications?` — app/models/trade_request.rb:1965-1974
5. [side-effect] Status saved from draft/requested → active (or the instance flag `@trade_request_status_changed_to_active`) → re-sends the creation notifications, regenerates team identifier and number_of_products — app/models/trade_request.rb:1935-1941
6. [side-effect] WhatsApp `new_trade_request` at start − 1 h (past times enqueue immediately); skipped for requested, basket auctions and RFI/RFP — app/models/trade_request.rb:2312-2320
Gaps: `self.event_group.reload` without nil guard → crash for a stage with no project — app/models/trade_request.rb:1954
Cites: app/models/trade_request.rb:1935-1975, 2312-2320

### Push notifications for a new stage (send_push_notification, managers)
Rules:
1. [side-effect] Skipped for `requested` stages and child multiline/basket lots — app/models/trade_request.rb:2114-2116
2. [time] Start in the future: `auction_notification` now ONLY when customised_audience is `everyone`; `auction_notification_scheduled` at start − 15 min only if that time is still in the future — app/models/trade_request.rb:2118-2121
3. [time] Start already passed: `new_trade_request` now — app/models/trade_request.rb:2122-2124
4. [config] `config.auction_create_notification_to_admins` truthy → admins get `auction_schedule_notification_to_admins` now + `auction_schedule_notification_in_advance_to_admins` at start − 15 min (future start), or `auction_create_notification_to_admins` now — app/models/trade_request.rb:2231-2240
5. [side-effect] Remaining quantity reduced while the stage is active and running → push `partial_request_bid` — app/models/trade_request.rb:2127-2131
Gaps: managers' "in advance" notification is scheduled even when start − 15 min is already past (no future check, unlike the vendor one) — app/models/trade_request.rb:2236 vs 2121
Cites: app/models/trade_request.rb:2113-2131, 2231-2240

### Buyer emails on stage creation (send_email_notification)
Rules:
1. [state] Only for non-RFI/RFP stages whose `misc.dummy_event_group` is true (single-stage "orders"), not for normal projects — app/models/trade_request.rb:2134-2135; app/models/model_helpers/trade_request_model_helper.rb:880-882
2. [config] Unless `config.send_event_mails_to_buyer == "disable_for_buyer"`: started → `new_event_live_to_buyer` now; not started → `new_event_scheduled_to_buyer` now + `new_event_live_to_buyer` at start; always `event_expiry_buyer` at closed_at — app/models/trade_request.rb:2138-2146
3. [config] Unless `config.send_event_expiry_reminder_to_buyer == "disable_for_buyer"`: `event_expiry_reminder_to_buyer` at start + round(0.8 × (end − start)) — app/models/trade_request.rb:2147-2149
Cites: app/models/trade_request.rb:2133-2150

### Vendor invite and reminder emails (send_web_bidding_mail)
Rules:
1. [state] Skipped for RFI/RFP — app/models/trade_request.rb:2332
2. [config] `config.send_web_bidding_mail == true` → if the company has a custom template for AUCTION_INVITE_EMAIL (auction-type) / RFQ_INVITE_EMAIL (others), per-recipient custom emails (only when `send_mail` app config is on); else `new_trade_sheet` email — app/models/trade_request.rb:2339-2347
3. [config] `config.send_event_expiry_reminder_to_vendor == true` → `event_expiry_reminder_to_vendor` at start + round(t × duration) for each t in `config.event_expiry_reminder_times` (default [0.8]), reminder_type "80_percent" — app/models/trade_request.rb:2349-2351, 2358-2371
4. [time] `config.send_event_live_email_to_vendor == true` AND (bid_start_time − created_at) >= 30 min → `new_event_live_to_vendor` at start − 2 min — app/models/trade_request.rb:2352-2355
5. [visibility] Recipients: restricted → visible audiences; except_for → company dealing-with companies minus hidden audiences; everyone → stage user's company's dealing-with companies; filtered by vendor statuses in custom config `allowed_statuses_for_vendor` (default active, invited); invited companies get invitation emails — app/models/trade_request.rb:1451-1470; app/models/company.rb:179-181
6. [time] Vendor email times use `recipient_email_time_zone` or company `get_timezone_for_vendor_email` (default Asia/Kolkata); format "%b %d, %Y %I:%M %p %Z" — app/models/trade_request.rb:843-864; app/models/company.rb:1075-1090
Gaps: for everyone/except_for audiences invitations are filtered with `Team.where(company_id: invitation_ids)` — invitation ids used as company ids, so invited vendors are likely dropped — app/models/trade_request.rb:1476-1480
Cites: app/models/trade_request.rb:2330-2371, 1451-1489

### Time-extension notifications (send_auction_time_increase_notification)
After-save commit; driven by transient flags set by the extend / last-minute-bid code paths.
Rules:
1. [side-effect] `send_buyer_increase_time_notification == true` on a BOQ stage → email `send_bidding_time_extension_mail` — app/models/trade_request.rb:2153-2155
2. [side-effect] Same flag on an auction-type, non-knockout/dutch, non-BOQ stage → email `submission_time_extended_to_vendor` and reminder rescheduling — app/models/trade_request.rb:2156-2159
3. [side-effect] Either flag set → response-submission pending-task due dates moved, RFI extension mails (RFI only), ALL bids of the stage get `end_time = bid_end_time` — app/models/trade_request.rb:2160-2167
4. [side-effect] Last-minute-bid flag → push `last_min_bid`; else buyer flag → push `buyer_time_increase` — app/models/trade_request.rb:2168-2173
5. [time] RFI extension: `incomplete` vendor mail at end − duration/4, `extension` mail now, evaluator reschedule mails — app/models/trade_request.rb:2415-2421; app/models/model_helpers/trade_request_model_helper.rb:991-996
Cites: app/models/trade_request.rb:2152-2174, 2415-2421

### Reminder rescheduling after an extension
Rules:
1. [time] Needs `previous_bid_end_time_for_extension`, start and end; skipped if old or new duration <= 0 — app/models/trade_request.rb:2177-2185
2. [time] Buyer reminder (unless `send_event_expiry_reminder_to_buyer == "disable_for_buyer"`): a new `event_expiry_reminder_to_buyer` at start + round(0.8 × new duration) only if the OLD reminder time has already passed and the new one is in the future — app/models/trade_request.rb:2189-2201
3. [time] Vendor reminders (only when `send_event_expiry_reminder_to_vendor == true`): same rule per t in `event_expiry_reminder_times` (default [0.8]) — app/models/trade_request.rb:2206-2229
4. [side-effect] Reschedule of an auction: `auction_reminder_24h_before` / `auction_reminder_30min_before` re-queued only when those times are still in the future, plus `auction_reschedule_to_vendor` / `_to_buyer` emails and pushes with old times; RFI reschedule sends RFI mails; RFQ/RFP reschedules send no emails — app/models/trade_request.rb:1977-1985, 2384-2413
Gaps: reminders whose old time is still in the future are NOT re-queued, so the old job fires at the pre-extension time (no cancellation in this code) — app/models/trade_request.rb:2193, 2216
Cites: app/models/trade_request.rb:2176-2229, 2384-2413

### Auction report snapshot and slack log on close
Rules:
1. [config] Status change while ACTIVE on an auction-type stage with `config.snapshot_auction_report_after_auction_end` and a company `auction_report_type` → `ReportSnapshotWorker` at bid_end_time + 3 s (format xlsx) — app/models/trade_request.rb:286, 3173-3175, 3236-3248
2. [side-effect] closed_at change on active/closed non-RFI/RFP stage → `AuctionCloseSlackWorker` at closed_at + 10 s (each stage of a multiline/basket lot), only when app config `should_log_auction_on_close_on_slack`; companies 3380, 7244, 9337, 9864 excluded — app/models/trade_request.rb:2289-2304
3. [side-effect] Closed non-RFI/RFP, non-knockout/dutch stage with company custom template AUCTION_RESULT_NOTIFICATION → result email to each not-selected vendor company (bids active/requested) — app/models/trade_request.rb:323-340, 2672-2674
Cites: app/models/trade_request.rb:323-340, 2289-2304, 3236-3248

### Price direction rules — is_price_increase_allowed? / is_price_decrease_allowed?
Used by bid validation to allow/refuse a revision that moves price the "wrong" way.
Rules:
1. [config] `is_price_increase_allowed?`: key `config.is_price_increase_allowed` ABSENT → true — app/models/model_helpers/trade_request_model_helper.rb:69-77
2. [time] Key present and now in participant review time on a non-forward (buy) event → false — app/models/model_helpers/trade_request_model_helper.rb:71-73
3. [config] Key present otherwise → config value OR forward auction OR RFQ (RFQs always allow increase) — app/models/model_helpers/trade_request_model_helper.rb:74
4. [config] `is_price_decrease_allowed?`: key absent → true; present and in review time on a forward auction → false; else config OR not-forward OR RFQ — app/models/model_helpers/trade_request_model_helper.rb:98-107
5. [config] Price-change approvals: `is_price_increase_approval_required?` / `is_price_decrease_approval_required?` read the config keys, default false; RFQ stages are created with both = false — app/models/model_helpers/trade_request_model_helper.rb:205-217; app/controllers/concerns/trade_controller_helper.rb:3576-3577
Cites: app/models/model_helpers/trade_request_model_helper.rb:69-107, 205-217

### Counter offers — price reversal and what a counter offer may change (part 1)
Rules:
1. [config] `price_reversal_allowed_in_counter_offer?`: auction-type sell → `is_price_decrease_allowed?`; auction-type buy → `is_price_increase_allowed?`; RFQ → `config.allow_price_reversal_in_counter_offer_in_rfq` (nil → true) — app/models/model_helpers/trade_request_model_helper.rb:90-96
2. [validation] `is_counter_offer_allowed?` refuses (false) when quantity changes and `participant_quantity` is not negotiable, when a lot-closing event's line status changes, or when price changes and `price` is not negotiable — app/models/model_helpers/trade_request_model_helper.rb:512-541
3. [config] Negotiable widgets = inline/global widgets with `configuration.is_negotiable` (not attachments); fallback price + participant_quantity — app/models/trade_request.rb:1846-1856
4. [config] `is_counter_offer_modification_applicable?` = `config.counter_offer_modification_enabled == true` AND in extra closing time — app/models/model_helpers/trade_request_model_helper.rb:1108-1110, 1165-1167
Gaps: `get_negotiable_widgets_key_attributes` ALWAYS appends "price" and "participant_quantity", so the quantity and price refusals in `is_counter_offer_allowed?` can never trigger — app/models/trade_request.rb:1841; app/models/model_helpers/trade_request_model_helper.rb:516, 526, 532
Cites: app/models/model_helpers/trade_request_model_helper.rb:90-96, 512-541; app/models/trade_request.rb:1836-1856

### Counter offers — bid tagging (normal, negotiated, best offer) (part 2)
Rules:
1. [calculation] A vendor's bids (active, selected, revised, requested) are tagged in placed_at order; the bid after one whose latest counter offer has resolution 1 or 4 is "negotiated_bid" — app/models/trade_request.rb:2731-2767
2. [calculation] A buyer-added bid after a normal bid with a counter offer is "pre_negotiated_bid", else it inherits the previous tag; a best-offer revision is "best_offer_bid" (or "pre_negotiated_best_offer_bid" with a counter offer) — app/models/trade_request.rb:2742-2760
3. [calculation] Rejected and revoked bids are removed from the tag list — app/models/trade_request.rb:2769
4. [calculation] Latest counter offer per bid = RANK by created_at desc, id desc over active additional requests of the counter-offer change types — app/models/trade_request.rb:2810-2830
Gaps: `get_bid_ids_with_types` compares ids with `>=` against `final_normal_bid_id`, which can be nil (vendor with only best-offer/negotiated tags) → ArgumentError — app/models/trade_request.rb:2787, 2791
Cites: app/models/trade_request.rb:2731-2830

### Quantity rules on a stage — over/under quantity, fixed quantity, partial closing
Rules:
1. [config] `is_over_quantity_allowed?` = config `is_over_quantity_allowed` if key present, default TRUE — app/models/model_helpers/trade_request_model_helper.rb:181-183
2. [config] `is_under_quantity_allowed?` default TRUE; `allow_fixed_quantity_for_bidding?` default false; `over_quantity_awarding_to_multiple_vendors` default false; `allow_over_quantity_bid_approval?` true unless config is exactly false — app/models/model_helpers/trade_request_model_helper.rb:177-191, 1104-1106
3. [config] `is_participant_approval_required_partial_closing` default false; `editable_partial_closing_widgets` default ["participant_quantity"] — app/models/model_helpers/trade_request_model_helper.rb:56-61, 505-510
4. [calculation] Stage `quantity` / `remaining_quantity` / `unit_value` read the FIRST trade product (unit_value nil for multi-product); `is_quantity_fulfilled?` = remaining <= 0 (nil → false) — app/models/trade_request.rb:866-874, 1151-1155, 1622-1625
5. [calculation] `is_multi_product`: alternate bidding → `misc.number_of_variants.to_i > 1`; else `number_of_products > 1` — app/models/trade_request.rb:1174-1179
6. [visibility] `show_quantity_requested?`: key nil → true unless dutch closing on multiple vendors; else config == true. `show_remaining_quantity_to_sellers` must be true — app/models/model_helpers/trade_request_model_helper.rb:164-173
Gaps: `partial_closed?` does `remaining_quantity > 0` with no nil guard (stage with no products) → NoMethodError — app/models/model_helpers/trade_request_model_helper.rb:15-17
Cites: app/models/model_helpers/trade_request_model_helper.rb:15-17, 164-191, 505-510; app/models/trade_request.rb:866-874, 1151-1179

### number_of_products — how line items are counted after save
Rules:
1. [calculation] RFP: number_of_products = project line items count; others = trade products count (reloaded) — app/models/trade_request.rb:2243-2249
2. [calculation] Alternate bidding: `misc.number_of_variants` = trade product count and number_of_products = distinct (product, buyer hub) pairs — app/models/trade_request.rb:2252-2254
3. [calculation] Book building: distinct (product, quality, buyer hub) — app/models/trade_request.rb:2255-2256
4. [side-effect] Written with update_columns after every save commit, and on publish — app/models/trade_request.rb:291, 1939, 2258
Cites: app/models/trade_request.rb:2242-2259

### Rank and best-price indicators — should_show_rank?, is_rank_required?, is_best_price_required?
Rules:
1. [visibility] `should_show_rank?` is false for RFQ stages — app/models/trade_request.rb:655
2. [visibility] Knockout, or dutch with `config.rfx_project_enabled`: rank shown only to the buyer company (Current.allowed_companies includes stage company), never to vendors — app/models/trade_request.rb:658-662
3. [visibility] Otherwise rank shown when auction_config is rank / rank_and_price, or `other_auction_indicators_config.rank == true`, or (non-sheet layout) traffic light on rank — app/models/trade_request.rb:656, 665-669
4. [calculation] `is_rank_required?` also true for traffic light on rank — app/models/trade_request.rb:677-684
5. [visibility] `is_best_price_required?`: `other_auction_indicators_config.best_price == true`; or v1 traffic light on price; or `config.show_best_price_in_all_event` + line-item closing + rank strategy; or price / rank_and_price AND auction-type — app/models/trade_request.rb:686-707
6. [visibility] Best-price widget hidden for participants when the line+rank rule applies without an explicit best_price indicator, or when `show_best_ranking_widget_to_participants` — app/models/trade_request.rb:709-721
Cites: app/models/trade_request.rb:649-721

### Default and optional auction indicators (other_auction_indicators_config)
Rules:
1. [config] Default indicators: [best_ranking_widget if that inline widget exists] + rank strategy with line-item closing → rank, best_price_only_on_gross_total; rank → rank; price → best_price_only_on_gross_total, best_price; traffic light → traffic_light_color, best_price_only_on_gross_total — app/models/model_helpers/trade_request_model_helper.rb:698-707
2. [config] Optional indicators: rank, best_price, best_price_only_on_gross_total (+ loading_factor if enabled) minus the defaults; dutch and RFI/RFP → none (dutch with rfx_project → [rank]); knockout → [rank] — app/models/model_helpers/trade_request_model_helper.rb:709-726
3. [config] `other_auction_indicators_config` = `config.other_auction_indicators_config` with every optional indicator missing filled as false — app/models/model_helpers/trade_request_model_helper.rb:745-760
4. [visibility] Indicator gating by revisions: buyer company always sees; vendor sees when `num_revisions_req_to_show_indicator` (default 0) is 0, or revisions >= N and the indicator is a default one; 0 / nil revisions → hidden — app/models/model_helpers/trade_request_model_helper.rb:63-67, 776-800
5. [config] Traffic light zones: `traffic_zones_to_show_best_price_indicator`, `traffic_zones_to_show_rank_indicator` default [] — app/models/model_helpers/trade_request_model_helper.rb:768-774
Cites: app/models/model_helpers/trade_request_model_helper.rb:698-800

### Ranking widget — which value vendors are ranked on (line vs lot, buyer rank)
Rules:
1. [calculation] Stages created on/before 2024-05-08 12:02 (epoch 1715149920) rank on "price" for both line and lot — app/models/trade_request.rb:2587-2591, 2633-2636
2. [config] `buyer_ranking_widget*` keys take priority over `ranking_widget*`; if only the generic key exists it is used for line when it is an inline widget and for lot when it is a global widget — app/models/trade_request.rb:2596-2613
3. [config] Defaults: line ranking widget "price", lot ranking widget "gross_total" — app/models/trade_request.rb:2614-2616
4. [visibility] `get_ranking_key`: a buyer-category user sees `buyer_rank` when any buyer ranking key is configured, everyone else `rank` — app/models/model_helpers/trade_request_model_helper.rb:1241-1251
5. [config] `ranking_widget_line` (legacy) = config ranking_widget_line || ranking_widget, falling back to "price" if not an inline widget — app/models/trade_request.rb:1891-1895
6. [config] Price-cap validation target: `config.validation_widgets_configuration[key].target_column`, default "price"; net-price formula falls back to price (+ price×gst/100 + freight_charges when those widgets exist) — app/models/model_helpers/trade_request_model_helper.rb:608-638
Cites: app/models/trade_request.rb:2582-2636; app/models/model_helpers/trade_request_model_helper.rb:802-844

### Event masking, closed-envelope bidding and locked bids (event_masking_enabled?)
Hides bids/bidders from buyer-side users during bidding.
Rules:
1. [visibility] Auction-team users are never masked — app/models/model_helpers/trade_request_model_helper.rb:259
2. [visibility] Bids locked for the user → masked — app/models/model_helpers/trade_request_model_helper.rb:260
3. [config] Closed envelope (`closed_envelope_bidding_for_auctions` / `_for_rfqs`): masked for every buyer-company user (super admins too) while upcoming or running — app/models/model_helpers/trade_request_model_helper.rb:246-253, 262-263
4. [config] Masking (`event_masking_on_auctions` / `event_masking_on_rfqs`): masked for buyer-company users while upcoming/running, except super admins, users shared as owner, and during participant review time — app/models/model_helpers/trade_request_model_helper.rb:236-243, 264-267
5. [visibility] `bids_locked_for_user?`: only buyer-company users, not RFI/RFP, only when `config.lock_bid_by_default`; unlocked if ExtendedField `bid_visibility` contains "everyone" or the user id, locked if that field is missing — app/models/model_helpers/trade_request_model_helper.rb:273-284, 1487-1489
6. [visibility] `should_show_placed_bids_stats_only?`: running + buyer company + `show_bidding_stats_in_masked_events` + masked → true; else running + `config.show_placed_bids_stats` key + not super admin → that value — app/models/model_helpers/trade_request_model_helper.rb:290-305
7. [visibility] `show_suspicious_bids?` needs `is_suspicious_bid_indicator_enabled == true`, vendor names not masked for Current.user, and (non super admin) `read_only_mode_enabled` off — app/models/model_helpers/trade_request_model_helper.rb:81-88
Cites: app/models/model_helpers/trade_request_model_helper.rb:236-305

### Vendor-name masking (mask_participant_name?)
Rules:
1. [config] `is_vendor_masking_allowed_for_everyone` → masking applies to all buyer users when `config.is_vendor_masking_enabled`; `…_except_super_admin` → same but not for super admins; neither → never — app/models/model_helpers/trade_request_model_helper.rb:924-930, 1223-1230
2. [visibility] `mask_participant_name?(user)` = masking enabled for user AND stage upcoming/running AND user in buyer company — app/models/model_helpers/trade_request_model_helper.rb:967-969
3. [permission] `is_user_allowed_to_mask_vendor?` = upcoming/running AND not dutch AND buyer company AND masking allowed AND user is super admin — app/models/model_helpers/trade_request_model_helper.rb:1236-1239
4. [config] `config.is_show_user_name == false` hides user names (default shown); RFQ stages are created with it false — app/models/model_helpers/trade_request_model_helper.rb:198-203; app/controllers/concerns/trade_controller_helper.rb:3574
5. [config] `is_surrogate_bidding_in_masked_events_allowed` default false; `is_buyer_not_allowed_to_add_surrogate_bid` default false; `is_allowed_to_add_surrogate_bid_post_expiry` default false — app/models/model_helpers/trade_request_model_helper.rb:916-922, 1375-1377
Cites: app/models/model_helpers/trade_request_model_helper.rb:924-969, 1223-1239

### Vendor access to a stage — is_allowed_to_view? (vendor side)
Checked after the buyer-side check returns nothing.
Rules:
1. [permission] Vendor needs a BuyerSellerCompanyMapping to the stage company in an allowed status (custom config `allowed_statuses_for_vendor`, default active/invited) or `blacklisted` (to keep history) — app/models/model_helpers/trade_request_model_helper.rb:344-350, 387-395; app/models/company.rb:179-181
2. [state] Draft stage → vendor denied — app/models/model_helpers/trade_request_model_helper.rb:352-354
3. [permission] Open tender → allowed — app/models/model_helpers/trade_request_model_helper.rb:355-357
4. [permission] everyone → allowed if super admin, stage team_identifier nil, or user's company-mapping trade identifiers overlap (plus product recommendation match when `config.vendor_recommendation_on_product`) — app/models/model_helpers/trade_request_model_helper.rb:358-361, 454-468
5. [permission] except_for → allowed unless the vendor's workspace is a hidden audience; restricted → allowed only if a visible audience — app/models/model_helpers/trade_request_model_helper.rb:362-369
6. [permission] Vendor onboarding stages: mapping in VALID_STATUSES_FOR_VENDOR_ONBOARDING; anything else → nil (denied) — app/models/model_helpers/trade_request_model_helper.rb:374-383
Cites: app/models/model_helpers/trade_request_model_helper.rb:336-395, 454-476

### Buyer access to a stage — is_allowed_to_view_client_side?
Rules:
1. [permission] Procol employee: allowed only when CSM for the stage company AND Current.workspace is that company; otherwise denied — app/models/model_helpers/trade_request_model_helper.rb:402-410
2. [permission] User must belong to the stage company workspace; vendor onboarding v2/v3 → allowed — app/models/model_helpers/trade_request_model_helper.rb:412-418
3. [permission] Auction-team members are denied RFI, RFP and RFQ stages — app/models/model_helpers/trade_request_model_helper.rb:420-423
4. [permission] Shared via an active access list (user or one of the user's active teams) → allowed — app/models/model_helpers/trade_request_model_helper.rb:425-428, 1257-1264
5. [permission] RFI/RFP: allowed when stage `trade_identifiers` overlap the user's (planning team: only "u<user_id>") or the user is an approver — app/models/model_helpers/trade_request_model_helper.rb:430-441
6. [permission] Else allowed if team identifier match, approver, project owner (`user_id`), or the project chat is assigned to the user and the user is not planning-team gated — app/models/model_helpers/trade_request_model_helper.rb:443-446
Gaps: `Current.workspace.id` without a guard → NoMethodError for a Procol employee when no workspace is set (e.g. background jobs) — app/models/model_helpers/trade_request_model_helper.rb:404
Cites: app/models/model_helpers/trade_request_model_helper.rb:398-451

### Audience users of a stage (audiences_for_trade) and team identifiers
Rules:
1. [visibility] restricted → companies in visible audiences; except_for → company dealing-with companies minus hidden audiences; everyone → all dealing-with companies; only active companies and active user mappings — app/models/trade_request.rb:1413-1437
2. [visibility] When the stage has team identifiers, users must have a mapping trade_identifier overlapping them; given bidders are excluded — app/models/trade_request.rb:1420-1421, 1428-1429, 1435-1436
3. [calculation] Team identifiers: RFI → none; RFP → from form line-item categories (+ ancestors) and stage buyer hub; others → per (product category ancestors, buyer hub, zone) combinations of each trade product — app/models/trade_request.rb:1543-1596
4. [permission] Scopes `for_only_teams` / `for_own_and_teams` treat a NULL team_identifier as visible to everyone; approvers match via `misc.approver_identifiers` — app/models/trade_request.rb:183-190, 240-247
5. [permission] Valid bidding teams for a user: unrestricted team → yes; category-only / hub-only → that must match; both restricted → both must match — app/models/trade_request.rb:2865-2893
Gaps: `generate_identifier_hash` returns early only when both category ids and buyer hub are nil; a buyer hub with nil category ids reaches `all_category_ids.each` → NoMethodError inside after_save `update_team_identifier` → whole save 500s — app/models/trade_request.rb:1582-1589, 1568-1570
Cites: app/models/trade_request.rb:1413-1440, 1543-1596, 2865-2893

### Stage action guards — cancel, audience edits, reject, reopen, force close
Predicates controllers call before an action.
Rules:
1. [permission] `allowed_to_cancel?(user)`: only draft stages; project draft → anyone allowed; else only auction-type and only super admin, project owner or auction-team member — app/models/model_helpers/trade_request_model_helper.rb:1495-1505
2. [config] `is_audience_modification_allowed?(user)`: config `is_user_allowed_to_modify_audience` nil → true; else its value OR super admin — app/models/model_helpers/trade_request_model_helper.rb:936-941
3. [time] `is_reject_bid_disabled?` = `config.disable_reject_bid_in_bidding_time` AND stage running — app/models/model_helpers/trade_request_model_helper.rb:908-910
4. [config] `is_revoke_bid_allowed?` default true (`is_allowed_to_revoke_bid`); reopen flags read raw (nil when unset): `is_super_admin_allowed_to_reopen_event`, `is_user_allowed_to_reopen_event`, `is_super_admin_allowed_to_reopen_evaluation`, `allow_event_evaluation_reopen_for_everyone` — app/models/model_helpers/trade_request_model_helper.rb:331-333, 1016-1030
5. [time] `allow_trade_force_close?` = company custom config `trade_force_close` AND (in submission, CBD, best-offer or evaluation time) — app/models/model_helpers/trade_request_model_helper.rb:1621-1624
6. [state] `is_rfq_changes_restricted?`: RFQ with rfx_project enabled is locked once an active/closed rfq_then_auction child exists, or the project has a requested/selected proposal for the same lot (or no lot) — app/models/model_helpers/trade_request_model_helper.rb:1430-1444
7. [permission] Activity log: needs trade read_record permission and view access; CSM of the company or buyer-company users only — app/models/trade_request.rb:2545-2553
Cites: app/models/model_helpers/trade_request_model_helper.rb:908-941, 1016-1030, 1430-1444, 1495-1505, 1621-1624

### RFP send-to-evaluation and re-evaluation guards
Rules:
1. [permission] `is_send_to_evaluation_enabled_for_user?` = RFP AND `config.send_rfp_to_evaluation_manually` AND user has a client company AND authorized modes include purchase or customer_success — app/models/model_helpers/trade_request_model_helper.rb:1169-1174
2. [state] `can_send_to_evaluation_be_triggered?` = enabled for user AND stage expired (now > closed_at) AND status not in_active AND no extra_closing_time yet; exposed as `show_send_to_evaluation_button` — app/models/model_helpers/trade_request_model_helper.rb:1184-1189; app/models/trade_request.rb:1382-1386
3. [permission] `allowed_to_extend_evaluation_time?` is false only for a manual-send RFP when the client user lacks purchase/customer_success AND no extra_closing_time exists — app/models/model_helpers/trade_request_model_helper.rb:1176-1182
4. [permission] Re-evaluation button: shown for RFP to non planner-gated users; disabled if withdrawn, not in evaluation time, or user is neither super admin nor project owner — app/models/model_helpers/trade_request_model_helper.rb:1507-1521
5. [time] RFI/RFP evaluation reminder: end − 1 day if evaluation lasts >= 2 days, else end − duration/4 — app/models/model_helpers/trade_request_model_helper.rb:982-988
6. [time] `evaluation_status_hash`: {} while upcoming/running; completed if closed, RFQ converted to auction, or RFI/RFP evaluated by the user; else overdue if now > closed_at, pending otherwise — app/models/trade_request.rb:396-419
Cites: app/models/model_helpers/trade_request_model_helper.rb:982-988, 1169-1189, 1507-1521; app/models/trade_request.rb:396-419

### RFP evaluation completeness — is_evaluated? and evaluation modes
Rules:
1. [config] `rfp_evaluation_mode`: "lot_based" → lot evaluation; "line_item_based" or `is_linewise_rfp_evaluation_allowed` → line-wise; `is_both_evaluation_enabled` lets both coexist — app/models/model_helpers/trade_request_model_helper.rb:1454-1485
2. [state] RFI is evaluated when any active evaluation exists — app/models/model_helpers/trade_request_model_helper.rb:1281-1282
3. [state] RFP lot-level: evaluated when the number of project precomputed entries with `evaluation_score` equals the number of active template responses (and > 0) — app/models/model_helpers/trade_request_model_helper.rb:1286-1294
4. [state] RFP line-level: every active project line item has an `evaluation_score` in its precomputed data and none of its scores is `reevaluation_requested` — app/models/model_helpers/trade_request_model_helper.rb:1296-1330
5. [config] `update_only_creator_scores?` = `config.update_only_creator_scores_in_evaluation` AND bid_end_time < now; then scoring only refreshes `buyer_rank` (and line `best_price`) — app/models/model_helpers/trade_request_model_helper.rb:1362-1373; app/models/trade_request.rb:1987-2004
6. [config] `config.evaluation_score_label_mapping` default []; `section_wise_scoring_enabled` default false — app/models/model_helpers/trade_request_model_helper.rb:912-914, 1475-1477
Cites: app/models/model_helpers/trade_request_model_helper.rb:1280-1373, 1454-1485

### Sealed bids and English auction flags
Rules:
1. [state] `sealbid_allowed` is false for English auctions, when the stage is not running, or closed; else `config.is_sealbid_allowed` — app/models/model_helpers/trade_request_model_helper.rb:1043-1048
2. [state] `sealbid_enabled` = `config.is_sealbid_enabled` AND not closed AND running; the setter only writes when `sealbid_allowed` — app/models/model_helpers/trade_request_model_helper.rb:1056-1066
3. [config] `is_english_auction?` = `config.is_english_auction_enabled` (default false); `widget_for_english_auction` default "price"; `is_english_auction_allowed` default false — app/models/model_helpers/trade_request_model_helper.rb:884-897
4. [config] `read_only_mode_allowed` / `read_only_mode_enabled` default false — app/models/model_helpers/trade_request_model_helper.rb:899-906
5. [config] `is_vendor_allowed_to_view_bid_count?` default TRUE; `get_bid_count` = `misc.precomputed_bids_data.bids_count.to_i` — app/models/model_helpers/trade_request_model_helper.rb:857-859, 1388-1391
Cites: app/models/model_helpers/trade_request_model_helper.rb:857-906, 1043-1066, 1388-1391

### TradeProduct — line item enums, required associations and callbacks
One `TradeProduct` per line item of a stage (`trade_request.trade_products` excludes void).
Rules:
1. [state] `status`: in_active=0, active=1, closed=2, void=3, cancelled=4 (NOT NULL); `current_status`: rfq=0, auction=1 (default auction) — app/models/trade_product.rb:77, 83, 10, 25
2. [state] `unit_type` enum 0..44 (weight=0 default … nos=44), deprecated in favour of `unit` — app/models/trade_product.rb:78-82, 27
3. [validation] `buyer_hub` and `unit` are required associations (save fails "must exist" without them); product is optional — app/models/trade_product.rb:60-66
4. [config] MAX_ATTACHMENT_COUNT = 15 — app/models/trade_product.rb:55
5. [side-effect] `before_save :save_formula_values` evaluates the stage's inline `creator` formula widgets into `other_details`; undefined results are only logged — app/models/trade_product.rb:93, 828-835
6. [side-effect] After save: product origins copied from product_options (if blank) and cache `product_data_<trade_request_id>` cleared — app/models/trade_product.rb:92, 814-825
7. [calculation] `unit_value` = meta_data.symbol || meta_data.unit_value || unit.symbol — app/models/trade_product.rb:114-116
Gaps: `save_formula_values` calls `trade_request.get_formula_widget_key_attrs_vs_formula`, which does `widgets[line_type].each` with no nil guard → any line-item save on a stage with nil widgets raises → 500 — app/models/trade_product.rb:829; app/models/trade_request.rb:1308
Gaps: `belongs_to :user` is declared twice (closed_by, then created_by_user_id); the second wins, so `user` is the creator — app/models/trade_product.rb:63-64
Cites: app/models/trade_product.rb:53-96, 814-835

### TradeProduct price limits — ceiling, floor and minimum quantity storage
Where the per-line price caps and min quantity live and how a vendor's value is resolved.
Rules:
1. [config] Stored in `validations` JSON: `default.{ceil_price, floor_price, floor_quantity, tick_size, tick_size_percentage}` and per vendor `vendor_validations[<company_id>].{ceil_price, floor_price}` — app/models/trade_product.rb:158-168, 228-237
2. [calculation] `ceil_price_for_user`: if the raw `ceil_price` COLUMN is set it is returned as is (no vendor override); else vendor-specific ceil > default ceil > nil — app/models/trade_product.rb:158-168, 182-184
3. [calculation] `floor_price_for_user`: vendor-specific floor > default floor > nil; the `floor_price` column is never consulted — app/models/trade_product.rb:228-237
4. [calculation] `floor_quantity_for_user` (minimum quantity): column if set, else `validations.default.floor_quantity`; no vendor-specific value — app/models/trade_product.rb:213-225
5. [calculation] The plain readers `ceil_price`, `floor_price`, `floor_quantity` are overridden to return `validations.default.*` as float rounded to 2 decimals — app/models/trade_product.rb:533-549
Gaps: ceil uses the column but floor ignores it — an event with a floor in the column only is unchecked, and a ceil column hides vendor-specific ceilings — app/models/trade_product.rb:159, 229-237
Cites: app/models/trade_product.rb:158-253, 533-549

### TradeProduct tick size (minimum decrement) and English auction caps
Rules:
1. [calculation] `tick_size` = `validations.default.tick_size.to_f.round(2)`; `tick_size_percentage` same rounding; nil when not set — app/models/trade_product.rb:508-518
2. [config] Stage-level fallback when a product has no tick size: `config.price_change_slab`; multi-currency base currency carries `global_tick_size` — app/models/model_helpers/trade_request_model_helper.rb:193-196; app/models/trade_requests/currency_configuration.rb:20, 40-43
3. [calculation] English auction ceiling for a vendor that has NOT bid on the line: best price (buy = min, sell = max of `meta_data.prices_hash`) minus tick_size (or minus tick% × price) when any bid exists; a vendor that already bid keeps the configured ceiling — app/models/trade_product.rb:170-180, 596-602
4. [calculation] English auction floor: same with + tick — app/models/trade_product.rb:239-251
5. [calculation] English tick for a vendor: |vendor's price − best| + tick (percentage: + tick% × best, ceil to 2 dp) — app/models/trade_product.rb:187-197; app/controllers/concerns/trade_template_helper.rb:5479-5493
6. [calculation] Non-English percentage tick value = previous value of the validation target widget × tick% / 100, ceil to 2 dp — app/controllers/concerns/trade_template_helper.rb:5506-5513
Gaps: rounding to 2 decimals turns a tick size below 0.005 into 0.0 (still "present"), i.e. no minimum decrement — app/models/trade_product.rb:510
Cites: app/models/trade_product.rb:170-251, 508-518, 596-602

### TradeProduct best amounts, loading factor and last purchase price
Rules:
1. [calculation] `total_amount_from_selected_bid_trade_products` = Σ price × quantity of selected bid lines — app/models/trade_product.rb:713-719
2. [calculation] `get_possible_best_bid_amount`: walks active bid lines in ascending price, taking quantity until the line quantity is covered — app/models/trade_product.rb:695-711
3. [calculation] `get_best_initial_amount`: first bid line per vendor, sorted by price (reversed for sell), filling quantity (selected quantity for realised savings, line quantity otherwise) — app/models/trade_product.rb:721-740
4. [calculation] Loading factor of a line = best participant best_price (buy min / sell max) × quantity; 0 if no scores — app/models/trade_product.rb:788-793
5. [config] Loading factor applies when `config.loading_factor_enabled` AND (baseline cost adjustment enabled OR auction-type); it is added to a vendor's ranking score for lines it regretted or is TNA on (unless `misc.allow_tna_vendors_to_bid`), or for BOQ, lines it did not bid on — app/models/model_helpers/trade_request_model_helper.rb:1560-1619
6. [calculation] Last purchase price: selected bid lines on active/closed stages for the same product+unit (+ buyer hub if location-wise) created in the last 6 months, latest per group — app/models/trade_product.rb:765-786
Gaps: `btps.reverse if sell?` discards its result, so sell (forward) stages use ascending (worst) prices for the unrealised best amount — app/models/trade_product.rb:700
Cites: app/models/trade_product.rb:695-793; app/models/model_helpers/trade_request_model_helper.rb:1560-1619

### Currency configuration (TradeRequests::CurrencyConfiguration) — shape and modes (part 1)
Built from `misc.currency_configuration` of a stage; nil when that key is absent.
Rules:
1. [config] Shape: `base_currency {code, global_tick_size}`, `allowed_currencies {code → {name, symbol, code, rate_in_base, default_precision, adjusted_precision, number_system, currency_label}}`, `currency_mode` — app/models/trade_requests/currency_configuration.rb:9-18, 37-54; app/models/trade_request.rb:1682-1686
2. [config] `currency_mode == "base_currency"` → base-currency flow; `"multiple_currencies"` → multi-currency event — app/models/trade_request.rb:2638-2644; app/models/model_helpers/trade_request_model_helper.rb:565-567
3. [config] Missing `currency_label` defaults to the field named by `config.default_currency_label_type` (default "symbol") — app/models/trade_requests/currency_configuration.rb:48; app/models/model_helpers/trade_request_model_helper.rb:1196-1198
4. [config] Without a currency config the stage symbol is `config.default_currency_symbol`; DEFAULT_CURRENCY_SYMBOL is ₹ — app/models/trade_request.rb:1535-1537; app/models/trade_requests/currency_configuration.rb:34
Gaps: `base_currency` stays nil if the config lacks it → `get_base_currency` / `get_hash` raise NoMethodError — app/models/trade_requests/currency_configuration.rb:39-44, 58, 64
Cites: app/models/trade_requests/currency_configuration.rb:1-73; app/models/trade_request.rb:1682-1690

### Currency configuration — vendor currency, precision and conversion (part 2)
Rules:
1. [calculation] A vendor's preferred currency = `misc.currency_preferences[company_id].code` looked up in allowed currencies; nil if no preference — app/models/trade_requests/currency_configuration.rb:76-81
2. [calculation] Precision = `adjusted_precision || default_precision`, converted to the base unit by Utils.get_precision_for_base_unit — app/models/trade_requests/currency_configuration.rb:86-94
3. [calculation] Gross total in original currency: precomputed base amount converted with the vendor's preferred currency (rate forced to 1 in base_currency mode), rounded to adjusted precision — app/models/trade_request.rb:1703-1714
4. [calculation] Counter-offer price comparison uses the base currency's adjusted precision for the line's unit — app/models/model_helpers/trade_request_model_helper.rb:521-525
Gaps: `get_base_currency` / `get_adjusted_precision` use T.must on the lookup → error when the code is not in allowed_currencies; original-currency gross total crashes when currency_configuration is nil or the vendor has no preference — app/models/trade_requests/currency_configuration.rb:58, 93; app/models/trade_request.rb:1708-1710
Cites: app/models/trade_requests/currency_configuration.rb:75-94; app/models/trade_request.rb:1703-1714

### Savings configuration (SavingsConfiguration) — structure and reading
Stage-level in `misc.savings_configuration` (+ list in `misc.custom_savings_configuration`); line-level in trade product `meta_data`.
Rules:
1. [config] Fields: `savings_comparison_on` ("lot_based" / "line_item_based"), `strategy_options` {key → label}, `reference_prices` [{reference_on_key_attribute, reference_strategy_key, value}] — app/models/savings_configuration.rb:10-19, 232-243
2. [config] Default strategy options: budget "Budget", historical_price "Historical Savings", existing_proposal "Existing Proposal", last_purchase_price "Last Purchase Price", default "Default"; awarded-amount strategies: budget, historical_price, last_purchase_price — app/models/savings_configuration.rb:55-63
3. [calculation] A reference price is per-unit when `reference_on_key_attribute == "price"`, else an amount — app/models/savings_configuration.rb:44-46
4. [calculation] On build, reference prices without a value are dropped; for lot_based, strategy options without a reference price are removed — app/models/savings_configuration.rb:87-90, 124
5. [calculation] Lot best amount: lot-closing stage → default option uses best amount for default savings, others the lot best price; line-closing stage → Σ best line price × line quantity (lines with no price skipped) — app/models/savings_configuration.rb:190-207
6. [config] Legacy flags: `show_default_savings` default true; `show_autogenerated_aggregate_lot_savings` custom config default true; `last_purchase_price_savings_configuration_enabled` default "off" ("product_and_location_wise_lpp" = by location) — app/models/model_helpers/trade_request_model_helper.rb:672-675, 998-1000, 1450-1452; app/models/trade_request.rb:2722-2728
Cites: app/models/savings_configuration.rb:1-243

### Custom savings — realised vs unrealised
Rules:
1. [calculation] Custom options: realised and unrealised, both lot_based — app/models/savings_configuration.rb:73-76
2. [state] Realised is valid only when at least one bid is selected; unrealised only when no bid is selected — app/models/savings_configuration.rb:245-261
3. [calculation] Realised reference = initial best amount using SELECTED quantity; unrealised = using full line quantity; bid lines counted exclude rejected, draft, in_active, revoke, pending, anomaly_detected — app/models/savings_configuration.rb:341-356
4. [calculation] Realised best amount = Σ selected bid lines price × qty; unrealised = possible best bid amount — app/models/savings_configuration.rb:168-188
5. [side-effect] Custom savings recomputed by `CustomSavingsCalculatorWorker` when `company.show_custom_savings?` — app/models/trade_request.rb:353
Gaps: `update_reference_price` has a no-op `reference_price unless …` line, so EVERY reference price is overwritten with the value for the given key — app/models/savings_configuration.rb:210-216
Gaps: `get_custom_valid_keys` comparison filter (`false if comparison_on != …`) is a no-op; the "unrealised only after expiry" comment is not enforced — app/models/savings_configuration.rb:248, 253-255
Cites: app/models/savings_configuration.rb:73-76, 168-188, 210-356

### Legacy savings formulas and estimated purchase savings
Rules:
1. [calculation] Deprecated `get_reference_price_formulas_hash`: savings key = bulk_price (knockout/dutch on total), gross_total (lot comparison), else `line_item_savings_on`; buy: % = (reference − key)/reference × 100, amount = reference − key; sell: reversed — app/models/model_helpers/trade_request_model_helper.rb:645-666
2. [calculation] `estimated_purchase_savings` (closed stages only): mean landed cost of selected bids; average of active/selected bids within 10% of that mean; savings = (average − selected mean) × selected quantity; <= 0 → 0 — app/models/trade_request.rb:1325-1356
3. [calculation] `total_purchase_amount` = Σ landed amount of selected bids — app/models/trade_request.rb:1216-1226
4. [calculation] `vendor_savings_price_change_key`: buy → realised_price_drop, sell → realised_price_increase — app/models/trade_request.rb:2710-2712
5. [calculation] BOQ tab summary: baseline_1..3 = Σ quantity × other_details.baseline_N ("" → 0) over each tab/section line range — app/models/trade_request.rb:2437-2467
Cites: app/models/model_helpers/trade_request_model_helper.rb:645-695; app/models/trade_request.rb:1216-1226, 1325-1356, 2437-2467

### Terms and conditions — mandatory mode and acceptance popup
Rules:
1. [config] `config.is_tnc_mandatory == true` makes every clause and attachment effectively "required" regardless of its own mode; otherwise item mode or "none" — app/models/trade_request.rb:999-1003
2. [calculation] Stored clauses may be plain text (legacy) or JSON; the `terms_and_conditions` reader always returns plain text; legacy items get id "legacy_<trade_id>_<idx>" — app/models/concerns/terms_and_conditions_structurable.rb:18-59
3. [visibility] Weighted-bid stages append a note "Your evaluation for this event will depend on <names> along with the Gross Total." — app/models/trade_request.rb:1025-1036
4. [config] T&C popup is enabled per rfx_mode by company custom config `tnc_popup[<rfx_mode>].enabled` (default off) — app/models/trade_request.rb:3035-3046
5. [side-effect] `accept_tnc_popup!` (row lock) records the FIRST acceptance per company {user_id, accepted_at}; later acceptances by the same company are ignored; accepted if any of the user's companies accepted — app/models/trade_request.rb:3048-3063
Cites: app/models/trade_request.rb:999-1050, 3035-3063; app/models/concerns/terms_and_conditions_structurable.rb:18-69

### Stage config flags — defaults (reference, part 1)
Rules:
1. [config] `show_company_profile` → config value when config present (nil if key missing), true only when config is empty — app/models/model_helpers/trade_request_model_helper.rb:10-13
2. [config] `is_approval_required_to_close_bid` == true; `is_approval_mail_required_to_close_bid` raw; `allow_bid_selection_for_unverified_vendor` default TRUE — app/models/model_helpers/trade_request_model_helper.rb:19-21; app/models/trade_request.rb:1500-1509
3. [config] `send_new_bid_mail` default false; `send_web_bidding_mail` default false; `select_bid_notification` default false — app/models/model_helpers/trade_request_model_helper.rb:48-54, 1084-1086
4. [config] `allow_auto_cd` only for buy stages, default false; `ranking_on_base_price` == true — app/models/model_helpers/trade_request_model_helper.rb:128-146
5. [config] `is_alternate_bidding_allowed`, `show_variant_widget`, `show_all_widgets_comparison_view`, `tab_collation_enabled`, `rfx_project_enabled`, `can_buyer_edit_bid`, `lock_quote_after_submission`, `is_integration_template`, `bill_to_broker`, `skip_po_form` — all default false — app/models/model_helpers/trade_request_model_helper.rb:861-878, 1203-1221, 1112-1114, 1276-1278
6. [config] `auto_awarding_enabled` default false; `allow_multiple_po_on_same_bid` default false; `is_baseline_cost_adjustment_enabled` default false; `hide_tna_bid_from_qcs` default false — app/models/trade_request.rb:2664-2670, 2895-2897, 3002-3009
Cites: app/models/model_helpers/trade_request_model_helper.rb:10-146, 861-878, 1203-1278; app/models/trade_request.rb:1500-1509, 2664-2670, 3002-3009

### Stage config / misc flags — defaults (reference, part 2)
Rules:
1. [config] `widget_precision` default 2 — app/models/trade_request.rb:1321-1323
2. [config] `misc.request_layout` default "json_template"; "sheet_template" = new order flow — app/models/trade_request.rb:876-886
3. [config] `misc.ranking_on_item == true` → multiline auction; `misc.is_basket_auctions == true` → basket; parent lot = lot id equals own id — app/models/trade_request.rb:1732-1755
4. [config] `misc.weightage` present → weighted-bid event; `misc.dummy_event_group` → single-stage order; `misc.not_allow_rebidding_to_sellers` lists vendor companies blocked from re-bidding — app/models/trade_request.rb:1757-1759; app/models/model_helpers/trade_request_model_helper.rb:880-882, 962-965
5. [config] `config.vendor_activity_type` default "onboarding" (site_visit = buyer-only; vendor_assessment = "VA" ref) — app/models/model_helpers/trade_request_model_helper.rb:1120-1138
6. [config] `config.auto_fetch_from_rfp_widget_keys` lists widgets copied from RFP answers (regretted lines skipped); `config.fast_bidding_mode_enabled` default false — app/models/trade_request.rb:2946-2974; app/models/model_helpers/trade_request_model_helper.rb:1379-1386
7. [config] `unlock_bids_restriction_options` default [{key: everyone, label: Everyone}]; `restrict_unlock_bid_before_evaluation` raw — app/models/model_helpers/trade_request_model_helper.rb:1491-1493, 1523-1525
Cites: app/models/trade_request.rb:876-886, 1321-1323, 1732-1759; app/models/model_helpers/trade_request_model_helper.rb:880-882, 962-965, 1120-1138, 1379-1386, 1491-1525

### Untyped-500 catalogue — nil access in TradeRequest / helper readers
Methods that raise instead of returning a typed error when data is missing.
Rules:
1. [validation] `product`, `product_id`, `unit_type`, `product_options` → NoMethodError on a non-RFI/RFP stage with no line items — app/models/trade_request.rb:1053-1061, 1109-1117
2. [validation] `closing_price` on a closed stage falls back to `selected_bid.price` → NoMethodError when no bid is selected and no selected bid line exists — app/models/trade_request.rb:1076-1079
3. [validation] `get_summary_data` uses `bid_start_time.strftime` / `bid_end_time.strftime` → crash with no schedule — app/models/trade_request.rb:459-460
4. [validation] No project: `get_latest_commercial_proposal`, `lot_rfp_form_ids` (RecordNotFound), `active_lot_number`, `project_ref_with_title` crash — app/models/trade_request.rb:2982-2991; app/models/model_helpers/trade_request_model_helper.rb:1527-1541, 1632-1639
5. [validation] `get_all_widget_keys`, `get_key_vs_global_widgets`, `get_widget_input_type`, `get_negotiable_widgets_key_attributes` crash when a widget array is missing — app/models/trade_request.rb:1253-1258, 1295-1303, 1836-1840, 1883-1888
6. [validation] `buyer_hub_names` / `display_buyer_hub` (`tp.buyer_hub.name`), `display_title_for_multiline_auction` (`product.name`) — app/models/model_helpers/trade_request_model_helper.rb:1100-1102; app/models/trade_product.rb:345-347; app/models/trade_request.rb:922-932
7. [validation] `threshold_quantity_value` multiplies by `book_building_threshold / 100.0` → crash when the threshold is unset — app/models/trade_product.rb:263-269
Cites: app/models/trade_request.rb:459-460, 1053-1117, 1253-1303, 2982-2991; app/models/trade_product.rb:263-269, 345-347

### Raw SQL writers on stage and line-item JSON
Rules:
1. [side-effect] `set_key_value_in_misc(key:, value:)` builds `jsonb_set(misc, '{key}', 'value'::jsonb)` by string interpolation and executes it directly (no callbacks, no paper trail) — app/models/trade_request.rb:1363-1370
2. [side-effect] `TradeProduct.update_meta_data` bulk-updates meta_data with `'<json>'::json` string interpolation — app/models/trade_product.rb:305-319
3. [side-effect] `save_vendor_specific_savings` (stage and line) and `update_approver_identifiers` write misc/meta_data with update_columns (no callbacks) — app/models/trade_request.rb:2698-2701, 2976-2980; app/models/trade_product.rb:742-745
4. [side-effect] `TradeProduct.mark_void(ids)` sets status void with update_all — app/models/trade_product.rb:551-553
5. [side-effect] Line-item replica on project clone skips lines without an active project line item and resets `event_score_for_participants` to {} — app/models/trade_product.rb:325-343
Gaps: a value containing a single quote (e.g. a vendor-entered text in meta_data) breaks the interpolated SQL → PG error → untyped 500; the interpolation is injection-shaped — app/models/trade_request.rb:1366; app/models/trade_product.rb:308
Gaps: clone `old_egli_id_vs_new_egli[...].id` raises when the new project lacks the mapped line item — app/models/trade_product.rb:333
Cites: app/models/trade_request.rb:1363-1370, 2698-2701, 2976-2980; app/models/trade_product.rb:305-343, 551-553
