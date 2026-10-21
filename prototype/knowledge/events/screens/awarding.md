# Screen: awarding (/awarding/a1pjY1hk)

Captured 2026-10-20 on company 198678, with the event in state "bid". 16 controls, 13 with a known effect, 7 test cases written from it.

## How to reach the awarding screen

Plan steps: open_prepared {"screen":"responses"} → open_prepared {"screen":"analytics"} → open_prepared {"screen":"master_qcs"} → start_awarding. Path: `/awarding/a1pjY1hk`.
Headings on it: QA_Platform Vendor 1 1790820862139 | AAC BLOCKS •1100000401 •Variant 1 | Rfq Final | Hello Procol,.

## What each control on awarding does

- **Copy** (button): Copies the associated visible value to the clipboard. Affects: nothing.. Leads to: stays here. Check: Click Copy and verify that the expected value is available in the clipboard.
- **icon: copy** (button): Copies the associated value to the clipboard. Affects: nothing.. Leads to: stays here. Check: Click the copy icon and verify that the expected value is available in the clipboard.
- **Ask Clara** (button): Opens the Ask Clara assistant. Affects: nothing in the awarding data.. Leads to: Ask Clara drawer or dialog. Check: Click Ask Clara and verify that the assistant opens.
- **8 hidden fields** (button): Shows or hides the eight hidden fields. Affects: the visible fields in the awarding view but not the event data.. Leads to: stays here. Rule R-FLA-033-3. Check: Click it and verify that the hidden-field list or fields become visible.
- **Fullscreen** (button): Expands the awarding view into fullscreen mode. Affects: only the page layout.. Leads to: stays here in fullscreen. Check: Click Fullscreen and verify that the awarding view occupies the available screen.
- **Create Proposal** (button): Fetches the proposal and creates a proposal when at least one vendor has been awarded. Affects: the proposal record and advances the event from awarding toward the proposal screen.. Leads to: the project proposal screen. Rule R-FLA-041-2. Check: Click Create Proposal and verify that an awarded proposal opens, or that the minimum-vendor error appears when no vendor is awarded.
- **–** (button): Collapses or minimizes the associated section. Affects: Only the current screen's presentation changes.. Leads to: Stays here with the section collapsed.. Check: Click the minus button and verify that the associated section is collapsed.
- **Awarded Vendors (0/1)** (button): Opens or expands the awarded-vendor summary. Affects: only the displayed summary of vendors awarded in the proposal.. Leads to: stays here with the awarded-vendor summary expanded. Rule R-FLA-032-3. Check: Click Awarded Vendors and verify that the awarded-vendor details are shown, including the current count.
- **Give Feedback** (button): Opens the feedback interface for the awarding experience. Affects: feedback data if the buyer submits feedback, but not the award.. Leads to: feedback dialog or drawer. Check: Click Give Feedback and verify that a feedback form opens.
- **View Tickets** (button): Opens the tickets view for the event. Affects: nothing in the award data.. Leads to: tickets view or drawer. Check: Click View Tickets and verify that the event's tickets are displayed.
- **Awarding** (link): Navigates to the Awarding page. Affects: nothing.. Leads to: the current Awarding screen. Check: Click Awarding and verify that the awarding route is selected.
- **View Tickets** (link): Navigates to the event's tickets view. Affects: nothing in the award data.. Leads to: tickets screen. Check: Click View Tickets and verify that the tickets page opens.
- **QA_Platform Vendor 1 1790820862139 Select All** (column): Selects or clears all awardable rows in the QA_Platform Vendor 1 column. Affects: the vendor's line-item award selections in the proposal and the subsequent awarded totals.. Leads to: stays here. Rule R-FLA-034-4. Check: Toggle Select All and verify that every eligible row in the vendor column is selected or cleared and the totals update.

Not yet described: "AAC BLOCKS", "29 KG", "₹ 3,335".

## Test cases written from the awarding screen

- GEN-SCR-138: Show the awarded-vendor summary when no vendor is awarded. Steps: Open the awarding screen. Inspect the awarded-vendor summary. Expected: The counter shows "Awarded Vendors (0/1)". The summary shows "No vendors awarded" and does not show a vendor summary with awarded amounts or items. [plan: partial]
- GEN-SCR-139: Open the hidden-fields list. Steps: Click "8 hidden fields". Expected: A hidden-fields view or menu opens and shows the fields currently hidden from the awarding sheet. [plan: partial]
- GEN-SCR-140: Enter and exit fullscreen view. Steps: Click "Fullscreen". Inspect the awarding screen. Exit fullscreen using the browser or displayed fullscreen exit action. Expected: The awarding screen expands to fullscreen after the click and returns to the normal layout after exiting fullscreen. [plan: none]
- GEN-SCR-269: Awarded Vendors counter matches vendor award entries and available vendor layers. Steps: Observe "Awarded Vendors (0/1)". Award the vendor in the test fixture and reload the awarding screen. Observe the Awarded Vendors counter while the proposal is refetched. Expected: The counter shows 0/1 before the award and 1/1 after the award. It shows "Calculating ..." while the proposal is being refetched, if the refetch is observable. [plan: partial]
- GEN-SCR-270: Empty award summary shows no vendors awarded. Steps: Click "Awarded Vendors (0/1)". Inspect the vendor summary. Expected: The summary shows "No vendors awarded" and does not show vendor amount or awarded-item values. [plan: partial]
- GEN-SCR-271: No-bid proposal displays the no-bids message. Steps: Observe the awarding content. Click "AAC BLOCKS" if the item section is collapsed. Observe the item section. Expected: The screen displays "No bids are placed yet!" and does not display bid values for the item. [plan: partial]
- GEN-SCR-272: View Tickets controls open the tickets view. Steps: Click the button labeled "View Tickets". Verify that the tickets view opens. Return to the awarding screen. Click the link labeled "View Tickets". Expected: Each View Tickets control opens the tickets view. The awarding data is not modified. [plan: none]
