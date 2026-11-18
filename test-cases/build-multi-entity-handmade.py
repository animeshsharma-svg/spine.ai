"""Multi-entity vendor emails: the test-case report as ONE plain sheet, laid out like the tester's own sheets
(Arial, blue 4285F4 bold header, Status as a dropdown). Reads the cases + statuses from the full report
(build-multi-entity-email-results.py) and writes the Actual Result in short tester words.

    python3 build-multi-entity-handmade.py
"""
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.formatting.rule import FormulaRule
from openpyxl.worksheet.datavalidation import DataValidation

SRC = "Multi_Entity_Email_Test_Case_Report.xlsx"
OUT = "Multi Entity Emails - Test Case Report.xlsx"

STATUS = {"Pass": "Pass", "Fail": "Fail", "Blocked": "Blocked", "Not run": "Not Run", "Couldn't tell": "Couldn't Tell", "Observation": "Observation"}
CHOICES = ["Pass", "Fail", "Blocked", "Not Run", "Couldn't Tell", "Observation"]

TECH, PT = "Gulbrandsen Technologies India Pvt Ltd.", "PT Gulbrandsen Technologies India Pvt Ltd."
PVT, CAT, LLP = "Gulbrandsen Private Limited", "Gulbrandsen Catalyst Pvt Ltd.", "Gulbrandsen Industries LLP"
NOT_THIS_ROUND = "Not tested in this round."
NO_DEV = "Needs dev to change the plant mapping list. Not done in this round."
NO_TEMPLATE = "Gulbrandsen has no custom communication template on UAT, so this mail can't be triggered."
REJECT_HIDDEN = "'Send bid rejection email to vendor' is a hidden setting (only Procol team can turn it on). It is OFF for Gulbrandsen."
EXPIRY_OFF = "Vendor 'about to end' mail goes only when 'Enable event expiry reminder emails to vendors' is ON. It is OFF for Gulbrandsen and we did not change it."
HIDE_ON = "Turned ON 'Hide company name in emails' only for this test and turned it OFF after."
SHT = "No upload screen for the mapping list, dev adds it from backend and there are no checks on it. Can't be tested from UI. Question for product."

ACTUAL = {
    "MEN-SET-001": f"Checked config: mapping is ON for Gulbrandsen on PR field 'plant' with all 7 codes. Names same as PRD (full stops also same).",
    "MEN-SET-002": "PRs available for 1101, 1105 (PR-111), 1106 (PR-112), 1901 (PR-113), 4201, 4301 (PR-114), 4501 and LOC-0001. No PR for 9999, blank plant, ' 1105 ' or one PR with two plants.",
    "MEN-SET-003": "V1 and V2 created through invite + vendor signup (qa_1794583459190_v1 / v2 @example.com). All mails coming in Mailpit.",
    "MEN-SET-004": "Events created from PR lines, RFX-383 to RFX-434 (title starts with 'MEN'). V1 and V2 invited in all of them.",
    "MEN-MAP-001": f"PR 122010370, plant 1101. Invitation and RFQ live mail show '{TECH}' in subject and body.",
    "MEN-MAP-002": f"PR-111, plant 1105. Invitation and RFQ live mail show '{TECH}'.",
    "MEN-MAP-003": f"PR-112, plant 1106. Invitation and RFQ live mail show '{TECH}'.",
    "MEN-MAP-004": f"PR-113, plant 1901. Invitation and RFQ live mail show '{PT}'.",
    "MEN-MAP-005": f"PR 422022646, plant 4201. Invitation and RFQ live mail show '{PVT}'.",
    "MEN-MAP-006": f"PR-114, plant 4301. Invitation and RFQ live mail show '{CAT}'.",
    "MEN-MAP-007": f"PR 452000959, plant 4501. Invitation and RFQ live mail show '{LLP}'.",
    "MEN-MAP-008": "No PR with 9999 so used plant LOC-0001 (also not in the list). Mails show plain 'Gulbrandsen'.",
    "MEN-MAP-009": "No PR with blank plant on UAT. Dev has to push one.",
    "MEN-MAP-010": "Created RFQ manually (no PR). Mails show plain 'Gulbrandsen'.",
    "MEN-MAP-011": "No PR with plant like '01101' or '1101A' on UAT. Dev has to push one.",
    "MEN-MAP-012": NO_DEV, "MEN-MAP-015": NO_DEV, "MEN-MAP-016": NO_DEV, "MEN-MAP-017": NO_DEV, "MEN-MAP-018": NO_DEV,
    "MEN-MAP-013": "No PR with plant ' 1105 ' (with spaces) on UAT. Dev has to push one.",
    "MEN-MAP-014": f"1101 (RFX-383), 1105 (RFX-403) and 1106 (RFX-404) all show the same name '{TECH}'.",
    "MEN-PRF-001": f"No 4201 PR left, so line 1 from PR-114 (4301) and line 2 from PR 452000959 (4501). Mails show only '{CAT}' (line 1). Line 2 entity is not shown anywhere.",
    "MEN-PRF-002": "No PR on UAT with two different plants in its lines. Dev has to push one.",
    "MEN-PRF-003": f"Did not reorder the lines on draft screen. RFX-417 (line 1 = 4501, line 2 = 4301) shows '{LLP}', so line 1 decides the name.",
    "MEN-PRF-004": NOT_THIS_ROUND,
    "MEN-PRF-005": "1105 PR was used up, so line 1 added manually and line 2 from a 4201 PR. Mails show plain 'Gulbrandsen' (as PRD says for manual first line).",
    "MEN-PRF-006": NOT_THIS_ROUND, "MEN-PRF-007": NOT_THIS_ROUND, "MEN-PRF-009": NOT_THIS_ROUND,
    "MEN-PRF-008": f"Two stage project (Technical + RFQ) from PR 422022646 (4201). Stage mails show '{PVT}'.",
    "MEN-PRF-010": f"Biggest PR on UAT has 20 lines (PR 452000944, plant 4501), used that. Mails show '{LLP}', no extra delay compared to a 1 line RFQ.",
    "MEN-PRF-011": "Invitation sent on publish itself had the entity name (RFX-383, 384, 385). Plain 'Gulbrandsen' never came first.",
    "MEN-EML-001": f"'RFX-403 | Project Invitation from {TECH}' received. Name correct in subject and body.",
    "MEN-EML-002": f"RFQ is now live: top title and the line '{PVT} has initiated a purchase request' both correct.",
    "MEN-EML-003": f"'Auction is now live' and project invitation show '{CAT}'. But the '<entity> - Auction Invitation' mail never came, so this mail could not be checked.",
    "MEN-EML-004": NOT_THIS_ROUND,
    "MEN-EML-005": f"Reminder before start goes only for RFQ then auction events, so checked the 'RFX-425 | Auction is Scheduled' mail. Shows '{CAT}'.",
    "MEN-EML-006": EXPIRY_OFF,
    "MEN-EML-007": "Rescheduled the auction (RFX-425) and saved, no reschedule mail came to V1. Backend has a reschedule mail only for RFI. Need to check with product which mail should go.",
    "MEN-EML-008": "Extended submission time on live RFQ (RFX-422, 05:22 to 05:52 pm), no mail came to V1. Backend sends extension mail only for BOQ events. Need to check with product.",
    "MEN-EML-009": NOT_THIS_ROUND, "MEN-EML-010": NOT_THIS_ROUND,
    "MEN-EML-011": f"Amended live RFQ with a remark (RFX-421.1). 'Event Revised' mail shows '{PVT}'.",
    "MEN-EML-012": f"Withdrew project with remark (RFX-393). 'Project Withdrawn by {PVT}' and 'RFQ has been withdrawn' both correct.",
    "MEN-EML-013": f"Withdrew RFQ (RFX-410, plant 1901). 'RFQ has been withdrawn' shows '{PT}'.",
    "MEN-EML-014": NOT_THIS_ROUND,
    "MEN-EML-015": f"Awarded V1 on RFX-418 (PR-111, 1105), both approval steps approved. 'Congratulations! Your bid is selected.' received, top title and '{TECH} has selected your bid' correct. Mail came ~5.5 hrs late in Mailpit.",
    "MEN-EML-016": REJECT_HIDDEN,
    "MEN-EML-017": f"Sent counter offer (RFX-408, 1106). Subject 'Action Required: Counter Offer Sent by {TECH}'. Body has only the buyer user name.",
    "MEN-EML-018": f"Submitted bid on behalf of V1 (RFX-409, 4301). Subject 'Bid submitted on your behalf by {CAT}'.",
    "MEN-EML-019": f"Send Reminder to not submitted vendors (RFX-419, 1105). '[RFX-419] [Reminder] Submit Your Offer Before the Deadline.' shows '{TECH}'.",
    "MEN-EML-020": NOT_THIS_ROUND, "MEN-EML-021": NOT_THIS_ROUND,
    "MEN-EML-022": f"Reminder for pending counter offer (RFX-420, 1106). Subject 'Counter Offer Sent by {TECH}.' correct.",
    "MEN-EML-023": NO_TEMPLATE,
    "MEN-NOM-001": "Manual RFQ RFX-387. 'Project Invitation from Gulbrandsen', plain name.",
    "MEN-NOM-002": "Manual RFQ RFX-387. RFQ is now live shows plain 'Gulbrandsen' in title and line.",
    "MEN-NOM-003": "Manual auction RFX-397. 'Auction is now live' and invitation show plain 'Gulbrandsen'. '- Auction Invitation' mail never came (same as MEN-EML-003).",
    "MEN-NOM-004": NOT_THIS_ROUND,
    "MEN-NOM-005": "Manual auction scheduled 30 min later (RFX-431). 'Auction is Scheduled' shows plain 'Gulbrandsen'.",
    "MEN-NOM-006": EXPIRY_OFF,
    "MEN-NOM-007": "Rescheduled manual auction RFX-431 and saved, no reschedule mail came (same as MEN-EML-007).",
    "MEN-NOM-008": "Extended submission time on RFX-429, no vendor mail. Only BOQ events send it (same as MEN-EML-008).",
    "MEN-NOM-009": NOT_THIS_ROUND, "MEN-NOM-010": NOT_THIS_ROUND,
    "MEN-NOM-011": "Amended manual RFQ (RFX-428.1). 'Event Revised' shows plain 'Gulbrandsen'.",
    "MEN-NOM-012": "Withdrew manual RFQ RFX-396. 'Project Withdrawn by Gulbrandsen' received.",
    "MEN-NOM-013": "RFX-396 'RFQ has been withdrawn' says 'Gulbrandsen has withdrawn the RFQ.'",
    "MEN-NOM-014": NOT_THIS_ROUND, "MEN-NOM-015": NOT_THIS_ROUND,
    "MEN-NOM-016": REJECT_HIDDEN,
    "MEN-NOM-017": "Manual RFQ RFX-394. 'Action Required: Counter Offer Sent by Gulbrandsen' received.",
    "MEN-NOM-018": "Manual RFQ RFX-395. 'Bid submitted on your behalf by Gulbrandsen' received.",
    "MEN-NOM-019": "Manual RFQ RFX-426, Send Reminder. Reminder mail shows plain 'Gulbrandsen'.",
    "MEN-NOM-020": NOT_THIS_ROUND, "MEN-NOM-021": NOT_THIS_ROUND,
    "MEN-NOM-022": "Manual RFQ RFX-427, counter offer reminder. Subject 'Counter Offer Sent by Gulbrandsen.'",
    "MEN-NOM-023": NO_TEMPLATE,
    "MEN-HID-001": f"{HIDE_ON} RFX-398 (4201): subject 'RFX-398 | Project Invitation', no company or entity name anywhere.",
    "MEN-HID-002": f"{HIDE_ON} RFX-398 RFQ is now live: line says 'a purchase request has been initiated.' with no name. Top title still shows '{PVT}' (expected).",
    "MEN-HID-003": f"{HIDE_ON} RFX-402: 'Auction is now live' top title still has the entity, invitation has no name. '- Auction Invitation' mail never came.",
    "MEN-HID-004": NOT_THIS_ROUND,
    "MEN-HID-005": "Not done. Scheduled auction mail comes ~30 min late on UAT, keeping hide ON that long would hide the name in other people's mails too.",
    "MEN-HID-006": EXPIRY_OFF,
    "MEN-HID-007": "No reschedule mail comes even with hide OFF (see MEN-EML-007).",
    "MEN-HID-008": "No vendor mail on extension for non BOQ events (see MEN-EML-008).",
    "MEN-HID-009": NOT_THIS_ROUND, "MEN-HID-010": NOT_THIS_ROUND,
    "MEN-HID-011": f"{HIDE_ON} RFX-434.1 'Event Revised' still shows '{LLP}', as expected (this mail never hides the name).",
    "MEN-HID-012": f"{HIDE_ON} No 4201 PR left so used 4501. RFX-401 'Project Withdrawn', no name in subject or body.",
    "MEN-HID-013": f"{HIDE_ON} RFX-401 'RFQ has been withdrawn', no company or entity name.",
    "MEN-HID-014": NOT_THIS_ROUND, "MEN-HID-015": NOT_THIS_ROUND,
    "MEN-HID-016": REJECT_HIDDEN,
    "MEN-HID-017": f"{HIDE_ON} RFX-399 (1101): subject 'Counter Offer Sent by the buyer', no name.",
    "MEN-HID-018": f"{HIDE_ON} RFX-400 (4201): subject 'Bid submitted on your behalf', no name.",
    "MEN-HID-019": f"{HIDE_ON} RFX-432 reminder still shows '{LLP}', as expected (reminders never hide the name).",
    "MEN-HID-020": NOT_THIS_ROUND, "MEN-HID-021": NOT_THIS_ROUND,
    "MEN-HID-022": f"{HIDE_ON} RFX-433 counter offer reminder: subject 'Counter Offer Sent by {LLP}.', as expected.",
    "MEN-HID-023": NO_TEMPLATE,
    "MEN-CON-001": "Checked all 108 mails of this round, none has two different names. Every mail has the right name for its plant (or no name when hide is ON).",
    "MEN-CON-002": f"RFX-393 (4201): invitation, RFQ live, RFQ withdrawn and Project withdrawn all show '{PVT}'. Award mail on 1105 also correct (MEN-EML-015).",
    "MEN-CON-003": "V1 got RFX-383 (1101), 384 (4201), 385 (4501), 386 (unmapped) and 387 (manual) within few minutes. Each mail has its own event's name, nothing mixed.",
    "MEN-CON-004": f"After withdrawing RFX-393, both withdraw mails still show '{PVT}'.",
    "MEN-CON-005": "Buyer is in CC on the same vendor mail, so buyer copy has the same name.",
    "MEN-OOS-001": "Buyer side mails (Project Withdrawn by Procol Support, Approval Status, PO Generation Failed) same as before, no entity name in them.",
    "MEN-OOS-002": NOT_THIS_ROUND, "MEN-OOS-003": NOT_THIS_ROUND,
    "MEN-OOS-004": "PO 5755543 for RFX-418 generated at 6:12 AM IST on 17 Nov (buyer got 'PO Generation Failed' 2 min before that). Procol did not send any PO mail to the vendor and there is no PO PDF on the order, so nothing to compare.",
    "MEN-OOS-005": "Sender is the same plain address for every mail (smtpt565@gmail.com on UAT), no display name. Not changed.",
    "MEN-OOS-006": NOT_THIS_ROUND, "MEN-OOS-007": NOT_THIS_ROUND, "MEN-OOS-008": NOT_THIS_ROUND,
    "MEN-OOS-009": NO_TEMPLATE,
    **{f"MEN-SHT-00{i}": SHT for i in range(1, 8)},
}
STATUS_OVERRIDE = {"MEN-OOS-004": "Couldn't Tell"}
REMARKS = {
    "MEN-PRF-001": "Product to confirm: vendor quoting the line 2 item is told the line 1 entity.",
    "MEN-EML-003": "'<entity> - Auction Invitation' mail does not go on UAT at all.",
    "MEN-EML-005": "Reminder before start not checked, needs RFQ then auction event.",
    "MEN-EML-015": "Subject has no RFX no. and body shows 'RFQ-305', vendor can't tell which award it is.",
    "MEN-EML-017": "Body says 'Procol Support has sent a counter offer!' (user name). Should it be the entity?",
    "MEN-HID-011": "Product question: should entity show when client asked to hide the name?",
    "MEN-HID-019": "Product question: should entity show when client asked to hide the name?",
    "MEN-HID-022": "Product question: should entity show when client asked to hide the name?",
    "MEN-OOS-004": "PO goes from ERP side. Award mail went to V1 even though PO first failed.",
}
COMMON_PRE = "Logged in to the buyer portal of the test company on UAT (company name in Procol = 'Gulbrandsen'). QA vendors V1 and V2 are on the event; their emails land in Mailpit (MEN-SET-003)."


def module(m):
    m = str(m or "")
    return m.split(". ", 1)[1] if m[:1].isdigit() and ". " in m else m


def main():
    src = openpyxl.load_workbook(SRC)["Test Cases"]
    h = [c.value for c in src[1]]
    rows = [dict(zip(h, r)) for r in src.iter_rows(min_row=2, values_only=True) if r[0]]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Multi Entity Emails"
    cols = [("Test ID", 14), ("Module", 18), ("Scenario", 20), ("Test Case", 34), ("Preconditions", 30), ("Test Steps", 45),
            ("Test Data", 28), ("Expected Result", 42), ("Priority", 10), ("Actual Result", 50), ("Status", 13),
            ("RFX No.", 12), ("Remarks", 32)]
    head_font, body_font = Font(name="Arial", bold=True, size=10), Font(name="Arial", size=10)
    fill = PatternFill("solid", fgColor="4285F4")
    thin = Side(style="thin", color="BFBFBF")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    for i, (name, w) in enumerate(cols, 1):
        c = ws.cell(row=1, column=i, value=name)
        c.font, c.fill, c.border = head_font, fill, border
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.column_dimensions[c.column_letter].width = w
    ws.row_dimensions[1].height = 22

    missing = []
    for n, d in enumerate(rows, 2):
        cid = d["Test Case ID"]
        if cid not in ACTUAL:
            missing.append(cid)
        pre = d["Pre-conditions"] or ""
        pre = "Logged in as Gulbrandsen buyer on UAT. V1 and V2 added to the event." if pre.strip() == COMMON_PRE else pre
        cfg = str(d.get("Configs Needed") or "")
        if cfg.endswith("'Hide company name in emails' = ON"):
            pre += "\n'Hide company name in emails' = ON."
        rfx = str(d.get("RFX no.") or "")
        if rfx.count(",") > 4:
            rfx = "RFX-383 to RFX-434"
        vals = [cid, module(d["Module"]), d["Scenario"], d["Test Case Title"], pre, d["Test Steps"], d["Test Data"],
                d["Expected Result"], d["Priority"], ACTUAL.get(cid, d["Actual Result"]),
                STATUS_OVERRIDE.get(cid, STATUS[d["Status"]]), rfx, REMARKS.get(cid, "")]
        for i, v in enumerate(vals, 1):
            c = ws.cell(row=n, column=i, value=v)
            c.font, c.border = body_font, border
            c.alignment = Alignment(vertical="top", wrap_text=True, horizontal="center" if i in (9, 11) else None)

    last = len(rows) + 1
    dv = DataValidation(type="list", formula1='"' + ",".join(CHOICES) + '"', allow_blank=True, showDropDown=False)
    dv.error, dv.errorTitle = "Pick a status from the list", "Status"
    ws.add_data_validation(dv)
    dv.add(f"K2:K{last}")
    for word, colour in (("Pass", "B7E1CD"), ("Fail", "F4C7C3"), ("Blocked", "FCE8B2"), ("Not Run", "E0E0E0"),
                         ("Couldn't Tell", "D9D2E9"), ("Observation", "C9DAF8")):
        ws.conditional_formatting.add(f"K2:K{last}", FormulaRule(formula=[f'$K2="{word}"'],
                                                                 fill=PatternFill("solid", fgColor=colour)))
    ws.freeze_panes = "B2"
    ws.auto_filter.ref = f"A1:M{last}"
    wb.save(OUT)

    tally = {}
    for r in ws.iter_rows(min_row=2, min_col=11, max_col=11, values_only=True):
        tally[r[0]] = tally.get(r[0], 0) + 1
    print(OUT, len(rows), "cases", tally, "missing actual:", missing)


if __name__ == "__main__":
    main()
