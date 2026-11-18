#!/usr/bin/env python3
"""
rca-build-v2-cases.py — write test-cases/RCA_Real_Bugs_v2.xlsx, the RCA proof corpus (Track A, step 2).

    python3 test-cases/rca-build-v2-cases.py            # writes the workbook
    python3 test-cases/rca-build-v2-cases.py --check    # prints counts only

One case per RCA ticket (or ticket pair) from the 40 picked in .local-rca/rca-40-proposal.md.
Each case rebuilds the situation the ticket describes on PROCOL DEMO (198678, UAT) with the QA
vendors and checks that the fixed behaviour holds. Columns are the team's sheet columns (the
sourcing sheet's 14) so the Test sheets page can run it, plus two traceability columns at the end:
"Ticket" (HubSpot ids, nothing else from the ticket) and "QA Comment" (what the case rests on).

Ticket text never goes in here: titles, steps and expected results are written from scratch about
the behaviour. The RCA wording stays in .local-rca/ (git-ignored).

Needs openpyxl (python3 -m pip install --user openpyxl).
"""
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent / "RCA_Real_Bugs_v2.xlsx"

COLS = ["Test Case ID", "Module", "Scenario", "Test Case Title", "User Role", "Portal", "Pre-conditions",
        "Configs Needed", "Test Data", "Test Steps", "Expected Result", "Priority", "Test Type", "Status",
        "Ticket", "QA Comment"]

BUYER = 'Log in to Procol (buyer side) with the buyer user'
VENDOR = "Log in to the Procol vendor portal with the vendor's user (use a second browser or an incognito window so the buyer stays logged in)"
VENDORS = "Vendors A, B and C are the QA test vendors of PROCOL DEMO (names start with QA_Platform)."
PRODUCT = "Product CYLINDER WITH KEY & KNOB"

# Scenario → module heading, in sheet order.
MODULES = {
    "QCS": "1. Master QCS, awarding and NFA",
    "BID": "2. Bidding and RFQ stage",
    "AUC": "3. Auction, counter offer and lots",
    "EVL": "4. Technical evaluation",
    "VIS": "5. Visibility and event set-up",
    "USR": "6. Messages, users and sign-in",
}

# ---- the 40 cases -------------------------------------------------------------------------------
# fields: mod, scenario, title, role, portal, pre, configs, data, steps[], expected, priority, type, ticket, comment
C = []

def case(mod, scenario, title, role, portal, pre, configs, data, steps, expected, priority, ttype, ticket, comment):
    C.append(dict(mod=mod, scenario=scenario, title=title, role=role, portal=portal, pre=pre, configs=configs,
                  data=data, steps=steps, expected=expected, priority=priority, ttype=ttype, ticket=ticket, comment=comment))

BOTH = "Buyer + Vendor portal"

# 1 ---------------------------------------------------------------------------------------------
case("QCS", "Rejected vendor leaves the Master QCS",
     "Reject a vendor's auction bid; Master QCS no longer lists them",
     "Buyer", "Buyer portal",
     f"A closed reverse auction where Vendor A bid 100, Vendor B bid 90 and Vendor C bid 95. {VENDORS}",
     "None", "Reject Vendor C's bid",
     [BUYER, 'Open the closed auction and open the "Responses" tab',
      'On Vendor C\'s bid click "Reject Bid" and confirm',
      'Click "Master QCS"', 'Read every section of the Master QCS (summary, line items, ranking) and the downloaded Master QCS Excel'],
     "Vendor C appears in no section of the Master QCS and in no sheet of the downloaded Excel. Ranks are L1 Vendor B (90), L2 Vendor A (100). The same two vendors appear through the API that feeds the Master QCS.",
     "High", "Regression", "232624699095", "Proves the fix for a rejected vendor staying in the Master QCS participant list.")

# 2
case("QCS", "Vendors awarded nothing show zero everywhere",
     "Award all to one vendor; the others show 0 in awarded columns",
     "Buyer", "Buyer portal",
     f"A closed RFQ for 10 units where Vendor A quoted 100, Vendor B quoted 90 and Vendor C quoted 95, on a template that has a global charge field (Other Charges, amount) with a value of 500 on every bid. {VENDORS}",
     "is_partial_awarding_enabled = On — splitting a line's quantity across vendors\ntemplate: pricing template with a global amount charge (set up in Admin first)",
     "Award 10 to Vendor B, 0 to the others",
     [BUYER, 'Open the closed RFQ, click "Master QCS" and then "Start Awarding"',
      'Type 10 against Vendor B and leave Vendor A and Vendor C at 0',
      'Click "Create Proposal" and read the awarded columns (Awarded DDP, Awarded Landed Amount, Awarded Total) for all three vendors',
      'Download the Master QCS Excel and read the same columns'],
     "Vendor B shows 10 × 90 = 900 plus the 500 charge in the awarded total. Vendor A and Vendor C show 0 in Awarded DDP, Awarded Landed Amount and Awarded Total, on screen and in the Excel. No non-zero charge is left against a vendor awarded 0.",
     "High", "Regression", "217872722637+229082238688", "Proves global charges scale with awarded quantity and go to 0 for vendors awarded nothing.")

# 3
case("QCS", "Formula fields compute in dependency order",
     "Template with 11+ inline fields; Total Basic Amount is computed, not 0",
     "Buyer, Vendor A", BOTH,
     f"A pricing template with at least 11 inline fields where Total Basic Amount is a formula over a field defined after it (field 11 or later). A live RFQ on that template. {VENDORS}",
     "template: pricing template with 11+ inline fields and a formula that depends on a later field (set up in Admin first)",
     "Vendor A quotes unit price 100, quantity 10, discount 5%",
     [BUYER, 'Create and publish an RFQ on the 11-field template for ' + PRODUCT + ', quantity 10, inviting Vendor A',
      VENDOR, 'Open the RFQ, fill every inline field (price 100, discount 5%) and click "Submit Quote"',
      'Back as the buyer, open "Responses" and read Total Basic Amount for Vendor A',
      'Open "Master QCS" and read the same field; download the Master QCS Excel and the NFA report'],
     "Total Basic Amount reads 100 × 10 less 5% = 950 in Responses, in the Master QCS, in the Excel and in the NFA report. It is never 0 or blank. Through the API the bid's line item carries the same 950.",
     "High", "Regression", "202823770843+202497638095", "Proves widget priorities are evaluated numerically (0,1,2,…10,11), not as strings. The API read-back is the fastest proof.")

# 4
case("QCS", "BOQ event survives a partial award",
     "BOQ event stays open after a partial award",
     "Buyer", "Buyer portal",
     f"A closed BOQ RFQ with two BOQ lines where Vendor A and Vendor B both quoted. {VENDORS}",
     "is_partial_awarding_enabled = On — splitting a line's quantity across vendors",
     "Award line 1 to Vendor A only",
     [BUYER, 'Open the closed BOQ RFQ, click "Master QCS" and then "Start Awarding"',
      'Award line 1 fully to Vendor A; leave line 2 unawarded', 'Click "Create Proposal", fill the required fields and submit it',
      'Go back to the event list ("Events") and find the event', 'Open the event and read the status badge and the awarding page'],
     "The event is still listed under the open/live events, not History. Line 2 is still open for awarding and the awarding page can be reopened without an error. Line 1 shows as awarded to Vendor A.",
     "High", "Regression", "223721110231", "Proves a partial award of a BOQ event does not close the event or lock the remaining lines.")

# 5
case("QCS", "Master QCS of an old event opens after a widget type change",
     "Master QCS of an old event opens after a widget changes string→dropdown",
     "Buyer", "Buyer portal",
     f"A closed RFQ where Vendor A and Vendor B quoted, on a template with a text (string) field 'Make' that the vendors filled. After the bids, the template's 'Make' field is changed in Admin to a dropdown. {VENDORS}",
     "template: change one filled text field to a dropdown after bids exist (set up in Admin first)",
     "Field 'Make', vendor values 'Bosch' and 'Siemens'",
     [BUYER, 'Open the closed RFQ (bid before the template change) and click "Master QCS"',
      'Read the Make column for both vendors', 'Download the Master QCS Excel and open it',
      'Call the Master QCS API for the same event'],
     "The Master QCS opens without an error page or toast. The Make column shows the values the vendors typed ('Bosch', 'Siemens'), on screen, in the Excel and in the API reply (HTTP 200).",
     "Medium", "Regression", "222333490910", "Proves old bids with string values render after the widget became a dropdown.")

# 6
case("QCS", "Total Proposal Value follows the selected lines",
     "Deselect every line on the awarding page; Total Proposal Value is 0",
     "Buyer", "Buyer portal",
     f"A closed RFQ with three lines where Vendor A quoted 100, 200 and 300 per unit (quantity 1 each). {VENDORS}",
     "None", "Three lines, Vendor A",
     [BUYER, 'Open the closed RFQ, click "Master QCS" and then "Start Awarding"',
      'Click "Select All" for Vendor A and read Total Proposal Value',
      'Untick each of the three lines one by one, reading Total Proposal Value after each',
      'With nothing selected click "Create Proposal"'],
     "After Select All the Total Proposal Value reads 600. After each untick it drops by that line (500, 300, 0). With nothing selected it reads 0 and the app refuses the proposal with its own message (record the exact words), it does not create a proposal with a non-zero value.",
     "High", "Regression", "323861342966", "Proves the running total subtracts deselected lines (incl. GST) instead of keeping the last value.")

# 7
case("QCS", "Master QCS reachable after all lots are withdrawn",
     "Withdraw all lots; Master QCS is still reachable",
     "Buyer", "Buyer portal",
     f"A closed RFQ with four lines that the buyer split into two lots, where Vendor A and Vendor B quoted on both lots. {VENDORS}",
     "None", "Two lots, then both withdrawn",
     [BUYER, 'Open the closed RFQ and open the lots view', 'Withdraw lot 1, then withdraw lot 2 (the three dots (⋮) on each lot)',
      'Go back to the RFQ stage', 'Click "Master QCS" and then "Start Awarding"'],
     "The Master QCS button is shown and opens the comparison of all four lines with both vendors' quotes. Start Awarding works line-item-wise. No 'Lot Adjustment Pending' or blank page.",
     "Medium", "Regression", "326796703463", "Proves the Master QCS comes back when every lot is withdrawn and the lines return to the RFQ.")

# 8
case("QCS", "NFA report on a template without gross total",
     "Template without gross total; NFA report downloads or names the gap",
     "Buyer", "Buyer portal",
     f"A closed RFQ on a pricing template that has no Gross Total field, where Vendor A quoted and the buyer created a proposal. {VENDORS}",
     "template: pricing template with the Gross Total field removed (set up in Admin first)",
     "Vendor A quote 100 × 10",
     [BUYER, 'Open the closed RFQ, open the proposal (NFA) page', 'Click the NFA report download', 'Read the downloaded file or the message shown'],
     "Either the NFA report downloads with the available totals, or the app shows one plain message naming the missing field (record the exact words). It never spins forever or shows an Internal Server Error.",
     "Medium", "Negative", "326785768159", "The ticket's root cause was a template without gross total; the case checks the report fails safely, not silently.")

# 9
case("QCS", "Reports on an event with no bids",
     "Event with no bids; RFQ report and QCS download",
     "Buyer", "Buyer portal",
     f"A closed RFQ where no vendor quoted. {VENDORS}",
     "None", "No bids",
     [BUYER, 'Open the closed RFQ with no bids', 'Download the RFQ report', 'Click "Master QCS" and download the QCS',
      'Call the report APIs for the same event'],
     "Both downloads produce a file (empty of vendor rows) or a plain 'no bids' message. No Internal Server Error on screen and HTTP 200 (or a 4xx with a message) from the API, never a 500.",
     "Medium", "Negative", "329854782145", "Proves nil currency preferences on a zero-bid event no longer crash the RFQ/auction report.")

# 10
case("BID", "Bid sheet download and upload round trip",
     "Bid sheet has one serial column and uploads back",
     "Vendor A", "Vendor portal",
     f"A live RFQ with three lines where Vendor A is invited. {VENDORS}",
     "None", "Prices 100, 200, 300",
     [VENDOR, 'Open the RFQ and click "Download bid sheet" (Upload Excel option)', 'Open the sheet and read its columns',
      'Fill prices 100, 200, 300 and upload the sheet', 'Click "Submit Quote" and read the quote'],
     "The sheet has exactly one serial-number column and the line items once each, in event order. The upload fills the three prices without an error and the submitted quote shows 100, 200, 300.",
     "Medium", "Regression", "236831336159+318439218889", "Proves the serial number is not printed twice and the sheet round-trips.")

# 11
case("BID", "Empty dropdown does not loop",
     "Dropdown with no options does not loop the widget-data call",
     "Vendor A", "Vendor portal",
     f"A live RFQ on a template with a dropdown field 'Grade' that has no options configured, Vendor A invited. {VENDORS}",
     "template: a dropdown field with zero options (set up in Admin first)",
     "Field 'Grade'",
     [VENDOR, 'Open the RFQ and open the quote form', 'Click the "Grade" dropdown', 'Watch the browser console / network tab for 30 seconds'],
     "The dropdown opens empty (or reads 'No options'). The widget-data request is made once, not repeated every second. The quote form stays usable.",
     "Medium", "Negative", "234382376656", "Proves an empty option list no longer re-fetches in a loop.")

# 12
case("BID", "Line GST % visible on a non-multicurrency event",
     "Non-multicurrency commercial event shows Line GST % to the vendor",
     "Vendor A", "Vendor portal",
     f"A live single-stage RFQ created without the event's 'Edit Currency' option (single currency; multicurrency is per event, not a company setting) on a template that has a Line GST % field, Vendor A invited. {VENDORS}",
     "None",
     "GST 18%",
     [VENDOR, 'Open the RFQ and open the quote form', 'Find the "Line GST %" column', 'Type 18 and submit the quote',
      'As the buyer open "Responses" and read the GST column'],
     "The Line GST % column is present and editable for the vendor. The buyer's Responses show 18% and the GST amount computed from it.",
     "High", "Regression", "214553542330", "Proves the GST column is not hidden when multicurrency is off.")

# 13
case("EVL", "Regret a line with a mandatory dropdown",
     "Vendor regrets a line that has a mandatory dropdown field",
     "Vendor A", "Vendor portal",
     f"A live RFQ with two lines on a template with a mandatory dropdown 'Brand', Vendor A invited. {VENDORS}",
     "template: a mandatory dropdown field on the line (set up in Admin first)",
     "Regret line 2, quote line 1 at 100",
     [VENDOR, 'Open the RFQ and open the quote form', 'Quote line 1 at 100, Brand = first option', 'On line 2 click "Regret" and give a reason', 'Click "Submit Quote"'],
     "The quote submits. Line 1 shows 100; line 2 shows Regretted. The mandatory Brand on the regretted line is not demanded.",
     "Medium", "Negative", "303729599176", "Proves mandatory validation skips a regretted line.")

# 14
case("BID", "Zero accepted in a mandatory price field",
     "0 accepted in a mandatory price field, by vendor and by surrogate",
     "Vendor A, Buyer", BOTH,
     f"A live RFQ with two mandatory price columns (Unit Price, Tooling Cost), Vendor A and Vendor B invited. {VENDORS}",
     "None", "Vendor A: price 100, tooling 0. Surrogate for Vendor B: price 90, tooling 0",
     [VENDOR, 'Open the RFQ, type Unit Price 100 and Tooling Cost 0, click "Submit Quote"',
      BUYER, 'Open the RFQ, open "Surrogate bid" for Vendor B, type Unit Price 90 and Tooling Cost 0, submit',
      'Open "Responses" and read both bids'],
     "Both quotes submit. Tooling Cost reads 0 (not blank, not '-') for both vendors in Responses and in the Master QCS.",
     "High", "Regression", "327623502533+331661809355", "Proves 0 is a value, not 'empty', in mandatory number fields.")

# 15
case("BID", "Surrogate bid by Excel keeps GST",
     "Surrogate bid by Upload Excel keeps GST %",
     "Buyer", "Buyer portal",
     f"A live RFQ where GST % is mandatory, Vendor B invited and has not quoted. {VENDORS}",
     "None", "Price 90, GST 18%",
     [BUYER, 'Open the RFQ and open "Surrogate bid" for Vendor B', 'Choose "Upload Excel", download the sheet, fill price 90 and GST 18, upload it',
      'Submit the surrogate quote', 'Open "Responses" and read GST %, GST Amount; call the bid API'],
     "GST % reads 18 and GST Amount 16.2 on screen and in the API reply. Nothing is blank.",
     "High", "Regression", "327258824432+330906309310+328641656531", "Proves the Excel surrogate path saves GST % like the form path.")

# 16
case("AUC", "Surrogate RFQ bid does not trap the vendor in the auction",
     "Surrogate RFQ bid only; vendor can still bid in the auction",
     "Buyer, Vendor A", BOTH,
     f"A two-stage event (RFQ then auction) where the buyer placed a surrogate RFQ bid of 100 for Vendor A and the auction is live. {VENDORS}",
     "None", "Surrogate 100, auction bid 95",
     [BUYER, 'Place a surrogate RFQ bid of 100 for Vendor A and move the event to the auction stage',
      VENDOR, 'Open the live auction', 'Place a bid of 95'],
     "Vendor A sees the auction with their starting price 100 and can bid 95; the bid is accepted and ranked. No 'not allowed' message.",
     "High", "Regression", "306800405189", "Proves the auction audience includes a vendor whose only RFQ bid was surrogate.")

# 17
case("VIS", "Vendor added only to RFQ",
     "Observation: vendor added only to RFQ, can they quote without technical",
     "Buyer, Vendor C", BOTH,
     f"A two-stage event (technical then RFQ) that is live, where Vendor C was added as a participant in the RFQ stage after publish, not in the technical stage. {VENDORS}",
     "None", "Vendor C",
     [BUYER, 'Open the live event, open the RFQ stage participants and add Vendor C', VENDOR, 'Open the event and try to submit an RFQ quote'],
     "Record what happens: whether Vendor C can quote without a technical submission, and what the buyer's Responses show. Both outcomes are reported to product; the case is not a pass/fail.",
     "Medium", "Observation", "326474193600+218937874132", "Product called this expected; the case records the behaviour so the team can decide.")

# 18
case("BID", "Late line in best offer",
     "Line first quoted in best offer; buyer comparison still opens",
     "Vendor A, Buyer", BOTH,
     f"A live RFQ with five lines, Vendor A invited; best offer round enabled. {VENDORS}",
     "None", "Lines 1–4 at 100, line 5 at 50 in best offer",
     [VENDOR, 'Quote lines 1–4 at 100 and submit', BUYER, 'Start the best offer round for Vendor A',
      VENDOR, 'In the best offer quote line 5 at 50 and submit', BUYER, 'Open "Responses" and "Master QCS"'],
     "The buyer's Responses and Master QCS open and show all five lines for Vendor A with ranks. No Internal Server Error.",
     "High", "Regression", "336045225687", "Proves a line first quoted during best offer gets a rank and does not break the comparison.")

# 19
case("EVL", "Tie at L1",
     "Observation: two vendors tie at L1; what ranks each side sees",
     "Buyer, Vendor A, Vendor B", BOTH,
     f"A closed RFQ where Vendor A and Vendor B both quoted exactly 100. {VENDORS}",
     "None", "Both 100",
     [BUYER, 'Open "Responses" and "Master QCS" and read both ranks', VENDOR, 'As Vendor A read the rank shown; repeat as Vendor B',
      'Call the ranking API'],
     "Record what the buyer sees (L1/L1 or L1/L2), what each vendor sees, and what the API returns. Report any difference between the three.",
     "Medium", "Observation", "198696749791", "The tie rule is not settled; the case records the surfaces so product can decide.")

# 20
case("AUC", "Ranks after an accepted counter offer",
     "Ranks follow the landed amount after a counter offer is accepted",
     "Buyer, Vendor B", BOTH,
     f"A closed RFQ where Vendor A quoted 100 and Vendor B quoted 110. {VENDORS}",
     "None", "Counter offer 95 to Vendor B",
     [BUYER, 'Send a counter offer of 95 to Vendor B', VENDOR, 'As Vendor B accept the counter offer', BUYER, 'Open "Master QCS" and read ranks and landed amounts'],
     "Vendor B shows landed 95 and rank L1; Vendor A shows 100 and L2. The rank matches the landed amount on screen, not the original 110.",
     "High", "Regression", "328509554391", "Proves ranks are recomputed from the current landed amount after negotiation.")

# 21
case("AUC", "Dynamic extension kept from draft to published event",
     "Tick dynamic extension on an auction draft; the published event keeps it",
     "Buyer", "Buyer portal",
     "None. Dynamic time extension is set per event in the auction's timing section (there is no company-level default in Procol's settings catalogue).",
     "None",
     "New reverse auction draft, dynamic extension 2 minutes",
     [BUYER, 'Click "Create event", choose Reverse Auction and fill the required fields', 'In the timing section tick "Dynamic time extension" and type 2 minutes', 'Save the draft, reopen it and read the timing section', 'Publish the event and read the overview'],
     "The draft reopens with dynamic time extension ticked and 2 minutes filled. The published event's overview says the close extends by 2 minutes on a late bid. Through the API the event's config carries the dynamic extension.",
     "Medium", "Regression", "232528927428", "Proves the draft's dynamic-extension choice is saved and reaches the published event (the ticket's root cause was a missing default strategy on the PR path, covered by RCA-AUC-004).")

# 22
case("AUC", "Last-minute bid extends an auction made from a PR",
     "Auction from a PR: a last-minute bid extends the close",
     "Buyer, Vendor A", BOTH,
     f"A reverse auction created from a PR with dynamic extension of 2 minutes, live and 1 minute from closing, Vendor A invited. {VENDORS}",
     "None\nPR on DEMO: an open PR line to build the auction from",
     "Bid in the last minute",
     [BUYER, 'Create the auction from the PR with dynamic extension 2 min and publish', VENDOR, 'With under a minute left place a lower bid',
      BUYER, 'Read the closing time and, after close, the participation summary'],
     "The closing time moves out by 2 minutes after the bid. The participation summary shows dynamic time extended = 2 min (not 0).",
     "High", "Regression", "321546321599+322191169265", "Proves the price-based closing strategy is set by default on the PR-to-event path.")

# 23
case("AUC", "Split remaining lines after a lot went to auction",
     "Split remaining lines into a new lot after one lot went to auction",
     "Buyer", "Buyer portal",
     f"A closed RFQ with four lines, lines 1–2 in lot 1 that was converted to an auction; lines 3–4 still in the RFQ. {VENDORS}",
     "None", "New lot from lines 3–4",
     [BUYER, 'Open the RFQ stage, select lines 3 and 4', 'Click "Create lot" / "Split"'],
     "A second lot is created from lines 3–4. The app does not refuse with 'You cannot edit the RFQ once the Auction is created'.",
     "High", "Regression", "326555175666", "Proves lot creation on the remaining lines is allowed after one lot became an auction.")

# 24
case("QCS", "NFA on a stale price",
     "Counter offer accepted after NFA sent; NFA cannot pass stale",
     "Buyer, Vendor A, Approver", BOTH,
     f"A closed RFQ where Vendor A quoted 100 and the buyer sent the NFA for approval at 100; an approver is configured. {VENDORS}",
     "None\napproval workflow: one approver on proposals",
     "Counter offer 90 accepted after NFA sent",
     [BUYER, 'Send the proposal (NFA) for approval', 'Send a counter offer of 90 to Vendor A', VENDOR, 'Accept the counter offer',
      'As the approver open the pending NFA and try to approve'],
     "The NFA shows it is out of date (record the exact words) and must be re-sent at 90, or the approval is refused. It cannot be approved at 100.",
     "High", "Negative", "329423982297", "Proves an NFA detects an offer change after it was sent.")

# 25
case("EVL", "Re-evaluate after a rejected proposal",
     "Reject the proposal, re-evaluate, submit TR without error 571",
     "Buyer, Planner", "Buyer portal",
     f"A two-stage event where the planner evaluated Vendor A and Vendor B and a proposal was created, then rejected. {VENDORS}",
     "None\napproval workflow: technical evaluation by a planner",
     "Re-evaluate Vendor A",
     [BUYER, 'Reject the proposal', 'As the planner open the technical stage and re-evaluate Vendor A', 'Click "Submit TR"'],
     "The TR submits. No 'Please evaluate on all fields' (error 571) although all fields are filled.",
     "High", "Regression", "216852669122+327273032381", "Proves rejection does not leave duplicate evaluation records that block the submit.")

# 26
case("EVL", "Remarks survive OK",
     "Evaluation remarks survive OK and reopen",
     "Planner", "Buyer portal",
     f"A two-stage event in technical evaluation where Vendor A has submitted. {VENDORS}",
     "None", "Remark 'Meets spec'",
     ['Log in to Procol as the planner', 'Open the technical stage for Vendor A', 'Type the remark "Meets spec" and click "OK"', 'Close and reopen the evaluation'],
     "The remark 'Meets spec' is still there after OK and after reopening.",
     "Medium", "Regression", "329128910561", "Proves the remark is saved on OK (promise chain fixed).")

# 27
case("EVL", "Change planner",
     "Change the planner; the new planner sees the event",
     "Buyer, Planner 2", "Buyer portal",
     f"A two-stage event sent for evaluation to Planner 1. A second planner user exists. {VENDORS}",
     "None", "Planner 2",
     [BUYER, 'Open the event and click "Update planner"', 'Pick Planner 2 and save', 'Log in as Planner 2 and open "Events"'],
     "Planner 2 sees the event in their list and can open the technical stage. The API for Planner 2's events lists it.",
     "High", "Regression", "329246142200", "Proves the planner user id is written to the trade identifiers on update.")

# 28
case("EVL", "Re-evaluation request accepted",
     "Buyer accepts a re-evaluation request; evaluator gets the option",
     "Buyer, Evaluator", "Buyer portal",
     f"A two-stage event where the evaluator scored Vendor A and asked for re-evaluation. {VENDORS}",
     "None", "Re-evaluate line 1",
     [BUYER, 'Open the request and click "Accept re-evaluation"', 'Log in as the evaluator and open the technical stage'],
     "The evaluator sees a 'Re-evaluate' option on the line and can submit a new score.",
     "Medium", "Regression", "336693144271", "Proves the dashboard shows the re-evaluation option after acceptance.")

# 29
case("EVL", "Vendor assessment survives stage switching",
     "Vendor assessment config survives switching stages",
     "Buyer", "Buyer portal",
     "A draft two-stage project (technical + RFQ) where the technical stage has a vendor assessment configured.",
     "None", "Switch tabs Technical → RFQ → Technical",
     [BUYER, 'Open the draft, open the Technical tab and confirm the vendor assessment is configured', 'Open the RFQ tab, then come back to Technical', 'Save and reopen the draft'],
     "The vendor assessment is still configured after the tab switch and after reopening.",
     "Medium", "Regression", "319645687507", "Proves tab switching does not drop the stage's configuration.")

# 30
case("BID", "Unlock bids after a rejection",
     "Reject a bid, vendor re-quotes; unlock bids still works",
     "Buyer, Vendor A", BOTH,
     f"A closed RFQ where Vendor A quoted 100. {VENDORS}",
     "None", "Re-quote 95",
     [BUYER, 'Reject Vendor A\'s bid with "Allow supplier to bid again" ticked', VENDOR, 'Submit a new quote of 95', BUYER, 'Click "Unlock bids"'],
     "The new quote of 95 shows in Responses and Unlock bids works without an error.",
     "Medium", "Regression", "29097347897", "Proves a stale participant id after rejection no longer breaks the precomputed data.")

# 31
case("VIS", "Quantity edited before publish",
     "Quantity edited before publish shows the same everywhere",
     "Buyer, Vendor A", BOTH,
     "A draft RFQ with one line of quantity 10.",
     "None", "Change quantity to 12",
     [BUYER, 'Open the draft, change the quantity to 12, save and publish', 'Read the quantity on the project page and in the line list',
      VENDOR, 'Open the RFQ and read the quantity', 'Call the event API'],
     "12 everywhere: project page, line list, vendor portal and API.",
     "Medium", "Regression", "29023003162", "Proves the edited quantity propagates before publish.")

# 32
case("VIS", "Technical stage title default",
     "Technical stage title does not default to 'Reverse Auction'",
     "Buyer", "Buyer portal",
     "None.",
     "None", "New project with a technical stage",
     [BUYER, 'Click "Create project", add a Technical stage', 'Read the stage title field before typing'],
     "The technical stage title is blank or reads 'Technical Stage', never 'Reverse Auction'.",
     "Low", "Regression", "320195064528", "Proves the default title fix.")

# 33
case("VIS", "Uninvited vendor on a single-stage event",
     "Single-stage event: an uninvited vendor cannot see or bid",
     "Buyer, Vendor C", BOTH,
     f"A live single-stage RFQ (not an open tender) inviting Vendor A and Vendor B only. {VENDORS}",
     "None", "Vendor C not invited",
     [BUYER, 'Publish the RFQ inviting Vendor A and Vendor B', VENDOR, 'As Vendor C open the events list and search for the RFQ', 'Try to open the event by its link'],
     "Vendor C does not see the event and the link refuses with the app's message (record the words). Through the API Vendor C's bid attempt is refused (4xx).",
     "High", "Negative", "320221798087+320536032988", "Proves single-stage events are not created as open tenders.")

# 34
case("VIS", "TNA vendor shut out of the auction",
     "TNA vendor shut out of the auction when TNA is disallowed",
     "Buyer, Vendor C", BOTH,
     f"A two-stage event where Vendor C was marked Technically Not Accepted and the auction was published with 'allow TNA vendors' off. {VENDORS}",
     "None", "Vendor C is TNA",
     [BUYER, 'Mark Vendor C as TNA, publish the auction with TNA vendors not allowed', VENDOR, 'As Vendor C open the auction and try to bid'],
     "Vendor C does not see the auction, or sees it read-only, and the bid is refused (record the words). Through the API the bid returns 4xx.",
     "High", "Negative", "321664317177", "Proves TNA vendors are excluded from the auction audience.")

# 35
case("VIS", "Participant survives the Technical round trip",
     "Participant added in RFQ stays after a Technical-tab round trip",
     "Buyer", "Buyer portal",
     f"A draft two-stage project (technical + RFQ). {VENDORS}",
     "None", "Add Vendor C in RFQ",
     [BUYER, 'Open the draft, open the RFQ tab and add Vendor C as a participant', 'Open the Technical tab, edit a field twice, come back to the RFQ tab', 'Save and reopen'],
     "Vendor C is still in the RFQ participant list after the round trip and after reopening.",
     "High", "Regression", "333116804815", "Proves the audience rebuild on technical edits does not drop RFQ participants.")

# 36
case("VIS", "Duplicated template and masking message",
     "Event from a duplicated template: no masking message when masking is off",
     "Buyer, Vendor A", BOTH,
     "A template duplicated in Admin from a template that had bid masking on; the duplicate has masking off. A live RFQ on the duplicate.",
     "template: duplicate a template and turn bid masking off on the copy (set up in Admin first)",
     "Masking off",
     [BUYER, 'Create and publish an RFQ on the duplicated template', VENDOR, 'Open the event and read the notices above the quote form'],
     "No 'Bids of participated vendors will be visible once the event duration is over.' notice. The vendor sees the event as a normal unmasked RFQ.",
     "Medium", "Regression", "325223479016", "Proves template duplication copies only the right custom configurations.")

# 37
case("USR", "Change owner keeps message history",
     "Change owner; the new owner sees earlier vendor messages",
     "Buyer 1, Buyer 2, Vendor A", BOTH,
     f"A live RFQ owned by Buyer 1 where Vendor A sent a message 'Can we deliver in two lots?' and Buyer 1 replied. A second buyer user exists. {VENDORS}",
     "None", "Owner → Buyer 2",
     [BUYER, 'As Buyer 1 open the event and click "Change owner", pick Buyer 2', 'Log in as Buyer 2, open the event and open "Messages"'],
     "Buyer 2 sees the thread with Vendor A, including the message and the reply sent before the change.",
     "High", "Regression", "333079559885", "Proves chats are reassigned to the new owner.")

# 38
case("VIS", "Order Activity on a closed RFQ",
     "Closed RFQ: Order Activity lists what the activity API returns",
     "Buyer", "Buyer portal",
     f"A closed RFQ with bids, a counter offer and a proposal. {VENDORS}",
     "None", "–",
     [BUYER, 'Open the closed RFQ and open "Order Activity"', 'Call the activity logs API for the event', 'Compare the two lists'],
     "Order Activity shows every entry the API returns (publish, bids, counter offer, proposal), in the same order. It is not blank.",
     "Medium", "Regression", "333529488097", "Proves the buyer-side Order Activity renders the activity log.")

# 39
case("USR", "User without a phone number",
     "User added without phone: page renders or the form refuses",
     "Admin", "Buyer portal",
     "An admin user on PROCOL DEMO.",
     "None", "New user, phone left blank",
     ['Log in to Procol as the admin', 'Open "Users", click "Add user", fill name and email, leave phone blank, save', 'Open the Users list and the new user'],
     "Either the form refuses with its own message naming the phone field, or the user is created and the Users page and the user's page render. No blank page.",
     "Medium", "Negative", "236727125747", "Proves a missing phone cannot blank the users page.")

# 40
case("USR", "User with no permissions",
     "User with no permissions sees a message, not an endless spinner",
     "User with no team", "Buyer portal",
     "A buyer user on PROCOL DEMO that belongs to no team and has no permissions.",
     "None\nuser: a user removed from every team",
     "–",
     ['Log in to Procol as the user with no permissions', 'Wait 30 seconds on the landing page'],
     "A plain message such as 'You haven't been added to a team yet' (record the exact words) within a few seconds. No endless loading spinner.",
     "Medium", "Negative", "244332629728", "Proves the no-permission state is shown, not spun.")


# ---- build ----------------------------------------------------------------------------------------
def rows():
    counters = {}
    out = []
    for c in C:
        counters[c["mod"]] = counters.get(c["mod"], 0) + 1
        tc = f"RCA-{c['mod']}-{counters[c['mod']]:03d}"
        steps = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(c["steps"]))
        # Configs Needed is read line by line as company settings by the sheet runner; set-up notes
        # (template edits, a PR, an approval workflow, a user) go to Pre-conditions instead.
        settings, notes = [], []
        for line in c["configs"].split("\n"):
            line = line.strip()
            if not line or line == "None":
                continue
            (settings if " = " in line else notes).append(line)
        configs = "\n".join(settings) or "None"
        pre = c["pre"] + (" Set up first: " + "; ".join(notes) + "." if notes else "")
        out.append([tc, MODULES[c["mod"]], c["scenario"], c["title"], c["role"], c["portal"], pre, configs,
                    c["data"], steps, c["expected"], c["priority"], c["ttype"], "Not Run", c["ticket"], c["comment"]])
    return sorted(out, key=lambda r: (r[1], r[0]))


def main():
    rs = rows()
    if "--check" in sys.argv:
        print(len(rs), "cases")
        return
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    wb = Workbook()
    ws = wb.active
    ws.title = "RCA Real Bugs v2"
    ws.append(COLS)
    for r in rs:
        ws.append(r)
    head = PatternFill("solid", fgColor="DDEBF7")
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.fill = head
    widths = [14, 30, 30, 48, 18, 18, 48, 36, 28, 70, 60, 10, 12, 10, 26, 48]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(wrap_text=True, vertical="top")
    ws.freeze_panes = "A2"
    # Summary tab
    s = wb.create_sheet("Summary")
    s.append(["Module", "Cases", "Regression", "Negative", "Observation", "High+", "Needs set-up first"])
    for mod, name in MODULES.items():
        mine = [c for c in C if c["mod"] == mod]
        s.append([name, len(mine), sum(c["ttype"] == "Regression" for c in mine), sum(c["ttype"] == "Negative" for c in mine),
                  sum(c["ttype"] == "Observation" for c in mine), sum(c["priority"] in ("Critical", "High") for c in mine),
                  sum(c["configs"] != "None" for c in mine)])
    s.append(["Total", len(C), sum(c["ttype"] == "Regression" for c in C), sum(c["ttype"] == "Negative" for c in C),
              sum(c["ttype"] == "Observation" for c in C), sum(c["priority"] in ("Critical", "High") for c in C),
              sum(c["configs"] != "None" for c in C)])
    for cell in s[1]:
        cell.font = Font(bold=True)
    # Open questions tab
    q = wb.create_sheet("Open questions")
    q.append(["#", "Question", "Cases it blocks"])
    by_ticket = {r[14]: r[0] for r in rs}
    tpl = ", ".join(r[0] for r in rs if "template:" in r[6])
    for i, (question, tickets) in enumerate([
        ("Does PROCOL DEMO have a PR line to build an auction from, or must one be pushed first?", ["321546321599+322191169265"]),
        ("Which approval workflow on DEMO has one approver on proposals and one on technical evaluation?", ["329423982297", "216852669122+327273032381"]),
        ("Tie at L1: what rule does product want (shared L1, or first-come)?", ["198696749791"]),
        ("Vendor added to the RFQ stage only: is quoting without a technical submission intended?", ["326474193600+218937874132"]),
        ("Templates to edit in Admin before the run: who edits them and when are they reverted?", None),
    ], 1):
        q.append([i, question, tpl if tickets is None else ", ".join(by_ticket[t] for t in tickets)])
    for cell in q[1]:
        cell.font = Font(bold=True)
    q.column_dimensions["B"].width = 90
    q.column_dimensions["C"].width = 30
    wb.save(OUT)
    print(f"{len(rs)} cases → {OUT}")


if __name__ == "__main__":
    main()
