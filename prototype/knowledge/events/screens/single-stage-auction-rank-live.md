# Screen: single-stage-auction-rank-live (/project/Y2RjY1hk/master_qcs)

Captured 2026-10-20 on company 198678. 13 controls, 9 with a known effect, 4 test cases written from it.

## How to reach the single-stage-auction-rank-live screen

Plan steps: open_create {"path":"single-stage"} → configure_single_stage {"eventType":"auction","auctionSubtype":"rank","awarding":"lot"} → set_title → select_template → add_line_items {"count":1} → fill_sheet → set_schedule {"minutes":30} → invite_vendor {"count":1} → publish → expect_published → place_surrogate_bid → expect_bid_submitted → open_master_qcs. Path: `/project/Y2RjY1hk/master_qcs`.
Headings on it: spine-ui-automation-90642848 | QA_Platform Vendor 1 1790820862139 | AAC BLOCKS •1100000401 •Variant 1.

## What each control on single-stage-auction-rank-live does

- **Ask Clara** (button): Opens Clara so the buyer can ask for assistance or analysis. Affects: nothing unless the buyer submits an action through Clara.. Leads to: Clara drawer or panel. Check: Click Ask Clara and verify that the Clara interface opens.
- **Create New Version** (button): Creates a new version of the project when version creation is allowed. Affects: creates a new project-version draft and carries its editable event and stage data into the create flow.. Leads to: new-version create screen. Rule R-FLA-019-3. Check: Click Create New Version and verify that the create screen opens with the new-version data populated.
- **Messages** (button): Opens the project communication area. Affects: nothing.. Leads to: messages or communication drawer. Rule R-FLA-017-3. Check: Click Messages and verify that the communication interface opens.
- **Hide fields** (button): Hides the displayed fields or columns. Affects: only the current screen's field visibility and not the event data.. Leads to: stays here. Check: Click Hide fields and verify that the configured fields disappear from the view.
- **Start Awarding** (button): Starts the awarding flow when awarding is enabled for the lot. Affects: moves the lot from bid review toward award selection and may require pending bid justification before navigation.. Leads to: awarding flow or bid-justification modal. Rule R-FLA-029-1. Check: With awarding enabled, click Start Awarding and verify that either the awarding screen or the required justification modal opens.
- **Project Details** (tab): Switches to the Project Details tab. Affects: only the active project-details view.. Leads to: Project Details tab. Rule R-FLA-016-5. Check: Click Project Details and verify that the project details content is displayed.
- **spine-ui-automation-...** (tab): Switches to the corresponding event-stage tab. Affects: only the active stage view.. Leads to: the selected stage tab. Rule R-FLA-016-5. Check: Click the stage tab and verify that its stage content is displayed.
- **Master QCS** (tab): Keeps or switches the view to the Master QCS tab. Affects: only the active project-details view.. Leads to: Master QCS tab. Rule R-FLA-016-5. Check: Verify that Master QCS is selected and its bid-comparison content is visible.
- **Project** (link): Navigates back to the project-level view. Affects: nothing in the event data.. Leads to: project view. Check: Click Project and verify that the project-level screen opens.

Not yet described: "Copy", "icon: copy", "Download Report", "QA_Platform Vendor 1 1790820862139".

## Test cases written from the single-stage-auction-rank-live screen

- GEN-SCR-191: Proposal status copy matches each proposal state. Steps: Select the "Master QCS" tab. Review the proposal status beside "QA_Platform Vendor 1 1790820862139". Repeat for each prepared proposal state. Expected: Draft shows "Draft"; requested shows "Approval in Progress"; selected shows "PO Generated"; rejected shows "Rejected". [plan: partial]
- GEN-SCR-192: Vendor proposal opens the correct destination by type and status. Steps: Select the "Master QCS" tab. Select the vendor column for the draft proposal. Return to "Master QCS". Select the vendor column for the non-draft proposal. Return to "Master QCS". Select the vendor column for the non-draft contract. Expected: The draft proposal opens `/awarding/:id?lotNo=`. The non-draft proposal opens `/project/:id/proposal/:proposalUuid?lotNo=`. The non-draft contract opens `/contract-details?contracts_uuids=`. [plan: partial]
- GEN-SCR-193: Project Details overview shows configured project metadata. Steps: Select "Project Details". Review the project overview. Repeat with the configuration disabled. Expected: The overview shows "Project ID" as `#<refId>` and "Created at" as the configured DATE_TIME. "Open Tender Event: Yes" appears only when `is_show_under_open_events` is enabled. [plan: partial]
- GEN-SCR-194: Project details are refetched every 30 seconds while mounted. Steps: Select "Master QCS". Record the initial GET request for the project. Keep the page open for at least 60 seconds. Review the network requests. Expected: A GET request for the project occurs when the page opens and repeats every 30000 ms while the page remains mounted. [plan: partial]
