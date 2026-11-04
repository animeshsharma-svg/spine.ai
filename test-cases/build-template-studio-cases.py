#!/usr/bin/env python3
"""Manage Templates (Template Studio) test cases for the two vendor-onboarding
template types: 'Vendor Onboarding' (sections + fields + logic) and
'Vendor Onboarding — Buyer Form' (one list of buyer-side fields).

Facts come from procol-client-dashboard origin/fe-main-uat-test
(src/views/templateStudio, PRs #5695 #5742 #5749 #5805) and procol-backend
origin/main-uat-test (templates_controller, Templates::ValidateService,
template_policy), read 26 Oct 2026. Output: HTML page + Excel in the same
column layout as 'Vendor Onboarding V2 Test cases.xlsx'."""
import html
from pathlib import Path
import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HERE = Path(__file__).resolve().parent
OUT_HTML = HERE / "template-studio-test-cases.html"
OUT_XLSX = HERE / "Template_Studio_Vendor_Onboarding_Test_Cases.xlsx"

C = []
def tc(id, typ, scenario, desc, data, expected, p, sev, area):
    C.append(dict(id=id, type=typ, scenario=scenario, desc=desc, data=data, expected=expected, p=p, sev=sev, area=area))

# ───────────────────────── A. Opening Manage Templates ─────────────────────────
A = "A. Opening Manage Templates and the list"
tc("TS_001", "Functional, Access", A and "Manage Templates opens from the admin console", "Open the admin console (Controls page) and click the 'Manage Templates' card.",
   "Login: a user who may read templates (permission template:read_record) and open the console (admin_controls:read_record). Workspace: M3M NOIDA.",
   "Positive: The 'Manage Templates' page opens at /template-studio with the heading 'Manage Templates — Build and manage templates for this company', a search box, a type filter ('All types') and a 'New Template' button.\nNegative: A user without template:read_record cannot open /template-studio (route is permission-gated); the card is in the console list only.", "P0", "High", A)
tc("TS_002", "Functional", "List shows only the template types the studio manages", "Check which templates appear in the list and what the Type column says.",
   "Workspace with templates of several kinds (RFQ/Auction, Vendor Onboarding, Buyer Form, PO, RFI, BOQ…).",
   "Only templates whose template_for matches a studio type are listed: 'Vendor Onboarding', 'Vendor Onboarding — Buyer Form', 'Purchase Order', 'RFQ / Auction (Event)'. Other kinds (BOQ, intake, site visit…) do not appear. The Type column shows the matching label as a tag.", "P1", "Medium", A)
tc("TS_003", "Functional, Validation", "Search filters by template name (case-insensitive, partial)", "Type part of a template name in 'Search templates'.",
   "Templates: 'Vendor Onboarding Form Sample AI 4', 'TEST SCORING'. Search: 'scor', then 'SAMPLE ai'.",
   "Positive: Rows filter as you type; 'scor' shows TEST SCORING; 'SAMPLE ai' shows the Sample AI templates (case does not matter). Clearing the box (x) brings all rows back.\nNegative: Search matches only the name, not the type or the fields.", "P1", "Medium", A)
tc("TS_004", "Functional", "Type filter narrows the list to one template type", "Change 'All types' to 'Vendor Onboarding', then to 'Vendor Onboarding — Buyer Form'.",
   "Same workspace.",
   "Only rows of the chosen type remain; search and filter work together (both must match). Filter options are exactly the four studio types.", "P1", "Medium", A)
tc("TS_005", "Functional, UI", "Fields column shows a count for buyer forms but '-' for vendor onboarding templates", "Look at the 'Fields' column for a Buyer Form row and for a Vendor Onboarding row.",
   "One saved Buyer Form (13 fields), one Vendor Onboarding template (2 sections).",
   "As coded today the column shows the buyer form's field count only when the list reply carries the widgets; for Vendor Onboarding it shows the number of sections (forms) or '-' when the list reply has no forms. In the test screenshot every row shows '-'. Product to confirm what the column should show; report as a defect if a count is expected.", "P2", "Low", A)
tc("TS_006", "Functional", "Clicking a row or the pencil opens the template in the editor", "Click anywhere on a row; then click the pencil icon on another row.",
   "A saved Vendor Onboarding template.",
   "Both open /template-studio/<uuid> with the template loaded in the right editor (sections, fields, logic for Vendor Onboarding; field list for Buyer Form). Breadcrumb: Manage Templates / Edit Template.", "P0", "High", A)
tc("TS_007", "Functional, Negative", "Delete asks for confirmation and then removes the template", "Click the red bin icon, answer No; click it again, answer Yes.",
   "A test template 'QA_Platform_delete_me'.",
   "Positive: 'Delete this template?' Yes/No appears. No: nothing changes. Yes: toast 'Template deleted successfully', the row disappears (DELETE /templates/<uuid>). The row click must not open the editor while answering.\nNegative: A user without template:update_record gets an error on Yes (the backend's destroy uses the update permission).", "P0", "High", A)
tc("TS_008", "Functional, Negative", "Deleting a template that an onboarding event already uses", "Delete a Vendor Onboarding template that is linked to a live onboarding event.",
   "A template used by an onboarding v2 event.",
   "Expected by product: either refused with a clear message, or allowed with the event unaffected. The studio sends a plain DELETE; verify the backend answer (422 with its reason, or 200) and that the running event still opens. Record the actual behaviour.", "P1", "High", A)
tc("TS_009", "Functional", "Pagination of the list", "Scroll to the bottom with more than 10 templates.",
   "Workspace with 70+ templates (as in the screenshot: 8 pages).",
   "Ant Design pagination (10 per page) with page numbers and arrows; search/filter apply across all pages, not only the visible page.", "P2", "Low", A)
tc("TS_010", "Functional, Access", "A user with read-only template permission can look but not create or delete", "Log in as a user with template:read_record but no create/update.",
   "A viewer-type user of the workspace.",
   "The list opens. 'New Template' route (/template-studio/create) is permission-gated (template:create_record) and the edit route needs template:update_record; the backend also refuses POST/PATCH/DELETE /templates with 403 for that user. Report if the buttons are shown but fail only after clicking.", "P1", "High", A)

# ───────────────────────── B. New template: type picker ─────────────────────────
B = "B. 'New Template' and the type picker"
tc("TS_011", "Functional", "Type picker lists the four types with descriptions", "Click 'New Template'.",
   "—",
   "Modal 'Choose a template type' with four cards: Vendor Onboarding — Buyer Form ('Buyer-side fields collected during vendor onboarding.'), Purchase Order, RFQ / Auction (Event), Vendor Onboarding ('Multi-section onboarding form with validations, prefill and conditional logic.') — the last one also shows a 'Generate with AI' link. Closing (x) returns to the list.", "P0", "High", B)
tc("TS_012", "Functional", "Choosing 'Vendor Onboarding' opens an empty section-based editor", "Click the Vendor Onboarding card.",
   "—",
   "URL /template-studio/create?type=vendor_onboarding. Header: tag 'Vendor Onboarding', name box 'Untitled Template', Cancel and Save. Tabs Build / Logic / Preview. One section tab 'Section 1 (0)' with '+ Section'. Left rail 'ADD FIELD' with exactly 8 types: Short Text, Long Text, Number, Date, Dropdown, Multi Select, Radio, Attachment. Centre: 'Pick a field type from the left to add it here.' Right: 'Select a field to configure'.", "P0", "High", B)
tc("TS_013", "Functional", "Choosing 'Vendor Onboarding — Buyer Form' opens a field list pre-filled with the 13 standard buyer fields", "Click the Buyer Form card.",
   "—",
   "URL ...?type=vendor_onboarding_buyer_form. Tabs Build / Preview only (no Logic, no sections). Palette: Text, Number, Date, Dropdown. The canvas already holds 13 fields in this order: OEM / NON OEM (dropdown), Payment Terms (dropdown, required), Email ID (Buyer), Alternate Email ID (Buyer), Vendor Code, Creation Date (date), Group (dropdown, required), Reconciliation GL Account (required), Region (dropdown), Vendor A/C Group (dropdown, required), Payment Method (dropdown), Confirmation Control (dropdown), Schema Group (dropdown).", "P0", "High", B)
tc("TS_014", "Negative", "Unknown type in the URL goes back to the list", "Open /template-studio/create?type=banana directly.",
   "—",
   "Error toast 'Unknown template type' and redirect to /template-studio.", "P2", "Low", B)
tc("TS_015", "Functional, Negative", "Cancel leaves without saving (no draft is kept)", "Add two fields, click Cancel; reopen New Template.",
   "—",
   "Back to the list; nothing was created (no POST /templates). The editor opens empty next time. No 'unsaved changes' warning exists today — product to confirm whether one is wanted.", "P1", "Medium", B)

# ───────────────────────── C. Sections ─────────────────────────
S = "C. Vendor Onboarding — sections"
tc("TS_016", "Functional", "Add, rename and describe a section", "Click '+ Section'; change the name and the description.",
   "Name 'Company details', description 'Legal identity of the vendor'.",
   "A new tab 'Section 2 (0)' appears and becomes active. The two boxes under the tabs edit the active section's name and description; the tab text follows the name. Saved as forms[].name / description with order 1,2,… ", "P0", "High", S)
tc("TS_017", "Functional, Negative", "The last section cannot be deleted; others can", "With one section, look for the x on its tab; add a second section and delete one.",
   "—",
   "With a single section no x is shown. With two or more, the x on a tab deletes that section with all its fields (no confirmation) and the previous tab becomes active. Logic rules that pointed at the deleted fields are left broken (see TS_075).", "P1", "Medium", S)
tc("TS_018", "Functional", "Fields belong to the active section; the tab shows the count", "Add 2 fields in Section 1 and 3 in Section 2; switch tabs.",
   "—",
   "Each tab shows its own count (2 / 3) and its own fields; the selected field clears when switching.", "P1", "Medium", S)
tc("TS_019", "Negative, Validation", "Saving with an empty extra section is refused by the backend", "Section 1 with one valid field, Section 2 with no fields; Save.",
   "—",
   "The studio only checks 'at least one field overall', so it sends the request; the backend rejects a form whose field list is empty: 422 'Invalid Form' (error 792). Expected by product: the studio should say which section is empty before sending. Likely defect — record it.", "P1", "High", S)
tc("TS_020", "Functional", "Section name blank", "Clear the section name and Save.",
   "—",
   "Backend requires every form to have a name ('Invalid name in Forms' → 422 'Invalid Form'). The studio does not pre-check it. Expected: a clear message naming the section.", "P1", "Medium", S)

# ───────────────────────── D. Fields: add / select / reorder / delete ─────────────────────────
F = "D. Vendor Onboarding — adding and arranging fields"
tc("TS_021", "Functional", "Each of the 8 field types can be added and shows the right sub-type", "Click every type in the left rail once.",
   "—",
   "8 cards appear, each 'Untitled field' with its type label (Text, Long Text, Number, Date, Dropdown, Multi Select, Radio, Attachment); the newly added card is selected and its settings open on the right.", "P0", "High", F)
tc("TS_022", "Functional", "Reorder fields by dragging the handle", "Drag the ≡ handle of the third field above the first.",
   "3 fields.",
   "Order changes on the canvas and in the preview; saved order follows the canvas (page_response_headers order).", "P1", "Medium", F)
tc("TS_023", "Functional", "Delete a field that nothing refers to", "Hover a field card, click its delete icon.",
   "A plain Short Text field.",
   "Removed immediately, no prompt; the settings panel returns to 'Select a field to configure'.", "P1", "Medium", F)
tc("TS_024", "Functional, Negative", "Delete a field that a rule or another field refers to shows a warning", "Field 'Vendor type' (radio) controls a logic rule; delete it.",
   "Rule: When Vendor type is 'MSME' → Show 'Udyam number'.",
   "Confirm box: 'Delete \"Vendor type\"? 1 reference(s) point at this field (rule condition). Deleting it will leave those broken.' with a red 'Delete anyway'. Cancel keeps the field. Delete anyway removes it; Save is then blocked with 'A rule or field references a missing field: vendor_type' until the rule is fixed.", "P0", "High", F)
tc("TS_025", "Functional", "Selecting a field opens its settings; clicking another switches", "Click field A then field B.",
   "—",
   "The right panel always shows the clicked field's settings; edits apply to the selected field only.", "P1", "Medium", F)

# ───────────────────────── E. Field settings common to all types ─────────────────────────
E = "E. Field settings (every type)"
tc("TS_026", "Functional", "Label drives the key automatically", "Type a label.",
   "Label 'GST Number (Primary)'.",
   "Key becomes 'gst_number_primary' (lower case, underscores, no symbols) with the hint 'Auto-generated from the label.'", "P0", "High", E)
tc("TS_027", "Functional, Validation", "Two fields with the same label get different keys", "Add two fields both labelled 'Address'.",
   "—",
   "First key 'address', second 'address_2' (then _3…). Save is possible.", "P0", "High", E)
tc("TS_028", "Functional", "Editing the key by hand stops the auto-generation", "Change the key to 'gstin', then change the label again.",
   "—",
   "The key stays 'gstin' (hint disappears); later label edits no longer touch it.", "P1", "Medium", E)
tc("TS_029", "Negative, Validation", "Duplicate keys typed by hand block Save", "Set two fields' keys to 'pan_no' manually; Save.",
   "—",
   "Error 'Duplicate field key: pan_no'; nothing is sent.", "P0", "High", E)
tc("TS_030", "Negative, Validation", "Empty label or empty key blocks Save", "Leave a field's label blank; Save. Then clear the key; Save.",
   "—",
   "'Every field needs a label' / 'Every field needs a key'.", "P0", "High", E)
tc("TS_031", "Negative", "Key with spaces or capitals typed by hand", "Type key 'PAN Number'.",
   "—",
   "The studio accepts it as typed (no cleaning once edited by hand); the backend accepts any string. Product to decide if keys should be forced to snake_case — today a key with spaces is saved and may break {{key}} references in data-source URLs and validations.", "P2", "Medium", E)
tc("TS_032", "Functional", "Changing the Type keeps label/key and shows the right settings", "Change a Short Text field to Dropdown, then to Attachment.",
   "—",
   "Label and key stay. Settings sections change with the type: Dropdown shows Options / Data source / Populate on select / Reset fields on change / Prefill / Autofill / Write back; Attachment shows only Allowed file type. Note: an 'Options' list added while it was a dropdown is kept in the saved data even after changing to Short Text (no clean-up) — verify and report.", "P1", "Medium", E)
tc("TS_033", "Functional", "Visibility: Editable / Read-only / Hidden", "Set each value and check the preview.",
   "—",
   "Editable = vendor can fill; Read-only = shown, not editable (mode_type 'read'); Hidden = not shown in the preview at all (mode_type 'hidden'). A hidden field can still be shown by a logic rule.", "P0", "High", E)
tc("TS_034", "Functional", "Required toggle", "Switch Required on; open Preview.",
   "—",
   "A red * next to the label in the preview; saved as configuration.is_required true. Off = optional.", "P0", "High", E)
tc("TS_035", "Functional", "Helper text appears under the field", "Type helper text.",
   "'Enter the 15-character GSTIN as printed on the certificate.'",
   "Shown under the field in Preview (and saved as the field's description).", "P1", "Low", E)

# ───────────────────────── F. Text/number capabilities ─────────────────────────
T = "F. Short Text / Long Text / Number settings"
tc("TS_036", "Functional", "Format mask (regex) is only a typing mask, not a check", "Enter a regex in 'Format mask'. Save and open the vendor form.",
   "^[A-Z]{5}[0-9]{4}[A-Z]$ on 'PAN'.",
   "Hint says 'Client-side input mask only. Use a Regex validation to actually block submission.' The mask guides typing on the vendor side but a wrong value can still be submitted unless an Internal → Regex validation is also added (TS_041).", "P1", "High", T)
tc("TS_037", "Functional", "Block paste (Short Text and Number only)", "Switch 'Block paste' on for 'Re-enter account number'. Save; on the vendor form try Ctrl+V.",
   "—",
   "Paste is refused in that field on the vendor form (configuration.disable_paste true). The switch is not offered for Long Text, Date, options or Attachment.", "P1", "Medium", T)
tc("TS_038", "Functional", "External validation – single-input types (PAN, GST, MSME, CIN, FSSAI, TAN, VAT)", "Validations → + External → pick PAN.",
   "Field 'PAN' key pan.",
   "A row 'pan_no → field supplying value' appears, pre-filled with this field. Saved as validation_type 'validation_type=pan#pan_no={{pan}}'. Each of the 7 single-input types behaves the same with its own input name (gstin, msme_no, cin_no, fssai_no, tan_no, vat_no).", "P0", "High", T)
tc("TS_039", "Functional, Validation", "External validation – Bank needs two inputs", "Validations → + External → Bank Account.",
   "Fields 'Account number' and 'IFSC'.",
   "Two rows: bank_account_no (pre-filled with this field) and ifsc (empty, must be picked). Saving with ifsc empty writes 'ifsc={{}}' — the vendor-side check would then run with no IFSC. Expected: the studio should refuse an unmapped input. Record the actual behaviour.", "P0", "High", T)
tc("TS_040", "Functional", "External validation – response rules (cross-field compare)", "On the Bank validation add 'Response rule': source_path, reference field GST with paths, match Any, error message; add 'Only when…' Vendor type = Company.",
   "source_path 'validation_data.full_name.value'; reference field 'GST' paths 'legal_name, trade_name'; error 'Account holder must match the GST name'.",
   "Saved under response_rules[{type: cross_field_compare, source_path, reference_fields:[{field_key:'gst', paths:[...], match:'any', when:{field_key:'vendor_type', value:<option id>}}], error_msg}]. On the vendor form the bank check fails with that message when the names differ, and the rule is only applied when Vendor type is Company.", "P1", "High", T)
tc("TS_041", "Functional, Validation", "Internal validation – Regex (server-enforced)", "Validations → + Internal → Regex; enter pattern and message. Save; submit a wrong value on the vendor form.",
   "^[0-9]{10}$, 'Mobile must be 10 digits'.",
   "The vendor form refuses the value with the message (this is the real check, unlike the format mask).", "P0", "High", T)
tc("TS_042", "Functional", "Internal validation – Must equal another field", "Internal → 'Must equal another field' → pick 'Account number' on 'Re-enter account number'.",
   "—",
   "Saved as check 'equal' with compare_to_key and compare paths ['value']; mismatching values are refused on the vendor form with the message.", "P1", "High", T)
tc("TS_043", "Functional", "Internal validation – Reject duplicate (already onboarded)", "Internal → 'Reject duplicate' → model Company.",
   "A PAN already used by another onboarded vendor of this buyer.",
   "The vendor form refuses the duplicate value. 'mapping_model' is optional.", "P1", "High", T)
tc("TS_044", "Functional", "Internal validation – Must be contained in another field", "Internal → 'contains' → pick a field.",
   "'PAN' must be contained in 'GSTIN'.",
   "Saved as check 'contains'; vendor form refuses a GSTIN that does not contain the PAN.", "P2", "Medium", T)
tc("TS_045", "Functional", "Several validations on one field", "Add Internal Regex + External PAN on the same field; remove one with the bin icon.",
   "—",
   "Both are listed with coloured tags (External blue, Internal orange) and saved in order; removing one keeps the other.", "P1", "Medium", T)
tc("TS_046", "Functional", "Prefill on load – allow-list only", "Open 'Prefill on load' dropdown.",
   "—",
   "Exactly 6 choices: Company · Legal name, Company · GSTIN, Company · Email, Company · Address, Company · Phone, User · Display name. Choosing one saves auto_fetch_hash {object_type, key} (GSTIN also response_type 'hash'); the template-level auto_fetch_hash_array lists each distinct source once. The vendor form shows the value pre-filled. 'No prefill' clears it.", "P1", "High", T)
tc("TS_047", "Functional", "Autofill after validation – fill other fields from the check's answer", "On 'GSTIN' add autofill: target 'Legal name', data path 'legal_name.value', 'From validation response'.",
   "—",
   "Row is kept only once a target is chosen (a row without a target is a draft and is dropped on save). Saved as autofill {legal_name: {data_path:['legal_name','value'], fetch_type:'validation'}} and widget_mapping {gstin: ['legal_name']}. On the vendor form, after a successful GST check 'Legal name' fills itself.", "P1", "High", T)
tc("TS_048", "Functional", "Write back to a record", "Switch 'Write back to a record' on; pick model/column.",
   "Model Company, column misc.",
   "Only Company → misc is offered. Saved template-level as entity_mappings {<key>: {model:'Company', column:'misc', hash_key:<key>, data_type:'hash', add_to_extended_field:false, callback_required:false}}. After submission the answer is written to the vendor company's misc under that key.", "P1", "High", T)

# ───────────────────────── G. Option types ─────────────────────────
O = "G. Dropdown / Multi Select / Radio settings"
tc("TS_049", "Functional", "Add, rename, remove options", "Dropdown → Options → + Add option ×3; rename one; delete one.",
   "Labels 'Proprietorship', 'Partnership', 'Company'.",
   "Each option shows its label box and a fixed 6-character id next to it. Renaming keeps the id (rules compare ids, so a renamed option still triggers its rule). Deleting removes it from preview and rules' value lists.", "P0", "High", O)
tc("TS_050", "Negative", "Option with empty label", "Add an option and leave the label empty; Save.",
   "—",
   "Allowed today (the preview shows the id as the label). Expected by product: empty labels should be refused or trimmed. Record.", "P2", "Low", O)
tc("TS_051", "Functional", "Radio offers Options, Prefill and Write back only", "Select a Radio field.",
   "—",
   "Settings show Options, Prefill on load, Autofill after validation, Write back — no Data source, Populate on select or Reset fields (those are dropdown/multi-select only).", "P1", "Medium", O)
tc("TS_052", "Functional", "Data source from the known list", "Dropdown → Data source → pick a source.",
   "A source from GET /widget_data_mapping/data_sources (e.g. 'Payment terms').",
   "The URL box fills with the source's URL (configuration.dropdown_data). In Preview the control says 'Loaded from data source at fill time'. Options list and data source are alternatives: when Options exist the preview uses them.", "P0", "High", O)
tc("TS_053", "Functional", "Data source URL typed by hand with a {{field}} placeholder", "Type '/v1/cities?state={{state}}'.",
   "A field with key 'state' exists.",
   "A tag '{{state}}' appears under the box (grey = another field's value). If no field 'state' exists, Save is blocked: 'A rule or field references a missing field: state'. '{{trade_request_uuid}}' is shown in blue (always available) and never blocks.", "P1", "High", O)
tc("TS_054", "Functional", "Cascade from a parent field", "Data source → 'Cascade from' → pick 'State'.",
   "URL '/v1/cities'.",
   "URL becomes '/v1/cities?parent_key={{state}}' (uses & if the URL already has ?). Picking again appends another parent_key — verify the studio does not add duplicates silently (report if it does).", "P1", "Medium", O)
tc("TS_055", "Functional", "Populate on select", "Dropdown 'Bank' → Populate on select → source_key 'ifsc' → target 'IFSC'.",
   "—",
   "Saved as configuration.populate_on_select [{source_key:'ifsc', target_key_attribute:'ifsc'}]; choosing a bank on the vendor form fills IFSC from the option's data. The target picker never offers the field itself.", "P1", "High", O)
tc("TS_056", "Functional", "Reset fields on change (cascades)", "Dropdown 'Country' → Reset fields on change → 'State', 'City'.",
   "—",
   "Saved as dependent_widgets {state:{actions:[{type:'reset',value:null}]}, city:{…}}; on the vendor form changing Country clears State and City.", "P1", "High", O)
tc("TS_057", "Functional", "Multi Select in preview and in rules", "Add a Multi Select with 3 options; in Logic use 'contains'.",
   "Rule: When 'Certifications' contains 'ISO 9001' → Show 'ISO certificate upload'.",
   "Preview lets several options be picked; the rule fires when the chosen set contains that option (ids compared).", "P1", "High", O)

# ───────────────────────── H. Date / Attachment ─────────────────────────
DA = "H. Date and Attachment settings"
tc("TS_058", "Functional", "Date field offers only Prefill and Write back", "Select a Date field.",
   "—",
   "No validations, no mask, no paste switch. Preview shows a date picker.", "P2", "Low", DA)
tc("TS_059", "Functional", "Attachment – allowed file type", "Attachment → Allowed file type → PDF; then clear to 'Any type'.",
   "—",
   "Choices: PDF, DOCX, XLSX, PNG, JPG, JPEG, CSV (one only). Saved as file_type 'pdf'; preview button reads 'Upload (.pdf)'. The vendor form refuses other extensions. Clearing removes file_type.", "P1", "High", DA)
tc("TS_060", "Negative", "Attachment cannot be made 'Required' through logic only", "Attachment with Required off; a rule 'Make required' targets it.",
   "—",
   "Rule works (is_required true at fill time when the condition holds). Checks that attachments respect required like other types.", "P2", "Medium", DA)

# ───────────────────────── I. Logic ─────────────────────────
L = "I. Logic tab (conditional fields)"
tc("TS_061", "Functional", "Logic tab empty state and badge", "Open Logic with no rules; add one.",
   "—",
   "Empty text 'No conditional logic yet. Add a rule to show, hide or require fields based on an answer.' + 'Add rule'. After adding, the Logic tab shows a badge with the rule count.", "P1", "Low", L)
tc("TS_062", "Functional", "Build a rule: When <field> is <value> → Hide <target>", "Add rule: controlling field 'Vendor type' (radio), 'is', value 'Foreign'; effect Hide → 'GSTIN'.",
   "Options Indian / Foreign.",
   "The value box is a dropdown of the controller's options (shown by label, saved by id). Target picker lists all fields by label except the controller itself. Saved as conditional_block [{conditions:[{comparison:'IS', key_attribute:'vendor_type', value:'<id>'}], logical_operator:'OR', actions:[{key_attribute:'gstin', target:{key:'mode_type', value:'hidden'}}, {…is_required:false}, {…value:null}]}].", "P0", "High", L)
tc("TS_063", "Functional", "The five comparisons", "Change the comparison to each of: is, is not, is empty, is not empty, contains.",
   "Controller: text field 'Country'.",
   "'is empty' / 'is not empty' hide the value box. For a text controller the value is a free text box; for an option controller it is the option list. Only these 5 are offered (the backend fires only these).", "P0", "High", L)
tc("TS_064", "Functional", "The four effects", "On one rule add four effects: Show, Hide, Make required, Make optional on four targets.",
   "—",
   "Saved actions: Show → mode_type write; Hide → mode_type hidden + is_required false + value null; Make required → mode_type write + is_required true; Make optional → is_required false. Preview reflects each.", "P0", "High", L)
tc("TS_065", "Functional", "Preview runs the rules live", "Preview tab: pick 'Foreign' in Vendor type.",
   "Rule from TS_062.",
   "GSTIN disappears at once; picking 'Indian' brings it back. A 'Make required' effect adds the red * live. Values typed in Preview are never saved.", "P0", "High", L)
tc("TS_066", "Functional", "Hidden by default, shown by a rule", "Field 'Udyam number' Visibility = Hidden; rule When Vendor type is MSME → Show it.",
   "—",
   "Preview: hidden until MSME is picked, then shown. Saved template: field mode_type 'hidden' + rule action mode_type 'write'.", "P0", "High", L)
tc("TS_067", "Functional, Negative", "Conflicting rules are warned, last rule wins", "Rule 1 hides 'GSTIN' when Vendor type is Foreign; Rule 2 shows 'GSTIN' when Country is empty.",
   "—",
   "Yellow warning 'Conflicting rules on: gstin — A field is both shown/required and hidden by different rules. Last rule wins at runtime.' Save is still allowed. In Preview with both conditions true, the later rule's effect applies.", "P1", "High", L)
tc("TS_068", "Negative, Validation", "A rule with no controller or no target is ignored on save", "Add a rule, leave the controlling field empty; Save.",
   "—",
   "Save succeeds; the incomplete rule is dropped from conditional_block (not an error). Reopening the template shows it gone. Product to confirm this silent drop is acceptable.", "P2", "Medium", L)
tc("TS_069", "Functional", "Rule value by option id survives renaming the option", "Save a rule on option 'Foreign'; rename the option to 'Overseas'; save; reopen; test in Preview.",
   "—",
   "The rule still fires for the renamed option (ids are compared, not labels).", "P1", "High", L)
tc("TS_070", "Functional", "Rules across sections", "Controller in Section 1, target in Section 2.",
   "—",
   "Allowed; Preview hides/shows the target in its section; a section with every field hidden is not rendered in Preview.", "P1", "Medium", L)
tc("TS_071", "Functional", "Delete a rule and an effect", "Click the bin on an effect row, then on the rule.",
   "—",
   "Effect removed; rule removed; badge count updates; the saved conditional_block no longer carries them.", "P1", "Medium", L)
tc("TS_072", "Functional", "Rule on a text field with 'contains'", "When 'Company name' contains 'Pvt' → Make required 'CIN'.",
   "—",
   "Preview: typing 'ABC Pvt Ltd' adds * to CIN; the check is a plain substring, case-sensitive ('pvt' does not match). Product to confirm case handling.", "P2", "Medium", L)
tc("TS_073", "Functional", "Rule target cannot be the controller itself", "Open the target picker of a rule whose controller is 'Vendor type'.",
   "—",
   "'Vendor type' is not offered as a target.", "P2", "Low", L)
tc("TS_074", "Functional", "Reopening a saved template rebuilds the same rules", "Save a template with 2 rules × 2 effects; reopen.",
   "—",
   "Logic tab shows 2 rules with the same controller, comparison, value and effects (the backend's action rows are grouped back per target: hidden → Hide, is_required true → Make required, write → Show, is_required false → Make optional).", "P0", "High", L)
tc("TS_075", "Negative, Validation", "Broken reference blocks Save", "Delete a field used by a rule ('Delete anyway'), then Save.",
   "—",
   "'A rule or field references a missing field: <key>'. Fixing or deleting the rule lets Save through.", "P0", "High", L)

# ───────────────────────── J. Preview ─────────────────────────
P = "J. Preview tab"
tc("TS_076", "Functional", "Preview renders the whole form by section", "Open Preview with 2 sections and several types.",
   "—",
   "Card titled with the template name (or 'Untitled Template'), 'Fill in the details below', one block per section with its name, each field with label, * if required, helper text, and the right control (text, text area, number, date picker, dropdown, multi-select, radio buttons, Upload button). Empty template shows 'Add fields to see a live preview'.", "P0", "High", P)
tc("TS_077", "Functional", "Read-only fields in preview", "A field with Visibility Read-only.",
   "—",
   "As coded, the preview shows it as a normal editable control (only 'hidden' is handled). Expected: read-only look. Record as a preview-only gap.", "P2", "Low", P)
tc("TS_078", "Functional", "Preview does not call any API or save values", "Fill values in Preview, switch to Build and back.",
   "—",
   "No network calls for the preview; values reset when the tab is re-rendered; nothing is persisted.", "P2", "Low", P)

# ───────────────────────── K. Save / reopen / API ─────────────────────────
K = "K. Save, reopen and the saved data"
tc("TS_079", "Functional, Validation", "Template name is required", "Leave 'Untitled Template' empty; Save.",
   "—",
   "'Template name is required'; nothing is sent. Whitespace-only name is also refused.", "P0", "High", K)
tc("TS_080", "Functional, Validation", "At least one section and one field", "Delete all fields; Save.",
   "—",
   "'Add at least one field'.", "P0", "High", K)
tc("TS_081", "Functional, Integration", "Save creates the template with the right shape", "Build a 2-section template and Save; inspect POST /templates.",
   "—",
   "Body: name, template_for ['rfi','vendor_onboarding'] (bare names; the server stores t-rfi / t-vendor_onboarding), forms[] each {order, name, description, config:{type:'form'}, page_headers:[], page_response_headers:[widgets], evaluators:[]}, configurations {conditional_block?, auto_fetch_hash_array?, entity_mappings?, widget_mapping?}. Widgets carry key_attribute, name, description, input_type, widget_type 'default', configuration {field_type 'participant', is_required, mode_type, cell_options?, dropdown_data?, disable_paste?, populate_on_select?, dependent_widgets?}, validations?, regex?, file_type?, auto_fetch_hash?, autofill?. Client-only data (nanoid, clientMeta) is never sent. Toast 'Template created successfully'; back to the list; the new row shows Type 'Vendor Onboarding'.", "P0", "High", K)
tc("TS_082", "Functional, Integration", "Edit and save an existing template", "Open a saved template, change a label, add a field, remove a rule; Save.",
   "—",
   "PATCH /templates/<uuid> with the full body; toast 'Template updated successfully'. Reopen: all changes present, untouched settings unchanged (fields the studio does not edit round-trip untouched).", "P0", "High", K)
tc("TS_083", "Negative, Integration", "Save with nothing changed", "Open a template and Save without editing.",
   "—",
   "Backend answers 422 error 758 ('no change') when name, widgets, configurations and forms are all absent — but the studio always sends everything, so the save succeeds. Just confirm no error and no duplicate.", "P2", "Low", K)
tc("TS_084", "Negative, Validation", "Same template name twice", "Create two templates named 'Vendor KYC'.",
   "—",
   "Allowed (no uniqueness rule). Product to confirm; the list then shows two identical names.", "P2", "Low", K)
tc("TS_085", "Negative", "Backend rejects a widget without key/name/field_type", "Send POST /templates with a widget missing configuration.field_type (Postman).",
   "—",
   "422 'Invalid Form' (792); the studio always sends field_type 'participant', so this is an API-only check.", "P2", "Low", K)
tc("TS_086", "Negative, Integration", "Workspace on vendor onboarding v3 expects fields in page_headers", "Save a studio template on a workspace with vendor onboarding version v3; then edit it.",
   "Workspace where vendor_onboarding_version = v3 (M3M NOIDA is v2).",
   "On update the backend validates page_headers (must be a non-empty array) when the workspace is v3; the studio sends page_headers [] and fields in page_response_headers → 422 'Invalid Form'. Likely defect on v3 workspaces — record the result.", "P1", "High", K)
tc("TS_087", "Functional", "Fields count / sections in list after save", "Save a template with 2 sections; return to the list.",
   "—",
   "Row present; 'Fields' column shows 2 or '-' (see TS_005).", "P2", "Low", K)
tc("TS_088", "Functional, Access", "Create needs template:create_record, edit needs template:update_record and same company", "Try to Save as a user without the permission; try PATCH a template of another company via API.",
   "—",
   "403 from the backend (policy create? / update? checks the permission and that the template belongs to an allowed company); the studio shows 'Failed to save template'.", "P1", "High", K)

# ───────────────────────── L. Using the saved template on the vendor side ─────────────────────────
U = "L. The saved template on the vendor onboarding form (end to end)"
tc("TS_089", "Functional, Integration", "Template appears when creating an onboarding event", "Create a vendor onboarding event and look for the new template.",
   "Template 'QA_Platform Vendor KYC'.",
   "The studio template is offered like any other vendor-onboarding template (it is stored with the same template_for).", "P0", "High", U)
tc("TS_090", "Functional, Integration", "Vendor sees sections, labels, helper text, required marks", "Invite a QA test vendor (qa_<stamp>@example.com) and open the form.",
   "Template from TS_081.",
   "Sections in order, fields in order, * on required, helper text under fields, hidden fields not shown, read-only fields not editable.", "P0", "High", U)
tc("TS_091", "Functional, Integration", "Conditional logic on the real form", "On the vendor form pick 'Foreign'.",
   "Rule from TS_062.",
   "GSTIN hides (its value cleared and no longer required); picking 'Indian' shows it again — same as the studio preview.", "P0", "High", U)
tc("TS_092", "Functional, Integration", "External validation runs on submit", "Enter a wrong PAN and submit.",
   "PAN 'ABCDE1234Z' (nobody holds it).",
   "The PAN check runs through the provider and the form shows the failure; a correct PAN passes. Autofill (TS_047) fills the target after a pass.", "P0", "High", U)
tc("TS_093", "Functional, Integration", "Internal regex and 'must equal' on the real form", "Enter a 9-digit mobile; enter different account numbers in the two fields.",
   "—",
   "Both refused with the authored messages.", "P0", "High", U)
tc("TS_094", "Functional, Integration", "Prefill, data source, cascade, populate-on-select, reset on the real form", "Open the form for a vendor whose company already has a GSTIN; change Country.",
   "—",
   "GSTIN pre-filled; remote dropdown loads options; State options depend on Country; changing Country clears State/City; choosing a bank fills IFSC.", "P1", "High", U)
tc("TS_095", "Functional, Integration", "Write back after submission", "Submit the form; check the vendor company's misc.",
   "Field with 'Write back to a record'.",
   "The answer is stored under the field key in the company's misc (and in extended fields if configured).", "P1", "High", U)
tc("TS_096", "Functional, Integration", "Editing a template already used by a running event", "Add a required field to a template whose event is live; reopen a vendor's half-filled form.",
   "—",
   "Record what happens (new field shown? old answers kept?). Product to confirm the intended behaviour; the studio gives no warning when editing a template in use.", "P1", "High", U)

# ───────────────────────── M. Generate with AI ─────────────────────────
AI = "M. 'Generate with AI' (Vendor Onboarding only)"
tc("TS_097", "Functional", "AI option is only on the Vendor Onboarding card", "Open the type picker.",
   "—",
   "'Generate with AI' appears under Vendor Onboarding only (aiDraft true for that type).", "P1", "Medium", AI)
tc("TS_098", "Functional, Negative, Validation", "Upload rules: PDF/JPG/JPEG/XLS/XLSX only, max 10 MB", "Try a .docx, a 12 MB PDF, then a valid 2 MB PDF.",
   "—",
   "'Unsupported file type. Upload a PDF, JPG, or Excel file.' / 'File size exceeds 10MB limit' / valid file starts 'AI is reading your form…' (modal cannot be closed while busy).", "P1", "Medium", AI)
tc("TS_099", "Functional, Integration", "AI draft opens in the editor for review", "Upload a vendor registration form PDF.",
   "A real-looking 2-page registration form.",
   "POST /ask_ai_chats/vendor_onboarding_template_draft returns external_request_uuid; the studio polls /external_requests/<uuid> every 3 s; on 'completed' the editor opens on /create?type=vendor_onboarding with the drafted sections and fields, nothing saved yet; Save works like TS_081.", "P0", "High", AI)
tc("TS_100", "Negative, Integration", "AI endpoint missing or failing", "Upload a valid file on an environment whose backend has no vendor_onboarding_template_draft route.",
   "Note: on the backend branches read for this sheet (rfx-uat-main, main-uat-test) the route does not exist — confirm on the test environment.",
   "If the route is missing: 'Could not reach the AI service. Please try again.' If the job fails: 'AI could not generate a draft from this form. Please try again.' After ~5 minutes of pending: 'This is taking longer than expected. Please try again.' The modal closes cleanly in every case.", "P1", "High", AI)

# ───────────────────────── N. Buyer Form ─────────────────────────
BF = "N. Vendor Onboarding — Buyer Form"
tc("TS_101", "Functional", "Default fields: keys fixed, custom keys editable", "Select 'Payment Terms' (default) then 'Vendor Code' (custom).",
   "—",
   "Default field: Key box disabled with hint 'Default field — key is fixed.' Custom field: key editable. Both allow label, type, required.", "P0", "High", BF)
tc("TS_102", "Functional", "Add a custom field; key gets the _custom suffix", "Add Text, label 'Cost centre'.",
   "—",
   "Key 'cost_centre_custom' auto-filled (only while the key is empty; later label edits do not change it).", "P0", "High", BF)
tc("TS_103", "Functional", "Field types: Text, Number, Date, Dropdown, Formula", "Change a custom field's type to each value.",
   "—",
   "Type list has exactly these 5. Dropdown shows 'Data source' (known sources list + URL box); Formula shows the formula editor; others show nothing extra. No validations/logic/sections exist for buyer forms.", "P1", "High", BF)
tc("TS_104", "Functional", "Dropdown data source for buyer fields", "Pick a data source for 'Region'.",
   "—",
   "configuration.dropdown_data holds the source URL; Preview says 'Options load from the data source'. The 13 defaults already carry their /widget_data_mapping?type=… URLs.", "P1", "High", BF)
tc("TS_105", "Functional, Validation", "Formula editor with {Field} tokens", "Type { in a Formula field and pick two Number fields; add '*'.",
   "Fields 'Rate' and 'Qty' (Number).",
   "Autocomplete lists referenceable fields (number/formula/dropdown); display shows {Rate}*{Qty}; stored as rate_custom*qty_custom. 'Unknown field: {X}' and 'Unbalanced parentheses' are shown live; text fields are not offered.", "P1", "Medium", BF)
tc("TS_106", "Functional, Validation", "Buyer form save rules", "Save with: empty name; a field without a label; two fields with the same key.",
   "—",
   "'Template name is required' / 'Every field needs a name' / 'Duplicate field key: …'. A field with a name but empty key: 'Field \"<name>\" is missing a key'.", "P0", "High", BF)
tc("TS_107", "Functional, Integration", "Buyer form saved shape", "Save and inspect POST /templates.",
   "—",
   "Body: name, template_for ['vendor_onboarding_buyer_form'], configurations {}, widgets {global_price_components:[fields], inline_components:[]} (both arrays always present). Fields keep widget_type default/custom, input_type, configuration {field_type 'participant', is_required, dropdown_data?, formula?}.", "P0", "High", BF)
tc("TS_108", "Functional", "Remove and reorder default fields", "Delete 'Schema Group'; drag 'Vendor Code' to the top; Save; reopen.",
   "—",
   "Allowed; order and removal persist (deleted default fields do not come back on reopen).", "P1", "Medium", BF)
tc("TS_109", "Functional", "Buyer form preview", "Open Preview.",
   "—",
   "A form titled with the template name, one control per field with * on required, dropdowns empty with 'Options load from the data source', Formula shown as 'Auto-calculated'.", "P1", "Medium", BF)
tc("TS_110", "Functional, Integration", "Buyer form used in onboarding", "Start onboarding for a vendor with this buyer form selected; open the buyer-side form.",
   "—",
   "The buyer sees the fields in order with the required marks; dropdowns load their options; formula fields compute.", "P0", "High", BF)
tc("TS_111", "Functional", "Edit an existing buyer form", "Open a saved buyer form, rename a field, change Required, Save; reopen.",
   "—",
   "PATCH with the full widgets; changes persist; field keys unchanged.", "P0", "High", BF)

# ───────────────────────── O. Misc / robustness ─────────────────────────
R = "O. Robustness"
tc("TS_112", "Negative", "Very long label and helper text", "Label of 200 characters; helper text of 1,000 characters.",
   "—",
   "Accepted; cards truncate nicely; preview wraps; saved fully.", "P2", "Low", R)
tc("TS_113", "Negative", "Special characters in labels", "Label 'PAN / GST (as per certificate) & co.'",
   "—",
   "Key becomes 'pan_gst_as_per_certificate_co'; label kept as typed.", "P2", "Low", R)
tc("TS_114", "Negative", "Browser refresh in the middle of building", "Add fields, press F5.",
   "—",
   "Work is lost (no autosave/draft) and the create page opens empty — product to confirm; at least no error.", "P2", "Medium", R)
tc("TS_115", "Negative", "Network failure on Save", "Disconnect, Save.",
   "—",
   "Toast 'Failed to save template' (or the backend message); the editor keeps the work so Save can be retried.", "P1", "Medium", R)
tc("TS_116", "Negative", "Opening a template of a type the studio does not handle", "Open /template-studio/<uuid of a BOQ template>.",
   "—",
   "'This template type is not supported here' and redirect to the list.", "P2", "Low", R)

# ───────────────────────── Excel ─────────────────────────
wb = openpyxl.Workbook()
ws = wb.active; ws.title = "Template Studio - VO"
hdr = ["Scenario ID", "Type", "Test Scenario", "Test Case Description", "Test Data", "Expected Result", "Priority", "Severity", "Area", "Status", "Actual / Remarks"]
ws.append(hdr)
for c in C:
    ws.append([c["id"], c["type"], c["scenario"], c["desc"], c["data"], c["expected"], c["p"], c["sev"], c["area"], "", ""])
for i, w in enumerate([12, 22, 46, 46, 40, 80, 9, 10, 34, 10, 30], 1):
    ws.column_dimensions[get_column_letter(i)].width = w
for cell in ws[1]:
    cell.font = Font(bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor="1F3A5F"); cell.alignment = Alignment(wrap_text=True, vertical="top")
for row in ws.iter_rows(min_row=2):
    for cell in row: cell.alignment = Alignment(wrap_text=True, vertical="top")
ws.freeze_panes = "C2"

facts = [
 ("Where it is", "Admin console (Controls page) → card 'Manage Templates' → /template-studio. Routes are permission-gated: list needs template:read_record, create template:create_record, edit template:update_record (same keys the backend policy checks on POST/PATCH/DELETE /templates)."),
 ("What it manages", "Only four template kinds: Vendor Onboarding (template_for rfi + vendor_onboarding), Vendor Onboarding — Buyer Form (vendor_onboarding_buyer_form), Purchase Order, RFQ/Auction. The list hides every other template kind."),
 ("Vendor Onboarding editor", "Sections (tabs) → fields → settings. 8 field types: Short Text, Long Text, Number, Date, Dropdown, Multi Select, Radio, Attachment. Common settings: Label, Key (auto from label, unique, editable), Type, Visibility (Editable / Read-only / Hidden), Required, Helper text. Extra settings depend on the type: Format mask (regex, typing aid only), Validations (External: PAN, GST, MSME, Bank [2 inputs], CIN, FSSAI, TAN, VAT, with response rules; Internal: Regex, Must equal, Reject duplicate, Contains), Block paste, Prefill on load (6 allowed sources), Autofill after validation, Write back to a record (Company.misc), Options (stable ids), Data source (+ cascade, {{field}} placeholders), Populate on select, Reset fields on change, Allowed file type."),
 ("Logic tab", "Rules: When <field> <is | is not | is empty | is not empty | contains> <value> → effects Show / Hide / Make required / Make optional on other fields. Values of option fields are compared by option id, so renaming an option keeps the rule. Conflicts are warned (last rule wins). Saved as configurations.conditional_block; one Hide = 3 action rows (hidden, not required, value cleared)."),
 ("Preview tab", "Live form: sections, labels, *, helper text, controls; rules run as you fill; nothing is saved or called."),
 ("Save", "Studio checks: name, ≥1 section, ≥1 field, every field has label and key, no duplicate keys, no rule/field pointing at a missing key. Then POST/PATCH /templates with forms[] (fields in page_response_headers) + configurations. Backend checks each form has order, name, config.type and a non-empty field list, each widget has key_attribute, name, configuration.field_type — else 422 'Invalid Form'. No name-uniqueness rule."),
 ("Buyer Form editor", "One field list pre-filled with 13 standard buyer fields (default = fixed key, custom = key editable, '_custom' suffix). Types: Text, Number, Date, Dropdown (data source), Formula ({Field} tokens). No sections, no logic, no validations. Saved as widgets.global_price_components."),
 ("Generate with AI", "Vendor Onboarding only: upload PDF/JPG/Excel ≤10 MB → POST /ask_ai_chats/vendor_onboarding_template_draft → poll /external_requests/<uuid> → draft opens in the editor. On the backend branches read for this sheet the route does not exist yet — verify on the test environment."),
 ("Watch-outs found in the code", "1) An extra section with no fields passes the studio but is refused by the backend ('Invalid Form'). 2) On a workspace with vendor onboarding v3 the backend expects fields in page_headers; the studio sends them in page_response_headers → edits may fail. 3) Bank validation can be saved with the IFSC input unmapped. 4) A key typed by hand is not cleaned (spaces/capitals allowed). 5) The 'Fields' column shows '-' for vendor onboarding templates. 6) No unsaved-changes warning, no autosave. 7) Incomplete rules are dropped silently on save. 8) Read-only fields look editable in Preview."),
]
ws2 = wb.create_sheet("How it works")
ws2.append(["Topic", "What actually happens (from the code)"])
for t, f in facts: ws2.append([t, f])
ws2.column_dimensions["A"].width = 30; ws2.column_dimensions["B"].width = 130
for cell in ws2[1]: cell.font = Font(bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor="1F3A5F")
for row in ws2.iter_rows(min_row=2):
    for cell in row: cell.alignment = Alignment(wrap_text=True, vertical="top")
wb.save(OUT_XLSX)

# ───────────────────────── HTML ─────────────────────────
esc = lambda s: html.escape(str(s)).replace("\n", "<br>")
areas = []
for c in C:
    if c["area"] not in areas: areas.append(c["area"])
rows = ""
for a in areas:
    rows += f'<tr class="area"><td colspan="7">{esc(a)}</td></tr>'
    for c in [x for x in C if x["area"] == a]:
        rows += (f'<tr><td class="id">{esc(c["id"])}</td><td>{esc(c["type"])}</td><td><b>{esc(c["scenario"])}</b><div class="desc">{esc(c["desc"])}</div></td>'
                 f'<td>{esc(c["data"])}</td><td>{esc(c["expected"])}</td><td><span class="p p-{c["p"].lower()}">{esc(c["p"])}</span></td><td>{esc(c["sev"])}</td></tr>')
facts_html = "".join(f'<div class="fact"><h4>{esc(t)}</h4><p>{esc(f)}</p></div>' for t, f in facts)
n = len(C)
page = f"""<title>Template Studio Test Cases</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* layout: one reading column; the case table scrolls inside its own box */
:root{{--bg:#f6f7f5;--paper:#fff;--ink:#1d2320;--muted:#5d6a63;--line:#d9ded9;--accent:#1f3a5f;--accent-ink:#fff;--soft:#eef2f7;--bad:#b3261e;--warn:#9a6700;--font:"IBM Plex Sans",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,monospace}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#151917;--paper:#1d2320;--ink:#e7ebe8;--muted:#a3ada7;--line:#343b37;--accent:#8fb4e3;--accent-ink:#0f1a28;--soft:#232b33;--bad:#ff9a8f;--warn:#f3c66b;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#151917;--paper:#1d2320;--ink:#e7ebe8;--muted:#a3ada7;--line:#343b37;--accent:#8fb4e3;--accent-ink:#0f1a28;--soft:#232b33;--bad:#ff9a8f;--warn:#f3c66b;color-scheme:dark}}
body{{background:var(--bg);color:var(--ink);font-family:var(--font);line-height:1.5;padding-block:28px;padding-inline:max(16px,4vw)}}
main{{max-width:1240px;margin:0 auto;display:grid;gap:26px}}
h1{{font-size:1.8rem;margin:0 0 6px;text-wrap:balance}} h2{{font-size:1.25rem;margin:0 0 10px}} h4{{margin:0 0 4px;font-size:.95rem}}
.lead{{color:var(--muted);max-width:72ch;margin:0}} .eyebrow{{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}}
section{{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:20px}}
.facts{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}} .fact{{background:var(--soft);border-radius:8px;padding:12px 14px}} .fact p{{margin:0;font-size:.92rem}}
.tablewrap{{overflow-x:auto;border:1px solid var(--line);border-radius:8px}}
table{{border-collapse:collapse;width:100%;min-width:1180px;font-size:.87rem}}
th,td{{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}} th{{background:var(--soft);position:sticky;top:0}}
tr.area td{{background:var(--accent);color:var(--accent-ink);font-weight:600}} td.id{{font-family:var(--mono);white-space:nowrap}}
.desc{{color:var(--muted);font-size:.84rem;margin-top:3px}}
.p{{display:inline-block;padding:1px 8px;border-radius:999px;font-size:.78rem;font-weight:600;border:1px solid currentColor}} .p-p0{{color:var(--bad)}} .p-p1{{color:var(--warn)}} .p-p2{{color:var(--muted)}}
ol.tight{{margin:6px 0;padding-left:20px}} ol.tight li{{margin:3px 0}}
</style>
<main>
<header>
  <div class="eyebrow">Admin console · Manage Templates (Template Studio) · Vendor Onboarding + Vendor Onboarding — Buyer Form · from the code on fe-main-uat-test / main-uat-test (PRs #5695, #5742, #5749, #5805, #5322/#14889) · 26 Oct 2026</div>
  <h1>Template Studio Test Cases</h1>
  <p class="lead">{n} test cases in plain words for building vendor-onboarding templates from the console: the list, the type picker, sections, the 8 field types and their settings, conditional logic, preview, save, the saved template on the real vendor form, Generate with AI, and the buyer form. "Expected" is what the code does today; where product may want something else, the case says so.</p>
</header>
<section><h2>How the feature works</h2><div class="facts">{facts_html}</div></section>
<section>
  <h2>Test cases ({n})</h2>
  <p class="lead">Same columns as the shared Vendor Onboarding V2 workbook. The Excel adds Area, Status and Actual/Remarks columns for execution.</p>
  <div class="tablewrap"><table>
    <thead><tr><th>ID</th><th>Type</th><th>Scenario / description</th><th>Test data</th><th>Expected result</th><th>Priority</th><th>Severity</th></tr></thead>
    <tbody>{rows}</tbody>
  </table></div>
</section>
<section>
  <h2>Before you start</h2>
  <ol class="tight">
    <li>A console user with template read/create/update permissions on the test workspace (M3M NOIDA is on vendor onboarding v2; a v3 workspace is needed for TS_086).</li>
    <li>Test vendors only (QA_Platform_* names, qa_&lt;stamp&gt;@example.com) for the end-to-end section L; never a real vendor's e-mail.</li>
    <li>Postman for the API-level checks (TS_081, TS_085, TS_088, TS_107): the studio uses POST/PATCH/DELETE /templates and GET /widget_data_mapping/data_sources.</li>
    <li>Name every template you create 'QA_Platform …' so it can be cleaned up.</li>
  </ol>
</section>
</main>
"""
OUT_HTML.write_text(page)
print(f"{n} cases → {OUT_HTML.name}, {OUT_XLSX.name}")
