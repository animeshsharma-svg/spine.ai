#!/usr/bin/env python3
"""The house-format bug sheet for a platform sheet run (prototype/data/sheet-runs/<run>.json).

    python3 rca_bug_sheet.py <run-id> [<run-id> …] [--out RCA_Real_Bugs_Run_Report.xlsx]

Reads the run(s) the platform kept, takes every case that ended as Fail with a bug, and writes
one workbook with two sheets:
  Test Cases  the 14 house columns + Reference, Status filled, Actual Result and Screenshots after it;
  Bugs        the team's bug layout (bug_sheet.write_bug_sheet): one row per bug, screenshots embedded,
              QA = Animesh, QA Status (V 1.0) = FAIL, QA Comment = environment, date, record ids, case ids.
A case that ended "Couldn't tell" or "Not run" is in Test Cases with its reason and never in Bugs.
"""
import datetime
import json
import os
import sys
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bug_sheet import write_bug_sheet  # noqa: E402

HERE = Path(__file__).resolve().parent
RUNS = HERE.parent / "prototype" / "data" / "sheet-runs"
EVIDENCE_DIRS = [HERE.parent / "procol-ui-tests" / "evidence", HERE.parent / "prototype" / "data" / "evidence"]
COLS = ["Test Case ID", "Module", "Scenario", "Test Case Title", "User Role", "Portal", "Pre-conditions", "Configs Needed", "Test Data",
        "Test Steps", "Expected Result", "Priority", "Test Type", "Reference", "Status", "Actual Result", "Screenshots"]
PRI = {"Critical": "P0", "High": "P1", "Medium": "P2", "Low": "P2"}


def shot_path(file):
    if not file:
        return None
    p = Path(file)
    if p.is_absolute() and p.exists():
        return str(p)
    for d in EVIDENCE_DIRS:
        for cand in (d / file, *d.glob(f"**/{Path(file).name}")):
            if Path(cand).exists():
                return str(cand)
    return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--") and not a.endswith(".json")]
    out = HERE / "RCA_Real_Bugs_Run_Report.xlsx"
    if "--out" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--out") + 1])
    runs = []
    for rid in args:
        f = RUNS / f"{rid}.json"
        if not f.exists():
            print(f"no such run: {f}")
            continue
        runs.append(json.load(open(f)))
    if not runs:
        print("give at least one run id (prototype/data/sheet-runs/<id>.json)")
        sys.exit(1)
    # the latest verdict per case wins (a re-run replaces the earlier one); a case broken by the network is never "latest"
    latest = {}
    for r in sorted(runs, key=lambda r: r["startedAt"]):
        for c in r["cases"]:
            if "ENETUNREACH" in c["why"] or "ETIMEDOUT" in c["why"]:
                continue
            if c["status"] != "Not run" or c["id"] not in latest:
                latest[c["id"]] = (r, c)
    # a QA review of a run's own evidence (review.json: {case id: {status, note}}) — written into Actual Result, never silent
    review = {}
    if "--review" in sys.argv:
        review = json.load(open(sys.argv[sys.argv.index("--review") + 1]))
    for cid, rv in review.items():
        if cid in latest:
            r, c = latest[cid]
            c = dict(c)
            c["why"] = f"{rv['note']} [Reviewed by QA from the run's evidence; the automated verdict was {c['status']}: {c['why'][:300]}]"
            c["status"] = rv["status"]
            if rv["status"] != "Fail":
                c.pop("bug", None)
            latest[cid] = (r, c)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Test Cases"
    ws.append(COLS)
    bugs = []
    n = 0
    for cid, (r, c) in latest.items():
        case = c["case"]
        shots = [s.get("file", "") for s in c.get("shots", [])]
        ws.append([case["id"], case["module"], case["scenario"], case["title"], case["role"], case["portal"], case["preconditions"], case.get("configs", "None"),
                   case["testData"], "\n".join(f"{i + 1}. {s}" for i, s in enumerate(case["steps"])), case["expected"], case["priority"], case["testType"],
                   case.get("reference", ""), c["status"], c["why"], "\n".join(shots)])
        if c["status"] == "Fail" and c.get("bug"):
            n += 1
            b = c["bug"]
            ref = case.get("reference", "")
            bugs.append({
                "id": f"RCA-BUG-{n:02d}", "status": "OPEN", "priority": PRI.get(case["priority"], "P2"),
                "blocker": "YES" if case["priority"] == "Critical" and "server" in b["title"].lower() else "NO",
                "dev_type": "BE" if c["layer"] == "api" or "server" in b["title"].lower() else "FE",
                "summary": b["title"].split(" — ")[0][:140], "user_type": case["role"].split(",")[0].strip() or "Buyer", "module": case["module"],
                "description": f"{b['whatHappened']}\nExpected behavior: {b['expected']}\nWhy it matters: this is the symptom of {ref or 'a reported ticket'} — a customer saw it on production; it is reproducible on UAT today.",
                "steps": [f"{i + 1}. {s}" for i, s in enumerate(case["steps"])],
                "shots": [p for p in (shot_path(s) for s in shots) if p],
                "artefact": "" if any(shot_path(s) for s in shots) else (b.get("where") or ""),
                "reported": datetime.date.fromisoformat(r["startedAt"][:10]), "qa": "Animesh", "qa_status": "FAIL",
                "qa_comment": f"UAT, PROCOL DEMO ({r['companyId']}), {r['startedAt'][:10]}. Run {r['id']}, case {case['id']}. {('The app said: ' + b['appSaid']) if b.get('appSaid') else ''} {('Where: ' + b['where']) if b.get('where') else ''} Source ticket: {ref}".strip(),
                "feature": case["scenario"],
            })
    widths = {"Test Case ID": 14, "Module": 18, "Scenario": 24, "Test Case Title": 46, "User Role": 14, "Portal": 16, "Pre-conditions": 38, "Configs Needed": 24,
              "Test Data": 28, "Test Steps": 60, "Expected Result": 60, "Priority": 10, "Test Type": 12, "Reference": 40, "Status": 14, "Actual Result": 70, "Screenshots": 40}
    for i, h in enumerate(COLS, 1):
        ws.column_dimensions[get_column_letter(i)].width = widths[h]
        c = ws.cell(row=1, column=i)
        c.font = Font(name="Arial", bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1F4E79")
    tone = {"Pass": "E3F4EA", "Fail": "FDE8E6", "Partly checked": "FFF1D6", "Couldn't tell": "EEF0F3", "Not run": "EEF0F3"}
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.font = Font(name="Arial", size=10)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
        st = row[COLS.index("Status")]
        st.fill = PatternFill("solid", fgColor=tone.get(st.value, "FFFFFF"))
    ws.freeze_panes = "A2"
    write_bug_sheet(wb, "Bugs", bugs, feature="Real bugs from HubSpot, replayed on UAT")
    wb.save(out)
    counts = {}
    for _, c in latest.values():
        counts[c["status"]] = counts.get(c["status"], 0) + 1
    print(f"{len(latest)} cases → {out.name}: {counts}; {len(bugs)} bug rows")


if __name__ == "__main__":
    main()
