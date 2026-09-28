# Product KB test cases — P2P

Generated from the Procol Notion Knowledge Base (help-centre articles) — each case is grounded in the article it traces to. Source pages are read-only; re-derive from Notion rather than editing facts here.

## 1. Creating an Intake Request (P2P)

#### PRD-KBPTP-001 — Raise a "New Activity" purchase intake request and trigger its approval workflow

- **Why it matters.** The Purchase Intake Request is how end users start a purchase without email; submitting it must trigger the approval workflow that later creates the Purchase Request.
- **Setup.** End user / requestor (e.g. departmental, operations, admin or planning team member) with access to the Intake page; at least one product in the catalogue and a delivery location.
- **Steps.**
  1. Navigate to the "Intake" page from the left-side navigation panel.
  2. Click "Create Request".
  3. On the Create Intake Request page, enter a Request Title.
  4. Select the Request Condition "New Activity".
  5. Click "Next" to the Basic Details section, then "Next" to the Details Page.
  6. Select the Currency and fill any custom fields shown.
  7. In Product Details, search and select the Product Name, enter Quantity, choose the Unit of Measure and select the Delivery Location.
  8. Click "Next" to view the Approval Workflow; review and confirm the approval chain.
  9. Click "Next" to submit the intake.
- **Expected.** The intake is submitted and the approval workflow is triggered.
- **Oracle.** The submitted intake shows its approval workflow (approval chain) as started.
- **Trace.** P0 · automate-later · `21692226c8b283279eb4810c63ab49df` · `creating-an-intake-request-p2p` · Notion KB › P2P › Creating an Intake Request (P2P)

#### PRD-KBPTP-002 — Approval chain is auto-assigned on the Approval Workflow step

- **Why it matters.** Requestors do not pick approvers; the chain is determined by category, department or configuration, and must be visible before submission.
- **Setup.** Requestor mid-way through an intake request with product details filled.
- **Steps.**
  1. Click "Next" from the Details Page to reach the Approval Workflow.
  2. Review the approval chain shown.
- **Expected.** The Approval Workflow is auto-determined based on category, department or configuration, and the system automatically assigns the approval chain based on the selected categories or item details.
- **Oracle.** The Approval Workflow step shows a pre-filled approval chain the requestor did not enter.
- **Trace.** P0 · automate-later · `21692226c8b283279eb4810c63ab49df` · `creating-an-intake-request-p2p` · Notion KB › P2P › Creating an Intake Request (P2P)

#### PRD-KBPTP-003 — Approved purchase intake automatically generates a Purchase Request

- **Why it matters.** The whole value of the intake flow is that approval produces a Purchase Request with no manual procurement step.
- **Setup.** A submitted purchase intake request; access to its approver(s).
- **Steps.**
  1. Submit a purchase intake request (as in PRD-KBPTP-001).
  2. Have the approver(s) in its workflow approve it.
- **Expected.** Once approved, the system automatically generates a Purchase Request, enabling procurement to proceed in Procol.
- **Oracle.** A Purchase Request exists for the approved intake.
- **Trace.** P0 · automate-later · `21692226c8b283279eb4810c63ab49df` · `creating-an-intake-request-p2p` · Notion KB › P2P › Creating an Intake Request (P2P)

#### PRD-KBPTP-004 — Selecting a Product Name auto-fills the Product Code

- **Why it matters.** The product code drives downstream PR/PO data; auto-fill prevents mismatched codes.
- **Setup.** Requestor on the Product Details section of an intake request.
- **Steps.**
  1. Search and select a Product Name in a product row.
- **Expected.** The Product Code is auto-filled from the selected product.
- **Oracle.** The row's Product Code field is populated without being typed.
- **Trace.** P1 · automate-later · `21692226c8b283279eb4810c63ab49df` · `creating-an-intake-request-p2p` · Notion KB › P2P › Creating an Intake Request (P2P)

#### PRD-KBPTP-005 — Add multiple product rows and delete a row with the Red Bin icon

- **Why it matters.** One intake can request several materials; rows must be addable and removable before submission.
- **Setup.** Requestor on the Product Details section with one filled product row.
- **Steps.**
  1. Click on the cell in the next row and fill Product Name, Quantity, Unit of Measure and Delivery Location.
  2. Repeat for another row.
  3. Click the Red Bin icon on one row.
- **Expected.** A new blank row is added every time a next-row cell is used; the binned row is deleted.
- **Oracle.** The product table shows the remaining rows only, plus a trailing blank row.
- **Trace.** P2 · automate-later · `21692226c8b283279eb4810c63ab49df` · `creating-an-intake-request-p2p` · Notion KB › P2P › Creating an Intake Request (P2P)

#### PRD-KBPTP-006 — Optional Vendor Information / Budget Information sections depend on form setup

- **Why it matters.** These sections are configuration-dependent; an intake must be submittable with them left empty when they are optional.
- **Setup.** Requestor on a client whose intake form includes Vendor Information and/or Budget Information sections.
- **Steps.**
  1. Fill the mandatory intake details and product rows.
  2. Leave (or fill) the Vendor Information / Budget Information sections.
  3. Continue to the Approval Workflow and submit.
- **Expected.** The sections appear according to the form setup and are optional.
- **Oracle.** The intake proceeds to the Approval Workflow with the optional sections empty.
- **Trace.** P2 · manual · `21692226c8b283279eb4810c63ab49df` · `creating-an-intake-request-p2p` · Notion KB › P2P › Creating an Intake Request (P2P)

#### PRD-KBPTP-007 — Recover an unfinished intake draft with "Continue editing"

- **Why it matters.** Requestors who leave mid-way should not have to re-enter the request.
- **Setup.** Requestor who started an intake request and left the page before submitting.
- **Steps.**
  1. Return to the Intake page.
  2. Click "Continue editing" on the saved draft.
- **Expected.** The saved draft is recovered with the previously entered details.
- **Oracle.** The intake form reopens with the earlier values filled.
- **Trace.** P2 · automate-later · `21692226c8b283279eb4810c63ab49df` · `creating-an-intake-request-p2p` · Notion KB › P2P › Creating an Intake Request (P2P)

## 2. How to Approve and Complete an Intake Request

#### PRD-KBPTP-008 — Submitted intake shows a visual approval flowchart with creator, current approver and levels

- **Why it matters.** The flowchart is the audit view of who must approve and in what order.
- **Setup.** An intake request just submitted whose workflow has more than one approval level; approver or requestor logged in.
- **Steps.**
  1. Open the submitted intake request.
  2. Look at the approval workflow.
- **Expected.** An approval workflow was triggered automatically, and a visual flowchart shows the name of the user who created the intake, the current approver(s), and each approval level in sequential order.
- **Oracle.** The flowchart lists the creator, the current approver(s) and the levels in order.
- **Trace.** P0 · automate-later · `6de92226c8b282fa99c80193cfd223fe` · `how-to-approve-and-complete-an-intake-request` · Notion KB › P2P › How to Approve and Complete an Intake Request

#### PRD-KBPTP-009 — Approver approves an intake with remarks; workflow and Comments tab update

- **Why it matters.** Each approval must be recorded with who and when, and remarks must be preserved.
- **Setup.** Approver (department head, budget owner or procurement lead) who is the current approver of a submitted intake request.
- **Steps.**
  1. Open the intake request.
  2. Enter a remark in the Remarks / Comments field.
  3. Click Approve.
- **Expected.** The workflow updates in real time to show who approved and the timestamp; the remark is visible in the Comments tab on the right.
- **Oracle.** The flowchart shows the approver's name and timestamp against their level; the Comments tab shows the remark.
- **Trace.** P0 · automate-later · `6de92226c8b282fa99c80193cfd223fe` · `how-to-approve-and-complete-an-intake-request` · Notion KB › P2P › How to Approve and Complete an Intake Request

#### PRD-KBPTP-010 — Approver rejects an intake; workflow records who rejected and when

- **Why it matters.** Rejection is the control half of the approval; it must be recorded as clearly as an approval.
- **Setup.** Approver who is the current approver of a submitted intake request.
- **Steps.**
  1. Open the intake request.
  2. Enter a remark explaining the rejection.
  3. Click Reject.
- **Expected.** The workflow updates in real time to show who rejected and the timestamp; the remark appears in the Comments tab.
- **Oracle.** The flowchart shows the rejection with approver name and timestamp; the Comments tab shows the remark.
- **Trace.** P0 · automate-later · `6de92226c8b282fa99c80193cfd223fe` · `how-to-approve-and-complete-an-intake-request` · Notion KB › P2P › How to Approve and Complete an Intake Request

#### PRD-KBPTP-011 — Remarks are optional when approving an intake

- **Why it matters.** The article calls remarks optional (but encouraged); approval must not be blocked when none are given.
- **Setup.** Approver who is the current approver of a submitted intake request.
- **Steps.**
  1. Open the intake request.
  2. Leave the Remarks / Comments field empty.
  3. Click Approve.
- **Expected.** The approval goes through without a remark.
- **Oracle.** The workflow shows the approval with name and timestamp.
- **Trace.** P1 · automate-later · `6de92226c8b282fa99c80193cfd223fe` · `how-to-approve-and-complete-an-intake-request` · Notion KB › P2P › How to Approve and Complete an Intake Request

#### PRD-KBPTP-012 — Multi-level intake approval proceeds level by level in sequence

- **Why it matters.** Sequential levels mean a later approver should act only after the earlier level; order is a compliance control.
- **Setup.** Submitted intake whose workflow has at least two approval levels; both approvers available.
- **Steps.**
  1. As the level-1 approver, approve the intake.
  2. Check the flowchart for the current approver.
  3. As the level-2 approver, approve the intake.
- **Expected.** The levels appear in sequential order and the workflow moves from level 1 to level 2 as each approves.
- **Oracle.** After level 1 approves, the flowchart shows level 2 as the current approver; both approvals carry timestamps in order.
- **Trace.** P0 · automate-later · `6de92226c8b282fa99c80193cfd223fe` · `how-to-approve-and-complete-an-intake-request` · Notion KB › P2P › How to Approve and Complete an Intake Request

#### PRD-KBPTP-013 — All approvals complete: Purchase Request generated and linked on the workflow chart

- **Why it matters.** This is the hand-off from intake to procurement; the PR must be created and reachable from the intake.
- **Setup.** An intake created to initiate a Purchase Request, with all but the last approval done; last approver logged in.
- **Steps.**
  1. As the last approver, approve the intake.
  2. Wait a few minutes and reopen the intake's workflow chart.
  3. Click the Purchase Request hyperlink on the workflow chart.
- **Expected.** The system automatically generates a Purchase Request within minutes; a hyperlink to it appears on the workflow chart; clicking it opens the Purchase Request detail page directly.
- **Oracle.** The workflow chart shows the PR hyperlink and it opens the Purchase Request detail page.
- **Trace.** P0 · automate-later · `6de92226c8b282fa99c80193cfd223fe` · `how-to-approve-and-complete-an-intake-request` · Notion KB › P2P › How to Approve and Complete an Intake Request

#### PRD-KBPTP-014 — Fully approved intake is complete and closed

- **Why it matters.** A completed intake must leave the approval queue; a lingering open intake could be acted on twice.
- **Setup.** An intake that has received all approvals and generated its Purchase Request.
- **Steps.**
  1. Open the intake request after the final approval.
- **Expected.** The intake request is considered complete and closed in the system.
- **Oracle.** The intake shows as complete/closed and no further approval action is pending on it.
- **Trace.** P0 · automate-later · `6de92226c8b282fa99c80193cfd223fe` · `how-to-approve-and-complete-an-intake-request` · Notion KB › P2P › How to Approve and Complete an Intake Request

#### PRD-KBPTP-015 — Approval workflow is selected by request category, line items or organisational policy

- **Why it matters.** Different requests must route to different approvers per policy; a wrong route bypasses the right approver.
- **Setup.** A client with at least two approval policies that differ by request category (or line items / department).
- **Steps.**
  1. Submit one intake matching policy A (e.g. one category).
  2. Submit another intake matching policy B (e.g. a different category).
  3. Compare the approval workflows of the two intakes.
- **Expected.** Each intake's workflow is selected according to the logic (request category, line items or organisational policy) it matches.
- **Oracle.** The two flowcharts show the approvers configured for their respective policies.
- **Trace.** P1 · manual · `6de92226c8b282fa99c80193cfd223fe` · `how-to-approve-and-complete-an-intake-request` · Notion KB › P2P › How to Approve and Complete an Intake Request

## 3. How to Raise a Purchase Intake Request

#### PRD-KBPTP-016 — Raise a purchase intake request (article flow) and submit it for approval

- **Why it matters.** This article is the main written procedure for purchase intakes; once approved it must yield a Purchase Request.
- **Setup.** End user / requestor with access to the Intake page. Note: the article as written selects Request Condition "Material Creation" with Category and Subcategory, then fills Product Details.
- **Steps.**
  1. Navigate to the "Intake" page from the left-side navigation panel and click "Create Request".
  2. Enter a Request Title.
  3. Select the Request Condition "Material Creation"; choose Category and Subcategory from the dropdowns that appear.
  4. Click "Next" to the Basic Details section, then "Next" to the Details Page.
  5. Select the Currency and fill any custom fields.
  6. In Product Details, select the Product Name, enter Quantity, choose the Unit of Measure and select the Delivery Location.
  7. Click "Next" to the Approval Workflow; review and confirm the auto-assigned approval chain.
  8. Click "Next" to submit.
- **Expected.** The intake is submitted and the approval workflow is triggered; once approved, the system automatically generates a Purchase Request.
- **Oracle.** The intake shows its approval workflow started; after approval a Purchase Request exists for it.
- **Trace.** P0 · automate-later · `e8b92226c8b2829a8ebd0120c9801743` · `how-to-raise-a-purchase-intake-request` · Notion KB › P2P › How to Raise a Purchase Intake Request

#### PRD-KBPTP-017 — Choosing Request Condition "Material Creation" reveals Category and Subcategory fields

- **Why it matters.** Category drives the auto-assigned approval chain; the fields must appear when the condition needs them.
- **Setup.** Requestor on the Create Intake Request page.
- **Steps.**
  1. Enter a Request Title.
  2. Select the Request Condition "Material Creation".
- **Expected.** Additional fields for Category and Subcategory appear, each with a dropdown of values.
- **Oracle.** Category and Subcategory dropdowns are visible after the selection and not before.
- **Trace.** P1 · automate-later · `e8b92226c8b2829a8ebd0120c9801743` · `how-to-raise-a-purchase-intake-request` · Notion KB › P2P › How to Raise a Purchase Intake Request

#### PRD-KBPTP-018 — Add several products and delete a row before submitting the purchase intake

- **Why it matters.** Multi-line purchase requests are common; row add/delete must work before submission.
- **Setup.** Requestor on the Product Details section of a purchase intake.
- **Steps.**
  1. Fill a first product row (Product Name, Quantity, Unit of Measure, Delivery Location).
  2. Click on the cell in the next row and fill a second product.
  3. Click the Red Bin icon on one row.
- **Expected.** A new blank row is added every time; the binned row is deleted.
- **Oracle.** Only the kept product rows remain in the table.
- **Trace.** P2 · automate-later · `e8b92226c8b2829a8ebd0120c9801743` · `how-to-raise-a-purchase-intake-request` · Notion KB › P2P › How to Raise a Purchase Intake Request

#### PRD-KBPTP-019 — Material not in the catalogue: raise a Material Creation request instead

- **Why it matters.** The article directs requestors to the material creation flow when the material does not exist, rather than a free-text purchase.
- **Setup.** Requestor raising a purchase intake for a material that does not exist in the system.
- **Steps.**
  1. In Product Details, search for the material by Product Name.
  2. When it is not found, follow the article's pointer to raise a Material Creation request via Intake.
- **Expected.** The material cannot be selected in the purchase intake, and the requestor is pointed to the Material Creation request flow.
- **Oracle.** The tester confirms the material is absent from the Product Name search and the Material Creation intake is available.
- **Trace.** P2 · manual · `e8b92226c8b2829a8ebd0120c9801743` · `how-to-raise-a-purchase-intake-request` · Notion KB › P2P › How to Raise a Purchase Intake Request

#### PRD-KBPTP-020 — Recover a purchase intake draft with "Continue editing"

- **Why it matters.** Saved drafts protect requestors from losing a partly filled request.
- **Setup.** Requestor who started a purchase intake and left before submitting.
- **Steps.**
  1. Return to the Intake page.
  2. Click "Continue editing".
- **Expected.** The saved draft is recovered.
- **Oracle.** The intake form reopens with the earlier entries.
- **Trace.** P2 · automate-later · `e8b92226c8b2829a8ebd0120c9801743` · `how-to-raise-a-purchase-intake-request` · Notion KB › P2P › How to Raise a Purchase Intake Request

## 4. How to Raise a Material Creation Request via Intake

#### PRD-KBPTP-021 — Raise a Material Creation intake request and trigger its approval workflow

- **Why it matters.** New materials enter the material master through this approved intake; submission must start the approval.
- **Setup.** Requestor / end user (operations or planning) with access to the Intake page.
- **Steps.**
  1. Navigate to the "Intake" page and click "Create Request".
  2. Enter a Request Title (e.g. "Add New Raw Material - HDPE Granules").
  3. Select the Request Condition "Material Creation".
  4. Click "Next" to the Basic Details section.
  5. Fill Item Description, Item Type, Unit of Measure, Category and Subcategory (Material Code optional).
  6. Click "Next" to review the Approval Workflow; review and confirm the auto-assigned approval chain.
  7. Click "Next" to submit.
- **Expected.** The intake is submitted and the approval workflow is triggered.
- **Oracle.** The submitted intake shows its approval workflow started.
- **Trace.** P0 · automate-later · `82192226c8b28291bfc6814887cc47c9` · `how-to-raise-a-material-creation-request-via-intake` · Notion KB › P2P › How to Raise a Material Creation Request via Intake

#### PRD-KBPTP-022 — Approved Material Creation request results in the material being added to the system

- **Why it matters.** The request is only useful if approval leads to the material existing in the master.
- **Setup.** A submitted Material Creation intake; its approver(s); access to the material master.
- **Steps.**
  1. Have all approvers in the workflow approve the intake.
  2. Check the material master after the relevant team / integration has processed it.
- **Expected.** Upon approval, the material is added to the system by the relevant team or system integration process.
- **Oracle.** The requested material is present in the material master.
- **Trace.** P0 · manual · `82192226c8b28291bfc6814887cc47c9` · `how-to-raise-a-material-creation-request-via-intake` · Notion KB › P2P › How to Raise a Material Creation Request via Intake

#### PRD-KBPTP-023 — Item Type offers "Material" or "Service"

- **Why it matters.** Item Type classifies the new master record; both values the article names must be selectable.
- **Setup.** Requestor on the material creation fields of a Material Creation intake.
- **Steps.**
  1. Open the Item Type field.
  2. Select "Material"; then change it to "Service".
- **Expected.** Item Type lets the requestor choose between "Material" and "Service".
- **Oracle.** Both options are offered and the chosen one is kept.
- **Trace.** P2 · automate-later · `82192226c8b28291bfc6814887cc47c9` · `how-to-raise-a-material-creation-request-via-intake` · Notion KB › P2P › How to Raise a Material Creation Request via Intake

#### PRD-KBPTP-024 — Material Code is optional and can be left blank

- **Why it matters.** Requestors often do not know the code; leaving it blank must not block the request (it is generated later).
- **Setup.** Requestor on the material creation fields of a Material Creation intake.
- **Steps.**
  1. Fill Item Description, Item Type, Unit of Measure (e.g. KG, NOS), Category and Subcategory.
  2. Leave Material Code blank.
  3. Click "Next" to the Approval Workflow.
- **Expected.** The request proceeds with Material Code left blank, to be generated later.
- **Oracle.** The Approval Workflow step is reached with no Material Code entered.
- **Trace.** P1 · automate-later · `82192226c8b28291bfc6814887cc47c9` · `how-to-raise-a-material-creation-request-via-intake` · Notion KB › P2P › How to Raise a Material Creation Request via Intake

#### PRD-KBPTP-025 — Request several materials in one intake and delete a row

- **Why it matters.** One Material Creation intake can carry multiple new materials; rows must be addable and removable.
- **Setup.** Requestor with one material row filled.
- **Steps.**
  1. Click on the cell in the next row and fill a second material.
  2. Click the Red Bin icon on one row.
- **Expected.** A new blank row is added every time; the binned row is deleted.
- **Oracle.** Only the kept material rows remain.
- **Trace.** P2 · automate-later · `82192226c8b28291bfc6814887cc47c9` · `how-to-raise-a-material-creation-request-via-intake` · Notion KB › P2P › How to Raise a Material Creation Request via Intake

## 5. How to Create Budgets and Manage Budgets

#### PRD-KBPTP-026 — Budget Management page shows Budget Department List and Budget Update Request List tabs

- **Why it matters.** These lists are where budget owners track budgets and update requests.
- **Setup.** User with access to Budget Management.
- **Steps.**
  1. Navigate to Budget Management from the left-side navigation panel.
  2. Open each tab.
- **Expected.** Two tabs: Budget Department List (budgets department-wise with status, period type, fiscal year range, allocated budget, spent budget and participant teams) and Budget Update Request List (all submitted budget update requests).
- **Oracle.** Both tabs are present and the Budget Department List shows those columns.
- **Trace.** P2 · automate-later · `b5892226c8b283db8d3b014ac12c4823` · `how-to-create-budgets-and-manage-budgets` · Notion KB › P2P › How to Create Budgets and Manage Budgets

#### PRD-KBPTP-027 — Create a department budget with categories and submit it for approval

- **Why it matters.** Budgets cap departmental spend; creation must end in an Approval Note routed through the approval workflow.
- **Setup.** Budget owner with access to Budget Management; a department, period type and fiscal year range to budget for; participant teams available.
- **Steps.**
  1. On Budget Management, click "+ New".
  2. On the Budget Creation page, fill Department Name, Period Type and Fiscal Year Range.
  3. Assign participant teams from the dropdown lists.
  4. In the Budget Category List tab, click "+ New" and fill Category Name, Budget Allocated and Budget Spent.
  5. Click "Submit Budget".
  6. Review the Approval Workflow preview and click "Submit".
- **Expected.** An Approval Note is generated showing the budget details and approval workflow; once approved the budget is created.
- **Oracle.** The Approval Note exists with the budget details and workflow; the budget appears in the Budget Department List.
- **Trace.** P0 · automate-later · `b5892226c8b283db8d3b014ac12c4823` · `how-to-create-budgets-and-manage-budgets` · Notion KB › P2P › How to Create Budgets and Manage Budgets

#### PRD-KBPTP-028 — Budget category Balance Amount is auto-calculated as Allocated minus Spent

- **Why it matters.** Balance is the money figure every later spend check relies on; a wrong balance lets spend exceed the budget.
- **Setup.** Budget owner on the Budget Creation page, Budget Category List tab.
- **Steps.**
  1. Click "+ New" under the Budget Category List tab.
  2. Enter a Category Name, Budget Allocated 100000 and Budget Spent 25000.
- **Expected.** The Balance Amount is auto-calculated as Allocated − Spent.
- **Oracle.** The Balance Amount shows 75000 without being typed.
- **Trace.** P0 · automate-later · `b5892226c8b283db8d3b014ac12c4823` · `how-to-create-budgets-and-manage-budgets` · Notion KB › P2P › How to Create Budgets and Manage Budgets

#### PRD-KBPTP-029 — Budget-level Allocated, Spent and Balance are system-calculated, not user-entered

- **Why it matters.** Header money totals must come from the system; user-entered totals could disagree with the category figures.
- **Setup.** Budget owner on the Budget Creation page.
- **Steps.**
  1. Click "Show More".
  2. Inspect the Allocated Budget, Spent Budget and Balance Amount fields.
  3. Add budget categories with allocated and spent amounts.
- **Expected.** These fields are automatically calculated based on later entries and are to be ignored when creating the budget.
- **Oracle.** The tester confirms the three fields are filled by the system from the entries, not by the user.
- **Trace.** P0 · manual · `b5892226c8b283db8d3b014ac12c4823` · `how-to-create-budgets-and-manage-budgets` · Notion KB › P2P › How to Create Budgets and Manage Budgets

#### PRD-KBPTP-030 — Budget aggregate fields are calculated later (section-page description)

- **Why it matters.** The P2P section page independently states the allocated / spent / balance fields are aggregates; this confirms they are derived money fields.
- **Setup.** Budget owner on the budget creation form.
- **Steps.**
  1. Open the budget creation form.
  2. Leave allocated budget, spent budget and balance amount untouched.
  3. Add categories in the Budget category list ('Plus new', select a category type, enter the budget allocated).
- **Expected.** Allocated budget, spent budget and balance amount are aggregate fields calculated later, not filled on creation.
- **Oracle.** The tester confirms the three fields reflect system aggregation after categories are added.
- **Trace.** P0 · manual · `2db92226c8b282b98e2b011440f7e0e2` · `p2p-section-overview` · Notion KB › P2P › P2P (section page, budget form)

#### PRD-KBPTP-031 — New budget starts in Draft status

- **Why it matters.** A new budget must not be live before approval; Draft is the stated starting state.
- **Setup.** Budget owner on the budget creation form.
- **Steps.**
  1. Click "+ New" on Budget Management.
  2. Select the department name, the type and the fiscal year range.
  3. Look at the status.
- **Expected.** The status is automatically in the Draft state.
- **Oracle.** The status field shows Draft without the user setting it.
- **Trace.** P1 · automate-later · `2db92226c8b282b98e2b011440f7e0e2` · `p2p-section-overview` · Notion KB › P2P › P2P (section page, budget form)

#### PRD-KBPTP-032 — At most 4 participant teams can be assigned to a budget

- **Why it matters.** The article states a limit of up to 4 participant teams; the form must enforce it.
- **Setup.** Budget owner on the Budget Creation page; at least five teams exist.
- **Steps.**
  1. Assign participant teams from the dropdown lists, one after another.
  2. Try to assign a fifth team.
- **Expected.** Up to 4 participant teams can be assigned; no fifth team can be added.
- **Oracle.** Only four participant-team dropdowns / selections are available.
- **Trace.** P1 · automate-later · `b5892226c8b283db8d3b014ac12c4823` · `how-to-create-budgets-and-manage-budgets` · Notion KB › P2P › How to Create Budgets and Manage Budgets

#### PRD-KBPTP-033 — Approval Status and Budget Status are set automatically

- **Why it matters.** If a creator could set Approval or Budget Status, they could bypass the approval workflow.
- **Setup.** Budget owner on the Budget Creation page.
- **Steps.**
  1. Locate the Approval Status and Budget Status fields.
  2. Try to change them.
- **Expected.** Approval Status and Budget Status are determined automatically based on system rules.
- **Oracle.** The two fields are system-set and not editable by the creator.
- **Trace.** P1 · automate-later · `b5892226c8b283db8d3b014ac12c4823` · `how-to-create-budgets-and-manage-budgets` · Notion KB › P2P › How to Create Budgets and Manage Budgets

#### PRD-KBPTP-034 — Add multiple budget categories in one budget and delete one

- **Why it matters.** A department budget is split across categories; adding and removing category budgets before submission is part of the money set-up.
- **Setup.** Budget owner on the Budget Creation page, Budget Category List tab.
- **Steps.**
  1. Click "+ New" and fill a first category (Category Name, Budget Allocated, Budget Spent).
  2. Click "+ New" again and fill a second category.
  3. Click the Delete icon next to one category.
- **Expected.** Multiple category budgets can be added at once; the deleted category is removed.
- **Oracle.** The Budget Category List shows only the kept categories with their balances.
- **Trace.** P1 · automate-later · `b5892226c8b283db8d3b014ac12c4823` · `how-to-create-budgets-and-manage-budgets` · Notion KB › P2P › How to Create Budgets and Manage Budgets

#### PRD-KBPTP-035 — Budget Creation page shows Budget Category List, Budget Update Request List and Purchase Requisition tabs

- **Why it matters.** The Purchase Requisition tab is where spend against the budget is traced to PRs.
- **Setup.** Budget owner on the Budget Creation page (or an existing budget) with at least one PR linked to the budget.
- **Steps.**
  1. Scroll to the bottom of the page.
  2. Open each of the three tabs.
- **Expected.** Three tabs: Budget Category List (category budgets), Budget Update Request List (view and manage update requests) and Purchase Requisition (PRs linked to the budget). The section page names the third tab "Purchase acquisition".
- **Oracle.** The Purchase Requisition tab lists the PR linked to this budget.
- **Trace.** P1 · manual · `b5892226c8b283db8d3b014ac12c4823` · `how-to-create-budgets-and-manage-budgets` · Notion KB › P2P › How to Create Budgets and Manage Budgets

#### PRD-KBPTP-036 — "Show More" reveals additional customizable budget fields

- **Why it matters.** Client-specific budget fields are hidden behind Show More; they must be reachable.
- **Setup.** Budget owner on the Budget Creation page.
- **Steps.**
  1. Click "Show More".
- **Expected.** Additional customizable fields that were hidden are revealed.
- **Oracle.** More fields are visible after the click than before.
- **Trace.** P3 · automate-later · `b5892226c8b283db8d3b014ac12c4823` · `how-to-create-budgets-and-manage-budgets` · Notion KB › P2P › How to Create Budgets and Manage Budgets

## 6. How to Approve Budgets

#### PRD-KBPTP-037 — Approver finds a pending budget request in Approvals and opens its Approval Note

- **Why it matters.** Approvers must be able to find and review the full budget before deciding.
- **Setup.** Approver in the workflow of a submitted budget.
- **Steps.**
  1. Log in to Procol.
  2. Go to the Approvals tab from the left-side navigation panel.
  3. Locate the budget approval request pending your action and click it.
- **Expected.** The Approval Note page appears with an Overview section (budget details) and a Details section (budget categories, amounts and workflow information).
- **Oracle.** The Approval Note shows both sections with the submitted categories and amounts.
- **Trace.** P0 · automate-later · `f4492226c8b2835a8247014776b1742d` · `how-to-approve-budgets` · Notion KB › P2P › How to Approve Budgets

#### PRD-KBPTP-038 — Approver approves a budget (with optional remarks); workflow moves to the next approver

- **Why it matters.** Each approval must advance the budget along the configured sequence.
- **Setup.** First approver in a multi-approver budget workflow.
- **Steps.**
  1. Open the budget's Approval Note from the Approvals tab.
  2. Review the budget information.
  3. (Optional) Add remarks in the remarks field.
  4. Click Approve.
- **Expected.** The approval is submitted and the workflow automatically moves to the next approver in the sequence.
- **Oracle.** The workflow shows this approval recorded and the next approver as pending.
- **Trace.** P0 · automate-later · `f4492226c8b2835a8247014776b1742d` · `how-to-approve-budgets` · Notion KB › P2P › How to Approve Budgets

#### PRD-KBPTP-039 — Approver rejects a budget that needs changes

- **Why it matters.** Rejection stops a wrong budget becoming active.
- **Setup.** Approver in the workflow of a submitted budget.
- **Steps.**
  1. Open the budget's Approval Note from the Approvals tab.
  2. Add remarks describing the needed changes.
  3. Click Reject.
- **Expected.** The request is rejected; the budget does not reach Approved status.
- **Oracle.** The tester confirms the request is no longer pending for this approver and the budget status is not Approved.
- **Trace.** P0 · manual · `f4492226c8b2835a8247014776b1742d` · `how-to-approve-budgets` · Notion KB › P2P › How to Approve Budgets

#### PRD-KBPTP-040 — Budget becomes Approved and active only after all approvers approve

- **Why it matters.** A budget that goes live after a partial approval would let spend start without full sign-off.
- **Setup.** Submitted budget with two or more approvers.
- **Steps.**
  1. Have the first approver approve.
  2. Check the budget status.
  3. Have the remaining approver(s) approve.
  4. Check the budget status again.
- **Expected.** After the partial approval the budget is not yet Approved; when all approvers have approved, the budget status updates to Approved and the budget becomes active for the specified department and categories.
- **Oracle.** Budget status reads Approved only after the last approval.
- **Trace.** P0 · automate-later · `f4492226c8b2835a8247014776b1742d` · `how-to-approve-budgets` · Notion KB › P2P › How to Approve Budgets

## 7. How to create Contracts

#### PRD-KBPTP-041 — Start a new contract with Contract ID, Name, Draft Status and Start Date

- **Why it matters.** Contracts are applied in intake and at PO level, so the contract record is part of the money flow; the article covers only the start of creation.
- **Setup.** User with access to the Contracts page.
- **Steps.**
  1. Navigate to the Contracts page from the left-side navigation panel.
  2. Click "+ New".
  3. On the Contract page, fill Contract ID, Contract Name, Draft Status and Start Date.
  4. Click "Show More" and review the additional fields.
- **Expected.** The Contract page accepts the required details; the article does not state what happens on save.
- **Oracle.** The tester confirms the fields accept the values and records how the contract is saved (not described in the article).
- **Trace.** P0 · manual · `cab92226c8b28262bd1c01329f677574` · `how-to-create-contracts` · Notion KB › P2P › How to create Contracts

#### PRD-KBPTP-042 — Contract fields use the stated input types

- **Why it matters.** The article names each field's input type; a wrong control breaks data entry.
- **Setup.** User on the Contract creation page.
- **Steps.**
  1. Inspect Contract ID, Contract Name, Draft Status and Start Date.
- **Expected.** Contract ID and Contract Name are text, Draft Status is a dropdown, Start Date is a calendar select.
- **Oracle.** Each field renders the stated control.
- **Trace.** P2 · automate-later · `cab92226c8b28262bd1c01329f677574` · `how-to-create-contracts` · Notion KB › P2P › How to create Contracts

#### PRD-KBPTP-043 — "Show More" reveals additional customizable contract fields

- **Why it matters.** Client-specific contract fields sit behind Show More.
- **Setup.** User on the Contract creation page.
- **Steps.**
  1. Click "Show More".
- **Expected.** Additional customizable fields are revealed.
- **Oracle.** More fields are visible after the click than before.
- **Trace.** P3 · automate-later · `cab92226c8b28262bd1c01329f677574` · `how-to-create-contracts` · Notion KB › P2P › How to create Contracts
