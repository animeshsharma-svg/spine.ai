# Event templates, field by field — test cases

Most of a sourcing event depends on its template: which columns the buyer fills on each line item, which the vendor
fills, which are worked out automatically, and the rules on each. These cases are the generic form of the field-level
cases that spine.ai generates for **one client's one template** from the product model
(`prototype/src/model/caseGen.ts`), and runs with `cd prototype && npm run template:check -- --c <client> [--uuid <template>] [--type rfq|rfp|auction|boq] [--mode sample|full]`
(or `GET /api/template-check/run`). The generated case carries the template's own column names; its id is the
catalog id below plus a number (`API-XTPL-011.02`).

**How the expected result is decided.** From who enforces the rule, read from the backend and dashboard code
(`prototype/src/model/fieldRules.ts`):
- **the server** enforces it → the request must be refused, with the server's own message where the code gives one;
- **only the screen** enforces it → the API is allowed to take it; the case passes as long as the server answers
  cleanly (no server error) and records an accepted value as a **gap** — anything that calls the API directly can save it;
- **nobody known** → the case passes on any clean answer and records what the server did.
A server error (HTTP 5xx) always fails. A refusal for a different reason than the case tests is "couldn't tell", never a pass.

**What a run builds.** A sandbox draft event named `QA_Platform_TplCheck_<time>` with one line item; one draft pricing
or technical round per buyer case; for vendor cases, one round published to the client's own test vendor, who signs in
and saves their line (or submits their technical answers) once per case — the valid one last.

## 1. The template and the valid baselines

#### API-XTPL-001 — The chosen template opens
- **Why it matters.** A buyer who picks a template for a round first has it opened; if opening it fails, nobody can use it. The product model found four templates that fail to open (three on PROCOL DEMO, one on Demo Account 2).
- **Setup.** Signed in as a buyer of the client. The template is one the client is offered for this kind of round.
- **Steps.** 1. Open the template as the event-creation screen does.
- **Expected.** The template opens and lists its columns (or, for a technical template, its pages and questions).
- **Oracle.** GET /templates/:uuid answers 2xx; 5xx = defect.
- **Trace.** P0 · automate · `template:check` · `app/controllers/api/templates_controller.rb`

#### API-XTPL-002 — A pricing round saves with every buyer column filled correctly
- **Why it matters.** The baseline for every buyer case: if a correct round is refused, every negative case is refused for the wrong reason.
- **Setup.** A sandbox draft event with one line item (a catalogue product with a quality, in one of the client's units, a delivery location).
- **Steps.** 1. Add a pricing round using the template, with the template's own columns. 2. Fill every buyer column with a valid value. 3. Save the round as a draft.
- **Expected.** The round is saved and comes back with its id.
- **Oracle.** POST /trade/template_input 2xx with a uuid.
- **Trace.** P0 · automate · `template:check` · `app/controllers/concerns/trade_template_helper.rb:1386-1530`

#### API-XTPL-003 — The vendor saves their line with every vendor column valid
- **Why it matters.** The vendor-side baseline: if a correct line is refused, every vendor case is refused for the wrong reason.
- **Setup.** A round built from the template is published to the client's test vendor, who is signed in and has started a bid.
- **Steps.** 1. Fill every vendor column with a valid value (quantity = requested, a price inside any limit). 2. Save the line.
- **Expected.** The line is saved.
- **Oracle.** POST /v1/bids/:uuid/create_bid_products 2xx.
- **Trace.** P0 · automate · `template:check` · `app/controllers/concerns/bids_controller_helper.rb:1110-1312`

#### API-XTPL-004 — A technical round saves with the template's pages and questions unchanged
- **Why it matters.** The baseline for every technical-round case.
- **Setup.** A sandbox draft event; an evaluator of the client exists.
- **Steps.** 1. Add a technical (RFP) round using the template, with its pages and questions as the template defines them. 2. Save it as a draft.
- **Expected.** The round is saved and comes back with its id.
- **Oracle.** POST /trade/template_input (rfx_mode rfp) 2xx with a uuid.
- **Trace.** P0 · automate · `template:check` · `app/services/templates/validate_service.rb:205-293`

#### API-XTPL-040 — The vendor submits the technical answers with every question answered
- **Why it matters.** The baseline for every missing-answer case.
- **Setup.** A technical round built from the template is published to the test vendor, who has opened it. Templates with a required file-upload question cannot be answered by this check (no file is uploaded) — the case is then reported as not run.
- **Steps.** 1. Answer every question on every page. 2. Submit the response.
- **Expected.** The response is submitted.
- **Oracle.** PATCH /template_responses/:uuid (status active) 2xx.
- **Trace.** P0 · automate · `template:check` · `app/services/template_responses/validate_service.rb`

#### API-XTPL-005 — A pricing round that names a template which does not exist is refused
- **Why it matters.** A round must be built from a real template of the client. If the server stores a round against a template that does not exist, later steps that read the template break — the engine journey saw an award fail with "Bid not present on this line item" after such a round was accepted.
- **Setup.** A sandbox draft event with one line item.
- **Steps.** 1. Add a pricing round exactly like the valid one, but naming a template id that does not exist. 2. Save it.
- **Expected.** The round is refused with a clear message and is not stored.
- **Oracle.** POST /trade/template_input with a made-up template_uuid → 4xx. A 2xx is the defect.
- **Trace.** P1 · automate · `template:check` · `app/controllers/api/trade_controller.rb`

## 2. The line item: product, unit, delivery location

#### API-XTPL-006 — A line item without a product is refused cleanly
- **Why it matters.** Every line item is a product of the client's catalogue; a line without one cannot be quoted or awarded — and must be refused with a message, not a crash.
- **Setup.** A sandbox draft event.
- **Steps.** 1. Add a pricing round with the line item's product left out (unit and quantity still given). 2. Save it.
- **Expected.** The round is refused with a clear message ("Product not found"), not a server error.
- **Oracle.** 4xx; 5xx = defect.
- **Trace.** P1 · automate · `template:check` · `app/controllers/api/trade_controller.rb:127-135` · `app/controllers/concerns/trade_template_helper.rb:1394,1467`

#### API-XTPL-007 — A line item without a unit is refused
- **Why it matters.** Quantities and prices are per unit; without one the round cannot be compared or awarded.
- **Setup.** A sandbox draft event.
- **Steps.** 1. Add a pricing round with the quantity's unit left empty. 2. Save it.
- **Expected.** The round is refused: "Unit cannot be blank".
- **Oracle.** 422, code 574.
- **Trace.** P1 · automate · `template:check` · `app/controllers/concerns/trade_template_helper.rb:1391-1395`

#### API-XTPL-008 — A line item in a unit the client does not have is refused
- **Why it matters.** The unit must be one of the client's own active units. The default Procol templates assume KG, which Demo Account 2 does not have.
- **Setup.** A sandbox draft event; a unit symbol that is not among the client's units (from the product model).
- **Steps.** 1. Add a pricing round with the quantity in that unit. 2. Save it.
- **Expected.** The round is refused: "The unit … is not present".
- **Oracle.** 422, code 495, message names the unit.
- **Trace.** P1 · automate · `template:check` · `app/controllers/concerns/trade_template_helper.rb:1398-1416`

#### API-XTPL-009 — A product linked to another company's unit cannot be quoted in that unit
- **Why it matters.** Some products are linked to a unit that belongs to another company (GMMCO, Demo Account 2, PROCOL DEMO all have such products). The screen pre-selects the product's first linked unit without checking it, so the buyer hits a refusal they cannot explain.
- **Setup.** A product of the client whose only linked unit is not one of the client's units (from the product model), with a quality.
- **Steps.** 1. Add a pricing round for that product, in its linked unit. 2. Save it.
- **Expected.** The round is refused: "The unit … is not present" — and the screen should not offer that unit.
- **Oracle.** 422, code 495.
- **Trace.** P1 · automate · `template:check` · `src/views/projectCreation/components/manageLineItemsModal.jsx:67-80`

#### API-XTPL-023 — A line item without a delivery location is handled cleanly
- **Why it matters.** A missing delivery location once made a later event update fail with an unexplained server error on UAT.
- **Setup.** A sandbox draft event.
- **Steps.** 1. Add a pricing round with the delivery location left out. 2. Save it.
- **Expected.** No server error; the server's answer is recorded (today: refused, "Delivery location not found").
- **Oracle.** no 5xx.
- **Trace.** P2 · automate · `template:check`

## 3. Buyer columns

#### API-XTPL-010 — A required buyer column left empty
- **Why it matters.** The screen refuses to publish while a required buyer cell is empty ("Sheet partially filled, please check again."); the server does not check "required" on pricing-sheet cells.
- **Setup.** A template with a required buyer column other than product, quantity and delivery location.
- **Steps.** 1. Add a pricing round with that column empty and everything else valid. 2. Save it.
- **Expected (today).** Accepted by the API — only the screen stops it (a gap). No server error.
- **Oracle.** no 5xx; 2xx recorded as a gap.
- **Trace.** P1 · automate · `template:check` · `src/views/projectCreation/helpers.js:236-274`

#### API-XTPL-011 — Text typed into a buyer number column
- **Why it matters.** Text in a number column breaks totals and comparisons; the screen silently drops it.
- **Setup.** A template with a buyer number, quantity or percentage column.
- **Steps.** 1. Add a pricing round with "abc" in that column. 2. Save it.
- **Expected (today).** Accepted by the API — only the screen stops it (a gap). No server error.
- **Oracle.** no 5xx; 2xx recorded as a gap.
- **Trace.** P2 · automate · `template:check` · `src/components/sheet/sheet.jsx:1413-1431`

#### API-XTPL-012 — A negative number in a buyer number column (including the requested quantity)
- **Why it matters.** A negative quantity or amount turns totals and savings upside down.
- **Setup.** A template with a buyer number column.
- **Steps.** 1. Add a pricing round with −5 in that column. 2. Save it.
- **Expected (today).** Accepted by the API — only the screen stops it (a gap). No server error.
- **Oracle.** no 5xx; 2xx recorded as a gap.
- **Trace.** P2 · automate · `template:check` · `src/components/sheet/sheet.jsx:1773-1785`

#### API-XTPL-013 — More decimals than a buyer column allows
- **Why it matters.** Columns carry a precision; extra decimals change totals by rounding.
- **Setup.** A template whose buyer number column sets a precision.
- **Steps.** 1. Add a pricing round with three more decimals than allowed. 2. Save it.
- **Expected (today).** Accepted (the server only rewrites precision) — the screen rounds. No server error.
- **Oracle.** no 5xx.
- **Trace.** P3 · automate · `template:check` · `app/controllers/concerns/trade_template_helper.rb:1816-1830`

#### API-XTPL-014 — A value outside a buyer column's choice list
- **Why it matters.** A dropdown offers only its listed values; anything else breaks reports and comparisons.
- **Setup.** A template with a buyer dropdown column.
- **Steps.** 1. Add a pricing round with "QA not an option" in that column. 2. Save it.
- **Expected (today).** Accepted by the API — only the screen stops it (a gap). No server error.
- **Oracle.** no 5xx; 2xx recorded as a gap.
- **Trace.** P2 · automate · `template:check` · `src/components/sheet/sheet.jsx:1478-1518`

#### API-XTPL-015 — Accented, Chinese, Japanese, emoji and HTML characters in a text column
- **Why it matters.** Buyers type names and specifications in many scripts; the save must not crash or mangle them.
- **Setup.** A template with a buyer text column.
- **Steps.** 1. Add a pricing round with that text in the column. 2. Save it.
- **Expected.** No server error; the text is stored as sent.
- **Oracle.** no 5xx.
- **Trace.** P3 · automate · `template:check`

#### API-XTPL-016 — A very long text (about 5,200 characters) in a text column
- **Why it matters.** A pasted specification can be long; the save must not crash on it.
- **Setup.** A template with a buyer text column.
- **Steps.** 1. Add a pricing round with a 5,200-character text in the column. 2. Save it.
- **Expected.** No server error.
- **Oracle.** no 5xx.
- **Trace.** P3 · automate · `template:check`

#### API-XTPL-017 — An impossible date (31 February) in a date column
- **Why it matters.** Dates drive delivery and contract terms; an impossible date must not crash the save or be stored silently.
- **Setup.** A template with a buyer date column.
- **Steps.** 1. Add a pricing round with 31-02-2026 in the column. 2. Save it.
- **Expected.** No server error; the server's answer is recorded.
- **Oracle.** no 5xx.
- **Trace.** P2 · automate · `template:check`

#### API-XTPL-018 — The buyer sends a value for a calculated column
- **Why it matters.** Calculated columns (totals) are worked out; nobody should be able to type them.
- **Setup.** A template with a calculated line-item column.
- **Steps.** 1. Add a pricing round with 999999 in the calculated column. 2. Save it.
- **Expected (today).** Accepted by the API — only the screen makes the column read-only (a gap). No server error.
- **Oracle.** no 5xx; 2xx recorded as a gap.
- **Trace.** P2 · automate · `template:check` · `src/utils/widgetUtils.js:12-15`

#### API-XTPL-019 — The buyer fills a column that belongs to the vendor
- **Why it matters.** A value the buyer puts in a vendor column could pre-fill or skew the vendor's bid.
- **Setup.** A template with vendor columns.
- **Steps.** 1. Add a pricing round with a value in a vendor column. 2. Save it.
- **Expected.** No server error; whether the value is kept or ignored is recorded.
- **Oracle.** no 5xx.
- **Trace.** P2 · automate · `template:check`

#### API-XTPL-020 — A negative price cap, floor price or minimum quantity is refused
- **Why it matters.** Buyer limits steer every bid; a negative limit would reject every honest bid or none.
- **Setup.** A template with a price cap, floor price or minimum quantity column.
- **Steps.** 1. Add a pricing round with −10 in that column. 2. Save it.
- **Expected.** Refused: "Price Cap cannot be negative" / "Floor Price cannot be negative" / "Floor Quantity cannot be negative".
- **Oracle.** 422, code 202 / 203 / 204.
- **Trace.** P1 · automate · `template:check` · `lib/modules/trade_validation.rb:64-87`

#### API-XTPL-021 — A minimum quantity above the requested quantity is refused
- **Why it matters.** No vendor could meet a minimum larger than what is asked for.
- **Setup.** A template with a minimum-quantity column.
- **Steps.** 1. Add a pricing round with the minimum 1,000 above the requested quantity. 2. Save it.
- **Expected.** Refused: "Floor Quantity cannot be greater than the Total Quantity".
- **Oracle.** 422, code 205.
- **Trace.** P2 · automate · `template:check` · `lib/modules/trade_validation.rb:80-84`

#### API-XTPL-022 — A value outside the limits the template sets on a column
- **Why it matters.** A template can set a minimum and maximum on a column; the screen puts the value back with the template's message.
- **Setup.** A template whose column declares a min/max validation.
- **Steps.** 1. Fill the column with one more than the maximum (or one less than the minimum). 2. Save.
- **Expected (today).** Accepted by the API — only the screen stops it (a gap). No server error.
- **Oracle.** no 5xx; 2xx recorded as a gap.
- **Trace.** P2 · automate · `template:check` · `src/components/sheet/sheet.jsx:2010-2025`

## 4. Vendor columns

#### API-XTPL-024 — The vendor leaves a required column empty
- **Why it matters.** A bid line without a required value cannot be compared.
- **Setup.** A published round; the vendor has started a bid.
- **Steps.** 1. Fill the line validly except one required vendor column. 2. Save the line.
- **Expected.** No server error; the server's answer is recorded (an empty price is refused today, "Invalid Input").
- **Oracle.** no 5xx.
- **Trace.** P1 · automate · `template:check` · `app/controllers/concerns/bids_controller_helper.rb:1828-1912`

#### API-XTPL-025 — The vendor types text into a number column
- **Why it matters.** Text in a price or quantity breaks ranking.
- **Setup.** A published round; the vendor has started a bid.
- **Steps.** 1. Fill the line validly but with "abc" in a vendor number column. 2. Save the line.
- **Expected.** No server error; an accepted value is recorded as a gap.
- **Oracle.** no 5xx.
- **Trace.** P2 · automate · `template:check`

#### API-XTPL-026 — The vendor sends a negative number
- **Why it matters.** A negative price or quantity would rank a bid first.
- **Setup.** A published round; the vendor has started a bid.
- **Steps.** 1. Fill the line validly but with −5 in a vendor number column. 2. Save the line.
- **Expected.** No server error; an accepted value is recorded as a gap.
- **Oracle.** no 5xx.
- **Trace.** P2 · automate · `template:check`

#### API-XTPL-027 — The vendor sends more decimals than a column allows
- **Why it matters.** Extra decimals change totals by rounding.
- **Setup.** A published round; the vendor has started a bid.
- **Steps.** 1. Fill the line validly but with three more decimals than allowed. 2. Save the line.
- **Expected.** No server error.
- **Oracle.** no 5xx.
- **Trace.** P3 · automate · `template:check`

#### API-XTPL-028 — The vendor offers more than the requested quantity on a round that does not allow it
- **Why it matters.** When over-quantity is off, a vendor may not offer more than asked for. A round that says nothing allows it (the server's default is "allowed").
- **Setup.** A published round with over-quantity NOT allowed. If the round cannot be set up that way (on UAT the setting comes from the company's trade configuration), the case is reported as not run with the reason.
- **Steps.** 1. Fill the line with the requested quantity + 1,000. 2. Save the line.
- **Expected.** Refused: "Quantity cannot be greater than the mentioned quantity."
- **Oracle.** 422, code 138.
- **Trace.** P1 · automate · `template:check` · `app/controllers/concerns/bids_controller_helper.rb:1901-1903` · `app/models/model_helpers/trade_request_model_helper.rb:181-183`

#### API-XTPL-029 — The vendor quotes above the buyer's price cap
- **Why it matters.** The price cap is the buyer's upper limit. Many stored templates carry the rule "base price below ceiling price" with its comparison sign damaged in storage ("u003c"); the server's own price-cap check does not read that text, so it must still hold.
- **Setup.** A template with a price cap column; the published round's price cap is 100.
- **Steps.** 1. Fill the line with a price of 150. 2. Save the line.
- **Expected.** Refused: "Price cannot be more than the allowed price".
- **Oracle.** 422, code 38.
- **Trace.** P1 · automate · `template:check` · `app/controllers/concerns/bids_controller_helper.rb:1839-1846`

#### API-XTPL-030 — The vendor quotes below the buyer's floor price
- **Why it matters.** The floor price is the buyer's lower limit.
- **Setup.** A template with a floor price column; the published round's floor price is 10.
- **Steps.** 1. Fill the line with a price of 5. 2. Save the line.
- **Expected.** Refused: "Price cannot be less than the allowed price".
- **Oracle.** 422, code 41.
- **Trace.** P1 · automate · `template:check` · `app/controllers/concerns/bids_controller_helper.rb:1848-1855`

#### API-XTPL-031 — The vendor changes a column that belongs to the buyer
- **Why it matters.** The requested quantity is the buyer's; a vendor changing it could make an offer look complete when it is not.
- **Setup.** A published round; the vendor has started a bid.
- **Steps.** 1. Fill the line validly but send the requested quantity 500 higher. 2. Save the line.
- **Expected.** No server error; whether the change is kept or ignored is recorded.
- **Oracle.** no 5xx.
- **Trace.** P2 · automate · `template:check`

#### API-XTPL-032 — The vendor sends a value for a calculated column
- **Why it matters.** A vendor typing a total could make a bid look cheaper than it is.
- **Setup.** A published round; the vendor has started a bid.
- **Steps.** 1. Fill the line validly but with 999999 in the calculated total. 2. Save the line.
- **Expected (today).** Accepted by the API — only the screen makes it read-only (a gap). No server error.
- **Oracle.** no 5xx; 2xx recorded as a gap.
- **Trace.** P2 · automate · `template:check` · `app/controllers/concerns/bids_controller_helper.rb:2434-2436`

#### API-XTPL-038 — The vendor offers less than the buyer's minimum quantity
- **Why it matters.** The buyer set a minimum quantity per vendor; a smaller offer must be refused.
- **Setup.** A template with a minimum-quantity column; the published round's minimum is 10.
- **Steps.** 1. Fill the line with a quantity of 1. 2. Save the line.
- **Expected.** Refused: "Quantity cannot be less than the allowed quantity".
- **Oracle.** 422, code 39.
- **Trace.** P1 · automate · `template:check` · `app/controllers/concerns/bids_controller_helper.rb:1893-1896`

#### API-XTPL-039 — The vendor sends a value outside a column's choice list
- **Why it matters.** A dropdown offers only its listed values.
- **Setup.** A template with a vendor dropdown column; a published round.
- **Steps.** 1. Fill the line validly but with "QA not an option" in that column. 2. Save the line.
- **Expected (today).** Accepted by the API — only the screen stops it (a gap). No server error.
- **Oracle.** no 5xx; 2xx recorded as a gap.
- **Trace.** P2 · automate · `template:check`

## 5. Technical (RFP) rounds

#### API-XTPL-033 — A technical round with a page that has no name is refused cleanly
- **Why it matters.** Each page needs a name; a nameless page gives vendors a form nobody can navigate — and must be refused with a message, not a crash.
- **Setup.** A sandbox draft event; a technical template.
- **Steps.** 1. Add a technical round using the template with the first page's name removed. 2. Save it.
- **Expected.** Refused: "Please fill all the required fields". Not a server error.
- **Oracle.** 422, code 792; 5xx = defect.
- **Trace.** P2 · automate · `template:check` · `app/services/templates/validate_service.rb:205-293`

#### API-XTPL-034 — A technical round with a question that has no key is refused
- **Why it matters.** Answers are stored against the question's key; a keyless question cannot be answered or scored.
- **Setup.** A sandbox draft event; a technical template.
- **Steps.** 1. Add a technical round with the first question's key removed. 2. Save it.
- **Expected.** Refused: "Please fill all the required fields".
- **Oracle.** 422, code 792.
- **Trace.** P2 · automate · `template:check` · `app/services/templates/validate_service.rb:205-293`

#### API-XTPL-035 — A technical round with a question that does not say who fills it is refused
- **Why it matters.** Each question must say whether the vendor or the buyer answers it.
- **Setup.** A sandbox draft event; a technical template.
- **Steps.** 1. Add a technical round with "who fills it" removed from the first question. 2. Save it.
- **Expected.** Refused: "Please fill all the required fields".
- **Oracle.** 422, code 792.
- **Trace.** P2 · automate · `template:check` · `app/services/templates/validate_service.rb:205-293`

#### API-XTPL-036 — The vendor submits technical answers with a required question left empty
- **Why it matters.** A required question must be answered before the response counts; the server checks it on submit.
- **Setup.** A technical round built from the template, published to the test vendor, who has opened it.
- **Steps.** 1. Answer every question except one required question. 2. Submit the response.
- **Expected.** Refused: "Please fill '<question>'" naming that question. A refusal naming another question is "couldn't tell".
- **Oracle.** 422, code 572, message contains the question's name.
- **Trace.** P1 · automate · `template:check` · `app/services/template_responses/validate_service.rb:153-163`

#### API-XTPL-037 — The vendor answers a question with a value outside its choices
- **Why it matters.** An answer outside the list breaks comparison and scoring.
- **Setup.** A technical round with a choice question, published to the test vendor.
- **Steps.** 1. Answer that question with "QA not an option" and every other question validly. 2. Submit.
- **Expected (today).** Accepted by the API — only the screen stops it (a gap). No server error. A refusal because another required answer is missing is "couldn't tell".
- **Oracle.** no 5xx.
- **Trace.** P2 · automate · `template:check` · `src/components/sheet/sheet.jsx:1478-1518`
