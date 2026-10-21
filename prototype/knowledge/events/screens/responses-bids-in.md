# Screen: responses-bids-in (/project/a1pjY1hk/Y05aa2Rr)

Captured 2026-10-20 on company 198678, with the event in state "bid". 38 controls, 33 with a known effect, 9 test cases written from it.

## How to reach the responses-bids-in screen

Plan steps: open_prepared {"screen":"responses"}. Path: `/project/a1pjY1hk/Y05aa2Rr`.
Headings on it: spine-API-automation-32666437 | 59m : 25s | QA_Platform Vendor 1 1790820862139 | Other Charges.

## What each control on responses-bids-in does

- **Copy** (button): Copies the current project or page link. Affects: nothing. Leads to: stays here. Check: Click Copy and verify that a project link is available on the clipboard.
- **icon: copy** (button): Copies the associated value to the clipboard. Affects: nothing. Leads to: stays here. Check: Click the copy icon and verify that the associated value is available in the clipboard.
- **Ask Clara** (button): Opens the Clara assistance interface for this project. Affects: nothing unless an available Clara action is run. Leads to: Clara panel or drawer. Check: Click Ask Clara and verify that the Clara interface opens.
- **Create New Version** (button): Creates a new version of the project when version creation is allowed. Affects: Creates a new project-version draft and carries the project and stage data into the creation flow.. Leads to: project creation screen. Rule R-FLA-019-3. Check: Click Create New Version when enabled and verify that the creation screen opens with the project data populated.
- **Messages** (button): Opens the project communication area. Affects: nothing. Leads to: messages or communication hub. Rule R-FLA-017-3. Check: Click Messages and verify that the communication interface opens when communication is allowed.
- **Settings** (button): Opens project or event settings. Affects: nothing until a setting is changed. Leads to: settings panel or screen. Check: Click Settings and verify that the settings interface opens.
- **View by Product** (button): Changes the response display to group or organize data by product. Affects: Changes only the current response view, not the event records.. Leads to: stays here. Check: Click View by Product and verify that the response layout is grouped by product.
- **Actions** (button): Opens the available event actions menu. Affects: nothing until an action is selected. Leads to: actions menu. Rule R-FLA-019-1. Check: Click Actions and verify that the available action options are displayed.
- **Hide fields** (button): Opens controls for hiding or showing response fields. Affects: Changes field visibility in the current view without changing event data.. Leads to: field visibility menu or drawer. Check: Click Hide fields and verify that field visibility options appear.
- **vertical-switch** (button): Switches the response layout to the vertical orientation. Affects: Changes the current display orientation only.. Leads to: stays here. Check: Click the vertical switch and verify that the response layout changes to vertical.
- **horizontal-switch** (button): Switches the response layout to the horizontal orientation. Affects: Changes the current display orientation only.. Leads to: stays here. Check: Click the horizontal switch and verify that the response layout changes to horizontal.
- **Counter Offer** (button): Starts the counter-offer action for the displayed bid. Affects: Begins a counter-offer flow that may create or update a counter-offer record for the vendor response.. Leads to: counter-offer dialog or drawer. Check: Click Counter Offer and verify that a counter-offer form or confirmation opens.
- **AAC BLOCKS** (button): Selects or opens the AAC BLOCKS line item. Affects: The active line-item or bid-detail context.. Leads to: stays here or opens line-item details. Check: Click AAC BLOCKS and verify that the AAC BLOCKS item becomes active or its details open.
- **Gurgaon** (button): Selects or opens the Gurgaon location value. Affects: The active line-item or bid-detail context.. Leads to: stays here or opens location details. Check: Click Gurgaon and verify that the Gurgaon value is selected or its details open.
- **Project Details** (tab): Opens the Project Details tab. Affects: Changes the selected project-details section.. Leads to: Project Details screen. Check: Click Project Details and verify that the project details content is shown.
- **RFQ** (tab): Selects the RFQ stage tab. Affects: Changes the active event stage whose details and responses are displayed.. Leads to: RFQ stage content. Check: Verify that RFQ is highlighted and its content remains displayed.
- **Master QCS** (tab): Opens the Master QCS tab. Affects: Changes the selected project-details section to the master QCS view.. Leads to: Master QCS screen. Rule R-FLA-016-5. Check: Click Master QCS and verify that the master QCS content is shown.
- **Responses** (tab): Selects the Responses section for the RFQ stage. Affects: Changes the displayed RFQ subview to vendor responses and bids.. Leads to: Responses view. Check: Verify that Responses is highlighted and the bid response table is displayed.
- **Overview** (tab): Opens the RFQ Overview section. Affects: Changes the displayed RFQ subview from responses to overview information.. Leads to: Overview view. Check: Click Overview and verify that RFQ overview information is displayed.
- **Participants** (tab): Opens the RFQ Participants section. Affects: Changes the displayed RFQ subview to participant information.. Leads to: Participants view. Rule R-FLA-024-1. Check: Click Participants and verify that the participant list is displayed.
- **Analytics** (tab): Opens the RFQ Analytics section. Affects: Changes the displayed RFQ subview to analytics.. Leads to: Analytics view. Check: Click Analytics and verify that RFQ analytics are displayed.
- **Price Trends** (tab): Opens the RFQ Price Trends section. Affects: Changes the displayed RFQ subview to price-trend information.. Leads to: Price Trends view. Check: Click Price Trends and verify that price-trend information is displayed.
- **Participant Remarks** (tab): Opens the RFQ Participant Remarks section. Affects: Changes the displayed RFQ subview to participant remarks.. Leads to: Participant Remarks view. Check: Click Participant Remarks and verify that participant remarks are displayed.
- **Project** (link): Navigates through the Project breadcrumb link. Affects: Nothing in the current event data.. Leads to: project-level screen or project list. Check: Click Project and verify that the linked project-level destination opens.
- **QA_Platform Vendor 1 1790820862139 21 October 2026 02:22 AM Supplier Revision Counter Offe** (column): Sorts or otherwise controls the response column headed by the vendor and counter-offer information. Affects: Changes the response table ordering or view, not the bid record.. Leads to: stays here. Check: Click the column header and verify whether the response rows reorder or the header state changes.
- **S no.** (column): Displays the serial-number column for response line items. Affects: Nothing; it only labels the response table.. Leads to: stays here. Check: Verify that each response row has a serial number under “S no.”.
- **Product** (column): Displays the product column containing the requested product or item. Affects: Nothing; it only labels product data in the response table.. Leads to: stays here. Check: Verify that each response row shows its product under “Product”.
- **Quantity Requested** (column): Displays the requested-quantity column for each line item. Affects: Nothing; it only labels requested quantity data.. Leads to: stays here. Check: Verify that each response row shows the requested quantity under “Quantity Requested”.
- **Delivery location** (column): Displays the delivery-location column for each line item. Affects: Nothing; it only labels delivery-location data.. Leads to: stays here. Check: Verify that each response row shows its delivery location under “Delivery location”.
- **Price** (column): Displays the vendor response price for each line item. Affects: Nothing; it only labels price data in the bid response.. Leads to: stays here. Check: Verify that each response row shows a bid price under “Price”.
- **Quantity Available** (column): Displays the quantity available offered by the vendor for each line item. Affects: Nothing; it only labels available-quantity data.. Leads to: stays here. Check: Verify that each response row shows the vendor’s available quantity under “Quantity Available”.
- **GST** (column): Displays the GST amount or value associated with each bid line item. Affects: Nothing; it only labels GST data in the response table.. Leads to: stays here. Check: Verify that each response row shows GST under “GST”.
- **Total Amount** (column): Displays the calculated total amount for each bid line item. Affects: Nothing; it only labels total-amount data in the response table.. Leads to: stays here. Check: Verify that each response row shows its total amount under “Total Amount”.

Not yet described: "1 / 1 100%", "29 KG", "₹ 115 /KG", "–", "₹ 3,335".

## Test cases written from the responses-bids-in screen

- GEN-SCR-127: Open the Messages panel. Steps: Click "Messages". Expected: A Messages panel or drawer opens without leaving the project. [plan: partial]
- GEN-SCR-128: Open the Actions menu. Steps: Click "Actions". Expected: An actions menu opens. [plan: full]
- GEN-SCR-129: Change the response table view by product. Steps: Click "View by Product". Expected: The response table changes to the product-based view and remains on the Responses screen. [plan: partial]
- GEN-SCR-130: Open a new project version flow. Steps: Click "Create New Version". Expected: A create-new-version flow opens. No new version is created without further confirmation. [plan: partial]
- GEN-SCR-131: Verify Overview project details. Steps: Click "Project Details". Expected: The overview shows Project ID as "#<refId>" and Created at as a date and time. "Open Tender Event: Yes" appears only when the open-tender configuration is enabled. [plan: partial]
- GEN-SCR-256: Open project messages. Steps: Click "Messages". Expected: The project messages view or drawer opens. [plan: partial]
- GEN-SCR-257: Open project settings. Steps: Click "Settings". Expected: The project settings view or menu opens. [plan: full]
- GEN-SCR-258: Open the actions menu. Steps: Click "Actions". Expected: An actions menu opens and lists the available project actions. No action is executed automatically. [plan: partial]
- GEN-SCR-259: Switch from responses to project details. Steps: Click "Project Details". Expected: The Project Details section opens, and "Project Details" is shown as selected. [plan: partial]
