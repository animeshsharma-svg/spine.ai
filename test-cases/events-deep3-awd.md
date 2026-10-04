# Award outcomes — splitting an award, the numbers on it, changing it, and what the winner sees

Deep cases for building an award (an award proposal) after real competition: splitting one line between several
vendors, awarding different lines to different vendors, changing quantities, taking a vendor off and putting it back,
and — above all — whether every amount the proposal shows is exactly what the bids say. Every number a runnable case
checks is computed from what that run itself submitted (unit price × awarded quantity), never typed in advance.
Grounded in `procol-backend` at `origin/main` ae36e86894 (paths below are relative to that repo). Cases whose Trace
names an `EVD3-…` scenario are run by `prototype/scripts/run-deep3.ts` on their OWN fresh event with the client's QA
vendors; a failure counts only if the same step fails again on a second fresh event.

**Read before running.** Awarding is buyer-console only (`config/app_auth_config.yml`, proposal controller). Partial
awarding (`is_partial_awarding_enabled`) is ON at PROCOL DEMO 198678 and OFF at Demo Account 2 32461 (read 2026-10-03
from `custom_configurations` / `master_configurations`); over-awarding is off at both. Cases that split one line need
partial awarding on; the 32461 variants are written separately.

## 1. Splitting and the award's numbers

#### API-EVDAWD-001 — One line split between three vendors adds up to the line's quantity
- **Why it matters.** Splitting a line between suppliers is the everyday way to spread supply risk; if the split is refused or silently altered the buyer cannot award as decided.
- **Setup.** gate: `is_partial_awarding_enabled`. A closed RFQ, one line of 30 units; QA vendors 1, 2 and 3 have live bids (vendors 1 and 2 tied at the best price, vendor 3 higher).
- **Steps.** 1. Open an award. 2. Award 15 units to QA vendor 2, 10 to QA vendor 1 and 5 to QA vendor 3 in one change.
- **Expected.** Accepted; the proposal holds the three vendors with exactly 15, 10 and 5 units.
- **Oracle.** `POST /proposal`, then `POST /proposal/:id/add_response` 200; `proposals.responses_hash.data[<vendor>].egli_data[<line>].awarded_quantity` = 15 / 10 / 5.
- **Trace.** P0 · automate · `EVD3-S1` · `app/helpers/api/proposal_helper.rb:40-72, 836-837`

#### API-EVDAWD-002 — Each vendor's awarded amount is its awarded quantity times its own price
- **Why it matters.** The award amount per vendor is what the approver signs off and what the vendor is promised; if it counts the vendor's whole quote instead of the awarded share, the approval is for the wrong money.
- **Setup.** As API-EVDAWD-001, after the split.
- **Steps.** 1. Read the award back. 2. For each vendor compare the amount with awarded quantity × that vendor's unit price.
- **Expected.** QA vendor 2: 15 × its price; QA vendor 1: 10 × its price; QA vendor 3: 5 × its price — to the paisa.
- **Oracle.** `proposals.responses_hash.data[<vendor company id>].total_amount` equals Σ awarded_quantity × unit price. Code reading: without a master comparison "proposal value" formula or a round `proposal_value_source`, the per-line value is the bid line's full gross total, whatever quantity is awarded. Live 2026-10-03: correct at 198678 and 32461 on add (a value formula applies); the fallback bites on remove — see API-EVDAWD-005.
- **Trace.** P0 · automate · `EVD3-S1` · `app/helpers/api/proposal_helper.rb:974-1030` (`get_po_value_to_be_added` falls back to `btp.gross_total`), `:1090-1120`

#### API-EVDAWD-003 — The award's total value is the sum of what each vendor was awarded
- **Why it matters.** Approval routing uses the total (flows are chosen by rules such as "total value ≥ 1"); a wrong total sends the award to the wrong approvers and shows the wrong spend.
- **Setup.** As API-EVDAWD-001.
- **Steps.** 1. Open the award as the buyer and read its total value.
- **Expected.** Total = (15 + 10) × the tied best price + 5 × QA vendor 3's price.
- **Oracle.** `GET /proposal/:id` → `proposal_values.total_proposal_value` (formatted) equals the computed total; stored `meta_data.total_l1_proposal + total_non_l1_proposal` likewise.
- **Trace.** P0 · automate · `EVD3-S1` · `app/serializers/proposal_serializer.rb` (proposal_values) · `app/helpers/api/proposal_helper.rb:1090-1120`

#### API-EVDAWD-004 — Vendors tied at the best price count as best-price (L1) awards
- **Why it matters.** The L1 / non-L1 split is how a buyer justifies an award; two vendors quoting the same lowest price are both the lowest bidder, and showing their share as "not L1" invites an audit question that has no basis.
- **Setup.** As API-EVDAWD-001 (QA vendors 1 and 2 tied at the best price). On 32461: the whole line to one of two tied vendors.
- **Steps.** 1. Read the award's "awarded to L1" and "awarded to others" amounts.
- **Expected.** The tied vendors' shares are counted as L1; only QA vendor 3's share is "others".
- **Oracle.** `proposal_values.total_l1_proposal` = Σ shares of vendors holding the best price. Code reading: a vendor counts as L1 only when its line rank equals 1, and a tie at the best price shifts every rank by one (both tied leaders are rank 2) — so tied leaders are suspected to be counted as non-L1.
- **Trace.** P1 · automate · `EVD3-S1` · `app/helpers/api/proposal_helper.rb:994-1001` · `app/models/concerns/bid_rank_helper.rb:215-218`

#### API-EVDAWD-005 — Taking a vendor off the award removes exactly its amount, and putting it back restores it
- **Why it matters.** Buyers rework an award several times before submitting; totals that drift after a remove/add cycle make the final number untrustworthy.
- **Setup.** As API-EVDAWD-001 (198678), or the whole line awarded to one vendor (32461).
- **Steps.** 1. Take QA vendor 3 off the award. 2. Read the totals. 3. Put QA vendor 3 back with 5 units. 4. Read the totals again.
- **Expected.** After step 1 the total is the other two vendors' amounts only and QA vendor 3 is no longer listed; after step 3 the totals are as in API-EVDAWD-003. On 32461, removing the only vendor leaves an empty award worth ₹0.
- **Oracle.** add_response with `action: "remove"` 200; `responses_hash.data` loses the vendor; `meta_data` totals match the recomputed sums.
- **Trace.** P1 · automate · `EVD3-S1` · `app/helpers/api/proposal_helper.rb:1097-1131` (any action other than "add" removes)

#### API-EVDAWD-006 — Changing an awarded vendor's quantity changes its amount
- **Why it matters.** "Give vendor 3 three units instead of five" is a normal correction; if the quantity changes but the amount does not, the proposal shows a value nobody agreed to.
- **Setup.** As API-EVDAWD-001, QA vendor 3 awarded 5 units.
- **Steps.** 1. Award QA vendor 3 again, now with 3 units. 2. Read QA vendor 3's awarded quantity and amount.
- **Expected.** Awarded quantity 3; amount 3 × QA vendor 3's price.
- **Oracle.** `responses_hash.data[v3].egli_data[line].awarded_quantity` = 3 and `total_amount` = 3 × price. Code reading: re-adding a vendor already on the line skips the amount recalculation but merges the new quantity — suspected: quantity changes, amount stays.
- **Trace.** P1 · automate · `EVD3-S1` · `app/helpers/api/proposal_helper.rb:950-963, 1100-1103`

#### API-EVDAWD-007 — Awarding more than the line's quantity across vendors is refused when partial awarding is on
- **Why it matters.** Over-awarding commits the buyer to more goods than were sourced.
- **Setup.** gate: `is_partial_awarding_enabled`. As API-EVDAWD-001 (25 units already awarded to vendors 1 and 2).
- **Steps.** 1. Raise QA vendor 3's award to 10 units (25 + 10 = 35 > 30).
- **Expected.** Refused: "You cannot select bid with more than requested quantity." Nothing changes.
- **Oracle.** HTTP 422, code 561.
- **Trace.** P0 · automate · `EVD3-S1` · `app/helpers/api/proposal_helper.rb:836-837, 1324-1334`

#### API-EVDAWD-008 — Line-wise split: each line goes whole to its own best bidder, with exact amounts
- **Why it matters.** Multi-line events are usually awarded line by line to whoever is cheapest on each line; each vendor's award must carry only its line.
- **Setup.** A closed RFQ with two lines (30 and 20 units) and three QA vendors; QA vendor 1 is cheapest on line 1 and QA vendor 2 on line 2.
- **Steps.** 1. Award line 1 (30 units) to QA vendor 1 and line 2 (20 units) to QA vendor 2. 2. Read each vendor's amount, the total and the L1 part.
- **Expected.** QA vendor 1 = 30 × its line-1 price; QA vendor 2 = 20 × its line-2 price; total = their sum; all of it is L1.
- **Oracle.** add_response 200; `responses_hash.data[v].egli_ids` = only that vendor's line; amounts as computed; `total_l1_proposal` = total.
- **Trace.** P0 · automate · `EVD3-S3` · `app/helpers/api/proposal_helper.rb:950-963, 974-1001`

#### API-EVDAWD-009 — A vendor who never bid cannot be awarded
- **Why it matters.** Awarding an invited vendor with no quote would create a purchase with no agreed price.
- **Setup.** A closed RFQ where QA vendor 4 was invited but never bid.
- **Steps.** 1. Try to award QA vendor 4 one unit.
- **Expected.** Refused: the vendor is not present in the latest round — or has no bid on the line.
- **Oracle.** HTTP 422, code 826 (or 715).
- **Trace.** P1 · automate · `EVD3-S1` · `app/helpers/api/proposal_helper.rb:1085-1086, 1308`

#### API-EVDAWD-010 — With partial awarding off, the whole line awarded to one vendor carries the exact amount
- **Why it matters.** The simplest award must be exactly right before the complex ones mean anything.
- **Setup.** Demo Account 2 32461 (partial awarding off). A closed RFQ, one line of 30 units, two vendors tied at the best price.
- **Steps.** 1. Award all 30 units to QA vendor 2. 2. Read its amount and the total.
- **Expected.** Amount and total = 30 × QA vendor 2's price.
- **Oracle.** `total_amount` and `proposal_values.total_proposal_value` = 30 × price.
- **Trace.** P1 · automate · `EVD3-S1` · `app/helpers/api/proposal_helper.rb:974-1030`

#### API-EVDAWD-011 — With partial awarding off, a second vendor cannot be added to a line already fully awarded
- **Why it matters.** With partial awarding off the line goes to one vendor; adding a second vendor's whole quote would double the quantity.
- **Setup.** Demo Account 2 32461; QA vendor 2 already awarded the whole line.
- **Steps.** 1. Also award QA vendor 1, without stating a quantity (its quoted 30 units).
- **Expected.** Refused: the line's quantity is already awarded.
- **Oracle.** HTTP 422, code 561. (Sending an explicit quantity skips this check entirely — already covered by API-XMAT bidding-matrix M2.)
- **Trace.** P1 · automate · `EVD3-S1` · `app/helpers/api/proposal_helper.rb:839-842, 1324-1334`

#### API-EVDAWD-012 — Once the award is final, every awarded vendor's bid is marked awarded
- **Why it matters.** The vendor's bid status drives what the supplier sees ("Awarded") and what reports count as won.
- **Setup.** An award that has been submitted and fully approved (198678, where the buyer is the approver of an applicable flow).
- **Steps.** 1. After approval, read each awarded vendor's bid.
- **Expected.** Each awarded vendor's bid is "selected"; a vendor that was not awarded keeps an active, unawarded bid.
- **Oracle.** `bids.status` = 2 (selected) for awarded vendors.
- **Trace.** P1 · automate · `EVD3-S1` `EVD3-S3` · `app/helpers/api/proposal_helper.rb:308-338` · `app/controllers/concerns/bids_controller_helper.rb:1568-1627`

## 2. Award changes the runner does not cover

#### API-EVDAWD-013 — A colleague can discard another buyer's draft award
- **Why it matters.** Discarding a draft has no creator check — any user of the company can throw away a colleague's half-built award.
- **Setup.** Two buyers of the same company; buyer A has a draft award on an event.
- **Steps.** 1. As buyer B, discard buyer A's draft.
- **Expected (today).** Accepted (the draft becomes inactive). Should be refused unless B owns the draft or is a super admin.
- **Oracle.** `POST /proposal/discard_draft_proposal` 200 for a non-creator; the proposal row status 0.
- **Trace.** P2 · manual · `app/controllers/api/proposal_controller.rb:181-186` (no creator check) — needs a second buyer login

#### API-EVDAWD-014 — Scoring a technical response empties every draft award of the event
- **Why it matters.** A buyer's half-built award silently disappears when an evaluator's score goes live.
- **Setup.** An RFP+RFQ event; the buyer has a draft award with two vendors; an evaluator then submits a score.
- **Steps.** 1. Build the draft award. 2. Let the evaluator submit a score (no approval flow). 3. Re-open the draft award.
- **Expected (today).** The draft award is empty (vendors and totals reset). Should at least warn the buyer.
- **Oracle.** `proposals.responses_hash` empty and totals 0 after step 2.
- **Trace.** P2 · automate-later · `app/models/evaluation_score.rb:98` · `app/controllers/concerns/event_group_controller_helper.rb:770-789`

#### API-EVDAWD-015 — A bid revised after it was put on the award blocks the submit
- **Why it matters.** The approver must approve the price the vendor actually offers now.
- **Setup.** Award open during bidding with QA vendor 1 on it; QA vendor 1 then revises.
- **Steps.** 1. Submit the award.
- **Expected.** Refused: "A few bids have been revised. Please re-award to continue.", or "Proposal cannot be empty" when the revision took the old bid off.
- **Oracle.** HTTP 422 code 1126 / 683. Already run live in bidding-matrix M7 (both clients answered 683).
- **Trace.** P1 · manual · covered by API-XMAT M7 · `app/helpers/api/proposal_helper.rb:121-125, 241-250`

#### API-EVDAWD-016 — A zero-quantity award does not add the vendor's full quote to the total
- **Why it matters.** "Awarded 0" is how a buyer parks a vendor; counting its whole quote inflates the award.
- **Setup.** gate: `is_partial_awarding_enabled`. A closed RFQ, two vendors.
- **Steps.** 1. Award QA vendor 1 the whole line and QA vendor 2 zero units. 2. Read the totals.
- **Expected.** QA vendor 2 contributes ₹0.
- **Oracle.** `responses_hash.data[v2].total_amount` = 0. Code reading: without a value formula the full bid gross is used (same root cause as API-EVDAWD-002).
- **Trace.** P2 · automate-later · `app/helpers/api/proposal_helper.rb:820-838, 1003-1030`

## 3. What the vendors see after the award (see also events-deep3-lek.md)

#### UI-EVDAWD-017 — The winning vendor sees "Awarded" with its awarded quantity, not its quoted quantity
- **Why it matters.** A vendor told it won 30 units when it was awarded 15 will ship the wrong quantity.
- **Setup.** A split award (15 of the vendor's quoted 30) that is final.
- **Steps.** 1. Sign in as the winning vendor and open the event and the purchase order.
- **Expected.** The event shows the bid as awarded with 15 units; the order shows 15 units.
- **Oracle.** Screen text; cross-check with API-EVDAPO-002 / 004.
- **Trace.** P1 · manual · `app/models/concerns/bid_concern.rb:7-9` · `app/models/order.rb:289-321`
