# Who may act and what each person receives — rule cases

Cases for the permission and visibility rules that no written case checked yet, extracted from
`prototype/knowledge/events/backend-digest/policies-serializers.md` (the policies behind the event APIs and the serializers that
decide which fields the buyer, a vendor, a broker or a masked buyer receives). Each case names its rule (`R-VIS-…`,
`prototype/data/rules/events-rules.json`) and the line of `procol-backend` (origin/main ae36e86894) that makes it true. Two
leaks are already verified defects on the bug sheet — every vendor reads competitors' prices (BUG-60) and every vendor sees who
else bid (BUG-63); the cases below go after the OTHER fields and paths the same pattern reaches. Cases whose Trace names an
`EDGE-EVRVIS-NNN` id have a runnable twin in `prototype/data/api-cases-extra/rules-vis.json`.

How to read a leak case: "the vendor's view" means what the vendor's own session receives when it opens the screen named in the
steps; the field must be absent or empty there, whatever the screen draws. Most leak cases need a second vendor's bid or a
buyer setting, which the Setup says.

## 1. What a vendor receives about competitors

#### API-EVRVIS-001 — A vendor must not receive other vendors' individual price limits
- **Why it matters.** Vendor-specific ceiling and floor prices are the buyer's negotiating position per supplier; each vendor seeing every other vendor's limit tells it exactly how far a competitor is allowed to go.
- **Setup.** Price round with vendor-specific ceiling prices for two vendors (QA vendor: 120, vendor B: 105) on line 1.
- **Steps.** As the QA vendor, open the price round (the bidding screen) and read the line details it receives.
- **Expected.** The vendor's view carries its own ceiling (120) at most; vendor B's limit appears nowhere.
- **Oracle.** In the vendor's stage payload, `trade_products[].validations` must not contain `vendor_validations` keyed by B's company id. Today the raw `validations` column is serialized to every caller.
- **Trace.** P0 · automate-later · `R-VIS-043-6` `R-VIS-043-5` `R-VIS-042-7` · `app/serializers/trade_product_serializer.rb:4-5` · `app/models/trade_product.rb:158-163`

#### API-EVRVIS-002 — A vendor asking the live page for "L1 prices" gets nothing
- **Why it matters.** The buyer console asks the live page for the lowest price per line; the same request from a vendor must not return the competitor's L1 price and total, whatever the sealed-bid, masking or best-price settings say.
- **Setup.** Sealed-bid price round; vendor B has bid 95 on line 1; the QA vendor has bid 100.
- **Steps.** As the QA vendor, open the live event the way the console does, asking for L1 prices.
- **Expected.** No L1 prices in the vendor's view.
- **Oracle.** Vendor `GET /v1/trade/:id/schema?l1_prices=1` → no `l1_prices` (or empty); today `get_l1_prices_for_event` runs for any caller when the param is present (`v1/trade_controller.rb:439`) and returns B's 95.
- **Trace.** P0 · automate-later · `R-VIS-038-3` · `app/controllers/api/v1/trade_controller.rb:439` · `app/controllers/concerns/trade_template_helper.rb:413-445`

#### API-EVRVIS-003 — Who else bid and their bid status stay hidden from a vendor (known defect BUG-63, the bid-count angle)
- **Why it matters.** The live page's participant list is built from every bid; besides names it carries each competitor's status and revision count.
- **Setup.** Price round, vendor B bid twice (one revision), the QA vendor bid once.
- **Steps.** As the QA vendor, open the live event.
- **Expected.** The participant list holds only the QA vendor's own bid.
- **Oracle.** Vendor `schema` → `participants_data` has no layer for B (no B name, bid id, status or `bid_count`). Rank is set on layers only for the buyer company (`v1/trade_controller.rb:352-361`). Today all layers are returned (BUG-63).
- **Trace.** P0 · automate-later · `R-VIS-037-1` `R-VIS-037-2` `R-VIS-037-4` · `app/controllers/api/v1/trade_controller.rb:349-372` · `app/controllers/concerns/trade_template_helper.rb:5856-5905`

#### API-EVRVIS-004 — Weightages and currency preferences do not name the other vendors
- **Why it matters.** In a weighted event the per-vendor weight (the buyer's loading on each supplier) and each supplier's chosen currency are keyed by company; sent to every viewer they reveal the field and the buyer's preferences.
- **Setup.** Weighted RFQ with per-vendor weights for the QA vendor and vendor B; multi-currency with B quoting in USD.
- **Steps.** As the QA vendor, open the price round.
- **Expected.** The vendor's view has its own weight and currency only.
- **Oracle.** Vendor stage payload `weightages` and `currency_preferences` contain only the QA vendor's company uuid; today every participant's uuid and value.
- **Trace.** P1 · automate-later · `R-VIS-035-2` `R-VIS-035-7` · `app/serializers/trade_template_serializer.rb:858-879`

#### API-EVRVIS-005 — The stage configuration sent to a vendor does not list which other vendors were asked for a best offer
- **Why it matters.** The best-offer request names the invited companies inside the stage config; a vendor reading it learns who is still in contention.
- **Setup.** Closed RFQ in evaluation; buyer requests a best offer from vendor B only.
- **Steps.** As the QA vendor (not invited to the best offer), open the stage.
- **Expected.** No list of invited companies; the request text (remarks) is empty for the QA vendor.
- **Oracle.** Vendor stage payload `trade_config.allowed_participants_to_edit_in_bid_review_time.request_for_best_price` absent or without B's id; `remarks` = "" because the vendor is not listed (`can_show_remarks`).
- **Trace.** P1 · automate-later · `R-VIS-032-6` `R-VIS-035-3` `R-VIS-042-2` · `app/serializers/trade_template_serializer.rb:96, 143, 885-905` · `app/serializers/trade_serializer.rb:317-319`

#### API-EVRVIS-006 — Only the buyer receives the stage's internal "misc" data
- **Why it matters.** The stage's misc block holds precomputed bids, savings and the rebid block list; it is buyer-only on the stage serializer.
- **Setup.** Price round with two bids and savings configured.
- **Steps.** 1. As the buyer, read the stage. 2. As the QA vendor, read the same stage.
- **Expected.** Buyer: misc present. Vendor: no misc.
- **Oracle.** `misc` non-null for the buyer company, null for the vendor (`trade_serializer.rb:109-114`); on update-vendor stages the fallback must not hand the full misc to a non-buyer (`merge_vendor_update_misc`, gap).
- **Trace.** P1 · automate-later · `R-VIS-042-1` `R-VIS-033-6` `R-VIS-033-3` · `app/serializers/trade_serializer.rb:109-114` · `app/serializers/trade_template_serializer.rb:431-441`

## 2. Knockout and dutch auctions

#### API-EVRVIS-007 — A vendor does not receive the dutch auction's stop price
- **Why it matters.** The end price is where the price ladder stops; a vendor knowing it simply waits for it.
- **Setup.** Dutch auction on an eRFx project, start 1,000, end price 700, step 50; QA vendor invited.
- **Steps.** As the QA vendor, open the auction during a round.
- **Expected.** The current round price is shown; the end price (700) is not in the vendor's view.
- **Oracle.** Vendor stage payload round block: `end_price` absent. Today `end_price` is sent to everyone (`trade_template_serializer.rb:474, 1035`).
- **Trace.** P0 · automate-later · `R-VIS-034-7` `R-VIS-034-5` · `app/serializers/trade_template_serializer.rb:471-479, 1030-1058`

#### API-EVRVIS-008 — A vendor knocked out of a round does not keep receiving the current round
- **Why it matters.** The participation check intersects two id lists and treats the (always truthy) array as "yes", so knocked-out vendors keep seeing round times and prices.
- **Setup.** Knockout auction, round 1 accepted by vendor B only; the QA vendor did not accept and is out.
- **Steps.** As the QA vendor, open the auction during round 2.
- **Expected.** No round-2 times or latest bulk price for the QA vendor.
- **Oracle.** Vendor payload has no current-round block; today `round_participant_ids & participant_ids` (an Array) is truthy (`trade_template_serializer.rb:1072-1074`).
- **Trace.** P1 · manual · `R-VIS-034-6` `R-VIS-034-4` · `app/serializers/trade_template_serializer.rb:1060-1080`

#### API-EVRVIS-009 — Remaining quantity is hidden from vendors unless the stage allows it; the price trail is buyer-only
- **Why it matters.** Remaining quantity tells vendors how much is left to win; the bulk-price trail shows the buyer's whole ladder.
- **Setup.** Knockout auction with "show remaining quantity to sellers" off.
- **Steps.** 1. As the buyer, open the auction. 2. As the QA vendor, open it. 3. Turn the setting on and repeat step 2.
- **Expected.** Buyer: remaining quantity and the full price trail. Vendor: no remaining quantity and no trail; after step 3 the vendor sees remaining quantity but still no trail.
- **Oracle.** `remaining_quantity` nil for the vendor unless `show_remaining_quantity_to_sellers`; `event_bulk_price_trail` only in the buyer payload.
- **Trace.** P1 · automate-later · `R-VIS-034-2` `R-VIS-034-3` `R-VIS-034-1` · `app/serializers/trade_template_serializer.rb:444-461, 1109-1123`

## 3. The vendor's event card and its own bid row

#### API-EVRVIS-010 — On a price round a vendor never learns its own rank
- **Why it matters.** Price rounds (RFQs) never show ranks to vendors; the vendor's own bid row is gated only by sealed-bid, so a lot-closing RFQ bid row can carry the vendor's rank.
- **Setup.** RFQ closed on lot (not sealed), vendor B 95, QA vendor 100.
- **Steps.** As the QA vendor, open its bid on the price round.
- **Expected.** No rank in the vendor's own bid row.
- **Oracle.** Vendor bid row `data.rank` is nil; today `bid.get_rank` is filled whenever the stage closes on lot and is not sealed (`bid_template_serializer.rb:25-35`), while the card and NewBidSerializer check `should_show_rank?`.
- **Trace.** P0 · automate-later · `R-VIS-039-7` `R-VIS-039-1` `R-VIS-041-1` · `app/serializers/bid_template_serializer.rb:25-35` · `app/models/trade_request.rb:654-655`

#### API-EVRVIS-011 — Vendor card rank and colour only while the auction runs, never on a sealed stage
- **Why it matters.** Ranks shown before the start or after the end, or on sealed stages, break the auction's rules.
- **Setup.** Rank auction closed on lot, two vendors bid; a second auction with sealed bids.
- **Steps.** As the QA vendor read its card rank before start, during, and after end on the open auction, and during the sealed one.
- **Expected.** Rank only during the open auction (and only once the vendor has done the revisions the stage requires); nothing on the sealed one; traffic colour likewise.
- **Oracle.** Card `rank` / `traffic_signal_color` nil outside auctioning and on sealed stages (`card_serializer.rb:636-675`).
- **Trace.** P1 · automate-later · `R-VIS-024-1` `R-VIS-024-2` · `app/serializers/trade_request/card_serializer.rb:636-675`

#### API-EVRVIS-012 — The best price on a vendor card respects sealed bids, masking and the stage's best-price switch
- **Why it matters.** The card is a second place the best price appears; each switch that hides it on the live page must hide it here too.
- **Setup.** Three auctions: sealed-bid; masked (closed-envelope); best-price indicator off. Vendor B bid 95, QA vendor 100 in each.
- **Steps.** As the QA vendor read the card's best price on each.
- **Expected.** No best price on any of the three.
- **Oracle.** Card `best_price` nil on sealed (`card_serializer.rb:317-318`); `best_price_v1` nil when sealed, masked for the caller, or `other_auction_indicators_config.best_price` not true (`:477-480`).
- **Trace.** P0 · automate-later · `R-VIS-023-1` `R-VIS-023-2` `R-VIS-023-3` `R-VIS-023-4` · `app/serializers/trade_request/card_serializer.rb:317-318, 477-526`

#### API-EVRVIS-013 — "How far from best" on the vendor card is computed on the vendor's own total
- **Why it matters.** The percentage tells a vendor how much to drop; a wrong base misleads every revision.
- **Setup.** Price auction with best price shown; best total 950, the QA vendor's total 1,000.
- **Steps.** As the QA vendor read the card's difference from best.
- **Expected.** 5.0 % (|950 − 1,000| × 100 ÷ 1,000, rounded to 2). When the vendor is best (difference 0) nothing is shown.
- **Oracle.** Card `best_quote_difference` = "5.0%"; nil when 0, for knockout/dutch, and in brokerage workspaces.
- **Trace.** P2 · automate-later · `R-VIS-023-6` · `app/serializers/trade_request/card_serializer.rb:209-223, 787-797`

#### API-EVRVIS-014 — The bid count shown to a vendor follows the stage setting and the "more than three" rule
- **Why it matters.** "4 vendors have bid" is competitive pressure the buyer may want off; with few bids it identifies competitors.
- **Setup.** Price auction with "vendors may see the bid count" on, then off; first with 3 bids, then with 4 (the QA vendor among them). Also an RFQ with 5 bids.
- **Steps.** As the QA vendor read the card's bid count in each state.
- **Expected.** Setting on: hidden at 3, "4" at 4. Setting off: hidden. RFQ: hidden for a vendor. Knockout: hidden.
- **Oracle.** Card `bid_count`: nil when `is_vendor_allowed_to_view_bid_count` false, RFQ + category seller, knockout + not buyer, or `bids_count <= 3`; shown above 3 only if the vendor has its own bid. Brokers on an RFQ are not blocked by the seller check (gap).
- **Trace.** P1 · automate-later · `R-VIS-022-1` `R-VIS-022-2` `R-VIS-022-3` `R-VIS-022-5` `R-VIS-022-6` · `app/serializers/trade_request/card_serializer.rb:291-311`

#### API-EVRVIS-015 — Until award notifications are on, a vendor sees "active" and "bid placed" instead of "closed" and "accepted"
- **Why it matters.** Telling the losing vendors early, or the winner before the PO, is the buyer's choice (gate: `select_bid_notification`).
- **Setup.** RFQ, two vendors, stage closed and the QA vendor's bid awarded; setting off, then on.
- **Steps.** As the QA vendor read the card status, the card stamp and its bid status.
- **Expected.** Off: status "active", stamp "bid placed", bid status "active". On: "closed", "bid accepted", "selected".
- **Oracle.** Card status (`card_serializer.rb:374-378`), stamp (`:446-458`), bid row status (`bid_template_serializer.rb:365`).
- **Trace.** P1 · automate-later · `R-VIS-024-3` `R-VIS-024-4` `R-VIS-039-5` · `app/serializers/trade_request/card_serializer.rb:374-378, 446-458`

#### API-EVRVIS-016 — The buyer's award remark is not shown to the vendor
- **Why it matters.** The selection remark is written for the approvers ("cheapest after negotiation, B refused terms"); it is serialized into the awarded vendor's own bid row.
- **Setup.** RFQ awarded to the QA vendor with a selection remark naming another vendor.
- **Steps.** As the QA vendor open its bid.
- **Expected.** No buyer selection remark in the vendor's view.
- **Oracle.** Vendor bid row has no `selection_remark`; today it is set for any selected bid (`bid_template_serializer.rb:231, 380`).
- **Trace.** P1 · automate-later · `R-VIS-040-6` `R-VIS-040-4` · `app/serializers/bid_template_serializer.rb:226-235, 375-382`

#### API-EVRVIS-017 — A vendor's event card carries no buyer-internal fields
- **Why it matters.** The same card serializer serves vendors without an actor check; Clara's stuck reasons, the pending unregistered-bid count and scheduled-job status are internal.
- **Setup.** Project with Clara auto-pilot stuck, one unregistered (email) bid pending, a scheduled publish job.
- **Steps.** As the QA vendor list its events.
- **Expected.** None of those fields in the vendor's card.
- **Oracle.** Vendor project card lacks `clara_stuck_reasons`, `pending_unregistered_bids_count`, scheduled-job status (`event_group/card_serializer.rb:3-6, 26-44, 100-104`).
- **Trace.** P2 · automate-later · `R-VIS-027-5` · `app/serializers/event_group/card_serializer.rb:3-44, 100-104`

## 4. The project page a vendor opens

#### API-EVRVIS-018 — A vendor opening the project page receives no award proposals
- **Why it matters.** Users without teams default to the "purchase" mode, and vendor users have no teams — so the project page hands vendors the award proposals with L1 / non-L1 totals and the note for approval.
- **Setup.** Project with an award proposal submitted; the QA vendor invited (and bid).
- **Steps.** As the QA vendor, open the project page.
- **Expected.** No proposals in the vendor's view.
- **Oracle.** Vendor `GET /event_groups/:id` → `proposals` = []; today `get_proposals_for_user` returns [] only when `!is_purchaser?`, and `authorized_modes` = ["purchase"] for a user with no teams (`user.rb:570-574`).
- **Trace.** P0 · automate-later · `R-VIS-030-2` `R-VIS-030-4` `R-VIS-003-7` `R-VIS-003-4` `R-VIS-003-5` · `app/models/user.rb:563-581` · `app/controllers/concerns/event_group_controller_helper.rb:840-842`

#### API-EVRVIS-019 — A vendor opening a technical round's live page receives no technical proposals or results
- **Why it matters.** The same "purchaser" default reaches the technical round, where proposals carry the evaluation outcome.
- **Setup.** Technical round evaluated, recommendation submitted; the QA vendor responded.
- **Steps.** As the QA vendor, open the technical round.
- **Expected.** No proposals, no evaluation results.
- **Oracle.** Vendor `schema` on the RFP: no `proposals`, `show_evaluation_results` false (`v1/trade_controller.rb:384-385`).
- **Trace.** P0 · automate-later · `R-VIS-037-3` `R-VIS-037-5` · `app/controllers/api/v1/trade_controller.rb:376-390`

#### API-EVRVIS-020 — The project page keeps the buyer's notes and history away from vendors
- **Why it matters.** Clara's summary, the ownership trail, last-purchase-order refresh data and amendment remarks are buyer working notes.
- **Setup.** Project amended once with a remark, ownership transferred, last-PO data refreshed.
- **Steps.** As the QA vendor open the project page.
- **Expected.** None of those in the vendor's view; stage owner name only for the buyer.
- **Oracle.** Vendor project show lacks `clara_summary`, `owner_trail`, `lpo_refresh_data`, `amendment_remarks` (today sent unconditionally, `show_serializer.rb:242-244, 290-331`); stage `owner` empty for the vendor (`:107-110`).
- **Trace.** P1 · automate-later · `R-VIS-029-1` `R-VIS-028-2` · `app/serializers/event_group/show_serializer.rb:107-110, 242-331`

#### API-EVRVIS-021 — Line items: last purchase price is buyer-only; PR creator details and quantities are hidden from vendors and brokers when configured
- **Why it matters.** The last PO price is the buyer's benchmark; PR creator contacts let a vendor bypass procurement.
- **Setup.** Project lines with last-PO data; gate: `mask_pr_creator_details_for_vendor` on and quantity widgets disabled.
- **Steps.** Read the project's line items as the buyer, as the QA vendor, and (if available) as a broker user.
- **Expected.** Buyer: all fields. Vendor and broker: no last-PO fields, no PR creator name/phone/email, no quantity.
- **Oracle.** `get_line_items`: `last_po_*` only when `is_client_side`; creator and quantity masking today checks category "seller" only, so a broker still receives them (gap).
- **Trace.** P1 · automate-later · `R-VIS-031-2` `R-VIS-031-3` `R-VIS-031-4` `R-VIS-031-7` · `app/controllers/api/event_groups_controller.rb:493-495` · `app/serializers/event_group_line_item_serializer.rb:27-40`

## 5. Masked buyers

#### API-EVRVIS-022 — With vendor masking, buyer users see aliases and no vendor contact details
- **Why it matters.** Masking lets a buyer team evaluate without knowing who quoted; the real name or the bidder's phone in any one field defeats it.
- **Setup.** gate: vendor masking on; RFQ live, two vendors bid; a buyer user without the unmask right.
- **Steps.** As that buyer read the bids list, the rejected bids, bidder remarks and a single bid.
- **Expected.** Aliases everywhere; no bidder phone or email.
- **Oracle.** Bid rows show `other_details.company_name` alias; `user.phone`/`email` absent (`bid_template_serializer.rb:211-213`). Surrogate/buyer-added remarks show the buyer company (`bidder_remarks_serializer.rb:11-15`).
- **Trace.** P1 · automate-later · `R-VIS-021-2` `R-VIS-021-3` `R-VIS-021-4` · `app/serializers/bid_template_serializer.rb:200-215` · `app/serializers/bidder_remarks_serializer.rb:11-15`

#### API-EVRVIS-023 — "Bidding statistics only" hides the participant list from the buyer too
- **Why it matters.** The stats-only mode is meant to show counts, not who; an empty participant list is the observable promise.
- **Setup.** gate: `show_bidding_stats_only`, on a live auction with two bids.
- **Steps.** As the buyer open the stage and the live indicators.
- **Expected.** Participants empty; live indicators empty.
- **Oracle.** Stage payload `participants` = {} (`trade_template_serializer.rb:239-243`); `event_indicators` → {} (masked).
- **Trace.** P2 · automate-later · `R-VIS-021-5` · `app/serializers/trade_template_serializer.rb:239-243` · `app/controllers/api/v1/trade_controller.rb:538-540`

## 6. Bid details, suspicious bids and other buyer reads

#### API-EVRVIS-024 — Reading one vendor's bid details: only the stage owner (or a super admin)
- **Why it matters.** The policy for this read always says yes; the only guard is "owner or super admin" in the action itself.
- **Setup.** Live price round owned by buyer user A; a colleague B in the same company, not the owner.
- **Steps.** As B, ask for the QA vendor's bid details on the round.
- **Expected.** Refused: "You are not allowed to perform this action".
- **Oracle.** `GET /bids/get_bid_details?…` → HTTP 422, code 101 (`bids_controller.rb:367-369`). A super admin of ANOTHER company passes this check (gap, `R-VIS-016-4`).
- **Trace.** P1 · manual · `R-VIS-016-2` `R-VIS-016-4` · `app/controllers/api/bids_controller.rb:357-369` · code 101

#### API-EVRVIS-025 — Bid details for a vendor with no bid is a "bid not found", not a crash
- **Why it matters.** Opening a vendor's row before it bids is ordinary; the action dereferences the missing bid and fails with an untyped error.
- **Setup.** Session: the BUYER (owner of the sandbox). The sandbox price round is live with no bids.
- **Steps.** Ask for the QA vendor's bid details on the round.
- **Expected.** Refused as "Bid not found".
- **Oracle.** HTTP 422, code 32 'Bid not found'. Today `bid` is nil and `bid.errors` (line 385) or `bid.id` (line 378) raises → HTTP 500.
- **Trace.** P1 · automate · `R-VIS-016-5` `R-VIS-016-1` · `app/controllers/api/bids_controller.rb:370-386` · code 32 · `EDGE-EVRVIS-025`

#### API-EVRVIS-026 — Bid details without the vendor, or for a round that does not exist, are refused with a clear reason
- **Why it matters.** Positive control for the parameter checks before the owner check.
- **Setup.** Session: the BUYER. The sandbox price round.
- **Steps.** 1. Ask for bid details without the vendor's company. 2. Ask with a stage id that does not exist.
- **Expected.** 1: "Insufficient parameters". 2: "Request not found".
- **Oracle.** 1: HTTP 422 code 2. 2: HTTP 422 code 4 (`bids_controller.rb:362-366`).
- **Trace.** P2 · automate · `R-VIS-016-1` · `app/controllers/api/bids_controller.rb:362-366` · code 2, 4 · `EDGE-EVRVIS-026` `EDGE-EVRVIS-027`

#### API-EVRVIS-027 — Suspicious-bid details are refused unless the stage turns the indicator on, and never name masked vendors
- **Why it matters.** The list maps IP addresses to vendor names; it must exist only where the buyer enabled it and must respect masking.
- **Setup.** Sandbox price round (indicator off by default); a second stage with the suspicious-bid indicator on (gate: `is_suspicious_bid_indicator_enabled`) and two vendors bidding from one IP.
- **Steps.** 1. As the buyer ask for the sandbox round's suspicious bids. 2. Ask for the second stage's. 3. Ask for a stage id that does not exist.
- **Expected.** 1: refused "You are not allowed to perform this action". 2: one entry, the IP's location and both vendor names (aliases if masking applies). 3: "Trade Request not found".
- **Oracle.** 1: HTTP 422 code 101 (`show_suspicious_bids?` false). 2: `[{ip, location, vendors:[…]}]`. 3: HTTP 422 code 95.
- **Trace.** P1 · automate · `R-VIS-009-1` `R-VIS-009-3` `R-VIS-009-4` · `app/controllers/api/bids_controller.rb:389-405` · code 101, 95 · `EDGE-EVRVIS-028` `EDGE-EVRVIS-029`

#### API-EVRVIS-028 — Creating an event needs the create permission and sourcing access
- **Why it matters.** A vendor-management-only user (onboarding team) must not be able to start sourcing events.
- **Setup.** A buyer user whose only team is vendor management (no create permission on trades).
- **Steps.** As that user try to add a stage to a draft project.
- **Expected.** Refused "not allowed".
- **Oracle.** HTTP 422, code 455 from `TradeRequestPolicy#create?` (`trade_request_policy.rb:13-16`); `has_access_for_sourcing_events?` false only when vendor management is the user's only mode.
- **Trace.** P1 · manual · `R-VIS-005-1` `R-VIS-003-6` · `app/policies/trade_request_policy.rb:13-16` · `app/models/user.rb:641-660` · code 455

#### API-EVRVIS-029 — A buyer working for several client companies sees only the company chosen at login
- **Why it matters.** Multi-company buyers pick a client company; everything they read must be boxed to it.
- **Setup.** A buyer mapped to two client companies; logs in choosing company 1; an event exists in company 2.
- **Steps.** Open company 2's event by its link.
- **Expected.** Not visible.
- **Oracle.** Read refused (455/536 per endpoint) because `allowed_companies` = [company 1] (`company.rb:466-468`).
- **Trace.** P1 · manual · `R-VIS-003-2` `R-VIS-003-1` · `app/models/company.rb:461-472`

#### API-EVRVIS-030 — A vendor's list of auctions it took part in opens even when one of them is a sealed-bid lot auction
- **Why it matters.** The serializer for that list is given no "allowed companies", so on a sealed lot stage it fails and the vendor's whole history list breaks.
- **Setup.** The QA vendor has bid in a sealed-bid auction closed on lot (any status).
- **Steps.** As the QA vendor (mobile app version that uses the new list, or the website) open "participated auctions".
- **Expected.** The list opens; that auction shows without rank.
- **Oracle.** `GET /v1/trade/get_participated_auctions` → HTTP 200; today `nil.exclude?` in `BidTemplateSerializer#get_data` → HTTP 500 (`participated_events_serializer.rb:52`, `bid_template_serializer.rb:26`).
- **Trace.** P1 · automate-later · `R-VIS-045-3` `R-VIS-045-1` · `app/serializers/participated_events_serializer.rb:52` · `app/serializers/bid_template_serializer.rb:26`

#### API-EVRVIS-031 — "Allowed to reopen" is not offered to vendors on a technical round
- **Why it matters.** The flag is true for every caller on an RFP; the screen may show vendors a reopen action the API should refuse.
- **Setup.** Closed technical round; the QA vendor responded.
- **Steps.** 1. As the QA vendor read the stage's reopen flag. 2. If the vendor app offers it, try to reopen.
- **Expected.** Flag false for the vendor; any reopen attempt refused.
- **Oracle.** Vendor stage `trade_config.is_allowed_to_reopen_event` false (today true, `trade_template_serializer.rb:808`); reopen as vendor → 401/422, never 200.
- **Trace.** P2 · automate-later · `R-VIS-036-5` `R-VIS-036-6` · `app/serializers/trade_template_serializer.rb:806-815`
