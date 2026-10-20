# Screen: create-erfx (/orders/quick-create)

Captured 2026-10-20 on company 198678. 19 controls, 19 with a known effect, 0 test cases written from it.

## How to reach the create-erfx screen

Plan steps: (unknown). Path: `/orders/quick-create`.
Headings on it: Hello Procol,.
It shows: Please add line items in the manage line items section and choose a template to proceed!.

## What each control on create-erfx does

- **Ask Clara** (button): Opens the AI‑generated RFP helper and sends the project line items to the AI service. Affects: calls `/ask_ai_chats/rfp_questions` and stores the returned AI summary in `claraSummary`.. Leads to: stays here (AI panel appears). Rule R-FCR-042-4. Check: Click the button and verify that the Clara summary panel appears with generated text.
- **Add Attachments** (button): Opens the attachments drawer so the buyer can upload files for the event. Affects: adds uploaded file objects to `terms_and_conditions.attachments`.. Leads to: drawer opens. Check: Click the button and confirm that a file‑upload drawer appears.
- **Add T&Cs** (button): Opens the Terms & Conditions editor where the buyer can type or paste clauses. Affects: populates `terms_and_conditions.clauses` in the request body.. Leads to: dialog opens. Check: Click the button and verify that a T&C text area is displayed.
- **Items 0** (button): Opens the Manage Line Items modal to add, edit or delete line items. Affects: creates/updates the `line_items` array for the project.. Leads to: modal opens. Rule R-FCR-014-3. Check: Click the button and ensure a line‑item table with Add/Edit controls appears.
- **Save as draft** (button, disabled): Attempts to save the current project as a draft, but the control is disabled. Affects: nothing (button is disabled).. Leads to: stays here. Rule R-FCR-024-2. Check: Hover over the button and verify the tooltip "Please choose a template and add a product".
- **Publish** (button): Validates required fields and, if all checks pass, publishes the event (creates stages and makes them active). Affects: sends a POST/PATCH with `status:"active"` and creates the event stages.. Leads to: event is created and the UI redirects to the new event page.. Rule R-FCR-013-1. Check: Click Publish with a title, template and at least one line item; verify the event appears in the Events list.
- **Rank on lot** (button): Toggles the auction to use a lot‑based ranking strategy. Affects: `strategy` is set to `rank` and `closingOn` to `lot_based` in the auction configuration.. Leads to: stays here. Rule R-FCR-009-1. Check: Toggle the button and inspect the payload; it should contain `strategy:"rank"` and `closingOn:"lot_based"`.
- **Select Templates** (button): Opens the template selector drawer; choosing a template replaces the current template and may reset data. Affects: `templateUuid` is set; existing line items, savings, currencies and participants may be cleared.. Leads to: drawer opens; after selection the screen refreshes with the new template.. Rule R-FCR-026-4. Check: Open the selector, pick a different template and confirm a confirmation dialog appears warning about data reset.
- **Participants** (button): Opens the Participants drawer to add vendor companies to the event. Affects: populates `audience_company_uuids` with the selected vendor IDs.. Leads to: drawer opens. Check: Click the button and verify a searchable list of companies appears.
- **Savings** (button, disabled): Button is disabled because savings can only be configured after a template with savings enabled is selected. Affects: nothing (disabled).. Leads to: stays here. Rule R-FCR-024-2. Check: Hover and confirm tooltip "Please choose a template and add a product".
- **Terms & Conditions** (button, disabled): Button is disabled because T&C editing requires a selected template and at least one line item. Affects: nothing (disabled).. Leads to: stays here. Rule R-FCR-024-2. Check: Hover and verify the same tooltip as other disabled footer buttons.
- **Now - 12:50 am, 21st Oct ( 30 Mins )** (button, disabled): Button is disabled because scheduling a custom duration requires a template to be chosen first. Affects: nothing (disabled).. Leads to: stays here. Rule R-FCR-016-2. Check: Hover and verify tooltip "Please select template for <stage title>".
- **Give Feedback** (button): Opens a feedback dialog where the buyer can submit comments about the creation flow. Affects: creates a feedback record (not part of the event payload).. Leads to: dialog opens. Check: Click the button and ensure a modal with a textarea and Submit button appears.
- **View Tickets** (button): Navigates to the Tickets page for the current user. Affects: none (navigation only).. Leads to: Tickets page. Check: Click the button and verify the URL changes to `/tickets` and the tickets list loads.
- **Auction** (tab): Selects the Auction tab, showing auction‑specific configuration options. Affects: sets the UI mode to `auction`; no data change.. Leads to: stays here with Auction tab content displayed. Check: Verify the tab is highlighted and auction fields become visible.
- **Events** (link): Navigates to the main Events list view. Affects: none (navigation).. Leads to: Events list page. Check: Click the link and confirm the URL changes to `/events` and the list loads.
- **View Tickets** (link): Navigates to the Tickets view (duplicate of control 14). Affects: none (navigation).. Leads to: Tickets page. Check: Click the link and verify the Tickets page opens.
- **Enter the title of the project** (field): Accepts user input and stores it as the project title. Affects: `title` field in the project payload.. Leads to: stays here. Rule R-FCR-013-1. Check: Enter text, submit the form, and verify the request body contains the entered title.
- **Search vendors you want to add** (select, disabled): Provides a searchable dropdown to add vendors, but is disabled until a template is selected. Affects: none while disabled.. Leads to: stays here. Rule R-FCR-016-2. Check: Hover and confirm tooltip "Please select template for <stage title>" and that the control cannot be opened.

## Test cases written from the create-erfx screen
