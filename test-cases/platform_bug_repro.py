"""'How to reproduce' tab for the platform bug hunt: one row per bug with the client, the environment, the login,
the exact record, the screen path, steps, expected / actual and — when the bug is only reachable through the API —
the exact request (bug-hunt/requests.json). Used by build-platform-bug-hunt.py."""
import json
import os

from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

HERE = os.path.dirname(os.path.abspath(__file__))
REQ = json.load(open(os.path.join(HERE, "bug-hunt", "requests.json")))

CONSOLE = "Buyer console https://cpanel.ag-ri.in (UAT)"
VENDOR = "Vendor portal https://vendor-app.ag-ri.in (UAT)"
API = "UAT API https://sec-api-v1.ag-ri.in/api (Postman / curl with the buyer's or vendor's access-token)"
DEMO = ("PROCOL DEMO", 198678)
BUYER = "The client's buyer login (PROCOL DEMO: Procol Support, super admin). Codes come from the UAT login rule — never shared here."
QA_VENDOR = "QA test vendor login qa_…@example.com (QA_Platform Vendor 1/2/3/4 of PROCOL DEMO)"


def req(key):
    r = REQ.get(key) or {}
    if not r:
        return ""
    body = r.get("body")
    return f"{r.get('method')} {r.get('path')}" + (f"\nBody: {json.dumps(body)[:1500]}" if body not in (None, {}) else "")


ROWS = [
    {"id": "PB-01", "client": "Amity University", "cid": 55379, "where": CONSOLE, "login": "Amity buyer login",
     "record": "RFX-971 · award proposal 15171 · PO order 24352 (line 47716) · PR-162 line 207022. Live repro: PROCOL DEMO RFX-21249 · proposal 15192 · order 24356",
     "screen": "Project → Master QCS → Start awarding → Award → Approvals → PO",
     "steps": "1. Create an RFQ of 10 units (from a PR or directly) and publish.\n2. A vendor bids for all 10.\n3. Master QCS → Start awarding → give the vendor 4 of the 10 → submit the proposal.\n4. Approve the proposal (every step).\n5. Open the PO created for the vendor; open the PR line.",
     "expected": "PO line = 4 units; PR line keeps 6 open.", "actual": "PO line = 10 units (₹1,070 instead of ₹428); PR line shows 1000 of 1000 closed (RFX-971).",
     "other": "Also Amity RFX-959 (60→100), RFX-929 (50→100); PROCOL DEMO RFX-9250 (4→8); M3M NOIDA RFX-137 (11→1234); Grasim RFX-2863 over-award 550→301."},
    {"id": "PB-02", "client": "Gulbrandsen", "cid": 50169, "where": CONSOLE + " + " + VENDOR, "login": "Gulbrandsen buyer login; vendor BHALLA CHEMICAL WORKS",
     "record": "RFX-435 · vendor bid line 576656 (₹10) → counter offer 69959 (₹20) → bid line 576657 (₹20)",
     "screen": "Project → RFQ → Responses → Counter Offer",
     "steps": "1. Open an RFQ where a vendor quoted ₹10/Nos.\n2. Click Counter Offer and enter ₹20/Nos; send.\n3. As the vendor, accept.\n4. Back on Responses read the price and Total.",
     "expected": "The buyer cannot ask more than the vendor quoted (or gets a warning).", "actual": "₹20/Nos accepted; Total ₹450 → ₹900; tag 'Counter Offer Accepted Bid'.",
     "other": "Setting 'Allow price reversal in RFQ counter offer' (allow_price_reversal_in_counter_offer_in_rfq) is ON by default; with it OFF the backend refuses (error 300)."},
    {"id": "PB-03", "client": "PROCOL DEMO (also Blue Star, M3M NOIDA, DLF, Grasim, Gulbrandsen, Amity…)", "cid": 198678, "where": CONSOLE, "login": BUYER,
     "record": "Products 1763459 'MS PIPE CLASS - C(nbsp) - 100MM', 1763403 'MS Pipe – 40 x 40x 2.5mm', 1760495 'MDB – 2 Club-2'",
     "screen": "Products (search box) and Create event → Add line item → product search",
     "steps": "1. Products → search: MS PIPE CLASS - C - 100MM (normal spaces).\n2. Search: MS Pipe - 40 x 40x 2.5mm (normal '-').\n3. Create event → add line item → search the same two texts.",
     "expected": "Both products are found.", "actual": "Nothing found anywhere; found only when the hidden space / '–' is typed.",
     "other": "Counts (active products): PROCOL DEMO 74 hidden spaces, 60 '–', 649 tab/line break, 558 double space; Blue Star 315 / 49 / 2 / 4,576."},
    {"id": "PB-04", "client": "PROCOL DEMO (all clients)", "cid": 198678, "where": CONSOLE, "login": BUYER, "record": "Product 1760495 'MDB – 2 Club-2'",
     "screen": "Products list", "steps": "1. Products → search MDB.\n2. Read the name in the list.\n3. Create event → line item → search MDB and compare.",
     "expected": "Name shown exactly as saved.", "actual": "List shows 'Mdb – 2 Club-2'; event search shows 'MDB – 2 Club-2'. '30mA'→'30ma', '100MM'→'100mm'.", "other": ""},
    {"id": "PB-05", "client": DEMO[0], "cid": DEMO[1], "where": API + " (vendor token)", "login": "QA vendor 3 (NOT invited to the event)",
     "record": "RFX-21202 (event Z0ROY1Fk)", "screen": "Not reachable from the screens — server rule",
     "steps": "1. Buyer creates and publishes an RFQ inviting QA vendors 1 and 2 only.\n2. Sign in as QA vendor 3 and send the request in the API column with its own company.\n3. Open Responses as the buyer.",
     "expected": "Refused: vendor not invited.", "actual": "HTTP 200 — the bid is saved and listed.", "api": req("M13.15")},
    {"id": "PB-06", "client": DEMO[0], "cid": DEMO[1], "where": CONSOLE + " / " + API, "login": BUYER, "record": "RFX-21187 (event UWRrY1FY)",
     "screen": "Responses → Add bid on behalf (surrogate)",
     "steps": "1. RFQ inviting QA vendors 1–3.\n2. Add a bid on behalf of QA vendor 4 (a company vendor, not invited) and submit.",
     "expected": "Refused: vendor not invited.", "actual": "HTTP 200 — surrogate bid saved.", "api": req("M5.16")},
    {"id": "PB-07", "client": DEMO[0], "cid": DEMO[1], "where": CONSOLE + " / " + API, "login": BUYER, "record": "RFX-21195 (event Z1pOY1Fk)",
     "screen": "Project with Technical + RFQ rounds → RFQ Responses → Add bid on behalf",
     "steps": "1. Project with a Technical round then an RFQ round; invite QA vendors 1, 2.\n2. Only vendor 1 answers the technical round.\n3. In the RFQ round add a bid on behalf of vendor 2 with a price.",
     "expected": "Refused like the vendor's own bid (code 737).", "actual": "HTTP 200 — price saved for vendor 2.", "api": req("M4.5")},
    {"id": "PB-08", "client": DEMO[0], "cid": DEMO[1], "where": API + " (vendor token)", "login": "QA vendor 2 (not asked)", "record": "RFX-21197 (event Z2NwY1Fk)",
     "screen": "Vendor portal hides it; server accepts",
     "steps": "1. RFQ with QA vendors 1, 2; both bid; bidding closes.\n2. Ask vendor 1 for a cost breakdown.\n3. As vendor 2 send the request in the API column during that window.",
     "expected": "Refused: only vendor 1 may submit.", "actual": "HTTP 200 — vendor 2's change saved.", "api": req("M10.26")},
    {"id": "PB-09", "client": DEMO[0], "cid": DEMO[1], "where": API + " (vendor token)", "login": "QA vendor 2 (not asked)", "record": "RFX-21199 (event Z2tEY1Fk)",
     "screen": "Vendor portal hides it; server accepts",
     "steps": "1. RFQ with QA vendors 1, 2; both bid; bidding closes.\n2. Ask vendor 1 for its best price.\n3. As vendor 2 send the request in the API column while the window is open.",
     "expected": "Refused.", "actual": "HTTP 200 — vendor 2's revised bid saved.", "api": req("M11.15")},
    {"id": "PB-10", "client": DEMO[0], "cid": DEMO[1], "where": VENDOR + " / " + API, "login": "QA vendor 1", "record": "RFX-21202 (event Z0ROY1Fk)",
     "screen": "Vendor portal → event → Decline (with reason) → then bid",
     "steps": "1. RFQ inviting QA vendor 1.\n2. Vendor 1 declines with a reason.\n3. Vendor 1 submits a bid of ₹3,000 (request in the API column).",
     "expected": "Refused after declining.", "actual": "HTTP 200 — bid saved.", "api": req("M13.9")},
    {"id": "PB-11", "client": DEMO[0], "cid": DEMO[1], "where": CONSOLE, "login": BUYER, "record": "RFX-21190 (event Z2daY1Fk)",
     "screen": "Event → Settings → Extend Submission Time",
     "steps": "1. RFQ; a vendor bids.\n2. Start awarding and submit the proposal.\n3. Settings → Extend Submission Time → 10 minutes → OK.",
     "expected": "Refused with the real reason (a proposal exists).", "actual": "'You cannot edit rfq once the auction is created.' (code 769) — there is no auction.", "api": req("M7.27")},
    {"id": "PB-12", "client": DEMO[0], "cid": DEMO[1], "where": VENDOR + " + browser DevTools → Network", "login": "QA vendor 1",
     "record": "RFX-21204 / 21205 / 21210 (integrity events); live check event RFX-21388 (vendor 1 ₹111, vendor 2 ₹97)",
     "screen": "Vendor portal → event → bid sheet",
     "steps": "1. RFQ with 2+ vendors bidding different prices.\n2. Sign in as vendor 1, open the event.\n3. DevTools → Network → the event data call (/trade/<id>?response_type=template… or /v1/trade/<id>/schema…).\n4. Search the answer for prices_hash.",
     "expected": "Only vendor 1's own prices.", "actual": "prices_hash lists vendor 2's and vendor 3's unit prices, keyed by company id.",
     "api": "GET /trade/<stage uuid>?response_type=template&additional_fields=order_details  (vendor token)\nGET /v1/trade/<stage uuid>/schema?response_type=template&additional_fields=order_details  (vendor token)"},
    {"id": "PB-13", "client": DEMO[0] + " (also GMMCO RFX-2940)", "cid": DEMO[1], "where": VENDOR, "login": "QA vendor 4",
     "record": "RFX-21205, RFX-21206; GMMCO LIMITED (47053) RFX-2940 bid lines with −345 / −234",
     "screen": "Vendor portal → bid sheet with discount on the total",
     "steps": "1. RFQ using a template with charges, a discount and tax on the bid total.\n2. Vendor enters a discount above 100% and submits.\n3. Buyer opens Responses.",
     "expected": "Refused: discount over 100% / negative total.", "actual": "Accepted; bid total −₹6,503.28, ranks L1.", "other": ""},
    {"id": "PB-14", "client": DEMO[0], "cid": DEMO[1], "where": CONSOLE, "login": BUYER, "record": "RFX-21184 · proposal ZGdETnA=",
     "screen": "Approvals → award proposal page → Participants", "steps": "1. Open RFX-21184's award proposal.\n2. Scroll to Participants.",
     "expected": "S No. 1, 2, 3.", "actual": "S No. 'NaN' on all three rows.", "other": ""},
    {"id": "PB-15", "client": DEMO[0], "cid": DEMO[1], "where": CONSOLE, "login": BUYER, "record": "RFX-21184 (RFQ-25035)",
     "screen": "Project → RFQ → Price Trends", "steps": "1. Open RFX-21184 → RFQ → Price Trends.\n2. Read the chart, its legend and the table.",
     "expected": "One unit per line; product name as saved.", "actual": "₹100/M3 and ₹129/KG on one line; legend 'Aac Block 600x250x150 Mm (variant 1)'.", "other": ""},
    {"id": "PB-16", "client": DEMO[0], "cid": DEMO[1], "where": API + " (buyer token)", "login": BUYER, "record": "Draft RFX-21386 (quantity −5 Nos)",
     "screen": "Event create (the screen blocks it; bulk/API create does not)",
     "steps": "1. Send the request in the API column (line item quantity −5).\n2. Open the draft in the console.",
     "expected": "Refused: quantity must be a positive number with a unit.", "actual": "HTTP 200; draft saved with −5 Nos. Same with 'abc' and with no unit.",
     "api": req("API-EG-015") + "\n\n" + req("API-EG-016") + "\n\n" + req("API-EG-017")},
    {"id": "PB-17", "client": DEMO[0], "cid": DEMO[1], "where": API + " (buyer token)", "login": BUYER, "record": "—",
     "screen": "Event create", "steps": "Send the request in the API column (a product id that does not exist / a status that is not a status).",
     "expected": "422 with 'Product not found' / 'Invalid status'.", "actual": "HTTP 500 Internal Server Error.", "api": req("API-EG-013") + "\n\n" + req("EDGE-CRT-001")},
    {"id": "PB-18", "client": DEMO[0], "cid": DEMO[1], "where": API + " (buyer token)", "login": BUYER, "record": "—",
     "screen": "Add round (technical / RFQ / auction)", "steps": "Send the request in the API column (a technical round with no forms).",
     "expected": "422 naming the missing setting.", "actual": "HTTP 500. 28 such inputs (see the bug's QA comment).", "api": req("EDGE-STG-072")},
    {"id": "PB-19", "client": DEMO[0], "cid": DEMO[1], "where": API + " (buyer token)", "login": BUYER, "record": "PR list of PROCOL DEMO",
     "screen": "Purchase requests list (screen sends one status per tab)",
     "steps": "1. GET the PR list with status ['active'] → 200 (24 rows).\n2. GET it with ['active','in_progress'] → 500.",
     "expected": "Rows for both statuses.", "actual": "HTTP 500 for any two statuses together.", "api": req("EDGE-DPRE-072") + "\n\n" + req("EDGE-DLST-009")},
    {"id": "PB-20", "client": DEMO[0], "cid": DEMO[1], "where": API + " (buyer token)", "login": BUYER, "record": "—",
     "screen": "Lots / leaderboard / auction report of a missing event", "steps": "Send the requests in the API column (ids that do not exist).",
     "expected": "404 / 'not found'.", "actual": "HTTP 500.", "api": req("EDGE-DAMD-069") + "\n\n" + req("EDGE-DQCS-053")},
    {"id": "PB-21", "client": DEMO[0], "cid": DEMO[1], "where": API, "login": "Vendor or buyer", "record": "—",
     "screen": "Counter offer accept / withdraw, approvals bulk resolve", "steps": "Send the request in the API column (requests as one object, not a list).",
     "expected": "422 'invalid request'.", "actual": "HTTP 500.", "api": req("EDGE-DNEG-042")},
    {"id": "PB-22", "client": DEMO[0], "cid": DEMO[1], "where": CONSOLE + " + " + VENDOR, "login": BUYER + " / QA vendor 1",
     "record": "RFX-21397 (sent after end) · RFX-21394 / counter offer 69997 (vendor accept after end refused) · control RFX-21396 / 69998 (accepted while open)",
     "screen": "Responses → Counter Offer (after the bid end)",
     "steps": "1. RFQ with a 3-minute window; QA vendor 1 bids.\n2. Wait until the bid end has passed.\n3. Buyer: Responses → Counter Offer → ₹48 → send.\n4. Vendor: open the counter offer → Accept.",
     "expected": "Step 3 refused (rule: no counter offer after the bid end).", "actual": "Step 3 accepted; step 4 refused with 'Order not active' — the counter offer can never be accepted.",
     "api": "PATCH /additional_request/resolve_additional_request  (vendor token)\nBody: {\"item_type\":\"counter_offer_for_bid\",\"requests\":[{\"uuid\":\"<counter offer uuid>\"}],\"resolution\":\"accepted\",\"resolution_remarks\":\"…\"}"},
    {"id": "PB-23", "client": DEMO[0], "cid": DEMO[1], "where": VENDOR + " / " + API, "login": "QA vendor 1", "record": "RFX-21394 (69997); RFX-21391 / 21393 (69995 / 69996)",
     "screen": "Vendor portal → counter offer → Accept",
     "steps": "1. Accept a counter offer after the bid end → read the message.\n2. Send the accept request without \"resolution\" → read the answer and the counter offer's status.",
     "expected": "1. 'Bidding has ended…'. 2. Refused.", "actual": "1. 'Order not active'. 2. success: true, the counter offer stays pending.",
     "api": "PATCH /additional_request/resolve_additional_request\nBody without \"resolution\": {\"item_type\":\"counter_offer_for_bid\",\"requests\":[{\"uuid\":\"<id>\",\"resolution\":\"accepted\"}]}"},
    {"id": "PB-24", "client": "M/s Moon Beverages Ltd. (also Grasim, SLR, Laxmi, AABL, Saatvik)", "cid": 39490, "where": CONSOLE, "login": "Moon Beverages buyer login",
     "record": "RFX-4474 · PO order 22301 · line 44806 (awarded 50 of 100 at ₹288). Grasim (32836) RFX-2859 · order 21419 · line 41321 (700 on a bid of 456 at ₹567)",
     "screen": "Award → approve → Orders / PO details",
     "steps": "1. RFQ of 100 units; a vendor bids ₹288 for 100.\n2. Award 50 to the vendor; approve.\n3. Open the PO: read the line quantity, the line amount and the header quantity.",
     "expected": "Line 50 units, ₹14,400; header 50 units, ₹14,400.", "actual": "Line 50 units but ₹28,800; header 100 units, ₹28,800.",
     "other": "84 of 104 PO lines (since July) whose quantity differs from the bid keep the bid quantity's amount."},
    {"id": "PB-25", "client": "M3M NOIDA (also Jindal; PROCOL DEMO for the 1970 end time)", "cid": 43569, "where": CONSOLE, "login": "M3M NOIDA buyer login",
     "record": "M3M RFX-383.1 (round 114077), RFX-383.2 (114481), RFX-457.2 (118248), RFX-679.2 (132959); Jindal (54986) RFX-2189.1 (132036); PROCOL DEMO RFX-15377 / 15420 / 20370",
     "screen": "Project → Create New Version → the version's technical round",
     "steps": "1. Open M3M RFX-679 (or any event with a technical round) and create a new version; publish it.\n2. Open the new version's technical round and read the end time / timer.",
     "expected": "A real end time after the start.", "actual": "Round is active with end time 0 (1 Jan 1970) in the data.",
     "other": "Seen in data only; confirm on screen."},
    {"id": "PB-26", "client": "Saint Gobain Gyproc / M3M NOIDA / Blue Star (any client using intake → PR)", "cid": 68628, "where": CONSOLE, "login": "Buyer of the client (read-only) or PROCOL DEMO buyer for a fresh run",
     "record": "Saint Gobain Gyproc PR-130 line 203691 (PO #23827, RFX-55); M3M NOIDA (43569) PR-102 line 201666 (RFX-535), PR-47 line 195302 (RFX-494); Blue Star (41533) PR-2099 line 207037 (RFX-1212, PO #24355)",
     "screen": "Purchase Requests → the PR → line → Closed / Open quantity",
     "steps": "1. Open PR-130 on Saint Gobain Gyproc.\n2. Read the line: requested 10, closed quantity.\n3. Open the PO from RFX-55: quantity 10.\nFresh run: intake request (qty 10) → PR → event → award → PO for 10 → open the PR line.",
     "expected": "Closed 10 (= PO quantity), Open 0.", "actual": "Closed 20 (double). M3M PR-47: PO 10 → Closed 20, Open too small.",
     "other": "95 of 314 intake PR lines with a PO over-closed (78 exactly double) vs 35/701 for non-intake PRs."},
    {"id": "PB-27", "client": "M3M NOIDA (also Bajaj Energy, Gulbrandsen, Saatvik, Indospace, Blue Star, Crompton, SLR Metaliks)", "cid": 43569, "where": CONSOLE, "login": "M3M NOIDA buyer login (read-only)",
     "record": "M3M PO 24321 (RFX-688); Bajaj Energy (40493) PO 24345 (RFX-2587); Gulbrandsen (50169) PO 22182 (RFX-320); Indospace (65415) PO 22276 (RFX-5)",
     "screen": "Purchase Orders → the PO → PO number / status (also PO PDF and email)",
     "steps": "1. Open Purchase Orders on M3M NOIDA.\n2. Open the PO of RFX-688.\n3. Read PO number and status.",
     "expected": "Real PO number; if the ERP said error, PO shown as failed with the reason.", "actual": "PO number = ERP error JSON ('No instance of object type PurchaseOrder has been created…'); status Generated.",
     "other": "46 POs on 9 clients in 180 days; Grasim has 15 POs numbered '#       1'."},
    {"id": "PB-28", "client": "PROCOL DEMO (also Moon Beverages, AppSecure, Gulbrandsen, Simpolo, Jindal Steel Dev)", "cid": 198678, "where": CONSOLE, "login": "PROCOL DEMO buyer",
     "record": "PROCOL DEMO events 99317 & 99318 both RFX-21437 (RFX-21436 missing), 18 Nov; Moon (39490) RFX-4731 = 77900 & 77901; AppSecure (50198) RFX-1749 = 94716 & 94717",
     "screen": "Projects list → search the RFX number",
     "steps": "1. Create two events at the same moment (two tabs clicking Create together, or send POST /event_groups 8 times at once).\n2. Search the Projects list for the RFX number of each.",
     "expected": "Each event has its own RFX number.", "actual": "Two events share one RFX number; the number before it is skipped.",
     "api": "POST /event_groups on https://sec-api-v1.ag-ri.in/api (the normal create-draft body, buyer access-token) sent 8 times in parallel; read the ref_id (RFX number) of each.",
     "other": "Number = count of the company's events at commit time (EventGroup#add_ref_id); no unique index."},
    {"id": "PB-29", "client": "PROCOL DEMO (also M3M NOIDA in data)", "cid": 198678, "where": CONSOLE, "login": "PROCOL DEMO buyer",
     "record": "PROCOL DEMO RFX-21441 → events 99324 & 99325 both live 'RFX-21441.1' (18 Nov); M3M (43569) RFX-571.1 = 84281/84282/84325, RFX-598.3 = 85784/85857",
     "screen": "Project → Create New Version (twice quickly) → publish both → Projects list search 'RFX-N.1'",
     "steps": "1. Open a live event on PROCOL DEMO.\n2. Click Create New Version twice quickly (or two tabs at once).\n3. Publish both copies.\n4. Search the Projects list for RFX-N.1.",
     "expected": "One version; second request refused / same draft; failed publish does not go live.", "actual": "Two live events named RFX-N.1; the second publish answers HTTP 500 but is live.",
     "api": "POST /item_versions {item_uuid: <event uuid>, item_type: 'EventGroup'} twice in parallel → PATCH /event_groups/<each new uuid> {status: 'active', draft_trade_request_uuids, audience_company_uuids, amendment_remarks: {remarks}} on https://sec-api-v1.ag-ri.in/api",
     "other": "Versioning the original after its version is published is refused (correct)."},
    {"id": "PB-30", "client": "PROCOL DEMO", "cid": 198678, "where": CONSOLE, "login": "PROCOL DEMO buyer",
     "record": "RFX-21443 (proposal 15210, approval request 35017); withdraw wording on RFX-21439",
     "screen": "Project → Award → Submit for approval (double-click)",
     "steps": "1. Open a closed event with one bid on PROCOL DEMO.\n2. Award the line, choose the workflow.\n3. Double-click Submit.",
     "expected": "One success; the second click refused with 'already submitted'.", "actual": "Second click: HTTP 500 'Internal Server Error' (award did go through).",
     "api": "POST /proposal/<proposal uuid>/submit {approval_flow_uuid, attachments: [], remarks: {...}, step_uuid_vs_user_uuid: {}} twice in parallel; the same body without step_uuid_vs_user_uuid → 500.",
     "other": "Withdrawn event: vendor sees 'Bid not found' / 'A bid has already been placed from your team'. Approver double-click on the last step of approval 35017 (RFX-21443): POST /approval_workflow/approval_requests/resolve_approval {approver_uuid, resolution: 'accepted'} twice → 500 + 200."},
    {"id": "PB-31", "client": "PROCOL DEMO (target) / Demo Account 2 (acting)", "cid": "198678 / 32461", "where": CONSOLE,
     "login": "Any console user of a DIFFERENT company than the order's buyer (we used the support session switched to Demo Account 2)",
     "record": "Order 13223 (invoice 1158D7, buyer PROCOL DEMO, PO number 'df')",
     "screen": "API only (no screen needed)",
     "steps": "1. Sign in to the console as a user of company A.\n2. Pick an order id of company B and encode it.\n3. PATCH /orders/<encoded id> {po_number: 'TEST'}.\n4. Read company B's PO: the number changed.",
     "expected": "Refused / not found; company B's PO unchanged.", "actual": "HTTP 500 returned, but the PO number was changed (df → df_QA_IDOR; restored).",
     "api": "PATCH https://sec-api-v1.ag-ri.in/api/orders/UVpEZ04%3D  body {\"po_number\": \"df_QA_IDOR\"} (workspace 32461)",
     "other": "POST /orders/update_po_status {agribid_id, status: 'success', po_number} has the same open policy (ERP callback)."},
    {"id": "PB-32", "client": "PROCOL DEMO", "cid": 198678, "where": CONSOLE, "login": "PROCOL DEMO buyer",
     "record": "RFX-21467 (end before start), RFX-21471 (end = start); control RFX-21469; AppSecure (50198) RFX-1895..1898",
     "screen": "Create Event → add pricing round → set times → Publish",
     "steps": "1. Create a draft RFQ with one line item and one vendor.\n2. Set the round's end time before its start time.\n3. Publish.\n4. As the vendor, try to bid.",
     "expected": "Refused: end must be after start (and after now).", "actual": "Published as active but already closed; vendor gets 'Bid could not be placed. Please refresh and try again.' (782).",
     "api": "POST https://sec-api-v1.ag-ri.in/api/trade/template_input?template_name=trade&additional_fields=order_details (pricing round) with bid_start_time = T, bid_end_time = extra_closing_time = T - 600, then PATCH /event_groups/<uuid> publish.",
     "other": "AppSecure: 654 live auction rounds with close time days before creation."},
    {"id": "PB-33", "client": "Any two clients (code finding)", "cid": "—", "where": CONSOLE,
     "login": "(1) a buyer of a company with the PR-to-Order workflow (e.g. Blue Star 41533 test user); (2) any buyer",
     "record": "(1) any PR of another company; (2) an unregistered vendor's technical response (none on UAT yet)",
     "screen": "API only",
     "steps": "1. POST /purchase_requests/<other company's PR id>/create_flexi_order_from_pr.\n2. Check that PR: its lines become completed.\n3. PATCH /template_responses/<other company's response id>/poc_bid {status: 'rejected'}.",
     "expected": "Not found / not allowed.", "actual": "Code has no company check on either (not run live — see QA comment).",
     "api": "POST https://sec-api-v1.ag-ri.in/api/purchase_requests/<id>/create_flexi_order_from_pr ; PATCH https://sec-api-v1.ag-ri.in/api/template_responses/<id>/poc_bid {\"status\": \"approved\"|\"rejected\"}",
     "other": "Same family as PB-31 (orders#update)."},
    {"id": "PB-34", "client": "PROCOL DEMO", "cid": 198678, "where": CONSOLE, "login": "PROCOL DEMO buyer",
     "record": "RFX-21204 (event 99012, round 133890)",
     "screen": "Project → Master QCS → Download",
     "steps": "1. Open an event whose bidding ended on its own.\n2. Master QCS → Download.\n3. Read 'Event Closed At'.",
     "expected": "The time bidding ended.", "actual": "Blank (only filled after an early manual close).",
     "api": "POST https://sec-api-v1.ag-ri.in/api/reports/download_report {\"item_uuid\": \"<event uuid>\", \"item_type\": \"event_group\", \"lot_no\": \"\", \"column_selection\": [], \"report_category\": \"master_qcs_report\"}",
     "other": "15,948 of ~19,000 finished rounds (90 days) stay 'active'."},
    {"id": "PB-35", "client": "PROCOL DEMO", "cid": 198678, "where": CONSOLE, "login": "PROCOL DEMO buyer",
     "record": "RFX-21249 (event 99063, proposal 15192: 4 of 10 KG at ₹107); RFX-19984 (event 96619, proposal 14668)",
     "screen": "Project → Master QCS → Download",
     "steps": "1. Open an awarded event.\n2. Master QCS → Download.\n3. Read Qty Awarded / Awarded Amount / Proposal Value.",
     "expected": "4 KG / ₹428 / ₹428", "actual": "4 KG / blank / blank",
     "api": "POST https://sec-api-v1.ag-ri.in/api/reports/download_report {\"item_uuid\": \"<event uuid>\", \"item_type\": \"event_group\", \"lot_no\": \"\", \"column_selection\": [], \"report_category\": \"master_qcs_report\"}",
     "other": "Report v3 is on for 29 clients (Grasim, M3M, Blue Star, GMMCO, Moon, Gulbrandsen…)."},
    {"id": "PB-36", "client": "PROCOL DEMO", "cid": 198678, "where": CONSOLE, "login": "PROCOL DEMO buyer",
     "record": "Location uuid a2daWk4= (buyer hub 3536: 102 POs, 864 lines); Z0RjY04= (16 vs 13)",
     "screen": "Purchase Orders → Filters → Location",
     "steps": "1. Open Purchase Orders, note the tiles.\n2. Filter Location = a2daWk4=.\n3. Read the tiles and the page count; open page 7.",
     "expected": "102 POs, 6 pages, tiles not above unfiltered.", "actual": "864 POs, 44 pages (7–44 empty), PO Created 4 (unfiltered 2), PO Failed 5 (unfiltered 3).",
     "api": "GET https://sec-api-v1.ag-ri.in/api/purchase_orders?filters=%7B%22buyer_hub_uuids%22%3A%5B%22a2daWk4%3D%22%5D%7D&page=1",
     "other": "Same on the Product filter (joins order lines)."},
    {"id": "PB-37", "client": "PROCOL DEMO (also Blue Star Indirect 68835, Grasim 32836, Jindal 54986)", "cid": 198678, "where": CONSOLE, "login": "PROCOL DEMO buyer",
     "record": "POs 59B903 (12791), D6E19D (12214), 9D2050 (12174), C6A75E (12169); Blue Star Indirect 24328/24307/24306/24289",
     "screen": "Purchase Orders → Filters → PO Amount",
     "steps": "1. Open Purchase Orders, note the total.\n2. Filter PO Amount 0 to a very large number.\n3. Compare the totals; search for 59B903.",
     "expected": "Same total (3,983).", "actual": "3,979; the 4 POs without a saved gross total vanish.",
     "api": "GET https://sec-api-v1.ag-ri.in/api/purchase_orders?filters=%7B%22po_amount%22%3A%7B%22from%22%3A0%2C%22to%22%3A1e15%7D%7D&page=1",
     "other": ""},
]

HEAD = ["Bug ID", "Client", "Client ID", "Where (environment)", "Login to use", "Record (event / PO / ids)", "Screen path",
        "Steps to reproduce", "Expected", "Actual", "Exact request (API-only bugs)", "Also seen"]
WIDTH = [9, 22, 10, 30, 28, 34, 30, 60, 34, 40, 70, 40]


def write_repro_sheet(wb):
    ws = wb.create_sheet("How to reproduce")
    thin = Side(style="thin", color="BFBFBF")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    for i, (h, w) in enumerate(zip(HEAD, WIDTH), 1):
        c = ws.cell(1, i, h)
        c.font, c.fill, c.border = Font(name="Arial", size=11, bold=True), PatternFill("solid", fgColor="4285F4"), border
        c.alignment = Alignment(wrap_text=True, vertical="center")
        ws.column_dimensions[c.column_letter].width = w
    for r, row in enumerate(ROWS, 2):
        vals = [row["id"], row["client"], row["cid"], row["where"], row["login"], row["record"], row["screen"], row["steps"],
                row["expected"], row["actual"], row.get("api", ""), row.get("other", "")]
        for i, v in enumerate(vals, 1):
            c = ws.cell(r, i, v)
            c.font, c.border = Font(name="Arial", size=10, bold=(i == 1)), border
            c.alignment = Alignment(wrap_text=True, vertical="top")
    ws.freeze_panes = "B2"
    return ws
