# Screen: live-technical-auction (/project/Y3BkY1hk/details)

Captured 2026-10-20 on company 198678. 63 controls, 62 with a known effect, 5 test cases written from it.

## How to reach the live-technical-auction screen

Plan steps: open_create {"path":"erfx"} → set_title → compose_stages {"stages":["rfp","auction"]} → switch_stage {"stage":"rfp"} → select_template → fill_questionnaires → assign_evaluator → switch_stage {"stage":"auction"} → select_template → add_line_items {"count":2} → fill_sheet → switch_stage {"stage":"auction"} → set_schedule {"minutes":30} → invite_vendor {"count":1} → publish → expect_published. Path: `/project/Y3BkY1hk/details`.
Headings on it: spine-ui-automation-11547299 | Overview | Published Stages | Quotation Templates (1) | Terms & Conditions | Contact Info | Line Items 2 | Participants 1.

## What each control on live-technical-auction does

- **Copy** (button): Copies the project information represented by the Copy control. Affects: nothing.. Leads to: stays here. Check: Click Copy and verify that the expected project information is available on the clipboard.
- **Ask Clara** (button): Opens Clara for assistance with the project. Affects: nothing unless a Clara action is selected.. Leads to: Clara interface. Check: Click Ask Clara and verify that the Clara interface opens.
- **Create New Version** (button): Starts creation of a new version of the project. Affects: creates a new editable project version when version creation is allowed.. Leads to: project creation screen. Rule R-FLA-019-3. Check: Click Create New Version and verify that the new-version creation screen opens or the configured error appears.
- **Messages** (button): Opens the project communication hub. Affects: nothing.. Leads to: messages or chat interface. Rule R-FLA-017-3. Check: Click Messages and verify that the communication hub opens when communication is allowed.
- **Overview** (button): Shows the project overview section. Affects: nothing.. Leads to: Overview section. Check: Click Overview and verify that the overview content is displayed.
- **Published Stages** (button): Shows the published stages section. Affects: nothing.. Leads to: Published Stages section. Check: Click Published Stages and verify that the published-stage table is displayed.
- **Technical Stage** (button): Opens the Technical Stage view. Affects: nothing.. Leads to: Technical Stage tab. Check: Click Technical Stage and verify that the technical-stage content is shown.
- **Auction** (button): Opens the Auction view. Affects: nothing.. Leads to: Auction tab. Check: Click Auction and verify that the auction content is shown.
- **Quotation Templates (1)** (button): Shows the quotation templates section and its count. Affects: nothing.. Leads to: Quotation Templates section. Check: Click Quotation Templates (1) and verify that the quotation-template content is displayed.
- **Terms & Conditions** (button): Shows the terms and conditions section. Affects: nothing.. Leads to: Terms & Conditions section. Check: Click Terms & Conditions and verify that the terms and conditions content is displayed.
- **Contact Info** (button): Shows the contact information section. Affects: nothing.. Leads to: Contact Info section. Rule R-FLA-018-5. Check: Click Contact Info and verify that the buyer contact information is displayed.
- **Line Items 2** (button): Expands or focuses the line-items panel and shows its response count. Affects: nothing in the event data.. Leads to: Line Items panel. Rule R-FLA-018-4. Check: Click Line Items 2 and verify that the line-items panel opens with count 2.
- **Columns** (button): Opens controls for choosing visible columns. Affects: changes only the table columns shown to the buyer.. Leads to: column chooser. Check: Click Columns and verify that a column-selection control opens.
- **Participants 1** (button): Expands or focuses the participants panel and shows its response count. Affects: nothing in the event data.. Leads to: Participants panel. Rule R-FLA-018-4. Check: Click Participants 1 and verify that the participants panel opens with count 1.
- **Project Details** (tab): Displays the project details tab as the selected tab. Affects: nothing.. Leads to: stays here. Check: Verify that Project Details is selected and its content is visible.
- **Technical Stage** (tab): Switches to the Technical Stage tab. Affects: changes the displayed stage view without changing event data.. Leads to: Technical Stage tab. Check: Click Technical Stage and verify that its tab becomes selected.
- **Auction** (tab): Switches to the Auction tab. Affects: changes the displayed stage view without changing event data.. Leads to: Auction tab. Check: Click Auction and verify that its tab becomes selected.
- **Master QCS** (tab): Switches to the Master QCS tab. Affects: changes the displayed project view without changing event data.. Leads to: Master QCS tab. Check: Click Master QCS and verify that its tab becomes selected.
- **Project** (link): Navigates back to the Project area. Affects: nothing in the event data.. Leads to: Project screen. Check: Click Project and verify that the application navigates to the project destination.
- **Search line items** (field): Filters the line-items table using the entered text after the search is processed. Affects: only the displayed line-item rows.. Leads to: stays here. Check: Enter a distinctive line-item term and verify that matching rows remain visible.
- **Search participants** (field): Filters the participants table using the entered text with a debounced search. Affects: only the displayed participant rows.. Leads to: stays here. Rule R-FLA-024-5. Check: Enter a distinctive participant term and verify that matching rows appear after the debounce delay.
- **Stage Code** (column): Displays the stage-code column for published stages when applicable. Affects: only the table presentation, and the column is omitted when no row has a ref_id.. Leads to: stays here. Rule R-FLA-026-1. Check: Verify that Stage Code is present only when at least one stage row has a ref_id.
- **Stage Title** (column): Displays each published stage title. Affects: only the published-stages table presentation.. Leads to: stays here. Rule R-FLA-026-1. Check: Verify that each published-stage row shows its stage title.
- **Pending Actions** (column): Displays pending actions for each published stage. Affects: only the published-stages table presentation.. Leads to: stays here. Rule R-FLA-026-1. Check: Verify that pending-action values are shown for the stage rows.
- **Participants** (column): Displays the active and total participant counts for each published stage. Affects: only the published-stages table presentation, with missing counts shown as zero.. Leads to: stays here. Rule R-FLA-026-1. Check: Verify that each stage shows its participant count in active/total form and missing values show 0.
- **Bidding Starts At** (column): Displays the bidding start time for each published stage. Affects: only the published-stages table presentation, showing a date-time or a dash.. Leads to: stays here. Rule R-FLA-026-1. Check: Verify that each row shows its bidding start date-time or '-' when absent.
- **Bidding Ends At** (column): Displays the bidding end time for each published stage. Affects: only the published-stages table presentation, showing a date-time or a dash.. Leads to: stays here. Rule R-FLA-026-1. Check: Verify that each row shows its bidding end date-time or '-' when absent.
- **Sheet Name** (column): Displays the sheet name associated with each stage row. Affects: only the published-stages table presentation.. Leads to: stays here. Check: Verify that the Sheet Name column is visible and populated where a sheet name exists.
- **Actions** (column): Displays actions available for each published-stage row. Affects: only the published-stages table presentation.. Leads to: stays here. Check: Verify that the Actions column is visible and contains the available row actions.
- **S No.** (column): Displays the serial-number column for line-item or participant rows. Affects: nothing. Leads to: stays here. Rule R-FLA-024-1. Check: Scroll to the table and verify the header reads S No.
- **Line Item Name** (column): Displays the line-item name column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Line Item Name.
- **Attachment** (column): Displays the attachment column for line items. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Attachment.
- **Material Code** (column): Displays the material-code column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Material Code.
- **Category** (column): Displays the category column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Category.
- **Requisitioner Name** (column): Displays the requisitioner-name column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Requisitioner Name.
- **Requirement Tracking Number** (column): Displays the requirement-tracking-number column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Requirement Tracking Number.
- **Fund Center** (column): Displays the fund-center column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Fund Center.
- **WBS** (column): Displays the WBS column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads WBS.
- **PR Creator** (column): Displays the PR-creator column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads PR Creator.
- **PR Creator Phone** (column): Displays the PR-creator-phone column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads PR Creator Phone.
- **PR Creator Email** (column): Displays the PR-creator-email column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads PR Creator Email.
- **Subcategory** (column): Displays the subcategory column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Subcategory.
- **Quantity** (column): Displays the quantity column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Quantity.
- **PR No** (column): Displays the PR-number column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads PR No.
- **Item No** (column): Displays the item-number column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Item No.
- **Item Text** (column): Displays the item-text column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Item Text.
- **Last PO Vendor Code** (column): Displays the last-PO-vendor-code column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Last PO Vendor Code.
- **Last PO Vendor Name** (column): Displays the last-PO-vendor-name column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Last PO Vendor Name.
- **Last PO NO** (column): Displays the last-PO-number column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Last PO NO.
- **Last PO Quantity** (column): Displays the last-PO-quantity column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Last PO Quantity.
- **Last PO Price** (column): Displays the last-PO-price column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Last PO Price.
- **Last PO Creation Date** (column): Displays the last-PO-creation-date column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Last PO Creation Date.
- **Assigned User** (column): Displays the assigned-user column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Assigned User.
- **Received Date** (column): Displays the received-date column. Affects: nothing. Leads to: stays here. Check: Scroll to the table and verify the header reads Received Date.
- **Vendor Name** (column): Displays the vendor-name column. Affects: nothing. Leads to: stays here. Rule R-FLA-024-1. Check: Scroll to the table and verify the header reads Vendor Name.
- **Vendor Code** (column): Displays the vendor-code column. Affects: nothing. Leads to: stays here. Rule R-FLA-024-1. Check: Scroll to the table and verify the header reads Vendor Code.
- **Location** (column): Displays the location column. Affects: nothing. Leads to: stays here. Rule R-FLA-024-1. Check: Scroll to the table and verify the header reads Location.
- **Type** (column): Displays the participant-type column. Affects: nothing. Leads to: stays here. Rule R-FLA-024-1. Check: Scroll to the table and verify the header reads Type.
- **Tags** (column): Displays the participant-tags column. Affects: nothing. Leads to: stays here. Rule R-FLA-024-1. Check: Scroll to the table and verify the header reads Tags.
- **Reason for not participating** (column): Displays each vendor's reason for not participating. Affects: Nothing; it only presents participant data.. Leads to: stays here. Rule R-FLA-024-1. Check: Verify the participants table includes a column titled "Reason for not participating" and shows the vendor's reason when available.
- **Technical Stage** (column): Displays each vendor's status for the Technical Stage. Affects: Nothing; it only presents the participant's stage status.. Leads to: stays here. Rule R-FLA-024-1. Check: Verify the participants table includes a "Technical Stage" status column and displays "Not Participated" for an invited vendor who has not participated.
- **Auction** (column): Displays each vendor's status for the Auction stage. Affects: Nothing; it only presents the participant's stage status.. Leads to: stays here. Rule R-FLA-024-1. Check: Verify the participants table includes an "Auction" status column and displays the appropriate status for each vendor.

Not yet described: "icon: copy".

## Test cases written from the live-technical-auction screen

- GEN-SCR-177: Verify published stage columns and value formatting. Steps: Click Published Stages. Inspect the project with a stage ref_id. Inspect the project with no stage ref_id. Check the participant and date values. Expected: The table shows Stage Code when at least one row has ref_id and omits it when no row has ref_id. Participants shows active/total, using 0 for a missing value. Missing dates show '-'. Other listed columns are present. [plan: partial]
- GEN-SCR-178: Verify line item and participant count tags. Steps: Inspect the Line Items 2 header. Inspect the Participants 1 header. Expected: The line-item panel header shows a count tag of 2 and the participant panel header shows a count tag of 1. [plan: full]
- GEN-SCR-179: Open a draft RFQ-to-auction stage. Steps: Click Published Stages. Click the Auction stage entry. Inspect the destination screen and URL. Expected: The create screen opens for the draft stage and carries the draftEventId for that stage. No auction-team check prevents the navigation. [plan: partial]
- GEN-SCR-180: Verify overview project identity and open tender visibility. Steps: Click Overview. Inspect the Project ID and Created at values. Check the Open Tender Event value. Repeat with is_show_under_open_events disabled. Expected: Project ID is shown as '#<refId>' and Created at uses DATE_TIME formatting. Open Tender Event shows 'Yes' only when is_show_under_open_events is enabled; it is not shown as Yes when disabled. [plan: partial]
- GEN-SCR-181: Start Clara awarding flow from an analyze-data todo. Steps: Click Ask Clara. Wait for the Clara action to complete. Observe the notification and destination. Expected: The message 'Awarding initiated successfully, redirecting to awarding flow...' appears, then the browser navigates to the returned redirect_url. [plan: partial]
