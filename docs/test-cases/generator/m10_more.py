from common import *

# ── 4. title field rules ───────────────────────────────────────────────────────────
M4 = "4. Event title — auto title and typed title"
for what, typed, exp, tt in [
    ("only spaces", "\"     \" (five spaces)", "Treated as empty: publish is refused with \"Please enter title.\" (single stage) / \"Please fill project title!\" (eRFX).", "Negative"),
    ("special characters", "\"QA_Platform #1 / (test) & co.\"", "Kept exactly; shown the same on the project page, Events list and vendor portal.", "Positive"),
    ("200 characters", "a 200-character title", "Kept (or cut at the field limit — record the limit); the project page and list show it without breaking the layout.", "Edge"),
    ("leading and trailing spaces", "\"  QA_Platform title  \"", "Saved without the outer spaces (record if not).", "Edge"),
]:
    case("SRC-TTL", M4, "Title field", f"Title with {what}", [BUYER_LOGIN] + single_stage_rfq() + [f"Type {typed} in the title box", invite_named(VA), SCHEDULE_30, "Click Publish Event"], exp, ttype=tt, priority="Medium")

# ── 8. more T&C placements ─────────────────────────────────────────────────────────
M8 = "8. Terms & Conditions — event-wise and stage-wise, mandatory and optional"
for mode, act, exp, tt in [
    ("one clause Required", "skips the Required clause", "Submit is blocked until the Required clause is accepted.", "Negative"),
    ("one clause Required", "accepts the Required clause only", "The bid is submitted; the optional clause shows not accepted.", "Positive"),
    ("Mark all mandatory", "accepts every clause", "The bid is submitted; the event shows \"Vendors who have placed the bid, have accepted the Terms and Conditions.\"", "Positive"),
    ("no clause mandatory", "accepts nothing", "The bid is submitted; nothing blocks.", "Positive"),
]:
    case("SRC-TNC", M8, f"T&C on single stage forward auction — {mode}", f"Single stage forward auction, {mode}: the vendor {act}",
         [BUYER_LOGIN] + single_stage_auction("forward") + ["Click \"Terms & Conditions\", add the two clauses and set: " + mode, "Done", invite_named(VA), SCHEDULE_30, PUBLISH, vendor_login(VA), f"Open the auction; the vendor {act} and bids 100"],
         exp, role="Buyer, Vendor A", portal="Buyer + Vendor portal", ttype=tt, priority="High")
for tech, rfq, act, exp, tt in [
    ("\"NDA signed\" Required", "\"Payment within 45 days\" Required", "accepts the NDA on the technical response but not the payment clause on the RFQ", "The technical response is accepted; the RFQ bid is blocked until \"Payment within 45 days\" is accepted.", "Negative"),
    ("\"NDA signed\" Required", "\"Payment within 45 days\" Required", "accepts each stage's clause on that stage", "Both stage responses go through; each stage records its own accepted clause.", "Positive"),
    ("\"NDA signed\" Required", "no clauses", "accepts the NDA on the technical stage", "The technical response goes through; the RFQ stage shows no T&C block.", "Positive"),
    ("no clauses", "\"Payment within 45 days\" Required", "skips the payment clause on the RFQ", "The technical response goes through (no clauses); the RFQ bid is blocked.", "Negative"),
]:
    case("SRC-TNC", M8, "T&C different per stage (Technical + RFQ)", f"Technical stage {tech}, RFQ stage {rfq}: the vendor {act}",
         [BUYER_LOGIN, OPEN_EVENTS, CLICK_CREATE, CHOOSE_ERFX, "Make Technical + RFQ with templates, Vendor Assessment, evaluator, 1 item",
          f"Technical Stage tab > Terms & Conditions > \"Adding terms and conditions for:\" the Technical stage: {tech}", f"RFQ tab > Terms & Conditions > the RFQ stage: {rfq}", invite_named(VA), "Schedule both stages, publish",
          vendor_login(VA), f"The vendor {act}"],
         exp, role="Buyer, Vendor A", portal="Buyer + Vendor portal", ttype=tt, priority="High")

# ── 10. three dots by state ────────────────────────────────────────────────────────
M10 = "10. Project page — Project Details, three dots, Withdraw"
for state, ev, exp in [
    ("upcoming", "the upcoming RFQ", "\"Send Reminders\" and \"Withdraw Project\"."),
    ("live with no bids", "the live RFQ (no bids)", "\"Send Reminders\" and \"Withdraw Project\"."),
    ("live with every vendor bid", "a live RFQ where both invited vendors bid", "\"Withdraw Project\"; Send Reminders has nobody to remind (record whether it is hidden or reminds nobody)."),
    ("in evaluation", "the RFQ in evaluation (A 100, B 90)", "\"Withdraw Project\" (unless an award proposal was submitted)."),
    ("closed", "the closed RFQ (A 100, B 90)", "No Withdraw Project (a closed event cannot be withdrawn)."),
    ("awarded with PO", "the awarded event with PO", "No Withdraw Project."),
    ("withdrawn", "the withdrawn event", "No Withdraw Project; the project shows withdrawn."),
]:
    case("SRC-PRJ", M10, "Three dots by state", f"Three-dots menu of a project that is {state}", [BUYER_LOGIN, open_event(ev), OPEN_DOTS], f"The menu offers: {exp}", priority="Medium")

# ── 12. recreate value checks ──────────────────────────────────────────────────────
M12 = "12. Recreate Order"
for val, exp, tt in [("0", "Refused; quantity must be more than zero.", "Negative"), ("-3", "Refused.", "Negative"), ("abc", "The cell does not keep letters.", "Negative"), ("2.5", "Kept for decimal units; refused/rounded for whole units — record.", "Edge")]:
    case("SRC-RCO", M12, "Recreate — quantity", f"Recreate Order with Quantity Requested = {val}",
         [BUYER_LOGIN, open_event("the closed RFQ (A 100, B 90)"), OPEN_SETTINGS, "Click \"Recreate Order\"", f"Type {val} in Quantity Requested", "Create Order"], exp, ttype=tt, priority="Medium")
for src in ["a closed forward auction", "the RFQ stage of a closed eRFX RFQ project"]:
    case("SRC-RCO", M12, "Recreate from different events", f"Recreate Order from {src}",
         [BUYER_LOGIN, open_event(src), OPEN_SETTINGS, "Recreate Order, keep defaults, Create Order"],
         "A new event of the same kind with the same products, participants and settings; record whether an eRFX stage is recreated as a single stage event or as a new project.", ttype="Edge", priority="Medium")

# ── 13. extend near the end ────────────────────────────────────────────────────────
M13 = "13. Extend Submission Time and Reschedule Event"
case("SRC-EXT", M13, "Extend — special cases", "Extend with one minute left while a vendor is typing",
     [BUYER_LOGIN, open_event("a live RFQ ending in 1 minute"), OPEN_SETTINGS, "Extend Submission Time to end + 15 minutes, save", vendor_login(VA), "Submit 95 two minutes later"],
     "The extension lands before the end; Vendor A's bid two minutes later is accepted.", role="Buyer, Vendor A", portal="Buyer + Vendor portal", priority="High")
case("SRC-EXT", M13, "Extend — special cases", "Extend twice",
     [BUYER_LOGIN, open_event("the live RFQ (no bids)"), OPEN_SETTINGS, "Extend by 10 minutes, save", "Extend again by 10 more minutes, save"],
     "The end moves 20 minutes in total; Order Activity lists both extensions.", priority="Medium")

# ── 17. vendor bid on each event kind ──────────────────────────────────────────────
M17 = "17. Vendor portal — opening the event and submitting a bid"
for kind, ev, exp in [
    ("eRFX RFQ project", "an eRFX RFQ-only project", "Accepted; the bid shows on the RFQ stage's Responses and in the project's Master QCS."),
    ("eRFX Auction project", "an eRFX Auction-only project", "Accepted; the vendor's rank or best price updates live."),
    ("Tech+RFQ, commercial stage after the technical response", "the Tech+RFQ project after Vendor A answered the technical stage", "Accepted on the RFQ stage; Master QCS shows the commercial price next to the technical result."),
    ("single stage forward auction", "the live forward auction", "Accepted; higher prices rank better."),
]:
    case("SRC-BID", M17, "Bid on each event kind", f"Submit a bid on a {kind}", [vendor_login(VA), f"Open {ev}", "Accept any Required T&C, quote 100, Submit"], exp, role="Vendor A", portal="Vendor portal", priority="High")
for title, steps, exp, tt in [
    ("Download the bid template and upload it filled", ["Click \"Download\" on the bid template", "Fill 100 for every line in the file", "Upload it with \"Upload Sheet\" and submit"], "The prices from the file fill the sheet exactly; the bid is submitted.", "Positive"),
    ("Upload a bid file with letters in a price", ["Upload a file with \"abc\" as a price"], "The bad row is refused and named; nothing is submitted until it is fixed.", "Negative"),
    ("Upload a bid file for another event", ["Upload the template downloaded from a different event"], "Refused or rows not matched — record the message; no wrong prices are submitted.", "Negative"),
]:
    case("SRC-BID", M17, "Upload a bid", title, [vendor_login(VA), "Open the live RFQ (no bids)"] + steps, exp, role="Vendor A", portal="Vendor portal", ttype=tt, priority="Medium")

# ── 20. surrogate value checks ─────────────────────────────────────────────────────
M20 = "20. Surrogate bid — the buyer adds a bid for a vendor"
for val, exp, tt in [("0", "Refused (\"Please enter valid responses for product sheet.\").", "Negative"), ("-5", "Refused.", "Negative"), ("abc", "The cell does not keep letters.", "Negative"), ("95.75", "Accepted with decimals; totals use 95.75.", "Positive")]:
    case("SRC-SUR", M20, "Surrogate — price values", f"Surrogate bid with price {val}",
         [BUYER_LOGIN, open_event("the live RFQ (no bids)"), "Participants > Add Bid next to Vendor A", f"Type {val} as the price, add a reference, Save"], exp, ttype=tt, priority="Medium")

# ── 21. counter offer value checks and kinds ───────────────────────────────────────
M21 = "21. Counter offer — only on a vendor's own (normal) bid"
for val, exp, tt in [
    ("letters \"abc\"", "The price cell does not keep letters; Send stays refused (\"You must change atleast one column…\").", "Negative"),
    ("-10", "Refused; a negative counter price is not accepted.", "Negative"),
    ("110 (higher than the vendor's 100)", "Record whether a counter offer above the quote is allowed; a counter offer is meant to lower the price.", "Edge"),
    ("89.50 (decimals)", "Accepted; the vendor sees 89.50.", "Positive"),
]:
    case("SRC-NEG", M21, "Counter offer — price values", f"Counter offer price {val}",
         [BUYER_LOGIN, open_event("the RFQ in evaluation (A 100, B 90)"), "Responses > Counter Offer on Vendor A", f"Tick the line and type {val}", "Send Counter Offer"], exp, ttype=tt, priority="Medium")
for kind, ev in [("eRFX RFQ project", "an eRFX RFQ-only project in evaluation with Vendor A's bid"), ("Tech+RFQ project (RFQ stage)", "the Tech+RFQ project in evaluation with Vendor A's bid")]:
    case("SRC-NEG", M21, f"Counter offer on a {kind}", f"{kind}: counter offer accepted and used in the award",
         [BUYER_LOGIN, open_event(ev), "RFQ stage > Responses > Counter Offer on Vendor A: 100 → 90, send", vendor_login(VA), "Accept", BUYER_LOGIN, "After the close: Master QCS > Start Awarding to Vendor A"],
         "Master QCS and the award use 90 for Vendor A.", role="Buyer, Vendor A", portal="Buyer + Vendor portal", priority="High")
    case("SRC-NEG", M21, f"Counter offer on a {kind}", f"{kind}: counter offer rejected",
         [BUYER_LOGIN, open_event(ev), "Send a counter offer of 90 to Vendor A", vendor_login(VA), "Reject"],
         "Vendor A's price stays 100 on the RFQ stage and in Master QCS.", role="Buyer, Vendor A", portal="Buyer + Vendor portal", priority="Medium")

# ── 22. Master QCS on each kind ────────────────────────────────────────────────────
M22 = "22. Master QCS — comparison and report"
for kind, ev, exp in [
    ("finished reverse auction", "a finished reverse auction with A 85, B 88", "A is rank 1 (lowest), B rank 2; the final auction bids are compared, not the first bids."),
    ("finished forward auction", "a finished forward auction with A 110, B 105", "A is rank 1 (highest offer), B rank 2."),
    ("Tech+RFQ project", "the Tech+RFQ project after both stages closed", "The comparison shows each vendor's technical result next to its commercial price; a technically rejected vendor is marked and cannot be awarded."),
    ("vendor-masked company", "a closed RFQ on a company with vendor masking", "Vendors are shown masked (e.g. Vendor 1, Vendor 2) until the masking ends; ranks and prices are correct."),
]:
    case("SRC-QCS", M22, "Comparison on each kind", f"Master QCS of a {kind}", [BUYER_LOGIN, open_event(ev), "Click the \"Master QCS\" tab"], exp, priority="High")

# ── 23. proposal form and approval chains ──────────────────────────────────────────
M23 = "23. Awarding — complete, partial, line-wise, approval"
prop = lambda *s: [BUYER_LOGIN, open_event("the closed RFQ (A 100, B 90)"), "Master QCS > Start Awarding, give all 10 to Vendor B, click \"Create Proposal\". The proposal page opens", *s]
for field in ["Requirement - Purpose of this item / Service", "Supply / Service Scope", "Procurement Type", "Recommended Supplier 1", "Recommended Supplier 1 Email", "Recommended Supplier 1 Contact Name"]:
    case("SRC-AWD", M23, "Proposal form", f"Submit the proposal with \"{field}\" empty",
         prop(f"Fill every required field except \"{field}\"", "Click \"Submit Proposal\""),
         f"Refused; \"{field}\" is highlighted as required (\"is a required field\") and the proposal is not submitted. (Fields come from the company's proposal form; on PROCOL DEMO these are required.)", ttype="Negative", priority="Medium")
for title, steps, exp, tt in [
    ("CAPEX procurement needs the IP number", ["Choose Procurement Type CAPEX", "Leave \"If CAPEX then provide Investment Proposal (IP) Number and Cost benefit analysis (CBA)\" empty", "Submit Proposal"], "Refused until the IP number / CBA is given (record if not enforced).", "Negative"),
    ("Repeat order needs the old PO reference", ["Answer Yes to \"Repeat Order / Old PO ref.\"", "Leave \"Old PO reference Number\" empty", "Submit Proposal"], "Refused until the old PO number is filled (record if not enforced).", "Negative"),
    ("Invalid supplier e-mail", ["Type \"abc\" in \"Recommended Supplier 1 Email\"", "Submit Proposal"], "Refused: \"Please enter a valid email\".", "Negative"),
    ("Proposal tabs", ["Click Document, Overview, Allocation Summary, Comparison Sheets, Participants, Order Allocation in turn"], "Each tab opens: Allocation Summary lists Vendor B with 10 items and the total; Comparison Sheets shows the Master QCS; Participants lists every invited vendor with \"Reason for not participating\" for non-bidders; Order Allocation shows the allocation.", "Positive"),
    ("Letter of Award", ["Submit and approve the proposal", "Open the proposal's Overview"], "\"Letter of Award\" and \"Letter of Award Status\" are shown for Vendor B.", "Positive"),
]:
    case("SRC-AWD", M23, "Proposal form", title, prop(*steps), exp, ttype=tt, priority="Medium")
for chain, steps, exp in [
    ("two approvers, both approve", ["Approver 1 approves with a remark", "Approver 2 approves with a remark"], "After approver 1 the proposal waits for approver 2; after approver 2 it is approved and the PO is created."),
    ("two approvers, the second rejects", ["Approver 1 approves", "Approver 2 rejects with a remark"], "The proposal is rejected; no PO; the buyer can award again."),
    ("two approvers, the first rejects", ["Approver 1 rejects with a remark"], "The proposal is rejected at once; approver 2 is never asked."),
]:
    case("SRC-AWD", M23, "Approval chains", f"Approval chain: {chain}",
         prop("Fill the form and Submit Proposal (the approval flow has two approvers in order)") + [f"Log in as each approver and act: {', then '.join(steps)}"], exp,
         role="Buyer, Approver 1, Approver 2", priority="High")

# ── 35. Notifications ─────────────────────────────────────────────────────────────
M35 = "35. E-mails the vendors receive"
for when, exp in [
    ("the event is published", "an invitation with the title, close time and link"),
    ("the buyer sends a reminder", "a reminder to submit (only vendors who have not bid)"),
    ("the submission time is extended", "a notice of the new end time"),
    ("the event is rescheduled", "a notice of the new start time"),
    ("a counter offer is sent", "the counter offer with a link to accept or reject"),
    ("its bid is rejected", "the rejection with the buyer's reason"),
    ("the event is withdrawn", "a withdrawal notice"),
    ("it is awarded / its PO is created", "the award (and PO) for the winning vendor only"),
]:
    case("SRC-MAIL", M35, "Vendor e-mails", f"Vendor e-mail when {when}", [BUYER_LOGIN, f"Make {when} happen on a test event (see its own test case)", "Open the QA mailboxes of the vendors concerned"],
         f"Each concerned vendor gets one e-mail: {exp}. No other vendor gets it and no mail goes to a real supplier.", role="Buyer, Vendors", portal="Buyer portal + QA mailboxes", priority="Medium")

# ── 36. Status badges ─────────────────────────────────────────────────────────────
M36 = "36. Status badges — how each state looks"
for state, ev, exp in [
    ("upcoming", "the upcoming RFQ", "the start date/time and no live countdown"),
    ("live", "the live RFQ (no bids)", "a green \"Live\" badge and a running countdown (e.g. 29m : 41s)"),
    ("evaluation", "the RFQ in evaluation", "the evaluation status with its own countdown"),
    ("closed", "the closed RFQ", "\"Closed\"; no countdown"),
    ("withdrawn", "the withdrawn event", "\"withdrawn\"; no countdown; actions removed"),
    ("approval in progress", "an event whose proposal waits for approval", "approval in progress; Start Awarding hidden"),
    ("awarded", "the awarded event with PO", "the awarded status and the PO link"),
]:
    case("SRC-STS", M36, "Badges", f"How a {state} event looks", [BUYER_LOGIN, open_event(ev), "Look at the stage header and the Events list row"], f"Both the stage header and the list row show {exp}, the same on both.", priority="Low")
