# Screen: awarding (/awarding/Y2taY1hk)

Captured 2026-10-20 on company 198678, with the event in state "bid". 16 controls, 13 with a known effect, 3 test cases written from it.

## How to reach the awarding screen

Plan steps: open_prepared {"screen":"responses"} → open_prepared {"screen":"analytics"} → open_prepared {"screen":"master_qcs"} → start_awarding. Path: `/awarding/Y2taY1hk`.
Headings on it: QA_Platform Vendor 1 1790820862139 | AAC BLOCKS •1100000401 •Variant 1 | Rfq Final | Hello Procol,.

## What each control on awarding does

- **Copy** (button): Copies the adjacent event or proposal value to the clipboard. Affects: Nothing in the event data changes.. Leads to: Stays here.. Check: Click Copy and verify that the expected adjacent value can be pasted from the clipboard.
- **Ask Clara** (button): Opens the Clara assistant. Affects: Nothing in the event data changes.. Leads to: Clara assistant interface.. Check: Click Ask Clara and verify that the assistant opens.
- **8 hidden fields** (button): Opens the list of hidden fields. Affects: Only the visible-field presentation of the awarding sheet is changed.. Leads to: Hidden-fields drawer or popover.. Rule R-FLA-033-3. Check: Click 8 hidden fields and verify that the hidden-field list is displayed.
- **Fullscreen** (button): Expands the awarding view into fullscreen mode. Affects: Only the layout and available viewing area change.. Leads to: Fullscreen awarding view.. Check: Click Fullscreen and verify that the awarding sheet fills the available screen.
- **Create Proposal** (button): Retrieves the proposal and, when at least one vendor has been awarded, opens the proposal page. Affects: Moves the event from bid awarding into the proposal flow without itself creating a purchase order.. Leads to: `/project/:id/proposal/:proposalId`, or an error message when no vendor is awarded.. Rule R-FLA-041-2. Check: Click Create Proposal with and without an awarded vendor and verify the route or the no-vendor error.
- **–** (button): Collapses or minimizes the associated section. Affects: Only the current screen's presentation changes.. Leads to: Stays here with the section collapsed.. Check: Click the minus button and verify that the associated section is collapsed.
- **₹ 5,665** (button): Activates the ₹ 5,665 amount control. Affects: The related bid or amount detail may change, but the exact data operation is not identifiable from the label.. Leads to: Stays here or opens the amount detail view.. Rule R-FLA-055-2. Check: Click ₹ 5,665 and verify whether an amount or bid detail is displayed.
- **Awarded Vendors (0/1)** (button): Opens or expands the awarded-vendor summary. Affects: The display of awarded-vendor information changes; the count represents awarded vendor entries against all vendor layers.. Leads to: Awarded-vendor summary area.. Rule R-FLA-032-3. Check: Click Awarded Vendors (0/1) and verify that the awarded-vendor summary opens and shows no vendors awarded.
- **Give Feedback** (button): Opens the feedback interface. Affects: Nothing in the event awarding data changes.. Leads to: Feedback dialog or drawer.. Check: Click Give Feedback and verify that a feedback form opens.
- **View Tickets** (button): Opens the event's tickets view. Affects: Nothing in the event data changes.. Leads to: Tickets screen.. Check: Click View Tickets and verify that the event tickets screen opens.
- **Awarding** (link): Identifies the current Awarding section. Affects: Nothing in the event data changes.. Leads to: Stays on the awarding screen.. Check: Verify that Awarding is marked as the active navigation item.
- **View Tickets** (link): Navigates to the event's tickets view. Affects: Nothing in the event data changes.. Leads to: Tickets screen.. Check: Click the View Tickets link and verify that the tickets screen opens.
- **QA_Platform Vendor 1 1790820862139 Select All** (column): Selects or clears all line items for vendor QA_Platform Vendor 1 for awarding. Affects: Updates that vendor's awarded line-item responses and the proposal's awarded-item totals.. Leads to: Stays on the awarding screen.. Rule R-FLA-034-4. Check: Toggle Select All and verify that every line item in the vendor column is selected or cleared and the awarded totals update.

Not yet described: "icon: copy", "AAC BLOCKS", "55 KG".

## Test cases written from the awarding screen

- GEN-SCR-138: Show the awarded-vendor summary when no vendor is awarded. Steps: Open the awarding screen. Inspect the awarded-vendor summary. Expected: The counter shows "Awarded Vendors (0/1)". The summary shows "No vendors awarded" and does not show a vendor summary with awarded amounts or items. [plan: partial]
- GEN-SCR-139: Open the hidden-fields list. Steps: Click "8 hidden fields". Expected: A hidden-fields view or menu opens and shows the fields currently hidden from the awarding sheet. [plan: partial]
- GEN-SCR-140: Enter and exit fullscreen view. Steps: Click "Fullscreen". Inspect the awarding screen. Exit fullscreen using the browser or displayed fullscreen exit action. Expected: The awarding screen expands to fullscreen after the click and returns to the normal layout after exiting fullscreen. [plan: none]
