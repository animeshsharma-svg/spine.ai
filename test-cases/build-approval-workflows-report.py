# Adds the 4 Nov end-to-end run (fresh events made from PR 369) and a plain-language bug sheet to the Approval Workflows report.
import json, copy
import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment
from openpyxl.utils import get_column_letter

SRC = "Approval_Workflows_Test_Case_Report.xlsx"
wb = openpyxl.load_workbook(SRC)
ws = wb["Test Cases"]
hdr = [c.value for c in ws[1]]
ws.cell(1, hdr.index("Result (seen on 3 Nov 2026)") + 1).value = "Result (seen live, 3–4 Nov 2026)"
# drop any earlier copy of module 12 so the script can be re-run
for i in range(ws.max_row, 1, -1):
    if str(ws.cell(i, 1).value or "").startswith("AW-E2E-"): ws.delete_rows(i)

MOD = "12. End to end on a fresh event made from a PR (run 4 Nov 2026)"
PRE = ("Logged in to DLF Hospitality on UAT as the test user (super admin, Member of team \"All Categories\"). Four test workflows exist, all for team All Categories, initiator Member, you as the only approver: "
       "A = Unit Name \"The Aralias\" + Legal Entity \"DLF LIMITED\" + Department \"IT\"; B = Department \"HR\"; C = Unit Name \"National Clubs -Kochi\" + Department \"IT\"; "
       "D = Form Type \"DLF Capex NFA Test RFQ\" + Nature of Expense \"Non-budgeted without 3 quotes\". A fresh event was made from PR 369 (the GARAM MASALA line, 10 Pkt at The Aralias), vendor Demo10 quoted ₹100/Pkt, Demo10 is awarded and the PO form is open. Delete the four workflows when you finish.")
FILL = {"Pass": "D5F5E3", "Observation": "FDEBD0", "Fail": "FADBD8", "Couldn't tell": "FCF3CF", "Blocked": "E8DAEF", "Not Run": "EAEDED"}
W = "✔ Works: "; X = "✘ Problem: "; S = "● Seen: "

def case(n, scen, title, steps, expected, status, result, prio="Critical", ttype="Positive", data="-", notes=None, ids=""):
    return ["AW-E2E-%03d" % n, MOD, scen, title, "Buyer (initiator) / Approver", "Buyer portal (cpanel)", PRE, "None", data, steps, expected, prio, ttype, status, result, notes, ids]

E = [
 case(1, "Set-up", "An event can be made from a PR line and taken to the PO form",
      "1. Purchase Requisitions → open PR 369 → tick the line \"GARAM MASALA 500GM MDH\" (The Aralias) → Create Event with the template \"DLF Capex NFA Test RFQ\", invite Demo10, publish\n2. Fill Demo10's quote with Quick Fill (₹100/Pkt for 10 Pkt)\n3. After bidding closes, award Demo10 and open the PO form",
      "The event shows the PR number, item number and material code on its line; the PO form opens with the General Details section on top.",
      "Pass", W + "4 Nov: RFX-2116 (The Aralias line) and RFX-2117 (Super Luxury line) were built this way through the same calls the screens make; both events carry PR 369, item 20 / 19 and the material code on the line, and the PO form opened for each.", ids="aw-e2e-build.ts"),
 case(2, "PO form", "Form Type is filled in by the system with the event's template and cannot be changed",
      "1. Open the PO form of RFX-2116\n2. Look at the Form Type row",
      "Form Type reads \"DLF Capex NFA Test RFQ\", shows the tag \"Auto-filled\" and a lock; it is greyed out.",
      "Pass", W + "Form Type* Auto-filled DLF Capex NFA Test RFQ, locked (E-01-po-form.png).", ids="E2E-U01"),
 case(3, "PO form", "Unit Name comes from the PR line and only that unit is offered",
      "1. Look at the Unit Name row\n2. Open its list",
      "Unit Name reads \"The Aralias (DLF-026)\" with the tag \"Auto-filled\"; the list has that one unit only.",
      "Pass", W + "Unit Name* Auto-filled The Aralias (DLF-026); the list offered only \"The Aralias (DLF-026)\" (E-02-unit-options.png).", ids="E2E-U02, E2E-U03, E2E-M06"),
 case(4, "PO form", "Legal Entity, Department and Nature of Expense chosen in the form are saved as you go",
      "1. Pick Legal Entity \"DLF LIMITED\"\n2. Type \"HR\" in Department and pick HR\n3. Pick Nature of Expense \"Budgeted with 3 quotes\"\n4. Reload the page",
      "Each pick is kept without a Save button; after the reload the three boxes still show the values.",
      "Pass", W + "All three picked; the server held form_type 6686, unit 12522, HR, DLF LIMITED, Budgeted with 3 quotes straight after the picks (E-03-filled-hr.png).", ids="E2E-U04 … E2E-U07"),
 case(5, "Submit", "Submit Proposal goes through the NTD page before the approval window",
      "1. Click Submit Proposal on the PO form\n2. On the page that opens (Proposal Template NTD) click Submit Proposal again",
      "The NTD page opens first; its own Submit Proposal opens the window titled \"Submit Proposal\" with the approval details.",
      "Pass", S + "NTD page reached every time (/project/…/proposal/…), then the approval window (E-04-ntd.png).", ttype="Functional", ids="E2E-U08"),
 case(6, "Which workflow", "Department HR → only workflow B is used",
      "1. With Department = HR, Submit Proposal → Submit Proposal\n2. Read the window",
      "No list to choose from: the window goes straight to the summary of B (\"Department HR\") with Step 1 = you (1d). A, C and D are not mentioned.",
      "Pass", W + "Only B listed, summary shown with approver Test - Sumanta Dey (E-05-modal-hr.png). The same through the API: matched = B only.", ids="E2E-U09, E2E-M01"),
 case(7, "Which workflow", "Department changed to IT → only workflow A; the Kochi workflow (C) is never offered",
      "1. Close the window, change Department to IT\n2. Submit Proposal → Submit Proposal",
      "Straight to the summary of A (\"The Aralias + DLF LIMITED + IT\"). B is gone; C (Kochi + IT) does not appear because the unit is The Aralias.",
      "Pass", W + "Only A listed (E-07-modal-it.png); API: matched = A only, C never offered.", ids="E2E-U10, E2E-M02"),
 case(8, "Which workflow", "Two workflows match → the window lists both and asks you to choose",
      "1. Change Nature of Expense to \"Non-budgeted without 3 quotes\"\n2. Submit Proposal → Submit Proposal",
      "The window shows \"Select Approval Workflow\" with a search box and two cards: A (its Unit / Legal Entity / Department values) and D (its Form Type / Nature of Expense values), each naming the approver; Cancel and Next below.",
      "Pass", W + "Two cards, A and D, each with the condition values and the approver (E-09-modal-a-d.png). API: matched = A and D.", ids="E2E-U11, E2E-M03"),
 case(9, "Which workflow", "In a list of several workflows nothing should be chosen for you",
      "1. In the two-card window do not click anything\n2. Press Next",
      "Next is greyed out, or a message \"Please select an approval workflow\" appears (the server already has this message).",
      "Observation", S + "The first card (A) is already ticked when the window opens and Next is active; pressing Next goes straight to A's summary with no message (E-10-nothing-chosen.png). A buyer who does not read the list sends the PO through whichever workflow is first.", ttype="Negative", notes="Product to decide: pre-selecting the first workflow is a design choice, but it means a wrong workflow can be used without a conscious choice.", ids="E2E-U11b, E2E-U11c"),
 case(10, "Which workflow", "Department HR + Non-budgeted without 3 quotes → B and D",
      "1. Set Department HR and Nature \"Non-budgeted without 3 quotes\" (from outside the form)\n2. Read the workflows offered",
      "B and D are offered; A and C are not.",
      "Pass", W + "API: matched = B and D, nothing else.", ids="E2E-M04"),
 case(11, "Which workflow", "No team workflow matches → what the buyer is offered",
      "1. Set Department \"Marketing\" (no test workflow mentions it)\n2. Read the workflows offered",
      "None of A–D. What the buyer gets instead depends on the company set-up: on DLF UAT the company-level \"test\" workflows (no conditions) catch everything.",
      "Observation", S + "None of A–D; the list fell back to the company workflow \"test\". The \"no workflow matches\" refusal cannot be seen on DLF UAT while those catch-all workflows exist.", ttype="Negative", ids="E2E-M05, E2E-M05b"),
 case(12, "Submit", "Submitting through A creates a pending request to the right approver and locks the General Details",
      "1. Set Nature back to \"Budgeted with 3 quotes\" → Submit Proposal → Submit Proposal (A's summary)\n2. Type a closing remark and click Submit Proposal\n3. Open Approvals → Initiated by me; open the PO form again",
      "Green \"Proposal submitted successfully\"; the request is pending with workflow A, one step, approver = you; the PO's General Details are now plain text (no dropdowns).",
      "Pass", W + "Submitted (200), toast shown (E-13-submitted.png); request pending on RFX-2116 with workflow A, 1 step; proposal status requested; General Details locked (is_editable false).", ids="E2E-U12 … E2E-U15"),
 case(13, "Submit", "A missing required value stops the submit",
      "1. Clear Legal Entity (from outside the form)\n2. Submit with workflow A",
      "Refused with \"Please fill Legal Entity\".",
      "Pass", W + "422 2016 Please fill Legal Entity.", ttype="Negative", ids="E2E-M07"),
 case(14, "Submit", "A workflow that no longer matches is refused",
      "1. Change Department to HR after the window listed A\n2. Submit with A",
      "Refused with \"Invalid Approval\" (523); the window re-lists what matches now.",
      "Pass", W + "422 523 Invalid Approval.", ttype="Negative", ids="E2E-M08"),
 case(15, "Approver", "The approver sees the request on the Approvals page",
      "1. As the approver open Approvals (Pending on me)\n2. Find the RFX-2116 / RFX-2117 row",
      "A row with the event, \"Proposal submission\", team All Categories, the value, the initiator, a 24 h countdown, stage 1/1 and the workflow name.",
      "Pass", W + "Row present with all of that (E-20-approvals-list.png, E2E-B2-01-list.png); the approver's own list marks it as needing their approval.", ids="E2E-A01, E2E-A02, E2E-B2-01"),
 case(16, "Approver", "The Approvals page opens without errors",
      "1. Open Approvals → Pending on me\n2. Watch the top of the page",
      "The list loads with no error message.",
      "Fail", X + "A red \"Internal Server Error\" pops up at the top every time the page opens (the call that loads the filter choices, approval_requests/filter_options, answers 500). The list itself still loads. Seen twice on 4 Nov (E-20-approvals-list.png).", ttype="Negative", ids="E2E-X01"),
 case(17, "Approver", "Add Response opens a remarks window; Approve and Reject wake up only after a remark",
      "1. Tick the request's box → the \"Add Response\" button becomes active with a count of 1\n2. Click Add Response\n3. Look at the Reject and Approve buttons, then type a remark",
      "A small window \"Approval Remarks *\" with a text box and the buttons Reject and Approve, both greyed out until a remark is typed.",
      "Pass", W + "Add Response 1 enabled after the tick; window with Approval Remarks, Reject and Approve greyed, both active after typing (E2E-B2-02-popover.png).", ids="E2E-B2-02 … E2E-B2-04"),
 case(18, "Approver", "The approver can see why this workflow was picked",
      "1. In Pending on me look at the row and open Add Response\n2. Look for the PO's Unit Name, Legal Entity, Department, Nature of Expense",
      "The approver can read the General Details that routed the PO (the requirement says the values are shown so the approver knows why it landed with them).",
      "Fail", X + "Not shown anywhere on the approver's side: not in the row, not in the Add Response window. Only the buyer's own submit window shows the \"Selected Approval Clause\" values. The approver decides blind.", ttype="Functional", notes="The PR note says this was left out of the build; it is still a gap against the requirement.", ids="E2E-A04, E2E-B2-03b"),
 case(19, "Approver", "Reject from the Approvals page",
      "1. Tick the request → Add Response → type a remark → Reject",
      "The row leaves Pending on me; the proposal becomes rejected; the buyer gets a new draft PO.",
      "Pass", W + "Row gone at once; proposal status rejected on the server (E2E-B2-03-after-reject.png).", ids="E2E-B2-05"),
 case(20, "After reject", "The new draft PO keeps the General Details and matches the same workflow again",
      "1. After the rejection open the event's PO form again\n2. Read the General Details; Submit Proposal again",
      "A new draft with the same Form Type / Unit / Legal Entity / Department / Nature already filled and editable; the same workflow is offered; the second submit goes through.",
      "Pass", W + "New draft carried all five values (RFX-2116: IT; RFX-2117: HR); matched A / B again; second submit 200, status requested.", ids="E2E-A06 … E2E-A08, E2E-B3, E2E-B4"),
 case(21, "Approver", "Approve from the Approvals page awards the event",
      "1. Tick the request → Add Response → type a remark → Approve\n2. Open the event and the PO form",
      "The row leaves Pending on me; the proposal becomes selected (approved); the event's stage is closed; the PO form shows the General Details read-only with the values kept.",
      "Pass", W + "Row gone; proposal selected; stage closed; PO form read-only with the same values (E2E-B5-03-after-approve.png, E-27-po-after-approve.png).", ids="E2E-B5-05, E2E-B6, E2E-A10"),
 case(22, "Which workflow", "A second event from another PR line (Super Luxury) with Department HR uses only B",
      "1. Make a second event from PR 369's \"CHICKEN MASALA\" line (Super Luxury) the same way\n2. In its PO form set HR, DLF LIMITED, Budgeted → Submit",
      "Only B is offered (A needs The Aralias, C needs Kochi); the submit goes through with B.",
      "Pass", W + "RFX-2117: matched = B only, submitted (200) twice (before the reject and after).", ids="E2E-B1-match, E2E-B4-match"),
 case(23, "After approval", "\"Initiated by me\" shows the request with its final state",
      "1. Open Approvals → Initiated by me\n2. Find the RFX-2117 row",
      "The row shows the request as approved.",
      "Couldn't tell", S + "The row was not on the first page of the tab in the run (the tab may sort differently); not re-checked by hand.", ttype="Functional", ids="E2E-B7"),
 case(24, "After submission", "The request records why it was routed",
      "1. Read the request (from outside the screens)",
      "The request keeps a note of the values it was routed on (unit, entity, department, nature) so support can answer \"why this workflow?\" later.",
      "Observation", S + "The request read-back does not expose the routing snapshot; the buyer's submit window is the only place the clause values are shown.", ttype="Functional", ids="E2E-U14b"),
]
base_font = copy.copy(ws["A2"].font); base_al = Alignment(wrap_text=True, vertical="top")
for row in E:
    ws.append(row); r = ws.max_row
    for c in range(1, len(hdr) + 1):
        cell = ws.cell(r, c); cell.font = copy.copy(base_font); cell.alignment = base_al
    st = ws.cell(r, hdr.index("Status") + 1); st.fill = PatternFill("solid", fgColor=FILL.get(st.value, "FFFFFF"))
ws.auto_filter.ref = f"A1:{get_column_letter(len(hdr))}{ws.max_row}"

# ── Bugs in plain language ──
if "Bugs in plain language" in wb.sheetnames: del wb["Bugs in plain language"]
bs = wb.create_sheet("Bugs in plain language", 1)
BH = ["#", "How bad", "Where", "Do this", "What should happen", "What happens instead", "Why it matters", "Seen on", "Cases"]
bs.append(BH)
BUGS = [
 ("High", "Approval Workflows → Create → Publish", "Open Approval Workflows → + Create → Add Trigger Settings, fill it and Save. Leave the row in the table empty. Click Publish Workflow.", "A message that the row must be filled (name, conditions, a step with an approver).", "A green \"Approval workflow has been successfully published\" and you are back on the list — but no workflow was created.", "Whoever set it up believes the routing is live. POs will not be routed by it.", "3 Nov, live run", "AW-TBL-017"),
 ("High", "Approval Workflows → Create → Add Trigger Settings", "Click Add Trigger Settings and click Save straight away, before the lists have loaded.", "\"Approval type cannot be empty\" / \"Team cannot be empty\" under the boxes.", "The boxes turn into grey loading bars and stay like that; only Cancel gets you out.", "Looks broken; the user has to start again.", "3 Nov, screenshot probe2-drawer-empty-save", "AW-TRG-007"),
 ("High", "Approval Workflows → Create → Add Trigger Settings", "Open Add Trigger Settings, pick Bid Proposal and a condition, click Cancel. Open it again.", "A clean, empty panel.", "The old choices are still there, and even the old red \"Team cannot be empty\" error.", "Cancel does not cancel; a half-made set-up can be published by mistake.", "3 Nov, screenshot M-06b", "AW-TRG-009"),
 ("High", "Workflows sent from outside the builder (API)", "Send a workflow whose condition is something the product does not know (for example key \"colour\").", "A clear refusal (\"unknown condition\").", "\"Internal Server Error\" (500).", "A wrong integration can crash the call instead of being told what is wrong.", "3 Nov", "AW-API-004"),
 ("Medium", "Workflows sent from outside the builder (API)", "Send a workflow with a value that is not in the list (\"Department is Finance\"), the same condition twice, an empty value list, or approval type \"banana\".", "Each of these is refused.", "All of them are saved. The empty list becomes a rule that reads \"()\".", "Rules that can never match (or match wrongly) end up in the list and nobody knows.", "3 Nov", "AW-API-003, 005, 006, 007"),
 ("Medium", "Approval Workflows → table → Unit Name", "Open the Unit Name box in a workflow row.", "The company's real units only.", "The raw location list: \"-\", \"Free Text\", \"Plant Name\", \"Project BOQ team\", \"AMBUJA NEOTIA\", two \"DLF Golf and Country Club\" entries.", "Easy to pick a junk unit; duplicates make the right one a guess.", "3 Nov, screenshot B-11", "AW-TBL-005"),
 ("Medium", "Approval Workflows → table", "Pick Unit Name Kochi and Legal Entity LODHI PROPERTY (an entity that does not belong to Kochi) and publish. Also publish two workflows with the same conditions.", "The builder stops the impossible pair; overlapping workflows get a warning.", "Both are saved without a word.", "Workflows that never match, or several that match the same PO, with no warning at set-up time.", "3 Nov", "AW-TBL-008, AW-TBL-024"),
 ("Medium", "Approvals → Pending on me → Add Response", "As the approver tick a Bid Proposal request and click Add Response. Look for the PO's Unit Name, Legal Entity, Department and Nature of Expense.", "The approver sees those values — the reason the PO landed with them (the requirement asks for this).", "Only a remarks box with Approve and Reject. The values are not in the row either. Only the buyer's own submit window shows them.", "The approver decides without seeing why they got it; a wrongly routed PO cannot be spotted from the approver's side.", "3 Nov and again 4 Nov end to end (E2E-B2-02-popover.png)", "PO-AFT-003, AW-E2E-018"),
 ("Medium", "Approvals page", "Open Approvals → Pending on me.", "The list loads quietly.", "A red \"Internal Server Error\" pops up at the top every time (the call that loads the filter choices fails with 500). The list itself still loads.", "Every approver sees an error on every visit; the filters behind it do not work.", "4 Nov, twice (E-20-approvals-list.png)", "AW-E2E-016"),
 ("Medium", "PO form → General Details", "Pick a unit that has exactly one Legal Entity; then change the unit.", "The lone entity is filled in by itself; after a unit change the entity is cleared only if it no longer fits.", "The lone entity must still be picked by hand; any unit change clears the entity (and the fields under it) even when it still fits.", "Extra clicks on every PO and values lost without need.", "3 Nov (lone entity live; clearing read from the code)", "PO-GD-008, PO-GD-009"),
 ("Medium", "Submit Proposal window (several matches)", "Get two matching workflows and open the submit window. Do not click anything. Press Next.", "Nothing pre-selected; Next greyed out or \"Please select an approval workflow\".", "The first workflow is already ticked and Next goes straight to its summary.", "A buyer in a hurry sends the PO through whichever workflow is first in the list, without a conscious choice.", "4 Nov (E-10-nothing-chosen.png)", "AW-E2E-009"),
 ("Medium", "Approval Workflows (who can trigger)", "Make a team workflow whose initiator is \"Admin\". Submit a PO as a Member of that team.", "Either the Member is offered it, or the builder makes it obvious that only Admins trigger it.", "The Member never sees it (the pre-made \"GD Test – CAPEX…\" workflows are like this). Nothing in the builder or the list warns about it.", "Workflows can be built that nobody ever triggers, and nobody is told.", "3 Nov", "AW-TRG-006"),
 ("Low", "Submit / reject calls from outside (API)", "Submit with the minimum request; send a money range with the high number first; read the builder's text; send a wrong resolution to the reject call.", "Clear refusals and correct words.", "Bare submit → server error (500); reversed range → \"Something went wrong!\"; the builder says \"choosen\"; the reject call's error says \"choose Approve or Reject\" but those are not the values it takes.", "Confusing for anyone integrating or reading errors.", "3 Nov", "PO-SUB-012, AW-API-009, AW-TBL-011, PO-AFT-005"),
 ("Low", "PO form → Comments", "Type a comment containing <script> and leave the box.", "The box keeps the text as plain text or shows a field hint.", "The web firewall blocks the save with a plain error page.", "A harmless paste looks like a crash.", "3 Nov", "PO-GD-016"),
 ("Info", "DLF UAT data", "Try to get \"no workflow matches\" on DLF UAT.", "A refusal when nothing matches.", "Cannot be reached: three company-level workflows named \"test\" with no conditions catch every PO (seen again 4 Nov with Department Marketing).", "Delete those three before go-live or every PO will route to them.", "3 Nov, 4 Nov", "PO-SUB-011, AW-CFG-005, AW-E2E-011"),
]
for i, b in enumerate(BUGS, 1): bs.append([i, *b])
SEV = {"High": "FADBD8", "Medium": "FDEBD0", "Low": "FCF3CF", "Info": "EAEDED"}
for r in range(2, bs.max_row + 1):
    for c in range(1, len(BH) + 1):
        cell = bs.cell(r, c); cell.font = copy.copy(base_font); cell.alignment = base_al
    bs.cell(r, 2).fill = PatternFill("solid", fgColor=SEV[bs.cell(r, 2).value])
for c, w in zip("ABCDEFGHI", [4, 9, 30, 46, 40, 52, 40, 22, 22]): bs.column_dimensions[c].width = w
hf = PatternFill("solid", fgColor="1F3A5F"); hfont = Font(bold=True, color="FFFFFF")
for s in (bs,):
    for c in s[1]: c.fill = hf; c.font = hfont; c.alignment = Alignment(wrap_text=True, vertical="center")
bs.freeze_panes = "C2"; bs.auto_filter.ref = f"A1:I{bs.max_row}"

# ── Summary rebuilt ──
del wb["Summary"]; sm = wb.create_sheet("Summary")
STS = ["Pass", "Fail", "Observation", "Blocked", "Not Run", "Couldn't tell"]
sm.append(["Module", "Cases", *STS])
mods = []; 
for i in range(2, ws.max_row + 1):
    m = ws.cell(i, 2).value
    if m not in mods: mods.append(m)
tot = [0] * (len(STS) + 1)
for m in mods:
    rows = [i for i in range(2, ws.max_row + 1) if ws.cell(i, 2).value == m]
    cnt = [len(rows)] + [sum(1 for i in rows if ws.cell(i, hdr.index("Status") + 1).value == s) for s in STS]
    sm.append([m, *cnt]); tot = [a + b for a, b in zip(tot, cnt)]
sm.append(["Total", *tot]); sm.append([])
sm.append(["Status meanings"]); 
for t in ["Pass — every live check of the case worked as described.", "Fail — at least one live check found a problem (see Result and the sheet \"Bugs in plain language\").", "Observation — the check ran; the rule is not settled in the requirement, so the result is recorded for product to decide.", "Blocked — could not be run on UAT (data or access missing); the reason is in the Result column.", "Not Run — a manual case the automation does not cover.", "Couldn't tell — the check ran but the result was not clear enough to call."]: sm.append([t])
sm.append([]); sm.append(["End-to-end run, 4 Nov 2026"])
for t in ["Two fresh events were made from PR 369 (RFX-2116 at The Aralias, RFX-2117 at Super Luxury), each with a Demo10 quote, awarded, PO form filled, submitted, rejected by the approver from the Approvals page, re-submitted and approved from the Approvals page.",
          "The approval workflow triggered exactly by the General Details every time: HR → B only; IT at The Aralias → A only (the Kochi workflow never); IT + Non-budgeted → A and D to choose from; Marketing → none of the test workflows.",
          "Two problems on the approver's side: a red \"Internal Server Error\" on every visit to the Approvals page, and the approver cannot see the values the PO was routed on."]: sm.append([t])
for c in sm[1]: c.fill = hf; c.font = hfont
sm.column_dimensions["A"].width = 70
for col in "BCDEFGH": sm.column_dimensions[col].width = 12
wb.save(SRC)
print("rows", ws.max_row - 1, "| totals", dict(zip(["Cases", *STS], tot)), "| bugs", len(BUGS))
