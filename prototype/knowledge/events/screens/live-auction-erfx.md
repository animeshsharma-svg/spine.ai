# Screen: live-auction-erfx (/project/Y0RnY1hk/master_qcs)

Captured 2026-10-20 on company 198678. 13 controls, 10 with a known effect, 5 test cases written from it.

## How to reach the live-auction-erfx screen

Plan steps: open_create {"path":"erfx"} → set_title → compose_stages {"stages":["auction"]} → switch_stage {"stage":"auction"} → select_template → add_line_items {"count":1} → fill_sheet → set_schedule {"minutes":30} → invite_vendor {"count":1} → publish → expect_published → place_surrogate_bid → expect_bid_submitted → open_master_qcs. Path: `/project/Y0RnY1hk/master_qcs`.
Headings on it: spine-ui-automation-93344232 | QA_Platform Vendor 1 1790820862139 | AAC BLOCKS •1100000401 •Variant 1.

## What each control on live-auction-erfx does

- **Ask Clara** (button): It opens the Clara assistant for the current project. Affects: It may start an analysis or awarding-related assistant flow, but does not directly change the event record.. Leads to: Clara assistant. Check: Click Ask Clara and verify that the Clara interface opens for this project.
- **Create New Version** (button): It starts creating a new version of the project. Affects: It creates a new project-version draft context without changing the current version.. Leads to: project creation screen. Rule R-FLA-019-3. Check: Click Create New Version when version creation is allowed and verify that the creation screen opens with the current project context.
- **Messages** (button): It opens the project communication hub. Affects: Nothing in the event data changes; it only opens project messaging.. Leads to: messages or chat panel. Rule R-FLA-017-3. Check: Click Messages and verify that the communication interface opens when communication is allowed.
- **Hide fields** (button): It hides the available QCS fields or columns. Affects: Only the current Master QCS view is changed; event and bid data remain unchanged.. Leads to: stays here. Check: Click Hide fields and verify that the QCS fields are no longer displayed.
- **Start Awarding** (button): It starts the awarding flow for the current lot. Affects: It moves the project from bid comparison toward awarding and may open a bid-justification dialog when a pending justification request exists.. Leads to: awarding flow or bid-justification dialog. Rule R-FLA-029-1. Check: Click Start Awarding and verify that the awarding screen opens, or that the justification dialog appears when a pending bid-justification request exists.
- **Project Details** (tab): It switches to the Project Details tab. Affects: Nothing in the event record changes; the displayed project-details stage changes.. Leads to: Project Details screen. Rule R-FLA-016-5. Check: Click Project Details and verify that the project details view is rendered.
- **Auction** (tab): It switches to the Auction tab. Affects: Nothing in the event record changes; the displayed event stage changes to Auction.. Leads to: Auction screen. Rule R-FLA-016-5. Check: Click Auction and verify that the Auction stage view is rendered.
- **Master QCS** (tab): It keeps or switches the view to the Master QCS tab. Affects: Nothing in the event record changes; it selects the Master QCS view.. Leads to: stays here. Rule R-FLA-016-5. Check: Verify that Master QCS is selected and its contents remain visible.
- **Project** (link): It navigates to the project-level details view. Affects: Nothing in the event record changes; only the displayed project screen changes.. Leads to: Project Details screen. Rule R-FLA-016-5. Check: Click Project and verify that the project details page opens.
- **QA_Platform Vendor 1 1790820862139** (column): It opens the selected vendor's bid or proposal details. Affects: Nothing in the event record changes; it navigates to the vendor's proposal record for this lot.. Leads to: vendor proposal or contract details screen. Rule R-FLA-030-2. Check: Click the vendor column and verify that the corresponding proposal or contract details screen opens based on its status.

Not yet described: "Copy", "icon: copy", "Download Report".

## Test cases written from the live-auction-erfx screen

- GEN-SCR-172: Proposal column opens the correct destination for each proposal status. Steps: Click the proposal column for the draft proposal. Return to the Master QCS. Click the proposal column for the non-draft proposal. Return to the Master QCS. Click the proposal column for the contract proposal. Expected: The draft proposal opens `/awarding/:id?lotNo=`. The non-draft proposal opens `/project/:id/proposal/:proposalUuid?lotNo=`. The non-draft contract opens `/contract-details?contracts_uuids=`. [plan: partial]
- GEN-SCR-173: Ask Clara redirects after analyze-data processing. Steps: Click "Ask Clara". Wait for the Clara action to complete. Expected: The message "Awarding initiated successfully, redirecting to awarding flow..." appears, then the browser navigates to the returned `redirect_url`. [plan: partial]
- GEN-SCR-174: Project Details shows overview values and conditional open-tender status. Steps: Click "Project Details". Locate the project overview. Repeat with the configuration disabled. Expected: The overview shows Project ID as `#<refId>` and Created at as the supplied DATE_TIME. Open Tender Event shows Yes only when `is_show_under_open_events` is enabled. [plan: none]
- GEN-SCR-175: Master QCS panel headers show response counts. Steps: Click "Master QCS". Inspect the Line Items and Participants panel headers. Expected: The Line Items header shows the line-item response count, and the Participants header shows the participant response count. [plan: partial]
- GEN-SCR-176: Long or withdrawn project tabs show the correct tab presentation. Steps: Open the project tabs. Hover over the long stage tab. Inspect the withdrawn stage tab. Expected: The long tab title is truncated to 20 characters and its tooltip contains the full title. The `in_active` stage displays a Withdrawn tag. [plan: partial]
