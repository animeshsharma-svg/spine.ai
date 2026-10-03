# Event groups (the project container) — backend digest (procol-backend origin/main ae36e86894)

## Overview
An "event group" (EventGroup, shown as the project / RFX-n) is the container holding the line items (EventGroupLineItem) and the stages (TradeRequest: RFI, technical round RFP, price round RFQ, auction). This area covers creating a draft project, editing, publishing, publishing a new stage on a live project, deleting line items, withdrawing the whole project, cloning, ownership transfer, open-tender participation, rejecting a participant, lots and PR linking. Code: app/controllers/api/event_groups_controller.rb, app/controllers/concerns/event_group_controller_helper.rb, app/services/event_groups/*.rb, app/models/event_group.rb, plus shared helpers in trade_controller_helper.rb. Routes are unversioned `/event_groups/...` (config/routes.rb:678-710). The buyer web console calls almost everything; the vendor website only show, get_line_items, get_all_attachments, index, history, update_eg_cards, participate, all, options, get_audience_filters (config/app_auth_config.yml:1047-1079 console, 1995-2007 vendor). Extending a stage, adding vendors to a live stage and withdrawing one stage are trade-controller actions, not covered here.

### Event groups — app access and generic refusals
Which app may call which event_groups action, and refusals every action shares.
Checks, in order:
1. Action not listed for the calling app → "This app is not authorized to use this API" (HTTP 401) and the session is signed out — api_auth.rb:78-96, json_helpers.rb:31-35. Vendor app is refused for create, update, create_clone, reject_participant, change_ownership, lots, pr_linking, refresh_lpo_data; console is refused for participate and all — app_auth_config.yml:1047-1079, 1995-2007. regenerate_master_qcs is only in the Procol admin list — app_auth_config.yml:1764.
2. Any Pundit policy refusal (`authorize`) → 455 "You are not authorized to perform this action" (HTTP 422) — api_auth.rb:16, 117-118.
State rules: ids are sent as UUIDs and decoded to ids before the action — params_auth.rb:9, 57-59.
Cites: app/controllers/concerns/api_auth.rb:78-105, app/policies/event_group_policy.rb:1-98

### EventGroup model — project statuses and "latest version"
What the project statuses mean.
State rules: status enum `in_active`(0), `active`(1, live/published), `draft`(2), `withdrawn`(3) — event_group.rb:85. Dashboard and history lists show only `active` and `withdrawn` (VALID_STATUSES_FOR_DASHBOARD) — event_group.rb:147. A project is "not latest" when a newer amendment version of it exists (`latest?` = no ItemVersion created from it) — versioning/methods.rb:72-74; most edit actions refuse a non-latest project with 101 "You are not allowed to perform this action". An amendment draft is a draft project that is the new version of another — versioning/methods.rb:97-100. ref_id is "RFX-<count of latest projects of the company>" — event_group.rb:429-433. Only user_id and company_id are validated — event_group.rb:57-58.
Cites: app/models/event_group.rb:85, 147, app/models/versioning/methods.rb:72-112

### EventGroup model — callbacks when the project goes live or is withdrawn
What fires automatically on a project status change.
Side effects (after commit): status → active: RFI invitation mails if the first stage is RFI/RFP, planner notification, ErfxProjectInviteWorker invitations (all skipped for recurring templates; the last two also for dummy events) — event_group.rb:112-114, 489-503, 743-750. Status → active or withdrawn: PR in-progress quantities recomputed — :117, 988-999. Draft → active on an amendment: Versions::EventGroupWorker updates the previous version — :118, 703-709. Status → withdrawn: emails `event_group_withdraw_vendor` and `event_group_withdraw_buyer` — :116, 983-986. Any save: MCP cache invalidated — :119.
Cites: app/models/event_group.rb:110-119

### EventGroup model — who can see a project (draft visibility, owner)
Rules behind 455 / 682 "not allowed to view" on project screens.
Checks, in order:
1. A DRAFT project is visible only to its owner (`user_id`), super admins and Procol employees; anyone else sees no stages, so show/get_audience refuse — event_group.rb:511-514.
2. Otherwise a stage is visible if `stage.is_allowed_to_view?(user)` — event_group.rb:515-524.
State rules: the "owner" (`event_group.user` / `user_id`) is the creator UNLESS company setting `restrict_event_visibility_to_owner` is on; then it is the active `owner` access-list user set by change_ownership — event_group.rb:1227-1235. Without that setting an ownership transfer does not change who counts as owner for draft visibility, withdraw permission or the next transfer.
Cites: app/models/event_group.rb:511-526, 1227-1240

### event_groups#create — POST /event_groups — create a draft project: checks
Creates the project shell and its line items; console, normally with `status: "draft"`.
Checks, in order:
1. `status` missing → 2 "Insufficient parameters" (HTTP 422) — event_groups_controller.rb:25-27
2. `config.boq_based_rfx` true and workspace not `boq_in_erfx_allowed?` → 101 "You are not allowed to perform this action" (HTTP 422) — :28-30
3. Not BOQ and `line_items` empty → 2 (HTTP 422) — :31-32 (BOQ may have none — :37-41)
4. Policy create?: no trade `create_record` permission → 455 (HTTP 422) — :34, event_group_policy.rb:21-23
5. A `pr_line_item_id` belongs to a dormant-locked PR (company dormant feature on) → 1125 "PR(s) <numbers> are dormant and locked from sourcing events" (HTTP 422) with `dormant_pr_ids` — create_service.rb:103-124, controller :54-56, 1135-1141
6. Model invalid → 15 with the first validation message (HTTP 422) — :58
Cites: app/controllers/api/event_groups_controller.rb:24-68

### event_groups#create — POST /event_groups — line items and crash cases (part 2)
How each line item is built at create, and inputs that crash instead of being refused.
Checks, in order:
1. `product_id` not an active product → nil product → untyped 500 (defect-shaped) — trade_controller_helper.rb:6291-6300
2. Product with no active variant → nil `.id` → untyped 500 (defect-shaped) — :6301-6302, 6326
3. `status` outside draft/active/in_active/withdrawn → enum ArgumentError → untyped 500 (defect-shaped, unverified live) — create_service.rb:36
State rules: quantity 0 or missing is NOT refused; the item becomes rate-only (`is_rate_only`) — trade_controller_helper.rb:6317-6320. Unknown `product_quality_id` falls back to the product's last active variant — :6302. Items get the project's status and serial numbers 1..n — create_service.rb:52-60. PR details (activity/service) go to `meta_data.pr_item_details` — :69-90.
Cites: app/services/event_groups/create_service.rb:31-66

### event_groups#update — PATCH /event_groups/:id — edit/publish/withdraw: entry checks (part 1)
One endpoint does save-draft, publish, publish-new-stage, line-item edit/delete and withdraw; console only.
Checks, in order:
1. Project not found → 533 "Project does not exist." (HTTP 422) — event_group_controller_helper.rb:2579-2581, controller :71-72
2. `purchase_request_id` given but not an active BOQ PR of the workspace → 101 (HTTP 422) — helper :2584-2587
3. Policy update?: project outside the user's companies or no trade `create_record` → 455 (HTTP 422); a Procol CSM of the company always passes — event_group_policy.rb:37-40
4. Edit lock held by another update (8 s) → 516 "Transaction in Progress" (HTTP 422), but the request is not stopped (see lock section) — controller :74, 1513-1520
Cites: app/controllers/api/event_groups_controller.rb:70-79

### event_groups#update — PATCH /event_groups/:id — entry checks and routing (part 2)
Remaining update checks and how the request is routed to a sub-flow.
Checks, in order:
5. Any attachment URL not in the company's own storage → 101 "You are not allowed to perform this action" (HTTP 422) — event_groups_controller.rb:77-78
6. Project is not the latest amendment version → 101 (HTTP 422) — :79
7. Error from the sub-flow (publish / draft / withdraw / line items) → that code — :80-81
8. Model invalid after save → 15 "Operation failed" (HTTP 422) — :91
State rules: routing — a draft project with `status: active`, or `status: active` with `draft_trade_request_ids` → publish; `status` withdrawn/draft, or any `line_items`, or a non-empty `config` → plain update (execute) — event_group_controller_helper.rb:28-36. When a sub-flow returns an error the DB transaction is rolled back (Rails 7.0.8 rolls back on return inside a transaction block) — :28-37.
Cites: app/controllers/concerns/event_group_controller_helper.rb:15-47

### event_groups#update — PATCH /event_groups/:id — edit lock 516 does not stop the request
How the concurrent-edit lock behaves on project update.
Checks, in order:
1. Cache key `eg_<id>_lock_key` present → `render_error_json(516)` "Transaction in Progress" (HTTP 422) — event_groups_controller.rb:1513-1518
State rules: `lock_transaction` is a plain method call inside `update` (:74), so its `return` only leaves the helper; the update keeps running, writes data, then renders a second time → DoubleRenderError. So a second concurrent update is APPLIED and the caller gets an untyped 500 instead of a clean 516 (defect-shaped; unverified live). The lock lives 8 s and is deleted by the after_action — :20, 1519, 1522-1526. While it is held, adding a stage to this project is refused with 516 — trade_controller_helper.rb:3653-3654.
Cites: app/controllers/api/event_groups_controller.rb:20, 74, 1513-1526

### event_groups#update — PATCH /event_groups/:id — what a plain edit saves (title-only is a no-op)
What happens for edits that are not publish or withdraw.
State rules: a request with no status change, no `line_items` and an empty `config` (e.g. only `title` or `description`) saves NOTHING; neither publish nor execute runs and the old data is returned with HTTP 200 — event_group_controller_helper.rb:28-36. In a plain update: title, description (`description_markdown`), attachments (array only) and config are merged; config keys `is_scheduled_template`, `schedule`, `ends_at`, `max_occurrences` are not stored — update_service.rb:47-54; `terms_and_conditions` replaced if sent — :80-82. Existing line items are updated by id; items without id are created with the project's current status (they are not added to stages here) — :95-153.
Cites: app/services/event_groups/update_service.rb:46-93

### event_groups#update — PATCH /event_groups/:id status=active — publish a draft project: checks (part 1)
Publishing the draft project (the "Publish" button) with `status: "active"`; console.
Checks, in order:
1. Entry checks of update (533, 455, 516, 101 attachments, 101 not latest) — event_groups_controller.rb:71-79
2. `show_under_open_events` (if sent) is saved first — update_service.rb:231, 295-301
3. Technical round (RFP) bid end time after price round (RFQ) bid end time → 712 "RFP duration exceeds RFQ end time. Please adjust." (HTTP 422) — :232-233, 303-314 (skips: see 712 section)
4. Amendment draft (new version of a live project) with no `amendment_remarks` → StandardError "Remarks for amendment not found" → untyped 500 (defect-shaped) — :234, versioning/methods.rb:102-103
State rules: only for a project currently `draft` — update_service.rb:228.
Cites: app/services/event_groups/update_service.rb:226-240

### event_groups#update publish — stage errors and ignored fields (part 2)
Errors raised while each stage of a draft project is published, and what the publish request ignores.
Checks, in order:
5. Each stage is published in turn; the first error aborts and rolls back — update_service.rb:239-240, 525-539: `audience_except_company_ids` with no products → 2 "Insufficient parameters"; more than 500 new vendors → 511 (HTTP 422) — trade_controller_helper.rb:697-699, 728-730; bidding schedule save fails → 15 "Operation failed" — :4544, 4549; knockout/dutch auction multi-product without fast bidding (rfx project companies) → 101 — :4552-4556; start/end price errors — :4558-4559
State rules: on the publish path the request's `description` and `line_items` are ignored; only title, attachments, config and terms are applied — update_service.rb:241-252. The project is saved with `save`, so a failed save is silent — :253.
Cites: app/services/event_groups/update_service.rb:239-258, app/controllers/concerns/trade_controller_helper.rb:4524-4593

### event_groups#update publish — 712 "RFP duration exceeds RFQ end time" rule (part 3)
When publishing a draft project that has both a technical round (RFP) and a price round (RFQ).
Checks, in order:
1. Among stages in `draft_trade_request_ids`, take the RFP and the RFQ; compare the END time of each one's last bidding schedule; RFP end strictly later than RFQ end → 712 "RFP duration exceeds RFQ end time. Please adjust." (HTTP 422) — update_service.rb:303-314
State rules / skips: skipped when `draft_trade_request_ids` is not sent (query becomes `id IS NULL`, no stages) — :304; skipped if either stage or its bidding schedule is missing — :307, 310; equal end times pass (strict `>`); RFI and auction stages are not compared; not checked when publishing a new stage on a live project — :259-274. Uses stored times, before past start times are shifted to now.
Cites: app/services/event_groups/update_service.rb:232-233, 303-314

### event_groups#update publish — what happens to each stage (part 4)
Per-stage effects when a draft project is published.
State rules: stages not in `draft_trade_request_ids` (when sent) → `void`, forms deactivated — update_service.rb:528-530. Each published stage: audience applied, blacklisted vendors removed — trade_controller_helper.rb:693-735; stage number recomputed — update_service.rb:376-380; status `requested` if a create-trade approval is needed (not RFI/RFP), `draft` if auctions are routed to the auction team and the publisher is not in it, else `active` — trade_controller_helper.rb:4524-4540; a bidding start time already in the past moves to NOW and the end time keeps the same duration (extra closing time too) — :4541-4551, trade_schedule.rb:138-148; knockout/dutch auctions get trade rounds — :4552-4574.
Side effects: approval raised (v1) or started (v2); stage closed_at extended by approval expiry — :4579-4590.
Cites: app/controllers/concerns/trade_controller_helper.rb:4524-4593

### event_groups#update publish — project-level effects of publishing (part 5)
What changes on the project when publish succeeds.
Side effects: project → `active` with title/attachments/config/terms applied — update_service.rb:241-253; draft line items → `active` — :254; PR quantities moved out of draft — :255; recurring template handled if scheduled events are on — :256-257; last-PO (LPO) reference prices copied from linked PR items — :258, 279-293. Amendment publish: amendment remarks saved, `event_revise_notification` email + push — :234-235, event_group_controller_helper.rb:2632-2638. BOQ project with `purchase_request_id` gets a PR mapping and in-progress quantity update — :2640-2653. Model callbacks send invitations and planner notification — event_group.rb:112-118.
Cites: app/services/event_groups/update_service.rb:241-258

### event_groups#update — status=active + draft_trade_request_ids on a live project — publish a newly added stage
Publishing a stage added to an already-live project (e.g. an RFQ after the RFP); console.
Checks, in order:
1. Entry checks of update (533, 455, 516, 101) — event_groups_controller.rb:71-79
2. For each id in `draft_trade_request_ids` that belongs to the project and is still `draft`: publish it; the first error aborts (2, 511, 15, 101, auction price errors) — update_service.rb:259-274, 357-366
State rules: non-draft ids are skipped silently — :267; the 712 RFP/RFQ end-time check is NOT run on this path — compare :232 with :259-274; the new stage becomes active / requested / draft by the normal publish rules — trade_controller_helper.rb:4536-4540.
Side effects: audience differences vs the stage's pre-publish audience logged as `vendor_added` / `vendor_removed` — update_service.rb:271-272, 368-374.
Cites: app/services/event_groups/update_service.rb:259-274

### event_groups#update — PATCH /event_groups/:id status=draft — save the draft project
Saving the draft (stages, vendors, line items) without publishing; console.
Checks, in order:
1. Entry checks of update (533, 455, 516, 101) — event_groups_controller.rb:71-79
2. Audience update of a kept stage → 2 (audience_except without products) or 511 "Participants limit exceeded…" (HTTP 422) — update_service.rb:71-72, trade_controller_helper.rb:697-699, 728-730
State rules: stages in `delete_draft_stage_ids`, or NOT in `draft_trade_request_ids` (when sent), → `void` with forms, access lists and draft trade products removed — update_service.rb:62-70; kept stages get `audience_company_ids` minus blacklisted vendors — trade_controller_helper.rb:693-735; project status set to `draft` even if it was live (no guard) — update_service.rb:79.
Side effects: PR quantities updated; `draft_project_data.saved_count` +1 (Drafts tab needs > 0) — :75-76, 474-482; LPO data refreshed — :91.
Cites: app/services/event_groups/update_service.rb:62-91

### event_groups#update — line_items with status=deleted — delete line items: checks
Removing line items from a draft or live project; console.
Checks, in order:
1. Request sends exactly one line item and the project has exactly one ACTIVE line item → 711 "You cannot delete this line item from the project" (HTTP 422) — update_service.rb:173-176
2. A deleted item is part of a valid award proposal → 711 (HTTP 422) — :177-182, event_group_controller_helper.rb:743-750
State rules: normal projects delete the items sent with `status: "deleted"`; BOQ projects delete every existing item not in the new list — update_service.rb:164-169. The last-item guard counts only `active` items, so on a draft project (items are `draft`) it does not fire (unverified live). With service-RFP grouping, deleting one activity deletes all sibling activities of the same service PR — :184-185, service_line_item_deletion.rb:10-24.
Cites: app/services/event_groups/update_service.rb:163-216

### event_groups#update — delete line items: what happens (part 2)
Effects of a successful line-item delete.
Side effects: draft project → items `in_active`, their trade products voided, forms/form mappings/stage mappings deactivated, stages touched, PR mappings deactivated and PR quantities released — update_service.rb:188, 200-210, 390-405. Live project → items `deleted`, their forms `deleted` — :188-192, 382-388. Award proposal reset (for lot projects only the item's lot) — :193-196, 212-214. Lot stages left with no active line item → `closed` with closed_at now — :198, 504-523. PR activity log `deleted_from_event` — :199, 435-448. Service-group deletes run DeleteServiceProjectWorker — :218-223.
Cites: app/services/event_groups/update_service.rb:186-223

### event_groups#update — status=withdrawn — withdraw the whole project: checks (part 1)
Withdrawing (closing) the whole project with remarks; console.
Checks, in order:
1. Entry checks of update (533, 455, 516, 101) — event_groups_controller.rb:71-79
2. Remark save fails → 472 "failed to add remark" (HTTP 422) — update_service.rb:321-322, 348-355, remarks_helper.rb:13
3. `withdraw_remark` missing → nil access `@withdraw_remark['remarks']` → untyped 500 (defect-shaped) — update_service.rb:327
4. A draft stage (to be cancelled) the user may not cancel → 101 (HTTP 422). Draft stages of a DRAFT project are always cancellable; on a live project only draft auctions, by super admin / stage creator / auction team — trade_controller_helper.rb:187-189, trade_request_model_helper.rb:1495-1505
State rules: the UI flag `is_allowed_to_withdraw` (status active/draft, no selected/requested proposal, buyer, owner or super admin) is NOT enforced by this endpoint — event_group_controller_helper.rb:552, 2604-2611.
Cites: app/services/event_groups/update_service.rb:316-346

### event_groups#update — status=withdrawn — withdraw the whole project: checks (part 2)
Per-stage refusals while withdrawing the project.
Checks, in order:
5. An award proposal is `selected` or `requested` (for lot projects: in that stage's lot) → 841 "Cannot withdraw the event as proposals are already submitted." (HTTP 422) — trade_controller_helper.rb:192-199
6. Remark present and a PR item was short-closed by integration → 753 "Cannot withdraw event with short closed purchase request items" (HTTP 422) — :284-297
7. Stage or trade product save fails → 1106 "Failed to update lot configuration. Please try again." (HTTP 422) — :215-247
State rules: stages already void/in_active/withdrawn/cancelled are skipped — update_service.rb:324, trade_request.rb:169. Any error rolls the whole withdraw back.
Cites: app/controllers/concerns/trade_controller_helper.rb:186-262

### event_groups#update status=withdrawn — what withdrawing changes (part 3)
Effects of a successful project withdraw.
State rules: project closed_at = now, closed_by = user, status `withdrawn` — update_service.rb:318-319, 79. Each remaining stage: draft → `cancelled`, others → `in_active`, closed_at/closed_by set, upcoming schedules deactivated, current schedule end cut — :323-331, trade_controller_helper.rb:200-212. Active/draft award proposals → `withdrawn` — update_service.rb:333-337.
Side effects: remark saved as `withdraw_project_remark` (shown in show's withdraw_details) — :348-355, event_group_controller_helper.rb:2613-2630; per stage push `trade_request_withdrawn` + email `trade_withdraw`, knockout rounds voided, additional requests revoked — trade_controller_helper.rb:250-253; PR quantities released, mappings deactivated, PR log `event_withdrawn_reopened` — update_service.rb:339-344, 450-462; withdraw emails to vendors and buyer — event_group.rb:116, 983-986.
Cites: app/services/event_groups/update_service.rb:316-346

### event_groups#update — missing state guards on project status (defect-shaped)
What the update endpoint does NOT check about the project's current status.
State rules: no check of the CURRENT status before applying `status`: (a) `status: "draft"` on a LIVE project runs the draft path and sets it back to `draft` — event_group_controller_helper.rb:33-35, update_service.rb:62-79; (b) `status: "withdrawn"` on an already withdrawn project re-runs withdraw with a new closed_at/closed_by — update_service.rb:58-61, 316-319; (c) `status: "active"` plus a non-empty `config` on a WITHDRAWN project sets it `active` again via the plain-update path — helper :29-35, update_service.rb:79. Only `latest?` and the policy are checked — event_groups_controller.rb:73, 79. All unverified live (the UI may never send these) but worth negative tests.
Cites: app/controllers/concerns/event_group_controller_helper.rb:15-47, app/services/event_groups/update_service.rb:58-79

### event_groups#update — recurring (scheduled template) projects
How update treats a project marked as a recurring template; gated by company `scheduled_events_enabled?`.
State rules: template + `line_items` sent → the template first goes back to `draft` (active stages → draft, its job paused) — event_group_controller_helper.rb:17-20, trade_controller_helper.rb:5962-5975; `config.is_scheduled_template` marks a template — update_service.rb:83, 250; `config.schedule` creates or updates the ScheduledJob (`event_group_clone`; time of day defaults to the earliest stage start, else 09:00, company time zone) — :557-618; publishing a paused template resumes its job — :541-555.
Side effects: `schedule_updated` email and `recurring_event_edited` push on resume — :553-554. Templates send no invitation mails — event_group.rb:489-504.
Cites: app/services/event_groups/update_service.rb:541-618

### event_groups#create_clone — POST /event_groups/:id/create_clone — clone a project: checks
Copies a live or withdrawn project into a new draft; console.
Checks, in order:
1. Project not found → 533 "Project does not exist." (HTTP 422) — event_groups_controller.rb:106-107
2. Policy create_clone?: project outside the user's companies, no trade `create_record`, user is a planner, project is DRAFT, or project linked to a PR → 455 (HTTP 422) — :109, event_group_policy.rb:46-50
3. Project `in_active` (not active, not withdrawn) → 1122 "Only active or withdrawn events can be cloned." (HTTP 422) — :111-113
4. Project linked to a PR → 1123 "Events with purchase requests cannot be cloned." — :115-117; effectively unreachable, the policy returns 455 first
State rules: a draft project gets 455, not 1122. Company setting `allowed_to_clone_project` only drives the UI flag; the endpoint ignores it — event_group_controller_helper.rb:534, 565. "Linked to a PR" = a non-in_active PR mapping on the project — event_group.rb:1010-1013.
Cites: app/controllers/api/event_groups_controller.rb:105-128

### event_groups#create_clone — what the clone contains (part 2)
What is copied and reset when a project is cloned.
State rules: new project `draft`, owner = cloning user, new ref_id; started/closed/closed_by, precomputed data and lot config cleared; `meta_data.source_event_group_id` = source — replication_base.rb:5-13, clone_service.rb:32-46, 88-91. Only ACTIVE line items are copied (as `draft`, by serial number) — clone_service.rb:48-55, replication_base.rb:16-32. Only RFI/RFP/RFQ stages not `in_active` are cloned; auction stages and lot child RFQs are NOT — clone_service.rb:57-86.
Side effects: clone counted as a saved draft (saved_count +1) so it shows in Drafts — clone_service.rb:92-97. Response `{ event_group_uuid }` — controller :127.
Cites: app/services/event_groups/clone_service.rb:13-100

### event_groups#show — GET /event_groups/:id — project details: checks
Returns the project with stages, participants summary and config flags; console and vendor.
Checks, in order:
1. Project not found → 533 "Project does not exist." (HTTP 422) — event_groups_controller.rb:131-132
2. Policy show?: no trade `read_record`, or the user sees no stage (incl. someone else's draft) → 455 (HTTP 422) — :133, event_group_policy.rb:52-54
3. No visible stages → 682 "You are not allowed to view this project." — :135; effectively unreachable, the policy refused first
4. Buyer side with company setting `restrict_event_visibility_to_owner` on and user not in a planning designation: user must be super admin, Procol employee, owner, a stage approver, chat assignee, shared on a stage, or auction team on an auction → else 101 (HTTP 422) — :139-144, trade_controller_helper.rb:5932-5946
Cites: app/controllers/api/event_groups_controller.rb:130-181

### event_groups#show — GET /event_groups/:id — what the response carries (part 2)
Buyer vs vendor differences in the project details.
State rules: buyer gets per-stage participant summaries — event_groups_controller.rb:145; vendor gets the bid-justified stage per lot and its own vendor mapping — :146-151. `withdraw_details` (remarks, attachments, withdrawn_by, withdrawn_at) only for withdrawn projects — event_group_controller_helper.rb:2613-2630. Config flags are UI hints only, not enforced by the matching endpoints: is_allowed_to_withdraw, allowed_to_clone_project, is_allowed_to_change_ownership, allow_lpo_update, should_allow_awarding, can_create_new_version — :525-571. Recurring templates also get schedule_template_config — :567-569.
Cites: app/controllers/concerns/event_group_controller_helper.rb:525-593

### event_groups#participate — POST /event_groups/:id/participants — vendor joins an open tender
A vendor self-registers into an open-tender project; vendor website only.
Checks, in order:
1. Project not found or not `active` → 533 "Project does not exist." (HTTP 422) — event_groups_controller.rb:277-278
2. Policy participate?: show? fails or the buyer company is not `open_tenders?` → 455 (HTTP 422) — event_group_policy.rb:25-27
3. Any open-tender stage past its bid end time (and not in response review) or closed → 33 "Order not active" (HTTP 422) — participate_service.rb:26-29, trade_request.rb:1197-1200
4. Vendor has no buyer-vendor mapping with an allowed status → nil `.dealing_with_company_id` → untyped 500 (defect-shaped) — participate_service.rb:30-34
5. Record invalid (e.g. duplicate) → 15 with the validation text (HTTP 422) — controller :282-283
Side effects: user intent `trade_accept`; vendor added as a `self_registered`, visible audience on every open-tender stage — participate_service.rb:35-47.
Cites: app/services/event_groups/participate_service.rb:25-48

### event_groups#reject_participant — PATCH /event_groups/:id/reject_participant — reject a vendor (part 1)
Buyer removes a participating vendor (`company_id`) with `remarks`; console.
Checks, in order:
1. Project not found or not `active` → 2 "Insufficient parameters" (HTTP 422) — event_groups_controller.rb:981-982
2. `remarks` blank → 752 "Please enter remarks to reject the participant." (HTTP 422) — :983
3. Project not the latest version → 101 (HTTP 422) — :984
4. Policy show? → 455 (HTTP 422) — :985
5. User neither purchaser nor auction team → 101 (HTTP 422) — :987
6. No visible stage → 682 (unreachable after 4) — :989-990
Side effects: company id appended to `precomputed_data.rejected_company_ids` (no duplicate check), RejectParticipantWorker queued with the remarks — :996-1000.
Cites: app/controllers/api/event_groups_controller.rb:980-1003

### event_groups#reject_participant — evaluated / not-participated rules (part 2)
When a vendor cannot be rejected from the project.
Checks, in order:
7. Vendor is in an active/selected/requested proposal (technical proposals for RFI/RFP, award proposals otherwise) → 750 "You cannot reject a vendor that is already evaluated or awarded" (HTTP 422) — event_group_controller_helper.rb:2557-2569
8. ANY commercial stage has a `selected` bid, from any vendor → 750 (HTTP 422) — :2570-2573
9. Vendor has no active/accepted/revised/requested response (RFI/RFP) or active/selected/requested/revised bid (as vendor or broker) in any stage → 751 "You cannot reject a vendor that has not participated in any event." (HTTP 422) — :2575, 2592-2598
Cites: app/controllers/concerns/event_group_controller_helper.rb:2557-2598

### event_groups#change_ownership — POST /event_groups/:id/change_ownership — transfer project owner: checks
Hands the project to another buyer (`new_owner_id`); console.
Checks, in order:
1. Project not in the current workspace → 533 "Project does not exist." (HTTP 422) — event_groups_controller.rb:1090-1091
2. Policy change_ownership?: show? plus super admin / Procol employee / current owner → else 455 (HTTP 422) — event_group_policy.rb:88-90
3. New owner not an active user, or same as current owner → 2 "Insufficient parameters" (HTTP 422) — trade_controller_helper.rb:5948-5952
4. Current owner still active and shares no active team with the new owner → 960 "New Owner must be in same team as that of current owner" (HTTP 422) — :5953-5957
State rules: if the current owner left the company ANY active user passes, workspace membership unchecked (defect-shaped, unverified). The UI flag's conditions (`restrict_event_visibility_to_owner`, active commercial stage) are not checked here — event_group_controller_helper.rb:604-614.
Cites: app/controllers/api/event_groups_controller.rb:1089-1103

### event_groups#change_ownership — what the transfer changes (part 2)
Effects of a successful ownership transfer.
Side effects (one transaction): old owner access list → in_active, new `owner` access list — transfer_ownership_service.rb:23-40; old owner's draft award proposal copied to the new owner and the old one in_active; `requested` proposals and their template responses re-assigned — :42-61; chats assigned to the old owner re-assigned (old assignment `revised`, old owner muted, new owner joined) — :63-97; latest commercial stage(s) touched to drop cached reports — :99-114; `meta_data.owner_trail` appended, cached quotation templates dropped — :116-131. Emails `event_assigned` / `event_unassigned` — :18, event_ownership_transfer_worker.rb:27-33.
State rules: the stored creator `user_id` is unchanged; the new owner counts as owner only when `restrict_event_visibility_to_owner` is on — event_group.rb:1227-1235.
Cites: app/services/event_groups/transfer_ownership_service.rb:9-131

### event_groups#team_buyers — GET /event_groups/:id/team_buyers — candidates for ownership transfer
Lists users the project can be handed to; console.
Checks, in order:
1. Project not in the current workspace → 533 (HTTP 422) — event_groups_controller.rb:1066-1067
2. Policy team_buyers?: show? plus super admin / Procol employee / owner → else 455 (HTTP 422) — event_group_policy.rb:84-86
State rules: owner still active → active members of the owner's active teams, minus the owner and planners; owner inactive → all workspace buyers minus planners — controller :1073-1083. Returns `{ user_id (uuid), user_name }` — :1085.
Cites: app/controllers/api/event_groups_controller.rb:1065-1087

### event_groups#get_lots / reset_to_smart_lots — lots on the price round (RFQ)
Read the lot split of an RFQ, or reset it to system ("smart") lots; console.
Checks, in order (get_lots):
1. Project not found or not active/withdrawn → `nil.latest?` → untyped 500 (defect-shaped; the 2 check comes after) — event_groups_controller.rb:894-896
2. Not latest → 101 (HTTP 422) — :895; policy show? → 455 — :897
3. `trade_request_id` not an RFQ → 2 "Insufficient parameters" (HTTP 422) — :898-899
Checks, in order (reset_to_smart_lots):
1. `id` or `trade_request_id` missing → 2 — :908-910
2. Project not active in this workspace → nil crash, untyped 500 (defect-shaped) — :911-912
3. Not latest → 101; stage not an active RFQ of the project → 2 — :912-916
4. Policy show? → 455; LotSplittingService#reset_smart_lots error → that code — :917-920
Cites: app/controllers/api/event_groups_controller.rb:891-922

### event_groups#save_draft_lots — PATCH /event_groups/:id/save_draft_lots — save manual lots
Saves a manual lot split (title, description, trade products) before lots are published; console.
Checks, in order:
1. Project not found or not active → `nil.latest?` → untyped 500 (defect-shaped) — event_groups_controller.rb:927-929
2. Not latest → 101 (HTTP 422) — :928; policy show? → 455 — :930
3. `lots` empty, no `old_trade_product_ids`, or their stage missing/not active → 2 "Insufficient parameters" (HTTP 422) — :931-938
4. Active trade products across all lots ≠ non-in_active trade products of the stage → 842 "Unable to save lots" (HTTP 422; the detailed text goes only to Sentry) — :950-957, 965-978
State rules: lots already `active` (published) are left unchanged; others get mode `manual_lots` — :940-948.
Cites: app/controllers/api/event_groups_controller.rb:925-978

### event_groups#refresh_lpo_data — POST /event_groups/:id/refresh_lpo_data — refresh last purchase price
Re-pulls last-PO reference prices for PR-linked line items; console.
Checks, in order:
1. Another refresh for the same project within 3 s → 516 "Transaction in Progress" (HTTP 422; a before_action, so it does stop the request) — event_groups_controller.rb:21, 1496-1502
2. Project not active in this workspace → 836 "Event group not found" (HTTP 422) — :1106-1107
3. Policy update? → 455 (HTTP 422) — :1108
4. Company `allow_lpo_update?` off, no PR-linked active line item, or project not active → 101 (HTTP 422) — :1109, event_group.rb:909-912
Side effects: for active line items not in a selected proposal, unless a refresh is already `in_progress`: status set in_progress and RefreshLpoDataWorker queued — event_group.rb:919-929.
Cites: app/controllers/api/event_groups_controller.rb:1105-1112

### event_groups#move_purchase_request_items_to_draft_project — POST /event_groups/:id/pri_to_draft_project — add PR items to a draft
Adds PR line items into an existing draft project (PR / Clara flow); console.
Checks, in order:
1. Policy create? → 455 (HTTP 422) — event_groups_controller.rb:1006
2. No `line_items`, no id, project not a DRAFT of this workspace, or service-RFP grouping applies → 2 "Insufficient parameters" (HTTP 422) — :1007-1012
3. Policy update? → 455 — :1013
4. User in an auction team, or no draft tab (needs Clara access, or Procol dashboard app + `draft_project_creation_enabled`) → 455 (HTTP 422) — :1014-1016, users_controller_helper.rb:371-390
5. PrToErfxService error → that code with HTTP 422: 557 "Purchase request items are not valid"; 15 "Operation failed" (e.g. RFQ and auction both requested) — :1017-1018, pr_to_erfx_service.rb:22-47
Cites: app/controllers/api/event_groups_controller.rb:1005-1020

### event_groups#pr_linking — POST /event_groups/pr_linking — link PR items to a live project (part 1)
Links open PR items to matching line items of an existing project; console.
Checks, in order:
1. Policy index? → 455 — event_groups_controller.rb:859
2. `purchase_request_item_ids` missing / not an array → 2 (HTTP 422) — :861-863
3. Company setting `pr_linking_enabled` off → 837 "PR linking is disabled for your organization" (HTTP 422) — :865-866
4. PR items not found or not the user's → 834 "Purchase request item has no product" (misleading text, HTTP 422) — event_group_controller_helper.rb:2970-2987
5. PR item not active / in progress → 838 "Purchase request items must be in active or in progress status" (HTTP 422) — :2989-2992
Cites: app/controllers/api/event_groups_controller.rb:858-877

### event_groups#pr_linking — project and matching checks (part 2)
How PR items are matched to the project's line items.
Checks, in order:
6. Project (`event_group_id`) not found → 836 "Event group not found" (HTTP 422) — event_group_controller_helper.rb:2691-2694
7. Project has an active award proposal → 835 "Event group already has an active proposal" (HTTP 422) — :2696-2699
8. A PR item matches no active line item (same product + location code, open quantity within the over-quantity tolerance) → 836 "Event group not found"; the specific "No matching event group line item…" message is dropped by the controller — :2749-2759, controller :870
9. Record invalid → 15 (HTTP 422); other exception → 15 with HTTP 500 — controller :872-875
Side effects: PR mappings inserted, `pr_line_item_id` backfilled, in-progress quantity workers — helper :2705-2711.
Cites: app/controllers/concerns/event_group_controller_helper.rb:2687-2766

### event_groups#search — POST /event_groups/search — find live projects a PR item can join
Lists active projects whose line items match the given PR items; console.
Checks, in order:
1. Policy index? → 455 — event_groups_controller.rb:839
2. `purchase_request_item_ids` missing / not an array → 2 (HTTP 422) — :843-845
3. PR item validation → 834 / 838 as in pr_linking — event_group_controller_helper.rb:2656-2657, 2970-2995
4. Any exception → 15 with the exception text, HTTP 500 — controller :853-854
State rules: only `active`, non-template projects of the user's team, with active line items matching product, location and open quantity — helper :2662-2684.
Cites: app/controllers/api/event_groups_controller.rb:838-856

### event_groups#get_line_items — GET /event_groups/:id/get_line_items — project line items
Paged line items with PR details; console and vendor.
Checks, in order:
1. Project not found or not active/withdrawn/draft → 533 (HTTP 422) — event_groups_controller.rb:469-471
2. Company setting `hide_line_items_from_project_details_vendor_side` on → returns `{}` BEFORE any auth check, for buyers too — :472-473
3. Policy get_line_items? (= show?) → 455 — :474
State rules: draft line items shown only when the draft tab is available — :475-476; vendor sees PR creator masked if `mask_pr_creator_details_for_vendor`, quantity widgets disabled per project setting — :493-495, 524-543.
Cites: app/controllers/api/event_groups_controller.rb:466-545

### event_groups#get_audience / get_audience_filters — vendors of the project
Participant (vendor) list and its filters; console (filters also vendor).
Checks, in order:
1. Project not found (get_audience_filters: not in the current workspace) → 533 (HTTP 422) — event_groups_controller.rb:552, 586-587
2. Policy show? → 455 — :553, 588
3. No visible stage → 682 (unreachable after 2) — :555, 591
State rules: rejected vendors come from `precomputed_data.rejected_company_ids`; suggested vendors from `meta_data.suggested_audience_snapshot` — :557-560. get_audience_filters has login flag 0 in app_auth_config — app_auth_config.yml:1071.
Cites: app/controllers/api/event_groups_controller.rb:548-653

### event_groups#get_approvals — GET /event_groups/:id/get_approvals — award proposal approvals
Approval requests raised on the project's award proposals; console.
Checks, in order:
1. Project not found → 2 "Insufficient parameters" (HTTP 422) — event_groups_controller.rb:656-657
2. Policy get_approvals?: project not in the user's companies → 455 — :658, event_group_policy.rb:72-74
State rules: proposals needing approval, not in_active/draft, optional `lot_no` — :659-660.
Cites: app/controllers/api/event_groups_controller.rb:654-684

### event_groups#scheduled — GET /event_groups/scheduled — recurring templates list
Lists recurring (scheduled template) projects; console.
Checks, in order:
1. Company scheduled events off → 904 "Scheduled events feature is not enabled for your workspace" (HTTP 403) — event_groups_controller.rb:375
2. Policy scheduled? (= index?) → 455 — :377
State rules: active/draft templates of the workspace with an active or paused ScheduledJob — :379-392.
Cites: app/controllers/api/event_groups_controller.rb:374-412

### event_group_line_item#update_egli — PATCH /event_group_line_item/update_egli — change line-item evaluators
Add/remove evaluators or resend evaluation for one line item of a technical round; console.
Checks, in order:
1. `form_id` not found → 2 "Insufficient parameters" (HTTP 422) — event_group_line_item_controller.rb:9-10
2. Policy update_egli? (= trade update?) → 455 — :12, trade_request_policy.rb:196-198
3. Stage void/cancelled → 4 "Request not found"; user cannot view the stage → 536 "You are not allowed to view this event." (HTTP 422) — :13-14, trade_controller_helper.rb:2214-2222
4. Outside the evaluation window (after bid end / review end, before extra closing end) → 741 "You can update evaluators only in evaluation time." (HTTP 422) — :15, trade_request.rb:954-967
Side effects: `add_evaluators` (+ `notify_evaluators` email), `remove_evaluators`, `resend_evaluation`; pending-on evaluator recomputed — evaluations_helper.rb:722-747.
Cites: app/controllers/api/event_group_line_item_controller.rb:7-18

### event_groups#clara_vendor_call_log / email_ai_query_resolution — Clara integrations
Server-to-server calls from Clara (AI agent); only in the `clara` app config — app_auth_config.yml:2081.
Checks, in order (clara_vendor_call_log):
1. `ctm_uuid` or `events` blank → code 422, which has no locale entry → "Something went wrong!" with HTTP 500 — event_groups_controller.rb:254-256, json_helpers.rb:19-20
2. No company with `clara_ai_access_enabled` for that tenant → code 404, also no locale entry → HTTP 500 — :258-262
Side effects: ClaraVendorCallLogWorker queued — :264.
State rules (email_ai_query_resolution): technical/commercial/general query emails are routed to the right buyers (else the owner); vendors not in the project audience get a refusal email — :199-238.
Cites: app/controllers/api/event_groups_controller.rb:184-267

### event_groups — listing actions (one line each)
- index GET /event_groups — live projects (buyer or vendor), policy index? → 455 — event_groups_controller.rb:290-329
- draft GET /event_groups/draft — Drafts tab (drafts only when saved_count > 0, plus non-template active) — :331-372, event_group_controller_helper.rb:908-917
- history GET /event_groups/history — ended/withdrawn projects, policy index? — :415-462
- tab_counts GET /event_groups/tab_counts — counts per tab, uses saved-view filters — :778-824, 1144-1151
- update_eg_cards GET /event_groups/update_cards — refresh cards; no `stale_eg_ids` → 2 — :727-771
- options GET /event_groups/filter_options — vendor passing a `company_id` it does not deal with → 2 — :773-776, 1528-1535
- all GET /event_groups/all — vendor-only open tenders; policy all?: non-buyer and workspace open_tenders? — :269-274, event_group_policy.rb:33-35
Cites: app/controllers/api/event_groups_controller.rb:269-824

### event_groups — other actions (one line each)
- pr_options / pr_number_options — RFX id / PR number filter options, policy index? — event_groups_controller.rb:826-836, 879-889
- get_all_attachments GET /event_groups/:id/get_all_attachments — report names; uses `find` (unknown id → RecordNotFound, status unverified) and returns no body for drafts — :686-725
- purchase_cart_params GET /event_groups/:id/purchase_cart_params — PR draft data; not a draft of this workspace → 2 — :1022-1037
- regenerate_master_qcs POST /event_groups/regenerate_master_qcs — Procol employees on an allow-list only (else 455); >10 ids → 843 "Maximum 10 event_group_ids allowed"; report failure → 15 — :1039-1063, event_group_policy.rb:92-97
Cites: app/controllers/api/event_groups_controller.rb:686-1063

## Error codes in this area

### Error codes — general and project lookup
- 2 (HTTP 422) "Insufficient parameters" — create (event_groups_controller.rb:26, 32), reject_participant (:982), get_approvals (:657), lots (:896-938), change_ownership bad new owner (trade_controller_helper.rb:5951), audience-except without products (:699), update_egli (event_group_line_item_controller.rb:10)
- 4 (HTTP 422) "Request not found" — update_egli on a void/cancelled stage (trade_controller_helper.rb:2215-2217)
- 455 (HTTP 422) "You are not authorized to perform this action" — every Pundit policy refusal (api_auth.rb:117-118); move PR items without draft access (event_groups_controller.rb:1015)
- 533 (HTTP 422) "Project does not exist." — project not found in update/show/create_clone/participate/get_line_items/get_audience/team_buyers/change_ownership (event_group_controller_helper.rb:2581; controller :107, 132, 278, 471, 552, 1067, 1091)
- 682 (HTTP 422) "You are not allowed to view this project." — show/get_audience/reject_participant with no visible stage (:135, 555, 990); usually pre-empted by 455

### Error codes — 15 and 101
- 15 (HTTP 422) "Operation failed" — create/update model invalid (event_groups_controller.rb:58, 91), participate record invalid (:283), publish schedule save failed (trade_controller_helper.rb:4544, 4549); search/pr_linking exceptions send 15 with HTTP 500 (:854, 875)
- 101 (HTTP 422) "You are not allowed to perform this action" — create BOQ not allowed (:30); update not latest / foreign attachment / bad BOQ PR (:78-79, event_group_controller_helper.rb:2586); show owner restriction (:143); reject_participant (:984, 987); lots not latest (:895, 912, 928); refresh_lpo_data (:1109); withdraw a stage the user may not cancel (trade_controller_helper.rb:188); knockout/dutch publish (:4555)

### Error codes — publish, draft and line items
- 511 (HTTP 422) "Participants limit exceeded. Maximum 500 participants are allowed." — more than 500 new vendors on a stage at save-draft/publish (trade_controller_helper.rb:728-730)
- 516 (HTTP 422) "Transaction in Progress" — project update lock (event_groups_controller.rb:1517; request continues, defect-shaped), refresh_lpo_data lock (:1499), adding a stage while the project is locked (trade_controller_helper.rb:3654)
- 711 (HTTP 422) "You cannot delete this line item from the project" — deleting the only active line item or one in an award proposal (event_groups/update_service.rb:175, 180)
- 712 (HTTP 422) "RFP duration exceeds RFQ end time. Please adjust." — event_groups#update publish of a draft project when the RFP bid end time is after the RFQ's (event_groups/update_service.rb:311); also trade#template_input (trade_controller_helper.rb:668-671)

### Error codes — dormant PRs and PR-to-draft
- 1125 (HTTP 422) "One or more PRs are dormant and locked from sourcing events" / "PR(s) <numbers> are dormant…" — create with dormant PR items (event_groups_controller.rb:1135-1141, create_service.rb:117-122)
- 557 (HTTP 422) "Purchase request items are not valid" — move PR items to a draft project (pr_to_erfx_service.rb:25)
- 8 (HTTP 422) "Model error" — model validation errors joined (json_helpers.rb:37-40); not used directly by event_groups

### Error codes — withdraw and clone
- 472 (HTTP 422) "failed to add remark" — project withdraw remark save failed (remarks_helper.rb:13, update_service.rb:321-322)
- 753 (HTTP 422) "Cannot withdraw event with short closed purchase request items" — withdraw with integration short-closed PR items (trade_controller_helper.rb:292-295)
- 841 (HTTP 422) "Cannot withdraw the event as proposals are already submitted." — withdraw with a selected/requested award proposal (trade_controller_helper.rb:195, 198)
- 1106 (HTTP 422) "Failed to update lot configuration. Please try again." — stage/trade product save failed during withdraw (trade_controller_helper.rb:221, 226, 245)
- 1122 (HTTP 422) "Only active or withdrawn events can be cloned." — create_clone on an in_active project (event_groups_controller.rb:111-112)
- 1123 (HTTP 422) "Events with purchase requests cannot be cloned." — create_clone on a PR-linked project (:115-116; normally pre-empted by 455)

### Error codes — participants and ownership
- 33 (HTTP 422) "Order not active" — participate when an open-tender stage has ended (participate_service.rb:27-28)
- 750 (HTTP 422) "You cannot reject a vendor that is already evaluated or awarded" — reject_participant (event_group_controller_helper.rb:2568, 2572)
- 751 (HTTP 422) "You cannot reject a vendor that has not participated in any event." — reject_participant (event_group_controller_helper.rb:2575)
- 752 (HTTP 422) "Please enter remarks to reject the participant." — reject_participant without remarks (event_groups_controller.rb:983)
- 960 (HTTP 422) "New Owner must be in same team as that of current owner" — change_ownership (trade_controller_helper.rb:5957)

### Error codes — lots and PR linking
- 842 (HTTP 422) "Unable to save lots" — save_draft_lots trade-product count mismatch (event_groups_controller.rb:956, 974)
- 834 (HTTP 422) "Purchase request item has no product" — search/pr_linking PR items missing or not the user's (event_group_controller_helper.rb:2978, 2986)
- 835 (HTTP 422) "Event group already has an active proposal" — pr_linking (:2698)
- 836 (HTTP 422) "Event group not found" — pr_linking project missing or no matching line item (:2693, 2758); refresh_lpo_data (event_groups_controller.rb:1107)
- 837 (HTTP 422) "PR linking is disabled for your organization" — pr_linking (event_groups_controller.rb:866)
- 838 (HTTP 422) "Purchase request items must be in active or in progress status" — search/pr_linking (event_group_controller_helper.rb:2991)

### Error codes — scheduling, evaluators, integrations, app access
- 843 (HTTP 422) "Maximum 10 event_group_ids allowed" — regenerate_master_qcs (event_groups_controller.rb:1048)
- 904 (HTTP 403) "Scheduled events feature is not enabled for your workspace" — scheduled (:375)
- 536 (HTTP 422) "You are not allowed to view this event." — update_egli (trade_controller_helper.rb:2221)
- 741 (HTTP 422) "You can update evaluators only in evaluation time." — update_egli outside the evaluation window (event_group_line_item_controller.rb:15)
- 422 and 404 (no locale entry → "Something went wrong!", HTTP 500) — clara_vendor_call_log (event_groups_controller.rb:255, 262)
- app_error_auth_failed (HTTP 401) "This app is not authorized to use this API" — action not allowed for the calling app; signs the session out (api_auth.rb:87-95, json_helpers.rb:31-35)
