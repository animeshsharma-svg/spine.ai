#!/usr/bin/env python3
"""Approval Workflows — Bid Proposal routing by the PO form's General Details (DLF Hospitality first).

Test cases for people, in the team's house style, in the order a tester works:
the workflow builder (Approval Workflows → Create → Trigger Settings → conditions → steps → Publish),
the General Details section of the PO form after awarding, the dependent dropdowns, the matching of
workflows, the submit outcomes, the approval history, and the APIs behind it all.

Facts come from: the PRD "Custom Fields and Condition-Based Approval Routing on the PO Form – V2",
backend PR Procol-Tech/procol-backend#17421 (feat/conditional-approval-routing, read 3 Nov 2026),
dashboard commit 02e23631e8 (General Details section), the DLF UAT data (PO template 7503, RFQ
template 6686, 34 units, 7 legal entities, 10 departments, 4 natures of expense), and the live run of
3 Nov 2026 on cpanel.ag-ri.in (scripts procol-ui-tests/scripts/aw-*.ts; results merged by
build-approval-routing-results.py).

Output: Approval_Routing_Test_Cases.xlsx + approval-routing/data.json (+ index.html from the page builder)."""
import json
from collections import Counter, OrderedDict
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

HERE = Path(__file__).resolve().parent
OUT_XLSX = HERE / "Approval_Routing_Test_Cases.xlsx"
OUT_DIR = HERE / "approval-routing"

COLS = ["Test Case ID", "Module", "Scenario", "Test Case Title", "User Role", "Portal", "Pre-conditions",
        "Configs Needed", "Test Data", "Test Steps", "Expected Result", "Priority", "Test Type", "Status",
        "Automated check", "Notes for the tester"]

CASES = []
_n = Counter()


def case(prefix, module, scenario, title, steps, expected, *, pre="-", data="-", priority="High", ttype="Positive",
         role="Buyer admin (super admin)", portal="Buyer portal (cpanel)", configs="None", note="", auto=""):
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
        "Automated check": auto, "Notes for the tester": note,
    })


# ── the people, places and clicks every case repeats ───────────────────────────────────────────
DEFAULT_PRE = ("DLF Hospitality on UAT (cpanel.ag-ri.in). The test user is a super admin and a Member of the team "
               "\"All Categories\". Name every workflow you create \"QA_Platform …\" and make yourself its only "
               "approver, so no real approver is disturbed; delete them when you finish.")
LOGIN = "Log in to Procol (buyer side, cpanel.ag-ri.in) with the DLF Hospitality test user"
OPEN_WF = ("From the left menu open Approvals and click \"Approval Workflows\". The page opens on the \"Team\" tab "
           "with a table (Name, Approval Type, Prevent Approval Expiry, Total Proposal Value, the five "
           "\"… - DLF PO - General Details (Test)\" columns) and a blue \"+ Create\" button")
CLICK_CREATE = "Click \"+ Create\". The page \"Setup New Team Approval Workflow\" opens with a dashed box \"+ Add Trigger Settings\""
OPEN_DRAWER = "Click \"+ Add Trigger Settings\". The \"Trigger Settings\" drawer opens on the right with the box \"Approval Type\""
PICK_BID = "Click \"Add Approval Type\" and pick \"Bid Proposal\". It appears as a chip with an x, and the \"Conditions\" box appears below"


def add_conditions(*names):
    return (f"Click \"Add Conditions\" and pick {', '.join(f'\"{n} - DLF PO - General Details (Test)\"' for n in names)}. "
            "Each appears as a chip with an x")


PICK_TEAM = "Click \"Add Team\" and pick \"All Categories\". Click \"Add Initiators\" and pick \"Member\""
SAVE_DRAWER = ("Click \"Save\" at the bottom of the drawer. The page now shows the \"Bid Proposal\" summary (Trigger "
               "Conditions, Applicable Teams, Initiators) and a table with one empty row: Action, Name (optional), "
               "Prevent Approval Expiry, one column per condition, Step 1, Step 2, Step 3")
NEW_FLOW = [LOGIN, OPEN_WF, CLICK_CREATE, OPEN_DRAWER, PICK_BID]


def setup(*conds):
    return NEW_FLOW + [add_conditions(*conds), PICK_TEAM, SAVE_DRAWER]


def name_row(n):
    return f"Click the empty \"Name (optional)\" cell, type \"{n}\" in the small box and click \"Save\""


def set_cond(label, *values):
    v = " and ".join(f"\"{x}\"" for x in values)
    return (f"Click the \"{label} - DLF PO - General Details (Test)\" cell. A picker \"Select {label} - …\" opens with the "
            f"hint \"Match {label} - … with any of the selected options\". Type part of the name, pick {v}, then click \"Save\"")


STEP_SELF = ("Click the \"Step 1\" cell. In the popover keep Step Type \"Fixed\", click \"Step 1 Approvers\", type "
             "\"Sumanta\" and pick \"Test - Sumanta Dey (sumonto.dey@gmail.com)\" (yourself); type 1 in \"Approval "
             "Duration\" with \"Day(s)\"; click \"Save\"")
PUBLISH = "Click the blue \"Publish Workflow\" at the top right"
PUBLISHED = ("Green message \"Approval workflow has been successfully published\"; back on the Approval Workflows list, "
             "the new row shows the name, \"Bid Proposal\", \"Enabled\" and the chosen values in the condition columns")

# PO form side
PO_PRE = ("A PR-based RFQ on DLF Hospitality made from the template \"DLF Capex NFA Test RFQ\" (its PO template is "
          "\"DLF PO - General Details (Test)\", routing on), with a vendor response, awarded to the vendor so that the PO "
          "form is open as a draft. On UAT: RFX-2112 (PR-369 item 15, unit National Clubs -Kochi) with vendor Demo10. "
          "The test user created the draft.")
OPEN_PO = [LOGIN, "From the left menu click \"Events\", open the awarded event (RFX-2112) and click \"Create PO\" / open its "
                  "draft proposal. The page \"PO Form / RFX-2112\" opens with the \"General Details\" section on top and "
                  "\"Submit Proposal\" at the top right"]
GD_ROWS = ("Form Type* (Auto-filled, lock), Unit Name* (Auto-filled), Legal Entity*, Department*, Nature of Expense*, "
           "Sanction Note, Comments")
SUBMIT = "Click \"Submit Proposal\" at the top right"
VENDORS = "Only test vendors (Demo10 on RFX-2112). Never award a real supplier's event for a test."

# ═════════════════════ 1. The Approval Workflows list ═════════════════════
M = "1. Approval Workflows list"
case("AW-LST", M, "Open the page", "Approval Workflows opens on the Team tab with one column per routing condition",
     [LOGIN, OPEN_WF, "Read the column headers; scroll the table to the right"],
     "Tabs \"Team\" and \"Company\". Columns: Name, Approval Type, Prevent Approval Expiry (with an info icon), Total "
     "Proposal Value, then \"Form Type - DLF PO - General Details (Test)\", \"Unit Name - …\", \"Legal Entity - …\", "
     "\"Department - …\", \"Nature of Expense - …\", then Step columns. A filter icon at the left, \"+ Create\" at the right, "
     "the team block \"All Categories\" with a count and an \"Edit\" link, pagination \"1 / 4\" below.", priority="Critical",
     auto="UI-LST-001, UI-LST-002")
case("AW-LST", M, "Column values", "A workflow's condition values show in its columns, with '+N more' for several values",
     [LOGIN, OPEN_WF, "Find \"GD Test - CAPEX - Lodhi / Camellias - DLF entities\""],
     "Form Type column: \"DLF Capex NFA Test RFQ\" (the template's name, not an id); Unit Name: \"The Lodhi +1 more\"; "
     "Legal Entity: \"DLF LIMITED +1 more\". Hovering or clicking \"+1 more\" lists the rest. Empty columns mean "
     "\"any value\".", priority="High", auto="UI-LST-001")
case("AW-LST", M, "Company tab", "The Company tab lists the company-level workflows (the three 'test' catch-alls)",
     [LOGIN, OPEN_WF, "Click the \"Company\" tab"],
     "Three rows named \"test\" (Bid Proposal, Enabled) with every condition column empty: they match every PO. Record "
     "them — they decide what happens when no team workflow matches (module 8).", priority="High", auto="UI-LST-004")
case("AW-LST", M, "Filter", "The filter narrows the list by approval type and by a routing field value",
     [LOGIN, OPEN_WF, "Click the filter icon at the left; pick Approval Type \"Bid Proposal\"",
      "Add the filter \"Unit Name - DLF PO - General Details (Test)\" = \"The Lodhi\""],
     "Only Bid Proposal workflows stay; then only those whose Unit Name condition includes The Lodhi (\"GD Test - CAPEX "
     "- Lodhi / Camellias…\"). Workflows with no Unit Name condition are not shown by that filter — record whether that "
     "is wanted (they also apply to The Lodhi).", priority="Medium")
case("AW-LST", M, "Pagination", "Paging through the Team list",
     [LOGIN, OPEN_WF, "Click \">\" to page 2, 3, 4; type 1 in the page box"],
     "Each page shows the next workflows; the page box accepts a number; \"<\" is greyed on page 1 and \">\" on the last.",
     priority="Low", auto="UI-LST-003")
case("AW-LST", M, "Open for editing", "Clicking a row opens it in the editor",
     [LOGIN, OPEN_WF, "Click the row \"hello\""],
     "The page \"Edit Team Workflows - hello\" (address /approvals-workflows/edit/<id>?approvalType=team) opens with the "
     "trigger summary, the table filled with its values and the button \"Save Workflow\".", priority="High", auto="UI-EDT-001")

# ═════════════════════ 2. Trigger Settings drawer ═════════════════════
M = "2. Create a workflow — Trigger Settings drawer"
case("AW-TRG", M, "Create page", "Create opens an empty 'Setup New Team Approval Workflow' page",
     [LOGIN, OPEN_WF, CLICK_CREATE],
     "Heading \"Setup New Team Approval Workflow\"; only the dashed box \"+ Add Trigger Settings\"; no Publish button yet "
     "(it appears after trigger settings are saved).", priority="Critical", auto="UI-CRT-001, UI-CRT-012")
case("AW-TRG", M, "Approval types", "Approval Type lists every approval kind of the company",
     [LOGIN, OPEN_WF, CLICK_CREATE, OPEN_DRAWER, "Click \"Add Approval Type\" and read the list"],
     "Quote Selection, Bid Proposal, Technical Evaluation, Event Creation, Surrogate Bid Creation, Create Product, "
     "Reorder Proposal, Create User, Vendor Onboarding, Intake Request, PR Completion, Purchase Request Removal. "
     "Bid Proposal is the one that runs when a buyer submits the PO form after awarding.", priority="High", auto="UI-CRT-003")
case("AW-TRG", M, "Conditions", "Conditions for Bid Proposal include the five General Details fields, each marked '(Test)' with the PO template's name",
     NEW_FLOW + ["Click \"Add Conditions\" and read the list"],
     "Auction Rank, Total Proposal Value, PR Price, then \"Form Type - DLF PO - General Details (Test)\", \"Unit Name - …\", "
     "\"Legal Entity - …\", \"Department - …\", \"Nature of Expense - …\". (Intake Request Condition, PO Value, TNA score "
     "count are also listed although they belong to other approval types — record.) The \"(Test)\" is part of the PO "
     "template's name \"DLF PO - General Details (Test)\": on go-live the production template must be named without it.",
     priority="Critical", auto="UI-CRT-005")
case("AW-TRG", M, "Conditions", "Several conditions can be added; a chosen one leaves the list; the x removes it",
     NEW_FLOW + [add_conditions("Unit Name", "Legal Entity", "Department"), "Open \"Add Conditions\" again",
                 "Click the x on the \"Legal Entity\" chip"],
     "Three chips appear in the order picked. The open list no longer offers Unit Name, Legal Entity or Department. "
     "After the x, Legal Entity is gone from the chips and offered again in the list.", priority="High",
     auto="UI-CRT-006, UI-CRT-007")
case("AW-TRG", M, "Team and initiators", "Team lists the purchase teams; Initiators offers Member, Manager, Admin",
     NEW_FLOW + [add_conditions("Department"), "Click \"Add Team\" and read the list; pick \"All Categories\"",
                 "Click \"Add Initiators\" and read the list"],
     "Teams: All Categories, Evaluator, Project Purchase, Purchase Approver Team, Purchase Club 3/4/5, Purchase Club Vita, "
     "Purchase Corporate DLF Hospitality, … (33 teams). Initiators: Member, Manager, Admin. Only ONE team and ONE "
     "initiator role can be picked (\"You cannot select more …\" when you try a second).", priority="High",
     auto="UI-CRT-008, UI-CRT-009")
case("AW-TRG", M, "Initiator role matters", "The initiator role decides who the workflow applies to — a Member never triggers an 'Admin' workflow",
     NEW_FLOW + [add_conditions("Department"), "Pick team \"All Categories\" and initiator \"Admin\"", SAVE_DRAWER,
                 name_row("QA_Platform AW admin-only IT"), set_cond("Department", "IT"), STEP_SELF, PUBLISH,
                 "Open the draft PO form of RFX-2112 (module 5) with Department = IT and click \"Submit Proposal\""],
     "The workflow publishes, but the submit modal does NOT list \"QA_Platform AW admin-only IT\": the test user is a "
     "Member of All Categories, not an Admin. The pre-existing \"GD Test - CAPEX …\" workflows (initiators Admin) are "
     "invisible to this user for the same reason. Record this clearly for CS: the initiator role is part of the match.",
     priority="Critical", ttype="Negative", auto="API-MAT-004, API-MAT-010, UI-SUB-002")
case("AW-TRG", M, "Save empty", "Saving the drawer with nothing picked must show 'Approval Type cannot be empty'",
     [LOGIN, OPEN_WF, CLICK_CREATE, OPEN_DRAWER, "Click \"Save\" without picking anything"],
     "Expected: the drawer stays open with \"Approval Type cannot be empty\" under the box. Seen on 3 Nov: the fields "
     "vanish and the drawer shows grey loading bars with no message; only Cancel gets you out (bug).", priority="High",
     ttype="Negative", auto="UI-CRT-032")
case("AW-TRG", M, "Save partial", "Saving with an approval type but no team",
     NEW_FLOW + [add_conditions("Department"), "Click \"Save\" without a team"],
     "\"Team cannot be empty\" (or the equivalent) under the Team box; the drawer stays open. Record the exact words.",
     priority="Medium", ttype="Negative")
case("AW-TRG", M, "Cancel", "Cancel closes the drawer and keeps the page empty",
     NEW_FLOW + ["Click \"Cancel\""],
     "The drawer closes; the page still shows only \"+ Add Trigger Settings\". Opening it again starts empty.", priority="Low")
case("AW-TRG", M, "Edit trigger", "Edit on the Bid Proposal summary reopens the drawer with the chosen settings",
     setup("Unit Name", "Department") + ["Click \"Edit\" at the right of the \"Bid Proposal\" summary",
                                        "Add \"Legal Entity - …\" and Save"],
     "The drawer reopens with Bid Proposal, the two conditions, All Categories and Member already chosen. After adding "
     "Legal Entity the table gains a \"Legal Entity - …\" column; values already typed in other cells are kept.",
     priority="Medium")
case("AW-TRG", M, "Remove a used condition", "Removing a condition that already has values in the table",
     setup("Unit Name", "Department") + [set_cond("Unit Name", "The Lodhi"), "Click \"Edit\" on the summary, click the x on "
                                                                           "\"Unit Name - …\" and Save"],
     "The Unit Name column disappears together with its value (The Lodhi). Record whether a warning is shown first.",
     priority="Medium", ttype="Edge")

# ═════════════════════ 3. The conditions table and steps ═════════════════════
M = "3. Create a workflow — conditions table, steps, Publish"
case("AW-TBL", M, "Table", "After saving the drawer the table shows one row and the note about matching",
     setup("Unit Name", "Legal Entity", "Department"),
     "Columns: Action (copy and bin icons), Name (optional), Prevent Approval Expiry (switch, \"(Disabled)\"), the three "
     "condition columns, Step 1, Step 2, Step 3. Below: \"Add Approval Workflow\", \"(+) Add Step\" and the note \"All "
     "approval conditions must match for approval workflow to trigger\". \"Publish Workflow\" is at the top right.",
     priority="Critical", auto="UI-CRT-010, UI-CRT-011")
case("AW-TBL", M, "Name", "A name is typed in a small popover; it is optional",
     setup("Department") + [name_row("QA_Platform AW name test"), "Click the cell again and read it"],
     "The cell shows the name. A workflow with no name can still be published (record: the list then shows an empty "
     "Name — hard to tell apart; the API saved a blank-named workflow on 3 Nov).", priority="Medium", auto="API-FLW-013")
case("AW-TBL", M, "Prevent Approval Expiry", "The switch flips Disabled → Enabled and its info icon explains it",
     setup("Department") + ["Click the switch in \"Prevent Approval Expiry\"", "Hover the info icon in the column header"],
     "The row reads \"(Enabled)\" and the tooltip says \"Enabling this setting will prevent approvals from expiring\". "
     "Published, the list shows \"Enabled\".", priority="Medium", auto="UI-CRT-014")
case("AW-TBL", M, "Condition picker", "A condition cell opens a multi-select picker: 'Match … with any of the selected options'",
     setup("Unit Name") + ["Click the \"Unit Name - …\" cell"],
     "Popover titled \"Select Unit Name - DLF PO - General Details (Test)\" with a search box, a list, the hint \"Match "
     "Unit Name - … with any of the selected options\", a bin icon, Cancel and Save. Several values can be ticked "
     "(OR within the field).", priority="Critical", auto="UI-CRT-015")
case("AW-TBL", M, "Condition picker", "Unit Name offers every buyer hub of the company, not a curated list of units",
     setup("Unit Name") + ["Click the \"Unit Name - …\" cell and scroll the list"],
     "34 entries, alphabetical: \"-\", \"AMBUJA NEOTIA\", Club 3, Club 4, Club 5, Club Vita, DLF Clubs & Hospitality Limited, "
     "DLF Cyber Park OTG, DLF Emporio Mall, \"DLF Golf and Country Club\" TWICE (DGOLF and DLF-005), …, \"Free Text\", "
     "\"Plant Name\", \"Project BOQ team\", Restaurant, The Aralias, The Camellias, The Crest, The Lodhi, Thrive. The PRD "
     "lists 44 named units; the picker shows hubs, with junk names and a duplicate. Raise to product/CS: clean the hub "
     "list before go-live, and show the hub code (DLF-021) next to the name.", priority="High", ttype="Edge",
     auto="UI-CRT-016, API-CAT-002")
case("AW-TBL", M, "Condition picker", "Form Type offers the 29 RFQ templates by name (BOQ, Buy, Tender…), not the PRD's six form types",
     setup("Form Type") + ["Click the \"Form Type - …\" cell and read the list"],
     "BOM Template, BOQ Based Project Template, BOQ CSQ1, …, Buy Template, DLF Capex NFA Test RFQ, Liquor Template, Tender "
     "- Discount Based Template, … (29). Form Type = the event's RFQ template. The PRD's \"Capex, Project, Tender, "
     "Discount, Operational, Liquor\" exist only as template names — CS must map each DoA form type to a template.",
     priority="High", ttype="Edge", auto="API-CAT-003")
case("AW-TBL", M, "Condition picker", "Two units can be picked in one condition; the cell shows '+1 more'",
     setup("Unit Name") + [set_cond("Unit Name", "National Clubs -Kochi", "The Lodhi")],
     "Both chips in the picker; after Save the cell reads \"National Clubs -Kochi +1 more\".", priority="High",
     auto="UI-CRT-017, UI-CRT-018")
case("AW-TBL", M, "Condition picker", "The Legal Entity picker does not follow the chosen units (PRD asked for nesting)",
     setup("Unit Name", "Legal Entity") + [set_cond("Unit Name", "National Clubs -Kochi"),
                                          "Click the \"Legal Entity - …\" cell and read the list"],
     "All 7 entities are offered (ATRIUM PLACE…, DLF CLUB AND HOSPITALITY, DLF CYBERCITY, DLF LIMITED, DLF PROPERTY "
     "DEVELOPER, LODHI PROPERTY, RIVERIA) although Kochi maps only to DLF LIMITED. The PRD wanted the picker to respect "
     "nesting; the PR decided against it. A CS user can save \"Kochi + LODHI PROPERTY\", a pair no PO can ever have "
     "(module 7). Record / raise.", priority="High", ttype="Edge", auto="UI-CRT-019, API-FLW-004")
case("AW-TBL", M, "Condition picker", "Search inside a picker narrows the list",
     setup("Department") + ["Click the \"Department - …\" cell, type \"ma\""],
     "Only \"Marketing\" stays (search is on the label, case does not matter). Clearing the text brings all 10 back: "
     "Design, Events, F&B Production, HR, HSSE, IT, Marketing, Project, Security, Training.", priority="Medium")
case("AW-TBL", M, "Condition picker", "Cancel in a picker throws the change away; the bin clears the cell",
     setup("Department") + [set_cond("Department", "IT"), "Click the cell, tick HR, click \"Cancel\"",
                             "Click the cell and click the bin icon"],
     "After Cancel the cell still reads IT only. After the bin the cell is empty (= any Department).", priority="Medium")
case("AW-TBL", M, "Total Proposal Value", "A value range can be combined with the routing fields",
     setup("Department") + ["Edit the trigger and add \"Total Proposal Value\"", set_cond("Department", "IT"),
                             "Click the \"Total Proposal Value\" cell, type Min 1 and Max 100000, Save"],
     "The cell reads \"1 - 1,00,000\" (or similar). Published, the rule is Department IT AND value in that range. "
     "Max below Min is refused with \"Max should be greater than min value\"; negatives with \"Values cannot be less "
     "than 0\".", priority="High", auto="API-FLW-003, API-FLW-018")
case("AW-TBL", M, "Step", "The Step 1 popover: Fixed/Dynamic, approver search, duration, title",
     setup("Department") + ["Click the \"Step 1\" cell"],
     "Popover: \"Step Type\" radios Fixed (ticked) / Dynamic with the hint \"Approvers are pre-defined in the workflow and "
     "cannot be choosen by the initiator\" (typo: 'choosen'); \"Step 1 Approvers\" search box \"Search users or teams\"; "
     "\"Approval Duration\" box with Day(s); \"Step 1 Title (optional)\"; a bin, Cancel, Save.", priority="High",
     auto="UI-CRT-021, UI-CRT-022")
case("AW-TBL", M, "Step", "Approver search finds a user by part of the name and shows the e-mail",
     setup("Department") + ["Click \"Step 1\", click \"Step 1 Approvers\", type \"Suman\" and wait a moment"],
     "The list shows \"Test 2 - Sumanta Dey (sumanta.dey0609@gmail.com)\" and \"Test - Sumanta Dey "
     "(sumonto.dey@gmail.com)\" (the search takes 1–3 s). Picking one shows it as a chip. Teams are offered too.",
     priority="High", auto="UI-CRT-023")
case("AW-TBL", M, "Step", "Two approvers in one step show 'No of approvals required'",
     setup("Department") + ["Click \"Step 1\", add both Sumanta users as approvers"],
     "A new box \"No of approvals required\" (\"Select minimum approval required\") appears with 1 and 2. With one "
     "approver it is hidden.", priority="Medium")
case("AW-TBL", M, "Step", "Dynamic step: the initiator picks the approver at submission",
     setup("Department") + ["Click \"Step 1\", choose \"Dynamic\"", "Read the hint; add an approver; Save; publish with "
                                                                      "Department = IT", "Open the PO form of RFX-2112 "
                                                                      "(Department IT) and click \"Submit Proposal\", pick this "
                                                                      "workflow"],
     "Hint for Dynamic explains the initiator chooses. In the submit modal the step shows a \"Select Approver(s)\" box; "
     "Submit is refused with \"Please select at least one approver to proceed.\" until one is picked.", priority="Medium")
case("AW-TBL", M, "Step", "Saving a step without a duration or with 0",
     setup("Department") + ["Click \"Step 1\", add yourself, leave Approval Duration empty, Save",
                             "Reopen, type 0, Save"],
     "\"Approval duration is required\"; then \"Approval duration should be more than 0\" (or \"Please enter a valid "
     "duration\"). The API refuses 0 and negatives with \"Approval flow steps expires in must be greater than 0\".",
     priority="Medium", ttype="Negative", auto="API-FLW-014, API-FLW-015")
case("AW-TBL", M, "Step", "The step bin empties Step 1; Publish then refuses the row",
     setup("Department") + [name_row("QA_Platform AW no step"), set_cond("Department", "IT"), STEP_SELF,
                             "Click \"Step 1\" and click the bin icon", PUBLISH],
     "The Step 1 cell is empty; Publish shows in red under the table: \"Please enter valid responses for each row. "
     "Step 1 is required fields.\"", priority="High", ttype="Negative", auto="UI-CRT-013b")
case("AW-TBL", M, "Publish", "Publish with the row completely untouched must be refused — today it claims success",
     setup("Department") + [PUBLISH],
     "Expected: the red \"Please enter valid responses for each row…\". Seen on 3 Nov: green \"Approval workflow has been "
     "successfully published\", the page returns to the list and NOTHING is created (the request carries an empty "
     "list). Bug: a CS user believes the workflow exists.", priority="High", ttype="Negative", auto="UI-CRT-013")
case("AW-TBL", M, "Publish", "A complete workflow publishes and is listed with its values",
     setup("Unit Name", "Legal Entity", "Department") + [name_row("QA_Platform AW UI1 Kochi IT"),
                                                          set_cond("Unit Name", "National Clubs -Kochi", "The Lodhi"),
                                                          set_cond("Legal Entity", "DLF LIMITED"), set_cond("Department", "IT"),
                                                          STEP_SELF, PUBLISH],
     PUBLISHED + ": \"National Clubs -Kochi +1 more\", \"DLF LIMITED\", \"IT\".", priority="Critical",
     auto="UI-CRT-029, UI-CRT-031")
case("AW-TBL", M, "Several rows", "Add Approval Workflow adds a second row pre-filled like the first; each row becomes its own workflow",
     setup("Department") + [name_row("QA_Platform AW row 1"), set_cond("Department", "IT"), STEP_SELF,
                             "Click \"Add Approval Workflow\"", "In row 2 change the name to \"QA_Platform AW row 2\" and "
                                                                "Department to \"HR\"", PUBLISH],
     "Row 2 starts with row 1's values and can be changed. After Publish the list shows two workflows (IT and HR), each "
     "with the same approver.", priority="High")
case("AW-TBL", M, "Several rows", "Duplicate Workflow copies a row; Delete Workflow asks first",
     setup("Department") + [name_row("QA_Platform AW dup"), set_cond("Department", "IT"), STEP_SELF,
                             "Click the copy icon in Action", "Click the bin icon on row 2"],
     "A second identical row appears. The bin asks \"Are you sure you want to delete this approval workflow?\" (red OK); "
     "OK removes the row, Cancel keeps it.", priority="Medium", auto="UI-CRT-025, UI-CRT-026, UI-CRT-027")
case("AW-TBL", M, "Steps", "Add Step adds Step 4; empty extra steps are ignored on Publish",
     setup("Department") + [name_row("QA_Platform AW steps"), set_cond("Department", "IT"), STEP_SELF,
                             "Click \"(+) Add Step\"", PUBLISH, "Open the published workflow"],
     "A \"Step 4\" column appears (Step 1–3 are there from the start). Published with only Step 1 filled, the workflow "
     "has one step. A second filled step makes a two-step approval (both approvers, in order).", priority="Medium",
     auto="UI-CRT-028")
case("AW-TBL", M, "Overlap", "Two workflows that both match the same PO are allowed, with no warning (PRD asked for one)",
     setup("Department") + [name_row("QA_Platform AW overlap A"), set_cond("Department", "IT"), STEP_SELF,
                             "Add Approval Workflow; name row 2 \"QA_Platform AW overlap B\", Department \"IT\" and \"HR\"", PUBLISH],
     "Both publish; no warning that an IT PO now matches two workflows. The buyer will have to choose at submission "
     "(module 8). PRD: \"warn CS if its conditions overlap\" — not built; record.", priority="Medium", ttype="Edge")
case("AW-TBL", M, "Leave", "Leaving the create page with unsaved rows asks first and keeps a draft",
     setup("Department") + [name_row("QA_Platform AW draft"), "Click \"Approval Workflows\" in the left menu"],
     "Browser prompt \"Are you sure you want to exit creating approval workflow?\". Leave: the next time Create is opened "
     "a banner offers to continue with the saved draft. Record the banner's words.", priority="Low", auto="UI-CRT-033")

# ═════════════════════ 4. Edit and delete ═════════════════════
M = "4. Edit and delete workflows"
case("AW-EDT", M, "Edit values", "Adding a value to a condition and saving updates the workflow",
     [LOGIN, OPEN_WF, "Click \"QA_Platform AW UI1 Kochi IT\"", "Click the \"Department - …\" cell, tick \"HR\" too, Save",
      "Click \"Save Workflow\""],
     "Green \"Approval workflow has been successfully updated\"; the list shows Department \"IT +1 more\". The rule is now "
     "Department IT or HR.", priority="Critical", auto="UI-EDT-001, UI-EDT-002, UI-EDT-003")
case("AW-EDT", M, "Edit approver", "Changing the approver of a published workflow",
     [LOGIN, OPEN_WF, "Open \"QA_Platform AW UI1 Kochi IT\"", "Click \"Step 1\", remove yourself, add \"Test 2 - Sumanta Dey\", "
                                                             "Save, \"Save Workflow\""],
     "Updated; a PO submitted afterwards goes to Test 2. A PO already in approval keeps its approver (module 9).",
     priority="High")
case("AW-EDT", M, "Edit does not touch running approvals", "Changing a workflow's conditions affects only POs submitted afterwards",
     [LOGIN, "Submit a PO (module 8) with the workflow \"QA_Platform AW SUB-B\" so the approval is pending",
      OPEN_WF, "Open that workflow, change Department to \"Security\" only, Save Workflow",
      "Open Approvals and the pending request"],
     "The pending request still shows the old workflow name and approver, and can still be approved/rejected. A new "
     "PO with Department IT no longer matches it.", priority="High")
case("AW-EDT", M, "Delete", "Deleting a workflow from the editor",
     [LOGIN, OPEN_WF, "Open a QA_Platform workflow", "Click the bin in Action, OK", "Click \"Save Workflow\""],
     "The row is removed and the list no longer shows it. A PO whose submit modal had listed it gets 523 on submit "
     "(module 8) and must pick again.", priority="High")
case("AW-EDT", M, "Delete", "Deleting a workflow with a pending approval request",
     [LOGIN, "With a request pending on \"QA_Platform AW SUB-B\" (module 8)", OPEN_WF, "Delete that workflow"],
     "Record: deletion allowed or refused; the pending request keeps working either way (approve/reject still possible).",
     priority="Medium", ttype="Edge")
case("AW-EDT", M, "Same name", "Two workflows with the same name are allowed — the list cannot tell them apart",
     [LOGIN, OPEN_WF, "Create \"QA_Platform AW twin\" twice with different Departments"],
     "Both publish (names are not unique). Record: in the submit modal both show the same name — the buyer cannot tell "
     "which is which. Raise as a usability gap.", priority="Medium", ttype="Edge", auto="API-FLW-012")

# ═════════════════════ 5. General Details on the PO form ═════════════════════
M = "5. PO form — the General Details section"
case("PO-GD", M, "Display", "The PO form opens with General Details on top: seven rows in order",
     OPEN_PO, f"A collapsible section \"General Details\" with the rows {GD_ROWS}. Required rows carry a red *. Below it the "
              "vendor block (Demo10, Quick Fill), the line (CHUNKEY CHAT MASALA… Item Code 90030568, PR-369, Item No 15) and "
              "\"Global Component\".", pre=PO_PRE, priority="Critical", auto="UI-PO-001")
case("PO-GD", M, "Form Type", "Form Type is auto-filled with the event's RFQ template and locked",
     OPEN_PO + ["Look at Form Type; hover the lock icon; try to click the box"],
     "Value \"DLF Capex NFA Test RFQ\", tag \"Auto-filled\", a lock with the tooltip \"Set by the system\"; the box is greyed "
     "and cannot be opened. The API ignores any other value sent for it.", pre=PO_PRE, priority="Critical",
     auto="UI-PO-002, UI-PO-003, API-GD-002, API-SAVE-002")
case("PO-GD", M, "Unit Name", "Unit Name is auto-filled from the PR line's location (with its code) but stays editable",
     OPEN_PO + ["Look at Unit Name; open its list"],
     "Value \"National Clubs -Kochi (DLF-021)\" with the tag \"Auto-filled\" and no lock. The list offers only that unit "
     "(the PR line's). PRD: \"an auto-filled Unit Name should ideally not be editable\" — not locked, but the list has "
     "no other value, so nothing can change. Record.", pre=PO_PRE, priority="High", auto="UI-PO-004, UI-PO-005, API-GD-003, API-OPT-001")
case("PO-GD", M, "Unit Name", "PR lines from two locations: the user chooses among those two only",
     [LOGIN, "Make a PR-based event whose two PR lines sit at two units (e.g. The Lodhi and The Camellias), award it and "
             "open the PO form", "Open Unit Name"],
     "Unit Name is empty (not auto-filled) and the list offers exactly those two units. Legal Entity is disabled with "
     "\"Select Unit Name first\" until one is chosen.", pre="Two open PR lines at different units on DLF UAT (ask CS; e.g. "
     "DGOLF PRs at DLF Golf and Country Club and CCEHB at ECO VISTA).", priority="High")
case("PO-GD", M, "Unit Name", "PR lines without a location: the units of the user's purchase teams are offered",
     [LOGIN, "Award an event whose PR lines carry no location (or a non-PR event) and open the PO form", "Open Unit Name"],
     "The list shows only the units mapped to the teams the user belongs to (Team \"All Categories\" has no units → the "
     "server offers ALL units for such a user; a user only in \"Purchase The Lodhi\" sees The Lodhi only). Record what "
     "the test user sees.", pre="The test user's teams: All Categories (no units). Add them to \"Purchase The Lodhi\" for "
     "the second check.", priority="High", ttype="Edge")
case("PO-GD", M, "Legal Entity", "Legal Entity offers only the entities mapped to the chosen unit",
     OPEN_PO + ["Open Legal Entity"],
     "For National Clubs -Kochi: \"DLF LIMITED\" only. (For The Lodhi it would be DLF CLUB AND HOSPITALITY, DLF LIMITED, "
     "LODHI PROPERTY, RIVERIA; for DLF Emporio Mall: CYBERCITY, DLF LIMITED, PROPERTY DEVELOPER — as the PRD sheet.)",
     pre=PO_PRE, priority="Critical", auto="UI-PO-006, API-OPT-002, API-OPT-003, API-OPT-004")
case("PO-GD", M, "Legal Entity", "An entity not mapped to the unit cannot be found or picked",
     OPEN_PO + ["Open Legal Entity and type \"Lodhi\""],
     "\"No options configured for this selection\"; nothing can be picked. Sent by the API anyway it is refused: 2015 "
     "\"Selected Legal Entity is not valid for this proposal\".", pre=PO_PRE, priority="High", ttype="Negative",
     auto="UI-PO-015, API-SAVE-003")
case("PO-GD", M, "Legal Entity", "Single mapped entity: is it picked for the user?",
     OPEN_PO + ["With Legal Entity empty, note whether DLF LIMITED (the only option for Kochi) is auto-selected"],
     "PRD: \"If the parent has exactly one mapped child, the child is auto-selected.\" As built, lists that come from the "
     "server (Legal Entity) are never auto-selected — only static lists are. On RFX-2112 the user must pick DLF LIMITED "
     "by hand. Record / raise.", pre=PO_PRE, priority="Medium", ttype="Edge")
case("PO-GD", M, "Legal Entity", "Changing Unit Name clears a Legal Entity that no longer fits",
     [LOGIN, "On a PO form whose Unit Name list has two units (the two-location case above) pick unit A and entity "
             "\"DLF LIMITED\"", "Change Unit Name to unit B (mapped to DLF LIMITED too)", "Change Unit Name to a unit "
                                                                                           "whose entities do not include "
                                                                                           "the chosen one"],
     "Expected (PRD): kept when still valid, cleared when not. As built the page clears every child on ANY parent change "
     "and warns \"Please select Legal Entity again\" — even when DLF LIMITED is valid for the new unit. Record / raise.",
     pre="A PO form with two selectable units.", priority="High", ttype="Edge")
case("PO-GD", M, "Legal Entity", "No unit chosen: Legal Entity is disabled with 'Select Unit Name first'",
     [LOGIN, "On a PO form where Unit Name is empty (two-location case) hover/click Legal Entity"],
     "Greyed with the placeholder \"Select Unit Name first\". Through the API: 2015 \"Select Unit Name before Legal "
     "Entity\".", pre="A PO form with Unit Name empty.", priority="High", ttype="Negative", auto="API-SAVE-009")
case("PO-GD", M, "Department", "Department is searched on the server: typing narrows the list",
     OPEN_PO + ["Open Department, type \"Mark\"", "Clear the text and read the full list"],
     "Only \"Marketing\"; the full list: Design, Events, F&B Production, HR, HSSE, IT, Marketing, Project, Security, "
     "Training (10). (The DoA sheet also mentions Admin and Finance — not configured; record.)", pre=PO_PRE,
     priority="High", auto="UI-PO-008, API-OPT-007")
case("PO-GD", M, "Nature of Expense", "Nature of Expense lists the four values of the sheet",
     OPEN_PO + ["Open Nature of Expense"],
     "Budgeted with 3 quotes, Budgeted without 3 quotes, Non-budgeted with 3 quotes, Non-budgeted without 3 quotes.",
     pre=PO_PRE, priority="High", auto="UI-PO-011, API-OPT-010")
case("PO-GD", M, "Saving", "Every change is saved at once; a reload shows it",
     OPEN_PO + ["Pick Department \"Marketing\"", "Watch the small spinner next to the box", "Reload the page"],
     "A spinner shows while saving (POST …/general_details 200); after the reload Department still reads Marketing. "
     "Nothing else on the PO form has to be saved for General Details to stick.", pre=PO_PRE, priority="Critical",
     auto="UI-PO-008, UI-PO-009, UI-PO-010")
case("PO-GD", M, "Saving", "Save error: the box snaps back and a message appears",
     OPEN_PO + ["Turn the network off (browser Offline) and pick Nature of Expense \"Budgeted without 3 quotes\"",
                "Turn it back on"],
     "Red message \"Could not save General Details\" (or the server's words); the box returns to the saved value after "
     "the refresh. Picking again online saves.", pre=PO_PRE, priority="Medium", ttype="Negative")
case("PO-GD", M, "Long text", "Sanction Note and Comments take up to 5,000 characters and save when you leave the box",
     OPEN_PO + ["Paste 5,010 characters into Sanction Note", "Click into Comments"],
     "The box keeps 5,000 characters (the rest is cut). Leaving the box saves (POST 200). Through the API 5,001 "
     "characters → 2015 \"Sanction Note must be at most 5000 characters\".", pre=PO_PRE, priority="Medium",
     auto="UI-PO-012, API-SAVE-011, API-SAVE-012")
case("PO-GD", M, "Long text", "Comments with special characters",
     OPEN_PO + ["Type in Comments: Rate & terms: 'single' \"double\" <b>bold</b> 50% off — and leave the box",
                "Type <script>alert(1)</script> and leave the box"],
     "The first text saves as typed and shows as typed after a reload. The second is blocked by the web firewall with a "
     "generic error (HTTP 403 page): the user sees a red toast, not a field message — record.", pre=PO_PRE,
     priority="Low", ttype="Edge", auto="API-SAVE-013, API-SAVE-013b")
case("PO-GD", M, "Collapse", "The caret collapses the section to its title",
     OPEN_PO + ["Click the caret left of \"General Details\"", "Click it again"],
     "Collapsed: only the title line. Expanded again: the seven rows, values intact.", pre=PO_PRE, priority="Low",
     auto="UI-PO-013")
case("PO-GD", M, "Clear", "Required dropdowns have no clear (x); optional long texts can be emptied",
     OPEN_PO + ["Hover Legal Entity; look for an x", "Empty Sanction Note and leave the box"],
     "No x on the five required dropdowns. Sanction Note empties and saves empty.", pre=PO_PRE, priority="Low",
     auto="UI-PO-007")
case("PO-GD", M, "Other templates", "An event whose PO template has no General Details shows no section",
     [LOGIN, "Award an event made from a template whose PO template is the company's standard one (e.g. \"Buy Template\") "
             "and open its PO form"],
     "No \"General Details\" section; the PO form looks as before the feature; Submit Proposal offers the old workflow "
     "list.", pre="An awarded event on another template.", priority="High")

# ═════════════════════ 6. Values by API ═════════════════════
M = "6. General Details through the API"
A = dict(role="QA / developer", portal="API (sec-api.ag-ri.in)")
API_PRE = ("The draft PO form of RFX-2112 (proposal uuid Z05EcGM=) created by the test user; the user's access token. "
           "GET/POST /proposal/<uuid>/general_details, GET /proposal/<uuid>/general_details/<field>/options.")
case("PO-API", M, "Read", "GET general_details returns the 7 fields in order with flags, values and labels",
     ["GET /proposal/Z05EcGM=/general_details"],
     "200. is_configured true, is_condition_based_approval_routing_enabled true, is_editable true, values {form_type "
     "\"6686\", unit_name \"12518\", …}, fields[] in order 1–7 with is_required, disabled, is_auto_filled, prefilled_value "
     "{key,label,code}, and either options (Form Type) or dropdown_url (the rest).", pre=API_PRE, priority="Critical",
     auto="API-GD-001…006", **A)
case("PO-API", M, "Options", "The options endpoint pages, searches and follows the parent",
     ["GET …/legal_entity/options?parent_value=12525 (The Lodhi)", "GET …/legal_entity/options (no parent → saved unit)",
      "GET …/department/options?search_query=f", "GET …/department/options?page_number=2", "GET …/department/options?search_query=%"],
     "4 entities for The Lodhi; DLF LIMITED for the saved unit; F&B Production for 'f'; page 2 empty with has_more false; "
     "'%' finds nothing (not a wildcard).", pre=API_PRE, priority="High", auto="API-OPT-003, API-OPT-006…009", **A)
case("PO-API", M, "Options", "Options for a non-existent unit, a long-text field or an unknown field are empty, never 500",
     ["GET …/legal_entity/options?parent_value=999999", "GET …/sanction_note/options", "GET …/ghost_field/options"],
     "200 {options: [], has_more: false} for all three.", pre=API_PRE, priority="Medium", ttype="Negative",
     auto="API-OPT-005b, API-OPT-011, API-OPT-012", **A)
case("PO-API", M, "Save", "POST replaces the whole set; a key left out is cleared; unknown keys are dropped; locked fields are kept",
     ["POST {values: all five}", "POST {values: four, no legal_entity}", "POST {values: … , extra_field: x}", "POST {values: … form_type: 2784}"],
     "200 each time; the second reply has no legal_entity; extra_field is absent; form_type stays 6686.", pre=API_PRE,
     priority="Critical", auto="API-SAVE-001, 002, 008, 010", **A)
case("PO-API", M, "Save", "Invalid values are refused with 2015 and the field's name",
     ["POST legal_entity 'LODHI PROPERTY COMPANY LIMITED' with unit Kochi", "POST unit_name 12525 (not the PR line's)",
      "POST department 'Finance'", "POST department 'it'", "POST legal_entity 'dlf limited'", "POST department ['IT','HR']"],
     "422 {code 2015, message 'Selected Legal Entity / Unit Name / Department is not valid for this proposal'} — values are "
     "exact (case matters); arrays and objects are refused the same way.", pre=API_PRE, priority="Critical",
     ttype="Negative", auto="API-SAVE-003…006, 014, 015, 018, 019", **A)
case("PO-API", M, "Save", "A trailing space is trimmed; an empty body clears the optional fields",
     ["POST nature_of_expense 'Budgeted with 3 quotes ' (space)", "POST {}"],
     "Trimmed and accepted. {} → 200 with only form_type (locked) and unit_name (auto-filled) left — record whether a "
     "clearing POST should be allowed.", pre=API_PRE, priority="Low", ttype="Edge", auto="API-SAVE-007, API-SAVE-017", **A)
case("PO-API", M, "Who", "Only the creator of a draft can save; everyone who can see the proposal can read",
     ["GET general_details of another user's submitted proposal (a1FEcGM=)", "POST to it", "GET its options",
      "GET with no access-token"],
     "GET 200 with is_editable false; POST 422 code 2; options 422 code 2; no token → 422 code 2 'Insufficient "
     "parameters' (the app's standard).", pre=API_PRE, priority="High", ttype="Negative", auto="API-PERM-001…007", **A)
case("PO-API", M, "Proposal", "GET /proposal shows general_details with labels",
     ["GET /proposal/Z05EcGM="],
     "general_details: [{key, label, value, value_label}] for the filled fields, e.g. unit_name → 'National Clubs -Kochi', "
     "form_type → 'DLF Capex NFA Test RFQ'.", pre=API_PRE, priority="High", auto="API-GD-007", **A)
case("PO-API", M, "Template config", "The PO template refuses a bad general_details_fields configuration",
     ["As a developer, PATCH /templates/7503 with a field whose key is 'total_proposal_value' (reserved), then with a "
      "parent_key that does not exist, then with legal_entity's parent set to itself"],
     "422 'general_details_fields: field key total_proposal_value is reserved' / '…parent_key X does not exist' / "
     "'parent_key chain must not be circular'. (Do this on a COPY of template 7503, never on the live one.)",
     pre="A copy of PO template 7503.", priority="Medium", ttype="Negative", **A)

# ═════════════════════ 7. Workflow API ═════════════════════
M = "7. Approval workflow API (create_approval_flows)"
WPRE = "POST /approval_workflow/approval_flows/create_approval_flows with the dashboard's shape (approval_type, initiators, conditions [{key, values}], steps [{approvers, expires_in}])."
case("AW-API", M, "Create", "A workflow with 'is any of' two units saves both values with labels",
     ["POST conditions [{key unit_name, values [12525, 12523]}]", "GET /approval_workflow/approval_flows/<uuid>"],
     "200; the saved condition holds The Lodhi and The Camellias; the rule is (unit_name == \"12525\" || unit_name == "
     "\"12523\").", pre=WPRE, priority="Critical", auto="API-FLW-001, API-FLW-002", **A)
case("AW-API", M, "Create", "All five routing conditions plus a value range in one workflow",
     ["POST the five conditions and total_proposal_value [1, 100000]"],
     "200; rule = the five equalities AND (total_proposal_value >= 1 && < 100000).", pre=WPRE, priority="High",
     auto="API-FLW-003", **A)
case("AW-API", M, "Create", "A condition value outside the catalogue is accepted (Department = Finance) — bug",
     ["POST conditions [{key department, values ['Finance']}]"],
     "Expected 422. Seen: 200 and rule (department == \"Finance\") — a workflow that can never match. The builder's "
     "picker prevents this; the API does not.", pre=WPRE, priority="Medium", ttype="Negative", auto="API-FLW-005", **A)
case("AW-API", M, "Create", "An unknown condition key crashes the server — bug",
     ["POST conditions [{key colour, values ['red']}]"],
     "Expected 422. Seen: HTTP 500.", pre=WPRE, priority="High", ttype="Negative", auto="API-FLW-006", **A)
case("AW-API", M, "Create", "An empty value list saves a workflow whose rule is '()' — bug",
     ["POST conditions [{key unit_name, values []}]", "GET /proposal/Z05EcGM=/approval_workflows while it exists"],
     "Expected 422. Seen: 200, rule \"()\". The match list still answered (the workflow was not offered) — but a rule "
     "that is not a boolean is a time bomb; record.", pre=WPRE, priority="Medium", ttype="Negative",
     auto="API-FLW-007, API-FLW-007b", **A)
case("AW-API", M, "Create", "The same condition twice in one workflow saves an impossible rule — bug",
     ["POST conditions [{department [IT]}, {department [HR]}]"],
     "Expected 422 (one condition per field). Seen: 200, rule (department == \"IT\") && (department == \"HR\") — never "
     "matches.", pre=WPRE, priority="Medium", ttype="Negative", auto="API-FLW-008", **A)
case("AW-API", M, "Create", "An unknown approval type saves a workflow of type 'banana' — bug",
     ["POST approval_type 'banana'"],
     "Expected 422. Seen: 200; the row shows under neither tab properly. Harmless but wrong.", pre=WPRE,
     priority="Low", ttype="Negative", auto="API-FLW-016", **A)
case("AW-API", M, "Create", "Steps and approvers are validated",
     ["POST with steps []", "POST a step with approvers []", "POST an approver of another company", "POST expires_in 0, then -3600"],
     "422 'Approval flow steps can't be blank' / 'Approval flow steps approvers can't be blank' (also for the foreign user, "
     "who is dropped) / 'Approval flow steps expires in must be greater than 0'.", pre=WPRE, priority="High",
     ttype="Negative", auto="API-FLW-009, 010, 011, 014, 015", **A)
case("AW-API", M, "Create", "Reversed value range is refused with a generic message",
     ["POST total_proposal_value [100000, 1]"],
     "422 'Something went wrong!' — works, but the message does not say why. Record.", pre=WPRE, priority="Low",
     ttype="Negative", auto="API-FLW-018", **A)
case("AW-API", M, "Create", "A PO-form condition can be attached to an Event Creation workflow",
     ["POST approval_type create_trade with condition department [IT]"],
     "200 — but an event has no General Details, so the condition is always false and the workflow never triggers. "
     "The builder only offers the (Test) conditions under Bid Proposal; record for the API.", pre=WPRE, priority="Low",
     ttype="Edge", auto="API-FLW-017", **A)
case("AW-API", M, "Catalogue", "GET conditions lists the five routing fields with every value and the nesting",
     ["GET /approval_workflow/approval_flows/conditions"],
     "form_type (29 templates), unit_name (34 hubs), legal_entity (7, each with parent_values = unit ids), department (10), "
     "nature_of_expense (4). ATRIUM PLACE DEVELOPERS has no parent (the PRD's unit APPDL-THAP does not exist on UAT).",
     pre=WPRE, priority="High", auto="API-CAT-001…005", **A)
case("AW-API", M, "Delete", "Delete takes uuids; ids are refused",
     ["DELETE /approval_workflow/approval_flows/delete_approval_flows {ids: [<uuid>]}", "… {uuids: [<uuid>]}"],
     "With ids: 422 570 'Approval Flow not found'. With uuids: 200 {success: true}; the workflow's status becomes "
     "deleted and it leaves the list.", pre=WPRE, priority="Medium", **A)

# ═════════════════════ 8. Matching and submitting ═════════════════════
M = "8. Matching workflows and submitting the PO form"
MPRE = PO_PRE + " The test user's own QA_Platform workflows exist as named in each case (approver = the test user). Proposal value ₹9,000 (90 × ₹100)."
FILL = "Fill General Details: Legal Entity DLF LIMITED, Department IT, Nature of Expense Budgeted with 3 quotes (Form Type and Unit Name are pre-filled)"
case("PO-SUB", M, "Modal", "Submit Proposal opens the approval modal listing ONLY the matching workflows",
     OPEN_PO + [FILL, "Create two workflows: \"QA_Platform AW SUB-A\" (Unit Kochi AND Department IT) and \"QA_Platform AW "
                      "SUB-B\" (Department IT or HR), both for team All Categories / Member, approver yourself", SUBMIT],
     "The modal lists SUB-A and SUB-B (and any other Member workflow that matches). Not listed: \"GD Test - CAPEX…\" "
     "(initiators Admin), the company \"test\" catch-alls (team workflows win), workflows for other units/departments. "
     "The page called GET /proposal/<id>/approval_workflows.", pre=MPRE, priority="Critical",
     auto="UI-SUB-001, UI-SUB-002, API-MAT-001…010")
case("PO-SUB", M, "Rules", "AND across fields, OR within a field, 'any value' when a field has no condition",
     ["Create \"M1 dept IT\", \"M2 dept HR\", \"M3 dept IT or HR\", \"M4 Kochi and IT\", \"M5 Lodhi and IT\", \"M9 no "
      "conditions\", \"M10 form type DLF Capex NFA Test RFQ\", \"M11 form type Buy Template\", \"M12 entity DCHL\"",
      "With the PO at Kochi / DLF LIMITED / IT / Budgeted with 3 quotes, read GET /proposal/<id>/approval_workflows",
      "Change Department to HR and read it again"],
     "IT: M1, M3, M4, M9, M10 match; M2, M5, M11, M12 do not. HR: M2, M3, M9, M10 match; M1, M4 gone. The list changes "
     "the moment a field changes.", pre=MPRE, priority="Critical", auto="API-MAT-001…003, 006…008, 011")
case("PO-SUB", M, "Rules", "A Total Proposal Value range combines with the fields",
     ["Create \"M7 IT and value 1–5,000\" and \"M8 IT and value 5,000–20,000\"", "PO value ₹9,000, Department IT: read the list"],
     "M8 matches, M7 does not (9,000 is outside 1–5,000). Changing the awarded quantity so the value drops under 5,000 "
     "flips them.", pre=MPRE, priority="High", auto="API-MAT-005")
case("PO-SUB", M, "Rules", "The pre-existing Member workflow matches F&B Production + Non-budgeted without 3 quotes",
     OPEN_PO + ["Set Department \"F&B Production\" and Nature of Expense \"Non-budgeted without 3 quotes\"", SUBMIT],
     "\"GD Test - Non-budgeted without 3 quotes - F&B Production\" is listed (its initiators are Members).", pre=MPRE,
     priority="High", auto="API-MAT-013")
case("PO-SUB", M, "Choose", "Several matches: the buyer picks one, sees its summary, then submits",
     OPEN_PO + [FILL, SUBMIT, "Tick \"QA_Platform AW SUB-B\" and click the blue button", "Read the summary"],
     "\"An approval workflow will be sent to the following members:\" with Test - Sumanta Dey, a Remarks box, Back. "
     "Submit sends it; green \"Proposal submitted successfully\" and the page goes to Events.", pre=MPRE,
     priority="Critical", auto="UI-SUB-003, UI-SUB-006, UI-SUB-007")
case("PO-SUB", M, "Choose", "One match: the modal goes straight to the summary",
     OPEN_PO + [FILL, "Make sure only SUB-B matches (delete SUB-A)", SUBMIT],
     "No list to choose from; the summary of SUB-B appears at once.", pre=MPRE, priority="High", auto="UI-SUB-006")
case("PO-SUB", M, "Stale", "A routing field changed after the modal listed workflows → 523, the modal reloads the list",
     OPEN_PO + [FILL, SUBMIT, "Pick SUB-A (Kochi AND IT) and go to its summary", "In another tab change Department to HR",
                "Back in the modal click Submit"],
     "Red \"Invalid Approval\" (code 523); the modal stays open and now lists only what matches HR (SUB-B). Pick it and "
     "submit.", pre=MPRE, priority="Critical", ttype="Negative", auto="UI-SUB-004, UI-SUB-005, API-SUB-005")
case("PO-SUB", M, "Incomplete", "Submit with a mandatory General Details field empty → 'Please fill …'",
     OPEN_PO + ["Leave Legal Entity empty, fill the rest", SUBMIT, "Pick a workflow and Submit"],
     "Red \"Please fill Legal Entity\" (2016). With three empty: \"Please fill Legal Entity, Department, Nature of "
     "Expense\". Record whether the modal opens at all with empty fields (the list is computed on the filled ones).",
     pre=MPRE, priority="Critical", ttype="Negative", auto="API-SUB-003, API-SUB-004, API-MAT-012")
case("PO-SUB", M, "No choice", "Submit without choosing while several match → 'Please select an approval workflow'",
     ["POST /proposal/<id>/submit with no approval_flow_uuid while two workflows match (the modal always picks the first, "
      "so this is an API case)"],
     "422 2018 'Please select an approval workflow'. Also for a garbage uuid.", pre=MPRE, priority="High",
     ttype="Negative", auto="API-SUB-001, API-SUB-006", **A)
case("PO-SUB", M, "Wrong workflow", "Submit with a workflow that exists but does not match → 523",
     ["POST submit with approval_flow_uuid of \"GD Test - CAPEX - any unit - IT\" (Admin initiators)"],
     "422 523 'Invalid Approval'.", pre=MPRE, priority="High", ttype="Negative", auto="API-SUB-002", **A)
case("PO-SUB", M, "No match", "No workflow matches → the PO cannot be submitted (needs a company without catch-alls)",
     ["On a company where no Bid Proposal workflow has an empty rule, fill a combination no workflow covers", SUBMIT],
     "Expected: 2017 \"No approval workflow is configured for the selected combination\"; the modal shows \"No approval "
     "will be triggered as no approval workflows are found\" and must NOT let the PO through without approval. On DLF "
     "UAT this cannot be reached: the three company-level \"test\" workflows (rule 'true') catch every PO — CS must delete "
     "them before go-live (PR §6.5).", pre="A company (or DLF after the 'test' flows are removed) with no catch-all "
     "workflow.", priority="Critical", ttype="Negative", auto="API-SUB-007")
case("PO-SUB", M, "Catch-all", "When no team workflow matches, the company 'test' workflow for the user's role is used",
     OPEN_PO + ["Set a combination none of your workflows cover (e.g. Department Security)", SUBMIT],
     "The modal lists the company workflow \"test\" whose initiators are super admins (the test user's role) — approvers "
     "Testing-T and VAIB-TEST. Do NOT submit it (real approvers); Cancel. Record.", pre=MPRE, priority="High",
     ttype="Edge", auto="API-MAT-009")
case("PO-SUB", M, "Minimal body", "Submit with a minimal request body answers an error, not a crash",
     ["POST /proposal/<id>/submit {remarks: 'x'} (no attachments, no step map)"],
     "Expected 422. Seen: HTTP 500 (the dashboard always sends attachments: [] and step_uuid_vs_user_uuid: {}, so users "
     "never hit it; integrations might).", pre=MPRE, priority="Low", ttype="Negative", auto="API-SUB-000", **A)

# ═════════════════════ 9. After submission ═════════════════════
M = "9. After submission — history, read-only, approver, rejection"
case("PO-AFT", M, "History", "The approval request stores what was matched",
     ["After a submit, read the approval request (DB or GET approval_requests?view_type=initiator)"],
     "status pending, approval_flow = the chosen one; meta_data.data.routing = {matched_values {form_type, unit_name, "
     "legal_entity, department, nature_of_expense}, approval_flow_id, approval_flow_name, approval_trigger_rule, "
     "match_count, user_selected (true when the buyer chose among several), matched_at}.", pre=MPRE, priority="High",
     auto="UI-SUB-008")
case("PO-AFT", M, "Read-only", "After submission General Details is read-only",
     OPEN_PO + ["Open the submitted proposal's PO form"],
     "The section shows plain values (no dropdowns, no text boxes); GET general_details says is_editable false; POST is "
     "refused (422 code 2).", pre=MPRE, priority="Critical", auto="UI-SUB-009, UI-SUB-010")
case("PO-AFT", M, "Approver", "The approver sees the request; General Details are not shown on the approval page (PRD gap)",
     [LOGIN, "Open \"Approvals\"; open the pending RFX-2112 request"],
     "The request is listed (initiator Test - Sumanta Dey, workflow name). PRD: \"Selected values are shown … in the "
     "approval view, so approvers can see why they received the PO.\" PR: \"not shown for now\". Record what the page "
     "shows and raise it.", pre=MPRE, priority="High", ttype="Edge", auto="UI-SUB-011, UI-SUB-012")
case("PO-AFT", M, "Approve", "Approving releases the PO",
     [LOGIN, "Open Approvals, open the request, click Approve, add remarks, confirm"],
     "The request becomes approved; the proposal moves on (PO created / event to History). The routing snapshot stays "
     "in the request.", pre=MPRE + " Use a run where the approver is yourself.", priority="High")
case("PO-AFT", M, "Reject", "Rejecting returns the PO to draft and the new draft keeps the General Details",
     [LOGIN, "Open Approvals, open the request, click Reject with remarks",
      "Open the event's awarding page and open the PO form again"],
     "The request is rejected; a new draft proposal exists for the event and its General Details show the same values "
     "(DLF LIMITED, IT, …) ready to edit; Submit Proposal matches again.", pre=MPRE, priority="Critical",
     auto="UI-SUB-013, UI-SUB-014")
case("PO-AFT", M, "Withdraw", "Withdrawing the request as the initiator",
     [LOGIN, "Open Approvals (initiator view), open the pending request, click Withdraw"],
     "The request is withdrawn; the PO form can be edited and resubmitted; matching runs again on resubmit.",
     pre=MPRE, priority="Medium")
case("PO-AFT", M, "Expiry", "Prevent Approval Expiry off: the request expires after the step duration",
     ["Publish a workflow with Prevent Approval Expiry OFF and a 1-minute duration (if the unit allows), submit, wait"],
     "The request expires after the duration; with the switch ON it never expires. Record the exact behaviour "
     "(escalation / reminder mails).", pre=MPRE, priority="Low", ttype="Edge")
case("PO-AFT", M, "Listing", "PO listing filters and export by General Details (PRD) — not built",
     [LOGIN, "Open Purchase Orders; look for filters on Unit Name / Legal Entity / Department; export"],
     "PRD: \"Values are available in PO listing filters and exports.\" PR: out of scope. Record what exists.",
     priority="Low", ttype="Edge")

# ═════════════════════ 10. Set-up and config ═════════════════════
M = "10. Set-up for a client (CS) and configuration"
case("AW-CFG", M, "Template", "The routing switch on the PO template turns the feature on and off",
     ["As a developer set is_condition_based_approval_routing_enabled false on a COPY of PO template 7503 linked to a "
      "copy of the RFQ template; award an event made from it and open the PO form", SUBMIT],
     "The General Details section still shows (fields configured) but Submit lists every applicable workflow as before "
     "(no routing) and empty mandatory fields are NOT enforced (PR §9). With the flag true both apply.",
     pre="Copies of templates 7503 and 6686.", priority="High", role="Developer + Buyer", portal="Rails console + Buyer portal")
case("AW-CFG", M, "Template", "Removing general_details_fields hides the section",
     ["On the copy, remove general_details_fields; open a PO form"],
     "No section; GET general_details → is_configured false; POST → 422 code 2.", pre="A copy of template 7503.",
     priority="Medium", role="Developer + Buyer", portal="Rails console + Buyer portal")
case("AW-CFG", M, "Conditions sync", "New hubs or templates reach the workflow builder only after the sync script",
     ["Add a buyer hub \"QA_Platform Hub\"; open the builder's Unit Name picker", "Run rails runner "
      "scripts/sync_general_details_approval_conditions.rb -t 7503; open the picker again"],
     "Before the script the new hub is missing from the condition picker (but already offered on the PO form); after it "
     "the hub appears. Raise to CS: every new unit/template/WDM value needs the script.", pre="Developer access to UAT.",
     priority="High", ttype="Edge", role="Developer + Buyer", portal="Rails console + Buyer portal")
case("AW-CFG", M, "WDM", "Legal entity mapping lives in the widget data mapping rows (pc:unit_name)",
     ["Upload a WDM row gd_legal_entity 'QA_Platform ENTITY' with pc:unit_name = The Lodhi", "Open a Lodhi PO form's "
      "Legal Entity"],
     "The new entity appears for The Lodhi only (and in the builder after the sync). A row with a '\"' or '\\' in its value "
     "is skipped silently — record.", pre="WDM upload rights.", priority="Medium", role="CS", portal="Admin console")
case("AW-CFG", M, "Go-live", "Before go-live the company-level catch-all workflows must go",
     ["On the Company tab read the three 'test' workflows"],
     "With them active, every PO always has a workflow (no 2017) and a combination CS forgot is silently routed to all "
     "super admins / managers / members. Record as a go-live checklist item (PR §6.5).", priority="Critical",
     ttype="Edge")
case("AW-CFG", M, "Name", "The condition names carry the template name '(Test)'",
     [LOGIN, OPEN_WF, "Read the column headers"],
     "\"… - DLF PO - General Details (Test)\" — the production template must be named for users (e.g. \"DLF PO\") before "
     "the conditions are synced, or every header will say (Test).", priority="Medium", ttype="Edge")

# ═════════════════════ 11. Every button ═════════════════════
M = "11. Every button and box, once"
for where, items, steps in [
    ("Approval Workflows list", ["Team / Company tabs", "filter icon", "+ Create", "team block chevron", "Edit", "row click", "page arrows and box", "column sorters"], [LOGIN, OPEN_WF]),
    ("Trigger Settings drawer", ["Add Approval Type", "chip x", "Add Conditions", "Add Team", "Add Initiators", "Cancel", "Save"], [LOGIN, OPEN_WF, CLICK_CREATE, OPEN_DRAWER]),
    ("Conditions table", ["copy", "bin", "Name cell", "Prevent Approval Expiry switch", "each condition cell (search, tick, bin, Cancel, Save)", "Step cell (Fixed/Dynamic, approvers, duration unit, title, bin)", "Add Approval Workflow", "Add Step", "Publish Workflow", "summary Edit"], setup("Unit Name", "Department")),
    ("PO form General Details", ["caret", "each dropdown (search, pick)", "lock tooltip", "Sanction Note", "Comments", "Submit Proposal"], OPEN_PO),
    ("Submit modal", ["workflow radio / search", "Next", "Back", "Remarks", "attachment", "Submit", "Cancel / x"], OPEN_PO + [SUBMIT]),
]:
    case("AW-BTN", M, where, f"{where}: every control does what its name says and can be reached with Tab",
         steps + [f"Use each in turn: {', '.join(items)}", "Tab through the controls"],
         "Each control responds, shows a pointer on hover, and does only what its label says. Note any control that does "
         "nothing or something else.", priority="Medium", pre=PO_PRE if "PO form" in where or "modal" in where else DEFAULT_PRE)

# ── rules and findings ─────────────────────────────────────────────────────────────────────────
RULES = [
    ("What routes a PO", "Five dropdowns in the PO form's General Details: Form Type (= the event's RFQ template, locked), Unit "
     "Name (= the PR line's location, or the user's teams' units), Legal Entity (depends on Unit Name), Department, Nature of "
     "Expense. Sanction Note and Comments are text only and never route."),
    ("Matching", "Only Bid Proposal workflows whose team includes the initiator with the stated role (Member/Manager/Admin) are "
     "considered; if any TEAM workflow matches, COMPANY workflows are ignored. Each condition: 'is any of' (OR within the "
     "field); all conditions must hold (AND); a field without a condition means any value. Total Proposal Value and the other "
     "old conditions combine the same way."),
    ("Submit", "One match → attached. Several → the buyer picks. None → 2017 and no submit (never reachable on DLF UAT while "
     "the three company 'test' catch-alls exist). Mandatory fields empty → 2016 'Please fill …'. Chosen workflow no longer "
     "matching → 523 'Invalid Approval' and the modal reloads."),
    ("After submit", "General Details read-only; the approval request keeps meta_data.data.routing (values, workflow, rule, "
     "match_count, user_selected). Rejection → a new draft with the same values."),
    ("Where the lists come from", "Form Type: trade templates; Unit Name: buyer hubs (34 on UAT, incl. junk ones); Legal Entity, "
     "Department, Nature of Expense: widget data mapping rows gd_legal_entity / gd_department / gd_nature_of_expense, nesting "
     "through pc:unit_name. The builder's condition values come from approval_conditions filled by a sync script."),
    ("Not built (PRD vs PR)", "Nested value pickers in the builder; overlap warning; auto-select of a single server-backed child; "
     "keep-if-still-valid on parent change (everything is cleared); General Details on the approval page; PO listing filters "
     "and export; lock on an auto-filled Unit Name (optional)."),
]
FOUND = [
    ("High", "Publish with an untouched row shows 'successfully published' and creates nothing", "The empty row is skipped by "
     "validation and an empty list is sent; the page goes back to the list with a green toast.", "UI run 3 Nov: POST "
     "create_approval_flows {approval_flows: []} → 200 [] → toast.", "AW-TBL-017 / UI-CRT-013"),
    ("High", "Saving an empty Trigger Settings drawer blanks the drawer", "Fields replaced by grey loading bars, no 'cannot be "
     "empty' message; only Cancel works.", "UI run 3 Nov, screenshot probe2-drawer-empty-save / B-27.", "AW-TRG-007 / UI-CRT-032"),
    ("High", "Unknown condition key → HTTP 500", "", "API run 3 Nov: {key colour} → 500.", "AW-API-004 / API-FLW-006"),
    ("High", "Initiator role trap", "Workflows for 'Admin' initiators (incl. the pre-made GD Test – CAPEX ones) are invisible to a "
     "Member; CS can easily build a workflow nobody ever triggers.", "API-MAT-004/010, UI-SUB-002.", "AW-TRG-006"),
    ("Medium", "The API accepts condition values that are not in the catalogue, duplicate conditions, empty value lists and an "
     "unknown approval type", "Rules like (department == \"Finance\"), (department == \"IT\") && (department == \"HR\"), '()' and "
     "approval_key 'banana' were saved.", "API-FLW-005/007/008/016.", "AW-API-003…007"),
    ("Medium", "Unit Name condition list = raw buyer hubs", "'-', 'Free Text', 'Plant Name', 'Project BOQ team', 'AMBUJA NEOTIA', two "
     "'DLF Golf and Country Club'; the PRD's 44 named units are not what CS sees.", "API-CAT-002, UI-CRT-016.", "AW-TBL-005"),
    ("Medium", "Builder pickers ignore nesting; no overlap warning", "Kochi + LODHI PROPERTY can be saved; two overlapping workflows "
     "publish silently.", "UI-CRT-019, API-FLW-004.", "AW-TBL-008, AW-TBL-024"),
    ("Medium", "General Details not shown to approvers; no PO-list filters/export", "PRD acceptance criteria not met (PR says out "
     "of scope).", "Code: PR §9.", "PO-AFT-003, PO-AFT-007"),
    ("Medium", "Single mapped Legal Entity is not auto-selected; parent change clears a still-valid child", "PRD rules 'auto-select "
     "lone child' and 'keep valid child' are not what the page does for server-backed lists.", "Code: generalDetails.jsx "
     "findAutoSelectField / clearDescendants.", "PO-GD-008, PO-GD-009"),
    ("Low", "Submit with a minimal body → 500; reversed range → 'Something went wrong!'; typo 'choosen'", "", "API-SUB-000, "
     "API-FLW-018, UI-CRT-022.", "PO-SUB-012, AW-API-009, AW-TBL-011"),
    ("Low", "Comments with a <script> tag are blocked by the web firewall with an HTML 403", "The user gets a generic error, not a "
     "field message.", "API-SAVE-013b.", "PO-GD-016"),
    ("Info", "2017 'no workflow matches' cannot be tested on DLF UAT", "Three company-level 'test' workflows with no conditions "
     "catch every PO; they must be deleted before go-live.", "DB: approval_flows 6815–6817.", "PO-SUB-011, AW-CFG-005"),
]

# ── workbook ─────────────────────────────────────────────────────────────────────────────────
WIDTH = {"Test Case ID": 13, "Module": 24, "Scenario": 18, "Test Case Title": 42, "User Role": 16, "Portal": 18,
         "Pre-conditions": 40, "Configs Needed": 14, "Test Data": 18, "Test Steps": 72, "Expected Result": 66,
         "Priority": 10, "Test Type": 10, "Status": 10, "Automated check": 22, "Notes for the tester": 30}
HEAD = PatternFill("solid", fgColor="1F3A5F")
MOD = PatternFill("solid", fgColor="E8EEF6")
PRI = {"Critical": "C0392B", "High": "D35400", "Medium": "B7950B", "Low": "5D6D7E", "Info": "5D6D7E"}
thin = Side(style="thin", color="C9D3DF")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)


def build():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Test Cases"
    ws.append(COLS)
    for i, c in enumerate(COLS, 1):
        cell = ws.cell(row=1, column=i)
        cell.font = Font(bold=True, color="FFFFFF"); cell.fill = HEAD
        cell.alignment = Alignment(wrap_text=True, vertical="center")
        ws.column_dimensions[get_column_letter(i)].width = WIDTH[c]
    for c in CASES:
        ws.append([c[k] for k in COLS])
        r = ws.max_row
        for i in range(1, len(COLS) + 1):
            cell = ws.cell(row=r, column=i)
            cell.alignment = Alignment(wrap_text=True, vertical="top"); cell.border = BOX
        ws.cell(row=r, column=COLS.index("Priority") + 1).font = Font(bold=True, color=PRI[c["Priority"]])
        ws.cell(row=r, column=1).fill = MOD
    ws.freeze_panes = "E2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(COLS))}{ws.max_row}"

    mods = OrderedDict()
    for c in CASES:
        mods.setdefault(c["Module"], []).append(c)
    s = wb.create_sheet("Summary")
    s.append(["Module", "Cases", "Critical", "High", "Medium", "Low", "Positive", "Negative", "Edge", "With an automated check"])
    for m, cs in mods.items():
        s.append([m, len(cs)] + [sum(1 for c in cs if c["Priority"] == p) for p in ("Critical", "High", "Medium", "Low")]
                 + [sum(1 for c in cs if c["Test Type"] == t) for t in ("Positive", "Negative", "Edge")] + [sum(1 for c in cs if c["Automated check"])])
    s.append(["Total", len(CASES)] + [sum(1 for c in CASES if c["Priority"] == p) for p in ("Critical", "High", "Medium", "Low")]
             + [sum(1 for c in CASES if c["Test Type"] == t) for t in ("Positive", "Negative", "Edge")] + [sum(1 for c in CASES if c["Automated check"])])
    for i in range(1, 11):
        s.cell(row=1, column=i).font = Font(bold=True, color="FFFFFF"); s.cell(row=1, column=i).fill = HEAD
        s.column_dimensions[get_column_letter(i)].width = 14 if i > 1 else 60
    s.cell(row=s.max_row, column=1).font = Font(bold=True)

    f = wb.create_sheet("Found while testing")
    f.append(["Severity", "What", "Why", "Evidence", "Cases"])
    for row in FOUND: f.append(list(row))
    for i, w in enumerate([10, 50, 60, 50, 24], 1):
        f.column_dimensions[get_column_letter(i)].width = w
        f.cell(row=1, column=i).font = Font(bold=True, color="FFFFFF"); f.cell(row=1, column=i).fill = HEAD
    for row in f.iter_rows(min_row=2):
        for cell in row: cell.alignment = Alignment(wrap_text=True, vertical="top")
        row[0].font = Font(bold=True, color=PRI[row[0].value])

    ru = wb.create_sheet("Rules behind the cases")
    ru.append(["Topic", "Rule (in plain words)"])
    for t in RULES: ru.append(list(t))
    ru.column_dimensions["A"].width = 26; ru.column_dimensions["B"].width = 120
    for i in (1, 2): ru.cell(row=1, column=i).font = Font(bold=True, color="FFFFFF"); ru.cell(row=1, column=i).fill = HEAD
    for row in ru.iter_rows(min_row=2):
        for cell in row: cell.alignment = Alignment(wrap_text=True, vertical="top")

    sf = wb.create_sheet("Test safely")
    for line in [
        "1. DLF Hospitality UAT is a client's test workspace with real people in it. Name every workflow 'QA_Platform …' and make yourself its only approver; delete them when done.",
        "2. Never submit a PO through the company 'test' catch-all workflows: they route to all super admins / managers / members of DLF.",
        "3. Use RFX-2112 (vendor Demo10, made by the test user) for PO-form cases; reject your own approval afterwards so the event returns to draft and stays reusable.",
        "4. Do not edit or delete the 'hello', 'GD Test …' or 'test' workflows — other people's set-up.",
        "5. The approver search takes 1–3 seconds; wait before deciding a user is missing.",
        "6. 'Record' = the rule is not settled: write down exactly what happens and raise it to product.",
    ]: sf.append([line])
    sf.column_dimensions["A"].width = 150
    wb.save(OUT_XLSX)
    OUT_DIR.mkdir(exist_ok=True)
    (OUT_DIR / "data.json").write_text(json.dumps({"cases": CASES, "rules": RULES, "found": FOUND, "modules": list(mods.keys())}, ensure_ascii=False, indent=1))
    print(f"{len(CASES)} cases in {len(mods)} modules → {OUT_XLSX.name}")
    for m, cs in mods.items(): print(f"  {len(cs):3d}  {m}")
    print("priority", Counter(c["Priority"] for c in CASES)); print("type", Counter(c["Test Type"] for c in CASES))
    print("automated", sum(1 for c in CASES if c["Automated check"]))


if __name__ == "__main__":
    build()
