#!/usr/bin/env python3
"""Build the PR assignment test cases: an HTML page (for the artifact) and an
Excel workbook (to share), from one list of cases. Facts come from
procol-backend origin/rfx-uat-main and procol-client-dashboard origin/main
(read-only) and from M3M NOIDA's rows in the UAT database, 23 Oct 2026."""
import html, json
from pathlib import Path
import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HERE = Path(__file__).resolve().parent
OUT_HTML = HERE / "pr-assignment-test-cases.html"
OUT_XLSX = HERE / "PR_Assignment_Test_Cases.xlsx"

# ── the cases ───────────────────────────────────────────────────────────
# (id, area, title, priority, pre-conditions, steps, expected (what the code does today), note / open question)
C = []
def case(id, area, title, p, pre, steps, expected, note=""):
    C.append(dict(id=id, area=area, title=title, p=p, pre=pre, steps=steps, expected=expected, note=note))

A = "A. Who appears in the assignee list"
case("PRA-A01", A, "A member of a Purchase-type team mapped to a parent category appears", "High",
     "A user U1 is an active member of a team whose type is Purchase and whose categories contain only a parent category (e.g. '0011'). U1 is active in the workspace.",
     ["Open Purchase Requisitions → Open tab.", "Tick one PR line whose item is fully open (Qty open = Qty requested).", "Click the assignee (person +) button above the table, or the '+' in the Assignee cell of the row.", "Do not type anything; look at the list."],
     "U1 is in the list. The list is built from team TYPE only: every active member of any Purchase-type team of the workspace, regardless of which category or sub-category the team is mapped to.",
     "Code: client calls GET /users/search?query=&filters={\"team_types\":[\"purchase\"]}; the backend joins users to teams and keeps team_type = purchase. No category is sent and none is checked.")
case("PRA-A02", A, "A member of a Purchase-type team mapped only to a sub-category appears", "High",
     "A user U2 in a Purchase-type team mapped only to a sub-category (e.g. 'anjs' under its parent), like M3M NOIDA's team 'Purchase' (plant 7245 + sub-category 'anjs').",
     ["Same steps as PRA-A01."],
     "U2 is in the list, exactly like U1. Sub-category versus category makes no difference to the assignee list.",
     "This answers the first question: neither mapping hides a user from the list. What hides a user is the team TYPE (next case) or the 20-name limit (PRA-A05).")
case("PRA-A03", A, "A user mapped to a category only through a NON-Purchase team does not appear", "High",
     "A user U3 who is a member only of a team of another type (M3M NOIDA: 'Technical Team', type Planner, mapped to two categories) and of no Purchase-type team.",
     ["Same steps as PRA-A01.", "Then type U3's name in the box."],
     "U3 is not in the list, and typing the name still does not find U3. The category mapping of a Planner/Finance/Vendor-management team does not make its members assignable.",
     "On UAT M3M NOIDA: the two users who are only in 'Technical Team' are not offered; the one user who is in both teams is offered.")
case("PRA-A04", A, "A user in no team at all does not appear", "Medium",
     "A user U4 active in the workspace, member of no team.",
     ["Same steps as PRA-A01; type U4's name."],
     "U4 is not offered. (Assignment through the API would still be accepted for U4 — see PRA-B02 — the restriction is only in the screen's list.)")
case("PRA-A05", A, "Only the first 20 names show until you type (workspaces with more than 20 purchase users)", "High",
     "A workspace with more than 20 active users in Purchase-type teams.",
     ["Open the assignee list without typing.", "Count the names; note they are sorted by first name.", "Type the first letters of a user whose first name sorts after the 20th."],
     "Without typing, at most 20 names are shown (sorted by first name). The user appears only after typing. A user whose first name starts with a late letter can look 'invisible'.",
     "Code: users_controller#search → limit(20), order(:first_name). M3M NOIDA on UAT has 7 purchase users, so it is not hit there; it will be on bigger workspaces.")
case("PRA-A06", A, "Search matches name (and e-mail only when the flag is sent)", "Medium",
     "Any workspace.",
     ["Type part of a first name, part of a last name, then part of an e-mail address."],
     "Name parts match. E-mail does not match from the assignee box (the box does not send include_email_search_results).",
     "")
case("PRA-A07", A, "The list is the same whatever the PR's category", "High",
     "Two PRs whose items belong to different categories (e.g. RM-STEEL under '0011', and a product under 'anjs').",
     ["Open the assignee list on PR 1; note the names.", "Open it on PR 2; compare."],
     "Identical lists. The PR's category / sub-category is not used to narrow the assignees. Nothing warns that the chosen user's team is mapped to a different category.",
     "Product question: is this the intended behaviour? Today a buyer can assign a steel PR to a user whose team only covers 'anjs'.")
case("PRA-A08", A, "Inactive users and users removed from the workspace do not appear", "Medium",
     "A user U5 deactivated, and a user U6 whose workspace mapping was removed, both former Purchase-team members.",
     ["Open the assignee list; type their names."],
     "Neither is offered (users.active and an active user_company_mapping are required).")
case("PRA-A09", A, "A Purchase-type team with NO categories and NO plant still makes its members assignable", "Low",
     "A Purchase-type team with empty category and plant lists.",
     ["Open the assignee list."],
     "Its members are offered — the list only looks at team type.")

B = "B. Assigning (the action and its rules)"
case("PRA-B01", B, "Assign one open line to a user", "High",
     "A PR line fully open; the buyer has the assign permission.",
     ["Click '+' in the Assignee cell, pick a user."],
     "Toast 'Items succesfully assigned to <name>!' (sic — 'succesfully' is misspelt in the UI). The Assignee cell shows the avatar and name; the assignee date is stamped on the line; an audit-trail entry 'assigned' is written with the previous assignee.",
     "Backend: POST /purchase_requests/assign_pr_to_user {item_ids, user_id}.")
case("PRA-B02", B, "Assign many lines at once from the header button", "High",
     "Several open lines ticked.",
     ["Tick 3 lines of different PRs, click the person+ button, pick a user."],
     "All three lines get the assignee; one toast; the assignee gets ONE in-app notification saying '… assigned 3 PR line items to you.' (count, no PR numbers).")
case("PRA-B03", B, "Assign button is disabled when any ticked line is not fully open", "High",
     "One ticked line already partly in an event or PO (Qty open < Qty requested).",
     ["Tick an open line and a partly processed line.", "Hover the person+ button."],
     "Button disabled; tooltip 'No open items selected'. The row's own '+' is also disabled for that line.",
     "Backend enforces it too: 422 'item(s) not found' (code 528) if an item is not fully open.")
case("PRA-B04", B, "Re-assign a line to another user", "High",
     "A line assigned to U1.",
     ["Click the assignee cell, pick U2."],
     "U2 becomes assignee. U2 gets 'assigned 1 PR line items'; U1 gets 'PR Items unassigned. <assigner> unassigned 1 PR line items from you.' The audit trail records U1 → U2.")
case("PRA-B05", B, "Unassign (clear) a line", "Medium",
     "A line assigned to U1.",
     ["Call the assign API with an empty user_id for the line (the screen has no 'clear' control — confirm with product whether it should)."],
     "assignee becomes empty; U1 gets the 'unassigned' notification.",
     "Open question for product: there is no visible way to unassign from the screen.")
case("PRA-B06", B, "Assigning to yourself sends no notification", "Low",
     "Buyer B assigns a line to B.",
     ["Pick yourself in the list."],
     "Assignment works; no in-app notification (the code skips assigner == assignee); the assignment e-mail is still sent if the e-mail flag is on.")
case("PRA-B07", B, "A user who is not in the workspace cannot be assigned (API)", "Medium",
     "A user id from another company.",
     ["POST assign_pr_to_user with that user_id."],
     "422 'Insufficient parameters' (code 2): the assignee must have an active mapping in the workspace. Team or category membership is NOT checked by the API.")
case("PRA-B08", B, "A user in no Purchase team can still be assigned through the API", "Medium",
     "User U4 from PRA-A04.",
     ["POST assign_pr_to_user with U4's id (Postman)."],
     "Accepted (200). Only the screen's list restricts to Purchase-team members; the API does not.",
     "Product question: should the API refuse non-purchase users?")
case("PRA-B09", B, "Assignment and the PR's own visibility are independent", "High",
     "Workspace flag is_pr_teams_filtering_enabled = true; user U7 is in a Purchase team mapped to category X; a PR whose items are in category Y.",
     ["Assign the Y PR line to U7.", "Log in as U7 and open Purchase Requisitions."],
     "Assignment is accepted and the notification is sent, but U7 cannot see the PR in the list and cannot open it (the list is filtered by team identifiers, see section C). The notification leads to a list that does not contain the PR.",
     "Likely the real-world cause of 'got the notification but cannot find the PR' when team filtering is on. It is OFF on M3M NOIDA (UAT), so there everyone sees every PR.")
case("PRA-B10", B, "Bulk assignment by Excel upload", "Medium",
     "The bulk template (PR number, item number, user e-mail).",
     ["Actions → bulk PR assignment template; fill 3 rows; upload."],
     "Rows applied in batches; result sheet with per-row status; the same notifications as manual assignment; unknown e-mail or non-member rows are reported as errors.")
case("PRA-B11", B, "Lines of a deleted / inactive PR cannot be assigned", "Low",
     "A deleted PR.",
     ["POST assign_pr_to_user for its line."],
     "422 'item(s) not found' (code 528).")

Cv = "C. Who can SEE a PR (team identifiers) — only when the workspace flag is on"
case("PRA-C01", Cv, "Flag OFF (M3M NOIDA on UAT today): everyone sees every PR, categories play no part", "High",
     "custom configuration is_pr_teams_filtering_enabled absent or false (M3M NOIDA 43569: absent; M3M NOIDA LIMITED 43577: false).",
     ["Log in as a Purchase-team member whose team is mapped to 'anjs' only.", "Open PR 0110000195 (RM-STEEL, under '0011')."],
     "The PR is listed and opens. Category mapping has no effect on visibility.",
     "So on this test workspace, 'mapped to category vs sub-category' cannot change what a user sees. Turn the flag on (ops) to test section C.")
case("PRA-C02", Cv, "Flag ON: team mapped to the PARENT category sees PRs of all its sub-categories", "High",
     "Flag on. Team T1 (Purchase type, no plant) mapped to category '0011'. PR with an RM-STEEL item (RM-STEEL is a child of '0011').",
     ["Log in as a T1 member; open the PR list."],
     "Visible. A PR carries one identifier per category level of each item (parent AND child: c_id#0011, c_id#RM-STEEL), so a parent-category team matches.",
     "Code: PurchaseRequest#get_team_identifiers uses product.category.path_ids (all levels).")
case("PRA-C03", Cv, "Flag ON: team mapped only to the SUB-category sees PRs of that sub-category", "High",
     "Team T2 mapped only to RM-STEEL.",
     ["As a T2 member, open the list."],
     "The RM-STEEL PR is visible; a PR of another sub-category under '0011' is not.")
case("PRA-C04", Cv, "Flag ON: team mapped to a different category does not see the PR, even if assigned", "High",
     "Team T3 mapped to 'anjs'. The RM-STEEL PR line assigned to a T3 member.",
     ["As that member, open the list and the notification."],
     "Not visible, cannot be opened by URL either (the PR page uses the same filter). Same as PRA-B09.")
case("PRA-C05", Cv, "Flag ON: team with plant + category sees only that plant's PRs of that category", "High",
     "Team T4 = plant 7245 + sub-category 'anjs' (this is M3M NOIDA's 'Purchase' team). Its members' identifier is only 'bh#7245#c_id#83459'.",
     ["PR A: item in 'anjs', location mapped to plant 7245 → expected visible.", "PR B: item in 'anjs', location of another plant → expected NOT visible.", "PR C: item in 'anjs', location code not mapped to any plant → expected NOT visible."],
     "Only PR A. When a team has both a plant and categories, members get only the plant+category combination, never the plain category.",
     "Easy to misread as 'category mapping broken'. PR C is the subtle one: a PR whose location is not a known plant gets only 'c_id#…' identifiers, which this team does not hold.")
case("PRA-C06", Cv, "Flag ON: team with a plant and NO categories sees every category of that plant", "Medium",
     "Team T5 = plant 7245, empty categories.",
     ["As a member, open the list."],
     "PRs of plant 7245 of any category are visible (identifier 'bh#7245').")
case("PRA-C07", Cv, "Flag ON: a user in several teams sees the union", "Medium",
     "User in T1 and T4.",
     ["Open the list."],
     "Union of both teams' PRs. Note: identifiers come from ALL team types the company uses (Planner, Finance… too), not only Purchase — the opposite of the assignee list.")
case("PRA-C08", Cv, "Flag ON: super admin sees everything", "Medium",
     "A super admin in no team.",
     ["Open the list."],
     "All PRs of the workspace.")
case("PRA-C09", Cv, "Flag ON: changing a team's categories updates its members' access", "Medium",
     "Team T2 (RM-STEEL only).",
     ["Add '0011' to T2's categories.", "As a member, reload the list."],
     "PRs of every sub-category of '0011' now visible. Identifiers are re-written on the team save (user_company_mappings.trade_identifier). If not, the cached identifier was not refreshed — report it.")
case("PRA-C10", Cv, "Flag ON: a PR whose product's category changed later keeps its old identifiers", "Low",
     "A PR created when its product was in category X; the product then moved to Y.",
     ["As a Y-team member, open the list."],
     "Not visible: identifiers are computed when the PR is saved, not when the product changes. Expected limitation — product to decide if a re-sync is needed.")
case("PRA-C11", Cv, "'Restrict PR list to assignee' flag: non-admins see only their own and unassigned lines", "Medium",
     "custom configuration restrict_pr_list_to_assignee = true (false on M3M NOIDA LIMITED; absent on M3M NOIDA).",
     ["As a normal buyer, open the list.", "As a super admin, open the list."],
     "Buyer: only PRs with lines assigned to them or unassigned; the Assignee filter shows just 'Not Yet Assigned'. Super admin and process validators: everything.")

D = "D. Notifications after assignment"
case("PRA-D01", D, "In-app (bell) notification text and link", "High",
     "Buyer B assigns 2 lines of PR 0110000195 to U1 (U1 ≠ B).",
     ["As U1, open the bell."],
     "Title 'PR line items have been assigned to you.' Message '<B> assigned 2 PR line items to you.' There is NO PR number, no line number and no link to the PR: the deep link is the fixed text 'purchase-requisitions'.",
     "This is by code, not a data problem: push_notification.rb builds deeplink_url = \"purchase-requisitions\" and a count-only message.")
case("PRA-D02", D, "Clicking the bell notification opens the PR LIST, not the PR", "High",
     "Notification from PRA-D01.",
     ["Click it."],
     "The dashboard goes to Purchase Requisitions (list). The client already knows how to open a PR from a link of the form purchase-requisitions/<pr uuid>; the backend simply never sends the id.",
     "Fix suggestion for dev: when all assigned lines belong to one PR, send 'purchase-requisitions/<uuid>' and put the PR number(s) in the message.")
case("PRA-D03", D, "Assignment e-mail is sent only when the workspace has the e-mail setting", "High",
     "custom configuration pr_assignee_email set for the workspace (NOT set on M3M NOIDA in UAT → no e-mail there).",
     ["Assign a line; check U1's mailbox."],
     "With the setting: subject 'New PR Assignments', a table with PR No, line no, product, qty, UOM, location, delivery date, and a 'View in Application' button that opens /purchase-requisitions?tab=active (the list, not the PR). Without the setting: no e-mail at all.")
case("PRA-D04", D, "Requisitioner (PR creator) e-mail on assignment", "Medium",
     "custom configuration send_requisitioner_notifications on; the PR has a creator e-mail.",
     ["Assign a line."],
     "The PR creator gets 'pr assigned' mail; the assignee name is shown only if show_pr_assignee is on.")
case("PRA-D05", D, "Re-assignment notifies both users", "Medium",
     "Line assigned U1 → U2.",
     ["Check both bells."],
     "U2: assigned; U1: 'PR Items unassigned. <B> unassigned 1 PR line items from you.' Both links go to the list.")
case("PRA-D06", D, "No in-app notification when the assigner assigns to themself", "Low",
     "", ["Assign to yourself."], "No bell entry; e-mail still sent if the e-mail setting is on.")
case("PRA-D07", D, "Notification is web only (no mobile push)", "Low",
     "", ["Assign; check the mobile app."], "send_notification is called with channels ['web'] only.")
case("PRA-D08", D, "Lines in a non-active status do not notify", "Low",
     "A ticked line whose status is not active.", ["Assign."], "Only active lines are counted in the notification.")
case("PRA-D09", D, "Daily reminder to assignees", "Low",
     "DailyPrAssigneeReminder enabled for the workspace.", ["Wait for the daily run."], "One mail per assignee listing their open lines.")

E = "E. Automatic assignment by category / sub-category (separate feature)"
case("PRA-E01", E, "Auto-assignment is a configuration, not a team rule", "High",
     "custom configuration is_auto_pr_assignment_enabled with rules (absent on M3M NOIDA in UAT → nothing is auto-assigned there).",
     ["Create/sync a PR whose item's materialSubcategoryName matches a rule."],
     "The matching rule's assignee_id is set on the line at PR creation; the assignee gets the same count-only notification. Rules are evaluated in 'order'; first match wins.",
     "If product expects 'PR goes to the user mapped to its category', this is the feature that does it — through rules in the configuration, not through team category mapping.")
case("PRA-E02", E, "No rule matches → line stays unassigned", "Medium", "Same config.", ["Sync a PR of an unlisted sub-category."], "assignee empty; no notification.")
case("PRA-E03", E, "Rule using the desired-vendor e-mail", "Low", "A rule with use_desired_vendor_email.", ["Sync a PR carrying desiredVendorEmail of an active user."], "That user is assigned; unknown e-mail → unassigned.")

F = "F. Permissions and columns"
case("PRA-F01", F, "Only users with the assign permission see the '+' and the person+ button", "Medium",
     "A viewer-role user.", ["Open the list."], "No '+' in the Assignee cell, no person+ button; the Assignee column still shows names.")
case("PRA-F02", F, "Assignee filter in the list", "Medium", "", ["Open Filters → Assignee."], "Options are the users currently assigned on listed lines plus 'Not Yet Assigned'; the current user is suffixed '(Me)'.")
case("PRA-F03", F, "Assigned-to-me view", "Medium", "", ["Filter by Assignee = me."], "Only lines assigned to the current user.")

# ── Excel ───────────────────────────────────────────────────────────────
wb = openpyxl.Workbook()
ws = wb.active; ws.title = "Test cases"
hdr = ["ID", "Area", "Test", "Priority", "Pre-conditions", "Steps", "Expected (what the code does today)", "Note / open question", "Result", "Tester", "Remarks"]
ws.append(hdr)
for c in C:
    ws.append([c["id"], c["area"], c["title"], c["p"], c["pre"], "\n".join(f"{i+1}. {s}" for i, s in enumerate(c["steps"])), c["expected"], c["note"], "", "", ""])
widths = [10, 34, 44, 9, 42, 48, 60, 50, 10, 14, 30]
for i, w in enumerate(widths, 1):
    ws.column_dimensions[get_column_letter(i)].width = w
for cell in ws[1]:
    cell.font = Font(bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor="1F3A5F"); cell.alignment = Alignment(wrap_text=True, vertical="top")
for row in ws.iter_rows(min_row=2):
    for cell in row: cell.alignment = Alignment(wrap_text=True, vertical="top")
ws.freeze_panes = "C2"

ws2 = wb.create_sheet("How it works")
facts = [
 ("Assignee list (the person+ button and the '+' in a row)", "GET /users/search?query=<typed>&filters={\"team_types\":[\"purchase\"]} → active users of the workspace who are members of a team of type Purchase. Max 20 names, sorted by first name. The PR's category is not sent and not checked."),
 ("Assign", "POST /purchase_requests/assign_pr_to_user {item_ids, user_id}. Checks: user has an active mapping in the workspace; every line fully open. Does NOT check team or category. Stamps assignee date, writes audit trail, sends notifications."),
 ("Who can see a PR", "Only when is_pr_teams_filtering_enabled is true for the workspace. A PR carries identifiers: for each line, every category level of the product (parent and sub-category) × the plant of the line's location, plus plant-only and category-only forms. A user carries identifiers from ALL their teams (any team type): plant×category combinations if the team has both, else plant-only or category-only. Visible if any identifier matches. Super admins see all. On UAT: M3M NOIDA (43569) has no such setting → everyone sees everything; M3M NOIDA LIMITED (43577) has it false."),
 ("In-app notification", "Title 'PR line items have been assigned to you.' Message '<assigner> assigned <n> PR line items to you.' Deep link 'purchase-requisitions' → the list. No PR number anywhere. The dashboard would open a PR if the link were 'purchase-requisitions/<pr uuid>'."),
 ("E-mail", "Only if custom configuration pr_assignee_email is set (not set on M3M NOIDA in UAT). Subject 'New PR Assignments'; table with PR No and line; button → /purchase-requisitions?tab=active (list)."),
 ("Automatic assignment by sub-category", "Separate feature: custom configuration is_auto_pr_assignment_enabled with rules (fields such as materialSubcategoryName, first matching rule wins, fixed assignee_id). Not configured on M3M NOIDA in UAT."),
 ("M3M NOIDA (43569) on UAT, 23 Oct", "Teams: 'Purchase' (type Purchase, plant 7245 + sub-category 'anjs' id 83459, 7 members, identifier bh#7245#c_id#83459); 'Technical Team' (type Planner, categories 78522 & 80986, 3 members, one of whom is also in Purchase). PR 0110000195: item in RM-STEEL (child of '0011'); identifiers c_id#77065, c_id#77539, bh#12639, bh#12639#c_id#…; unassigned. No PR-assignment, team-filtering or auto-assignment settings → the assignee list is the 7 Purchase members, every PR is visible to everyone, no e-mail is sent."),
]
ws2.append(["Topic", "What actually happens (from the code)"]);
for t, f in facts: ws2.append([t, f])
ws2.column_dimensions["A"].width = 40; ws2.column_dimensions["B"].width = 120
for cell in ws2[1]: cell.font = Font(bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor="1F3A5F")
for row in ws2.iter_rows(min_row=2):
    for cell in row: cell.alignment = Alignment(wrap_text=True, vertical="top")
wb.save(OUT_XLSX)

# ── HTML ────────────────────────────────────────────────────────────────
def esc(s): return html.escape(str(s))
areas = []
for c in C:
    if c["area"] not in areas: areas.append(c["area"])
rows_html = ""
for a in areas:
    rows_html += f'<tr class="area"><td colspan="6">{esc(a)}</td></tr>'
    for c in [x for x in C if x["area"] == a]:
        steps = "".join(f"<li>{esc(s)}</li>" for s in c["steps"])
        note = f'<p class="note">{esc(c["note"])}</p>' if c["note"] else ""
        rows_html += (f'<tr><td class="id">{esc(c["id"])}</td><td><b>{esc(c["title"])}</b></td>'
                      f'<td><span class="p p-{c["p"].lower()}">{esc(c["p"])}</span></td>'
                      f'<td>{esc(c["pre"])}</td><td><ol>{steps}</ol></td><td>{esc(c["expected"])}{note}</td></tr>')
facts_html = "".join(f"<div class=\"fact\"><h4>{esc(t)}</h4><p>{esc(f)}</p></div>" for t, f in facts)
n = len(C)
page = f"""<title>PR Assignment Test Cases</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* layout: one reading column, wide tables scroll inside their own box */
:root{{--bg:#f7f8f6;--paper:#ffffff;--ink:#1d2320;--muted:#5d6a63;--line:#d9ded9;--accent:#1f3a5f;--accent-ink:#ffffff;--ok:#1d7a4f;--warn:#9a6700;--bad:#b3261e;--soft:#eef2f7;--font:"IBM Plex Sans",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,monospace}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#151917;--paper:#1d2320;--ink:#e7ebe8;--muted:#a3ada7;--line:#343b37;--accent:#8fb4e3;--accent-ink:#0f1a28;--ok:#7fd3a5;--warn:#f3c66b;--bad:#ff9a8f;--soft:#232b33;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#151917;--paper:#1d2320;--ink:#e7ebe8;--muted:#a3ada7;--line:#343b37;--accent:#8fb4e3;--accent-ink:#0f1a28;--ok:#7fd3a5;--warn:#f3c66b;--bad:#ff9a8f;--soft:#232b33;color-scheme:dark}}
body{{background:var(--bg);color:var(--ink);font-family:var(--font);line-height:1.5;padding-block:28px;padding-inline:max(16px,4vw)}}
main{{max-width:1180px;margin:0 auto;display:grid;gap:28px}}
h1{{font-size:1.8rem;margin:0 0 6px;text-wrap:balance}} h2{{font-size:1.25rem;margin:0 0 10px}} h3{{font-size:1.05rem;margin:18px 0 6px}} h4{{margin:0 0 4px;font-size:.95rem}}
.lead{{color:var(--muted);max-width:70ch;margin:0}}
.eyebrow{{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}}
section{{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:20px}}
.answers{{display:grid;gap:14px}}
.answer{{border-left:4px solid var(--accent);padding:4px 14px}} .answer p{{margin:4px 0}}
.facts{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}}
.fact{{background:var(--soft);border-radius:8px;padding:12px 14px}} .fact p{{margin:0;font-size:.92rem}}
.tablewrap{{overflow-x:auto;border:1px solid var(--line);border-radius:8px}}
table{{border-collapse:collapse;width:100%;min-width:1100px;font-size:.88rem}}
th,td{{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}}
th{{background:var(--soft);position:sticky;top:0}}
tr.area td{{background:var(--accent);color:var(--accent-ink);font-weight:600}}
td.id{{font-family:var(--mono);white-space:nowrap}}
ol{{margin:0;padding-left:18px}} .note{{margin:6px 0 0;color:var(--muted);font-size:.84rem}}
.p{{display:inline-block;padding:1px 8px;border-radius:999px;font-size:.78rem;font-weight:600;border:1px solid currentColor}}
.p-high{{color:var(--bad)}} .p-medium{{color:var(--warn)}} .p-low{{color:var(--muted)}}
code{{font-family:var(--mono);font-size:.86em;background:var(--soft);padding:1px 5px;border-radius:4px}}
ul.tight{{margin:6px 0;padding-left:20px}} ul.tight li{{margin:3px 0}}
.ask{{display:grid;gap:8px}} .ask li{{margin:0}}
</style>
<main>
<header>
  <div class="eyebrow">Purchase Requisitions · assign PR lines to users · from the code (backend rfx-uat-main, dashboard main) and M3M NOIDA's data on UAT · 23 Oct 2026</div>
  <h1>PR Assignment Test Cases</h1>
  <p class="lead">What really decides who appears in the assignee list, who can see a PR, and what the assignee receives — with {n} test cases the product team can run or hand to QA.</p>
</header>

<section>
  <h2>The two questions, answered from the code</h2>
  <div class="answers">
    <div class="answer">
      <p><b>1. "Is the user mapped to the category only not visible, or the one mapped only to the sub-category?"</b></p>
      <p>Neither. The assignee list never looks at categories. When you click the person+ button the dashboard asks the backend for <code>users who are members of a team of type Purchase</code> — nothing about the PR's category, nothing about the team's categories. So a user mapped to a parent category and a user mapped only to a sub-category are both offered, as long as the team they sit in is of type <b>Purchase</b>.</p>
      <p>What does hide a user: (a) the team is of another type — M3M NOIDA's "Technical Team" is of type <b>Planner</b>, so its two members who are not also in "Purchase" never appear, whatever categories that team is mapped to; (b) the list shows at most <b>20 names, sorted by first name</b>, until you type — in a big workspace a user with a late first name looks missing; (c) the user is inactive or was removed from the workspace.</p>
      <p>Category and sub-category matter for a different thing: <b>which PRs a user can see</b> — and only when the workspace setting <code>is_pr_teams_filtering_enabled</code> is on. On UAT it is not set for M3M NOIDA (43569) and is <code>false</code> for M3M NOIDA LIMITED (43577), so there everyone sees every PR and the mapping changes nothing. When it is on, a parent-category team sees all its sub-categories (a PR carries one identifier per level), a sub-category team sees just that sub-category, and a team with a plant <i>and</i> a category sees only that plant's PRs of that category (section C).</p>
    </div>
    <div class="answer">
      <p><b>2. "The user gets a notification that a PR was assigned, but no PR number and no redirect to the PR."</b></p>
      <p>That is exactly what the code sends. The bell notification is built as title <i>"PR line items have been assigned to you."</i>, message <i>"&lt;assigner&gt; assigned &lt;n&gt; PR line items to you."</i> and deep link <code>purchase-requisitions</code> — a count, no PR number, and a link to the <b>list</b>. The dashboard follows that link to the Purchase Requisitions list; it already knows how to open a PR when the link is <code>purchase-requisitions/&lt;pr uuid&gt;</code>, but the backend never sends the id. The e-mail (only when the workspace has the <code>pr_assignee_email</code> setting — M3M NOIDA does not) does list PR numbers, but its button also opens the list.</p>
      <p>Suggested fix for the developer: include the PR number(s) in the message, and when all assigned lines belong to one PR send <code>purchase-requisitions/&lt;uuid&gt;</code> as the deep link. One more trap when team filtering is on: a buyer can assign a line to a user whose teams do not cover that PR's category or plant; the assignment is accepted and the notification sent, but that user cannot see the PR at all (PRA-B09).</p>
    </div>
  </div>
</section>

<section>
  <h2>How it actually works</h2>
  <div class="facts">{facts_html}</div>
</section>

<section>
  <h2>Test cases ({n})</h2>
  <p class="lead">"Expected" describes what the code does today. Where that may not be what product wants, the note says so — those are decisions, not bugs, until product says otherwise. The same cases are in the Excel (sheet "Test cases") with Result / Tester / Remarks columns.</p>
  <div class="tablewrap"><table>
    <thead><tr><th>ID</th><th>Test</th><th>Priority</th><th>Pre-conditions</th><th>Steps</th><th>Expected today</th></tr></thead>
    <tbody>{rows_html}</tbody>
  </table></div>
</section>

<section>
  <h2>Questions for product (decisions the tests cannot make)</h2>
  <ol class="ask">
    <li>Should the assignee list be narrowed to users whose Purchase team covers the PR's category / plant — or at least warn when it does not? Today any Purchase-team member can be assigned any PR.</li>
    <li>Should users of other team types (Planner, Finance, Vendor management…) be assignable? Today only Purchase-type teams feed the list, while the API accepts any workspace user.</li>
    <li>Should the notification name the PR and open it? (Small backend change; the dashboard already supports the link.)</li>
    <li>Should assigning be refused when the assignee cannot see the PR (team filtering on)?</li>
    <li>Is a visible "unassign" control wanted? The API supports it; the screen has none.</li>
    <li>If the intent is "PRs go automatically to the person who owns the category", that is the separate rule-based auto-assignment setting, which M3M NOIDA does not have.</li>
  </ol>
</section>

<section>
  <h2>What to set up before running section C</h2>
  <ul class="tight">
    <li>Ops: set <code>is_pr_teams_filtering_enabled = true</code> on the test workspace (it is off on both M3M workspaces in UAT).</li>
    <li>Teams on the workspace: T1 parent-category only; T2 sub-category only; T3 another category; T4 plant + sub-category (M3M's "Purchase" already is one); T5 plant only. One test user per team, QA e-mails only.</li>
    <li>PRs whose lines are fully open, in known categories and plants (0110000195 = RM-STEEL under "0011", plant 12639, is a good one).</li>
    <li>To test e-mails, set <code>pr_assignee_email</code> on the workspace and use QA mailboxes.</li>
  </ul>
</section>
</main>
"""
OUT_HTML.write_text(page)
print(f"{n} cases → {OUT_HTML.name}, {OUT_XLSX.name}")
