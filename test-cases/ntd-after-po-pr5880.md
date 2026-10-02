# NTD after PO — test cases for PR #5880

**PR:** [Feat: NTD after PO](https://github.com/Procol-Tech/procol-client-dashboard/pull/5880) (`feat/ntd-after-po` → `main`)
**Files changed:** `customPoWrapper.jsx`, `projectProposal.jsx`, `customForm.jsx`, `redux/project/selectors.js`

## What the PR changes

When a project has **NTD required on proposal** turned on, the order of the two forms is reversed.

| | Before this PR | After this PR |
|---|---|---|
| Order | Proposal page (NTD) → Submit → PO form → Submit → approval | Awarding → **PO form** → Submit Proposal → **NTD (entity) form** → Submit Proposal → approval (final submit) |
| PO form "Submit Proposal" | Always opened the approval modal | NTD on: goes to the proposal page (NTD form). NTD off: opens the approval modal, same as before |
| NTD form "Submit Proposal" | With `skip_custom_po` off, it created the PO and redirected to the PO form | Always validates the NTD form and then opens the approval modal. It no longer sends you back to the PO form |

Where the flags come from, which matters for the setup of every case below:

- On the **PO form**, NTD on/off is read from the **custom PO schema**: `config.ntd_required_on_proposal`.
- On the **proposal (NTD) page**, it is read from the **project details**: `config.ntd_required_on_proposal`. `skip_custom_po` also comes from here.
- The PO form builds the NTD link from the proposal's `item_uuid` (the project) and the proposal id: `/…/project/<projectUuid>/proposal/<proposalId>`.

> "Entity form" in this document means the NTD form: the **Document** panel on the proposal page. It has the **Proposal Template** dropdown and the template's sections and fields.

## Things I'd like dev to confirm before we sign off

These come from reading the diff. I haven't run them yet, and each one has a test case below.

1. **Lot number is dropped on the handoff.** The PO → NTD redirect URL has no `?lotNo=`. On a lot-based event, the proposal page gets an empty `lotNo`, and it passes that on to the approval sidebar and the report download. → NTD-PO-023
2. **The PO form isn't validated before the handoff.** "Submit Proposal" on the PO form redirects straight away, so a PO with empty mandatory fields can still reach the NTD form. → NTD-PO-019
3. **An empty required number field passes NTD validation.** In grouped-table sections, the check does `Number(value)`. `Number("")` is `0`, so a cleared number or quantity cell counts as filled. → NTD-PO-036
4. **The approval modal closes even when submission fails.** Remarks and attachments are lost, and the user has to open it again. → NTD-PO-058
5. **"Cancel" and the "X" behave differently.** The X resets the modal back to the flow list. The Cancel button only hides it, so it reopens on the summary step. → NTD-PO-056
6. **The flag comes from two places.** If the PO schema config and the project config disagree, the two pages take different paths. → NTD-PO-064

## Test data and setup

Set these up once. Each case says which one it needs.

| Name | Setup |
|---|---|
| **P-NTD** | eRFX project, awarding done for at least 2 vendors. `ntd_required_on_proposal = true`, `skip_custom_po = false`. At least one NTD proposal template saved, with a mix of required and optional fields: text, number, price/amount, dropdown, date, attachment, one grouped-table section and, if the tenant has it, a BOQ section. |
| **P-NTD-LOT** | Same as P-NTD, but lot-based awarding (Lot 1, Lot 2). |
| **P-NO-NTD** | Same as P-NTD, but `ntd_required_on_proposal = false`. |
| **P-NTD-SKIP** | `ntd_required_on_proposal = true`, `skip_custom_po = true`. |
| **Approval flows** | Three variants on the tenant: none, exactly one, and more than one. At least one flow should have a step with `approver_select` on, so the user has to pick the approver. |
| **User** | Buyer who owns the proposal and has awarding rights. A second buyer without edit rights on the project, for the negative cases. |

---

## A. Getting to the PO form

#### NTD-PO-001 — "Create PO" on the awarding screen opens the PO form
- **Precondition:** P-NTD, awarding done, no contract template on the tenant.
- **Steps:**
  1. Open the project and go to the awarding (QCS) screen.
  2. Click **Create PO**.
- **Expected:** The toast "Redirecting you to PO form..." shows, then the PO form opens for this proposal. Each awarded vendor has its own column. The **Submit Proposal** button is at the top right.
- **Priority:** P0

#### NTD-PO-002 — "Proceed ▸ Create PO" works the same when contracts are enabled
- **Precondition:** P-NTD, with a contract template available.
- **Steps:**
  1. On the awarding screen, click **Proceed**.
  2. Pick **Create PO** from the menu.
- **Expected:** The same PO form opens as in NTD-PO-001. The menu shows **Create PO** and **Create Contract**, not **Create Proposal**.
- **Priority:** P1

#### NTD-PO-003 — "Create PO" can't be fired twice
- **Precondition:** P-NTD.
- **Steps:** Double-click **Create PO** quickly.
- **Expected:** The button shows a loader after the first click. Only one PO is created and one redirect happens. No duplicate-PO error.
- **Priority:** P2

#### NTD-PO-004 — The Proposed PO Form tab appears on the proposal page
- **Precondition:** P-NTD, PO created.
- **Steps:** Open the proposal page and look at the stage tabs.
- **Expected:** A **Proposed PO Form** tab is listed and opens the same PO form. In P-NTD-SKIP (`skip_custom_po = true`) this tab isn't shown.
- **Priority:** P2

---

## B. The PO form — fields and validation

These cases check that the PO form still behaves as before. The PR only changed what the Submit button does, so any breakage here is a regression.

#### NTD-PO-005 — Every PO field saves on its own and survives a reload
- **Precondition:** PO form open (P-NTD).
- **Steps:**
  1. For one vendor, fill one field of each type: text, number, date, dropdown.
  2. Reload the page.
- **Expected:** Each field saves as soon as you leave it (a save call fires per field). After the reload, every value is still there, in the right vendor's column.
- **Priority:** P0

#### NTD-PO-006 — Required PO fields are marked
- **Steps:** Look at the PO form for one vendor.
- **Expected:** Mandatory fields are visibly marked as required. Read-only or system fields, such as vendor name and totals, can't be edited.
- **Priority:** P1

#### NTD-PO-007 — Text field limits
- **Steps:** In a PO text field, try:
  - an empty value
  - only spaces
  - a 255-character string
  - a 1,000-character string
  - special characters and HTML: `<b>Test</b> & "quotes" ‘smart’ ₹ 😀`
- **Expected:** Spaces alone don't count as filled for a required field. Long text is either accepted or cut at the configured limit with a message; it never fails silently. HTML is shown as plain text, never rendered. Unicode and ₹ are saved and shown correctly.
- **Priority:** P2

#### NTD-PO-008 — Number and amount fields
- **Steps:** In a PO number or amount field, try `0`, `-5`, `1.555`, `abc`, `1e5`, a 15-digit number, and pasting `1,00,000`.
- **Expected:**
  - Letters can't be typed in.
  - Negative values follow the field config (rejected if the field disallows them).
  - Decimals are rounded or limited to the configured precision.
  - Large values don't turn into scientific notation.
  - The pasted Indian-format number is either parsed correctly or rejected with a clear message.
- **Priority:** P1

#### NTD-PO-009 — Date fields
- **Steps:** Open a PO date picker. Pick a past date, today, and a future date. Type an invalid date by hand. Clear the field.
- **Expected:** Any min/max rule is enforced, for example "delivery date can't be in the past". An invalid date typed by hand isn't saved. Clearing a required date leaves it empty and marked required.
- **Priority:** P1

#### NTD-PO-010 — Dropdown fields
- **Steps:** Open a PO dropdown. Search within it, pick a value, change it, then clear it.
- **Expected:** Search filters the options. Each change saves. Clearing a required dropdown leaves it marked required.
- **Priority:** P2

#### NTD-PO-011 — Quick Fill copies values into the vendor column
- **Steps:** Open **Quick Fill** for one vendor. Fill in values and apply.
- **Expected:** The values land in that vendor's column only and are saved. Other vendors' columns aren't touched.
- **Priority:** P2

#### NTD-PO-012 — PO prefill from the last PO (if the tenant has it)
- **Precondition:** PO prefill on for the tenant. The vendor already has an older PO.
- **Steps:** Open the PO form and scroll so the vendor's column comes into view.
- **Expected:** Fields are prefilled from the vendor's last PO. The prefill is saved once and survives a reload. Prefilled values can still be edited.
- **Priority:** P2

#### NTD-PO-013 — The LOA toggle and preview still work
- **Precondition:** An LOA template is available on the tenant.
- **Steps:**
  1. Switch on **Send LOA** for one vendor.
  2. Click preview.
  3. Close the preview.
- **Expected:** The preview modal shows the right vendor name and RFx number, and loads the LOA. The toggle state stays until submit. Retry works if the preview fails.
- **Priority:** P2

#### NTD-PO-014 — No Submit button in read mode
- **Precondition:** A proposal that has already been submitted.
- **Steps:** Open its PO form.
- **Expected:** The form is read-only and **Submit Proposal** isn't shown.
- **Priority:** P1

---

## C. "Submit Proposal" on the PO form — the core change

#### NTD-PO-015 — With NTD on, Submit Proposal takes you to the NTD form
- **Precondition:** P-NTD, PO form filled in completely.
- **Steps:** Click **Submit Proposal** at the top of the PO form.
- **Expected:**
  - The app goes to the proposal page for this project and this proposal.
  - The **Document** (NTD) panel is open and editable.
  - The approval modal does **not** open on the PO form.
  - No proposal is submitted yet. The status is still draft.
- **Priority:** P0

#### NTD-PO-016 — The NTD link points to the right project and proposal
- **Steps:** Repeat NTD-PO-015 and check the URL and the page header.
- **Expected:** The URL has this project's uuid and this proposal's id, not another proposal's or version's. The header shows the right project title.
- **Priority:** P0

#### NTD-PO-017 — With NTD off, the old approval modal still opens
- **Precondition:** P-NO-NTD.
- **Steps:** On the PO form, click **Submit Proposal**.
- **Expected:** The **Submit Proposal** approval modal opens on the PO form, as it did before the PR. The app doesn't navigate to the proposal page.
- **Priority:** P0

#### NTD-PO-018 — A clear error if the project reference is missing
- **Precondition:** P-NTD. Simulate a missing `item_uuid`, for example by blocking the proposal-details call in DevTools or opening the PO form in a state where the proposal details didn't load.
- **Steps:** Click **Submit Proposal**.
- **Expected:** The error toast "Could not open the NTD form. Please refresh and retry." shows. The page stays on the PO form, with no blank page and no half-open modal. After a refresh, Submit works.
- **Priority:** P1

#### NTD-PO-019 — What happens to a PO with empty mandatory fields *(please confirm with product)*
- **Precondition:** P-NTD. Leave one or more mandatory PO fields empty.
- **Steps:** Click **Submit Proposal** on the PO form.
- **Expected (to confirm):** Either the PO form blocks the handoff and highlights the empty fields, or the final submit is blocked by the backend with a message that names the PO form. It must **not** be possible to submit the proposal with an incomplete PO.
- **Note:** The PR redirects straight away without checking PO fields, so today this probably goes through to the NTD form. Log it as a bug if the final submit also succeeds.
- **Priority:** P0

#### NTD-PO-020 — Clicking Submit Proposal twice
- **Steps:** Double-click **Submit Proposal** on the PO form.
- **Expected:** One navigation to the NTD form. Browser Back takes you back to the PO form once, not to a second copy of the NTD page.
- **Priority:** P3

#### NTD-PO-021 — Browser Back from the NTD form
- **Steps:**
  1. Go from the PO form to the NTD form.
  2. Press browser Back.
- **Expected:** The PO form opens again with every value intact and still editable. Clicking **Submit Proposal** again brings you back to the NTD form, and any NTD values you already entered are still there.
- **Priority:** P1

#### NTD-PO-022 — Unsaved PO edit at the moment of Submit
- **Steps:** Type into a PO field and, without clicking away, click **Submit Proposal** straight away.
- **Expected:** The last edit is still saved: when you go back to the PO form, the value is there. If it isn't, log it as a bug. The navigation shouldn't drop the pending save.
- **Priority:** P2

#### NTD-PO-023 — The lot number is kept on the handoff (lot-based events)
- **Precondition:** P-NTD-LOT. Open the PO form for **Lot 2**.
- **Steps:**
  1. Click **Submit Proposal**.
  2. Check the URL, the page title ("- Lot 2"), the approval sidebar, and the report download on the NTD page.
- **Expected:** Everything shows **Lot 2**. The approval sidebar lists Lot 2's approvals, not all lots or none. A report downloads for Lot 2.
- **Note:** The redirect URL has no `?lotNo=`. The title will probably be right, because it comes from the proposal data, but the sidebar and reports read `lotNo` from the URL. Check these carefully.
- **Priority:** P0

#### NTD-PO-024 — The reorder flow with NTD on *(please confirm with product)*
- **Precondition:** A reorder with `?source=reorder` on the PO form URL, on a project where NTD is on.
- **Steps:** Click **Submit Proposal**.
- **Expected (to confirm):** The code sends the user to the NTD form before it checks for the reorder flow, so the reorder approval modal no longer shows. Product should confirm this is intended. If it isn't, the reorder modal should open as before.
- **Priority:** P1

#### NTD-PO-025 — Reorder without NTD is unchanged
- **Precondition:** Reorder on a project with NTD off.
- **Steps:** Click **Submit Proposal**.
- **Expected:** The **Select Approval Flow** reorder modal opens. Submit without choosing a flow shows "Please select an approval flow". Picking a flow and submitting takes you to Reorder Approvals.
- **Priority:** P1

---

## D. The NTD (entity) form

#### NTD-PO-026 — The NTD form loads in draft with a default template
- **Precondition:** Arrived from the PO form (NTD-PO-015).
- **Steps:** Look at the **Document** panel.
- **Expected:**
  - The **Proposal Template** dropdown is shown. It holds the first saved template, or the one already chosen for this proposal.
  - The template's sections and fields show and can be edited.
  - The **Submit Proposal** button is shown at the top right.
- **Priority:** P0

#### NTD-PO-027 — Switching the template
- **Steps:** Change **Proposal Template** to another saved template.
- **Expected:** The sections switch to the new template's fields. Values typed into the old template aren't carried into the wrong fields.
- **Priority:** P1

#### NTD-PO-028 — Each section saves on its own
- **Steps:** Fill a field in section 1, then a field in section 2. Reload.
- **Expected:** A save fires for the section you changed only. After the reload, both values are still there.
- **Priority:** P0

#### NTD-PO-029 — Submitting an empty NTD form is blocked
- **Steps:** Leave every required field empty and click **Submit Proposal**.
- **Expected:**
  - The toast "Please fill all the required fields" shows.
  - Each section with a missing field shows its error ("Please fill all required fields").
  - The approval modal does **not** open.
- **Priority:** P0

#### NTD-PO-030 — Required text field
- **Steps:** Fill every required field except one text field, then submit. Next, fill it with spaces only and submit. Finally, fill it with real text and submit.
- **Expected:** An empty field blocks submit, and the error shows on that field's section. Real text lets you through. For spaces only, check whether they're treated as filled and log what you see. They ideally shouldn't count.
- **Priority:** P1

#### NTD-PO-031 — Optional fields don't block submit
- **Steps:** Fill only the required fields and leave the optional ones empty. Submit.
- **Expected:** No error. The approval modal opens.
- **Priority:** P0

#### NTD-PO-032 — A price or amount of 0 counts as filled
- **Steps:** Put `0` in a required price or amount field. Submit.
- **Expected:** It's accepted and doesn't count as empty.
- **Priority:** P1

#### NTD-PO-033 — Required number field (not price)
- **Steps:** Put `0` in a required plain number field. Submit. Then clear it and submit again.
- **Expected:** A cleared field must block submit. For `0`, write down what happens. In this code, only price and amount fields are exempt from the "0 is empty" check, so a plain number field may reject 0 (it depends on whether the value is stored as the number 0 or the text "0"). Confirm with product which is intended.
- **Priority:** P2

#### NTD-PO-034 — Required dropdown, date and attachment fields
- **Steps:** For each type, leave it empty and submit, then fill it and submit again.
- **Expected:** Empty blocks submit with the section error. Filled lets you through. For an attachment, an upload that failed or is still running doesn't count as filled.
- **Priority:** P1

#### NTD-PO-035 — Grouped table: a partly filled row is caught
- **Precondition:** The template has a grouped-table section with required columns.
- **Steps:** Add a row and fill only some of the required columns. Submit.
- **Expected:** The section shows "Sheet partially filled". Submit is blocked.
- **Priority:** P1

#### NTD-PO-036 — Grouped table: a cleared required number cell
- **Steps:** In a grouped-table row, type a number into a required number or quantity column, then delete it so the cell is empty. Submit.
- **Expected:** Submit should be blocked with "Sheet partially filled".
- **Note:** In the code, `Number("")` is 0, which counts as valid. The empty cell will probably pass. Log it as a bug if it does.
- **Priority:** P1

#### NTD-PO-037 — Grouped table: the blank last row is ignored
- **Steps:** Fill the required columns in all rows. Leave the trailing empty "new row" at the bottom as it is. Submit.
- **Expected:** No error. The empty last row isn't validated.
- **Priority:** P1

#### NTD-PO-038 — Read-only fields are never required
- **Steps:** The template has a field that is both required and read-only. Submit without touching it.
- **Expected:** It doesn't block submit.
- **Priority:** P2

#### NTD-PO-039 — BOQ section validation (if the template has one)
- **Steps:**
  1. Submit with no BOQ template picked.
  2. Submit with a template but no data.
  3. Submit with more line items than the limit.
- **Expected:** The error messages are, in order: "Please select a BOQ template", "Please upload correct BOQ data", and "You can have at max N line-items…".
- **Priority:** P2

#### NTD-PO-040 — Errors clear once fixed
- **Steps:** Trigger section errors (NTD-PO-029), fill the fields, and submit again.
- **Expected:** The errors go away. The approval modal opens.
- **Priority:** P1

#### NTD-PO-041 — Field-level input limits on the NTD form
- **Steps:** Repeat the input checks from NTD-PO-007 to NTD-PO-010 (long text, special characters, emoji, letters in number fields, decimals, invalid dates) on the NTD fields.
- **Expected:** Same rules as on the PO form. HTML is never rendered. Values save and reload correctly.
- **Priority:** P2

---

## E. "Submit Proposal" on the NTD form — the core change

#### NTD-PO-042 — A valid NTD opens the approval modal and doesn't go back to the PO form
- **Precondition:** P-NTD. PO form filled, arrived at the NTD form, all required NTD fields filled.
- **Steps:** Click **Submit Proposal**.
- **Expected:**
  - The **Submit Proposal** approval modal opens on the proposal page, with a loader while approval flows load.
  - The toast "Redirecting you to PO form..." does **not** show.
  - No new PO is created, and the page doesn't go to the PO form.
- **Priority:** P0

#### NTD-PO-043 — Same behaviour when `skip_custom_po` is on
- **Precondition:** P-NTD-SKIP. From awarding, click **Create Proposal**; there's no PO form in this path.
- **Steps:** Fill the NTD form and click **Submit Proposal**.
- **Expected:** The approval modal opens, the same as before the PR.
- **Priority:** P1

#### NTD-PO-044 — Opening the NTD page directly without going through the PO form
- **Precondition:** P-NTD, `skip_custom_po = false`. The proposal has **no** PO filled. Open the proposal URL directly, or through the version dropdown.
- **Steps:** Fill the NTD form and submit until the final approval submit.
- **Expected (to confirm):** The proposal shouldn't be submitted without a PO. Either the page points the user to the PO form, or the backend rejects the submit with a clear message.
- **Note:** The PR removed the step that used to send users to the PO form from here, so this path now leads straight to approval.
- **Priority:** P0

#### NTD-PO-045 — Submit Proposal can't be fired twice
- **Steps:** Double-click **Submit Proposal** on a valid NTD form.
- **Expected:** One modal and one approval-flow fetch. The button shows a loader while it fetches.
- **Priority:** P3

---

## F. Final submit — the "Submit Proposal" approval modal

Run these from the NTD form (NTD on). Where the steps differ, repeat the marked cases from the PO form with NTD off (P-NO-NTD).

#### NTD-PO-046 — What the modal shows
- **Steps:** Open the modal (NTD-PO-042).
- **Expected:**
  - The title is **Submit Proposal**.
  - A warning banner says submitting will revoke all active counter offers in this project.
  - **No. of Line Items** and **Total Proposal Value** match the Overview panel on the proposal page.
  - The footer has **Cancel** and a primary button.
- **Priority:** P1

#### NTD-PO-047 — The Master QCS link in the banner
- **Steps:** Click the external-link icon on the warning banner. On P-NTD-LOT, do it from Lot 2.
- **Expected:** The project's Master QCS opens in a **new tab**, with `?lotNo=2` on lot-based events. The modal stays open in the original tab.
- **Priority:** P2

#### NTD-PO-048 — No approval workflows
- **Precondition:** The tenant has no approval flows for this project.
- **Steps:** Open the modal.
- **Expected:**
  - The modal shows "No Approval Workflow Found" and "No approval will be triggered as no approval workflows are found".
  - The primary button reads **Submit Proposal**.
  - Submitting works.
- **Priority:** P1

#### NTD-PO-049 — Exactly one approval workflow
- **Steps:** Open the modal.
- **Expected:** The flow summary is shown straight away: Approval Type, Approval Flow Name with a description popover, clauses if any, and the approver stepper. The primary button reads **Submit Proposal**. There's no **Next**.
- **Priority:** P1

#### NTD-PO-050 — Several approval workflows: pick, then review
- **Steps:**
  1. Open the modal.
  2. Search the flows by name.
  3. Pick a flow with its radio button.
  4. Click **Next**.
  5. Click **Back**.
  6. Pick a different flow and click **Next** again.
- **Expected:**
  - The first flow is pre-selected.
  - Search filters the list, and a search with no match shows "No approval workflows found".
  - **Next** shows the chosen flow's summary, and the button changes to **Submit Proposal**.
  - **Back** returns to the list with your choice kept.
  - The summary always matches the flow you picked.
- **Priority:** P1

#### NTD-PO-051 — Approver must be picked when the step asks for it
- **Precondition:** The chosen flow has a step with `approver_select` on.
- **Steps:** Click **Submit Proposal** without picking an approver for that step.
- **Expected:** The error "Please select at least one approver to proceed." shows. Nothing is submitted. After you pick an approver, submit goes through.
- **Priority:** P0

#### NTD-PO-052 — Approver search
- **Steps:** In the approver picker, type part of a colleague's name. Try a name that doesn't exist and one with special characters.
- **Expected:** The results load after a short pause (debounced, not one call per key) and show only users from my teams. A name with no match shows an empty state. Special characters don't break the search.
- **Priority:** P2

#### NTD-PO-053 — Peer review step (if the tenant has it)
- **Precondition:** Peer review on.
- **Steps:** Open the summary.
- **Expected:** A peer step shows before the approval steps. The peer you pick is sent with the submit.
- **Priority:** P2

#### NTD-PO-054 — Closing remarks
- **Steps:** In **Closing Remarks**, try each of these and submit:
  - leave it empty
  - a short remark
  - bold text and a list (it's a rich-text editor)
  - a very long remark (5,000+ characters)
  - pasted content from Word
  - `<script>alert(1)</script>`
  - emoji
- **Expected:** Empty remarks are allowed; the field is optional. Formatting is kept and shows correctly in the approval trail afterwards. Long text isn't cut off without a warning. The script is stored and shown as text and never runs. Emoji show correctly.
- **Priority:** P1

#### NTD-PO-055 — Attachments
- **Steps:**
  1. Click the paper-clip icon.
  2. Upload a PDF, then several files at once.
  3. Try a type that isn't allowed, such as `.exe`.
  4. Try a very large file.
  5. Remove one attachment.
  6. Submit.
- **Expected:**
  - A loader shows while files upload.
  - Several files can be added at once.
  - The file picker blocks types that aren't allowed.
  - A failed upload shows the file-upload error and adds nothing to the list.
  - A removed file is gone from the list and isn't sent.
  - The attachments that are left show up on the approval afterwards.
- **Priority:** P1

#### NTD-PO-056 — Cancel and close
- **Steps:**
  1. Get to the summary step (NTD-PO-050), type a remark and close the modal with **X**. Open it again.
  2. Get to the summary step again, click **Cancel** and open it again.
- **Expected:** Both ways of closing should leave the modal in the same state when it reopens.
- **Note:** In the code, the X resets to the flow list. Cancel doesn't reset anything, so the modal reopens on the summary. Log whatever you see, as a low-priority inconsistency.
- **Priority:** P3

#### NTD-PO-057 — Successful final submit with NTD on
- **Steps:** Complete the modal and click **Submit Proposal**.
- **Expected:**
  - The button shows a loader and is disabled while submitting.
  - The toast "Proposal submitted successfully" shows.
  - The modal closes and you **stay on the proposal page**. There's no redirect to the events list.
  - The proposal is no longer draft. The NTD form becomes read-only. The template dropdown disappears. **Submit Proposal** is replaced by **Go back to project**.
  - The approval sidebar shows the new approval trail.
- **Priority:** P0

#### NTD-PO-058 — Final submit fails
- **Precondition:** Make the submit call fail, for example by blocking it in DevTools or using data the backend rejects.
- **Steps:** Click **Submit Proposal** in the modal.
- **Expected:** An error shows ("Proposal submission failed" or the backend's message). The proposal stays in draft, and the NTD and PO values are kept.
- **Note:** The modal also closes on failure, which throws away the remarks and attachments. Check with product whether that's acceptable.
- **Priority:** P1

#### NTD-PO-059 — Final submit clicked twice
- **Steps:** Double-click **Submit Proposal** in the modal.
- **Expected:** Only one submit call and one approval are created.
- **Priority:** P1

#### NTD-PO-060 — Final submit from the PO form with NTD off *(regression)*
- **Precondition:** P-NO-NTD.
- **Steps:** From the PO form, open the modal (NTD-PO-017) and submit it.
- **Expected:** "Proposal submitted successfully", then "Redirecting to events screen...", and the events list opens about 1.5 seconds later. If LOA was switched on for a vendor, LOA is sent for that vendor only.
- **Priority:** P0

---

## G. After submit and edge cases

#### NTD-PO-061 — The PO form after submit
- **Steps:** After NTD-PO-057, open **Proposed PO Form**.
- **Expected:** The PO form is read-only with every value you entered. There's no **Submit Proposal** button.
- **Priority:** P1

#### NTD-PO-062 — The data that was submitted is correct
- **Steps:** After submit, check the approval request as an approver, then download the proposal report.
- **Expected:** The NTD answers, PO values, remarks and attachments all match what you entered, for the right vendors and the right lot.
- **Priority:** P1

#### NTD-PO-063 — Withdraw and resubmit
- **Steps:** From the proposal menu, withdraw the approval. Go through PO form → NTD → final submit again.
- **Expected:** The same new order is followed. The earlier values are prefilled where the product keeps them. The new approval is created cleanly.
- **Priority:** P2

#### NTD-PO-064 — The two NTD flags disagree
- **Precondition:** Ask backend/dev for a proposal where the PO schema config says `ntd_required_on_proposal = true` and the project config says `false`, then the other way round.
- **Steps:** Go through PO form → Submit Proposal each time.
- **Expected:** In neither case does the user end up stuck or loop between pages. PO on / project off takes you to a proposal page with no Document panel. Its Submit must still open the approval modal.
- **Priority:** P2

#### NTD-PO-065 — A user without edit rights
- **Steps:** Log in as the second buyer (read-only on the project) and open the PO form and the proposal page.
- **Expected:** Neither page offers **Submit Proposal**. The NTD fields can't be edited.
- **Priority:** P2

#### NTD-PO-066 — Two lots, one after the other
- **Precondition:** P-NTD-LOT.
- **Steps:** Complete the full flow for Lot 1, then for Lot 2.
- **Expected:** Each lot has its own PO, NTD and approval. Lot 2's NTD doesn't show Lot 1's answers, and the approval sidebar is scoped to the lot you are on.
- **Priority:** P1

---

## Smoke order for a quick pass

If there's only time for one run, do these in order. It's one straight line through the new flow:

**001 → 005 → 015 → 016 → 029 → 031 → 042 → 050 → 051 → 057 → 061**, then **017 → 060** for the flow with NTD off, and **023** if the tenant uses lots.
