from common import *

# ═══════════════════════════ 17. Vendor — submitting a bid ═════════════════════════════
M17 = "17. Vendor portal — opening the event and submitting a bid"
vb = lambda ev, v=VA, *s: [vendor_login(v), f"Open {ev} from the vendor's event list", *s]
case("SRC-BID", M17, "Vendor view", "The invited vendor opens a live RFQ",
     vb("the live RFQ (no bids)", VA, "Read the page"),
     "The page shows the title, the countdown, the Terms & Conditions block, Quotation Templates with Download, the product sheet with the buyer's product, quantity, unit and delivery location (read-only) and an editable Price column, and the Submit button.",
     role="Vendor A", portal="Vendor portal", priority="Critical")
case("SRC-BID", M17, "Vendor view", "An upcoming event can be seen but not bid on",
     vb("the upcoming RFQ", VA, "Try to type a price and submit"), "The sheet is read-only or Submit is disabled until the start time; the start time is shown.",
     role="Vendor A", portal="Vendor portal", ttype="Negative", priority="High")
case("SRC-BID", M17, "Vendor view", "A closed event cannot be bid on",
     vb("the closed RFQ (A 100, B 90)", VA, "Try to change the price"), "The sheet is read-only and Submit is gone; the status shows closed.",
     role="Vendor A", portal="Vendor portal", ttype="Negative", priority="High")
case("SRC-BID", M17, "Submit", "Submit a complete bid on an RFQ and see it on the buyer side",
     vb("the live RFQ (no bids)", VA, "Type 100 in Price, press Tab: Total Amount shows 1,000 plus GST", "Tick any Required T&C clause", "Click Submit and confirm", BUYER_LOGIN, open_event("the live RFQ (no bids)"), "Open the RFQ stage's Responses tab"),
     "Vendor: a success message, the bid shows as Current Bid 1 with the time, and the button changes to revise/edit. Buyer: Vendor A's bid with 100 per unit and the totals; Participation shows 1/2 (50%); Master QCS shows Vendor A's column.",
     role="Vendor A, Buyer", portal="Buyer + Vendor portal", priority="Critical")
PRICE_RULES = [
    ("Price left empty", "", "Refused: every product must have a price (\"Please quote prices for all the products.\" / \"Please enter a valid price\"); nothing reaches the buyer.", "Negative"),
    ("Price 0", "0", "Refused: \"Please enter a valid price\".", "Negative"),
    ("Price -1", "-1", "Refused: \"Please enter a valid price\".", "Negative"),
    ("Price letters", "abc", "The cell does not keep letters.", "Negative"),
    ("Price 100.55 (decimals)", "100.55", "Accepted with two decimals; totals use 100.55 × quantity.", "Positive"),
]
for title, val, exp, tt in PRICE_RULES:
    case("SRC-BID", M17, "Price rules", f"RFQ bid: {title}", vb("the live RFQ (no bids)", VA, f"Type {val or 'nothing'} in Price", "Click Submit"), exp,
         role="Vendor A", portal="Vendor portal", data=f"Price {val or '(empty)'}", ttype=tt, priority="High")
for title, setup, steps, exp, tt in [
    ("Price above the buyer's price cap", "Price cap 100 on the line", ["Quote 101", "Submit"], "Refused: \"Price cannot be more than the allowed price\" (the cap); quoting 100 is accepted.", "Negative"),
    ("Price equal to the price cap", "Price cap 100", ["Quote 100", "Submit"], "Accepted.", "Positive"),
    ("Quantity below the minimum quantity", "Minimum quantity 5 on the line (vendor quotes a quantity)", ["Quote quantity 4 at 100", "Submit"], "Refused: \"Quantity is less than minimum quantity\" / \"Quantity cannot be less than the allowed quantity\".", "Negative"),
    ("Quantity above the requested quantity", "Requested 10, vendor quotes a quantity", ["Quote quantity 12", "Submit"], "Refused: \"Quantity cannot be greater than the mentioned quantity.\"", "Negative"),
    ("Quote only one of two products", "An RFQ with two products", ["Quote product 1 only", "Submit"], "Refused: \"Please quote prices for all the products.\" (or \"You have to place bid on atleast one product\" where partial quoting is allowed) — record which applies.", "Negative"),
    ("Quote above the budget tolerance", "Line budget 100 with 10% tolerance", ["Quote 120", "Submit"], "Refused: \"Bid price exceeds the budget tolerance limit\".", "Negative"),
    ("Upload an attachment with the bid", "-", ["Attach quote.pdf", "Quote 100 and Submit"], "The buyer can open the same file from Vendor A's bid.", "Positive"),
    ("Save the bid as a draft and submit later", "-", ["Quote 100 and save as draft (do not submit)", "Check the buyer's Responses", "Submit the draft"], "While a draft, the buyer sees nothing; after Submit the bid appears as Current Bid 1.", "Positive"),
    ("Submit after the countdown ends", "Event ends in 1 minute", ["Wait until the countdown reaches zero", "Click Submit"], "Refused; the sheet becomes read-only and the bid is not recorded.", "Negative"),
    ("Double-click Submit", "-", ["Quote 100 and click Submit twice fast"], "Only one bid (Current Bid 1) is recorded.", "Edge"),
    ("Two users of the same vendor company bid", "Vendor A has two users", ["User 1 submits 100", "User 2 opens the event and tries to submit 98"], "The second is refused: \"A bid has already been placed from your team\" — or it becomes a revision of the same company bid; record which.", "Edge"),
    ("A bid on the buyer's own company", "Vendor login of the buyer's own company", ["Try to bid"], "Refused: \"Cannot place bid on trade by your own company\".", "Negative"),
]:
    case("SRC-BID", M17, "Bid rules", f"RFQ bid: {title}", vb("the live RFQ (no bids)", VA, *steps), exp, role="Vendor A", portal="Vendor portal", pre=setup, ttype=tt,
         priority="High" if tt == "Negative" else "Medium")
for title, steps, exp, tt in [
    ("Quote every activity of a service", ["Quote a rate for every activity", "Submit"], "Accepted; the buyer sees each activity's rate and the total = Σ rate × activity quantity.", "Positive"),
    ("Leave one activity without a rate", ["Quote all but one activity", "Submit"], "Refused; the empty activity is highlighted.", "Negative"),
]:
    case("SRC-BID", M17, "Service bid", f"Service RFQ: {title}", vb("the service RFQ", VA, *steps), exp, role="Vendor A", portal="Vendor portal", ttype=tt, priority="High")
for kind, ev, ok, bad in [("reverse auction", "the live reverse auction", "a first price of 100", "a price above the ceiling price"), ("forward auction", "the live forward auction", "a first price of 100", "a price below the floor price")]:
    case("SRC-BID", M17, "Auction first bid", f"{cap(kind)}: first bid", vb(ev, VA, f"Quote {ok}", "Submit"),
         "Accepted; the vendor sees its rank (rank strategy) or the best price (price strategy) update live.", role="Vendor A", portal="Vendor portal", priority="Critical")
    case("SRC-BID", M17, "Auction first bid", f"{cap(kind)}: first bid outside the limit", vb(ev, VA, f"Quote {bad}", "Submit"),
         "Refused: \"Quoted price must be less than the ceil price\" (reverse) / \"Quoted price must be more than the floor price\" (forward).", role="Vendor A", portal="Vendor portal", ttype="Negative", priority="High")
    case("SRC-BID", M17, "Auction first bid", f"{cap(kind)}: the same price as another vendor",
         [vendor_login(VB), f"Open {ev}", "Quote exactly Vendor A's price", "Submit"],
         "Refused: \"A bid at this price already exists, please quote a different price.\" (where ties are not allowed).", role="Vendor B", portal="Vendor portal", ttype="Negative", priority="Medium")

# ═══════════════════════════ 18. Vendor — revising a bid ══════════════════════════════
M18 = "18. Vendor portal — revising a bid (increase / decrease)"
REV = {
    "RFQ": ("the RFQ with two bids (A 100, B 90)", 1, {
        "lower by 10 (100 → 90)": ("Accepted as Current Bid 2 at 90; the bid trail lists \"1 Revision\" and the new current bid with times; Master QCS uses 90.", "Positive"),
        "raise by 10 (100 → 110)": ("Accepted as revision 2 at 110 on a company that allows price increases in an RFQ (refused with \"You cannot increase the price\" where increases are blocked — check the company setting first).", "Positive"),
        "keep the same price (100 → 100)": ("Record: either no new revision is created or the same price is saved as revision 2; the price must not change.", "Edge"),
    }),
    "reverse auction (tick 1)": ("the live reverse auction with Vendor A at 100", 1, {
        "lower by 10 (100 → 90)": ("Accepted as the next revision; the vendor's rank or the best price updates live; Master QCS uses 90.", "Positive"),
        "raise by 10 (100 → 110)": ("Refused: \"You cannot increase the price\" — a reverse auction only goes down.", "Negative"),
        "keep the same price": ("Refused: the new price must differ from the last bid by at least the tick size (\"Quoted price difference must be greater than the tick size\").", "Negative"),
        "lower by 0.5 (less than the tick)": ("Refused: \"Quoted price difference must be greater than the tick size\".", "Negative"),
        "lower by exactly 1 (one tick)": ("Accepted (one full tick).", "Positive"),
    }),
    "forward auction (tick 1)": ("the live forward auction with Vendor A at 100", 1, {
        "raise by 10 (100 → 110)": ("Accepted as the next revision; the best price and ranks update.", "Positive"),
        "lower by 10 (100 → 90)": ("Refused: \"You cannot decrease the price\" — a forward auction only goes up.", "Negative"),
        "keep the same price": ("Refused: the difference must be at least one tick.", "Negative"),
        "raise by 0.5 (less than the tick)": ("Refused: \"Quoted price difference must be greater than the tick size\".", "Negative"),
    }),
}
for kind, (ev, _tick, changes) in REV.items():
    for change, (exp, tt) in changes.items():
        case("SRC-REV", M18, f"Revise — {kind}", f"{cap(kind)}: {change}",
             vb(ev, VA, "Click the revise/edit button on your bid", f"Change the price: {change}", "Submit and confirm", BUYER_LOGIN, open_event(ev), "Open Responses and Master QCS"),
             exp, role="Vendor A, Buyer", portal="Buyer + Vendor portal", ttype=tt, priority="Critical" if tt == "Positive" and "lower by 10" in change else "High")
for title, pre, steps, exp, tt in [
    ("Price-based auction: the new bid must beat the best price", "Reverse auction where vendors must beat L1; best price 90 (Vendor B)", ["Vendor A revises from 100 to 95"], "Refused: \"Quoted price must be less than the best price\". 89 is accepted.", "Negative"),
    ("Revision needs approval when the price rises", "Company where price increases need buyer approval", ["Vendor A raises 100 → 110 on the RFQ", "Vendor A tries to revise again", "Buyer opens Responses"],
     "Vendor A's raise waits for approval; a second revision is refused: \"Your current bid is awaiting approval\". The buyer sees approval remarks with Approve / Reject; after approval 110 becomes the current bid, after rejection 100 stays.", "Positive"),
    ("Revision needs approval when the price drops", "Company where price decreases need approval", ["Vendor A lowers 100 → 90", "Buyer approves with a remark"], "90 becomes current only after approval; before that the comparison still uses 100.", "Positive"),
    ("Revising is locked after submission", "Template with \"revise bid locked\"", ["Vendor A tries to revise"], "Refused: \"Revise bid is locked. You cannot edit your quote after submission.\"", "Negative"),
    ("Revising while a counter offer is pending", "Buyer sent a counter offer on Vendor A's bid, not answered yet", ["Vendor A tries to revise the price"], "Refused: \"You have a counter offer pending on this bid\" — answer the counter offer first.", "Negative"),
    ("Revising after the event closed", "the closed RFQ (A 100, B 90)", ["Vendor A tries to revise"], "No revise button; the sheet is read-only.", "Negative"),
    ("Revising with error prices pending", "Vendor A's last bid has prices flagged as errors", ["Vendor A raises the price"], "Refused: \"You cannot increase the price from last valid price, Please resolve error prices first.\" (or decrease/\"Please quote a different price to resolve the error price.\")", "Negative"),
    ("Revision history on the buyer side", "Vendor A revised twice (100 → 95 → 90)", ["Buyer opens Responses and steps through Vendor A's revisions with the arrows"], "The trail shows \"Current Bid 3\", \"2 Revision\", \"1 Revision\" with their prices and times; Reset returns to the current bid.", "Positive"),
    ("Minimum revisions before the strategy shows", "Auction with \"Set minimum revisions to show rank\" = 2", ["Vendor A places one bid, then one revision"], "The rank is hidden after the first bid and shown only once the minimum number of revisions is reached.", "Positive"),
    ("A bid revised after the award was prepared must be re-awarded", "Award drafted, then Vendor A revised (bidding reopened)", ["Buyer goes back to awarding"], "The app asks to re-award: \"A few bids have been revised. Please re-award to continue.\" / \"Bid cannot be awarded as it is already revised.\"", "Negative"),
]:
    case("SRC-REV", M18, "Revise — rules", title, [vendor_login(VA)] + steps, exp, role="Vendor A, Buyer", portal="Buyer + Vendor portal", pre=pre, ttype=tt, priority="High")

# ═══════════════════════════ 19. Vendor — revert and revoke ════════════════════════════
M19 = "19. Vendor portal — revert and revoke"
for kind, ev in [("RFQ", "the live RFQ where Vendor A bid 100"), ("reverse auction", "the live reverse auction where Vendor A bid 100")]:
    case("SRC-RVK", M19, f"Revoke — {kind}", f"{kind}: the vendor revokes its bid while bidding is on",
         vb(ev, VA, "Click \"Revoke\" on the bid and confirm", BUYER_LOGIN, open_event(ev), "Open Responses and Master QCS"),
         "Vendor: the bid shows Revoked. Buyer: the bid is marked revoked, leaves the ranking and cannot be awarded. Order Activity records it.",
         role="Vendor A, Buyer", portal="Buyer + Vendor portal", pre="Revoke allowed for the event.", priority="High")
    case("SRC-RVK", M19, f"Revoke — {kind}", f"{kind}: the vendor tries to bid again after revoking",
         vb(ev, VA, "After revoking, type a new price and Submit"),
         "Refused: \"You cannot place a bid after revoking the previous one\" (RFQ: \"You cannot place a quote after revoking the previous quote\").",
         role="Vendor A", portal="Vendor portal", ttype="Negative", priority="High")
    case("SRC-RVK", M19, f"Revoke — {kind}", f"{kind}: revoke is not possible after the event closed",
         vb(ev.replace("live", "closed"), VA, "Look for Revoke"), "No Revoke after bidding ends; the bid stays.", role="Vendor A", portal="Vendor portal", ttype="Negative", priority="Medium")
case("SRC-RVK", M19, "Revoke", "Revoke is not offered when the event does not allow it",
     vb("a live RFQ where revoking is switched off", VA, "Look for Revoke on the bid"), "There is no Revoke option.", role="Vendor A", portal="Vendor portal", ttype="Negative", priority="Medium")
case("SRC-RVK", M19, "Revoke", "The buyer has no Revoke on a vendor's bid",
     [BUYER_LOGIN, open_event("the RFQ with two bids (A 100, B 90)"), "Look at the actions on Vendor A's bid"],
     "The buyer sees Counter Offer / Select / Reject Bid (as allowed by the state), never a Revoke for the vendor's bid. (The buyer's own \"Revoke Counter Offer\" only cancels a pending counter offer.)", ttype="Negative", priority="Medium")
for what, steps, exp, tt in [
    ("Revert to the previous revision", ["Vendor A has revisions 100 → 90", "Use the revert option to go back to the previous revision"], "If the company allows revert: 100 becomes the current bid as a new revision and the trail keeps all three entries; Master QCS uses 100. If revert is not offered, record that.", "Edge"),
    ("Revert in a reverse auction (would raise the price)", ["Vendor A has 100 → 90 in the reverse auction", "Try to revert to 100"], "Refused like any price increase in a reverse auction (\"You cannot increase the price\").", "Negative"),
]:
    case("SRC-RVK", M19, "Revert", what, [vendor_login(VA)] + steps, exp, role="Vendor A", portal="Vendor portal", ttype=tt, priority="Medium")

# ═══════════════════════════ 20. Surrogate bid ═════════════════════════════════════════
M20 = "20. Surrogate bid — the buyer adds a bid for a vendor"
sur = lambda ev, *s: [BUYER_LOGIN, open_event(ev), "Open the stage's \"Participants\" tab", *s]
for state, ev, exp, tt in [
    ("live RFQ", "the live RFQ (no bids)", "\"Add Bid\" opens \"Add Bid for Vendor A\". After filling 95 and the \"Surrogate Bid Reference\" and saving, Responses shows Vendor A's bid of 95 marked as surrogate (added by the buyer); Master QCS counts it.", "Positive"),
    ("live reverse auction", "the live reverse auction", "The surrogate bid is accepted and ranked like a vendor bid, marked surrogate.", "Positive"),
    ("RFQ in evaluation", "the RFQ in evaluation (A 100, B 90)", "Record whether Add Bid is still offered in the evaluation window; if offered, the bid is added and marked surrogate.", "Edge"),
    ("closed RFQ, company does NOT allow surrogate bids after expiry", "the closed RFQ (A 100, B 90)", "\"Add Bid\" is not offered (or saving is refused) once bidding is over.", "Negative"),
    ("closed RFQ, company allows surrogate bids after expiry", "a closed RFQ on a company with \"allowed to add surrogate bid post expiry\" ON", "The surrogate bid is accepted after the end time and marked surrogate.", "Positive"),
    ("draft project", "the draft project", "There is no Add Bid on a draft; bids and price caps can be added only after the event is published.", "Negative"),
    ("upcoming RFQ", "the upcoming RFQ", "Record whether Add Bid is offered before the start; a bid must not be added before the event starts unless the product allows it.", "Edge"),
]:
    case("SRC-SUR", M20, f"Surrogate — {state}", f"Add a surrogate bid on a {state}",
         sur(ev, "Click \"Add Bid\" next to Vendor A", "Type 95 for every line and \"Phone quote 27 Oct\" in \"Surrogate Bid Reference\"", "Save"), exp, ttype=tt,
         priority="Critical" if tt == "Positive" and "live RFQ" == state else "High")
for title, steps, exp, tt in [
    ("Save with an empty price", ["Click Add Bid next to Vendor A", "Leave a price empty, Save"], "Refused: \"Please enter valid responses for product sheet.\" / \"Please fill all required fields\".", "Negative"),
    ("Template does not allow surrogate bids", ["Open an event whose template forbids surrogate bids", "Click Add Bid"], "Refused: \"You cannot add bid with this configuration.\" (or Add Bid is not shown).", "Negative"),
    ("A second surrogate bid for the same vendor", ["Add a surrogate bid for Vendor A", "Click Add Bid next to Vendor A again"], "Refused: \"A bid is already placed on behalf of this company.\"", "Negative"),
    ("Surrogate for a vendor who already bid itself", ["Vendor A has bid 100 itself", "Click Add Bid next to Vendor A"], "Refused or turned into a revision — record which; the vendor's own bid must not be silently overwritten.", "Edge"),
    ("Surrogate for a vendor who is not a participant", ["Try to add a bid for Vendor C who was never invited"], "Refused (\"Please add this vendor to audience to re-open bid\"). Known defect seen on 1 Oct: the API accepted a surrogate for an uninvited vendor — report if it happens.", "Negative"),
    ("Surrogate bid above the price cap", ["Vendor A has a price cap of 100", "Add a surrogate of 101"], "Refused: \"Price cannot be more than the allowed price\".", "Negative"),
    ("Surrogate bid: a counter offer is not allowed on it", ["Add a surrogate bid for Vendor A", "Open Responses and try Counter Offer on it"], "Not allowed: \"You cannot send counter offer for bids added by you.\" — counter offers are only for bids the vendor placed itself.", "Negative"),
    ("Surrogate bid that needs approval", ["On a company where surrogate bids need approval, add one"], "The bid waits for approval and is not counted until approved; rejecting the approval removes it.", "Positive"),
    ("Add Price Cap for one vendor", ["Click \"Add Price Cap\" next to Vendor A, set 100, save", vendor_login(VA), "Quote 101", vendor_login(VB), "Quote 101"], "Vendor A's 101 is refused (cap 100); Vendor B's 101 is accepted (no cap). Neither vendor sees the other's cap.", "Positive"),
    ("Price cap cannot be lowered", ["Set Vendor A's cap to 100, save", "Change it to 90"], "Refused: \"You cannot decrease the Price Cap.\"", "Negative"),
    ("What the vendor sees after a surrogate bid", [vendor_login(VA), "Open the event"], "Record how the surrogate bid appears to Vendor A (as its own bid or as added by the buyer) and whether it can revise it.", "Edge"),
]:
    case("SRC-SUR", M20, "Surrogate — rules", title, sur("the live RFQ (no bids)", *steps), exp, ttype=tt, priority="High" if tt == "Negative" else "Medium")
