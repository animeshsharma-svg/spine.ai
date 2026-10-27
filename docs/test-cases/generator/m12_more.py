from common import *

M21 = "21. Counter offer — only on a vendor's own (normal) bid"
for title, steps, exp, tt in [
    ("Vendor tries to accept after the evaluation time ended", ["Buyer sends a counter offer near the end of evaluation", "Wait until evaluation ends", vendor_login(VA), "Click Accept"], "Record the result: once the event is closed the counter offer should no longer be accepted; the original price stays.", "Edge"),
    ("Vendor accepts, then tries to revise", ["Buyer sends 90, Vendor A accepts", "Vendor A tries to revise to 88 while bidding is still live"], "Record whether revising after an accepted counter offer is allowed; the accepted 90 must not be lost silently.", "Edge"),
]:
    case("SRC-NEG", M21, "Counter offer — timing", title, [BUYER_LOGIN, open_event("the RFQ in evaluation (A 100, B 90)")] + steps, exp, role="Buyer, Vendor A", portal="Buyer + Vendor portal", ttype=tt, priority="Medium")

M13 = "13. Extend Submission Time and Reschedule Event"
for title, exp in [("Reschedule an upcoming eRFX Technical + RFQ project", "Both stages move by the same amount; the technical stage still ends before the RFQ."),
                   ("Reschedule an upcoming project to a start after its delivery date", "Refused or warned — the delivery date must be after the event; record the message.")]:
    case("SRC-RSC", M13, "Reschedule", title, [BUYER_LOGIN, open_event("an upcoming eRFX Tech+RFQ project"), OPEN_SETTINGS, "Click \"Reschedule Event\", move the start 1 day later, Ok"], exp,
         ttype="Edge" if "after its delivery" in title else "Positive", priority="Medium")

M10W = "10A. Withdraw — when it is allowed and what it does"
for reason, exp in [("a 1,000-character reason", "Accepted (or cut at the field limit — record it); Order Activity shows the reason readable."),
                    ("a reason with special characters and emoji (\"Price issue — vendor's quote ₹ 😐\")", "Saved and shown exactly as typed in Order Activity.")]:
    case("SRC-WDR", M10W, "Withdraw — reason text", f"Withdraw with {reason}",
         [BUYER_LOGIN, open_event("a live RFQ made for this test"), OPEN_SETTINGS, "Click \"Withdraw\"", f"Type {reason}, confirm"], exp, ttype="Edge", priority="Low")

M16 = "16. Order Activity — the event's history"
for action in ["Convert to Auction", "Create New Version", "Recreate Order (on the old event)"]:
    case("SRC-ACT", M16, "Order Activity entries", f"Order Activity records {action}", [BUYER_LOGIN, f"Do {action} on a test event", OPEN_SETTINGS, "Click \"Order Activity\""],
         f"A line records {action} with who and when (record if missing).", priority="Low")

M32 = "32. Stage page — Responses, Overview, Participants, Analytics, Messages"
for title, steps, exp, tt in [
    ("Vendor starts a message", [vendor_login(VA), "Open the event's messages, write \"Can delivery be 10 days?\", send", BUYER_LOGIN, "Open Messages on the stage"], "The buyer sees the vendor's message and can reply.", "Positive"),
    ("Message with an attachment", ["Open Messages, attach a PDF to a message to Vendor A, send"], "Vendor A can download the same file.", "Positive"),
    ("New message with empty fields", ["Open Messages > new message, leave the text empty, send"], "Refused: \"Please fill all the values and try again\".", "Negative"),
    ("Participation count updates live", ["Note \"Participation 0/2 0%\"", "Vendor A bids"], "It changes to 1/2 (50%) without the buyer reloading (or after one refresh).", "Positive"),
]:
    case("SRC-STG", M32, "Messages and participation", title, [BUYER_LOGIN, open_event("the live RFQ (no bids)")] + steps, exp, role="Buyer, Vendor A", portal="Buyer + Vendor portal", ttype=tt, priority="Medium")

M28 = "28. Vendor portal — what the vendor sees in each state"
for title, steps, exp in [
    ("Vendor searches its event list", ["Type the event title in the vendor's search"], "Only that event is listed."),
    ("Vendor's Live and History tabs", ["Open Live, then History"], "Live has events open or upcoming for it; History has closed, withdrawn and awarded events."),
    ("Vendor downloads every attachment", ["Open the event and click Download on each Quotation Template and the T&C file"], "Every file downloads and opens; none is missing."),
]:
    case("SRC-VEN", M28, "Vendor list and files", title, [vendor_login(VA)] + steps, exp, role="Vendor A", portal="Vendor portal", priority="Low")

M2 = "2. Events list — finding the right existing event"
for title, steps, exp, tt in [
    ("A buyer with two companies sees only the current company's events", ["Switch the company from the company selector at the top", OPEN_EVENTS], "The list shows only the selected company's events; switching back restores the first list.", "Positive"),
    ("Clone a live event", ["Open a live event and use its clone/copy option"], "A new draft with the same products, template and participants opens; the live event is untouched.", "Positive"),
    ("Clone a closed event", ["Open a closed event and try to clone it"], "Refused: \"Only active or withdrawn events can be cloned.\"", "Negative"),
]:
    case("SRC-EVL", M2, "Company switch and clone", title, [BUYER_LOGIN] + steps, exp, ttype=tt, priority="Medium")

M3 = "3. Create event — Single Stage screen, event type, template and product sheet"
for title, steps, exp, tt in [
    ("Remove an attachment before publishing", ["Add Attachments: upload two files", "Remove one with its delete icon", invite_named(VA), SCHEDULE_30, PUBLISH], "Only the remaining file is listed on Project Details and visible to vendors.", "Positive"),
    ("Delivery date earlier than the bidding end", ["Pick a delivery date of today while bidding ends tomorrow", "Publish"], "Record whether this is refused or warned; a delivery before the event ends should not be accepted silently.", "Edge"),
    ("Buyer downloads the bid template", ["Publish", "On the stage click the bid template download"], "A sheet with the event's products and the vendor columns downloads.", "Positive"),
]:
    case("SRC-CRE", M3, "Attachments and dates", title, [BUYER_LOGIN] + single_stage_rfq() + steps, exp, ttype=tt, priority="Low")

M23 = "23. Awarding — complete, partial, line-wise, approval"
for title, steps, exp in [
    ("Give Feedback on the awarding page", ["On the awarding page click \"Give Feedback\", rate and write \"QA\", send"], "A thank-you message; empty feedback is refused (\"Please share your feedback\")."),
    ("View Tickets from the awarding page", ["Click \"View Tickets\""], "The ticket list opens (empty if none)."),
]:
    case("SRC-AWD", M23, "Awarding page", title, [BUYER_LOGIN, open_event("the closed RFQ (A 100, B 90)"), "Master QCS > Start Awarding"] + steps, exp, priority="Low")

M1 = "1. Purchase Requisition (PR) — finding, reading and choosing a PR"
case("SRC-PR", M1, "Lines that cannot be purchased", "A line on the Deleted tab cannot be sourced",
     [BUYER_LOGIN, OPEN_PR_LIST, "Open the Deleted tab and try to tick a line"], "Deleted lines cannot be ticked or purchased.", ttype="Negative", priority="Low")
