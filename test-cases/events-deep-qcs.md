# Quote comparison, L1 and savings — deep cases

Deep API and screen cases for the quote comparison (QCS), Master QCS, L1 / ranks, savings, sealed-bid visibility and the comparison exports, each grounded in `procol-backend` at `origin/main` (paths below are relative to that repo unless prefixed `procol-client-dashboard/`). Cases with a runnable twin carry `EDGE-DQCS-NNN` in their Trace (same number) — see `prototype/data/api-cases-extra/deep-qcs.json`. Runnable twins use the journey's CLOSED pricing stage `{{pricingTradeUuid}}` (one real bid `{{bidUuid}}`, submitted proposal `{{proposalUuid}}`) for reads that need data and the SANDBOX `{{tradeId}}` / `{{eventGroupUuid}}` (live, no bids) for empty and sealed-state reads; `{{rfpTradeId}}` only exists in RFP+RFQ runs.

**Read before running.** Ids are decoded by `ParamsAuth#check_for_uuid` (params_auth.rb:57): `id`, `quote_id` and any key containing `uuid` become integer ids; `Z2dnWmdaUWtnZw==` decodes to 999999999 (no row) and `WrongUuid1=` to nil. Pundit refusals are code 455 'You are not authorized to perform this action' (api_auth.rb:16,117); `validate_event` answers 4 for a missing/void/cancelled stage and 536 for a stage the user may not view (trade_controller_helper.rb:2214-2221). An action that returns without rendering answers HTTP 204 (Rails 7.0 default render on a JSON request). Cases marked **Suspected defect** describe current code that looks wrong.

## 1. Savings — aggregate and line-wise

`GET /v1/trade/:id/aggregate_savings` (whole event / lot) and `GET /v1/trade/:id/best_line_wise_savings` (per line). Both look the stage up with `find_by_id`, answer code 4 when it is missing, then run the record policy (`show?` plus the stage's company must be one of the caller's companies), then `validate_event`, then the masking check (code 577 while bids are hidden), and only then read `misc.savings_configuration`. The journey's RFQ is created with `savings_configuration: null`, so on PROCOL DEMO the happy path is the "no savings configured" answer.

#### API-XDQCS-001 — Savings for a stage that does not exist is a clean 'not found'
- **Why it matters.** The savings widget is polled on every refresh of the comparison; a missing stage (deleted, wrong link) must not crash the poll or leak another stage's numbers.
- **Setup.** Any authenticated buyer of PROCOL DEMO. `Z2dnWmdaUWtnZw==` decodes to id 999999999 (no such stage).
- **Steps.** Ask for the aggregate savings of a stage id that does not exist: `GET /v1/trade/Z2dnWmdaUWtnZw==/aggregate_savings`.
- **Expected.** Refused before any savings maths runs. HTTP 422, error code 4, message 'Request not found'.
- **Oracle.** Status 422 + code 4; body has no `savings` key.
- **Trace.** P1 · automate · `EDGE-DQCS-001` · `app/controllers/api/v1/trade_controller.rb:560-563`

#### API-XDQCS-002 — Savings with an id that does not even decode is still 'not found', not a crash
- **Why it matters.** A malformed uuid decodes to nil (ParamsAuth#check_for_uuid); `find_by_id(nil)` must stay nil and must not fall through to `authorize nil` (which would be a Pundit NotDefinedError = HTTP 500).
- **Setup.** Any buyer. `WrongUuid1=` decodes to nil.
- **Steps.** `GET /v1/trade/WrongUuid1=/aggregate_savings`.
- **Expected.** HTTP 422 code 4 'Request not found'.
- **Oracle.** 422 + code 4.
- **Trace.** P2 · automate · `EDGE-DQCS-002` · `app/controllers/api/v1/trade_controller.rb:561-563; app/controllers/concerns/params_auth.rb:57-66`

#### API-XDQCS-003 — A closed RFQ with no savings set up reports 'no savings', not zero and not an error
- **Why it matters.** Most RFQs are created without a savings reference. The buyer must see an empty savings card, never a fabricated 0% or a crash.
- **Setup.** `{{pricingTradeUuid}}` = the journey's closed RFQ: one submitted bid, award proposal submitted, created with `savings_configuration: null`. Company setting `custom_savings_array_config` decides whether custom savings still apply.
- **Steps.** Read the aggregate savings of the closed journey RFQ: `GET /v1/trade/{{pricingTradeUuid}}/aggregate_savings`.
- **Expected.** HTTP 200. Bidding is over so masking is off; `show_aggregate_savings?` is false (no lot/line savings, and custom savings off) so the answer is `{"savings": null}`. If the client has custom savings switched on, a list of custom (Realised/Unrealised) savings comes back instead. Never a 5xx.
- **Oracle.** 200; `savings` is null (or a list of custom savings objects each with savings_amount, savings_percent, reference).
- **Trace.** P1 · automate · `EDGE-DQCS-003` · `app/controllers/api/v1/trade_controller.rb:567-571; app/models/model_helpers/trade_request_model_helper.rb:668-670; app/controllers/concerns/trade_template_helper.rb:188-213`

#### API-XDQCS-004 — Savings on a live RFQ with no bids yet do not crash and do not invent numbers
- **Why it matters.** While bidding is open the savings card is either hidden (masking) or empty. A live stage with no bids is exactly when nil best-amounts can reach the maths.
- **Setup.** `{{tradeId}}` = sandbox RFQ, published, bid window open, no bids.
- **Steps.** `GET /v1/trade/{{tradeId}}/aggregate_savings`.
- **Expected.** No 5xx. For the stage owner the answer is `{"savings": null}` (no savings configuration). For a buyer who is not the owner while event masking on RFQs is on, 422 code 577 'Savings will be visible after bidding ends'.
- **Oracle.** 200 with savings null, or 422 + code 577.
- **Trace.** P1 · automate · `EDGE-DQCS-004` · `app/controllers/api/v1/trade_controller.rb:567-568; app/models/model_helpers/trade_request_model_helper.rb:258-270`

#### API-XDQCS-005 — Savings asked for a technical (RFP) stage are simply empty
- **Why it matters.** The comparison screen polls savings for every stage tab; a technical stage has no prices and must answer empty, not error.
- **Setup.** rfp_rfq run: `{{rfpTradeId}}` = the sandbox's technical stage.
- **Steps.** `GET /v1/trade/{{rfpTradeId}}/aggregate_savings`.
- **Expected.** HTTP 200 `{"savings": null}` (no savings configuration on an RFP). Never 5xx.
- **Oracle.** 200; savings null.
- **Trace.** P2 · automate · `EDGE-DQCS-005` · `app/controllers/api/v1/trade_controller.rb:560-571`

#### API-XDQCS-006 — A team buyer who is not the owner cannot see savings while an RFQ is still live
- **Why it matters.** Event masking on RFQs is the client's promise that nobody but the owner/super admin sees price movement during bidding. Savings is price movement.
- **Setup.** Company setting `event_masking_on_rfqs` ON (PROCOL DEMO: ON). A second buyer of the same company who is neither super admin nor shared as owner. Sandbox RFQ live with at least one bid. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** 1. Log in as the second buyer. 2. `GET /v1/trade/{{tradeId}}/aggregate_savings`. 3. Repeat `GET /v1/trade/{{tradeId}}/best_line_wise_savings`.
- **Expected.** Both refused: HTTP 422 code 577 'Savings will be visible after bidding ends'. After the bid end time both answer 200.
- **Oracle.** 422 + 577 during bidding; 200 after close.
- **Trace.** P0 · manual · `app/controllers/api/v1/trade_controller.rb:567,580; app/models/model_helpers/trade_request_model_helper.rb:258-270 (show_bidding_stats? 236-243)`

#### API-XDQCS-007 — A vendor cannot read the buyer's savings
- **Why it matters.** Savings reveal the buyer's budget / last purchase price. A vendor who knows the reference knows how far to push.
- **Setup.** Vendor invited to the sandbox RFQ, logged in with a vendor session. No runnable twin: needs a vendor session.
- **Steps.** As the vendor: `GET /v1/trade/{{tradeId}}/aggregate_savings` and `GET /v1/trade/{{tradeId}}/best_line_wise_savings`.
- **Expected.** HTTP 422 code 455 'You are not authorized to perform this action' — the policy requires the stage's company to be one of the caller's companies.
- **Oracle.** 422 + 455 for both.
- **Trace.** P0 · manual · `app/policies/trade_request_policy.rb:104-110; app/controllers/concerns/api_auth.rb:16,117`

#### API-XDQCS-008 — A savings reference of zero must not show 'Infinity %'
- **Why it matters.** When a buyer picks a savings basis (Budget, Last Purchase Price…) but leaves its value at the default 0, the percentage is amount / 0. Ruby float division gives Infinity / NaN, which is rounded and sent as text.
- **Setup.** A lot-based savings configuration with a strategy whose reference value is 0 (the template default `value: 0.0`), at least one bid. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `GET /v1/trade/{{tradeId}}/aggregate_savings` after a bid is in.
- **Expected.** No 5xx. The savings_percent for that strategy should be blank or 0 — today the code computes `savings / 0` and returns the string "Infinity" / "-Infinity" / "NaN" (defect-in-waiting).
- **Oracle.** `savings[i].savings_percent.value` for the zero-reference strategy.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_template_helper.rb:243-244; app/controllers/concerns/utils.rb:907-911; app/models/savings_configuration.rb:21-27`

#### API-XDQCS-009 — Realised savings before anything is awarded is zero, not an error
- **Why it matters.** Custom 'Realised' savings sum the selected (awarded) bid lines. Before award there are none — the card must show 0, not crash on a nil total.
- **Setup.** Company setting `custom_savings_array_config` ON with Realised + Unrealised; RFQ closed with bids, no award yet. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `GET /v1/trade/{{tradeId}}/aggregate_savings`.
- **Expected.** HTTP 200. Realised savings amount 0 (nothing awarded); Unrealised uses the best possible bid. After award, Realised equals reference − awarded total.
- **Oracle.** Values before vs after award.
- **Trace.** P2 · manual · `app/models/savings_configuration.rb:168-177; app/controllers/concerns/trade_template_helper.rb:200-210`

#### API-XDQCS-010 — Line-wise savings for a stage that does not exist is 'not found'
- **Why it matters.** The line-savings table is loaded per stage; a stale link must not 500.
- **Setup.** Any buyer.
- **Steps.** `GET /v1/trade/Z2dnWmdaUWtnZw==/best_line_wise_savings`.
- **Expected.** HTTP 422 code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P1 · automate · `EDGE-DQCS-010` · `app/controllers/api/v1/trade_controller.rb:573-576`

#### API-XDQCS-011 — Line-wise savings on a closed RFQ without savings set up is an empty map
- **Why it matters.** The line-savings table must be empty (not error) when no per-line reference exists.
- **Setup.** `{{pricingTradeUuid}}` closed, one bid, no savings configuration.
- **Steps.** `GET /v1/trade/{{pricingTradeUuid}}/best_line_wise_savings`.
- **Expected.** HTTP 200 `{}` — configuration blank and no custom savings ⇒ early empty answer. With custom savings on, a map keyed by line uuid.
- **Oracle.** 200; `{}` or a map keyed by trade-product uuid.
- **Trace.** P1 · automate · `EDGE-DQCS-011` · `app/controllers/api/v1/trade_controller.rb:583-587`

#### API-XDQCS-012 — Line-wise savings is empty when savings are compared on the whole lot
- **Why it matters.** Lot-based savings are shown once for the event; the per-line table must not double-count them.
- **Setup.** Stage created with `savings_configuration.savings_comparison_on = lot_based`, bids in. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `GET /v1/trade/{{tradeId}}/best_line_wise_savings`, then `GET /v1/trade/{{tradeId}}/aggregate_savings`.
- **Expected.** Line-wise answers `{}`; aggregate answers one entry per strategy (savings_amount, savings_percent, reference).
- **Oracle.** Line-wise `{}`; aggregate list length = number of strategies.
- **Trace.** P2 · manual · `app/controllers/api/v1/trade_controller.rb:583-585; app/controllers/concerns/trade_template_helper.rb:196-199`

#### API-XDQCS-013 — A line won through a counter offer shows no line saving (current behaviour to confirm)
- **Why it matters.** After a negotiated (counter-offered) price the best bid line may have no active/selected bid row; the code skips it (`next if bid_products.blank?`). Buyers may read 'no savings' on exactly the line they negotiated hardest.
- **Setup.** Line-item savings configured; vendor accepted a counter offer on line 1. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `GET /v1/trade/{{tradeId}}/best_line_wise_savings`.
- **Expected.** No 5xx. Record whether line 1 is missing from the map; if missing, raise with product (negotiated savings should arguably count).
- **Oracle.** Presence of line 1's uuid in the response.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_template_helper.rb:296-304`

#### API-XDQCS-014 — Custom savings exist in the API but the screen never asks for them without a savings reference
- **Why it matters.** With `custom_savings_array_config` on and no savings configuration, the API returns custom savings, but the dashboard only calls the endpoint when `savings_configuration` is an object — the buyer never sees them.
- **Setup.** Company setting `custom_savings_array_config` ON; stage without savings configuration; bids in. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** 1. `GET /v1/trade/{{tradeId}}/aggregate_savings` — note the custom savings list. 2. Open the stage in the dashboard.
- **Expected.** API returns a non-empty list; the screen shows no savings card. File as UI gap (see UI-XDQCS-001).
- **Oracle.** API list non-empty vs no card on screen.
- **Trace.** P2 · manual · `app/models/model_helpers/trade_request_model_helper.rb:668-670; procol-client-dashboard/src/views/orderDetails/orderDetails.jsx:1060-1064`

#### API-XDQCS-015 — Line savings follow the chosen basis: per-unit price vs line total
- **Why it matters.** `line_item_savings_on` = price compares unit prices; = total_amount compares quantity × price. Mixing them overstates savings by the quantity factor.
- **Setup.** Two stages with line-item savings, one on price and one on total amount, same reference and same bid (qty 10, price 90, reference 100). No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `GET /v1/trade/<stage>/best_line_wise_savings` for both.
- **Expected.** Price basis: saving 10 per unit (10%). Total basis: reference is the line total, saving 100 (10%). The percentage matches, the amount differs by the quantity.
- **Oracle.** savings_amount and savings_percent per strategy for the line.
- **Trace.** P2 · manual · `app/models/model_helpers/trade_request_model_helper.rb:684-690; app/models/savings_configuration.rb`

#### API-XDQCS-016 — Savings use the stage's base currency symbol or code
- **Why it matters.** In a multi-currency event the savings must be expressed in the base currency, labelled the way the stage is configured (symbol vs code).
- **Setup.** Multi-currency stage, base USD, `default_currency_label_type` = code; one INR bid. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `GET /v1/trade/{{tradeId}}/aggregate_savings`.
- **Expected.** savings_amount.configuration prefix is `USD` (code), amounts in USD after conversion at the stage's rate.
- **Oracle.** configuration prefix and converted value.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_template_helper.rb:222-227,270-275`


## 2. L1 data and L1 prices

Two reads expose the lowest (L1) bid: `GET /v1/trade/:id/l1_data_for_event` (used by the bulk counter-offer drawer) and the `l1_prices` block of `GET /v1/trade/:id/schema?response_type=template&l1_prices=…` (used when converting an RFQ to an auction). Note the policy for `l1_data_for_event?` is only `show?` (read permission) — it does **not** check that the stage belongs to the caller's company, and neither read checks event masking.

#### API-XDQCS-017 — L1 data for a stage that does not exist is 'not found'
- **Why it matters.** The counter-offer drawer loads L1 data when it opens; a bad id must give a clean error.
- **Setup.** Any buyer.
- **Steps.** `GET /v1/trade/Z2dnWmdaUWtnZw==/l1_data_for_event`.
- **Expected.** HTTP 422 code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P1 · automate · `EDGE-DQCS-017` · `app/controllers/api/v1/trade_controller.rb:549-552`

#### API-XDQCS-018 — L1 data on a live RFQ with no bids is an empty map
- **Why it matters.** Before any bid there is no L1; the drawer must open empty.
- **Setup.** Sandbox RFQ live, no bids.
- **Steps.** `GET /v1/trade/{{tradeId}}/l1_data_for_event`.
- **Expected.** HTTP 200 `{}` (event_score_for_participants is blank).
- **Oracle.** 200 `{}`.
- **Trace.** P2 · automate · `EDGE-DQCS-018` · `app/controllers/concerns/trade_template_helper.rb:389-391`

#### API-XDQCS-019 — L1 data after the award does not crash
- **Why it matters.** Once a proposal is approved the winning bid lines move to status 'selected'. `get_l1_data_for_event` only loads bid lines in status active/requested, then calls `.select` on the per-line list — nil for an awarded line ⇒ NoMethodError ⇒ HTTP 500. The scores used for ranking still include the awarded vendor.
- **Setup.** `{{pricingTradeUuid}}` = the journey's closed RFQ with one bid and a submitted proposal. When no approval flow applies, the proposal is approved at submit and the bid lines become 'selected'.
- **Steps.** `GET /v1/trade/{{pricingTradeUuid}}/l1_data_for_event`.
- **Expected.** HTTP 200 with the L1 vendor's line values (or `{}`), never 5xx. **Suspected defect:** if the bid lines are 'selected' this 500s at trade_template_helper.rb:402.
- **Oracle.** Status code; if 200, one entry per line keyed by line uuid.
- **Trace.** P1 · automate · `EDGE-DQCS-019` · `app/controllers/concerns/trade_template_helper.rb:394-402; app/helpers/api/proposal_helper.rb:335; app/controllers/concerns/bids_controller_helper.rb:1571`

#### API-XDQCS-020 — An invited vendor cannot read the L1 competitor's prices
- **Why it matters.** `l1_data_for_event?` is only `show?` and validate_event lets any invited vendor view the stage. The response contains the L1 vendor's negotiable values per line — during a live sealed RFQ that is the competitor's price.
- **Setup.** Sandbox RFQ live with two vendors' bids; caller is the other (non-L1) invited vendor with a vendor session. No runnable twin: needs a vendor session.
- **Steps.** As vendor B: `GET /v1/trade/{{tradeId}}/l1_data_for_event`.
- **Expected.** Refused (expected 455 or `{}`). **Suspected defect:** the code returns the L1 vendor's line values to vendor B.
- **Oracle.** Response must not contain vendor A's price values.
- **Trace.** P0 · manual · `app/policies/trade_request_policy.rb:188-190; app/controllers/api/v1/trade_controller.rb:549-558; app/controllers/concerns/trade_template_helper.rb:389-411`

#### API-XDQCS-021 — L1 prices on the comparison schema are empty before any bid
- **Why it matters.** The RFQ→auction conversion screen pre-fills start prices from `l1_prices`; with no bids it must be empty, not crash.
- **Setup.** Sandbox RFQ live, no bids.
- **Steps.** `GET /v1/trade/{{tradeId}}/schema?response_type=template&additional_fields=order_details&l1_prices=true`.
- **Expected.** HTTP 200; `l1_prices` = `{"lot_based": {}, "line_item_based": {}}`.
- **Oracle.** l1_prices object with two empty maps.
- **Trace.** P2 · automate · `EDGE-DQCS-021` · `app/controllers/api/v1/trade_controller.rb:439; app/controllers/concerns/trade_template_helper.rb:413-416`

#### API-XDQCS-022 — `l1_prices=false` still computes L1 prices
- **Why it matters.** The action checks `if params["l1_prices"]` — any non-empty string, including "false" and "0", turns the computation on. A client that sends false to save work (or to hide prices) still gets them.
- **Setup.** `{{pricingTradeUuid}}` closed with one bid.
- **Steps.** `GET /v1/trade/{{pricingTradeUuid}}/schema?response_type=template&additional_fields=order_details&l1_prices=false`.
- **Expected.** No 5xx. Record that `l1_prices` is present in the response although false was asked (param-parsing quirk; expected absent).
- **Oracle.** Presence of l1_prices with the journey bid's price.
- **Trace.** P2 · automate · `EDGE-DQCS-022` · `app/controllers/api/v1/trade_controller.rb:439`

#### API-XDQCS-023 — An invited vendor cannot get competitors' L1 prices through the schema
- **Why it matters.** `l1_prices` is computed for any caller who can view the stage and the serializer always emits it — no team-order or masking check. A vendor adding `l1_prices=true` to the schema call they already make sees the lowest price and line total of the market during a sealed RFQ.
- **Setup.** Sandbox RFQ live; vendor A and vendor B have bid; caller is vendor B (vendor session). No runnable twin: needs a vendor session.
- **Steps.** As vendor B: `GET /v1/trade/{{tradeId}}/schema?response_type=template&l1_prices=true`.
- **Expected.** `l1_prices` absent or empty for a vendor. **Suspected P0 leak:** it contains vendor A's price/total_amount per line.
- **Oracle.** l1_prices content in vendor B's response.
- **Trace.** P0 · manual · `app/controllers/api/v1/trade_controller.rb:439,470; app/serializers/trade_template_serializer.rb:925-927; app/controllers/concerns/trade_template_helper.rb:413-445`

#### API-XDQCS-024 — A masked team buyer does not get L1 prices during live bidding
- **Why it matters.** When masking hides bids from a non-owner buyer, the same buyer must not be able to read L1 prices from the schema.
- **Setup.** Company setting `event_masking_on_rfqs` ON; second buyer (not owner, not super admin); live RFQ with bids. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** As that buyer: `GET /v1/trade/{{tradeId}}/schema?response_type=template&l1_prices=true`.
- **Expected.** `show_bidding_stats` true and no L1 prices. Today the code computes `l1_prices` regardless of masking (suspected leak).
- **Oracle.** `trade_config.show_bidding_stats` vs `l1_prices`.
- **Trace.** P1 · manual · `app/controllers/api/v1/trade_controller.rb:289,439`

#### API-XDQCS-025 — Whole-event L1 vs per-line L1
- **Why it matters.** On a lot-closing event the L1 is the vendor with the best gross total, and every line takes that vendor's price; on a line-closing event each line has its own L1 vendor. Mixing them gives an auction start price nobody bid.
- **Setup.** Two vendors: A cheapest on line 1, B cheapest on line 2, B cheapest on gross total. Run once with `auction_closing_mode` lot_based, once line_item_based. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `GET /v1/trade/{{tradeId}}/schema?response_type=template&l1_prices=true` in both runs.
- **Expected.** Lot-based: `lot_based.gross_total` = B's gross total and both lines carry B's prices. Line-based: line 1 = A's price, line 2 = B's price, lot_based empty.
- **Oracle.** l1_prices per line vs the bids.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_template_helper.rb:417-445`

#### API-XDQCS-026 — A regretted line shows REGRET and the regretting vendor is not L1 on it
- **Why it matters.** A vendor that regrets (declines) a line must not appear as the cheapest bidder on that line with a zero/blank price.
- **Setup.** Two vendors; vendor A regrets line 2 in the technical stage; both quote line 1. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** Open the RFQ comparison (`GET /v1/trade/{{tradeId}}/schema?response_type=template`) and indicators (`GET /v1/trade/{{tradeId}}/event_indicators`).
- **Expected.** Line 2 status label 'REGRET' for A; best_bidder on line 2 is B.
- **Oracle.** Status label for A's line 2; best_bidder flags.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_template_helper.rb:2283-2311`

#### API-XDQCS-027 — On a weighted event L1 is the best score, not the lowest price
- **Why it matters.** Ranking uses `get_ranking_key` (weighted score when weights apply). The counter-offer drawer and indicators must agree on the same L1.
- **Setup.** RFQ with weightage parameters; vendor A lowest price, vendor B best weighted score. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `GET /v1/trade/{{tradeId}}/event_indicators` and `GET /v1/trade/{{tradeId}}/l1_data_for_event`.
- **Expected.** Both name B as L1; l1_data returns B's line values.
- **Oracle.** best_bidder flag and l1_data vendor_uuid (when requested).
- **Trace.** P2 · manual · `app/controllers/concerns/trade_template_helper.rb:399; app/services/event_indicators/line_item_based.rb:31-41`


## 3. Ranks and event indicators

`GET /v1/trade/:id/event_indicators` returns `auction_identifiers` (which indicators apply) and `auction_identifiers_data` keyed by vendor company uuid → `global` and `inline[line uuid]` with `rank` {value, best_bidder}, `best_price`, `traffic_light_color`, `vendor_rank`. Rank maths (rank_calculator.rb): if more than one vendor shares the best score, **every rank is shifted by one** — tied L1 vendors both show rank 2. The dashboard calls this for every stage whose rfx_mode is not 'rfi' (so RFP stages too).

#### API-XDQCS-028 — Indicators asked for a technical (RFP) stage do not crash
- **Why it matters.** The dashboard calls event_indicators for every non-RFI stage, which includes RFP technical stages that have responses but no prices.
- **Setup.** rfp_rfq run: `{{rfpTradeId}}` = the sandbox's technical stage.
- **Steps.** `GET /v1/trade/{{rfpTradeId}}/event_indicators`.
- **Expected.** HTTP 200 with an identifiers list and an empty (or price-free) data map. Never 5xx.
- **Oracle.** 200; no price values in auction_identifiers_data.
- **Trace.** P2 · automate · `EDGE-DQCS-028` · `app/controllers/api/v1/trade_controller.rb:531-547; procol-client-dashboard/src/redux/orders/helpers.js:1412`

#### API-XDQCS-029 — Indicators on a live RFQ with no bids are empty
- **Why it matters.** Polled every few seconds on the live screen; must be cheap and safe with no bids.
- **Setup.** Sandbox RFQ live, no bids.
- **Steps.** `GET /v1/trade/{{tradeId}}/event_indicators`.
- **Expected.** HTTP 200; `auction_identifiers_data` is `{}` (or `{}` for the whole body if the caller is masked).
- **Oracle.** 200; empty data map.
- **Trace.** P2 · automate · `EDGE-DQCS-029` · `app/services/sourcing_engine/auction_indicators_service.rb:24-34`

#### API-XDQCS-030 — With a single bid, that vendor is the best bidder on every line
- **Why it matters.** The simplest L1 oracle: one bid ⇒ rank 1 and best_bidder true for that vendor on every line.
- **Setup.** `{{pricingTradeUuid}}` closed with one submitted bid from the QA vendor.
- **Steps.** `GET /v1/trade/{{pricingTradeUuid}}/event_indicators`.
- **Expected.** HTTP 200; exactly one key in `auction_identifiers_data` (the QA vendor's company uuid); for each line `inline[line].rank.best_bidder` = true and rank value "1" when ranks are shown.
- **Oracle.** One vendor key; best_bidder true per line.
- **Trace.** P1 · automate · `EDGE-DQCS-030` · `app/services/sourcing_engine/auction_indicators_service.rb:131-160; app/services/event_indicators/concerns/rank_calculator.rb:22-31`

#### API-XDQCS-031 — Indicators with an undecodable stage id are 'not found'
- **Why it matters.** Same guard as the bogus-id case but through the nil-decode path (`where(id: nil).last`).
- **Setup.** Any buyer.
- **Steps.** `GET /v1/trade/WrongUuid1=/event_indicators`.
- **Expected.** HTTP 422 code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EDGE-DQCS-031` · `app/controllers/api/v1/trade_controller.rb:532-537; app/controllers/concerns/trade_controller_helper.rb:2214-2215`

#### API-XDQCS-032 — Tied L1 vendors are both 'best bidder' and both show rank 2
- **Why it matters.** When two vendors quote the same best price, `ranking_for_scores` adds 1 to every rank so nobody is shown as 1. Buyers and vendors read '2' and assume someone is cheaper. The best_bidder flag (value == min rank) is still true for both.
- **Setup.** Two vendors quote the identical lowest price on a line (company `is_tie_bid_allowed` ON so the tie is accepted). No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `GET /v1/trade/{{tradeId}}/event_indicators`.
- **Expected.** Both vendors: rank value "2", best_bidder true; third vendor rank "3". Confirm with product that 'no rank 1 on a tie' is intended and that the QCS shows a tie badge.
- **Oracle.** rank.value and rank.best_bidder per vendor per line.
- **Trace.** P1 · manual · `app/services/event_indicators/concerns/rank_calculator.rb:22-31; app/services/sourcing_engine/auction_indicators_service.rb:150-160`

#### API-XDQCS-033 — An invited vendor cannot read every competitor's rank and best price
- **Why it matters.** `event_indicators?` is only `show?`; masking does not apply to vendors (the masking rule only looks at the buyer's own companies). The vendor gets a map keyed by every bidding company's uuid with rank, best_bidder and best_price.
- **Setup.** Sandbox RFQ live; three vendors bid; caller is one of them (vendor session). No runnable twin: needs a vendor session.
- **Steps.** As the vendor: `GET /v1/trade/{{tradeId}}/event_indicators`.
- **Expected.** Only the caller's own entry (or rank-only per configured indicators). **Suspected leak:** all three companies' entries, including who is best_bidder.
- **Oracle.** Number of company keys in auction_identifiers_data.
- **Trace.** P1 · manual · `app/policies/trade_request_policy.rb:64-66; app/controllers/api/v1/trade_controller.rb:531-547; app/models/model_helpers/trade_request_model_helper.rb:258-270`

#### API-XDQCS-034 — Vendor rank in the QCS appears only when the client enables it
- **Why it matters.** `display_vendor_rank_in_auction_qcs` adds a 'vendor_rank' indicator (overall rank ignoring weights/loading).
- **Setup.** Company setting `display_vendor_rank_in_auction_qcs` ON (PROCOL DEMO: OFF) — compare both states. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `GET /v1/trade/{{pricingTradeUuid}}/event_indicators`.
- **Expected.** ON: `auction_identifiers` contains 'vendor_rank' and each vendor's global block has vendor_rank. OFF: absent.
- **Oracle.** auction_identifiers list.
- **Trace.** P2 · manual · `app/controllers/api/v1/trade_controller.rb:541-542; app/services/sourcing_engine/auction_indicators_service.rb:18,121-127`

#### API-XDQCS-035 — A masked buyer gets an empty indicators body during live bidding
- **Why it matters.** Masking must hide ranks too, not only prices.
- **Setup.** Company setting `event_masking_on_rfqs` ON; second buyer (not owner/super admin); live RFQ with bids. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** As that buyer: `GET /v1/trade/{{tradeId}}/event_indicators`.
- **Expected.** HTTP 200 `{}`.
- **Oracle.** Empty body.
- **Trace.** P1 · manual · `app/controllers/api/v1/trade_controller.rb:538-540`

#### API-XDQCS-036 — Hiding ranks still reveals who is L1 through best_bidder
- **Why it matters.** When `should_show_rank?` is false the rank value is blanked, but `best_bidder` is computed from the real rank and still sent — the L1 is identifiable.
- **Setup.** Auction with rank display off for participants; two vendors bid; caller is a vendor. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** As the vendor: `GET /v1/trade/{{tradeId}}/event_indicators`.
- **Expected.** rank.value null for everyone AND best_bidder not revealed. Today best_bidder is true for the L1 vendor (suspected leak).
- **Oracle.** best_bidder values when rank.value is null.
- **Trace.** P2 · manual · `app/services/sourcing_engine/auction_indicators_service.rb:148-160`


## 4. Rejected bids and bidder remarks

`GET /v1/trade/:id/rejected_bids` (bids the buyer rejected, grouped by vendor) and `GET /v1/trade/:id/bidder_remarks` (remarks vendors typed on their bids). Both authorize on the class with `show?` only and then call `validate_event`.

#### API-XDQCS-037 — Rejected bids for a stage that does not exist is 'not found'
- **Why it matters.** The rejected-bids modal opens from the comparison; a stale stage must not 500.
- **Setup.** Any buyer.
- **Steps.** `GET /v1/trade/Z2dnWmdaUWtnZw==/rejected_bids`.
- **Expected.** HTTP 422 code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P1 · automate · `EDGE-DQCS-037` · `app/controllers/api/v1/trade_controller.rb:597-602`

#### API-XDQCS-038 — A stage with no rejected bids returns an empty map
- **Why it matters.** The modal must show its empty state, not an error, when nothing was rejected.
- **Setup.** `{{pricingTradeUuid}}` closed, one active bid, nothing rejected.
- **Steps.** `GET /v1/trade/{{pricingTradeUuid}}/rejected_bids`.
- **Expected.** HTTP 200 `{}`.
- **Oracle.** 200; empty object.
- **Trace.** P2 · automate · `EDGE-DQCS-038` · `app/controllers/api/v1/trade_controller.rb:603-619`

#### API-XDQCS-039 — Bidder remarks for a stage that does not exist is 'not found'
- **Why it matters.** Same guard on the remarks panel.
- **Setup.** Any buyer.
- **Steps.** `GET /v1/trade/Z2dnWmdaUWtnZw==/bidder_remarks`.
- **Expected.** HTTP 422 code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EDGE-DQCS-039` · `app/controllers/api/v1/trade_controller.rb:622-627`

#### API-XDQCS-040 — Bidder remarks on a closed RFQ list only non-draft bids that carry remarks
- **Why it matters.** Draft and inactive bids must never surface in the buyer's remarks panel.
- **Setup.** `{{pricingTradeUuid}}` closed with one submitted bid.
- **Steps.** `GET /v1/trade/{{pricingTradeUuid}}/bidder_remarks`.
- **Expected.** HTTP 200; an array — empty unless the QA vendor typed remarks; never includes draft/in_active bids.
- **Oracle.** 200; array; each entry has a company and remark text.
- **Trace.** P2 · automate · `EDGE-DQCS-040` · `app/controllers/api/v1/trade_controller.rb:629-640`

#### API-XDQCS-041 — A vendor cannot read other vendors' rejected bids or remarks
- **Why it matters.** Both actions authorize only `show?` on the class and do not filter by the caller's company. An invited vendor can read every vendor's rejected bid amounts and free-text remarks (which often contain prices and conditions).
- **Setup.** Two vendors bid; buyer rejected vendor A's bid; caller is vendor B (vendor session). No runnable twin: needs a vendor session.
- **Steps.** As vendor B: `GET /v1/trade/{{tradeId}}/rejected_bids` and `GET /v1/trade/{{tradeId}}/bidder_remarks`.
- **Expected.** Only vendor B's own data (or refused). **Suspected leak:** vendor A's rejected bid and remarks come back (names masked only if vendor masking is on).
- **Oracle.** Company keys / entries in both responses.
- **Trace.** P1 · manual · `app/policies/trade_request_policy.rb:52-58; app/controllers/api/v1/trade_controller.rb:597-640`

#### API-XDQCS-042 — Rejected bids are shown in the vendor's own currency to non-team viewers
- **Why it matters.** `convert_to_original_currency` is true when the stage's company is not the caller's; buyers see base-currency values, others the bid currency.
- **Setup.** Multi-currency stage (base INR), vendor bid in USD then rejected. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** Buyer: `GET /v1/trade/{{tradeId}}/rejected_bids`; compare with what the modal shows under 'Show in native currency'.
- **Expected.** Buyer response in INR at the stage rate; native toggle shows USD with the vendor currency precision.
- **Oracle.** Amount + currency per rejected bid.
- **Trace.** P2 · manual · `app/controllers/api/v1/trade_controller.rb:603; procol-client-dashboard/src/views/orderDetails/rejectedBidsModal.jsx:84-85,142-144`

#### API-XDQCS-043 — Vendor names are masked in remarks and rejected bids while vendor masking is on
- **Why it matters.** `mask_participant_name?` hides names during upcoming/running for the buyer's team (except super admin when configured).
- **Setup.** Stage `is_vendor_masking_enabled` ON, live; non-super-admin buyer. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `GET /v1/trade/{{tradeId}}/bidder_remarks` and `/rejected_bids`.
- **Expected.** Company names masked (generic labels) while live; real names after close.
- **Oracle.** Company name fields before/after close.
- **Trace.** P2 · manual · `app/models/model_helpers/trade_request_model_helper.rb:967-969,1223-1230`


## 5. Quote details and quote summary

`GET /v1/trade/:id/quote_details/:quote_id` — one vendor's full quote (the 'View quote' drawer in the comparison). `GET /v1/trade/:id/quote_summary/:quote_id` — per-tab totals for BOQ events. Both decode `quote_id` like `id`. `quote_details` reads `tab`, `page`, `proposal_uuid` (RFP only), `show_surrogate_bid` (RFP only) and `additional_request_bid_required`. These paths have two segments after the stage id, so they are not on the runner's default allowlist (see report).

#### API-XDQCS-044 — Paging a quote on an event without tabs does not crash
- **Why it matters.** `set_pagination_for_line_items` runs whenever `tab` and `page` are both present and does `trade.tabs[params['tab'].to_i]` with no blank check. `tabs` is nil on non-BOQ events ⇒ NoMethodError ⇒ 500. The master-QCS twin of this helper guards `return if tabs.blank?`; this one does not.
- **Setup.** `{{pricingTradeUuid}}` closed non-BOQ RFQ (no tabs) with bid `{{bidUuid}}`.
- **Steps.** Open the vendor's quote with paging parameters: `GET /v1/trade/{{pricingTradeUuid}}/quote_details/{{bidUuid}}?tab=0&page=1`.
- **Expected.** HTTP 200 with the quote (paging ignored), never 5xx. **Suspected defect:** 500 at trade_controller_helper.rb:6341.
- **Oracle.** Status code.
- **Trace.** P1 · automate · `EDGE-DQCS-044` · `app/controllers/api/v1/trade_controller.rb:652; app/controllers/concerns/trade_controller_helper.rb:6337-6347; app/controllers/concerns/event_group_controller_helper.rb:208-209`

#### API-XDQCS-045 — Opening a quote that does not exist says 'Bid not found'
- **Why it matters.** The quote drawer is opened from links; a stale bid id must be a clean error.
- **Setup.** `{{pricingTradeUuid}}` closed.
- **Steps.** `GET /v1/trade/{{pricingTradeUuid}}/quote_details/Z2dnWmdaUWtnZw==`.
- **Expected.** HTTP 422 code 32 'Bid not found'.
- **Oracle.** 422 + 32.
- **Trace.** P1 · automate · `EDGE-DQCS-045` · `app/controllers/api/v1/trade_controller.rb:731-732`

#### API-XDQCS-046 — A real bid cannot be opened through a different stage
- **Why it matters.** Quote ids must be scoped to the stage in the URL — otherwise anyone who can view stage X could read a bid from stage Y.
- **Setup.** `{{bidUuid}}` belongs to the journey RFQ; `{{tradeId}}` is the sandbox RFQ (different event).
- **Steps.** `GET /v1/trade/{{tradeId}}/quote_details/{{bidUuid}}`.
- **Expected.** HTTP 422 code 32 'Bid not found' (lookup is by bid id AND stage id).
- **Oracle.** 422 + 32.
- **Trace.** P0 · automate · `EDGE-DQCS-046` · `app/controllers/api/v1/trade_controller.rb:731-732`

#### API-XDQCS-047 — A bid id sent to a technical stage's quote view is 'not found'
- **Why it matters.** On RFP stages `quote_id` is a template response, not a bid. Passing a bid id must not return some other vendor's technical response.
- **Setup.** rfp_rfq run: `{{rfpTradeId}}` = sandbox technical stage; `{{bidUuid}}` = the journey's RFQ bid.
- **Steps.** `GET /v1/trade/{{rfpTradeId}}/quote_details/{{bidUuid}}`.
- **Expected.** HTTP 422 code 4 'Request not found' — no template response with that id on this stage.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EDGE-DQCS-047` · `app/controllers/api/v1/trade_controller.rb:665-668`

#### API-XDQCS-048 — Quote details without the pending-request overlay still opens
- **Why it matters.** `additional_request_bid_required=false` asks for the quote without counter-offer/justification overlays (used by the edit-bid modal).
- **Setup.** `{{pricingTradeUuid}}` closed with `{{bidUuid}}`.
- **Steps.** `GET /v1/trade/{{pricingTradeUuid}}/quote_details/{{bidUuid}}?additional_request_bid_required=false`.
- **Expected.** HTTP 200 with sheet_uuid = the bid uuid, inline_data per line, participants and tabs_summary.
- **Oracle.** 200; sheet_uuid equals {{bidUuid}}.
- **Trace.** P2 · automate · `EDGE-DQCS-048` · `app/controllers/api/v1/trade_controller.rb:739-742,789-799`

#### API-XDQCS-049 — Quote summary on an event without tabs is refused
- **Why it matters.** Tab totals only exist on BOQ events; a non-BOQ stage must answer a clear refusal, not an empty summary that looks like zero.
- **Setup.** `{{tradeId}}` sandbox non-BOQ RFQ (no tabs).
- **Steps.** `GET /v1/trade/{{tradeId}}/quote_summary/Z2dnWmdaUWtnZw==`.
- **Expected.** HTTP 422 code 101 'You are not allowed to perform this action' (tabs blank is checked before the bid).
- **Oracle.** 422 + 101.
- **Trace.** P2 · automate · `EDGE-DQCS-049` · `app/controllers/api/v1/trade_controller.rb:813`

#### API-XDQCS-050 — A vendor cannot open another vendor's quote
- **Why it matters.** `can_view_bid?` allows the bid's own user, the client's team, or the bid's company/broker. A competitor must get 'Bid not found'.
- **Setup.** Two vendors bid; caller is vendor B (vendor session); quote id = vendor A's bid. No runnable twin: needs a vendor session.
- **Steps.** As vendor B: `GET /v1/trade/{{tradeId}}/quote_details/<vendor A bid uuid>`.
- **Expected.** HTTP 422 code 32 'Bid not found'.
- **Oracle.** 422 + 32.
- **Trace.** P0 · manual · `app/controllers/api/v1/trade_controller.rb:737; app/models/user.rb:711-728`

#### API-XDQCS-051 — A masked buyer cannot open quotes during live bidding (except a pending surrogate bid)
- **Why it matters.** Masking returns 32 for quote details unless the bid is a surrogate bid waiting for approval (the approver must see what they approve).
- **Setup.** Company setting `event_masking_on_rfqs` ON; non-owner buyer; live RFQ with a normal bid and a surrogate bid pending approval. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `GET /v1/trade/{{tradeId}}/quote_details/<normal bid>` then `<surrogate bid>`.
- **Expected.** Normal bid: 422 code 32. Pending surrogate bid: 200.
- **Oracle.** Status per bid.
- **Trace.** P1 · manual · `app/controllers/api/v1/trade_controller.rb:734-736`

#### API-XDQCS-052 — BOQ quote paging: out-of-range tab and page 0
- **Why it matters.** `tabs[99]` falls back to the first tab; page 0 gives a negative 'from' index. Both must return a sensible page, not empty data that looks like a zero quote.
- **Setup.** BOQ RFQ with 2 tabs and a bid. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `GET /v1/trade/{{tradeId}}/quote_details/{{bidUuid}}?tab=99&page=1` and `?tab=0&page=0`.
- **Expected.** tab=99 → first tab's lines. page=0 → first page (or 422), never lines from the previous tab and never 5xx.
- **Oracle.** Line numbers in inline_data vs tab range.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:6341-6346`


## 6. Alternate-bidding leader board

`GET /v1/trade/:id/alternate_bidding_leader_board` ranks alternatives when the stage allows alternate bidding. Unlike the savings/L1 reads, this action calls `authorize trade` **before** checking that the stage exists: with an unknown id Pundit is asked for a policy of `nil`, raises `Pundit::NotDefinedError`, and only `NotAuthorizedError` is rescued (api_auth.rb:16) ⇒ HTTP 500.

#### API-XDQCS-053 — Leader board for a stage that does not exist does not crash
- **Why it matters.** Any stale or mistyped link to the leaderboard tab produces a server error today.
- **Setup.** Any buyer.
- **Steps.** `GET /v1/trade/Z2dnWmdaUWtnZw==/alternate_bidding_leader_board`.
- **Expected.** A clean 4xx (422 code 4 like the sibling actions). **Suspected defect:** HTTP 500 — `authorize nil` raises Pundit::NotDefinedError.
- **Oracle.** Status code.
- **Trace.** P1 · automate · `EDGE-DQCS-053` · `app/controllers/api/v1/trade_controller.rb:865-868; app/controllers/concerns/api_auth.rb:16`

#### API-XDQCS-054 — Leader board with an undecodable id does not crash
- **Why it matters.** Same wrong guard order through the nil-decode path.
- **Setup.** Any buyer.
- **Steps.** `GET /v1/trade/WrongUuid1=/alternate_bidding_leader_board`.
- **Expected.** A clean 4xx. **Suspected defect:** 500.
- **Oracle.** Status code.
- **Trace.** P2 · automate · `EDGE-DQCS-054` · `app/controllers/api/v1/trade_controller.rb:866-868`

#### API-XDQCS-055 — Leader board on a stage without alternate bidding is refused
- **Why it matters.** The tab is hidden when alternate bidding is off; the API must agree and refuse rather than return a misleading ranking.
- **Setup.** Sandbox RFQ created with `is_alternate_bidding_allowed` OFF (the journey default).
- **Steps.** `GET /v1/trade/{{tradeId}}/alternate_bidding_leader_board`.
- **Expected.** HTTP 422 code 101 'You are not allowed to perform this action'.
- **Oracle.** 422 + 101.
- **Trace.** P2 · automate · `EDGE-DQCS-055` · `app/controllers/api/v1/trade_controller.rb:871; app/models/model_helpers/trade_request_model_helper.rb:870-873`

#### API-XDQCS-056 — A vendor cannot read the alternate-bidding leader board
- **Why it matters.** The policy requires the stage's company to be the caller's; the board ranks every vendor's alternatives.
- **Setup.** Alternate-bidding stage; caller is an invited vendor. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** As the vendor: `GET /v1/trade/{{tradeId}}/alternate_bidding_leader_board`.
- **Expected.** HTTP 422 code 455 'You are not authorized to perform this action'.
- **Oracle.** 422 + 455.
- **Trace.** P1 · manual · `app/policies/trade_request_policy.rb:176-178`

#### API-XDQCS-057 — Leader board ranks each alternative separately
- **Why it matters.** With alternate bidding a vendor can submit several alternatives; each must be ranked on its own, with draft bids hidden from the buyer unless allowed.
- **Setup.** Alternate-bidding RFQ; vendor A submits 2 alternatives, vendor B one. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `GET /v1/trade/{{tradeId}}/alternate_bidding_leader_board`.
- **Expected.** Three ranked rows (A-alt1, A-alt2, B) with rank widgets; the columns come from the leader-board widgets.
- **Oracle.** `data` rows and `widgets`.
- **Trace.** P2 · manual · `app/controllers/api/v1/trade_controller.rb:872-886`


## 7. Sealed bids — masking, bid lock, unlock OTP, bid visibility

Who may see prices before close is decided by `event_masking_enabled?` (trade_request_model_helper.rb:258): auction team members always see; if bids are **locked** (`lock_bid_by_default`) everyone in the client is masked until a finance user unlocks with an OTP; with closed-envelope bidding the client's team is masked while running; with event masking on RFQs/auctions everyone except super admins and owners is masked while running. Unlocking: `GET get_users_for_bid_visibility` (finance users) → `POST send_otp_for_unlocking_bids` → `POST verify_otp_for_unlocking_bids` with `bid_visibility` everyone | self | none. Error 10 'You are not allowed to use this functionality' covers 'not a finance user' and 'bids are not locked'. PROCOL DEMO has `lock_bid_by_default` OFF, so the runnable cases pin the refusals.

#### API-XDQCS-058 — Finance users for unlocking cannot be listed when bids are not locked
- **Why it matters.** The unlock flow exists only for stages that lock bids; otherwise the list of finance users (names + emails) must not be served.
- **Setup.** Company setting `lock_bid_by_default` OFF (PROCOL DEMO). Sandbox RFQ live.
- **Steps.** `GET /v1/trade/{{tradeId}}/get_users_for_bid_visibility`.
- **Expected.** HTTP 422 code 10 'You are not allowed to use this functionality'.
- **Oracle.** 422 + 10.
- **Trace.** P1 · automate · `EDGE-DQCS-058` · `app/controllers/api/v1/trade_controller.rb:1295-1304; app/models/model_helpers/trade_request_model_helper.rb:1487-1489`

#### API-XDQCS-059 — Finance users for a stage that does not exist is 'not found'
- **Why it matters.** Lookup is scoped to the caller's workspace; unknown ids must not leak which stages exist.
- **Setup.** Any buyer.
- **Steps.** `GET /v1/trade/Z2dnWmdaUWtnZw==/get_users_for_bid_visibility`.
- **Expected.** HTTP 422 code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EDGE-DQCS-059` · `app/controllers/api/v1/trade_controller.rb:1300-1301`

#### API-XDQCS-060 — Requesting an unlock OTP without choosing a finance user is refused
- **Why it matters.** The OTP must go to a named finance user; an empty request must not default to anyone.
- **Setup.** Any buyer; sandbox RFQ.
- **Steps.** `POST /v1/trade/{{tradeId}}/send_otp_for_unlocking_bids` with body `{}`.
- **Expected.** HTTP 422 code 2 'Insufficient parameters'. No OTP is sent.
- **Oracle.** 422 + 2.
- **Trace.** P1 · automate · `EDGE-DQCS-060` · `app/controllers/api/v1/trade_controller.rb:1246-1252`

#### API-XDQCS-061 — An unlock OTP cannot be sent to someone who is not a finance user
- **Why it matters.** Only finance users may authorise opening sealed bids; a buyer naming themselves must be refused.
- **Setup.** `lock_bid_by_default` OFF; the run's own buyer `{{buyerUserUuid}}`.
- **Steps.** `POST /v1/trade/{{tradeId}}/send_otp_for_unlocking_bids` with body `{"user_uuid": "{{buyerUserUuid}}"}`.
- **Expected.** HTTP 422 code 10 'You are not allowed to use this functionality' (not a finance user, or bids not locked — same code either way). No OTP is sent.
- **Oracle.** 422 + 10.
- **Trace.** P1 · automate · `EDGE-DQCS-061` · `app/controllers/api/v1/trade_controller.rb:1253-1260`

#### API-XDQCS-062 — An unlock OTP for a user that does not exist is refused
- **Why it matters.** Unknown users must not be accepted as OTP recipients.
- **Setup.** Any buyer.
- **Steps.** `POST /v1/trade/{{tradeId}}/send_otp_for_unlocking_bids` with body `{"user_uuid": "Z2dnWmdaUWtnZw=="}`.
- **Expected.** HTTP 422 code 2 'Insufficient parameters'.
- **Oracle.** 422 + 2.
- **Trace.** P2 · automate · `EDGE-DQCS-062` · `app/controllers/api/v1/trade_controller.rb:1253-1254`

#### API-XDQCS-063 — Verifying an unlock without an OTP is refused
- **Why it matters.** No OTP, no unlock — the visibility must not change.
- **Setup.** Any buyer.
- **Steps.** `POST /v1/trade/{{tradeId}}/verify_otp_for_unlocking_bids` with body `{"user_uuid": "{{buyerUserUuid}}", "bid_visibility": "everyone"}`.
- **Expected.** HTTP 422 code 2 'Insufficient parameters'; bid_visibility unchanged.
- **Oracle.** 422 + 2.
- **Trace.** P1 · automate · `EDGE-DQCS-063` · `app/controllers/api/v1/trade_controller.rb:1270-1278`

#### API-XDQCS-064 — A wrong OTP never unlocks bids
- **Why it matters.** Guessing must not open sealed bids.
- **Setup.** `lock_bid_by_default` OFF; run's own buyer.
- **Steps.** `POST /v1/trade/{{tradeId}}/verify_otp_for_unlocking_bids` with body `{"user_uuid": "{{buyerUserUuid}}", "otp": "000000", "bid_visibility": "everyone"}`.
- **Expected.** HTTP 422 code 10 'You are not allowed to use this functionality' (not finance / not locked). With locking on and a finance user: 422 code 6 'Invalid OTP'. Visibility unchanged.
- **Oracle.** 422 + 10 (or 6).
- **Trace.** P0 · automate · `EDGE-DQCS-064` · `app/controllers/api/v1/trade_controller.rb:1279-1289`

#### API-XDQCS-065 — Sealed bids cannot be unlocked while bidding is still live
- **Why it matters.** The dashboard offers 'Unlock bids' only in the buffer state (after bid end), but the API only checks that the stage is active — it does not check that bidding is over. A finance user could open sealed bids mid-RFQ.
- **Setup.** Company setting `lock_bid_by_default` ON; RFQ live (before bid end) with bids; a finance user. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** Send OTP, then verify with the right OTP and `bid_visibility: everyone`, while the RFQ is still live.
- **Expected.** Refused until bid end (expected). **Suspected gap:** accepted; bids visible to the team during live bidding.
- **Oracle.** After verify: does `GET /v1/trade/{{tradeId}}/aggregate_savings` stop answering 577 before bid end?
- **Trace.** P1 · manual · `app/controllers/api/v1/trade_controller.rb:1256-1260,1281-1285; procol-client-dashboard/src/views/orderDetails/eventHeader/eventHeader.jsx:400-403`

#### API-XDQCS-066 — An unknown bid_visibility value is refused, not silently ignored
- **Why it matters.** `update_bid_visibility` only handles none/everyone/self; any other value saves nothing but the endpoint still answers success — the finance user thinks bids are unlocked.
- **Setup.** `lock_bid_by_default` ON; finance user with a valid OTP. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** Verify with `bid_visibility: "all"`.
- **Expected.** 422 code 2/888 (expected). **Today:** success with no change.
- **Oracle.** Success response vs bids still masked (`aggregate_savings` still 577).
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:5633-5646; app/controllers/api/v1/trade_controller.rb:1289`

#### API-XDQCS-067 — Bids cannot be unlocked before technical evaluation when the client requires it
- **Why it matters.** `restrict_unlock_bid_before_evaluation` keeps commercial bids sealed until the technical stage is evaluated (two-envelope procurement).
- **Setup.** Company setting `restrict_unlock_bid_before_evaluation` ON (PROCOL DEMO: OFF); RFP+RFQ event, RFP not evaluated; bids locked. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `POST /v1/trade/{{tradeId}}/send_otp_for_unlocking_bids` for a finance user.
- **Expected.** HTTP 422 code 790 'Bids can't be unlocked until technical evaluation is done'. After evaluation: OTP sent.
- **Oracle.** 422 + 790, then success.
- **Trace.** P1 · manual · `app/controllers/api/v1/trade_controller.rb:1261-1263; app/models/model_helpers/trade_request_model_helper.rb:1523-1525`

#### API-XDQCS-068 — While bids are locked every price read is masked; 'self' unlocks only for one user
- **Why it matters.** Locked bids must be consistent across savings, schema, report and quote reads; 'self' must not unlock for colleagues.
- **Setup.** `lock_bid_by_default` ON; bids in; then unlock with `bid_visibility: self` by buyer X via a finance user. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** Before unlock (any buyer): aggregate_savings, quote_details, download_report. After unlock: repeat as buyer X and as buyer Y.
- **Expected.** Before: 577 / 32 / 831 'Unlock Bid to Download Report'. After: X sees everything; Y still masked. With 'everyone': both see.
- **Oracle.** Status codes per user before/after.
- **Trace.** P0 · manual · `app/models/model_helpers/trade_request_model_helper.rb:273-283; app/controllers/concerns/reports_controller_helper.rb:856-868`

#### API-XDQCS-069 — Closed-envelope bidding masks even super admins while running
- **Why it matters.** `closed_envelope_bidding_for_rfqs` is the stricter mode: masking applies to everyone in the client including super admins (unless part of the auction team).
- **Setup.** Company setting `closed_envelope_bidding_for_rfqs` ON (PROCOL DEMO: OFF); live RFQ with bids; super-admin buyer. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `GET /v1/trade/{{tradeId}}/aggregate_savings`, `/event_indicators`.
- **Expected.** 577 and `{}` during bidding; data after close.
- **Oracle.** Status/body during vs after.
- **Trace.** P1 · manual · `app/models/model_helpers/trade_request_model_helper.rb:246-253,262-263`

#### API-XDQCS-070 — Another company's buyer cannot list this company's finance users
- **Why it matters.** The finance-user list contains names and emails; the lookup is scoped to the caller's workspace.
- **Setup.** Buyer of another client (e.g. Demo Account 2) with the PROCOL DEMO stage uuid. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `GET /v1/trade/<PROCOL DEMO stage>/get_users_for_bid_visibility` as that buyer.
- **Expected.** HTTP 422 code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P1 · manual · `app/controllers/api/v1/trade_controller.rb:1299-1301`


## 8. Exports — bid template, comparison report, vendor logs, master QCS regeneration

`GET /v1/trade/:id/download_event_details[?company_uuid=]` builds the bid-template Excel (pre-filled with a vendor's latest bid) and writes a Report row; `POST /reports/download_report` exports the comparison / master QCS (dashboard sends item_uuid, item_type, report_category, lot_no, column_selection); `GET /v1/trade/:id/trade_history` (vendor bidding logs) is Procol-employee-only; `POST /event_groups/regenerate_master_qcs` is Procol-employee + allow-list only (EDGE-AWD-050 covers the plain refusal; the cases here pin the guard order).

#### API-XDQCS-071 — Bid template for a company that does not exist does not crash
- **Why it matters.** `company_uuid` is decoded and used as `Company.find_by(id:)` with no nil check; the Excel service then calls `@current_workspace.id` in its constructor ⇒ NoMethodError ⇒ 500.
- **Setup.** Sandbox RFQ live (status active).
- **Steps.** `GET /v1/trade/{{tradeId}}/download_event_details?company_uuid=Z2dnWmdaUWtnZw==`.
- **Expected.** A clean 4xx (company not found). **Suspected defect:** HTTP 500. Nothing should be written (the crash happens before the Report row).
- **Oracle.** Status code; no new report.
- **Trace.** P1 · automate · `EDGE-DQCS-071` · `app/controllers/api/v1/trade_controller.rb:1046-1051; app/services/procol_excel/trade_request_details_service.rb:21-26`

#### API-XDQCS-072 — Bid template with an undecodable stage id asks for parameters
- **Why it matters.** The action checks the id first; a nil id must be a 2, not a nil lookup.
- **Setup.** Any buyer.
- **Steps.** `GET /v1/trade/WrongUuid1=/download_event_details`.
- **Expected.** HTTP 422 code 2 'Insufficient parameters'.
- **Oracle.** 422 + 2.
- **Trace.** P2 · automate · `EDGE-DQCS-072` · `app/controllers/api/v1/trade_controller.rb:1040-1042`

#### API-XDQCS-073 — Bid template for a stage that does not exist is 'not found'
- **Why it matters.** No Excel, no Report row for unknown stages.
- **Setup.** Any buyer.
- **Steps.** `GET /v1/trade/Z2dnWmdaUWtnZw==/download_event_details`.
- **Expected.** HTTP 422 code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EDGE-DQCS-073` · `app/controllers/api/v1/trade_controller.rb:1043-1044`

#### API-XDQCS-074 — Bid template for a closed RFQ: either a file or 'not found', never a crash
- **Why it matters.** Only active/draft stages are served; after award the stage may be closed. The buyer should get a clear answer either way.
- **Setup.** `{{pricingTradeUuid}}` closed with one bid and a submitted proposal.
- **Steps.** `GET /v1/trade/{{pricingTradeUuid}}/download_event_details`.
- **Expected.** HTTP 200 `{excel_url}` while the stage status is still active (a Report row is written for the run's buyer), or 422 code 4 once the stage is closed. Never 5xx.
- **Oracle.** Status; excel_url when 200.
- **Trace.** P2 · automate · `EDGE-DQCS-074` · `app/controllers/api/v1/trade_controller.rb:1043-1062`

#### API-XDQCS-075 — A vendor cannot download a competitor's bid through the bid template
- **Why it matters.** `company_uuid` is taken from the request without checking it is the caller's company, and the Excel is pre-filled with that company's latest bid — including DRAFT bids. Policy is only 'can view the event', which every invited vendor passes.
- **Setup.** Two invited vendors; vendor A has a draft or submitted bid; caller is vendor B (vendor session). No runnable twin: needs a vendor session.
- **Steps.** As vendor B: `GET /v1/trade/{{tradeId}}/download_event_details?company_uuid=<vendor A company uuid>`; open the Excel.
- **Expected.** Refused, or the Excel contains only B's data. **Suspected P0 leak:** the Excel contains A's prices.
- **Oracle.** Excel cell values vs vendor A's bid.
- **Trace.** P0 · manual · `app/controllers/api/v1/trade_controller.rb:1041-1051; app/policies/trade_request_policy.rb:180-182; app/services/procol_excel/trade_request_details_service.rb:25-41`

#### API-XDQCS-076 — A client buyer cannot download vendor bidding logs
- **Why it matters.** Vendor logs (IP, timestamps, every bid revision) are Procol-internal; the menu is shown only to Procol employees and the API must agree.
- **Setup.** Run's buyer (client user, not a Procol employee). `{{pricingTradeUuid}}` closed.
- **Steps.** `GET /v1/trade/{{pricingTradeUuid}}/trade_history`.
- **Expected.** HTTP 422 code 455 'You are not authorized to perform this action'.
- **Oracle.** 422 + 455; no file URL.
- **Trace.** P0 · automate · `EDGE-DQCS-076` · `app/controllers/api/v1/trade_controller.rb:1412-1418; app/policies/trade_request_policy.rb:204-206`

#### API-XDQCS-077 — Vendor logs for an unknown stage say 'not found' (before the permission check)
- **Why it matters.** validate_event runs before authorize here, so a client user learns whether a stage id exists (4) vs is forbidden (455). Pin the current order; a later fix should make both 455.
- **Setup.** Run's client buyer.
- **Steps.** `GET /v1/trade/Z2dnWmdaUWtnZw==/trade_history`.
- **Expected.** HTTP 422 code 4 'Request not found' (current guard order).
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EDGE-DQCS-077` · `app/controllers/api/v1/trade_controller.rb:1413-1418`

#### API-XDQCS-078 — Exporting a report without saying what to export is refused
- **Why it matters.** The export endpoint is shared by every report; an empty request must not pick a default item.
- **Setup.** Any buyer.
- **Steps.** `POST /reports/download_report` with body `{}`.
- **Expected.** HTTP 422 code 2 'Insufficient parameters'.
- **Oracle.** 422 + 2.
- **Trace.** P2 · automate · `EDGE-DQCS-078` · `app/controllers/api/reports_controller.rb:105-109`

#### API-XDQCS-079 — Exporting the master QCS with an undecodable event id is refused
- **Why it matters.** `item_uuid` decodes to `item_id`; nil must stop the export before `find`.
- **Setup.** Any buyer.
- **Steps.** `POST /reports/download_report` with body `{"item_type": "event_group", "item_uuid": "WrongUuid1=", "report_category": "master_qcs_report", "lot_no": "", "column_selection": []}`.
- **Expected.** HTTP 422 code 2 'Insufficient parameters'.
- **Oracle.** 422 + 2.
- **Trace.** P2 · automate · `EDGE-DQCS-079` · `app/controllers/api/reports_controller.rb:108-109; app/controllers/concerns/params_auth.rb:70-75`

#### API-XDQCS-080 — Exporting an unsupported item type gets an error, not an empty success
- **Why it matters.** If `item_type` is not in the supported list the action renders nothing; Rails answers 204 No Content and the dashboard shows 'download started' with nothing coming.
- **Setup.** Any buyer; sandbox stage.
- **Steps.** `POST /reports/download_report` with body `{"item_type": "order", "item_uuid": "{{tradeId}}", "report_category": "master_qcs_report"}`.
- **Expected.** 422 code 2/888 (expected). **Today:** 204 with an empty body (defect).
- **Oracle.** Status code and body.
- **Trace.** P2 · automate · `EDGE-DQCS-080` · `app/controllers/api/reports_controller.rb:114-147`

#### API-XDQCS-081 — Exporting the master QCS of an event that does not exist is a 4xx
- **Why it matters.** `find` (not find_by) raises RecordNotFound, which Rails maps to 404 — acceptable, but it must never be a 500.
- **Setup.** Any buyer.
- **Steps.** `POST /reports/download_report` with body `{"item_type": "event_group", "item_uuid": "Z2dnWmdaUWtnZw==", "report_category": "master_qcs_report", "lot_no": "", "column_selection": []}`.
- **Expected.** HTTP 404 (RecordNotFound), no report generated.
- **Oracle.** 404.
- **Trace.** P2 · automate · `EDGE-DQCS-081` · `app/controllers/api/reports_controller.rb:124`

#### API-XDQCS-082 — Report export checks permission before revealing masking state
- **Why it matters.** `vendor_masking_on_report?` (831 'Unlock Bid to Download Report') runs before `validate_request_and_get_company_id` and `authorize`, so a user of another company learns that the event exists and is masked.
- **Setup.** Buyer of another client; PROCOL DEMO event with locked bids. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `POST /reports/download_report` for that event as the outside buyer.
- **Expected.** 101/455 (expected). **Today:** 831.
- **Oracle.** Error code.
- **Trace.** P2 · manual · `app/controllers/api/reports_controller.rb:124-134`

#### API-XDQCS-083 — Master QCS regeneration is refused before the input is even checked
- **Why it matters.** Policy runs first: a client must get 'not authorized' even for an empty list (not 'insufficient parameters', which would tell them the endpoint is usable).
- **Setup.** Run's client buyer (not on the regeneration allow-list).
- **Steps.** `POST /event_groups/regenerate_master_qcs` with body `{"event_group_uuids": []}`.
- **Expected.** HTTP 422 code 455 'You are not authorized to perform this action'.
- **Oracle.** 422 + 455.
- **Trace.** P1 · automate · `EDGE-DQCS-083` · `app/controllers/api/event_groups_controller.rb:1039-1045; app/policies/event_group_policy.rb:92-97`

#### API-XDQCS-084 — Master QCS regeneration of more than ten events is refused for clients as 'not authorized'
- **Why it matters.** The 10-event cap (843) must not be the first thing a client sees.
- **Setup.** Run's client buyer.
- **Steps.** `POST /event_groups/regenerate_master_qcs` with body `{"event_group_uuids": [ "{{eventGroupUuid}}" × 11 ]}`.
- **Expected.** HTTP 422 code 455 'You are not authorized to perform this action' (not 843 'Maximum 10 event_group_ids allowed').
- **Oracle.** 422 + 455.
- **Trace.** P2 · automate · `EDGE-DQCS-084` · `app/controllers/api/event_groups_controller.rb:1041-1049`

#### API-XDQCS-085 — For allow-listed Procol staff: the 10-event cap and the comma-string form
- **Why it matters.** `event_group_uuids` is decoded by ParamsAuth — a comma-separated STRING is split into an array before the `is_a?(Array)` check, so the type check never refuses strings.
- **Setup.** Procol employee whose id is in `ALLOWED_USER_IDS_TO_REGENERATE_MASTER_QCS`. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** 1. 11 uuids → expect 843 'Maximum 10 event_group_ids allowed'. 2. `"event_group_uuids": "<uuid1>,<uuid2>"` (string). 3. Empty list → 2.
- **Expected.** 1: 843. 2: accepted and processed as two events (document). 3: 2 'Insufficient parameters'.
- **Oracle.** Codes; report_url and total_processed for 2.
- **Trace.** P2 · manual · `app/controllers/api/event_groups_controller.rb:1043-1061; app/controllers/concerns/params_auth.rb:70-73`


## 9. Master QCS sheets and MQCS report templates

The Master QCS tab reads `GET /sheets/schema?view_type=&event_group_uuid=&proposal_uuid=&lot_no=` and `GET /sheets/details?view_type=&layer_uuid=&event_group_uuid=&proposal_uuid=&show_selected_products=&lot_no=&tab=&page=`. Valid view types: summary_view, awarding_view, proposal_view, plus po and contract (proposal based). Before actions: `view_type` must be present (code 2) and planner-gated users get 455. Two quirks: `render json: {} && return if masked` returns **before** rendering (Ruby precedence) so a masked/unknown-lot request answers 204 No Content; and an unknown view_type matches no branch, so `schema` answers 200 with only page_size and `details` answers 204 — the 888 'Invalid Parameters' branch is unreachable.

#### API-XDQCS-086 — Master QCS without a view type is refused
- **Why it matters.** The view type decides which comparison is built; no default.
- **Setup.** Any buyer.
- **Steps.** `GET /sheets/schema?event_group_uuid={{eventGroupUuid}}`.
- **Expected.** HTTP 422 code 2 'Insufficient parameters'.
- **Oracle.** 422 + 2.
- **Trace.** P2 · automate · `EDGE-DQCS-086` · `app/controllers/api/sheets_controller.rb:7,188-190`

#### API-XDQCS-087 — Master QCS of an event that does not exist is 'not found'
- **Why it matters.** Only active/withdrawn events have a Master QCS.
- **Setup.** Any buyer.
- **Steps.** `GET /sheets/schema?view_type=summary_view&event_group_uuid=Z2dnWmdaUWtnZw==`.
- **Expected.** HTTP 422 code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EDGE-DQCS-087` · `app/controllers/api/sheets_controller.rb:12-14,173-175`

#### API-XDQCS-088 — Master QCS summary of a live event with no bids loads
- **Why it matters.** The project's Master QCS tab is visible from publish; with no bids it must render an empty grid.
- **Setup.** `{{eventGroupUuid}}` = sandbox event (active, RFQ live, no bids).
- **Steps.** `GET /sheets/schema?view_type=summary_view&event_group_uuid={{eventGroupUuid}}`.
- **Expected.** HTTP 200 with sheets/layers/tabs/page_size (layers empty), or 204 empty when the caller is masked (see quirk). Never 5xx.
- **Oracle.** 200 + page_size present, or 204.
- **Trace.** P2 · automate · `EDGE-DQCS-088` · `app/controllers/api/sheets_controller.rb:10-71`

#### API-XDQCS-089 — Master QCS with an unknown view type is refused
- **Why it matters.** An unknown view type matches no branch; the action renders `{page_size: N}` with HTTP 200 — callers cannot tell a typo from an empty comparison. The intended 888 branch is unreachable.
- **Setup.** Any buyer; sandbox event group.
- **Steps.** `GET /sheets/schema?view_type=qa_bogus_view&event_group_uuid={{eventGroupUuid}}`.
- **Expected.** 422 code 888 'Invalid Parameters' (expected). **Today:** 200 with only page_size.
- **Oracle.** Status code; body keys.
- **Trace.** P2 · automate · `EDGE-DQCS-089` · `app/controllers/api/sheets_controller.rb:12-71,180-181`

#### API-XDQCS-090 — Master QCS details with an unknown view type is refused, not an empty 204
- **Why it matters.** `details` has no else branch and no render; Rails answers 204 No Content.
- **Setup.** Any buyer; sandbox event group.
- **Steps.** `GET /sheets/details?view_type=qa_bogus_view&event_group_uuid={{eventGroupUuid}}&layer_uuid=Z2dnWmdaUWtnZw==`.
- **Expected.** 422 (expected). **Today:** 204 empty.
- **Oracle.** Status code.
- **Trace.** P2 · automate · `EDGE-DQCS-090` · `app/controllers/api/sheets_controller.rb:76-160`

#### API-XDQCS-091 — Master QCS for a lot that does not exist does not crash
- **Why it matters.** An unknown lot has no commercial stage; `is_event_masking_enabled?` returns true when the stage is blank and the `render json: {} && return` precedence bug returns before rendering (204).
- **Setup.** Sandbox event (no lots).
- **Steps.** `GET /sheets/schema?view_type=summary_view&event_group_uuid={{eventGroupUuid}}&lot_no=999`.
- **Expected.** No 5xx. Expected 4xx 'lot not found'; today 204 empty. Record the status.
- **Oracle.** Status code.
- **Trace.** P2 · automate · `EDGE-DQCS-091` · `app/controllers/api/sheets_controller.rb:15-16; app/controllers/concerns/event_group_controller_helper.rb:650-653; app/models/event_group.rb:619-621,782-785`

#### API-XDQCS-092 — PO-view Master QCS without a real proposal is refused
- **Why it matters.** The PO view is proposal based; an unknown proposal must stop the read.
- **Setup.** Any buyer.
- **Steps.** `GET /sheets/schema?view_type=po&proposal_uuid=Z2dnWmdaUWtnZw==`.
- **Expected.** HTTP 422 code 2 'Insufficient parameters'.
- **Oracle.** 422 + 2.
- **Trace.** P2 · automate · `EDGE-DQCS-092` · `app/controllers/api/sheets_controller.rb:31-32,176-178`

#### API-XDQCS-093 — Paging the Master QCS of a non-BOQ event is ignored safely
- **Why it matters.** The event-group paging helper returns early when there are no tabs — the contrast case for API-XDQCS-044.
- **Setup.** Sandbox event (non-BOQ).
- **Steps.** `GET /sheets/details?view_type=summary_view&event_group_uuid={{eventGroupUuid}}&layer_uuid=Z2dnWmdaUWtnZw==&tab=0&page=1`.
- **Expected.** HTTP 200 (inline_data/global_data keyed by the layer, tabs_summary null) or 204 if masked. Never 5xx.
- **Oracle.** Status code.
- **Trace.** P2 · automate · `EDGE-DQCS-093` · `app/controllers/concerns/event_group_controller_helper.rb:204-209`

#### API-XDQCS-094 — Master QCS ignores a proposal that belongs to another event
- **Why it matters.** `proposal_uuid` is looked up by company only, not by event; a proposal from event X must not drive the awarded quantities shown on event Y.
- **Setup.** `{{proposalUuid}}` = the journey event's proposal; `{{eventGroupUuid}}` = the sandbox event (different).
- **Steps.** `GET /sheets/schema?view_type=awarding_view&event_group_uuid={{eventGroupUuid}}&proposal_uuid={{proposalUuid}}`.
- **Expected.** No 5xx. Expected: the foreign proposal is ignored or refused. Record whether awarded-quantity widgets show the journey's allocation on the sandbox grid (suspected mix-up).
- **Oracle.** Status; awarded widgets on the sandbox layers.
- **Trace.** P1 · automate · `EDGE-DQCS-094` · `app/controllers/api/sheets_controller.rb:17-19`

#### API-XDQCS-095 — Planner-gated users cannot open the Master QCS
- **Why it matters.** `verify_planner` blocks users in a gated planning team from the whole sheets controller.
- **Setup.** A user who is part of the gated planning team. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `GET /sheets/schema?view_type=summary_view&event_group_uuid={{eventGroupUuid}}`.
- **Expected.** HTTP 422 code 455.
- **Oracle.** 422 + 455.
- **Trace.** P2 · manual · `app/controllers/api/sheets_controller.rb:192-194`

#### API-XDQCS-096 — An MQCS report template that does not exist is refused
- **Why it matters.** Template lookups are scoped to the caller's company and the MQCS type.
- **Setup.** Any buyer.
- **Steps.** `GET /mqcs_report_templates/Z2dnWmdaUWtnZw==`.
- **Expected.** HTTP 422 code 2 (set_template answers 'Insufficient parameters' for a missing template).
- **Oracle.** 422 + 2.
- **Trace.** P2 · automate · `EDGE-DQCS-096` · `app/controllers/api/report_templates_controller.rb:70-76; config/routes.rb:176-179`

#### API-XDQCS-097 — MQCS template availability answers for the caller's company
- **Why it matters.** The Master QCS download decides which layout to use from this check.
- **Setup.** Any buyer.
- **Steps.** `GET /mqcs_report_templates/check_availability`.
- **Expected.** HTTP 200 `{template_available, template_id, template_name}`. Note: template_id is the raw integer id (not a uuid) — flag for consistency.
- **Oracle.** 200; template_available boolean.
- **Trace.** P2 · automate · `EDGE-DQCS-097` · `app/controllers/api/report_templates_controller.rb:53-64`


## 10. Currency in comparisons

Multi-currency stages carry `misc.currency_configuration` (base currency + allowed currencies with `rate_in_base`). `PATCH /v1/trade/:id/currency_exchange_rates` updates the rates — only before any bid (877) and only on multi-currency stages (879); rates must be positive (878) and may not include the base currency or unknown codes (2). Comparisons convert to base for the client's team and show original currency to others.

#### API-XDQCS-098 — Exchange rates cannot be set on a single-currency stage
- **Why it matters.** Rates on a stage without multi-currency would silently change nothing — or worse, create a half configuration.
- **Setup.** Sandbox RFQ created without a currency configuration (single currency, like the journey).
- **Steps.** `PATCH /v1/trade/{{tradeId}}/currency_exchange_rates` with body `{"currency_rates": [{"USD": "-5"}]}`.
- **Expected.** HTTP 422 code 879 'Multi-currency is not configured for this trade request.' Nothing saved.
- **Oracle.** 422 + 879; GET schema still shows currency_configuration null.
- **Trace.** P1 · automate · `EDGE-DQCS-098` · `app/controllers/api/v1/trade_controller.rb:1466-1472; app/policies/trade_request_policy.rb:212-214`

#### API-XDQCS-099 — Exchange rates cannot change after a bid is in
- **Why it matters.** Changing the rate after bids would reorder the comparison and move the L1 after the fact.
- **Setup.** `{{pricingTradeUuid}}` closed with one bid.
- **Steps.** `PATCH /v1/trade/{{pricingTradeUuid}}/currency_exchange_rates` with body `{"currency_rates": [{"USD": "-5"}]}`.
- **Expected.** HTTP 422: code 879 if the stage is single-currency, otherwise 877 'Exchange rates cannot be updated after bids have been placed.' Nothing saved.
- **Oracle.** 422 + 879 or 877.
- **Trace.** P1 · automate · `EDGE-DQCS-099` · `app/controllers/api/v1/trade_controller.rb:1472-1473`

#### API-XDQCS-100 — Exchange-rate payload validation on a multi-currency stage
- **Why it matters.** Each rule protects the comparison: rates must be a list, positive, for allowed currencies, never for the base currency.
- **Setup.** Multi-currency RFQ (base INR, allowed USD/EUR), no bids. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** PATCH with: (a) `currency_rates` as an object, (b) `[{"INR": "1"}]`, (c) `[{"GBP": "100"}]`, (d) `[{"USD": "0"}]`, (e) `[{"USD": "83.25"}]`.
- **Expected.** (a)(b)(c) 422 code 2; (d) 422 code 878 'Invalid exchange rate: rate_in_base must be a positive number.'; (e) success and the schema shows rate_in_base 83.25.
- **Oracle.** Codes; schema currency_configuration after (e).
- **Trace.** P2 · manual · `app/controllers/api/v1/trade_controller.rb:1476-1494`

#### API-XDQCS-101 — Comparisons are in base currency for the team and in bid currency for others
- **Why it matters.** `convert_to_original_currency` flips for non-team viewers in quote details and rejected bids; totals and L1 must be computed on base-converted values.
- **Setup.** Multi-currency RFQ (base INR); vendor A bids in USD 1.00 (rate 83), vendor B in INR 80. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** Buyer: indicators + quote details; vendor A: own quote details.
- **Expected.** Buyer sees A = ₹83 and B = ₹80, B is L1. Vendor A sees its own quote in USD.
- **Oracle.** best_bidder and displayed amounts.
- **Trace.** P1 · manual · `app/controllers/api/v1/trade_controller.rb:758-759; app/controllers/api/v1/trade_controller.rb:603`


## 11. Legacy comparison reads — stage show, auction report, event summary

`GET /trade/:id` (legacy stage read used for bid history: `last_valid_bid_for_bid_id`, `layer_ids`, `alternative_id`, `additional_request_bid_required`), `GET /trade/:id/auction_report` (price graph) and `GET /trade/:id/event_summary?rank_limit=` (bidding summary).

#### API-XDQCS-102 — Bid history for a bid that does not exist does not crash the stage read
- **Why it matters.** `last_valid_bid_for_bid_uuid` is decoded and looked up on the stage; the result is used as `bid.status` with no nil check ⇒ NoMethodError ⇒ 500.
- **Setup.** Sandbox RFQ live.
- **Steps.** `GET /trade/{{tradeId}}?last_valid_bid_for_bid_uuid=Z2dnWmdaUWtnZw==`.
- **Expected.** 422 code 32 'Bid not found' (expected). **Suspected defect:** 500 at trade_controller.rb:1113.
- **Oracle.** Status code.
- **Trace.** P1 · automate · `EDGE-DQCS-102` · `app/controllers/api/trade_controller.rb:1056,1111-1114`

#### API-XDQCS-103 — Bid history with a non-numeric raw bid id does not crash
- **Why it matters.** The raw (non-uuid) form of the same parameter casts 'abc' to nil and hits the same nil dereference.
- **Setup.** Sandbox RFQ live.
- **Steps.** `GET /trade/{{tradeId}}?last_valid_bid_for_bid_id=abc`.
- **Expected.** A clean 4xx. **Suspected defect:** 500.
- **Oracle.** Status code.
- **Trace.** P2 · automate · `EDGE-DQCS-103` · `app/controllers/api/trade_controller.rb:1111-1113`

#### API-XDQCS-104 — Bid history for the vendor's real bid loads
- **Why it matters.** The happy path of the parameter: all bids of that vendor/user are included in the layer.
- **Setup.** `{{pricingTradeUuid}}` closed with `{{bidUuid}}`.
- **Steps.** `GET /trade/{{pricingTradeUuid}}?last_valid_bid_for_bid_uuid={{bidUuid}}`.
- **Expected.** HTTP 200 with the stage and the vendor's layer. Never 5xx.
- **Oracle.** 200.
- **Trace.** P2 · automate · `EDGE-DQCS-104` · `app/controllers/api/trade_controller.rb:1111-1115`

#### API-XDQCS-105 — Auction report for a stage that does not exist does not crash
- **Why it matters.** `auction_report_data` does `T.must(trade)` on a find_by result — a Sorbet runtime TypeError (500) for unknown ids.
- **Setup.** Any buyer.
- **Steps.** `GET /trade/Z2dnWmdaUWtnZw==/auction_report`.
- **Expected.** 422 code 4 (expected). **Suspected defect:** 500.
- **Oracle.** Status code.
- **Trace.** P2 · automate · `EDGE-DQCS-105` · `app/controllers/api/trade_controller.rb:1625-1629`

#### API-XDQCS-106 — Bidding summary with a zero rank limit is refused
- **Why it matters.** rank_limit selects the top-N vendors; 0 (or text, which becomes 0) is meaningless.
- **Setup.** Sandbox RFQ.
- **Steps.** `GET /trade/{{tradeId}}/event_summary?rank_limit=0`.
- **Expected.** HTTP 422 code 2 'Insufficient parameters'.
- **Oracle.** 422 + 2.
- **Trace.** P2 · automate · `EDGE-DQCS-106` · `app/controllers/api/trade_controller.rb:1713-1716`

#### API-XDQCS-107 — A user who cannot view the event gets an error from the bidding summary, not an empty success
- **Why it matters.** When the user may not view the stage the action does `return 510, 422` without rendering, so Rails answers 204 — the guard is silently swallowed (and the policy check after it never runs).
- **Setup.** A user of the same client who is not in the event's team/audience. No runnable twin: needs a second user or a company setting the run cannot switch.
- **Steps.** `GET /trade/{{tradeId}}/event_summary` as that user.
- **Expected.** 422 code 536/510 (expected). **Today:** 204 empty.
- **Oracle.** Status code.
- **Trace.** P2 · manual · `app/controllers/api/trade_controller.rb:1717-1720`


## 12. Screens — comparison, savings, sealed bids, Master QCS

Grounded in procol-client-dashboard (paths relative to `src/`). Each case says what the screen must show or hide and which API answer drives it.

#### UI-XDQCS-001 — The savings card appears only when the stage has savings and bids are not masked
- **Why it matters.** The comparison asks for aggregate savings only when `savings_configuration` is an object and `trade_config.show_bidding_stats` is false — a stage relying only on custom savings never shows its savings.
- **Setup.** Three stages: (a) lot-based savings with a Budget reference; (b) no savings configuration but company custom savings on; (c) as (a) while masked for the viewer.
- **Steps.** Open each stage's comparison as the buyer; watch the network tab for `/aggregate_savings`.
- **Expected.** (a) Savings card with Budget amount and %. (b) No call, no card (gap vs API-XDQCS-014). (c) No call, no card until bid end.
- **Oracle.** Presence of the request and of the card.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/orderDetails/orderDetails.jsx:1060-1064; procol-client-dashboard/src/views/orderDetails/eventDetails.jsx:508-515`

#### UI-XDQCS-002 — Lot savings show one row per savings basis, with a sane percentage
- **Why it matters.** Each strategy (Budget, Historical, Existing Proposal, Last Purchase Price, Default) is rendered from savings_amount / savings_percent; a 0 reference produces 'Infinity%' text today.
- **Setup.** Lot-based savings with Budget = 1,00,000 and Last Purchase Price left at 0; one bid of 90,000.
- **Steps.** Open the stage; hover the savings card.
- **Expected.** Budget: ₹10,000 (10%). Last Purchase Price: blank or 0% — never 'Infinity%' / 'NaN%'.
- **Oracle.** Rendered strings in the savings card.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/orderDetails/savingsInfo.jsx:150-165; procol-client-dashboard/src/views/orderDetails/eventDetails.jsx:2266-2283`

#### UI-XDQCS-003 — Line-wise savings table appears only for line-item savings
- **Why it matters.** The LineItemSavings table renders only when `savingsComparisonOn` is line-item; lot savings must not also produce a per-line table.
- **Setup.** Two stages: line-item savings and lot savings, both with bids.
- **Steps.** Open each stage's details panel.
- **Expected.** Line-item stage: a table with one row per line and the best vendor's saving. Lot stage: no table.
- **Oracle.** Table presence and rows.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orderDetails/eventDetails.jsx:2285-2289; procol-client-dashboard/src/views/orderDetails/lineItemSavings/lineItemSavings.jsx:1-30`

#### UI-XDQCS-004 — The L1 vendor is highlighted per line in the comparison, including ties
- **Why it matters.** The green L1 highlight comes from `event_indicators` best_bidder per line. On a tie both vendors are highlighted, and the rank shown is 2 for both (rank shift).
- **Setup.** RFQ with three vendors; vendors A and B tie at the lowest price on line 1; C cheapest on line 2.
- **Steps.** Open the comparison as the buyer.
- **Expected.** Line 1: A and B highlighted as best bidder, rank label 2 for both; line 2: C highlighted. Confirm the tie is explained (tooltip/badge).
- **Oracle.** Highlight per cell vs API-XDQCS-032.
- **Trace.** P1 · manual · `procol-client-dashboard/src/redux/orders/selectors.js:2458-2483,5920-5943`

#### UI-XDQCS-005 — A technical (RFP) stage tab does not show price ranks
- **Why it matters.** The screen calls event_indicators for every stage whose rfx_mode is not 'rfi', which includes RFP stages.
- **Setup.** RFP+RFQ event with responses on the RFP stage.
- **Steps.** Open the RFP stage tab; watch for `/event_indicators`.
- **Expected.** No rank/best-price badges on technical responses; no error toast.
- **Oracle.** Badges and toasts on the RFP tab.
- **Trace.** P2 · manual · `procol-client-dashboard/src/redux/orders/helpers.js:1412`

#### UI-XDQCS-006 — Rejected bids modal: empty state and currency
- **Why it matters.** The modal shows each rejected bid with its total; in multi-currency stages the toggle 'Show in native currency' switches currency and precision.
- **Setup.** (a) Stage with no rejected bids. (b) Multi-currency stage where a USD bid was rejected.
- **Steps.** Open 'Rejected bids' from the comparison.
- **Expected.** (a) Empty illustration with the 'no rejected bids' text. (b) INR amount by default; USD with USD precision when native currency is on.
- **Oracle.** Modal content.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orderDetails/rejectedBidsModal.jsx:84-85,142-144,305`

#### UI-XDQCS-007 — 'Unlock bids' is offered only for locked RFQs after bid end
- **Why it matters.** The settings menu shows 'Unlock bids' only when `lock_bid_by_default` is on, the stage is a trade stage, and status is buffer; it is disabled in view-only dashboards, old versions and on-hold projects.
- **Setup.** Client `lock_bid_by_default` ON; RFQ live, then past bid end.
- **Steps.** Open the stage settings menu during live and after bid end; repeat in a view-only dashboard.
- **Expected.** Live: no menu item. Buffer: item present. View-only/old version/on hold: present but disabled.
- **Oracle.** Menu item visibility/disabled state.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/orderDetails/eventHeader/eventHeader.jsx:400-403,784-794`

#### UI-XDQCS-008 — Unlock bids modal guides the finance-user OTP flow
- **Why it matters.** Send OTP stays disabled until a finance user is chosen; Verify needs a 6-digit OTP; the visibility choice (Everyone / Only me) comes from `unlock_bids_restriction_options`.
- **Setup.** Client `lock_bid_by_default` ON; RFQ in buffer; (a) company with finance users, (b) without.
- **Steps.** Open Unlock bids; choose user; send OTP; type 5 digits then 6.
- **Expected.** (a) Users listed with name and email; Verify enabled only at 6 digits; success unlocks the grid. (b) 'No finance users found', Send disabled.
- **Oracle.** Button states; grid visible after success.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/orderDetails/unlockBids/unlockBidsModal.jsx:30-66,82-89,101-124`

#### UI-XDQCS-009 — 'Download logs' is visible only to Procol staff and never on RFP stages
- **Why it matters.** `trade_config.can_download_logs` = Procol employee and not RFP; client buyers must never see it (the API refuses them — API-XDQCS-076).
- **Setup.** Same RFQ viewed by a client buyer and by a Procol support user; also an RFP stage.
- **Steps.** Open the settings menu.
- **Expected.** Client buyer: no 'Download logs'. Procol user on RFQ: present, opens the logs modal and a file. RFP stage: absent for everyone.
- **Oracle.** Menu item presence; modal opens fileUrl.
- **Trace.** P1 · manual · `procol-client-dashboard/src/redux/orders/selectors.js:4489; procol-client-dashboard/src/views/orderDetails/eventHeader/eventHeader.jsx:778-781; procol-client-dashboard/src/views/orderDetails/DownloadLogsModal.jsx:16-17`

#### UI-XDQCS-010 — 'Download bid template' appears only when the client enables it and never on RFP/RFI
- **Why it matters.** Gate: `show_bid_template_download_button_on_client_side` AND not RFP/RFI (PROCOL DEMO: OFF).
- **Setup.** Client with the setting ON and OFF; an RFQ and an RFP stage.
- **Steps.** Open the stage header.
- **Expected.** ON + RFQ: button present, downloads an Excel. OFF or RFP/RFI: no button.
- **Oracle.** Button presence; downloaded file.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orderDetails/eventHeader/eventHeader.jsx:338-339; procol-client-dashboard/src/redux/orders/selectors.js:4516-4517`

#### UI-XDQCS-011 — The Leaderboard tab exists only for alternate-bidding stages and refreshes itself
- **Why it matters.** The tab is filtered out unless `isAlternateBiddingAllowed`; when shown it polls the leader board.
- **Setup.** Two RFQs: alternate bidding ON and OFF.
- **Steps.** Open both stages; on the ON stage leave the Leaderboard tab open and add a bid from another session.
- **Expected.** OFF: no tab. ON: tab lists ranked alternatives and updates without reload.
- **Oracle.** Tab presence; row update.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orderDetails/eventHeader/eventHeader.jsx:454-458; procol-client-dashboard/src/views/orderDetails/LeaderBoard.jsx:51-64`

#### UI-XDQCS-012 — Counter-offer drawer marks the L1 line and loads L1 data for bulk percent offers
- **Why it matters.** The legend 'L1 bid on a line item' explains the highlight; for bulk counter offers in percent the drawer loads `l1_data_for_event` to compute targets.
- **Setup.** Live RFQ with two vendors; bulk counter offer with percentage allowed.
- **Steps.** Open the counter-offer drawer for one vendor, then the bulk counter-offer drawer.
- **Expected.** Single: L1 cells highlighted with the legend. Bulk %: values computed from the L1 vendor's line values; no error toast when no bids yet.
- **Oracle.** Highlighted cells; network call to `/l1_data_for_event`.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orderDetails/counterOfferDrawer.jsx:741-749,830-836`

#### UI-XDQCS-013 — Master QCS 'Start awarding' is disabled with the right reason
- **Why it matters.** Awarding is blocked while any stage (of the lot) is draft, when this is not the latest version, when the project is on hold, or when the lot is not awardable; the tooltip must say which.
- **Setup.** Event with (a) a draft stage, (b) an older version open, (c) lot not yet closed, (d) everything closed.
- **Steps.** Open the Master QCS tab and hover 'Start awarding'.
- **Expected.** (a) disabled — 'event not yet published' text; (b) 'Awarding is only allowed for the latest version'; (c) live-events text; (d) enabled.
- **Oracle.** Button state + tooltip text.
- **Trace.** P1 · manual · `procol-client-dashboard/src/components/masterQcs/masterQcs.jsx:322-339,405-418`

#### UI-XDQCS-014 — Master QCS 'Download Report' exports the master QCS of the current lot
- **Why it matters.** From the project's Master QCS tab the button posts `/reports/download_report` with item_type event_group, report_category master_qcs_report and the lot; with locked bids the API answers 831.
- **Setup.** Event with two lots and bids; then the same with bids locked.
- **Steps.** Open Master QCS for lot 2; click Download Report.
- **Expected.** A file for lot 2 only. Locked bids: an error toast 'Unlock Bid to Download Report', no file.
- **Oracle.** Request body (lot_no 2); downloaded content; toast text.
- **Trace.** P1 · manual · `procol-client-dashboard/src/components/masterQcs/masterQcs.jsx:743-757,938-946; procol-client-dashboard/src/services/api.js:118-119`

#### UI-XDQCS-015 — Each lot has its own Master QCS showing only that lot's stages and proposal
- **Why it matters.** Per-lot tabs filter stages and proposals by lot_no; a proposal of lot 1 must never appear in lot 2's QCS.
- **Setup.** Event split into 2 lots; lot 1 awarded.
- **Steps.** Open Master QCS for lot 1 and lot 2.
- **Expected.** Lot 1 shows its proposal status tag; lot 2 shows no proposal and its own vendors/lines only.
- **Oracle.** Proposal tag and lines per tab.
- **Trace.** P1 · manual · `procol-client-dashboard/src/components/masterQcs/masterQcs.jsx:266-275,322-324; procol-client-dashboard/src/views/projectDetails/projectTabs.jsx:35`

#### UI-XDQCS-016 — Paged BOQ quote opened from a proposal keeps the proposal snapshot
- **Why it matters.** `getBidForVendor` appends `?proposal_uuid=` with a second '?' when paging filters are present, so the backend never sees proposal_uuid and the paged quote shows live data instead of the proposal snapshot.
- **Setup.** BOQ RFP with tabs, an approved proposal, and a later re-evaluation.
- **Steps.** From the proposal, open a vendor's quote and switch to page 2 of a tab.
- **Expected.** Page 2 still shows the proposal snapshot. **Suspected defect:** URL like `?tab=0&page=2?proposal_uuid=…`.
- **Oracle.** Request URL in the network tab; values vs snapshot.
- **Trace.** P2 · manual · `procol-client-dashboard/src/models/orders/ordersService.js:85-98; procol-client-dashboard/src/redux/orders/api.js:78-87`

#### UI-XDQCS-017 — A masked buyer sees no savings and no unread-chat count during live bidding
- **Why it matters.** `show_bidding_stats` hides savings and the unresolved-chat badge for masked buyers; both return after bid end.
- **Setup.** Client `event_masking_on_rfqs` ON; non-owner, non-super-admin buyer; live RFQ with bids.
- **Steps.** Open the stage as that buyer; then after bid end.
- **Expected.** Live: no savings card, no chat count, bids masked. After end: both visible.
- **Oracle.** Card/badge presence.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/orderDetails/orderDetails.jsx:1050-1064`

#### UI-XDQCS-018 — Vendor names are masked in the comparison while vendor masking is on
- **Why it matters.** With `is_vendor_masking_enabled` the comparison, rejected bids and remarks show generic vendor labels during the event for non-super-admins.
- **Setup.** Stage with vendor masking ON; live; non-super-admin buyer.
- **Steps.** Open comparison, rejected bids modal and remarks.
- **Expected.** Generic labels everywhere during live; real names after close (or for super admin when 'everyone except super admin').
- **Oracle.** Displayed names.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orderDetails/orderDetails.jsx:345; procol-client-dashboard/src/views/orderDetails/auctionIndicators.jsx:37,64`
