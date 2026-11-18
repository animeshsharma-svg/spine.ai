# Generated test cases — drafts (2026-10-27)

Every case below was written by the spine.ai assistant when someone typed a test case that no existing case covered.
They are DRAFTS: nothing here is in the catalog until a person reviews it and moves it into a catalog file
(the importer does not read `generated-*.md`, and `GEN-` ids are not parsed).

## 1. Drafts from the assistant

### GEN-JRN-060 — Both bids remain in Responses while bidding is on

- **Why it matters.** A senior tester's addition to the journey "SRC-RJB-001 — Reject Bid is disabled while bidding is on Module: 15. Reject Bid (reject quote) and the Rejected Bids lis". **Draft, needs review** — written by the assistant on 2026-10-27 from a request typed in the chat box; the automation covers part of it — not yet: see the gaps.
- **Module / scenario.** Journey — SRC-RJB-001 — Reject Bid is disabled while bidding is on Mod — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with two active bids: Vendor A quoted 100 and Vendor B quoted 90.
- **Test data.** Vendor A: 100; Vendor B: 90
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" 3. Type the RFQ title in "Search Title" 4. Click the RFQ in the results list 5. Open the RFQ stage's "Responses" tab 6. Count the active bids shown in the responses list
- **Expected.** The responses list shows 2 active bids. Vendor A's bid is 100 and Vendor B's bid is 90. Neither bid has a rejected status.
- **Oracle.** The responses list shows 2 active bids. Vendor A's bid is 100 and Vendor B's bid is 90. Neither bid has a rejected status.
- **Trace.** High · Positive · draft · `GEN-JRN-060` · layer ui · coverage partial · typed: “journey: SRC-RJB-001 — Reject Bid is disabled while bidding is on Module: 15. Reject Bid (reject quote) and the Rejected Bids list. Scenario: When rejection is possible. Who: Buyer on the Buyer portal”

### GEN-JRN-061 — Reject Bid is unavailable to a buyer without permission for the event

- **Why it matters.** A senior tester's addition to the journey "SRC-RJB-001 — Reject Bid is disabled while bidding is on Module: 15. Reject Bid (reject quote) and the Rejected Bids lis", grounded in rule R-3. **Draft, needs review** — written by the assistant on 2026-10-27 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — SRC-RJB-001 — Reject Bid is disabled while bidding is on Mod — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A live RFQ with two active bids. The signed-in buyer can view the RFQ but is not the super admin, CSM of the event company, stage owner, or a member of the auction team.
- **Test data.** Vendor A: 100; Vendor B: 90
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" 3. Type the RFQ title in "Search Title" 4. Click the RFQ in the results list 5. Open the RFQ stage's "Responses" tab 6. Move the mouse over "Reject Bid" on Vendor A's bid
- **Expected.** "Reject Bid" is not available for this buyer. If a rejection request is attempted, the request is refused with HTTP 455. Record the exact message shown by the app.
- **Oracle.** "Reject Bid" is not available for this buyer. If a rejection request is attempted, the request is refused with HTTP 455. Record the exact message shown by the app.
- **Trace.** High · Negative · draft · `GEN-JRN-061` · layer ui · coverage none · typed: “journey: SRC-RJB-001 — Reject Bid is disabled while bidding is on Module: 15. Reject Bid (reject quote) and the Rejected Bids list. Scenario: When rejection is possible. Who: Buyer on the Buyer portal”

### GEN-JRN-062 — Rejecting a bid removes it from the comparison view and lists it as rejected

- **Why it matters.** A senior tester's addition to the journey "SRC-RJB-001 — Reject Bid is disabled while bidding is on Module: 15. Reject Bid (reject quote) and the Rejected Bids lis", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-27 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — SRC-RJB-001 — Reject Bid is disabled while bidding is on Mod — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A closed RFQ where Vendor A quoted 100 and Vendor B quoted 90. The buyer is the stage owner or otherwise has permission to reject bids.
- **Test data.** Vendor A: 100; Vendor B: 90; rejection reason: "Price is not competitive"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" 3. Open the "History" tab 4. Type the RFQ title in "Search Title" 5. Click the RFQ in the results list 6. Open the RFQ stage's "Responses" tab 7. Click "Reject Bid" on Vendor A's bid 8. Type "Price is not competitive" in "Remarks" 9. Click "Reject Bid" in the rejection form 10. Click "Master QCS" 11. Open "Rejected Bids"
- **Expected.** Vendor A's 100 bid is no longer in the active comparison view. Vendor B's 90 bid remains active. "Rejected Bids" shows Vendor A's rejected bid with the remark "Price is not competitive".
- **Oracle.** Vendor A's 100 bid is no longer in the active comparison view. Vendor B's 90 bid remains active. "Rejected Bids" shows Vendor A's rejected bid with the remark "Price is not competitive".
- **Trace.** High · Positive · draft · `GEN-JRN-062` · layer ui · coverage none · typed: “journey: SRC-RJB-001 — Reject Bid is disabled while bidding is on Module: 15. Reject Bid (reject quote) and the Rejected Bids list. Scenario: When rejection is possible. Who: Buyer on the Buyer portal”

### GEN-JRN-063 — Rejecting the latest revision restores the vendor's previous revision in the QCS

- **Why it matters.** A senior tester's addition to the journey "SRC-RJB-001 — Reject Bid is disabled while bidding is on Module: 15. Reject Bid (reject quote) and the Rejected Bids lis", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-27 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — SRC-RJB-001 — Reject Bid is disabled while bidding is on Mod — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A closed RFQ where Vendor A first quoted 110 and then revised the same bid to 100. The 100 revision is the active bid, and the buyer has permission to reject it.
- **Test data.** Vendor A previous revision: 110; Vendor A latest revision: 100; rejection reason: "Latest revision rejected"
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" 3. Open the "History" tab 4. Type the RFQ title in "Search Title" 5. Click the RFQ in the results list 6. Open the RFQ stage's "Responses" tab 7. Click "Reject Bid" on Vendor A's 100 bid 8. Type "Latest revision rejected" in "Remarks" 9. Click "Reject Bid" in the rejection form 10. Click "Master QCS"
- **Expected.** The rejected 100 revision is not shown as the active bid. Vendor A's previous 110 revision is restored in the QCS. The QCS shows 1 active Vendor A revision, with the price 110.
- **Oracle.** The rejected 100 revision is not shown as the active bid. Vendor A's previous 110 revision is restored in the QCS. The QCS shows 1 active Vendor A revision, with the price 110.
- **Trace.** High · Positive · draft · `GEN-JRN-063` · layer ui · coverage none · typed: “journey: SRC-RJB-001 — Reject Bid is disabled while bidding is on Module: 15. Reject Bid (reject quote) and the Rejected Bids list. Scenario: When rejection is possible. Who: Buyer on the Buyer portal”

### GEN-JRN-064 — A rejected bid is not available for awarding

- **Why it matters.** A senior tester's addition to the journey "SRC-RJB-001 — Reject Bid is disabled while bidding is on Module: 15. Reject Bid (reject quote) and the Rejected Bids lis", grounded in rule R-1. **Draft, needs review** — written by the assistant on 2026-10-27 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — SRC-RJB-001 — Reject Bid is disabled while bidding is on Mod — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** A closed RFQ where Vendor A's bid of 100 has been rejected and Vendor B's bid of 90 remains active.
- **Test data.** Vendor A: 100 rejected; Vendor B: 90 active
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. From the left menu click "Events" 3. Open the "History" tab 4. Type the RFQ title in "Search Title" 5. Click the RFQ in the results list 6. Click "Master QCS" 7. Click "Start Awarding" 8. Open the vendor selection or bid list in the awarding screen
- **Expected.** Vendor A's rejected bid is not selectable for awarding and is not included in the award totals. Vendor B's active bid of 90 is available for awarding.
- **Oracle.** Vendor A's rejected bid is not selectable for awarding and is not included in the award totals. Vendor B's active bid of 90 is available for awarding.
- **Trace.** Critical · Negative · draft · `GEN-JRN-064` · layer ui · coverage none · typed: “journey: SRC-RJB-001 — Reject Bid is disabled while bidding is on Module: 15. Reject Bid (reject quote) and the Rejected Bids list. Scenario: When rejection is possible. Who: Buyer on the Buyer portal”

