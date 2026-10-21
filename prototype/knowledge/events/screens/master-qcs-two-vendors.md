# Screen: master-qcs-two-vendors (/project/a1pwY1hk/master_qcs)

Captured 2026-10-20 on company 198678. 14 controls, 10 with a known effect, 5 test cases written from it.

## How to reach the master-qcs-two-vendors screen

Plan steps: open_create {"path":"erfx"} → set_title → compose_stages {"stages":["rfq"]} → switch_stage {"stage":"rfq"} → select_template → add_line_items {"count":3} → fill_sheet → set_schedule {"minutes":30} → invite_vendor {"count":2} → publish → expect_published → place_surrogate_bid → expect_bid_submitted → place_surrogate_bid → expect_bid_submitted → open_master_qcs. Path: `/project/a1pwY1hk/master_qcs`.
Headings on it: spine-ui-automation-56858358 | QA_Platform Vendor 1 1790820862139 | QA_Platform Vendor 2 1790821112465 | AAC BLOCKS •1100000401 •Variant 1 | BACK FILLING •ITM_000213 •Variant 1.

## What each control on master-qcs-two-vendors does

- **Ask Clara** (button): Clicking Ask Clara opens the Clara assistance experience for the project. Affects: It starts an assistance interaction without changing the event record unless a Clara action is subsequently confirmed.. Leads to: Clara panel or dialog. Check: Click Ask Clara and verify that the Clara interface opens.
- **Create New Version** (button): Clicking Create New Version starts creation of a new project version when versioning is allowed. Affects: It creates a new draft version using the project and draft-stage identifiers and enables editing.. Leads to: project creation screen. Rule R-FLA-019-3. Check: Click Create New Version and verify that the creation screen opens with the new version editable.
- **Messages** (button): Clicking Messages opens the project communication hub. Affects: It changes the communication view but does not alter sourcing, bid, or award data.. Leads to: messages or chat panel. Rule R-FLA-017-3. Check: Click Messages and verify that the project conversation interface opens.
- **Hide fields** (button): Clicking Hide fields toggles the visibility of fields in the QCS view. Affects: It changes only the displayed fields and does not change event data.. Leads to: stays here. Check: Toggle Hide fields and verify that the visible field set changes.
- **Download Report** (button): Clicking Download Report starts downloading a report for the displayed QCS. Affects: It creates a report file without changing the event, proposals, or award state.. Leads to: stays here. Check: Click Download Report and verify that a report download starts.
- **Start Awarding** (button): Clicking Start Awarding opens the awarding flow for the lot when awarding is permitted. Affects: It advances the event from bid comparison toward award selection and may open bid-justification instead of navigation when a pending justification exists.. Leads to: awarding flow or bid-justification modal. Rule R-FLA-029-1. Check: Click Start Awarding and verify that the awarding screen opens or the required justification modal appears.
- **Project Details** (tab): Clicking Project Details switches from Master QCS to the project details view. Affects: It changes the selected project-details tab without changing event data.. Leads to: Project Details tab. Check: Click Project Details and verify that the project overview is displayed.
- **RFQ** (tab): Clicking RFQ switches to the RFQ stage view. Affects: It changes the displayed event stage without changing the project record.. Leads to: RFQ tab. Check: Click RFQ and verify that the RFQ stage content is displayed.
- **Master QCS** (tab): Clicking Master QCS keeps the Master QCS view selected. Affects: It changes no event data and retains the vendor comparison view.. Leads to: stays here. Rule R-FLA-016-5. Check: Click Master QCS and verify that it remains selected and the QCS grid is shown.
- **Project** (link): Clicking Project opens the parent project view. Affects: It changes navigation context without changing event data.. Leads to: project details screen. Check: Click Project and verify that the project details page opens.

Not yet described: "Copy", "icon: copy", "QA_Platform Vendor 1 1790820862139", "QA_Platform Vendor 2 1790821112465".

## Test cases written from the master-qcs-two-vendors screen

- GEN-SCR-281: Start awarding from a lot without a proposal. Steps: Click Start Awarding. Expected: The awarding flow opens for the current lot. [plan: full]
- GEN-SCR-282: Open a vendor proposal from the Master QCS. Steps: Click the vendor column for the draft proposal. Return to Master QCS. Click the vendor column for the non-draft proposal. Return to Master QCS. Click the vendor column for the non-draft contract proposal. Expected: The draft proposal opens `/awarding/:id?lotNo=`. The non-draft proposal opens `/project/:id/proposal/:proposalUuid?lotNo=`. The non-draft contract opens `/contract-details?contracts_uuids=`. [plan: partial]
- GEN-SCR-283: Ask Clara analyzes data and redirects. Steps: Click Ask Clara. Expected: The app shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned `redirect_url`. [plan: partial]
- GEN-SCR-284: Hide and restore Master QCS fields. Steps: Click Hide fields. Observe the Master QCS. Click Hide fields again. Expected: The fields are hidden after the first click and visible again after the second click. [plan: partial]
- GEN-SCR-285: Open project messages. Steps: Click Messages. Expected: The project's messages view or panel opens. [plan: partial]
