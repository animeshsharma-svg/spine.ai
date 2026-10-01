# Event rules from the product model — test cases

These cases come from the platform's **product model** of a sourcing event
(`prototype/src/model/`, built by `npm run model:build`). Each one checks a rule
the model learned from Procol's code, or a problem it found in a client's live
data on 1 October 2026. The plain text says what a QA engineer does and sees;
the *Trace* line holds the code references and error codes.

Clients: PROCOL DEMO (198678), Demo Account 2 (32461), GMMCO (47053).

This file is a human catalog. It is not imported by `npm run cases:import`
(that reads `events-*`, `api-*` and `product-*` files), so it adds no orphans.

---

## 1. Choosing a template

#### MODEL-TPL-001 — The template list for a price round offers only what the client has
- **Why it matters.** A buyer must be offered the templates that really exist for
  this kind of stage; picking the first one blindly (what the old test setup did)
  hides problems with the others.
- **Setup.** Any of the three clients.
- **Steps.** 1. Open the create-event screen and add a price (RFQ) stage. 2. Open
  the template menu. 3. Compare with the platform's template chooser for the same
  client and stage type.
- **Expected.** The same names appear in both: Procol's default templates (unless
  the client hides them) plus the client's own; templates tagged for bills of
  quantity do not appear outside a BOQ project; nothing is pre-selected.
- **Oracle.** The menu's names equal the chooser's list for type "rfq".
- **Trace.** P1 · automate · `GET /api/product-model/templates?c=<id>&type=rfq`;
  dashboard src/views/eventCreation/templateSelection.jsx:120-133,439-448;
  app/helpers/templates_helper.rb:4-53.

#### MODEL-TPL-002 — A technical round lists technical templates only
- **Why it matters.** The technical round and the price round use different kinds
  of template; mixing them builds the wrong stage.
- **Setup.** PROCOL DEMO.
- **Steps.** 1. Add a technical stage. 2. Open the template menu.
- **Expected.** Only technical templates (10 on PROCOL DEMO on 1 Oct 2026) are
  offered; no pricing template appears.
- **Oracle.** Names equal the chooser's list for type "rfp".
- **Trace.** P2 · automate · type_identifier=rfi; templateSelection.jsx:439-442.

#### MODEL-TPL-003 — Every template the list offers can be opened
- **Why it matters.** If a template in the menu crashes when opened, the buyer
  cannot build the stage and gets no explanation.
- **Setup.** PROCOL DEMO and Demo Account 2.
- **Steps.** 1. For every template in the price and technical menus, open it.
- **Expected.** Each one opens and shows its fields.
- **Actual (1 Oct 2026).** Four open with an unexplained server error: on PROCOL
  DEMO "test template for event detailed", "test_rfi_template",
  "test_rfi_template_v2"; on Demo Account 2 "123".
- **Verdict.** Fail — an unexplained server error is always a defect.
- **Oracle.** Every template detail answers without a server error.
- **Trace.** P1 · automate · `GET /templates/:uuid` → HTTP 500 for WFhnaw==,
  TmRaZA==, UWRaZA== (198678) and a05nYw== (32461); model finding "defect".

## 2. Units

#### MODEL-UNIT-001 — A line item for a product linked to another company's unit is refused (GMMCO)
- **Why it matters.** This is the "unit not available" failure seen on GMMCO.
  The screen pre-selects the product's first unit; if that unit is not one of
  GMMCO's own, saving the stage fails.
- **Setup.** GMMCO (material codification on). A product linked only to the
  "unit" unit, e.g. "2HP Pump".
- **Steps.** 1. Create an RFQ and add that product. 2. Keep the unit the screen
  pre-selects. 3. Save or publish the stage.
- **Expected (today).** Refused: "The unit unit is not present".
- **Expected (desired).** The screen should offer only units the client can use,
  or the product's units should be cleaned up.
- **Oracle.** Refusal code 495 with that message; no stage is created.
- **Trace.** P0 · automate · trade_template_helper.rb:1392-1416; unit.rb:48-66;
  manageLineItemsModal.jsx:67-80; 83 GMMCO products affected (unit ×52,
  litre ×19, metre ×6, square metre ×3, kilometre ×2, gram ×1).

#### MODEL-UNIT-002 — The same product succeeds when the buyer picks one of the client's units
- **Why it matters.** Proves the refusal is about the unit, not the product.
- **Setup.** As MODEL-UNIT-001.
- **Steps.** 1. Add the same product. 2. Change the unit to "ea" (one of GMMCO's
  units). 3. Save the stage.
- **Expected.** The stage is created.
- **Oracle.** The stage exists with unit "ea" on that line.
- **Trace.** P1 · automate · creates a QA_Platform_ test event (draft).

#### MODEL-UNIT-003 — A unit the client does not have is refused through the API
- **Why it matters.** Demo Account 2 has no "kg" unit, while Procol's default
  pricing templates default to "KG" and the API test framework always sends
  "KG". A test that keeps that default fails for a reason unrelated to what it
  tests.
- **Setup.** Demo Account 2.
- **Steps.** 1. Create a draft event. 2. Add a price stage whose line item unit is
  "KG".
- **Expected.** Refused: "The unit kg is not present".
- **Oracle.** Refusal code 495.
- **Trace.** P1 · automate · procol test/src/config.ts:221 (quantityUnit "KG");
  32461 has 42 own units + 1 Procol-wide, none "kg".

#### MODEL-UNIT-004 — A line item with no unit is refused
- **Why it matters.** Every quantity needs a unit; a blank one must be stopped.
- **Setup.** Any client.
- **Steps.** 1. Add a price stage whose line item has neither a unit on the
  quantity column nor on the product.
- **Expected.** Refused: "Unit cannot be blank".
- **Oracle.** Refusal code 574.
- **Trace.** P2 · automate · trade_template_helper.rb:1391-1395.

#### MODEL-UNIT-005 — Mixed units are refused when the template has whole-bid prices
- **Why it matters.** A whole-bid price "per unit" only makes sense in one unit.
- **Setup.** A pricing template with a whole-bid price field.
- **Steps.** 1. Add two line items in different units. 2. Save the stage.
- **Expected.** Refused: "You cannot add multiple units in this template."
- **Oracle.** Refusal code 486.
- **Trace.** P2 · automate · trade_template_helper.rb:1843-1853.

## 3. What is checked where

#### MODEL-FLD-001 — A required buyer column left empty is stopped by the screen
- **Why it matters.** The screen is the only guard for required price-sheet
  columns.
- **Setup.** GMMCO, template "RFQ Template - Materials" (buyer must fill Make,
  Model Number, Dimension).
- **Steps.** 1. Build the stage, leave "Make" empty. 2. Publish.
- **Expected.** The screen refuses: "Sheet partially filled, please check again."
- **Oracle.** Publish does not happen; the message is shown.
- **Trace.** P1 · automate (UI) · src/views/projectCreation/helpers.js:236-274.

#### MODEL-FLD-002 — The same empty required column through the API (gap check)
- **Why it matters.** The model found no server check for required price-sheet
  columns. If the API accepts the stage, required fields can be skipped by any
  integration.
- **Setup.** As MODEL-FLD-001, through the API.
- **Steps.** 1. Create the stage with "Make" missing.
- **Expected (desired).** Refused with a clear message.
- **Expected (today, from code).** Accepted — record the result either way.
- **Oracle.** Status and message of the stage-create call.
- **Trace.** P1 · automate · trade_template_helper.rb:1445-1557 (no is_required
  check found — unverified negative).

#### MODEL-FLD-003 — A required technical answer left empty is refused by the server
- **Why it matters.** Technical answers are the one place "required" is enforced
  by the server.
- **Setup.** A technical stage with a required question; a QA vendor.
- **Steps.** 1. As the vendor, submit the response with that question empty.
- **Expected.** Refused: "Please fill '<question name>'".
- **Oracle.** Refusal code 572.
- **Trace.** P1 · automate · app/services/template_responses/validate_service.rb:153-163.

#### MODEL-FLD-004 — A value outside a choice list through the API (gap check)
- **Why it matters.** The screen offers only listed values; the model found no
  server check.
- **Setup.** A template with a choice field (e.g. "Incoterms" on GMMCO).
- **Steps.** 1. Submit a bid whose choice field holds a value not in the list.
- **Expected (desired).** Refused.
- **Expected (today, from code).** Probably accepted — record it.
- **Oracle.** Status of the bid call and the stored value.
- **Trace.** P2 · automate · src/components/sheet/sheet.jsx:1478-1518,1652-1666.

#### MODEL-FLD-005 — Template row rules are stored with a damaged comparison sign
- **Why it matters.** Rules such as "price must be below the price cap" are kept
  as text; in the stored templates the "<" has become "u003c", so a check that
  reads the text cannot work as written.
- **Setup.** PROCOL DEMO, "Buy Template".
- **Steps.** 1. Open the template. 2. Read the price column's validation rules.
- **Expected.** "base_price<ceil_price".
- **Actual (1 Oct 2026).** "base_priceu003cceil_price".
- **Verdict.** Needs a screen test: enter a price above the price cap and see
  whether the screen still stops it (the server's own price-cap check, 38, is
  separate and does work from code).
- **Trace.** P2 · manual → automate · template widgets.inline_components[].configuration.validations.

## 4. Time rules

#### MODEL-TIME-001 — A vendor bid after the end time is refused
- **Steps.** 1. Let a QA RFQ's end time pass. 2. As the vendor, submit a quote.
- **Expected.** Refused: "Order not active".
- **Oracle.** Refusal code 33; no new bid.
- **Trace.** P0 · automate · app/controllers/api/bids_controller.rb:47-50.

#### MODEL-TIME-002 — The technical round cannot end after the price round
- **Steps.** 1. Build technical + RFQ; set the technical end later than the RFQ
  end. 2. Publish.
- **Expected.** Refused: "RFP duration exceeds RFQ end time. Please adjust."
- **Oracle.** Refusal code 712 at publish (the per-stage check skips drafts).
- **Trace.** P0 · automate · trade_controller_helper.rb:643-675;
  event_groups/update_service.rb:303-314.

#### MODEL-TIME-003 — Reopening an expired RFQ needs permission
- **Steps.** 1. Let a QA RFQ expire. 2. As a normal buyer, extend its end time.
- **Expected.** Refused: "You are not allowed to reopen an expired event"
  (unless the client allows reopening).
- **Oracle.** Refusal code 496; a technical round is NOT subject to this.
- **Trace.** P1 · automate · trade_controller_helper.rb:2028-2029,5830-5832.

#### MODEL-TIME-004 — Evaluation is refused while bidding is still open
- **Steps.** 1. While a technical round is still running, submit a score.
- **Expected.** Refused ("Order not active"); after the end it is accepted.
- **Oracle.** Code 33 before the end, success after.
- **Trace.** P1 · automate · app/controllers/api/evaluations_controller.rb:13-26.

#### MODEL-TIME-005 — No time extension after an award proposal exists
- **Steps.** 1. Create an award proposal on a QA event. 2. Extend the RFQ end.
- **Expected.** Refused: "You cannot edit the time as proposals are already submitted."
- **Oracle.** Refusal code 801.
- **Trace.** P1 · automate · trade_controller_helper.rb:6794-6805.

## 5. Event composition

#### MODEL-CMP-001 — An RFQ and a direct auction side by side (gap check)
- **Why it matters.** The screen and the purchase-request route refuse it; the
  plain stage-create call does not check it.
- **Steps.** 1. Create a draft event with an RFQ stage. 2. Through the API, add a
  direct auction stage to the same event.
- **Expected (desired).** Refused.
- **Expected (today, from code).** Accepted — a gap.
- **Oracle.** Status of the second stage-create call.
- **Trace.** P1 · automate · pr_to_erfx_service.rb:27 (code 15 only on that route);
  trade_controller_helper.rb:3644-3665 (only same-kind duplicates refused).
