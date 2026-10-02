# Product KB test cases — Sourcing › RFQ

Generated from the Procol Notion Knowledge Base (help-centre articles) — each case is grounded in the article it traces to. Source pages are read-only; re-derive from Notion rather than editing facts here.

## 1. How to set up an RFQ (Request for Quotation)?

#### PRD-KBSRC-043 — Set up and publish an RFQ awarded at line-item level

- **Why it matters.** RFQ create → publish is the core entry to the bid → award path.
- **Setup.** Buyer on the event setup screen (Event Type defaulting to Rank on Line); products with mapped vendors; a predefined template.
- **Steps.**
  1. Click the **Rank on Line** badge and choose **RFQ (Request for Quotation)** in the side drawer.
  2. Under "Choose how you will award (to the vendors) in the event", select "I may partially award the event to multiple vendors".
  3. Click Select Template and choose a predefined template.
  4. Add products beneath the "Products" column and fill in all mandatory fields.
  5. Click the blue "Invite Vendors" in the green tip (or add vendors via Participants).
  6. Click the blue "Publish Event" button, review the pop-up and click the blue "Publish" button.
- **Expected.** The RFQ runs at line item level; on publish an email notification is sent to all added participants inviting them to the event, which is now Live.
- **Oracle.** "You Have Successfully Published your RFQ Event" confirmation; the event is live on the Events page; participants receive the invitation email.
- **Trace.** P0 · automate-later · `0a792226c8b282b6a09f81f9b8bf4dec` · `how-to-set-up-an-rfq-request-for-quotation` · Notion KB › Sourcing › RFQ › How to set up an RFQ (Request for Quotation)?

#### PRD-KBSRC-044 — RFQ awarded as an entire lot to a single vendor runs at Lot level

- **Why it matters.** The awarding choice is the only RFQ configuration and decides whether the award can be split.
- **Setup.** Buyer on the event setup screen with RFQ chosen as Event Type.
- **Steps.**
  1. Observe the configurations offered for RFQ.
  2. Select "I'll award the entire lot to a single vendor".
  3. Complete template, products, vendors and publish.
- **Expected.** There is just one configuration to set when starting an RFQ (how you will award); selecting the entire-lot option runs the RFQ at a Lot Level.
- **Oracle.** The published RFQ shows lot-level awarding (tester verifies at award time that the whole lot goes to one vendor).
- **Trace.** P1 · automate-later · `0a792226c8b282b6a09f81f9b8bf4dec` · `how-to-set-up-an-rfq-request-for-quotation` · Notion KB › Sourcing › RFQ › How to set up an RFQ (Request for Quotation)?

## 2. How do you run an RFQ Event?

#### PRD-KBSRC-045 — Open a published RFQ lands on the RFQ Responses tab

- **Why it matters.** The Responses tab is where the buyer monitors and manages vendor quotes.
- **Setup.** Buyer; a published RFQ event.
- **Steps.**
  1. Navigate to the **Events** tab on the left-hand menu.
  2. Find and click on the card for the published event.
- **Expected.** The buyer is directed to the RFQ Responses tab where vendor quotes can be monitored and managed.
- **Oracle.** RFQ Responses tab is active and shows the vendor quotes.
- **Trace.** P1 · automate-later · `b4592226c8b2831ca5c4012f1e9b5c40` · `how-do-you-run-an-rfq-event` · Notion KB › Sourcing › RFQ › How do you run an RFQ Event?

#### PRD-KBSRC-046 — L1 (lowest) price is highlighted in green per line item; savings icon vs previous bid

- **Why it matters.** L1 highlighting drives the award decision; a wrong highlight points the buyer at the wrong vendor.
- **Setup.** Buyer; a published RFQ with at least two vendors who have quoted, one of whom has revised a bid.
- **Steps.**
  1. On the RFQ Responses tab, scroll through the line items.
  2. Compare the prices from different vendors.
  3. Look at the percentage icon next to the revised bid.
- **Expected.** The lowest price on each line item is automatically highlighted in green as **L1 (Lowest)**; the percentage icon shows the savings compared to that vendor's previous bid.
- **Oracle.** The green-highlighted cell on each line item holds the minimum price; the percentage equals the change from the vendor's previous bid.
- **Trace.** P0 · automate-later · `b4592226c8b2831ca5c4012f1e9b5c40` · `how-do-you-run-an-rfq-event` · Notion KB › Sourcing › RFQ › How do you run an RFQ Event?

#### PRD-KBSRC-047 — Reject Quote removes the quote from the comparison view and the QCS

- **Why it matters.** A rejected quote must not be awarded or influence comparison.
- **Setup.** Buyer; a published RFQ with vendor quotes.
- **Steps.**
  1. Click the **three-dot menu** next to a vendor's name in their quote.
  2. Select **Reject Quote**, keeping the box checked so the seller is allowed to bid again.
- **Expected.** The quote is removed from the comparison view and the Quote Comparison Sheet (QCS); the seller is allowed to bid again.
- **Oracle.** The vendor's quote no longer appears in the comparison view or the QCS; the vendor can still submit a new bid.
- **Trace.** P0 · automate-later · `b4592226c8b2831ca5c4012f1e9b5c40` · `how-do-you-run-an-rfq-event` · Notion KB › Sourcing › RFQ › How do you run an RFQ Event?

#### PRD-KBSRC-048 — Reject Quote with the box unchecked blocks the seller from bidding again

- **Why it matters.** Stated option that controls whether a rejected vendor can re-enter the event.
- **Setup.** Buyer; a published RFQ with a vendor quote; the vendor's login to verify.
- **Steps.**
  1. Click the three-dot menu next to the vendor's name and select **Reject Quote**.
  2. Uncheck the box that allows the seller to bid again and confirm.
  3. As the vendor, try to bid again.
- **Expected.** The seller is not allowed to bid again.
- **Oracle.** The vendor cannot submit a new bid on the event (the article does not state the vendor-side message — tester records it).
- **Trace.** P1 · manual · `b4592226c8b2831ca5c4012f1e9b5c40` · `how-do-you-run-an-rfq-event` · Notion KB › Sourcing › RFQ › How do you run an RFQ Event?

#### PRD-KBSRC-049 — Edit Quote updates vendor global fields such as taxes or delivery terms

- **Why it matters.** Missing taxes or delivery terms distort landed-cost comparison.
- **Setup.** Buyer; a published RFQ with a vendor quote missing a global field (e.g. taxes).
- **Steps.**
  1. Click the three-dot menu next to the vendor's name.
  2. Select **Edit Quote** and update the global field (taxes or delivery terms).
  3. Save.
- **Expected.** The specific global fields are updated on the vendor's quote.
- **Oracle.** The quote shows the edited value in the comparison view.
- **Trace.** P1 · automate-later · `b4592226c8b2831ca5c4012f1e9b5c40` · `how-do-you-run-an-rfq-event` · Notion KB › Sourcing › RFQ › How do you run an RFQ Event?

#### PRD-KBSRC-050 — Review previous bid revisions of a vendor

- **Why it matters.** Buyers need bid history to judge negotiation progress.
- **Setup.** Buyer; a published RFQ where a vendor has revised a bid at least once.
- **Steps.**
  1. Hover over the "Current bid" value and select an earlier bid version.
  2. Use the arrow buttons next to the bid value to cycle through revisions and back to the current bid.
- **Expected.** The vendor's past bids are shown; the buyer can jump to a chosen version and cycle back to the current bid.
- **Oracle.** Displayed bid value changes to the selected revision and returns to the current bid.
- **Trace.** P2 · automate-later · `b4592226c8b2831ca5c4012f1e9b5c40` · `how-do-you-run-an-rfq-event` · Notion KB › Sourcing › RFQ › How do you run an RFQ Event?

#### PRD-KBSRC-051 — Counter Offer button opens the counter offer interface

- **Why it matters.** Counter offers are the RFQ negotiation lever before award.
- **Setup.** Buyer; a published RFQ with vendor quotes.
- **Steps.**
  1. Locate the vendor name in the comparison view.
  2. Click the **Counter Offer** button under the vendor name.
- **Expected.** The buyer is taken to the counter offer interface to configure and send revised expectations to the vendor.
- **Oracle.** The counter offer interface opens for that vendor.
- **Trace.** P1 · automate-later · `b4592226c8b2831ca5c4012f1e9b5c40` · `how-do-you-run-an-rfq-event` · Notion KB › Sourcing › RFQ › How do you run an RFQ Event?

#### PRD-KBSRC-052 — Actions › Show Best Prices shows suppliers the best price and adds a lowest-bid row in the QCS

- **Why it matters.** Revealing best prices changes vendor behaviour; the QCS row must reflect the true lowest bid.
- **Setup.** Buyer; a published RFQ with quotes from several vendors.
- **Steps.**
  1. Click the **Actions** button.
  2. Select **Show Best Prices**.
- **Expected.** Suppliers are shown the exact best price for each line item; an extra row per line item displays the lowest bid across vendors in the QCS.
- **Oracle.** QCS shows the extra lowest-bid row with the minimum price per line item; a vendor login shows the best price.
- **Trace.** P1 · automate-later · `b4592226c8b2831ca5c4012f1e9b5c40` · `how-do-you-run-an-rfq-event` · Notion KB › Sourcing › RFQ › How do you run an RFQ Event?

#### PRD-KBSRC-053 — Actions › Enable English Auction converts the RFQ into an English Auction

- **Why it matters.** Alternate path that changes the event's bidding mechanics.
- **Setup.** Buyer; a published RFQ.
- **Steps.**
  1. Click the **Actions** button.
  2. Select **Enable English Auction**.
- **Expected.** The RFQ is converted into an English Auction event.
- **Oracle.** The event shows as an English Auction (the article defers details to another page — tester verifies at that level).
- **Trace.** P2 · manual · `b4592226c8b2831ca5c4012f1e9b5c40` · `how-do-you-run-an-rfq-event` · Notion KB › Sourcing › RFQ › How do you run an RFQ Event?

#### PRD-KBSRC-054 — View-Only Mode blocks counter offers, quote edits and surrogate bids until disabled

- **Why it matters.** Stated restriction that freezes the evaluation against changes.
- **Setup.** Buyer; a published RFQ with vendor quotes.
- **Steps.**
  1. Click **Actions** › **Enable View-Only Mode**.
  2. Try to send a counter offer, edit a quote and place a surrogate bid.
  3. Click the same action again to disable the mode and retry.
- **Expected.** While enabled, users cannot send counter offers, edit quotes or place surrogate bids; after disabling, these actions are available again.
- **Oracle.** Counter Offer / Edit Quote / surrogate bid are unavailable in view-only mode and available after it is disabled.
- **Trace.** P1 · automate-later · `b4592226c8b2831ca5c4012f1e9b5c40` · `how-do-you-run-an-rfq-event` · Notion KB › Sourcing › RFQ › How do you run an RFQ Event?

#### PRD-KBSRC-055 — Send Bulk Counter Offers to all vendors from Settings

- **Why it matters.** Bulk negotiation across all vendors in one step.
- **Setup.** Buyer; a published RFQ with several vendor quotes.
- **Steps.**
  1. Click on Settings and find "Send Bulk Counter Offers".
  2. Decide the counter offer to send to all vendors and click Send.
- **Expected.** The counter offer is sent to all vendors.
- **Oracle.** Every vendor shows a received counter offer (tester checks at least two vendor logins).
- **Trace.** P1 · automate-later · `b4592226c8b2831ca5c4012f1e9b5c40` · `how-do-you-run-an-rfq-event` · Notion KB › Sourcing › RFQ › How do you run an RFQ Event?

#### PRD-KBSRC-056 — After evaluation, awarding starts from the MQCS tab

- **Why it matters.** Awarding is the end of the core path; the article routes it through the MQCS tab.
- **Setup.** Buyer; an RFQ whose evaluation is complete and counter offers sent.
- **Steps.**
  1. Navigate to the **MQCS** tab of the RFQ.
  2. Proceed with the awarding process.
- **Expected.** The MQCS tab is available to award the RFQ once evaluation is complete.
- **Oracle.** MQCS tab opens with the evaluated quotes for awarding (details are in the separate "Awarding Process" article).
- **Trace.** P0 · manual · `b4592226c8b2831ca5c4012f1e9b5c40` · `how-do-you-run-an-rfq-event` · Notion KB › Sourcing › RFQ › How do you run an RFQ Event?

## 3. How do I Unlock Bids?

#### PRD-KBSRC-057 — Unlock bids "For Myself" with a second-user OTP

- **Why it matters.** Compliance: bids must stay sealed until a two-person unlock completes.
- **Setup.** Buyer on an event whose submission window has closed; a second pre-set user (typically another department) with registered email/SMS.
- **Steps.**
  1. Open the **"Responses"** tab of the event.
  2. Click or hover the settings icon and select **"Unlock Bids"**.
  3. In the dialog choose **For Myself**.
  4. Choose the second user as OTP recipient and click **"Send OTP"**.
  5. Obtain the OTP from that user, enter it and click **"Submit OTP"**.
- **Expected.** The recipient receives the OTP via email/SMS; on successful verification the bids are unlocked and visible only to the initiating user.
- **Oracle.** "The bids have been unlocked" confirmation; vendor responses are visible to the initiator and still hidden for other users with access.
- **Trace.** P0 · automate-later · `47592226c8b283c08d3a019b44032efd` · `how-do-i-unlock-bids` · Notion KB › Sourcing › RFQ › How do I Unlock Bids?

#### PRD-KBSRC-058 — Unlock bids "For Everyone"

- **Why it matters.** Unlock scope decides who can see sealed bids.
- **Setup.** Buyer on an event whose submission window has closed; a pre-set OTP recipient; a third user with access to the event.
- **Steps.**
  1. From the Responses tab, settings icon › **"Unlock Bids"**.
  2. Choose **For Everyone**, select the OTP recipient and click **"Send OTP"**.
  3. Enter the OTP and click **"Submit OTP"**.
- **Expected.** Bids are unlocked for all users with access to the event.
- **Oracle.** The third user can view the vendor responses after the unlock.
- **Trace.** P0 · automate-later · `47592226c8b283c08d3a019b44032efd` · `how-do-i-unlock-bids` · Notion KB › Sourcing › RFQ › How do I Unlock Bids?

#### PRD-KBSRC-059 — Bids cannot be unlocked before the submission window closes

- **Why it matters.** Stated compliance restriction against premature access and collusion.
- **Setup.** Buyer on a live event whose submission deadline has not passed.
- **Steps.**
  1. Open the Responses tab.
  2. Attempt to start **"Unlock Bids"** from the settings icon.
- **Expected.** Unlocking bids before the submission deadline is not permitted.
- **Oracle.** The unlock does not proceed and bids remain hidden (the article does not name the message shown).
- **Trace.** P0 · automate-later · `47592226c8b283c08d3a019b44032efd` · `how-do-i-unlock-bids` · Notion KB › Sourcing › RFQ › How do I Unlock Bids?

#### PRD-KBSRC-060 — Neither party can view bids independently before the OTP is submitted

- **Why it matters.** The two-person rule is the point of the feature; the initiator alone must not see bids.
- **Setup.** Buyer (initiator) and a second pre-set user; an event whose submission window has closed.
- **Steps.**
  1. As initiator, start **"Unlock Bids"** and click **"Send OTP"** but do not submit the OTP.
  2. Check whether bids are visible to the initiator.
  3. Check whether bids are visible to the OTP recipient.
- **Expected.** Bids stay restricted for both users until the OTP is verified.
- **Oracle.** Vendor bid values are not visible to either user until "Submit OTP" succeeds.
- **Trace.** P0 · manual · `47592226c8b283c08d3a019b44032efd` · `how-do-i-unlock-bids` · Notion KB › Sourcing › RFQ › How do I Unlock Bids?

#### PRD-KBSRC-061 — OTP recipient dropdown lists only pre-set users

- **Why it matters.** Stated restriction that controls who can act as the second authenticator.
- **Setup.** Buyer at the "Select OTP Recipient" step of Unlock Bids; the configured set of pre-set users known.
- **Steps.**
  1. Open the OTP recipient dropdown.
  2. Compare the listed users with the configured pre-set users.
- **Expected.** The dropdown shows only the specified number of pre-set users.
- **Oracle.** No user outside the pre-set list appears.
- **Trace.** P1 · manual · `47592226c8b283c08d3a019b44032efd` · `how-do-i-unlock-bids` · Notion KB › Sourcing › RFQ › How do I Unlock Bids?

## 4. How do I use Request for Best Offer?

#### PRD-KBSRC-062 — Request Best Offer from all vendors during Evaluation

- **Why it matters.** Final price negotiation before award decisions.
- **Setup.** Buyer / Procurement Manager; an RFQ event in the **Evaluation** stage with vendor quotes.
- **Steps.**
  1. Open the event card from the **Events** tab and click **Settings** on the left panel.
  2. Click "Request for Best Offer".
  3. In the right-hand side panel, enter the duration for Best Offer submission.
  4. Invite all vendors.
  5. Click "Send Request".
- **Expected.** Vendors receive system notifications and emails; the event is tagged **Best Offer Requested** and each vendor's bid card or row reflects this status; real-time updates appear as vendors submit new quotations.
- **Oracle.** "Best Offer Requested" tag on the event and on each vendor row; vendors receive the email.
- **Trace.** P0 · automate-later · `96f92226c8b2830e9e6b017055821d7b` · `how-do-i-use-request-for-best-offer` · Notion KB › Sourcing › RFQ › How do I use Request for Best Offer?

#### PRD-KBSRC-063 — Request Best Offer from selected vendors only

- **Why it matters.** Buyers focus the final round on the most competitive vendors.
- **Setup.** Buyer / Procurement Manager; an RFQ in Evaluation with at least three vendor quotes.
- **Steps.**
  1. Settings › "Request for Best Offer".
  2. Set a duration and choose specific vendors instead of all.
  3. Click "Send Request".
- **Expected.** Only the chosen vendors are invited to submit a Best Offer.
- **Oracle.** Only the selected vendors' rows show the Best Offer Requested status and receive the notification.
- **Trace.** P1 · automate-later · `96f92226c8b2830e9e6b017055821d7b` · `how-do-i-use-request-for-best-offer` · Notion KB › Sourcing › RFQ › How do I use Request for Best Offer?

#### PRD-KBSRC-064 — Best Offer duration can be set in minutes, hours or days

- **Why it matters.** The submission window length is the vendors' deadline to revise.
- **Setup.** Buyer / Procurement Manager with the Request for Best Offer panel open.
- **Steps.**
  1. Enter a duration in minutes and review.
  2. Change to hours, then to days.
- **Expected.** The duration can be set in minutes, hours, or days.
- **Oracle.** Each unit is accepted and the resulting window matches the entered value.
- **Trace.** P2 · automate-later · `96f92226c8b2830e9e6b017055821d7b` · `how-do-i-use-request-for-best-offer` · Notion KB › Sourcing › RFQ › How do I use Request for Best Offer?

#### PRD-KBSRC-065 — Vendor sees the Best Offer banner and revises line items within the window

- **Why it matters.** The vendor side must be able to respond or the request is pointless.
- **Setup.** A Best Offer request sent to a participating vendor.
- **Steps.**
  1. As the vendor, open the event.
  2. Revise applicable line items and submit during the configured window.
- **Expected.** The vendor sees a prominent banner/notification requesting a **Best Offer** and can revise line items directly during the window.
- **Oracle.** Banner visible on the vendor side; the revised quote is accepted.
- **Trace.** P1 · automate-later · `96f92226c8b2830e9e6b017055821d7b` · `how-do-i-use-request-for-best-offer` · Notion KB › Sourcing › RFQ › How do I use Request for Best Offer?

#### PRD-KBSRC-066 — Buyer reviews Best Offer submissions and continues or awards

- **Why it matters.** The revised prices feed the award decision.
- **Setup.** Buyer; at least one vendor has submitted a Best Offer.
- **Steps.**
  1. Open the Supplier's Best Offer section / comparison view.
  2. Compare the revised prices with the vendor's previous bid.
  3. Send another best offer request or proceed to awarding.
- **Expected.** Revised prices and fields are visible in the comparison view; the buyer can validate improvement and either request again or award.
- **Oracle.** Comparison view shows the new values alongside the ability to re-request or award.
- **Trace.** P1 · manual · `96f92226c8b2830e9e6b017055821d7b` · `how-do-i-use-request-for-best-offer` · Notion KB › Sourcing › RFQ › How do I use Request for Best Offer?

#### PRD-KBSRC-067 — Request for Best Offer is only available once Evaluation has started

- **Why it matters.** Stated restriction in both the Best Offer and Run-an-RFQ articles.
- **Setup.** Buyer; an RFQ still in its submission window.
- **Steps.**
  1. Open Settings on the live RFQ.
  2. Look for / attempt "Request for Best Offer".
  3. Repeat after the event enters Evaluation.
- **Expected.** Best Offer can be requested only once Evaluation time has started.
- **Oracle.** The request cannot be sent before Evaluation and can be sent after (the article does not state the UI state before Evaluation).
- **Trace.** P1 · manual · `96f92226c8b2830e9e6b017055821d7b` · `how-do-i-use-request-for-best-offer` · Notion KB › Sourcing › RFQ › How do I use Request for Best Offer?

## 5. How to Split Line Items into Lots in an RFQ Event

#### PRD-KBSRC-068 — Split line items into lots and publish, creating a Master QCS per lot

- **Why it matters.** Lots are evaluated, awarded and turned into POs independently; the QCS split is the award surface.
- **Setup.** Buyer / Procurement Manager; an RFQ event in the evaluation stage with several line items.
- **Steps.**
  1. Go to the RFQ Event, **Settings** tab, and select **Split Line Items into Lots**.
  2. In the **Manage Lots** panel, use the dropdown next to line item serial numbers to move items into other lots.
  3. Go to each lot header and click **Publish Lot**.
  4. Click close in the bottom right.
- **Expected.** Line items shift to the selected lots; after publishing, a separate **Master QCS** tab exists for each lot and the original unified Master QCS is no longer visible.
- **Oracle.** One Master QCS tab per lot; no unified Master QCS tab; "You've successfully split your RFQ into Lots".
- **Trace.** P0 · automate-later · `ba892226c8b28318a9628152ba72f8f8` · `how-to-split-line-items-into-lots-in-an-rfq-event` · Notion KB › Sourcing › RFQ › How to Split Line Items into Lots in an RFQ Event

#### PRD-KBSRC-069 — All line items start in Lot 1; maximum of 4 lots

- **Why it matters.** Stated default and upper limit for lot splitting.
- **Setup.** Buyer / Procurement Manager; an RFQ in evaluation with at least five line items.
- **Steps.**
  1. Open Settings › **Split Line Items into Lots**.
  2. Check which lot each line item is in.
  3. Open the lot dropdown next to a line item serial number.
- **Expected.** By default all line items are in **Lot 1**; lot numbers can be chosen up to a maximum of 4 lots.
- **Oracle.** Initial lot for every item is Lot 1; the dropdown offers no lot beyond 4.
- **Trace.** P1 · automate-later · `ba892226c8b28318a9628152ba72f8f8` · `how-to-split-line-items-into-lots-in-an-rfq-event` · Notion KB › Sourcing › RFQ › How to Split Line Items into Lots in an RFQ Event

#### PRD-KBSRC-070 — Lots cannot be published during the submission window

- **Why it matters.** Stated restriction: restructuring must not happen while vendors are still submitting.
- **Setup.** Buyer / Procurement Manager; an RFQ still in its submission window.
- **Steps.**
  1. Open Settings › **Split Line Items into Lots** (if offered).
  2. Try to click **Publish Lot**.
- **Expected.** The option to publish lots is not available during the submission window; lots can only be published during the evaluation stage.
- **Oracle.** Publish Lot is unavailable while the submission window is open.
- **Trace.** P1 · automate-later · `ba892226c8b28318a9628152ba72f8f8` · `how-to-split-line-items-into-lots-in-an-rfq-event` · Notion KB › Sourcing › RFQ › How to Split Line Items into Lots in an RFQ Event

#### PRD-KBSRC-071 — After a lot split, other operations wait until vendors adjust charges

- **Why it matters.** Stated gate: global/other charges must be re-apportioned before the buyer continues.
- **Setup.** Buyer; an RFQ whose lots have just been published; vendors have not yet reviewed.
- **Steps.**
  1. After publishing lots, attempt another operation on the lot RFQ (e.g. counter offer or award).
- **Expected.** Vendors are prompted to adjust their global / Other charges; only after vendors do this (or review is skipped) can the buyer go ahead with other operations.
- **Oracle.** Buyer operations are blocked while vendor adjustment is pending (the article does not name the blocking message).
- **Trace.** P1 · manual · `ba892226c8b28318a9628152ba72f8f8` · `how-to-split-line-items-into-lots-in-an-rfq-event` · Notion KB › Sourcing › RFQ › How to Split Line Items into Lots in an RFQ Event

## 6. How Vendors Review and Update Charges After Lot Splitting

#### PRD-KBSRC-072 — Vendor reviews lot adjustment and revises Other Charges

- **Why it matters.** Vendor charges must be re-quoted per lot or lot totals are wrong at award.
- **Setup.** Vendor participating in an RFQ whose line items have been split into lots during evaluation.
- **Steps.**
  1. Navigate to the **Live Events** tab on the supplier dashboard.
  2. Note the **"Bid Adjustment Pending"** tag above the event card and click into the specific **Lot RFQ**.
  3. At the top banner (**Review Lot Adjustment and Update Charges**), click **View Item Distribution**.
  4. Return, scroll to the bottom of the main table and update the **Other Charges** section.
  5. Click **Revise Quote**.
- **Expected.** The revised lot-specific quotation is submitted and the banner disappears.
- **Oracle.** "You have successfully reviewed your bids after Lot Splitting"; banner gone; buyer sees the revised charges on the lot.
- **Trace.** P0 · automate-later · `78592226c8b2829a866601d305d97d35` · `how-vendors-review-and-update-charges-after-lot-splitting` · Notion KB › Sourcing › RFQ › How Vendors Review and Update Charges After Lot Splitting

#### PRD-KBSRC-073 — "Bid Adjustment Pending" tag and View Item Distribution show the lot restructure

- **Why it matters.** The vendor must be told their existing charges may no longer be valid.
- **Setup.** Vendor in an RFQ that has been split into lots.
- **Steps.**
  1. Open the **Live Events** tab.
  2. Open the Lot RFQ and click **View Item Distribution**.
- **Expected.** The event card carries a **"Bid Adjustment Pending"** tag; View Item Distribution shows how the original line items were reassigned into lots.
- **Oracle.** Tag visible on the card; distribution matches the buyer's lot configuration.
- **Trace.** P2 · automate-later · `78592226c8b2829a866601d305d97d35` · `how-vendors-review-and-update-charges-after-lot-splitting` · Notion KB › Sourcing › RFQ › How Vendors Review and Update Charges After Lot Splitting

#### PRD-KBSRC-074 — Vendor review workflow may not apply when the buyer skipped review

- **Why it matters.** Stated condition linking the vendor flow to the buyer's skip option.
- **Setup.** An RFQ split into lots where the buyer used "Skip Vendor Review" for a vendor.
- **Steps.**
  1. As that vendor, open the **Live Events** tab and the Lot RFQ.
- **Expected.** The review-and-update workflow may not apply for that vendor.
- **Oracle.** Tester records whether the "Bid Adjustment Pending" tag and banner are shown (the article says only that the workflow "may not apply").
- **Trace.** P2 · manual · `78592226c8b2829a866601d305d97d35` · `how-vendors-review-and-update-charges-after-lot-splitting` · Notion KB › Sourcing › RFQ › How Vendors Review and Update Charges After Lot Splitting

## 7. How to Skip Vendor Review in Lot Splitting

#### PRD-KBSRC-075 — Skip vendor review with pro-rata allocation of global charges

- **Why it matters.** Keeps evaluation moving when a vendor cannot revise charges after a lot split.
- **Setup.** Buyer; a Lot RFQ where lot splitting is complete and a vendor's **Lot Adjustment** is pending.
- **Steps.**
  1. Open the **Lot RFQ** and locate the vendor card with the pending Lot Adjustment.
  2. Click **"Skip Vendor Review"** under the vendor's name.
  3. In the side panel, choose **Pro-rata allocation** (by line item value or quantity).
  4. Enter a reason (e.g. Vendor not responding).
  5. Click **"Confirm & Skip Review"**.
- **Expected.** The vendor review is skipped and global charges are allocated pro-rata across the lots.
- **Oracle.** Confirmation tooltip that the vendor review has been skipped; the vendor's lot charges reflect the pro-rata split.
- **Trace.** P1 · automate-later · `a2092226c8b2837f98fe01359ef8b01d` · `how-to-skip-vendor-review-in-lot-splitting` · Notion KB › Sourcing › RFQ › How to Skip Vendor Review in Lot Splitting

#### PRD-KBSRC-076 — Skip vendor review with manual entry of global charges per lot

- **Why it matters.** Alternate allocation where the buyer sets each lot's charges.
- **Setup.** Buyer; a Lot RFQ with a vendor whose Lot Adjustment is pending.
- **Steps.**
  1. Click **"Skip Vendor Review"** under the vendor's name.
  2. Choose **Manual entry** and enter global charge values for each lot.
  3. Enter a reason and click **"Confirm & Skip Review"**.
- **Expected.** The vendor review is skipped with the manually entered charges per lot.
- **Oracle.** Confirmation tooltip; the vendor's lots show the entered charge values.
- **Trace.** P1 · automate-later · `a2092226c8b2837f98fe01359ef8b01d` · `how-to-skip-vendor-review-in-lot-splitting` · Notion KB › Sourcing › RFQ › How to Skip Vendor Review in Lot Splitting

#### PRD-KBSRC-077 — A reason is required to skip vendor review

- **Why it matters.** Audit trail: skipping must be justified (the article requires a valid reason and all required fields).
- **Setup.** Buyer in the Skip Vendor Review side panel.
- **Steps.**
  1. Choose an allocation method but leave the reason empty.
  2. Try to click **"Confirm & Skip Review"**.
  3. Enter a reason (Vendor unavailable / network issues / not responding) and confirm.
- **Expected.** Confirm & Skip Review proceeds only once all required fields, including the reason, are filled.
- **Oracle.** No skip without a reason; skip succeeds after the reason is entered (exact UI reaction not stated).
- **Trace.** P1 · manual · `a2092226c8b2837f98fe01359ef8b01d` · `how-to-skip-vendor-review-in-lot-splitting` · Notion KB › Sourcing › RFQ › How to Skip Vendor Review in Lot Splitting

## 8. How do I convert an RFQ to an Auction

#### PRD-KBSRC-078 — Convert a concluded RFQ to an auction using RFQ quotations as starting bids

- **Why it matters.** RFQ → auction conversion is on the core path to drive competitive pricing before award.
- **Setup.** Buyer; a concluded RFQ event with vendor quotations.
- **Steps.**
  1. In the RFQ event, go to the **Settings** tab and click **Convert to Auction**.
  2. In the prompt, leave the checkbox selected to use the RFQ quotations as starting bids.
  3. On the Auction Setup screen, set auction timings and configure available auction settings.
  4. Click **Save**.
  5. Click **Publish**, review auction details and scheduling, then click **Publish** again.
- **Expected.** The auction goes live and is added to the same project; vendors who submitted bids in the RFQ are automatically enrolled with their previous quotations already considered.
- **Oracle.** Auction stage visible in the same project; RFQ bidders are participants; their starting bids equal their RFQ quotations.
- **Trace.** P0 · automate-later · `25892226c8b28383b1b9017e05f640ad` · `how-do-i-convert-an-rfq-to-an-auction` · Notion KB › Sourcing › RFQ › How do I convert an RFQ to an Auction

#### PRD-KBSRC-079 — Convert to Auction with fresh bids (checkbox unchecked)

- **Why it matters.** Alternate path where RFQ prices are not carried forward.
- **Setup.** Buyer; a concluded RFQ with quotations.
- **Steps.**
  1. Settings › **Convert to Auction**.
  2. Uncheck the checkbox in the prompt.
  3. Configure, **Save**, and **Publish** twice.
- **Expected.** The auction starts with fresh bids from vendors.
- **Oracle.** Auction shows no carried-forward starting bids from the RFQ.
- **Trace.** P1 · automate-later · `25892226c8b28383b1b9017e05f640ad` · `how-do-i-convert-an-rfq-to-an-auction` · Notion KB › Sourcing › RFQ › How do I convert an RFQ to an Auction

#### PRD-KBSRC-080 — Template, products and quantities are locked on the conversion Auction Setup; vendors remain editable

- **Why it matters.** Stated restriction preserving comparability between RFQ quotes and auction bids.
- **Setup.** Buyer on the Auction Setup screen reached via Convert to Auction.
- **Steps.**
  1. Try to change the event template.
  2. Try to modify products or quantities.
  3. Update the list of invited vendors.
- **Expected.** The template cannot be changed and products/quantities cannot be modified; the list of vendors invited can still be updated.
- **Oracle.** Template and product/quantity controls are locked; vendor list edits save.
- **Trace.** P1 · automate-later · `25892226c8b28383b1b9017e05f640ad` · `how-do-i-convert-an-rfq-to-an-auction` · Notion KB › Sourcing › RFQ › How do I convert an RFQ to an Auction

#### PRD-KBSRC-081 — Knockout and Dutch auctions cannot be selected during conversion

- **Why it matters.** Stated restriction: these types do not support pre-existing quotations.
- **Setup.** Buyer on the Auction Setup screen reached via Convert to Auction.
- **Steps.**
  1. Open the auction type / strategy options.
  2. Try to select **Knockout** and **Dutch**.
- **Expected.** Knockout and Dutch Auctions cannot be selected during conversion.
- **Oracle.** Both options are unavailable while other auction settings remain configurable.
- **Trace.** P1 · automate-later · `25892226c8b28383b1b9017e05f640ad` · `how-do-i-convert-an-rfq-to-an-auction` · Notion KB › Sourcing › RFQ › How do I convert an RFQ to an Auction

#### PRD-KBSRC-082 — Conversion summary shows vendors who quoted; View All RFQs returns to the RFQ

- **Why it matters.** Buyer needs RFQ context while configuring the auction.
- **Setup.** Buyer on the Auction Setup screen reached via Convert to Auction; RFQ had several quoting vendors.
- **Steps.**
  1. Read the summary of how many vendors submitted quotes in the RFQ.
  2. Click **View All RFQs**.
- **Expected.** The summary shows the number of vendors who submitted quotes; View All RFQs returns to the RFQ to review existing bids.
- **Oracle.** Summary count equals the RFQ's quoting vendors; the RFQ bids view opens.
- **Trace.** P2 · automate-later · `25892226c8b28383b1b9017e05f640ad` · `how-do-i-convert-an-rfq-to-an-auction` · Notion KB › Sourcing › RFQ › How do I convert an RFQ to an Auction

#### PRD-KBSRC-083 — Optional auction features during conversion: cost breakdown, dynamic vendor selection, line-wise or lot-wise bidding

- **Why it matters.** Alternate configurations available on the converted auction.
- **Setup.** Buyer on the Auction Setup screen reached via Convert to Auction.
- **Steps.**
  1. Enable cost breakdown mode.
  2. Enable dynamic vendor selection.
  3. Choose line-wise, then lot-wise bidding.
  4. **Save** and **Publish**.
- **Expected.** Each optional feature can be enabled and the chosen bidding mode is applied to the auction.
- **Oracle.** Published auction reflects the selected options (details of each feature are in other articles).
- **Trace.** P2 · manual · `25892226c8b28383b1b9017e05f640ad` · `how-do-i-convert-an-rfq-to-an-auction` · Notion KB › Sourcing › RFQ › How do I convert an RFQ to an Auction
