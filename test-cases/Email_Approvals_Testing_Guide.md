# Email-based approvals — complete testing guide (DLF Hospitality, UAT)

Written 9 Nov 2026 for the chat/agent that will run the test sheet
`test-cases/Email_Approvals_Test_Cases.xlsx` (80 cases) end to end and report bugs the way a manual QA would.

Feature under test:
- backend PR https://github.com/Procol-Tech/procol-backend/pull/17671 (feat/consultation-reply-in-thread)
- paired Howler PR https://github.com/Procol-Tech/howler/pull/43 (email approval single mail thread)

They must be released together. Howler is Procol's email-reading robot: it watches the company's approval mailbox,
reads each action email (Approve / Reject / Consult / Review / consultant Reply), hands it to the backend, and replies
to the approver in the same email thread with either "recorded" or a bounce-back that says why it was refused.

---

## 1. What the feature does (plain language)

1. **Event name in the email.** The approval request email and the reminder email now say
   "*<requester>* has requested for your approval in *<type>* for **<event name>**."
2. **Action buttons open a correct email in every mail app.** Approve / Reject / Consult / Review are "mailto" buttons.
   The subject is `Action:Approve|Proposal:[<id>]` (readable, no `%7C`-style junk). The body is
   `(Required) Comment:` then `This is a system-generated message, content after this will be ignored`.
   Consult / Review bodies start with `Type the recipient's email address without @ in front of it.` and have a
   `Recipient:` line.
3. **Reply in the same thread.** After an action email is sent, the approver gets a reply **inside the original
   approval request's conversation**, sent to the approver only:
   - success: `Your <approval|rejection|consultation|review|reply> for request [<id>] has been recorded. No further action is needed.`
   - every reply ends with `This is an automated message from Procol.`
4. **Bounce-back emails** (same thread) when the action is refused:

   | When | Bounce text |
   |---|---|
   | approved / rejected a second time | `A response to request [<id>] has already been recorded, so this <action> was not applied. No further action is needed.` |
   | sender is not an approver of the current step (forwarded email, step-2 approver acting early) | `We could not record your <action> because you are not an approver for request [<id>] at its current stage.` |
   | request already finished / withdrawn | `Request [<id>] is no longer waiting for approval, so your <action> was not applied. No further action is needed.` |
   | rejection with no comment | `We could not record your rejection because no comment was given. Please click Reject in the original email again and write your reason after "(Required) Comment:".` |
   | consult / review to someone outside the organisation (outside address, another company's user, deactivated user) | `We could not send your <action> because <address> is not part of your organisation on Procol. Please choose a colleague from your organisation and try again.` |
   | consult / review with no recipient | `We could not record your <action> because no recipient was found. Please reply again with the recipient's email address after "Recipient:".` |
   | subject changed / email not understood | asks to send it again without changing the subject line, or act in Procol |
   | Procol server not reachable | `Please try again in a few minutes, or take the action directly in Procol.` (the action is retried by the system) |

   The old separate "⚠️ Comment is required when rejecting" email is **removed** — a no-comment rejection must only produce the bounce above.
5. **Consultant Reply in the thread.** The consultant's "Consultation Request" email has a **Reply** button that opens a
   reply `RE: <same subject>` in the consultation thread, with the person who asked in **CC**, and a last body line
   `Ref: Action:Reply|Proposal:[...]`. Sending it records the answer on the event.
6. **Auto-replies are ignored.** Out-of-office and delivery-failure emails never get a reply and never record an action.

Important product facts found in the code:
- The Approve / Reject / Consult / Review buttons exist **only on Bid Proposal approvals** (the award / proposal
  approval that is sent from the PO form on DLF), and only when the company setting `email_approvals_enabled` is On.
  Event-creation approvals do NOT get the buttons.
- Replies in thread work only when the company's approval mailbox is an **Outlook** mailbox connected to Howler with
  the Mail.Send permission. Gmail/IMAP mailboxes record actions but cannot send replies yet (known limitation).
- Howler's tenant config needs the `"Consultation Request"` subject pattern, or consultant replies are never read.
- Known gap the dev flagged: a reply-all that quotes the consultant's reply may be read as an action (the `Ref:` line
  inside quoted text). Case EMA-RPL-007 records what happens.

---

## 2. Environment

| Item | Value |
|---|---|
| Company | DLF Hospitality, UAT (company id 43386) |
| Buyer app | https://cpanel.ag-ri.in |
| API | https://sec-api.ag-ri.in/api |
| Session | `procol-ui-tests/.auth/dlf.json` (git-ignored). Use `accessTokenHeader` as the `ACCESS-TOKEN` header. **Never print, paste or screenshot the token.** If it has expired, run `procol-ui-tests/scripts/dlf-relogin.ts` (needs the tester's phone + login code — ask, don't guess). |
| Test user | id 19743, super admin, Member of team "All Categories" |
| Existing helpers | `procol-ui-tests/scripts/aw-e2e-build.ts` builds a PR-based event in ~3 min (`--step create --line <prItemId>` then `--step bid`), then proposal + `create_po_form`; `aw-e2e-ui.ts --part po` submits the PO form; `aw-cleanup.ts` deletes the "QA_Platform AW…" workflows. Facts and traps are in `test-cases/build-approval-workflows-cases.py` and the Approval Workflows report. |
| Test sheet | `test-cases/Email_Approvals_Test_Cases.xlsx` — 80 cases, IDs EMA-SET / NAME / LINK / APR / REJ / CON / RPL / THR / APP / REG |
| Bug sheet builder | `test-cases/bug_sheet.py` → `write_bug_sheet(wb, "email_approvals", bugs, feature=...)` (tester's Internal RFX_Bugs layout) |

---

## 3. Things to confirm BEFORE testing (ask the tester / dev; do not assume)

1. `email_approvals_enabled` is **On** for DLF Hospitality on UAT (read it from the company configuration; if Off, ask before switching — it is a shared UAT company).
2. DLF's **approval mailbox** address (the address the buttons send to) and that it is an **Outlook** mailbox connected to Howler on UAT with Mail.Send.
3. **Both** PRs (#17671 and howler #43) are deployed on this UAT. If only one is, stop and report — every bounce result would be meaningless.
4. Howler's tenant config has the `"Consultation Request"` subject pattern.
5. Mailboxes you can actually open for: requester, step-1 approver, step-2 approver, one colleague who is not an approver,
   plus one deactivated DLF user's address and one outside Gmail address with no Procol account.
   Signing in to another person's mailbox or Procol account is only allowed when the tester hands you that account for this run.

---

## 4. Set-up (do once)

### 4.1 Users
- Requester **Ravi** = the test user 19743 (creates the event / submits the PO form).
- **Asha** = step-1 approver, **Bikram** = step-2 approver, **Chetan** = same-company colleague, not an approver.
- **Deepa** = a deactivated DLF user (note the email only).
- **Outsider** = e.g. `outsider.qa@gmail.com`, not a Procol user anywhere.
Use the real DLF UAT users the tester gives you; keep the role names above in your notes so the results map to the sheet.

### 4.2 Workflow (EMA-SET-002)
Approval Workflows → Team → + Create → Add Trigger Settings → Approval Type **Bid Proposal** → Team "All Categories",
Initiators "Member" → Save. Two steps: step 1 = Asha, step 2 = Bikram. Name it `QA_Platform EMA …` so
`aw-cleanup.ts` can delete it afterwards. Do not edit the DLF "test" workflows 6815–6817 (shared data).
If the workflow page shows a red "Internal Server Error" toast on open, that is the known bug AW-E2E-016 — carry on.

### 4.3 Event that reaches Bid Proposal approval (EMA-SET-003)
The buttons appear only on the Bid Proposal approval, so each approve/reject case needs an event that reaches the
proposal / PO-form submit. Fastest path (from the Approval Workflows run):
1. `aw-e2e-build.ts --step create --line <PR line>` → event from PR 369 (spare line 204719, Panchkula) or any open DLF PR line.
2. `--step bid` → surrogate quote for vendor Demo10.
3. Proposal → Add Response → **create_po_form** (without it the PO form says "Please award for at least one Vendor").
4. Submit the PO form (`aw-e2e-ui.ts --part po`): General Details must match the workflow's conditions
   (unit = hub id as text, form type = template id) → NTD page → pick the QA workflow → Submit.
5. Asha's mailbox should receive the approval request within ~2 minutes. If not, go back to section 3.

Build **10–12 such events upfront** — an event can be approved only once, and most APR/REJ/CON cases burn one.
Name them `QA Email Approval - <case id>` so screenshots are self-explaining.

---

## 5. How to run

### 5.1 Smoke (15 minutes, stop if any fails)
1. EMA-NAME-001 — the email names the event in bold.
2. EMA-LINK-001 — Approve opens a readable subject in Gmail web (no `%7C`).
3. EMA-APR-009 — approve → "has been recorded" reply **inside the original thread**.
4. EMA-APR-001 — approve again → "already been recorded" bounce.
5. EMA-REJ-001 — reject with no comment → bounce; no old "⚠️ Comment is required" email.
6. EMA-CON-001 — consult the outside address → "not part of your organisation" bounce; outsider gets nothing.
7. EMA-RPL-001/002 — consult Chetan → Reply button → answer appears on the event.

### 5.2 Full run order
3 Approve → 4 Reject → 5 Consult/Review → 6 Consultant reply → 7 Threads → 2 Mail apps → 1 Event name → 8 Procol afterwards → 9 Regression.
Run every case in the sheet, negatives first inside each module (that is the row order).

### 5.3 Rules for every case
- Wait **1–2 minutes** after sending an action email before judging; Howler polls the mailbox, it is not instant. Wait up to 5 minutes before calling a reply "missing".
- Check **two places** every time: (a) the approver's inbox in conversation view — did a reply/bounce come, with the exact words, in the original thread? (b) the event in Procol — was the action recorded or not? A correct bounce with a wrongly recorded action is still a bug, and so is a recorded action with no reply.
- Click the button in the **original** approval email, not in a bounce or a forwarded copy, unless the case says so.
- Compare the text word for word with the expected result; a different sentence with the same meaning is still "Pass — wording differs: …" (note it), a missing or wrong fact (wrong request id, wrong action word, wrong address) is a Fail.
- A spelling mistake, a `%7C`, an `&amp;`, a cut-off name, a dangling "for" — all bugs (P2 unless they block).
- Never treat a 500 / "Internal Server Error" seen on a shared UAT event as the feature's bug until it reproduces on a fresh event you built.
- Cases that need the dev (THR-004 delete the sent original, THR-007 server down, THR-005 out-of-office loop): do them last, in one sitting, with the dev on call. Mark **Blocked** with the reason if nobody is available — never guess the result.

### 5.4 Screenshots (every case, this is non-negotiable)
Take real screenshots, saved as `prototype/data/evidence/email-approvals/shots/<case id>-<n>.png`:
1. the approval request email open in the mailbox (event name visible);
2. the action email just before sending (subject + body);
3. the inbox in conversation view after the reply arrived (so the thread is visible);
4. the event in Procol showing the approval / rejection / consultation state.
For a Fail, also capture the browser console / network error if there is one. Mask nothing except tokens; a screenshot must show the real page, not a mock.

---

## 6. Reporting

### 6.1 Results sheet
Fill `Status` (Pass / Fail / Blocked / Not Run) in `Email_Approvals_Test_Cases.xlsx`, add `Actual Result` with what you saw in plain words and the screenshot file names. Save as `test-cases/Email_Approvals_Test_Case_Report.xlsx` with sheets: Test Cases, Bugs in plain language, Summary (counts per module and per status).

### 6.2 Bug sheet (tester's house format)
Use `test-cases/bug_sheet.py` with sheet name `email_approvals`. For every bug:
- **Bug (one line):** what is wrong, at a glance, e.g. "Rejecting without a comment is silently recorded as a rejection".
- **Description:** "What happens. Expected behavior: … Why it matters: …" — no steps inside.
- **Steps to Reproduce:** numbered, exactly as a person would click, starting from which mailbox / which event.
- **ARTEFACTS/ JAM:** the screenshot(s).
- **Priority:** P0 = approval recorded wrongly or an outsider receives company data; P1 = wrong/missing bounce, reply in a new thread, wrong recipient; P2 = wording, encoding, layout.
- **QA Comment:** environment (DLF UAT), event name/id, request id from the email, test-case id.
- DEV TYPE: BE for refusal logic / event name, FE n/a, "Howler" written in Dev Comment when the reply text or threading is wrong.
Write everything so the tester's manager can read it without knowing the code: no endpoint names, no config keys in the bug line.

### 6.3 Final summary (chat)
Module × Pass/Fail/Blocked table, the list of bugs in one line each, the cases that were blocked and why, and anything the tester must ask the dev. Say plainly what was NOT tested.

---

## 7. Prompt to paste into the testing chat

```
You are a manual QA engineer testing Procol's new email-based approvals on DLF Hospitality UAT, exactly as a careful
human tester would: click, wait, read the email, read the event, screenshot, decide, write it down in plain words.

Read first, in this order:
1. test-cases/Email_Approvals_Testing_Guide.md  (this guide: feature, environment, set-up, run order, reporting)
2. test-cases/Email_Approvals_Test_Cases.xlsx   (the 80 cases you must run, negatives first in each module)
3. test-cases/build-approval-workflows-cases.py and test-cases/Approval_Workflows_Test_Case_Report.xlsx
   (how the DLF Bid Proposal workflow, PO form and approver page behave; the known bugs there are NOT new findings)
4. test-cases/bug_sheet.py (bug sheet format — use it, do not invent a layout)

Environment: buyer app https://cpanel.ag-ri.in, API https://sec-api.ag-ri.in/api, company DLF Hospitality (43386).
The session is in procol-ui-tests/.auth/dlf.json (accessTokenHeader → ACCESS-TOKEN header). Never print, log,
paste or screenshot the token, and never store it in any report. If it has expired, stop and ask me for a fresh one.

Before testing, confirm with me (do not assume): email_approvals_enabled is On for DLF; the approval mailbox address
and that it is an Outlook mailbox connected to Howler with Mail.Send; both PRs (procol-backend #17671 and howler #43)
are deployed on UAT; the Howler "Consultation Request" subject pattern is configured; and which mailboxes / users I
am giving you for requester, step-1 approver, step-2 approver, colleague, deactivated user and outside address.
Only use accounts and mailboxes I hand you for this run.

Then:
- Do the set-up in section 4 of the guide (workflow named "QA_Platform EMA …", 10–12 events named
  "QA Email Approval - <case id>" that reach Bid Proposal approval via the PO form).
- Run the 7-case smoke in section 5.1. If any smoke case fails, stop and tell me before continuing.
- Run all 80 cases in sheet order, following the rules in section 5.3 (wait 1–2 min after every action email,
  check BOTH the inbox thread and the event in Procol, compare the reply text word for word).
- Take real screenshots for every case as described in section 5.4 and save them under
  prototype/data/evidence/email-approvals/shots/.
- Work one case at a time, in this chat, with no sub-agents.

Report:
- test-cases/Email_Approvals_Test_Case_Report.xlsx (Test Cases with Status + Actual Result + screenshot names,
  Bugs in plain language, Summary).
- A bug sheet "email_approvals" built with bug_sheet.py: one plain line per bug, description = what happens /
  expected / why it matters, numbered reproduce steps starting from the mailbox and event, screenshot embedded,
  priority P0/P1/P2 as defined in the guide, environment + event + request id + case id in QA Comment.
- A chat summary: module × Pass/Fail/Blocked, each bug in one line, what was Blocked and why, what you did NOT test,
  and the questions I must take to the dev.

Write every bug so that a manager who has never seen code understands it. No endpoint names, no config keys, no
stack traces in the bug line or description. Say "I could not tell" when you could not tell — never guess a result.
```
