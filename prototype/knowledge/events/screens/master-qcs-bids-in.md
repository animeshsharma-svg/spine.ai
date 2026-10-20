# Screen: master-qcs-bids-in (/project/a1pjY1hk/master_qcs)

Captured 2026-10-20 on company 198678, with the event in state "bid". 23 controls, 23 with a known effect, 8 test cases written from it.

## How to reach the master-qcs-bids-in screen

Plan steps: open_prepared {"screen":"responses"} → open_prepared {"screen":"analytics"} → open_prepared {"screen":"master_qcs"}. Path: `/project/a1pjY1hk/master_qcs`.
Headings on it: spine-API-automation-32666437 | QA_Platform Vendor 1 1790820862139 | AAC BLOCKS •1100000401 •Variant 1 | Rfq Final | Hello Procol,.

## What each control on master-qcs-bids-in does

- **Copy** (button): Copies the associated displayed project or event value to the clipboard. Affects: Nothing in the event data or workflow.. Leads to: stays here. Check: Click Copy and verify that the expected value is available in the clipboard.
- **icon: copy** (button): Copies the value associated with the copy icon to the clipboard. Affects: Nothing in the event data or workflow.. Leads to: stays here. Check: Click the copy icon and verify that its associated value is copied.
- **Ask Clara** (button): Opens the Clara assistant for this project. Affects: Nothing unless the buyer starts an assistant action.. Leads to: Clara drawer or panel. Check: Click Ask Clara and verify that the Clara interface opens.
- **Create New Version** (button): Creates a new version of the project. Affects: Creates a new editable project version while preserving the existing event version.. Leads to: new-version creation screen. Rule R-FLA-019-3. Check: Click Create New Version and verify that the creation screen opens with the new-version context.
- **Messages** (button): Opens the project's messages. Affects: Nothing in the event data or workflow.. Leads to: messages drawer or screen. Check: Click Messages and verify that the project message interface opens.
- **Hide fields** (button): Hides the optional fields shown in the QCS. Affects: Changes only the current QCS field visibility and not the event records.. Leads to: stays here. Check: Click Hide fields and verify that the corresponding fields disappear and the control changes to show them again.
- **Download Report** (button): Generates and downloads the current QCS report. Affects: Nothing in the event data or award workflow.. Leads to: stays here while a report download starts. Check: Click Download Report and verify that a report file is downloaded.
- **Start Awarding** (button): Starts the awarding flow for the current lot when awarding is allowed. Affects: Moves the event from bid review toward proposal or award processing.. Leads to: awarding screen or bid-justification dialog. Rule R-FLA-028-2. Check: Click Start Awarding and verify that it opens awarding or displays the required justification dialog.
- **AAC BLOCKS** (button): Selects or opens the AAC BLOCKS line-item value in the QCS. Affects: Changes the selected QCS field or row only if the value is interactive.. Leads to: stays here or the related bid-detail view. Check: Click AAC BLOCKS and verify whether the related line-item or bid details are selected or opened.
- **29 KG** (button): Selects or opens the 29 KG quantity value in the QCS. Affects: Changes the selected QCS field or row only if the value is interactive.. Leads to: stays here or the related bid-detail view. Check: Click 29 KG and verify whether the quantity detail is selected or opened.
- **–** (button): Clicking – opens the bid detail represented by the unavailable value. Affects: Changes only the viewed proposal context and does not create or modify a bid.. Leads to: Proposal or bid-detail view.. Rule R-FLA-030-2. Check: Click the dash and verify that the associated proposal or bid detail opens, if available.
- **₹ 115 /KG** (button): Selects or opens the ₹115 per KG bid value. Affects: Changes the selected QCS field or row only if the value is interactive.. Leads to: stays here or the related bid-detail view. Check: Click ₹115 /KG and verify whether the corresponding bid detail is selected or opened.
- **₹ 3,335** (button): Selects or opens the ₹3,335 total bid value. Affects: Changes the selected QCS field or row only if the value is interactive.. Leads to: stays here or the related bid-detail view. Check: Click ₹3,335 and verify whether the corresponding total or bid detail is selected or opened.
- **₹ 9 /KG** (button): Selects or opens the ₹9 per KG comparison value. Affects: Changes the selected QCS field or row only if the value is interactive.. Leads to: stays here or the related bid-detail view. Check: Click ₹9 /KG and verify whether the comparison detail is selected or opened.
- **7.26 %** (button): Selects or opens the 7.26 percent comparison value. Affects: Changes the selected QCS field or row only if the value is interactive.. Leads to: stays here or the related bid-detail view. Check: Click 7.26 % and verify whether the percentage comparison detail is selected or opened.
- **Give Feedback** (button): Opens the feedback interface. Affects: Nothing in the event data unless feedback is submitted.. Leads to: feedback dialog or drawer. Check: Click Give Feedback and verify that a feedback form opens.
- **View Tickets** (button): Opens the project's support tickets. Affects: Nothing in the event data or workflow.. Leads to: tickets screen. Check: Click View Tickets and verify that the project's ticket list opens.
- **Project Details** (tab): Switches to the Project Details tab. Affects: Changes the visible project-details stage without changing event data.. Leads to: Project Details screen. Check: Click Project Details and verify that the project details content is displayed.
- **RFQ** (tab): Switches to the RFQ tab. Affects: Changes the visible RFQ stage without changing event data.. Leads to: RFQ screen. Check: Click RFQ and verify that the RFQ content is displayed.
- **Master QCS** (tab): Displays the Master QCS tab as the selected tab. Affects: Keeps the current master-QCS stage selected.. Leads to: stays here. Check: Verify that Master QCS is highlighted and its bid comparison content is visible.
- **Project** (link): Opens the project's main details page. Affects: Changes navigation context without changing event data.. Leads to: Project Details screen. Check: Click Project and verify that the project details page opens.
- **View Tickets** (link): Opens the project's support tickets. Affects: Nothing in the event data or workflow.. Leads to: tickets screen. Check: Click View Tickets and verify that the project's ticket list opens.
- **QA_Platform Vendor 1 1790820862139** (column): Identifies the vendor column for QA_Platform Vendor 1 1790820862139. Affects: Changes no event data or workflow.. Leads to: stays here. Check: Verify that the column header matches the vendor name and its bid values appear below it.

## Test cases written from the master-qcs-bids-in screen

- GEN-SCR-135: Open a non-draft vendor proposal. Steps: Click QA_Platform Vendor 1 1790820862139. Expected: The proposal page opens at /project/<id>/proposal/<proposalUuid>?lotNo=<lotNo>. [plan: partial]
- GEN-SCR-136: Toggle hidden fields. Steps: Click Hide fields. Observe the bid details. Click Hide fields again. Expected: The bid detail fields are hidden after the first click and visible again after the second click. [plan: partial]
- GEN-SCR-137: Download the QCS report. Steps: Click Download Report. Expected: A report download starts, or the browser shows the downloaded report file. [plan: none]
- GEN-SCR-264: Ask Clara handles an analyze_data request. Steps: Click "Ask Clara". Wait for Clara to process the request. Expected: The app shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned redirect_url. [plan: partial]
- GEN-SCR-265: Create New Version opens version creation. Steps: Click "Create New Version". Expected: The version-creation flow opens. The current Master QCS remains unchanged until the new version is submitted. [plan: partial]
- GEN-SCR-266: Messages opens project messages. Steps: Click "Messages". Expected: The project messages view or drawer opens for this event. [plan: partial]
- GEN-SCR-267: Vendor proposal navigation uses the proposal status. Steps: Click the "QA_Platform Vendor 1 1790820862139" column. Record the destination URL. Return to Master QCS. Repeat the action with the draft proposal. Expected: For the non-draft proposal, the app opens /project/:id/proposal/:proposalUuid?lotNo=. For the draft proposal, it opens /awarding/:id?lotNo=. [plan: partial]
- GEN-SCR-268: Hide fields toggles the Master QCS fields. Steps: Click "Hide fields". Inspect the Master QCS table. Expected: The configurable fields are hidden and the table remains usable without losing the project or vendor context. [plan: partial]
