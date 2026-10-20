# Screen: awarding-allocated (/awarding/a1pjY1hk)

Captured 2026-10-20 on company 198678, with the event in state "bid". 13 controls, 13 with a known effect, 3 test cases written from it.

## How to reach the awarding-allocated screen

Plan steps: open_prepared {"screen":"responses"} → open_prepared {"screen":"analytics"} → open_prepared {"screen":"master_qcs"} → start_awarding → allocate_award. Path: `/awarding/a1pjY1hk`.
Headings on it: QA_Platform Vendor 1 1790820862139 | AAC BLOCKS •1100000401 •Variant 1 | Rfq Final.

## What each control on awarding-allocated does

- **Copy** (button): Copies the associated displayed value to the clipboard. Affects: Nothing in the event or award data.. Leads to: Stays here.. Check: Click the button and verify that the expected value is available in the clipboard.
- **icon: copy** (button): Copies the associated value represented by the copy icon to the clipboard. Affects: Nothing in the event or award data.. Leads to: Stays here.. Check: Click the icon and paste into a text field to verify the expected value was copied.
- **Ask Clara** (button): Opens the Ask Clara assistant. Affects: Nothing in the event or award data.. Leads to: Ask Clara drawer or panel.. Check: Click Ask Clara and verify that the assistant interface opens.
- **8 hidden fields** (button): Opens the hidden-fields or column visibility controls. Affects: The visible columns in the awarding sheet, which are persisted after changes.. Leads to: Hidden-fields menu or drawer.. Rule R-FLA-033-3. Check: Open the control, hide or show a field, and verify the sheet updates and the preference persists after refresh.
- **Fullscreen** (button): Expands the awarding sheet into fullscreen mode. Affects: Only the sheet's display layout.. Leads to: Fullscreen awarding-sheet view.. Check: Click Fullscreen and verify the sheet occupies the available screen area.
- **Create Proposal** (button): Attempts to create the proposal from the current award selections. Affects: The proposal record and the next proposal or purchase-order flow, and it requires at least one awarded vendor before navigating.. Leads to: The proposal page when an award exists, otherwise an error or validation message.. Rule R-FLA-041-2. Check: Click Create Proposal with and without an awarded vendor and verify the corresponding navigation or validation behavior.
- **–** (button): Collapses the associated awarding-sheet section or line-item group. Affects: Only the visibility of the related rows in the sheet.. Leads to: Stays here with the section collapsed.. Check: Click the minus control and verify that the associated rows collapse and can be expanded again.
- **AAC BLOCKS** (button): Opens or focuses the AAC BLOCKS line-item award details. Affects: The displayed line-item context used for vendor awarding.. Leads to: The AAC BLOCKS line-item detail or award control.. Check: Click AAC BLOCKS and verify that the corresponding line-item details or award controls are shown.
- **29 KG** (button): Opens or focuses the 29 KG quantity value for the line item. Affects: The displayed quantity context for the AAC BLOCKS line item.. Leads to: Stays here or opens the line-item detail control.. Check: Click 29 KG and verify that the quantity-related line-item view or control responds.
- **₹ 3,335** (button): Opens or focuses the ₹3,335 bid amount for the line item. Affects: The displayed vendor bid amount used in the awarding view.. Leads to: Stays here or opens the bid or line-item detail control.. Rule R-FLA-055-2. Check: Click ₹3,335 and verify that the corresponding bid detail or line-item control responds without changing the formatted amount.
- **Awarded Vendors (1/1)** (button): Opens or toggles the awarded-vendor summary. Affects: Only the visibility of the awarded-vendor summary; the count represents vendor-wise award entries against all vendor layers.. Leads to: Expanded or collapsed awarded-vendor summary on this screen.. Rule R-FLA-032-3. Check: Click the control and verify that the awarded-vendor summary opens and shows the expected vendor count.
- **Awarding** (link): Navigates to the Awarding section. Affects: Nothing in the event or award data.. Leads to: The Awarding screen.. Check: Click Awarding and verify that the awarding route is opened or remains selected.
- **QA_Platform Vendor 1 1790820862139 Select All** (column): Selects or clears all eligible line items for QA_Platform Vendor 1 for awarding. Affects: The vendor's line-item award selections and therefore the proposal's awarded items.. Leads to: Stays here with the vendor's eligible rows selected or cleared.. Check: Toggle Select All and verify that every eligible line item in the vendor column changes selection consistently.

## Test cases written from the awarding-allocated screen

- GEN-SCR-273: Awarded vendor summary shows required metrics. Steps: Open the Awarded Vendors (1/1) summary. Review the vendor summary. Repeat with a proposal that has no awarded vendors. Expected: The vendor summary shows the vendor name, vendor code, tag, "L1 Amount", "L1 Items Awarded", "Non L1 Amount", "Non L1 Items Awarded", "Total Amount", and "Awarded Items". When no vendors are awarded, it shows "No vendors awarded". [plan: partial]
- GEN-SCR-274: Hidden fields menu opens from the awarding page. Steps: Select 8 hidden fields. Expected: A hidden-fields menu opens and lists the fields currently hidden from the awarding view. The awarding page remains available after the menu is opened. [plan: partial]
- GEN-SCR-275: Fullscreen opens the expanded awarding view. Steps: Select Fullscreen. Observe the awarding view. Expected: The awarding view expands to fullscreen. The displayed vendor, line-item, and amount data remains unchanged. [plan: partial]
