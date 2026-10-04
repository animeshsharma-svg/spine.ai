# Real competition — several vendors bidding against each other, the buyer bidding for one, rebids and ties

Deep cases for what the buyer sees while three or four vendors compete on one round: who is the best bidder and what
the lowest (L1) price is after every move — a first bid, a buyer's bid on a vendor's behalf (surrogate), a higher bid,
a rebid that takes the lead, a tie at the best price, a vendor that never bids — and what each vendor is shown of its
own rank in an auction. Every expected rank and price is computed from what that run submitted. Grounded in
`procol-backend` at `origin/main` ae36e86894. Cases whose Trace names `EVD3-S1` / `EVD3-S2` / `EVD3-S3` are run by
`prototype/scripts/run-deep3.ts` on their OWN fresh event with four QA vendors (PROCOL DEMO 198678 and Demo Account 2
32461 each have four; never real suppliers); a failure counts only if it repeats on a second fresh event.

**Read before running.** Ranks are dense: equal scores share a rank, and when MORE than one vendor holds the best score
every rank shifts by one, so tied leaders are both rank 2 and nobody is rank 1 (`app/models/concerns/bid_rank_helper.rb:215-218`).
Only active, selected and requested bids are ranked (`bid_rank_helper.rb:14`). On an RFQ vendors are never shown a rank
(`app/models/trade_request.rb:654-670`); the buyer's comparison marks the best bidder per line. The earlier bidding matrix
(test-cases/api-bidding-matrix.md, API-XMAT) covers three vendors placing one bid each; these cases add the moves in between.

## 1. RFQ with four vendors — the buyer's view after every move

#### API-EVDCMP-001 — After the first bid, that vendor leads and its price is the L1 price
- **Why it matters.** The comparison is the buyer's live scoreboard; it must be right from the first bid.
- **Setup.** A fresh live RFQ, one line of 30 units, four QA vendors invited, no bids.
- **Steps.** 1. QA vendor 1 bids. 2. As the buyer, open the comparison.
- **Expected.** QA vendor 1 is marked best bidder; nobody else is; the L1 price is QA vendor 1's price.
- **Oracle.** `GET /v1/trade/:id/event_indicators` → `auction_identifiers_data.<vendor>.inline.<line>.rank.best_bidder`; `GET /v1/trade/:id/schema?l1_prices=true` → `l1_prices.line_item_based.<line>.price`.
- **Trace.** P0 · automate · `EVD3-S1` · `app/services/event_indicators/concerns/rank_calculator.rb:8-31`

#### API-EVDCMP-002 — A higher bid the buyer places on a vendor's behalf does not take the lead
- **Why it matters.** A surrogate bid (typed in by the buyer from a vendor's email or phone quote) must compete exactly like an own bid — no better, no worse.
- **Setup.** As API-EVDCMP-001 after QA vendor 1's bid.
- **Steps.** 1. As the buyer, enter a higher price on QA vendor 3's behalf. 2. Open the comparison.
- **Expected.** The surrogate bid is accepted; QA vendor 1 still leads; L1 unchanged.
- **Oracle.** `POST /bids/template_input` 200; indicators and l1_prices as in API-EVDCMP-001.
- **Trace.** P0 · automate · `EVD3-S1` · `app/controllers/api/bids_controller.rb:47-58`

#### API-EVDCMP-003 — A third, higher own bid leaves the leader unchanged
- **Why it matters.** Proves the ranking reads every bid, not only the latest one.
- **Setup.** As API-EVDCMP-002.
- **Steps.** 1. QA vendor 2 bids above both. 2. Open the comparison.
- **Expected.** QA vendor 1 still the only best bidder; L1 unchanged.
- **Oracle.** As API-EVDCMP-001.
- **Trace.** P1 · automate · `EVD3-S1`

#### API-EVDCMP-004 — A rebid below the leader takes the lead, and the old bid stops counting
- **Why it matters.** Rebidding is how competition works; the comparison must follow the newest bid of each vendor, not its old one.
- **Setup.** As API-EVDCMP-003.
- **Steps.** 1. QA vendor 2 rebids below QA vendor 1. 2. Open the comparison.
- **Expected.** QA vendor 2 is now the only best bidder; L1 = its new price.
- **Oracle.** As API-EVDCMP-001; QA vendor 2's earlier bid is "revised" and no longer ranked.
- **Trace.** P0 · automate · `EVD3-S1` · `app/helpers/api/v1/bids_controller_helper.rb:807-817` · `app/models/concerns/bid_rank_helper.rb:14`

#### API-EVDCMP-005 — A tie at the best price on an RFQ: both vendors are shown as best
- **Why it matters.** Two equal lowest quotes are both L1; marking only one (or neither) misleads the award.
- **Setup.** As API-EVDCMP-004.
- **Steps.** 1. QA vendor 1 rebids exactly QA vendor 2's price. 2. Open the comparison.
- **Expected.** Accepted (ties are allowed on RFQs); both QA vendors 1 and 2 are marked best bidder; L1 = the tied price.
- **Oracle.** Both `best_bidder: true`; l1_prices = tied price. The tie rule (98) applies only to non-RFQ rounds with `is_tie_bid_allowed` false.
- **Trace.** P0 · automate · `EVD3-S1` · `app/helpers/api/v1/bids_controller_helper.rb:628-641` · `app/models/concerns/bid_rank_helper.rb:215-218`

#### API-EVDCMP-006 — A vendor that never bids is never shown as a bidder
- **Why it matters.** An invited vendor without a quote must not appear as best or ranked.
- **Setup.** As API-EVDCMP-005; QA vendor 4 invited, no bid.
- **Steps.** 1. Open the comparison.
- **Expected.** QA vendor 4 is not marked best (absent or "not best").
- **Oracle.** `auction_identifiers_data` has no best_bidder true for QA vendor 4.
- **Trace.** P1 · automate · `EVD3-S1`

#### API-EVDCMP-007 — A vendor bids itself after the buyer bid on its behalf: one live bid, at the vendor's price
- **Why it matters.** The surrogate and the vendor's own portal are two doors to the same bid; two live bids for one vendor would double-count it in ranking and award.
- **Setup.** As API-EVDCMP-003 (the buyer placed QA vendor 3's surrogate bid).
- **Steps.** 1. QA vendor 3 signs in and bids a slightly lower price itself. 2. Count QA vendor 3's live bids.
- **Expected.** Either the vendor's bid is accepted as a revision of the surrogate bid, or it is refused; in both cases QA vendor 3 has exactly one live bid, at its latest accepted price.
- **Oracle.** `PATCH /v1/bids/:id` 200 or 422 96/99; `SELECT count(*) FROM bids … status IN (active, selected, requested)` = 1 for the vendor.
- **Trace.** P0 · automate · `EVD3-S1` · `app/helpers/api/v1/bids_controller_helper.rb:807-817` · `app/controllers/api/bids_controller.rb:54-58`

#### API-EVDCMP-011 — Two lines: each line's best bidder and L1 price are worked out per line
- **Why it matters.** On multi-line events a vendor can be cheapest on one line and dearest on another; a per-event ranking would award the wrong lines.
- **Setup.** A fresh RFQ with two lines; QA vendor 1 cheapest on line 1, QA vendor 2 cheapest on line 2, QA vendor 3 never cheapest.
- **Steps.** 1. All three bid. 2. Open the comparison for each line.
- **Expected.** Line 1: QA vendor 1 best, L1 = its line-1 price. Line 2: QA vendor 2 best, L1 = its line-2 price.
- **Oracle.** indicators `inline.<line>` per line; `l1_prices.line_item_based.<line>.price` per line.
- **Trace.** P0 · automate · `EVD3-S3` · `app/services/event_indicators/concerns/rank_calculator.rb:8-31`

## 2. Auction with three vendors — what each vendor sees of its own rank

#### API-EVDCMP-008 — In a rank auction every vendor sees its own current rank after each move
- **Why it matters.** The rank is the only signal a vendor gets in a rank auction; a stale or wrong rank stops the price falling.
- **Setup.** A fresh rank auction (best price not shown), one line, QA vendors 1–3.
- **Steps.** 1. Vendors bid; read each vendor's own view. 2. After late rebids (see events-deep3-aux.md) read each view again.
- **Expected.** Each vendor's rank matches the order of the latest prices (lowest = 1).
- **Oracle.** The vendor's `GET /trade/:id` carries its rank; compared with the order of submitted prices.
- **Trace.** P0 · automate · `EVD3-S2` · `app/models/trade_request.rb:654-670`

#### API-EVDCMP-009 — A tie at the best price in an auction: both tied vendors are told rank 2
- **Why it matters.** Today a vendor sharing the lowest price is told it is second; it may cut its price for nothing, or stop bidding believing it cannot win.
- **Setup.** As API-EVDCMP-008; QA vendors 1 and 2 bid the same price, QA vendor 3 higher.
- **Steps.** 1. Read each vendor's own rank.
- **Expected (today).** QA vendors 1 and 2 see rank 2, QA vendor 3 sees rank 3 — the dense ranking shifts every rank when the best is shared. Product decision needed: tied leaders arguably should see rank 1 ("joint first").
- **Oracle.** Vendor views as in API-EVDCMP-008.
- **Trace.** P2 · automate · `EVD3-S2` · `app/models/concerns/bid_rank_helper.rb:215-218` · `app/services/event_indicators/concerns/rank_calculator.rb:26-29`

#### API-EVDCMP-010 — Matching the best price in an auction is allowed unless the round forbids ties
- **Why it matters.** Whether ties are allowed decides whether a vendor may simply match the leader.
- **Setup.** As API-EVDCMP-008, QA vendor 1 already bid.
- **Steps.** 1. QA vendor 2 bids exactly QA vendor 1's price.
- **Expected.** Accepted when ties are allowed (the default); refused "A bid at this price already exists" when the round forbids tie bids.
- **Oracle.** `PATCH /v1/bids/:id` 200, or 422 code 98.
- **Trace.** P1 · automate · `EVD3-S2` · `app/helpers/api/v1/bids_controller_helper.rb:601, 628-641`

## 3. Competition rules the runner does not cover

#### API-EVDCMP-012 — In the last five minutes a vendor cannot raise its price on a single-line round
- **Why it matters.** Late price increases are a classic way to game the close.
- **Setup.** A live single-line round within 5 minutes of its bid end; QA vendor 1 has bid.
- **Steps.** 1. QA vendor 1 rebids higher.
- **Expected.** Refused "You cannot increase the price"; a lower rebid is accepted.
- **Oracle.** 422 code 300.
- **Trace.** P1 · automate-later · `app/helpers/api/v1/bids_controller_helper.rb:622-627` · `app/models/bid.rb:1423-1428`

#### API-EVDCMP-013 — A rejected leader's bid stops counting and the next vendor becomes best
- **Why it matters.** After a rejection the comparison must promote the next best bid, or the buyer awards a rejected price.
- **Setup.** Three vendors bid; the buyer rejects the leader's bid (round 2 owns the reject action itself).
- **Steps.** 1. Reject the leader. 2. Open the comparison.
- **Expected.** The second-lowest vendor is now best; L1 = its price.
- **Oracle.** indicators/l1_prices; `app/models/concerns/bid_concern.rb format_tp_vs_latest_btps` uses the vendor's previous active bid when the latest is rejected.
- **Trace.** P1 · automate-later · `app/models/concerns/bid_concern.rb:83-102`
