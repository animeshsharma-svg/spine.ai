#!/usr/bin/env python3
"""Multi-entity name in vendor emails (Gulbrandsen) — manual test cases in plain language.
Sources: PRD "Multi-Entity Name in Vendor Emails via PR Field Mapping" (update 5 Nov 2026) and
backend PR Procol-Tech/procol-backend#17775 (feat/multi_entity_email_name, open on 13 Nov 2026).
Where the PRD and the build differ, the case says so and asks to confirm with product.
Output: test-cases/Multi_Entity_Email_Test_Cases.xlsx (sheet 1 = cases, sheet 2 = email checklist)"""
import re
from collections import Counter
from pathlib import Path
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

OUT = Path(__file__).resolve().parent / "Multi_Entity_Email_Test_Cases.xlsx"
COLS = ["Test Case ID", "Module", "Scenario", "Test Case Title", "User Role", "Portal", "Pre-conditions", "Configs Needed",
        "Test Data", "Test Steps", "Expected Result", "Priority", "Test Type", "Status"]
CASES = []; _n = Counter()

CO = "Gulbrandsen"   # the company name set in the Procol dashboard
ENT = {
    "1101": "Gulbrandsen Technologies India Pvt Ltd.",
    "1105": "Gulbrandsen Technologies India Pvt Ltd.",
    "1106": "Gulbrandsen Technologies India Pvt Ltd.",
    "1901": "PT Gulbrandsen Technologies India Pvt Ltd.",
    "4201": "Gulbrandsen Private Limited",
    "4301": "Gulbrandsen Catalyst Pvt Ltd.",
    "4501": "Gulbrandsen Industries LLP",
}
MAP_ON = ("Entity name mapping switched ON for the test company by the dev (backend only, no screen): "
          "PR line-item field 'plant' → entity name, with the 7 Gulbrandsen plant codes (see MEN-SET-001). "
          "'Hide company name in emails' = Off")
MAP_OFF = "No entity name mapping for the company (the normal state for every other client). 'Hide company name in emails' = Off"
HIDE_ON = MAP_ON.replace("'Hide company name in emails' = Off", "'Hide company name in emails' = ON")
PRE = (f"Logged in to the buyer portal of the test company on UAT (company name in Procol = '{CO}'). "
       "QA vendors V1 and V2 are on the event; their emails land in Mailpit (MEN-SET-003).")
BUYER = "Buyer (event owner)"


def ev(plant):
    return f"Event P{plant}: an RFQ created from a PR whose line items have Plant = {plant} (expected entity: {ENT[plant]})"


def case(prefix, module, scenario, title, steps, expected, *, pre=PRE, data="", priority="High", ttype="Positive",
         role=BUYER, portal="Buyer portal + Mailpit", configs=MAP_ON):
    _n[prefix] += 1
    CASES.append({"Test Case ID": f"MEN-{prefix}-{_n[prefix]:03d}", "Module": module, "Scenario": scenario,
                  "Test Case Title": title, "User Role": role, "Portal": portal, "Pre-conditions": pre,
                  "Configs Needed": configs, "Test Data": data,
                  "Test Steps": "\n".join(f"{i+1}. {s}" for i, s in enumerate(steps)),
                  "Expected Result": expected, "Priority": priority, "Test Type": ttype, "Status": "Not Run"})


INBOX = "Open Mailpit (https://mailhog-dev.procol.tech/) and search for the RFX number of the event, sent to V1"
LOOK = "Open the email and read the subject line, the big title next to the logo at the top, every sentence of the body and the sign-off"

# ════════════════════════════════════════════════════════════════════════════
M = "0. Set-up"
case("SET", M, "Mapping", "Check the plant code → entity mapping is switched on for Gulbrandsen UAT",
     ["Ask the dev (or read it from the read-only UAT database) whether the entity name mapping is on for company Gulbrandsen (50169)",
      "Check it holds exactly these 7 codes, keyed on the PR line item's Plant field:\n" + "\n".join(f"{k} → {v}" for k, v in ENT.items())],
     "The mapping is on with all 7 codes. (Checked on 13 Nov 2026: set on 9 Nov, and RFX-382 already sent 'Project Invitation from "
     "Gulbrandsen Technologies India Pvt Ltd.' on 12 Nov.)",
     pre="Backend PR #17775 is deployed on UAT", data="The PRD table", priority="Critical",
     role="QA + Procol dev", portal="Backend (dev)", configs="—")
case("SET", M, "PRs", "Find (or get pushed) a PR for every plant code, plus PRs for the special cases",
     ["Open the PR list of Gulbrandsen UAT and find open PRs with Plant 1101, 4201 and 4501 (these exist), and with an unmapped plant such as 1001 or LOC-0001",
      "Ask the dev to push PRs from the ERP PR API for the plants that have no PR on UAT: 1105, 1106, 1901, 4301",
      "Also ask for: PR-9999 (Plant 9999), PR-BLANK (Plant empty), PR-SPACE (Plant ' 1105 '), PR-MIX (line 1 = 4201, line 2 = 1105)",
      "Open each PR and check the Plant value shown on its line items"],
     "Every PR shows the plant code exactly as written. Note each PR number. Cases whose plant has no PR are Blocked until it is pushed; "
     "1101 can stand in for 1105 and 1106 because all three map to the same entity (say so in Actual Result).",
     data="Existing: 1101, 4201, 4501, 1001, LOC-0001. To be pushed: 1105, 1106, 1901, 4301, 9999, blank, ' 1105 ', mixed",
     priority="Critical", portal="Buyer portal")
case("SET", M, "Mailboxes", "Make sure the vendor emails can be read in Mailpit",
     ["Use QA vendors V1 and V2 whose addresses are test addresses (not real people, not on UAT's 'allowed real emails' list, so UAT sends their mail to Mailpit)",
      "Send any invite to V1 and open https://mailhog-dev.procol.tech/ ; search for the RFX number"],
     "The invite shows up in Mailpit within a few minutes. Mailpit keeps only the latest ~500 emails (about 45 minutes on a busy day), "
     "so save every email as soon as it arrives.",
     priority="Critical", portal="Buyer portal + Mailpit", configs="—")
case("SET", M, "Events", "Build the events used by the email cases",
     ["From each PR in MEN-SET-002 create an RFQ: open the PR → create event / add to RFQ → add V1 and V2 → publish",
      "Name each event after its PR so it is easy to find: 'MEN P1105', 'MEN P4201' and so on",
      "Also create 'MEN MANUAL': an RFQ made by hand with no PR",
      "Also create one auction event from PR-4301 and one multi-lot (basket) event from PR-1901"],
     "All events are live with V1 and V2 invited. Keep a list of RFX numbers against each plant code.",
     data="Events P1101, P1105, P1106, P1901, P4201, P4301, P4501, P9999, PBLANK, PSPACE, PMIX, MANUAL",
     priority="Critical", portal="Buyer portal")

# ════════════════════════════════════════════════════════════════════════════
M = "1. Plant code → entity name"
for code in ENT:
    case("MAP", M, f"Plant {code}", f"Invite for an RFQ from a plant {code} PR shows '{ENT[code]}'",
         [f"Open event 'MEN P{code}' (created from PR-{code})", "Publish it with vendor V1 invited (or use the invite already sent)", INBOX, LOOK],
         f"Wherever the buyer's name appears, it reads '{ENT[code]}', spelt exactly like this, full stop included. "
         f"The word '{CO}' alone does not appear as the buyer name anywhere in the email.",
         data=ev(code), priority="Critical" if code in ("1105", "4201") else "High")
case("MAP", M, "Not in mapping", "Plant code that is not in the mapping falls back to the company name",
     ["Open event 'MEN P9999' (PR with Plant = 9999)", "Publish with V1 invited", INBOX, LOOK],
     f"The email shows '{CO}', exactly as it did before this feature. It must not show a blank, 'the buyer', the plant code, "
     "or the name of some other entity.", data="PR-9999, Plant = 9999 (not in the list)", priority="Critical", ttype="Negative")
case("MAP", M, "Empty plant", "PR with an empty Plant field falls back to the company name",
     ["Open event 'MEN PBLANK'", "Publish with V1 invited", INBOX, LOOK],
     f"The email shows '{CO}'. The email still goes out and there is no empty gap where the name should be.",
     data="PR-BLANK, Plant left empty", priority="High", ttype="Negative")
case("MAP", M, "Manual RFQ", "RFQ made by hand (no PR) keeps the company name",
     ["Open event 'MEN MANUAL'", "Publish with V1 invited", INBOX, LOOK],
     f"The email shows '{CO}', the same as before this feature.", data="Event MANUAL, no PR linked", priority="Critical", ttype="Negative")
case("MAP", M, "Near-miss code", "A plant code that only looks like a mapped one does not match",
     ["Create PRs with Plant = 01105 (leading zero) and Plant = 110 (part of the code); create an RFQ from each and publish", INBOX, LOOK],
     f"Both emails show '{CO}'. A code only matches when it is exactly the same as one in the list.",
     data="Plant = 01105, Plant = 110", priority="Medium", ttype="Negative")
case("MAP", M, "Letters in code", "Upper/lower case in a plant code is matched exactly",
     ["Ask the dev to add a test code 'AB12 → Test Entity Pvt Ltd' to the mapping",
      "Create one PR with Plant = AB12 and one with Plant = ab12; make an RFQ from each and publish", INBOX, LOOK],
     f"AB12 shows 'Test Entity Pvt Ltd'. ab12 shows '{CO}'. Note this to product: if the ERP can send codes in a different case, they will not match.",
     data="Plant = AB12 and ab12", priority="Low", ttype="Edge")
case("MAP", M, "Spaces", "Spaces before or after the plant code are ignored",
     ["Open event 'MEN PSPACE' (Plant = ' 1105 ')", "Publish with V1 invited", INBOX, LOOK],
     f"The email shows '{ENT['1105']}', the same as a clean 1105.", data="PR-SPACE", priority="Medium", ttype="Edge")
case("MAP", M, "Same entity for many codes", "Three plant codes that belong to one entity all show the same name",
     ["Compare the invites of events P1101, P1105 and P1106"],
     f"All three show '{ENT['1101']}', with identical spelling.", data=ev("1101") + "; P1105; P1106", priority="High")
case("MAP", M, "Blank entity name", "A plant code mapped to an empty entity name falls back to the company name",
     ["Ask the dev to map a test code 7777 to an empty name (or only spaces)", "Create an RFQ from a PR with Plant = 7777 and publish", INBOX, LOOK],
     f"The email shows '{CO}', never an empty name.", data="Plant 7777 → blank", priority="Medium", ttype="Negative",
     role="QA + Procol dev")
case("MAP", M, "Broken mapping", "A broken mapping does not stop emails going out",
     ["Ask the dev to save a deliberately broken mapping on UAT (for example the field name missing)", "Publish a new RFQ from PR-4201 with V1 invited", INBOX,
      "Ask the dev whether an error was reported to Sentry", "Ask the dev to restore the correct mapping"],
     f"The invite still arrives, with '{CO}' as the buyer name. The dev sees one error report. Nothing crashes for the buyer.",
     data="Broken mapping (dev)", priority="High", ttype="Negative", role="QA + Procol dev")
case("MAP", M, "Mapping changed", "Changing an entity name in the mapping is used from the next email",
     ["Ask the dev to change 4501 → 'Gulbrandsen Industries LLP (QA)'", "Publish a new RFQ from PR-4501 with V1 invited", INBOX,
      "Ask the dev to change it back"],
     "The new invite shows 'Gulbrandsen Industries LLP (QA)' straight away. Emails sent earlier are not changed (they are already in the inbox).",
     data=ev("4501"), priority="Medium", ttype="Edge", role="QA + Procol dev")
case("MAP", M, "Mapping switched off", "Switching the mapping off brings the company name back",
     ["Ask the dev to switch the mapping off the way the PR says (empty value AND status inactive)", "Publish a new RFQ from PR-1105", INBOX,
      "Ask the dev to switch it on again"],
     f"The invite shows '{CO}'. If it still shows the entity name, ask the dev how it was switched off: switching it off only with "
     "'inactive' keeps the old mapping for up to 24 hours (the PR warns about this).",
     data=ev("1105"), priority="Medium", ttype="Edge", role="QA + Procol dev")

# ════════════════════════════════════════════════════════════════════════════
M = "2. Which PR decides the name"
case("PRF", M, "Two plants in one RFQ", "RFQ with line items from two PRs of different entities uses the FIRST line item",
     ["Create one RFQ and add line items from PR-4201 first, then from PR-1105", "Publish with V1 invited", INBOX, LOOK],
     f"The email shows '{ENT['4201']}' (the entity of line item 1). It shows only one name, never both. "
     "Ask product whether this is acceptable: the vendor quoting for the plant-1105 item is told the wrong entity.",
     data="PR-4201 (line 1) + PR-1105 (line 2)", priority="High", ttype="Edge")
case("PRF", M, "Two plants in one PR", "One PR whose lines carry two different plant codes uses the first line",
     ["Open event 'MEN PMIX' (PR-MIX: line 1 = 4201, line 2 = 1105)", "Publish with V1 invited", INBOX, LOOK],
     f"The email shows '{ENT['4201']}'. Per the 5 Nov update this should not happen (one plant code per PR), but the system must still pick line 1 and not fail.",
     data="PR-MIX", priority="Medium", ttype="Edge")
case("PRF", M, "Order changed", "Changing the line item order changes which entity is shown",
     ["Create an RFQ with line 1 from PR-4201 and line 2 from PR-4301", "Before publishing, move the PR-4301 line to position 1 (if the screen allows re-ordering)", "Publish", INBOX, LOOK],
     f"The email shows '{ENT['4301']}', the entity of the line now at number 1.", data="PR-4201 + PR-4301", priority="Low", ttype="Edge")
case("PRF", M, "First line removed", "Deleting the first line item moves the name to the next line's entity",
     ["Create an RFQ with line 1 from PR-4201 and line 2 from PR-1901", "Delete line 1 before publishing", "Publish", INBOX, LOOK],
     f"The email shows '{ENT['1901']}'. The deleted line's entity is not used.", data="PR-4201 + PR-1901", priority="Medium", ttype="Edge")
case("PRF", M, "Manual line first", "A hand-added line item at position 1 hides the PR's entity",
     ["Create an RFQ, add one line item by hand (no PR) first, then add a line from PR-1105", "Publish", INBOX, LOOK],
     f"The build shows '{CO}', because line 1 has no PR. Report this to product as a question: the RFQ does carry a mapped PR, "
     "so a vendor may expect the entity name.", data="Manual line + PR-1105", priority="Medium", ttype="Edge")
case("PRF", M, "PR added later", "A PR line added to a manual RFQ after the first invite",
     ["Publish 'MEN MANUAL' with V1 invited (email shows the company name)",
      "Revise the event and add a line item from PR-4201 (if the screen allows adding PR lines to a live event)", "Check the 'Event revised' email and any later email"],
     f"Later emails follow the first line item. If line 1 is still the manual line, they keep showing '{CO}'. Note what you see.",
     data="Event MANUAL + PR-4201", priority="Low", ttype="Edge")
case("PRF", M, "Copied event", "An event copied from a PR-based event",
     ["Copy (duplicate) event 'MEN P4201' if the option exists", "Publish the copy with V1 invited", INBOX, LOOK],
     f"Write down the name shown. If the copy keeps the PR link, it shows '{ENT['4201']}'. If not, it shows '{CO}'. "
     "Confirm with product which one is right.", data=ev("4201"), priority="Low", ttype="Edge")
case("PRF", M, "Next stage", "A second stage of the same event shows the same entity",
     ["In event 'MEN P1901', after stage 1 ends, create the next RFQ / auction stage and publish it", "Check the emails for the new stage"],
     f"Every email of the new stage shows '{ENT['1901']}', the same as stage 1.", data=ev("1901"), priority="High")
case("PRF", M, "Vendor added later", "A vendor added after publishing gets the entity name too",
     ["In live event 'MEN P4301', add vendor V2", "Open V2's mailbox"], f"V2's invite shows '{ENT['4301']}'.",
     data=ev("4301"), priority="High")
case("PRF", M, "Large RFQ", "An RFQ with many line items still sends invites quickly with the right name",
     ["Create an RFQ from PR-1105 with 200+ line items (or the largest PR available)", "Publish with V1 and V2 invited", "Note the time from publish to email arrival"],
     f"Both vendors get the invite in about the same time as a normal RFQ, showing '{ENT['1105']}'.",
     data="PR-1105 with 200+ lines", priority="Low", ttype="Edge")
case("PRF", M, "Straight after creation", "The invite sent right after creating the RFQ from the PR already has the entity",
     ["From PR-4501 create the RFQ and publish it immediately, in one go", INBOX, LOOK],
     f"The very first invite shows '{ENT['4501']}', not '{CO}'.", data=ev("4501"), priority="High")

# ════════════════════════════════════════════════════════════════════════════
# One row per vendor email: name, how to make it go out, subject, where the name shows, what 'hide' does, priority, plant
EMAILS = [
    ("Project invitation", "Publish the project with V1 invited",
     "'<RFX no.> | Project Invitation from <ENTITY>'", "subject; the line 'You're invited by <ENTITY> in their event'; any process / guideline text that names the buyer",
     "hidden", "Subject becomes '<RFX no.> | Project Invitation' and the body says 'the buyer'", "Critical", "1105"),
    ("RFQ is live (RFQ invitation)", "Publish the RFQ stage so it goes live with V1 invited",
     "'🚀 <RFX no.> | RFQ is now live' (no buyer name in the subject)", "big title next to the logo; the sentence '<ENTITY> has initiated …'",
     "partly", "The sentence becomes '… has been initiated.' with no name. The big title at the top still shows <ENTITY> (it always showed the name)", "Critical", "4201"),
    ("Auction invitation", "Publish an auction stage with V1 invited (auction event from PR-4301)",
     "'<ENTITY> - Auction Invitation'", "subject; the sentence '<ENTITY> wants to buy <product> and is inviting you to participate in an auction.'",
     "partly", "Subject becomes 'Auction Invitation'. The body sentence still shows <ENTITY> (it always showed the name)", "High", "4301"),
    ("Multi-lot (basket) invitation", "Publish the multi-lot event with V1 invited (event from PR-1901)",
     "'<ENTITY> - RFQ Invitation'", "subject; big title at the top; the sentence '<ENTITY> has initiated …'",
     "partly", "Subject becomes 'RFQ Invitation'. Title and body still show <ENTITY>", "High", "1901"),
    ("Auction is scheduled (reminder before start)", "Schedule an auction to start later; wait for the reminder before start",
     "'<RFX no.> | <event title> is scheduled'", "the sentence '<ENTITY> has invited you to participate in <RFX no.> | <title>'",
     "shown", "Still shows <ENTITY> (this email never hid the name)", "High", "4301"),
    ("Submission about to end", "Let a live RFQ reach the 'about to end' reminder time (or set a short end time)",
     "'🔔 <RFX no.> | RFQ submission is about to end'", "'The Event <title> initiated by <ENTITY> is scheduled to end in …'",
     "hidden", "The sentence no longer names the buyer", "Critical", "1106"),
    ("Auction rescheduled", "Reschedule a scheduled auction",
     "'📅 <RFX no.> | Auction has been rescheduled by <buyer user>'", "'<ENTITY> has rescheduled <RFX no.> | <title>'",
     "hidden", "Body says 'the buyer has rescheduled …'", "High", "4301"),
    ("Submission time extended", "On a live RFQ use Extend Submission Time",
     "submission-extended email", "'<ENTITY> has extended the response submission time for <RFX no.> | <title>'",
     "hidden", "Body says 'the buyer has extended …'", "High", "1101"),
    ("Bidding time extension", "Extend the bidding time of a live RFQ / auction (the older 'Bidding Time Extension' email)",
     "'<ENTITY> - RFQ Bidding Time Extension'", "subject; big title at the top",
     "partly", "Subject becomes 'RFQ Bidding Time Extension'. Title still shows <ENTITY>", "Medium", "1101"),
    ("Best offer time extended", "Ask for best offer, then extend the best-offer time",
     "'Best Offer Submission Extended For <RFX no.> | <title> Event'", "body sentence naming the buyer",
     "hidden", "Body says 'the buyer'", "Medium", "4501"),
    ("Event revised", "Revise the live event (change something and save with a remark)",
     "'<RFX no.> | Event Revised'", "'Hi <vendor>, <ENTITY> revised the event in <RFX no.>.'",
     "shown", "Still shows <ENTITY> (this email never hid the name)", "High", "4201"),
    ("Project withdrawn", "Withdraw the whole project",
     "'<RFX no.> | Project Withdrawn by <ENTITY>'", "subject; '<ENTITY> has withdrawn <RFX no.> | <title>'",
     "hidden", "Subject becomes '<RFX no.> | Project Withdrawn' and the body '… has been withdrawn'", "Critical", "4201"),
    ("RFQ withdrawn", "Withdraw one RFQ stage",
     "'<RFX no.> | RFQ has been withdrawn'", "'<ENTITY> has withdrawn the RFQ.'",
     "hidden", "Body says 'the buyer has withdrawn the RFQ.'", "High", "1901"),
    ("Lot split", "Split some line items of a lot into a new lot",
     "'<RFX no.> | Lot <n> | Line Items Split to New Lot'", "'… have been split into lot Lot <n> by <ENTITY>.'",
     "hidden", "Body says '… by the buyer.'", "Medium", "1901"),
    ("Bid accepted (award)", "Award V1 through the normal award flow",
     "'Congratulations! Your bid is selected.'", "big title at the top; the body line that names the buyer company",
     "partly", "Body says 'the buyer'. The big title at the top still shows <ENTITY> (it always showed the name)", "Critical", "1105"),
    ("Bid rejected", "Reject V1's bid (with and without 'allow re-bid')",
     "'Your bid for <RFX no.> | <title> has been rejected' or 'Action required: Revise your bid for …'",
     "inbox preview text; big title at the top; 'Hi <name>, <ENTITY> …'; the 'Buyer' row in the details box; the sign-off",
     "hidden", "Every place says 'the buyer' and there is no big title", "High", "4501"),
    ("Counter offer", "Send V1 a counter offer",
     "'🚨 <RFX no.> | Action Required: Counter Offer Sent by <ENTITY>'", "subject; body line naming the buyer",
     "hidden", "Subject ends '… Sent by the buyer'", "High", "1106"),
    ("Bid submitted on vendor's behalf (surrogate bid)", "Submit a surrogate bid for V1",
     "'📄 <RFX no.> | RFQ Bid submitted on your behalf by <ENTITY>'", "subject; body line naming the buyer",
     "hidden", "Subject ends '… on your behalf' with no name", "High", "4301"),
    ("Manual reminder: submit your offer", "Use Send Reminder → vendors who have not submitted",
     "'[<event name>] [Reminder] Submit Your Offer Before the Deadline.'", "'A gentle reminder! Bidding is now open for the <stage> by <ENTITY>.'",
     "shown", "Still shows <ENTITY> (reminders never hid the name)", "High", "1105"),
    ("Manual reminder: best offer", "Ask for best offer, then Send Reminder for best offer",
     "best-offer reminder", "'<ENTITY> has requested your best price in <stage> stage of <event> event.'",
     "shown", "Still shows <ENTITY>", "High", "4201"),
    ("Manual reminder: cost breakdown", "Send Reminder for item cost breakdown (auction with cost breakdown on)",
     "cost-breakdown reminder", "'A gentle reminder by <ENTITY> to submit item cost breakdown for Auction Stage of <stage>.'",
     "shown", "Still shows <ENTITY>", "Medium", "4301"),
    ("Manual reminder: counter offer", "Send Reminder for a pending counter offer",
     "'[<event name>] | Action required: Counter Offer Sent by <ENTITY>.'", "subject",
     "shown", "Still shows <ENTITY>", "Medium", "1106"),
    ("Custom RFQ vendor email template", "On a company with a custom communication template for RFQ vendor emails, trigger that email",
     "as set in the template", "wherever the template uses the buyer / client company name value",
     "hidden", "Shows 'the buyer'", "Medium", "1901"),
]

M = "3. Every vendor email shows the entity"
for name, how, subj, where, hide, hide_txt, prio, plant in EMAILS:
    e = ENT[plant]
    case("EML", M, name, f"'{name}' email shows the entity name",
         [f"Use event 'MEN P{plant}' with V1 invited", how, INBOX + f" and open the '{name}' email", LOOK],
         f"Subject: {subj.replace('<ENTITY>', e)}.\nThe buyer name reads '{e}' in: {where.replace('<ENTITY>', e)}.\n"
         f"'{CO}' alone does not appear as the buyer name. The rest of the email (event, dates, links) is unchanged.",
         data=ev(plant), priority=prio)

M = "4. Same emails without a mapped PR"
for name, how, subj, where, hide, hide_txt, prio, plant in EMAILS:
    case("NOM", M, name, f"'{name}' email for a manual RFQ keeps the company name",
         ["Use event 'MEN MANUAL' (no PR) with V1 invited (for auction / multi-lot emails, a hand-made auction or multi-lot event with no PR)",
          re.sub(r" \((?:auction )?event from PR-\d+\)", "", how), INBOX + f" and open the '{name}' email", LOOK],
         f"Everywhere the buyer is named it says '{CO}', exactly as before this feature: {where.replace('<ENTITY>', CO)}.",
         data="Event MANUAL (no PR)", priority="High" if prio == "Critical" else "Medium", ttype="Negative")

M = "5. 'Hide company name in emails' switched on"
for name, how, subj, where, hide, hide_txt, prio, plant in EMAILS:
    e = ENT[plant]
    if hide == "hidden":
        exp = (f"{hide_txt.replace('<ENTITY>', e)}. Neither '{e}' nor '{CO}' appears anywhere as the buyer name. "
               "Hiding must win over the entity mapping.")
        tt = "Negative"
    else:
        exp = (f"{hide_txt.replace('<ENTITY>', e)}. Before this feature this place showed '{CO}' even with hiding on; now it shows '{e}'. "
               "Report it to product as a question: should the entity name show when the client asked to hide its name?")
        tt = "Edge"
    case("HID", M, name, f"'{name}' email with the buyer name hidden",
         ["Ask the dev / admin to switch ON 'Hide company name in emails' for the test company",
          f"Use event 'MEN P{plant}' with V1 invited", how, INBOX + f" and open the '{name}' email", LOOK,
          "Switch 'Hide company name in emails' OFF again after the hide cases"],
         exp, data=ev(plant), priority="High" if hide == "hidden" else "Medium", ttype=tt, configs=HIDE_ON)

# ════════════════════════════════════════════════════════════════════════════
M = "6. One name, every time"
case("CON", M, "Inside one email", "One email never mixes the entity name and the company name",
     ["Open the bid-rejected, bid-accepted and RFQ-is-live emails from event 'MEN P4501'", "Read the inbox preview, subject, top title, body and sign-off of each"],
     f"Each email shows only '{ENT['4501']}' in every place. In particular the big title of the bid-rejected email no longer says '{CO}' "
     "while the body says the entity (the PR fixed this).", data=ev("4501"), priority="High", ttype="Negative")
case("CON", M, "Whole event", "Every email of one event shows the same entity from invite to award",
     ["Run event 'MEN P1105' end to end: invite → reminder → extension → counter offer → award",
      "Put all of V1's emails for this RFX number side by side"],
     f"All of them say '{ENT['1105']}'. None of them says '{CO}' alone.", data=ev("1105"), priority="Critical")
case("CON", M, "Two events at once", "Two events from different entities sent to the same vendor are not mixed up",
     ["Publish 'MEN P4201' and 'MEN P1901' within the same minute, both with V1",
      "Send a manual reminder on both at the same time", "Open all of V1's emails for both RFX numbers"],
     f"Every P4201 email says '{ENT['4201']}'. Every P1901 email says '{ENT['1901']}'. No email carries the other event's entity.",
     data="Events P4201 and P1901", priority="Critical", ttype="Negative")
case("CON", M, "Withdrawn after", "The withdraw email still shows the entity even though the PR link is closed on withdraw",
     ["Withdraw project 'MEN P4201'", INBOX + " and open the 'Project Withdrawn' email"],
     f"Subject and body say '{ENT['4201']}', not '{CO}'.", data=ev("4201"), priority="High", ttype="Negative")
case("CON", M, "Buyer copy", "When the buyer is kept in CC, the buyer's copy is the same email",
     ["Turn on 'keep buyer in CC' for the event if available", "Publish 'MEN P1105' with V1 invited", "Open the buyer's copy"],
     f"The buyer's copy is identical to V1's and shows '{ENT['1105']}'.", data=ev("1105"), priority="Low")

# ════════════════════════════════════════════════════════════════════════════
M = "7. Not changed by this feature"
OOS = [
    ("Buyer emails", "Emails that go to buyers (bid received, approvals, evaluation, buyer reminders)",
     "Run event 'MEN P1105' and open the buyer's and approver's emails",
     f"They keep showing '{CO}'. Only vendor emails change.", "High"),
    ("Vendor portal", "Vendor's screens on the vendor portal",
     "Log in to the vendor portal as V1 and open event 'MEN P1105'",
     f"The portal shows the buyer as before ('{CO}'). Note to product: the email says '{ENT['1105']}' but the portal says '{CO}'.", "Medium"),
    ("PDF attachments", "PDF attached to the project invitation (project details)",
     "Open the PDF attached to V1's project invitation for 'MEN P1105'",
     f"The PDF still shows '{CO}' (PDFs are out of scope). Note the mismatch with the email body for product.", "Medium"),
    ("Purchase order", "PO email and PO PDF sent to the vendor after award",
     "Award V1 on 'MEN P4201', create and send the PO, open V1's PO email",
     f"Write down which name the PO shows. PO emails are not in the changed list, so expect '{CO}'. Raise it with product: "
     "the PRD's whole point is that the vendor knows which entity issues the PO.", "High"),
    ("Sender name", "The 'From' name of the email",
     "Look at the sender of any email from 'MEN P1105'",
     "The sender name and address are the same as before. Only the text inside the email changes.", "Medium"),
    ("WhatsApp / push", "WhatsApp messages and app notifications to the vendor",
     "Trigger the invite on 'MEN P1105' for a vendor with WhatsApp on",
     f"WhatsApp and push messages are unchanged (they still say '{CO}' if they name the buyer).", "Low"),
    ("Vendor onboarding / RFI", "Vendor onboarding and RFI emails",
     "Send a vendor onboarding invite and an RFI from the same company",
     f"They show '{CO}' as before.", "Medium"),
    ("Other client", "A company with no mapping (for example DLF or Amity on UAT)",
     "Run invite, reminder, counter offer and award on a normal event of another company",
     "Every email is exactly as before. Nothing about entity names appears.", "Critical"),
    ("Template placeholder", "The general 'Company name' placeholder in custom communication templates",
     "On a company that uses the general company-name placeholder in a custom template, trigger that email for 'MEN P1105'",
     f"It still shows '{CO}' (out of scope in the PR). Note it for product.", "Low"),
]
for sc, title, step, exp, prio in OOS:
    case("OOS", M, sc, f"{title} are not changed", [step], exp,
         data=ev("1105") if "MEN P1105" in step else "", priority=prio,
         configs=MAP_OFF if sc == "Other client" else MAP_ON)

# ════════════════════════════════════════════════════════════════════════════
M = "8. Mapping sheet rules (PRD)"
NOTE = ("NOTE: in this build the mapping is entered by the dev in the backend (no sheet, no screen, per the 5 Nov update). "
        "Ask the dev whether the sheet checks below exist. If they don't, record the behaviour you see and raise it with product.")
case("SHT", M, "Wrong field", "Mapping on a field that does not exist on the PR form is refused",
     ["Ask the dev to load a mapping whose first column header is a field that is NOT on the PR form (for example 'plantt')",
      "If it is accepted, publish an RFQ from PR-1105"],
     "PRD: the upload is refused with a message naming the unknown field. If it is accepted instead, every email silently shows "
     f"'{CO}' and nobody is told. Report that as a gap. {NOTE}", priority="High", ttype="Negative", role="QA + Procol dev", portal="Backend (dev)")
case("SHT", M, "Same code twice", "A plant code listed twice is refused",
     ["Ask the dev to load a sheet where 1105 appears twice with different entity names"],
     f"PRD: the upload is refused, and the message names 1105 as a duplicate. It must not silently keep one of the two. {NOTE}",
     priority="High", ttype="Negative", role="QA + Procol dev", portal="Backend (dev)")
case("SHT", M, "Missing entity", "A row with a plant code but no entity name is refused",
     ["Ask the dev to load a sheet where 4301 has no entity name"],
     f"PRD: the upload is refused, naming the empty row. In this build a blank name falls back to '{CO}' (see MEN-MAP-015). {NOTE}",
     priority="Medium", ttype="Negative", role="QA + Procol dev", portal="Backend (dev)")
case("SHT", M, "Codes in one cell", "Several plant codes typed in one cell do not work",
     ["Ask the dev to load '1101, 1105, 1106' in ONE row instead of three", "Publish an RFQ from PR-1105"],
     f"PRD says each code goes on its own row. The upload should refuse the combined cell. If it is accepted, the 1105 email shows '{CO}', "
     f"because '1101, 1105, 1106' never matches a single code. {NOTE}", priority="Medium", ttype="Negative", role="QA + Procol dev", portal="Backend (dev)")
case("SHT", M, "Re-upload", "Loading a new mapping replaces the old one completely",
     ["Ask the dev to load a new mapping that has only 1105 and 4201", "Publish RFQs from PR-1105, PR-4201 and PR-4501"],
     f"1105 and 4201 show their entities. 4501 now shows '{CO}', because the old row is gone. There is only one active mapping.",
     priority="Medium", ttype="Edge", role="QA + Procol dev", portal="Backend (dev)")
case("SHT", M, "Many codes one entity", "Several codes may point to the same entity",
     ["Check the loaded Gulbrandsen mapping (1101, 1105, 1106 → the same entity)"],
     "Accepted with no warning. See MEN-MAP-014 for the emails.", priority="Low", role="QA + Procol dev", portal="Backend (dev)")
case("SHT", M, "Other PR field", "The mapping can be keyed on another PR field (generic, not only plant)",
     ["On a second test company, ask the dev to key the mapping on another PR field, for example Department "
      "(line-item field) or a PR header field", "Create a PR with a mapped department value, make an RFQ, publish"],
     "The invite shows the entity mapped to that department. Gulbrandsen's plant mapping is not affected.",
     priority="Medium", role="QA + Procol dev")

# ── write ──
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Multi-entity emails"
HEAD = PatternFill("solid", fgColor="1F4E78"); BOX = Border(*(Side(style="thin", color="BFBFBF"),) * 4)
WIDTHS = [14, 24, 22, 44, 18, 20, 40, 36, 36, 62, 72, 10, 11, 11]
for i, (h, w) in enumerate(zip(COLS, WIDTHS), 1):
    c = ws.cell(row=1, column=i, value=h); c.font = Font(bold=True, color="FFFFFF"); c.fill = HEAD
    c.alignment = Alignment(wrap_text=True, vertical="center"); ws.column_dimensions[get_column_letter(i)].width = w
ORDER = {"Negative": 0, "Edge": 1, "Positive": 2}
mods = []
for c in CASES:
    if c["Module"] not in mods: mods.append(c["Module"])
rows = sorted(CASES, key=lambda c: (mods.index(c["Module"]), ORDER[c["Test Type"]] if not c["Module"].startswith("0.") else 0))
for r, c in enumerate(rows, 2):
    for i, h in enumerate(COLS, 1):
        cell = ws.cell(row=r, column=i, value=c[h]); cell.alignment = Alignment(wrap_text=True, vertical="top"); cell.border = BOX
    ws.cell(row=r, column=12).fill = PatternFill("solid", fgColor={"Critical": "F8CBAD", "High": "FFE699", "Medium": "DDEBF7", "Low": "E2EFDA"}[c["Priority"]])
ws.freeze_panes = "E2"; ws.auto_filter.ref = f"A1:N{ws.max_row}"
dv = DataValidation(type="list", formula1='"Not Run,Pass,Fail,Blocked"', allow_blank=True); ws.add_data_validation(dv); dv.add(f"N2:N{ws.max_row}")

# sheet 2: where to check every email
ws2 = wb.create_sheet("Email checklist")
H2 = ["#", "Email", "How to make it go out", "Subject", "Where the buyer name shows", "With 'Hide company name' ON",
      "Test event (plant)", "Expected name", "Cases"]
for i, (h, w) in enumerate(zip(H2, [5, 30, 40, 44, 50, 46, 14, 36, 26]), 1):
    c = ws2.cell(row=1, column=i, value=h); c.font = Font(bold=True, color="FFFFFF"); c.fill = HEAD
    c.alignment = Alignment(wrap_text=True, vertical="center"); ws2.column_dimensions[get_column_letter(i)].width = w
for k, (name, how, subj, where, hide, hide_txt, prio, plant) in enumerate(EMAILS, 1):
    ids = ", ".join(c["Test Case ID"] for c in CASES if c["Scenario"] == name and c["Module"][0] in "345")
    vals = [k, name, how, subj, where, hide_txt, f"MEN P{plant}", ENT[plant], ids]
    for i, v in enumerate(vals, 1):
        cell = ws2.cell(row=k + 1, column=i, value=v); cell.alignment = Alignment(wrap_text=True, vertical="top"); cell.border = BOX
ws2.freeze_panes = "C2"

# sheet 3: plant codes
ws3 = wb.create_sheet("Plant codes")
for i, (h, w) in enumerate(zip(["Plant code", "Entity name shown to the vendor", "Test PR", "Test event"], [12, 46, 14, 16]), 1):
    c = ws3.cell(row=1, column=i, value=h); c.font = Font(bold=True, color="FFFFFF"); c.fill = HEAD; ws3.column_dimensions[get_column_letter(i)].width = w
extra = [("9999", f"{CO} (not in the mapping)"), ("(empty)", f"{CO}"), ("no PR (manual RFQ)", f"{CO}")]
for r, (k, v) in enumerate(list(ENT.items()) + extra, 2):
    for i, val in enumerate([k, v, f"PR-{k}" if k[0].isdigit() else "", f"MEN P{k}" if k[0].isdigit() else ""], 1):
        ws3.cell(row=r, column=i, value=val).border = BOX
wb.save(OUT)
print(len(rows), "cases ->", OUT)
print(Counter(c["Module"] for c in rows)); print(Counter(c["Test Type"] for c in rows)); print(Counter(c["Priority"] for c in rows))
