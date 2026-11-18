#!/usr/bin/env python3
"""End-to-end sourcing test cases: PR → event (single stage / eRFX) → T&C →
vendors → schedule → publish → settings (withdraw, recreate order, extend,
reschedule, rejected bids, order activity, evaluation time) → vendor bidding
(submit, revise, revert/revoke, surrogate, counter offer, reject quote) →
Master QCS → awarding (partial / complete, approval, PO) → reports.

Same columns as 'PO Ammendment test cases.xlsx'. Facts come from the Procol
code read for the QA platform (flow map create→MQCS, app refusal rules,
bidding matrix, awarding/negotiation/rejected-bid catalogs) and from live
runs on UAT. Output: HTML page + Excel."""
import html
from pathlib import Path
import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HERE = Path(__file__).resolve().parent
OUT_HTML = HERE / "e2e-sourcing-test-cases.html"
OUT_XLSX = HERE / "E2E_Sourcing_PR_to_Award_Test_Cases.xlsx"

C = []
COUNTERS = {}
def t(code, module, scenario, title, role, portal, pre, data, steps, expected, p="High", typ="Positive"):
    n = COUNTERS.get(code, 0) + 1; COUNTERS[code] = n
    C.append(dict(id=f"E2E-{code}-{n:03d}", module=module, scenario=scenario, title=title, role=role, portal=portal,
                  pre=pre, data=data, steps=steps, expected=expected, p=p, typ=typ))

B, V, BV = "Buyer", "Vendor", "Buyer, Vendor"
PB, PV, PBV = "Buyer portal", "Vendor portal", "Buyer + Vendor portal"
LOGIN_B = "Log in to Procol (buyer side) with the buyer user of the test workspace"
LOGIN_V = "Log in to the vendor portal as the QA test vendor (qa_<stamp>@example.com) who was invited"

# ═══════════════════ 0. Set-up & choosing the PR ═══════════════════
M = "0. Set-up: choosing and reading the PR"
t("PRI", M, "PR given by id", "Open the PR that was named and read its header", B, PB,
  "The workspace has Purchase Requisitions. A PR number is given (e.g. 0110000195).",
  "PR number 0110000195 (M3M NOIDA on UAT).",
  [LOGIN_B, "Open Purchase Requisitions from the left menu", "Type the PR number in the top-right Search (Shift+F) and open the row, or click the PR NO link in the list",
   "Read the PR header: PR number, requester, plant/location, creation date, status tab (Open / In Progress / Completed / Rejected / Deleted)"],
  "The named PR opens; its number matches exactly; its lines are listed with Item Type, Item, PR Age, Material/Service code and quantities. If the number does not exist the search shows no rows and nothing else is opened.", "Critical")
t("PRI", M, "No PR given", "Pick a random OPEN PR when none is named", B, PB,
  "At least one PR on the Open tab with a fully open line (Qty open = Qty requested).",
  "—",
  [LOGIN_B, "Open Purchase Requisitions → Open tab", "Pick any row whose line is fully open and not on hold / dormant-locked", "Note its PR number and item type for the next steps"],
  "A PR is chosen only from Open; its number and chosen line are recorded so every later step (event, award, PO) can be traced back to it. PRs under In Progress / Completed / Rejected / Deleted are never picked.", "Critical")
t("PRI", M, "Identify the PR type", "Tell a material PR from a service PR from the Item Type column", B, PB,
  "PRs of both kinds exist (screenshot: 0170000508 'S' Fencing Work, 0110000195 'M' GI coated sheet).",
  "PR 0170000508 (S, '1 Service'), PR 0110000195 (M, material code 1100010768).",
  [LOGIN_B, "Open Purchase Requisitions → Open", "Look at the Item Type badge of each line: 'M' = material, 'S' = service", "Open a service line: it shows '1 Service' with activities underneath; open a material line: it shows the Material code column filled and no Service Code"],
  "Material lines carry a Material code and a quantity with UOM; service lines carry a Service Code / activities (rate-based) and the badge S. The type decides the event: a material PR makes a goods event (product sheet with quantity), a service PR makes a service event (service + activities).", "Critical")
t("PRI", M, "Asset / capex lines", "Recognise an asset (capex) line from the PR details", B, PB,
  "A PR line whose account assignment is an asset (asset number / capex flag in PR details).",
  "A PR with Account Assignment = Asset and an asset number.",
  [LOGIN_B, "Open the PR → click the line → 'Details'", "Read Account Assignment, Asset number, Cost centre / WBS"],
  "The line is identified as an asset purchase (Account Assignment 'A' / asset number present). It is sourced like a material line but the award/PO must keep the asset account assignment. If the workspace has no asset lines, mark Not applicable.", "Medium")
t("PRI", M, "Mixed PR", "A PR with both material and service lines", B, PB,
  "A PR with M and S lines.", "—",
  [LOGIN_B, "Open the PR", "Tick one M line and one S line", "Click Purchase Items"],
  "The app refuses to mix them in one event ('All line items must have the same vendor' / type mismatch) or creates separate events per type — record which. Material and service lines must never land in one product sheet.", "High", "Negative")
t("PRI", M, "Partly processed PR line", "A line already partly in an event cannot be picked again for the full quantity", B, PB,
  "A PR line with Qty open < Qty requested.", "—",
  [LOGIN_B, "Open the PR", "Tick the partly processed line", "Click Purchase Items"],
  "Only the open quantity can be sourced (the event line shows the open quantity); the In Progress tab shows the already-sourced part.", "High", "Edge")
t("PRI", M, "PR on hold / dormant", "A line on hold or a dormant-locked PR cannot be sourced", B, PB,
  "One line on hold; one PR dormant-locked (older than the dormant threshold).", "—",
  [LOGIN_B, "Open the PR", "Try Purchase Items on the on-hold line", "Open the dormant PR and try to use it"],
  "On-hold: the line cannot be ticked / Purchase Items is disabled. Dormant: 'Unlock' (or 'Request to unlock') is required first; after unlocking the line can be used.", "Medium", "Negative")
t("PRI", M, "PR → event handoff", "Purchase Items creates a draft event with the PR lines", B, PB,
  "An open material PR line chosen in E2E-PRI-002.", "Line: 0.5 MM GI COATED 6MH-12MH, Qty 10 ST, plant LOC-0001.",
  [LOGIN_B, "Tick the line(s) → Purchase Items (cart icon, count shows 1)", "Choose the event type offered (Single stage RFQ / Auction / RFP, or eRFX project)", "Reach the event create screen"],
  "The create screen opens with the PR line already in the product sheet (product, variant, quantity 10 ST, delivery location LOC-0001 from the PR) and the PR number linked; the PR line moves to In Progress once the event is published.", "Critical")
t("PRI", M, "Rate-only service line", "A service line with no quantity is sourced as rate-based", B, PB,
  "A service PR line with activities and no quantity (rate only).", "—",
  [LOGIN_B, "Tick the service line → Purchase Items", "Open the service sheet in the event"],
  "Activities appear as rows; vendors quote a rate per activity; totals are rate × activity quantity where present. No material quantity is asked.", "Medium")

# ═══════════════════ 1. Single-stage event ═══════════════════
M = "1. Create event — single stage (RFP / RFQ / Auction)"
t("SS", M, "Open the single-stage screen", "Create Event → Single Stage opens the one-screen builder", B, PB,
  "Events module; buyer may create events.", "—",
  [LOGIN_B, "Open Events → Create Event → 'Single Stage' ('Source through RFP / RFQ / Auction')"],
  "The screen /orders/quick-create opens with Event Type (RFP is pre-selected), Select Templates, Title, product sheet, Participants, footer Savings · Terms & Conditions · Schedule · Publish Event.", "Critical")
t("SS", M, "Event type RFQ", "Switch Event Type to RFQ and pick a priced template", B, PB,
  "Templates of type RFQ exist for the workspace.", "Template 'Standard RFQ'.",
  [LOGIN_B, "Create Event → Single Stage", "Event Type → RFQ", "Hover 'Select Templates' and pick the template from the VISIBLE menu"],
  "The product sheet appears with the template's columns (Product, Variant, Quantity, Delivery location, Price…). The template name replaces the 'Select Templates' label. RFP templates (questionnaires, no price sheet) are no longer offered.", "Critical")
t("SS", M, "Event type Auction", "Auction needs a strategy", B, PB,
  "Auction template exists.", "Strategy: Rank / Price / Traffic light / Knockout / Dutch / Basket (as the template allows).",
  [LOGIN_B, "Create Event → Single Stage → Event Type Auction", "Pick a template; add a product; invite a vendor; set a schedule", "Publish without choosing a strategy", "Then choose a strategy and publish"],
  "Without a strategy: 'Please select a valid auction strategy'. With one: publishes. Knockout / Dutch also need a base price ('Please enter (valid) base price') and refuse product add/remove after creation ('Products can't be added or removed in Knockout or Dutch Auction').", "High", "Negative")
t("SS", M, "Event type RFP", "An RFP needs a questionnaire template and an evaluator", B, PB,
  "RFP (technical) templates exist.", "—",
  [LOGIN_B, "Create Event → Single Stage (RFP is default)", "Pick a questionnaire template", "Add participants; set schedule", "Publish without an evaluator; then add an evaluator in the Vendor Assessment section and publish"],
  "Without an evaluator: publish refused ('Please add Evaluator…'). The first open select on the page is the Evaluator picker — do not type a vendor there. With an evaluator and the questionnaire filled: publishes as a technical event.", "High", "Negative")
t("SS", M, "Template first", "Line items cannot be added before a template", B, PB,
  "—", "—",
  [LOGIN_B, "Create Event → Single Stage → RFQ", "Try to type a product in the sheet before choosing a template"],
  "No sheet exists until a template is chosen; Participants and Publish stay locked ('Please choose a template and add a product').", "High", "Negative")
t("SS", M, "Add products", "Add a catalogue product with quantity, UOM and location", B, PB,
  "Catalogue has products with variants.", "Product KNOB FX151-2925 (2810038395), Default Variant, Qty 10 ST, location Plant Name (LOC-0001).",
  [LOGIN_B, "In the sheet type the product name, pick it from the catalogue (code shown)", "Variant fills automatically", "Enter quantity and pick delivery location", "Press Tab and read the cell back"],
  "Row shows the product with its code, variant, quantity with UOM, location. A non-number in a numeric cell is rejected on commit. 'Maximum no of product addition reached' when the template's limit is hit.", "Critical")
t("SS", M, "Product not in catalogue", "Add a new product from the sheet", B, PB,
  "Manual product creation allowed.", "Name 'QA_Platform test knob', family, category.",
  [LOGIN_B, "Type a name that is not in the catalogue → 'Add new product'", "Leave family empty and save; then fill family and category"],
  "Refused: 'Please enter a name for your product.' / 'Please select your product's family.' / 'Please choose your product's category.' With all three, the product is created and selected.", "Medium", "Negative")
t("SS", M, "Price cap / min quantity columns", "Add Columns: price cap, minimum quantity, tick size", B, PB,
  "Template exposes the optional widgets.", "Cap ₹100/unit, min qty 5, tick 1%.",
  [LOGIN_B, "Add Columns → tick Price Cap, Minimum Quantity, Tick Size", "Fill them per row", "Publish"],
  "Columns appear; a cap must be a valid number ('Please enter valid price cap values'); on the vendor side a bid above the cap is refused ('Net Price should be less than ₹100/unit') and quantity below the minimum is refused.", "High")
t("SS", M, "Upload sheet", "Fill the product sheet by Excel upload", B, PB,
  "—", "Downloaded template filled with 3 rows; one row with a bad product code.",
  [LOGIN_B, "Upload Sheet → Download template", "Fill 3 rows, one with an unknown product code", "Upload"],
  "Good rows land in the sheet; the bad row is reported with its line number; nothing is silently dropped.", "Medium", "Edge")
t("SS", M, "Save as draft", "Save the single-stage event as a draft and reopen it", B, PB,
  "—", "—",
  [LOGIN_B, "Fill title, template, one product", "Click Save as draft (or leave: the app autosaves on eRFX only — check)", "Open Events → Drafts and open the draft"],
  "The draft is listed under Drafts with its title; opening it restores template, products, participants and T&C; 'Failed to save draft' never appears.", "High")

# ═══════════════════ 2. eRFX project ═══════════════════
M = "2. Create event — eRFX project (multi-stage)"
t("RFX", M, "Gate", "eRFX is offered only when the workspace has it enabled", B, PB,
  "Workspace A with rfx_project_enabled on; workspace B without.", "—",
  [LOGIN_B, "Open Events → Create Event on both workspaces"],
  "A: 'eRFX Project' option is shown next to Single Stage. B: only Single Stage.", "Medium")
t("RFX", M, "Default stage", "The eRFX screen opens with one Auction stage", B, PB,
  "eRFX enabled.", "—",
  [LOGIN_B, "Create Event → eRFX Project"],
  "Project title box, stage strip with one default 'Auction' stage, an icon-only '+' (menu title 'Add Stages'), Items button, Participants, footer with Save as draft and Publish.", "Critical")
t("RFX", M, "RFQ only", "Make an RFQ-only project (RFQ and Auction never coexist)", B, PB,
  "—", "—",
  [LOGIN_B, "Create Event → eRFX", "Hover '+' → add Technical", "On the Auction tab ⋮ → Delete", "Hover '+' → add RFQ", "On the Technical tab ⋮ → Delete"],
  "Each move is accepted in this order only: a tab cannot be deleted while it is the last stage; the '+' tooltip reads 'Remove Auction to add RFQ' while Auction exists; final strip shows a single RFQ stage. After deleting a tab click the remaining tab if its panel renders blank.", "Critical")
t("RFX", M, "Two-stage ceiling", "At most two stages; Technical + RFQ or Technical + Auction", B, PB,
  "—", "—",
  [LOGIN_B, "Create Event → eRFX (Auction present)", "Add Technical", "Hover '+' again"],
  "With two stages the '+' is disabled and its tooltip explains why; RFQ cannot be added beside Auction.", "High", "Negative")
t("RFX", M, "Per-stage template", "Each stage has its own template and the Items drawer needs one", B, PB,
  "—", "—",
  [LOGIN_B, "On the RFQ tab click Items before choosing a template", "Choose the template, click Items again", "In the drawer type into 'Search and add line items', pick a product, Save"],
  "Before a template the Items button does nothing (Items 0). After: the Manage Line Items drawer opens; options render in a page-level list; the item is added and Items shows 1.", "Critical")
t("RFX", M, "Technical stage needs Vendor Assessment", "Publish refuses a technical stage without the Vendor Assessment section", B, PB,
  "Project with Technical + RFQ.", "—",
  [LOGIN_B, "Fill the RFQ stage completely", "Leave the Technical stage's Vendor Assessment template empty", "Publish", "Then pick the assessment template (the 'Select Template' trigger inside the rfi section, not the evaluator picker), add an evaluator, publish"],
  "First: 'There are some errors in vendor specific sections, please check and try again'. 'Section-wise scoring templates can only be selected in the Vendor Assessment section' if a scoring template is chosen elsewhere. Then publishes.", "High", "Negative")
t("RFX", M, "RFP duration vs RFQ", "Technical stage must end before the RFQ stage", B, PB,
  "Technical + RFQ project.", "Technical end after RFQ end.",
  [LOGIN_B, "Schedule drawer: set Technical to end later than RFQ", "Save Schedule / Publish"],
  "'RFP duration exceeds RFQ end time. Please adjust.'", "High", "Negative")
t("RFX", M, "Savings column", "A stage with no template fails the savings check", B, PB,
  "—", "—",
  [LOGIN_B, "Add participants, leave a stage without template", "Publish"],
  "'Please select a valid column for savings' (the real cause is the missing template). Choosing the template clears it.", "Medium", "Negative")
t("RFX", M, "Convert RFQ to Auction", "A published RFQ is converted, not composed, into an Auction", B, PB,
  "A published RFQ project.", "—",
  [LOGIN_B, "Open the RFQ stage → Settings (gear) → 'Convert to Auction' → Continue"],
  "A new tab opens on the create screen with isRfqToAuction and the draft stage ids; the RFQ's lines and vendors are carried; publishing adds the Auction stage. There is no way to add Auction beside RFQ on the strip.", "High")
t("RFX", M, "Save as draft", "Save the project as a draft and reopen", B, PB,
  "—", "—",
  [LOGIN_B, "Compose Technical + RFQ with templates and items", "Save as draft", "Events → Drafts → open it"],
  "Draft listed; reopening restores both stages, their templates, items, participants, T&C and the schedule blocks. 'Error while loading draft project' / 'No draft found' never appear.", "High")
t("RFX", M, "Publish lands on project page", "A published project shows Project Details, stage tab and Master QCS", B, PB,
  "—", "—",
  [LOGIN_B, "Publish a valid RFQ-only project with 'Start now'"],
  "Browser lands on /project/<id>: header with title and RFX number, tabs Project Details · <stage> · Master QCS; Published Stages table shows stage code (RFQ-xxxx), participants 0/N, bidding start and end; status Live.", "Critical")

# ═══════════════════ 3. Event page: title, attachments, drafts ═══════════════════
M = "3. Event page — title, auto title, attachments, drafts"
t("EVP", M, "Auto title on", "Title fills itself from the first product and location when the feature is on", B, PB,
  "Workspace with auto-title enabled.", "Product KNOB FX151-2925, location Plant Name.",
  [LOGIN_B, "Create Event (single stage), choose template, leave Title empty", "Add the product and location"],
  "Title becomes '<product> - <location>' (single product) / '<family> products' / '<first> & more' / 'N locations' depending on the sheet. It keeps updating while the title is still the auto one.", "High")
t("EVP", M, "Auto title overridden", "A typed title is never overwritten by the auto title", B, PB,
  "Auto title on.", "Typed title 'QA_Platform knobs Oct'.",
  [LOGIN_B, "Type the title first", "Add / change products"],
  "The typed title stays. Clearing it and adding a product fills the auto title again.", "High")
t("EVP", M, "Auto title off", "Without the feature the title must be typed", B, PB,
  "Workspace without auto-title.", "—",
  [LOGIN_B, "Add a product, leave the title empty", "Publish"],
  "'Please enter title.' / 'Please fill project title!' (eRFX). Typing a title lets publish continue.", "High", "Negative")
t("EVP", M, "Event attachments", "Attach documents to the event and see them as Quotation Templates", B, PB,
  "—", "Technical Specification Sheet.pdf, Bidding Sheet Template.xlsx.",
  [LOGIN_B, "Attachments → upload two files", "Publish", "Open Project Details"],
  "Both files listed under 'Quotation Templates (2)' with Download; the vendor sees the same files on the event.", "Medium")
t("EVP", M, "Delete draft", "Delete a draft from the Drafts tab", B, PB,
  "A draft exists.", "—",
  [LOGIN_B, "Events → Drafts → ⋮ on the draft → Delete → confirm"],
  "Draft disappears; the PR lines it held return to Open.", "Medium")
t("EVP", M, "Draft from PR keeps quantities", "A draft built from a PR shows the PR's open quantity and gives it back when deleted", B, PB,
  "PR line 100 units.", "—",
  [LOGIN_B, "Purchase Items on the PR line → save the event as draft", "Open the PR: read Open / In Progress", "Delete the draft and read again"],
  "While draft: the line shows 100 in the draft. After delete: 100 open again, PR history notes the change.", "High", "Edge")

# ═══════════════════ 4. Terms & Conditions ═══════════════════
M = "4. Terms & Conditions (event-wise, stage-wise, mandatory)"
t("TNC", M, "Template default clauses", "Choosing a template loads its default T&C clauses", B, PB,
  "Template with default clauses.", "—",
  [LOGIN_B, "Create Event → choose the template", "Open footer 'Terms & Conditions'"],
  "The template's clauses are pre-listed (and product-level clauses of added products are merged in).", "High")
t("TNC", M, "Add clause and attachment", "Add a typed clause and a T&C attachment", B, PB,
  "—", "Clause 'Delivery within 15 days of PO', attachment GTC.pdf.",
  [LOGIN_B, "Terms & Conditions → Add clause → type", "Attach GTC.pdf", "Save; publish; open Project Details"],
  "Clause listed under Terms & Conditions as '1. …'; attachment downloadable; vendor sees both on the event.", "High")
t("TNC", M, "Event-wise vs stage-wise", "eRFX: T&C on the project apply to every stage; stage T&C apply to that stage only", B, PBV,
  "Technical + RFQ project.", "Project clause P1; RFQ clause S1.",
  [LOGIN_B, "Add P1 at the project level and S1 on the RFQ stage", "Publish", LOGIN_V, "Open the Technical stage and the RFQ stage"],
  "Technical shows P1; RFQ shows P1 and S1. When the project has no clauses and exactly one stage, the stage's own clauses are used.", "High")
t("TNC", M, "Mandatory switch", "With 'mandatory' on, every clause and attachment must be accepted before the vendor can submit", BV, PBV,
  "Event with 2 clauses + 1 attachment; is_tnc_mandatory on.", "—",
  [LOGIN_B, "Terms & Conditions → switch Mandatory on → publish", LOGIN_V, "Open the event, fill the price sheet", "Try Submit without accepting; accept one clause; accept all"],
  "Submit is blocked until every clause and the attachment are accepted ('Payment Terms and Conditions are mandatory' / accept checkbox required); after accepting all, Submit works. The acceptance is recorded with the bid.", "Critical", "Negative")
t("TNC", M, "Optional clauses", "With 'mandatory' off, the vendor may submit without accepting", V, PV,
  "Event with clauses, mandatory off.", "—",
  [LOGIN_V, "Fill the sheet", "Submit without touching T&C"],
  "Bid is accepted; clause acceptance shown as not accepted on the buyer's response view.", "High")
t("TNC", M, "Per-clause mandatory", "One clause marked mandatory while the switch is off", BV, PBV,
  "Clause A mandatory, clause B optional.", "—",
  [LOGIN_B, "Mark only A mandatory → publish", LOGIN_V, "Submit with only B accepted; then with A accepted"],
  "Blocked until A is accepted; B stays optional.", "High", "Edge")
t("TNC", M, "Payment terms", "Payment terms and Incoterms are mandatory on the payment-terms form", B, PB,
  "Template with payment terms form.", "—",
  [LOGIN_B, "Open Payment Terms, leave both empty, Save"],
  "'Payment Terms and Conditions are mandatory' — both must be chosen.", "Medium", "Negative")
t("TNC", M, "Edit after publish", "T&C cannot be changed after bids exist", B, PB,
  "Live event with one bid.", "—",
  [LOGIN_B, "Open the event → try to edit T&C (Settings / edit)"],
  "Editing is refused or requires a new version (addendum remarks); the vendor's accepted clauses stay as accepted.", "Medium", "Negative")

# ═══════════════════ 5. Identifying an existing event ═══════════════════
M = "5. Finding an existing event (Live / Upcoming / History / Drafts / Withdrawn)"
t("EVF", M, "Event given by RFX id", "Open the named event from the Events list", B, PB,
  "Event RFX-3123 exists.", "RFX-3123.",
  [LOGIN_B, "Events → search 'RFX-3123' or the title 'vc'", "Open it"],
  "The project page of RFX-3123 opens; header shows the id and the copy icon; stage code RFQ-2532.", "Critical")
t("EVF", M, "Tabs", "Live, History and Drafts list the right events", B, PB,
  "One live, one closed-with-PO, one draft event.", "—",
  [LOGIN_B, "Events → Live", "Events → History", "Events → Drafts"],
  "Live: published events whose bidding/evaluation is not over (Upcoming also here with its start time). History: closed / awarded / PO-created / withdrawn events. Drafts: unpublished. Counts on the tabs match the rows.", "Critical")
t("EVF", M, "History after PO", "An event moves to History once its PO is created", B, PB,
  "Awarded event; PO generated.", "—",
  [LOGIN_B, "Generate the PO (see awarding)", "Events → Live and History"],
  "The event is no longer under Live; it is under History with the PO reference; the Project Details still open.", "High")
t("EVF", M, "Withdrawn label", "A withdrawn event shows status Withdrawn", B, PB,
  "A withdrawn event.", "—",
  [LOGIN_B, "Events → History → open the withdrawn event"],
  "Badge 'Withdrawn' on the header and in the list; no bidding actions; vendors see it as withdrawn.", "High")
t("EVF", M, "State from the page", "Read an event's state from the page itself", B, PB,
  "—", "—",
  [LOGIN_B, "Open any event", "Read the badge (Live / Upcoming / Closed / Evaluation / Awarded / Withdrawn) and the countdown"],
  "Badge and countdown agree with the Published Stages table (Bidding Starts At / Ends At). A Live badge with an end time in the past is a defect.", "High")
t("EVF", M, "Upcoming", "A published event with a future start shows Upcoming and allows Reschedule", B, PB,
  "Event scheduled 2 h ahead.", "—",
  [LOGIN_B, "Publish with a future start", "Open it; open Settings"],
  "Status Upcoming; Settings offers 'Reschedule Event' (only in this state); vendors see it but cannot bid yet.", "High")
t("EVF", M, "Search by title / vendor", "Find an event by part of its title", B, PB,
  "—", "'knob'.",
  [LOGIN_B, "Events → search 'knob'"],
  "Rows whose title contains 'knob' (case-insensitive); clearing restores the list.", "Medium")
t("EVF", M, "Owner-only visibility", "With restrict_event_visibility_to_owner, another buyer does not see the event", B, PB,
  "Workspace flag on; buyer 2 not on the event.", "—",
  ["Log in as buyer 2", "Events → search the event"],
  "Not listed and the direct URL is refused ('You are not authorized').", "Medium", "Negative")

# ═══════════════════ 6. Inviting vendors ═══════════════════
M = "6. Inviting vendors"
t("INV", M, "Mapped vendors", "Invite the vendors mapped to the products in one click", B, PB,
  "Products with vendor mappings (purchase-price vendor codes); vendor_recommendation_on_product on.", "Product with 3 mapped vendors.",
  [LOGIN_B, "Add the product", "Read the banner 'Invite N more participant based on the products'", "Click Invite Vendor"],
  "All N mapped vendors are added as participants; the banner disappears; the count on the Participants section updates.", "Critical")
t("INV", M, "Specific vendor", "Invite one named vendor by search", B, PB,
  "QA test vendor exists and is active.", "QA_Platform vendor name.",
  [LOGIN_B, "Participants → type into 'Search vendors you want to add' (not the Evaluator picker)", "Pick the vendor from the VENDORS list (menu items)"],
  "Only that vendor is added. Blocked vendors are not offered; vendors outside the allowed onboarding statuses are not offered.", "Critical")
t("INV", M, "Remove vendor", "Remove an invited vendor before publish", B, PB,
  "Two vendors added.", "—",
  [LOGIN_B, "Participants → x on one vendor"],
  "Removed; count updates; publish proceeds with the other.", "Medium")
t("INV", M, "No participants", "Publish without vendors is refused first", B, PB,
  "—", "—",
  [LOGIN_B, "Fill everything except participants", "Publish"],
  "'Please add participants to proceed!' — shown before any template/savings message.", "High", "Negative")
t("INV", M, "Invite after publish", "Add a vendor to a live event", B, PBV,
  "Live RFQ.", "—",
  [LOGIN_B, "Open the stage → Participants tab → add a vendor", LOGIN_V, "Check the invitation"],
  "The new vendor is listed, receives the invitation and can bid until the end time; 'Failed to load more vendors' never appears.", "High")
t("INV", M, "Invite new vendor", "Invite a vendor that is not onboarded (only QA e-mails)", B, PB,
  "disable_manual_vendor_creation off.", "qa_<stamp>@example.com, firm 'QA_Platform_<stamp>'.",
  [LOGIN_B, "Participants → Invite Vendor (new) → fill the drawer with QA data → send"],
  "Invitation sent to the QA address only; the vendor appears as invited; never use a real supplier's address.", "Medium")
t("INV", M, "Uninvited vendor", "A vendor not invited cannot open or bid on the event", V, PV,
  "Vendor B not invited.", "—",
  ["Log in as vendor B", "Open the event URL / search it"],
  "Not visible; direct access refused; a bid attempt through the API is refused (seen live: with open-tender flags an uninvited vendor could bid — report if it happens).", "High", "Negative")
t("INV", M, "Participants counter", "Project Details shows invited vs participated", B, PB,
  "31 invited, none bid.", "—",
  [LOGIN_B, "Open Project Details → Published Stages → Participants"],
  "Shows 0/31; after one bid 1/31 and the stage page shows 'Participation: 1 / 31 (3%)'.", "Medium")

# ═══════════════════ 7. Scheduling ═══════════════════
M = "7. Scheduling the event"
t("SCH", M, "Default window", "The footer's default schedule is not saved until Save Schedule", B, PB,
  "—", "—",
  [LOGIN_B, "Read the footer chip (e.g. 'Now - 02:33 am (30 Mins)')", "Publish without opening the drawer"],
  "Either the default is applied or 'Please choose event schedule time' is shown — record which; the chip alone is not proof of a saved schedule.", "High", "Edge")
t("SCH", M, "Presets", "Duration presets 30 min / 1 h / 4 h / 24 h and custom", B, PB,
  "—", "Custom 2 h 15 min.",
  [LOGIN_B, "Schedule → Start now → Duration 30 min → read 'Event will end at'", "Try each preset and a custom value", "Save Schedule"],
  "End = start + duration each time; the saved chip shows the same; per-client presets may differ (event_duration_predefined_values).", "Critical")
t("SCH", M, "Future start", "Start later: date up to 3 months ahead, not in the past", B, PB,
  "—", "Start tomorrow 10:00; start 4 months ahead; start yesterday.",
  [LOGIN_B, "Schedule → pick each start", "Save"],
  "Tomorrow: saved, event will be Upcoming. 4 months: refused (max 3 months). Yesterday: 'Start time cannot be less than the current time'.", "High", "Negative")
t("SCH", M, "Reversed window", "End before start is refused", B, PB,
  "—", "Start 10:00, end 09:00 (absolute).",
  [LOGIN_B, "Schedule → absolute end earlier than start → Save"],
  "'Start time should be less than end time' / 'End time cannot be less than the current time'.", "High", "Negative")
t("SCH", M, "Evaluation time", "Evaluation duration after bidding end", B, PB,
  "—", "Evaluation 30 min.",
  [LOGIN_B, "Schedule → Evaluation duration 30 min → Save → publish"],
  "After bidding ends the event shows Evaluation for 30 min (counter offers and awarding allowed); serial bidding requires it ('Evaluation time is mandatory for serial bidding').", "High")
t("SCH", M, "Multi-stage blocks", "eRFX schedule has one block per stage; keep both on Duration", B, PB,
  "Technical + RFQ.", "—",
  [LOGIN_B, "Schedule drawer: block '1. Technical Stage' and '2. RFQ' (scroll)", "Set both by Duration; read each 'Event will end at'; Save"],
  "Both blocks saved; mixing Fixed time beside Duration can trip the publish check (BUG-85) — record if 'Please Select a Valid Schedule' appears with valid values.", "High", "Edge")
t("SCH", M, "Dynamic closing (auction)", "A bid in the last N minutes extends the auction", BV, PBV,
  "Auction with dynamic closing: extend 5 min when a bid lands in the last 3 min, up to 3 extensions.", "—",
  [LOGIN_B, "Publish with the setting", LOGIN_V, "Bid at T-2 min; again after each extension"],
  "Each late bid adds 5 min to the end time (ending_at read back), at most 3 times; vendors are told the new end.", "High")
t("SCH", M, "Extra closing time", "Grace time after the end keeps the round open", BV, PBV,
  "RFQ with extra closing 10 min.", "—",
  [LOGIN_B, "Publish", LOGIN_V, "Bid 5 min after the printed end"],
  "Bid accepted during the grace window; after it, refused.", "Medium", "Edge")
t("SCH", M, "Reschedule upcoming", "Reschedule is allowed only while Upcoming", B, PB,
  "Upcoming event; a live event.", "Move start +2 h.",
  [LOGIN_B, "Upcoming: Settings → Reschedule Event → set start/delivery in the popup's own inputs → Ok", "Live: open Settings"],
  "Upcoming: the new window is saved and read back (round length and grace kept). Live: Reschedule is absent (a started round cannot be rescheduled). Shown time may differ by the server time offset (BUG-83).", "High")

# ═══════════════════ 8. Publish ═══════════════════
M = "8. Publish checks"
t("PUB", M, "Happy path", "Publish a complete single-stage RFQ", B, PB,
  "Template, product, vendor, T&C, schedule set.", "—",
  [LOGIN_B, "Publish Event"],
  "Lands on the project page with status Live; stage code assigned; vendors notified; PR lines (if any) move to In Progress.", "Critical")
t("PUB", M, "Order of refusals", "Several things missing: the messages come in the app's order", B, PB,
  "Nothing filled.", "—",
  [LOGIN_B, "Publish with nothing", "Fix one thing at a time and publish again"],
  "Participants → template/savings → title → sheet ('Sheet partially filled, please check again.') → strategy/base price → schedule. Record the exact order seen.", "Medium", "Negative")
t("PUB", M, "Sheet partially filled", "A row without quantity blocks publish", B, PB,
  "—", "—",
  [LOGIN_B, "Add a product, leave quantity empty", "Publish"],
  "'Sheet partially filled, please check again.' / 'Please enter valid responses for product sheet.'", "High", "Negative")
t("PUB", M, "Single product closing", "Single product needs 'multiple vendor' closing", B, PB,
  "Auction with one product and 'single vendor' closing.", "—",
  [LOGIN_B, "Publish"],
  "'In case of single product, please choose multiple vendor closing.'", "Medium", "Negative")
t("PUB", M, "Delivery date", "Delivery date required when the template says so", B, PB,
  "Template requires delivery date.", "—",
  [LOGIN_B, "Publish without delivery date"],
  "'Please enter a delivery date'.", "Medium", "Negative")
t("PUB", M, "Silent publish", "Publish does nothing with everything filled", B, PB,
  "—", "—",
  [LOGIN_B, "Fill all fields; Publish"],
  "If the page stays and shows no message, that is a defect — capture console/network.", "High", "Edge")
t("PUB", M, "Savings mandatory", "Tenant with mandatory savings refuses publish without a reference", B, PB,
  "Workspace where savings are mandatory.", "—",
  [LOGIN_B, "Publish without Savings"],
  "'Savings configuration is mandatory'; after choosing Budget / Historical / Existing proposal it publishes.", "Medium", "Negative")
t("PUB", M, "Addendum on new version", "Publishing a new version asks for addendum remarks", B, PB,
  "Versioning enabled; published event, no award yet.", "—",
  [LOGIN_B, "Project tab bar → Create New Version → confirm", "Edit; Publish"],
  "Publish confirm requires 'Addendum Remarks'; the old version closes; vendors see the new version. Not allowed after an award proposal exists.", "Medium")

# ═══════════════════ 9. Withdraw ═══════════════════
M = "9. Withdraw project / event"
t("WDR", M, "Where", "Withdraw Project is under the project's ⋮ menu", B, PB,
  "Live project RFX-3123.", "—",
  [LOGIN_B, "Open the project → ⋮ (top right) → menu shows 'Send Reminders' and 'Withdraw Project'"],
  "Both items present on a live project.", "High")
t("WDR", M, "Withdraw live", "Withdraw a live project before bids", BV, PBV,
  "Live, no bids.", "Reason 'QA test'.",
  [LOGIN_B, "⋮ → Withdraw Project → enter reason → confirm", LOGIN_V, "Open the event"],
  "Status Withdrawn on buyer and vendor; vendor cannot bid; PR lines return to Open with a history entry 'event withdrawn – reopened'.", "Critical")
t("WDR", M, "Withdraw with bids", "Withdraw after bids exist", BV, PBV,
  "Live with 2 bids.", "—",
  [LOGIN_B, "⋮ → Withdraw Project → confirm"],
  "Allowed (live/upcoming/requested/draft/expired can be withdrawn); bids are kept read-only; vendors notified; no awarding possible.", "High")
t("WDR", M, "Withdraw window", "Withdraw is not offered after award / PO", B, PB,
  "Awarded event with PO.", "—",
  [LOGIN_B, "Open ⋮"],
  "'Withdraw Project' absent (or refused with a message). Record the exact states where it is offered: live, upcoming, requested, draft, expired.", "High", "Negative")
t("WDR", M, "Withdraw a stage", "Withdraw one stage of a two-stage project", B, PB,
  "Technical + RFQ live.", "—",
  [LOGIN_B, "Open the RFQ stage → Settings → Withdraw"],
  "Only that stage is withdrawn; the other continues; Project Details marks the stage withdrawn.", "Medium")
t("WDR", M, "Recreate after withdraw", "A withdrawn event can be recreated as a new order", B, PB,
  "Withdrawn event.", "—",
  [LOGIN_B, "Settings → Recreate Order"],
  "Recreate opens with the lines carried (participants and bids are NOT carried — record what is copied).", "Medium", "Edge")
t("WDR", M, "Send reminders", "Send Reminders mails the vendors who have not bid", BV, PBV,
  "Live with 1 of 3 vendors bid.", "—",
  [LOGIN_B, "⋮ → Send Reminders"],
  "Only the 2 non-bidders get the reminder (QA mailboxes); the bidder does not.", "Medium")

# ═══════════════════ 10. Recreate Order ═══════════════════
M = "10. Settings — Recreate Order"
t("RCO", M, "Open", "Recreate Order modal shows the product sheet and auction configurations", B, PB,
  "Closed or withdrawn event RFX-3123 with 1 product.", "KNOB FX151-2925, Default Variant, 10 ST, Plant Name (LOC-0001).",
  [LOGIN_B, "Open the stage → Settings → Recreate Order"],
  "Modal 'Recreate Order': Product Sheet (S no., Product*, Variant*, Qty*, Delivery location*, Price*…) pre-filled from the event; Auction Configurations: Event End Time Duration (15 / 30 / 60 Mins, 4 Hrs, 24 Hrs, Custom — 30 pre-selected), Evaluation Duration (15 / 30 / 45 / 60 Mins, Custom, Clear — 30 pre-selected), Delivery Date, 'Schedule this event?' with date and time, footer 'Edit More Details', Cancel, Create Order.", "Critical")
t("RCO", M, "Create now", "Create the new order with the defaults", BV, PBV,
  "—", "—",
  [LOGIN_B, "Recreate Order → Create Order"],
  "A new event (new RFX / stage code) is created and live at once with the same lines, 30 min bidding and 30 min evaluation; the original is unchanged; vendors invited again (check whether participants are copied).", "Critical")
t("RCO", M, "Custom durations", "Custom end-time and evaluation values", B, PB,
  "—", "End 90 min; evaluation 20 min.",
  [LOGIN_B, "Event End Time Duration → Custom → 90", "Evaluation Duration → Custom → 20", "Create Order"],
  "Read back on the new event: end = start + 90 min, evaluation 20 min.", "High")
t("RCO", M, "Clear evaluation", "Clear removes the evaluation duration", B, PB,
  "—", "—",
  [LOGIN_B, "Evaluation Duration → Clear → Create Order"],
  "New event has no evaluation window (closes straight after bidding). 'Evaluation time is required' appears instead if the event type needs it (serial bidding).", "Medium", "Edge")
t("RCO", M, "Schedule later", "'Schedule this event?' makes the new order Upcoming", B, PB,
  "—", "Tomorrow 11:00.",
  [LOGIN_B, "Tick 'Schedule this event?' → pick date and time → Create Order"],
  "New event is Upcoming with that start; a past date/time is refused ('Invalid scheduled time!' / 'Scheduled time is invalid!'); ticking without a date is refused ('Please select an event schedule time').", "High", "Negative")
t("RCO", M, "Delivery date", "Delivery Date is carried to the new order", B, PB,
  "—", "Delivery date next month.",
  [LOGIN_B, "Set Delivery Date → Create Order"],
  "New event lines show the delivery date; vendors see it.", "Medium")
t("RCO", M, "Edit the sheet", "Change quantity / add a row before creating", B, PB,
  "—", "Qty 10 → 25.",
  [LOGIN_B, "Edit Qty in the modal sheet → Create Order"],
  "New event carries 25; the original keeps 10. Required cells (*) empty block Create Order.", "High")
t("RCO", M, "Edit More Details", "Edit More Details opens the full create screen", B, PB,
  "—", "—",
  [LOGIN_B, "Recreate Order → Edit More Details"],
  "The full create screen opens pre-filled (template, lines, T&C) so participants, savings and T&C can be changed before publish.", "High")
t("RCO", M, "Cancel", "Cancel / x closes without creating", B, PB,
  "—", "—",
  [LOGIN_B, "Recreate Order → change values → Cancel"],
  "No new event; Events list unchanged.", "Low")
t("RCO", M, "From a live event", "Recreate Order is offered on the right states only", B, PB,
  "Live, closed, awarded events.", "—",
  [LOGIN_B, "Open Settings on each"],
  "Record where 'Recreate Order' is offered; on an awarded event with a PO the new order must not re-link the PR lines already ordered.", "Medium", "Edge")

# ═══════════════════ 11. Extend submission time ═══════════════════
M = "11. Settings — Extend Submission Time"
t("EXT", M, "Extend live", "Extend a live RFQ by 10 minutes", BV, PBV,
  "Live RFQ ending in 5 min.", "+10 min.",
  [LOGIN_B, "Settings → Extend Submission Time → new end = current end + 10 min → Save", LOGIN_V, "Read the countdown"],
  "Published Stages shows the new Bidding Ends At; vendor countdown updates; bids accepted until the new end.", "Critical")
t("EXT", M, "Only forward", "New end must be after the current end and after now", B, PB,
  "Live RFQ.", "New end = now − 5 min; new end = current end − 5 min.",
  [LOGIN_B, "Extend with each value"],
  "Both refused ('End time cannot be less than the current time' / must be later than the current end).", "High", "Negative")
t("EXT", M, "Auction round", "In an auction the round's time follows the auction time", B, PB,
  "Auction with rounds.", "—",
  [LOGIN_B, "Try to extend the current round beyond the auction end"],
  "'Extend your auction time in order to extend current round's time!' — extend the auction first.", "High", "Negative")
t("EXT", M, "Mail on extension", "Vendors get 'Submission time extended' for an auction", V, PV,
  "Live auction, 2 QA vendors.", "—",
  [LOGIN_B, "Extend by 10 min", "Open both QA mailboxes"],
  "Each vendor gets '⏰ <ref> | Submission time extended …' with the new end in their time zone. For RFQ / knockout / Dutch no such mail is sent today (record).", "Medium")
t("EXT", M, "After close", "Extending a closed round reopens it only within the allowed window", BV, PBV,
  "RFQ closed 2 min ago, evaluation running.", "+15 min.",
  [LOGIN_B, "Settings → Extend Submission Time"],
  "Either refused (closed) or reopened with a new end — record; if reopened, vendors can bid again and existing bids keep their stored end time.", "High", "Edge")
t("EXT", M, "Extension during evaluation blocks awarding", "No awarding while the extension is running", B, PB,
  "Extended RFQ.", "—",
  [LOGIN_B, "Master QCS → Start Awarding"],
  "Disabled with tooltip while the stage is live.", "Medium", "Negative")

# ═══════════════════ 12. Other settings ═══════════════════
M = "12. Settings — Rejected Bids, Order Activity, Edit Evaluation Time"
t("SET", M, "Reject a bid", "Reject a submitted bid with a reason", BV, PBV,
  "Live RFQ with a bid from vendor A.", "Reason 'Price not acceptable'.",
  [LOGIN_B, "Responses → vendor A's bid → Reject → leave the reason empty → Reject; then type the reason → choose Allow re-bidding yes/no → Reject", LOGIN_V, "Open the event"],
  "Empty reason: 'Please add a reason for rejecting this bid'. With reason: bid status Rejected; vendor sees Rejected with the reason. Re-bidding allowed: vendor can quote again; not allowed: a new bid is refused.", "Critical", "Negative")
t("SET", M, "Rejected Bids list", "Settings → Rejected Bids lists every rejection", B, PB,
  "Two rejected bids.", "—",
  [LOGIN_B, "Settings → Rejected Bids"],
  "Both bids with vendor, time, reason, re-bid allowed flag; rejecting the same bid twice is refused; rejecting one vendor leaves the other active.", "High")
t("SET", M, "Restore rejected", "Put a rejected bid back to active while bidding is open", B, PB,
  "Rejected bid, round live.", "—",
  [LOGIN_B, "Rejected Bids → Restore / set active"],
  "Bid active again and counted in Master QCS; after the round closes restoring is refused.", "Medium", "Edge")
t("SET", M, "Order Activity", "Order Activity shows the event's audit trail", B, PB,
  "Event with publish, extension, rejection, counter offer.", "—",
  [LOGIN_B, "Settings → Order Activity"],
  "Entries in time order with actor and action for each change (created, published, vendor added, extended, bid rejected, counter offer sent, awarded…).", "High")
t("SET", M, "Edit evaluation time", "Change the evaluation window after bidding closed", B, PB,
  "Closed RFQ in evaluation (30 min).", "Evaluation +30 min.",
  [LOGIN_B, "Settings → Edit Evaluation Time → new end → Save"],
  "Evaluation end moves; counter offers / awarding allowed until then; a value before now is refused ('Evaluation time is required' / invalid).", "High")
t("SET", M, "Evaluation time after award", "Evaluation cannot be edited once an award proposal exists", B, PB,
  "Award proposal submitted.", "—",
  [LOGIN_B, "Settings → Edit Evaluation Time"],
  "Absent or refused.", "Medium", "Negative")
t("SET", M, "Convert to Auction", "Convert a closed RFQ into an auction stage", B, PB,
  "Closed RFQ with bids.", "—",
  [LOGIN_B, "Settings → Convert to Auction → Continue → set strategy, schedule → Publish"],
  "Auction stage added; vendors' RFQ prices become their starting bids ('RFQ final bid'); RFQ stage read-only.", "High")
t("SET", M, "Edit price cap after bids", "Changing a vendor's price cap after bids", B, PB,
  "Live auction, vendor bid at 90 with cap 100.", "Cap → 80; cap → 120.",
  [LOGIN_B, "Participants → Add Price Cap → change"],
  "Lowering below an existing bid is refused ('Cannot edit rates after bids have been placed' or similar); raising is allowed — record the exact rule.", "Medium", "Edge")

# ═══════════════════ 13. Vendor bidding ═══════════════════
M = "13. Vendor side — submit a bid"
t("BID", M, "Open event", "Invited vendor sees the event with sheet, T&C and attachments", V, PV,
  "Live RFQ, vendor invited.", "—",
  [LOGIN_V, "Open the event from the list / mail link"],
  "Title, countdown, product sheet with the buyer's quantity and location, Price cells editable, T&C and Quotation Templates downloadable.", "Critical")
t("BID", M, "Submit", "Submit a complete bid", BV, PBV,
  "—", "Price ₹100/unit, GST 18%.",
  [LOGIN_V, "Fill Price (and other vendor columns), accept T&C if mandatory", "Submit → confirm", LOGIN_B, "Responses tab"],
  "Vendor: 'Bid submitted' with revision 1 and time. Buyer: the bid in Responses with total ₹100 × 10 + GST; Participation 1/N; Master QCS now shows the vendor column.", "Critical")
t("BID", M, "Empty price", "Submit with a required cell empty is refused", V, PV,
  "—", "—",
  [LOGIN_V, "Leave Price empty → Submit"],
  "Refused with the cell highlighted; nothing saved as submitted.", "High", "Negative")
t("BID", M, "Price cap", "A bid above the cap is refused", V, PV,
  "Cap ₹100.", "₹101; ₹100.",
  [LOGIN_V, "Enter 101 → Submit; enter 100 → Submit"],
  "101: 'Net Price should be less than ₹100/unit'. 100: accepted (≤ cap).", "High", "Negative")
t("BID", M, "Minimum quantity", "Offered quantity below the minimum is refused", V, PV,
  "Min qty 5.", "Qty offer 4.",
  [LOGIN_V, "Enter quantity 4 → Submit"],
  "Refused; 5 accepted.", "Medium", "Negative")
t("BID", M, "Before start / after end", "Bidding outside the window is refused", V, PV,
  "Upcoming event; closed event.", "—",
  [LOGIN_V, "Try to submit on the upcoming event; on the closed event"],
  "Upcoming: Submit disabled ('bidding starts at…'). Closed: refused; sheet read-only.", "High", "Negative")
t("BID", M, "Draft bid", "Save a draft and submit later", V, PV,
  "—", "—",
  [LOGIN_V, "Fill, Save as draft, leave", "Return and Submit"],
  "Draft kept for the vendor only (buyer does not see drafts; a draft cannot be rejected by the buyer); Submit sends it.", "Medium")
t("BID", M, "Attachment with bid", "Attach a file to the bid", BV, PBV,
  "Template with vendor attachment column.", "quote.pdf.",
  [LOGIN_V, "Attach quote.pdf → Submit", LOGIN_B, "Responses → open the bid"],
  "File downloadable on the buyer side.", "Medium")
t("BID", M, "Service bid", "Quote rates per activity on a service event", BV, PBV,
  "Service event with 2 services × 3 activities.", "Rates per activity.",
  [LOGIN_V, "Enter a rate for every activity → Submit", LOGIN_B, "Responses"],
  "Totals = Σ rate × activity quantity; a missing activity rate blocks submit.", "High")
t("BID", M, "Multi-currency", "Vendor bids in a second currency", BV, PBV,
  "enable_multi_currency_flow on; INR + USD on the event.", "USD 1.20.",
  [LOGIN_V, "Choose USD → price 1.20 → Submit", LOGIN_B, "Master QCS"],
  "Converted at the event's rate with the right precision; the vendor's currency shown on the comparison.", "Medium")

# ═══════════════════ 14. Bid revision ═══════════════════
M = "14. Vendor side — revising a bid (increment / decrement rules)"
t("REV", M, "RFQ revision", "In an RFQ a vendor may revise up or down while live", BV, PBV,
  "Live RFQ, bid 100.", "Revise to 120; then to 90.",
  [LOGIN_V, "Edit bid → 120 → Submit; → 90 → Submit", LOGIN_B, "Responses → revision history"],
  "Both accepted; revision 2 and 3 with timestamps; Master QCS shows the latest (90).", "Critical")
t("REV", M, "Reverse auction decrement", "In a reverse (buy) auction only a lower price is accepted", V, PV,
  "Live reverse auction, bid 100, tick 1%.", "99; 100; 101.",
  [LOGIN_V, "Revise to 99 → Submit; 100; 101"],
  "99 accepted (≥ one tick lower); 100 and 101 refused ('must be lower than your last bid' / tick rule).", "Critical", "Negative")
t("REV", M, "Forward auction increment", "In a forward (sell) auction only a higher price is accepted", V, PV,
  "Live forward auction, bid 100.", "101; 100.",
  [LOGIN_V, "Revise to 101; to 100"],
  "101 accepted; 100 refused.", "High", "Negative")
t("REV", M, "Tick size", "The decrement must respect the tick size (value or %)", V, PV,
  "Tick ₹5; bid 100.", "97; 95.",
  [LOGIN_V, "Revise to 97; to 95"],
  "97 refused (less than one tick); 95 accepted. English auction: the cap moves with the tick.", "High", "Negative")
t("REV", M, "Rank visibility", "Vendor sees its rank only when the client shows it", V, PV,
  "display_vendor_rank_in_auction_qcs on/off.", "—",
  [LOGIN_V, "Bid; read the rank badge"],
  "Shown (L1/L2…) when the flag is on; hidden otherwise. Ties at the top: everyone shows rank 2, nobody rank 1 — record (known behaviour to confirm).", "Medium", "Edge")
t("REV", M, "Revision after counter offer", "A pending counter offer freezes the vendor's own revisions", V, PV,
  "Counter offer sent to the vendor during live bidding.", "—",
  [LOGIN_V, "Try Edit bid"],
  "Revision disabled until the counter offer is answered.", "High", "Negative")
t("REV", M, "Revision after award", "A bid put on an award cannot be revised to block the submit", BV, PBV,
  "Evaluation window; buyer drafted an award with vendor A.", "—",
  [LOGIN_V, "Revise the bid", LOGIN_B, "Submit the award"],
  "Either the revision is refused, or the award submit is blocked ('bid revised') — record which; the awarded amount must never silently differ from the bid.", "High", "Edge")

# ═══════════════════ 15. Revert / revoke ═══════════════════
M = "15. Vendor side — revert / revoke a bid"
t("RVK", M, "Revoke allowed", "Vendor revokes a submitted bid where revoking is allowed", BV, PBV,
  "Round with is_revoke_bid_allowed; vendor bid.", "—",
  [LOGIN_V, "Open the bid → Revoke → confirm", LOGIN_B, "Responses / Master QCS"],
  "Bid status Revoked; removed from the comparison and from awarding; the revoke is in Order Activity; a revoked bid cannot be changed again.", "High")
t("RVK", M, "Revoke not allowed", "Without the setting there is no Revoke", V, PV,
  "Round without revoke.", "—",
  [LOGIN_V, "Open the bid"],
  "No Revoke action; API refusal if forced.", "Medium", "Negative")
t("RVK", M, "Revert to previous revision", "Vendor reverts to the earlier revision", BV, PBV,
  "RFQ; revisions 100 → 90.", "—",
  [LOGIN_V, "Revision history → Revert to revision 1 → confirm", LOGIN_B, "Responses"],
  "Current price 100 again as a new revision (3); history keeps all three.", "Medium")
t("RVK", M, "Buyer cannot revoke", "The buyer cannot revoke a vendor's bid", B, PB,
  "—", "—",
  [LOGIN_B, "Try to set the vendor's bid to revoked (UI / API)"],
  "Refused; only reject is available to the buyer.", "Medium", "Negative")
t("RVK", M, "Revoke after close", "Revoke after the round closed is refused", V, PV,
  "Closed round.", "—",
  [LOGIN_V, "Revoke"],
  "Refused; bid stays.", "Medium", "Negative")

# ═══════════════════ 16. Surrogate bid ═══════════════════
M = "16. Buyer side — surrogate bid"
t("SUR", M, "Add Bid", "Buyer places a bid on behalf of an invited vendor", BV, PBV,
  "Live RFQ; template allows surrogate.", "Vendor A, price 95.",
  [LOGIN_B, "Stage → Participants → vendor A → Add Bid → drawer with the vendor's sheet → price 95 → Submit", LOGIN_V, "Open the event"],
  "Submit disabled until a price is typed; after submit the bid shows as vendor A's with a 'surrogate' marker in Responses and Master QCS; vendor A sees it as its own bid (and can revise — record).", "Critical")
t("SUR", M, "Not allowed by template", "Add Bid hidden when the template forbids surrogate bids", B, PB,
  "Template with is_buyer_not_allowed_to_add_surrogate_bid.", "—",
  [LOGIN_B, "Participants tab"],
  "No Add Bid button; 'Bid & Price Cap can be added after event creation.' on drafts.", "High", "Negative")
t("SUR", M, "Approval flow", "Surrogate bids go through approval where configured", B, PB,
  "Workspace with surrogate approval.", "—",
  [LOGIN_B, "Add Bid → Submit", "Open approvals"],
  "Bid pending approval; counted only after approval; rejection removes it.", "Medium")
t("SUR", M, "Uninvited vendor", "Surrogate for a vendor not on the event", B, PB,
  "Vendor B not invited.", "—",
  [LOGIN_B, "Try Add Bid for vendor B (API)"],
  "Must be refused (seen live on UAT: accepted — known defect S7; re-check).", "High", "Negative")
t("SUR", M, "Without technical response", "Surrogate on a two-stage event before the technical response", B, PB,
  "Technical + RFQ; vendor has no technical response.", "—",
  [LOGIN_B, "Add Bid on the RFQ for that vendor"],
  "Must be refused until the technical stage is answered/qualified (seen live: accepted — S11; re-check).", "Medium", "Negative")

# ═══════════════════ 17. Counter offer / reject quote ═══════════════════
M = "17. Negotiation — counter offer and reject quote"
t("NEG", M, "Send counter offer", "Buyer counters a normal (RFQ) bid on one line", BV, PBV,
  "RFQ in evaluation; vendor A bid 100.", "Counter 90.",
  [LOGIN_B, "Responses → vendor A → Counter Offer → tick the line → price 90 → Send", LOGIN_V, "Open the event"],
  "Vendor sees the counter offer with Accept / Reject / Counter; while pending the vendor cannot revise; buyer sees 'Counter offer sent'.", "Critical")
t("NEG", M, "No line ticked", "Counter offer needs a line and a changed column", B, PB,
  "—", "—",
  [LOGIN_B, "Counter Offer → Send without ticking; tick but change nothing"],
  "'Please select atleast one product to send counter offer' / 'You must change atleast one column to send counter offer'.", "High", "Negative")
t("NEG", M, "Only normal bids", "Counter offer is not offered on auction bids", B, PB,
  "Auction with bids.", "—",
  [LOGIN_B, "Responses on the auction"],
  "No Counter Offer action (only on RFQ / normal bids).", "High", "Negative")
t("NEG", M, "Vendor accepts", "Vendor accepts the counter offer", BV, PBV,
  "Pending counter 90.", "—",
  [LOGIN_V, "Accept", LOGIN_B, "Master QCS"],
  "Final Negotiated Rate 90 on the comparison; line savings computed on 90 (record if shown as no line saving — known gap).", "Critical")
t("NEG", M, "Vendor rejects", "Vendor rejects the counter offer", BV, PBV,
  "—", "—",
  [LOGIN_V, "Reject", LOGIN_B, "Responses"],
  "Original bid stands; status 'Counter offer rejected'; buyer may award at 100 or counter again.", "High")
t("NEG", M, "Vendor counters back", "Vendor sends a counter to the counter", BV, PBV,
  "—", "95.",
  [LOGIN_V, "Counter → 95 → Send", LOGIN_B, "Accept / reject"],
  "Chain recorded in order; the last accepted value becomes the negotiated rate.", "High")
t("NEG", M, "After evaluation ends", "A counter offer raised after the evaluation window cannot be accepted", BV, PBV,
  "Round closed, evaluation over.", "—",
  [LOGIN_B, "Send a counter offer", LOGIN_V, "Try to accept"],
  "Either the buyer is refused, or the vendor cannot accept (no window) — record; a counter that can never be answered is a defect.", "Medium", "Edge")
t("NEG", M, "Double click", "Two quick clicks on Send do not create two counter offers", B, PB,
  "—", "—",
  [LOGIN_B, "Click Send twice quickly"],
  "One counter offer only (seen live: two — known defect; re-check).", "Medium", "Edge")
t("NEG", M, "Reject quote", "Buyer rejects a vendor's whole quote", BV, PBV,
  "RFQ with vendor B quote.", "Reason 'Non-compliant'.",
  [LOGIN_B, "Responses → vendor B → Reject Quote → reason → confirm", LOGIN_V, "Open the event"],
  "Quote marked Rejected with reason; excluded from Master QCS ranking and awarding; vendor sees the rejection.", "High")

# ═══════════════════ 18. Master QCS ═══════════════════
M = "18. Master QCS and its report"
t("QCS", M, "Before bids", "Master QCS before any bid", B, PB,
  "Live, no bids.", "—",
  [LOGIN_B, "Project → Master QCS tab"],
  "'No bids are placed yet!'; Start Awarding disabled.", "High")
t("QCS", M, "After bids", "One column per vendor with the comparison rows", B, PB,
  "2 bids (100 and 90) on 10 ST.", "—",
  [LOGIN_B, "Master QCS"],
  "Columns for both vendors; rows PR Qty, Product, Qty Offer, Rank (90 = 1, 100 = 2), RFQ Amount (900 / 1000), Final Negotiated Rate/Amount, GST, Other Charges, Sum Total, Loading Factor; totals = Σ line totals.", "Critical")
t("QCS", M, "Live update", "Comparison updates as bids arrive and ranks recompute", BV, PBV,
  "—", "Vendor A revises 100 → 85.",
  [LOGIN_V, "Revise", LOGIN_B, "Master QCS refresh"],
  "A now rank 1, B rank 2; amounts recomputed.", "High")
t("QCS", M, "Savings", "Savings card and savings in the QCS follow the formula", B, PB,
  "Savings on Budget ₹120/unit; best bid 90.", "—",
  [LOGIN_B, "Overview savings card; Master QCS savings row"],
  "Savings = (120 − 90) × 10 = 300; % = 25. Reference 0 must not show 'Infinity %'.", "High")
t("QCS", M, "Rejected / revoked excluded", "Rejected and revoked bids do not rank", B, PB,
  "One rejected, one revoked, one active.", "—",
  [LOGIN_B, "Master QCS"],
  "Only the active bid ranks; the others are shown struck/absent — record.", "High")
t("QCS", M, "Download report", "Download the Master QCS report and check it equals the screen", B, PB,
  "Bids present.", "—",
  [LOGIN_B, "Master QCS → Download Report", "Open the file"],
  "Summary (event id/title/template/dates/duration/creator/vendors invited/participated/closed at) and per-vendor columns Rate, P&F, Basic Rate Before GST, GST %, TCS %, Total Freight, Other Charges Incl GST, Gross Amount, Rank (V4) — every rank, amount and total equals the screen at download time.", "Critical")
t("QCS", M, "Report version", "The report version follows the client's setting", B, PB,
  "Clients with V4 / V3 / template report.", "—",
  [LOGIN_B, "Download on each client"],
  "Report Template if set, else V4 → V3 → V1 → V2 by the mqcs_report_vN flags; columns differ accordingly.", "Medium")
t("QCS", M, "Silent vendors", "Vendors invited but never bid in the report", B, PB,
  "3 invited, 2 bid.", "—",
  [LOGIN_B, "Download Report"],
  "Record whether the silent vendor appears (and with what cells); invited 3 / participated 2 in the summary.", "Medium", "Edge")
t("QCS", M, "Technical scores", "Two-stage event shows technical score next to price", B, PB,
  "Technical + RFQ; evaluator scored.", "—",
  [LOGIN_B, "Master QCS"],
  "Technical score / qualification per vendor; unqualified vendors flagged.", "Medium")
t("QCS", M, "Vendor side", "Vendor sees only its own figures (and rank if allowed)", V, PV,
  "—", "—",
  [LOGIN_V, "Open the event after bidding"],
  "Own sheet equals the buyer's view of it; other vendors' prices never visible.", "High", "Negative")

# ═══════════════════ 19. Awarding ═══════════════════
M = "19. Awarding — complete, partial, approval, PO"
t("AWD", M, "Start Awarding", "Start Awarding is enabled only when the stage is closed and latest", B, PB,
  "Live stage; closed stage.", "—",
  [LOGIN_B, "Master QCS → Start Awarding on each"],
  "Live/draft/not-latest: disabled with tooltip. Closed: opens the awarding screen with the bids.", "Critical")
t("AWD", M, "Complete award", "Award the whole lot to L1", B, PB,
  "Closed RFQ, 2 bids.", "Vendor A (L1).",
  [LOGIN_B, "Start Awarding → select vendor A for the full quantity → Submit (remark)"],
  "Award proposal created; total = 10 × 90 = 900; 'Please award for at least one Vendor' if nothing selected.", "Critical")
t("AWD", M, "Partial award", "Split a line between two vendors", B, PB,
  "is_partial_awarding_enabled on.", "A 6 ST, B 4 ST.",
  [LOGIN_B, "Start Awarding → quantities 6 and 4 → Submit"],
  "Each amount = its qty × its own price; total = sum; awarding 11 in total is refused (more than the line); with partial off a second vendor cannot be added.", "Critical")
t("AWD", M, "Line-wise", "Different lines to different best bidders", B, PB,
  "3 lines.", "—",
  [LOGIN_B, "Award each line to its L1"],
  "Each line whole to its vendor; exact amounts.", "High")
t("AWD", M, "Vendor who never bid", "Cannot award to a non-bidder", B, PB,
  "—", "—",
  [LOGIN_B, "Try to include vendor C (no bid)"],
  "Not offered / refused.", "High", "Negative")
t("AWD", M, "Award during bidding", "Awarding while the round is live must be blocked", B, PB,
  "Live round.", "—",
  [LOGIN_B, "Force Start Awarding (API)"],
  "Refused (seen live: allowed on one client — known defect; re-check).", "High", "Negative")
t("AWD", M, "Approval", "Award proposal goes through approval; remark needed", B, PB,
  "Approval flow configured.", "Remark 'L1 selected'.",
  [LOGIN_B, "Submit award → approver approves with remark", "Approve without remark first"],
  "'Remark is necessary for approval'; approvals can expire — approve promptly; on completion the bid becomes Selected; Master QCS shows 'Approval in Progress' meanwhile and hides Start Awarding.", "Critical")
t("AWD", M, "Rejected approval", "Approver rejects the award", B, PB,
  "—", "—",
  [LOGIN_B, "Approver → Reject"],
  "Proposal rejected; buyer can award again; nothing selected.", "High")
t("AWD", M, "PO creation", "PO is generated per awarded vendor", B, PB,
  "Approved award, 2 vendors (partial).", "—",
  [LOGIN_B, "After approval open Orders"],
  "One PO per vendor with its quantity and price; event moves to History; PR lines show Ordered/In Progress quantities.", "Critical")
t("AWD", M, "Custom PO form", "Without skip_custom_po a Create PO form appears", B, PB,
  "Workspace needing the PO form.", "—",
  [LOGIN_B, "After approval → Create PO → fill the form → Create"],
  "PO created with the form's fields; mandatory fields enforced.", "High")
t("AWD", M, "Change award before submit", "Remove and re-add a vendor on the draft award", B, PB,
  "—", "—",
  [LOGIN_B, "Draft award: remove A → total drops by A's amount → add back"],
  "Totals exact each time; zero-quantity award adds nothing.", "Medium", "Edge")
t("AWD", M, "Award only locked lines (amendment)", "On an amendment event only new lines can be awarded", B, PB,
  "PO amendment event (.1).", "—",
  [LOGIN_B, "Award a carried (locked) line"],
  "Refused (error 1158); new lines awardable.", "Medium", "Negative")
t("AWD", M, "Winner view", "Awarded vendor sees the award; others see not selected", V, PV,
  "—", "—",
  [LOGIN_V, "Open the event as A and as B"],
  "A: Awarded with quantity/amount; B: Not awarded / closed; neither sees the other's price.", "High")

# ═══════════════════ 20. Reports ═══════════════════
M = "20. Reports"
t("RPT", M, "Awarding report", "Download the awarding / comparative statement", B, PB,
  "Awarded event.", "—",
  [LOGIN_B, "Master QCS / Awarding → Download"],
  "Awarded vendor(s), quantities, rates, totals, savings equal the screen; file opens without error.", "High")
t("RPT", M, "Savings report", "Savings in the report follow the configured reference", B, PB,
  "Budget / historical / existing-proposal savings.", "—",
  [LOGIN_B, "Download report; compare the savings columns"],
  "Each strategy's figure matches the formula; negative savings shown as negative (record if hidden).", "Medium")
t("RPT", M, "Event report after PO", "Report still downloads from History", B, PB,
  "Event with PO.", "—",
  [LOGIN_B, "History → event → Master QCS → Download"],
  "Same figures as before the PO; PO number shown in purchase history columns.", "Medium")
t("RPT", M, "Participant remarks / analytics", "Stage sub-tabs Analytics and Price Trends", B, PB,
  "Auction with several revisions.", "—",
  [LOGIN_B, "Stage → Analytics; Price Trends"],
  "Price trend per vendor over time matches the revision history; participant remarks listed.", "Low")
t("RPT", M, "Order Activity export", "Order Activity can be read for the whole flow", B, PB,
  "Event that went PR → event → bids → award → PO.", "—",
  [LOGIN_B, "Settings → Order Activity"],
  "Every step above is present in order with actor and time; nothing missing between publish and PO.", "Medium")

# ═══════════════════ Excel ═══════════════════
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "E2E PR to Award"
hdr = ["Test Case ID", "Module", "Scenario", "Test Case Title", "User Role", "Portal", "Pre-conditions", "Test Data", "Test Steps", "Expected Result", "Priority", "Test Type", "Status"]
ws.append(hdr)
for c in C:
    ws.append([c["id"], c["module"], c["scenario"], c["title"], c["role"], c["portal"], c["pre"], c["data"],
               "\n".join(f"{i+1}. {s}" for i, s in enumerate(c["steps"])), c["expected"], c["p"], c["typ"], ""])
for i, w in enumerate([14, 30, 24, 46, 14, 16, 38, 34, 60, 70, 10, 10, 8], 1):
    ws.column_dimensions[get_column_letter(i)].width = w
for cell in ws[1]:
    cell.font = Font(bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor="1F3A5F"); cell.alignment = Alignment(wrap_text=True, vertical="top")
for row in ws.iter_rows(min_row=2):
    for cell in row: cell.alignment = Alignment(wrap_text=True, vertical="top")
ws.freeze_panes = "D2"
wb.save(OUT_XLSX)

# ═══════════════════ HTML ═══════════════════
esc = lambda s: html.escape(str(s)).replace("\n", "<br>")
mods = []
for c in C:
    if c["module"] not in mods: mods.append(c["module"])
NARR = [
 ("0", "Choose and read the PR", "If a PR number is given, open exactly that PR; otherwise pick a random PR from the Open tab whose line is fully open. Read the Item Type badge: M = material (material code, quantity + UOM), S = service (service code, activities, rate-based); an asset line is recognised from Account Assignment / asset number in the line details. Material and service lines never share one event. Partly processed, on-hold or dormant lines cannot be sourced. 'Purchase Items' carries the line into a draft event."),
 ("1–2", "Create the event", "Single Stage = one screen, Event Type RFP (default) / RFQ / Auction, template first (no sheet before it), then products, vendors, T&C, schedule, Publish. eRFX project = stages on one strip: one default Auction, '+' adds stages, RFQ and Auction never coexist, two stages max, each stage has its own template and Items drawer, a Technical stage needs the Vendor Assessment template + evaluator, Technical must end before RFQ. RFQ → Auction is a conversion from Settings, never a composition. Save as draft keeps everything."),
 ("3–4", "Title, attachments, Terms & Conditions", "Auto title '<product> - <location>' fills only while the title is empty or still the previous auto title; otherwise it must be typed ('Please enter title.'). T&C can be event-wise (apply to all stages) or stage-wise; template clauses load on template select. The Mandatory switch makes every clause and attachment required for the vendor — Submit is blocked until all are accepted; with it off a vendor may submit without accepting."),
 ("5", "Find an existing event", "Live (incl. Upcoming), History (closed / awarded / PO created / withdrawn) and Drafts tabs; search by RFX id or title; the badge + countdown give the state; History is where an event lands once its PO exists."),
 ("6", "Invite vendors", "Mapped vendors come from the products ('Invite N more participant based on the products' → Invite Vendor takes all); a named vendor is found through 'Search vendors you want to add' (not the Evaluator picker); publish without vendors is refused first ('Please add participants to proceed!'); vendors can be added to a live event; uninvited vendors must not bid."),
 ("7–8", "Schedule and publish", "Start now or a date up to 3 months ahead; duration presets 30 min / 1 h / 4 h / 24 h / custom; evaluation duration after the end; dynamic closing and extra closing for auctions; Save Schedule must be pressed. Publish refusals come in the app's order (participants → template/savings → title → sheet → strategy → schedule). A new version needs addendum remarks."),
 ("9", "Withdraw", "⋮ → Withdraw Project (live, upcoming, requested, draft, expired); status Withdrawn on both sides; PR quantities return to Open; not offered after award/PO. Send Reminders mails only the non-bidders."),
 ("10–12", "Settings menu", "Recreate Order = modal with the product sheet, end-time presets (15/30/60 min, 4 h, 24 h, custom), evaluation presets (15/30/45/60, custom, Clear), delivery date, 'Schedule this event?', Edit More Details. Extend Submission Time only forward and only on a live round (auction round follows the auction time; vendors mailed for auctions). Reschedule only while Upcoming. Rejected Bids needs a reason and decides re-bidding. Order Activity is the audit trail. Edit Evaluation Time moves the evaluation end. Convert to Auction turns a closed RFQ into an auction stage."),
 ("13–15", "Vendor bidding", "Submit with every required cell, within the window, under the price cap and above the minimum quantity; drafts stay private. Revision: RFQ any direction; reverse auction only lower by at least one tick; forward auction only higher. A pending counter offer freezes revisions. Revoke only where allowed (final); Revert returns to an earlier revision; the buyer can reject but never revoke."),
 ("16–17", "Surrogate and negotiation", "Add Bid on the Participants tab places a bid for the vendor (hidden when the template forbids it; may need approval). Counter offer only on normal (RFQ) bids, needs a ticked line and a changed column; vendor accepts / rejects / counters; Reject Quote drops a vendor's quote from ranking."),
 ("18", "Master QCS", "'No bids are placed yet!' before bids; then one column per vendor with Rank, amounts, negotiated rate, charges, Sum Total; updates live; Download Report must equal the screen (version by client: template → V4 → V3 → V1 → V2)."),
 ("19–20", "Awarding and reports", "Start Awarding only on a closed, latest stage; complete (whole lot to L1), partial (split quantities, never more than the line), line-wise; non-bidders cannot be awarded; approval with a mandatory remark; one PO per vendor; event moves to History; winner sees Awarded; reports (awarding, savings, order activity) must match the screen."),
]
narr_html = "".join(f'<div class="step"><div class="num">{esc(n)}</div><div><h4>{esc(h)}</h4><p>{esc(b)}</p></div></div>' for n, h, b in NARR)
rows = ""
for m in mods:
    cs = [x for x in C if x["module"] == m]
    rows += f'<tr class="area"><td colspan="9">{esc(m)} <span class="cnt">{len(cs)} cases</span></td></tr>'
    for c in cs:
        steps = "".join(f"<li>{esc(s)}</li>" for s in c["steps"])
        rows += (f'<tr><td class="id">{esc(c["id"])}</td><td><b>{esc(c["title"])}</b><div class="sc">{esc(c["scenario"])}</div></td>'
                 f'<td>{esc(c["role"])}<div class="sc">{esc(c["portal"])}</div></td><td>{esc(c["pre"])}</td><td>{esc(c["data"])}</td>'
                 f'<td><ol>{steps}</ol></td><td>{esc(c["expected"])}</td><td><span class="p p-{c["p"].lower()}">{esc(c["p"])}</span></td><td>{esc(c["typ"])}</td></tr>')
n = len(C)
toc = "".join(f'<li>{esc(m)} <span class="cnt">{COUNTERS[[x for x in C if x["module"]==m][0]["id"].split("-")[1]]}</span></li>' for m in mods)
page = f"""<title>Sourcing End-to-End Test Cases</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* layout: narrative first, then one wide case table per module that scrolls in its own box */
:root{{--bg:#f6f7f5;--paper:#fff;--ink:#1d2320;--muted:#5d6a63;--line:#d9ded9;--accent:#1f3a5f;--accent-ink:#fff;--soft:#eef2f7;--bad:#b3261e;--warn:#9a6700;--ok:#1d7a4f;--font:"IBM Plex Sans",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,monospace}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#151917;--paper:#1d2320;--ink:#e7ebe8;--muted:#a3ada7;--line:#343b37;--accent:#8fb4e3;--accent-ink:#0f1a28;--soft:#232b33;--bad:#ff9a8f;--warn:#f3c66b;--ok:#7fd3a5;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#151917;--paper:#1d2320;--ink:#e7ebe8;--muted:#a3ada7;--line:#343b37;--accent:#8fb4e3;--accent-ink:#0f1a28;--soft:#232b33;--bad:#ff9a8f;--warn:#f3c66b;--ok:#7fd3a5;color-scheme:dark}}
body{{background:var(--bg);color:var(--ink);font-family:var(--font);line-height:1.5;padding-block:28px;padding-inline:max(16px,3vw)}}
main{{max-width:1320px;margin:0 auto;display:grid;gap:26px}}
h1{{font-size:1.8rem;margin:0 0 6px;text-wrap:balance}} h2{{font-size:1.25rem;margin:0 0 10px}} h4{{margin:0 0 4px;font-size:1rem}}
.lead{{color:var(--muted);max-width:74ch;margin:0}} .eyebrow{{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}}
section{{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:20px}}
.steps{{display:grid;gap:12px}} .step{{display:grid;grid-template-columns:56px 1fr;gap:12px;align-items:start}} .num{{font-family:var(--mono);font-weight:600;color:var(--accent);padding-top:3px}} .step p{{margin:0;font-size:.94rem}}
.toc{{columns:2;column-gap:28px;margin:0;padding-left:18px;font-size:.92rem}} .toc li{{break-inside:avoid;margin:2px 0}} .cnt{{font-family:var(--mono);font-size:.8rem;color:var(--muted);margin-left:6px}}
.tablewrap{{overflow-x:auto;border:1px solid var(--line);border-radius:8px}}
table{{border-collapse:collapse;width:100%;min-width:1280px;font-size:.86rem}}
th,td{{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}} th{{background:var(--soft);position:sticky;top:0}}
tr.area td{{background:var(--accent);color:var(--accent-ink);font-weight:600}} tr.area .cnt{{color:var(--accent-ink);opacity:.8}}
td.id{{font-family:var(--mono);white-space:nowrap}} .sc{{color:var(--muted);font-size:.82rem;margin-top:2px}}
ol{{margin:0;padding-left:18px}} ol li{{margin:2px 0}}
.p{{display:inline-block;padding:1px 8px;border-radius:999px;font-size:.78rem;font-weight:600;border:1px solid currentColor;white-space:nowrap}} .p-critical{{color:var(--bad)}} .p-high{{color:var(--warn)}} .p-medium{{color:var(--ok)}} .p-low{{color:var(--muted)}}
@media (max-width:700px){{.toc{{columns:1}} .step{{grid-template-columns:44px 1fr}}}}
</style>
<main>
<header>
  <div class="eyebrow">Procol sourcing · PR → event → vendors → bids → Master QCS → award → PO · buyer and vendor portals · 27 Oct 2026</div>
  <h1>Sourcing End-to-End Test Cases</h1>
  <p class="lead">{n} test cases across {len(mods)} modules, in the order a buyer and a vendor live the flow. Every case has pre-conditions, test data, numbered steps and the expected result, in the same columns as the PO Amendment sheet. Where the product's intended behaviour is not settled, the expected result says "record" and names the known finding.</p>
</header>
<section>
  <h2>The flow, in order — what each part must do</h2>
  <div class="steps">{narr_html}</div>
</section>
<section>
  <h2>Modules</h2>
  <ol class="toc">{toc}</ol>
</section>
<section>
  <h2>Test cases ({n})</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>ID</th><th>Test case / scenario</th><th>Role / portal</th><th>Pre-conditions</th><th>Test data</th><th>Steps</th><th>Expected result</th><th>Priority</th><th>Type</th></tr></thead>
    <tbody>{rows}</tbody>
  </table></div>
</section>
<section>
  <h2>How to run these</h2>
  <ol>
    <li>Use the UAT test workspaces (PROCOL DEMO / M3M NOIDA) and QA test vendors only (QA_Platform_* names, qa_&lt;stamp&gt;@example.com); never a real supplier's address.</li>
    <li>Name every event "QA_Platform …" so it can be found and cleaned up; note the PR number, RFX id and stage code on each run.</li>
    <li>Run the modules in order: a later module's pre-condition is the earlier module's result (PR → event → bids → award → PO).</li>
    <li>Where a case says "record", write what the app did in Status/Remarks and raise it with product before calling it a defect.</li>
  </ol>
</section>
</main>
"""
OUT_HTML.write_text(page)
print(f"{n} cases, {len(mods)} modules → {OUT_HTML.name}, {OUT_XLSX.name}")
