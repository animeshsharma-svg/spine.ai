# Product KB test cases — Purchase Requisitions

Generated from the Procol Notion Knowledge Base (help-centre articles) — each case is grounded in the article it traces to. Source pages are read-only; re-derive from Notion rather than editing facts here.

## 1. A Full Tour of the Purchase Requisitions Page

#### PRD-KBPR-001 — ERP-raised PR appears automatically on Procol's PR page (integrated client)

- **Why it matters.** For integrated clients the PR page is fed by the ERP; if a PR raised in the ERP does not reflect in Procol, buyers never see the demand they must source.
- **Setup.** Buyer on an integrated client (ERP such as SAP S4 Hana connected); access to the ERP to raise a PR.
- **Steps.**
  1. Raise a PR in the connected ERP.
  2. Open the Purchase Requisitions page in Procol.
- **Expected.** The PR's line items automatically reflect on Procol's PR page with their status.
- **Oracle.** The ERP PR's line items are listed on the PR page without any manual entry in Procol.
- **Trace.** P1 · manual · `48392226c8b282ea873f81588a03cd45` · `a-full-tour-of-the-purchase-requisitions-page` · Notion KB › Purchase Requisitions › A Full Tour of the Purchase Requisitions Page

#### PRD-KBPR-002 — "Group On" groups PR line items by PR Number

- **Why it matters.** Grouping lets a buyer see every line of one requisition together instead of a flat list of line items.
- **Setup.** Buyer on the PR page with line items from more than one PR.
- **Steps.**
  1. Open the PR page (all PR line items are listed).
  2. Click the "Group On" button.
- **Expected.** The PR page is organised with line items grouped by their PR Number.
- **Oracle.** Line items appear under PR Number groups rather than as one flat list.
- **Trace.** P3 · automate-later · `48392226c8b282ea873f81588a03cd45` · `a-full-tour-of-the-purchase-requisitions-page` · Notion KB › Purchase Requisitions › A Full Tour of the Purchase Requisitions Page

#### PRD-KBPR-003 — PR line item moves from Open to In Progress once an event is created for it

- **Why it matters.** The status tabs are how buyers track progress; Open means no event exists and In Progress means one does, so the transition must follow event creation.
- **Setup.** Buyer on the PR page; a PR line item in the Open tab (no events created for it).
- **Steps.**
  1. Confirm the line item is listed under the Open status tab.
  2. Create an event for that line item.
  3. Navigate between the status tabs.
- **Expected.** Before the event the item is Open ("No Events have been created for this PR Line Item"); after the event it is In Progress ("Events have been created for this PR Line Item").
- **Oracle.** The line item no longer appears under Open and appears under In Progress.
- **Trace.** P1 · automate-later · `48392226c8b282ea873f81588a03cd45` · `a-full-tour-of-the-purchase-requisitions-page` · Notion KB › Purchase Requisitions › A Full Tour of the Purchase Requisitions Page

#### PRD-KBPR-004 — PR line item shows Completed when its requested quantity is fulfilled

- **Why it matters.** Completed must only mean the full PR quantity has been fulfilled; a premature Completed hides open demand.
- **Setup.** Buyer on the PR page; a PR line item with events created (In Progress).
- **Steps.**
  1. Fulfil the full quantity for which the PR was raised for that line item.
  2. Open the Completed status tab.
- **Expected.** The line item falls under Completed ("The Quantity for which the PR has been raised for the Line Item has been fulfilled").
- **Oracle.** The line item is listed in the Completed tab and not in In Progress.
- **Trace.** P2 · manual · `48392226c8b282ea873f81588a03cd45` · `a-full-tour-of-the-purchase-requisitions-page` · Notion KB › Purchase Requisitions › A Full Tour of the Purchase Requisitions Page

#### PRD-KBPR-005 — No events can be created for a PR line item on Hold

- **Why it matters.** Hold exists to stop sourcing on a line; if an event can still be created, held demand gets bought anyway.
- **Setup.** Buyer on the PR page; a PR line item placed on Hold (via "🚫 Hold Item" with a remark).
- **Steps.**
  1. Open the Hold status tab and find the held line item.
  2. Attempt to create an event for that line item.
- **Expected.** No event can be created for the line item until it is taken out of Hold.
- **Oracle.** The event cannot be created for the held line item; it stays in the Hold tab.
- **Trace.** P1 · automate-later · `48392226c8b282ea873f81588a03cd45` · `a-full-tour-of-the-purchase-requisitions-page` · Notion KB › Purchase Requisitions › A Full Tour of the Purchase Requisitions Page

#### PRD-KBPR-006 — Filters persist across pages and modules until "Clear Filter" is clicked

- **Why it matters.** Buyers filter items from different PRs to build a common event; losing filters on navigation breaks that workflow, and Clear Filter must fully restore the page.
- **Setup.** Buyer on the PR page with line items from several PRs.
- **Steps.**
  1. Apply one or more filters on the PR page.
  2. Switch to a different page or module of the platform, then return to the PR page.
  3. Click the "🗑️ Clear Filter" button.
- **Expected.** After returning, the filters are still applied; after Clear Filter, all filters are cleared and the page reverts to its original state.
- **Oracle.** The filtered list is unchanged after navigation; after Clear Filter the unfiltered list is shown.
- **Trace.** P2 · automate-later · `48392226c8b282ea873f81588a03cd45` · `a-full-tour-of-the-purchase-requisitions-page` · Notion KB › Purchase Requisitions › A Full Tour of the Purchase Requisitions Page

#### PRD-KBPR-007 — Columns window: Hide All / Show all, and column visibility persists

- **Why it matters.** Column visibility is a per-user setting that the article says persists across the platform until changed.
- **Setup.** Buyer on the PR page.
- **Steps.**
  1. Click the "👁️ Columns (N/N)" button.
  2. Use "Hide All", then "Show all"; then hide one or more columns.
  3. Switch to another page or module and return to the PR page.
- **Expected.** The window lists all columns of the PR line item table; Hide All / Show all hide and restore columns; the chosen visibility persists after navigation.
- **Oracle.** The table shows only the columns left visible, and the button count reflects them after returning.
- **Trace.** P3 · automate-later · `48392226c8b282ea873f81588a03cd45` · `a-full-tour-of-the-purchase-requisitions-page` · Notion KB › Purchase Requisitions › A Full Tour of the Purchase Requisitions Page

#### PRD-KBPR-008 — Exporting PRs sends the report to the user's email as an Excel document

- **Why it matters.** Export is the offline record of all PR line items; it is delivered by email rather than downloaded.
- **Setup.** Buyer on the PR page with access to their mailbox.
- **Steps.**
  1. Click the export button on the PR page.
  2. Check the user's email.
- **Expected.** An export report of all PR line items and their details is sent to the user's email as an excel document (.csv / .xlsx).
- **Oracle.** An email with the .csv/.xlsx export arrives containing the PR line items.
- **Trace.** P2 · manual · `48392226c8b282ea873f81588a03cd45` · `a-full-tour-of-the-purchase-requisitions-page` · Notion KB › Purchase Requisitions › A Full Tour of the Purchase Requisitions Page

## 2. How do I assign PRs to my Team?

#### PRD-KBPR-009 — Assign a single PR line item to a team member

- **Why it matters.** Assignment makes a team member responsible for executing the purchase (creating events and moving the PR from Open to Completed).
- **Setup.** Purchase manager on the PR page; at least one PR line item without an assignee.
- **Steps.**
  1. Hover over the "+" icon in the Assignee column of the line item.
  2. Click "Add Assignee" when the option appears.
  3. From the dropdown of available users, select the team member.
- **Expected.** The line item is assigned to the selected team member.
- **Oracle.** The Assignee column of that line item shows the selected team member.
- **Trace.** P1 · automate-later · `87f92226c8b28339b2f18191157967b0` · `how-do-i-assign-prs-to-my-team` · Notion KB › Purchase Requisitions › How do I assign PRs to my Team?

#### PRD-KBPR-010 — Bulk-assign several PR line items at once

- **Why it matters.** Bulk assignment is how a whole PR, or items grouped by category or buyer responsibility, is handed to one person.
- **Setup.** Purchase manager on the PR page; several unassigned PR line items.
- **Steps.**
  1. Select the line items by checking the boxes on the left.
  2. Click the "Add Assignee" button at the top right.
  3. Choose the user from the dropdown.
- **Expected.** All selected line items are assigned to the chosen user.
- **Oracle.** Each selected line item's Assignee column shows the chosen user; unselected items are unchanged.
- **Trace.** P1 · automate-later · `87f92226c8b28339b2f18191157967b0` · `how-do-i-assign-prs-to-my-team` · Notion KB › Purchase Requisitions › How do I assign PRs to my Team?

#### PRD-KBPR-011 — Assignee dropdown is scrollable and searchable in both individual and bulk flows

- **Why it matters.** In organisations with many users, finding the assignee depends on the dropdown's search.
- **Setup.** Purchase manager on the PR page.
- **Steps.**
  1. Open "Add Assignee" from a single line item's "+" icon; scroll the dropdown and type a user's name in the search bar.
  2. Repeat from the bulk "Add Assignee" button with several items selected.
- **Expected.** In both flows a scrollable dropdown opens and typing in the search bar finds the user.
- **Oracle.** The dropdown narrows to the matching user in both the individual and the bulk flow.
- **Trace.** P3 · automate-later · `87f92226c8b28339b2f18191157967b0` · `how-do-i-assign-prs-to-my-team` · Notion KB › Purchase Requisitions › How do I assign PRs to my Team?

#### PRD-KBPR-012 — Assignee is responsible for creating events and moving the PR from Open to Completed

- **Why it matters.** The article defines what assignment means operationally; a tester should confirm the assignee can carry the line item through.
- **Setup.** A PR line item assigned to a team member (buyer); the assignee logged in.
- **Steps.**
  1. As the assignee, open the PR page and find the assigned line item in Open.
  2. Create sourcing events for it and progress it until its quantity is fulfilled.
- **Expected.** The assignee can create events for the item and it moves from Open towards Completed.
- **Oracle.** The line item's status tab changes from Open (to In Progress, then Completed) under the assignee's actions.
- **Trace.** P2 · manual · `87f92226c8b28339b2f18191157967b0` · `how-do-i-assign-prs-to-my-team` · Notion KB › Purchase Requisitions › How do I assign PRs to my Team?

## 3. How do I hold a PR Line item?

#### PRD-KBPR-013 — Hold a PR line item with a remark; it appears in the Hold tab with who held it

- **Why it matters.** Holding pauses a line item and removes it from processing; the Hold tab must record who held it.
- **Setup.** Buyer on the PR page; a PR line item that is not on hold.
- **Steps.**
  1. Scroll to the far right of the PR table.
  2. Click the "🚫 Hold Item" button for the line item.
  3. Enter a remark explaining why the item is being held.
  4. Confirm by clicking the blue "Hold Item" button.
  5. Open the Hold status tab of the PR page.
- **Expected.** The line item is placed on hold and is listed in the Hold status tab together with who it was held by.
- **Oracle.** The item appears in the Hold tab showing the holder's name.
- **Trace.** P1 · automate-later · `48192226c8b2834faa2e81e12512dfeb` · `how-do-i-hold-a-pr-line-item` · Notion KB › Purchase Requisitions › How do I hold a PR Line item?

#### PRD-KBPR-014 — Holding (and reopening) a PR line item signals the ERP to hold the item there too

- **Why it matters.** Procol and the ERP must agree on which items are held; otherwise the ERP keeps processing items paused in Procol.
- **Setup.** Buyer on an integrated client with access to the ERP; a PR line item sourced from the ERP.
- **Steps.**
  1. Hold the line item in Procol ("Hold Item" with a remark, then confirm).
  2. Check the same item in the ERP.
- **Expected.** The hold action sends a signal to the ERP so the item is held there as well.
- **Oracle.** The item shows as held in the ERP after the Procol hold.
- **Trace.** P1 · manual · `48192226c8b2834faa2e81e12512dfeb` · `how-do-i-hold-a-pr-line-item` · Notion KB › Purchase Requisitions › How do I hold a PR Line item?

#### PRD-KBPR-015 — A held item can be reopened at any time

- **Why it matters.** The article states hold is reversible at any time; a hold that cannot be undone would strand demand.
- **Setup.** Buyer on the PR page; a line item on Hold.
- **Steps.**
  1. Open the Hold status tab.
  2. Reopen the held item.
- **Expected.** The item can be reopened whenever the user chooses.
- **Oracle.** The item leaves the Hold tab after reopening.
- **Trace.** P2 · automate-later · `48192226c8b2834faa2e81e12512dfeb` · `how-do-i-hold-a-pr-line-item` · Notion KB › Purchase Requisitions › How do I hold a PR Line item?

## 4. How do I reopen Line Items?

#### PRD-KBPR-016 — Reopen a held PR line item; it returns to the Open tab

- **Why it matters.** Reopening brings a held line back into an Open state so it can be processed.
- **Setup.** Buyer on the PR page; a line item on Hold.
- **Steps.**
  1. Navigate to the Hold status tab of the PR page.
  2. Scroll to the far right of the PR table.
  3. Click the "♻️ Re-open Item" button for the line item.
  4. Read the message and confirm by clicking the blue "Reopen Item" button.
  5. Open the Open status tab.
- **Expected.** The line item is reopened and is listed in the Open status tab.
- **Oracle.** The item is gone from the Hold tab and present in the Open tab.
- **Trace.** P1 · automate-later · `62f92226c8b282a1ade381c217625873` · `how-do-i-reopen-line-items` · Notion KB › Purchase Requisitions › How do I reopen Line Items?

#### PRD-KBPR-017 — A reopened line item is available for buying again

- **Why it matters.** The point of reopening is that the item can be sourced again; the hold restriction must lift.
- **Setup.** Buyer on the PR page; a line item that was held and has just been reopened.
- **Steps.**
  1. Reopen the held line item ("Re-open Item", then "Reopen Item").
  2. Select it from the Open tab and start processing it (e.g. add it to the purchase cart / create an event).
- **Expected.** The item is available for buying again and can be processed.
- **Oracle.** The item can be selected and processed from the Open tab without the hold blocking it.
- **Trace.** P2 · automate-later · `62f92226c8b282a1ade381c217625873` · `how-do-i-reopen-line-items` · Notion KB › Purchase Requisitions › How do I reopen Line Items?

#### PRD-KBPR-018 — Requisitioner is notified when their line item is reopened

- **Why it matters.** The requisitioner owns the demand and must learn that a held item is back in play.
- **Setup.** A held PR line item with a known requisitioner; access to the requisitioner's notifications.
- **Steps.**
  1. Reopen the held line item and confirm.
  2. Check the requisitioner's notifications.
- **Expected.** The requisitioner responsible for the item gets notified about the reopen action.
- **Oracle.** A notification about the reopen reaches the requisitioner.
- **Trace.** P2 · manual · `62f92226c8b282a1ade381c217625873` · `how-do-i-reopen-line-items` · Notion KB › Purchase Requisitions › How do I reopen Line Items?

## 5. How do I start processing my PRs

#### PRD-KBPR-019 — Process PR line items through the Purchase Cart into a Sourcing Project

- **Why it matters.** This is the entry of the core path from requisition to sourcing event: selected PR lines become a Sourcing Project with events.
- **Setup.** Buyer on the PR page; one or more Open PR line items.
- **Steps.**
  1. Select the checkbox next to each PR line item to process (multiple allowed).
  2. Click the blue "🛒 Purchase Items" button on the top right.
  3. In the side panel, review the selected items and their quantities.
  4. Click the blue "Create Project" button on the bottom right.
  5. Select which events to create as part of the Sourcing Project.
  6. Click "Create Project" again.
- **Expected.** A side panel lists the selected items with quantities, and after the second "Create Project" the user proceeds to setting up the chosen events.
- **Oracle.** The event set-up screen opens for the new Sourcing Project containing the selected line items.
- **Trace.** P0 · automate-later · `50f92226c8b282558fb8816d826b80a0` · `how-do-i-start-processing-my-prs` · Notion KB › Purchase Requisitions › How do I start processing my PRs

#### PRD-KBPR-020 — Purchase Items and Create Project buttons show the number of selected items

- **Why it matters.** The count is the buyer's confirmation of what is going into the project.
- **Setup.** Buyer on the PR page.
- **Steps.**
  1. Select three PR line items.
  2. Read the "🛒 Purchase Items" button.
  3. Click it and read the "Create Project" button in the side panel.
- **Expected.** Both buttons show the number of items selected.
- **Oracle.** Both buttons display 3.
- **Trace.** P3 · automate-later · `50f92226c8b282558fb8816d826b80a0` · `how-do-i-start-processing-my-prs` · Notion KB › Purchase Requisitions › How do I start processing my PRs

#### PRD-KBPR-021 — Quantity can be edited directly in the cart

- **Why it matters.** Buyers often source part of a PR; the cart quantity is what flows into the project.
- **Setup.** Buyer with PR line items in the cart side panel.
- **Steps.**
  1. Click on the quantity box of a cart line.
  2. Type a new value lower than the requested quantity.
- **Expected.** The quantity is editable and accepts the new value.
- **Oracle.** The cart line shows the edited quantity.
- **Trace.** P1 · automate-later · `50f92226c8b282558fb8816d826b80a0` · `how-do-i-start-processing-my-prs` · Notion KB › Purchase Requisitions › How do I start processing my PRs

#### PRD-KBPR-022 — Edited cart quantity cannot exceed the PR's requested quantity

- **Why it matters.** Sourcing more than was requisitioned would buy unapproved quantity.
- **Setup.** Buyer with a PR line item in the cart; the originally requested quantity is known.
- **Steps.**
  1. Click on the quantity box of the cart line.
  2. Type a value greater than the originally requested quantity.
- **Expected.** The edited quantity cannot exceed the originally requested quantity from the PR.
- **Oracle.** The cart does not keep a quantity above the requested quantity.
- **Trace.** P1 · automate-later · `50f92226c8b282558fb8816d826b80a0` · `how-do-i-start-processing-my-prs` · Notion KB › Purchase Requisitions › How do I start processing my PRs

#### PRD-KBPR-023 — UOM of the quantity cannot be changed in the cart

- **Why it matters.** Changing the unit at this stage would silently change what is being bought.
- **Setup.** Buyer with a PR line item in the cart.
- **Steps.**
  1. In the cart side panel, try to change the UOM of a line's quantity.
- **Expected.** The UOM cannot be changed at this stage.
- **Oracle.** The UOM stays the one from the PR.
- **Trace.** P1 · automate-later · `50f92226c8b282558fb8816d826b80a0` · `how-do-i-start-processing-my-prs` · Notion KB › Purchase Requisitions › How do I start processing my PRs

#### PRD-KBPR-024 — Remove an item from the cart with the trash icon

- **Why it matters.** Buyers must be able to drop a line before it goes into a project.
- **Setup.** Buyer with at least two PR line items in the cart.
- **Steps.**
  1. Click the "🗑️" trash icon next to one cart line.
- **Expected.** That item is removed from the cart.
- **Oracle.** The line no longer appears in the side panel and the item count drops by one.
- **Trace.** P2 · automate-later · `50f92226c8b282558fb8816d826b80a0` · `how-do-i-start-processing-my-prs` · Notion KB › Purchase Requisitions › How do I start processing my PRs

#### PRD-KBPR-025 — Cart supports proceeding to Technical Stage / RFQ / Reverse Auction or PO

- **Why it matters.** The article names the downstream procurement steps the cart prepares for; each should be reachable from a project.
- **Setup.** Buyer with PR line items in the cart.
- **Steps.**
  1. Click "Create Project" in the cart.
  2. Review the event types offered for the Sourcing Project.
- **Expected.** The cart lets the buyer organise the items before steps like creating a Technical Stage / RFQ / Reverse Auction or PO.
- **Oracle.** The tester confirms the event-type choices allow these downstream steps.
- **Trace.** P2 · manual · `50f92226c8b282558fb8816d826b80a0` · `how-do-i-start-processing-my-prs` · Notion KB › Purchase Requisitions › How do I start processing my PRs
