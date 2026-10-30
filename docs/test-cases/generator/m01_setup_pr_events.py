from common import *

# ═══════════════════════════ 0. Set-up: the events later cases use ═══════════════════════════
M0 = "0. Set-up: Events the other cases use"
SETUP = [
    ("Live RFQ, no bids", "A single-stage RFQ that is live with Vendors A and B invited and no bid yet",
     single_stage_rfq() + [invite_named(VA, VB), "Give the title \"QA_Platform Live RFQ\"", "Click the schedule chip in the footer, keep \"Start now\", pick \"24 Hrs\" under Duration and click \"Save Schedule\"", PUBLISH],
     "The project page opens with a green \"Live\" badge and a countdown. Later test cases call this \"the live RFQ (no bids)\"."),
    ("Live RFQ with two bids", "A live RFQ where Vendor A quoted 100 and Vendor B quoted 90",
     ["Repeat set-up case SRC-SET-001 with the title \"QA_Platform RFQ two bids\"", vendor_login(VA), "Open the event and quote 100 per unit, submit", vendor_login(VB), "Open the event and quote 90 per unit, submit"],
     "Responses shows two bids: Vendor A 100 (total 1,000) and Vendor B 90 (total 900). Later test cases call this \"the RFQ with two bids (A 100, B 90)\"."),
    ("RFQ in evaluation", "An RFQ whose bidding time is over and whose evaluation time is running",
     ["Create a single-stage RFQ like SRC-SET-001 but in the Schedule drawer pick Duration 15 Mins and Evaluation time 60 Mins", "Have Vendor A quote 100 and Vendor B quote 90 before the 15 minutes end", "Wait until the countdown ends"],
     "The stage badge changes from Live to the evaluation status and a new countdown for the evaluation time runs. Later test cases call this \"the RFQ in evaluation (A 100, B 90)\"."),
    ("Closed RFQ", "An RFQ whose bidding and evaluation are both over, not awarded",
     ["Create an RFQ with Duration 15 Mins and no evaluation time (click \"Clear\" under Evaluation time)", "Have Vendor A quote 100 and Vendor B quote 90", "Wait until the countdown ends"],
     "The stage shows \"Closed\". Later test cases call this \"the closed RFQ (A 100, B 90)\"."),
    ("Upcoming RFQ", "An RFQ scheduled to start tomorrow",
     single_stage_rfq() + [invite_named(VA), "Open the schedule drawer, click \"Start later\", pick tomorrow at 11:00 AM, Duration 1 hour, click \"Save Schedule\"", PUBLISH],
     "The project page shows the start time and the stage is not live yet. It is listed on the Live tab of Events with its future start time. Later test cases call this \"the upcoming RFQ\"."),
    ("Live reverse auction", "A single-stage reverse auction (buyer buying), tick size 1, Vendors A and B invited",
     single_stage_auction("reverse") + [invite_named(VA, VB), "Set the tick size to 1 in the auction configuration", SCHEDULE_30, PUBLISH],
     "The auction is live. Later test cases call this \"the live reverse auction\"."),
    ("Live forward auction", "A single-stage forward auction (buyer selling), tick size 1",
     single_stage_auction("forward") + [invite_named(VA, VB), "Set the tick size to 1", SCHEDULE_30, PUBLISH],
     "The auction is live. Later test cases call this \"the live forward auction\"."),
    ("eRFX technical + RFQ", "An eRFX project with a Technical stage and an RFQ stage, live",
     [OPEN_EVENTS, CLICK_CREATE, CHOOSE_ERFX, "Type the title \"QA_Platform Tech+RFQ\"", "Add \"Technical Stage\" from the \"+\" menu, delete \"Auction\", add \"RFQ\"", "On the Technical Stage tab choose a questionnaire template, fill the \"Vendor Assessment\" section and add an evaluator", "On the RFQ tab choose the RFQ template; add the product through \"Items\"", invite_named(VA, VB), "Schedule both stages on Duration (Technical 30 Mins, RFQ 60 Mins) and click \"Save Schedule\"", PUBLISH],
     "The project page shows the tabs Project Details, Technical Stage, RFQ and Master QCS. Later test cases call this \"the Tech+RFQ project\"."),
    ("eRFX draft", "An eRFX project saved as a draft",
     erfx_rfq(title="QA_Platform Draft Project") + ["Click \"Save as draft\" in the footer"],
     "A success message appears and the project is listed on the Drafts tab of Events. Later test cases call this \"the draft project\"."),
    ("Event from a material PR", "A single-stage RFQ created from an open material PR line",
     [OPEN_PR_LIST, "Tick one open line whose Item Type is Material", "Click \"Purchase Items\" and choose \"Start New Project\"", "Pick Single Stage, RFQ, the RFQ template", invite_named(VA, VB), SCHEDULE_30, PUBLISH],
     "The event is live and the PR line moved to In Progress. Later test cases call this \"the PR-based RFQ\"."),
    ("Awarded event with PO", "An RFQ awarded to Vendor B with the PO generated",
     ["Use the closed RFQ (A 100, B 90)", "Open Master QCS, click \"Start Awarding\", award the full quantity to Vendor B, create and submit the proposal", "Approve it with a remark (approver user) until the PO is created"],
     "The event is on the History tab and a PO exists for Vendor B. Later test cases call this \"the awarded event with PO\"."),
    ("Withdrawn event", "A live RFQ withdrawn by the buyer",
     ["Create a live RFQ like SRC-SET-001", OPEN_SETTINGS, "Click \"Withdraw\", type the reason \"QA test\" and confirm"],
     "\"Order withdrawn\" appears; the event moves to History with the status withdrawn. Later test cases call this \"the withdrawn event\"."),
    ("Service event from a service PR", "A single-stage RFQ created from an open service PR line (2 activities)",
     [OPEN_PR_LIST, "Tick one open Service line", "Click \"Purchase Items\" > \"Start New Project\", pick Single Stage, RFQ, the service RFQ template", invite_named(VA), SCHEDULE_30, PUBLISH],
     "The sheet shows the service with its activities as rows. Later test cases call this \"the service RFQ\"."),
]
for scen, title, steps, exp in SETUP:
    case("SRC-SET", M0, scen, title, [BUYER_LOGIN] + steps, exp, role="Buyer, Vendor A, Vendor B", portal="Buyer + Vendor portal",
         pre=PEOPLE_NOTE, data=f"Product {P1}, quantity 10, location {LOC1}.", priority="Critical")

# ═══════════════════════════ 1. Purchase Requisitions ═══════════════════════════════════════
M1 = "1. Purchase Requisition (PR) — finding, reading and choosing a PR"
pr = lambda *s: [BUYER_LOGIN, OPEN_PR_LIST, *s]

case("SRC-PR", M1, "PR list", "The PR list opens with its tabs and columns",
     pr("Look at the tabs at the top of the table and the numbers beside them", "Scroll the table to the right and read the column names"),
     "Tabs Open, In Progress, Completed, Rejected and Deleted are shown, each with a count. Every row shows the PR number (a link), the Item Type, the item, the PR age, and material or service details. No error or blank page.",
     priority="Critical")
case("SRC-PR", M1, "PR list", "Each tab shows only the PR lines in that state",
     pr("Click \"In Progress\", then \"Completed\", \"Rejected\", \"Deleted\" and back to \"Open\"", "On each tab count the rows on the first page and compare with the count on the tab"),
     "Open = not yet sourced, In Progress = in an event or PO, Completed = fully ordered or closed. The rows match the tab's count; the selected tab is highlighted.")
for how, typed, data, exp in [
    ("the PR number given to you", "the PR number you were given", "The PR number you were given (e.g. 0110000195)", "Only that PR's lines remain. Clicking the PR number opens the PR detail page with all its lines."),
    ("part of the PR number", "the first 6 digits of a PR number", "First 6 digits of a known PR number", "Every PR whose number contains those digits is listed."),
    ("a PR number that does not exist", "9999999999", "9999999999", "The table is empty with a \"no data\" picture. Clearing the search brings all rows back."),
    ("the item name", "the item name of an open line", "Item name of an open line", "Only the lines with that item are listed, across PRs."),
]:
    case("SRC-PR", M1, "Find a given PR", f"Search the PR list by {how}",
         pr("Click the search box above the table", f"Type {typed} and press Enter"), exp, data=data,
         ttype="Negative" if "not exist" in how else "Positive", priority="High" if "given" in how else "Medium")

# identification of the PR type
TYPES = {
    "Material": ("an \"M\"/Material item type, a material code, quantity and unit (e.g. 10 ST); Account Assignment Category empty (stock) or K (cost centre)", "a goods sheet: one row per material with quantity, unit and delivery location"),
    "Service": ("an \"S\"/Service item type, a service code, and activities listed under the service with their own quantities and units", "a service sheet: the service with its activities as rows; vendors quote a rate per activity"),
    "Asset": ("Account Assignment Category \"A\" (asset) with an asset number / capex details on the line", "a goods sheet like a material, with the asset (account assignment A) carried to the PO"),
}
for t, (looks, sheet) in TYPES.items():
    case("SRC-PR", M1, "Identify the PR type", f"Recognise a {t.lower()} PR line from its details",
         pr(f"Open the \"Open\" tab and find a line that should be a {t.lower()} line", "Click the PR number to open the PR, then click \"Details\" on the line", "Read Item Type, Material / Service code, Account Assignment Category and the quantities"),
         f"The line shows {looks}. This line will make {sheet}.", data=f"A {t.lower()} PR line", priority="Critical")
case("SRC-PR", M1, "Identify the PR type", "Show the Account Assignment Category column to tell assets apart in the list",
     pr("Click the column settings (manage columns) icon of the table", "Tick \"Account Assignment Category\" and close the panel", "Read the new column for a few lines"),
     "The column appears. Asset lines show \"A\"; cost-centre lines \"K\"; stock material lines are empty. The choice stays after a page refresh.", priority="Medium")
for t in TYPES:
    case("SRC-PR", M1, "Choose a PR when none is given", f"Pick a random open {t.lower()} line that can be sourced",
         pr(f"On the Open tab look for a {t.lower()} line (see the type cases above)", "Open the PR and check Qty Open equals Qty Requested and that the line has no lock or hold icon", "Write down the PR number, line number and item"),
         f"The chosen line is a {t.lower()} line, fully open, not dormant-locked, not on hold and not under approval, so it can be ticked and purchased in the next cases.",
         priority="High")

# blocked selections — rules from purchaseRequisitions.jsx getPurchaseCartTooltipContent and backend
BLOCK = [
    ("a dormant-locked PR line", "A PR older than the dormant limit (lock icon)", "Purchase Items stays disabled; hovering it shows \"Dormant locked PR cannot be purchased\". The line can be sourced only after \"Unlock\" / \"Request to unlock\" (\"Unlock request sent successfully\").", "Negative"),
    ("a line whose PR is waiting for approval or was sent back", "A PR in approval in progress / send-back pending", "Purchase Items stays disabled with \"Rejected or Send Back Pending PR cannot be purchased\".", "Negative"),
    ("a rejected PR line", "A line on the Rejected tab", "Rejected lines cannot be ticked for purchase (\"Rejected or Send Back Pending PR cannot be purchased\").", "Negative"),
    ("a line on hold", "A line put on hold with a remark", "The held line cannot be purchased until it is released; releasing needs a remark (\"Please fill the remarks to continue!\" if empty).", "Negative"),
    ("two BOQ-based PRs together", "Two BOQ PRs", "Purchase Items is disabled with \"Multiple BOQ-based PR cannot be purchased together\".", "Negative"),
    ("a BOQ-based PR with a material PR", "One BOQ PR and one material PR", "Purchase Items is disabled with \"BOQ-based PR cannot pe purchased along with Material PR\" (note the app's own spelling \"pe\").", "Negative"),
    ("a BOQ-based PR with a service PR", "One BOQ PR and one service PR", "Purchase Items is disabled with \"BOQ-based PR cannot pe purchased along with Service PR\".", "Negative"),
    ("a service line and a material line together (service grouping ON)", "Company with service activities grouped in RFP", "Purchase Items is disabled with \"Services and Materials cannot be purchased together\".", "Negative"),
    ("a service line and a material line together (service grouping OFF)", "Company without service grouping", "Record what happens: the app does not block it on the PR screen in this configuration; check which sheet the event opens with and whether both lines arrive.", "Edge"),
]
for what, data, exp, tt in BLOCK:
    case("SRC-PR", M1, "Lines that cannot be purchased", f"Try to purchase {what}",
         pr(f"Tick {what}", "Move the mouse over \"Purchase Items\" and read the message", "Try to click it"),
         exp, data=data, ttype=tt, priority="High")

# Purchase Items menu
for opt, exp, tt in [
    ("Start New Project", "The event type chooser opens (Single Stage / eRFX Project) with the ticked lines carried as rows.", "Positive"),
    ("Add to Draft Project", "A list of your draft projects opens; picking one adds the lines to it. This option is shown only when no service line is ticked.", "Positive"),
    ("Purchase Contract", "The Purchase Contract drawer opens to order against a contract. Lines without a contract show \"Items not eligible for purchase contract\".", "Positive"),
]:
    case("SRC-PR", M1, "Purchase Items menu", f"Purchase Items → {opt}",
         pr("Tick one open material line", f"Click \"Purchase Items\" and choose \"{opt}\""), exp, ttype=tt, priority="High")
case("SRC-PR", M1, "Purchase Items menu", "\"Add to Draft Project\" is not offered when a service line is ticked",
     pr("Tick one open service line", "Click \"Purchase Items\""),
     "Only \"Start New Project\" (and Purchase Contract if enabled) is offered; \"Add to Draft Project\" is missing for service lines.", ttype="Negative", priority="Medium")
case("SRC-PR", M1, "Purchase Items menu", "Purchase Items is disabled when nothing is ticked",
     pr("Untick every line", "Move the mouse over \"Purchase Items\""), "The button is greyed out and nothing opens.", ttype="Negative", priority="Medium")

# quantity rules (backend 558/559/581/860)
for qdesc, exp, tt in [
    ("the full open quantity (10 of 10)", "Accepted. After publish the line shows Qty In Progress 10 and Qty Open 0.", "Positive"),
    ("part of the open quantity (6 of 10)", "Accepted. After publish the line shows 6 in progress and 4 still open; the 4 can be sourced in another event.", "Positive"),
    ("more than the open quantity (12 of 10)", "Refused with \"Quantity should be less than open quantity\". Nothing is published.", "Negative"),
    ("a quantity in a different unit than the PR", "Refused with \"Quantity should be in same unit as requested\".", "Negative"),
]:
    case("SRC-PR", M1, "PR quantity in the event", f"Use {qdesc} of a PR line in the event",
         pr("Tick an open material line with Qty Open 10", "Purchase Items > Start New Project > Single Stage > RFQ > template", f"In the sheet set the quantity to {qdesc.split('(')[-1].rstrip(')') if '(' in qdesc else 'the other unit'}", invite_named(VA), SCHEDULE_30, PUBLISH),
         exp, data="PR line with Qty Open 10", ttype=tt, priority="Critical" if tt == "Positive" else "High")
case("SRC-PR", M1, "PR quantity in the event", "A line already in progress for its whole quantity cannot be sourced again",
     pr("Open the In Progress tab and tick the line used in \"the PR-based RFQ\"", "Try Purchase Items > Start New Project and publish"),
     "Refused with \"This Line item is already in Progress for some quantity\" (or the line cannot be ticked).", pre="Set-up case SRC-SET-010 done.", ttype="Negative")

# PR → event, one case per PR type and event kind (each opens a different sheet)
DEST = [
    ("Single Stage RFQ", ["Choose \"Single Stage\"", "Under Event Type click \"RFQ\" and choose the RFQ template"], "an RFQ price sheet"),
    ("Single Stage RFP", ["Choose \"Single Stage\"", "Keep Event Type \"RFP\" and choose a questionnaire template"], "an RFP questionnaire (no price column)"),
    ("Single Stage reverse auction", ["Choose \"Single Stage\"", "Under Event Type click \"Auction\" and choose a reverse auction template"], "an auction sheet with the auction configuration"),
    ("eRFX project, Technical + RFQ", ["Choose \"eRFX Project\"", "Make the stages Technical Stage + RFQ and choose a template on each"], "a project with the lines in \"Items\" for both stages"),
    ("eRFX project, Auction only", ["Choose \"eRFX Project\"", "Keep the default Auction stage and choose an auction template"], "a project with one auction stage"),
]
for t in TYPES:
    for dest, dsteps, sheet in DEST:
        svc = t == "Service"
        exp = (f"The create screen opens as {sheet}. The PR line arrives with its item, quantity, unit and delivery location filled and locked to the PR. "
               + ("The service shows its activities as rows and the price column becomes a rate per activity. " if svc else "")
               + ("The asset line keeps Account Assignment A, which is carried to the PO. " if t == "Asset" else "")
               + "After publishing, the PR line moves to In Progress with this event's number, and the event shows that it came from a PR. Recreate Order will be greyed out on it (events made from a PR cannot be recreated).")
        case("SRC-PR", M1, f"{t} PR → event", f"Create a {dest} from an open {t.lower()} PR line",
             pr(f"Tick one open {t.lower()} line", "Click \"Purchase Items\" > \"Start New Project\"", *dsteps, invite_named(VA, VB), SCHEDULE_30, PUBLISH),
             exp, role="Buyer", data=f"An open {t.lower()} PR line", priority="Critical" if dest.startswith("Single Stage RFQ") else "High")
for combo, exp in [
    ("two material lines of the same PR", "Both lines arrive as two rows of one event, each with its own quantity and location."),
    ("two material lines of two different PRs", "Both lines arrive as two rows; after publish both PRs show the same event number on their lines."),
    ("two service lines", "Both services arrive with their activities; vendors quote each activity."),
    ("one asset line and one material line", "Both arrive as goods rows; the asset row keeps Account Assignment A."),
]:
    case("SRC-PR", M1, "Several PR lines in one event", f"Source {combo} in one event",
         pr(f"Tick {combo}", "Purchase Items > Start New Project > Single Stage > RFQ > template", invite_named(VA), SCHEDULE_30, PUBLISH), exp, priority="High")
case("SRC-PR", M1, "After sourcing", "The PR line comes back to Open when the event is withdrawn",
     [BUYER_LOGIN, open_event("the PR-based RFQ"), OPEN_SETTINGS, "Click \"Withdraw\", type the reason \"QA test\" and confirm", OPEN_PR_LIST, "Search the PR number on the Open tab"],
     "\"Order withdrawn\" appears. The PR line is back on Open with its full quantity open again.", pre="Set-up case SRC-SET-010 done.")
case("SRC-PR", M1, "After sourcing", "An event whose PR items were short-closed cannot be withdrawn",
     [BUYER_LOGIN, "Short-close the PR line used in the PR-based RFQ (PR > line > short close, with a reason)", open_event("the PR-based RFQ"), OPEN_SETTINGS, "Click \"Withdraw\", type a reason and confirm"],
     "Refused with \"Cannot withdraw event with short closed purchase request items\". The event stays as it was.", ttype="Negative", priority="Medium")
case("SRC-PR", M1, "After sourcing", "The PR line shows Ordered after the award's PO is created",
     [BUYER_LOGIN, OPEN_PR_LIST, "Search the PR number used in an awarded PR-based event", "Open the line details"],
     "The line moves to Completed (or shows the ordered quantity) with the PO number linked.", pre="A PR-based event awarded and its PO generated.")

# ═══════════════════════════ 2. Events list and finding an existing event ════════════════════
M2 = "2. Events list — finding the right existing event"
ev = lambda *s: [BUYER_LOGIN, OPEN_EVENTS, *s]
case("SRC-EVL", M2, "Events list", "The Events page shows its tabs, search and Create Event",
     ev("Read the tabs and the numbers beside them", "Look at the controls above the list"),
     "Tabs Live, History, Drafts and Recurring with counts; \"Search Title\"; date filters \"Starting from\" / \"Ending at\"; the \"Create Event\" button; \"Export\" on History.", priority="Critical")
STATE_TAB = [
    ("a live event (bidding on now)", "Live", "a green Live status and the time left"),
    ("an upcoming event (starts later)", "Live", "its future start time; it is not yet open for bids"),
    ("an event in evaluation time", "Live", "the evaluation status with its own countdown"),
    ("a draft event or project", "Drafts", "a Draft badge; opening it reopens the create screen with everything saved"),
    ("a closed event without award", "History", "Closed"),
    ("an awarded event whose PO is created", "History", "the awarded status; its PO number can be opened"),
    ("a withdrawn event", "History", "withdrawn"),
    ("a recurring event", "Recurring", "its repeat pattern"),
]
for what, tab, shows in STATE_TAB:
    case("SRC-EVL", M2, "Where an event is listed", f"Find {what} — it is on the {tab} tab",
         ev(f"Click the \"{tab}\" tab", f"Type the event's title in \"Search Title\""),
         f"The event is listed on {tab} and shows {shows}. It is not listed on any other tab.", priority="High")
case("SRC-EVL", M2, "Where an event is listed", "An event moves from Live to History when its PO is created",
     ev("Search the event on Live before awarding (it is there)", "Award it, approve the proposal and let the PO be created", "Search it on Live again, then on History"),
     "Before: on Live. After the PO: gone from Live and listed on History with the awarded status.", priority="Critical")
case("SRC-EVL", M2, "Where an event is listed", "A draft moves to Live when it is published",
     ev("Open the draft project from Drafts", "Finish it (participants, schedule) and publish", "Look at Drafts and Live"),
     "The draft disappears from Drafts and appears on Live with the same title.", pre="Set-up case SRC-SET-009 done.")
for need, state, why in [
    ("test awarding", "an event in evaluation or closed, with at least one vendor bid and no award yet", "Start Awarding is only possible after bidding ends and needs a bid"),
    ("test a counter offer", "a live or in-evaluation event with a bid the vendor placed itself (not a surrogate bid)", "a counter offer cannot be sent on a bid the buyer added (\"You cannot send counter offer for bids added by you.\")"),
    ("test Extend Submission Time", "a live event", "the option is greyed out once the event is closed and not offered on drafts"),
    ("test Reschedule Event", "an upcoming event", "Reschedule is offered only before the event starts"),
    ("test Edit Evaluation Time", "an event in evaluation time", "the option is greyed out on a closed event"),
    ("test Reject Bid", "an event in evaluation time with a bid", "rejection is disabled while bidding is in progress"),
    ("test a vendor's bid revision", "a live event where the vendor already bid", "revisions are only possible while bidding is on"),
    ("test Recreate Order", "a closed RFQ or auction that was not made from a PR", "Recreate Order is greyed out on events made from a PR"),
    ("test PO and History", "the awarded event with PO", "only an event with a generated PO is in History as awarded"),
]:
    case("SRC-EVL", M2, "Pick an existing event that fits the test", f"Choose an existing event to {need}",
         ev("Decide which state the test needs", f"Pick {state}: use the tabs and Search Title, open the event and check its status badge and bids", "Note the event title and RFX number in Test Data"),
         f"The event chosen is {state}, because {why}. An event in any other state is not used for this test.", priority="High")
case("SRC-EVL", M2, "Search", "Search a title that does not exist", ev("Type \"zzz-no-such-event\" in Search Title"),
     "The list is empty with a no-data message. Clearing the search brings the events back.", ttype="Negative", priority="Low")
case("SRC-EVL", M2, "Search", "Filter events by start and end date", ev("Click the History tab", "Pick a \"Starting from\" date and an \"Ending at\" date a week apart"),
     "Only events inside that range are listed; clearing the dates shows all again.", priority="Medium")
case("SRC-EVL", M2, "Export", "Export the History list", ev("Click the History tab", "Click \"Export\""),
     "A file downloads listing the History events with their titles, numbers and statuses as on screen.", priority="Medium")
