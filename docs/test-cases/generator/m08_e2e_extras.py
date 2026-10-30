from common import *

# ═══════════════════════════ 25. Convert to Auction ════════════════════════════════════
M25 = "25. Convert RFQ to Auction"
cv = lambda *s: [BUYER_LOGIN, open_event("the closed RFQ (A 100, B 90)"), OPEN_SETTINGS, "Click \"Convert to Auction\". A small pop-up offers options to reuse the RFQ quotes, participants and weights", *s]
for opts, exp in [
    ("reuse RFQ quotes and participants", "The create screen opens in a new tab as an auction stage of the same project with Vendors A and B, each starting from its RFQ price (B 90, A 100)."),
    ("reuse participants only", "The auction opens with Vendors A and B but without their RFQ prices as starting bids."),
    ("reuse nothing", "The auction opens with the products only; participants must be added."),
]:
    case("SRC-CVT", M25, "Convert options", f"Convert to Auction — {opts}", cv(f"Tick: {opts}", "Click Continue", "Fill the auction configuration and schedule, publish"), exp, priority="High")
for title, steps, exp, tt in [
    ("Starting price below the highest RFQ global charge", ["Continue", "Set a starting price below the largest other-charge of the RFQ bids", "Publish"], "Refused: \"Starting price cannot be less than the maximum global charge of RFQ bids\".", "Negative"),
    ("Starting price above the L1 sum total", ["Continue", "Set a starting price above the lowest RFQ sum total (900)", "Publish"], "Refused: \"Starting price cannot be more than the lowest RFQ (L1) Sum Total\".", "Negative"),
    ("End price above the L1 sum total", ["Continue", "Set an end price above 900", "Publish"], "Refused: \"End price cannot be more than the lowest RFQ (L1) Sum Total\".", "Negative"),
    ("Convert to a serial bidding auction", ["Continue", "Choose a serial bidding auction", "Publish"], "Refused: \"Cannot convert rfq to a serial bidding auction\".", "Negative"),
    ("No event name for the auction", ["Continue", "Clear the event name", "Publish"], "Refused: \"Please add a event name\".", "Negative"),
    ("Invalid schedule for the auction", ["Continue", "Pick a schedule that starts before the RFQ ended", "Publish"], "Refused: \"Please Select a Valid Schedule\".", "Negative"),
    ("Convert on a draft or with vendor masking", ["Open the menu on a draft / masked company"], "\"Convert to Auction\" is not offered on drafts or when vendor masking is on.", "Negative"),
    ("Convert while vendors owe a bid justification", ["On an RFQ where a vendor's bid justification is pending, click Convert to Auction"], "The app first asks for the pending justification instead of opening the convert pop-up.", "Negative"),
    ("Vendors bid in the converted auction", ["Publish the converted auction", vendor_login(VA), "Lower the price from 100 to 85"], "Accepted; the auction ranks update; the RFQ stage stays read-only.", "Positive"),
]:
    case("SRC-CVT", M25, "Convert rules", title, cv(*steps), exp, ttype=tt, priority="High" if tt == "Negative" else "Medium")

# ═══════════════════════════ 26. New version ═══════════════════════════════════════════
M26 = "26. Create New Version of a published project"
nv = lambda ev, *s: [BUYER_LOGIN, open_event(ev), "Click \"Create New Version\" on the project tab bar", *s]
for title, ev, steps, exp, tt in [
    ("Create a new version of a live project", "the live RFQ (no bids)", ["Confirm \"Create a New Version\"", "Change the quantity to 12", "Publish, filling \"Addendum Remarks\""], "A new version opens in edit mode; after publishing it is the latest version, vendors get the addendum, and the old version is read-only with its actions greyed out.", "Positive"),
    ("Publish a version without Addendum Remarks", "the live RFQ (no bids)", ["Confirm", "Publish leaving Addendum Remarks empty"], "Refused until the remarks are filled.", "Negative"),
    ("A version keeps the technical stage evaluator", "the Tech+RFQ project", ["Confirm", "Publish without touching the technical stage"], "Record: in earlier runs the copy lost the evaluator and the questionnaire answers (publish refused \"Please add Evaluator…\"). Re-add them if asked.", "Edge"),
    ("No new version after an award proposal", "an event whose award proposal is submitted", ["Look for Create New Version"], "Not offered (a version must come before the award).", "Negative"),
    ("No new version on a company without versioning", "a live RFQ on a company with versioning off", ["Look for Create New Version"], "Not offered.", "Negative"),
    ("Remove an item in a new version", "the live RFQ with two products", ["Confirm", "Open Items, delete one product, Save, publish with remarks"], "The version has one product; record any error (\"Event group line item does not belong to the specified event group\" was seen before).", "Edge"),
]:
    case("SRC-VER", M26, "Versioning", title, nv(ev, *steps), exp, ttype=tt, priority="High" if tt == "Positive" else "Medium")

# ═══════════════════════════ 27. Multi-currency and savings ════════════════════════════
M27 = "27. Bid currencies and savings"
for title, steps, exp, tt in [
    ("Allow bids in USD and INR", ["On the create screen click \"Add Bid Currencies\", pick USD with exchange rate 83, save", invite_named(VA, VB), SCHEDULE_30, PUBLISH, vendor_login(VA), "Quote 1.2 USD"], "Vendor A can choose USD; the buyer sees 1.2 USD = 99.6 INR in the comparison.", "Positive"),
    ("No currency selected", ["Open \"Add Bid Currencies\", untick all, save"], "Refused: \"Please select atleast one currency.\"", "Negative"),
    ("Exchange rate 0 or negative", ["Add USD with exchange rate -1"], "Refused: \"All exchange rates must be positive numbers\".", "Negative"),
    ("Change the exchange rate after bids", ["On a live multi-currency event with bids, edit the exchange rate"], "Refused: \"Exchange rates cannot be updated after bids have been placed.\"", "Negative"),
    ("Savings against budget", ["Click \"Savings\" in the footer, choose line item / Budget, enter 120 for the product, save, publish", "After bids A 100 and B 90 and the close, open Master QCS"], "Savings shown: (120 − 90) × 10 = 300 (25 %).", "Positive"),
    ("Savings budget left empty", ["Open Savings, choose Budget, leave the price empty, save"], "Refused: \"Please enter price in INR\" (the currency is named).", "Negative"),
]:
    case("SRC-CUR", M27, "Currencies and savings", title, [BUYER_LOGIN] + single_stage_rfq() + steps, exp, ttype=tt, priority="High" if tt == "Negative" else "Medium")

# ═══════════════════════════ 28. Vendor view by state ══════════════════════════════════
M28 = "28. Vendor portal — what the vendor sees in each state"
for state, ev, exp in [
    ("invited, event upcoming", "the upcoming RFQ", "Listed with its start time; read-only until it starts."),
    ("live, not yet bid", "the live RFQ (no bids)", "Editable price sheet, T&C, countdown, Submit."),
    ("live, already bid", "the RFQ with two bids", "Its current bid and revision count; a revise/edit button; its rank if shown by the company."),
    ("counter offer pending", "an RFQ where the buyer sent Vendor A a counter offer", "The offer with Accept / Reject; price editing locked until answered."),
    ("bid rejected (re-bid allowed)", "an RFQ where Vendor A was rejected with re-bid allowed", "Rejected with the reason; it can bid again when the buyer reopens bidding."),
    ("bid rejected (blocked)", "an RFQ where Vendor A was rejected and blocked", "Rejected with the reason; no way to bid again."),
    ("event in evaluation", "the RFQ in evaluation", "Read-only bid; waiting for the buyer's decision; counter offers can still arrive."),
    ("event withdrawn", "the withdrawn event", "Withdrawn; read-only."),
    ("awarded to this vendor", "the awarded event with PO (as Vendor B)", "Awarded with quantity and amount; PO visible when created."),
    ("not awarded", "the awarded event with PO (as Vendor A)", "Not awarded / closed; no other vendor's price shown."),
]:
    case("SRC-VEN", M28, "Vendor states", f"Vendor view when {state}", [vendor_login(VA if "Vendor B" not in ev else VB), f"Open {ev}"], f"The vendor sees: {exp}",
         role="Vendor", portal="Vendor portal", priority="High")

# ═══════════════════════════ 29. Permissions ═══════════════════════════════════════════
M29 = "29. Permissions — who can do what"
for who, action, exp in [
    ("a buyer without the event \"update\" right (increase time, withdraw)", "Settings on a live event", "Extend Submission Time and Withdraw are not offered."),
    ("a view-only dashboard user", "Settings on a live event", "Reschedule, Withdraw, Bulk Counter Offer and Unlock Bids are disabled."),
    ("a buyer of another entity", "search the event's RFX number", "The event is not visible."),
    ("an evaluator who is not a buyer", "open the Technical stage", "Can score technical responses in the evaluation period; cannot award or withdraw."),
    ("the approver", "open the proposal from Approvals", "Can approve (remark required) or reject; cannot edit the allocation."),
    ("a vendor pasting a buyer's project link", "open /project/<id>", "Access denied / not found; nothing of the buyer side is visible."),
]:
    case("SRC-PRM", M29, "Roles", f"{cap(who)}: {action}", [f"Log in as {who}", action], exp, role=who, ttype="Negative" if "cannot" in exp or "not" in exp else "Positive", priority="High")

# ═══════════════════════════ 30. End-to-end journeys ═══════════════════════════════════
M30 = "30. End-to-end — PR to PO, every main combination"
PRT = {"Material": "an open material PR line (10 ST)", "Service": "an open service PR line with 2 activities", "Asset": "an open asset PR line (Account Assignment A, 10 units)"}
EVK = {
    "single stage RFQ": ["Purchase Items > Start New Project > Single Stage > RFQ > RFQ template"],
    "single stage reverse auction": ["Purchase Items > Start New Project > Single Stage > Auction > reverse template, tick size 1"],
    "eRFX Technical + RFQ": ["Purchase Items > Start New Project > eRFX Project; title; Technical + RFQ; templates; Vendor Assessment; evaluator"],
}
AWK = {
    "complete award to L1": ("Award all to the lowest vendor (B)", "Vendor B gets the whole quantity at its own price, with one PO"),
    "split award": ("Award 6 to B and 4 to A (for a service: activity 1 to B, activity 2 to A)", "Vendors A and B each get their share at their own price, with one PO per vendor"),
}
for pt, prline in PRT.items():
    for ek, esteps in EVK.items():
        if pt == "Service" and "auction" in ek:
            continue  # service activities are sourced through RFQ/RFP, not a price auction
        for ak, (astep, aexp) in AWK.items():
            steps = [BUYER_LOGIN, OPEN_PR_LIST, f"Tick {prline}", *esteps, INVITE_MAPPED + " (or search Vendors A and B by name if the test names them)",
                     "Schedule: Duration 30 Mins, evaluation 30 Mins; Save Schedule", "Add one Required T&C clause", PUBLISH,
                     vendor_login(VA), "Accept the T&C, quote 100 (per activity for a service), submit" + (" (and answer the technical stage first)" if "Technical" in ek else ""),
                     vendor_login(VB), "Accept the T&C, quote 90, submit",
                     BUYER_LOGIN, "When bidding ends, open Master QCS and check B is rank 1", "Start Awarding: " + astep, "Create Proposal, Submit Proposal; approve it with a remark as the approver",
                     "Open Purchase Orders, the Events History tab and the PR"]
            case("SRC-E2E", M30, f"{pt} PR → {ek}", f"{pt} PR → {ek} → {ak} → PO", steps,
                 f"Every step works in order. The PR line goes Open → In Progress → ordered. The event goes Live → (evaluation) → History. Master QCS ranks B first. Award result: {aexp}. "
                 + ("The asset account assignment A is on the PO. " if pt == "Asset" else "") + ("Each activity keeps its own rate on the PO. " if pt == "Service" else ""),
                 role="Buyer, Vendor A, Vendor B, Approver", portal="Buyer + Vendor portal", pre=PEOPLE_NOTE, priority="Critical")
for ek, esteps in [("single stage RFQ without a PR", single_stage_rfq()), ("eRFX RFQ without a PR", erfx_rfq())]:
    for ak, (astep, aexp) in AWK.items():
        case("SRC-E2E", M30, f"Direct event → {ek}", f"Event made directly ({ek}) → {ak} → PO",
             [BUYER_LOGIN] + esteps + [invite_named(VA, VB), SCHEDULE_30, PUBLISH, vendor_login(VA), "Quote 100", vendor_login(VB), "Quote 90", BUYER_LOGIN, "After the close: Master QCS > Start Awarding > " + astep, "Create and submit the proposal; approve"],
             f"Award result: {aexp}; POs are created; the event moves to History; Recreate Order stays available on it (not a PR event).",
             role="Buyer, Vendor A, Vendor B, Approver", portal="Buyer + Vendor portal", priority="Critical")
