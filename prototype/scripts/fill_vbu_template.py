"""
Fill a workspace's real vendor bulk upload template with test rows, keeping
everything the buyer's own download has: the group headings, colours, the
dropdowns (data validations) and the Data Sheet behind them.

    python3 fill_vbu_template.py <template.xlsx> <jobs.json>

jobs.json: [{"out": "<file.xlsx>", "rows": [{"<column name>": value, ...}, ...]}, ...]
A value is a string, or a number for a cell typed as a number.

The sample row (row 4) is cleared; rows are written from row 4 by column
name (row 3). A column the template lacks is added after the last one, styled
like it. When there are more rows than the template's dropdowns cover, the
dropdown ranges are stretched to the last row.
"""
import copy
import json
import re
import sys

import openpyxl
from openpyxl.utils import get_column_letter


def fill(template_path, out_path, rows):
    wb = openpyxl.load_workbook(template_path)
    ws = wb.worksheets[0]
    headers = {}
    for c in range(1, ws.max_column + 1):
        v = ws.cell(3, c).value
        if v not in (None, ""):
            headers[str(v).strip()] = c
    last_col = max(headers.values())
    # extra columns this set needs
    for row in rows:
        for k in row:
            if k not in headers:
                last_col += 1
                src = ws.cell(3, last_col - 1)
                dst = ws.cell(3, last_col, k)
                dst._style = copy.copy(src._style)
                ws.column_dimensions[get_column_letter(last_col)].width = max(14, len(k) + 4)
                headers[k] = last_col
    # clear the sample row and anything below
    for r in range(4, max(ws.max_row, 4) + 1):
        for c in range(1, last_col + 1):
            ws.cell(r, c).value = None
    for i, row in enumerate(rows):
        r = 4 + i
        for k, v in row.items():
            if v is None or v == "":
                continue
            cell = ws.cell(r, headers[k])
            cell.value = v
            if isinstance(v, str):
                cell.number_format = "@"
    last_row = 3 + len(rows)
    for dv in ws.data_validations.dataValidation:
        ranges = []
        for rng in str(dv.sqref).split():
            m = re.match(r"^([A-Z]+)(\d+):([A-Z]+)(\d+)$", rng)
            if m and int(m.group(4)) < last_row:
                rng = f"{m.group(1)}{m.group(2)}:{m.group(3)}{last_row}"
            ranges.append(rng)
        dv.sqref = openpyxl.worksheet.cell_range.MultiCellRange(" ".join(ranges))
    ws.title = ws.title  # keep the sheet name the backend reads first
    wb.save(out_path)


if __name__ == "__main__":
    template, jobs_file = sys.argv[1], sys.argv[2]
    with open(jobs_file) as f:
        jobs = json.load(f)
    for job in jobs:
        fill(template, job["out"], job["rows"])
    print(f"filled {len(jobs)} sheet(s)")
