#!/usr/bin/env python3
"""Final hand-off workbook for the Template Studio run: two sheets only —
'Test Cases' (the written sheet's columns + Status + Bug ID + Actual result)
and 'Bug Sheet' (one row per bug, linked test cases, screenshot embedded)."""
import io, contextlib, importlib.util
from pathlib import Path
import openpyxl
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from PIL import Image as PILImage

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("res", HERE / "build-template-studio-results.py")
res = importlib.util.module_from_spec(spec)
with contextlib.redirect_stdout(io.StringIO()):
    spec.loader.exec_module(res)
results, bugs = res.results, res.bug_rows
SHOTS = HERE / "template-studio-results" / "shots"
OUT = HERE / "Template_Studio_Test_Cases_and_Bugs.xlsx"

HDR = PatternFill("solid", fgColor="1F3A5F")
THIN = Side(style="thin", color="C9CFD6")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
FILL = {"Pass": "D9F2E3", "Fail": "F8D7D3", "Not Run": "ECEFF1"}
SEV = {"High": "F8D7D3", "Medium": "FFF1CC", "Low": "E3EEF9"}

def header(ws, cols, widths):
    ws.append(cols)
    for i, w in enumerate(widths, 1): ws.column_dimensions[get_column_letter(i)].width = w
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF"); c.fill = HDR; c.border = BOX
        c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
    ws.row_dimensions[1].height = 30
    ws.freeze_panes = "C2"

def clean_actual(r):
    lines = []
    for part in r["actual"].split("\n"):
        part = part.strip()
        if not part: continue
        part = part.replace("✔", "OK:").replace("✘", "NOT OK:").replace("•", "Note:")
        for tag in ("[UI] ", "[API] "):
            if part.startswith(tag): part = ("Screen: " if tag == "[UI] " else "API: ") + part[len(tag):]
        lines.append(part)
    return "\n".join(lines)

bug_of = {}
for b in bugs:
    for cid in b["cases"]: bug_of.setdefault(cid, []).append(b["id"])

# ── Test Cases ──
wb = openpyxl.Workbook()
ws = wb.active; ws.title = "Test Cases"
header(ws, ["Scenario ID", "Area", "Type", "Test Scenario", "Test Case Description", "Test Data", "Expected Result", "Priority", "Severity",
            "Status", "Bug ID", "Executed on", "Actual Result / Remarks"],
       [11, 24, 18, 36, 40, 34, 56, 8, 9, 10, 10, 12, 70])
for r in results:
    c = r["case"] or {}
    v = r["verdict"]
    if v == "Fail" or bug_of.get(r["id"]): status = "Fail"
    elif v == "Not run": status = "Not Run"
    else: status = "Pass"
    remark = clean_actual(r)
    if v == "Record" and status == "Pass": remark = "Works as built — observation for product to confirm.\n" + remark
    if v == "Not run" and not remark: remark = "Not run in this pass."
    ids = bug_of.get(r["id"], [])
    if status == "Fail" and not ids: ids = ["—"]
    title = r["title"] if c else r["title"]
    ws.append([r["id"], r["area"], c.get("type", "API, Negative"), title, c.get("desc", title), c.get("data", ""), c.get("expected", ""),
               r["p"], r["sev"], status, ", ".join(ids), "Screen + API" if r["layers"] == "API+UI" else ("Screen" if r["layers"] == "UI" else ("API" if r["layers"] == "API" else "—")), remark])
    row = ws.max_row
    for cell in ws[row]: cell.alignment = Alignment(wrap_text=True, vertical="top"); cell.border = BOX
    ws.cell(row, 10).fill = PatternFill("solid", fgColor=FILL[status]); ws.cell(row, 10).font = Font(bold=True)
    ws.cell(row, 10).alignment = Alignment(horizontal="center", vertical="top")
    if ids and ids != ["—"]: ws.cell(row, 11).font = Font(bold=True, color="B3261E")
ws.auto_filter.ref = ws.dimensions

# ── Bug Sheet ──
bs = wb.create_sheet("Bug Sheet")
header(bs, ["Bug ID", "Bug Title", "Severity", "Priority", "Module / Area", "Linked Test Case(s)", "Environment", "Steps to Reproduce", "Expected Result", "Actual Result", "Status", "Reported On", "Screenshot / Evidence"],
       [9, 40, 10, 9, 24, 14, 30, 52, 40, 56, 9, 12, 62])
PRIO = {"High": "P1", "Medium": "P2", "Low": "P3"}
area_of = {r["id"]: r["area"] for r in results}
for b in bugs:
    env = "console.ag-ri.in (Admin Controls → Manage Templates)\nBackend: sec-api.ag-ri.in · build 9.4.377\nCompany: M3M NOIDA"
    steps = b["steps"].replace(". ", ".\n") if "→" in b["steps"] else b["steps"]
    evid = ""
    if not b["shots"]:
        evid = "API evidence:\n" + "\n\n".join(b["evidence"])[:1500]
    bs.append([b["id"], b["title"], b["sev"], PRIO[b["sev"]], area_of.get(b["cases"][0], ""), ", ".join(b["cases"]), env,
               steps, b["expected"], b["actual"], "Open", "29-Oct-2026", evid])
    row = bs.max_row
    for cell in bs[row]: cell.alignment = Alignment(wrap_text=True, vertical="top"); cell.border = BOX
    bs.cell(row, 3).fill = PatternFill("solid", fgColor=SEV[b["sev"]]); bs.cell(row, 3).font = Font(bold=True)
    if b["shots"]:
        src = SHOTS / b["shots"][0]
        im = PILImage.open(src); im.thumbnail((440, 275))
        buf = HERE / "template-studio-results" / f"_thumb_{b['id']}.png"; im.save(buf)
        xl = XLImage(str(buf)); xl.anchor = f"M{row}"
        bs.add_image(xl)
        bs.row_dimensions[row].height = max(215, im.height * 0.78)
        bs.cell(row, 13).value = None
    else:
        bs.row_dimensions[row].height = 160
bs.freeze_panes = "C2"
wb.save(OUT)

tally = {}
for r in results:
    s = "Fail" if (r["verdict"] == "Fail" or bug_of.get(r["id"])) else ("Not Run" if r["verdict"] == "Not run" else "Pass")
    tally[s] = tally.get(s, 0) + 1
print(f"{OUT.name}: {len(results)} test cases {tally}, {len(bugs)} bugs")
