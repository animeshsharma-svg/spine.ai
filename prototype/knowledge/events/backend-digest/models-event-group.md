# Event group (project) models — backend digest (procol-backend origin/main ae36e86894)

## Overview
The layer behind the event_groups / evaluations / item_versions controllers: the `EventGroup` model (a "project" holding
stages = TradeRequests), its line items (`EventGroupLineItem`, EGLI), the line-item ↔ stage mapping
(`EventGroupLineItemTradeMapping`, EGLITM), PR links (`PurchaseRequestTradeMapping`), technical scoring (`Evaluation`,
`EvaluationScore`), vendor technical answers (`TemplateResponse`), amendment versioning (`Versioning::*` +
`Versions::EventGroup` / `Versions::TradeRequest` replicas), reminders, event snapshots and flexi mappings.
Files: app/models/event_group.rb, app/models/model_helpers/event_groups_helper.rb, app/models/event_group_line_item.rb,
app/models/event_group_line_item_trade_mapping.rb, app/models/purchase_request_trade_mapping.rb, app/models/evaluation.rb,
app/models/evaluation_score.rb, app/models/template_response.rb, app/models/reminder.rb, app/models/event_snapshot.rb,
app/models/trade_flexi_mapping.rb, app/models/versioning/{item_version,methods,versionable}.rb, app/services/versions/*.
Already covered elsewhere (not repeated): project status enum / latest? basics, status-change callbacks, draft visibility
and owner resolution — see event-groups.md "EventGroup model — …"; score label map and score lifecycle — see
evaluation-award.md.

### EventGroup associations — which stages, line items and PR links a project "has"
Every model method below reads these filtered associations, so a stage or line item outside them is invisible to it.
Rules:
1. [state] `event_group.trade_requests` excludes stages in `void`(4) and `cancelled`(8) and is ordered by `stage_no` (not id); withdrawn, in_active and draft stages ARE included — app/models/event_group.rb:62, app/models/trade_request.rb:256-259
2. [state] `active_event_group_line_items` = EGLIs with status `active`(1) only; `event_group_line_items` = all statuses — event_group.rb:60-61
3. [state] `purchase_request_trade_mappings` / `purchase_requests` only follow PR mappings with status `active`(1) — event_group.rb:64-65
4. [state] `commercial_stages` = auction / rfq / rfq_then_auction stages not withdrawn, draft or in_active, newest `stage_no` first — event_group.rb:71-76, 149-154
5. [state] `latest_proposal` = newest proposal in `selected` or `requested`; `selected_proposals` = proposals in `selected` — event_group.rb:68-69
6. [state] `access_lists`, `eg_alternatives_mappings` only include rows with status `active` — event_group.rb:79-80
Cites: app/models/event_group.rb:60-81, app/models/trade_request.rb:162, 256-263

### EventGroup creation defaults — precomputed data, config, ref_id, title fallback
What a brand-new project row gets before/after insert, and how `title` is read.
Rules:
1. [side-effect] before_create: `precomputed_data` and `precomputed_data_v1` both reset to `{"participant_vendor_company_ids": []}` (anything passed in is overwritten) — app/models/event_group.rb:110, 564-574
2. [config] before_create: `config.user_intent_trade_reasons` copied from the company config `user_intent_trade_reasons`; when `config.is_vendor_onboarding_v2` is true it is copied from the active onboarding template (`config.onboarding_template_id`) instead; nil keys are dropped (`compact!`) — event_group.rb:1329-1338
3. [calculation] after_create: `ref_id` = "RFX-<count of LATEST projects of the company, including this one>" unless a ref_id is already present (amendment replicas keep the parent's) — event_group.rb:115, 429-433
4. [visibility] `title`: a DRAFT project returns only its own title (may be nil); a non-draft project with no title falls back to its first stage's title — event_group.rb:187-193
5. [visibility] `title_ref` = "<title> [<ref_id>]" only when `config.show_reference_id` is truthy (default false) — event_group.rb:228-230, 319-321
Gaps: ref_id is a count, not a sequence — if a latest project stops counting, the next one can reuse an RFX number (unverified in data) — event_group.rb:429-433
Cites: app/models/event_group.rb:110-115, 187-193, 228-230, 319-321, 429-433, 564-574, 1329-1338

### EventGroup#latest_commercial_stage — which price round counts as "the" commercial stage
Used by currency, summary, tabs, PR quantity and amendment logic.
Rules:
1. [state] Commercial = rfx_mode auction(0), rfq(1) or rfq_then_auction(2); picks the LAST by stage_no among `trade_requests` — app/models/event_group.rb:595-605, app/models/trade_request.rb:261-263
2. [state] Project NOT withdrawn: stages in `withdrawn`, `draft`, `in_active` are skipped. Project withdrawn: only `withdrawn` and `draft` are skipped (an `in_active` stage can be returned) — event_group.rb:149-154, 633-638
3. [state] With `lot_no`: only the lot's `stage_ids` from `lot_config[lot_no]` are considered — event_group.rb:619-622, 782-785
4. [state] `latest_non_lot_commercial_stage` skips stages that belong to an ACTIVE lot (status withdrawn/draft/in_active excluded) — event_group.rb:607-611, 757-760
5. [state] `commercial_stage_for_amendment_version` prefers the first non-lot RFQ stage, else the last non-lot commercial stage — event_group.rb:613-617
6. [state] `latest_rfq_stage_for_event(lot_no, rfx_modes)` same status rule, filtered to the given modes — event_group.rb:624-631
Cites: app/models/event_group.rb:589-638

### EventGroup#get_valid_rfp_trade_request — which technical round drives scoring config
The technical round whose config gives the score-label map, evaluation mode (line/lot/section-wise) and evaluator list.
Rules:
1. [state] = LAST (by stage_no) RFI or RFP stage whose status is not void, in_active, withdrawn or cancelled — so a `draft` or `closed` RFP counts — app/models/event_group.rb:973-975, app/models/trade_request.rb:169
2. [config] No such stage → score-label map falls back to company config `evaluation_score_label_mapping` (master/custom config; nil if neither) — event_group.rb:726-735, app/models/company.rb:1040-1042
3. [state] `is_evaluated_on_line?` = that round's `config.rfp_evaluation_mode == "line_item_based"` or `config.is_linewise_rfp_evaluation_allowed`; `is_evaluated_on_lot?` = `rfp_evaluation_mode == "lot_based"`; nil when there is no technical round — event_group.rb:963-971, app/models/model_helpers/trade_request_model_helper.rb:1454-1456, 1471-1473
Gaps: project with NO technical round and company config `evaluation_score_label_mapping` nil → `evaluation_score_label_mapping` calls `sort_by` on nil → NoMethodError, untyped 500 on every score display/TNA check (unverified that the master config is ever absent) — event_group.rb:729-734
Cites: app/models/event_group.rb:718-741, 963-975

### EventGroup time helpers — starting_from, ending_at, current_active_stage, total_duration
Project-level start/end shown on cards, summary PDFs and reports.
Rules:
1. [time] `starting_from` = earliest non-nil `bid_start_time` over all non-void/cancelled stages — app/models/event_group.rb:439-442
2. [time] `ending_at` = latest `closed_at` over the same stages (nil values are NOT removed) — event_group.rb:444-447
3. [time] `current_active_stage`: walking stages in stage_no order — first stage not yet started → that stage (only if no earlier stage was collected, otherwise the previous stage); a stage with `bid_start_time <= now < closed_at` → that stage; all ended → the last stage — event_group.rb:449-463
4. [time] `total_duration` = Utils.time_duration(starting_from, ending_at) — event_group.rb:671-673
5. [time] `EventGroup.ended` = projects with NO stage in active/closed/scheduled whose `closed_at >= now` — event_group.rb:87
Gaps: `ending_at` uses `max` without `compact`, so one stage with nil `closed_at` raises ArgumentError (comparison of NilClass) → untyped 500 in summary/duration callers (unverified that a stage can have nil closed_at); `current_active_stage` likewise crashes on nil `bid_start_time` — event_group.rb:444-447, 452-456
Cites: app/models/event_group.rb:87, 439-463, 671-673

### EventGroup#get_summary_data — project summary block (PDF/report header)
Builds title, dates, duration, closing mode, participants for a project or lot.
Rules:
1. [calculation] `title` = "<lot_title>/<project title>" when lot_no given; `id` = ref_id, else uuid — app/models/event_group.rb:813-820
2. [time] `ended_at` = last approver's ended_at of the latest commercial stage if any, else project `ending_at`; formatted "%d %b %Y %I:%M %P" — event_group.rb:824-827
3. [calculation] `active_participants` / `total_participants` = sizes from the latest commercial stage; `trade_closed_at` only when that stage is `closed`, else "" — event_group.rb:834-836
Gaps: project with no commercial stage (RFI/RFP-only, or all price rounds withdrawn) → `latest_commercial_stage` nil → NoMethodError `.template`/`.id` → untyped 500; `starting_from` nil (no start times) → `nil.strftime` → 500 — event_group.rb:814-823
Cites: app/models/event_group.rb:813-838

### EventGroup base currency and precision — which currency a project's numbers use
Rules:
1. [calculation] No commercial stage → company default currency and its `default_precision` — app/models/event_group.rb:640-645, 655-661
2. [calculation] Latest commercial stage has a `currency_configuration` → its base currency, precision = `adjusted_precision` — event_group.rb:648-649, 664-665
3. [calculation] Otherwise the stage's default currency, `default_precision` — event_group.rb:650-652, 666-668
Cites: app/models/event_group.rb:640-669

### EventGroup#can_create_new_version? — when the "Create amendment" button is offered (part 1)
Predicate shown to the UI as `can_create_new_version` on project details (event_group_controller_helper.rb:557).
Rules (in order, first failing → false):
1. [config] Company config `is_event_versioning_enabled` must be truthy — app/models/event_group.rb:1092, 1094
2. [state] Project must not be `draft` and not `withdrawn` (so `in_active` passes this check) — event_group.rb:1095-1096
3. [state] Project must be latest (no non-in_active ItemVersion created from it, a DRAFT amendment counts) — event_group.rb:1097, app/models/versioning/methods.rb:72-74
4. [state] No proposal of the project in `selected`, `requested` or `active` — event_group.rb:1098
5. [state] `lot_splitting_done?` must be false — event_group.rb:1099 (see part 2)
6. [config] Latest non-lot commercial stage is an auction → allowed only with company config `allow_versioning_post_auction` — event_group.rb:1093, 1100-1102
7. [permission] Super admin → true; otherwise the user must share at least one team with the project owner (`self.user`, i.e. creator or access-list owner under `restrict_event_visibility_to_owner`); an owner with no teams cannot amend their own project — event_group.rb:1103-1106
Cites: app/models/event_group.rb:1091-1107

### EventGroup#lot_splitting_done? — the lot rule inside can_create_new_version? (part 2)
Rules:
1. [state] `lot_config` blank → false (versioning not blocked by lots) — app/models/event_group.rb:1080-1081
2. [state] Any lot stage id (from any lot, any lot status) is a stage NOT in void/in_active/withdrawn/cancelled → false — event_group.rb:1083-1086, app/models/trade_request.rb:169
3. [state] Otherwise true only if at least one lot has status `active` — event_group.rb:1082, 1087-1088
Gaps: the name says "splitting done" but it returns false while live lot stages exist, so a project with live active lots passes the lot check and can be amended; the replica then copies only the non-lot commercial stage (`latest_non_lot_commercial_stage`), silently dropping the lots from the amendment — event_group.rb:1080-1089, app/services/versions/event_group.rb:60-61
Cites: app/models/event_group.rb:1080-1107

### item_versions#create — POST /api/item_versions — what really guards an amendment
The endpoint that creates an amendment draft. It does NOT call `can_create_new_version?`.
Rules:
1. [validation] `item_type` or `item_id` missing, or item_type not "EventGroup" → 2 "Insufficient parameters" (HTTP 422) — app/controllers/api/item_versions_controller.rb:3, 9-11
2. [state] Project not found, not `active`, or not latest → 888 "Invalid Parameters" (HTTP 422); a second create while a draft amendment exists also gets 888 — item_versions_controller.rb:13-16, app/models/versioning/methods.rb:72-74
3. [permission] Policy `create_version?` = `update?` (project company in user's allowed companies + trade create_record permission, or Procol CSM of the company) AND trade create_record → else 455 "You are not authorized to perform this action" (HTTP 422) — item_versions_controller.rb:18, app/policies/event_group_policy.rb:37-44, app/controllers/concerns/api_auth.rb:16, 117-118
4. [side-effect] Runs in one DB transaction; response = ItemVersion `uuid` + `new_item_data` {uuid, trade_uuids} of the new draft project — item_versions_controller.rb:20-29, app/models/event_group.rb:711-716
Gaps: `is_event_versioning_enabled`, open proposals, post-auction, lot and shared-team rules of `can_create_new_version?` are NOT enforced here — any trade creator of the company can amend via API while the button is hidden — item_versions_controller.rb:5-30, app/models/event_group.rb:1091-1107
Cites: app/controllers/api/item_versions_controller.rb:1-31

### Versioning::ItemVersion lifecycle — draft amendment, publish, discard (part 1)
How the amendment link row moves and what "latest" means at each step.
Rules:
1. [state] ItemVersion status enum: in_active 0, active 1, draft 2; DB allows only ONE non-in_active version per (item_type, item_id) and one active — app/models/versioning/item_version.rb:28-29, 44
2. [state] `create_version(user)` finds/creates a `draft` ItemVersion for (item, status draft, created_by user); only when new does it build the replica — app/models/versioning/methods.rb:8-16
3. [state] While the draft amendment exists the ORIGINAL is already "not latest" (draft ≠ in_active) — methods.rb:72-74
4. [state] Amendment project → `active` or `withdrawn`: its ItemVersion becomes `active`; → `in_active`/`cancelled`: ItemVersion `in_active`, so the original becomes latest again — app/models/versioning/versionable.rb:7-12, methods.rb:149-152
Cites: app/models/versioning/item_version.rb:28-44, app/models/versioning/methods.rb:3-31, 72-74, 149-152, app/models/versioning/versionable.rb:7-12

### Versioning::ItemVersion lifecycle — amendment predicates and duplicate drafts (part 2)
Rules:
1. [state] `is_amendment_draft?` = project is draft AND a draft ItemVersion points to it; returns nil (not false) for non-draft projects — app/models/versioning/methods.rb:97-100
2. [state] `previous_version_item` = source project of the newest non-in_active version that created this one; `new_version_item` = the project created from this one (or `none`) — methods.rb:76-84
3. [state] Version identifier is inherited along the chain ("EventGroup_<original id>") — methods.rb:131-137
Gaps: a different user creating a version while another user's draft exists hits the unique index → RecordNotUnique re-raised → untyped 500; the API is shielded by its latest? check (888) but the PR amendment service calls `create_version(event_group.user)` directly (unverified whether it pre-checks) — methods.rb:8, 25-29, app/services/purchase_requests/amendment_service.rb:319
Cites: app/models/versioning/methods.rb:76-100, 131-137

### Versioned ref_id, version order and version list labels
Rules:
1. [calculation] `ref_id` reader is `versioned_ref_id`: no version → stored ref_id; otherwise "<ref_id before first '.'>.<version_order>", e.g. RFX-12 → RFX-12.1 → RFX-12.2 — app/models/versioning/methods.rb:86-95
2. [side-effect] When a project goes `active`, the stored `ref_id` column is rewritten to the versioned value — app/models/versioning/versionable.rb:13-15, methods.rb:127-129
3. [calculation] `version_order` = (max order of ACTIVE versions whose new_item is this version's source item, else 0) + 1, recomputed after every ItemVersion save — app/models/versioning/item_version.rb:55, 102-105
4. [calculation] `current_version_number` = version_order of the version that created this project, 0 for an original — methods.rb:33-35
5. [visibility] `all_versions`: first entry "default" = original project (version_order 0, label = its ref_id); others labelled with their project's ref_id; the highest ItemVersion id gets " (Latest)" — including a still-DRAFT amendment; sorted by version_order desc — methods.rb:37-70
6. [config] Version chain ids are cached 24 h under `version_chain_ids_<type>_<identifier>`, refreshed on each ItemVersion save — item_version.rb:95-100, methods.rb:139-147
Cites: app/models/versioning/methods.rb:33-95, 127-147, app/models/versioning/item_version.rb:55, 95-105

### Amendment replica — what the new draft project copies (project and line items)
`EventGroup#create_replica` → `Versions::EventGroup#replicate`.
Rules:
1. [side-effect] New project = deep copy of the original (title, config, lot_config, ref_id, owner …) with status `draft`; `meta_data.quotation_templates` removed — app/services/versions/event_group.rb:31-34, app/models/event_group.rb:699-701
2. [state] Only ACTIVE line items are copied, in serial_number order, as status `draft`, with `meta_data.old_egli_id` = source EGLI id; draft/deleted/in_active lines are dropped — versions/event_group.rb:37-46
3. [calculation] Copied lines lose `has_evaluations`, `evaluation_score`, `evaluation_remark` (top level and per vendor) — versions/event_group.rb:147-154
4. [side-effect] Technical round copied = `get_valid_rfp_trade_request`; commercial round copied = `latest_non_lot_commercial_stage`, or `commercial_stage_for_amendment_version` (RFQ preferred) for PR amendments — only ONE commercial stage, lot stages never — versions/event_group.rb:50-67, app/services/purchase_requests/amendment_service.rb:319
5. [side-effect] `precomputed_data(_v1).trade_template_id` = copied commercial stage's template; `draft_project_data` recomputed — versions/event_group.rb:68-73
Gaps: RFQ stage + separate auction stage → the amendment keeps only the auction (latest) unless the PR-amendment path is used — versions/event_group.rb:60-61
Cites: app/services/versions/event_group.rb:18-87, 147-154

### Amendment replica — what each copied stage carries (schedules, forms, evaluators)
`Versions::TradeRequest#replicate` for the RFP and the commercial stage.
Rules:
1. [state] Copied stage status `draft`; `misc.bid_company_ids` = [], `misc.savings_configuration` = nil, `misc.precomputed_bids_data` = {}, `event_score_for_participants` = {}; team_identifier kept — app/services/versions/trade_request.rb:18-28
2. [time] Every schedule restarts NOW: start = now, end = now + `meta_data.configured_duration` (if > 0) else the original end − start — trade_request.rb:111-130
3. [side-effect] Audiences and stage access lists (incl. evaluators/owner) copied — trade_request.rb:31, 40
4. [side-effect] RFI/RFP: every form and page copied; a form is re-mapped to the copied line via old_egli_id and its line-item evaluator access lists copied; forms whose line was not copied stay unmapped — trade_request.rb:43-48, 70-109
5. [side-effect] Price rounds: only trade products of ACTIVE line items copied — trade_request.rb:49-59
Gaps: a form of a deleted/inactive line is still copied but left without a line mapping; elsewhere an unmapped form is treated as a lot / vendor-assessment section (weighted total, section completeness, lot form selection), so it may resurface as an extra section in the amendment (unverified end-to-end) — trade_request.rb:86-92, app/helpers/api/evaluations_helper.rb:897-901, 954-958
Cites: app/services/versions/trade_request.rb:13-130

### Amendment publish — the previous version is force-closed and PR links move
After commit of draft → active on a project that has a previous version (`Versions::EventGroupWorker`, async).
Rules:
1. [side-effect] Skipped for recurring templates (`is_scheduled_template`) and projects without a previous version — app/models/event_group.rb:703-709
2. [side-effect] PR-level mappings of the previous project → `in_active`; an active mapping to the new project is created per PR — app/services/versions/event_group.rb:116-145
3. [side-effect] PR-item mappings on old line items are duplicated onto the matching new line items (via old_egli_id), then the old ones set `in_active`; new lines get `meta_data.pr_line_item_id` synced — versions/event_group.rb:156-210, app/models/event_group_line_item.rb:277-294
4. [time] Previous version's technical round and latest non-lot commercial round are force-closed at the worker's run time (`end_time_for: "force_close_event"`, `force_start: true`, no extra/review time) — versions/event_group.rb:91-113
5. [side-effect] All in one DB transaction in the worker; the worker sets Current.user = project owner — versions/event_group.rb:92, app/workers/versions/event_group_worker.rb:5-10
Gaps: the close is async, so the old version stays open (bids accepted) until Sidekiq runs — app/models/event_group.rb:707
Cites: app/models/event_group.rb:118, 703-709, app/services/versions/event_group.rb:91-210

### Amendment remarks — reason recorded for an amendment
Rules:
1. [validation] `add_amendment_remarks!` with blank remarks raises StandardError "Remarks for amendment not found" (untyped unless the caller rescues) — app/models/versioning/methods.rb:102-103
2. [side-effect] Saves a Remark (event_type "EventGroup_amendment", user = project owner, message = remarks["remarks"], no attachments) — methods.rb:104-111
3. [visibility] `amendment_remarks` returns the latest ACTIVE such remark (Remark status defaults to active) — remarks, attachments, timestamps, uuid; all nil if none — methods.rb:114-123, app/models/remark.rb:11, 34
Cites: app/models/versioning/methods.rb:102-123

### EventGroup#add_new_stage_config — "Add new Stage" button state
Rules:
1. [config] Company config `is_add_new_stage_allowed` must be exactly `true`, else hidden+disabled — app/models/event_group.rb:528-531
2. [state] Hidden when the project is a draft with no previous version, or the project is not latest — event_group.rb:533-535
3. [state] Shown only when the stages in active/closed/requested/draft are exactly ONE and it is an RFP; label "Add new Stage", description "Do you want to add a new RFQ Stage?" — event_group.rb:537-560, app/models/trade_request.rb:319
4. [visibility] Hidden state returns `hidden: true, disabled: true` with empty label/description — event_group.rb:547-553
Cites: app/models/event_group.rb:528-562

### EventGroup#evaluator_users — who counts as an evaluator, by evaluation mode
Rules:
1. [permission] No `rfp_evaluation_mode` on the valid technical round → [] (no evaluators) — app/models/event_group.rb:239-242
2. [permission] Section-wise scoring (`section_wise_scoring_enabled`) → active `evaluator` access lists on that round's FORMS — event_group.rb:243-250
3. [permission] `lot_based` → active `evaluator` access lists on any RFP stage of the project not void/in_active/withdrawn/cancelled — event_group.rb:251-262
4. [permission] Otherwise (line-item based) → active `evaluator` access lists on active Form EGLITMs of ACTIVE line items — event_group.rb:263-276
5. [visibility] Returns distinct users with id, first/last name, email, phone — event_group.rb:250, 262, 275
Cites: app/models/event_group.rb:239-277

### all_line_items_have_evaluator? and pending_evaluator_ids — evaluator coverage checks
Rules:
1. [state] Uses the given technical round, else the LAST draft RFI/RFP; none → false — app/models/event_group.rb:283-285
2. [permission] An active `evaluator` access list on the round itself → true (PR-assignee path) — event_group.rb:287-294
3. [permission] Else EVERY active Form EGLITM of the project's DRAFT line items needs an active evaluator with a user; no such EGLITMs → false — event_group.rb:296-311
4. [visibility] `pending_evaluator_ids` = evaluator user ids on active Form EGLITMs in `quote_in_evaluation` for active lines — event_group.rb:314-317
Cites: app/models/event_group.rb:283-317

### TNA / Regret score helpers — display label, all-lines-TNA test
Deeper than the label table in evaluation-award.md: how the map is used.
Rules:
1. [calculation] Display label for a score = map[score.to_i] (fractional scores are truncated); blank score → nil — app/models/event_group.rb:688-692, 718-720
2. [calculation] `get_score_for_key('tna'|'regret')` looks up label "TNA"/"Regret" (exact case) in the map; unknown key → nil; result memoised per object — event_group.rb:722-724, 737-741, app/models/evaluation_score.rb:52
3. [calculation] `all_line_items_tna_for_vendor?`: false for blank vendor or no active lines; for a lot stage only the lot's lines; lines the vendor REGRETTED are ignored; true only if every remaining line's score for the vendor equals the TNA score (`has_evaluations` must be set) — event_group.rb:787-811, app/models/event_group_line_item.rb:133-145
4. [calculation] If the vendor regretted every line the remaining set is empty and `all?` returns TRUE (vendor treated as all-TNA) — event_group.rb:805-810
5. [calculation] `vendor_evaluation_score(company)` reads `precomputed_data_v1[company].evaluation_score` (lot-level) — event_group.rb:683-686
Cites: app/models/event_group.rb:675-741, 787-811

### Lot configuration helpers — default lots, active lot lookups, sorting
`lot_config` = {lot_no => {lot_title, status, stage_ids, egli_ids, old_trade_product_ids}}.
Rules:
1. [state] Default lot config = 4 lots "Lot 1".."Lot 4", status `draft` — app/models/event_group.rb:840-846
2. [state] A stage/line belongs to a lot only if that lot's status is `active` (lookups by stage id / egli id) — event_group.rb:757-770, app/models/event_group_line_item.rb:199-205
3. [state] `is_valid_lot_present?` = any lot `active`; `all_lots_withdrawn?` = no lot_config OR every lot `draft` — event_group.rb:854-862
4. [calculation] `get_sorted_stages`: non-lot stages first (stage order), then lot stages sorted by lot number (lot_config stage_ids or stage `misc.lot_no`); no lot_config → [] — event_group.rb:864-886
5. [side-effect] `send_lot_split_notification`: per new lot with old trade products → push "notify_vendors_for_lot_split" + LotSplitNotificationWorker deep-linking the lot's first stage — event_group.rb:888-900
Gaps: `get_title_for_lot` / `get_eglis_for_lot` / `get_stage_ids_for_lot` return nil (not []) without lot_config; `latest_commercial_stage_for_lot` then queries `id: nil`. `send_lot_split_notification` crashes if the old trade product no longer exists (`find_by_id(...).trade_request`) — event_group.rb:772-785, 893
Cites: app/models/event_group.rb:757-900

### Last purchase order (LPO) refresh — who may refresh and which lines
Rules:
1. [config] `is_lpo_update_allowed?` = company config `allow_lpo_update` (default false) AND some active line is linked to a PR item AND project `active` — app/models/event_group.rb:909-912, app/models/company.rb:891-893
2. [state] `refresh_lpo_data`: lines already in a SELECTED proposal are excluded; nothing queued if no lines remain or `lpo_refresh_data.status` is already "in_progress" — event_group.rb:919-929
3. [side-effect] Sets status "in_progress" then queues RefreshLpoDataWorker(project, user, company, egli_ids) — event_group.rb:926-927
4. [calculation] `lpo_vendor_ids`: last-PO vendor codes of active lines, left-padded to 10 digits with "0", matched to the buyer's vendor mappings (LPAD) whose status is in config `allowed_statuses_for_vendor` (default ["active","invited"]) — event_group.rb:1170-1182, app/models/company.rb:179-181
5. [config] LPO widgets = purchase-order widgets whose key is in company config `last_po_widget_keys` (default []) — event_group.rb:931-934
Cites: app/models/event_group.rb:909-934, 1170-1182

### PR in-progress quantity on publish / withdraw — what the PR item shows
After a project goes `active` or `withdrawn` (callback in event-groups.md); the worker computes.
Rules:
1. [side-effect] BOQ project (`config.boq_based_rfx`): only the LAST item of the LAST PR mapped to the project is recomputed; other projects: every PR item mapped to ANY of the project's line items (all statuses, all mapping statuses) — app/models/event_group.rb:988-999
2. [calculation] BOQ PR item: `quantity_in_progress` = 1 if latest commercial stage is active else 0; status `completed` if that stage is closed, `in_progress` if active, else `active` — app/workers/update_in_progress_quantity_worker.rb:34-53
3. [calculation] Non-BOQ: in-progress from `get_all_quantities` (config `open_pr_quantity_on_partial_order`); status: rate-only → unchanged; `quantity_closed >= quantity_requested` → completed; in-progress > 0 or closed > 0 → in_progress; else active — update_in_progress_quantity_worker.rb:55-84
4. [state] PR items in_active/deleted are skipped — update_in_progress_quantity_worker.rb:18-21
Gaps: BOQ path updates only `.last` PR item, so a BOQ PR with several items keeps stale in-progress values on the others (unverified that BOQ PRs have >1 item) — app/models/event_group.rb:990-992
Cites: app/models/event_group.rb:988-999, app/workers/update_in_progress_quantity_worker.rb:11-84

### EventGroupsHelper#update_closed_at — project started_at / closed_at after award
Run by EventGroupUpdateWorker (only for ACTIVE projects).
Rules:
1. [time] `started_at` = min `bid_start_time` of stages in in_active/active/closed/scheduled/withdrawn — app/models/model_helpers/event_groups_helper.rb:7, 14-15, 32
2. [state] closed_at is only touched when EVERY active line item is awarded (in an order with PO status not_requested/generated) — event_groups_helper.rb:12, 71-75, app/models/event_group.rb:1070-1078
3. [time] With such orders: closed_at = max closed_at of non-RFI/RFP stages; every stage still closing in the future is pulled to that time, and the technical round's schedules ending in the future end NOW — event_groups_helper.rb:28-38, 50-69
4. [time] RFI/RFP-only project: closed_at = max closed_at of RFIs / evaluated RFPs if already past — event_groups_helper.rb:16-19, 39-41
5. [time] All stages withdrawn/in_active: closed_at = their max closed_at — event_groups_helper.rb:24-26, 42-44
Gaps: `trade.closed_at > Time.now` / `[.., trade.bid_start_time].min` crash on a nil time (unverified that nil occurs); worker only loads `EventGroup.active`, so a withdrawn project never gets closed_at here — event_groups_helper.rb:15, 52, app/workers/event_group_update_worker.rb:16
Cites: app/models/model_helpers/event_groups_helper.rb:5-75

### get_vendor_vs_latest_bid — each vendor's current bid across price rounds
Rules:
1. [calculation] Looks at auction / rfq_then_auction / rfq stages not void/in_active/withdrawn/cancelled, in id order; within each, bids in `active`, `requested`, `selected` in id order; the LAST one seen per vendor wins (later stage beats earlier) — app/models/model_helpers/event_groups_helper.rb:77-99
2. [validation] With an explicit `event_group_id` that does not exist → `EventGroup.find` raises RecordNotFound (404/500 depending on caller), the blank check after it is dead code — event_groups_helper.rb:78-86
Cites: app/models/model_helpers/event_groups_helper.rb:77-99

### Project terms and conditions — structured read
Rules:
1. [visibility] Project T&C present (array, or hash with `clauses`) → its clauses; if the FIRST stage has `config.is_tnc_mandatory == true` every clause's `effective_mode` = "required", else the clause's own `mode` (default "none") — app/models/event_group.rb:355-361, 1271-1307
2. [visibility] Project T&C blank and exactly ONE stage → that stage's structured T&C and attachments; several stages → empty — event_group.rb:362-367
3. [visibility] Plain-string clauses become legacy clauses id "legacy_<eg>_<idx>", mode none, HTML-escaped body — event_group.rb:1274-1280
4. [visibility] Flat `terms_and_conditions` = nil when no clauses and no attachments, else plain body texts — event_group.rb:346-352
5. [visibility] Attachments: user-given links kept, S3 paths signed — event_group.rb:1317-1327
Gaps: `assign_structured_tnc!` writes `self.misc`, a column EventGroup does not have (schema annotation lines 7-28) → NoMethodError if called with attachments; no caller found under app/ — event_group.rb:373-387
Cites: app/models/event_group.rb:344-387, 1271-1327

### Project config flags and their defaults
Rules:
1. [config] `config.show_under_open_events` → default false — app/models/event_group.rb:902-907
2. [config] `config.boq_based_rfx` → default false; BOQ or service grouping enables `tabs` / `tabs_summary` — event_group.rb:936-961
3. [config] `config.is_vendor_onboarding_v2` → default false — event_group.rb:1006-1008
4. [config] Service-RFP grouping: company config `group_service_activities_in_rfp` present AND some `meta_data.pr_item_details` entry has `is_activity_line_item` and a `service_pr_item_id` — event_group.rb:165-185
5. [config] ProcolVariable `MQCS_GROUPING_ENABLED` "true" → `get_precomputed_data` returns `precomputed_data_v1`, else `precomputed_data` — event_group.rb:576-581, 1038-1040
6. [state] `is_project_on_hold?` = precomputed `is_project_on_hold` (default false); `has_evaluations` = precomputed `has_evaluations == true`; `draft_project_saved_count` = precomputed_data_v1.draft_project_data.saved_count (default 0) — event_group.rb:224-226, 694-697, 1001-1004
7. [config] `scheduled_publish_at` = meta_data.scheduled_publish_at — event_group.rb:279-281
Cites: app/models/event_group.rb:165-185, 224-230, 576-581, 694-697, 902-1008, 1038-1040

### EventGroup list scopes — search, filters, sorting
Rules:
1. [validation] Sorting: field must be one of id, created_at, updated_at, latest_stage_time (else id); direction asc/desc (else desc); no params → id desc — app/models/event_group.rb:96-108, 215-218
2. [visibility] Search `title_or_ref_id` = ILIKE on title or stored ref_id (amended projects store "RFX-n.k") — event_group.rb:90-92
3. [visibility] `owned_by_users`: projects whose active `owner` access list (access_type 3) is one of the users, or, with no owner row, whose creator is — event_group.rb:133-136
4. [visibility] `event_status_filter` / `..._pending_on_user`: active lines whose `event_statuses` contain any given status (and `pending_on_evaluator_ids` contains the user) — event_group.rb:121-130
5. [visibility] `is_auto_created_filter(true)` = meta_data.is_auto_created true; false matches null too — event_group.rb:139-145
6. [time] `created_before` / `created_at` take epoch seconds — event_group.rb:93-94
Cites: app/models/event_group.rb:87-145, 215-218

### get_participant_vendor_company_ids — participants per lot
Rules:
1. [visibility] With lot_no: `precomputed_data_v1["lot_<n>"].participant_vendor_company_ids`; missing → Sentry message + fall back to project-level list — app/models/event_group.rb:1042-1056
2. [visibility] Any error reading lot data → Sentry exception + project-level list; no lot → project-level list, default [] — event_group.rb:1057-1067
Gaps: always reads `precomputed_data_v1` even when MQCS_GROUPING_ENABLED is off (other readers switch) — event_group.rb:1047, 576-581
Cites: app/models/event_group.rb:1042-1068

### get_bid_excel_urls — project Excel downloads (technical + commercial)
Rules:
1. [visibility] Company view when no vendor is given or the vendor is the project company; else vendor view — app/models/event_group.rb:1110-1111
2. [state] Technical sheet from the LAST RFI/RFP not void/cancelled/in_active (a withdrawn RFP is used); commercial sheet from `latest_commercial_stage`; missing stage or generation error → that URL omitted — event_group.rb:1118-1124, 1256-1264
3. [time] Signed URLs expire after `expiration_time` (default 7200 s); file "procol_event_rfx_<technical|commercial>-<ref_id>.xlsx" — event_group.rb:1109, 1266-1268
4. [side-effect] Temporarily sets Current.workspace/user (vendor or project company / owner) and resets them after — event_group.rb:1112-1127
Cites: app/models/event_group.rb:1109-1129, 1256-1269

### Clara AI fields on a project — auto-pilot status, mail routing, lookup by ref
Rules:
1. [state] `clara_auto_pilot_status` enum absent 0, running 1, paused 2, success 3, stuck 5; reader returns nil for absent — app/models/event_group.rb:86, 1148-1151
2. [state] Update input "enable" → running, "disable" → paused, blank → absent; stuck with reasons stores `meta_data.clara_stuck_reasons`; written with update_columns (no callbacks) — event_group.rb:1154-1168
3. [config] Offer-reader / query-routing emails need company config `clara_ai_access_enabled.company_tenant_mapping_id`, else nil — event_group.rb:1131-1141, app/models/company.rb:1226-1228
4. [visibility] Lookup by (tenant uuid, ref_id): blank → nil; only ACTIVE projects, ref_id upper-cased — event_group.rb:1184-1194
5. [side-effect] New chat identifier "EventGroup_<uuid>_<epoch>" in meta_data — event_group.rb:1196-1205
Gaps: lookup does `config.modifications["value"]["company_tenant_mapping_id"]` for every active clara config; any config whose value is not a hash → NoMethodError, untyped 500 (unverified data shape) — event_group.rb:1189-1190
Cites: app/models/event_group.rb:86, 1131-1205

### tabs / tabs_summary — BOQ/service tabs and nil crashes
Rules:
1. [config] Both return nil unless `boq_based_rfx` or service grouping is on — app/models/event_group.rb:940-948
2. [visibility] `tabs_summary(vendor)`: vendor's last rankable bid on the latest commercial stage; on an RFQ-then-auction stage without one, the last rankable bid on the latest RFQ stage (not withdrawn/in_active); no bid → stage-level summary — event_group.rb:946-961
Gaps: BOQ project with no commercial stage → `nil.tabs` / `nil.bids` → untyped 500; RFQ-then-auction with no plain RFQ stage → `nil.bids` 500 — event_group.rb:942-943, 950-953
Cites: app/models/event_group.rb:936-961

### EventGroupLineItem statuses and the delete cascade
Rules:
1. [state] EGLI status enum: in_active 0, active 1, draft 2, deleted 3; `VALID_STATUSES` = [:active, :deleted] — app/models/event_group_line_item.rb:28, 41
2. [side-effect] status → `deleted` (after commit): DeleteItemProjectWorker(egli) queued — event_group_line_item.rb:45, 52-54
3. [side-effect] Same moment: if every remaining ACTIVE line of the project is already awarded (order PO status not_requested/generated), EventGroupUpdateWorker recomputes the project (closed_at etc.) — event_group_line_item.rb:56-60, app/models/event_group.rb:1070-1078
4. [state] `is_part_of_draft_project?` = project is draft AND saved at least once (`draft_project_saved_count > 0`) — event_group_line_item.rb:108-114
5. [side-effect] Any save invalidates the project's MCP cache — event_group_line_item.rb:46-50
Cites: app/models/event_group_line_item.rb:28-60, 108-114

### EventGroupLineItem quantity, unit and closed quantity
Rules:
1. [calculation] `quantity` = `precomputed_data.creator_fields.creator_quantity.value` (nested `.value.value` if a hash) as float; if creator_quantity is missing → quantity of the line's last active/closed trade product; none → 0.0 — app/models/event_group_line_item.rb:62-77
2. [calculation] `unit_symbol` = creator_quantity.unitSymbol, nil if not a hash — event_group_line_item.rb:100-106
3. [calculation] `add_closed_quantity(q)`: meta_data.quantity.closed_value += q (starting 0); a legacy float quantity is converted to {value, closed_value: q} — event_group_line_item.rb:83-94
4. [calculation] `closed_quantity` = meta_data.quantity.closed_value, default 0 — event_group_line_item.rb:96-98
5. [visibility] Report hash shows '-' for missing PR item no, PR no, fund center, WBS, tracking no, requisitioner, name, code, quantity, UOM, serial — event_group_line_item.rb:172-187
Gaps: `quantity`/`unit_symbol` call `precomputed_data.dig` without nil-guard → NoMethodError for a line with null precomputed_data (untyped 500) — event_group_line_item.rb:63, 101
Cites: app/models/event_group_line_item.rb:62-106, 172-187

### EventGroupLineItem regret, TNA and per-vendor evaluation reads
Rules:
1. [state] Regret is stored as `meta_data.participants[<vendor_company_id as string>] == "regretted"`; `is_regretted_item?(ids)` checks the first listed vendor present in participants — app/models/event_group_line_item.rb:120-127
2. [visibility] `regretted_participants` = vendor ids with "regretted" — event_group_line_item.rb:147-149
3. [calculation] `evaluation_score_for(vendor)` = precomputed_data[vendor].evaluation_score, but only when `precomputed_data.has_evaluations` is truthy, else nil — event_group_line_item.rb:133-137
4. [calculation] `is_tna?` = that score.to_i == TNA score.to_i; false if either is blank — event_group_line_item.rb:139-145
5. [side-effect] `reset_precomputed_data(company)` keeps only the vendor's `evaluation_score` (drops the rest), or removes the vendor key entirely when unscored — event_group_line_item.rb:215-227, app/services/precomputation_engine/refresh_precomputed_data_service.rb:47
Cites: app/models/event_group_line_item.rb:120-149, 215-227

### EGLI event_statuses and EventGroupLineItemTradeMapping stages
The per-line status chips (open, quote_in_evaluation …) used by project filters.
Rules:
1. [state] EGLITM `current_stage` enum: open 0, upcoming 1, quote_in_progress 2, quote_in_evaluation 3, expired 4, closed 5, draft 6, response_review_time_for_participant 7, send_for_evaluation 8, counter_offer_requested 9; status in_active 0 / active 1 (default active) — app/models/event_group_line_item_trade_mapping.rb:27-32
2. [side-effect] Whenever an EGLITM's `status_timeline` changes, the line's `event_statuses` = latest timeline value of each ACTIVE mapping — event_group_line_item_trade_mapping.rb:34, 39-43, app/models/event_group_line_item.rb:151-160
3. [state] `current_status` = timeline value at the numerically largest epoch key — event_group_line_item_trade_mapping.rb:52-55
4. [state] EGLITM `is_evaluated?` = ANY vendor on the line has an evaluation_score — event_group_line_item_trade_mapping.rb:45-50
Gaps: EGLI `update_event_statuses` picks the latest timeline key with string `max` while `current_status` uses integer max; keys of different length (seconds vs milliseconds) give different "latest" status — event_group_line_item.rb:155 vs event_group_line_item_trade_mapping.rb:54
Cites: app/models/event_group_line_item_trade_mapping.rb:27-55, app/models/event_group_line_item.rb:151-160

### Pending-on evaluator for a line item — who the line waits for
Recomputed after every EvaluationScore status change on an EGLITM.
Rules:
1. [permission] Default pending user = first active `evaluator` access list on the EGLITM — app/models/event_group_line_item_trade_mapping.rb:57-61, 66-67
2. [permission] Switches to the first active `owner` access list when any score is `peer_review`, or when the evaluator is part of the evaluating team (section incharge) AND (a score is `requested` or the line is already evaluated for any vendor) — event_group_line_item_trade_mapping.rb:63-65
3. [side-effect] Written as `meta_data.pending_on_evaluator_ids = [id]` on the line (raw SQL); nothing written when no id — app/models/evaluation_score.rb:51, 63-66, app/helpers/api/evaluations_helper.rb:739-747
Cites: app/models/event_group_line_item_trade_mapping.rb:57-69, app/helpers/api/evaluations_helper.rb:739-747

### EGLI last-PO (historical price) fields
Rules:
1. [visibility] Historical price = entry in `precomputed_data.lpo_data.reference_prices` with referenceKey "historical_price"; vendor code, PO number, last PO quantity, currency, price read from it — app/models/event_group_line_item.rb:301-323, 348-355
2. [time] `last_po_created_date`: blank or "00000000" → nil; parsed as YYYYMMDD, then YYYY-MM-DD, else nil — event_group_line_item.rb:325-342
3. [visibility] Vendor name/city/id: vendor code zero-padded to 10, matched among the buyer's NON-in_active vendor mappings; cached 1 day per company+code+field — event_group_line_item.rb:357-388
Cites: app/models/event_group_line_item.rb:296-388

### PurchaseRequestTradeMapping — PR ↔ project / line links
Rules:
1. [state] Status enum in_active 0, active 1 (default active) — app/models/purchase_request_trade_mapping.rb:24
2. [validation] One non-in_active mapping per (reference, item): a duplicate fails "Reference has already been taken"; `find_or_create_by!` then raises RecordInvalid (untyped unless rescued) — purchase_request_trade_mapping.rb:28-30
3. [side-effect] `delete_and_created_mapping_with_egli`: the line's active mapping to a DIFFERENT PR item is set in_active, then an active mapping to the new item is found/created — purchase_request_trade_mapping.rb:32-44
4. [state] `created_from_pr?` = any PR mapping on the project not in_active; it blocks cloning (policy create_clone?) — app/models/event_group.rb:1010-1013, app/policies/event_group_policy.rb:46-50
5. [visibility] Line's displayed PR item = active-mapped PR item, else the most recent mapping of any status — app/models/event_group_line_item.rb:166-170
Cites: app/models/purchase_request_trade_mapping.rb:20-45, app/models/event_group.rb:1010-1013

### Evaluation model — statuses and RFI auto-close on the first active evaluation
Rules:
1. [state] Evaluation status enum: in_active 0, active 1, draft 2, requested 3, revised 4, peer_review 5, reevaluated 6; trade_request, evaluator and participant company required — app/models/evaluation.rb:28-34
2. [state] After every save: on an RFI (not vendor-onboarding v2) the round is set `closed`, closed_at = now, as soon as ANY one evaluation of the round is `active` — evaluation.rb:36, 40-48, app/models/model_helpers/trade_request_model_helper.rb:1280-1282
3. [state] `evaluation_scores` excludes in_active scores; `remarks` only active — evaluation.rb:31-32
Gaps: an RFI with several vendors/evaluators closes after the first vendor's evaluation goes active, cutting off evaluation of the others — evaluation.rb:43-46, trade_request_model_helper.rb:1281-1282
Cites: app/models/evaluation.rb:26-48

### Evaluation reevaluated — proposal score ids rewired (crash case)
When an evaluation is saved as `reevaluated`, requested technical proposals are repointed to the new scores.
Rules:
1. [side-effect] For each `requested` proposal on the round containing `requested` scores of this evaluation: in `responses_hash.data[vendor].evaluation_score_ids`, an old score id is replaced by the score on the same item in the vendor's active/peer_review/draft evaluation — app/models/evaluation.rb:50-76
2. [side-effect] Written with update_columns (no callbacks, no audit) — evaluation.rb:75
Gaps: a vendor in the proposal without an active/peer_review/draft evaluation (`evaluation` nil), or no new score on the same item, → NoMethodError in an after_commit → untyped 500 after the data is already committed — evaluation.rb:62, 68
Cites: app/models/evaluation.rb:50-77

### EvaluationScore model — enums and vendor-onboarding v2 score sum
Rules:
1. [state] Status enum: in_active 0, active 1, draft 2, requested 3, revised 4, peer_review 5, rejected 6, reevaluation_requested 7, reevaluated 8; `score_type` restricted 0 (default) / unrestricted 1 — app/models/evaluation_score.rb:42-46
2. [calculation] Vendor-onboarding v2 rounds: before every save `score` = sum (to_f) of all values under `meta_data.score_type_vs_key_attribute_vs_score.score_widget`; missing → 0 (any client-sent score is overwritten) — evaluation_score.rb:49, 54-61
3. [side-effect] Status change on a line-item (EGLITM) score → pending-on evaluator recomputed — evaluation_score.rb:51, 63-66
4. [state] Precompute runs only for `active` or `reevaluated` scores on EGLITM or Form items, never for vendor-onboarding rounds — evaluation_score.rb:68-71
Cites: app/models/evaluation_score.rb:37-71

### EvaluationScore precompute — what a score writes into line/project data
Deeper than evaluation-award.md "Evaluation scores going active".
Rules:
1. [calculation] Value written = the score for `active`; for `reevaluated` evaluation_score AND remark are written as nil (the line becomes un-scored for that vendor) — app/models/evaluation_score.rb:87-89
2. [calculation] Remark = message of the score's `remark_id` remark — evaluation_score.rb:89
3. [calculation] Line-item mode: when the score equals the TNA score (line path compares raw `score`), the vendor's `rank_score` on that line is set nil — evaluation_score.rb:231-239
4. [side-effect] Service-RFP grouping: the same score/remark is copied to sibling activity lines of the same PR item — evaluation_score.rb:214-227
5. [side-effect] `has_evaluations = true` written on the line and on the project's `precomputed_data_v1` — evaluation_score.rb:213, 228, 267-269
6. [state] Re-evaluated scores close the RFP only if no vendor entry on the line/project has a nil evaluation_score — evaluation_score.rb:100-102, 194-203
Gaps: project-level score and `has_evaluations` go only to `precomputed_data_v1`, but `EventGroup#has_evaluations` and lot-level `is_evaluated?` read `get_precomputed_data` (= `precomputed_data` when MQCS_GROUPING_ENABLED is off) → lot RFPs would never auto-close in that mode (unverified prod flag) — evaluation_score.rb:241-253, app/models/event_group.rb:224-226, 576-581
Cites: app/models/evaluation_score.rb:68-104, 194-269

### RFP is_evaluated? — when a technical round counts as fully evaluated (auto-close)
Rules:
1. [state] RFI: any `active` evaluation — app/models/model_helpers/trade_request_model_helper.rb:1281-1282
2. [state] RFP, line-item context: EVERY active line has at least one vendor with an evaluation_score AND no score on that line is `reevaluation_requested`; no active lines → false — trade_request_model_helper.rb:1295-1298, 1305-1330
3. [state] RFP, lot context (`lot_based`, or both-evaluation with no line-item forms given): number of vendors with a project-level evaluation_score == number of ACTIVE template responses; zero scored → false — trade_request_model_helper.rb:1286-1294, 1462-1469
4. [state] Both lot and line evaluation on: closing also requires the line-item check — app/models/evaluation_score.rb:151-158
5. [side-effect] When true: round `closed`, closed_at = now, active extra_closing_time schedule ends now — evaluation_score.rb:159-163
Gaps: line-item mode needs only ONE vendor scored per line, so the RFP auto-closes while other vendors on the same lines are still unscored — trade_request_model_helper.rb:1319-1327
Cites: app/models/model_helpers/trade_request_model_helper.rb:1280-1330, app/models/evaluation_score.rb:151-165

### Section-wise weighted total — how the vendor's technical total is computed
Rules:
1. [calculation] Sections = the round's forms with NO line-item mapping; weight = `form.section_weightage` (to_f, missing → 0) — app/helpers/api/evaluations_helper.rb:897-904
2. [calculation] Scores = all of the vendor's Form scores across ALL evaluators except `in_active` and `rejected` (draft, requested, peer_review included); per section the most recently UPDATED score wins — evaluations_helper.rb:907-919
3. [calculation] Total = Σ score × weight / 100, rounded to 2 decimals; stored in `evaluation.scoring_info.total_weighted_score` and used as the vendor's project evaluation score — evaluations_helper.rb:921, app/models/evaluation_score.rb:183-192
4. [state] Precompute waits until every section has an `active`/`reevaluated` score from a non-reevaluated evaluation — evaluations_helper.rb:954-973, evaluation_score.rb:73-76
5. [calculation] Section-wise TNA test compares the weighted total (not the raw score) with the TNA score — evaluation_score.rb:248-251
Gaps: a later-edited DRAFT score of a second evaluator overrides an approved active score in the total — evaluations_helper.rb:915-919
Cites: app/helpers/api/evaluations_helper.rb:897-973, app/models/evaluation_score.rb:183-192

### TemplateResponse statuses — vendor technical answers (RFI/RFP/onboarding)
Rules:
1. [state] Status enum: in_active 0, active 1 (submitted), revised 2, draft 3, accepted 4, rejected 5, requested 6, edit_in_review 7 — app/models/template_response.rb:55
2. [state] `latest` = not draft/in_active/revised; `VALID_TEMPLATE_RESPONSE_STATUSES` = active, revised, requested, accepted — template_response.rb:95, 100
3. [time] `placed_at` stamped when saved as `active` coming from nil or `draft` (first submission) — template_response.rb:62, 294-296
4. [side-effect] On becoming `active`, the vendor's other DRAFT responses on the same round (same alternative mapping) are set in_active — template_response.rb:87, 562-568
5. [visibility] `is_surrogate_response?` = other_details.is_surrogate_response — template_response.rb:390-392
Gaps: `is_surrogate_response?` and `score=` index `other_details` without a nil-guard (`score=` evaluates `other_details || {}` but discards it) → NoMethodError on a response with null other_details — template_response.rb:107-111, 390-392
Cites: app/models/template_response.rb:55-111, 294-296, 390-392, 562-568

### TemplateResponse submission side effects (draft → active)
Rules:
1. [side-effect] Vendor company appended to the round's `misc.bid_company_ids` (participant list) — app/models/template_response.rb:88, 570-577
2. [side-effect] RFI only, first submission (no `revised` response of that vendor): RfiMails "complete" mail; plus vendor-form-submission mail if an Invitation from the buyer exists — template_response.rb:579-590
3. [side-effect] RFI/RFP first active submission: vendor's pending "response submission" tasks marked completed (also on create when created active) — template_response.rb:88-89, 592-599
4. [config] RFP first submission: company config `send_new_bid_mail_to_intake_creator` (default false) → VendorStageSubmissionMailer to project owner + intake creators with an email — template_response.rb:90-92, 601-615, app/models/company.rb:292-294
5. [side-effect] RFP response → active: global-form answers precomputed onto the project and line-form answers onto the line (plus service siblings) for the commercial stage's "auto fetch from RFP" widgets; skipped if the commercial stage has none — template_response.rb:86, 113-161
Cites: app/models/template_response.rb:86-92, 113-161, 570-615

### TemplateResponse — vendor onboarding status transitions
Only when the response's round is a vendor-onboarding TradeRequest.
Rules:
1. [side-effect] draft/requested → active: vendor mapping "in_review"; active → requested: "in_approval"; → accepted: "active" with score value/label + resolved mail; → rejected: "rejected" + resolved mail — app/models/template_response.rb:67-69, 627-646
2. [side-effect] Update-vendor rounds delegate all of this to VendorDetailUpdates::ResolveService and send no accepted mail — template_response.rb:617-633
3. [side-effect] → accepted: custom buyer form data saved, entity_mappings auto-populate company fields, integration queued unless config `is_vendor_entity_mapping_enabled`; vendor mapping integration_status `requested` — template_response.rb:59-65, 74-76, 179-194, 648-674
4. [time] v2 → accepted/rejected: evaluation window (extra_closing_time) ends now if still open; v2 → requested: bidding ends now and evaluation window starts now with its original length — template_response.rb:78-85, 676-699
5. [time] v2 draft → active with config-driven final validation: recheck worker in 5 minutes — template_response.rb:71-73, 487-492
Cites: app/models/template_response.rb:57-85, 179-194, 487-492, 617-699

### TemplateResponse — onboarding score rules and approval outcomes
Rules:
1. [calculation] On becoming active (onboarding, not v2): score value = the round's `config.ranking_widget` value from the answers; with `rules`, the FIRST rule whose condition is true adds its `score.label`; no rule matches → score unchanged — app/models/template_response.rb:57, 351-376
2. [side-effect] Approval completed → status = approval `resolution` via TemplateResponses::UpdateService — template_response.rb:394-405
3. [side-effect] Approval rejected/expired/withdrawn → buyer response (data.buyer_response_id) set in_active, ALL evaluations of the round in_active, vendor response back to `active` — template_response.rb:407-414
4. [config] Same, onboarding v2 for the company in ProcolVariable `GRASIM_COMPANY_ID`: the vendor mapping's active buyer response is re-opened as draft by the round creator — template_response.rb:415-423
5. [visibility] Approval title "Request to Accept Vendor" / "Request to Reject Vendor"; v2 uses the vendor company as event — template_response.rb:428-458
Gaps: ProcolVariable `GRASIM_COMPANY_ID` missing → `nil.value` NoMethodError on every v2 rejection — template_response.rb:415
Cites: app/models/template_response.rb:351-376, 394-458

### Reminder model — 10-minute cooldown and recipient keys
Rules:
1. [state] Enums: status in_active 0 / active 1; reminder_type manual 0 / scheduled 1; delivery_channel email 0, notification 1, both 3 — app/models/reminder.rb:24-26
2. [time] `can_remind?` = never reminded OR strictly more than 10 minutes since the last reminder (Time.current) — reminder.rb:28-30
3. [visibility] Recipient identifier "u-<user id>" for approvals / pending_evaluations, else "c-<company id>"; category = reminder type singular CamelCase — app/services/reminders/base_service.rb:23-41
4. [side-effect] Sent reminders are bulk-inserted (manual, email, active) with sender user/company; auction reminders store meta_data.trade_id; no auction stage → error 533 — base_service.rb:33-55, app/services/reminders/event_group_service.rb:60-68
Gaps: the 10-minute rule only sets the `can_remind` flag in the list; the send path never checks it, so the API can re-send immediately — app/services/reminders/strategies/base_strategy.rb:14-23, event_group_service.rb:36-71. Model `belongs_to :user` (required) but the table has no user_id → any ActiveRecord create would fail "User must exist" (only insert_all is used) — reminder.rb:9-23
Cites: app/models/reminder.rb:21-31, app/services/reminders/base_service.rb:23-55

### EventSnapshot — proposal snapshot rows
Rules:
1. [validation] `item_id`, `item_type` and `snapshot_data` are required; a snapshot with only `snapshot_data_v1` fails validation — app/models/event_snapshot.rb:22-26
2. [state] Status in_active 0 / active 1 (default active) — event_snapshot.rb:28
3. [config] `get_snapshot_data` = `snapshot_data_v1` when ProcolVariable MQCS_GROUPING_ENABLED is "true", else `snapshot_data` — event_snapshot.rb:32-42
4. [side-effect] Score changes patch `snapshot_data_v1` of requested/draft proposals (line or event evaluation_score; nil unless active) — app/models/evaluation_score.rb:106-134
Gaps: `set_evaluation_score_in_snapshot` (Form path) writes `selected_eg_precomputed_data[vendor]` without checking it exists → NoMethodError when only the unfiltered data has the vendor — evaluation_score.rb:126-128
Cites: app/models/event_snapshot.rb:18-43, app/models/evaluation_score.rb:106-134

### TradeFlexiMapping — flexi responses linked to a stage
Rules:
1. [state] `category` participant 0 / client 1; `status` in_active 0 / active 1 (default active) — app/models/trade_flexi_mapping.rb:23-24
2. [validation] trade_request, fx_response and owner_company are required associations; a mapping without owner_company fails "Owner company must exist" even though the column is nullable — trade_flexi_mapping.rb:11, 19-21, config/initializers/new_framework_defaults.rb:19
Cites: app/models/trade_flexi_mapping.rb:18-28

## Error codes in this area
- 2 (HTTP 422) "Insufficient parameters" — item_versions#create missing/unsupported item (app/controllers/api/item_versions_controller.rb:9-11)
- 888 (HTTP 422) "Invalid Parameters" — amendment on a missing, non-active or non-latest project (item_versions_controller.rb:14-16)
- 455 (HTTP 422) "You are not authorized to perform this action" — Pundit refusal, e.g. create_version? (app/controllers/concerns/api_auth.rb:117-118)
- 533 (HTTP 422) "Project does not exist." — auction reminder with no auction stage (app/services/reminders/event_group_service.rb:62)
- Untyped: "Remarks for amendment not found" StandardError (app/models/versioning/methods.rb:103); RecordNotUnique on a second draft version; RecordInvalid "Reference has already been taken" from PR mappings.
