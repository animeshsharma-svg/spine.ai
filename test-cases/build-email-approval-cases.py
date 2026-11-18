#!/usr/bin/env python3
"""Email-based approvals: event name in the mail, replies in the same thread, bounce-back emails.
Written from procol-backend PR #17671 + howler PR #43 (9 Nov 2026). Plain language, no code words.
Output: test-cases/Email_Approvals_Test_Cases.xlsx"""
from collections import Counter
from pathlib import Path
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

OUT = Path(__file__).resolve().parent / "Email_Approvals_Test_Cases.xlsx"
COLS = ["Test Case ID", "Module", "Scenario", "Test Case Title", "User Role", "Portal", "Pre-conditions", "Configs Needed",
        "Test Data", "Test Steps", "Expected Result", "Priority", "Test Type", "Status"]
CASES = []; _n = Counter()

CFG = ("Email approvals switched on for the company, with the company's approval mailbox connected to Procol (Outlook "
       "mailbox with permission to send replies). Approval workflow for events with email approval turned on.")
PRE = ("Company: DLF Hospitality on UAT. Users: Ravi (requester / event creator), Asha (approver of step 1), Bikram "
       "(approver of step 2), Chetan (colleague in the same company, not an approver), Deepa (a deactivated user of the "
       "company), and an outside address outsider.qa@gmail.com that has no Procol account. Each person can open their "
       "own mailbox.")
DATA = ("Event \"QA Email Approval - Office Chairs Nov\" created by Ravi and sent for approval; approval workflow with "
        "two steps: step 1 = Asha, step 2 = Bikram.")

def case(prefix, module, scenario, title, steps, expected, *, pre=PRE, data=DATA, priority="High", ttype="Positive",
         role="Approver (Asha)", portal="Approver's mailbox + Buyer portal", configs=CFG):
    _n[prefix] += 1
    CASES.append({"Test Case ID": f"EMA-{prefix}-{_n[prefix]:03d}", "Module": module, "Scenario": scenario,
                  "Test Case Title": title, "User Role": role, "Portal": portal, "Pre-conditions": pre,
                  "Configs Needed": configs, "Test Data": data,
                  "Test Steps": "\n".join(f"{i+1}. {s}" for i, s in enumerate(steps)),
                  "Expected Result": expected, "Priority": priority, "Test Type": ttype, "Status": "Not Run"})

SEND = "Log in as Ravi, create the event \"QA Email Approval - Office Chairs Nov\" and submit it for approval"
OPEN_MAIL = "Log in to Asha's mailbox and open the approval request email from Procol"
CLICK_APPROVE = "Click the green \"Approve\" button in the email. Your mail app opens a new email addressed to the company's approval mailbox with the subject starting \"Action:Approve\""
CLICK_REJECT = "Click the \"Reject\" button in the email. A new email opens with the subject starting \"Action:Reject\""
CLICK_CONSULT = "Click the \"Consult\" button in the email. A new email opens with the subject starting \"Action:Consult\""
SEND_IT = "Send the email without changing the subject"
WAIT = "Wait 1-2 minutes for Procol to read the mailbox"

# ───────────────────────── 0. Set-up ─────────────────────────
M = "0. Set-up"
case("SET", M, "Users", "Prepare the people for the email approval tests",
     ["Log in to DLF Hospitality on UAT as a super admin",
      "Make sure Ravi, Asha, Bikram and Chetan are active users of the company with working email addresses you can open",
      "Deactivate the user Deepa (or use an already deactivated user) and note her email address",
      "Keep one outside email address ready (for example outsider.qa@gmail.com) that is not a Procol user anywhere"],
     "All five users exist as described; Deepa is shown as inactive; the outside address is not found in the company's user list.",
     role="Super admin", portal="Buyer portal", priority="Critical", data="-")
case("SET", M, "Workflow", "Prepare a two-step approval workflow for events with email approval",
     ["Go to Approval Workflows and create (or edit) a workflow for events / bid proposals",
      "Set step 1 approver = Asha and step 2 approver = Bikram",
      "Make sure the approvers receive the approval request by email (email approval turned on for the company)",
      "Save the workflow"],
     "The workflow is saved with two steps in order. When an event is sent for approval, Asha gets an email first; Bikram only after Asha approves.",
     role="Super admin", portal="Buyer portal", priority="Critical", data="-")
case("SET", M, "Event", "Create the test event and send it for approval",
     [SEND, "Open the event in Procol and check the approval status"],
     "The event shows \"Pending approval\" (or similar) with step 1 waiting on Asha. Asha gets an approval request email within a couple of minutes.",
     role="Requester (Ravi)", portal="Buyer portal", priority="Critical")

# ───────────────────────── 1. Event name in the email ─────────────────────────
M = "1. Event name in the email"
case("NAME", M, "Event name", "Approval request email names the event",
     [SEND, OPEN_MAIL, "Read the first line of the email"],
     "The email says \"Ravi has requested for your approval in <type> for QA Email Approval - Office Chairs Nov.\" The event name is in bold and matches the event exactly.",
     priority="Critical")
case("NAME", M, "Event name", "Reminder email names the event",
     [SEND, "Do not act on the email. Wait for the reminder email (or ask the dev to trigger the reminder)",
      "Open the reminder email in Asha's mailbox"],
     "The reminder says \"This is just a quick reminder that Ravi has requested for your approval in <type> for QA Email Approval - Office Chairs Nov.\" with the event name in bold.",
     priority="High")
case("NAME", M, "Event name", "Email for the second step also names the event",
     [SEND, OPEN_MAIL, CLICK_APPROVE, SEND_IT, WAIT, "Log in to Bikram's mailbox and open the approval request email"],
     "Bikram's email names the same event in bold. Nothing is cut off.",
     role="Approver (Bikram)", priority="High")
case("NAME", M, "Special characters", "Event name with & < > and quotes shows correctly in the email",
     ["As Ravi, create an event named \"Chairs & Tables <Phase 2> \"Urgent\"\" and send it for approval", OPEN_MAIL],
     "The name shows exactly as typed: Chairs & Tables <Phase 2> \"Urgent\". No odd text such as &amp; or &lt; and nothing is missing.",
     ttype="Edge", priority="Medium", data="Event name with special characters")
case("NAME", M, "Long name", "Very long event name is shown in full",
     ["As Ravi, create an event whose name is about 200 characters long and send it for approval", OPEN_MAIL],
     "The whole name is shown; the email layout is not broken; the Approve / Reject buttons are still visible.",
     ttype="Edge", priority="Low", data="200-character event name")
case("NAME", M, "No name", "Approval email for an item that has no name still reads properly",
     ["Send for approval an item whose name is empty (for example a PR or PO without a title, if the company allows it)",
      "Open the approval request email"],
     "The sentence ends after the type: \"... has requested for your approval in <type>.\" There is no dangling \"for\" and no blank bold space.",
     ttype="Edge", priority="Low", data="Approval item with an empty name")
case("NAME", M, "Renamed event", "Reminder shows the current name after the event is renamed",
     [SEND, "As Ravi, rename the event to \"QA Email Approval - Office Chairs Nov (renamed)\" while approval is pending (if the app allows it)",
      "Wait for the reminder email"],
     "The reminder shows the new name. (The first request email keeps the old name, which is fine.)",
     ttype="Edge", priority="Low")
case("NAME", M, "Other approval types", "PR and PO approval emails name the item too",
     ["Send a PR for approval and a PO for approval (workflows with Asha as approver)", "Open both approval emails"],
     "Each email names its item (the PR number / PO number or title) the same way as the event email.",
     priority="Medium", data="One PR and one PO sent for approval")

# ───────────────────────── 2. Action buttons ─────────────────────────
M = "2. Action buttons in the email"
for client in ["Gmail on the web", "Outlook desktop app", "Outlook on the web", "Apple Mail / phone mail app"]:
    case("LINK", M, "Mail apps", f"Approve button opens a correct email in {client}",
         [f"Open the approval request email in {client}", "Click \"Approve\""],
         "A new email opens addressed to the company's approval mailbox. Subject: \"Action:Approve|Proposal:[...]\" with the square brackets and the | shown normally (no %7C or %5B in the subject). Body: \"(Required) Comment:\" then \"This is a system-generated message, content after this will be ignored\".",
         priority="Critical" if "Gmail" in client or "Outlook desktop" in client else "High", data="-")
case("LINK", M, "Buttons", "Reject button opens the reject email",
     [OPEN_MAIL, CLICK_REJECT],
     "Subject starts with \"Action:Reject|Proposal:[\". Body has \"(Required) Comment:\" with an empty line for the reason.",
     priority="Critical")
case("LINK", M, "Buttons", "Consult button opens the consult email with the recipient instruction",
     [OPEN_MAIL, CLICK_CONSULT],
     "Subject starts with \"Action:Consult|Proposal:[\". Body first line: \"Type the recipient's email address without @ in front of it.\" Then \"(Required) Comment:\", \"Recipient:\" and the system line.",
     priority="Critical")
case("LINK", M, "Buttons", "Review button opens the review email with the recipient instruction",
     [OPEN_MAIL, "Click \"Review\""],
     "Subject starts with \"Action:Review|Proposal:[\". Body is the same as the Consult email (instruction, Comment, Recipient).",
     priority="High")
case("LINK", M, "Buttons", "Each button points at the company's own approval mailbox",
     [OPEN_MAIL, "Hover over (or long-press) each of the four buttons and note the address"],
     "All four open an email to the same address: the company's approval mailbox. Never a Procol-wide or another company's address.",
     priority="High")
case("LINK", M, "Mailbox with special characters", "Buttons work when the approval mailbox address has a + or quote in it",
     ["On a company whose approval mailbox address has a + (for example approvals+dlf@...), send an event for approval", OPEN_MAIL, CLICK_APPROVE],
     "The email opens addressed to the full mailbox address; the subject still starts with \"Action:Approve\".",
     ttype="Edge", priority="Low", data="Company approval mailbox with + in the address")

# ───────────────────────── 3. Approve from email ─────────────────────────
M = "3. Approve from email"
case("APR", M, "Approve twice", "Approving a second time bounces back as already responded",
     [SEND, OPEN_MAIL, CLICK_APPROVE, SEND_IT, WAIT, "Go back to the original approval request email and click \"Approve\" again", SEND_IT, WAIT,
      "Open Asha's inbox"],
     "A bounce-back email arrives in the SAME thread as the original approval request, saying \"A response to request [...] has already been recorded, so this approval was not applied. No further action is needed.\" and ending \"This is an automated message from Procol.\" In Procol, the event shows only one approval by Asha and step 2 is still with Bikram.",
     ttype="Negative", priority="Critical")
case("APR", M, "Approve twice", "Approving after you already rejected bounces back",
     [SEND, OPEN_MAIL, CLICK_REJECT, "Type \"Price too high\" after (Required) Comment:", SEND_IT, WAIT, "Click \"Approve\" in the original email", SEND_IT, WAIT],
     "Bounce-back in the same thread: \"A response to request [...] has already been recorded, so this approval was not applied.\" The event stays rejected.",
     ttype="Negative", priority="Critical")
case("APR", M, "Not an approver", "A colleague who was forwarded the email cannot approve",
     [SEND, OPEN_MAIL, "Forward the approval request email to Chetan", "Log in to Chetan's mailbox, open the forwarded email and click \"Approve\"", SEND_IT, WAIT],
     "Chetan gets a bounce-back: \"We could not record your approval because you are not an approver for request [...] at its current stage.\" Nothing changes on the event; Asha's step is still pending.",
     ttype="Negative", priority="Critical", role="Colleague (Chetan)")
case("APR", M, "Wrong step", "The step-2 approver cannot approve before step 1 is done",
     [SEND, "Log in to Bikram's mailbox. Use an older approval email of this company (or ask Asha to forward hers) and click \"Approve\"", SEND_IT, WAIT],
     "Bikram gets the bounce-back \"... you are not an approver for request [...] at its current stage.\" Step 1 still waits on Asha.",
     ttype="Negative", priority="Critical", role="Approver (Bikram)")
case("APR", M, "Request closed", "Approving after the request is already fully approved bounces back",
     [SEND, "Asha approves from email, then Bikram approves from email (both get \"recorded\" replies)",
      "Asha clicks \"Approve\" in her original email once more", SEND_IT, WAIT],
     "Bounce-back in the same thread: \"Request [...] is no longer waiting for approval, so your approval was not applied. No further action is needed.\"",
     ttype="Negative", priority="High")
case("APR", M, "Request closed", "Approving after the requester withdrew the event bounces back",
     [SEND, "As Ravi, withdraw / cancel the event (or the approval request)", OPEN_MAIL, CLICK_APPROVE, SEND_IT, WAIT],
     "Bounce-back: \"Request [...] is no longer waiting for approval, so your approval was not applied.\" The event stays withdrawn.",
     ttype="Negative", priority="High")
case("APR", M, "Request closed", "Approving after another approver of the same step already rejected",
     ["Use a workflow where step 1 has two approvers, Asha and Chetan, and any one rejection closes the step", SEND,
      "Chetan rejects from email with a comment", "Asha clicks \"Approve\" in her email", SEND_IT, WAIT],
     "Asha gets the \"no longer waiting for approval\" bounce-back. The event stays rejected.",
     ttype="Negative", priority="Medium", data="Workflow: step 1 = Asha + Chetan")
case("APR", M, "Subject changed", "An action email with an edited subject is not treated as an approval",
     [OPEN_MAIL, CLICK_APPROVE, "Change the subject to \"Approve please\" and send it", WAIT],
     "The approval is NOT recorded. Asha gets a reply asking her to send the email without changing the subject line, or to take the action in Procol.",
     ttype="Negative", priority="Medium")
case("APR", M, "Happy path", "Approving from email is recorded and confirmed in the same thread",
     [SEND, OPEN_MAIL, CLICK_APPROVE, "Optionally type \"Looks fine\" after (Required) Comment:", SEND_IT, WAIT, "Open Asha's inbox", "Open the event in Procol"],
     "Asha gets a reply IN THE SAME THREAD as the original approval request (not a new email) saying \"Your approval for request [...] has been recorded. No further action is needed.\" with \"This is an automated message from Procol.\" In Procol step 1 shows approved by Asha with the comment \"Looks fine\"; Bikram receives the step-2 email.",
     priority="Critical")
case("APR", M, "Happy path", "Approval without a comment is accepted",
     [SEND, OPEN_MAIL, CLICK_APPROVE, "Leave the comment empty", SEND_IT, WAIT],
     "The approval is recorded and the \"has been recorded\" reply arrives. A comment is only required for rejection.",
     priority="High")
case("APR", M, "Happy path", "Text typed below the system line is ignored",
     [OPEN_MAIL, CLICK_APPROVE, "Type \"OK\" after (Required) Comment: and type \"ignore me\" below the line \"This is a system-generated message...\"", SEND_IT, WAIT],
     "The approval is recorded with the comment \"OK\" only. \"ignore me\" is not shown in Procol.",
     ttype="Edge", priority="Low")
case("APR", M, "Whole flow", "Both steps approved from email complete the approval",
     [SEND, "Asha approves from email", WAIT, "Bikram approves from email", WAIT, "Open the event in Procol"],
     "Both approvers get \"recorded\" replies in their own threads. The event shows fully approved and Ravi is notified that it is approved.",
     priority="Critical", role="Approvers (Asha, Bikram)")

# ───────────────────────── 4. Reject from email ─────────────────────────
M = "4. Reject from email"
case("REJ", M, "No comment", "Rejecting without a comment bounces back and is not recorded",
     [SEND, OPEN_MAIL, CLICK_REJECT, "Leave the comment empty", SEND_IT, WAIT, "Open Asha's inbox", "Open the event in Procol"],
     "A bounce-back arrives in the same thread: \"We could not record your rejection because no comment was given. Please click Reject in the original email again and write your reason after \"(Required) Comment:\".\" The event is still pending on Asha. No separate \"Comment is required when rejecting\" email is sent any more.",
     ttype="Negative", priority="Critical")
case("REJ", M, "No comment", "A comment made only of spaces or blank lines counts as no comment",
     [OPEN_MAIL, CLICK_REJECT, "Type only a few spaces / press Enter a few times after (Required) Comment:", SEND_IT, WAIT],
     "Same bounce-back as above (\"no comment was given\"). Nothing is recorded.",
     ttype="Negative", priority="High")
case("REJ", M, "No comment", "A reason written below the system line does not count",
     [OPEN_MAIL, CLICK_REJECT, "Leave the Comment line empty and write \"Too expensive\" BELOW \"This is a system-generated message...\"", SEND_IT, WAIT],
     "Bounce-back \"no comment was given\". The rejection is not recorded.",
     ttype="Negative", priority="Medium")
case("REJ", M, "No comment", "After the bounce, rejecting again with a comment works",
     ["Do the case above (reject with no comment, get the bounce)", "Click \"Reject\" in the ORIGINAL email again, type \"Too expensive\" after (Required) Comment:", SEND_IT, WAIT],
     "Reply in the same thread: \"Your rejection for request [...] has been recorded.\" The event shows rejected by Asha with the comment \"Too expensive\"; Ravi is told.",
     priority="Critical")
case("REJ", M, "Reject twice", "Rejecting a second time bounces back as already responded",
     [SEND, OPEN_MAIL, CLICK_REJECT, "Type \"Too expensive\"", SEND_IT, WAIT, "Click \"Reject\" again in the original email, type \"Still too expensive\"", SEND_IT, WAIT],
     "Bounce-back: \"A response to request [...] has already been recorded, so this rejection was not applied.\" Procol shows only the first rejection and comment.",
     ttype="Negative", priority="High")
case("REJ", M, "Not an approver", "A forwarded reject email from a colleague is refused",
     [SEND, OPEN_MAIL, "Forward the email to Chetan; Chetan clicks \"Reject\", types \"No\" and sends"],
     "Chetan gets \"We could not record your rejection because you are not an approver ...\". The event stays pending on Asha.",
     ttype="Negative", priority="High", role="Colleague (Chetan)")
case("REJ", M, "Happy path", "Rejecting with a comment is recorded and confirmed in the thread",
     [SEND, OPEN_MAIL, CLICK_REJECT, "Type \"Price above budget\" after (Required) Comment:", SEND_IT, WAIT, "Open the event in Procol"],
     "Reply in the same thread \"Your rejection for request [...] has been recorded. No further action is needed.\" In Procol the event is rejected with the comment \"Price above budget\" shown; Bikram never gets a step-2 email.",
     priority="Critical")
case("REJ", M, "Happy path", "A long comment with several lines is kept in full",
     [OPEN_MAIL, CLICK_REJECT, "Type a 4-line reason after (Required) Comment:", SEND_IT, WAIT, "Open the event in Procol"],
     "The whole 4-line comment is shown in Procol in the right order.",
     priority="Medium", ttype="Edge")

# ───────────────────────── 5. Consult / Review ─────────────────────────
M = "5. Consult / Review from email"
case("CON", M, "External recipient", "Consulting an outside address bounces back and nothing is sent",
     [SEND, OPEN_MAIL, CLICK_CONSULT, "Type \"Please check the price\" after Comment: and \"outsider.qa@gmail.com\" after Recipient:", SEND_IT, WAIT,
      "Check Asha's inbox, the outsider's inbox and the event in Procol"],
     "Asha gets a bounce-back in the same thread: \"We could not send your consultation because outsider.qa@gmail.com is not part of your organisation on Procol. Please choose a colleague from your organisation and try again.\" The outside address receives NO email. No consultation appears on the event; Asha's approval is still pending.",
     ttype="Negative", priority="Critical")
case("CON", M, "External recipient", "Reviewing with an outside address bounces back the same way",
     [OPEN_MAIL, "Click \"Review\"", "Type a comment and \"outsider.qa@gmail.com\" after Recipient:", SEND_IT, WAIT],
     "Bounce-back \"We could not send your review because outsider.qa@gmail.com is not part of your organisation on Procol...\". No review is created.",
     ttype="Negative", priority="Critical")
case("CON", M, "External recipient", "A Procol user of ANOTHER company is treated as outside",
     [OPEN_MAIL, CLICK_CONSULT, "Type a comment and the email of a user who belongs to a different company on Procol", SEND_IT, WAIT],
     "Same \"is not part of your organisation on Procol\" bounce-back. The other company's user gets nothing.",
     ttype="Negative", priority="High", data="Email of a buyer user from another company on UAT")
case("CON", M, "External recipient", "A deactivated user of the company is refused",
     [OPEN_MAIL, CLICK_CONSULT, "Type a comment and Deepa's email (deactivated user)", SEND_IT, WAIT],
     "Bounce-back \"... is not part of your organisation on Procol\". Deepa gets nothing.",
     ttype="Negative", priority="High")
case("CON", M, "No recipient", "Consult with the Recipient line left empty bounces back",
     [OPEN_MAIL, CLICK_CONSULT, "Type a comment, leave Recipient: empty", SEND_IT, WAIT],
     "Reply: \"We could not record your consultation because no recipient was found. Please reply again with the recipient's email address after \"Recipient:\".\" Nothing is created.",
     ttype="Negative", priority="High")
case("CON", M, "No recipient", "Recipient typed with a spelling mistake is refused",
     [OPEN_MAIL, CLICK_CONSULT, "Type a comment and \"chetan@dlf-hospitality.con\" (wrong domain)", SEND_IT, WAIT],
     "Bounce-back \"... chetan@dlf-hospitality.con is not part of your organisation on Procol\". The exact address typed is repeated in the message so the mistake is easy to spot.",
     ttype="Negative", priority="Medium")
case("CON", M, "Not an approver", "A non-approver cannot send a consultation from a forwarded email",
     ["Forward the approval email to Chetan; Chetan clicks \"Consult\" and sends it to Bikram with a comment"],
     "Chetan gets the \"you are not an approver\" bounce-back. No consultation is created.",
     ttype="Negative", priority="Medium", role="Colleague (Chetan)")
case("CON", M, "Happy path", "Consulting a colleague creates the consultation and emails them",
     [SEND, OPEN_MAIL, CLICK_CONSULT, "Type \"Is this vendor approved?\" after Comment: and Chetan's email after Recipient:", SEND_IT, WAIT,
      "Check Asha's inbox, Chetan's inbox and the event in Procol"],
     "Asha gets \"Your consultation for request [...] has been recorded.\" in her approval thread. Chetan gets a \"Consultation Request\" email naming the event, showing Asha's question and a \"Reply\" button. The event shows the consultation with Asha's comment. Asha's approval stays pending.",
     priority="Critical")
case("CON", M, "Happy path", "Review request to a colleague works the same way",
     [OPEN_MAIL, "Click \"Review\"", "Type a comment and Chetan's email after Recipient:", SEND_IT, WAIT],
     "Asha's reply says her review (request) has been recorded; Chetan gets the review email; the event shows it.",
     priority="High")
case("CON", M, "Address format", "Recipient typed in CAPITALS or mixed case is accepted",
     [OPEN_MAIL, CLICK_CONSULT, "Type a comment and Chetan's email in capitals, e.g. CHETAN@DLF-HOSPITALITY.COM", SEND_IT, WAIT],
     "The consultation is created and Chetan receives it, exactly as with the lower-case address.",
     ttype="Edge", priority="Medium")
case("CON", M, "Address format", "Recipient address with spaces around it is accepted",
     [OPEN_MAIL, CLICK_CONSULT, "Type \"Recipient:   chetan@...   \" with extra spaces before and after", SEND_IT, WAIT],
     "The consultation is created; the spaces do not cause a bounce.",
     ttype="Edge", priority="Low")
case("CON", M, "Address format", "Typing @ in Gmail does not break the consultation",
     ["Open the approval email in Gmail on the web", CLICK_CONSULT, "After Recipient: type \"@\" and pick Chetan from Gmail's pop-up suggestion (a mention), then send"],
     "The consultation is still created for Chetan. If Gmail sends its own \"mentioned you\" email to Chetan, that extra email does not create a second consultation or any bounce.",
     ttype="Edge", priority="Medium", portal="Gmail on the web + Buyer portal")
case("CON", M, "Several recipients", "Only one recipient per consultation email",
     [OPEN_MAIL, CLICK_CONSULT, "Type two addresses after Recipient:, separated by a comma", SEND_IT, WAIT],
     "The app does not silently pick one. It either creates the consultation for the first address only or bounces back; whichever happens, Asha's reply says clearly what was done. (Confirm with dev which is intended.)",
     ttype="Edge", priority="Low")

# ───────────────────────── 6. Consultant reply in the same thread ─────────────────────────
M = "6. Consultant reply in the same thread"
case("RPL", M, "Reply button", "Reply button opens a reply in the consultation thread with the requester in CC",
     ["Create a consultation from Asha to Chetan (case EMA-CON-008)", "Log in to Chetan's mailbox and open the \"Consultation Request\" email", "Click \"Reply\""],
     "A reply opens IN THE SAME THREAD: subject \"RE: <subject of the consultation email>\", To = the company approval mailbox, CC = Asha (the person who asked). Body: \"(Required) Comment:\", the system line, and a last line \"Ref: Action:Reply|Proposal:[...]\".",
     role="Consultant (Chetan)", priority="Critical")
case("RPL", M, "Reply recorded", "Consultant's reply is recorded on the event",
     ["Chetan clicks \"Reply\", types \"Yes, vendor is approved\" after (Required) Comment: and sends", WAIT, "Open the event in Procol as Asha", "Open Chetan's inbox"],
     "The consultation on the event shows Chetan's answer \"Yes, vendor is approved\". Chetan gets \"Your reply for request [...] has been recorded.\" in the SAME consultation thread. Asha (in CC) can see Chetan's reply email in her own thread.",
     role="Consultant (Chetan)", priority="Critical")
case("RPL", M, "Reply twice", "A second reply from the consultant bounces back",
     ["After the case above, Chetan clicks \"Reply\" again, types \"One more thing\" and sends", WAIT],
     "Bounce-back in the consultation thread: \"A response to request [...] has already been recorded, so this reply was not applied. No further action is needed.\" Only the first answer is on the event.",
     ttype="Negative", priority="High", role="Consultant (Chetan)")
case("RPL", M, "Reply without comment", "Consultant reply with no comment is not recorded",
     ["Chetan clicks \"Reply\", leaves the comment empty and sends", WAIT],
     "The reply is not recorded; Chetan gets a clear reply saying what to do. The consultation stays open in Procol.",
     ttype="Negative", priority="High", role="Consultant (Chetan)")
case("RPL", M, "Reference removed", "A reply with the Ref line deleted is not treated as an answer",
     ["Chetan clicks \"Reply\", types an answer, deletes the \"Ref: Action:Reply|...\" line and sends", WAIT],
     "Nothing is recorded on the event. Chetan is told the email could not be understood and to use the Reply button again or answer in Procol.",
     ttype="Negative", priority="Medium", role="Consultant (Chetan)")
case("RPL", M, "Plain reply", "A plain reply (Reply in the mail app, not the button) still works when the Ref line is quoted",
     ["Chetan uses his mail app's normal Reply on the consultation email, types an answer at the top and sends"],
     "Note what happens: if the reply is recorded, the answer appears on the event; if it is not, Chetan gets a clear bounce. Either way no silent loss. (Known: the reference is read from the body, including quoted text.)",
     ttype="Edge", priority="Medium", role="Consultant (Chetan)")
case("RPL", M, "Reply all", "Asha replying-all to Chetan's answer is not recorded as a second reply",
     ["After Chetan's reply (with his answer quoted), Asha clicks Reply-all on it and writes \"Thanks\" and sends", WAIT],
     "Known gap flagged by dev: the quoted Ref line may be read as an action. Record what happens. Expected after the follow-up fix: Asha's \"Thanks\" is ignored and no bounce or duplicate reply appears on the event.",
     ttype="Edge", priority="Medium")
case("RPL", M, "Approval after consult", "Asha can still approve after the consultation is answered",
     ["After Chetan's answer, Asha clicks \"Approve\" in her original approval email and sends", WAIT],
     "Asha gets \"Your approval ... has been recorded.\" in her approval thread (not the consultation thread). The event moves to step 2.",
     priority="High")
case("RPL", M, "Reply after closure", "Consultant reply after the event is already approved bounces back",
     ["Asha consults Chetan, then Asha and Bikram both approve before Chetan answers", "Chetan clicks \"Reply\", types an answer and sends", WAIT],
     "Chetan gets \"Request [...] is no longer waiting for approval, so your reply was not applied.\"",
     ttype="Negative", priority="Medium", role="Consultant (Chetan)")

# ───────────────────────── 7. Where the replies land ─────────────────────────
M = "7. Reply threads and who gets them"
case("THR", M, "Same thread", "The confirmation sits under the original approval request, not as a new email",
     [SEND, OPEN_MAIL, CLICK_APPROVE, SEND_IT, WAIT, "Look at Asha's inbox in conversation view"],
     "The \"has been recorded\" reply appears inside the original approval request conversation. The inbox does not show a separate new conversation for it.",
     priority="Critical")
case("THR", M, "Same thread", "Every bounce-back also sits in the original approval thread",
     ["Trigger a no-comment rejection bounce and an outside-recipient bounce (cases EMA-REJ-001 and EMA-CON-001)", "Look at Asha's inbox"],
     "Both bounce-backs are in the original approval request thread, one under the other, in order.",
     priority="High", ttype="Negative")
case("THR", M, "Only the approver", "Replies go to the approver only, not to people in CC",
     [OPEN_MAIL, CLICK_APPROVE, "Add Chetan in CC of the action email and send", WAIT],
     "Only Asha receives the \"has been recorded\" reply. Chetan receives nothing from Procol.",
     priority="High")
case("THR", M, "Fallback", "If the original request email cannot be found, the reply goes on the action email itself",
     ["Ask the dev to delete (or move) the sent approval request from the approval mailbox's Sent folder", OPEN_MAIL, CLICK_APPROVE, SEND_IT, WAIT],
     "Asha still gets the \"has been recorded\" reply, as a reply to the action email she sent. Nothing is lost.",
     ttype="Edge", priority="Medium")
case("THR", M, "Auto-replies", "An out-of-office auto-reply never gets a reply back (no loop)",
     ["Set an out-of-office auto-reply on Asha's mailbox", SEND, "Wait for the auto-reply to reach the approval mailbox", "Watch the approval mailbox for 10 minutes"],
     "Procol ignores the out-of-office email: no bounce-back is sent to it and no action is recorded. No ping-pong of emails between the two mailboxes.",
     ttype="Negative", priority="Critical")
case("THR", M, "Auto-replies", "A delivery-failure email in the approval mailbox is ignored",
     ["Make the approval mailbox receive a delivery failure (for example by consulting a non-existent address on a company that is allowed, or ask dev to drop one in)", "Watch the mailbox"],
     "No reply is sent to the delivery-failure email and nothing is recorded.",
     ttype="Negative", priority="Medium")
case("THR", M, "Temporary problem", "When Procol's server is down, the approver is told to try again",
     ["Ask the dev to stop the backend (or block it) for a few minutes", OPEN_MAIL, CLICK_APPROVE, SEND_IT, WAIT],
     "Asha gets a reply in the same thread: \"Please try again in a few minutes, or take the action directly in Procol.\" The approval is retried by the system; once the server is back, either it is recorded (and Asha gets the \"recorded\" reply) or she can act again.",
     ttype="Negative", priority="High")
case("THR", M, "No double action", "A refused action is not retried later",
     ["Trigger a no-comment rejection bounce", "Wait 15 minutes"],
     "No second bounce and no late rejection appears. The refusal is final.",
     ttype="Negative", priority="Medium")
case("THR", M, "Gmail company", "Company whose approval mailbox is Gmail: actions work, replies may not be sent yet",
     ["On a company whose approval mailbox is Gmail / IMAP (not Outlook), send an event for approval, approve from email"],
     "The approval is recorded in Procol. The reply in thread is a known limitation for Gmail mailboxes (not sent yet); the app must not error or send a broken email.",
     ttype="Edge", priority="Low", configs="Company whose approval mailbox is Gmail / IMAP")

# ───────────────────────── 8. Procol after the email ─────────────────────────
M = "8. What Procol shows afterwards"
case("APP", M, "Approval log", "Email approval shows in the event's approval history with the comment",
     ["Asha approves from email with the comment \"Looks fine\"", WAIT, "Open the event in Procol as Ravi and open the approval details / history"],
     "Step 1 shows approved by Asha, the time, and the comment \"Looks fine\". It looks the same as an approval done inside the app.",
     role="Requester (Ravi)", portal="Buyer portal", priority="High")
case("APP", M, "Notifications", "Requester is notified when an email approval or rejection happens",
     ["Asha rejects from email with a comment", WAIT, "Log in as Ravi and open the notification bell and the email inbox"],
     "Ravi gets the usual rejection notification (and email, if the company sends them) with Asha's comment. Same as an in-app rejection.",
     role="Requester (Ravi)", portal="Buyer portal", priority="High")
case("APP", M, "Consultation view", "Consultation asked by email and answered by email is readable in the app",
     ["Asha consults Chetan by email, Chetan answers by email", "Open the event's consultation section as Asha and as Ravi"],
     "Both the question and the answer are shown with the right names and times.",
     priority="High")
case("APP", M, "Mixed", "Consult by email, answer in the app",
     ["Asha consults Chetan by email", "Chetan logs in to Procol and answers the consultation inside the app"],
     "The answer is saved. If Chetan then also clicks \"Reply\" in the email and sends an answer, he gets the \"already been recorded\" bounce.",
     ttype="Edge", priority="Medium", role="Consultant (Chetan)")
case("APP", M, "Mixed", "Approve in the app after acting by email is blocked the same way",
     ["Asha approves from email", WAIT, "Asha logs in to Procol and opens the event"],
     "The event no longer offers Asha the Approve / Reject buttons for step 1 (it is done). No double approval is possible.",
     priority="High", portal="Buyer portal")

# ───────────────────────── 9. Regression ─────────────────────────
M = "9. Regression"
case("REG", M, "In-app approvals", "Approving and rejecting inside the app still work as before",
     [SEND, "As Asha, log in to Procol and approve from the event page", "On another event, reject from the event page without a comment, then with a comment"],
     "Approve works. Reject without a comment is still refused in the app with the usual message; with a comment it works.",
     portal="Buyer portal", priority="Critical")
case("REG", M, "Old emails", "Approval emails sent before this release still work",
     ["Find an approval request email sent before the release (old style, without the event name) whose request is still pending", "Click \"Approve\" and send"],
     "The approval is recorded and the \"has been recorded\" reply arrives in that thread.",
     priority="High", ttype="Edge", data="A pending approval request from before the release")
case("REG", M, "Reminder", "Reminder emails still go out on schedule",
     [SEND, "Do nothing; wait for the reminder time set in the workflow"],
     "The reminder email arrives, names the event, and its buttons work the same as the first email's.",
     priority="Medium")
case("REG", M, "Other companies", "A company WITHOUT email approvals is not affected",
     ["On a company where email approvals are off, send an event for approval"],
     "Approvers get the in-app notification (and the plain email, if any) as before. No Approve / Reject buttons appear, no bounce-backs.",
     priority="Medium", configs="Email approvals OFF for the company", data="A second test company with email approvals off")

# ───────────────────────── write ─────────────────────────
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Email Approvals"
HEAD = PatternFill("solid", fgColor="1F4E78"); BOX = Border(*(Side(style="thin", color="BFBFBF"),) * 4)
WIDTHS = [14, 22, 18, 42, 18, 24, 46, 40, 40, 70, 70, 10, 11, 11]
for i, (h, w) in enumerate(zip(COLS, WIDTHS), 1):
    c = ws.cell(row=1, column=i, value=h); c.font = Font(bold=True, color="FFFFFF"); c.fill = HEAD
    c.alignment = Alignment(wrap_text=True, vertical="center"); ws.column_dimensions[get_column_letter(i)].width = w
ORDER = {"Negative": 0, "Edge": 1, "Positive": 2}
mods = []
for c in CASES:
    if c["Module"] not in mods: mods.append(c["Module"])
rows = sorted(CASES, key=lambda c: (mods.index(c["Module"]), ORDER[c["Test Type"]] if c["Module"] != "0. Set-up" else 0, c["Test Case ID"]))
for r, c in enumerate(rows, 2):
    for i, h in enumerate(COLS, 1):
        cell = ws.cell(row=r, column=i, value=c[h]); cell.alignment = Alignment(wrap_text=True, vertical="top"); cell.border = BOX
    pr = ws.cell(row=r, column=COLS.index("Priority") + 1)
    pr.fill = PatternFill("solid", fgColor={"Critical": "F8CBAD", "High": "FFE699", "Medium": "DDEBF7", "Low": "E2EFDA"}[c["Priority"]])
ws.freeze_panes = "E2"; ws.auto_filter.ref = f"A1:{get_column_letter(len(COLS))}{ws.max_row}"
dv = DataValidation(type="list", formula1='"Not Run,Pass,Fail,Blocked"', allow_blank=True); ws.add_data_validation(dv)
dv.add(f"N2:N{ws.max_row}")
wb.save(OUT)
print(len(rows), "cases ->", OUT)
print(Counter(c["Module"] for c in rows)); print(Counter(c["Test Type"] for c in rows)); print(Counter(c["Priority"] for c in rows))
