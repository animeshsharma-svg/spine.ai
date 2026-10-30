# Screen: surrogate-bid-placed (/project/TlhjY1hk/WGNRa2Rr)

Captured 2026-10-21 on company 198678. 22 controls, 22 with a known effect, 9 test cases written from it.

## How to reach the surrogate-bid-placed screen

Plan steps: open_create {"path":"erfx"} → set_title → compose_stages {"stages":["rfp","rfq"]} → switch_stage {"stage":"rfp"} → select_template → switch_stage {"stage":"rfq"} → select_template → add_line_items {"count":2} → fill_sheet → switch_stage {"stage":"rfp"} → fill_questionnaires → assign_evaluator → switch_stage {"stage":"rfq"} → set_schedule {"minutes":30} → invite_vendor {"count":1} → publish → expect_published → open_event_settings → press {"key":"Escape"} → open_participants → place_surrogate_bid → expect_bid_submitted. Path: `/project/TlhjY1hk/WGNRa2Rr`.
Headings on it: spine-ui-automation-84442217 | 29m : 30s.

## What each control on surrogate-bid-placed does

- **Copy** (button): Copies the project information associated with the button to the clipboard. Affects: nothing. Leads to: stays here. Check: Click the button and verify that the expected project information is available to paste.
- **icon: copy** (button): Copies the adjacent value or link to the clipboard. Affects: nothing. Leads to: stays here. Check: Click the icon and verify that the adjacent value or link can be pasted elsewhere.
- **Ask Clara** (button): Opens Clara for assistance with the project. Affects: nothing. Leads to: Clara assistant view or drawer. Check: Click Ask Clara and verify that the Clara interface opens.
- **Create New Version** (button): Starts creating a new version of the project. Affects: Creates a new project version from the current project and carries it into the project creation flow.. Leads to: project creation screen. Rule R-FLA-019-3. Check: Click Create New Version and verify that the creation screen opens with the new-version project data.
- **Messages** (button): Opens the project's communication area. Affects: nothing. Leads to: communication hub or chat. Rule R-FLA-017-3. Check: Click Messages and verify that the project's communication interface opens.
- **Settings** (button): Opens project settings. Affects: nothing. Leads to: settings screen or drawer. Check: Click Settings and verify that project settings are displayed.
- **Add Price Cap** (button): Adds a price-cap configuration to the RFQ. Affects: Changes the RFQ pricing configuration used for bidding.. Leads to: price-cap dialog or editor. Check: Click Add Price Cap and verify that a price-cap editor appears.
- **Add Bid** (button): Opens the flow for adding a bid to the RFQ. Affects: Adds or prepares a bid record for the selected RFQ.. Leads to: bid-entry dialog or screen. Check: Click Add Bid and verify that bid-entry controls are displayed.
- **Project Details** (tab): Switches to the project details stage view. Affects: Changes the displayed project stage from the current RFQ stage to project details.. Leads to: Project Details stage view. Rule R-FLA-016-5. Check: Click Project Details and verify that the project-details content is shown.
- **Technical Stage** (tab): Switches to the Technical Stage tab. Affects: Changes the active stage whose details and participant data are displayed.. Leads to: Technical Stage view. Rule R-FLA-016-5. Check: Click Technical Stage and verify that the technical-stage content loads.
- **RFQ** (tab): Keeps or switches the active stage to the RFQ. Affects: Sets the RFQ as the displayed stage and keeps its participant data in view.. Leads to: RFQ view. Rule R-FLA-016-5. Check: Verify that RFQ remains selected and its content is displayed.
- **Master QCS** (tab): Switches to the Master QCS stage view. Affects: Changes the displayed stage to Master QCS.. Leads to: Master QCS view. Rule R-FLA-016-5. Check: Click Master QCS and verify that the Master QCS content loads.
- **Responses** (tab): Opens the project's responses view. Affects: Changes the displayed project section from participants to responses.. Leads to: Responses view. Check: Click Responses and verify that response content is displayed.
- **Overview** (tab): Opens the RFQ overview. Affects: Changes the displayed RFQ subsection to overview information.. Leads to: Overview view. Rule R-FLA-018-1. Check: Click Overview and verify that overview information is displayed.
- **Participants** (tab): Keeps or switches the RFQ subsection to the participants list. Affects: Displays the participant records and their per-stage participation statuses.. Leads to: Participants view. Rule R-FLA-024-1. Check: Verify that Participants is selected and the vendors table is visible.
- **Analytics** (tab): Opens RFQ analytics. Affects: Changes the displayed RFQ subsection to analytics.. Leads to: Analytics view. Check: Click Analytics and verify that analytics content is displayed.
- **Price Trends** (tab): Opens RFQ price trends. Affects: Changes the displayed RFQ subsection to price-trend information.. Leads to: Price Trends view. Check: Click Price Trends and verify that price-trend content is displayed.
- **Participant Remarks** (tab): Opens participant remarks. Affects: Changes the displayed RFQ subsection to participant remarks.. Leads to: Participant Remarks view. Check: Click Participant Remarks and verify that participant remarks are displayed.
- **Project** (link): Navigates back to the project context. Affects: nothing. Leads to: project screen or project list. Check: Click Project and verify that the project-level screen opens.
- **Search vendors** (field): Filters the vendor list by the entered search text after a short debounce. Affects: Changes which participant records are shown without changing vendor data.. Leads to: stays here. Rule R-FLA-024-5. Check: Enter a vendor name and verify that matching rows appear after about 300 milliseconds.
- **Filter by city** (select): Filters the vendor list by the selected city. Affects: Changes which participant records are shown without changing vendor data.. Leads to: stays here. Check: Select a city and verify that only vendors from that city are shown.
- **Show only selected vendors Filter by city** (switch): Toggles whether the participant list shows only selected vendors. Affects: Filters the participant rows to selected vendors when enabled.. Leads to: stays here. Check: Turn the switch on and verify that unselected vendors are removed from the table, then turn it off and verify they return.

## Test cases written from the surrogate-bid-placed screen

- GEN-SCR-240: Selected-vendor switch changes the participant list. Steps: Confirm the switch is on. Record the vendors shown. Turn the switch off. Compare the vendor list with the recorded list. Turn the switch on again. Expected: With the switch on, only selected vendors are shown. With the switch off, the list can include unselected vendors. Turning it on again restores the selected-vendor view. [plan: partial]
- GEN-SCR-241: Ask Clara starts the awarding flow. Steps: Click Ask Clara. Wait for the action to finish. Expected: The message "Awarding initiated successfully, redirecting to awarding flow..." appears, and the browser navigates to the returned redirect URL. [plan: partial]
- GEN-SCR-242: Add Price Cap opens its price-cap interface. Steps: Click Add Price Cap. Expected: The price-cap configuration interface opens without navigating away from the project details page. [plan: partial]
- GEN-SCR-243: Messages and Settings open their respective panels. Steps: Click Messages. Verify the messages interface opens. Return to the project details screen. Click Settings. Expected: Messages opens the project's messaging interface. Settings opens the project's settings interface. [plan: full]
- GEN-SCR-355: Verify Overview project information. Steps: Click tab: "Overview". Expected: The screen shows Project ID as "#<refId>" and Created at as the project DATE_TIME. Open Tender Event shows "Yes" only when is_show_under_open_events is enabled. [plan: partial]
- GEN-SCR-356: Run Clara awarding analysis. Steps: Click button: "Ask Clara". Run the analyze_data todo. Expected: The screen shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned redirect_url. [plan: partial]
- GEN-SCR-357: Create a new project version. Steps: Click button: "Create New Version". Expected: The create screen opens with projectCreation, projectId, draftStageIds, isEditingAllowed=true, and boqProject. [plan: full]
- GEN-SCR-358: Open the price cap entry flow. Steps: Click button: "Add Price Cap". Expected: The price-cap entry interface opens without navigating away from the project screen. [plan: partial]
- GEN-SCR-359: Open project messages. Steps: Click button: "Messages". Expected: The project messages interface opens and the project screen remains available for returning to the current context. [plan: partial]
