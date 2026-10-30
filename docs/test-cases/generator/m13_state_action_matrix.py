"""Every Settings action in every event state, and every option / value / sum of the Increase Event Time window.

The expected results are the dashboard's own rules (procol-client-dashboard
views/orderDetails/eventHeader/eventHeader.jsx renderCta, increaseAuctionModal.jsx and orderDetails.jsx
handleOkIncreaseTime), read 30 Oct; the tester's rule that every greyed-out control says why in a tooltip
(30 Oct) is part of every "greyed out" expectation."""
from common import *

ERFX = [{"key": "rfx_project_enabled", "value": True, "why": "turns on eRFX projects"}]
CO = ERFX + [{"key": "hide_counter_offer_rfq", "value": False, "why": "shows the counter offer option on RFQs"}]

# the states, as a tester finds them, with the set-up case that makes each one
STATES = [
    ("upcoming", "the upcoming RFQ", "an upcoming RFQ (published, start time not reached)"),
    ("live", "the live RFQ (no bids)", "a live RFQ with no bid yet"),
    ("live2", "the RFQ with two bids", "a live RFQ where Vendor A and Vendor B have bid"),
    ("evaluation", "the RFQ in evaluation", "an RFQ whose bidding has ended and is in its evaluation time (not awarded)"),
    ("awarded", "the awarded event with PO", "an RFQ that has been awarded"),
    ("draft", "the draft project", "a saved eRFX draft (not published)"),
]
OFFER, GREY, ABSENT = "offered", "greyed", "absent"
# action → {state: (what, why from the code)}
RULES = {
    "Recreate Order": {s: (OFFER, "offered on every published RFQ (isModeTrade)") for s in ("upcoming", "live", "live2", "evaluation", "awarded")} | {"draft": (ABSENT, "a draft has no Recreate Order")},
    "Shared With": {"live": (OFFER, "the participants list is shared only while the event is live and vendors are not masked"), "live2": (OFFER, "live, vendors not masked"), "upcoming": (ABSENT, "only while live"), "evaluation": (ABSENT, "only while live"), "awarded": (ABSENT, "only while live"), "draft": (ABSENT, "only while live")},
    "Extend Submission Time": {"upcoming": (OFFER, "offered once published, until the event expires"), "live": (OFFER, "offered while bidding"), "live2": (OFFER, "offered while bidding"), "evaluation": (OFFER, "offered until the event expires (or when the company may reopen events); extending reopens bidding"), "awarded": (GREY, "greyed out once the event is closed (disableOptionsInClosedStatus)"), "draft": (ABSENT, "never on a draft")},
    "Reschedule Event": {"upcoming": (OFFER, "offered ONLY while the event is upcoming"), **{s: (ABSENT, "offered only while the event is upcoming") for s in ("live", "live2", "evaluation", "awarded", "draft")}},
    "Withdraw": {"upcoming": (OFFER, "Withdraw is offered while upcoming, live, in evaluation or expired"), "live": (OFFER, "offered while live (greyed only when the company blocks withdrawing during bidding)"), "live2": (OFFER, "offered while live"), "evaluation": (OFFER, "offered in evaluation"), "awarded": (ABSENT, "not offered once the event is closed / awarded"), "draft": (OFFER, 'on a draft the same item reads "Cancel"')},
    "Convert to Auction": {s: (OFFER, "offered on a published RFQ when vendors are not masked") for s in ("upcoming", "live", "live2", "evaluation")} | {"awarded": (GREY, "greyed out once the event is closed"), "draft": (ABSENT, "never on a draft")},
    "Rejected Bids": {s: (OFFER, "always offered on a priced event") for s in ("upcoming", "live", "live2", "evaluation", "awarded")} | {"draft": (ABSENT, "a draft has no bids")},
    "Order Activity": {s: (OFFER, "always offered unless vendors are masked") for s in ("upcoming", "live", "live2", "evaluation", "awarded", "draft")},
    "Edit Evaluation Time": {s: (OFFER, "offered until the event expires") for s in ("upcoming", "live", "live2", "evaluation")} | {"awarded": (GREY, "greyed out once the event is closed"), "draft": (ABSENT, "never on a draft")},
    "Send Bulk Counter Offer": {"live": (GREY, "greyed out with one bid or none (bidCount ≤ 1)"), "live2": (OFFER, "clickable with two or more bids while live"), "evaluation": (OFFER, "offered in evaluation (buffer) when every bid can take a counter offer"), "upcoming": (ABSENT, "only while live or in evaluation"), "awarded": (ABSENT, "only while live or in evaluation"), "draft": (ABSENT, "only while live or in evaluation")},
}
M33 = "37. Settings actions × event state — what is allowed when (from the dashboard code)"
for action, by_state in RULES.items():
    for key, setup, words in STATES:
        what, why = by_state.get(key, (ABSENT, ""))
        label = "Cancel" if (action == "Withdraw" and key == "draft") else action
        if what == OFFER:
            exp = f"\"{label}\" is in the Settings menu and can be clicked; clicking it opens its window (nothing changes until that window is confirmed). Rule: {why}."
            title, ttype = f"{label} is offered on {words.split(' (')[0]}", "Positive"
        elif what == GREY:
            exp = f"\"{label}\" is in the Settings menu but greyed out and does nothing when clicked; moving the mouse over it shows a tooltip saying why. Rule: {why}. Greyed out with no tooltip is a bug."
            title, ttype = f"{label} is greyed out, with a tooltip, on {words.split(' (')[0]}", "Negative"
        else:
            exp = f"\"{label}\" is not in the Settings menu at all. Rule: {why}."
            title, ttype = f"{label} is not offered on {words.split(' (')[0]}", "Negative"
        steps = [BUYER_LOGIN, open_event(setup), OPEN_SETTINGS, f"Look for \"{label}\" in the menu; move the mouse over it", f"If it can be clicked, click it and then press \"Cancel\""]
        if key == "draft":
            steps = [BUYER_LOGIN, OPEN_EVENTS, "Open the \"Drafts\" tab and click the draft project. The project screen opens", OPEN_DOTS + " (a draft has no stage Settings menu: its actions are under the three dots)", f"Look for \"{label}\""]
        case("SRC-SAM", M33, f"{action} by state", title, steps, exp, priority="High" if action in ("Withdraw", "Extend Submission Time", "Reschedule Event", "Edit Evaluation Time") else "Medium", ttype=ttype,
             configs=CO if "Counter" in action else ERFX)

# the same check, iterated: one action, the state changing under it
for action, a, b, exp in [
    ("Reschedule Event", "upcoming", "live", "While the RFQ is upcoming \"Reschedule Event\" is in Settings; once its start time passes and it turns live, the item is gone (refresh the page): rescheduling is offered only while upcoming."),
    ("Withdraw", "evaluation", "awarded", "In evaluation \"Withdraw\" is offered; after the award is submitted it is no longer in Settings — an awarded event cannot be withdrawn."),
    ("Extend Submission Time", "evaluation", "awarded", "In evaluation \"Extend Submission Time\" can be clicked; after the award it is greyed out with a tooltip saying why — an awarded event's bidding cannot be reopened."),
    ("Send Bulk Counter Offer", "live", "live2", "With one bid \"Send Bulk Counter Offer\" is greyed out (tooltip says why); once a second vendor bids it becomes clickable."),
    ("Shared With", "live", "evaluation", "\"Shared With\" is offered while live; when bidding ends it is gone from Settings."),
]:
    case("SRC-SAM", M33, f"{action} as the state changes", f"{action} when the event moves from {a} to {b}",
         [BUYER_LOGIN, open_event({k: n for k, n, _ in STATES}[a]), OPEN_SETTINGS, f"Note whether \"{action}\" is offered", f"Wait / act until the RFQ is {b} (bidding ends, the award is submitted, or a second vendor bids)", "Refresh the page and open Settings again"],
         exp, priority="High", ttype="Edge", configs=CO if "Counter" in action else ERFX)

# ── the Increase Event Time window: every option, value and the sum ──────────────────────────────────
M34 = "38. Increase Event Time window — every option, value and the sum (Extend Submission Time / Edit Evaluation Time)"
OPEN_EXT = [BUYER_LOGIN, open_event("the live RFQ (no bids)"), "Note the end time E shown in the stage header (hover the countdown) — the current end of bidding", OPEN_SETTINGS, "Click \"Extend Submission Time\". The \"Increase Event Time\" window opens with ready time slots, \"Custom\" and \"Fixed\""]
SUM = "Then the countdown in the header and the event's end time move: the new end is E + {d} (check the end time shown on the stage page and in the event list); the vendor portal shows the same new end; vendors can still bid until it."
for opt, d in [("the first ready slot", "that slot's duration"), ("Custom: 15 Minutes", "15 minutes"), ("Custom: 2 Hours", "2 hours"), ("Custom: 1 Days", "1 day (24 hours)")]:
    steps = OPEN_EXT + ([f"Choose {opt}"] if "slot" in opt else ["Choose \"Custom\"", f"Type {opt.split(': ')[1].split()[0]} and pick \"{opt.split()[-1]}\""]) + ["Click \"Ok\""]
    case("SRC-IET", M34, "Extend by a duration", f"Extend a live RFQ by {opt.replace('Custom: ', '')}", steps,
         f"The window closes and the app says \"Order time updated\". " + SUM.format(d=d), priority="Critical" if "15" in opt else "High", configs=ERFX)
for val, exp, t in [
    ("0", "The window stays open; the duration box turns red and says what is wrong (e.g. \"Please enter valid time\"). Nothing is saved. A red box with no words is a bug.", "Negative"),
    ("(leave empty)", "The window stays open; the duration box turns red with a message. Nothing is saved.", "Negative"),
    ("abc", "The box does not take letters (it stays empty); pressing Ok is refused as for an empty box.", "Negative"),
    ("-5", "The box does not take a negative number (it goes back to 0 or empty); pressing Ok is refused.", "Negative"),
    ("2.5 (Hours)", "Record what happens: kept as 2.5 hours (the end moves by 2 h 30 min) or refused — and the sum must match what is shown.", "Edge"),
    ("10000 (Days)", "Record what happens. The Fixed option allows at most 3 months ahead; a custom duration beyond that should be refused the same way.", "Edge"),
]:
    case("SRC-IET", M34, "Custom duration — wrong values", f"Extend by a custom duration of {val}", OPEN_EXT + ["Choose \"Custom\"", f"In the duration box type {val}", "Click \"Ok\""], exp, ttype=t, priority="High", configs=ERFX)
for at, exp, t in [
    ("30 minutes after the current end E", "Saved: the new end is exactly the chosen time (E + 30 min).", "Positive"),
    ("10 minutes BEFORE the current end E (still in the future)", "Refused: the window stays open and the field says why (\"New time cannot be less than existing event time\"). A red field with no words is a bug.", "Negative"),
    ("a time already in the past", "Refused: \"New time cannot be less than the current time\".", "Negative"),
    ("a day more than 3 months ahead", "That day is greyed out in the calendar and cannot be picked.", "Negative"),
    ("a day before today", "Days before the current end are greyed out in the calendar and cannot be picked.", "Negative"),
]:
    case("SRC-IET", M34, "Fixed end time", f"Extend to a fixed time: {at}", OPEN_EXT + ["Choose \"Fixed\"", f"In \"Choose fixed time\" pick {at}", "Click \"Ok\""], exp, ttype=t, priority="High", configs=ERFX)
case("SRC-IET", M34, "Sums", "Extend twice: 15 minutes, then 15 minutes again", OPEN_EXT + ["Choose Custom, 15 Minutes, Ok", "Open Settings > Extend Submission Time again", "Choose Custom, 15 Minutes, Ok"], "After both, the end is E + 30 minutes — the second extension adds to the first, it does not restart from now.", priority="High", configs=ERFX)
case("SRC-IET", M34, "Sums", "Extend an upcoming RFQ: the end moves, the start does not", [BUYER_LOGIN, open_event("the upcoming RFQ"), "Note the start S and end E", OPEN_SETTINGS, "Click \"Extend Submission Time\", Custom, 1 Hours, Ok"], "The end becomes E + 1 hour; the start S is unchanged; the round is 1 hour longer.", priority="High", configs=ERFX)
case("SRC-IET", M34, "Sums", "Extend during evaluation reopens bidding from now", [BUYER_LOGIN, open_event("the RFQ in evaluation"), OPEN_SETTINGS, "Click \"Extend Submission Time\", Custom, 30 Minutes, Ok", vendor_login(VA), vendor_open(VA, "the RFQ")],
     "The event is Live again; the new end is NOW + 30 minutes (not the old end + 30, because the old end has passed). The vendor can submit or revise a bid until then.", priority="Critical", ttype="Edge", configs=ERFX, role="Buyer, Vendor", portal="Buyer + Vendor portal")
case("SRC-IET", M34, "Sums", "Vendor sees the extended end time", OPEN_EXT + ["Choose Custom, 15 Minutes, Ok", vendor_login(VA), vendor_open(VA, "the RFQ")], "The vendor's countdown and end time show E + 15 minutes, the same as the buyer's.", priority="High", configs=ERFX, role="Buyer, Vendor", portal="Buyer + Vendor portal")
case("SRC-IET", M34, "Window", "Cancel leaves the end time unchanged", OPEN_EXT + ["Choose Custom, type 60, Minutes", "Click \"Cancel\""], "The window closes; the end is still E; nothing is sent to vendors.", ttype="Positive", priority="Medium", configs=ERFX)
case("SRC-IET", M34, "Window", "Sealed bid auction: the extension says so", [BUYER_LOGIN, open_event("a live sealed bid reverse auction"), OPEN_SETTINGS, "Click \"Extend Submission Time\", Custom, 15 Minutes, Ok"], "The success message reads \"Sealed Bid time extended!\" and the end moves by 15 minutes.", priority="Medium", configs=ERFX)
# Edit Evaluation Time: increase / decrease and its limits
OPEN_EVAL = [BUYER_LOGIN, open_event("the RFQ in evaluation"), "Note the evaluation end V (when the evaluation time ends)", OPEN_SETTINGS, "Click \"Edit Evaluation Time\". The window opens with \"Edit evaluation duration\" (Increase by / Decrease by) and \"Edit evaluation ending at\""]
for steps, title, exp, t in [
    (["Choose \"Edit evaluation duration\", keep \"Increase by\", type 30, Minutes, Ok"], "Increase the evaluation time by 30 minutes", "Saved: the evaluation end is V + 30 minutes.", "Positive"),
    (["Choose \"Edit evaluation duration\", pick \"Decrease by\", type 10, Minutes, Ok"], "Decrease the evaluation time by 10 minutes", "Saved when V − 10 min is still after now and after the bidding end: the evaluation end is V − 10 minutes.", "Positive"),
    (["Choose \"Edit evaluation duration\", pick \"Decrease by\", type a duration that would end evaluation before the bidding end"], "Decrease the evaluation time to before the bidding end", "Refused: \"New time cannot be less than existing event time\".", "Negative"),
    (["Choose \"Edit evaluation duration\", pick \"Decrease by\", type a duration that would end it before now"], "Decrease the evaluation time to before now", "Refused: \"New time cannot be less than the current time\".", "Negative"),
    (["Choose \"Edit evaluation ending at\" and pick a time before the bidding end"], "Set the evaluation end before the bidding end", "Refused: \"New time cannot be less than existing event time\".", "Negative"),
]:
    case("SRC-IET", M34, "Edit Evaluation Time", title, OPEN_EVAL + steps, exp, ttype=t, priority="High", configs=ERFX)
