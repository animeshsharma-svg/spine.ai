# What a vendor can see of its competitors — prices and names must never leak

Deep cases for the one rule of sealed competition that matters most: a vendor sees its own bid and, where the event
is configured for it, its rank or the best price — never another vendor's name, company, price or total. The checks
read every view the vendor's own app loads for the round (the round, the round's page data, the event) and search the
whole reply — every field at every depth — for the competitors' company names, company ids, unit prices and totals,
as submitted in that same run. A competitor price that equals the vendor's own price (a tie) cannot be told apart and is
left out of the search. A leak here is Critical. The per-line price map (`meta_data.prices_hash`) is already on the bug sheet as BUG-60; the participant list in the round's page data (names, bid ids, who won) is the separate deep3 candidate D3-01. Grounded in `procol-backend` at `origin/main` ae36e86894. Cases whose
Trace names `EVD3-S1` / `EVD3-S2` run in `prototype/scripts/run-deep3.ts` on their own fresh events with QA vendors only.

**Read before running.** Vendors call `GET /trade/:id`, `GET /v1/trade/:id/schema`, `GET /event_groups/:id` and
`GET /v1/trade/:id/quote_details/:bid` (all allowed for the vendor website). The live ranking endpoint
(`/v1/trade/:id/event_indicators`) is buyer-console only — a vendor session calling it is answered 401 and signed out,
so it is never called as a vendor. The best price IS shown to vendors in price / rank-and-price auctions and when the
round's `other_auction_indicators_config.best_price` is on (`app/models/trade_request.rb:686-707`); the auction cases
switch English-auction mode off so that no best price is expected.

## 1. During bidding

#### API-EVDLEK-001 — While others bid, a vendor's views carry nothing of them
- **Why it matters.** If a vendor can read a competitor's price it can undercut by one rupee; the event is no longer competitive and the buyer is exposed.
- **Setup.** A fresh live RFQ with four QA vendors. Checked twice: before QA vendor 2 has bid (QA vendor 1 has), and after QA vendor 2 took the lead (QA vendor 1 reads).
- **Steps.** 1. As the reading vendor, open the round, its page data and the event. 2. Search every reply for the other vendors' names, company ids, prices and totals.
- **Expected.** Nothing of any other vendor appears.
- **Oracle.** Zero hits across the three replies; the run lists each hit's field path in Details.
- **Trace.** P0 · automate · `EVD3-S1` · `app/serializers/trade_template_serializer.rb` · `app/controllers/api/v1/trade_controller.rb:262-440`

#### API-EVDLEK-002 — A vendor cannot open another vendor's quote by its id
- **Why it matters.** Bid ids travel in URLs and notifications; knowing one must not be enough to read it.
- **Setup.** As API-EVDLEK-001 after QA vendor 2 has bid; checked from QA vendor 4 (never bid) and QA vendor 1 (bid).
- **Steps.** 1. As the vendor, ask for QA vendor 2's quote by QA vendor 2's bid id.
- **Expected.** Refused: "Bid not found" — no price, no name.
- **Oracle.** `GET /v1/trade/:id/quote_details/:other_bid` → HTTP 422 code 32.
- **Trace.** P0 · automate · `EVD3-S1` · `app/controllers/api/v1/trade_controller.rb:731-737`

#### API-EVDLEK-003 — A bid the buyer placed on a vendor's behalf is as hidden as an own bid
- **Why it matters.** Surrogate bids are written by the buyer's staff; a different code path must not mean weaker hiding.
- **Setup.** As API-EVDLEK-001; the buyer has just placed QA vendor 3's surrogate bid.
- **Steps.** 1. As QA vendor 1, open the round, its page data and the event and search for QA vendor 3.
- **Expected.** Nothing of QA vendor 3 appears.
- **Oracle.** Zero hits.
- **Trace.** P0 · automate · `EVD3-S1` · `app/controllers/api/bids_controller.rb:63-84`

#### API-EVDLEK-004 — In a rank auction vendors see their rank, never a competitor's price or name
- **Why it matters.** A rank auction shows position only; a price visible in the reply turns it into an open-book auction.
- **Setup.** A fresh rank auction (English-auction mode off, best price not configured), QA vendors 1–3; checked during bidding (QA vendor 3) and after the late bids (QA vendor 2).
- **Steps.** 1. As the vendor, open the three views and search for the others.
- **Expected.** Nothing of any other vendor; if the round shows the best price by configuration, only that one figure may appear.
- **Oracle.** Zero hits (a best-price figure is tolerated only when the round's config says best price is shown).
- **Trace.** P0 · automate · `EVD3-S2` · `app/models/trade_request.rb:654-707`

#### API-EVDLEK-007 — An invited vendor that has not bid sees nothing of the vendors that have
- **Why it matters.** A late joiner who could read the field would bid last with full knowledge.
- **Setup.** As API-EVDLEK-001 after three vendors have bid; QA vendor 4 has not.
- **Steps.** 1. As QA vendor 4, open the three views and search for the other three.
- **Expected.** Nothing of the others.
- **Oracle.** Zero hits.
- **Trace.** P0 · automate · `EVD3-S1`

## 2. After the award

#### API-EVDLEK-005 — A vendor that lost (or won only a share) does not see who else won or at what price
- **Why it matters.** Award details are commercially confidential; leaking them sets the floor of the next negotiation.
- **Setup.** The S1 award is final (split between QA vendors 1, 2 and 3); QA vendor 4 never bid.
- **Steps.** 1. As QA vendor 4, and as QA vendor 3, open the three views and search for the other vendors.
- **Expected.** Nothing of the others.
- **Oracle.** Zero hits.
- **Trace.** P0 · automate · `EVD3-S1`

#### API-EVDLEK-006 — A winning vendor sees its own award, not its co-winners'
- **Why it matters.** Split awards put competitors side by side on one line; each must see only its own share.
- **Setup.** As API-EVDLEK-005.
- **Steps.** 1. As QA vendor 2, and as QA vendor 3, open the three views and search for the other vendors.
- **Expected.** Nothing of the other vendors.
- **Oracle.** Zero hits.
- **Trace.** P0 · automate · `EVD3-S1`

## 3. Not run by the runner

#### API-EVDLEK-008 — Bidder remarks and rejected-bid lists are buyer-only
- **Why it matters.** Remarks often contain prices ("can do 4,700 if…").
- **Setup.** Any live round with two vendors' remarks.
- **Steps.** 1. Confirm that the vendor app is not allowed to call the bidder-remarks and rejected-bids reads.
- **Expected.** Both are console-only in the app allow-list, so a vendor session cannot read them.
- **Oracle.** `config/app_auth_config.yml` agribid_website has no `trade#bidder_remarks` / `rejected_bids`. Static check — never send these as a vendor (a 401 signs the vendor out).
- **Trace.** P2 · manual · `config/app_auth_config.yml` · `app/controllers/api/v1/trade_controller.rb:285-300`

#### UI-EVDLEK-009 — The vendor's live screen and the downloaded quote show nothing of the competitors
- **Why it matters.** The API being clean does not prove the PDF/Excel export is.
- **Setup.** A live RFQ with three vendors' bids.
- **Steps.** 1. As one vendor, open the event, then download its own quote/summary.
- **Expected.** Only its own data on screen and in the file.
- **Oracle.** Search the screen text and file for the other vendors' names and prices.
- **Trace.** P1 · manual
