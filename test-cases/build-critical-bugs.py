"""Top 4 critical bugs from the platform bug hunt, short hand-written style, no dates. Run: PYTHONPATH=. python3 build-critical-bugs.py"""
import os
import openpyxl
from bug_sheet import write_bug_sheet

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Critical_Bugs.xlsx")

BUGS = [
    {
        "id": "CB-01", "priority": "P0", "blocker": "YES", "dev_type": "BE", "user_type": "Vendor",
        "module": "Vendor bidding", "feature": "Event / bidding",
        "summary": "Vendor can see other vendors' prices in the event data",
        "description": "When vendor opens the event, the data coming from server has prices_hash with every other vendor's unit price for each line. "
                       "Vendor should get only his own price. Anyone can open network tab and see competitor rates.",
        "steps": ["Create RFQ on PROCOL DEMO, invite 3 vendors, publish",
                  "All 3 vendors put different prices",
                  "Login as vendor 1, open event, open network tab",
                  "Open the event schema call → line items → meta_data → prices_hash",
                  "Vendor 2 and vendor 3 prices are visible"],
        "qa_comment": "PROCOL DEMO (198678) - RFX-21204, RFX-21205, RFX-21210",
    },
    {
        "id": "CB-02", "priority": "P0", "blocker": "YES", "dev_type": "BE",
        "module": "Awarding → PO", "feature": "Partial awarding",
        "summary": "Partial award - PO is created for full bid qty, not awarded qty",
        "description": "Awarded only 4 out of 10 KG, approval done, but PO got created for 10 KG (₹1,070 instead of ₹428). "
                       "PR line also shows fully closed so balance qty can't be sourced again. PO should have only awarded qty.",
        "steps": ["Create RFQ with 1 line, 10 KG",
                  "Vendor bids for 10 KG",
                  "Award only 4 KG to the vendor and submit",
                  "Approve the award",
                  "Open the PO - qty is 10 KG"],
        "qa_comment": "PROCOL DEMO RFX-21249 (proposal 15192, PO 24356). Also Amity RFX-971 (500 awarded, PO 1000)",
    },
    {
        "id": "CB-03", "priority": "P0", "blocker": "YES", "dev_type": "BE",
        "module": "Purchase Orders", "feature": "Security",
        "summary": "Any logged in user can change PO number of another company's PO",
        "description": "Order update API has no company / permission check. From another company's workspace I changed PROCOL DEMO PO number and it got saved "
                       "(API shows 500 but value changes). Should give not found / not allowed.",
        "steps": ["Login in company A",
                  "Take order id of company B's PO",
                  "PATCH /orders/<order id> with po_number = TEST",
                  "Check company B's PO - number is changed"],
        "qa_comment": "Tried from Demo Account 2 on PROCOL DEMO order 13223 (df → df_QA_IDOR), changed back after",
    },
    {
        "id": "CB-04", "priority": "P1", "blocker": "NO", "dev_type": "BE",
        "module": "PR → PO", "feature": "Intake → PR",
        "summary": "Intake PR line gets closed for double qty after PO",
        "description": "For PRs raised from intake, one PO of 10 is closing 20 on the PR line (sometimes 3x). "
                       "Open qty becomes wrong and line shows completed early. Closed qty should increase only by PO qty.",
        "steps": ["Raise intake request with 1 item qty 10, convert to PR",
                  "Create event from PR, vendor bids, award",
                  "Create PO for 10",
                  "Open the PR line - closed qty shows 20"],
        "qa_comment": "Saint Gobain Gyproc PR-130 (RFX-55), M3M NOIDA PR-102 (500 → 1500), Blue Star PR-2099 (RFX-1212)",
    },
]

for b in BUGS:
    b["reported"] = None


def main():
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    ws = write_bug_sheet(wb, "Critical bugs", BUGS, feature="Platform")
    from bug_sheet import COL
    for r in range(2, len(BUGS) + 2):
        ws.cell(r, COL["Issue Reported Date"]).value = None
    wb.save(OUT)
    print(OUT, len(BUGS))


if __name__ == "__main__":
    main()
