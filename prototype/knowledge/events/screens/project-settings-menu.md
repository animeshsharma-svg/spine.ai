# Screen: project-settings-menu (/project/TlhjY1hk/WGtja2Rr)

Captured 2026-10-21 on company 198678. 24 controls, 21 with a known effect, 8 test cases written from it.

## How to reach the project-settings-menu screen

Plan steps: open_create {"path":"erfx"} → set_title → compose_stages {"stages":["rfp","rfq"]} → switch_stage {"stage":"rfp"} → select_template → switch_stage {"stage":"rfq"} → select_template → add_line_items {"count":2} → fill_sheet → switch_stage {"stage":"rfp"} → fill_questionnaires → assign_evaluator → switch_stage {"stage":"rfq"} → set_schedule {"minutes":30} → invite_vendor {"count":1} → publish → expect_published → open_event_settings. Path: `/project/TlhjY1hk/WGtja2Rr`.
Headings on it: spine-ui-automation-84442217 | 29m : 41s.
It shows: No bids placed yet.Click hereto view response template..

## What each control on project-settings-menu does

- **Copy** (button): Copies the displayed project information to the clipboard. Affects: Nothing in the event record changes.. Leads to: Stays here. Check: Click Copy and verify that the expected project information is available in the clipboard.
- **Ask Clara** (button): It asks Clara to analyze the project data. Affects: Clara starts the awarding analysis flow and may initiate awarding.. Leads to: the awarding flow or the returned redirect URL. Rule R-FLA-017-4. Check: Click Ask Clara and verify the awarding analysis response and redirect behavior.
- **Create New Version** (button): It starts creating a new version of the project. Affects: A new editable project version is created from the current project.. Leads to: the project creation screen. Rule R-FLA-019-3. Check: Click Create New Version and verify the create screen opens with the new-version context.
- **Messages** (button): It opens the project communication hub. Affects: Nothing in the event data changes.. Leads to: the Messages view or chat drawer. Rule R-FLA-017-3. Check: Click Messages and verify the project communication interface opens.
- **Settings** (button): It opens the project settings view. Affects: Nothing in the event data changes until a setting is edited.. Leads to: the project settings view. Check: Click Settings and verify the project settings interface is displayed.
- **Actions** (button): It opens the project actions menu. Affects: Nothing in the event data changes.. Leads to: the actions menu. Rule R-FLA-019-1. Check: Click Actions and verify the available project actions are listed.
- **Click here** (button): It opens the response template. Affects: Nothing in the event data changes.. Leads to: the response template view. Check: Click Click here and verify the response template is displayed.
- **Project Details** (tab): It switches to the Project Details tab. Affects: The displayed project-details section changes to the details tab.. Leads to: the Project Details tab on this page. Rule R-FLA-016-5. Check: Click Project Details and verify its content is rendered and the tab becomes selected.
- **Technical Stage** (tab): It switches to the Technical Stage tab. Affects: The displayed stage content changes to the technical-stage event.. Leads to: the Technical Stage tab on this page. Rule R-FLA-016-5. Check: Click Technical Stage and verify the technical-stage content is rendered.
- **RFQ** (tab): It switches to the RFQ tab. Affects: The displayed stage content changes to the RFQ event.. Leads to: the RFQ tab on this page. Rule R-FLA-016-5. Check: Click RFQ and verify the RFQ-stage content is rendered.
- **Master QCS** (tab): It switches to the Master QCS tab. Affects: The displayed content changes to the master QCS view.. Leads to: the Master QCS tab on this page. Rule R-FLA-016-5. Check: Click Master QCS and verify the master QCS content is rendered.
- **Responses** (tab): It switches the selected stage subtab to Responses. Affects: The stage details display changes to response data.. Leads to: the Responses view on this page. Rule R-FLA-016-5. Check: Click Responses and verify response content is displayed and the tab is selected.
- **Overview** (tab): It switches the selected stage subtab to Overview. Affects: The stage details display changes to overview information.. Leads to: the Overview view on this page. Rule R-FLA-016-5. Check: Click Overview and verify overview information is displayed and the tab is selected.
- **Participants** (tab): It switches the selected stage subtab to Participants. Affects: The stage details display changes to participant data.. Leads to: the Participants view on this page. Rule R-FLA-016-5. Check: Click Participants and verify the participants panel is displayed and the tab is selected.
- **Participant Remarks** (tab): It switches the selected stage subtab to Participant Remarks. Affects: The stage details display changes to participant remarks.. Leads to: the Participant Remarks view on this page. Rule R-FLA-016-5. Check: Click Participant Remarks and verify participant remarks are displayed and the tab is selected.
- **Shared With** (menuitem): It opens the list of users or teams the project is shared with. Affects: Nothing in the event data changes.. Leads to: the Shared With drawer or view. Check: Select Shared With and verify the sharing information is displayed.
- **Extend Submission Time** (menuitem): It opens a form to extend the submission deadline. Affects: A later save can change the event's submission timing.. Leads to: the Extend Submission Time dialog. Check: Select Extend Submission Time and verify the deadline-extension dialog opens.
- **Withdraw** (menuitem): It opens the withdrawal confirmation form. Affects: A later confirmation can change the project status to withdrawn and submit withdrawal remarks or attachments.. Leads to: the Withdraw Project dialog. Rule R-FLA-020-1. Check: Select Withdraw and verify the withdrawal dialog opens with its confirmation control.
- **Order Activity** (menuitem): It opens the project's order activity history. Affects: Nothing in the event data changes.. Leads to: the Order Activity view or drawer. Check: Select Order Activity and verify order-related activity is displayed.
- **Edit Evaluation Time** (menuitem): It opens a form to edit the evaluation time. Affects: A later save can change the event's evaluation schedule.. Leads to: the Edit Evaluation Time dialog. Check: Select Edit Evaluation Time and verify the evaluation-time editor opens.
- **Project** (link): It navigates to the parent Project page. Affects: Nothing in the event data changes.. Leads to: the project page. Check: Click Project and verify the parent project page opens.

Not yet described: "icon: copy", "0 / 186 0%", "Request for Re-evaluation".

## Test cases written from the project-settings-menu screen

- GEN-SCR-233: Open the response template from the no-bids message. Steps: Click "Click here". Expected: The response template opens. [plan: partial]
- GEN-SCR-234: Open the withdrawal confirmation without completing withdrawal. Steps: Click "Actions". Click "Withdraw". Inspect the withdrawal dialog without entering a remark or adding an attachment. Expected: The withdrawal dialog opens. "Withdrawal Remarks" is marked with *. The confirmation action is disabled while the remark is blank and no attachment is added. [plan: partial]
- GEN-SCR-235: Keep Request for Re-evaluation disabled when the screen has no eligible response. Steps: Click "Actions". Inspect "Request for Re-evaluation". Expected: "Request for Re-evaluation" is disabled and cannot be selected. [plan: full]
- GEN-SCR-236: Start Clara data analysis and follow its redirect. Steps: Click "Ask Clara". Expected: The message "Awarding initiated successfully, redirecting to awarding flow..." appears, then the browser navigates to the returned redirect_url. [plan: partial]
- GEN-SCR-347: Open the Actions menu and view the withdrawal confirmation. Steps: Click "Actions". Click "Withdraw". Do not confirm the withdrawal. Expected: A withdrawal confirmation dialog opens. The project is not withdrawn. [plan: partial]
- GEN-SCR-348: Verify Request for Re-evaluation is disabled. Steps: Click "Actions". Observe "Request for Re-evaluation". Try to click "Request for Re-evaluation". Expected: "Request for Re-evaluation" is visibly disabled and cannot be selected. No dialog or navigation opens. [plan: full]
- GEN-SCR-349: Open the response template from the no-bids message. Steps: Click "Click here". Expected: The response template opens. [plan: none]
- GEN-SCR-350: Start Clara analysis for an analyze_data task. Steps: Click "Ask Clara". Expected: The message "Awarding initiated successfully, redirecting to awarding flow..." appears, then the browser navigates to the returned redirect URL. [plan: none]
