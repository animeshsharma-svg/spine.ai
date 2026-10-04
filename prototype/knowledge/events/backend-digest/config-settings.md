# Config settings that change event behaviour — backend digest (procol-backend origin/main ae36e86894)

## Overview
Every company setting, template setting and per-stage config key that changes how an event (RFQ, RFP, auction) behaves, with where it is stored, its default, every backend read, and what it changes.
Three storage layers:
- Company / Template settings: `custom_configurations` rows (per company or template) over `master_configurations` defaults, read through `CustomConfiguration.cached_all_configs` — app/models/custom_configuration.rb, app/models/master_configuration.rb. Defaults live in db/migrate (named per section). Where no migration exists the default is the code fallback.
- Stage config: `trade_requests.config` (json). Built when a stage is created or edited by copying ALL Template + Company settings into it — app/controllers/concerns/trade_controller_helper.rb:3131-3165, 3277-3403. Predicates live in app/models/model_helpers/trade_request_model_helper.rb.
- Project config: `event_groups.config` (e.g. `show_under_open_events`). See models-event-group.md "Project config flags and their defaults".
User-level settings (item_type "User") exist but no event code reads them.
Key point for testers: a setting read from `trade_request.config` is a SNAPSHOT taken when the stage was created or last edited. A setting read through `cached_all_configs(company)` is LIVE. The two disagree after the company changes the setting.
Not repeated here: dynamic time extension (auction-templates.md), award quantity checks (evaluation-award.md), amendment guards (models-event-group.md), OTP unlock steps (trade-live-v1.md).

### CustomConfiguration.cached_all_configs — how a company setting's value is resolved and cached
Every live company/template setting read goes through this method.
Rules:
1. [config] Value order: the company's (or template's) active `custom_configurations` row → else the master default. Master rows are kept only if `company_id` is NULL or equals this company — app/models/custom_configuration.rb:164-173
2. [config] Custom rows are cached in Rails.cache for 24 h per (item_type, item_id, company_id) and again per request (`Current`) — custom_configuration.rb:126-145, 175-177
3. [config] Master defaults are cached under one key "mcfg" for 24 h — app/models/master_configuration.rb:34-53
4. [side-effect] Saving a custom row writes its new value straight into the cache (no wait for expiry) — custom_configuration.rb:32, 188-193
5. [validation] Only one active custom row per (key, company, item_type, item_id); a second → "Key already exists" error — custom_configuration.rb:195-199
Gaps: `update_cache` does not look at `status`. If a row is set to in_active (console/data fix), its value is still written into the cache and stays in effect for up to 24 h — custom_configuration.rb:188-193
Cites: app/models/custom_configuration.rb:126-199

### MasterConfiguration cache — company-specific defaults can hide the global default
A master default can be global (`company_id` NULL) or for one company. Two rows with the same key are allowed when their company_id differs — app/models/master_configuration.rb:97-101.
Rules:
1. [config] The "mcfg" cache is keyed only by item_type → config_key, so the last row loaded overwrites the others with the same key — master_configuration.rb:42-46
2. [config] `cached_all_configs` then drops that row when its company_id belongs to another company — custom_configuration.rb:169
Gaps: if a company-specific master row for key K exists, other companies can read K as nil (not the global default), or that company can get the global default instead of its own — depending on load order. The settings-screen path (`get_custom_configs`) does handle company-specific defaults, so the screen and the runtime can show different values — custom_configuration.rb:36-58 vs 164-173 (unverified whether any company-specific master rows exist in production).
Cites: app/models/master_configuration.rb:34-101; app/models/custom_configuration.rb:164-173

### custom_configuration#update_or_create — POST /api/custom_configuration/update_or_create — who may change a setting
How a company or template setting is changed from the console.
Rules:
1. [permission] Only super admins and Procol employees; anyone else → 455 "You are not authorized to perform this action" (HTTP 422) — app/controllers/api/custom_configuration_controller.rb:8; app/policies/custom_configuration_policy.rb:8-10
2. [validation] item_type not in SUPPORTED_CONFIG_TYPES, or the key has no active master row → 1103 "The Config type is not supported" (HTTP 422) — custom_configuration_controller.rb:22-26
3. [permission] Keys whose master row is `in_visible` can be changed only by Procol employees; `visible` keys also by super admins — app/models/master_configuration.rb:65-75
4. [validation] item_type Template without `id` → 2 "Insufficient parameters" — custom_configuration_controller.rb:29-31
Gaps: `modifications` is stored as sent. It is not checked against the key's input_type or data_set, so `{"value":"false"}` (a string) is saved, and a string "false" counts as ON for every `|| false` or `.present?` predicate (see the truthiness section) — custom_configuration_controller.rb:47-50
Cites: config/routes.rb:668-670; app/controllers/api/custom_configuration_controller.rb:7-53

### Setting truthiness — `== true` vs `|| false` vs `.present?` vs missing key
The same stored value means different things depending on how the reading code tests it.
Rules:
1. [config] Strict `== true`: only JSON true turns these on — is_add_new_stage_allowed (app/models/event_group.rb:530), enable_template_access_filtering (app/models/company.rb:296-297), attachment_token_url_enabled (company.rb:308-309), show_rank_to_sellers (trade_request_model_helper.rb:152-153), keep_buyer_in_new_order_email_notification_cc in the stage (trade_request_model_helper.rb:543-544)
2. [config] Ruby truthy `|| false`: any non-nil, non-false value is ON, including "false" and 0 — e.g. rfx_project_enabled (company.rb:222-223), is_buyer_not_allowed_to_add_surrogate_bid (trade_request_model_helper.rb:916-917)
3. [config] `.present?`: "" and [] and {} are OFF, "false" is ON — e.g. scheduled_events_enabled (company.rb:246-247), email_bidding_enabled (company.rb:1000-1001), lock_quote_after_submission (trade_request_model_helper.rb:1215-1216)
4. [config] Default ON when the key is missing from the stage config: is_allowed_to_revoke_bid (:331-332), is_over_quantity_allowed (:181-182), is_under_quantity_allowed (:189-190), is_price_increase_allowed / is_price_decrease_allowed (:69-78, 98-107), allow_price_reversal_in_counter_offer_in_rfq (:90-95), is_user_allowed_to_modify_audience (:936-941), is_vendor_allowed_to_view_bid_count (:1388-1390), show_company_profile (:10-13), show_default_savings (:998-999), allow_over_quantity_bid_approval unless exactly false (:1104-1105), allow_bid_selection_for_unverified_vendor (app/models/trade_request.rb:1504-1509), is_tie_bid_allowed (app/controllers/concerns/bids_controller_helper.rb:125), enable_bid_revision_notification (app/models/bid.rb:2320)
Cites: app/models/model_helpers/trade_request_model_helper.rb (lines above)

### Stage config snapshot — get_config_for_new_trade copies Template + Company settings into trade_request.config
When a stage is created or reconfigured, every Template-level and Company-level setting is copied into `trade_request.config`.
Rules:
1. [config] With a template: Template settings are merged first, then Company settings. A key that exists at both levels takes the COMPANY value — app/models/custom_configuration.rb:98-106; trade_controller_helper.rb:3142-3143
2. [config] No template (old v1 flow): `app_configuration.config` order_config + global_config + procol_defined_configurations, then the merged settings — trade_controller_helper.rb:3134-3141
3. [config] Stage created by a super admin: `trade_audience_flow` = true and `is_buyer_not_allowed_to_add_surrogate_bid` = false are forced into the config, whatever the company says — custom_configuration.rb:108-110
4. [config] Template with section_wise_scoring_enabled → `section_wise_scoring_enabled` true and `section_wise_max_score` = template value or 5 — trade_controller_helper.rb:3144-3148
5. [config] Every create path calls set_configurations_for_trade: trade#create, quick-flow RFQ/RFP, RFQ→auction, lots, and PATCH /trade/:id with `configurations` (a live edit takes a new snapshot of current company settings) — app/controllers/api/trade_controller.rb:165, 733; app/services/trade_requests/create/rfq.rb:9; rfp.rb:10; app/services/rfq_to_auction/create_service.rb:148; app/services/create_event_lots/create_service.rb:112
Cites: app/controllers/concerns/trade_controller_helper.rb:3131-3165, 3277-3329

### set_configurations_for_trade — config keys forced on every new or edited stage
Values the backend writes into the stage config no matter what the company setting is.
Rules:
1. [config] order_type buy → is_price_decrease_allowed = true, is_price_decrease_approval_required = false; any other order_type → is_price_increase_allowed = true, is_price_increase_approval_required = false — trade_controller_helper.rb:3150-3159
2. [config] `is_price_increase_approval_required` column = config value or false — :3328
3. [config] default_currency = the company default currency, snapshotted — :3369
4. [config] auction_closing_mode = param or "lot_based"; book_building or alternate bidding force "line_item_based"; rank_type = "inline" for line_item_based — :3349-3353, 3389
5. [config] Line-item closing or RFQ → update_trade_end_time = false; dutch → is_order_allowed_to_close_in_extra_closing_time_only = false — :3383-3386
6. [config] num_revisions_req_to_show_indicator ≠ 0 → show_best_price_stepper = false — :3372-3373
7. [config] send_rfp_to_evaluation_manually = the CURRENT WORKSPACE setting (not the event company's) — :3392
8. [config] BOQ stage with last-purchase-price savings on → turned "off" — :3345-3347
9. [config] auto_awarding_enabled present → allow_fixed_quantity_for_bidding = true; weighted events also force it — :3605-3606, 3863
10. [config] is_tnc_mandatory = param as sent (nil when absent) — :3391, 3718
Cites: app/controllers/concerns/trade_controller_helper.rb:3277-3403

### Quick-flow stage defaults — TradeRequests::Base#create_trade_config_hash
Default config of a stage created from the eRFX quick flow (new record).
Rules:
1. [time] bid_end_time = start + `clara_company_policies.bid_end_time_duration` (default 2 days); extra_closing_time = start + `evaluation_time_extension` days (default 4) — app/services/trade_requests/base.rb:59-61, 72-74
2. [config] is_tnc_mandatory false, is_english_auction_enabled false, is_alternate_bidding_allowed false, dynamic_closing_time_strategy "price_based", closing_mode "single", is_auction_on_base_price true, end_price 0 — base.rb:62-86
3. [config] auction_closing_mode = company `default_closing_mode`; rfp_evaluation_mode = company `default_rfp_evaluation_mode` (forced "lot_based" for BOQ projects) — base.rb:69-70; trade_controller_helper.rb:5576-5592
4. [config] Editing an existing stage keeps its config and only refreshes order_type, title, rfx_mode and times — base.rb:87-99
5. [time] New RFP stage added after an RFQ → bid_end_time = the RFQ's last bidding window end — base.rb:101-105
Cites: app/services/trade_requests/base.rb:57-107

### Live vs snapshot — which settings change events that already exist
Rules:
1. [config] Snapshot (copied at stage create/edit, read from trade.config): lock_bid_by_default, can_buyer_edit_bid, update_only_creator_scores_in_evaluation, is_user_allowed_to_modify_audience, is_vendor_allowed_to_view_bid_count, allow_bid_selection_for_unverified_vendor, is_allowed_to_add_surrogate_bid_post_expiry, is_sourcing_mandatory_bid_fee_enabled (payment form), send_rfp_to_evaluation_manually, send_new_bid_mail, restrict_unlock_bid_before_evaluation, vendor masking keys, rfx_project_enabled (TradeRequest#rfx_project_enabled?) — trade_request_model_helper.rb:1207-1216, 1362-1376, 1487-1489, 1523-1524
2. [config] Live (read from the company each time): restrict_event_visibility_to_owner, is_partial_awarding_enabled, is_over_awarding_allowed, is_event_versioning_enabled, allow_versioning_post_auction, is_add_new_stage_allowed, trade_force_close, peer_review_enabled, budget_tolerance_limit, allowed_surrogate_bid_even_after_bid, enable_open_tender_events, route_auctions_to_auction_team
3. [config] An open-tender flag change takes effect on a stage only at its next save (`tender` is recomputed before_save) — app/models/trade_request.rb:277, 3152-3159
Gaps: the console gets some snapshot settings live from GET /v1/dashboard_configuration (e.g. `can_buyer_edit_bid`, `peer_review_enabled`), so after a company change the screen and the API disagree on older events — app/controllers/api/v1/users_controller.rb:594, 746 vs trade_request_model_helper.rb:1211-1212
Cites: as listed

### UI-only company settings — exposed to the console, never checked by the API (part 1)
These settings are sent to the console in dashboard_configuration but no backend code enforces them. A direct API call ignores them. Searched app/ and lib/.
Rules:
1. [config] `lock_vendors_addition_in_event_creation` — only exposed — app/controllers/api/v1/users_controller.rb:568, 696
2. [config] `allowed_maximum_line_items` — only exposed; no line-item count limit on create — users_controller.rb:593, 732
3. [config] `allow_zero_value_in_widgets` — only exposed — users_controller.rb:563, 726
4. [config] `enable_upload_bid_during_best_offer` — only exposed — users_controller.rb:659, 795
5. [config] `show_best_price_by_default_in_english_auction` — only exposed — users_controller.rb:578, 701
6. [config] `default_multi_currency_precision` — only exposed — users_controller.rb:633, 756
7. [config] `show_line_lot_evaluation` — only exposed — users_controller.rb:649; app/models/company.rb:304-306
Gaps: each item is a client-only guard (expected to be enforced server side for at least items 1, 2, 4) — users_controller.rb lines above
Cites: app/controllers/api/v1/users_controller.rb:555-600, 640-800

### UI-only company settings — withdraw, reject vendor, approval remarks (part 2)
Rules:
1. [permission] `hide_withdraw_in_intake_and_event` on → the console flag says only super admins may withdraw — app/helpers/api/users_helper.rb:165-175; users_controller.rb:638
2. [state] `disable_withdraw_during_submission_time` on + auction → serializer flag `disable_withdraw_for_submission_time` — app/serializers/trade_template_serializer.rb:140-141
3. [permission] `allow_reject_vendor_from_project` → console flag only for purchasers / auction team — users_controller.rb:615, 718
4. [validation] `mandatory_approval_remarks` and stage `is_remark_required_to_accept_approval` are sent to the console only — users_controller.rb:540; app/models/model_helpers/trade_request_model_helper.rb:762-766; app/controllers/api/v1/additional_requests_controller.rb:47, 82, 123
Gaps: no withdraw path reads items 1-2 (only the users_helper predicate and the serializer read them) — users_helper.rb:165-175. POST event_groups/:id/reject_participant checks purchaser/auction team and proposals but not `allow_reject_vendor_from_project` — app/controllers/api/event_groups_controller.rb:980-1000; event_group_controller_helper.rb:2557-2577. Approval accept/reject does not require a remark when these flags are on (no reader).
Cites: as listed

### restrict_event_visibility_to_owner — which events a buyer sees in lists
Company setting (Company, in_visible, default false — db/migrate/20260319072914_create_restrict_event_visibility_to_owner_config.rb:3-17). When on, buyers who are not in a planning designation see only events they own.
Rules:
1. [visibility] Planning designations (section_incharge, line_incharge, planner, area_incharge) are exempt — app/models/user.rb:158
2. [visibility] Home/history list, buyer, setting on → only `get_owned_trades`: the user's access-list-owned projects, or projects they created that have no owner list, or ones where they are an approver, a chat assignee, or shared on — app/controllers/concerns/trade_controller_helper.rb:2416-2424, 6085-6099
3. [visibility] Setting off → own events plus every event of the allowed companies (team view) — :2421-2423
4. [visibility] Live page (approval flow v2) → owned trades instead of team/approver identifiers; super admins and Procol employees see all — :6052-6067
5. [visibility] RFI/RFP list identifiers drop the bare company tag ("c<id>") for non-planners, so RFPs shared only by company are hidden — app/services/trade_identifiers/create_service.rb:18-29; trade_controller_helper.rb:6059-6060
6. [visibility] Drafts: owned + shared drafts; auction-team members also get drafts shared with them — trade_controller_helper.rb:6106-6113
7. [visibility] `creator_ids` filter means OWNER when on, CREATOR when off — :6033-6042; app/controllers/concerns/event_group_controller_helper.rb:1186-1196
Cites: app/controllers/concerns/trade_controller_helper.rb:2409-2424, 6033-6120

### restrict_event_visibility_to_owner — detail page, notifications and gaps
Rules:
1. [permission] Project detail: GET /event_groups/:id refuses a non-owner (101) — see event-groups.md; owner = the active `owner` access list only when the setting is on — app/models/event_group.rb:1227-1235
2. [side-effect] Auction created / scheduled push to admins: setting on → only the company's super admins (except the creator); off → active buyer managers/admins of the matching category teams — lib/modules/push_notification.rb:603-618, 637-650
Gaps: stage-level reads are not owner-checked. GET /trade/:id uses TradeRequestPolicy#show? (trade read_record only) and validate_event → is_allowed_to_view?, neither of which checks ownership, so a same-company buyer who is refused the project page can open its stages by id (unverified for every stage endpoint) — app/policies/trade_request_policy.rb:40-42; app/controllers/api/trade_controller.rb:1046-1071; trade_controller_helper.rb:2214-2222. proposal_helper reads the key from `event_group.config` (never written anywhere), so the new draft proposal is never re-assigned to the owner — app/helpers/api/proposal_helper.rb:441-443
Cites: app/controllers/api/event_groups_controller.rb:139-144; lib/modules/push_notification.rb:603-650

### Vendor-name masking — is_vendor_masking_enabled and who sees "Vendor N"
Stage keys: `is_vendor_masking_enabled`, `is_vendor_masking_allowed_for_everyone`, `is_vendor_masking_allowed_for_everyone_except_super_admin` (Company master configs, default false — db/migrate/20231012101552_update_vendor_masking_configuration.rb:3-27; snapshotted).
Rules:
1. [visibility] allowed_for_everyone → masked for every buyer while is_vendor_masking_enabled; ..._except_super_admin → masked for everyone except super admins; neither → never masked — trade_request_model_helper.rb:1223-1230
2. [visibility] Masking applies only while the stage is upcoming or running and only to users of the event's company — :967-969
3. [visibility] Masked users get "Vendor N" in reports (approved quotation, comparison, BOQ, master QCS) — app/data_models/approved_quotation_report_data_model.rb:109; app/data_models/auction_bids_comparison_report_data_model/base.rb:187; app/services/reporting_engine/boq/boq_report.rb:179
4. [calculation] N = 1 + the vendor's position among companies ordered by their first non-draft bid id; an earlier label is reused on revision — app/controllers/concerns/bids_controller_helper.rb:2473-2481; for RFP responses N = active responding companies + 1 — app/services/template_responses/update_service.rb:86-90
5. [visibility] Masked → suspicious-bid indicator hidden; new-bid email to buyer suppressed; push says "someone placed a bid" — trade_request_model_helper.rb:81-88; app/models/bid.rb:275-280; lib/modules/push_notification.rb:705-715
Cites: app/models/model_helpers/trade_request_model_helper.rb:967-969, 1223-1255

### Vendor-name masking — how it is switched on (vendor_masking_true, toggle) and the API gap
Rules:
1. [config] Company `vendor_masking_true` (no master migration; nil = off) on → every new stage gets is_vendor_masking_enabled = true and ..._except_super_admin = true; the request param is ignored — trade_controller_helper.rb:3396-3399
2. [config] Otherwise, if masking is allowed for the stage, is_vendor_masking_enabled = param or false — :3400-3402
3. [permission] Console toggle shown only to a super admin of the event's company, stage upcoming/running, not dutch, masking allowed — trade_request_model_helper.rb:1236-1239; app/serializers/trade_template_serializer.rb:122
4. [state] PATCH /trade/:id with `is_vendor_masking_enabled` changes it whenever masking is allowed for the stage — app/controllers/api/trade_controller.rb:490-492
Gaps: the API toggle (rule 4) does not check super admin, dutch, or upcoming/running, so any user who may update the stage can unmask vendor names during a live event. The UI predicate (rule 3) is stricter — trade_controller.rb:490-492 vs trade_request_model_helper.rb:1236-1239
Cites: app/controllers/concerns/trade_controller_helper.rb:3396-3402; app/controllers/api/trade_controller.rb:486-492

### Event masking / closed envelope — event_masking_on_*, closed_envelope_bidding_for_*, enable_bid_masking_for_event
Stage keys that hide bids and bidders from the buyer while bidding runs.
Rules:
1. [visibility] `event_masking_on_auctions` (auction) / `event_masking_on_rfqs` (RFQ) on → bidding stats masked for buyer-company users who are not super admin and not shared as owner, while upcoming/running and not in best-offer time — trade_request_model_helper.rb:236-243, 258-268
2. [visibility] `closed_envelope_bidding_for_auctions` / `_for_rfqs` on → masked for EVERY buyer-company user incl. super admins while upcoming/running — :246-253, 262-263
3. [visibility] Auction-team members are never masked — :259
4. [config] Company `enable_bid_masking_for_event` (Company, visible, default false — db/migrate/20260714064847...:3-17) on → the two closed_envelope keys are copied from request `configurations` at create; off → those params are ignored — trade_controller_helper.rb:3330-3335; users_controller.rb:658, 794
5. [visibility] `show_bidding_stats_in_masked_events` (default false) + masked → buyer sees only placed-bid stats while running; `show_placed_bids_stats` key present → its value for non-super-admins — trade_request_model_helper.rb:289-305
Gaps: PATCH /trade/:id `trade_config` replaces the whole stage config for non-Procol users without validation, so closed_envelope / masking / lock keys can be set or cleared outside the enable_bid_masking_for_event gate — app/controllers/api/trade_controller.rb:748-749
Cites: app/models/model_helpers/trade_request_model_helper.rb:236-305

### lock_bid_by_default — sealed price rounds, unlock options and the evaluation rule
Company keys (Company, in_visible): `lock_bid_by_default` default false (db/migrate/20250124072219_add_unlock_bid_config.rb:4-17), `restrict_unlock_bid_before_evaluation` default false (20250526061656...:5-17), `unlock_bids_restriction_options` default [{key: "everyone", label: "Everyone"}] (20250530124107...:3-19), `show_unlock_bid_history` default false (20260105122039...:5-17). The first three are read from the stage snapshot.
Rules:
1. [visibility] Locked for a buyer-company user on non-RFI/RFP stages unless the active "bid_visibility" field holds "everyone" or that user's id — trade_request_model_helper.rb:273-284
2. [state] Send-OTP refuses 790 "Bids can't be unlocked until technical evaluation is done" (HTTP 422) when the project's technical round has restrict_unlock_bid_before_evaluation and is not evaluated — app/controllers/api/v1/trade_controller.rb:1261-1264
3. [config] `unlock_bids_restriction_options` is only sent to the console — app/serializers/trade_template_serializer.rb:133
4. [visibility] show_unlock_bid_history on → unlock history in the awarding proposal report — app/data_models/awarding_proposal_report_data_model.rb:449-451
Gaps: verify-OTP does not re-check restrict_unlock_bid_before_evaluation (an OTP sent before re-evaluation still unlocks) — trade_controller.rb:1270-1289. The chosen `bid_visibility` is not checked against unlock_bids_restriction_options; "everyone" is accepted even when the company offers only "self" — trade_controller_helper.rb:5633-5647
Cites: app/models/model_helpers/trade_request_model_helper.rb:1487-1493, 1523-1525

### Vendor-facing visibility keys — bid count, hidden widgets, company profile in notifications
Rules:
1. [visibility] `is_vendor_allowed_to_view_bid_count` (Company, default true — db/migrate/20240723123235...:5-11) false → event list cards return bid_count nil to vendors — app/serializers/trade_request/card_serializer.rb:295-299
2. [visibility] `hide_participants_widgets` + best-price / best-ranking / vendor-score / loading-factor rules → widget keys hidden from participants — app/controllers/concerns/trade_template_helper.rb:359-372
3. [visibility] `hide_participants_widgets` contains "gross_total" → a vendor's revised-bid total shows "" on the MOBILE app only — app/serializers/bid_template_serializer.rb:93-97
4. [visibility] `show_company_profile` == false (default true when key missing; old v1 flow default false) → buyer push says "someone submitted a quote/placed a bid" instead of the vendor name — trade_request_model_helper.rb:10-13; lib/modules/push_notification.rb:705-715; app/models/app_configuration.rb:25-33
5. [visibility] `is_show_user_name` false → bidder user name hidden in bid payloads — trade_request_model_helper.rb:198-203; app/serializers/bid_template_serializer.rb:212
Gaps: bid_count hiding exists only in the list-card serializer. TradeSerializer / TradeTemplateSerializer `bid_count` return bids_count with no check (unverified whether the caller blanks it for vendors) — app/serializers/trade_serializer.rb:101-102; trade_template_serializer.rb:351-352. Web vendors get the gross_total value that rule 3 blanks on mobile — bid_template_serializer.rb:93
Cites: as listed

### display_vendor_rank_in_auction_qcs — vendor rank column on auction QCS / indicators
Company setting (in_visible, default false — db/migrate/20251029100072_show_vendor_rank_in_auction_qcs.rb:3-17).
Rules:
1. [visibility] On → GET event_indicators includes vendor rank; a masked event returns {} first — app/controllers/api/v1/trade_controller.rb:538-545
2. [visibility] On → a `vendor_rank` global widget is inserted first in the comparison sheet — app/controllers/concerns/trade_template_helper.rb:6041-6045, 34
Gaps: the setting is read from `Current.workspace` (the CALLER's company), not the event's company. A vendor calling these endpoints gets its own company's value; a buyer workspace switch changes the result — trade_controller.rb:541; trade_template_helper.rb:34, 6042
Cites: app/controllers/api/v1/trade_controller.rb:534-546

### Full stage config sent to every viewer — trade_config in TradeTemplateSerializer
Rules:
1. [visibility] `trade_config` = the whole `trade_request.config` merged with computed flags; there is no allow-list (the allow-list helper is unused, `viewable_config` returns everything) — app/serializers/trade_template_serializer.rb:95-111, 143-144; app/helpers/api/trade_helper.rb:4-9, 20-31
2. [visibility] TradeSerializer#trade_config returns the raw config — app/serializers/trade_serializer.rb:317-319
Gaps: in GET /trade/:id (sheet-layout branch) a vendor gets this serializer, so the vendor can read every snapshotted company setting and keys such as `allowed_participants_to_edit_in_bid_review_time` (vendor company ids invited to best offer), `masked_lot_keys` and closed-envelope flags (unverified for other branches) — app/controllers/api/trade_controller.rb:1170, 1204-1212
Cites: app/serializers/trade_template_serializer.rb:95-148
