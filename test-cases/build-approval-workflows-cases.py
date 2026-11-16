#!/usr/bin/env python3
"""Approval Workflows — Bid Proposal approvals picked by the PO form's General Details (DLF Hospitality).

Written for people who have never seen the code: every step is something you click or type, every
expected result is what you see on the screen (the app's own words in quotes). No codes, no field keys.

Where a check was run by the automation on 3 Nov 2026, the ID of that check is in the last column so the
result can be traced; the Status / Result columns are filled by build-approval-workflows-results.py.

Output: approval-workflows/data.json (the results builder makes the Excel and the page)."""
import json
from collections import Counter, OrderedDict
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE / "approval-workflows"

CASES = []
_n = Counter()
COLS = ["Test Case ID", "Module", "Scenario", "Test Case Title", "User Role", "Portal", "Pre-conditions", "Configs Needed",
        "Test Data", "Test Steps", "Expected Result", "Priority", "Test Type", "Status", "Result (seen on 3 Nov 2026)",
        "Notes for the tester", "Checked by (automation id)"]


def case(prefix, module, scenario, title, steps, expected, *, pre="-", data="-", priority="High", ttype="Positive",
         role="Buyer admin", portal="Buyer portal (cpanel)", configs="None", note="", auto=""):
    _n[prefix] += 1
    flat = []
    for s in steps:
        if isinstance(s, (list, tuple)):
            flat.extend(s)
        elif s:
            flat.append(s)
    CASES.append({
        "Test Case ID": f"{prefix}-{_n[prefix]:03d}", "Module": module, "Scenario": scenario, "Test Case Title": title,
        "User Role": role, "Portal": portal, "Pre-conditions": pre if pre != "-" else DEFAULT_PRE, "Configs Needed": configs,
        "Test Data": data, "Test Steps": "\n".join(f"{i + 1}. {s}" for i, s in enumerate(flat)),
        "Expected Result": expected, "Priority": priority, "Test Type": ttype, "Status": "Not Run",
        "Result (seen on 3 Nov 2026)": "", "Notes for the tester": note, "Checked by (automation id)": auto,
    })


# ── the words every case repeats ────────────────────────────────────────────────────────────────
DEFAULT_PRE = ("You are logged in to DLF Hospitality on UAT as the test user (a super admin who is a Member of the "
               "team \"All Categories\"). Name every workflow you create \"QA_Platform …\" and make yourself its only "
               "approver, so nobody else gets an approval request. Delete your workflows when you finish.")
LOGIN = "Log in to Procol (buyer side) as the DLF Hospitality test user"
OPEN_WF = "Click \"Approval Workflows\" in the left menu. The page opens on the \"Team\" tab with a table and a blue \"+ Create\" button"
CLICK_CREATE = "Click \"+ Create\". The page \"Setup New Team Approval Workflow\" opens with a dashed box \"+ Add Trigger Settings\""
OPEN_DRAWER = "Click \"+ Add Trigger Settings\". A panel \"Trigger Settings\" slides in from the right"
PICK_BID = "Click \"Add Approval Type\" and choose \"Bid Proposal\". It shows as a small chip with an x; a \"Conditions\" box appears below"
PICK_TEAM = "Click \"Add Team\" and choose \"All Categories\"; click \"Add Initiators\" and choose \"Member\""
SAVE_DRAWER = ("Click \"Save\" at the bottom of the panel. The page now shows a \"Bid Proposal\" summary (Trigger Conditions, "
               "Applicable Teams, Initiators) and a table with one empty row")
NEW_FLOW = [LOGIN, OPEN_WF, CLICK_CREATE, OPEN_DRAWER, PICK_BID]


def add_conditions(*names):
    return "Click \"Add Conditions\" and choose " + ", ".join(f"\"{n} - DLF PO - General Details (Test)\"" for n in names) + ". Each shows as a chip with an x"


def setup(*conds):
    return NEW_FLOW + [add_conditions(*conds), PICK_TEAM, SAVE_DRAWER]


def name_row(n):
    return f"Click the empty \"Name (optional)\" cell, type \"{n}\" in the small box and click \"Save\""


def set_cond(label, *values):
    v = " and ".join(f"\"{x}\"" for x in values)
    return (f"Click the \"{label} - DLF PO - General Details (Test)\" cell. A small window \"Select {label} - …\" opens. "
            f"Type part of the name, tick {v}, then click \"Save\"")


STEP_SELF = ("Click the \"Step 1\" cell. Keep \"Fixed\"; in \"Step 1 Approvers\" type \"Sumanta\", wait a moment and pick "
             "\"Test - Sumanta Dey (sumonto.dey@gmail.com)\" (yourself); type 1 in \"Approval Duration\" (Day(s)); click \"Save\"")
PUBLISH = "Click the blue \"Publish Workflow\" at the top right"
PUBLISHED = ("Green message \"Approval workflow has been successfully published\". Back on the list, the new row shows the name, "
             "\"Bid Proposal\", \"Enabled\" and the chosen values in the condition columns")

PO_PRE = ("An event made from a purchase requisition with the template \"DLF Capex NFA Test RFQ\" has a vendor quote and has "
          "been awarded, so its PO form is open as a draft. On UAT this is RFX-2112 (PR-369 line 15, unit National Clubs "
          "-Kochi, vendor Demo10), created by the test user. Only use test vendors.")
OPEN_PO = [LOGIN, "Click \"Events\" in the left menu, open the awarded event RFX-2112 and open its PO form. The page "
                  "\"PO Form / RFX-2112\" opens with the section \"General Details\" at the top and \"Submit Proposal\" at the top right"]
GD_ROWS = "Form Type*, Unit Name*, Legal Entity*, Department*, Nature of Expense*, Sanction Note, Comments"
SUBMIT_PO = ("Click \"Submit Proposal\" at the top right. The NTD page (Note to Director: Subject and Scope, Material needed by, "
             "Overall Budget, Change in price reason) opens; click \"Submit Proposal\" there too. The \"Submit Proposal\" window opens")
FILL = "Fill General Details: Legal Entity \"DLF LIMITED\", Department \"IT\", Nature of Expense \"Budgeted with 3 quotes\" (Form Type and Unit Name are already filled)"
MY_FLOWS = ("Two workflows of yours exist for team All Categories / Member, approver yourself: \"QA_Platform AW SUB-A\" "
            "(Unit Name National Clubs -Kochi AND Department IT) and \"QA_Platform AW SUB-B\" (Department IT or HR).")

# ═════════════════════ 1. The Approval Workflows list ═════════════════════
M = "1. The Approval Workflows list"
case("AW-LST", M, "Open the page", "The list opens on the Team tab with one column for each routing condition",
     [LOGIN, OPEN_WF, "Read the column headers and scroll the table to the right"],
     "Tabs \"Team\" and \"Company\". Columns: Name, Approval Type, Prevent Approval Expiry (with an info icon), Total Proposal "
     "Value, \"Form Type - DLF PO - General Details (Test)\", \"Unit Name - …\", \"Legal Entity - …\", \"Department - …\", "
     "\"Nature of Expense - …\", then the Step columns. A filter icon on the left, \"+ Create\" on the right, the team block "
     "\"All Categories\" with a count and an \"Edit\" link, page numbers \"1 / 4\" below.", priority="Critical",
     auto="UI-LST-001, UI-LST-002")
case("AW-LST", M, "Column values", "A workflow's chosen values show in its columns; several values show as '+1 more'",
     [LOGIN, OPEN_WF, "Find the row \"GD Test - CAPEX - Lodhi / Camellias - DLF entities\""],
     "Form Type column: \"DLF Capex NFA Test RFQ\" (the template's name). Unit Name: \"The Lodhi +1 more\". Legal Entity: "
     "\"DLF LIMITED +1 more\". An empty column means \"any value\".", priority="High", auto="UI-LST-001")
case("AW-LST", M, "Company tab", "The Company tab shows the company-level workflows (three called 'test' with no conditions)",
     [LOGIN, OPEN_WF, "Click the \"Company\" tab"],
     "Three rows named \"test\" (Bid Proposal, Enabled) with every condition column empty — these match every PO. Note them: "
     "they decide what happens when none of the team workflows matches (module 8).", priority="High", auto="UI-LST-004")
case("AW-LST", M, "Filter", "The filter narrows the list by approval type and by a routing value",
     [LOGIN, OPEN_WF, "Click the filter icon at the top left of the table", "Choose Approval Type \"Bid Proposal\"",
      "Add the filter \"Unit Name - DLF PO - General Details (Test)\" = \"The Lodhi\""],
     "Only Bid Proposal rows remain; then only the rows whose Unit Name includes The Lodhi. Workflows that have no Unit Name "
     "condition disappear from that filter although they also apply to The Lodhi — note whether that is wanted.",
     priority="Medium", auto="UI-LST-005, UI-LST-006, UI-LST-007")
case("AW-LST", M, "Pages", "Paging through the Team list",
     [LOGIN, OPEN_WF, "Click \">\" to go to pages 2, 3, 4; type 1 in the page box"],
     "Each page shows the next workflows. \"<\" is greyed on page 1 and \">\" on the last page.", priority="Low",
     auto="UI-LST-003")
case("AW-LST", M, "Open for editing", "The team's Edit link opens all workflows of that team for editing",
     [LOGIN, OPEN_WF, "Click \"Edit\" next to \"All Categories\""],
     "The page \"Edit Team Workflows - All Categories\" opens with one row per workflow of the team, every value filled in, and "
     "the button \"Save Workflow\". (The address holds the team's id, not a workflow's.)", priority="High",
     auto="UI-EDT-001, UI-EDT-001b")

# ═════════════════════ 2. Trigger Settings ═════════════════════
M = "2. Creating a workflow — Trigger Settings"
case("AW-TRG", M, "Create page", "Create opens an empty 'Setup New Team Approval Workflow' page",
     [LOGIN, OPEN_WF, CLICK_CREATE],
     "Heading \"Setup New Team Approval Workflow\"; only the dashed box \"+ Add Trigger Settings\". There is no Publish button "
     "yet — it appears once trigger settings are saved.", priority="Critical", auto="UI-CRT-001, UI-CRT-012")
case("AW-TRG", M, "Approval types", "Approval Type lists every kind of approval of the company",
     [LOGIN, OPEN_WF, CLICK_CREATE, OPEN_DRAWER, "Click \"Add Approval Type\" and read the list"],
     "Quote Selection, Bid Proposal, Technical Evaluation, Event Creation, Surrogate Bid Creation, Create Product, Reorder "
     "Proposal, Create User, Vendor Onboarding, Intake Request, PR Completion, Purchase Request Removal. \"Bid Proposal\" is the "
     "one that runs when a buyer submits the PO form after awarding.", priority="High", auto="UI-CRT-003")
case("AW-TRG", M, "Conditions", "For Bid Proposal, Conditions offers the five General Details fields, each named after the PO template",
     NEW_FLOW + ["Click \"Add Conditions\" and read the list"],
     "Auction Rank, Total Proposal Value, PR Price, and \"Form Type - DLF PO - General Details (Test)\", \"Unit Name - …\", "
     "\"Legal Entity - …\", \"Department - …\", \"Nature of Expense - …\". (Intake Request Condition, PO Value and TNA score "
     "count are listed too although they belong to other approval types — note it.) \"(Test)\" is part of the PO template's "
     "name on UAT; the live template must be named properly before go-live or every header will say (Test).",
     priority="Critical", auto="UI-CRT-005, API-CFG-006")
case("AW-TRG", M, "Conditions", "Several conditions can be added; a chosen one leaves the list; the x removes it",
     NEW_FLOW + [add_conditions("Unit Name", "Legal Entity", "Department"), "Open \"Add Conditions\" again",
                 "Click the x on the \"Legal Entity\" chip"],
     "Three chips appear in the order chosen. The open list no longer offers those three. After the x, the Legal Entity chip is "
     "gone and it is offered again in the list.", priority="High", auto="UI-CRT-006, UI-CRT-007")
case("AW-TRG", M, "Team and initiators", "Team lists the purchase teams; Initiators offers Member, Manager, Admin",
     NEW_FLOW + [add_conditions("Department"), "Click \"Add Team\", read the list and choose \"All Categories\"",
                 "Click \"Add Initiators\" and read the list"],
     "Teams: All Categories, Evaluator, Project Purchase, Purchase Approver Team, Purchase Club 3/4/5, Purchase Club Vita, "
     "Purchase Corporate DLF Hospitality… (33 teams). Initiators: Member, Manager, Admin. Only one team and one initiator "
     "role can be chosen (a second attempt shows \"You cannot select more …\").", priority="High",
     auto="UI-CRT-008, UI-CRT-009")
case("AW-TRG", M, "Who triggers it", "The initiator role is part of the match — a Member never triggers an 'Admin' workflow",
     NEW_FLOW + [add_conditions("Department"), "Choose team \"All Categories\" and initiator \"Admin\"", SAVE_DRAWER,
                 name_row("QA_Platform AW admin-only IT"), set_cond("Department", "IT"), STEP_SELF, PUBLISH,
                 "Open the draft PO form of RFX-2112 with Department IT (module 5) and submit it (module 8)"],
     "The workflow publishes, but the submit window does NOT offer \"QA_Platform AW admin-only IT\": the test user is a Member "
     "of All Categories, not an Admin. The three pre-made \"GD Test - CAPEX…\" workflows (initiators Admin) are invisible to "
     "this user for the same reason. Tell CS clearly: the initiator role decides who can trigger the workflow.",
     priority="Critical", ttype="Negative", auto="API-MAT-004, API-MAT-010, UI-SUB-002")
case("AW-TRG", M, "Save empty", "Saving the panel with nothing chosen must say what is missing",
     [LOGIN, OPEN_WF, CLICK_CREATE, OPEN_DRAWER, "Click \"Save\" straight away"],
     "The panel stays open and shows \"Approval Type cannot be empty\" under the box. Seen on 3 Nov (when Save is clicked "
     "before the lists have loaded): the fields vanish and grey loading bars show, with no message; only Cancel gets you out.",
     priority="High", ttype="Negative", auto="UI-CRT-032")
case("AW-TRG", M, "Save partial", "Saving with an approval type and a condition but no team",
     NEW_FLOW + [add_conditions("Department"), "Click \"Save\" without choosing a team"],
     "\"Team cannot be empty\" under the Team box; the panel stays open.", priority="Medium", ttype="Negative",
     auto="UI-TRG-008")
case("AW-TRG", M, "Cancel", "Cancel closes the panel and throws the choices away",
     NEW_FLOW + [add_conditions("Department"), "Click \"Cancel\"", "Click \"+ Add Trigger Settings\" again"],
     "The panel closes; the page still shows only \"+ Add Trigger Settings\". Reopened, the panel is empty again. Seen on 3 "
     "Nov: the reopened panel still shows Bid Proposal, the Department chip and even the old \"Team cannot be empty\" error — "
     "Cancel keeps everything.", priority="Medium", ttype="Negative", auto="UI-TRG-009, UI-TRG-009b")
case("AW-TRG", M, "Edit the trigger", "Edit on the Bid Proposal summary reopens the panel with the choices made",
     setup("Unit Name", "Department") + [set_cond("Unit Name", "The Lodhi"),
                                        "Click \"Edit\" at the right of the \"Bid Proposal\" summary",
                                        "Add \"Legal Entity - …\" and click Save"],
     "The panel reopens with Bid Proposal, the two conditions, All Categories and Member already chosen. After adding Legal "
     "Entity the table gains a \"Legal Entity - …\" column and the value typed before (The Lodhi) is still there.",
     priority="Medium", auto="UI-TRG-010, UI-TRG-010b")
case("AW-TRG", M, "Remove a used condition", "Removing a condition that already has a value in the table",
     setup("Unit Name", "Department") + [set_cond("Unit Name", "The Lodhi"), "Click \"Edit\" on the summary, click the x on "
                                                                           "\"Unit Name - …\" and click Save"],
     "The Unit Name column disappears together with its value (The Lodhi). No warning is shown first — note it.",
     priority="Medium", ttype="Edge", auto="UI-TRG-011")

# ═════════════════════ 3. The table, steps and Publish ═════════════════════
M = "3. Creating a workflow — the table, the steps, Publish"
case("AW-TBL", M, "Table", "After saving the panel the table has one row and a note about matching",
     setup("Unit Name", "Legal Entity", "Department"),
     "Columns: Action (copy and bin icons), Name (optional), Prevent Approval Expiry (a switch, \"(Disabled)\"), the three "
     "condition columns, Step 1, Step 2, Step 3. Below: \"Add Approval Workflow\", \"(+) Add Step\" and the note \"All approval "
     "conditions must match for approval workflow to trigger\". \"Publish Workflow\" at the top right.", priority="Critical",
     auto="UI-CRT-010, UI-CRT-011")
case("AW-TBL", M, "Name", "The name is typed in a small window and is optional",
     setup("Department") + [name_row("QA_Platform AW name test"), "Click the cell again"],
     "The cell shows the name. A workflow without a name can still be published; it then shows an empty Name in the list "
     "and cannot be told apart from others — note it.", priority="Medium", auto="API-FLW-013")
case("AW-TBL", M, "Prevent Approval Expiry", "The switch goes from Disabled to Enabled; its info icon explains it",
     setup("Department") + ["Click the switch in \"Prevent Approval Expiry\"", "Hover the info icon in the column header"],
     "The row reads \"(Enabled)\"; the tooltip says \"Enabling this setting will prevent approvals from expiring\". After "
     "publishing, the list shows \"Enabled\".", priority="Medium", auto="UI-CRT-014")
case("AW-TBL", M, "Condition window", "A condition cell opens a window where several values can be ticked",
     setup("Unit Name") + ["Click the \"Unit Name - …\" cell"],
     "A window \"Select Unit Name - DLF PO - General Details (Test)\" with a search box, a list, the hint \"Match Unit Name - … "
     "with any of the selected options\", a bin icon, Cancel and Save. Several values can be ticked: the workflow matches "
     "when the PO has ANY of them.", priority="Critical", auto="UI-CRT-015")
case("AW-TBL", M, "Condition window", "Unit Name offers every location of the company, not a clean list of units",
     setup("Unit Name") + ["Click the \"Unit Name - …\" cell and scroll through the list"],
     "34 entries in alphabetical order, including \"-\", \"AMBUJA NEOTIA\", \"Free Text\", \"Plant Name\", \"Project BOQ team\", "
     "\"Restaurant\" and \"DLF Golf and Country Club\" TWICE. The requirement lists 44 named units. Raise to product/CS: clean the "
     "location list before go-live and show the location code (DLF-021) next to the name.", priority="High", ttype="Edge",
     auto="UI-CRT-016, API-CAT-002")
case("AW-TBL", M, "Condition window", "Form Type offers the 29 event templates by name, not the six form types of the requirement",
     setup("Form Type") + ["Click the \"Form Type - …\" cell and read the list"],
     "BOM Template, BOQ Based Project Template, BOQ CSQ1, …, Buy Template, DLF Capex NFA Test RFQ, Liquor Template, Tender - "
     "Discount Based Template … (29). Form Type is the event's template. The requirement's \"Capex, Project, Tender, Discount, "
     "Operational, Liquor\" exist only as template names — CS must decide which template stands for which form type.",
     priority="High", ttype="Edge", auto="API-CAT-003")
case("AW-TBL", M, "Condition window", "Two units can be ticked in one condition; the cell shows '+1 more'",
     setup("Unit Name") + [set_cond("Unit Name", "National Clubs -Kochi", "The Lodhi")],
     "Both chips in the window; after Save the cell reads \"National Clubs -Kochi +1 more\".", priority="High",
     auto="UI-CRT-017, UI-CRT-018")
case("AW-TBL", M, "Condition window", "The Legal Entity list does not follow the units chosen (the requirement asked it to)",
     setup("Unit Name", "Legal Entity") + [set_cond("Unit Name", "National Clubs -Kochi"),
                                          "Click the \"Legal Entity - …\" cell and read the list"],
     "All 7 entities are offered (ATRIUM PLACE…, DLF CLUB AND HOSPITALITY, DLF CYBERCITY, DLF LIMITED, DLF PROPERTY DEVELOPER, "
     "LODHI PROPERTY, RIVERIA) although Kochi only ever has DLF LIMITED. A CS user can save \"Kochi + LODHI PROPERTY\", a pair no "
     "PO can ever have. The requirement wanted the list to follow the unit; the build dropped that — raise it.",
     priority="High", ttype="Edge", auto="UI-CRT-019, API-FLW-004")
case("AW-TBL", M, "Condition window", "Typing in the window narrows the list",
     setup("Department") + ["Click the \"Department - …\" cell and type \"ma\""],
     "Only \"Marketing\" stays. Clearing the text brings back all 10: Design, Events, F&B Production, HR, HSSE, IT, Marketing, "
     "Project, Security, Training.", priority="Medium", auto="UI-TBL-009")
case("AW-TBL", M, "Condition window", "Cancel throws the change away; the bin empties the cell",
     setup("Department") + [set_cond("Department", "IT"), "Click the cell again, tick HR, click \"Cancel\"",
                             "Click the cell and click the bin icon"],
     "After Cancel the cell still reads IT only. After the bin the cell is empty (= any Department).", priority="Medium",
     auto="UI-TBL-010, UI-TBL-010b")
case("AW-TBL", M, "Total Proposal Value", "A money range can be combined with the routing fields",
     setup("Department") + ["Edit the trigger and add \"Total Proposal Value\"", set_cond("Department", "IT"),
                             "Click the \"Total Proposal Value\" cell, type Min 1 and Max 100000, Save"],
     "The cell shows the range. Published, the workflow needs Department IT AND a value in that range. Max below Min is refused "
     "with \"Max should be greater than min value\"; a negative number with \"Values cannot be less than 0\".",
     priority="High", auto="API-FLW-003, API-FLW-018")
case("AW-TBL", M, "Step", "The Step 1 window: Fixed / Dynamic, approvers, duration, title",
     setup("Department") + ["Click the \"Step 1\" cell"],
     "A window with \"Step Type\" Fixed (ticked) / Dynamic and the hint \"Approvers are pre-defined in the workflow and cannot be "
     "choosen by the initiator\" (typo: choosen); \"Step 1 Approvers\" with \"Search users or teams\"; \"Approval Duration\" with "
     "Day(s); \"Step 1 Title (optional)\"; a bin, Cancel, Save.", priority="High", auto="UI-CRT-021, UI-CRT-022")
case("AW-TBL", M, "Step", "The approver search finds a user by part of the name and shows the e-mail",
     setup("Department") + ["Click \"Step 1\", click \"Step 1 Approvers\", type \"Suman\" and wait a moment"],
     "\"Test 2 - Sumanta Dey (sumanta.dey0609@gmail.com)\" and \"Test - Sumanta Dey (sumonto.dey@gmail.com)\" are offered (the "
     "search takes 1–3 seconds). Picking one shows it as a chip. Teams can be picked too.", priority="High",
     auto="UI-CRT-023")
case("AW-TBL", M, "Step", "Two approvers in one step bring up 'No of approvals required'",
     setup("Department") + ["Click \"Step 1\", add both Sumanta users as approvers"],
     "A new box \"No of approvals required\" appears with 1 and 2. With one approver it is not there.", priority="Medium",
     auto="UI-TBL-014")
case("AW-TBL", M, "Step", "A Dynamic step lets the buyer pick the approver when submitting",
     setup("Department") + ["Click \"Step 1\", choose \"Dynamic\", add an approver, Save; set Department IT; Publish",
                             "Open the PO form of RFX-2112 (Department IT) and submit it (module 8), choosing this workflow"],
     "The submit window shows a \"Select Approver(s)\" box for the step. \"Submit Proposal\" is refused with \"Please select at "
     "least one approver to proceed.\" until one is picked.", priority="Medium", auto="UI-TBL-015, UI-TBL-015b")
case("AW-TBL", M, "Step", "A step without a duration, or with 0, is refused",
     setup("Department") + ["Click \"Step 1\", add yourself, leave Approval Duration empty, Save", "Type 0 and Save"],
     "\"Approval duration is required\", then \"Approval duration should be more than 0\". (Behind the scenes 0 and negative "
     "durations are refused with \"Approval flow steps expires in must be greater than 0\".)", priority="Medium",
     ttype="Negative", auto="API-FLW-014, API-FLW-015")
case("AW-TBL", M, "Step", "An empty Step 1 stops Publish",
     setup("Department") + [name_row("QA_Platform AW no step"), set_cond("Department", "IT"), STEP_SELF,
                             "Click \"Step 1\" and click the bin icon", PUBLISH],
     "The Step 1 cell is empty; Publish shows in red under the table: \"Please enter valid responses for each row. Step 1 is "
     "required fields.\"", priority="High", ttype="Negative", auto="UI-CRT-013b")
case("AW-TBL", M, "Publish", "Publish with the row completely untouched must be refused — today it says 'published'",
     setup("Department") + [PUBLISH],
     "Expected: the red \"Please enter valid responses for each row…\". Seen on 3 Nov: green \"Approval workflow has been "
     "successfully published\", the page returns to the list and NOTHING is created. A CS user would believe the workflow "
     "exists.", priority="High", ttype="Negative", auto="UI-CRT-013")
case("AW-TBL", M, "Publish", "A complete workflow publishes and shows in the list with its values",
     setup("Unit Name", "Legal Entity", "Department") + [name_row("QA_Platform AW UI1 Kochi IT"),
                                                          set_cond("Unit Name", "National Clubs -Kochi", "The Lodhi"),
                                                          set_cond("Legal Entity", "DLF LIMITED"), set_cond("Department", "IT"),
                                                          STEP_SELF, PUBLISH],
     PUBLISHED + ": \"National Clubs -Kochi +1 more\", \"DLF LIMITED\", \"IT\", Member, Test - Sumanta Dey.",
     priority="Critical", auto="UI-CRT-029, UI-CRT-031")
case("AW-TBL", M, "Several rows", "'Add Approval Workflow' adds a second row copied from the first; each row becomes its own workflow",
     setup("Department") + [name_row("QA_Platform AW ROW1 IT"), set_cond("Department", "IT"), STEP_SELF,
                             "Click \"Add Approval Workflow\"", "In row 2 type the name \"QA_Platform AW ROW2 HR\", choose Department "
                                                                "\"HR\" and set Step 1 (yourself, 1 day)", PUBLISH],
     "A second row appears. Seen on 3 Nov: it comes empty (name, conditions and step blank) — it is not a copy of row 1; the "
     "copy icon in Action does that. After filling it and publishing, the list shows two workflows (IT and HR), each with its "
     "approver.", priority="High", auto="UI-TBL-020, UI-TBL-020b")
case("AW-TBL", M, "Several rows", "The copy icon duplicates a row; the bin asks before deleting it",
     setup("Department") + [name_row("QA_Platform AW dup"), set_cond("Department", "IT"), STEP_SELF,
                             "Click the copy icon in Action", "Click the bin icon on row 2"],
     "A second identical row appears. The bin asks \"Are you sure you want to delete this approval workflow?\" (red OK). OK "
     "removes the row; Cancel keeps it.", priority="Medium", auto="UI-CRT-025, UI-CRT-026, UI-CRT-027")
case("AW-TBL", M, "Steps", "Add Step adds a Step 4 column; empty extra steps are ignored on Publish",
     setup("Department") + [name_row("QA_Platform AW steps"), set_cond("Department", "IT"), STEP_SELF,
                             "Click \"(+) Add Step\"", PUBLISH, "Open the published workflow through the team's Edit link"],
     "A \"Step 4\" column appears (Steps 1–3 are there from the start). Published with only Step 1 filled, the workflow has one "
     "step. A second filled step makes a two-step approval, in order.", priority="Medium", auto="UI-CRT-028")
case("AW-TBL", M, "Overlap", "Two workflows that match the same PO are both allowed, with no warning",
     setup("Department") + [name_row("QA_Platform AW overlap A"), set_cond("Department", "IT"), STEP_SELF,
                             "Add Approval Workflow; name row 2 \"QA_Platform AW overlap B\", Department \"IT\" and \"HR\"", PUBLISH],
     "Both publish. Nothing warns that an IT PO now matches two workflows; the buyer will have to choose when submitting "
     "(module 8). The requirement asked for a warning — note it.", priority="Medium", ttype="Edge", auto="UI-TBL-023")
case("AW-TBL", M, "Leave", "Leaving the create page with unsaved rows asks first",
     setup("Department") + [name_row("QA_Platform AW draft"), "Click \"Approval Workflows\" in the left menu"],
     "The browser asks \"Are you sure you want to exit creating approval workflow?\". After leaving, the next Create offers to "
     "continue with the saved draft — note the exact wording.", priority="Low", auto="UI-CRT-033")

# ═════════════════════ 4. Edit and delete ═════════════════════
M = "4. Editing and deleting workflows"
case("AW-EDT", M, "Edit values", "Adding a value to a condition and saving updates the workflow",
     [LOGIN, OPEN_WF, "Click \"Edit\" next to \"All Categories\"", "In the row \"QA_Platform AW UI1 Kochi IT\" click the "
                                                                   "\"Department - …\" cell, tick \"HR\" too, Save",
      "Click \"Save Workflow\""],
     "Green \"Approval workflow has been successfully updated\"; the list shows Department \"IT +1 more\". The workflow now "
     "applies to IT or HR. Note: Save Workflow re-sends EVERY workflow of the team, not only the changed one.",
     priority="Critical", auto="UI-EDT-001, UI-EDT-002, UI-EDT-003, UI-EDT-004, UI-EDT-005")
case("AW-EDT", M, "Edit approver", "Changing the approver of a published workflow",
     [LOGIN, OPEN_WF, "Click \"Edit\" next to \"All Categories\"", "In your workflow's row click \"Step 1\", remove yourself, add "
                                                                   "\"Test 2 - Sumanta Dey\", Save, then \"Save Workflow\""],
     "Updated; a PO submitted afterwards goes to Test 2. A PO already waiting for approval keeps its old approver.",
     priority="High", auto="API-EDT-002")
case("AW-EDT", M, "Edit while pending", "Changing a workflow's conditions does not touch POs already waiting for approval",
     [LOGIN, "Submit a PO (module 8) through your workflow so an approval is pending", OPEN_WF,
      "Edit that workflow: change Department to \"Security\" only; Save Workflow", "Open Approvals and the pending request"],
     "The pending request still shows the old workflow name and approver and can still be approved or rejected. A new IT PO "
     "no longer matches the workflow.", priority="High", auto="API-SUB-008, API-EDT-003")
case("AW-EDT", M, "Delete", "Deleting a workflow from the team editor",
     [LOGIN, OPEN_WF, "Click \"Edit\" next to \"All Categories\"", "Click the bin on your workflow's row, OK",
      "Click \"Save Workflow\""],
     "The row is gone and the list no longer shows it. A PO whose submit window had listed it is refused with \"Invalid "
     "Approval\" and must pick again (module 8).", priority="High", auto="UI-EDT-006, API-FLW-019")
case("AW-EDT", M, "Delete", "Deleting a workflow that has a pending approval request",
     [LOGIN, "With a request pending on your workflow (module 8)", OPEN_WF, "Delete that workflow",
      "As the approver, reject the pending request"],
     "The workflow is deleted; the pending request still works — the approver can approve or reject it.", priority="Medium",
     ttype="Edge", auto="UI-SUB-015")
case("AW-EDT", M, "Same name", "Two workflows with the same name are allowed — the buyer cannot tell them apart",
     [LOGIN, OPEN_WF, "Create \"QA_Platform AW twin\" twice with different Departments"],
     "Both publish (names are not unique). In the submit window both show the same name. Raise it as a usability gap.",
     priority="Medium", ttype="Edge", auto="API-FLW-012")

# ═════════════════════ 5. General Details on the PO form ═════════════════════
M = "5. The PO form — General Details"
case("PO-GD", M, "Display", "The PO form opens with General Details on top: seven rows in order",
     OPEN_PO, f"A collapsible section \"General Details\" with the rows {GD_ROWS}. Required rows have a red *. Below it the "
              "vendor block (Demo10, Quick Fill), the line (CHUNKEY CHAT MASALA… Item Code 90030568, PR-369, Item No 15) and "
              "\"Global Component\".", pre=PO_PRE, priority="Critical", auto="UI-PO-001")
case("PO-GD", M, "Form Type", "Form Type is filled with the event's template and locked",
     OPEN_PO + ["Look at Form Type; hover the lock icon; try to click the box"],
     "\"DLF Capex NFA Test RFQ\", the tag \"Auto-filled\", a lock with the tooltip \"Set by the system\"; the box is greyed and "
     "cannot be opened. Even a value sent from outside is ignored — the template's name always wins.", pre=PO_PRE,
     priority="Critical", auto="UI-PO-002, UI-PO-003, API-GD-002, API-SAVE-002")
case("PO-GD", M, "Unit Name", "Unit Name is filled from the purchase requisition line's location, with its code, but is not locked",
     OPEN_PO + ["Look at Unit Name; open its list"],
     "\"National Clubs -Kochi (DLF-021)\" with the tag \"Auto-filled\" and no lock. The list offers only that unit. The "
     "requirement said an auto-filled unit should ideally be locked — it is not, but nothing else can be chosen. Note it.",
     pre=PO_PRE, priority="High", auto="UI-PO-004, UI-PO-005, API-GD-003, API-OPT-001")
case("PO-GD", M, "Unit Name", "PR lines from two locations: the buyer chooses between those two only",
     [LOGIN, "Make an event from two PR lines at two different units (e.g. The Lodhi and The Camellias), award it and open "
             "the PO form", "Open Unit Name"],
     "Unit Name is empty (not filled) and the list offers exactly those two units. Legal Entity is greyed with \"Select Unit "
     "Name first\" until one is chosen.", pre="Two open PR lines at different units (ask CS). On UAT no such event with a "
     "vendor quote existed on 3 Nov, so this could not be run.", priority="High")
case("PO-GD", M, "Unit Name", "PR lines without a location: the units of the buyer's purchase teams are offered",
     [LOGIN, "Award an event whose PR lines have no location (or an event not from a PR) and open the PO form", "Open Unit Name"],
     "Only the units of the teams the buyer belongs to. A team with no units (like \"All Categories\") opens the whole list. "
     "A buyer only in \"Purchase The Lodhi\" sees The Lodhi only.", pre="An awarded event without PR locations. On UAT no "
     "such event could take a new draft on 3 Nov, so this could not be run.", priority="High", ttype="Edge")
case("PO-GD", M, "Legal Entity", "Legal Entity offers only the entities that belong to the chosen unit",
     OPEN_PO + ["Open Legal Entity"],
     "For National Clubs -Kochi: \"DLF LIMITED\" only. (For The Lodhi: DLF CLUB AND HOSPITALITY, DLF LIMITED, LODHI PROPERTY, "
     "RIVERIA; for DLF Emporio Mall: CYBERCITY, DLF LIMITED, PROPERTY DEVELOPER — as in the requirement.)", pre=PO_PRE,
     priority="Critical", auto="UI-PO-006, API-OPT-002, API-OPT-003, API-OPT-004")
case("PO-GD", M, "Legal Entity", "An entity that does not belong to the unit cannot be found or chosen",
     OPEN_PO + ["Open Legal Entity and type \"Lodhi\""],
     "\"No options configured for this selection\"; nothing can be chosen. Sent from outside anyway, it is refused with "
     "\"Selected Legal Entity is not valid for this proposal\".", pre=PO_PRE, priority="High", ttype="Negative",
     auto="UI-PO-015, API-SAVE-003")
case("PO-GD", M, "Legal Entity", "When a unit has exactly one entity it should be chosen for the buyer",
     OPEN_PO + ["With Legal Entity empty, look whether DLF LIMITED (Kochi's only entity) is chosen by itself"],
     "The requirement says yes. As built the form leaves it empty and the buyer must pick DLF LIMITED by hand (lists that "
     "come from the server are never chosen automatically). Raise it.", pre=PO_PRE, priority="Medium", ttype="Edge",
     auto="UI-PO-017")
case("PO-GD", M, "Legal Entity", "Changing the unit clears an entity that no longer fits",
     [LOGIN, "On a PO form with two units to choose from, pick unit A and \"DLF LIMITED\"", "Change the unit to B (which also has "
                                                                                             "DLF LIMITED)", "Change it to a unit without DLF LIMITED"],
     "The requirement: keep the entity when it still fits, clear it when it does not. As built, ANY unit change clears the "
     "entity and shows \"Please select Legal Entity again\". Could not be run on UAT (no PO with two units).",
     pre="A PO form with two selectable units.", priority="High", ttype="Edge")
case("PO-GD", M, "Legal Entity", "No unit chosen: Legal Entity is greyed with 'Select Unit Name first'",
     [LOGIN, "On a PO form with Unit Name empty, click Legal Entity"],
     "Greyed with the placeholder \"Select Unit Name first\". Sent from outside: \"Select Unit Name before Legal Entity\".",
     pre="A PO form with Unit Name empty.", priority="High", ttype="Negative", auto="API-SAVE-009")
case("PO-GD", M, "Department", "Typing in Department narrows the list",
     OPEN_PO + ["Open Department, type \"Mark\"", "Clear the text and read the full list"],
     "Only \"Marketing\"; the full list: Design, Events, F&B Production, HR, HSSE, IT, Marketing, Project, Security, Training. "
     "(The DoA sheet also mentions Admin and Finance — not set up; note it.)", pre=PO_PRE, priority="High",
     auto="UI-PO-008, API-OPT-007")
case("PO-GD", M, "Nature of Expense", "Nature of Expense lists the four values",
     OPEN_PO + ["Open Nature of Expense"],
     "Budgeted with 3 quotes, Budgeted without 3 quotes, Non-budgeted with 3 quotes, Non-budgeted without 3 quotes.",
     pre=PO_PRE, priority="High", auto="UI-PO-011, API-OPT-010")
case("PO-GD", M, "Saving", "Every change is saved at once; a reload shows it",
     OPEN_PO + ["Choose Department \"Marketing\"", "Watch the small spinner next to the box", "Reload the page"],
     "A spinner shows while saving; after the reload Department still reads Marketing. Nothing else on the PO form needs saving "
     "for General Details to stick.", pre=PO_PRE, priority="Critical", auto="UI-PO-008, UI-PO-009, UI-PO-010")
case("PO-GD", M, "Saving", "When saving fails the box goes back and a message shows",
     OPEN_PO + ["Switch the network off (browser Offline), open Nature of Expense", "Switch the network on and try again"],
     "Offline the list cannot load and nothing is saved; a red message appears if a save was attempted. Online again the form "
     "works.", pre=PO_PRE, priority="Medium", ttype="Negative", auto="UI-PO-018")
case("PO-GD", M, "Long text", "Sanction Note and Comments take up to 5,000 characters and save when you leave the box",
     OPEN_PO + ["Paste 5,010 characters into Sanction Note", "Click into Comments"],
     "The box keeps 5,000 characters (the rest is cut). Leaving the box saves it. Sent from outside with 5,001 characters it "
     "is refused with \"Sanction Note must be at most 5000 characters\".", pre=PO_PRE, priority="Medium",
     auto="UI-PO-012, API-SAVE-011, API-SAVE-012")
case("PO-GD", M, "Long text", "Comments with special characters",
     OPEN_PO + ["Type in Comments: Rate & terms: 'single' \"double\" <b>bold</b> 50% off — and leave the box",
                "Type <script>alert(1)</script> and leave the box"],
     "The first text saves and shows as typed after a reload. The second is blocked by the web firewall with a generic error "
     "(the buyer sees a red message, not a field hint) — note it.", pre=PO_PRE, priority="Low", ttype="Edge",
     auto="API-SAVE-013, API-SAVE-013b")
case("PO-GD", M, "Collapse", "The small arrow folds the section to its title",
     OPEN_PO + ["Click the arrow left of \"General Details\"", "Click it again"],
     "Folded: only the title line. Unfolded again: the seven rows with their values.", pre=PO_PRE, priority="Low",
     auto="UI-PO-013")
case("PO-GD", M, "Clear", "Required dropdowns have no x; the two text boxes can be emptied",
     OPEN_PO + ["Hover Legal Entity and look for an x", "Empty Sanction Note and leave the box"],
     "No x on the five required dropdowns. Sanction Note empties and saves empty.", pre=PO_PRE, priority="Low",
     auto="UI-PO-007")
case("PO-GD", M, "Other templates", "A PO form whose template has no General Details shows no section",
     [LOGIN, "Award an event made from a template whose PO template is the standard one (e.g. \"Buy Template\") and open its "
             "PO form"],
     "No \"General Details\" section; the PO form looks as before; Submit Proposal offers the old workflow list.",
     pre="An awarded event on another template with a vendor quote. None could take a new draft on UAT on 3 Nov.",
     priority="High")

# ═════════════════════ 6. Values sent from outside (API) ═════════════════════
M = "6. Values sent from outside the form (API)"
A = dict(role="QA / developer", portal="API")
API_PRE = ("The draft PO form of RFX-2112 and the test user's access token. The checks send values the way the page does "
           "(a developer or QA tool), to prove the server refuses what the page prevents.")
case("PO-API", M, "Read", "Reading the General Details gives the 7 fields in order with their flags, values and labels",
     ["Ask the server for the PO form's General Details"],
     "The reply lists the 7 fields in order with: required or not, locked or not, auto-filled or not, the saved value with "
     "its label (e.g. 12518 → \"National Clubs -Kochi\", code DLF-021), and the list to use.", pre=API_PRE,
     priority="Critical", auto="API-GD-001…006", **A)
case("PO-API", M, "Lists", "A field's list can be searched, paged and follows its parent",
     ["Ask for the Legal Entity list of The Lodhi", "Ask for it without naming a unit (the saved unit is used)",
      "Search Department for 'f'", "Ask for page 2 of Department", "Search Department for '%'"],
     "The Lodhi: 4 entities. Saved unit (Kochi): DLF LIMITED. 'f': F&B Production. Page 2: empty, no more pages. '%': "
     "nothing (it is not a wildcard).", pre=API_PRE, priority="High", auto="API-OPT-003, API-OPT-006…009", **A)
case("PO-API", M, "Lists", "A unit that does not exist, a text field or an unknown field give an empty list, never a crash",
     ["Ask for the Legal Entity list of unit 999999", "Ask for the list of Sanction Note", "Ask for the list of a made-up field"],
     "An empty list every time, no error page.", pre=API_PRE, priority="Medium", ttype="Negative",
     auto="API-OPT-005b, API-OPT-011, API-OPT-012", **A)
case("PO-API", M, "Save", "Saving replaces the whole set; a field left out is cleared; made-up fields are dropped; locked fields keep their value",
     ["Save all five values", "Save four values without Legal Entity", "Save with an extra made-up field",
      "Save with Form Type set to another template"],
     "Saved each time. The second save clears Legal Entity. The made-up field is not kept. Form Type stays \"DLF Capex NFA "
     "Test RFQ\".", pre=API_PRE, priority="Critical", auto="API-SAVE-001, 002, 008, 010", **A)
case("PO-API", M, "Save", "Wrong values are refused with a message naming the field",
     ["Save Legal Entity 'LODHI PROPERTY COMPANY LIMITED' with unit Kochi", "Save unit The Lodhi (not the PR line's)",
      "Save Department 'Finance'", "Save Department 'it' (lower case)", "Save Legal Entity 'dlf limited'",
      "Save Department as a list ['IT','HR']"],
     "Refused each time with \"Selected Legal Entity / Unit Name / Department is not valid for this proposal\". Values must "
     "match exactly, including capital letters.", pre=API_PRE, priority="Critical", ttype="Negative",
     auto="API-SAVE-003…006, 014, 015, 018, 019", **A)
case("PO-API", M, "Save", "A space at the end is trimmed; saving nothing clears the optional fields",
     ["Save Nature of Expense 'Budgeted with 3 quotes ' (with a space)", "Save an empty set"],
     "Trimmed and accepted. The empty set leaves only Form Type (locked) and Unit Name (auto-filled) — note whether a "
     "clearing save should be allowed.", pre=API_PRE, priority="Low", ttype="Edge", auto="API-SAVE-007, API-SAVE-017", **A)
case("PO-API", M, "Who may", "Only the creator of a draft can save; anyone who can see the proposal can read",
     ["Read another user's submitted proposal", "Try to save on it", "Ask for its lists", "Read without logging in"],
     "Read works but says \"not editable\"; save and lists are refused (\"Insufficient parameters\" — the app's standard refusal); "
     "without a login: refused.", pre=API_PRE, priority="High", ttype="Negative", auto="API-PERM-001…007", **A)
case("PO-API", M, "Proposal", "The proposal itself carries the General Details with readable labels",
     ["Read the proposal"],
     "It lists each filled General Details field with its label and the readable value (e.g. Unit Name → \"National Clubs "
     "-Kochi\", Form Type → \"DLF Capex NFA Test RFQ\").", pre=API_PRE, priority="High", auto="API-GD-007", **A)
case("PO-API", M, "Template set-up", "A PO template with a wrong General Details set-up is refused",
     ["As a developer, try to create a PO template whose General Details use a reserved key, a parent field that does not "
      "exist, or two fields that are each other's parent"],
     "Each is refused with a message starting \"general_details_fields: …\" (reserved key / parent does not exist / parent "
     "chain must not be circular). Done on NEW test templates, never on the live one.", pre="Developer access to the API.",
     priority="Medium", ttype="Negative", auto="API-CFG-009", **A)

# ═════════════════════ 7. Workflows created from outside (API) ═════════════════════
M = "7. Workflows created from outside the builder (API)"
WPRE = "The same request the builder sends on Publish, sent by a QA tool, to prove what the server checks without the page."
case("AW-API", M, "Create", "A workflow with 'any of' two units keeps both values with their names",
     ["Create a workflow with Unit Name = The Lodhi or The Camellias", "Read it back"],
     "Created; the condition holds both units with their names; the rule reads 'unit is The Lodhi OR The Camellias'.",
     pre=WPRE, priority="Critical", auto="API-FLW-001, API-FLW-002", **A)
case("AW-API", M, "Create", "All five routing conditions plus a money range in one workflow",
     ["Create a workflow with Form Type, Unit, Legal Entity, Department, Nature of Expense and Total Proposal Value 1–1,00,000"],
     "Created; the rule needs all six at once.", pre=WPRE, priority="High", auto="API-FLW-003", **A)
case("AW-API", M, "Create", "A value that is not in the list is accepted (Department = Finance) — a workflow that can never match",
     ["Create a workflow with Department = 'Finance'"],
     "Should be refused. Seen: accepted. The builder's window prevents this; the server does not.", pre=WPRE,
     priority="Medium", ttype="Negative", auto="API-FLW-005", **A)
case("AW-API", M, "Create", "A made-up condition crashes the server",
     ["Create a workflow with a condition called 'colour' = 'red'"],
     "Should be refused with a message. Seen: a server error (HTTP 500).", pre=WPRE, priority="High", ttype="Negative",
     auto="API-FLW-006", **A)
case("AW-API", M, "Create", "A condition with no values saves a broken rule",
     ["Create a workflow with Unit Name and no values ticked"],
     "Should be refused. Seen: accepted, with an empty rule \"()\". It was not offered to any PO, but a rule that is not "
     "yes/no is a risk — note it.", pre=WPRE, priority="Medium", ttype="Negative", auto="API-FLW-007, API-FLW-007b", **A)
case("AW-API", M, "Create", "The same condition twice saves an impossible rule",
     ["Create a workflow with Department = IT and, again, Department = HR"],
     "Should be refused (one condition per field). Seen: accepted, rule 'Department is IT AND Department is HR' — never "
     "matches.", pre=WPRE, priority="Medium", ttype="Negative", auto="API-FLW-008", **A)
case("AW-API", M, "Create", "A made-up approval type is accepted",
     ["Create a workflow of type 'banana'"],
     "Should be refused. Seen: accepted. Harmless but wrong.", pre=WPRE, priority="Low", ttype="Negative",
     auto="API-FLW-016", **A)
case("AW-API", M, "Create", "Steps and approvers are checked",
     ["Create with no step", "Create a step with no approver", "Create with an approver from another company",
      "Create with a duration of 0, then a negative one"],
     "Refused: \"Approval flow steps can't be blank\" / \"Approval flow steps approvers can't be blank\" (the foreign user is "
     "dropped, so the step is empty) / \"Approval flow steps expires in must be greater than 0\".", pre=WPRE,
     priority="High", ttype="Negative", auto="API-FLW-009, 010, 011, 014, 015", **A)
case("AW-API", M, "Create", "A money range with Max below Min is refused with a generic message",
     ["Create with Total Proposal Value from 1,00,000 to 1"],
     "Refused with \"Something went wrong!\" — right outcome, unhelpful words. Note it.", pre=WPRE, priority="Low",
     ttype="Negative", auto="API-FLW-018", **A)
case("AW-API", M, "Create", "A PO-form condition on an Event Creation workflow is accepted though it can never apply",
     ["Create an Event Creation workflow with Department = IT"],
     "Accepted. An event has no General Details, so this workflow never triggers. The builder only offers these conditions "
     "under Bid Proposal — note it for the API.", pre=WPRE, priority="Low", ttype="Edge", auto="API-FLW-017", **A)
case("AW-API", M, "List of values", "The server's list of condition values matches what the builder shows",
     ["Read the list of conditions and their values"],
     "Form Type: 29 templates. Unit Name: 34 locations. Legal Entity: 7, each with the units it belongs to. Department: 10. "
     "Nature of Expense: 4. ATRIUM PLACE DEVELOPERS belongs to no unit (its unit APPDL-THAP does not exist on UAT).",
     pre=WPRE, priority="High", auto="API-CAT-001…005", **A)
case("AW-API", M, "Delete", "Deleting needs the workflow's web id, not its number",
     ["Delete a test workflow by its number", "Delete it by its web id"],
     "By number: \"Approval Flow not found\". By web id: deleted and gone from the list.", pre=WPRE, priority="Medium",
     auto="API-FLW-019", **A)

# ═════════════════════ 8. Submitting ═════════════════════
M = "8. Submitting the PO form — which workflow is used"
MPRE = PO_PRE + " " + MY_FLOWS + " The proposal is worth ₹9,000 (90 × ₹100)."
case("PO-SUB", M, "Submit window", "Submit Proposal shows only the workflows that match the General Details",
     OPEN_PO + [FILL, SUBMIT_PO],
     "The window \"Submit Proposal\" shows the warning \"Submitting this proposal will revoke all active counter offers in this "
     "project.\", then \"Select Approval Workflow\" with SUB-A and SUB-B. Not shown: \"GD Test - CAPEX…\" (Admin initiators), "
     "the company \"test\" workflows (team workflows win), workflows for other units or departments.", pre=MPRE,
     priority="Critical", auto="UI-SUB-000, UI-SUB-001, UI-SUB-002, UI-SUB-002b, API-MAT-001…010")
case("PO-SUB", M, "Rules", "All conditions must hold; within one field any ticked value counts; no condition means any value",
     ["Create \"M1 Department IT\", \"M2 Department HR\", \"M3 Department IT or HR\", \"M4 Kochi and IT\", \"M5 Lodhi and IT\", "
      "\"M9 no conditions\", \"M10 Form Type DLF Capex NFA Test RFQ\", \"M11 Form Type Buy Template\", \"M12 Legal Entity DCHL\"",
      "With the PO at Kochi / DLF LIMITED / IT / Budgeted with 3 quotes, open the submit window and read the list",
      "Change Department to HR and open it again"],
     "IT: M1, M3, M4, M9, M10 are offered; M2, M5, M11, M12 are not. HR: M2, M3, M9, M10 are offered; M1 and M4 disappear. "
     "The list changes the moment a field changes.", pre=MPRE, priority="Critical",
     auto="API-MAT-001…003, API-MAT-006…008, API-MAT-011")
case("PO-SUB", M, "Rules", "A money range combines with the fields",
     ["Create \"M7 IT and value 1–5,000\" and \"M8 IT and value 5,000–20,000\"", "With Department IT (₹9,000) read the list"],
     "M8 is offered, M7 is not (9,000 is outside 1–5,000).", pre=MPRE, priority="High", auto="API-MAT-005")
case("PO-SUB", M, "Rules", "The pre-made Member workflow matches F&B Production + Non-budgeted without 3 quotes",
     OPEN_PO + ["Set Department \"F&B Production\" and Nature of Expense \"Non-budgeted without 3 quotes\"", SUBMIT_PO],
     "\"GD Test - Non-budgeted without 3 quotes - F&B Production\" is offered (its initiators are Members).", pre=MPRE,
     priority="High", auto="API-MAT-013")
case("PO-SUB", M, "Choose", "Several matches: the buyer picks one, sees its summary and submits",
     OPEN_PO + [FILL, SUBMIT_PO, "Tick \"QA_Platform AW SUB-B\" and click the blue button", "Read the summary",
                "Type closing remarks and click \"Submit Proposal\""],
     "\"Approval Flow Name SUB-B\", \"An approval workflow will be sent to the following members:\" Step 1 Test - Sumanta Dey. "
     "Green \"Proposal submitted successfully\"; the proposal is now waiting for approval.", pre=MPRE, priority="Critical",
     auto="UI-SUB-003, UI-SUB-007, UI-SUB-008")
case("PO-SUB", M, "Choose", "One match: the window goes straight to the summary",
     OPEN_PO + [FILL, "Make sure only SUB-B matches (delete SUB-A)", SUBMIT_PO],
     "No list to choose from — the SUB-B summary appears at once.", pre=MPRE, priority="High", auto="UI-SUB-006")
case("PO-SUB", M, "Changed meanwhile", "A field changed after the window opened: Submit is refused and the list reloads",
     OPEN_PO + [FILL, SUBMIT_PO, "Tick SUB-A (Kochi AND IT) and go to its summary", "In another tab change Department to HR",
                "Back in the window click \"Submit Proposal\""],
     "Red \"Invalid Approval\"; the window stays open and now lists only what matches HR (SUB-B). Pick it and submit.",
     pre=MPRE, priority="Critical", ttype="Negative", auto="UI-SUB-004, UI-SUB-005, API-SUB-005")
case("PO-SUB", M, "Incomplete", "Submitting with a required General Details field empty is refused with 'Please fill …'",
     OPEN_PO + ["Leave Legal Entity empty, fill the rest", SUBMIT_PO, "Pick a workflow and submit"],
     "Red \"Please fill Legal Entity\". With three empty: \"Please fill Legal Entity, Department, Nature of Expense\". (The list of "
     "workflows is still shown; the refusal comes on Submit.)", pre=MPRE, priority="Critical", ttype="Negative",
     auto="API-SUB-003, API-SUB-004, API-MAT-012")
case("PO-SUB", M, "No choice", "Submitting without choosing while several match is refused",
     ["Send the submit without a workflow while two match (the window always ticks the first, so this is an outside check)"],
     "\"Please select an approval workflow\". The same for a made-up workflow id.", pre=MPRE, priority="High",
     ttype="Negative", auto="API-SUB-001, API-SUB-006", **A)
case("PO-SUB", M, "Wrong workflow", "Submitting with a workflow that exists but does not match is refused",
     ["Send the submit naming \"GD Test - CAPEX - any unit - IT\" (an Admin workflow)"],
     "\"Invalid Approval\".", pre=MPRE, priority="High", ttype="Negative", auto="API-SUB-002", **A)
case("PO-SUB", M, "No match", "When nothing matches the PO must not go through — cannot be tried on DLF UAT",
     ["On a company without catch-all workflows, fill a combination no workflow covers", "Submit"],
     "Expected: \"No approval workflow is configured for the selected combination\" and no submission. On DLF UAT the three "
     "company \"test\" workflows match every PO, so this state cannot be reached. CS must delete them before go-live.",
     pre="A company (or DLF after the 'test' workflows are removed) with no catch-all workflow.", priority="Critical",
     ttype="Negative", auto="API-SUB-007")
case("PO-SUB", M, "Catch-all", "When no team workflow matches, the company 'test' workflow for the buyer's role is used",
     OPEN_PO + ["Set a combination none of your workflows cover (e.g. Department Security)", SUBMIT_PO],
     "The window shows the company workflow \"test\" (approvers Testing-T and VAIB-TEST — real users). Do NOT submit; click "
     "Cancel.", pre=MPRE, priority="High", ttype="Edge", auto="API-MAT-009")
case("PO-SUB", M, "From outside", "Submitting from outside with a bare request crashes instead of refusing",
     ["Send the submit with only remarks (no attachments list, no step map)"],
     "Expected a refusal. Seen: a server error (HTTP 500). The page always sends the full shape, so buyers never hit it; "
     "integrations might.", pre=MPRE, priority="Low", ttype="Negative", auto="API-SUB-000", **A)
case("PO-SUB", M, "From outside", "Submitting from outside with the page's full shape works",
     ["Send the submit the way the page does, naming your matching workflow"],
     "Accepted; the proposal is waiting for approval.", pre=MPRE, priority="High", auto="API-SUB-008", **A)

# ═════════════════════ 9. After submission ═════════════════════
M = "9. After submission — history, read-only, approver, reject, withdraw, approve"
case("PO-AFT", M, "History", "The approval request records what was matched",
     ["After a submit, read the request (initiator's Approvals list / the request record)"],
     "Pending, with the chosen workflow's name, and a record of: the five values, the workflow, its rule, how many matched, "
     "whether the buyer chose among several, and when.", pre=MPRE, priority="High", auto="UI-SUB-008")
case("PO-AFT", M, "Read-only", "After submission General Details can no longer be changed",
     OPEN_PO + ["Open the submitted proposal's PO form"],
     "The section shows plain values — no dropdowns, no text boxes. A save sent from outside is refused.", pre=MPRE,
     priority="Critical", auto="UI-SUB-009, UI-SUB-010")
case("PO-AFT", M, "Approver", "The approver sees the request, but not the General Details",
     [LOGIN, "Open \"Approvals\" (Pending on me); open the RFX-2112 request"],
     "The request is listed (Event name, Approval Type, Team, Proposal Value, Initiator). The link opens the proposal page, "
     "which does not show Unit Name, Legal Entity, Department or Nature of Expense. The requirement said approvers should see "
     "them; the build left it out — raise it.", pre=MPRE, priority="High", ttype="Edge", auto="UI-SUB-011, UI-SUB-012")
case("PO-AFT", M, "Approve", "Approving the request completes the approval",
     [LOGIN, "Open Approvals, open the request, click Approve, add remarks, confirm"],
     "The request becomes approved and the proposal moves on (no longer waiting). The General Details stay as they were, "
     "read-only.", pre=MPRE + " Use a run where the approver is yourself.", priority="High",
     auto="API-AFT-004, API-AFT-004b")
case("PO-AFT", M, "Reject", "Rejecting sends the PO back to draft and the new draft keeps the General Details",
     [LOGIN, "Open Approvals, open the request, click Reject with remarks", "Open the event's awarding page and the PO form again"],
     "The request is rejected; a new draft proposal exists for the event and its General Details show the same values, "
     "editable; Submit Proposal matches again.", pre=MPRE, priority="Critical", auto="UI-SUB-013, UI-SUB-013b, UI-SUB-014")
case("PO-AFT", M, "Withdraw", "The buyer can withdraw the pending request",
     [LOGIN, "Open Approvals (Initiated by me), open the pending request, click Withdraw"],
     "The request is withdrawn; the proposal is a draft again with editable General Details; submitting matches again.",
     pre=MPRE, priority="Medium", auto="API-AFT-006")
case("PO-AFT", M, "Expiry", "With Prevent Approval Expiry off the request expires after the step's duration",
     ["Publish a workflow with Prevent Approval Expiry OFF and a short duration, submit, wait"],
     "The request expires after the duration; with the switch ON it never expires. Not run: expiry runs on a schedule that "
     "cannot be waited for in a test session.", pre=MPRE, priority="Low", ttype="Edge")
case("PO-AFT", M, "PO list", "Filters and export by General Details on the Purchase Orders list — not built",
     [LOGIN, "Open \"Purchase Orders\"; look for filters or columns on Unit Name / Legal Entity / Department; try the export"],
     "The requirement asked for them; the build left them out. Note what exists.", priority="Low", ttype="Edge",
     auto="UI-AFT-008")

# ═════════════════════ 10. Set-up for a client ═════════════════════
M = "10. Setting it up for a client (CS)"
case("AW-CFG", M, "Template switch", "The routing switch on the PO template turns the feature on and off",
     ["As a developer, switch routing off on a COPY of the PO template linked to a copy of the event template; award an event "
      "made from it; open the PO form and submit"],
     "The General Details section still shows (fields are set up) but Submit lists every applicable workflow as before, and "
     "empty required fields are not enforced. With the switch on, both apply. Not run: needs a developer's template copy.",
     pre="Copies of the two templates.", priority="High", role="Developer + Buyer", portal="Rails console + Buyer portal")
case("AW-CFG", M, "Template switch", "Removing the General Details set-up hides the section",
     ["On the copy, remove the General Details fields; open a PO form"],
     "No section at all. Not run: needs a developer's template copy.", pre="A copy of the PO template.", priority="Medium",
     role="Developer + Buyer", portal="Rails console + Buyer portal")
case("AW-CFG", M, "Keeping lists in step", "New locations or templates reach the builder only after the sync script",
     ["Add a location \"QA_Platform Hub\"; open the builder's Unit Name window", "Run the sync script; open the window again"],
     "Before the script the new location is missing from the builder (but already offered on the PO form); after it, it "
     "appears. Tell CS: every new unit, template or list value needs the script. Not run: needs a developer.",
     pre="Developer access to UAT.", priority="High", ttype="Edge", role="Developer + Buyer", portal="Rails console + Buyer portal")
case("AW-CFG", M, "Entity mapping", "The unit → legal entity mapping lives in the uploaded data rows",
     ["Upload a legal-entity row \"QA_Platform ENTITY\" mapped to The Lodhi", "Open a Lodhi PO form's Legal Entity"],
     "The new entity appears for The Lodhi only (and in the builder after the sync). Not run: needs upload rights.",
     pre="Upload rights.", priority="Medium", role="CS", portal="Admin console")
case("AW-CFG", M, "Go-live", "The three company-level 'test' workflows must go before go-live",
     ["On the Company tab read the three \"test\" workflows"],
     "While they exist, every PO always finds a workflow and a combination CS forgot is silently routed to all super admins / "
     "managers / members. Put it on the go-live checklist.", priority="Critical", ttype="Edge", auto="API-CFG-005")
case("AW-CFG", M, "Names", "The condition names show the template's name, '(Test)' included",
     [LOGIN, OPEN_WF, "Read the column headers"],
     "\"… - DLF PO - General Details (Test)\". The live template must be given its real name before the conditions are "
     "created, or every header will say (Test).", priority="Medium", ttype="Edge", auto="API-CFG-006")

# ═════════════════════ 11. Every button ═════════════════════
M = "11. Every button and box, once"
for where, items, steps, auto in [
    ("Approval Workflows list", ["Team / Company tabs", "filter icon", "+ Create", "team chevron", "Edit", "row click", "page arrows and box", "column sorters"], [LOGIN, OPEN_WF], "UI-BTN-001"),
    ("Trigger Settings panel", ["Add Approval Type", "chip x", "Add Conditions", "Add Team", "Add Initiators", "Cancel", "Save"], [LOGIN, OPEN_WF, CLICK_CREATE, OPEN_DRAWER], "UI-BTN-002"),
    ("Conditions table", ["copy", "bin", "Name cell", "Prevent Approval Expiry switch", "each condition cell (search, tick, bin, Cancel, Save)", "Step cell (Fixed/Dynamic, approvers, duration unit, title, bin)", "Add Approval Workflow", "Add Step", "Publish Workflow", "summary Edit"], setup("Unit Name", "Department"), "UI-BTN-003"),
    ("PO form General Details", ["arrow", "each dropdown (search, pick)", "lock tooltip", "Sanction Note", "Comments", "Submit Proposal"], OPEN_PO, "UI-BTN-004"),
    ("Submit window", ["workflow list / search", "Next", "Back", "Closing Remarks", "attachment clip", "Submit Proposal", "Cancel / x"], OPEN_PO + [SUBMIT_PO], "UI-BTN-005"),
]:
    case("AW-BTN", M, where, f"{where}: every control does what its name says and can be reached with the Tab key",
         steps + [f"Use each in turn: {', '.join(items)}", "Press Tab repeatedly and watch the focus move"],
         "Each control responds, shows a hand pointer, and does only what its label says. Tab reaches every control. Note any "
         "control that does nothing or something else.", priority="Medium",
         pre=PO_PRE if "PO form" in where or "window" in where else DEFAULT_PRE, auto=auto)


RULES = [
    ("What decides the approval", "Five dropdowns in the PO form's General Details: Form Type (the event's template, locked), Unit Name "
     "(the PR line's location, or the buyer's teams' units), Legal Entity (depends on Unit Name), Department, Nature of Expense. "
     "Sanction Note and Comments are notes only."),
    ("How a workflow is matched", "Only Bid Proposal workflows whose team includes the buyer in the stated role (Member/Manager/Admin) count. "
     "If any TEAM workflow matches, the COMPANY ones are ignored. Each condition means 'the PO's value is one of these'; every "
     "condition must hold; a field without a condition accepts any value. Total Proposal Value and the older conditions combine "
     "the same way."),
    ("What Submit does", "One match: used. Several: the buyer picks. None: the PO cannot be submitted (never reachable on DLF UAT while the "
     "three company 'test' workflows exist). Required field empty: 'Please fill …'. Chosen workflow no longer matching: 'Invalid "
     "Approval' and the list reloads."),
    ("After Submit", "General Details become read-only; the request records the values, the workflow, how many matched and whether the "
     "buyer chose. Reject or withdraw → a new draft with the same values."),
    ("Where the lists come from", "Form Type: event templates. Unit Name: the company's locations (34 on UAT, some junk). Legal Entity, "
     "Department, Nature of Expense: uploaded data rows, the entity rows mapped to units. The builder's values come from a sync "
     "script a developer runs."),
    ("Asked for but not built", "Lists in the builder that follow the unit; an overlap warning; choosing a lone entity automatically; "
     "keeping a still-valid entity when the unit changes; General Details on the approver's page; PO list filters and export; "
     "locking an auto-filled Unit Name."),
]
FOUND = [
    ("High", "Publish with an untouched row says 'successfully published' and creates nothing", "The empty row is skipped by the check and an empty request is sent; the page goes back to the list with a green message.", "Live run 3 Nov: the request carried no workflow; the list was unchanged.", "AW-TBL-017"),
    ("High", "Saving an empty Trigger Settings panel blanks it", "Fields replaced by grey loading bars, no 'cannot be empty' message; only Cancel works (when Save is clicked before the lists load).", "Screenshot probe2-drawer-empty-save.", "AW-TRG-007"),
    ("High", "Cancel on the Trigger Settings panel keeps the choices", "Reopening shows Bid Proposal, the condition chip and the old 'Team cannot be empty' error.", "Live run 3 Nov, screenshot M-06b.", "AW-TRG-009"),
    ("High", "A made-up condition sent from outside crashes the server", "", "HTTP 500 seen on 3 Nov.", "AW-API-004"),
    ("High", "Initiator-role trap", "Workflows for 'Admin' initiators (including the pre-made GD Test – CAPEX ones) are invisible to a Member; CS can build workflows nobody triggers without knowing.", "Live run 3 Nov.", "AW-TRG-006"),
    ("Medium", "From outside, the server accepts values not in the list, the same condition twice, empty value lists and a made-up approval type", "Rules like 'Department is Finance', 'IT and HR', '()' and type 'banana' were saved.", "Live run 3 Nov.", "AW-API-003, 005, 006, 007"),
    ("Medium", "Unit Name list in the builder is the raw location list", "'-', 'Free Text', 'Plant Name', 'Project BOQ team', 'AMBUJA NEOTIA', two 'DLF Golf and Country Club'.", "Live run 3 Nov, screenshot B-11.", "AW-TBL-005"),
    ("Medium", "Builder windows ignore the unit → entity link; no overlap warning", "Kochi + LODHI PROPERTY can be saved; overlapping workflows publish silently.", "Live run 3 Nov.", "AW-TBL-008, AW-TBL-024"),
    ("Medium", "Approvers do not see the General Details; no PO-list filters/export", "Requirement not met (left out of the build).", "Live run 3 Nov.", "PO-AFT-003, PO-AFT-008"),
    ("Medium", "A unit's only entity is not chosen automatically; any unit change clears the entity", "Requirement rules not followed for server-backed lists.", "Live run 3 Nov (lone entity); code for the clearing.", "PO-GD-008, PO-GD-009"),
    ("Low", "Submit from outside with a bare request → server error; reversed money range → 'Something went wrong!'; typo 'choosen'; the reject call's error names values it does not take", "", "Live run 3 Nov.", "PO-SUB-012, AW-API-009, AW-TBL-011, PO-AFT-005"),
    ("Low", "Comments with a <script> tag are blocked by the web firewall with a plain error page", "The buyer sees a generic error, not a field hint.", "Live run 3 Nov.", "PO-GD-016"),
    ("Info", "'No workflow matches' cannot be tested on DLF UAT", "Three company-level 'test' workflows with no conditions catch every PO; delete them before go-live.", "Company tab, 3 Nov.", "PO-SUB-011, AW-CFG-005"),
]

if __name__ == "__main__":
    mods = OrderedDict()
    for c in CASES:
        mods.setdefault(c["Module"], []).append(c)
    OUT_DIR.mkdir(exist_ok=True)
    (OUT_DIR / "data.json").write_text(json.dumps({"cases": CASES, "rules": RULES, "found": FOUND, "modules": list(mods.keys()), "cols": COLS}, ensure_ascii=False, indent=1))
    print(f"{len(CASES)} cases in {len(mods)} modules")
    for m, cs in mods.items():
        print(f"  {len(cs):3d}  {m}")
    print("with a live check:", sum(1 for c in CASES if c["Checked by (automation id)"]))
