# Multi-entity name in vendor emails — complete testing guide (Gulbrandsen, UAT)

Cases: `test-cases/Multi_Entity_Email_Test_Cases.xlsx` (123 cases, tabs: cases, Email checklist, Plant codes).
Builder: `test-cases/build-multi-entity-email-cases.py`.
PRD: "Multi-Entity Name in Vendor Emails via PR Field Mapping" (update 5 Nov 2026).
Backend: Procol-Tech/procol-backend#17775 (still open on GitHub, but already live on UAT, see section 2).

---

## 1. What the feature does (plain language)

Gulbrandsen buys through five legal entities, but Procol has one company called "Gulbrandsen".
Until now every vendor email said "Gulbrandsen", so a vendor could not tell which entity was asking for the quote
and who would issue the PO.

Now Procol looks at the **Plant** code on the PR that the RFQ was made from, finds the entity for that plant in a
list, and writes **that entity's name** in the vendor emails instead of "Gulbrandsen".

| Plant code | Name the vendor must see |
|---|---|
| 1101, 1105, 1106 | Gulbrandsen Technologies India Pvt Ltd. |
| 1901 | PT Gulbrandsen Technologies India Pvt Ltd. |
| 4201 | Gulbrandsen Private Limited |
| 4301 | Gulbrandsen Catalyst Pvt Ltd. |
| 4501 | Gulbrandsen Industries LLP |
| any other code, empty plant, or RFQ made without a PR | Gulbrandsen (as before) |

Rules that matter for testing:
- **Only the first line item counts.** The name comes from line item 1 of the RFQ. If line 1 has no PR (added by hand),
  the email says "Gulbrandsen" even if other lines come from a mapped PR.
- **Only vendor emails tied to an RFQ change.** The 23 emails are listed in the "Email checklist" tab with the exact
  subject, where the name sits, and what "hide company name" does to it.
- **Not changed:** buyer / approver emails, PDFs, the PO, WhatsApp, push, vendor onboarding / RFI, the vendor portal
  screens, the email's sender name.
- **"Hide company name in emails"** still wins where it used to hide the name. Places that never hid the name
  (big title at the top of some emails, reminders, "event revised", auction reminder) now show the entity even
  when hiding is on.
- **The list is entered by the dev in the backend.** There is no upload screen and no sheet checks yet
  (the PRD's sheet rules, module 8, cannot be tested by a tester alone).

---

## 2. Environment and what is already true on UAT (checked 13 Nov 2026)

| | |
|---|---|
| Buyer app | https://cpanel.ag-ri.in |
| API | https://sec-api.ag-ri.in/api |
| Company | Gulbrandsen (company id 50169) |
| Login | stored in `procol-ui-tests/.auth/gulbrandsen.json` (git-ignored). **Never print, paste, log or screenshot it.** |
| Mail inbox | https://mailhog-dev.procol.tech/ — it is **Mailpit** (not MailHog), version 1.29.7 |

Already done on UAT (no need to ask anyone):
- The plant → entity list is switched on for Gulbrandsen with all 7 codes (since 9 Nov). This covers MEN-SET-001.
- The code is live. RFX-382 sent "RFX-382 | Project Invitation from Gulbrandsen Technologies India Pvt Ltd." on 12 Nov.
- "Hide company name in emails" is **off** for Gulbrandsen.
- "Send bid rejection email to vendor" is **not switched on**, so the bid-rejected email will not go out until a dev turns it on.

PRs that exist on Gulbrandsen UAT (all from the ERP):

| Plant | Open PR lines | Use for |
|---|---|---|
| 4501 | ~12,000 | Gulbrandsen Industries LLP |
| 1101 | ~1,170 | Gulbrandsen Technologies India Pvt Ltd. (also stands in for 1105 and 1106, same entity) |
| 4201 | ~620 | Gulbrandsen Private Limited |
| 1001, 1002, 1054, 4058, 4060, LOC-0001 | a few | "not in the list", so the email must say Gulbrandsen |
| 1105, 1106, 1901, 4301 | **none** | ask the dev to push PRs from the ERP PR API |

Existing events worth knowing: RFX-378 has lines from 4201 and 4501 together. RFX-381 and RFX-382 are from 1101 PRs.
They belong to other people's testing. **Build your own events, don't act on these.**

---

## 3. Mailpit — how to read the emails

On UAT, mail to normal addresses does not reach a real mailbox. It is caught by Mailpit, and anyone can read it there.

- **Find an email:** open https://mailhog-dev.procol.tech/ and type the RFX number in the search box.
  Narrower searches: `subject:"RFX-390"`, `to:men.v1@example.com subject:"RFX-390"`.
- **Open it full size:** `https://mailhog-dev.procol.tech/view/<message ID>` (the ID is in the address bar when a
  message is open). Screenshot this page.
- **Save the original:** `https://mailhog-dev.procol.tech/api/v1/message/<message ID>/raw` → save as
  `prototype/data/evidence/multi-entity/mails/<case id>.eml`.
- **Search by API (quicker for many cases):** `GET /api/v1/search?query=subject:"RFX-390"` gives the IDs, subjects,
  recipients and times.

**Two traps:**
1. **Mailpit keeps only the latest ~500 emails.** On a busy UAT afternoon that is about **45 minutes**. Open, save and
   screenshot every email **as soon as it arrives**. Never batch "I'll check the mails later".
2. **Mail can take minutes to come.** Wait up to 10 minutes. If it still is not there, check the read-only UAT database's
   sent-mail log (`ahoy_messages`, subject + time + mailer) before calling it missing. If the log has it but Mailpit
   doesn't, it was probably pushed out of Mailpit: re-trigger and save it at once.

**Vendor addresses:** use QA test addresses only (for example `men.v1.<date>@example.com`). Never use a real
Gulbrandsen vendor or a real person's address. Don't use an address on UAT's "allowed real emails" list, because those
go to a real mailbox and not to Mailpit.

---

## 4. Things to confirm BEFORE testing (ask the tester / dev — don't assume)

1. Will the dev push PRs for plants **1105, 1106, 1901, 4301**, and the special PRs (Plant 9999, empty plant,
   " 1105 " with spaces, one PR with line 1 = 4201 and line 2 = 1105)? Until they do, use the stand-ins in section 6.
2. Who switches **"Hide company name in emails"** on and off for module 5, and **"Send bid rejection email to vendor"**
   on for the bid-rejected cases?
3. Cases that need the dev to change the list on purpose (MAP-012, MAP-015 to MAP-018, the 'Other PR field' case in
   module 8): will the dev do them today? If not, mark them Blocked.
4. Module 8 (sheet rules) has no upload in this build. Ask the dev whether any check exists. If not, record what
   happens and mark it "Observation — question for product".
5. Which QA vendors you may use (V1, V2), or permission to create two new ones by invite + vendor sign-up.

---

## 5. Set-up (do once)

1. Log in to the buyer app with the Gulbrandsen login from the auth file.
2. **Vendors:** have QA vendors V1 and V2 with test addresses (section 3). For emails that need a bid (award,
   rejection, counter offer, surrogate bid, best offer), V1 must be a registered vendor who can bid. A vendor's UAT
   login code is normally the buyer company's code.
3. **Events** — create each from the PR list: select the PR line(s) → create the event → add V1 and V2 → publish.
   Name them so they're easy to find, for example `MEN P4201 EML-012`, with one fresh event per case where the case
   ends the event (withdraw, award, lot split).
   - P1101, P4201, P4501 from the existing PRs
   - PUNMAPPED from a plant 1001 PR
   - MANUAL: an RFQ made by hand, no PR
   - one auction and one multi-lot (basket) event from a mapped PR
   - P1105 / P1106 / P1901 / P4301 only after the dev pushes those PRs
4. Keep a small table: event name → RFX number → plant → the name the vendor must see.

---

## 6. How to run

### 6.1 Smoke (about 30 minutes; stop if any fails)

| Case | What | Plant to use |
|---|---|---|
| MEN-SET-001 | List switched on | — |
| MEN-SET-003 | An invite shows up in Mailpit | any |
| MEN-MAP-001 | Invite from a 1101 PR → "Gulbrandsen Technologies India Pvt Ltd." | 1101 |
| MEN-MAP-005 | Invite from a 4201 PR → "Gulbrandsen Private Limited" | 4201 |
| MEN-MAP-007 | Invite from a 4501 PR → "Gulbrandsen Industries LLP" | 4501 |
| MEN-MAP-008 | Unmapped plant → "Gulbrandsen" | 1001 instead of 9999 |
| MEN-MAP-010 | RFQ without a PR → "Gulbrandsen" | — |

If a smoke case fails (wrong name, or "Gulbrandsen" on a mapped plant), stop, report it, and wait.

### 6.2 Full run order
Module 0 → 1 → 2 → 3 → 4 → 6 → 7 → 5 (hide is on for module 5, so do it last and switch it off after) → 8.
Within a module follow the sheet order (negatives first).

### 6.3 Stand-ins while PRs are missing
| Case written for | Use instead | Expected name then |
|---|---|---|
| 1105 or 1106 | 1101 | same: Gulbrandsen Technologies India Pvt Ltd. |
| 1901 | 4501 | Gulbrandsen Industries LLP |
| 4301 | 4201 | Gulbrandsen Private Limited |
| 9999 | 1001 | Gulbrandsen |
| two entities in one RFQ (PRF-001) | 4201 line first, then 4501 | Gulbrandsen Private Limited |

Write the stand-in in Actual Result ("Ran on plant 4501 because no 1901 PR exists on UAT").
MAP-002, MAP-003, MAP-004 and MAP-006 test the code itself, so they stay **Blocked** until the real PRs exist.

### 6.4 Rules for every case
1. Do the action in the buyer app exactly as the case says. Write down the RFX number and the time.
2. Wait, then find the email in Mailpit (section 3). Save the `.eml` and take a screenshot **straight away**.
3. Read the **subject, the inbox preview line, the big title at the top, every sentence of the body, and the sign-off**.
4. Compare the name **character by character** with the table in section 1. "Pvt Ltd." includes the full stop.
   "Gulbrandsen Technologies India Pvt Ltd" without the full stop counts as a difference: report it.
5. Decide:
   - **Pass:** every place shows the expected name.
   - **Fail:**
     - the wrong entity is shown
     - "Gulbrandsen" alone appears on a mapped event
     - two different names appear in one email
     - a name appears where "hide company name" should hide it
     - the email does not arrive
   - **Observation:** an Edge case where the behaviour is a product question. Write what you saw and the question.
   - **Blocked:** you couldn't set up what the case needs (no PR, config not switched, no dev). Say exactly what was missing.
6. Use a fresh event when the previous case changed the event's state. Never act on events you didn't create.
7. One case at a time. Never guess a result. If you could not tell, write "I could not tell" and why.

### 6.5 Screenshots (every case, non-negotiable)
Save under `prototype/data/evidence/multi-entity/shots/<case id>-<n>.png`:
1. The buyer app screen right after the action (the event with its RFX number visible).
2. The email open in Mailpit at full size (`/view/<ID>`), with the subject and the name visible. Zoom or crop so the name can be read.
3. For PR cases: the PR's line item showing the Plant value.

Never capture the login values or the login screen with them typed.

---

## 7. Reporting

### 7.1 Results
`test-cases/Multi_Entity_Email_Test_Case_Report.xlsx` holds the case sheet with these extra columns:
- Status (Pass / Fail / Blocked / Observation / Not Run)
- Actual Result in plain words
- RFX number
- Mailpit message ID
- screenshot file names

### 7.2 Bug sheet (the tester's house format)
Build it with `test-cases/bug_sheet.py` (sheet name `multi_entity_emails`). Fill each bug like this:
- **Bug (one line):** for example "Counter offer email says 'Gulbrandsen' instead of 'Gulbrandsen Private Limited' for a plant 4201 RFQ".
- **Description:** what happens, what should happen, and why it matters to the vendor.
- **Steps:** numbered, from the PR list to the email in Mailpit.
- **Screenshot:** embedded.
- **QA Comment:** the environment, RFX number, PR number, plant, Mailpit message ID and case ID.
- **Priority:**
  - **P0:** a vendor sees the **wrong entity**, or a vendor email stops going out
  - **P1:** "Gulbrandsen" instead of the entity on a mapped plant, two names in one email, or a name shown when it should be hidden
  - **P2:** spelling or full-stop differences, or a mismatch with something out of scope (PDF, portal, PO) worth telling product

### 7.3 Final summary (chat)
- Module × Pass / Fail / Blocked / Observation.
- Each bug in one line.
- What was Blocked and why.
- What was not tested.
- The questions for product. At minimum:
  1. Two entities in one RFQ: only the first line's entity is shown.
  2. A hand-added first line means "Gulbrandsen" is shown.
  3. With "hide company name" on, the entity still shows in the big title and reminders.
  4. The PO, PDFs and vendor portal still say "Gulbrandsen".
  5. There are no checks when the list is loaded.

---

## 8. Prompt to paste into the testing chat

```
You are a manual QA engineer testing Procol's new "entity name in vendor emails" feature for Gulbrandsen on UAT,
exactly as a careful human tester would: create the RFQ from the PR, do the action, open the email, read every
line, screenshot, decide, write it down in plain words.

Read first, in this order:
1. test-cases/Multi_Entity_Email_Testing_Guide.md   (feature, what is already true on UAT, Mailpit, set-up, run rules, reporting)
2. test-cases/Multi_Entity_Email_Test_Cases.xlsx     (123 cases; tab "Email checklist" = every email, its subject and
   where the name must appear; tab "Plant codes" = the name each plant must show)
3. test-cases/bug_sheet.py                           (bug sheet format — use it, do not invent a layout)

Environment: buyer app https://cpanel.ag-ri.in, API https://sec-api.ag-ri.in/api, company Gulbrandsen (50169).
The login is in procol-ui-tests/.auth/gulbrandsen.json. Never print, log, paste or screenshot it, and never put it
in any report or file. Vendor emails are caught by Mailpit at https://mailhog-dev.procol.tech/ (search, /view/<ID>,
/api/v1/message/<ID>/raw). Mailpit keeps only ~45 minutes of mail: save and screenshot each email the moment it arrives.
The read-only UAT database (DATABASE_URL in procol-ui-tests/.env, read-only session) may be used to check PR plant
values and the sent-mail log; never write to it.

Before testing, confirm with me (do not assume): which QA vendors to use (or permission to create two by invite +
sign-up, test addresses only, never real vendors or real people); whether the dev will push PRs for plants 1105,
1106, 1901, 4301 and the special PRs (9999, empty plant, " 1105 ", mixed 4201+1105); who switches "Hide company name
in emails" and "Send bid rejection email to vendor" on and off; and which dev-only cases (changing or breaking the
list, module 8) the dev will help with today.

Then:
- Do the set-up in section 5 of the guide. Build your OWN events from the PR list (names starting "MEN "); never act on
  events you did not create (RFX-378, 381, 382 belong to others).
- Run the smoke in section 6.1. If any smoke case fails, stop and tell me before continuing.
- Run all cases in the order of section 6.2, using the stand-ins in 6.3 where a plant has no PR (say so in Actual
  Result). Follow every rule in 6.4: compare the name character by character in the subject, preview line, top title,
  body and sign-off.
- Take the screenshots in section 6.5 for every case and save the .eml of every email checked.
- Work one case at a time, in this chat, with no sub-agents.

Report:
- test-cases/Multi_Entity_Email_Test_Case_Report.xlsx (cases with Status, Actual Result, RFX no., Mailpit ID, screenshots).
- A bug sheet "multi_entity_emails" built with bug_sheet.py: one plain line per bug; description = what happens /
  what should happen / why it matters to the vendor; numbered steps from the PR to the email in Mailpit; screenshot
  embedded; priority P0/P1/P2 as defined in the guide; RFX, PR, plant, Mailpit ID and case id in QA Comment.
- A chat summary: module × Pass/Fail/Blocked/Observation, each bug in one line, what was Blocked and why, what you
  did NOT test, and the questions I must take to product.

Write every bug so that a manager who has never seen code understands it. No config keys, no class names, no stack
traces in the bug line or description. Say "I could not tell" when you could not tell — never guess a result.
```
