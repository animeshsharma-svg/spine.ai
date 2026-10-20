# Screen: create-line-items (/orders/quick-create)

Captured 2026-10-20 on company 198678. 27 controls, 27 with a known effect, 3 test cases written from it.

## How to reach the create-line-items screen

Plan steps: (unknown). Path: `/orders/quick-create`.

## What each control on create-line-items does

- **Ask Clara** (button): Opens the Clara AI assistant panel for the project. Affects: loads AI suggestions based on current line items. Leads to: Clara side‑panel drawer. Rule R-FCR-042-4. Check: Verify that clicking the button displays the Clara panel and shows AI‑generated questions.
- **Add Attachments** (button): Opens a file‑picker dialog to attach files to the project. Affects: adds attachment objects to `terms_and_conditions.attachments` in the draft payload. Leads to: stays here (dialog opens). Rule R-FCR-008-3. Check: Select a file and confirm it appears in the attachment list.
- **Add T&Cs** (button): Opens a modal to add or edit terms and conditions text. Affects: populates `terms_and_conditions.clauses` in the draft payload. Leads to: stays here (modal opens). Rule R-FCR-008-3. Check: Enter text, save and verify it is reflected in the T&C preview area.
- **Items 1** (button): Adds a new empty line‑item row to the items table. Affects: creates a new line‑item object with status `draft` in the UI state. Leads to: stays here. Rule R-FCR-014-4. Check: Click the button and confirm a new row appears with required columns highlighted.
- **Save as draft** (button): Saves the current project as a draft. Affects: POSTs or PATCHes the event_group with `status:"draft"` and stores stage UUIDs. Leads to: stays here (toast shown). Rule R-FCR-014-4. Check: After click, verify a success toast and that the draft can be reopened later.
- **Publish** (button): Publishes the project (or sends it to the auction team). Affects: PATCHes the event_group with `status:"active"` (or sends to auction team) and may create stage records. Leads to: redirects to project details or event view depending on type. Rule R-FCR-019-1. Check: Click Publish, ensure required validations run and a success message appears.
- **RFQ** (button): Switches the mode to RFQ (if not already). Affects: sets event mode to RFQ; may warn that existing data will be reset. Leads to: stays here. Rule R-FCR-029-6. Check: When clicked, verify a warning appears and after confirming, the UI shows RFQ‑specific fields.
- **Buy Template** (button): Opens the template selector to choose a pre‑filled project template. Affects: loads template data into the form; may reset existing line items after confirmation. Leads to: template selection drawer. Rule R-FCR-026-4. Check: Select a template and confirm the line‑item table is populated accordingly.
- **Add Columns** (button): Adds custom columns to the line‑item table. Affects: updates UI column configuration; does not change backend data until saved. Leads to: stays here (column picker dialog). Check: Choose a column and verify it appears in the table header.
- **Details** (button): Opens the project details drawer (title, description, etc.). Affects: allows editing of project metadata which will be sent on save. Leads to: details drawer. Rule R-FCR-008-1. Check: Edit the title and confirm the change is reflected in the title field.
- **Price Components** (button): Opens the price‑components editor for the selected line item. Affects: adds or edits price component objects that affect the `price` column calculation. Leads to: price components modal. Check: Add a component and verify the total price column updates.
- **Participants** (button): Opens the participants management drawer. Affects: adds/removes vendor participants which are stored in `audience_company_uuids`. Leads to: participants drawer. Rule R-FCR-002-4. Check: Invite a vendor and ensure it appears in the participants list.
- **Savings** (button): Shows the savings calculation panel. Affects: calculates and displays potential savings based on line‑item pricing; does not persist until publish. Leads to: stays here (panel expands). Check: Verify that the panel displays a numeric savings value after line items are entered.
- **Terms & Conditions** (button): Navigates to the Terms & Conditions section (scrolls down). Affects: nothing. Leads to: stays here (page scroll). Check: Click and confirm the view jumps to the T&C area.
- **Now - 12:50 am, 21st Oct ( 30 Mins )** (button): Opens the schedule drawer to set start time, duration and end time. Affects: sets `stage.start` and `stage.end` values used on publish. Leads to: schedule drawer. Rule R-FCR-022-7. Check: Change the time and verify the displayed end time updates accordingly.
- **RFQ** (tab): Selects the RFQ tab (already selected). Affects: nothing (already active). Leads to: stays here. Check: Tab is highlighted as active; clicking again does not change view.
- **Events** (link): Navigates to the Events list page. Affects: nothing. Leads to: Events list screen. Check: Click and verify the URL changes to `/events` and the list loads.
- **Enter the title of the project** (field): Allows the buyer to type the project title. Affects: sets the `title` field in the draft payload. Leads to: stays here. Rule R-FCR-008-1. Check: Enter text and confirm it appears in the title input.
- **Search vendors you want to add** (select): Searches and selects vendors to add as participants. Affects: populates `audience_company_uuids` with selected vendor IDs. Leads to: stays here (dropdown list). Rule R-FCR-002-4. Check: Search for a vendor, select it, and verify it appears in the participants list.
- **Product** (column): Displays the required Product column for each line item. Affects: must be filled before saving/publishing; stored as `product_uuid` per line item. Leads to: stays here. Rule R-FCR-014-4. Check: Leave the column empty and attempt to publish; verify validation error appears.
- **Product Variant** (column): Displays the required Product Variant column for each line item. Affects: stores `product_quality_uuid` per line item; locked when created from PR. Leads to: stays here. Rule R-FCR-015-2. Check: Edit a variant and ensure the change is reflected in the UI and payload.
- **Quantity Requested** (column): Allows entry of the quantity requested for each line item. Affects: stores `quantity.value` and `quantity.unitSymbol` in the line‑item payload. Leads to: stays here. Rule R-FCR-014-4. Check: Enter a number and verify the value is saved after Save as draft.
- **Delivery location** (column): Allows entry of the delivery location for each line item. Affects: stores location data in the line‑item object. Leads to: stays here. Check: Select a location and confirm it appears in the column.
- **Price** (column): Displays the price column (editable if allowed). Affects: stores `price` per line item; influences total amount calculation. Leads to: stays here. Rule R-FCR-044-4. Check: Edit a price and verify total amount updates.
- **Quantity Available** (column): Shows the quantity available column (read‑only). Affects: displays supplier‑provided available quantity; not persisted by buyer. Leads to: stays here. Check: Confirm the column is populated from backend data and cannot be edited.
- **GST** (column): Shows the GST (tax) column for each line item. Affects: adds tax information to the line‑item payload if edited. Leads to: stays here. Check: Enter a GST rate and verify total amount reflects tax.
- **Total Amount** (column): Displays the calculated total amount for each line item. Affects: computed from price, quantity and GST; not directly editable. Leads to: stays here. Rule R-FCR-044-4. Check: Change price or quantity and verify total amount updates accordingly.

## Test cases written from the create-line-items screen

- GEN-SCR-052: Publish with empty project title displays validation error. Steps: Click the 'Publish' button. Expected: The system stops execution and displays the error message 'Please fill project title!'. [plan: full]
- GEN-SCR-053: Add Attachments modal opens successfully. Steps: Click the 'Add Attachments' button. Expected: The file attachment drawer or modal opens allowing document uploads. [plan: full]
- GEN-SCR-054: Save event progress as draft. Steps: Click the 'Save as draft' button. Expected: The project is saved successfully as a draft and a success confirmation is displayed. [plan: full]
