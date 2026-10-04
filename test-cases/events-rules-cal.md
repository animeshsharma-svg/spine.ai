# Ranks, best price, traffic lights, loading factor and savings — rule cases

Cases for rules that no written case checked yet, extracted from `prototype/knowledge/events/backend-digest/services-calculations.md`
(the services that compute the numbers on a live or closed event: auction indicators, line/lot rank services, loading factor,
savings, precomputed comparison data, auto award, smart lots and @mentions in event chat). Each case names the rule it tests
(`R-CAL-…`, see `prototype/data/rules/events-rules.json`) and the line of `procol-backend` (origin/main ae36e86894) that makes it
true. The plain tie-at-L1 rule, the dense rank, "every tied vendor is best bidder" and the basic savings formulas are already
checked by `events-integrity.md` (EVI-RANK-004/005, EVI-SAV-001…007) and are not repeated here. Cases whose Trace names an
`EDGE-EVRCAL-NNN` id have a runnable twin in `prototype/data/api-cases-extra/rules-cal.json`.

Worked numbers assume a buy (reverse) event unless the case says sell. "The live ranks" means the buyer console's live
indicators for a stage (the ranks / best price / colour columns of the live page).

## 1. Which bids and which score are ranked

#### API-EVRCAL-001 — Only active, awarded or pending-approval bids are ranked; a rejected bid drops out and the others move up
- **Why it matters.** A rejected or revised bid that still held L1 would keep another vendor from being shown as best and could be auto-awarded.
- **Setup.** Rank auction on a buy event, two QA vendors (or one vendor plus one surrogate bid). Vendor A bids 100, vendor B bids 110.
- **Steps.** 1. Read the live ranks: A is 1, B is 2. 2. Reject A's bid. 3. Read the live ranks again.
- **Expected.** After the rejection only B is ranked and B is rank 1; A has no rank and no best-price contribution.
- **Oracle.** `GET /v1/trade/:id/event_indicators` → `auction_identifiers_data` has an entry only for bids in status active/selected/requested (`Bid::VALID_STATUSES_TO_RANK`); B's `global.rank.value` = "1" after the reject; A's bid id no longer appears.
- **Trace.** P1 · automate-later · `R-CAL-001-1` · `app/services/sourcing_engine/auction_indicators_service.rb:11-12`

#### API-EVRCAL-002 — A separate buyer ranking is used for the buyer's view only; vendors stay ranked on their own score
- **Why it matters.** With a buyer ranking widget (e.g. price plus a buyer-only adjustment) the buyer must see the adjusted order while vendors are ranked on what they quoted; mixing the two leaks the adjustment.
- **Setup.** gate: `buyer_ranking_widget`. A rank auction with a buyer ranking widget configured, two vendors whose order differs between the vendor score and the buyer score (A: price 100, buyer score 130; B: price 110, buyer score 115).
- **Steps.** 1. As the buyer, read the live ranks. 2. As vendor A, open the live event and read its rank.
- **Expected.** The buyer sees B first (115 < 130). Vendor A sees itself as rank 1 (100 < 110).
- **Oracle.** Buyer `event_indicators` `global.rank` follows `buyer_rank`; the vendor's own rank (vendor card / quote) follows `rank`. `get_ranking_key` returns buyer_rank only for a buyer with the widget configured.
- **Trace.** P1 · manual · `R-CAL-001-3` · `app/models/model_helpers/trade_request_model_helper.rb:1241-1251` · `app/services/sourcing_engine/auction_indicators_service.rb:10`

#### API-EVRCAL-003 — The "vendor rank" column always ranks on the vendor's own score, even with a buyer ranking
- **Why it matters.** The buyer console shows both "rank" (buyer order) and "vendor rank" (what the vendor is told); if vendor rank followed the buyer score the buyer would misread what each vendor sees.
- **Setup.** gate: `display_vendor_rank_in_auction_qcs`. Same event as API-EVRCAL-002.
- **Steps.** Read the live ranks as the buyer.
- **Expected.** "Rank" puts B first; "Vendor rank" puts A first. With the stage's rank display off, vendor rank is blank.
- **Oracle.** `global.vendor_rank.value` = dense rank on key `rank` (A "1", B "2"); `global.rank.value` on `buyer_rank`. Vendor rank is nil when `should_show_rank?` is false.
- **Trace.** P2 · manual · `R-CAL-006-3` `R-CAL-006-4` · `app/services/sourcing_engine/auction_indicators_service.rb:77, 113-118`

#### API-EVRCAL-004 — On a sell (forward) event the highest score is rank 1
- **Why it matters.** Forward auctions (scrap sales) invert the order; an ascending sort there would award the lowest offer.
- **Setup.** A forward (sell) rank auction, vendors offering 500, 450 and 520.
- **Steps.** Read the live ranks.
- **Expected.** 520 is rank 1, 500 rank 2, 450 rank 3; the best price shown to the buyer is 520.
- **Oracle.** `event_indicators` ranks "1"/"2"/"3" for 520/500/450; `global.best_price.value` = "520".
- **Trace.** P1 · automate-later · `R-CAL-003-1` `R-CAL-004-1` · `app/services/sourcing_engine/auction_indicators_service.rb:71-76, 211-213`

## 2. Best price shown on the live page

#### API-EVRCAL-005 — The overall best price is one number, the same under every vendor, and is not rounded
- **Why it matters.** The best price is what vendors chase; if it were rounded (100.456 shown as 100.46) a vendor could bid "below" it and not be best.
- **Setup.** Price auction, buy event, two vendors: A quotes 100.456, B quotes 101.50.
- **Steps.** Read the live best price for each vendor's row.
- **Expected.** Every row shows the same best price, 100.456, written without rounding; B's own 101.50 is shown elsewhere as 101.5 (trailing zero dropped).
- **Oracle.** `global.best_price.value` = "100.456" in every bid entry; the value is produced by `get_converted_display_value` which only strips trailing zeros (no round/truncate).
- **Trace.** P1 · automate-later · `R-CAL-004-1` `R-CAL-004-3` `R-CAL-036-2` · `app/services/sourcing_engine/auction_indicators_service.rb:72-76, 101-106` · `app/controllers/concerns/common_controller_helper.rb:196-201`

#### API-EVRCAL-006 — With a loading factor the ranks include the penalty but the best price does not
- **Why it matters.** A vendor who regretted a loaded line can be L2 while its own price is shown as the "best price"; the buyer must understand the two numbers are on different bases.
- **Setup.** gate: `loading_factor_enabled`. Auction, two lines; line 2 has loading factor 15. Vendor A quotes 100 in total and regrets line 2; vendor B quotes 110 on both lines.
- **Steps.** Read the live ranks, best price and loading factor columns.
- **Expected.** A's ranked score is 115, so B is rank 1 and A rank 2. The best price shown is 100 (A's unloaded price). A's loading factor column shows 15, B's 0.
- **Oracle.** `global.rank` B "1", A "2"; `global.best_price.value` = "100"; `global.loading_factor.value` A = 15.0, B = 0.0.
- **Trace.** P1 · manual · `R-CAL-003-2` `R-CAL-004-4` `R-CAL-006-1` · `app/services/sourcing_engine/auction_indicators_service.rb:59-66, 72-76, 107-112`

#### API-EVRCAL-007 — With a technical round scored, a vendor marked "technically not acceptable" is left out of the line ranks
- **Why it matters.** A TNA vendor's low price must not be L1 on a line it is not allowed to win; but before any evaluation exists it still counts.
- **Setup.** Technical + price round; vendor A scored TNA on line 1, vendor B acceptable. On line 1 A quotes 90, B 100.
- **Steps.** 1. Before any evaluation, read the line-1 ranks and best price. 2. After the evaluation is submitted, read them again.
- **Expected.** Before: A is rank 1, best price 90. After: A has no rank on line 1, B is rank 1 and the line best price is 100.
- **Oracle.** `inline[company][line].rank` and `inline…best_price` change as stated; the exclusion applies only when the project has evaluations (`get_event_score_for_participants_excluding_tna`).
- **Trace.** P1 · manual · `R-CAL-007-1` `R-CAL-008-5` · `app/services/sourcing_engine/auction_indicators_service.rb:122-133`

## 3. Rank display switched off

#### API-EVRCAL-008 — When rank display is off, line ranks are blank — but the "best bidder" flag still marks the leader
- **Why it matters.** A price auction with ranks hidden is meant to show no position; a true/false "best bidder" flag next to a blank rank tells the reader who is L1 anyway.
- **Setup.** Price-based auction, buy event, rank indicator off in the stage's optional indicators; vendors A 100 and B 110.
- **Steps.** Read the live line indicators for both vendors.
- **Expected (today).** The rank is empty for both, but A's line carries "best bidder: yes" and B's "best bidder: no". It should carry no best-bidder flag when ranks are hidden.
- **Oracle.** `inline[A][line].rank` = `{"value": "", "best_bidder": true}`, B's `best_bidder: false`; `should_show_rank?` is false (`auction_config` price and `other_auction_indicators_config.rank` not true).
- **Trace.** P2 · automate-later · `R-CAL-007-2` `R-CAL-003-3` · `app/services/sourcing_engine/auction_indicators_service.rb:144-150` · `app/models/trade_request.rb:654-670`

#### API-EVRCAL-009 — Alternate bidding shows line ranks even when rank display is off
- **Why it matters.** The normal path hides ranks when the stage says so; the alternate-bidding path skips that check, so the same setting behaves differently by layout.
- **Setup.** Alternate-bidding auction (vendors may quote alternates per line), rank indicator off, two vendors.
- **Steps.** Read the live line indicators.
- **Expected.** Ranks should be blank like on a normal stage. Today they are filled in.
- **Oracle.** `inline[company][line].rank.value` is a number although `should_show_rank?` is false; compare `auction_indicators_service.rb:189-193` (no check) with `:145` (checked).
- **Trace.** P2 · manual · `R-CAL-009-3` `R-CAL-009-4` · `app/services/sourcing_engine/auction_indicators_service.rb:189-193`

#### API-EVRCAL-010 — Alternate bidding ranks every vendor-line together and the "best price" is the best ranking score
- **Why it matters.** With alternates, the ranks are pooled across all lines; testers expecting per-line ranks will misjudge a correct screen as wrong (or the other way round).
- **Setup.** Alternate-bidding auction, lines L1 and L2; vendor A quotes 100 on L1 and 50 on L2, vendor B 80 on L1 and 60 on L2.
- **Steps.** Read the line ranks and best price.
- **Expected.** Scores 100, 50, 80, 60 are ranked together: A-L2 (50) is 1, B-L2 (60) 2, B-L1 (80) 3, A-L1 (100) 4; the best price on every line is 50.
- **Oracle.** `inline[..][..].rank.value` as listed; `inline…best_price.value` = "50" everywhere.
- **Trace.** P3 · manual · `R-CAL-009-1` `R-CAL-009-2` · `app/services/sourcing_engine/auction_indicators_service.rb:177-200, 205-209`

## 4. Traffic-light colours

#### API-EVRCAL-011 — Traffic light on a buy event: at or below the lower bound is green, up to the upper bound yellow, above it red
- **Why it matters.** The boundary values decide which vendors are told they are competitive; an off-by-one at the bound sends the wrong signal.
- **Setup.** Traffic-light auction on price, buy event, lower bound 100, upper bound 120. Three vendors quote exactly 100, exactly 120 and 120.01.
- **Steps.** Read each vendor's colour.
- **Expected.** 100 → green, 120 → yellow, 120.01 → red.
- **Oracle.** `global.traffic_light_color.value` = green / yellow / red; `BidsGroup.get_color_within_range` buy branch `value <= lower` green, `lower < value <= upper` yellow, else red.
- **Trace.** P1 · automate-later · `R-CAL-012-1` `R-CAL-012-4` `R-CAL-005-3` `R-CAL-005-4` · `app/models/bids_group.rb:381-389`

#### API-EVRCAL-012 — Traffic light on a forward (sell) price auction uses the opposite bands
- **Why it matters.** For a sale, a higher offer is better; the bands must flip or the best buyer is shown red.
- **Setup.** Forward traffic-light auction on price, lower bound 500, upper bound 450 (sell: green at or above 500, yellow from 450 up to below 500). Offers 500, 450 and 449.99.
- **Steps.** Read each colour.
- **Expected.** 500 → green, 450 → yellow, 449.99 → red.
- **Oracle.** Forward branch `value >= lower` green, `upper <= value < lower` yellow, else red; used only when the event is a forward auction AND the traffic light is not on rank.
- **Trace.** P2 · manual · `R-CAL-012-2` `R-CAL-005-3` · `app/models/bids_group.rb:390-395` · `app/services/sourcing_engine/auction_indicators_service.rb:94`

#### API-EVRCAL-013 — No colour at all when the bounds are not set
- **Why it matters.** A traffic-light event saved without ranges must not paint everyone red (or crash); it should show no colour.
- **Setup.** Traffic-light auction whose traffic-light ranges are empty; one vendor bid.
- **Steps.** Read the live indicators and the vendor's event card.
- **Expected.** No colour is shown anywhere and nothing fails.
- **Oracle.** `traffic_light_color` absent from `global` (guard `misc["traffic_light_ranges"].present?`); card colour nil; no 500.
- **Trace.** P2 · manual · `R-CAL-005-1` `R-CAL-012-3` `R-CAL-016-1` · `app/services/sourcing_engine/auction_indicators_service.rb:86` · `app/services/event_indicators/lot_based.rb:29-32`

#### API-EVRCAL-014 — Traffic light on rank: the buyer's live page and the vendor's card must show the same colour
- **Why it matters.** The live page compares the vendor's raw score with the bounds while the vendor card compares its dense rank; with rank bounds 1–2 a vendor at rank 1 with score 100 is green on the card and red on the buyer's page.
- **Setup.** Traffic-light auction on rank, bounds lower 1, upper 2. Vendors A 100 (rank 1), B 110 (rank 2), C 130 (rank 3).
- **Steps.** 1. As the buyer read the live colours. 2. As vendor A open the event list and read the card colour.
- **Expected.** Both views: A green, B yellow, C red.
- **Oracle.** Today `event_indicators` `global.traffic_light_color` uses `score_hash['color'] || score_hash['rank']` (raw score 100 → red) while `EventIndicators::LotBased#color` uses the dense rank (1 → green). A mismatch is the defect.
- **Trace.** P1 · manual · `R-CAL-005-2` `R-CAL-005-5` `R-CAL-016-2` · `app/services/sourcing_engine/auction_indicators_service.rb:87-91` · `app/services/event_indicators/lot_based.rb:34-40`

#### API-EVRCAL-015 — A vendor who has not bid yet can open its card on a scored traffic-light auction
- **Why it matters.** The card's colour lookup reads the vendor's score without checking it exists; an invited vendor who has not bid yet would get an error page instead of the event.
- **Setup.** Traffic-light auction on price (not on rank), ranges set; vendor A has bid, the QA vendor is invited but has NOT bid.
- **Steps.** As the QA vendor, open the event list / the event card while it is live.
- **Expected.** The card opens with no colour for the vendor.
- **Oracle.** No 500 from the vendor's event list / card request. `LotBased#color` reads `participant_score['color']` on nil (`lot_based.rb:33-39`) — a 500 there is the defect.
- **Trace.** P0 · manual · `R-CAL-016-5` · `app/services/event_indicators/lot_based.rb:33-39`

## 5. Loading factor in the different rank services

#### API-EVRCAL-016 — With a loading factor, the vendor card rank and the buyer's live rank must agree
- **Why it matters.** The lot rank service applies the loading factor under a key that is not set yet, so it adds nothing; the live page applies it. A vendor can be told "you are L1" while the buyer's screen (and the award) ranks it second.
- **Setup.** gate: `loading_factor_enabled`. Auction closed on lot, two lines, line 2 loading factor 15. Vendor A quotes 100 and regrets line 2 (loaded score 115); vendor B quotes 110 on both.
- **Steps.** 1. Buyer: read the live ranks. 2. Vendor A: read the rank on its event card. 3. Vendor B: the same.
- **Expected.** Everyone sees B rank 1 and A rank 2.
- **Oracle.** Buyer `event_indicators` gives B "1"; today vendor A's card (`EventIndicators::LotBased#rank`) gives A 1 because `lot_based.rb:15` passes `ranking_key: @ranking_key` before `@ranking_key` is assigned on line 16. Any disagreement is the defect.
- **Trace.** P0 · manual · `R-CAL-015-1` `R-CAL-015-2` `R-CAL-015-4` · `app/services/event_indicators/lot_based.rb:14-16` · `app/services/sourcing_engine/auction_indicators_service.rb:59-61`

#### API-EVRCAL-017 — Auto award picks the vendor that is L1 on the buyer's screen (loading factor and buyer ranking included)
- **Why it matters.** Auto award ranks with the plain vendor score and the lot service without the loading factor; on an event with either, it can award the vendor the buyer's screen shows as second.
- **Setup.** gate: `auto_award`. Lot-closed auction with auto award on and a loading factor as in API-EVRCAL-016 (or a buyer ranking widget as in API-EVRCAL-002). Let the stage close.
- **Steps.** 1. Note L1 on the buyer's live page just before close. 2. After the auto award runs (a few seconds after close), read the award.
- **Expected.** The vendor awarded is the one shown as L1 on the buyer's live page (B).
- **Oracle.** Selected bid's company = B. Today `AutoAwardingService` uses `LotBased` with key `rank` (`auto_awarding_service.rb:32, 75`) — no loading factor, no buyer rank — and awards A.
- **Trace.** P0 · manual · `R-CAL-046-1` `R-CAL-046-2` · `app/services/auto_awarding_service.rb:20, 32, 75` · `app/services/event_indicators/lot_based.rb:15`

#### API-EVRCAL-018 — Auto award with no ranked bid at all is a clean "no bid to award", not an error
- **Why it matters.** On a lot stage with no scores the service computes company 0 and looks for its bid; the outcome must be a recorded "nothing to award", not a stuck job.
- **Setup.** gate: `auto_award`. Lot-closed auction with auto award on and no bids; let it close.
- **Steps.** After close, read the stage and its award state.
- **Expected.** The stage is closed, nothing is awarded, and the auto-award history says there was no bid to award.
- **Oracle.** No selected bid; the auto-award log/history entry "No bid found to Auto Award"; no failed job retried in a loop.
- **Trace.** P2 · manual · `R-CAL-046-3` · `app/services/auto_awarding_service.rb:31-35, 75-90`

## 6. Default savings ("negotiation margin")

#### API-EVRCAL-019 — The default savings reference is the best FIRST quote, priced at the buyer's quantity
- **Why it matters.** The negotiation margin is "first best quote minus final"; if later revisions or the vendor's own quantity were used, the reported saving would be wrong.
- **Setup.** RFQ, two lines: L1 buyer quantity 10, L2 buyer quantity 5; savings configuration with the default strategy, lot based. Vendor A first quotes L1 100 / L2 200 (total 2,000), then revises to 90 / 190 (1,850). Vendor B first quotes 95 / 210 (2,000), then revises to 92 / 205 (1,945). A quotes quantity 8 on L1 (the reference must still use 10).
- **Steps.** Close the stage and read the stage savings.
- **Expected.** Reference = min over vendors of (first bid Σ price × buyer quantity) = min(100×10+200×5, 95×10+210×5) = 2,000. Final best = 1,850. Saving = 150, i.e. 7.50 %.
- **Oracle.** `GET /v1/trade/:id/aggregate_savings` (or the stage's `misc.savings_data`) default strategy: reference 2000, amount 150, percent 7.5. Only taxes-free base `price` is used.
- **Trace.** P0 · automate-later · `R-CAL-026-2` `R-CAL-017-2` `R-CAL-017-3` · `app/services/reporting_engine/concerns/report_data_generator.rb:446-466` · `app/services/event_indicators/lot_based.rb:78-91`

#### API-EVRCAL-020 — Line-level default reference is each line's lowest first quote; a line with only revised quotes has none
- **Why it matters.** On line-closed events the margin is per line; a line whose only quotes were superseded must not report a reference of 0 (100 % saving).
- **Setup.** RFQ closed per line, savings default strategy on lines. L1: A first 100 then 90; B first 95. L2: only A, whose first quote was later revised.
- **Steps.** Close the stage; read line-wise savings.
- **Expected.** L1 reference 95 (lowest first quote), final 90, saving 5 per unit. L2 has no default reference and shows no saving.
- **Oracle.** `GET /v1/trade/:id/best_line_wise_savings`: L1 reference 95; L2 has no default entry (not 0, not 100 %).
- **Trace.** P1 · automate-later · `R-CAL-026-3` `R-CAL-026-4` · `app/services/reporting_engine/concerns/report_data_generator.rb:468-496`

#### API-EVRCAL-021 — A negative default saving is hidden, and the setting that hides it never switches back
- **Why it matters.** When the final best is worse than the first best, the default saving is negative; it is hidden and the stage is flagged "do not show default savings" for good, even if a later revision makes the saving positive.
- **Setup.** RFQ with the default saving strategy. Vendor A first quotes 100, later only quotes above it (the lowest active bid becomes 105).
- **Steps.** 1. Close the stage; read savings and the stage flag. 2. Reopen / extend, let a vendor revise to 90, close again; read savings.
- **Expected.** Step 1: no default saving shown, flag off. Step 2: a positive default saving (10) should be shown again.
- **Oracle.** Step 1: default entry absent, `config.show_default_savings` = false. Step 2 today: the flag stays false (the worker only ever sets it to false — `savings_calculator_worker.rb:34-41`); the saving stays hidden. That is the defect.
- **Trace.** P1 · manual · `R-CAL-021-2` `R-CAL-027-1` `R-CAL-027-2` `R-CAL-027-5` · `app/models/concerns/savings_configuration_helpers/savings_calculator.rb:41-43` · `app/workers/savings_calculator_worker.rb:34-41`

#### API-EVRCAL-022 — Savings appear a few seconds after the stage closes, and not at all without a ranked bid
- **Why it matters.** Savings are computed by a job 5 seconds after close; a tester reading too early sees nothing and files a false bug, while a stage with only rejected bids must show none.
- **Setup.** Two RFQs with a savings configuration: one with an active bid, one whose only bid was rejected.
- **Steps.** Close both; read savings at once, then again after 20 seconds (bounded wait).
- **Expected.** First stage: empty at once, filled after ~5–10 s. Second stage: never filled.
- **Oracle.** `misc.savings_data` / aggregate savings present only for the first stage after the job (`closed_at + 5 s`); `SavingsCalculatorWorker` skips stages with no ranked bid.
- **Trace.** P2 · automate-later · `R-CAL-030-1` `R-CAL-030-3` `R-CAL-030-4` · `app/models/trade_request.rb:342-355` · `app/workers/savings_calculator_worker.rb:9-17`

#### API-EVRCAL-023 — Line savings totals use the buyer's quantity for the default strategy and the vendor's for others, rounded to the price precision
- **Why it matters.** Per-unit references are multiplied up to amounts; using the wrong quantity misstates the total saving.
- **Setup.** RFQ, one line, buyer quantity 10; reference strategies: default (per unit) and budget 98 per unit. Best vendor quotes 95 for quantity 8. First best quote was 100.
- **Steps.** Close; read the total line-wise savings.
- **Expected.** Default: (100 − 95) × 10 = 50 on reference 1,000 → 5.00 %. Budget: (98 − 95) × 8 = 24 on reference 784 → 3.06 %. Values rounded to the price precision (2) with trailing zeros dropped.
- **Oracle.** Aggregated line savings per strategy as listed; percent = total savings ÷ total reference × 100.
- **Trace.** P1 · manual · `R-CAL-023-2` `R-CAL-025-3` `R-CAL-025-4` · `app/models/concerns/savings_configuration_helpers/savings_calculator.rb:104-119` · `app/controllers/concerns/trade_template_helper.rb:487-514`

#### API-EVRCAL-024 — A savings strategy other than default, with no best quote on a line, must not zero the reference
- **Why it matters.** For budget/historical references the quantity comes from the best quote; with no quote the quantity is 0 and the reference itself is reported as 0, hiding the budget.
- **Setup.** RFQ, two lines, budget reference on both; vendors quote only line 1.
- **Steps.** Close; read line-wise savings for line 2.
- **Expected.** Line 2 shows its budget reference and no saving (or "no quote"), not a reference of 0.
- **Oracle.** Today line 2 budget `reference_price` = 0 (quantity nil.to_f) — `savings_calculator.rb:113, 117-119`.
- **Trace.** P2 · manual · `R-CAL-023-4` · `app/models/concerns/savings_configuration_helpers/savings_calculator.rb:113-119`

#### API-EVRCAL-025 — A savings configuration whose references are all empty does not break the stage
- **Why it matters.** When every reference value is empty the configuration keeps a nil list, and reading savings loops over it — the savings card and the precomputed comparison would fail.
- **Setup.** RFQ with a savings configuration saved with every reference value blank; one bid; close.
- **Steps.** Open the stage, the savings card and the comparison.
- **Expected.** All open; savings shows nothing.
- **Oracle.** No 500 from `aggregate_savings`, `best_line_wise_savings` or the comparison; `SavingsConfiguration.read` sets `reference_prices` nil and `get_all_savings` iterates it (`savings_configuration.rb:241`).
- **Trace.** P1 · manual · `R-CAL-021-4` `R-CAL-021-5` `R-CAL-025-6` · `app/models/savings_configuration.rb:124, 241` · `app/controllers/concerns/trade_template_helper.rb:469-470`

## 7. Custom and vendor-specific savings

#### API-EVRCAL-026 — Realised savings exist only once a bid is awarded; unrealised only before
- **Why it matters.** "Realised" must mean money actually committed; showing realised savings before award (or unrealised after) misreports the procurement result.
- **Setup.** gate: `show_custom_savings`. RFQ, one line quantity 10; vendors' first quotes 100 and 104; final best 95.
- **Steps.** 1. Close without awarding; read custom savings. 2. Award the 95 bid for the full quantity; wait ~10 s; read again.
- **Expected.** Step 1: only unrealised, reference 1,000 (best first quote × 10). Step 2: only realised, reference 1,000 for the selected quantity, final 950, saving 50.
- **Oracle.** `misc.custom_savings_configuration` strategies: step 1 `unrealised` only; step 2 `realised` only (`valid?` rules) with the values listed.
- **Trace.** P1 · manual · `R-CAL-028-1` `R-CAL-028-2` `R-CAL-028-3` `R-CAL-032-1` · `app/models/savings_configuration.rb:245-261, 341-360`

#### API-EVRCAL-027 — Vendor-specific savings percent is not cut to a whole number
- **Why it matters.** With whole-number references and final amounts, an integer division turns 10 % into 0 %, or a zero reference into a crash.
- **Setup.** Lot-based vendor-specific savings with reference 1,000 for vendor A; A's last bid total 900 (whole numbers).
- **Steps.** Read vendor A's vendor-specific savings.
- **Expected.** Saving 100, 10 %. With a reference of 0 the saving shows no percentage, without an error.
- **Oracle.** `vendor_specific_savings` for A: amount 100, percent 10 (not 0). Reference 0 must not return 500 (`reference.rb:61, 77-78`).
- **Trace.** P1 · manual · `R-CAL-033-2` `R-CAL-033-4` · `app/poro_classes/vendor_specific_savings/reference.rb:57-78`

#### API-EVRCAL-028 — Realised price drop keeps the savings of every strategy even when one strategy has no awarded bid
- **Why it matters.** The loop returns an empty list as soon as one strategy finds no selected bid, throwing away the strategies already computed.
- **Setup.** Two vendor-specific line strategies; the vendor's selected bid exists for the line of strategy 1 only.
- **Steps.** Award; read the vendor's realised price drop.
- **Expected.** Strategy 1's saving is shown.
- **Oracle.** Today the list is `[]` (`return [] if selected_bid.blank?` inside the loop, `vendor_specific_savings_calculator.rb:19`).
- **Trace.** P2 · manual · `R-CAL-034-1` `R-CAL-034-2` `R-CAL-034-5` · `app/models/concerns/savings_configuration_helpers/vendor_specific_savings_calculator.rb:17-39`

## 8. Who sees savings and indicators

#### API-EVRCAL-029 — A vendor never receives savings data in its own quote or sheet
- **Why it matters.** Savings reveal the buyer's reference (budget, last price, the competitor's first quote); a vendor holding it knows how far it can move.
- **Setup.** RFQ with savings configured (budget reference), the QA vendor has bid; stage closed and savings computed.
- **Steps.** As the QA vendor, open its quote / the event page.
- **Expected.** No savings figures anywhere in what the vendor receives.
- **Oracle.** Vendor's quote/sheet payload has `show_savings_data: false` and no `savings_with_strategy` / `vendor_specific_savings` keys; the buyer's has them.
- **Trace.** P0 · automate-later · `R-CAL-035-1` `R-CAL-035-2` · `app/controllers/concerns/trade_template_helper.rb:2107-2122, 3698-3708, 3805-3807`

#### API-EVRCAL-030 — On a sealed-bid stage the vendor gets no auction indicators, and the best price only after it has bid
- **Why it matters.** Sealed bidding exists so vendors bid blind; indicators or the best price before the vendor's own bid defeat it.
- **Setup.** Sealed-bid auction; vendor A has bid; the QA vendor has not.
- **Steps.** As the QA vendor open the live event before and after placing its bid.
- **Expected.** Before and after: no ranks/colours (indicators hidden). The best price never appears before its own bid.
- **Oracle.** Vendor payload `hide_auction_indicators: true` (sealbid); order-details best price absent until the vendor company has a bid.
- **Trace.** P0 · manual · `R-CAL-035-3` · `app/controllers/concerns/trade_template_helper.rb:2120, 2125`

## 9. Comparison data and award amounts

#### API-EVRCAL-031 — Smart lot L1 amount is price × quantity, not a rounded price × quantity
- **Why it matters.** Rounding the unit price before multiplying turns 10.005 × 1,000 into 10,010 instead of 10,005 — the lot split value is off by the rounding times the quantity.
- **Setup.** RFQ eligible for smart lots, one line quantity 1,000, L1 vendor price 10.005 (precision 2).
- **Steps.** Run smart lot classification; read the line's L1 amount.
- **Expected.** 10,005 (or 10,005.00); the bid's own line amount is 10,005.
- **Oracle.** Today `best_price.round(precision) * quantity` = 10,010 (`event_group_controller_helper.rb:826-833`). Difference = defect.
- **Trace.** P2 · manual · `R-CAL-052-1` `R-CAL-052-5` · `app/controllers/concerns/event_group_controller_helper.rb:815-836`

#### API-EVRCAL-032 — Cost reduction and MRP discount with a zero base are shown as "not applicable", not 0 %
- **Why it matters.** A 0 initial price or 0 MRP makes the percentage undefined; reporting 0 % reads as "no reduction" and hides bad data.
- **Setup.** Template with a cost-reduction mapping and an MRP field; one vendor whose initial price (or MRP) is 0 and final 50.
- **Steps.** Read the comparison (master QCS) for that vendor.
- **Expected.** Cost reduction / decremental discount blank or "n/a".
- **Oracle.** Today 0 (Dentaku division by zero → nil → 0.0; unverified gem behaviour). With initial 100 and final 90 the cost reduction is 10 %.
- **Trace.** P3 · manual · `R-CAL-042-1` `R-CAL-042-6` `R-CAL-044-1` `R-CAL-044-6` · `app/services/precomputation_engine/bid_service_v1.rb:190-199` · `app/services/precomputation_engine/bid_product_service_v1.rb:201-228`

#### API-EVRCAL-033 — "Awarded" columns recompute the bid on the awarded quantity
- **Why it matters.** Awarded totals must use what was awarded, not what was quoted; otherwise the PO value and the award summary disagree.
- **Setup.** Template with awarded-quantity widgets; vendor quotes 10 units at 100 (gross 1,000 + 18 % GST); award 6 units.
- **Steps.** Read the award comparison's "Awarded" columns for the vendor.
- **Expected.** Awarded gross total = 6 × 100 × 1.18 = 708; with nothing awarded every awarded column is 0.
- **Oracle.** Awarded widget values use `awarded_quantity` in place of `participant_quantity` in every formula when any line has an awarded quantity > 0.
- **Trace.** P1 · manual · `R-CAL-040-1` `R-CAL-040-2` `R-CAL-040-3` · `app/controllers/concerns/awarded_quantity_widgets_helper.rb:15, 186-230`

#### API-EVRCAL-034 — The partial-award share is quantity-and-price weighted
- **Why it matters.** Charges and global amounts are split by the share of value awarded; a quantity-only share misallocates freight or discounts.
- **Setup.** Two lines: L1 quoted 10 × 100, L2 quoted 5 × 400. Award 5 units of L1 and nothing of L2.
- **Steps.** Read the award's global (bid-level) amounts, e.g. freight 300.
- **Expected.** Share = (5×100) ÷ (10×100 + 5×400) = 500 ÷ 3,000 = 16.67 %; freight carried = 50.
- **Oracle.** `percent_distribution` = 0.1667; global percent-and-amount fields scaled by it.
- **Trace.** P2 · manual · `R-CAL-039-1` `R-CAL-038-4` · `app/services/formula_evaluator/recursive_formula_evaluator_service.rb:19, 38-48, 107-108`

## 10. @mentions in the event chat

#### API-EVRCAL-035 — Mentioning the same colleague twice in one message is accepted
- **Why it matters.** The check counts mentions with duplicates but looks users up without, so writing "@Priya … @Priya" is refused as "not allowed" — a confusing refusal for an ordinary message.
- **Setup.** Session: the BUYER. The sandbox event's open price round; an active colleague in the workspace.
- **Steps.** Post a message on the round that mentions the same colleague twice.
- **Expected.** The message is saved and the colleague is notified once.
- **Oracle.** Today HTTP 422, code 101 'You are not allowed to perform this action' (`user_ids` has 2 entries, `@users` 1). A 101 is the defect.
- **Trace.** P2 · automate · `R-CAL-054-5` · `app/services/expression_evaluator/expression_evaluator_service.rb:30-33` · code 101 · `EDGE-EVRCAL-035`

#### API-EVRCAL-036 — Mentioning someone who is not an active member of the workspace is refused
- **Why it matters.** A mention notifies by mail; mentioning an outsider (or a garbled id) must not send event details to them.
- **Setup.** Session: the BUYER. The sandbox event's price round.
- **Steps.** Post a message that mentions an id that is not a user of this workspace.
- **Expected.** Refused: "You are not allowed to perform this action"; no message saved.
- **Oracle.** HTTP 422, code 101; `GET /remarks?item_type=TradeRequest&item_uuid=…` does not list the message.
- **Trace.** P1 · automate · `R-CAL-054-1` · `app/services/expression_evaluator/expression_evaluator_service.rb:29-34` · code 101 · `EDGE-EVRCAL-036`

#### API-EVRCAL-037 — A plain message without mentions is saved
- **Why it matters.** The positive control for the two cases above: the chat itself works on a live round.
- **Setup.** Session: the BUYER. The sandbox event's price round.
- **Steps.** Post a plain message (no mentions, no attachments).
- **Expected.** Saved.
- **Oracle.** HTTP 200; the message is returned by the remarks list.
- **Trace.** P2 · automate · `R-CAL-054-1` · `app/services/expression_evaluator/expression_evaluator_service.rb:35-39` · `EDGE-EVRCAL-037`

#### API-EVRCAL-038 — A message with more than ten attachments is refused
- **Why it matters.** The attachment cap is the only limit on chat uploads; above it the message must be refused with its own message.
- **Setup.** Session: the BUYER. The sandbox price round.
- **Steps.** Post a message with eleven attachment links (links on this company's storage).
- **Expected.** Refused with the attachment-limit message.
- **Oracle.** HTTP 422, code 864. Links that are not the company's storage are refused earlier with 101 (`validate_company_urls`), so the runnable twin asserts only "refused, no crash".
- **Trace.** P2 · automate · `R-CAL-054-1` · `app/services/expression_evaluator/expression_evaluator_service.rb:37, 47` · `app/controllers/api/remarks_controller.rb:31` · code 864 · `EDGE-EVRCAL-038`

## 11. Live data endpoints on a stage with no bids

#### API-EVRCAL-039 — Live indicators, L1 data and savings on a live round with no bids answer empty, not with an error
- **Why it matters.** Every live page opens these before the first bid; a crash there blanks the buyer's screen at the most watched moment.
- **Setup.** Session: the BUYER. The sandbox event: published, one open price round, no bids.
- **Steps.** Read the round's live indicators, its L1 data and its line-wise savings.
- **Expected.** All three answer successfully with empty data.
- **Oracle.** HTTP 200 for each: `event_indicators` → `auction_identifiers_data` empty (or `{}` when masked); `l1_data_for_event` → `{}` (no scores); `best_line_wise_savings` → no entries.
- **Trace.** P1 · automate · `R-CAL-013-1` `R-CAL-017-1` · `app/controllers/api/v1/trade_controller.rb:531-546` · `app/controllers/concerns/trade_template_helper.rb:389-410` · `EDGE-EVRCAL-040` `EDGE-EVRCAL-041` (live indicators: `EDGE-DQCS-030`)
