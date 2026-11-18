"""The one-file report of a homepage run: Test Cases (the sheet with Status, Actual Result, Screenshots filled),
Bugs (house format, via bug_sheet.write_bug_sheet), Summary, and — when the cases came from a PRD — the PRD checks.

    python3 -P test-cases/sheet_run_report.py <payload.json> <out.xlsx>

The payload is written by prototype/src/checks/homeJobs.ts (homeReport):
  {feature, environment, cases: [{row: {column: value}, status, actual, shots: [path], prd_note}],
   bugs: [bug dicts as bug_sheet expects], summary: [[label, value]], questions: [str], prd_checks: [[id, title, note]]}
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bug_sheet import write_bug_sheet  # noqa: E402
from openpyxl import Workbook  # noqa: E402
from openpyxl.styles import Alignment, Font, PatternFill  # noqa: E402
from openpyxl.utils import get_column_letter  # noqa: E402

HEAD_FILL, HEAD_FONT = PatternFill("solid", fgColor="4285F4"), Font(name="Arial", size=12, bold=True)
BODY_FONT, WRAP = Font(name="Arial", size=11), Alignment(wrap_text=True, vertical="top")
STATUS_FILL = {"Pass": "D9EAD3", "Fail": "F4CCCC", "Blocked": "FFF2CC", "Not Run": "EFEFEF", "Observation": "CFE2F3", "Couldn't tell": "EAD1DC", "Partly checked": "FFF2CC"}
WIDE = {"Test Case Title": 40, "Pre-conditions": 34, "Test Steps": 50, "Expected Result": 46, "Actual Result": 56, "PRD Reference": 40, "Screenshots": 30, "Configs Needed": 26}


def table(ws, headers, rows, widths=None):
    for i, h in enumerate(headers, 1):
        c = ws.cell(1, i, h)
        c.fill, c.font, c.alignment = HEAD_FILL, HEAD_FONT, Alignment(wrap_text=True, vertical="center")
        ws.column_dimensions[get_column_letter(i)].width = (widths or {}).get(h, 16)
    for r, row in enumerate(rows, 2):
        for i, v in enumerate(row, 1):
            c = ws.cell(r, i, v)
            c.font, c.alignment = BODY_FONT, WRAP
    ws.freeze_panes = "B2"


def main(src, out):
    p = json.load(open(src))
    wb = Workbook()
    ws = wb.active
    ws.title = "Test Cases"
    cols = list(p["cases"][0]["row"].keys()) if p["cases"] else ["Test Case ID", "Test Case Title"]
    headers = cols + ["Actual Result", "Screenshots"]
    rows = []
    for c in p["cases"]:
        row = dict(c["row"])
        row["Status"] = c["status"]
        actual = c.get("actual") or ""
        if c.get("prd_note"):
            actual += f"\nCase vs PRD: {c['prd_note']}"
        rows.append([row.get(h, "") for h in cols] + [actual.strip(), "\n".join(os.path.basename(s) for s in c.get("shots") or [])])
    table(ws, headers, rows, WIDE)
    si = headers.index("Status") + 1 if "Status" in headers else None
    if si:
        for r in range(2, len(rows) + 2):
            v = ws.cell(r, si).value
            if v in STATUS_FILL:
                ws.cell(r, si).fill = PatternFill("solid", fgColor=STATUS_FILL[v])

    img_dir = os.path.join(os.path.dirname(os.path.abspath(out)), ".img")
    write_bug_sheet(wb, "Bugs", p["bugs"], feature=p.get("feature", ""), img_dir=img_dir)

    s = wb.create_sheet("Summary")
    table(s, ["What", "Value"], p.get("summary") or [], {"What": 34, "Value": 90})
    if p.get("prd_checks"):
        table(wb.create_sheet("Case vs PRD"), ["Test Case ID", "Title", "How the case differs from the PRD (judged by the PRD)"], p["prd_checks"], {"Title": 40, "How the case differs from the PRD (judged by the PRD)": 90})
    if p.get("questions"):
        table(wb.create_sheet("Questions for the PM"), ["#", "Question"], [[i + 1, q] for i, q in enumerate(p["questions"])], {"#": 6, "Question": 100})
    wb.save(out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
