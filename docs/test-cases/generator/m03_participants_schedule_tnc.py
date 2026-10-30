from common import *

# ═══════════════════════════ 6. Participants ═════════════════════════════════════════════
M6 = "6. Participants — inviting vendors"
KINDS = [("single stage RFQ", lambda: [BUYER_LOGIN] + single_stage_rfq()), ("eRFX RFQ project", lambda: [BUYER_LOGIN] + erfx_rfq())]
WAYS = [
    ("every vendor mapped to the product (Invite Vendor)", [INVITE_MAPPED],
     "All vendors mapped to the product are added as participants and the \"Invite N more…\" strip disappears. Use this when the test case names no vendor."),
    ("one named vendor by search", [invite_named(VA)],
     "Only Vendor A is a participant. Use this whenever the test case names a vendor."),
    ("two named vendors by search", [invite_named(VA, VB)], "Vendors A and B are participants; nobody else."),
    ("mapped vendors plus one named vendor", [INVITE_MAPPED, invite_named(VC)], "The mapped vendors and Vendor C are participants; Vendor C is not added twice if it was already mapped."),
]
for kname, build in KINDS:
    for wname, wsteps, exp in WAYS:
        case("SRC-PAR", M6, f"Invite — {kname}", f"{cap(kname)}: invite {wname}",
             build() + wsteps + ["Read the participant list under Participants", SCHEDULE_30, PUBLISH, "Open the stage's \"Participants\" tab"],
             exp + " After publishing, the stage's Participants tab lists exactly these vendors and each gets the invitation (QA mailboxes).", priority="Critical" if "mapped" in wname and "plus" not in wname else "High")
for kname, build in KINDS:
    case("SRC-PAR", M6, f"Invite — {kname}", f"{cap(kname)}: publish with no participant",
         build() + [SCHEDULE_30, "Do not add any vendor and click Publish"],
         "Refused: \"Please add participants to proceed!\" Nothing is published.", ttype="Negative", priority="Critical")
for what, steps, exp, tt in [
    ("Search a vendor that does not exist", ["Type \"zzz-no-vendor\" in \"Search vendors you want to add\""], "No vendor is offered; nothing is added.", "Negative"),
    ("Search a vendor that is not mapped to the product", [invite_named(VC) + " (Vendor C is not mapped to the product)"], "Vendor C can still be added by search; mapping only decides who \"Invite Vendor\" adds.", "Positive"),
    ("Remove a participant before publishing", [invite_named(VA, VB), "Click the cross on Vendor B's chip"], "Only Vendor A remains.", "Positive"),
    ("Invite a new vendor by e-mail with a bad address", ["Choose to invite a new vendor, type the e-mail \"abc@\" and a name"], "Refused: \"Please enter a valid email\".", "Negative"),
    ("Invite a new vendor with an empty name", ["Choose to invite a new vendor, type a valid QA e-mail, leave the name empty"], "Refused: \"Please enter a valid name\".", "Negative"),
    ("Invite a new vendor with a bad phone number", ["Type the phone number \"12ab\""], "Refused: \"Please enter a valid phone number\".", "Negative"),
    ("Filter participants by city after publish", ["Publish with mapped vendors", "On the stage's Participants tab use \"Filter by city\""], "Only vendors from that city are listed; clearing the filter shows all.", "Positive"),
    ("Search inside the participant list after publish", ["On the Participants tab type Vendor A's name in \"Search vendors\""], "Only Vendor A is listed.", "Positive"),
    ("Add a vendor after the event is live", ["Open the live RFQ's Participants/participant management, add Vendor C and save"], "Vendor C is added and invited; it can bid while the event is live.", "Positive"),
    ("Save the audience without any change", ["Open the participant management of the live RFQ and save without changes"], "\"No change in Audience\" — nothing is sent.", "Negative"),
]:
    case("SRC-PAR", M6, "Participant rules", what, [BUYER_LOGIN] + single_stage_rfq() + steps, exp, ttype=tt, priority="High" if tt == "Negative" else "Medium")
case("SRC-PAR", M6, "Vendor side", "An invited vendor sees the event; an uninvited one does not",
     [vendor_login(VA), "Look for the event in the Live list", vendor_login(VC), "Look for the same event"],
     "Vendor A sees it and can open it. Vendor C (not invited) does not see it; opening its link shows not-authorised.", role="Vendor A, Vendor C", portal="Vendor portal",
     pre="The live RFQ (no bids) with Vendors A and B invited.", priority="Critical")
case("SRC-PAR", M6, "Reminders", "Send Reminders reaches only vendors who have not bid",
     [BUYER_LOGIN, open_event("the live RFQ where only Vendor A has bid"), OPEN_DOTS, "Click \"Send Reminders\" and confirm"],
     "Vendor B (no bid) gets a reminder mail; Vendor A (already bid) does not. A failure shows \"Failed to send reminder\".", priority="Medium")

# ═══════════════════════════ 7. Schedule ═════════════════════════════════════════════════
M7 = "7. Schedule — start, end and evaluation time"
sch = lambda *s: [BUYER_LOGIN] + single_stage_rfq() + [invite_named(VA), "Click the schedule chip in the footer. The \"Schedule Event\" drawer opens", *s]
for dur, mins in [("15 Mins", 15), ("30 Mins", 30), ("60 Mins", 60), ("4 Hrs", 240), ("24 Hrs", 1440)]:
    case("SRC-SCH", M7, "Duration", f"Start now, end after {dur}",
         sch("Keep \"Start now\"", f"Under Duration click \"{dur}\"", "Read the line \"Event will end at …\" and write it down", "Click \"Save Schedule\"", PUBLISH),
         f"The footer chip shows \"Now - <time> ( {dur} )\". After publishing, \"Bidding Ends At\" on Project Details is the start time plus {mins} minutes, the same as the line you wrote down, and the countdown matches.",
         priority="High" if mins == 30 else "Medium")
for what, steps, exp, tt in [
    ("Custom duration of 2 hours", ["Under Duration choose \"Custom\" and type 2 hours", "Save Schedule", PUBLISH], "Bidding ends 2 hours after the start.", "Positive"),
    ("Custom duration left empty", ["Choose \"Custom\" and leave it empty", "Save Schedule"], "Refused: \"Please enter valid time\" / \"Please choose event end time\".", "Negative"),
    ("Start later tomorrow 11:00 AM", ["Click \"Start later\"", "Pick tomorrow's date and 11:00 AM", "Duration 1 hour, Save Schedule", PUBLISH], "The event is upcoming: it shows the start time, vendors cannot bid until 11:00 AM, and Settings offers \"Reschedule Event\".", "Positive"),
    ("Start later with a time already passed", ["Click \"Start later\", pick today with a time 1 hour ago", "Save Schedule"], "Refused with a time error (\"Please enter a valid time\"); the past time cannot be saved.", "Negative"),
    ("Start later with no date", ["Click \"Start later\" and leave the date empty", "Save Schedule"], "Refused; the date field is marked required.", "Negative"),
    ("Close the drawer without Save Schedule", ["Pick 60 Mins but click \"Back\" instead of Save Schedule", PUBLISH], "The 60 minutes are not kept (the footer chip shows the default 30 Mins until Save Schedule is pressed); the event publishes with the default window. Always press Save Schedule.", "Edge"),
    ("Evaluation time 30 minutes", ["Duration 15 Mins", "Under Evaluation time choose 30 minutes", "Save Schedule", PUBLISH], "After bidding ends the event enters evaluation for 30 minutes (status changes and a new countdown runs); counter offers and Reject Bid work in that window.", "Positive"),
    ("Evaluation time cleared", ["Duration 15 Mins", "Click \"Clear\" under Evaluation time", "Save Schedule", PUBLISH], "No evaluation window: the event closes as soon as bidding ends.", "Positive"),
    ("Serial bidding without evaluation time", ["Choose a serial bidding event", "Clear the evaluation time", "Save Schedule"], "Refused: \"Evaluation time is required for serial bidding event\".", "Negative"),
    ("Delivery date required by the template", ["Use a template that needs a delivery date", "Leave Delivery Date empty", PUBLISH], "Refused: \"Please add delivery date\" / \"Please enter a delivery date\".", "Negative"),
]:
    case("SRC-SCH", M7, "Schedule rules", what, sch(*steps), exp, ttype=tt, priority="High" if tt != "Edge" else "Medium")
for tech, rfq, exp, tt in [
    (30, 60, "Publishes; the technical stage ends first and the RFQ runs to its own end.", "Positive"),
    (60, 60, "Publishes; both stages end together (record whether equal end is allowed).", "Edge"),
    (90, 60, "Refused: \"RFP duration exceeds RFQ end time. Please adjust.\"", "Negative"),
]:
    case("SRC-SCH", M7, "Two-stage schedule", f"Technical stage {tech} Mins with RFQ {rfq} Mins",
         [BUYER_LOGIN, OPEN_EVENTS, CLICK_CREATE, CHOOSE_ERFX, "Make Technical + RFQ, templates, Vendor Assessment, evaluator, 1 item", invite_named(VA),
          "Open the schedule drawer: it has one block per stage (\"1. Technical Stage\", \"2. RFQ\")", f"Set block 1 Duration {tech} Mins and block 2 Duration {rfq} Mins (scroll down to see block 2); keep both on Duration", "Read each block's \"Event will end at …\"", "Save Schedule and publish"],
         exp, ttype=tt, priority="High")
case("SRC-SCH", M7, "Two-stage schedule", "A fixed end time on one stage with Duration on the other",
     [BUYER_LOGIN, OPEN_EVENTS, CLICK_CREATE, CHOOSE_ERFX, "Make Technical + RFQ, fill everything", "Set the Technical block to a fixed end time and the RFQ block to Duration 60", "Save and publish"],
     "Known defect area: the publish check compares a time with a duration and may refuse wrongly. Record the message; keep both blocks on Duration in other tests.", ttype="Edge", priority="Medium")

# ═══════════════════════════ 8. Terms & Conditions ═══════════════════════════════════════
M8 = "8. Terms & Conditions — event-wise and stage-wise, mandatory and optional"
WHERE = [
    ("single stage RFQ", lambda: [BUYER_LOGIN] + single_stage_rfq(), "Click \"Terms & Conditions\" in the footer"),
    ("single stage RFP", lambda: [BUYER_LOGIN, OPEN_EVENTS, CLICK_CREATE, CHOOSE_SINGLE, "Keep RFP and choose a questionnaire template"], "Click \"Terms & Conditions\" in the footer"),
    ("single stage reverse auction", lambda: [BUYER_LOGIN] + single_stage_auction("reverse"), "Click \"Terms & Conditions\" in the footer"),
    ("eRFX project level (all stages)", lambda: [BUYER_LOGIN] + erfx_rfq(), "Click \"Add T&Cs\" in the project toolbar"),
    ("eRFX Technical stage only", lambda: [BUYER_LOGIN, OPEN_EVENTS, CLICK_CREATE, CHOOSE_ERFX, "Make Technical + RFQ with templates and an item"], "Open the Technical Stage tab and click \"Terms & Conditions\"; under \"Adding terms and conditions for:\" pick the Technical stage (\"Event 1 : …\")"),
    ("eRFX RFQ stage only", lambda: [BUYER_LOGIN, OPEN_EVENTS, CLICK_CREATE, CHOOSE_ERFX, "Make Technical + RFQ with templates and an item"], "Open the RFQ tab and click \"Terms & Conditions\"; under \"Adding terms and conditions for:\" pick the RFQ stage (\"Event 2 : …\")"),
    ("eRFX Auction stage", lambda: [BUYER_LOGIN] + [OPEN_EVENTS, CLICK_CREATE, CHOOSE_ERFX, "Keep the Auction stage, choose an auction template, add an item"], "On the Auction tab click \"Terms & Conditions\""),
]
MODES_TNC = [
    ("no clause mandatory", "Add two clauses \"Payment within 45 days\" and \"Delivery within 7 days\"; leave each clause's mode on \"None\" and leave \"Mark all Terms & Conditions mandatory\" unticked"),
    ("one clause Required", "Add the two clauses; set \"Payment within 45 days\" to \"Required\" and leave \"Delivery within 7 days\" on \"None\""),
    ("Mark all mandatory", "Add the two clauses and tick \"Mark all Terms & Conditions mandatory\" (each clause then shows \"Overridden by Mark all mandatory\")"),
]
VACT = {
    "no clause mandatory": [("accepts nothing", "The bid is submitted. The buyer sees the bid; the two optional clauses show as not accepted but nothing is blocked.", "Positive"),
                            ("accepts both clauses", "The bid is submitted and both clauses show as accepted on the buyer side.", "Positive")],
    "one clause Required": [("accepts only the optional clause", "Submit is blocked: \"Payment within 45 days\" is highlighted as required and the bid is not sent. Ticking it lets Submit go through.", "Negative"),
                            ("accepts only the Required clause", "The bid is submitted; the optional delivery clause shows not accepted and blocks nothing.", "Positive"),
                            ("accepts both clauses", "The bid is submitted with both clauses accepted.", "Positive")],
    "Mark all mandatory": [("accepts one of the two clauses", "Submit is blocked until both clauses are accepted (all are mandatory).", "Negative"),
                           ("accepts both clauses", "The bid is submitted. The buyer's event page says \"Vendors who have placed the bid, have accepted the Terms and Conditions.\"", "Positive")],
}
for wname, build, open_tnc in WHERE:
    for mname, mstep in MODES_TNC:
        for act, exp, tt in VACT[mname]:
            stage_note = ""
            if "Technical stage only" in wname:
                stage_note = " The clauses apply to the Technical stage only: on the RFQ stage the vendor is not asked for them."
            elif "RFQ stage only" in wname:
                stage_note = " The clauses apply to the RFQ stage only: the Technical stage response does not ask for them."
            elif "project level" in wname:
                stage_note = " Project-level clauses are asked on every stage of the project."
            case("SRC-TNC", M8, f"T&C on {wname} — {mname}", f"{cap(wname)}, {mname}: the vendor {act}",
                 build() + [open_tnc, mstep, "Click \"Done\"", invite_named(VA), SCHEDULE_30, PUBLISH, vendor_login(VA), "Open the event and read the Terms & Conditions block",
                            f"The vendor {act}, quotes 100 for every line (or answers the questionnaire) and clicks Submit"],
                 exp + stage_note, role="Buyer, Vendor A", portal="Buyer + Vendor portal",
                 data="Clauses: \"Payment within 45 days\", \"Delivery within 7 days\"", ttype=tt,
                 priority="Critical" if tt == "Negative" else "High")
BUYER_TNC = [
    ("Default terms are shown when the modal opens", ["Click \"Terms & Conditions\""], "The modal shows \"Default Terms\" (the company's standard clauses) under \"Current Event Terms\"; \"No terms and conditions added.\" if the company has none."),
    ("Edit the default terms for this event only", ["Click \"Terms & Conditions\"", "Click \"Edit event specific T&Cs\", change one clause, Done"], "The change applies to this event only; the next new event shows the original default terms."),
    ("Reset to Default", ["Edit a clause", "Click \"Reset to Default\""], "The clauses go back to the company defaults."),
    ("Re-use terms from a recent event", ["Look at \"Recent Event Terms\" in the modal and pick one"], "The picked event's clauses are copied into this event."),
    ("Add your own clause", ["Type \"QA clause\" in \"Add your own terms & conditions\" and add it, Done"], "The clause is listed and the vendor will see it."),
    ("Attach a T&C document", ["Click \"Upload\" in the modal and attach terms.pdf, Done", invite_named(VA), SCHEDULE_30, PUBLISH], "The file is listed with Download on Project Details; the vendor can download it."),
    ("T&C attachment is not offered on a basket auction", ["Use a basket auction template and open Terms & Conditions"], "There is no Upload in the modal for a basket auction."),
    ("Cancel discards changes", ["Add a clause, click \"Cancel\"", "Open Terms & Conditions again"], "The clause is not there."),
    ("Terms & Conditions is greyed out before a template", ["Before choosing a template look at the footer"], "\"Terms & Conditions\" is disabled until a template is chosen."),
    ("Payment terms are mandatory for the company", ["On a company with payment T&C enforced, remove the payment clause", invite_named(VA), SCHEDULE_30, PUBLISH], "Refused: \"Payment Terms and Conditions are mandatory\"."),
    ("No terms at all", ["Remove every clause, Done", invite_named(VA), SCHEDULE_30, PUBLISH], "Publishes; the project page warns \"Terms and conditions are not added\"; the vendor sees no T&C block."),
    ("T&C are read-only after publish", ["Publish with two clauses", "On the project page open Terms & Conditions"], "The modal title is \"Terms & Conditions\" (not \"Edit…\"); nothing can be changed or added."),
    ("Mandatory T&C notice on the event page", ["Publish with \"Mark all Terms & Conditions mandatory\" ticked", "Open the stage page after a vendor bids"], "The event shows \"Vendors who have placed the bid, have accepted the Terms and Conditions.\""),
]
for title, steps, exp in BUYER_TNC:
    neg = any(k in title for k in ["not offered", "greyed", "mandatory for", "Cancel", "read-only"])
    case("SRC-TNC", M8, "Buyer — T&C modal", title, [BUYER_LOGIN] + single_stage_rfq() + steps, exp, ttype="Negative" if neg else "Positive",
         priority="High" if neg else "Medium")
case("SRC-TNC", M8, "Recreate and T&C", "Recreate Order keeps the mandatory T&C setting",
     [BUYER_LOGIN, open_event("a closed RFQ published with all T&C mandatory"), OPEN_SETTINGS, "Click \"Recreate Order\", keep everything, click \"Create Order\"", vendor_login(VA), "Open the new event and try to submit without ticking the clauses"],
     "The new event carries the same clauses and they are still mandatory: the vendor cannot submit without accepting them.", role="Buyer, Vendor A", portal="Buyer + Vendor portal", priority="Medium")

# ═══════════════════════════ 9. Publish ════════════════════════════════════════════════
M9 = "9. Publish — what must be filled, and what the vendor gets"
case("SRC-PUB", M9, "Publish", "Publish a complete single stage RFQ",
     [BUYER_LOGIN] + single_stage_rfq() + [invite_named(VA, VB), SCHEDULE_30, PUBLISH],
     "The project page opens: title, RFX number with a copy icon, tabs Project Details / RFQ / Master QCS, a Live badge and countdown. Project Details lists the stage code (RFQ-xxxx), Participants 0/2, Bidding Starts At and Bidding Ends At. Vendors A and B are invited.", priority="Critical")
case("SRC-PUB", M9, "Publish", "Publish a complete eRFX Technical + RFQ project",
     [BUYER_LOGIN, OPEN_EVENTS, CLICK_CREATE, CHOOSE_ERFX, "Title, Technical + RFQ, templates, Vendor Assessment, evaluator, 1 item", invite_named(VA, VB), "Schedule both blocks on Duration, Save Schedule", PUBLISH, "Fill \"Addendum Remarks\" only if asked"],
     "The project page shows Project Details, Technical Stage, RFQ and Master QCS. Under Published Stages both stage codes appear with their own start/end times.", priority="Critical")
for missing, exp in [
    ("the project title (eRFX)", "\"Please fill project title!\""),
    ("the end time (schedule never saved on a template that needs one)", "\"Please add end time for the event\""),
    ("the closing mode", "\"Please select closing on mode for the event\""),
    ("the savings configuration on a template that needs it", "\"Savings configuration is mandatory\""),
    ("correct values in validation columns", "\"Please fill correct values in the validation columns\""),
]:
    case("SRC-PUB", M9, "Publish refused", f"Publish without {missing}",
         [BUYER_LOGIN] + erfx_rfq() + [invite_named(VA), f"Leave {missing} missing", "Click Publish"],
         f"Refused: {exp}. Nothing is published and the Events list is unchanged.", ttype="Negative", priority="High")
case("SRC-PUB", M9, "Publish", "Double-click Publish",
     [BUYER_LOGIN] + single_stage_rfq() + [invite_named(VA), SCHEDULE_30, "Click Publish Event twice quickly and confirm"],
     "Only one event is created (search the title in Events: one result).", ttype="Edge", priority="Medium")
case("SRC-PUB", M9, "Vendor notification", "Each invited vendor receives the invitation",
     [BUYER_LOGIN, "Publish an RFQ inviting Vendors A and B", "Open the QA mailboxes of Vendors A and B"],
     "Each has one invitation with the title, close time and a link; the link opens the event on the vendor portal.", role="Buyer, Vendor A, Vendor B", portal="Buyer + Vendor portal", priority="Medium")
