# Bid, bid line, bids group and proposal models — money, rank, status callbacks — backend digest (procol-backend origin/main ae36e86894)

## Overview
The model layer behind the bid and award APIs: how a quote's money is computed and stored (price_breakup_json on the
bid and on every bid line), how the rank score is built and turned into L1/L2..., which statuses count, what happens on
each status change (save callbacks, notifications, PO creation, approvals) and what the award proposal model does.
Files: app/models/bid.rb, app/models/bid_trade_product.rb (bid line = "BTP"), app/models/bid_trade.rb,
app/models/bids_group.rb (read model for bid lists), app/models/proposal.rb, app/models/concerns/bid_rank_helper.rb,
app/models/concerns/bid_trade_product_rank_helper.rb, app/models/concerns/bid_concern.rb, app/models/auction_analytic.rb,
plus the helpers they call (bid_multiple_po_helper.rb, event_indicators/lot_based.rb, trade_request_model_helper.rb).
Controller-level rules are in bids.md, evaluation-award.md and trade-live-v1.md; this file does not repeat
"Bid model — statuses, validation and save callbacks", "Bid ranks — dense rank..." or "Bid ranks — what score is ranked".

## Money on the bid (price_breakup_json)

### Bid#update_bid_price_breakup_v2 — when the bid's money is recomputed and which inputs it reads
before_save on every Bid save rebuilds price_breakup_json from the lines; PO creation also calls it with skip_update: true.
Rules:
1. [state] A bid in status `draft` is never priced: the callback returns at once, so a draft keeps whatever price_breakup_json it had — app/models/bid.rb:130, 948
2. [calculation] Cash discount comes from the bid's `trade_credit_discount` JSON: `discount` → `.to_f`, `number_of_days` → `.to_i`, each only when present — app/models/bid.rb:954-957
3. [calculation] other_details `freight_charges`/`bulk_price` → `.to_f` (0.0 without other_details); `destination_charges`/`ex_works_charges` read raw — app/models/bid.rb:985-999
4. [calculation] Lines in `in_active`/`negotiated` are not priced; `po_btp_ids` narrows to those lines (multiple-PO award) — app/models/bid.rb:688-690, 912
5. [calculation] Line quantity used = `quantity_overrides[btp.id]` if given, else BidTradeProduct#effective_quantity — app/models/bid.rb:915
Gaps: non-draft bid with nil `other_details` → NoMethodError (untyped 500) at `merge!`/`has_key?`/`except` — app/models/bid.rb:1039, 1056, 1107. Non-draft bid saved before its BidTrade mapping → nil trade_request crash (unverified any caller does) — app/models/bid.rb:953, 833-835
Cites: app/models/bid.rb:943-1043

### Bid price breakup — price, amount and the knockout/dutch total-amount case
What `price` and `amount` on the bid row and in price_breakup_json mean.
Rules:
1. [calculation] `price_breakup_json.price` = the FIRST bid line's price (not a total); `amount` = Σ over lines of `btp.price.to_f × effective quantity` — app/models/bid.rb:1010, 921
2. [calculation] Knockout or dutch auction run on total amount → `amount` is replaced by `bulk_price` from other_details — app/models/bid.rb:1011
3. [side-effect] Unless skip_update, the bid columns `price` and `amount` are overwritten with these two values on every save — app/models/bid.rb:1012, 1050-1053
4. [calculation] Bid#price getter: single-product stage → stored `price` column if present else first line price; multi-product → always the first line price (nil when there are no lines) — app/models/bid.rb:1326-1333
Cites: app/models/bid.rb:1001-1012, 1326-1333

### Bid price breakup — GST at bid level vs line level (gst_tax_amount, gst_tax_order_total, lot_gst)
Two separate GST figures are stored.
Rules:
1. [calculation] `gst_tax_amount` = (Σ line total landed amounts × bid column `gst`) / 100 when the bid's own `gst` column is present, else 0.0 — app/models/bid.rb:1014
2. [calculation] `gst_tax_order_total` = Σ of each line's `gst_tax_amount(quantity)` = Σ (line price × line gst% / 100 × qty); a line gst of 0 or less contributes 0 — app/models/bid.rb:1016, app/models/bid_trade_product.rb:134-143
3. [calculation] `lot_gst` = gst_tax_amount + gst_tax_order_total — app/models/bid.rb:1017
4. [side-effect] If `other_details` has a `tax_credit` key (DCM template) and gst_tax_amount ≠ 0.0, `tax_credit` is overwritten with gst_tax_amount as a string — app/models/bid.rb:1055-1058
5. [calculation] Bid#is_gst_exclusive? is true when the stage gst action type is `required` or `exclusive`, or `optional` with the bid's (first line) gst > 0 — app/models/bid.rb:1443-1452
Gaps: Bid#gst (the getter) returns the FIRST LINE's gst, while gst_tax_amount reads the raw bid column `self[:gst]` — two different numbers named gst — app/models/bid.rb:845-847, 1014
Cites: app/models/bid.rb:1014-1017, 1055-1058

### Bid price breakup — cash discount (discount_price, discount_amount) and no upper bound
How the bid-level cash discount reduces the total.
Rules:
1. [calculation] `discount_price` = (bid discount % × Σ line total landed amounts) / 100 — this is an AMOUNT despite the name — app/models/bid.rb:1018
2. [calculation] `discount_amount` = Σ line `discount_amount(qty)` + discount_price, where line discount_amount = price × line `trade_credit_discount` % / 100 × qty — app/models/bid.rb:1019, app/models/bid_trade_product.rb:165-175
3. [calculation] `total_effective_landed_amount` = (total_effective_amount + total_global_freight_charges) − discount_price — app/models/bid.rb:969-970
4. [validation] The model never bounds the discount: no check for < 0 or > 100 % on bid or line (a >100 % discount makes landed cost negative) — app/models/bid.rb:954-957, app/models/bid_trade_product.rb:165-171
5. [calculation] Bid#display_cash_discount → "<discount>% for <number_of_days> days." only when both present — app/models/bid.rb:1371-1375
Cites: app/models/bid.rb:1018-1019, 969-970

### Bid price breakup — freight: per-unit vs lump sum ("< 20" rule)
How bid-level freight is turned into an amount.
Rules:
1. [calculation] `freight_price_amount` = Σ line `total_freight_amount(qty)` = Σ line `other_details.freight_charges` × qty — app/models/bid.rb:1020, app/models/bid_trade_product.rb:145-155
2. [calculation] `total_global_freight_charges` = bid `other_details.freight_charges` as entered (lump sum) — app/models/bid.rb:1021
3. [calculation] EXCEPT single-product stages where bid freight_charges < 20.0: it is treated as per-unit and multiplied by quantity (bid.quantity = first line qty, or Σ overridden quantities) — app/models/bid.rb:1026-1029, 1045-1048
4. [calculation] `total_freight_charges` = freight_price_amount + total_global_freight_charges — app/models/bid.rb:1030
Gaps: the 20.0 threshold is a heuristic ("frugal solution"): on a single-product stage freight 19.99 is ×qty but 20 is a lump sum — app/models/bid.rb:1025-1029. Bid#total_freight_amount multiplies freight_price_amount (already ×qty per line) by bid quantity again — app/models/bid.rb:1377-1383
Cites: app/models/bid.rb:1020-1030

### Bid price breakup — total_landed_amount_without_discount
The pre-discount landed total of a bid.
Rules:
1. [calculation] total_landed_amount_without_discount = Σ line total landed amounts + total_global_freight_charges + other_details `p_and_f_value`.to_f + `gst_freight`.to_f + `destination_charges`.to_f + `ex_works_charges`.to_f (+ `bulk_price` when knockout/dutch on total amount) — app/models/bid.rb:1090-1097
2. [calculation] A nil charge counts as 0 (`.to_f`) — app/models/bid.rb:1092-1094
3. [calculation] Single-product legacy keys: `landed_cost_without_discount` = Σ line landed costs + freight_charges; `landed_cost` = that − (discount % × price / 100) + p_and_f_value + gst_freight — app/models/bid.rb:973-977
Cites: app/models/bid.rb:1090-1097, 973-977

### Bid price breakup — server recomputes global formula widgets (gross_total); client values are discarded
Global formula widgets (gross_total, landed_cost_without_tax, ...) are evaluated on the server at every save.
Rules:
1. [calculation] For every `global_price_components` formula widget the value sent by the client in other_details is dropped and recomputed — app/models/bid.rb:1105-1107
2. [calculation] Formula variables: `trade_credit_discount` → its `discount`.to_f; `currency_extra_charges` → Bid#currency_extra_charges; any other missing (nil) non-formula variable → 0 — app/models/bid.rb:1115-1126
3. [calculation] Inline widgets feed global formulas as per-line arrays: dropdown → option `value`.to_f (0 if blank), number/percentage/quantity → line value or 0, inline formula → evaluated per line — app/models/bid.rb:1152-1169, 1173-1184
4. [calculation] `total_landed_amount` := the computed `gross_total`; results are also merged back into the bid's other_details — app/models/bid.rb:1038-1040
5. [state] Fast bid outside cost-breakdown/extra-closing/closed time: the fast-bidding widget is not recomputed and is removed from the result — app/models/bid.rb:1102-1104, 1132-1134
Gaps: a formula that cannot be evaluated is only reported to Sentry, the save continues with the key missing — app/models/bid.rb:1200-1205
Cites: app/models/bid.rb:1099-1207

### Bid rank_price and score stamped on save
What gets written to `rank_price` and `score` at the end of pricing.
Rules:
1. [calculation] rank_price: single-product → price + bid freight_charges; multi-product → price_breakup_json `total_landed_amount` (= gross_total) — app/models/bid.rb:886-892, 1213-1214
2. [calculation] score := get_score_for_rank(trade_request) (the rank score; see bids.md "Bid ranks — what score is ranked") — app/models/bid.rb:1217
3. [calculation] Bid#rank_price getter returns nil for a draft; single-product uses the stored column when present else price + freight — app/models/bid.rb:872-883
4. [calculation] Bid#freight_charges = other_details `freight_charges`.to_f, 0 when absent — app/models/bid.rb:645-650
Gaps: multi-product rank_price getter on a non-draft bid with nil price_breakup_json → NoMethodError (untyped 500) — app/models/bid.rb:881
Cites: app/models/bid.rb:872-892, 1209-1218

### Bid#gross_total — stored value first, multi-currency recompute, rounding
The number shown and ranked as a vendor's total.
Rules:
1. [calculation] If other_details `gross_total` is present it is returned (`.to_f`) and nothing is recomputed — app/models/bid.rb:1231
2. [calculation] Single-currency stage → price_breakup_json `total_landed_amount`.to_f (0.0 if missing) — app/models/bid.rb:1266
3. [calculation] Multi-currency stage, knockout/dutch on total → `bulk_price`, converted to the vendor's currency only when the global store says "convert to original currency" — app/models/bid.rb:1248-1252
4. [calculation] Multi-currency otherwise: total_amount = Σ line total landed amounts (BigDecimal); each variable of the gross_total formula is taken from the bid (percentage widgets = total × value/100; `gst` = bid column; `trade_credit_discount` = discount), converted when needed, then rounded to the currency's adjusted precision (vendor currency when converting, else base currency) — app/models/bid.rb:1234-1264, 1270-1303
Gaps: multi-currency stage with no `gross_total` global widget → `nil['configuration']` NoMethodError (untyped 500) — app/models/bid.rb:1272-1273
Cites: app/models/bid.rb:1230-1303

### Bid money getters used by screens and reports
Small derived values read from price_breakup_json.
Rules:
1. [calculation] effective_price = price + price_breakup_json `freight_price_amount` (0.0 with no breakup); price_inclusive_tax = price + gst_tax_amount — app/models/bid.rb:1351-1361
2. [calculation] get_total_landed_amount: multi-product → `total_landed_amount`; single → amount + freight_price_amount − discount_price — app/models/bid.rb:1397-1403
3. [calculation] get_suggested_base_price = (landed price without CD − bid freight) / (1 + gst/100) — app/models/bid.rb:1488-1491
4. [calculation] currency_extra_charges = 1 when the vendor's preferred currency uses the INTERNATIONAL number system, 0 otherwise, nil for single-currency stages — app/models/bid.rb:1577-1587
5. [calculation] reference_price_for_default_savings = Σ (line price × creator quantity) — app/models/bid.rb:1220-1228
6. [calculation] convert_price_kg_to_qt = (price × 100).round (integer); convert_quantity_kg_to_qt = qty / 100.0 — app/models/bid.rb:702-708
Cites: app/models/bid.rb:1351-1411, 1577-1587

### Bid#weighted_average, acceptance probability and tab totals
Derived numbers with edge cases.
Rules:
1. [calculation] weighted_average = (gross_total / Σ creator quantities converted to display unit).round(widget precision); nil when the bid has no lines — app/models/bid.rb:1589-1598
2. [calculation] get_acceptance_probablity(N) = ceil(exp(((N − rank + 1)/N × 0.92) − 1) × 100); nil when N or rank is missing or N = 0 — app/models/bid.rb:635-643
3. [calculation] tabs_summary: prefix sums of line `other_details.total_amount` in trade-product order; a tab total = prefix[range.last] − prefix[range.first − 1]; sections listed only when `section_no` is one character — app/models/bid.rb:1821-1842
Gaps: Σ creator quantities = 0 → division gives Infinity/NaN and `.round` raises FloatDomainError (untyped 500) — app/models/bid.rb:1596. A section with nil `section_no` crashes (`nil.length`) — app/models/bid.rb:1839
Cites: app/models/bid.rb:635-643, 1589-1598, 1821-1842

## Money on a bid line (BidTradeProduct)

### BidTradeProduct landed cost per unit — price + GST − discount + freight
The per-unit landed cost of one quoted line (also `net_price` and `final_price`).
Rules:
1. [calculation] If other_details `landed_cost_formula` is present, landed cost = that formula evaluated as `net_price` — app/models/bid_trade_product.rb:287-292
2. [calculation] Else landed cost = price + applicable_gst − discount_price + freight_charges, where applicable_gst = price × gst/100 only when gst > 0, discount_price = price × other_details `trade_credit_discount`.to_f /100, freight = other_details `freight_charges`.to_f — app/models/bid_trade_product.rb:293, 134-139, 165-171, 145-151
3. [calculation] landed cost without CD = price + applicable_gst + freight — app/models/bid_trade_product.rb:296-298
4. [calculation] price and gst getters return `.to_f` (nil → 0.0) — app/models/bid_trade_product.rb:408-410, 459-461
5. [side-effect] before_save: `final_price` := landed cost; price_breakup_json is rebuilt when blank or its `price` differs from the column — app/models/bid_trade_product.rb:177-182
Cites: app/models/bid_trade_product.rb:134-182, 287-298

### BidTradeProduct total landed amount and the quantity it uses (awarded vs quoted)
The line total used in bid totals, savings and POs.
Rules:
1. [calculation] Without a `total_landed_amount_formula`: total = quantity × landed cost — app/models/bid_trade_product.rb:319
2. [calculation] With the formula: evaluated as `total_amount` with `participant_quantity` = the quantity used; if the `total_amount` inline widget's input_group is `price`, the result is converted to the display unit — app/models/bid_trade_product.rb:304-318
3. [calculation] effective_quantity = other_details `awarded_quantity` ONLY on a standalone (dummy event group, non-eRFx) stage; eRFx stages keep the quoted quantity here — app/models/bid_trade_product.rb:256-265
4. [calculation] creator_quantity / creator_price = the buyer's trade product quantity / price; participant_quantity = the quoted quantity — app/models/bid_trade_product.rb:240-250
Gaps: an inline formula widget `total_amount` that is missing while `total_landed_amount_formula` is set → `nil.dig` NoMethodError — app/models/bid_trade_product.rb:306, 314
Cites: app/models/bid_trade_product.rb:256-320

### BidTradeProduct formula evaluation — order, missing values, booleans, multi-currency rounding
How inline formula widgets on a line are computed on every line save.
Rules:
1. [calculation] before_save evaluates every inline `formula` widget in ascending `configuration.priority`; earlier results feed later formulas; skipped for `negotiated` lines — app/models/bid_trade_product.rb:184-198
2. [calculation] A variable missing on the line falls back to the buyer's trade product value (creator widget); still missing → 0 — app/models/bid_trade_product.rb:421-430, 323-334
3. [calculation] Dropdown variables use the option `value`, as float only when the widget's `float_value` is truthy — app/models/bid_trade_product.rb:432-442
4. [calculation] Boolean values become 1/0 inside formulas and a true/false result is stored as 1/0 — app/models/bid_trade_product.rb:426-428, 400-404
5. [calculation] Multi-currency lines (meta_data `multi_currency_flow`): price/amount inputs converted to vendor currency when requested; result rounded to the currency's adjusted precision — price precision (per base unit) for price-group widgets, amount precision otherwise — app/models/bid_trade_product.rb:344-380
Cites: app/models/bid_trade_product.rb:184-208, 323-406

### BidTradeProduct auto cash discount (allow_auto_cd) — effective price and the missing-hash crash
Auto-CD normalises line prices with the vendor's discount slab.
Rules:
1. [config] Auto CD is on only for buy stages with trade config `allow_auto_cd` truthy (default false) — app/models/model_helpers/trade_request_model_helper.rb:143-146
2. [calculation] Line effective_price = price − other_details `auto_cd_hash.notional_2`; effective total = effective_price × qty when auto_cd_hash present, else total landed amount — app/models/bid_trade_product.rb:493-502
3. [calculation] With auto CD the line rank score is effective_price and the bid score is `total_effective_price` (single) / `total_effective_landed_amount` (multi) — app/models/concerns/bid_trade_product_rank_helper.rb:145-146, app/models/concerns/bid_rank_helper.rb:108-109, 82-83
Gaps: effective_total_amount calls effective_price BEFORE checking the hash exists, so any line without `auto_cd_hash` on an auto-CD stage crashes (`nil['notional_2']`, untyped 500) on bid save; a vendor with no buyer–seller mapping crashes on `company_mapping.auto_discount` — app/models/bid_trade_product.rb:494, 499-501, app/controllers/concerns/bids_controller_helper.rb:1078-1079
Cites: app/models/bid_trade_product.rb:489-514

### BidTradeProduct save callbacks — score, english-auction prices hash, revision count
Callbacks on every bid line save.
Rules:
1. [side-effect] before_save order: save_formula_values → set_price_breakup → set_score (score := line rank score) — app/models/bid_trade_product.rb:62, 99-104
2. [side-effect] after commit, when the line is `active`, `rejected` or `revoke`: the trade product's meta_data `prices_hash[company_id]` := the line value of the stage's English-auction widget (used for tick size and price cap) — app/models/bid_trade_product.rb:61, 120-132, 1255-1257
3. [side-effect] A `rejected` line with no last valid price removes the company from prices_hash — app/models/bid_trade_product.rb:126-128
4. [calculation] last_valid_price = price of the latest `revised` ancestor line that is not anomaly_resolved; nil with no ancestry — app/models/bid_trade_product.rb:1227-1234
5. [side-effect] A saved `draft`/`active` line with an ancestry increments the parent's quote revision count — app/models/bid_trade_product.rb:226-238
Gaps: prices_hash key is `meta_data["company_id"]`, not the `company_id` column; a line without that meta key writes/deletes key "" (unverified that any path omits it) — app/models/bid_trade_product.rb:125
Cites: app/models/bid_trade_product.rb:61-63, 99-132

### BidTradeProduct statuses vs Bid statuses — which lines belong to a bid
Bid lines have two more statuses than bids.
Rules:
1. [state] Line statuses: in_active 0, active 1, selected 2, revised 3, rejected 4, revoke 5, requested 6, pending 7, anomaly_detected 8, draft 9, negotiated 10, surrogate_btp_withdrawn 11 — app/models/bid_trade_product.rb:53
2. [state] Bid#bid_products excludes `in_active` and `negotiated` lines; all_bid_products (used for negotiated QCS) excludes only `in_active` — app/models/bid_trade_product.rb:68, app/models/bid.rb:688-695
3. [state] BidTradeProduct#bids(trade_request_id) returns only active/selected/requested bids containing the line — app/models/bid_trade_product.rb:412-419
4. [state] BidTrade (bid↔stage mapping) statuses stop at pending 7 (no draft / anomaly / approval_requested) — app/models/bid_trade.rb:28
Cites: app/models/bid_trade_product.rb:53, 68, app/models/bid.rb:104, 688-695

## Rank

### Rank key resolution — which widget a lot rank and a line rank are computed on
get_key_for_score decides the ranked field before the score is built.
Rules:
1. [config] Vendor ranking: line rank uses trade config `ranking_widget_line`, lot rank `ranking_widget_lot` — app/models/model_helpers/trade_request_model_helper.rb:819-825
2. [config] Fallback when those are nil and the stage has widgets: line → `ranking_widget` if it is an inline widget else `price`; lot → `ranking_widget` if it is a global widget else `gross_total` — app/models/model_helpers/trade_request_model_helper.rb:828-838
3. [config] Old price-increase-approval stages return config `ranking_widget` directly — app/models/model_helpers/trade_request_model_helper.rb:831
4. [config] Buyer ranking (separate buyer ranking): `buyer_ranking_widget_line` / `buyer_ranking_widget_lot`, then `buyer_ranking_widget` — app/models/model_helpers/trade_request_model_helper.rb:805-811
5. [calculation] Consequence: on a template stage with no ranking config the LINE rank is on unit `price` (base price, not landed cost) and the LOT rank on `gross_total` — app/models/concerns/bid_trade_product_rank_helper.rb:147-148, app/models/concerns/bid_rank_helper.rb:111-114
Cites: app/models/model_helpers/trade_request_model_helper.rb:802-844

### Line rank score — fallback when the ranking widget is empty on a line
How BidTradeProduct#get_score_for_rank picks its number.
Rules:
1. [calculation] Order: auto-CD → effective_price; ranking key present AND the line has a value for it → that value; `ranking_on_base_price` → price; else landed cost (precision from `net_price` or `price` widget) — app/models/concerns/bid_trade_product_rank_helper.rb:142-162
2. [calculation] A ranking widget whose input_group is not `price` is treated as an amount (not per-unit) for precision — :149-152
3. [calculation] Weighted events add the participant's weighted_total to the line score — :106, app/models/bid_trade_product.rb:1240-1252
4. [calculation] best_price stored for a line = the line `price`, while rank = the score above — app/models/concerns/bid_trade_product_rank_helper.rb:164-173
Gaps: when the configured ranking widget is blank on one vendor's line, that vendor is ranked on base price / landed cost while others are ranked on the widget — mixed units in one ranking — app/models/concerns/bid_trade_product_rank_helper.rb:147-158
Cites: app/models/concerns/bid_trade_product_rank_helper.rb:99-173

### Rank score rounding — currency precision vs widget precision (precision 0 means no rounding)
How bid and line rank scores are rounded before comparison (equal rounded scores tie).
Rules:
1. [calculation] Multi-currency stage: round to base currency precision — per-base-unit precision for per-unit scores, amount precision otherwise — app/models/concerns/bid_rank_helper.rb:150-159, app/models/concerns/bid_trade_product_rank_helper.rb:109-117
2. [calculation] Single-currency stage: round to the target widget's `configuration.precision` (adjusted to base unit for per-unit scores) ONLY when precision > 0 — app/models/concerns/bid_rank_helper.rb:163-175
3. [calculation] Weighted single-product bid: weight precision = widget precision, or currency per-unit precision on multi-currency — app/models/bid.rb:1314-1320
Gaps: precision 0 is skipped, so a widget configured for 0 decimals ranks unrounded (100.4 beats 100.6 though both display 100) — app/models/concerns/bid_rank_helper.rb:172. Multi-currency single-product bid with NO lines gets score 0.0 — best possible on a buy event — app/models/concerns/bid_rank_helper.rb:152-162
Cites: app/models/concerns/bid_rank_helper.rb:149-177

### Weighted ranking — weights added to the price score
Weighted bid events (weightages per vendor).
Rules:
1. [calculation] Bid score += Σ active weightage values for the vendor (`weighted_total` = sum of all keys); no weightages → +0 — app/models/bid.rb:1309-1324, app/models/model_helpers/common_model_helper.rb:64-69
2. [calculation] For a broker's bid (vendor company category brokerage) the BROKER company's weights are used — app/models/bid.rb:1311-1312
3. [calculation] Single-product weighted events also store score `color` = rank score / bid quantity for traffic lights — app/models/concerns/bid_rank_helper.rb:184-186
Gaps: `color` divides by bid.quantity, which is nil with no lines (NoMethodError) and Infinity with quantity 0 — app/models/concerns/bid_rank_helper.rb:185, app/models/bid.rb:627-629
Cites: app/models/bid.rb:1309-1324, app/models/concerns/bid_rank_helper.rb:179-191

### Loading factor — penalty added to the rank score for regretted / TNA / not-quoted lines
Auction stages with loading factor enabled.
Rules:
1. [calculation] Non-BOQ: a vendor's loading = Σ trade product loading factors of lines it regretted, plus lines where it is TNA when misc `allow_tna_vendors_to_bid` is not true — app/models/model_helpers/trade_request_model_helper.rb:1568-1586, 1627-1630
2. [calculation] BOQ: loading = Σ loading factors of lines the vendor has no bid line on — :1588-1603
3. [calculation] Loading is added to the ranked key's score before ranking (Bid#get_rank, sort order) — :1605-1619, app/models/concerns/bid_rank_helper.rb:200-205, app/models/bids_group.rb:654-656
4. [config] Loading factor applies only to auctions with it enabled — :1565
Gaps: EventIndicators::LotBased reads `@ranking_key` before assigning it, so loading is added under key nil (i.e. not at all): indicator rank / best score ignore loading while Bid#get_rank includes it — app/services/event_indicators/lot_based.rb:15-16
Cites: app/models/model_helpers/trade_request_model_helper.rb:1565-1619

### Rank computation variants — sell orders, missing scores, alternate bidding, TNA vendors
Beyond the dense-rank/tie rule in bids.md.
Rules:
1. [calculation] Sell (forward) orders: higher score is better (sorted descending); the tie shift applies the same way — app/models/concerns/bid_rank_helper.rb:212-218, app/models/concerns/bid_trade_product_rank_helper.rb:44-56
2. [calculation] A vendor with no score under the ranking key gets rank nil (not last) — app/models/concerns/bid_rank_helper.rb:210-211
3. [calculation] Alternate bidding: a line rank is computed against the scores of ALL active/closed lines of the stage pooled together — app/models/concerns/bid_trade_product_rank_helper.rb:181-184, 215-234
4. [calculation] Line rank with update_event_score excludes TNA vendors' scores; in company→rank maps TNA vendors get rank nil — :185-197, 236-261
5. [calculation] is_vendor_l1_for_trade_product is true only when the vendor's rank is exactly 1 (so tied leaders, both L2, are not L1) — :263-271
6. [calculation] Stages created before event scores existed read `trade_product.rank_hash["c<company_id>"]` / `auction_rank_hash` — app/models/concerns/bid_trade_product_rank_helper.rb:176-180
Cites: app/models/concerns/bid_rank_helper.rb:208-221, app/models/concerns/bid_trade_product_rank_helper.rb:175-271

### Bid rank used for approvals — worst line rank on line-closing stages
The `bid_rank` approval rules match on.
Rules:
1. [calculation] Stage closed per line item → approval bid_rank = the MAXIMUM (worst) line rank among the bid's lines; else the lot rank — app/models/bid.rb:1624-1630
2. [calculation] Approval data also carries po_value = gross_total, bids_count, price = Σ line prices, `price_approval` = true only when every trade product quantity is 1, plus lot `po_details` flattened and, for lot-based savings with a budget strategy, `budget_savings_reference_value` — app/models/bid.rb:1600-1660
Gaps: a budget strategy with no lot reference price keyed `budget` → `nil[:value]` crash — app/models/bid.rb:1657-1658. A line with no rank makes `.max` compare nil with Integer (ArgumentError) — app/models/bid.rb:1626
Cites: app/models/bid.rb:1600-1660

### Rank change detection — old vs new rank of a revised bid
Used by last-minute extension and notifications.
Rules:
1. [calculation] Old rank = rank recomputed with the vendor's latest `revised` bid scores substituted in; new rank = current rank — app/models/concerns/bid_rank_helper.rb:259-271
2. [calculation] No earlier revised bid → old rank = MAX_RANK (500000), so a first bid always counts as a rank change — app/models/concerns/bid_rank_helper.rb:262, app/models/bid.rb:165
3. [calculation] is_rank_changed? = new_rank ≠ old_rank — app/models/concerns/bid_rank_helper.rb:247-254
Gaps: the previous bid is looked up by `user_id`, not company: if a colleague placed the vendor's previous bid, old rank = MAX_RANK and any bid counts as changed — app/models/concerns/bid_rank_helper.rb:260
Cites: app/models/concerns/bid_rank_helper.rb:244-271

### Rank slip push notifications (rank_slip_handler) — who is told their rank changed
After commit on a bid save, vendors whose line rank moved are pushed "rank_change".
Rules:
1. [state] Skipped for bids in `revised` or `draft` — app/models/bid.rb:285
2. [calculation] Per line of this bid: previous rank from stored event scores (missing → participants + 1), new rank from fresh line scores of active/selected/requested bids (missing → participants + 1) — app/models/bid.rb:291-303
3. [side-effect] Companies holding ranks new_rank..previous_rank are pushed `rank_change` once each — app/models/bid.rb:309-319
Gaps: the Ruby range new_rank..previous_rank is EMPTY when the rank got worse (e.g. 1 → 3), so nobody — including vendors who moved up — is notified on a rank drop — app/models/bid.rb:310
Cites: app/models/bid.rb:284-320

### Event scores written on bid save (update_event_score_for_participants, save_scores_on_line_item)
Where ranks come from: per-company scores stored on the stage and on each line.
Rules:
1. [state] Not run for bids in approval_requested / draft / revised (unless refreshing a revised bid) — app/models/bid.rb:479-481, 323-325
2. [state] RFI/RFP stages never write lot scores — app/models/bid.rb:2370
3. [calculation] Lot score = {rank, best_price = gross_total, [buyer_rank], [color]} only when the bid is active/selected/requested; otherwise the company key is DELETED from event_score_for_participants — app/models/trade_request.rb:2006-2010, app/models/bid.rb:2383-2399
4. [config] When the stage only updates creator scores (update_only_creator_scores?, e.g. after bidding), only `buyer_rank` is rewritten; a surrogate active bid still refreshes the full score — app/models/bid.rb:488-489, 2372-2379
5. [calculation] Line scores use the vendor's latest non-draft line per trade product; if the latest is `rejected` and an older rankable line exists, that one is used — app/models/bid.rb:380-381, app/models/concerns/bid_concern.rb:79-94
6. [side-effect] meta_data change_timeline gets {rank_after_change, bid_status, timestamp} — app/models/bid.rb:2063-2077
Cites: app/models/bid.rb:322-353, 2369-2407

### Dynamic time extension from a bid save — when a late bid extends the auction
Bid#save_scores_on_line_item may extend the close (DTE). Controller-level DTE rules are in auction-templates.md.
Rules:
1. [time] Not triggered when the save resolves a price increase/decrease or counter-offer request (bid active after an additional request) — app/models/bid.rb:413-416
2. [time] Non-staggered: bid active, auction, dynamic closing allowed, and bid_end_time within [placed_at, placed_at + last_n_minutes_for_time_extension] (inclusive) — app/models/bid.rb:421-424
3. [time] Staggered on line: inline-rank auction and (item end − placed_at) ≤ last_n_minutes × 60 s — app/models/bid.rb:417-420
4. [time] Rank-based: extend when old ≠ new rank and either is ≤ config `rank_limit_for_time_extension` (nil rank = 500000) — app/models/bid.rb:439-448
5. [time] Price-based (only lines in meta_data `last_revised_bid_product_ids`): new rank ≤ limit AND price improved (buy: new < old; sell: new > old; no old price = always improved) — app/models/bid.rb:401-405, 450-462
Gaps: price-based with `rank_limit_for_time_extension` unset → `Integer <= nil` ArgumentError (untyped 500 on bid save) — app/models/bid.rb:452
Cites: app/models/bid.rb:374-462

### Dynamic time extension — what the extension writes (update_dynamic_closing_schedule)
Effects once DTE fires.
Rules:
1. [time] Extension minutes = trade config `time_extension_value`; new `dynamic_extra_time` schedule from current end to end + minutes (staggered: [end − minutes, end]) — app/models/bid.rb:355-371, 2256-2278
2. [time] Non-staggered: trade `closed_at` += minutes; `sealbid_allowed` set true after the first DTE — app/models/bid.rb:369, 2280-2283
3. [side-effect] send_last_min_bid_notification = true; every bid's `end_time` := new bid_end_time — app/models/bid.rb:2279, 2286-2287
4. [time] The schedule copied is the latest auction/dynamic_extra_time schedule while `auctioning`, the latest rfq schedule while `rfqing` — app/models/bid.rb:2259-2263
Gaps: `time_extension_value` nil → `nil * 60` NoMethodError before the 3-minute default in update_dynamic_closing_schedule is ever reached — app/models/bid.rb:356-357, 2264. Stage status neither auctioning nor rfqing → schedule nil → `nil.schedule_type=` crash — app/models/bid.rb:2259-2266
Cites: app/models/bid.rb:355-372, 2256-2288

### BidTrade last-minute extension on a rejected/revoked L1 bid — never fires
Correction to bids.md "Last-minute bid → auction end time extension": the reject/revoke branch is dead.
Rules:
1. [time] update_trade_end_time_on_bid_revoke runs only after a BidTrade is CREATED with status rejected/revoke and is skipped on dynamic-closing stages — app/models/bid_trade.rb:36, 145-150
2. [time] It sorts Bid rows by rank score and looks up `.index(self)` where self is the BidTrade, so the index is always nil and `rank == 0` is never true — no extension happens — app/models/bid_trade.rb:151-155
3. [time] The normal last-minute rule (bid active, end within next 1 minute, config `update_trade_end_time`, rank ≤ `rank_for_update_trade_end_time` default 1) is unaffected — app/models/bid_trade.rb:45-58, 118-129
Gaps: dead extension branch (see rule 2); is_last_minute_update_trade_end_time_allowed_with_dynamic_closing? rank branch evaluates `true` then returns `false` — app/models/bid_trade.rb:70-76
Cites: app/models/bid_trade.rb:118-157

## Best price, counts and bid lists

### Best price on a stage — what "best_bid_price" is
The best price shown to buyers and (when enabled) vendors.
Rules:
1. [calculation] Multi-product stage: best price = min (buy) / max (sell) of every participant's stored `best_price` = gross_total in event_score_for_participants — app/services/event_indicators/lot_based.rb:68-71, 126-131, app/models/concerns/bid_rank_helper.rb:182
2. [calculation] Single-product stage: best price from the first trade product's line-based indicator — app/models/bid.rb:2332-2338
3. [calculation] Only active/selected/requested bids have scores, so rejected/revoked/revised bids drop out of best price on the next precompute — app/models/trade_request.rb:2006-2010, app/models/bid.rb:2391-2398
4. [side-effect] Stored at trade misc `precomputed_bids_data.best_bid_price` on each non-draft save — app/models/bid.rb:503-506
5. [calculation] Legacy get_best_bid_hash counts every status except in_active/revised/revoke/rejected/anomaly_detected/draft (so pending and approval_requested count) using gross_total (multi) or landed cost (single) — app/models/concerns/bid_rank_helper.rb:273-280, 35-55
6. [calculation] Line best price (BidsGroup) is computed only when the stage requires best price or is an English auction — app/models/bids_group.rb:199-201
Cites: app/services/event_indicators/lot_based.rb:68-131, app/models/bid.rb:2332-2338

### precompute_bids_data_v2 — bids count, awarded totals and per-vendor price cache
After-commit cache written on the stage's misc for listing screens.
Rules:
1. [calculation] `bids_count` = bids on the stage in active/selected/requested/anomaly_detected — app/models/bid.rb:491-493
2. [side-effect] A `selected` bid writes `selected_bid_company_id[company_id]` = its gross_total — app/models/bid.rb:495-498
3. [calculation] bids_data[trade identifier] = {price, amount = gross_total, stamp bid_accepted|bid_placed}; multi-currency adds original_currency_data rounded to the stage precision (preferred currency, else INR) — app/models/bid.rb:2413-2434
4. [visibility] Fast bids store an EMPTY bids_data entry (no price/amount) — app/models/bid.rb:2435-2436
5. [side-effect] misc bid_company_ids / broker_company_ids appended; MCP cache invalidated; PrecomputationEngineWorker "precompute_bid" queued — app/models/bid.rb:507-513
Cites: app/models/bid.rb:475-514, 2413-2440

### BidsGroup — which bids a bid list contains (drafts, event page, quote details)
The read model behind live bid lists.
Rules:
1. [visibility] Default: in_active and draft bids are excluded; with show_draft_bid a draft is listed only to the user who created it — app/models/bids_group.rb:27-32
2. [visibility] Event show page: only active/selected/requested, and only the first 4 bids after ranking sort — app/models/bids_group.rb:33-35, 194-196
3. [visibility] Quote details: active/revised/selected/requested/approval_requested — app/models/bids_group.rb:36-38
4. [visibility] A withdrawn surrogate bid (in_active + surrogate_withdrawn) or a surrogate bid pending its creation approval is not put in any list — app/models/bids_group.rb:95-97
5. [visibility] Each bid is listed only if accessor.can_view_bid? allows it — app/models/bids_group.rb:119-123
6. [calculation] Per-company bid count counts active/selected/revised/requested — app/models/bids_group.rb:139-141
Gaps: the stage bids_count increments for every bid not revised/revoke/rejected — INCLUDING ones hidden by rules 4-5 (pending surrogate approvals, other users' drafts) — app/models/bids_group.rb:127-128
Cites: app/models/bids_group.rb:21-59, 90-135

### BidsGroup — company name, communication and quick-revise flags per bid
Flags the list sets on each live bid.
Rules:
1. [visibility] Trade config `show_company_profile` false → show_company_name = false, except for a `selected` bid or the viewer's own bid — app/models/bids_group.rb:484-489
2. [visibility] Trade config `is_communication_allowed` false → is_communication_allowed = false except on a `selected` bid — app/models/bids_group.rb:490-492
3. [permission] Quick revise is offered only on a running, non-knockout/dutch stage: surrogate bid → only when the viewer's companies include the vendor; normal bid → bid owner or same company — app/models/bids_group.rb:503-511
4. [visibility] Pending request flags: counter offer / anomaly → owner sees is_current_user_approval, same company is_current_user_company_approval; justification → vendor company; price increase/decrease → vendor sees "bid requested", stage owner sees approval, with counts — app/models/bids_group.rb:424-479
Gaps: Bid#get_configurations hard-codes is_show_seller_company_profile = true, so only the trade-config switch can hide names — app/models/bid.rb:810-830
Cites: app/models/bids_group.rb:424-516

### Traffic light colours — green / yellow / red bands
Traffic-light bidding (misc traffic_light_ranges or per-line meta_data bounds).
Rules:
1. [calculation] Value = rank (traffic light on rank), else weighted single-product score/quantity, else rank score — app/models/bids_group.rb:349-357
2. [calculation] Reverse (buy) or rank-based: value ≤ lower → green; lower < value ≤ upper → yellow; else red — app/models/bids_group.rb:384-389
3. [calculation] Forward auction on price: value ≥ lower → green; upper ≤ value < lower → yellow; else red — app/models/bids_group.rb:390-395
4. [calculation] Any of value/lower/upper missing → no colour — app/models/bids_group.rb:382-383
5. [state] Line colours only on traffic-light stages closed per line, bounds from trade product meta_data — app/models/bids_group.rb:366-379
Cites: app/models/bids_group.rb:349-411

### BidsGroup sort order — buyer ranking, loading factor, missing scores last
How bids are ordered in lists.
Rules:
1. [calculation] Sort key = rank score (buyer_rank score for a buyer when separate buyer ranking is on) + loading factor when enabled — app/models/bids_group.rb:641-656
2. [calculation] Buy: ascending; sell: descending; bids with nil score last — app/models/bids_group.rb:657-667
Cites: app/models/bids_group.rb:641-670

## Status transitions and callbacks

### Bid status sets used by business rules (reference)
Which statuses each rule treats as "live".
Rules:
1. [state] Ranked: active, selected, requested; regret allowed: draft, active, selected, requested — app/models/bid.rb:163-164
2. [state] is_valid_to_close? (can be awarded): active, requested, pending; is_valid_to_edit?: also anomaly_detected — app/models/bid.rb:596-604
3. [state] Reports: should_include_bid_in_report? = active/selected/rejected/requested (+revised on request); scope for_report = active/selected/revised/rejected/requested — app/models/bid.rb:1493-1495, 110
4. [state] is_bid_closed? (award just happened) = now selected and status changed from active/pending/requested — app/models/bid.rb:2207-2209
5. [state] Pending counter offer / price increase / price decrease / justification = status requested + other_details `additional_request_type` counter_offer_for_bid / bid_price_increase / bid_price_decrease / bid_justification — app/models/bid.rb:1887-1897, 1935-1937
6. [time] is_offline_negotiated? = bid created more than 3 minutes after bid_end_time — app/models/bid.rb:631-633
Cites: app/models/bid.rb:163-164, 596-604, 1887-1937

### Bid status-change notifications — reject, reopen, revoke, rank change, new/edit bid
Push/email sent from Bid callbacks.
Rules:
1. [side-effect] active → rejected: push `reject_bid`; rejected → active: `make_bid_active_again`; active → revoke: `revoke_bid`; nothing for draft or changes from draft — app/models/bid.rb:2121-2134
2. [side-effect] Push `bid_rank_change` on any save of a non-draft, non-rejected bid on a live stage whose rfx_mode is auction or rfq_then_auction (not book building) — app/models/bid.rb:2145-2156
3. [side-effect] First active bid of a company (or first after a revoke) on a running stage: `new_bid` push, pending response-submission tasks completed, surrogate → email to vendor — app/models/bid.rb:249-274
4. [visibility] The `new_bid` email to the buyer / intake creator is suppressed when event masking or participant-name masking is on for the stage owner — app/models/bid.rb:275-280
5. [config] Revisions push `edit_bid` unless trade config `enable_bid_revision_notification` is false (default on) or it was requested → revised after a counter offer — app/models/bid.rb:263-266, 2319-2330
Cites: app/models/bid.rb:249-282, 2121-2156, 2319-2330

### Reject / revoke cascade and the best-offer window (update_additional_tasks, close_best_response_time)
What else changes when a bid is rejected, revoked or revised.
Rules:
1. [side-effect] Bid becomes rejected or revoke → its additional requests that are active and not resolution `requested` become in_active — app/models/bid.rb:2290-2299
2. [side-effect] active → revised during the vendor's response-review (best offer) time: company added to config `best_offer_submitted_participants`, its BestOfferSubmission task completed — app/models/bid.rb:160, 2227-2238
3. [time] When the set of submitters equals config `allowed_participants_to_edit_in_bid_review_time.request_for_best_price`, the review window's end_time := now (closes early) — app/models/bid.rb:2231, 2239
4. [side-effect] Suspicious-IP cache: active/requested non-surrogate, non-broker bids add company to `bids_ips_vs_companies_ids#<trade>` for 24 h only when trade config `is_suspicious_bid_indicator_enabled` is true — app/models/bid.rb:2302-2312
5. [side-effect] A ranked bid that is not an rfq_final_bid on a running rfx-project Dutch auction ends the auction at once — app/models/bid.rb:516-524
Cites: app/models/bid.rb:2227-2312, 516-524

### Award on save — PO creation, closed_at and award follow-ups
Callbacks that fire when a bid becomes `selected`.
Rules:
1. [side-effect] before_save create_order_on_bid_close (last before_save): bid just closed (selected from active/pending/requested) and the stage has no provisional contract → Order.create_order; multiple-PO bids create orders for newly added `selected_bid_product_ids`; skip_order_creation suppresses it — app/models/bid.rb:133, 2190-2205
2. [calculation] Order lines = selected bid lines on non-void trade products; quantity = line other_details `awarded_quantity` when present else quoted quantity; eRFx awarded quantities re-price the order via quantity_overrides — app/models/concerns/bid_concern.rb:7-10, 40-73, app/models/order.rb:417-423
3. [side-effect] closed_at stamped on first change to selected — app/models/bid.rb:152-155, 1856-1859
4. [side-effect] EventGroupUpdateWorker in 5 s (no provisional contract); CustomSavingsCalculatorWorker in 2 s when company show_custom_savings — app/models/bid.rb:2211-2225
5. [config] Vendor push `bid_closed`, buyer team push, WhatsApp and the award email (custom BID_AWARD_EMAIL template if configured, else `bid_accept`) only when the stage notify_on_bid_select? is on — app/models/bid.rb:2079-2119, 2158-2164
Cites: app/models/bid.rb:2166-2225, app/models/order.rb:408-425

### Bid award approval outcomes (handle_approval_completion_afterflow)
What the approval workflow does to a bid waiting for award (close_trade) or surrogate-create approval.
Rules:
1. [state] Ignored when the stage is already closed or the bid is neither requested nor approval_requested — app/models/bid.rb:1744-1746
2. [state] Surrogate-create approval: approved → active, rejected → rejected, expired/withdrawn → in_active — app/models/bid.rb:1780-1790, 2442-2444
3. [state] Award approved → select_bid_v2 runs with the approval requester as closer, then notifications/award email — app/models/bid.rb:1981-2008
4. [config] Award rejected → lines and bid set by approval config `handle_approval_rejection_as`: set_active (default) → active, set_rejected → rejected, revert_to_prev_approver → requested (TODO) — app/models/bid.rb:2010-2027
5. [state] Expired/withdrawn → lines and bid back to active; meta_data `awarded_quantities` dropped on reject/expire/withdraw — app/models/bid.rb:2043-2055
6. [side-effect] Multiple-PO: PO entry marked Rejected / Expired and bid status recomputed (any requested line → requested, else any active → active, else selected) — app/models/bid.rb:2028-2035, 2046-2048, app/controllers/concerns/bid_multiple_po_helper.rb:94-104
Gaps: approval finishing after the stage closed leaves the bid `requested` (rule 1) — app/models/bid.rb:1744
Cites: app/models/bid.rb:1740-1790, 1981-2055

### Partial award quantity checks at approval time (standalone events) — 561
Non-eRFx (dummy event group) partial awarding through approval.
Rules:
1. [validation] Applies when bid meta_data `awarded_quantities` is present on a dummy-event-group stage — app/models/bid.rb:1985-1990
2. [validation] An awarded quantity ≤ 0 → 561 "You cannot select bid with more than requested quantity." (HTTP 422) — app/controllers/concerns/bids_controller_helper.rb:2183-2184, config/locales/en-IN.yml:1951-1953
3. [validation] Σ awarded per trade product (rounded to 6 dp) > trade product remaining_quantity (rounded 6 dp) → 561; lines with remaining nil are not checked — app/controllers/concerns/bids_controller_helper.rb:2186-2197
4. [calculation] Awarded value may be a number or {value: n}; written to each line's other_details `awarded_quantity` — :2202-2215
5. [side-effect] A code from the approve path is raised as the approval call's error — app/controllers/concerns/approval_workflow_controller_helpers/approval_request_controller_helper.rb:72-73
Gaps: 561's message says "more than requested" even for a zero/negative quantity — :2184
Cites: app/controllers/concerns/bids_controller_helper.rb:2173-2215

### Multiple purchase orders on one bid — lock and status (allow_multiple_po_on_same_bid)
Model helpers behind several POs per bid (controller rules in trade-live-v1.md).
Rules:
1. [config] Enabled by the stage's allow_multiple_po_on_same_bid?; default false — app/controllers/concerns/bid_multiple_po_helper.rb:48-50
2. [state] Selected lines allowed on bid status selected, plus active/requested when multiple PO is on — :32-33, 52-60
3. [validation] A second award on the same bid within 3 s → 516 "Transaction in Progress" (HTTP 422); cache key bid_<id>_c<workspace> — :36-46, 108-123, config/locales/en-IN.yml:1814-1816
4. [side-effect] New PO lines = selected_bid_product_ids after − before in the save's meta_data change — :7-18
Gaps: the lock is released only when the block finishes without raising; an exception keeps it for 3 s — :41-45
Cites: app/controllers/concerns/bid_multiple_po_helper.rb:1-124

### Bid validations, revision bookkeeping and the line-price list on the trade product
Remaining model checks/bookkeeping.
Rules:
1. [validation] The only model validation is "Please bid on at least one product" (see bids.md); fast bids and buyer-added bids are exempt — app/models/bid.rb:217-223
2. [side-effect] update_bid_products_validations removes this bid line's landed cost without CD (else the last value) from trade product validations `all_bid_prices` — app/models/bid.rb:1939-1952
3. [calculation] all_bid_prices gets landed cost without CD (sheet stages) or line landed cost + bid freight (single-product) — app/controllers/concerns/bids_controller_helper.rb:2217-2238
4. [state] last_vendor_added_bid returns the latest revised bid NOT added by the buyer — app/models/bid.rb:564-570
5. [state] Bid#anomaly_detector skips requested bids, non-sheet stages, lot-based savings and knockout/dutch/book_building but is not wired as a callback — app/models/bid.rb:206-215
Cites: app/models/bid.rb:206-223, 1939-1952

## Award proposal model (Proposal)

### Proposal statuses, scopes and the lot_no filter
The award (EventGroup) / technical (TradeRequest) / reorder proposal record.
Rules:
1. [state] Statuses: in_active 0, active 1, selected 2, draft 3, requested 4, rejected 5, withdrawn 6, reevaluated 7; default active; INVALID_STATUSES draft/in_active/rejected/withdrawn — app/models/proposal.rb:50, 68-75
2. [state] valid_for_precomputation = draft/selected/active/requested; requested_or_selected = requested/selected — app/models/proposal.rb:45-46
3. [calculation] Scope lot_no(x) matches meta_data lot_no = x, but a nil or "" lot_no matches EVERY proposal — app/models/proposal.rb:44
4. [validation] responses_hash / meta_data structure validations are commented out: no model validation — app/models/proposal.rb:65-66, 884-898
Gaps: callers that pass a nil lot (e.g. Bid#get_egli_vs_awarded_quantity_hash) pick the last selected proposal of ANY lot — app/models/bid.rb:727-728
Cites: app/models/proposal.rb:44-75

### Proposal callbacks — what saving a proposal triggers
Rules:
1. [side-effect] Every update schedules EventGroupUpdateWorker in 2 s for the project — app/models/proposal.rb:54, app/helpers/api/proposal_helper.rb:642-650
2. [side-effect] Technical proposal (TradeRequest) changing to selected → push + email `notify_buyer_on_technical_evaluation_submission`; any commit while it is selected touches updated_at of every auction/rfq stage and its bids — app/models/proposal.rb:53, 116-122, 133-145
3. [side-effect] draft → requested on a non-lot-RFP technical proposal: approvers added to chats of the first line item — app/models/proposal.rb:55, 757-781
4. [side-effect] EventGroup proposal: snapshot created on create; to in_active → snapshot in_active; responses change / selected / draft→requested → "precompute_event_snapshot"; to requested → last-purchase-price refresh — app/models/proposal.rb:56-63, 183-188, 681-685, 128-131
5. [permission] EventGroup proposal active/requested/selected → company process_validator team gets viewer access on every stage; other non-draft statuses → in_active — app/models/proposal.rb:93-114
6. [side-effect] LOA email/generation workers queued after commit when flagged; errors only logged — app/models/proposal.rb:553-566
Cites: app/models/proposal.rb:53-64, 93-145

### Proposal responses_hash — awarded quantities, awarded vendors and LOA status
Read helpers used by award, PO and LOA flows.
Rules:
1. [calculation] Awarded qty per line for a vendor = responses_hash data.<vendor>.egli_data.<egli>.awarded_quantity as BigDecimal; blank skipped, 0 kept — app/models/proposal.rb:147-160
2. [calculation] awarded_vendor_company_ids = vendors with ANY line `awarded_quantity` present — 0 counts as awarded — app/models/proposal.rb:527-535
3. [calculation] LOA status: send_loa not true → not_requested; else stored status; else generating while requested/selected, void otherwise — app/models/proposal.rb:495-525
4. [calculation] PO form ids = egli_po_form_mapping values + global_po_form_id; per vendor only its lines' forms — app/models/proposal.rb:450-466
5. [side-effect] update_vendor_loa_attributes! merges under a row lock; unknown vendor → false — app/models/proposal.rb:537-551
Gaps: a vendor awarded quantity 0 counts as awarded for LOA (rule 2). responses_hash present without `data` → `nil.include?` crash in get_response_data_for_vendor — app/models/proposal.rb:179
Cites: app/models/proposal.rb:147-181, 495-551

### Proposal approval data — total value, L1 split, PR price for technical proposals
Data approval rules match on.
Rules:
1. [calculation] Award: total_proposal_value = meta_data total_l1_proposal + total_non_l1_proposal (each default 0); bidders_count = vendors in responses_hash; team filters fall back to the latest commercial stage — app/models/proposal.rb:212-232, 346-348
2. [calculation] Technical, line-level: pr_price = best (buy min / sell max) non-TNA rfq_final_amount on the line when an RFQ ran, else PR reference price `pr_price` × line quantity; service PRs sum siblings per vendor — app/models/proposal.rb:294-328
3. [calculation] tna_score_count = vendors whose score is a TNA/Regret label; non_tna = scores − TNA — app/models/proposal.rb:257-258, 331-338
4. [calculation] Reorder proposals: total_proposal_value = meta_data total_reorder_value — app/models/proposal.rb:863-882
Gaps: line-level technical proposal with no evaluation scores → `nil.item` crash — app/models/proposal.rb:259-260
Cites: app/models/proposal.rb:208-338

### Proposal approval outcomes dispatch and approval edits
Model entry points the approval engine calls (outcomes in evaluation-award.md).
Rules:
1. [state] Reorder proposals: only approval_completed acts (re-creates the order) — app/models/proposal.rb:354-360
2. [state] Others: completed → acceptance, rejected → rejection, expired → expiration, withdrawn → withdrawal; returned code raised by the step-resolve path — app/models/proposal.rb:362-371, app/controllers/concerns/approval_workflow_controller_helpers/approval_request_controller_helper.rb:72-73
3. [permission] Added/edited approval steps give their approvers editor access on every stage and line form; notification only for additions — app/models/proposal.rb:783-820
4. [side-effect] Award approval adds approver identifiers to every stage misc and the project config — app/models/proposal.rb:393-405
5. [permission] is_valid_approver? = approver on the latest approval request — app/models/proposal.rb:829-832
Gaps: withdraw ignores the afterflow's error code — app/controllers/api/approval_workflow/approval_requests_controller.rb:187-189
Cites: app/models/proposal.rb:351-405, 783-832

### AuctionAnalytic — reporting table with no behaviour
Rules:
1. [calculation] AuctionAnalytic has no validations, callbacks or methods; it only stores denormalised per-line rows (price, avg/median, reference price, savings basis) — app/models/auction_analytic.rb:1-65
Cites: app/models/auction_analytic.rb:63-65
