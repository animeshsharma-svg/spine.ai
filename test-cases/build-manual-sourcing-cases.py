#!/usr/bin/env python3
"""Manual, plain-language sourcing test cases (PR → event → vendors → bidding →
negotiation → Master QCS → awarding → PO), written the way a senior manual QA
writes them: every click, every screen, what you should see. Combinations are
spelled out in full so each case can be run on its own.

Output: Excel in the PO Amendment columns + an HTML page."""
import html, itertools
from pathlib import Path
import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HERE = Path(__file__).resolve().parent
OUT_HTML = HERE / "manual-sourcing-test-cases.html"
OUT_XLSX = HERE / "Manual_Sourcing_Test_Cases.xlsx"

C, N = [], {}
def tc(code, module, scenario, title, role, portal, pre, data, steps, expected, p="High", typ="Positive"):
    N[code] = N.get(code, 0) + 1
    C.append(dict(id=f"TC-{code}-{N[code]:03d}", module=module, scenario=scenario, title=title, role=role, portal=portal, pre=pre, data=data, steps=steps, expected=expected, p=p, typ=typ))

# ───────────────────────── reusable plain-language step blocks ─────────────────────────
LOGIN_B = ["Open the Procol buyer website in Chrome and log in as the buyer user of the test company (enter the email or mobile, click Continue, enter the OTP you receive, click Verify). You land on the home dashboard."]
LOGIN_V = ["Open the Procol vendor portal in a separate browser (or incognito window) and log in as the QA test vendor (email qa_<stamp>@example.com, OTP). You land on the vendor's event list."]
GO_EVENTS = "Click 'Events' in the left-hand menu (calendar icon). The Events page opens with the tabs Live, History and Drafts, a search box and a blue 'Create Event' button at the top right."
GO_PR = "Click 'Purchase Requisitions' in the left-hand menu. The PR list opens with the tabs Open, In Progress, Completed, Rejected, Deleted and a table of PR lines."

def entry_steps(entry):
    if entry == "direct":
        return [GO_EVENTS, "Click the blue 'Create Event' button at the top right."]
    if entry == "material PR":
        return [GO_PR, "Stay on the Open tab. Find a line whose Item Type badge shows 'M' (material) and whose quantity is fully open (nothing in progress). Tick the checkbox at the start of that row.",
                "Click the 'Purchase Items' button (cart icon, top right; its badge shows 1). A pop-up asks how you want to source the line."]
    if entry == "service PR":
        return [GO_PR, "Stay on the Open tab. Find a line whose Item Type badge shows 'S' (service) — it shows '1 Service' instead of a material code. Tick its checkbox.",
                "Click the 'Purchase Items' button (cart icon, top right). A pop-up asks how you want to source the line."]
    raise ValueError(entry)

def type_steps(ev):
    if ev == "single-stage RFQ":
        return ["Choose 'Single Stage' (text: Source through RFP / RFQ / Auction). The create screen opens; 'Event Type' shows RFP selected by default.",
                "Click 'RFQ' under Event Type.", "Hover 'Select Templates' and click the RFQ template named in Test Data from the menu that opens (ignore any other menu that is still in the page). The product sheet with columns Product, Product Variant, Quantity Requested, Delivery location, Price appears."]
    if ev == "single-stage Auction":
        return ["Choose 'Single Stage'. On the create screen click 'Auction' under Event Type.", "Hover 'Select Templates' and click the auction template named in Test Data. The product sheet appears.",
                "In 'Auction Configurations' pick the strategy 'Rank based' (leave the other settings as they are)."]
    if ev == "single-stage RFP":
        return ["Choose 'Single Stage'. Keep 'RFP' selected under Event Type.", "Hover 'Select Templates' and click the RFP questionnaire template named in Test Data. The questionnaire appears instead of a price sheet.",
                "Scroll to 'Vendor Assessment', click the first dropdown there (the Evaluator picker) and choose the evaluator user named in Test Data."]
    if ev == "eRFX RFQ":
        return ["Choose 'eRFX Project' (text: Manage sourcing via a project approach). The project screen opens with a project Title box and a stage strip showing one stage tab 'Auction'.",
                "Hover the round '+' icon next to the stage tab; a menu titled 'Add Stages' opens. Click 'Technical'. A second tab 'Technical' appears.",
                "Click the three-dots (⋮) on the 'Auction' tab and click 'Delete'. The Auction tab disappears.",
                "Hover '+' again and click 'RFQ'. An 'RFQ' tab appears. Click ⋮ on the 'Technical' tab → Delete. Only the 'RFQ' tab remains. Click it so its panel shows.",
                "On the RFQ tab click 'Select Template' and pick the RFQ template named in Test Data."]
    if ev == "eRFX Technical + RFQ":
        return ["Choose 'eRFX Project'. The project screen opens with one stage tab 'Auction'.",
                "Hover '+' → click 'Technical'. Click ⋮ on 'Auction' → Delete. Hover '+' → click 'RFQ'. You now have the tabs 'Technical' and 'RFQ'.",
                "Click the 'Technical' tab → 'Select Template' → pick the questionnaire template in Test Data. In 'Vendor Assessment' click the template trigger inside that section and pick the assessment template; then pick the evaluator user.",
                "Click the 'RFQ' tab → 'Select Template' → pick the RFQ template in Test Data."]
    raise ValueError(ev)

def product_steps(ev, entry):
    if entry != "direct":
        return ["Check the product sheet: the PR line is already there with its product, variant, quantity with unit and delivery location copied from the PR. Do not change them."]
    if ev.startswith("eRFX"):
        return ["Click the 'Items 0' button in the toolbar. The 'Manage Line Items' drawer opens on the right.",
                "Click into the box 'Search and add line items', type the product name from Test Data and click it in the list that appears below. Enter the quantity 10 and choose the delivery location. Click 'Save'. The toolbar now shows 'Items 1'."]
    if ev == "single-stage RFP":
        return ["Answer the questionnaire's required questions with the sample answers in Test Data (there is no product sheet on an RFP)."]
    return ["Click into the first 'Product' cell of the sheet, type the product name from Test Data and click it in the list (the product code shows next to the name). 'Product Variant' fills itself.",
            "Click the 'Quantity Requested' cell, type 10 and press Tab. Click the 'Delivery location' cell and pick the plant from Test Data."]

def title_steps(mode):
    if mode == "auto":
        return ["Look at the Title box at the top: it has filled itself as '<product name> - <location>'. Leave it."]
    return ["Click the Title box at the top, delete whatever is there and type the title from Test Data (QA_Platform …)."]

def tnc_steps(mode):
    if mode == "none":
        return ["Do not open Terms & Conditions."]
    if mode == "optional":
        return ["Click 'Terms & Conditions' in the footer. In the drawer click 'Add clause', type 'Delivery within 15 days of PO' and click Save. Make sure the 'Mandatory' switch is OFF. Close the drawer."]
    return ["Click 'Terms & Conditions' in the footer. Click 'Add clause', type 'Delivery within 15 days of PO'. Click 'Attach' and upload GTC.pdf. Switch 'Mandatory' ON. Close the drawer."]

def vendor_steps(mode):
    if mode == "mapped":
        return ["Scroll to 'Participants'. A yellow strip says 'Invite N more participant based on the products'. Click the 'Invite Vendor' button in that strip. All the vendors mapped to the product are added and the strip disappears."]
    if mode == "named":
        return ["Scroll to 'Participants'. Click into the box 'Search vendors you want to add' (not the Evaluator box), type the QA vendor's name from Test Data and click the vendor in the list under 'VENDORS'. The vendor appears as a participant chip."]
    return ["Scroll to 'Participants'. Click 'Invite Vendor' in the yellow strip to add the mapped vendors, then also search and add the QA vendor named in Test Data. Both appear as participants."]

def schedule_steps(mode, multi=False):
    s = ["Click 'Schedule' in the footer. The 'Schedule Event' drawer opens" + (" with one block per stage ('1. Technical Stage' and '2. RFQ' — scroll to see the second)." if multi else ".")]
    if mode == "now 30 min":
        s.append("Keep 'Start now'. Under End time keep 'Duration' and click the '30 min' preset. Read the line 'Event will end at …' and write it down. Click 'Save Schedule'.")
    elif mode == "now custom 2 h + evaluation":
        s.append("Keep 'Start now'. Under End time choose 'Duration' → 'Custom' and type 2 hours. Under Evaluation time choose 30 minutes. Read 'Event will end at …'. Click 'Save Schedule'.")
    elif mode == "later (tomorrow 11:00)":
        s.append("Click 'Start later', pick tomorrow's date in the calendar and 11:00 in the time box. Under End time choose Duration '1 hour'. Click 'Save Schedule'.")
    if multi: s.append("Do the same in the second block (keep both blocks on Duration; the Technical block must end before the RFQ block).")
    s.append("Check the footer chip now shows the saved window.")
    return s

PUBLISH = ["Click the blue 'Publish Event' (or 'Publish') button in the footer. If a confirmation pop-up appears, click Confirm."]
LAND = "The page changes to the project page: the title you chose, an RFX number (e.g. RFX-3123) with a copy icon, the tabs Project Details / <stage> / Master QCS, a green 'Live' badge and a countdown. Under 'Published Stages' the stage code (RFQ-xxxx), Participants 0/N, Bidding Starts At and Bidding Ends At are shown."

# ═════════════════════ MODULE 1: PR list — every control, in plain words ═════════════════════
M = "1. Purchase Requisitions — reading and choosing a PR"
tc("PR", M, "Opening the PR list", "Open the Purchase Requisitions page and read what is on it", "Buyer", "Buyer portal",
   "The buyer can see Purchase Requisitions in the left menu.", "Any test company with PRs (e.g. M3M NOIDA on UAT).",
   LOGIN_B + [GO_PR, "Look at the tab counts next to Open / In Progress / Completed / Rejected / Deleted.", "Look at the table columns: checkbox, PR NO, Item Type, Item, PR Age, Service Code, Material, and more when you scroll right."],
   "The page opens without error. The tab counts are numbers. Every row shows a PR number (link), an Item Type badge (M or S), an item name, a PR Age number with a coloured background (green = fresh, orange = ageing, red = old), and either a Material code (for M rows) or a Service code (for S rows).", "Critical")
tc("PR", M, "Opening the PR list", "Switch between the five PR tabs", "Buyer", "Buyer portal", "PRs in different states.", "—",
   LOGIN_B + [GO_PR, "Click 'In Progress'. Then 'Completed'. Then 'Rejected'. Then 'Deleted'. Then back to 'Open'."],
   "Each tab shows only PR lines in that state and the row count matches the badge on the tab. Open = not yet sourced; In Progress = in an event or PO; Completed = fully ordered/closed; Rejected and Deleted as named. The selected tab is underlined in blue.", "High")
tc("PR", M, "Finding a given PR", "Search a PR by its number when the number is given to you", "Buyer", "Buyer portal", "PR 0110000195 exists.", "PR number 0110000195.",
   LOGIN_B + [GO_PR, "Click the 'Search' box at the top right (or press Shift+F), type 0110000195 and press Enter."],
   "Only the lines of PR 0110000195 remain in the table. Clicking the PR NO link opens that PR's detail page with its lines.", "Critical")
tc("PR", M, "Finding a given PR", "Search a PR number that does not exist", "Buyer", "Buyer portal", "—", "PR number 9999999999.",
   LOGIN_B + [GO_PR, "Search 9999999999 and press Enter."],
   "The table is empty with a 'No data' message; nothing opens; clearing the search brings the rows back.", "Medium", "Negative")
tc("PR", M, "Choosing a PR yourself", "Pick a random open material line when no PR number is given", "Buyer", "Buyer portal", "At least one open material line.", "—",
   LOGIN_B + [GO_PR, "On the Open tab, scan the Item Type column for an 'M' badge.", "Check the row's quantity: open the PR (click the PR NO) and confirm Qty Open equals Qty Requested for that line.", "Write down the PR number and the item name."],
   "A line is chosen from Open only; its quantity is fully open, so it can be used in a new event. (A line already partly used shows a smaller Qty Open and should not be chosen.)", "Critical")
tc("PR", M, "Choosing a PR yourself", "Pick a random open service line when no PR number is given", "Buyer", "Buyer portal", "At least one open service line.", "—",
   LOGIN_B + [GO_PR, "On the Open tab find a row whose badge is 'S' and whose Item cell says '1 Service' (or more).", "Click the PR NO link and expand the service: its activities (sub-rows) are listed with their rates/quantities."],
   "The line is identified as a service: it has a service code, not a material code, and activities below it. This line will create a service event (rates per activity), not a goods event.", "Critical")
tc("PR", M, "Reading a line", "Tell a material line from a service line from an asset line", "Buyer", "Buyer portal", "PRs with M, S and asset (capex) lines.", "—",
   LOGIN_B + [GO_PR, "Click a PR NO, then click 'Details' on a line.", "Read Account Assignment, Material / Service code, Asset number (if any), Cost centre, Plant."],
   "Material: Material code filled, Account Assignment blank or cost centre. Service: Service code and activities. Asset: Account Assignment 'A' and an Asset number. Nothing else differs on the screen; the type decides which event sheet will open.", "High")
tc("PR", M, "Blocked lines", "A line on hold cannot be ticked for sourcing", "Buyer", "Buyer portal", "A line with the Hold status.", "—",
   LOGIN_B + [GO_PR, "Find the line marked On Hold.", "Try to tick its checkbox and click Purchase Items."],
   "The checkbox is disabled (or Purchase Items stays disabled with the tooltip 'No open items selected'). The line cannot be sourced until it is taken off hold.", "Medium", "Negative")
tc("PR", M, "Blocked lines", "A dormant (locked) PR must be unlocked first", "Buyer", "Buyer portal", "A PR older than the dormant limit, shown with a lock icon.", "—",
   LOGIN_B + [GO_PR, "Open the locked PR.", "Click 'Unlock' (or 'Request to unlock' if you are not allowed to unlock).", "After unlocking, tick a line and click Purchase Items."],
   "Before unlocking, Purchase Items is not available. After 'Unlock' the lock icon disappears and the line can be sourced. 'Request to unlock' sends a request and shows 'Unlock request sent'.", "Medium", "Negative")
tc("PR", M, "Purchase Items", "Tick two material lines of different PRs and source them together", "Buyer", "Buyer portal", "Two open M lines in two PRs.", "—",
   LOGIN_B + [GO_PR, "Tick one M line of PR A and one M line of PR B.", "Click Purchase Items (badge shows 2).", "Choose Single Stage → RFQ, pick a template."],
   "Both lines appear as two rows of the product sheet with their own quantities and locations; both PRs will move to In Progress after publish.", "High")
tc("PR", M, "Purchase Items", "Tick a material line and a service line together", "Buyer", "Buyer portal", "One M and one S line open.", "—",
   LOGIN_B + [GO_PR, "Tick one M line and one S line.", "Click Purchase Items."],
   "The app does not let a material and a service go into one event: either Purchase Items is disabled, or a message says the line types must be the same. Write down the exact message.", "High", "Negative")
tc("PR", M, "After sourcing", "The PR line moves to In Progress after the event is published", "Buyer", "Buyer portal", "A PR line used in a published event.", "—",
   LOGIN_B + [GO_PR, "Click the In Progress tab and search the PR number.", "Open the line and read Qty Open and Qty In Progress."],
   "The line is listed under In Progress with the event's RFX number; Qty In Progress equals the quantity put in the event; Qty Open is reduced by the same amount.", "Critical")
tc("PR", M, "After sourcing", "The PR line comes back to Open when the event is withdrawn", "Buyer", "Buyer portal", "A published event made from a PR line.", "—",
   LOGIN_B + ["Open the event, click the three dots (⋮) at the top right, click 'Withdraw Project', type the reason 'QA test' and confirm.", GO_PR, "Search the PR number on the Open tab."],
   "The line is back on Open with its full quantity; the PR's history shows an entry that the event was withdrawn and the quantity reopened.", "High")

# ═════════════════════ MODULE 2: create screen — every control ═════════════════════
M = "2. Create Event screen — buttons and fields one by one"
tc("CRE", M, "Create Event pop-up", "Create Event shows Single Stage and eRFX Project", "Buyer", "Buyer portal", "Company with eRFX enabled.", "—",
   LOGIN_B + [GO_EVENTS, "Click 'Create Event'."],
   "A chooser appears with 'Single Stage — Source through RFP / RFQ / Auction' and 'eRFX Project — Manage sourcing via a project approach' (and 'BOQ project' only for BOQ companies). Clicking outside closes it.", "Critical")
tc("CRE", M, "Create Event pop-up", "Company without eRFX sees only Single Stage", "Buyer", "Buyer portal", "Company with eRFX switched off.", "—",
   LOGIN_B + [GO_EVENTS, "Click 'Create Event'."],
   "Only Single Stage is offered (or the single-stage screen opens directly). No eRFX option.", "Medium")
tc("CRE", M, "Event Type", "Switching Event Type changes the template list", "Buyer", "Buyer portal", "—", "—",
   LOGIN_B + [GO_EVENTS, "Create Event → Single Stage.", "Hover 'Select Templates' with RFP selected and note the names.", "Click 'RFQ' and hover 'Select Templates' again.", "Click 'Auction' and hover again."],
   "RFP lists questionnaire templates; RFQ lists price-sheet templates; Auction lists auction templates. The old menu never stays on screen after switching.", "High")
tc("CRE", M, "Template", "Nothing can be filled before a template is chosen", "Buyer", "Buyer portal", "—", "—",
   LOGIN_B + [GO_EVENTS, "Create Event → Single Stage → RFQ.", "Without choosing a template, try to type a product, click Participants, click Publish."],
   "There is no product sheet yet; Participants and Publish are locked with the hint 'Please choose a template and add a product'.", "High", "Negative")
tc("CRE", M, "Template", "Changing the template after filling the sheet", "Buyer", "Buyer portal", "Two RFQ templates with different columns.", "—",
   LOGIN_B + [GO_EVENTS, "Create Event → Single Stage → RFQ → template A; add a product with quantity.", "Hover 'Select Templates' and choose template B."],
   "The sheet switches to template B's columns. Record whether the product row is kept or cleared (and that no error appears).", "Medium", "Edge")
tc("CRE", M, "Product sheet", "Add a product from the catalogue", "Buyer", "Buyer portal", "RFQ template chosen.", "Product KNOB FX151-2925.",
   LOGIN_B + [GO_EVENTS, "Create Event → Single Stage → RFQ → template.", "Click the Product cell, type 'KNOB' and wait for the list.", "Click 'KNOB FX151-2925 (2810038395)'."],
   "The product name with its code fills the cell; Product Variant shows 'Default Variant'; the row's other cells become editable.", "Critical")
tc("CRE", M, "Product sheet", "Quantity accepts numbers only", "Buyer", "Buyer portal", "A product row.", "'abc', '-5', '0', '10'.",
   LOGIN_B + ["On the product row click Quantity Requested, type 'abc', press Tab.", "Type -5, Tab. Type 0, Tab. Type 10, Tab."],
   "'abc' is not accepted (cell turns red / stays empty); -5 and 0 are refused or flagged; 10 stays. Only 10 lets you publish.", "High", "Negative")
tc("CRE", M, "Product sheet", "Delivery location must be chosen from the list", "Buyer", "Buyer portal", "—", "—",
   LOGIN_B + ["Click the Delivery location cell.", "Pick a plant from the list.", "Try typing a name that is not in the list."],
   "A plant from the list is accepted and shows its code (LOC-0001). Free text is not accepted.", "High")
tc("CRE", M, "Product sheet", "Add a second row and delete the first", "Buyer", "Buyer portal", "—", "—",
   LOGIN_B + ["Click '+ Add row' (or the plus under the sheet) and add a second product.", "Hover the first row and click its bin icon."],
   "Two rows, then one. The last remaining row cannot be deleted ('At least one product is required, so the last one can't be removed.').", "Medium")
tc("CRE", M, "Product sheet", "Add Columns: Price Cap", "Buyer", "Buyer portal", "Template with the price-cap column.", "Cap 100.",
   LOGIN_B + ["Click 'Add Columns' above the sheet → tick 'Price Cap'.", "Type 100 in the new Price Cap cell. Then try 'abc'."],
   "A Price Cap column appears; 100 is kept; 'abc' is refused ('Please enter valid price cap values' on publish).", "High")
tc("CRE", M, "Product sheet", "Add Columns: Minimum Quantity and Tick Size", "Buyer", "Buyer portal", "—", "Min qty 5; tick 1%.",
   LOGIN_B + ["Add Columns → tick 'Minimum Quantity' and 'Tick Size'.", "Fill 5 and 1%."],
   "Both columns appear and keep the values; they are enforced on the vendor's bid (see module 8).", "Medium")
tc("CRE", M, "Product sheet", "Upload Sheet with a good and a bad row", "Buyer", "Buyer portal", "—", "Filled template: 2 good rows, 1 row with product code 'XXX'.",
   LOGIN_B + ["Click 'Upload Sheet' → 'Download template'. Fill it as in Test Data. Click 'Upload' and choose the file."],
   "The two good rows are added to the sheet; a message names the bad row and its problem; nothing else is lost.", "Medium", "Edge")
tc("CRE", M, "Title", "Auto title fills from the product and location", "Buyer", "Buyer portal", "Auto-title enabled.", "—",
   LOGIN_B + ["Leave the Title box empty. Add product KNOB FX151-2925 with location Plant Name."],
   "Title reads 'KNOB FX151-2925 - Plant Name'. Adding a second product changes it to '<first product> & more'.", "High")
tc("CRE", M, "Title", "A typed title stays even when products change", "Buyer", "Buyer portal", "—", "'QA_Platform knobs'.",
   LOGIN_B + ["Type the title first. Then add/change products."],
   "The title never changes by itself after you typed it.", "High")
tc("CRE", M, "Title", "Empty title blocks publish when auto title is off", "Buyer", "Buyer portal", "Auto-title off.", "—",
   LOGIN_B + ["Fill everything except the title. Click Publish Event."],
   "Red message 'Please enter title.' and the page stays.", "High", "Negative")
tc("CRE", M, "Attachments", "Attach two documents to the event", "Buyer", "Buyer portal", "—", "Technical Specification Sheet.pdf, Bidding Sheet Template.xlsx.",
   LOGIN_B + ["Click 'Attachments' (paper-clip) and upload both files.", "Publish; open the Project Details tab."],
   "Both show under 'Quotation Templates (2)' with a Download link each; downloads open the same files.", "Medium")
tc("CRE", M, "Save as draft", "Save as draft and reopen from Drafts", "Buyer", "Buyer portal", "—", "—",
   LOGIN_B + ["Fill title, template and one product. Click 'Save as draft'.", GO_EVENTS, "Click the Drafts tab and open the draft."],
   "The draft is listed with its title and 'Draft' badge; opening it shows the same template, product, participants and T&C.", "High")
tc("CRE", M, "Cancel", "Leave the screen without saving", "Buyer", "Buyer portal", "—", "—",
   LOGIN_B + ["Fill a product, then click the browser Back button / the Events menu."],
   "No event or draft is created (Drafts tab unchanged). Note whether an 'unsaved changes' warning appears (today none is expected).", "Low", "Edge")
tc("CRE", M, "Savings", "Set savings on Budget and see it on the project", "Buyer", "Buyer portal", "—", "Budget ₹120/unit.",
   LOGIN_B + ["Click 'Savings' in the footer. Choose 'Line Item', tab 'Budget', enter 120 against the product. Save.", "Publish; after a bid of 90 open the Overview."],
   "Savings card shows (120 − 90) × 10 = 300 and 25 %.", "Medium")

# ═════════════════════ MODULE 3: end-to-end create & publish — ALL combinations ═════════════════════
M = "3. Create and publish an event — every combination"
TEMPL = {"single-stage RFQ": "RFQ template 'Standard RFQ'", "single-stage Auction": "auction template 'Standard Auction' (Rank based)", "single-stage RFP": "RFP questionnaire 'Technical Evaluation' + evaluator 'QA Evaluator'", "eRFX RFQ": "RFQ template 'Standard RFQ'", "eRFX Technical + RFQ": "questionnaire 'Technical Evaluation', assessment template 'Vendor Assessment', evaluator 'QA Evaluator', RFQ template 'Standard RFQ'"}
for entry, ev, title, tnc, vend, sch in itertools.product(["direct", "material PR", "service PR"],
        ["single-stage RFQ", "single-stage Auction", "single-stage RFP", "eRFX RFQ", "eRFX Technical + RFQ"],
        ["auto", "typed"], ["none", "optional", "mandatory"], ["mapped", "named", "both"], ["now 30 min", "now custom 2 h + evaluation", "later (tomorrow 11:00)"]):
    if entry == "service PR" and ev == "single-stage Auction":  # services are quoted by rate; keep auction for goods
        continue
    multi = ev == "eRFX Technical + RFQ"
    steps = LOGIN_B + entry_steps(entry) + type_steps(ev) + product_steps(ev, entry) + title_steps(title) + tnc_steps(tnc) + vendor_steps(vend) + schedule_steps(sch, multi) + PUBLISH
    live = "Upcoming (with the start time shown)" if sch.startswith("later") else "Live"
    exp = (LAND.replace("a green 'Live' badge", f"a '{live}' badge") +
           f" Terms & Conditions on Project Details: {'none' if tnc=='none' else '1 clause' + (' + 1 attachment, marked mandatory' if tnc=='mandatory' else '')}. "
           f"Participants: {'all vendors mapped to the product' if vend=='mapped' else 'the one QA vendor' if vend=='named' else 'the mapped vendors plus the QA vendor'}. "
           + ("The PR line now shows under In Progress with this RFX number. " if entry != "direct" else "")
           + ("Technical and RFQ both appear under Published Stages with the Technical end before the RFQ end. " if multi else "")
           + ("The RFP shows the questionnaire and the evaluator, no price sheet. " if ev == "single-stage RFP" else ""))
    tc("CRE-ALL", M, f"{ev} · from {entry}", f"Create and publish a {ev} from {entry}, {title} title, T&C {tnc}, vendors {vend}, schedule {sch}", "Buyer", "Buyer portal",
       f"Buyer logged in; {TEMPL[ev]} exists; {'an open ' + entry.split()[0] + ' PR line' if entry != 'direct' else 'product KNOB FX151-2925 in the catalogue'}; QA vendor onboarded{'; auto title enabled' if title=='auto' else ''}.",
       f"Entry: {entry}. Type: {ev}. Templates: {TEMPL[ev]}. Title: {'auto' if title=='auto' else 'QA_Platform ' + ev + ' ' + sch}. Product: KNOB FX151-2925, 10 ST, Plant Name (LOC-0001). T&C: {tnc}. Vendors: {vend} (QA_Platform vendor). Schedule: {sch}.",
       steps, exp, "Critical" if (tnc != "none" and vend == "named") else "High")

# ═════════════════════ MODULE 4: T&C on both sides — combinations ═════════════════════
M = "4. Terms & Conditions — what the vendor must accept"
for tnc, attach, side in itertools.product(["switch OFF (all optional)", "switch ON (all mandatory)", "one clause marked mandatory, switch OFF"], ["no attachment", "with attachment"], ["accepts nothing", "accepts one clause", "accepts everything"]):
    blocked = (tnc.startswith("switch ON") and side != "accepts everything") or (tnc.startswith("one clause") and side == "accepts nothing")
    tc("TNC", M, tnc, f"T&C {tnc}, {attach}; vendor {side}", "Buyer, Vendor", "Buyer + Vendor portal",
       "A live RFQ with 2 clauses" + (" and 1 attachment" if attach == "with attachment" else "") + " set up as in the scenario; QA vendor invited.",
       f"Clauses: 'Delivery within 15 days', 'Payment 30 days'. {attach}. Mode: {tnc}. Vendor action: {side}.",
       LOGIN_B + ["Create a single-stage RFQ (template, product, QA vendor, schedule Start now 30 min).", "Click 'Terms & Conditions' in the footer; add the two clauses" + (" and upload GTC.pdf" if attach == "with attachment" else "") + f"; set the mode: {tnc}. Close and Publish."]
       + LOGIN_V + ["Open the event from the Live list. Scroll to the Terms & Conditions block: read the clauses" + (" and the attachment link" if attach == "with attachment" else "") + " and the Accept checkboxes.",
                    "Enter price 100 in the price sheet.", f"T&C: {side} (tick the matching checkboxes).", "Click 'Submit' and confirm."],
       ("Submit is blocked: the unaccepted mandatory item(s) are highlighted and a message says the terms must be accepted; nothing reaches the buyer. Accepting the remaining item(s) then lets Submit go through." if blocked else
        "The bid is submitted ('Bid submitted', revision 1). On the buyer's Responses tab the bid shows which clauses were accepted; unaccepted optional clauses are shown as not accepted but do not block anything."),
       "Critical" if blocked else "High", "Negative" if blocked else "Positive")

# ═════════════════════ MODULE 5: project page, ⋮ menu, withdraw — states × actions ═════════════════════
M = "5. Project page, three-dots menu and Withdraw"
tc("PRJ", M, "Project page", "Read the Project Details tab", "Buyer", "Buyer portal", "Live project RFX-3123.", "—",
   LOGIN_B + [GO_EVENTS, "Open the Live tab and click the event 'vc' (RFX-3123).", "Read the sections Overview, Published Stages, Quotation Templates, Terms & Conditions."],
   "Overview: Project ID #RFX-3123 and Created at date/time. Published Stages: Stage Code RFQ-2532, Stage Title with an open-in-new-tab icon, Pending Actions, Participants 0/31, Bidding Starts At and Ends At. Quotation Templates lists the files with Download. Terms & Conditions lists the clauses numbered.", "Critical")
tc("PRJ", M, "Project page", "Open the stage tab and its sub-tabs", "Buyer", "Buyer portal", "Live project.", "—",
   LOGIN_B + ["Open the project; click the stage tab (named like the stage, e.g. 'vc').", "Click each sub-tab: Responses, Overview, Participants, Analytics, Price Trends, Participant Remarks."],
   "Each sub-tab opens. Responses shows the bids table (empty before bids). Participants lists invited vendors with 'Add Bid' and 'Add Price Cap'. The top right shows the countdown, a green Live pill and the 'Settings' gear.", "High")
tc("PRJ", M, "⋮ menu", "The three-dots menu on a live project", "Buyer", "Buyer portal", "Live project.", "—",
   LOGIN_B + ["Open the project. Click the ⋮ button at the top right next to 'Messages'."],
   "A small menu opens with 'Send Reminders' (bell icon) and 'Withdraw Project' (no-entry icon). Clicking elsewhere closes it.", "High")
STATES = ["draft", "upcoming (starts tomorrow)", "live with no bids", "live with 2 bids", "closed, in evaluation", "awarded (approval done)", "PO already created"]
for st in STATES:
    for act in ["withdraw and confirm", "withdraw then cancel in the pop-up"]:
        offered = st in ("draft", "upcoming (starts tomorrow)", "live with no bids", "live with 2 bids", "closed, in evaluation")
        tc("WDR", M, f"Withdraw — {st}", f"{act.capitalize()} on a project that is {st}", "Buyer, Vendor", "Buyer + Vendor portal",
           f"A project that is {st}; QA vendor invited.", "Reason: 'QA test withdrawal'.",
           LOGIN_B + [f"Open the project that is {st}.", "Click ⋮ at the top right.",
                      "Click 'Withdraw Project'. A pop-up asks for a reason." if offered else "Look for 'Withdraw Project' in the menu.",
                      ("Type the reason and click Confirm." if act.startswith("withdraw and") else "Click Cancel in the pop-up.") if offered else "If it is there, click it and read the message."]
           + (LOGIN_V + ["Open the event in the vendor portal."] if offered and act.startswith("withdraw and") else []),
           (("The project shows a grey 'Withdrawn' badge; the countdown stops; under Events it is now in History with Withdrawn; the vendor sees Withdrawn and has no Submit. " + ("Existing bids stay visible read-only. " if "2 bids" in st else "") + "PR lines (if any) go back to Open.") if act.startswith("withdraw and") else "Nothing changes: the project stays " + st + " and the menu closes.")
           if offered else "Withdraw Project is not offered (or is refused with a message saying the project cannot be withdrawn in this state). The award / PO stays untouched.",
           "Critical" if offered and act.startswith("withdraw and") else "Medium", "Negative" if not offered else "Positive")
tc("PRJ", M, "Send Reminders", "Send reminders to the vendors who have not bid", "Buyer, Vendor", "Buyer + Vendor portal", "Live RFQ with 3 QA vendors, 1 has bid.", "—",
   LOGIN_B + ["Open the project → ⋮ → 'Send Reminders'. A drawer lists the vendors pending. Tick all and click Send."],
   "Only the 2 vendors without a bid are listed and mailed ('Reminder: submit your quote…' in the QA mailboxes); the vendor who already bid gets nothing. On a draft the menu item is not offered.", "Medium")

# ═════════════════════ MODULE 6: Settings menu — every item, every state ═════════════════════
M = "6. Settings (gear) — Recreate Order, Extend, Reschedule, Rejected Bids, Order Activity, Evaluation time"
tc("SET", M, "Settings menu", "What the gear menu offers on each state", "Buyer", "Buyer portal", "Events in each state.", "—",
   LOGIN_B + ["Open a draft, an upcoming, a live, a closed-in-evaluation, an awarded and a withdrawn event. On each click the stage tab, then the 'Settings' gear at the top right and write down the items."],
   "Upcoming: Reschedule Event, Withdraw, Order Activity… Live: Extend Submission Time, Withdraw, Rejected Bids, Order Activity, Convert to Auction (only on an RFQ). Closed: Edit Evaluation Time, Recreate Order, Rejected Bids, Order Activity. Awarded/withdrawn: Recreate Order, Order Activity. Record the exact lists — any item shown in a state where it cannot work is a defect.", "High")
# Recreate Order — all control combinations
ENDP = ["15 Mins", "30 Mins (default)", "60 Mins", "4 Hrs", "24 Hrs", "Custom 90 minutes"]
EVALP = ["15 Mins", "30 Mins (default)", "45 Mins", "60 Mins", "Custom 20 minutes", "Clear (no evaluation)"]
for endp, evalp, schedule, delivery in itertools.product(ENDP, EVALP, ["create now", "schedule tomorrow 11:00", "schedule in the past (yesterday)"], ["delivery date empty", "delivery date next month"]):
    past = schedule.startswith("schedule in the past")
    steps = LOGIN_B + ["Open a closed (or withdrawn) event, click its stage tab, click the 'Settings' gear at the top right and click 'Recreate Order'. The 'Recreate Order' pop-up opens.",
                       "Check the Product Sheet at the top: the product, variant, quantity and delivery location are pre-filled from the old event (scroll right to see Price).",
                       f"Under 'Event End Time Duration' click '{endp.split(' (')[0]}'" + (" and type 90 in the box that appears." if endp.startswith("Custom") else "."),
                       f"Under 'Evaluation Duration' click '{evalp.split(' (')[0]}'" + (" and type 20." if evalp.startswith("Custom") else "." if not evalp.startswith("Clear") else " — the selection is removed."),
                       "Leave Delivery Date empty." if delivery == "delivery date empty" else "Click the Delivery Date box and pick a date next month.",
                       "Leave 'Schedule this event?' unticked." if schedule == "create now" else ("Tick 'Schedule this event?', pick tomorrow in 'Select date' and 11:00 in 'Select time'." if not past else "Tick 'Schedule this event?' and pick yesterday's date and 11:00."),
                       "Click the blue 'Create Order' button at the bottom right."]
    endmin = {"15 Mins": 15, "30 Mins (default)": 30, "60 Mins": 60, "4 Hrs": 240, "24 Hrs": 1440, "Custom 90 minutes": 90}[endp]
    if past:
        exp = "A red message 'Invalid scheduled time!' (or 'Scheduled time is invalid!') appears, the pop-up stays open and no new event is created (Events list unchanged)."
    else:
        exp = (f"A new event is created and opens: a new RFX / stage code, the same product and quantity, status {'Upcoming with start tomorrow 11:00' if schedule.startswith('schedule tomorrow') else 'Live, started now'}, "
               f"bidding end = start + {endmin} minutes (read it under Published Stages), evaluation {'none — the event closes straight after bidding' if evalp.startswith('Clear') else evalp.split(' (')[0].replace('Custom 20 minutes','20 minutes') + ' after the end'}, "
               f"delivery date {'blank' if delivery == 'delivery date empty' else 'shown on the line as chosen'}. The original event is unchanged. Note whether the old participants were copied (record).")
    tc("RCO", M, "Recreate Order", f"Recreate Order with end {endp}, evaluation {evalp}, {schedule}, {delivery}", "Buyer", "Buyer portal",
       "A closed or withdrawn event with one product line (e.g. RFX-3123).", f"End: {endp}; Evaluation: {evalp}; {schedule}; {delivery}.",
       steps, exp, "Critical" if (endp.startswith("30") and evalp.startswith("30") and schedule == "create now") else ("High" if past else "Medium"), "Negative" if past else "Positive")
tc("RCO", M, "Recreate Order", "Edit the quantity in the pop-up before creating", "Buyer", "Buyer portal", "Closed event, qty 10.", "New qty 25.",
   LOGIN_B + ["Settings → Recreate Order.", "Click the Quantity Requested cell in the pop-up's sheet, change 10 to 25, press Tab.", "Click Create Order."],
   "The new event's line shows 25; the old event still shows 10.", "High")
tc("RCO", M, "Recreate Order", "A required cell left empty blocks Create Order", "Buyer", "Buyer portal", "—", "—",
   LOGIN_B + ["Settings → Recreate Order.", "Clear the Delivery location cell.", "Click Create Order."],
   "A message points at the empty required cell; no event is created.", "High", "Negative")
tc("RCO", M, "Recreate Order", "'Edit More Details' opens the full create screen", "Buyer", "Buyer portal", "—", "—",
   LOGIN_B + ["Settings → Recreate Order → click 'Edit More Details' (pencil, bottom left)."],
   "The full create screen opens pre-filled (template, product, T&C); you can change participants, savings and schedule and then Publish as usual.", "High")
tc("RCO", M, "Recreate Order", "Cancel and the X close without creating", "Buyer", "Buyer portal", "—", "—",
   LOGIN_B + ["Settings → Recreate Order → change the end preset → click Cancel.", "Open it again → click the X at the top right."],
   "Both close the pop-up; the Events list has no new event.", "Low")
# Extend Submission Time — state × value
for st in ["live, 5 minutes left", "live, 2 hours left", "closed 2 minutes ago (evaluation running)", "upcoming"]:
    for val in ["10 minutes after the current end", "equal to the current end", "earlier than the current end", "a time already in the past"]:
        ok = st.startswith("live") and val.startswith("10 minutes")
        tc("EXT", M, f"Extend — {st}", f"Extend Submission Time to {val} on an event that is {st}", "Buyer, Vendor", "Buyer + Vendor portal",
           f"An RFQ that is {st}; QA vendor invited.", f"New end: {val}.",
           LOGIN_B + [f"Open the event that is {st}, click the stage tab, click the 'Settings' gear.",
                      "Click 'Extend Submission Time' (if it is in the menu). A pop-up shows the current end date and time.",
                      f"Set the new end time to {val} and click Save."] + (LOGIN_V + ["Open the event and read the countdown."] if ok else []),
           ("The pop-up closes; 'Bidding Ends At' under Published Stages shows the new time; the vendor's countdown shows the extra 10 minutes and the vendor can still submit until then. Order Activity logs the extension." if ok else
            ("Extend Submission Time is not offered on an upcoming event (use Reschedule instead)." if st == "upcoming" else
             ("A red message says the new time must be later than the current end / now; the end time does not change." if st.startswith("live") else
              "Either the menu item is not offered on a closed round, or the save is refused — record which; the bids and their stored end time are unchanged."))),
           "Critical" if ok else "High", "Positive" if ok else "Negative")
# Reschedule — upcoming only
for st in ["upcoming", "live", "closed"]:
    tc("RSC", M, "Reschedule", f"Reschedule Event on a {st} event", "Buyer", "Buyer portal", f"An event that is {st}.", "New start: +2 hours; delivery date +7 days.",
       LOGIN_B + [f"Open the {st} event → stage tab → Settings gear.", "Click 'Reschedule Event' if present. In the pop-up click the start date box, type the new date in the calendar's own input, pick the time (5-minute steps), set the delivery date, click 'Ok' (do not press Escape — it closes the dialog)."],
       ("The pop-up closes; Published Stages shows the new start and the end moved by the same amount (round length kept); the badge stays Upcoming. The shown time may differ by the server time offset by a minute (known issue)." if st == "upcoming" else "Reschedule Event is not in the menu (a started or finished round cannot be rescheduled)."),
       "High", "Positive" if st == "upcoming" else "Negative")
# Rejected bids — combinations
for rebid in ["re-bidding allowed", "re-bidding NOT allowed"]:
    for state in ["while bidding is live", "after bidding closed"]:
        for after in ["vendor tries to bid again", "buyer restores the bid"]:
            tc("RJB", M, f"Reject bid — {rebid}", f"Reject a bid {state} with {rebid}, then {after}", "Buyer, Vendor", "Buyer + Vendor portal",
               f"An RFQ {state} with a submitted bid from the QA vendor.", "Reason: 'Price not acceptable'.",
               LOGIN_B + [f"Open the event ({state}) → stage tab → Responses.", "On the vendor's bid row click 'Reject'. A pop-up asks for a reason and whether to allow re-bidding.",
                          "First click Reject with the reason empty.", f"Type the reason, choose '{rebid}', click Reject.",
                          "Open Settings → 'Rejected Bids' and read the list."]
               + (LOGIN_V + ["Open the event; read the status; click Edit/Submit bid and try to send a new price."] if after.startswith("vendor") else ["Back in Rejected Bids click 'Restore' (set active) on the bid."]),
               "Empty reason: 'Please add a reason for rejecting this bid'. With a reason: the bid shows Rejected with the reason in Responses and in Settings → Rejected Bids (vendor, time, reason, re-bid flag); the vendor sees 'Rejected' with the reason. "
               + ("Vendor bidding again: " + ("accepted as a new bid while live; refused after close." if rebid == "re-bidding allowed" else "refused — the vendor is blocked for this round.") if after.startswith("vendor") else
                  "Restore: " + ("the bid is active again and counted in Master QCS." if state.startswith("while") else "refused after close (record the message).")),
               "High", "Negative" if (after.startswith("vendor") and rebid.endswith("NOT allowed")) else "Positive")
tc("SET", M, "Order Activity", "Read the whole history of an event in Order Activity", "Buyer", "Buyer portal", "An event that was created, published, extended, had a bid rejected and a counter offer.", "—",
   LOGIN_B + ["Open the event → stage tab → Settings → 'Order Activity'."],
   "A list in time order: created, published, vendor invited, submission time extended, bid rejected (with reason), counter offer sent/answered, awarded, PO created — each with who did it and when. Nothing you did is missing.", "High")
for when in ["during evaluation, move the end 30 minutes later", "during evaluation, move the end to before now", "after the award proposal was sent"]:
    tc("EVL", M, "Edit Evaluation Time", f"Edit Evaluation Time — {when}", "Buyer", "Buyer portal", "A closed RFQ with a 30-minute evaluation window.", when,
       LOGIN_B + ["Open the closed event → stage tab → Settings → 'Edit Evaluation Time'.", f"{when.split(', ')[-1].capitalize()} and click Save."],
       ("The evaluation end moves; counter offers and Start Awarding stay available until the new end." if when.endswith("later") else
        ("Refused with a message that the time must be in the future; nothing changes." if "before now" in when else "The item is not offered (or refused) once an award proposal exists.")),
       "High", "Positive" if when.endswith("later") else "Negative")
tc("SET", M, "Convert to Auction", "Convert a closed RFQ into an auction stage", "Buyer, Vendor", "Buyer + Vendor portal", "A closed RFQ with 2 bids (100 and 90).", "Strategy Rank based, 30 minutes.",
   LOGIN_B + ["Open the RFQ → stage tab → Settings → 'Convert to Auction' → read the pop-over → click Continue.", "A new tab opens on the create screen with the lines and vendors carried; pick the strategy and schedule; Publish."] + LOGIN_V + ["Open the new auction stage."],
   "The project now has an Auction stage; each vendor's starting bid equals its RFQ price (labelled 'RFQ final bid'); the RFQ stage is read-only; the vendor can lower its price in the auction.", "High")

# ═════════════════════ MODULE 7: vendor side — opening and submitting ═════════════════════
M = "7. Vendor portal — opening the event and submitting a bid"
tc("VND", M, "Opening", "The invited vendor finds the event in its Live list", "Vendor", "Vendor portal", "Live RFQ, QA vendor invited.", "—",
   LOGIN_V + ["Look at the Live list; find the event by title / RFX id; click it."],
   "The event page opens: title, countdown, Terms & Conditions block, Quotation Templates with Download, the product sheet with the buyer's quantity and location and an editable Price column, and a 'Submit' button.", "Critical")
tc("VND", M, "Opening", "A vendor that was not invited cannot see the event", "Vendor", "Vendor portal", "Vendor B not invited.", "—",
   ["Log in as vendor B.", "Search the event title; paste the event URL in the address bar."],
   "Not in the list; the URL shows 'not authorized' / redirects to the list. No bid is possible.", "High", "Negative")
tc("VND", M, "Before start", "Upcoming event: the vendor can see but not submit", "Vendor", "Vendor portal", "Event starting tomorrow.", "—",
   LOGIN_V + ["Open the upcoming event; try to type a price and click Submit."],
   "The sheet is read-only or Submit is disabled with 'Bidding starts at <time>'.", "High", "Negative")
tc("VND", M, "Submit", "Submit a complete bid and see it on the buyer side", "Buyer, Vendor", "Buyer + Vendor portal", "Live RFQ, qty 10.", "Price 100, GST 18%.",
   LOGIN_V + ["Click the Price cell, type 100, press Tab; fill any other required vendor cells (GST 18).", "Read the line total (1,000) and the Total Amount (1,180).", "Click Submit; in the confirmation pop-up click Confirm."]
   + LOGIN_B + ["Open the event → stage tab → Responses."],
   "Vendor: green 'Bid submitted' with revision 1 and time; the Submit button becomes 'Edit bid'. Buyer: a row for the vendor with 100, total 1,180, time; Participation shows 1/N; Master QCS shows the vendor column.", "Critical")
for col, val in [("price cap 100", "101"), ("price cap 100", "100"), ("minimum quantity 5", "quantity 4"), ("minimum quantity 5", "quantity 5"), ("no columns", "price empty"), ("no columns", "price -1")]:
    ok = val in ("100", "quantity 5")
    tc("VND", M, f"Sheet rules — {col}", f"Submit with {val} when the sheet has {col}", "Vendor", "Vendor portal", f"Live RFQ with {col}.", f"Value entered: {val}.",
       LOGIN_V + ["Open the event.", f"Enter {val} in the sheet and press Tab.", "Click Submit and confirm."],
       ("Accepted: 'Bid submitted'." if ok else ("Red message 'Net Price should be less than ₹100/unit'; the bid is not sent." if val == "101" else ("Refused: the quantity is below the minimum; not sent." if val == "quantity 4" else "Refused: the Price cell is highlighted as required / invalid; nothing is sent."))),
       "High", "Positive" if ok else "Negative")
tc("VND", M, "Draft", "Save a draft and submit it later", "Buyer, Vendor", "Buyer + Vendor portal", "Live RFQ.", "Price 100.",
   LOGIN_V + ["Enter 100; click 'Save as draft'; log out; log in again; open the event; click Submit; confirm."] + LOGIN_B + ["Responses (before and after the vendor's Submit)."],
   "While draft: the buyer sees nothing for this vendor (and cannot reject a draft). After Submit: the bid appears with revision 1.", "Medium")
tc("VND", M, "After end", "Submitting after the end time is refused", "Vendor", "Vendor portal", "RFQ that ended (and extra closing time passed).", "—",
   LOGIN_V + ["Open the closed event; try to type a price and Submit."],
   "The sheet is read-only; Submit is gone or refused; status 'Closed'.", "High", "Negative")
tc("VND", M, "Attachment", "Attach a file with the bid", "Buyer, Vendor", "Buyer + Vendor portal", "Template with a vendor attachment column.", "quote.pdf.",
   LOGIN_V + ["Click the attachment cell → Upload → choose quote.pdf. Submit."] + LOGIN_B + ["Responses → open the vendor's bid → click the attachment."],
   "The file opens/downloads on the buyer side exactly as uploaded.", "Medium")
tc("VND", M, "Service", "Quote a service event — a rate per activity", "Buyer, Vendor", "Buyer + Vendor portal", "Service event with 2 services × 3 activities.", "Rates 500/700/900 and 300/400/500.",
   LOGIN_V + ["Open the event; expand each service; enter a rate in every activity row; leave one empty and Submit; then fill it and Submit."] + LOGIN_B + ["Responses."],
   "With an empty activity Submit is refused (cell highlighted). With all rates the bid is accepted; the buyer sees the total = Σ rate × activity quantity.", "High")

# ═════════════════════ MODULE 8: revising — every event type × every move ═════════════════════
M = "8. Vendor portal — revising, reverting and revoking a bid"
MOVES = [("lower the price by 10", True, True, False), ("raise the price by 10", True, False, True), ("lower the price by less than one tick (by 0.5 with tick 1)", True, False, False), ("keep the same price and submit again", True, False, False)]
for ev in ["RFQ", "reverse auction (buyer buying; tick 1)", "forward auction (buyer selling; tick 1)"]:
    for move, rfq_ok, rev_ok, fwd_ok in MOVES:
        ok = rfq_ok if ev == "RFQ" else (rev_ok if ev.startswith("reverse") else fwd_ok)
        if ev == "RFQ" and "tick" in move: continue
        if ev == "RFQ" and move.startswith("keep"): ok = False
        tc("REV", M, f"Revise on {ev}", f"On a {ev}, {move}", "Buyer, Vendor", "Buyer + Vendor portal", f"Live {ev}; the QA vendor has a submitted bid of 100.", f"Move: {move}.",
           LOGIN_V + ["Open the event; click 'Edit bid'.", f"Change the price: {move}.", "Click Submit and confirm."] + LOGIN_B + ["Responses → open the revision history; Master QCS."],
           ("Accepted as revision 2 with the new price; the buyer's history lists revision 1 and 2 with times; Master QCS shows the new price and recomputes the rank." if ok else
            ("Refused: an RFQ accepts a changed price only (same price = no new revision) — record the message." if ev == "RFQ" else
             ("Refused with a message that the price must be lower than your last bid by at least one tick (reverse auction)." if ev.startswith("reverse") else "Refused: in a forward auction the price must be higher than your last bid by at least one tick."))),
           "Critical" if ok else "High", "Positive" if ok else "Negative")
for ev in ["RFQ", "reverse auction"]:
    for timing in ["while bidding is live", "after bidding closed"]:
        for allowed in ["revoke allowed on the round", "revoke not allowed"]:
            ok = timing.startswith("while") and allowed.startswith("revoke allowed")
            tc("RVK", M, f"Revoke on {ev}", f"Revoke a bid on a {ev} {timing}, {allowed}", "Buyer, Vendor", "Buyer + Vendor portal", f"A {ev} {timing} with the QA vendor's bid; {allowed}.", "—",
               LOGIN_V + ["Open the event; open your submitted bid; look for 'Revoke'.", "If present click it and confirm."] + LOGIN_B + ["Responses and Master QCS."],
               ("The bid shows 'Revoked' for the vendor; on the buyer side it leaves the comparison and cannot be awarded; Order Activity logs it; the revoked bid cannot be edited again." if ok else
                ("No Revoke button (and a forced attempt is refused) because revoking is not allowed on this round." if allowed.endswith("not allowed") else "No Revoke after the round closed; the bid stays.")),
               "High", "Positive" if ok else "Negative")
tc("RVK", M, "Revert", "Revert to the previous revision", "Buyer, Vendor", "Buyer + Vendor portal", "RFQ live; revisions 100 then 90.", "—",
   LOGIN_V + ["Open the bid → 'Revision history' → on revision 1 click 'Revert' → confirm."] + LOGIN_B + ["Responses."],
   "The current price is 100 again as revision 3; all three revisions stay in the history; Master QCS uses 100.", "Medium")
tc("RVK", M, "Buyer cannot revoke", "The buyer has no Revoke on a vendor's bid", "Buyer", "Buyer portal", "Live RFQ with a bid.", "—",
   LOGIN_B + ["Responses → open the bid → look at the actions."],
   "Only Reject and Counter Offer are offered; no Revoke.", "Medium", "Negative")

# ═════════════════════ MODULE 9: surrogate bids ═════════════════════
M = "9. Buyer portal — surrogate bid (Add Bid for a vendor)"
for state in ["live RFQ", "live auction", "draft (not published)", "closed RFQ"]:
    for tpl in ["template allows surrogate", "template forbids surrogate"]:
        ok = state.startswith("live") and tpl.endswith("allows surrogate")
        tc("SUR", M, f"Add Bid — {state}", f"Add Bid for a vendor on a {state} when the {tpl}", "Buyer, Vendor", "Buyer + Vendor portal", f"A {state}; {tpl}; QA vendor invited with no bid.", "Price 95.",
           LOGIN_B + [f"Open the {state} → stage tab → Participants.", "Find the QA vendor's row; look for 'Add Bid'.", "If present click it: a drawer with the vendor's sheet opens; note Submit is disabled; type 95 in Price; click Submit."]
           + (LOGIN_V + ["Open the event."] if ok else []),
           ("The drawer closes; Responses shows a bid of 95 for the vendor marked as placed by the buyer (surrogate); Master QCS counts it; the vendor sees it as its own bid (record whether the vendor can revise it)." if ok else
            ("No 'Add Bid' button (the template forbids surrogate bids)." if tpl.endswith("forbids surrogate") else ("'Bid & Price Cap can be added after event creation.' — not available on a draft." if state.startswith("draft") else "Not offered after the round closed."))),
           "Critical" if ok else "High", "Positive" if ok else "Negative")
tc("SUR", M, "Approval", "Surrogate bid that needs approval", "Buyer", "Buyer portal", "Company with surrogate-bid approval.", "—",
   LOGIN_B + ["Participants → Add Bid → 95 → Submit.", "Open the approvals screen; approve with a remark."],
   "Before approval the bid is 'Pending approval' and not counted; after approval it is active in Master QCS; rejecting the approval removes it.", "Medium")
tc("SUR", M, "Price cap per vendor", "Add a price cap for one vendor only", "Buyer, Vendor", "Buyer + Vendor portal", "Live RFQ with 2 QA vendors.", "Cap 100 on vendor A.",
   LOGIN_B + ["Participants → vendor A → 'Add Price Cap' → 100 → Save ('Price Cap added successfully!')."] + LOGIN_V + ["As vendor A submit 101 then 100; as vendor B submit 101."],
   "A: 101 refused, 100 accepted. B: 101 accepted (no cap). Neither vendor sees the other's cap.", "High")

# ═════════════════════ MODULE 10: negotiation — counter offer × answers × next step ═════════════════════
M = "10. Negotiation — counter offers and reject quote, every combination"
for when in ["while bidding is live", "during the evaluation window", "after the evaluation window ended"]:
    for answer in ["vendor accepts", "vendor rejects", "vendor counters back with 95", "vendor does nothing"]:
        for nxt in ["buyer awards", "buyer sends a second counter offer", "buyer rejects the quote"]:
            tc("NEG", M, f"Counter offer {when}", f"Counter offer sent {when}; {answer}; then {nxt}", "Buyer, Vendor", "Buyer + Vendor portal",
               f"An RFQ {when} with the QA vendor's bid of 100 on 10 units.", "Counter: 90. Vendor counter-back: 95.",
               LOGIN_B + [f"Open the RFQ ({when}) → stage tab → Responses → the vendor's row → 'Counter Offer'.", "Tick the line, change Price to 90, click 'Send'."]
               + LOGIN_V + ["Open the event: a 'Counter offer received' banner shows 90 with Accept / Reject / Counter.", f"{answer.capitalize()}" + (" — enter 95 and send." if "counters" in answer else ".")]
               + LOGIN_B + ["Responses: read the counter-offer status.", f"{nxt.capitalize()}: " + ("Master QCS → Start Awarding → award the line → Submit." if nxt == "buyer awards" else ("Counter Offer again → 92 → Send." if "second" in nxt else "Reject Quote → reason → confirm."))],
               (("While the counter offer is pending the vendor cannot edit its own bid. " if when.startswith("while") else "") +
                ("Accepted: Final Negotiated Rate 90 in Master QCS; " if answer == "vendor accepts" else "Rejected: the original 100 stands with status 'Counter offer rejected'; " if answer == "vendor rejects" else "Counter-back 95 shows on the buyer side waiting for the buyer; " if "counters" in answer else "Still 'Counter offer sent' with the original 100 in the comparison; ") +
                ("awarding uses " + ("90" if answer == "vendor accepts" else "the current accepted price (100, or 95 once the buyer accepts the counter-back)") + " and the awarded amount equals quantity × that price." if nxt == "buyer awards" else
                 ("a second counter offer is sent and the chain is listed in order on both sides." if "second" in nxt else "the quote is marked Rejected with the reason, leaves the ranking and cannot be awarded; the vendor sees it.")) +
                (" After the evaluation window: the counter offer can no longer be accepted by the vendor (record whether the buyer is stopped from sending it, or the vendor from answering)." if when.startswith("after") else "")),
               "Critical" if (when.startswith("during") and answer == "vendor accepts" and nxt == "buyer awards") else "High",
               "Negative" if when.startswith("after") else "Positive")
tc("NEG", M, "Counter offer rules", "Send with nothing ticked / nothing changed", "Buyer", "Buyer portal", "RFQ in evaluation with a bid.", "—",
   LOGIN_B + ["Responses → Counter Offer → click Send without ticking a line.", "Tick the line, change nothing, click Send."],
   "'Please select atleast one product to send counter offer' then 'You must change atleast one column to send counter offer'. Nothing is sent.", "High", "Negative")
tc("NEG", M, "Counter offer rules", "No counter offer on an auction bid", "Buyer", "Buyer portal", "Auction with bids.", "—",
   LOGIN_B + ["Responses on the auction stage → open a bid."],
   "No 'Counter Offer' action; only RFQ (normal) bids can be countered.", "High", "Negative")
tc("NEG", M, "Counter offer rules", "Double-click on Send", "Buyer", "Buyer portal", "RFQ in evaluation.", "—",
   LOGIN_B + ["Counter Offer → tick, change price → click Send twice very quickly.", "Read the vendor's counter-offer list."],
   "Exactly one counter offer exists. (Two is a known defect — record.)", "Medium", "Edge")

# ═════════════════════ MODULE 11: Master QCS ═════════════════════
M = "11. Master QCS — comparison and report"
tc("QCS", M, "Before bids", "Master QCS before any bid", "Buyer", "Buyer portal", "Live RFQ, no bids.", "—",
   LOGIN_B + ["Open the project → 'Master QCS' tab."],
   "The text 'No bids are placed yet!'; the 'Start Awarding' button is disabled.", "High")
for nbids in ["1 bid", "2 bids with different prices (100 and 90)", "2 bids with the same price (100 and 100)", "3 bids, one rejected"]:
    tc("QCS", M, "After bids", f"Master QCS with {nbids}", "Buyer", "Buyer portal", f"RFQ with {nbids} on 10 units.", nbids,
       LOGIN_B + ["Open the project → Master QCS.", "Read each vendor's column: Qty Offer, Rank, RFQ Amount, Final Negotiated Rate/Amount, GST, Other Charges, Sum Total.", "Click 'Download Report' and open the file."],
       ("One column; Rank 1; RFQ Amount 1,000; Sum Total with GST." if nbids == "1 bid" else
        "Two columns; 90 = Rank 1 with amount 900, 100 = Rank 2 with 1,000; totals = Σ lines." if "different" in nbids else
        "Both vendors show the same rank — record whether it is 1 and 1, or 2 and 2 (known: ties at the top show rank 2 for both, nobody rank 1)." if "same" in nbids else
        "Only the two active bids are ranked; the rejected bid is shown struck through / not ranked.") +
       " The downloaded report has the same vendors, ranks, rates, amounts and totals as the screen, plus the summary (event id, title, dates, vendors invited/participated).",
       "Critical")
tc("QCS", M, "Live update", "The comparison updates when a vendor revises", "Buyer, Vendor", "Buyer + Vendor portal", "2 bids: A 100, B 90.", "A revises to 85.",
   LOGIN_V + ["As vendor A, Edit bid → 85 → Submit."] + LOGIN_B + ["Refresh Master QCS."],
   "A is now Rank 1 with 850; B Rank 2.", "High")
tc("QCS", M, "Savings", "Savings on the comparison", "Buyer", "Buyer portal", "Budget 120/unit; best bid 90.", "—",
   LOGIN_B + ["Overview → savings card; Master QCS → savings row."],
   "300 and 25 % everywhere; a reference of 0 never shows 'Infinity %'.", "High")
tc("QCS", M, "Vendor view", "The vendor never sees other vendors' prices", "Vendor", "Vendor portal", "2 bids.", "—",
   LOGIN_V + ["Open the event, every tab, and download your quote."],
   "Only your own figures (and your rank if the company shows ranks); nothing about the other vendor.", "High", "Negative")

# ═════════════════════ MODULE 12: awarding — all combinations ═════════════════════
M = "12. Awarding — complete, partial, line-wise, approval and PO"
for bids in ["1 vendor bid", "2 vendors bid (100 and 90)", "3 vendors bid"]:
    for award in ["complete to the best price (L1)", "partial: split 6 + 4 between two vendors", "partial: split 6 + 5 (more than the line)", "line-wise: each line to its best bidder", "award a vendor who did not bid"]:
        for approval in ["no approval flow", "approver approves with a remark", "approver approves without a remark", "approver rejects"]:
            if bids == "1 vendor bid" and award.startswith(("partial", "award a vendor")): continue
            if award.startswith("partial: split 6 + 5") or award.startswith("award a vendor who"):
                if approval != "no approval flow": continue
            refused = award.startswith("partial: split 6 + 5") or award.startswith("award a vendor who") or approval == "approver approves without a remark"
            tc("AWD", M, f"Award — {award}", f"{bids}; {award}; {approval}", "Buyer", "Buyer portal",
               f"A closed RFQ (evaluation over) with {bids} on a line of 10 units (2 lines for line-wise); partial awarding enabled; {approval}.", f"{bids}; {award}; {approval}.",
               LOGIN_B + ["Open the project → Master QCS → click 'Start Awarding' (enabled only when the stage is closed).",
                          "On the awarding screen " + ("tick the L1 vendor and leave the full quantity 10." if award.startswith("complete") else
                                                       "tick two vendors and type 6 and 4 in their quantity boxes." if "6 + 4" in award else
                                                       "tick two vendors and type 6 and 5." if "6 + 5" in award else
                                                       "for each line tick its best bidder with the full quantity." if award.startswith("line-wise") else
                                                       "look for the vendor who did not bid and try to tick it."),
                          "Read the amounts per vendor and the total at the bottom.", "Click 'Submit' (type a remark if asked)."]
               + ([] if approval == "no approval flow" else ["Log in as the approver; open Approvals; open the award request.", "Approve with the remark 'OK'." if approval == "approver approves with a remark" else ("Click Approve with the remark empty." if "without" in approval else "Click Reject with a reason.")])
               + ["Back as the buyer: open the project, Master QCS and the Events History tab."],
               ("Refused: " + ("'the awarded quantity is more than the line's quantity' — Submit is blocked." if "6 + 5" in award else ("the non-bidder is not offered / cannot be awarded." if award.startswith("award a vendor who") else "'Remark is necessary for approval' — the approval does not go through."))) if refused else
               (("Each vendor's amount = its quantity × its own price (e.g. 6 × 90 + 4 × 100 = 940); " if "6 + 4" in award else "Amount = 10 × L1 price; " if award.startswith("complete") else "Each line's amount = its quantity × that line's L1 price; ") +
                "the total equals the sum. " +
                ("The award is final at once: the winning bid(s) show 'Awarded', one PO per awarded vendor appears under Orders, the event moves to History." if approval == "no approval flow" else
                 ("Master QCS shows 'Approval in Progress' and hides Start Awarding; after the approval the bids are Selected, one PO per vendor is created and the event moves to History." if approval == "approver approves with a remark" else
                  "The proposal is Rejected; no PO; the buyer can start awarding again."))),
               "Critical" if (award.startswith("complete") and approval in ("no approval flow", "approver approves with a remark")) else "High",
               "Negative" if refused or approval == "approver rejects" else "Positive")
tc("AWD", M, "Gate", "Start Awarding while the round is still live", "Buyer", "Buyer portal", "Live RFQ with bids.", "—",
   LOGIN_B + ["Master QCS → hover 'Start Awarding'."],
   "Disabled with a tooltip saying the stage is live; nothing opens.", "High", "Negative")
tc("AWD", M, "Winner view", "What the vendors see after the award", "Vendor", "Vendor portal", "Awarded to A; B not awarded.", "—",
   LOGIN_V + ["Log in as A and open the event; then as B."],
   "A: 'Awarded' with its awarded quantity and amount. B: 'Not awarded' / Closed. Neither sees the other's price.", "High")
tc("AWD", M, "PO", "Open the PO created from the award", "Buyer", "Buyer portal", "Approved award.", "—",
   LOGIN_B + ["Click 'Orders' in the left menu; find the PO with the event's RFX number; open it."],
   "PO header with the vendor, the awarded line(s), quantity and price equal to the award; the PR line (if any) now shows the ordered quantity.", "Critical")
tc("AWD", M, "History", "The event moves to History once the PO exists", "Buyer", "Buyer portal", "Event with PO.", "—",
   LOGIN_B + [GO_EVENTS, "Look in Live; then in History."],
   "Not in Live; in History with the PO reference; Project Details still opens and the report still downloads.", "High")

# ═════════════════════ Excel ═════════════════════
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Test cases"
hdr = ["Test Case ID", "Module", "Scenario", "Test Case Title", "User Role", "Portal", "Pre-conditions", "Test Data", "Test Steps", "Expected Result", "Priority", "Test Type", "Status"]
ws.append(hdr)
for c in C:
    ws.append([c["id"], c["module"], c["scenario"], c["title"], c["role"], c["portal"], c["pre"], c["data"], "\n".join(f"{i+1}. {s}" for i, s in enumerate(c["steps"])), c["expected"], c["p"], c["typ"], ""])
for i, w in enumerate([14, 34, 30, 56, 14, 18, 44, 44, 90, 80, 10, 10, 8], 1): ws.column_dimensions[get_column_letter(i)].width = w
for cell in ws[1]: cell.font = Font(bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor="1F3A5F"); cell.alignment = Alignment(wrap_text=True, vertical="top")
for row in ws.iter_rows(min_row=2):
    for cell in row: cell.alignment = Alignment(wrap_text=True, vertical="top")
ws.freeze_panes = "D2"; ws.auto_filter.ref = ws.dimensions
mods = []
for c in C:
    if c["module"] not in mods: mods.append(c["module"])
ws2 = wb.create_sheet("Summary", 0); ws2.append(["Module", "Cases", "Critical", "High", "Medium", "Low", "Positive", "Negative", "Edge"])
for m in mods:
    xs = [c for c in C if c["module"] == m]
    ws2.append([m, len(xs)] + [sum(1 for c in xs if c["p"] == k) for k in ("Critical", "High", "Medium", "Low")] + [sum(1 for c in xs if c["typ"] == k) for k in ("Positive", "Negative", "Edge")])
ws2.append(["TOTAL", len(C)] + [sum(1 for c in C if c["p"] == k) for k in ("Critical", "High", "Medium", "Low")] + [sum(1 for c in C if c["typ"] == k) for k in ("Positive", "Negative", "Edge")])
for i, w in enumerate([70, 8, 9, 8, 9, 8, 9, 9, 8], 1): ws2.column_dimensions[get_column_letter(i)].width = w
for cell in ws2[1]: cell.font = Font(bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor="1F3A5F")
wb.save(OUT_XLSX)

# ═════════════════════ HTML ═════════════════════
esc = lambda s: html.escape(str(s)).replace("\n", "<br>")
secs = ""
for m in mods:
    xs = [c for c in C if c["module"] == m]
    trs = "".join(f'<tr><td class="id">{esc(c["id"])}</td><td><b>{esc(c["title"])}</b><div class="sc">{esc(c["scenario"])} · {esc(c["role"])} · {esc(c["portal"])}</div><div class="sc"><b>Before you start:</b> {esc(c["pre"])}</div><div class="sc"><b>Data:</b> {esc(c["data"])}</div></td>'
                  f'<td><ol>{"".join(f"<li>{esc(s)}</li>" for s in c["steps"])}</ol></td><td>{esc(c["expected"])}</td><td><span class="p p-{c["p"].lower()}">{esc(c["p"])}</span><div class="sc">{esc(c["typ"])}</div></td></tr>' for c in xs)
    secs += f'<details class="mod"><summary><span>{esc(m)}</span><span class="cnt">{len(xs)} cases · {sum(1 for c in xs if c["typ"]=="Negative")} negative</span></summary><div class="tablewrap"><table><thead><tr><th>ID</th><th>Test case</th><th>Steps (do exactly this)</th><th>What you should see</th><th>Priority</th></tr></thead><tbody>{trs}</tbody></table></div></details>'
tot, neg = len(C), sum(1 for c in C if c["typ"] == "Negative")
page = f"""<title>Sourcing Manual Test Cases</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* layout: a short guide, then one collapsible module table at a time */
:root{{--bg:#f6f7f5;--paper:#fff;--ink:#1d2320;--muted:#5d6a63;--line:#d9ded9;--accent:#1f3a5f;--accent-ink:#fff;--soft:#eef2f7;--bad:#b3261e;--warn:#9a6700;--ok:#1d7a4f;--font:"IBM Plex Sans",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,monospace}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#151917;--paper:#1d2320;--ink:#e7ebe8;--muted:#a3ada7;--line:#343b37;--accent:#8fb4e3;--accent-ink:#0f1a28;--soft:#232b33;--bad:#ff9a8f;--warn:#f3c66b;--ok:#7fd3a5;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#151917;--paper:#1d2320;--ink:#e7ebe8;--muted:#a3ada7;--line:#343b37;--accent:#8fb4e3;--accent-ink:#0f1a28;--soft:#232b33;--bad:#ff9a8f;--warn:#f3c66b;--ok:#7fd3a5;color-scheme:dark}}
body{{background:var(--bg);color:var(--ink);font-family:var(--font);line-height:1.5;padding-block:28px;padding-inline:max(16px,3vw)}}
main{{max-width:1380px;margin:0 auto;display:grid;gap:20px}}
h1{{font-size:1.8rem;margin:0 0 6px;text-wrap:balance}} h2{{font-size:1.2rem;margin:0 0 8px}}
.lead{{color:var(--muted);max-width:78ch;margin:0}} .eyebrow{{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}}
section{{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:18px 20px}}
.facts{{display:flex;gap:14px;flex-wrap:wrap;margin-top:12px}} .fact{{background:var(--soft);border-radius:8px;padding:10px 16px}} .fact b{{font-size:1.4rem;display:block;font-variant-numeric:tabular-nums}} .fact span{{color:var(--muted);font-size:.85rem}}
details.mod{{background:var(--paper);border:1px solid var(--line);border-radius:10px}} details.mod>summary{{cursor:pointer;padding:14px 18px;font-weight:600;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}} .cnt{{font-family:var(--mono);font-size:.82rem;color:var(--muted);font-weight:400}}
.tablewrap{{overflow-x:auto;border-top:1px solid var(--line)}} table{{border-collapse:collapse;width:100%;min-width:1180px;font-size:.86rem}}
th,td{{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}} th{{background:var(--soft);position:sticky;top:0}}
td.id{{font-family:var(--mono);white-space:nowrap;font-size:.8rem}} .sc{{color:var(--muted);font-size:.8rem;margin-top:3px}}
ol{{margin:0;padding-left:18px}} ol li{{margin:3px 0}}
.p{{display:inline-block;padding:1px 8px;border-radius:999px;font-size:.76rem;font-weight:600;border:1px solid currentColor;white-space:nowrap}} .p-critical{{color:var(--bad)}} .p-high{{color:var(--warn)}} .p-medium{{color:var(--ok)}} .p-low{{color:var(--muted)}}
ul.tight{{margin:6px 0;padding-left:20px}} ul.tight li{{margin:3px 0}}
</style>
<main>
<header>
  <div class="eyebrow">Procol sourcing · manual test cases in plain language · PR → event → vendors → bids → negotiation → Master QCS → award → PO · 27 Oct 2026</div>
  <h1>Sourcing Manual Test Cases</h1>
  <p class="lead">Written for a tester who has never seen Procol: every click is named, every screen is described, and every combination of the buttons and choices is spelled out as its own case so it can be run on its own. Open a module below.</p>
  <div class="facts"><div class="fact"><b>{tot}</b><span>test cases</span></div><div class="fact"><b>{neg}</b><span>negative (should be refused)</span></div><div class="fact"><b>{len(mods)}</b><span>modules</span></div></div>
</header>
<section>
  <h2>Before you start</h2>
  <ul class="tight">
    <li><b>Accounts:</b> one buyer login on the test company (M3M NOIDA or PROCOL DEMO on UAT), one approver login where an approval flow exists, and two or three QA test vendors (names start with QA_Platform, e-mails qa_&lt;stamp&gt;@example.com). Never use a real supplier.</li>
    <li><b>Two browsers:</b> keep the buyer in Chrome and the vendor in an incognito window so both stay logged in.</li>
    <li><b>Names:</b> start every event title with "QA_Platform" so it can be found and deleted later. Write down the PR number, the RFX number and the stage code on every run.</li>
    <li><b>"Record":</b> where the expected result says "record", the product team has not yet fixed the rule — write down exactly what happened in Status / Remarks instead of marking Fail.</li>
    <li><b>Order:</b> modules 1–3 make the events the later modules need; run them first.</li>
  </ul>
</section>
{secs}
</main>
"""
OUT_HTML.write_text(page)
print(f"{tot} cases, {len(mods)} modules, {neg} negative → {OUT_HTML.name} ({OUT_HTML.stat().st_size//1024} KB), {OUT_XLSX.name}")
