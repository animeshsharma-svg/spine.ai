# Events list, project details and award screens — frontend digest (procol-client-dashboard 9776df3cd, 2026-08-11)

## Overview
The buyer console's events LIST (`/orders`, served by `src/pages/orders/OrdersListPage.jsx` + `src/viewModels/orders/useOrdersListViewModel.js`, which reuse `src/views/orders/components/*`), the PROJECT DETAILS shell (`/project/:id/:tabKey`, `src/views/projectDetails/**`, redirect in `src/views/projectDetailsRedirect/**`), the AWARD flow (`/awarding/:id`, `src/views/awardingFlow/**` + award cells in `src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx` / `comparisonHeaderFormatter.jsx`), the AWARD PROPOSAL / NFA page (`/project/:id/proposal/:proposalId`, `src/views/projectProposal/**`), the approvals drawer (`src/views/approvalsDrawer/**`) and the flexi approval note (`/approval_note/:dataSourceId/:id`, `src/views/approvalNote/**`). API calls go through `src/models/project/projectService.js`, `src/models/orders/ordersService.js` and redux thunks in `src/redux/project/actions.js`. Builds on `frontend-test-cases.md` (creation screens) and the backend `evaluation-award.md` (proposal APIs); "Gaps:" lines mark where the client blocks something the API still allows, so the API must be tested directly.

### Events list route — which list mode the buyer gets (project cards vs legacy orders)
The `/orders` page picks one of two list UIs from a user flag.
Rules:
1. [permission] Route `/orders` requires permission key `trade:read_record`; the old `views/orders` page is replaced by `pages/orders` (MVVM cutover) — src/app/routes/routeConfigs.js:399-407, src/app/routes/routeComponentsConfigs.js:63-65
2. [config] User flag `show_project_cards` (→ `shouldShowProjectCards`) true → project-card list (ProjectTable); false → legacy orders list (OrdersTable + Filters side panel) — src/redux/user/index.js:466, src/pages/orders/OrdersListPage.jsx:27-96
3. [config] `show_ask_ai_chatbot` true → the Generative AI bot renders under the legacy list — src/pages/orders/OrdersListPage.jsx:94, src/redux/user/selectors.js:183-184
4. [state] No list request is sent until the user-preference GET (`getUserPreference({type: project})`) settles; saved `applied_filters` and `applied_order_by` seed the filters/sort — src/viewModels/orders/useOrdersListViewModel.js:129-149, 233, 281
Cites: src/pages/orders/OrdersListPage.jsx:18-97

### Events list tabs — Live / History / Drafts / Recurring and the ?tab= URL
Tabs are driven by the `tab` query parameter.
Rules:
1. [validation] `?tab=` must be one of `live|history|draft|recurring` (lower-cased compare); anything else is replaced (history replace) by `?tab=live` — src/viewModels/orders/useOrdersListViewModel.js:82-110, src/views/orders/constants.js:231-236
2. [config] Drafts tab only when user flag `show_draft_tab`; Recurring tab only when `scheduled_events_enabled` — src/views/orders/components/projectTable.jsx:864, 928, src/redux/user/index.js:443, 531
3. [visibility] Live tab label carries a count badge = `event_group_count` of the LAST loaded live page — src/viewModels/orders/useOrdersListViewModel.js:342-345, src/views/orders/components/projectTable.jsx:626-628
4. [state] Switching tab writes `?tab=` with replace and scrolls the table to top — src/viewModels/orders/useOrdersListViewModel.js:381-395, src/views/orders/components/projectTable.jsx:374-381
Gaps: History and Drafts badges are never shown: ProjectTable expects `pastProjectCount` / `draftProjectCount` but OrdersListPage never passes them — src/views/orders/components/projectTable.jsx:292-293, 757, 866; src/pages/orders/OrdersListPage.jsx:30-64
Cites: src/views/orders/components/projectTable.jsx:580-979

### Events list (project cards) — list APIs, paging and polling
Rules:
1. [side-effect] Live tab: GET `/event_groups?latest_cursor=&newest_cursor=&filters=<json>&sort_by=&sort_direction=`; next page uses `latest_cursor = lastPage.cursor`, `newest_cursor` pinned to the first item of page 1 — src/viewModels/orders/useOrdersListViewModel.js:180-196, 235-251, src/models/project/projectService.js:12-13
2. [time] Live tab refetches every 30000 ms (`LIVE_ORDERS_POOL_TIMER`), not while the browser tab is hidden — src/viewModels/orders/useOrdersListViewModel.js:248-250, src/views/orders/constants.js:156
3. [side-effect] History: GET `/event_groups/history?last_updated_at=&filters=`; Drafts: GET `/event_groups/draft`; Recurring: GET `/event_groups/scheduled`; each pages by `last_updated_at` — src/viewModels/orders/useOrdersListViewModel.js:198-278, src/models/project/projectService.js:23-32
Cites: src/viewModels/orders/useOrdersListViewModel.js:163-278

### Events list (project cards) — filter options, new-updates pill, date grouping
Rules:
1. [side-effect] Filter options GET `/event_groups/filter_options` fetched once per session (skipped when already in redux) — src/viewModels/orders/useOrdersListViewModel.js:153-161, src/models/project/projectService.js:34
2. [visibility] "New updates" pill shows when the last live page has `updated_projects_present`; click scrolls up and refetches page 1 (per-card `update_cards` refresh is disabled) — src/views/orders/components/projectTable.jsx:542-554, 564-576, 732-734
3. [visibility] History/Drafts cards are grouped under a date header formatted `appFormatDate(date, DATE)` — src/views/orders/components/projectTable.jsx:846-858, 900-913
4. [visibility] Empty states: filtered → "no result" copy; Drafts → "No Drafts Found"; Recurring → "No Recurring Events Found" — src/views/orders/components/projectTable.jsx:699-708, 914-920, 965-971
Cites: src/views/orders/components/projectTable.jsx:542-971

### Events list (project cards) — search box and date range filter
Rules:
1. [time] Search box is debounced 1000 ms, trimmed, written to `?search=`, sent as `filters.title` on every tab — src/views/orders/components/projectTable.jsx:383-411, src/viewModels/orders/useOrdersListViewModel.js:185-188, 217, 227
2. [validation] Date range picker disables days after today; presets Last 7/30/90 days and Last 6 months — src/views/orders/components/projectTable.jsx:656-676, src/views/orders/constants.js:80-97
3. [time] Range is stored as unix seconds: from = start of day, to = end of day (browser local time), sent as `starting_from` / `ending_at` — src/views/orders/components/projectTable.jsx:413-435, src/viewModels/orders/useOrdersListViewModel.js:188-189
Cites: src/views/orders/components/projectTable.jsx:630-700

### Events list (project cards) — stage filter, per-tab filters and saved sort
Rules:
1. [calculation] Live stage radio All/Live/In - Evaluation/Upcoming → `stage_status: ["bidding"|"evaluation"|"upcoming"]`, "all" → null; History radio All/Completed/Withdrawn; choice kept in `?stageFilter=` — src/views/orders/constants.js:163-208, src/viewModels/orders/useOrdersListViewModel.js:58-63, src/views/orders/components/projectTable.jsx:437-458
2. [visibility] Drafts tab sends only search + custom filter (no date, no stage); Recurring tab shows only a search box (custom filter value still sent) — src/viewModels/orders/useOrdersListViewModel.js:213-230, src/views/orders/components/projectTable.jsx:869-885, 930-940
3. [visibility] Sort control offers one column, "RFX Number" (`id`), default `id desc` — src/views/orders/constants.js:222-229
4. [side-effect] Saving filters/sort (Live tab only) calls updateUserPreference type `project` — src/views/orders/components/projectTable.jsx:481-488, 555-562, 640-653
Cites: src/views/orders/components/projectTable.jsx:677-821

### Events list — bulk "Download Report" export (History tab)
Rules:
1. [visibility] Download Report button only on the History tab (both list modes) — src/views/orders/components/projectTable.jsx:587-598, src/views/orders/components/ordersTable.jsx:262-284
2. [validation] Range longer than 6.1 months when the drawer opens → red banner "Please select the date range which is equal or less than 6 months" and the Download button is replaced by "Back" — src/views/orders/components/projectTable.jsx:460-479, src/components/dowloadReportDrawer/downloadReportDrawer.jsx:510-517, 717-720
3. [time] No range chosen → info "You have not chosen any duration for your procurement history. Report will be generated for duration of <today−3 months> to <today>." and the request uses now−3 months (start of day) … end of today — src/views/orders/components/projectTable.jsx:523-531, src/redux/orders/actions.js:1124-1130
Cites: src/views/orders/components/projectTable.jsx:460-531

### Events list — bulk export request and its unchecked range
Rules:
1. [side-effect] GET `/reports/download_bulk_report?filters=&include_revised_bids=&column_selection=[{key,label}]&report_category=`; "Processing..." then the API `message`; failure → "Some error occurred while exporting report. Please try again." — src/redux/orders/actions.js:1114-1149, src/models/orders/ordersService.js:188-192, src/views/orders/components/projectTable.jsx:500-521
2. [visibility] Export `filters` = the custom filter value only (search text and stage filter are not sent) — src/views/orders/components/projectTable.jsx:329-331, 503-509
Gaps: the 6-month check runs only when the drawer opens; changing the duration inside the drawer is not re-checked — the backend must enforce its own range limit — src/views/orders/components/projectTable.jsx:463-476, 533-540
Cites: src/views/orders/components/projectTable.jsx:500-540

### Events list — New Event button and creation entry points
Rules:
1. [config] `rfx_project_enabled` on → New Event opens a menu: "Single Stage" (`?singleStage=true`), "eRFX Project" (Add Line Items modal → POST `/event_groups` → `?projectCreation=true`), and "BOQ based RFX Project" only when `isBoqInErfxAllowed` (`?projectCreation=true&boqProject=true`) — src/views/orders/components/projectTable.jsx:112-220, 351-368
2. [config] `rfx_project_enabled` off → `old_creation_flow_config = "show_old_flow"` goes to the old auction create route, anything else to the quick-create route — src/views/orders/components/projectTable.jsx:125-137, src/views/orders/constants.js:7-10
3. [visibility] Empty Live tab without filters repeats the New Event button; with filters it shows the "no result" copy instead — src/views/orders/components/projectTable.jsx:699-720
Cites: src/views/orders/components/projectTable.jsx:106-220

### Project card — header fields and where a click goes
Rules:
1. [visibility] Header shows creator name, `projectRefId`, "N item(s)" when `lineItemCount` > 0, red "Hold" tag when `isProjectOnHold`, "Auto created" Clara tag when `isAutoCreated` — src/views/orders/components/projectCard/projectCard.jsx:262-297
2. [visibility] "Created: <DATE_TIME>" only for auction-team users and only from the first draft stage's `createdAt` — src/views/orders/components/projectCard/projectCard.jsx:211-213, 300-310
3. [visibility] "Bids from Unregistered POCs <n>" when `pendingUnregisteredPocs` > 0; "N Message(s)" when `unresolvedChatCount` > 0 — src/views/orders/components/projectCard/projectCard.jsx:338-358
4. [state] Card link → `/project/<uuid>/details` when eRFX is allowed or the project has >1 stage, else `/orders/<firstStageUuid>` — src/views/orders/components/projectCard/projectCard.jsx:155-166
5. [state] Stage row click on a draft stage that is rfq→auction, or auction with `route_auctions_to_auction_team`, for an auction-team user with Drafts tab on → create screen with `draftStageIds, projectCreation, projectId, title, isRfqToAuction, isEditingAllowed=false` — src/views/orders/components/projectCard/projectCard.jsx:168-197
Cites: src/views/orders/components/projectCard/projectCard.jsx:134-260

### Project card — stage rows: titles, timers and participant counts
Rules:
1. [visibility] Stage title: rfi → "RFP", rfp → "Technical Offer", rfq → "RFQ", auction / rfq_then_auction → "<Strategy> Based Auction", lot stage → "<lotTitle> - <label>", vendor onboarding → "Vendor Onboarding" — src/views/orders/components/projectCard/projectCard.jsx:53-77
2. [visibility] Stage ref id hidden for vendor-onboarding stages and, for auction-team users, on draft stages — src/views/orders/components/projectCard/projectCard.jsx:442-447
3. [time] `timeType = duration` → live countdown decremented every 1 s client-side from `timeValue` seconds; `timestamp`/`overdue`/`schedule` show the backend label/value — src/views/orders/components/projectCard/projectCard.jsx:116-132, 449-477
4. [visibility] Draft stage: auction-team user sees "Tentative Date & Time: <DATE_TIME>" or "To Be Scheduled"; others see the label/value or "To Be Scheduled" — src/views/orders/components/projectCard/projectCard.jsx:478-511
Cites: src/views/orders/components/projectCard/projectCard.jsx:365-512

### Project card — participant counts, updates tags, owner, recurring rows
Rules:
1. [visibility] Participants: draft → invited count with tooltip "Total Participants Invited: N"; else "active/total" with tooltip "Bid placed: a / All participants: t", red style when active = 0 — src/views/orders/components/projectCard/projectCard.jsx:215-253
2. [visibility] Stage `updates` render as tags (success/info/error/request/warning colours) with optional count and tagValue — src/views/orders/components/projectCard/projectCard.jsx:521-590
3. [visibility] Stage owner shown as an avatar with initials and full name tooltip — src/views/orders/components/projectCard/projectCard.jsx:592-611
4. [visibility] Recurring card shows "Frequency <scheduleDisplayText or ->", invited count, and status tag Active/Paused/Cancelled — src/views/orders/components/projectCard/projectCard.jsx:318-337, 421-439
Cites: src/views/orders/components/projectCard/projectCard.jsx:513-619

### Legacy orders list — APIs, buckets and My Events filter
Shown when `show_project_cards` is off.
Rules:
1. [side-effect] Live: GET `/v1/trade/home?filters=<json>` polled every 30 s; History: GET `/v1/trade/history?last_updated_at=&filters=` (infinite, cursor = last item's `updated_at`) — src/viewModels/orders/useOrdersListViewModel.js:283-309, src/models/orders/ordersService.js:131-137, src/models/orders/ordersTransforms.js:226-232
2. [visibility] Live response buckets render with "upcoming_orders" first, then my/team events headers — src/views/orders/components/ordersTable.jsx:157-170, 200-210
3. [visibility] My Events switch on → only `my_events`, plus `team_events` when user flag `show_team_events_for_manager` — src/viewModels/orders/useOrdersListViewModel.js:351-369
Cites: src/viewModels/orders/useOrdersListViewModel.js:280-378

### Legacy orders list — filter panel and request mapping
Rules:
1. [calculation] Filter → request: duration → start/end of day unix; product (variants only) → `product_variant_uuids`; orderType buy → `buy_offers`, sell → `sell_offers`; Closed → `is_closed`, Expired → `is_expired`; Bid Type → `contains_surrogate_bid`; myOrders → `only_my_requests` — src/models/orders/ordersTransforms.js:151-198
2. [visibility] History-only filters: duration, template, order type, status, bid type, mode, strategy, QC (QC state only when QC "Done" picked), dispatch, payment — src/views/orders/components/filters.jsx:65-82, 153-250
3. [config] Title filter placeholder adds "or reference id" when user `showReferenceId` — src/views/orders/components/filters.jsx:84-110
Gaps: with `showMyOrdersByDefault` the My Events switch is hidden but the new ViewModel starts from `{live:{}, history:{}}` and never sets `myOrders`, so `only_my_requests` is not sent (the old selector forced it true) — src/views/orders/components/filters.jsx:251-263, src/viewModels/orders/useOrdersListViewModel.js:124, src/redux/orders/selectors.js:3492-3512
Cites: src/views/orders/components/filters.jsx:31-264

### Legacy order card — status shown for an event
Rules:
1. [calculation] Status from `status`, start, end, extra time (browser clock, server-skew adjusted): active & now<start → upcoming; start<now<end → active; end<now<extra → buffer; closed → "accepted"; requested → requested; else withdrawn — src/models/orders/ordersTransforms.js:14-50, 78-83
2. [visibility] "Best bid <best_price>" only when `bid_count` > 1 (hidden with exactly one bid); "Awaiting approval" tag when `is_pending_approvals` — src/views/orders/components/orderCard.jsx:270, 321-328
3. [time] Upcoming more than 1 day away shows relative text, else a countdown; buffer >12 h shows relative "accept within" text — src/views/orders/components/orderCard.jsx:45-100
Gaps: an active event past its end with no extra time falls through to "withdrawn" (the "expired" test `moment(end).isAfter()` is inverted) — src/models/orders/ordersTransforms.js:37-49; a closed event becomes "accepted" but the card's timer/colour switch expects "closed", so "Accepted at" never shows — src/views/orders/components/orderCard.jsx:73-79, src/views/orders/constants.js:149-155; EventGroup rows link to `/project/<id>/:tabKey` because `tabKey` is not passed — src/views/orders/components/orderCard.jsx:244-249, src/app/routes/routeHelpers.js:5-19
Cites: src/views/orders/components/orderCard.jsx:40-116

### Project details route and tabs — /project/:id/:tabKey
Rules:
1. [permission] `/project/:id/:tabKey` and `/project/:id` need `trade:read_record`; `/project/:id` replaces to `/project/:id/<?tab= or "details">` — src/app/routes/routeConfigs.js:383-398, src/views/projectDetailsRedirect/projectDetailsRedirect.jsx:9-22
2. [visibility] Tabs: "Project Details", one per stage (lot stages grouped under the lot title with "N item(s)"), then "Master QCS" — src/redux/project/selectors.js:1374-1406
3. [permission] Master QCS tab hidden for users whose team types include planner, and until at least one stage is non-draft; lot events get one Master QCS child per lot (`master_qcs?lotNo=`), plus a top-level one when `all_lots_withdrawn` — src/redux/project/selectors.js:39-40, 1408-1445
4. [visibility] Tab titles truncated to 20 chars with tooltip; withdrawn (`in_active`) stages carry a "Withdrawn" tag — src/views/projectDetails/projectTabs.jsx:112-135, 173-175
5. [state] A tabKey that is not details/master_qcs/a stage uuid renders nothing — src/views/projectDetails/projectDetails.jsx:1018-1022
Cites: src/views/projectDetails/projectTabs.jsx:29-200

### Project details — data loading and polling
Rules:
1. [time] GET `/event_groups/:id` on open and every 30000 ms (`PROJECT_DETAILS_POOL_TIME`) while the page is mounted — src/views/projectDetails/projectDetails.jsx:415-430, src/views/projectDetails/constants.js:76, src/models/project/projectService.js:70
2. [config] User flag `isNfaHistoryEnabled` → GET `/event_groups/:id/get_approvals?lot_no=` once the project uuid is known — src/views/projectDetails/projectDetails.jsx:432-437, src/redux/project/actions.js:315-327, src/models/project/projectService.js:72-73
3. [visibility] Communication hub (chat) hidden while the project is draft or when communication is not allowed — src/views/projectDetails/projectDetails.jsx:1056-1063
4. [side-effect] Clara "analyze_data" todo shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url` — src/views/projectDetails/projectDetails.jsx:439-448
Cites: src/viewModels/project/useProjectDetailsViewModel.js:37-100

### Project details — Overview and info panels
Rules:
1. [visibility] Overview: "Project ID" = `#<refId>`, "Created at" = DATE_TIME, "Open Tender Event: Yes" only when config `is_show_under_open_events` — src/views/projectDetails/projectDetails.jsx:545-564
2. [visibility] Withdrawn project: "Project Withdrawn by", "Project Withdrawn at" (DATE_TIME) and Remarks (truncated at 150 chars with tooltip) + attachments — src/views/projectDetails/projectDetails.jsx:479-491, 591-631
3. [visibility] "Addendum" panel only when `amendmentRemarks.remarks` is a string; Reports panel only when config `show_reports_table`; T&C panel when clauses or attachments exist — src/views/projectDetails/projectDetails.jsx:518-535, 747, 970-992
4. [visibility] Line Items / Participants panel headers show count tags from the line-item and participant responses — src/views/projectDetails/projectDetails.jsx:916-946, src/redux/project/selectors.js:867-876
5. [visibility] Contact Info: buyer display name, email, phone; info icon with "Ownership changed on <DATE>" previous/new owner when `ownerTrail` exists — src/views/projectDetails/projectDetails.jsx:295-310, 853-915
Cites: src/views/projectDetails/projectDetails.jsx:493-1008

### Project details — options menu, versions and edit
Rules:
1. [permission] Kebab options come from project config: "Withdraw Project" needs `is_allowed_to_withdraw`, "Change Owner" needs `is_allowed_to_change_ownership`, "Clone Project" needs `allowed_to_clone_project`; "Send Reminders" removed while the project is draft — src/views/projectDetails/projectDetails.jsx:238-274, src/views/projectDetails/projectOptionConfig.jsx:9-30
2. [visibility] Scheduled (recurring) templates hide the kebab and the Versions dropdown and show an "Edit" button instead — src/views/projectDetails/projectDetails.jsx:1037-1054, 1084-1098
3. [config] "New version" allowed only when config `can_create_new_version`; success → create screen with `projectCreation, projectId, draftStageIds, isEditingAllowed=true, boqProject`; missing ids → "Error while creating new version" — src/views/projectDetails/projectDetails.jsx:312-340, 1038-1045
Cites: src/views/projectDetails/projectDetails.jsx:1025-1100

### Withdraw Project modal
Rules:
1. [validation] "Yes, Withdraw Project" disabled only when remarks are blank (after trim) AND no attachment is added — a file alone enables it although "Withdrawal Remarks" is marked * — src/views/projectDetails/components/withdrawProjectModal.jsx:19, 49-53, 68-71
2. [side-effect] PATCH `/event_groups/:id` with `{ status: "withdrawn", withdraw_remark: { remarks: <trimmed>, attachments: [privateUrl] } }` — src/views/projectDetails/components/mutation.js:34-49, src/models/project/projectService.js:53-58
3. [side-effect] Success → "Project withdrawn successfully" and project details refetched — src/views/projectDetails/components/withdrawProjectModal.jsx:33-38
Cites: src/views/projectDetails/components/withdrawProjectModal.jsx:11-86

### Clone Project and Change Owner
Rules:
1. [side-effect] Clone: POST `/event_groups/:id/create_clone` (no body); success "Project cloned successfully" → `/project/<event_group_uuid>/details`; modal says "Cloning is supported only for the Technical and RFQ stages." — src/views/projectDetails/components/cloneProjectModal.jsx:17-53, src/models/project/projectService.js:64-68
2. [validation] Backend clone refusals the UI does not pre-check: not active/withdrawn → 1122 "Only active or withdrawn events can be cloned."; created from PR → 1123 "Events with purchase requests cannot be cloned." (HTTP 422) — procol-backend app/controllers/api/event_groups_controller.rb:105-117
3. [side-effect] Change Owner: GET `/event_groups/:id/team_buyers` when the modal opens; POST `/event_groups/:id/change_ownership` `{event_group_uuid, new_owner_uuid}`; OK disabled until a user is picked — src/views/projectDetails/components/changeOwnerModal.jsx:28-75, src/views/projectDetails/components/mutation.js:51-60
4. [config] Config `should_redirect_after_changing_ownership` → after "Owner changed successfully" go to `/orders`; failure toast "Failed to change owner" — src/views/projectDetails/components/changeOwnerModal.jsx:25-56
Cites: src/views/projectDetails/query.js:12-18

### Send Reminders drawer (project)
Rules:
1. [side-effect] GET `/reminders/:projectId?resource_type=event_group` lists reminder cards with "<total_count> Pending" — src/views/projectDetails/query.js:4-10, src/models/project/projectService.js:287-288, src/views/projectDetails/components/bulkReminderDrawer.jsx:193-217
2. [visibility] Reminder types: Offer submission, Pending evaluation (Evaluator), Best offer submission, Cost break down submission, Counter offer, Approval (Approver), Auction reminders — src/views/projectDetails/constants.js:121-165
3. [validation] "Send Reminder" disabled until at least one recipient is selected — src/views/projectDetails/components/bulkReminderDrawer.jsx:120-128
4. [side-effect] POST `/reminders/:id/send_reminder` `{resource_type:"event_group", reminder_type, reminders:{recipient_uuid:[uuids]}}`; toast "Reminders Sent to N Vendor(s)/Evaluator(s)/Approver(s)" — src/views/projectDetails/mutation.js:45-75
Cites: src/views/projectDetails/components/bulkReminderDrawer.jsx:22-128

### Recurring template actions — pause, resume, terminate
Rules:
1. [side-effect] POST `/scheduled_jobs/:jobId/transition` with the action; toasts "Recurring event paused/resumed/terminated" and project refetch — src/views/projectDetails/projectDetails.jsx:353-393, src/models/project/projectService.js:125-130
2. [validation] No job id → "Schedule job ID not found. Please try again." and no call — src/views/projectDetails/projectDetails.jsx:354-357
3. [state] Terminate asks "Terminate recurring event?" ("Events that have already been published will remain unchanged."); menu hidden once status is `cancelled`; Resume only when `paused` — src/views/projectDetails/projectDetails.jsx:128-181, 371-389, 1065
Gaps: "Pause Recurring Event" is shown only when status equals `SCHEDULE_TRANSITION_ACTIONS.active`, a key that does not exist (undefined) — so Pause never appears for an `active` schedule; test POST transition pause directly — src/views/projectDetails/projectDetails.jsx:99-103, 131-144
Cites: src/views/projectDetails/projectDetails.jsx:99-182

### Participants table and Reject vendor (project)
Rules:
1. [visibility] Columns: S No., Vendor Name, Vendor Code, Location, Type, Tags, Reason for not participating, one status column per stage ("invited" shown as "Not Participated") — src/views/projectDetails/components/participantsTable.jsx:150-243
2. [permission] Reject option only when user flag `allow_reject_vendor_from_project` and the project is not draft; disabled when the vendor is already rejected in the FIRST stage — src/views/projectDetails/components/participantsTable.jsx:70-90, 163-176, src/redux/user/selectors.js:226-227
3. [validation] Modal OK disabled while the remark is blank after trim; remark is sent untrimmed — src/views/projectDetails/components/vendorRejectionModal.jsx:34-55
4. [side-effect] PATCH `/event_groups/:id/reject_participant` `{company_uuid, remarks}`; backend refuses blank remarks 752 "Please enter remarks to reject the participant." (HTTP 422) — src/views/projectDetails/components/mutation.js:9-31, procol-backend app/controllers/api/event_groups_controller.rb:980-1003
5. [time] Search debounced 300 ms; page size 20; proposal page reuses this table without the reject option — src/views/projectDetails/components/participantsTable.jsx:265-267, 397, src/views/projectProposal/projectProposal.jsx:1175
Cites: src/views/projectDetails/components/vendorRejectionModal.jsx:18-98

### Line Items table (project) — delete item and refresh LPO
Rules:
1. [visibility] Row menu (delete) only for non-BOQ projects and items not already `deleted`; all options hidden while the project is draft — src/redux/project/tableHelpers.jsx:47-83, src/views/projectDetails/projectDetails.jsx:928-931
2. [side-effect] Delete confirm "Are you sure you want to delete <title> line item with <qty> quantity" → PATCH project with the item `status: "deleted"` → "Line item deleted successfully" — src/views/projectDetails/components/lineItemTable.jsx:139-170
3. [config] "Refresh LPO Details" only with the LPO-update user flag; disabled while `lpoRefreshData.status = in_progress`; POST `/event_groups/:id/refresh_lpo_data`; error "Unable to refresh LPO details. Please try again."; failed status shows its message as an alert — src/views/projectDetails/components/lineItemTable.jsx:105-113, 338-376, src/views/projectDetails/mutation.js:77-91
Gaps: delete is offered on any non-draft project (live, awarded) — the PATCH must be tested for closed/awarded projects — src/redux/project/tableHelpers.jsx:50-51
Cites: src/views/projectDetails/components/lineItemTable.jsx:53-400

### Published Stages table (project)
Rules:
1. [visibility] Columns: Stage Code (dropped when no row has `ref_id`), Stage Title, Pending Actions, Participants "active/total" (missing → 0), Bidding Starts At / Ends At (DATE_TIME or "-") — src/views/projectDetails/components/publishedStagesTable.jsx:31-99
2. [state] Clicking a draft rfq→auction stage opens the create screen with `draftEventId` (no auction-team check); other stages switch tab — src/views/projectDetails/components/publishedStagesTable.jsx:15-29
Gaps: the project card routes the same draft stage with `draftStageIds` and only for auction-team users, this table with `draftEventId` for anyone — src/views/projectDetails/components/publishedStagesTable.jsx:16-25 vs src/views/orders/components/projectCard/projectCard.jsx:170-187
Cites: src/views/projectDetails/components/publishedStagesTable.jsx:14-118

### NFA History panel — award proposal versions on project details
Rules:
1. [config] Panel shown only with user flag `isNfaHistoryEnabled` and at least one approval request whose `approval_key_attribute = close_event_group` — src/views/projectDetails/projectDetails.jsx:697-721, src/redux/project/selectors.js:1016, 1080-1087
2. [calculation] Version numbers run per lot (no lot = one bucket), V1 = oldest `started_at`; table sorted newest first — src/redux/project/selectors.js:1100-1123, 1130-1133
3. [calculation] Action By/On/Remark: withdrawn → `withdrawn_approval_data` (unix seconds or ms detected by < 1e12); rejected/completed → latest approver trail entry, all remarks joined by "; "; other statuses blank — src/redux/project/selectors.js:1020-1076, 1124-1145
4. [visibility] Status tags: requested/pending/scheduled → "In progress", rejected → "Rejected", withdrawn → "Withdrawn", completed/selected → "Approved", expired → "Expired"; Lot column only when a row has a lot — src/views/projectDetails/constants.js:16-26, src/views/projectDetails/components/nfaHistoryTable.jsx:41-62, 119-124
5. [visibility] "View NFA" opens the proposal page (`?lotNo=` when lot) or Reorder Approvals for reorder requests, in a new tab — src/views/projectDetails/components/nfaHistoryTable.jsx:11-22, 99-116
Cites: src/views/projectDetails/components/nfaHistoryTable.jsx:26-143

### Start Awarding button (Master QCS) — when the buyer may open awarding
Rules:
1. [visibility] "Start Awarding" shows only on Project Details' Master QCS when no proposal exists for this lot (no lot → first proposal) — src/components/masterQcs/masterQcs.jsx:266-286
2. [state] Disabled when project `isProjectOnHold`, any stage (of this lot) is draft, the project is not the latest version, the lot's `is_awarding_allowed` is false, or config `should_allow_awarding` is false (default true) — src/components/masterQcs/masterQcs.jsx:322-338, src/viewModels/project/useMasterQcsViewModel.js:151-152
3. [visibility] Tooltip: draft → "An event in your project has not been published yet!"; old version → "Awarding is only allowed for the latest version"; other → "Some events are currently live, you cannot start awarding!" — src/components/masterQcs/masterQcs.jsx:405-415, src/translations/en.json:2912-2914
Cites: src/components/masterQcs/masterQcs.jsx:266-415

### Start Awarding — justification check, BOQ menu, backend gap
Rules:
1. [state] Vendors with a pending `bid_justification` request → justification modal instead of navigating to `/awarding/:id?lotNo=` — src/components/masterQcs/masterQcs.jsx:340-343, 731-742
2. [config] `allowSheetAwarding` + BOQ project → menu "Manual Award" / "Awarding with Excel" (both disabled together with the button) — src/components/masterQcs/masterQcs.jsx:949-990
Gaps: POST `/api/proposal` (proposal#create) has no on-hold, draft-stage or `should_allow_awarding` check — only active/latest/permission/573/720 — test direct award on an on-hold project or one with a draft stage — backend-digest/evaluation-award.md "proposal#create", procol-backend app/policies/event_group_policy.rb:37-40, 68-70 (no hold check in proposal_controller/proposal_helper)
Cites: src/components/masterQcs/masterQcs.jsx:322-415, 940-1030

### Existing proposal button — "Bid Selection Proposal" / "Contract"
Rules:
1. [visibility] When a proposal exists the Master QCS shows "Bid Selection Proposal" (or "Contract" when contracts are available and `contracts_uuids` exist) with a status tag — src/components/masterQcs/masterQcs.jsx:350-352, 1014-1030
2. [state] Draft proposal → `/awarding/:id?lotNo=`; non-draft → `/project/:id/proposal/:proposalUuid?lotNo=`; contracts non-draft → `/contract-details?contracts_uuids=` — src/components/masterQcs/masterQcs.jsx:354-391
3. [visibility] Proposal status copy: draft "Draft", requested "Approval in Progress", selected "PO Generated", rejected "Rejected" — src/views/projectDetails/constants.js:85-97
Cites: src/components/masterQcs/masterQcs.jsx:354-391

### Awarding page /awarding/:id — draft proposal is created on open
Rules:
1. [permission] Route `/awarding/:id` uses key `whats_new:read_record` (not a trade permission) — src/app/routes/routeConfigs.js:746-753
2. [side-effect] On mount POST `/proposal` `{event_group_uuid, lot_no (from ?lotNo), is_awarding_with_excel}`; the page renders nothing until it returns — src/views/awardingFlow/awardingFlow.jsx:66-93, src/redux/project/actions.js:439-455
3. [state] Error → redirect to `/project/:id/details` (backend 573/720/455 messages come from the shared error toast); thrown error → "Failed to create proposal" and history back — src/views/awardingFlow/awardingFlow.jsx:70-87
Gaps: opening `/awarding/:id` directly skips every Start Awarding gate (on hold, draft stage, old version, should_allow_awarding) — the backend must refuse; see Start Awarding — src/views/awardingFlow/awardingFlow.jsx:66-90
Cites: src/views/awardingFlow/awardingFlow.jsx:18-164

### Awarding page — totals strip and Awarded Vendors summary
Rules:
1. [calculation] "Tot. selected line items" = `total_awarded_line_items` (default 0) / number of rows in the awarding sheet — src/views/awardingFlow/awardingFlow.jsx:99-104, src/redux/project/selectors.js:1213-1214
2. [visibility] "Tot. Proposal Value", "Tot. L1 Proposal Value", "Tot. Non L1 Proposal Value" print `proposal_values.total_proposal_value / total_l1_proposal / total_non_l1_proposal` as sent by the backend (no client rounding/currency); "-" before a proposal exists — src/views/awardingFlow/awardingFlow.jsx:105-123, src/redux/project/selectors.js:1162-1208
3. [calculation] "Awarded Vendors (a/b)": a = entries of `vendor_wise_information`, b = all vendor layers in the sheet; "Calculating ..." while the proposal refetches — src/views/awardingFlow/awardingFlow.jsx:59-65, 151-159, src/redux/project/selectors.js:1149-1158
4. [visibility] Summary card per vendor: name, vendor code, tag, "L1 Amount", "L1 Items Awarded", "Non L1 Amount", "Non L1 Items Awarded", "Total Amount", "Awarded Items"; none → "No vendors awarded" — src/views/awardingFlow/constants.jsx:13-25, src/views/awardingFlow/awardingSummarySection.jsx:45-96
Cites: src/views/awardingFlow/awardingFlow.jsx:95-162

### Awarding sheet — loading, layout and hidden columns
Rules:
1. [side-effect] GET `/event_groups/:id`, then the awarding schema (`viewType = awarding`, `lotNo`); each vendor's bid is fetched only when its column first becomes visible — src/views/awardingFlow/awardingQCS.jsx:213-227, 511-534
2. [config] Vertical view unless config `horizontal_qcs_default`; user can toggle — src/views/awardingFlow/awardingQCS.jsx:142-144, 511-521, 625-655
3. [side-effect] Hiding columns saves `{columns, type: proposal}` to the server 800 ms after the last change; failure restores saved hidden set — src/views/awardingFlow/awardingQCS.jsx:322-353
4. [visibility] Non-BOQ events add a "Selection" column; BOQ events award per vendor in the header — src/views/awardingFlow/awardingQCS.jsx:76-84, 428-430
5. [visibility] No bids → "No bids are placed yet!"; excel-awarded proposal shows "Awarding is done via the award sheet. To change it, upload a revised sheet." — src/views/awardingFlow/awardingQCS.jsx:656-662, 747-754
Cites: src/views/awardingFlow/awardingQCS.jsx:86-560

### Line-item award checkbox — select / unselect a vendor for one line
Rules:
1. [visibility] Cell text: "Deleted" (item inactive/deleted), "Regretted" (item status regretted or score label Regret), "Technically not acceptable" (TNA), "Awarded", else "Select for Awarding" — src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx:174-188
2. [state] Checkbox disabled when the score label is TNA or the item is inactive/deleted/regretted — src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx:106-129
3. [validation] Score missing (or lot score missing when `rfp_evaluation_mode = lot`) → confirm "TR is pending for this line item. Are you sure you want to proceed?" — src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx:131-145, 213-222
4. [side-effect] POST `/proposal/:id/add_response?lot_no=` `{responses:{<vendor>:{action:"add"|"remove", egli_uuids:[line]}}}`; then that vendor's bid and GET `/proposal/:id` refetch; error → optimistic tick reverted — src/views/awardingFlow/awardingQCS.jsx:264-318, src/redux/project/actions.js:483-541
Cites: src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx:89-243

### TNA / Regret awarding — client always blocks TNA, backend only with a config
Rules:
1. [state] Client disables a TNA-scored line regardless of company config `restrict_awarding_for_tna_vendors` or round `misc.allow_tna_vendors_to_bid` — src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx:128-129
2. [state] A line scored Regret is labelled "Regretted" but its checkbox stays ENABLED (only TNA/deleted/regretted-status disable it) — src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx:111-112, 128-129, 178-180
3. [state] Vendor "Select All" skips lines scored TNA or Regret and deleted/inactive/regretted lines — src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:962-980
Gaps: backend blocks TNA/Regret (1134-1137) only when `restrict_awarding_for_tna_vendors` is on, so with it off a TNA line can be awarded via POST add_response though the UI never allows it; with it on, a Regret line can be ticked in the UI and must return 1136 — backend-digest/evaluation-award.md "add_response part 3"; client inconsistency single-cell vs select-all — comparisonSelectionFormatter.jsx:128-129 vs comparisonHeaderFormatter.jsx:976-977
Cites: src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx:106-188

### Partial / over-awarding quantity popup
Rules:
1. [config] Popup only when project config `is_partial_awarding_enabled` OR `is_over_awarding_allowed` and the line is not yet awarded — src/views/awardingFlow/awardingQCS.jsx:155-158, src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx:197-211
2. [visibility] Title "Are you sure you want to award this vendor?", field "Quantity Offered *" pre-filled with the vendor's `participant_quantity` and unit suffix; info "TR is pending for this line item." when unscored — src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx:29-74
3. [validation] "Award" disabled when `!Number(qty)`: empty, 0 or non-numeric; NO upper bound, negatives and decimals pass — src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx:57-63
4. [state] Cancel resets to the offered quantity; un-awarding sends the line's current `awarded_quantity` with action remove — src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx:49-55, 147-157
Gaps: a negative quantity (e.g. "-5") is sent; backend `validate_awarding_quantity` only checks sums against the ceiling, so negatives pass with partial or over-awarding on — procol-backend app/helpers/api/proposal_helper.rb:811-844; over-awarding on without PR link has no ceiling at all — :834-835
Cites: src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx:18-87

### add_response payload — when awarded_quantity is sent
Rules:
1. [calculation] Non-BOQ: `awardedQuantity` truthy → `egli_data:{<line>:{awarded_quantity}}` (or a map for select-all); falsy (0/null/undefined) → `egli_uuids:[...]` with no quantity — src/redux/project/actions.js:505-529
2. [calculation] Without partial/over-awarding config the single-cell award always passes quantity 0 → `egli_uuids` path → backend compares bid quantities (561 when others' + this bid qty > line qty) — src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx:147-157, procol-backend app/helpers/api/proposal_helper.rb:839-842
3. [calculation] BOQ / lot awarding sends only `{action}` (backend awards all lines the vendor bid on) — src/redux/project/actions.js:502-505, src/views/awardingFlow/awardingQCS.jsx:271-272
Gaps: `awarded_quantity: 0` can never be produced by the UI (blocked at 57-63 and dropped at actions.js:512) — the backend's 0-quantity award (full bid value added) is API-only — backend-digest/evaluation-award.md "Award with zero quantity"
Cites: src/redux/project/actions.js:483-547

### Vendor "Select All" for awarding
Rules:
1. [config] Shown only when user flag `enable_select_all_items_for_awarding`, trade mode, vendor not blacklisted, proposal not excel-awarded, at least one awardable line, and not lot awarding — src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:982-988, src/redux/user/index.js:537
2. [calculation] Sends only lines whose current (optimistic or saved) state differs; quantity per line = `participant_quantity` when selecting, `awarded_quantity` when unselecting — src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:990-1029
3. [visibility] Master checkbox is checked when every awardable line is awarded — src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:1033-1041
Gaps: select-all always sends `egli_data.awarded_quantity` (even with partial and over-awarding both off), which puts the backend on its "quantity sent, no config → NO check" branch, skipping the bid-quantity over-award 561 that the single checkbox triggers — comparisonHeaderFormatter.jsx:1011-1027, procol-backend app/helpers/api/proposal_helper.rb:822-838
Cites: src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:962-1041

### Blacklisted vendors on the awarding sheet
Rules:
1. [state] Vendor status blacklisted → partial-quantity popover never opens and its checkbox is disabled; BOQ vendor checkbox disabled; Select All hidden — src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx:78-84, src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:801-811, 985, src/components/dataGrid/formatters/helpers.js:15-16
Gaps: in the plain (no partial/over config) mode the line checkbox ignores blacklisting (`disabled={isCellDisabled}` only), so a blacklisted vendor can be added; backend only refuses at award close (755 "Can't select bid of a blacklisted vendor") — add_response accepts it — src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx:213-229, backend-digest/evaluation-award.md "proposal#submit part 4"
Cites: src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx:127, 197-229

### BOQ lot awarding and Discard Proposal
Rules:
1. [visibility] BOQ projects: vendor header shows a checkbox "Select for awarding" / "Awarded"; unscored vendor → confirm "TR is pending for this vendor. Are you sure you want to proceed?" — src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:789-815, 1545-1557
2. [state] Vendor checkbox disabled when the proposal is excel-awarded (`is_awarding_with_excel`) or vendor blacklisted — src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:790, 801-811
3. [side-effect] After a BOQ award the awarding schema is refetched — src/views/awardingFlow/awardingQCS.jsx:306-316
4. [config] "Discard Proposal" only when `allowSheetAwarding` and BOQ project: POST `/proposal/discard_draft_proposal` `{proposal_uuid}` → "Draft proposal discarded" and back — src/views/awardingFlow/awardingQCS.jsx:355-366, 664-672, src/models/project/projectService.js:159-164
Gaps: backend discard has no creator check (any company user may discard another's draft) — backend-digest/evaluation-award.md "discard_draft_proposal"; the UI only exposes it on BOQ+sheet-awarding — src/views/awardingFlow/awardingQCS.jsx:664
Cites: src/views/awardingFlow/awardingQCS.jsx:355-366, 656-730

### Awarding next step — Create Proposal / Create PO / Create Contract
Rules:
1. [config] Config `skip_custom_po` → "Create Proposal", else "Create PO"; with `isContractAvailable` a "Proceed" menu adds "Create Contract" — src/views/awardingFlow/awardingQCS.jsx:153-154, 673-729
2. [validation] Create Proposal: GET `/proposal/:id`; no `egli_uuids` → "Please award for at least one Vendor"; else → `/project/:id/proposal/:proposalId` — src/views/awardingFlow/awardingQCS.jsx:368-389
3. [side-effect] Create PO: "Redirecting you to PO form..." + POST `/proposal/:id/create_po_form?` → `/po-form/:proposalId`; Create Contract: POST `/proposal/:id/create_contract_form` → `/contract-form/:proposalId` — src/views/awardingFlow/awardingQCS.jsx:391-426, src/models/project/projectService.js:194-206
Gaps: Create PO / Create Contract have no "at least one vendor" check; backend only refuses partial awards with 791 when `disallow_partial_line_item_awarding` is on — test create_po_form on an empty proposal — src/views/awardingFlow/awardingQCS.jsx:391-407, backend-digest/evaluation-award.md "create_po_form"
Cites: src/views/awardingFlow/awardingQCS.jsx:368-430

### Proposal (NFA) page — route, loading and who sees Submit
Rules:
1. [permission] `/project/:id/proposal/:proposalId` uses key `whats_new:read_record` — src/app/routes/routeConfigs.js:770-777
2. [side-effect] Loads GET `/proposal/:proposalId`, GET `/event_groups/:id`, the schema with `viewType = proposal`, proposal remarks, and (draft only) GET `/event_groups/:id/get_approvals?lot_no=` — src/views/projectProposal/projectProposal.jsx:624-634, 757-776, 822-826, src/viewModels/project/useProjectProposalViewModel.js:70-74
3. [visibility] Draft → "Submit Proposal" button for ANY viewer; non-draft → "Go back to project", NFA version dropdown, report buttons, and (requested + viewer is creator) a "Withdraw Proposal" menu — src/views/projectProposal/projectProposal.jsx:289, 316-318, 872-925
4. [config] "ARN Report" with `arnReportEnabled` (first stage); "Report" with config `allow_download_awarding_proposal_report` (category = first `applicable_report_types`, else awarding proposal report), PDF — src/views/projectProposal/projectProposal.jsx:705-749
Gaps: Submit is offered to non-creators; backend proposal#submit returns 2 "Insufficient parameters" for anyone but the creator — src/views/projectProposal/projectProposal.jsx:872-880, procol-backend app/controllers/api/proposal_controller.rb:82-83
Cites: src/views/projectProposal/projectProposal.jsx:229-330, 855-930

### Proposal page — Overview and Allocation Summary panels
Rules:
1. [visibility] Overview: selected line items `a/b`, Tot. Proposal / L1 / Non L1 values (raw backend strings), "DDP Amount with Loading with Tolerance" only when present, RFX No + link, "Proposal Recommended By", approval workflow name and conditions — src/views/projectProposal/projectProposal.jsx:1012-1089
2. [visibility] Allocation Summary columns: Name of the Proposed Vendor, Total Items selected, L1 / Non L1 Items selected, Total / L1 / Non L1 Amount, Payment Terms — only columns whose key exists on the FIRST vendor row — src/views/projectProposal/allocationColumns.js:1-42, src/views/projectProposal/projectProposal.jsx:297-307, 1091-1110
3. [calculation] Condition text: selection → "(<name> is A or B)"; range → "is more than X and less than Y" with X/Y in the default currency locale (`comma`); 1 condition drops brackets; ≥3 → "<first> + N more" tooltip — src/views/projectProposal/projectProposal.jsx:127-183, src/utils/index.js:288-296
Gaps: allocation cells use `value || "-"`, so a real 0 (e.g. 0 L1 items, ₹0) renders "-"; a range starting at 0 is printed as "less than Y" — src/views/projectProposal/allocationColumns.js:10-35, src/views/projectProposal/projectProposal.jsx:153-158
Cites: src/views/projectProposal/projectProposal.jsx:1012-1110

### Proposal page — Comparison Sheets, Participants, Order Allocation, Technical panels
Rules:
1. [visibility] Comparison Sheets: one row per stage (lot proposals keep the lot's stages plus non-RFQ/auction stages), then Master QCS, then "Proposed PO form" unless `skip_custom_po` — src/views/projectProposal/projectProposal.jsx:494-610
2. [state] "Download" per stage only when its uuid is in `report_status_data.active_report_stage_uuids`; Master QCS download only when `master_qcs_report_status` — src/views/projectProposal/projectProposal.jsx:514-541, 554-577
3. [config] Technical Specification panel only with config `show_technical_qcs_in_proposal` and the RFP stage has `bid_count > 0` — src/views/projectProposal/projectProposal.jsx:612-618, 801-811, 1194-1215
4. [visibility] Unresolved comment strip: "<n> unresolved comments need resolution, Please take action immediately." — src/views/projectProposal/projectProposal.jsx:828-845
Gaps: row title is `${PROJECT_STATES[rfx_mode]?.label} QCS` || title — always truthy, so an unknown mode prints "undefined QCS" — src/views/projectProposal/projectProposal.jsx:518
Cites: src/views/projectProposal/projectProposal.jsx:494-618, 1149-1218

### Proposal page — Note for Approval document (NTD)
Rules:
1. [config] Config `ntd_required_on_proposal` → "Document" panel; templates GET `/templates/?type_identifier=document` (first saved template default), form GET `/documents/reference_forms?template_uuid=&resource_type=Proposal&resource_uuid=` — src/views/projectProposal/projectProposal.jsx:650-673, 778-799, 959-1010, src/models/project/projectService.js:253-267
2. [side-effect] Each changed section autosaves PUT `/documents/draft_document_response` `{forms_data, resource_type:"Proposal", resource_uuid}` — src/views/projectProposal/projectProposal.jsx:462-492, src/models/project/projectService.js:244-248
3. [validation] Submit with NTD: required-field errors → "Please fill all the required fields"; then `skip_custom_po` → approval modal, else Create PO form — src/views/projectProposal/projectProposal.jsx:380-400
4. [state] Document is read-only once the proposal is not draft — src/views/projectProposal/projectProposal.jsx:1005-1006, 686-697
Cites: src/views/projectProposal/projectProposal.jsx:380-410, 959-1010

### Submit Proposal modal — approval flow choice, remarks, attachments
Rules:
1. [side-effect] Opening calls GET `/proposal/:id/approval_workflows`; first flow preselected; ≤1 flow → summary at once and button "Submit Proposal", else "Next" then "Back"/"Submit Proposal" — src/views/projectProposal/projectProposal.jsx:401-409, src/views/awardingFlow/approvalFlowSelection.jsx:43-57, src/views/awardingFlow/approvalModal.jsx:71-80
2. [validation] A step with `config.approver_select` and no chosen approver → "Please select at least one approver to proceed." — src/views/awardingFlow/approvalModal.jsx:88-111
3. [visibility] Banner "Submitting this proposal will revoke all active counter offers in this project."; no flow → "No approval will be triggered as no approval workflows are found" — src/views/awardingFlow/approvalModal.jsx:225-238, src/views/orderDetails/approvalFlowSelection/approvalFlowSummary.jsx:244-262
Cites: src/views/awardingFlow/approvalModal.jsx:23-149

### Submit Proposal modal — request, remarks and attachment limits
Rules:
1. [side-effect] POST `/proposal/:id/submit` `{approval_flow_uuid, attachments, remarks, step_uuid_vs_user_uuid, peer_uuid}`; "Proposal submitted successfully" → NTD: refetch, else "Redirecting to events screen..." and `/orders` after 1.5 s — src/redux/project/actions.js:379-400, src/views/awardingFlow/approvalModal.jsx:112-145
2. [validation] "Closing Remarks" optional; attachments unlimited client-side — backend >10 → 472 "You can attach a maximum of 10 files. Please remove some attachments and try again." — src/views/orderDetails/approvalFlowSelection/approvalFlowSummary.jsx:159-207, procol-backend app/controllers/api/proposal_controller.rb:87-90
Gaps: Submit is not disabled while an attachment is still uploading (file silently dropped); `send_loa` is never sent from this modal — src/views/awardingFlow/approvalModal.jsx:213-219, src/redux/project/actions.js:386-392
Cites: src/views/awardingFlow/approvalModal.jsx:23-262

### Proposal approvals sidebar — list and polling
Rules:
1. [time] Non-draft proposal: GET `/event_groups/:id/get_approvals?lot_no=` on open and every 30000 ms — src/views/projectProposal/approvalSection/approvalSection.jsx:22, 75-95
2. [visibility] Pending requests listed first; if none, only the latest completed one; the rest under "Request History (n)"; the request for the proposal being viewed is always pinned and bannered "Currently Viewing Approval" — src/views/projectProposal/approvalSection/helpers.js:11-39, src/views/projectProposal/approvalSection/approvalCard.jsx:93-96, 215-219
3. [visibility] Draft proposal: sidebar only when the approvals list is non-empty; empty list text "No approval found for this trade." — src/views/projectProposal/projectProposal.jsx:636-638, src/views/projectProposal/approvalSection/approvalSection.jsx:271-279
4. [visibility] Comments tab badge = remarks with `additionalRequestResolution = requested` — src/views/projectProposal/approvalSection/approvalSection.jsx:284-316
Gaps: the "View details" drawer for bid approvals checks `APPROVAL_TYPE.bidSelect`, which is not defined in projectProposal/constants (only create_trade/close_trade/close_event_group), so it is dead code — src/views/projectProposal/approvalSection/approvalSection.jsx:243-252, src/views/projectProposal/constants.js:6-10
Cites: src/views/projectProposal/approvalSection/approvalSection.jsx:26-323

### Approve / Reject an award proposal (proposal page approval card)
Rules:
1. [validation] Remarks required for BOTH actions: blank → "Remark is necessary for approval" / "Remark is necessary for rejection" — src/views/projectProposal/approvalSection/approvalCard.jsx:102-107, 390-399, src/translations/en.json:1097-1098
2. [side-effect] POST `/approval_workflow/approval_requests/resolve_approval` `{approver_uuid, resolution: "accepted"|"not_accepted", remarks (trimmed), attachments}`; toast "Approval request accepted"/"Approval request rejected"; approvals refetched without `lot_no` — src/redux/pendingTasks/api.js:21-30, src/redux/pendingTasks/actions.js:43-64, src/views/projectProposal/approvalSection/approvalCard.jsx:109-131
3. [visibility] Remarks box and buttons only when the viewer is a current approver (`approverId`) — src/views/projectProposal/approvalSection/approvalCard.jsx:348-428
Gaps: backend requires remarks only for `not_accepted` (blank → 2 "Insufficient parameters") and rejects other resolutions with 734 "Invalid resolution value. Please choose either Approve or Reject." — approve with blank remarks via API must succeed; the home approvals drawer also allows it — procol-backend app/controllers/api/approval_workflow/approval_requests_controller.rb:6-8, 256-263
Cites: src/views/projectProposal/approvalSection/approvalCard.jsx:61-433

### Withdraw a submitted proposal request
Rules:
1. [permission] "Withdraw Proposal" menu only when proposal status = requested AND the viewer's uuid = proposal creator — src/views/projectProposal/projectProposal.jsx:316-318, 911-924
2. [validation] "Withdraw Request" disabled when the reason is blank after trim AND no attachment ("Reason *") — src/views/projectProposal/withdrawApprovalModal/withdrawApprovalModal.jsx:25, 57-70
3. [side-effect] POST `/approval_workflow/approval_requests/:id/withdraw_approval` `{remarks (trimmed), attachments}` → "Proposal withdrawn successfully" → Master QCS tab — src/views/projectProposal/withdrawApprovalModal/api.js:4-9, src/views/projectProposal/withdrawApprovalModal/mutation.js:4-15, withdrawApprovalModal.jsx:36-45
4. [state] Backend: only a `pending` request raised by the same user, else 4 "Request not found" — procol-backend app/controllers/api/approval_workflow/approval_requests_controller.rb:177-198
5. [visibility] Withdrawn proposal banner: "This proposal has been withdrawn by the initiator <name> at <DATE>." with remarks truncated at 400 chars and attachments — src/views/projectProposal/projectProposal.jsx:185-215, 931-935
Cites: src/views/projectProposal/withdrawApprovalModal/withdrawApprovalModal.jsx:14-87

### NFA version dropdown on the proposal page
Rules:
1. [config] Shown on non-draft proposals with `isNfaHistoryEnabled`; lists only versions of the current lot (proposal lot, else `?lotNo`) as "Version N" + status tag; current version disabled — src/views/projectProposal/projectProposal.jsx:355-362, 890-896, src/views/projectProposal/nfaVersionDropdown.jsx:18-47
2. [state] Picking a reorder version → `/reorder-approvals?approval_uuid=`; else the other proposal page with `?lotNo=` — src/views/projectProposal/projectProposal.jsx:335-353
Cites: src/views/projectProposal/nfaVersionDropdown.jsx:1-50

### Home approvals drawer — award approvals outside the event
Rules:
1. [time] Pending approvals polled every 60000 ms and when the drawer opens; never for Procol employees; a bell plays when the count grows — src/views/approvalsDrawer/approvalsDrawer.jsx:51-80
2. [validation] Approval-request (v2) cards: remark required only to Reject ("Remark is necessary for rejection"); Approve with blank remark allowed — src/views/approvalsDrawer/components/approvalCard.jsx:287-308, 414-450
3. [config] Legacy (additional request) cards require a remark to accept only when `is_remark_required_to_accept_approval` — src/views/approvalsDrawer/components/approvalCard.jsx:97-115, 206-247
4. [visibility] close_event_group card "View more details" → `/project/<event_group_uuid>/proposal/<item_uuid>`; technical evaluation → `/tr-approval-qcs/:id` — src/views/approvalsDrawer/components/approvalCard.jsx:311-345
Gaps: drawer approve has no remark rule while the proposal page demands one (same API); the drawer's proposal link omits `?lotNo=` that the approval-requests list adds — src/views/approvalsDrawer/components/approvalCard.jsx:324-328 vs src/views/approvalRequests/columns.jsx:100-113; Approve button is not disabled by `loading` (double submit) — approvalCard.jsx:444-448
Cites: src/views/approvalsDrawer/approvalsDrawer.jsx:37-145

### Approval Note page — flexi record approval
Rules:
1. [permission] `/approval_note/:dataSourceId/:id` uses key `whats_new:read_record` — src/app/routes/routeConfigs.js:872-879
2. [side-effect] GET `/fx_responses/:id/get_approvals`, GET `/remarks?item_type=FxResponse&item_uuid=:id`; comments POST `/remarks` `{item_type:"FxResponse", item_uuid, event_type:"intake_message", remark, attachments}` — src/views/approvalNote/query.js:34-51, src/views/approvalNote/mutation.js:6-25, src/services/api.js:478-483
3. [visibility] Overview uses the FIRST approval request: Status tag pending "Pending", completed "Approved", rejected "Rejected", draft "Active"; Creator; "Approval Note" panel only when that request has remarks — src/views/approvalNote/approvalNote.jsx:40-45, 71-74, 173-223
4. [visibility] Approvals sidebar only when approval requests exist; details rendered read-only scoped to the approval company's `tenant_uuid` — src/views/approvalNote/approvalNote.jsx:229-247, 262-293
Cites: src/views/approvalNote/approvalNote.jsx:47-300

### NFA attachments component
Rules:
1. [visibility] Shows the first file (name truncated to 7 chars, tooltip full) and "+N more" popover listing the rest (truncated to 10 chars); click opens the media viewer; remove icons only when a remove handler is passed (editable contexts) — src/components/nfaAttachments/nfaAttachments.jsx:10-119
2. [validation] Withdraw modals pass no `maxFilesLimit`, so the attachment count is unlimited there — src/components/customRemarkComponent/customRemark.jsx:26-44, src/views/projectDetails/components/withdrawProjectModal.jsx:73-82
Cites: src/components/nfaAttachments/nfaAttachments.jsx:40-119

### Dates and numbers on these screens
Rules:
1. [time] All dates use `appFormatDate`: company date format (default "DD MMMM YYYY hh:mm:ss A"; DATE_TIME drops seconds), browser local timezone via moment; numeric input ≤10 digits treated as unix seconds, longer as ms; empty → "-" — src/utils/index.js:1227-1242, 1270-1277, 1327-1375
2. [calculation] Awarding/proposal money totals and per-vendor amounts are displayed exactly as the backend formats them (no client rounding, currency or precision) — src/views/awardingFlow/awardingFlow.jsx:105-123, src/views/awardingFlow/awardingSummarySection.jsx:35-40, src/views/projectProposal/allocationColumns.js:22-35
3. [calculation] Only approval-condition ranges are formatted client-side with `Intl.NumberFormat` in the default currency locale and its default precision — src/utils/index.js:288-296, src/views/projectProposal/projectProposal.jsx:148-150
Cites: src/utils/index.js:1227-1375
