# Screen: master-qcs-rfq-one-bid (/project/Y0ROY1hk/master_qcs)

Captured 2026-10-20 on company 198678. 13 controls, 11 with a known effect, 2 test cases written from it.

## How to reach the master-qcs-rfq-one-bid screen

Plan steps: open_create {"path":"erfx"} → set_title → compose_stages {"stages":["rfq"]} → switch_stage {"stage":"rfq"} → select_template → add_line_items {"count":1} → fill_sheet → set_schedule {"minutes":30} → invite_vendor {"count":1} → publish → expect_published → place_surrogate_bid → expect_bid_submitted → open_master_qcs. Path: `/project/Y0ROY1hk/master_qcs`.
Headings on it: spine-ui-automation-89314326 | QA_Platform Vendor 1 1790820862139 | AAC BLOCKS •1100000401 •Variant 1.

## What each control on master-qcs-rfq-one-bid does

- **Ask Clara** (button): Starts Clara's analysis for the current project or bid. Affects: May initiate the awarding flow when Clara returns an awarding redirect URL.. Leads to: Clara analysis or the returned awarding flow. Rule R-FLA-017-4. Check: Click Ask Clara and verify that Clara starts processing and, for an awarding action, the awarding-success message and redirect appear.
- **Create New Version** (button): Creates a new version of the project. Affects: Creates a new draft project version while preserving the source project's event structure.. Leads to: the project creation screen. Rule R-FLA-019-3. Check: Click Create New Version and verify that a new-version creation screen opens with the project context loaded.
- **Messages** (button): Opens the project's communication hub. Affects: Nothing in the event data or workflow.. Leads to: the messages or chat view. Rule R-FLA-017-3. Check: Click Messages and verify that the communication hub opens for this project.
- **Hide fields** (button): Hides the currently displayed fields or columns. Affects: Only the current screen's field visibility, not the event records.. Leads to: stays here. Check: Click Hide fields and verify that the relevant fields disappear without changing event data.
- **Download Report** (button): Downloads a report for the current Master QCS view. Affects: Nothing in the event data or workflow.. Leads to: stays here. Check: Click Download Report and verify that a report download starts.
- **Start Awarding** (button): Starts awarding for the current lot when awarding is allowed. Affects: Moves the lot from bid comparison toward the awarding stage; a pending bid-justification request may block navigation until it is handled.. Leads to: the awarding flow or a bid-justification modal. Rule R-FLA-028-1. Check: Click Start Awarding and verify that the awarding flow opens, or that the required justification modal appears when a pending request exists.
- **Project Details** (tab): Switches to the Project Details tab. Affects: Changes the displayed project-details stage without changing event data.. Leads to: the Project Details screen. Rule R-FLA-016-5. Check: Click Project Details and verify that the project overview and project-detail panels are shown.
- **RFQ** (tab): Switches to the RFQ tab. Affects: Changes the displayed event stage to the RFQ stage without changing event data.. Leads to: the RFQ screen. Rule R-FLA-016-5. Check: Click RFQ and verify that the RFQ stage content is rendered.
- **Master QCS** (tab): Keeps the Master QCS tab selected and displays its bid-comparison content. Affects: Nothing beyond the current tab selection.. Leads to: stays here. Rule R-FLA-016-5. Check: Verify that Master QCS remains highlighted and its vendor bid content is visible.
- **Project** (link): Navigates back to the project view. Affects: Nothing in the event data or workflow.. Leads to: the project details screen. Check: Click Project and verify that the project details page opens.
- **QA_Platform Vendor 1 1790820862139** (column): Opens the selected vendor's proposal or bid record. Affects: Reads the vendor proposal for this lot and determines whether the next view is awarding, proposal details, or contract details based on its status and available contract record.. Leads to: the awarding screen for a draft proposal, the proposal screen for a non-draft proposal, or contract details when contract UUIDs exist. Rule R-FLA-030-2. Check: Click the vendor column and verify that it opens the route appropriate to the proposal status and contract availability.

Not yet described: "Copy", "icon: copy".

## Test cases written from the master-qcs-rfq-one-bid screen

- GEN-SCR-186: Proposal selection opens the correct route for each proposal type. Steps: Open the Master QCS view for the project with the draft proposal. Click the vendor proposal in "QA_Platform Vendor 1 1790820862139". Repeat with the project containing the non-draft proposal. Repeat with the project containing the non-draft contract proposal. Expected: The draft proposal opens `/awarding/:id?lotNo=`. The non-draft proposal opens `/project/:id/proposal/:proposalUuid?lotNo=`. The non-draft contract opens `/contract-details?contracts_uuids=`. [plan: partial]
- GEN-SCR-187: Proposal status uses the correct display copy. Steps: Open each project in Master QCS. Inspect the proposal status in "QA_Platform Vendor 1 1790820862139". Expected: Draft displays "Draft"; requested displays "Approval in Progress"; selected displays "PO Generated"; rejected displays "Rejected". [plan: partial]
