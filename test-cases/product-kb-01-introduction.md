# Product KB test cases — Introduction

Generated from the Procol Notion Knowledge Base (help-centre articles) — each case is grounded in the article it traces to. Source pages are read-only; re-derive from Notion rather than editing facts here.

## 1. Discovering the Homepage

#### PRD-KBINT-001 — Home Page shows the seven top summary metrics

- **Why it matters.** The Home Page is the buyer's landing view; the summary metrics are the first read on procurement activity for the period.
- **Setup.** Buyer user signed in to the Procol client dashboard.
- **Steps.**
  1. Open the Home Page (the **Home** item in the left navigation).
  2. Look at the top summary metrics row.
- **Expected.** The metrics shown are Live Events, Total Events, Event Closed, Bids Received, Purchase Value, New Vendors and Engaged Vendors; by default the analytics cover "so far this month".
- **Oracle.** All seven metric labels are visible on the Home Page with a value each.
- **Trace.** P3 · automate-later · `59892226c8b282f8a46501fb9b9cb0ff` · `discovering-the-homepage` · Notion KB › Introduction › Discovering the Homepage

#### PRD-KBINT-002 — Date Filter re-scopes the dashboard data

- **Why it matters.** Metrics such as Total Events are defined over "the selected date range", so the filter must actually drive the numbers.
- **Setup.** Buyer user on the Home Page; account with events in more than one month.
- **Steps.**
  1. Note the metric values for the default range (this month).
  2. Open the top-left date selector and choose a different range.
- **Expected.** Dashboard data is filtered to the chosen range; Total Events reflects events initiated during the selected date range.
- **Oracle.** Metric values change to match the selected range (e.g. Total Events differs when the range covers a different set of events).
- **Trace.** P2 · automate-later · `59892226c8b282f8a46501fb9b9cb0ff` · `discovering-the-homepage` · Notion KB › Introduction › Discovering the Homepage

#### PRD-KBINT-003 — Procurement Trend Chart shows daily purchase value

- **Why it matters.** The trend chart is the Home Page's view of spend over time.
- **Setup.** Buyer user on the Home Page; awarded purchases exist in the selected range.
- **Steps.**
  1. Scroll to the **Procurement Trend Chart**.
- **Expected.** A line area graph showing daily purchase value trends in ₹.
- **Oracle.** Chart is a line area graph with daily points and ₹ values.
- **Trace.** P3 · manual · `59892226c8b282f8a46501fb9b9cb0ff` · `discovering-the-homepage` · Notion KB › Introduction › Discovering the Homepage

#### PRD-KBINT-004 — Spend Analysis by Category / Location

- **Why it matters.** Spend Analysis only renders when there is categorised / location-tagged data, so an empty section can be a data issue rather than a bug.
- **Setup.** Buyer user on the Home Page; closed events with category / location tags in the selected range.
- **Steps.**
  1. Scroll to **Spend Analysis (Category / Location)**.
- **Expected.** The section shows data derived from categorised / location-tagged data in the range: Closed Events, Total Spent Value, Quantity Purchased, Number of bids received.
- **Oracle.** Section is populated for a range with tagged data; tester compares with a range that has none.
- **Trace.** P3 · manual · `59892226c8b282f8a46501fb9b9cb0ff` · `discovering-the-homepage` · Notion KB › Introduction › Discovering the Homepage

#### PRD-KBINT-005 — Left sidebar navigation lists the main modules

- **Why it matters.** The sidebar is the entry point to every module used in later flows.
- **Setup.** Buyer user with all features enabled, signed in.
- **Steps.**
  1. Look at the left navigation panel.
- **Expected.** Items Home, Purchase Requisitions, Events, Purchase Orders, Approvals, Vendors, Manage and Settings are listed; Home is the current page.
- **Oracle.** Each listed label is present in the sidebar; Home is marked as current.
- **Trace.** P3 · automate-later · `59892226c8b282f8a46501fb9b9cb0ff` · `discovering-the-homepage` · Notion KB › Introduction › Discovering the Homepage

#### PRD-KBINT-006 — Sidebar pages vary with enabled features and RBAC

- **Why it matters.** The article states pages can be hidden by feature enablement and role-based access control; a user must not see modules their role hides.
- **Setup.** Two users in the same account: one with full access, one whose role hides some modules (RBAC); or an account with a feature disabled.
- **Steps.**
  1. Sign in as the full-access user and note the sidebar items.
  2. Sign in as the restricted user and note the sidebar items.
- **Expected.** The restricted user sees fewer pages; pages hidden at RBAC level or for disabled features do not appear.
- **Oracle.** Sidebar item lists differ between the two users in line with their role / feature configuration.
- **Trace.** P1 · manual · `59892226c8b282f8a46501fb9b9cb0ff` · `discovering-the-homepage` · Notion KB › Introduction › Discovering the Homepage

#### PRD-KBINT-007 — Hide and restore the navigation panel

- **Why it matters.** Collapsing the panel must be reversible so users do not lose navigation.
- **Setup.** Buyer user on the Home Page.
- **Steps.**
  1. Click the left-pointing double arrow next to the grey Procol logo at the bottom left.
  2. Undo the action to show the panel again.
- **Expected.** The navigation panel hides, and can be shown again.
- **Oracle.** Sidebar is collapsed after step 1 and visible again after step 2.
- **Trace.** P3 · automate-later · `59892226c8b282f8a46501fb9b9cb0ff` · `discovering-the-homepage` · Notion KB › Introduction › Discovering the Homepage

#### PRD-KBINT-008 — Pending Approvals panel allows quick Approve / Reject

- **Why it matters.** The top-bar panel is a shortcut to act on approvals pending on the user — an approval action taken from outside the Approvals module.
- **Setup.** Buyer user who has at least one approval pending on them.
- **Steps.**
  1. Click the **Pending Approvals** icon (leftmost icon in the top bar).
  2. In the side panel, review the summarised details of a pending item.
  3. Click **View More Details** on one item to see more information.
  4. Take quick action (Approve or Reject) on a pending item.
- **Expected.** A side panel opens listing approvals pending on the user with summary details; View More Details shows more information; after acting, the item is cleared from the task list.
- **Oracle.** Side panel visible with pending items; acted-on item no longer listed as pending.
- **Trace.** P1 · automate-later · `59892226c8b282f8a46501fb9b9cb0ff` · `discovering-the-homepage` · Notion KB › Introduction › Discovering the Homepage

#### PRD-KBINT-009 — Notifications drawer and Mark As Read

- **Why it matters.** In-app notifications mirror the email notifications and flag things needing attention.
- **Setup.** Buyer user with unread system notifications.
- **Steps.**
  1. Click the **Notifications** icon in the top bar.
  2. Click **Mark As Read**.
- **Expected.** A notification drawer opens with system-triggered notifications; Mark As Read marks them read and removes them from the drawer.
- **Oracle.** Drawer visible; after Mark As Read the notifications no longer appear in the drawer.
- **Trace.** P2 · automate-later · `59892226c8b282f8a46501fb9b9cb0ff` · `discovering-the-homepage` · Notion KB › Introduction › Discovering the Homepage

#### PRD-KBINT-010 — Give feedback as issue, idea or other

- **Why it matters.** Feedback is the in-product channel to Procol support.
- **Setup.** Buyer user signed in.
- **Steps.**
  1. Click the Feedback icon (Give Feedback / View Support Tickets) in the top bar.
  2. Click 'Give feedback'.
  3. Select 'idea' (repeat the case with 'other').
  4. Type the feedback in the text box.
  5. Click 'Send Feedback'.
- **Expected.** A short message pops up offering to give feedback or view active tickets; the Give feedback pop-up accepts the type and text and submits the response.
- **Oracle.** Pop-up shows issue / idea / other choices and a text box; submission completes after Send Feedback.
- **Trace.** P2 · automate-later · `59892226c8b282f8a46501fb9b9cb0ff` · `discovering-the-homepage` · Notion KB › Introduction › Discovering the Homepage

#### PRD-KBINT-011 — Feedback of type Issue raises a trackable ticket

- **Why it matters.** The article states issue feedback raises a ticket the user can later track; losing it would break support follow-up.
- **Setup.** Buyer user signed in.
- **Steps.**
  1. Click the Feedback icon and then 'Give feedback'.
  2. Select 'issue', describe it, and click 'Send Feedback'.
  3. Open the Feedback icon again and choose to view active tickets.
- **Expected.** Submitting an Issue raises a ticket, which appears among the active tickets that have been raised.
- **Oracle.** The new ticket is listed under active tickets.
- **Trace.** P2 · automate-later · `59892226c8b282f8a46501fb9b9cb0ff` · `discovering-the-homepage` · Notion KB › Introduction › Discovering the Homepage

#### PRD-KBINT-012 — Chat icon opens the internal chat module

- **Why it matters.** Chat is the in-platform channel to colleagues and vendors.
- **Setup.** Buyer user signed in.
- **Steps.**
  1. Click the **Chat** icon in the top bar.
- **Expected.** The user is taken to Procol's internal communication chat module, where chats can be started with platform users and vendors.
- **Oracle.** Chat module screen is displayed.
- **Trace.** P3 · automate-later · `59892226c8b282f8a46501fb9b9cb0ff` · `discovering-the-homepage` · Notion KB › Introduction › Discovering the Homepage

#### PRD-KBINT-013 — User Profile hover menu shows name, organisation and three options

- **Why it matters.** The profile menu is the entry to profile edits, shortcuts and sign-out.
- **Setup.** Buyer user signed in.
- **Steps.**
  1. Hover over the User Profile icon (rightmost in the top bar).
- **Expected.** A sub-menu opens with the user's Name and Organisation details on top and three options: My profile, Keyboard Shortcuts, Sign Out.
- **Oracle.** Sub-menu visible with name, organisation and the three option labels.
- **Trace.** P3 · automate-later · `59892226c8b282f8a46501fb9b9cb0ff` · `discovering-the-homepage` · Notion KB › Introduction › Discovering the Homepage

#### PRD-KBINT-014 — Edit name and profile picture in My profile

- **Why it matters.** Users maintain their own display details.
- **Setup.** Buyer user signed in.
- **Steps.**
  1. Hover over the User Profile icon and click **My profile**.
  2. Press "Edit" to unfreeze the fields.
  3. Change the Name (and/or profile picture).
  4. Press save.
- **Expected.** A side panel with the user's details opens; after Edit the name and picture are editable and are saved.
- **Oracle.** The updated name is shown in the profile panel / profile sub-menu after saving.
- **Trace.** P2 · automate-later · `59892226c8b282f8a46501fb9b9cb0ff` · `discovering-the-homepage` · Notion KB › Introduction › Discovering the Homepage

#### PRD-KBINT-015 — Email and phone are restricted from editing in My profile

- **Why it matters.** Email is the login identity; the article states users are in most cases restricted from editing email and phone.
- **Setup.** Buyer user (standard configuration) signed in.
- **Steps.**
  1. Open **My profile** and press "Edit".
  2. Try to change the email and the phone number.
- **Expected.** Email and phone number are not editable (in most cases), while Name and profile picture are.
- **Oracle.** Email and phone fields stay frozen after Edit.
- **Trace.** P1 · manual · `59892226c8b282f8a46501fb9b9cb0ff` · `discovering-the-homepage` · Notion KB › Introduction › Discovering the Homepage

#### PRD-KBINT-016 — Keyboard Shortcuts list opens from the profile menu

- **Why it matters.** Shortcuts support repetitive actions during Sourcing.
- **Setup.** Buyer user signed in.
- **Steps.**
  1. Hover over the User Profile icon and click **Keyboard Shortcuts**.
- **Expected.** A list of keyboard shortcuts for specific actions opens.
- **Oracle.** Shortcut list is displayed.
- **Trace.** P3 · automate-later · `59892226c8b282f8a46501fb9b9cb0ff` · `discovering-the-homepage` · Notion KB › Introduction › Discovering the Homepage

#### PRD-KBINT-017 — Sign Out returns to the sign-in screen

- **Why it matters.** Sign-out must end the session.
- **Setup.** Buyer user signed in.
- **Steps.**
  1. Hover over the User Profile icon and click **Sign Out**.
- **Expected.** The user is signed out of the Procol platform and taken to the sign-in screen.
- **Oracle.** Sign-in screen is displayed; returning to the Home Page requires signing in again.
- **Trace.** P2 · automate-later · `59892226c8b282f8a46501fb9b9cb0ff` · `discovering-the-homepage` · Notion KB › Introduction › Discovering the Homepage

## 2. How to Create RFQ and Auction Templates

#### PRD-KBINT-018 — Create and publish an RFQ/Auction template

- **Why it matters.** Templates predefine formats, terms, awarding rules and data fields; an RFQ or Auction event is launched from a published template.
- **Setup.** Buyer user with access to **Manage › Templates**.
- **Steps.**
  1. From the homepage, go to the **Manage** tab in the left navigation.
  2. Hover over **Manage** and click **Templates**.
  3. Click **Create Template**, hover over it and select **RFQ/Auction**.
  4. On the Template Creation page, enter the **Template Title** and verify the category is **RFQ/Auction**.
  5. Click **Ranking Criteria** and set the awarding criteria and **Template Type**.
  6. Click **Add**, choose a column type and configure the column.
  7. Click the blue **"Publish"** button.
- **Expected.** The template is published and can be used for future RFQs and Auctions.
- **Oracle.** Published-template confirmation is shown; the template is available when creating a future RFQ / Auction.
- **Trace.** P1 · automate-later · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-019 — Manage hover menu lists Templates and related options

- **Why it matters.** This is the navigation path to template creation.
- **Setup.** Buyer user on the homepage.
- **Steps.**
  1. Hover over **Manage** in the left navigation.
- **Expected.** Options such as Product Categories, Teams, Locations, Users, Templates and Approval Workflows are shown.
- **Oracle.** The listed option labels are visible in the hover menu.
- **Trace.** P3 · automate-later · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-020 — Template Creation page opens with category RFQ/Auction

- **Why it matters.** The template category decides which events can use it.
- **Setup.** Buyer user on the Templates page.
- **Steps.**
  1. Hover over **Create Template** and select **RFQ/Auction**.
- **Expected.** The Template Creation page opens with a Template Title field and the category set to RFQ/Auction.
- **Oracle.** Category shown on the page reads RFQ/Auction.
- **Trace.** P2 · automate-later · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-021 — Convert the template into a BOQ template

- **Why it matters.** The BOQ option is an optional variant of the RFQ/Auction template.
- **Setup.** Buyer user on the RFQ/Auction Template Creation page.
- **Steps.**
  1. Enable the BOQ option.
  2. Complete and publish the template.
- **Expected.** The template becomes a BOQ template.
- **Oracle.** BOQ option remains enabled on the saved template; tester confirms it is offered as a BOQ template.
- **Trace.** P2 · manual · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-022 — Add Terms & Conditions to the template

- **Why it matters.** Templates predefine terms so each event does not reconfigure them.
- **Setup.** Buyer user on the RFQ/Auction Template Creation page.
- **Steps.**
  1. Click the "**Add TnC**" button.
  2. Add Terms & Conditions text and save.
- **Expected.** Terms & Conditions are added to the template and can be edited again.
- **Oracle.** T&C content is shown on the template after reopening Add TnC.
- **Trace.** P2 · automate-later · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-023 — Awarding criteria on lot vs line item

- **Why it matters.** The template carries the awarding rules; lot vs line-item awarding decides how the event will be awarded.
- **Setup.** Buyer user on the RFQ/Auction Template Creation page.
- **Steps.**
  1. Click **Ranking Criteria** to open the **Awarding Criteria** module.
  2. Select awarding criteria on lot; save.
  3. Repeat with awarding criteria on line item.
- **Expected.** The Awarding Criteria module opens and the chosen awarding level (lot or line item) is saved on the template.
- **Oracle.** Reopening Ranking Criteria shows the selected awarding level for each variant.
- **Trace.** P0 · automate-later · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-024 — Template Type Buy or Sell in the Awarding Criteria module

- **Why it matters.** Template Type is part of the awarding configuration the template predefines.
- **Setup.** Buyer user in the Awarding Criteria module of an RFQ/Auction template.
- **Steps.**
  1. Select **Template Type** = Buy from the dropdown; save.
  2. Repeat with Template Type = Sell.
- **Expected.** The dropdown offers Buy and Sell and the selection is saved on the template.
- **Oracle.** Reopening Ranking Criteria shows the selected Template Type.
- **Trace.** P0 · automate-later · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-025 — Quote Sheet per line item vs single Global Sheet

- **Why it matters.** Fields placed on the wrong sheet are either repeated per line item or asked once per event.
- **Setup.** A published RFQ/Auction template with fields on both the Quote Sheet and the Global Sheet; an event created from it with two or more line items.
- **Steps.**
  1. In the template, add a field to the Quote Sheet and a field to the Global Sheet.
  2. Create an event from the template with multiple line items and view the sheets.
- **Expected.** The Quote Sheet (line-item-specific fields) is duplicated for each line item; there is only one Global Sheet (fields applicable across the entire event).
- **Oracle.** Quote Sheet field appears once per line item; Global Sheet field appears once for the event.
- **Trace.** P1 · manual · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-026 — Reorder fields with the 6-dots drag-and-drop

- **Why it matters.** Field order is what bidders see.
- **Setup.** RFQ/Auction template with at least two fields in a sheet.
- **Steps.**
  1. Drag a field by its 6-dots handle to a new position within the sheet.
- **Expected.** The field moves to the new position within the sheet.
- **Oracle.** Field order in the sheet reflects the drop position.
- **Trace.** P2 · automate-later · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-027 — Switch between Horizontal and Vertical view

- **Why it matters.** View toggle changes only the layout while editing.
- **Setup.** RFQ/Auction Template Creation page.
- **Steps.**
  1. Click the view toggle button to switch to Vertical view.
  2. Click it again to return to Horizontal view.
- **Expected.** The sheet layout switches between Horizontal and Vertical views.
- **Oracle.** Layout orientation changes on each toggle.
- **Trace.** P3 · automate-later · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-028 — Add column offers the ten column types

- **Why it matters.** Column types define what data buyers and bidders capture.
- **Setup.** RFQ/Auction Template Creation page.
- **Steps.**
  1. Click the **Add** button.
- **Expected.** Column type options are Text, Creator Attachment, Participant Attachment, Date, Price, Amount, Number, Percentage, Dropdown and Formula.
- **Oracle.** All ten type labels are listed.
- **Trace.** P2 · automate-later · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-029 — Text column: key attribute fills automatically from the name

- **Why it matters.** The key attribute identifies the field; the article states it is auto-filled from the column name.
- **Setup.** RFQ/Auction Template Creation page.
- **Steps.**
  1. Click **Add** and choose Text.
  2. Enter a column name.
  3. Set the mandatory / hidden options.
- **Expected.** The key attribute is filled automatically when the name is filled; mandatory / hidden options can be set.
- **Oracle.** Key attribute field is populated after typing the name.
- **Trace.** P2 · automate-later · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-030 — Date column: format and optional default value

- **Why it matters.** Date format and default drive how dates are captured in events.
- **Setup.** RFQ/Auction Template Creation page.
- **Steps.**
  1. Click **Add** and choose Date.
  2. Enter the column name.
  3. Select a Date format.
  4. Select a default value (optional); also save once without a default.
- **Expected.** The Date column saves with the chosen format, with or without a default value.
- **Oracle.** Column settings show the selected format and default (or none).
- **Trace.** P2 · automate-later · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-031 — Price / Amount / Number column: prefix, suffix and precision

- **Why it matters.** Price and amount columns carry commercial values; prefix/suffix/precision control how they display.
- **Setup.** RFQ/Auction Template Creation page.
- **Steps.**
  1. Click **Add** and choose Price (repeat for Amount and Number).
  2. Enter the column name (key attribute fills automatically).
  3. Set a prefix, a suffix and a precision.
- **Expected.** The column saves with the given prefix, suffix and precision; key attribute auto-fills from the name.
- **Oracle.** Column settings show the prefix, suffix and precision entered.
- **Trace.** P2 · automate-later · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-032 — Precision for number-based fields is limited to 0–4 decimals

- **Why it matters.** The article states precision is 0–4 decimal positions; values outside that range must not be accepted.
- **Setup.** RFQ/Auction template with a Price, Amount or Number column.
- **Steps.**
  1. Open the column's precision setting.
  2. Set precision to 0, then 4.
  3. Try to set a precision above 4.
- **Expected.** Precision 0 through 4 is accepted; nothing beyond 4 decimal positions can be set.
- **Oracle.** Precision control offers / accepts only 0–4.
- **Trace.** P1 · automate-later · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-033 — Dropdown column from an existing list or a new list

- **Why it matters.** Dropdown values constrain vendor responses.
- **Setup.** RFQ/Auction Template Creation page.
- **Steps.**
  1. Click **Add** and choose Dropdown; enter the column name.
  2. Choose an existing dropdown list; save.
  3. Add another Dropdown column and create a new list: type a name for the list, click Add option, type in the options.
  4. Click X on one option to remove it.
- **Expected.** Dropdown values can come from an existing list or a newly created list; options can be added and removed with X.
- **Oracle.** Column settings show the chosen / created list with the remaining options.
- **Trace.** P2 · automate-later · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-034 — Formula column using curly-bracket field names

- **Why it matters.** Formula columns compute values from other fields.
- **Setup.** RFQ/Auction template with at least two number-type columns.
- **Steps.**
  1. Click **Add** and choose Formula.
  2. Define the calculation with field names in curly brackets `{}` and operators.
  3. Use the template in an event and enter values in the referenced fields.
- **Expected.** The formula is accepted and calculates from the referenced fields.
- **Oracle.** Formula column shows the computed value for the entered inputs.
- **Trace.** P2 · manual · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-035 — Mandatory toggle makes the field required

- **Why it matters.** Mandatory fields must be filled in; missing required data breaks evaluation.
- **Setup.** RFQ/Auction template with a column marked **Mandatory**, used in an event.
- **Steps.**
  1. Turn on the **Mandatory** toggle for a column and publish.
  2. In an event from this template, try to proceed without filling that field.
- **Expected.** The field must be filled in.
- **Oracle.** The field is flagged as required and the response is not accepted while it is empty.
- **Trace.** P1 · manual · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-036 — Hidden toggle makes the field inactive

- **Why it matters.** Hidden fields stay in the template but are inactive.
- **Setup.** RFQ/Auction template with a column.
- **Steps.**
  1. Turn on the **Hidden** toggle for a column and publish.
  2. Use the template in an event.
- **Expected.** The field is inactive in the template.
- **Oracle.** The hidden field is not active in the event's sheets.
- **Trace.** P2 · manual · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-037 — Hide from Participant keeps the field away from vendors

- **Why it matters.** Buyer-internal fields must not leak to vendors.
- **Setup.** RFQ/Auction template with a column marked **Hide from Participant**; an event from it with an invited vendor.
- **Steps.**
  1. Turn on **Hide from Participant** for a column and publish.
  2. Create an event from the template and invite a vendor.
  3. Open the event as the vendor.
- **Expected.** The field is not visible to vendors.
- **Oracle.** The field is absent in the vendor's view while present in the buyer's view.
- **Trace.** P1 · manual · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-038 — Buyer Editable lets the buyer edit participant fields

- **Why it matters.** Controls whether the buyer can change vendor-filled data.
- **Setup.** RFQ/Auction template with a participant field marked **Buyer Editable**; an event with a vendor response.
- **Steps.**
  1. Turn on **Buyer Editable** for a participant field and publish.
  2. After a vendor fills the field in an event, try to edit it as the buyer.
- **Expected.** The buyer can edit the participant field.
- **Oracle.** Buyer's edit to the vendor-filled field is saved.
- **Trace.** P2 · manual · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-039 — Creator/Participant Field decides who fills the field

- **Why it matters.** Assigning a field to the wrong side means it is filled by the wrong party.
- **Setup.** RFQ/Auction template; an event from it with an invited vendor.
- **Steps.**
  1. Set one column as a Creator field and another as a Participant field; publish.
  2. Create an event from the template and view it as buyer and as vendor.
- **Expected.** The Creator field is filled by the event creator; the Participant field is filled by the vendor.
- **Oracle.** Each field is fillable only by the party it is assigned to.
- **Trace.** P1 · manual · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

#### PRD-KBINT-040 — Duplicate or Delete a column from Column settings

- **Why it matters.** Column management speeds up template building.
- **Setup.** RFQ/Auction template with at least one column.
- **Steps.**
  1. Click the three dots next to "Column settings" and choose **Duplicate**.
  2. Click the three dots on a column and choose **Delete**.
- **Expected.** Duplicate adds a copy of the column; Delete removes the column.
- **Oracle.** Column count goes up by one after Duplicate and down by one after Delete.
- **Trace.** P2 · automate-later · `60e92226c8b2831fa8b7017e26ec60fe` · `how-to-create-rfq-and-auction-templates` · Notion KB › Introduction › How to Create RFQ and Auction Templates

## 3. How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-041 — Create an RFP template

- **Why it matters.** RFP templates standardise how proposals are structured; an RFP event needs one.
- **Setup.** Buyer user with access to **Manage › Templates**.
- **Steps.**
  1. From the homepage, go to **Manage** in the left navigation, hover and click **Templates**.
  2. Click **Create Template**, hover over it and select **RFP**.
  3. On the Template Creation page, enter the **Template Title**.
  4. In **Basic Details**, click **Add New Question**, fill Question, Description, Field Type, Required, and click **Add**.
  5. Click "Create".
- **Expected.** The RFP template is created.
- **Oracle.** Confirmation that the RFP template is now created; the template is listed on the Templates page.
- **Trace.** P1 · automate-later · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-042 — Create a Vendor Onboarding template via the Vendor Onboarding option

- **Why it matters.** Vendor onboarding runs on an onboarding template; without one onboarding cannot be started.
- **Setup.** Buyer user on the RFP Template Creation page.
- **Steps.**
  1. Enter the **Template Title**.
  2. Enable the **Vendor Onboarding** option.
  3. Add questions and click "Create".
- **Expected.** The template is converted into a Vendor Onboarding template and created.
- **Oracle.** Created template carries the Vendor Onboarding option enabled.
- **Trace.** P1 · automate-later · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-043 — Category shown on the RFP Template Creation page

- **Why it matters.** The article tells users to verify the category is "RFQ/Auction" even after selecting RFP — either the doc or the product is wrong, and a mis-categorised template would be offered for the wrong event type.
- **Setup.** Buyer user on the Templates page.
- **Steps.**
  1. Hover over **Create Template** and select **RFP**.
  2. Read the category shown on the Template Creation page.
- **Expected.** Per the article, the category is to be verified as **RFQ/Auction**; the tester records the actual category and flags any mismatch between the article and the product.
- **Oracle.** Category value shown on the page, compared against the article text.
- **Trace.** P2 · manual · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-044 — Add Evaluators to the template

- **Why it matters.** Evaluators are the people who assess RFP / onboarding responses.
- **Setup.** Buyer user on the RFP Template Creation page; other users exist in the account.
- **Steps.**
  1. In Evaluators, search for a user's name.
  2. Select the user.
- **Expected.** The selected user is added as an evaluator on the template.
- **Oracle.** Evaluator's name is shown on the template.
- **Trace.** P1 · automate-later · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-045 — Add Terms & Conditions to the RFP template

- **Why it matters.** Terms are standardised across proposals.
- **Setup.** Buyer user on the RFP Template Creation page.
- **Steps.**
  1. Click the "**Add TnC**" button.
  2. Add or edit Terms & Conditions and save.
- **Expected.** Terms & Conditions are saved on the template.
- **Oracle.** T&C content is shown on reopening Add TnC.
- **Trace.** P2 · automate-later · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-046 — Rename the Basic Details section

- **Why it matters.** Section names structure the vendor-facing form.
- **Setup.** Buyer user on the RFP Template Creation page.
- **Steps.**
  1. In **Basic Details**, click the **Edit icon**.
  2. Type a new section name and click Save.
- **Expected.** The section is renamed.
- **Oracle.** New section name is displayed.
- **Trace.** P2 · automate-later · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-047 — Deleting a section asks for confirmation

- **Why it matters.** Deleting a section removes its questions; the article states a confirmation pop-up appears.
- **Setup.** RFP template with at least one section.
- **Steps.**
  1. Click the **Delete** icon on a section.
  2. Confirm in the pop-up.
- **Expected.** A confirmation pop-up appears; on confirming, the section is removed.
- **Oracle.** Pop-up shown before deletion; section no longer listed afterwards.
- **Trace.** P2 · automate-later · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-048 — Add a new section

- **Why it matters.** Sections group related questions.
- **Setup.** Buyer user on the RFP Template Creation page.
- **Steps.**
  1. Click the New Section button (Add New Section).
  2. In the pop-up, type the section name and click "Add".
- **Expected.** A new section with that name is created.
- **Oracle.** New section is listed in the template.
- **Trace.** P2 · automate-later · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-049 — Toggle Form View and Table View

- **Why it matters.** Two ways to build the same set of questions.
- **Setup.** RFP template with at least one question in Basic Details.
- **Steps.**
  1. In Basic Details, switch to **Table View**.
  2. Switch back to **Form View**.
- **Expected.** Form View displays questions as a form; Table View displays three columns: Question, Description, Vendor Response.
- **Oracle.** Table View shows exactly the columns Question, Description, Vendor Response.
- **Trace.** P2 · automate-later · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-050 — Change a question's field type in Table View

- **Why it matters.** Field type controls what the vendor can answer.
- **Setup.** RFP template in Table View with at least one question.
- **Steps.**
  1. Next to a Vendor Response, click the Edit icon next to the field type.
  2. Choose a different field type.
- **Expected.** Available types are Short Text, Long Text, Single Select, Radio, Number, Attachment, Date; the chosen type is applied.
- **Oracle.** The question shows the new field type.
- **Trace.** P2 · automate-later · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-051 — Mark Required or delete a question in Table View

- **Why it matters.** Required questions must be answered by vendors.
- **Setup.** RFP template in Table View with two questions.
- **Steps.**
  1. Mark one question as **Required**.
  2. Delete the other question.
- **Expected.** The first question is marked Required; the second is removed.
- **Oracle.** Required marker on the first question; second question no longer listed.
- **Trace.** P2 · automate-later · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-052 — Add a question in Form View

- **Why it matters.** Core authoring step for RFP and onboarding forms.
- **Setup.** RFP template in Form View.
- **Steps.**
  1. Click **Add New Question**.
  2. In the pop-up enter Question, Description, Field Type and the Required toggle (Yes/No).
  3. Click **Add** (blue button).
- **Expected.** The question is saved to the section with the entered details.
- **Oracle.** New question appears in the form with its description, type and required state.
- **Trace.** P1 · automate-later · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-053 — Number field does not allow letters

- **Why it matters.** The article states Number is a numeric field with letters not allowed.
- **Setup.** RFP / Vendor Onboarding template with a Number question, used in an event or onboarding; vendor user.
- **Steps.**
  1. As the vendor, open the form and type letters into the Number question.
- **Expected.** Letters are not allowed in the Number field.
- **Oracle.** Letters are not accepted into the field.
- **Trace.** P1 · manual · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-054 — Configure options for Single Select and Radio

- **Why it matters.** Options are the only answers a vendor can pick.
- **Setup.** Add New Question pop-up with Field Type Single Select (repeat for Radio).
- **Steps.**
  1. Click **Add Option** and type an option.
  2. Press **Enter** to add more options.
  3. Use **Delete** on one option.
  4. Use **Delete All** to clear all options, then re-add some.
  5. Click **Add** to save the question.
- **Expected.** Options are added with Enter, removed individually with Delete, cleared with Delete All; the question saves with the remaining options.
- **Oracle.** Saved question lists exactly the options left after the edits.
- **Trace.** P2 · automate-later · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-055 — Edit an existing question

- **Why it matters.** Authors need to correct questions after adding them.
- **Setup.** RFP template with a question.
- **Steps.**
  1. Click the **Edit** icon on the question.
  2. Change the question text and save.
- **Expected.** The question is updated.
- **Oracle.** Updated text is shown.
- **Trace.** P2 · automate-later · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-056 — Deleting a question asks for confirmation

- **Why it matters.** The article states a confirmation pop-up appears before a question is deleted.
- **Setup.** RFP template with a question.
- **Steps.**
  1. Click the **Delete** icon on the question.
  2. Confirm in the pop-up.
- **Expected.** A confirmation pop-up appears; after confirming the question is removed.
- **Oracle.** Pop-up shown; question no longer listed.
- **Trace.** P2 · automate-later · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-057 — Required toggle on the question without reopening edit

- **Why it matters.** Inline toggling is the quick way to make questions mandatory.
- **Setup.** RFP template in Form View with a non-required question.
- **Steps.**
  1. Switch on the **Required toggle** directly on the question.
- **Expected.** The question becomes mandatory without opening the edit window.
- **Oracle.** Question shows as required; opening Edit shows Required = Yes.
- **Trace.** P2 · automate-later · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-058 — Bulk upload questions via Excel

- **Why it matters.** Large questionnaires are loaded from a sheet instead of one by one.
- **Setup.** Buyer user on the RFP Template Creation page; Google Sheets or Microsoft Excel available.
- **Steps.**
  1. Choose the option to Bulk Upload Questions via Excel.
  2. Click "**Download template**" to download the template sheet.
  3. Open the sheet in Google Sheets or Microsoft Excel and fill in the details.
  4. Upload the filled file in the modal.
  5. Click OK.
- **Expected.** The filled sheet is uploaded into the template.
- **Oracle.** Questions from the sheet are visible in the template after OK.
- **Trace.** P2 · manual · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template

#### PRD-KBINT-059 — Attachment question lets vendors upload files

- **Why it matters.** Onboarding and RFPs collect documents through Attachment questions.
- **Setup.** RFP / Vendor Onboarding template with an Attachment question, used in an event or onboarding; vendor user.
- **Steps.**
  1. As the vendor, open the form and upload a file (image or document) to the Attachment question.
- **Expected.** Vendors can upload files such as images and docs.
- **Oracle.** Uploaded file is attached to the vendor's response.
- **Trace.** P2 · manual · `a2a92226c8b282478ec181e10435d1ed` · `how-to-create-a-rfp-and-vendor-onboarding-template` · Notion KB › Introduction › How to Create a RFP and Vendor Onboarding Template
