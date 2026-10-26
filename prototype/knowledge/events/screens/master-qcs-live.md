# Screen: master-qcs-live (/project/TlhjY1hk/master_qcs)

Captured 2026-10-21 on company 198678. 13 controls, 11 with a known effect, 8 test cases written from it.

## How to reach the master-qcs-live screen

Plan steps: open_create {"path":"erfx"} → set_title → compose_stages {"stages":["rfp","rfq"]} → switch_stage {"stage":"rfp"} → select_template → switch_stage {"stage":"rfq"} → select_template → add_line_items {"count":2} → fill_sheet → switch_stage {"stage":"rfp"} → fill_questionnaires → assign_evaluator → switch_stage {"stage":"rfq"} → set_schedule {"minutes":30} → invite_vendor {"count":1} → publish → expect_published → open_event_settings → press {"key":"Escape"} → open_participants → place_surrogate_bid → expect_bid_submitted → open_master_qcs. Path: `/project/TlhjY1hk/master_qcs`.
Headings on it: spine-ui-automation-84442217 | 12 | AAC BLOCKS •1100000401 •Variant 1.

## What each control on master-qcs-live does

- **Ask Clara** (button): Clicking it opens Clara for assistance with the project. Affects: It may start or display a communication or analysis interaction without changing the event record.. Leads to: Clara interface.. Rule R-FLA-017-3. Check: Click Ask Clara and verify that the Clara interface opens.
- **Create New Version** (button): Clicking it starts creation of a new project version when version creation is allowed. Affects: It creates a new draft version based on the current project and moves the buyer into the project creation flow.. Leads to: Project creation screen for the new version.. Rule R-FLA-019-3. Check: Click Create New Version and verify that a new-version creation screen opens with the current project data prefilled.
- **Messages** (button): Clicking it opens the project's messaging area when communication is available. Affects: It changes only the communication view and does not alter sourcing, bid, or award data.. Leads to: Communication hub or messages drawer.. Rule R-FLA-017-3. Check: Click Messages and verify that the project's message interface opens.
- **Hide fields** (button): Clicking it hides the visible fields in the current view. Affects: It changes the current display only and does not change event data.. Leads to: Stays here.. Check: Click Hide fields and verify that the relevant fields disappear without changing saved project data.
- **Download Report** (button): Clicking it downloads a report for the displayed project data. Affects: It produces a report file without changing the event's sourcing or award records.. Leads to: Stays here while the report downloads.. Check: Click Download Report and verify that a report file is generated with the displayed project information.
- **Start Awarding** (button): Clicking it opens the awarding flow when the current lot has no proposal and awarding is permitted. Affects: It moves the lot from evaluation toward proposal creation or award selection; the action is blocked when the project or lot is not eligible.. Leads to: Awarding flow.. Rule R-FLA-028-2. Check: On an eligible lot with no proposal, click Start Awarding and verify that the awarding screen opens; repeat with an ineligible lot and verify that the control is disabled.
- **Project Details** (tab): Clicking it switches to the Project Details tab. Affects: It changes the displayed project-details stage but does not change event data.. Leads to: Project Details tab.. Check: Click Project Details and verify that the project overview screen is displayed.
- **Technical Stage** (tab): Clicking it switches to the Technical Stage tab. Affects: It changes the displayed event stage but does not change saved event data.. Leads to: Technical Stage tab.. Check: Click Technical Stage and verify that the technical-stage details are displayed.
- **RFQ** (tab): Clicking it switches to the RFQ tab. Affects: It changes the displayed event stage but does not change saved event data.. Leads to: RFQ tab.. Check: Click RFQ and verify that the RFQ stage details are displayed.
- **Master QCS** (tab): It indicates that the Master QCS tab is selected and keeps the buyer on the master comparison view. Affects: It changes no event data and exposes the lot's proposal or awarding state.. Leads to: Stays here.. Check: Verify that Master QCS is visually selected and that the master comparison content is visible.
- **Project** (link): Clicking it navigates to the project page. Affects: It changes navigation only and does not modify the project record.. Leads to: Project details page.. Check: Click Project and verify that the project page opens for the same project.

Not yet described: "Copy", "icon: copy".

## Test cases written from the master-qcs-live screen

- GEN-SCR-244: Create New Version opens the supported-stage clone confirmation. Steps: Click "Create New Version". Expected: A clone confirmation modal appears and says "Cloning is supported only for the Technical and RFQ stages." [plan: full]
- GEN-SCR-245: Ask Clara analyzes data and redirects to the returned awarding URL. Steps: Click "Ask Clara". Wait for the analysis request to complete. Expected: The app shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned redirect_url. [plan: partial]
- GEN-SCR-246: Project Details overview shows project identity and creation information. Steps: Click "Project Details". Inspect the overview information. Expected: The overview shows "Project ID" as "#<refId>", "Created at" as the configured DATE_TIME, and "Open Tender Event: Yes". [plan: partial]
- GEN-SCR-247: Master QCS uses the defined proposal status labels. Steps: Click "Master QCS". Inspect the proposal status values in the vendor column. Expected: Draft proposals show "Draft", requested proposals show "Approval in Progress", selected proposals show "PO Generated", and rejected proposals show "Rejected". [plan: partial]
- GEN-SCR-360: Project Details shows the project overview values. Steps: Click Project Details. Inspect the overview section. Expected: Project ID shows #1100000401. Created at shows the project creation DATE_TIME. Open Tender Event shows Yes. [plan: partial]
- GEN-SCR-361: Master QCS displays proposal status copy. Steps: Click Master QCS. Inspect the proposal status values. Expected: Draft proposals show Draft. Requested proposals show Approval in Progress. Selected proposals show PO Generated. Rejected proposals show Rejected. [plan: partial]
- GEN-SCR-362: Ask Clara handles an analyze-data task. Steps: Click Ask Clara. Wait for the action to complete. Expected: The message 'Awarding initiated successfully, redirecting to awarding flow...' appears, then the browser navigates to the returned redirect_url. [plan: partial]
- GEN-SCR-363: Copy controls copy the displayed value. Steps: Click Copy. Paste the clipboard value into the text editor. Return to the screen. Click icon: copy. Paste the clipboard value into the text editor. Expected: Each control copies its associated displayed value without changing the page. [plan: none]
