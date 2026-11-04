#!/usr/bin/env python3
"""Manage Templates — test cases for the two event-deciding template types:
'Purchase Order' (Header Fields + Line Item Fields) and 'RFQ / Auction (Event)'
(Order type, Rank lines by, Rank lots by, Quote Sheet, Global Sheet, formulas).

Written for people, in the team's house style (plain English, every click named as it
reads on screen, expected results with the app's own words and worked-out sums).

Facts come from:
- procol-client-dashboard origin/fe-main-uat-test, src/views/templateStudio (registry po/rfq
  entries, models/grid, models/trade, SheetedFieldEditor, FieldConfigPanel, FormulaEditor,
  PreviewPane, TemplateEditorRoute) and the old builder src/views/templatesAuction;
- procol-backend origin/main (Templates::ValidateService, CreateService, UpdateService,
  Template.get_po_template, TradeRequest ranking, sheets_controller PO step);
- an API check on UAT, 30 Oct 2026, PROCOL DEMO, sending the Studio's exact request bodies
  (prototype/data/evidence/tpl-po-rfq-probe.json; every template made was deleted).

Output: Template_Studio_PO_RFQ_Test_Cases.xlsx + template-po-rfq/index.html + data.json."""
import json
import re
from collections import Counter, OrderedDict
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

HERE = Path(__file__).resolve().parent
OUT_XLSX = HERE / "Template_Studio_PO_RFQ_Test_Cases.xlsx"
OUT_DIR = HERE / "template-po-rfq"
PROBE = HERE.parent / "prototype" / "data" / "evidence" / "tpl-po-rfq-probe.json"

COLS = ["Test Case ID", "Module", "Scenario", "Test Case Title", "User Role", "Portal", "Pre-conditions",
        "Configs Needed", "Test Data", "Test Steps", "Expected Result", "Priority", "Test Type", "Status",
        "Notes for the tester"]

CASES = []
_n = Counter()


def case(prefix, module, scenario, title, steps, expected, *, pre="-", data="-", priority="High",
         ttype="Positive", role="Admin (Procol support console)", portal="Admin console — Manage Templates",
         configs="None", note=""):
    _n[prefix] += 1
    flat = []
    for s in steps:
        if isinstance(s, (list, tuple)):
            flat.extend(s)
        elif s:
            flat.append(s)
    CASES.append({
        "Test Case ID": f"{prefix}-{_n[prefix]:03d}", "Module": module, "Scenario": scenario,
        "Test Case Title": title, "User Role": role, "Portal": portal,
        "Pre-conditions": pre if pre != "-" else DEFAULT_PRE, "Configs Needed": configs, "Test Data": data,
        "Test Steps": "\n".join(f"{i + 1}. {s}" for i, s in enumerate(flat)),
        "Expected Result": expected, "Priority": priority, "Test Type": ttype, "Status": "Not Run",
        "Notes for the tester": note,
    })


# ── people, places, the clicks every case repeats ─────────────────────────────────────────────
DEFAULT_PRE = ("You can open Manage Templates on the test company PROCOL DEMO. Use template names that start "
               "with \"QA_Platform\" so they are easy to find and delete afterwards.")
LOGIN = ("Log in to the Procol admin console (console.ag-ri.in) and pick the test company \"PROCOL DEMO\" "
         "in the company box at the top right")
OPEN = ("In the left menu click \"Admin Controls\" and then the \"Manage Templates\" card. The page "
        "\"Manage Templates — Build and manage templates for this company\" opens")
START = [LOGIN, OPEN]
NEW = "Click the blue \"+ New Template\" button. The pop-up \"Choose a template type\" opens"
PICK_PO = ("Click the \"Purchase Order\" card. The builder opens with the blue tag \"Purchase Order\", the grey name "
           "\"Untitled Template\", the Build / Preview switch, and two empty boxes: \"Header Fields 0 fields\" and "
           "\"Line Item Fields 0 fields\"")
PICK_RFQ = ("Click the \"RFQ / Auction (Event)\" card. The builder opens with the tag \"RFQ / Auction (Event)\", the "
            "three boxes ORDER TYPE, RANK LINES BY, RANK LOTS BY, the \"Quote Sheet\" (6 fields) and the "
            "\"Global Sheet\" (1 field)")
NEW_PO = START + [NEW, PICK_PO]
NEW_RFQ = START + [NEW, PICK_RFQ]
SAVE = "Click the blue \"Save\" button at the top right"
UPDATE = "Click the blue \"Update\" button at the top right"
PREVIEW = "Click \"Preview\" in the Build / Preview switch above the boxes"
BUILD = "Click \"Build\" in the Build / Preview switch"


def name(n):
    return f"Click the grey \"Untitled Template\" at the top and type \"{n}\""


def to_box(box):
    return (f"Click an empty spot inside the \"{box}\" box. Its border turns blue and the left rail now reads "
            f"\"ADD FIELD to {box}\"")


def add(kind, box=None):
    s = f"In the left rail click \"{kind}\". A new card \"Untitled field\" ({kind}) appears at the bottom of the box"
    return [to_box(box), s] if box else [s]


def label(text):
    return f"On the right, under \"Field settings\", type \"{text}\" in \"Label\""


def open_tpl(n):
    return START + [f"Type \"{n}\" in \"Search templates\" and click the template's row. The builder opens with the "
                    "\"Update\" button instead of \"Save\""]


SAVED = ("The green message \"Template created successfully\" appears, the page goes back to \"Manage Templates\" "
         "and the new template is in the list")
UPDATED = ("The green message \"Template updated successfully\" appears and the page goes back to "
           "\"Manage Templates\"")


def refused(msg, extra=""):
    return (f"A red message \"{msg}\" appears. The builder stays open with everything you typed, nothing is saved "
            f"and the template is not in the list{extra}.")


# event side (buyer portal + vendor portal), PROCOL DEMO
B_LOGIN = "Log in to Procol (buyer side, cpanel) with the buyer user of PROCOL DEMO"
P1 = "CYLINDER WITH KEY & KNOB"
P2 = "AAC BLOCKS"
LOC = "Plant Name"
VA, VB = "Vendor A", "Vendor B"
VENDORS = ("Vendors A and B are the QA test vendors of PROCOL DEMO (names start with QA_Platform). "
           "Never invite a real supplier.")


def v_login(v=VA):
    return (f"Log in to the Procol vendor portal (quotes) with {v}'s user — use a second browser or an incognito "
            "window so the buyer stays logged in")


def create_with(tpl, kind="RFQ"):
    return [B_LOGIN,
            "From the left menu click \"Events\" and click the blue \"Create Event\" button at the top right",
            "In the pop-up click \"Single Stage\"",
            f"Under Event Type click \"{kind}\"",
            f"Move the mouse over \"Select Templates\" and click \"{tpl}\" in the menu"]


def build_event(tpl, kind="RFQ", lines=((P1, 10),), vendors=(VA, VB)):
    s = create_with(tpl, kind)
    for i, (p, q) in enumerate(lines):
        s.append(f"In row {i + 1} pick \"{p}\" in \"Product\", type {q} in \"Quantity Requested\" and pick "
                 f"\"{LOC}\" in \"Delivery location\"")
    s.append(f"Under \"Participants\" search and add {' and '.join(vendors)}")
    s.append("Keep the schedule \"Start now\" for 30 minutes and click \"Publish Event\"; confirm the pop-up")
    return s


def bid(v, values):
    return [v_login(v), "Open the event from the Live tab",
            f"In the bid sheet fill {values}", "Click \"Submit\" and confirm"]


EVT_PRE = ("The template named in the steps is saved on PROCOL DEMO (build it first with the matching builder case). "
           + VENDORS)
BUYER = dict(role="Buyer", portal="Buyer portal (cpanel)")
VENDOR = dict(role="Vendor", portal="Vendor portal (quotes)")

# ═════════════════════ 1. Getting there: the list and the type picker ═════════════════════
M = "1. Manage Templates list and the type picker"
case("TPL-LST", M, "Open the page", "Manage Templates opens from Admin Controls",
     START, "The page shows the heading \"Manage Templates\", the line \"Build and manage templates for this "
     "company.\", a \"Search templates\" box, a type filter reading \"All types\", the blue \"+ New Template\" button "
     "and the table with the columns Template Name, Type, Fields, Actions.", priority="Critical")
case("TPL-LST", M, "Type picker", "\"New Template\" offers four template types, each with its description",
     START + [NEW],
     "Four cards, each with an icon and an arrow: \"Vendor Onboarding — Buyer Form\" (Buyer-side fields collected "
     "during vendor onboarding.), \"Purchase Order\" (Purchase order form with header and line-item fields.), "
     "\"RFQ / Auction (Event)\" (Event template with a quote sheet and global price sheet.), \"Vendor Onboarding\" "
     "(Multi-section onboarding form with validations, prefill and conditional logic.) with a \"Generate with AI\" "
     "link. A card turns blue-bordered when the mouse is over it.", priority="High")
case("TPL-LST", M, "Type picker", "Closing the type picker leaves you on the list",
     START + [NEW, "Click the X at the top right of the pop-up", NEW, "Click outside the pop-up (on the grey area)",
              NEW, "Press the Esc key"],
     "Each time the pop-up closes, you stay on \"Manage Templates\" and nothing is created.", priority="Medium")
case("TPL-LST", M, "Type picker", "Choosing \"Purchase Order\" opens an empty PO builder",
     NEW_PO, "The left rail reads \"ADD FIELD to Header Fields\" with exactly four tiles: Text, Number, Date, "
     "Dropdown (no Formula). The \"Header Fields\" box is outlined in blue and both boxes say \"Pick a field type from "
     "the left to add it here.\" The right side says \"Select a field to configure\". The breadcrumb reads "
     "\"Manage Templates / Create Template\". Buttons Cancel and Save at the top right.", priority="Critical")
case("TPL-LST", M, "Type picker", "Choosing \"RFQ / Auction (Event)\" opens the builder pre-filled with the standard fields",
     NEW_RFQ, "ORDER TYPE = \"Buy (Reverse Auction)\", RANK LINES BY = \"Total Amount\", RANK LOTS BY = \"Gross Total\". "
     "Quote Sheet (6 fields), in this order, each with a red star: Product (Product, key product), Quantity Requested "
     "(Quantity, key creator_quantity), Delivery location (Location, key buyer_hub), Quantity Available (Quantity, "
     "key participant_quantity), Price (Number, key price), Total Amount (Formula, key total_amount). Global Sheet "
     "(1 field): Gross Total (Formula, key gross_total). The left rail has five tiles: Text, Number, Date, Dropdown, "
     "Formula, and reads \"ADD FIELD to Quote Sheet\".", priority="Critical")
case("TPL-LST", M, "Search", "Search finds templates by any part of the name, in any letter case",
     START + ["Type \"qa_platform\" in \"Search templates\"", "Change it to \"PLATFORM\"",
              "Click the small x in the search box"],
     "The rows narrow while you type; both spellings find the same QA_Platform templates. The x brings every row back. "
     "Search looks at the name only (typing a type name such as \"Purchase\" finds only templates with that word in "
     "their name).", data="At least two saved QA_Platform templates (one PO, one RFQ)", priority="Medium")
case("TPL-LST", M, "Type filter", "The type filter shows only Purchase Order templates, then only RFQ / Auction templates",
     START + ["Click the \"All types\" box and pick \"Purchase Order\"", "Change it to \"RFQ / Auction (Event)\"",
              "Type \"QA\" in the search box while the filter is on"],
     "The filter offers All types, Vendor Onboarding — Buyer Form, Purchase Order, RFQ / Auction (Event), Vendor "
     "Onboarding. Only rows of the chosen type stay, each with that type's grey tag in the Type column. Search and filter "
     "work together (a row must match both).", priority="High")
case("TPL-LST", M, "Fields column", "The Fields column counts all fields of an RFQ / Auction template",
     START + ["Find a saved RFQ / Auction template that still has the 6 standard Quote Sheet fields and Gross Total",
              "Read its \"Fields\" value", "Do the same for a PO template with 2 header fields and 3 line-item fields"],
     "Expected: the RFQ template shows 7 (6 Quote Sheet + 1 Global Sheet) and the PO template shows 5. Watch out: the "
     "page counts only the Global Sheet / Header Fields, so it may show 1 and 2. If so, raise a bug (\"Fields column "
     "counts only the Global Sheet / Header fields\").", priority="Low", ttype="Edge")
case("TPL-LST", M, "Open from the list", "Clicking a row and clicking the pencil both open the template for editing",
     START + ["Click the name of a saved QA_Platform PO template", "Go back with \"Manage Templates\" in the breadcrumb",
              "Click the pencil icon in the Actions column of a saved RFQ template"],
     "Both open the builder filled with the saved name, fields, order type and ranking. The top right button now reads "
     "\"Update\" (not \"Save\").", priority="High")
case("TPL-LST", M, "Pagination", "With more than 10 templates the list pages, and search covers every page",
     START + ["Scroll to the bottom of the table", "Click page 2", "Search for the name of a template that sits on page 2"],
     "Ten rows per page with page numbers and arrows. Searching finds the template even while you are on page 1.",
     priority="Low")
case("TPL-LST", M, "Unknown type", "A template-type address that does not exist goes back to the list",
     START + ["In the browser address bar replace the end of a create address with \"?type=banana\" and press Enter"],
     "A red message \"Unknown template type\" appears and you are taken back to \"Manage Templates\".",
     priority="Low", ttype="Negative")

# ═════════════════════ 2. PO template: header and line-item fields ═════════════════════
M = "2. Purchase Order template — header and line-item fields"
case("TPO-ADD", M, "Add to header", "A Text field added first lands in Header Fields",
     NEW_PO + add("Text"),
     "A card \"Untitled field\" with a blue Text icon and the word \"Text\" appears in \"Header Fields\", whose count "
     "changes to \"1 fields\". \"Field settings\" opens on the right with Label (empty), Key (empty), Type = Text and "
     "Required off.", priority="Critical")
case("TPO-ADD", M, "Switch box", "Clicking inside Line Item Fields sends the next field there",
     NEW_PO + add("Number") + add("Number", "Line Item Fields"),
     "The first Number card is in Header Fields (1 fields). After clicking the Line Item Fields box its border turns "
     "blue, the left rail reads \"ADD FIELD to Line Item Fields\", and the second Number card lands there (1 fields). "
     "Header Fields still has 1.", priority="Critical")
for kind, extra in [("Text", "a free text box"), ("Number", "numbers only"), ("Date", "a calendar"),
                    ("Dropdown", "a list fed by a data source")]:
    case("TPO-ADD", M, f"Field type {kind}", f"A {kind} field can be added to both Header Fields and Line Item Fields",
         NEW_PO + add(kind, "Header Fields") + [label(f"Hdr {kind}")] + add(kind, "Line Item Fields") +
         [label(f"Line {kind}")],
         f"Header Fields shows \"Hdr {kind}\" and Line Item Fields shows \"Line {kind}\", each tagged \"{kind}\" with its "
         f"own icon and colour, and each with its key under the name (hdr_{kind.lower()}_custom, "
         f"line_{kind.lower()}_custom). In Preview the header one is a form field and the line one is a table column "
         f"({extra}).", priority="High")
case("TPO-ADD", M, "Many fields", "Twenty fields in each box stay usable",
     NEW_PO + ["Add 20 Text fields to Header Fields and 20 Number fields to Line Item Fields, naming them H1…H20 and L1…L20"],
     "Counts read \"20 fields\" for both boxes; the page scrolls, cards do not overlap, and the left rail and Field settings "
     "stay usable. Save works.", priority="Medium", ttype="Edge")
case("TPO-ADD", M, "Order", "Dragging the ≡ handle changes the order of fields inside a box",
     NEW_PO + ["Add three Text fields to Header Fields named \"Buyer Ref\", \"Payment Terms Note\", \"Remarks\"",
               "Hold the ≡ handle at the left of \"Remarks\" and drag it to the top", SAVE,
               "Open the template again from the list"],
     "While dragging the card lifts with a shadow. After the drop the order is Remarks, Buyer Ref, Payment Terms Note, and "
     "the same order is there after reopening.", priority="High")
case("TPO-ADD", M, "Order", "A field cannot be dragged from Header Fields into Line Item Fields",
     NEW_PO + ["Add one Text field \"Remarks\" to Header Fields and one Number field to Line Item Fields",
               "Drag \"Remarks\" by its ≡ handle down into the Line Item Fields box"],
     "The card stops at the bottom edge of Header Fields; it stays in Header Fields. (To move a field between boxes, delete "
     "it and add it again in the other box.)", priority="Low", ttype="Negative")
case("TPO-ADD", M, "Delete", "The bin on a card removes that field; the box shows its empty message again",
     NEW_PO + add("Text") + [label("Remarks"), "Move the mouse over the card; click the red bin icon at its right end"],
     "The card disappears at once, the count goes back to \"0 fields\", \"Pick a field type from the left to add it here.\" "
     "returns and the right side shows \"Select a field to configure\". Note: no \"Are you sure?\" is asked — record it if "
     "the team wants one.", priority="High")
case("TPO-ADD", M, "Select", "Clicking a card opens its settings; clicking another switches them",
     NEW_PO + add("Text") + [label("Remarks")] + add("Number", "Line Item Fields") + [label("Discount %"),
                                                                                  "Click the \"Remarks\" card"],
     "The \"Remarks\" card gets a blue outline and Field settings shows Label \"Remarks\", Type Text. Clicking \"Discount %\" "
     "moves the outline and shows its settings.", priority="Medium")
case("TPO-ADD", M, "Formula in a PO", "Field settings lets a PO field be switched to Formula although the rail has no Formula tile",
     NEW_PO + add("Number", "Line Item Fields") + [label("Line Total"), "In Field settings open \"Type\" and pick \"Formula\"",
                                                   "In \"Formula\" type {Line and see what is offered"],
     "Record what happens. The PO left rail has no Formula tile, yet Type offers Formula. If a formula box appears and the "
     "template saves, check in the PO itself (module 15) whether the formula calculates. Raise a question to product: "
     "are formulas meant for PO templates?", priority="Medium", ttype="Edge")
case("TPO-ADD", M, "Save", "A PO template with header and line-item fields saves and reopens exactly",
     NEW_PO + [name("QA_Platform PO Basic"), *add("Text"), label("Buyer Reference"),
               "Switch \"Required\" on", *add("Date"), label("Expected Delivery"),
               *add("Number", "Line Item Fields"), label("Discount %"), *add("Dropdown", "Line Item Fields"),
               label("Tax Code"), "Under \"Data source\" pick any source from the list", SAVE,
               "Open \"QA_Platform PO Basic\" again"],
     SAVED + ", type \"Purchase Order\". Reopened: Header Fields = Buyer Reference (red star) and Expected Delivery; Line "
     "Item Fields = Discount % and Tax Code with the same data source. Keys: buyer_reference_custom, "
     "expected_delivery_custom, tax_code_custom (record the key made from \"Discount %\"; if keys stopped at the first "
     "letter, see TPL-FLD-001).", priority="Critical",
     data="Name QA_Platform PO Basic")

# ═════════════════════ 3. Field settings ═════════════════════
M = "3. Field settings — label, key, type, required"
case("TPL-FLD", M, "Key from label", "Typing a label letter by letter fills the key from the whole label",
     NEW_PO + add("Text") + ["Click in \"Label\" and type \"Freight Charges\" slowly with the keyboard, one letter at a time"],
     "Expected: Key reads \"freight_charges_custom\" and the card shows that key under the name. Watch out: the key is "
     "filled only while it is empty, so after the first letter it may stay \"f_custom\". If it does, it is a bug (any two "
     "fields starting with the same letter will then clash as duplicates).", priority="Critical",
     note="Type with the keyboard — pasting the whole label at once hides this problem.")
case("TPL-FLD", M, "Key from label", "Pasting a whole label fills the full key",
     NEW_PO + add("Text") + ["Copy the text \"Freight Charges\" and paste it into \"Label\""],
     "Key = \"freight_charges_custom\".", priority="Medium")
case("TPL-FLD", M, "Key from label", "Two fields whose labels start with the same letter get different keys",
     NEW_PO + add("Text") + ["Type \"Freight\" in Label letter by letter"] + add("Text") +
     ["Type \"Fuel Surcharge\" in Label letter by letter", name("QA_Platform PO Keys"), SAVE],
     "Keys are freight_custom and fuel_surcharge_custom and the template saves. If the keys came out as f_custom twice you "
     "will instead get \"Duplicate field key: f_custom\" — that is the bug from the case above.", priority="Critical")
case("TPL-FLD", M, "Rename", "Changing the label later does not change the key",
     NEW_PO + add("Text") + [label("Freight"), "Clear Label and type \"Transport Cost\""],
     "The card name becomes \"Transport Cost\" but the Key stays \"freight_custom\" (the key is set once so formulas and "
     "reports that use it do not break). The tester may edit the key by hand if needed.", priority="Medium")
case("TPL-FLD", M, "Key by hand", "A key typed by hand is used as it is",
     NEW_PO + add("Number") + [label("Insurance"), "Clear \"Key\" and type \"insurance_amount\"", name("QA_Platform PO Key"),
                               SAVE, "Reopen the template"],
     "Saved; the card shows key insurance_amount after reopening.", priority="Medium")
case("TPL-FLD", M, "Key by hand", "A key with spaces, capitals or symbols is refused",
     NEW_PO + add("Number") + [label("Insurance"), "Clear \"Key\" and type \"Insurance Amount ₹\"", name("QA_Platform PO BadKey"),
                               SAVE],
     "Expected: the key is refused with a clear message (keys should be lower case letters, digits and _). Record what "
     "actually happens — the page has no key rule today, and the backend saves anything for PO templates (seen in the "
     "30 Oct API check). If it saves, raise a bug.", priority="High", ttype="Negative")
case("TPL-FLD", M, "Missing key", "A field with an empty key cannot be saved (PO)",
     NEW_PO + add("Text") + [label("Remarks"), "Clear the \"Key\" box", name("QA_Platform PO NoKey"), SAVE],
     refused("Field \"Remarks\" is missing a key"), priority="High", ttype="Negative")
case("TPL-FLD", M, "Missing key", "A field with an empty key cannot be saved (RFQ / Auction)",
     NEW_RFQ + add("Number") + [label("Freight"), "Clear the \"Key\" box", name("QA_Platform RFQ NoKey"), SAVE],
     refused("Every field needs a key"), priority="High", ttype="Negative")
case("TPL-FLD", M, "Missing label", "A field without a label cannot be saved",
     NEW_PO + add("Text") + [name("QA_Platform PO NoLabel"), SAVE],
     refused("Every field needs a name"), priority="High", ttype="Negative")
case("TPL-FLD", M, "Missing label", "A label of only spaces counts as empty",
     NEW_PO + add("Text") + ["Type three spaces in \"Label\"", name("QA_Platform PO Spaces"), SAVE],
     refused("Every field needs a name"), priority="Medium", ttype="Negative")
case("TPL-FLD", M, "Duplicate", "Two PO fields with the same label are refused (header + line item)",
     NEW_PO + add("Text") + [label("Remarks")] + add("Text", "Line Item Fields") + [label("Remarks"),
                                                                                 name("QA_Platform PO Dup"), SAVE],
     refused("Duplicate field key: remarks_custom"), priority="High", ttype="Negative",
     note="Keys must be unique across the whole PO template, not just inside one box.")
case("TPL-FLD", M, "Duplicate", "Two Quote Sheet fields with the same label are refused (RFQ / Auction)",
     NEW_RFQ + add("Number") + [label("Freight")] + add("Number") + [label("Freight"), name("QA_Platform RFQ Dup"), SAVE],
     refused("Duplicate field key in Quote Sheet: freight_custom"), priority="High", ttype="Negative")
case("TPL-FLD", M, "Duplicate", "The same key in the Quote Sheet and the Global Sheet is refused with a clear message",
     NEW_RFQ + add("Number") + [label("Freight")] + add("Number", "Global Sheet") + [label("Freight"),
                                                                                  name("QA_Platform RFQ DupX"), SAVE],
     "Expected: a red message naming the clash before anything is sent. As built, the page checks each sheet on its own, "
     "so the request reaches the server, which refuses it with \"Duplicate columns: Freight and Freight\" (seen in the "
     "30 Oct API check). Pass if that message is shown; raise a bug if the message is unclear or the template saves.",
     priority="High", ttype="Negative")
case("TPL-FLD", M, "Required", "The Required switch puts a red star on the card and in Preview",
     NEW_PO + add("Text") + [label("Buyer Reference"), "Switch \"Required\" on", PREVIEW, BUILD, "Switch \"Required\" off"],
     "Switched on: a red * follows \"Buyer Reference\" on the card and in Preview. Switched off: the star goes in both.",
     priority="High")
case("TPL-FLD", M, "Type change", "Changing Type moves a field between Text, Number, Date and Dropdown",
     NEW_PO + add("Text") + [label("Delivery Window"), "Open \"Type\" and pick Number, then Date, then Dropdown, then Text"],
     "The card's icon and type word follow each change (Number green, Date purple, Dropdown orange, Text blue). Picking "
     "Dropdown shows \"Data source\"; leaving Dropdown hides it. The key does not change.", priority="Medium")
case("TPL-FLD", M, "Long label", "A 200-character label is shown neatly and saved whole",
     NEW_PO + add("Text") + ["Paste a 200-character label (e.g. \"Special instructions for the transporter …\")",
                             name("QA_Platform PO LongLabel"), SAVE, "Reopen it"],
     "The card wraps or cuts the long name with no overlap; the full label is back after reopening. Record the key that "
     "was made from it.", priority="Low", ttype="Edge")
case("TPL-FLD", M, "Characters", "Labels with Hindi letters, emoji or symbols",
     NEW_PO + add("Text") + [label("डिलीवरी नोट"), "Look at the Key"] + add("Text") + [label("Rate (₹/kg) #1"), "Look at the Key"],
     "Record the keys made. Expected: each field gets a usable, non-empty, unique key (or the page asks for one). An empty "
     "or odd key such as \"_custom\" is a bug.", priority="Medium", ttype="Edge")
case("TPL-FLD", M, "Description", "There is no box for a field description or help text",
     NEW_PO + add("Text") + [label("Remarks"), "Look for a description / help text box in Field settings"],
     "Field settings has Label, Key, Type, Required (and Data source / Formula when they apply) only. Preview can show a "
     "description, but none can be typed. Record it as a gap for product.", priority="Low", ttype="Edge")
case("TPL-FLD", M, "Who fills it", "There is no setting for who fills a new field (buyer or vendor) or for units and decimals",
     NEW_RFQ + add("Number") + [label("Freight per unit"), "Look through Field settings"],
     "Field settings has no choice for \"filled by buyer / vendor\", read-only / hidden, unit (KG) or currency (₹) and "
     "decimal places. Every new field is filled by the vendor. Record it — module 12 checks what the vendor and the buyer "
     "really see.", priority="Medium", ttype="Edge")

# ═════════════════════ 4. Dropdown fields ═════════════════════
M = "4. Dropdown fields and data sources"
case("TPL-DRP", M, "Pick a source", "The Data source list shows the company's sources and fills the address box",
     NEW_PO + add("Dropdown") + [label("Tax Code"), "Click \"Select a data source\"",
                                 "Type a few letters of a source name to search", "Click a source"],
     "A spinner shows while the list loads; the list then shows the company's data sources by name and narrows as you "
     "type. After clicking, the box shows the source name and the box below it shows its address "
     "(starting with /widget_data_mapping?type=…).", priority="High")
case("TPL-DRP", M, "Clear source", "The small x clears the chosen data source",
     NEW_PO + add("Dropdown") + [label("Tax Code"), "Pick a data source", "Click the x inside the source box"],
     "Both boxes empty again (\"Select a data source\" and the address placeholder \"/widget_data_mapping?type=...\").",
     priority="Low")
case("TPL-DRP", M, "Typed address", "An address typed by hand is kept",
     NEW_PO + add("Dropdown") + [label("Tax Code"), "Type \"/widget_data_mapping?type=payment_terms_custom\" in the address box",
                                 name("QA_Platform PO DD"), SAVE, "Reopen"],
     "Saved; the address is still there. If it matches a known source, the source box shows that source's name.",
     priority="Medium")
case("TPL-DRP", M, "No source", "A PO dropdown without any data source is refused",
     NEW_PO + add("Dropdown") + [label("Tax Code"), name("QA_Platform PO DD Empty"), SAVE],
     "Expected: refused with a message such as \"Please provide options for Tax Code\". Watch out: the page has no "
     "check and the server accepts anything for PO templates (30 Oct API check), so it may save a dropdown with no "
     "options — raise a bug if it does.", priority="High", ttype="Negative")
case("TPL-DRP", M, "Rubbish address", "A dropdown pointing to an address that does not exist",
     NEW_PO + add("Dropdown") + [label("Tax Code"), "Type \"/does/not/exist\" in the address box",
                                 name("QA_Platform PO DD Bad"), SAVE],
     "Expected: refused, or at least a warning. Record what happens; if it saves, check in module 15 what the PO form "
     "shows for this field (an empty list is a bug).", priority="Medium", ttype="Negative")
case("TPL-DRP", M, "RFQ dropdown", "A dropdown with a data source saves in an RFQ / Auction template",
     NEW_RFQ + add("Dropdown") + [label("Brand"), "Pick any data source in \"Data source\"", name("QA_Platform RFQ DD"), SAVE],
     SAVED + ". Watch out: in the 30 Oct API check the server refused this exact request with \"Please provide data "
     "source for Brand\" (it wants a data-source name the builder has no box for) and also \"Invalid Custom Widget\" "
     "(see module 6). If you get either message, it is a bug.", priority="Critical",
     note="Likely to fail today — confirmed on the server side by the API check.")
case("TPL-DRP", M, "Many sources", "The data source list stays usable with many entries",
     NEW_PO + add("Dropdown") + ["Open the Data source list and scroll to the end"],
     "The list scrolls; search narrows it; nothing is cut off. Record the number of sources.", priority="Low", ttype="Edge")
case("TPL-DRP", M, "Preview", "In Preview a dropdown shows no options",
     NEW_PO + add("Dropdown") + [label("Tax Code"), "Pick a data source", PREVIEW, "Open the Tax Code dropdown"],
     "It opens with the text \"Options load from the data source\" and no options (Preview does not load the source). "
     "Record it as a known Preview limit.", priority="Low", ttype="Edge")

# ═════════════════════ 5. RFQ / Auction: the standard fields ═════════════════════
M = "5. RFQ / Auction — the standard Quote Sheet and Global Sheet fields"
case("TRQ-DEF", M, "Standard fields", "Each standard field shows its type and key when clicked; keys are locked",
     NEW_RFQ + ["Click each of Product, Quantity Requested, Delivery location, Quantity Available, Price, Total Amount, Gross Total"],
     "Field settings shows each one's Label and Key (product, creator_quantity, buyer_hub, participant_quantity, price, "
     "total_amount, gross_total). The Key box is greyed with the hint \"Default field — key is fixed.\" Record what the "
     "Type box shows for Product, Quantity and Location (these types are not in the Type list).", priority="High")
case("TRQ-DEF", M, "Protect standard fields", "Product cannot be deleted",
     NEW_RFQ + ["Move the mouse over the \"Product\" card and look for the red bin"],
     "Expected: no bin on Product (it is marked \"not removable\"). Watch out: the bin shows on every card (in the "
     "screenshot it shows on Quantity Requested). If you can delete Product, go on with the next case — and raise a bug.",
     priority="Critical", ttype="Negative")
case("TRQ-DEF", M, "Protect standard fields", "An RFQ template without the Product field must not save",
     NEW_RFQ + ["Delete the \"Product\" card with its bin", name("QA_Platform RFQ NoProduct"), SAVE],
     "Expected: refused (\"Product is required\" or similar). Watch out: the 30 Oct API check saved such a template without "
     "complaint. If it saves, it is a Critical bug — then try module 11's \"template without Product\" event case and "
     "delete the template afterwards.", priority="Critical", ttype="Negative")
for f, why in [("Quantity Requested", "the buyer's quantity per line"), ("Delivery location", "where each line is delivered"),
               ("Quantity Available", "the vendor's offered quantity, used by Total Amount"),
               ("Price", "the vendor's unit price, used by Total Amount"), ("Total Amount", "the line total, used by Gross Total and ranking"),
               ("Gross Total", "the lot total, used by ranking of lots")]:
    case("TRQ-DEF", M, "Protect standard fields", f"Deleting \"{f}\" is blocked or explained",
         NEW_RFQ + [f"Delete the \"{f}\" card with its bin", name(f"QA_Platform RFQ No {f}"), SAVE],
         f"Expected: \"{f}\" ({why}) cannot be deleted. If the page lets you, record the message on Save. From the server "
         "rules: removing Price or Quantity Available gives \"Invalid Formula for Total Amount\"; removing Total Amount gives "
         "\"Invalid Formula for Gross Total\"; removing the others saves silently. A message that names the formula instead "
         "of the deleted field is confusing — raise it.", priority="High", ttype="Negative")
case("TRQ-DEF", M, "Protect standard fields", "Switching Product's Type to Text must not be allowed",
     NEW_RFQ + ["Click \"Product\"", "Open \"Type\" and pick \"Text\"", name("QA_Platform RFQ ProductText"), SAVE],
     "Expected: the Type box is locked for Product, or Save is refused. Watch out: the 30 Oct API check saved a template "
     "whose Product was Text. If it saves, it is a bug; check in module 11 whether an event can still pick products.",
     priority="Critical", ttype="Negative")
case("TRQ-DEF", M, "Protect standard fields", "Switching Required off on Product, Price or Quantity Available",
     NEW_RFQ + ["Click \"Price\" and switch \"Required\" off", name("QA_Platform RFQ PriceOptional"), SAVE],
     "Expected: Required is locked on for Product, Price and Quantity Available. Record what happens; if it saves, check "
     "in module 12 whether a vendor can submit a bid with no price (that would be a Critical bug).", priority="High",
     ttype="Negative")
case("TRQ-DEF", M, "Rename standard fields", "Renaming \"Price\" to \"Rate per unit\" keeps it working",
     NEW_RFQ + ["Click \"Price\" and change Label to \"Rate per unit\"", name("QA_Platform RFQ Rate"), SAVE, "Reopen"],
     "Saved; the card reads \"Rate per unit\" with key price. Total Amount's formula now reads {Rate per unit} * "
     "{Quantity Available}. RANK LINES BY options show \"Rate per unit\". In an event (module 12) the vendor's column is "
     "titled \"Rate per unit\".", priority="Medium")
case("TRQ-DEF", M, "Order", "Moving Price above Quantity Available changes the bid-sheet column order",
     NEW_RFQ + ["Drag \"Price\" by ≡ above \"Quantity Available\"", name("QA_Platform RFQ Order"), SAVE, "Reopen"],
     "The order after reopening is Product, Quantity Requested, Delivery location, Price, Quantity Available, Total Amount. "
     "Check the event's bid sheet follows it (module 11).", priority="Medium")
case("TRQ-DEF", M, "Units", "Quantity fields carry the unit KG and money fields carry ₹",
     NEW_RFQ + [PREVIEW],
     "Record what Preview shows for the units. The template fixes \"KG\" on both quantity fields and \"₹\" on Price, Total "
     "Amount and Gross Total, with no setting to change them. Check in module 11 whether an event for a product sold in "
     "\"Nos\" shows KG (that would be a bug).", priority="Medium", ttype="Edge")
case("TRQ-DEF", M, "Defaults only", "An RFQ template with only the standard fields saves",
     NEW_RFQ + [name("QA_Platform RFQ Standard"), SAVE],
     SAVED + " with the type \"RFQ / Auction (Event)\". Reopened, it shows the same 6 + 1 fields, Buy (Reverse Auction), "
     "Total Amount and Gross Total. (Saved fine in the 30 Oct API check.)", priority="Critical")

# ═════════════════════ 6. RFQ / Auction: your own fields ═════════════════════
M = "6. RFQ / Auction — adding your own fields"
for kind, lbl, box, extra in [
    ("Text", "Make / Brand", "Quote Sheet", "text the vendor types per line"),
    ("Number", "Freight per unit", "Quote Sheet", "a number the vendor types per line"),
    ("Date", "Delivery date offered", "Quote Sheet", "a date the vendor picks per line"),
    ("Formula", "GST Amount", "Quote Sheet", "a value worked out per line"),
    ("Number", "Freight (lump sum)", "Global Sheet", "one number for the whole quote"),
    ("Text", "Payment terms offered", "Global Sheet", "one text for the whole quote"),
    ("Date", "Quote valid till", "Global Sheet", "one date for the whole quote"),
    ("Formula", "Grand Total incl. freight", "Global Sheet", "one value worked out for the whole quote"),
]:
    steps = NEW_RFQ + add(kind, box) + [label(lbl)]
    if kind == "Formula":
        steps.append("In \"Formula\" type " + ("{Total Amount} * 18 / 100" if box == "Quote Sheet" else "SUM({Total Amount}) + {Freight (lump sum)}"))
        if box == "Global Sheet":
            steps = NEW_RFQ + add("Number", "Global Sheet") + [label("Freight (lump sum)")] + steps[len(NEW_RFQ):]
    steps += [name(f"QA_Platform RFQ {lbl}"), SAVE]
    case("TRQ-ADD", M, f"{kind} in {box}", f"A {kind} field in the {box} saves ({extra})", steps,
         SAVED + f". Reopened, \"{lbl}\" is the last card of the {box}. Watch out: the 30 Oct API check showed the server "
         "refusing every field added this way with \"Invalid Custom Widget\" (the builder does not send a setting the server "
         "requires for added fields). If you see that message, it is a Critical bug that blocks every custom RFQ / Auction "
         "template.", priority="Critical", data=f"Label {lbl}",
         note="Likely to fail today — the server already refused this request in the API check.")
case("TRQ-ADD", M, "Where it lands", "The left rail sends new fields to whichever sheet was clicked last",
     NEW_RFQ + [to_box("Global Sheet"), "Click \"Number\"", to_box("Quote Sheet"), "Click \"Number\""],
     "The first Number lands in Global Sheet (2 fields), the second in Quote Sheet (7 fields). The rail's \"ADD FIELD to …\" "
     "always names the sheet that will receive it.", priority="High")
case("TRQ-ADD", M, "Ranking list", "A new named field appears in RANK LINES BY / RANK LOTS BY at once",
     NEW_RFQ + add("Number", "Quote Sheet") + [label("Landed Cost"), "Open RANK LINES BY"] + add("Formula", "Global Sheet") +
     [label("Grand Total"), "Open RANK LOTS BY"],
     "RANK LINES BY now lists \"Landed Cost\" after Total Amount; RANK LOTS BY lists Gross Total and \"Grand Total\". A field "
     "with no label is not listed.", priority="Medium")
case("TRQ-ADD", M, "Many columns", "Fifteen extra Quote Sheet columns",
     NEW_RFQ + ["Add 15 Number fields to the Quote Sheet named C1 … C15", name("QA_Platform RFQ Wide"), SAVE, PREVIEW],
     "Saved (if module 6's bug is fixed). Preview's table scrolls sideways; nothing overlaps. Check in module 11 how the "
     "event sheet copes with 21 columns.", priority="Low", ttype="Edge")

# ═════════════════════ 7. Formulas ═════════════════════
M = "7. Formulas — writing, checking and saving"
case("TRQ-FML", M, "Insert a field", "Typing { lists only the fields a formula can use",
     NEW_RFQ + add("Text") + [label("Make")] + add("Date") + [label("Ready by")] + add("Formula") + [label("Check"),
                                                                                                "Click in \"Formula\" and type {"],
     "The list shows Quantity Requested, Quantity Available, Price, Total Amount, Gross Total (numbers, quantities and "
     "formulas). It does NOT show Product, Delivery location, \"Make\" (Text), \"Ready by\" (Date) or \"Check\" itself. The "
     "hint under the box reads \"Type { to reference a field. Stored as field keys.\"", priority="High")
case("TRQ-FML", M, "Insert a field", "Picking from the list builds a readable formula",
     NEW_RFQ + add("Formula") + [label("Landed Price"), "In \"Formula\" type { and pick \"Price\"", "Type +",
                                 "Type { and pick \"Quantity Requested\""],
     "The box reads {Price}+{Quantity Requested} (spaces you type are removed). No red text under the box.",
     priority="High")
case("TRQ-FML", M, "Search in list", "The { list narrows to fields starting with the letters typed",
     NEW_RFQ + add("Formula") + ["In \"Formula\" type {Qu"],
     "Only Quantity Requested and Quantity Available are listed. Typing {Zz shows \"No matching fields\".", priority="Low")
case("TRQ-FML", M, "Unknown field", "A field name that does not exist is flagged at once",
     NEW_RFQ + add("Formula") + [label("Check"), "In \"Formula\" type {Freight}*2"],
     "Red text under the box: \"Unknown field: {Freight}\".", priority="High", ttype="Negative")
case("TRQ-FML", M, "Brackets", "Unbalanced brackets are flagged",
     NEW_RFQ + add("Formula") + ["Type ({Price}*2 in \"Formula\"", "Change it to {Price}*2)", "Change it to )({Price}"],
     "Each time the red text reads \"Unbalanced parentheses\".", priority="Medium", ttype="Negative")
case("TRQ-FML", M, "Save with errors", "A formula with a red error must stop the Save",
     NEW_RFQ + add("Formula") + [label("Check"), "In \"Formula\" type {Freight}*2 (red \"Unknown field\" shows)",
                                 name("QA_Platform RFQ BadFormula"), SAVE],
     "Expected: Save is stopped on the page with a message pointing to \"Check\". Watch out: the page does not check "
     "formulas on Save; the server then answers \"Invalid Formula for Check\" (30 Oct API check). Pass only if a clear "
     "message appears and nothing is saved.", priority="High", ttype="Negative")
case("TRQ-FML", M, "Empty formula", "A Formula field left empty is refused",
     NEW_RFQ + add("Formula") + [label("Blank"), name("QA_Platform RFQ EmptyFormula"), SAVE],
     refused("Invalid Formula for Blank", " (the server's message; better would be \"Formula cannot be empty\" as in the old builder)"),
     priority="High", ttype="Negative")
case("TRQ-FML", M, "Self reference", "A formula that uses its own field is refused",
     NEW_RFQ + ["Click \"Total Amount\" and change its formula to total_amount*2 (type the key itself)",
                name("QA_Platform RFQ Self"), SAVE],
     refused("Invalid Formula for Total Amount"), priority="Medium", ttype="Negative",
     note="Its own name is never offered in the { list, so you must type the key.")
case("TRQ-FML", M, "Circular", "Two formulas that use each other are refused",
     NEW_RFQ + add("Formula") + [label("A Cost")] + add("Formula") + [label("B Cost"),
                                                                    "Set A Cost = {B Cost}*1 and B Cost = {A Cost}*1",
                                                                    name("QA_Platform RFQ Circle"), SAVE],
     "Expected: refused (\"circular formula\"). Watch out: the 30 Oct API check SAVED this. If it saves, raise a High bug "
     "and try it in an event (module 12) to see whether the bid sheet hangs or errors.", priority="High",
     ttype="Negative")
case("TRQ-FML", M, "Text in a formula", "A formula that uses a Text field (typed by key) is refused",
     NEW_RFQ + add("Text") + [label("Make")] + add("Formula") + [label("Check"), "Type make_custom*2 in \"Formula\"",
                                                                name("QA_Platform RFQ TextMath"), SAVE],
     refused("Invalid Formula for Check"), priority="Medium", ttype="Negative")
case("TRQ-FML", M, "Divide by zero", "A formula dividing by a literal 0",
     NEW_RFQ + add("Formula") + [label("Bad Ratio"), "Type {Price}/0 in \"Formula\"", name("QA_Platform RFQ Div0"), SAVE],
     "Expected: refused. Watch out: the 30 Oct API check saved it. Record; if saved, see module 12 for what the vendor's "
     "sheet shows (Infinity / error / blank).", priority="Medium", ttype="Negative")
case("TRQ-FML", M, "IF", "An IF formula saves",
     NEW_RFQ + add("Formula") + [label("Volume Discount"), "Type IF({Price}>100,{Price}*0.1,0) in \"Formula\"",
                                 name("QA_Platform RFQ IF"), SAVE],
     SAVED + " (the server accepted IF in the 30 Oct API check). Module 12 checks the numbers.", priority="Medium")
for fn, f in [("SUM", "SUM({Total Amount})"), ("MIN", "MIN({Price},{Freight per unit})"), ("MAX", "MAX({Price},100)"),
              ("ROUND", "ROUND({Price}*1.18,2)")]:
    case("TRQ-FML", M, "Functions", f"The {fn} function in a formula",
         NEW_RFQ + add("Number") + [label("Freight per unit")] + add("Formula") + [label(f"{fn} check"), f"Type {f} in \"Formula\"",
                                                                                  name(f"QA_Platform RFQ {fn}"), SAVE],
         f"Record whether {fn} is accepted. If accepted, module 12 checks the result.", priority="Low", ttype="Edge")
case("TRQ-FML", M, "Rename used field", "Renaming a field used in a formula keeps the formula right",
     NEW_RFQ + add("Number") + [label("Freight per unit")] + add("Formula") + [label("Landed Price"),
                                                                              "Type {Price}+{Freight per unit}",
                                                                              "Rename \"Freight per unit\" to \"Transport per unit\"",
                                                                              "Click \"Landed Price\" again"],
     "The formula now reads {Price}+{Transport per unit} — it follows the new name because it is stored by key.",
     priority="Medium")
case("TRQ-FML", M, "Delete used field", "Deleting a field that a formula uses is caught",
     NEW_RFQ + add("Number") + [label("Freight per unit")] + add("Formula") + [label("Landed Price"),
                                                                              "Type {Price}+{Freight per unit}",
                                                                              "Delete \"Freight per unit\" with its bin",
                                                                              "Click \"Landed Price\"", name("QA_Platform RFQ Orphan"), SAVE],
     "Expected: the formula shows the problem as soon as the field is deleted, and Save is refused. Record what the box "
     "shows (probably the bare key freight_per_unit_custom with no red text). On Save the server answers \"Invalid Formula "
     "for Landed Price\".", priority="High", ttype="Negative")
case("TRQ-FML", M, "Same label twice", "Two fields with the same label and a formula that uses that label",
     NEW_RFQ + add("Number") + [label("Rate"), "Change its key to rate_a"] + add("Number") + [label("Rate"),
                                                                                         "Change its key to rate_b"] +
     add("Formula") + [label("Check"), "Type {Rate}*2"],
     "Record which Rate the formula picked (look at the key after saving). A formula that silently picks one of two "
     "same-named fields is risky — raise it.", priority="Low", ttype="Edge")
case("TRQ-FML", M, "Global uses line field", "A Global Sheet formula that uses a Quote Sheet field without SUM",
     NEW_RFQ + add("Formula", "Global Sheet") + [label("Odd Total"), "Type {Price}*2", name("QA_Platform RFQ GlobalNoSum"), SAVE],
     "Expected: refused or a warning (one quote-level value cannot be made from many line prices without SUM). Watch out: "
     "the 30 Oct API check saved it. Record what the event shows for it (module 12).", priority="Medium", ttype="Negative")
case("TRQ-FML", M, "Change Gross Total", "Gross Total can include a Global Sheet freight field",
     NEW_RFQ + add("Number", "Global Sheet") + [label("Freight (lump sum)"), "Click \"Gross Total\"",
                                                "Change its formula to SUM({Total Amount})+{Freight (lump sum)}",
                                                name("QA_Platform RFQ GrossFreight"), SAVE],
     SAVED + " (blocked today if module 6's bug is present). Module 12 checks the sum.", priority="High")
case("TRQ-FML", M, "Formula in Preview", "Preview shows formulas as \"Auto-calculated\" without working them out",
     NEW_RFQ + [PREVIEW, "In the Quote Sheet table type Quantity Available 10 and Price 90"],
     "Total Amount and Gross Total read \"Auto-calculated\"; Preview does not show 900. Record it as a Preview limit; the "
     "real check is in the event (module 12).", priority="Low", ttype="Edge")

# ═════════════════════ 8. Order type and ranking ═════════════════════
M = "8. Order type, Rank lines by, Rank lots by"
case("TRQ-RNK", M, "Order type", "Order type offers Buy (Reverse Auction) and Sell (Forward Auction)",
     NEW_RFQ + ["Open ORDER TYPE"],
     "Two options: \"Buy (Reverse Auction)\" (ticked, the default) and \"Sell (Forward Auction)\".", priority="High")
case("TRQ-RNK", M, "Order type", "A Sell template saves and reopens as Sell",
     NEW_RFQ + ["Pick \"Sell (Forward Auction)\" in ORDER TYPE", name("QA_Platform RFQ Sell"), SAVE, "Reopen"],
     SAVED + ". Reopened, ORDER TYPE reads \"Sell (Forward Auction)\".", priority="Critical")
case("TRQ-RNK", M, "Same name, Buy and Sell", "A Buy and a Sell template may share a name",
     NEW_RFQ + [name("QA_Platform RFQ Twin"), SAVE, NEW, PICK_RFQ, "Pick \"Sell (Forward Auction)\"",
                name("QA_Platform RFQ Twin"), SAVE],
     "Both save (the 30 Oct API check agreed: names are unique per order type). The list shows two \"QA_Platform RFQ Twin\" "
     "rows; record whether anything tells them apart, since the list has no Order type column.", priority="Medium",
     ttype="Edge")
case("TRQ-RNK", M, "Rank lines by", "RANK LINES BY should offer only money fields",
     NEW_RFQ + ["Open RANK LINES BY"],
     "Expected (as in the old template builder's \"Ranking Criteria\"): only price and amount fields — Price and Total Amount. "
     "As built it lists every Quote Sheet field: Product, Quantity Requested, Delivery location, Quantity Available, Price, "
     "Total Amount (see the screenshot). Raise a bug if Product / Delivery location / quantities are offered.",
     priority="High", ttype="Negative")
case("TRQ-RNK", M, "Rank lines by", "Ranking lines by Product must not save",
     NEW_RFQ + ["Pick \"Product\" in RANK LINES BY", name("QA_Platform RFQ RankProduct"), SAVE],
     "Expected: refused. Watch out: the 30 Oct API check saved this. If it saves, raise a bug and run the event case in "
     "module 13 to see how vendors get ranked.", priority="High", ttype="Negative")
case("TRQ-RNK", M, "Rank lines by", "Ranking lines by Price saves",
     NEW_RFQ + ["Pick \"Price\" in RANK LINES BY", name("QA_Platform RFQ RankPrice"), SAVE, "Reopen"],
     SAVED + ". Reopened, RANK LINES BY reads Price.", priority="High")
case("TRQ-RNK", M, "Rank lines by", "Ranking lines by your own formula field",
     NEW_RFQ + add("Number") + [label("Freight per unit")] + add("Formula") + [label("Landed Price"),
                                                                              "Type {Price}+{Freight per unit}",
                                                                              "Pick \"Landed Price\" in RANK LINES BY",
                                                                              name("QA_Platform RFQ RankLanded"), SAVE],
     SAVED + " (blocked today if module 6's bug is present). Module 13 checks the ranking.", priority="High")
case("TRQ-RNK", M, "Deleted ranking field", "Deleting the field chosen in RANK LINES BY is caught",
     NEW_RFQ + add("Number") + [label("Landed Cost"), "Pick \"Landed Cost\" in RANK LINES BY",
                                "Delete the \"Landed Cost\" card", "Look at RANK LINES BY", name("QA_Platform RFQ RankGhost"), SAVE],
     "Expected: RANK LINES BY goes back to Total Amount (or asks you to pick again) and Save is refused while it points at "
     "a missing field. As built it probably keeps showing the bare key landed_cost_custom, and the server saves it (the "
     "30 Oct API check saved a ranking key that does not exist). Events then silently rank by Price. Raise a bug if so.",
     priority="High", ttype="Negative")
case("TRQ-RNK", M, "Deleted ranking field", "Deleting Total Amount while it is the line ranking",
     NEW_RFQ + ["Delete the \"Total Amount\" card", "Look at RANK LINES BY and at Gross Total's formula", SAVE],
     "Expected: blocked (Total Amount is a standard field). If deletion is possible, Save is refused by the server with "
     "\"Invalid Formula for Gross Total\". Record what RANK LINES BY shows.", priority="Medium", ttype="Negative")
case("TRQ-RNK", M, "Rank lots by", "RANK LOTS BY lists only Global Sheet fields",
     NEW_RFQ + add("Number", "Global Sheet") + [label("Freight (lump sum)"), "Open RANK LOTS BY"],
     "Lists Gross Total and Freight (lump sum) only. Expected: only money fields (a plain number like freight alone should "
     "not rank lots) — record it.", priority="Medium")
case("TRQ-RNK", M, "Rank lots by", "Ranking lots by a Global Sheet formula saves",
     NEW_RFQ + add("Number", "Global Sheet") + [label("Freight (lump sum)")] + add("Formula", "Global Sheet") +
     [label("Grand Total"), "Type SUM({Total Amount})+{Freight (lump sum)}", "Pick \"Grand Total\" in RANK LOTS BY",
      name("QA_Platform RFQ RankLot"), SAVE],
     SAVED + " (blocked today if module 6's bug is present). Module 13 checks lot ranking.", priority="High")
case("TRQ-RNK", M, "Rename ranking field", "Renaming the field chosen for ranking updates the box",
     NEW_RFQ + ["Click \"Total Amount\" and rename it \"Line Value\"", "Look at RANK LINES BY"],
     "RANK LINES BY now reads \"Line Value\" (same key total_amount).", priority="Low")

# ═════════════════════ 9. Preview ═════════════════════
M = "9. Preview"
case("TPL-PRV", M, "PO preview", "PO Preview shows header fields as a form and line-item fields as a table",
     NEW_PO + [name("QA_Platform PO Preview"), *add("Text"), label("Buyer Reference"), "Switch Required on", *add("Date"),
               label("Expected Delivery"), *add("Number", "Line Item Fields"), label("Discount %"), PREVIEW],
     "A card titled \"QA_Platform PO Preview\" with \"Fill in the details below\". Section \"Header Fields\": Buyer Reference* "
     "(text box), Expected Delivery (date box, DD-MM-YYYY). Section \"Line Item Fields\": a table with # and \"Discount %\", "
     "one row numbered 1, and a dashed \"+ Add line item\" button. A blue \"Submit\" button at the bottom.",
     priority="High")
case("TPL-PRV", M, "Add rows", "\"+ Add line item\" adds numbered rows",
     NEW_PO + [*add("Number", "Line Item Fields"), label("Discount %"), PREVIEW, "Click \"+ Add line item\" twice"],
     "Rows 1, 2 and 3; each row's boxes keep their own values.", priority="Medium")
case("TPL-PRV", M, "Inputs", "Preview boxes behave like their types",
     NEW_PO + [*add("Number"), label("Qty"), *add("Date"), label("Due"), *add("Text"), label("Note"), PREVIEW,
               "Type \"abc\" then 12.5 in Qty", "Open Due and pick a date", "Type 300 characters in Note"],
     "Qty ignores letters and keeps 12.5. Due shows the date as DD-MM-YYYY. Note takes the text.", priority="Medium")
case("TPL-PRV", M, "Submit", "Preview's Submit sends nothing",
     NEW_PO + [*add("Text"), label("Note"), PREVIEW, "Click \"Submit\""],
     "A blue message \"Preview only — nothing is submitted\". Nothing is saved.", priority="Low")
case("TPL-PRV", M, "Untitled", "Preview of a template with no name and no fields",
     NEW_PO + [PREVIEW],
     "The text \"Add fields to see a live preview\" (no form). With a field but no name, the card title is "
     "\"Untitled Template\".", priority="Low", ttype="Edge")
case("TPL-PRV", M, "RFQ preview", "RFQ Preview shows the Quote Sheet as a table and the Global Sheet as a form",
     NEW_RFQ + [PREVIEW],
     "Section \"Quote Sheet\": a table with Product*, Quantity Requested*, Delivery location*, Quantity Available*, "
     "Price*, Total Amount* and \"+ Add line item\". Section \"Global Sheet\": Gross Total* showing \"Auto-calculated\". "
     "Record what kind of box Product and Delivery location get (probably plain text, not a product search).",
     priority="Medium")
case("TPL-PRV", M, "Back to Build", "Going back to Build keeps every field; Preview values are thrown away",
     NEW_PO + [*add("Text"), label("Note"), PREVIEW, "Type \"hello\" in Note", BUILD, PREVIEW],
     "Build shows the same field and settings. Preview opens fresh (Note empty).", priority="Low")

# ═════════════════════ 10. Save, Update, Cancel, Delete ═════════════════════
M = "10. Save, Update, Cancel and Delete"
case("TPL-SAV", M, "No name", "A template without a name is refused",
     NEW_PO + add("Text") + [label("Note"), SAVE], refused("Template name is required"), priority="High", ttype="Negative")
case("TPL-SAV", M, "No name", "A name of only spaces is refused",
     NEW_RFQ + ["Type three spaces as the template name", SAVE], refused("Template name is required"),
     priority="Medium", ttype="Negative")
case("TPL-SAV", M, "No fields", "A PO template with no fields is refused",
     NEW_PO + [name("QA_Platform PO Empty"), SAVE], refused("Add at least one field"), priority="High", ttype="Negative")
case("TPL-SAV", M, "No fields", "An RFQ template with every field deleted is refused",
     NEW_RFQ + ["Delete every card in both sheets (if the page allows it)", name("QA_Platform RFQ Empty"), SAVE],
     refused("Add at least one field"), priority="Medium", ttype="Negative")
case("TPL-SAV", M, "Duplicate name", "A second template with the same name and type is refused",
     NEW_PO + [name("QA_Platform PO Basic"), *add("Text"), label("Note"), SAVE],
     refused("Template name has already been taken"), pre="\"QA_Platform PO Basic\" already exists (case TPO-ADD).",
     priority="High", ttype="Negative")
case("TPL-SAV", M, "Duplicate name", "The same name in different letter case",
     NEW_PO + [name("qa_platform po basic"), *add("Text"), label("Note"), SAVE],
     "Expected: refused like an exact duplicate (two templates that differ only in case look the same to users). Watch out: "
     "the 30 Oct API check saved it. Record; raise as Medium if it saves.", pre="\"QA_Platform PO Basic\" exists.",
     priority="Medium", ttype="Negative")
case("TPL-SAV", M, "Same name, other type", "A PO template and an RFQ template may share a name",
     NEW_RFQ + [name("QA_Platform PO Basic"), SAVE], SAVED + " (names are unique within one type only).",
     pre="\"QA_Platform PO Basic\" exists as a PO template.", priority="Low", ttype="Edge")
case("TPL-SAV", M, "Trimmed name", "Spaces before and after the name are removed on save",
     NEW_PO + [name("   QA_Platform PO Trim   "), *add("Text"), label("Note"), SAVE, "Search \"QA_Platform PO Trim\""],
     "Saved as \"QA_Platform PO Trim\" with no leading or trailing spaces.", priority="Low")
case("TPL-SAV", M, "Long name", "A 300-character name",
     NEW_PO + ["Paste a 300-character name starting with QA_Platform", *add("Text"), label("Note"), SAVE],
     "Expected: the name is limited (e.g. 100–150 characters) with a message. Watch out: the 30 Oct API check saved a "
     "300-character name. Record how the list and the Create Event template menu show it.", priority="Low", ttype="Edge")
case("TPL-SAV", M, "Double click", "Clicking Save twice quickly makes only one template",
     NEW_PO + [name("QA_Platform PO Once"), *add("Text"), label("Note"), "Double-click \"Save\" quickly",
               "Search \"QA_Platform PO Once\""],
     "\"Save\" shows a spinner after the first click; only one row is in the list.", priority="Medium", ttype="Edge")
case("TPL-SAV", M, "Cancel", "Cancel on a new template throws the work away without asking",
     NEW_PO + [name("QA_Platform PO Cancel"), *add("Text"), label("Note"), "Click \"Cancel\"",
               "Search \"QA_Platform PO Cancel\""],
     "Back on the list at once; the template is not there. Note: no \"Discard changes?\" question — record it if product "
     "wants one.", priority="Medium")
case("TPL-SAV", M, "Leave by breadcrumb", "Leaving through \"Manage Templates\" in the breadcrumb loses unsaved work",
     NEW_RFQ + add("Number") + [label("Freight"), "Click \"Manage Templates\" in the breadcrumb at the top left"],
     "Back on the list; the work is gone with no warning. Record it (same as Cancel).", priority="Low", ttype="Edge")
case("TPL-SAV", M, "Reload", "Reloading the page while building",
     NEW_PO + add("Text") + [label("Note"), "Press F5 / Cmd+R"],
     "The builder reopens empty (nothing is kept). Record whether the browser asks before leaving.", priority="Low",
     ttype="Edge")
case("TPL-SAV", M, "Network", "Saving while the internet is off",
     NEW_PO + [name("QA_Platform PO Offline"), *add("Text"), label("Note"),
               "Turn the Wi-Fi off (or set the browser to Offline)", SAVE, "Turn the Wi-Fi back on", SAVE],
     "First Save: a red message (e.g. \"Failed to save template\"), the builder keeps everything. Second Save: " + SAVED + ".",
     priority="Medium", ttype="Negative")
case("TPL-SAV", M, "Update", "Editing a saved template and clicking Update",
     open_tpl("QA_Platform PO Basic") + ["Add a Line Item field \"HSN Code\" (Text)", "Rename the template to "
                                         "\"QA_Platform PO Basic v2\"", UPDATE, "Reopen it"],
     UPDATED + ". Reopened: the new name and the HSN Code field are there; nothing else changed.",
     pre="\"QA_Platform PO Basic\" exists.", priority="Critical")
case("TPL-SAV", M, "Update", "Cancel while editing keeps the saved version",
     open_tpl("QA_Platform PO Basic v2") + ["Delete one field", "Click \"Cancel\"", "Reopen it"],
     "The deleted field is still there — nothing changed.", priority="High")
case("TPL-SAV", M, "Delete", "Deleting a template asks first and then removes it",
     START + ["Find \"QA_Platform PO Basic v2\"", "Click the red bin in its Actions column", "Click \"No\"",
              "Click the bin again and click \"Yes\""],
     "\"Delete this template?\" with Yes / No. No: nothing happens and the row is not opened. Yes: the green message "
     "\"Template deleted successfully\" and the row disappears.", priority="High")

# ═════════════════════ 11. Templates that already exist ═════════════════════
M = "11. Editing templates that already exist (made in the old builder)"
SAFE = ("Work only on a COPY: duplicate an existing RFQ template in the old template builder (or ask a developer for "
        "one), rename it \"QA_Platform COPY …\", and never press Update on a template other people use.")
case("TPL-EDT", M, "Terms & Conditions", "Updating an old RFQ template in the builder keeps its Terms & Conditions",
     [B_LOGIN, "Open the copy in the old template builder and note its Terms & Conditions clauses and attachments"] +
     open_tpl("QA_Platform COPY T&C") + ["Change nothing except the name: add \" v2\"", UPDATE,
                                         "Create an event from it (module 12) and open its Terms & Conditions"],
     "Expected: the same clauses and attachments as before. Watch out: the builder sends an EMPTY Terms & Conditions block "
     "on every save, so they may be wiped. If they are gone, it is a Critical bug (silent data loss on real templates).",
     pre=SAFE, priority="Critical", ttype="Negative", role="Admin + Buyer", portal="Admin console + Buyer portal")
case("TPL-EDT", M, "Other settings", "Updating an old RFQ template keeps its other settings",
     ["Ask a developer which settings the copy has besides ranking (e.g. fast bidding, buyer-side ranking, linked MQCS, "
      "inherited global fields, scheduling defaults)"] + open_tpl("QA_Platform COPY Settings") +
     ["Rename only", UPDATE, "Ask the developer to read the template's settings again"],
     "Expected: every setting is unchanged. Watch out: the builder sends only the two ranking settings and the server "
     "replaces the whole settings block with them, so the rest may be wiped. If so, Critical bug.", pre=SAFE,
     priority="Critical", ttype="Negative")
case("TPL-EDT", M, "Old field types", "An old template with field types the builder does not know (attachment, percentage)",
     open_tpl("QA_Platform COPY Attach") + ["Click the attachment / percentage fields", "Look at their Type box", "Rename only",
                                            UPDATE],
     "The cards show their types (Attachment, Percentage). Record what Type shows; Update must not change these fields. "
     "Check an event made from it still has the attachment column.", pre=SAFE, priority="High", ttype="Edge")
case("TPL-EDT", M, "Linked MQCS", "Changing a field's type on a template linked to an MQCS view is refused",
     open_tpl("QA_Platform COPY MQCS") + ["Click a Number field and change Type to Text", UPDATE],
     refused("Cannot change input type as a MQCs template is linked."),
     pre=SAFE + " The copy must be linked to an MQCS (summary view) template.", priority="Medium", ttype="Negative")
case("TPL-EDT", M, "Old PO template", "Updating an existing PO template keeps its settings",
     open_tpl("QA_Platform COPY PO") + ["Rename only", UPDATE],
     "Expected: header and line-item fields and every setting unchanged. The builder sends empty settings for PO "
     "templates; ask a developer to compare before/after. Wiped settings = Critical bug.",
     pre="A COPY of a company PO template (never the live one).", priority="High", ttype="Negative")
case("TPL-EDT", M, "Event already made", "Editing a template does not change events already made from it",
     open_tpl("QA_Platform RFQ Standard") + ["Rename \"Price\" to \"Unit Rate\"", UPDATE, B_LOGIN,
                                            "Open the live event made earlier from this template"],
     "The live event still shows \"Price\" (it kept its own copy). A new event made from the template shows \"Unit Rate\".",
     pre="A live RFQ made from \"QA_Platform RFQ Standard\".", priority="High", role="Admin + Buyer",
     portal="Admin console + Buyer portal")
case("TPL-EDT", M, "Deleted template", "Deleting a template does not break events made from it",
     START + ["Delete \"QA_Platform RFQ Standard\" (bin, Yes)", B_LOGIN, "Open the event made from it",
              "Start Create Event and open \"Select Templates\""],
     "The event opens and works as before. The template is no longer offered in \"Select Templates\".",
     pre="A live RFQ made from \"QA_Platform RFQ Standard\".", priority="High", role="Admin + Buyer",
     portal="Admin console + Buyer portal")

# ═════════════════════ 12. RFQ / Auction template in an event ═════════════════════
M = "12. Using the RFQ / Auction template in an event"
case("TRQ-EVT", M, "Template menu", "A new Buy template is offered when creating an RFQ and a reverse auction",
     create_with("QA_Platform RFQ Standard") + ["Go back, choose Event Type \"Auction\" and open \"Select Templates\" again"],
     "\"QA_Platform RFQ Standard\" is in the menu for RFQ and for the reverse (buy) auction. The menu's search box finds it.",
     pre=EVT_PRE, priority="Critical", **BUYER)
case("TRQ-EVT", M, "Template menu", "A Sell template is offered only for forward auctions",
     create_with("QA_Platform RFQ Sell", "Auction") + ["Check the forward (sell) auction menu and the RFQ menu"],
     "\"QA_Platform RFQ Sell\" is offered for the forward (sell) auction and not for RFQ / reverse auction. Record exactly "
     "where it appears.", pre=EVT_PRE, priority="Critical", **BUYER)
case("TRQ-EVT", M, "Template menu", "A template is offered to other buyers of the company",
     ["Log in to the buyer portal as a different buyer of PROCOL DEMO (not the one who built the template)",
      "Start Create Event → Single Stage → RFQ and open \"Select Templates\""],
     "With template access filtering Off, the template is offered. With it On, only users it was shared with see it "
     "(a template built in Manage Templates is shared with its maker only) — run once each way.", pre=EVT_PRE,
     configs="template_access_filtering_enabled = Off / On — templates shown only to users they are shared with",
     priority="High", **BUYER)
case("TRQ-EVT", M, "Columns", "The event's product sheet follows the template's Quote Sheet",
     create_with("QA_Platform RFQ Order"),
     "The product sheet shows the buyer columns Product, Quantity Requested, Delivery location in the template's order. "
     "Vendor columns (Price, Quantity Available, Total Amount) follow the order set in the builder (Price before Quantity "
     "Available).", pre=EVT_PRE, priority="High", **BUYER)
case("TRQ-EVT", M, "Renamed column", "A renamed standard column shows its new name to buyer and vendor",
     build_event("QA_Platform RFQ Rate") + [v_login(VA), "Open the event's bid sheet"],
     "The vendor's price column is titled \"Rate per unit\". Total Amount still works (10 × 90 = 900.00).", pre=EVT_PRE,
     data="Vendor A: Rate per unit 90, Quantity Available 10", priority="Medium", role="Buyer + Vendor",
     portal="Buyer + Vendor portal")
case("TRQ-EVT", M, "Custom text column", "A Text column added in the builder is filled by the vendor per line",
     build_event("QA_Platform RFQ Make / Brand") + bid(VA, "Price 90, Quantity Available 10, Make / Brand \"Tata\""),
     "The vendor sees \"Make / Brand\" as an editable column; the buyer sees \"Tata\" in Vendor A's response. Record whether "
     "the buyer can also type in it (should not).", pre=EVT_PRE + " Needs module 6's text field to save first.",
     priority="High", role="Buyer + Vendor", portal="Buyer + Vendor portal")
case("TRQ-EVT", M, "Required custom column", "A required custom column blocks the vendor's submit until filled",
     build_event("QA_Platform RFQ Make / Brand") + [v_login(VA), "Open the event", "Fill Price and Quantity Available but leave "
                                                   "Make / Brand empty", "Click \"Submit\""],
     "Submit is refused and Make / Brand is marked as required. After filling it, Submit works.",
     pre=EVT_PRE + " Make / Brand must have Required on.", priority="High", ttype="Negative", **VENDOR)
case("TRQ-EVT", M, "Optional column", "An optional custom column can stay empty",
     build_event("QA_Platform RFQ Delivery date offered") + bid(VA, "Price 90, Quantity Available 10, leave Delivery date offered empty"),
     "The bid is submitted; the buyer sees an empty cell.", pre=EVT_PRE, priority="Medium", **VENDOR)
case("TRQ-EVT", M, "Number column", "A Number column refuses letters in the bid sheet",
     build_event("QA_Platform RFQ Freight per unit") + [v_login(VA), "Open the event", "Type \"five\" in Freight per unit"],
     "Letters are not taken (or a clear message). 5 is taken.", pre=EVT_PRE, priority="Medium", ttype="Negative", **VENDOR)
case("TRQ-EVT", M, "Dropdown column", "A Dropdown column shows its data source's options to the vendor",
     build_event("QA_Platform RFQ DD") + [v_login(VA), "Open the event", "Open the Brand dropdown"],
     "The options of the chosen data source are listed and one can be picked and saved.", pre=EVT_PRE, priority="Medium",
     **VENDOR)
case("TRQ-EVT", M, "Global field", "A Global Sheet field is asked once per quote, not per line",
     build_event("QA_Platform RFQ GrossFreight", lines=((P1, 10), (P2, 50))) + [v_login(VA), "Open the event"],
     "\"Freight (lump sum)\" appears once (below or beside the sheet), not on each of the two lines.", pre=EVT_PRE,
     priority="High", **VENDOR)
case("TRQ-EVT", M, "Template without Product", "An event from a template that has no Product field",
     create_with("QA_Platform RFQ NoProduct"),
     "Expected: the template should never have saved (module 5). If it did, record what Create Event does — no way to "
     "pick products, an error, or a blank sheet. Any of these is a Critical bug.", pre=EVT_PRE, priority="Critical",
     ttype="Negative", **BUYER)
case("TRQ-EVT", M, "Units", "Unit shown for a product sold in pieces",
     create_with("QA_Platform RFQ Standard") + [f"Pick \"{P1}\" (unit Nos) in row 1"],
     "Expected: quantities show the product's unit (Nos), not the template's fixed \"KG\". Record what shows.",
     pre=EVT_PRE, priority="Medium", ttype="Edge", **BUYER)
case("TRQ-EVT", M, "Excel upload", "The Excel sheet for bulk lines includes the template's columns",
     create_with("QA_Platform RFQ Make / Brand") + ["Use the sheet's Excel download / upload option, if offered"],
     "The downloaded sheet has the template's buyer columns; uploading it fills the lines. Record what happens.",
     pre=EVT_PRE, priority="Low", ttype="Edge", **BUYER)

# ═════════════════════ 13. Calculations in the bid sheet ═════════════════════
M = "13. Calculations in the bid sheet (formulas with real numbers)"
CALC_PRE = EVT_PRE + " A live RFQ made from the named template with the lines shown in Test Data."
calc = [
    ("Total Amount = Price × Quantity Available", "QA_Platform RFQ Standard", "Price 90, Quantity Available 10",
     "Total Amount = 90 × 10 = 900.00; Gross Total = 900.00.", "Critical"),
    ("Vendor offers less than asked", "QA_Platform RFQ Standard", "Quantity Requested 10; vendor Price 90, Quantity Available 8",
     "Total Amount = 90 × 8 = 720.00 (it uses the vendor's quantity, not the buyer's 10).", "High"),
    ("Decimals and rounding", "QA_Platform RFQ Standard", "Price 33.333, Quantity Available 3",
     "Total Amount shows 100.00 (99.999 rounded to 2 decimals). Record whether Gross Total uses 99.999 or 100.00 and that "
     "both screens agree.", "High"),
    ("Two lines add up in Gross Total", "QA_Platform RFQ Standard",
     f"Line 1 {P1}: Price 90 × 10; Line 2 {P2}: Price 12.50 × 50",
     "Line totals 900.00 and 625.00; Gross Total = 1,525.00.", "Critical"),
    ("Big numbers", "QA_Platform RFQ Standard", "Price 9,99,99,999, Quantity Available 1,000",
     "Total Amount = 9,99,99,99,9000 → 99,99,99,99,000.00 shown in full, with Indian grouping and no 1e+ notation.", "Medium"),
    ("Zero and negative price", "QA_Platform RFQ Standard", "Price 0, then Price -5",
     "Record. Expected: 0 is refused or warned; -5 is refused (a negative price is never valid in a buy event).", "High"),
    ("Your own line formula", "QA_Platform RFQ GST Amount", "Price 90, Quantity Available 10 (GST Amount = {Total Amount} * 18 / 100)",
     "Total Amount 900.00; GST Amount = 900 × 18 / 100 = 162.00.", "High"),
    ("Gross Total with lump-sum freight", "QA_Platform RFQ GrossFreight",
     "Line 1 Price 90 × 10; Freight (lump sum) 500",
     "Total Amount 900.00; Gross Total = SUM(900) + 500 = 1,400.00.", "High"),
    ("IF formula — above, on and below the limit", "QA_Platform RFQ IF",
     "Volume Discount = IF({Price}>100,{Price}*0.1,0). Try Price 120, then 100, then 80",
     "120 → 12.00; 100 → 0.00 (100 is not more than 100); 80 → 0.00.", "High"),
    ("Landed price ranking field", "QA_Platform RFQ RankLanded", "Price 90, Freight per unit 5",
     "Landed Price = 90 + 5 = 95.00.", "High"),
    ("Divide by zero", "QA_Platform RFQ Div0", "Price 90",
     "Record what Bad Ratio shows (should be a clean blank or a message, never Infinity / NaN / an error that blocks "
     "Submit).", "Medium"),
    ("Circular formula", "QA_Platform RFQ Circle", "Price 90, Quantity Available 10",
     "Record. The sheet must not freeze or show an error that blocks Submit; if the template saved at all, this is the "
     "proof for the circular-formula bug.", "High"),
    ("Global formula without SUM", "QA_Platform RFQ GlobalNoSum", "Two lines: Price 90 and Price 40",
     "Record what Odd Total ({Price}*2) shows — 180? 80? 260? Any value here is a guess; the template should not have saved.",
     "Medium"),
    ("Revised bid recalculates", "QA_Platform RFQ Standard", "First Price 90 × 10, then revise to 85",
     "After the revision Total Amount = 850.00 and Gross Total = 850.00 on both the vendor's and the buyer's screens.",
     "High"),
]
for title, tpl, data, exp, pr in calc:
    case("TRQ-CAL", M, "Calculation", title, bid(VA, data) + [B_LOGIN, "Open the event and look at Vendor A's response"],
         exp + " The buyer sees the same numbers as the vendor.", pre=CALC_PRE.replace("named template", f"\"{tpl}\" template"),
         data=data, priority=pr, role="Vendor + Buyer", portal="Vendor + Buyer portal",
         ttype="Negative" if "negative" in title.lower() or "zero" in title.lower() else "Positive")

# ═════════════════════ 14. Ranking in the event ═════════════════════
M = "14. Ranking in the event (who is L1)"
RANK_PRE = EVT_PRE + " A live event made from the named template; Vendor A and Vendor B are invited."
Q = "Quantity Available"
rank = [
    ("Buy, ranked by Total Amount", "QA_Platform RFQ Standard", "RFQ",
     f"Price 90, {Q} 10 (total 900)", f"Price 85, {Q} 10 (total 850)",
     "B is L1 (850), A is L2 (900) — the lowest total wins in a buy event.", "Critical"),
    ("Different quantities — ranked by Total Amount", "QA_Platform RFQ Standard", "RFQ",
     f"Price 90, {Q} 10 (total 900)", f"Price 85, {Q} 12 (total 1,020)",
     "A is L1 (900 < 1,020) even though B's unit price is lower.", "High"),
    ("Different quantities — ranked by Price", "QA_Platform RFQ RankPrice", "RFQ",
     f"Price 90, {Q} 10 (total 900)", f"Price 85, {Q} 12 (total 1,020)",
     "B is L1 (85 < 90) — this template ranks lines by Price, so the higher total does not matter.", "High"),
    ("Sell (forward auction) — the highest wins", "QA_Platform RFQ Sell", "Auction",
     f"Price 90, {Q} 10 (total 900)", f"Price 85, {Q} 10 (total 850)",
     "A is L1 (900) — the highest wins in a sell event.", "Critical"),
    ("Tie", "QA_Platform RFQ Standard", "RFQ",
     f"Price 90, {Q} 10 (total 900) — A bids first", f"Price 90, {Q} 10 (total 900) — B bids a minute later",
     "Record who is L1. Expected: the earlier bid (A) is L1 and B is L2 (or both share L1) — the rule must be the same on "
     "every screen.", "Medium"),
    ("Lot ranking by Gross Total", "QA_Platform RFQ Standard", "Auction",
     f"{P1}: 90 × 10 = 900; {P2}: 12.50 × 50 = 625 (lot 1,525)", f"{P1}: 85 × 10 = 850; {P2}: 14 × 50 = 700 (lot 1,550)",
     "On the lot A is L1 (1,525 < 1,550), although B is L1 on line 1 and A on line 2.", "High"),
    ("Lot ranking by your own Global formula", "QA_Platform RFQ RankLot", "Auction",
     f"{P1}: 90 × 10 = 900; Freight (lump sum) 500 (Grand Total 1,400)",
     f"{P1}: 85 × 10 = 850; Freight (lump sum) 700 (Grand Total 1,550)",
     "A is L1 on the lot (1,400 < 1,550) — ranking used Grand Total, not Gross Total (B's Gross Total 850 is lower).",
     "High"),
    ("Line ranking by Landed Price", "QA_Platform RFQ RankLanded", "RFQ",
     f"Price 90, Freight per unit 10, {Q} 10 (Landed Price 100)", f"Price 95, Freight per unit 0, {Q} 10 (Landed Price 95)",
     "B is L1 (95 < 100) although A's price is lower.", "High"),
    ("Ranked by Product (should not be possible)", "QA_Platform RFQ RankProduct", "RFQ",
     f"Price 90, {Q} 10", f"Price 85, {Q} 10",
     "Record who is L1 and what the rank column shows. Any outcome confirms the bug that Product was offered as a "
     "ranking field.", "High"),
    ("Ranked by a deleted field", "QA_Platform RFQ RankGhost", "RFQ",
     f"Price 90, {Q} 10 (total 900)", f"Price 95, {Q} 8 (total 760)",
     "Record. When the ranking field is missing the server ranks lines by Price, so A is likely L1 (90 < 95) even though "
     "B's total is lower — a silent change from what the builder showed.", "High"),
    ("Ranked by Quantity Available", "QA_Platform RFQ Standard (with RANK LINES BY changed to Quantity Available)", "RFQ",
     f"Price 90, {Q} 10", f"Price 85, {Q} 8",
     "Record. Expected that this option does not exist; if it does, B (8) may become L1 for offering LESS — wrong for a "
     "buyer.", "Medium"),
]
for title, tpl, kind, a, b, exp, pr in rank:
    steps = bid(VA, a) + bid(VB, b) + [
        B_LOGIN, "Open the event and look at the ranks (the L1 / L2 tags in the responses or the live auction view)"]
    case("TRQ-LIV", M, f"Ranking — {kind}", title, steps, exp,
         pre=RANK_PRE.replace("named template", f"\"{tpl}\" template") + f" Event type: {kind}.",
         data=f"Vendor A: {a}\nVendor B: {b}", priority=pr, role="Vendor + Buyer", portal="Vendor + Buyer portal",
         ttype="Negative" if "should not" in title or "deleted" in title or "Quantity Available" in title else "Positive")
case("TRQ-LIV", M, "Ranking — after revision", "Ranks change when a vendor revises",
     ["Continue the first ranking case (B is L1 at 850)", v_login(VA), "Revise A's Price to 80 (total 800)", B_LOGIN,
      "Refresh the event"],
     "A becomes L1 (800), B L2 (850) on the buyer's screen and on both vendors' screens (if ranks are shown to vendors).",
     pre=RANK_PRE, priority="High", role="Vendor + Buyer", portal="Vendor + Buyer portal")
case("TRQ-LIV", M, "Ranking — comparison", "Master QCS and the award screen rank the same way as the event",
     [B_LOGIN, "After bidding closes open the event, click \"Master QCS\" and then \"Start Awarding\""],
     "The L1 vendor and the totals in Master QCS and in the awarding proposal match what the ranking cases showed "
     "(e.g. B L1 at 850). The awarding report uses the template's line ranking field.",
     pre=RANK_PRE + " Bidding has closed.", priority="High", **BUYER)

# ═════════════════════ 15. Using the PO template ═════════════════════
M = "15. Using the Purchase Order template"
PO_PRE = ("PROCOL DEMO already has a standard PO template. Do NOT create PO templates on a company that has none "
          "(e.g. GMMCO LIMITED) — see the next case.")
case("TPO-USE", M, "Which PO template is used", "The PO form after an award shows the fields of the new PO template",
     ["Build \"QA_Platform PO Basic\" (TPO-ADD Save case)", B_LOGIN,
      "Award a closed RFQ to Vendor A (Master QCS → Start Awarding → Create Proposal → Submit Proposal)",
      "Open the PO step for Vendor A"],
     "Expected by the team: the PO form shows Buyer Reference* and Expected Delivery as header fields and Discount % / Tax "
     "Code per line. Watch out: the server picks the company's STANDARD PO template (or the one linked to the event's "
     "template), and templates made in Manage Templates are saved as non-standard — so the new fields may not appear at "
     "all. Record which fields show; if none of the new ones, raise it to product (\"PO templates from Manage Templates "
     "are never used\").", pre=PO_PRE + " A closed RFQ on PROCOL DEMO with bids from Vendor A.", priority="Critical",
     role="Admin + Buyer", portal="Admin console + Buyer portal")
case("TPO-USE", M, "Company with no PO template", "Creating a PO template on a company that had none must not break awarding",
     ["Only on a test company that has NO PO template and whose awards can be broken safely — never on GMMCO LIMITED or "
      "another client", "Award a closed RFQ and open the PO step (before the template exists)",
      "Build any PO template in Manage Templates", "Award another closed RFQ and open its PO step"],
     "Before: the PO step is skipped or works as the company is used to. After: it must still work. Watch out: once ANY PO "
     "template exists, the server expects PO forms and answers \"Please award for at least one Vendor\" when the new "
     "template is not used. If you see that, it is a Critical bug — and delete the template at once.",
     pre="A disposable test company with no PO template (ask the team which one).", priority="Critical", ttype="Negative",
     role="Admin + Buyer", portal="Admin console + Buyer portal",
     note="GMMCO LIMITED (seen in the screenshots) has no PO template today — do not build one there.")
case("TPO-USE", M, "Required header field", "A required header field must be filled before the PO is raised",
     ["In the PO form of an award (see the first case) leave \"Buyer Reference\" empty and submit"],
     "Refused, with Buyer Reference marked as required. Filled in, the PO is raised and shows the value.",
     pre="The first case showed the new fields in the PO form.", priority="High", ttype="Negative", **BUYER)
case("TPO-USE", M, "Line fields", "Line-item fields are asked once per PO line",
     ["In a PO with two lines fill Discount % = 5 on line 1 and 0 on line 2"],
     "Each line keeps its own value; the PO view and its PDF show both.", pre="Same as above.", priority="High", **BUYER)
case("TPO-USE", M, "Integrations", "The integration field list shows the new PO template's fields",
     [B_LOGIN, "Open the integration (ERP) field-mapping screen that lists PO fields, if the company uses one"],
     "Record: the list is taken from the most recently changed PO template, so a test template can change what the ERP "
     "mapping offers. Delete test PO templates straight after testing.", pre=PO_PRE, priority="Medium", ttype="Edge",
     **BUYER)
case("TPO-USE", M, "PR to PO", "PR → PO preview uses the PO template's fields",
     [B_LOGIN, "From an approved PR with a contract, start \"Create PO\" and open the preview"],
     "Record which header and line fields the preview shows and whether they come from the new template.",
     pre=PO_PRE + " A PR linked to a contract.", priority="Medium", ttype="Edge", **BUYER)
case("TPO-USE", M, "Clean up", "Deleting the test PO template brings the PO step back to normal",
     START + ["Delete every \"QA_Platform PO …\" template", B_LOGIN, "Open a PO step again"],
     "The PO step behaves as before the test.", priority="High", role="Admin + Buyer",
     portal="Admin console + Buyer portal")

# ═════════════════════ 16. Who can do what ═════════════════════
M = "16. Who can do what"
case("TPL-ACC", M, "Read only", "A user who may only view templates cannot create, change or delete",
     ["Log in to the console as a user with view-only template rights", OPEN, "Try \"+ New Template\", the pencil and the bin"],
     "Expected: the buttons are hidden or clearly refused. Record whether they show and fail only after clicking (a "
     "red \"not allowed\" message after work is done is a usability bug).", priority="High", ttype="Negative",
     role="Viewer")
case("TPL-ACC", M, "Company switch", "Templates belong to the company picked at the top",
     START + ["Note the templates listed", "Switch the company box to another test company", "Look at the list"],
     "The list changes to that company's templates. A template made while PROCOL DEMO was picked never shows under another "
     "company.", priority="High")
case("TPL-ACC", M, "Company switch", "Switching company while the builder is open",
     NEW_PO + add("Text") + [label("Note"), "Switch the company box to another company", name("QA_Platform PO Switch"), SAVE],
     "Record which company the template lands in. Expected: the builder warns or reloads; a template silently created in "
     "the other company is a bug. Delete it afterwards.", priority="Medium", ttype="Edge")

# ═════════════════════ 17. Every button, once ═════════════════════
M = "17. Every button and box, once"
buttons = [
    ("List page", ["+ New Template", "Search templates (type, x)", "All types filter", "Template row", "Pencil", "Bin → Yes / No", "Page numbers"]),
    ("Type picker", ["Vendor Onboarding — Buyer Form card", "Purchase Order card", "RFQ / Auction (Event) card",
                     "Vendor Onboarding card", "Generate with AI", "X"]),
    ("Builder header", ["Manage Templates breadcrumb", "Type tag (not clickable)", "Name box", "Cancel", "Save / Update"]),
    ("Builder body", ["Build", "Preview", "Each left-rail tile", "Clicking each box", "Card click", "≡ drag handle", "Card bin"]),
    ("Field settings", ["Label", "Key", "Type", "Required switch", "Data source list (search, x)", "Address box", "Formula box with { list"]),
    ("RFQ top bar", ["ORDER TYPE", "RANK LINES BY", "RANK LOTS BY"]),
    ("Preview", ["Every input", "+ Add line item", "Submit"]),
]
for where, items in buttons:
    case("TPL-BTN", M, where, f"{where}: every control responds and does only what its name says",
         START + ([NEW] if where == "Type picker" else []) + (NEW_PO[2:] if where in ("Builder header", "Builder body", "Field settings", "Preview") else []) +
         (NEW_RFQ[2:] if where == "RFQ top bar" else []) +
         [f"Use each in turn: {', '.join(items)}", "Tab through the page with the keyboard"],
         "Each control does what its label says, shows a pointer on hover, and can be reached with Tab. Nothing errors in the "
         "page. Note any control that does nothing or does something else.", priority="Medium")
case("TPL-BTN", M, "Small screen", "The builder on a laptop screen and a narrow window",
     NEW_RFQ + ["Make the browser window 1280 px wide, then 1024 px"],
     "The three panes (rail, sheets, settings) stay usable; nothing overlaps; long names wrap. Record anything cut off.",
     priority="Low", ttype="Edge")


# ── rules behind the cases (plain words) ──────────────────────────────────────────────────────
RULES = [
    ("Where the fields go", "PO: Header Fields are asked once per PO; Line Item Fields once per PO line. RFQ / Auction: "
     "Quote Sheet fields are columns of the bid sheet (one value per line); Global Sheet fields are asked once per quote."),
    ("Standard RFQ fields", "Product, Quantity Requested, Delivery location (filled by the buyer) and Quantity Available, "
     "Price (filled by the vendor), Total Amount = Price × Quantity Available, Gross Total = SUM of Total Amount. They are "
     "marked \"not removable\", but the builder shows a bin on them anyway."),
    ("Keys", "Every field has a key used by formulas, reports and integrations. For new fields it is made from the label + "
     "\"_custom\" (\"Freight Charges\" → freight_charges_custom) while the key is still empty. Standard fields' keys are fixed."),
    ("Duplicate keys", "PO: keys must be unique across the whole template. RFQ: the page checks each sheet on its own; the "
     "server then refuses the same key across sheets with \"Duplicate columns: X and Y\"."),
    ("Formulas", "Written with {Field Name}; stored with keys. Only numbers, quantities, formulas (and dropdowns) can be used. "
     "The page flags unknown fields and unbalanced brackets but does not stop Save; the server refuses empty formulas, "
     "unknown keys, text fields and a formula that uses itself (\"Invalid Formula for X\"). It does NOT refuse two formulas "
     "that use each other, division by zero, or a Global formula using a line field without SUM."),
    ("Ranking", "RANK LINES BY decides L1 per line, RANK LOTS BY per lot. Buy: lowest wins; Sell: highest wins. The old "
     "builder offered only price/amount fields; the new one offers every field. If the ranking field is missing, events rank "
     "lines by Price."),
    ("Saving rules", "Name required; at least one field; every field needs a name and a key; names unique per type and order "
     "type (letter case not compared). PO templates have no further server checks."),
    ("Updating", "Update replaces the template's settings with the ranking settings only, and its Terms & Conditions with an "
     "empty list (the builder sends nothing else) — test on copies."),
    ("PO templates in use", "After an award the PO form uses the company's standard PO template (or the one linked to the "
     "event's template). New templates from Manage Templates are saved as non-standard. If a company has any PO template, the "
     "PO step expects PO forms."),
]

# ── found while writing (API check 30 Oct + code) ─────────────────────────────────────────────
FOUND = [
    ("Critical", "RFQ / Auction: every added field is refused", "The builder never sends the setting the server requires on "
     "added fields; the server answers \"Invalid Custom Widget\". Only the standard fields can be saved.",
     "API check 30 Oct: Text in Quote Sheet → 422 Invalid Custom Widget; Number in Global Sheet → same; with the setting "
     "added → saved.", "TRQ-ADD-001…008"),
    ("High", "RFQ / Auction: dropdowns are refused", "The server wants a data-source name the builder has no box for.",
     "API check: → 422 \"Please provide data source for Brand\".", "TPL-DRP-006"),
    ("Critical", "Updating an old RFQ template wipes its Terms & Conditions and other settings",
     "On Update the builder sends an empty T&C list and only the two ranking settings; the server replaces both.",
     "Code: tradePayload.js (terms_and_conditions: {clauses: [], attachments: []}); Templates::UpdateService.",
     "TPL-EDT-001, 002"),
    ("Critical", "A PO template on a company that had none can break the PO step",
     "Award → PO step answers \"Please award for at least one Vendor\" once any PO template exists but none is used.",
     "Code: sheets_controller schema (po view), Template.get_po_template uses standard templates only. GMMCO LIMITED has no "
     "PO template today (DB, 30 Oct).", "TPO-USE-002"),
    ("High", "PO templates from Manage Templates may never be used", "The award PO form uses the standard PO template only.",
     "Code: Template.get_po_template (.default.last); new templates are saved as custom.", "TPO-USE-001"),
    ("High", "Standard RFQ fields can be deleted, retyped and made optional",
     "The bin shows on every card; Type and Required are editable on standard fields.",
     "Screenshot (bin on Quantity Requested); API check saved a template with no Product and with Product as Text.",
     "TRQ-DEF-002…011"),
    ("High", "RANK LINES BY offers Product, Location and quantities", "The old builder offered only price/amount fields.",
     "Screenshot of the RANK LINES BY list; API check saved ranking by Product and by a key that does not exist.",
     "TRQ-RNK-004, 005, 008"),
    ("High", "Key may stop at the first letter", "The key is filled only while empty, so typing letter by letter may leave "
     "\"f_custom\".", "Code: FieldConfigPanel handleNameChange. Needs a keyboard check.", "TPL-FLD-001, 003"),
    ("Medium", "Formulas that should be refused are saved", "Circular formulas, divide by zero, Global formula without SUM.",
     "API check: all three saved.", "TRQ-FML-009, 011, 020"),
    ("Medium", "Formula errors do not stop Save on the page", "The red text shows, but Save still sends the request.",
     "Code: rfq.entry.js validate has no formula check; server answers \"Invalid Formula for X\".", "TRQ-FML-006"),
    ("Medium", "PO templates have no server checks", "Blank keys, duplicate keys, empty templates and broken formulas all save "
     "through the API.", "API check P02–P05: all saved.", "TPL-FLD-006, TPL-DRP-004"),
    ("Low", "Names: case-only duplicates and 300-character names are accepted", "", "API check T18, T24 saved.",
     "TPL-SAV-006, 009"),
    ("Low", "Fields column counts only Global / Header fields", "", "Code: TemplateList summarize.", "TPL-LST-008"),
]

# ── write the workbook ───────────────────────────────────────────────────────────────────────
WIDTH = {"Test Case ID": 13, "Module": 22, "Scenario": 20, "Test Case Title": 40, "User Role": 14, "Portal": 18,
         "Pre-conditions": 36, "Configs Needed": 24, "Test Data": 26, "Test Steps": 70, "Expected Result": 64,
         "Priority": 10, "Test Type": 11, "Status": 10, "Notes for the tester": 34}
HEAD = PatternFill("solid", fgColor="1F3A5F")
MOD = PatternFill("solid", fgColor="E8EEF6")
PRI = {"Critical": "C0392B", "High": "D35400", "Medium": "B7950B", "Low": "5D6D7E"}
thin = Side(style="thin", color="C9D3DF")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Test Cases"
ws.append(COLS)
for i, c in enumerate(COLS, 1):
    cell = ws.cell(row=1, column=i)
    cell.font = Font(bold=True, color="FFFFFF")
    cell.fill = HEAD
    cell.alignment = Alignment(wrap_text=True, vertical="center")
    ws.column_dimensions[get_column_letter(i)].width = WIDTH[c]
for c in CASES:
    ws.append([c[k] for k in COLS])
    r = ws.max_row
    for i in range(1, len(COLS) + 1):
        cell = ws.cell(row=r, column=i)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
        cell.border = BOX
    ws.cell(row=r, column=COLS.index("Priority") + 1).font = Font(bold=True, color=PRI[c["Priority"]])
    ws.cell(row=r, column=1).fill = MOD
ws.freeze_panes = "E2"
ws.auto_filter.ref = f"A1:{get_column_letter(len(COLS))}{ws.max_row}"

s = wb.create_sheet("Summary")
s.append(["Module", "Cases", "Critical", "High", "Medium", "Low", "Positive", "Negative", "Edge"])
mods = OrderedDict()
for c in CASES:
    mods.setdefault(c["Module"], []).append(c)
for m, cs in mods.items():
    s.append([m, len(cs)] + [sum(1 for c in cs if c["Priority"] == p) for p in ("Critical", "High", "Medium", "Low")]
             + [sum(1 for c in cs if c["Test Type"] == t) for t in ("Positive", "Negative", "Edge")])
s.append(["Total", len(CASES)] + [sum(1 for c in CASES if c["Priority"] == p) for p in ("Critical", "High", "Medium", "Low")]
         + [sum(1 for c in CASES if c["Test Type"] == t) for t in ("Positive", "Negative", "Edge")])
for i in range(1, 10):
    s.cell(row=1, column=i).font = Font(bold=True, color="FFFFFF")
    s.cell(row=1, column=i).fill = HEAD
    s.column_dimensions[get_column_letter(i)].width = 12 if i > 1 else 58
s.cell(row=s.max_row, column=1).font = Font(bold=True)

r = wb.create_sheet("Found while writing")
r.append(["Severity", "What", "Why", "Evidence", "Cases that check it"])
for f in FOUND:
    r.append(list(f))
for i, w in enumerate([10, 46, 60, 60, 24], 1):
    r.column_dimensions[get_column_letter(i)].width = w
    r.cell(row=1, column=i).font = Font(bold=True, color="FFFFFF")
    r.cell(row=1, column=i).fill = HEAD
for row in r.iter_rows(min_row=2):
    for cell in row:
        cell.alignment = Alignment(wrap_text=True, vertical="top")
    row[0].font = Font(bold=True, color=PRI[row[0].value])

ru = wb.create_sheet("Rules behind the cases")
ru.append(["Topic", "Rule (in plain words)"])
for t in RULES:
    ru.append(list(t))
ru.column_dimensions["A"].width = 26
ru.column_dimensions["B"].width = 120
for i in (1, 2):
    ru.cell(row=1, column=i).font = Font(bold=True, color="FFFFFF")
    ru.cell(row=1, column=i).fill = HEAD
for row in ru.iter_rows(min_row=2):
    for cell in row:
        cell.alignment = Alignment(wrap_text=True, vertical="top")

sf = wb.create_sheet("Test safely")
for line in [
    "1. Test on PROCOL DEMO. Name every template \"QA_Platform …\" and delete them when you finish.",
    "2. Never press Update on a template other people use — copy it first (module 11). Updating can wipe Terms & Conditions.",
    "3. Do not build PO templates on a company that has none (e.g. GMMCO LIMITED): it can break that company's PO step after award.",
    "4. Use only the QA test vendors (QA_Platform names, @example.com e-mails) in events.",
    "5. A new PO template may change the fields an ERP integration offers — delete it straight after testing.",
    "6. When a case says \"Watch out\", a problem is already suspected (from the code or the 30 Oct API check). Report what you see either way.",
    "7. When a case says \"Record\", the product rule is not settled: write down exactly what happens and raise it to product.",
]:
    sf.append([line])
sf.column_dimensions["A"].width = 140
wb.save(OUT_XLSX)

OUT_DIR.mkdir(exist_ok=True)
(OUT_DIR / "data.json").write_text(json.dumps({"cases": CASES, "rules": RULES, "found": FOUND,
                                               "modules": list(mods.keys())}, ensure_ascii=False, indent=1))
print(f"{len(CASES)} cases in {len(mods)} modules → {OUT_XLSX.name}")
for m, cs in mods.items():
    print(f"  {len(cs):3d}  {m}")
print("priority", Counter(c["Priority"] for c in CASES))
print("type", Counter(c["Test Type"] for c in CASES))
