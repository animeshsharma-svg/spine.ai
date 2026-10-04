# Policies and serializers (who may, who sees what) — backend digest (procol-backend origin/main ae36e86894)

## Overview
Who may call an event action (Pundit policies) and which fields each actor gets back (ActiveModel serializers). Policies: app/policies/{application,trade_request,event_group,bid,proposal,template_response,evaluation}_policy.rb plus the permission helpers in app/models/user.rb, app/models/company.rb, app/helpers/api/team_permissions_helper.rb. Serializers: app/serializers/trade_request/{card,vendor_card,buyer_card}_serializer.rb, event_group/{card,show}_serializer.rb, event_group/tender/*, trade_template_serializer.rb, bid_template_serializer.rb, new_bid_serializer.rb, trade_serializer.rb, trade_product_serializer.rb, event_group_line_item_serializer.rb, proposal_serializer.rb, rejected_bids / bidder_remarks / participated_events serializers and the small ones.
Three layers decide access: (1) the calling app's route allow-list (config/app_auth_config.yml; the vendor website is client `agribid_website`, the buyer console `client_admin_dashboard`), (2) the policy, (3) in-code checks (validate_event → `is_allowed_to_view?`, company checks). Serializers mostly decide "buyer vs vendor" by `allowed_companies.include?(trade.company_id)` or by the app (`is_procol_dashboard?`), not by a role.
Model-level rules already in sibling digests: masking and `is_allowed_to_view?` (models-trade-request.md), project draft visibility (event-groups.md), the v1 shared gates (trade-live-v1.md). This file covers the policy layer and the serializers.

### Pundit wiring — how a policy is invoked and what a refusal returns
Every API controller includes `ApiAuth`, which includes Pundit; actions call `authorize record_or_class[, :action?]`.
Rules:
1. [permission] A policy method returning false raises Pundit::NotAuthorizedError → 455 "You are not authorized to perform this action" (HTTP 422) — app/controllers/concerns/api_auth.rb:16,117-119; config/locales/en-IN.yml:1634-1636
2. [permission] The policy user is `Current.user`, or the Procol `@employee` when no user is signed in — api_auth.rb:112-114
3. [permission] Before any policy runs, the calling app must list the controller+action in APP_AUTH_CONFIG, else "app_error_auth_failed" (HTTP 401) — api_auth.rb:78-96; config/initializers/load_config.rb:6
4. [visibility] Every `Scope#resolve` in the seven policies returns `scope.all` — no policy scope narrows records — application_policy.rb:44-46; trade_request_policy.rb:3-7; event_group_policy.rb:3-7; bid_policy.rb:3-7; proposal_policy.rb:3-8; template_response_policy.rb:3-7; evaluation_policy.rb:3-7
Gaps: `authorize nil` (record not found before authorize) raises Pundit::NotDefinedError, which is not rescued → untyped 500, e.g. trade#alternate_bidding_leader_board authorizes `TradeRequest.find_by_id` before any nil check — app/controllers/api/v1/trade_controller.rb:865-868
Cites: api_auth.rb:6-20,78-119

### Module permission check — is_allowed_to_perform_action? (trade read_record / create_record)
The helper behind almost every trade/event policy method (`module_name: "trade"`, `operation: "read_record"` or `"create_record"`).
Rules:
1. [permission] A user none of whose companies has category "client" (vendors, brokers) passes EVERY module/operation check — user.rb:897-898
2. [permission] Super admins and Procol employees pass every check — user.rb:900-902
3. [permission] Otherwise allowed only if a company-level permission (by user role) or a team-level permission (by team type + role) or a user-level permission names that module+operation; no permissions → false — user.rb:903-919; app/helpers/api/team_permissions_helper.rb:10-45
4. [config] Super admins get every team type's permissions; designation-only planners get planner-team permissions only when company setting `planner_role_based_permissions_enabled` is on — team_permissions_helper.rb:47-63
5. [side-effect] Permission sets are cached 12 h per company+role, company+team+role and user; saving a TeamPermission deletes the matching keys — team_permissions_helper.rb:14,36,40; app/models/team_permission.rb:79,85
Gaps: rule 1 means policy methods that are only `read_record`/`create_record` (show?, create?, trade_config?, l1_data_for_event?, event_schema? …) never stop a vendor; the route allow-list and validate_event are the only barriers — user.rb:897-898
Cites: user.rb:896-920

### Allowed companies and modes — Company.allowed_companies, authorized_modes, has_access_for_sourcing_events?
"Allowed companies" is what serializers and policies compare with the event's `company_id` to decide buyer vs vendor.
Rules:
1. [permission] Procol employee (current user, workspace set): [workspace] + own companies; otherwise CSM companies + own companies — app/models/company.rb:461-465
2. [permission] A buyer mapped to several client companies who picked one (`client_company_id`) is boxed to that company only — company.rb:466-468
3. [permission] Everyone else: all companies the user belongs to (cached 24 h, cleared when a user-company mapping changes) — company.rb:469-472; app/models/user_company_mapping.rb:108
4. [permission] authorized_modes = active team types in scope; Procol employee → ["customer_success"]; a user with no teams → ["purchase"] (unless boxed → []) — user.rb:563-576
5. [permission] is_purchaser? = modes include "purchase" or "customer_success" — user.rb:578-581
6. [permission] has_access_for_sourcing_events? is false only when the user's ONLY mode is vendor_management (super admin always true); such users get trade and intake modules hidden — user.rb:641-660
Gaps: rule 4 makes a vendor user with no teams a "purchaser" (mode "purchase"); see project show / event_schema sections for what that unlocks — user.rb:570-574
Cites: company.rb:461-473; user.rb:563-581,641-660

### TradeRequestPolicy — read actions that are only "trade read_record"
Used by GET stage screens (api/trade#show, v1 trade#event_schema, rejected_bids, bidder_remarks, event_indicators, l1_data_for_event, get_price_trends, bids#show).
Rules:
1. [permission] show?, home_page_request?, get_channel_identifiers?, download_zip?, rejected_bids?, bidder_remarks?, event_schema?, event_indicators?, get_price_trends?, l1_data_for_event?, bids_controller_show? all = trade `read_record` → 455 (HTTP 422) without it — app/policies/trade_request_policy.rb:9-11,40-66,137-139,163-165,188-190
2. [permission] These are called as `authorize TradeRequest` (class, no record) in api/trade#show, v1 event_schema, rejected_bids, bidder_remarks, event_indicators — so the event itself is checked only by validate_event (`is_allowed_to_view?` → 536 "You are not allowed to view this event." HTTP 422) — app/controllers/api/trade_controller.rb:1046-1047,1070-1071; app/controllers/api/v1/trade_controller.rb:261-277,531-537,597-602,622-627; app/controllers/concerns/trade_controller_helper.rb:2219-2221
Gaps: l1_data_for_event? is show? only, while aggregate_savings?/best_line_wise_savings?/alternate_bidding_leader_board? also require the event's company to be the caller's — a vendor who can view the stage passes the policy for L1 data; only the app allow-list (console apps only) stops it — trade_request_policy.rb:104-110,176-178,188-190; config/app_auth_config.yml:569
Cites: trade_request_policy.rb:9-66,137-139,163-165,188-190

### TradeRequestPolicy — create, trade_config and vendor-onboarding creation
Rules:
1. [permission] create? = trade `create_record` AND has_access_for_sourcing_events? → else 455 (HTTP 422) — trade_request_policy.rb:13-16
2. [permission] trade_config? = trade `create_record` only (no sourcing-access check) — trade_request_policy.rb:172-174
3. [permission] create_vendor_onboarding_events? requires workspace on vendor onboarding v2 AND create_record AND (vendor_management team or super admin) — trade_request_policy.rb:18-22; user.rb:631-635
4. [permission] create_vendor_onboarding_events_v3? = create_record AND (vendor_management team or super admin) — trade_request_policy.rb:24-27
5. [permission] create_update_vendor_onboarding_event?: buyer → create_record AND vendor-management/super admin; seller or broker → create_record only (always true for vendors, see module check); any other category → false — trade_request_policy.rb:29-38
6. [permission] add_new_stage_in_live_event? = stage owner OR create? — trade_request_policy.rb:192-194
Cites: trade_request_policy.rb:13-38,172-174,192-194

### TradeRequestPolicy#update? — edit a stage (also update_egli?, update_currency_exchange_rates?)
Rules:
1. [permission] Any Procol employee → allowed (no CSM check) — trade_request_policy.rb:74-77
2. [permission] Event company not in the caller's allowed companies → 455 (HTTP 422) — trade_request_policy.rb:78
3. [permission] No trade `create_record` → 455 — trade_request_policy.rb:79
4. [permission] Vendor-onboarding stage in a v2 workspace and caller not vendor-management/super admin → 455 — trade_request_policy.rb:80-83
5. [permission] Non-onboarding stage and caller only in vendor_management mode → 455 — trade_request_policy.rb:85-87
6. [permission] update_egli? and update_currency_exchange_rates? delegate to update? — trade_request_policy.rb:196-198,212-214
Gaps: EventGroupPolicy#update? allows a Procol employee only when CSM of the project's company, but TradeRequestPolicy#update? allows ANY Procol employee — inconsistent gate between project and stage edits — trade_request_policy.rb:75-77 vs event_group_policy.rb:37-40
Cites: trade_request_policy.rb:74-90,196-198,212-214

### TradeRequestPolicy — buyer-only data (savings, approvals, reports, leaderboard)
Rules:
1. [permission] aggregate_savings? and best_line_wise_savings? = show? AND event company in Current.allowed_companies → vendors get 455 (HTTP 422) — trade_request_policy.rb:104-110
2. [permission] get_approvals? and alternate_bidding_leader_board? = show? AND event company in Company.allowed_companies(user) — trade_request_policy.rb:117-119,176-178
3. [permission] auction_report_data? = show? AND (Procol employee OR company match) — trade_request_policy.rb:92-98
4. [permission] event_summary? = Procol employee OR company match (no read_record needed) — trade_request_policy.rb:112-115
5. [permission] edit_weight_parameters? = company match only (no permission check) — trade_request_policy.rb:100-102
6. [visibility] aggregate_savings also refuses with 577 "Savings will be visible after bidding ends" (HTTP 422) while event masking is on for the caller — app/controllers/api/v1/trade_controller.rb:560-567
Cites: trade_request_policy.rb:92-119,176-178

### TradeRequestPolicy — "allowed_to_view_event?" actions (show? AND is_allowed_to_view?)
Rules:
1. [permission] get_seller_delivery_stats?, add_audience_live_auction?, update_vendor_validations_for_trade?, send_notification_to_company_for_trade?, audience_for_product?, detailed_report?, download_report?, get_suspicious_bids_detail?, download_event_details?, upload_bid_excel? = trade read_record AND `record.is_allowed_to_view?(user)` — trade_request_policy.rb:121-147,154-156,168-170,180-186,222-224
2. [permission] move_to_auction? = create? AND allowed_to_view_event? — trade_request_policy.rb:158-160
Gaps: add_audience_live_auction? and update_vendor_validations_for_trade? are write actions gated like reads — any viewer of the stage, including an invited vendor, passes the policy (vendor apps do not list them; app allow-list only) — trade_request_policy.rb:125-131
Cites: trade_request_policy.rb:121-186,222-224

### bids#get_suspicious_bids_detail — suspicious-bid IPs and vendor names
GET bids get_suspicious_bids_detail (console apps only in the allow-list).
Rules:
1. [validation] Unknown trade_request_id → 95 "Trade Request not found" (HTTP 422) — app/controllers/api/bids_controller.rb:389-391
2. [permission] Policy get_suspicious_bids_detail? = read_record AND is_allowed_to_view? — trade_request_policy.rb:168-170
3. [config] Needs stage config `is_suspicious_bid_indicator_enabled` = true, names not masked for the caller, and (super admin or `read_only_mode_enabled` off) → else 101 "You are not allowed to perform this action" (HTTP 422) — bids_controller.rb:393; trade_request_model_helper.rb:81-88
4. [visibility] Response: per IP → location and the active vendor company names that bid from it — bids_controller.rb:394-405
Gaps: no buyer-company check anywhere — an invited vendor passes the policy and show_suspicious_bids? (masking applies to buyers only), so only the console-only allow-list hides other vendors' IPs and names — trade_request_policy.rb:168-170; config/app_auth_config.yml:974
Cites: bids_controller.rb:389-406

### TradeRequestPolicy#reject? — bids#reject (buyer rejects a vendor bid)
Rules:
1. [permission] Allowed when the stage is visible to the caller AND (super admin OR CSM of the event company OR stage owner OR auction-team member) → else 455 (HTTP 422) — trade_request_policy.rb:149-152
2. [permission] bids#reject authorizes only after loading the bid: unknown bid → 250 "No such bid exists"; bid not active → 101 (HTTP 422) — app/controllers/api/bids_controller.rb:272-282
3. [visibility] The UI flag `trade_config.is_allowed_to_reject_bid` uses the same OR without the visibility part — trade_template_serializer.rb:802-805
Gaps: `is_super_admin` is not scoped to the event's company in either place; a super admin of any company who can view the stage (an invited vendor's admin) passes reject? — bids#reject is console-only in the app allow-list, which is the only barrier — trade_request_policy.rb:151; trade_template_serializer.rb:804
Cites: trade_request_policy.rb:149-152; bids_controller.rb:272-305

### TradeRequestPolicy — misc gates (auction T&C, file upload, history, planner)
Rules:
1. [permission] accept_auction_tnc?: Procol employee or super admin → yes; else caller company is the event company OR among `total_participants` — trade_request_policy.rb:68-72
2. [permission] upload_file? = show? OR IntakeRequestPolicy#show? (marked "hotfix") — trade_request_policy.rb:200-202
3. [permission] trade_history? and update_widgets? → Procol employees only — trade_request_policy.rb:204-210
4. [permission] update_planner? = show? AND event company == current workspace AND workspace.update_planner_accessible_by?(user) — trade_request_policy.rb:216-218
5. [permission] create_update_vendor_onboarding_event and trade show are the only api/trade actions the vendor website may call (plus index, upload_file, add_variants, get_event_group_uuid, get_channel_identifiers) — config/app_auth_config.yml:1872-1881
Cites: trade_request_policy.rb:68-72,200-218

### EventGroupPolicy — project read gates (index, show, line items)
Rules:
1. [permission] index?, history?, scheduled?, update_eg_cards? = trade read_record → 455 (HTTP 422) — app/policies/event_group_policy.rb:9-19,29-31
2. [permission] show? = trade read_record AND `get_valid_stages_for_user(Current.user)` non-empty (draft project → owner/super admin/Procol only; else per-stage is_allowed_to_view?) → 455 — event_group_policy.rb:52-54; app/models/event_group.rb:511-526
3. [permission] download_zip?, get_line_items?, download_report? = show? — event_group_policy.rb:56-66
4. [permission] event_groups#show: unknown id → 533 "Project does not exist."; after the policy, no visible stage → 682 "You are not allowed to view this project." (both HTTP 422) — app/controllers/api/event_groups_controller.rb:130-135
5. [config] Buyer side only: company setting `restrict_event_visibility_to_owner` on and caller not a planning-team designation → non-owner gets 101 (HTTP 422) — event_groups_controller.rb:139-144
Gaps: show? already evaluates every stage's is_allowed_to_view?, and the controller repeats get_valid_stages_for_user — double work, same result — event_group_policy.rb:53; event_groups_controller.rb:134
Cites: event_group_policy.rb:9-66; event_groups_controller.rb:130-145

### EventGroupPolicy — create, update, version, clone, proposal
Rules:
1. [permission] create? = trade create_record — event_group_policy.rb:21-23
2. [permission] update?: Procol employee who is CSM of the project company → yes; else project company in Current.allowed_companies AND create_record — event_group_policy.rb:37-40
3. [permission] create_version? = update? AND create_record (redundant) — event_group_policy.rb:42-44
4. [permission] create_clone?: project company must be the caller's; needs create_record, caller not a planner designation, project not draft and not created from a PR — event_group_policy.rb:46-50
5. [permission] create_proposal? = update? (used by POST /proposal) — event_group_policy.rb:68-70; app/controllers/api/proposal_controller.rb:52
6. [permission] get_approvals? = company match only — event_group_policy.rb:72-74
7. [permission] move_purchase_request_items_to_draft_project? and purchase_cart_params? = create? AND company match — event_group_policy.rb:76-82
Cites: event_group_policy.rb:21-82

### EventGroupPolicy — owner-only actions and open tenders
Rules:
1. [permission] team_buyers? and change_ownership? = show? AND (super admin OR Procol employee OR project `user_id` == caller) → 455 (HTTP 422) — event_group_policy.rb:84-90
2. [permission] regenerate_master_qcs? only for Procol employees whose id is listed in ProcolVariable `ALLOWED_USER_IDS_TO_REGENERATE_MASTER_QCS` — event_group_policy.rb:92-97
3. [permission] participate? = show? AND the project company has open tenders (`enable_open_tender_events`) — event_group_policy.rb:25-27; app/models/company.rb:215-218
4. [permission] all? (open-tender listing) = caller category is not "buyer" AND the workspace (for a vendor: any active client it deals with) has `enable_open_tender_events` — event_group_policy.rb:33-35; company.rb:215-220
5. [visibility] The open-tender list uses EventGroup::Tender::VendorCardSerializer: id, title, company {name, image_url}, closing_at (= earliest open-tender stage bid_end_time), ref_uuid, categories {values, count}, created_at, latest_stage_time; max 10 projects — app/serializers/event_group/tender/card_serializer.rb:5-37; app/controllers/concerns/event_group_controller_helper.rb:2509-2517
Gaps: participate? needs show?, which needs a vendor relationship row to make is_allowed_to_view? true even for open tenders — a vendor with no relationship to the buyer cannot "participate" through this policy (unverified live) — event_group_policy.rb:25-27; trade_request_model_helper.rb:347-357
Cites: event_group_policy.rb:25-35,84-97

### BidPolicy — every bid action returns true
Rules:
1. [permission] template_input?, sheet_update?, create_bid?, revise_bid?, update_bid?, edit_bid?, index?, update_bid_status?, show?, get_bid_details? all `return true` — the policy never refuses; checks live in the controllers — app/policies/bid_policy.rb:9-47
2. [permission] approval_workflows_for_surrogate_bid_create? = approval_flows `read_record` — bid_policy.rb:49-51
3. [permission] add_feedback?: stage owner → yes; else event company must be the caller's AND (super admin OR stage config `is_allowed_to_close_bid`) — bid_policy.rb:54-60
4. [permission] bids#show additionally runs TradeRequestPolicy#bids_controller_show? (read_record) and `can_view_bid?`: bid author, OR caller company is the event company, OR caller company is the bidding company, OR broker/same-GST match → else 32 "Bid not found" (HTTP 422) — app/controllers/api/bids_controller.rb:147-156; app/models/user.rb:711-728
Cites: bid_policy.rb:1-61; bids_controller.rb:147-156

### bids#get_bid_details — GET /api/bids/get_bid_details — one vendor's bid with rank (super admin or owner)
Listed for the console and the Android consumer app.
Rules:
1. [validation] user_id, company_id or trade_request_id missing → 2 "Insufficient parameters"; stage not active/closed → 4 "Request not found" (HTTP 422) — app/controllers/api/bids_controller.rb:357-366
2. [permission] Allowed only to a super admin or the stage owner → else 101 "You are not allowed to perform this action" (HTTP 422); BidPolicy#get_bid_details? itself is always true — bids_controller.rb:358,367-369; bid_policy.rb:45-47
3. [calculation] Ranks all active/selected bids (RFQ / rfq_then_auction: add_rank_to_bids(all, false); auction: (all, true)) and returns the asked vendor's active/selected bid via NewBidSerializer with its revised bids — bids_controller.rb:370-381
Gaps: `is_super_admin` is not scoped to the event company — a super admin of any company can read any stage's bid by ids, and the route is also open to the Android consumer app — bids_controller.rb:367; config/app_auth_config.yml:85
Gaps: the user/company has no active or selected bid → `bid.id` on nil → untyped 500 — bids_controller.rb:371,378
Cites: bids_controller.rb:357-387

### bids#index — list bids of given vendors (super admin / Procol employee)
Rules:
1. [permission] Only super admin or Procol employee → else 101 (HTTP 422) — app/controllers/api/bids_controller.rb:133-135
2. [validation] `vendor_ids` filter missing → 5 "Not authorized" (HTTP 422) — bids_controller.rb:136
3. [time] Without `starting_from` only the last 30 days; ending_at defaults to now — app/controllers/concerns/bids_controller_filter_helper.rb:19-36
Gaps: Bid.all filtered only by vendor_ids — a buyer company's super admin lists those vendors' bids across ALL buyers (cross-tenant) — bids_controller.rb:137-138; bids_controller_filter_helper.rb:11-16
Gaps: date_filter_on_bid returns a 2-element array of relations that is rendered with each_serializer NewBidSerializer → likely untyped 500 (unverified live) — bids_controller.rb:139-141
Cites: bids_controller.rb:133-145

### ProposalPolicy — award proposal actions (show, add_response, submit, documents)
Rules:
1. [permission] add_response?: any Procol employee → yes; else proposal company in Company.allowed_companies(user) → else 455 (HTTP 422) — app/policies/proposal_policy.rb:18-23
2. [permission] show?, download_report?, approval_workflows_for_proposal_create?, submit?, document?, discard_draft_proposal? all = add_response? — proposal_policy.rb:10-16,25-31,37-43
3. [permission] create_contract_form? = add_response? AND workspace setting `is_contract_creation_enabled` — proposal_policy.rb:33-35
4. [permission] Creating a proposal goes through EventGroupPolicy#create_proposal? (company + trade create_record) — app/controllers/api/proposal_controller.rb:45-52; event_group_policy.rb:68-70
Gaps: creating a proposal needs trade create_record, but adding vendors, submitting, previewing the LOA and creating PO forms need only company membership — any user of the buyer company (viewer, planner, any role) passes ProposalPolicy — proposal_policy.rb:18-23; proposal_controller.rb:58-63,79-95,105-109,126-129
Gaps: any Procol employee (not only the company's CSM) passes every ProposalPolicy method — proposal_policy.rb:19-21
Cites: proposal_policy.rb:1-44; proposal_controller.rb:14-195

### TemplateResponsePolicy and EvaluationPolicy — vendor responses and evaluations
Rules:
1. [permission] TemplateResponsePolicy#update?: response company in Current.allowed_companies — template_response_policy.rb:9-11
2. [permission] resolution? (accept/reject a vendor-onboarding response): the response's item company must be the caller's; then item owner or super admin → yes; OR onboarding v2 item + company `allow_vendor_onboarding_team_send_for_approval?` + caller vendor-management/super admin; OR an update_vendor item + vendor-management/super admin; else 455 (HTTP 422) — template_response_policy.rb:13-35
3. [permission] applicable_approval_flows? = resolution? — template_response_policy.rb:37-39
4. [permission] reject_vendor? on a BuyerSellerCompanyMapping: client company must be the caller's AND vendor-management/super admin; on a response = resolution? — template_response_policy.rb:41-48; app/controllers/api/template_responses_controller.rb:178-185
5. [permission] EvaluationPolicy defines no action methods and nothing authorizes against it; evaluation permissions are checked in evaluations_controller code (see evaluation-award.md) — app/policies/evaluation_policy.rb:1-8
Gaps: the vendor website lists template_responses#resolution; resolution? correctly refuses vendors because the item company is the buyer's (positive control worth a test) — config/app_auth_config.yml:1931-1940; template_response_policy.rb:14
Cites: template_response_policy.rb:1-49; evaluation_policy.rb:1-8

### Which serializer an actor gets — app-based vs company-based switch
Rules:
1. [visibility] Project cards: EventGroup::CardSerializer renders each stage with TradeRequest::BuyerCardSerializer when the caller app is a Procol dashboard (`client_admin_dashboard` / `procol_admin_dashboard`), otherwise TradeRequest::VendorCardSerializer — app/serializers/event_group/card_serializer.rb:201-205; app/models/api_client.rb:44-46
2. [visibility] Project line items: `is_client_side` is true only for dashboard apps — event_groups_controller.rb:497-540
3. [visibility] Stage screens (TradeTemplateSerializer, TradeSerializer, CardSerializer) instead treat the caller as buyer when `allowed_companies` includes the stage's `company_id` — trade_template_serializer.rb:406-407; trade_serializer.rb:111-112; trade_request/card_serializer.rb:297,478
4. [visibility] Some fields switch on `Current.user.category` ("buyer"/"seller"/"broker") instead — card_serializer.rb:291,300,306,442; event_group/card_serializer.rb:54
Gaps: because cards and line items pick buyer vs vendor by app, a buyer using a non-dashboard app gets vendor cards, and a vendor calling with a dashboard app key gets BuyerCardSerializer (owner name, participant counts, best amount) and `is_client_side` line-item fields (last PO price/vendor) — event_group/card_serializer.rb:201-205; event_groups_controller.rb:497-504
Cites: event_group/card_serializer.rb:165-206; api_client.rb:44-46

### Vendor-name and event masking — where serializers apply them
Model rules are in models-trade-request.md (mask_participant_name?, event_masking_enabled?); this is where they bite.
Rules:
1. [visibility] `mask_participant_name?(user)` is true only for users of the EVENT company while the stage is upcoming/running and masking is enabled for them — so it hides vendor names from buyers, never from vendors — app/models/model_helpers/trade_request_model_helper.rb:967-969,1223-1230
2. [visibility] Masked buyers see `bid.other_details["company_name"]` (alias) instead of the name in BidTemplateSerializer, TradeSerializer bids, rejected_bids, bidder_remarks and layer labels — bid_template_serializer.rb:276-279; trade_serializer.rb:234-237; rejected_bids_serializer.rb:32-34; bidder_remarks_serializer.rb:16-18; trade_template_helper.rb:5859-5862
3. [visibility] Masked buyer: bid user phone and email hidden in BidTemplateSerializer — bid_template_serializer.rb:211-213
4. [visibility] Surrogate / buyer-added bid remarks always show the bid user and the BUYER company, never masked — bidder_remarks_serializer.rb:11-15
5. [visibility] `event_masking_enabled?` (show_bidding_stats_only) makes TradeTemplateSerializer return `participants` = {} — trade_template_serializer.rb:239-243; trade_controller.rb:1097
Gaps: masking is never applied for vendor callers, so an endpoint a vendor reaches that lists other bids (event_schema, rejected_bids) shows real competitor names — trade_request_model_helper.rb:968
Cites: trade_request_model_helper.rb:967-969,1223-1239

### TradeRequest::CardSerializer — bid_count on stage cards
Card shown on home/history/project lists (base of Buyer/VendorCardSerializer).
Rules:
1. [config] Vendor (event company not in allowed companies) and stage config `is_vendor_allowed_to_view_bid_count` = false → bid_count nil (default when unset: allowed) — card_serializer.rb:295-299; trade_request_model_helper.rb:1388-1391
2. [visibility] Caller category "seller" on an RFQ (`rfx_mode == "rfq"`) → nil — card_serializer.rb:300,303
3. [visibility] Knockout auction and caller is not the buyer → nil — card_serializer.rb:301-303
4. [visibility] Buyer category → the precomputed bids_count — card_serializer.rb:306
5. [visibility] Vendor with bids_count <= 3 → nil; > 3 → shown only if the vendor has its own bid or is in `event_score_for_participants` — card_serializer.rb:307-309
Gaps: rule 2 checks only category "seller" — a broker on an RFQ is not blocked by it and sees the count when > 3 and participating — card_serializer.rb:300
Cites: card_serializer.rb:295-311

### TradeRequest::CardSerializer — best_price and best_quote_difference
Rules:
1. [visibility] best_price nil when the stage is sealed-bid (`sealbid_enabled`) — card_serializer.rb:317-318
2. [visibility] best_price_v1 nil when sealed-bid and caller is a vendor, when event masking is on for the caller, or when `other_auction_indicators_config.best_price` is not true — card_serializer.rb:477-480
3. [visibility] While auctioning, the vendor's latest bid must have enough revisions for "best_price" (`num_revisions_req_to_show_indicator`) — card_serializer.rb:482-502
4. [visibility] Best bid returned if the vendor has a bid, OR caller is the buyer/broker company, OR the auction is price or rank_and_price based, OR traffic-light on lot (not on rank) with the bid colour in `traffic_zones_to_show_best_price_indicator` — card_serializer.rb:506-518
5. [calculation] Multi-currency: best bid converted to the caller's preferred currency (rate 1 in base_currency mode), rounded to the currency's adjusted precision — card_serializer.rb:520-526
6. [calculation] best_quote_difference = round(|best − own total| × 100 / own total, 2) + "%"; nil when either is blank, when 0, for brokerage workspaces and knockout/dutch — card_serializer.rb:209-223,787-797
Cites: card_serializer.rb:209-223,317-329,477-528,787-797

### TradeRequest::CardSerializer — rank, traffic colour, status and stamp
Rules:
1. [visibility] rank nil for vendors on sealed-bid stages; otherwise only while auctioning AND `should_show_rank?` AND closed on lot; needs enough revisions for "rank" — card_serializer.rb:636-649
2. [visibility] traffic_signal_color nil for vendors on sealed-bid stages; shown while auctioning (sheet layout only when closed on lot), subject to revisions for "traffic_light_color" — card_serializer.rb:656-675
3. [visibility] A closed stage shows status "active" to non-buyers unless stage config `select_bid_notification` is true — card_serializer.rb:374-378; trade_request_model_helper.rb:1084-1086
4. [visibility] Vendor stamp "bid_accepted" is downgraded to "bid_placed" unless `select_bid_notification` — card_serializer.rb:446-458
5. [visibility] Buyer stamp "order_closed" when a selected bid company exists — card_serializer.rb:442-444
6. [visibility] quantity nil for RFI/RFP, multi-product sheet stages, and dutch auctions closing on multiple vendors when `show_quantity_requested?` is false for vendors — card_serializer.rb:381-395
7. [visibility] price / amount / total_quoted_amount are the caller's OWN precomputed bid (matched by "c<company_id>" tag, brokers also their brokered companies) — card_serializer.rb:531-622
Cites: card_serializer.rb:374-395,437-462,531-690

### TradeRequest::VendorCardSerializer — vendor stage card
Rules:
1. [visibility] bid_indicator: nil in brokerage workspaces and upcoming stages; "Bid Selected" when stamp is bid_accepted; else Bid Pending (live, no bid) / Bid Not Submitted / Bid Submitted — vendor_card_serializer.rb:4-25
2. [visibility] total_quoted_amount nil when `rfx_project_enabled` option is set (always true from project cards), brokerage, knockout/dutch — vendor_card_serializer.rb:158-161; event_group/card_serializer.rb:181
3. [state] is_stage_locked false for buyer company, dummy vendors, or if the vendor already bid; true if the vendor never registered intent; for RFQ after an RFP: locked unless invited to the RFP and participated (or, if not invited to the RFP, unless invited to this stage) — vendor_card_serializer.rb:192-215
4. [time] timeline: Withdrawn / upcoming (date if > 1 day, else "Starts in" duration) / Ended / review-time "Ends in" / live "Ends in" / In Evaluation — vendor_card_serializer.rb:27-112
Gaps: `updates` writes `response[:count]` into the shared EVENT_UPDATES constant hashes (only the outer hash is frozen) and clean_updates deletes `:count` from them — counts can leak between cards, users and requests; BuyerCardSerializer counter/best-offer updates do the same — vendor_card_serializer.rb:118-136,219-225; card_serializer.rb:21-111; buyer_card_serializer.rb:204-205,223-224,233-234,244-245
Cites: vendor_card_serializer.rb:1-246

### TradeRequest::BuyerCardSerializer — buyer stage card
Rules:
1. [visibility] Adds owner (get_owner display name), active_participants and total_participants counts, timeline, stage_indicator, updates, stage_configs.route_auctions_to_auction_team — buyer_card_serializer.rb:5-22,158-162
2. [visibility] updates include "Best Amount" = best quoted amount (only when best_price would be shown, see CardSerializer), current KO/dutch round price, price increase/decrease approval counts, counter-offer and best-offer counts — buyer_card_serializer.rb:135-156,281-351
3. [time] Evaluation timeline: "Overdue by" (past closed_at) or "Ends in" closed_at while evaluation pending — buyer_card_serializer.rb:63-85
4. [time] Draft stage of a draft project with `scheduled_publish_at` shows "Scheduled for …" unless Clara status is "stuck" — buyer_card_serializer.rb:166-188
5. [visibility] PR/event status chips are counted per line item; when a contract is requested, RFQ/auction/PO-requested chips are replaced by "contract requested" — buyer_card_serializer.rb:139-146,249-279,357-369
Cites: buyer_card_serializer.rb:1-370

### EventGroup::CardSerializer — project card fields and stage filtering
Rules:
1. [visibility] Draft stages are skipped for non-buyer categories; any stage failing `is_allowed_to_view?(Current.user)` is skipped — event_group/card_serializer.rb:52-63
2. [visibility] filtered_stages_count "x/y Stage" only when a filter hid some stages — event_group/card_serializer.rb:66-69
3. [visibility] Stage options: best_bid, bids_data, bids_count from `misc.precomputed_bids_data`; history context passes bids = {} — event_group/card_serializer.rb:167-200
4. [visibility] Fields for every caller: user.name (project owner), company (minimal), line_item_count (active), unresolved_chat_count, pending_unregistered_bids_count, clara_auto_pilot_status, clara_stuck_reasons (when stuck), is_auto_created, is_scheduled_template, scheduled_job_status, is_project_on_hold — event_group/card_serializer.rb:3-104
Gaps: the vendor card (same serializer, no actor check) carries buyer-internal fields: Clara auto-pilot status and stuck reasons, pending unregistered-bid count, scheduled job status — event_group/card_serializer.rb:3-6,26-44,100-104
Cites: event_group/card_serializer.rb:1-207

### EventGroup::ShowSerializer — stages block per actor
GET /api/event_groups/:id (console and vendor website).
Rules:
1. [visibility] Only stages from get_valid_stages_for_user are serialized; a draft project with no stages returns [] unless show_draft_events — event_group/show_serializer.rb:90-94; event_groups_controller.rb:134,167
2. [visibility] Stage owner name is filled only for the buyer company — show_serializer.rb:107-110
3. [visibility] Vendors (not brokerage, not event company) get is_bid_placed (false if all its bids rejected; else all makes submitted) and is_stage_locked (false for dummy vendors and RFI/RFP; RFQ after RFP: locked unless invited to the RFP and participated, or not invited to the stage) — show_serializer.rb:95-106,151-154,428-439
4. [visibility] participants_data per stage (participant summary) is computed only when the caller's company owns the project; vendors get nil — event_groups_controller.rb:136-145; show_serializer.rb:123
5. [visibility] ref_id only when `show_reference_id`; starting_from/ending_at omitted for a draft project — show_serializer.rb:111,132-133
Cites: show_serializer.rb:90-145,420-439; event_groups_controller.rb:130-176

### EventGroup::ShowSerializer — fields every caller receives (incl. proposals)
Rules:
1. [visibility] Sent unconditionally: config (get_eg_config), clara_chat_identifier, clara_auto_pilot_status, clara_stuck_reasons (when stuck), clara_summary, owner_trail (previous/new owner, transferred_by names and time), item_versions, amendment_remarks, lpo_refresh_data, contracts_uuids, quotation_templates, block_new_message — show_serializer.rb:6-13,242-244,286-331
2. [visibility] can_register (open tender): nil for buyers; true when open tenders are enabled, the earliest open-tender stage has not ended, and the caller is not yet in any stage audience — show_serializer.rb:263-268
3. [visibility] lots: per lot stage uuids, title, proposal uuid, is_awarding_allowed for the caller — show_serializer.rb:167-191
Gaps: clara_summary, owner_trail (buyer user names), lpo_refresh_data and amendment_remarks look buyer-internal but have no actor check, so the vendor website gets them too — show_serializer.rb:242-244,290-331
Cites: show_serializer.rb:1-440

### EventGroup::ShowSerializer — award proposals on the project page
Rules:
1. [visibility] proposals: [] for a draft project; otherwise ProposalSerializer over get_proposals_for_user — show_serializer.rb:229-240; event_groups_controller.rb:154,168
2. [visibility] get_proposals_for_user returns [] only when the caller is not `is_purchaser?`; else selected proposals if any, else the caller's own drafts, else requested/rejected (per lot when lots exist) — event_group_controller_helper.rb:839-857,2522-2532
3. [visibility] proposal_vs_po_status is added when proposals exist — event_groups_controller.rb:155-157
Gaps: a vendor user with no teams counts as a purchaser (default mode "purchase"), so a vendor opening the project receives the award proposals with total_l1_proposal / total_non_l1_proposal / total_proposal_value and the NFA document (unverified live) — user.rb:570-574; event_group_controller_helper.rb:840-842; proposal_serializer.rb:13-48,107-110
Cites: event_group_controller_helper.rb:839-857,2522-2532

### Project line items — event_groups#get_line_items and EventGroupLineItemSerializer
GET /api/event_groups/:id/get_line_items (console and vendor website).
Rules:
1. [config] Company setting `hide_line_items_from_project_details_vendor_side` on → {} is returned BEFORE the policy check — event_groups_controller.rb:472-474
2. [visibility] Buyer-only (is_client_side = dashboard app): all last_po_* fields (price, vendor code/name, PO no, quantity, dates), category, subcategory, requirement_tracking_number, fund_center, wbs_element — event_group_line_item_serializer.rb:42-77,92-100,165-178
3. [config] `mask_pr_creator_details_for_vendor` on AND caller category "seller" → pr_creator_name/phone/email nil — event_groups_controller.rb:493-494; event_group_line_item_serializer.rb:137-154
4. [config] disable_quantity_widgets for the project AND caller is a seller → quantity and quantity_open nil — event_groups_controller.rb:495; event_group_line_item_serializer.rb:31-34,108-111
5. [visibility] Sent to everyone: pr_no, item_no, item_text, assigned_user, requisitioner_name, release_date, material_code, scope_of_work — event_group_line_item_serializer.rb:27-29,102-129,147-149,188-193
Gaps: the hide setting also blanks the BUYER's call (no actor check) and skips authorize — event_groups_controller.rb:472-474
Gaps: masking/quantity hiding check `is_seller?` only — brokers still get PR creator email/phone and quantities — event_groups_controller.rb:494-495
Cites: event_groups_controller.rb:470-545; event_group_line_item_serializer.rb:1-216

### TradeTemplateSerializer — trade_config sent to every caller
The stage screen payload (api/trade#show sheet layout, v1 event_schema, bids#show, get_participated_auctions).
Rules:
1. [visibility] trade_config = the stage's WHOLE `config` merged with computed flags, then allowed_configurations — no buyer/vendor filter — trade_template_serializer.rb:95-166
2. [visibility] Flags: show_read_only_mode_toggle only for super admins on read-only-capable stages; read_only_mode = (`read_only_mode_enabled` and not super admin) OR converted to lots OR RFQ changes restricted — trade_template_serializer.rb:120-121
3. [visibility] show_vendor_name_masking_toggle = upcoming/running, not dutch, buyer company, masking allowed for everyone (or except super admin) AND caller super admin — trade_template_serializer.rb:122; trade_request_model_helper.rb:1236-1239
4. [visibility] can_download_logs only for Procol employees on non-RFP stages — trade_template_serializer.rb:137
5. [state] is_price_increase_allowed forced false during the participant response-review time — trade_template_serializer.rb:148
Gaps: vendors receive the full config, e.g. `allowed_participants_to_edit_in_bid_review_time.request_for_best_price` (other vendors' company ids invited to best offer), `hide_participants_widgets`, masking switches — trade_template_serializer.rb:96,143; trade_controller.rb:1170
Cites: trade_template_serializer.rb:95-171

### TradeTemplateSerializer — misc, savings and buyer-only options
Rules:
1. [visibility] misc only for the buyer company, minus auction_strategy_config, savings_configuration, attachments; auction_remarks ids and `not_allow_rebidding_to_sellers` company ids are uuid-encoded — trade_template_serializer.rb:404-425
2. [visibility] Vendor website callers get misc = {web_bidding_notifications_allowed} only — trade_template_serializer.rb:426-430
3. [visibility] savings_configuration and vendor_validations are passed only for the buyer company (is_team_order) — trade_controller.rb:1173-1177
4. [visibility] Sheet data: buyers get savings and vendor scores; vendors get no savings, no vendor score, sealed-bid hides auction indicators, and best price in order details only after the vendor has bid — app/controllers/concerns/trade_template_helper.rb:2105-2126
5. [visibility] show_auction_report only for the buyer company after bid_end_time or close — trade_controller.rb:1087-1091
Gaps: for update-vendor stages merge_vendor_update_misc falls back to the stage's FULL misc when misc is nil (any non-buyer, non-website caller), undoing the buyer-only filter — trade_template_serializer.rb:431-441
Cites: trade_template_serializer.rb:404-441; trade_controller.rb:1087-1177

### TradeTemplateSerializer — knockout/dutch auction_strategy_config per actor
Rules:
1. [visibility] Only for knockout or dutch stages; otherwise nil — trade_template_serializer.rb:444-445
2. [visibility] Buyer gets `event_bulk_price_trail` (all round bulk prices, newest first) — trade_template_serializer.rb:453-455,1109-1123
3. [config] Vendor: remaining_quantity nil unless stage config `show_remaining_quantity_to_sellers` = true; prices converted to the vendor's preferred currency — trade_template_serializer.rb:456-461; trade_request_model_helper.rb:171-173
4. [calculation] Current round: upcoming → first active round; running → the running one; else last; latest_bulk_price = round bulk_price, or the vendor's stored `updated_bulk_price` if it accepted this round — trade_template_serializer.rb:1065-1101
5. [visibility] Everyone gets bulk_price, end_price, price_difference and display values — trade_template_serializer.rb:471-479,1030-1058
Gaps: `round_participant_ids & participant_ids` is an Array and always truthy, so any participant (even one knocked out of the round) gets the current round times and latest bulk price — trade_template_serializer.rb:1072-1074
Gaps: `end_price` (the dutch auction's stop price — the limit beyond which the price ladder stops) is sent to vendors — trade_template_serializer.rb:474,1035; trade_controller_helper.rb:4415-4425
Cites: trade_template_serializer.rb:444-480,1030-1123

### TradeTemplateSerializer — weightages, currency preferences, remarks, identifiers
Rules:
1. [visibility] weightages (weighted bid events) = for every weight key, a map company_uuid → weight value (or per line item) for ALL participants — trade_template_serializer.rb:877-879; app/models/trade_request.rb:1761-1774,3107-3150
2. [visibility] currency_preferences = every participant's preferred currency keyed by company uuid — trade_template_serializer.rb:858-868
3. [visibility] remarks (best-offer request text): buyer always; vendor only when `can_show_remarks` (its company listed for request_for_best_price) and the review type is request_for_best_price; else "" — trade_template_serializer.rb:977-985; trade_controller.rb:1170-1171
4. [visibility] bid_identifiers only when the caller's category is "buyer" — trade_template_serializer.rb:912-915
5. [visibility] alternatives (vendor makes) are nil for the event company, else the caller's own makes with is_bid_placed / pending counter offers — trade_template_serializer.rb:37-49
6. [visibility] is_allowed_to_place_bid false during KO/dutch submission time or when the caller's company is in `not_allow_rebidding_to_sellers` — trade_template_serializer.rb:792-800
Gaps: weightages and currency_preferences reveal other vendors' company uuids (and, in weighted events, the loading the buyer applies to each competitor) to every viewer — trade_template_serializer.rb:858-879
Cites: trade_template_serializer.rb:37-49,792-800,858-985

### TradeTemplateSerializer — surrogate-bid and reopen flags (trade_config)
Rules:
1. [permission] is_allowed_to_add_surrogate_bid false for knockout/dutch, when the buyer may not add surrogate bids, or caller not the buyer company — trade_template_serializer.rb:819-824
2. [config] Event masking on → allowed only if `is_surrogate_bidding_in_masked_events_allowed?` AND caller is_purchaser? — trade_template_serializer.rb:825-827
3. [time] In evaluation time with "surrogate bid after expiry" allowed → true — trade_template_serializer.rb:828-830
4. [state] Read-only mode and not super admin → false; else stage owner or super admin — trade_template_serializer.rb:831-834
5. [permission] is_allowed_to_reopen_event: any RFP → true; Procol employee → true; super admin on an RFQ with `super_admin_allowed_to_reopen_event?`; buyer company with `user_allowed_to_reopen_event?` — trade_template_serializer.rb:807-817
Gaps: is_allowed_to_reopen_event returns true for EVERY caller on an RFP (vendors included) — UI flag only; the reopen action has its own checks (unverified) — trade_template_serializer.rb:808
Cites: trade_template_serializer.rb:807-835

### v1 trade#event_schema — participants_data layers (GET /api/v1/trade/:id/schema)
Listed for the vendor website. Gate: `authorize TradeRequest` (read_record) + validate_event.
Rules:
1. [visibility] Non-RFI/RFP stages: participants_data = layers built from ALL bids of the stage with valid statuses (every vendor), each with label (company name; alias only for masked buyers), key (company uuid), bid_status, bids_count, vendor_status, approval_status, is_surrogate_bid, is_vendor_tna, alternative — app/controllers/api/v1/trade_controller.rb:349-372; trade_template_helper.rb:5856-5905
2. [visibility] Rank is set on those bids only for the buyer company when should_show_rank? and closed on lot — v1/trade_controller.rb:352-361
3. [visibility] RFI/RFP branch: proposals (non-draft) passed when the caller is an approver, planner or purchaser; evaluator names always; show_evaluation_results only for the buyer company owner or super admin — v1/trade_controller.rb:380-427
Gaps: rule 1 has no buyer check — a vendor calling /schema gets every competitor's company name, bid status and bid count (not verified live) — v1/trade_controller.rb:351,372; config/app_auth_config.yml:1958
Gaps: rule 3 hands RFP proposals to any "purchaser" — vendor users with no teams default to that mode (unverified live) — v1/trade_controller.rb:384-385; user.rb:570-574
Cites: v1/trade_controller.rb:261-433

### v1 trade#event_schema — l1_prices on request (template branch)
Rules:
1. [visibility] Template-layout stages: when the request carries param `l1_prices`, l1_prices = get_l1_prices_for_event — no caller check — v1/trade_controller.rb:435-440,478
2. [calculation] Lot-closing: best_price from EventIndicators::LotBased, the last company with that price, its rankable bid → per line {price, total_amount} and lot gross_total; nil when nobody bid — trade_template_helper.rb:413-430
3. [calculation] Line-closing: per line the best-bid company's latest bid line {price, total_amount} — trade_template_helper.rb:431-445
Gaps: a vendor can add `l1_prices=1` to /schema and read L1 prices regardless of sealed-bid, masking or best-price settings (not verified live) — v1/trade_controller.rb:439
Gaps: lot-closing stage whose best company has no rankable bid → `bid.bid_products` on nil → untyped 500 — trade_template_helper.rb:422-423
Cites: trade_template_helper.rb:413-445

### BidTemplateSerializer — participant_data rank, totals and history
Each bid row inside TradeTemplateSerializer.participants (bids passed by the controller; a vendor's own bid on bids#show).
Rules:
1. [visibility] Lot-closing stages: rank and traffic_light_color for the bid; for vendors on sealed-bid stages rank nil and colour "" — bid_template_serializer.rb:25-35
2. [calculation] gross_total: multi-currency → bid.gross_total(trade:) unrounded; else gross_total rounded to the widget precision — bid_template_serializer.rb:36
3. [visibility] revised_bids: buyer-added revisions are skipped for non-buyer categories; for a buyer-added active bid the vendor's own last revision is also removed — bid_template_serializer.rb:85-91,408-414
4. [config] Mobile app + vendor + `hide_participants_widgets` contains gross_total → revised display_value "" — bid_template_serializer.rb:93-95
5. [visibility] status "selected" shows as "active" unless `select_bid_notification` — bid_template_serializer.rb:365
6. [visibility] unregistered_bid_info (with vendor email) only when accepted and not minimal style — bid_template_serializer.rb:387-391
Gaps: rank here is gated only by sealed-bid, not by should_show_rank?/revisions like CardSerializer and NewBidSerializer — a vendor's own RFQ bid row can carry its rank — bid_template_serializer.rb:25-34; new_bid_serializer.rb:121-123
Gaps: hide_participants_widgets hides gross_total only in revised bids on mobile; data.gross_total is unaffected — bid_template_serializer.rb:36,93-95
Cites: bid_template_serializer.rb:21-38,77-141,300-393

### BidTemplateSerializer — bid_config, selection remark, approvals
Rules:
1. [state] is_allowed_to_edit_bid = stage started AND caller may edit (bid author or own company, never the buyer company) AND closed_at in the future AND bid valid to edit AND (company not barred from rebidding OR a counter offer is pending) — bid_template_serializer.rb:40-50,153-155
2. [state] Then: a requested surrogate bid is editable only while approval_pending; any other bid only when NOT approval_pending — bid_template_serializer.rb:156
3. [visibility] is_my_bid, is_surrogate_bid, show_stamp, is_team_bid (own company or broker company), is_allowed_to_close_bid (controller flag AND bid closable), is_fast_bid — bid_template_serializer.rb:157-165
4. [visibility] For a selected bid (or multi-PO with selected lines): order(s) via OrderMiniSerializer and `selection_remark` (buyer's bid_selection_remark) — bid_template_serializer.rb:226-234
5. [visibility] form_details (PO details) only for selected bids or requested bids with an approval status — bid_template_serializer.rb:355-357
Gaps: the buyer's bid-selection remark is serialized into the vendor's own bid row with no actor check — bid_template_serializer.rb:231,380
Gaps: `@get_participated_auctions` is read inside the serializer but only ever set on the controller, so revised/rejected arrays are always built — bid_template_serializer.rb:308; v1/trade_controller.rb:222
Cites: bid_template_serializer.rb:144-166,225-251,355-393

### NewBidSerializer — single bid (bids#show, update_bid_status, get_bid_details, revise responses)
Rules:
1. [visibility] rank nil unless stage `should_show_rank?`; "" when required revisions not done; else bid_rank option or computed rank — new_bid_serializer.rb:121-131
2. [visibility] user/company names follow masking options; a broker bid shows "Broker" when a masked company name is passed — new_bid_serializer.rb:14-32,97-102
3. [visibility] additional_requests limited to requests from/to the caller or the caller's companies — new_bid_serializer.rb:180-186
4. [visibility] orders only for selected bids; order via OrderSerializer — new_bid_serializer.rb:164-178
5. [calculation] freight_charges: multi-product → as stored; else > 20 → divided by quantity; else as stored — new_bid_serializer.rb:196-203
Gaps: `other_details` is emitted raw and `savings` (savings amount/percent against the bid's `reference_price`) has no actor check — when rendered to the bidding vendor it can carry the buyer's reference price and savings (deprecated v1 path; unverified whether reference_price is still stored) — new_bid_serializer.rb:7,205-207; app/models/model_helpers/common_model_helper.rb:10-27,46-62
Cites: new_bid_serializer.rb:1-208

### TradeSerializer (legacy v1 stage) and ReviseBidSerializer
api/trade#show for non-sheet stages, trade create/update responses, and bid revise responses (bids_controller_helper render_update_bid_response).
Rules:
1. [visibility] misc only for the buyer company (whole misc, unfiltered); nil otherwise — trade_serializer.rb:109-114
2. [visibility] trade_config = whole stage config to everyone — trade_serializer.rb:317-319
3. [visibility] bids → NewBidSerializer; alias name when masking is on, or for temporary-network vendors with show_company_name false — trade_serializer.rb:217-248
4. [visibility] unverified bids: alias whenever show_company_name is false and not the caller's — trade_serializer.rb:272-298
5. [visibility] ReviseBidSerializer = {bid: NewBidSerializer, trade_request: TradeSerializer} — revise_bid_serializer.rb:1-15; app/controllers/concerns/bids_controller_helper.rb:2840-2847
Gaps: `company` compares `current_user.id == self.object.id` (user id vs STAGE id), so the creator check never works; TradeTemplateSerializer compares with object.user.id — trade_serializer.rb:89 vs trade_template_serializer.rb:333
Gaps: trade_products → TradeProductSerializer leaks per-vendor validations (next section) — trade_serializer.rb:116-130
Cites: trade_serializer.rb:1-400

### TradeProductSerializer — ceiling/floor price and validations per actor
Rules:
1. [visibility] ceil_price: column value if set; else the caller company's `validations.vendor_validations[<company_id>].ceil_price`, else `validations.default.ceil_price` — app/models/trade_product.rb:158-168,182-184
2. [calculation] English auction, caller company has not bid on the line: ceiling = current best price (min for buy, max for sell) minus tick_size (or minus tick % of it) once any bid exists — trade_product.rb:169-181,596-602
3. [calculation] floor_price mirrors it: vendor-specific, then default; English auction adds tick to the best price — trade_product.rb:228-253
4. [visibility] floor_quantity: column, else validations.default.floor_quantity — trade_product.rb:213-225
5. [visibility] Serialized for every caller: id, quantity, status, config, ceil_price, floor_price, floor_quantity, validations, unit — trade_product_serializer.rb:4-5,48-62
Gaps: `validations` (jsonb column) is emitted raw — it contains `vendor_validations` keyed by every vendor's company id with their individual ceiling/floor prices, so each vendor sees competitors' limits — trade_product_serializer.rb:5; db/schema.rb:2221; trade_product.rb:162-163
Gaps: rule 2 gives a vendor that has not bid the current best price minus one tick as its ceiling, even when best-price indicators are switched off for the stage — trade_product.rb:170-179
Cites: trade_product_serializer.rb:1-71; trade_product.rb:158-253

### rejected_bids and bidder_remarks endpoints (GET /api/v1/trade/:id/rejected_bids, /bidder_remarks)
Console apps only in the allow-list. Gate: `authorize TradeRequest` (read_record) + validate_event.
Rules:
1. [visibility] rejected_bids: all rejected bids of the stage grouped by vendor company uuid, newest first, each {uuid, display_value (gross total), updated_at}; label = vendor name, alias when masked for the caller — app/controllers/api/v1/trade_controller.rb:597-619; rejected_bids_serializer.rb:6-38
2. [calculation] display_value: multi-currency → gross_total unrounded in the vendor's preferred currency when the caller is not the buyer, else base currency; single currency → rounded to widget precision — rejected_bids_serializer.rb:15-25; v1/trade_controller.rb:603
3. [visibility] bidder_remarks: every non-draft, non-inactive bid with other_details.remarks → {message, posted_by, company_name}; surrogate/buyer-added bids show the buyer company — v1/trade_controller.rb:622-639; bidder_remarks_serializer.rb:6-30
Gaps: neither the policy (class-level read_record) nor the code checks that the caller is the buyer; a vendor who can view the stage and calls with a console app key gets every competitor's rejected totals and remarks with real names (masking never applies to vendors) — v1/trade_controller.rb:598,623; trade_request_policy.rb:52-58
Cites: v1/trade_controller.rb:597-640

### ParticipatedEventsSerializer — vendor "participated auctions" list
GET /api/v1/trade/get_participated_auctions (vendor website and mobile).
Rules:
1. [visibility] Stages where the caller's companies bid; skipped when the caller's company is in `not_allow_rebidding_to_sellers` — v1/trade_controller.rb:221-233
2. [visibility] Mobile app >= 3.9.7 / 3.0.2 gets ParticipatedEventsSerializer (uuid, layers, sheets, title, status, times, rfx_mode, auction_config, buyer company_name, participants = own last active/requested bid via BidTemplateSerializer minimal); others get TradeTemplateSerializer — v1/trade_controller.rb:236-251; participated_events_serializer.rb:4-60
Gaps: the controller does not pass `allowed_companies`, so BidTemplateSerializer evaluates `nil.exclude?` on a sealed-bid lot-closing stage → untyped 500 for the whole list — v1/trade_controller.rb:237-243; participated_events_serializer.rb:52; bid_template_serializer.rb:26
Cites: participated_events_serializer.rb:1-71; v1/trade_controller.rb:221-257

### ProposalSerializer — award proposal fields
Rendered inside project show (EventGroup::ShowSerializer), RFP event_schema and proposal endpoints.
Rules:
1. [calculation] proposal_values: total_l1_proposal, total_non_l1_proposal (from options or meta_data, default 0.0), total_proposal_value = their sum, formatted in the workspace default currency — proposal_serializer.rb:13-48
2. [config] Workspace `show_proposal_value_in_base_currency?` + project's latest commercial stage in base_currency mode → totals converted to that base currency — proposal_serializer.rb:23-38
3. [visibility] Also: project_ref_id, total_awarded_line_items, lot_no, is_awarding_with_excel, NFA custom totals, creator user, approval flow name/description/conditions, vendor_wise_information, PO status, document, pending approval request uuid, withdrawn approval data — proposal_serializer.rb:2-3,50-129
4. [visibility] remarks only when the controller passes proposal_id_vs_remark for that proposal — proposal_serializer.rb:65-72
Gaps: no actor check inside; vendor exposure depends on callers (see project show and event_schema sections) — proposal_serializer.rb:1-130
Cites: proposal_serializer.rb:1-130

### Small and unused serializers — BidSerializer, TradeMiniSerializer, summary, history
Rules:
1. [visibility] BidSerializer and TradeMiniSerializer have no references at origin/main (dead); TradeMiniSerializer would emit `misc` raw to anyone — app/serializers/bid_serializer.rb:3-5; trade_mini_serializer.rb:4-8
2. [visibility] BidTradeProductSerializer (nested in NewBidSerializer): price, quantity, rank (if computed), remarks, city, gst, price_breakup, delivery_schedules (nil in minimal style), images — bid_trade_product_serializer.rb:4-47
3. [visibility] TradeBiddingSummarySerializer only echoes controller data (line/lot columns+data, participant_summary_data) from api/trade bidding summary — trade_bidding_summary_serializer.rb:4-28; app/controllers/api/trade_controller.rb:1733
4. [visibility] Pending history (sample requests): trade {id, status, order_type, bid_count, bids[{id, status, sample, company}]} — pending_history_trade_serializer.rb:4-33; pending_history_bid_serializer.rb:4-24; history_serializer.rb:68-75
5. [visibility] Old mobile history cards use TradeRequest::CardSerializer with bids {} and precomputed bids_data/best_bid — history_serializer.rb:38-56
Cites: bid_serializer.rb:1-48; trade_mini_serializer.rb:1-139; bid_trade_product_serializer.rb:1-48

### App allow-list — what the vendor website may call at all (agribid_website)
The real outer gate for vendors, since most read policies pass every vendor.
Rules:
1. [permission] Vendor website, unversioned: trade {index, show, upload_file, add_variants, get_event_group_uuid, get_channel_identifiers, create_update_vendor_onboarding_event}; bids {create_bid, update_bid, template_input, sheet_update, show, delete_draft_bid, accept_automated_knockout_offer, accept_automated_dutch_offer} — config/app_auth_config.yml:1872-1892
2. [permission] Vendor website, v1: trade {history, home_page_request, show, get_participated_auctions, event_schema, quote_details, reevaluation_remarks, quote_summary, download_event_details, upload_bid_excel, accept_auction_tnc}; bids {create, update, create_bid_trade_products, update_regret_status} — app_auth_config.yml:1952-1977
Cites: config/app_auth_config.yml:1867-1977; app/controllers/concerns/api_auth.rb:78-106

### App allow-list — vendor website projects/responses and what is NOT listed
Rules:
1. [permission] Vendor website event_groups {show, get_line_items, get_all_attachments, index, history, update_eg_cards, participate, all, options} — config/app_auth_config.yml:1995-2007
2. [permission] Vendor website template_responses {create, update, create_form_page_responses, delete_template_response, resolution, revoke_edit_changes, update_poc_bid} — app_auth_config.yml:1931-1940
3. [permission] NOT listed for the vendor website: rejected_bids, bidder_remarks, l1_data_for_event, aggregate_savings, get_bid_details, get_suspicious_bids_detail, bids reject — a call → "app_error_auth_failed" (HTTP 401) — app_auth_config.yml:1867-2050; api_auth.rb:86-96
4. [permission] The Android consumer app does list bids#get_bid_details and v1 trade best_line_wise_savings — app_auth_config.yml:27-35,81-92
Gaps: for rejected_bids, bidder_remarks, l1_data_for_event, get_suspicious_bids_detail and reject the app allow-list is the ONLY thing keeping vendors out; the policies/code accept an invited vendor (see those sections) — app_auth_config.yml:561-569; trade_request_policy.rb:52-58,168-170,188-190
Cites: config/app_auth_config.yml:1867-2050
