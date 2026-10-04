# Bid and report numbers — every figure Procol shows about bids must be right

Integrity cases for the numbers a buyer decides on: line totals, tax, charges and discounts, bid totals, L1 and ranks,
savings, and the downloadable comparison reports. Every expected value is recomputed by an independent calculator
(`prototype/src/integrity/calculator.ts`, exact decimals, the template's own formulas) from the inputs the run itself
submitted — never hard-coded. Backend paths are relative to `procol-backend` at `origin/main` (ae36e86894). The full
inventory of figures, formulas and endpoints is in the integrity agent's `numbers.md`.

Cases marked `automate` are decided by `prototype/scripts/run-integrity.ts` (scenario named in the Trace, invariant id
`INV-…` from `prototype/src/integrity/invariants.ts`). Each scenario builds its own fresh QA_Platform_Integrity_ event
with QA vendors only; a failure counts only when it fails again on a second fresh event.

**Read before running.** The server recomputes every formula from the stored price, quantity and tax (Dentaku, formula
evaluator service); money is stored as binary floats, so a difference below one part in 10^12 of the figure is storage
noise, and a difference within one unit of the last place shown is rounding. The company's decimal places come from its
`widget_precision` setting (PROCOL DEMO 4, Demo Account 2: 2).

## 1. Line figures — what each quoted line is worth

#### EVI-LINE-001 — A quote is stored exactly as the vendor entered it
- **Why it matters.** Every later figure is built on the stored price, quantity and tax rate. If one digit changes on the way in, every total, rank and saving after it is wrong.
- **Setup.** A fresh RFQ on the default buy template with QA vendors invited; the vendor's quote has fractional quantities, a 4-place price and different GST rates per line.
- **Steps.** 1. The vendor opens a bid, prices every line and submits. 2. The buyer opens the comparison.
- **Expected.** Every unit price, quantity and GST rate on the comparison reads back exactly as entered (only formatting may differ, e.g. "18" vs "18.0").
- **Oracle.** INV-ECHO: stored values equal the submitted ones as exact decimals.
- **Trace.** P0 · automate · scenarios S1–S6 · `INV-ECHO` · `app/controllers/concerns/trade_template_helper.rb:5622-5652`

#### EVI-LINE-002 — Line total = unit price × quantity, plus GST on it
- **Why it matters.** The line total is what the buyer compares and later pays; it must follow the template's formula to the paisa.
- **Setup.** Default buy template: line total = price × quantity + price × quantity × GST / 100.
- **Steps.** 1. A vendor quotes ₹123.4567/KG for 7.5 KG at 18 % GST. 2. Read the bid's line totals.
- **Expected.** 123.4567 × 7.5 × 1.18 = ₹1,092.5918 (to the company's places), on the bid record and in the comparison.
- **Oracle.** INV-LINE: `bid_products[].price_breakup.total_landed_amount` equals the calculator's value within one unit of the last place.
- **Trace.** P0 · automate · S1 · `INV-LINE` · `app/models/bid_trade_product.rb:184-198, 302-320`

#### EVI-LINE-003 — Fractional and very large quantities do not lose precision
- **Why it matters.** Bulk buys (250,000 KG; 999,999.999 KG) and fractional ones (0.5 KG) are where float drift and rounding show up first.
- **Setup.** Lines of 0.5, 250000 and 999999.999 KG.
- **Steps.** Quote each line and read the line totals and the bid total.
- **Expected.** Each total equals the exact product of price, quantity and (1 + GST) to the shown places; nothing is truncated or turned into scientific notation.
- **Oracle.** INV-LINE, INV-BID.
- **Trace.** P0 · automate · S1 · `INV-LINE` · `app/models/bid_trade_product.rb:323-333`

#### EVI-LINE-004 — Prices with many decimals and tiny prices total correctly
- **Why it matters.** Unit prices like ₹0.3333/KG over thousands of KG produce long decimals; rounding each step would move the total.
- **Setup.** A line at ₹0.3333 × 1234.567 KG at 5 % GST.
- **Steps.** Quote and read the line total.
- **Expected.** ₹432.055240155 stored; shown as ₹432.0552 at 4 places (₹432.06 at 2).
- **Oracle.** INV-LINE.
- **Trace.** P1 · automate · S1 · `INV-LINE` · `app/models/bid_trade_product.rb:382-405`

#### EVI-LINE-005 — A ₹0 unit price is not a quote and never becomes L1
- **Why it matters.** A zero left in a cell must not make a vendor the cheapest bidder or create a free order line.
- **Setup.** Two vendors; vendor 1 enters ₹0 on line 1.
- **Steps.** 1. Vendor 1 submits with ₹0 on line 1. 2. Read L1 on line 1.
- **Expected.** Either the bid is refused, or line 1 is left unquoted for vendor 1; L1 on line 1 is the other vendor's ₹50.
- **Oracle.** PROBE-ZERO: no `l1_prices` entry with price 0.
- **Trace.** P0 · automate · S5 · `PROBE-ZERO` · `app/controllers/concerns/trade_template_helper.rb:5839 (lines with price ≤ 0 are skipped)`

#### EVI-LINE-006 — The smallest price the screen allows is a real quote
- **Why it matters.** ₹0.0001 (or ₹0.01 at 2 places) is legal; it must total, rank and save correctly, not be dropped as zero.
- **Setup.** Vendor 1 quotes the smallest price at the company's places on line 2.
- **Steps.** Read the line total, L1 and line savings for line 2.
- **Expected.** Line total = price × quantity × 1.18; vendor 1 is L1 on line 2; savings against the reference are computed from that price.
- **Oracle.** INV-LINE, INV-L1, INV-BEST, INV-SAV-LINE.
- **Trace.** P1 · automate · S5 · `INV-L1` · `app/controllers/concerns/trade_template_helper.rb:377-387`

#### EVI-LINE-007 — Many lines in one bid all total correctly
- **Why it matters.** Large RFQs (50+ lines) are where a per-line rounding habit adds up to a visible error in the bid total.
- **Setup.** An RFQ with 60 lines, mixed quantities and GST slabs, two vendors.
- **Steps.** Both vendors quote every line; read the bid totals.
- **Expected.** Each bid total equals the sum of the exact line totals (not the sum of rounded line totals) to the shown places.
- **Oracle.** INV-BID, INV-LINE on every line.
- **Trace.** P2 · automate-later · `INV-BID` · `app/models/bid.rb:1138-1171`

## 2. Tax

#### EVI-TAX-001 — Every GST slab (0, 5, 12, 18, 28 %) is applied to the right line
- **Why it matters.** Mixed-tax RFQs are normal; a slab applied to the wrong line or a 0 % read as blank changes the comparison.
- **Setup.** Lines quoted at 0, 5, 12, 18 and 28 % across three vendors.
- **Steps.** Read every line total.
- **Expected.** Each line total = price × quantity × (1 + its own GST / 100).
- **Oracle.** INV-LINE.
- **Trace.** P0 · automate · S1, S4 · `INV-LINE` · `app/models/bid_trade_product.rb:302-320`

#### EVI-TAX-002 — GST per unit and landed cost per unit in the price breakup
- **Why it matters.** The per-unit landed cost feeds the comparison report's "net price" and the orders' final price.
- **Setup.** Any line with a GST rate and no freight or discount.
- **Steps.** Read the bid's price breakup.
- **Expected.** GST per unit = price × GST / 100; landed cost per unit = price + that GST.
- **Oracle.** INV-BREAKUP on `bid_products[].price_breakup.gst_tax_amount` and `.landed_cost`.
- **Trace.** P1 · automate · S1 · `INV-BREAKUP` · `app/models/bid_trade_product.rb:134-139, 287-294`

#### EVI-TAX-003 — Tax charged on the bid total after discount and charges
- **Why it matters.** Many templates tax the sub total (after discount, including freight); taxing the wrong base over- or under-states every bid.
- **Setup.** A stage whose bid-level formulas are: discount = Σ lines × discount %; sub total = Σ lines − discount + freight + other charges; tax = sub total × tax %; total = sub total + tax.
- **Steps.** Three vendors bid with different discount, freight, other charges and tax (12, 18, 28 %).
- **Expected.** Discount, sub total, tax and total equal the calculator's values for each vendor.
- **Oracle.** INV-BID on every bid-level formula.
- **Trace.** P0 · automate · S2 · `INV-BID` · `app/models/bid.rb:1099-1171, 1193-1203`

## 3. Charges and discounts together

#### EVI-CHG-001 — Bid-level charges and discount are stored as entered
- **Why it matters.** Freight, other charges and discount are typed once per bid; they must not be lost when the lines are saved.
- **Setup.** S2 stage (charges, discount, tax on the total).
- **Steps.** A vendor submits freight ₹500, other charges 0, discount 0 %, tax 18 %.
- **Expected.** The comparison shows exactly those inputs for that vendor.
- **Oracle.** INV-ECHO on the bid-level inputs.
- **Trace.** P1 · automate · S2 · `INV-ECHO` · `app/controllers/concerns/trade_template_helper.rb:5566-5581`

#### EVI-CHG-002 — Line totals without line tax on a charges template
- **Why it matters.** When tax is charged on the total, the line must not also carry tax.
- **Setup.** S2 stage, line total = price × quantity.
- **Steps.** Read each line total.
- **Expected.** Line total = price × quantity exactly.
- **Oracle.** INV-LINE.
- **Trace.** P1 · automate · S2 · `INV-LINE`

#### EVI-CHG-003 — The discount amount is taken from the line sum
- **Why it matters.** A 7.5 % discount must be 7.5 % of the goods value, not of the taxed or freighted value.
- **Setup.** S2; vendor 2 offers 7.5 %.
- **Steps.** Read the discount figure.
- **Expected.** (415.5 × 12.25 + 2050 × 3) × 7.5 % = ₹842.990625.
- **Oracle.** INV-BID on the discount formula.
- **Trace.** P1 · automate · S2 · `INV-BID`

#### EVI-CHG-004 — The sub total = lines − discount + freight + other charges
- **Why it matters.** The sub total is the taxable base; every charge and the discount must land in it once.
- **Setup.** S2; vendor 3 has a 2.25 % discount, ₹1,250.40 freight and ₹99.99 other charges.
- **Steps.** Read the sub total.
- **Expected.** The calculator's sub total to the shown places.
- **Oracle.** INV-BID.
- **Trace.** P1 · automate · S2 · `INV-BID`

#### EVI-CHG-005 — A bid's total is the same in every place on a charges template
- **Why it matters.** The comparison, the quote view and the bid record must not disagree once charges are involved.
- **Setup.** S2 bids.
- **Steps.** Read the total from the stage, the quote details and the bid record (gross total, landed amount, rank price).
- **Expected.** One figure everywhere.
- **Oracle.** INV-SAME.
- **Trace.** P0 · automate · S2 · `INV-SAME` · `app/models/bid.rb:1037-1040`

#### EVI-CHG-006 — "Amount" is the goods value before tax and charges
- **Why it matters.** The bid record's amount is used as the pre-tax value in reports; it must exclude tax, freight and discount.
- **Setup.** S2 bids.
- **Steps.** Read the bid record's amount.
- **Expected.** Σ unit price × quantity.
- **Oracle.** INV-AMOUNT.
- **Trace.** P2 · automate · S2 · `INV-AMOUNT` · `app/models/bid.rb:1050-1053`

#### EVI-CHG-007 — No NaN, Infinity or negative totals with charges and discounts
- **Why it matters.** Impossible numbers on a comparison sheet destroy trust and can sort first.
- **Setup.** S2 bids.
- **Steps.** Scan every figure the buyer reads.
- **Expected.** None.
- **Oracle.** INV-SANE.
- **Trace.** P1 · automate · S2 · `INV-SANE`

#### EVI-CHG-008 — A discount above 100 % cannot make a bid total negative
- **Why it matters.** A negative total would rank as the best bid. The percentage widget is free text on the vendor side.
- **Setup.** S2 stage with a fourth QA vendor invited.
- **Steps.** Vendor 4 submits a 150 % discount.
- **Expected.** Refused; or, if accepted, the total is never negative and never ranks best.
- **Oracle.** PROBE-NEG.
- **Trace.** P0 · automate · S2 · `PROBE-NEG` · `app/controllers/api/bids_controller.rb:555-560 (discount 0–100 is checked only on the old bid paths, not on the sheet / v1 path)`

## 4. Bid totals

#### EVI-TOT-001 — Bid total = the template's total formula over the lines
- **Why it matters.** The bid total is what the buyer ranks on (ranking widget "gross total").
- **Setup.** Default template: total = Σ line totals.
- **Steps.** Read each vendor's total on the comparison.
- **Expected.** The calculator's total to the shown places.
- **Oracle.** INV-BID.
- **Trace.** P0 · automate · S1, S4, S5, S6 · `INV-BID` · `app/models/bid.rb:1099-1171`

#### EVI-TOT-002 — The bid total is the same on the comparison, the quote and the bid record
- **Why it matters.** A buyer who opens a quote must see the same total as on the comparison.
- **Setup.** Any bids.
- **Steps.** Read the total from six places.
- **Expected.** One figure.
- **Oracle.** INV-SAME.
- **Trace.** P0 · automate · S1 · `INV-SAME`

#### EVI-TOT-003 — The pre-tax amount equals Σ price × quantity
- **Why it matters.** See EVI-CHG-006; on the default template it is the base of the GST total.
- **Setup.** Any bids.
- **Steps.** Read the bid record's amount.
- **Expected.** Σ unit price × quantity.
- **Oracle.** INV-AMOUNT.
- **Trace.** P2 · automate · S1 · `INV-AMOUNT`

#### EVI-TOT-004 — The bid count matches the bids listed
- **Why it matters.** "3 bids" on the card must mean three live bids on the sheet.
- **Setup.** Any stage with bids (vendor and surrogate).
- **Steps.** Compare the stage's bid count with the bids listed.
- **Expected.** Equal.
- **Oracle.** INV-COUNT.
- **Trace.** P2 · automate · S1 · `INV-COUNT`

#### EVI-TOT-005 — No impossible numbers on the comparison
- **Why it matters.** NaN / Infinity / negative totals must never reach a buyer.
- **Setup.** Any bids.
- **Steps.** Scan the stage, comparison, indicators, savings and L1 reads.
- **Expected.** None.
- **Oracle.** INV-SANE.
- **Trace.** P1 · automate · S1 · `INV-SANE`

#### EVI-TOT-006 — A vendor's app that sends wrong totals cannot change the figures
- **Why it matters.** The vendor's browser computes totals and sends them. If the server trusted them, a vendor could claim ₹1 and rank first.
- **Setup.** A fresh RFQ; vendor 1's request carries ₹1 as every line total and as the bid total, with real prices and quantities.
- **Steps.** 1. Vendor 1 submits. 2. The buyer reads the totals.
- **Expected.** Every total is recomputed from price and quantity; ₹1 appears nowhere.
- **Oracle.** INV-LINE, INV-BID, INV-SAME on the tampered bid.
- **Trace.** P0 · automate · S3 · `INV-BID` · `app/models/bid.rb:1105-1107 ("Rejecting the formula values sent by frontend")`

#### EVI-TOT-007 — Wrong totals sent by a vendor cannot make it L1
- **Why it matters.** Follows EVI-TOT-006: the ranking must use the recomputed total.
- **Setup.** As EVI-TOT-006; vendor 2 is cheaper.
- **Steps.** Read best bidder, L1 and best total.
- **Expected.** Vendor 2 is best; the best total is vendor 2's recomputed total.
- **Oracle.** INV-BEST, INV-L1.
- **Trace.** P0 · automate · S3 · `INV-BEST`

#### EVI-TOT-008 — A draft bid's total is not used for any decision
- **Why it matters.** Draft bids skip recomputation and keep the client's total; the price-change approval check reads it.
- **Setup.** A non-RFQ stage with price-change approval required; a vendor saves a draft with a wrong total, then submits a revision.
- **Steps.** Observe whether approval is triggered by the real or the claimed change.
- **Expected.** The approval decision uses the recomputed total.
- **Oracle.** Approval raised (or not) matches the recomputed price change.
- **Trace.** P1 · manual · `app/models/bid.rb:948, 1231; app/helpers/api/v1/bids_controller_helper.rb:420; app/controllers/concerns/bids_controller_helper.rb:2679-2681`

## 5. L1, best bidder and ranks

#### EVI-RANK-001 — L1 price per line is the lowest unit price
- **Why it matters.** L1 drives award recommendations and savings.
- **Setup.** Three vendors, five lines.
- **Steps.** Read L1 prices per line.
- **Expected.** The lowest unit price among live bids, with that bid's line total.
- **Oracle.** INV-L1.
- **Trace.** P0 · automate · S1 · `INV-L1` · `app/controllers/concerns/trade_template_helper.rb:377-387, 413-446`

#### EVI-RANK-002 — The L1 data names the lowest-price quote and its quantity
- **Why it matters.** L1 data is used to pre-fill counter offers and awards.
- **Setup.** As EVI-RANK-001.
- **Steps.** Read L1 data per line.
- **Expected.** The lowest unit price and that quote's quantity.
- **Oracle.** INV-L1DATA.
- **Trace.** P1 · automate · S1 · `INV-L1DATA` · `app/controllers/concerns/trade_template_helper.rb:389-411`

#### EVI-RANK-003 — A tie at the lowest price: L1 shows that price, whichever vendor
- **Why it matters.** Tied prices are common in RFQs; the shown price must be the tie price.
- **Setup.** Lines where two or three vendors quote the same unit price.
- **Steps.** Read L1 per line.
- **Expected.** The tie price, with one of the tied vendors' line totals.
- **Oracle.** INV-L1.
- **Trace.** P1 · automate · S1, S4 · `INV-L1`

#### EVI-RANK-004 — Every tied vendor is marked best bidder
- **Why it matters.** Marking only one tied vendor best hides an equal offer.
- **Setup.** As EVI-RANK-003.
- **Steps.** Read best-bidder flags per line.
- **Expected.** All tied vendors best; nobody else.
- **Oracle.** INV-BEST.
- **Trace.** P1 · automate · S1, S4 · `INV-BEST` · `app/services/sourcing_engine/auction_indicators_service.rb:149`

#### EVI-RANK-005 — Ranks follow the dense-rank rule, a tie at the best moving everyone down
- **Why it matters.** Procol shows tied leaders as rank 2 (nobody rank 1); the shown ranks must follow that rule consistently.
- **Setup.** Ranks visible on the stage.
- **Steps.** Read shown ranks.
- **Expected.** Dense rank over the ranking figure; with a tie at the best, every rank +1.
- **Oracle.** INV-RANK.
- **Trace.** P1 · automate · S1, S4 · `INV-RANK` · `app/models/concerns/bid_rank_helper.rb:208-221; app/services/event_indicators/concerns/rank_calculator.rb:22-31`

#### EVI-RANK-006 — Best bid total and ranks on a charges template use the full total
- **Why it matters.** With discounts and charges the cheapest goods value may not be the cheapest bid.
- **Setup.** S2 bids.
- **Steps.** Read the best bid total and ranks.
- **Expected.** The lowest calculated total (after discount, charges and tax).
- **Oracle.** INV-BEST, INV-RANK.
- **Trace.** P0 · automate · S2 · `INV-BEST`

#### EVI-RANK-007 — Line L1 on a charges template is still the lowest unit price
- **Why it matters.** Line L1 is per unit; bid-level charges must not leak into it.
- **Setup.** S2 bids.
- **Steps.** Read L1 per line.
- **Expected.** The lowest unit price per line.
- **Oracle.** INV-L1, INV-L1DATA.
- **Trace.** P2 · automate · S2 · `INV-L1`

#### EVI-RANK-008 — A lower price with a higher tax: screen L1 and report "best net price" may differ
- **Why it matters.** Procol has three L1 definitions: lowest unit price (screen L1), lowest ranking score, and lowest net price after tax (Excel). A buyer must know which one each shows.
- **Setup.** Line 2: vendor A ₹100 at 28 % (₹128 after tax), vendor B ₹105 at 5 % (₹110.25), vendor C ₹104 at 18 %.
- **Steps.** Read screen L1 for line 2 and the report's best net price.
- **Expected.** Screen L1 = ₹100 (vendor A, unit price basis); report best net price = ₹110.25 (vendor B).
- **Oracle.** INV-L1 + REPORT-L1.
- **Trace.** P1 · automate · S4 · `INV-L1` · `app/controllers/concerns/trade_template_helper.rb:377-387; app/services/reporting_engine/concerns/report_data_generator.rb:1089-1110`

#### EVI-RANK-009 — Rank auction: overall ranks on the bid total
- **Why it matters.** In a rank auction the rank IS what vendors bid against.
- **Setup.** A rank auction with three vendors at ₹101.25, ₹99.50, ₹100 per unit.
- **Steps.** Read the buyer's ranks and best total.
- **Expected.** 99.50 → 1, 100 → 2, 101.25 → 3; best total = vendor 2's total.
- **Oracle.** INV-RANK, INV-BEST.
- **Trace.** P0 · automate · S6 · `INV-RANK`

#### EVI-RANK-010 — Each vendor sees its own correct rank in a rank auction
- **Why it matters.** A vendor shown the wrong rank bids against a phantom.
- **Setup.** As EVI-RANK-009.
- **Steps.** Each vendor reads the stage.
- **Expected.** Its own rank by the same rule.
- **Oracle.** VENDOR-RANK.
- **Trace.** P0 · automate · S6 · `VENDOR-RANK`

## 6. Savings

#### EVI-SAV-001 — Line savings = reference − best unit price
- **Why it matters.** Savings are reported to management; each line's must be exact.
- **Setup.** PROCOL DEMO fills a last-purchase-price reference per line.
- **Steps.** Read best line-wise savings and each quote's savings.
- **Expected.** Reference − unit price per unit (shown truncated to 4 places), % = amount ÷ reference × 100 (2 places).
- **Oracle.** INV-SAV-LINE.
- **Trace.** P0 · automate · S1 · `INV-SAV-LINE` · `app/models/concerns/savings_configuration_helpers/savings_calculator.rb:53-72; app/controllers/concerns/utils.rb:623-627`

#### EVI-SAV-002 — Each vendor's own line savings in the quote view
- **Why it matters.** The quote view shows savings per vendor; it must use that vendor's price.
- **Setup.** As EVI-SAV-001.
- **Steps.** Open each vendor's quote.
- **Expected.** Reference − that vendor's unit price.
- **Oracle.** INV-SAV-LINE (quote details).
- **Trace.** P1 · automate · S1 · `INV-SAV-LINE`

#### EVI-SAV-003 — Total savings = Σ line savings × quantity over Σ reference × quantity
- **Why it matters.** The savings card is the headline number for the event.
- **Setup.** As EVI-SAV-001.
- **Steps.** Read aggregate savings.
- **Expected.** The calculator's amount, reference and % (2 places).
- **Oracle.** INV-SAV-AGG.
- **Trace.** P0 · automate · S1 · `INV-SAV-AGG` · `app/controllers/concerns/trade_template_helper.rb:262-318, 449-526`

#### EVI-SAV-004 — The stage page and the savings card show the same saving
- **Why it matters.** Two screens, one number.
- **Setup.** As EVI-SAV-001.
- **Steps.** Compare the stage's aggregate savings with the savings card.
- **Expected.** Same amount and %, allowing for the places each shows (today the stage shows 4 places, the card 2).
- **Oracle.** INV-SAV-AGG (two places).
- **Trace.** P2 · automate · S1 · `INV-SAV-AGG`

#### EVI-SAV-005 — Savings and every figure stay the same after the close
- **Why it matters.** The savings worker recomputes and stores savings 5 s after the close; the stored copy feeds reports.
- **Setup.** S1 with a 6-minute window.
- **Steps.** Re-run every check after the close.
- **Expected.** All agree.
- **Oracle.** AFTER-CLOSE.
- **Trace.** P1 · automate · S1 · `AFTER-CLOSE` · `app/controllers/api/trade_controller.rb:692; app/workers/savings_calculator_worker.rb:25-48`

#### EVI-SAV-006 — Savings with a tiny best price do not overflow or show NaN
- **Why it matters.** A near-zero price makes savings ≈ 100 %; it must stay a number.
- **Setup.** S5 (smallest price on line 2).
- **Steps.** Read line and total savings.
- **Expected.** Exact amounts; % below or equal to 100; no NaN / Infinity.
- **Oracle.** INV-SAV-LINE, INV-SAV-AGG, INV-SANE.
- **Trace.** P1 · automate · S5 · `INV-SAV-LINE`

#### EVI-SAV-007 — A zero savings reference shows no percentage, not "Infinity %"
- **Why it matters.** amount ÷ 0 in Ruby floats is Infinity, rounded and sent as text.
- **Setup.** A budget reference of 0 on a line (needs the savings configuration edited on the stage).
- **Steps.** Read savings.
- **Expected.** No percentage (blank), never "Infinity" / "NaN".
- **Oracle.** INV-SANE.
- **Trace.** P1 · automate-later · `app/controllers/concerns/utils.rb:907-911`

## 7. Decimal places and currency

#### EVI-PREC-001 — Money columns use the company's decimal places
- **Why it matters.** PROCOL DEMO shows 4 places, Demo Account 2 shows 2; the same template must follow each company.
- **Setup.** A fresh stage on each client.
- **Steps.** Read the stage's widget precision and the company's setting.
- **Expected.** Price, GST and line total at the company's places.
- **Oracle.** PRECISION.
- **Trace.** P1 · automate · S1 · `PRECISION` · `app/controllers/concerns/trade_template_helper.rb:1816-1829`

#### EVI-CUR-001 — A foreign-currency bid is converted to base at the stage's rate
- **Why it matters.** Comparing a USD bid with an INR bid needs the rate the buyer set; base = amount × rate.
- **Setup.** A client with multi-currency enabled; stage rates INR 1, USD 83.25; one vendor bids in USD.
- **Steps.** Read the comparison in base currency.
- **Expected.** Every USD figure × 83.25, rounded only for display.
- **Oracle.** `toBase()` of the calculator vs the comparison.
- **Trace.** P1 · manual · `app/controllers/concerns/utils.rb:257-261; app/models/bid_trade_product.rb:344-380` (neither QA client has multi-currency on)

#### EVI-CUR-002 — Multi-currency line totals are rounded per line before the sum
- **Why it matters.** The single-currency path does not round; the two paths can disagree by a few paise on many-line bids.
- **Setup.** As EVI-CUR-001 with 60 lines.
- **Steps.** Compare Σ rounded line totals with the bid total.
- **Expected.** The bid total equals the exact sum (to the shown places).
- **Oracle.** INV-BID.
- **Trace.** P2 · manual · `app/models/bid_trade_product.rb:379`

#### EVI-CUR-003 — Exchange rates cannot change once bids are in
- **Why it matters.** Changing the rate after bidding re-ranks bids silently.
- **Setup.** Multi-currency stage with a bid.
- **Steps.** Try to change the rate.
- **Expected.** Refused.
- **Oracle.** 422.
- **Trace.** P1 · manual · `app/controllers/api/v1/trade_controller.rb:1466-1496`

## 8. Award values

#### EVI-AWD-001 — Award value per vendor = awarded quantity × that vendor's unit price
- **Why it matters.** The award proposal is what gets approved and ordered.
- **Setup.** A split award (covered live by the round-3 deep-dig scenarios S1/S3).
- **Steps.** Read the proposal values.
- **Expected.** The calculator's `awardTotals()`.
- **Oracle.** proposal_values vs awardTotals.
- **Trace.** P0 · automate-later · `app/helpers/api/proposal_helper.rb:974-1121`

#### EVI-AWD-002 — A tied L1 vendor's award counts as L1
- **Why it matters.** The rank shift on ties makes every tied vendor "not L1", moving their award into "non-L1".
- **Setup.** Two vendors tied at the best price; award one of them.
- **Steps.** Read total_l1_proposal / total_non_l1_proposal.
- **Expected.** The awarded line counts as L1.
- **Oracle.** proposal_values.
- **Trace.** P1 · automate-later · `app/helpers/api/proposal_helper.rb:984-1001; app/models/concerns/bid_trade_product_rank_helper.rb:270`

## 9. What vendors can see

#### EVI-ISO-001 — A vendor's own views carry no competitor's prices or company ids
- **Why it matters.** On a sealed RFQ a vendor who sees rivals' prices can undercut by a rupee; this breaks the tender.
- **Setup.** Three QA vendors bid on a fresh RFQ.
- **Steps.** Each vendor reads the stage and its page data through its own app.
- **Expected.** Nothing of another vendor: no name, company id, unit price, line total or bid total.
- **Oracle.** INV-ISOLATION.
- **Trace.** P0 · automate · S1, S3–S5 · `INV-ISOLATION` · `app/models/bid_trade_product.rb:121-131; app/controllers/concerns/trade_template_helper.rb:722-761`

#### EVI-ISO-002 — Isolation holds on a charges template
- **Why it matters.** Same as EVI-ISO-001, with bid-level charges also private.
- **Setup.** S2.
- **Steps.** As EVI-ISO-001.
- **Expected.** Nothing of another vendor.
- **Oracle.** INV-ISOLATION.
- **Trace.** P0 · automate · S2 · `INV-ISOLATION`

#### EVI-ISO-003 — Isolation in a rank auction (only the vendor's own rank)
- **Why it matters.** Rank auctions may show rank, never prices.
- **Setup.** S6.
- **Steps.** As EVI-ISO-001.
- **Expected.** Own rank only.
- **Oracle.** INV-ISOLATION.
- **Trace.** P0 · automate · S6 · `INV-ISOLATION`

## 10. Reports

#### EVI-REP-001 — The comparison report (Excel) shows the same figures as the screen
- **Why it matters.** Buyers forward the Excel to approvers; it must match the screen.
- **Setup.** S1 bids.
- **Steps.** Download the RFQ comparison report and read each vendor's block.
- **Expected.** Each vendor's unit prices, line totals and bid total are present.
- **Oracle.** INV-REPORT.
- **Trace.** P0 · automate · S1 · `INV-REPORT` · `app/controllers/api/reports_controller.rb:105-152`

#### EVI-REP-002 — The report after the close matches the screen after the close
- **Why it matters.** Reports read the stored savings copy; it must equal the live one.
- **Setup.** S1 after the close.
- **Steps.** As EVI-REP-001.
- **Expected.** Same.
- **Oracle.** AFTER-CLOSE + INV-REPORT.
- **Trace.** P1 · automate · S1 · `AFTER-CLOSE`

#### EVI-REP-003 — The report on a charges template carries the bid totals
- **Why it matters.** Charges and tax on the total must reach the Excel.
- **Setup.** S2.
- **Steps.** As EVI-REP-001.
- **Expected.** Same totals.
- **Oracle.** INV-REPORT.
- **Trace.** P1 · automate · S2 · `INV-REPORT`

#### EVI-REP-004 — The report's best net price is the cheapest price after tax
- **Why it matters.** See EVI-RANK-008.
- **Setup.** S4.
- **Steps.** Read "Best Net Price" for line 2.
- **Expected.** ₹110.25.
- **Oracle.** REPORT-L1.
- **Trace.** P1 · automate · S4 · `REPORT-L1`

#### EVI-REP-005 — An unknown report type is refused, not a server crash
- **Why it matters.** An untyped 500 is always a defect.
- **Setup.** A stage with bids.
- **Steps.** Ask for the comparison report with report type "excel_report".
- **Expected.** HTTP 422 with a message, never 500.
- **Oracle.** Status.
- **Trace.** P3 · manual · `app/models/report.rb:24 (report_type enum has no excel value); app/controllers/concerns/reports_controller_helper.rb (save_report_and_get_id)`

#### EVI-REP-006 — PDF reports
- **Why it matters.** Event detailed / summary PDFs carry the same figures.
- **Setup.** Any closed stage.
- **Steps.** Download the PDF.
- **Expected.** Same figures as the screen.
- **Oracle.** Not automated: no reliable PDF text extraction in the repo.
- **Trace.** P2 · manual
