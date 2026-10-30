from common import *
import m02_create  # noqa: F401  (module order)

# ═══════════════════════════ 1. PR — more ways to read and pick a PR ═══════════════════
M1 = "1. Purchase Requisition (PR) — finding, reading and choosing a PR"
pr = lambda *s: [BUYER_LOGIN, OPEN_PR_LIST, *s]
for title, steps, exp, tt in [
    ("Recognise a BOQ-based PR", ["Find a line whose Item Type is BOQ", "Open it"], "A BOQ PR carries a bill of quantities (sections and items). It can only be purchased alone (one BOQ PR at a time) and opens a BOQ project.", "Positive"),
    ("Recognise a stock material vs a cost-centre material", ["Show the Account Assignment Category column", "Compare two material lines"], "Stock material: category empty. Cost-centre material: category K with a cost centre. Both make a goods sheet; the PO carries the category.", "Positive"),
    ("Read a PR's history", ["Open a PR that was sourced once", "Open its history / activity"], "Every step is listed: created, approved, assigned, sourced in event RFX-xxxx, and (if it happened) withdrawn or ordered.", "Positive"),
    ("A PR line assigned to another buyer", ["Find a line whose assignee is a different buyer", "Tick it and click Purchase Items"], "Record whether you can source a line assigned to someone else; where assignment is enforced the line cannot be purchased by you.", "Edge"),
    ("Put a line on hold and release it", ["Tick an open line and choose Hold, type the remark \"Waiting for spec\"", "Then release it with a remark"], "On hold: the line shows the hold icon and cannot be purchased. Releasing without a remark is refused (\"Please fill the remarks to continue!\"); with a remark the line is open again.", "Positive"),
    ("Request to unlock a dormant PR", ["Tick a dormant-locked line", "Click \"Request to unlock\""], "\"Unlock request sent successfully\"; the line stays locked until approved.", "Positive"),
    ("Select all lines on a page", ["Tick the header checkbox"], "Every line of the page is ticked; Purchase Items checks the mix rules above (a mix of service and material, BOQ, locked or rejected lines blocks it with the matching message).", "Edge"),
    ("Pick the PR given by number when it has several lines", ["Search the PR number", "Tick only the lines the test asks for"], "Only the ticked lines go into the event; the other lines of the same PR stay Open.", "Positive"),
    ("A given PR that is already completed", ["Search a PR number that sits on the Completed tab"], "It cannot be sourced again; pick another PR or report that the given PR is already ordered.", "Negative"),
    ("A given PR whose type does not fit the test", ["The test needs a service PR but the given PR is material"], "Do not force it: note the mismatch and pick an open service PR (see \"Pick a random open service line\").", "Edge"),
    ("Partly used line: source the rest", ["Open a line with Qty Requested 10 and Qty Open 4", "Source 4 in a new event"], "Accepted; after publish Qty Open is 0 and the line shows both events.", "Positive"),
    ("Add to Draft Project then open the draft", ["Tick an open material line", "Purchase Items > Add to Draft Project > pick \"the draft project\"", "Open the draft from Events > Drafts"], "The draft now has the PR line as an extra item with the PR quantity; the PR line shows it is in that project.", "Positive"),
]:
    case("SRC-PR", M1, "More PR checks", title, pr(*steps), exp, ttype=tt, priority="High" if tt == "Negative" else "Medium")

# ═══════════════════════════ 2. Finding a given event ═════════════════════════════════
M2 = "2. Events list — finding the right existing event"
for given, how, exp in [
    ("its title", "Type the title in \"Search Title\"", "The event is found on the tab of its state."),
    ("its RFX number (e.g. RFX-3123)", "Type the RFX number in \"Search Title\" (or open Project Details of candidates and compare the Project ID)", "The event with Project ID #RFX-3123 is found; if search by number is not supported, record it."),
    ("its stage code (e.g. RFQ-2532)", "Search candidates and read \"Stage Code\" under Published Stages", "The event whose Published Stages lists RFQ-2532 is the one."),
    ("the PR number it was made from", "Open the PR, read the event number on its line, then search that event", "The event made from that PR is found through the PR line."),
    ("only the vendor's name", "Open recent live events and check each one's Participants tab", "The events where that vendor is a participant are found; choose the one whose state fits the test."),
]:
    case("SRC-EVL", M2, "Find the event you were given", f"Find an existing event when you are given {given}", [BUYER_LOGIN, OPEN_EVENTS, how], exp, priority="High")
case("SRC-EVL", M2, "Find the event you were given", "The given event does not exist",
     [BUYER_LOGIN, OPEN_EVENTS, "Search the given title / number on Live, History and Drafts"], "Nothing is found on any tab: report that the given event does not exist instead of picking a random one.", ttype="Negative", priority="Medium")
case("SRC-EVL", M2, "Find the event you were given", "The given event is in the wrong state for the test",
     [BUYER_LOGIN, OPEN_EVENTS, "Find the given event, e.g. a live event for an awarding test"], "Do not run the test on it: note that awarding needs bidding to be over and either wait for the close, or pick an event that is in evaluation/closed with bids.", ttype="Edge", priority="Medium")

# ═══════════════════════════ 5. eRFX Items drawer field rules ═════════════════════════
M5 = "5. Create event — eRFX project: stages, items, save as draft"
ex_items = lambda *s: [BUYER_LOGIN, OPEN_EVENTS, CLICK_CREATE, CHOOSE_ERFX, "Make the stages RFQ only and choose the RFQ template", f"Click \"Items 0\" and add {P1}", *s]
for qd, qv, exp, tt in [
    ("blank", "", "Save is refused: \"Please fill valid quantity on every line item\".", "Negative"),
    ("0", "0", "Refused: quantity must be greater than zero.", "Negative"),
    ("-5", "-5", "Refused; the cell turns red.", "Negative"),
    ("letters", "abc", "The cell does not keep letters.", "Negative"),
    ("10", "10", "Kept; Save closes the drawer and the button reads \"Items 1\".", "Positive"),
]:
    case("SRC-ERX", M5, "Items — quantity", f"eRFX Items drawer: quantity {qd}", ex_items(f"Type {qv or 'nothing'} as quantity and pick {LOC1}", "Click Save"), exp, ttype=tt, priority="High")
case("SRC-ERX", M5, "Items — location", "eRFX Items drawer: no delivery location", ex_items("Type 10, leave the location empty", "Click Save"),
     "Refused; the location is required on every line.", ttype="Negative")

# ═══════════════════════════ 7. Schedule on eRFX auction ═══════════════════════════════
M7 = "7. Schedule — start, end and evaluation time"
for dur in ["15 Mins", "30 Mins", "60 Mins", "4 Hrs"]:
    case("SRC-SCH", M7, "eRFX auction schedule", f"eRFX Auction stage with Duration {dur}",
         [BUYER_LOGIN, OPEN_EVENTS, CLICK_CREATE, CHOOSE_ERFX, "Title, keep the Auction stage, choose an auction template, add 1 item", invite_named(VA, VB), f"Open the schedule drawer, Duration {dur}, Save Schedule", PUBLISH],
         f"The auction stage ends {dur} after it starts (check Bidding Ends At on Project Details).", priority="Medium")

# ═══════════════════════════ 12. Recreate — required columns ══════════════════════════
M12 = "12. Recreate Order"
rc = lambda *s: [BUYER_LOGIN, open_event("the closed RFQ (A 100, B 90)"), OPEN_SETTINGS, "Click \"Recreate Order\"", *s]
for col in ["Product", "Product Variant", "Delivery location", "Price"]:
    case("SRC-RCO", M12, "Recreate — required columns", f"Recreate Order with \"{col}\" cleared (a required * column)",
         rc(f"Clear the \"{col}\" cell of the row", "Click Create Order"),
         f"Refused (\"Please fill valid event details to proceed\"); the empty {col} cell is highlighted; no event is created.", ttype="Negative", priority="Medium")
case("SRC-RCO", M12, "Recreate — required columns", "Recreate Order with a different delivery location",
     rc(f"Change Delivery location to {LOC2}", "Create Order"), f"The new event delivers to {LOC2}; the old one is unchanged.", priority="Medium")

# ═══════════════════════════ 17. Vendor — technical response and custom columns ═══════
M17 = "17. Vendor portal — opening the event and submitting a bid"
for title, steps, exp, tt in [
    ("Answer every technical question and submit", ["Open the Technical stage", "Answer every question, attach the spec sheet where asked", "Submit"], "Accepted; the buyer sees the answers on the Technical stage's Responses.", "Positive"),
    ("Leave a required technical question empty", ["Answer all but one required question", "Submit"], "Refused: \"This is a required field.\" on the empty answer.", "Negative"),
    ("Edit the technical response before the stage ends", ["Change one answer", "Submit again"], "The new answer replaces the old; the buyer sees the latest.", "Positive"),
    ("Technical response after the technical stage ended", ["Wait until the Technical stage ends", "Try to change an answer"], "Read-only; nothing can be changed.", "Negative"),
    ("RFQ stage before the technical response", ["Try to quote on the RFQ stage without having answered the Technical stage"], "Record what happens: the commercial stage may be locked until the technical response is in.", "Edge"),
]:
    case("SRC-BID", M17, "Technical response", f"Tech+RFQ: {title}", [vendor_login(VA), "Open the Tech+RFQ project"] + steps, exp, role="Vendor A", portal="Vendor portal", ttype=tt, priority="High")
for col, bad, exp in [
    ("a required text column \"Brand\"", "leave it empty", "Refused: \"This is required field\" on the Brand cell."),
    ("a number column \"Lead time (days)\"", "type \"two\"", "The cell does not keep letters."),
    ("a date column \"Delivery by\"", "pick a date in the past", "Record whether past dates are refused; the date shown to the buyer must equal the date picked."),
    ("a dropdown column \"Make\"", "leave it unselected when it is required", "Refused until an option is chosen."),
]:
    case("SRC-BID", M17, "Buyer-added columns", f"Vendor fills {col}: {bad}", [vendor_login(VA), "Open a live RFQ whose template has " + col, f"Quote 100 and {bad}", "Submit"], exp,
         role="Vendor A", portal="Vendor portal", ttype="Negative", priority="Medium")
for kind, ev, exp in [("reverse auction", "the live reverse auction", "Refused: \"Bid Quantity should be equal to the Auction Quantity\" — an auction bid must cover the full quantity."),
                      ("forward auction", "the live forward auction", "Refused: \"Offer Quantity should be equal to the Auction Quantity\".")]:
    case("SRC-BID", M17, "Auction quantity", f"{cap(kind)}: bid for less than the auction quantity",
         [vendor_login(VA), f"Open {ev}", "Quote a price for 6 of the 10 units", "Submit"], exp, role="Vendor A", portal="Vendor portal", ttype="Negative", priority="High")

# ═══════════════════════════ 18. Revisions on two lines ═══════════════════════════════
M18 = "18. Vendor portal — revising a bid (increase / decrease)"
for kind, ev, change, exp, tt in [
    ("RFQ", "a live RFQ with two lines where Vendor A quoted 100 and 50", "lower line 1 to 90 and keep line 2 at 50", "Accepted as one new revision: line 1 90, line 2 50; the total drops by 100.", "Positive"),
    ("RFQ", "a live RFQ with two lines where Vendor A quoted 100 and 50", "lower both lines (90 and 45)", "Accepted; both lines change in one revision.", "Positive"),
    ("RFQ", "a live RFQ with two lines where Vendor A quoted 100 and 50", "lower line 1 and raise line 2 (90 and 55)", "Accepted where RFQ allows increases; refused for the raised line (\"You cannot increase the price\") where increases are blocked.", "Edge"),
    ("reverse auction", "a live two-line reverse auction where Vendor A bid 100 and 50", "lower line 1 to 90 and raise line 2 to 55", "Refused for line 2: \"You cannot increase the price\"; nothing is saved until every changed line goes down.", "Negative"),
    ("reverse auction", "a live two-line reverse auction where Vendor A bid 100 and 50", "lower only line 2 to 45", "Accepted; only line 2 changes and its rank updates.", "Positive"),
    ("forward auction", "a live two-line forward auction where Vendor A bid 100 and 50", "raise line 1 to 110 and lower line 2 to 45", "Refused for line 2: \"You cannot decrease the price\".", "Negative"),
]:
    case("SRC-REV", M18, f"Revise two lines — {kind}", f"{cap(kind)}: {change}", [vendor_login(VA), f"Open {ev}", "Click revise/edit", change[0].upper() + change[1:], "Submit"], exp,
         role="Vendor A", portal="Vendor portal", ttype=tt, priority="High")

# ═══════════════════════════ 21. Counter offer on two lines ═══════════════════════════
M21 = "21. Counter offer — only on a vendor's own (normal) bid"
for timing, ev in [("while bidding is live", "a live RFQ with two lines where Vendor A quoted 100 and 50"), ("during evaluation time", "an RFQ in evaluation with two lines where Vendor A quoted 100 and 50")]:
    for lines, change in [("one of the two lines", "tick line 1 only and change 100 to 90"), ("both lines", "tick both lines, change 100 to 90 and 50 to 45")]:
        for resp, rexp in [("accepts", "the countered price(s) become Vendor A's price; untouched lines keep their quote"),
                           ("rejects", "every line keeps Vendor A's quote"),
                           ("does not answer", "the offer stays pending and Vendor A cannot revise any line meanwhile")]:
            case("SRC-NEG", M21, f"Two lines — {timing}", f"Counter offer {timing} on {lines}; the vendor {resp}",
                 [BUYER_LOGIN, open_event(ev), "Open Responses, click \"Counter Offer\" on Vendor A", change[0].upper() + change[1:], "Send Counter Offer", vendor_login(VA), f"Open the counter offer; the vendor {resp}", BUYER_LOGIN, "Open Responses and Master QCS"],
                 f"Only the countered line(s) show the offer. After the vendor {resp}: {rexp}. Master QCS totals follow the current prices.",
                 role="Buyer, Vendor A", portal="Buyer + Vendor portal", priority="High")

# ═══════════════════════════ 31. Auction strategies ═══════════════════════════════════
M31 = "31. Auction strategies — what vendors see and how the auction behaves"
STRAT = [
    ("rank-based", "Vendor A bids 100, then Vendor B bids 95", "Vendor A sees \"Rank 2\" (not B's price); Vendor B sees \"Rank 1\". The buyer sees both prices and ranks live."),
    ("price-based (best price visible)", "Vendor A bids 100, then Vendor B bids 95", "Both vendors see the best price 95 but not who placed it. Vendor A's next bid must be a valid tick below its own (and below 95 where vendors must beat the best price)."),
    ("traffic light", "Vendor A bids 100, Vendor B 95, Vendor C 120", "Each vendor sees its zone colour instead of a rank (e.g. green for the best zone, red for the worst); zones that the buyer allowed in \"Which traffic light zones can see Best Prices?\" / \"…can see Rank?\" also see the best price / rank."),
    ("sealed bid", "Vendor A bids 100, Vendor B 95", "No vendor sees ranks, zones or best prices until the end; the buyer sees all bids."),
    ("dynamic time extension (trigger 2 min, extend by 2 min)", "Vendor B bids 95 one minute before the end", "The end time moves 2 minutes later for everyone; the participants panel counts \"Dynamic time extended\"; Order Activity logs it."),
    ("Dutch (price falls step by step)", "Wait for the price to drop to 90 and let Vendor A accept", "The first vendor to accept wins the lot at the price shown when it accepted; later accepts are refused."),
    ("English (rising, with ceiling price)", "Vendor A bids 100, then Vendor B bids 105", "Prices may only go up by at least one tick; a bid above the ceiling price is refused."),
    ("knockout (rounds)", "Run round 1; the worst vendor is knocked out", "Only the qualified vendors can bid in the next round; the knocked-out vendor sees it is out."),
]
for strat, action, exp in STRAT:
    case("SRC-STR", M31, f"Strategy — {strat}", f"{cap(strat)} auction: what each side sees during bidding",
         [BUYER_LOGIN] + single_stage_auction("forward" if "English" in strat else "reverse") + [f"Choose the {strat} strategy in the auction configuration", invite_named(VA, VB, VC), SCHEDULE_30, PUBLISH, action, "Look at Vendor A's and Vendor B's screens and at the buyer's Responses"],
         exp, role="Buyer, Vendors A, B, C", portal="Buyer + Vendor portal", priority="High")
    case("SRC-STR", M31, f"Strategy — {strat}", f"{cap(strat)} auction: the result after it ends",
         [BUYER_LOGIN, open_event(f"the finished {strat} auction"), "Open Master QCS and Download Report"],
         "Master QCS ranks the final bids correctly for this strategy (lowest wins in a reverse auction, highest in a forward/English auction, the accepting vendor in a Dutch auction); the report matches the screen.", priority="Medium")
for title, steps, exp, tt in [
    ("Trigger sealed bid mode on a live auction", [OPEN_SETTINGS + " (or the notice \"Want to stop dynamic time extension?\")", "Click \"Trigger Sealed Bid Mode\", choose how long to extend for sealed bids, confirm"],
     "Dynamic time extension stops; ranks, zones and best prices are hidden from vendors; the event is extended by the chosen time (\"Sealed Bid time extended!\").", "Positive"),
    ("Edit the traffic light configuration on a live traffic light event", ["Try to change the zones"], "Not allowed: \"You cannot edit the config in traffic event\".", "Negative"),
    ("Request Best Offers after bidding ends", ["On a closed RFQ with bids (evaluation / response review) click Settings > \"Request Best Offers\", set the window, send"], "Each bidder is asked for a best and final offer; the status shows \"Best Offer Requested\"; later \"Edit Best Offer Request\" is offered.", "Positive"),
    ("Request Best Offers while bidding is live", [OPEN_SETTINGS], "\"Request Best Offers\" is not offered while live (only after bidding, with bids).", "Negative"),
    ("Vendor answers a best offer request", [vendor_login(VA), "Open the event, enter the final price 92, submit"], "The buyer sees 92 as Vendor A's best offer in the comparison.", "Positive"),
    ("Select rank one products only", ["On the select bid pop-up click \"Select Rank One Products Only\""], "Only the lines where each vendor is rank 1 are selected.", "Positive"),
]:
    case("SRC-STR", M31, "Strategy actions", title, [BUYER_LOGIN, open_event("the live reverse auction")] + steps, exp, ttype=tt, priority="High" if tt == "Negative" else "Medium")

# ═══════════════════════════ 32. Stage page tabs ══════════════════════════════════════
M32 = "32. Stage page — Responses, Overview, Participants, Analytics, Messages"
stg = lambda *s: [BUYER_LOGIN, open_event("the RFQ with two bids (A 100, B 90)"), "Open the RFQ stage", *s]
for title, steps, exp in [
    ("Responses — view by vendor and by product", ["Open Responses", "Switch \"View by Product\" on and off"], "By vendor: one block per vendor with its lines. By product: one block per product with every vendor's price side by side."),
    ("Responses — vertical and horizontal layout", ["Click the vertical and horizontal switch icons"], "The same bids are shown in the other layout; nothing is lost."),
    ("Responses — hide fields", ["Click \"Hide fields\" and hide GST"], "GST disappears from the grid until shown again."),
    ("Responses — bid revisions", ["Use the arrows on Vendor A's bid to step through revisions"], "Each revision's price and time are shown; \"Current Bid N\" marks the latest."),
    ("Overview — participation", ["Open Overview"], "Participation 2/2 (100%) and the bidding summary; counts of counter offers, rejected bids and dynamic extensions."),
    ("Participants — actions per vendor", ["Open Participants"], "Each vendor has \"Add Bid\" and \"Add Price Cap\"; \"Add Weight Params\" (or View/Edit Weight Params) is at the top."),
    ("Analytics", ["Open Analytics"], "Charts of bids over time and by vendor; no error with 2 bids."),
    ("Price Trends", ["Open Price Trends"], "The product's past prices and this event's bids are shown; Last Purchase Price is shown where known (e.g. ₹6,680 ▲98.53%)."),
    ("Participant Remarks", ["Open Participant Remarks"], "Remarks the vendors wrote with their bids are listed by vendor."),
    ("Messages — send a message to a vendor", ["Click \"Messages\", choose Vendor A, write \"Please confirm delivery\", send", vendor_login(VA), "Open the event's messages"], "Vendor A sees the message and can reply; the buyer sees the reply in the thread."),
    ("Messages — send an empty reply", ["Open a message thread and send an empty reply"], "Refused: \"Reply can't be empty\"."),
]:
    case("SRC-STG", M32, "Stage tabs", title, stg(*steps), exp, ttype="Negative" if "empty" in title else "Positive", priority="Medium")
for title, steps, exp, tt in [
    ("Add weight parameters", ["Participants > \"Add Weight Params\"", "Add \"Quality\" with weight 60 and \"Delivery\" 40, save"], "Weights are saved; the comparison can rank by weighted score.", "Positive"),
    ("Weight parameter without a name", ["Add Weight Params, leave the name empty"], "Refused: \"Name of weight parameter can't be empty\".", "Negative"),
    ("Duplicate weight names", ["Add \"Quality\" twice"], "Refused: \"Weight name can't be duplicate\".", "Negative"),
    ("Save weights with no value", ["Add a name but no weight value"], "Refused: \"Please add at least one weight value\".", "Negative"),
]:
    case("SRC-STG", M32, "Weight parameters", title, stg(*steps), exp, ttype=tt, priority="Medium")

# ═══════════════════════════ 33. Lots and staggered closing ═══════════════════════════
M33 = "33. Lots and staggered line items"
for title, steps, exp, tt in [
    ("Split line items into lots", ["Open a live RFQ with three lines", OPEN_SETTINGS, "Click \"Split line items into lots\", put lines 1–2 in lot 1 and line 3 in lot 2, save"], "Two lots are created; the comparison shows \"Aggregate Lot Wise\" totals.", "Positive"),
    ("Split with everything in one lot", ["Put all lines in lot 1 and save"], "Refused: \"Please assign line item to at least two lots\".", "Negative"),
    ("Split lots on a closed RFQ", [OPEN_SETTINGS], "\"Split line items into lots\" is greyed out on a closed event.", "Negative"),
    ("Award a lot to one vendor", ["After the close, award lot 1 with \"I'll award the entire lot to single\" vendor"], "All lines of lot 1 go to the chosen vendor.", "Positive"),
    ("Reopen line items on a staggered event", ["On a staggered event where line 1 has expired, Settings > \"Reopen Line Items\", reopen line 1"], "Line 1 is open for bids again until the new time.", "Positive"),
    ("Reopen when no line has expired", ["Hover \"Reopen Line Items\""], "Disabled with \"Line items can only be reopened if at least one line item has expired\".", "Negative"),
    ("Reopen after the submission time is over", ["Try to reopen a line after the whole event's submission time ended"], "Refused: \"You Cannot reopen line item after bid submission time is over\".", "Negative"),
]:
    case("SRC-LOT", M33, "Lots and staggered", title, [BUYER_LOGIN] + steps, exp, ttype=tt, priority="Medium")

# ═══════════════════════════ 34. The same actions on auction and eRFX events ══════════
M34 = "34. Same actions on auction and eRFX events"
KIND_EV = {
    "single stage reverse auction": "the live reverse auction",
    "eRFX RFQ project": "an eRFX RFQ-only project",
    "eRFX Technical + RFQ project (RFQ stage)": "the Tech+RFQ project",
    "eRFX Auction project": "an eRFX Auction-only project",
}
ACTIONS = [
    ("withdraw it while live with bids", lambda k: [OPEN_DOTS if "eRFX" in k else OPEN_SETTINGS, "Click \"Withdraw Project\"" if "eRFX" in k else "Click \"Withdraw\"", "Type a reason and confirm"],
     lambda k: ("Every stage of the project is withdrawn together and the project moves to History. " if "eRFX" in k else "The auction is withdrawn and moves to History. ")
     + ("On a company that blocks withdrawing a live auction, Withdraw is greyed out (\"Auction cannot be withdrawn when the event is live\")." if "uction" in k else "")),
    ("extend its submission time by 10 minutes", lambda k: [OPEN_SETTINGS, "Extend Submission Time, pick end + 10 minutes, save"],
     lambda k: "The stage's end moves 10 minutes later and vendors can bid until then." + (" Extending the Technical stage beyond the RFQ end is not expected — record what happens if tried." if "Technical" in k else "")),
    ("reject a bid during evaluation", lambda k: ["Wait for evaluation, open Responses, Reject Bid on Vendor A with a reason"],
     lambda k: "Vendor A's bid is rejected and leaves the ranking; Settings > Rejected Bids lists it."),
    ("add a surrogate bid for Vendor A", lambda k: ["Participants > Add Bid next to Vendor A, fill prices and a reference, save"],
     lambda k: "The bid is added and marked surrogate; it is ranked in Master QCS."),
    ("award it after the close", lambda k: ["After the close open Master QCS > Start Awarding, award all to the best vendor, create and submit the proposal"],
     lambda k: "The award goes to the best final bid" + (" (lowest auction bid)" if "uction" in k else "") + (", and only vendors who passed the technical stage can be awarded" if "Technical" in k else "") + "; the event moves to History once the PO is created."),
    ("recreate it after the close", lambda k: [OPEN_SETTINGS, "Recreate Order, keep defaults, Create Order"],
     lambda k: "A new event of the same kind is created with the same products" + (" and auction settings" if "uction" in k else "") + "."),
]
for kind, ev in KIND_EV.items():
    for act, steps_fn, exp_fn in ACTIONS:
        case("SRC-KND", M34, f"On {'an' if kind[0] in 'aeiou' else 'a'} {kind}", f"{cap(kind)}: {act}", [BUYER_LOGIN, open_event(ev)] + steps_fn(kind), exp_fn(kind), priority="High")

# ═══════════════════════════ 23. Awarding — more kinds ════════════════════════════════
M23 = "23. Awarding — complete, partial, line-wise, approval"
for title, ev, steps, exp, tt in [
    ("Award a service activity-wise", "the closed service RFQ with Vendors A and B", ["Start Awarding, give activity 1 to A and activity 2 to B, Create Proposal, Submit"], "Each activity goes to its vendor at that vendor's rate; two POs, one per vendor.", "Positive"),
    ("Auto awarding enabled", "a closed RFQ with auto awarding on", ["Open the stage header"], "The header shows \"Auto Awarding Enabled\" then \"Auto Awarding in progress\" and \"Auto Awarding Completed\" with the result; Extend Submission Time is greyed out once auto awarding has started on a non-live event.", "Positive"),
    ("Stop auto awarding", "a live RFQ with auto awarding enabled", [OPEN_SETTINGS, "Click the stop auto awarding option and confirm"], "The header shows \"Auto Awarding Disabled\"; awarding is manual.", "Positive"),
    ("Auto awarding aborted", "an auto-awarding event where a rule failed", ["Open the stage header and its message"], "\"Auto Awarding Aborted\" with the reason; the buyer awards manually.", "Edge"),
]:
    case("SRC-AWD", M23, "Award — more kinds", title, [BUYER_LOGIN, open_event(ev)] + steps, exp, ttype=tt, priority="Medium")

# ═══════════════════════════ 30. End-to-end — convert and auction paths ═══════════════
M30 = "30. End-to-end — PR to PO, every main combination"
for pt in ["Material", "Asset"]:
    for path in ["RFQ converted to an auction", "eRFX Auction-only project"]:
        for ak in ["complete award to L1", "split award"]:
            steps = [BUYER_LOGIN, OPEN_PR_LIST, f"Tick an open {pt.lower()} PR line (10 units)"]
            if path.startswith("RFQ"):
                steps += ["Purchase Items > Start New Project > Single Stage > RFQ > template", invite_named(VA, VB), SCHEDULE_30, PUBLISH, "Vendors A and B quote 100 and 90; wait for the close",
                          OPEN_SETTINGS, "Convert to Auction with RFQ quotes and participants, publish the auction", "Vendor A bids 85, Vendor B bids 88"]
            else:
                steps += ["Purchase Items > Start New Project > eRFX Project; title; keep Auction; auction template", invite_named(VA, VB), SCHEDULE_30, PUBLISH, "Vendor A bids 100 then 85; Vendor B bids 88"]
            steps += ["After the close: Master QCS > Start Awarding > " + ("all 10 to Vendor A" if ak.startswith("complete") else "6 to A and 4 to B"), "Create and submit the proposal; approve with a remark"]
            amt = "Vendor A 10 × 85 = 850" if ak.startswith("complete") else "Vendor A 6 × 85 = 510 and Vendor B 4 × 88 = 352, total 862"
            case("SRC-E2E", M30, f"{pt} PR → {path}", f"{pt} PR → {path} → {ak} → PO", steps,
                 f"Vendor A is rank 1 at 85. The award gives {amt}. POs are created; the PR line is ordered; the event moves to History." + (" The asset assignment A reaches the PO." if pt == "Asset" else ""),
                 role="Buyer, Vendor A, Vendor B, Approver", portal="Buyer + Vendor portal", priority="Critical")
