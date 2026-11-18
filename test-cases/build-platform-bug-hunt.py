"""Platform bug hunt (UAT, from 17 Nov 2026): bugs in the tester's Internal RFX_Bugs layout.

    python3 build-platform-bug-hunt.py   →  Platform_Bug_Hunt.xlsx

Every bug here was read from UAT (read-only SELECT) or run live on PROCOL DEMO, and re-checked before it was added.
"""
import datetime
import os

import openpyxl

from bug_sheet import write_bug_sheet
from platform_bug_repro import write_repro_sheet

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "Platform_Bug_Hunt.xlsx")
SHOTS = "/private/tmp/claude-501/-Users-animesh-Desktop-procol/f9cb15d1-0780-4694-8954-a5a5bc10390e/images"

BUGS = [
    {
        "id": "PB-01",
        "summary": "Partial award is ignored in the PO: the PO is made for the vendor's full bid quantity, not the quantity awarded.",
        "priority": "P0", "blocker": "YES", "dev_type": "BE", "module": "Awarding → PO",
        "feature": "Partial awarding",
        "description": (
            "What happens: the buyer awards a vendor only part of the quantity (Amity RFX-971: 500 of 1000) and the award is approved. "
            "The PO created at the same moment has the vendor's full bid quantity (1000). "
            "The same happens on events made from a PR and on direct events, at almost every client with partial awarding on "
            "(since June: 252 partial awards got the full quantity on the PO, 47 got the right one; November: 0 of 8 right). "
            "Over-awarding has the same problem (Grasim RFX-2863: awarded 550, PO 301). "
            "It also closes the whole PR line: PR-162's line shows 1000 of 1000 closed, so the 500 that was not awarded cannot be "
            "sourced again. "
            "Expected behavior: the PO line has exactly the awarded quantity (500) and the PR line keeps 500 open. "
            "Why it matters: the company orders and pays for more than it decided to buy, and the rest of the PR is lost."
        ),
        "steps": [
            "Log in as a buyer of a company with partial awarding on (e.g. Amity University or PROCOL DEMO).",
            "Create an RFQ with one line item of 1000 units (from a PR or directly) and publish it.",
            "Let a vendor bid for the full 1000.",
            "Open Master QCS → start awarding → award this vendor 500 of the 1000 and submit the proposal.",
            "Approve the proposal.",
            "Open the PO created for the vendor and read the quantity on the line.",
        ],
        "qa_comment": (
            "UAT. Amity University (55379) RFX-971: proposal 15171 awards 500, PO order 24352 line 47716 = 1000. "
            "Also Amity RFX-959 (60→100), RFX-929 (50→100); PROCOL DEMO RFX-9250 (4→8); M3M NOIDA RFX-137 (11→1234). "
            "Where the PO was right, the awarded quantity had been copied onto the vendor's bid line; where it was wrong it had not "
            "(the PO takes its quantity from the bid line). The template setting 'awarded quantity widget keys' is not involved. "
            "REPRODUCED LIVE 17 Nov 2026 on a fresh PROCOL DEMO event RFX-21249: 10 KG, QA vendor bid 10 at ₹107; proposal 15192 "
            "awarded 4 KG (₹428), approved (both steps); PO order 24356 created with 10 KG, ₹1,070."
        ),
    },
    {
        "id": "PB-02",
        "summary": "Buyer can send a counter offer above the vendor's own price, and the vendor's price goes up (₹10 → ₹20).",
        "priority": "P1", "blocker": "NO", "dev_type": "PRODUCT GAP", "module": "Responses → Counter offer",
        "feature": "Counter offer",
        "description": (
            "What happens: on an RFQ the vendor quoted ₹10/Nos; the buyer sent a counter offer of ₹20/Nos; the vendor accepted, "
            "and the bid now shows ₹20/Nos, Rank 1, Total ₹900 for 45 Nos (before: ₹450). "
            "Expected behavior: a buyer's counter offer on a purchase RFQ should not ask a higher price than the vendor quoted, "
            "or the screen should at least warn before sending it. "
            "Why it matters: one typo makes the company pay double, and nothing stops it. "
            "Note: this follows the setting 'Allow price reversal in RFQ counter offer', which is ON by default (and on this event); "
            "with it OFF the backend refuses it. Product to decide whether ON is the right default."
        ),
        "steps": [
            "Log in as a buyer of Gulbrandsen on UAT.",
            "Open RFX-435 → Responses.",
            "Vendor BHALLA CHEMICAL WORKS quoted ₹10/Nos for 'Absolute Pressure Tr-321- On V-301' (45 Nos).",
            "Click Counter Offer and enter ₹20/Nos; send it.",
            "As the vendor, accept the counter offer.",
            "Back on Responses: the bid shows ₹20/Nos, Total ₹900, tag 'Counter Offer Accepted Bid'.",
        ],
        "qa_comment": (
            "UAT Gulbrandsen (50169) RFX-435: bid line 576656 ₹10 → counter offer request 69959 (price 20, counter_offer_for_bid) "
            "accepted → bid line 576657 ₹20. Event config allow_price_reversal_in_counter_offer_in_rfq = true (master default true)."
        ),
        "shots": [os.path.join(SHOTS, "3.webp")],
    },
    {
        "id": "PB-03",
        "summary": "Products whose name has a hidden character (Excel space, '–' dash, tab) cannot be found by typing their name.",
        "priority": "P1", "blocker": "NO", "dev_type": "BE", "module": "Products list + event line-item product search",
        "feature": "Product search",
        "description": (
            "What happens: many product names were saved with characters a person cannot type or see: a non-breaking space "
            "(copied from Excel), a '–' dash instead of '-', a tab or line break, double spaces. Typing the name as it looks finds "
            "nothing, both on the Products page and in the product search when adding a line item to an event. "
            "Example: 'MS PIPE CLASS - C - 100MM' (saved with a non-breaking space) and 'MS Pipe - 40 x 40x 2.5mm' (saved with '–') "
            "return no product. PROCOL DEMO alone has 74 names with a hidden space, 60 with '–', 649 with a tab/line break, "
            "558 with double spaces; Blue Star has 315 / 49 / 2 / 4,576. "
            "Expected behavior: search treats any space as a space and '–' as '-', and names are cleaned when they are saved or uploaded. "
            "Why it matters: buyers cannot find products they know exist, and create duplicates."
        ),
        "steps": [
            "Log in as a buyer of PROCOL DEMO on UAT.",
            "Open Products and search for: MS PIPE CLASS - C - 100MM (typed with normal spaces).",
            "No product is shown, although it exists (category RM-STEEL, active).",
            "Search for: MS Pipe - 40 x 40x 2.5mm (typed with a normal '-').",
            "No product is shown; the product is saved as 'MS Pipe – 40 x 40x 2.5mm'.",
            "Create an event → add a line item → search the same two names in the product box: nothing found either.",
        ],
        "qa_comment": (
            "UAT PROCOL DEMO (198678), checked live through the same calls the screens make (Products: get_all_products search ILIKE; "
            "event line item: products/search). Product 1763459 = 'MS PIPE CLASS - C\\u00a0 - 100MM'; 1763403 = 'MS Pipe – 40 x 40x 2.5mm', "
            "1760495 = 'MDB – 2 Club-2': found only when the special character is typed. "
            "BOQ products (category BOQ) are left out of Products search on purpose; products outside the user's team categories are hidden on purpose."
        ),
    },
    {
        "id": "PB-04",
        "summary": "Products list changes product names: capitals are lowered and spaces merged ('MS PIPE … 100MM' shows as 'Ms Pipe … 100mm', '30mA' as '30ma').",
        "priority": "P2", "blocker": "NO", "dev_type": "BE", "module": "Products list",
        "feature": "Products",
        "description": (
            "What happens: the Products list shows every name re-capitalised word by word: only the first letter of each word stays "
            "a capital and the rest is lowered, and double spaces are merged. 'MDB – 2 Club-2' shows as 'Mdb – 2 Club-2'; "
            "'MS PIPE CLASS - C - 100MM' as 'Ms Pipe Class - C - 100mm'; '20 A DP 30mA 10kA RCBO' as '20 A Dp 30ma 10ka Rcbo'. "
            "The event screens show the real name, so the same product looks different on two screens. "
            "Expected behavior: the Products list shows the name exactly as saved. "
            "Why it matters: codes and units change meaning (mA vs MA, MM), and a buyer comparing names across screens is misled."
        ),
        "steps": [
            "Log in as a buyer of PROCOL DEMO on UAT.",
            "Open Products and search for: MDB (or any product whose name has capitals, e.g. MS PIPE).",
            "Read the name in the list: 'Mdb – 2 Club-2'.",
            "Create an event and search the same product in the line-item product box: it shows 'MDB – 2 Club-2'.",
        ],
        "qa_comment": (
            "UAT PROCOL DEMO (198678): the Products list API returns name 'Mdb – 2 Club-2' for product saved as 'MDB – 2 Club-2' "
            "(backend view _app_product.json.jbuilder: name.split.map(&:capitalize).join(' ')); category names get the same treatment."
        ),
    },
]

# Bidding-rule holes: the screen hides the action, but the server accepts it. Found by the bidding matrix
# (prototype/src/checks/biddingMatrix.ts) on PROCOL DEMO, 17 Nov 2026 16:10–16:35 IST, with the QA vendors only.
MATRIX = "Bidding matrix run 17 Nov 2026 on UAT PROCOL DEMO (198678), QA vendors qa_…@example.com. "
BUGS += [
    {
        "id": "PB-05",
        "summary": "A vendor that was NOT invited can submit its own bid on an event (through the 'bid on behalf' route).",
        "priority": "P0", "blocker": "YES", "dev_type": "BE", "module": "Bidding (vendor)", "user_type": "Vendor",
        "feature": "Bid submission rules",
        "description": (
            "What happens: a vendor company that is not on the event's participant list, signed in as itself, sends a bid to the "
            "server route used for 'bid on behalf' and the bid is accepted (HTTP 200). "
            "Expected behavior: only invited vendors can bid; anyone else is refused. "
            "Why it matters: any vendor who learns an event's id can put a price on it, which breaks a closed sourcing event."
        ),
        "steps": [
            "Buyer of PROCOL DEMO creates and publishes an RFQ, inviting QA vendors 1 and 2 only.",
            "QA vendor 3 (not invited) signs in to the vendor portal.",
            "Vendor 3 submits a bid on that event through POST /bids/template_input (the 'bid on behalf' route).",
            "The bid is accepted and appears on the event.",
        ],
        "qa_comment": MATRIX + "Scenario M13 step 15, RFX-21202 (event Z0ROY1Fk). First seen 1 Oct 2026 — still open.",
    },
    {
        "id": "PB-06",
        "summary": "Buyer can enter a bid on behalf of a vendor that was never invited to the event.",
        "priority": "P1", "blocker": "NO", "dev_type": "BE", "module": "Surrogate bid", "feature": "Surrogate bid",
        "description": (
            "What happens: on a live RFQ the buyer adds a surrogate bid for QA vendor 4, a vendor of the company who was NOT invited "
            "to this event; it is accepted (HTTP 200). "
            "Expected behavior: a surrogate bid is allowed only for an invited participant. "
            "Why it matters: the comparison and the award can include a vendor that was never part of the event."
        ),
        "steps": [
            "Create and publish an RFQ on PROCOL DEMO inviting QA vendors 1–3 only.",
            "Open Responses → add a bid on behalf of a vendor → choose QA vendor 4 (a company vendor, not invited).",
            "Enter a price and submit: the bid is saved.",
        ],
        "qa_comment": MATRIX + "Scenario M5 step 16 (POST /bids/template_input), RFX-21187 (event UWRrY1FY). First seen 1 Oct 2026 — still open.",
    },
    {
        "id": "PB-07",
        "summary": "Buyer can enter a price for a vendor who never answered the technical round.",
        "priority": "P1", "blocker": "NO", "dev_type": "BE", "module": "Surrogate bid (two-round event)", "feature": "Technical + pricing rounds",
        "description": (
            "What happens: in a project with a technical round and then a pricing round, a vendor cannot price without answering the "
            "technical round (refused with code 737), but the buyer's 'bid on behalf' for that vendor is accepted (HTTP 200). "
            "Expected behavior: the same rule applies to a bid on behalf. "
            "Why it matters: a vendor that was never technically qualified can be priced and awarded."
        ),
        "steps": [
            "Create a project with a Technical round and an RFQ round on PROCOL DEMO; invite QA vendors 1 and 2; publish.",
            "QA vendor 1 answers the technical round; QA vendor 2 does not.",
            "When the RFQ round is live, the buyer adds a bid on behalf of QA vendor 2 with a price.",
            "The price is saved, although vendor 2 has no technical response.",
        ],
        "qa_comment": MATRIX + "Scenario M4 step 5, RFX-21195 (event Z1pOY1Fk). First seen 1 Oct 2026 — still open.",
    },
    {
        "id": "PB-08",
        "summary": "A vendor who was not asked for a cost breakdown can still change its bid during the cost-breakdown window.",
        "priority": "P1", "blocker": "NO", "dev_type": "BE", "module": "Cost breakdown window", "user_type": "Vendor",
        "feature": "Bid submission rules",
        "description": (
            "What happens: the buyer opens a cost-breakdown window for one vendor only; another vendor (not asked) submits a changed "
            "bid during that window and it is accepted (HTTP 200). The window is only enforced on the screen. "
            "Expected behavior: only the vendor who was asked can submit during the window. "
            "Why it matters: other vendors can quietly change prices after bidding closed."
        ),
        "steps": [
            "Create and publish an RFQ on PROCOL DEMO with QA vendors 1 and 2; both bid; bidding closes.",
            "Ask QA vendor 1 for a cost breakdown (cost-breakdown window opens for vendor 1 only).",
            "QA vendor 2 submits a changed bid during that window.",
            "The change is saved.",
        ],
        "qa_comment": MATRIX + "Scenario M10 step 26 (PATCH /v1/bids/…), RFX-21197 (event Z2NwY1Fk). New in this run.",
    },
    {
        "id": "PB-09",
        "summary": "When the buyer asks one vendor for its best price, every other vendor can also revise its bid in that window.",
        "priority": "P1", "blocker": "NO", "dev_type": "BE", "module": "Best price request", "user_type": "Vendor",
        "feature": "Bid submission rules",
        "description": (
            "What happens: the buyer asks only vendor A for a best price; vendor B (not asked) submits a revised bid during the "
            "best-price window and it is accepted (HTTP 200). "
            "Expected behavior: only the vendor who was asked can revise. "
            "Why it matters: the negotiation with one vendor reopens bidding for everyone."
        ),
        "steps": [
            "Create and publish an RFQ on PROCOL DEMO with QA vendors 1 and 2; both bid; bidding closes.",
            "Ask QA vendor 1 for its best price.",
            "QA vendor 2 submits a revised bid while the best-price window is open.",
            "The revised bid is saved.",
        ],
        "qa_comment": MATRIX + "Scenario M11 step 15 (PATCH /v1/bids/…), RFX-21199 (event Z2tEY1Fk). First seen 1 Oct 2026 — still open.",
    },
    {
        "id": "PB-10",
        "summary": "A vendor who declined the invitation can still submit a bid.",
        "priority": "P1", "blocker": "NO", "dev_type": "BE", "module": "Invitation decline", "user_type": "Vendor",
        "feature": "Bid submission rules",
        "description": (
            "What happens: QA vendor 1 declines the event invitation (with a reason); afterwards it submits a bid and the bid is "
            "accepted (HTTP 200). "
            "Expected behavior: after declining, the vendor cannot bid (or must first undo the decline). "
            "Why it matters: the buyer sees a vendor as 'declined' while its price is in the comparison."
        ),
        "steps": [
            "Create and publish an RFQ on PROCOL DEMO inviting QA vendor 1.",
            "QA vendor 1 opens the event and declines, giving a reason.",
            "QA vendor 1 submits a bid of ₹3,000.",
            "The bid is accepted and shown on the event.",
        ],
        "qa_comment": MATRIX + "Scenario M13 step 9 (PATCH /v1/bids/…), RFX-21202 (event Z0ROY1Fk). First seen 1 Oct 2026 — still open.",
    },
    {
        "id": "PB-11",
        "summary": "Extending the time after a proposal exists shows 'You cannot edit rfq once the auction is created' on an event with no auction.",
        "priority": "P2", "blocker": "NO", "dev_type": "BE", "module": "Extend Submission Time", "feature": "Error messages",
        "description": (
            "What happens: on an RFQ (no auction) with a submitted award proposal, Extend Submission Time is refused with the message "
            "'You cannot edit rfq once the auction is created.' "
            "Expected behavior: the message says the real reason, e.g. 'The time cannot be extended after an award proposal is submitted.' "
            "Why it matters: the buyer is told about an auction that does not exist and cannot tell what to do."
        ),
        "steps": [
            "Create and publish an RFQ on PROCOL DEMO; let a vendor bid.",
            "Start awarding and submit the award proposal.",
            "Open the event → Settings → Extend Submission Time → extend by 10 minutes.",
            "The message reads 'You cannot edit rfq once the auction is created.'",
        ],
        "qa_comment": MATRIX + "Scenario M7 step 27 (code 769), RFX-21190 (event Z2daY1Fk). The refusal is right; the words are wrong.",
    },
]

# Number integrity (prototype/scripts/run-integrity.ts): independent calculator vs every figure Procol shows.
# 43 checks passed (totals, GST, landed cost, savings, L1, ranks); these failed AND failed again on a second fresh event.
INTEG = "Integrity run 17 Nov 2026 16:33–16:45 IST on UAT PROCOL DEMO (198678), QA vendors only; reproduced on a second fresh event. "
BUGS += [
    {
        "id": "PB-12",
        "summary": "A vendor's own login receives the other vendors' unit prices for every line (competitors' prices leak).",
        "priority": "P0", "blocker": "YES", "dev_type": "BE", "module": "Vendor bidding (event page data)", "user_type": "Vendor",
        "feature": "Vendor data isolation",
        "description": (
            "What happens: while bidding is open, the event data the server sends to a vendor's own login carries a price list for "
            "every line with each competing vendor's unit price, keyed by their company id (QA vendor 1 received QA vendor 2's ₹99.5 "
            "and QA vendor 3's ₹100). Seen for all three vendors, in two different event types, on two fresh events. "
            "Expected behavior: a vendor receives only its own prices (and its rank, if the event shows ranks). "
            "Why it matters: anyone opening the browser's network tab sees the competitors' exact prices and can undercut them; "
            "this breaks a sealed RFQ."
        ),
        "steps": [
            "Create an RFQ on PROCOL DEMO with 2+ line items; invite QA vendors 1, 2 and 3; publish.",
            "All three vendors bid with different prices.",
            "Sign in as QA vendor 1 and open the event (vendor portal); open the browser's developer tools → Network.",
            "Find the event's data call (/trade/<event>?response_type=template … or /v1/trade/<event>/schema …).",
            "In the answer, open line items → meta_data → prices_hash: the other vendors' unit prices are listed.",
        ],
        "qa_comment": INTEG + "RFX-21204 (event Z3BkY1Fk) (S1, trade TlFjRGdj), RFX-21205 (S2), RFX-21210 (S6). Path: sheets.inline_components.data.<vendor>[i].meta_data.prices_hash.<vendor company id>. "
                      "Read with the vendor's own token through the vendor app; whether the vendor portal screen requests this exact URL is still to be watched in its network tab.",
    },
    {
        "id": "PB-13",
        "summary": "A discount above 100% is accepted, so a bid total becomes negative (−₹6,503.28) and the vendor ranks L1.",
        "priority": "P1", "blocker": "NO", "dev_type": "BE", "module": "Bid totals (charges / discount)", "user_type": "Vendor",
        "feature": "Bid validation",
        "description": (
            "What happens: on a template with a discount on the bid total, a vendor enters a discount larger than the amount; "
            "the bid is accepted and the comparison shows a bid total of −6503.275. "
            "Expected behavior: a discount above 100% (or a total below zero) is refused with a clear message. "
            "Why it matters: a negative total is the 'lowest' bid, wins L1 and corrupts savings and award totals."
        ),
        "steps": [
            "Create an RFQ on PROCOL DEMO with a template that has charges, a discount and tax on the bid total; invite QA vendor 4; publish.",
            "As QA vendor 4, bid with a discount larger than the bid amount (e.g. 150%).",
            "The bid is accepted.",
            "Open Responses / comparison as the buyer: the bid total shows −₹6,503.28.",
        ],
        "qa_comment": INTEG + "Scenario S2 probe PROBE-NEG, RFX-21205 (event Z1hnY1Fk) and RFX-21206 (second fresh event). "
                      "Also in real data: GMMCO LIMITED RFX-2940 (9 Sep 2026) has two bid lines saved with negative prices "
                      "(-344.9999999999999 and -233.99999999999994; final price -407.1 / -276.12).",
    },
]

# Screen vs data (procol-ui-tests/tests/crosscheck.spec.ts): every screen of one event compared with the API it was built from.
XCHK = "/Users/animesh/Desktop/procol-gap-wt/procol-ui-tests/findings/crosscheck/2026-11-17T11-20-27-001Z"
BUGS += [
    {
        "id": "PB-14",
        "summary": "Award proposal page: the Participants table shows 'NaN' in the S No. column for every vendor.",
        "priority": "P2", "blocker": "NO", "dev_type": "FE", "module": "Award proposal / approval page", "feature": "Award proposal",
        "description": (
            "What happens: on the award proposal (approval) page, the Participants section lists the three vendors, but the "
            "S No. column reads 'NaN' on every row instead of 1, 2, 3. "
            "Expected behavior: rows are numbered 1, 2, 3 … "
            "Why it matters: the approver sees a broken table on the page they approve from."
        ),
        "steps": [
            "Log in as a buyer of PROCOL DEMO on UAT.",
            "Open RFX-21184 → the award proposal (Approval page).",
            "Scroll to the Participants section.",
            "The S No. column shows 'NaN' for QA_Platform Vendor 1, 2 and 3.",
        ],
        "qa_comment": "UAT PROCOL DEMO, RFX-21184 (bidding-matrix M1 RFX-21184 (event UU5kY1FY), three vendors, split award), proposal ZGdETnA=. "
                      "Read from the page text by the UI vs API cross-check 17 Nov 2026 (case UI-XCHK-PROP-005); API get_audience returns the 3 vendors in order.",
    },
    {
        "id": "PB-15",
        "summary": "Price Trends draws prices in different units on one line (₹100 per M3 next to ₹129 per KG) and renames the product in the legend.",
        "priority": "P2", "blocker": "NO", "dev_type": "FE", "module": "Event → Price Trends tab", "feature": "Price trends",
        "description": (
            "What happens: on an RFQ's Price Trends tab, the chart for 'AAC Block 600x250x150MM (Variant 1)' joins past deals "
            "priced per M3 (₹100/M3) and per KG (₹129/KG) into one line, as if the prices were comparable. The legend also shows "
            "the product as 'Aac Block 600x250x150 Mm (variant 1)' (capitals lowered, a space added). "
            "Expected behavior: only deals in the same unit are compared (or each unit gets its own line), and the product name "
            "is shown exactly as saved. "
            "Why it matters: the buyer reads a price trend that does not exist and may judge a quote against the wrong unit."
        ),
        "steps": [
            "Log in as a buyer of PROCOL DEMO on UAT.",
            "Open RFX-21184 → RFQ → Price Trends.",
            "Look at the chart and the table under it: one deal at ₹100/M3 (10 M3) and another at ₹129/KG (15 KG) on the same line.",
            "Read the legend under the chart: 'Aac Block 600x250x150 Mm (variant 1) (6 deals)'.",
        ],
        "qa_comment": "UAT PROCOL DEMO, RFX-21184 (RFQ-25035), 17 Nov 2026, UI vs API cross-check screenshot.",
        "shots": [XCHK + "/shots/pricetrends@RFQ-25035.png"],
    },
]

# Edge / negative cases (event journey + 756 checks on a second copy of the event, /api/features-run, 17 Nov 2026
# 16:58–17:20 IST, PROCOL DEMO). 98 answered HTTP 500, 8 accepted what they should refuse. Grouped by screen area.
EDGE = "Edge-case run 17 Nov 2026 on UAT PROCOL DEMO (198678), spine.ai features-run 2026-11-17T11-28-19-372Z. "
BUGS += [
    {
        "id": "PB-16",
        "summary": "An event can be saved with a negative quantity (−5), a quantity that is not a number ('abc') or no unit.",
        "priority": "P1", "blocker": "NO", "dev_type": "BE", "module": "Event creation (line items)", "feature": "Event creation validation",
        "description": (
            "What happens: creating an event with a line item quantity of −5, of 'abc', or with no unit is accepted (HTTP 200) "
            "and the draft is saved (RFX-21386 holds quantity −5 Nos). "
            "Expected behavior: a quantity must be a positive number with a unit; anything else is refused with a clear message. "
            "Why it matters: a bad quantity flows into bids, totals, the award and the PO."
        ),
        "steps": [
            "Log in as a buyer of PROCOL DEMO.",
            "Create an event and add a line item with quantity −5 (or 'abc', or leave the unit empty) — through the screen's request or a bulk/API create.",
            "Save the draft: it is accepted.",
            "Open the draft: the line item shows quantity −5 Nos.",
        ],
        "qa_comment": EDGE + "Cases API-EG-015 (−5), API-EG-016 ('abc'), API-EG-017 (no unit): POST /event_groups → 200. Draft RFX-21386 line 368050 quantity {value: −5, unitSymbol: Nos}.",
    },
    {
        "id": "PB-17",
        "summary": "Event creation crashes (server error 500) on a wrong line item or status instead of saying what is wrong.",
        "priority": "P2", "blocker": "NO", "dev_type": "BE", "module": "Event creation", "feature": "Error handling",
        "description": (
            "What happens: creating an event with a product that does not exist, a line item without a product, line items that "
            "are not a list, a status like 'withdrawn' or a number, or an attachment list of plain text returns 'Internal Server "
            "Error' (HTTP 500). 11 such inputs crashed. "
            "Expected behavior: a clear refusal ('Product not found', 'Line items are required', …). "
            "Why it matters: the screen shows a generic error, the buyer cannot tell what to fix, and crashes hide real problems."
        ),
        "steps": [
            "Create an event whose line item points to a product that was deleted (or has no product).",
            "Save: the app shows a generic error; the server answered 500.",
        ],
        "qa_comment": EDGE + "POST /event_groups → 500: API-EG-012, API-EG-013, EVT-LI-005, EDGE-CRT-001/002/003/007/009/015/017/019.",
    },
    {
        "id": "PB-18",
        "summary": "Saving a round (stage) crashes (server error 500) on 28 kinds of incomplete or wrong settings instead of refusing them.",
        "priority": "P2", "blocker": "NO", "dev_type": "BE", "module": "Add / edit round (technical, RFQ, auction)", "feature": "Error handling",
        "description": (
            "What happens: saving a round with, for example, a technical round with no forms or an empty form list, a form without "
            "a name or questions, a template that does not exist, a sheet without columns, a dropdown column without options, a "
            "pricing row without a product or variant, a base currency not among the allowed ones, an auction strategy outside the "
            "list, an extension trigger as text, or a non-date closing time returns 'Internal Server Error' (HTTP 500). "
            "Expected behavior: each is refused with a message naming the missing or wrong setting. "
            "Why it matters: the buyer gets a generic error while setting up an event and cannot see which setting is wrong."
        ),
        "steps": [
            "Create an event on PROCOL DEMO and add a Technical round.",
            "Remove all forms from the round (or leave a form without a name) and save.",
            "The app shows a generic error; the server answered 500.",
        ],
        "qa_comment": EDGE + "POST /trade/template_input → 500 in 28 cases, e.g. EDGE-STG-015/033/035/036/047/055/056/066/067/072/073/074/075/076/085/089/090/095/096/098/099/102/105/109/111/112/116, EDGE-STG-006.",
    },
    {
        "id": "PB-19",
        "summary": "Event, PR and PO lists crash (server error 500) on some filter combinations, e.g. PR list with two statuses.",
        "priority": "P2", "blocker": "NO", "dev_type": "BE", "module": "Lists and filters (events history/drafts/live, PR list, PO list, approvals, reports)", "feature": "Error handling",
        "description": (
            "What happens: the PR list answers 'Internal Server Error' when asked for two statuses at once (Open + In Progress, "
            "Open + Completed) although each status alone works; events History crashes on several filter shapes (status as text, "
            "a number list, an out-of-range date, a search value in quotes); the Drafts and Live lists, PO list (product or "
            "location filter as text), approvals list without a format, versions log and bulk report download crash similarly. "
            "Expected behavior: lists answer with results or a clear 'invalid filter' message. "
            "Why it matters: exports, integrations and saved filters that send such values break with no explanation."
        ),
        "steps": [
            "Log in as a buyer of PROCOL DEMO.",
            "Ask the PR list for status Open and In Progress together (filters={\"status\":[\"active\",\"in_progress\"]}).",
            "The server answers 500; with one status it answers normally (24 / 22 rows).",
        ],
        "qa_comment": EDGE + "GET /purchase_requests (EDGE-DPRE-072/073/074/075, re-checked by hand 17 Nov: two statuses → 500, one → 200); "
                      "GET /event_groups/history (EDGE-DLST-009…015), /event_groups/draft, /event_groups, /orders (EDGE-DLST-105/106), "
                      "/approval_workflow/approval_requests, /versions_log/all, /reports/download_bulk_report. The PR screen sends one status per tab.",
    },
    {
        "id": "PB-20",
        "summary": "Opening a round, lots, leaderboard, report or bid that does not exist crashes (500) instead of 'not found'.",
        "priority": "P3", "blocker": "NO", "dev_type": "BE", "module": "Event pages (lots, leaderboard, auction report, quote details, close bid)", "feature": "Error handling",
        "description": (
            "What happens: asking for a round, event, bid or counter offer id that does not exist (an old link, a deleted item) "
            "returns 'Internal Server Error' on: event lots (get / save draft / reset smart lots), the alternate-bidding leaderboard, "
            "the auction report, quote details, bid details, close bid and its approval flows, counter-offer log, surrogate approval "
            "flows, download event details. "
            "Expected behavior: 'not found' (HTTP 404/422) and a friendly page. "
            "Why it matters: old links and race conditions show a crash page."
        ),
        "steps": [
            "Log in as a buyer of PROCOL DEMO.",
            "Open the lots of an event id that does not exist (e.g. an old or mistyped link).",
            "The server answers 500 instead of 'not found'.",
        ],
        "qa_comment": EDGE + "EDGE-DAMD-069, EDGE-DLOT-004/005, EDGE-DQCS-053/054, EDGE-DAUC-098, EDGE-DAPR-026/031, auction_report, quote_details, get_bid_details, counter_offer_details, download_event_details.",
    },
    {
        "id": "PB-21",
        "summary": "Accepting or withdrawing counter offers, and bulk-approving, crash (500) when the request ids are sent in another shape.",
        "priority": "P3", "blocker": "NO", "dev_type": "BE", "module": "Counter offer / approvals", "feature": "Error handling",
        "description": (
            "What happens: resolve and revoke of counter offers and the approvals bulk resolve answer 'Internal Server Error' when the "
            "ids come as text, numbers or a single object instead of a list of ids. "
            "Expected behavior: a clear 'invalid request' message. "
            "Why it matters: a crash in the counter-offer path leaves the buyer unsure whether the action happened."
        ),
        "steps": [
            "Send 'resolve counter offer' with requests as one object instead of a list.",
            "The server answers 500.",
        ],
        "qa_comment": EDGE + "EDGE-DNEG-042/043 (resolve), revoke ×2, bulk_resolve ids as text.",
    },
]

# Counter offer and the bid end time (tester's rule, 17 Nov: a counter offer must not work after the BID END). Live on PROCOL DEMO.
BUGS += [
    {
        "id": "PB-22",
        "summary": "Buyer can send a counter offer after the bid end time, but the vendor can no longer accept it — a dead counter offer.",
        "priority": "P1", "blocker": "NO", "dev_type": "BE", "module": "Responses → Counter offer", "feature": "Counter offer",
        "description": (
            "What happens: on an RFQ whose bidding ended 2½ minutes earlier, the buyer sends a counter offer (₹53 → ₹48 per KG) "
            "and it is accepted by the app. A vendor who tries to accept a counter offer after the bid end is refused "
            "('Order not active'), so the counter offer can never be accepted. "
            "Expected behavior (rule given by the tester): no counter offer after the bid end — the buyer's Send is refused with a "
            "clear message. "
            "Why it matters: the buyer waits for an answer that can never come, and the vendor sees an offer it cannot act on."
        ),
        "steps": [
            "Create and publish an RFQ on PROCOL DEMO with a short bidding window; invite a QA vendor.",
            "The vendor bids (₹53 per KG for 10 KG).",
            "Wait until the bid end time has passed.",
            "As the buyer, open Responses → Counter Offer on that bid, enter ₹48, send: it is accepted.",
            "As the vendor, try to accept the counter offer: refused with 'Order not active'.",
        ],
        "qa_comment": "UAT PROCOL DEMO 17 Nov 2026. Send after end: RFX-21397 (window closed 17:55:56 IST, counter offer sent after). "
                      "Vendor accept after end refused (422 code 33 'Order not active'): RFX-21394, counter offer 69997. "
                      "Control — vendor accepts while open: RFX-21396, counter offer 69998 accepted. Data: no counter offer in 120 days was "
                      "accepted after its event's bid end.",
    },
    {
        "id": "PB-23",
        "summary": "Unclear answers on counter offers: after the bid end the vendor is told 'Order not active'; an accept with no decision says 'success' and does nothing.",
        "priority": "P3", "blocker": "NO", "dev_type": "BE", "module": "Counter offer (vendor)", "user_type": "Vendor", "feature": "Error messages",
        "description": (
            "What happens: (1) a vendor accepting a counter offer after the bid end gets 'Order not active' — it does not say that "
            "bidding has ended; (2) a resolve request without the accept/reject decision answers success: true but changes nothing "
            "(the counter offer stays pending). "
            "Expected behavior: (1) 'Bidding has ended — this counter offer can no longer be accepted'; (2) refuse a request without a decision. "
            "Why it matters: the vendor does not understand why its action failed, or believes it succeeded when it did not."
        ),
        "steps": [
            "Create an RFQ on PROCOL DEMO; a QA vendor bids; the buyer sends a counter offer while bidding is open.",
            "Wait for the bid end; as the vendor, accept the counter offer: the message is 'Order not active'.",
        ],
        "qa_comment": "UAT PROCOL DEMO 17 Nov 2026: RFX-21394 (counter offer 69997, 422 code 33). No-decision accept: RFX-21391/21393 "
                      "(counter offers 69995/69996 answered success: true and stayed 'requested').",
    },
]

BUGS += [
    {
        "id": "PB-24",
        "summary": "When the PO quantity does follow the award, the PO amount does not: 50 units are charged as 100 (₹28,800 instead of ₹14,400).",
        "priority": "P0", "blocker": "YES", "dev_type": "BE", "module": "Awarding → PO (amounts)", "feature": "Partial / over awarding",
        "description": (
            "What happens: in the cases where the awarded quantity does reach the PO line (the other side of PB-01), the line amount "
            "is still the full bid's amount. Moon Beverages RFX-4474: 50 of 100 awarded at ₹288 → PO line 50 units, amount ₹28,800 "
            "(the price of 100); the PO header still says 100 units and ₹28,800. Grasim RFX-2859 (over-award): 700 awarded on a bid "
            "of 456 at ₹567 → PO line 700 units, amount ₹2,58,552 (the price of 456). Since mid-July, 84 of 104 PO lines whose "
            "quantity differs from the bid still carry the bid quantity's amount (Grasim 39, Moon 30, SLR 7, Laxmi 5, AABL 2, Saatvik 1). "
            "Expected behavior: PO line amount = awarded quantity × price (₹14,400; ₹3,96,900) and the header agrees with its lines. "
            "Why it matters: the PO sent to the vendor/ERP has a quantity and an amount that contradict each other."
        ),
        "steps": [
            "Log in as a buyer of a company with partial awarding (e.g. Moon Beverages).",
            "Create an RFQ of 100 units; a vendor bids ₹288 for 100.",
            "Award the vendor 50 and approve.",
            "Open the PO: line quantity 50, amount ₹28,800; header quantity 100.",
        ],
        "qa_comment": "UAT (read-only check, 17 Nov 2026). Moon Beverages (39490) RFX-4474 order 22301 line 44806; RFX-4166 order 21650 "
                      "(1 of 2 at ₹1,000 → ₹2,000). Grasim (32836) RFX-2859 order 21419 line 41321. Related to PB-01 (same award → PO step).",
    },
]

BUGS += [
    {
        "id": "PB-25",
        "summary": "A new version of an event can leave a round active with no end time (1 Jan 1970); the server also accepts an end time in 1970.",
        "priority": "P2", "blocker": "NO", "dev_type": "BE", "module": "Create New Version / round schedule", "feature": "Event versioning",
        "description": (
            "What happens: after 'Create New Version', some rounds of the new version are saved as active with an end time of 0 "
            "(1 January 1970): M3M NOIDA RFX-383.1, RFX-383.2, RFX-457.2, RFX-679.2 (technical rounds) and Jindal RFX-2189.1 (an RFQ "
            "round), created by the clients' own buyers between 3 Sep and 12 Nov 2026. Separately, a round published with an end time "
            "of 1800 seconds after 1970 is accepted and active (PROCOL DEMO RFX-15377, RFX-15420, RFX-20370 — sent by the test platform). "
            "Expected behavior: every active round has a real end time after its start; an end time in the past is refused. "
            "Why it matters: timers, 'Expired' labels, reminders and closing jobs read the end time; a round that 'ended in 1970' "
            "but is active behaves unpredictably."
        ),
        "steps": [
            "Log in as a buyer of M3M NOIDA (or PROCOL DEMO) on UAT.",
            "Open an event with a technical round, click Create New Version and publish the version.",
            "Open the new version's technical round: read its end time / timer.",
        ],
        "qa_comment": "UAT read-only check 17 Nov 2026: trade_requests with closed_at = epoch 0 and status active — M3M NOIDA (43569) "
                      "RFX-383.1 (114077), RFX-383.2 (114481), RFX-457.2 (118248), RFX-679.2 (132959), all rfx_mode rfp, 0 bids; Jindal (54986) "
                      "RFX-2189.1 (132036, rfq). The screens of those clients were NOT opened (other clients, read-only) — confirm on screen.",
    },
]

BUGS += [
    {
        "id": "PB-26",
        "summary": "On PRs raised from an intake request, the PR line is marked closed for double (sometimes triple) the PO quantity.",
        "priority": "P1", "blocker": "NO", "dev_type": "BE", "module": "PR → PO quantity closure", "feature": "Intake → PR → Event → PO",
        "description": (
            "What happens: when the PR came from an intake request, creating one PO adds the PO quantity to the PR line's 'closed' "
            "quantity more than once. Saint Gobain Gyproc PR-130: requested 10, one PO for 10 (RFX-55) → PR shows 20 closed. "
            "M3M NOIDA PR-102: 500 requested, one PO of 500 (RFX-535) → 1,500 closed. On a partial PO the remaining quantity is "
            "wrong: M3M PR-47 asks 250, PO for 10 (RFX-494) → 20 closed, so only 230 is left to source instead of 240. Blue Star "
            "PR-2099 (17 Nov 2026): 5 requested, PO for 2 (RFX-1212) → 4 closed. "
            "Across all clients (last 180 days): 95 of 314 intake PR lines with a PO are closed for more than the PO holds (78 exactly "
            "double), against 35 of 701 for PRs not raised from intake. "
            "Expected behavior: the closed quantity of a PR line goes up by the PO quantity exactly once. "
            "Why it matters: the PR shows more ordered than was ordered, lines are marked Completed too early and the open "
            "quantity available for the next event is too small, so items are never sourced. "
            "Likely cause (code, read-only): Order after_save_commit update_purchase_request_item_quantity_created_by_intake runs "
            "PrQuantityUpdateWorker on EVERY save of the PO (no 'first time' check), and the worker adds order_item.quantity each time."
        ),
        "steps": [
            "Log in as a buyer on UAT (PROCOL DEMO for a fresh test, or open the records below read-only).",
            "Raise an intake request with one item of quantity 10 and let it become a PR.",
            "Create an event from the PR line, let a vendor bid, award it and create the PO for 10.",
            "Open the PR (Purchase Requests → the PR) and read the line's Closed / Open quantity and status.",
            "Expected: Closed 10, Open 0. Actual on the records below: Closed 20.",
        ],
        "qa_comment": "UAT read-only check 18 Nov 2026 (purchase_request_items vs order_items.purchase_request_item_id, intake link "
                      "via purchase_request_trade_mappings reference_type IntakeRequest): Saint Gobain Gyproc (68628) PR-130 line 203691 "
                      "PO #23827, PR-122 line 203624 PO #23796, PR-15 line 202915 (1000 → 2000); M3M NOIDA (43569) PR-102 line 201666 "
                      "(500 → 1500), PR-98 line 200951 (2000 → 4000), PR-47 line 195302 (PO 10 → closed 20); Blue Star (41533) PR-2099 "
                      "line 207037 PO #24355; Noon (21314) PR-86 line 204128 (12 → 60). The PO and the doubling happen within the same minute.",
    },
    {
        "id": "PB-27",
        "summary": "When the client's ERP replies with an error, the PO is still marked 'generated' and the PO number becomes the ERP's raw reply text.",
        "priority": "P1", "blocker": "NO", "dev_type": "BE", "module": "PO → ERP push", "feature": "Purchase order generation",
        "description": (
            "What happens: the PO number field holds the ERP's whole reply instead of a number. M3M NOIDA RFX-688 (PO 24321, 13 Nov "
            "2026): PO number = '{\"Status\":\"Error\",\"Remarks\":\" No instance of object type PurchaseOrder has been created…' "
            "and the PO status is Generated — SAP said no PO was created. Bajaj Energy: 11 of 14 POs have PO number "
            "'{\"REP_MSG\"=>\"Success\"}' (latest RFX-2587, 17 Nov). Gulbrandsen and Saatvik: the whole SAP OData reply "
            "('{\"d\":{\"__metadata\":…'). Indospace: '{\"$id\":\"1\",\"success\":true,\"message\":\"Purchase order 8B3BB0 …' (the real "
            "number is inside the message). Blue Star: '[]'. Crompton: '{\"error_message\"=>…}'. SLR Metaliks: 'Unable to connect…'. "
            "9 clients, 46 POs in 180 days. "
            "Expected behavior: an ERP reply that says error / not created marks the PO as failed (declined) with the reason shown; "
            "the PO number is only the number itself; if the number cannot be read, it stays empty and the PO is flagged. "
            "Why it matters: buyers and vendors see an error message as the PO number on the PO, the PO email and the PDF, and a "
            "PO that does not exist in SAP is shown as generated, so nobody retries it. "
            "Likely cause (code, read-only): Integrations::Actions::NonFlexiPoResponse marks the PO generated whenever the HTTP call "
            "succeeded (2xx), and get_po_from_body returns the whole body when po_xpath / po_json_path are not configured (or the "
            "parent object when the key is missing); orders#update_purchase_order_status also appends a second number with a space."
        ),
        "steps": [
            "Log in as a buyer of M3M NOIDA on UAT (read-only: just open the PO).",
            "Go to Purchase Orders and open the PO of RFX-688 (PO id 24321).",
            "Read the PO number and the PO status; open the PO PDF / email if available.",
            "Expected: a real PO number, or the PO shown as failed with the ERP error. Actual: PO number is the ERP error text, status Generated.",
        ],
        "qa_comment": "UAT read-only check 18 Nov 2026 (orders.po_number, order_type purchase order, last 180 days): M3M NOIDA (43569) 13 of "
                      "220 (24321 RFX-688, 23615 RFX-547.2, 23550 RFX-566); Bajaj Energy (40493) 11/14 (24345 RFX-2587, 24089 RFX-2577); "
                      "Blue Star (41533) 7 ('[]', 22999 RFX-1049); Saatvik (56480) 5 (21022 RFX-41); Gulbrandsen (50169) 4 (22182 RFX-320); "
                      "Indospace (65415) 3 (22276 RFX-5); Crompton (43453) 2 (20690 RFX-159); SLR Metaliks (44158) 1 (22768 RFX-1853). "
                      "Grasim (32836) has 15 POs numbered '#       1'. UAT ERPs are test systems, but the handling is the same code in production. "
                      "Related: a second 'success' from the ERP is appended instead of refused, hiding a PO pushed twice — Barmati Agro "
                      "(32215) orders 12430 '4500357724 4500357778', 12253 '7200066250 7200066251' (2025); Patanjali Foods (12295) 9847.",
    },
]

BUGS += [
    {
        "id": "PB-28",
        "summary": "Two events created at the same moment get the same RFX number (and a number is skipped).",
        "priority": "P1", "blocker": "NO", "dev_type": "BE", "module": "Event creation / RFX numbering", "feature": "Event create",
        "description": (
            "What happens: when two events are created within a few milliseconds (double click on Create, two buyers at once, "
            "an ERP/API creating events), both get the same RFX number. Reproduced live on PROCOL DEMO 18 Nov 2026: 8 drafts "
            "sent at once → event 99317 and event 99318 (29 ms apart) are both RFX-21437, and RFX-21436 was never given. "
            "Already in client data (both events LIVE): Moon Beverages RFX-4731 (77900 and 77901, created 10 ms apart, different "
            "titles), AppSecure RFX-1749 (94716 / 94717), Gulbrandsen RFX-311 (74270 / 74271), Simpolo RFX-175 (83411 / 83412), "
            "Jindal Steel Dev RFX-20, RFX-39, RFX-42, RFX-47, RFX-118. "
            "Expected behavior: every event gets its own RFX number, in order, with no gaps. "
            "Why it matters: the RFX number is what buyers, vendors, approvers, emails, POs and ERP use to identify an event — "
            "two live events with one number get mixed up (search, approvals, 'RFX-4731' in a vendor email, MCP / Clara lookups by "
            "ref_id pick one at random). "
            "Likely cause (code, read-only): EventGroup#add_ref_id sets ref_id = 'RFX-' + count of the company's latest events in "
            "after_create_commit — a count, not a sequence, with no lock or unique index on (company_id, ref_id)."
        ),
        "steps": [
            "Log in as a buyer of PROCOL DEMO on UAT.",
            "Create two events at the same moment (two browser tabs clicking Create together, or two POST /event_groups at once).",
            "Open Projects / the events list and read both RFX numbers.",
            "Expected: two different numbers. Actual: both show the same RFX number; the next number is skipped.",
        ],
        "qa_comment": "Live 18 Nov 2026 PROCOL DEMO (198678): 3 drafts at once → unique (21427–21429); 8 at once → 99317 & 99318 both "
                      "RFX-21437, 21436 missing (drafts made by the test platform, titles 'spine-API-automation-…'). Client data (read-only, "
                      "last 180 days, both events active): Moon (39490) RFX-4731; AppSecure (50198) RFX-1749; Gulbrandsen (50169) RFX-311; "
                      "Simpolo (60051) RFX-175; Jindal Steel Dev (60101) RFX-20/39/42/47/118.",
    },
    {
        "id": "PB-29",
        "summary": "Clicking 'Create New Version' twice at once makes two versions of the event; both go live with the same number (e.g. two 'RFX-21441.1'), and the second publish answers HTTP 500 yet still goes live.",
        "priority": "P1", "blocker": "NO", "dev_type": "BE", "module": "Create New Version", "feature": "Event versioning",
        "description": (
            "What happens: reproduced live on PROCOL DEMO 18 Nov 2026 — on live event RFX-21441, two 'Create New Version' requests "
            "sent at the same moment (a double click) made TWO copies (events 99324 and 99325). Both were published: one answered "
            "success, the other answered HTTP 500 — and both are now live, both named RFX-21441.1 (rounds RFQ-25170.1). "
            "The same is in M3M NOIDA's data: RFX-571.1 is three live events (84281 'RPCONC by AD', 84282, 84325, 28 Sep 2026), "
            "RFX-598.3 is two live events (85784 with 6 bid lines and a PO, and 85857), RFX-477 has two versions of one parent. "
            "Versioning the original again AFTER its version is published is correctly refused ('Invalid Parameters'), so the hole "
            "is two version requests before either is published. "
            "Expected behavior: one parent → one open version; a second request returns the same draft (or is refused); a "
            "publish that fails (500) does not leave the event live. "
            "Why it matters: vendors can bid on either 'RFX-21441.1', awards / POs can come from a copy that is not the real "
            "latest version, and reports grouped by RFX number add both. "
            "Likely cause (code, read-only): Versioning::Methods#create_version uses find_or_initialize_by(item, status: draft, "
            "created_by) without a lock, and on the UAT database the unique index on item_versions only covers status = 1 "
            "(the code's annotation says status <> 0), so two draft versions of one parent can exist; the second copy's version "
            "row cannot become active (unique index) → 500, after the event row was already set active."
        ),
        "steps": [
            "Log in as a buyer of PROCOL DEMO on UAT and open a live event.",
            "Click 'Create New Version' twice quickly (or in two tabs at once) — or send POST /item_versions {item_uuid, item_type: 'EventGroup'} twice in parallel.",
            "Publish both copies.",
            "Search the Projects list for the RFX number with '.1'.",
            "Expected: one version (.1), the second request refused or the same draft. Actual: two live events both 'RFX-N.1'; the second publish shows an error but the event is live.",
        ],
        "qa_comment": "Live 18 Nov 2026 PROCOL DEMO (198678): RFX-21441 (event 99323) → 99324 and 99325 both status active, both RFX-21441.1 "
                      "(item_versions 99323→99324 active, 99323→99325 draft, both order 1); publish of 99325 answered HTTP 500. Control: "
                      "RFX-21440 → .1 published, then versioning the original again → 422 'Invalid Parameters' (correct). M3M NOIDA (43569) "
                      "data: RFX-571.1 = 84281/84282/84325, RFX-598.3 = 85784/85857. pg_indexes: only UNIQUE (item_type,item_id) WHERE status = 1."
    },
]

BUGS += [
    {
        "id": "PB-30",
        "summary": "Double-clicking Submit on an award, or Approve on an approval step, shows an error (HTTP 500) for the second click although the action went through; a submit without one optional field also answers 500.",
        "priority": "P3", "blocker": "NO", "dev_type": "BE", "module": "Award proposal submit", "feature": "Awarding",
        "description": (
            "What happens (live, PROCOL DEMO RFX-21443, 18 Nov 2026): the award proposal was submitted twice at the same moment "
            "(a double click): one answer was success (status 'requested'), the other HTTP 500 'Internal Server Error'. The data "
            "is right — one approval request (35017) — but the buyer sees an error for an award that worked, and may submit again. "
            "Also: a submit without 'step_uuid_vs_user_uuid' answers HTTP 500 instead of saying what is missing. Separately (no "
            "bug, wording only): after the buyer withdraws an event, the vendor's price change is refused as 'Bid not found' "
            "(code 32) and the submit as 'A bid has already been placed from your team' (code 34) — neither says the event was "
            "withdrawn (RFX-21439). "
            "Expected behavior: the second click is refused with a clear message ('already submitted for approval'); a missing "
            "field is a 422 naming it; a withdrawn event says so. "
            "Why it matters: 500s are logged as outages, buyers retry, and support can't tell a real failure from a double click."
        ),
        "steps": [
            "Log in as a buyer of PROCOL DEMO on UAT; open an event whose bidding is closed, with one bid.",
            "Open the award proposal, award the line, pick the approval workflow.",
            "Double-click 'Submit' (or send POST /proposal/<uuid>/submit twice in parallel).",
            "Expected: one success, one clear 'already submitted'. Actual: one success, one 'Something went wrong' (HTTP 500).",
        ],
        "qa_comment": "Live 18 Nov 2026 PROCOL DEMO (198678) RFX-21443 proposal 15210: parallel submits → 200 + 500; proposals status 4 "
                      "(requested), one approval_requests row 35017. Body without step_uuid_vs_user_uuid → 500 three times (proposal stayed draft). "
                      "Withdraw wording seen on RFX-21439 (event 99320). Same on the approver's side: on the last approval step of 35017, two "
                      "parallel 'Approve' (POST /approval_workflow/approval_requests/resolve_approval) → one 500 + one 200; data right "
                      "(request completed, one order 24367). Contrast: bids, bid submit and counter offers answer 516 'Transaction in "
                      "Progress' to a double click — award submit, approval and New Version (PB-29) have no such lock. Also 500: adding an approver "
                      "step (PATCH /approval_workflow/approval_requests/<id>) to an approval that was just withdrawn (RFX-21535, request 35046) "
                      "— should say 'approval already withdrawn'.",
    },
]


BUGS += [
    {
        "id": "PB-31",
        "summary": "Any signed-in console user can change the PO number of ANY company's purchase order: the order update call has no company or permission check (and answers HTTP 500 even though it saved).",
        "priority": "P1", "blocker": "NO", "dev_type": "BE", "module": "Purchase orders (API)", "feature": "PO",
        "description": (
            "What happens (live, 18 Nov 2026): working in the Demo Account 2 workspace (32461), PATCH /orders/<order id> "
            "{po_number} changed the PO number of a PROCOL DEMO (198678) order — order 13223 went from 'df' to 'df_QA_IDOR' "
            "(restored right after). The reply was HTTP 500 'Internal Server Error', but the change was saved. "
            "Why: OrderPolicy#update? returns true for everyone, and orders#update finds the order by id alone "
            "(Order.find_by_id) — it never checks that the order belongs to the company the user works in, or that the user "
            "may edit POs. Order ids are sequential numbers, so every company's POs can be walked. The same pattern sits on "
            "POST /orders/update_po_status (marks any order's PO 'generated' and appends a PO number, policy also true; "
            "it is meant for the ERP). "
            "Expected behavior: only users of the buyer company with PO edit permission can change a PO number; any other "
            "order id answers 'not found'; a successful save answers 200. "
            "Why it matters: a user of one client can silently rewrite another client's PO numbers — PO numbers are the key the "
            "ERP, invoices and GRNs match on."
        ),
        "steps": [
            "Log in to the console on UAT as a user of company A (any client).",
            "Take the id of a purchase order that belongs to company B (any number — ids are sequential); encode it the way the app does.",
            "Send PATCH https://sec-api-v1.ag-ri.in/api/orders/<encoded order id> with body {\"po_number\": \"TEST\"}.",
            "Expected: 'not found' / not allowed. Actual: HTTP 500 shown, but company B's PO number is now 'TEST'.",
        ],
        "qa_comment": "Live 18 Nov 2026: session in workspace 32461 (Demo Account 2) → PATCH /orders/UVpEZ04= (order 13223, buyer 198678 "
                      "PROCOL DEMO) → HTTP 500, DB po_number 'df' → 'df_QA_IDOR' at 01:53:48 UTC; restored to 'df' at 01:53:50. "
                      "Tested with the Procol Support session (the only console login we have) switched to the other company — the code "
                      "check is the same for any user: order_policy.rb update? = true, orders_controller#update Order.find_by_id(params[:id]) "
                      "(also on origin/main 13 Oct 2026). GET /orders/:id (show) is also unscoped but the id is decoded before the "
                      "invoice lookup, so it never finds anything (always 'No order found', even for own orders).",
    },
]


BUGS += [
    {
        "id": "PB-32",
        "summary": "A round whose end time is before its start time, or equal to it, is accepted and the event is published as live although bidding is already over — vendors are invited to an event they can never bid on.",
        "priority": "P2", "blocker": "NO", "dev_type": "BE", "module": "Event creation – round schedule", "feature": "Event creation",
        "description": (
            "What happens (live, PROCOL DEMO, 18 Nov 2026): the pricing round was attached with its end 10 minutes BEFORE its "
            "start (RFX-21467) and with end = start (RFX-21471). Both were accepted (no error), the event was published and "
            "reads back as active; the round's close time is the bad end time, so RFX-21467 went live already closed 10 "
            "minutes earlier, RFX-21471 closed the moment it went live. The vendor then gets 'Bid could not be placed. Please "
            "refresh and try again.' (code 782) — nothing says the bidding window is over. A start in the past is handled "
            "sensibly (the window is moved to start now, same length — RFX-21469), so only the end is unchecked. "
            "Client data: AppSecure (50198) has 654 live forward-auction rounds whose close time is days before the round was "
            "created (RFX-1895..1898, created 23 Oct with end 19 Oct). "
            "Expected behavior: attaching or publishing a round whose end is not after its start (and after now) is refused "
            "with a clear message. "
            "Why it matters: invitations and reminders go out for an event no vendor can answer; the buyer sees it 'live' with "
            "no bids and the vendor sees a confusing error."
        ),
        "steps": [
            "Log in as a buyer of PROCOL DEMO on UAT; create a draft RFQ with one line item and one invited vendor.",
            "Attach the pricing round with bid end time 10 minutes before the bid start time (POST /trade/template_input?template_name=trade&additional_fields=order_details with bid_end_time and extra_closing_time < bid_start_time).",
            "Publish the event.",
            "Expected: refused — 'end time must be after start time'. Actual: published as active, already closed; the vendor's bid is refused with 'Bid could not be placed. Please refresh and try again.'",
        ],
        "qa_comment": "Live 18 Nov 2026 PROCOL DEMO (198678): RFX-21467 (trade 134139: sent start 07:34 UTC, end 07:24 → closed_at 07:24, "
                      "status active), RFX-21471 (trade 134144: start = end 07:35), control RFX-21469 (start and end in the past → moved to "
                      "now + 30 min, closed 08:04). Vendor bid on RFX-21467 → 422 code 782. The screen's date picker blocks only DAYS before today "
                      "(dashboard projectScheduler/helpers.js getDisabledDate), not earlier times today; the screen itself was not tried — if it "
                      "blocks end-before-start, the gap is API-only (P3). AppSecure 50198: 654 live rounds with closed_at before the event was "
                      "created (last 22 Oct 2026).",
    },
]


BUGS += [
    {
        "id": "PB-33",
        "summary": "Two more endpoints act on another company's records with no company check: 'Create order from PR' closes any company's PR lines, and 'approve/reject unregistered vendor' works on any company's event (found in the code; not reproducible on our test companies).",
        "priority": "P2", "blocker": "NO", "dev_type": "BE", "module": "PR to order / Unregistered (email) bids", "feature": "Security – company isolation",
        "description": (
            "Same family as PB-31, found by reading the backend (origin/main, 6 Nov 2026). "
            "(1) POST /purchase_requests/<id>/create_flexi_order_from_pr looks the PR up by id alone (PurchaseRequest.find_by(id:)) "
            "— no check that the PR belongs to the user's company and no permission check. The order is built in the user's "
            "own company from the other company's PR, and on success sync_pr_and_line_item_statuses marks THAT PR's lines "
            "completed (quantity closed = requested). Any user of the 26 UAT companies that have the 'pr_to_order' workflow "
            "(e.g. Blue Star, GMMCO, Saint Gobain, Moon Beverages) could close and copy another company's PR. "
            "(2) PATCH /template_responses/<id>/poc_bid {status: approved|rejected} only checks that the user is a buyer — any "
            "buyer of any company can approve or reject an unregistered vendor's response on another company's event; "
            "'approved' also registers that vendor contact with the event's company. "
            "Expected behavior: both look the record up inside the user's company (and check the user's permission); anything "
            "else answers 'not found'. "
            "Why it matters: one client can close another client's requisitions or decide on another client's vendors."
        ),
        "steps": [
            "(1) Log in as a buyer of a company that has the PR-to-Order workflow (e.g. a Blue Star test user).",
            "Send POST /purchase_requests/<encoded id of a PR of ANOTHER company>/create_flexi_order_from_pr.",
            "Expected: not found. Code path: the order is created and the other company's PR lines are set to completed.",
            "(2) As any buyer, send PATCH /template_responses/<encoded id of another company's unregistered response>/poc_bid {\"status\": \"rejected\"} — expected not found; code path: rejected.",
        ],
        "qa_comment": "Code only (read-only repo, origin/main): purchase_requests_controller#create_flexi_order_from_pr line ~620 and "
                      "#sync_pr_and_line_item_statuses; template_responses_controller#update_poc_bid + PocBidActionService (added 2 Jul "
                      "2026, #14986). Not run live: neither PROCOL DEMO nor Demo Account 2 has the pr_to_order workflow "
                      "(fx_workflow_templates), and UAT has no unregistered responses yet (0 rows). Confirm with a dev before treating "
                      "as P1.",
    },
]


BUGS += [
    {
        "id": "PB-34",
        "summary": "Master QCS download leaves 'Event Closed At' empty for events whose bidding simply ended — it is filled only when the buyer closed the round early.",
        "priority": "P3", "blocker": "NO", "dev_type": "BE", "module": "Master QCS report", "feature": "Reports",
        "description": (
            "What happens (UAT, 18 Nov 2026): the Master QCS of PROCOL DEMO RFX-21204 (bidding 17 Nov 04:34–04:41 pm, over) "
            "shows 'Event End Time 17 Nov 2026 04:41 pm' but 'Event Closed At' blank. The report fills that cell only when the "
            "latest pricing round has status 'closed' (event_group.rb summary: trade_closed_at), and a round that reaches its "
            "end time stays 'active' in the data — only an early manual close sets 'closed'. In the last 90 days 15,948 finished "
            "rounds on UAT are still 'active' against 1,902 'closed', so the cell is empty for most events. "
            "Expected behavior: 'Event Closed At' shows when bidding actually ended (the round's end, or the early close time). "
            "Why it matters: the QCS is the document buyers attach for approval and audit; an empty close time looks like the "
            "event never closed."
        ),
        "steps": [
            "Log in as a buyer of PROCOL DEMO on UAT; open an event whose bidding has ended on its own (e.g. RFX-21204).",
            "Go to Master QCS and click Download.",
            "Open the sheet: look at the 'Event Closed At' row in the header block.",
            "Expected: the close date and time. Actual: blank (filled only for rounds the buyer closed early).",
        ],
        "qa_comment": "Live 18 Nov 2026: POST /reports/download_report {item_uuid, item_type: 'event_group', report_category: "
                      "'master_qcs_report'} on RFX-21204 (event 99012, round 133890 status active, closed_at 17 Nov 11:11 UTC). "
                      "Everything else on that QCS matched the data (rates, GST-inclusive amounts, Sum Total, last-purchase savings). "
                      "Code: event_group.rb:836 data[:trade_closed_at] = latest_commercial_stage.closed? ? … : ''.",
    },
]


BUGS += [
    {
        "id": "PB-35",
        "summary": "Master QCS download of an awarded event shows the 'Awarded Amount' and 'Proposal Value' rows empty for every vendor (report version 3, used by 29 clients); only 'Qty Awarded' is filled.",
        "priority": "P2", "blocker": "NO", "dev_type": "BE", "module": "Master QCS report (v3)", "feature": "Reports / Awarding",
        "description": (
            "What happens (UAT, 18 Nov 2026, PROCOL DEMO which runs report version 3): RFX-21249 is awarded 4 of 10 KG at ₹107 "
            "(proposal total ₹428); its Master QCS shows 'Qty Awarded 4.0KG' but 'Awarded Amount' and 'Proposal Value' blank. "
            "RFX-19984 (2 lines fully awarded, proposal total ₹20,900) — same, both rows blank on both lines. The proposal "
            "itself holds the totals (responses_hash total_amount 428 / 20,900). Report v3 adds the Awarded Amount column on "
            "purpose for awarded events (master_qcs_report_v3.rb add_awarded_widgets_if_missing) and then fills nothing. "
            "Also note for the fix: the code that fills 'awarded amount' elsewhere (event_group_controller_helper "
            "get_awarded_amount_widget_value) uses the line's latest bid amount (₹1,070 here — the whole 10 KG), not awarded "
            "quantity × rate (₹428), so a partial award would show the wrong figure once the cell is filled. "
            "Expected behavior: Awarded Amount = awarded quantity × awarded rate per vendor and line; Proposal Value = the "
            "award total. "
            "Why it matters: the QCS goes into the award approval and audit file; an empty award value (or the full bid "
            "value on a partial award) misstates what was committed. Clients on v3 include Grasim, M3M, Blue Star, GMMCO, "
            "Moon Beverages, Gulbrandsen, Nayara, Sony India."
        ),
        "steps": [
            "Log in as a buyer of PROCOL DEMO on UAT; open an awarded event (RFX-21249: 4 of 10 KG awarded at ₹107).",
            "Go to Master QCS → Download.",
            "In the sheet read 'Qty Awarded', 'Awarded Amount' and 'Proposal Value' for the vendor.",
            "Expected: 4 KG / ₹428 / ₹428. Actual: 4 KG / blank / blank.",
        ],
        "qa_comment": "Live 18 Nov 2026: POST /reports/download_report (master_qcs_report) on RFX-21249 (event 99063, proposal 15192) "
                      "and RFX-19984 (event 96619, proposal 14668). DEMO config mqcs_report_v3_enabled = true (report_templates table "
                      "not on UAT). The screen data (GET /sheets/details?view_type=proposal_view) returns qty_awarded = 4 and no "
                      "awarded_amount. Line precomputed data latest_amount = 1070 for the 4-of-10 award. Same sheet: 'Fulfilled Quantity' "
                      "shows 10 KG on RFX-21249 although 4 were awarded — get_fulfilled_quantity_value adds each awarded vendor's "
                      "OFFERED quantity (participant_quantity), not the awarded quantity (same root as PB-01); it is a line total "
                      "printed under every vendor, so the non-awarded vendor on RFX-19984 also shows 100 / 120.",
    },
]


BUGS += [
    {
        "id": "PB-36",
        "summary": "Purchase Orders page filtered by Location (or Product) counts PO LINES instead of POs: 'Total POs' shows 864 when 102 match, status counts go higher than unfiltered, and the pager shows 44 pages of which 38 are empty.",
        "priority": "P2", "blocker": "NO", "dev_type": "BE", "module": "Purchase Orders list", "feature": "PO",
        "description": (
            "What happens (live, PROCOL DEMO, 18 Nov 2026): on Purchase Orders, filter Location = the hub a2daWk4= (102 POs "
            "carrying 864 lines). The page header says 864 purchase orders, 'PO Created' 4 and 'PO Failed' 5 — higher than with "
            "NO filter (2 and 3). The pager says 44 pages; pages 1–6 list the 102 POs and pages 7–44 are empty. Another "
            "location (Z0RjY04=) says 16 POs and lists 13. "
            "Why: the Location and Product filters join each PO to its lines (Order scopes buyer_hub / product: "
            "joins(:order_items)) without DISTINCT, and the counts (group(:purchase_order_status).count, the paginator's "
            "total) count the joined rows. The list itself is right because the serializer collapses repeats. "
            "Expected behavior: counts, status tiles and page count are numbers of POs (102 / 6 pages). "
            "Why it matters: buyers read these tiles as PO volumes per plant / product — they are inflated by the number of "
            "lines per PO, and empty pages look like missing data."
        ),
        "steps": [
            "Log in as a buyer of PROCOL DEMO on UAT; open Purchase Orders.",
            "Note the totals with no filter (3,983 POs; PO Created 2; PO Failed 3).",
            "Filter Location = the location with the most lines (uuid a2daWk4=, id 3536).",
            "Expected: about 102 POs, 6 pages, tiles ≤ unfiltered. Actual: 864 POs, 44 pages (7–44 empty), PO Created 4, PO Failed 5.",
        ],
        "qa_comment": "Live 18 Nov 2026 GET /purchase_orders?filters={\"buyer_hub_uuids\":[\"a2daWk4=\"]}&page=N: number_of_purchase_orders "
                      "864, total_pages 44, rows: pages 1–6 = 102 distinct, 7–44 = 0. DB: hub 3536 = 102 POs / 864 order_items. Hub "
                      "a3BjY2M= 3,724 vs 3,680; WmNjY1o= 20 vs 18 listed; Z0RjY04= 16 vs 13. Same join on the Product filter "
                      "(product 447883: 54 POs, 183 lines). Code: order.rb scopes :product / :buyer_hub; search_query_po.rb counts.",
    },
]


BUGS += [
    {
        "id": "PB-37",
        "summary": "Purchase Orders 'PO Amount' filter silently drops POs that have no gross total saved — even a 0-to-any-amount range hides them (recent Blue Star Indirect POs among them).",
        "priority": "P3", "blocker": "NO", "dev_type": "BE", "module": "Purchase Orders list", "feature": "PO",
        "description": (
            "What happens (live, PROCOL DEMO, 18 Nov 2026): Purchase Orders with no filter shows 3,983 POs; filter PO Amount "
            "from 0 to 1,000,000,000,000,000 shows 3,979. The 4 missing POs (12791, 12214, 12174, 12169) have an amount but no "
            "'gross_total' in their saved price breakup, and the filter reads only that field "
            "(order.rb scope :po_amount on price_breakup->>'gross_total'). The same gap exists on live clients: Blue Star "
            "Indirect (68835) has 7 of 42 POs from the last 180 days without it — including POs made on 11–12 Nov 2026 "
            "(24328, 24307, 24306, 24289) — Grasim 18 of 163, Jindal 4 of 47 (no breakup at all), Sony India 2 of 4. "
            "Expected behavior: every PO is matched by its amount (fall back to the breakup's 'amount' or quantity × price); "
            "a full range returns every PO. "
            "Why it matters: buyers filtering 'POs above ₹X' for approvals or audit miss POs without any sign."
        ),
        "steps": [
            "Log in as a buyer of PROCOL DEMO on UAT; open Purchase Orders and note the total (3,983).",
            "Filter PO Amount from 0 to a very large number.",
            "Expected: 3,983. Actual: 3,979 — POs 59B903, D6E19D, 9D2050, C6A75E are gone.",
        ],
        "qa_comment": "Live 18 Nov 2026: GET /purchase_orders?filters={\"po_amount\":{\"from\":0,\"to\":1e15}} → 3,979 (no filter "
                      "3,983). Read-only DB check of the other clients (orders.price_breakup without gross_total, status not in_active, "
                      "last 180 days). Blue Star Indirect's new POs carry 'amount' but no 'gross_total' — worth checking which create "
                      "path writes them.",
    },
]


def main():
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    write_bug_sheet(wb, "bug_hunt", BUGS, feature="Platform bug hunt")
    write_repro_sheet(wb)
    wb.save(OUT)
    print(OUT, len(BUGS), "bugs", datetime.date.today())


if __name__ == "__main__":
    main()
