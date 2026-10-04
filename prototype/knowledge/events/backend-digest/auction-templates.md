# Auctions and templates — backend digest (procol-backend origin/main ae36e86894)

## Overview
Auctions: a buyer turns a finished price round (RFQ) into an auction stage with POST /api/trade/move_to_auction (Api::TradeController#move_to_auction, logic in RfqToAuction::CreateService); the auction is a new stage (rfx_mode rfq_then_auction) whose parent is the RFQ. Live-auction behaviour (ranks, best price, tick size, auto-extension, knockout/dutch rounds) lives in TradeRequest, Bid, BidTrade, BidsControllerHelper and TradeControllerHelper; live audience changes and the vendor T&C acceptance are in Api::V1::TradeController.
Templates: Api::TemplatesController (+ TemplatesHelper, Template model, Templates::*Service) lists, shows, creates, edits, deletes and shares templates; TradeTemplateHelper applies a template's widgets when a stage or bid is saved.
Template and move-to-auction actions are buyer-console only (client_admin_dashboard / procol_admin_dashboard in config/app_auth_config.yml); another app gets "This app is not authorized to use this API" (HTTP 401) and is signed out (app/controllers/concerns/api_auth.rb:78-96, json_helpers.rb:31-35).

### trade#move_to_auction — POST /api/trade/move_to_auction — move RFQ to auction: entry checks (part 1)
Buyer (console only) converts a price round (RFQ) into an auction stage. Body: trade_request_id, auction_config, data[] (line items), configurations, bid_start_time, bid_end_time, audience_company_ids, use_rfq_quotes_as_bids.
Checks, in order:
1. RFQ id not an active stage → 95 "Trade Request not found" (HTTP 422) — app/controllers/api/trade_controller.rb:965-969
2. Project (event group) not the latest version → 101 "You are not allowed to perform this action" (HTTP 422) — trade_controller.rb:971
3. A child stage of this RFQ exists that is not cancelled/withdrawn (a DRAFT auction counts) → 94 "An auction has already been made for this event." (HTTP 422) — trade_controller.rb:973
4. Policy move_to_auction? (trade create_record + sourcing access + can view) → 455 "You are not authorized to perform this action" (HTTP 422) — trade_controller.rb:975, app/policies/trade_request_policy.rb:158-160
5. RFQ company not in user's allowed companies → 101 (HTTP 422) — trade_controller.rb:976-978

### trade#move_to_auction — POST /api/trade/move_to_auction — closing mode, units, CBD (part 2)
More checks of the RFQ→auction conversion.
Checks, in order:
6. Source stage current_status already auctioning → 93 "Trade is already of auction type" (HTTP 422) — trade_controller.rb:979
7. RFQ closes line-item-wise, is multi-product, request asks auction_closing_mode=lot_based → 503 (HTTP 422), misleading message "You cannot award entire lot when RFQ was done for partial lot." — trade_controller.rb:981-984
8. Row without unit → 574 "Unit cannot be blank"; unknown unit → 495, message "The unit X is not present" (HTTP 422) — trade_template_helper.rb:1392-1416
9. No configurations sent → 33 "Order not active" (HTTP 422) — trade_template_helper.rb:1429-1432
10. rfx_project_enabled companies, knockout/dutch: start price vs RFQ L1 → 965/966/968 (part 3) — trade_controller.rb:989-993
11. CBD (fast bidding) with fewer than 2 active line items → 798 "CBD mode requires at least two active line items..." (HTTP 422) — trade_controller.rb:995-999
Skipped: saving-configuration-mandatory (719) never runs here (company not passed) — trade_template_helper.rb:1436, trade_controller.rb:985

### trade#move_to_auction — POST /api/trade/move_to_auction — knockout/dutch start price vs RFQ L1 (part 3)
Only for knockout/dutch auctions in companies with rfx_project_enabled: the starting price (bulk_price) is compared with the RFQ's lowest (L1) total, ignoring all-TNA vendors and vendors without a rankable bid.
Checks, in order:
1. Some RFQ bid's recalculated starting total (its charges + bulk_price) < 0 → 965 "Starting price cannot be less than the maximum global charge of RFQ bids" (HTTP 422) — trade_controller_helper.rb:5803-5809
2. No L1 price → check passes — trade_controller_helper.rb:5811
3. L1 below the max recalculated total, or L1 <= bulk_price → 966 "Starting price cannot be more than the lowest RFQ (L1) Sum Total" (HTTP 422) — trade_controller_helper.rb:5813-5816
4. Dutch: L1 < end_price → 968 "End price cannot be more than the lowest RFQ (L1) Sum Total" (HTTP 422) — trade_controller_helper.rb:5817-5819
Skipped for other auction_config values — trade_controller_helper.rb:5783

### trade#move_to_auction — POST /api/trade/move_to_auction — dynamic extension, traffic light, knockout errors (part 4)
Checked in set_configurations_for_trade inside RfqToAuction::CreateService; any code rolls back the whole move, RFQ close included — create_service.rb:24, 99-104, 147-150.
Checks, in order:
1. Dynamic closing on with last_n_minutes_for_time_extension blank, < 1, or over half the time left → 501 "Invalid Trigger Time for Dynamic Time Extension." (HTTP 422) — trade_controller_helper.rb:3317-3320
2. Fast bidding outside auction modes → 101 (HTTP 422) — trade_controller_helper.rb:3354-3359
3. traffic_light without valid lower/upper traffic_light_ranges → 269 "You have not provided valid traffic light ranges." (HTTP 422) — trade_controller_helper.rb:3436-3446
4. Knockout (all HTTP 422): bulk_price <= 0 → 106 "Please enter a valid price"; time_difference < 30 → 248 "Time difference cannot be less than 30 seconds"; a field missing → 237 "Please enter all the required entries for creating the auction."; start + time_difference > bid end → 238 "Time difference cannot be greater than auction time." — trade_controller_helper.rb:3447-3462

### trade#move_to_auction — POST /api/trade/move_to_auction — dutch and order type errors (part 5)
Dutch-auction and order-type checks while configuring the auction stage.
Checks, in order:
1. bulk_price or end_price <= 0 → 106 "Please enter a valid price" (HTTP 422) — trade_controller_helper.rb:3482-3484
2. Any of bulk_price, end_price, time_difference, price_difference missing → 237 (HTTP 422) — trade_controller_helper.rb:3485-3487
3. Sell: start < end → 241 "Start Price cannot be greater than End Price"; buy: start > end → 242 "Start Price cannot be less than End Price" (HTTP 422). Messages read inverted vs the condition (defect-shaped) — trade_controller_helper.rb:3488-3495
4. price_difference larger than the start–end gap → 243 "Invalid Tick Size" (HTTP 422) — trade_controller_helper.rb:3490, 3494
5. start + time_difference > bid_end_time → 238 (HTTP 422) — trade_controller_helper.rb:3497
6. rfx_mode param rfq/auction/rfq_then_auction with blank order_type (web) → 53 "Order Type not mentioned" (HTTP 422) — trade_controller_helper.rb:3530-3532
(unverified: rfx_mode param is re-applied after the service set rfq_then_auction, so omitting it would yield rfx_mode auction — trade_controller_helper.rb:3568-3590)

### trade#move_to_auction — POST /api/trade/move_to_auction — what happens to the RFQ (part 6)
Moving to auction ends the price round now and, in RFx-project companies, freezes it.
State rules: RFQ closed_at = now, every RFQ schedule ending in the future is cut to now, misc is_rfq_converted_to_auction = true — create_service.rb:212-217. New stage: current_status auctioning, parent_id = RFQ, rfx_mode rfq_then_auction, stage_no + 1, participant_statuses reset, savings removed — create_service.rb:219-235.
RFQ lock: company rfx_project_enabled + an active/closed rfq_then_auction child ⇒ edits (trade#update), bids (bids#create_bid), bid reject and new lots refused with 769 "You cannot edit rfq once the auction is created." (HTTP 422); also set when an award proposal is requested/selected for the RFQ's lot — trade_request_model_helper.rb:1430-1444, trade_controller.rb:408, 1825, bids_controller.rb:40, 414.
Model guard: a 2nd non-draft auction for the same parent → untyped 422 message "An auction has already been made for this event." — trade_request.rb:3100-3105, create_service.rb:60-63, trade_controller.rb:1005-1006

### trade#move_to_auction — POST /api/trade/move_to_auction — audience and opening bids (part 7)
Which vendors are invited and which RFQ quotes become opening bids.
Rules:
1. allow_tna_vendors_to_bid defaults to false, so vendors whose every line item is TNA are dropped from audience_company_ids unless the client sends true — create_service.rb:18, 134-141
2. Sheet-template events copy audience via set_customized_audiences; others use vendors of bid_ids + extra_audience_ids, audience restricted — trade_controller_helper.rb:4644-4662
3. use_rfq_quotes_as_bids: RFQ bids (active/requested) of the remaining audience are copied as ACTIVE auction bids; unaccepted unregistered bids skipped; approval_status cleared — create_service.rb:168-186, bids_controller_helper.rb:1745-1799
4. No bids are copied when the auction is created as draft (part 8) — create_service.rb:171
5. Only RFQ line items still active/closed are carried — trade_controller_helper.rb:847-850
6. Weights copied only with transfer_weights on weighted events — create_service.rb:77-79
Side effects: ranks/precomputed data recomputed for copied bids — create_service.rb:237-244

### trade#move_to_auction — POST /api/trade/move_to_auction — draft routing, rounds, schedule, reminders (part 8)
Final steps of the RFQ→auction conversion.
State rules:
1. Company has an active team of type auction and the user is not in it ⇒ auction created as DRAFT (no company setting needed); RFQ and auction get an owner access list for that team — trade_controller_helper.rb:5431-5436, create_service.rb:229, 246-261
2. Knockout/dutch with params status=active: round 1 created from bid_start_time with bulk_price, price_difference, time_difference for non-broker audience — create_service.rb:198-210
3. The RFP-vs-RFQ end-time rule (712) does not apply (stage is neither rfp nor rfq); extra_closing_time adds an extra-closing schedule — trade_controller_helper.rb:643-675, 520-531
4. Auction joins the RFQ's lot in lot_config — create_service.rb:89-95
Side effects: reminder mails queued at start-24h and start-30min if still ahead — create_service.rb:295-315. Response: new stage via TradeSerializer — trade_controller.rb:1010-1011

### Auction types — TradeRequest.auction_config enum — rank, price, traffic light, knockout, dutch, book building
What "auction type" means in the backend; there is no English/Japanese enum value.
Rules:
1. auction_config: rank(0, default), price(1), rank_and_price(2), traffic_light(3), knockout(4), dutch(5), book_building(6) — app/models/trade_request.rb:166
2. Auction stage = rfx_mode auction or rfq_then_auction; forward auction = auction stage with order_type sell — trade_request.rb:1519-1525
3. "English auction" is a flag: config is_english_auction_enabled, settable only when is_english_auction_allowed; enabling it forces the best-price indicator on — trade_request_model_helper.rb:884-897, trade_controller_helper.rb:3615-3625, trade_controller.rb:482-484
4. Knockout: each round price = previous − price_difference; dutch: previous + price_difference (sign flipped for sell) — trade_controller.rb:941-942, trade_controller_helper.rb:3463-3465, 3488-3491
5. book_building forces line-item closing — trade_controller_helper.rb:3351-3353
6. auction_closing_mode defaults lot_based; line_item_based ⇒ rank_type inline — trade_controller_helper.rb:3349, 3389

### Live auction — rank and best-price visibility rules
Which indicators vendors see in a live auction.
Rules:
1. Rank shown for rank / rank_and_price, or when other_auction_indicators_config.rank = true; never on an RFQ — app/models/trade_request.rb:654-670
2. Knockout (and dutch in rfx_project companies): only the buyer sees positions — trade_request.rb:658-662
3. Best price required for price / rank_and_price auctions, when other_auction_indicators_config.best_price = true, or for line-item rank events with show-best-price-in-all-events — trade_request.rb:686-707
4. A best_price column is auto-added for price / rank_and_price auctions and line-item English auctions — trade_template_helper.rb:1794-1800
5. Vendors see position indicators only after start (buyer always) — trade_template_helper.rb:2084
6. show_best_price_by_default_in_english_auction is only echoed by GET /api/v1/dashboard_configuration; the backend does not enforce it (unverified: frontend default) — api/v1/users_controller.rb:578, 701

### Live auction — bid placed before the auction starts (code 33, not code 7)
What a vendor gets when bidding before bid_start_time.
Checks, in order:
1. bids#create_bid on a stage not running (now outside bid_start_time..bid_end_time and not in best-offer review time) → 33 "Order not active" (HTTP 422). A surrogate bid (buyer bids on a vendor's behalf) is allowed while upcoming, and after expiry when allowed — app/controllers/api/bids_controller.rb:47-50, app/models/trade_request.rb:1191-1200
2. Code 7 "Kindly wait for the auction to start" (HTTP 422) comes only from GET /api/placed_bid_config (companies#placed_bid_config; vendor website and mobile apps) when bid_start_time is in the future; message overridden to "Bidding starts at HH:MM AM, today / tomorrow / on dd/mm/yyyy" — companies_controller.rb:617-631
3. placed_bid_config on a non-active stage → 4 "Request not found" (HTTP 422) — companies_controller.rb:619-620
Note: an auction's bid_start_time is the start of its "auction" schedule — trade_request.rb:723-733

### Live auction — price limits and minimum decrement (tick size) on a bid
Per-line-item checks of a vendor's quote (validate_bid_product_details).
Checks, in order:
1. Landed price above ceil_price → 38 "Price cannot be more than the allowed price" (HTTP 422) — bids_controller_helper.rb:1839-1846
2. Below floor_price → 41 "Price cannot be less than the allowed price" (HTTP 422) — bids_controller_helper.rb:1848-1855
3. Minimum change (tick_size or tick_size_percentage): only on a revision (previous active bid + parent bid product); a non-zero change smaller than the tick → 214 "Quoted price difference must be greater than the tick size" (HTTP 422). Direction not checked (absolute difference); unchanged price passes — bids_controller_helper.rb:1869-1891
Cites: bids_controller_helper.rb:1828-1913

### Live auction — quantity and custom-validation checks on a bid
Remaining per-line-item checks in validate_bid_product_details.
Checks, in order:
1. Quantity below floor_quantity → 39 "Quantity cannot be less than the allowed quantity" (HTTP 422) — bids_controller_helper.rb:1893-1896
2. Fixed-quantity event and different quantity → 207 "Bid Quantity should be equal to the Auction Quantity" (HTTP 422) — bids_controller_helper.rb:1898-1900
3. Above requested quantity with over-quantity off → 138; below with under-quantity off → 139 (HTTP 422) — bids_controller_helper.rb:1902-1908
4. Custom validation widget fails → 578 "Validation Failed" (HTTP 422); the specific message is dropped — bids_controller_helper.rb:1910-1912

### Live auction — custom min/max/step validation widgets on a bid
How template validation widgets (max_value, min_value, step) are enforced server-side.
Rules:
1. Formulas: max_value target<=limit, min_value target>=limit, step = change of at least the step vs the previous bid, or no change — lib/modules/trade_validation.rb:184-202
2. A validation is evaluated only if its formula has prev.* variables AND a previous bid exists; otherwise skipped. So max_value/min_value are never enforced by the backend and step only on revisions (defect-shaped: server trusts the client) — trade_validation.rb:210-222, 175-176
3. Blank validation value on the line item → skipped — trade_validation.rb:164-165
4. Failure → 578 "Validation Failed" (HTTP 422) — bids_controller_helper.rb:1911-1912

### Live auction — classic last-minute extension (no dynamic closing)
Auto-extension when the auction has NO dynamic closing time.
Rules:
1. After an active bid is saved and the auction ends within the next 1 minute, end time is extended — app/models/bid_trade.rb:118-129
2. Needs config update_trade_end_time true and a rank change with new rank <= rank_for_update_trade_end_time (default 1); price_based strategy uses the price rule; never on RFQs — bid_trade.rb:45-58
3. Extension: +3 minutes on the auction/dynamic-extra-time schedule; closed_at and all bids' end_time moved — bids_controller_helper.rb:381-408
4. update_trade_end_time forced false for line-item-closing stages and RFQs — trade_controller_helper.rb:3383-3385
Side effects: sealbid_allowed = true (buyer may start sealed bids); last-minute notification unless sealbid on — bid_trade.rb:126, bids_controller_helper.rb:402-403

### Live auction — dynamic time extension (DTE) on late bids (part 1)
Auto-extend configured per auction (is_dynamic_closing_time_allowed).
Rules:
1. Config: last_n_minutes_for_time_extension (trigger window), time_extension_value (minutes added), rank_limit_for_time_extension, dynamic_closing_time_strategy rank_based / price_based; invalid window → 501 at creation — trade_controller_helper.rb:3311-3320, 3374-3378
2. Triggered when an active bid lands within the last N minutes before bid_end_time (staggered line items use the item's window) — app/models/bid.rb:411-425
3. rank_based: a line item's rank changed and old or new rank within the limit; price_based: revised item, new rank within limit, price improved (lower for buy, higher for sell) — bid.rb:399-406, 439-462
4. Not triggered when the bid became active from a declined/revoked price-change or counter-offer request — bid.rb:412-416

### Live auction — dynamic time extension (DTE) on late bids (part 2)
What an extension does and known gaps.
Rules:
1. Creates a dynamic_extra_time schedule from the current end to end + time_extension_value (3 minutes if blank); closed_at moves; bids' end_time updated; sealbid_allowed set — app/models/bid.rb:2256-2288, 369
2. (unverified: if time_extension_value is nil, trigger_dynamic_time_extension does nil * 60 → untyped exception in this background path — bid.rb:356-357)
3. BidTrade#update_dynamic_trade_end_time is never called (dead code) and its rank branch always returns false — bid_trade.rb:60-81, 131-143
4. Sealed bid stops DTE (is_dynamic_closing_time_allowed set false) — trade_controller_helper.rb:3880

### Live auction — sealed bid period after an extension
Buyer can switch a running auction to sealed bids once an extension has happened.
Rules: on trade#update carrying other_auction_indicators_config with is_sealbid_enabled=true, if sealbid_allowed (set by the first last-minute or dynamic extension), not yet enabled and the auction is running: sealbid_enabled = true, a sealbid_extension_time schedule of sealbid_extension_time minutes is added, dynamic time extension switched off, "sealbid_started" push sent — trade_controller_helper.rb:3877-3882, bid.rb:369, bid_trade.rb:126
Cites: trade_controller_helper.rb:3870-3884, trade_controller.rb:494-502

### trade#update — PATCH /api/trade/:id — change live auction indicators, English flag, remarks
Buyer (console) changes what vendors see during a live auction.
Checks, in order:
1. Stage not found → 4; project not latest → 101; policy update? → 455; company trade_mode sell → 101; RFQ locked by auction → 769; proposals submitted and end_time_type/increase_auction_time sent → 801 "You cannot edit the time as proposals are already submitted." (HTTP 422) — trade_controller.rb:399-440
2. is_english_auction_enabled applied only if is_english_auction_allowed — trade_controller.rb:482-484
3. other_auction_indicators_config (rank, best_price, traffic zones, top_n_limit_for_best_price) saved, returns success at once; save failure → 15 "Operation failed" (HTTP 422) — trade_controller.rb:494-502
4. auction_remark saved; failure → 472 "failed to add remark" (HTTP 422) — trade_controller.rb:534-538
Skipped: these early returns run BEFORE the status (active/draft/requested) and allowed-company checks at trade_controller.rb:590-599, so they also work on closed stages (defect-shaped)

### trade#update — PATCH /api/trade/:id — knockout/dutch live edits: round time, step, start price (part 1)
Buyer edits a running knockout/dutch auction (edit_type=knockout|dutch); sell orders flip price_difference sign — trade_controller.rb:511-532.
Checks, in order:
1. time_difference < 30 → 248 "Time difference cannot be less than 30 seconds"; now + time_difference > bid end → 245 "Time difference cannot exceed auction end time" (HTTP 422) — trade_controller.rb:848-852
2. Dutch price_difference that would pass end_price → 243 "Invalid Tick Size" (HTTP 422) — trade_controller.rb:853-863
3. bulk_price when a vendor already accepted the current round → 236 "Accepted bid exists. You cannot perform this action."; dutch sell start < end → 242, buy start > end → 241 (HTTP 422) — trade_controller.rb:864-875
State rules: a bulk_price edit voids the running round, restarts the same round now (new version) for time_difference, voids and regenerates later rounds; vendors get "current_offer_bulk_price_edit" — trade_controller.rb:925-953

### trade#update — PATCH /api/trade/:id — knockout/dutch live edits: end price, round extension, min quantity (part 2)
More buyer edits on a running knockout/dutch auction.
Checks, in order:
1. Dutch end_price already crossed by the next round → 244 "Invalid End Price" (HTTP 422); stage closed → 151 "Sorry, You cannot perform this action at this time" (HTTP 403) — trade_controller.rb:876-893
2. extend_time: the current round is voided and a longer copy saved FIRST; then if its end >= auction end → 235 "You cannot extend round time beyond auction expiry time. Please extend auction time first." (HTTP 422) — the void is not rolled back (defect-shaped) — trade_controller.rb:894-905
3. minimum_quantity_allowed on a dutch not closing on multiple vendors → 247 "Quantity is required in case of multiple vendor closing" (HTTP 422) — trade_controller.rb:910-922
4. increase_auction_time on knockout/dutch in rfx_project companies → 969 "Increasing auction time is not allowed in Dutch/Knockout auctions" (HTTP 422) — trade_controller.rb:555-560

### Live auction — add vendors to a live event (v1 trade#add_audience_live_auction)
PATCH /api/v1/trade/add_audience — buyer (console only) adds vendors to an active or draft stage. Body: id, audience_to_add (or audience_to_add_ids), update_remarks.
Checks, in order:
1. Stage not active/draft → 95 "Trade Request not found" (HTTP 422) — api/v1/trade_controller.rb:29-34
2. Policy (can view event) → 455; project not latest → 101 (HTTP 422) — v1/trade_controller.rb:35-36, trade_request_policy.rb:125-127
3. config is_user_allowed_to_modify_audience false and not super admin → 685 "You are not allowed to update the audience" (HTTP 422) — v1/trade_controller.rb:37, trade_request_model_helper.rb:936-941
4. audience_to_add blank → 2 "Insufficient parameters" (HTTP 422) — v1/trade_controller.rb:40
Side effects: blacklisted vendors silently dropped; audiences created or made visible; vendors added to future knockout/dutch rounds; "update_audience" mail; for an RFQ also added to the technical round (RFP) — common_controller_helper.rb:7-45. Response "Selected vendors successfully added to auction !"

### Live auction — remove vendors from a live event (v1 trade#remove_audience_live_auction)
PATCH /api/v1/trade/remove_audience — buyer (console only) removes vendors from an ACTIVE stage (draft not accepted, unlike add). Body: id, audience_to_remove (or _ids), update_remarks.
Checks, in order:
1. Stage not active → 95 (HTTP 422) — api/v1/trade_controller.rb:47-51
2. Policy → 455; project not latest → 101; audience modification disabled → 685 (HTTP 422) — v1/trade_controller.rb:52-54
3. audience_to_remove blank → 2 (HTTP 422) — v1/trade_controller.rb:57
4. RFI/RFP and the vendor has a latest form response → 512 "You cannot remove a vendor who has already participated." (HTTP 422) — v1/trade_controller.rb:59-62
5. Vendor (or its broker) has an active/selected/requested bid → 512 (HTTP 422) — v1/trade_controller.rb:64-66
Side effects: audience updated, vendor removed from line-item validations and knockout/dutch rounds — v1/trade_controller.rb:68-73

### Live auction — vendor accepts auction terms (v1 trade#accept_auction_tnc)
PATCH /api/v1/trade/:id/accept_auction_tnc — vendor website only (agribid_website, config/app_auth_config.yml:1964).
Checks, in order:
1. Stage not active → 4 "Request not found" (HTTP 422) — api/v1/trade_controller.rb:900-901
2. Policy accept_auction_tnc?: buyer company or one of the participants → else 455 (HTTP 422) — v1/trade_controller.rb:902, trade_request_policy.rb:68-72
3. Vendor company from the user's latest RFI/RFP response in the project, else audience ∩ user's workspaces; none → 101 (HTTP 422) — v1/trade_controller.rb:903-913
Side effects: accept_tnc_popup! records the acceptance for that vendor company — v1/trade_controller.rb:915

### Auction reminders — 24 hours and 30 minutes before start
Reminder e-mails to auction vendors.
Rules:
1. Queued on RFQ→auction conversion, on schedule edits of rfq_then_auction stages with extra closing time, and on auction reschedule — create_service.rb:295-315, trade_controller_helper.rb:597-614, trade_request.rb:2384-2413
2. Each job queued only if its send time is still ahead — create_service.rb:298, 307
3. On delivery the worker skips if the stage is not active, or if bid_start_time moved (send time off by more than 1 minute), so stale jobs after a reschedule do nothing — app/workers/email_notification_worker.rb:591-604
4. Recipients: audience users and pending invitations; "auction_reminder_manual" can target selected vendors — email_notification_worker.rb:606-625
Note: a draft auction (auction-team routing) mails only if active by then

### Auction params generator — Excel rows to create params (ParamsGenerator::AuctionParamsGenerationService)
Turns parsed template Excel rows into the JSON the event-create screen sends; used by templates#product_sheet_params.
Rules:
1. BOQ template → multistage data; only_product_sheet_params → data only; else configurations + widgets + data — auction_params_generation_service.rb:23-38
2. configurations: Event Mode, Event Strategy, schedule date/time → bid_start_time, Event Live Time (minutes) → bid_end_time, extra closing minutes, "Closing on Lot (Yes/No)" → lot_based / line_item_based (multi-row) — auction_params_generation_service.rb:49-85
3. Only creator-field widgets get data; product/location resolved from "<name> Code" columns; quantity carries the unit — auction_params_generation_service.rb:106-157
4. Global widgets: all is_required ones plus those with a value — auction_params_generation_service.rb:297-308
(unverified: an unknown unit gives nil and suffix.gsub('KG', nil) would raise → untyped 500, unless the excel validation filtered the row — auction_params_generation_service.rb:148-150, 343-347)

### Auction params generator — BOQ sheet side effects (creates units and products)
A BOQ product-sheet upload writes master data although it only returns params.
Side effects:
1. Units in the sheet unknown to the template are inserted as company Units — auction_params_generation_service.rb:349-366
2. A free-text "BOQ" product category is created if missing; free-text Products and a "Free Text" quality are bulk-inserted for each new line-item name — auction_params_generation_service.rb:159-200
3. A "Free Text" buyer hub (delivery location) is find-or-created and used for every line item — auction_params_generation_service.rb:161, 220-223
4. The "Section" value becomes line_item_no — auction_params_generation_service.rb:217

### trade — other auction actions (one line each)
- v1 trade#get_participated_auctions — GET /api/v1/trade/get_participated_auctions — vendor list of participated stages; hides stages where rebidding is blocked for the vendor — api/v1/trade_controller.rb:221-235
- trade#auction_report_data — GET /api/trade/:id/auction_report — buyer report data; unknown id fails T.must → untyped 500 (defect-shaped) — trade_controller.rb:1625-1629
- trade#update increase_auction_time / extra_closing_time — see the event edit/extend digest — trade_controller.rb:642-700

### templates#index — GET /api/templates — list default and saved templates (part 1: checks)
Buyer (console) lists templates. Params: type_identifier (trade, contract, rfi, boq, summary_view, po, vendor_onboarding, intake, document, vendor_onboarding_buyer_form, service, site_visit, vendor_assessment), exclude_type_identifiers (array or JSON string), hide_onboarding_v2_templates, item_type/item_id, intake_template_id, condition_id.
Checks, in order:
1. Policy index? (trade or template read_record) → 455 (HTTP 422) — templates_controller.rb:108, template_policy.rb:32-35
2. exclude_type_identifiers string that is not JSON → untyped 500 (defect-shaped) — templates_controller.rb:113-115
3. type_identifier or any excluded identifier outside the list → 2 "Insufficient parameters" (HTTP 422) — templates_controller.rb:118-123, template.rb:58-61
Company setting: vendor onboarding v3 always excludes site_visit — templates_controller.rb:117
Response: {"default": [...], "saved": [...]} — templates_controller.rb:139-143

### templates#index — GET /api/templates — which templates appear in default vs saved (part 2)
How the two lists are built.
Rules:
1. default = the company's template_type default templates plus global (company_id null) defaults unless company setting hide_default_templates; newest first — app/helpers/templates_helper.rb:4-21
2. saved = custom + dynamic templates of allowed companies, excluding module/custom_search — templates_helper.rb:23-53
3. type_identifier=service lists trade templates, service-tagged first — templates_helper.rb:62-76
4. rfi: saved list only templates created on/after 2022-07-30 — templates_helper.rb:44-46
5. hide_onboarding_v2_templates=true removes vendor_onboarding templates only on vendor onboarding v2 — templates_helper.rb:41-43
6. item_type/item_id keeps templates mapped to that item (e.g. a product category) — templates_helper.rb:216-231
7. Access lists: RFI templates always filtered, trade templates only with enable_template_access_filtering; super admins and Procol employees bypass — template.rb:148-164

### Template access rules — who may open a template (Template.get_authorized_template_with_id)
Used by templates#show, excel_template, product_sheet_params and edit_access_lists.
Checks, in order:
1. id blank or no active template → 4 "Request not found" (HTTP 422) — app/models/template.rb:117-122
2. Template of a company outside the user's allowed companies (user not a Procol employee) → 2 "Insufficient parameters" (HTTP 422); global templates pass — template.rb:123-126
3. RFI template and user not on its access list → 2 (HTTP 422); no super-admin bypass here — template.rb:127-129
4. Trade template, company setting enable_template_access_filtering on, user not super admin and not on the access list → 5 "Not authorized" (HTTP 422) — template.rb:130-135, app/models/company.rb:296-298

### templates#show — GET /api/templates/:id — open a template
Buyer (console) opens one template with its widgets.
Checks, in order:
1. Access rules → 4 / 2 / 5 (see "Template access rules") — templates_controller.rb:157-158
2. Policy show? (trade create_record or template read_record) → 455 (HTTP 422) — templates_controller.rb:159, template_policy.rb:9-12
Response: template; mapped widgets (default templates: widgets of the order type; custom: TemplateWidgetMapping widgets, validation widgets inherit input_group/prefix/suffix of their target column); order configs; shared_with; sharing_note; company widget_precision; linked summary-view (MQCs) template id — templates_controller.rb:161-173, templates_helper.rb:84-129
Side effects: template-seen event logged — templates_controller.rb:160

### templates#create — POST /api/templates — create a template (part 1: checks)
Buyer (console) saves a template. Body: name, template_for (array), order_type, widgets {inline_components, global_price_components} or forms (rfi/intake), configurations, template_type (default custom), template_mappings, item_type/item_id.
Checks, in order:
1. Policy create? (template create_record) → 455 (HTTP 422) — templates_controller.rb:11, template_policy.rb:18-20
2. name missing → 2 "Insufficient parameters" (HTTP 422) — app/services/templates/validate_service.rb:24-27
3. template_for missing, not an array, or unknown value → raises, untyped 500 (defect-shaped) — validate_service.rb:127-133
4. Trade without order_type buy/sell, or non-trade WITH order_type → 2 "Invalid Order Type" (HTTP 422) — validate_service.rb:135-147
5. RFI: forms missing/not array, or a form missing order/name/config.type/page_response_headers → raises, untyped 500; widget without key_attribute, field_type (creator/participant/formula) or name, or empty response headers → 792 with message "Invalid Form" (HTTP 422) — validate_service.rb:205-293

### templates#create — POST /api/templates — trade template widget checks (part 2)
Widget checks for template_for including trade (boq/service alone are not checked). All code 2, HTTP 422, with these messages.
Checks, in order:
1. Custom widget without configuration.is_replicable, or input_type product/buyer_hub → "Invalid Custom Widget" — validate_service.rb:50-72
2. Formula widget with empty/invalid formula, referencing itself, or an operand that is not a number/percentage/formula/dropdown/quantity widget → "Invalid Formula for <name>" — validate_service.rb:93-125
3. Widget without key_attribute → "Invalid column <name>"; repeated key_attribute → "Duplicate columns: <a> and <b>" — validate_service.rb:185-203
4. Dropdown with neither dropdown_data nor dropdown_options → "Please provide options for <name>"; without data_source → "Please provide data source for <name>" — validate_service.rb:74-90
5. inline_components or global_price_components missing → NoMethodError, untyped 500 (defect-shaped) — validate_service.rb:51, 59

### templates#create — POST /api/templates — save and side effects (part 3)
What happens after validation passes.
Rules:
1. Same name + company + template_type + order_type with overlapping type_identifier → 8 "Validation failed: Template name has already been taken" (HTTP 422) — template.rb:338-342, create_service.rb:58-60, templates_controller.rb:19
2. Any other save exception → 8 with the exception text — create_service.rb:58-60
3. type_identifier = "t-" + each template_for — create_service.rb:23-25
Side effects: creator gets owner access; optional product-category mapping; dropdown_options create/update a company data source; intake templates create approval conditions; default widget mappings (ceil/floor price, tick size, floor quantity, custom text) attached; onboarding-v3/assessment version jobs — create_service.rb:30-62, template.rb:91-94, 344-374

### templates#update — PATCH /api/templates/:id — edit a template (part 1: checks)
Buyer (console) edits a template; template_type honoured only for Procol employees.
Checks, in order:
1. No active template → 477 "Template not found" (HTTP 422) — templates_controller.rb:38-39
2. Policy update?: template update_record AND template company in allowed companies, so global default templates cannot be edited → 455 (HTTP 422) — templates_controller.rb:41, template_policy.rb:22-24
3. template_for invalid/missing → untyped 500 (raise) — update_validate_service.rb:9, validate_service.rb:127-133
4. Order type rule → 2 "Invalid Order Type" (HTTP 422) — update_validate_service.rb:10
5. Linked summary-view (MQCs) template and a widget's input_type changed → 840 "Cannot change input type as a MQCs template is linked." (HTTP 422) — validate_service.rb:149-183
6. template_type not default/custom/dynamic → 2 "Invalid Template Type" (HTTP 422) — update_validate_service.rb:37-45

### templates#update — PATCH /api/templates/:id — no-change rule, widget checks, save (part 2)
Remaining update checks and what gets overwritten.
Checks, in order:
7. name, widgets, configurations, forms blank, order_type and template_type unchanged → 758 "No changes found. Please update the template to continue." (HTTP 422) — update_validate_service.rb:15-21
8. RFI with forms → create's form checks (792 "Invalid Form") — update_validate_service.rb:23-25
9. Trade with widgets → create's widget checks (code 2) — update_validate_service.rb:27-32
10. Duplicate name → 8 (HTTP 422) — update_service.rb:41-48, templates_controller.rb:52
State rules: type_identifier always rebuilt from template_for; company_id set to the current workspace when not sent; dropdowns with dropdown_data drop dropdown_options, others update the data source — update_service.rb:22-24, 30-66, templates_controller.rb:44

### templates#destroy — DELETE /api/templates/:id — delete a template
Buyer (console) soft-deletes a template of the current workspace.
Checks, in order:
1. No active template with this id in the CURRENT workspace (global defaults included) → 477 "Template not found" (HTTP 422) — templates_controller.rb:80-84
2. Policy destroy? (= update?) → 455 (HTTP 422) — templates_controller.rb:85, template_policy.rb:37-39
3. Status update fails → 8 with model message (HTTP 422) — templates_controller.rb:86-88
State rules: template → in_active (not hard-deleted); intake templates also deactivate their template mapping, intake request condition and condition item mappings — templates_controller.rb:86-102

### templates#duplicate — POST /api/templates/:id/duplicate — copy a template
Copies a template (widgets, configurations, custom configurations) into the current workspace. Procol admin dashboard only: the buyer console is not listed, so it gets "This app is not authorized to use this API" (HTTP 401) and sign-out — config/app_auth_config.yml:730-745 vs 1391-1396.
Checks, in order:
1. Policy duplicate? (= show?) → 455 (HTTP 422) — templates_controller.rb:24, template_policy.rb:14-16
2. Template id not active → 477 "Template not found" (HTTP 422) — duplicate_service.rb:11, 36-37
3. No new name and the same name exists in the workspace → 8 "Validation failed: Template name has already been taken" (HTTP 422) — duplicate_service.rb:33-39, template.rb:338-342
Note: the source is not scoped to the user's companies — duplicate_service.rb:11. Default templates copy only this company's custom configurations — duplicate_service.rb:13-17. Copy owned by the current user — duplicate_service.rb:24-32

### templates#edit_access_lists — PATCH /api/templates/:id/access_lists — share a template
Buyer (console) shares a template. Body: shared_with [{shared_with_type User|Team, shared_with_id or shared_with_uuid, access_type}], client_company_id (Procol employees).
Checks, in order:
1. Procol employee without client_company_id → 2 (HTTP 422) — templates_controller.rb:298-300
2. Access rules → 4 / 2 / 5 — templates_controller.rb:301-302
3. Policy: template creator or an editor on its list (Procol employee must be CSM) → 455 (HTTP 422) — template_policy.rb:26-30
4. shared_with not an array → 2; unknown user/team → 101; access_type other than viewer → 2 (HTTP 422) — templates_controller.rb:305-306, access_lists/validate_service.rb:14-76, template.rb:71
5. After uuid decoding, users/teams must belong to the workspace → 101 (HTTP 422) — templates_controller.rb:308-319
(unverified: an entry with only shared_with_uuid fails step 4 with 101, since ids are decoded afterwards — templates_controller.rb:305-316)

### templates#product_sheet_params — POST /api/templates/product_sheet_params — Excel line items to create params
Buyer (console) uploads a template's product/BOQ sheet and gets line-item params back.
Checks, in order:
1. excel_data missing → 2 (HTTP 422) — templates_controller.rb:216-217
2. Access rules → 4 / 2 / 5 (no separate policy call) — templates_controller.rb:219-220
3. Sheet cannot be parsed → 15 with the parser's message (HTTP 422) — templates_controller.rb:233, 256
Rules: dynamic templates use DynamicTemplateBoqParser; others ExcelToJsonConversionService (excel_type default trade) + AuctionExcelValidationService + AuctionParamsGenerationService — templates_controller.rb:221-268
Response: {"valid": {data}, "in_valid": [rejected rows]} — templates_controller.rb:243-246
Side effects: sheet stored in UploadedReportLog; BOQ sheets create units/products — templates_controller.rb:395-403

### Template widgets on stage save — units, line items and saving configuration
How a template's line-item columns are checked when an RFQ/auction stage is created or edited (trade#template_input, template_input_trade_update, move_to_auction).
Checks, in order:
1. Row without a unit (creator_quantity suffix or product.unit_type) → 574 "Unit cannot be blank" (HTTP 422) — trade_template_helper.rb:1392-1397
2. Unit not defined for the company → 495, message "The unit(s) X are not present" (HTTP 422) — trade_template_helper.rb:1402-1416
3. Create without configurations, or edit of a non-active stage (BOQ may be edited after close) → 33 "Order not active" (HTTP 422) — trade_template_helper.rb:1418-1432
4. Company setting is_saving_configuration_mandatory, rfx_mode rfq/auction, no alternate bidding, savings_configuration missing → 719 "Saving Configurations is mandatory for Event" (HTTP 422) — trade_template_helper.rb:1436-1438
Rules: ceil_price, floor_price, tick_size, tick_size_percentage, floor_quantity become the line item's validations; dropdown values resolved to company data-source rows — trade_template_helper.rb:1445-1557

### Template widgets on stage save — auto-added columns, precision, dropdown URLs, per-unit globals
What add_data_for_templates adds to/changes in widgets copied onto the stage.
Rules:
1. Always: serial number (read, or hidden with tabs), status, action columns, gross_total global — trade_template_helper.rb:1726-1729, 1801-1814
2. Auctions: rank, loading factor, read-only "RFQ Price" (fast-bidding RFQ→auction), traffic-light colour, booked quantity, best ranking / best price — trade_template_helper.rb:1730-1800
3. Stage config widget_precision overrides every widget's precision key — trade_template_helper.rb:1816-1830
4. dropdown_data URLs get trade_request_uuid={{trade_request_uuid}}; a dropdown without dropdown_data raises → untyped 500 (defect-shaped; templates may hold only dropdown_options) — trade_template_helper.rb:1832-1841
5. Per-unit (input_group price) globals with more than one unit across line items → 486 "You cannot add multiple units in this template." (HTTP 422); else suffix = unit, prefix = currency — trade_template_helper.rb:1843-1854
6. RFI/RFP stages validate forms (792) instead — trade_template_helper.rb:1711-1720

### Template widgets on bid save — which line items and fields are taken
How a vendor's sheet (bids#template_input / bids#sheet_update) is mapped onto the stage's template widgets.
Rules:
1. A line item is included only if its price is > 0 (book building also needs participant_quantity); others are silently dropped, no error — trade_template_helper.rb:5613-5623, 5839-5851
2. Only custom inline widgets with field_type participant are copied from the vendor's row; creator columns sent by the vendor are ignored — trade_template_helper.rb:5803-5830
3. Global values are accepted only for keys that are global widgets on the stage — trade_template_helper.rb:5567-5580
4. Stage not found → 4 "Request not found" (HTTP 422); an unknown bid id in the counter-offer path raises → untyped 500 — trade_template_helper.rb:5548-5555

### Template widgets on bid save — is_required, mode_type, dropdown ids
Enforcement gaps for template field settings on a vendor bid.
Rules:
1. is_required on a participant global widget is enforced only in the Excel/AI commercial bid path: "Missing required field: <name>" with code 15 — app/services/bid_submit/commercial_bid_service.rb:219-245
2. mode_type is forced to read for vendor-uneditable auction fields (config uneditable_auction_fields_for_vendor) when the sheet is served — trade_template_helper.rb:72-76, 1602-1612
3. Formula globals not in write mode are ignored when detecting bid changes — bids_controller_helper.rb:2434-2436
(unverified: a participant dropdown id matching no active data-source row makes get_custom_widget_hash_for_bid_product call .configuration on nil → untyped 500 — bids_controller_helper.rb:2623-2630)

### templates — other actions (one line each)
- templates#upload_attachment — POST /api/templates/upload_attachment — name/data missing → 2; bad extension → 484 "File type not allowed"; upload failure → 902 with message "Upload failed" (HTTP 422) — templates_controller.rb:57-77
- templates#excel_template — GET /api/templates/excel_template/:id — sheet download; unknown sheet_type → 2 — templates_controller.rb:177-208
- templates#download_excel_template_for_rfi / upload_excel_for_rfi — missing excel_data → 2, parse error → 15 — templates_controller.rb:210-295
- templates#intake_template_setup — Procol admin only — templates_controller.rb:342-352, template_policy.rb:41-43
- templates#search, #get_templates — routes commented out — config/routes.rb:158, 161

## Error codes in this area

### Error codes — move to auction (1)
- 2 (HTTP 422) "Insufficient parameters" — add/remove audience (v1/trade_controller.rb:40, 57), templates#index (templates_controller.rb:119), template validation with custom messages (validate_service.rb:25, 68-69, 143-144)
- 33 (HTTP 422) "Order not active" — stage save without configurations (trade_template_helper.rb:1431), bids#create_bid outside bidding time (bids_controller.rb:50)
- 53 (HTTP 422) "Order Type not mentioned" — set_configurations_for_trade (trade_controller_helper.rb:3531)
- 93 (HTTP 422) "Trade is already of auction type" — trade#move_to_auction (trade_controller.rb:979)
- 94 (HTTP 422) "An auction has already been made for this event." — trade#move_to_auction (trade_controller.rb:973)
- 95 (HTTP 422) "Trade Request not found" — move_to_auction (trade_controller.rb:968), add/remove audience (v1/trade_controller.rb:33, 50)

### Error codes — move to auction (2)
- 101 (HTTP 422) "You are not allowed to perform this action" — move_to_auction (trade_controller.rb:971, 977), add/remove audience (v1/trade_controller.rb:36, 53), accept_auction_tnc (v1/trade_controller.rb:913), access lists (access_lists/validate_service.rb:52)
- 106 (HTTP 422) "Please enter a valid price" — knockout/dutch config (trade_controller_helper.rb:3453, 3483)
- 237 (HTTP 422) "Please enter all the required entries for creating the auction." — knockout/dutch config (trade_controller_helper.rb:3459, 3486)
- 238 (HTTP 422) "Time difference cannot be greater than auction time." — knockout/dutch config (trade_controller_helper.rb:3462, 3497)
- 241 (HTTP 422) "Start Price cannot be greater than End Price" — dutch sell config (trade_controller_helper.rb:3489), dutch buy bulk_price edit (trade_controller.rb:873)
- 242 (HTTP 422) "Start Price cannot be less than End Price" — dutch buy config (trade_controller_helper.rb:3493), dutch sell bulk_price edit (trade_controller.rb:871)

### Error codes — move to auction (3)
- 243 (HTTP 422) "Invalid Tick Size" — dutch config (trade_controller_helper.rb:3490, 3494), dutch price_difference edit (trade_controller.rb:857, 859)
- 248 (HTTP 422) "Time difference cannot be less than 30 seconds" — knockout config (trade_controller_helper.rb:3456), round time edit (trade_controller.rb:849)
- 269 (HTTP 422) "You have not provided valid traffic light ranges." — traffic light config (trade_controller_helper.rb:3440-3444)
- 501 (HTTP 422) "Invalid Trigger Time for Dynamic Time Extension." — dynamic extension config (trade_controller_helper.rb:3319)
- 503 (HTTP 422) "You cannot award entire lot when RFQ was done for partial lot." — reused by move_to_auction for the closing-mode change (trade_controller.rb:983)
- 798 (HTTP 422) "CBD mode requires at least two active line items. Please add more line items to continue." — move_to_auction (trade_controller.rb:998)

### Error codes — move to auction (4)
- 574 (HTTP 422) "Unit cannot be blank" — stage save / move_to_auction (trade_template_helper.rb:1395)
- 495 (HTTP 422) "Unit not found" (rendered as "The unit X is not present") — stage save / move_to_auction (trade_template_helper.rb:1415)
- 719 (HTTP 422) "Saving Configurations is mandatory for Event" — stage save only (trade_template_helper.rb:1437)
- 769 (HTTP 422) "You cannot edit rfq once the auction is created." — trade#update (trade_controller.rb:408), bids#create_bid (bids_controller.rb:40), bid reject (bids_controller.rb:414), new lot (trade_controller.rb:1825)
- 965 (HTTP 422) "Starting price cannot be less than the maximum global charge of RFQ bids" — move_to_auction (trade_controller_helper.rb:5807)
- 966 (HTTP 422) "Starting price cannot be more than the lowest RFQ (L1) Sum Total" — move_to_auction (trade_controller_helper.rb:5815)
- 968 (HTTP 422) "End price cannot be more than the lowest RFQ (L1) Sum Total" — move_to_auction dutch (trade_controller_helper.rb:5818)

### Error codes — live auction bids
- 7 (HTTP 422) "Kindly wait for the auction to start" (rendered as "Bidding starts at …") — companies#placed_bid_config (companies_controller.rb:631)
- 38 (HTTP 422) "Price cannot be more than the allowed price" — bid line check (bids_controller_helper.rb:1845)
- 41 (HTTP 422) "Price cannot be less than the allowed price" — bid line check (bids_controller_helper.rb:1854)
- 39 (HTTP 422) "Quantity cannot be less than the allowed quantity" — bid line check (bids_controller_helper.rb:1895)
- 138 (HTTP 422) "Quantity cannot be greater than the mentioned quantity." / 139 (HTTP 422) "Quantity cannot be less than the mentioned quantity." — bid line check (bids_controller_helper.rb:1903, 1907)
- 207 (HTTP 422) "Bid Quantity should be equal to the Auction Quantity" — bid line check (bids_controller_helper.rb:1899)
- 214 (HTTP 422) "Quoted price difference must be greater than the tick size" — bid revision (bids_controller_helper.rb:1877, 1889)
- 578 (HTTP 422) "Validation Failed" — custom validation widget (bids_controller_helper.rb:1912)

### Error codes — live knockout/dutch edits and audience
- 151 (HTTP 403) "Sorry, You cannot perform this action at this time" — dutch end_price edit on a closed stage (trade_controller.rb:885)
- 235 (HTTP 422) "You cannot extend round time beyond auction expiry time. Please extend auction time first." — round extend (trade_controller.rb:905)
- 236 (HTTP 422) "Accepted bid exists. You cannot perform this action." — bulk_price edit (trade_controller.rb:866)
- 244 (HTTP 422) "Invalid End Price" — dutch end_price edit (trade_controller.rb:880, 882)
- 245 (HTTP 422) "Time difference cannot exceed auction end time" — round time edit (trade_controller.rb:850)
- 247 (HTTP 422) "Quantity is required in case of multiple vendor closing" — dutch min quantity (trade_controller.rb:911)
- 969 (HTTP 422) "Increasing auction time is not allowed in Dutch/Knockout auctions" — trade#update (trade_controller.rb:557)
- 512 (HTTP 422) "You cannot remove a vendor who has already participated." — remove audience (v1/trade_controller.rb:61, 66)

### Error codes — audience, update, app gate
- 685 (HTTP 422) "You are not allowed to update the audience" — add/remove audience (v1/trade_controller.rb:37, 54)
- 801 (HTTP 422) "You cannot edit the time as proposals are already submitted." — trade#update time change (trade_controller.rb:439)
- 472 (HTTP 422) "failed to add remark" — trade#update auction_remark (trade_controller_helper.rb:3892)
- 455 (HTTP 422) "You are not authorized to perform this action" — any Pundit refusal (api_auth.rb:117-119)
- app_error_auth_failed (HTTP 401) "This app is not authorized to use this API" — action called from an app not listed in config/app_auth_config.yml, e.g. templates#duplicate from the buyer console (api_auth.rb:86-94)

### Error codes — templates (1)
- 4 (HTTP 422) "Request not found" — template access (template.rb:119, 122), accept_auction_tnc (v1/trade_controller.rb:901)
- 5 (HTTP 422) "Not authorized" — trade template with access filtering (template.rb:133)
- 8 (HTTP 422) "Model error" (message = model/exception text, e.g. "Validation failed: Template name has already been taken") — templates#create/update/destroy (templates_controller.rb:19, 52, 87), duplicate (duplicate_service.rb:39)
- 15 (HTTP 422) "Operation failed" — product sheet parse (templates_controller.rb:233, 256), trade#update indicator save (trade_controller.rb:500)
- 477 (HTTP 422) "Template not found" — templates#update/destroy (templates_controller.rb:39, 84), duplicate (duplicate_service.rb:37)
- 486 (HTTP 422) "You cannot add multiple units in this template." — stage save (trade_template_helper.rb:1848)

### Error codes — templates (2)
- 758 (HTTP 422) "No changes found. Please update the template to continue." — templates#update (update_validate_service.rb:19)
- 792 (HTTP 422) yml "Please fill all the required fields", rendered with message "Invalid Form" — template forms (validate_service.rb:213-216)
- 840 (HTTP 422) "Cannot change input type as a MQCs template is linked." — templates#update (validate_service.rb:150-153)
- 484 (HTTP 422) "File type not allowed" — templates#upload_attachment (templates_controller.rb:65)
- 902 (HTTP 422) yml "Only active or paused jobs can be cancelled", rendered with message "Upload failed" — templates#upload_attachment (templates_controller.rb:69)
