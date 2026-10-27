from common import *

# ═══════════════════════════ 14. Evaluation time and technical evaluation ══════════════
M14 = "14. Edit Evaluation Time and technical evaluation"
evt = lambda ev, *s: [BUYER_LOGIN, open_event(ev), OPEN_SETTINGS, "Click \"Edit Evaluation Time\". The evaluation time pop-up opens", *s]
for what, ev, steps, exp, tt in [
    ("move the evaluation end 30 minutes later during evaluation", "the RFQ in evaluation (A 100, B 90)", ["Pick an end 30 minutes after the current evaluation end", "Save"],
     "The evaluation countdown shows the new end; counter offers and Reject Bid stay available until then.", "Positive"),
    ("set the evaluation end before now", "the RFQ in evaluation (A 100, B 90)", ["Pick a time 10 minutes ago", "Save"], "Refused with a time error; nothing changes.", "Negative"),
    ("add evaluation time to a live event that had none", "a live RFQ scheduled without evaluation time", ["Choose 30 minutes", "Save"], "After bidding ends the event now has a 30-minute evaluation window.", "Positive"),
    ("increase evaluation time where the company does not allow it", "an RFQ in evaluation on a company that blocks increasing evaluation time", ["Pick a later end", "Save"], "Refused: \"You are not allowed to increase the evaluation time\".", "Negative"),
]:
    case("SRC-EVT", M14, "Edit Evaluation Time", f"Edit Evaluation Time: {what}", evt(ev, *steps), exp, ttype=tt, priority="High")
case("SRC-EVT", M14, "Edit Evaluation Time", "Edit Evaluation Time is greyed out on a closed event",
     [BUYER_LOGIN, open_event("the closed RFQ (A 100, B 90)"), OPEN_SETTINGS], "The item is not offered or is disabled once the event is closed (only customer-success / super admin with the reopen setting can reopen evaluation).", ttype="Negative", priority="Medium")
for what, steps, exp, tt in [
    ("Score a vendor's technical answers during evaluation", ["Open the Technical Stage, Responses", "Open Vendor A's response, give a score to every question, submit the scores"], "Scores are saved and shown against Vendor A.", "Positive"),
    ("Score before the evaluation period", ["While the technical stage is still live, try to score Vendor A"], "Refused: \"Evaluation Score can be filled only in evaluation period\".", "Negative"),
    ("Change evaluators outside evaluation time", ["While the stage is live, try to change the evaluator"], "Refused: \"You can update evaluators only in evaluation time.\"", "Negative"),
    ("Send an RFP to evaluation without evaluation time", ["On an RFP stage with no evaluation time click \"Send to Evaluation\""], "Refused: \"No evaluation time present. Set evaluation time to send RFP to evaluation.\"", "Negative"),
    ("Unlock commercial bids before technical evaluation is done", ["On the RFQ stage of a project with locked bids, click \"Unlock Bids\" before scoring the technical stage"], "Refused: \"Bids can't be unlocked until technical evaluation is done\".", "Negative"),
    ("Download the report while bids are locked", ["Click \"Download Report\" on the RFQ stage while bids are locked"], "Refused: \"Unlock Bid to Download Report\".", "Negative"),
    ("Vendor regrets one line in the technical stage", ["As Vendor A regret line 1 in the technical stage, answer line 2", "In the RFQ stage quote only line 2"], "Accepted; line 1 needs no price. Quoting a regretted line is refused: \"You have regretted this line item. Reset your draft bid to continue.\"", "Positive"),
    ("Vendor skips a line it did not regret", ["As Vendor A answer the technical stage for both lines", "In the RFQ stage quote only line 1"], "Refused: \"Please enter bid for all line items that are not regretted in technical stage.\"", "Negative"),
]:
    case("SRC-EVT", M14, "Technical evaluation", what, [BUYER_LOGIN, open_event("the Tech+RFQ project")] + steps, exp,
         role="Buyer, Evaluator, Vendor A", portal="Buyer + Vendor portal", ttype=tt, priority="High")

# ═══════════════════════════ 15. Reject bid / reject quote ═════════════════════════════
M15 = "15. Reject Bid (reject quote) and the Rejected Bids list"
rj = lambda ev, *s: [BUYER_LOGIN, open_event(ev), "Open the RFQ stage's \"Responses\" tab", *s]
case("SRC-RJB", M15, "When rejection is possible", "Reject Bid is disabled while bidding is on",
     rj("the RFQ with two bids (A 100, B 90)", "Move the mouse over \"Reject Bid\" on Vendor A's bid"),
     "\"Reject Bid\" is greyed out with the tooltip \"Disabled during Bidding time.\" (the backend also refuses: \"Bid rejection is disabled while bidding is in progress\").", ttype="Negative", priority="Critical")
for allow in [True, False]:
    for bidtype in ["the vendor's own bid", "a surrogate bid the buyer added"]:
        label = "with \"Allow seller to bid again\" ticked" if allow else "without \"Allow seller to bid again\""
        steps = rj("the RFQ in evaluation (A 100, B 90)" if bidtype.startswith("the vendor") else "an RFQ in evaluation with a surrogate bid for Vendor A",
                   "Click \"Reject Bid\" on Vendor A's bid. The pop-up asks \"Are you sure you want to reject this bid by Vendor A\"",
                   "Type the reason \"Price not valid — QA\" in \"Reason for rejecting bid\"",
                   "Tick \"Allow seller to bid again\"" if allow else "Leave \"Allow seller to bid again\" unticked; the pop-up warns \"Supplier would not be allowed to bid again. This action cannot be undone.\"",
                   "Confirm")
        exp = ("Vendor A's bid shows as rejected with the reason; it leaves the Master QCS ranking and cannot be awarded; Vendor B moves up. "
               + ("If bidding is reopened (Extend Submission Time), Vendor A can submit a new bid. " if allow else "\"You have blocked the supplier from bidding again.\" Vendor A can never bid on this event again, even if time is extended. ")
               + "Settings > Rejected Bids lists the bid with \"Rejection Remark: Price not valid — QA\". Vendor A sees its bid as rejected with the reason.")
        case("SRC-RJB", M15, "Reject during evaluation", f"Reject {bidtype} {label}", steps, exp,
             role="Buyer, Vendor A", portal="Buyer + Vendor portal", priority="Critical" if allow and bidtype.startswith("the vendor") else "High")
case("SRC-RJB", M15, "Reject during evaluation", "Reject without a reason",
     rj("the RFQ in evaluation (A 100, B 90)", "Click \"Reject Bid\" on Vendor A's bid", "Leave the reason empty and confirm"),
     "Refused: \"Please add a reason for rejecting this bid\"; the bid stays active.", ttype="Negative", priority="High")
case("SRC-RJB", M15, "Reject during evaluation", "Cancel the rejection pop-up",
     rj("the RFQ in evaluation (A 100, B 90)", "Click \"Reject Bid\", type a reason, click Cancel"), "Nothing changes; the bid stays active.", ttype="Negative", priority="Medium")
case("SRC-RJB", M15, "Reject during evaluation", "Reject both bids",
     rj("the RFQ in evaluation (A 100, B 90)", "Reject Vendor A with a reason, then Vendor B with a reason"),
     "Both are rejected; Master QCS has no rankable bid and Start Awarding has nobody to award (\"Please award for at least one Vendor\" if tried).", ttype="Edge", priority="Medium")
for title, ev, steps, exp in [
    ("A bid selected for the award proposal cannot be rejected", "an RFQ whose award proposal includes Vendor B", ["Click \"Reject Bid\" on Vendor B, give a reason, confirm"], "Refused: \"Can not reject a bid which is selected for proposal\"."),
    ("Reject Bid is not offered after the event closed", "the closed RFQ (A 100, B 90)", ["Look for Reject Bid on the bids"], "No Reject Bid button on a closed event (bid actions appear only while live or in evaluation; during live they are disabled)."),
    ("A vendor with an inactive profile must be rejected before comparing", "an RFQ in evaluation where Vendor C's profile became inactive", ["Open Master QCS"], "The app asks to reject that bid: \"This vendor has an inactive vendor profile. Reject this bid to proceed with comparison.\""),
]:
    case("SRC-RJB", M15, "Rejection not allowed", title, [BUYER_LOGIN, open_event(ev)] + steps, exp, ttype="Negative", priority="High")
for what, pre, exp in [
    ("with no rejected bid", "the RFQ in evaluation (A 100, B 90), nothing rejected", "The pop-up \"Rejected Bids\" says \"No bids rejected for this event\" and has a Close button."),
    ("after one rejection", "the RFQ in evaluation with Vendor A rejected", "The list shows Vendor A, the time, \"Rejection Remark: <reason>\" and whether re-bidding was allowed."),
    ("after rejecting a vendor twice (re-bid allowed, then rejected again)", "Vendor A rejected, re-bid, rejected again", "Both rejections are listed in time order with their own remarks; the bid trail shows \"<n> Rejection\" for each."),
]:
    case("SRC-RJB", M15, "Rejected Bids list", f"Settings > Rejected Bids {what}",
         [BUYER_LOGIN, open_event("the event"), OPEN_SETTINGS, "Click \"Rejected Bids\""], exp, pre=pre, priority="Medium")
case("SRC-RJB", M15, "Rejected Bids list", "Rejected Bids is not offered on an RFP stage",
     [BUYER_LOGIN, open_event("the Technical stage of the Tech+RFQ project"), OPEN_SETTINGS], "\"Rejected Bids\" is not in the menu of an RFP/technical stage.", ttype="Negative", priority="Low")
case("SRC-RJB", M15, "Vendor side", "The vendor re-bids after a rejection that allowed it",
     [vendor_login(VA), "Open the event after the buyer extended the submission time", "Quote 95 and submit"],
     "Accepted as a new bid; the buyer sees it in Responses and Master QCS ranks it again.", role="Vendor A", portal="Vendor portal",
     pre="Vendor A rejected with \"Allow seller to bid again\" ticked, then Extend Submission Time done.", priority="High")
case("SRC-RJB", M15, "Vendor side", "The blocked vendor cannot bid again",
     [vendor_login(VA), "Open the event after the buyer extended the submission time", "Try to submit a new price"],
     "No Submit (or refused): the vendor was blocked from bidding again on this event.", role="Vendor A", portal="Vendor portal",
     pre="Vendor A rejected without \"Allow seller to bid again\", then Extend Submission Time done.", ttype="Negative", priority="High")

# ═══════════════════════════ 16. Order Activity ═════════════════════════════════════════
M16 = "16. Order Activity — the event's history"
for action in ["publishing the event", "a vendor submitting a bid", "a vendor revising a bid", "Extend Submission Time", "Edit Evaluation Time",
               "a counter offer sent and answered", "a bid rejected", "a surrogate bid added", "the award proposal submitted and approved", "the event withdrawn", "participants added after publish"]:
    case("SRC-ACT", M16, "Order Activity entries", f"Order Activity records {action}",
         [BUYER_LOGIN, f"Do {action} on a test event (as described in its own test case)", OPEN_SETTINGS, "Click \"Order Activity\""],
         f"A new line records {action} with who did it and the date and time; lines are in time order and nothing done earlier is missing.", priority="Medium")
case("SRC-ACT", M16, "Order Activity entries", "Order Activity is hidden when vendor masking is on",
     [BUYER_LOGIN, open_event("a live RFQ on a company with vendor masking"), OPEN_SETTINGS], "\"Order Activity\" is not in the menu.", ttype="Negative", priority="Low")
case("SRC-ACT", M16, "Download logs", "Download Logs gives a file of the same history",
     [BUYER_LOGIN, open_event("the RFQ with two bids (A 100, B 90)"), OPEN_SETTINGS, "Click \"Download Logs\" (only on companies with it enabled)"],
     "A file downloads with the same entries as Order Activity. If the server returns no file the app says \"Download triggered, but no file URL received.\"", priority="Low")
