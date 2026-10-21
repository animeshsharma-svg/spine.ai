# Screen: master-qcs-live (/project/a2dOY1hk/master_qcs)

Captured 2026-10-20 on company 198678. 14 controls, 11 with a known effect, 4 test cases written from it.

## How to reach the master-qcs-live screen

Plan steps: open_create {"path":"erfx"} → set_title → compose_stages {"stages":["rfp","rfq"]} → switch_stage {"stage":"rfp"} → select_template → switch_stage {"stage":"rfq"} → select_template → add_line_items {"count":2} → fill_sheet → switch_stage {"stage":"rfp"} → fill_questionnaires → assign_evaluator → switch_stage {"stage":"rfq"} → set_schedule {"minutes":30} → invite_vendor {"count":1} → publish → expect_published → open_event_settings → press {"key":"Escape"} → open_participants → place_surrogate_bid → expect_bid_submitted → open_master_qcs. Path: `/project/a2dOY1hk/master_qcs`.
Headings on it: spine-ui-automation-39987139 | QA_Platform Vendor 1 1790820862139 | AAC BLOCKS •1100000401 •Variant 1.

## What each control on master-qcs-live does

- **Ask Clara** (button): It asks Clara to analyze the event data and, when successful, starts the awarding flow. Affects: It creates or advances the Clara analyze_data task and moves the event into the awarding flow.. Leads to: the redirect URL returned by Clara. Rule R-FLA-017-4. Check: Click Ask Clara and verify the success message appears before the app navigates to the returned awarding URL.
- **Create New Version** (button): It creates a new version of the project when version creation is allowed. Affects: It creates a new project version and carries the project into the version-creation flow.. Leads to: the project creation screen. Rule R-FLA-019-3. Check: Click Create New Version and verify the creation screen opens with the new-version project context.
- **Messages** (button): It opens the messages area for the project. Affects: It only changes the displayed messaging view and does not change event records.. Leads to: a messages drawer or screen. Check: Click Messages and verify that the project messaging interface opens.
- **Hide fields** (button): It hides the currently displayed fields. Affects: It changes only the visible field presentation on the Master QCS screen.. Leads to: stays here. Check: Click Hide fields and verify that the fields are no longer visible without changing their values.
- **Download Report** (button): It downloads a report for the displayed Master QCS data. Affects: It produces a report file without changing the event, proposals, or award state.. Leads to: stays here. Check: Click Download Report and verify that a report download starts while the event remains unchanged.
- **Start Awarding** (button): It starts awarding for the current lot when awarding is permitted. Affects: It moves the lot from bid review toward the awarding stage, but project state can block the action.. Leads to: the awarding flow. Rule R-FLA-028-2. Check: With all awarding prerequisites satisfied, click Start Awarding and verify that the awarding screen opens; repeat with a blocking condition and verify it is disabled.
- **Project Details** (tab): It switches to the Project Details tab. Affects: It changes the current project-details view without changing event data.. Leads to: the Project Details screen. Check: Click Project Details and verify that the project overview replaces Master QCS.
- **Technical Stage** (tab): It switches to the Technical Stage tab. Affects: It changes the active stage view without changing event data.. Leads to: the Technical Stage screen. Check: Click Technical Stage and verify that the technical-stage content is displayed.
- **RFQ** (tab): It switches to the RFQ tab. Affects: It changes the active stage view without changing event data.. Leads to: the RFQ screen. Check: Click RFQ and verify that the RFQ content is displayed.
- **Master QCS** (tab): It keeps the Master QCS view selected. Affects: It changes no event data and leaves the current Master QCS stage active.. Leads to: stays here. Rule R-FLA-016-5. Check: Verify that Master QCS is highlighted and its proposal or awarding data remains visible.
- **Project** (link): It navigates from the Master QCS view to the project page. Affects: It changes only the current navigation location and does not modify the event.. Leads to: the Project Details screen. Check: Click Project and verify that the project details page opens for the same project.

Not yet described: "Copy", "icon: copy", "QA_Platform Vendor 1 1790820862139".

## Test cases written from the master-qcs-live screen

- GEN-SCR-244: Create New Version opens the supported-stage clone confirmation. Steps: Click "Create New Version". Expected: A clone confirmation modal appears and says "Cloning is supported only for the Technical and RFQ stages." [plan: full]
- GEN-SCR-245: Ask Clara analyzes data and redirects to the returned awarding URL. Steps: Click "Ask Clara". Wait for the analysis request to complete. Expected: The app shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned redirect_url. [plan: partial]
- GEN-SCR-246: Project Details overview shows project identity and creation information. Steps: Click "Project Details". Inspect the overview information. Expected: The overview shows "Project ID" as "#<refId>", "Created at" as the configured DATE_TIME, and "Open Tender Event: Yes". [plan: partial]
- GEN-SCR-247: Master QCS uses the defined proposal status labels. Steps: Click "Master QCS". Inspect the proposal status values in the vendor column. Expected: Draft proposals show "Draft", requested proposals show "Approval in Progress", selected proposals show "PO Generated", and rejected proposals show "Rejected". [plan: partial]
