from common import *

# ═══════════════════════════ 10. Project page and three dots ════════════════════════════
M10 = "10. Project page — Project Details, three dots, Withdraw"
case("SRC-PRJ", M10, "Project Details", "Read the Project Details tab of a live project",
     [BUYER_LOGIN, open_event("the live RFQ (no bids)"), "Stay on \"Project Details\""],
     "Overview: Project ID (#RFX-xxxx) and Created at. Published Stages: Stage Code (RFQ-xxxx), Stage Title with an open-in-new-tab icon, Pending Actions, Participants 0/N, Bidding Starts At, Bidding Ends At. Quotation Templates lists each sheet with Download. Terms & Conditions lists the clauses.",
     pre="Set-up case SRC-SET-001 done.", priority="Critical")
case("SRC-PRJ", M10, "Project Details", "Copy the RFX number",
     [BUYER_LOGIN, open_event("the live RFQ (no bids)"), "Click the copy icon next to the RFX number", "Paste into Events > Search Title"],
     "The RFX number is copied exactly (e.g. RFX-3123).", priority="Low")
case("SRC-PRJ", M10, "Project Details", "Open a stage from Published Stages",
     [BUYER_LOGIN, open_event("the live RFQ (no bids)"), "Click the open-in-new-tab icon beside the Stage Title"],
     "The stage page opens with its tabs Responses, Overview, Participants, Analytics, Price Trends, Participant Remarks, the countdown and Settings.", priority="Medium")
case("SRC-PRJ", M10, "Three dots", "The three-dots menu of a live project",
     [BUYER_LOGIN, open_event("the live RFQ (no bids)"), OPEN_DOTS],
     "The menu shows \"Send Reminders\" and \"Withdraw Project\". Clicking elsewhere closes it.", priority="High")
case("SRC-PRJ", M10, "Three dots", "Download the bid templates from Quotation Templates",
     [BUYER_LOGIN, open_event("the live RFQ (no bids)"), "Under Quotation Templates click Download on \"Bidding Sheet Template\""],
     "The sheet downloads with the event's products and columns.", priority="Low")

# Withdraw — allowed states from eventHeader.jsx (live, upcoming, requested, draft→Cancel Event, expired, buffer) and backend 841/753
M10W = "10A. Withdraw — when it is allowed and what it does"
W_ALLOWED = [
    ("upcoming (not started)", "the upcoming RFQ", "Vendors never got a chance to bid; they see the event as withdrawn."),
    ("live with no bids", "the live RFQ (no bids)", "The countdown stops; vendors can no longer bid."),
    ("live with two bids", "the RFQ with two bids (A 100, B 90)", "The two bids stay visible read-only on the buyer side; vendors see the event as withdrawn and cannot revise."),
    ("in evaluation time", "the RFQ in evaluation (A 100, B 90)", "Counter offers and awarding are no longer possible."),
    ("a draft project (option is labelled \"Cancel Event\")", "the draft project", "The draft leaves the Drafts tab."),
]
for state, ev, extra in W_ALLOWED:
    menu = "the three dots (⋮) at the top right of the project page and click \"Withdraw Project\"" if "draft" not in state else "Settings and click \"Cancel Event\""
    for reason, rexp, tt in [("with a reason", None, "Positive"), ("without a reason", "The withdraw is refused until a reason is typed (\"Please enter reason for withdrawing this event\"); nothing changes.", "Negative"),
                             ("and press Cancel in the pop-up", "The pop-up closes and nothing changes; the event keeps its state.", "Negative")]:
        steps = [BUYER_LOGIN, open_event(ev), f"Click {menu}",
                 "The pop-up \"Withdrawing Order…\" asks \"Are you sure you want to withdraw this event?\"",
                 {"with a reason": "Type the reason \"QA test withdraw\" and confirm", "without a reason": "Leave the reason empty and confirm",
                  "and press Cancel in the pop-up": "Click Cancel"}[reason]]
        if rexp is None:
            rexp = (f"\"Order withdrawn\" appears. The status becomes withdrawn, the event moves to the History tab, and Order Activity records the withdrawal with the reason. {extra} "
                    "If the event was made from a PR, the PR line returns to Open.")
        case("SRC-WDR", M10W, f"Withdraw — {state}", f"Withdraw an event that is {state} {reason}", steps, rexp, ttype=tt,
             priority="Critical" if tt == "Positive" and "two bids" in state else "High")
for title, ev, steps, exp in [
    ("Withdraw is disabled on a live auction when the company blocks it during submission time", "a live reverse auction on a company with \"withdraw disabled during submission time\" ON",
     [OPEN_SETTINGS, "Move the mouse over \"Withdraw\""], "\"Withdraw\" is greyed out with the tooltip \"Auction cannot be withdrawn when the event is live\". After the bidding time ends it becomes available."),
    ("Withdraw is not offered on a closed event", "the closed RFQ (A 100, B 90)", [OPEN_SETTINGS], "\"Withdraw\" is not in the menu of a closed event."),
    ("Withdraw is refused once an award proposal is submitted", "an event whose award proposal is submitted for approval",
     [OPEN_SETTINGS, "Click \"Withdraw\", type a reason and confirm"], "Refused: \"Cannot withdraw the event as proposals are already submitted.\""),
    ("Withdraw is not offered on an awarded event with PO", "the awarded event with PO", [OPEN_SETTINGS], "\"Withdraw\" is not in the menu; the award and PO are untouched."),
    ("Withdraw is greyed out on an old version", "the old version of a project that has a newer version", [OPEN_SETTINGS], "\"Withdraw\" is disabled on old versions; only the latest version can be withdrawn."),
    ("A user without permission cannot withdraw", "the live RFQ (no bids), logged in as a buyer whose role lacks \"increase time, withdraw event\"", [OPEN_SETTINGS], "\"Withdraw\" is not shown for this user."),
    ("A withdrawn event cannot be withdrawn again", "the withdrawn event", [OPEN_SETTINGS], "\"Withdraw\" is not offered; the status stays withdrawn."),
]:
    case("SRC-WDR", M10W, "Withdraw — not allowed", title, [BUYER_LOGIN, open_event(ev)] + steps, exp, ttype="Negative", priority="High")
case("SRC-WDR", M10W, "Vendor side", "What the vendor sees after the event is withdrawn",
     [vendor_login(VA), "Open the withdrawn event from the vendor's list"],
     "The event shows Withdrawn; the price sheet is read-only and there is no Submit or revise button. The vendor's earlier bid is still shown as theirs.", role="Vendor A", portal="Vendor portal", pre="Set-up case SRC-SET-012 done.", priority="High")
case("SRC-WDR", M10W, "Clone", "A withdrawn event can be cloned; a draft cannot",
     [BUYER_LOGIN, open_event("the withdrawn event"), "Use the event's clone / copy option", open_event("the draft project"), "Try the same"],
     "The withdrawn event clones into a new draft with the same products. Cloning other states is refused: \"Only active or withdrawn events can be cloned.\"", ttype="Edge", priority="Low")

# ═══════════════════════════ 11. Settings menu by state ══════════════════════════════════
M11 = "11. Settings (gear) menu — what is offered on each state"
ITEMS = ["Recreate Order", "Extend Submission Time", "Reschedule Event", "Withdraw", "Convert to Auction", "Rejected Bids", "Order Activity", "Edit Evaluation Time", "Send Bulk Counter Offer"]


def menu_for(state, kind, pr=False, bids=2):
    """What eventHeader.jsx shows. kind: RFQ / Auction / Technical (RFP)."""
    trade = kind != "Technical"
    shown = {}
    if trade:
        shown["Recreate Order"] = "greyed out (made from a PR)" if pr else "enabled"
    if state not in ("draft", "closed"):
        shown["Extend Submission Time"] = "enabled"
    if state == "upcoming":
        shown["Reschedule Event"] = "enabled"
    if state in ("live", "upcoming", "draft", "evaluation"):
        shown["Withdraw" if state != "draft" else "Cancel Event"] = "enabled"
    if kind == "RFQ" and state != "draft":
        shown["Convert to Auction"] = "greyed out" if state == "closed" else "enabled"
    if trade:
        shown["Rejected Bids"] = "enabled"
    shown["Order Activity"] = "enabled"
    if state in ("live", "evaluation", "upcoming"):
        shown["Edit Evaluation Time"] = "enabled"
    if trade and state in ("live", "evaluation"):
        shown["Send Bulk Counter Offer"] = "enabled" if bids > 1 else "greyed out (needs more than one bid)"
    return shown


STATES = [("upcoming", "the upcoming RFQ"), ("live", "the RFQ with two bids (A 100, B 90)"), ("evaluation", "the RFQ in evaluation (A 100, B 90)"), ("closed", "the closed RFQ (A 100, B 90)")]
for kind, ev_word in [("RFQ", "RFQ"), ("Auction", "reverse auction"), ("Technical", "Technical stage of the Tech+RFQ project")]:
    for state, ev in STATES:
        evname = ev.replace("RFQ", ev_word) if kind != "RFQ" else ev
        shown = menu_for(state, kind)
        lst = "; ".join(f"\"{k}\" {v}" for k, v in shown.items())
        missing = [i for i in ITEMS if i not in shown and not (i == "Withdraw" and "Cancel Event" in shown)]
        case("SRC-MNU", M11, f"Menu — {kind} {state}", f"Settings menu on {'an' if state[0] in 'aeiou' else 'a'} {state} {kind if kind != 'Technical' else 'technical (RFP) stage'}",
             [BUYER_LOGIN, open_event(evname), OPEN_SETTINGS, "Read every item and move the mouse over any greyed-out one"],
             f"Shown: {lst}. Not shown: {', '.join(missing) if missing else 'none'}." + (" (On companies that allow reopening events, Extend Submission Time is listed but greyed out on a closed event.)" if state == "closed" else ""),
             priority="High", rule="eventHeader.jsx renderCta")
for title, ev, exp in [
    ("Recreate Order is greyed out on an event made from a PR", "the PR-based RFQ (closed)", "\"Recreate Order\" is shown but disabled — events created from a PR cannot be recreated."),
    ("Send Bulk Counter Offer is greyed out with only one bid", "a live RFQ with only Vendor A's bid", "\"Send Bulk Counter Offer\" is disabled until at least two bids exist."),
    ("Old version: actions are greyed out", "the old version of a versioned project", "Recreate Order, Extend Submission Time, Convert to Auction, Edit Evaluation Time and Withdraw are disabled; only the latest version can be changed."),
    ("Project on hold: actions are greyed out", "a project put on hold", "Recreate Order, Extend Submission Time, Convert to Auction and Edit Evaluation Time are disabled while on hold."),
    ("Convert to Auction is hidden when vendor masking is on", "a live RFQ on a company with vendor masking", "\"Convert to Auction\" and \"Order Activity\" are not offered when vendor masking is on."),
    ("Draft: only Cancel and the always-on items", "the draft project", "No Extend Submission Time, no Reschedule, no Convert to Auction; the withdraw item reads \"Cancel Event\"."),
]:
    case("SRC-MNU", M11, "Menu — special cases", title, [BUYER_LOGIN, open_event(ev), OPEN_SETTINGS], exp, ttype="Negative", priority="Medium")

# ═══════════════════════════ 12. Recreate Order ═════════════════════════════════════════
M12 = "12. Recreate Order"
rc = lambda *s: [BUYER_LOGIN, open_event("the closed RFQ (A 100, B 90)"), OPEN_SETTINGS, "Click \"Recreate Order\". The \"Recreate Order\" pop-up opens with Product Sheet, Auction Configurations, Delivery Date and \"Schedule this event?\"", *s]
case("SRC-RCO", M12, "Recreate pop-up", "What the Recreate Order pop-up shows",
     rc("Read every section"),
     f"Product Sheet: one row per line of the old event (e.g. 1, {P1} (2810038395), Default Variant, 10 ST, Plant Name (LOC-0001), Price) with Details links. Auction Configurations: \"Event End Time Duration\" (15 Mins, 30 Mins selected, 60 Mins, 4 Hrs, 24 Hrs, Custom) and \"Evaluation Duration\" (15 Mins, 30 Mins selected, 45 Mins, 60 Mins, Custom, Clear). Delivery Date (Select date). \"Schedule this event?\" checkbox with date and time (greyed until ticked). Buttons: Edit More Details, Cancel, Create Order.",
     pre="Set-up case SRC-SET-004 done.", priority="Critical")
for end, mins in [("15 Mins", 15), ("30 Mins", 30), ("60 Mins", 60), ("4 Hrs", 240), ("24 Hrs", 1440)]:
    case("SRC-RCO", M12, "End time", f"Recreate with Event End Time Duration {end}",
         rc(f"Click \"{end}\" under Event End Time Duration", "Keep Evaluation Duration 30 Mins, no schedule", "Click \"Create Order\""),
         f"A new event is created and opens live at once with a new RFX/stage code, the same product, quantity and location, the same participants, and \"Bidding Ends At\" = start + {mins} minutes. The old event is unchanged.",
         priority="Critical" if mins == 30 else "High")
case("SRC-RCO", M12, "End time", "Recreate with a Custom end time of 90 minutes",
     rc("Click \"Custom\" under Event End Time Duration and enter 90 minutes", "Click Create Order"),
     "The new event ends 90 minutes after it starts.", priority="Medium")
case("SRC-RCO", M12, "End time", "Recreate with Custom end time left empty",
     rc("Click \"Custom\" and leave it empty", "Click Create Order"),
     "Refused: \"Please enter valid time\" (or \"Please fill valid event details to proceed\"); no new event.", ttype="Negative")
for ev, mins in [("15 Mins", 15), ("45 Mins", 45), ("60 Mins", 60)]:
    case("SRC-RCO", M12, "Evaluation", f"Recreate with Evaluation Duration {ev}",
         rc(f"Keep end 30 Mins, click \"{ev}\" under Evaluation Duration", "Create Order"),
         f"The new event has a {mins}-minute evaluation window after its 30-minute bidding time.", priority="Medium")
case("SRC-RCO", M12, "Evaluation", "Recreate with Evaluation Duration cleared",
     rc("Click \"Clear\" under Evaluation Duration", "Create Order"),
     "The new event has no evaluation window: it closes as soon as bidding ends.", priority="Medium")
case("SRC-RCO", M12, "Evaluation", "Recreate a serial bidding event with Evaluation cleared",
     [BUYER_LOGIN, open_event("a closed serial-bidding RFQ"), OPEN_SETTINGS, "Click \"Recreate Order\"", "Click \"Clear\" under Evaluation Duration", "Create Order"],
     "Refused: \"Evaluation time is mandatory for serial bidding\".", ttype="Negative")
for what, steps, exp, tt in [
    ("Schedule ticked with tomorrow 11:00 AM", ["Tick \"Schedule this event?\", pick tomorrow and 11:00 AM", "Create Order"], "The new event is upcoming and starts tomorrow at 11:00 AM; Reschedule Event is offered on it.", "Positive"),
    ("Schedule ticked with a time already passed", ["Tick \"Schedule this event?\", pick today with a time 1 hour ago", "Create Order"], "Refused: \"Invalid scheduled time!\" / \"Scheduled time is invalid!\"; the pop-up stays open; no new event.", "Negative"),
    ("Schedule ticked but no date/time", ["Tick \"Schedule this event?\" and leave date and time empty", "Create Order"], "Refused: \"Please select an event schedule time\" / \"Please choose event schedule time\".", "Negative"),
    ("Delivery date next month", ["Pick a Delivery Date next month", "Create Order"], "The new event shows that delivery date to vendors.", "Positive"),
    ("Delivery date in the past", ["Pick yesterday as Delivery Date"], "Yesterday cannot be picked, or Create Order is refused; record which.", "Negative"),
    ("Change the quantity in the pop-up", ["Change Quantity Requested from 10 to 15", "Create Order"], "The new event asks for 15; the old event still shows 10.", "Positive"),
    ("Clear a required product cell", ["Clear the Quantity Requested cell", "Create Order"], "Refused (\"Please fill valid event details to proceed\"); the empty required cell is highlighted.", "Negative"),
    ("Edit More Details", ["Click \"Edit More Details\""], "The full create screen opens pre-filled from the old event (template, products, participants, T&C) so anything can be changed before publishing.", "Positive"),
    ("Cancel", ["Change the end time to 60 Mins", "Click \"Cancel\""], "The pop-up closes; no event is created (Events list unchanged).", "Negative"),
    ("Close with the cross", ["Click the × at the top right of the pop-up"], "Same as Cancel; nothing created.", "Negative"),
    ("Double-click Create Order", ["Click \"Create Order\" twice quickly"], "Exactly one new event is created.", "Edge"),
]:
    case("SRC-RCO", M12, "Recreate options", f"Recreate Order: {what}", rc(*steps), exp, ttype=tt, priority="High" if tt != "Edge" else "Medium")
for src, exp, tt in [
    ("a closed reverse auction", "A new reverse auction is created with the same auction settings (strategy, tick size) and the chosen times.", "Positive"),
    ("a live RFQ (while bidding is on)", "Record whether recreating a live event is allowed; if allowed, the new event is independent and the live one keeps running.", "Edge"),
    ("a withdrawn RFQ", "A new live event is created from the withdrawn one with the same products.", "Positive"),
    ("an RFP (technical) stage", "Recreate Order is not offered on RFP/RFI stages (only on RFQ and auction).", "Negative"),
    ("an event made from a PR", "\"Recreate Order\" is greyed out; it cannot be clicked.", "Negative"),
    ("an event with mandatory T&C", "The new event keeps the clauses and keeps them mandatory.", "Positive"),
    ("an event with two vendors invited", "The new event invites the same two vendors; each gets a fresh invitation; their old bids are not copied.", "Positive"),
]:
    case("SRC-RCO", M12, "Recreate from different events", f"Recreate Order from {src}",
         [BUYER_LOGIN, open_event(src), OPEN_SETTINGS, "Click \"Recreate Order\" (if offered)", "Keep the defaults and click Create Order"], exp, ttype=tt, priority="High")
case("SRC-RCO", M12, "Vendor side", "The vendor gets the recreated event as a new invitation",
     [vendor_login(VA), "Open the event list"], "The recreated event appears as a separate live event with no bid from Vendor A; the old event still shows the old bid.",
     role="Vendor A", portal="Vendor portal", pre="Recreate Order done from the closed RFQ (A 100, B 90).", priority="High")
case("SRC-RCO", M12, "Order Activity", "Order Activity of the old event records the recreation",
     [BUYER_LOGIN, open_event("the closed RFQ (A 100, B 90)"), OPEN_SETTINGS, "Click \"Order Activity\""], "An entry shows the recreation with who did it and when (record if missing).", priority="Low")

# ═══════════════════════════ 13. Extend submission time / reschedule ═══════════════════
M13 = "13. Extend Submission Time and Reschedule Event"
ext = lambda ev, *s: [BUYER_LOGIN, open_event(ev), OPEN_SETTINGS, "Click \"Extend Submission Time\". The pop-up shows the current end time", *s]
for kind, ev in [("RFQ", "the live RFQ (no bids)"), ("reverse auction", "the live reverse auction"), ("Technical stage", "the Technical stage of the Tech+RFQ project")]:
    for newt, exp, tt in [
        ("10 minutes after the current end", "The pop-up closes; Bidding Ends At shows the new time; the vendors' countdown shows the extra 10 minutes and they can still bid until then; Order Activity logs the extension.", "Positive"),
        ("2 hours after the current end", "The new end is 2 hours later everywhere (project page, vendor countdown).", "Positive"),
        ("earlier than the current end", "Refused: \"New time cannot be less than existing <end time>\"; the end time does not change.", "Negative"),
        ("a time already in the past", "Refused: \"New time cannot be less than the current time\".", "Negative"),
    ]:
        case("SRC-EXT", M13, f"Extend — live {kind}", f"Extend the live {kind} to {newt}",
             ext(ev, f"Pick {newt}", "Save"), exp, ttype=tt, priority="Critical" if tt == "Positive" and kind == "RFQ" and "10" in newt else "High")
for title, ev, steps, exp, tt in [
    ("Extend is greyed out on a closed RFQ", "the closed RFQ (A 100, B 90)", [OPEN_SETTINGS], "\"Extend Submission Time\" is shown but disabled on a closed event.", "Negative"),
    ("Extend is not offered on a draft", "the draft project", [OPEN_SETTINGS], "\"Extend Submission Time\" is not in the menu of a draft.", "Negative"),
    ("Extend the RFQ after it was converted to an auction", "an RFQ that was converted to an auction", [OPEN_SETTINGS, "Click Extend Submission Time on the RFQ stage and save a later time"], "Refused: \"You cannot extend the RFQ time after auction is created\".", "Negative"),
    ("Extend the RFQ after lots were created", "an RFQ split into lots", [OPEN_SETTINGS, "Extend Submission Time, save"], "Refused: \"You cannot extend the RFQ time after lot creation\".", "Negative"),
    ("Extend a round beyond the auction's end", "a live knockout auction", ["Extend the current round past the auction's end time"], "Refused: \"You cannot extend round time beyond auction expiry time. Please extend auction time first.\" / \"Extend your auction time in order to extend current round's time!\"", "Negative"),
    ("Extend on a sealed bid auction", "a live sealed bid auction", [OPEN_SETTINGS, "Extend Submission Time by 10 minutes and save"], "Saved with \"Sealed Bid time extended!\"; the sealed bid period is longer by 10 minutes.", "Positive"),
    ("Extend during evaluation reopens bidding", "the RFQ in evaluation (A 100, B 90)", [OPEN_SETTINGS, "Extend Submission Time to 15 minutes from now, save", vendor_login(VA), "Open the event"], "Bidding is live again until the new time; Vendor A can revise.", "Positive"),
]:
    case("SRC-EXT", M13, "Extend — special cases", title, [BUYER_LOGIN, open_event(ev)] + steps, exp, ttype=tt, priority="High")
rs = lambda *s: [BUYER_LOGIN, open_event("the upcoming RFQ"), OPEN_SETTINGS, "Click \"Reschedule Event\". The \"Reschedule Event\" pop-up opens with \"Make Order Live At\", \"Delivery Date\" and the buttons Cancel and Ok", *s]
for what, steps, exp, tt in [
    ("move the start 2 hours later", ["Pick the same day, start time + 2 hours (5-minute steps)", "Click Ok"], "The start moves 2 hours later and the end moves by the same 2 hours (the bidding length is kept); the event stays upcoming. The shown time may differ by one minute because of the server clock (known issue BUG-83).", "Positive"),
    ("move the start to tomorrow", ["Pick tomorrow, same time", "Ok"], "Start and end move by one day.", "Positive"),
    ("pick a start time in the past", ["Pick today, one hour ago", "Ok"], "Refused with a time error; nothing changes.", "Negative"),
    ("change only the delivery date", ["Pick a new Delivery Date", "Ok"], "Only the delivery date changes.", "Positive"),
    ("press Cancel", ["Change the time and click Cancel"], "Nothing changes.", "Negative"),
]:
    case("SRC-RSC", M13, "Reschedule", f"Reschedule an upcoming event: {what}", rs(*steps), exp, ttype=tt, priority="High" if tt == "Positive" else "Medium")
for state, ev in [("live", "the live RFQ (no bids)"), ("closed", "the closed RFQ (A 100, B 90)")]:
    case("SRC-RSC", M13, "Reschedule", f"Reschedule is not offered on a {state} event",
         [BUYER_LOGIN, open_event(ev), OPEN_SETTINGS], "\"Reschedule Event\" is not in the menu (only upcoming events can be rescheduled).", ttype="Negative", priority="Medium")
