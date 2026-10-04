# Event create / edit screens — frontend digest (procol-client-dashboard 9776df3cd, 2026-08-11)

## Overview
The buyer console's event CREATE / EDIT screen. One route (`/orders/quick-create`) renders `src/views/projectCreation/projectCreation.jsx` (the eRFX project shell: title, line items, stage tabs, schedule drawer, publish) which mounts `src/views/eventCreation/eventCreation.jsx` once per stage (template, sheet, strategy drawer, participants, footer). Technical (RFP) stages use `src/views/rfiBuilder/**`; savings use `src/components/savingsDrawer/savingsDrawer.jsx`. Stage validation is `getStageWiseErrors` and payload building is `getOrderPayload` (`src/views/projectCreation/helpers.js`), turned into the wire format by `getParsedSheetData` (`src/redux/orders/helpers.js:786-1177`). HTTP goes through `src/models/orders/ordersService.js` and `src/models/project/projectService.js`. Company behaviour comes from `GET /v1/trade/new_request_config` (mapped in `src/redux/orders/selectors.js:704-744`) and dashboard user flags (`src/redux/user/index.js:498-531`). This file builds on `../frontend-test-cases.md` (FE-x.y) and `../create-screen-contract.md` and does not repeat them; backend references point to `../backend-digest/*.md`.

### Route /orders/quick-create — which screen, which permission, which URL flags
The "New Event" route; also reached from RFQ→Auction conversion, PR→event, draft reopen and "Add new stage".
Rules:
1. [permission] `/orders/quick-create` (ROUTE_KEYS.CREATE_QUICK_ORDERS) needs the `trade:create_record` route key and renders AsyncProjectCreation; `/orders/create` (same key) renders the legacy createOrder screen — src/app/routes/routeConfigs.js:353-367
2. [config] `projectCreation=true` in the URL while the user's `rfx_project_enabled` flag is off → the screen redirects to plain `/orders/quick-create` (single-stage mode, no stage tabs, no project title) — src/views/projectCreation/projectCreation.jsx:1923-1927
3. [state] URL flags read on mount: `title`, `useRfqQuotes`, `allowTnaVendorsToBid`, `useRfqWeights`, `useRfqParticipants`, `isRfqToAuction`, `fromPR`, `projectCreation`, `boqProject`, `singleStage`, `recreate`, `projectId`, `isAddNewStage`, `draftStageIds` (comma list), `isEditingAllowed` — src/views/projectCreation/projectCreation.jsx:253-281
4. [state] `isEditingAllowed=false` OR `isAddNewStage=true` OR `isRfqToAuction=true` → project T&C modal opens read-only — src/views/projectCreation/projectCreation.jsx:280-283, 3316-3327
5. [state] `draftStageIds` without `projectId` → single draft stage is loaded and its title becomes the project title; with `projectId` → every listed stage is loaded and the last one is selected — src/views/projectCreation/projectCreation.jsx:2244-2257, 1157-1161, 1437-1445
Cites: src/app/routes/routeConfigs.js:353-367, src/views/projectCreation/projectCreation.jsx:253-305

### Create screen — API calls made on load (config, project, drafts, templates)
What the screen fetches before the user does anything.
Rules:
1. [side-effect] On mount (not from PR) → `GET /v1/trade/new_request_config?additional_fields=terms_and_conditions` with `filters={"for_boq_based_project":true}` only for BOQ projects; filters are JSON spliced into the URL unencoded — src/views/projectCreation/projectCreation.jsx:2139-2148, src/redux/orders/actions.js:413-440, src/models/orders/ordersService.js:39-44
2. [side-effect] `projectId` in URL → `GET /event_groups/:id` (title, T&C clauses, `t_and_c` attachments, project attachments, `config.schedule_template_config`, `config.rfp_evaluation_mode`) — src/views/projectCreation/projectCreation.jsx:2150-2202, src/models/project/projectService.js:70
3. [side-effect] Draft project reopen → `GET /event_groups/:id/get_line_items?filters={}&prevent_pagination=true`; a response without a `data` array navigates back with toast "Error while loading draft project" — src/views/projectCreation/projectCreation.jsx:1413-1423, src/redux/project/actions.js:291-306
4. [side-effect] Each draft stage → `GET /v1/trade/:id/schema?response_type=template&additional_fields=order_details&l1_prices=true` (plus `&rfq_to_auction=true` when converting), then `GET /companies/audience_for_product?trade_request_uuid=<id>` — src/views/projectCreation/projectCreation.jsx:1143-1165, src/models/orders/ordersService.js:64-69, src/redux/vendors/actions.js:553-571
5. [side-effect] BOQ project (`boqProject`, no draftStageIds, not RFQ→Auction, not from PR) → `POST /event_groups` with `{status:"draft", config:{boq_based_rfx:true}}` once on mount — src/views/projectCreation/projectCreation.jsx:3085-3101, src/redux/project/actions.js:219-257
Gaps: the `fetchDraftEventDetails` failure path has no error UI (see FE-14.6) — src/views/projectCreation/projectCreation.jsx:1145-1148
Cites: src/models/orders/ordersService.js:30-69

### Publish / save — which endpoint each stage goes to
How every stage of the project is persisted when the user clicks Publish or Save as draft.
Rules:
1. [side-effect] Stage without a server id → `POST /trade/template_input?template_name=trade&additional_fields=order_details` — src/views/projectCreation/projectCreation.jsx:1826-1839, src/models/orders/ordersService.js:30-35
2. [side-effect] Stage with `backendStageId` (draft reopened / saved before) → `PATCH /trade/:id/template_input?template_name=trade&additional_fields=order_details` — src/views/projectCreation/projectCreation.jsx:1801-1820, src/models/orders/ordersService.js:352-357
3. [side-effect] `isRfqToAuction=true` and the user is NOT an auction-team user (`is_auction_team_user`) → `POST /trade/move_to_auction` with `trade_request_uuid`, `use_rfq_quotes_as_bids`, `transfer_weights`, `allow_tna_vendors_to_bid` (rules: auction-templates.md move_to_auction) — src/views/projectCreation/projectCreation.jsx:1781-1796, src/models/orders/ordersService.js:158-159
4. [side-effect] eRFX project with all stage calls OK → `PATCH /event_groups/:id` with `status:"active"` and `draft_trade_request_uuids` = the stage ids just returned — src/views/projectCreation/projectCreation.jsx:1846-1871
5. [state] Stage `status` in the payload = `"draft"` whenever a project id is attached or publishToDraft is true, else `"active"`; so eRFX stages are always created as drafts and go live only through the project PATCH — src/views/projectCreation/helpers.js:999-1000
6. [state] With `routeAuctionsToAuctionTeam` on and the user in the auction team, an existing draft stage is PATCHed WITHOUT `event_group_uuid` — src/views/projectCreation/projectCreation.jsx:1812-1815
Cites: src/views/projectCreation/projectCreation.jsx:1765-1840

### Stage wire payload — configurations block (mode, times, flags)
Fields `getParsedSheetData` writes into `configurations` of the template_input body.
Rules:
1. [calculation] `rfx_mode` = `rfq_then_auction` when converting an RFQ, else the stage mode (`auction`/`rfq`/`rfp`/`rfi`); `auction_config` = strategy, sent `undefined` for rfq/rfi/rfp — src/redux/orders/helpers.js:1046-1051, 1097-1099, src/views/projectCreation/helpers.js:920-922
2. [calculation] `bid_start_time`/`bid_end_time` are unix seconds; `extra_closing_time` = end (+cost-breakdown window) + evaluation seconds, omitted when evaluation is "Not applicable" (0) — src/redux/orders/helpers.js:1106-1108, src/views/projectCreation/components/projectScheduler/helpers.js:12-42
3. [calculation] Cost-breakdown mode: `response_review_time_for_participant` = end + costBreakdownTime and `end_time_type` = REQUEST_FOR_COST_BREAKDOWN only when strategy is rank/knockout/dutch, not basket, and fastBiddingMode on — src/views/projectCreation/helpers.js:822-827, 939-943, src/redux/orders/helpers.js:1109-1114
4. [calculation] `staggered` = serialAuction AND more than one data row; serial rows get `start_time = start + serialDuration*i`, `end_time = start + serialDuration*(i+1)`, `line_item_no` = i+1 — src/redux/orders/helpers.js:1029-1044, 1075
5. [calculation] `title` = stage title; `template_uuid` = currentTemplateId; `vendor_assessment_template_uuid` = global RFP template; `stage_no` = tab position 1..n; `event_group_uuid` = project id; `creation_flow_type` = "quick_flow" — src/redux/orders/helpers.js:1070-1127, src/views/projectCreation/helpers.js:992
6. [calculation] `delivery_schedules` = `[{delivery_by: moment(deliveryDate).unix()}]` only when "Delivery date" is ticked (quick-create only) — src/views/projectCreation/helpers.js:851, src/redux/orders/helpers.js:1102-1104
Cites: src/redux/orders/helpers.js:1053-1176

### Stage wire payload — auction numbers (knockout, dutch, traffic light, dynamic extension)
How the strategy drawer's inputs are converted before sending.
Rules:
1. [calculation] `bulk_price` = `+basePrice`, `price_difference` = `Number(knockoutTick)`, `time_difference` = `Number(knockoutTimeDiff * 60)` (minutes → seconds), `end_price` = `+endPrice`; for non-knockout strategies `bulk_price` serialises as null (NaN) and `end_price` as 0 — src/redux/orders/helpers.js:1131, 1151-1153
2. [calculation] `traffic_light_ranges` = `{lower_bound:+lower, upper_bound:+upper}` sent whenever closing is lot-based (null bounds for non-traffic strategies); omitted for line-item closing — src/redux/orders/helpers.js:1133-1139
3. [calculation] Dynamic extension preset radio values are seconds [60,120,180,300] sent as `time_extension_value` = value/60 (minutes); the Custom option (-1) sends `customDynamicClosingTime` raw (minutes) — src/views/createOrder/constants.js:70, src/views/projectCreation/helpers.js:815, 853-855
4. [calculation] `last_n_minutes_for_time_extension` = dynamicConfigurableTime, `rank_limit_for_time_extension` = Number(timeExtensionBidRevision); all three are null when the extension is off; `is_dynamic_closing_time_allowed` = enabled AND strategy not knockout/dutch AND mode auction — src/redux/orders/helpers.js:1140-1150, src/views/projectCreation/helpers.js:956-957
5. [calculation] `is_auction_on_base_price` = false for multi-product, else offersOn == base price; eRFX forces offersOn = line total before every publish, so eRFX always sends false — src/views/projectCreation/helpers.js:930-932, src/views/projectCreation/projectCreation.jsx:1773-1776
6. [calculation] Basket custom interval = customTime × slab factor (min 60, hour 3600, day 86400) → `basket_auction_time_interval` seconds; `is_basket_auction` forced false for single product — src/views/projectCreation/helpers.js:857-863, 983, src/views/createOrder/constants.js:52-68
Cites: src/redux/orders/helpers.js:1131-1162

### Stage wire payload — savings_configuration
How savings references entered in the drawer are sent.
Rules:
1. [calculation] Knockout/Dutch: `savings_comparison_on` = line-item when single product with offer on base price, lot when `savingsPrice.gross` exists, else "" ; other strategies use the drawer's radio value — src/redux/orders/helpers.js:903-915
2. [calculation] Lot ("Gross total") savings → `lot_reference_prices: [{reference_strategy_key, value}]` with any value ≤ 0 or empty sent as `null` — src/redux/orders/helpers.js:1002-1013
3. [calculation] Line-item savings → `line_item_reference_prices` per sheet row `{reference_prices:[{reference_on_key_attribute, value, reference_strategy_key}], trade_product_uuid:null}`; values are NOT filtered for ≤ 0 — src/redux/orders/helpers.js:973-990
4. [calculation] RFQ→Auction line savings are keyed by `trade_product_uuid` and only strategies holding an object are sent — src/redux/orders/helpers.js:956-972
5. [calculation] `savings_configuration` = null when savingsPrice is empty — src/redux/orders/helpers.js:917-918, 1016-1017
Gaps: lot savings ≤ 0 are silently nulled client-side but line-item savings are not; a pasted negative line value reaches the API (see savings drawer section) — src/redux/orders/helpers.js:1007-1013 vs 979-986
Cites: src/redux/orders/helpers.js:903-1018

### Stage wire payload — currency_configuration and audience
Multi-currency and participants in the template_input body.
Rules:
1. [calculation] `currency_configuration` is sent only when at least one selected currency code differs from the dashboard default currency, else null — src/redux/orders/helpers.js:855-862, 894
2. [calculation] Each allowed currency carries `rate_in_base`, `adjusted_precision` (negative values clamped to 0), `original_adjusted_precision`, `default_precision`, `symbol`, `number_system`, `currency_label`; base currency carries `global_tick_size` — src/redux/orders/helpers.js:863-892
3. [calculation] `selectedCurrencies` and `currencyMode` are dropped (undefined) for RFP/RFI stages — src/views/projectCreation/helpers.js:981-982
4. [calculation] `audience_company_uuids` = de-duplicated vendor uuids with every tag expanded to its vendors; omitted when empty — src/views/eventCreation/helpers.js:654-675, src/views/projectCreation/helpers.js:998
5. [calculation] `order_type` = "vendor_onboarding" when the template is an onboarding template, else the template's order type — src/views/projectCreation/helpers.js:991
Cites: src/redux/orders/helpers.js:855-894, 1164-1176

### Project wire payload — PATCH /event_groups/:id (publish, save draft, line items)
What `updateProject` sends.
Rules:
1. [calculation] Body: `title`, `description`, `status`, `draft_trade_request_uuids`, `audience_company_uuids`, `line_items` (kept + deleted, each `{status, uuid, quantity, product_uuid, product_quality_uuid}`), `terms_and_conditions:{clauses, attachments:[{type:"t_and_c", value:[{name, private_url}]}]}`, `show_under_open_events`, `purchase_request_uuid`, `delete_draft_stage_uuids`, `amendment_remarks:{remarks}`, `config` only when non-empty — src/redux/project/actions.js:52-88
2. [config] `show_under_open_events` defaults to `true` and is sent on every publish/save even when the "Publish as open tender" checkbox is hidden (template config `openTenderEnabled` off) — src/views/projectCreation/projectCreation.jsx:218, 1565, 1867, src/views/eventCreation/components/footer/confirmModal.jsx:30-31
3. [calculation] `terms_and_conditions` is ALWAYS present in the body, even when the caller passed no T&C (clauses undefined, attachments value []) — src/redux/project/actions.js:71-82
4. [calculation] Recurring stage → `config:{is_scheduled_template:true, schedule:{schedule_type, interval(>1 or custom), days_of_week, day_of_month|last_day, repeat_type(custom)}, ends_at, max_occurrences}` — src/views/projectCreation/helpers.js:664-712
Gaps: backend saves `show_under_open_events` with no open-tender gate, so every published eRFX project is flagged open-tender — app/services/event_groups/update_service.rb:231, 295-301 (procol-backend). Backend replaces T&C whenever `terms_and_conditions.present?`, so a line-items-only PATCH (rule 3) wipes saved project T&C clauses — app/services/event_groups/update_service.rb:80-82; candidate API test.
Cites: src/redux/project/actions.js:28-100

### New stage defaults — getNewStageData
Values every new stage starts with (before company config overrides).
Rules:
1. [config] mode `auction`, type `Rank`, strategy `rank`, closingOn `lot_based`, rfpEvaluationOn `line_item_based`, rfpCreationOn `template`, trafficType price, offersOn base price, dutchClosingOn single vendor — src/views/projectCreation/helpers.js:61-95
2. [config] Savings: savingsStrategy `lot_based`, savingsReferenceStrategy `historical_price`, savingsColumn `{budget:"price"}`, savingsOptions {budget:"Budget", historical_price:"Historical Price", existing_proposal:"Existing Proposal"} — src/views/projectCreation/helpers.js:87-94, src/components/savingsDrawer/constants.js:1-11
3. [config] Schedule: eventEndTime 1800 s relative, eventEvalTime 1800 s, costBreakdownTime 1800 s, start "now" — src/views/projectCreation/helpers.js:135-140
4. [config] dynamicClosingTime -1 (Custom), currencyMode `multiple_currencies`, isTncMandatory false, isBasketAuction false, basket/serial slab "min", autoAwardingEnabled false, recurring daily/interval 1/never — src/views/projectCreation/helpers.js:100-147
5. [config] Adding a stage via "+" overrides end/eval with `event_duration_predefined_values[mode].default_duration/default_evaluation` when configured, closingOn with `default_closing_mode`, rfpEvaluationOn with `default_rfp_evaluation_mode`, and for auction stages the DTE defaults — src/views/projectCreation/projectCreation.jsx:381-426
Cites: src/views/projectCreation/helpers.js:55-152

### Company trade config — new_request_config keys used by the create screen
Mapping of backend config keys to screen behaviour (`selectNewTradeConfig`).
Rules:
1. [config] `default_closing_mode` → closingOn of ALL stages, re-applied whenever the value changes — src/redux/orders/selectors.js:716, src/views/projectCreation/projectCreation.jsx:1951-1959
2. [config] `default_event_type` → the first stage's mode in project creation (falls back to auction) — src/redux/orders/selectors.js:717, src/views/projectCreation/projectCreation.jsx:2080-2086
3. [config] `enable_tnc_mandatory_button` → isTncMandatory of all stages; `is_payment_tnc_enabled` → Payment Terms button + mandatory check — src/redux/orders/selectors.js:718-719, src/views/projectCreation/projectCreation.jsx:1940-1949
4. [config] `is_allowed_to_modify_audience`, `is_rfp_template_edit_allowed_during_creation`, `is_publish_auction_in_draft`, `route_auctions_to_auction_team` (default false), `is_saving_configuration_mandatory` — src/redux/orders/selectors.js:720-727
5. [config] DTE defaults: `is_default_dynamic_closing_time_allowed`, `time_extension_value` (→ custom extension), `last_n_minutes_for_time_extension`, `rank_limit_for_time_extension` (stored as string), `dynamic_closing_time_strategy` — applied to auction stages only — src/redux/orders/selectors.js:731-736, src/views/projectCreation/projectCreation.jsx:1997-2050
6. [config] Auto-award is ON by default for every stage whenever `auto_award_configs` is a non-empty array — src/redux/orders/selectors.js:708-714, src/views/projectCreation/projectCreation.jsx:2052-2071
Gaps: selecting a template re-fetches config with that template's filter and the effects above rewrite closingOn / T&C of EVERY stage, not just the one being edited (unverified live) — src/views/eventCreation/templateSelection.jsx:148, src/views/projectCreation/projectCreation.jsx:1929-1959
Cites: src/redux/orders/selectors.js:704-744

### Dashboard user flags that gate the create screen
Booleans from the user/dashboard config (`state.user`).
Rules:
1. [config] `rfx_project_enabled` → eRFX (multi-stage) mode — src/redux/user/selectors.js:125
2. [config] `allow_draft_project_creation` → "Save as draft" button; `is_auction_team_user` → auction-team routing; `scheduled_events_enabled` → recurring settings; `enable_bid_masking_for_event` → Bid Masking toggle — src/redux/user/index.js:498-531
3. [config] `allowed_maximum_line_items` {boq, non_boq} → line-item limit, fallback 500 / 65 — src/redux/user/selectors.js:346-359
4. [config] `config.freeze_pr_savings_reference` → Historical Price savings tab read-only for PR-created events — src/redux/user/index.js:142-146, src/views/eventCreation/eventCreation.jsx:2366-2370
5. [visibility] Clara summary panel renders when `isClaraEnabled` is FALSE and the project has a claraSummary (FE-15.2 states the inverse) — src/views/projectCreation/projectCreation.jsx:3405-3409
Gaps: line-item limit is only client-side; backend uses `allowed_maximum_line_items` only to serve the UI — app/controllers/api/v1/users_controller.rb:593, 732 (procol-backend); POST /trade/template_input with 66+ items is a candidate API test.
Cites: src/redux/user/selectors.js:125-392

### Stage tabs — default stage, auto titles, rename
How tabs are created and named (composition rules: create-screen-contract.md).
Rules:
1. [calculation] Auto stage title = "<Label> <n+1>" where n = existing stages of that mode; for the first one the code produces "Auction " / "RFQ " / "Technical Stage " WITH a trailing space — src/views/projectCreation/helpers.js:1010-1041
2. [state] Saving the strategy drawer in project creation resets the stage title to the auto title computed with no other stages (`allModes: []`), overwriting a renamed title and its number — src/views/eventCreation/components/auctionConfiguration/auctionConfiguration.jsx:497-506
3. [validation] Rename: empty or whitespace-only input is ignored; value is trimmed; other tabs are disabled while renaming; tab label truncated to 20 chars with tooltip — src/views/projectCreation/projectCreation.jsx:3047-3057, 3443-3481
4. [state] "+" menu hidden for RFQ→Auction, Add-new-stage and amendment drafts; disabled while renaming, at 2 stages, or when editing a recurring project — src/views/projectCreation/projectCreation.jsx:3161-3201
5. [state] RFQ→Auction stage title = source title with the first "rfq" (case-insensitive) replaced by "Auction", fallback "Stage 1" — src/views/projectCreation/helpers.js:1120-1126
Cites: src/views/projectCreation/projectCreation.jsx:3047-3238

### Project header — title, attachments, T&C, Items, buttons
The header row shown only when `projectCreation` is set.
Rules:
1. [validation] Publish with empty project title → "Please fill project title!" before any other check; a whitespace-only title passes (truthiness check) — src/views/projectCreation/projectCreation.jsx:1599-1602
2. [state] Project title input is disabled when adding a new stage to an existing project — src/views/projectCreation/projectCreation.jsx:1433-1435, 3283-3292
3. [visibility] "Items N" button hidden for BOQ projects and RFQ→Auction — src/views/projectCreation/projectCreation.jsx:3329-3341
4. [visibility] "Add T&Cs" shows a green "Added" tag when clauses or attachments exist — src/views/projectCreation/projectCreation.jsx:3301-3314
5. [visibility] "Withdraw" button only on amendment drafts (`isAmendmentDraft`) — src/views/projectCreation/projectCreation.jsx:3363-3373
6. [visibility] Publish label: "Send to Auction team" when publishToDraft, "Save Recurring Event" when the CURRENT stage is recurring, else "Publish" — src/views/projectCreation/projectCreation.jsx:3390-3400
Gaps: whitespace-only project title is accepted client-side; backend event_groups update has no title check (event-groups.md) — candidate API test with `title:"   "`.
Cites: src/views/projectCreation/projectCreation.jsx:3279-3403

### Manage Line Items drawer — validation and API
The "Items" drawer that defines the project's line items (shared by all stages).
Rules:
1. [validation] Save with nothing changed (same count, product, variant, quantity per index) → drawer closes, no API call — src/views/projectCreation/components/manageLineItemsModal.jsx:83-121
2. [validation] Any quantity empty or ≤ 0 → "Please fill valid quantity on every line item"; checked BEFORE emptiness — src/views/projectCreation/components/manageLineItemsModal.jsx:90-93, 122-125
3. [validation] No items left → "Please add atleast one item to proceed!" — src/views/projectCreation/components/manageLineItemsModal.jsx:86-88, 127-130
4. [side-effect] First save → `POST /event_groups` `{status:"draft", title, line_items:[{product_uuid, quantity:{unitSymbol,value}, product_quality_uuid, serial_number, pr_line_item_uuid, pr_id}]}`; later saves → `PATCH /event_groups/:id` — src/views/projectCreation/projectCreation.jsx:2259-2269, src/redux/project/actions.js:219-257
5. [calculation] After save, an untouched empty project title is auto-generated (`use_pr_number_in_title`) — src/views/projectCreation/projectCreation.jsx:2289-2301
6. [side-effect] Product search → `GET /products/search?query=…` debounced 250 ms; first variant and first unit are preselected — src/views/projectCreation/components/manageLineItemsModal.jsx:45-81, src/redux/products/api.js:14-17
Gaps: backend accepts quantity 0 (becomes rate-only) and has no negative check at POST /event_groups — app/controllers/concerns/trade_controller_helper.rb:6303-6320 (procol-backend); candidate API tests: quantity 0 and -5.
Cites: src/views/projectCreation/components/manageLineItemsModal.jsx:83-133

### Line item row — quantity, unit, variant, delete
One row of the Manage Line Items drawer.
Rules:
1. [validation] Quantity is an InputNumber with no min and no precision limit; only `isNumber` values are stored — src/views/projectCreation/components/projectLineItem.jsx:51-67, 181-187
2. [validation] PR-created events: quantity `max` = the PR item's `quantity_open` (no tolerance) — src/views/projectCreation/components/projectLineItem.jsx:184, src/views/projectCreation/projectCreation.jsx:320-330
3. [state] Drawer disabled when fromPR, `isEditingAllowed=false` or `isAddNewStage`; variant shows "Variant of product cannot be modified", quantity/unit " 'Quantity Requested' and 'Unit of Measurement' cannot be modified" (quantity still editable when fromPR) — src/views/projectCreation/components/projectLineItem.jsx:131-143, 167-183, src/views/projectCreation/projectCreation.jsx:3571-3572
4. [state] Delete (Popconfirm "Are you sure to delete this line item?") is NOT disabled in a disabled drawer, and Save stays enabled for fromPR, so PR-created projects can delete items — src/views/projectCreation/components/projectLineItem.jsx:206-213, src/views/projectCreation/components/manageLineItemsModal.jsx:240-246
Gaps: backend allows quantity up to open qty × (1 + over_quantity_tolerance_percentage) (558) while the UI caps at open qty — trade-stages.md part 10. FE-4.5 says remove controls are inert; the code leaves delete live — projectLineItem.jsx:206-213.
Cites: src/views/projectCreation/components/projectLineItem.jsx:51-213

### Save as draft — gate, calls, messages
The "Save as draft" button of the project header.
Rules:
1. [visibility] Shown only when not RFQ→Auction, `allow_draft_project_creation` on, not (service-RFP grouping AND `groupServiceActivitiesInRfp`), auctions not routed to the auction team, and the current stage is not recurring — src/views/projectCreation/projectCreation.jsx:292-296, 3343-3345
2. [validation] Disabled with tooltip "Please select template for <stage title>" for any non-RFP stage without a template, or "Please add line items" — src/views/projectCreation/projectCreation.jsx:1457-1481
3. [side-effect] Each stage is POSTed/PATCHed with `publishToDraft:true`, its returned uuid stored as backendStageId, then `PATCH /event_groups/:id status:"draft"` with draft ids, audience, `delete_draft_stage_uuids` — src/views/projectCreation/projectCreation.jsx:1493-1569
4. [side-effect] Success → "Draft Project updated successfully" (project already draft) or "Draft Project created successfully", redirect `/orders?tab=draft`, local quick-flow draft cleared — src/views/projectCreation/projectCreation.jsx:1571-1584
5. [validation] No stage validation, title check or participant check runs before saving a draft — src/views/projectCreation/projectCreation.jsx:1493-1537
Cites: src/views/projectCreation/projectCreation.jsx:1457-1593

### Publish pre-checks — title, participants, RFP vs RFQ end time
Checks in `handleClickPublish` before per-stage validation.
Rules:
1. [validation] No participant in the project → "Please add participants to proceed!" (stops) — src/views/projectCreation/projectCreation.jsx:1604-1609
2. [time] RFP-vs-RFQ check compares the RAW `eventEndTime` of the longest RFP with the shortest RFQ; raw value is seconds-of-duration for "Duration" and a unix timestamp for "Fixed time", and start times are ignored — src/views/projectCreation/projectCreation.jsx:1610-1623, src/views/projectCreation/helpers.js:135-136
3. [time] Hit → "RFP duration exceeds RFQ end time. Please adjust." and no API call — src/views/projectCreation/projectCreation.jsx:1621-1622
4. [time] RFP vs Auction end times are never compared — src/views/projectCreation/projectCreation.jsx:1613-1615
Gaps: mixed types make the client check wrong both ways: RFP fixed-time + RFQ duration always errors; RFP duration + RFQ fixed-time never errors; RFQ starting later is ignored. Backend 712 compares real bidding ends at project publish (strict >) — event-groups.md part 3, app/services/event_groups/update_service.rb:232-233. Candidate API test: publish project with RFP end > RFQ end → 712.
Cites: src/views/projectCreation/projectCreation.jsx:1595-1623

### Publish per-stage validation — toasts and silent keys (additions to FE-11/FE-13)
Errors from `getStageWiseErrors` and their toast text.
Rules:
1. [validation] Stage title "" (auto titles are never empty; reachable in single-stage quick-create) → `errors.title`, no specific toast, only the rollup "<title> - There are some errors in Title, please check and try again" when no other toast fired; not raised for basket + multi-product — src/views/projectCreation/helpers.js:297-299, src/views/projectCreation/projectCreation.jsx:1750-1763
2. [validation] Toast "In case of single product, please choose multiple vendor closing." is wired to `errors.trafficLightMultipleVendorCLosing`, which nothing sets (dead) — src/views/projectCreation/projectCreation.jsx:1663-1668
3. [validation] `errors.closingOn` and `errors.deliveryDate` toasts do NOT set errorMsgAlreadyShown, so the rollup toast also fires — src/views/projectCreation/projectCreation.jsx:1720-1725
4. [validation] Mode trade with zero sheet rows → `errors.allTemplates` (red template box) — src/views/projectCreation/helpers.js:312-314
5. [validation] Multi-product = more than one row with a product key; closingOn undefined → "Please select closing on mode for the event" — src/views/projectCreation/helpers.js:227-228, 308-310
6. [state] A second click while `creationLoading` is ignored; publish errors stamp `errors` onto each stage — src/views/projectCreation/projectCreation.jsx:1731-1736, 1765-1766
Cites: src/views/projectCreation/projectCreation.jsx:1625-1764, src/views/projectCreation/helpers.js:154-630

### Publish result — messages, redirects, retry behaviour
What happens after the stage calls return.
Rules:
1. [side-effect] eRFX project publish OK → "Project created successfully", redirect to project details (details tab) — src/views/projectCreation/projectCreation.jsx:1873-1888
2. [side-effect] Non-project publish → "Event sent to Auction Team successfully" when publishToDraft else "Event created successfully"; eRFX redirects to the project of the first stage, classic to `/orders/:id?tab=<eventDetails>` — src/views/projectCreation/projectCreation.jsx:1891-1914
3. [state] Any stage call returning "error" → no redirect, user stays; the stage-level error toast comes from the API error handler — src/views/projectCreation/projectCreation.jsx:1842-1845, src/redux/orders/actions.js:122-147
4. [state] Publish never stores the returned stage uuids (only Save as draft does), so a retry after a failed project PATCH (e.g. 712) POSTs every stage again — src/views/projectCreation/projectCreation.jsx:1826-1839 vs 1516-1536
Gaps: duplicate draft stages on retry rely on backend silently voiding the earlier same-mode draft (part 6) or 854 when two exist — trade-stages.md part 6; candidate test: publish → 712 → fix → publish, then count stages.
Cites: src/views/projectCreation/projectCreation.jsx:1842-1921

### Confirm modal — review gate, open tender, addendum remarks
The modal opened by Publish (non-recurring).
Rules:
1. [validation] OK disabled until every stage tab was opened ("Please review all stages before publishing.") or, on amendment drafts, until "Addendum Remarks" is a non-empty string (whitespace counts) — src/views/eventCreation/components/footer/confirmModal.jsx:35-41, 188-193, 215-231, src/utils/index.js:380-381
2. [visibility] Title: "Send to Auction Team" / project title truncated to 45 / "Publish Event"; OK text "Send to Auction Team" or "Publish"; Cancel is "Edit Schedule" and opens the schedule drawer — src/views/eventCreation/components/footer/confirmModal.jsx:52-60, 91-103
3. [visibility] Per stage: "Starts on:" (date-time or "Now"), "Ending at: <date-time> (<duration>)", "Evaluation time:" when > 0, "Vendors invited:" de-duplicated count — src/views/eventCreation/components/footer/confirmModal.jsx:150-181
4. [visibility] "Publish as open tender" checkbox only when template config `openTenderEnabled`, not publishToDraft and eRFX — src/views/eventCreation/components/footer/confirmModal.jsx:30-31, 194-213
5. [time] Times are re-computed at render; "Now"-start stages show end = now + duration, and the modal does not re-check end ≥ now — src/views/eventCreation/components/footer/confirmModal.jsx:120-126
Cites: src/views/eventCreation/components/footer/confirmModal.jsx:15-235

### Recurring events — settings and confirm modal
Scheduled (recurring) projects, behind `scheduled_events_enabled`.
Rules:
1. [visibility] Recurring settings hidden when created from PR or `scheduled_events_enabled` off — src/views/projectCreation/projectCreation.jsx:3418
2. [validation] Interval InputNumber min 1, max 12 (monthly repeat), 52 (weekly), else 365; "After" occurrences min 1 max 999; "On Date" picker blocks past days and stores "YYYY-MM-DD" — src/views/projectCreation/components/projectScheduler/recurringEventSettings/recurringEventSettings.jsx:84-85, 186-187, 265-297
3. [state] Save Schedule copies the same recurring config onto every stage — src/views/projectCreation/components/projectScheduler/projectScheduler.jsx:92-106
4. [state] Recurring confirm modal has no "all stages reviewed" gate and no remarks field; it publishes with remarks "" — src/views/projectCreation/components/recurringConfirmModal/recurringConfirmModal.jsx:73-76, 155-161
5. [state] Editing a recurring project (projectId + recurring): stage Delete hidden, "+" disabled, strategy/template/bid-masking disabled — src/views/projectCreation/projectCreation.jsx:3112-3127, 3163-3170, src/views/eventCreation/eventCreation.jsx:1782, 1822, 1843
Gaps: "After" with no count or "On Date" with no date is not validated and silently sends `max_occurrences:null`/`ends_at:null` (= never ends) — src/views/projectCreation/helpers.js:703-710. Amendment draft of a recurring project publishes with empty remarks; backend amendment publish needs remarks (event-groups.md part 1, untyped 500 if missing).
Cites: src/views/projectCreation/components/projectScheduler/recurringEventSettings/recurringEventSettings.jsx:84-297

### Schedule drawer — Save Schedule validation
The "Schedule Event" drawer (one card per stage).
Rules:
1. [time] Start after end → "Start time should be less than end time" — src/views/projectCreation/components/projectScheduler/projectScheduler.jsx:70-72, src/views/projectCreation/components/projectScheduler/stageSchedulerCard/stageSchedulerCard.jsx:456-460, src/translations/en.json:326
2. [time] Fixed start before now → "Start time cannot be less than the current time"; end before now → "End time cannot be less than the current time" (both `<`, browser clock) — projectScheduler.jsx:74-80, src/translations/en.json:325, 327
3. [validation] Serial bidding without evaluation → "Evaluation time is required for serial bidding event" — projectScheduler.jsx:63-68, stageSchedulerCard.jsx:691-696
4. [time] Date pickers disable days before today and after today + 3 months — src/views/projectCreation/components/projectScheduler/helpers.js:6-7
5. [config] Duration menu = template `event_duration_predefined_values[mode].event_duration` or default 30 min, 1 h, 4 h, 24 h; switching to "Fixed time" presets now + 30 min — stageSchedulerCard.jsx:68-71, 213-225, src/views/projectCreation/components/projectScheduler/constants.js:1
6. [state] Nothing is stored on the stage until Save Schedule passes; Back discards — projectScheduler.jsx:83-111, 37-39
Gaps: choosing "Custom duration" first sets end to undefined; closing the popover then Save passes (NaN comparisons) and publish fails "Please add end time for the event" — stageSchedulerCard.jsx:302-314. Backend has no end>start / end>now check (trade-stages.md part 8): candidate API test with past `bid_end_time`.
Cites: src/views/projectCreation/components/projectScheduler/projectScheduler.jsx:41-114

### Schedule math, timezone and date formats
How start/end/evaluation are computed and shown.
Rules:
1. [time] start = `adjustForServer(fixed start || now)` where adjustForServer subtracts the stored client−server clock difference (`timeDiff` from the server-time call) — src/views/projectCreation/components/projectScheduler/helpers.js:19-21, src/utils/index.js:748-754, src/redux/user/actions.js:321-330
2. [time] end = fixed end as picked (NOT skew-adjusted) or start + duration seconds; eval = end (+cost breakdown) + eval seconds — src/views/projectCreation/components/projectScheduler/helpers.js:23-34
3. [time] All pickers/labels use the browser's local timezone (moment, no tz); date/time pickers use the company date format (default "DD MMMM YYYY hh:mm:ss A", seconds dropped) and 12-hour mode for supported languages — src/utils/index.js:1277-1375, stageSchedulerCard.jsx:430-449
4. [time] Durations read "Xd Yh Zm" style via getReadableDuration (days, hours, minutes; seconds dropped) — src/utils/index.js:473-503
5. [time] Reopened draft whose saved start is past → start becomes now, duration kept; eval = extra_closing_time − (review end or ending_at) — src/views/projectCreation/projectCreation.jsx:1279-1311
Gaps: fixed END is not skew-corrected while start is, so with clock skew the sent duration differs from what was shown — helpers.js:19-26. A draft with no extra_closing_time yields a negative/NaN eval time (unverified: response shape) — projectCreation.jsx:1290-1293.
Cites: src/views/projectCreation/components/projectScheduler/helpers.js:12-42

### Stage footer — schedule chip, savings/T&C/currency/payment buttons
Bottom bar of each stage.
Rules:
1. [visibility] Schedule chip: "Now - <end>" or "<start> to <end>" plus "(duration)"; start format "h:mm a", end "hh:mm a, Do MMM", start gets the long format past 24 h, both get the year when years differ; refreshes every 10 s — src/views/eventCreation/components/footer/footer.jsx:37-72, 150-154
2. [state] Footer buttons disabled until a template and at least one product exist (RFI: template data), tooltip " Please choose a template and add a product"; never disabled for RFP — src/views/eventCreation/eventCreation.jsx:407-411, 2374-2381, 2428
3. [visibility] Savings button only for RFQ/Auction non-BOQ sheets; red when `errors.savingsDrawer` — footer.jsx:171-188
4. [visibility] Currencies button only for trade modes with template `isMultiCurrencyEnabled` and not disabled for the template; disabled in RFQ→Auction without currency data — footer.jsx:123-124, 156-162, 206-219
5. [visibility] Quick-create (non-project) footer has its own publish: "Send to Auction Team " (RFQ→Auction draft or auction routed to team) else "Publish Event" — footer.jsx:134-136, 300-313
Cites: src/views/eventCreation/components/footer/footer.jsx:24-319

### Single-stage event title and auto title (quick-create)
Title field shown only outside project creation.
Rules:
1. [visibility] Event title input (placeholder "Enter the title of this event") only when not projectCreation; red outline on `errors.title` — src/views/eventCreation/eventCreation.jsx:1741-1761, src/translations/en.json eventCreation.eventTitleInput
2. [calculation] Auto title regenerates from sheet rows/mode/order type when the title is empty or still equals the previous auto title; typed out word by word every 100 ms — src/views/eventCreation/eventCreation.jsx:1309-1344
3. [calculation] Onboarding template sets title "[<company>] Vendor Onboarding | <Do MMMM YYYY>" — src/views/eventCreation/templateSelection.jsx:307-322
4. [calculation] PR→event (non-eRFX) title "[Reverse Auction|Forward Auction|RFQ] <product|family products|first & more> - <location|N locations>", product truncated to 70 — src/views/projectCreation/helpers.js:1057-1096
Gaps: backend refuses a blank sheet title with 55 "Title is missing" (trade-stages.md part 12); whitespace-only titles are not checked client-side (`title === ""`) — src/views/projectCreation/helpers.js:297.
Cites: src/views/eventCreation/eventCreation.jsx:1309-1344, 1741-1761

### Template picker — list, filter, select, change
Commercial template dropdown of a stage.
Rules:
1. [side-effect] List → `GET /templates?type_identifier=<rfi for RFP/RFI | boq for BOQ project | trade>&hide_onboarding_v2_templates=true`; search is a client-side name substring — src/views/eventCreation/templateSelection.jsx:439-480, 120-135, src/redux/orders/actions.js:1378-1404
2. [visibility] Non-BOQ project creation hides templates whose templateFor includes "boq"; the current template is excluded from the list — templateSelection.jsx:126-132, 524
3. [side-effect] Select → `GET /v1/trade/new_request_config…&filters={"template_uuid":…}` and `GET /templates/:uuid`; template durations reset start to now and end/eval to the template defaults — templateSelection.jsx:143-173, src/models/orders/ordersService.js:262
4. [state] Changing an existing template asks "Do you really want to change the template?" (project) / "Changing template will reset data. Are you sure?" (quick-create), OK "Yes" — templateSelection.jsx:349-360, src/translations/en.json eventCreation.handleTemplateDataReset
5. [state] Disabled in RFQ→Auction (tooltip "Template used in RFQ has already been selected"), while loading, and in recurring edit; hidden for RFP stages of BOQ projects and for AI-created RFP — templateSelection.jsx:137-138, 549-555, src/views/eventCreation/eventCreation.jsx:480-481, 1804-1808
6. [state] In project creation `product`, `creator_quantity`, `variant` are locked; PR events also lock READ_ONLY_WIDGETS_IN_PR_TO_AUCTION and `blockEditFromPr` widgets — templateSelection.jsx:248-272
Cites: src/views/eventCreation/templateSelection.jsx:81-615

### Product sheet — locks, upload, columns, required cells
The pricing sheet of RFQ/Auction stages (see create-screen-contract.md for cell ids).
Rules:
1. [state] Sheet product edits locked for RFQ→Auction ("You cannot make changes to the product because you are creating this event from an existing RFQ"), PR ("…from an existing PR") and non-BOQ project creation ("You can manage the product and quantity from the Manage Line Items section"); BOQ+PR unlocks; "Upload Sheet" hidden while locked — src/views/eventCreation/productSheet/productSheet.jsx:171-221
2. [side-effect] Upload → `GET /templates/excel_template/:id?sheet_type=<boq_items_sheet|template_product_sheet>` and `POST /templates/product_sheet_params` (120 s timeout) — src/models/orders/ordersService.js:269-289
3. [validation] Required, non-readOnly widget empty on any row except the trailing blank row → "Sheet partially filled, please check again."; a numeric 0 counts as empty (`!value`) — src/views/projectCreation/helpers.js:235-276, 483-485
4. [visibility] Price-field menu hides `freight_charges` until 3+ rows and disables already-added fields; "Add New" disabled once all global widgets are added — productSheet.jsx:134-140, 308
5. [state] Delete-column disabled when the sheet has tabs (BOQ grouping) — productSheet.jsx:238
Gaps: a required creator number column cannot hold 0 (e.g. price cap 0) client-side — helpers.js:241, 264.
Cites: src/views/eventCreation/productSheet/productSheet.jsx:165-260

### Sheet validation columns — min / max / tick per row
Per-row "validation" columns attached to a widget (`validationsOn`).
Rules:
1. [validation] max ≤ min on any row → "Please fill correct values in the validation columns" — src/views/projectCreation/helpers.js:603-610, src/views/projectCreation/projectCreation.jsx:1726-1729
2. [validation] tick > (max − min) → same toast — src/views/projectCreation/helpers.js:611-618
3. [validation] Checked only when both min and max columns still exist and all values are truthy (0 skips the check) — src/views/projectCreation/helpers.js:602-615
Gaps: `max <= min` is compared without Number(); if cell values are strings it is a lexicographic compare ("10" <= "9") (unverified value type) — src/views/projectCreation/helpers.js:605-607. Backend vendor-validation checks: trade-stages.md update_vendor_validations.
Cites: src/views/projectCreation/helpers.js:578-622

### Strategy drawer — event type tabs and disabled copy
"Event Type" drawer opened from the stage header.
Rules:
1. [state] Event type tab disabled when: adding a new stage ("You cannot change the event type as this is a new stage"), mode already in the project ("<Label> already exists in the project"), RFQ→Auction for RFQ/RFP ("This event is already configured as an RFQ " / "A Technical Stage is not meant for an auction "), or RFQ/Auction swap at 2 stages — src/views/eventCreation/components/auctionConfiguration/auctionConfiguration.jsx:284-324
2. [visibility] RFI tab only outside project creation; "Technical Stage" tab only inside — auctionConfiguration.jsx:808-838
3. [visibility] Strategy tabs: Rank always; Price and Traffic hidden for service templates; whole strategy row hidden for BOQ sheets unless service template; Knockout hidden for basket — auctionConfiguration.jsx:841-893
4. [validation] Save with mode auction and type "auction" → "Please select a valid auction strategy" — auctionConfiguration.jsx:421-424, src/translations/en.json errorMessages.quickCreateOrder.notAValidAuctionStrategy
5. [state] Switching strategy auto-ticks cost-breakdown mode for knockout/dutch and unticks it otherwise (when applicable) — auctionConfiguration.jsx:725-748
6. [state] Switching between RFI and RFQ/Auction warns "Switching event mode will reset existing data." and on save clears template, sheet, savings, currencies and ALL project participants — auctionConfiguration.jsx:390-407, 898-903, src/views/eventCreation/eventCreation.jsx:505-536
Cites: src/views/eventCreation/components/auctionConfiguration/auctionConfiguration.jsx:284-893

### Knockout / Dutch fields — inputs, messages, client checks
Starting price, ending price, tick size, time difference (RFQ→Auction only in eRFX, FE-9.2).
Rules:
1. [validation] Plain text inputs with the event currency prefix; "/<unit>" suffix for single product on base price; messages "Please enter valid base price", "Please enter valid end price", "Please enter valid tick size", "Please enter valid time difference" — src/views/eventCreation/components/configurations/orderConfigBlocks.jsx:410-533
2. [validation] Time difference (minutes) must match /^\d+(\.\d{1,2})?$/ AND be ≥ 0.5 AND stage duration > td×60 (strict) — auctionConfiguration.jsx:599-609, src/views/projectCreation/helpers.js:437-447
3. [validation] Dutch tick > |end − start| fails; knockout tick > start price fails for BUY only; both fail when tick < global tick size (multi-currency) — auctionConfiguration.jsx:572-595
4. [visibility] Offer-on (base/total) and Dutch single/multiple-vendor radios hidden in eRFX; Dutch multi-vendor adds a `floor_quantity` column — orderConfigBlocks.jsx:334-387, src/views/eventCreation/eventCreation.jsx:1052-1060
Gaps: backend has NO tick-vs-start check for knockout and no global-tick check; backend 248 (<30 s) runs only for knockout, so a dutch `time_difference` of 10 s is accepted by the API; backend 238 uses `start+td > end`, so td equal to duration passes the API but not the UI — app/controllers/concerns/trade_controller_helper.rb:3447-3497 (procol-backend).
Cites: src/views/eventCreation/components/auctionConfiguration/auctionConfiguration.jsx:553-625

### Traffic light — ranges for lot vs line-item closing
Traffic-light auction configuration.
Rules:
1. [visibility] Lot closing (not basket): Green / Yellow range inputs in the drawer with "Range is inclusive of <price|rank>." — src/views/eventCreation/components/configurations/configuration.jsx:308-354
2. [validation] Lot price ranges: buy needs lower ≤ upper, sell needs lower ≥ upper; rank needs lower ≤ upper; any blank fails — auctionConfiguration.jsx:677-708
3. [validation] The range error shows the copy "Traffic light type is required" (the generic type message, not a range message) — configuration.jsx:340-346, src/translations/en.json errorMessages.quickCreateOrder.configurations.trafficLightValueRequired
4. [state] Line-item closing or basket: required sheet columns "Green (Inclusive Range)" / "Yellow (Inclusive Range)" are added with currency prefix and "/unit" (price) or "rank" postfix; changing price/rank clears all row values — src/views/eventCreation/eventCreation.jsx:560-657, auctionConfiguration.jsx:361-388
Gaps: per-row ranges are only "required"; no lower ≤ upper check per row client-side while backend validates bounds (269) — trade-stages.md part 11 (trade_controller_helper.rb:1926-1928); candidate API test with lower > upper per item.
Cites: src/views/eventCreation/components/configurations/configuration.jsx:209-354

### Dynamic Event Extension — fields, units, client checks
"Dynamic Event Extension" block (auction, not knockout/dutch).
Rules:
1. [visibility] Shown only when strategy set, not knockout/dutch, and mode auction (product count and closing mode ignored) — src/views/createOrder/helpers.js:61-64
2. [validation] "Extend time by:" radio 1/2/3/5 min or Custom; custom InputNumber (min 0, "Min(s)") must be truthy with ≤ 2 decimals → "Please enter valid time" — orderConfigBlocks.jsx:602-650, auctionConfiguration.jsx:660-666
3. [validation] "Trigger time extension on last:" InputNumber min 0; must be truthy with ≤ 2 decimals; error text "Trigger time extension cannot be less than 1 min" although 0.5 passes — orderConfigBlocks.jsx:624-636, auctionConfiguration.jsx:667-672
4. [validation] "Time extension on change in:" select "Top 2 bids" … "Top 8 bids" required ("Select one of the options"); strategy radio Price / Rank — orderConfigBlocks.jsx:589-601, 651-678, src/views/createOrder/constants.js:72-101
5. [state] Errors for custom time, trigger time and top-N block publish with no dedicated toast (FE-13.6–13.8) — src/views/projectCreation/helpers.js:527-542
Gaps: backend 501 "Invalid Trigger Time for Dynamic Time Extension." when trigger < 1 min or > half the time left, and its helper is typed Integer minutes, so 1.5 may crash untyped (unverified) — app/controllers/concerns/trade_controller_helper.rb:3317-3319, 6258-6268 (procol-backend). Candidate API tests: last_n 0.5, 1.5, > half duration.
Cites: src/views/eventCreation/components/configurations/orderConfigBlocks.jsx:539-683

### Other auction options — closing, rank type, cost breakdown, basket, serial, delivery, English, auto-award
Smaller blocks of the strategy drawer and where they appear.
Rules:
1. [visibility] "How will you award the event" (closing mode) hidden for knockout/dutch/book-building and basket multi-product; rank type only for Rank with lot closing (or single product), not basket — configuration.jsx:232-245, 299-307
2. [visibility] "Enable Cost Breakdown Mode": not basket, multi-product, rank/knockout/dutch, lot closing or RFQ→Auction (BOQ projects excluded by applicability) — configuration.jsx:146-154, src/views/eventCreation/helpers.js:1194-1212
3. [visibility] Basket auction, Delivery date, Serial bidding and "Set minimum revisions to show …" exist only outside project creation; serial only for rank/price/traffic with line-item closing and is disabled when basket — configuration.jsx:247-272, 401-424, orderConfigBlocks.jsx:81-83, 759-765
4. [validation] Serial bidding: duration required ("Please enter a valid duration"), stage end = (rows−1) × duration × slab; minimum revisions must be digits and not "0" ("Please enter a valid number") — auctionConfiguration.jsx:641-650, 709-711, src/views/eventCreation/eventCreation.jsx:1005-1013
5. [visibility] English auction checkbox only when template `is_english_auction_allowed` and Rank/Traffic; reset to false on template change — configuration.jsx:392-400, templateSelection.jsx:282-284
6. [visibility] "Enable Auto Awarding" when `auto_award_configs` exist; per-option configs are hidden (`showAvailableConfigs=false`); unticking sends `auto_award_configs:null` — orderConfigBlocks.jsx:799-832, src/views/projectCreation/helpers.js:892-898
Cites: src/views/eventCreation/components/configurations/configuration.jsx:132-427

### Bid masking (closed-envelope) toggle
"Bid Masking" switch on the stage header.
Rules:
1. [visibility] Shown only for RFQ/Auction stages in project creation with `enable_bid_masking_for_event`; disabled in recurring edit — src/views/eventCreation/eventCreation.jsx:1826-1851
2. [calculation] Sent as `closed_envelope_bidding_for_auctions` (auction) or `closed_envelope_bidding_for_rfqs` (rfq) only under the same gate; otherwise both are omitted — src/views/projectCreation/helpers.js:971-974, src/redux/orders/helpers.js:1079-1088
3. [config] RFQ→Auction seeds the toggle from the source's `closedEnvelopeBiddingForRfqs` / `ForAuctions` — src/views/projectCreation/projectCreation.jsx:1249-1252
Cites: src/views/eventCreation/eventCreation.jsx:1826-1851

### Participants panel — who can be picked, gating, search
Project-wide participant selector under each stage.
Rules:
1. [permission] Selector disabled when the project status is not draft AND (no template/product for non-RFP, OR company `is_allowed_to_modify_audience` is falsy, OR amendment draft) — src/views/eventCreation/eventCreation.jsx:2393-2398, src/redux/orders/selectors.js:720
2. [visibility] Blacklisted vendors are never suggested; tagged (auto-generated tag) non-blacklisted vendors are pre-selected when the product audience loads — src/views/eventCreation/components/participants/participantsSelection.jsx:226-280, src/views/eventCreation/helpers.js:1219-1220
3. [visibility] In search results blacklisted vendors are disabled with "Blocked"; TNA vendors are disabled with "TNA" unless the URL has `allowTnaVendorsToBid=true` (so on a fresh create every TNA vendor is unselectable) — participantsSelection.jsx:136-139, 1203-1223, src/views/projectCreation/projectCreation.jsx:255-256
4. [side-effect] Search → `GET /companies/vendorlist_filtered?query=…&pr_item_uuids=…&product_uuids=…&trade_request_uuid=…&page=n`, debounced 500 ms, trimmed, paged on scroll — participantsSelection.jsx:500-554, src/redux/vendors/api.js:96-122
5. [side-effect] Product audience → `GET /companies/audience_for_product?product_uuids=[…]&pr_item_uuids=[…]` when product ids change — src/views/eventCreation/eventCreation.jsx:1071-1119, src/redux/vendors/actions.js:553-571
Gaps: no client cap on participants while backend refuses > 500 new vendors with 511 — trade-stages.md part 4. The search `query` is spliced into the URL unencoded ("A&B" truncates) — src/redux/vendors/api.js:105-107. Whether projectDetails.info.status is "draft" right after the drawer's POST is unverified (createProject does not set info) — src/redux/project/slice.js:204-208.
Cites: src/views/eventCreation/components/participants/participantsSelection.jsx:125-1266

### Savings drawer — modes, inputs, precision, custom strategies
Savings reference entry ("Add Savings").
Rules:
1. [state] "Gross total" vs "Line items" radio; Gross disabled for basket (forced line items, tooltip "For basket auction, savings can only be on line item."); hidden for knockout/dutch, where multi-product or total-amount → lot, base price → line item — src/components/savingsDrawer/savingsDrawer.jsx:410-426, 661-708
2. [validation] Inputs are InputNumber min 0 with precision = price-input precision (multi-currency) || price widget precision || 2 — savingsDrawer.jsx:134-140, 844-848, 958-973
3. [state] "Last Purchase Price" tab disabled in Gross mode; Historical Price read-only when PR event + `freeze_pr_savings_reference` — savingsDrawer.jsx:757-765, src/views/eventCreation/eventCreation.jsx:2366-2370
4. [validation] Custom strategy key = name lower-cased, spaces → "_"; existing key → "Savings Strategy Already Present!"; else "New Savings Strategy Created!" — savingsDrawer.jsx:428-462
5. [config] Savings column defaults to a widget with `is_default_comparison`, else "price"; options are price/amount group widgets — savingsDrawer.jsx:119-132, 380-408
6. [state] Basket toggle or event-type change resets savings to defaults — src/views/eventCreation/eventCreation.jsx:487-502, 516-526
Gaps: "Paste from CSV" takes any `isNumber` line (negatives, unlimited decimals, strings) bypassing min 0 and precision — savingsDrawer.jsx:554-607. Whitespace-only custom name creates an empty key — savingsDrawer.jsx:428-433.
Cites: src/components/savingsDrawer/savingsDrawer.jsx:96-1020

### Savings checks at publish
Savings rules enforced in `getStageWiseErrors`.
Rules:
1. [validation] RFQ/Auction with `is_saving_configuration_mandatory` and not RFQ→Auction: at least one savings entry with a truthy value required → "Savings configuration is mandatory" — src/views/projectCreation/helpers.js:282-291
2. [validation] Every savingsColumn value must be a widget key of the sheet → "Please select a valid column for savings" (savings button turns red) — src/views/projectCreation/helpers.js:465-472
3. [validation] A negative value counts as "has savings" (truthy) — src/views/projectCreation/helpers.js:283-287
Gaps: backend 719 "Saving Configurations is mandatory for Event" checks presence only, and 575 "Savings Column not found" checks the column is a price/amount column — trade-stages.md parts 2 and 11; candidate API tests: negative line-item reference price, column = non-price widget.
Cites: src/views/projectCreation/helpers.js:282-291, 465-472

### Currency modal — validation, precision, global tick size
"Edit Currencies" modal (multi-currency templates).
Rules:
1. [validation] Base-currency mode without a rate → "Please enter price in <default code>"; a ticked currency without rate → "Please enter price in <default code>"; multi mode with none ticked (non-recreate) → "Please select atleast one currency." — src/views/createOrder/currencyModal.jsx:75-106, 419-430, 509-515
2. [validation] Rate inputs min 0.00000001 (multi) / 0.01 (base) — currencyModal.jsx:404, 502
3. [calculation] Each currency's adjustedPrecision = company default multi precision, or its default when rate = 1, else −floor(log10(10^−defaultPrecision × 1/rate) + 1) — currencyModal.jsx:149-181
4. [calculation] Global tick size = ceil(10^−precision × strongest rate) to strongest precision, then to base precision — currencyModal.jsx:182-198, src/utils/index.js:950-965
5. [validation] Knockout/Dutch with any non-default currency → "Currency configuration cannot be added in Knockout / Dutch Auction" at publish — src/views/projectCreation/helpers.js:293-295
Cites: src/views/createOrder/currencyModal.jsx:75-204

### Payment Terms modal
"Payment Terms" footer button (company `is_payment_tnc_enabled`).
Rules:
1. [validation] Payment Terms and Incoterms required ("Payment Terms is mandatory" / "Incoterms is mandatory"); Payment Terms Comments free text; Save disabled until the form is dirty — src/views/eventCreation/components/paymentTerms.jsx:19-42, 83-88
2. [side-effect] Dropdowns load on first open from `GET /widget_data_mapping?type=standard_payment_terms` and `?type=incoterms` — paymentTerms.jsx:29-35, 58-75
3. [validation] Enabled but not saved → "Payment Terms and Conditions are mandatory" at publish; sent as `configurations.payment_tnc` — src/views/projectCreation/helpers.js:278-280, src/redux/orders/helpers.js:1072-1074
Gaps: no backend check of payment_tnc is listed in trade-stages.md; a stage without payment_tnc on a payment-T&C company is a candidate API test (unverified).
Cites: src/views/eventCreation/components/paymentTerms.jsx:19-100

### Technical stage — Vendor Assessment (global section) template
Global RFP section of a Technical stage.
Rules:
1. [side-effect] Picking a Vendor Assessment template → `GET /templates/:uuid`; stores name, uuid (`vendor_assessment_template_uuid`), `section_wise_max_score`, `section_wise_scoring_enabled` — src/views/rfiBuilder/trGlobalSection.jsx:63-84
2. [state] All-form templates replace the global section with ALL their sections (array); any other template keeps only the FIRST section's questions (+ an editable blank row when RFP edit allowed) — trGlobalSection.jsx:90-117
3. [validation] Section-wise-scoring templates are rejected in per-item sections (FE-3.4) but accepted here — src/views/eventCreation/templateSelection.jsx:366-371
4. [config] Questions editable only with `is_rfp_template_edit_allowed_during_creation`; template picker hidden for AI creation and recurring edit — trGlobalSection.jsx:276, 361, src/views/eventCreation/eventCreation.jsx:1932
Gaps: a non-form template with several sections silently loses sections 2..n in Vendor Assessment — trGlobalSection.jsx:102.
Cites: src/views/rfiBuilder/trGlobalSection.jsx:63-121

### Technical stage — evaluators
"Add Evaluator" picker on RFP sections.
Rules:
1. [visibility] Lot evaluation (`lot_based`) → one picker on Vendor Assessment; line evaluation → one per line-item section — src/views/eventCreation/eventCreation.jsx:1933-1935, 1962-1964
2. [side-effect] Users → `GET /get_all_users?filters={"statuses":["active"],"designation":["planner"],fund_center,wbs_element}&search={"category":"name","value":…}&include_current_user=false`, search debounced 300 ms — src/views/rfiBuilder/evaluatorsAddition.jsx:22-54, src/redux/users/actions.js:24-44
3. [state] Exactly one evaluator per section: picking replaces the previous; button shows that evaluator's name — evaluatorsAddition.jsx:100-106, 124-127
4. [validation] Lot: global section (or every form section) must have an evaluator → "Please add Evaluator in the Technical Stage"; line: every item section → "Please add Evaluator to all the line items in the Technical Stage" — src/views/projectCreation/helpers.js:320-339
Cites: src/views/rfiBuilder/evaluatorsAddition.jsx:14-135

### Technical stage — question checks and RFP payload
Publish checks and what is sent for RFP stages.
Rules:
1. [validation] A line-item section whose only row has no question → "Some sections are empty, please check and try again" — src/views/projectCreation/helpers.js:341-347
2. [validation] Vendor Assessment: a row with description but no question, or (lot mode) no question at all → "There are some errors in vendor specific sections, please check and try again" — src/views/projectCreation/helpers.js:349-366
3. [calculation] Payload `widgets` = global section first, then item sections, each with `templateUuid`; an object global section is included only when its FIRST row has a question — src/views/projectCreation/helpers.js:829-849
4. [side-effect] AI RFP → `POST /ask_ai_chats/rfp_questions`, then `GET /external_requests/:uuid`; the AI button needs project line items — src/views/eventCreation/components/aiRfpGenerator/api.js:3-11, src/views/eventCreation/eventCreation.jsx:1854-1876
Gaps: in line mode a Vendor Assessment whose first row is blank but later rows hold questions is dropped from the payload without error — src/views/projectCreation/helpers.js:833-834.
Cites: src/views/projectCreation/helpers.js:320-367, 829-849

### RFP template builder (/templates/create)
Builder used to create RFP/Intake templates later picked in Technical stages.
Rules:
1. [permission] Route `/templates/create` needs `template:create_record` and renders RfiBuilder for new templates — src/app/routes/routeConfigs.js:677-683, src/views/templatesAuction/createTemplate.jsx:79
2. [validation] Template name blank/whitespace → "Please enter a name for this template."; table section with no questions → "Section must have at least one question."; any blank question → "Questions column cannot be empty."; grouped table without columns → "Section must have at least one column." — src/views/rfiBuilder/rfiBuilder.jsx:113-139, 374-378
3. [side-effect] Create → `POST /templates`, edit → `PATCH /templates/:id`; success "RFP Template created successfully!" / "… updated successfully", redirect to templates — rfiBuilder.jsx:164-202, src/redux/templates/api.js:5-7
4. [validation] Question picker offers exactly 7 types (FE-10.10); Single Select needs at least one option ("Please add at least one option") — src/views/rfiBuilder/fieldTypes.js:15-49, src/views/rfiBuilder/fieldCustomizer.jsx:321-333
Cites: src/views/rfiBuilder/rfiBuilder.jsx:113-202

### Number formatting on the create screen
How prices and amounts are displayed.
Rules:
1. [calculation] Sheet numbers use Intl.NumberFormat with the currency's locale (INR → en-IN lakh grouping, USD etc. en-US) and maximumFractionDigits = cell precision ?? widget precision ?? 2 — src/utils/index.js:288-296, src/components/sheet/sheet.jsx:113-131, 953-957
2. [visibility] Zero is hidden in number cells unless the widget allows zero — src/components/sheet/sheet.jsx:120-127
3. [calculation] Formula and global number/percentage cells are fixed to the precision (`toFixed`) before display — src/components/sheet/sheet.jsx:1005, 1015
4. [visibility] Currency prefix = selected base currency label, else template currency (symbol or code per stored preference), else dashboard default; price/amount columns get the selected base symbol — src/views/eventCreation/eventCreation.jsx:378-393, 1159-1195
Cites: src/components/sheet/sheet.jsx:113-131, 953-1020

### Withdraw draft project (amendment draft)
"Withdraw" on an amendment draft opened in the create screen.
Rules:
1. [validation] Withdraw Remark required (trimmed non-empty), max 500 chars with counter — src/views/projectCreation/components/withdrawDraftProjectModal.jsx:44-63
2. [side-effect] `PATCH /event_groups/:id` `{status:"withdrawn", withdraw_remark:{remarks, attachments:[]}}`; success "Draft project withdrawn successfully" and redirect `/orders?tab=live` — withdrawDraftProjectModal.jsx:17-31, src/views/projectDetails/components/mutation.js:34-49, src/views/projectCreation/projectCreation.jsx:375-379
Gaps: backend crashes untyped when `withdraw_remark` is missing (event-groups.md withdraw part 1); the UI always sends it, so this is an API-only test.
Cites: src/views/projectCreation/components/withdrawDraftProjectModal.jsx:5-68
