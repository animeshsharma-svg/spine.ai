#!/usr/bin/env python3
"""In-Principle Approval & Price Recovery (RFQ 2) — manual test cases in plain language.
Sources: PRD (Ranjeet Jha, 5 Nov 2026), Screens PDF (8 screens), TRD + frontend contract (Shubham Garg, 10 Nov 2026),
and the BUILD: backend Procol-Tech/procol-backend#17764 + buyer app Procol-Tech/procol-client-dashboard#6319
(both live on Amity University UAT, checked 18 Nov 2026).
Expected results follow the BUILD. Where the PRD or the screens said something else, the case ends with
"PRD difference: …" so the tester can copy it into Remarks; it is not a reason to fail the case.
Output: test-cases/In_Principle_Approval_Test_Cases.xlsx"""
from collections import Counter
from pathlib import Path
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

OUT = Path(__file__).resolve().parent / "In_Principle_Approval_Test_Cases.xlsx"
COLS = ["Test Case ID", "Module", "Scenario", "Test Case Title", "User Role", "Portal", "Pre-conditions", "Configs Needed",
        "Test Data", "Test Steps", "Expected Result", "Priority", "Test Type", "Status"]
CASES = []; _n = Counter()

FLAG_ON = "In-Principle Approval feature switched ON for the company (in_principle_approval_price_recovery = On)"
FLAG_OFF = "In-Principle Approval feature switched OFF for the company (in_principle_approval_price_recovery = Off)"
PRE = ("Logged in to the buyer portal of the test company (Amity University on UAT). An In-Principle Approval workflow "
       "exists (set up in IPA-SET-002): Step 1 = Rohan Mehta (Head of Procurement), Step 2 = Anita Rao (CFO), 1 day per step.")
PROJ_A = ("A fresh copy of Project A: Technical stage done, RFQ 1 bidding has ENDED, not awarded. Vendors asd and demo123 "
          "quoted; vendors ads and asdf were invited but did not quote. Line item: DAB Hi-Media Make, 10 gms. "
          "asd: ₹500/gms, discount ₹20, total incl. tax ₹5,520 (L1). demo123: ₹600/gms, discount ₹10, total incl. tax ₹6,785 (L2).")


def case(prefix, module, scenario, title, steps, expected, *, pre=PRE, data=PROJ_A, priority="High", ttype="Positive",
         role="Event owner (Procol Support)", portal="Buyer portal", configs=FLAG_ON):
    _n[prefix] += 1
    CASES.append({"Test Case ID": f"IPA-{prefix}-{_n[prefix]:03d}", "Module": module, "Scenario": scenario,
                  "Test Case Title": title, "User Role": role, "Portal": portal, "Pre-conditions": pre,
                  "Configs Needed": configs, "Test Data": data,
                  "Test Steps": "\n".join(f"{i+1}. {s}" for i, s in enumerate(steps)),
                  "Expected Result": expected, "Priority": priority, "Test Type": ttype, "Status": "Not Run"})


# ── words used again and again ──
LOGIN = "Log in to the buyer portal as Procol Support (the event owner)"
OPEN = "Open the project from the Projects list"
MQCS = "Click the \"Master QCS\" tab"
CLICK_IPA = "Click the \"In-Principle Approval\" button (top right, between \"Download Report\" and \"Start Awarding\")"
DRAWER = "The \"Submit for In-Principle Approval\" pop-up opens"
REMARK = "In \"Closing Remarks\" type \"Requesting in-principle approval at L1 value so purchase can run RFQ 2\""
SUBMIT = "Click \"Submit\" at the bottom of the pop-up"
RAISE = [LOGIN, OPEN, MQCS, CLICK_IPA, REMARK, SUBMIT]
APPROVER_OPEN = "Open the approval from the approver's Approvals page (or the link in the approval email)"
R_APPROVE = "Log in as Rohan Mehta (step 1), open the approval and click \"Approve\""
A_APPROVE = "Log in as Anita Rao (step 2), open the approval and click \"Approve\""
BOTH_APPROVE = [R_APPROVE, A_APPROVE]
WAIT_RFQ2 = "Go back to the project as Procol Support and wait up to 1 minute (Master QCS shows \"In-principle approval is approved. Preparing RFQ 2…\" while it is being made)"
DONE_STATE = RAISE + BOTH_APPROVE + [WAIT_RFQ2]
PENDING_PRE = PRE + " An In-Principle Approval has been raised on Project A and is PENDING (nobody has acted yet)."
DONE_PRE = PRE + " An In-Principle Approval on Project A was approved by both approvers and RFQ 2 has been created (Draft)."
REJ_PRE = PRE + " An In-Principle Approval on Project A was REJECTED by Anita Rao with the reason \"Budget frozen for this quarter\"."
AWARD_AFTER = "\"Awarding is available once in-principle approval is approved\""
AWARD_Q = (" Product question: the TRD and the buyer-app PR description say awarding from RFQ 1 is still allowed after a "
           "rejection, recall or expiry, but the screen keeps Start Awarding greyed until an approval is approved. "
           "Write down which one you see and raise it either way.")
PRD_REJ = (" PRD difference: the PRD and screens said a rejection rejects the whole sourcing project; the build keeps the "
           "project active (manager decision, 9 Nov).")

# ═════════════════════ 0. Set-up ═════════════════════
M = "0. Set-up"
case("SET", M, "Feature switch", "Check In-Principle Approval is switched on for the test company",
     ["Ask the Procol admin / CSM (or read the company settings) whether In-Principle Approval is ON for Amity University. "
      "On UAT it was switched on on 13 Nov 2026, so this is a check, not a change",
      "Log out and log in again as Procol Support", "Open any project with a closed RFQ and click the \"Master QCS\" tab"],
     "An \"In-Principle Approval\" button is shown on Master QCS beside \"Start Awarding\". "
     "Use company Amity University (not the older company called \"Amity\", which does not have the feature).",
     role="Procol admin / CSM", pre="Admin access to company settings", data="-", priority="Critical")
case("SET", M, "Workflow", "Create the In-Principle Approval workflow",
     ["Log in as the company admin", "Click \"Approval Workflows\" in the left menu", "Click \"+ Create\"",
      "Click \"+ Add Trigger Settings\". The \"Trigger Settings\" panel opens on the right",
      "Click the \"Approval Type\" box and choose \"In-Principle Approval\"; the only trigger offered is \"Every time\"",
      "Pick the team and initiators the same way as for Bid Proposal. Add a value condition from ₹1 to under ₹10 lakh, click \"Save\"",
      "Add Step 1 = Rohan Mehta (Head of Procurement), 1 day; Step 2 = Anita Rao (CFO), 1 day",
      "Name it \"QA_Platform IPA 2-step\" and publish / save the workflow"],
     "The workflow is saved and listed with type \"In-Principle Approval\" and two steps in order. "
     "Two workflows made by the dev already exist on UAT (\"In principle approval\" and \"InPrinciple Approval testing\", "
     "both with Procol Support as the only approver). Do not change them; they will also show up in the submit pop-up, so always pick yours.",
     role="Company admin", data="Approvers: Rohan Mehta, Anita Rao, Vikram Shah (Plant Head)", priority="Critical")
case("SET", M, "Users", "Prepare the users needed for the tests",
     ["Make sure these users exist and are active (on UAT create QA users with test email addresses and use them in these roles; "
      "never use the old placeholder users of the company): Procol Support (event owner), Rohan Mehta, Anita Rao, Vikram Shah (approvers), "
      "Karan Joshi and Karthik Iyer (purchase buyers with sourcing + create-event rights), Neha (a user with view-only rights, no award rights), "
      "Sunil (a user with no sourcing rights), Deepa (a deactivated user)",
      "Note each person's email so you can check their inbox"],
     "All users exist with the rights described. You can log in as each one (or have a colleague who can).",
     role="Company admin", data="-", priority="Critical")
case("SET", M, "Projects", "Prepare the test projects",
     ["Project A: Technical RFP + RFQ 1, 4 vendors invited (asd, demo123, ads, asdf), asd and demo123 quote (prices in Test Data), let the RFQ bidding end, do not award. Make 10–12 copies — every approval uses one up",
      "Project B: same as A but RFQ 1 bidding is still LIVE",
      "Project C: RFQ 1 bidding ended and NO vendor quoted",
      "Project D: same as A but a proposal / award has already been started",
      "Project E: latest stage is an Auction (not an RFQ)",
      "Project F: same as A but the project has been withdrawn / cancelled",
      "Project G: RFQ 1 with 3 line items; asd quotes all 3, demo123 quotes only 2 of them",
      "Project H: RFQ 1 only (no Technical stage), bidding ended, 2 quotes",
      "Project I: a lot-based project (line items split into lots) whose RFQ bidding has ended"],
     "All projects are in the states described and visible to Procol Support.",
     data="Projects A–I as listed", priority="Critical")

# ═════════════════════ 1. Feature switch ═════════════════════
M = "1. Feature switch (on / off)"
case("FLG", M, "Switch off", "With the feature OFF, Master QCS looks exactly as today",
     [LOGIN, OPEN, MQCS],
     "No \"In-Principle Approval\" button. Only the usual buttons (Hide fields, Download Report, Start Awarding). Nothing else on the page has changed.",
     configs=FLAG_OFF, ttype="Negative", priority="Critical")
case("FLG", M, "Switch off", "With the feature OFF, the approval type is not offered in workflow setup",
     ["Log in as the company admin", "Approval Workflows → + Create → + Add Trigger Settings", "Open the \"Approval Type\" list"],
     "\"In-Principle Approval\" is NOT in the list. Quote Selection, Bid Proposal, Technical Evaluation, Event Creation, Surrogate Bid Creation, Create Product, Reorder Proposal, Create User are shown as before.",
     configs=FLAG_OFF, ttype="Negative", priority="Critical", role="Company admin")
case("FLG", M, "Switch off", "With the feature OFF, no RFQ 2 is created automatically anywhere",
     [LOGIN, OPEN, MQCS, "Award the project the normal way (Start Awarding)"],
     "Normal award / Bid Proposal flow runs. No RFQ 2 stage appears, no lock on RFQ 1.",
     configs=FLAG_OFF, ttype="Negative", priority="High")
case("FLG", M, "Other company", "A company without the feature does not see it even if another company has it",
     ["Log in to a second company where the feature is OFF", "Open a project with a closed RFQ → Master QCS", "Open Approval Workflows → Trigger Settings → Approval Type"],
     "No button on Master QCS and no \"In-Principle Approval\" approval type for this company.",
     configs="Feature ON for Amity, OFF for the second company", ttype="Negative", priority="High", data="A second test company")
case("FLG", M, "Switched off mid-way", "Switching the feature OFF while an approval is pending does not break it",
     RAISE + ["Ask admin to switch the feature OFF", "Approve as Rohan Mehta and then as Anita Rao", "Open the project as Procol Support"],
     "The pending approval can still be approved. RFQ 2 is still created in Draft and RFQ 1 is locked. Nothing errors.",
     configs="ON at start, switched OFF after raising the approval", ttype="Edge", priority="High")
case("FLG", M, "Switched off mid-way", "Switching the feature OFF while RFQ 2 is live lets RFQ 2 continue",
     ["On a project where RFQ 2 is published and bidding is open, ask admin to switch the feature OFF",
      "As a vendor, revise the quote in RFQ 2", "As the buyer, open Master QCS and award from RFQ 2"],
     "RFQ 2 keeps working: vendor quotes are accepted, Master QCS shows RFQ 2, award works through the normal flow.",
     configs="ON at start, switched OFF while RFQ 2 is live", ttype="Edge", priority="High", pre=DONE_PRE + " RFQ 2 is published.")
case("FLG", M, "Switched off mid-way", "After switching OFF, no NEW approval can be raised on other projects",
     ["Switch the feature OFF", "Open another closed-RFQ project → Master QCS"],
     "No \"In-Principle Approval\" button on the other project. The project that already has one keeps showing its status.",
     configs="Switched OFF", ttype="Edge", priority="Medium")
case("FLG", M, "Switch on", "With the feature ON, the button appears beside Start Awarding",
     [LOGIN, OPEN, MQCS],
     "An \"In-Principle Approval\" button (outlined / secondary style) appears between \"Download Report\" and \"Start Awarding\". All other Master QCS columns and buttons are unchanged.",
     priority="Critical")

# ═════════════════════ 2. Approval workflow setup ═════════════════════
M = "2. Approval workflow setup"
W = ["Log in as the company admin", "Click \"Approval Workflows\" in the left menu", "Click \"+ Create\"",
     "Click \"+ Add Trigger Settings\""]
case("WF", M, "Missing details", "Workflow cannot be saved without any approver step",
     W + ["Choose Approval Type \"In-Principle Approval\", pick team and initiators, Save", "Do not add any approver step and try to publish / save the workflow"],
     "The app does not save an empty workflow; it shows a clear message to add at least one approver.",
     role="Company admin", ttype="Negative", priority="High", data="-")
case("WF", M, "Missing details", "Trigger Settings cannot be saved without choosing an approval type",
     W + ["Leave Approval Type empty and click \"Save\""],
     "Save is blocked or a message asks you to choose an approval type. Nothing is saved.",
     role="Company admin", ttype="Negative", priority="Medium", data="-")
case("WF", M, "Inactive approver", "A deactivated user cannot be picked as an approver",
     W + ["Choose \"In-Principle Approval\", Save", "In Step 1 search for Deepa (deactivated user)"],
     "Deepa is not offered in the approver list.",
     role="Company admin", ttype="Negative", priority="Medium", data="Deepa = deactivated user")
case("WF", M, "No workflow", "Raising an approval when no In-Principle workflow applies",
     ["Use a project whose L1 value matches NO In-Principle workflow (on UAT the dev's two workflows cover ₹10 to under ₹10 lakh, "
      "so use a project worth ₹10 lakh or more that your own workflow also does not cover)", LOGIN, OPEN, MQCS, CLICK_IPA],
     "The pop-up says \"No approval workflow is configured for In-Principle Approval\" and \"Submit\" cannot be used. No approval is created.",
     ttype="Negative", priority="High")
case("WF", M, "About box", "The type shows a 'New' tag and an explanation box",
     W + ["Open the \"Approval Type\" list and choose \"In-Principle Approval\""],
     "\"In-Principle Approval\" is in the list and its only trigger is \"Every time\". The build did not change this screen, so the "
     "\"New\" tag and the \"About In-Principle Approval\" box from the screens may not be there: write down what you see. "
     "PRD difference: the screens show a \"New\" tag and an explanation box.",
     role="Company admin", priority="Low", ttype="Edge", data="-")
case("WF", M, "Create", "Create a sequential 2-step In-Principle workflow",
     W + ["Choose \"In-Principle Approval\", pick team and initiators, Save", "Step 1 = Rohan Mehta (1 day), Step 2 = Anita Rao (1 day)", "Save / publish"],
     "Workflow saved. In the list its type shows \"In-Principle Approval\", separate from Bid Proposal.",
     role="Company admin", priority="Critical", data="-")
case("WF", M, "Create", "Create a parallel workflow (two approvers in one step)",
     W + ["Choose \"In-Principle Approval\", Save", "Step 1 = Rohan Mehta AND Vikram Shah together (parallel), Step 2 = Anita Rao", "Save"],
     "Saved with the same parallel/sequential options as Bid Proposal approval.",
     role="Company admin", priority="High", data="-")
case("WF", M, "Timelines", "Set the time limit per step",
     W + ["Choose \"In-Principle Approval\", Save", "Add Step 1 with 2 days and Step 2 with 1 day", "Save"],
     "The time limits are saved and shown next to each step (e.g. \"2d\", \"1d\") — the same as other approval types.",
     role="Company admin", priority="Medium", data="-")
case("WF", M, "Pre-fill", "Approvers from the workflow pre-fill the submit pop-up",
     [LOGIN, OPEN, MQCS, CLICK_IPA, "Look at the \"Approval Workflow\" section of the pop-up"],
     "The pop-up is the same approval pop-up used for Bid Proposal. After choosing \"QA_Platform IPA 2-step\" it lists Step 1 Rohan Mehta "
     "and Step 2 Anita Rao with their time limits, exactly as set in the workflow.",
     priority="Critical")
case("WF", M, "Edit", "Changing the workflow affects only NEW approvals",
     RAISE + ["As admin, change Step 2 from Anita Rao to Vikram Shah", "Open the already-pending approval", "Raise a new approval on another copy of Project A"],
     "The pending approval still goes to Anita Rao. The new approval shows Vikram Shah in Step 2.",
     ttype="Edge", priority="Medium")
case("WF", M, "Separate type", "Bid Proposal workflows are not used for In-Principle Approval",
     ["Keep a Bid Proposal workflow with approver Karthik Iyer and an In-Principle workflow with Rohan/Anita", LOGIN, OPEN, MQCS, CLICK_IPA],
     "The pop-up shows only the In-Principle workflow approvers (Rohan, Anita), never the Bid Proposal approver.",
     priority="High")
TRIG = "Raise In-Principle Approval on the project and open the workflow list in the pop-up"
case("WF", M, "Trigger condition", "A workflow whose value condition does not match is not offered",
     ["Create \"QA_Platform IPA small\" with the condition value from ₹1 to under ₹1,000", LOGIN, OPEN, MQCS, TRIG],
     "\"QA_Platform IPA small\" is not in the list for Project A (₹5,520). Only workflows whose condition matches the L1 value are offered.",
     ttype="Negative", priority="High")
case("WF", M, "Trigger condition", "A workflow conditioned on a delivery location is offered only for that location",
     ["Create \"QA_Platform IPA Noida\" with the condition delivery location = Noida (plus a value range)",
      "Raise from a project delivering to Noida, then from a project delivering somewhere else"],
     "Offered for the Noida project, not for the other one. A condition on a field the project does not have (for example a single "
     "location when line items go to two locations) never matches.", ttype="Edge", priority="Medium")
case("WF", M, "Trigger condition", "Team workflow wins over company workflow",
     ["Make one matching In-Principle workflow for the initiator's team and one for the whole company", LOGIN, OPEN, MQCS, TRIG],
     "Only the team workflow is offered. When the team has no matching workflow, the company workflows are offered.",
     ttype="Edge", priority="Medium")
case("WF", M, "Trigger condition", "Value condition uses the L1 total including tax",
     ["Create a workflow with the condition value from ₹5,500 to under ₹5,600", LOGIN, OPEN, MQCS, TRIG],
     "Offered for Project A, because the approval value is asd's total including tax (₹5,520), not the price before tax (₹4,800).",
     priority="Medium")

# ═════════════════════ 3. When the button can be used ═════════════════════
M = "3. When the button can be clicked (trigger rules)"
def tip(title, data, tiptext, prio="High", pre=PRE):
    case("ELG", M, "Disabled", title, [LOGIN, "Open " + data, MQCS, "Hover the mouse over the \"In-Principle Approval\" button"],
         f"The button is greyed out and cannot be clicked. The tooltip says \"{tiptext}\".",
         data=data, ttype="Negative", priority=prio, pre=pre)
tip("RFQ bidding still running", "Project B (RFQ 1 bidding still live)", "Available after RFQ bidding ends", "Critical")
tip("No vendor quoted", "Project C (RFQ ended, no vendor quoted)", "Bid is expired — no vendor quoted in RFQ", "Critical")
tip("Award already started", "Project D (proposal / award already started)", "Event already awarded or award in progress", "Critical")
tip("Latest stage is an Auction", "Project E (latest stage is an Auction)", "Available only when the latest stage is an RFQ", "High")
tip("Project withdrawn / cancelled", "Project F (withdrawn / cancelled)", "Project is not active", "High")
case("ELG", M, "Disabled", "User without award rights cannot raise it",
     ["Log in as Neha (view-only user on the project, no award rights)", OPEN, MQCS, "Hover over the \"In-Principle Approval\" button"],
     "The button is greyed out with the tooltip \"You don't have permission to raise this approval\".",
     role="View-only user (Neha)", ttype="Negative", priority="High")
case("ELG", M, "Disabled", "Button is not clickable while an approval is already pending",
     [LOGIN, OPEN, MQCS],
     "The button reads \"In-Principle Approval\" with a yellow tag \"Pending · 0/2\" (approved steps / all steps). Clicking it opens the approval page; it does NOT open a new submit pop-up.",
     pre=PENDING_PRE, ttype="Negative", priority="Critical")
case("ELG", M, "Disabled", "Button is not clickable after it is Done",
     [LOGIN, OPEN, MQCS, "Click the button"],
     "The button reads \"In-Principle Approval\" with a green tag \"Done\". Clicking does nothing (no pop-up). Hovering shows \"Approved on <date, time>\" and a \"View approval\" link.",
     pre=DONE_PRE, ttype="Negative", priority="Critical")
case("ELG", M, "Disabled", "Vendor bids that were rejected do not count as valid",
     ["On a closed RFQ where the only quote was rejected by the buyer", LOGIN, OPEN, MQCS, "Hover over the button"],
     "Button disabled with \"Bid is expired — no vendor quoted in RFQ\" (a rejected bid is not a valid quote).",
     data="Project with one rejected bid only", ttype="Edge", priority="Medium")
case("ELG", M, "Bidding end", "Button becomes active the moment bidding ends",
     ["Open Project B a few minutes before RFQ bidding ends", MQCS, "Wait for the end time, refresh the page"],
     "Before the end time: greyed out. After the end time + refresh: the button becomes clickable.",
     data="Project B", ttype="Edge", priority="High")
case("ELG", M, "Extended", "Bidding extended after it ended — button goes grey again",
     ["On a copy of Project A, extend the RFQ 1 bidding end time into the future", MQCS, "Hover over the button"],
     "Button greyed with \"Available after RFQ bidding ends\" until the new end time passes.",
     ttype="Edge", priority="Medium")
case("ELG", M, "RFQ only", "Project with only an RFQ (no Technical stage) can use it",
     [LOGIN, "Open Project H", MQCS, CLICK_IPA],
     "The pop-up opens normally and the approval can be raised; nothing breaks because there is no Technical stage.",
     data="Project H", ttype="Edge", priority="Medium")
case("ELG", M, "Eligible", "Button is active on a closed, un-awarded RFQ",
     [LOGIN, OPEN, MQCS],
     "\"In-Principle Approval\" is clickable. \"Start Awarding\" is also still available — In-Principle Approval is optional.",
     priority="Critical")
case("ELG", M, "Collaborator", "A collaborator with award rights can raise it",
     ["Log in as Karthik Iyer (added to the project as a collaborator with award rights)", OPEN, MQCS],
     "The button is clickable for him as well.", role="Collaborator with award rights", priority="Medium")
tip("Lot-based project is not supported yet", "Project I (lot-based project, RFQ ended)", "Not available for lot-based projects yet", "High")
case("ELG", M, "Disabled", "Feature switched off hides the button instead of greying it",
     ["With the feature OFF for the company", LOGIN, OPEN, MQCS],
     "There is no \"In-Principle Approval\" button at all (not a greyed one with a tooltip).",
     configs=FLAG_OFF, ttype="Negative", priority="Medium")

# ═════════════════════ 4. Submit pop-up ═════════════════════
M = "4. Submit pop-up (raising the approval)"
case("SUB", M, "Close", "Closing the pop-up does not create an approval",
     [LOGIN, OPEN, MQCS, CLICK_IPA, REMARK, "Click the X (top right of the pop-up) / Cancel"],
     "The pop-up closes. The button is still \"In-Principle Approval\" (not Pending). No approver gets an email.",
     ttype="Negative", priority="High")
case("SUB", M, "Double click", "Clicking Submit twice quickly creates only ONE approval",
     [LOGIN, OPEN, MQCS, CLICK_IPA, REMARK, "Double-click \"Submit\" quickly"],
     "Only one In-Principle Approval exists (check the Approvals page). Approvers receive one email each.",
     ttype="Negative", priority="High")
case("SUB", M, "Two users at once", "Two users raising it at the same time — only one succeeds",
     ["Procol Support and Karthik Iyer both open Master QCS of the same project and the pop-up", "Both click \"Submit\" at about the same time"],
     "Only one approval is created. The second user is refused with \"In-principle approval is not allowed: …\" followed by the reason. "
     "The build fills the reason with an internal word (for example \"pending\"); if the message shows such a code word, log it as a wording bug.",
     ttype="Negative", priority="High", role="Owner + collaborator")
case("SUB", M, "Stale page", "Submitting from an old browser tab after the state changed",
     ["Open Master QCS in two tabs", "In tab 1 raise the approval", "In tab 2 (not refreshed) click the button and submit"],
     "Tab 2 is refused with \"In-principle approval is not allowed: …\" (reason: already pending). No second approval.",
     ttype="Negative", priority="Medium")
case("SUB", M, "Awarded meanwhile", "Award started in another tab before submit",
     ["Open the pop-up in tab 1", "In tab 2 click \"Start Awarding\" and create a proposal", "Back in tab 1 click \"Submit\""],
     "Submit is refused with \"In-principle approval is not allowed: …\" (reason: already awarded). No approval created.",
     ttype="Negative", priority="High")
case("SUB", M, "No remarks", "Submitting without Closing Remarks",
     [LOGIN, OPEN, MQCS, CLICK_IPA, "Leave \"Closing Remarks\" empty", SUBMIT],
     "The approval is raised without a note (remarks are optional in the build). The approval page simply has no note. "
     "PRD difference: the PRD did not say whether remarks are needed; confirm with product that optional is intended.",
     ttype="Edge", priority="Medium")
case("SUB", M, "Warning", "The warning banner is shown at the top",
     [LOGIN, OPEN, MQCS, CLICK_IPA],
     "The pop-up title is \"Submit for In-Principle Approval\" and the warning says \"If any approver rejects, this in-principle approval will be rejected. Awarding is blocked until approval is complete.\" "
     "PRD difference: the screens said \"…this sourcing project will be rejected…\".",
     priority="High")
case("SUB", M, "Summary", "Pop-up shows the right numbers",
     [LOGIN, OPEN, MQCS, CLICK_IPA],
     "\"Tot. line items\" = 1 and \"Tot. Value for Approval\" = ₹5,520 (asd's total including tax). "
     "PRD difference: the screens also showed \"Shared with approvers: Technical QCS · RFQ QCS · Master QCS\"; the build reuses the Bid Proposal pop-up and does not show it.",
     priority="Critical")
case("SUB", M, "Value", "Approval value is the overall L1 vendor's full total",
     [LOGIN, "Open Project G (3 items; asd quoted all 3, demo123 only 2)", MQCS, CLICK_IPA],
     "Total Value for Approval (L1) = the grand total incl. tax of the vendor ranked L1 overall (not a mix of the cheapest price on each line).",
     data="Project G", ttype="Edge", priority="High")
case("SUB", M, "Value", "Tie: two vendors with the same total",
     ["On a project where asd and demo123 have exactly the same total incl. tax", LOGIN, OPEN, MQCS, CLICK_IPA],
     "The value shown is that total; the L1 vendor is the one who submitted first.",
     data="Project with equal totals", ttype="Edge", priority="Low")
case("SUB", M, "Value", "Loading factor included in the value",
     ["On a project with loading factor switched on (extra cost added per vendor)", MQCS, CLICK_IPA],
     "Total Value for Approval includes the loading factor, same as the total shown on Master QCS.",
     data="Project with loading factor", ttype="Edge", priority="Medium")
case("SUB", M, "Currency", "Non-rupee event shows the event currency",
     ["On a project quoted in USD", MQCS, CLICK_IPA],
     "Value is shown in USD ($), not ₹.", data="USD project", ttype="Edge", priority="Low")
case("SUB", M, "Remarks", "Closing Remarks editor formatting",
     [LOGIN, OPEN, MQCS, CLICK_IPA, "In Closing Remarks type a line in bold, one in italics and a bullet list", SUBMIT, "Open the approval page"],
     "The \"Note for Approval\" section shows the text with the same formatting. Placeholder before typing was \"Add context for senior approvers\".",
     priority="Medium")
case("SUB", M, "Attachments", "Add an attachment while raising",
     [LOGIN, OPEN, MQCS, CLICK_IPA, REMARK, "Attach a PDF (e.g. budget note.pdf)", SUBMIT, "Open the approval page as an approver"],
     "The attachment is shown on the approval page and opens / downloads correctly.",
     priority="High", data=PROJ_A + " File: budget note.pdf")
case("SUB", M, "Sub approver", "Add an optional Sub First Approver",
     [LOGIN, OPEN, MQCS, CLICK_IPA, "In \"Sub First Approver (Optional)\" pick Vikram Shah", REMARK, SUBMIT],
     "Works only when peer review is switched on for the company and Vikram is in the initiator's team: Vikram becomes the first approver, "
     "then Rohan and Anita. If peer review is off the option is not offered. Someone outside the initiator's team is refused.",
     priority="Medium", configs=FLAG_ON + "; peer review ON for the company")
case("SUB", M, "Several workflows", "Choose between two matching workflows",
     ["Create two In-Principle workflows for the same team", LOGIN, OPEN, MQCS, CLICK_IPA],
     "You can pick which workflow to use (same as Proposal approval); the steps shown change with the choice. On UAT the dev's two workflows also appear.",
     ttype="Edge", priority="Medium")
case("SUB", M, "Submit", "Raise the approval successfully",
     RAISE + ["Look at the Master QCS page"],
     "A message says \"Submitted for in-principle approval\". The button shows a yellow tag \"Pending · 0/2\". \"Start Awarding\" is greyed with the tooltip "
     "\"Awarding is blocked while in-principle approval is pending\". RFQ 1 shows an orange \"Locked\" tag. Rohan Mehta receives the approval email and in-app notification.",
     priority="Critical")
case("SUB", M, "Attachments", "Too many attachments are refused",
     [LOGIN, OPEN, MQCS, CLICK_IPA, REMARK, "Attach more files than the limit allows", SUBMIT],
     "Refused with \"You can attach a maximum of N files. Please remove some attachments and try again.\" No approval is created.",
     ttype="Negative", priority="Medium")
case("SUB", M, "Value", "Sell (reverse) event uses the highest total",
     ["On a sell event where two buyers quoted", LOGIN, OPEN, MQCS, CLICK_IPA],
     "\"Tot. Value for Approval\" is the HIGHEST total, because for a sell event the best quote is the highest.",
     data="Sell event with two quotes", ttype="Edge", priority="Low")

# ═════════════════════ 5. While pending ═════════════════════
M = "5. While the approval is pending"
LOCKMSG = "\"This RFQ is locked because of in-principle approval\""
def locked(title, step, prio="High", ttype="Negative"):
    case("PND", M, "RFQ 1 frozen", title, [LOGIN, OPEN, "Click the \"RFQ\" tab", step],
         f"Not allowed. The option is hidden/greyed, or the app shows {LOCKMSG}. Nothing changes on RFQ 1. RFQ 1 carries an orange \"Locked\" tag while the approval is pending.",
         pre=PENDING_PRE, ttype=ttype, priority=prio)
locked("Re-open RFQ 1 is blocked", "Try to re-open the RFQ / re-open line items", "Critical")
locked("Extending RFQ 1 bidding time is blocked", "From the settings menu (⋮) try \"Extend\" bidding time", "Critical")
locked("Editing RFQ 1 is blocked", "Try to edit the RFQ (line items, terms, attachments)", "High")
locked("Adding a vendor to RFQ 1 is blocked", "Try to add a new vendor / participant", "High")
locked("Placing a surrogate bid on RFQ 1 is blocked", "Try to place a surrogate bid for vendor ads", "High")
locked("Rejecting a vendor's bid on RFQ 1 is blocked", "Try \"Reject Bid\" on demo123", "High")
locked("Counter offer on RFQ 1 is blocked", "Try to send a counter offer to asd", "High")
locked("Converting RFQ 1 to auction is blocked", "Try \"Convert to Auction\" / move to auction", "High")
locked("Uploading bids by Excel on RFQ 1 is blocked", "Try bulk bid upload via Excel", "Medium")
locked("Changing weights / FX rates on RFQ 1 is blocked", "Try to change technical weightage or exchange rates", "Medium")
case("PND", M, "Award blocked", "Start Awarding is disabled while pending",
     [LOGIN, OPEN, MQCS, "Hover over / click \"Start Awarding\""],
     "\"Start Awarding\" is greyed out with the tooltip \"Awarding is blocked while in-principle approval is pending\". If forced (old tab), the app says the same. No proposal is created.",
     pre=PENDING_PRE, ttype="Negative", priority="Critical")
case("PND", M, "Award blocked", "Awarding sheet upload is blocked while pending",
     [LOGIN, OPEN, MQCS, "Try to upload an awarding sheet"],
     "Refused with \"Awarding is blocked while in-principle approval is pending\".",
     pre=PENDING_PRE, ttype="Negative", priority="High")
case("PND", M, "Second raise", "Cannot raise a second approval while one is pending",
     [LOGIN, OPEN, MQCS, "Click the \"In-Principle Approval\" button (yellow \"Pending\" tag)"],
     "It opens the existing approval page. No new submit pop-up.",
     pre=PENDING_PRE, ttype="Negative", priority="Critical")
case("PND", M, "Recall", "Only the person who raised it can recall",
     ["Log in as Karthik Iyer (collaborator, not the initiator)", OPEN, MQCS, "Open the pending approval"],
     "Karthik does NOT see the \"Withdraw Approval\" link on the approval page.",
     pre=PENDING_PRE, role="Collaborator (Karthik Iyer)", ttype="Negative", priority="High")
case("PND", M, "Recall", "Approver cannot recall",
     ["Log in as Rohan Mehta", APPROVER_OPEN],
     "Rohan sees Approve / Reject, but no \"Withdraw Approval\".",
     pre=PENDING_PRE, role="Approver (Rohan Mehta)", ttype="Negative", priority="Medium")
case("PND", M, "Vendor side", "Vendor cannot change their RFQ 1 quote while pending",
     ["Log in to the vendor portal as asd", "Open the RFQ 1 event"],
     "RFQ 1 shows as closed, exactly as any ended RFQ. No edit / revise option, and no mention of approval or lock.",
     pre=PENDING_PRE, role="Vendor (asd)", portal="Vendor portal", ttype="Negative", priority="High")
case("PND", M, "Snapshot", "Changes after raising do not change what approvers see",
     ["Note the values on the approval page", "As the buyer, try to change a technical score / any value that the app still allows", "Re-open the approval page as Rohan"],
     "The approval page still shows the values from the moment it was raised (₹5,520, asd L1, demo123 L2).",
     pre=PENDING_PRE, ttype="Edge", priority="High")
case("PND", M, "Recall", "Initiator recalls before anyone acts",
     [LOGIN, OPEN, MQCS, "Open the pending approval and click \"Withdraw Approval\"",
      "The pop-up \"Withdraw In-Principle Approval\" opens; confirm", "Go back to Master QCS"],
     "A message says \"In-principle approval withdrawn successfully\". The approval shows as recalled. The In-Principle Approval button is clickable again "
     "(no tag). RFQ 1 is no longer frozen and the \"Locked\" tag is gone. \"Start Awarding\" stays greyed with the tooltip " + AWARD_AFTER + "." + AWARD_Q,
     pre=PENDING_PRE, priority="Critical")
case("PND", M, "Recall", "Initiator recalls after step 1 approved",
     [R_APPROVE, LOGIN, OPEN, "Open the approval and recall it"],
     "Recall works while still pending. Anita never gets to act. The button is clickable again and RFQ 1 is no longer frozen; Start Awarding stays greyed with " + AWARD_AFTER + ".",
     pre=PENDING_PRE, ttype="Edge", priority="High")
case("PND", M, "Raise again", "A new approval can be raised after recall",
     ["Recall the pending approval", MQCS, CLICK_IPA, REMARK, SUBMIT],
     "A new approval is created and goes Pending. The recalled one stays in history as recalled.",
     pre=PENDING_PRE, priority="High")
case("PND", M, "Status", "Project shows the pending status in the buyer's lists",
     [LOGIN, "Open the Projects / Events list"],
     "The project's line items show the status \"In-Principle Approval Pending\" for the buyer, under the Evaluation filter. Vendors never see it.",
     pre=PENDING_PRE, priority="Medium")
case("PND", M, "Withdraw project", "Withdrawing the whole project while the approval is pending",
     [LOGIN, OPEN, "From the project menu withdraw the whole project", "Log in as Rohan Mehta and open his Approvals list"],
     "The project is withdrawn. The pending approval is withdrawn with it and leaves Rohan's pending list, so no one can approve it and RFQ 2 is never created.",
     pre=PENDING_PRE, ttype="Edge", priority="High")

# ═════════════════════ 6. Approver page and actions ═════════════════════
M = "6. Approver page and actions"
AR = "Approver (Rohan Mehta)"
case("APR", M, "Reject without reason", "Reject with an empty comment is refused",
     ["Log in as Rohan Mehta", APPROVER_OPEN, "Leave \"Comment\" empty and click \"Reject\""],
     "Rejection is NOT saved. A message says a rejection reason is required (\"Rejection reason is required for in-principle approval\"). The approval stays pending.",
     pre=PENDING_PRE, role=AR, ttype="Negative", priority="Critical")
case("APR", M, "Reject without reason", "Only spaces in the comment count as empty",
     ["Log in as Rohan Mehta", APPROVER_OPEN, "Type only spaces in Comment and click \"Reject\""],
     "Same as above: refused, approval stays pending.",
     pre=PENDING_PRE, role=AR, ttype="Negative", priority="High")
case("APR", M, "Reject without reason", "Bulk reject from the Approvals list without a reason is refused",
     ["Log in as Rohan Mehta", "Open Approvals, tick the In-Principle approval, choose Reject without a remark"],
     "Refused with the reason-required message. Nothing changes.",
     pre=PENDING_PRE, role=AR, ttype="Negative", priority="High")
case("APR", M, "Wrong order", "Step 2 approver cannot act before step 1",
     ["Log in as Anita Rao", APPROVER_OPEN],
     "Anita sees herself as \"Waiting\". Approve / Reject are not available to her yet.",
     pre=PENDING_PRE, role="Approver (Anita Rao)", ttype="Negative", priority="Critical")
case("APR", M, "Not an approver", "A user not in the approval cannot approve",
     ["Log in as Karan Joshi (not an approver, not on the project)", "Paste the approval page link in the browser"],
     "Karan cannot open the approval (access denied / not found). No Approve / Reject.",
     pre=PENDING_PRE, role="Unrelated user (Karan Joshi)", ttype="Negative", priority="High")
case("APR", M, "Twice", "Approving twice is not possible",
     [R_APPROVE, "Refresh and try to approve again (or from the email link)"],
     "Rohan's step already shows Approved; no second approval is recorded.",
     pre=PENDING_PRE, role=AR, ttype="Negative", priority="Medium")
case("APR", M, "Expired", "Approval expires if the step time runs out",
     ["Do not act on the approval until the step's time limit passes (ask dev to shorten it)", "Open Master QCS as Procol Support"],
     "The approval shows Expired. The In-Principle Approval button becomes clickable again and RFQ 1 is no longer frozen. Start Awarding stays greyed with " + AWARD_AFTER + "." + AWARD_Q,
     pre=PENDING_PRE, ttype="Edge", priority="High")
case("APR", M, "Inactive approver", "Approver leaves the company while pending",
     ["Deactivate Rohan Mehta while the approval is pending"],
     "The approval is handled the same way as a Proposal approval with an inactive approver (re-assigned / skipped as per existing rule). It does not get stuck forever.",
     pre=PENDING_PRE, ttype="Edge", priority="Medium")
case("APR", M, "Reminder", "Pending approver gets reminders",
     ["Do nothing until the reminder time set in the workflow"],
     "Rohan receives the reminder like other approval types.",
     pre=PENDING_PRE, role=AR, ttype="Edge", priority="Low")
case("APR", M, "Mobile", "Approver opens it in the mobile app",
     ["Log in to the Procol mobile app as Rohan Mehta", "Look for the approval"],
     "Mobile is not covered in this version. Note whether it is hidden or shown read-only; it must not allow a broken approve/reject.",
     pre=PENDING_PRE, role=AR, portal="Mobile app", ttype="Edge", priority="Low")
case("APR", M, "Page", "Approval page shows the full overview",
     ["Log in as Rohan Mehta", APPROVER_OPEN],
     "The page shows the project title and an overview: Tot. line items 1, Tot. Value for Approval ₹5,520, L1 Vendor asd, RFX No (link), "
     "Recommended By Procol Support, Approval Type In-Principle Approval, Initiated At <date, time>. "
     "PRD difference: the screens also showed Tot. L1 Value, Tot. Non L1 Value and \"Next Stage on Approval: RFQ 2 – Price recovery\".",
     pre=PENDING_PRE, role=AR, priority="Critical")
case("APR", M, "Page", "Line item table shows each vendor's approved RFQ 1 quote",
     ["Log in as Rohan Mehta", APPROVER_OPEN, "Look at the line item table"],
     "The table has Line Item and Quantity, then one column per vendor with the RFQ 1 quote that was approved: asd ₹500/gms, demo123 ₹600/gms for "
     "DAB Hi-Media Make, 10 gms. PRD difference: the screens showed an \"L1 Summary\" table with ranks.",
     pre=PENDING_PRE, role=AR, priority="High")
case("APR", M, "Page", "Note for Approval shows the initiator's remarks",
     ["Log in as Rohan Mehta", APPROVER_OPEN],
     "\"Note for Approval\" shows exactly what Procol Support typed.",
     pre=PENDING_PRE, role=AR, priority="Medium")
case("APR", M, "Page", "Comparison sheet downloads on the approval page (PRD only)",
     ["Log in as Rohan Mehta", APPROVER_OPEN, "Click \"Download\" for Technical QCS, then RFQ QCS, then Master QCS", "Open each file"],
     "The build's approval page has no download buttons for the three comparison sheets. Write down what you see. "
     "PRD difference: the screens showed Technical QCS, RFQ QCS and Master QCS downloads.",
     pre=PENDING_PRE, role=AR, ttype="Edge", priority="Low")
case("APR", M, "Page", "Participants table shows every invited vendor",
     ["Log in as Rohan Mehta", APPROVER_OPEN, "Look at \"Participants\""],
     "4 vendors listed: ads (V-00123), asd, asdf, demo123 with their Technical Stage and RFQ status — asd and demo123 \"Bid placed\", the others \"Not Participated\".",
     pre=PENDING_PRE, role=AR, priority="Medium")
case("APR", M, "Page", "Right panel shows progress and time left",
     ["Log in as Rohan Mehta", APPROVER_OPEN, "Look at the \"Approvals\" panel on the right"],
     "The usual approvals panel: the approval type In-Principle Approval, Rohan as the current approver with the time left, Anita waiting, and a "
     "comment box with Approve and Reject. PRD difference: the screens showed the red line \"Rejecting will reject the entire sourcing project.\"; "
     "in the build a rejection only ends this approval.",
     pre=PENDING_PRE, role=AR, priority="High")
case("APR", M, "Approve", "Step 1 approves — moves to step 2",
     [R_APPROVE, "Open the approval as Procol Support"],
     "Rohan shows \"Approved <date, time>\". Anita is now the current approver and gets the email. Master QCS shows Pending with progress 1/2.",
     pre=PENDING_PRE, role=AR, priority="Critical")
case("APR", M, "Approve", "Approve with an optional comment",
     ["Log in as Rohan Mehta", APPROVER_OPEN, "Type \"Fine with this price\" in Comment, click \"Approve\""],
     "Approved; the comment is visible in the approval history / Comments tab.",
     pre=PENDING_PRE, role=AR, priority="Medium")
case("APR", M, "Parallel", "Parallel step: one approves, the other rejects",
     ["Use the parallel workflow (Rohan + Vikram in step 1)", "Rohan approves", "Vikram rejects with the reason \"Price too high\""],
     "This In-Principle Approval is rejected (any single rejection rejects it). The project stays active.",
     pre=PRE + " Approval raised with the parallel workflow.", ttype="Edge", priority="High")
case("APR", M, "Email", "Approve from the email",
     ["Open the approval email in Rohan's inbox (Mailpit on UAT)", "Click its link, and look for Approve / Reject buttons in the email itself"],
     "The link opens the In-Principle approval page. Approving there is recorded as normal. Approve / Reject buttons inside the email exist only "
     "for Bid Proposal approvals, so expect none here: write down what you see.",
     pre=PENDING_PRE, role=AR, portal="Approver's mailbox", ttype="Edge", priority="Medium")
case("APR", M, "Comments tab", "Comments tab conversation",
     ["Log in as Rohan Mehta", APPROVER_OPEN, "Open the \"Comments\" tab and post a question"],
     "The comment is saved and visible to the initiator and other approvers.",
     pre=PENDING_PRE, role=AR, priority="Low")
case("APR", M, "Approvals list", "Shows as its own type in the Approvals list",
     ["Log in as Rohan Mehta", "Open the Approvals page", "Filter by type"],
     "The item shows type \"In-Principle Approval\" (not Bid Proposal), the filter has \"In-Principle Approval\", and clicking the row (or the card in the approvals drawer) opens the In-Principle approval page.",
     pre=PENDING_PRE, role=AR, priority="High")

# ═════════════════════ 7. Rejection ═════════════════════
M = "7. When an approver rejects"
case("REJ", M, "After reject", "Rejection does not create RFQ 2 and the project stays active",
     [LOGIN, OPEN, "Look at the project status, the stages and the Published Stages table"],
     "No RFQ 2 is created. The project is still active (not rejected, not closed), so the usual project actions work as for any active project." + PRD_REJ,
     pre=REJ_PRE, ttype="Negative", priority="Critical")
case("REJ", M, "After reject", "Start Awarding after a rejection",
     [LOGIN, OPEN, MQCS, "Hover over \"Start Awarding\""],
     "\"Start Awarding\" is greyed with the tooltip " + AWARD_AFTER + ". No proposal can be started from the screen." + AWARD_Q + PRD_REJ,
     pre=REJ_PRE, ttype="Edge", priority="Critical")
case("REJ", M, "Raise again", "After a rejection a new approval can be raised",
     [LOGIN, OPEN, MQCS, "Click the \"In-Principle Approval\" button (red \"Rejected\" tag)", REMARK, SUBMIT],
     "The submit pop-up opens (the rejected approval is not reopened). The new approval goes Pending: the tag changes to \"Pending · 0/2\" and the rejection banner disappears. "
     "The rejected approval stays in history." + PRD_REJ,
     pre=REJ_PRE, priority="High")
case("REJ", M, "After reject", "Step 2 approver cannot act after step 1 rejects",
     ["Rohan rejects with a reason", "Log in as Anita Rao and open the approval"],
     "Anita sees it as Rejected; no Approve/Reject for her.",
     pre=PENDING_PRE, role="Approver (Anita Rao)", ttype="Negative", priority="High")
case("REJ", M, "Vendor side", "Vendors get nothing about the rejection",
     ["Check asd's and demo123's email (Mailpit on UAT) and the vendor portal"],
     "No email or notice about the rejection. RFQ 1 looks the same as any ended RFQ. The word \"In-Principle\" appears nowhere.",
     pre=REJ_PRE, role="Vendor", portal="Vendor portal + vendor mailbox", ttype="Negative", priority="Critical")
case("REJ", M, "Reject", "Step 2 rejects with a reason",
     [R_APPROVE, "Log in as Anita Rao, open the approval, type \"Budget for this category is frozen for the current quarter.\" and click \"Reject\"", LOGIN, OPEN, MQCS],
     "Master QCS shows a red banner \"In-principle approval rejected by Anita Rao on <date, time>. Reason: Budget for this category is frozen for the current quarter.\" "
     "with a \"View approval\" link. The button shows a red \"Rejected\" tag and stays clickable. The project header shows a red \"In-Principle Approval · Rejected\" tag." + PRD_REJ,
     pre=PENDING_PRE, priority="Critical")
case("REJ", M, "Reject", "Step 1 rejects — chain stops",
     ["Log in as Rohan Mehta, type \"Price too high\" and click \"Reject\""],
     "The approval is rejected immediately. Anita never gets an email. Master QCS shows the rejection banner with Rohan's name and reason. The project stays active.",
     pre=PENDING_PRE, role=AR, priority="Critical")
case("REJ", M, "Nothing else changes", "Rejection does not touch bids or PR quantities",
     ["After rejection, open RFQ 1 bids and the linked PR"],
     "All RFQ 1 bids are still there unchanged. PR quantities are not released or changed. No RFQ 2 is created.",
     pre=REJ_PRE, priority="High")
case("REJ", M, "View approval", "\"View approval\" link opens the rejected approval",
     [LOGIN, OPEN, MQCS, "Click \"View approval\" in the banner"],
     "Opens the approval page showing who rejected, when, and the reason.",
     pre=REJ_PRE, priority="Medium")
case("REJ", M, "Status", "Rejected status shows in the buyer's lists",
     [LOGIN, "Open the Projects list / the PR line statuses"],
     "The line items show \"In-Principle Approval Rejected\" (under the Evaluation filter). The project itself is not shown as cancelled or closed." + PRD_REJ,
     pre=REJ_PRE, priority="Medium")
case("REJ", M, "Unfrozen", "RFQ 1 is no longer frozen after a rejection",
     [LOGIN, OPEN, "Click the \"RFQ\" tab", "Extend the bidding time or send a counter offer"],
     "Allowed, the same as on any ended RFQ. RFQ 1 no longer has the orange \"Locked\" tag and the lock message does not appear.",
     pre=REJ_PRE, priority="High")
case("REJ", M, "Second attempt", "A second attempt after a rejection can be approved and creates RFQ 2",
     [LOGIN, OPEN, MQCS, CLICK_IPA, REMARK, SUBMIT] + BOTH_APPROVE + [WAIT_RFQ2],
     "RFQ 2 is created exactly as after a first-time approval. The red rejection banner is gone and the button shows \"Done\".",
     pre=REJ_PRE, priority="High")

# ═════════════════════ 8. Full approval → RFQ 2 created ═════════════════════
M = "8. Full approval creates RFQ 2"
case("CRT", M, "Failure", "RFQ 2 creation fails — Retry",
     ["Ask the dev to make RFQ 2 creation fail (test switch)", "Approve as both approvers", WAIT_RFQ2],
     "The approval stays Approved and the button shows \"Done\". Master QCS shows a red banner \"In-principle approval is approved, but RFQ 2 could not be created.\" with a \"Retry\" link. "
     "RFQ 1 stays locked (no award from RFQ 1) until RFQ 2 exists. PRD difference: the PRD expected RFQ 1 to stay open and owners to get an in-app message.",
     pre=PENDING_PRE, ttype="Negative", priority="High")
case("CRT", M, "Failure", "Retry after failure creates RFQ 2",
     ["After the failure above, ask the dev to remove the test switch", "Click \"Retry\""],
     "A message says \"Retrying RFQ 2 creation\". RFQ 2 is created in Draft, the banner goes away and RFQ 1 keeps its \"Locked\" tag, now linked to RFQ 2.",
     pre=PENDING_PRE, ttype="Edge", priority="High")
case("CRT", M, "Failure", "Retry is not offered when nothing failed",
     [LOGIN, OPEN, MQCS],
     "No \"Retry\" button. (If forced, the app says \"Price recovery stage can only be retried after a failure\".)",
     pre=DONE_PRE, ttype="Negative", priority="Medium")
case("CRT", M, "Only once", "RFQ 2 is created only once",
     DONE_STATE + ["Refresh several times; open Project Details → Published Stages"],
     "Exactly one RFQ 2 stage exists, even if approvals came in from web and email at the same time.",
     pre=PENDING_PRE, ttype="Edge", priority="High")
case("CRT", M, "Preparing", "\"Preparing RFQ 2…\" banner while it is being made",
     RAISE + BOTH_APPROVE + ["Open Master QCS immediately as Procol Support"],
     "Banner \"In-principle approval is approved. Preparing RFQ 2…\" is shown and the page checks again every few seconds for about a minute. "
     "If RFQ 2 takes longer, the banner stays until you refresh the page.",
     pre=PRE, priority="Medium")
case("CRT", M, "Created", "RFQ 2 is created in Draft after both approve",
     DONE_STATE + ["Look at the tabs and Project Details → Published Stages"],
     "A new stage titled \"RFQ 2\" appears in Draft with a blue \"Price Recovery\" tag; it has only asd and demo123 as vendors. RFQ 1 has an orange \"Locked\" tag. "
     "The project header shows \"In-Principle Approval · Done\" (and \"Created from In-Principle Approval\" while the RFQ 2 tab is open). "
     "PRD difference: the screens named the stage \"RFQ 2 – Price recovery\" and showed an \"Assign event\" pending action.",
     pre=PRE, priority="Critical")
case("CRT", M, "Done button", "Button turns Done with hover details",
     DONE_STATE + [MQCS, "Hover over the \"In-Principle Approval · Done\" button"],
     "The button shows a green \"Done\" tag. The hover card shows \"Approved on <date, time>\" and a \"View approval\" link that opens the approval. "
     "PRD difference: the screens also listed the approvers' names in the hover card.",
     pre=PRE, priority="Critical")
case("CRT", M, "Only one approved", "Approval cannot be raised again after Done",
     DONE_STATE + [MQCS, "Click the Done button"],
     "Nothing opens; it stays Done for this project, even if RFQ 2 is later withdrawn.",
     pre=PRE, ttype="Negative", priority="High")
case("CRT", M, "Copied", "Line items, quantities, terms and attachments are copied",
     [LOGIN, OPEN, "Click the \"RFQ 2\" tab", "Compare line items, quantities, delivery location, terms & conditions and attachments with RFQ 1"],
     "Line items and quantities match RFQ 1 (DAB Hi-Media Make, 10 gms, AES NOIDA HO). Check terms and attachments too and write down anything missing.",
     pre=DONE_PRE, priority="Critical")
case("CRT", M, "Old proposals", "Old draft proposals on RFQ 1 are withdrawn",
     ["Before raising, create a draft proposal on RFQ 1 and leave it unsent (if the app allows it)", "Complete the approval"],
     "After RFQ 2 is created the old draft proposal is withdrawn and cannot be submitted.",
     pre=PRE, ttype="Edge", priority="Low")
case("CRT", M, "Project withdrawn", "Project withdrawn between the last approval and RFQ 2 creation",
     ["Approve as both approvers and withdraw the project straight away (ask the dev to slow RFQ 2 creation if needed)", "Open the project"],
     "No RFQ 2 is created because the project is no longer active. The approval stays Approved; Retry is not offered on a withdrawn project.",
     pre=PENDING_PRE, ttype="Edge", priority="Low")

# ═════════════════════ 9. RFQ 1 lock ═════════════════════
M = "9. RFQ 1 lock after RFQ 2"
def lk(title, step, prio="High"):
    case("LCK", M, "Locked", title, [LOGIN, OPEN, "Click the \"RFQ\" tab (it has a lock icon)", step],
         f"Not allowed — the option is hidden/greyed or the app says {LOCKMSG}. RFQ 1 does not change.",
         pre=DONE_PRE, ttype="Negative", priority=prio)
lk("Re-open RFQ 1 is blocked", "Try to re-open the RFQ or re-open line items", "Critical")
lk("Award from RFQ 1 is blocked", "Try to award a vendor from RFQ 1 (proposal from RFQ 1 / award action)", "Critical")
lk("Editing RFQ 1 is blocked", "Try to edit line items, terms or attachments", "High")
lk("Extending RFQ 1 is blocked", "Try to extend bidding time", "High")
lk("Bid actions on RFQ 1 are blocked", "Try reject bid / counter offer / surrogate bid", "High")
case("LCK", M, "Vendor", "Vendor cannot quote in RFQ 1 after the lock",
     ["Log in to the vendor portal as asd", "Open RFQ 1"],
     "RFQ 1 is shown closed exactly as before. No \"Locked\" badge or new message for the vendor.",
     pre=DONE_PRE, role="Vendor (asd)", portal="Vendor portal", ttype="Negative", priority="High")
case("LCK", M, "Badge", "Locked badge with link to RFQ 2",
     [LOGIN, OPEN, "Look at the RFQ tab and Published Stages"],
     "RFQ 1 has an orange \"Locked\" tag in the stage tabs and in Published Stages. Hovering it shows \"View RFQ 2\" and clicking it opens the RFQ 2 tab.",
     pre=DONE_PRE, priority="High")
case("LCK", M, "Still visible", "RFQ 1 data stays visible for comparison",
     [LOGIN, OPEN, "Open the RFQ tab, then Master QCS, then download the report"],
     "All RFQ 1 quotes are still visible (read-only) in the RFQ tab. After RFQ 2 is published, Master QCS shows them in the \"RFQ 1 Price (locked)\" and \"RFQ 1 Total (incl. tax)\" columns.",
     pre=DONE_PRE, priority="High")
case("LCK", M, "View RFQ 1", "RFQ 1 can still be opened read-only",
     [LOGIN, OPEN, "Click the \"RFQ 2\" tab, then click the RFQ 1 tab"],
     "RFQ 1 opens in read-only mode. PRD difference: the screens had a \"View RFQ 1 (locked)\" button on the RFQ 2 page; the build uses the normal stage tabs.",
     pre=DONE_PRE, priority="Medium")
case("LCK", M, "Unlock", "Withdrawing RFQ 2 unlocks RFQ 1",
     [LOGIN, OPEN, "Withdraw RFQ 2 (or delete it while it is a draft)", "Open RFQ 1 and Master QCS"],
     "RFQ 1 loses the \"Locked\" tag and awarding from RFQ 1 works again. The In-Principle Approval button stays \"Done\" (no second attempt).",
     pre=DONE_PRE, ttype="Edge", priority="High")

# ═════════════════════ 10. Hand-over of RFQ 2 ═════════════════════
M = "10. Hand-over of RFQ 2 (Change owner)"
CO = "Open the project menu and click \"Change owner\""
case("ASG", M, "Not built", "The Event Creator / Event Assignee fields from the screens",
     [LOGIN, OPEN, "Click the \"Project Details\" tab and look at the \"Overview\" section"],
     "The build has no new \"Event Creator\" / \"Event Assignee\" fields and no \"Assign event\" pending action. RFQ 2 is handed over with the existing \"Change owner\". "
     "Write down what you see. PRD difference: the PRD and screens had an Event Assignee search box on the Overview.",
     pre=DONE_PRE, ttype="Edge", priority="Medium")
case("ASG", M, "Wrong user", "A user without sourcing rights cannot be made owner",
     [LOGIN, OPEN, CO, "Search for Sunil (no sourcing rights)"],
     "Sunil is not offered, the same rule as Change owner on any project.", pre=DONE_PRE, ttype="Negative", priority="High")
case("ASG", M, "Wrong user", "A deactivated user is not offered",
     [LOGIN, OPEN, CO, "Search for Deepa"], "Deepa (deactivated) does not appear.", pre=DONE_PRE, ttype="Negative", priority="Medium")
case("ASG", M, "Wrong user", "Users of another company are not offered",
     [LOGIN, OPEN, CO, "Search for a user of another company"], "Not in the suggestions.", pre=DONE_PRE, ttype="Negative", priority="Medium")
case("ASG", M, "Hand over", "Hand RFQ 2 over to a purchase buyer with Change owner",
     [LOGIN, OPEN, CO, "Pick Karan Joshi and confirm"],
     "Karan Joshi is the new owner and is notified the same way as any owner change. Procol Support's access after the change follows the normal Change owner rule.",
     pre=DONE_PRE, priority="Critical")
case("ASG", M, "New owner works", "New owner can edit and publish RFQ 2",
     ["Log in as Karan Joshi", OPEN, "Click the \"RFQ 2\" tab, set bid start and end, publish"],
     "RFQ 2 is published by Karan. RFQ 1 stays locked. The In-Principle Approval stays \"Done\".",
     pre=DONE_PRE + " Karan Joshi is the owner.", role="New owner (Karan Joshi)", priority="Critical")
case("ASG", M, "Approval still visible", "The approval stays visible after the owner changes",
     ["Log in as Karan Joshi", OPEN, MQCS, "Hover over the \"Done\" tag and click \"View approval\""],
     "The approval page opens and shows the approved approval with Procol Support as \"Recommended By\".",
     pre=DONE_PRE + " Karan Joshi is the owner.", role="New owner (Karan Joshi)", priority="Medium")
case("ASG", M, "No hand-over", "Owner publishes RFQ 2 without handing it over",
     [LOGIN, OPEN, "Click the \"RFQ 2\" tab, set bid start and end, publish"],
     "Allowed. Nothing asks to assign someone first, because the build has no assignment step.",
     pre=DONE_PRE, ttype="Edge", priority="Medium")
case("ASG", M, "Line items locked", "RFQ 2 line items cannot be edited in the draft",
     [LOGIN, OPEN, "Click the \"RFQ 2\" tab and try to add, remove or change a line item"],
     "Line items are locked the same way as on a stage added with \"Add new stage\"; the bid dates and the vendor list can still be set before publishing.",
     pre=DONE_PRE, ttype="Negative", priority="High")

# ═════════════════════ 11. RFQ 2 draft and publish ═════════════════════
M = "11. RFQ 2 draft, vendors and publish"
R2 = "Click the \"RFQ 2\" tab"
case("R2", M, "Dates", "Cannot publish without bid start and end dates",
     ["Log in as the owner", OPEN, R2, "Leave the bid start / end empty and publish"],
     "Publish is blocked with a clear message to set the dates.",
     pre=DONE_PRE, role="Owner", ttype="Negative", priority="High")
case("R2", M, "Dates", "End date before start date is refused",
     ["Log in as the owner", OPEN, R2, "Set end date earlier than start date, publish"],
     "Refused with the usual date validation message.", pre=DONE_PRE, role="Owner", ttype="Negative", priority="Medium")
case("R2", M, "Copy failure", "Publish fails if RFQ 1 bids cannot be copied",
     ["Ask dev to make the bid copy fail (test switch)", "Publish RFQ 2"],
     "Publish is refused with \"Could not copy RFQ 1 bids to RFQ 2\". RFQ 2 stays Draft; vendors get no invite.",
     pre=DONE_PRE, role="Owner", ttype="Negative", priority="Medium")
case("R2", M, "Vendors", "Vendors who did not quote in RFQ 1 are not invited",
     ["Log in as the owner", OPEN, R2, "Check the vendor list"],
     "Only asd and demo123. ads and asdf (did not quote) are not in RFQ 2.",
     pre=DONE_PRE, role="Owner", ttype="Negative", priority="Critical")
case("R2", M, "No email yet", "Vendors get nothing while RFQ 2 is in Draft",
     ["Check asd's and demo123's inbox (Mailpit on UAT) and vendor portal right after RFQ 2 is created"],
     "No invite and no RFQ 2 visible to vendors until it is published.",
     pre=DONE_PRE, role="Vendor", portal="Vendor portal + mailbox", ttype="Negative", priority="High")
case("R2", M, "Draft screen", "RFQ 2 draft page shows the base values",
     ["Log in as the owner", OPEN, R2],
     "RFQ 2 opens in the normal draft screens. The header shows \"Created from In-Principle Approval\", the stage has the \"Price Recovery\" tag, and the vendors are asd and demo123. "
     "Vendors' RFQ 1 quotes appear only after publishing, as their starting RFQ 2 quotes (see the publish cases). "
     "PRD difference: the screens showed a special draft page with an info line, the approved value and base price / discount / total rows per vendor.",
     pre=DONE_PRE, role="Owner", priority="Critical")
case("R2", M, "Base value", "Vendor who skipped a line item has no base value for it",
     ["Use Project G (demo123 did not quote item 3)", "Complete the approval", R2, "Publish RFQ 2 and open demo123's starting quote"],
     "demo123's copied quote has no price for item 3 (blank / –); asd's has all three.",
     data="Project G", ttype="Edge", priority="High")
case("R2", M, "Base value", "Vendor revised in RFQ 1 — last valid quote is used",
     ["On a project where asd revised from ₹520 to ₹500 in RFQ 1", "Complete the approval", R2],
     "asd's starting RFQ 2 quote is ₹500 (the last valid quote when the approval was raised), not ₹520.",
     data="Project where asd revised once", ttype="Edge", priority="High")
case("R2", M, "Add vendor", "Buyer adds a new vendor to RFQ 2",
     ["Log in as the owner", OPEN, R2, "Add vendor ads to RFQ 2", "Publish"],
     "ads is invited and must quote fresh (no copied quote). asd and demo123 get their RFQ 1 quotes copied in.",
     pre=DONE_PRE, role="Owner", ttype="Edge", priority="Medium")
case("R2", M, "Publish", "Publish RFQ 2",
     ["Log in as the owner", OPEN, R2, "Set bid start (now) and bid end (tomorrow)", "Publish"],
     "RFQ 2 is live. Project header tag \"RFQ 2 · Bidding open\". asd and demo123 receive the standard RFQ invite. RFQ 2 is now the latest stage.",
     pre=DONE_PRE, role="Owner", priority="Critical")
case("R2", M, "Publish", "Each vendor's RFQ 1 quote becomes their starting RFQ 2 quote",
     ["After publishing, open the RFQ 2 bids as the buyer"],
     "asd shows ₹500/gms and demo123 ₹600/gms as their current RFQ 2 bids before they do anything.",
     pre=DONE_PRE + " RFQ 2 published.", role="Owner", priority="High")
case("R2", M, "No response", "Vendor does not respond in RFQ 2",
     ["Let RFQ 2 bidding end without demo123 revising"],
     "demo123's RFQ 1 quote stays as the reference; the buyer decides the award.",
     pre=DONE_PRE + " RFQ 2 published.", ttype="Edge", priority="Medium")
case("R2", M, "Invalid quote", "A vendor whose RFQ 1 quote is no longer valid gets nothing copied",
     ["Before publishing RFQ 2, make demo123's RFQ 1 quote invalid (for example the vendor withdrew it, if the app allows)", "Publish RFQ 2", "Open the RFQ 2 bids"],
     "demo123 has no copied quote and must quote fresh. asd's quote is copied as normal.",
     pre=DONE_PRE, role="Owner", ttype="Edge", priority="Low")

# ═════════════════════ 12. Supplier side ═════════════════════
M = "12. Supplier side (nothing new for vendors)"
V = "Log in to the vendor portal as asd"
case("SUP", M, "No leak", "Vendor never sees In-Principle Approval anywhere",
     [V, "Open the event list, RFQ 1, RFQ 2, notifications and emails"],
     "No \"In-Principle Approval\", approver names, remarks, status, \"Price Recovery\" or \"Approved value\" anywhere.",
     pre=DONE_PRE + " RFQ 2 published.", role="Vendor (asd)", portal="Vendor portal", ttype="Negative", priority="Critical")
case("SUP", M, "No leak", "RFQ 2 invite email has no internal words",
     ["Open asd's RFQ 2 invite email"],
     "Standard RFQ invite titled \"RFQ 2\". No approved value, no \"Price recovery\", no comparison.",
     pre=DONE_PRE + " RFQ 2 published.", role="Vendor (asd)", portal="Vendor mailbox", ttype="Negative", priority="Critical")
case("SUP", M, "No leak", "Vendor cannot see the other vendor's price",
     [V, "Open RFQ 2"],
     "asd sees only their own base price ₹500. demo123's ₹600 is never shown.",
     pre=DONE_PRE + " RFQ 2 published.", role="Vendor (asd)", portal="Vendor portal", ttype="Negative", priority="Critical")
case("SUP", M, "Not invited", "Vendor who did not quote in RFQ 1 does not see RFQ 2",
     ["Log in to the vendor portal as ads"], "ads sees RFQ 1 as closed and no RFQ 2.",
     pre=DONE_PRE + " RFQ 2 published.", role="Vendor (ads)", portal="Vendor portal", ttype="Negative", priority="High")
case("SUP", M, "Quote", "Vendor revises the price down in RFQ 2",
     [V, "Open RFQ 2", "Change the price from ₹500 to ₹470 and submit"],
     "Accepted with the normal RFQ screens and messages. No new fields or banners.",
     pre=DONE_PRE + " RFQ 2 published.", role="Vendor (asd)", portal="Vendor portal", priority="Critical")
case("SUP", M, "Quote", "Vendor tries to quote higher than RFQ 1",
     [V, "Open RFQ 2", "Change the price from ₹500 to ₹550 and submit"],
     "Only the existing RFQ checks apply; the build adds no ceiling, so the higher quote is accepted. Master QCS then shows a NEGATIVE recovery for asd (see the Master QCS case). "
     "Product question from the PRD: should the RFQ 1 price be a ceiling?",
     pre=DONE_PRE + " RFQ 2 published.", role="Vendor (asd)", portal="Vendor portal", ttype="Edge", priority="Medium")
case("SUP", M, "Same screens", "RFQ 2 bidding screens are identical to a normal RFQ",
     [V, "Open RFQ 2 and go through every tab and button"],
     "Same screens, emails and submit flow as any RFQ today.",
     pre=DONE_PRE + " RFQ 2 published.", role="Vendor (asd)", portal="Vendor portal", priority="High")

# ═════════════════════ 13. Master QCS after RFQ 2 ═════════════════════
M = "13. Master QCS after RFQ 2 and award"
case("MQ", M, "Before publish", "Before RFQ 2 is published, recovery figures are empty",
     [LOGIN, OPEN, MQCS],
     "Cards: \"Approved value (RFQ 1 L1)\" ₹5,520; \"Best RFQ 2 value\" and \"Price recovered so far\" are empty / –, not ₹0 or wrong numbers. "
     "The rest of Master QCS still shows RFQ 1, and the RFQ 1 / RFQ 2 columns are not there yet.",
     pre=DONE_PRE, ttype="Negative", priority="Medium")
case("MQ", M, "Price higher", "RFQ 2 price higher than approved value",
     ["Only asd quotes in RFQ 2, at ₹550/gms with discount ₹20 (total ₹6,095)", LOGIN, OPEN, MQCS],
     "\"Price recovered\" for asd is negative: −₹575 (−10.42%). It must never show as a positive saving. Confirm with product how a negative recovery should look.",
     pre=DONE_PRE + " RFQ 2 published.", ttype="Edge", priority="Medium")
case("MQ", M, "New vendor", "New vendor in RFQ 2 has no RFQ 1 columns",
     ["Vendor ads (added only in RFQ 2) quotes ₹480", MQCS],
     "ads shows RFQ 2 values; \"RFQ 1 Price (locked)\" and \"RFQ 1 Total (incl. tax)\" are blank (not ₹0) and \"Price recovered\" is blank for ads. "
     "If ads is the cheapest, the \"Best RFQ 2 value\" card names ads and measures against the approved ₹5,520.",
     pre=DONE_PRE + " RFQ 2 published, ads added.", ttype="Edge", priority="Low")
case("MQ", M, "Side by side", "RFQ 1, approved value and RFQ 2 side by side",
     ["asd revises to ₹470 (discount ₹20) and demo123 to ₹560 (discount ₹10) in RFQ 2", LOGIN, OPEN, MQCS],
     "Cards: \"Approved value (RFQ 1 L1)\" ₹5,520, \"Best RFQ 2 value (asd)\" ₹5,175, \"Price recovered so far\" ₹345 (6.25%). "
     "New columns per vendor: \"RFQ 1 Price (locked)\" ₹500 / ₹600; \"RFQ 1 Total (incl. tax)\" ₹5,520 / ₹6,785; \"RFQ 2 Total (incl. tax)\" ₹5,175 / ₹6,325; "
     "\"Price recovered\" ₹345 / ₹460. The normal price and rank columns now show RFQ 2 (asd L1, demo123 L2). "
     "PRD difference: the screens rounded to one decimal (6.3%) and had separate \"RFQ 2 Price\" and \"Rank (RFQ 2)\" columns.",
     pre=DONE_PRE + " RFQ 2 published.", priority="Critical")
case("MQ", M, "Live update", "Recovery figures update when a vendor revises again",
     ["asd revises again from ₹470 to ₹460", "Refresh Master QCS"],
     "Best RFQ 2 value and Price recovered update: ₹460 with discount ₹20 gives a total of ₹5,060, recovered ₹460 (8.33%).",
     pre=DONE_PRE + " RFQ 2 published.", priority="High")
case("MQ", M, "Award", "Award from RFQ 2 uses the normal award + Bid Proposal approval",
     ["After RFQ 2 bidding ends, as the owner click \"Start Awarding\"", "Award asd and submit the proposal / PO form"],
     "Start Awarding is enabled. The usual Bid Proposal approval flow runs (not In-Principle). After it is approved the PO is created from RFQ 2 prices.",
     pre=DONE_PRE + " RFQ 2 published and ended.", role="Owner", priority="Critical")
case("MQ", M, "Download", "Download Report includes both rounds",
     [LOGIN, OPEN, MQCS, "Click \"Download Report\""],
     "While RFQ 2 is live the report shows RFQ 2's data (before RFQ 2 is published it shows RFQ 1's). The numbers match the screen. Write down whether RFQ 1 values and the approved value also appear.",
     pre=DONE_PRE + " RFQ 2 published.", priority="Medium")

# ═════════════════════ 14. Notifications ═════════════════════
M = "14. Notifications"
case("NTF", M, "Vendors", "Vendors get no email when RFQ 2 is created or the approval is raised/recalled",
     ["Raise, recall, raise again and approve fully; check vendor inboxes after each"],
     "Vendors receive nothing until RFQ 2 is published.",
     pre=PRE, role="Vendor", portal="Vendor mailbox", ttype="Negative", priority="High")
case("NTF", M, "Raised", "Current approver is told when the approval is raised",
     RAISE + ["Check Rohan's email and in-app bell"],
     "Rohan receives an email (Mailpit on UAT) and an in-app notification for the In-Principle Approval with a link that opens the In-Principle approval page. Anita gets nothing yet.",
     pre=PRE, role=AR, portal="Approver mailbox + bell", priority="Critical")
case("NTF", M, "Step approved", "Next approver and initiator are told after step 1",
     [R_APPROVE, "Check Anita's and Procol Support's notifications"],
     "Anita gets the approval request. Procol Support gets a progress update.",
     pre=PENDING_PRE, priority="High")
case("NTF", M, "Rejected", "Everyone in the thread is told about a rejection",
     ["Rohan approves, Anita rejects with a reason", "Check Procol Support, the project owner, Rohan and Anita"],
     "Initiator, project owner and all approvers get the rejection with the reason.",
     pre=PENDING_PRE, priority="High")
case("NTF", M, "Approved", "Initiator is told when the approval is complete",
     BOTH_APPROVE + ["Check Procol Support's email and bell"],
     "Procol Support is told the In-Principle Approval is approved. Write down whether the message mentions RFQ 2.",
     pre=PENDING_PRE, priority="High")
case("NTF", M, "Hand-over", "New owner is told after Change owner",
     ["Change the owner to Karan Joshi", "Check Karan's email and bell"], "Karan gets the usual owner-change email and in-app notification.",
     pre=DONE_PRE, role="New owner (Karan Joshi)", priority="Medium")
case("NTF", M, "Wording", "Notifications name the right event and type",
     ["Open each notification above"],
     "Each says \"In-Principle Approval\" (not Bid Proposal) and names the right project (RFX number / title). Links open the right page.",
     pre=PENDING_PRE, priority="Medium")

# ═════════════════════ 15. Activity log and reports ═════════════════════
M = "15. Activity log and reports"
case("RPT", M, "No IPA", "Reports are blank for projects without In-Principle Approval",
     ["Open the sourcing report for a project awarded directly from RFQ 1"],
     "The new columns (\"In-Principle Approved Value\", \"RFQ 2 Awarded Value\", \"Price Recovered\", \"Price Recovered (%)\", \"In-Principle Approval Turnaround (hours)\") are empty for this project, not 0 or wrong numbers.",
     ttype="Negative", priority="Medium")
case("RPT", M, "Activity", "Every step appears in the activity log",
     ["After a full flow (raise → step 1 approve → step 2 approve → RFQ 2 created → owner changed), open the project's activity log"],
     "Write down which steps appear with date, time and person. The PRD expected: raised, each step approved, approved, RFQ 2 created, RFQ 1 locked, owner changed, and recall / reject / expiry when they happen.",
     pre=PRE, priority="High")
case("RPT", M, "Approvals report", "Approvals report filter and turnaround",
     ["Open the Approvals report and filter by \"In-Principle Approval\""],
     "Only In-Principle approvals listed, with time from start to completion.",
     pre=DONE_PRE, priority="Medium")
case("RPT", M, "Sourcing report", "Sourcing report shows recovery",
     ["Award asd at ₹5,175 from RFQ 2", "Open the sourcing summary report"],
     "On the RFQ 2 row: \"In-Principle Approved Value\" 5,520, \"RFQ 2 Awarded Value\" (asd's awarded amount), \"Price Recovered\" and \"Price Recovered (%)\" (345 and 6.25 when the awarded amount is 5,175), "
     "and \"In-Principle Approval Turnaround (hours)\". The awarded value uses the same awarded amount as other award reports; if it differs from 5,175, write down both.",
     pre=DONE_PRE + " RFQ 2 published and awarded.", priority="High")
case("RPT", M, "Statuses", "Project status changes through the flow (buyer only)",
     ["Watch the project status in the Projects list during the whole flow"],
     "Line statuses: \"In-Principle Approval Pending\" → (\"In-Principle Approval Rejected\" if rejected) → \"Price Recovery in Progress\" while RFQ 2 is a draft or open. "
     "The first two are under the Evaluation filter, the last under Bidding. Vendors never see these statuses.",
     pre=PRE, priority="Medium")

# ═════════════════════ 16. Permissions ═════════════════════
M = "16. Who can see and do what"
case("PRM", M, "View thread", "A project member who is not an approver can view the approval",
     ["Log in as Karthik Iyer (project collaborator)", OPEN, MQCS, "Click the Pending button"],
     "He can open and read the approval but has no Approve/Reject.",
     pre=PENDING_PRE, role="Collaborator", ttype="Negative", priority="Medium")
case("PRM", M, "Outsider", "A user outside the project and approval cannot open it",
     ["Log in as Sunil", "Paste the approval link"], "Access denied / not found.",
     pre=PENDING_PRE, role="Unrelated user", ttype="Negative", priority="High")
case("PRM", M, "Vendor", "Vendor cannot open the approval link",
     ["Log in to the vendor portal as asd", "Paste the buyer's approval page link"], "No access.",
     pre=PENDING_PRE, role="Vendor (asd)", portal="Vendor portal", ttype="Negative", priority="High")

# ═════════════════════ 17. Regression ═════════════════════
M = "17. Regression (nothing old broke)"
case("REG", M, "Direct award", "Awarding directly from RFQ 1 still works with the feature ON",
     [LOGIN, OPEN, MQCS, "Click \"Start Awarding\" (do not use In-Principle Approval)", "Award asd and submit"],
     "Normal award + Bid Proposal approval runs. No RFQ 2, no lock. In-Principle Approval button greys with \"Event already awarded or award in progress\".",
     priority="Critical")
case("REG", M, "Other approvals", "Bid Proposal / Quote Selection / Event Creation approvals unchanged",
     ["Run one Bid Proposal, one Quote Selection and one Event Creation approval end to end"],
     "They behave exactly as before.", priority="High", data="Any normal events")
case("REG", M, "Master QCS", "Master QCS columns and actions unchanged",
     [LOGIN, OPEN, MQCS, "Use Hide fields, layout toggles, full screen, Download Report"],
     "All work as before.", priority="Medium")
case("REG", M, "Auction events", "Auction-based events are unaffected",
     ["Run an auction event to award"], "No change in behaviour; In-Principle button stays disabled for them.",
     priority="Medium", data="Project E")

# ── write ──
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "In-Principle Approval"
HEAD = PatternFill("solid", fgColor="1F4E78"); BOX = Border(*(Side(style="thin", color="BFBFBF"),) * 4)
WIDTHS = [14, 24, 18, 42, 20, 18, 46, 34, 40, 70, 75, 10, 11, 11]
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
wb.save(OUT)
print(len(rows), "cases ->", OUT)
print(Counter(c["Module"] for c in rows)); print(Counter(c["Test Type"] for c in rows)); print(Counter(c["Priority"] for c in rows))
