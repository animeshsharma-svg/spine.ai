# In-Principle Approval & Price Recovery (RFQ 2) — complete testing guide (Amity University, UAT)

Cases: `test-cases/In_Principle_Approval_Test_Cases.xlsx` (194 cases, 18 modules, negatives first). **The expected results follow the build** (updated 18 Nov 2026).
Builder: `test-cases/build-ipa-cases.py`.
Sources:
- PRD "In-Principle Approval & Price Recovery (RFQ 2)" and the Screens PDF (8 screens)
- TRD + frontend contract (10 Nov)
- backend Procol-Tech/procol-backend#17764 and buyer app Procol-Tech/procol-client-dashboard#6319

Both PRs are still open on GitHub, but **both are live on UAT** (section 2).

---

## 1. What the feature does (plain language)

1. An RFQ (RFQ 1) ends with vendor quotes. Before awarding, the buyer clicks **In-Principle Approval** on **Master QCS**
   and sends the result to senior people for approval.
2. While the approval is **pending**, RFQ 1 is **frozen** and **awarding is blocked**.
3. If every approver **approves**, Procol creates a new stage, **RFQ 2**, in **Draft**. It copies the line items and
   invites only the vendors who quoted in RFQ 1. RFQ 1 becomes **Locked**.
4. The buyer publishes RFQ 2. At that moment each vendor's RFQ 1 quote is copied in as their starting quote in RFQ 2.
   The purchase team negotiates the price down, and Master QCS shows how much was **recovered**.
5. The award is then made from RFQ 2 through the normal award (Bid Proposal) flow.
6. If an approver **rejects** (a reason is compulsory), the approval ends. **In this build the project stays active,
   RFQ 1 unfreezes, and the buyer can raise a new In-Principle Approval.** On screen, Start Awarding stays greyed
   ("Awarding is available once in-principle approval is approved") until an approval is approved (see section 3).

The **approval value** is the grand total, including tax, of the overall L1 vendor in RFQ 1. A loading factor is added
when it is switched on. If two vendors tie, the one who quoted first counts.
For a sell event, the highest quote counts.

**Which workflow is used ("how it is triggered"):**
- The company sets up workflows of the new type **"In-Principle Approval"** under approval workflows / Trigger Settings.
- Each workflow has a **condition**. Procol checks the conditions against the project and offers only the workflows that match.
- If the user's **team** has matching workflows, only those are offered; otherwise the **company** workflows are offered.
- Conditions can use:
  - the value (approval value)
  - number of bidders
  - delivery location
  - product category / subcategory
  - purchase group and item type, when the project came from PRs
- A condition on a field the project doesn't have never matches.
- If nothing matches, the buyer sees **"No approval workflow is configured for In-Principle Approval"** and cannot submit.

---

## 2. Environment and what is already true on UAT (checked 18 Nov 2026)

| | |
|---|---|
| Buyer app | https://cpanel.ag-ri.in |
| Vendor portal | https://quotes.ag-ri.in |
| API | https://sec-api.ag-ri.in/api |
| Company | **Amity University** (company id 55379). Not "Amity" (46705), which is a different company without the feature |
| Login | ask the tester; store it in `procol-ui-tests/.auth/amity.json` (git-ignored). **Never print, paste, log or screenshot it.** |
| Emails | Mailpit: https://mailhog-dev.procol.tech/ (search by RFX number; `/view/<ID>`; `/api/v1/message/<ID>/raw`). Keeps only ~45 minutes of mail on a busy day, so save each email at once |
| Read-only database | `DATABASE_URL` in `procol-ui-tests/.env`. Use a read-only session only, to check statuses; never write |

Already true on UAT:
- The **feature switch is ON** for Amity University (since 13 Nov). IPA-SET-001 can be checked, not done.
- The approval type **"In-Principle Approval"** exists.
- The new screens are in the UAT buyer app: the Master QCS button, the approval page, and the "Created from In-Principle Approval" and "RFQ 2 · Bidding open" tags.
- Two In-Principle workflows already exist. They belong to the dev, so **don't edit or delete them**:
  - **"In principle approval"**: value from ₹10 to under ₹10 lakh AND delivery location Noida. One step: Procol Support (the main login), 2 days.
  - **"InPrinciple Approval testing"**: value from ₹10 to under ₹10 lakh. One step: Procol Support, 2 days.
  - **What this means for you:** almost any small project will also match these two. Your submit pop-up may list them
    next to yours, so always pick **your** workflow. For "no workflow applies" (IPA-WF-004), use a project value of
    **₹10 lakh or more** (or under ₹10) that your own workflow also doesn't match.
- Ten projects (RFX-939 to RFX-966) were already approved by the dev and have an RFQ 2. **They are not yours, so never act on them.**
- Amity's user list has many old placeholder users (User1…User20@gmail.com, a real-looking @amity.edu address).
  **Don't use them as approvers.** Approvers must be QA users with test addresses (section 5).

---

## 3. How the sheet relates to the PRD

The sheet's **Expected Result follows the build**, not the PRD. Where the PRD or the screens said something else,
the expected result ends with **"PRD difference: …"**. That sentence is **not a reason to fail**. Copy it into Remarks
so product sees it. Mark Fail only when what you see does not match the expected result.

Main places where the build differs from the PRD:

| Topic | PRD / screens | Build (what the sheet expects) | Cases |
|---|---|---|---|
| Rejection | Whole project rejected | Project stays active, RFQ 1 unfreezes, a new approval can be raised. Red banner "In-principle approval rejected by <name> on <date>. Reason: …" | IPA-REJ-001 … 012 |
| Award after rejection, recall or expiry | Not allowed (PRD) / allowed (TRD) | The screen keeps Start Awarding greyed with "Awarding is available once in-principle approval is approved" | IPA-REJ-002, IPA-PND-018, IPA-APR-007. **Product question in each case** |
| Event Assignee | New Event Creator / Event Assignee fields | Not built. RFQ 2 is handed over with the existing **Change owner** | Module 10 (IPA-ASG-001 … 009), rewritten |
| RFQ 2 name and draft page | "RFQ 2 – Price recovery", special draft page with base values | Stage "RFQ 2" with a "Price Recovery" tag, normal draft screens. Copied quotes appear only after publish | IPA-CRT-006, IPA-R2-006 |
| Approval page | L1 Summary, three downloads, "Next Stage on Approval" | Overview (Tot. line items, Tot. Value for Approval, L1 Vendor, RFX No, Recommended By, Approval Type, Initiated At), a line-item table with each vendor's RFQ 1 quote, and participants | IPA-APR-011, 012, 014 |
| Master QCS | One-decimal % and separate RFQ 2 Price / Rank columns | Cards plus columns "RFQ 1 Price (locked)", "RFQ 1 Total (incl. tax)", "RFQ 2 Total (incl. tax)", "Price recovered". % has two decimals (₹345 = **6.25%**) | Module 13 |
| Pop-up | "…this sourcing project will be rejected…", "Shared with approvers" | "…this in-principle approval will be rejected…". Labels "Tot. line items", "Tot. Value for Approval". No "Shared with approvers" | IPA-SUB-007, 008 |
| Locked tag | Only after RFQ 2 | Orange "Locked" tag on RFQ 1 already while pending; after RFQ 2 exists it links to RFQ 2 | Modules 5 and 9 |

### 3.1 Cases added from the build (already in the sheet)

| Case | What it checks |
|---|---|
| IPA-WF-012 … 015 | Workflow conditions: value range, delivery location, team before company, value includes tax |
| IPA-ELG-015 | Lot-based project: "Not available for lot-based projects yet" |
| IPA-ELG-016 | Feature off hides the button completely |
| IPA-SUB-018 | Too many attachments refused |
| IPA-SUB-019 | Sell event uses the highest total |
| IPA-PND-022 | Withdrawing the whole project while pending withdraws the approval too |
| IPA-REJ-011, 012 | RFQ 1 unfrozen after a rejection; a second attempt can be approved |
| IPA-CRT-011 | Project withdrawn before RFQ 2 is created |
| IPA-LCK-010 | Withdrawing RFQ 2 unlocks RFQ 1 |
| IPA-R2-013 | A vendor whose RFQ 1 quote is no longer valid gets nothing copied |

Existing cases also cover the tie (IPA-SUB-010), loading factor (IPA-SUB-011) and a vendor added to RFQ 2 (IPA-R2-009).

---

## 4. Things to confirm BEFORE testing (ask the tester — don't assume)

1. **Login:** the Amity University buyer login for this run. Save it in `procol-ui-tests/.auth/amity.json`.
2. **People:** permission to add QA users to Amity University with test addresses. You need:
   - an initiator
   - Approver A (step 1) and Approver B (step 2)
   - Approver C (for the parallel step)
   - a user without award rights
   - a deactivated user
   - Or the tester names existing users to use instead.
3. **Vendors:** permission to create three QA vendors by invite + vendor sign-up, with test addresses only
   (for example `qa_ipa_<date>_v1@example.com`). Never real vendors or real people.
4. **Dev help:** cases that need the dev:
   - making RFQ 2 creation fail and then Retry (IPA-CRT-001 / 002)
   - making the bid copy fail at publish
   - shortening the 2-day expiry (expiry cases)
   - If the dev can't help today, mark them **Blocked**.
5. **Emails:** may approvers act from email (approve or reject by mail)? If yes, which inbox. Otherwise email approval cases are **Blocked**.
6. Whether to switch on **loading factor** or **peer review** on Amity University for IPA-SUB-011 and IPA-SUB-015. Switch back afterwards.

---

## 5. Set-up (do once)

1. **Log in** to https://cpanel.ag-ri.in with the Amity University login from the auth file.
2. **Users:** create (or take from the tester) the people in section 4.2. Write down each name, user ID and role.
   On UAT the login code follows the company's UAT code rule. Never print it.
3. **Vendors:**
   - Invite V1, V2 and V3 from an RFQ and complete their sign-up on https://quotes.ag-ri.in.
   - V1 plays "asd" from the screens (quotes ₹500/gm, discount ₹20, 10 gms, so the total including tax is ₹5,520, L1).
   - V2 plays "demo123" (₹600/gm, discount ₹10, total ₹6,785, L2).
   - V3 is invited but never quotes.
4. **Workflow (IPA-SET-002, module 2):** in approval workflows / Trigger Settings, create
   **"QA_Platform IPA 2-step"** with:
   - type In-Principle Approval
   - condition: value from ₹1 to under ₹10 lakh (or whatever the case says)
   - Step 1 = Approver A, Step 2 = Approver B, 1 day each
   - Then create the extra workflows that module 2 asks for: parallel, deactivated user, team workflow.
   - Name all of them "QA_Platform IPA …" so they are easy to clean up.
5. **Projects (IPA-SET-004):**
   - Build fresh projects named "QA IPA <case id>".
   - Default shape: 1 line item, DAB Hi-Media Make, 10 gms, delivery AES NOIDA HO.
   - Optional Technical stage first, then RFQ.
   - V1, V2 and V3 invited. **Short bid end time** (15–20 minutes), so bidding ends during the session.
   - Have V1 and V2 quote on the vendor portal, then wait for the end time.
   - **One fresh project per case that changes state** (approve, reject, recall, withdraw, RFQ 2). Projects A–H in the sheet describe the start state each case needs.
6. Keep a table: project name → RFX number → state → case IDs used on it.

---

## 6. How to run

### 6.1 Smoke (about 60–90 minutes; stop if any fails)
| Case | What |
|---|---|
| IPA-SET-001 | Feature on for Amity University (check only) |
| IPA-ELG-001 | Button greyed with "Available after RFQ bidding ends" while bidding runs |
| IPA-ELG-013 | Button clickable once bidding ended |
| IPA-SUB-007, IPA-SUB-008 | Pop-up shows the warning, the line count and the value ₹5,520 |
| IPA-SUB-017 | Raise the approval with your workflow |
| IPA-PND-011 | Start Awarding blocked while pending: "Awarding is blocked while in-principle approval is pending" |
| IPA-APR-011, IPA-APR-017 | Approval page overview; Approver A approves and it moves to Approver B, who approves |
| IPA-CRT-005 / 006 / 007 | "In-principle approval is approved. Preparing RFQ 2…", then RFQ 2 in Draft, RFQ 1 Locked, button "In-Principle Approval · Done" |
| IPA-REJ-006 | Rejection with a reason: red banner with name and reason, project stays active |

### 6.2 Full run order
Module 0 → 2 (workflows) → 3 (eligibility) → 4 (submit) → 5 (pending) → 6 (approver) → 7 (rejection) →
8 (RFQ 2 creation) → 9 (lock) → 10 (hand-over) → 11 (RFQ 2 publish) → 12 (vendor side) → 13 (Master QCS) →
14 (notifications) → 15 (reports) → 16 (permissions) → 17 (regression) → 1 (feature switch).
Run **module 1 (switch off) last**, and only if the tester allows turning the feature off. Switch it back **on** right after.

### 6.3 Rules for every case
1. Start from a project in exactly the state the case names. Never reuse a project another case has changed.
2. Do the steps as a person would, in the buyer app or the vendor portal. Use the API or database only to **check**
   a status, never to make the app do something.
3. **Two people at once:** act as the initiator in one browser session and as the approver in another (a second tab
   or profile, logged in as that user). Don't mix sessions.
4. After every action, refresh and read:
   - the Master QCS button and banner
   - the Published Stages table (status, tags)
   - the approval page (status, steps, remarks)
   - for vendor cases, the vendor portal as V1
5. **Compare messages word for word.** The exact texts are in section 7. A different word is not a Fail by itself.
   Write it in Remarks unless the meaning changes.
6. Emails (approver invite, approval status, vendor invite for RFQ 2): find them in Mailpit by RFX number and save
   the `.eml` and a screenshot **at once**. Mail can be up to 30 minutes late on UAT. Check the sent-mail log before
   calling an email missing.
7. Decide:
   - **Pass:** what the case expects. A "PRD difference" sentence goes to Remarks and does not make it a Fail
   - **Fail:** anything else
   - **Blocked:** you couldn't set it up; say what was missing
   - **Observation:** a product question
   - **Couldn't Tell:** say why
   - Never guess.
8. One case at a time, in this chat, no sub-agents.

### 6.4 Screenshots (every case)
Save under `prototype/data/evidence/ipa/shots/<case id>-<n>.png`:
1. The screen **before** the action.
2. The screen **after** the action with the result visible: button state, tooltip (hover first), banner, error message, Published Stages row, Master QCS cards.
3. For approver cases: the approval page as the approver.
4. For vendor cases: the vendor portal as V1.

Never capture a login screen with values typed, or anything showing the login code.

---

## 7. Exact texts to look for

**Button and tooltips (Master QCS):**
- "Available after RFQ bidding ends"
- "Event already awarded or award in progress"
- "Bid is expired — no vendor quoted in RFQ"
- "Available only when the latest stage is an RFQ"
- "Project is not active"
- "You don't have permission to raise this approval"
- "Not available for lot-based projects yet"
- "In-Principle Approval · Done"
- "In-Principle Approval · Rejected"

**Submit pop-up:**
- Title "Submit for In-Principle Approval"
- Warning "If any approver rejects, this in-principle approval will be rejected. Awarding is blocked until approval is complete."
- Fields "Tot. line items" and "Tot. Value for Approval"
- When nothing matches: "No approval workflow is configured for In-Principle Approval"
- After submit: "Submitted for in-principle approval"

**While pending / after:**
- "Awarding is blocked while in-principle approval is pending"
- "This RFQ is locked because of in-principle approval"
- "Rejection reason is required for in-principle approval"
- Recall: "Withdraw In-Principle Approval", then "In-principle approval withdrawn successfully"
- "In-principle approval is approved. Preparing RFQ 2…"
- "Retrying RFQ 2 creation"
- "Price recovery stage can only be retried after a failure"
- "Could not copy RFQ 1 bids to RFQ 2"

**Tags and cards:**
- "Locked" (RFQ 1), "Price Recovery" (RFQ 2)
- "Created from In-Principle Approval", "RFQ 2 · Bidding open", "View RFQ 2"
- Master QCS cards "Best RFQ 2 value" and "Price recovered so far"

**Worked numbers (from the screens):**
- RFQ 1 L1 is ₹5,520.
- V1 revises in RFQ 2 to ₹470/gm with discount ₹20 (net ₹450): 450 × 10 × 1.15 = **₹5,175**, recovered **₹345 (6.25%)**.
- A further revision to ₹460/gm with discount ₹20 gives ₹5,060, recovered ₹460 (8.33%).
- If V1 quotes higher, ₹550/gm with discount ₹20, the total is ₹6,095 and the recovery shows **negative**: −₹575 (−10.42%).

---

## 8. Reporting

### 8.1 Test case report (one plain sheet that looks hand-made)
Write `test-cases/In-Principle Approval - Test Case Report.xlsx`, laid out like the tester's own sheets.
- **One sheet only.** Arial 10, bold header on blue 4285F4, thin grey borders, wrap text, freeze the top row, filter on.
- **Columns:** Test ID | Module | Scenario | Test Case | Preconditions | Test Steps | Test Data | Expected Result | Priority | Actual Result | Status | RFX No. | Remarks.
- **Status** is a dropdown (Pass, Fail, Blocked, Not Run, Couldn't Tell, Observation) with colours.
- **Actual Result** is one or two short sentences, written the way a tester writes. No dashes as separators, no code or table names.
- **Remarks** hold product questions and the "PRD difference" notes from the expected results.
- No summary tab, no evidence tab.

### 8.2 Bug sheet (the tester's house format)
Build it with `test-cases/bug_sheet.py` (sheet name `in_principle_approval`).
- **Bug column:** one plain line per bug.
- **Description:** "What happens. Expected behavior: …. Why it matters: …".
- **Steps:** numbered, in their own column, starting from the project and the user.
- **Screenshot:** embedded.
- **QA Comment:** environment, RFX number, approval link and case ID.
- **Priority:**
  - **P0:** awarding possible while pending, RFQ 1 changeable while pending or locked, RFQ 2 created after a rejection, a vendor sees approval or price data they shouldn't, wrong vendors invited to RFQ 2, or quotes copied wrong
  - **P1:** wrong approval value or L1, wrong workflow offered, recall or reject rules broken, RFQ 2 not created, Retry broken, wrong Master QCS recovery numbers
  - **P2:** text or label differences that change the meaning, missing notification, report or activity log gaps

### 8.3 Final summary (chat)
- Module × Pass / Fail / Blocked / Observation.
- Each bug in one line.
- What was Blocked and why.
- What was not tested.
- The product questions. At least:
  1. Rejection behaviour, PRD vs build, and whether awarding from RFQ 1 should be possible after a rejection, recall or expiry.
  2. Event Assignee not built (Change owner used instead).
  3. RFQ 2 name.
  4. Lot projects not supported.
  5. Whether RFQ 2 may go above the RFQ 1 price.
  6. Whether Closing Remarks are compulsory.

### 8.4 Clean-up
- Withdraw the QA projects you created that are still live.
- Deactivate the "QA_Platform IPA …" workflows.
- Switch back any company setting you changed (loading factor, peer review, feature switch).
- Never touch the dev's workflows or projects.

---

## 9. Prompt to paste into the testing chat

The full, self-contained prompt for a new chat that knows nothing about this feature is in
`test-cases/In_Principle_Approval_Testing_Prompt.md`. Paste the whole file.
