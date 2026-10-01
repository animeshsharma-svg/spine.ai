# Bidding matrix — several vendors, bids on a vendor's behalf, and the clock

These cases check what happens when **more than one vendor** takes part in a
sourcing event: invitations reach every vendor, each vendor bids through its own
supplier login, the buyer can (and sometimes must not) bid on a vendor's behalf,
the technical round never ends after the pricing round, nobody bids once the
submission time is over, extending the time lets bids in again, and awarding
follows the rules.

They are run by the platform's bidding matrix (`prototype/src/checks/biddingMatrix.ts`,
`npm run matrix -- --company <id> --combos M1,M5`), one combination (M1…M14) per
event, on PROCOL DEMO (198678) and Demo Account 2 (32461) only. The vendors are
the platform's own QA vendors ("QA_Platform Vendor n …", emails
qa_…@example.com, active buyer link), made through Procol's own invite and
vendor-signup screens' API — never a real supplier. Each case names its
combination in the Trace line; codes and endpoints stay in the Trace line.

---

## 1. Several vendors bid through their own login

#### API-XMAT-001 — Every invited vendor can open the event and bid
- **Why it matters.** Inviting three vendors is pointless if only the first one can actually see the event and bid.
- **Setup.** Three QA vendors with an active link. A pricing round (RFQ) open for about three minutes with all three invited.
- **Steps.** 1. Publish the event. 2. Sign in as each vendor in turn. 3. Each opens a bid, prices the line (₹100, ₹110, ₹120) and submits.
- **Expected.** All three bids are accepted and submitted.
- **Oracle.** Each vendor's open, price and submit calls succeed.
- **Trace.** P0 · automate · combination M1 · `POST /v1/bids`, `POST /v1/bids/:id/create_bid_products`, `PATCH /v1/bids/:id`.

#### API-XMAT-002 — The buyer sees the lowest price as the best bid
- **Why it matters.** The comparison a buyer awards from must point at the cheapest vendor.
- **Setup.** As API-XMAT-001, after all three bids.
- **Steps.** 1. As the buyer, open the event's comparison (indicators and line prices).
- **Expected.** The ₹100 vendor is marked best bidder, the other two are not; the line's lowest (L1) price is ₹100.
- **Oracle.** event_indicators best_bidder flag per vendor; schema l1_prices.
- **Trace.** P1 · automate · combination M1 · `GET /v1/trade/:id/event_indicators`; `GET /v1/trade/:id/schema?l1_prices=true`; rank_calculator.rb:22-31.

#### API-XMAT-003 — A vendor does not see its own rank on an RFQ
- **Why it matters.** In a sealed RFQ a vendor must not learn where it stands; ranks are for auctions only.
- **Setup.** As API-XMAT-001.
- **Steps.** 1. As the ₹100 vendor, open the pricing round.
- **Expected.** The vendor's view carries no rank.
- **Oracle.** No rank value in the vendor's trade view.
- **Trace.** P1 · automate · combination M1 · trade_request.rb:655 (`should_show_rank?` false for RFQ).

#### API-XMAT-004 — An award can be split across three vendors
- **Why it matters.** Splitting a line between suppliers is common; with partial awarding on it must be accepted.
- **Setup.** PROCOL DEMO (partial awarding on). The round and its extra closing time have ended.
- **Steps.** 1. Open an award proposal. 2. Award 10 of 30 to each vendor. 3. Submit it into its approval workflow.
- **Expected.** The three-way award is accepted and submitted.
- **Oracle.** add_response and submit succeed.
- **Trace.** P1 · automate · combination M1 · `POST /proposal`, `POST /proposal/:id/add_response`, `POST /proposal/:id/submit`; proposal_helper.rb:811-844.

#### API-XMAT-005 — Two equal best prices are both shown as best
- **Why it matters.** With a tie, the buyer must see both vendors as best rather than one picked silently.
- **Setup.** Demo Account 2, two QA vendors, both bid ₹100.
- **Steps.** 1. Both vendors bid the same price. 2. As the buyer, open the comparison.
- **Expected.** Both vendors are marked best bidder; L1 price ₹100.
- **Oracle.** best_bidder flags.
- **Trace.** P2 · automate · combination M2 · rank_calculator.rb (dense rank; a tie at best shifts ranks).

#### API-XMAT-006 — An award line sent without a quantity awards nothing, yet the proposal can be submitted
- **Why it matters.** A buyer who leaves the quantity out should be told so; an award worth ₹0 should not go to approval.
- **Setup.** Demo Account 2 (partial awarding off). Two vendors each quoted the full quantity; the round has ended.
- **Steps.** 1. Open a proposal. 2. Add both vendors with no quantity on the line. 3. Submit.
- **Expected (today).** Seen on 1 Oct 2026: both adds and the submit were accepted, and the proposal's awarded value is ₹0 (no quantity was awarded). Desired: refused — either "award a quantity" or, if the quoted quantities are meant, 561 because together they exceed the line.
- **Oracle.** add_response and submit status; proposals.meta_data total_l1_proposal + total_non_l1_proposal = 0.
- **Trace.** P2 · manual · combination M2 (first version) · proposal_helper.rb:811-844; proposal 13318 on Demo Account 2.

#### API-XMAT-007 — Over-award with a stated quantity when partial awarding is off (suspected gap)
- **Why it matters.** Code reading suggests the quantity check is skipped when a quantity is sent and partial awarding is off, so twice the line could be awarded.
- **Setup.** As API-XMAT-006.
- **Steps.** 1. Open a proposal. 2. Award the full quantity to vendor 1. 3. Also award the full quantity to vendor 2, stating it (twice the line in total). 4. Leave the proposal unsubmitted.
- **Expected.** Refused (the total exceeds the line). If accepted, the suspected gap is confirmed.
- **Oracle.** Probe AWARD-QTY-GAP: accepted = defect confirmed.
- **Trace.** P1 · automate · combination M2 · proposal_helper.rb:811-844 (falls through with no check).

## 2. The buyer bids on a vendor's behalf

#### API-XMAT-010 — The buyer can bid for a vendor before bidding starts; the vendor cannot
- **Why it matters.** Surrogate bids are entered from paper quotes, often before the window opens; vendors themselves must wait for the start.
- **Setup.** PROCOL DEMO or Demo Account 2. A pricing round that starts in about 80 seconds, three QA vendors invited.
- **Steps.** 1. Before the start, enter a price on vendor 1's behalf. 2. Before the start, vendor 3 tries to open a bid.
- **Expected.** The surrogate bid is accepted; vendor 3 is refused because bidding has not started.
- **Oracle.** Surrogate call succeeds; vendor open refused with code 33.
- **Trace.** P0 · automate · combination M5 · `POST /bids/template_input`; api/bids_controller.rb:50; v1 bids helper:71-73 (33).

#### API-XMAT-011 — The buyer cannot bid for a vendor who already bid
- **Why it matters.** A surrogate bid must never overwrite what the vendor submitted.
- **Setup.** As API-XMAT-010, after the start; vendor 3 has submitted its own bid.
- **Steps.** 1. Enter a price on vendor 3's behalf.
- **Expected.** Refused: the vendor has already bid.
- **Oracle.** Refusal with code 96.
- **Trace.** P0 · automate · combination M5 · bids_controller_helper.rb:2741-2773 (96).

#### API-XMAT-012 — A second surrogate bid for the same vendor is refused
- **Why it matters.** Without the "revise surrogate bid" setting, the buyer must not replace an on-behalf bid.
- **Setup.** As API-XMAT-010; a surrogate bid exists for vendor 1.
- **Steps.** 1. Enter another price on vendor 1's behalf.
- **Expected.** Refused: a bid is already placed on this vendor's behalf.
- **Oracle.** Refusal with code 99.
- **Trace.** P1 · automate · combination M5 · bids_controller_helper.rb:2741-2773 (99).

#### API-XMAT-013 — A vendor can revise the bid the buyer entered for it
- **Why it matters.** The vendor stays in control of its own price once it signs in.
- **Setup.** As API-XMAT-012.
- **Steps.** 1. Sign in as vendor 1. 2. Open a bid, price it lower and submit.
- **Expected.** The vendor's revision is accepted.
- **Oracle.** Vendor open, price and submit succeed.
- **Trace.** P1 · automate · combination M5 · v1 bids helper:459-463, 808-810.

#### API-XMAT-014 — The buyer bids for a vendor that is not invited to the event (suspected defect)
- **Why it matters.** Only invited vendors should be in an event; code reading shows no audience check on the surrogate path.
- **Setup.** As API-XMAT-010; vendor 4 deals with the buyer but is not invited.
- **Steps.** 1. Enter a price on vendor 4's behalf.
- **Expected.** Refused. If accepted, the suspected defect is confirmed.
- **Oracle.** Probe S7-NO-AUDIENCE-CHECK: accepted = defect confirmed.
- **Trace.** P0 · automate · combination M5 · api/bids_controller.rb:51 (only can_place_bid_for_company); suspected defect 3.

#### API-XMAT-015 — The buyer cannot bid for a company it does not deal with
- **Why it matters.** A buyer must not create bids for strangers.
- **Setup.** As API-XMAT-010; a QA vendor of the other demo client.
- **Steps.** 1. Enter a price on that company's behalf.
- **Expected.** Refused: not allowed.
- **Oracle.** Refusal with code 101.
- **Trace.** P1 · automate · combination M5 · user.rb:685-687; company.rb:179-181 (101).

#### API-XMAT-016 — The buyer cannot use the vendor's own bid endpoint
- **Why it matters.** Buyers must go through the surrogate path, which records who entered the bid.
- **Setup.** As API-XMAT-010.
- **Steps.** 1. As the buyer, call the vendor's "open a bid" request for vendor 2.
- **Expected.** Refused — either by the app gate (the web console may not call the supplier API) or by the bid guard. Seen on both demo clients: the app gate refuses ("This app is not authorized to use this API"), and the buyer's web-console session stops working right after (the next request answers "Authentication failed").
- **Oracle.** Refusal with app_error_auth_failed or code 33; the run reopens a fresh buyer session afterwards.
- **Trace.** P2 · automate · combination M5 · v1 bids helper:9-13; suspected defect 1 (unreachable from the web console when the app gate refuses first).

#### API-XMAT-017 — The buyer cannot bid for a vendor after the bid end time
- **Why it matters.** The submission deadline applies to on-behalf bids too (no post-expiry setting on these clients).
- **Setup.** As API-XMAT-010, after the bid end, during the extra closing time.
- **Steps.** 1. Enter a price on vendor 2's behalf.
- **Expected.** Refused: the submission time is over.
- **Oracle.** Refusal with code 33.
- **Trace.** P0 · automate · combination M5 · api/bids_controller.rb:50 (33).

#### API-XMAT-018 — A surrogate price without a technical response (suspected gap)
- **Why it matters.** A vendor cannot price an RFQ without answering the RFP; the surrogate path has no such check.
- **Setup.** Technical round and pricing round, two QA vendors; vendor 2 never answers the technical round.
- **Steps.** 1. Enter a price on vendor 2's behalf on the pricing round.
- **Expected.** Refused like the vendor path (737). If accepted, the gap is confirmed.
- **Oracle.** Probe S11-NO-TECH-CHECK.
- **Trace.** P1 · automate · combination M4 · bids_controller_helper.rb:1110-1330 (no technical check).

#### API-XMAT-019 — A vendor cannot price the RFQ before answering the RFP
- **Why it matters.** The technical round gates the pricing round for invited vendors.
- **Setup.** As API-XMAT-018.
- **Steps.** 1. Vendor 1 opens a bid on the pricing round before answering the technical round.
- **Expected.** Refused: no technical response.
- **Oracle.** Refusal with code 737.
- **Trace.** P0 · automate · combination M4 · v1 bids helper:30-38, 313-320 (737).

#### API-XMAT-020 — The buyer cannot enter a technical response over the vendor's own
- **Why it matters.** The vendor's submitted answers must not be overwritten.
- **Setup.** As API-XMAT-018; vendor 1 has submitted its technical response.
- **Steps.** 1. Enter a technical response on vendor 1's behalf.
- **Expected.** Refused: an active response exists.
- **Oracle.** Refusal with code 30.
- **Trace.** P1 · automate · combination M4 · template_responses_controller_helper.rb:268-273 (30).

#### API-XMAT-021 — A vendor enters a technical response for another company (suspected defect)
- **Why it matters.** A supplier must only answer for itself; the surrogate technical endpoint has no company check.
- **Setup.** Technical round with two QA vendors invited.
- **Steps.** 1. As vendor 1, send a technical response for vendor 2's company.
- **Expected.** Refused. If accepted, the suspected defect is confirmed. Seen on PROCOL DEMO: refused by the app gate — the supplier app may not call this endpoint at all.
- **Oracle.** Probe TECH-FOR-ANY-COMPANY.
- **Trace.** P0 · automate · combination M14 · template_responses_controller.rb:224-238; suspected defect 2.

## 3. The clock: before, during, after, extended

#### API-XMAT-030 — In the extra closing time a vendor cannot change its price
- **Why it matters.** "The vendor should not be able to submit a bid after submission time is over."
- **Setup.** A pricing round whose bid end has passed and whose extra closing time is still running; two vendors bid earlier.
- **Steps.** 1. Vendor 1 opens a bid. 2. Prices the line. 3. Submits.
- **Expected.** A draft may open; pricing is refused (508) or submitting is refused (33). The price never changes.
- **Oracle.** Open: accepted or 33; price: 508 or 33; submit: 33.
- **Trace.** P0 · automate · combination M6 · bids_controller_helper.rb:792-804 (508); v1 bids helper:562-572 (33).

#### API-XMAT-031 — After the extra closing time a vendor cannot even open a bid
- **Why it matters.** Once the event is closed nothing should start a bid.
- **Setup.** As API-XMAT-030, after the extra closing time.
- **Steps.** 1. Vendor 2 opens a bid.
- **Expected.** Refused: the order is not active.
- **Oracle.** Refusal with code 33.
- **Trace.** P0 · automate · combination M6, M7 · v1 bids helper:71-73.

#### API-XMAT-032 — Extending the submission time reopens bidding
- **Why it matters.** "There is sometimes an option to extend submission time, then you can place the bid."
- **Setup.** PROCOL DEMO (users may reopen events). A closed pricing round where vendor 1 bid and vendor 2 did not.
- **Steps.** 1. As the buyer, extend the bid end by about two minutes. 2. Read the round's times back. 3. Vendor 2 bids. 4. Vendor 1 revises.
- **Expected.** The extension is accepted, the bid end moves and the extra closing time follows it; both bids are accepted.
- **Oracle.** Trade PATCH succeeds; bid end ≈ the new time; vendor calls succeed.
- **Trace.** P0 · automate · combination M7 · `PATCH /trade/:id {increase_auction_time}`; trade_controller_helper.rb:2018-2056, 5524-5561.

#### API-XMAT-033 — Reopening an expired round is refused where the client does not allow it
- **Why it matters.** Only some clients let users reopen an expired event.
- **Setup.** Demo Account 2 (reopen not allowed). A closed pricing round.
- **Steps.** 1. As the buyer, extend the bid end.
- **Expected.** Refused: reopening is not allowed.
- **Oracle.** Refusal with code 496.
- **Trace.** P1 · automate · combination M7 · trade_controller_helper.rb:5830-5832 (496).

#### API-XMAT-034 — A bid revised after it was put on a proposal blocks the proposal
- **Why it matters.** The buyer must not approve a price the vendor has since changed.
- **Setup.** As API-XMAT-032, bidding open again; vendor 1's bid is added to a proposal.
- **Steps.** 1. Vendor 1 revises. 2. The buyer submits the proposal.
- **Expected.** The submit is refused because the bid changed. Seen on PROCOL DEMO (1 Oct 2026): the revision takes the old bid off the proposal, so the refusal is "Proposal cannot be empty. Please award the vendors again." (683) rather than 1126 — either way the changed price cannot be approved.
- **Oracle.** Refusal with code 1126 or 683.
- **Trace.** P1 · automate · combination M7 · proposal_helper.rb:121-125, 241-250 (1126).

#### API-XMAT-035 — The time cannot be extended once a proposal exists
- **Why it matters.** Reopening bidding under an award in progress would let prices change under it.
- **Setup.** As API-XMAT-034.
- **Steps.** 1. Extend the bid end again.
- **Expected (today).** Refused because a proposal exists (801). Seen on PROCOL DEMO (1 Oct 2026): refused by the RFQ-changes guard instead, whose message — "You cannot edit rfq once the auction is created" (769) — names an auction the event does not have. Misleading message; 801 is never reached for an RFQ in an event project.
- **Oracle.** Refusal with code 801 or 769; 769's wording is the defect.
- **Trace.** P1 · automate · combination M7 · trade_controller_helper.rb:6794-6805 (801); api/trade_controller.rb:408; trade_request_model_helper.rb:1434-1445 (769).

#### API-XMAT-036 — An event whose technical round ends after its pricing round cannot be published
- **Why it matters.** Business rule: the RFP's end must not exceed the RFQ's.
- **Setup.** Technical round ending about 90 seconds after the pricing round.
- **Steps.** 1. Publish the event.
- **Expected.** Refused: the RFP duration exceeds the RFQ end time.
- **Oracle.** Refusal with code 712.
- **Trace.** P0 · automate · combination M8 · trade_controller_helper.rb:643-675; event_groups/update_service.rb:232 (712).

#### API-XMAT-037 — Extending only the technical round past the pricing round is refused
- **Why it matters.** The same rule holds after publishing.
- **Setup.** A live event whose technical round ends before its pricing round.
- **Steps.** 1. Extend the technical round to two minutes after the pricing round's end.
- **Expected.** Refused (712).
- **Oracle.** Refusal with code 712.
- **Trace.** P0 · automate · combination M8 · trade_controller_helper.rb:2025 (712).

#### API-XMAT-038 — Extending the technical round together with the pricing round is accepted
- **Why it matters.** The supported way to give more time to both rounds.
- **Setup.** As API-XMAT-037.
- **Steps.** 1. Extend the technical round with "extend the pricing round too". 2. Read the pricing round's end.
- **Expected.** Accepted; the pricing round now ends at or after the new technical end.
- **Oracle.** PATCH succeeds; pricing round bid end ≥ the new time.
- **Trace.** P1 · automate · combination M8 · `PATCH /trade/:id {increase_auction_time, extend_rfq_time:true}`; trade_controller_helper.rb:5754-5764.

#### API-XMAT-039 — Awarding while bidding is still open (suspected, possibly intended)
- **Why it matters.** Awards are blocked during bidding only when a setting is on, which no client has.
- **Setup.** Demo Account 2. A pricing round open for four minutes; one vendor bid.
- **Steps.** 1. While the round is open, open a proposal and award the vendor.
- **Expected.** Refused while bidding is open (720) — unless that is intended.
- **Oracle.** Probe AWARD-DURING-BIDDING.
- **Trace.** P2 · automate · combination M12 · event_group_controller_helper.rb:629-648; suspected defect 5.

#### API-XMAT-040 — A best-price request for one vendor lets another vendor revise (suspected)
- **Why it matters.** A window opened for vendor 1 only should not let vendor 2 in.
- **Setup.** PROCOL DEMO. A closed pricing round with two bids.
- **Steps.** 1. Ask vendor 1 only for a best price for two minutes. 2. Vendor 2 opens a bid.
- **Expected.** Vendor 2 is refused. If accepted, the restriction is UI-only.
- **Oracle.** Probe REVIEW-WINDOW-UI-ONLY.
- **Trace.** P2 · automate · combination M11 · trade_template_helper.rb:6532-6542; trade_request.rb:1185-1194; suspected defect 4.

## 4. Auctions and invitations

#### API-XMAT-050 — In an English auction a price that does not beat the best is refused
- **Why it matters.** Each new bidder must beat the current best price.
- **Setup.** PROCOL DEMO. An auction round with three QA vendors; vendor 1 bid ₹100.
- **Steps.** 1. Vendor 2 bids ₹100. 2. Vendor 2 bids ₹99. 3. The buyer enters ₹100 for vendor 3.
- **Expected.** ₹100 from vendor 2 is accepted as a tie or refused (38); ₹99 is accepted; ₹100 for vendor 3 is refused (38) only when the line has a ceiling price — the English-auction rule (best − tick) is applied only then (trade_product.rb:170). The matrix's rounds set no ceiling price, so ₹100 is accepted there.
- **Oracle.** Codes 38 / 98 as listed; vendor 2 sees rank 1.
- **Trace.** P1 · automate · combination M9 · trade_product.rb:170-179 (38); v1 bids helper:601, 628-641 (98).

#### API-XMAT-051 — A declined invitation does not stop a bid (suspected); a decline needs a reason
- **Why it matters.** A vendor that declined should not appear as a bidder; a decline without a reason is refused.
- **Setup.** PROCOL DEMO, a live pricing round with two QA vendors.
- **Steps.** 1. Vendor 1 declines with no reason. 2. Declines with a reason. 3. Opens a bid.
- **Expected.** No reason: refused (2). With a reason: recorded. The bid after declining should be refused; if accepted, the decline is not enforced.
- **Oracle.** Code 2; probe DECLINE-NOT-ENFORCED.
- **Trace.** P2 · automate · combination M13 · `POST /user_intents`; user_intents_controller.rb:4-24.

#### API-XMAT-052 — After converting an RFQ to an auction the vendor bids in the auction before the award
- **Why it matters.** The award goes to a vendor of the latest round; without an auction bid it is refused (826).
- **Setup.** The RFQ-then-auction journey.
- **Steps.** 1. The vendor bids on the RFQ. 2. The buyer converts the round to an auction. 3. The vendor bids in the auction. 4. The buyer awards.
- **Expected.** The auction bid and the award are accepted.
- **Oracle.** convert_auction step (with its auction bid) and award succeed; no 826.
- **Trace.** P0 · automate · journey RFQ-then-auction · `prototype/src/checks/eventJourney.ts` bidInAuction.

## 5. The test vendors themselves

#### API-XMAT-060 — A QA vendor invited with "skip onboarding" lands active and can sign in
- **Why it matters.** Multi-vendor tests need safe vendors; this is the path that gives an active link and a working login.
- **Setup.** PROCOL DEMO or Demo Account 2; a new qa_…@example.com address.
- **Steps.** 1. As the buyer, invite the vendor with "skip vendor onboarding". 2. Sign in as the vendor with the emailed code. 3. Complete the vendor signup. 4. Read the link, membership and invitation. 5. Sign in again.
- **Expected.** Link active after the invite; after signup the user belongs to the invited company and the invitation is accepted; both sign-ins work.
- **Oracle.** buyer_seller_company_mappings status 1; user_company_mappings active; invitations status accepted.
- **Trace.** P1 · automate · `prototype/src/checks/matrixVendors.ts` · `POST /invitations/send_invite`, `POST /v1/vendor_signup`; invitation/send_service.rb:386-393; invitation/accept_service.rb:46-55.
