#!/usr/bin/env python3
"""The product questionnaire for the team — every doubt the platform has raised and cannot settle by itself.

Sources, each row saying where it came from:
  • the derivations' questions (prototype/data/product-questions.json) — "is this a permission or a bug?";
  • the questions the flow explorer asked while clicking through the settings menus (prototype/data/flow-explore);
  • the Q1–Q25 of the events flow map (prototype/knowledge/events/flow-map-create-to-mqcs.md);
  • the blockers the RCA replay hit on UAT (written here from the runs of 5–9 Nov 2026);
  • the permission rules in Procol's code that no test case covers yet (data/rules: kind = permission, not covered) —
    one question each: "who may do this, and what should a user without it see?"

Output: Product_Questions_for_Team.xlsx with an Answer column, grouped by area, highest impact first.
"""
import json
import re
from collections import OrderedDict
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HERE = Path(__file__).resolve().parent
PROTO = HERE.parent / "prototype"
OUT = HERE / "Product_Questions_for_Team.xlsx"
COLS = ["#", "Area", "Question", "Why we ask (what it blocks)", "What the platform assumes until answered", "Came from", "Who can answer", "Impact", "Answer", "Answered by / on"]

rows = []


def add(area, q, why, assume, src, who="Product", impact="High"):
    q = re.sub(r"\s+", " ", str(q)).strip()
    if not q or any(r[2].lower() == q.lower() for r in rows):
        return
    rows.append(["", area, q, re.sub(r"\s+", " ", str(why)).strip(), re.sub(r"\s+", " ", str(assume)).strip(), src, who, impact, "", ""])


# 1 · the RCA replay's own blockers (5–9 Nov 2026, PROCOL DEMO on UAT)
RCA_RUN = [
    ("Bidding", "After the buyer enters two surrogate bids, Procol's own participation counter reads 1/193. Is participation meant to count surrogate bids? If so, is it a bug that only one of two counted?", "Decides whether the counter on Responses is a bug or expected.", "Treated as an observation, not a bug.", "Lead PM / RFQ squad", "Medium"),
    ("EventStatuses", "After a buyer extends the submission time, should Order Activity (Settings → Order Activity) list that extension? On UAT the activity-logs API answered 200 with an empty list.", "Ticket 333529488097 was a crash here; this is a different symptom.", "Recorded as an observation.", "RFQ squad", "Medium"),
    ("Bidding", "A vendor removed from the Technical stage could still open, price and submit an RFQ bid (reproduced twice on UAT). Is a vendor removed from the technical round still a valid RFQ participant by design, or a bug (ticket 323881661152)?", "The only Fail of the replay that stands; decides if it goes to engineering.", "Reported as a bug (High).", "RFQ squad", "Critical"),
    ("Awarding", "Awarding more than the requested quantity: is the refusal message exactly \"You can't select bid for more than the requested quantity\" on every template, and is over-awarding ever allowed (is_over_awarding_allowed)?", "The API has no awarded-quantity parameter the platform can set; the UI check could only test the actual quantity + 1.", "Only the requested quantity is awarded in tests.", "Awarding squad", "Medium"),
    ("Settings", "use_rank_l1_for_savings, is_partial_awarding_enabled and most awarding settings are HIDDEN (only a Procol employee can switch them; backend error 1103). Can QA get a Procol-employee login for PROCOL DEMO, or a company already set up each way?", "Every case that needs a hidden setting is Blocked today.", "Cases that need them are reported Blocked.", "Engineering / CS", "High"),
    ("Approvals", "Who approves PROCOL DEMO's award proposals? The replay's awarded event waited for another user, so no PO could be created and the Live-tab case could not finish.", "Blocks the PO and post-PO cases (EVT-027 and the PO amendment set-up).", "Cases needing an approver are Blocked.", "CS / Demo owner", "High"),
    ("Event creation", "On PROCOL DEMO the single-stage configuration drawer closes and loses the choice when the event type is changed (RFQ → RFP stays RFP). A person declining the notifications prompt first gets the same. Is this a UAT build issue or expected?", "Blocked nine single-stage cases until the platform worked around it via the company default.", "Platform sets default_event_type for the case instead.", "Frontend squad", "High"),
    ("Event creation", "Pressing Invite Vendor with no vendor named adds every vendor the products map to (193 on PROCOL DEMO, 205 on another run). Is that the intended behaviour of the suggestion, and is there a cap?", "Participation and audience checks read bidders / 193.", "Cases that need a known vendor name it.", "RFQ squad", "Medium"),
    ("Counter offer", "On a live RFQ where the vendor bid from the supplier portal, the buyer's Counter Offer on Master QCS was greyed out. When exactly is Counter Offer offered (bid state, event state, setting)?", "CO-026 could not run.", "Treated as not offered on a live bid from the portal.", "Negotiation squad", "Medium"),
    ("Currency", "Is PHP displayed as \"PHP\" (not CUP) everywhere now (ticket 322196940492)? The platform cannot prove a label is absent unless the product is known to use it.", "CRT-007 is Partly checked.", "Assumed fixed.", "Frontend squad", "Low"),
    ("Templates", "Should the RFQ stage's template picker ever list a technical (questionnaire) template (ticket 322237120193)? What are PROCOL DEMO's technical template names, so the check can name them?", "CRT-006 is Not run (nothing to name).", "Unknown.", "Templates owner", "Medium"),
    ("Activity", "Which actions are meant to write an Order Activity entry on a stage: publish, bid, extension, withdraw, counter offer? A list makes the activity checks exact.", "The activity case can only look for text it is told.", "Only the extension is checked.", "RFQ squad", "Low"),
]
for area, q, why, assume, who, impact in RCA_RUN:
    add(area, q, why, assume, "RCA replay on UAT, 5–9 Nov 2026", who, impact)

# 2 · the derivations' questions
pq = PROTO / "data" / "product-questions.json"
if pq.exists():
    for q in json.load(open(pq)):
        add(q.get("area", "General"), q["question"], q.get("why", ""), q.get("assume", ""), q.get("from", "derivation"), "Product", "Medium")

# 3 · the flow explorer's questions (clicking through settings menus with settings switched)
def walk(o, out):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in ("question", "questions") and v:
                out.extend(v if isinstance(v, list) else [v])
            else:
                walk(v, out)
    elif isinstance(o, list):
        for x in o:
            walk(x, out)


fe = PROTO / "data" / "flow-explore"
if fe.exists():
    for f in sorted(fe.glob("*.json")):
        out = []
        try:
            walk(json.load(open(f)), out)
        except Exception:
            continue
        for q in out:
            s = str(q)
            if len(s) < 25:
                continue
            area = "Event settings" if re.search(r"withdraw|extend|evaluation|duration|schedule", s, re.I) else "Awarding" if re.search(r"award|proposal", s, re.I) else "Events"
            add(area, s, "Seen while exploring the Settings menu with company settings switched; the product has not settled it.", "Record what happens.", f"flow exploration ({f.stem})", "Product", "Medium")

# 4 · the flow map's Q1–Q25
fm = PROTO / "knowledge" / "events" / "flow-map-create-to-mqcs.md"
if fm.exists():
    md = fm.read_text()
    found = 0
    for m in re.finditer(r"(?:^|\n)[^\n]*\b(Q(\d{1,2}))\b[\s:.)—-]+([^\n]{20,})", md):
        found += 1
        add("Events flow (create → Master QCS)", f"{m.group(1)}: {m.group(3).strip()}", "Open since the flow map of 7 Oct 2026; the matching cases 'record current behaviour' until answered.", "Records current behaviour.", "flow map Q1–Q25", "Product", "Medium")
    if found < 5:
        for t in ["expired vs closed", "withdrawn / recreate", "the eRFX gate (rfx_project_enabled) per client", "template settings per client", "upload-sheet vendor mapping", "auto-added vendors", "negative savings", "mandatory T&C on the vendor side", "minimum event duration", "publish-check order", "price cap edits after bids", "surrogate bid approval", "rank ties (everyone rank 2, nobody rank 1)", "Master QCS report version per client", "silent vendors in the report"]:
            add("Events flow (create → Master QCS)", f"What is the intended behaviour for: {t}?", "Open since the flow map of 7 Oct 2026.", "Records current behaviour.", "flow map Q1–Q25", "Product", "Medium")

# 5 · permission rules in the code that no case covers yet
rules_f = PROTO / "data" / "rules" / "events-rules.json"
cov_f = PROTO / "data" / "rules" / "rule-coverage.json"
if rules_f.exists():
    raw = json.load(open(rules_f))
    rules = raw if isinstance(raw, list) else raw.get("rules", [])
    verdict = {}
    if cov_f.exists():
        try:
            cov = json.load(open(cov_f))
            for rid, v in (cov.get("matrix") or {}).items():
                verdict[rid] = v.get("verdict") if isinstance(v, dict) else v
        except Exception:
            pass
    n = 0
    for r in rules:
        if r.get("kind") != "permission" or verdict.get(r.get("id")) not in (None, "not covered"):
            continue
        st = re.sub(r"\s+", " ", r.get("statement", "")).strip()
        if len(st) < 20:
            continue
        add("Permissions", f"Rule {r['id']}: \"{st[:220]}\" — who holds this right on PROCOL DEMO, and what should a user without it see (no control, greyed with a tooltip, or a refusal with which message)?", "No test case covers this rule; without the answer the platform cannot tell a product gap from a bug.", "A refusal is treated as correct; a silent success as a bug candidate.", f"code rule {r['id']} ({r.get('file','')}:{r.get('lines','')})", "Engineering", "High")
        n += 1
        if n >= 60:
            break


def main():
    order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    rows.sort(key=lambda r: (order.get(r[7], 9), r[1]))
    for i, r in enumerate(rows, 1):
        r[0] = f"PQ-{i:03d}"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Product questions"
    ws.append(COLS)
    for r in rows:
        ws.append(r)
    widths = [9, 20, 70, 44, 40, 30, 16, 10, 40, 18]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
        c = ws.cell(row=1, column=i)
        c.font = Font(name="Arial", bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1F4E79")
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.font = Font(name="Arial", size=10)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
    ws.freeze_panes = "A2"
    by = OrderedDict()
    for r in rows:
        by[r[1]] = by.get(r[1], 0) + 1
    ws2 = wb.create_sheet("By area")
    ws2.append(["Area", "Questions"])
    for k, v in by.items():
        ws2.append([k, v])
    wb.save(OUT)
    print(f"{len(rows)} questions → {OUT.name}; by area: {dict(by)}")


if __name__ == "__main__":
    main()
