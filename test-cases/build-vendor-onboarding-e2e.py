#!/usr/bin/env python3
"""Vendor onboarding end to end with Template-Studio templates (cpanel buyer + quotes vendor portal, PROCOL DEMO).
Reads prototype/data/evidence/vo-e2e/results-*.json (runner) + the probe facts written below, and writes
  test-cases/Vendor_Onboarding_E2E_Test_Cases_and_Bugs.xlsx  (Test Cases + Bug Sheet with screenshots)
  test-cases/vendor-onboarding-e2e/index.html                 (report page, screenshots inline)
"""
import base64, json, html
from pathlib import Path
import openpyxl
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from PIL import Image as PILImage

HERE = Path(__file__).resolve().parent
EV = HERE.parent / "prototype/data/evidence/vo-e2e"
SHOTS = EV / "shots"
OUTX = HERE / "Vendor_Onboarding_E2E_Test_Cases_and_Bugs.xlsx"
OUTD = HERE / "vendor-onboarding-e2e"; OUTD.mkdir(exist_ok=True)
setup = json.loads((EV / "setup.json").read_text())
STAMP = setup["stamp"]

TPL = {
    "T1": "All field types — 2 sections: text (required, helper), long text, number, date, dropdown, multi-select, radio, PDF attachment, email, read-only, hidden",
    "T2": "Validations — PAN (format + PAN check), GSTIN must contain PAN, account number + re-enter (must match, no paste), IFSC format, mobile format",
    "T3": "Conditional logic — Foreign hides GSTIN; MSME shows + requires Udyam; not Indian requires turnover; company name contains 'Pvt' requires CIN; ISO 9001 requires certificate; Country empty hides State",
    "T4": "Prefill and data sources — legal name / email / address from the vendor's Procol profile; currency, country, region lists; Country resets Region; supplier code written back to the vendor record",
    "T5": "Three sections, every field required — text, number, dropdown, date, long text, attachment",
    "T6": "Empty, number and AND rules (limits saved as text) — Foreign AND turnover > 10 lakh shows SWIFT; employees > 100 requires HR policy; GSTIN not empty requires certificate",
    "T7": "Same as T6 with the limits saved as numbers",
}

# expected results per case (id → (scenario detail, test data, expected, priority))
EXP = {
    "B01": ("Buyer: Vendors → Prospects → tick the QA prospect → Start Onboarding → pick the studio template, 1 day window → Start", "Prospect created for this template", "Drawer lists the studio-made template; Start sends the request (200); prospect moves to Onboarding In Progress", "P1"),
    "V01": ("Vendor signs in on quotes.ag-ri.in with the e-mail code → Events → Business Partners → opens the onboarding event → Submission Sheet", "QA prospect e-mail", "Live onboarding event with countdown; Business Partners shows PROCOL DEMO 'Submission Pending'; form opens", "P1"),
    "B02": ("Buyer opens the vendor → Onboarding Details after the vendor submits", "—", "Status Review Pending; every answer the vendor gave is shown section by section", "P1"),
    "T1-V02": ("Compare the form with the template", "T1", "Every field in order, with the right control; hidden field absent; right panel '2 Sections'", "P1"),
    "T1-V03": ("Look at required marks, helper text, read-only field", "T1", "Required fields carry *; helper text under labels; Buyer reference greyed and not editable", "P2"),
    "T1-V04": ("Open dropdown, multi-select and radio", "T1", "Options exactly as in the template", "P2"),
    "T1-V05": ("Submit with required fields missing", "Only Legal name filled", "Submit refused 'Please fill all required fields'; missing fields marked", "P1"),
    "T1-V06": ("Type letters into the number field", "'abc'", "Letters are not accepted", "P2"),
    "T1-V07": ("Upload a Word file into the PDF-only attachment", "brochure.docx", "Refused: only PDF allowed", "P1"),
    "T1-V08": ("Fill every field and submit", "Valid answers", "'Response submitted successfully'", "P1"),
    "T2D-V02": ("Wrong PAN format, Submit", "PAN 'ABC12'", "Refused with 'PAN must look like ABCDE1234F'", "P1"),
    "T2D-V03": ("GSTIN that does not contain the PAN, Submit", "GSTIN 27ZZZZZ9999Z1Z5", "Refused with 'GSTIN must contain the PAN'", "P1"),
    "T2D-V04": ("Re-enter account number different / try to paste", "000123456789 vs 000123456780", "Refused with 'Account numbers do not match'; paste blocked", "P1"),
    "T2D-V05": ("IFSC in a wrong format, Submit", "IFSC 'HDFC123'", "Refused with 'IFSC must look like HDFC0001234'", "P1"),
    "T2D-V06": ("Mobile in a wrong format, Submit", "Mobile '98765'", "Refused with 'Mobile must be 10 digits'", "P1"),
    "T2D-V07": ("Well-formed PAN through the external PAN check", "ABCPE1234F (not a real PAN)", "Check runs; result shown next to the field", "P3"),
    "T2D-V08": ("Everything valid, Submit", "Valid answers", "'Response submitted successfully'; buyer sees green checks", "P1"),
    "T3-V02": ("Open the form fresh", "T3", "Udyam hidden; State hidden while Country is empty; GSTIN required; turnover and CIN optional", "P1"),
    "T3-V03": ("Choose Vendor type Foreign", "Foreign", "GSTIN disappears; Annual turnover gets *", "P1"),
    "T3-V04": ("Foreign → MSME → Indian", "Vendor type changes", "MSME: Udyam shown with *, GSTIN back. Indian: Udyam hidden, GSTIN shown, turnover optional", "P1"),
    "T3-V05": ("Company name containing 'Pvt'", "'QA Steel Pvt Ltd'", "CIN becomes required", "P2"),
    "T3-V06": ("Certifications and Country", "ISO 14001 / ISO 9001; Country 'India'", "ISO 9001 makes certificate required; typing a Country shows State", "P1"),
    "T3-V07": ("Submit with a rule-required field empty; then with a hidden required field", "MSME without Udyam; Foreign without GSTIN", "First refused; second goes through (hidden field not required)", "P1"),
    "T4-V02": ("Open the form", "Vendor profile", "Legal name, email, address prefilled from the vendor's Procol profile", "P1"),
    "T4-V03": ("Open Billing currency, Country, Region", "—", "Each list loads options from its data source", "P2"),
    "T4-V04": ("Pick Country + Region, then change Country", "—", "Region is cleared", "P2"),
    "T4-V05": ("Fill and submit with a supplier code", f"QAVOE-{STAMP}", "Submitted; supplier code saved on the vendor record (written back)", "P1"),
    "T5-V02": ("Open the form", "T5", "'3 Sections': Section A, B, C with all six fields", "P2"),
    "T5-V03": ("Fill only Section A, Submit", "A name, A count", "Refused", "P1"),
    "T5-V04": ("Fill everything except the required document", "—", "Refused", "P1"),
    "T5-V05": ("Upload the document and submit", "registration.pdf", "'Response submitted successfully'", "P1"),
    "V02x": ("AND rule: Foreign AND turnover > 10 lakh shows SWIFT", "Foreign alone; 5 lakh; 25 lakh; back to 9 lakh", "SWIFT only at Foreign + 25 lakh; hidden again at 9 lakh", "P1"),
    "V03x": ("Number rule: employees > 100 requires HR policy", "150, 99, 20", "Only 150 makes HR policy required", "P1"),
    "V04x": ("'Is not empty' rule on GSTIN", "Type a GSTIN", "Certificate becomes required; form keeps working", "P1"),
}

def exp_for(cid):
    t, s = cid.split("-")[1], cid.split("-")[2]
    if s in ("B01", "V01", "B02"): return EXP[s]
    if t in ("T6", "T7") and s in ("V02", "V03", "V04"): return EXP[s + "x"]
    return EXP.get(f"{t}-{s}", ("", "", "", "P2"))

def clean(checks):
    out = []
    for c in checks:
        c = c.replace("✔", "OK:").replace("✘", "NOT OK:").replace("•", "Note:")
        out.append(c.strip())
    return "\n".join(out)

# ── overrides from the step-by-step probes and re-judging (status, extra remark) ──
OVR = {
    "VOE-T1-V02": ("Pass", "Company brochure is an attachment ('Upload' tag) — the first detection read it as unknown; re-checked by hand."),
    "VOE-T1-V05": ("Pass", "Missing required fields get a red '!' next to the label (seen on the screenshot); Submit stays enabled on an untouched form."),
    "VOE-T1-V07": ("Fail", None),
    "VOE-T2D-B01": ("Pass", "Start returned 200; the vendor got the event (V01). Only the in-progress tab search was not automated."),
    "VOE-T3-B01": ("Pass", "Start returned 200; the vendor got the event (V01). Only the in-progress tab search was not automated."),
    "VOE-T3-V02": ("Fail", "Probe on a fresh form: State is shown while Country is empty — the 'is empty' rule never applies."),
    "VOE-T3-V04": ("Fail", "Probe on a fresh form: Foreign hides GSTIN; MSME then shows Udyam* but GSTIN stays hidden; Indian leaves GSTIN hidden, Udyam shown and required, turnover required. Nothing a rule did is undone."),
    "VOE-T3-V05": ("Fail", "Probe: 'QA Steel Pvt Ltd' → CIN optional; exactly 'Pvt' → CIN*; then 'QA Steel' → CIN still *. 'Contains' behaves as 'is exactly' on the vendor form (the Studio preview treats it as contains)."),
    "VOE-T3-V06": ("Fail", "ISO 9001 rule works. Typing a Country crashes the whole form: 'Oops! Something Broke Down…' (TypeError: e is not a function)."),
    "VOE-T3-V07": ("Pass", "Probe: MSME with Udyam empty → 'Please fill all required fields'. Foreign hides GSTIN (required in the template) and clears it; Submit then goes through → 'Response submitted successfully'. Note: Udyam stayed required after switching to Foreign (bug VOB-02)."),
    "VOE-T4-V05": ("Pass", "First run: Submit refused 'Please fill 'Billing currency'' because the automation's click on the 215-item list did not register. Rerun choosing INR, India, Maharashtra by typing: 'Response submitted successfully'; legal name and email still prefilled; no page errors."),
    "VOE-T5-V05": ("Pass", "First run: Submit refused 'Please fill 'B date'' although the field showed 29th Oct 2026 (set with the calendar's Today button; after reopening the field was empty). Rerun picking the 15th from the calendar: draft saved the date and Submit → 'Response submitted successfully'."),
    "VOE-T6-V02": ("Fail", "Fresh-form probes: Foreign alone (turnover empty) → SWIFT shown*; Indian + 25 lakh → SWIFT shown*. The AND rule fires on any one condition."),
    "VOE-T6-V03": ("Fail", "Fresh-form probes with the limit saved as text '100': 50 → required, 99 → required (compared as text)."),
    "VOE-T7-V03": ("Fail", "Fresh-form probes with the limit saved as the number 100: 99 → optional, 50 → optional, 150 → required (correct). Fails only because 150 then 20 stays required (rule never undone, VOB-02)."),
}
BUG_OF = {
    "VOE-T1-V07": ["VOB-06"],
    "VOE-T3-V02": ["VOB-01"], "VOE-T3-V06": ["VOB-01"], "VOE-T6-V04": ["VOB-01"], "VOE-T7-V04": ["VOB-01"],
    "VOE-T3-V04": ["VOB-02"], "VOE-T7-V03": ["VOB-02"], "VOE-T3-V07": ["VOB-02"],
    "VOE-T6-V02": ["VOB-03", "VOB-02"], "VOE-T7-V02": ["VOB-03", "VOB-02"],
    "VOE-T3-V05": ["VOB-04"],
    "VOE-T6-V03": ["VOB-05"],
}

# ── extra cases run by probe scripts / buyer actions (not in the runner files) ──
EXTRA = [
    dict(id="VOE-T3-V08", t="T3", side="Vendor portal", title="Reopen the form after the crash", steps="After the 'Something Broke Down' page, sign in again and open the form", data="—",
         expected="Form opens; nothing typed before the crash is kept", status="Pass", actual="Form reopens normally; Country is empty (the crash happened before the draft saved).", shots=["probe-T3-08.png"]),
    dict(id="VOE-T6-V05", t="T6", side="Vendor portal", title="Fresh form, one rule at a time (limits as text)", steps="Reset draft and reload before each step", data="Foreign; 5 lakh then Foreign; Indian + 25 lakh; employees 99 / 1000 / 150→20 / 50",
         expected="SWIFT only for Foreign + > 10 lakh; HR policy only for > 100", status="Fail",
         actual="Foreign alone → SWIFT*; 5 lakh then Foreign → SWIFT*; Indian + 25 lakh → SWIFT*; 99 → required; 50 → required; 150→20 stays required.", shots=["probe-T6-and-one-side.png", "probe-T6-sticky.png"]),
    dict(id="VOE-T7-V05", t="T7", side="Vendor portal", title="Fresh form, one rule at a time (limits as numbers)", steps="Reset draft and reload before each step", data="Same as T6",
         expected="SWIFT only for Foreign + > 10 lakh; HR policy only for > 100", status="Fail",
         actual="Foreign alone → SWIFT*; Indian + 25 lakh → SWIFT* (AND broken). 99 → optional; 50 → optional; 1000 → required (numbers fine). 150→20 stays required.", shots=["probe-T7-and-one-side.png", "probe-T7-sticky.png"]),
    dict(id="VOE-T4-V06", t="T4", side="Buyer (cpanel)", title="Supplier code is written back to the vendor record", steps="After approval, read the vendor's company record", data=f"QAVOE-{STAMP}",
         expected="companies.misc.supplier_code = the vendor's answer", status="Not Run",
         actual="Not run: the backend writes mapped answers only when the response is accepted (approval). After submit the record has no supplier code, as designed. Approval needs a named PROCOL DEMO approver.", shots=["VOE-T4-V05-filled.png"]),
    dict(id="VOE-BUY-01", t="T2", side="Buyer (cpanel)", title="Send For Approval: buyer form must be filled first", steps="Vendor in Review Pending → Send For Approval → Next with the buyer form empty", data="Buyer form (5 fields)",
         expected="Next refused, naming the missing field", status="Pass", actual="'Please fill 'Billing Currency'' (backend 572); drawer stays on the buyer form.", shots=["buyer-T2D-approve-2-drawer.png"]),
    dict(id="VOE-BUY-02", t="T2", side="Buyer (cpanel)", title="Buyer form filled → category/location → approval workflow → Continue", steps="Fill Billing currency, Vendor code, Group, GL account → Next → Next → approver → Continue", data="INR, QAVOE…T2D, Import, 400100",
         expected="Request sent; vendor 'Approval Pending'; approvals panel shows the request and approver", status="Pass",
         actual="Vendor shows 'Approval Pending'; 'Request to Accept Vendor' by Procol Support, approver Shivdesh Singh, expires in 2 days. Each buyer-form answer saved as it was entered.", shots=["buyer-T2D-approvals-2-approval.png"]),
    dict(id="VOE-BUY-03", t="T2", side="Buyer (cpanel)", title="Validated answers show as checked to the buyer", steps="Open the vendor's Onboarding Details", data="T2 vendor",
         expected="Answers with checks show the result", status="Pass", actual="PAN, GSTIN, Re-enter account, IFSC, Mobile show a green check next to the answer.", shots=["buyer-T2D-approve-5-step2.png"]),
    dict(id="VOE-BUY-04", t="T2", side="Buyer (cpanel)", title="Approver approves → vendor becomes a connected vendor", steps="Approver opens the request and approves", data="—",
         expected="Vendor moves to the Vendors tab; portal shows Connected", status="Not Run",
         actual="Not run: only Shivdesh Singh, Kaish Sharma and Devesh Jaiin can approve on PROCOL DEMO; the test account (Procol Support) is not offered as an approver.", shots=[]),
    dict(id="VOE-BUY-05", t="T3", side="Buyer (cpanel)", title="Reject onboarding", steps="Review Pending vendor → Reject", data="—",
         expected="Rejection recorded, vendor in Rejected", status="Not Run",
         actual="Not run: on PROCOL DEMO rejection also goes through the approval workflow to the same three approvers ('Reject Onboarding' → approver → Continue). Panel opened and checked; not sent.", shots=["buyer-T3-reject-2-panel.png"]),
]

def load_results():
    rows = []
    for t in ["T1", "T2D", "T3", "T4", "T5", "T6", "T7"]:
        f = EV / f"results-{t}.json"
        if not f.exists(): continue
        for r in json.loads(f.read_text())["rows"]:
            rows.append(r)
    return rows

def status_of(r):
    v = r["verdict"]
    if r["id"] in OVR: return OVR[r["id"]][0]
    return {"Pass": "Pass", "Record": "Pass", "Fail": "Fail", "Not run": "Not Run", "Couldn't tell": "Not Run"}[v]

cases = []
for r in load_results():
    t = r["id"].split("-")[1]; tk = "T2" if t.startswith("T2") else t
    scen, data, expected, prio = exp_for(r["id"])
    actual = clean(r["checks"])
    if r["id"] in OVR and OVR[r["id"]][1]: actual = OVR[r["id"]][1] + "\n" + actual
    cases.append(dict(id=r["id"], t=tk, side=r["side"], title=r["title"], steps=scen, data=data, expected=expected, prio=prio,
                      status=status_of(r), bugs=BUG_OF.get(r["id"], []), actual=actual, shots=r["shots"]))
for e in EXTRA:
    cases.append(dict(prio="P1", bugs=BUG_OF.get(e["id"], []), **e))
for c in cases:
    if c["id"] in ("VOE-T6-V05", "VOE-T7-V05"): c["bugs"] = ["VOB-03", "VOB-02"] + (["VOB-05"] if c["id"] == "VOE-T6-V05" else [])

ENV = "cpanel.ag-ri.in (buyer: Vendors → Prospects → Start Onboarding) + quotes.ag-ri.in (vendor portal)\nBackend sec-api.ag-ri.in · company PROCOL DEMO\nTemplates built with the Template Studio payload"
BUGS = [
    dict(id="VOB-01", sev="High", title="An 'is empty' / 'is not empty' rule crashes the vendor's onboarding form",
         steps="1. Template with a rule 'Country IS EMPTY → hide State' (or 'GSTIN IS NOT EMPTY → require certificate').\n2. Start onboarding for a prospect with it.\n3. Vendor opens the form and types anything into Country (or GSTIN).",
         expected="State appears (or the certificate becomes required); the form keeps working. On load, State is hidden while Country is empty.",
         actual="The whole page is replaced by 'Oops! Something Broke Down…' with 'TypeError: e is not a function' in the console. The vendor cannot fill that field at all. On load the rule also never applies: State is shown while Country is empty. The Studio offers and saves both comparisons, and the backend evaluates them; the form's comparison list has no entry for them.",
         cases=["VOE-T3-V02", "VOE-T3-V06", "VOE-T6-V04", "VOE-T7-V04"], shots=["probe-T3-08.png", "VOE-T3-V02.png"]),
    dict(id="VOB-02", sev="High", title="Rules never undo when the vendor changes the answer back",
         steps="1. Template T3: Foreign hides GSTIN; MSME shows and requires Udyam; not Indian requires turnover.\n2. Vendor picks Foreign, then MSME, then Indian.",
         expected="Indian: GSTIN visible again, Udyam hidden, turnover optional (the form returns to the template's default).",
         actual="GSTIN stays hidden, so an Indian vendor can never enter the GSTIN the template requires, and Submit goes through without it. Udyam stays visible and required, turnover stays required. Same for numbers: employees 150 → 20 keeps HR policy required; turnover 25 lakh → 9 lakh keeps SWIFT shown. Only a draft Reset restores the form.",
         cases=["VOE-T3-V04", "VOE-T3-V07", "VOE-T7-V03", "VOE-T6-V02", "VOE-T7-V02"], shots=["probe-T3-04.png", "probe-T7-sticky.png"]),
    dict(id="VOB-03", sev="High", title="An AND rule fires when only one of its conditions is true",
         steps="1. Template rule: Vendor type IS Foreign AND Annual turnover > 10,00,000 → show and require SWIFT code.\n2. Fresh form: choose Foreign with turnover empty. Separately: choose Indian and type 25,00,000.",
         expected="SWIFT stays hidden in both cases; it appears only for Foreign with turnover above 10 lakh.",
         actual="SWIFT code appears with * in both cases. The form checks only the answer just changed, so an AND rule behaves like OR. Vendors are asked for fields that do not apply to them.",
         cases=["VOE-T6-V02", "VOE-T7-V02", "VOE-T6-V05", "VOE-T7-V05"], shots=["probe-T6-and-one-side.png", "VOE-T7-V02-and-true.png"]),
    dict(id="VOB-04", sev="Medium", title="'Contains' on a text answer works as 'is exactly' on the vendor form",
         steps="1. Template rule: Company name CONTAINS 'Pvt' → require CIN.\n2. Vendor types 'QA Steel Pvt Ltd'. Then types exactly 'Pvt'.",
         expected="'QA Steel Pvt Ltd' makes CIN required (the Studio preview does this).",
         actual="'QA Steel Pvt Ltd' leaves CIN optional. Only the exact text 'Pvt' makes CIN required. The Studio preview and the live form disagree.",
         cases=["VOE-T3-V05"], shots=["probe-T3-05.png", "probe-T3-06.png"]),
    dict(id="VOB-05", sev="Medium", title="A number rule compares as text when its limit is saved as text",
         steps="1. Template rule: Number of employees IS GREATER THAN '100' (limit saved as text).\n2. Fresh form: type 50, then 99.",
         expected="50 and 99 are not more than 100, so HR policy stays optional (the backend compares these as numbers).",
         actual="HR policy becomes required for 50 and 99 (text order: '5' > '1'). With the limit saved as the number 100 the same rule works. Which form the Studio saves was not confirmed here, so this matters if any template carries text limits.",
         cases=["VOE-T6-V03", "VOE-T6-V05"], shots=["probe-T6-sticky.png"]),
    dict(id="VOB-06", sev="Medium", title="Attachment limited to PDF accepts a Word file",
         steps="1. Template T1: Company brochure, attachment, allowed type PDF.\n2. Vendor uploads brochure.docx and submits.",
         expected="The .docx is refused with a message that only PDF is allowed.",
         actual="The upload dialog accepts brochure.docx, the field shows it, and the response is submitted with it. The buyer sees 'brochure.d…' in the vendor's answers.",
         cases=["VOE-T1-V07"], shots=["VOE-T1-V07-stopped.png", "VOE-T1-B02.png"]),
]
OBS = [
    "Rule behaviour on the vendor form was checked twice: by the runner, and by probes that reset the draft and reload before every step, so stickiness could not mask a comparison.",
    "The saved draft is restored about 7 seconds after the form appears. Anything typed before that is overwritten. Earlier validation runs (T2, T2B, T2C) were affected and are left out; T2D is the clean run.",
    "The format mask on PAN does not force capitals; lower-case 'abcde1234f' is kept as typed (and then refused by the format check).",
    "The buyer form is copied for each vendor the first time Send For Approval is opened; later changes to the buyer-form template do not reach that vendor.",
    "A date set with the calendar's Today button showed on screen but was not saved once (T5); picking a day saved it. Today worked in T1, so this is noted, not filed.",
    "Mapped answers (entity mappings, e.g. supplier code) are written to the vendor record only when the onboarding is accepted, not on submit.",
    "A required buyer-form dropdown with no options blocks Send For Approval with only 'Please fill …'. This happened with the QA buyer form's payment-terms source, which has no data on PROCOL DEMO; it was switched to the currency list.",
    "Creating a buyer-form template makes it the company's active buyer form: the backend picks the newest one. Creating one in the Studio silently replaces the existing form for every new approval.",
]

# ── Excel ──
HDR = PatternFill("solid", fgColor="1F3A5F"); THIN = Side(style="thin", color="C9CFD6"); BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
FILL = {"Pass": "D9F2E3", "Fail": "F8D7D3", "Not Run": "ECEFF1"}; SEV = {"High": "F8D7D3", "Medium": "FFF1CC", "Low": "E3EEF9"}
def header(ws, cols, widths):
    ws.append(cols)
    for i, w in enumerate(widths, 1): ws.column_dimensions[get_column_letter(i)].width = w
    for c in ws[1]: c.font = Font(bold=True, color="FFFFFF"); c.fill = HDR; c.border = BOX; c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
    ws.row_dimensions[1].height = 30; ws.freeze_panes = "C2"
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Test Cases"
header(ws, ["Scenario ID", "Template", "Side", "Test Scenario", "Steps", "Test Data", "Expected Result", "Priority", "Status", "Bug ID", "Actual Result / Remarks", "Screenshot file(s)"],
       [14, 34, 14, 40, 44, 26, 46, 8, 10, 12, 70, 30])
for c in cases:
    ws.append([c["id"], f'{c["t"]}: {TPL.get(c["t"], "")[:70]}', c["side"], c["title"], c["steps"], c["data"], c["expected"], c["prio"], c["status"], ", ".join(c["bugs"]), c["actual"], "\n".join(c["shots"])])
    row = ws.max_row
    for cell in ws[row]: cell.alignment = Alignment(wrap_text=True, vertical="top"); cell.border = BOX
    ws.cell(row, 9).fill = PatternFill("solid", fgColor=FILL[c["status"]]); ws.cell(row, 9).font = Font(bold=True)
    if c["bugs"]: ws.cell(row, 10).font = Font(bold=True, color="B3261E")
ws.auto_filter.ref = ws.dimensions
bs = wb.create_sheet("Bug Sheet")
header(bs, ["Bug ID", "Bug Title", "Severity", "Priority", "Linked Test Case(s)", "Environment", "Steps to Reproduce", "Expected Result", "Actual Result", "Status", "Reported On", "Screenshot"],
       [9, 40, 10, 9, 18, 34, 52, 40, 60, 9, 12, 62])
PRIO = {"High": "P1", "Medium": "P2", "Low": "P3"}
for b in BUGS:
    bs.append([b["id"], b["title"], b["sev"], PRIO[b["sev"]], ", ".join(b["cases"]), ENV, b["steps"], b["expected"], b["actual"], "Open", "29-Oct-2026", ""])
    row = bs.max_row
    for cell in bs[row]: cell.alignment = Alignment(wrap_text=True, vertical="top"); cell.border = BOX
    bs.cell(row, 3).fill = PatternFill("solid", fgColor=SEV[b["sev"]]); bs.cell(row, 3).font = Font(bold=True)
    im = PILImage.open(SHOTS / b["shots"][0]); im.thumbnail((440, 300))
    th = OUTD / f"_thumb_{b['id']}.png"; im.save(th)
    xl = XLImage(str(th)); xl.anchor = f"L{row}"; bs.add_image(xl)
    bs.row_dimensions[row].height = max(240, im.height * 0.78)
ob = wb.create_sheet("Notes")
header(ob, ["#", "Observation"], [5, 140]); ob.freeze_panes = "A2"
for i, o in enumerate(OBS, 1):
    ob.append([i, o]); [setattr(c, "alignment", Alignment(wrap_text=True, vertical="top")) for c in ob[ob.max_row]]
tm = wb.create_sheet("Templates")
header(tm, ["Key", "Template (created on PROCOL DEMO)", "What it covers", "QA prospect"], [6, 52, 90, 40]); tm.freeze_panes = "A2"
for k in ["T1", "T2", "T3", "T4", "T5", "T6", "T7"]:
    pk = "T2D" if k == "T2" else k
    tm.append([k, setup["templates"][k]["name"], TPL[k], setup["prospects"].get(pk, {}).get("firm", "")])
    [setattr(c, "alignment", Alignment(wrap_text=True, vertical="top")) for c in tm[tm.max_row]]
wb.save(OUTX)

tally = {}
for c in cases: tally[c["status"]] = tally.get(c["status"], 0) + 1
print(f"{OUTX.name}: {len(cases)} cases {tally}, {len(BUGS)} bugs")
json.dump(dict(cases=cases, bugs=BUGS, obs=OBS, tpl=TPL, tally=tally), open(OUTD / "data.json", "w"), indent=1)

# ── report page (screenshots embedded as JPEG data URIs) ──
import io
def data_uri(name, width):
    p = SHOTS / name
    if not p.exists(): return ""
    im = PILImage.open(p).convert("RGB"); im.thumbnail((width, width * 3))
    b = io.BytesIO(); im.save(b, "JPEG", quality=72); return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
E = html.escape
CSS = (HERE / "template-studio-results/index.html").read_text().split("<style>")[1].split("</style>")[0]
CSS = CSS.replace("padding-inline:max(16px,3vw)", "padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))")
CSS += "\n.flow{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:.85rem}.flow span{background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:4px 10px}.flow i{color:var(--muted);font-style:normal}\n.tpl{display:grid;grid-template-columns:44px 1fr;gap:6px 12px;font-size:.88rem}.tpl b{font-family:var(--mono)}\n.s-high{color:var(--fail)} .s-medium{color:var(--rec)}\n.warn{border-left:4px solid var(--rec)}"
vclass = {"Pass": "pass", "Fail": "fail", "Not Run": "not-run"}
parts = [f'<title>Vendor Onboarding E2E Run</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">\n<style>{CSS}</style>\n<main>']
parts.append(f'''<header><div class="eyebrow">cpanel.ag-ri.in (buyer) · quotes.ag-ri.in (vendor portal) · PROCOL DEMO · backend sec-api.ag-ri.in · 29 Oct 2026</div>
<h1>Vendor Onboarding E2E Run</h1>
<p class="lead">Seven onboarding templates built with the Template Studio's own save format, each sent to a fresh QA prospect from cpanel. The prospect filled the form on the vendor portal, and the buyer reviewed it and sent it for approval. Field types, validations, conditional rules, prefill, data sources and multi-section forms were each checked live.</p>
<div class="facts"><div class="fact f-pass"><b>{tally.get("Pass",0)}</b><span>Pass</span></div><div class="fact f-fail"><b>{tally.get("Fail",0)}</b><span>Fail</span></div><div class="fact f-not-run"><b>{tally.get("Not Run",0)}</b><span>Not run</span></div><div class="fact f-record"><b>{len(BUGS)}</b><span>Bugs</span></div></div></header>''')
parts.append('<section><h2>The flow each template went through</h2><div class="flow"><span>Template saved (Studio payload)</span><i>→</i><span>Prospect invited + signed up</span><i>→</i><span>cpanel: Prospects → Start Onboarding</span><i>→</i><span>Vendor: Events → Submission Sheet</span><i>→</i><span>Fill, check, Submit</span><i>→</i><span>cpanel: Review Pending</span><i>→</i><span>Buyer form → Send For Approval</span></div>'
             '<div class="tpl" style="margin-top:14px">' + "".join(f"<b>{k}</b><span>{E(v)}</span>" for k, v in TPL.items()) + "</div></section>")
parts.append('<section><h2>Bugs</h2><div class="bugs">')
for b in BUGS:
    imgs = "".join(f'<img src="{data_uri(s, 900)}" alt="{E(s)}">' for s in b["shots"])
    parts.append(f'''<article class="bug"><header><span class="bid">{b["id"]}</span><b>{E(b["title"])}</b><span class="sev s-{b["sev"].lower()}">{b["sev"]}</span><span class="cases">{", ".join(b["cases"])}</span></header>
<dl><dt>Steps</dt><dd>{E(b["steps"]).replace(chr(10), "<br>")}</dd><dt>Expected</dt><dd>{E(b["expected"])}</dd><dt>Actual</dt><dd>{E(b["actual"])}</dd></dl><div>{imgs}</div></article>''')
parts.append("</div></section>")
parts.append('<section class="warn"><h2>Left on PROCOL DEMO for follow-up</h2><ul class="obs">'
             '<li>The T2D QA vendor was sent for approval to Shivdesh Singh during a dry run of the approval drawer: its last button, Continue, sends the request. The request expires on its own in two days. Requests cannot be withdrawn from the approvals panel.</li>'
             '<li>The QA buyer form (B1) was the company\'s active buyer form from 29 Oct 09:54 until it was removed on 30 Oct; the M3M Gurugram Buyer Form is active again. Vendors sent for approval in that window (T1, T2D, T3 test vendors only) keep B1\'s copy.</li>'
             '<li>Approve and Reject could not be finished. Both go through PROCOL DEMO\'s approval workflow, and only three named users can approve.</li></ul></section>')
parts.append('<section><h2>Notes</h2><ul class="obs">' + "".join(f"<li>{E(o)}</li>" for o in OBS) + "</ul></section>")
for k in TPL:
    cs = [c for c in cases if c["t"] == k]
    if not cs: continue
    t = {s: sum(1 for c in cs if c["status"] == s) for s in ("Pass", "Fail", "Not Run")}
    rows = []
    for c in cs:
        th = "".join(f'<img src="{data_uri(s, 360)}" alt="{E(s)}" loading="lazy">' for s in c["shots"][:2])
        bugs = f'<div class="sub">Bug: <b>{", ".join(c["bugs"])}</b></div>' if c["bugs"] else ""
        rows.append(f'<tr><td class="id">{c["id"]}<div class="lay">{E(c["side"])}</div></td><td><b>{E(c["title"])}</b><div class="sub">{E(c["steps"])}</div><div class="exp"><i>Expected:</i> {E(c["expected"])}</div></td>'
                    f'<td><span class="v v-{vclass[c["status"]]}">{c["status"]}</span>{bugs}</td><td class="act">{E(c["actual"]).replace(chr(10), "<br>")}</td><td class="th">{th}</td></tr>')
    parts.append(f'<details class="mod" {"open" if t["Fail"] else ""}><summary>{k} · {E(TPL[k].split(" — ")[0])}<span class="cnt">{len(cs)} cases · {t["Pass"]} pass · {t["Fail"]} fail · {t["Not Run"]} not run</span></summary>'
                 f'<div class="tw"><table><thead><tr><th>Case</th><th>Scenario and expected</th><th>Status</th><th>What happened</th><th>Screens</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div></details>')
parts.append("</main>")
(OUTD / "index.html").write_text("\n".join(parts))
print("page", round((OUTD / "index.html").stat().st_size / 1e6, 2), "MB")
