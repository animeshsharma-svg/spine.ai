# Screen: master-qcs-bids-in (/project/Y2taY1hk/master_qcs)

Captured 2026-10-20 on company 198678, with the event in state "bid". 23 controls, 22 with a known effect, 3 test cases written from it.

## How to reach the master-qcs-bids-in screen

Plan steps: open_prepared {"screen":"responses"} → open_prepared {"screen":"analytics"} → open_prepared {"screen":"master_qcs"}. Path: `/project/Y2taY1hk/master_qcs`.
Headings on it: spine-API-automation-70683975 | QA_Platform Vendor 1 1790820862139 | AAC BLOCKS •1100000401 •Variant 1 | Rfq Final | Hello Procol,.

## What each control on master-qcs-bids-in does

- **Copy** (button): Clicking Copy starts cloning the current project. Affects: Creates a cloned project from this event without changing the current event.. Leads to: Project creation screen, then the cloned project's details after success.. Rule R-FLA-021-1. Check: Click Copy and verify a clone is created and the cloned project details page opens.
- **icon: copy** (button): Clicking the copy icon copies the associated displayed value to the clipboard. Affects: Nothing in the event data or flow.. Leads to: stays here. Check: Click the icon and paste into a text field to verify the displayed value was copied.
- **Ask Clara** (button): Clicking Ask Clara asks Clara to analyze the current event data. Affects: May initiate the awarding flow when Clara returns an analyze_data action, without directly changing the event record.. Leads to: Clara analysis or the awarding flow after a successful analyze_data response.. Rule R-FLA-017-4. Check: Click Ask Clara and verify that the analysis starts and, when an awarding redirect is returned, the awarding screen opens.
- **Create New Version** (button): Clicking Create New Version starts a new version of the project. Affects: Creates a new editable project version while preserving the existing version.. Leads to: Project creation screen for the new version.. Rule R-FLA-019-3. Check: Click Create New Version and verify the create screen opens with the new-version project data.
- **Messages** (button): Clicking Messages opens the event's messages interface. Affects: Nothing in the event data or award flow.. Leads to: Messages drawer or screen.. Check: Click Messages and verify the messages interface is displayed.
- **Hide fields** (button): Clicking Hide fields toggles the visibility of optional fields in the QCS. Affects: Only the current table presentation; it does not change bid or event data.. Leads to: stays here. Check: Click Hide fields and verify the applicable fields disappear or reappear.
- **Download Report** (button): Clicking Download Report downloads a report for the displayed QCS. Affects: Creates a report file without changing the event, bids, or award state.. Leads to: stays here. Check: Click Download Report and verify a report download is initiated.
- **Start Awarding** (button): Clicking Start Awarding starts the award flow for the current lot. Affects: Moves the event from bid evaluation toward award selection without itself creating a purchase order.. Leads to: Awarding screen, unless a pending bid-justification request opens first.. Rule R-FLA-028-1. Check: Click Start Awarding and verify that the awarding screen opens or the required justification modal is shown.
- **AAC BLOCKS** (button): Clicking AAC BLOCKS selects or opens the AAC BLOCKS line item in the QCS. Affects: Changes the currently viewed line item or proposal context, not the stored bid.. Leads to: stays here or the selected line-item proposal view.. Rule R-FLA-030-2. Check: Click AAC BLOCKS and verify that the AAC BLOCKS line-item context is selected.
- **55 KG** (button): Clicking 55 KG selects or opens the quantity value for the line item. Affects: Changes the viewed bid-detail context, not the submitted quantity.. Leads to: stays here or the selected proposal view.. Rule R-FLA-030-2. Check: Click 55 KG and verify that the corresponding quantity or bid details are displayed.
- **–** (button): Clicking – opens the bid detail represented by the unavailable value. Affects: Changes only the viewed proposal context and does not create or modify a bid.. Leads to: Proposal or bid-detail view.. Rule R-FLA-030-2. Check: Click the dash and verify that the associated proposal or bid detail opens, if available.
- **₹ 103 /KG** (button): Clicking ₹ 103 /KG opens the vendor's submitted unit-price detail. Affects: Reads the submitted proposal without changing the bid or award state.. Leads to: Proposal or bid-detail view.. Rule R-FLA-030-2. Check: Click ₹ 103 /KG and verify the corresponding vendor proposal opens.
- **₹ 5,665** (button): Clicking ₹ 5,665 opens the vendor's submitted total-price detail. Affects: Reads the submitted proposal without changing the bid or award state.. Leads to: Proposal or bid-detail view.. Rule R-FLA-030-2. Check: Click ₹ 5,665 and verify the corresponding vendor proposal opens.
- **₹ 21 /KG** (button): Clicking ₹ 21 /KG opens the displayed comparison or variance detail. Affects: Changes only the viewed bid-comparison context and does not modify event data.. Leads to: Proposal or bid-detail view.. Rule R-FLA-030-2. Check: Click ₹ 21 /KG and verify the related bid detail is displayed.
- **16.94 %** (button): Clicking 16.94 % opens the displayed percentage comparison detail. Affects: Changes only the viewed bid-comparison context and does not modify event data.. Leads to: Proposal or bid-detail view.. Rule R-FLA-030-2. Check: Click 16.94 % and verify the related bid detail is displayed.
- **Give Feedback** (button): Clicking Give Feedback opens the feedback interface. Affects: Nothing in the event's sourcing or award data.. Leads to: Feedback dialog or drawer.. Check: Click Give Feedback and verify the feedback form appears.
- **View Tickets** (button): Clicking View Tickets opens the event's ticket list. Affects: Nothing in the event's sourcing or award data.. Leads to: Tickets screen or drawer.. Check: Click View Tickets and verify tickets for this event are displayed.
- **Project Details** (tab): Clicking Project Details switches to the project-details tab. Affects: Changes only the selected project-details view.. Leads to: Project Details tab.. Rule R-FLA-016-5. Check: Click Project Details and verify that tab becomes active.
- **RFQ** (tab): Clicking RFQ switches to the RFQ tab. Affects: Changes only the selected event-stage view.. Leads to: RFQ tab.. Rule R-FLA-016-5. Check: Click RFQ and verify the RFQ tab content is shown.
- **Master QCS** (tab): Clicking Master QCS keeps the Master QCS tab selected. Affects: Nothing in the event data or flow.. Leads to: stays here. Rule R-FLA-016-5. Check: Click Master QCS and verify it remains the active tab with the QCS visible.
- **Project** (link): Clicking Project navigates to the project view. Affects: Nothing in the event's sourcing or award data.. Leads to: Project details screen.. Check: Click Project and verify the project details page opens.
- **View Tickets** (link): Clicking View Tickets navigates to the event's tickets. Affects: Nothing in the event's sourcing or award data.. Leads to: Tickets screen or drawer.. Check: Click View Tickets and verify the event's ticket list opens.

Not yet described: "QA_Platform Vendor 1 1790820862139".

## Test cases written from the master-qcs-bids-in screen

- GEN-SCR-135: Open a non-draft vendor proposal. Steps: Click QA_Platform Vendor 1 1790820862139. Expected: The proposal page opens at /project/<id>/proposal/<proposalUuid>?lotNo=<lotNo>. [plan: partial]
- GEN-SCR-136: Toggle hidden fields. Steps: Click Hide fields. Observe the bid details. Click Hide fields again. Expected: The bid detail fields are hidden after the first click and visible again after the second click. [plan: partial]
- GEN-SCR-137: Download the QCS report. Steps: Click Download Report. Expected: A report download starts, or the browser shows the downloaded report file. [plan: none]
