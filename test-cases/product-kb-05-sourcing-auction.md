# Product KB test cases — Sourcing › Auction

Generated from the Procol Notion Knowledge Base (help-centre articles) — each case is grounded in the article it traces to. Source pages are read-only; re-derive from Notion rather than editing facts here.

## 1. How to set up a Reverse Auction?

#### PRD-KBSRC-301 — Create and publish a reverse auction event end to end

- **Why it matters.** Setting up and publishing an auction is the entry to the create→publish→bid→award path; if it breaks, no auction can run.
- **Setup.** Buyer / Procurement Manager with access to the Create Event screen; at least one product with mapped vendors exists.
- **Steps.**
  1. On the **Create Event** screen select **Auction** as the event type.
  2. Choose how you will award (partial award to multiple vendors, or entire lot to a single vendor).
  3. Click on Select Template and choose a predefined **template**.
  4. Add products under the "Products" column from the dropdown and fill in all **mandatory fields** in the template table.
  5. Click the blue "Invite Vendors" in the green tip (or add vendors via Participants).
  6. Click the blue "Publish Event" button.
  7. In the pop-up, review the event details and click the blue "Publish" button.
- **Expected.** The event is now Live and an email notification is sent to all added participants inviting them to participate.
- **Oracle.** The confirmation "You Have Successfully Published your Auction Event !!" is shown, and each invited participant receives the invitation email.
- **Trace.** P0 · automate-later · `63892226c8b2834fbe728162cb1c400f` · `how-to-set-up-a-reverse-auction` · Notion KB › Sourcing › Auction › How to set up a Reverse Auction?

#### PRD-KBSRC-302 — Default event type for an auction is Rank on Line

- **Why it matters.** The default strategy decides what vendors see; a wrong default silently changes auction behaviour.
- **Setup.** Buyer on the Create Event screen.
- **Steps.**
  1. On the **Create Event** screen select **Auction** as the event type.
  2. Look at the **Event Type** badge without changing anything.
- **Expected.** The Event Type is set to **Rank on Line**, a type of Reverse Auction, by default.
- **Oracle.** The Event Type badge reads "Rank on Line".
- **Trace.** P2 · automate-later · `63892226c8b2834fbe728162cb1c400f` · `how-to-set-up-a-reverse-auction` · Notion KB › Sourcing › Auction › How to set up a Reverse Auction?

#### PRD-KBSRC-303 — Rank on Line badge opens the strategy side drawer

- **Why it matters.** The badge is the only stated way to reach the other auction strategies.
- **Setup.** Buyer on the Create Event screen with Auction selected.
- **Steps.**
  1. Click on the **Rank on Line** badge.
- **Expected.** A side drawer opens with multiple strategy options.
- **Oracle.** The side drawer is visible and lists several auction strategies.
- **Trace.** P2 · automate-later · `63892226c8b2834fbe728162cb1c400f` · `how-to-set-up-a-reverse-auction` · Notion KB › Sourcing › Auction › How to set up a Reverse Auction?

#### PRD-KBSRC-304 — Auction strategy can be changed before publishing

- **Why it matters.** Buyers must be able to correct the strategy while the event is still a draft.
- **Setup.** Buyer with an unpublished auction event on the Create Event screen.
- **Steps.**
  1. Click the **Rank on Line** badge to open the strategy side drawer.
  2. Select a different strategy.
- **Expected.** The strategy is updated on the unpublished event.
- **Oracle.** The Event Type badge shows the newly selected strategy.
- **Trace.** P2 · automate-later · `63892226c8b2834fbe728162cb1c400f` · `how-to-set-up-a-reverse-auction` · Notion KB › Sourcing › Auction › How to set up a Reverse Auction?

#### PRD-KBSRC-305 — Auction strategy cannot be changed after the event goes live

- **Why it matters.** Changing visibility/competition rules mid-auction would break fairness for vendors already bidding.
- **Setup.** Buyer with a published (live) auction event.
- **Steps.**
  1. Open the live auction event.
  2. Attempt to change the auction strategy.
- **Expected.** The strategy cannot be updated once the event is live.
- **Oracle.** No strategy change is possible on the live event; the original strategy remains in effect.
- **Trace.** P1 · automate-later · `63892226c8b2834fbe728162cb1c400f` · `how-to-set-up-a-reverse-auction` · Notion KB › Sourcing › Auction › How to set up a Reverse Auction?

#### PRD-KBSRC-306 — Partial award option runs the auction at line-item level

- **Why it matters.** The awarding type decides whether the auction competes per line item or per lot.
- **Setup.** Buyer creating an auction event.
- **Steps.**
  1. Under "Choose how you will award (to the vendors) in the event", pick "I may partially award the event to multiple vendors".
  2. Complete and publish the event.
- **Expected.** The auction runs at a line item level.
- **Oracle.** Bidding and ranks in the live auction are per line item.
- **Trace.** P2 · automate-later · `63892226c8b2834fbe728162cb1c400f` · `how-to-set-up-a-reverse-auction` · Notion KB › Sourcing › Auction › How to set up a Reverse Auction?

#### PRD-KBSRC-307 — Entire-lot award option runs the auction at lot level

- **Why it matters.** Lot-level auctions are required when one vendor must win everything.
- **Setup.** Buyer creating an auction event.
- **Steps.**
  1. Under "Choose how you will award (to the vendors) in the event", pick "I'll award the entire lot to a single vendor".
  2. Complete and publish the event.
- **Expected.** The auction runs at a Lot Level.
- **Oracle.** Bidding and ranks in the live auction are on the lot as a whole.
- **Trace.** P2 · automate-later · `63892226c8b2834fbe728162cb1c400f` · `how-to-set-up-a-reverse-auction` · Notion KB › Sourcing › Auction › How to set up a Reverse Auction?

#### PRD-KBSRC-308 — Line items are limited to 65 per auction template

- **Why it matters.** The article states a hard limit; exceeding it must be handled rather than corrupting the event.
- **Setup.** Buyer creating an auction event with a template selected.
- **Steps.**
  1. Add products row by row in the template table up to 65 line items.
  2. Try to add a 66th line item.
- **Expected.** Up to 65 line items can be added; the limit is enforced beyond that.
- **Oracle.** A tester confirms 65 rows are accepted and checks what happens on the 66th (the article does not state the message).
- **Trace.** P1 · manual · `63892226c8b2834fbe728162cb1c400f` · `how-to-set-up-a-reverse-auction` · Notion KB › Sourcing › Auction › How to set up a Reverse Auction?

#### PRD-KBSRC-309 — A new product row is added automatically after each product

- **Why it matters.** Buyers rely on the auto-added row to enter multiple products quickly.
- **Setup.** Buyer creating an auction event with a template selected.
- **Steps.**
  1. Click the cell beneath the "Products" column and select a product from the dropdown (typing narrows the search).
- **Expected.** A new row is automatically added for the next product.
- **Oracle.** The template table shows an extra empty row after the product is selected.
- **Trace.** P2 · automate-later · `63892226c8b2834fbe728162cb1c400f` · `how-to-set-up-a-reverse-auction` · Notion KB › Sourcing › Auction › How to set up a Reverse Auction?

#### PRD-KBSRC-310 — Shaded vendor fields cannot be filled by the buyer

- **Why it matters.** Vendor-owned fields (such as price) must not be pre-filled by the buyer.
- **Setup.** Buyer creating an auction event with products added to the template table.
- **Steps.**
  1. Try to type into a shaded-out field in the template table.
- **Expected.** Shaded out fields are for the Vendor to fill; the buyer cannot fill them.
- **Oracle.** The shaded field stays non-editable for the buyer.
- **Trace.** P1 · automate-later · `63892226c8b2834fbe728162cb1c400f` · `how-to-set-up-a-reverse-auction` · Notion KB › Sourcing › Auction › How to set up a Reverse Auction?

#### PRD-KBSRC-311 — Suggested vendors are added via Invite Vendors

- **Why it matters.** Vendor suggestions from product mapping are the fastest way to invite participants.
- **Setup.** Buyer creating an auction event; products added have mapped vendors.
- **Steps.**
  1. After adding products, locate the green tip.
  2. Click the blue "Invite Vendors".
- **Expected.** The vendors mapped to the added products are automatically added as participants.
- **Oracle.** The suggested vendors appear in the event's participants.
- **Trace.** P2 · automate-later · `63892226c8b2834fbe728162cb1c400f` · `how-to-set-up-a-reverse-auction` · Notion KB › Sourcing › Auction › How to set up a Reverse Auction?

#### PRD-KBSRC-312 — Vendors can be searched, filtered and added manually via Participants

- **Why it matters.** Buyers need to invite vendors beyond the automatic suggestions.
- **Setup.** Buyer creating an auction event.
- **Steps.**
  1. Click on Participants.
  2. Search or filter vendors and add one manually.
- **Expected.** The participants screen opens and the chosen vendor is added.
- **Oracle.** The manually added vendor is listed as a participant.
- **Trace.** P2 · automate-later · `63892226c8b2834fbe728162cb1c400f` · `how-to-set-up-a-reverse-auction` · Notion KB › Sourcing › Auction › How to set up a Reverse Auction?

#### PRD-KBSRC-313 — Event title is auto-generated and editable

- **Why it matters.** The auto title must reflect the content yet stay editable for buyer naming conventions.
- **Setup.** Buyer creating an auction event with products and a location filled in.
- **Steps.**
  1. Look at the event title after adding products and location.
  2. Edit the title.
- **Expected.** Procol auto-generates the title from product and location names, and the buyer can edit it.
- **Oracle.** The title initially contains the product and location names and then shows the edited text.
- **Trace.** P2 · automate-later · `63892226c8b2834fbe728162cb1c400f` · `how-to-set-up-a-reverse-auction` · Notion KB › Sourcing › Auction › How to set up a Reverse Auction?

#### PRD-KBSRC-314 — Schedule the auction for later with Edit Schedule

- **Why it matters.** Buyers often need the auction to go live at a planned time rather than immediately.
- **Setup.** Buyer with a fully filled auction event.
- **Steps.**
  1. Click the blue "Publish Event" button.
  2. In the pop-up, press "Edit Schedule" instead of "Publish".
- **Expected.** The event can be scheduled for later instead of going live immediately.
- **Oracle.** A tester confirms the event is scheduled rather than immediately live (the article does not name the resulting status).
- **Trace.** P2 · manual · `63892226c8b2834fbe728162cb1c400f` · `how-to-set-up-a-reverse-auction` · Notion KB › Sourcing › Auction › How to set up a Reverse Auction?

## 2. How to choose and configure Auction Strategies?

#### PRD-KBSRC-315 — Strategy drawer offers all five auction strategies

- **Why it matters.** Each documented strategy must be selectable or the related auction types cannot run.
- **Setup.** Buyer on the Create Event screen with Auction selected.
- **Steps.**
  1. Click the **Rank on Line** badge to open the strategy side drawer.
  2. Review the strategy options.
- **Expected.** The strategies Rank Based, Price Based, Traffic Light, Knockout and Dutch Auction are available.
- **Oracle.** All five strategy names appear in the side drawer.
- **Trace.** P1 · automate-later · `3ff92226c8b2826fac9f0110421d35ce` · `how-to-choose-and-configure-auction-strategies` · Notion KB › Sourcing › Auction › How to choose and configure Auction Strategies?

#### PRD-KBSRC-316 — Rank Based: vendors see only their rank, not prices

- **Why it matters.** Hiding prices is the whole point of rank-based auctions (anti-collusion).
- **Setup.** Buyer publishes a Rank Based auction; two or more vendors bid.
- **Steps.**
  1. As a vendor, place a bid in the Rank Based auction.
  2. Look at the vendor bidding screen.
- **Expected.** Vendors only see their rank, not actual prices of competitors.
- **Oracle.** The vendor screen shows the vendor's rank and no competitor prices.
- **Trace.** P1 · automate-later · `3ff92226c8b2826fac9f0110421d35ce` · `how-to-choose-and-configure-auction-strategies` · Notion KB › Sourcing › Auction › How to choose and configure Auction Strategies?

#### PRD-KBSRC-317 — Price Based: vendors see the lowest bid price, not ranks

- **Why it matters.** Price-based auctions depend on vendors knowing the exact price to beat.
- **Setup.** Buyer publishes a Price Based auction; two or more vendors bid.
- **Steps.**
  1. As a vendor, place a bid in the Price Based auction.
  2. Look at the vendor bidding screen.
- **Expected.** Vendors see the lowest bid price on each item but not ranks.
- **Oracle.** The vendor screen shows the lowest price per item and no rank.
- **Trace.** P1 · automate-later · `3ff92226c8b2826fac9f0110421d35ce` · `how-to-choose-and-configure-auction-strategies` · Notion KB › Sourcing › Auction › How to choose and configure Auction Strategies?

#### PRD-KBSRC-318 — Traffic Light: vendors see a colour status only

- **Why it matters.** Traffic light auctions must not leak precise positioning.
- **Setup.** Buyer publishes a Traffic Light auction; vendors bid.
- **Steps.**
  1. As a vendor, place a bid in the Traffic Light auction.
  2. Look at the vendor bidding screen.
- **Expected.** Vendors see a colour-coded status (Green/Amber/Red) based on their bid range; no ranks or prices are shown.
- **Oracle.** The vendor screen shows only a colour status, without rank or competitor price.
- **Trace.** P1 · automate-later · `3ff92226c8b2826fac9f0110421d35ce` · `how-to-choose-and-configure-auction-strategies` · Notion KB › Sourcing › Auction › How to choose and configure Auction Strategies?

#### PRD-KBSRC-319 — Knockout: vendors can only accept or reject a target price

- **Why it matters.** Knockout auctions test acceptance of a fixed offer; free-form bidding would defeat that.
- **Setup.** Buyer publishes a Knockout auction; vendors invited.
- **Steps.**
  1. As a vendor, open the Knockout auction.
- **Expected.** Vendors are shown a target price and can only accept or reject it.
- **Oracle.** The vendor screen offers only accept/reject actions against the shown price.
- **Trace.** P1 · automate-later · `3ff92226c8b2826fac9f0110421d35ce` · `how-to-choose-and-configure-auction-strategies` · Notion KB › Sourcing › Auction › How to choose and configure Auction Strategies?

#### PRD-KBSRC-320 — Dutch: award goes first-come, first-serve at the pre-set price

- **Why it matters.** The first vendor to accept must win; any other rule changes who gets the award.
- **Setup.** Buyer publishes a Dutch auction; vendors invited.
- **Steps.**
  1. As a vendor, accept the current pre-set price.
- **Expected.** Items are awarded first-come, first-serve to the vendor willing to accept the pre-set price.
- **Oracle.** The first accepting vendor is the one awarded.
- **Trace.** P1 · automate-later · `3ff92226c8b2826fac9f0110421d35ce` · `how-to-choose-and-configure-auction-strategies` · Notion KB › Sourcing › Auction › How to choose and configure Auction Strategies?

#### PRD-KBSRC-321 — Rank Based: show rank for individual items

- **Why it matters.** Line-item-level events need per-item ranks rather than a single sum-total rank.
- **Setup.** Buyer creating a Rank Based auction with awarding type "partially award event to multiple vendors".
- **Steps.**
  1. Enable **"Show rank to vendor for individual item."**
  2. Publish; as a vendor, bid on several line items.
- **Expected.** Vendors see their rank for each line item rather than their rank on the Sum Total.
- **Oracle.** The vendor screen shows a rank against each line item.
- **Trace.** P1 · automate-later · `3ff92226c8b2826fac9f0110421d35ce` · `how-to-choose-and-configure-auction-strategies` · Notion KB › Sourcing › Auction › How to choose and configure Auction Strategies?

#### PRD-KBSRC-322 — Rank Based: minimum revisions before rank is shown

- **Why it matters.** Rank visibility gated on revisions forces vendors to engage before getting feedback.
- **Setup.** Buyer creating a Rank Based auction.
- **Steps.**
  1. Enable **"Set Minimum revision to show Rank"** and enter n in the input box that appears.
  2. Publish; as a vendor, revise the price fewer than n times, then n times.
- **Expected.** Ranks are shown to the vendor only after they have revised their price at least n times.
- **Oracle.** Rank is hidden before the nth revision and visible after it.
- **Trace.** P1 · automate-later · `3ff92226c8b2826fac9f0110421d35ce` · `how-to-choose-and-configure-auction-strategies` · Notion KB › Sourcing › Auction › How to choose and configure Auction Strategies?

#### PRD-KBSRC-323 — Price Based: minimum revisions before best price is shown

- **Why it matters.** Same revision gate as rank, applied to best-price visibility.
- **Setup.** Buyer creating a Price Based auction.
- **Steps.**
  1. Enable **"Set Minimum revision to show Best price"** and enter n.
  2. Publish; as a vendor, revise the price fewer than n times, then n times.
- **Expected.** The Best price is shown only after the vendor has revised their price at least n times.
- **Oracle.** Best price is hidden before the nth revision and visible after it.
- **Trace.** P1 · automate-later · `3ff92226c8b2826fac9f0110421d35ce` · `how-to-choose-and-configure-auction-strategies` · Notion KB › Sourcing › Auction › How to choose and configure Auction Strategies?

#### PRD-KBSRC-324 — Traffic Light: group vendors by Price or by Rank

- **Why it matters.** The grouping condition decides which bands apply.
- **Setup.** Buyer creating a Traffic Light auction.
- **Steps.**
  1. Set the grouping condition to Price, then to Rank.
- **Expected.** Either Price or Rank can be selected, and the bands switch to Price-based or Rank-based accordingly.
- **Oracle.** The band inputs change between price values and rank values.
- **Trace.** P2 · automate-later · `3ff92226c8b2826fac9f0110421d35ce` · `how-to-choose-and-configure-auction-strategies` · Notion KB › Sourcing › Auction › How to choose and configure Auction Strategies?

#### PRD-KBSRC-325 — Traffic Light: green band is inclusive of the entered value

- **Why it matters.** An off-by-one in band edges puts vendors in the wrong colour.
- **Setup.** Buyer creating a Traffic Light auction with green value X.
- **Steps.**
  1. Enter X for green.
  2. Publish; have a vendor bid exactly at X (price or rank) and another just above X.
- **Expected.** Green is assigned to all vendors whose price / rank is ≤ X; the value X itself is inclusive.
- **Oracle.** The vendor at exactly X shows green; the vendor above X does not.
- **Trace.** P1 · automate-later · `3ff92226c8b2826fac9f0110421d35ce` · `how-to-choose-and-configure-auction-strategies` · Notion KB › Sourcing › Auction › How to choose and configure Auction Strategies?

#### PRD-KBSRC-326 — Traffic Light: yellow band covers above X up to and including Y

- **Why it matters.** The yellow band bounds must be applied exactly as configured.
- **Setup.** Buyer creating a Traffic Light auction with green X and yellow Y.
- **Steps.**
  1. Enter X for green and Y for yellow.
  2. Publish; have vendors bid at a value > X and ≤ Y, and at a value > Y.
- **Expected.** Yellow is assigned to vendors whose price / rank is ≤ Y and > X.
- **Oracle.** The vendor between X and Y (inclusive of Y) shows yellow; the vendor above Y does not.
- **Trace.** P1 · automate-later · `3ff92226c8b2826fac9f0110421d35ce` · `how-to-choose-and-configure-auction-strategies` · Notion KB › Sourcing › Auction › How to choose and configure Auction Strategies?

#### PRD-KBSRC-327 — Traffic Light: minimum revisions before colour is shown

- **Why it matters.** Colour visibility can be gated on vendor engagement.
- **Setup.** Buyer creating a Traffic Light auction.
- **Steps.**
  1. Enable **"Set Minimum revision to show Traffic Light color"** and enter n.
  2. Publish; as a vendor, revise the price fewer than n times, then n times.
- **Expected.** The traffic light colour is shown only after the vendor has revised their price at least n times.
- **Oracle.** Colour is hidden before the nth revision and visible after it.
- **Trace.** P1 · automate-later · `3ff92226c8b2826fac9f0110421d35ce` · `how-to-choose-and-configure-auction-strategies` · Notion KB › Sourcing › Auction › How to choose and configure Auction Strategies?

#### PRD-KBSRC-328 — Knockout configuration: offer basis, starting price, tick size, time difference

- **Why it matters.** These four settings define every Knockout round.
- **Setup.** Buyer creating a Knockout auction.
- **Steps.**
  1. Select the offer basis: "Best Price" or "Total Amount".
  2. Set the Starting Price.
  3. Add the Tick Size (price difference between two successive offers).
  4. Add the Time Difference (time between two successive offers).
- **Expected.** All four settings are accepted and saved on the event.
- **Oracle.** The configured values are shown on the event before publishing.
- **Trace.** P1 · automate-later · `3ff92226c8b2826fac9f0110421d35ce` · `how-to-choose-and-configure-auction-strategies` · Notion KB › Sourcing › Auction › How to choose and configure Auction Strategies?

#### PRD-KBSRC-329 — Dutch with "Offers on Best Price" requires a closing condition

- **Why it matters.** Without a closing condition a best-price Dutch auction has no defined end.
- **Setup.** Buyer creating a Dutch auction.
- **Steps.**
  1. Select **"Offers on Best Price"**.
- **Expected.** The buyer has to select the condition for closing the auction.
- **Oracle.** A closing-condition selector is shown and must be filled.
- **Trace.** P1 · automate-later · `3ff92226c8b2826fac9f0110421d35ce` · `how-to-choose-and-configure-auction-strategies` · Notion KB › Sourcing › Auction › How to choose and configure Auction Strategies?

#### PRD-KBSRC-330 — Dutch with "Offers on Total Amount" hides the closing condition

- **Why it matters.** Total-amount Dutch auctions always close on a single vendor, so the condition must not be asked.
- **Setup.** Buyer creating a Dutch auction.
- **Steps.**
  1. Select **"Offers on Total Amount"**.
- **Expected.** No closing condition is needed; it is hidden because only single vendor closing is done.
- **Oracle.** The closing-condition selector is not shown.
- **Trace.** P1 · automate-later · `3ff92226c8b2826fac9f0110421d35ce` · `how-to-choose-and-configure-auction-strategies` · Notion KB › Sourcing › Auction › How to choose and configure Auction Strategies?

#### PRD-KBSRC-331 — Dutch configuration: starting and ending price, tick size, time difference

- **Why it matters.** These values define the Dutch price ladder and when it stops.
- **Setup.** Buyer creating a Dutch auction.
- **Steps.**
  1. Set the Starting Price and Ending Price.
  2. Add the Tick Size.
  3. Add the Time Difference.
- **Expected.** The settings are accepted and saved on the event.
- **Oracle.** The configured values are shown on the event before publishing.
- **Trace.** P1 · automate-later · `3ff92226c8b2826fac9f0110421d35ce` · `how-to-choose-and-configure-auction-strategies` · Notion KB › Sourcing › Auction › How to choose and configure Auction Strategies?

## 3. How to run a Rank-Based Auction event?

#### PRD-KBSRC-332 — Open a published auction and reach the Auction Responses tab

- **Why it matters.** Monitoring live bids is the core of running an auction.
- **Setup.** Buyer with a published rank-based auction event.
- **Steps.**
  1. Navigate to the **Events** tab on the left-hand menu.
  2. Find and click on the card for the published event.
- **Expected.** The buyer is directed to the Auction Responses tab where vendor quotes can be monitored and managed.
- **Oracle.** The Auction Responses tab is open showing vendor quotes.
- **Trace.** P0 · automate-later · `94092226c8b28362ae4881e5e7c6274e` · `how-to-run-a-rank-based-auction-event` · Notion KB › Sourcing › Auction › How to run a Rank-Based Auction event?

#### PRD-KBSRC-333 — Reach the auction from a project's Auction tab

- **Why it matters.** Project-based sourcing needs a second entry point to the same auction.
- **Setup.** Buyer with a project that contains a published auction.
- **Steps.**
  1. Go to the project.
  2. Navigate to the Auction Tab.
- **Expected.** The auction responses for that project are shown.
- **Oracle.** The Auction tab shows the vendor quotes for the project's auction.
- **Trace.** P2 · automate-later · `94092226c8b28362ae4881e5e7c6274e` · `how-to-run-a-rank-based-auction-event` · Notion KB › Sourcing › Auction › How to run a Rank-Based Auction event?

#### PRD-KBSRC-334 — QCS shows ranks per line item and next to vendor names

- **Why it matters.** Buyers decide awards from these ranks.
- **Setup.** Buyer on the Auction Responses tab; several vendors have bid.
- **Steps.**
  1. Scroll through the line items in the comparison.
- **Expected.** The QCS assigns ranks to each vendor at line item level and next to the vendor's name.
- **Oracle.** Each line item shows vendor ranks, and each vendor name shows a rank.
- **Trace.** P1 · automate-later · `94092226c8b28362ae4881e5e7c6274e` · `how-to-run-a-rank-based-auction-event` · Notion KB › Sourcing › Auction › How to run a Rank-Based Auction event?

#### PRD-KBSRC-335 — L1 price is highlighted in green

- **Why it matters.** The lowest price must be unmistakable to the buyer.
- **Setup.** Buyer on the Auction Responses tab; several vendors have bid.
- **Steps.**
  1. Compare vendor prices on a line item.
- **Expected.** The system automatically highlights the **L1 (Lowest)** price in green for each line item.
- **Oracle.** The lowest price cell per line item is green.
- **Trace.** P1 · automate-later · `94092226c8b28362ae4881e5e7c6274e` · `how-to-run-a-rank-based-auction-event` · Notion KB › Sourcing › Auction › How to run a Rank-Based Auction event?

#### PRD-KBSRC-336 — Savings percentage icon versus the vendor's previous bid

- **Why it matters.** Buyers track how much each revision saved.
- **Setup.** Buyer on the Auction Responses tab; a vendor has revised a bid.
- **Steps.**
  1. Look at the revised bid in the comparison.
- **Expected.** A percentage icon next to the bid shows the savings compared to that vendor's previous bid.
- **Oracle.** The percentage matches the difference between the previous and current bid.
- **Trace.** P2 · automate-later · `94092226c8b28362ae4881e5e7c6274e` · `how-to-run-a-rank-based-auction-event` · Notion KB › Sourcing › Auction › How to run a Rank-Based Auction event?

#### PRD-KBSRC-337 — Reject a bid and allow the seller to bid again

- **Why it matters.** Buyers must be able to discard an invalid bid without excluding the vendor.
- **Setup.** Buyer on the Auction Responses tab; a vendor has bid.
- **Steps.**
  1. Click the **three-dot menu** next to the vendor's name.
  2. Select **Reject Bid**.
  3. Check the box allowing the seller to bid again and confirm.
- **Expected.** The bid is removed from the comparison view and the QCS, and the seller is allowed to bid again.
- **Oracle.** The bid no longer appears in the QCS, and the vendor can still place a new bid.
- **Trace.** P1 · automate-later · `94092226c8b28362ae4881e5e7c6274e` · `how-to-run-a-rank-based-auction-event` · Notion KB › Sourcing › Auction › How to run a Rank-Based Auction event?

#### PRD-KBSRC-338 — Reject a bid without allowing the seller to bid again

- **Why it matters.** Buyers must be able to exclude a vendor from further bidding.
- **Setup.** Buyer on the Auction Responses tab; a vendor has bid.
- **Steps.**
  1. Click the **three-dot menu** next to the vendor's name and select **Reject Bid**.
  2. Leave the allow-to-bid-again box unchecked and confirm.
- **Expected.** The bid is removed from the comparison view and QCS, and the seller is not allowed to bid again.
- **Oracle.** The bid is gone from the QCS, and the vendor cannot place a new bid.
- **Trace.** P1 · automate-later · `94092226c8b28362ae4881e5e7c6274e` · `how-to-run-a-rank-based-auction-event` · Notion KB › Sourcing › Auction › How to run a Rank-Based Auction event?

#### PRD-KBSRC-339 — Jump to a previous bid version from the Current bid hover

- **Why it matters.** Bid history supports audit and negotiation.
- **Setup.** Buyer on the Auction Responses tab; a vendor has revised several times.
- **Steps.**
  1. Hover over the "Current bid" value.
  2. Select a previous bid version.
- **Expected.** The vendor's past bids are shown and the buyer can jump to the selected version.
- **Oracle.** The displayed bid changes to the chosen past version.
- **Trace.** P2 · automate-later · `94092226c8b28362ae4881e5e7c6274e` · `how-to-run-a-rank-based-auction-event` · Notion KB › Sourcing › Auction › How to run a Rank-Based Auction event?

#### PRD-KBSRC-340 — Cycle bid revisions with the arrow buttons

- **Why it matters.** Quick stepping through revisions without leaving the QCS.
- **Setup.** Buyer on the Auction Responses tab; a vendor has revised several times.
- **Steps.**
  1. Use the arrow buttons next to the bid value to go back through revisions.
  2. Use them to return to the current bid.
- **Expected.** The buyer can cycle through previous revisions and go back to the current bid.
- **Oracle.** The bid value changes per click and finally shows the current bid again.
- **Trace.** P2 · automate-later · `94092226c8b28362ae4881e5e7c6274e` · `how-to-run-a-rank-based-auction-event` · Notion KB › Sourcing › Auction › How to run a Rank-Based Auction event?

#### PRD-KBSRC-341 — Send a counter offer from the comparison view

- **Why it matters.** Counter offers are the buyer's negotiation lever during the auction.
- **Setup.** Buyer on the Auction Responses tab; a vendor has bid.
- **Steps.**
  1. Locate the vendor name in the comparison view.
  2. Click the **Counter Offer** button under the vendor name.
- **Expected.** The buyer is taken to the counter offer interface to configure and send revised expectations to the vendor.
- **Oracle.** The counter offer interface opens for that vendor.
- **Trace.** P1 · automate-later · `94092226c8b28362ae4881e5e7c6274e` · `how-to-run-a-rank-based-auction-event` · Notion KB › Sourcing › Auction › How to run a Rank-Based Auction event?

#### PRD-KBSRC-342 — Show Best Prices reveals best price to suppliers and adds a QCS row

- **Why it matters.** Switching on best-price visibility changes what vendors see mid-auction.
- **Setup.** Buyer on the Auction Responses tab of a live rank-based auction.
- **Steps.**
  1. Click the **Actions** button.
  2. Select **Show Best Prices**.
- **Expected.** Suppliers see the exact best price for each line item, and the QCS gets an extra row per line item with the lowest bid across vendors.
- **Oracle.** The vendor screen shows best prices; the buyer QCS shows the extra lowest-bid row.
- **Trace.** P1 · automate-later · `94092226c8b28362ae4881e5e7c6274e` · `how-to-run-a-rank-based-auction-event` · Notion KB › Sourcing › Auction › How to run a Rank-Based Auction event?

#### PRD-KBSRC-343 — Enable Vendor Masking hides vendor names and the participants tab

- **Why it matters.** Masking prevents bias while bidding is open.
- **Setup.** Buyer on the Auction Responses tab of a live auction.
- **Steps.**
  1. Click the **Actions** button.
  2. Select **Enable Vendor Masking**.
- **Expected.** All vendor names are hidden until bidding ends and replaced with Vendor 1, 2, 3 … N; the participants tab is also hidden.
- **Oracle.** The QCS shows "Vendor 1", "Vendor 2"… instead of names, and the participants tab is not visible.
- **Trace.** P1 · automate-later · `94092226c8b28362ae4881e5e7c6274e` · `how-to-run-a-rank-based-auction-event` · Notion KB › Sourcing › Auction › How to run a Rank-Based Auction event?

#### PRD-KBSRC-344 — View-Only Mode blocks counter offers, quote edits and surrogate bids

- **Why it matters.** View-only mode is a stated restriction used to freeze the auction for observers.
- **Setup.** Buyer on the Auction Responses tab of a live auction.
- **Steps.**
  1. Click **Actions** and select **Enable View-Only Mode**.
  2. Try to send a counter offer, edit a quote and place a surrogate bid.
- **Expected.** Users are restricted from sending counter offers, editing quotes or placing surrogate bids.
- **Oracle.** None of the three actions can be performed while the mode is on.
- **Trace.** P1 · automate-later · `94092226c8b28362ae4881e5e7c6274e` · `how-to-run-a-rank-based-auction-event` · Notion KB › Sourcing › Auction › How to run a Rank-Based Auction event?

#### PRD-KBSRC-345 — Disable View-Only Mode by clicking the same action again

- **Why it matters.** The mode must be reversible or the buyer loses control of the auction.
- **Setup.** Buyer with View-Only Mode enabled on a live auction.
- **Steps.**
  1. Click **Actions** and click the View-Only Mode action again.
  2. Try to send a counter offer.
- **Expected.** View-Only Mode is disabled and the restricted actions are available again.
- **Oracle.** The counter offer action works after disabling.
- **Trace.** P2 · automate-later · `94092226c8b28362ae4881e5e7c6274e` · `how-to-run-a-rank-based-auction-event` · Notion KB › Sourcing › Auction › How to run a Rank-Based Auction event?

#### PRD-KBSRC-346 — Send a bulk counter offer to all vendors from Settings

- **Why it matters.** Bulk counter offers push all vendors at once during the auction.
- **Setup.** Buyer on a live auction with several vendors bidding.
- **Steps.**
  1. Click on Settings and find "Send Bulk Counter Offers".
  2. Decide the counter offer to send to all vendors and click on Send.
- **Expected.** The counter offer is sent to all vendors.
- **Oracle.** Each vendor has the counter offer on their side.
- **Trace.** P1 · automate-later · `94092226c8b28362ae4881e5e7c6274e` · `how-to-run-a-rank-based-auction-event` · Notion KB › Sourcing › Auction › How to run a Rank-Based Auction event?

#### PRD-KBSRC-347 — Award the auction from the MQCS tab

- **Why it matters.** Awarding closes the create→publish→bid→award path.
- **Setup.** Buyer who has completed evaluation and sent counter offers on the auction.
- **Steps.**
  1. Navigate to the **MQCS** tab.
  2. Follow the awarding process (described in the "Awarding Process" article).
- **Expected.** The auction can be awarded from the MQCS tab.
- **Oracle.** A tester confirms the award is started from the MQCS tab (details live in the awarding article).
- **Trace.** P0 · manual · `94092226c8b28362ae4881e5e7c6274e` · `how-to-run-a-rank-based-auction-event` · Notion KB › Sourcing › Auction › How to run a Rank-Based Auction event?

## 4. Cost Breakdown Mode

#### PRD-KBSRC-348 — Convert an RFQ to an auction with Cost Breakdown Mode enabled

- **Why it matters.** Cost breakdown captures lump-sum auction prices yet still yields item prices for PO and audit.
- **Setup.** Buyer / Purchaser with an RFQ that has vendor quotes.
- **Steps.**
  1. Navigate to the RFQ to convert and click **"Convert to Auction"**.
  2. On the auction creation page, click the **Event Type** with "Rank on line" below it.
  3. Select the checkbox **"Enable Cost Breakdown Mode"**.
  4. Configure other auction settings and launch the auction.
- **Expected.** The auction launches with vendors placing a lot-level bid during the auction and line-item pricing requested during the CBD window.
- **Oracle.** The live auction shows submissions as Auto-breakdown bids on the Sum Total.
- **Trace.** P0 · automate-later · `79792226c8b282488053817b07f0b667` · `cost-breakdown-mode` · Notion KB › Sourcing › Auction › Cost Breakdown Mode

#### PRD-KBSRC-349 — Cost Breakdown Mode tooltip text

- **Why it matters.** The tooltip is the in-product explanation of the mode.
- **Setup.** Buyer on the auction creation page.
- **Steps.**
  1. Hover over the eye icon beside "Enable Cost Breakdown Mode".
- **Expected.** The tooltip reads "Choosing this option will enable vendors to submit their responses with a single value. Vendors will be asked to fill the justified prices in the allotted CBD Time after the bidding ends."
- **Oracle.** The tooltip text matches exactly.
- **Trace.** P3 · automate-later · `79792226c8b282488053817b07f0b667` · `cost-breakdown-mode` · Notion KB › Sourcing › Auction › Cost Breakdown Mode

#### PRD-KBSRC-350 — During submission time, bids are on Sum Total and auto-broken down pro rata

- **Why it matters.** The pro-rata auto breakdown is what the buyer sees until vendors justify prices.
- **Setup.** Live cost-breakdown auction; vendors have bid.
- **Steps.**
  1. As buyer, view the auction responses during submission time.
- **Expected.** Vendors bid on the Sum Total only; all submissions appear as Auto-breakdown bids, broken down on a pro-rata basis.
- **Oracle.** Each bid shows the vendor's total amount (highlighted) with pro-rata item values.
- **Trace.** P1 · automate-later · `79792226c8b282488053817b07f0b667` · `cost-breakdown-mode` · Notion KB › Sourcing › Auction › Cost Breakdown Mode

#### PRD-KBSRC-351 — Vendor sees the total-lot bidding message

- **Why it matters.** Vendors must know they are bidding on the lot and will owe a breakdown later.
- **Setup.** Vendor invited to a live cost-breakdown auction.
- **Steps.**
  1. As vendor, open the auction.
- **Expected.** The vendor sees "You are bidding on the total lot amount we received from your RFQ Quotes. A request for line item-wise cost breakdown will be triggered once the auction submission time ends."
- **Oracle.** The message text is shown on the vendor screen.
- **Trace.** P2 · automate-later · `79792226c8b282488053817b07f0b667` · `cost-breakdown-mode` · Notion KB › Sourcing › Auction › Cost Breakdown Mode

#### PRD-KBSRC-352 — Vendor reduces the Sum Total by a fixed value

- **Why it matters.** Fixed-value reduction is one of the two ways to bid in this mode.
- **Setup.** Vendor in a live cost-breakdown auction with a Sum Total (e.g. ₹11,204.34).
- **Steps.**
  1. Keep "Fixed Value" in the dropdown and enter a reduction (e.g. ₹204.34).
  2. Click **Revise Bid**.
- **Expected.** The new current bid reflects the fixed reduction.
- **Oracle.** The current bid equals the Sum Total minus the entered value.
- **Trace.** P1 · automate-later · `79792226c8b282488053817b07f0b667` · `cost-breakdown-mode` · Notion KB › Sourcing › Auction › Cost Breakdown Mode

#### PRD-KBSRC-353 — Vendor reduces the Sum Total by a percentage

- **Why it matters.** Percentage discount is the second way to bid in this mode.
- **Setup.** Vendor in a live cost-breakdown auction.
- **Steps.**
  1. Select **"Percentage"** in the dropdown next to "Fixed Value" and enter a discount (e.g. 10%).
  2. Click **Revise Bid**.
- **Expected.** The new current bid reflects the percentage discount on the Sum Total.
- **Oracle.** The current bid equals the Sum Total less the entered percentage.
- **Trace.** P1 · automate-later · `79792226c8b282488053817b07f0b667` · `cost-breakdown-mode` · Notion KB › Sourcing › Auction › Cost Breakdown Mode

#### PRD-KBSRC-354 — Cost Breakdown Time starts automatically when submission time ends

- **Why it matters.** The CBD window must open without buyer action or vendors cannot justify prices.
- **Setup.** Live cost-breakdown auction nearing the end of submission time.
- **Steps.**
  1. Let the submission time end.
- **Expected.** The Cost Breakdown Time (CBD time) begins automatically, and vendors are prompted to break down their total bid across line items.
- **Oracle.** Buyer and vendor screens show the Cost Breakdown Time running.
- **Trace.** P1 · automate-later · `79792226c8b282488053817b07f0b667` · `cost-breakdown-mode` · Notion KB › Sourcing › Auction › Cost Breakdown Mode

#### PRD-KBSRC-355 — Buyer extends the Cost Breakdown Time

- **Why it matters.** Vendors may need more time to justify prices.
- **Setup.** Buyer on a cost-breakdown auction during CBD time.
- **Steps.**
  1. Extend the Cost Breakdown Time.
- **Expected.** The Cost Breakdown Time is extended.
- **Oracle.** The CBD end time/timer shows the added time.
- **Trace.** P2 · automate-later · `79792226c8b282488053817b07f0b667` · `cost-breakdown-mode` · Notion KB › Sourcing › Auction › Cost Breakdown Mode

#### PRD-KBSRC-356 — Breakdown is pre-filled pro rata and editable by the vendor

- **Why it matters.** Pre-fill speeds up submission while allowing the vendor to justify item prices.
- **Setup.** Vendor during CBD time.
- **Steps.**
  1. Open the cost breakdown prompt.
  2. Change the discount on one price and manually edit another price.
- **Expected.** The system has already filled in the auto breakdown (pro-rata discounts); the vendor can change discounts and edit each price.
- **Oracle.** Pre-filled values are present initially and the edits are accepted.
- **Trace.** P2 · automate-later · `79792226c8b282488053817b07f0b667` · `cost-breakdown-mode` · Notion KB › Sourcing › Auction › Cost Breakdown Mode

#### PRD-KBSRC-357 — No line item may exceed its RFQ value in the breakdown

- **Why it matters.** Item prices above the RFQ quote would inflate the PO beyond what was offered.
- **Setup.** Vendor during CBD time.
- **Steps.**
  1. Edit one line item price to a value greater than its RFQ value.
  2. Try to submit.
- **Expected.** The system does not allow an individual line item price greater than the RFQ value; an error message is shown.
- **Oracle.** An error is displayed and the breakdown cannot be submitted.
- **Trace.** P1 · automate-later · `79792226c8b282488053817b07f0b667` · `cost-breakdown-mode` · Notion KB › Sourcing › Auction › Cost Breakdown Mode

#### PRD-KBSRC-358 — Breakdown total must match the auction bid, with amount to reduce shown

- **Why it matters.** The item prices must add up to the price the vendor won with.
- **Setup.** Vendor during CBD time.
- **Steps.**
  1. Edit prices so the total exceeds the submitted auction bid.
  2. Try to submit.
- **Expected.** An error message is shown and the system indicates how much needs to be reduced further.
- **Oracle.** The error states the remaining amount to reduce; submission is blocked until totals match.
- **Trace.** P1 · automate-later · `79792226c8b282488053817b07f0b667` · `cost-breakdown-mode` · Notion KB › Sourcing › Auction › Cost Breakdown Mode

#### PRD-KBSRC-359 — Submit Cost Breakdown locks item prices after confirmation

- **Why it matters.** The final item prices feed PO and audit and must be locked.
- **Setup.** Vendor during CBD time with a valid breakdown.
- **Steps.**
  1. Click **Submit Cost Breakdown**.
  2. Read the confirmation dialog and click **Yes, Submit**.
- **Expected.** The dialog says "This is the final submission for item prices. Once submitted, you won't be able to change these item prices."; after confirming, the breakdown is locked and a success confirmation is shown.
- **Oracle.** The vendor sees the confirmation that the cost breakdown was successfully submitted and justified; prices are no longer editable.
- **Trace.** P0 · automate-later · `79792226c8b282488053817b07f0b667` · `cost-breakdown-mode` · Notion KB › Sourcing › Auction › Cost Breakdown Mode

#### PRD-KBSRC-360 — Submitted breakdown cannot be revised unless reopened or countered

- **Why it matters.** The article states a revision lock with two exceptions.
- **Setup.** Vendor who has submitted a cost breakdown.
- **Steps.**
  1. As vendor, try to revise the submitted breakdown.
  2. As buyer, reopen the window or share a counteroffer; retry as vendor.
- **Expected.** The vendor cannot revise the breakdown unless the buyer reopens the window or shares counteroffers.
- **Oracle.** Revision is blocked before the buyer action and possible after it (the article does not describe the reopen steps).
- **Trace.** P1 · manual · `79792226c8b282488053817b07f0b667` · `cost-breakdown-mode` · Notion KB › Sourcing › Auction › Cost Breakdown Mode

#### PRD-KBSRC-361 — Buyer sees the "Supplier Submitted CB" tag

- **Why it matters.** The buyer needs to know which vendors have justified their prices.
- **Setup.** Buyer on a cost-breakdown auction; a vendor has submitted a breakdown.
- **Steps.**
  1. View that vendor's bid on the buyer screen.
- **Expected.** The bid shows the **"Supplier Submitted CB"** tag.
- **Oracle.** The tag is visible on the vendor's bid.
- **Trace.** P1 · automate-later · `79792226c8b282488053817b07f0b667` · `cost-breakdown-mode` · Notion KB › Sourcing › Auction › Cost Breakdown Mode

## 5. How to create Serial Bidding events

#### PRD-KBSRC-362 — Create and publish a serial bidding auction

- **Why it matters.** Serial bidding runs each line item on its own clock; setup errors break the whole sequence.
- **Setup.** Buyer able to create events.
- **Steps.**
  1. Create a new event in Procol.
  2. In the **Event Type** dropdown, select **Auction**.
  3. Enable the **Serial Bidding** toggle checkbox.
  4. Enter the **duration** for each Line Item.
  5. Add the required **Line Items**.
  6. Publish the event.
- **Expected.** The auction is published with line items opening one at a time, each with its own submission duration.
- **Oracle.** On the vendor side only one line item is active at a time.
- **Trace.** P0 · automate-later · `37a92226c8b28341bef7012f3622efc7` · `how-to-create-serial-bidding-events` · Notion KB › Sourcing › Auction › How to create Serial Bidding events

#### PRD-KBSRC-363 — Total submission time is calculated from the number of line items

- **Why it matters.** The event end time must cover every line item's slot.
- **Setup.** Buyer creating an auction with Serial Bidding enabled and a per-line-item duration.
- **Steps.**
  1. Add line items and watch the total submission time.
  2. Add one more line item.
- **Expected.** The system automatically calculates the total submission time based on the number of line items.
- **Oracle.** The total submission time changes when the line item count changes.
- **Trace.** P1 · automate-later · `37a92226c8b28341bef7012f3622efc7` · `how-to-create-serial-bidding-events` · Notion KB › Sourcing › Auction › How to create Serial Bidding events

#### PRD-KBSRC-364 — Vendor can bid only on the current active line item

- **Why it matters.** This is the defining restriction of serial bidding.
- **Setup.** Vendor in a live serial bidding auction with several line items.
- **Steps.**
  1. Place a bid on the current active line item.
  2. Try to bid on another line item.
- **Expected.** Vendors can only bid on the current active Line Item.
- **Oracle.** Bidding works only on the active line item.
- **Trace.** P1 · automate-later · `37a92226c8b28341bef7012f3622efc7` · `how-to-create-serial-bidding-events` · Notion KB › Sourcing › Auction › How to create Serial Bidding events

#### PRD-KBSRC-365 — Upcoming line items are visible but not actionable

- **Why it matters.** Vendors can plan ahead without bidding out of turn.
- **Setup.** Vendor in a live serial bidding auction.
- **Steps.**
  1. Look at an upcoming line item and try to act on it.
- **Expected.** Vendors can view upcoming line items but cannot take any action on them.
- **Oracle.** Upcoming items are listed with no enabled bid action.
- **Trace.** P1 · automate-later · `37a92226c8b28341bef7012f3622efc7` · `how-to-create-serial-bidding-events` · Notion KB › Sourcing › Auction › How to create Serial Bidding events

#### PRD-KBSRC-366 — Closed line items move to Ended Bidding with no further action

- **Why it matters.** Closed items must be frozen so late bids cannot land.
- **Setup.** Vendor in a live serial bidding auction.
- **Steps.**
  1. Wait for the active line item's duration to end.
  2. Look for it and try to act on it.
- **Expected.** The line item moves to the **Ended Bidding** category, where no further action is possible.
- **Oracle.** The item appears under Ended Bidding with no enabled actions.
- **Trace.** P1 · automate-later · `37a92226c8b28341bef7012f3622efc7` · `how-to-create-serial-bidding-events` · Notion KB › Sourcing › Auction › How to create Serial Bidding events

#### PRD-KBSRC-367 — Buyer sees a normal auction interface for serial bidding

- **Why it matters.** Serial bidding only changes the vendor experience; the buyer view should stay familiar.
- **Setup.** Buyer on a live serial bidding auction.
- **Steps.**
  1. Open the auction as buyer.
- **Expected.** The buyer sees the auction interface similar to a normal auction.
- **Oracle.** A tester compares the buyer screen with a normal auction screen.
- **Trace.** P2 · manual · `37a92226c8b28341bef7012f3622efc7` · `how-to-create-serial-bidding-events` · Notion KB › Sourcing › Auction › How to create Serial Bidding events

#### PRD-KBSRC-368 — Re-open closed line items with a new duration

- **Why it matters.** Buyers need a second chance on line items that closed too early.
- **Setup.** Buyer on a serial bidding auction with at least one ended line item.
- **Steps.**
  1. On the buyer screen, go to **Settings**.
  2. Click **Re-Open Line Items**; a side drawer opens.
  3. Enter the new **duration** for each re-opened line item.
  4. Select the line item(s) to re-open.
  5. Click **Re-Open**.
- **Expected.** The submission time restarts for the selected items.
- **Oracle.** The selected items become active for bidding again with the new duration.
- **Trace.** P1 · automate-later · `37a92226c8b28341bef7012f3622efc7` · `how-to-create-serial-bidding-events` · Notion KB › Sourcing › Auction › How to create Serial Bidding events

## 6. How to Run a Price - Based Auction

#### PRD-KBSRC-369 — Create and publish a Price Based auction

- **Why it matters.** Main setup flow for the price-based strategy on the core auction path.
- **Setup.** Buyer able to create events; vendors to invite.
- **Steps.**
  1. Create a new event in Procol.
  2. In the **Event Type** dropdown, select **Auction**.
  3. Select the "Price Based" Auction Strategy.
  4. Click on Save and Publish the Event.
- **Expected.** The Price Based auction is published.
- **Oracle.** The event is live with the Price Based strategy shown.
- **Trace.** P0 · automate-later · `1fe92226c8b28207b67a01f1e19a21bf` · `how-to-run-a-price-based-auction` · Notion KB › Sourcing › Auction › How to Run a Price - Based Auction

#### PRD-KBSRC-370 — Buyer sees the best price among all bids

- **Why it matters.** Buyers track the current best price in price-based auctions.
- **Setup.** Live Price Based auction; vendors have bid.
- **Steps.**
  1. As buyer, open the auction responses.
- **Expected.** The buyer can see the best price among all bids.
- **Oracle.** The best price shown equals the lowest submitted bid.
- **Trace.** P1 · automate-later · `1fe92226c8b28207b67a01f1e19a21bf` · `how-to-run-a-price-based-auction` · Notion KB › Sourcing › Auction › How to Run a Price - Based Auction

#### PRD-KBSRC-371 — Vendors see the Best Price to beat

- **Why it matters.** Vendors must know which price to beat.
- **Setup.** Live Price Based auction; vendors have bid.
- **Steps.**
  1. As vendor, open the auction.
- **Expected.** The vendor can see the Best Price.
- **Oracle.** The vendor screen shows the current best price.
- **Trace.** P1 · automate-later · `1fe92226c8b28207b67a01f1e19a21bf` · `how-to-run-a-price-based-auction` · Notion KB › Sourcing › Auction › How to Run a Price - Based Auction

#### PRD-KBSRC-372 — Turn on Show Rank in a Price Based auction

- **Why it matters.** Buyers can add rank visibility on top of best price.
- **Setup.** Buyer on a live Price Based auction.
- **Steps.**
  1. Click on Actions.
  2. Click the checkbox next to show Rank to toggle it on.
- **Expected.** Ranks are shown next to the Best Price.
- **Oracle.** Ranks appear beside the Best Price.
- **Trace.** P2 · automate-later · `1fe92226c8b28207b67a01f1e19a21bf` · `how-to-run-a-price-based-auction` · Notion KB › Sourcing › Auction › How to Run a Price - Based Auction

## 7. How to Run a Traffic Light Auction

#### PRD-KBSRC-373 — Create and publish a Traffic Light auction

- **Why it matters.** Main setup flow for the traffic-light strategy on the core auction path.
- **Setup.** Buyer able to create events; vendors to invite.
- **Steps.**
  1. Create a new event in Procol.
  2. In the **Event Type** dropdown, select **Auction**.
  3. Select the "Traffic Light" Auction Strategy.
  4. Choose the grouping condition.
  5. Make sure awarding is on the entire lot.
  6. Configure the ranges.
  7. Click on Save and Publish the Event.
- **Expected.** The Traffic Light auction is published with the configured ranges.
- **Oracle.** The event is live with the Traffic Light strategy and the configured bands.
- **Trace.** P0 · automate-later · `89292226c8b2822485b681e22c9c65a6` · `how-to-run-a-traffic-light-auction` · Notion KB › Sourcing › Auction › How to Run a Traffic Light Auction

#### PRD-KBSRC-374 — Traffic Light auction must award on the entire lot

- **Why it matters.** The article requires lot-level awarding for this strategy.
- **Setup.** Buyer creating a Traffic Light auction.
- **Steps.**
  1. Select the Traffic Light strategy.
  2. Check the awarding type, and try to use partial (line-item) awarding.
- **Expected.** Awarding is on the entire lot for a Traffic Light auction.
- **Oracle.** A tester confirms the event uses entire-lot awarding (the article does not state what happens with partial awarding).
- **Trace.** P1 · manual · `89292226c8b2822485b681e22c9c65a6` · `how-to-run-a-traffic-light-auction` · Notion KB › Sourcing › Auction › How to Run a Traffic Light Auction

#### PRD-KBSRC-375 — Traffic lights are assigned per the configured conditions

- **Why it matters.** Colour assignment is the output of the whole strategy.
- **Setup.** Live Traffic Light auction; all vendors have submitted.
- **Steps.**
  1. As buyer, view the auction responses.
- **Expected.** Traffic lights are assigned to vendors based on the conditions set by the buyer.
- **Oracle.** Each vendor's colour matches the configured bands for their price/rank.
- **Trace.** P1 · automate-later · `89292226c8b2822485b681e22c9c65a6` · `how-to-run-a-traffic-light-auction` · Notion KB › Sourcing › Auction › How to Run a Traffic Light Auction

#### PRD-KBSRC-376 — Vendor sees their current zone and can bid to move zones

- **Why it matters.** Vendors improve bids by trial and error based only on their zone.
- **Setup.** Vendor in a live Traffic Light auction.
- **Steps.**
  1. As vendor, view the current zone.
  2. Revise the bid.
- **Expected.** The vendor sees which zone they are in and can only use trial and error to move to a safer zone such as green or yellow.
- **Oracle.** The zone shown updates after a revised bid crosses a band.
- **Trace.** P1 · automate-later · `89292226c8b2822485b681e22c9c65a6` · `how-to-run-a-traffic-light-auction` · Notion KB › Sourcing › Auction › How to Run a Traffic Light Auction

#### PRD-KBSRC-377 — Best price and rank can also be shown in a Traffic Light auction

- **Why it matters.** Buyers can add more visibility to a traffic light auction.
- **Setup.** Buyer on a Traffic Light auction.
- **Steps.**
  1. Look for the options to show Best price and Rank and enable them.
- **Expected.** Best price and Rank can be shown in the traffic light auction.
- **Oracle.** A tester confirms best price and rank become visible (the article does not name the exact control).
- **Trace.** P2 · manual · `89292226c8b2822485b681e22c9c65a6` · `how-to-run-a-traffic-light-auction` · Notion KB › Sourcing › Auction › How to Run a Traffic Light Auction

## 8. How to Run a Knockout Auction

#### PRD-KBSRC-378 — Create and publish a Knockout auction

- **Why it matters.** Main setup flow for the knockout strategy on the core auction path.
- **Setup.** Buyer able to create events; vendors to invite.
- **Steps.**
  1. Create a new event in Procol.
  2. In the **Event Type** dropdown, select **Auction**.
  3. Select the Knockout auction strategy.
  4. Choose on which entity offers should be based.
  5. Add the Starting price, Tick Size and Time difference between each consecutive offer.
  6. Click on Save and Publish the Event.
- **Expected.** The Knockout auction is published.
- **Oracle.** The Responses tab shows the current round, upcoming offers and list of bidders.
- **Trace.** P0 · automate-later · `51c92226c8b28281a485810edb48fab9` · `how-to-run-a-knockout-auction` · Notion KB › Sourcing › Auction › How to Run a Knockout Auction

#### PRD-KBSRC-379 — Responses tab shows current round, upcoming offers and bidders

- **Why it matters.** Buyers monitor knockout rounds from this screen.
- **Setup.** Published Knockout auction.
- **Steps.**
  1. Open the **Responses tab**.
- **Expected.** It shows current round details (offer amount, tick size, time difference), upcoming offers and the list of bidders.
- **Oracle.** All three sections are visible with the configured values.
- **Trace.** P1 · automate-later · `51c92226c8b28281a485810edb48fab9` · `how-to-run-a-knockout-auction` · Notion KB › Sourcing › Auction › How to Run a Knockout Auction

#### PRD-KBSRC-380 — Each round presents a fixed offer stepped by the tick size

- **Why it matters.** The offer ladder must follow the configured tick size.
- **Setup.** Published Knockout auction with starting price X and a tick size.
- **Steps.**
  1. Observe the offer in round 1 and in the following rounds.
- **Expected.** Each round presents a fixed offer (₹X, then ₹X - Tick Size, and so on).
- **Oracle.** Consecutive round offers differ by exactly the tick size.
- **Trace.** P1 · automate-later · `51c92226c8b28281a485810edb48fab9` · `how-to-run-a-knockout-auction` · Notion KB › Sourcing › Auction › How to Run a Knockout Auction

#### PRD-KBSRC-381 — Vendor who accepts moves to the next round

- **Why it matters.** Acceptance is what keeps a vendor in the knockout.
- **Setup.** Vendor in a live Knockout auction.
- **Steps.**
  1. Click **Accept** on the current offer.
- **Expected.** The vendor moves forward to the next round.
- **Oracle.** The vendor remains in the list of bidders for the next round.
- **Trace.** P1 · automate-later · `51c92226c8b28281a485810edb48fab9` · `how-to-run-a-knockout-auction` · Notion KB › Sourcing › Auction › How to Run a Knockout Auction

#### PRD-KBSRC-382 — Vendor who does not accept is knocked out

- **Why it matters.** Only accepting vendors may continue; otherwise the last-man-standing rule fails.
- **Setup.** Vendor in a live Knockout auction.
- **Steps.**
  1. Click **Not Accept** on the current offer.
- **Expected.** The vendor does not move forward to the next round.
- **Oracle.** The vendor is no longer among the bidders still in the running.
- **Trace.** P1 · automate-later · `51c92226c8b28281a485810edb48fab9` · `how-to-run-a-knockout-auction` · Notion KB › Sourcing › Auction › How to Run a Knockout Auction

#### PRD-KBSRC-383 — Buyer extends the ongoing Knockout round

- **Why it matters.** Buyers need to give vendors more time within a round.
- **Setup.** Buyer on a live Knockout auction.
- **Steps.**
  1. Click the **plus button (+)** in the round controls.
  2. Select additional time.
- **Expected.** The time for the ongoing round is extended.
- **Oracle.** The round timer shows the added time.
- **Trace.** P2 · automate-later · `51c92226c8b28281a485810edb48fab9` · `how-to-run-a-knockout-auction` · Notion KB › Sourcing › Auction › How to Run a Knockout Auction

#### PRD-KBSRC-384 — Buyer updates tick size and time difference mid-auction

- **Why it matters.** Buyers can change the pace of the knockout while it runs.
- **Setup.** Buyer on a live Knockout auction.
- **Steps.**
  1. Edit the tick size and time difference fields.
  2. Click **Update**.
- **Expected.** The new tick size and time difference are applied.
- **Oracle.** Round details and upcoming offers reflect the updated values.
- **Trace.** P2 · automate-later · `51c92226c8b28281a485810edb48fab9` · `how-to-run-a-knockout-auction` · Notion KB › Sourcing › Auction › How to Run a Knockout Auction

#### PRD-KBSRC-385 — Award a Knockout bid and request approval

- **Why it matters.** Awarding is the money step that closes the knockout.
- **Setup.** Buyer on a Knockout auction with bidders still in the running.
- **Steps.**
  1. On the right side, view the list of bidders still in the running.
  2. Click **Select Bid** on the vendor to award.
  3. In the full-screen awarding window, confirm the proposal amount.
  4. Choose an **approval workflow**.
  5. Click **Next → Review → Request Approval**.
- **Expected.** The bid is sent for approval and the system completes the awarding process.
- **Oracle.** The awarding proposal shows as sent for approval.
- **Trace.** P0 · automate-later · `51c92226c8b28281a485810edb48fab9` · `how-to-run-a-knockout-auction` · Notion KB › Sourcing › Auction › How to Run a Knockout Auction

#### PRD-KBSRC-386 — Purchase Order is generated automatically after award approval

- **Why it matters.** The PO is the downstream money document of the auction.
- **Setup.** Knockout award sent for approval.
- **Steps.**
  1. Have the approval completed.
  2. Look for the PO.
- **Expected.** A **Purchase Order (PO)** is generated automatically after approval.
- **Oracle.** A PO exists for the awarded vendor and amount.
- **Trace.** P0 · automate-later · `51c92226c8b28281a485810edb48fab9` · `how-to-run-a-knockout-auction` · Notion KB › Sourcing › Auction › How to Run a Knockout Auction

## 9. How to Run a Dutch Auction.

#### PRD-KBSRC-387 — Create and publish a Dutch auction

- **Why it matters.** Main setup flow for the Dutch strategy on the core auction path.
- **Setup.** Buyer able to create events; vendors to invite.
- **Steps.**
  1. Create a new event in Procol.
  2. In the **Event Type** dropdown, select **Auction**.
  3. Select the Dutch auction strategy.
  4. Choose on which entity offers should be based.
  5. Choose on which condition the event should close.
  6. Configure the Starting Price, Ending Price, Tick Size and Time Difference.
  7. Click on Save and Publish the Event.
- **Expected.** The Dutch auction is published.
- **Oracle.** The Responses tab shows the current round (with End Price), upcoming offers and list of bidders.
- **Trace.** P0 · automate-later · `13292226c8b2821aa94c8125a45ae6aa` · `how-to-run-a-dutch-auction` · Notion KB › Sourcing › Auction › How to Run a Dutch Auction.

#### PRD-KBSRC-388 — Responses tab shows round details including End Price

- **Why it matters.** Buyers monitor the Dutch ladder and its stop price from this screen.
- **Setup.** Published Dutch auction.
- **Steps.**
  1. Open the **Responses tab**.
- **Expected.** It shows current round details (offer amount, End Price, tick size, time difference), upcoming offers and the list of bidders.
- **Oracle.** All sections are visible with the configured values.
- **Trace.** P1 · automate-later · `13292226c8b2821aa94c8125a45ae6aa` · `how-to-run-a-dutch-auction` · Notion KB › Sourcing › Auction › How to Run a Dutch Auction.

#### PRD-KBSRC-389 — End Price cannot be edited

- **Why it matters.** The End Price is the stated stop price; changing it mid-auction would alter the outcome.
- **Setup.** Buyer on a published Dutch auction.
- **Steps.**
  1. Try to edit the End Price in the round controls.
- **Expected.** The End Price cannot be edited.
- **Oracle.** No edit control is available for the End Price, while tick size and time difference remain editable.
- **Trace.** P1 · automate-later · `13292226c8b2821aa94c8125a45ae6aa` · `how-to-run-a-dutch-auction` · Notion KB › Sourcing › Auction › How to Run a Dutch Auction.

#### PRD-KBSRC-390 — Next round offer moves by the tick size when no vendor accepts

- **Why it matters.** The price ladder must move exactly by the tick size toward the End Price.
- **Setup.** Live Dutch auction with a starting price, tick size and End Price.
- **Steps.**
  1. Let a round pass with no vendor accepting.
  2. Observe the next round's offer.
- **Expected.** The next round starts with the offer being "Starting Price" + Tick Size, moving round by round until the End Price is reached.
- **Oracle.** The new offer differs from the previous one by exactly the tick size.
- **Trace.** P1 · automate-later · `13292226c8b2821aa94c8125a45ae6aa` · `how-to-run-a-dutch-auction` · Notion KB › Sourcing › Auction › How to Run a Dutch Auction.

#### PRD-KBSRC-391 — First vendor to accept closes the auction and is awarded

- **Why it matters.** First-come, first-serve awarding is the defining Dutch rule and a money outcome.
- **Setup.** Live Dutch auction with two or more vendors.
- **Steps.**
  1. As one vendor, click **Accept** on the current offer.
- **Expected.** The auction is closed and the vendor who accepted is awarded the bid.
- **Oracle.** The auction shows closed with the bid awarded to the accepting vendor; other vendors can no longer accept.
- **Trace.** P0 · automate-later · `13292226c8b2821aa94c8125a45ae6aa` · `how-to-run-a-dutch-auction` · Notion KB › Sourcing › Auction › How to Run a Dutch Auction.

#### PRD-KBSRC-392 — Auction closes without award when End Price is reached with no acceptance

- **Why it matters.** The no-award outcome must be clean rather than awarding someone by default.
- **Setup.** Live Dutch auction.
- **Steps.**
  1. Let every round pass without any vendor accepting until the End Price is reached.
- **Expected.** The auction is closed without awarding to any vendor.
- **Oracle.** The auction shows closed with no awarded vendor.
- **Trace.** P1 · automate-later · `13292226c8b2821aa94c8125a45ae6aa` · `how-to-run-a-dutch-auction` · Notion KB › Sourcing › Auction › How to Run a Dutch Auction.

#### PRD-KBSRC-393 — Buyer extends the ongoing Dutch round

- **Why it matters.** Buyers need to give vendors more time within a round.
- **Setup.** Buyer on a live Dutch auction.
- **Steps.**
  1. Click the **plus button (+)** in the round controls.
  2. Select additional time.
- **Expected.** The time for the ongoing round is extended.
- **Oracle.** The round timer shows the added time.
- **Trace.** P2 · automate-later · `13292226c8b2821aa94c8125a45ae6aa` · `how-to-run-a-dutch-auction` · Notion KB › Sourcing › Auction › How to Run a Dutch Auction.

#### PRD-KBSRC-394 — Buyer updates tick size and time difference in a Dutch auction

- **Why it matters.** Buyers can change the pace of the Dutch ladder while it runs.
- **Setup.** Buyer on a live Dutch auction.
- **Steps.**
  1. Edit the tick size and time difference fields.
  2. Click **Update**.
- **Expected.** The new tick size and time difference are applied.
- **Oracle.** Round details and upcoming offers reflect the updated values.
- **Trace.** P2 · automate-later · `13292226c8b2821aa94c8125a45ae6aa` · `how-to-run-a-dutch-auction` · Notion KB › Sourcing › Auction › How to Run a Dutch Auction.
