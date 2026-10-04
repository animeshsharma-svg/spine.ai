# Bid money, ranking, bid lists and award records — rule cases

Cases for the rules of the bid, bid-line and award-proposal models that no written case checked yet, extracted from
`prototype/knowledge/events/backend-digest/models-bids-proposals.md`. Each case names its rule (`R-MBP-…`,
`prototype/data/rules/events-rules.json`) and the line of `procol-backend` (origin/main ae36e86894) that makes it true. The
everyday totals — line total, GST slabs, discount on the line sum, sub total, the same total everywhere, totals sent by a vendor's
app being recomputed, a draft never counting, a discount above 100 % — are already checked by `events-integrity.md` (EVI-LINE,
EVI-TAX, EVI-CHG, EVI-TOT) and are not repeated; the cases below test the edges those do not reach. None of these has a runnable
twin: each needs bids from two vendors, a template setting or an award, which the case runner's sandbox does not have.

Worked numbers assume a buy (reverse) event and two decimals unless the case says otherwise.

## 1. Freight, discount and tax edges

#### API-EVRMBP-001 — Freight on a single-product bid is per unit below 20 and a lump sum from 20
- **Why it matters.** The model guesses whether freight was typed per unit or as a total by its size; one paisa decides whether a bid's freight is 19.99 or 1,999 — enough to change L1.
- **Setup.** Single-product price round (the one-line, non-sheet layout), buyer quantity 100. Vendor A quotes 50 per unit with freight 19.99; vendor B quotes 50 per unit with freight 20.
- **Steps.** Submit both bids; read each bid's freight total and landed total on the comparison.
- **Expected (today).** A: freight 19.99 × 100 = 1,999, landed 6,999. B: freight 20 (lump sum), landed 5,020 — B is L1 although it charges more freight per unit. The product should apply one documented rule (per unit or lump sum) whatever the amount.
- **Oracle.** Bid `price_breakup_json.total_global_freight_charges` A = 1999.0, B = 20.0; `total_freight_charges` follows. Threshold `< 20.0` at `bid.rb:1026`.
- **Trace.** P0 · manual · `R-MBP-005-2` `R-MBP-005-3` `R-MBP-005-4` `R-MBP-005-5` · `app/models/bid.rb:1020-1030`

#### API-EVRMBP-002 — The freight shown on a single bid follows the same rule as the stored freight
- **Why it matters.** The single-bid view divides freight above 20 by the quantity and leaves smaller values as they are — the inverse of how it was stored — so the vendor and buyer read a different freight than the one totalled.
- **Setup.** Same bids as API-EVRMBP-001.
- **Steps.** Open each bid's detail.
- **Expected.** The freight per unit and total shown agree with the stored breakup (A 19.99/unit = 1,999; B 20 total = 0.20/unit).
- **Oracle.** NewBidSerializer `freight_charges`: multi-product as stored; else value > 20 divided by quantity; else as stored (`new_bid_serializer.rb:196-203`) — compare with `price_breakup_json`.
- **Trace.** P2 · manual · `R-VIS-041-5` `R-MBP-008-4` · `app/serializers/new_bid_serializer.rb:196-203`

#### API-EVRMBP-003 — Line landed cost: price plus positive GST minus the line cash discount plus line freight
- **Why it matters.** The per-unit landed cost feeds the line rank on landed-cost stages; a negative GST or a missing discount changes who is L1.
- **Setup.** Sheet price round, line with buyer quantity 10. Vendor quotes price 100, GST 18 %, line cash discount 2 %, line freight 5; a second line with GST entered as −5.
- **Steps.** Submit; read the line breakup.
- **Expected.** Line 1 landed cost = 100 + 18 − 2 + 5 = 121 per unit (1,210 total); without cash discount 123. Line 2: the negative GST adds nothing (landed = price + freight).
- **Oracle.** Bid line `final_price` = 121.0; `landed cost without CD` = 123.0; line 2 `applicable_gst` = 0 (`gst > 0` guard).
- **Trace.** P1 · automate-later · `R-MBP-012-2` `R-MBP-012-3` `R-MBP-012-4` · `app/models/bid_trade_product.rb:287-298`

#### API-EVRMBP-004 — Bid-level GST and line GST do not double-count
- **Why it matters.** The bid keeps two GST figures: one from the bid's own GST field over the landed total, one summed from the lines; the lot GST adds both, so a vendor that fills both is taxed twice.
- **Setup.** Charges template where both a bid-level GST field and line GST exist; vendor quotes two lines (1,000 at 18 % and 500 at 5 %) and also fills bid GST 18 %.
- **Steps.** Read the bid's tax amounts and lot GST on the comparison.
- **Expected.** One tax total for the bid (205 if lines carry the tax; the bid field should not add another 18 % of the landed total).
- **Oracle.** `gst_tax_amount` (bid column) + `gst_tax_order_total` (lines) = `lot_gst`; today both are added (`bid.rb:1014-1017`). Also `Bid#gst` returns the FIRST line's GST while `gst_tax_amount` reads the column (`bid.rb:845-847`).
- **Trace.** P1 · manual · `R-MBP-003-1` `R-MBP-003-2` `R-MBP-003-3` `R-MBP-003-6` · `app/models/bid.rb:845-847, 1014-1017`

#### API-EVRMBP-005 — The cash-discount text reads "X% for N days." only when both are given
- **Why it matters.** A discount without its credit days (or days without a rate) must not print a half sentence on the comparison and the PO.
- **Setup.** Two vendors: A gives discount 2 with 30 days; B gives discount 2 and no days.
- **Steps.** Read the cash-discount column for both.
- **Expected.** A: "2.0% for 30 days." B: blank.
- **Oracle.** `display_cash_discount` (`bid.rb:1371-1375`).
- **Trace.** P3 · manual · `R-MBP-004-5` `R-MBP-001-2` · `app/models/bid.rb:954-957, 1371-1375`

## 2. Formulas on the bid

#### API-EVRMBP-006 — A field the vendor leaves blank in a formula takes the buyer's value, then zero
- **Why it matters.** Totals silently built from the buyer's default (or 0) can make a bid look cheaper than what the vendor meant.
- **Setup.** Template line formula total = (price + packing) × quantity; the buyer filled packing = 5 on line 1 and nothing on line 2. Vendor quotes price 100, quantity 10, and leaves packing blank on both.
- **Steps.** Submit; read both lines' totals.
- **Expected.** Line 1 = (100 + 5) × 10 = 1,050; line 2 = (100 + 0) × 10 = 1,000. The screen should show the vendor which values were filled for it.
- **Oracle.** Line totals 1050.0 / 1000.0 (fallback to creator widget, then 0: `bid_trade_product.rb:421-430, 323-334`).
- **Trace.** P1 · manual · `R-MBP-014-2` `R-MBP-014-3` `R-MBP-014-4` · `app/models/bid_trade_product.rb:400-442`

#### API-EVRMBP-007 — A bid whose total formula cannot be computed is not saved with a missing total
- **Why it matters.** When a global formula fails, the error goes only to the error tracker and the bid is saved without that figure; the comparison then ranks a bid with no total.
- **Setup.** Template whose global total formula refers to a field that does not exist on this stage (a template edit gone wrong).
- **Steps.** Vendor submits a bid; buyer opens the comparison.
- **Expected.** The submission is refused with a clear error, or the total is computed; a bid without its total must not be listed or ranked.
- **Oracle.** Today the save continues with the key missing (`bid.rb:1200-1205`); the bid's `price_breakup_json` lacks the formula key.
- **Trace.** P1 · manual · `R-MBP-007-6` · `app/models/bid.rb:1105-1126, 1200-1205`

#### API-EVRMBP-008 — A multi-currency stage without a total widget still opens and ranks
- **Why it matters.** The multi-currency total reads the total widget's configuration without a guard; a template without it breaks every screen that needs a bid total.
- **Setup.** Multi-currency price round on a template with no gross-total global widget; one vendor bids in USD.
- **Steps.** Open the comparison and the vendor's bid.
- **Expected.** Both open; the bid total is the sum of line totals in the base currency.
- **Oracle.** No 500; today `Bid#gross_total` does `nil['configuration']` (`bid.rb:1272-1273`).
- **Trace.** P1 · manual · `R-MBP-009-4` `R-MBP-009-5` · `app/models/bid.rb:1231-1273`

#### API-EVRMBP-009 — With automatic cash discount, every line is priced on its effective price — and a line without the discount data does not crash
- **Why it matters.** Auto cash discount reduces each line by a notional amount; a line saved without that data makes the whole bid fail.
- **Setup.** gate: `allow_auto_cd` on a buy stage; vendor quotes two lines, price 100 each, notional discount 3 on line 1; line 2 saved without auto-discount data (e.g. added after the setting changed).
- **Steps.** Submit; read effective prices and the bid's rank score.
- **Expected.** Line 1 effective price 97; line 2 effective price 100; the bid ranks on Σ effective amounts; no error.
- **Oracle.** `effective_price` = price − `auto_cd_hash.notional_2`; today a line without `auto_cd_hash` raises in `effective_total_amount` (`bid_trade_product.rb:494-501`).
- **Trace.** P1 · manual · `R-MBP-015-1` `R-MBP-015-2` `R-MBP-015-3` `R-MBP-015-4` · `app/models/bid_trade_product.rb:490-505`

## 3. What a rank is computed on

#### API-EVRMBP-010 — Without a ranking setting, a line is ranked on the unit price, not on the landed cost
- **Why it matters.** Testers and buyers expect "L1" to be the cheapest landed cost; on a template with no ranking configuration the line rank uses the base price, so a high-tax quote can be L1.
- **Setup.** Sheet price round closed per line, no ranking widget configured. Vendor A: price 100, GST 28 % (landed 128). Vendor B: price 105, GST 5 % (landed 110.25).
- **Steps.** Read the line ranks.
- **Expected (today).** A is line L1 (100 < 105) although B is cheaper landed. Record which basis the buyer's screen labels; if it says "landed" the rank contradicts it.
- **Oracle.** Line rank key = `price` when no `ranking_widget_line`/`ranking_widget` (`trade_request_model_helper.rb:828-838`); bid (lot) rank on `gross_total`.
- **Trace.** P1 · automate-later · `R-MBP-018-1` `R-MBP-018-2` `R-MBP-018-5` · `app/models/model_helpers/trade_request_model_helper.rb:820-838`

#### API-EVRMBP-011 — Every vendor on a line is ranked on the same field
- **Why it matters.** When the ranking field is empty on one vendor's line, that vendor falls back to base price or landed cost while the others are ranked on the field — two units in one ranking.
- **Setup.** Line ranking on a "total cost of ownership" field; vendor A fills it (950), vendor B leaves it blank with price 900 (landed 1,000).
- **Steps.** Read the line ranks.
- **Expected.** B is either ranked on the same field (treated as missing → unranked/last) or the bid is refused for the missing field; never compared 900 against 950.
- **Oracle.** Today B's score = its landed/base price (`bid_trade_product_rank_helper.rb:147-158`) → B rank 1.
- **Trace.** P1 · manual · `R-MBP-019-1` `R-MBP-019-2` `R-MBP-019-5` · `app/models/concerns/bid_trade_product_rank_helper.rb:140-160`

#### API-EVRMBP-012 — Ranks round to the field's precision — including a precision of 0
- **Why it matters.** Two quotes that display the same must tie; with precision 0 no rounding happens, so 100.4 beats 100.6 though both show "100".
- **Setup.** Single-currency auction whose ranking field has 0 decimals; vendor A 100.4, vendor B 100.6. Repeat with 2 decimals and 100.004 / 100.006.
- **Steps.** Read the ranks.
- **Expected.** Precision 0: A and B tie (both shown 100, the tie rule applies). Precision 2: 100.004 and 100.006 round to 100.00 and 100.01 — A rank 1.
- **Oracle.** Today precision 0 skips rounding (`bid_rank_helper.rb:172`: `precision > 0`) → A rank 1, B rank 2 while both display 100.
- **Trace.** P1 · automate-later · `R-MBP-020-1` `R-MBP-020-2` `R-MBP-020-4` · `app/models/concerns/bid_rank_helper.rb:149-176`

#### API-EVRMBP-013 — Weighted ranking adds each vendor's weight to its line score
- **Why it matters.** Weights encode the buyer's preference (quality, payment terms); the rank must move by exactly the weight.
- **Setup.** Weighted RFQ/auction; vendor A weight 10, vendor B weight 0; line prices A 95, B 100.
- **Steps.** Read the line ranks and scores.
- **Expected.** A's score 105, B's 100 → B is rank 1.
- **Oracle.** Line score = price score + `weighted_total` (`bid_trade_product.rb:1240-1252`); the best price stored is still the line price (A 95).
- **Trace.** P1 · manual · `R-MBP-019-3` `R-MBP-019-4` `R-MBP-021-2` · `app/models/bid_trade_product.rb:1240-1252` · `app/models/concerns/bid_trade_product_rank_helper.rb:106, 164-173`

#### API-EVRMBP-014 — The rank sent to approval rules on a line-closing stage is the worst line rank
- **Why it matters.** Approval rules like "awarding a non-L1 bid needs the CFO" read one rank per bid; on per-line stages that is the worst line, so a bid that is L1 on nine lines and L2 on one needs the CFO.
- **Setup.** Price round closed per line, approval flow with a condition "bid rank > 1"; vendor A is L1 on line 1 and L2 on line 2.
- **Steps.** Award A on both lines; read which approval flow applies.
- **Expected.** The "rank > 1" flow applies (rank sent = 2). Record this as the documented behaviour.
- **Oracle.** Approval data `bid_rank` = max of line ranks (`bid.rb:1624-1630`).
- **Trace.** P2 · manual · `R-MBP-024-1` `R-MBP-024-2` · `app/models/bid.rb:1620-1660`

## 4. Rank-change notices and late extensions

#### API-EVRMBP-015 — When a vendor's own revision drops it down the ranking, the vendors who moved up are told
- **Why it matters.** "Your rank has changed" brings vendors back into a live auction. It is sent to the vendors holding the ranks between the reviser's new and old rank, and that range is empty when the reviser got worse, so nobody hears that they moved up.
- **Setup.** Live rank auction, price increase allowed, rank-change notifications on. Vendor A 100 (L1), vendor B 110 (L2), the QA vendor 120 (L3).
- **Steps.** 1. Vendor B revises to 90: B becomes L1, A L2 — control. 2. Vendor A then revises to 130: B stays L1, the QA vendor moves to L2, A drops to L3. 3. Read A's, B's and the QA vendor's notifications after each step.
- **Expected.** Step 1: A is told its rank changed. Step 2: the QA vendor (moved up) and A (moved down) are told.
- **Oracle.** `rank_change` notifications. Step 1 passes today (range 1..2). Step 2 today: range `3..2` is empty (`bid.rb:310`), so no notification — the defect.
- **Trace.** P1 · manual · `R-MBP-026-2` `R-MBP-026-3` `R-MBP-026-4` · `app/models/bid.rb:284-320`

#### API-EVRMBP-016 — A revision counts as a rank change against the vendor's own previous bid, whoever placed it
- **Why it matters.** The previous rank is looked up by user, not company; when a colleague placed the earlier bid every revision counts as "changed", which feeds approvals and notifications.
- **Setup.** Vendor company with two users; user 1 bids 100 (L1); user 2 revises to 99 (still L1).
- **Steps.** Read the bid's change timeline / rank-change flag.
- **Expected.** Not a rank change (L1 → L1).
- **Oracle.** Today old rank = 500000 because no revised bid of user 2 exists (`bid_rank_helper.rb:259-271`) → `is_rank_changed?` true; `meta_data.change_timeline` shows a change.
- **Trace.** P2 · manual · `R-MBP-025-1` `R-MBP-025-2` `R-MBP-025-3` `R-MBP-025-4` `R-MBP-027-6` · `app/models/concerns/bid_rank_helper.rb:247-271`

#### API-EVRMBP-017 — Rejecting the L1 bid in the last three minutes extends the auction as documented
- **Why it matters.** The code means to extend the auction when the leading bid is rejected or revoked near the end (so others can react), but compares the wrong record and never does.
- **Setup.** Live auction with "update end time on late bid" on, not dynamic closing; vendor A is L1; 2 minutes left.
- **Steps.** The buyer rejects A's bid (or A revokes it). Read the end time.
- **Expected.** End time extended by the configured minutes (default 3).
- **Oracle.** Today no extension: `.index(self)` looks for the BidTrade in a list of Bids → always nil (`bid_trade.rb:151-153`).
- **Trace.** P1 · manual · `R-MBP-030-1` `R-MBP-030-2` · `app/models/bid_trade.rb:145-157`

## 5. Which bids a list shows

#### API-EVRMBP-018 — The stage's bid count matches the bids the buyer can see
- **Why it matters.** The count includes bids hidden from the list (another user's draft, a surrogate bid awaiting its creation approval); "3 bids" over a list of 2 makes buyers distrust the screen.
- **Setup.** Live RFQ: two vendor bids, plus one surrogate bid pending creation approval.
- **Steps.** As the buyer read the bid count and the bids list.
- **Expected.** Count 2 = bids listed (or the pending one is listed and labelled).
- **Oracle.** Today `increment_active_bids_count` runs for every bid that is not revised/revoke/rejected (`bids_group.rb:127-128`), after the visibility filter decided not to list it (`:119-123`).
- **Trace.** P2 · manual · `R-MBP-033-7` `R-MBP-033-4` `R-MBP-033-5` · `app/models/bids_group.rb:100-141`

#### API-EVRMBP-019 — The event page shows the top four live bids; quote details show the full history
- **Why it matters.** Two lists with different rules; a tester comparing them must know which statuses each holds.
- **Setup.** Live RFQ with six vendors bidding (one revised, one rejected).
- **Steps.** Open the event page bid block and one vendor's quote details.
- **Expected.** Event page: four bids, only active/awarded/pending-approval, best first. Quote details: active, revised, awarded, pending-approval and approval-requested bids; rejected not shown.
- **Oracle.** `bids_group.rb:33-38, 194-196`.
- **Trace.** P2 · automate-later · `R-MBP-033-2` `R-MBP-033-3` · `app/models/bids_group.rb:27-38, 194-196`

#### API-EVRMBP-020 — A vendor's draft bid is visible only to the user who started it
- **Why it matters.** Drafts are a vendor's work in progress; neither the buyer nor the vendor's colleagues should see them.
- **Setup.** Vendor user 1 saves a draft (not submitted) on a live round.
- **Steps.** Read the bid lists as the buyer, as vendor user 2 (same company), and as vendor user 1.
- **Expected.** Only user 1 sees the draft.
- **Oracle.** Draft listed only when `show_draft_bid` and `bids.user_id = current user` (`bids_group.rb:27-32`).
- **Trace.** P1 · automate-later · `R-MBP-033-1` · `app/models/bids_group.rb:27-32`

#### API-EVRMBP-021 — With company profiles hidden, vendor names appear only on the awarded bid and the viewer's own
- **Why it matters.** "Show company profile" off is a lighter masking; it must hold everywhere except where the name is needed.
- **Setup.** gate: `show_company_profile` off, and vendor communication off; three vendors bid; one is awarded.
- **Steps.** As the buyer read the bids list.
- **Expected.** Names and the message button only on the awarded bid.
- **Oracle.** `show_company_name` false except selected/own bid; `is_communication_allowed` false except selected (`bids_group.rb:480-492`). The bid-level profile switch is hard-coded on (`bid.rb:810-830`), so only the stage switch hides names.
- **Trace.** P2 · manual · `R-MBP-034-1` `R-MBP-034-2` `R-MBP-034-5` · `app/models/bids_group.rb:480-492`

#### API-EVRMBP-022 — Quick revise is offered only to the bid's own side, on a running stage that is not knockout or dutch
- **Why it matters.** Quick revise changes a bid in one click; offered to the wrong person (another vendor, or on a knockout round) it lets someone alter a price that is not theirs.
- **Setup.** Running RFQ with the QA vendor's normal bid and a surrogate bid placed for vendor B; a running knockout auction; a closed RFQ.
- **Steps.** Read the quick-revise flag on each bid as the QA vendor, as a colleague of the QA vendor, and as the buyer.
- **Expected.** Normal bid: offered to the bid's owner and colleagues of the same company only. Surrogate bid: only to a viewer whose companies include vendor B. Never on knockout/dutch or a closed stage.
- **Oracle.** Quick-revise flag per `bids_group.rb:503-511`.
- **Trace.** P2 · manual · `R-MBP-034-3` · `app/models/bids_group.rb:503-511`

## 6. Award approvals and award records

#### API-EVRMBP-023 — A rejected award approval puts the bid where the approval setting says
- **Why it matters.** After a rejected award the bid must return to a known state: back to active (default), rejected, or back to the previous approver.
- **Setup.** gate: `handle_approval_rejection_as`. An award approval flow; three runs with the rejection handling set to "make active again", "reject the bid" and "send back to the previous approver".
- **Steps.** Award a bid; the approver rejects; read the bid and line statuses.
- **Expected.** Make active again → the bid and its lines are active; reject → rejected; send back → waiting for approval again, with the previous approver to act.
- **Oracle.** `bid.rb:2010-2027`.
- **Trace.** P1 · manual · `R-MBP-041-4` `R-MBP-041-3` · `app/models/bid.rb:1981-2027`

#### API-EVRMBP-024 — An award approval that expires or is withdrawn releases the bid and forgets the awarded quantities
- **Why it matters.** A stale "awarded 60 of 100" kept on a released bid would be reused by the next award.
- **Setup.** Standalone RFQ, partial award (60 units) sent for approval.
- **Steps.** Withdraw the approval (or let it expire); read the bid.
- **Expected.** Bid and lines active again; no awarded quantities stored.
- **Oracle.** Bid `meta_data.awarded_quantities` removed (`bid.rb:2043-2055`); the withdraw response must not hide an error from the afterflow (`approval_requests_controller.rb:187-189`).
- **Trace.** P1 · manual · `R-MBP-041-5` `R-MBP-049-6` · `app/models/bid.rb:2043-2055`

#### API-EVRMBP-025 — Partial award at approval: zero, negative or more than what is left is refused with an accurate message
- **Why it matters.** On standalone events the awarded quantity is checked at approval; the refusal says "more than requested" even for 0 or −5.
- **Setup.** Standalone RFQ, line quantity 100, 40 already awarded.
- **Steps.** Send for approval awards of 0, −5, 61 and 60.
- **Expected.** 0, −5 and 61 refused (60 accepted). The message for 0/−5 should say the quantity must be positive.
- **Oracle.** HTTP 422 code 561 'You cannot select bid with more than requested quantity.' for all three (`bids_controller_helper.rb:2183-2197`); Σ awarded rounded to 6 dp compared with remaining; a line with remaining nil is not checked.
- **Trace.** P1 · manual · `R-MBP-042-1` `R-MBP-042-3` `R-MBP-042-4` `R-MBP-042-6` · `app/controllers/concerns/bids_controller_helper.rb:2183-2215` · code 561

#### API-EVRMBP-026 — A vendor awarded zero is not an awarded vendor
- **Why it matters.** A zero quantity left on a vendor's line (after un-awarding) still makes it "awarded" for the letter of award, so the vendor can receive an LOA for nothing.
- **Setup.** Award proposal: vendor A 100 units, vendor B set to 0 (selected then reduced to 0).
- **Steps.** Submit with "send letter of award"; read who gets an LOA.
- **Expected.** Only A.
- **Oracle.** Today `awarded_vendor_company_ids` includes B (`awarded_quantity.present?` is true for 0, `proposal.rb:527-535`).
- **Trace.** P1 · manual · `R-MBP-047-1` `R-MBP-047-2` `R-MBP-047-6` `R-MBP-047-3` · `app/models/proposal.rb:495-535`

#### API-EVRMBP-027 — On a lot event, the award quantities of one lot never come from another lot's proposal
- **Why it matters.** A lookup with no lot number matches every proposal, so a bid can pick up awarded quantities from a different lot.
- **Setup.** Event split into lots 1 and 2; proposal for lot 1 selected (vendor A 50 units); vendor A also bid in lot 2.
- **Steps.** Read vendor A's awarded quantities on lot 2.
- **Expected.** None on lot 2.
- **Oracle.** `Bid#get_egli_vs_awarded_quantity_hash` with nil lot uses the `lot_no` scope that matches all (`proposal.rb:44`, `bid.rb:727-728`).
- **Trace.** P2 · manual · `R-MBP-045-5` · `app/models/proposal.rb:44` · `app/models/bid.rb:720-730`

#### API-EVRMBP-028 — Sending an award for approval gives the process validators view access; approvers added later get edit access
- **Why it matters.** Who can open the event after award is decided by these side effects, not by the team setup.
- **Setup.** Company with a process-validator team; award proposal with an approval flow; an approver step added after submission.
- **Steps.** Submit the proposal; add an approver; open every stage as a process validator and as the added approver; withdraw the proposal and repeat.
- **Expected.** While active/requested/selected: validators can view every stage, the added approver can edit. After withdrawal the validators' access is removed.
- **Oracle.** Stage access lists: validator viewer access on active/requested/selected, removed on other non-draft statuses (`proposal.rb:93-114`); approver editor access on added steps, notification only for additions (`proposal.rb:783-820`).
- **Trace.** P2 · manual · `R-MBP-046-5` `R-MBP-049-3` `R-MBP-049-5` · `app/models/proposal.rb:93-114, 783-832`

#### API-EVRMBP-029 — Awarding the same bid twice within three seconds is refused once, not done twice
- **Why it matters.** A double click on Award creates two POs unless the short lock holds.
- **Setup.** RFQ with multiple PO per bid on; one active bid.
- **Steps.** Send the award twice within one second.
- **Expected.** One award; the second refused "Transaction in Progress".
- **Oracle.** Second call HTTP 422 code 516; one PO entry (`bid_multiple_po_helper.rb:36-46`). If the first call fails mid-way the lock is not released for 3 s (gap) — a retry inside 3 s is refused.
- **Trace.** P2 · manual · `R-MBP-043-1` `R-MBP-043-3` `R-MBP-043-5` · `app/controllers/concerns/bid_multiple_po_helper.rb:36-50` · code 516

#### API-EVRMBP-030 — A bid placed more than three minutes after the end is marked as negotiated offline
- **Why it matters.** Bids the buyer enters after close (offline negotiation) are labelled so reports keep them apart from live bidding.
- **Setup.** Closed RFQ in evaluation; the buyer adds a surrogate bid 5 minutes after the end, another 2 minutes after.
- **Steps.** Read both bids' labels on the comparison/report.
- **Expected.** The 5-minute one is "offline negotiated", the 2-minute one is not.
- **Oracle.** `is_offline_negotiated?` = created_at > bid_end_time + 3 min (`bid.rb:631-633`).
- **Trace.** P3 · manual · `R-MBP-037-6` · `app/models/bid.rb:631-633`
