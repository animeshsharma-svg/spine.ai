# Generated test cases — drafts (2026-10-03)

Every case below was written by the spine.ai assistant when someone typed a test case that no existing case covered.
They are DRAFTS: nothing here is in the catalog until a person reviews it and moves it into a catalog file
(the importer does not read `generated-*.md`, and `GEN-` ids are not parsed).

## 1. Drafts from the assistant

### GEN-BID-001 — Vendor cannot bid after an extended round closes

- **Why it matters.** Confirms that extending the deadline does not leave the sourcing round active after the new deadline passes. **Draft, needs review** — written by the assistant on 2026-10-03 from a request typed in the chat box; the automation built for it covers all of it.
- **Setup.** Create a sourcing event with a vendor invited and a short bid window. Extend the bid deadline before it expires, then allow the extended deadline to pass and close the round again.
- **Steps.** 1. Open the sourcing event as the vendor. 2. Try to submit a bid after the extended deadline has passed. 3. Observe the submission result.
- **Expected.** The vendor cannot submit the bid after the round closes again.
- **Oracle.** The bid is rejected and no new bid is created for the vendor.
- **Trace.** P1 · draft · `GEN-BID-001` · layer api · coverage full · api plan on `published_rfq_short` · overlaps `API-XBID-075`, `API-XBID-049`, `API-XMAT-072` · typed: “After the bid end time is extended by the buyer and the round closes again, the vendor cannot submit a bid”

### GEN-BID-002 — Bid After RFQ Extension

- **Why it matters.** Confirm that extending a live RFQ gives an invited vendor enough additional time to submit a complete bid. **Draft, needs review** — written by the assistant on 2026-10-03 from a request typed in the chat box; the automation built for it covers all of it.
- **Setup.** A buyer has a live RFQ with required line items and an invited vendor. The original bid deadline is close enough to test the extension. The vendor has access to the RFQ but has not submitted a bid.
- **Steps.** 1. As the buyer, extend the bid deadline by a few minutes. 2. Confirm that the new deadline is shown for the RFQ. 3. As the invited vendor, open the RFQ after the original deadline would have passed. 4. Enter valid values for every required line item and bid field. 5. Submit the complete bid before the extended deadline.
- **Expected.** The invited vendor can open the RFQ during the extended period and successfully submit a complete bid. The submitted bid is recorded against the RFQ and is visible to the buyer.
- **Oracle.** Verify that the vendor receives a successful submission confirmation, the bid appears in the RFQ's bid list with the expected values, and no required-field or closed-event error is shown.
- **Trace.** P1 · draft · `GEN-BID-002` · layer api · coverage full · api plan on `published_rfq` · overlaps `UI-SCH-010`, `API-XBID-015`, `GEN-BID-001` · typed: “After the buyer extends the bid end time of a live RFQ by a few minutes, the invited vendor can still place a complete bid”

