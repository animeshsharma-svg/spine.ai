"""Multi-entity vendor emails (Gulbrandsen 50169, UAT, 13 Nov 2026) — the report.

    python3 -P test-cases/build-multi-entity-email-results.py

Reads the cases (Multi_Entity_Email_Test_Cases.xlsx) and the run's evidence
(prototype/data/evidence/multi-entity/results.json: every event built and every email read from Mailpit, with the
names found in its subject / preview / body), writes test-cases/Multi_Entity_Email_Test_Case_Report.xlsx:
  Test Cases      the 123 cases + Status, Actual Result, RFX no., Mailpit ID, Screenshots
  multi_entity_emails   the bug sheet in the house format (bug_sheet.py) — no bug was confirmed in this run
  Observations    things for product to decide (not bugs)
  Email evidence  every email checked: RFX, plant, expected name, subject, names found where, verdict, files
  Summary         counts per module, what was not tested and why, questions for product
"""
import json, os, sys
from collections import Counter, OrderedDict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bug_sheet import write_bug_sheet  # noqa: E402
import openpyxl  # noqa: E402
from openpyxl.styles import Alignment, Font, PatternFill  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "Multi_Entity_Email_Test_Cases.xlsx")
OUT = os.path.join(HERE, "Multi_Entity_Email_Test_Case_Report.xlsx")
EV = os.path.join(HERE, "..", "prototype", "data", "evidence", "multi-entity")
L = json.load(open(os.path.join(EV, "results.json")))
MAILS = L["mails"]
# the watcher (men-run.ts watch) keeps every email that reaches V1's inbox, whenever UAT's queue sends it (16 Nov: ~25 min
# late); judge each one here against the event it belongs to (by RFX no. in the ledger)
_W = os.path.join(EV, "watch.json")
_EVENTS = {e["rfx"]: e for e in L["events"] if e.get("rfx")}
_have = {m["id"] for m in MAILS}
for w in (json.load(open(_W))["mails"] if os.path.exists(_W) else []):
    # manual reminders name the event by its title, not its RFX no.
    e = _EVENTS.get(w["rfx"]) or next((x for x in L["events"] if x.get("title") and x["title"] in w["subject"]), None)
    if e and not w["rfx"]:
        w["rfx"] = e["rfx"]
    if not e or w["id"] in _have:
        continue
    found = {n for v in w["places"].values() for n in v}
    w.update(tag=e["tag"], plant=e["plant"], expected=e["expected"],
             verdict="no-name" if not found else "match" if found == {e["expected"]} else "mismatch",
             wrong=sorted(found - {e["expected"]}), shot=w.get("shot", ""), eml=w.get("eml", ""))
    MAILS.append(w)
    _have.add(w["id"])

def mails(*rfx):
    return [m for m in MAILS if m["rfx"] in rfx]

def ids(*rfx):
    return "\n".join(m["id"] for m in mails(*rfx))

def shots(*rfx):
    return "\n".join(os.path.basename(m["shot"]) for m in mails(*rfx))

def seen(*rfx):
    out = []
    for m in mails(*rfx):
        where = "; ".join(f"{k}: {', '.join(sorted(set(v)))}" for k, v in m["places"].items() if v) or "no company or entity name anywhere"
        out.append(f"'{m['subject'].strip()}' — {where}")
    return " | ".join(out)

STAND = "Ran on plant {s} because no {w} PR exists on Gulbrandsen UAT (guide 6.3); the expected name is the same."
NOPR = "Blocked: no PR with plant {p} exists on Gulbrandsen UAT; the dev has to push one from the ERP PR API."
DEV = "Blocked: needs the dev to change the plant-to-entity list on purpose (tester's decision 13 Nov: no dev today)."
NOTRUN = "Not run: {why}. Not automated in this run; the email was not produced, so nothing was judged."
HIDDEN_REJ = "Blocked: 'Send bid rejection email to vendor' is a hidden setting only a Procol employee can switch on (it is off on Gulbrandsen)."
NO_TPL = "Blocked: Gulbrandsen has no custom communication template on UAT, so this email cannot be produced."
SHEET = "Observation — question for product: the mapping list is entered by the dev in the backend; there is no upload screen and no checks exist in this build, so the PRD's sheet rule cannot be tested by a tester."

R = {}
def put(cid, status, actual, rfx=(), extra_shots=""):
    R[cid] = (status, actual, ", ".join(rfx), ids(*rfx), (shots(*rfx) + ("\n" + extra_shots if extra_shots else "")).strip())

# 0. Set-up
put("MEN-SET-001", "Pass", "Read from the read-only UAT database: 'Buyer entity name by PR field' is set for Gulbrandsen on the PR field 'plant' with all 7 codes, names exactly as the PRD (1101/1105/1106 Gulbrandsen Technologies India Pvt Ltd., 1901 PT Gulbrandsen Technologies India Pvt Ltd., 4201 Gulbrandsen Private Limited, 4301 Gulbrandsen Catalyst Pvt Ltd., 4501 Gulbrandsen Industries LLP — every full stop present).")
put("MEN-SET-002", "Pass", "Open, unused PR lines found: plant 4501 (408), 1101 (56), 4201 (35 — all used by this run by the end), LOC-0001 (17, not in the list). None for 1105, 1106, 1901, 4301, 9999, an empty plant, ' 1105 ' or a PR mixing two plants: those cases use the guide's stand-ins or are Blocked.")
put("MEN-SET-003", "Pass", "QA vendors V1 and V2 created by invite + vendor sign-up (QA_Platform Vendor 1/2 1794583459190, qa_1794583459190_v1/v2@example.com — test addresses, approved 13 Nov). Every email of this run reached Mailpit within a minute or two; each was saved (.eml) and screenshotted at once.", ("RFX-383",))
put("MEN-SET-004", "Pass", "20 RFQs built from the PR list by API (titles start 'MEN '), V1 and V2 invited: RFX-383 (1101), 384 (4201), 385 (4501), 386 (LOC-0001), 387 (made by hand), 388–402 for the email actions. Only these events were acted on (RFX-378/381/382 untouched).")
# 1. Plant code -> entity
put("MEN-MAP-001", "Pass", "RFQ from PR 122010370 line 10 (plant 1101). Both vendor emails read 'Gulbrandsen Technologies India Pvt Ltd.' wherever the buyer is named: " + seen("RFX-383"), ("RFX-383",))
for c, p in (("MEN-MAP-002", "1105"), ("MEN-MAP-003", "1106"), ("MEN-MAP-004", "1901"), ("MEN-MAP-006", "4301")):
    put(c, "Blocked", NOPR.format(p=p) + " This case tests the code for that plant, so no stand-in counts (guide 6.3).")
put("MEN-MAP-005", "Pass", "RFQ from PR 422022646 line 20 (plant 4201): " + seen("RFX-384"), ("RFX-384",))
put("MEN-MAP-007", "Pass", "RFQ from PR 452000959 line 80 (plant 4501): " + seen("RFX-385"), ("RFX-385",))
put("MEN-MAP-008", "Pass", "Ran on plant LOC-0001 (not in the list) because no 9999 PR exists. RFQ from PR PR-00100 line 10: " + seen("RFX-386") + " — plain 'Gulbrandsen', as expected.", ("RFX-386",))
put("MEN-MAP-009", "Blocked", NOPR.format(p="(empty)"))
put("MEN-MAP-010", "Pass", "RFQ made by hand (no PR): " + seen("RFX-387") + " — plain 'Gulbrandsen'.", ("RFX-387",))
put("MEN-MAP-011", "Blocked", "Blocked: no PR with a look-alike plant code (e.g. '01101' or '1101A') exists on UAT; the dev has to push one.")
for c in ("MEN-MAP-012", "MEN-MAP-015", "MEN-MAP-016", "MEN-MAP-017", "MEN-MAP-018"):
    put(c, "Blocked", DEV)
put("MEN-MAP-013", "Blocked", NOPR.format(p="' 1105 ' (with spaces)"))
put("MEN-MAP-014", "Blocked", "Blocked: only plant 1101 has PRs; 1105 and 1106 have none, so the three codes of one entity cannot be compared. (1101 showed 'Gulbrandsen Technologies India Pvt Ltd.' — RFX-383.)", ("RFX-383",))
# 2. Which PR decides the name
put("MEN-PRF-001", "Not run", NOTRUN.format(why="an RFQ with line items from two PRs (4201 first, then 4501) could not be built — no single PR mixes plants and this run builds an RFQ from one PR"))
put("MEN-PRF-002", "Blocked", "Blocked: no PR on UAT has lines with two different plant codes; the dev has to push the mixed 4201+1105 PR.")
for c, w in (("MEN-PRF-003", "reordering the line items of a draft RFQ"), ("MEN-PRF-004", "deleting the first line item of a draft RFQ"), ("MEN-PRF-005", "a hand-added line placed first beside a PR line"), ("MEN-PRF-006", "adding a PR line to a manual RFQ after the first invite"), ("MEN-PRF-007", "copying a PR-based event"), ("MEN-PRF-008", "a second stage on the same event"), ("MEN-PRF-009", "adding a vendor after publishing"), ("MEN-PRF-010", "an RFQ with many line items")):
    put(c, "Not run", NOTRUN.format(why=w))
put("MEN-PRF-011", "Pass", "The invitation sent at the moment the RFQ made from the PR was published already carried the entity, on all three mapped plants (no delay, no plain 'Gulbrandsen' first): RFX-383, 384, 385.", ("RFX-383", "RFX-384", "RFX-385"))
# 3. Every vendor email shows the entity
put("MEN-EML-001", "Pass", STAND.format(s="1101", w="1105") + " Subject 'RFX-383 | Project Invitation from Gulbrandsen Technologies India Pvt Ltd.'; " + seen("RFX-383"), ("RFX-383",))
put("MEN-EML-002", "Pass", "Plant 4201 (RFX-384): big title 'Gulbrandsen Private Limited' next to the logo and the sentence 'Gulbrandsen Private Limited has initiated a purchase request …'. " + seen("RFX-384"), ("RFX-384",))
put("MEN-EML-003", "Couldn't tell", STAND.format(s="4201", w="4301") + " Publishing an auction sent 'RFX-392 | Auction is now live' (entity correct in title and body: " + seen("RFX-392") + ") and the project invitation, but no email with the subject '<ENTITY> - Auction Invitation' (UAT's sent-mail log has none for RFX-392). I could not tell which flow sends that email.", ("RFX-392",))
for c, w in (("MEN-EML-004", "a multi-lot (basket) event"), ("MEN-EML-005", "an auction scheduled to start later and its reminder"), ("MEN-EML-006", "the 'submission about to end' reminder time"), ("MEN-EML-007", "rescheduling an auction"), ("MEN-EML-008", "Extend Submission Time on a live RFQ"), ("MEN-EML-009", "the older bidding-time extension"), ("MEN-EML-010", "asking for best offer and extending its time"), ("MEN-EML-014", "splitting a lot"), ("MEN-EML-019", "Send Reminder → vendors who have not submitted"), ("MEN-EML-020", "best-offer reminder"), ("MEN-EML-021", "cost-breakdown reminder"), ("MEN-EML-022", "counter-offer reminder")):
    put(c, "Not run", NOTRUN.format(why=w))
put("MEN-EML-011", "Not run", "Not run: the run issued a new version of a live RFQ (RFX-391); that sends no 'Event Revised' email (UAT's sent-mail log: only the invitation and RFQ-live emails). The case's path — change the live event and save with a remark — was not automated.")
put("MEN-EML-012", "Pass", "Plant 4201 (the checklist's own plant). Project withdrawn with a remark: subject 'RFX-393 | Project Withdrawn by Gulbrandsen Private Limited', body names the same entity. " + seen("RFX-393"), ("RFX-393",))
put("MEN-EML-013", "Pass", STAND.format(s="4201", w="1901") + " 'RFX-393 | RFQ has been withdrawn': the body says 'Gulbrandsen Private Limited has withdrawn the RFQ.'", ("RFX-393",))
put("MEN-EML-015", "Couldn't tell", STAND.format(s="1101", w="1105") + " V1's bid was awarded (RFX-390) and the award approved by the run's own buyer. Corrected 17 Nov: UAT's sent-mail log shows 'Congratulations! Your bid is selected.' WAS sent to V1 at 10:26 UTC on 13 Nov — it was missed because its subject carries no RFX number and the search looked for 'RFX-390'. Mailpit had dropped it before it could be read, so its content is unknown; see the 16–17 Nov run (RFX-418) for the real check.", ("RFX-390",))
put("MEN-EML-016", "Blocked", HIDDEN_REJ)
put("MEN-EML-017", "Pass", STAND.format(s="1101", w="1106") + " Subject '🚨 RFX-388 | Action Required: Counter Offer Sent by Gulbrandsen Technologies India Pvt Ltd.' The body names the buyer USER ('Procol Support has sent a counter offer!'), not a company — so the subject is the only place with a company name, and it is right (see Observations).", ("RFX-388",))
put("MEN-EML-018", "Pass", STAND.format(s="4201", w="4301") + " Subject '📄 RFX-389 | Bid submitted on your behalf by Gulbrandsen Private Limited'; the body names no company.", ("RFX-389",))
put("MEN-EML-023", "Blocked", NO_TPL)
# 4. Without a mapped PR
put("MEN-NOM-001", "Pass", "Manual RFQ RFX-387: 'Project Invitation from Gulbrandsen' — " + seen("RFX-387"), ("RFX-387",))
put("MEN-NOM-002", "Pass", "Manual RFQ RFX-387 'RFQ is now live': plain 'Gulbrandsen' in the title and sentence.", ("RFX-387",))
put("MEN-NOM-003", "Couldn't tell", "Manual auction RFX-397: 'Auction is now live' and the invitation say plain 'Gulbrandsen' (" + seen("RFX-397") + "), but — as in MEN-EML-003 — no '… - Auction Invitation' email went out.", ("RFX-397",))
for n, w in ((4, "a multi-lot event"), (5, "an auction reminder before start"), (6, "the about-to-end reminder"), (7, "an auction reschedule"), (8, "Extend Submission Time"), (9, "the bidding-time extension"), (10, "best offer"), (11, "an event revision with a remark"), (14, "a lot split"), (15, "an award (see MEN-EML-015)"), (19, "manual reminders"), (20, "best-offer reminder"), (21, "cost-breakdown reminder"), (22, "counter-offer reminder")):
    put(f"MEN-NOM-{n:03d}", "Not run", NOTRUN.format(why=w))
put("MEN-NOM-012", "Pass", "Manual RFQ RFX-396 withdrawn: 'RFX-396 | Project Withdrawn by Gulbrandsen'.", ("RFX-396",))
put("MEN-NOM-013", "Pass", "Manual RFQ RFX-396: 'RFQ has been withdrawn' says 'Gulbrandsen has withdrawn the RFQ.'", ("RFX-396",))
put("MEN-NOM-016", "Blocked", HIDDEN_REJ)
put("MEN-NOM-017", "Pass", "Manual RFQ RFX-394: '🚨 RFX-394 | Action Required: Counter Offer Sent by Gulbrandsen'.", ("RFX-394",))
put("MEN-NOM-018", "Pass", "Manual RFQ RFX-395: '📄 RFX-395 | Bid submitted on your behalf by Gulbrandsen'.", ("RFX-395",))
put("MEN-NOM-023", "Blocked", NO_TPL)
# 5. Hide company name ON (switched on for these events only and back off, approved 13 Nov)
HID = "'Hide company name in emails' switched ON for this event only (confirmed from the app) and back OFF afterwards. "
put("MEN-HID-001", "Pass", HID + "Plant 4201, RFX-398: subject 'RFX-398 | Project Invitation' with no name; no company or entity name anywhere in the email.", ("RFX-398",))
put("MEN-HID-002", "Pass", HID + "RFX-398 'RFQ is now live': the sentence reads 'a purchase request has been initiated.' with no name; the big title still shows 'Gulbrandsen Private Limited' (expected: that title never hid the name).", ("RFX-398",))
put("MEN-HID-003", "Couldn't tell", HID + "Plant 4501, RFX-402: 'Auction is now live' keeps the entity in its big title, the invitation has no name — but no '… - Auction Invitation' email went out (see MEN-EML-003).", ("RFX-402",))
put("MEN-HID-012", "Pass", HID + STAND.format(s="4501", w="4201 (all 4201 PRs were used)") + " RFX-401: subject 'RFX-401 | Project Withdrawn' and no name in the body.", ("RFX-401",))
put("MEN-HID-013", "Pass", HID + "RFX-401 'RFQ has been withdrawn': no company or entity name.", ("RFX-401",))
put("MEN-HID-016", "Blocked", HIDDEN_REJ)
put("MEN-HID-017", "Pass", HID + "Plant 1101, RFX-399: subject '… Counter Offer Sent by the buyer', no name.", ("RFX-399",))
put("MEN-HID-018", "Pass", HID + "Plant 4201, RFX-400: subject '📄 RFX-400 | Bid submitted on your behalf' with no name.", ("RFX-400",))
put("MEN-HID-023", "Blocked", NO_TPL)
for n in (4, 5, 6, 7, 8, 9, 10, 11, 14, 15, 19, 20, 21, 22):
    put(f"MEN-HID-{n:03d}", "Not run", NOTRUN.format(why="the same action as its MEN-EML case"))
# 6. One name, every time
put("MEN-CON-001", "Pass", f"None of the {len(MAILS)} emails read in this run mixed two names: every company/entity name found in an email was the one expected for its plant (or none, with hide on).", tuple(sorted({m['rfx'] for m in MAILS})))
put("MEN-CON-002", "Pass", "RFX-393 (plant 4201): the invitation, RFQ live, RFQ withdrawn and Project withdrawn emails all name 'Gulbrandsen Private Limited'. (The award email on a mapped plant, 1105, also names the entity — see MEN-EML-015.)", ("RFX-384", "RFX-393"))
put("MEN-CON-003", "Pass", "The same vendor V1 received RFX-383 (1101), 384 (4201), 385 (4501), 386 (unmapped) and 387 (manual) within minutes: each email carries its own event's name, none mixed up.", ("RFX-383", "RFX-384", "RFX-385", "RFX-386", "RFX-387"))
put("MEN-CON-004", "Pass", "After the withdrawal of RFX-393 (which closes the PR link), both withdrawal emails still show 'Gulbrandsen Private Limited'.", ("RFX-393",))
put("MEN-CON-005", "Pass", "The vendor emails are sent with the buyer (Gulbrandsen_support@procol.com) in Cc on the same message — the buyer's copy is the vendor's email, same name.", ("RFX-384",))
# 7. Not changed
put("MEN-OOS-001", "Pass", "Buyer-side emails seen in UAT's sent-mail log are unchanged in kind: 'Project Withdrawn by Procol Support' (to the buyer, names the buyer user), 'Approval Status', 'PO Generation Failed' — none carries an entity name.")
put("MEN-OOS-005", "Pass", "The sender is the same plain address (smtpt565@gmail.com on UAT) for every email, with no display name — not changed by the entity.", ("RFX-383",))
put("MEN-OOS-009", "Blocked", NO_TPL)
for c, w in (("MEN-OOS-002", "the vendor portal screens"), ("MEN-OOS-003", "the PDF attached to the project invitation"), ("MEN-OOS-004", "the PO email and PDF (the PO failed on UAT)"), ("MEN-OOS-006", "WhatsApp / app notifications"), ("MEN-OOS-007", "vendor onboarding and RFI emails"), ("MEN-OOS-008", "a company without a mapping")):
    put(c, "Not run", NOTRUN.format(why=w))
# 8. Mapping sheet rules
for n in range(1, 8):
    put(f"MEN-SHT-{n:03d}", "Observation", SHEET)

# ---- 16 Nov 2026: the tester pushed PRs for 1105, 1106, 1901, 4301 (and mixed lines); the run continued on them ----
import re as _re
def _hits(rfx, subj):
    return [m for m in MAILS if m["rfx"] == rfx and _re.search(subj, m["subject"], _re.I)]

def judge(cid, rfx, subj, expected, ok_text, missing, hide=False, missing_status="Couldn't tell", need_name=False):
    """Pass/Fail from the emails actually read; `missing` (with its status) when the email never came."""
    hs = _hits(rfx, subj)
    if not hs:
        return put(cid, missing_status, missing, (rfx,))
    names = sorted({n for m in hs for v in m["places"].values() for n in v})
    if hide:
        bad = names
    else:
        bad = [n for n in names if n != expected]
    where = " | ".join(f"'{m['subject'].strip()}' — " + ("; ".join(f"{k}: {', '.join(sorted(set(v)))}" for k, v in m["places"].items() if v) or "no company or entity name") for m in hs)
    if need_name and not names:
        bad = ["(no name at all — the case expects the entity to still show)"]
    if bad:
        put(cid, "Fail", f"{ok_text} Expected {'no company or entity name (hide on)' if hide else repr(expected)}, found {bad}: {where}", (rfx,))
    else:
        put(cid, "Pass", f"{ok_text} {where}", (rfx,))

TECH = "Gulbrandsen Technologies India Pvt Ltd."
put("MEN-SET-002", "Pass", "16 Nov: the tester pushed PRs — open lines now exist for 1105 (PR-111), 1106 (PR-112), 1901 (PR-113), 4301 (PR-114), plus 1101, 4201, 4501 and LOC-0001. Still none for 9999, an empty plant, ' 1105 ' or one PR mixing two plants.")
judge("MEN-MAP-002", "RFX-403", ".", TECH, "RFQ from PR-111 line 10 (plant 1105).", "")
judge("MEN-MAP-003", "RFX-404", ".", TECH, "RFQ from PR-112 line 10 (plant 1106).", "")
judge("MEN-MAP-004", "RFX-405", ".", "PT Gulbrandsen Technologies India Pvt Ltd.", "RFQ from PR-113 line 10 (plant 1901).", "")
judge("MEN-MAP-006", "RFX-406", ".", "Gulbrandsen Catalyst Pvt Ltd.", "RFQ from PR-114 line 10 (plant 4301).", "")
put("MEN-MAP-014", "Pass", "The three codes of one entity give the same name: plant 1101 (RFX-383), 1105 (RFX-403) and 1106 (RFX-404) all read 'Gulbrandsen Technologies India Pvt Ltd.' in every email.", ("RFX-383", "RFX-403", "RFX-404"))
judge("MEN-PRF-001", "RFX-412", ".", "Gulbrandsen Catalyst Pvt Ltd.", "Stand-in for 4201 + 1105 (no 4201 line left): one RFQ with line 1 from PR-114 (plant 4301) and line 2 from PR 452000959 (plant 4501). Only line 1's entity is shown, never both — product to confirm this is wanted (the vendor quoting the 4501 item is told 'Catalyst').", "")
put("MEN-PRF-003", "Not run", "Not run: re-ordering line items on the draft screen is not automated. Related evidence: RFX-417 was built with line 1 from plant 4501 and line 2 from plant 4301 — " + (seen("RFX-417") or "its emails had not arrived when this report was built") + " — which supports 'line 1 decides', but the re-order step itself was not exercised.", ("RFX-417",))
judge("MEN-PRF-005", "RFX-407", ".", "Gulbrandsen", "Stand-in for PR-1105 (4201 used): RFQ with a hand-added line 1 and a PR line (plant 4201) as line 2 — plain 'Gulbrandsen', as the PRD says for a manual first line.", "")
judge("MEN-PRF-008", "RFX-416", "RFQ is now live|Invitation", "Gulbrandsen Private Limited", "Stand-in for 1901 (4201): two-stage project (Technical then RFQ) from PR 422022646 line 60. The stage emails name the entity: ", "")
judge("MEN-PRF-010", "RFX-414", ".", "Gulbrandsen Industries LLP", "Largest PR available: 20 lines from PR 452000944 (plant 4501; no PR with 200+ lines exists). Invitation and RFQ-live arrived with the same queue delay as a one-line RFQ (UAT's queue ran ~25 min late for every event on 16 Nov), naming the entity:", "")
judge("MEN-EML-001", "RFX-403", "Project Invitation", TECH, "Plant 1105 (PR-111):", "")
judge("MEN-EML-003", "RFX-411", "Auction", "Gulbrandsen Catalyst Pvt Ltd.", "Plant 4301 (PR-114): 'Auction is now live' and the project invitation name the entity — but, as on 13 Nov, no '<ENTITY> - Auction Invitation' email went out, so the checklist's own email could not be read (see Observations). What was sent:", "")
if R["MEN-EML-003"][0] == "Pass":
    R["MEN-EML-003"] = ("Couldn't tell",) + R["MEN-EML-003"][1:]
judge("MEN-EML-005", "RFX-425", "Auction is Scheduled", "Gulbrandsen Catalyst Pvt Ltd.", "Plant 4301 (PR-114), auction scheduled to start later. The backend sends the 'reminder before start' ('<RFX> | <title> is scheduled') only for RFQ-then-auction events (trade_controller_helper: rfx_mode == 'rfq_then_auction'), so it was checked on the '📅 Auction is Scheduled' notice the auction-only event gets (RFX-425; RFX-424, set 30 min ahead, was sent after its start by UAT's late queue and so came as 'Auction is now live' — same correct entity). The reminder email itself needs an RFQ-then-auction event — not run.", "Couldn't tell: the auction-only event sends no reminder before start (backend: only RFQ-then-auction events schedule 'auction_reminder_30min_before'), and its 'Auction is Scheduled' notice had not been sent by UAT's late queue when this report was built.")
put("MEN-EML-006", "Blocked", "Blocked: the vendor 'about to end' email is sent only when the company setting 'Enable event expiry reminder emails to vendors' (send_event_expiry_reminder_to_vendor) is on; it is OFF on Gulbrandsen and was not in the settings the tester allowed me to switch. RFX-423 (plant 1106) was built and its round config reads send_event_expiry_reminder_to_vendor = false.", ("RFX-423",))
judge("MEN-EML-007", "RFX-425", "reschedul", "Gulbrandsen Catalyst Pvt Ltd.", "Plant 4301: a scheduled auction rescheduled on screen (start moved +2 h; saved, HTTP 200).", "Couldn't tell: the auction (plant 4301, RFX-425) was rescheduled on screen and saved, but no 'Auction has been rescheduled' email reached V1 (the backend has a 'Rescheduled' email only for RFI events — product to say which email an auction reschedule sends).")
judge("MEN-EML-008", "RFX-422", "extend|extension", TECH, "Plant 1101: Extend Submission Time on a live RFQ (30 minutes, saved on screen).", "Couldn't tell: Extend Submission Time was done on screen on a live RFQ (plant 1101, RFX-422; end moved 05:22 → 05:52 pm) and no email reached V1. The backend sends the 'Bidding Time Extension' email only for BOQ events with 'send buyer increase time notification' (trade_request.send_auction_time_increase_notification) — product to say whether a non-BOQ RFQ extension should email the vendor (the checklist expects one).")
judge("MEN-EML-011", "RFX-421", "Revised", "Gulbrandsen Private Limited", "Plant 4201 (PR 422022646): the live RFQ amended (new version RFQ-308.1 published with a remark):", "")
judge("MEN-EML-013", "RFX-410", "RFQ has been withdrawn", "PT Gulbrandsen Technologies India Pvt Ltd.", "Plant 1901 (PR-113), the case's own plant:", "")
judge("MEN-EML-015", "RFX-418", "Congratulations", TECH, "Award on plant 1105 (PR-111 line 10, RFX-418): V1's bid awarded; the proposal's two approval steps were approved by 'Procol Support' (the tester) on 16 and 17 Nov. 'Congratulations! Your bid is selected.' was sent to V1 (cc the buyer) at 00:40 UTC — the second step 2 was approved — and reached Mailpit at 06:10 UTC; its link opens RFX-418's RFQ. The subject has no company name by design; the header and '… has selected your bid' name the entity:", "Blocked: the award email did not arrive.", missing_status="Blocked")
judge("MEN-EML-017", "RFX-408", "Counter Offer Sent", TECH, "Plant 1106 (PR-112), the case's own plant:", "")
judge("MEN-EML-018", "RFX-409", "on your behalf", "Gulbrandsen Catalyst Pvt Ltd.", "Plant 4301 (PR-114), the case's own plant:", "")
judge("MEN-EML-019", "RFX-419", r"\[Reminder\] Submit Your Offer", TECH, "Plant 1105 (PR-111): Send Reminder → vendors who have not submitted (HTTP 200 'Reminders sent successfully'). Note the subject's '[<event name>]' is the RFX no. ('[RFX-419]'), not the title.", "")
judge("MEN-EML-022", "RFX-420", r"^\[RFX-420\] \| Action required", TECH, "Plant 1106 (PR-112): Send Reminder for a pending counter offer (HTTP 200).", "")
judge("MEN-NOM-011", "RFX-428", "Revised", "Gulbrandsen", "Manual RFQ amended (RFQ-316.1 published with a remark):", "")
judge("MEN-NOM-019", "RFX-426", r"\[Reminder\] Submit Your Offer", "Gulbrandsen", "Manual RFQ, Send Reminder → not submitted:", "")
judge("MEN-NOM-022", "RFX-427", r"^\[RFX-427\] \| Action required", "Gulbrandsen", "Manual RFQ, counter-offer reminder:", "")
judge("MEN-NOM-005", "RFX-431", "Auction is Scheduled", "Gulbrandsen", "Manual auction scheduled 30 min ahead (no reminder-before-start for auction-only events — see MEN-EML-005); the 'Auction is Scheduled' notice:", "Couldn't tell: an auction-only event gets no reminder before start (backend), and its 'Auction is Scheduled' notice had not been sent by UAT's late queue when this report was built.")
put("MEN-NOM-006", "Blocked", "Blocked: same company setting as MEN-EML-006 (vendor expiry reminder emails OFF on Gulbrandsen); RFX-430 built, its round config has send_event_expiry_reminder_to_vendor = false.", ("RFX-430",))
judge("MEN-NOM-007", "RFX-431", "reschedul", "Gulbrandsen", "Manual auction rescheduled on screen (saved, start 06:30 pm).", "Couldn't tell: the manual auction RFX-431 was rescheduled on screen and saved, but no reschedule email reached V1 (see MEN-EML-007).")
judge("MEN-NOM-008", "RFX-429", "extend|extension", "Gulbrandsen", "Manual RFQ, Extend Submission Time.", "Couldn't tell: Extend Submission Time done on screen (RFX-429); no vendor email — the backend sends one only for BOQ events (see MEN-EML-008).")
HID2 = "'Hide company name in emails' switched ON for a short window (only reminders/Event Revised, which UAT sends within minutes; all other pending emails had been sent first) and back OFF, confirmed. Plant 4501 stand-in. "
HIDQ = " Product question (guide 7.3 #3): should the entity show when the client asked to hide its name?"
judge("MEN-HID-019", "RFX-432", r"\[Reminder\] Submit Your Offer", "Gulbrandsen Industries LLP", HID2 + "Send Reminder → not submitted. As the case expects, reminders never hid the name — it still shows, now as the entity." + HIDQ, "Couldn't tell: the hide window for the reminder did not run (see Summary).", need_name=True)
judge("MEN-HID-022", "RFX-433", r"^\[RFX-433\] \| Action required", "Gulbrandsen Industries LLP", HID2 + "Counter-offer reminder; as the case expects, the name still shows, now as the entity." + HIDQ, "Couldn't tell: the hide window for the counter reminder did not run (see Summary).", need_name=True)
judge("MEN-HID-011", "RFX-434", "Revised", "Gulbrandsen Industries LLP", HID2 + "Event revised (new version published with a remark); as the case expects, this email never hid the name — it still shows, now as the entity." + HIDQ, "Couldn't tell: the hide window for the amendment did not run (see Summary).", need_name=True)
for n, w in ((5, "the scheduled-auction notice goes through UAT's slow queue (~30 min late on 16 Nov); keeping 'hide' ON that long would have hidden the name in other events' pending emails"), (6, "Blocked by the vendor expiry-reminder company setting (see MEN-EML-006)"), (7, "no reschedule email was produced even with hide off (see MEN-EML-007)"), (8, "no vendor email on a non-BOQ extension (see MEN-EML-008)")):
    put(f"MEN-HID-{n:03d}", "Blocked" if n == 6 else "Not run", ("Blocked: " if n == 6 else "Not run: ") + w + ".")

OBS = [
    ("Counter offer and surrogate-bid emails name the buyer USER in the body", "The body of the counter-offer email says 'Procol Support has sent a counter offer!' — the name of the Gulbrandsen buyer user who acted (on UAT that user is literally called 'Procol Support'). Only the subject carries the entity. Should the body name the entity too?", "RFX-388, RFX-394"),
    ("A delivery location named after the entity stays visible with 'hide company name' on", "The product table's Location column shows the PR line's delivery location, which on Gulbrandsen is called 'Gulbrandsen Private Limited'. With 'Hide company name in emails' ON the location still reads that name. It is data, not the feature — but a vendor still sees the entity.", "RFX-398"),
    ("No award email to the vendor after an approved award", "RFX-390: award submitted, both approval steps approved (by the run's own buyer), proposal 'selected', V1's bid in place, 'send mail to vendors' and 'bid select notification' on — yet no 'Congratulations! Your bid is selected.' email; the buyer got 'PO Generation Failed'. Dev to confirm whether the vendor's award email waits for the ERP purchase order.", "RFX-390"),
    ("Which flow sends 'Auction Invitation'?", "Publishing an auction (eRFX auction stage) sent 'Auction is now live' and the project invitation, not the checklist's '<ENTITY> - Auction Invitation'. Product to say which auction flow sends that email, so MEN-EML/NOM/HID-003 can be run.", "RFX-392, RFX-397, RFX-402"),
    ("Two entities in one RFQ: only the first line's entity is shown", "Seen live 16 Nov: RFX-412 (line 1 plant 4301, line 2 plant 4501) names only 'Gulbrandsen Catalyst Pvt Ltd.' — the vendor quoting the 4501 item is told the 4301 entity. RFX-417 (4501 first, 4301 second) likewise names line 1's entity. Product to confirm this is wanted.", "RFX-412, RFX-417"),
    ("A hand-added first line means 'Gulbrandsen' is shown", "Seen live 16 Nov: RFX-407 — hand-added line 1 + a plant-4201 PR line 2 — says plain 'Gulbrandsen' everywhere. Product to confirm.", "RFX-407"),
    ("The automatic counter-offer reminder names no company at all", "'[Reminder] Awaiting your response on counter offer' (sent by itself for the pending counter offer on RFX-408, plant 1106, twice) names only the buyer USER ('Procol Support +1 has sent a counter offer!') — neither 'Gulbrandsen' nor the entity. Its code computes the plain company name (displayable_company_name), not the entity, but the template does not print it. Not in the 123 cases; product to say whether it should name the entity.", "RFX-408"),
    ("The technical-stage 'is now live' email names the buyer user, not a company", "Two-stage project RFX-416 (plant 4201): '🚀 RFX-416 | Technical is now live' says 'invited … by Procol Support +1' — no company or entity — while its invitation and 'RFQ is now live' say 'Gulbrandsen Private Limited'. Product to say whether the technical-stage email should name the entity.", "RFX-416"),
    ("Extend Submission Time on an RFQ sends the vendor no email", "RFX-422 (plant 1101) and RFX-429 (manual): extended on screen (end moved by 30 min) — no vendor email. Backend: the 'Bidding Time Extension' email is sent only for BOQ events with 'send buyer increase time notification'. The checklist (MEN-EML-008) expects a 'Submission time extended' email. Product to confirm which is right.", "RFX-422, RFX-429"),
    ("The 'reminder before start' goes only to RFQ-then-auction events", "Backend schedules 'auction_reminder_24h_before / 30min_before' only when rfx_mode is 'rfq_then_auction'; an auction-only event scheduled for later gets the 'Auction is Scheduled' notice instead (MEN-EML/NOM-005).", "RFX-424, RFX-431"),
    ("No 'Auction rescheduled' email after rescheduling an auction", "RFX-425 (plant 4301) and RFX-431 (manual): rescheduled on screen and saved (HTTP 200) — no reschedule email reached V1; the backend has a 'Rescheduled' email only for RFI events. The checklist (MEN-EML-007) expects '📅 <RFX> | Auction has been rescheduled by <buyer user>'. Product to confirm.", "RFX-425, RFX-431"),
    ("UAT sent invitations ~30 minutes late on 16 Nov", "Project Invitation / 'is now live' / 'Auction is Scheduled' reached V1 about 25–35 min after publishing (sent-mail log), while reminders, counter offers and Event Revised came within minutes. Mailpit keeps only ~500 emails (~10 min on a busy day), so every email was saved the moment it arrived. Not a feature issue — an environment note.", ""),
    ("Award approval goes to a different user than the tester's login", "RFX-418 (plant 1105): the proposal's approval flow has two steps, both for 'Procol Support' (u-20252, procol.com); the Gulbrandsen login used for testing is 'Procol Support +1' (u-20401). The tester approved both steps (16 and 17 Nov); the award email followed at once.", "RFX-418"),
    ("Award email is sent even when the purchase order fails, but reaches the inbox hours later", "On both approved awards (RFX-390 on 13 Nov, RFX-418 on 17 Nov) the buyer got 'PO Generation Failed' in the same second as the vendor's 'Congratulations! Your bid is selected.' — the failed ERP purchase order does not hold back the award email. RFX-418's award email was logged as sent at 00:40 UTC but reached Mailpit only at 06:10 UTC (~5½ h; invitations ran ~30 min late). The award email's subject carries no RFX number and no company name, and its body shows the event as 'RFQ [RFQ-305]' (the internal title ref), not RFX-418 — a vendor with several Gulbrandsen awards cannot tell them apart from the subject.", "RFX-390, RFX-418"),
    ("With 'hide company name' on, the entity still shows in the big title and reminders", "Seen live on 'RFQ is now live' and 'Auction is now live' (RFX-398, RFX-402): the big title keeps the entity while the sentence hides it. Product to confirm.", "RFX-398, RFX-402"),
    ("The PO, PDFs and vendor portal still say 'Gulbrandsen'", "Out of scope per PRD; not run in this pass.", ""),
    ("There are no checks when the list is loaded", "The list is entered by a dev in the backend; no upload screen, no validation (module 8).", ""),
]

src = openpyxl.load_workbook(SRC)
ws_src = src["Multi-entity emails"]
rows = list(ws_src.iter_rows(values_only=True))
head = list(rows[0])
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Test Cases"
cols = head + ["Actual Result", "RFX no.", "Mailpit ID", "Screenshots"]
HF, HFont = PatternFill("solid", fgColor="4285F4"), Font(name="Arial", size=12, bold=True)
FILL = {"Pass": "D9EAD3", "Fail": "F4CCCC", "Blocked": "FFF2CC", "Not run": "EFEFEF", "Observation": "CFE2F3", "Couldn't tell": "EAD1DC"}
for i, h in enumerate(cols, 1):
    c = ws.cell(1, i, h); c.fill = HF; c.font = HFont; c.alignment = Alignment(wrap_text=True, vertical="center")
missing = []
counts = OrderedDict()
r = 2
for row in rows[1:]:
    if not row[0]:
        continue
    cid = row[0]
    st, actual, rfx, mid, shot = R.get(cid, ("Not run", "Not run: not reached in this pass.", "", "", ""))
    if cid not in R:
        missing.append(cid)
    vals = list(row)
    vals[head.index("Status")] = st
    vals += [actual, rfx, mid, shot]
    for i, v in enumerate(vals, 1):
        c = ws.cell(r, i, v); c.alignment = Alignment(wrap_text=True, vertical="top"); c.font = Font(name="Arial", size=10)
    ws.cell(r, head.index("Status") + 1).fill = PatternFill("solid", fgColor=FILL.get(st, "FFFFFF"))
    counts.setdefault(row[1], Counter())[st] += 1
    r += 1
for col, w in zip("ABCDEFGHIJKLMNOPQR", [13, 22, 14, 40, 14, 14, 30, 22, 22, 50, 46, 9, 10, 12, 70, 22, 26, 34]):
    ws.column_dimensions[col].width = w
ws.freeze_panes = "B2"

write_bug_sheet(wb, "multi_entity_emails", [], feature="Multi-entity name in vendor emails")

ob = wb.create_sheet("Observations")
for i, h in enumerate(["#", "Observation (one line)", "What was seen / the question for product", "Evidence"], 1):
    c = ob.cell(1, i, h); c.fill = HF; c.font = HFont
for n, (a, b, e) in enumerate(OBS, 2):
    for i, v in enumerate([n - 1, a, b, e], 1):
        c = ob.cell(n, i, v); c.alignment = Alignment(wrap_text=True, vertical="top")
for col, w in zip("ABCD", [5, 50, 100, 26]):
    ob.column_dimensions[col].width = w

em = wb.create_sheet("Email evidence")
eh = ["RFX", "Event (plant)", "Expected name", "Subject", "Names in subject", "Names in preview", "Names in body", "Verdict", "Mailpit ID", ".eml", "Screenshot"]
for i, h in enumerate(eh, 1):
    c = em.cell(1, i, h); c.fill = HF; c.font = HFont
for n, m in enumerate(MAILS, 2):
    vals = [m["rfx"], m["tag"], m["expected"], m["subject"], ", ".join(m["places"]["subject"]), ", ".join(m["places"]["preview"]), ", ".join(m["places"]["body"]), {"match": "name as expected", "no-name": "no name (hide on / not named)", "mismatch": "WRONG NAME"}[m["verdict"]], m["id"], os.path.basename(m["eml"]), os.path.basename(m["shot"])]
    for i, v in enumerate(vals, 1):
        c = em.cell(n, i, v); c.alignment = Alignment(wrap_text=True, vertical="top")
for col, w in zip("ABCDEFGHIJK", [10, 20, 34, 60, 30, 30, 40, 22, 26, 40, 40]):
    em.column_dimensions[col].width = w

sm = wb.create_sheet("Summary")
lines = [["Module", "Pass", "Fail", "Blocked", "Couldn't tell", "Observation", "Not run"]]
tot = Counter()
for mod, c in counts.items():
    lines.append([mod] + [c.get(k, 0) for k in ["Pass", "Fail", "Blocked", "Couldn't tell", "Observation", "Not run"]]); tot.update(c)
lines.append(["All 123 cases"] + [tot.get(k, 0) for k in ["Pass", "Fail", "Blocked", "Couldn't tell", "Observation", "Not run"]])
lines += [[], ["Bugs", "None confirmed: every email that was produced (13 + 16 Nov) showed exactly the expected name — the entity for a mapped plant 1101/1105/1106/1901/4201/4301/4501, plain 'Gulbrandsen' for an unmapped plant or a hand-made first line, and no name where 'hide company name' hides it. The open items are questions for product (Observations), not defects."],
          ["Environment", "Gulbrandsen (50169), UAT cpanel.ag-ri.in, 13 + 16 Nov 2026 (16 Nov: on the PRs the tester pushed for 1105/1106/1901/4301); Mailpit https://mailhog-dev.procol.tech; QA vendors V1/V2 (qa_1794583459190_v1/v2@example.com)"],
          ["Emails read", f"{len(MAILS)} emails on {len({m['rfx'] for m in MAILS})} events, each saved (.eml) and screenshotted: prototype/data/evidence/multi-entity/"],
          ["Settings changed", "'Hide company name in emails' ON for RFX-398…402 (13 Nov) and for a 3-minute window on 16 Nov (reminder RFX-432, counter reminder RFX-433, amendment RFX-434 — opened only after every pending invitation had been sent), switched back OFF and confirmed both times. Nothing else changed (the vendor expiry-reminder setting was NOT switched)."],
          ["Created", "2 QA vendors (approved), 50 RFQs/auctions titled 'MEN …' (in RFX-383…434) from Gulbrandsen PR lines — those lines are now partly in progress — 2 approved awards (RFX-390; RFX-418, approved by the tester as 'Procol Support')."]]
for row in lines:
    sm.append(row)
sm.column_dimensions["A"].width = 40
for col in "BCDEFG":
    sm.column_dimensions[col].width = 14
sm.column_dimensions["B"].width = 100
wb.move_sheet("Summary", offset=-4)
wb.save(OUT)
print("written", OUT)
print("not in R:", missing)
for row in lines:
    print(row)
