# Screen: rfq-live (/project/Y2tYY1hk/details)

Captured 2026-10-20 on company 198678. 60 controls, 59 with a known effect, 3 test cases written from it.

## How to reach the rfq-live screen

Plan steps: open_create {"path":"erfx"} → set_title → compose_stages {"stages":["rfq"]} → select_template → add_line_items {"count":1} → fill_sheet → set_schedule {"minutes":45} → invite_vendor {"count":1} → publish → expect_published. Path: `/project/Y2tYY1hk/details`.
Headings on it: spine-ui-automation-75852948 | Overview | Published Stages | Quotation Templates (2) | Terms & Conditions | Contact Info | Line Items 1 | Participants 1.

## What each control on rfq-live does

- **Copy** (button): Copies the project information associated with this control. Affects: nothing. Leads to: stays here. Check: Click Copy and verify that the expected project information is available in the clipboard or confirmation is shown.
- **Ask Clara** (button): Starts Clara's analysis or assistance flow for the project. Affects: May initiate the awarding flow and use the returned redirect URL.. Leads to: the awarding flow when the analyze_data task succeeds. Rule R-FLA-017-4. Check: Click Ask Clara and verify the expected Clara response or awarding-flow redirect appears.
- **Create New Version** (button): Creates a new version of the project when version creation is allowed. Affects: Creates a new editable project version using the existing project and draft-stage data.. Leads to: the project creation screen. Rule R-FLA-019-3. Check: Click Create New Version and verify the creation screen opens with the project data populated.
- **Messages** (button): Opens the project's communication hub. Affects: nothing. Leads to: the messages or communication screen. Rule R-FLA-017-3. Check: Click Messages and verify the communication hub opens when communication is allowed.
- **Overview** (button): Selects the Overview section. Affects: the visible project-details section. Leads to: the Overview section. Check: Click Overview and verify the overview content is displayed.
- **Published Stages** (button): Selects the Published Stages section. Affects: the visible project-details section. Leads to: the Published Stages section. Check: Click Published Stages and verify the stages table is displayed.
- **RFQ** (button): Selects the RFQ section or stage view. Affects: the visible project-details section. Leads to: the RFQ view. Check: Click RFQ and verify the RFQ content or stage view is displayed.
- **Quotation Templates (2)** (button): Opens the quotation templates section. Affects: the visible project-details section. Leads to: the Quotation Templates section. Rule R-FLA-018-4. Check: Click Quotation Templates and verify two quotation templates are represented by the count tag.
- **Terms & Conditions** (button): Opens the Terms & Conditions section. Affects: the visible project-details section. Leads to: the Terms & Conditions section. Rule R-FLA-018-3. Check: Click Terms & Conditions and verify the available clauses or attachments are shown.
- **Contact Info** (button): Opens the Contact Info section. Affects: the visible project-details section. Leads to: the Contact Info section. Rule R-FLA-018-5. Check: Click Contact Info and verify the buyer name, email, and phone are displayed.
- **Line Items 1** (button): Opens the line-items panel. Affects: the visible project-details panel. Leads to: the Line Items panel. Rule R-FLA-018-4. Check: Click Line Items 1 and verify the line-items panel opens with a count of one.
- **Columns** (button): Opens the column-selection control for the current table. Affects: which table columns are visible. Leads to: a column-selection menu or drawer. Check: Click Columns and verify a control for showing or hiding table columns appears.
- **Participants 1** (button): Opens the participants panel. Affects: the visible project-details panel. Leads to: the Participants panel. Rule R-FLA-018-4. Check: Click Participants 1 and verify the participants panel opens with a count of one.
- **Project Details** (tab): Selects the Project Details tab. Affects: the active top-level project view. Leads to: the Project Details view. Check: Verify Project Details is selected and its content is visible.
- **RFQ** (tab): Selects the RFQ tab. Affects: the active top-level project view. Leads to: the RFQ view. Check: Click RFQ and verify the RFQ tab becomes active and its content is rendered.
- **Master QCS** (tab): Selects the Master QCS tab. Affects: the active top-level project view. Leads to: the Master QCS view. Check: Click Master QCS and verify the Master QCS tab becomes active.
- **Project** (link): Navigates to the parent Project page. Affects: nothing. Leads to: the Project page. Check: Click Project and verify navigation to the parent project page.
- **Search line items** (field): Filters line items using the entered search text after a short debounce. Affects: the displayed line-item rows. Leads to: stays here. Check: Enter a distinctive line-item name and verify only matching line items remain after the search delay.
- **Search participants** (field): Filters participants using the entered search text after 300 milliseconds. Affects: the displayed participant rows. Leads to: stays here. Rule R-FLA-024-5. Check: Enter a distinctive vendor name and verify matching participant rows appear after 300 milliseconds.
- **Stage Code** (column): Displays the stage code for each published stage. Affects: nothing. Leads to: stays here. Rule R-FLA-026-1. Check: Verify a stage-code value is shown for rows that have a ref_id and the column is omitted when no row has one.
- **Stage Title** (column): Displays the title of each published stage. Affects: nothing. Leads to: stays here. Rule R-FLA-026-1. Check: Verify each published-stage row shows its stage title.
- **Pending Actions** (column): Displays pending actions for each published stage. Affects: nothing. Leads to: stays here. Rule R-FLA-026-1. Check: Verify the Pending Actions value is rendered for each applicable stage row.
- **Participants** (column): Displays the active and total participant counts for each published stage. Affects: nothing. Leads to: stays here. Rule R-FLA-026-1. Check: Verify participant counts use the active/total format and missing counts display as zero.
- **Bidding Starts At** (column): Displays the bidding start date and time for each stage. Affects: nothing. Leads to: stays here. Rule R-FLA-026-1. Check: Verify a valid start timestamp is formatted as date-time and missing data displays as a hyphen.
- **Bidding Ends At** (column): Displays the bidding end date and time for each stage. Affects: nothing. Leads to: stays here. Rule R-FLA-026-1. Check: Verify a valid end timestamp is formatted as date-time and missing data displays as a hyphen.
- **Sheet Name** (column): Displays the sheet name associated with each stage. Affects: nothing. Leads to: stays here. Check: Verify the Sheet Name column shows the expected sheet value for applicable rows.
- **Actions** (column): Displays available actions for each published-stage row. Affects: the selected stage action and potentially the event flow. Leads to: the selected action's screen, drawer, dialog, or event state. Rule R-FLA-026-2. Check: Verify the Actions cell exposes the expected action for a stage and that selecting it follows the corresponding flow.
- **S No.** (column): Displays the serial number for each participant row. Affects: nothing. Leads to: stays here. Rule R-FLA-024-1. Check: Verify participant rows are numbered sequentially in the S No. column.
- **Line Item Name** (column): Displays the name of each line item. Affects: nothing. Leads to: stays here. Check: Verify each line-item row shows its line-item name.
- **Attachment** (column): It displays the Attachment column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the Attachment header is visible.
- **Material Code** (column): It displays the Material Code column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the Material Code header is visible.
- **Category** (column): It displays the Category column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the Category header is visible.
- **Requisitioner Name** (column): It displays the Requisitioner Name column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the Requisitioner Name header is visible.
- **Requirement Tracking Number** (column): It displays the Requirement Tracking Number column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the Requirement Tracking Number header is visible.
- **Fund Center** (column): It displays the Fund Center column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the Fund Center header is visible.
- **WBS** (column): It displays the WBS column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the WBS header is visible.
- **PR Creator** (column): It displays the PR Creator column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the PR Creator header is visible.
- **PR Creator Phone** (column): It displays the PR Creator Phone column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the PR Creator Phone header is visible.
- **PR Creator Email** (column): It displays the PR Creator Email column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the PR Creator Email header is visible.
- **Subcategory** (column): It displays the Subcategory column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the Subcategory header is visible.
- **Quantity** (column): It displays the Quantity column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the Quantity header is visible.
- **PR No** (column): It displays the PR No column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the PR No header is visible.
- **Item No** (column): It displays the Item No column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the Item No header is visible.
- **Item Text** (column): It displays the Item Text column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the Item Text header is visible.
- **Last PO Vendor Code** (column): It displays the Last PO Vendor Code column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the Last PO Vendor Code header is visible.
- **Last PO Vendor Name** (column): It displays the Last PO Vendor Name column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the Last PO Vendor Name header is visible.
- **Last PO NO** (column): It displays the Last PO NO column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the Last PO NO header is visible.
- **Last PO Quantity** (column): It displays the Last PO Quantity column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the Last PO Quantity header is visible.
- **Last PO Price** (column): It displays the Last PO Price column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the Last PO Price header is visible.
- **Last PO Creation Date** (column): It displays the Last PO Creation Date column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the Last PO Creation Date header is visible.
- **Assigned User** (column): It displays the Assigned User column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the Assigned User header is visible.
- **Received Date** (column): It displays the Received Date column for line-item data. Affects: nothing. Leads to: stays here. Check: Scroll to the line-items table and verify that the Received Date header is visible.
- **Vendor Name** (column): It displays the Vendor Name column in the participants table. Affects: nothing. Leads to: stays here. Rule R-FLA-024-1. Check: Scroll to the participants table and verify that the Vendor Name header is visible.
- **Vendor Code** (column): It displays the Vendor Code column in the participants table. Affects: nothing. Leads to: stays here. Rule R-FLA-024-1. Check: Scroll to the participants table and verify that the Vendor Code header is visible.
- **Location** (column): It displays the Location column in the participants table. Affects: nothing. Leads to: stays here. Rule R-FLA-024-1. Check: Scroll to the participants table and verify that the Location header is visible.
- **Type** (column): It displays the Type column in the participants table. Affects: nothing. Leads to: stays here. Rule R-FLA-024-1. Check: Scroll to the participants table and verify that the Type header is visible.
- **Tags** (column): It displays the Tags column in the participants table. Affects: nothing. Leads to: stays here. Rule R-FLA-024-1. Check: Scroll to the participants table and verify that the Tags header is visible.
- **Reason for not participating** (column): It displays the Reason for not participating column in the participants table. Affects: nothing. Leads to: stays here. Rule R-FLA-024-1. Check: Scroll to the participants table and verify that the Reason for not participating header is visible.
- **RFQ** (column): It displays the RFQ column for event data. Affects: nothing. Leads to: stays here. Check: Scroll to the relevant table and verify that the RFQ header is visible.

Not yet described: "icon: copy".

## Test cases written from the rfq-live screen

- GEN-SCR-152: Published stages show the correct columns and fallback values. Steps: Click "Published Stages". Inspect the stage table headers and row values. Expected: "Stage Code" is not shown. The table shows "Stage Title", "Pending Actions", "Participants", "Bidding Starts At", and "Bidding Ends At". A missing participant count displays as "0". Missing bidding dates display as "-". [plan: partial]
- GEN-SCR-153: Valid project detail tabs switch to their content. Steps: Click "RFQ". Inspect the page content. Click "Master QCS". Inspect the page content. Click "Project Details". Expected: Each selected tab renders its corresponding content. Returning to "Project Details" renders the project details screen again. [plan: partial]
- GEN-SCR-154: Create New Version opens the supported clone explanation. Steps: Click "Create New Version". Inspect the dialog. Expected: A cloning dialog opens and says "Cloning is supported only for the Technical and RFQ stages." Do not confirm the clone. [plan: full]
