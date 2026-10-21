# Screen: project-settings-menu (/project/a2dOY1hk/Y3Bka2Rr)

Captured 2026-10-20 on company 198678. 24 controls, 22 with a known effect, 4 test cases written from it.

## How to reach the project-settings-menu screen

Plan steps: open_create {"path":"erfx"} → set_title → compose_stages {"stages":["rfp","rfq"]} → switch_stage {"stage":"rfp"} → select_template → switch_stage {"stage":"rfq"} → select_template → add_line_items {"count":2} → fill_sheet → switch_stage {"stage":"rfp"} → fill_questionnaires → assign_evaluator → switch_stage {"stage":"rfq"} → set_schedule {"minutes":30} → invite_vendor {"count":1} → publish → expect_published → open_event_settings. Path: `/project/a2dOY1hk/Y3Bka2Rr`.
Headings on it: spine-ui-automation-39987139 | 29m : 51s.
It shows: No bids placed yet.Click hereto view response template..

## What each control on project-settings-menu does

- **Copy** (button): Copies the displayed project information to the clipboard. Affects: Nothing in the event record changes.. Leads to: Stays here. Check: Click Copy and verify that the expected project information is available in the clipboard.
- **Ask Clara** (button): Opens the Clara assistant for the project. Affects: Nothing changes unless Clara performs an action on the event.. Leads to: Clara assistant. Check: Click Ask Clara and verify that the Clara interface opens.
- **Create New Version** (button): Starts creating a new version of the project. Affects: Creates a new editable project version using the existing project context.. Leads to: Project creation screen. Rule R-FLA-019-3. Check: Click Create New Version and verify that the project creation screen opens with the existing project data.
- **Messages** (button): Opens the project's communication messages. Affects: Nothing in the event record changes.. Leads to: Messages or communication hub. Check: Click Messages and verify that the project's conversation view opens.
- **Settings** (button): Opens the project settings view. Affects: Nothing in the event record changes.. Leads to: Project settings. Check: Click Settings and verify that the settings view is displayed.
- **Actions** (button): Opens the project actions menu. Affects: Nothing until an action is selected.. Leads to: Actions menu. Rule R-FLA-019-1. Check: Click Actions and verify that the available project actions are listed.
- **0 / 1 0%** (button): Opens the response progress represented by the 0 / 1 and 0% indicator. Affects: Nothing in the event record changes.. Leads to: Response progress or responses view. Check: Click the progress indicator and verify that the corresponding response details are shown.
- **Click here** (button): Opens the response template. Affects: Nothing in the event record changes.. Leads to: Response template view. Check: Click Click here and verify that the response template opens.
- **Project Details** (tab): Switches to the Project Details tab. Affects: Only the displayed project-details section changes.. Leads to: Project Details tab. Check: Click Project Details and verify that project detail information is displayed.
- **Technical Stage** (tab): Displays the selected Technical Stage response section. Affects: Only the active stage and its response content shown on screen change.. Leads to: Technical Stage tab. Rule R-FLA-016-5. Check: Click Technical Stage and verify that its response content is displayed and the tab is selected.
- **RFQ** (tab): Switches to the RFQ stage tab. Affects: Only the active stage and its displayed content change.. Leads to: RFQ tab. Rule R-FLA-016-5. Check: Click RFQ and verify that the RFQ stage content is displayed.
- **Master QCS** (tab): Switches to the Master QCS tab. Affects: Only the displayed project stage content changes.. Leads to: Master QCS tab. Rule R-FLA-016-5. Check: Click Master QCS and verify that the Master QCS content is displayed.
- **Responses** (tab): Displays the responses for the selected stage. Affects: Only the active response subsection changes.. Leads to: Responses subsection. Check: Click Responses and verify that vendor response content is displayed and the tab is selected.
- **Overview** (tab): Switches to the stage overview subsection. Affects: Only the displayed stage information changes.. Leads to: Overview subsection. Rule R-FLA-018-1. Check: Click Overview and verify that the stage overview is displayed.
- **Participants** (tab): Displays the project participants. Affects: Only the participant list view changes.. Leads to: Participants subsection. Rule R-FLA-024-1. Check: Click Participants and verify that the participant list and its response statuses are displayed.
- **Participant Remarks** (tab): Displays remarks provided by participants. Affects: Only the participant remarks view changes.. Leads to: Participant Remarks subsection. Check: Click Participant Remarks and verify that participant remarks are displayed.
- **Shared With** (menuitem): Opens the Shared With view or drawer. Affects: Nothing in the event record changes.. Leads to: Shared With view or drawer. Check: Select Shared With and verify that the users or teams sharing the project are shown.
- **Extend Submission Time** (menuitem): Opens the form for extending the submission time. Affects: If confirmed, it changes the event submission deadline.. Leads to: Extend Submission Time dialog. Check: Select Extend Submission Time and verify that a deadline-extension dialog opens.
- **Withdraw** (menuitem): Opens the withdrawal confirmation form. Affects: If confirmed with a remark or attachment, it changes the project status to withdrawn.. Leads to: Withdraw Project dialog. Rule R-FLA-020-1. Check: Select Withdraw and verify that the withdrawal dialog appears and cannot be confirmed with neither a remark nor an attachment.
- **Order Activity** (menuitem): Opens the project's order activity. Affects: Nothing in the event record changes.. Leads to: Order Activity view or drawer. Check: Select Order Activity and verify that order-related activity for the project is displayed.
- **Edit Evaluation Time** (menuitem): Opens the form for editing the evaluation time. Affects: If saved, it changes the event's evaluation schedule.. Leads to: Edit Evaluation Time dialog. Check: Select Edit Evaluation Time and verify that the evaluation-time editor opens.
- **Project** (link): Navigates back to the project page. Affects: Nothing in the event record changes.. Leads to: Project page. Check: Click Project and verify that the project page opens.

Not yet described: "icon: copy", "Request for Re-evaluation".

## Test cases written from the project-settings-menu screen

- GEN-SCR-233: Open the response template from the no-bids message. Steps: Click "Click here". Expected: The response template opens. [plan: none]
- GEN-SCR-234: Open the withdrawal confirmation without completing withdrawal. Steps: Click "Actions". Click "Withdraw". Inspect the withdrawal dialog without entering a remark or adding an attachment. Expected: The withdrawal dialog opens. "Withdrawal Remarks" is marked with *. The confirmation action is disabled while the remark is blank and no attachment is added. [plan: partial]
- GEN-SCR-235: Keep Request for Re-evaluation disabled when the screen has no eligible response. Steps: Click "Actions". Inspect "Request for Re-evaluation". Expected: "Request for Re-evaluation" is disabled and cannot be selected. [plan: full]
- GEN-SCR-236: Start Clara data analysis and follow its redirect. Steps: Click "Ask Clara". Expected: The message "Awarding initiated successfully, redirecting to awarding flow..." appears, then the browser navigates to the returned redirect_url. [plan: partial]
