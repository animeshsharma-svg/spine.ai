# Event lifecycle services (create, update, clone, version, convert, lots, regret, POC bids, responses) — backend digest (procol-backend origin/main ae36e86894)

## Overview
This file covers the SERVICE layer behind the event-group and trade controllers: what the services do after the
controller has accepted a request. The controller-level checks (entry codes, policies, routing) are in
event-groups.md, trade-stages.md, trade-live-v1.md, auction-templates.md, bids.md and evaluation-award.md; this file
does not repeat them. Files: app/services/event_groups/* (create, update, clone, participate, PR→eRFX, ownership
transfer, service line-item deletion and mapper, replication base, search), app/services/trade_requests/* (quick-flow
stage builders Create/Update Rfq/Rfp/Auction, TabRangeResync), app/services/versions/* + app/workers/versions/
event_group_worker.rb (amendment versions), app/services/clones/trade_request.rb + trade_request_replication_base.rb,
rfq_to_auction/create_service.rb, create_event_lots/create_service.rb, bids/line_item_regret_service.rb,
template_responses/*, poc_bid_action_service.rb + poc_bid_sibling_action_service.rb, pending_tasks counter-offer
tasks, ai_auditor/counter_offer_auditor.rb, trade_rounds/create_service.rb, proposals/create_draft_service.rb.
All error codes below have HTTP 422 unless stated (config/locales/en-IN.yml api_errors).

### EventGroups::CreateService — what a new draft project and its line items store
Runs for POST /event_groups after the controller checks (see event-groups.md). Saves the project, then bulk-inserts line items.
Rules:
1. [side-effect] Project gets user, company, status, title, `description_markdown`, attachments, config; then `save!` (a model error raises) — app/services/event_groups/create_service.rb:31-42
2. [state] BOQ project (`boq_based_rfx?`) with no `line_items` creates no line items and returns [] — create_service.rb:47-50
3. [side-effect] Each line item gets the PROJECT's status (draft for a draft project), serial numbers 1..n in request order, `meta_data` = the resolved line item hash — create_service.rb:52-58
4. [calculation] `precomputed_data.creator_fields.creator_quantity` = {value, unitSymbol}: when `quantity` is a hash, value = quantity.value (or quantity.value.value) and unitSymbol = quantity.unitSymbol; when it is a plain number, value = quantity and unitSymbol = `display_unit` — app/services/event_groups/service_helper.rb:3-21
5. [side-effect] Line items are inserted with `validate: true, raise_error: true` and a Version row `create` is recorded for each — create_service.rb:62-64
Cites: app/services/event_groups/create_service.rb:31-66, app/services/event_groups/service_helper.rb:3-22

### EventGroups::CreateService — PR item details and the company scope of PR checks
How a new project records which PR items (service / activity) its line items came from.
Rules:
1. [visibility] `meta_data.pr_item_details` (is_activity_line_item, ancestry_id, service_pr_item_id) is built only for PR items whose PR belongs to the SAME company; PR item ids of another company are silently ignored — create_service.rb:68-90
2. [calculation] service_pr_item_id = the PR item id for a service item; the parent id (`ancestry.to_i`) for an activity item; nil otherwise — create_service.rb:92-95
3. [config] The dormant-PR gate (1125) runs only when the company's dormant feature is enabled and only over PR items of the same company — create_service.rb:103-116
Gaps: a `pr_line_item_id` of another company passes the dormant gate and is still written into the line item's meta_data (unverified live) — create_service.rb:79-81, 111-113.
Cites: app/services/event_groups/create_service.rb:68-124

### EventGroups::UpdateService#create_line_items — how sent line items are upserted
Used by PATCH /event_groups/:id with `line_items`, and by PR→eRFX with `add_new_line_items: true`.
Rules:
1. [state] Items with `status: "deleted"` are excluded here (they go to update_line_items); the rest are upserted — app/services/event_groups/update_service.rb:97-98
2. [state] An item with an `id` is matched by `EventGroupLineItem.where(id: ...)` with NO project filter, then its `event_group` is set to this project and saved — update_service.rb:99, 111-113, 129-138
3. [calculation] Serial numbers are rewritten to 1..n in request order; in add-new mode they continue after the existing active/draft count (previous + index + 1) — update_service.rb:100-103, 115
4. [state] Every upserted item takes the project's current status (draft or active) — update_service.rb:112
5. [side-effect] Existing rows bulk-upserted (+ Version `update`), new rows inserted (+ Version `create`) — update_service.rb:129-148
6. [side-effect] Add-new mode only: PR mapping recreated per line item — update_service.rb:151, 155-161
Gaps: line-item lookup by id is not scoped to the project, so an id from another project (even another company) would be moved into this one (defect-shaped, unverified live) — update_service.rb:99, 111-113. Items not sent keep their old serial numbers, so numbers can repeat.
Cites: app/services/event_groups/update_service.rb:95-161

### EventGroups::UpdateService#update_line_items — deleting line items, guard gaps
Deletion behind PATCH /event_groups/:id (controller part in event-groups.md "delete line items").
Rules:
1. [validation] 711 "You cannot delete this line item from the project" only when the request has exactly ONE line item AND the project has exactly one ACTIVE line item — update_service.rb:173-176
2. [validation] 711 when a deleted item is in a valid award proposal — update_service.rb:177-182
3. [state] BOQ project: every line item of the project NOT returned by create_line_items (any status) is marked for deletion — update_service.rb:164-166
4. [state] Draft project → items `in_active`; live project → `deleted` and their forms `deleted` — update_service.rb:188-192, 382-388
5. [state] Service-RFP grouping applies (see ServiceLineItemDeletion) → whole sibling group `deleted`, DeleteServiceProjectWorker queued, the proposal guard above still ran first — update_service.rb:184-185, 218-223
Gaps: (a) sending 2+ line items all with `status: "deleted"` bypasses the last-item guard, so every line item of a live project can be deleted in one request (defect-shaped, unverified live) — update_service.rb:173-176; (b) on a live project the trade products of deleted items are NOT voided (only the draft path voids them, :200-201, 390-405), which later crashes cloning (see clone section).
Cites: app/services/event_groups/update_service.rb:163-223, 382-405

### EventGroups::UpdateService — stages left with no active line item
What happens to stages after a live delete.
Rules:
1. [state] Only LOT stages (ids in `lot_config[*].stage_ids`) that are not closed/cancelled/withdrawn are checked; one with no trade product mapped to an active line item → `closed`, closed_at = now — update_service.rb:504-523
2. [side-effect] PR activity log `deleted_from_event` for linked PR items (actor: user, else Current.user, else project owner) — update_service.rb:435-448
3. [side-effect] Award proposal reset: for lot projects only the deleted item's lot, otherwise the whole project — update_service.rb:193-196, 212-214
Gaps: a NON-lot stage whose every line item was deleted stays live with zero active items (no close) — update_service.rb:505-506.
Cites: app/services/event_groups/update_service.rb:186-216, 435-448, 504-523

### EventGroups::UpdateService — PR quantity bookkeeping for draft projects
How a PR item's "quantity in draft projects" is kept (update_quantity_of_purchase_request_items).
Rules:
1. [calculation] New quantity per linked PR item: 0 when the update status is `withdrawn` or `in_active`; otherwise the line item's quantity if the line item is still `draft`, else 0 — update_service.rb:418-424
2. [calculation] Stored in PR item `meta_data.draft_projects_quantity_data[<project id>]`; 0 removes the key; unchanged value is a no-op; any change runs UpdateInProgressQuantityWorker inline — purchase_request_item.rb:664-677
3. [side-effect] Mapping lookup uses PurchaseRequestTradeMapping directly (any mapping status) — update_service.rb:411-415
4. [side-effect] On withdraw, PR items that were `in_progress` are logged `event_withdrawn_reopened` with the open quantity; open quantity uses company config `open_pr_quantity_on_partial_order`; on error it falls back to `quantity_open` — update_service.rb:428-430, 450-472
Cites: app/services/event_groups/update_service.rb:407-472, app/models/purchase_request_item.rb:664-700

### EventGroups::UpdateService#discard_draft_project — PR item made inactive discards whole drafts
Triggered by the model, not by an API: when a PR item becomes `in_active`, every DRAFT project holding it is discarded.
Rules:
1. [side-effect] Trigger: PurchaseRequestItem after_save_commit when status changes to `in_active`; projects = keys of its `draft_projects_quantity_data` still in `draft` — app/models/purchase_request_item.rb:313, 531-543
2. [state] Every stage of that project → `void` with forms, access lists and draft trade products removed — update_service.rb:485-491
3. [state] All draft line items → `in_active`, their PR mappings → `in_active`, project status → `in_active` — update_service.rb:496-502
4. [calculation] PR quantities of ALL the project's line items reset to 0 (status in_active) — update_service.rb:492, 420-421
Gaps: the whole draft project is discarded even when only one of its many PR items was deactivated (other PR items lose their draft quantity too) — purchase_request_item.rb:537-541.
Cites: app/services/event_groups/update_service.rb:485-502

### EventGroups::CloneService — which stages a clone gets
POST /event_groups/:id/create_clone after its checks (event-groups.md). Stages are rebuilt by Clones::TradeRequest.
Rules:
1. [state] Only stages with rfx_mode rfi/rfp/rfq and status not `in_active` are cloned; auctions (incl. rfq_then_auction) are never cloned — app/services/event_groups/clone_service.rb:57-62
2. [state] Lot child RFQs (ids in `lot_config` lots with status `active`) are skipped; the parent RFQ is cloned — clone_service.rb:64-66, 77-86
3. [state] Clone owner = cloning user; project `draft`; ref_id regenerated ("RFX-<count of latest projects>") — replication_base.rb:5-13, clone_service.rb:34, 88-90, event_group.rb:429-433
Gaps: withdrawing a project sets every non-draft stage to `in_active` (event-groups.md withdraw part 3), and the 1122 check allows cloning a WITHDRAWN project, so a clone of a withdrawn project gets the line items but NO stages (defect-shaped, unverified live) — clone_service.rb:60-62.
Cites: app/services/event_groups/clone_service.rb:13-100

### Clones::TradeRequest — what a cloned stage keeps and resets
Per-stage copy used by project clone.
Rules:
1. [state] Stage copied with `dup`: status `draft`, callbacks skipped, new ref_id, `auction_analytics_json` nil — app/services/trade_request_replication_base.rb:5-9, clones/trade_request.rb:19-21, 44-47
2. [state] Reset: `misc.bid_company_ids` [], `misc.savings_configuration` nil, `misc.precomputed_bids_data` nil, `event_score_for_participants` {} — trade_request_replication_base.rb:11-15
3. [state] team_identifier restored from the source so the buyer team sees it — clones/trade_request.rb:16, 35-36
4. [state] Everything else in config/misc/widgets is copied as is.
Gaps: `misc.is_converted_to_lots` is not reset, so cloning a project whose RFQ was split into lots gives a clone RFQ that opens read-only in the editor (`read_only_mode` true) — trade_request_replication_base.rb:11-15, app/serializers/trade_template_serializer.rb:121; `misc.is_rfq_converted_to_auction` is copied too, so an ended clone RFQ reports evaluation "completed" — app/models/trade_request.rb:401, 421-424 (both unverified live).
Cites: app/services/clones/trade_request.rb:15-47, app/services/trade_request_replication_base.rb:5-21

### Clones::TradeRequest — schedules of a cloned stage
Rules:
1. [time] Bidding schedule: the FIRST active schedule of type `rfq` (RFQ) or `bidding_time` (RFI/RFP) is copied with start = now and end = start + 21 days, whatever the source duration — app/services/clones/trade_request.rb:49-53, 61-71
2. [time] Evaluation schedule: first active `rfq_extra_closing_time` / `extra_closing_time`, start = new bid end, end = that + 21 days — clones/trade_request.rb:73-82
3. [time] No active bidding schedule on the source → no schedules at all are copied (also no evaluation schedule) — clones/trade_request.rb:56, 62-63
4. [time] Response-review, dynamic-extension and other schedule types are not copied — clones/trade_request.rb:52-53
Cites: app/services/clones/trade_request.rb:49-82

### Clones::TradeRequest — vendors, evaluators and forms of a cloned stage
Rules:
1. [side-effect] Audience rows are duplicated as they are (same statuses, visibility, source) onto the clone — trade_request_replication_base.rb:24-26, app/models/audience.rb:42-51
2. [permission] RFI/RFP: stage access lists copied (every row, any status); RFQ: stage access lists are NOT copied — clones/trade_request.rb:28-33, trade_request_replication_base.rb:29-34, access_list.rb:93-101
3. [side-effect] RFI/RFP: only `active` forms copied with their pages; a form is linked to the cloned line item when its line item was cloned; line-item evaluators (access lists of the old mapping, any status) copied — trade_request_replication_base.rb:37-63
4. [state] Line items: only ACTIVE ones, as `draft`, precomputed data and event_statuses cleared — clone_service.rb:48-55, replication_base.rb:16-32
Cites: app/services/trade_request_replication_base.rb:23-64

### Clones::TradeRequest — price-round lines of a cloned RFQ (crash on deleted items)
Rules:
1. [side-effect] RFQ: trade products = non-in_active, non-void ones; each linked to the clone line item via `meta_data.old_egli_id`; `other_details.old_trade_product_id` set; scores cleared — trade_request_replication_base.rb:67-72, model_helpers/trade_request_model_helper.rb:1393-1395, trade_product.rb:325-343
2. [state] Lines whose line item is missing or `in_active` are skipped — trade_product.rb:328-329
Gaps: a line whose line item is `deleted` (deleted on a live project, where the trade product stays active) is not skipped; the lookup returns nil and `.id` raises → clone fails with an untyped 500 (defect-shaped) — trade_product.rb:328-333, update_service.rb:188-192.
Cites: app/models/trade_product.rb:325-343

### Versions::EventGroup#replicate — what an amendment draft copies
Creating a new version (amendment) of a live project: POST item_versions (EventGroup) or the PR amendment flow.
Rules:
1. [state] New project = `deep_dup` of the live one with status `draft`; only `meta_data.quotation_templates` is dropped — app/services/versions/event_group.rb:31-34
2. [state] NOT reset (unlike clone): ref_id (shown as "RFX-n.<version>"), user_id (original creator), started_at, closed_at, closed_by_id, lot_config, precomputed data — versions/event_group.rb:31-34, versioning/methods.rb:86-95
3. [state] Line items: only ACTIVE ones, as `draft`, with `old_egli_id`; evaluation keys `has_evaluations`, `evaluation_score`, `evaluation_remark` removed from precomputed data (top level and nested) — versions/event_group.rb:37-46, 147-154
4. [side-effect] `precomputed_data(_v1).trade_template_id` = the commercial stage's template; draft saved_count +1 so it shows in Drafts — versions/event_group.rb:68-73
Gaps: the version keeps the creator as owner (`user_id`), and a draft is visible only to its owner, super admin and Procol staff (event-groups.md "who can see a project"), so a non-owner who creates the amendment may not see it (unverified live) — versions/event_group.rb:31-34. lot_config is copied but lot RFQs are not versioned (next section), so it points at the old version's stages (unverified effect).
Cites: app/services/versions/event_group.rb:18-87

### Versions::EventGroup — which stages get a new version
Rules:
1. [state] Technical: only the LAST RFI/RFP that is not cancelled/withdrawn — versions/event_group.rb:50-55, event_group.rb:973-975
2. [state] Commercial: only ONE stage — the last non-lot auction/RFQ/rfq_then_auction not withdrawn/draft/in_active; with `prefer_rfq_commercial` (PR amendment flow) the first non-lot RFQ is preferred — versions/event_group.rb:60-67, event_group.rb:607-617, purchase_requests/amendment_service.rb:319
3. [state] Every other stage (earlier RFI when an RFP exists, the RFQ when an auction followed it, lot RFQs, draft stages) is NOT carried into the amendment — versions/event_group.rb:50-67
4. [state] Each stage is versioned through create_version, so it also gets its own ItemVersion — versions/event_group.rb:55, 66, versioning/methods.rb:3-16
Cites: app/services/versions/event_group.rb:49-77, app/models/event_group.rb:607-617, 973-975

### Versions::TradeRequest#replicate — what a versioned stage copies
Rules:
1. [state] Stage `dup` with status `draft`, callbacks skipped; reset `misc.bid_company_ids` [], `misc.savings_configuration` nil, `misc.precomputed_bids_data` {}, `event_score_for_participants` {}; team_identifier kept — app/services/versions/trade_request.rb:18-28
2. [side-effect] All audience rows and all stage access lists copied as they are (any status) — versions/trade_request.rb:31, 40
3. [time] Every non-void schedule is copied (incl. in_active, extension and evaluation rows) with start = now and end = now + `meta_data.configured_duration` if positive, else (old end − old start); status copied — versions/trade_request.rb:111-130, trade_request.rb:111
4. [side-effect] Commercial stage: trade products of ACTIVE line items only, ordered by line item id — versions/trade_request.rb:51-58
Gaps: all copied schedules (including old dynamic-extension rows) restart at the same "now", so the bidding window of the amendment depends on which row is last, and an evaluation schedule starts with bidding instead of after it (unverified live) — versions/trade_request.rb:112-118.
Cites: app/services/versions/trade_request.rb:13-64, 111-130

### Versions::TradeRequest — forms and evaluators of a versioned RFI/RFP
Rules:
1. [side-effect] Every form of the stage except `in_active` (so `deleted` forms too) is copied with its pages — versions/trade_request.rb:70-84, trade_request.rb:128, form.rb:37
2. [side-effect] A new line-item mapping is made only when the form's line item has a new version; then only ACTIVE evaluator access lists are copied — versions/trade_request.rb:86-107
3. [state] A form whose line item was not copied (deleted/in_active item) is still created, but without a mapping — versions/trade_request.rb:89-92
Gaps: forms of deleted line items become unmapped forms on the amendment; code elsewhere treats an unmapped form as the stage's global (vendor-assessment) form (TradeRequests::Update::Rfp picks the first unmapped form as global), so the amendment can show a stray question form (defect-shaped, unverified live) — versions/trade_request.rb:86-92, trade_requests/update/rfp.rb:33-35. Clone, by contrast, copies only `active` forms (trade_request_replication_base.rb:38).
Cites: app/services/versions/trade_request.rb:70-109

### create_version / POST item_versions — creating the amendment version
Rules:
1. [validation] `item_type` or `item_id` missing, or type not `EventGroup` → 2 "Insufficient parameters" — app/controllers/api/item_versions_controller.rb:3, 9-11
2. [state] Project not found, not `active`, or not the latest version → 888 "Invalid Parameters" — item_versions_controller.rb:13-16
3. [permission] Policy create_version?: update? (workspace + trade create_record) AND trade create_record again → else 455 "You are not authorized to perform this action" — item_versions_controller.rb:18, app/policies/event_group_policy.rb:42-44
4. [state] Once any version exists the source is no longer `latest?`, so every later call (same or other user) gets 888 — versioning/methods.rb:72-74
5. [state] create_version itself reuses an existing draft ItemVersion of the same (item, user) without rebuilding; reachable only from callers that skip the latest? check (e.g. PR amendment) — versioning/methods.rb:8-19, purchase_requests/amendment_service.rb:319
Gaps: any error while replicating is logged and re-raised → untyped 500 (whole transaction rolled back) — versioning/methods.rb:21-30, item_versions_controller.rb:21-23.
Cites: app/controllers/api/item_versions_controller.rb:5-30, app/models/versioning/methods.rb:3-31

### Versions::EventGroupWorker — what publishing an amendment does to the old version
Rules:
1. [side-effect] Trigger: the amendment project goes draft → active; skipped for recurring templates or when there is no previous version; runs async in Sidekiq — app/models/event_group.rb:118, 703-709, app/workers/versions/event_group_worker.rb:5-10
2. [time] Old version: the last RFI/RFP and the last non-lot commercial stage are force-closed with end time = now (`end_time_for: force_close_event`, `force_start: true`, evaluation and review times cleared) — app/services/versions/event_group.rb:91-113
3. [side-effect] PR-level mappings of the old project → `in_active` and recreated for the new one; PR-item mappings of old line items are copied to the matching new line items (via `old_egli_id`) and the old ones deactivated; `pr_line_item_id` re-synced — versions/event_group.rb:116-145, 156-210
4. [side-effect] The PR amendment flow calls update_previous_version_data synchronously — purchase_requests/amendment_service.rb:366
Gaps: other stages of the old version (an earlier RFQ before an auction, lot RFQs) are not force-closed; until the worker runs both versions are live (unverified live) — versions/event_group.rb:96-100.
Cites: app/services/versions/event_group.rb:91-210, app/workers/versions/event_group_worker.rb:1-12

### EventGroups::PrToErfxService — PR items allowed into a draft project (557)
Adds PR items to a draft project (POST /event_groups/:id/pri_to_draft_project, Clara/MCP draft creation).
Rules (validate_purchase_request_items_data; any failure → 557 "Purchase request items are not valid"):
1. [validation] Project has NO line items yet → the whole check is skipped (always valid) — app/controllers/concerns/event_group_controller_helper.rb:50-51
2. [validation] An item with `status: "draft"` and no `pr_line_item_id` → 557 — event_group_controller_helper.rb:73-75
3. [validation] PR item not found or `in_active` → 557 — :55, 80-81
4. [validation] PR item already mapped (active mapping) to a line item of this project → 557 — :60-65, 84-87
5. [calculation] `quantity.value` > open quantity × (1 + company `over_quantity_tolerance_percentage`/100) → 557; with tolerance > 0 open quantity is recomputed from quantities in events + draft-project quantities and `open_pr_quantity_on_partial_order` — :53, 67-70, 79, 83-87, 94-100
Gaps: because of rule 1 the first batch of PR items into an empty draft (the MCP flow creates the project with no line items, mcp/purchase_request_tools/handler.rb:316-333) is never checked for quantity, duplicates or inactive items (defect-shaped).
Cites: app/services/event_groups/pr_to_erfx_service.rb:22-26, app/controllers/concerns/event_group_controller_helper.rb:49-92

### EventGroups::PrToErfxService — building stages from PR items, errors
Rules:
1. [validation] rfx_modes containing both `rfq` and `auction` → 15 with message "rfq and auction cannot both be present in rfx_modes" — pr_to_erfx_service.rb:27-29
2. [state] rfx_modes = the project's existing stage modes; only when it has none, `options[:default_rfx_modes]` — pr_to_erfx_service.rb:14-15
3. [state] create_new (MCP): new stages built in the order of rfx_modes with stage_no = position + 1; the error codes of the stage builders are ignored; no stage built → 15 — pr_to_erfx_service.rb:33-36, 53-92
4. [state] Existing draft project: each DRAFT stage is re-synced with TradeRequests::Update::Rfp / Auction / Rfq (any other mode uses Rfq) — pr_to_erfx_service.rb:100-134
5. [side-effect] Line items added in add-new mode (serials continue), PR quantities recorded, draft saved_count +1 — pr_to_erfx_service.rb:32, 41-42, 136-151
6. [state] PR items used = new ones + those already mapped to the project's draft line items, excluding `in_active` — pr_to_erfx_service.rb:94-98
Gaps: any exception is rescued and returned as 15 with the raw Ruby message, which the controller renders to the user (e.g. "undefined method … for nil") — pr_to_erfx_service.rb:45-48, event_groups_controller.rb:1017-1018.
Cites: app/services/event_groups/pr_to_erfx_service.rb:8-151

### TradeRequests::Base — default times of a quick-flow (auto-built) stage
Stage builders used by PR→eRFX, MCP and add-new-stage (RFP→RFQ).
Rules:
1. [time] Bid start = project `meta_data.scheduled_publish_at` (ISO8601, read as UTC) when it is strictly in the future; missing, past or unparsable → now — app/services/trade_requests/base.rb:219-244, event_group.rb:279-281
2. [config] Bid end = start + company `clara_company_policies.bid_end_time_duration` (seconds), default 2 days — base.rb:61, 73
3. [config] Evaluation end (`extra_closing_time`) = START + company `clara_company_policies.evaluation_time_extension` days, default 4 — base.rb:60, 74
4. [time] New stage added from an RFQ (`referring_trade_request` is an RFQ): bid end = that RFQ's last non-in_active bidding schedule end — base.rb:101-105
5. [state] Existing stage: times are taken from the stage itself — base.rb:87-99
Gaps: evaluation end is computed from the start, not from the bid end, so a company `bid_end_time_duration` longer than `evaluation_time_extension` days gives an evaluation end before the bid end (defect-shaped; unverified whether set_trade_schedules refuses it) — base.rb:73-74.
Cites: app/services/trade_requests/base.rb:57-107, 219-244

### TradeRequests::Base — default configuration of a quick-flow stage
Rules:
1. [config] New stage defaults: `is_tnc_mandatory` false, `is_english_auction_enabled` false, `is_alternate_bidding_allowed` false, `pickup_schedules` false, `dynamic_closing_time_strategy` price_based, `end_price` 0, `is_auction_on_base_price` true, `closing_mode` single, `is_basket_auction` false, `creation_flow_type` quick_flow, order_type from template, closing and RFP evaluation modes from the company defaults — base.rb:62-86
2. [state] Stage is created as `draft` (unless `status` is passed), with `misc.request_layout` = sheet_template — base.rb:24, 109-117
3. [side-effect] When the stage has no widgets, the template widgets get Material code, Line item no, PR number and product variant columns; variant is `write` when company config `show_variant_widget` is on, else `hidden` — base.rb:42-55
4. [config] Savings defaults: strategies {budget: Budget, historical_price: Historical Price}, `savings_comparison_on` line_item_based — base.rb:144-157
5. [side-effect] The builder sets Current.workspace and Current.app (client_admin_dashboard) for the rest of the request — base.rb:16-17
Cites: app/services/trade_requests/base.rb:10-157

### TradeRequests::Base — currency configuration of a multi-currency stage
Built when template config `enable_multi_currency_flow` is on.
Rules:
1. [config] No multi-currency flag, no exchange data or no rates → no currency_configuration — base.rb:246-253
2. [calculation] Per currency with a rate: `rate_in_base` = 1 for the base currency, else the rate value; original precision = default_precision (default 2) + floor(log10(rate)) when rate > 0 (else + 0); adjusted precision = max(0, original); a template `allowed_currencies[code]` value overrides both — base.rb:263-284
3. [state] Currencies not in the company catalogue (or CURRENCIES for the base) are skipped; `currency_mode` = template currency_mode or `multiple_currencies` — base.rb:256-265
4. [side-effect] Any error is sent to Sentry and the stage is built without currency config — base.rb:294-297
Cites: app/services/trade_requests/base.rb:246-297

### TradeRequests::Create::Rfq — price round built from PR items
Rules:
1. [side-effect] One line per draft line item (draft + active when adding a stage to a live project), by serial number: line_item_no/order = serial, quantity, product and variant — app/services/trade_requests/create/rfq.rb:53-58, base.rb:21-22
2. [side-effect] With a PR item: delivery zone = PR item buyer hub, unit = PR item unit, item_no = `prLno`, material_code = product code, pr_number = PR `rfq_no` trimmed, `pr_line_item_id` — rfq.rb:79-95
3. [side-effect] Without a PR item: delivery zone = the company's first active buyer hub, unit = company unit matching the line item unit symbol (nil if none) — rfq.rb:56, 61-76
4. [side-effect] Extra creator columns of the template (not formula, not product/quantity/hub/gst/total) are filled from the PR item; a dropdown value is mapped to its WidgetDataMapping id, missing mapping → {id: nil} and a Sentry message — rfq.rb:97-125, 132-137
5. [calculation] Savings reference per line: each PR reference price; key `historical_price` kept, any other key becomes `budget` — rfq.rb:127, base.rb:159-172
6. [state] Title "RFQ"; price caps (ceil/floor/tick) start empty — rfq.rb:36, 72, 91
7. [side-effect] Added from a referring stage: its audience is copied and the audience is `restricted` — rfq.rb:22-25
Cites: app/services/trade_requests/create/rfq.rb:6-138

### TradeRequests::Create::Rfp and ::Auction — technical round and auction built from PR items
Rules:
1. [side-effect] RFP: one form per line item; questions = each product quality parameter as a REQUIRED multiline answer, plus "Item Text" (if the PR item has itemText), "Attach additional documents if any" and "Remarks" (optional) — app/services/trade_requests/create/rfp.rb:52-75, base.rb:190-212
2. [permission] RFP form evaluator = the PR item's creator, else the planner from the PR's fund center, else none — rfp.rb:57-72
3. [config] RFP: title "Technical Stage", `vendor_assessment_template_id` = the passed template, `template_id` = the company's last default RFI template — rfp.rb:35-42, 77-80
4. [config] Auction: title "Auction", `auction_config` = company auction_config_policy, bid end = start + 2 days and evaluation end = start + 4 days FIXED (company policies ignored), order type from template — app/services/trade_requests/create/auction.rb:23-44
Gaps: RFP form building reads `purchase_request_item.product` without a nil check, so a line item without a PR item crashes (untyped error; PR flows always have one) — base.rb:190-193; Auction reads `template.order_type` without a nil check — auction.rb:26.
Cites: app/services/trade_requests/create/rfp.rb:7-81, app/services/trade_requests/create/auction.rb:1-48

### TradeRequests::Update::Rfq / Auction / Rfp — re-syncing a draft stage after PR items change
Run when PR items are added to a draft project or a PR is amended.
Rules:
1. [state] RFQ: price caps (ceil/floor/tick/floor qty) of existing lines are kept, new lines get empty caps — app/services/trade_requests/update/rfq.rb:53, 71-78
2. [state] Auction: existing line validations are kept as they are (not merged) — update/auction.rb:8-10
3. [state] RFQ extra creator columns come ONLY from the existing trade product; a newly added line gets nil — update/rfq.rb:61-64
4. [state] RFQ material_code comes from the line item's product code (create used the PR item) — update/rfq.rb:58 vs create/rfq.rb:89
5. [permission] RFP: existing forms keep their evaluators; forms for NEW line items get `evaluators: []` — update/rfp.rb:48-64
Gaps: (a) new PR lines added to an existing draft RFQ lose PR-derived creator columns that create fills — update/rfq.rb:61-64 vs create/rfq.rb:97-125; (b) new RFP forms get no evaluator, while a fresh RFP assigns the PR creator — update/rfp.rb:49, 63 vs create/rfp.rb:57-72; (c) a draft line item without a PR item makes `purchase_request_item.buyer_hub_id` raise (PR→eRFX turns it into 15 with the raw message) — update/rfq.rb:43, 50.
Cites: app/services/trade_requests/update/rfq.rb:7-85, update/rfp.rb:7-65, update/auction.rb:1-13

### TradeRequests::TabRangeResync — section ranges after line items are dropped
Recomputes tab/section line ranges of a sheet when some lines are removed (RFQ→auction with service grouping, grouped service versions).
Rules:
1. [calculation] Old 1-based positions are mapped to new positions skipping removed trade products; a section's range = [min, max] of its surviving positions; child ranges remapped the same way — app/services/trade_requests/tab_range_resync.rb:36-68
2. [state] A section with no surviving line is dropped; a tab with no section left is dropped; tab range = [min section start, max section end] — tab_range_resync.rb:21-29, 51-56
3. [calculation] Parent sections (by `section_no` prefix "1." etc.) take the min start / max end of themselves and their children — tab_range_resync.rb:71-90
4. [state] Nothing removed or no tabs → tabs returned unchanged — tab_range_resync.rb:17
Cites: app/services/trade_requests/tab_range_resync.rb:1-92, app/services/rfq_to_auction/create_service.rb:110-128

### RfqToAuction::CreateService — what the auction inherits from the RFQ
POST /api/trade/move_to_auction after its checks (auction-templates.md parts 1-8 cover entry rules and RFQ effects).
Rules:
1. [state] The auction is a `dup` of the RFQ: config, widgets, tabs, misc, buyer hub etc. are inherited, then overwritten by the request — app/services/rfq_to_auction/create_service.rb:14, 32-44
2. [state] Reset: `misc.savings_data` and `misc.savings_configuration` removed; `misc.precomputed_bids_data` nil and `event_score_for_participants` {} after save; `participant_statuses` {} — create_service.rb:219-224, 234, 237-244
3. [config] Template config `widget_names_for_rfq_to_auction.inline` renames columns by key attribute — create_service.rb:280-293
4. [state] Service-RFP grouping on and some RFQ lines `in_active`: auction lines renumbered 1..n and tab ranges resynced — create_service.rb:110-128
5. [state] Buyer hub from `delivery_zone_id` (or `pickup_zone_id`) only if it is an active hub — create_service.rb:188-196
6. [side-effect] Weighted RFQ + `transfer_weights`: active weights copied (line-item based: per new line via old_trade_product_id; else stage level) — create_service.rb:76-79, 263-278
7. [config] `misc.allow_tna_vendors_to_bid` stored as sent (default false) — create_service.rb:18, 57-58, 130-132
Cites: app/services/rfq_to_auction/create_service.rb:11-293

### RfqToAuction::CreateService — failure handling of the conversion
Rules:
1. [state] All steps (closing the RFQ, creating the auction, copying bids, lot_config, reminders) run in ONE transaction; any error rolls the RFQ close back — create_service.rb:22-98
2. [validation] A step returning a code, or a model save error message, → returned as {code} / {message} to the controller — create_service.rb:60-63, 99-102, 143-164, 185
3. [state] Any other exception is re-raised → untyped 500 — create_service.rb:103
4. [state] Knockout/dutch round 1 is created only when the REQUEST status is `active` (even if the auction is routed to draft) — create_service.rb:198-210
Gaps: weight transfer uses `insert_all` with `item_id` looked up from new lines; a weight on an RFQ line not carried to the auction gets item_id nil (unverified whether the column allows null → possible 500) — create_service.rb:266-277.
Cites: app/services/rfq_to_auction/create_service.rb:22-105, 198-278

### Copying bids into a new stage — create_duplicate_bids (RFQ→auction and RFQ→lots)
Shared by both conversions.
Rules:
1. [state] Only bid lines whose trade product exists in the new stage are copied; a bid with no such line is skipped entirely — app/controllers/concerns/bids_controller_helper.rb:1747-1757, 1779
2. [state] Lines of TNA items are filtered for the vendor (should_filter_tna_bid_product?) — bids_controller_helper.rb:1759-1762
3. [state] Copied bid: status = the given status (active), `approval_status` nil, revision ancestry cleared, `closed_at` = new stage closed_at, context "rfq_final_bid"; meta keys `change_timeline`, `in_evaluation_time`, `is_surrogate_bid`, `is_counter_offer_modified_bid` removed — bids_controller_helper.rb:1768-1792
4. [calculation] rfq_then_auction with fast bidding: each line stores `other_details.rfq_price` = RFQ price — bids_controller_helper.rb:1764-1767
5. [validation] Bid or BidTrade save failure → returns the model error text (message-only error) — bids_controller_helper.rb:1795-1797
Gaps: bid lines are saved with `save` (no check), so a failed line save is silent and the bid keeps a nil id in `bid_product_ids` (unverified) — bids_controller_helper.rb:1775-1776.
Cites: app/controllers/concerns/bids_controller_helper.rb:1745-1800

### CreateEventLots::CreateService — lot config writes and crash cases
POST /trade/create_new_lot after its checks (trade-stages.md covers effects).
Rules:
1. [state] Lots are marked `in_progress` in `lot_config` in the constructor, BEFORE and outside the transaction; on any failure they are set back to `draft` — app/services/create_event_lots/create_service.rb:33, 69-70, 83-94
2. [side-effect] lot_config is written with raw SQL `jsonb_set(lot_config, '{<lot_no>}', '<json>'::jsonb)` where lot_no and the lot JSON (incl. `lot_title`) are interpolated into the SQL string — create_service.rb:96-101
3. [state] The parent's best-offer keys `allowed_participants_to_edit_in_bid_review_time` and `best_offer_submitted_participants` are removed from its config — create_service.rb:18
4. [time] Lot evaluation end: company `event_duration_predefined_values.rfq.default_evaluation` seconds from NOW if set; else the latest sibling lot RFQ's evaluation end if still in the future; else the parent's — create_service.rb:229-240
Gaps: a `lot_title` (or lot key) containing an apostrophe breaks the SQL → ActiveRecord::StatementInvalid → untyped 500, and the constructor call is outside the rescue (defect-shaped) — create_service.rb:33, 96-101; when `lot_config` is NULL, `jsonb_set(NULL, …)` stays NULL (unverified reachable) — create_service.rb:97-98.
Cites: app/services/create_event_lots/create_service.rb:10-101, 229-240

### CreateEventLots — message-only failures reported as success
Rules:
1. [state] Errors raised as CustomException with only a `message` (a lot stage save error, or a bid copy error) are returned as {message: …} without a code — create_service.rb:48-51, 69-73, 161-162
2. [state] The controller renders an error only when `error[:code]` is present, otherwise it renders success — app/controllers/api/trade_controller.rb:1831-1834
3. [calculation] Prorating for each lot: amount-type global charges (input `number` or `percent_and_amount` with `input_group` amount) × (vendor's total of lines in the lot ÷ vendor's total of all lines) — create_service.rb:176-193
Gaps: (a) a split that failed and was rolled back returns HTTP 200 success while no lot was created and lots fall back to draft (defect-shaped) — create_service.rb:69-73, trade_controller.rb:1832-1834; (b) a vendor whose old line totals are all 0 gives 0/0 = NaN, written into the bid's charges as "NaN" (unverified) — create_service.rb:181-189.
Cites: app/services/create_event_lots/create_service.rb:37-79, 156-193, app/controllers/api/trade_controller.rb:1819-1835

### Bids::LineItemRegretService — lot "regret all" guard is project-wide
Controller-level checks are in bids.md (update_regret_status).
Rules:
1. [validation] Lot-split stage: 844 "You cannot regret all line items in a lot split event" when (ALL active line items of the PROJECT) minus (items already regretted by this vendor + items pending in `regretted_eglis` + this item) is empty — app/services/bids/line_item_regret_service.rb:115-127
2. [state] The guard runs only when the stage belongs to a lot — line_item_regret_service.rb:117
3. [state] undo_regret for an item that was never regretted succeeds silently — line_item_regret_service.rb:73-92
4. [state] undo of a PROCESSED regret removes the vendor's `participants_data` entry and sets the vendor back to `participated` — line_item_regret_service.rb:77-87
Gaps: the guard counts the whole project, not the lot, so a vendor CAN regret every line of one lot while another lot still has lines (defect-shaped vs the message) — line_item_regret_service.rb:119-125.
Cites: app/services/bids/line_item_regret_service.rb:40-128

### Technical regret through a submitted response — deactivate_regret_eglis
When a vendor's technical response is submitted (TemplateResponses::UpdateService status active), its answers set line-item participation.
Rules:
1. [state] A line item is "regretted" for the vendor when any value in the last page response of its form is exactly "Regret" (case-sensitive); otherwise it is set to "participated" — app/helpers/api/forms_helper.rb:704-716
2. [side-effect] Newly regretted items: the vendor's commercial bid lines for them are removed (remove_commercial_bid_for_regretted_items) — forms_helper.rb:712-714, 726
3. [side-effect] Service-RFP grouping: sibling activity line items of the same service get the same status — forms_helper.rb:718-721, 729-745
4. [side-effect] Commercial stages (auction/RFQ/rfq_then_auction not withdrawn/in_active) are touched to refresh caches — forms_helper.rb:724-725
Gaps: the same `participants` map holds commercial regrets (LineItemRegretService), so submitting a technical response without "Regret" overwrites a commercial "regretted" back to "participated" (defect-shaped, unverified live) — forms_helper.rb:711, 715.
Cites: app/helpers/api/forms_helper.rb:688-745, app/services/template_responses/update_service.rb:46-51

### PocBidActionService — accept or reject an unregistered vendor's bid/response
Controller checks in bids.md (update_poc_bid); also used for technical responses (template_responses_controller.rb:220).
Rules:
1. [validation] status not approved/rejected, or record not marked `is_unregistered_bid` → 2; POC user not active → 70 "User does not exist" — app/services/poc_bid_action_service.rb:14-19
2. [state] Approve of an already accepted record does nothing and returns success — poc_bid_action_service.rb:51-52
3. [side-effect] Approve: POC email_verified = done, ALL the POC user's `unregistered_poc` mappings become `manual`, record marked accepted, pending count −1 — poc_bid_action_service.rb:55-66, app/workers/email_bid_unregistered_helper.rb:106-115
4. [side-effect] Reject: record `rejected` (bid lines and BidTrade too), pending count −1; POC user + unregistered mapping deactivated when it has no active bid/response in OTHER active projects of the buyer — poc_bid_action_service.rb:79-98, 111-130
5. [calculation] Pending count floor 0: GREATEST(0, n−1) — email_bid_unregistered_helper.rb:99-104
6. [side-effect] Push `notify_on_unregistered_bid` after the action — poc_bid_action_service.rb:69-76, 101-108
Gaps: reject has no state guard: an accepted or already rejected record can be rejected again (count decremented again, POC deactivated) — poc_bid_action_service.rb:79-98.
Cites: app/services/poc_bid_action_service.rb:14-139

### PocBidSiblingActionService — the vendor POC's other bids in the same project
Runs after PocBidActionService (and from UnregisteredBidSelfRegistrationWorker with decrement).
Rules:
1. [side-effect] Accept: the POC's other ACTIVE and REVISED bids (any stage of this project) and responses (active stages) are marked accepted — app/services/poc_bid_sibling_action_service.rb:24-86, 123-138
2. [side-effect] Reject: those siblings become `rejected` (bids + BidTrade) and bids are re-precomputed — poc_bid_sibling_action_service.rb:32-38, 88-117
3. [side-effect] Reject then restores, per active stage, the vendor company's latest REVISED bid placed by a registered user (same alternative) to `active` with its lines, and the latest revised registered response per stage — poc_bid_sibling_action_service.rb:171-205
4. [state] Self-registration path (no primary record): counts the pending number down once, marks `unregistered_poc_self_registered`, actor = the POC — poc_bid_sibling_action_service.rb:28, 51, 75, 119-121, app/workers/unregistered_bid_self_registration_worker.rb:14
Gaps: (a) sibling reject/restore runs outside the primary transaction, a failure leaves the primary rejected and siblings untouched — poc_bid_action_service.rb:81-100; (b) the restore does not check for an existing active bid of the company, so two active bids can result (unverified live) — poc_bid_sibling_action_service.rb:177-190.
Cites: app/services/poc_bid_sibling_action_service.rb:15-205

### TemplateResponses::CreateService — starting or reusing a draft response
Used for vendor technical responses, surrogate responses, PO/contract forms of proposals.
Rules:
1. [state] A draft is reused when one exists for the same user, company, status draft and item_id; only its `data` is replaced (template, widgets, remarks, other_details of the new call ignored) — app/services/template_responses/create_service.rb:52, 71-73
2. [side-effect] A new draft is linked to the form answers of the company's latest ACTIVE response on the same item (answers carried into the revision) — create_service.rb:69, 87-94
3. [side-effect] Default page responses are created for the listed forms, or for every form with `autogenerate_response` — create_service.rb:74-80
4. [side-effect] Surrogate reference with remarks or attachments → remark `surrogate_remarks` on the response (again on every call) — create_service.rb:81, 96-110
Gaps: (a) the draft lookup has no `item_type`, so a draft on a TradeRequest and one on a Proposal with the same id, user and company are the same row (defect-shaped, unverified live) — create_service.rb:52; (b) when the surrogate remark fails the service calls `render_error_json`, which does not exist in a service → NoMethodError → untyped 500 — create_service.rb:102-107.
Cites: app/services/template_responses/create_service.rb:51-110

### TemplateResponses::UpdateService — submitting a response (718, remarks, masking)
Rules:
1. [validation] Status `active` on a TradeRequest with config `is_rfip_all_line_items_required`: a line-item form (form mapped to a line item) without a draft/active answer → 718 "Please, submit response for all line items" — app/services/template_responses/update_service.rb:46-48, 93-107
2. [validation] With service-RFP grouping, one answered form per service group is enough (group = parent service PR item, else the form itself) — update_service.rb:103-104, 110-119
3. [side-effect] On activation: draft form answers become active (older active answers for the same forms unmapped), technical regret applied (see above) — update_service.rb:49-50, forms_helper.rb:688-698
4. [state] `remarks` is always set from `options[:remarks]`, so a call without remarks clears saved remarks — update_service.rb:56
5. [state] `data` and `other_details` are MERGED into existing values; `data` nils dropped; `category_ids`/`buyer_hub_id` added when sent — update_service.rb:33-36, 52-54, 58-59
6. [visibility] Vendor masking: masked company name = "Vendor <distinct active responding companies + 1>" — update_service.rb:86-91
7. [state] `make_draft_from_active`: the response and its answers go back to draft for the user — update_service.rb:45, forms_helper.rb:290-297
Cites: app/services/template_responses/update_service.rb:44-119

### TemplateResponses::ValidateService — required answers (572, 773, 2)
Run before submitting a response (revise helper, vendor update, buyer edit).
Rules:
1. [validation] `company_id` missing → 2 — app/services/template_responses/validate_service.rb:11-14
2. [validation] No form answers and no remarks → 2 — validate_service.rb:51-53
3. [validation] Required field (configuration `is_required`) whose field_type is in `validate_field_types` (default participant + creator) and empty → 572 with message "Please fill '<field name>'" — validate_service.rb:153-163
4. [validation] Non-required field with `validations`, a value marked `validated: false` and no `allow_failed_validation_submit` → 773 with message "Validation for <name> failed!" — validate_service.rb:164-167
5. [state] Hidden fields (`mode_type` hidden) are never checked — validate_service.rb:155
6. [validation] Question group: checked when required or any member is filled, then every member is checked (per row for multi-response) — validate_service.rb:96-147
7. [config] On a TradeRequest, conditional blocks can change a field's configuration (e.g. make it required) first — validate_service.rb:80-94
Gaps: the 773 branch is an `elsif` of the required-field branch, so a REQUIRED field that has a value with `validated: false` passes (failed validation only blocks optional fields) (defect-shaped) — validate_service.rb:158-168.
Cites: app/services/template_responses/validate_service.rb:10-170

### TemplateResponses::ValidateService — direct TradeRequest payload check
When the item passed is a TradeRequest (payload `data` = forms with page_responses).
Rules:
1. [validation] `data` missing → 2 "Insufficient parameters" — validate_service.rb:26-31
2. [validation] Any answer whose RFI widget config `is_required` is true and value blank → 2 (not 572) — validate_service.rb:32-41
Gaps: a key attribute unknown to the form gives a nil widget config and `nil["is_required"]` raises → untyped 500 (unverified) — validate_service.rb:35-36.
Cites: app/services/template_responses/validate_service.rb:16-45

### Counter-offer pending tasks — PendingTasks::AdditionalRequests::RaiseCounterOffer
When a buyer sends a counter offer on a bid, vendor users get a "Raise Counter Offer" task.
Rules:
1. [side-effect] Created from the counter-offer push for the bid's users to be notified, only for change_type `counter_offer_for_bid`, at most one set per bid grouping while a pending/missed task exists — lib/modules/push_notification.rb:3197, 3207-3212, raise_counter_offer.rb:10-17
2. [time] Task due (`ends_at`) = stage evaluation end (`extra_closing_time`), else bid end — raise_counter_offer.rb:21-22
3. [visibility] Description "<project ref> / Lot <n> - <stage ref>" (project part omitted for dummy projects), deeplink events/<stage uuid> — raise_counter_offer.rb:24-31, 41-43
4. [side-effect] Tasks → `completed` when the request's resolution leaves `requested`; → `in_active` on revoke — app/models/additional_request.rb:577-584, raise_counter_offer.rb:61-75
5. [time] When the evaluation schedule is shifted and there is NO participant review schedule, due dates of pending/missed tasks move to the new `extra_closing_time` — app/models/trade_schedule.rb:195-203, raise_counter_offer.rb:77-83
Gaps: with a participant review schedule the due date is not moved (trade_schedule.rb:196-199); a deleted bid makes `Bid.find` raise — raise_counter_offer.rb:18-19.
Cites: app/services/pending_tasks/additional_requests/raise_counter_offer.rb:1-86

### AiAuditor::CounterOfferAuditor — AI counter-offer audit snapshot
Rules:
1. [side-effect] Saves AiDeltaSnapshots with AI-suggested vs final values (uuid keys decoded to ids), `reference_type` ai_counter_offer, context {vendor_id, trade_request_id}, company = current workspace — app/services/ai_auditor/counter_offer_auditor.rb:10-16, 24-35
2. [validation] Any exception → error 15 with message "Error in saving audit deltas: <error>" — counter_offer_auditor.rb:17-19
Gaps: uses `create` (not create!), so a failed save still answers "Audit deltas saved successfully" — counter_offer_auditor.rb:15-16.
Cites: app/services/ai_auditor/counter_offer_auditor.rb:1-37, app/controllers/concerns/ask_ai_chats_controller_helper.rb:1773

### TradeRounds::CreateService and Proposals::CreateDraftService — small builders
Rules:
1. [side-effect] Knockout/dutch round: stage id, `auction_strategy` = stage auction_config, status (default active), round_no, version, starts_at/ends_at, bulk_price, participant lists — app/services/trade_rounds/create_service.rb:22-33
2. [state] Draft award proposal: item = project, company, creator, status draft; meta_data project_ref_id, lot_no, is_awarding_with_excel — app/services/proposals/create_draft_service.rb:15-26
3. [config] When the company has an allocation summary template, `show_allocation_summary_v1` = true on the proposal — create_draft_service.rb:27-29
Gaps: the round is saved with `save` and returned even when invalid, so callers get an unsaved round with no error — trade_rounds/create_service.rb:34-35.
Cites: app/services/trade_rounds/create_service.rb:1-38, app/services/proposals/create_draft_service.rb:1-35

### EventGroups::TransferOwnershipService — internals and edge cases
Controller checks and the main effects are in event-groups.md (change_ownership).
Rules:
1. [state] "Current owner" = `event_group.user`, i.e. the creator unless `restrict_event_visibility_to_owner` is on — transfer_ownership_service.rb:6, event_group.rb:1227-1235
2. [side-effect] Only ONE draft proposal of the current owner is moved (`find_by`), copied with `dup`; the old one goes `in_active` — transfer_ownership_service.rb:42-49
3. [side-effect] `requested` proposals of the current owner and their responses by that owner are re-assigned — transfer_ownership_service.rb:51-61
4. [side-effect] Only chats where the current owner has an ACTIVE assignment are re-assigned; chats where the owner is only a participant are left — transfer_ownership_service.rb:63-81
5. [side-effect] Email/push via EventOwnershipTransferWorker after the transaction — transfer_ownership_service.rb:18
Gaps: (a) without the setting, a second transfer again treats the creator as current owner, so the first new owner's draft proposal and chats are not moved (unverified live) — transfer_ownership_service.rb:6, 43, 68; (b) the copied draft proposal does not take the old draft's template responses (PO/contract forms stay on the in_active proposal) (unverified effect) — transfer_ownership_service.rb:45-48.
Cites: app/services/event_groups/transfer_ownership_service.rb:1-132

### EventGroups::ParticipateService — open-tender self-registration internals
Controller checks in event-groups.md (participate).
Rules:
1. [time] Every open-tender stage must be upcoming or running: bid end >= now, or in the participant response-review time, and not closed → else 33 "Order not active" — participate_service.rb:27-29, trade_request.rb:1197-1200
2. [state] The vendor company is the FIRST buyer-vendor mapping (allowed statuses) among the user's companies — participate_service.rb:30-34
3. [side-effect] In one transaction: user intent `trade_accept`, then an audience row (self_registered, active, visible, forwarded_by user) on every open-tender stage — participate_service.rb:35-47
Gaps: a project with NO open-tender stage passes rule 1 (`all?` on an empty list) and only records the intent — participate_service.rb:27, 37.
Cites: app/services/event_groups/participate_service.rb:25-48

### EventGroups::ServiceLineItemDeletion and ServiceActivityLineItemMapper — service/activity grouping
For companies with service-RFP form grouping (one service PR item with activity children).
Rules:
1. [state] Applies only when the project has `service_rfp_form_grouping_enabled?` and a deleted line item maps to an activity PR item with a parent service — service_line_item_deletion.rb:10-12, 29-40
2. [side-effect] Deleting one activity deletes every ACTIVE/DRAFT line item mapped (active PR mapping) to any activity of the same service; their forms → `deleted` — service_line_item_deletion.rb:14-24, 43-72
3. [state] If no sibling is found, only the requested ids are deleted — service_line_item_deletion.rb:18
4. [side-effect] Form building: a form sent for one activity is expanded into one form per activity of that service — service_activity_line_item_mapper.rb:45-64, forms_helper.rb:13
5. [state] Only the first activity form per service is kept when listing forms — service_activity_line_item_mapper.rb:66-78, trade_form_helper.rb:255
6. [state] Duplicate PR mappings of a line item: the oldest one not already owned by another line item is kept, the rest retired — service_activity_line_item_mapper.rb:21-34
Cites: app/services/event_groups/service_line_item_deletion.rb:1-74, app/services/event_groups/service_activity_line_item_mapper.rb:1-100

### EventGroups::SearchQuery — project list filters and sorting
Used by event_groups list/search actions and trade lists.
Rules:
1. [validation] `title` filter = case-insensitive substring on title OR stored ref_id (ILIKE %q%) — app/services/event_groups/search_query.rb:5, 13, event_group.rb:90-92
2. [time] `created_at` filter {from, to} (epoch seconds) inclusive on both ends; `latest_created_at` = strictly before that epoch — search_query.rb:6-7, event_group.rb:93-94
3. [validation] Sort: `sort_by` must be one of id, created_at, updated_at, latest_stage_time, else id; `sort_direction` asc/desc, else desc; no sort params → id desc — search_query.rb:32-42, event_group.rb:96-107, 216-218
4. [state] Most callers use `perform_sorting`, which applies sorting only (filters ignored) — search_query.rb:26-28, event_groups_controller.rb:300, 751
Gaps: `%` and `_` in the search text are not escaped (act as wildcards); search runs on the stored ref_id ("RFX-12"), so the shown amendment ref "RFX-12.1" finds nothing (unverified live) — event_group.rb:90-92, versioning/methods.rb:86-95.
Cites: app/services/event_groups/search_query.rb:1-44, app/models/event_group.rb:90-108
