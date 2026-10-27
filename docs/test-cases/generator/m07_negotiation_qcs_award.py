from common import *

# ═══════════════════════════ 21. Counter offer ═════════════════════════════════════════
M21 = "21. Counter offer — only on a vendor's own (normal) bid"
co = lambda ev, *s: [BUYER_LOGIN, open_event(ev), "Open the RFQ stage's \"Responses\" tab", *s]
SEND = ["Click \"Counter Offer\" on Vendor A's bid. The counter offer pop-up opens with Vendor A's lines",
        "Tick the line, change Price from 100 to 90, type \"Best price please\" in \"Counter Offer Remarks\"",
        "Click \"Send Counter Offer\""]
for timing, ev in [("while bidding is live", "the RFQ with two bids (A 100, B 90)"), ("during evaluation time", "the RFQ in evaluation (A 100, B 90)")]:
    case("SRC-NEG", M21, f"Send — {timing}", f"Send a counter offer {timing}", co(ev, *SEND),
         "The pop-up closes; Vendor A's bid shows the counter offer (90 against the quoted 100) and a red \"Revoke Counter Offer\" link replaces Counter Offer; the participants panel counts it under \"Active Counter Offers\". Vendor A gets the counter offer to accept or reject.",
         priority="Critical")
    for resp, vsteps, exp in [
        ("accepts", ["Open the event and the pending counter offer", "Click Accept"],
         "Vendor A's current price becomes 90 (counter offer accepted); the buyer's Responses and Master QCS use 90 and the panel counts it under \"Accepted Counter Offers\"; awarding Vendor A uses 90 × 10 = 900."),
        ("rejects", ["Open the pending counter offer", "Click Reject"],
         "The counter offer is closed as rejected; Vendor A's price stays 100 everywhere; the buyer may send a new counter offer while the event is live or in evaluation."),
        ("does not answer", ["Do nothing"],
         "The counter offer stays pending (\"Revoke Counter Offer\" still shown); the comparison keeps 100; Vendor A cannot revise its price meanwhile (\"You have a counter offer pending on this bid\")."),
    ]:
        case("SRC-NEG", M21, f"Vendor answer — {timing}", f"Counter offer {timing}: the vendor {resp}",
             co(ev, *SEND) + [vendor_login(VA)] + vsteps + [BUYER_LOGIN, open_event(ev), "Open Responses and Master QCS"],
             exp, role="Buyer, Vendor A", portal="Buyer + Vendor portal", priority="Critical" if resp == "accepts" else "High")
for title, ev, steps, exp, tt in [
    ("Buyer revokes a pending counter offer", "the RFQ in evaluation (A 100, B 90)", SEND + ["Click \"Revoke Counter Offer\" on Vendor A's bid"],
     "The counter offer is withdrawn; Vendor A's bid is active again at 100 with Counter Offer available; Vendor A no longer sees a pending offer and can revise again.", "Positive"),
    ("Revoke after the vendor already answered", "the RFQ in evaluation (A 100, B 90)", SEND + ["Let Vendor A accept", "Try to revoke (e.g. from a stale page)"],
     "Refused: \"No active counter offer found to modify\"; the accepted price stays.", "Negative"),
    ("Second counter offer after the vendor rejected the first", "the RFQ in evaluation (A 100, B 90)", SEND + ["Let Vendor A reject", "Send a new counter offer of 95"],
     "A new counter offer of 95 is pending; both offers are listed in order on the bid.", "Positive"),
    ("Counter offer after an accepted one", "the RFQ in evaluation (A 100, B 90)", SEND + ["Let Vendor A accept 90", "Try another counter offer on Vendor A"],
     "Record the result; where blocked the app says \"Accepted bid exists. You cannot perform this action.\"", "Edge"),
    ("Award at the accepted counter-offer price", "the RFQ in evaluation (A 100, B 90)", SEND + ["Let Vendor A accept 90", "Wait for the event to close, open Master QCS, Start Awarding, award all 10 to Vendor A"],
     "The award shows 90 per unit and 900 in total for Vendor A (not 1,000).", "Positive"),
    ("Send with nothing ticked", "the RFQ in evaluation (A 100, B 90)", ["Click \"Counter Offer\" on Vendor A", "Untick every line and click Send Counter Offer"], "Refused: \"Please select atleast one product to send counter offer\".", "Negative"),
    ("Send with nothing changed", "the RFQ in evaluation (A 100, B 90)", ["Click \"Counter Offer\", tick the line, change nothing, Send"], "Refused: \"You must change atleast one column to send counter offer\".", "Negative"),
    ("Counter price 0", "the RFQ in evaluation (A 100, B 90)", ["Click \"Counter Offer\", tick the line, type 0, Send"], "Refused: \"Gross total can't be 0, please check your entries.\"", "Negative"),
    ("Counter offer on a line the vendor did not quote", "an RFQ where Vendor A quoted only line 1 of 2", ["Counter Offer on Vendor A, change line 2's price"], "Refused: \"You cannot raise a counter offer on a non quoted item.\"", "Negative"),
    ("Counter offer on a column that is not negotiable", "the RFQ in evaluation (A 100, B 90)", ["Counter Offer, change a column that is not allowed (e.g. GST)"], "Refused: \"You cannot give a counter offer on these columns.\"", "Negative"),
    ("Counter offer on a surrogate bid", "an RFQ in evaluation with a surrogate bid for Vendor C", ["Look for Counter Offer on Vendor C's surrogate bid and try it"], "Not allowed: \"You cannot send counter offer for bids added by you.\"", "Negative"),
    ("Counter offer on a blacklisted vendor's bid", "an RFQ in evaluation where Vendor B is blacklisted", ["Look at Vendor B's Counter Offer button"], "The button is disabled for a blacklisted vendor.", "Negative"),
    ("No counter offer after the event closed", "the closed RFQ (A 100, B 90)", ["Look for Counter Offer"], "No Counter Offer button on a closed event (only live or evaluation).", "Negative"),
    ("Counter offer on an auction bid", "the live reverse auction with bids", ["Look for Counter Offer on a bid"], "Record whether Counter Offer is offered on an auction bid; product rule: counter offers are for normal RFQ bids.", "Edge"),
    ("Double-click Send Counter Offer", "the RFQ in evaluation (A 100, B 90)", ["Fill the counter offer and click Send twice fast"], "Exactly one counter offer is created.", "Edge"),
    ("Bulk counter offer to all bidders", "the RFQ in evaluation (A 100, B 90)", [OPEN_SETTINGS, "Click \"Send Bulk Counter Offer\", set the target for each vendor, send"],
     "\"Bulk Counter Offer sent successfully!\"; Vendors A and B each get one counter offer.", "Positive"),
    ("Bulk counter offer with only one bid", "a live RFQ with only Vendor A's bid", [OPEN_SETTINGS, "Move the mouse over \"Send Bulk Counter Offer\""], "Greyed out: bulk counter offer needs more than one bid.", "Negative"),
]:
    case("SRC-NEG", M21, "Counter offer — rules", title, co(ev, *steps), exp, role="Buyer, Vendor A", portal="Buyer + Vendor portal", ttype=tt,
         priority="High" if tt != "Edge" else "Medium")
case("SRC-NEG", M21, "Vendor view", "What the vendor sees for a counter offer",
     [vendor_login(VA), "Open the event with a pending counter offer"],
     "A notice of the buyer's counter offer: the line, its quoted price 100, the offered price 90, the remark \"Best price please\", and Accept / Reject buttons. Vendor B sees nothing about it.",
     role="Vendor A", portal="Vendor portal", pre="Counter offer of 90 sent to Vendor A.", priority="High")

# ═══════════════════════════ 22. Master QCS and report ═════════════════════════════════
M22 = "22. Master QCS — comparison and report"
qc = lambda ev, *s: [BUYER_LOGIN, open_event(ev), "Click the \"Master QCS\" tab", *s]
for title, ev, exp, tt in [
    ("Master QCS before any bid", "the live RFQ (no bids)", "The tab says \"No bids are placed yet!\" and there is no \"Start Awarding\" button: nothing can be awarded until a bid exists. (Checked live on 27 Oct: the button is not shown at all, not greyed out.)", "Negative"),
    ("Master QCS with one bid", "a live RFQ with only Vendor A at 100", "One vendor column: Vendor A, rank 1, amount 1,000 for 10 units, sum total with GST.", "Positive"),
    ("Master QCS with two bids", "the RFQ with two bids (A 100, B 90)", "Two columns: Vendor B rank 1 (L1) with 900, Vendor A rank 2 with 1,000; the lowest price is highlighted.", "Positive"),
    ("Master QCS with three bids", "an RFQ with A 100, B 90, C 95", "Ranks: B 1 (900), C 2 (950), A 3 (1,000).", "Positive"),
    ("Two vendors with the same price", "an RFQ with A 100 and B 100", "Both get the same rank. Record whether it shows 1 and 1 (expected) — earlier runs showed rank 2 for both with nobody at rank 1; report that as a defect.", "Edge"),
    ("A rejected bid", "the RFQ in evaluation with Vendor A rejected", "Only Vendor B is ranked; Vendor A is shown as rejected (not ranked, cannot be awarded).", "Positive"),
    ("A revoked bid", "an RFQ where Vendor A revoked its bid", "Vendor A is not ranked and cannot be awarded.", "Positive"),
    ("A surrogate bid", "an RFQ with a surrogate bid for Vendor C at 95", "Vendor C is ranked by its price and marked \"Surrogate\".", "Positive"),
    ("After a vendor revises", "the RFQ with two bids (A 100, B 90) after Vendor A revises to 85", "Vendor A becomes rank 1 with 850; Vendor B rank 2 — the comparison refreshes without a manual reload (or after one refresh).", "Positive"),
    ("After an accepted counter offer", "the RFQ in evaluation after Vendor A accepted a counter offer of 85", "Vendor A shows 85 (the accepted counter-offer price) and becomes rank 1.", "Positive"),
    ("Savings before bidding ends", "the RFQ with two bids (A 100, B 90), still live", "Savings are not shown yet (\"Savings will be visible after bidding ends\").", "Negative"),
    ("Savings after bidding ends", "the closed RFQ (A 100, B 90) with a budget of 120 per unit", "Savings against budget: (120 − 90) × 10 = 300, i.e. 25 %; a budget of 0 never shows \"Infinity %\".", "Positive"),
    ("Hide fields", "the RFQ with two bids (A 100, B 90)", "\"Hide fields\" lets you hide columns; hidden columns disappear from the view (and the count shows on the button); showing them again restores them.", "Positive"),
    ("Multi-currency event", "a closed RFQ where Vendor A quoted in USD and B in INR", "Prices compare in the base currency using the event's exchange rate; Settings > \"Show Bidding Currency\" shows the vendor's own currency, \"Show Default Currency\" switches back.", "Positive"),
    ("Two lines, different winners", "an RFQ with line 1 (A 100, B 90) and line 2 (A 50, B 60), 10 units each", "Line 1: B is L1 (900). Line 2: A is L1 (500). The sum totals are A 1,500 and B 1,500 (record which vendor is ranked overall).", "Positive"),
]:
    case("SRC-QCS", M22, "Comparison", title, qc(ev, "Read the vendor columns, ranks, amounts and totals"), exp, ttype=tt, priority="High" if tt != "Edge" else "Medium")
for title, ev, exp, tt in [
    ("Download Report matches the screen", "the closed RFQ (A 100, B 90)", "The file has the same vendors, ranks, unit prices, amounts and totals as Master QCS, plus the event summary (event number, title, dates, vendors invited and participated).", "Positive"),
    ("Download Report while bids are locked", "a project with locked bids before technical evaluation", "Refused: \"Unlock Bid to Download Report\".", "Negative"),
    ("Download Report after award", "the awarded event with PO", "The report also shows the awarded vendor, awarded quantity and amount.", "Positive"),
    ("Download Report with a rejected bid", "the RFQ in evaluation with Vendor A rejected", "The rejected bid is shown as rejected (with its remark) and is not ranked.", "Positive"),
]:
    case("SRC-QCS", M22, "Report", title, qc(ev, "Click \"Download Report\" and open the file"), exp, ttype=tt, priority="High" if tt == "Positive" else "Medium")
case("SRC-QCS", M22, "Vendor side", "A vendor never sees other vendors' prices",
     [vendor_login(VA), "Open the RFQ with two bids", "Look everywhere on the page (sheet, rank, history)"],
     "Only Vendor A's own figures (and its rank if the company shows ranks); nothing of Vendor B.", role="Vendor A", portal="Vendor portal", priority="High")

# ═══════════════════════════ 23. Awarding ══════════════════════════════════════════════
M23 = "23. Awarding — complete, partial, line-wise, approval"
EVENTS = {
    "E1": ("the closed RFQ with only Vendor A (100), 10 units", "one bid"),
    "E2": ("the closed RFQ (A 100, B 90), 10 units", "two bids"),
    "E3": ("a closed RFQ with line 1 (10 units: A 100, B 90) and line 2 (5 units: A 50, B 60)", "two bids on two lines"),
    "E4": ("a closed RFQ with A 100, B 90, C 95, 10 units", "three bids"),
}
AWARDS = [
    ("E1", "all 10 units to Vendor A", "Vendor A 10 × 100 = 1,000", ["Vendor A"]),
    ("E2", "all 10 units to the L1 vendor (B)", "Vendor B 10 × 90 = 900", ["Vendor B"]),
    ("E2", "all 10 units to Vendor A (not the lowest)", "Vendor A 10 × 100 = 1,000 (record whether a reason is asked for skipping L1)", ["Vendor A"]),
    ("E2", "a split: 6 units to B and 4 units to A", "Vendor B 6 × 90 = 540 and Vendor A 4 × 100 = 400, total 940", ["Vendor A", "Vendor B"]),
    ("E2", "only 6 of the 10 units to B (partial award)", "Vendor B 6 × 90 = 540; 4 units stay un-awarded", ["Vendor B"]),
    ("E3", "line-wise: line 1 to B, line 2 to A", "Vendor B 10 × 90 = 900 and Vendor A 5 × 50 = 250, total 1,150", ["Vendor A", "Vendor B"]),
    ("E3", "both lines to B", "Vendor B 900 + 5 × 60 = 300, total 1,200", ["Vendor B"]),
    ("E4", "a three-way split 4 / 3 / 3 to B, C and A", "B 4 × 90 = 360, C 3 × 95 = 285, A 3 × 100 = 300, total 945", ["Vendor A", "Vendor B", "Vendor C"]),
]
APPROVAL = [
    ("no approval flow", None, "The award is final at once: the awarded bids are selected, one PO per awarded vendor is created, and the event moves to History.", "Positive"),
    ("approver approves with a remark", "Log in as the approver, open the proposal from Approvals, type the remark \"OK — QA\" and approve",
     "The proposal shows approval in progress until approved; after approval the awarded bids are selected, one PO per awarded vendor is created and the event moves to History.", "Positive"),
    ("approver approves without a remark", "Log in as the approver, open the proposal, leave the remark empty and approve",
     "Refused: \"Remark is necessary for approval\"; the proposal stays pending.", "Negative"),
    ("approver rejects", "Log in as the approver, open the proposal, reject it with a remark",
     "The proposal is rejected; no PO is created; the buyer can start awarding again from Master QCS.", "Positive"),
]
for ek, how, amounts, vendors in AWARDS:
    ev, bids = EVENTS[ek]
    for ap, astep, aexp, tt in APPROVAL:
        steps = [BUYER_LOGIN, open_event(ev), "Click \"Master QCS\" and then \"Start Awarding\". The awarding page opens with each vendor's lines",
                 f"Allocate {how}: type the quantities against each vendor's line", f"Check \"Awarded Vendors\" reads ({len(vendors)}/{ {'E1': 1, 'E2': 2, 'E3': 2, 'E4': 3}[ek]})",
                 "Click \"Create Proposal\". The proposal page opens (Document, Overview, Allocation Summary, Comparison Sheets, Participants, Order Allocation)",
                 "Fill the required proposal fields and click \"Submit Proposal\""]
        if astep:
            steps.append(astep)
        exp = f"The allocation and proposal show {amounts}. " + aexp
        if tt == "Negative":
            exp = f"The proposal shows {amounts}. " + aexp
        case("SRC-AWD", M23, f"Award — {bids}", f"{cap(bids)}: award {how}; {ap}", steps, exp,
             role="Buyer" + (", Approver" if astep else ""), portal="Buyer portal", ttype=tt,
             priority="Critical" if ek == "E2" and "L1" in how and ap == "no approval flow" else "High")
for title, ev, steps, exp, tt in [
    ("Start Awarding while bidding is on", "the RFQ with two bids (A 100, B 90)", ["Open Master QCS and try \"Start Awarding\""], "Disabled; the backend refuses with \"You are not allowed to award in bidding time\".", "Negative"),
    ("Award more than the line's quantity", "the closed RFQ (A 100, B 90), 10 units", ["Start Awarding, allocate 6 to B and 5 to A, Create Proposal"], "Refused: the awarded quantity is more than the line (\"You cannot select bid with more than requested quantity.\" / \"…final quantity exceeds the original quantity\").", "Negative"),
    ("Create Proposal with nothing allocated", "the closed RFQ (A 100, B 90)", ["Start Awarding, allocate nothing, click Create Proposal"], "Refused: \"Please award for at least one Vendor\".", "Negative"),
    ("Award a vendor who did not bid", "the closed RFQ (A 100, B 90) where Vendor C was invited but did not bid", ["Start Awarding and look for Vendor C"], "Vendor C has no lines to allocate (\"Bid not present on this line item\" if forced).", "Negative"),
    ("Award an unverified vendor", "a closed RFQ where Vendor C (not verified) bid lowest", ["Allocate to Vendor C and create the proposal"], "Refused: \"You cannot select bid for an unverified vendor.\"", "Negative"),
    ("Award a blacklisted vendor", "a closed RFQ where Vendor B is blacklisted", ["Allocate to Vendor B"], "Refused: \"Can't select bid of a blacklisted vendor\".", "Negative"),
    ("Vendor codes missing", "a company that needs vendor codes on award", ["Allocate to Vendor B without a vendor code"], "Refused: \"Please enter vendor codes for all products\".", "Negative"),
    ("Award with Excel upload, no file", "the closed RFQ (A 100, B 90)", ["Choose award with Excel and submit without a file"], "Refused: \"Please upload a file before submitting\".", "Negative"),
    ("Award with Excel upload, valid file", "the closed RFQ (A 100, B 90)", ["Download the award sheet, fill 10 to B, upload it, submit"], "The proposal is created with B 10 × 90 = 900.", "Positive"),
    ("Approvals expire", "a proposal waiting for approval longer than the approval window", ["Approver opens it after it expired"], "The approval cannot be completed; record the message and whether the buyer must resubmit.", "Edge"),
    ("Approver missing", "a company whose approval flow needs approvers", ["Submit the proposal without choosing an approver"], "Refused: \"Please select at least one approver to proceed.\"", "Negative"),
    ("Awarding page full screen and hidden fields", "the closed RFQ (A 100, B 90)", ["On the awarding page click \"Fullscreen\" and \"8 hidden fields\""], "Full screen shows the grid only; the hidden-fields button lists the hidden columns and shows them when ticked.", "Positive"),
    ("Show awarded bids on the proposal", "a submitted proposal", ["On the proposal page tick \"Show awarded bids\""], "Only the awarded vendors' lines are listed with their quantities and amounts.", "Positive"),
]:
    case("SRC-AWD", M23, "Award — rules", title, [BUYER_LOGIN, open_event(ev)] + steps, exp, ttype=tt, priority="High")
case("SRC-AWD", M23, "Vendor side", "What winning and losing vendors see after the award",
     [vendor_login(VB), "Open the awarded event", vendor_login(VA), "Open the same event"],
     "Vendor B sees it is awarded with its quantity and amount (and the PO when created). Vendor A sees it was not awarded. Neither sees the other's price.",
     role="Vendor A, Vendor B", portal="Vendor portal", pre="Award done: all 10 to Vendor B, PO created.", priority="High")

# ═══════════════════════════ 24. PO and History ════════════════════════════════════════
M24 = "24. After the award — PO, History, PR"
for title, steps, exp in [
    ("One PO per awarded vendor", ["Award the split 6 to B / 4 to A and approve", "From the left menu open Purchase Orders and search the event's RFX number"], "Two POs: Vendor B (6 × 90) and Vendor A (4 × 100), each with the event's reference."),
    ("PO lines equal the award", ["Open Vendor B's PO"], "Item, quantity, unit, price, delivery location and T&C equal the award and the event."),
    ("The event moves to History", [OPEN_EVENTS, "Search the event on Live and on History"], "Not on Live; on History with the awarded status and a link to its PO(s)."),
    ("The PR line shows the order", [OPEN_PR_LIST, "Search the PR used in the event"], "The line's ordered quantity equals the awarded quantity; it is Completed when fully ordered."),
    ("The asset account assignment reaches the PO", ["Award an event made from an asset PR line", "Open the PO"], "The PO line keeps Account Assignment A and the asset number from the PR."),
    ("Withdraw and Recreate after the PO", [OPEN_SETTINGS], "Withdraw is not offered; Recreate Order (if not a PR event) creates a new event without touching the PO."),
]:
    case("SRC-PO", M24, "After the award", title, [BUYER_LOGIN] + steps, exp, pre="Set-up case SRC-SET-011 or the award case named in the steps.", priority="High")
