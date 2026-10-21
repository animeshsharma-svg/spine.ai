# Screen: surrogate-bid-placed (/project/a2dOY1hk/Y3Bwa2Rr)

Captured 2026-10-20 on company 198678. 22 controls, 20 with a known effect, 4 test cases written from it.

## How to reach the surrogate-bid-placed screen

Plan steps: open_create {"path":"erfx"} → set_title → compose_stages {"stages":["rfp","rfq"]} → switch_stage {"stage":"rfp"} → select_template → switch_stage {"stage":"rfq"} → select_template → add_line_items {"count":2} → fill_sheet → switch_stage {"stage":"rfp"} → fill_questionnaires → assign_evaluator → switch_stage {"stage":"rfq"} → set_schedule {"minutes":30} → invite_vendor {"count":1} → publish → expect_published → open_event_settings → press {"key":"Escape"} → open_participants → place_surrogate_bid → expect_bid_submitted. Path: `/project/a2dOY1hk/Y3Bwa2Rr`.
Headings on it: spine-ui-automation-39987139 | 29m : 11s.

## What each control on surrogate-bid-placed does

- **Ask Clara** (button): Clicking Ask Clara opens Clara for the project. Affects: Nothing unless a Clara action is submitted.. Leads to: Clara panel or drawer. Check: Click Ask Clara and verify that the Clara interface opens.
- **Create New Version** (button): Clicking Create New Version starts creating a new version of the project. Affects: Creates a new-version workflow using the current project and draft stage data when permitted by configuration.. Leads to: project creation screen, or an error message if required identifiers are missing. Rule R-FLA-019-3. Check: Click Create New Version and verify that the creation screen opens for an allowed project.
- **Messages** (button): Clicking Messages opens the project's communication hub. Affects: Nothing in the event data.. Leads to: messages or communication screen. Rule R-FLA-017-3. Check: Click Messages and verify that the project's communication interface opens.
- **Settings** (button): Clicking Settings opens the project settings interface. Affects: Nothing until a setting is changed and saved.. Leads to: settings screen or drawer. Check: Click Settings and verify that project settings are displayed.
- **Add Price Cap** (button): Clicking Add Price Cap opens the price-cap entry interface. Affects: May add or configure a price cap for the RFQ after the value is submitted.. Leads to: price-cap dialog or drawer. Check: Click Add Price Cap and verify that a price-cap form appears.
- **close** (button): Clicking close closes the currently open dialog or drawer. Affects: Nothing in the event data or flow.. Leads to: stays here. Check: Open the related dialog or drawer, click close, and verify that it disappears.
- **Project Details** (tab): Clicking Project Details switches to the project details view. Affects: Only the displayed project-details view.. Leads to: Project Details tab. Check: Click Project Details and verify that its content is displayed.
- **Technical Stage** (tab): Clicking Technical Stage switches to the technical-stage view. Affects: Only the displayed project stage view.. Leads to: Technical Stage tab. Check: Click Technical Stage and verify that the technical-stage content is displayed.
- **RFQ** (tab): Clicking RFQ switches to the RFQ stage view. Affects: Only the displayed RFQ stage view.. Leads to: RFQ tab. Check: Verify that RFQ is selected and its content is displayed.
- **Master QCS** (tab): Clicking Master QCS switches to the Master QCS view. Affects: Only the displayed Master QCS view.. Leads to: Master QCS tab. Check: Click Master QCS and verify that its content is displayed.
- **Responses** (tab): Clicking Responses switches to the project's responses view. Affects: Only the displayed responses view.. Leads to: Responses tab. Check: Click Responses and verify that the responses content is displayed.
- **Overview** (tab): Clicking Overview switches to the overview section of the selected stage. Affects: Only the displayed stage section.. Leads to: Overview tab. Check: Click Overview and verify that the overview content is displayed.
- **Participants** (tab): Clicking Participants switches to the participants section of the selected stage. Affects: Only the displayed participant list and controls.. Leads to: Participants tab. Check: Verify that Participants is selected and the vendor table is visible.
- **Analytics** (tab): Clicking Analytics switches to the analytics section of the selected stage. Affects: Only the displayed analytics view.. Leads to: Analytics tab. Check: Click Analytics and verify that analytics content is displayed.
- **Price Trends** (tab): Clicking Price Trends switches to the price-trends section of the selected stage. Affects: Only the displayed price-trends view.. Leads to: Price Trends tab. Check: Click Price Trends and verify that price-trend content is displayed.
- **Participant Remarks** (tab): Clicking Participant Remarks switches to the participant-remarks section of the selected stage. Affects: Only the displayed participant remarks view.. Leads to: Participant Remarks tab. Check: Click Participant Remarks and verify that participant remarks are displayed.
- **Project** (link): Clicking Project navigates to the project details page. Affects: Nothing in the event data or flow.. Leads to: project details page. Check: Click Project and verify that the project details page is shown.
- **Search vendors** (field): Entering text in Search vendors filters the participant list after a 300 millisecond debounce. Affects: Only the displayed vendor rows and their matching participant data.. Leads to: stays here. Rule R-FLA-024-5. Check: Enter a vendor name and verify that matching rows appear after the debounce interval.
- **Filter by city** (select): Selecting a city in Filter by city filters the participant list to vendors from that city. Affects: Only the displayed vendor rows.. Leads to: stays here. Check: Select a city and verify that only vendors from that city are shown.
- **Show only selected vendors Filter by city** (switch): Toggling Show only selected vendors changes whether the participant list is restricted to selected vendors. Affects: Only the displayed vendor rows and not the event's saved participant data.. Leads to: stays here. Check: Toggle the switch and verify that the list changes between selected vendors only and all matching vendors.

Not yet described: "Copy", "icon: copy".

## Test cases written from the surrogate-bid-placed screen

- GEN-SCR-240: Selected-vendor switch changes the participant list. Steps: Confirm the switch is on. Record the vendors shown. Turn the switch off. Compare the vendor list with the recorded list. Turn the switch on again. Expected: With the switch on, only selected vendors are shown. With the switch off, the list can include unselected vendors. Turning it on again restores the selected-vendor view. [plan: partial]
- GEN-SCR-241: Ask Clara starts the awarding flow. Steps: Click Ask Clara. Wait for the action to finish. Expected: The message "Awarding initiated successfully, redirecting to awarding flow..." appears, and the browser navigates to the returned redirect URL. [plan: partial]
- GEN-SCR-242: Add Price Cap opens its price-cap interface. Steps: Click Add Price Cap. Expected: The price-cap configuration interface opens without navigating away from the project details page. [plan: full]
- GEN-SCR-243: Messages and Settings open their respective panels. Steps: Click Messages. Verify the messages interface opens. Return to the project details screen. Click Settings. Expected: Messages opens the project's messaging interface. Settings opens the project's settings interface. [plan: partial]
