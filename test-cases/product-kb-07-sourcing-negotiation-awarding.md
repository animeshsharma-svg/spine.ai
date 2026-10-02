# Product KB test cases — Sourcing › Negotiation and Awarding

Generated from the Procol Notion Knowledge Base (help-centre articles) — each case is grounded in the article it traces to. Source pages are read-only; re-derive from Notion rather than editing facts here.

## 1. Surrogate Bidding: How to Place Bids on Behalf of Vendors

#### PRD-KBSRC-601 — Buyer places a surrogate bid for a vendor in the RFQ stage

- **Why it matters.** Surrogate bidding lets a buyer enter bids vendors sent offline (phone, email) so those vendors still compete; a bid that fails to land or lands against the wrong vendor corrupts the comparison and the award.
- **Setup.** Buyer persona. An RFQ event with at least one participating vendor who has not bid on the platform; an offline record of that vendor's bid (screenshot, call log or email) to attach.
- **Steps.**
  1. Navigate to the project details page for the event.
  2. Go to the RFQ stage tab.
  3. Click on the Participants section to view the list of vendors.
  4. Locate the vendor (use the search bar if needed).
  5. Click the "➕ Add Bid" button next to the vendor's name.
  6. Enter the vendor's response in the bid form that opens.
  7. Add Supplier Remarks if the vendor stated specific instructions.
  8. Attach a Surrogate Bid Reference (the offline record).
  9. Click Submit.
  10. Open the QCS.
- **Expected.** The surrogate bid is placed for that vendor and appears correctly in the QCS with the values entered.
- **Oracle.** In the QCS the vendor's column/row shows the entered values and is marked "Surrogate Bid" under the vendor's name in blue text, next to the currency.
- **Trace.** P0 · automate-later · `01692226c8b282c58986816665dc969f` · `surrogate-bidding-how-to-place-bids-on-behalf-of-vendors` · Notion KB › Sourcing › Negotiation and Awarding › Surrogate Bidding: How to Place Bids on Behalf of Vendors

#### PRD-KBSRC-602 — Surrogate bid placed in a Technical Stage

- **Why it matters.** The article states surrogate bids can be placed in a technical evaluation, not only commercial stages; the technical stage form differs and must accept a buyer-entered response.
- **Setup.** Buyer persona. An event with a Technical Stage and a participating vendor who has not responded.
- **Steps.**
  1. Navigate to the project details page for the event.
  2. Go to the Technical Stage tab.
  3. Click on the Participants section and locate the vendor.
  4. Click "➕ Add Bid" next to the vendor's name.
  5. Enter the vendor's response in the bid form, attach a Surrogate Bid Reference and click Submit.
- **Expected.** The surrogate response is recorded against the vendor in the Technical Stage.
- **Oracle.** The Technical Stage comparison (QCS) shows the vendor's response marked "Surrogate Bid" under the vendor's name.
- **Trace.** P2 · automate-later · `01692226c8b282c58986816665dc969f` · `surrogate-bidding-how-to-place-bids-on-behalf-of-vendors` · Notion KB › Sourcing › Negotiation and Awarding › Surrogate Bidding: How to Place Bids on Behalf of Vendors

#### PRD-KBSRC-603 — Surrogate bid placed in a Reverse Auction stage

- **Why it matters.** Reverse Auction is one of the three stage tabs the article names for surrogate bidding; auction bids drive ranking live, so a surrogate bid must be accepted there too.
- **Setup.** Buyer persona. An event with a live Reverse Auction stage and a participating vendor.
- **Steps.**
  1. Navigate to the project details page for the event.
  2. Go to the Reverse Auction tab.
  3. Click on the Participants section and locate the vendor.
  4. Click "➕ Add Bid" next to the vendor's name.
  5. Enter the vendor's bid, attach a Surrogate Bid Reference and click Submit.
- **Expected.** The surrogate bid is recorded for the vendor in the Reverse Auction stage.
- **Oracle.** The auction QCS shows the vendor's bid marked "Surrogate Bid" under the vendor's name in blue text next to the currency.
- **Trace.** P2 · automate-later · `01692226c8b282c58986816665dc969f` · `surrogate-bidding-how-to-place-bids-on-behalf-of-vendors` · Notion KB › Sourcing › Negotiation and Awarding › Surrogate Bidding: How to Place Bids on Behalf of Vendors

#### PRD-KBSRC-604 — Participants section lists vendor details and supports search

- **Why it matters.** The buyer must pick the right vendor before entering an offline bid; the article says the list shows identifying details and a search bar.
- **Setup.** Buyer persona. An event stage (Technical Stage, RFQ or Reverse Auction) with several participating vendors.
- **Steps.**
  1. Open the event's project details page and the relevant stage tab.
  2. Click on the Participants section.
  3. Type a vendor's name into the search bar.
- **Expected.** The vendor list shows name, phone number, email and vendor code, and the search narrows the list to the matching vendor with its "➕ Add Bid" button.
- **Oracle.** Participants list columns show name, phone number, email and vendor code; after searching only the matching vendor row is shown.
- **Trace.** P2 · automate-later · `01692226c8b282c58986816665dc969f` · `surrogate-bidding-how-to-place-bids-on-behalf-of-vendors` · Notion KB › Sourcing › Negotiation and Awarding › Surrogate Bidding: How to Place Bids on Behalf of Vendors

#### PRD-KBSRC-605 — Surrogate bid form mirrors the vendor form and supports Quick Fill

- **Why it matters.** The article states the buyer sees the same form the vendor would fill; a divergent form would let surrogate bids skip required vendor fields. Quick Fill is the stated speed-up for many similar entries.
- **Setup.** Buyer persona. An RFQ event with several line items and a participating vendor.
- **Steps.**
  1. Open the Participants section of the RFQ stage and click "➕ Add Bid" next to the vendor.
  2. Compare the fields with the vendor's own bid form for the same event.
  3. Use Quick Fill to copy-paste or autofill values across similar entries.
- **Expected.** The surrogate form has the same fields as the vendor's form, and Quick Fill populates the applicable fields.
- **Oracle.** Field-by-field comparison with the vendor's form matches; fields targeted by Quick Fill show the filled values before Submit.
- **Trace.** P2 · manual · `01692226c8b282c58986816665dc969f` · `surrogate-bidding-how-to-place-bids-on-behalf-of-vendors` · Notion KB › Sourcing › Negotiation and Awarding › Surrogate Bidding: How to Place Bids on Behalf of Vendors

#### PRD-KBSRC-606 — Supplier Remarks and Surrogate Bid Reference are saved with the surrogate bid

- **Why it matters.** The reference attachment (screenshots, call logs, emails) is the audit evidence that the vendor really offered this bid; remarks carry vendor conditions such as "Final price, no further negotiation."
- **Setup.** Buyer persona. An RFQ event and an offline record file of the vendor's bid.
- **Steps.**
  1. Open "➕ Add Bid" for the vendor from the Participants section.
  2. Enter the bid values.
  3. Add Supplier Remarks, e.g. "Final price, no further negotiation."
  4. Attach a Surrogate Bid Reference file.
  5. Click Submit.
  6. Reopen the vendor's bid details.
- **Expected.** The remark and the attached reference are kept with the surrogate bid.
- **Oracle.** The vendor's bid details show the remark text and the attached reference file.
- **Trace.** P2 · manual · `01692226c8b282c58986816665dc969f` · `surrogate-bidding-how-to-place-bids-on-behalf-of-vendors` · Notion KB › Sourcing › Negotiation and Awarding › Surrogate Bidding: How to Place Bids on Behalf of Vendors

#### PRD-KBSRC-607 — Surrogate bids are visibly distinguished from vendor-placed bids in the QCS

- **Why it matters.** Evaluators and approvers must be able to tell which bids a buyer keyed in; the article defines the marker.
- **Setup.** Buyer persona. An RFQ event where one vendor bid on the platform and another vendor's bid was entered as a surrogate bid.
- **Steps.**
  1. Open the RFQ stage QCS.
  2. Compare the header of the surrogate-bid vendor with the vendor who bid themselves.
- **Expected.** Only the surrogate-bid vendor carries the surrogate marker.
- **Oracle.** "Surrogate Bid" appears in blue text under the surrogate vendor's name next to the currency, and is absent for the self-bidding vendor.
- **Trace.** P1 · automate-later · `01692226c8b282c58986816665dc969f` · `surrogate-bidding-how-to-place-bids-on-behalf-of-vendors` · Notion KB › Sourcing › Negotiation and Awarding › Surrogate Bidding: How to Place Bids on Behalf of Vendors

## 2. How to Send and Manage Counter Offers?

#### PRD-KBSRC-608 — Buyer sends a price counter offer to a vendor from the QCS

- **Why it matters.** Counter offers are the core price-negotiation tool; a counter offer that is not delivered or not flagged in the QCS breaks the negotiation and the eventual award value.
- **Setup.** Buyer persona. An RFQ event with at least one vendor bid visible in the QCS.
- **Steps.**
  1. Navigate to the RFQ tab of the sourcing event.
  2. Open the QCS (Quote Comparison Sheet).
  3. Identify the vendor and click the blue **"Counter Offer"** button beneath their name.
  4. In the dialog, select the Price field.
  5. Input the new value to propose.
  6. Click **"Send Counter Offer"**.
- **Expected.** The counter offer is sent to the vendor and the QCS marks the vendor as having a pending counter offer.
- **Oracle.** A tooltip notification confirms the counter offer was sent successfully; a **"Counter Offer Requested"** tag appears above the vendor's name in the QCS with a "Revoke Counter Offer" option, and the changed values are highlighted showing original vs counter offer values.
- **Trace.** P0 · automate-later · `bec92226c8b282d08ba081dbd57b4ba2` · `how-to-send-and-manage-counter-offers` · Notion KB › Sourcing › Negotiation and Awarding › How to Send and Manage Counter Offers?

#### PRD-KBSRC-609 — Counter offer dialog shows original vendor value next to the counter value

- **Why it matters.** The buyer must see what they are countering against to avoid sending a wrong value.
- **Setup.** Buyer persona. RFQ event with a vendor bid in the QCS.
- **Steps.**
  1. Open the QCS on the RFQ tab.
  2. Click **"Counter Offer"** beneath a vendor's name.
  3. Select the Price field and input a new value.
- **Expected.** The dialog shows both the original vendor value and the counter offer value for comparison.
- **Oracle.** In the dialog the vendor's original value and the entered counter offer value are displayed side by side.
- **Trace.** P2 · automate-later · `bec92226c8b282d08ba081dbd57b4ba2` · `how-to-send-and-manage-counter-offers` · Notion KB › Sourcing › Negotiation and Awarding › How to Send and Manage Counter Offers?

#### PRD-KBSRC-610 — Quantity counter offer for partial awarding per line item

- **Why it matters.** The article's note says adjusting the quantities field in a counter offer enables partial awarding per line item — this changes how much is bought from each vendor.
- **Setup.** Buyer persona. RFQ event with a vendor bid on a line item in the QCS.
- **Steps.**
  1. Open the QCS on the RFQ tab and click **"Counter Offer"** beneath the vendor's name.
  2. Select the Quantity field.
  3. Enter an adjusted (reduced) quantity.
  4. Click **"Send Counter Offer"**.
- **Expected.** The counter offer with the adjusted quantity is sent, enabling partial awarding for that line item.
- **Oracle.** Success tooltip appears; the "Counter Offer Requested" tag shows above the vendor's name and the quantity cell is highlighted with original vs counter offer quantity.
- **Trace.** P1 · automate-later · `bec92226c8b282d08ba081dbd57b4ba2` · `how-to-send-and-manage-counter-offers` · Notion KB › Sourcing › Negotiation and Awarding › How to Send and Manage Counter Offers?

#### PRD-KBSRC-611 — Counter offer on a Global Field

- **Why it matters.** The article states counter offers can also be sent on Global Fields (fields not specific to any line item), e.g. event-level terms.
- **Setup.** Buyer persona. RFQ event with at least one global field and a vendor bid in the QCS.
- **Steps.**
  1. Open the QCS on the RFQ tab and click **"Counter Offer"** beneath the vendor's name.
  2. Select a global field in the dialog.
  3. Input the new value and click **"Send Counter Offer"**.
- **Expected.** The counter offer on the global field is sent.
- **Oracle.** Success tooltip; "Counter Offer Requested" tag above the vendor's name; the global field value is highlighted with original vs counter value.
- **Trace.** P2 · automate-later · `bec92226c8b282d08ba081dbd57b4ba2` · `how-to-send-and-manage-counter-offers` · Notion KB › Sourcing › Negotiation and Awarding › How to Send and Manage Counter Offers?

#### PRD-KBSRC-612 — Counter offer can be sent without the optional note

- **Why it matters.** The note to the vendor is stated as helpful but not mandatory; the form must not block sending when it is empty.
- **Setup.** Buyer persona. RFQ event with a vendor bid in the QCS.
- **Steps.**
  1. Open **"Counter Offer"** for a vendor.
  2. Select Price and input a new value.
  3. Leave the note to the vendor empty.
  4. Click **"Send Counter Offer"**.
- **Expected.** The counter offer is sent without a note.
- **Oracle.** Success tooltip appears and the "Counter Offer Requested" tag shows above the vendor's name.
- **Trace.** P2 · automate-later · `bec92226c8b282d08ba081dbd57b4ba2` · `how-to-send-and-manage-counter-offers` · Notion KB › Sourcing › Negotiation and Awarding › How to Send and Manage Counter Offers?

#### PRD-KBSRC-613 — Buyer revokes a pending counter offer

- **Why it matters.** A buyer must be able to withdraw a counter offer sent in error before the vendor acts on it.
- **Setup.** Buyer persona. A vendor in the QCS with the "Counter Offer Requested" tag.
- **Steps.**
  1. Open the QCS on the RFQ tab.
  2. Click **"Revoke Counter Offer"** under the vendor's name.
- **Expected.** The counter offer is revoked.
- **Oracle.** A tooltip confirms the counter offer has been revoked; the "Counter Offer Requested" tag is no longer shown for that vendor.
- **Trace.** P1 · automate-later · `bec92226c8b282d08ba081dbd57b4ba2` · `how-to-send-and-manage-counter-offers` · Notion KB › Sourcing › Negotiation and Awarding › How to Send and Manage Counter Offers?

#### PRD-KBSRC-614 — Vendor accepts the counter offer — buyer QCS shows accepted tag

- **Why it matters.** Acceptance fixes the negotiated price that will feed the award; the buyer must see it unambiguously.
- **Setup.** Buyer and Vendor personas. A counter offer sent by the buyer to the vendor on an RFQ event.
- **Steps.**
  1. As the vendor, open the RFQ event and accept the counter offer.
  2. As the buyer, open the QCS on the RFQ tab.
- **Expected.** The vendor's bid reflects the accepted counter offer.
- **Oracle.** A tag reads "Accepted Counter Offer Bid" with a green thumbs up icon for that vendor in the QCS.
- **Trace.** P0 · automate-later · `bec92226c8b282d08ba081dbd57b4ba2` · `how-to-send-and-manage-counter-offers` · Notion KB › Sourcing › Negotiation and Awarding › How to Send and Manage Counter Offers?

#### PRD-KBSRC-615 — Vendor rejects the counter offer — buyer QCS shows rejected tag

- **Why it matters.** A rejected counter offer means the vendor's earlier bid stands; the buyer must not award at the countered price.
- **Setup.** Buyer and Vendor personas. A counter offer sent by the buyer to the vendor on an RFQ event.
- **Steps.**
  1. As the vendor, open the RFQ event and reject the counter offer.
  2. As the buyer, open the QCS on the RFQ tab.
- **Expected.** The vendor's response is shown as a rejection.
- **Oracle.** A tag reads "Last Counter Offer Rejected" for that vendor in the QCS.
- **Trace.** P0 · automate-later · `bec92226c8b282d08ba081dbd57b4ba2` · `how-to-send-and-manage-counter-offers` · Notion KB › Sourcing › Negotiation and Awarding › How to Send and Manage Counter Offers?

#### PRD-KBSRC-616 — Vendor modifies the counter offer — buyer QCS shows modified tag and new value

- **Why it matters.** A re-counter introduces a third price (between the original bid and the counter); the buyer must see the new value and the vendor's reason.
- **Setup.** Buyer and Vendor personas. Vendor's original bid ₹90; buyer sent a counter offer of ₹80 on Price.
- **Steps.**
  1. As the vendor, modify the counter offer to ₹85 and provide a remark explaining the adjustment.
  2. As the buyer, open the QCS on the RFQ tab.
- **Expected.** The vendor's bid shows the modified value ₹85 with the vendor's remark.
- **Oracle.** A tag reads "Modified Counter Offer Bid" with an orange thumbs up icon; the price shows ₹85 and the remark is visible.
- **Trace.** P0 · automate-later · `bec92226c8b282d08ba081dbd57b4ba2` · `how-to-send-and-manage-counter-offers` · Notion KB › Sourcing › Negotiation and Awarding › How to Send and Manage Counter Offers?

## 3. How to Send Bulk Counter Offers?

#### PRD-KBSRC-617 — Buyer sends a bulk counter offer to all vendors

- **Why it matters.** Bulk counter offers push one negotiation ask to every vendor at once; a partial send leaves some vendors un-negotiated and skews the comparison.
- **Setup.** Buyer persona. An RFQ event with several vendor bids in the QCS.
- **Steps.**
  1. Click on Settings and find "Send Bulk Counter Offers".
  2. Decide the counter offer to send to all vendors and click Send.
  3. Select the field to apply the counter offer on (e.g. Price).
  4. Input the new value to propose.
  5. Click **"Send Counter Offer"**.
- **Expected.** The counter offer is sent to all vendors.
- **Oracle.** A tooltip confirms the counter offer was sent successfully; a **"Counter Offer Requested"** tag appears above every vendor's name in the QCS, with changed values highlighted as original vs counter offer.
- **Trace.** P0 · automate-later · `fad92226c8b28398b5f20131a39dd898` · `how-to-send-bulk-counter-offers` · Notion KB › Sourcing › Negotiation and Awarding › How to Send Bulk Counter Offers?

#### PRD-KBSRC-618 — Bulk counter offer on a Global Field

- **Why it matters.** The article states bulk counter offers can also target Global Fields not tied to a line item.
- **Setup.** Buyer persona. RFQ event with a global field and several vendor bids.
- **Steps.**
  1. Click on Settings and choose "Send Bulk Counter Offers".
  2. Select a global field and input the new value.
  3. Click **"Send Counter Offer"**.
- **Expected.** The global-field counter offer is sent to all vendors.
- **Oracle.** Success tooltip; "Counter Offer Requested" tag above every vendor's name; global field value highlighted original vs counter.
- **Trace.** P2 · automate-later · `fad92226c8b28398b5f20131a39dd898` · `how-to-send-bulk-counter-offers` · Notion KB › Sourcing › Negotiation and Awarding › How to Send Bulk Counter Offers?

#### PRD-KBSRC-619 — Bulk counter offer sent without the optional note

- **Why it matters.** The note is optional in the bulk flow too; sending must not require it.
- **Setup.** Buyer persona. RFQ event with several vendor bids.
- **Steps.**
  1. Click on Settings and choose "Send Bulk Counter Offers".
  2. Select Price and input a new value; leave the note empty.
  3. Click **"Send Counter Offer"**.
- **Expected.** The bulk counter offer is sent without a note.
- **Oracle.** Success tooltip and "Counter Offer Requested" tag above every vendor's name.
- **Trace.** P2 · automate-later · `fad92226c8b28398b5f20131a39dd898` · `how-to-send-bulk-counter-offers` · Notion KB › Sourcing › Negotiation and Awarding › How to Send Bulk Counter Offers?

#### PRD-KBSRC-620 — Revoke option and highlighted values appear after a bulk counter offer

- **Why it matters.** After a bulk send the buyer still needs per-vendor control and a visible diff of what was countered.
- **Setup.** Buyer persona. A bulk counter offer has just been sent on an RFQ event.
- **Steps.**
  1. Open the QCS after sending the bulk counter offer.
  2. Inspect each vendor's header and the countered field.
- **Expected.** Each vendor shows the pending counter offer with a revoke option and highlighted changes.
- **Oracle.** "Revoke Counter Offer" option is shown for the vendors; changed values are highlighted showing original vs counter offer values.
- **Trace.** P2 · automate-later · `fad92226c8b28398b5f20131a39dd898` · `how-to-send-bulk-counter-offers` · Notion KB › Sourcing › Negotiation and Awarding › How to Send Bulk Counter Offers?

## 4. How do I Modify Counter Offers as a Vendor?

#### PRD-KBSRC-621 — Vendor submits a modified bid (re-counter) against a buyer counter offer

- **Why it matters.** The re-counter is the vendor's side of price negotiation; if it is not submitted or not reflected in the buyer's QCS, the negotiated price is lost.
- **Setup.** Vendor persona. An RFQ event where the buyer sent a counter offer (e.g. original price ₹90, buyer offered ₹80).
- **Steps.**
  1. Open the RFQ event where the counter offer was received.
  2. Observe the Counter Offer Banner.
  3. Click on the counter offer Decline option.
  4. Choose the **"Modify Counter Offer"** option instead of rejecting.
  5. Enter the updated value in the editable field (e.g. ₹85).
  6. Click the "Place Modified Bid" blue button.
  7. Add a remark explaining the reason for the modification.
  8. Click the blue **"Place Modified Bid"** button to confirm.
- **Expected.** The modified counter offer is submitted and the QCS is updated for the buyer, resolving the counter offer action.
- **Oracle.** The vendor's tag displays **"Modified Counter Offer Bid"** with an orange thumbs-up icon; the buyer's QCS shows ₹85 for the vendor.
- **Trace.** P0 · automate-later · `3c692226c8b283388d1181edcde2deb2` · `how-do-i-modify-counter-offers-as-a-vendor` · Notion KB › Sourcing › Negotiation and Awarding › How do I Modify Counter Offers as a Vendor?

#### PRD-KBSRC-622 — Counter Offer Banner shown to the vendor on receipt of a counter offer

- **Why it matters.** The banner is how the vendor learns a counter offer is waiting; without it the negotiation stalls.
- **Setup.** Vendor persona. Buyer has sent a counter offer on an RFQ event.
- **Steps.**
  1. As the vendor, open the RFQ event.
  2. Look above the line item or vendor quote sheet.
- **Expected.** The Counter Offer Banner is displayed.
- **Oracle.** A Counter Offer Banner appears above the line item or vendor quote sheet.
- **Trace.** P1 · automate-later · `3c692226c8b283388d1181edcde2deb2` · `how-do-i-modify-counter-offers-as-a-vendor` · Notion KB › Sourcing › Negotiation and Awarding › How do I Modify Counter Offers as a Vendor?

#### PRD-KBSRC-623 — Decline option offers both decline and modify

- **Why it matters.** The article states the system prompts the vendor to either decline or modify, so a vendor who disagrees is not forced into outright rejection.
- **Setup.** Vendor persona. RFQ event with a pending counter offer.
- **Steps.**
  1. Open the RFQ event and the Counter Offer Banner.
  2. Click on the counter offer Decline option.
- **Expected.** A dialogue box for declining the counter offer opens and offers the choice to decline or to modify.
- **Oracle.** The dialogue shows a decline choice and a **"Modify Counter Offer"** choice.
- **Trace.** P1 · automate-later · `3c692226c8b283388d1181edcde2deb2` · `how-do-i-modify-counter-offers-as-a-vendor` · Notion KB › Sourcing › Negotiation and Awarding › How do I Modify Counter Offers as a Vendor?

#### PRD-KBSRC-624 — Choosing Modify Counter Offer changes the banner and exposes an editable field

- **Why it matters.** After choosing modify the vendor needs an editable value to enter the re-counter; the article states the banner changes.
- **Setup.** Vendor persona. RFQ event with a pending counter offer.
- **Steps.**
  1. Click the counter offer Decline option.
  2. Choose **"Modify Counter Offer"**.
- **Expected.** The banner changes and an editable field for the updated value is available, with the "Place Modified Bid" button.
- **Oracle.** The banner content differs from the original Counter Offer Banner; an editable value field and a blue "Place Modified Bid" button are visible.
- **Trace.** P2 · automate-later · `3c692226c8b283388d1181edcde2deb2` · `how-do-i-modify-counter-offers-as-a-vendor` · Notion KB › Sourcing › Negotiation and Awarding › How do I Modify Counter Offers as a Vendor?

#### PRD-KBSRC-625 — Vendor's modification remark reaches the buyer

- **Why it matters.** The article says the remark helps buyers understand the pricing rationale; if it is dropped the buyer sees an unexplained price.
- **Setup.** Vendor and Buyer personas. RFQ event with a pending counter offer.
- **Steps.**
  1. As the vendor, choose **"Modify Counter Offer"**, enter an updated value and add a remark explaining the modification.
  2. Click **"Place Modified Bid"**.
  3. As the buyer, open the QCS and view the vendor's modified bid.
- **Expected.** The buyer can read the vendor's remark alongside the modified value.
- **Oracle.** Buyer's QCS shows the "Modified Counter Offer Bid" tag and the vendor's remark text for that bid.
- **Trace.** P2 · manual · `3c692226c8b283388d1181edcde2deb2` · `how-do-i-modify-counter-offers-as-a-vendor` · Notion KB › Sourcing › Negotiation and Awarding › How do I Modify Counter Offers as a Vendor?

## 5. How to Award Vendors and Submit Proposal for Approval

#### PRD-KBSRC-626 — Master QCS tab shows the evaluation summary on the latest commercial stage

- **Why it matters.** The MQCS is the basis for the award decision; missing prices, rankings or charges lead to wrong awards.
- **Setup.** Buyer persona involved in awarding after commercial negotiation. An event whose RFQ or auction stage has vendor bids.
- **Steps.**
  1. Navigate to the latest commercial stage (RFQ or auction).
  2. Click on the **Master QCS** tab.
- **Expected.** The MQCS shows final and initial price comparisons, technical and commercial rankings, custom columns per client configuration and charges across stages.
- **Oracle.** Master QCS tab displays final vs initial prices, technical and commercial ranks, configured custom columns and charges per stage.
- **Trace.** P1 · automate-later · `d0892226c8b282cb85be01dc6eac7de2` · `how-to-award-vendors-and-submit-proposal-for-approval` · Notion KB › Sourcing › Negotiation and Awarding › How to Award Vendors and Submit Proposal for Approval

#### PRD-KBSRC-627 — Start Awarding opens the awarding screen with proposal value summary

- **Why it matters.** The awarding screen totals drive the proposal value that goes for approval; L1 vs non-L1 split is a compliance signal.
- **Setup.** Buyer persona. Event with completed negotiation on the latest commercial stage.
- **Steps.**
  1. Open the **Master QCS** tab on the latest commercial stage.
  2. Click the **"Start Awarding"** button on the top right.
- **Expected.** The buyer is redirected to the awarding screen.
- **Oracle.** Awarding screen shows Total selected line items, Proposal value, L1 proposal value and Non-L1 proposal value.
- **Trace.** P0 · automate-later · `d0892226c8b282cb85be01dc6eac7de2` · `how-to-award-vendors-and-submit-proposal-for-approval` · Notion KB › Sourcing › Negotiation and Awarding › How to Award Vendors and Submit Proposal for Approval

#### PRD-KBSRC-628 — Buyer awards a line item to a vendor

- **Why it matters.** Awarding decides who supplies what at what value — the core money step of sourcing.
- **Setup.** Buyer persona. Awarding screen open for an event with vendor bids on line items.
- **Steps.**
  1. For a vendor under a line item, select the checkbox to initiate awarding.
  2. In the dialog, confirm awarding.
  3. Click **"Award"**.
- **Expected.** The line item is awarded to the selected vendor and the awarding summary updates.
- **Oracle.** The vendor's checkbox for that line item is selected and the awarding screen totals (Total selected line items, Proposal value, L1 / Non-L1 proposal value) reflect the award.
- **Trace.** P0 · automate-later · `d0892226c8b282cb85be01dc6eac7de2` · `how-to-award-vendors-and-submit-proposal-for-approval` · Notion KB › Sourcing › Negotiation and Awarding › How to Award Vendors and Submit Proposal for Approval

#### PRD-KBSRC-629 — Award dialog allows modifying the quantity to award

- **Why it matters.** The dialog lets the buyer award less than the full quantity (split award); the proposal value must follow the awarded quantity.
- **Setup.** Buyer persona. Awarding screen open for a line item with bids from at least two vendors.
- **Steps.**
  1. Select the checkbox for a vendor under the line item.
  2. In the dialog, modify the quantity to award to a part of the line quantity.
  3. Click **"Award"**.
- **Expected.** Only the modified quantity is awarded to the vendor.
- **Oracle.** The awarded quantity shown for the vendor equals the value entered, and the Proposal value reflects that quantity.
- **Trace.** P1 · automate-later · `d0892226c8b282cb85be01dc6eac7de2` · `how-to-award-vendors-and-submit-proposal-for-approval` · Notion KB › Sourcing › Negotiation and Awarding › How to Award Vendors and Submit Proposal for Approval

#### PRD-KBSRC-630 — Global charges comparison across commercial stages at the bottom of the awarding screen

- **Why it matters.** The article's note says global charges and other costs can be compared between commercial stages before awarding.
- **Setup.** Buyer persona. Event with more than one commercial stage and global charges; awarding screen open.
- **Steps.**
  1. On the awarding screen, scroll to the bottom.
- **Expected.** Global charges and other costs are shown for comparison between the commercial stages.
- **Oracle.** The bottom section of the awarding screen lists global charges/costs per commercial stage.
- **Trace.** P2 · automate-later · `d0892226c8b282cb85be01dc6eac7de2` · `how-to-award-vendors-and-submit-proposal-for-approval` · Notion KB › Sourcing › Negotiation and Awarding › How to Award Vendors and Submit Proposal for Approval

#### PRD-KBSRC-631 — Create Proposal opens the Note for Approval screen

- **Why it matters.** The Note for Approval (NFA) is the document approvers decide on; missing sections mean approvals are made blind.
- **Setup.** Buyer persona. Awarding completed on the awarding screen.
- **Steps.**
  1. Click **"Create Proposal"** on the top right.
  2. Fill out any required additional information.
  3. Review the screen sections.
- **Expected.** A **Note for Approval** screen opens with the event's details for review.
- **Oracle.** Note for Approval screen shows Event overview, Allocation summary, Comparison sheets and List of participants and allocations.
- **Trace.** P0 · automate-later · `d0892226c8b282cb85be01dc6eac7de2` · `how-to-award-vendors-and-submit-proposal-for-approval` · Notion KB › Sourcing › Negotiation and Awarding › How to Award Vendors and Submit Proposal for Approval

#### PRD-KBSRC-632 — Buyer submits the award proposal into an approval workflow

- **Why it matters.** Submitting routes the award into internal compliance approval; the wrong workflow or chain means the wrong people approve spend.
- **Setup.** Buyer persona. Note for Approval screen completed for an awarded event; at least one approval workflow configured.
- **Steps.**
  1. Click **"Submit Proposal"** on the top right.
  2. In the dialog, select the appropriate approval workflow.
  3. Review the proposal details (line items, values, type) and add closing remarks if needed.
  4. Scroll down to verify the approval chain.
  5. Click **"Submit Proposal"** on the bottom right.
- **Expected.** The proposal is submitted and the buyer is taken to the **Approval Screen**.
- **Oracle.** Approval Screen shows the generated note for approval, event overview and allocation details, and the full approval chain listed on the right.
- **Trace.** P0 · automate-later · `d0892226c8b282cb85be01dc6eac7de2` · `how-to-award-vendors-and-submit-proposal-for-approval` · Notion KB › Sourcing › Negotiation and Awarding › How to Award Vendors and Submit Proposal for Approval

#### PRD-KBSRC-633 — Approver approves the award proposal from the Approval Screen

- **Why it matters.** Approval is the compliance gate before a purchase order is raised.
- **Setup.** A user who is an approver in the proposal's approval chain; a submitted award proposal.
- **Steps.**
  1. Open the proposal's **Approval Screen**.
  2. Review the note for approval, event overview, allocation details and approval chain.
  3. Take the **Approve** action.
- **Expected.** The approver's approval is recorded on the proposal.
- **Oracle.** The approval chain on the right shows this approver as approved.
- **Trace.** P0 · automate-later · `d0892226c8b282cb85be01dc6eac7de2` · `how-to-award-vendors-and-submit-proposal-for-approval` · Notion KB › Sourcing › Negotiation and Awarding › How to Award Vendors and Submit Proposal for Approval

#### PRD-KBSRC-634 — Approver rejects the award proposal

- **Why it matters.** Rejection must stop the award from proceeding to a purchase order.
- **Setup.** A user who is an approver in the proposal's approval chain; a submitted award proposal.
- **Steps.**
  1. Open the proposal's **Approval Screen**.
  2. Take the **Reject** action.
- **Expected.** The proposal is rejected by this approver and no purchase order is requested for it.
- **Oracle.** The approval chain shows this approver as rejected; no purchase order for the event appears in the "Purchase Orders" tab.
- **Trace.** P0 · manual · `d0892226c8b282cb85be01dc6eac7de2` · `how-to-award-vendors-and-submit-proposal-for-approval` · Notion KB › Sourcing › Negotiation and Awarding › How to Award Vendors and Submit Proposal for Approval

#### PRD-KBSRC-635 — Only approvers can take Approve or Reject action

- **Why it matters.** The article states the Approve / Reject action is for approvers; a non-approver able to approve would bypass the compliance chain.
- **Setup.** Two users: one in the proposal's approval chain, one buyer not in it. A submitted award proposal.
- **Steps.**
  1. As the non-approver buyer, open the proposal's Approval Screen.
  2. As the approver, open the same Approval Screen.
- **Expected.** Approve / Reject actions are available to the approver and not to the non-approver.
- **Oracle.** The non-approver's screen shows no Approve / Reject action; the approver's screen shows both.
- **Trace.** P1 · manual · `d0892226c8b282cb85be01dc6eac7de2` · `how-to-award-vendors-and-submit-proposal-for-approval` · Notion KB › Sourcing › Negotiation and Awarding › How to Award Vendors and Submit Proposal for Approval

#### PRD-KBSRC-636 — Approver finds the proposal via the Approvals tab and adds remarks

- **Why it matters.** Approvers reach proposals from the left navigation, not from the event; the NFA must be reviewable with remarks before deciding.
- **Setup.** A user who is an approver on a submitted award proposal.
- **Steps.**
  1. Navigate to the **"Approvals"** tab in the left navigation panel.
  2. Click on the event to view for approval.
  3. On the Approvals/Proposals page, review the NFA and Proposal and leave remarks.
  4. Approve or reject accordingly.
- **Expected.** The event is listed on the approvals page and the approver can review, remark and act.
- **Oracle.** The event appears on the approvals page; the Approvals/Proposals page shows the NFA and Proposal; the remark is saved with the decision.
- **Trace.** P1 · automate-later · `d0892226c8b282cb85be01dc6eac7de2` · `how-to-award-vendors-and-submit-proposal-for-approval` · Notion KB › Sourcing › Negotiation and Awarding › How to Award Vendors and Submit Proposal for Approval

#### PRD-KBSRC-637 — All approvals received triggers a purchase order request to the ERP

- **Why it matters.** Award → PO is the hand-off from sourcing to P2P; the article states it happens automatically once every approval is in.
- **Setup.** An award proposal with its full approval chain; all approvers available.
- **Steps.**
  1. Have every approver in the chain approve the proposal.
  2. Open the **"Purchase Orders"** tab.
- **Expected.** The system automatically sends a request to the ERP to generate a purchase order, and the purchase orders requested from the awarded event are listed.
- **Oracle.** The "Purchase Orders" tab lists the purchase orders requested from the event just awarded.
- **Trace.** P0 · automate-later · `d0892226c8b282cb85be01dc6eac7de2` · `how-to-award-vendors-and-submit-proposal-for-approval` · Notion KB › Sourcing › Negotiation and Awarding › How to Award Vendors and Submit Proposal for Approval

#### PRD-KBSRC-638 — No purchase order request while approvals are still pending

- **Why it matters.** The article conditions PO generation on all approvals being received; an early PO would bypass approvers still in the chain.
- **Setup.** An award proposal with an approval chain of at least two approvers.
- **Steps.**
  1. Have only the first approver approve the proposal.
  2. Open the **"Purchase Orders"** tab.
- **Expected.** No purchase order is requested for the event until the remaining approvals are received.
- **Oracle.** The "Purchase Orders" tab shows no purchase order for the event; the approval chain shows the remaining approvers as pending.
- **Trace.** P1 · manual · `d0892226c8b282cb85be01dc6eac7de2` · `how-to-award-vendors-and-submit-proposal-for-approval` · Notion KB › Sourcing › Negotiation and Awarding › How to Award Vendors and Submit Proposal for Approval

## 6. How to approve an Awarding proposal?

#### PRD-KBSRC-639 — Approver approves an awarding proposal from the Approvals tab

- **Why it matters.** Approval of the award proposal is the final gate before a purchase order is requested.
- **Setup.** A user who is an approver on an awarding proposal that has been created and submitted for a sourcing project.
- **Steps.**
  1. Navigate to the **"Approvals"** tab in the left navigation panel.
  2. Click on the event to view for approval.
  3. Review the NFA and Proposal and leave remarks.
  4. Approve.
- **Expected.** The approval is recorded; once all approvals are received the purchase order is requested for generation.
- **Oracle.** The proposal shows the approver's approval; after the final approval the "Purchase Orders" tab lists the purchase orders requested from the awarded event.
- **Trace.** P0 · automate-later · `ac092226c8b282be904481b0fc6295de` · `how-to-approve-an-awarding-proposal` · Notion KB › Sourcing › Negotiation and Awarding › How to approve an Awarding proposal?

#### PRD-KBSRC-640 — Approver rejects an awarding proposal from the Approvals tab

- **Why it matters.** The article lets the approver reject after review; a rejected award must not move forward.
- **Setup.** A user who is an approver on a submitted awarding proposal.
- **Steps.**
  1. Navigate to the **"Approvals"** tab and click on the event.
  2. Review the NFA and Proposal and leave remarks.
  3. Reject.
- **Expected.** The proposal is rejected by the approver.
- **Oracle.** The proposal shows the rejection with the approver's remark; no purchase order for the event appears in the "Purchase Orders" tab.
- **Trace.** P0 · manual · `ac092226c8b282be904481b0fc6295de` · `how-to-approve-an-awarding-proposal` · Notion KB › Sourcing › Negotiation and Awarding › How to approve an Awarding proposal?

#### PRD-KBSRC-641 — Awarding proposal appears in the Approvals list once submitted

- **Why it matters.** The article states an approval is triggered after awarding and proposal creation; if it never reaches the approver, the award is stuck.
- **Setup.** Buyer has completed awarding and proposal creation for a sourcing project; approver user in the chain.
- **Steps.**
  1. As the approver, navigate to the **"Approvals"** tab in the left navigation panel.
- **Expected.** The sourcing event is listed on the approvals page.
- **Oracle.** The event appears on the approvals page for the approver.
- **Trace.** P1 · automate-later · `ac092226c8b282be904481b0fc6295de` · `how-to-approve-an-awarding-proposal` · Notion KB › Sourcing › Negotiation and Awarding › How to approve an Awarding proposal?

#### PRD-KBSRC-642 — Approvals/Proposals page shows the sourcing event details for review

- **Why it matters.** The approver decides on what this page shows; the article names allocations summary and overview.
- **Setup.** Approver user; an awarding proposal pending their approval.
- **Steps.**
  1. Navigate to the **"Approvals"** tab.
  2. Click on the event.
- **Expected.** The Approvals/Proposals page shows the details of the sourcing event including the allocations summary and overview, with the NFA and Proposal.
- **Oracle.** Page displays the allocations summary, overview, NFA and Proposal for the event.
- **Trace.** P1 · automate-later · `ac092226c8b282be904481b0fc6295de` · `how-to-approve-an-awarding-proposal` · Notion KB › Sourcing › Negotiation and Awarding › How to approve an Awarding proposal?

#### PRD-KBSRC-643 — Purchase order requested after all approvals is visible in the Purchase Orders tab

- **Why it matters.** The article states the system automatically sends a PO request to the ERP when all approvals are in; this is the sourcing → P2P hand-off.
- **Setup.** An awarding proposal whose approval chain has been fully approved.
- **Steps.**
  1. After the last approval, open the **"Purchase Orders"** tab.
  2. Look for purchase orders from the awarded event.
- **Expected.** The purchase orders requested from the event just awarded are listed.
- **Oracle.** The "Purchase Orders" tab lists purchase orders requested from the awarded event.
- **Trace.** P0 · automate-later · `ac092226c8b282be904481b0fc6295de` · `how-to-approve-an-awarding-proposal` · Notion KB › Sourcing › Negotiation and Awarding › How to approve an Awarding proposal?

#### PRD-KBSRC-644 — PO request waits for every approval in the chain

- **Why it matters.** "Once all the approvals have been received" is a stated condition — a partial approval must not trigger the ERP request.
- **Setup.** An awarding proposal with at least two approvers.
- **Steps.**
  1. First approver approves via the **"Approvals"** tab.
  2. Open the **"Purchase Orders"** tab.
  3. Second approver approves.
  4. Open the **"Purchase Orders"** tab again.
- **Expected.** No purchase order is requested after only the first approval; it is requested after the final approval.
- **Oracle.** "Purchase Orders" tab shows no PO for the event after step 2 and lists it after step 4.
- **Trace.** P1 · manual · `ac092226c8b282be904481b0fc6295de` · `how-to-approve-an-awarding-proposal` · Notion KB › Sourcing › Negotiation and Awarding › How to approve an Awarding proposal?
