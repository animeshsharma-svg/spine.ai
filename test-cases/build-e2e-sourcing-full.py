#!/usr/bin/env python3
"""The full sourcing suite: every catalogued case about PR → event → vendors →
schedule → settings → bidding → negotiation → Master QCS → awarding → PO →
reports (prototype/data/test-cases.json, written from the Procol code and
live runs), plus the 172 hand-written end-to-end cases, plus generated
combination and negative-matrix cases. One workbook (PO Amendment columns)
and one page."""
import html, itertools, json, re, sys
from pathlib import Path
import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HERE = Path(__file__).resolve().parent
CATALOG = HERE.parent / "prototype" / "data" / "test-cases.json"
OUT_HTML = HERE / "e2e-sourcing-full-suite.html"
OUT_XLSX = HERE / "E2E_Sourcing_Full_Suite.xlsx"

# ── module map: catalog group → ordered module ───────────────────────────
MOD = {
 "00": "0. Set-up: choosing and reading the PR",
 "01": "1. Create event — single stage (RFP / RFQ / Auction)",
 "02": "2. Create event — eRFX project (multi-stage)",
 "03": "3. Event page — title, line items, attachments, drafts",
 "04": "4. Terms & Conditions, documents, savings",
 "05": "5. Finding and listing events (Live / History / Drafts / Withdrawn)",
 "06": "6. Inviting vendors, audience, visibility",
 "07": "7. Scheduling, rescheduling, extensions",
 "08": "8. Publish, versions, withdraw, lifecycle",
 "09": "9. Settings — withdraw, recreate, reminders, queries",
 "10": "10. Auctions — strategies, conversion, dynamic closing",
 "11": "11. Technical stage (RFP) — forms, evaluators, scoring",
 "12": "12. Rejected bids, regrets, order activity",
 "13": "13. Vendor side — opening the event and submitting a bid",
 "14": "14. Bid revisions, price caps, ranks, competition",
 "15": "15. Surrogate bids",
 "16": "16. Negotiation — counter offers and reject quote",
 "17": "17. Master QCS, savings, comparison, reports",
 "18": "18. Awarding — complete, partial, line-wise, approvals",
 "19": "19. PO, amendments, NFA/NTD, after the award",
 "20": "20. Lots, BOQ, weights, multi-currency",
 "21": "21. Templates and sheet columns",
 "22": "22. Permissions, isolation and robustness",
 "23": "23. Combination matrix (generated)",
 "24": "24. Negative matrix (generated)",
}
GROUP_MOD = {
 "PRD-PR": "00", "PRD-KBPR": "00", "API-XDPRE": "00", "UI-XDPRE": "00", "UI-PR": "00", "API-XCRT": "00",
 "UI-SS": "01", "PRD-KBSRC": "01", "API-PUB": "08", "API-EG": "01", "API-FDRAFT": "01", "API-NDRAFT": "01",
 "UI-CRE": "02", "PRD-RFX": "02", "API-STG": "02", "API-XSTG": "02", "API-FPRICESTG": "02", "API-NPRICESTG": "02", "API-FRFPSTG": "11", "API-NRFPSTG": "11",
 "UI-LI": "03", "API-LI": "03", "UI-FTTL": "03", "UI-FUPL": "03", "UI-FCOL": "21", "API-EVDDRF": "03", "API-FREAD": "03",
 "UI-FTNC": "04", "UI-SAV": "04", "UI-FSAV": "04", "API-EVDDOC": "04", "UI-EVDDOC": "04",
 "UI-XDLST": "05", "API-XDLST": "05", "API-EVRMEG": "05", "UI-ENV": "05",
 "UI-PART": "06", "UI-FVND": "06", "API-AUD": "06", "API-EVRVIS": "06", "UI-PERM": "22", "API-PERM": "22", "API-EVDREM": "09", "UI-EVDREM": "09",
 "UI-SCH": "07", "UI-FSCH": "07", "API-EVDTME": "07", "UI-EVDTME": "07", "API-EVRMTR": "07",
 "UI-PUB": "08", "UI-FPUB": "08", "API-XPUB": "08", "API-FPUBLISH": "08", "API-NPUBLISH": "08", "API-LC": "08", "API-FVERSION": "08", "API-NVERSION": "08", "API-XDAMD": "19", "UI-XDAMD": "19", "API-EVRLIF": "08",
 "API-EVDQRY": "09", "UI-EVDQRY": "09",
 "UI-AUC": "10", "API-XDAUC": "10", "UI-XDAUC": "10", "UI-CONV": "10", "API-CONV": "10", "API-FCONVERT": "10", "API-NCONVERT": "10", "API-EVDAUX": "10", "PRD-RA": "10",
 "UI-TECH": "11", "API-TECH": "11", "PRD-RFP": "11", "API-FTSTART": "11", "API-FTANSWER": "11", "API-FTSUBMIT": "11", "API-NTSTART": "11", "API-NTANSWER": "11", "API-NTSUBMIT": "11", "API-FESCHEMA": "11", "API-FESUBMIT": "11", "API-FESCORE": "11", "API-NESCORE": "11", "API-NESUBMIT": "11", "API-FVTECH": "11", "API-FSURTECH": "15", "API-NSURTECH": "15", "API-FELOGIN": "11", "API-NELOGIN": "11",
 "API-EVDRJB": "12", "UI-EVDRJB": "12", "API-EVDRGT": "12", "UI-EVDRGT": "12",
 "UI-VBID": "13", "API-BID": "13", "API-XBID": "13", "PRD-KBVDB": "13", "API-FVPRICE": "13", "API-FBIDNEW": "13", "API-FBIDPRICE": "13", "API-FBIDSUB": "13", "API-NBIDNEW": "13", "API-NBIDPRICE": "13", "API-NBIDSUB": "13", "API-FVLOGIN": "13", "API-NVLOGIN": "13", "API-XMAT": "13",
 "API-EVRCAL": "14", "API-EVRMBP": "14", "API-EVDCMP": "14", "UI-FCAP": "14", "EVI-RANK": "14", "EVI-LINE": "14", "EVI-TOT": "14", "EVI-CHG": "14", "EVI-TAX": "14", "EVI-CUR": "20", "EVI-PREC": "20",
 "UI-SUR": "15", "API-SUR": "15", "API-FSURRFQ": "15", "API-NSURRFQ": "15",
 "API-XDNEG": "16", "UI-XDNEG": "16", "API-FCOUNTER": "16", "API-NCOUNTER": "16",
 "API-XDQCS": "17", "UI-XDQCS": "17", "UI-FQCS": "17", "EVI-SAV": "17", "EVI-REP": "17", "EVI-ISO": "22", "API-EVDLEK": "22", "UI-EVDLEK": "22", "PRD-ANL": "17",
 "UI-AWD": "18", "API-AWD": "18", "API-XAWD": "18", "API-EVDAWD": "18", "UI-EVDAWD": "18", "EVI-AWD": "18", "API-FAWDPROP": "18", "API-FAWDLINES": "18", "API-FAWDFLOW": "18", "API-FAWDSUB": "18", "API-NAWDPROP": "18", "API-NAWDSUB": "18", "API-EVDNFA": "18", "API-XDAPR": "18", "UI-XDAPR": "18", "UI-XCHK": "18", "PRD-AE": "18",
 "API-EVDAPO": "19", "PRD-PO": "19", "PRD-RPT": "19", "PRD-INTG": "19",
 "API-XDLOT": "20", "UI-XDLOT": "20", "API-XDBOQ": "20", "UI-XDBOQ": "20", "UI-BOQ": "20", "API-EVDWGT": "20", "UI-EVDWGT": "20",
 "API-XTPL": "21", "UI-TPL": "21", "PRD-RFQ": "21", "PRD-ADM": "21",
 "UI-VAL": "22", "API-VAL": "22", "API-DB": "22",
}
EXCLUDE_PREFIX = ("API-XVBU", "PRD-VM", "PRD-VREV", "API-XREV", "PRD-INV", "PRD-QC", "PRD-GRN", "PRD-ASN", "PRD-CDN", "PRD-DIS", "PRD-CON", "PRD-BUD", "PRD-MDM", "PRD-PLT", "PRD-INTK", "PRD-KBPTP", "PRD-KBAI", "PRD-KBINT", "PRD-KBVON", "API-AUTH", "API-FBLOGIN", "API-NFR", "UI-NFR")

def clean(s):
    s = str(s or "")
    s = re.sub(r"`([^`]*)`", r"\1", s)
    s = s.replace("**", "")
    return s.strip()

def split_steps(s):
    s = clean(s)
    parts = re.split(r"(?:^|\s)(?=\d+\.\s)", s)
    parts = [re.sub(r"^\d+\.\s*", "", p).strip() for p in parts if p.strip()]
    if len(parts) <= 1:
        parts = [p.strip() for p in re.split(r"(?<=[.;])\s+(?=[A-Z])", s) if p.strip()]
    return parts or [s]

NEG = re.compile(r"\b(refus|cannot|can't|not\b|never|invalid|reject|block|missing|without|omitted|unknown|forbidden|denied|wrong|garbled|unreadable|crash|fail|hostile|bad )", re.I)
PRIO = {"P0": "Critical", "P1": "High", "P2": "Medium", "P3": "Low"}

def role_portal(x):
    gid, layer = x["id"], x.get("layer", "")
    title = (x.get("title") or "") + " " + (x.get("steps") or "")
    vend = re.search(r"\bvendor\b", title, re.I) and not re.search(r"\bbuyer\b", title[:60], re.I)
    if gid.startswith("API-") or layer == "api":
        if gid.startswith(("API-XBID", "API-BID", "API-FV", "API-NV", "API-FBID", "API-NBID", "API-FT", "API-NT", "API-EVDRGT")): return "Vendor", "API (Postman / runner)"
        if gid.startswith(("API-FE", "API-NE")): return "Evaluator", "API (Postman / runner)"
        return ("Vendor" if vend else "Buyer"), "API (Postman / runner)"
    if gid.startswith("EVI-"): return "Buyer, Vendor", "Database / API read-back"
    if gid.startswith("PRD-"):
        m = re.search(r"happy path for the ([A-Za-z /]+)", x.get("title", ""))
        return (m.group(1).strip() if m else ("Vendor" if vend else "Buyer")), "Buyer + Vendor portal"
    if gid.startswith(("UI-VBID", "UI-EVDLEK", "UI-EVDAWD")): return "Vendor", "Vendor portal"
    return ("Vendor" if vend else "Buyer"), "Buyer portal"

rows = []  # unified rows
def add(id, mod, scenario, title, role, portal, pre, data, steps, expected, p, typ):
    rows.append(dict(id=id, module=MOD[mod], scenario=scenario, title=title, role=role, portal=portal, pre=pre, data=data,
                     steps=steps if isinstance(steps, list) else split_steps(steps), expected=expected, p=p, typ=typ))

# ── 1. catalogue ──────────────────────────────────────────────────────────
d = json.load(open(CATALOG)); cases = d["cases"] if isinstance(d, dict) and "cases" in d else (d if isinstance(d, list) else list(d.values())[0])
kept = skipped = 0
for x in cases:
    gid = x["id"]
    if gid.startswith(EXCLUDE_PREFIX): skipped += 1; continue
    g = x.get("group") or gid.rsplit("-", 1)[0]
    mod = GROUP_MOD.get(g)
    if not mod:
        skipped += 1; continue
    role, portal = role_portal(x)
    typ = "Edge" if x.get("recordsCurrentBehaviour") else ("Negative" if NEG.search(x.get("title", "")) else "Positive")
    data = clean(x.get("why", ""))
    if x.get("refs"): data += ("\n" if data else "") + "Refs: " + ", ".join(map(str, x["refs"]))
    exp = clean(x.get("expected", ""))
    if x.get("oracle"): exp += "\nHow to check: " + clean(x["oracle"])
    add(gid, mod, clean(x.get("section", "")), clean(x.get("title", "")), role, portal, clean(x.get("setup", "")), data, x.get("steps", ""), exp, PRIO.get(x.get("priority"), "Medium"), typ)
    kept += 1
print(f"catalogue: kept {kept}, skipped {skipped}")

# ── 2. the 172 hand-written end-to-end cases ──────────────────────────────
sys.argv = [sys.argv[0]]
import importlib.util
spec = importlib.util.spec_from_file_location("e2e", HERE / "build-e2e-sourcing-cases.py"); e2e = importlib.util.module_from_spec(spec); spec.loader.exec_module(e2e)
E2E_MOD = {"PRI": "00", "SS": "01", "RFX": "02", "EVP": "03", "TNC": "04", "EVF": "05", "INV": "06", "SCH": "07", "PUB": "08", "WDR": "09", "RCO": "09", "EXT": "07", "SET": "12", "BID": "13", "REV": "14", "RVK": "12", "SUR": "15", "NEG": "16", "QCS": "17", "AWD": "18", "RPT": "19"}
for c in e2e.C:
    add(c["id"], E2E_MOD[c["id"].split("-")[1]], c["scenario"], c["title"], c["role"], c["portal"], c["pre"], c["data"], c["steps"], c["expected"], c["p"], c["typ"])

# ── 3. generated combination matrix (pairwise over the flow's axes) ──────
AXES = {
 "event": ["single-stage RFQ", "single-stage Auction (rank)", "single-stage RFP", "eRFX RFQ only", "eRFX Technical + RFQ", "eRFX Technical + Auction", "RFQ converted to Auction"],
 "pr": ["no PR (direct)", "material PR line", "service PR line"],
 "tnc": ["no T&C", "optional clauses", "mandatory clauses + attachment"],
 "schedule": ["start now, 30 min, no evaluation", "start now, custom 2 h, evaluation 30 min", "start tomorrow (Upcoming), 1 h", "24 h with dynamic closing (auction) / extra closing (RFQ)"],
 "vendors": ["mapped vendors via Invite Vendor", "one named QA vendor", "two QA vendors, one added after publish"],
 "columns": ["plain sheet", "price cap", "minimum quantity", "tick size 1%"],
 "vendor_action": ["submit once", "submit then revise", "submit then revoke", "submit, get counter offer, accept", "submit, get counter offer, reject", "buyer surrogate bid"],
 "award": ["complete to L1", "partial split across two vendors", "line-wise", "no award (withdraw after bids)"],
}
def pairwise(axes):
    keys = list(axes); vals = [axes[k] for k in keys]
    uncovered = set()
    for i, j in itertools.combinations(range(len(keys)), 2):
        for a in range(len(vals[i])):
            for b in range(len(vals[j])):
                uncovered.add((i, a, j, b))
    out = []
    while uncovered:
        best, best_cov = None, -1
        for _ in range(60):
            cand = [__import__("random").randrange(len(v)) for v in vals]
            cov = sum(1 for (i, a, j, b) in uncovered if cand[i] == a and cand[j] == b)
            if cov > best_cov: best, best_cov = cand, cov
        if best_cov == 0:
            # finish with any uncovered pair
            i, a, j, b = next(iter(uncovered)); best = [0] * len(keys); best[i] = a; best[j] = b
        out.append(best)
        uncovered -= {(i, a, j, b) for (i, a, j, b) in uncovered if best[i] == a and best[j] == b}
    return [dict(zip(keys, [vals[k][c[k]] for k in range(len(keys))])) for c in out]
__import__("random").seed(7)
combos = pairwise(AXES)
for n, cb in enumerate(combos, 1):
    steps = [
      "Log in to Procol (buyer side) with the buyer user of the test workspace",
      f"Start: {cb['pr']} — if a PR line is used, open the PR, tick the line and click Purchase Items; otherwise Create Event",
      f"Build a {cb['event']} with a template and one product ({cb['columns']}); set the title (auto or typed)",
      f"Terms & Conditions: {cb['tnc']}",
      f"Participants: {cb['vendors']}",
      f"Schedule: {cb['schedule']}; Save Schedule; Publish",
      f"Vendor side: {cb['vendor_action']} (respect the cap / minimum quantity / tick where set; accept mandatory T&C)",
      "Buyer: open Master QCS; check ranks, amounts and totals; download the report",
      f"Awarding: {cb['award']}; approve where an approval flow exists; check the PO / History / PR quantities",
    ]
    exp = (f"Every step is accepted or refused exactly as the single-feature cases say for its part: the event publishes as {cb['event']} "
           f"with {cb['tnc']}, {cb['schedule']}, {cb['vendors']}; the vendor action '{cb['vendor_action']}' follows the revision/revoke/counter-offer rules; "
           f"Master QCS and the downloaded report agree; '{cb['award']}' ends with the right totals (partial never above the line quantity), the PO per vendor (or none when withdrawn), "
           f"the event under History once the PO exists, and the PR line quantities (if any) in Ordered / Open.")
    add(f"E2E-CMB-{n:03d}", "23", "Pairwise combination", " · ".join(cb[k] for k in ("event", "tnc", "vendor_action", "award")), "Buyer, Vendor", "Buyer + Vendor portal",
        "QA test workspace and QA vendors; features of the chosen combination enabled (eRFX gate, partial awarding, dynamic closing…).", "\n".join(f"{k}: {v}" for k, v in cb.items()), steps, exp, "High", "Positive")

# ── 4. generated negative matrix (rule × event shape; vendor rule × shape) ─
BUYER_RULES = [
 ("no participants", "Publish with no vendor added", "'Please add participants to proceed!'"),
 ("no template", "Publish with vendors but no template", "'Please select a valid column for savings' (cause: template)"),
 ("no title (auto title off)", "Publish with the title empty", "'Please enter title.' / 'Please fill project title!'"),
 ("row without quantity", "Leave quantity empty on one row", "'Sheet partially filled, please check again.'"),
 ("invalid price cap", "Type a non-number / negative in Price Cap", "'Please enter valid price cap values'"),
 ("start in the past", "Schedule start = yesterday", "'Start time cannot be less than the current time'"),
 ("end before start", "Absolute end earlier than start", "'Start time should be less than end time'"),
 ("start > 3 months", "Schedule start 4 months ahead", "Refused by the 3-month rule"),
 ("mandatory savings missing", "Publish without a savings reference on a tenant where it is mandatory", "'Savings configuration is mandatory'"),
 ("payment terms empty", "Save the payment-terms form empty", "'Payment Terms and Conditions are mandatory'"),
 ("reject bid without reason", "Reject a submitted bid with an empty reason", "'Please add a reason for rejecting this bid'"),
 ("counter offer nothing ticked", "Send a counter offer with no line ticked", "'Please select atleast one product to send counter offer'"),
 ("counter offer nothing changed", "Tick a line, change nothing, Send", "'You must change atleast one column to send counter offer'"),
 ("extend backwards", "Extend Submission Time to a time before the current end", "Refused (end must be later)"),
 ("award nobody", "Submit the award with no vendor selected", "'Please award for at least one Vendor'"),
 ("award over quantity (partial on)", "Split 6 + 5 on a 10-unit line", "Refused: more than the line's quantity"),
 ("award non-bidder", "Add a vendor who never bid", "Not offered / refused"),
 ("approve without remark", "Approve the award with an empty remark", "'Remark is necessary for approval'"),
 ("reschedule a live round", "Open Settings on a live event", "Reschedule Event absent / refused"),
 ("withdraw after PO", "⋮ on an event with a PO", "Withdraw Project absent / refused"),
 ("recreate with past schedule", "Recreate Order → Schedule this event → yesterday", "'Invalid scheduled time!'"),
 ("second RFQ round", "Add RFQ beside Auction on the eRFX strip", "'+' disabled: 'Remove Auction to add RFQ'"),
 ("third stage", "Add a third stage", "'+' disabled with tooltip"),
 ("technical ends after RFQ", "Technical duration longer than RFQ", "'RFP duration exceeds RFQ end time. Please adjust.'"),
 ("evaluator missing", "Publish a technical stage without an evaluator / assessment template", "'There are some errors in vendor specific sections…'"),
 ("auction without strategy", "Publish an auction with no strategy", "'Please select a valid auction strategy'"),
 ("knockout/dutch without base price", "Publish knockout or Dutch without base price", "'Please enter (valid) base price'"),
 ("products on knockout/dutch", "Add a product after creating a knockout/Dutch auction", "'Products can't be added or removed in Knockout or Dutch Auction.'"),
 ("extend round beyond auction", "Extend the round past the auction end", "'Extend your auction time in order to extend current round's time!'"),
 ("serial bidding without evaluation", "Publish serial bidding with no evaluation time", "'Evaluation time is mandatory for serial bidding'"),
]
SHAPES = ["single-stage RFQ", "single-stage Auction", "single-stage RFP", "eRFX RFQ", "eRFX Technical + RFQ", "eRFX Technical + Auction"]
APPLIES = {  # rules that only make sense on some shapes
 "auction without strategy": ("Auction",), "knockout/dutch without base price": ("Auction",), "products on knockout/dutch": ("Auction",), "extend round beyond auction": ("Auction",),
 "second RFQ round": ("eRFX",), "third stage": ("eRFX",), "technical ends after RFQ": ("Technical + RFQ",), "evaluator missing": ("RFP", "Technical"),
 "counter offer nothing ticked": ("RFQ",), "counter offer nothing changed": ("RFQ",), "serial bidding without evaluation": ("Auction",),
}
n = 0
for (rk, how, msg) in BUYER_RULES:
    for sh in SHAPES:
        need = APPLIES.get(rk)
        if need and not any(k in sh for k in need): continue
        n += 1
        add(f"E2E-NEG-{n:03d}", "24", f"Buyer rule — {rk}", f"{how} on a {sh}", "Buyer", "Buyer portal",
            f"A {sh} at the step where the rule applies (draft, live, closed or awarded as the rule needs).", f"Rule: {rk}",
            ["Log in to Procol (buyer side)", f"Bring a {sh} to the step where the rule applies", how, "Read the message and confirm nothing was saved / changed"],
            f"{msg}. The event, bids and award are unchanged; the same message every time regardless of event shape (a different message or a silent failure on this shape is a defect).", "High", "Negative")
VENDOR_RULES = [
 ("above the price cap", "Enter a price above the cap and Submit", "'Net Price should be less than ₹<cap>/unit'; not saved"),
 ("below minimum quantity", "Offer less than the minimum quantity", "Refused; not saved"),
 ("required cell empty", "Submit with a required cell empty", "Refused with the cell highlighted"),
 ("before bidding starts", "Submit on an Upcoming event", "Submit disabled"),
 ("after bidding ends", "Submit after the end (+ extra closing)", "Refused; sheet read-only"),
 ("mandatory T&C not accepted", "Submit without accepting every mandatory clause/attachment", "Blocked until all are accepted"),
 ("uninvited vendor", "Open / bid on an event the vendor was not invited to", "Not visible; refused"),
 ("revise upward in reverse auction", "Revise to a higher price in a reverse auction", "Refused"),
 ("revise by less than a tick", "Revise by less than the tick size", "Refused"),
 ("revise while counter offer pending", "Edit the bid while a counter offer is pending", "Disabled"),
 ("revoke where not allowed", "Revoke a bid on a round without revoke allowed", "No Revoke / refused"),
 ("revoke after close", "Revoke after the round closed", "Refused"),
 ("re-bid after rejection without re-bid allowed", "Bid again after a rejection that disallowed re-bidding", "Refused"),
 ("accept counter after evaluation ended", "Accept a counter offer after the evaluation window", "Cannot accept (record)"),
 ("see another vendor's price", "Inspect own screens, downloads and API responses", "Never any competitor price / company id"),
]
VSHAPES = ["single-stage RFQ", "single-stage reverse Auction", "eRFX Technical + RFQ", "RFQ converted to Auction"]
VAPPLIES = {"revise upward in reverse auction": ("Auction",), "revise by less than a tick": ("Auction",), "revise while counter offer pending": ("RFQ",), "accept counter after evaluation ended": ("RFQ",)}
for (rk, how, msg) in VENDOR_RULES:
    for sh in VSHAPES:
        need = VAPPLIES.get(rk)
        if need and not any(k in sh for k in need): continue
        n += 1
        add(f"E2E-NEG-{n:03d}", "24", f"Vendor rule — {rk}", f"{how} on a {sh}", "Vendor", "Vendor portal",
            f"A live (or as the rule needs: upcoming / closed) {sh} with the QA vendor invited; the relevant column or setting present.", f"Rule: {rk}",
            ["Log in to the vendor portal as the QA test vendor", f"Open the {sh}", how, "Read the message; confirm the bid/state is unchanged on the buyer side (Responses / Master QCS)"],
            f"{msg}. Same behaviour on every event shape; the buyer's comparison never shows a value that was refused.", "High", "Negative")
# PR type × event type × given/random
m = 0
for pr in ["material PR line (M)", "service PR line (S)", "asset / capex line"]:
    for ev in ["single-stage RFQ", "single-stage Auction", "single-stage RFP", "eRFX project"]:
        for given in ["PR number given", "no PR number given (pick a random Open PR of that type)"]:
            m += 1
            add(f"E2E-PRX-{m:03d}", "23", "PR type × event type", f"{pr} → {ev}, {given}", "Buyer", "Buyer portal",
                f"At least one Open PR with a fully open {pr}.", f"{pr}; {ev}; {given}",
                ["Log in to Procol (buyer side)", f"Purchase Requisitions → Open → {given}: open it by number, or pick a random row whose Item Type matches and whose line is fully open",
                 "Read the line details to confirm the type (material code vs service code/activities vs asset account assignment)", f"Tick the line → Purchase Items → choose {ev}",
                 "Complete template, vendors, T&C, schedule; Publish", "Open the PR again"],
                f"The event opens with the PR line pre-filled (quantity/UOM/location for material; activities/rates for service; account assignment kept for assets); after publish the line is In Progress with the event linked; a service line never lands in a material sheet and vice versa; RFP shows the line as a technical requirement only.", "High", "Positive")

print(f"total rows: {len(rows)}")

# ── Excel ────────────────────────────────────────────────────────────────
order = list(MOD.values())
rows.sort(key=lambda r: (order.index(r["module"]), r["id"]))
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "All cases"
hdr = ["Test Case ID", "Module", "Scenario", "Test Case Title", "User Role", "Portal", "Pre-conditions", "Test Data", "Test Steps", "Expected Result", "Priority", "Test Type", "Status"]
ws.append(hdr)
for r in rows:
    ws.append([r["id"], r["module"], r["scenario"], r["title"], r["role"], r["portal"], r["pre"], r["data"], "\n".join(f"{i+1}. {s}" for i, s in enumerate(r["steps"])), r["expected"], r["p"], r["typ"], ""])
for i, w in enumerate([16, 34, 30, 50, 14, 18, 40, 40, 60, 70, 10, 10, 8], 1): ws.column_dimensions[get_column_letter(i)].width = w
for cell in ws[1]: cell.font = Font(bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor="1F3A5F"); cell.alignment = Alignment(wrap_text=True, vertical="top")
for row in ws.iter_rows(min_row=2):
    for cell in row: cell.alignment = Alignment(wrap_text=True, vertical="top")
ws.freeze_panes = "D2"; ws.auto_filter.ref = ws.dimensions
# summary sheet
ws2 = wb.create_sheet("Summary", 0); ws2.append(["Module", "Cases", "Critical", "High", "Medium", "Low", "Positive", "Negative", "Edge"])
for mname in order:
    xs = [r for r in rows if r["module"] == mname]
    if not xs: continue
    ws2.append([mname, len(xs)] + [sum(1 for r in xs if r["p"] == k) for k in ("Critical", "High", "Medium", "Low")] + [sum(1 for r in xs if r["typ"] == k) for k in ("Positive", "Negative", "Edge")])
ws2.append(["TOTAL", len(rows)] + [sum(1 for r in rows if r["p"] == k) for k in ("Critical", "High", "Medium", "Low")] + [sum(1 for r in rows if r["typ"] == k) for k in ("Positive", "Negative", "Edge")])
for i, w in enumerate([60, 8, 9, 8, 9, 8, 9, 9, 8], 1): ws2.column_dimensions[get_column_letter(i)].width = w
for cell in ws2[1]: cell.font = Font(bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor="1F3A5F")
wb.save(OUT_XLSX)

# ── HTML ─────────────────────────────────────────────────────────────────
esc = lambda s: html.escape(str(s)).replace("\n", "<br>")
sections = ""
for mname in order:
    xs = [r for r in rows if r["module"] == mname]
    if not xs: continue
    trs = "".join(
        f'<tr><td class="id">{esc(r["id"])}</td><td><b>{esc(r["title"])}</b><div class="sc">{esc(r["scenario"])} · {esc(r["role"])} · {esc(r["portal"])}</div></td>'
        f'<td>{esc(r["pre"])}</td><td><ol>{"".join(f"<li>{esc(s)}</li>" for s in r["steps"])}</ol></td><td>{esc(r["expected"])}</td>'
        f'<td><span class="p p-{r["p"].lower()}">{esc(r["p"])}</span><div class="sc">{esc(r["typ"])}</div></td></tr>' for r in xs)
    sections += (f'<details class="mod"><summary><span>{esc(mname)}</span><span class="cnt">{len(xs)} cases · {sum(1 for r in xs if r["typ"]=="Negative")} negative</span></summary>'
                 f'<div class="tablewrap"><table><thead><tr><th>ID</th><th>Test case</th><th>Pre-conditions</th><th>Steps</th><th>Expected</th><th>Priority</th></tr></thead><tbody>{trs}</tbody></table></div></details>')
tot = len(rows); neg = sum(1 for r in rows if r["typ"] == "Negative"); crit = sum(1 for r in rows if r["p"] == "Critical")
narr = "".join(f'<div class="step"><div class="num">{esc(n)}</div><div><h4>{esc(h)}</h4><p>{esc(b)}</p></div></div>' for n, h, b in e2e.NARR)
page = f"""<title>Sourcing Full Test Suite</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* layout: narrative, then one collapsible table per module (open one at a time; the page holds thousands of rows) */
:root{{--bg:#f6f7f5;--paper:#fff;--ink:#1d2320;--muted:#5d6a63;--line:#d9ded9;--accent:#1f3a5f;--accent-ink:#fff;--soft:#eef2f7;--bad:#b3261e;--warn:#9a6700;--ok:#1d7a4f;--font:"IBM Plex Sans",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,monospace}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#151917;--paper:#1d2320;--ink:#e7ebe8;--muted:#a3ada7;--line:#343b37;--accent:#8fb4e3;--accent-ink:#0f1a28;--soft:#232b33;--bad:#ff9a8f;--warn:#f3c66b;--ok:#7fd3a5;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#151917;--paper:#1d2320;--ink:#e7ebe8;--muted:#a3ada7;--line:#343b37;--accent:#8fb4e3;--accent-ink:#0f1a28;--soft:#232b33;--bad:#ff9a8f;--warn:#f3c66b;--ok:#7fd3a5;color-scheme:dark}}
body{{background:var(--bg);color:var(--ink);font-family:var(--font);line-height:1.45;padding-block:28px;padding-inline:max(16px,3vw)}}
main{{max-width:1380px;margin:0 auto;display:grid;gap:22px}}
h1{{font-size:1.8rem;margin:0 0 6px;text-wrap:balance}} h2{{font-size:1.25rem;margin:0 0 10px}} h4{{margin:0 0 4px;font-size:1rem}}
.lead{{color:var(--muted);max-width:76ch;margin:0}} .eyebrow{{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}}
section{{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:20px}}
.facts{{display:flex;gap:14px;flex-wrap:wrap}} .fact{{background:var(--soft);border-radius:8px;padding:10px 16px}} .fact b{{font-size:1.4rem;display:block;font-variant-numeric:tabular-nums}} .fact span{{color:var(--muted);font-size:.85rem}}
.steps{{display:grid;gap:10px}} .step{{display:grid;grid-template-columns:56px 1fr;gap:12px}} .num{{font-family:var(--mono);font-weight:600;color:var(--accent);padding-top:3px}} .step p{{margin:0;font-size:.93rem}}
details.mod{{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:0}} details.mod>summary{{cursor:pointer;padding:14px 18px;font-weight:600;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}} .cnt{{font-family:var(--mono);font-size:.82rem;color:var(--muted);font-weight:400}}
.tablewrap{{overflow-x:auto;border-top:1px solid var(--line)}}
table{{border-collapse:collapse;width:100%;min-width:1200px;font-size:.84rem}}
th,td{{text-align:left;vertical-align:top;padding:7px 9px;border-bottom:1px solid var(--line)}} th{{background:var(--soft);position:sticky;top:0}}
td.id{{font-family:var(--mono);white-space:nowrap;font-size:.8rem}} .sc{{color:var(--muted);font-size:.8rem;margin-top:2px}}
ol{{margin:0;padding-left:18px}} ol li{{margin:1px 0}}
.p{{display:inline-block;padding:1px 8px;border-radius:999px;font-size:.76rem;font-weight:600;border:1px solid currentColor;white-space:nowrap}} .p-critical{{color:var(--bad)}} .p-high{{color:var(--warn)}} .p-medium{{color:var(--ok)}} .p-low{{color:var(--muted)}}
@media (max-width:700px){{.step{{grid-template-columns:44px 1fr}}}}
</style>
<main>
<header>
  <div class="eyebrow">Procol sourcing · PR → event → vendors → schedule → settings → bidding → negotiation → Master QCS → award → PO → reports · 27 Oct 2026</div>
  <h1>Sourcing Full Test Suite</h1>
  <p class="lead">Every catalogued case for the sourcing flow (written from the Procol backend and dashboard code and from live runs on UAT), the 172 hand-written end-to-end cases, and generated combination and negative-matrix cases — one list, in the order the flow happens. Open a module to read its cases; the Excel has the same rows with Status for execution.</p>
  <div class="facts"><div class="fact"><b>{tot}</b><span>test cases</span></div><div class="fact"><b>{neg}</b><span>negative</span></div><div class="fact"><b>{crit}</b><span>critical</span></div><div class="fact"><b>{len([m for m in order if any(r['module']==m for r in rows)])}</b><span>modules</span></div></div>
</header>
<section><h2>The flow, in order</h2><div class="steps">{narr}</div></section>
{sections}
<section>
  <h2>How to read the IDs</h2>
  <p class="lead">E2E-… = hand-written end-to-end case; E2E-CMB / E2E-PRX / E2E-NEG = generated combination, PR-type and negative-matrix cases; API-… = exact API behaviour (runnable in Postman or the runner); UI-… = screen behaviour; PRD-… = product-requirement scenarios; EVI-… = figures checked against the database. "How to check" under Expected is the oracle the automation uses.</p>
</section>
</main>
"""
OUT_HTML.write_text(page)
print(f"→ {OUT_HTML.name} ({OUT_HTML.stat().st_size//1024} KB), {OUT_XLSX.name}")
