#!/usr/bin/env python3
"""Real bugs from the last three months (HubSpot / RCA triage, 1 Jul – 30 Sep 2026) written as
test cases the platform can run today.

Only tickets whose symptom the existing automation can reach were kept: the events vocabulary
(create → publish → bid → award → PO, the vendor portal, Master QCS, settings menu, counter offers,
RFQ→auction conversion) and the API runner. Intake, PR, approvals-matrix, Dutch/knockout, SAP and
onboarding tickets are out of scope on purpose — nothing extra was built for them.

Each case names the ticket it comes from in the Reference column (the id only; the ticket text
stays in the RCA workbook, which is not committed). The expected result is what the fix promises,
so a Pass means "fixed and still fixed on UAT", a Fail means "the bug is back (or never left UAT)".

Columns are the team's 14 house columns plus Reference. Run it on PROCOL DEMO (198678) from #/sheets.

Output: RCA_Real_Bugs_Jul-Sep_2026.xlsx
"""
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HERE = Path(__file__).resolve().parent
OUT = HERE / "RCA_Real_Bugs_Jul-Sep_2026.xlsx"

COLS = ["Test Case ID", "Module", "Scenario", "Test Case Title", "User Role", "Portal", "Pre-conditions", "Configs Needed",
        "Test Data", "Test Steps", "Expected Result", "Priority", "Test Type", "Reference", "Status"]

LIVE = "A live RFQ published with QA vendors invited and no bid yet."
BID = "A live RFQ with a vendor's bid."
CLOSED = "A closed RFQ with a vendor's bid, not awarded."
GIVEN = "The built event has one line item; its quantity and the existing bid's price are whatever the set-up made — read them on screen, do not assume numbers."
AWARDED = "An awarded RFQ whose proposal went into approval."
TECH = "A live eRFX project with a Technical stage and an RFQ stage, QA vendors invited."
CONVERTED = "An RFQ already converted to an auction: the vendor bid 100 per unit in the RFQ, the auction is live and the vendor has bid in it."
LOGIN = 'Log in to Procol (buyer side) with the buyer user'
CREATE = 'From the left menu click "Events" and click the blue "Create Event"'

LOCK = 'lock_vendors_addition_in_event_creation = Off — with it On the create screen greys out Invite Vendor and Publish (seen live on PROCOL DEMO)'

SINGLE = [LOGIN, CREATE, 'Open the single-stage create screen (RFQ)', 'Pick the template and add 1 line item with quantity 10', 'Invite 1 vendor', 'Set the schedule and publish the event']
SINGLE2 = [LOGIN, CREATE, 'Open the single-stage create screen (RFQ)', 'Pick the template and add 1 line item with quantity 10', 'Invite 2 vendors', 'Set the schedule and publish the event']

cases = []


def case(id_, module, scenario, title, role, portal, pre, configs, data, steps, expected, priority, ttype, ref):
    cases.append(dict(zip(COLS, [id_, module, scenario, title, role, portal, pre, configs, data,
                                 "\n".join(f"{i + 1}. {s}" for i, s in enumerate(steps)), expected, priority, ttype, ref, "Not Run"])))


# ── 1. Event creation ─────────────────────────────────────────────────────────────────────────
case("RCA-CRT-001", "1. Event creation", "Stage titles on a new project",
     "The Technical stage of a new project is not titled \"Reverse Auction\"",
     "Buyer", "Buyer portal", "The buyer can create events.", "lock_vendors_addition_in_event_creation = Off — with it On the create screen greys out Invite Vendor and Publish (seen live on PROCOL DEMO)", "A Technical + RFQ project.",
     [LOGIN, CREATE, 'Choose Technical + RFQ as the stages and create the project', 'Open the Technical stage tab',
      'Read the stage title shown at the top of the stage', 'Open the RFQ stage tab and read its title too'],
     'The Technical stage title is a technical name (e.g. "Technical Stage" / "RFP"), not "Reverse Auction". The RFQ stage title is not "Reverse Auction" either. No stage carries the name of an auction on a project that has no auction stage.',
     "High", "Regression", "HubSpot 320195064528 (Jul 2026): technical stage title defaulted to \"Reverse Auction\" on Create Project")

case("RCA-CRT-002", "1. Event creation", "Default event type",
     "A new single-stage event opens with the company's default event type (RFQ), not an auction",
     "Buyer", "Buyer portal", "The buyer can create events. The company's default event type is RFQ.",
     "default_event_type = rfq — the create screen must open with this type selected (PROCOL DEMO's own override is rfi, switched for this case and back)", "Single-stage event, no PR.",
     [LOGIN, CREATE, 'Open the single-stage create screen', 'Open the configuration drawer (event type and awarding) and change nothing',
      'Check the event type field already reads RFQ'],
     'The event type field in the configuration drawer already reads RFQ (the company default), not Reverse Auction. The buyer did not change it.',
     "Critical", "Regression", "HubSpot 314947164913 / 325227829962 (Jul 2026): events defaulted to RA although default_event_type was RFQ")

case("RCA-CRT-003", "1. Event creation", "Vendors kept across stage tabs",
     "A vendor added on the RFQ stage is still there after visiting the Technical stage",
     "Buyer", "Buyer portal", "The buyer can create events.", "lock_vendors_addition_in_event_creation = Off — with it On the create screen greys out Invite Vendor and Publish (seen live on PROCOL DEMO)", "A Technical + RFQ project, one QA vendor.",
     [LOGIN, CREATE, 'Choose Technical + RFQ as the stages and create the project', 'On the RFQ stage pick the pricing template and add 1 line item',
      'On the RFQ stage invite 1 vendor and note the vendor\'s name', 'Open the Technical stage tab', 'Come back to the RFQ stage tab',
      'Check the vendor\'s name is still shown in the RFQ stage\'s participants section'],
     'The vendor\'s name is still shown in the participants section of the RFQ stage (the text of the name is visible). Switching tabs did not clear the participants.',
     "Critical", "Regression", "HubSpot 333116804815 / 321136536264 / 326533481172 (Jul–Sep 2026): vendors added in the RFQ stage vanished after moving to the Technical stage (destroyinactivetabdata)")

case("RCA-CRT-004", "1. Event creation", "Audience after repeated edits",
     "Editing the Technical stage several times does not invite every vendor of the company",
     "Buyer", "Buyer portal", "The buyer can create events.", "lock_vendors_addition_in_event_creation = Off — with it On the create screen greys out Invite Vendor and Publish (seen live on PROCOL DEMO)", "A Technical + RFQ project, one QA vendor.",
     [LOGIN, CREATE, 'Choose Technical + RFQ as the stages and create the project', 'On the RFQ stage pick the pricing template, add 1 line item and invite 1 vendor',
      'Open the Technical stage tab and pick its template', 'Change the Technical stage template three times (pick another template, then another, then the first again)',
      'Set the schedule and publish the event', 'Open the Participants tab of the published event and count the vendors'],
     'The published event has exactly the 1 invited vendor as participant. The audience did not reset to "everyone" (thousands of vendors) after the repeated edits.',
     "Critical", "Regression", "HubSpot 331608780529 (Sep 2026): after 2–3 technical-stage edits the audience reverted to everyone and ~15k vendors were invited")

case("RCA-CRT-005", "1. Event creation", "Vendor assessment kept across stage tabs",
     "The evaluator set on the Technical stage is still there after visiting the RFQ stage",
     "Buyer", "Buyer portal", "The buyer can create events.", "lock_vendors_addition_in_event_creation = Off — with it On the create screen greys out Invite Vendor and Publish (seen live on PROCOL DEMO)", "A Technical + RFQ project.",
     [LOGIN, CREATE, 'Choose Technical + RFQ as the stages and create the project', 'On the Technical stage pick its template and assign an evaluator in the vendor assessment',
      'Note the evaluator\'s name', 'Open the RFQ stage tab', 'Come back to the Technical stage tab', 'Check the evaluator\'s name is still shown in the vendor assessment'],
     'The evaluator\'s name is still visible in the vendor assessment of the Technical stage (the text is shown). The set-up did not disappear when the buyer moved to RFQ and back.',
     "High", "Regression", "HubSpot 319645687507 (Jun 2026): Vendor Assessment configuration disappeared after moving to RFQ and back to Technical")

case("RCA-CRT-006", "1. Event creation", "Templates offered per stage",
     "The RFQ stage offers only pricing templates, never a technical (questionnaire) template",
     "Buyer", "Buyer portal", "The buyer can create events.", "lock_vendors_addition_in_event_creation = Off — with it On the create screen greys out Invite Vendor and Publish (seen live on PROCOL DEMO)", "A Technical + RFQ project.",
     [LOGIN, CREATE, 'Choose Technical + RFQ as the stages and create the project', 'On the RFQ stage open the template picker (Select Templates)',
      'Check the template menu: no option contains the word "Technical", "RFP" or "Questionnaire"'],
     'The template menu on the RFQ stage offers pricing templates only: no option in the menu contains "Technical", "RFP" or "Questionnaire".',
     "Medium", "Regression", "HubSpot 322237120193 (Jul 2026): technical-stage templates were visible in the RFQ stage")

case("RCA-CRT-007", "1. Event creation", "Currency display",
     "A currency is shown by its own code, not by another currency with the same symbol",
     "Buyer", "Buyer portal", "The buyer can create events. The event currency can be chosen on the create screen.", "lock_vendors_addition_in_event_creation = Off — with it On the create screen greys out Invite Vendor and Publish (seen live on PROCOL DEMO)",
     "Currency Philippine Peso (PHP).",
     [LOGIN, CREATE, 'Pick the single-stage event', 'Pick the template and add 1 line item', 'In the event currency field choose Philippine Peso (PHP)',
      'Read the currency shown on the line-item sheet and in the event header'],
     'The currency reads PHP (Philippine Peso) everywhere. "CUP" (Cuban Peso, same ₱ symbol) is not shown anywhere on the screen.',
     "Low", "Regression", "HubSpot 322196940492 (Jul 2026): base currency PHP displayed as CUP because the display used the symbol")

# ── 2. Publish and the event page ────────────────────────────────────────────────────────────
case("RCA-PUB-008", "2. Publish", "Auction stage after publish",
     "A published auction opens its stage page without a server error",
     "Buyer", "Buyer portal", "The buyer can create events.", "lock_vendors_addition_in_event_creation = Off — with it On the create screen greys out Invite Vendor and Publish (seen live on PROCOL DEMO)", "A single-stage rank auction, 1 line item, 1 QA vendor, 30-minute window.",
     [LOGIN, CREATE, 'Pick the single-stage event and set the event type to Auction (rank)', 'Pick the template, add 1 line item and invite 1 vendor',
      'Set the schedule and publish the event', 'Open the auction stage tab of the published event', 'Open the Overview tab'],
     'The event publishes. The auction stage page opens with its status (Upcoming or Live) and its end time shown; the Overview tab opens and shows the event title. The screen is clean: no error page and no server error.',
     "Critical", "Regression", "HubSpot 333437557450 (Sep 2026): internal server error on the auction stage right after publishing; auctions had to be withdrawn")

case("RCA-PUB-009", "2. Publish", "Bid masking off",
     "With bid masking off, bids are visible and the \"visible once the event duration is over\" message is absent",
     "Buyer", "Buyer portal", "The buyer can create events.",
     "enable_bid_masking_for_event = Off — masking must be off for this event; " + LOCK, "A single-stage RFQ, 1 line item, 1 QA vendor, surrogate bid 100.",
     [LOGIN, CREATE, 'Pick the single-stage event (RFQ)', 'Pick the template, add 1 line item and invite 1 vendor',
      'Set the schedule and publish the event', 'On the Participants tab enter a surrogate bid of 100 for the vendor', 'Open the Responses tab'],
     'The vendor\'s bid of 100 is visible on the Responses tab. The text "Bids of participated vendors will be visible once the event duration is over" is not shown.',
     "Medium", "Regression", "HubSpot 325223479016 (Jul 2026): masking disabled but the masking message still shown (template custom_configurations copied wrongly)")

case("RCA-BID-010", "3. Bidding", "Revised bid replaces the earlier one",
     "A vendor who bids twice has one active bid, the latest one, on Master QCS",
     "Buyer, Vendor A", "Buyer + Vendor portal", "The buyer can create events.", LOCK, "Single-stage RFQ, 1 line item quantity 10, 1 QA vendor. Vendor 1 bids 120 then 110 per unit.",
     SINGLE + ['As vendor 1, sign in to the vendor portal, open the event and submit a bid of 120 per unit',
      'As the same vendor 1, open the event again and submit a revised bid of 110 per unit',
      'Back on the buyer side, open Master QCS', 'Check the vendor appears once, at 110 per unit (1,100 for 10 units), rank 1'],
     'The vendor appears exactly once on Master QCS. The amount shown is the latest bid, 110 per unit (1,100 for 10 units), at rank 1. No second column with 120 remains.',
     "Critical", "Regression", "HubSpot 337866985159 / 318439224006 (Jul–Sep 2026): a vendor had two active bids (stale screen), ranking used one and the screen showed the other")

case("RCA-BID-011", "3. Bidding", "Surrogate bid then quote details",
     "After a surrogate bid, Responses and Master QCS open and the bid has a rank",
     "Buyer", "Buyer portal", LIVE, "None", "Surrogate bid of 100 per unit for the first vendor (the event has no bid before it).",
     [LOGIN, 'Open the event and open the Participants tab', 'Enter a surrogate bid of 100 per unit for the first vendor and submit it',
      'Open the Responses tab', 'Open Master QCS'],
     'The surrogate bid is accepted. The Responses tab opens with the bid of 100 shown; Master QCS opens and shows the vendor at rank 1. No "internal server error" and no broken page.',
     "Critical", "Regression", "HubSpot 330421282541 (Aug 2026): internal server error opening an RFQ because a surrogate-only score had no rank")

case("RCA-BID-012", "3. Bidding", "Closing time on the vendor portal",
     "The vendor portal shows the same closing time as the buyer's event",
     "Buyer, Vendor A", "Buyer + Vendor portal", "The buyer can create events.", LOCK, "Single-stage RFQ, 1 line item, 1 QA vendor, 60-minute window.",
     SINGLE + ['Open the Overview tab and remember the bidding end date and time as END',
      'As vendor 1, sign in to the vendor portal and open the event', 'Check the closing date and time shown to the vendor equals END'],
     'The vendor sees the same closing date and time as the buyer\'s Overview, to the minute. It is not hours earlier or later.',
     "High", "Regression", "HubSpot 332992152293 (Sep 2026): vendor timer ~3 h 48 min off because a stale clock offset was cached in the browser")

case("RCA-BID-013", "3. Bidding", "Vendor bid sheet columns",
     "The vendor's bid sheet shows the line item with its quantity and the price and tax columns",
     "Buyer, Vendor A", "Buyer + Vendor portal", "The buyer can create events.", LOCK, "Single-stage RFQ, 1 line item quantity 10, 1 QA vendor.",
     SINGLE + ['As vendor 1, sign in to the vendor portal and open the event', 'Check the bid sheet shows the line item with quantity 10, a price column and a GST / tax column'],
     'The vendor\'s bid sheet shows the line item with quantity 10, a price column and the GST / tax percentage column of the template. No column of the buyer\'s template is hidden from the vendor.',
     "Medium", "Regression", "HubSpot 214553542330 (Sep 2026): vendor could not see \"Line GST percentage\" in a non-multicurrency event (base currency null)")

case("RCA-EVT-014", "4. Event settings", "Extend the Technical stage",
     "Extending the Technical stage's submission time works on a Technical + RFQ project",
     "Buyer", "Buyer portal", TECH, "None", "Extend by 1 hour.",
     [LOGIN, 'Open the project and open the Technical stage', 'Note the Technical stage\'s submission end time',
      'From the stage\'s Settings choose Extend Submission Time and extend by 1 hour', 'Read the new submission end time'],
     'The extension is accepted without an error. The Technical stage\'s end time is exactly the old end time plus 1 hour.',
     "High", "Regression", "HubSpot 326982812387 (Aug 2026): extending the Technical stage failed because the check read the last-created RFQ's end time")

case("RCA-EVT-015", "4. Event settings", "Edit a live RFQ with no auction",
     "A published RFQ that was never converted can still be edited (new version)",
     "Buyer", "Buyer portal", LIVE, "None", "-",
     [LOGIN, 'Open the event', 'Open the Settings menu of the event', 'Choose the option to edit the event (Create New Version) and confirm'],
     'The Settings menu offers the edit / new-version option. Choosing it opens the event in edit mode. The app does not say "You cannot edit the RFQ once the Auction is created" — there is no auction.',
     "High", "Regression", "HubSpot 326555175666 (Aug 2026): \"You cannot edit the RFQ once the Auction is created\" shown although no auction existed")

case("RCA-EVT-016", "4. Event settings", "Order Activity after an extension",
     "Order Activity still lists the event's history after the submission time was extended",
     "Buyer", "Buyer portal", BID, "None", "Extend by 30 minutes.",
     [LOGIN, 'Open the event', 'From Settings choose Extend Submission Time and extend by 30 minutes',
      'Open the event\'s Order Activity (activity log) section'],
     'The extension is accepted. Order Activity is not blank: it lists the activity entries, including one for the time extension. No error is shown.',
     "High", "Regression", "HubSpot 333529488097 (Sep 2026): Order Activity blank after an approval-window extension (NoMethodError in the activity formatter)")

# ── 5. RFQ → auction conversion ─────────────────────────────────────────────────────────────
case("RCA-CNV-017", "5. Conversion", "Convert, then bid, then open the auction",
     "An RFQ converted before any bid, then bid on, opens its converted screen without crashing",
     "Buyer", "Buyer portal", LIVE, "None", "Surrogate bid of 100 per unit after the conversion.",
     [LOGIN, 'Open the event', 'From Settings choose Convert to Auction and continue to the converted event\'s screen',
      'Switch back to the original RFQ\'s tab, open Participants and enter a surrogate bid of 100 per unit for the first vendor',
      'Switch to the converted auction\'s tab again and check the screen is clean (no error page)'],
     'The converted auction\'s screen is still open and clean after the bid was added to the RFQ: no "Oops" page, no crash. The surrogate bid shows on the RFQ\'s Responses.',
     "High", "Regression", "HubSpot 330446017272 (Aug 2026): auction tab crashed because currency preferences were not re-synced when bids arrived after conversion")

case("RCA-CNV-018", "5. Conversion", "Master QCS after conversion",
     "Master QCS shows the auction's latest price after an RFQ-to-auction conversion",
     "Buyer, Vendor A", "Buyer + Vendor portal", CONVERTED, "None", "Vendor A bids 90 per unit in the auction.",
     ['As Vendor A, sign in to the vendor portal, open the live auction and place a bid of 90 per unit',
      LOGIN, 'Open the auction and open Master QCS', 'Read Vendor A\'s amount and rank'],
     'Master QCS shows Vendor A at the auction price, 90 per unit (900 for 10 units), at rank 1. It does not keep showing the RFQ-stage price of 100.',
     "Critical", "Regression", "HubSpot 336647711461 (Sep 2026): Master QCS kept the RFQ-stage value after conversion (lines matched by position, not id)")

# ── 6. Awarding ──────────────────────────────────────────────────────────────────────────────
case("RCA-AWD-019", "6. Awarding", "Select for awarding",
     "Select for awarding and Select All work on Master QCS",
     "Buyer", "Buyer portal", CLOSED, "None", "-",
     [LOGIN, 'Open the event and open Master QCS', 'Click Start Awarding', 'Select the line item for awarding to the vendor (Select for awarding / Select All)',
      'Read the counters at the top of the awarding screen'],
     'The selection works: "Tot. selected line items" reads 1/1 and "Awarded Vendors" reads 1/1. Create Proposal becomes available. No error from the server.',
     "Critical", "Regression", "HubSpot 325461702389 (Jul 2026, P0): \"Select for awarding\" and \"Select All\" did nothing on MQCS for any user")

case("RCA-AWD-020", "6. Awarding", "Total proposal value",
     "Total proposal value is 0 before any selection and equals the allocated amount after",
     "Buyer", "Buyer portal", CLOSED, "None", GIVEN,
     [LOGIN, 'Open the event and open Master QCS', 'Click Start Awarding', 'Before selecting anything, check "Tot. Proposal Value" reads ₹ 0',
      'Select the line item for awarding to the vendor', 'Check "Tot. Proposal Value" now equals the vendor\'s "Sum Total" shown on the same screen',
      'Untick the line item (deselect it) and check "Tot. Proposal Value" reads ₹ 0 again'],
     'Before any selection "Tot. Proposal Value" is ₹ 0. After selecting the line it equals the vendor\'s Sum Total shown on the awarding screen (the awarded quantity × price). After deselecting it is ₹ 0 again — nothing is left behind.',
     "Critical", "Regression", "HubSpot 336911220460 / 323861342966 / 320771298014 (Jul–Sep 2026): Total Proposal Value non-zero with nothing selected; select/deselect left GST behind; NFA value ₹0")

case("RCA-AWD-021", "6. Awarding", "Awarded quantity limits",
     "Awarding the requested quantity is accepted; more than requested is refused with a clear message",
     "Buyer", "Buyer portal", CLOSED, "None", GIVEN + " Requested quantity 10.",
     [LOGIN, 'Open the event and open Master QCS', 'Click Start Awarding', 'Select the line item for the vendor with the full requested quantity, 10',
      'Try to change the awarded quantity to 11'],
     'Awarding 10 (the requested quantity) is accepted: the counters read 1/1. Awarding 11 is refused with the message "You can\'t select bid for more than the requested quantity" (or the quantity field will not take it). 10 is never refused.',
     "High", "Regression", "HubSpot 321268075243 (Jul 2026): \"You can't select bid for more than the requested quantity\" shown although vendors had not exceeded it")

case("RCA-AWD-022", "6. Awarding", "Partial award, one PO per vendor",
     "Awarding two line items to two vendors creates one PO per vendor with its own quantity",
     "Buyer, Vendor A, Vendor B", "Buyer + Vendor portal", "The buyer can create events. The company has a PO template.", "lock_vendors_addition_in_event_creation = Off — with it On the create screen greys out Invite Vendor and Publish (seen live on PROCOL DEMO)",
     "Bolt quantity 100, Nut quantity 200. Vendor A bids 100 per unit, Vendor B bids 95 per unit.",
     [LOGIN, CREATE, 'Pick the single-stage event (RFQ) with awarding by line item (partial awarding to multiple vendors)',
      'Pick the template and add 2 line items: Bolt quantity 100 and Nut quantity 200', 'Invite 2 vendors', 'Set the schedule and publish the event',
      'As Vendor A, sign in to the vendor portal, open the event and bid 100 per unit on both lines',
      'As Vendor B, sign in to the vendor portal, open the event and bid 95 per unit on both lines',
      LOGIN, 'Open the event and close bidding', 'Open Master QCS, click Start Awarding, award Bolt to Vendor A and Nut to Vendor B, create the proposal and submit it',
      'Approve the award', 'Create the purchase orders', 'Open the purchase orders'],
     'Two purchase orders exist, one for Vendor A and one for Vendor B. Vendor A\'s PO carries only Bolt with quantity 100; Vendor B\'s PO carries only Nut with quantity 200. No PO carries both lines or the full quantity for one vendor.',
     "Critical", "Regression", "HubSpot 325498152647 / 3000057409 (Jul 2026): partial award to several vendors produced one PO for one vendor with the full quantity (awarded_quantity widget missing)")

# ── 7. Master QCS and sums ───────────────────────────────────────────────────────────────────
case("RCA-QCS-023", "7. Master QCS", "L1 after a lower second bid",
     "A lower surrogate bid for a second vendor becomes rank 1 on Master QCS",
     "Buyer", "Buyer portal", "The buyer can create events.", LOCK, "Single-stage RFQ, 1 line item quantity 10, 2 QA vendors. Surrogate bids: vendor 1 at 100, vendor 2 at 90 per unit.",
     SINGLE2 + ['Open the Participants tab and enter a surrogate bid of 100 per unit for the first vendor', 'Enter a surrogate bid of 90 per unit for the second vendor',
      'Open Master QCS', 'Check the ranks: the 90 bid is rank 1, the 100 bid is rank 2'],
     'The 90 bid is rank 1 and the 100 bid is rank 2. Both amounts are shown: 900 for the second vendor and 1,000 for the first.',
     "High", "Regression", "HubSpot 336280280786 (Sep 2026): savings calculated on L2 instead of L1 — the rank half of it")

case("RCA-QCS-023B", "7. Master QCS", "Savings follow L1",
     "With \"Use rank L1 for savings\" on, the savings figure on Master QCS is computed from the rank-1 price",
     "Buyer", "Buyer portal", BID, "use_rank_l1_for_savings = On — the fix for the ticket enabled this for the client", "Second vendor surrogate bid 90 per unit (first vendor bid 100).",
     [LOGIN, 'Open the event and open the Participants tab', 'Enter a surrogate bid of 90 per unit for the second vendor and submit it',
      'Open Master QCS', 'Read the savings / best price figures'],
     'Any savings or best-price figure on Master QCS is computed from the rank-1 price (90 per unit), not from the rank-2 price (100).',
     "High", "Regression", "HubSpot 336280280786 (Sep 2026): savings calculated on L2 instead of L1 — the savings half; the setting is hidden, so the run must say so instead of guessing")

case("RCA-QCS-024", "7. Master QCS", "Totals on one line",
     "The total of a one-line bid equals that line's amount",
     "Buyer", "Buyer portal", BID, "None", GIVEN,
     [LOGIN, 'Open the event and open Master QCS', 'Read the line\'s amount (quantity × price) and the vendor\'s total (Sum Total)'],
     'The vendor\'s total (Sum Total) equals the single line\'s amount, quantity × price as shown. With one line the total is never different from the line amount.',
     "Medium", "Regression", "HubSpot 335365587648 (Sep 2026): Total Cost = SUM(Total Amount) differed from Total Amount with a single line")

case("RCA-QCS-025", "7. Master QCS", "Every bidding vendor is on Master QCS",
     "Master QCS shows every vendor that bid, none dropped",
     "Buyer", "Buyer portal", "The buyer can create events.", LOCK, "Single-stage RFQ, 1 line item quantity 10, 2 QA vendors. Surrogate bids: vendor 1 at 100, vendor 2 at 105 per unit.",
     SINGLE2 + ['Open the Participants tab and enter a surrogate bid of 100 per unit for the first vendor', 'Enter a surrogate bid of 105 per unit for the second vendor',
      'Open Master QCS and count the vendors'],
     'Master QCS shows both vendors that bid: one at 100 and one at 105 per unit. Nobody who bid is missing.',
     "High", "Regression", "HubSpot 320419903169 (Jul 2026): Master QCS omitted one of three technically cleared vendors")

case("RCA-CO-026", "8. Counter offer", "Counter offer accepted",
     "A counter offer accepted by the vendor becomes the vendor's price on Master QCS",
     "Buyer, Vendor A", "Buyer + Vendor portal", BID, "None", "Counter offer 95 per unit.",
     [LOGIN, 'Open the event and open Master QCS', 'Open Vendor A\'s Counter Offer, enter 95 per unit with a remark and send it',
      'As Vendor A, sign in to the vendor portal, open the event and accept the counter offer', LOGIN, 'Open Master QCS again and read Vendor A\'s price'],
     'The counter offer is sent (the buyer sees it as sent) and the vendor can accept it. After acceptance Master QCS shows Vendor A at 95 per unit. The rate cell is active throughout — the counter offer is never greyed out on a live bid.',
     "High", "Regression", "HubSpot 321402759885 (Jul 2026): counter-offer rate cell inactive; 329423982297 (Aug 2026): NFA kept the old offer after the vendor accepted a new price")

# ── 9. After the PO ──────────────────────────────────────────────────────────────────────────
case("RCA-EVT-027", "9. After the PO", "Event leaves Live after the PO",
     "After the award is approved and the PO is created, the event is no longer under Live",
     "Buyer", "Buyer portal", AWARDED, "None", "-",
     [LOGIN, 'Open the event\'s award proposal and approve it', 'Create the purchase order', 'From the left menu click "Events" and search the event\'s title under the Live tab',
      'Open the History tab and search the title there'],
     'The event is not listed under Live. It is listed under History (completed). The PO was created with the awarded line.',
     "High", "Regression", "HubSpot 331034220221 (Sep 2026): event stuck in the Live tab after NFA approval because PO generation skipped a line silently")

# ── 10. API checks (the same rules through the API) ──────────────────────────────────────────
API = "API"
case("RCA-API-028", "10. API", "Publish an auction",
     "Publishing an auction and reading its round answers 2xx, never 5xx",
     "Buyer", API, "A draft auction event with one line item and a QA vendor, made by the API.", "None", "Rank auction, 1 line item, 1 QA vendor.",
     ['Log in to Procol (buyer side) with the buyer user', 'Send POST to publish the draft auction event',
      'Read the event back (GET /event_groups/<event>) and read its auction round'],
     'Every reply is 2xx. The round read returns the auction with its status (upcoming or live), its start and end time and the line item. No request answers 500.',
     "Critical", "Regression", "HubSpot 333437557450 (Sep 2026)")

case("RCA-API-029", "10. API", "Edit a live RFQ with no auction",
     "Creating a new version of a published RFQ that has no auction is accepted",
     "Buyer", API, "A live RFQ published with QA vendors invited and no bid yet.", "None", "-",
     ['Send POST to create a new version of the published event', 'Send GET for the event'],
     'The new-version request is accepted (2xx) and the event read shows the new version. The reply is not "You cannot edit the RFQ once the Auction is created".',
     "High", "Regression", "HubSpot 326555175666 (Aug 2026)")

case("RCA-API-030", "10. API", "Extend the technical round",
     "Extending the technical round of a Technical + RFQ event moves its end by exactly the extension",
     "Buyer", API, "A live eRFX project with a Technical stage and an RFQ stage.", "None", "Extend by 60 minutes.",
     ['Send GET for the technical round and note its end time', 'Send the request to extend the technical round by 60 minutes',
      'Send GET for the technical round again'],
     'The extension answers 2xx. The technical round\'s end time is the old end time plus 60 minutes. The RFQ round\'s end time is unchanged.',
     "High", "Regression", "HubSpot 326982812387 (Aug 2026)")

case("RCA-API-031", "10. API", "Extend the RFQ round",
     "Extending a live RFQ round with a bid moves its end by exactly the extension",
     "Buyer", API, BID, "None", "Extend by 30 minutes.",
     ['Send GET for the RFQ round and note its end time', 'Send the request to extend the round by 30 minutes', 'Send GET for the round again'],
     'The extension answers 2xx and the round\'s end time equals the old end time plus 30 minutes. The vendor\'s bid is still there.',
     "Medium", "Regression", "HubSpot 333529488097 (Sep 2026)")

case("RCA-API-032", "10. API", "Award the requested quantity",
     "Awarding exactly the requested quantity is accepted",
     "Buyer", API, CLOSED, "None", "Requested quantity 10, award 10.",
     ['Send POST to open the award proposal', 'Send POST to award the line item to the vendor with awarded quantity 10', 'Send GET for the proposal'],
     'Both requests answer 2xx. The proposal shows the vendor awarded quantity 10 on the line. No message about exceeding the requested quantity.',
     "High", "Regression", "HubSpot 321268075243 (Jul 2026)")

case("RCA-API-033", "10. API", "Award more than requested",
     "Awarding more than the requested quantity is refused with the quantity message",
     "Buyer", API, CLOSED, "None", "Requested quantity 10, award 11.",
     ['Send POST to open the award proposal', 'Send POST to award the line item to the vendor with awarded quantity 11'],
     'The award request is refused (4xx) with a message that the bid cannot be selected for more than the requested quantity. Nothing is awarded. The server does not answer 500.',
     "High", "Negative", "HubSpot 321268075243 (Jul 2026)")

case("RCA-API-034", "10. API", "Second bid replaces the first",
     "A vendor's second bid replaces the first; the round shows one active bid at the latest price",
     "Vendor A", API, "A live RFQ published with QA vendors invited and no bid yet.", "None", "Bid 120 then 110 per unit.",
     ['As the vendor, send the requests to open the bid, price the line item at 120 and submit the bid',
      'As the same vendor, send the requests again with 110 per unit and submit',
      'As the buyer, send GET for the round\'s responses / indicators'],
     'The first submission is accepted (2xx). The second submission by the same vendor is ALSO accepted (2xx): a vendor may revise a bid. After it the round shows exactly one active bid for the vendor, at 110. There is no second active bid at 120.',
     "Critical", "Regression", "HubSpot 337866985159 (Sep 2026)")

case("RCA-API-035", "10. API", "Removed vendor cannot bid",
     "A vendor removed from the technical stage cannot place an RFQ bid",
     "Buyer, Vendor A", API, "A live eRFX project with a Technical stage and an RFQ stage, QA vendors invited.", "None", "-",
     ['Send the request to remove Vendor A from the technical round', 'As Vendor A, send the requests to open and submit an RFQ bid of 100 per unit'],
     'The removal answers 2xx. The vendor\'s bid is refused (4xx) because the vendor is no longer a participant of the technical stage. No 500.',
     "Medium", "Negative", "HubSpot 323881661152 (Jul 2026)")

case("RCA-API-036", "10. API", "Vendor added on the RFQ round is kept",
     "A vendor added to the RFQ round stays in the audience of the published project",
     "Buyer", API, "The buyer's token works on the API.", "None", "Technical + RFQ project, one QA vendor added on the RFQ round.",
     ['Send the requests to create a draft Technical + RFQ project with one line item', 'Send the request to add the QA vendor to the RFQ round',
      'Send POST to publish the project', 'Send GET for the audience of the RFQ round and of the technical round'],
     'Every request answers 2xx. After publish the RFQ round\'s audience contains the added vendor. The vendor was not dropped.',
     "Critical", "Regression", "HubSpot 333116804815 / 326533481172 (Aug–Sep 2026)")

case("RCA-API-037", "10. API", "Surrogate bid has a rank",
     "After a surrogate bid the round's schema and indicators answer 200 and carry a rank",
     "Buyer", API, "A live RFQ published with QA vendors invited and no bid yet.", "None", "Surrogate bid 100 per unit.",
     ['Send the request to enter a surrogate bid of 100 per unit for the first vendor', 'Send GET for the round schema and GET for the indicators'],
     'The surrogate bid answers 2xx. The schema and the indicators answer 200; the vendor\'s score carries a rank (1), not null. No 500.',
     "Critical", "Regression", "HubSpot 330421282541 (Aug 2026)")


def main():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "RCA Real Bugs Jul-Sep 2026"
    ws.append(COLS)
    for c in cases:
        ws.append([c[k] for k in COLS])
    widths = {"Test Case ID": 14, "Module": 18, "Scenario": 24, "Test Case Title": 48, "User Role": 16, "Portal": 18, "Pre-conditions": 40,
              "Configs Needed": 30, "Test Data": 30, "Test Steps": 70, "Expected Result": 70, "Priority": 10, "Test Type": 12, "Reference": 44, "Status": 10}
    for i, h in enumerate(COLS, 1):
        ws.column_dimensions[get_column_letter(i)].width = widths[h]
        cell = ws.cell(row=1, column=i)
        cell.font = Font(name="Arial", bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="1F4E79")
        cell.alignment = Alignment(wrap_text=True, vertical="top")
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.font = Font(name="Arial", size=10)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
    ws.freeze_panes = "A2"
    wb.save(OUT)
    ui = sum(1 for c in cases if c["Portal"] != "API")
    print(f"{len(cases)} cases ({ui} browser, {len(cases) - ui} API) → {OUT.name}")


if __name__ == "__main__":
    main()
