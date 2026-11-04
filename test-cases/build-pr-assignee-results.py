"""Fill PR_Assignee_Filter_and_Notification_Test_Cases.xlsx with the live run of 4 Nov 2026 (DLF Hospitality UAT).
Re-runnable: rebuilds the result columns, the extra cases, the bug sheet (with screenshots) and the summary.
Run with plain python3 (needs openpyxl + Pillow)."""
import os, shutil
import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.drawing.image import Image as XLImage
from PIL import Image

ROOT = "/Users/animesh/Desktop/procol"
XLSX = f"{ROOT}/test-cases/PR_Assignee_Filter_and_Notification_Test_Cases.xlsx"
SH = f"{ROOT}/prototype/data/evidence/pr-assignee/shots"
TMP = f"{ROOT}/prototype/data/evidence/pr-assignee/xlsx-img"
os.makedirs(TMP, exist_ok=True)
RUN = "Seen live on DLF Hospitality UAT, 4 Nov 2026"

# zoom of the cut-off message
im = Image.open(f"{SH}/D07-1010-no-match-message.png"); im.crop((1180, 195, 1420, 285)).resize((720, 270)).save(f"{SH}/D07z-message-cut-off.png")

R = {}  # id -> (status, actual, [shots])
def r(i, s, a, shots=()): R[i] = (s, a, list(shots))

# --- 0. set-up (DLF's own data was used; no team or user was created or edited)
r("PRA-SET-001", "Pass", "Used DLF's existing categories instead of creating new ones. PR-1 = PR 1010 (LIQUOR STORE > IMPORTED WHITE WINE). Subcategory pair = LIQUOR STORE > DOMESTIC SPARKLING vs IMPORTED WHITE WINE. Note: DLF has 4 different categories all named FOOD STORE and 3 named FRUITS (see extra case PRA-EXT-005).")
r("PRA-SET-002", "Pass", "Used existing DLF users, no team was changed. A (category user) = Procol Planner User, team All Categories limited to 15 categories incl. LIQUOR STORE. B (subcategory user) = Upasana (SPARKLING WATER, ENERGY DRINK, DOMESTIC SPARKLING...). E (location user) = Testing-T, limited to The Camellias. F (super admin) = Procol Support. I (removed) = Ravinder Negi, Govind Bhatt, Vishal Dutt, Dining dummy user (all memberships ended). G (process validator) and H (Sales team): DLF has none.")
r("PRA-SET-003", "Pass", "Used open DLF PRs: PR-1 = 1010 (The Lodhi), PR-2 = DGOLF-4081 (FOOD STORE > FRUITS at DLF Golf, a FOOD STORE that Procol Planner User's team does not have), PR-3 = PR-18 (two categories), PR-4 = 1005 (The Camellias), PR-5 = 1010 line 13 (700 of 900 open), PR-8..12 = 1006, 1005, 1004, 1003, 1002. No PR without a category and no item without a subcategory exist on DLF (PR-6, PR-7).")
# --- 1. one PR
r("PRA-ONE-001", "Pass", "Ticked DGOLF-4081, opened Assign, typed 'Procol Planner'. Procol Planner User was not offered (his team has other FOOD STORE categories, not this one).", ["D01-dgolf4081-list.png", "D02-dgolf4081-planner-searched.png"])
r("PRA-ONE-002", "Pass", "Upasana's team has LIQUOR STORE > DOMESTIC SPARKLING only. With PR 1010 (LIQUOR STORE > IMPORTED WHITE WINE) ticked, searching her name found nothing (checked through the same search the screen uses).")
r("PRA-ONE-003", "Not Run", "DLF has no Sales or other non-purchase team member who shares a PR's category, so this cannot be shown on DLF without creating a team.")
r("PRA-ONE-004", "Pass", "4 DLF users whose team memberships have all ended were searched by name for DGOLF-4081 and 1010: none was offered. Their visibility in the database is empty too.")
r("PRA-ONE-005", "Pass", "Testing-T is limited to The Camellias. With PR 1010 (The Lodhi) ticked, typing 'Testing-T' found nobody.", ["D06-1010-testingT.png"])
r("PRA-ONE-006", "Pass", "With DGOLF-4081 ticked, typing the full name 'Testing-T' (who cannot see it) found nobody. The box showed the 'No user can see...' message instead (see PRA-EXT-001).", ["D03-dgolf4081-testingT-searched.png"])
r("PRA-ONE-007", "Pass", "PR-18 has a FOOD STORE item and a SOFT BEVERAGE item. For 39 different access groups the offered users matched the PR-list rule exactly (a user who matches any item of the PR is offered).")
r("PRA-ONE-008", "Pass", "1010: one item ticked gave 20 names, two items of the same PR gave the same 20 names.", ["D08-1010-two-items.png"])
r("PRA-ONE-009", "Not Run", "No open DLF PR has an item without a category.")
r("PRA-ONE-010", "Not Run", "Every open DLF PR item has a subcategory, so a category-only item does not exist here.")
r("PRA-ONE-011", "Pass", "The box shows 20 names at first. PR 369 can be seen by 100 purchase users: three allowed users missing from the first 20 were each found by typing their name; a user who cannot see 369 was not found.", ["D01-dgolf4081-list.png"])
r("PRA-ONE-012", "Pass", "With PR 1010 (LIQUOR STORE) ticked, typing 'Procol Planner' offered Procol Planner User, whose team has LIQUOR STORE.", ["D05-1010-planner.png"])
r("PRA-ONE-013", "Pass", "Upasana's team has the subcategory SPARKLING WATER. With HIT101 (has SPARKLING WATER items) ticked she was offered.")
r("PRA-ONE-014", "Pass", "Checked every open DLF PR against one user from each of the 39 access groups (1,092 searches): category users, subcategory users, location users and super admins were offered exactly when the PR-list rule says they can see the PR. 0 differences.")
r("PRA-ONE-015", "Pass", "With PR 1005 (The Camellias) ticked, typing 'Testing-T' offered Testing-T (limited to The Camellias).", ["D09-1005-testingT.png"])
r("PRA-ONE-016", "Pass", "With DGOLF-4081 ticked, the super admin Procol Support was offered.", ["D04-dgolf4081-superadmin.png"])
r("PRA-ONE-017", "Not Run", "DLF has no Process Validator team. Creating one would change DLF's real team set-up.")
r("PRA-ONE-018", "Pass", "For all 22 open PRs and 6 mixes of several PRs, the offered users matched the PR-list visibility rule with 0 differences (1,092 searches). Not done: signing in as each user to open their own PR list, because that needs their sessions.")
# --- 2. several PRs
r("PRA-MANY-001", "Pass", "1005 + DGOLF-4081 ticked: only super admins were offered. DLF has 20 super admins in purchase teams, so the list is never empty here.", ["D11-1005-plus-dgolf-list.png", "D12-1005-plus-dgolf-superadmin.png"])
r("PRA-MANY-002", "Pass", "1005 + DGOLF-4081 ticked: Testing-T and Procol Planner User (who see 1005 only) were not offered.", ["D11-1005-plus-dgolf-list.png"])
r("PRA-MANY-003", "Not Run", "Cannot happen on DLF: 20 super admins can see every PR, so the list is never empty. The message itself was seen in another situation (PRA-EXT-001).")
r("PRA-MANY-004", "Fail", "Ticked 1004 line 1 on page 1 and 1000 line 1 on page 2. Both are fully open. 'Purchase Items 2' counts both, but the Assign button turns grey with the tooltip 'No open items selected', on page 2 and again back on page 1. The items cannot be assigned together. BUG-01.", ["D17-across-pages-page2-view.png", "D17b-across-pages-back-on-page1.png"])
r("PRA-MANY-005", "Pass", "1005 + 1004 ticked (both The Camellias, both LIQUOR STORE): Testing-T and Procol Planner User were both offered.", ["D13-1005-plus-1004.png"])
r("PRA-MANY-006", "Pass", "1005 ticked: Testing-T offered. Unticked it and ticked DGOLF-4081: Testing-T no longer offered. The list was fetched again each time.", ["D10-swap-selection.png"])
# --- 3. assigning
r("PRA-ASN-001", "Pass", "Ticked 1010 line 13 (700 of 900 open): Assign is grey with the tooltip 'No open items selected', and the row's Assignee cell is grey too.", ["D15-partly-used-item.png"])
r("PRA-ASN-002", "Pass", "Ticked 1010 line 13 (partly used) + 1010 line 14 (fully open): Assign stays grey.", ["D16-partly-plus-open.png"])
r("PRA-ASN-003", "Pass", "With nothing ticked the Assign button is grey.", ["D14-nothing-selected.png"])
r("PRA-ASN-004", "Blocked", "Needs a session of a user without assign rights. Signing in as another DLF user was not allowed in this run.")
r("PRA-ASN-005", "Not Run", "Needs DLF's company setting is_pr_teams_filtering_enabled switched Off. Changing DLF's settings was not approved.")
r("PRA-ASN-006", "Observation", "Sent the assign request directly: DGOLF-4079's item to Procol Planner User, who cannot see DGOLF PRs. It was accepted (HTTP 200) and saved. The known gap is still open; logged for the follow-up. BUG-04.")
r("PRA-ASN-007", "Pass", "Ticked both items of PR 1007, clicked Assign, picked Procol Planner User: message 'Items succesfully assigned to Procol Planner User!' and both rows now show him (saved in the database).", ["A01-bulk-1007.png"])
r("PRA-ASN-008", "Pass", "Clicked the Assignee cell of 1009 line 2: the list used the same rule (the request carried that item). Picked Procol Planner User; the row shows him.", ["A08-row-cell-list.png", "A09-row-cell-assigned.png"])
r("PRA-ASN-009", "Pass", "On DGOLF-4081's detail page the Assignee picker carried the item: Procol Planner User not offered, Procol Support offered. Nothing was assigned there.", ["D18-detail-page.png", "D19-detail-page-list.png"])
r("PRA-ASN-010", "Pass", "Changed 1009 line 2 from Procol Planner User to Test - Sumanta Dey from the row cell: saved, and the row shows the new name.", ["A10-row-reassigned.png"])
r("PRA-ASN-011", "Blocked", "Needs Procol Planner User's session to open the PR as him.")
r("PRA-ASN-012", "Blocked", "Needs a planner's session.")
# --- 4. notification text
r("PRA-NTX-001", "Pass", "Assigned 100001 line 10 to myself (Test - Sumanta Dey). My bell got no new 'assigned to you' notification.", ["A06-self.png", "A07-my-bell-after.png"])
r("PRA-NTX-002", "Pass", "Checked from the assigner's side: after 8 assignments to Procol Planner User, the assigner's bell got none of them. The other half (another user's bell) needs that user's session.")
WAIT = "The assignment is done and the notification is waiting in Procol Planner User's bell; reading it needs his session, which this run was not allowed to use. Expected text: "
r("PRA-NTX-003", "Blocked", WAIT + "'Test - Sumanta Dey assigned PR No. 1004 + 1 more to you.' (from 2 items of 1005 + 1 item of 1004 assigned together; 2 PRs, not '+ 2 more').")
r("PRA-NTX-004", "Blocked", WAIT + "'... PR No. 1009 + 1 more to you.' (1010 was ticked first, then 1009; 1009 is the older PR so it must be named).")
r("PRA-NTX-005", "Blocked", WAIT + "'PR No. 1011 has been assigned to you.' (1011's only item). Also check the message line does not say '1 line items'.")
r("PRA-NTX-006", "Blocked", WAIT + "one notification 'PR No. 1007 has been assigned to you.' (both items of 1007 together).")
r("PRA-NTX-007", "Blocked", WAIT + "'Test - Sumanta Dey assigned PR No. 1009 + 1 more to you.'")
r("PRA-NTX-008", "Blocked", WAIT + "'Test - Sumanta Dey assigned PR No. 1002 + 4 more to you.' (1006, 1005, 1004, 1003, 1002 ticked newest first).")
r("PRA-NTX-009", "Blocked", WAIT + "1009 line 2 was assigned to him and then moved to Test - Sumanta Dey, so he should have 'PR Items unassigned.' The new assignee is the assigner, so no 'assigned' notification is expected for her.")
r("PRA-NTX-010", "Not Run", "DLF does not use automatic PR assignment in this run.")
r("PRA-NTX-011", "Not Run", "Needs a user whose language is Bahasa Indonesia and their session.")
r("PRA-NTX-012", "Not Run", "Needs access to the assignee's mailbox.")
# --- 5. click
r("PRA-NCL-001", "Blocked", WAIT + "a single-PR notification for DGOLF-4079, a PR he cannot see (from PRA-ASN-006). Clicking it should not show the PR's data.")
r("PRA-NCL-002", "Blocked", WAIT + "clicking 'PR No. 1011 ...' should open PR 1011's detail page. The bell's code sends single-PR links to the detail page.")
r("PRA-NCL-003", "Blocked", WAIT + "clicking '... PR No. 1002 + 4 more ...' should open the PR list.")
r("PRA-NCL-004", "Blocked", "Needs a user with an old 'assigned N PR line items' notification and their session. My own account has none.")
r("PRA-NCL-005", "Blocked", "Needs Procol Planner User's session.")
# --- 6. regression
r("PRA-REG-001", "Pass", "The same user search without PR items still finds Testing-T; with DGOLF-4081's item it does not. Pickers that do not send PR items are not filtered.")
r("PRA-REG-002", "Not Run", "No 'before release' snapshot of PR visibility exists. Today's dropdown matches today's PR-list rule (PRA-ONE-018).")
r("PRA-REG-003", "Pass", "With an item ticked: Purchase Items is enabled, Actions opens with Mark as complete, Add PO & Close, Close items via PO generated offline, Issues with PR, Delete Item(s). Upload PRs is present. Only menus were opened.", ["R01-actions-menu.png"])

EXTRA = [  # id, module, scenario, title, steps, expected, priority, type, status, actual, shots
 ("PRA-EXT-001", "7. Extra cases found while testing", "Wrong empty message", "Typing a name that matches nobody shows the 'several PRs' message even with one PR ticked",
  "1. Open Purchase Requisitions, Open tab\n2. Tick one item of PR 1010 only\n3. Click Assign\n4. Type a name that does not exist, e.g. 'zzqx'",
  "A neutral message such as 'No matching user'. 'No user can see all selected PRs. Assign them separately.' should only show when no user can see all the ticked PRs.",
  "Medium", "Negative", "Fail", "The box says 'No user can see all selected PRs. Assign them separately.' with only one PR ticked and only because the typed name matches nobody. The same text shows when a real user is typed who cannot see the PR. BUG-02.", ["D07-1010-no-match-message.png"]),
 ("PRA-EXT-002", "7. Extra cases found while testing", "Message readable", "The empty-list message can be read in full",
  "1. Tick one item, click Assign\n2. Type a name that matches nobody", "The full message is readable.", "Low", "UI", "Fail",
  "The box is 152 pixels wide, so the message is cut to 'No user can see a...'. The user cannot read what to do. BUG-03.", ["D07z-message-cut-off.png"]),
 ("PRA-EXT-003", "7. Extra cases found while testing", "Request carries the selection", "The Assign list is asked for only the ticked items",
  "1. Tick DGOLF-4081's item\n2. Click Assign\n3. Look at the users search request", "The request names the ticked item.", "High", "Positive", "Pass",
  "The request carried exactly the ticked item. The same was seen from a row's Assignee cell and from the PR detail page.", ["D01-dgolf4081-list.png"]),
 ("PRA-EXT-004", "7. Extra cases found while testing", "Right rows assigned", "Right after an assignment, a new selection assigns exactly the ticked rows",
  "1. Assign some items\n2. Without reloading, tick 2 items of 1005 and 1 of 1004\n3. Assign them together", "Exactly the ticked items get the assignee.", "High", "Edge", "Couldn't tell",
  "Once (5-PR assignment, then 1005 lines 5 and 6 + 1010 line 15), 1005 line 13, which was not ticked, got the assignee and line 5, which was ticked, did not. Repeated with the request logged (1005 lines 7 and 8 + 1004 line 2): the screen sent exactly the ticked rows and they were saved. Not reproduced; worth one manual try.", ["A05-three-items-two-prs.png", "A05b-three-items-two-prs-retry.png"]),
 ("PRA-EXT-005", "7. Extra cases found while testing", "Duplicate category names", "Team category picker with categories that share a name",
  "1. Open Teams > All Categories > Edit Team\n2. Look at the categories", "Each category can be told apart.", "Low", "UI", "Observation",
  "DLF has 4 different categories named FOOD STORE and 3 named FRUITS. The team shows 'FOOD STORE' twice. Procol Planner User's team 'has FOOD STORE' yet cannot see the DGOLF FOOD STORE PRs, so an admin cannot tell from the screen who will be offered. BUG-06.", []),
 ("PRA-EXT-006", "7. Extra cases found while testing", "Toast spelling", "Success message spelling",
  "1. Assign any item", "'Items successfully assigned to <name>!'", "Low", "UI", "Observation",
  "The message reads 'Items succesfully assigned to Procol Planner User!' (succesfully). BUG-05.", ["A01-bulk-1007.png"]),
 ("PRA-EXT-007", "7. Extra cases found while testing", "Five PRs at once", "Assign items of 5 PRs together from one page",
  "1. Tick one item each of 1006, 1005, 1004, 1003, 1002 (newest first)\n2. Assign to Procol Planner User", "All 5 saved, success message.", "High", "Positive", "Pass",
  "Success message and all 5 items saved with Procol Planner User.", ["A04-five-prs.png"]),
]

FILL = {"Pass": "D5F5E3", "Fail": "FADBD8", "Blocked": "FDEBD0", "Not Run": "EAEDED", "Observation": "E8DAEF", "Couldn't tell": "FCF3CF"}
thin = Side(style="thin", color="BFBFBF"); BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
WRAP = Alignment(wrap_text=True, vertical="top")
HEAD_FILL = PatternFill("solid", fgColor="1F3864"); HEAD_FONT = Font(bold=True, color="FFFFFF")

wb = openpyxl.load_workbook(XLSX)
for n in list(wb.sheetnames):
    if n != "PR Assignee Test Cases": del wb[n]
ws = wb["PR Assignee Test Cases"]
heads = [c.value for c in ws[1]]
# drop our old result columns / extra rows when re-running
for col in ("Actual Result", "Screenshots"):
    for i, h in enumerate([c.value for c in ws[1]], 1):
        if h and str(h).startswith(col): ws.delete_cols(i); break
for rr in range(ws.max_row, 1, -1):
    if str(ws.cell(rr, 1).value or "").startswith("PRA-EXT-"): ws.delete_rows(rr)
heads = [c.value for c in ws[1]]
ST = heads.index("Status") + 1
ncol = len(heads)
AC, SC = ncol + 1, ncol + 2
for col, title, width in ((AC, f"Actual Result ({RUN})", 60), (SC, "Screenshots", 30)):
    c = ws.cell(1, col, title); c.fill = HEAD_FILL; c.font = HEAD_FONT; c.alignment = Alignment(wrap_text=True, vertical="center"); c.border = BOX
    ws.column_dimensions[openpyxl.utils.get_column_letter(col)].width = width
for e in EXTRA:
    row = [e[0], e[1], e[2], e[3], "Buyer (PR manager who can assign)", "Buyer portal", "Open PRs on DLF UAT.", "is_pr_teams_filtering_enabled = On", "-", e[4], e[5], e[6], e[7], "Not Run"]
    ws.append(row[:ncol]); R[e[0]] = (e[8], e[9], e[10])
seen = set()
for rr in range(2, ws.max_row + 1):
    cid = ws.cell(rr, 1).value
    if not cid: continue
    st, act, shots = R.get(cid, ("Not Run", "Not reached in this run.", []))
    seen.add(cid)
    ws.cell(rr, ST, st).fill = PatternFill("solid", fgColor=FILL[st])
    ws.cell(rr, AC, act); ws.cell(rr, SC, "\n".join(shots) if shots else "-")
    for col in range(1, SC + 1):
        c = ws.cell(rr, col); c.alignment = WRAP; c.border = BOX
missing = [k for k in R if k not in seen]
assert not missing, missing
ws.auto_filter.ref = f"A1:{openpyxl.utils.get_column_letter(SC)}{ws.max_row}"

# ---------- bugs, in the house bug-sheet format (bug_sheet.py = the tester's Internal RFX_Bugs layout)
import sys, datetime; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bug_sheet import write_bug_sheet
BUGS = [
 ("BUG-01", "High", "Purchase Requisitions > Open tab > Assign button",
  "Tick one fully open item on page 1 (e.g. 1004 line 1). Go to page 2 and tick another fully open item (e.g. 1000 line 1). Look at the Assign button (the person icon next to Upload PRs).",
  "Assign stays clickable. The list shows the users who can see both PRs, and both items can be assigned together.",
  "The Assign button turns grey with the tooltip 'No open items selected', although both items are fully open and 'Purchase Items 2' counts both. It stays grey after going back to page 1.",
  "Items on different pages can never be assigned together, and the tooltip blames the items for the wrong reason. The plan expects selections across pages to be counted.",
  "DLF UAT, 4 Nov 2026, PRs 1004 + 1000", "PRA-MANY-004", ["D17-across-pages-page2-view.png", "D17b-across-pages-back-on-page1.png"]),
 ("BUG-02", "Medium", "Assign dropdown > 'Search a user' box",
  "Tick one item of a single PR (e.g. 1010). Click Assign. Type a name that does not exist (e.g. 'zzqx'), or the name of a user who cannot see this PR.",
  "A plain 'No matching user' for a name that matches nobody. The 'No user can see all selected PRs' text only when several PRs are ticked and nobody can see all of them.",
  "It always says 'No user can see all selected PRs. Assign them separately.', even with one PR ticked and even for a simple typo.",
  "The buyer is told to 'assign them separately' when there is only one PR, and cannot tell a typo from a user who lacks access.",
  "DLF UAT, 4 Nov 2026, PR 1010", "PRA-EXT-001, PRA-ONE-006", ["D07-1010-no-match-message.png"]),
 ("BUG-03", "Low", "Assign dropdown > empty message",
  "Tick an item, click Assign, type a name that matches nobody.",
  "The whole message can be read.",
  "The box is only 152 pixels wide, so the message is cut to 'No user can see a...'.",
  "The one hint the screen gives is unreadable.",
  "DLF UAT, 4 Nov 2026", "PRA-EXT-002", ["D07z-message-cut-off.png"]),
 ("BUG-04", "Low (known gap)", "Assign request sent outside the screen",
  "Send the assign request directly for a PR item to a user who cannot see that PR (DGOLF-4079 item to Procol Planner User).",
  "Refused, because that user cannot open the PR.",
  "Accepted and saved (HTTP 200).",
  "The dropdown can be bypassed. The plan lists this as an out-of-scope follow-up; logged so it is tracked.",
  "DLF UAT, 4 Nov 2026, DGOLF-4079", "PRA-ASN-006", []),
 ("BUG-05", "Low", "Success message after assigning",
  "Assign any item to anyone.", "'Items successfully assigned to <name>!'",
  "'Items succesfully assigned to <name>!' (spelling).", "Looks careless to clients.",
  "DLF UAT, 4 Nov 2026", "PRA-EXT-006", ["A01-bulk-1007.png"]),
 ("BUG-06", "Low (data / UI)", "Teams > Edit Team > categories",
  "Open the All Categories team and look at its categories. Then assign a DGOLF FOOD STORE PR and look for a member of that team.",
  "An admin can tell which category is which, so they can predict who will be offered for a PR.",
  "DLF has 4 categories named FOOD STORE and 3 named FRUITS. The team shows 'FOOD STORE' twice. Its members are not offered for the DGOLF FOOD STORE PRs, because those use a third FOOD STORE.",
  "With the new filter, duplicate names make it look like the dropdown is wrong when it is not.",
  "DLF UAT, 4 Nov 2026", "PRA-EXT-005, PRA-ONE-001", ["D02-dgolf4081-planner-searched.png"]),
]

META = {  # id: (priority, blocker, dev type)
  "BUG-01": ("P1", "NO", "FE"), "BUG-02": ("P1", "NO", "FE"), "BUG-03": ("P2", "NO", "FE"),
  "BUG-04": ("P2", "NO", "BE"), "BUG-05": ("P2", "NO", "FE"), "BUG-06": ("P2", "NO", "PRODUCT GAP")}
SUMMARY = {
  "BUG-01": "Items ticked on two different pages cannot be assigned together",
  "BUG-02": "Wrong message 'No user can see all selected PRs' shows even for one PR or a typo",
  "BUG-03": "The 'no user' message in the Assign box is cut off and cannot be read",
  "BUG-04": "Assign request accepts a user who cannot see the PR (known gap)",
  "BUG-05": "Success message spelling: 'succesfully'",
  "BUG-06": "Duplicate category names (4 FOOD STORE, 3 FRUITS) make the assignee list look wrong"}
STEPS = {
  "BUG-01": ["Log in as the PR manager and open Purchase Requisitions > Open tab", "On page 1 tick a fully open item (e.g. PR 1004 line 1)",
             "Go to page 2 and tick another fully open item (e.g. PR 1000 line 1)", "Look at the Assign button (person icon next to Upload PRs) and hover on it"],
  "BUG-02": ["Open Purchase Requisitions > Open tab", "Tick one item of a single PR (e.g. PR 1010)", "Click the Assign button",
             "Type a name that does not exist (e.g. 'zzqx'), or a user who cannot see this PR"],
  "BUG-03": ["Open Purchase Requisitions > Open tab", "Tick one item and click Assign", "Type a name that matches nobody", "Read the message in the box"],
  "BUG-04": ["Send POST /purchase_requests/assign_pr_to_user with an item of DGOLF-4079 and the user Procol Planner User (who cannot see DGOLF PRs)",
             "Check the item's assignee"],
  "BUG-05": ["Tick any open item and click Assign", "Pick any user", "Read the message at the bottom right"],
  "BUG-06": ["Open Teams > All Categories > Edit Team and look at the categories", "Note 'FOOD STORE' appears twice",
             "On Purchase Requisitions tick a DGOLF FOOD STORE item, click Assign and type a member of All Categories (e.g. Procol Planner User)"]}
rows = []
for bid, sev, where, do, exp, act, why, seen, cases, shots in BUGS:
    pr, blk, dev = META[bid]
    rows.append({"id": bid, "summary": SUMMARY[bid], "status": "OPEN", "priority": pr, "blocker": blk, "dev_type": dev, "user_type": "Buyer",
                 "module": where, "description": f"{act} Expected behavior: {exp} Why it matters: {why}", "steps": STEPS[bid],
                 "shots": [f"{SH}/{x}" for x in shots], "artefact": "API request, no screen" if not shots else None,
                 "reported": datetime.date(2026, 11, 4), "qa": "Animesh", "qa_status": "FAIL",
                 "qa_comment": f"{seen}. Test cases: {cases}." + (" Known gap listed as out of scope in the plan." if "known gap" in sev else "")})
for n in ("Bugs in plain language", "pr_assignee"):
    if n in wb.sheetnames: del wb[n]
write_bug_sheet(wb, "pr_assignee", rows, feature="PR assignee filter", img_dir=TMP)

# ---------- summary
S = wb.create_sheet("Summary")
S.column_dimensions["A"].width = 34; S.column_dimensions["B"].width = 110
from collections import Counter
cnt = Counter(v[0] for v in R.values())
lines = [("Feature", "PR assignee filter + assignment notifications (plan by Vinit Singh, 30 Oct 2026)"),
         ("Where", "DLF Hospitality UAT (cpanel.ag-ri.in), company 43386, signed in as Test - Sumanta Dey (super admin); team filtering is On for DLF"),
         ("When", "4 Nov 2026"),
         ("How", "The real PR list driven in a browser by the QA platform (procol-ui-tests scripts pra-ui.ts, pra-matrix.ts, pra-extra.ts), plus the same users search the screen calls, compared with the PR-list rule read from the database (read-only). Every screenshot is in prototype/data/evidence/pr-assignee/shots."),
         ("Cases", f"{len(R)} ({len(R) - len(EXTRA)} written + {len(EXTRA)} extra found while testing)")]
lines += [(k, str(cnt.get(k, 0))) for k in ("Pass", "Fail", "Blocked", "Not Run", "Observation", "Couldn't tell")]
lines += [("", ""),
  ("Answer in one line", "Who is offered in the Assign dropdown is right: it matched the PR-list rule for every open DLF PR and every mix tried (1,092 checks, 0 differences), in the list, in a row's Assignee cell and on the PR detail page."),
  ("What is wrong", "1) Items ticked on two pages cannot be assigned together: Assign goes grey with a wrong 'No open items selected' tooltip. 2) The empty message always says 'No user can see all selected PRs. Assign them separately.', even for a typo with one PR, and it is cut off in the narrow box. 3) The assign request still accepts a user who cannot see the PR (known gap). 4) Small: 'succesfully' spelling; duplicate category names make the result look wrong."),
  ("Notifications", "Not read yet. The 9 assignments that produce every notification format were made to the test account Procol Planner User (single item, one PR many items, two PRs, five PRs, 2 PRs with 3 items, unassigned, a PR he cannot see). Reading his bell needs his session, which this run was not allowed to use. Each Blocked case says the exact text to expect."),
  ("Data changed", "PR items assigned to Procol Planner User: 1007 (2), 1011, 1010 lines 14 and 15, 1009 line 1, 1006 lines 15 and 16, 1005 lines 4, 6, 7, 8 and 13, 1004 lines 1 and 2, 1003 line 18, 1002 line 12, DGOLF-4079. Assigned to Test - Sumanta Dey: 100001 line 10, 1009 line 2. No team, user or company setting was changed."),
  ("Status meanings", "Pass = worked as written. Fail = did not. Blocked = needs a session or access this run did not have. Not Run = DLF has no data or setting for it. Observation = worth a decision. Couldn't tell = seen once, not reproduced.")]
for i, (a, b) in enumerate(lines, 1):
    S.cell(i, 1, a).font = Font(bold=True); S.cell(i, 2, b).alignment = WRAP
    if a in FILL: S.cell(i, 1).fill = PatternFill("solid", fgColor=FILL[a])
wb.move_sheet("Summary", offset=-2)
wb.save(XLSX)
print("saved", XLSX, dict(cnt))

# ---------- hand the same results to the QA platform (prototype/scripts/pra-to-platform.ts)
import json
json.dump({"results": {k: {"status": v[0], "actual": v[1], "shots": v[2]} for k, v in R.items()},
           "bugs": [{"id": b[0], "severity": b[1], "where": b[2], "do": b[3], "expected": b[4], "actual": b[5], "why": b[6], "seen": b[7], "cases": b[8], "shots": b[9]} for b in BUGS]},
          open(f"{ROOT}/prototype/data/evidence/pr-assignee/sheet-results.json", "w"), indent=1)
print("platform json written")
