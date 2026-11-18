"""In-Principle Approval & Price Recovery: the test-case report as ONE plain sheet, laid out like the tester's own
sheets (Arial 10, blue 4285F4 bold header, thin grey borders, Status dropdown), with the screenshots embedded in the
sheet itself (the tester, 18 Nov 2026: "I want the screenshots to be visible in the sheet, I don't want their file
names").

Sources:
  In_Principle_Approval_Test_Cases.xlsx     the 194 cases (columns copied as written)
  spine sheet runs                          prototype/data/sheet-runs/*.json, sheet "in-principle-approval" (newest per case)
  ipa-review.json                           the tester-checked verdict per case: status, actual, remarks, rfx, shots
                                            (a case reviewed by hand wins over the raw spine verdict)

    python3 -I build-ipa-report.py
"""
import glob
import json
import os
import re

import openpyxl
from openpyxl.drawing.image import Image as XLImage
from openpyxl.drawing.spreadsheet_drawing import AnchorMarker, OneCellAnchor
from openpyxl.drawing.xdr import XDRPositiveSize2D
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils.units import pixels_to_EMU
from openpyxl.worksheet.datavalidation import DataValidation
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CASES = os.path.join(HERE, "In_Principle_Approval_Test_Cases.xlsx")
REVIEW = os.path.join(HERE, "ipa-review.json")
RUNS = os.path.join(HERE, "..", "prototype", "data", "sheet-runs")
OUT = os.path.join(HERE, "In-Principle Approval - Test Case Report.xlsx")
IMG_DIR = os.path.join(HERE, ".ipa-report-img")
SHEET_ID = "in-principle-approval"

CHOICES = ["Pass", "Fail", "Blocked", "Not Run", "Couldn't Tell", "Observation"]
SPINE_STATUS = {"Pass": "Pass", "Fail": "Fail", "Partly checked": "Couldn't Tell", "Couldn't tell": "Couldn't Tell", "Not run": "Not Run"}
SHOT_W = 300  # px per screenshot in the sheet
MAX_SHOTS = 3

COMMON_PRE = ("Logged in to the buyer portal of the test company (Amity University on UAT). An In-Principle Approval "
              "workflow exists (set up in IPA-SET-002): Step 1 = Rohan Mehta (Head of Procurement), Step 2 = Anita Rao (CFO), 1 day per step.")


def module(m):
    m = str(m or "")
    return m.split(". ", 1)[1] if m[:1].isdigit() and ". " in m else m


def latest_runs():
    """Newest spine result per case of this sheet."""
    best = {}
    for f in glob.glob(os.path.join(RUNS, "*.json")):
        try:
            r = json.load(open(f))
        except Exception:
            continue
        if r.get("sheet") != SHEET_ID:
            continue
        for c in r.get("cases", []):
            at = r.get("startedAt", "")
            if c["id"] not in best or best[c["id"]][0] < at:
                best[c["id"]] = (at, c)
    return {k: v[1] for k, v in best.items()}


def prd_note(expected):
    m = re.search(r"(PRD difference:.*)$", expected or "", re.S)
    return m.group(1).strip() if m else ""


def product_q(expected):
    m = re.search(r"(Product question:[^.]*\.?)", expected or "")
    return m.group(1).strip() if m else ""


def embed(ws, row, col, paths, key):
    os.makedirs(IMG_DIR, exist_ok=True)
    y = 4
    for k, p in enumerate([p for p in paths if p and os.path.exists(p)][:MAX_SHOTS]):
        im = Image.open(p).convert("RGB")
        h = int(im.height * SHOT_W / im.width)
        dst = os.path.join(IMG_DIR, f"{key}-{k}.png")
        im.resize((SHOT_W, h)).save(dst)
        pic = XLImage(dst)
        pic.anchor = OneCellAnchor(_from=AnchorMarker(col=col - 1, colOff=pixels_to_EMU(4), row=row - 1, rowOff=pixels_to_EMU(y)),
                                   ext=XDRPositiveSize2D(pixels_to_EMU(SHOT_W), pixels_to_EMU(h)))
        ws.add_image(pic)
        y += h + 6
    return y


def main():
    src = openpyxl.load_workbook(CASES).active
    head = [c.value for c in src[1]]
    rows = [dict(zip(head, r)) for r in src.iter_rows(min_row=2, values_only=True) if r[0]]
    review = json.load(open(REVIEW)) if os.path.exists(REVIEW) else {}
    runs = latest_runs()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "In-Principle Approval"
    cols = [("Test ID", 14), ("Module", 18), ("Scenario", 20), ("Test Case", 34), ("Preconditions", 30), ("Test Steps", 45),
            ("Test Data", 28), ("Expected Result", 42), ("Priority", 10), ("Actual Result", 50), ("Status", 13),
            ("RFX No.", 12), ("Remarks", 36), ("Screenshots", 44)]
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

    for n, d in enumerate(rows, 2):
        cid = d["Test Case ID"]
        rv = review.get(cid, {})
        run = runs.get(cid)
        status = rv.get("status") or (SPINE_STATUS.get(run["status"], "Not Run") if run else "Not Run")
        actual = rv.get("actual") or ("Not run in this round." if not run else "")
        pre = str(d["Pre-conditions"] or "")
        pre = pre.replace(COMMON_PRE, "Logged in as Procol Support on Amity University (UAT). Workflow 'QA_Platform IPA 2-step' exists (Approver A, then Approver B, 1 day each).").strip()
        remarks = [x for x in [rv.get("remarks", ""), prd_note(d["Expected Result"]), product_q(d["Expected Result"])] if x]
        vals = [cid, module(d["Module"]), d["Scenario"], d["Test Case Title"], pre, d["Test Steps"], d["Test Data"],
                d["Expected Result"], d["Priority"], actual, status, rv.get("rfx", ""), "\n".join(dict.fromkeys(remarks))]
        for i, v in enumerate(vals, 1):
            c = ws.cell(row=n, column=i, value=v)
            c.font, c.border = body_font, border
            c.alignment = Alignment(vertical="top", wrap_text=True, horizontal="center" if i in (9, 11, 12) else None)
        shot_cell = ws.cell(row=n, column=14)
        shot_cell.border = border
        shots = rv.get("shots") or ([s["file"] for s in run.get("shots", [])] if run else [])
        y = embed(ws, n, 14, shots, cid)
        ws.row_dimensions[n].height = max(110, y * 0.75 + 6)

    last = len(rows) + 1
    dv = DataValidation(type="list", formula1='"' + ",".join(CHOICES) + '"', allow_blank=True, showDropDown=False)
    dv.error, dv.errorTitle = "Pick a status from the list", "Status"
    ws.add_data_validation(dv)
    dv.add(f"K2:K{last}")
    for word, colour in (("Pass", "B7E1CD"), ("Fail", "F4C7C3"), ("Blocked", "FCE8B2"), ("Not Run", "E0E0E0"),
                         ("Couldn't Tell", "D9D2E9"), ("Observation", "C9DAF8")):
        ws.conditional_formatting.add(f"K2:K{last}", FormulaRule(formula=[f'$K2="{word}"'], fill=PatternFill("solid", fgColor=colour)))
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:N{last}"
    wb.save(OUT)
    counts = {}
    for r in range(2, last + 1):
        counts[ws.cell(r, 11).value] = counts.get(ws.cell(r, 11).value, 0) + 1
    print(f"wrote {OUT}: {len(rows)} cases, {counts}")


if __name__ == "__main__":
    main()
