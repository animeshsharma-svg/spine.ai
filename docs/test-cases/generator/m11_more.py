from common import *

# ── 23. reports after each award type ──────────────────────────────────────────────
M23 = "23. Awarding — complete, partial, line-wise, approval"
for how, amounts in [
    ("all 10 units to the L1 vendor (B)", "Vendor B 10 × 90 = 900"),
    ("a split 6 to B and 4 to A", "B 540 and A 400, total 940"),
    ("only 6 of 10 units to B", "B 540; 4 units shown as not awarded"),
    ("line-wise: line 1 to B, line 2 to A", "B 900 and A 250, total 1,150"),
    ("a three-way split 4/3/3 to B, C, A", "B 360, C 285, A 300, total 945"),
]:
    case("SRC-RPT", M23, "Reports after the award", f"Master QCS report after awarding {how}",
         [BUYER_LOGIN, open_event("the event awarded as described"), "Master QCS > Download Report and open the file"],
         f"The report shows the awarded vendor(s), awarded quantities and amounts — {amounts} — next to every vendor's bid, and the totals equal the proposal.", priority="High")
    case("SRC-RPT", M23, "Reports after the award", f"Proposal Allocation Summary after awarding {how}",
         [BUYER_LOGIN, open_event("the event awarded as described"), "Open the proposal > Allocation Summary"],
         f"Allocation Summary lists each vendor with \"Total Items selected\" and \"Total Amount\": {amounts}. It matches the downloaded report and the POs.", priority="High")

# ── 21. select quote directly, buyer edit bid ───────────────────────────────────────
M21 = "21. Counter offer — only on a vendor's own (normal) bid"
M15 = "15. Reject Bid (reject quote) and the Rejected Bids list"
for title, ev, steps, exp, tt in [
    ("Select Quote on an RFQ during evaluation", "the RFQ in evaluation (A 100, B 90)", ["Open Responses", "Click \"Select Quote\" on Vendor B, set quantity 10, add counter offer remarks if asked, confirm"], "Vendor B's quote is selected for 10 units; it goes into the award / approval path like Start Awarding.", "Positive"),
    ("Select Bid on an auction", "a finished reverse auction in evaluation", ["Click \"Select Bid\" on the L1 vendor, confirm"], "The auction bid is selected; the button reads \"Select Bid\" on auctions and \"Select Quote\" on RFQs.", "Positive"),
    ("Select with more than the requested quantity", "the RFQ in evaluation (A 100, B 90)", ["Select Quote on Vendor B with quantity 12"], "Refused: \"You cannot select bid with more than requested quantity.\"", "Negative"),
    ("Select without vendor codes", "the RFQ in evaluation on a company needing vendor codes", ["Select Quote on Vendor B without a vendor code"], "Refused: \"Please enter vendor codes for all products\".", "Negative"),
    ("No selection while bidding is live", "the RFQ with two bids (A 100, B 90)", ["Look for Select Quote"], "Not available while live (\"Unable to close the order at this time. Please wait for the bidding to end\" if forced).", "Negative"),
    ("Buyer edits a vendor's bid during evaluation", "the RFQ in evaluation on a company that lets buyers edit bids", ["Click \"Edit Bid\" on Vendor A, change 100 to 98 with a reason, save"], "Vendor A's bid shows 98 as edited by the buyer; Order Activity records who changed it; the vendor sees the edit.", "Positive"),
    ("Edit Bid is not offered while live", "the RFQ with two bids (A 100, B 90)", ["Look for Edit Bid"], "Edit Bid appears only in the evaluation window, never while bidding is live.", "Negative"),
]:
    case("SRC-SEL", "15A. Select Quote / Select Bid and the buyer's Edit Bid", "Select and edit bids", title, [BUYER_LOGIN, open_event(ev)] + steps, exp, ttype=tt, priority="High")

# ── 11. more settings items ─────────────────────────────────────────────────────────
M11 = "11. Settings (gear) menu — what is offered on each state"
for title, ev, steps, exp, tt in [
    ("Unlock Bids after evaluation", "an RFQ with bids locked by default, in evaluation, technical evaluation done", [OPEN_SETTINGS, "Click \"Unlock Bids\""], "Prices become visible in Responses and Master QCS; Download Report works.", "Positive"),
    ("Unlock Bids is not shown when bids are not locked", "the RFQ in evaluation (A 100, B 90)", [OPEN_SETTINGS], "No \"Unlock Bids\" item.", "Negative"),
    ("Request for Re-evaluation", "a Tech+RFQ project after technical scoring", [OPEN_SETTINGS, "Click \"Request for Re-evaluation\", pick the lines, send"], "The re-evaluation request is sent; asking again shows \"Reevaluation already Requested\"; sending with no lines gives \"Select correct line items for reevaluation\".", "Positive"),
    ("Force end a live stage", "the live RFQ (no bids) on a company that allows force end", [OPEN_SETTINGS, "Click \"End Live\" and confirm"], "Bidding ends at once; vendors can no longer bid; the evaluation window (if any) starts.", "Positive"),
    ("Shared With", "the live RFQ (no bids) on a company that shows the participant list", [OPEN_SETTINGS, "Click \"Shared With\""], "The list of vendors the event is shared with opens; hidden when vendor masking is on or the event is not live.", "Positive"),
    ("Show bidding currencies", "a multi-currency event with bids", [OPEN_SETTINGS, "Click \"Show Bidding Currencies\", then \"Show Default Currencies\""], "Prices switch to each vendor's own currency and back to the base currency.", "Positive"),
]:
    case("SRC-MNU", M11, "More settings items", title, [BUYER_LOGIN, open_event(ev)] + steps, exp, ttype=tt, priority="Medium")

# ── 10A. withdraw on eRFX projects ─────────────────────────────────────────────────
M10W = "10A. Withdraw — when it is allowed and what it does"
for state, ev in [("upcoming", "an upcoming eRFX Tech+RFQ project"), ("with the technical stage live", "the Tech+RFQ project during its technical stage"), ("with the RFQ stage live and bids in", "the Tech+RFQ project during its RFQ stage with bids")]:
    case("SRC-WDR", M10W, "Withdraw — eRFX project", f"Withdraw an eRFX project {state}",
         [BUYER_LOGIN, open_event(ev), OPEN_DOTS, "Click \"Withdraw Project\", type a reason, confirm"],
         "\"Order withdrawn\"; every stage of the project shows withdrawn; the project moves to History; vendors see it withdrawn on both stages.", priority="High")

# ── 27. savings options ────────────────────────────────────────────────────────────
M27 = "27. Bid currencies and savings"
for title, steps, exp, tt in [
    ("Savings against last purchase price", ["Savings > choose Last Purchase Price for the product, save, publish", "After bids and the close open Master QCS"], "Savings are calculated against the last purchase price shown in Price Trends.", "Positive"),
    ("The same savings strategy twice", ["Savings > add the Budget strategy twice"], "Refused: \"Savings Strategy Already Present!\"", "Negative"),
    ("Savings in a second currency", ["On a multi-currency event, Savings > Budget, leave the USD price empty"], "Refused: \"Please enter price in USD\".", "Negative"),
]:
    case("SRC-CUR", M27, "Currencies and savings", title, [BUYER_LOGIN] + single_stage_rfq() + steps, exp, ttype=tt, priority="Medium")

# ── 2. recurring and list behaviour ────────────────────────────────────────────────
M2 = "2. Events list — finding the right existing event"
for title, steps, exp in [
    ("Recurring tab", ["Click \"Recurring\""], "Recurring events are listed with their repeat pattern and next run; opening one shows its schedule."),
    ("Paging through a long list", ["On Live, go to page 2 and back"], "Page 2 shows the next events; page 1 shows the same events as before; counts stay the same."),
    ("Export only the filtered History", ["On History filter a date range, click Export"], "The file has only the filtered events."),
]:
    case("SRC-EVL", M2, "Events list", title, [BUYER_LOGIN, OPEN_EVENTS] + steps, exp, priority="Low")

# ── 1. PR detail page ─────────────────────────────────────────────────────────────
M1 = "1. Purchase Requisition (PR) — finding, reading and choosing a PR"
for title, steps, exp, tt in [
    ("Open a PR's detail page", ["Click a PR number"], "The PR detail page lists every line with its type, quantities (Requested, Open, In Progress, Ordered), unit, plant, and the PR's header (requester, dates, status).", "Positive"),
    ("Reorder from a PR line", ["Open a completed PR line and choose Reorder"], "A reorder starts with the same item; with no line ticked: \"Please select at least one item to reorder\".", "Positive"),
    ("Purchase Contract for a material line with a contract", ["Tick a material line that has a valid contract", "Purchase Items > Purchase Contract", "Enter quantity and pick the contract, submit"], "The contract order is created; without quantity/contract: \"Please enter quantity and select a contract for all line items.\"", "Positive"),
    ("Purchase Contract quantity above the PR's open quantity", ["Purchase Contract with quantity more than open"], "Refused: \"Contracted quantity cannot exceed PR open quantity\".", "Negative"),
]:
    case("SRC-PR", M1, "PR detail and other paths", title, [BUYER_LOGIN, OPEN_PR_LIST] + steps, exp, ttype=tt, priority="Medium")

# ── 18. approval on auction price changes ──────────────────────────────────────────
M18 = "18. Vendor portal — revising a bid (increase / decrease)"
case("SRC-REV", M18, "Revise — rules", "Reverse auction where every price drop needs approval",
     [vendor_login(VA), "Open the live reverse auction (company with price-decrease approval)", "Lower 100 → 90", BUYER_LOGIN, "Open Responses; approve with a remark"],
     "90 is pending until the buyer approves; then it becomes Vendor A's bid and the ranks update.", role="Vendor A, Buyer", portal="Buyer + Vendor portal", priority="Medium")
case("SRC-REV", M18, "Revise — rules", "Vendor sees its rank in an RFQ only where the company shows ranks",
     [vendor_login(VA), "Open the RFQ with two bids"], "Where ranks are shown for RFQs Vendor A sees \"Rank 2\"; otherwise no rank is shown. Never Vendor B's price.", role="Vendor A", portal="Vendor portal", priority="Low")
