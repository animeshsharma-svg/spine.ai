# Event calculation services — backend digest (procol-backend origin/main ae36e86894)

## Overview
The services and model concerns that COMPUTE numbers for sourcing events: live auction indicators (rank, best price,
traffic light, loading factor), L1 / tie detection, savings (standard, default "negotiation margin", custom
realised/unrealised, vendor-specific), the precomputed comparison data (MQCS), formula evaluation (Dentaku and the
recursive inline/global evaluator), "Awarded <widget>" values, auto awarding, allocation summary, dormant price-anomaly
thresholds, bid context labels and smart-lot classification. Files: app/services/sourcing_engine/auction_indicators_service.rb,
app/services/event_indicators/*, app/models/concerns/savings_configuration_helpers/*, app/models/savings_configuration.rb,
app/poro_classes/vendor_specific_savings/*, app/workers/savings_calculator_worker.rb, app/workers/custom_savings_calculator_worker.rb,
app/services/precomputation_engine/*, app/services/formula_evaluator/*, app/services/auto_awarding_service.rb,
app/services/proposals/allocation_summary_evaluator.rb, app/services/anomaly_bid_detector/*, app/services/bid_context_label_service.rb,
app/services/lots/lot_splitting_service.rb. Controller-level rules live in trade-live-v1.md, bids.md and evaluation-award.md.
"Ranked statuses" below = Bid::VALID_STATUSES_TO_RANK = active, selected, requested — app/models/bid.rb:163.

### AuctionIndicatorsService — which bids and which indicators are computed
SourcingEngine::AuctionIndicatorsService builds the live indicator payload (per vendor: "global" lot values and "inline" per-line values).
Rules:
1. [state] Only bids in ranked statuses (active/selected/requested) are considered; revised, rejected, draft, revoked bids are dropped — app/services/sourcing_engine/auction_indicators_service.rb:11-12, app/models/bid.rb:163
2. [config] Indicator list = default_auction_indicator + get_possible_other_auction_indicators; "vendor_rank" is appended only when show_vendor_rank is passed; "best_price_only_on_gross_total" is always deleted from the list — auction_indicators_service.rb:18-20
3. [calculation] Ranking key is `buyer_rank` when the current user is a buyer and a separate buyer ranking widget is configured (config buyer_ranking_widget / _lot / _line), else `rank`; with no current user it is buyer_rank whenever configured — app/models/model_helpers/trade_request_model_helper.rb:1241-1251; auction_indicators_service.rb:10
Cites: auction_indicators_service.rb:7-38

### Auction indicator list per auction type — default and optional indicators
Rules:
1. [config] Defaults: rank-based → rank (+ best_price_only_on_gross_total when config auction_closing_mode = line_item_based); price-based → best_price_only_on_gross_total + best_price; traffic light → traffic_light_color; best_ranking_widget is prepended when that inline widget exists — app/models/model_helpers/trade_request_model_helper.rb:698-707
2. [config] Optional (other) indicators: rank, best_price, best_price_only_on_gross_total (+ loading_factor when loading factor is enabled), minus the defaults — trade_request_model_helper.rb:709-726
3. [config] Dutch, RFI and RFP stages get no optional indicators, except a dutch stage on an rfx project gets only rank; knockout gets only rank — trade_request_model_helper.rb:716-722
Cites: trade_request_model_helper.rb:698-726

### AuctionIndicatorsService — global (lot) rank and when it is blanked
Rules:
1. [calculation] Global rank per vendor = dense rank of trade_request.event_score_for_participants[company][ranking_key] (ascending for buy, descending when order_type = sell); if 2+ vendors share rank 1 every rank is shifted +1 — auction_indicators_service.rb:71, 205-219
2. [calculation] With loading factor enabled, each vendor's score gets its loading factor ADDED before ranking (see "Loading factor") — auction_indicators_service.rb:59-61
3. [visibility] Rank value is nil when the vendor has no score for the ranking key, or when trade_request.should_show_rank? is false — auction_indicators_service.rb:80-84
4. [visibility] should_show_rank? is false for RFQ stages; true when auction_config is rank / rank_and_price or other_auction_indicators_config['rank'] == true; for knockout and rfx-project dutch only the buying company sees ranks; v1 traffic light on rank → true — app/models/trade_request.rb:654-670
5. [calculation] Score lookup uses `scores.index(score.to_f)`: equal floats always resolve to the same rank — auction_indicators_service.rb:83
Example: buy, scores 100, 100, 120 → ranks "2", "2", "3" (nobody is L1).
Cites: auction_indicators_service.rb:57-121

### AuctionIndicatorsService — global best price
Rules:
1. [calculation] best_price = min of every participant's event-score `best_price` (max for sell); nil values are dropped; the SAME best price is returned under every vendor — auction_indicators_service.rb:72-76, 101-106
2. [config] Computed only when "best_price" is in the indicator list (best_price_only_on_gross_total was removed at init, so that branch never fires) — auction_indicators_service.rb:20, 72
3. [calculation] Display value goes through get_converted_display_value(price, "", "price", timestamp: trade created_at): no unit conversion, trailing zeros stripped, no rounding — auction_indicators_service.rb:104; app/controllers/concerns/common_controller_helper.rb:196-201
4. [calculation] best_price is NOT loading-factor adjusted and ignores TNA exclusion even when ranks do — auction_indicators_service.rb:73
Cites: auction_indicators_service.rb:72-106

### AuctionIndicatorsService — traffic light colour (lot level)
Rules:
1. [config] Lot colour is produced only when traffic_light_color is an indicator AND trade_request.misc["traffic_light_ranges"] is present — auction_indicators_service.rb:86
2. [calculation] Value compared = score_hash['color'] if present, else score_hash['rank'] (the raw rank score, not the dense rank) — auction_indicators_service.rb:87-91
3. [calculation] Bands use lower_bound / upper_bound from misc["traffic_light_ranges"]; forward-auction comparison is used only when the event is a forward auction AND not traffic-light-on-rank — auction_indicators_service.rb:92-95
4. [calculation] Colour formula: see "Traffic light colour bands" — app/models/bids_group.rb:381-397
Gaps: unlike EventIndicators::LotBased#color, this path never uses the dense rank for traffic-light-on-rank events; it compares the raw score — auction_indicators_service.rb:87-91 vs app/services/event_indicators/lot_based.rb:34-35
Cites: auction_indicators_service.rb:86-100

### AuctionIndicatorsService — loading_factor and vendor_rank indicators
Rules:
1. [calculation] loading_factor indicator value = loading_factor_hash[company].to_f (BOQ + baseline_cost_adjustment → get_loading_factor_for_boq_event, else get_loading_factor_for_company_ids) — auction_indicators_service.rb:62-66, 107-112
2. [config] loading_factor shown only when is_loading_factor_enabled? (config loading_factor_enabled AND (baseline_cost_adjustment or an auction stage)) and in the indicator list — auction_indicators_service.rb:107; trade_request_model_helper.rb:1560-1566
3. [calculation] vendor_rank = dense rank on the vendor `rank` key (not buyer_rank); when ranking key differs and loading factor is on, the loading factor is also added to `rank` before this — auction_indicators_service.rb:67-69, 77, 113-118, 221-226
4. [visibility] vendor_rank is nil when should_show_rank? is false — auction_indicators_service.rb:114
5. [config] show_vendor_rank comes from workspace CustomConfiguration display_vendor_rank_in_auction_qcs — app/controllers/api/v1/trade_controller.rb:541-542
Gaps: add_loading_factor_to_event_score_for_participants mutates the given score hashes in place (the trade's own event_score_for_participants in memory; double-load if later saved, unverified) — trade_request_model_helper.rb:1613-1618
Cites: auction_indicators_service.rb:57-121

### AuctionIndicatorsService — line-item (inline) rank and best_bidder flag
Rules:
1. [calculation] Per line: dense rank of trade_product.event_score_for_participants[ranking_key]; when the event group has evaluations, TNA vendors are removed first (get_event_score_for_participants_excluding_tna) — auction_indicators_service.rb:123-129; app/controllers/concerns/event_group_controller_helper.rb:2417-2427
2. [visibility] Inline rank value is "" (empty string, not nil) when should_show_rank? is false — auction_indicators_service.rb:144-148
3. [visibility] `best_bidder` (= this vendor's rank equals the lowest rank on the line) is computed and returned even when the rank itself is hidden — auction_indicators_service.rb:149
4. [calculation] With a tie at the best score every rank is shifted +1, so best_bidder is true for all tied vendors (rank 2) — auction_indicators_service.rb:149, 214-217
Gaps: best_bidder leaks "you are L1" while should_show_rank? hides the rank — auction_indicators_service.rb:145-150 (consumer is buyer-side; vendor exposure unverified)
Cites: auction_indicators_service.rb:123-151

### AuctionIndicatorsService — inline best price, best ranking widget, line traffic light
Rules:
1. [calculation] Inline best_price = min (max for sell) of the line's participants' best_price, shown only when the list is non-empty — auction_indicators_service.rb:130-133, 167-172
2. [calculation] Inline best_ranking_widget = best ranking score on the line (sorted ascending, reversed for sell) — auction_indicators_service.rb:134-135, 161-166
3. [calculation] Inline traffic_light_color = BidsGroup.get_color_for_bid_product for the vendor's LAST bid product on that line; only when trade_product.meta_data present; only for traffic-light events closed on line item — auction_indicators_service.rb:152-160; app/models/bids_group.rb:366-379
4. [calculation] Line colour value = the bid product's line rank when traffic light is on rank, else its rank score; bounds from trade_product.meta_data lower_bound/upper_bound — bids_group.rb:369-376
5. [calculation] Inline best price / best ranking widget include TNA vendors' prices only when the event group has no evaluations — auction_indicators_service.rb:125-131
Cites: auction_indicators_service.rb:123-175

### AuctionIndicatorsService — alternate bidding inline ranks
For alternate-bidding events (vendor quotes one of several alternate lines) ranks are computed across ALL lines together.
Rules:
1. [calculation] Scores of every participant on every trade product are pooled into one list and dense-ranked together; each vendor-line gets its rank from the pooled list — auction_indicators_service.rb:177-194, 205-207
2. [calculation] best_price = lowest pooled ranking score (highest for sell) — the ranking SCORE, not the best_price field — auction_indicators_service.rb:180-184
3. [visibility] Alternate-bidding inline ranks do NOT check should_show_rank? (shown even when rank display is off) — auction_indicators_service.rb:189-193
Gaps: should_show_rank? gate missing on the alternate-bidding path while present on the normal path — auction_indicators_service.rb:189-193 vs :145
Cites: auction_indicators_service.rb:177-203

### Who receives the auction indicator payload — event_indicators API and websocket push
Rules:
1. [visibility] GET /api/v1/trade/:id/event_indicators returns {} (HTTP 200) when event_masking_enabled?(user) (sealed bids locked, or closed-envelope / bidding-stats rules while running) — app/controllers/api/v1/trade_controller.rb:538-540; trade_request_model_helper.rb:258-270
2. [side-effect] On new_bid / edit_bid / revoke_bid the websocket "creator" channel body carries auction_identifiers + auction_identifiers_data (full per-vendor ranks/prices) — lib/modules/web_sockets.rb:29-32; lib/modules/push_notification.rb:688, 947, 2224
3. [visibility] Participant and "all" channels only receive {"reload_page": "true"} — web_sockets.rb:33-34
4. [calculation] In the websocket path there is usually no Current.user (Sidekiq), so ranks use buyer_rank whenever a buyer ranking widget is configured — trade_request_model_helper.rb:1249
Gaps: the websocket creator push has no event_masking_enabled? check, so buyer screens subscribed to the creator channel may receive ranks while the API masks them (unverified which users subscribe) — web_sockets.rb:29-32 vs trade_controller.rb:538
Cites: lib/modules/web_sockets.rb:26-54

### Dense rank with tie shift — RankCalculator details
Shared by EventIndicators::LineItemBased / LotBased (bids.md covers the basics).
Rules:
1. [calculation] scores = values of ranking_key, nils dropped, to_f; distinct values sorted ascending (descending for sell); rank = position + 1 — app/services/event_indicators/concerns/rank_calculator.rb:8-11, 22-25
2. [calculation] If more than one score equals the best, all ranks +1 (ties at L1 → everybody L2+) — rank_calculator.rb:26-29
3. [calculation] A participant with no score (or not in the hash) gets rank nil — rank_calculator.rb:13-14
4. [calculation] Ties below L1 are NOT shifted: 100, 120, 120 → 1, 2, 2 — rank_calculator.rb:23-29
Cites: rank_calculator.rb:1-33

### Traffic light colour bands — BidsGroup.get_color_within_range
Rules:
1. [calculation] Reverse (buy) logic: value <= lower_bound → "green"; lower_bound < value <= upper_bound → "yellow"; otherwise "red" — app/models/bids_group.rb:384-389
2. [calculation] Forward-on-price logic: value >= lower_bound → "green"; upper_bound <= value < lower_bound → "yellow"; otherwise "red" — bids_group.rb:390-395
3. [calculation] Any of value / lower / upper missing → nil (no colour) — bids_group.rb:382-383
4. [calculation] All comparisons use to_f, so a rank of 3 with bounds 2/4 is "yellow" — bids_group.rb:385-388
Cites: bids_group.rb:381-397

### EventIndicators::LineItemBased — best price, best score, tie on L1
Rules:
1. [calculation] best_price / best_score = first of the line's participants' values (best_price or ranking key) sorted ascending (reversed for sell); nil when the score hash is blank — app/services/event_indicators/line_item_based.rb:51-72
2. [calculation] get_company_ids_with_best_price_or_score returns every company whose value.to_f == best value (ties → several ids); [] when best value blank — line_item_based.rb:20-30
3. [calculation] tie_on_l1? = more than one participant's raw ranking value == best score — line_item_based.rb:44-49
4. [calculation] Default ranking_key is 'rank' unless the caller passes one — line_item_based.rb:12
Gaps: tie_on_l1? compares raw stored values with a Float (no to_f) and does NOT exclude TNA vendors, while top_n_ranked_participants_score_entries does — so a TNA vendor tied at the best score aborts auto awarding as a tie — line_item_based.rb:44-49 vs :34-37
Cites: line_item_based.rb:1-74

### EventIndicators::LineItemBased — top-N ranked entries (L1 for a line)
Rules:
1. [calculation] Returns [company_id, score_hash] entries sorted by ranking key ascending (reversed for sell), first n — app/services/event_indicators/line_item_based.rb:32-42
2. [state] When the event group has evaluations, TNA vendors are excluded before sorting — line_item_based.rb:34-37
3. [calculation] Returns nil when trade_product.event_score_for_participants is nil — line_item_based.rb:33
4. [calculation] Ties are NOT broken by any rule: equal scores keep hash order (first bidder stored first, unverified) — line_item_based.rb:38
Gaps: entries without the ranking key are not filtered (LotBased filters them): sort_by on a nil next to a Float raises ArgumentError → untyped 500 in L1 lookups (auto award, l1_data_for_event, lot L1 amount) — line_item_based.rb:38 vs app/services/event_indicators/lot_based.rb:60-62
Cites: line_item_based.rb:32-42; callers app/controllers/concerns/event_group_controller_helper.rb:822, trade_template_helper.rb:399, app/services/auto_awarding_service.rb:67

### EventIndicators::LotBased — rank and the loading-factor ordering bug
Rules:
1. [calculation] rank = dense rank (with tie shift) of trade_request.event_score_for_participants for company_id — app/services/event_indicators/lot_based.rb:20-27
2. [calculation] Intended: when loading factor is enabled, loading factor is added to the scores at init — lot_based.rb:15
3. [visibility] Vendor cards: rank shown only while auctioning, should_show_rank?, closed on lot, not sealed for a vendor, and the vendor has "enough revisions" — app/serializers/trade_request/card_serializer.rb:636-653
Gaps: @ranking_key is assigned AFTER it is used on line 15, so add_loading_factor_to_event_score_for_participants receives ranking_key nil and adds NOTHING — LotBased ranks, best score, top-N (auto award L1, card rank, reports) ignore the loading factor while AuctionIndicatorsService applies it — lot_based.rb:15-16; trade_request_model_helper.rb:1613-1616
Cites: lot_based.rb:11-27

### EventIndicators::LotBased — traffic light colour for a vendor
Rules:
1. [calculation] nil when no scores, not traffic-light bidding, or misc traffic_light_ranges blank — app/services/event_indicators/lot_based.rb:29-32
2. [calculation] Value = dense rank when traffic light is on rank; else participant score 'color', else 'rank' score — lot_based.rb:34-40
3. [calculation] Same band formula as BidsGroup.get_color_within_range; forward logic only for forward auction on price — lot_based.rb:41-44
4. [visibility] Card serializer shows a colour only while auctioning; for sealed bids non-buyers get nil — card_serializer.rb:656-660
Gaps: for a company with no score in a scored event (vendor who has not bid yet, on-price mode), participant_score is nil and participant_score['color'] raises NoMethodError → untyped 500 on the card — lot_based.rb:33-39
Cites: lot_based.rb:29-45

### EventIndicators::LotBased — top-N vendors and default-savings best amount
Rules:
1. [calculation] get_top_n_ranked_participant_ids: vendors with a ranking-key value, sorted ascending (reversed for sell), first n — app/services/event_indicators/lot_based.rb:59-66
2. [calculation] get_best_amount_for_default_savings: for each ranked-status bid, Σ(bid product price × trade_product.quantity) over its bid products that are not in_active/negotiated; best = min for buy, max for sell — lot_based.rb:78-91; app/models/bid.rb:1220-1228; app/models/bid_trade_product.rb:68
3. [calculation] The amount uses the BUYER quantity (trade_products.quantity), not the vendor's quoted quantity, and the base `price` only (no taxes/charges) — lot_based.rb:81
Gaps: a bid product with nil price makes `btp[0] * btp[1]` raise → savings worker crash — app/models/bid.rb:1225
Cites: lot_based.rb:59-91

### EventIndicators::LotBased / TradeProduct — realised and unrealised amounts
Used by custom savings.
Rules:
1. [calculation] Realised amount (lot) = Σ over lines of Σ selected bid products price × quantity — app/services/event_indicators/lot_based.rb:93-101; app/models/trade_product.rb:713-719
2. [calculation] Possible best amount (unrealised) per line: walk ACTIVE bid products in their loaded order, filling trade_product.quantity: whole btp quantities until the remainder fits, then price × remainder — trade_product.rb:695-711
3. [calculation] If active quantity is short of the line quantity, the sum of all active btps is returned (no error) — trade_product.rb:701-710
Gaps: `btps.reverse if sell?` discards its result, so sell events fill from the same order as buy events — trade_product.rb:700. Order is the association's load order, not an explicit price sort (comment says "ordered by price", unverified) — trade_product.rb:698-699
Cites: trade_product.rb:695-719

### Loading factor — what is added to a vendor's lot score
Rules:
1. [calculation] Per line loading factor = best best_price on that line (min, max for sell) × trade_product.quantity; 0 when no prices — app/models/trade_product.rb:788-793
2. [calculation] Non-BOQ: a vendor's loading = Σ loading factors of lines where it is regretted, or TNA while allow_tna_vendors_to_bid is not true — app/models/model_helpers/trade_request_model_helper.rb:1568-1586
3. [calculation] BOQ (with baseline cost adjustment in indicators / always in add_loading_factor): loading = Σ loading factors of lines the vendor has NO bid product on — trade_request_model_helper.rb:1588-1603, 1607-1611
4. [calculation] Loaded score = score + loading (to_f) — trade_request_model_helper.rb:1614-1616
Gaps: the BOQ path counts bid products of ANY status (draft, rejected, in_active) as "bid on", so a rejected/draft line escapes the loading — trade_request_model_helper.rb:1592-1599
Cites: trade_request_model_helper.rb:1560-1619

### Savings — standard formulas and rounding (SavingsCalculator)
Rules:
1. [calculation] Buy: savings_amount = reference_price − value; savings_percent = ((reference_price − value) / reference_price) × 100 — app/models/concerns/savings_configuration_helpers/savings_calculator.rb:53-57
2. [calculation] Sell: savings_amount = value − reference_price; percent = ((value − reference_price) / reference_price) × 100 — savings_calculator.rb:58-60
3. [calculation] `value` = the bid's (or bid product's) get_value(reference_on_key_attribute); lot-based configurations always use gross_total — savings_calculator.rb:38, 85-87
4. [calculation] Amount is not rounded; percent is round(2) — savings_calculator.rb:69-72
5. [calculation] Per-unit references (reference_on_key_attribute "price") are unit-converted for display (round 6, truncated to 4 decimals); other references only strip trailing zeros — app/models/concerns/savings_configuration_helpers/savings_formatter.rb:36-55; app/controllers/concerns/utils.rb:623-628
Cites: savings_calculator.rb:53-93

### Savings — which references are reported (get_all_savings)
Rules:
1. [calculation] One savings entry per reference price in the configuration — app/models/concerns/savings_configuration_helpers/savings_calculator.rb:35-50
2. [visibility] A NEGATIVE savings for the "default" strategy is dropped (not reported); negative savings for budget / historical etc. are reported — savings_calculator.rb:41-43
3. [state] Trade-level calculate_savings works only for lot-based configurations and a Bid; product-level only for a BidTradeProduct of that same trade product; anything else → nil — savings_calculator.rb:15-32
4. [config] A reference whose value is nil is discarded when the configuration is read; a 0 value is kept — app/models/savings_configuration.rb:124, 241
Gaps: SavingsConfiguration.read sets reference_prices to nil when every reference value is nil, but get_all_savings calls reference_prices.each without a nil guard → NoMethodError (untyped 500 / precomputation crash) — savings_configuration.rb:241; savings_calculator.rb:37
Cites: savings_calculator.rb:15-50

### Savings — Dentaku evaluation, zero reference and missing values
Rules:
1. [calculation] Formulas are evaluated by Dentaku (gem 3.5.4) through FormulaEvaluatorService#evaluate (non-bang), result to_f — app/models/concerns/savings_configuration_helpers/savings_calculator.rb:77-93; app/services/formula_evaluator/formula_evaluator_service.rb:11-15; Gemfile.lock:227
2. [calculation] Reference price 0 → percent formula divides by 0; Dentaku's non-bang evaluate returns nil on its errors, so percent becomes 0.0 (unverified gem behaviour) — savings_calculator.rb:56, 71-72
3. [calculation] A nil bid value (unbound variable) also makes evaluate return nil → amount "0.0" and percent 0.0 instead of reporting the full reference (unverified gem behaviour) — savings_calculator.rb:86, 92
Gaps: zero reference and missing quote both display as 0 savings rather than an error or blank (defect-shaped, unverified) — savings_calculator.rb:67-75
Cites: savings_calculator.rb:67-93

### Savings data for a line / a stage (fetch_savings_data_for_*)
Rules:
1. [calculation] Line: savings_amount = reference − best btp value (negated for sell); 0 when there is no best btp — app/models/concerns/savings_configuration_helpers/savings_calculator.rb:104-110
2. [calculation] If the inline widget for the reference key has input_group "price", reference and savings are multiplied by quantity: trade_product.quantity for the "default" strategy, otherwise the best btp's quantity — savings_calculator.rb:113-120
3. [calculation] Stage: savings_amount is read back from misc["savings_data"] for each strategy (written by SavingsCalculatorWorker), to_f — savings_calculator.rb:135-153
Gaps: for a non-default strategy with no best btp, quantity is nil.to_f = 0, so the reference is zeroed too — savings_calculator.rb:113, 117-119
Cites: savings_calculator.rb:95-153

### Lot savings aggregation (get_aggregate_savings_on_lot_savings)
Rules:
1. [config] Returns nil when show_default_savings? is false (config show_default_savings, default true) and the first strategy is "default" — app/controllers/concerns/trade_template_helper.rb:224-227; app/models/model_helpers/trade_request_model_helper.rb:998-1000
2. [calculation] Returns nil when every strategy's best amount is 0 (treated as "no bid placed") — trade_template_helper.rb:228-229
3. [calculation] savings = reference − best (buy) or best − reference (sell); percent = Utils.get_percent(savings, reference, precision: 2) = (savings.to_f / reference) × 100 rounded to 2 — trade_template_helper.rb:241-244; app/controllers/concerns/utils.rb:907-911
4. [calculation] Currency symbol: the trade's default currency; multi-currency stages use the trade currency's code or symbol per default_currency_label_type — trade_template_helper.rb:231-236
5. [calculation] A tolerance_percent widget targeting the strategy key adds tolerance_percent to the entry — trade_template_helper.rb:215-222, 249-255
Gaps: reference 0 → percent "Infinity"/"NaN" string (float division); a strategy with no best amount (nil) makes `reference − nil` raise TypeError → worker crash — trade_template_helper.rb:241-244
Cites: trade_template_helper.rb:224-259

### Line savings aggregation (get_aggregate_savings_on_line_savings / get_aggregate_savings_info)
Rules:
1. [calculation] Closed on lot: the best-PRICE vendor's (last of the tied ids) latest ranked bid supplies every line — app/controllers/concerns/trade_template_helper.rb:275-294
2. [calculation] Closed on line: per line, the best-price vendor's latest bid product (statuses active/selected/requested/revised) is used — trade_template_helper.rb:296-311, 350-357
3. [calculation] Per-unit references: savings and reference are multiplied by the display quantity (creator_quantity for "default", participant_quantity otherwise) — trade_template_helper.rb:487-497
4. [calculation] Totals per strategy summed in BigDecimal; percent = total_savings / total_reference × 100; amount, percent and reference rounded to widget_precision (default 2) and trailing zeros stripped — trade_template_helper.rb:502-514
5. [config] Lines are skipped when default savings are hidden or a default line has no savings — trade_template_helper.rb:470
Gaps: total_reference 0 → BigDecimal NaN/Infinity rendered as "NaN" (unverified on prod bigdecimal 3.1.8) — :504; reference_prices nil → `.first` NoMethodError — :469-470
Cites: trade_template_helper.rb:262-318, 449-532

### Default savings ("negotiation margin") — reference prices
When the buyer configured no savings, auctions/RFQs get a "default" strategy whose reference is the best FIRST quote.
Rules:
1. [config] Added only for auction or RFQ stages with at least one ranked-status bid; lot vs line follows config auction_closing_mode — app/workers/savings_calculator_worker.rb:53-55; app/services/reporting_engine/concerns/report_data_generator.rb:262-293, 577-578
2. [calculation] Lot reference = min (max for sell) over vendors of the vendor's EARLIEST bid's Σ price × trade_product.quantity; bids rejected/draft/in_active/revoke/pending/anomaly_detected excluded — report_data_generator.rb:446-466; app/models/bid.rb:1220-1228
3. [calculation] Line reference = min (max for sell) over vendors of each vendor's earliest bid-product price (statuses except rejected/draft/in_active/negotiated) — report_data_generator.rb:468-496
4. [calculation] A line whose only bid products are "revised" gets no default reference — report_data_generator.rb:471-473
Cites: report_data_generator.rb:446-496, 577-593

### Default savings — hiding negative results
Rules:
1. [config] SavingsCalculatorWorker sets config show_default_savings = true unless it was explicitly false — app/workers/savings_calculator_worker.rb:34-36
2. [config] If the first aggregated savings entry is the "default" strategy and its amount is negative, show_default_savings is set to false (persisted with update_columns) — savings_calculator_worker.rb:38-41, 47
3. [config] The same flip happens when a report computes line savings — app/services/reporting_engine/concerns/report_data_generator.rb:510-520
4. [visibility] Reports skip "default" savings whose amount is negative — report_data_generator.rb:611-612
Gaps: the flip is one-way inside the worker; once false it is never set back to true when later savings turn positive — savings_calculator_worker.rb:36
Cites: savings_calculator_worker.rb:26-48

### Custom savings (realised / unrealised) — references and validity
Rules:
1. [config] Only for companies with show_custom_savings?; strategies: realised and unrealised, both lot_based — app/workers/custom_savings_calculator_worker.rb:13; app/models/savings_configuration.rb:73-76
2. [state] realised is valid when at least one bid of the stage is selected; unrealised when NO bid is selected — savings_configuration.rb:245-261
3. [calculation] Reference = Σ over lines of the best INITIAL amount: each vendor's first bid product, sorted by price (desc for sell), filling quantity (selected quantity for realised, line quantity for unrealised) — savings_configuration.rb:341-352; app/models/trade_request.rb:2653-2662; app/models/trade_product.rb:721-740
4. [calculation] Bid products of status rejected/draft/in_active/revoke/pending/anomaly_detected are excluded from the reference — savings_configuration.rb:354-356
5. [calculation] Final amount: realised = selected btps price × quantity; unrealised = possible best amount (see LotBased realised/unrealised) — savings_configuration.rb:168-188
Cites: savings_configuration.rb:245-356

### Custom savings — update/validity defects
Rules:
1. [calculation] calculate_custom_savings_references keeps valid strategies (updating their reference), removes invalid ones, and adds missing valid ones — app/models/savings_configuration.rb:264-301
Gaps:
- update_reference_price: `reference_price unless key matches` discards its value, so EVERY reference in the configuration is overwritten with the value for the key being updated (e.g. updating realised also rewrites unrealised) — savings_configuration.rb:210-216
- get_custom_valid_keys: `false if comparison_on != savings_comparison_on` is a no-op, so the lot/line comparison filter never applies — savings_configuration.rb:246-249
- unrealised validity says "trade should be expired" but only checks that no bid is selected — savings_configuration.rb:253-255
Cites: savings_configuration.rb:210-261

### SavingsCalculatorWorker — when it runs and when it skips
Rules:
1. [time] Scheduled at closed_at + 5 s when a stage is created/published/closed_at changes/goes active (not RFI/RFP, not knockout/dutch); CustomSavingsCalculatorWorker at +7 s — app/models/trade_request.rb:342-355
2. [time] Also re-scheduled at new end + 5 s on schedule extension, at +5 s after an approval resolves, and on PR amendment — app/models/trade_schedule.rb:168-169; app/services/approvals/resolve_approval.rb:66-68; app/services/purchase_requests/amendment_service.rb:792
3. [state] Skips when the stage is missing, closed_at is still in the future, or status not active/closed — app/workers/savings_calculator_worker.rb:9-12
4. [state] Skips when the stage has no ranked-status bid — savings_calculator_worker.rb:14-17
5. [side-effect] After computing, deletes every other scheduled SavingsCalculatorWorker job for the same stage — savings_calculator_worker.rb:23, 60-65
Gaps: a stage with closed_at nil makes `nil > DateTime.now` raise NoMethodError — savings_calculator_worker.rb:9
Cites: savings_calculator_worker.rb:6-24 (queue rt_low :4)

### SavingsCalculatorWorker — what it writes
Rules:
1. [side-effect] misc["savings_data"] = get_aggregate_savings_for_trade (lot or line aggregation + lot-based custom savings appended) via raw SQL jsonb_set — app/workers/savings_calculator_worker.rb:33, 42, 67-74; app/controllers/concerns/trade_template_helper.rb:188-213
2. [side-effect] config show_default_savings updated with update_columns — savings_calculator_worker.rb:34-47
3. [side-effect] Sends the event group's Clara system message and invalidates the MCP cache — savings_calculator_worker.rb:21-22
4. [state] Without a savings_configuration nothing is written — savings_calculator_worker.rb:29-32
Gaps: savings JSON is interpolated into SQL inside single quotes without escaping; any apostrophe in the data (e.g. a currency label) breaks the UPDATE — savings_calculator_worker.rb:68-73. If misc is NULL, jsonb_set returns NULL (unverified) — :70
Cites: savings_calculator_worker.rb:26-74

### CustomSavingsCalculatorWorker — custom savings recompute
Rules:
1. [time] Runs closed_at + 7 s, on schedule extension, after approval, and 2 s after a bid becomes selected from active/pending/requested (company show_custom_savings?) — app/models/trade_request.rb:353; app/models/bid.rb:2220-2225
2. [state] Skips if stage missing, not active/closed, or closed_at in the future — app/workers/custom_savings_calculator_worker.rb:9-12
3. [side-effect] Writes misc["custom_savings_configuration"] and each line's meta_data["custom_savings_configuration"] (lot_based) — custom_savings_calculator_worker.rb:14-31
4. [side-effect] Unlike SavingsCalculatorWorker it does NOT delete duplicate scheduled jobs (call commented out) — custom_savings_calculator_worker.rb:33
Gaps: TradeProduct.update_meta_data puts meta_data.to_json in a single-quoted SQL literal without escaping; an apostrophe in any meta_data value aborts the update — app/models/trade_product.rb:305-317
Cites: custom_savings_calculator_worker.rb:6-34 (queue rt_medium :4)

### Vendor-specific savings — lot reference per vendor
A reference value stored per vendor (misc vendor_specific_savings_configuration) instead of one reference for all.
Rules:
1. [validation] savings_comparison_on must be lot_based or line_item_based → ArgumentError "Should be from Valid Savings Comparison On"; a TradeProduct cannot be lot_based → "Trade Product can't have savings comparison based on lot" — app/poro_classes/vendor_specific_savings/reference.rb:94-99
2. [calculation] Lot: final = vendor's LAST ranked-status bid get_value(reference_on_key_attribute); savings = reference − final (buy) / final − reference (sell); percent = savings / reference × 100 — app/models/concerns/savings_configuration_helpers/vendor_specific_savings_calculator.rb:6-12; reference.rb:56-79
3. [calculation] Vendor without a stored reference → {} (no entry) — reference.rb:57-58
Gaps: reference 0 → savings/0 (Integer → ZeroDivisionError 500; Float → Infinity); both Integer values → integer division truncates the percent (e.g. 100/1000 → 0%); vendor with a reference but no ranked bid → `reference − nil` TypeError — reference.rb:61, 77-78
Cites: reference.rb:56-86

### Vendor-specific savings — "Realised Price Drop" on lines
Rules:
1. [state] Only the vendor's latest SELECTED bid and its selected bid products count ("hardcoded" for realised price drop) — app/models/concerns/savings_configuration_helpers/vendor_specific_savings_calculator.rb:17-24
2. [calculation] savings = Σ line savings × selected quantity; reference = Σ line reference × selected quantity; percent = savings / reference × 100; reported on key gross_total — vendor_specific_savings_calculator.rb:30-39
3. [calculation] Aggregate per-line view multiplies reference and final by quantity only when the widget's input_group is "price" — app/poro_classes/vendor_specific_savings/reference.rb:70-76
4. [config] Shown when config vendor_specific_realised_price_change is set — app/models/model_helpers/trade_request_model_helper.rb:1446-1448
Gaps: `return [] if selected_bid.blank?` inside the strategy loop throws away lot savings already computed for earlier strategies — vendor_specific_savings_calculator.rb:19; a line without that strategy gives nil reference object → NoMethodError — :26-28; reference 0 → percent NaN/Infinity — :33
Cites: vendor_specific_savings_calculator.rb:4-44

### Savings visibility — buyer only
Rules:
1. [visibility] Quote/sheet data sets show_savings_data = true only when the caller's allowed companies include the buying company; vendors get false — app/controllers/concerns/trade_template_helper.rb:2107-2122
2. [visibility] savings_with_strategy (per line) and vendor_specific_savings (line and global) are attached only when show_savings_data — trade_template_helper.rb:3698-3708, 3805-3807
3. [visibility] For vendors, hide_auction_indicators = sealbid_enabled, and best price in order details only after the vendor company has bid — trade_template_helper.rb:2120, 2125
Cites: trade_template_helper.rb:2105-2126

### Display rounding helpers used by calculations
Rules:
1. [calculation] Utils.get_converted_display_value: unit-transform, round(6), then truncatize_upto_two_decimals which actually keeps up to FOUR decimals (truncation, not rounding), then strips trailing zeros — app/controllers/concerns/utils.rb:623-628; config/initializers/string.rb:102-115
2. [calculation] CommonControllerHelper#get_converted_display_value (used for indicators) does NOT round or truncate — app/controllers/concerns/common_controller_helper.rb:196-201
3. [calculation] Utils.get_percent(amount, reference, precision) = amount.to_f / reference × 100, rounded only if precision given — utils.rb:907-911
4. [calculation] Utils.strip_trailing_zero removes trailing zeros (and the dot) only when the string has a "." — utils.rb:641-647
Gaps: truncatize splits on "." so a value rendered in scientific notation ("1.0e-05") becomes "1.0e-0" (unverified reachable) — string.rb:104-111; the method name says two decimals but keeps four — :111
Cites: utils.rb:623-647, 907-911

### FormulaEvaluatorService — Dentaku wrapper for widget formulas
Rules:
1. [calculation] evaluate(formula, variables) = Dentaku::Calculator#evaluate; variables are the formula identifiers (tokenizer "identifier" tokens, unique) — app/services/formula_evaluator/formula_evaluator_service.rb:11-20
2. [calculation] calculate(key_attr_vs_formula, widgets): widget hashes are reduced to value (or display_value), solved together; formulas resolving to "undefined" are dropped and returned separately — formula_evaluator_service.rb:31-41
3. [calculation] valid_infix_notation? returns false on any parse exception (used to validate formula syntax) — formula_evaluator_service.rb:22-29
4. [calculation] substitue_percentage_formula_keys: a formula that contains its own key (except trade_credit_discount) gets that key replaced by the current value — formula_evaluator_service.rb:59-69
5. [calculation] calculate_widget_formula fills missing dependent widgets recursively, result to_f (nil → 0.0) — formula_evaluator_service.rb:48-57
Gaps: calculate_widget_formula has no cycle guard: two formulas that reference each other recurse until SystemStackError — formula_evaluator_service.rb:48-54
Cites: formula_evaluator_service.rb:1-76

### RecursiveFormulaEvaluatorService — inline and global formula rules
Rules:
1. [calculation] Non-formula inline widgets (not formula/action/product/delivery_location/attachment) become per-line BigDecimal values; missing values → 0.0 — app/services/formula_evaluator/recursive_formula_evaluator_service.rb:76-96
2. [calculation] A global field already in global_values is returned as-is; a global without formula → 0.0; a formula result nil → 0.0 — recursive_formula_evaluator_service.rb:167-185
3. [calculation] An inline field used in a global formula resolves to the array of all line values (for SUM) — :116-120, 228-237
4. [calculation] percent_and_amount global fields resolve to percent_distribution × the global value — :107-108
5. [validation] Cycle → StandardError "Circular dependency detected: …"; depth ≥ 100 → "Recursion depth limit exceeded: Maximum depth of 100 …" (raised, untyped 500) — :128-139
Gaps: usage-examples.md says maximum depth is 10 (twice); code is 100 — app/services/formula_evaluator/usage-examples.md:9, 294 vs recursive_formula_evaluator_service.rb:6
Cites: recursive_formula_evaluator_service.rb:1-239

### RecursiveFormulaEvaluatorService — percent distribution (partial award share)
Rules:
1. [calculation] percent_distribution = Σ(awarded_quantity × price) / Σ(participant_quantity × price) over the line items; lines without awarded_quantity contribute 0 to the numerator — app/services/formula_evaluator/recursive_formula_evaluator_service.rb:37-47
2. [calculation] It is computed in the constructor, for every evaluation — recursive_formula_evaluator_service.rb:19
Gaps: a line item with nil participant_quantity or price raises NoMethodError (nil * …) in the constructor; the usage-examples "Complex Example" (no price/participant_quantity) would crash this way — :42, usage-examples.md:113-138. Σ participant amount 0 → BigDecimal 0/0 = NaN (or ZeroDivisionError, unverified on bigdecimal 3.1.8) and every percent_and_amount field becomes NaN — :46
Cites: recursive_formula_evaluator_service.rb:37-47

### "Awarded <widget>" values — awarded quantity widgets
Template config awarded_quantity_widget_keys adds "Awarded X" global columns computed on awarded quantity.
Rules:
1. [config] Only when the template has awarded_quantity_widget_keys; values need a vendor and an award proposal, else nothing is computed — app/controllers/concerns/awarded_quantity_widgets_helper.rb:37-39, 182-184
2. [calculation] Uses the vendor's LATEST bid on the latest commercial stage; per line: all non-formula inline values, price (nil → 0.0) and awarded_quantity from the proposal — awarded_quantity_widgets_helper.rb:186-205, 101-134
3. [calculation] If any line has awarded_quantity > 0: every "participant_quantity" in widget keys and formulas is replaced by "awarded_quantity" and the global formula is re-evaluated recursively; otherwise every awarded widget = 0 — :207-230, 154-162
4. [visibility] Column name "Awarded " + name, key "awarded_" + key; currency prefix replaced by the default currency symbol — :62-72
Gaps: a key in awarded_quantity_widget_keys that is not a global price component gives original_widget nil → `nil['value']` NoMethodError (500) — :55-59
Cites: awarded_quantity_widgets_helper.rb:23-233

### PrecomputationEngine::BidServiceV1 — vendor-level comparison data
Runs (PrecomputationEngineWorker "precompute_bid") after a bid changes; fills event_groups.precomputed_data_v1 used by MQCS.
Rules:
1. [state] Stage in_active / draft / cancelled → full refresh of the event group instead — app/services/precomputation_engine/bid_service_v1.rb:14-17
2. [calculation] RFQ stores rfq_initial, rfq_negotiated, rfq_final, final_rfq_submission; auction stores auction_negotiated, auction_final; both store best_offer_revision — bid_service_v1.rb:102-113
3. [calculation] If the vendor was asked for best price (config allowed_participants_to_edit_in_bid_review_time.request_for_best_price) but did not revise, best_offer_revision falls back to the final pre-best-offer bid — :93-98
4. [calculation] latest_bid_data / final_negotiated are written only when this stage is the latest commercial stage or the vendor has not bid on the latest one — :115-119
5. [state] A non-ranked bid removes the vendor from participant_vendor_company_ids unless it still has an active/selected/requested/revised bid — :91, 124-148
Gaps: non-lot path uses @eg.precomputed_data_v1["…"] without a nil guard (lot path uses &.), while the SQL explicitly handles a NULL column → NoMethodError when NULL — :88 vs :86, 249-253
Cites: bid_service_v1.rb:10-158

### BidServiceV1 — cost reduction %, TNA rank and Clara
Rules:
1. [calculation] For each template cost_reduction_mappings entry: cost_reduction = ((initial − final) / initial) × 100 on cost_reduction_reference_key (Dentaku); 0 when either is blank — app/services/precomputation_engine/bid_service_v1.rb:192-214
2. [calculation] Vendor whose stored evaluation_score equals the TNA score gets rank_score nil (unranked) — bid_service_v1.rb:164-169
3. [visibility] vendor_score is added when company show_vendor_score_on_qcs? — :170
4. [side-effect] Resets the award proposal, then queues event snapshot (if a commercial proposal exists) or precomputation validation workers (now and +10 s); Clara message only for an active bid — :32-42
5. [side-effect] A vendor regretted on every line it participates in is pruned from participant lists and line data (non-lot only) — :47-79
Gaps: initial 0 → Dentaku division by zero → nil.to_f = 0% reduction instead of an error (unverified gem behaviour) — :196-199
Cites: bid_service_v1.rb:161-214

### PrecomputationEngine::BidProductServiceV1 — line rates kept per vendor
Rules:
1. [state] Skipped for a vendor that is TNA on the line when misc allow_tna_vendors_to_bid is explicitly false (existing data kept) — app/services/precomputation_engine/bid_product_service_v1.rb:24-29
2. [calculation] RFQ: initial_rate/amount/landed; rfq_final_* = best-offer revision if any, else final bid; final_rfq_submission_*; negotiated_rfq_final_*; best_offer_* — bid_product_service_v1.rb:72-105
3. [calculation] Auction: auction_final_*, negotiated_auction_final_*, best_offer_* — :107-127
4. [calculation] If an auction has no bids left, the latest bid is taken from the last RFQ stage (not withdrawn/in_active) — :43-47
5. [side-effect] Sets event-group flag show_auction_negotiated_columns_in_mqcs / show_rfq_negotiated_columns_in_mqcs = whether a negotiation bid exists — :143-148
6. [state] No latest bid product → line entry replaced with non-removable data or removed — :174-181
Cites: bid_product_service_v1.rb:38-190

### BidProductServiceV1 — decremental discount, savings and rank score
Rules:
1. [calculation] decremental_discount = ((mrp_price − latest price) / mrp_price) × 100, only when the latest bid product has other_details mrp_price — app/services/precomputation_engine/bid_product_service_v1.rb:149, 153-155, 222-228
2. [calculation] Line savings per strategy from the trade product's savings configuration (see Savings) are merged into the line data — :183, 199-210
3. [calculation] rank_score = btp.get_parameters_for_score(stage)[stage ranking key]; nil for TNA vendors — :184, 212-220
4. [calculation] evaluation_score = latest active/reevaluation_requested/reevaluated score of the vendor on the line's form; nil once reevaluated — :165-172, 230-236
5. [calculation] overall_rfq_landed = negotiated RFQ landed, else RFQ final landed — :150
Gaps: mrp_price 0 → division by zero → 0 (Dentaku nil) shown as 0% discount (unverified) — :222-228; a line savings configuration whose reference values are all nil has reference_prices nil and get_all_savings raises NoMethodError inside precomputation — :201-203, app/models/savings_configuration.rb:241
Cites: bid_product_service_v1.rb:149-228

### PrecomputationEngine::EventSnapshotServiceV1 — award snapshot
Freezes the bid data of the vendors in an award proposal into proposal.event_snapshot.snapshot_data_v1.
Rules:
1. [calculation] For each vendor response: RFQ → rfq_initial / negotiated / final / best_offer_revision / final_rfq_submission; auction → auction_negotiated / final; latest_bid_data only if latest stage or no bid there — app/services/precomputation_engine/event_snapshot_service_v1.rb:34-57
2. [calculation] Each bid is re-priced on ONLY the awarded lines (fetched_bid_products restricted, update_bid_price_breakup_v2) — :61-77
3. [side-effect] Writes selected_eg_precomputed_data (+ trade_template_id) and refreshes eglis/eg precomputed copies; queues validation workers — :79-110, 30-31
Gaps: no nil guards: response bid missing → nil.trade_request; an egli not mapped → `+= nil` TypeError; bid with nil other_details → nil.compact; proposal without event_snapshot → crash (all untyped, in Sidekiq) — :22-23, 65, 89, 99-100
Cites: event_snapshot_service_v1.rb:6-110

### AutoAwardingService — how the L1 to award is picked (deeper)
Rules:
1. [calculation] Line mode: L1 = first of LineItemBased top-1 entries (TNA excluded when evaluations exist), with ranking key 'rank' — the separate buyer ranking (buyer_rank) is NOT used — app/services/auto_awarding_service.rb:20, 66-73; app/services/event_indicators/line_item_based.rb:12
2. [calculation] Lot mode: L1 = LotBased top-1 with key 'rank', and loading factor not applied (see LotBased bug) — auto_awarding_service.rb:32, 75; lot_based.rb:15
3. [calculation] Lot mode: no scores → nil.to_i = 0, so the "no scores" branch never runs; bid lookup for company 0 is empty → aborted "No bid found to Auto Award" — auto_awarding_service.rb:75-80, 90
4. [calculation] Line mode: all lines of the same vendor bid are merged (`or`) and awarded in one select_bid_v2 call — :27, 137-142
5. [state] Bid save or stage save failing → code 15 "Operation failed", re-raised → transaction rolled back — :54, 39-40; config/locales/en-IN.yml:1144-1146
Gaps: tie check (tie_on_l1?) includes TNA vendors although L1 excludes them — line_item_based.rb:44-49; awards ignore buyer_rank / loading factor that the buyer sees in indicators — auto_awarding_service.rb:20, 32
Cites: auto_awarding_service.rb:16-143

### Proposals::AllocationSummaryEvaluator — award allocation summary numbers
Rules:
1. [config] Formulas come from the company's allocation-summary template widgets (input_type formula); without a template: total_line_items = COUNT(rows), total_amount = SUM(score) — app/services/proposals/allocation_summary_evaluator.rb:6-21
2. [calculation] One row per awarded line of the vendor: score = btp landed amount for the awarded quantity when both exist, else the stored line score; rank = stored rank to_i — :57-68
3. [calculation] Supported: COUNT(rows), COUNT(rows WHERE cond), SUM(field), SUM(field WHERE cond) (Dentaku evaluates cond per row); anything else raises "Unsupported formula: …" (untyped 500) — :70-92
4. [calculation] Fields whose key contains "amount" are converted to base (× quoted currency rate_in_base) in base_currency mode and formatted with the workspace default currency — :37-42, 48-53; app/controllers/concerns/utils.rb:261-263
Gaps: with no template, amount_key_attributes is [] so total_amount is returned as a raw number, unformatted and unconverted — :18, 49; a widget with a nil formula → nil.start_with? NoMethodError — :20, 71
Cites: allocation_summary_evaluator.rb:1-94; caller app/helpers/api/proposal_helper.rb:703-731

### Price anomaly thresholds — dormant AnomalyBidDetector rules
The anomaly validators return immediately (see bids.md), so these thresholds do not refuse bids today.
Rules:
1. [calculation] Ratio check: price / reference ≤ 0.2 or ≥ 8 → anomaly — app/services/anomaly_bid_detector/concerns/price_anomaly_detector.rb:9-18
2. [calculation] Reference priority for a line: existing_proposal, then budget, then historical_price, else the first strategy — app/services/anomaly_bid_detector/concerns/reference_price_anomaly_detector_mixin.rb:60-72
3. [calculation] Past-price check only for weight-unit lines: mean = sum / count of past prices for the product variant — price_anomaly_detector.rb:22-30, 59-66
4. [calculation] Running-auction check (needs ≥ 3 active bids): max price / average of the others > 8, or min / average of others < 0.2; suggested price = price / 10^round(log10(ratio)) — price_anomaly_detector.rb:84-128
5. [calculation] Fallback total amount without a formula = (price + price×gst/100 + freight + loading_unloading + packaging) × quantity — app/services/anomaly_bid_detector/concerns/formula_evaluator_mixin.rb:10-24
Gaps: reference 0 with Integer prices → ZeroDivisionError; mean_price uses Integer division when sum/count are integers — price_anomaly_detector.rb:12, 63 (only if re-enabled)
Cites: price_anomaly_detector.rb:1-136

### RuleEngine ToleranceEvaluator — tolerance rule maths (not event-scoped)
Used by Rule rule_type "tolerance" (invoice/GRN style checks), not by sourcing events.
Rules:
1. [calculation] threshold = expected × (1 + tolerance/100) for percentage (default), expected + tolerance for absolute, else expected — app/services/rule_engine/evaluators/tolerance_evaluator.rb:113-122
2. [calculation] Pass when actual <= threshold (default operator); also less_than, greater_than(_or_equal), equal (|diff| < 0.001) — tolerance_evaluator.rb:125-141
3. [validation] Missing subject_field/reference_field → failure "Configuration error: subject_field and reference_field are required"; nil actual/expected → failure — :39-66
4. [calculation] variance % = (actual − expected)/|expected| × 100 rounded 4; 0.0 when expected is 0 — app/services/rule_engine/evaluators/base_evaluator.rb:114-119
Gaps: to_numeric uses String#to_f, so non-numeric text becomes 0.0 and is compared as zero — base_evaluator.rb:93-100
Cites: tolerance_evaluator.rb:31-108; app/models/rule.rb:78-87

### BidContextLabelService — bid context tags
Adds a context entry (tag, stage window, time, attachments) to bid.context.
Rules:
1. [config] Nothing is recorded unless stage config should_save_bid_context is set — app/services/bid_context_label_service.rb:76
2. [calculation] Stage window: submission, else cost breakdown, else best offer, else evaluation time — bid_context_label_service.rb:105-117
3. [calculation] A normal_revision during Best Offer time is tagged "Supplier's Best Offer Revision"; during Cost Breakdown time "Supplier submitted CBD" — :81-90
4. [side-effect] For a best-offer revision bid: re-runs bid precomputation and, 2 s later, marks the vendor best_offer_responded — :65-68
Gaps: when no stage window matches, stage_context is nil and a normal_revision hits nil.include? → NoMethodError — :77, 81; precomputation re-run happens even when the context was not saved — :59-68
Cites: bid_context_label_service.rb:9-117

### Lots::LotSplittingService — smart lot classification
Rules:
1. [state] Existing lots with any non-smart mode are returned as-is; otherwise smart lots are generated and saved — app/services/lots/lot_splitting_service.rb:23-37
2. [calculation] Participation per line = vendors with a ranked-status bid whose btp is not in_active/negotiated; technically accepted = has an evaluation score that is not TNA/Regret (everyone when no technical stage) — :108-131
3. [calculation] Order of lots: one-valid-vendor ("OEM") lines, all-accepted (>1 vendor, all accepted, none TNA/regret), no-valid-bid, mixed, evaluation-pending; lots with items first, then empty lots — :138-169, 248-273
4. [validation] reset_smart_lots when any lot is active → 815 "Smart Lot generation failed, a lot has already been published" (HTTP 422) — :78-84; config/locales/en-IN.yml:2449-2451
5. [calculation] Only an ACTIVE stage loads (TradeRequest.active.find → RecordNotFound otherwise) — :10
Cites: lot_splitting_service.rb:9-169

### LotSplittingService — L1 amount per line
Rules:
1. [calculation] L1 amount = round(L1 vendor's best_price, widget precision default 2) × that vendor's participant_quantity (creator_quantity when no participant_quantity widget); missing quantity → 0 — app/controllers/concerns/event_group_controller_helper.rb:815-837
2. [calculation] L1 vendor = LineItemBased top-1 (TNA excluded when evaluations exist), bid products of status active/requested only — event_group_controller_helper.rb:818-829
3. [calculation] Line without an L1 → "-"; prefix = trade default currency symbol — app/services/lots/lot_splitting_service.rb:200-206
4. [visibility] Each line lists every vendor's name with Technical (evaluation label) and Commercial ("Bid Placed"/"Not Placed") — lot_splitting_service.rb:219-241
Gaps: best_price is rounded BEFORE multiplying by quantity, so L1 amount differs from the bid's own amount for long decimals — event_group_controller_helper.rb:826-833
Cites: event_group_controller_helper.rb:815-837

### TaxEngine — not used by bids
Rules:
1. [config] TaxEngine::Client.resolve picks Gmmco for "gmmco limited", Decathlon for "decathlon sports india private limited", else Base (no-op) by company name — app/services/tax_engine/client.rb:3-11
2. [calculation] Decathlon: CGST/SGST ("1") when buyer and vendor GSTIN share the first two digits, else IGST ("0"); both must match /\A\d{2}[A-Z0-9]{13}\z/i or nothing is set — app/services/tax_engine/decathlon.rb:6-31, 61-63
3. [config] It runs from FlexiModule automation on FxResponse records, not on bids or events — app/services/flexi_module/fx_automation_engine_service.rb:2645-2651
Gaps: the method run is template_args['function'] via `send`, i.e. any method name configured in the template is called — fx_automation_engine_service.rb:2649-2650
Cites: app/services/tax_engine/*.rb

### ExpressionEvaluatorService — @mentions in remarks
Rules:
1. [validation] Every mentioned <U#uuid> must be an active user of the workspace, else 101 "You are not allowed to perform this action" (HTTP 422) — app/services/expression_evaluator/expression_evaluator_service.rb:30-34
2. [validation] More than 10 attachments → 864 "Number of attachments exceed the maximum allowed limit" (HTTP 422) — :37, 47
3. [side-effect] Authorised mentioned users get a Mention (push + mail) and, for TradeRequest/IntakeRequest/Proposal/FxResponse/Product, a RemarksMentionWorker mail; the author is not notified — :49-66
4. [visibility] Mentioned users without access get the warning "…doesn’t have access to view this event." — :84-92
Gaps: user_ids counts duplicates but @users is distinct, so mentioning the same person twice returns 101 — :30-33; failed remark/mention save returns all nil with no error code — :38, 48, 54
Cites: expression_evaluator_service.rb:28-73; config/locales/en-IN.yml:1258-1260, 2590-2592
