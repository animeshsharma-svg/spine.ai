# Screen: participants-live (/project/a2dOY1hk/Y3Bwa2Rr)

Captured 2026-10-20 on company 198678. 20 controls, 17 with a known effect, 3 test cases written from it.

## How to reach the participants-live screen

Plan steps: open_create {"path":"erfx"} → set_title → compose_stages {"stages":["rfp","rfq"]} → switch_stage {"stage":"rfp"} → select_template → switch_stage {"stage":"rfq"} → select_template → add_line_items {"count":2} → fill_sheet → switch_stage {"stage":"rfp"} → fill_questionnaires → assign_evaluator → switch_stage {"stage":"rfq"} → set_schedule {"minutes":30} → invite_vendor {"count":1} → publish → expect_published → open_event_settings → press {"key":"Escape"} → open_participants. Path: `/project/a2dOY1hk/Y3Bwa2Rr`.
Headings on it: spine-ui-automation-39987139 | 29m : 21s.
It shows: No bids placed yet.Click hereto view response template..

## What each control on participants-live does

- **Ask Clara** (button): Opens the Clara assistant for this project. Affects: nothing. Leads to: Clara panel or dialog. Check: Click Ask Clara and verify that the Clara interface opens.
- **Create New Version** (button): Starts creating a new version of the project. Affects: Creates a new editable project version when the configuration permits it.. Leads to: project creation screen. Rule R-FLA-019-3. Check: Click Create New Version and verify that the new-version creation screen opens or an error is shown when required identifiers are missing.
- **Messages** (button): Opens the project's communication messages. Affects: nothing. Leads to: messages or communication drawer. Rule R-FLA-017-3. Check: Click Messages and verify that the project conversation opens.
- **Settings** (button): Opens project settings. Affects: nothing. Leads to: settings screen or drawer. Check: Click Settings and verify that project settings are displayed.
- **Actions** (button): Opens the available project actions menu. Affects: Exposes configured actions such as withdrawal, ownership change, or cloning without changing the project until an action is selected.. Leads to: actions menu. Rule R-FLA-019-1. Check: Click Actions and verify that the available configured project actions are listed.
- **Click here** (button): Opens the response template referenced by the no-bids message. Affects: nothing. Leads to: response template view. Check: Click Click here and verify that the response template for the event is displayed.
- **Project Details** (tab): Switches to the Project Details stage tab. Affects: Changes the displayed project-details stage without changing event data.. Leads to: Project Details view. Rule R-FLA-016-5. Check: Click Project Details and verify that the project-details view is rendered.
- **Technical Stage** (tab): Switches to the Technical Stage tab. Affects: Changes the displayed technical-stage view without changing event data.. Leads to: Technical Stage view. Rule R-FLA-016-5. Check: Click Technical Stage and verify that the technical-stage content is rendered.
- **RFQ** (tab): Keeps or switches the project to the RFQ stage. Affects: Changes the displayed stage view without changing RFQ event data.. Leads to: RFQ view. Rule R-FLA-016-5. Check: Click RFQ and verify that the RFQ tab remains selected and its content is displayed.
- **Master QCS** (tab): Switches to the Master QCS tab. Affects: Changes the displayed master-QCS view without changing event data.. Leads to: Master QCS view. Rule R-FLA-016-5. Check: Click Master QCS and verify that the master-QCS content is rendered.
- **Responses** (tab): Displays the RFQ Responses subtab. Affects: Changes the displayed RFQ response panel without changing bids or participants.. Leads to: Responses view. Check: Verify that Responses is selected and the response content is visible.
- **Overview** (tab): Switches to the RFQ Overview subtab. Affects: Changes the displayed RFQ information panel without changing event data.. Leads to: Overview view. Check: Click Overview and verify that the RFQ overview content is displayed.
- **Participants** (tab): Switches to the RFQ Participants subtab. Affects: Changes the displayed participant panel without changing participant records.. Leads to: Participants view. Rule R-FLA-024-1. Check: Click Participants and verify that the participant list is displayed.
- **Analytics** (tab): Switches to the RFQ Analytics subtab. Affects: Changes the displayed analytics panel without changing event data.. Leads to: Analytics view. Check: Click Analytics and verify that the analytics content is displayed.
- **Price Trends** (tab): Switches to the RFQ Price Trends subtab. Affects: Changes the displayed price-trends panel without changing bid data.. Leads to: Price Trends view. Check: Click Price Trends and verify that the price-trends content is displayed.
- **Participant Remarks** (tab): Switches to the RFQ Participant Remarks subtab. Affects: Changes the displayed participant-remarks panel without changing remarks.. Leads to: Participant Remarks view. Check: Click Participant Remarks and verify that participant remarks are displayed.
- **Project** (link): Navigates through the Project breadcrumb link. Affects: nothing. Leads to: project list or project-level page. Check: Click Project and verify that the linked project-level page opens.

Not yet described: "Copy", "icon: copy", "0 / 1 0%".

## Test cases written from the participants-live screen

- GEN-SCR-237: Create New Version opens the cloning flow. Steps: Click "Create New Version". Expected: A cloning modal opens and says "Cloning is supported only for the Technical and RFQ stages." Do not confirm the clone. [plan: full]
- GEN-SCR-238: Ask Clara starts awarding when an analyze_data todo exists. Steps: Click "Ask Clara". Expected: The message "Awarding initiated successfully, redirecting to awarding flow..." appears, then the page navigates to the returned redirect URL. [plan: partial]
- GEN-SCR-239: RFQ returns to the RFQ Responses view. Steps: Click the "RFQ" tab. Click the "Responses" tab. Expected: The RFQ Responses view opens. The no-bids message is visible: "No bids placed yet.Click hereto view response template." [plan: full]
