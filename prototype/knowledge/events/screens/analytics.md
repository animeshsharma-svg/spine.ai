# Screen: analytics (/project/a1pjY1hk/Y05aa2Rr)

Captured 2026-10-20 on company 198678, with the event in state "bid". 38 controls, 37 with a known effect, 7 test cases written from it.

## How to reach the analytics screen

Plan steps: open_prepared {"screen":"responses"} → open_prepared {"screen":"analytics"}. Path: `/project/a1pjY1hk/Y05aa2Rr`.
Headings on it: spine-API-automation-32666437 | 59m : 13s | QA_Platform Vendor 1 1790820862139 | Other Charges.

## What each control on analytics does

- **Copy** (button): Copies the available event or page reference to the clipboard. Affects: nothing.. Leads to: stays here. Check: Click Copy and verify that a clipboard paste contains the expected event reference.
- **icon: copy** (button): Copies the associated value to the clipboard. Affects: nothing.. Leads to: stays here. Check: Click the copy icon and verify that the associated value can be pasted elsewhere.
- **Ask Clara** (button): Asks Clara to analyze the current event data. Affects: the event analysis or awarding flow when Clara returns an action result.. Leads to: the screen returned by Clara, or stays here while processing. Rule R-FLA-017-4. Check: Click Ask Clara and verify that Clara processes the event and displays a result or navigation.
- **Create New Version** (button): Starts creation of a new version of the event. Affects: creates a new draft/version based on the current project when the feature is enabled.. Leads to: the event creation screen. Rule R-FLA-019-3. Check: Click Create New Version and verify that a new-version creation screen opens or the configured error appears.
- **Messages** (button): Opens the event communication hub. Affects: nothing in the event data.. Leads to: the Messages chat view or drawer. Rule R-FLA-017-3. Check: Click Messages and verify that the event conversation opens when communication is allowed.
- **Settings** (button): Opens the event settings. Affects: nothing until a setting is changed.. Leads to: the event settings screen or drawer. Check: Click Settings and verify that event configuration controls are displayed.
- **View by Product** (button): Changes the analytics table grouping to products. Affects: the current analytics view's grouping, not the underlying event records.. Leads to: the product-grouped analytics view. Check: Click View by Product and verify that analytics rows are grouped or displayed by product.
- **Actions** (button): Opens the available actions menu. Affects: nothing until an action is selected.. Leads to: an actions menu. Rule R-FLA-019-1. Check: Click Actions and verify that the available event actions are listed.
- **Hide fields** (button): Hides selectable fields or columns in the analytics table. Affects: only the current table display and visible fields.. Leads to: stays here. Check: Click Hide fields and verify that field-visibility controls appear or selected fields disappear.
- **vertical-switch** (button): Switches the analytics display to the vertical layout. Affects: only the current analytics presentation.. Leads to: the vertical analytics layout. Check: Click the vertical switch and verify that the table or chart changes to vertical orientation.
- **horizontal-switch** (button): Switches the analytics display to the horizontal layout. Affects: only the current analytics presentation.. Leads to: the horizontal analytics layout. Check: Click the horizontal switch and verify that the table or chart changes to horizontal orientation.
- **1 / 1 100%** (button): It changes the analytics canvas zoom level or page view. Affects: Only the current view scale and pagination display.. Leads to: Stays here.. Check: Click 1 / 1 100% and verify that zoom or page-view options are shown.
- **Counter Offer** (button): Selects or opens the Counter Offer response value. Affects: the selected response or counter-offer context in the analytics view.. Leads to: the counter-offer details view or stays here. Check: Click Counter Offer and verify that the corresponding response context or details are selected.
- **AAC BLOCKS** (button): Selects or opens the AAC BLOCKS product value. Affects: the current analytics selection or product filter.. Leads to: the AAC BLOCKS details or filtered view. Check: Click AAC BLOCKS and verify that the AAC BLOCKS record is selected or displayed.
- **29 KG** (button): Selects or opens the 29 KG quantity value. Affects: the current analytics selection for the line-item quantity.. Leads to: the quantity details or filtered view. Check: Click 29 KG and verify that the associated quantity record is selected or displayed.
- **Gurgaon** (button): Selects or opens the Gurgaon location value. Affects: the current analytics selection or location filter.. Leads to: the Gurgaon details or filtered view. Check: Click Gurgaon and verify that the associated location record is selected or displayed.
- **₹ 115 /KG** (button): Selects or opens the ₹ 115 /KG bid value. Affects: the current analytics selection for the submitted unit price.. Leads to: the bid details or filtered view. Check: Click ₹ 115 /KG and verify that the associated bid record is selected or displayed.
- **–** (button): It displays the absence of a value for the associated field. Affects: Nothing.. Leads to: Stays here.. Check: Verify that the field remains represented by a dash when no value is available.
- **₹ 3,335** (button): Selects or opens the ₹ 3,335 total value. Affects: the current analytics selection for the calculated or submitted total.. Leads to: the total details or filtered view. Check: Click ₹ 3,335 and verify that the associated total record is selected or displayed.
- **Project Details** (tab): Opens the Project Details section. Affects: the active project-details section.. Leads to: the Project Details screen. Rule R-FLA-016-5. Check: Click Project Details and verify that project-detail content is displayed.
- **RFQ** (tab): Opens the RFQ section and keeps RFQ selected. Affects: the active sourcing-stage tab.. Leads to: the RFQ view. Rule R-FLA-016-5. Check: Click RFQ and verify that RFQ content remains displayed as the selected stage.
- **Master QCS** (tab): Opens the Master QCS section. Affects: the active project-details section.. Leads to: the Master QCS view. Rule R-FLA-016-5. Check: Click Master QCS and verify that the master QCS content is displayed.
- **Responses** (tab): Opens the Responses view for the selected RFQ stage. Affects: the active RFQ subview.. Leads to: the RFQ Responses screen. Check: Click Responses and verify that vendor responses are displayed and Responses is selected.
- **Overview** (tab): Opens the RFQ overview. Affects: the active RFQ subview.. Leads to: the RFQ Overview screen. Check: Click Overview and verify that the RFQ overview content is displayed.
- **Participants** (tab): Opens the RFQ participants view. Affects: the active RFQ subview.. Leads to: the RFQ Participants screen. Rule R-FLA-024-1. Check: Click Participants and verify that the participant list is displayed.
- **Analytics** (tab): Opens the RFQ analytics view. Affects: the active RFQ subview.. Leads to: the RFQ Analytics screen. Check: Click Analytics and verify that analytics content is displayed.
- **Price Trends** (tab): Opens the RFQ price-trends view. Affects: the active RFQ subview.. Leads to: the Price Trends screen. Check: Click Price Trends and verify that price-trend content is displayed.
- **Participant Remarks** (tab): Opens the RFQ participant-remarks view. Affects: the active RFQ subview.. Leads to: the Participant Remarks screen. Check: Click Participant Remarks and verify that participant remarks are displayed.
- **Project** (link): Navigates back to the project. Affects: nothing in the event data.. Leads to: the project details screen. Check: Click Project and verify that the project details page opens.
- **S no.** (column): It displays the serial number for each line item. Affects: It changes nothing in the event data or flow and only labels the row order.. Leads to: stays here. Check: Verify that each table row shows its serial number under this column.
- **Product** (column): It displays the product associated with each line item. Affects: It changes nothing in the event data or flow and only presents the product value.. Leads to: stays here. Check: Verify that each row shows the correct product name.
- **Quantity Requested** (column): It displays the quantity requested for each line item. Affects: It changes nothing in the event data or flow and only presents the requested quantity.. Leads to: stays here. Check: Verify that the displayed quantity matches the quantity requested for each item.
- **Delivery location** (column): It displays the delivery location for each line item. Affects: It changes nothing in the event data or flow and only presents the delivery location.. Leads to: stays here. Check: Verify that each row shows the correct delivery location.
- **Price** (column): It displays the bid price for each line item. Affects: It changes nothing in the event data or flow and only presents the price value.. Leads to: stays here. Check: Verify that the displayed price matches the corresponding bid.
- **Quantity Available** (column): It displays the quantity available for each line item. Affects: It changes nothing in the event data or flow and only presents the vendor's available quantity.. Leads to: stays here. Check: Verify that the displayed available quantity matches the submitted bid data.
- **GST** (column): It displays the GST value for each line item. Affects: It changes nothing in the event data or flow and only presents the GST amount or rate.. Leads to: stays here. Check: Verify that the GST displayed for each row matches the bid details.
- **Total Amount** (column): It displays the total amount for each line item. Affects: It changes nothing in the event data or flow and only presents the calculated or submitted total amount.. Leads to: stays here. Check: Verify that the total amount shown for each row matches the applicable bid calculation.

Not yet described: "QA_Platform Vendor 1 1790820862139 21 October 2026 02:22 AM Supplier Revision Counter Offe".

## Test cases written from the analytics screen

- GEN-SCR-132: Show response panel count tags. Steps: Click "Responses". Inspect the line-item and participant panel headers. Expected: The panel headers show count tags matching the line-item response count and participant response count. [plan: none]
- GEN-SCR-133: Start Clara awarding analysis. Steps: Click "Ask Clara". Start the available awarding analysis. Expected: The app shows "Awarding initiated successfully, redirecting to awarding flow..." and navigates to the returned redirect URL. [plan: partial]
- GEN-SCR-134: Open project messages. Steps: Click "Messages". Expected: The project messages view or drawer opens without leaving the project screen. [plan: partial]
- GEN-SCR-260: Copy copies the visible project value. Steps: Click "Copy". Paste into a text editor. Expected: The associated value from the screen is pasted into the text editor without changing the page. [plan: none]
- GEN-SCR-261: Ask Clara opens the Clara flow. Steps: Click "Ask Clara". Wait for the response or destination to load. Expected: A Clara analysis or assistance flow opens, and the analytics screen does not show an unhandled error. [plan: partial]
- GEN-SCR-262: Messages opens event messages. Steps: Click "Messages". Expected: The event messages view or drawer opens, showing the messages context for this event. [plan: partial]
- GEN-SCR-263: View by Product changes the response grouping. Steps: Click "View by Product". Observe the response table and visible product grouping. Expected: The response data changes to the product-based view, and the product information remains available without an error. [plan: partial]
