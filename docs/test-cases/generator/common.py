"""Shared vocabulary for the sourcing test cases: people, data, the clicks every case repeats,
and the case builder. Written in the plain language of the reference sheet
("PO Ammendment test cases.xlsx"): a tester who has never seen Procol can follow every line."""

CASES = []
_counters = {}

# ── people and data ────────────────────────────────────────────────────────────────────────
VA, VB, VC = "Vendor A", "Vendor B", "Vendor C"
P1 = "KNOB FX151-2925"          # catalogue product (code 2810038395), unit ST
P2 = "AAC BLOCKS"               # second catalogue product, unit KG
P3 = "BACK FILLING"             # product of a different family
LOC1, LOC2 = "Plant Name (LOC-0001)", "Gurgaon"

PEOPLE_NOTE = ("Vendors A, B and C are the QA test vendors of the test company (their names start with "
               "\"QA_Platform\" and their e-mails end with @example.com). Never invite a real supplier.")

# ── the clicks every case repeats ─────────────────────────────────────────────────────────
BUYER_LOGIN = "Log in to Procol (buyer side) with the buyer user"
APPROVER_LOGIN = "Log in to Procol (buyer side) with the approver user"


def vendor_login(v=VA):
    return f"Log in to the Procol vendor portal with {v}'s user (use a second browser or an incognito window so the buyer stays logged in)"


OPEN_PR_LIST = "From the left menu click \"Purchase Requisitions\". The PR list opens on the \"Open\" tab"
OPEN_EVENTS = "From the left menu click \"Events\". The events list opens with the tabs Live, History, Drafts and Recurring"
CLICK_CREATE = "Click the blue \"Create Event\" button at the top right"
CHOOSE_SINGLE = "In the pop-up click \"Single Stage\" (Source through RFP / RFQ / Auction). The create screen opens with Event Type set to \"RFP\""
CHOOSE_ERFX = "In the pop-up click \"eRFX Project\" (Manage sourcing via a project approach). The project screen opens with one stage tab, \"Auction\""
OPEN_SETTINGS = "On the stage page click \"Settings\" (gear icon) at the top right of the stage. The settings menu opens"
OPEN_DOTS = "Click the three dots (⋮) at the top right of the project page, next to \"Messages\". A small menu opens"


def open_event(what="the event"):
    return [OPEN_EVENTS, f"Find {what}: type its title in \"Search Title\" and click it in the list. The project page opens"]


SETUP_NAMES = [
    ("the live RFQ (no bids)", "SRC-SET-001"), ("the RFQ with two bids", "SRC-SET-002"), ("the RFQ in evaluation", "SRC-SET-003"),
    ("the closed RFQ", "SRC-SET-004"), ("the upcoming RFQ", "SRC-SET-005"), ("the live reverse auction", "SRC-SET-006"),
    ("the live forward auction", "SRC-SET-007"), ("the Tech+RFQ project", "SRC-SET-008"), ("the draft project", "SRC-SET-009"),
    ("the PR-based RFQ", "SRC-SET-010"), ("the awarded event with PO", "SRC-SET-011"), ("the withdrawn event", "SRC-SET-012"),
    ("the service RFQ", "SRC-SET-013"),
]


def cap(t):
    return t if t[:4] in ("eRFX",) else t[0].upper() + t[1:]


def single_stage_rfq(product=P1, qty=10, loc=LOC1, template="the RFQ template"):
    return [
        OPEN_EVENTS, CLICK_CREATE, CHOOSE_SINGLE,
        "Under Event Type click \"RFQ\"",
        f"Move the mouse over \"Select Templates\" and click {template} in the menu that opens. The product sheet appears (Product, Product Variant, Quantity Requested, Delivery location, Price)",
        f"Click the first \"Product\" cell, type \"{product.split()[0]}\" and click {product} in the list. \"Product Variant\" fills itself with \"Default Variant\"",
        f"Click \"Quantity Requested\", type {qty} and press Tab. Click \"Delivery location\" and pick {loc}",
    ]


def single_stage_auction(direction="reverse", product=P1, qty=10, loc=LOC1):
    kind = "a reverse (buy) auction template" if direction == "reverse" else "a forward (sell) auction template"
    return [
        OPEN_EVENTS, CLICK_CREATE, CHOOSE_SINGLE,
        "Under Event Type click \"Auction\"",
        f"Move the mouse over \"Select Templates\" and click {kind}. The product sheet appears",
        f"Add {product} with quantity {qty} at {loc} in the first row",
    ]


def erfx_rfq(product=P1, qty=10, loc=LOC1, title="QA_Platform eRFX"):
    return [
        OPEN_EVENTS, CLICK_CREATE, CHOOSE_ERFX,
        f"Type the project title \"{title}\" in \"Enter the title of the project\"",
        "Make the stages \"RFQ\" only: hover the \"+\" next to the stage tab and add \"Technical Stage\", open the \"Auction\" tab's ⋮ menu and click Delete, add \"RFQ\" from \"+\", then delete \"Technical Stage\" the same way (RFQ and Auction cannot be in one project, and the last stage can never be deleted)",
        "On the RFQ tab hover \"Select Templates\" and click the RFQ template",
        f"Click the \"Items 0\" button. In the \"Manage Line Items\" drawer search \"{product.split()[0]}\", add {product}, set quantity {qty} and location {loc}, click Save. The button now reads \"Items 1\"",
    ]


INVITE_MAPPED = "Scroll to \"Participants\". A strip says \"Invite N more participant based on the products\". Click its \"Invite Vendor\" button: every vendor mapped to the product is added"


def invite_named(*vendors):
    names = " and ".join(vendors)
    return f"Click \"Search vendors you want to add\" under Participants, type the name of {names} and click {'each' if len(vendors) > 1 else 'it'} under \"VENDORS\" in the list"


SCHEDULE_30 = "Click the schedule chip in the footer (it reads \"Now - <time> ( 30 Mins )\"). In the \"Schedule Event\" drawer keep \"Start now\", keep \"Duration\" 30 Mins and click \"Save Schedule\""
PUBLISH = "Click \"Publish Event\" (single stage) or \"Publish\" (eRFX) in the footer and confirm the pop-up"


def vendor_open(v=VA, what="the event"):
    return [vendor_login(v), f"On the vendor's event list open {what} (it is on the Live tab while bidding is on)"]


def vendor_bid(price=100, v=VA):
    return [f"In the price sheet type {price} in \"Price\" for every line and press Tab", "Tick every Terms & Conditions clause marked Required (if any)", "Click \"Submit\" and confirm"]


# ── the builder ───────────────────────────────────────────────────────────────────────────
def case(prefix, module, scenario, title, steps, expected, *, role="Buyer", portal="Buyer portal", pre="-",
         data="-", priority="High", ttype="Positive", rule=""):
    _counters[prefix] = _counters.get(prefix, 0) + 1
    cid = f"{prefix}-{_counters[prefix]:03d}"
    import re as _re0
    title = _re0.sub(r"\b([Aa]) (?=[aeiouAEIOU]|eRFX)", lambda m: m.group(1) + "n ", cap(title))
    scenario = _re0.sub(r"\b([Aa]) (?=[aeiouAEIOU]|eRFX)", lambda m: m.group(1) + "n ", scenario)
    flat = []
    for s in steps:
        if isinstance(s, (list, tuple)):
            flat.extend(s)
        elif s:
            flat.append(s)
    if pre in ("-", "") and prefix != "SRC-SET":
        text = " ".join(flat)
        used = [(n, i) for n, i in SETUP_NAMES if n in text]
        if used:
            pre = "; ".join(f"Set-up case {i} done (\"{n}\")" for n, i in used) + "."
        else:
            import re as _re
            found = _re.search(r"Find (.+?): type its title", text)
            if found:
                pre = f"An existing event: {found.group(1)}. If none exists, make one first with the create cases (modules 3–9) and module 0."
            elif portal == "Vendor portal":
                pre = "The vendor is invited to the event named in the steps, and the event is in the state the steps say."
            elif "Purchase Requisitions" in text:
                pre = "The buyer can see Purchase Requisitions; open PR lines of the needed type exist on the test company."
            else:
                pre = "The buyer can create events on the test company; QA test vendors exist (names start with QA_Platform)."
    CASES.append({
        "Test Case ID": cid, "Module": module, "Scenario": scenario, "Test Case Title": title,
        "User Role": role, "Portal": portal, "Pre-conditions": pre, "Test Data": data,
        "Test Steps": "\n".join(f"{i + 1}. {s}" for i, s in enumerate(flat)),
        "Expected Result": expected, "Priority": priority, "Test Type": ttype, "Status": "Not Run",
        "_rule": rule,
    })
    return cid


def article(n, word):
    return f"{n} {word}{'' if n == 1 else 's'}"
