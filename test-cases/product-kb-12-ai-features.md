# Product KB test cases — AI Features

Generated from the Procol Notion Knowledge Base (help-centre articles) — each case is grounded in the article it traces to. Source pages are read-only; re-derive from Notion rather than editing facts here.

AI output is non-deterministic: every Oracle below checks the observable effect the article states (questions appear, fields populated, a response or suggestion list shown), never specific generated text.

## 1. Creating an Intake Request using AI

#### PRD-KBAI-001 — Requester raises an intake by describing the need and submits it into approval

- **Why it matters.** AI intake is the template-free entry to procurement; a submitted request must reach the organisation's approval workflow.
- **Setup.** End User / Requisitioner / Internal Requestor with access to the Intake page.
- **Steps.**
  1. Open the Intake page from the left-hand menu.
  2. Click "+ Create Intake AI" at the top-right corner.
  3. In the text box under "What do you want to buy?", type a request in plain English (e.g. "I want to buy 100 laptops.").
  4. Click "Next" and answer the follow-up questions the AI asks.
  5. Click "Next" and answer the further questions shown.
  6. Click "Submit".
- **Expected.** The AI fetches follow-up questions for the request; on submission the system searches for a suitable Approval Workflow and an Approval Workflow is automatically triggered based on the organisation's rules.
- **Oracle.** Follow-up question fields appear after each "Next" (content not checked); after Submit the intake shows an approval workflow triggered.
- **Trace.** P0 · automate-later · `98b92226c8b282d2bdf8018a8b4dd978` · `creating-an-intake-request-using-ai` · Notion KB › AI Features › Creating an Intake Request using AI

#### PRD-KBAI-002 — First "Next" produces basic purchase-detail questions

- **Why it matters.** The AI must turn a one-line request into structured basic details (what, how many, where, budget) the PR needs.
- **Setup.** Requester on the "What do you want to buy?" page after clicking "+ Create Intake AI".
- **Steps.**
  1. Type a request (e.g. "I want to buy 100 laptops.").
  2. Click "Next".
- **Expected.** The system analyses the input and prompts for basic purchase details relevant to the request (for laptops, e.g. model or brand, quantity, delivery location, budget).
- **Oracle.** A set of basic-detail question fields is displayed after Next (count and wording not asserted).
- **Trace.** P2 · automate-later · `98b92226c8b282d2bdf8018a8b4dd978` · `creating-an-intake-request-using-ai` · Notion KB › AI Features › Creating an Intake Request using AI

#### PRD-KBAI-003 — Second "Next" produces technical, support and optional fields

- **Why it matters.** Technical and support details decide what gets sourced; the AI is expected to ask for them based on the item.
- **Setup.** Requester who has answered the basic purchase-detail questions.
- **Steps.**
  1. Click "Next".
  2. Review the questions and fields shown.
- **Expected.** The system asks technical specifications for the item (for laptops, e.g. RAM size, processor type, storage capacity), may ask operational/support questions (e.g. warranty type, support service preferences), and additional fields may appear such as optional notes or descriptions and attachments.
- **Oracle.** A further set of question fields appears after Next; judge whether it covers item specifications and whether notes/attachments fields are offered (AI-dependent, no fixed wording).
- **Trace.** P2 · manual · `98b92226c8b282d2bdf8018a8b4dd978` · `creating-an-intake-request-using-ai` · Notion KB › AI Features › Creating an Intake Request using AI

#### PRD-KBAI-004 — Requester can review or go back to edit before submitting

- **Why it matters.** Requesters must be able to correct answers before the request enters approval.
- **Setup.** Requester who has answered all required AI questions.
- **Steps.**
  1. Choose to review the collected inputs.
  2. Go back and edit an earlier answer.
  3. Return and click "Submit".
- **Expected.** Once all required inputs are collected, the requester can review or go back to edit; the edited answer is carried into the submission.
- **Oracle.** The edited value is shown on review and in the submitted request.
- **Trace.** P2 · manual · `98b92226c8b282d2bdf8018a8b4dd978` · `creating-an-intake-request-using-ai` · Notion KB › AI Features › Creating an Intake Request using AI

#### PRD-KBAI-005 — Approved AI intake automatically generates a PR in Open state

- **Why it matters.** The intake only pays off when approval produces a Purchase Request that procurement can act on.
- **Setup.** An AI intake request submitted and pending in its approval workflow; approver able to approve it.
- **Steps.**
  1. Approve the intake request through its approval workflow.
  2. Open the intake and check for the generated PR.
  3. Click the Blue Icon to open the PR Details page.
- **Expected.** Once approved, a Purchase Request (PR) is generated automatically from the intake and is in Open State; the Blue Icon opens the PR Details page of that PR.
- **Oracle.** PR exists linked to the intake with status Open; PR Details page opens from the Blue Icon.
- **Trace.** P0 · automate-later · `98b92226c8b282d2bdf8018a8b4dd978` · `creating-an-intake-request-using-ai` · Notion KB › AI Features › Creating an Intake Request using AI

#### PRD-KBAI-006 — Approval workflow chosen for the intake follows the organisation's rules

- **Why it matters.** The AI picks the workflow; picking the wrong one would route spend past the right approvers.
- **Setup.** Organisation with approval workflow rules configured; requester raising an AI intake.
- **Steps.**
  1. Submit an AI intake whose details match a known approval rule.
  2. Look at the approval workflow that is triggered.
- **Expected.** The system searches for the Approval Workflow best suited to the purchase and triggers one based on the organisation's rules.
- **Oracle.** The triggered workflow is the one the organisation's rules would select for that purchase.
- **Trace.** P1 · manual · `98b92226c8b282d2bdf8018a8b4dd978` · `creating-an-intake-request-using-ai` · Notion KB › AI Features › Creating an Intake Request using AI

#### PRD-KBAI-007 — AI intake works without a pre-configured intake template

- **Why it matters.** The article's promise is that no predefined forms or templates are needed; the flow must work for an item with no template.
- **Setup.** Requester in an organisation with no intake template configured for the item being requested.
- **Steps.**
  1. Click "+ Create Intake AI" and describe an item with no configured template.
  2. Click "Next" through the AI questions and click "Submit".
- **Expected.** The AI dynamically determines what to ask from the initial input and the intake can be submitted without a template.
- **Oracle.** Questions are generated and the intake submits successfully although no template exists.
- **Trace.** P2 · manual · `98b92226c8b282d2bdf8018a8b4dd978` · `creating-an-intake-request-using-ai` · Notion KB › AI Features › Creating an Intake Request using AI

## 2. How to Use Smart Grouping (PR Collator) on the Purchase Requisitions Page

#### PRD-KBAI-008 — Buyer applies AI Smart Grouping to the PR table

- **Why it matters.** Smart Grouping lets buyers process many PRs together; applied groups must actually reorganise the PR table.
- **Setup.** Buyer / Procurement Executive on the Purchase Requisitions page with several PRs.
- **Steps.**
  1. Click the "Smart Grouping" button above the PR table.
  2. In the Procol AI side panel, click a recommended prompt (e.g. Group by product category).
  3. Click the blue send icon.
  4. Wait for the AI response and click "Apply Grouping".
- **Expected.** The AI returns a response with a grouping logic explanation and the conditions applied; after Apply Grouping the PR table is updated with new Smart Groups.
- **Oracle.** An AI response block appears in the panel (content not checked); the PR table shows Smart Groups after applying.
- **Trace.** P1 · automate-later · `1d692226c8b282f3a96c81f187fb9d0c` · `how-to-use-smart-grouping-pr-collator-purchase-requisitions` · Notion KB › AI Features › How to Use Smart Grouping (PR Collator) on the Purchase Requisitions Page

#### PRD-KBAI-009 — Recommended grouping prompts are listed and paste into the chat input

- **Why it matters.** Recommended prompts are the quick start; clicking one must fill the input so it can be sent.
- **Setup.** Buyer with the Smart Grouping side panel open.
- **Steps.**
  1. Look at the recommended grouping prompts.
  2. Click one of them.
- **Expected.** Recommended prompts such as Group by product category, Create balanced groups and Group by delivery location are shown; clicking one pastes the relevant instruction into the AI chat input box.
- **Oracle.** The prompt list is visible; after the click the chat input box is non-empty.
- **Trace.** P2 · automate-later · `1d692226c8b282f3a96c81f187fb9d0c` · `how-to-use-smart-grouping-pr-collator-purchase-requisitions` · Notion KB › AI Features › How to Use Smart Grouping (PR Collator) on the Purchase Requisitions Page

#### PRD-KBAI-010 — Custom grouping instruction typed into the chat input

- **Why it matters.** Buyers need rules beyond the recommendations; a typed instruction must be processed the same way.
- **Setup.** Buyer with the Smart Grouping side panel open.
- **Steps.**
  1. Type a custom grouping rule in the chat input box.
  2. Click the blue send icon.
- **Expected.** The AI processes the request and returns a grouping logic explanation and the conditions being applied.
- **Oracle.** An AI response with grouping logic and conditions appears in the panel (content not checked).
- **Trace.** P2 · automate-later · `1d692226c8b282f3a96c81f187fb9d0c` · `how-to-use-smart-grouping-pr-collator-purchase-requisitions` · Notion KB › AI Features › How to Use Smart Grouping (PR Collator) on the Purchase Requisitions Page

#### PRD-KBAI-011 — Grouping Mode "Basic" loosely groups similar PRs

- **Why it matters.** Each mode sets how strict grouping is; Basic should allow flexible groups.
- **Setup.** Buyer with the Smart Grouping side panel open; PRs that are similar but not identical.
- **Steps.**
  1. Select "Basic" in the Grouping Mode dropdown.
  2. Send a grouping prompt and click "Apply Grouping".
- **Expected.** Similar PRs are grouped loosely, with flexibility.
- **Oracle.** Smart Groups can contain similar, non-identical PRs (reviewer judgement).
- **Trace.** P2 · manual · `1d692226c8b282f3a96c81f187fb9d0c` · `how-to-use-smart-grouping-pr-collator-purchase-requisitions` · Notion KB › AI Features › How to Use Smart Grouping (PR Collator) on the Purchase Requisitions Page

#### PRD-KBAI-012 — Grouping Mode "Balanced" mixes flexibility and strictness

- **Why it matters.** Balanced is the middle setting between Basic and Strict.
- **Setup.** Buyer with the Smart Grouping side panel open.
- **Steps.**
  1. Select "Balanced" in the Grouping Mode dropdown.
  2. Send a grouping prompt and click "Apply Grouping".
- **Expected.** Groups are formed with a mix of flexibility and strictness.
- **Oracle.** Resulting groups are no looser than Basic and no stricter than Strict on the same PRs (reviewer judgement).
- **Trace.** P2 · manual · `1d692226c8b282f3a96c81f187fb9d0c` · `how-to-use-smart-grouping-pr-collator-purchase-requisitions` · Notion KB › AI Features › How to Use Smart Grouping (PR Collator) on the Purchase Requisitions Page

#### PRD-KBAI-013 — Grouping Mode "Strict" groups only identical PRs

- **Why it matters.** Strict mode is the guarantee that nothing dissimilar ends up processed together.
- **Setup.** Buyer with the Smart Grouping side panel open; PRs including some identical and some similar ones.
- **Steps.**
  1. Select "Strict" in the Grouping Mode dropdown.
  2. Send a grouping prompt and click "Apply Grouping".
- **Expected.** Only identical PRs are grouped together.
- **Oracle.** Every Smart Group contains only identical PRs.
- **Trace.** P2 · manual · `1d692226c8b282f3a96c81f187fb9d0c` · `how-to-use-smart-grouping-pr-collator-purchase-requisitions` · Notion KB › AI Features › How to Use Smart Grouping (PR Collator) on the Purchase Requisitions Page

#### PRD-KBAI-014 — Modify Conditions lets the buyer re-edit and re-send the prompt

- **Why it matters.** Buyers refine grouping before applying it; the prompt must come back for editing.
- **Setup.** Buyer who has received an AI grouping response in the Smart Grouping panel.
- **Steps.**
  1. Click "Modify Conditions".
  2. Edit the prompt and click the blue send icon.
- **Expected.** The prompt can be re-edited and re-sent, and a new AI response is returned.
- **Oracle.** The prompt becomes editable after Modify Conditions; a new response appears after re-send.
- **Trace.** P2 · automate-later · `1d692226c8b282f3a96c81f187fb9d0c` · `how-to-use-smart-grouping-pr-collator-purchase-requisitions` · Notion KB › AI Features › How to Use Smart Grouping (PR Collator) on the Purchase Requisitions Page

#### PRD-KBAI-015 — Smart Grouping panel closes with the "X" icon

- **Why it matters.** Closing the panel must return the buyer to the (grouped) PR table.
- **Setup.** Buyer with the Smart Grouping side panel open.
- **Steps.**
  1. Click the "X" icon on the top-right of the side panel.
- **Expected.** The Smart Grouping panel closes.
- **Oracle.** The side panel is no longer displayed; the PR table is visible.
- **Trace.** P3 · automate-later · `1d692226c8b282f3a96c81f187fb9d0c` · `how-to-use-smart-grouping-pr-collator-purchase-requisitions` · Notion KB › AI Features › How to Use Smart Grouping (PR Collator) on the Purchase Requisitions Page

#### PRD-KBAI-016 — "Remove Grouping" restores the original PR view

- **Why it matters.** Grouping must be reversible without losing or altering PRs.
- **Setup.** Buyer on the Purchase Requisitions page with Smart Grouping applied.
- **Steps.**
  1. Click the "Remove Grouping" text beside the Smart Grouping button.
- **Expected.** The applied grouping is removed and the original PR view returns.
- **Oracle.** The PR table no longer shows Smart Groups and lists the same PRs as before grouping.
- **Trace.** P2 · automate-later · `1d692226c8b282f3a96c81f187fb9d0c` · `how-to-use-smart-grouping-pr-collator-purchase-requisitions` · Notion KB › AI Features › How to Use Smart Grouping (PR Collator) on the Purchase Requisitions Page

## 3. How to Use the RFP Generator (AI-Powered) for Technical Stage

#### PRD-KBAI-017 — Buyer generates Technical Stage questions with AI from PR line items

- **Why it matters.** The RFP Generator seeds the Technical Stage of a sourcing project; the create path depends on questions being generated.
- **Setup.** Buyer / Purchaser on the Purchase Request page with PR line items available.
- **Steps.**
  1. Select the checkbox next to one or more PR line items.
  2. Click the blue "Purchase Items" button, then the blue "Create Project" button in the side panel.
  3. Select "Technical Stage" among the events and click "Create Project" again.
  4. On the Event Creation page, click the "Event Type" showing "Technical Stage >".
  5. In the side panel, select "Generate question using AI" under "How will you create a Technical Stage?" and click "Save".
- **Expected.** The system automatically generates technical questions with AI for vendor assessment and product evaluation based on the line items added.
- **Oracle.** Generated questions appear in the Vendor Assessments and Line Items sections (content not checked).
- **Trace.** P1 · automate-later · `85492226c8b28282a6b801250a4be346` · `how-to-use-the-rfp-generator-ai-powered-for-technical-stage` · Notion KB › AI Features › How to Use the RFP Generator (AI-Powered) for Technical Stage

#### PRD-KBAI-018 — "Purchase Items" shows the selected count and the side panel lists items with quantities

- **Why it matters.** The buyer must see exactly which PR items and quantities go into the project.
- **Setup.** Buyer on the Purchase Request page.
- **Steps.**
  1. Select the checkboxes of several PR line items.
  2. Click the blue "Purchase Items" button.
- **Expected.** The "Purchase Items" button (and the "Create Project" button) show the number of items selected; the side panel shows all selected items with their respective quantities.
- **Oracle.** Count on the buttons equals the number of checked items; each selected item and its quantity is listed in the panel.
- **Trace.** P2 · automate-later · `85492226c8b28282a6b801250a4be346` · `how-to-use-the-rfp-generator-ai-powered-for-technical-stage` · Notion KB › AI Features › How to Use the RFP Generator (AI-Powered) for Technical Stage

#### PRD-KBAI-019 — RFP Generator is only reachable when "Technical Stage" is selected for the project

- **Why it matters.** The article makes Technical Stage a precondition for the RFP Generator; a buyer who skips it cannot generate questions.
- **Setup.** Buyer creating a sourcing project from selected PR line items.
- **Steps.**
  1. In the event selection, leave "Technical Stage" unselected and click "Create Project".
  2. On the Event Creation page, look for the Technical Stage event type and the "Generate question using AI" option.
- **Expected.** Without the Technical Stage selected, the RFP Generator is not accessible.
- **Oracle.** No "Technical Stage >" event type and no "Generate question using AI" option are available.
- **Trace.** P1 · automate-later · `85492226c8b28282a6b801250a4be346` · `how-to-use-the-rfp-generator-ai-powered-for-technical-stage` · Notion KB › AI Features › How to Use the RFP Generator (AI-Powered) for Technical Stage

#### PRD-KBAI-020 — AI chat applies a custom prompt to the Vendor Assessments section

- **Why it matters.** Buyers refine generated questions by section; changes must land in the section chosen.
- **Setup.** Buyer on a Technical Stage with AI-generated questions.
- **Steps.**
  1. Click the Green AI Icon to open the AI chat side panel.
  2. Choose "Vendor Assessments" as the section.
  3. Type an instruction in the textbox and click "Send".
- **Expected.** The system uses AI to make the changes to the Vendor Assessments section according to the prompt.
- **Oracle.** The Vendor Assessments questions change after Send while Line Items stay as before (content not checked).
- **Trace.** P2 · automate-later · `85492226c8b28282a6b801250a4be346` · `how-to-use-the-rfp-generator-ai-powered-for-technical-stage` · Notion KB › AI Features › How to Use the RFP Generator (AI-Powered) for Technical Stage

#### PRD-KBAI-021 — AI chat applies a prompt to the Line Items section

- **Why it matters.** The second target section must be editable by AI independently of Vendor Assessments.
- **Setup.** Buyer on a Technical Stage with AI-generated questions and the AI chat panel open.
- **Steps.**
  1. Choose "Line Items" as the section.
  2. Type an instruction and click "Send".
- **Expected.** The system uses AI to make the changes to the Line Items section according to the prompt.
- **Oracle.** Line Items questions change after Send while Vendor Assessments stay as before (content not checked).
- **Trace.** P2 · automate-later · `85492226c8b28282a6b801250a4be346` · `how-to-use-the-rfp-generator-ai-powered-for-technical-stage` · Notion KB › AI Features › How to Use the RFP Generator (AI-Powered) for Technical Stage

#### PRD-KBAI-022 — Suggested Action used instead of a typed prompt

- **Why it matters.** Suggested Actions are the quick path in the chat panel and must trigger the same AI edit.
- **Setup.** Buyer with the RFP Generator AI chat panel open.
- **Steps.**
  1. Pick a section (Vendor Assessments or Line Items).
  2. Click one of the Suggested Actions and send it.
- **Expected.** The AI makes changes to the chosen section according to the Suggested Action.
- **Oracle.** The chosen section's questions change after the Suggested Action is sent.
- **Trace.** P2 · automate-later · `85492226c8b28282a6b801250a4be346` · `how-to-use-the-rfp-generator-ai-powered-for-technical-stage` · Notion KB › AI Features › How to Use the RFP Generator (AI-Powered) for Technical Stage

#### PRD-KBAI-023 — Prompt sent with the Enter key

- **Why it matters.** The article offers Enter as an alternative to the Send button.
- **Setup.** Buyer with the RFP Generator AI chat panel open and a section chosen.
- **Steps.**
  1. Type an instruction in the textbox.
  2. Hit Enter.
- **Expected.** The prompt is sent and the AI makes changes to the chosen section.
- **Oracle.** The same processing and section change occur as with the Send button.
- **Trace.** P3 · automate-later · `85492226c8b28282a6b801250a4be346` · `how-to-use-the-rfp-generator-ai-powered-for-technical-stage` · Notion KB › AI Features › How to Use the RFP Generator (AI-Powered) for Technical Stage

#### PRD-KBAI-024 — "Undo Changes" reverts the AI's edit

- **Why it matters.** Buyers must be able to back out an unwanted AI rewrite of their RFP.
- **Setup.** Buyer whose Technical Stage questions were just changed by an AI chat prompt.
- **Steps.**
  1. Click "Undo Changes" in the chat panel.
- **Expected.** The changes made by the prompt are undone.
- **Oracle.** The affected section's questions return to their state before that prompt.
- **Trace.** P2 · automate-later · `85492226c8b28282a6b801250a4be346` · `how-to-use-the-rfp-generator-ai-powered-for-technical-stage` · Notion KB › AI Features › How to Use the RFP Generator (AI-Powered) for Technical Stage

#### PRD-KBAI-025 — Closing the chat with ❌ gives the fullscreen view

- **Why it matters.** Buyers review the full RFP without the chat panel.
- **Setup.** Buyer with the RFP Generator AI chat panel open.
- **Steps.**
  1. Press the ❌ on the chat panel.
- **Expected.** The chat screen closes and the Technical Stage is shown in fullscreen mode.
- **Oracle.** Chat panel no longer displayed; the question sections take the full width.
- **Trace.** P3 · automate-later · `85492226c8b28282a6b801250a4be346` · `how-to-use-the-rfp-generator-ai-powered-for-technical-stage` · Notion KB › AI Features › How to Use the RFP Generator (AI-Powered) for Technical Stage

## 4. How to Use Vendor Finder for AI-Based Supplier Discovery

#### PRD-KBAI-026 — Buyer discovers suppliers with Vendor Finder and invites one

- **Why it matters.** Vendor Finder feeds new suppliers into onboarding; an invite must be sent and the vendor must enter the system.
- **Setup.** Buyer / Vendor Manager on the Vendors tab. Use a sandbox or test tenant — invitations go to real external addresses.
- **Steps.**
  1. Click the "✨ Vendor Finder" button next to "Start Onboarding".
  2. In the "Smart Supplier Scout" side panel, click a ready-made prompt template.
  3. Click the blue search icon.
  4. Click "Select" on a vendor card.
  5. Click "Invite All Selected".
- **Expected.** A list of vendor cards is displayed; after inviting, a confirmation says the invitation has been successfully sent, and the vendor is treated as a prospective supplier.
- **Oracle.** One or more vendor cards appear (content not checked); invitation-sent confirmation shown.
- **Trace.** P1 · automate-later · `a1092226c8b282e9be11812be0936d3c` · `how-to-use-vendor-finder-for-ai-based-supplier-discovery` · Notion KB › AI Features › How to Use Vendor Finder for AI-Based Supplier Discovery

#### PRD-KBAI-027 — Custom prompt search in Smart Supplier Scout

- **Why it matters.** Buyers describe niche needs in their own words; a typed prompt must return results too.
- **Setup.** Buyer with the Smart Supplier Scout panel open.
- **Steps.**
  1. Type a custom prompt describing the vendor needed (product and location) in the textbox.
  2. Click the blue search icon.
- **Expected.** After a few moments the system displays a list of vendor cards based on the query.
- **Oracle.** A list of vendor cards appears in the panel (count and content not asserted).
- **Trace.** P2 · automate-later · `a1092226c8b282e9be11812be0936d3c` · `how-to-use-vendor-finder-for-ai-based-supplier-discovery` · Notion KB › AI Features › How to Use Vendor Finder for AI-Based Supplier Discovery

#### PRD-KBAI-028 — Each vendor card shows name, location, email, reference link and status flag

- **Why it matters.** The buyer decides whom to invite from the card; every stated field must be present.
- **Setup.** Buyer with Vendor Finder results displayed.
- **Steps.**
  1. Inspect several vendor cards.
- **Expected.** Each card shows vendor name, location, email (if available), reference/source link and a status flag.
- **Oracle.** The field slots are present on every card (values not checked).
- **Trace.** P2 · automate-later · `a1092226c8b282e9be11812be0936d3c` · `how-to-use-vendor-finder-for-ai-based-supplier-discovery` · Notion KB › AI Features › How to Use Vendor Finder for AI-Based Supplier Discovery

#### PRD-KBAI-029 — "Recommended" tag marks high-relevance vendor cards

- **Why it matters.** The tag steers buyers to the vendors with complete information.
- **Setup.** Buyer with Vendor Finder results displayed.
- **Steps.**
  1. Look for vendor cards marked "Recommended".
  2. Compare a Recommended card with an untagged one.
- **Expected.** Some cards may carry a "Recommended" tag, indicating high relevance and availability of complete information.
- **Oracle.** Where present, Recommended cards have their information fields filled (AI-dependent; the tag may not appear).
- **Trace.** P2 · manual · `a1092226c8b282e9be11812be0936d3c` · `how-to-use-vendor-finder-for-ai-based-supplier-discovery` · Notion KB › AI Features › How to Use Vendor Finder for AI-Based Supplier Discovery

#### PRD-KBAI-030 — Card without an email shows the "email not found" status flag

- **Why it matters.** The buyer must know when a vendor cannot be reached by email before inviting it.
- **Setup.** Buyer with Vendor Finder results that include a vendor with no email found.
- **Steps.**
  1. Find a vendor card with no email address.
- **Expected.** The card shows a status flag such as "email not found".
- **Oracle.** The "email not found" flag is visible on a card with no email (depends on the AI results returned).
- **Trace.** P2 · manual · `a1092226c8b282e9be11812be0936d3c` · `how-to-use-vendor-finder-for-ai-based-supplier-discovery` · Notion KB › AI Features › How to Use Vendor Finder for AI-Based Supplier Discovery

#### PRD-KBAI-031 — Multiple suppliers invited at once with "Invite All Selected"

- **Why it matters.** Bulk invite is the efficient path; every selected vendor must be invited.
- **Setup.** Buyer with Vendor Finder results displayed. Use a sandbox or test tenant.
- **Steps.**
  1. Click "Select" on two or more vendor cards.
  2. Click "Invite All Selected" at the bottom right of the panel.
- **Expected.** A confirmation states the invitation has been successfully sent to the selected vendors.
- **Oracle.** Invitation-sent confirmation shown; each selected vendor is invited.
- **Trace.** P2 · automate-later · `a1092226c8b282e9be11812be0936d3c` · `how-to-use-vendor-finder-for-ai-based-supplier-discovery` · Notion KB › AI Features › How to Use Vendor Finder for AI-Based Supplier Discovery

#### PRD-KBAI-032 — Invited vendors become prospective suppliers in the onboarding workflow

- **Why it matters.** Invited vendors must land in the regular onboarding pipeline, not be lost after the invite.
- **Setup.** Buyer who has just invited vendors via Vendor Finder.
- **Steps.**
  1. Open the Vendors area and look for the invited vendors.
- **Expected.** The invited vendors are treated as prospective suppliers and can proceed through the regular onboarding workflow.
- **Oracle.** The invited vendors appear as prospective suppliers (at the article's level of detail).
- **Trace.** P1 · manual · `a1092226c8b282e9be11812be0936d3c` · `how-to-use-vendor-finder-for-ai-based-supplier-discovery` · Notion KB › AI Features › How to Use Vendor Finder for AI-Based Supplier Discovery

## 5. How to Use Smart Awarding for AI-Powered Bid Selection

#### PRD-KBAI-033 — Buyer uses Smart Awarding and creates the award proposal

- **Why it matters.** Awarding is the end of the create→publish→bid→award path; the AI suggestion must turn into a proposal.
- **Setup.** Buyer / Procurement Lead with a completed (closed) RFx event that has bids.
- **Steps.**
  1. Open the completed RFx event and go to the "Master QCS" page.
  2. Click "Select Awarding" to open the awarding screen.
  3. Click the "Smart Awarding" button next to "Create Proposal".
  4. In the Procol AI side panel, select the recommendation "Best Value Vendor Selection".
  5. Click the blue send icon and review the AI response.
  6. Click "Create Proposal".
- **Expected.** The AI returns a suggested awarding plan (suggested vendors, justification for each decision, quantity allocation logic if applicable); after Create Proposal the proposal reflects the decision made.
- **Oracle.** An AI response block appears (content not checked); a proposal is created reflecting the awarding on the screen.
- **Trace.** P0 · automate-later · `84c92226c8b2838697b7010b62deadc8` · `how-to-use-smart-awarding-for-ai-powered-bid-selection` · Notion KB › AI Features › How to Use Smart Awarding for AI-Powered Bid Selection

#### PRD-KBAI-034 — Awarding screen opened via "Bid Selection Proposal Draft"

- **Why it matters.** The article gives two entry points to the awarding screen; both must lead to Smart Awarding.
- **Setup.** Buyer on the Master QCS page of a completed RFx event.
- **Steps.**
  1. Click "Bid Selection Proposal Draft".
  2. Look for the "Smart Awarding" button.
- **Expected.** The awarding screen opens, with the "Smart Awarding" button at the top right next to "Create Proposal".
- **Oracle.** Awarding screen displayed with the Smart Awarding button.
- **Trace.** P2 · automate-later · `84c92226c8b2838697b7010b62deadc8` · `how-to-use-smart-awarding-for-ai-powered-bid-selection` · Notion KB › AI Features › How to Use Smart Awarding for AI-Powered Bid Selection

#### PRD-KBAI-035 — Custom awarding rule typed into the Smart Awarding chat

- **Why it matters.** Buyers apply business logic beyond the recommended prompts.
- **Setup.** Buyer with the Smart Awarding side panel open.
- **Steps.**
  1. Type a custom awarding rule or logic in the text box.
  2. Click the blue send icon.
- **Expected.** The system processes the request and generates a suggested awarding plan.
- **Oracle.** An AI response with suggested vendor(s) and justification appears (content not checked).
- **Trace.** P2 · automate-later · `84c92226c8b2838697b7010b62deadc8` · `how-to-use-smart-awarding-for-ai-powered-bid-selection` · Notion KB › AI Features › How to Use Smart Awarding for AI-Powered Bid Selection

#### PRD-KBAI-036 — Awarding mode "Balanced" weighs technical score and savings equally

- **Why it matters.** Mode choice changes who gets awarded; Balanced must consider both dimensions.
- **Setup.** Buyer with the Smart Awarding side panel open on an event with technical scores and prices.
- **Steps.**
  1. Select awarding mode "Balanced" in the input.
  2. Send an awarding prompt and review the response.
- **Expected.** The suggestion considers both technical score and commercial savings equally.
- **Oracle.** The justification references both technical score and savings (reviewer judgement).
- **Trace.** P2 · manual · `84c92226c8b2838697b7010b62deadc8` · `how-to-use-smart-awarding-for-ai-powered-bid-selection` · Notion KB › AI Features › How to Use Smart Awarding for AI-Powered Bid Selection

#### PRD-KBAI-037 — Awarding mode "Technical" prioritises technical score

- **Why it matters.** Technical mode should favour the best technical vendors over the cheapest.
- **Setup.** Buyer with the Smart Awarding side panel open on an event where the best technical score and lowest price belong to different vendors.
- **Steps.**
  1. Select awarding mode "Technical".
  2. Send an awarding prompt and review the response.
- **Expected.** The suggestion prioritises technical score.
- **Oracle.** The suggested vendor(s) lean to higher technical scores (reviewer judgement).
- **Trace.** P2 · manual · `84c92226c8b2838697b7010b62deadc8` · `how-to-use-smart-awarding-for-ai-powered-bid-selection` · Notion KB › AI Features › How to Use Smart Awarding for AI-Powered Bid Selection

#### PRD-KBAI-038 — Awarding mode "Commercial" focuses on cost savings

- **Why it matters.** Commercial mode should favour savings.
- **Setup.** Buyer with the Smart Awarding side panel open on an event where the best technical score and lowest price belong to different vendors.
- **Steps.**
  1. Select awarding mode "Commercial".
  2. Send an awarding prompt and review the response.
- **Expected.** The suggestion focuses on cost savings.
- **Oracle.** The suggested vendor(s) lean to lower prices (reviewer judgement).
- **Trace.** P2 · manual · `84c92226c8b2838697b7010b62deadc8` · `how-to-use-smart-awarding-for-ai-powered-bid-selection` · Notion KB › AI Features › How to Use Smart Awarding for AI-Powered Bid Selection

#### PRD-KBAI-039 — Buyer adjusts the AI suggestion manually before creating the proposal

- **Why it matters.** The buyer, not the AI, owns the award; manual adjustments must be what the proposal records.
- **Setup.** Buyer who has received a Smart Awarding suggestion on the awarding screen.
- **Steps.**
  1. Make a manual adjustment to the suggested awarding.
  2. Click "Create Proposal".
- **Expected.** The AI suggestion can be used directly or adjusted manually; the proposal reflects the decision as adjusted.
- **Oracle.** The created proposal shows the manually adjusted awarding, not the original AI suggestion.
- **Trace.** P1 · manual · `84c92226c8b2838697b7010b62deadc8` · `how-to-use-smart-awarding-for-ai-powered-bid-selection` · Notion KB › AI Features › How to Use Smart Awarding for AI-Powered Bid Selection

#### PRD-KBAI-040 — Smart Awarding is available only after event closure

- **Why it matters.** The article limits Smart Awarding to closed events on the Master QCS; awarding a live event would pre-empt bidding.
- **Setup.** Buyer with one RFx event still open and one completed.
- **Steps.**
  1. On the open event, look for the awarding screen and the "Smart Awarding" button.
  2. On the completed event, go to "Master QCS" → "Select Awarding" and look for "Smart Awarding".
- **Expected.** Smart Awarding is available after event closure on the Master QCS page, and not for the event still open.
- **Oracle.** The Smart Awarding button is reachable only for the completed event.
- **Trace.** P1 · manual · `84c92226c8b2838697b7010b62deadc8` · `how-to-use-smart-awarding-for-ai-powered-bid-selection` · Notion KB › AI Features › How to Use Smart Awarding for AI-Powered Bid Selection
