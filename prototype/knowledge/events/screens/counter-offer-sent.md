# Screen: counter-offer-sent (/project/a1pkY1hk/Y05Ya2Rr)

Captured 2026-10-20 on company 198678, with the event in state "bid". 40 controls, 36 with a known effect, 5 test cases written from it.

## How to reach the counter-offer-sent screen

Plan steps: open_prepared {"screen":"responses"} → place_counter_offer {"price":90} → expect_counter_offer_sent. Path: `/project/a1pkY1hk/Y05Ya2Rr`.
Headings on it: spine-API-automation-82833220 | 59m : 22s | QA_Platform Vendor 1 1790820862139 | Other Charges.

## What each control on counter-offer-sent does

- **Copy** (button): Copies the associated displayed value to the clipboard. Affects: Nothing in the event data or flow.. Leads to: stays here. Check: Click Copy and verify that the expected value is available in the clipboard.
- **icon: copy** (button): Copies the value associated with the copy icon to the clipboard. Affects: Nothing in the event data or flow.. Leads to: stays here. Check: Click the icon and verify that the corresponding value is copied.
- **Create New Version** (button): Starts creating a new version of the project. Affects: Creates a new editable project version from the current project when the configuration allows it.. Leads to: project creation screen. Rule R-FLA-019-3. Check: Click Create New Version and verify that an editable creation screen opens or the configured error appears.
- **Messages** (button): Opens the event communication area. Affects: Nothing in the event data unless a user sends a message.. Leads to: communication hub or chat drawer. Rule R-FLA-017-3. Check: Click Messages and verify that the event conversation opens.
- **Settings** (button): Opens event settings. Affects: Nothing until a setting is changed.. Leads to: settings screen or drawer. Check: Click Settings and verify that the event settings interface opens.
- **View by Product** (button): Switches the response display to a product-based view. Affects: Changes how the current RFQ responses are grouped or displayed without changing event data.. Leads to: stays here. Check: Click View by Product and verify that the response table is grouped by product.
- **Actions** (button): Opens the event actions menu. Affects: Nothing until an action is selected; available actions depend on project configuration.. Leads to: actions menu. Rule R-FLA-019-1. Check: Click Actions and verify that the configured event actions are listed.
- **Hide fields** (button): Hides selected fields from the current table view. Affects: Changes only the visible columns in the current response view.. Leads to: stays here. Check: Click Hide fields and verify that a field-selection control opens.
- **vertical-switch** (button): Switches the table to the vertical layout. Affects: Changes the presentation of response fields without changing event data.. Leads to: stays here. Check: Click vertical-switch and verify that the response layout changes to vertical orientation.
- **horizontal-switch** (button): Switches the table to the horizontal layout. Affects: Changes the presentation of response fields without changing event data.. Leads to: stays here. Check: Click horizontal-switch and verify that the response layout changes to horizontal orientation.
- **1 / 1 100%** (button): Controls the table zoom level and currently shows one page at 100 percent. Affects: Changes only the display scale of the current table.. Leads to: stays here. Check: Click the zoom control and verify that the available zoom or page controls respond.
- **Revoke Counter Offer** (button): Revokes the sent counter offer. Affects: Changes the counter-offer record or event flow from sent to revoked and prevents it from remaining active.. Leads to: revoked counter-offer state or confirmation dialog. Check: Click Revoke Counter Offer and verify that a confirmation or revoked state is shown.
- **₹ 90 /KG ₹ 125 /KG** (button): Displays the submitted and counter-offer rates of ₹90 per KG and ₹125 per KG. Affects: Shows the price comparison for the line item but does not itself change either bid.. Leads to: stays here. Check: Verify that both rate values are displayed for the same line item.
- **0 %** (button): Displays the 0 percent value for the line item. Affects: Shows the associated percentage field without changing event data.. Leads to: stays here. Check: Verify that the percentage value is shown as 0 percent for the line item.
- **₹ 5,940** (button): Displays the amount ₹5,940 for the line item. Affects: Shows the corresponding calculated or submitted amount without changing event data.. Leads to: stays here. Check: Verify that ₹5,940 is displayed for the relevant line-item amount.
- **₹ 8,250** (button): Displays the amount ₹8,250 for the line item. Affects: Shows the corresponding counter-offer or comparison amount without changing event data.. Leads to: stays here. Check: Verify that ₹8,250 is displayed for the relevant comparison amount.
- **–** (button): Displays a dash for an unavailable or empty line-item value. Affects: Nothing in the event data or flow.. Leads to: stays here. Check: Verify that the missing value is rendered as an en dash.
- **Project Details** (tab): Opens the Project Details tab. Affects: Changes the visible project-details section without changing event data.. Leads to: Project Details view. Check: Click Project Details and verify that the project details content is shown.
- **RFQ** (tab): Keeps the RFQ tab selected and shows the RFQ interface. Affects: Changes or preserves the active event stage view without changing event data.. Leads to: RFQ view. Check: Verify that RFQ is marked selected and its content is visible.
- **Master QCS** (tab): Opens the Master QCS tab. Affects: Changes the visible event section to the master comparison or evaluation view.. Leads to: Master QCS view. Check: Click Master QCS and verify that the Master QCS content loads.
- **Responses** (tab): Keeps the Responses tab selected. Affects: Shows vendor response data for the current RFQ stage.. Leads to: Responses view. Check: Verify that Responses is marked selected and the response table is visible.
- **Overview** (tab): Opens the response Overview subtab. Affects: Changes the visible response subsection without changing event data.. Leads to: Overview response view. Check: Click Overview and verify that the overview content is displayed.
- **Participants** (tab): Opens the response Participants subtab. Affects: Changes the visible response subsection to participant information without changing event data.. Leads to: Participants response view. Rule R-FLA-024-1. Check: Click Participants and verify that participant information is displayed.
- **Analytics** (tab): Opens the Analytics subtab. Affects: Changes the visible response subsection to analytics without changing event data.. Leads to: Analytics view. Check: Click Analytics and verify that analytics content is displayed.
- **Price Trends** (tab): Opens the Price Trends subtab. Affects: Changes the visible response subsection to price-trend information without changing event data.. Leads to: Price Trends view. Check: Click Price Trends and verify that price-trend content is displayed.
- **Participant Remarks** (tab): Opens the Participant Remarks subtab. Affects: Changes the visible response subsection to vendor remarks without changing event data.. Leads to: Participant Remarks view. Check: Click Participant Remarks and verify that participant remarks are displayed.
- **Project** (link): Clicking the Project link navigates back to the project view. Affects: nothing. Leads to: project view. Check: Click Project and verify that the project view opens.
- **QA_Platform Vendor 1 1790820862139 21 October 2026 02:32 AM Supplier Revision Revoke Count** (column): The column identifies the vendor, revision date, revision status, and revoke count for the displayed response. Affects: nothing. Leads to: stays here. Check: Verify that the vendor name, revision date, revision status, and revoke count are displayed.
- **S no.** (column): The S no. column displays the serial number of each line item. Affects: nothing. Leads to: stays here. Check: Verify that each line item has a serial number.
- **Product** (column): The Product column displays the product or service for each line item. Affects: nothing. Leads to: stays here. Check: Verify that each row shows its product or service.
- **Quantity Requested** (column): The Quantity Requested column displays the quantity requested for each line item. Affects: nothing. Leads to: stays here. Check: Verify that each row shows the requested quantity.
- **Delivery location** (column): The Delivery location column displays the requested delivery location for each line item. Affects: nothing. Leads to: stays here. Check: Verify that each row shows its delivery location.
- **Price** (column): The Price column displays the vendor's price for each line item. Affects: nothing. Leads to: stays here. Check: Verify that each row shows the submitted price.
- **Quantity Available** (column): The Quantity Available column displays the quantity the vendor can provide for each line item. Affects: nothing. Leads to: stays here. Check: Verify that each row shows the vendor's available quantity.
- **GST** (column): The GST column displays the GST value or rate submitted for each line item. Affects: nothing. Leads to: stays here. Check: Verify that each row shows the applicable GST information.
- **Total Amount** (column): The Total Amount column displays the calculated total amount for each line item. Affects: nothing. Leads to: stays here. Check: Verify that each row shows its total amount.

Not yet described: "Ask Clara", "C AAC BLOCKS", "66 KG", "Gurgaon".

## Test cases written from the counter-offer-sent screen

- GEN-SCR-276: Messages opens the project messaging view. Steps: Click button: "Messages". Expected: The project's messages view or panel opens without leaving the project context. [plan: partial]
- GEN-SCR-277: Settings opens project settings. Steps: Click button: "Settings". Expected: The project settings view or panel opens. [plan: none]
- GEN-SCR-278: Actions opens the available project actions. Steps: Click button: "Actions". Expected: An actions menu opens and shows only actions available for the current project state. [plan: partial]
- GEN-SCR-279: Ask Clara redirects when awarding analysis is requested. Steps: Click button: "Ask Clara". Wait for the request to complete. Expected: The message "Awarding initiated successfully, redirecting to awarding flow..." appears, then the browser navigates to the returned redirect_url. [plan: partial]
- GEN-SCR-280: Project link returns to the project list context. Steps: Click link: "Project". Expected: The project context or project list page opens, and the counter-offer details screen is no longer displayed. [plan: full]
