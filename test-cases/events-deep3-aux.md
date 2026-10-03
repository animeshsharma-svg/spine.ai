# Auction closing under pressure — late bids that extend the auction, and the ones that must not

Deep cases for dynamic closing in a live auction with several vendors: a bid that lands in the last minutes and
changes the leader must push the closing time out by the configured minutes, every vendor's bid must follow the new
end, a late bid that does not reach the top rank must not extend, and a second late lead change extends again. Waits
are bounded (each at most 7 minutes) and every extension is read back from the buyer's own view of the round's clock.
Grounded in `procol-backend` at `origin/main` ae36e86894. Cases whose Trace names `EVD3-S2` run in
`prototype/scripts/run-deep3.ts` on their own fresh rank auction with three QA vendors.

**Read before running.** Dynamic closing is set on the auction at creation: `is_dynamic_closing_time_allowed`,
`last_n_minutes_for_time_extension` (must be ≥ 1 and less than half the auction's length, else 501),
`time_extension_value` (minutes added; 3 when blank), `rank_limit_for_time_extension` and
`dynamic_closing_time_strategy` rank_based / price_based (`app/controllers/concerns/trade_controller_helper.rb:3311-3320, 3374-3378`).
rank_based extends when a vendor's line rank changes and the old or the new rank is within the limit
(`app/models/bid.rb:439-449`). The runner uses: last 1 minute, +2 minutes, rank limit 1, rank based. The older
"last-minute" extension (`update_trade_end_time`) applies only WITHOUT dynamic closing (`app/models/bid_trade.rb:45-58`).

## 1. Dynamic closing — run live

#### API-EVDAUX-001 — A late bid that changes the leader extends the auction by the configured minutes
- **Why it matters.** Without the extension the auction rewards sniping: a vendor bids in the last seconds and nobody can answer.
- **Setup.** A fresh rank auction (about 4½ minutes) with dynamic closing (last 1 minute, +2 minutes, rank limit 1); QA vendors 1 and 2 tied, QA vendor 3 last.
- **Steps.** 1. Confirm the auction carries the settings. 2. Inside the last minute, QA vendor 3 bids below everyone. 3. Read the auction's end time.
- **Expected.** The settings are stored as sent; the end time moves out by exactly 2 minutes.
- **Oracle.** `GET /v1/trade/:id/schema` trade_config; `GET /trade/:id` `ending_at` before vs after (±5 s).
- **Trace.** P0 · automate · `EVD3-S2` · `app/models/bid.rb:356-372, 411-425, 2256-2288`

#### API-EVDAUX-002 — Bids well before the last minute do not move the end time
- **Why it matters.** An auction that extends on every bid never ends.
- **Setup.** As API-EVDAUX-001, at the start.
- **Steps.** 1. Three vendors bid in the first minute. 2. Read the end time.
- **Expected.** Unchanged.
- **Oracle.** `ending_at` unchanged (±2 s).
- **Trace.** P1 · automate · `EVD3-S2` · `app/models/bid.rb:419-424`

#### API-EVDAUX-003 — A second late lead change extends again
- **Why it matters.** Extensions must keep working round after round, as long as the lead keeps changing late.
- **Setup.** As API-EVDAUX-001, after the first extension.
- **Steps.** 1. Inside the last minute of the extended window, QA vendor 1 bids below QA vendor 3. 2. Read the end time.
- **Expected.** The end time moves out by another 2 minutes.
- **Oracle.** `ending_at` = previous + 120 s (±5 s).
- **Trace.** P0 · automate · `EVD3-S2` · `app/models/bid.rb:2256-2288`

#### API-EVDAUX-004 — Every vendor's bid takes the extended end time
- **Why it matters.** Each bid stores its own end time; a vendor whose bid still carries the old end may be shut out early.
- **Setup.** As API-EVDAUX-001, right after the first extension.
- **Steps.** 1. Read each vendor's live bid's end time.
- **Expected.** All equal the new end time.
- **Oracle.** `bids.end_time` (SELECT, own QA records) = new `ending_at` (±5 s).
- **Trace.** P1 · automate · `EVD3-S2` · `app/models/bid.rb:2286-2287`

#### API-EVDAUX-005 — A late bid that does not reach the top rank does not extend
- **Why it matters.** With a rank limit of 1, only a fight for first place should keep the auction open.
- **Setup.** As API-EVDAUX-003, before QA vendor 1's late bid: QA vendor 2 is behind.
- **Steps.** 1. Inside the last minute, QA vendor 2 improves its price but stays behind the leader. 2. Read the end time.
- **Expected.** Unchanged.
- **Oracle.** `ending_at` unchanged (±2 s).
- **Trace.** P1 · automate · `EVD3-S2` · `app/models/bid.rb:439-449`

## 2. Not run by the runner

#### API-EVDAUX-006 — A revision smaller than the tick size is refused, in either direction
- **Why it matters.** The tick size stops "one-paisa" undercutting; the code checks only the absolute change, so a tiny price INCREASE is refused for the same reason.
- **Setup.** A live auction whose line has a tick size of ₹10; QA vendor 1 has bid ₹5,000.
- **Steps.** 1. Rebid ₹4,995. 2. Rebid ₹5,005. 3. Rebid ₹4,990.
- **Expected.** Steps 1 and 2 refused "Quoted price difference must be greater than the tick size"; step 3 accepted.
- **Oracle.** 422 code 214 / 200.
- **Trace.** P1 · manual · `app/controllers/concerns/bids_controller_helper.rb:1869-1891` — needs a template with tick size

#### API-EVDAUX-007 — Without dynamic closing, a last-minute new leader still adds 3 minutes when the round allows it
- **Why it matters.** The older extension path (`update_trade_end_time`) is the default for many auctions.
- **Setup.** A rank auction without dynamic closing, whose round extends the end time on a last-minute new leader (rank limit 1).
- **Steps.** 1. In the last minute a vendor takes rank 1. 2. Read the end time.
- **Expected.** +3 minutes; never on an RFQ.
- **Oracle.** `ending_at` + 180 s.
- **Trace.** P1 · automate-later · `app/models/bid_trade.rb:45-58, 118-129` · `app/controllers/concerns/bids_controller_helper.rb:381-408`

#### API-EVDAUX-008 — Dynamic closing without an extension value does not break the bid
- **Why it matters.** Code reading: a blank `time_extension_value` makes the extension multiply nil — the late bid may fail or the extension silently not happen.
- **Setup.** A rank auction with dynamic closing on and the extension minutes left blank.
- **Steps.** 1. Bid in the last minute and take the lead. 2. Read the bid and the end time.
- **Expected.** The bid is accepted and the auction extends by the documented default (3 minutes).
- **Oracle.** Bid 200; `ending_at` + 180 s. A 500 or no extension is a defect.
- **Trace.** P1 · automate-later · `app/models/bid.rb:356-357` (`time_extension_value_in_mins * 60`)

#### API-EVDAUX-009 — After an extension the buyer can switch the auction to sealed bids
- **Why it matters.** Sealed bids end the sniping war; the switch is offered only once an extension happened.
- **Setup.** As API-EVDAUX-001 after the first extension.
- **Steps.** 1. As the buyer, switch on sealed bids. 2. Read the auction.
- **Expected.** Sealed bidding starts with its own extension time; dynamic closing switches off.
- **Oracle.** `PATCH /trade/:id` with `other_auction_indicators_config.is_sealbid_enabled`; `sealbid_enabled` true.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:3870-3884`
