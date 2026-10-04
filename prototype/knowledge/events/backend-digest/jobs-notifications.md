# Event jobs, schedules and notifications — backend digest (procol-backend origin/main ae36e86894)

## Overview
The time and side-effect machinery behind events: Sidekiq workers that close stages at `closed_at`, run knockout/dutch rounds, delete leftover drafts, refresh project line-item stages, and send every event mail/push (invites, live, expiry reminders, extension, reschedule, withdraw, best offer, counter offer, RFI/RFP evaluator mails, daily evaluator digest), plus manual reminders (Reminders::EventGroupService), pending tasks (PendingTasks::*), recurring projects (ScheduledJobs::*), custom-template mails (Notifications::Send) and the delivery layer (CustomMailDeliveryJob, EmailDelivery::*).
Most jobs are scheduled with `perform_at(<event time>)` from TradeRequest / TradeSchedule / EventGroup callbacks; cron jobs live in config/sidekiq.yml (`:scheduler:`). config/schedule.rb (whenever) has no active entries. App time zone is `Kolkata` (config/application.rb:111).
Stale-job pattern: most scheduled workers re-read the event when they run and either skip or re-enqueue themselves at the new time; the sections below say which ones do NOT. app/jobs/fx_*_notification_job.rb and FxNotificationDeliveryWorker serve flexi forms (FxResponse) and contain no event-specific logic.
Controller-side rules (extend, reschedule, withdraw, auction 24h/30min reminders, auto-award) are in trade-stages.md, trade-live-v1.md, event-groups.md, auction-templates.md, evaluation-award.md.

### Sidekiq queues, cron schedule and time zone — config/sidekiq.yml
Where event jobs run and which ones are cron-driven.
Rules:
1. [config] Queues are weighted rt_high 10, rt_medium 5, rt_low 3, push_notification 5, everything else 1; production concurrency 5, staging/development 2 — config/sidekiq.yml:1-21
2. [time] `scheduled_job_scheduler` (ScheduledJobs::SchedulerWorker) runs every minute (`* * * * *`); `scheduled_job_upcoming_email` runs hourly (`0 * * * *`) — config/sidekiq.yml:168-176
3. [time] `daily_pending_evaluation_mailer` runs at `0 9 * * *` with args company_ids [25686] only — config/sidekiq.yml:150-156
4. [time] `vendor_invite_reminder_job` cron `0 10 * * *`, `trade_approval_all` `0 18 * * *`, `daily_auction_bidding_report` `30 23 * * *` — config/sidekiq.yml:56-79,115-120
5. [time] Cron hours are evaluated in the Sidekiq process clock; no `tz` key is set on any entry (unverified which zone production uses) — config/sidekiq.yml:29-213
Gaps: comments disagree with crons: `30 18` labelled "6pm", `weekly_report` `*/60 * * * *` labelled "Sunday 11 am" (runs hourly), `0 8 * * 6` labelled "11 am" — config/sidekiq.yml:32,62,94
Cites: config/sidekiq.yml:1-213, config/application.rb:111

### Sidekiq middleware — locale argument and test-mode perform_at
How `locale:` hashes and scheduled jobs behave.
Rules:
1. [side-effect] A trailing `{locale: …}` hash sets I18n.locale for the job and is removed from args when it is the only key; otherwise only the `locale` key is deleted — config/initializers/sidekiq.rb:16-35
2. [time] In the test environment only, SkipPerformAtMiddleware deletes `at`, so every `perform_at` job runs immediately (scheduled guards are then exercised "early") — config/initializers/sidekiq.rb:52-59,97-110
3. [config] single_thread queue is limited to 1 worker with a 60 s Redis lock TTL — config/initializers/sidekiq.rb:40, config/sidekiq.yml:26-27
Cites: config/initializers/sidekiq.rb:16-59,97-110

### TradeRequest callbacks that schedule close-time jobs (closed_at changes)
Every save that changes `closed_at` (publish, extend, end early, withdraw) re-enqueues the close-time jobs; old jobs are not deleted.
Rules:
1. [side-effect] After commit with `saved_change_to_closed_at?`: MarkEventClosedWorker.perform_at(closed_at) (skipped for RFI/RFP) and DeleteDraftBidsWorker.perform_at(bid_end_time) (skipped when the same save moved status to `active`) — app/models/trade_request.rb:303-304,358-361,3199-3203
2. [side-effect] AuctionCloseSlackWorker.perform_at(closed_at + 10 s) for each lot trade (multiline/basket) or the stage; skipped for RFI/RFP, statuses other than active/closed, demo companies 3380/7244/9337/9864 — app/models/trade_request.rb:301,2289-2303
3. [side-effect] For non-RFI/RFP, non-knockout/dutch stages: SavingsCalculatorWorker at closed_at+5 s, CustomSavingsCalculatorWorker at +7 s (if company.show_custom_savings?), SpendAnalyticsWorker at +10 s, on create, closed_at change or status→active — app/models/trade_request.rb:342-356
4. [side-effect] EventClosedReportWorker.perform_async when status changes to `closed` and company config `send_report_after_event_closed` is present — app/models/trade_request.rb:305,363-368
Cites: app/models/trade_request.rb:281-305,342-368,2289-2303,3199-3203

### MarkEventClosedWorker — stage status becomes "closed" at closed_at
Runs at the stage's `closed_at` (rt_high) for RFQ/auction stages.
Rules:
1. [state] Only a stage with status `active` is processed; withdrawn/cancelled/closed/draft stages are skipped — app/workers/mark_event_closed_worker.rb:6-9
2. [time] Stale guard: if `closed_at > Time.now` (event was extended after scheduling) the job does nothing; the job scheduled for the new closed_at does the work — app/workers/mark_event_closed_worker.rb:7
3. [state] Status is set to `closed` only if EVERY valid trade product (all products for an in_active stage, otherwise non-in_active ones) has status `closed`; one open/void/cancelled product keeps the stage `active` after its end — app/workers/mark_event_closed_worker.rb:11-15, app/models/model_helpers/trade_request_model_helper.rb:1393-1395, app/models/trade_product.rb:77
4. [side-effect] When it closes a knockout or dutch auction, all active `yet_to_start` trade rounds become `void` — app/workers/mark_event_closed_worker.rb:17-19
5. [state] A stage with zero valid products is closed (`all?` on empty list is true) — app/workers/mark_event_closed_worker.rb:13
Gaps: no re-check is scheduled; if products close later nothing in this worker closes the stage (unverified whether another path does) — app/workers/mark_event_closed_worker.rb:13-20
Cites: app/workers/mark_event_closed_worker.rb:1-22

### DeleteDraftBidsWorker — vendor drafts discarded at bid end
Runs at `bid_end_time` (scheduled whenever closed_at changes).
Rules:
1. [state] Only an `active` stage is processed (withdrawn/closed stages keep their drafts) — app/workers/delete_draft_bids_worker.rb:8-9
2. [time] Acts only if `bid_end_time <= Time.now` at run time; an extended stage's old job is a no-op — app/workers/delete_draft_bids_worker.rb:11
3. [side-effect] RFI/RFP: all `draft` template responses → `in_active`; for vendor-onboarding-v2 the buyer company's own draft is kept — app/workers/delete_draft_bids_worker.rb:12-16
4. [side-effect] RFQ/auction: all `draft` bids → `in_active` — app/workers/delete_draft_bids_worker.rb:17-20
5. [state] Not scheduled when the save moved the stage to `active` (amendment publish keeps drafts) — app/models/trade_request.rb:3199-3202
Cites: app/workers/delete_draft_bids_worker.rb:1-24, app/models/trade_request.rb:3199-3203

### EventGroupUpdateWorker — scheduling and the line-item stage label
Recomputes each project line item's `current_stage` / `status_timeline`; scheduled at now+2 s, at bid_start_time (if upcoming), bid_end_time, closed_at (if different) and the response-review end.
Rules:
1. [time] Scheduled from TradeRequest#update_event_group_details on closed_at/status change — app/models/trade_request.rb:287,3189-3196,3250-3253
2. [state] Only an `active` EventGroup is processed; a withdrawn/draft project is skipped entirely — app/workers/event_group_update_worker.rb:16-20
3. [state] Stage label order: in_active/withdrawn stage → "open"; closed → "closed"; product closed or RFP evaluated or RFQ converted to auction → "closed"; in response review → "response_review_time_for_participant"; draft → "draft"; any pending counter offer (RFQ/auction) → "counter_offer_requested"; bid_end_time < now → "send_for_evaluation" (config `send_rfp_to_evaluation_manually` and no extra_closing_time) else "quote_in_evaluation"; upcoming → "upcoming"; running → "quote_in_progress"; else "open" — app/workers/event_group_update_worker.rb:89-120
4. [side-effect] status_timeline gets a new `epoch → <mode>_<status>` entry on every run unless the last entry starts with `po_`/`so_` — app/workers/event_group_update_worker.rb:35-37,134-164
Gaps: a timeline entry is appended even when the status did not change, so repeated runs duplicate entries — app/workers/event_group_update_worker.rb:156-162
Cites: app/workers/event_group_update_worker.rb:11-164

### EventGroupUpdateWorker — PR line items follow the event
When the project is mapped to a purchase request, PR item status follows the stage labels.
Rules:
1. [side-effect] Stage label quote_in_progress/upcoming/quote_in_evaluation/expired/counter_offer_requested → PR item "in_progress"; "closed" → "completed" (wins); anything else → "active" — app/workers/event_group_update_worker.rb:167-182
2. [state] PR items in status `hold`, and target status "completed", are not written; the latest PR item per line item wins — app/workers/event_group_update_worker.rb:186-206
3. [side-effect] Transition in_progress→active logs `event_withdrawn_reopened`, active→in_progress logs `moved_to_in_progress`; UpdateInProgressQuantityWorker queued per written item — app/workers/event_group_update_worker.rb:212-250
4. [side-effect] update_closed_at then sets EventGroup.started_at = earliest bid_start_time — app/workers/event_group_update_worker.rb:62-63, app/models/model_helpers/event_groups_helper.rb:32
Gaps: label "expired" is listed but never produced by determine_trade_status — app/workers/event_group_update_worker.rb:172 vs 89-120
Cites: app/workers/event_group_update_worker.rb:52-63,167-251

### update_closed_at — project closed_at once every line item is awarded
Runs inside EventGroupUpdateWorker.
Rules:
1. [state] Only when every active project line item is awarded (`should_update_closed_at_for_awarded_eglis?`) — app/models/model_helpers/event_groups_helper.rb:12,71-75
2. [calculation] If an order with purchase_order_status not_requested/generated exists: project closed_at = max closed_at of non-RFI/RFP stages; every stage with closed_at in the future gets that max; every future RFP trade_schedule end_time is set to now — app/models/model_helpers/event_groups_helper.rb:28-37,50-69
3. [calculation] Only RFI/RFP stages: closed_at = max closed_at of RFIs and evaluated RFPs, applied only when that time <= now — app/models/model_helpers/event_groups_helper.rb:16-19,39-41
4. [calculation] All stages withdrawn/in_active: closed_at = max stage closed_at — app/models/model_helpers/event_groups_helper.rb:42-44
Gaps: rule 2 moves still-open stages to the LATEST closed_at (it extends, not ends, an earlier-closing stage); intent unverified — app/models/model_helpers/event_groups_helper.rb:29,50-55
Cites: app/models/model_helpers/event_groups_helper.rb:5-75

### TradeRoundSchedulerWorker — knockout round end
Runs at a round's `ends_at`; first scheduled at auction publish.
Rules:
1. [config] Scheduled at publish only when company `rfx_project_enabled?` OR the auction is dutch — app/controllers/concerns/trade_controller_helper.rb:4570-4573
2. [state] Skips unless the round id is still `active` (a time-extended round is voided and replaced by a new version, so the old job no-ops) and the stage is knockout/dutch — app/workers/trade_round_scheduler_worker.rb:9-18, app/controllers/api/trade_controller.rb:895-908
3. [time] Knockout: no accepted participants in the round → auction ends now (`auction_end_time: DateTime.now`) and yet_to_start rounds become void — app/workers/trade_round_scheduler_worker.rb:25-40
4. [calculation] Knockout: someone accepted → for each accepted company's active bid the template formula `dutch_knockout_bulk_price_formula` is evaluated with the next round's bulk_price; any result <= 0 ends the auction, else the next round's job is scheduled at its ends_at — app/workers/trade_round_scheduler_worker.rb:55-84
Gaps: a missing formula variable raises ArgumentError → job retried, auction neither ended nor advanced — app/models/trade_request.rb:752-755; the end-auction fallback needs the publishing user to be active, otherwise it silently returns — app/workers/trade_round_scheduler_worker.rb:62-63
Cites: app/workers/trade_round_scheduler_worker.rb:8-84

### TradeRoundSchedulerWorker — dutch rounds and missing re-scheduling
Rules:
1. [state] Dutch: if any participant accepted the round the job stops (the accepting bid ends the auction itself) — app/workers/trade_round_scheduler_worker.rb:44-45, app/models/bid.rb:516-524
2. [time] Dutch: no acceptance → next round (round_no+1, highest version, active) scheduled at its ends_at; no next round → auction ends now — app/workers/trade_round_scheduler_worker.rb:47-52, app/models/trade_request.rb:735-737
3. [state] Accepting a dutch round ends the auction now only for rfx_project companies and only during submission time — app/models/bid.rb:516-523
4. [time] DelayedRoundsForKnockoutWorker: when all participants accepted with > 60 s left, after a random 15–60 s the current round is cut to now, later rounds voided and the next round created from now (bulk_price − price_difference) — app/controllers/api/bids_controller.rb:440-446, app/controllers/concerns/trade_controller_helper.rb:4445-4473
Gaps: round extension re-schedules only for rfx_project companies (old round voided) → a non-project dutch auction loses its round job — app/controllers/api/trade_controller.rb:899-908; reschedule re-schedules only dutch+rfx_project → a rescheduled rfx_project knockout has no round job — app/controllers/concerns/trade_controller_helper.rb:4508-4519 vs 4570-4573
Cites: app/workers/trade_round_scheduler_worker.rb:44-53, app/workers/delayed_rounds_for_knockout_worker.rb:9-12

### EventClosedReportWorker — report mailed when a stage closes
Rules:
1. [config] Company custom config `send_report_after_event_closed` (array of {report_type, notify_to}) enables it; only report_type `approved_quotation_report` is known, others are ignored — app/workers/event_closed_report_worker.rb:8-12,19-21,38-41
2. [state] Skips unless the stage is `closed` at run time and has an owner — app/workers/event_closed_report_worker.rb:15-24
3. [side-effect] Recipients = `notify_to` entries with type "email" only; report built as the stage owner (Current.user = owner, workspace = buyer company); mail sent with deliver_now per recipient — app/workers/event_closed_report_worker.rb:43-51,58-99
4. [side-effect] queue batch_low, retry 1; temp Excel deleted afterwards — app/workers/event_closed_report_worker.rb:6,54-56
Gaps: any report/mail error is swallowed (logged only) — app/workers/event_closed_report_worker.rb:52-53,93-97
Cites: app/workers/event_closed_report_worker.rb:1-101

### Auction result mail to not-awarded vendors (custom template)
Rules:
1. [config] Sent only when the buyer company has an active CommunicationTemplate for key AUCTION_RESULT_NOTIFICATION — app/models/trade_request.rb:329, app/services/notifications/send.rb:127-130
2. [state] Not for RFI/RFP or knockout/dutch, and only while the stage is `closed` — app/models/trade_request.rb:323-326
3. [visibility] Recipients = active companies of `not_selected_bids` (one mail per company, to the bid's user, else company email); the stage owner is CC'd when company `keep_buyer_in_new_order_email_notification_cc?` — app/models/trade_request.rb:328-337, app/services/notifications/send.rb:17,102-109
Gaps: the callback is `after_save_commit` with no change condition, so EVERY later save of a closed stage re-sends the result mail — app/models/trade_request.rb:291,323-339
Cites: app/models/trade_request.rb:291,323-340

### TradeRequestVendorStatusUpdateWorker — participant status counters
Rules:
1. [side-effect] counter_offer_requested/responded/revoked and best_offer_responded increment `participant_statuses[<key>][<company_id>]` by 1 (atomic jsonb_set) — app/workers/trade_request_vendor_status_update_worker.rb:38-54
2. [side-effect] best_offer_requested: companies in config `allowed_participants_to_edit_in_bid_review_time.request_for_best_price` not yet present get 1; if none are new (new round) the hash is reset to those companies and `best_offer_responded` is cleared — app/workers/trade_request_vendor_status_update_worker.rb:56-83
3. [time] Enqueued 2 s after the triggering save (additional request, trade schedule create/extend, best-offer bid) — app/models/additional_request.rb:615,632, app/models/trade_schedule.rb:104,111, app/services/bid_context_label_service.rb:67
Gaps: `TradeRequest.find` raises for a missing id (the blank guard is dead); counters are not idempotent across duplicate enqueues — app/workers/trade_request_vendor_status_update_worker.rb:16-17,49
Cites: app/workers/trade_request_vendor_status_update_worker.rb:1-85

### Vendor mail recipients — get_audiences_for_mail_bidding (who)
Used by invite, live, expiry-reminder, reschedule, extension, withdraw and RFI vendor mails.
Rules:
1. [visibility] `restricted` stage: audience rows with visible=1 only (hidden vendors get no mail) — app/models/trade_request.rb:1453-1454, app/models/audience.rb:34
2. [visibility] `except_for`: all buyer-company vendors minus audience rows with visible=0; `everyone`: vendors of the stage creator's company — app/models/trade_request.rb:1455-1460
3. [config] Vendor mapping status must be in company config `allowed_statuses_for_vendor` (default ["active","invited"]) — app/models/trade_request.rb:1462-1463, app/models/company.rb:179-181
4. [visibility] Mapping status `invited` → mail goes to the invitation email (Invitations status active/accepted, minus emails of in_active users); otherwise to active users of the vendor company with an active user_company_mapping — app/models/trade_request.rb:1464-1471,1492-1498
5. [visibility] everyone/except_for: users must share a trade_identifier (team) with the stage; restricted: no team filter — app/models/trade_request.rb:1473-1475
6. [visibility] No filter on bid/regret/participation status: vendors who already bid or regretted still get reminders — app/models/trade_request.rb:1451-1489
Cites: app/models/trade_request.rb:1451-1498

### Vendor mail recipients — defects in get_audiences_for_mail_bidding
Rules:
1. [visibility] Vendor status is read from BuyerSellerCompanyMapping by `dealing_with_company_id` only (no `client_company_id` filter) — a vendor blocked by this buyer but active/invited for another buyer can still be mailed; with several mappings the last row wins — app/models/trade_request.rb:1462, app/models/buyer_seller_company_mapping.rb (index company_mapping_index)
2. [visibility] everyone/except_for: invitations are kept only if `Team.where(company_id: <invitation ids>)` has a matching identifier — invitation ids are used as company ids, so invited-not-registered vendors are mostly dropped — app/models/trade_request.rb:1476-1480
Gaps: rule 1 — missing client_company_id filter — app/models/trade_request.rb:1462; rule 2 — wrong id domain — app/models/trade_request.rb:1477; with a stage that has no team_identifier and a matching Team, `identifier.in?(nil)` raises ArgumentError — app/models/trade_request.rb:1474,1478
Cites: app/models/trade_request.rb:1462-1480

### Push recipients — audiences_for_trade (get_audience_for_trade)
Used by every vendor push (new event, update, time increase, reschedule, withdraw).
Rules:
1. [visibility] restricted: users of audience companies with visible=1; except_for: buyer's vendors minus not-visible; everyone: buyer's vendors — app/models/trade_request.rb:1413-1437
2. [visibility] Company status active and user_company_mapping active; if the stage has team identifiers, user mapping must overlap them (all three modes) — app/models/trade_request.rb:1417-1435
Gaps: restricted push audience has no BuyerSellerCompanyMapping status filter (a vendor blacklisted after being invited still gets pushes) while mail filters status — app/models/trade_request.rb:1415-1421 vs 1462-1463; restricted mail ignores team identifiers while push applies them — app/models/trade_request.rb:1420 vs 1473
Cites: app/models/trade_request.rb:1393-1440, lib/modules/push_notification.rb:3847-3850

### Publish-time buyer mails — live / scheduled / expiry (send_email_notification)
Sent when a stage is published (status draft/requested → active).
Rules:
1. [state] Only for RFQ/auction stages of a dummy (single-stage) event group (`misc.dummy_event_group`); project stages get none of these buyer mails — app/models/trade_request.rb:2133-2135, app/models/model_helpers/trade_request_model_helper.rb:880-882
2. [config] trade config `send_event_mails_to_buyer` = "disable_for_buyer" suppresses live/scheduled/expiry buyer mails — app/models/trade_request.rb:2138
3. [time] Started (`bid_start_time < now`) → "new_event_live_to_buyer" now; else "new_event_scheduled_to_buyer" now + "new_event_live_to_buyer" at bid_start_time; "event_expiry_buyer" at closed_at — app/models/trade_request.rb:2139-2145,672-674
4. [time] "event_expiry_reminder_to_buyer" at bid_start_time + round(0.8 × duration) unless `send_event_expiry_reminder_to_buyer` = "disable_for_buyer" — app/models/trade_request.rb:2147-2149
5. [visibility] Recipients: `send_event_mails_to_buyer` = "enable_for_team" → buyer users whose trade_identifier overlaps the stage; otherwise only the stage owner — app/workers/email_notification_worker.rb:357-378
Cites: app/models/trade_request.rb:1935-1975,2133-2150

### Buyer live / expiry mail workers — stale-job guards (new_event_buyer)
Rules:
1. [state] Loads the stage with any status except `in_active` — app/workers/email_notification_worker.rb:193-194
2. [time] event_expiry_buyer: closed_at still in the future → re-enqueued at closed_at; stage `closed` or `withdrawn` → no mail; otherwise mailed — app/workers/email_notification_worker.rb:195-202
3. [time] new_event_live_to_buyer: stage still upcoming (`bid_start_time >= now`) → re-enqueued at bid_start_time — app/workers/email_notification_worker.rb:203-208, app/models/trade_request.rb:1202-1204
4. [state] new_event_draft_to_buyer goes to every active auction-team user only while the stage is still `draft`; sent when an rfq_then_auction draft is routed to the auction team — app/workers/email_notification_worker.rb:358-366, app/models/trade_request.rb:1958-1960
Gaps: a `cancelled`/`void` stage still gets "event expired" mail, and a withdrawn/cancelled upcoming stage still gets "event is live" mail at its start time (no status check) — app/workers/email_notification_worker.rb:193-208; at closed_at the expiry mail races MarkEventClosedWorker (closed first → no mail) — app/workers/email_notification_worker.rb:199, app/workers/mark_event_closed_worker.rb:14
Cites: app/workers/email_notification_worker.rb:192-227

### Buyer expiry reminder (80%) — event_expiry_reminder_email_buyer
Rules:
1. [state] Only an `active` stage; skipped once `bid_end_time < now` — app/workers/email_notification_worker.rb:231-233
2. [time] Recomputes reminder = bid_start_time + round(0.8 × (bid_end − bid_start)); if that is >= 2 minutes away the job re-enqueues itself there (self-heals after extension) — app/workers/email_notification_worker.rb:234-242
3. [visibility] Recipients via config `send_event_expiry_reminder_to_buyer` ("enable_for_team" → team users, else owner) — app/workers/email_notification_worker.rb:237,243-247
4. [time] On an auction extension, if the old 80% point already passed and the new one is still ahead, a new reminder job is enqueued — app/models/trade_request.rb:2176-2201
Cites: app/workers/email_notification_worker.rb:229-248, app/models/trade_request.rb:2176-2204

### Vendor invite mail at publish — send_web_bidding_mail
Rules:
1. [config] trade config `send_web_bidding_mail` == true sends invites; RFI/RFP excluded (they use RfiMails) — app/models/trade_request.rb:2330-2339
2. [config] If the buyer has an active custom template AUCTION_INVITE_EMAIL (auction) / RFQ_INVITE_EMAIL (others), one templated mail per recipient is sent inline with the owner CC'd (if company CC config); else "new_trade_sheet" → NewTradeSheetEmailWorker per user/invitation — app/models/trade_request.rb:2341-2347,3067-3094
3. [state] new_trade_sheet sends only if the stage is `active` when the job runs — app/workers/email_notification_worker.rb:113-127
4. [state] No invite mails/pushes for a stage of a draft project, an RFQ that belongs to a lot (`misc.lot_no`), or a draft stage — app/models/trade_request.rb:1954-1963
Gaps: new_trade_sheet does `trade_request.company_id` before the nil check → NoMethodError for a missing id — app/workers/email_notification_worker.rb:114-117
Cites: app/models/trade_request.rb:1953-1975,2330-2356,3067-3094

### Vendor "event is live" mail — 2 minutes before start
Rules:
1. [config] Scheduled at publish only if config `send_event_live_email_to_vendor` == true AND bid_start_time − created_at >= 30 minutes — app/models/trade_request.rb:2336,2352-2355
2. [time] Job at bid_start_time − 2 min; if the stage now starts more than 2 minutes later it re-enqueues itself at the new start − 2 min — app/workers/email_notification_worker.rb:250-257
3. [state] Only an `active` stage; recipients = mail audience (users + invitations) — app/workers/email_notification_worker.rb:251,258-268
Gaps: after rescheduling EARLIER no new job is created, so vendors get "live" mail at the old time (after the stage already started) — app/models/trade_request.rb:1977-1985, app/workers/email_notification_worker.rb:253-257
Cites: app/workers/email_notification_worker.rb:250-269

### Vendor expiry reminders — event_expiry_reminder_times
Rules:
1. [config] Scheduled only if config `send_event_expiry_reminder_to_vendor` == true; one job per fraction in `event_expiry_reminder_times` (default [0.8]) at bid_start + round(fraction × duration), reminder_type "<fraction×100>_percent" — app/models/trade_request.rb:2349-2351,2358-2371
2. [time] At run: `active` stage only; skipped if bid_end_time < now; recomputed time >= 2 min ahead → re-enqueued — app/workers/email_notification_worker.rb:272-284
3. [visibility] Recipients = full mail audience incl. invitations; no exclusion of vendors who already bid or regretted — app/workers/email_notification_worker.rb:285-296
4. [time] On auction extension, fractions whose old time already passed and new time is still ahead are re-enqueued — app/models/trade_request.rb:2206-2229
Cites: app/workers/email_notification_worker.rb:271-297, app/models/trade_request.rb:2206-2229,2358-2371

### Extension side effects — send_auction_time_increase_notification
After every save where `send_buyer_increase_time_notification` or `send_last_min_bid_notification` is set.
Rules:
1. [side-effect] BOQ stage + buyer extension → "send_bidding_time_extension_mail" (TradeTimeExtendWorker per push-audience user with email) — app/models/trade_request.rb:2153-2155, app/workers/email_notification_worker.rb:380-387
2. [side-effect] Non-BOQ auction (not knockout/dutch) + buyer extension → "submission_time_extended_to_vendor" mail and expiry reminders re-scheduled — app/models/trade_request.rb:2156-2159
3. [side-effect] Either flag: vendor "Submit bid" tasks get ends_at = new bid_end_time (missed → pending again); RFI also gets extension mails; ALL bids of the stage get end_time = bid_end_time — app/models/trade_request.rb:2160-2167
4. [side-effect] Push: last-minute bid → "last_min_bid" (only users with active/requested/pending bids, "time extended by N min", N = config `time_extension_value` if dynamic closing else 3); buyer extension → "buyer_time_increase" to the push audience; none if bid_end_time already passed — app/models/trade_request.rb:2168-2173, lib/modules/push_notification.rb:459-480
Cites: app/models/trade_request.rb:2152-2174, lib/modules/push_notification.rb:459-494

### Submission-time-extended mail to vendors
Rules:
1. [state] Only an `active` stage; recipients = mail audience users with email and invitations with invite_info — app/workers/email_notification_worker.rb:547-564
2. [visibility] Body shows client name, ref, new end date/time in the vendor's time zone (company.get_timezone_for_vendor_email) and the stage's line items (name, quantity, UoM) — app/mailers/auction_reschedule_mailer.rb:16-30,57-71,108-120
3. [visibility] Subject "⏰ <ref>[ Lot-n] | Submission time extended for <mode>" — app/mailers/auction_reschedule_mailer.rb:19-20,29
Gaps: line items come from `trade_request.trade_products` with no status filter (removed items appear) — app/mailers/auction_reschedule_mailer.rb:108-119
Cites: app/workers/email_notification_worker.rb:547-564, app/mailers/auction_reschedule_mailer.rb:16-30

### Auction reschedule — mails, pushes and reminder re-scheduling
Triggered when `notify_on_reschedule_event` is set on save (upcoming stage rescheduled).
Rules:
1. [side-effect] Push to vendors (send_push_notification) and admins; RFI → RfiMails reschedule mails; auction → 24h/30min reminder jobs re-enqueued (only if still in the future) + vendor mail + buyer mail + vendor/buyer pushes — app/models/trade_request.rb:1977-1985,2384-2413
2. [visibility] Vendor mail: old and new start/end in the vendor's zone; the invited count is passed but not rendered in the vendor template — app/mailers/auction_reschedule_mailer.rb:2-13, app/views/auction_reschedule_mailer/auction_reschedule_vendor.html.erb:48-76
3. [visibility] Buyer mail goes to the owner; a separate copy to every active auction-team member except the owner; shows "rescheduled by", invited count and line items — app/workers/email_notification_worker.rb:522-545, app/mailers/auction_reschedule_mailer.rb:32-49,83-101
4. [time] Old 24h/30min reminder jobs no-op because the worker requires |now − (start − offset)| <= 1 minute — app/workers/email_notification_worker.rb:597-604
Gaps: buyer mail "previously scheduled" uses `Time.at(...)` without `.in_time_zone`, so old times render in the server process zone while new times use the recipient zone — app/mailers/auction_reschedule_mailer.rb:96-100
Cites: app/models/trade_request.rb:2384-2413, app/workers/email_notification_worker.rb:501-545

### Upcoming / new event pushes to vendors
Rules:
1. [state] No push for status `requested` or child lots of multiline/basket auctions — app/models/trade_request.rb:2113-2116
2. [time] Upcoming stage: "auction_notification" push now only when customised_audience is `everyone`; "auction_notification_scheduled" at start − 15 min if that is still in the future; live stage: "new_trade_request" now — app/models/trade_request.rb:2118-2124
3. [time] 15-minute push re-checks: skipped if start is still > 15 min away (stale after reschedule later) — lib/modules/trade_request_push_notification.rb:5-9
4. [side-effect] "new_trade_request" also creates vendor "Submit <RFQ|Auction|RFP> Bid" pending tasks (ends_at = bid_end_time) for push-audience users of participant companies — lib/modules/push_notification.rb:383-405, app/services/pending_tasks/trade_request/response_submission_service.rb:24-66
5. [time] Approval path: pushes now, at start − 15 min and "new_trade_request" at bid_start_time — app/models/trade_request.rb:1943-1951
Gaps: the scheduled "new_trade_request" push loads the stage with no status check (`find_by_id`) — a withdrawn/cancelled stage still pushes and creates tasks — lib/modules/push_notification.rb:383-405
Cites: app/models/trade_request.rb:1943-1951,2113-2125

### Admin pushes on auction create (auction_create_notification_to_admins)
Rules:
1. [config] Only when trade config `auction_create_notification_to_admins` is truthy — app/models/trade_request.rb:2231-2233
2. [time] Upcoming: "auction_schedule_notification_to_admins" now + "…in_advance…" at start − 15 min; live: "auction_create_notification_to_admins" now — app/models/trade_request.rb:2234-2239
3. [time] The 15-min admin push is skipped if start is still > 15 min away when it runs — lib/modules/trade_request_push_notification.rb:29-33
4. [config] Company config `restrict_event_visibility_to_owner` changes the admin audience (unverified detail) — lib/modules/trade_request_push_notification.rb:40
Cites: app/models/trade_request.rb:2231-2240, lib/modules/trade_request_push_notification.rb:29-40

### Stage withdraw / cancel notifications
Sent from TradeControllerHelper#set_trade_request_in_active after a successful withdraw/cancel.
Rules:
1. [side-effect] Push "trade_request_withdrawn" + mail "trade_withdraw" (remark, withdrawn_by); yet_to_start knockout/dutch rounds voided; all additional requests → `revoke` — app/controllers/concerns/trade_controller_helper.rb:250-253
2. [visibility] Vendor mail to the full mail audience; not sent when the stage is `cancelled` or `draft` — app/workers/email_notification_worker.rb:470-486
3. [visibility] Auction-team mail (owner + active auction-team users, with remark and who withdrew) only for auction/rfq_then_auction stages and only if the project itself is not withdrawn — app/workers/email_notification_worker.rb:488-498
4. [visibility] Push text "Stage Withdrawn" names the buyer company and ref — lib/modules/push_notification.rb:3793-3803
Gaps: the push loads `TradeRequest.in_active` only, so a stage set to `withdrawn` (status 5) or `cancelled` gets no push — lib/modules/push_notification.rb:3785; vendor "Submit bid" tasks are not deactivated (see pending-tasks section) — app/models/trade_request.rb:3205-3208
Cites: app/controllers/concerns/trade_controller_helper.rb:186-253, app/workers/email_notification_worker.rb:470-499

### Project withdraw mails — event_group_withdraw_vendor / _buyer
Rules:
1. [state] Both run only if the project status is `withdrawn` at run time — app/workers/email_notification_worker.rb:143-145,161-163
2. [visibility] Vendors: union of the mail audiences of ALL stages, de-duplicated by user and invitation — app/workers/email_notification_worker.rb:146-158
3. [visibility] Vendor subject "<ref> | Project Withdrawn by <buyer>"; buyer name dropped when company config `hide_company_name_in_emails` is true; vendor mail carries no withdraw remark — app/mailers/event_group_withdraw_mailer.rb:6-25, app/mailers/application_mailer.rb:154-157
4. [visibility] Buyer: owner (or team via `send_event_mails_to_buyer` of the LAST stage) gets the latest "withdraw_project_remark" and who withdrew — app/workers/email_notification_worker.rb:164-174, app/mailers/event_group_withdraw_mailer.rb:28-40
Gaps: EventGroupWithdrawEmailWorker looks up invitations with status `active` only while the audience includes `accepted` ones → mail built with no recipient and silently dropped — app/workers/event_group_withdraw_email_worker.rb:7, app/models/trade_request.rb:1466, app/jobs/custom_mail_delivery_job.rb:95-100; buyer loop calls `mail.deliver_later` even when the user has no email (mail nil → NoMethodError) — app/workers/email_notification_worker.rb:172-173
Cites: app/workers/email_notification_worker.rb:143-175, app/workers/event_group_withdraw_email_worker.rb:1-11

### New project mail — new_event_group
Rules:
1. [visibility] Recipients = mail audience of the project's FIRST stage; the project owner is added when company config `enable_vendor_invitation_mail_to_client` is on — app/workers/email_notification_worker.rb:129-141
2. [state] Vendor-onboarding-v2 projects send nothing — app/workers/new_event_group_email_worker.rb:9
Gaps: no status check; a missing project or a project without stages raises NoMethodError — app/workers/email_notification_worker.rb:130-131, app/workers/new_event_group_email_worker.rb:8-9
Cites: app/workers/email_notification_worker.rb:129-141, app/workers/new_event_group_email_worker.rb:1-16

### Event revise (amendment published) notification
Rules:
1. [side-effect] When an amendment draft is published: mail "event_revise_notification" + push — app/controllers/concerns/event_group_controller_helper.rb:2632-2637
2. [visibility] Mail recipients = push audience (get_audiences) of the project's latest commercial stage — app/workers/email_notification_worker.rb:643-652
Gaps: the remark is passed as the 3rd positional arg (audience_ids) while the worker reads `extra_params['remark']` → the revise mail never carries the amendment remark — app/controllers/concerns/event_group_controller_helper.rb:2635, app/workers/email_notification_worker.rb:8,71-72; missing project → NoMethodError — app/workers/email_notification_worker.rb:644-645
Cites: app/workers/email_notification_worker.rb:643-653

### New bid mails to buyer and intake creator
Rules:
1. [side-effect] Sent only for a vendor's FIRST bid (or first after a revoke); revisions only push "edit_bid" when required; first bid also completes the vendor's "Submit bid" task — app/models/bid.rb:262-270
2. [visibility] "new_bid" mail to buyer only if `send_new_bid_mail_to_buyer` and NOT (event masking enabled or participant name masked for the owner) — app/models/bid.rb:275-277
3. [visibility] "new_bid_intake_creator" to intake creators of the project's PRs only if company `send_new_bid_mail_to_intake_creator?` and the same masking checks; only for bids in `requested` status — app/models/bid.rb:278-280, app/workers/email_notification_worker.rb:304-312
4. [side-effect] Surrogate bid → "surrogate_bid_notification_to_vendor" mail — app/models/bid.rb:271-273
Cites: app/models/bid.rb:249-282, app/workers/email_notification_worker.rb:299-317

### Counter offer mails and reminders
Rules:
1. [config] Vendor counter-offer mail only if trade config `send_mail_to_vendors`; bid must still be `requested`; all active users of the vendor company — app/workers/email_notification_worker.rb:319-328
2. [time] Reminder fraction (default 50%) of (end − request created_at), end = extra_closing_time || bid_end_time; re-enqueued if >= 2 min ahead — app/workers/email_notification_worker.rb:330-350
3. [state] Reminder needs an `active` stage, `send_mail_to_vendors`, and a still `requested` counter offer for the bid — app/workers/email_notification_worker.rb:332-341
4. [side-effect] Vendor answer → buyer mail with vendor company name (active vendor only) — app/workers/email_notification_worker.rb:87-95
5. [config] "bid_accept" mail only if config `send_mail_to_vendors` and the bid can have selected items — app/workers/email_notification_worker.rb:97-111
Cites: app/workers/email_notification_worker.rb:87-111,319-355

### Best offer round — vendor mails and reminders
Rules:
1. [side-effect] Creating a best-offer schedule (end in future): push + mail "quote_best_offer", status counters, reminders at 50% and 75% of the window — app/models/trade_schedule.rb:49,107-136
2. [side-effect] Changing its end_time (still future): push + mail "best_offer_time_extension" — app/models/trade_schedule.rb:51,100-105
3. [visibility] Recipients = all active users of companies in `allowed_participants_to_edit_in_bid_review_time` — app/workers/email_notification_worker.rb:389-404, app/models/trade_request.rb:1206-1214
4. [time] Reminder skipped for withdrawn/in_active stages; recomputed time >= 1 minute ahead → re-enqueued — app/workers/email_notification_worker.rb:418-434
Gaps: reminders go to every allowed company, including ones that already submitted (the manual Reminders tool excludes them) — app/workers/email_notification_worker.rb:435-441 vs app/services/reminders/strategies/best_offer_submissions.rb:11-13; `get_response_review_time_for_participant` nil → NoMethodError — app/workers/email_notification_worker.rb:426-427
Cites: app/models/trade_schedule.rb:49-55,100-136, app/workers/email_notification_worker.rb:389-442

### Best offer ended — mail to buyer
Rules:
1. [side-effect] Enqueued only when a best-offer schedule's end_time is UPDATED (extension or force end), now if already past else at end_time — app/models/trade_schedule.rb:50,92-98
2. [time] Sent only if the schedule is active, still "request_for_best_price", end_time <= now and the job runs within 30 s of end_time — app/workers/email_notification_worker.rb:406-416
3. [visibility] Recipient = stage owner only — app/workers/email_notification_worker.rb:413-414
Gaps: a best-offer round that simply ends at its original time sends no "ended" mail; a queue delay > 30 s also drops it — app/models/trade_schedule.rb:50, app/workers/email_notification_worker.rb:411-412
Cites: app/models/trade_schedule.rb:92-98, app/workers/email_notification_worker.rb:406-416

### Pending tasks — creation and expiry
Vendor to-do items ("Submit RFQ Bid", "Submit Best Offer", cost breakdown).
Rules:
1. [side-effect] Response-submission task per push-audience user whose company is a participant; ends_at = bid_end_time; description "<project ref> / Lot n - <stage ref>" — app/services/pending_tasks/trade_request/response_submission_service.rb:24-66
2. [side-effect] Best-offer task per user, ends_at = schedule end_time — app/services/pending_tasks/trade_schedule/best_offer_submission.rb:10-49
3. [time] MarkTaskAsMissedWorker at ends_at: still `pending` and `ends_at <= now` → `missed`; extended tasks are skipped by the re-check — app/services/pending_tasks/create_service.rb:7-11, app/workers/mark_task_as_missed_worker.rb:4-11
4. [side-effect] Extension: pending/missed tasks → `pending` with new ends_at — app/services/pending_tasks/update_service.rb:29-34
5. [state] Vendor's first bid marks its company's pending task `completed` — app/services/pending_tasks/trade_request/base_service.rb:9-12, app/models/bid.rb:268-269
Gaps: best-offer tasks are inserted even when the user's company is not in the allowed list (dealing_with_company_id nil; reachable only if the caller passes such users — unverified) — app/services/pending_tasks/trade_schedule/best_offer_submission.rb:23-31
Cites: app/services/pending_tasks/*.rb

### Pending tasks — deactivation on withdraw / cancel is broken
Rules:
1. [side-effect] On status change to in_active/withdrawn/cancelled the stage calls `mark_all_related_tasks_as_in_active` — app/models/trade_request.rb:293,3205-3208
Gaps: it builds BaseService with action_type '' → `meta_data->>'action_type' = ''` matches no "response_submission" task, so vendor "Submit bid" tasks stay pending until bid_end_time and then become `missed` — app/models/trade_request.rb:3207, app/models/task.rb:41; TradeSchedule::BaseService.mark_all_tasks_as_in_active is a class method reading `@action_type` (nil) → matches nothing — app/services/pending_tasks/trade_schedule/base_service.rb:15-18; AdditionalRequests::BaseService updates tasks to in_active and then iterates the same (re-queried) relation, so MarkTaskAsInactiveWorker is never enqueued — app/services/pending_tasks/additional_requests/base_service.rb:11-17
Cites: app/services/pending_tasks/trade_request/base_service.rb:14-27

### Manual reminders — GET /api/reminders/:id?resource_type=event_group — access and offer lists (part 1)
Data for the buyer "Send reminder" dialog (Reminders::EventGroupService#get_reminder_data).
Rules:
1. [permission] Policy `show?` on the event group; project must be `active` and its company in the user's allowed companies, else body `null` (HTTP 200) — app/controllers/api/reminders_controller.rb:2-11, app/services/reminders/event_group_service.rb:6,10-12
2. [state] Only stages visible to the user with closed_at > now are considered — app/services/reminders/event_group_service.rb:14-15
3. [visibility] Offer submissions: active stage in submission time; recipients = audience companies (active, visible) minus `bid_company_ids` — app/services/reminders/strategies/offer_submissions.rb:9-17, app/models/trade_request.rb:2470-2472
4. [visibility] Best offer: stage with a review schedule ending after now; requested companies minus those with an active best-offer revision — app/services/reminders/strategies/best_offer_submissions.rb:9-13
Gaps: cost-breakdown list contains companies that HAVE an active fast bid (already revised) — looks inverted — app/services/reminders/strategies/cost_break_down_submissions.rb:10-12
Cites: app/services/reminders/event_group_service.rb:10-32, app/services/reminders/strategies/*.rb

### Manual reminders — GET /api/reminders/:id — counter offers, evaluations, approvals, auctions, cooldown (part 2)
Rules:
1. [visibility] Counter offers: companies whose bids have pending counter offers (RFQ/auction stages) — app/services/reminders/strategies/counter_offers.rb:9-14, app/services/reminders/event_group_service.rb:23
2. [visibility] Pending evaluations: evaluator users (access list) of unevaluated or re-evaluation-requested forms of the FIRST RFP stage only — app/services/reminders/strategies/pending_evaluations.rb:6-17, app/services/reminders/event_group_service.rb:19
3. [visibility] Approvals: pending approvers of the current step of pending approval requests of the project — app/services/reminders/strategies/approvals.rb:6-21
4. [state] Auction reminders: latest auction stage per active lot (or overall), only if `active` and not yet started; recipients = active+visible audience companies — app/services/reminders/event_group_service.rb:93-110, app/services/reminders/strategies/auction_reminders.rb:6-37
5. [time] `can_remind` = never reminded or last reminder more than 10 minutes ago (per category, recipient and, for auctions, trade) — app/models/reminder.rb:28-30, app/services/reminders/strategies/base_strategy.rb:12-27, app/services/reminders/event_group_service.rb:112-134
Cites: app/services/reminders/event_group_service.rb:93-134

### Manual reminders — POST /api/reminders/:id/send_reminder
Rules:
1. [permission] Policy `update?` on the event group; unknown resource_type → body `null` (HTTP 200) — app/controllers/api/reminders_controller.rb:14-31
2. [state] Inactive project → `{error: true, code: 533}` (HTTP 200); auction_reminders with no auction stage among the ids → code 533 — app/services/reminders/event_group_service.rb:35,60-62
3. [side-effect] Writes one Reminder row per recipient (`u-<id>` for approvals/pending_evaluations, else `c-<id>`, channel email, type manual) and queues ReminderWorker — app/services/reminders/base_service.rb:23-55, app/services/reminders/event_group_service.rb:68-70
4. [side-effect] Auction reminder sends also log an activity entry when the stage is an active auction — app/services/reminders/event_group_service.rb:78-91
Gaps: the 10-minute cooldown and the eligibility lists are NOT re-checked on send — any encoded company/user ids and trade ids are accepted and mailed — app/services/reminders/event_group_service.rb:34-71
Cites: app/controllers/api/reminders_controller.rb:14-31, app/services/reminders/event_group_service.rb:34-71

### ReminderWorker — who gets the manual reminder mail
Rules:
1. [visibility] approvals / pending_evaluations: the listed users; other types: every active user of each listed company — app/workers/reminder_worker.rb:17-28
2. [side-effect] One mail per (user, stage); auction_reminders use AuctionReminderMailer "manual"; others ReminderMailer with subject per type, e.g. "[<ref>] [Reminder] Submit Your Offer Before the Deadline." — app/workers/reminder_worker.rb:32-58,64-80
3. [visibility] Stage end_time in the mail is pre-formatted with `strftime("%-l:%M%P, %d %b %Y")` in the app zone, not the vendor's zone — app/services/reminders/event_group_service.rb:149
Gaps: `User.active.find_by(event_creator).display_name` → NoMethodError when the project owner is inactive, so no reminder is sent at all — app/workers/reminder_worker.rb:13; approvals stage data lacks trade_id/title — app/services/reminders/event_group_service.rb:137-143
Cites: app/workers/reminder_worker.rb:8-81

### RFI vendor mails — invitation, stage live, incomplete
Rules:
1. [side-effect] On publish (not scheduled templates, not vendor-activity assessment): invitation now; for EVERY RFI stage of the project, "stage live" at its bid_start_time (only if > 29 min away) and "incomplete" at bid_end − duration/4 — app/models/event_group.rb:489-495, app/workers/rfi_mails/rfi_event_mails_worker.rb:11-22, app/models/model_helpers/trade_request_model_helper.rb:991-996
2. [config] Sent only if trade config `send_web_bidding_mail` is truthy; stage must be `active` — app/workers/rfi_mails/vendors_mail_trigger_worker.rb:12-14
3. [visibility] Recipients = registered users of the mail audience only (invitations ignored) — app/workers/rfi_mails/vendors_mail_trigger_worker.rb:16-22
4. [time] "stage live" delivered only if bid_start_time < now; "incomplete" only if remind time passed and the user has no active response — app/mailers/rfi_vendor_mailer.rb:29-47
Gaps: reschedule/extension enqueue new jobs without cancelling old ones → duplicate "stage live"/"incomplete" mails; the mail's stage list shows ALL project stages regardless of status/audience — app/models/trade_request.rb:2377-2382,2415-2420, app/mailers/rfi_vendor_mailer.rb:81
Cites: app/workers/rfi_mails/*.rb, app/mailers/rfi_vendor_mailer.rb:1-103

### RFI evaluator mails — invitation, reminder, stage live, incomplete
Rules:
1. [side-effect] On sharing as evaluator: invitation now; "reminder" at evaluation start − 1 day if start is >= 2 days away; "stage live" at evaluation start (= bid_end_time); "incomplete" at evaluation_end − (1 day if window >= 2 days else window/4) — app/models/access_list.rb:79, app/workers/rfi_mails/evaluation_mails_worker.rb:11-20, app/models/model_helpers/trade_request_model_helper.rb:972-988
2. [visibility] Team evaluators expand to active team members — app/workers/rfi_mails/evaluators_mail_trigger_worker.rb:11-20
3. [state] Each mail re-checks: active user, active stage, evaluation_end_time present, and the user (or team) still in the stage's evaluator access list — app/workers/rfi_mails/evaluator_mail_worker.rb:11-21
Cites: app/workers/rfi_mails/evaluation_mails_worker.rb:1-22, app/workers/rfi_mails/evaluator_mail_worker.rb:1-24

### RFP technical evaluation start — mails to evaluators
Rules:
1. [time] NotifyPlannersOnEvaluationStartWorker is scheduled at an active RFP `extra_closing_time` schedule's start_time (on start_time change); runs only if now >= earliest such start — app/models/trade_schedule.rb:53,85-90, app/workers/notify_planners_on_evaluation_start_worker.rb:7-12
2. [side-effect] Push + RfpEmailNotificationWorker "notify_evaluators_on_technical_evaluation_start" — app/workers/notify_planners_on_evaluation_start_worker.rb:13-15
3. [visibility] Recipients = `owner` access-list users/team members of the line items (lot RFP: the first form's owners, all line items); each gets only its own line items — app/workers/rfp_email_notification_worker.rb:18-45,79-99
4. [side-effect] Evaluators added later to a form get "notify_evaluators" mail for that line item — app/helpers/api/evaluations_helper.rb:722-729, app/workers/rfp_email_notification_worker.rb:66-77
Gaps: moving evaluation start earlier leaves the old job, which sends a second time; `notify_evaluators` treats team ids as user ids and does not nil-check the line item — app/workers/rfp_email_notification_worker.rb:67-75
Cites: app/workers/rfp_email_notification_worker.rb:1-100

### RFP evaluation submitted — mail to buyer
Rules:
1. [state] Fires when a Proposal on a TradeRequest becomes `selected` — app/models/proposal.rb:116-122
2. [state] Skipped for lot-based RFP evaluation, non-RFP or inactive stages — app/workers/rfp_email_notification_worker.rb:47-54
3. [visibility] Mail shows the evaluator (proposal creator) and the FIRST line item of the proposal's scores — app/workers/rfp_email_notification_worker.rb:55-63
Gaps: empty `responses_hash["data"]` or missing scores → NoMethodError — app/workers/rfp_email_notification_worker.rb:57-58
Cites: app/workers/rfp_email_notification_worker.rb:47-64

### Daily pending-evaluation digest (09:00, company 25686)
Rules:
1. [time] Cron `0 9 * * *` with company_ids [25686] — config/sidekiq.yml:150-156
2. [state] Line items: active, project `active` with closed_at nil, event_statuses contains "rfp_pending" and not "po_generated", meta_data.pending_on_evaluator_ids is an array — app/services/pending_evaluations/daily_pending_evaluation_service.rb:61-75
3. [calculation] Per (company, evaluator): line_item_count, distinct events_count, up to 5 preview ids — app/services/pending_evaluations/daily_pending_evaluation_service.rb:22-52
4. [state] Mail only to an active user with email and an active mapping to that company; preview skips inactive projects; "expires in" from the latest active `extra_closing_time` end — app/workers/daily_pending_evaluation_reminder_worker.rb:7-86
Gaps: the jsonb alias is passed to JSON.parse; if ActiveRecord already casts it to an Array, TypeError is caught by the outer rescue and NO digests are sent (unverified) — app/services/pending_evaluations/daily_pending_evaluation_service.rb:26-27,53-56
Cites: app/workers/daily_pending_evaluation_mailer_worker.rb:1-25, app/workers/daily_pending_evaluation_reminder_worker.rb:1-87

### Technical re-evaluation notifications
Rules:
1. [side-effect] trigger / accept / reject → TrReevaluationMailer mail + push "reevaluation" with status requested/accepted/rejected; revoke → mail only — app/workers/tr_reevaluation_notification_worker.rb:14-68
2. [visibility] Forms are read as the acting user (get_forms with Current.user) and filtered to the given form ids — app/workers/tr_reevaluation_notification_worker.rb:9-12
3. [state] trigger collects the still-requested additional requests per line item (or per form for lot RFP) — app/workers/tr_reevaluation_notification_worker.rb:26-37
Gaps: accept/reject/revoke with empty additional_request_ids → nil.pluck NoMethodError; `TradeRequest.find`/`User.find` raise for missing ids — app/workers/tr_reevaluation_notification_worker.rb:8-9,13,46,54,63
Cites: app/workers/tr_reevaluation_notification_worker.rb:1-69, app/controllers/api/v1/trade_controller.rb:1388

### Lot split and ownership transfer mails
Rules:
1. [visibility] Lot split: mail to active users in the parent stage's `active_participant_users` — app/workers/lot_split_notification_worker.rb:5-18, app/models/event_group.rb:898
2. [side-effect] Ownership transfer: "event assigned" to the new owner and "event unassigned" to the previous owner — app/workers/event_ownership_transfer_worker.rb:27-33, app/services/event_groups/transfer_ownership_service.rb:18
3. [state] Transfer mails skipped (logged to Slack) when the project is missing or either owner is inactive/has no email — app/workers/event_ownership_transfer_worker.rb:9-25
Gaps: lot split does not nil-check the new stage — app/workers/lot_split_notification_worker.rb:8-16
Cites: app/workers/lot_split_notification_worker.rb:1-20, app/workers/event_ownership_transfer_worker.rb:1-35

### Recurring projects — SchedulerWorker (every minute)
Rules:
1. [time] Picks `active` jobs with next_execution_at <= now + 15 minutes (LOOKAHEAD_WINDOW) and enqueues the executor immediately — clones run up to 15 minutes before the scheduled time — app/models/scheduled_job.rb:50-52, app/workers/scheduled_jobs/scheduler_worker.rb:7-23
2. [state] Row lock + re-check (active, next_execution_at present and within window) prevents duplicate enqueue — app/workers/scheduled_jobs/scheduler_worker.rb:9-13
3. [state] Finished when now >= ends_at or total_executions >= max_occurrences → status `finished`, source template project set `withdrawn` with closed_at now, activity "completed" — app/models/scheduled_job.rb:59-62, app/workers/scheduled_jobs/scheduler_worker.rb:15-18,39-49
4. [side-effect] Otherwise next_execution_at advanced and `notified_for_next_execution` reset BEFORE the clone runs — app/workers/scheduled_jobs/scheduler_worker.rb:20-23
Cites: app/workers/scheduled_jobs/scheduler_worker.rb:1-51, app/models/scheduled_job.rb:42-62

### Recurring projects — ExecutorWorker and the clone
Rules:
1. [config] Company `scheduled_events_enabled?` false → returns silently; that occurrence is lost (already advanced) — app/workers/scheduled_jobs/executor_worker.rb:14, app/workers/scheduled_jobs/scheduler_worker.rb:22
2. [state] Source template must be `active`, else "Source EventGroup is in draft state (likely being edited)" → execution `failed`, retry 2 — app/services/scheduled_jobs/handlers/event_group_clone.rb:15, app/workers/scheduled_jobs/executor_worker.rb:4,29-31
3. [calculation] Time shift = whole days (scheduled date − date of earliest non-in_active stage start); stage times keep the template's time of day — app/services/scheduled_jobs/handlers/event_group_clone.rb:35-38,105-113
4. [side-effect] New project title "<title> #<total_executions+1>", stages copied (not in_active), bids/scores cleared, audiences minus vendors now in_active/blacklisted for the buyer, then published as the template owner — app/services/scheduled_jobs/handlers/event_group_clone.rb:40-155
Gaps: withdrawn/cancelled template stages are cloned too (only in_active excluded) — app/services/scheduled_jobs/handlers/event_group_clone.rb:67; total_executions only counts successes, so failures allow extra occurrences beyond max_occurrences — app/workers/scheduled_jobs/executor_worker.rb:28
Cites: app/workers/scheduled_jobs/executor_worker.rb:1-47, app/services/scheduled_jobs/handlers/event_group_clone.rb:1-158

### Recurring projects — ScheduleBuilder time rules
Rules:
1. [validation] schedule_type daily/weekly/monthly/custom (custom needs repeat_type day/week/month) else ArgumentError; time_of_day must match HH:MM; weekly days_of_week 1–7 (ISO, Mon=1) and non-empty; monthly day_of_month 1–31 or last_day; interval < 1 → 1 — app/services/scheduled_jobs/schedule_builder.rb:23-56,222-273
2. [config] Missing `timezone` param → "UTC" — app/services/scheduled_jobs/schedule_builder.rb:26,66
3. [time] Daily: today at time_of_day if still ahead (first run), else +interval days; weekly interval > 1 counts weeks from the creation-week anchor; monthly day clamps to month end (31 → 30/28) — app/services/scheduled_jobs/schedule_builder.rb:154-219
4. [validation] Model rejects hours > 23 / minutes > 59 ("must include time_of_day in HH:MM format") though the builder regex accepts them — app/models/scheduled_job.rb:66-69 vs app/services/scheduled_jobs/schedule_builder.rb:224
Cites: app/services/scheduled_jobs/schedule_builder.rb:1-276

### Recurring projects — creator mails and pushes
Rules:
1. [side-effect] On create (EventGroup source): "schedule_created" mail, activity "scheduled", push "recurring_event_scheduled" — app/models/scheduled_job.rb:40,72-78
2. [time] Hourly: active jobs with next_execution_at in (now, now+2h] and not yet notified get "upcoming_execution" mail once per occurrence — app/workers/scheduled_jobs/upcoming_email_worker.rb:6-21
3. [visibility] Mails go only to the job's user, if it has an email — app/workers/scheduled_jobs/email_worker.rb:13-25
4. [time] Push shows the start date in user zone, else company zone, else UTC — lib/modules/push_notification.rb:3873-3875
Cites: app/workers/scheduled_jobs/*.rb

### Custom-template mails — Notifications::Send
Rules:
1. [config] Template = last active CommunicationTemplate for (company, template_key); none → MissingTemplateError — app/services/notifications/send.rb:22,127-130
2. [visibility] Recipient: active user's email, else invitation email, else context email; none → skipped (logged) — app/services/notifications/send.rb:102-113
3. [config] Company `keep_buyer_in_new_order_email_notification_cc?` adds the owner as CC — app/services/notifications/send.rb:17
4. [config] Company `use_recipient_timezone_for_emails?` renders times in the recipient's zone (user → audience company → buyer) — app/services/notifications/send.rb:43-58
5. [time] `send_mail_at` schedules delivery with content rendered at enqueue time (vendor-onboarding invites at bid_start_time) — app/services/notifications/send.rb:114-124, app/services/vendor_onboarding/invite_mailer.rb:30,44
Gaps: scheduled templated mails are not re-checked at send time (withdrawn/rescheduled events still mail stale content) — app/services/notifications/send.rb:114-118
Cites: app/services/notifications/send.rb:1-132

### Mail delivery layer — CustomMailDeliveryJob and EmailDelivery
Rules:
1. [config] Every mail is sent only when `Rails.application.config.send_mail` is true (checked at each call site) — e.g. app/workers/email_notification_worker.rb:221
2. [side-effect] A mail with no To and no CC is dropped and logged ("To address is required to send an email") — app/jobs/custom_mail_delivery_job.rb:15,95-101
3. [config] Company config `smtp_integration_enabled` = microsoft_graph AND env GRAPH_* for the company → Microsoft Graph; any error building it → SMTP — app/services/email_delivery/delivery_strategy_factory.rb:21-33, app/services/email_delivery/microsoft_graph_delivery_strategy.rb:33-69
4. [config] google/microsoft/sendgrid/mandrill SMTP from env per company with from header SMTP_FROM_HEADER_<id>; ProcolVariable USE_CUSTOM_MAILER = "true" routes non-default-SMTP mails without attachments to the custom_mailer queue — app/mailers/application_mailer.rb:11-58, app/jobs/custom_mail_delivery_job.rb:25-39,124-129
Cites: app/jobs/custom_mail_delivery_job.rb:1-130, app/services/email_delivery/*.rb

### Disabled / dormant workers
Rules:
1. [side-effect] AuctionCloseSlackWorker returns on its first line — still scheduled on every closed_at change, does nothing — app/workers/auction_close_slack_worker.rb:9-13, app/models/trade_request.rb:2289-2303
2. [side-effect] VendorInviteReminderWorker returns immediately although cron runs it daily at 10:00 (planned reminders on days 1,2,3,5,8,13,21) — app/workers/vendor_invite_reminder_worker.rb:7-9, config/sidekiq.yml:115-120
3. [side-effect] Buyer push "10 minutes before auction ends" is commented out — app/models/trade_request.rb:296,2272-2278
4. [side-effect] ReminderService channel :notify / both are no-ops; only :email sends — app/services/reminder_service.rb:2-10
Cites: as listed

### Approval alert timers (AlertReminderWorker) and daily close-bid approval digest
Rules:
1. [config] Alert type "approval_workflow" uses company config `approval_flow_alert_timers`; each timer's `alert_type` may include notification / mail / slack / ms_teams (slack/teams only if `third_party_communication_integration_allowed` includes them) — app/workers/alert_reminder_worker.rb:7-37,120
2. [time] Timer time: "now"; "ratio" → start + (end − start) × value; "absolute" → end − value seconds; skipped if end < start — app/workers/alert_reminder_worker.rb:23,93-102
3. [side-effect] Mail = ApproverInviteWorker, push = "approval_workflow_approval_creation" (now or at the computed time); Slack/Teams only for "now" — app/workers/alert_reminder_worker.rb:39-91
4. [time] TradeApprovalAllWorker (daily 18:00): close-bid approval requests created today on bids with status 6 with `request_closing_approval`, one consolidated mail per approver if the requesting company has `is_consolidate_approval_mail_required_to_close_bid?` — app/workers/trade_approval_all_worker.rb:7-21, config/sidekiq.yml:76-79
Gaps: scheduled approval reminders are not cancelled when the approval is acted on (no re-check here; unverified in ApproverInviteWorker) — app/workers/alert_reminder_worker.rb:45,56
Cites: app/workers/alert_reminder_worker.rb:1-142, app/workers/trade_approval_all_worker.rb:1-23
