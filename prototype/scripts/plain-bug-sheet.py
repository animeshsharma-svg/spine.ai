"""The house bug sheet from plain-words rows (scripts/plain-bug-sheet.ts output).

    python3 scripts/plain-bug-sheet.py data/night/bugs-2026-11-13-plain.json /path/to/out.xlsx "API events" "Auction create"

Layout = the tester's Internal RFX_Bugs (test-cases/bug_sheet.py); content = the team's plain voice:
Bug (one line) = the bug; Description = what goes wrong + what should happen + what actually happens;
Steps to Reproduce = how to see it; QA Comment = how it was verified (the technical facts, for the engineer).
"""
import json, sys, datetime
sys.path.insert(0, "/Users/animesh/Desktop/procol/test-cases")
from openpyxl import Workbook
from bug_sheet import write_bug_sheet

src, out, api_name, ui_name = sys.argv[1:5]
d = json.load(open(src))
def rows(xs):
    for r in xs:
        r = dict(r); r.pop("technical", None)
        if r.get("reported"): r["reported"] = datetime.date.fromisoformat(str(r["reported"])[:10])
        yield r
wb = Workbook(); del wb["Sheet"]
write_bug_sheet(wb, api_name, list(rows(d["api"])), feature="Events (queries, reminders, lifecycle, bidding)")
write_bug_sheet(wb, ui_name, list(rows(d["ui"])), feature="Auction create / draft")
wb.save(out); print("wrote", out, len(d["api"]), "+", len(d["ui"]), "rows")
