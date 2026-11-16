"""House format for every bug sheet (the tester's 'Internal RFX_Bugs' layout, adopted 4 Nov 2026).

    from bug_sheet import write_bug_sheet
    write_bug_sheet(wb, "PR Assignee", bugs, feature="PR assignee filter")

One sheet per client / feature. Columns, dropdowns and fonts copy Internal RFX_Bugs.xlsx exactly.
Each bug is a dict:
  id, status ("OPEN"…), priority ("P0"/"P1"/"P2"), blocker ("YES"/"NO"), dev_type ("BE"/"FE"/"PRODUCT GAP"/"Both"),
  summary (ONE plain line: what is broken, readable at a glance), user_type ("Buyer"/"Vendor"/…), module,
  description (what happens + Expected behavior + why it matters, no steps), steps (list of step strings → own column),
  shots (list of png paths; embedded in ARTEFACTS/ JAM) or artefact (text/link), reported (date), qa, qa_status ("FAIL"/"PASS"),
  qa_comment, feature (optional per row), dev_comment, sprint, resolved, fix_done
"""
import datetime, os
from openpyxl.styles import PatternFill, Font, Alignment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.drawing.image import Image as XLImage
from openpyxl.drawing.spreadsheet_drawing import OneCellAnchor, AnchorMarker
from openpyxl.drawing.xdr import XDRPositiveSize2D
from openpyxl.utils.units import pixels_to_EMU
from PIL import Image

HEADERS = ["Issue ID", "Bug (one line)", "Dev  Status", "Feature", "Priority ", "Blocker", "DEV TYPE ", "Dev Comment", "Sprint Week", "User Type",
           "Module", "Description", "Steps to Reproduce", "ARTEFACTS/ JAM", "Issue Reported Date", "Issue Resolution Date", "QA ", "QA Status (V 1.0)",
           "QA Status (V 2.0)", "QA Comment", "FIX Done"]
WIDTH_BY_HEADER = {"Issue ID": 11, "Bug (one line)": 42, "Dev  Status": 18, "Feature": 18, "Priority ": 10, "Blocker": 10,
    "DEV TYPE ": 13, "Dev Comment": 24, "Sprint Week": 13, "User Type": 12, "Module": 24, "Description": 52,
    "Steps to Reproduce": 46, "ARTEFACTS/ JAM": 44, "Issue Reported Date": 16, "Issue Resolution Date": 16, "QA ": 12,
    "QA Status (V 1.0)": 14, "QA Status (V 2.0)": 14, "QA Comment": 40, "FIX Done": 12}
LISTS_BY_HEADER = {"Dev  Status": "FIXED,OPEN,TO BE TESTED,TO BE DEPLOYED,TO BE PICKED,TO DO,Duplicate Issue,Feature Bug/ Enhancement,NOT A BUG,Already Raised",
    "Priority ": "P0,P1,P2", "Blocker": "YES,NO", "DEV TYPE ": "BE,FE,PRODUCT GAP,Both", "QA Status (V 1.0)": "PASS,FAIL,Hold",
    "QA Status (V 2.0)": "PASS,FAIL", "FIX Done": "In Progress,Done,Hold"}
from openpyxl.utils import get_column_letter as _L
COL = {h: i + 1 for i, h in enumerate(HEADERS)}
SHOT_W = 300  # px a screenshot takes in the ARTEFACTS column

def write_bug_sheet(wb, sheet_name, bugs, feature="", img_dir=None):
    if sheet_name in wb.sheetnames: del wb[sheet_name]
    ws = wb.create_sheet(sheet_name[:31])
    head_fill, head_font = PatternFill("solid", fgColor="4285F4"), Font(name="Arial", size=12, bold=True)
    body_font, body_al = Font(name="Arial", size=11), Alignment(wrap_text=True, vertical="center")
    for i, h in enumerate(HEADERS, 1):
        c = ws.cell(1, i, h); c.fill = head_fill; c.font = head_font; c.alignment = Alignment(wrap_text=True, vertical="center")
    for h, w in WIDTH_BY_HEADER.items(): ws.column_dimensions[_L(COL[h])].width = w
    ws.freeze_panes = "B2"
    img_dir = img_dir or os.path.join(os.path.dirname(os.path.abspath(__file__)), ".bug-sheet-img")
    os.makedirs(img_dir, exist_ok=True)
    for r, b in enumerate(bugs, 2):
        steps = b.get("steps") or []
        steps_txt = "\n".join(f"{n}. {t}" for n, t in enumerate(steps, 1)) if isinstance(steps, list) else steps
        vals = [b.get("id"), b.get("summary"), b.get("status", "OPEN"), b.get("feature", feature), b.get("priority", "P1"), b.get("blocker", "NO"),
                b.get("dev_type", ""), b.get("dev_comment"), b.get("sprint"), b.get("user_type", "Buyer"), b.get("module"),
                b.get("description"), steps_txt, b.get("artefact") if not b.get("shots") else None, b.get("reported", datetime.date.today()),
                b.get("resolved"), b.get("qa", "Animesh"), b.get("qa_status", "FAIL"), b.get("qa_status_v2"), b.get("qa_comment"), b.get("fix_done")]
        for i, v in enumerate(vals, 1):
            c = ws.cell(r, i, v); c.font = body_font; c.alignment = body_al
            if i == COL["Issue Reported Date"] and v: c.number_format = "dd-mm-yyyy"
            if i == COL["Bug (one line)"]: c.font = Font(name="Arial", size=11, bold=True)
        y = 4
        for k, path in enumerate(b.get("shots") or []):
            im = Image.open(path); h = int(im.height * SHOT_W / im.width)
            dst = os.path.join(img_dir, f"{sheet_name[:20]}-{b.get('id')}-{k}.png".replace(" ", "_")); im.resize((SHOT_W, h)).save(dst)
            pic = XLImage(dst)
            pic.anchor = OneCellAnchor(_from=AnchorMarker(col=COL["ARTEFACTS/ JAM"] - 1, colOff=pixels_to_EMU(4), row=r - 1, rowOff=pixels_to_EMU(y)),
                                       ext=XDRPositiveSize2D(pixels_to_EMU(SHOT_W), pixels_to_EMU(h)))
            ws.add_image(pic); y += h + 6
        ws.row_dimensions[r].height = max(90, y * 0.75 + 6)
    last = max(len(bugs) + 1, 2) + 200
    for h, lst in LISTS_BY_HEADER.items():
        col = _L(COL[h]); dv = DataValidation(type="list", formula1=f'"{lst}"', allow_blank=True); dv.add(f"{col}2:{col}{last}"); ws.add_data_validation(dv)
    return ws
