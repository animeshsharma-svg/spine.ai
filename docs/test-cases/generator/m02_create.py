from common import *

# ═══════════════════════════ 3. Create event — single stage screen ═══════════════════════════
M3 = "3. Create event — Single Stage screen, event type, template and product sheet"
ss = lambda *s: [BUYER_LOGIN, OPEN_EVENTS, CLICK_CREATE, CHOOSE_SINGLE, *s]

case("SRC-CRE", M3, "Create Event pop-up", "Create Event offers Single Stage and eRFX Project",
     [BUYER_LOGIN, OPEN_EVENTS, CLICK_CREATE],
     "A pop-up offers \"Single Stage — Source through RFP / RFQ / Auction\" and \"eRFX Project — Manage sourcing via a project approach\" (and \"BOQ Project\" only for companies with BOQ). Clicking outside closes it without creating anything.", priority="Critical")
case("SRC-CRE", M3, "Create Event pop-up", "A company without eRFX sees only Single Stage",
     [BUYER_LOGIN, OPEN_EVENTS, CLICK_CREATE], "Only Single Stage is offered (or the single stage screen opens straight away).", pre="Company with eRFX switched off.", priority="Medium")
case("SRC-CRE", M3, "Single Stage screen", "The single stage screen opens on RFP with everything locked until a template is chosen",
     ss("Look at the Event Type buttons, the title box, the participants box and the footer buttons"),
     "Event Type shows RFP selected. \"Terms & Conditions\", the schedule chip and \"Publish Event\" are greyed out, and \"Search vendors you want to add\" is disabled, until a template is chosen. There is no \"Save as draft\" button on the single stage screen (drafts are an eRFX project feature).", priority="Critical")
for et, lists in [("RFP", "questionnaire templates (no price sheet)"), ("RFQ", "RFQ price-sheet templates"), ("Auction", "auction templates (reverse and forward)")]:
    case("SRC-CRE", M3, "Event type and template", f"Event Type {et} lists only {lists}",
         ss(f"Under Event Type click \"{et}\"", "Move the mouse over \"Select Templates\" and read the template names"),
         f"The menu lists {lists}. The menu of the previous event type is not shown any more.", priority="High")
case("SRC-CRE", M3, "Event type and template", "Switching from RFQ to Auction after choosing a template",
     ss("Click RFQ, choose the RFQ template and add a product", "Click \"Auction\""),
     "The RFQ template is dropped and \"Select Templates\" asks for an auction template. Confirm whether the product row is kept; nothing must be published with the RFQ sheet under an auction.", ttype="Edge", priority="Medium")
case("SRC-CRE", M3, "Event type and template", "Choosing a template shows its sheet",
     ss("Click RFQ", "Hover \"Select Templates\" and click the RFQ template"),
     "The sheet appears with Product, Product Variant, Quantity Requested, Delivery location, Price, Quantity Available, GST, Total Amount, and the buttons Add Columns, Upload Sheet, Details, Price Components, Rank on lot. Participants, Terms & Conditions and the schedule chip become clickable.", priority="Critical")

# product sheet field rules — every priced type
SHEET_TYPES = [("RFQ", single_stage_rfq), ("reverse auction", lambda **k: single_stage_auction("reverse", **k)), ("forward auction", lambda **k: single_stage_auction("forward", **k))]
QTY = [
    ("blank", "", "The cell is marked as required and publish is refused with \"Please fill valid quantity on every line item\" / \"Please fill quantity for all line items\".", "Negative"),
    ("0", "0", "The cell is refused (red) — quantity must be greater than zero (\"Quantity must be greater than zero\"); nothing is published.", "Negative"),
    ("-5", "-5", "The negative value is refused; the cell turns red or clears; nothing is published.", "Negative"),
    ("letters \"abc\"", "abc", "The cell does not keep letters (numeric cells reject non-numbers when you press Tab).", "Negative"),
    ("a decimal 2.5", "2.5", "Kept as 2.5 for units that allow decimals; for whole-number units the app rounds or refuses — record which.", "Edge"),
    ("a very large number 99999999", "99999999", "Kept and shown with thousands separators; the totals do not break or overflow.", "Edge"),
    ("10", "10", "Kept as 10; Total Amount is calculated once a price exists.", "Positive"),
]
for tname, build in SHEET_TYPES:
    for qd, qv, exp, tt in QTY:
        steps = [BUYER_LOGIN] + build(qty=qv if qv else "nothing (leave it empty)") + ["Press Tab and read the cell", invite_named(VA), SCHEDULE_30, "Click Publish Event"]
        case("SRC-CRE", M3, f"Quantity on a {tname}", f"{cap(tname)}: Quantity Requested = {qd}", steps, exp,
             data=f"Quantity {qd}", ttype=tt, priority="High" if tt != "Edge" else "Medium")
for tname, build in SHEET_TYPES:
    case("SRC-CRE", M3, f"Delivery location on a {tname}", f"{cap(tname)}: delivery location left empty",
         [BUYER_LOGIN] + build()[:-1] + [f"Add {P1} with quantity 10 but do not pick a delivery location", invite_named(VA), SCHEDULE_30, "Click Publish Event"],
         "Publish is refused and the empty Delivery location cell is highlighted (\"is a required field\"). The auto title is not generated while the location is empty.", ttype="Negative")
    case("SRC-CRE", M3, f"Delivery location on a {tname}", f"{cap(tname)}: delivery location must come from the list",
         [BUYER_LOGIN] + build()[:-1] + [f"Add {P1}, quantity 10", "Click Delivery location and type a name that is not a plant (\"Mars\")"],
         "No match is offered; free text cannot be kept. Only plants from the company's locations can be chosen.", ttype="Negative", priority="Medium")
for what, steps, exp, tt in [
    ("Add a second product row", ["Click \"+\" under the sheet (add row) and add " + P2 + " with 5 KG at " + LOC1], "Two rows; each has its own quantity, unit and location; the auto title changes (see module 4).", "Positive"),
    ("Delete one of two rows", ["Add a second row", "Hover the first row and click its bin icon, confirm"], "One row remains; the totals and auto title update.", "Positive"),
    ("Try to delete the only row", ["Hover the only row and click its bin icon"], "Refused: \"At least one product is required, so the last one can't be removed.\"", "Negative"),
    ("Add the same product twice", ["Add " + P1 + " in a second row with the same location"], "Record whether the app merges, warns, or keeps two rows; the vendor must not be asked to quote the same line twice by mistake.", "Edge"),
    ("Product that is not in the catalogue", ["Type \"no-such-product-xyz\" in the Product cell"], "No product is offered; the row stays empty and cannot be published.", "Negative"),
    ("Add Columns — a custom text column", ["Click \"Add Columns\", choose a text column, name it \"Brand\" and save"], "A \"Brand\" column appears for the vendor to fill.", "Positive"),
    ("Add Columns — empty column name", ["Click \"Add Columns\", choose a text column, leave the name empty, save"], "Refused: \"Column name cannot be empty\".", "Negative"),
    ("Add Columns — a column name that already exists", ["Add a column named \"Price\""], "Refused: \"Column already exists\".", "Negative"),
    ("Add Columns — Price Cap", ["Click \"Add Columns\" and tick \"Price Cap\"", "Type 100 in the Price Cap cell, then try \"abc\" and -1"], "100 is kept. Letters are refused; a negative cap is refused (\"Price Cap cannot be negative\"); on publish bad caps give \"Please enter valid price cap values\".", "Positive"),
    ("Upload Sheet with good rows", ["Click \"Upload Sheet\", download the template, fill 3 valid rows, upload it"], "The 3 rows are added to the sheet exactly as in the file.", "Positive"),
    ("Upload Sheet with a bad row", ["Upload a file with 2 good rows and 1 row with an unknown product code"], "The good rows are added; the app reports the failed row (\"Failed to upload 1 entries.\" with \"View failed entries\").", "Negative"),
    ("Upload Sheet partially filled", ["Upload a file where one row has a product but no quantity"], "Refused or flagged with \"Sheet partially filled, please check again.\"", "Negative"),
    ("Upload a file bigger than 10 MB", ["Upload a sheet file larger than 10 MB"], "Refused with a file-size message (under 10 MB allowed).", "Negative"),
    ("Price Components", ["Click \"Price Components\", add \"Freight\" as a component, save"], "Freight appears as an extra price part the vendor fills; totals include it.", "Positive"),
    ("Details of a row", ["Click \"Details\" on a row"], "The product's details open (code, variant, specification, attachments) read-only.", "Positive"),
]:
    case("SRC-CRE", M3, "Product sheet buttons", what, [BUYER_LOGIN] + single_stage_rfq() + steps, exp, ttype=tt,
         priority="High" if tt == "Negative" else "Medium")
case("SRC-CRE", M3, "Product sheet limits", "Adding more products than the company allows",
     [BUYER_LOGIN] + single_stage_rfq() + ["Add rows until the company's maximum line items is passed (for example 70 rows where the limit is 69)"],
     "The extra row is refused with \"Maximum no of product addition reached\" (or publish is refused). The limit comes from the company setting \"allowed maximum line items\".", ttype="Negative", priority="High")
case("SRC-CRE", M3, "Attachments", "Attach two documents to the event and see them on the project",
     [BUYER_LOGIN] + single_stage_rfq() + ["Click \"Add Attachments\" (paper clip), upload \"Technical Specification Sheet.pdf\" and \"Bidding Sheet Template.xlsx\"", invite_named(VA), SCHEDULE_30, PUBLISH, "Open the \"Project Details\" tab"],
     "Both files are listed under \"Quotation Templates (2)\" with a Download link each; each downloads the same file that was uploaded. The vendor sees and can download both.", priority="Medium")

# auction configuration rules (projectCreation + backend codes)
M3A = "3A. Create event — auction configuration rules"
AUC = [
    ("tick size 0", "Set the tick size to 0", "Refused: \"Invalid Tick Size\".", "Negative"),
    ("negative floor price", "Set the floor price to -10", "Refused: \"Floor Price cannot be negative\".", "Negative"),
    ("negative floor quantity", "Set the floor quantity to -1", "Refused: \"Floor Quantity cannot be negative\".", "Negative"),
    ("floor quantity above the total quantity", "Set floor quantity 15 for a line of 10", "Refused: \"Floor Quantity cannot be greater than the Total Quantity\".", "Negative"),
    ("start price greater than end price (forward)", "On a forward auction set start price 200 and end price 100", "Refused: \"Start Price cannot be greater than End Price\".", "Negative"),
    ("start price lower than end price (reverse Dutch)", "On a Dutch reverse auction set start price 100 and end price 200", "Refused: \"Start Price cannot be less than End Price\".", "Negative"),
    ("Dutch auction without base price", "Choose a Dutch auction and leave the base price empty", "Refused: \"Please enter base price\".", "Negative"),
    ("Dutch auction with an invalid end price", "Enter an end price of letters or 0", "Refused: \"Please enter valid end price\".", "Negative"),
    ("Knockout auction with an invalid base price", "Choose Knockout and type 0 as base price", "Refused: \"Please enter valid base price\".", "Negative"),
    ("currency configuration on a Knockout / Dutch auction", "Add a second bidding currency", "Refused: \"Currency configuration cannot be added in Knockout / Dutch Auction\".", "Negative"),
    ("traffic light without a range", "Choose traffic light ranking and leave the ranges empty", "Refused: \"Please select valid traffic light range.\" / \"Traffic light type is required\".", "Negative"),
    ("dynamic time extension under 1 minute", "Turn on dynamic time extension and set the trigger to 0.5 minute", "Refused: \"Trigger time extension cannot be less than 1 min\".", "Negative"),
    ("no event closing mode", "Leave the closing mode unselected", "Refused: \"Please choose event closing mode\".", "Negative"),
    ("single product with single vendor closing on traffic light", "One product, traffic light, single vendor closing", "Refused: \"In case of single product, please choose multiple vendor closing.\"", "Negative"),
    ("basket auction without interval time", "Choose a basket auction and leave the interval empty", "Refused: \"Please add basked auction interval time\" (the app's own spelling).", "Negative"),
    ("no auction strategy", "Leave the auction strategy unselected", "Refused: \"Please select a valid auction strategy\".", "Negative"),
    ("rank-based reverse auction, valid", "Rank strategy, tick 1, 30 Mins", "Publishes; vendors will see only their rank while bidding.", "Positive"),
    ("price-based reverse auction, valid", "Price strategy (L1 price visible), tick 1", "Publishes; vendors will see the best price while bidding.", "Positive"),
    ("sealed bid auction, valid", "Sealed bid strategy", "Publishes; vendors cannot see others' prices or ranks until it ends.", "Positive"),
]
for what, step, exp, tt in AUC:
    case("SRC-AUC", M3A, "Auction configuration", f"Auction with {what}",
         [BUYER_LOGIN] + single_stage_auction("forward" if "forward" in what else "reverse") + [f"In the auction configuration: {step}", invite_named(VA, VB), SCHEDULE_30, "Click Publish Event"],
         exp, ttype=tt, priority="High" if tt == "Negative" else "Medium")
case("SRC-AUC", M3A, "Auction configuration", "Products cannot be added or removed on a live Knockout or Dutch auction",
     [BUYER_LOGIN, open_event("a live Knockout auction"), "Try to add or remove a product on the stage"],
     "Refused: \"Products can't be added or removed in Knockout or Dutch Auction.\"", ttype="Negative", priority="Medium")

# ═══════════════════════════ 4. Auto title ═══════════════════════════════════════════════
M4 = "4. Event title — auto title and typed title"
LOCN = "Plant Name"
MODES = [("RFQ", "RFQ", "[RFQ]", single_stage_rfq), ("reverse auction", "Auction (reverse template)", "[Reverse Auction]", lambda **k: single_stage_auction("reverse", **k)),
         ("forward auction", "Auction (forward template)", "[Forward Auction]", lambda **k: single_stage_auction("forward", **k))]
SETS = [
    ("one product at one location", [f"{P1} at {LOCN}"], f"{P1} - {LOCN}"),
    ("two products of the same family at one location", ["Product X and Product Y, both of family F, at " + LOCN], f"F products - {LOCN}"),
    ("two products of different families at one location", [f"{P1} (family F1) then {P3} (family F2), both at {LOCN}"], f"{P1} & more - {LOCN}"),
    ("one product at two locations (two rows)", [f"{P1} at {LOCN} and {P1} at {LOC2}"], f"{P1} - 2 locations"),
    ("three products of different families at three locations", [f"{P1}, {P2}, {P3} at three different plants"], f"{P1} & more - 3 locations"),
]
for mname, click, prefix, build in MODES:
    for sname, rows, tail in SETS:
        case("SRC-TTL", M4, f"Auto title — {mname}", f"{cap(mname)}: auto title for {sname}",
             [BUYER_LOGIN] + build()[:-1] + [f"Leave the title box \"Enter the title of this event\" empty", f"Add the rows: {rows[0]}", "Read the title box after the last location is picked"],
             f"The title fills itself as \"{prefix} {tail}\". Product names longer than 70 characters are cut with \"…\". The title updates again if rows are added or removed while you have not typed your own title.",
             data=f"{sname}", priority="High" if sname.startswith("one product at one") else "Medium",
             rule="eventCreation.jsx generateTitle")
for mname, click, prefix, build in MODES:
    case("SRC-TTL", M4, f"Typed title — {mname}", f"{cap(mname)}: a typed title is never replaced by the auto title",
         [BUYER_LOGIN] + build()[:-1] + ["Type \"QA_Platform my own title\" in the title box first", f"Add {P1} at {LOCN}, then add {P2}"],
         "The title stays \"QA_Platform my own title\" after every product change.", priority="High")
    case("SRC-TTL", M4, f"Typed title — {mname}", f"{cap(mname)}: clearing a typed title brings the auto title back",
         [BUYER_LOGIN] + build()[:-1] + ["Type a title, then select it all and delete it", f"Add or change a product row ({P1} at {LOCN})"],
         f"The empty title box fills itself again with \"{prefix} {P1} - {LOCN}\".", priority="Medium")
    case("SRC-TTL", M4, f"Auto title — {mname}", f"{cap(mname)}: no auto title until a location is picked",
         [BUYER_LOGIN] + build()[:-1] + ["Leave the title empty", f"Add {P1} with quantity 10 but no location", "Read the title box", f"Now pick {LOCN}"],
         f"While the location is empty the title stays empty. After the location is picked it reads \"{prefix} {P1} - {LOCN}\".", priority="Medium")
case("SRC-TTL", M4, "Auto title — RFP", "Single stage RFP: what the auto title says",
     ss("Keep Event Type RFP, choose a questionnaire template", f"Add {P1} at {LOCN} if the template has a product sheet", "Read the title box"),
     "Record the title. The code labels anything that is not RFQ or forward as \"[Reverse Auction]\", so an RFP may read \"[Reverse Auction] …\" — confirm with product whether an RFP should be labelled RFP; type a title if none fills.", ttype="Edge", priority="Low")
case("SRC-TTL", M4, "Auto title — long name", "A product name longer than 70 characters is cut in the auto title",
     [BUYER_LOGIN] + single_stage_rfq() + ["Leave the title empty and use a product whose name is longer than 70 characters"],
     "The title shows the first 70 characters of the name followed by \"…\", then \" - Plant Name\".", ttype="Edge", priority="Low")
for prj in ["Technical + RFQ", "Auction only", "RFQ only"]:
    case("SRC-TTL", M4, "eRFX project title", f"eRFX project ({prj}): the title is never filled automatically",
         [BUYER_LOGIN, OPEN_EVENTS, CLICK_CREATE, CHOOSE_ERFX, f"Make the stages {prj} and choose templates", f"Add {P1} at {LOCN} through \"Items\"", "Leave \"Enter the title of the project\" empty and click Publish"],
         "The title box stays empty (auto title works only on single stage events). Publish is refused with \"Please fill project title!\" until a title is typed.", ttype="Negative", priority="High")
case("SRC-TTL", M4, "Title required", "Single stage: empty title with no product location is refused at publish",
     ss("Click RFQ and choose the template", f"Add {P1} with quantity 10 and no location; leave the title empty", invite_named(VA), "Click Publish Event"),
     "Publish is refused with \"Please enter title.\" (and the location is flagged).", ttype="Negative")
case("SRC-TTL", M4, "Title after publish", "The title shows on the project page, the events list and the vendor portal",
     [BUYER_LOGIN] + single_stage_rfq() + ["Leave the auto title", invite_named(VA), SCHEDULE_30, PUBLISH, OPEN_EVENTS, vendor_login(VA)],
     "The same title (\"[RFQ] … - Plant Name\") appears at the top of the project page, in the Live list and on Vendor A's event list.", role="Buyer, Vendor A", portal="Buyer + Vendor portal", priority="Medium")

# ═══════════════════════════ 5. eRFX project screen ════════════════════════════════════════
M5 = "5. Create event — eRFX project: stages, items, save as draft"
ex = lambda *s: [BUYER_LOGIN, OPEN_EVENTS, CLICK_CREATE, CHOOSE_ERFX, *s]
case("SRC-ERX", M5, "Project screen", "The eRFX screen opens with one Auction stage and locked actions",
     ex("Read the stage tabs, the toolbar and the footer"),
     "One stage tab \"Auction\"; the toolbar shows \"Items 0\", \"Add Attachments\" and \"Add T&Cs\"; the message \"Please add line items in the manage line items section and choose a template to proceed!\"; \"Save as draft\", Savings, Terms & Conditions and the schedule chip are greyed out.", priority="Critical")
STAGE_RULES = [
    ("Add a Technical Stage to Auction", ["Hover the \"+\" next to the tabs", "Click \"Technical Stage\""], "Tabs become Technical Stage + Auction (technical always first)."),
    ("RFQ cannot be added while Auction is there", ["Hover the \"+\""], "\"RFQ\" is not offered; its tooltip says \"Remove Auction to add RFQ\" — RFQ and Auction cannot be in one project."),
    ("Only two stages are allowed", ["Add Technical Stage", "Hover the \"+\" again"], "No more stages are offered once there are two."),
    ("The last stage cannot be deleted", ["Open the Auction tab's ⋮ menu"], "Delete is greyed out while it is the only stage."),
    ("Make an RFQ-only project", ["Add Technical Stage", "Delete Auction from its ⋮ menu", "Add RFQ from \"+\"", "Delete Technical Stage"], "One tab: RFQ. (This order is needed because the last stage cannot be deleted and RFQ is blocked while Auction exists.)"),
    ("Make a Technical + RFQ project", ["Add Technical Stage", "Delete Auction", "Add RFQ"], "Tabs: Technical Stage, RFQ."),
    ("After deleting a stage the panel is blank", ["Add Technical Stage and delete Auction"], "If the panel looks empty, clicking the remaining tab shows its content; nothing is lost."),
]
for title, steps, exp in STAGE_RULES:
    case("SRC-ERX", M5, "Stages", title, ex(*steps), exp, ttype="Negative" if "cannot" in title or "Only" in title else "Positive", priority="High")
case("SRC-ERX", M5, "Items", "\"Items\" does nothing until a template is chosen",
     ex("Click \"Items 0\" before choosing any template"),
     "The Manage Line Items drawer does not open (the template defines the sheet). Choose a template first, then Items opens.", ttype="Negative", priority="High")
for what, steps, exp, tt in [
    ("Add two line items in the drawer", [f"Choose the template", f"Click \"Items 0\", search \"{P1.split()[0]}\" and add it with 10 at {LOC1}", f"Search \"{P2.split()[0]}\", add it with 5 KG", "Click Save"], "The button reads \"Items 2\" and both rows are in every stage's sheet.", "Positive"),
    ("Save the drawer with no item", ["Choose the template", "Open Items and click Save without adding anything"], "Refused: \"Please add atleast one item to proceed!\"", "Negative"),
    ("Save with an empty quantity", ["Choose the template", "Open Items, add a product, leave its quantity empty, Save"], "Refused: \"Please fill valid quantity on every line item\".", "Negative"),
    ("Remove an item in the drawer", ["Add two items", "Click a row's bin icon and confirm \"Delete\"", "Save"], "\"Items 1\"; the removed product disappears from every stage.", "Positive"),
    ("The same product picked twice", ["Add " + P1 + " twice with the same variant"], "The drawer keeps one row for the same product and variant (it merges), so pick a different product for a second line.", "Edge"),
]:
    case("SRC-ERX", M5, "Items", what, ex(*steps), exp, ttype=tt, priority="High" if tt != "Edge" else "Medium")
case("SRC-ERX", M5, "Technical stage", "A technical stage needs its Vendor Assessment section filled",
     ex("Make Technical + RFQ, choose templates", "Leave the Technical Stage's \"Vendor Assessment\" section empty", invite_named(VA), "Save the schedule and click Publish"),
     "Refused: \"There are some errors in vendor specific sections, please check and try again\".", ttype="Negative", priority="High")
case("SRC-ERX", M5, "Technical stage", "A technical stage needs an evaluator",
     ex("Make Technical + RFQ, fill Vendor Assessment but add no evaluator", invite_named(VA), "Save the schedule and click Publish"),
     "Refused: \"Please add Evaluator in the Technical Stage\" (or \"…to all the line items…\" when evaluators are per line).", ttype="Negative", priority="High")
case("SRC-ERX", M5, "Technical stage", "Empty questionnaire sections block publish",
     ex("Make Technical + RFQ and choose a questionnaire with a section, delete all its questions", "Publish"),
     "Refused: \"Some sections are empty, please check and try again\".", ttype="Negative", priority="Medium")
case("SRC-ERX", M5, "Technical stage", "A section-wise scoring template only fits Vendor Assessment",
     ex("Make Technical + RFQ", "Try to pick a section-wise scoring template outside Vendor Assessment"),
     "Refused: \"Section-wise scoring templates can only be selected in the Vendor Assessment section.\"", ttype="Negative", priority="Low")
case("SRC-ERX", M5, "Savings", "A stage with no template fails the savings check",
     ex("Add Technical Stage and leave the Auction stage without a template", "Publish"),
     "Refused: \"Please select a valid column for savings\" (the savings column needs the template's price widget).", ttype="Negative", priority="Medium")
# save as draft
for when, steps, exp, tt in [
    ("with only a title", ["Type the title \"QA_Platform draft 1\""], "\"Save as draft\" stays greyed out until a template and an item exist.", "Negative"),
    ("with title, template and items", ["Type the title", "Choose the template, add 1 item", "Click \"Save as draft\""], "A success message; the project is listed on Drafts with its title.", "Positive"),
    ("with participants and T&C added", ["Fill title, template, item", invite_named(VA, VB), "Add one T&C clause", "Click \"Save as draft\""], "Saved; reopening the draft shows the same participants and the clause.", "Positive"),
    ("with a schedule saved", ["Fill title, template, item", "Save a schedule of 60 Mins", "Save as draft"], "Saved; reopening shows the schedule; if its start time has passed the app asks for a new schedule before publishing.", "Positive"),
]:
    case("SRC-ERX", M5, "Save as draft", f"Save as draft {when}", ex(*steps), exp, ttype=tt, priority="High")
for act, steps, exp in [
    ("reopen it and publish", ["Open Drafts and click the draft", "Check every field, add the schedule and click Publish"], "It publishes; it leaves Drafts and appears on Live with the same title and RFX number."),
    ("edit it and save again", ["Open the draft, change the quantity to 12, click Save as draft"], "The draft keeps quantity 12 when reopened."),
    ("cancel it from the menu", ["Open the draft's project page, click Settings (or ⋮) and choose \"Cancel Event\""], "For a draft the withdraw option is labelled \"Cancel Event\"; confirming removes the draft from Drafts (it is withdrawn)."),
]:
    case("SRC-ERX", M5, "Draft project", f"Draft project: {act}", [BUYER_LOGIN, OPEN_EVENTS, "Click the Drafts tab"] + steps, exp,
         pre="Set-up case SRC-SET-009 done.", priority="High")
case("SRC-ERX", M5, "Draft project", "A draft never reaches vendors",
     [vendor_login(VA), "Look for the draft project's title in the vendor's event list"], "The draft is not visible to Vendor A; vendors are notified only on publish.",
     role="Vendor A", portal="Vendor portal", pre="Draft project with Vendor A as participant.", priority="Medium")
case("SRC-ERX", M5, "Leaving without saving", "Leaving the create screen without saving creates nothing",
     ex("Type a title, choose a template, add an item", "Click \"Events\" in the left menu"),
     "No event and no draft is created (Drafts count unchanged). Record whether an \"unsaved changes\" warning appears.", ttype="Edge", priority="Low")
