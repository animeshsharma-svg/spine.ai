# Stages (rounds) — API edge and negative cases

Adding and configuring rounds on an event through `POST /trade/template_input` — the technical (RFP) round and the pricing (RFQ / auction) round the journey attaches in `eventJourney.ts` `addStage`. Every case sends the journey's own body (`procol test/src/flows/bodies.ts` `buildTechnicalStageBody` / `buildPricingStageBody`) with ONE thing changed, and cites the guard in `procol-backend` (origin/main) that decides the outcome. The runnable twins are in `prototype/data/api-cases-extra/stg.json` (same order, `EDGE-STG-NNN`).

**Read before running.** Most cases need a DRAFT event group: on a draft, a new round of an rfx_mode the draft already has voids the old one, so cases do not collide. On a PUBLISHED event every second round of the same rfx_mode is refused with 830 before any other check, so a case aimed at a later guard would be refused for the wrong reason. Cases that need the published RFQ fixture say so in Setup. Template uuids are omitted from the working bodies (no placeholder exists); the pricing rows use `{{locationUuid}}`. Two fixed ids are used: `Z2dnWmdaUWtnZw==` (a well-formed uuid for id 999999999 — no such row) and `WrongUuid1=` (decodes to nil, i.e. is read as absent).

**Crash-class findings.** `render_error_json` answers 500 for any exception, and the create path rescues only `ActiveRecord::RecordInvalid` and `DormantPrError` (app/controllers/api/trade_controller.rb:347-352). Every "no-5xx" case below names the exact raise it expects today.

---

## 1. Round composition, round type and ownership

Which rounds an event may hold, in what combination, and who the round belongs to. The only composition guard on this endpoint is the same-rfx_mode check in `check_if_allowed_to_add_trade_to_event_group` (trade_controller_helper.rb:3644-3670); everything else the product promises about round mixes lives in the UI or in `AddNewStage::ValidateService`, which this endpoint never calls.

#### API-XSTG-001 — A second RFQ round on a published event is refused
- **Why it matters.** The same-mode guard is the only thing standing between a live RFQ and a shadow RFQ whose bids would never be compared with the
  first. It compares rfx_mode strings (trade_request.rfx_mode.to_s == rfx_mode.to_s), so it is easy to regress when the enum or the
  params change.
- **Setup.** Published (status active) event group {{eventGroupUuid}} holding exactly one RFQ round {{tradeId}} and no RFP or auction round
  (the platform's standard RFQ fixture), line item {{lineItemUuid}}, product {{productUuid}}, variant {{productQualityUuid}},
  location {{locationUuid}}. Buyer session whose user has trade create_record permission and sourcing-events access
  (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: nothing — a complete RFQ round aimed at an event that
  is already live with an RFQ round. Then read the event group back.
- **Expected.** HTTP 422 with error.code 830 'Same type of event already exists for this Project.' from
  TradeControllerHelper#check_if_allowed_to_add_trade_to_event_group app/controllers/concerns/trade_controller_helper.rb:3663-3666;
  no second RFQ TradeRequest appears on the event.
- **Oracle.** 422 with code 830; the event still lists exactly one RFQ round.
- **Trace.** P0 · automate · `EDGE-STG-001` · `app/controllers/concerns/trade_controller_helper.rb:3666`

#### API-XSTG-002 — An auction round bolted onto a live RFQ event through template_input skips the add-new-stage rules
- **Why it matters.** Adding a round to a live event is policy-gated on its own endpoint; a generic stage endpoint that reaches the same result without
  those checks is a bypass. Status is draft, so nothing goes live, but the round is attached to the live event.
- **Setup.** Published (status active) event group {{eventGroupUuid}} holding exactly one RFQ round {{tradeId}} and no RFP or auction round
  (the platform's standard RFQ fixture), line item {{lineItemUuid}}, product {{productUuid}}, variant {{productQualityUuid}},
  location {{locationUuid}}. Buyer session whose user has trade create_record permission and sourcing-events access
  (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: rfx_mode auction (auction_config price, lot_based
  closing) on the live RFQ event. Then read the event group back.
- **Expected.** No 5xx. It SHOULD be refused: live events take new rounds only through POST /v1/trade/:id/add_new_stage_in_live_event, whose
  AddNewStage::ValidateService (app/services/add_new_stage/validate_service.rb:21-58) returns 1127 when the tenant flag is off and
  1128/2001 for this mix. template_input only checks for a same-mode round, so a 2xx with a new auction round on a live RFQ is a
  defect.
- **Oracle.** Status is 4xx, or — if 2xx — the event now lists an auction round (file the bypass).
- **Trace.** P0 · automate · `EDGE-STG-002` · `app/controllers/concerns/trade_controller_helper.rb:3662-3666`

#### API-XSTG-003 — An RFQ-then-auction round next to an RFQ round on the same draft is not blocked
- **Why it matters.** Two commercial rounds on one draft make latest_commercial_stage (event_group.rb:608-621) pick one arbitrarily at award time.
- **Setup.** Draft event group {{eventGroupUuid}} that already has a draft RFQ round whose bid end time is earlier than 2030-01-01 01:00 UTC
  (any round the platform attaches today), line item {{lineItemUuid}}, evaluator {{userUuid}}. Buyer session whose user has trade
  create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: rfx_mode rfq_then_auction on a draft that already has
  an RFQ round. Then read the event group back.
- **Expected.** No 5xx. The product rule is one commercial round per event (RFQ or auction, not both); the code only refuses a second round of the
  SAME rfx_mode (app/controllers/concerns/trade_controller_helper.rb:3662), so rfq_then_auction next to rfq is let through. A 2xx
  here documents that the rule is UI-only.
- **Oracle.** Response is not 5xx; the event's round list shows whether both commercial rounds now coexist.
- **Trace.** P1 · automate · `EDGE-STG-003` · `app/controllers/concerns/trade_controller_helper.rb:3662`

#### API-XSTG-004 — Sending order_type vendor_onboarding lets a second RFQ round past the duplicate-round guard
- **Why it matters.** A single body field routes a sourcing round down the vendor-onboarding branch and skips every event-group ownership check.
- **Setup.** Published (status active) event group {{eventGroupUuid}} holding exactly one RFQ round {{tradeId}} and no RFP or auction round
  (the platform's standard RFQ fixture), line item {{lineItemUuid}}, product {{productUuid}}, variant {{productQualityUuid}},
  location {{locationUuid}}. Buyer session whose user has trade create_record permission and sourcing-events access
  (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.order_type = vendor_onboarding on an RFQ
  round for the live RFQ event. Then read the event group back.
- **Expected.** No 5xx. It SHOULD be refused. set_configurations_for_trade returns early into set_config_for_vendor_onboarding_event
  (app/controllers/concerns/trade_controller_helper.rb:3279-3292) which sets event_group_id directly
  (app/controllers/concerns/trade_controller_helper.rb:3731-3733) and never calls check_if_allowed_to_add_trade_to_event_group, so
  the 888 (other company’s event), 890 (foreign line item) and 830 (duplicate round) guards are all skipped. A 2xx is a defect.
- **Oracle.** 4xx expected; if 2xx, the live event now has two RFQ rounds or a vendor-onboarding round — file it.
- **Trace.** P0 · automate · `EDGE-STG-004` · `app/controllers/concerns/trade_controller_helper.rb:3292`

#### API-XSTG-005 — rfx_mode in the wrong case on a pricing body silently becomes an auction
- **Why it matters.** A casing slip from an integration turns a sealed-quote RFQ into a live reverse auction that shows vendors each other's prices.
- **Setup.** Published (status active) event group {{eventGroupUuid}} holding exactly one RFQ round {{tradeId}} and no RFP or auction round
  (the platform's standard RFQ fixture), line item {{lineItemUuid}}, product {{productUuid}}, variant {{productQualityUuid}},
  location {{locationUuid}}. Buyer session whose user has trade create_record permission and sourcing-events access
  (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.rfx_mode = "Rfq". Then read the event
  group back.
- **Expected.** No 5xx. It SHOULD be refused as an unknown rfx_mode. The mode ladder has an else branch that makes anything unrecognised an
  auction (app/controllers/concerns/trade_controller_helper.rb:3587-3589), the order_type check only fires for exact lowercase modes
  (app/controllers/concerns/trade_controller_helper.rb:3530), and the duplicate check compares strings, so "Rfq" is stored as an
  auction round.
- **Oracle.** Either 4xx, or the created round's rfx_mode must be read back — auction here is the defect.
- **Trace.** P1 · automate · `EDGE-STG-005` · `app/controllers/concerns/trade_controller_helper.rb:3588`

#### API-XSTG-006 — A pricing sheet sent as a technical (rfp) round must not crash on the missing forms
- **Why it matters.** Wrong template type for the stage is the commonest client mistake on this endpoint; it must be a clean refusal.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.rfx_mode = rfp while sending widgets +
  data and no forms. Then read the event group back.
- **Expected.** No 5xx. add_data_for_templates takes the rfp branch and runs
  Templates::CreationValidateService#validate_rfi_template_for_event_creation, whose valid_forms? RAISES InvalidFormError when forms
  is missing (app/services/templates/validate_service.rb:206-208). Nothing rescues it (no rescue_from StandardError in
  Api::ApiController), so today this is a 500; expected a 422 such as 792.
- **Oracle.** Status < 500 with a {code,message} body.
- **Trace.** P1 · automate · `EDGE-STG-006` · `app/services/templates/validate_service.rb:208`

#### API-XSTG-007 — Technical forms sent as an auction round are refused for having no products
- **Why it matters.** The mirror of the pricing-as-rfp case: a commercial round with no line items must be refused before anything is written.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.rfx_mode = auction (auction_config
  price, order_type buy) on the technical forms body. Then read the event group back.
- **Expected.** HTTP 422 with error.code 80 'Product not found' from Api::TradeController#create app/controllers/api/trade_controller.rb:167-168
  (a non-RFP/RFI round with no trade_products); nothing is created.
- **Oracle.** 422 code 80; no auction round on the event.
- **Trace.** P1 · automate · `EDGE-STG-007` · `app/controllers/api/trade_controller.rb:168`

#### API-XSTG-008 — stage_no 0 is not a valid round position
- **Why it matters.** Round order drives the vendor's journey (technical before pricing); a 0 sorts ahead of every real round.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.stage_no = 0. Then read the event group
  back.
- **Expected.** No 5xx. stage_no is copied straight from params (app/controllers/concerns/trade_controller_helper.rb:3303) with no range check; 0
  should be refused (positions are 1-based).
- **Oracle.** Status < 500; if 2xx, the stored stage_no is 0 — note it.
- **Trace.** P2 · automate · `EDGE-STG-008` · `app/controllers/concerns/trade_controller_helper.rb:3303`

#### API-XSTG-009 — A non-numeric stage_no is not silently stored as empty
- **Why it matters.** A nil stage_no hides the round from stage_no-ordered lists.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.stage_no = "two". Then read the event
  group back.
- **Expected.** No 5xx. The integer column casts "two" to nil; a round with no position is created. Expected a 4xx.
- **Oracle.** Status < 500; if 2xx, read back stage_no.
- **Trace.** P2 · automate · `EDGE-STG-009` · `app/controllers/concerns/trade_controller_helper.rb:3303`

#### API-XSTG-010 — A well-formed but non-existent event_group_uuid is refused
- **Why it matters.** The event group lookup is company-scoped; this proves a stale or foreign id cannot receive a round.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.event_group_uuid = Z2dnWmdaUWtnZw==
  (encodes id 999999999). Then read the event group back.
- **Expected.** HTTP 422 with error.code 888 'Invalid Parameters' from check_if_allowed_to_add_trade_to_event_group
  app/controllers/concerns/trade_controller_helper.rb:3648-3649 (EventGroup scoped to the caller’s company); nothing is created.
- **Oracle.** 422 code 888.
- **Trace.** P0 · automate · `EDGE-STG-010` · `app/controllers/concerns/trade_controller_helper.rb:3649`

#### API-XSTG-011 — An undecodable event_group_uuid creates a stray standalone event instead of being refused
- **Why it matters.** A garbled id must never be read as "no event"; it silently forks the buyer's event into a second one.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.event_group_uuid = WrongUuid1=. Then
  read the event group back.
- **Expected.** No 5xx. It SHOULD be refused (888/2). EncryptDecrypt.decode_data returns nil for this string, so params[event_group_id] is blank,
  the ownership check is skipped (app/controllers/concerns/trade_controller_helper.rb:3295) and add_dummy_event_group_to_trade
  builds a brand-new event group (app/controllers/api/trade_controller.rb:217-235). The line-item form still points at the fixture’s
  line item, so the new event borrows another event’s line item.
- **Oracle.** 4xx expected; if 2xx, the response's event group differs from {{eventGroupUuid}} — file it.
- **Trace.** P1 · automate · `EDGE-STG-011` · `app/controllers/concerns/trade_controller_helper.rb:3295`

#### API-XSTG-012 — A round's uuid sent as the event_group_uuid is not accepted as an event id
- **Why it matters.** Id-type confusion is how rounds end up on the wrong event.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.event_group_uuid = {{tradeId}} (a
  TradeRequest uuid, not an EventGroup uuid). Then read the event group back.
- **Expected.** No 5xx. uuids are an obfuscated integer, so a trade uuid decodes to a valid-looking event group id; the only guard is company
  scope (app/controllers/concerns/trade_controller_helper.rb:3648). If an event group of this company has that id, the round is
  attached to an unrelated event. Expected 888.
- **Oracle.** Status < 500; if 2xx, check which event the round landed on.
- **Trace.** P1 · automate · `EDGE-STG-012` · `app/controllers/concerns/trade_controller_helper.rb:3648`

#### API-XSTG-013 — A round cannot be created for another company
- **Why it matters.** company_id is taken from params; this is the only thing preventing a buyer from writing rounds into a vendor's company.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.company_uuid = {{vendorUuid}} (the
  vendor's company). Then read the event group back.
- **Expected.** HTTP 422 with error.code 5 'Not authorized' from Api::TradeController#create app/controllers/api/trade_controller.rb:150-153
  (company_id must be in Current.allowed_companies); nothing is created.
- **Oracle.** 422 code 5.
- **Trace.** P0 · automate · `EDGE-STG-013` · `app/controllers/api/trade_controller.rb:153`

#### API-XSTG-014 — broker_company_uuid is not taken from the client
- **Why it matters.** trade identifiers decide who can see a round; a client-chosen broker company is a visibility escalation.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.broker_company_uuid = {{vendorUuid}}.
  Then read the event group back.
- **Expected.** No 5xx. broker_company_id is copied from params unchecked (app/controllers/api/trade_controller.rb:174-175) and fed to
  set_trade_identifiers_for_new_trade; it SHOULD be ignored or refused. If 2xx, the round carries the vendor as its broker.
- **Oracle.** Status < 500; if 2xx, read back broker_company and flag a non-null value.
- **Trace.** P1 · automate · `EDGE-STG-014` · `app/controllers/api/trade_controller.rb:175`

#### API-XSTG-015 — An unknown status value is a 4xx, not an enum crash
- **Why it matters.** status is client-controlled on this endpoint; every unexpected value must fail cleanly.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: status = "published". Then read the event group back.
- **Expected.** No 5xx. new_trade.status = status (app/controllers/api/trade_controller.rb:146) raises ArgumentError for a value outside the enum
  (app/models/trade_request.rb:162); nothing rescues it, so today this is a 500. Expected 422.
- **Oracle.** Status < 500 with a {code,message} body.
- **Trace.** P1 · automate · `EDGE-STG-015` · `app/controllers/api/trade_controller.rb:146`

#### API-XSTG-016 — Omitting status creates a LIVE round, not a draft
- **Why it matters.** The journey always sends status draft; a client that forgets it publishes a round by accident.
- **Setup.** Published (status active) event group {{eventGroupUuid}} holding exactly one RFQ round {{tradeId}} and no RFP or auction round
  (the platform's standard RFQ fixture), line item {{lineItemUuid}}, product {{productUuid}}, variant {{productQualityUuid}},
  location {{locationUuid}}. Buyer session whose user has trade create_record permission and sourcing-events access
  (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: status removed from the body (round window 2020-01-01
  00:00–01:00 UTC so the RFP/RFQ timing rule does not fire). Then read the event group back.
- **Expected.** No 5xx. status defaults to "active" (app/controllers/api/trade_controller.rb:138), so the technical round is created live on the
  live event without the add-new-stage policy (app/services/add_new_stage/validate_service.rb). Expected: a missing status is
  treated as draft or refused.
- **Oracle.** Status < 500; if 2xx, the round's status is read back — active is the defect.
- **Trace.** P1 · automate · `EDGE-STG-016` · `app/controllers/api/trade_controller.rb:138`

#### API-XSTG-017 — A technical form pointing at a line item of another event is refused
- **Why it matters.** Line-item forms are evaluated per line item; a foreign line item would leak one event's questionnaire into another.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: forms[1].event_group_line_item_uuid = Z2dnWmdaUWtnZw==.
  Then read the event group back.
- **Expected.** HTTP 422 with error.code 890 'Event group line item does not belong to the specified event group' from
  validate_egli_ids_belong_to_event_group app/controllers/concerns/trade_controller_helper.rb:3679-3689; nothing is created.
- **Oracle.** 422 code 890.
- **Trace.** P0 · automate · `EDGE-STG-017` · `app/controllers/concerns/trade_controller_helper.rb:3688`

#### API-XSTG-018 — A pricing row pointing at a line item of another event is refused
- **Why it matters.** Same guard, reached through trade_products instead of forms.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: data[0].product.event_group_line_item_uuid =
  Z2dnWmdaUWtnZw==. Then read the event group back.
- **Expected.** HTTP 422 with error.code 890 'Event group line item does not belong to the specified event group' from
  validate_egli_ids_belong_to_event_group app/controllers/concerns/trade_controller_helper.rb:3679-3689; nothing is created.
- **Oracle.** 422 code 890.
- **Trace.** P1 · automate · `EDGE-STG-018` · `app/controllers/concerns/trade_controller_helper.rb:3688`

#### API-XSTG-019 — A second technical round on a draft silently voids the first
- **Why it matters.** A double-click or a retry after a timeout replaces the buyer's configured round; the response gives no hint.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company. The draft already has a draft RFP round.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: nothing — a second complete technical round on a draft
  that already has one. Then read the event group back.
- **Expected.** No 5xx and a 2xx. On a draft, check_duplicate_stages_in_draft_event_group
  (app/controllers/concerns/trade_controller_helper.rb:3692-3708, update!(status: :void) at 3702) voids the existing same-mode round
  and its forms/access lists without telling the caller. Documents that the earlier round (and any evaluator set on it) is gone.
- **Oracle.** 2xx; the previous RFP round's status reads void.
- **Trace.** P1 · automate · `EDGE-STG-019` · `app/controllers/concerns/trade_controller_helper.rb:3702`

## 2. Schedule and timing

bid_start_time / bid_end_time / extra_closing_time are epoch seconds. `create_trade_schedule` (app/controllers/concerns/trade_controller_helper.rb:1989-2013) turns them into TradeSchedule rows with `DateTime.strptime(x.to_s, '%s')`, and TradeSchedule has no validations at all — so ordering and range are unguarded here. The fixed epochs used below are 2030-01-01 00:00/01:00/01:30 UTC; refresh them before 2029.

#### API-XSTG-020 — A draft technical round may end after the RFQ (the timing rule is deferred to publish)
- **Why it matters.** Technical-before-pricing is the core event rule; knowing WHERE it is enforced keeps the publish-time check from being dropped.
- **Setup.** Draft event group {{eventGroupUuid}} that already has a draft RFQ round whose bid end time is earlier than 2030-01-01 01:00 UTC
  (any round the platform attaches today), line item {{lineItemUuid}}, evaluator {{userUuid}}. Buyer session whose user has trade
  create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: nothing beyond the working draft RFP body (its 2030 bid
  end is later than the RFQ's). Then read the event group back.
- **Expected.** No 5xx, 2xx expected. validate_rfp_rfq_bid_end_time returns nil for a draft round
  (app/controllers/concerns/trade_controller_helper.rb:646), so 712 is not raised at round creation; the rule must then be enforced
  when the event is published. Record it and re-check at publish.
- **Oracle.** 2xx; publishing this event later must fail with 712.
- **Trace.** P1 · automate · `EDGE-STG-020` · `app/controllers/concerns/trade_controller_helper.rb:646`

#### API-XSTG-021 — A live technical round that ends after the RFQ is refused
- **Why it matters.** Vendors must finish the technical round before pricing closes; this is the only server-side check at creation.
- **Setup.** Draft event group {{eventGroupUuid}} that already has a draft RFQ round whose bid end time is earlier than 2030-01-01 01:00 UTC
  (any round the platform attaches today), line item {{lineItemUuid}}, evaluator {{userUuid}}. Buyer session whose user has trade
  create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: status = active (the RFP bid end 2030-01-01 01:00 is
  after the RFQ's). Then read the event group back.
- **Expected.** HTTP 422 with error.code 712 'RFP duration exceeds RFQ end time. Please adjust.' from validate_rfp_rfq_bid_end_time
  app/controllers/concerns/trade_controller_helper.rb:643-673 via set_trade_schedules
  app/controllers/concerns/trade_controller_helper.rb:501; nothing is created.
- **Oracle.** 422 code 712.
- **Trace.** P0 · automate · `EDGE-STG-021` · `app/controllers/concerns/trade_controller_helper.rb:669`

#### API-XSTG-022 — A live technical round with no bid end must not crash the timing rule
- **Why it matters.** The timing rule runs before the schedule is built, so a missing end time reaches it raw.
- **Setup.** Draft event group {{eventGroupUuid}} that already has a draft RFQ round whose bid end time is earlier than 2030-01-01 01:00 UTC
  (any round the platform attaches today), line item {{lineItemUuid}}, evaluator {{userUuid}}. Buyer session whose user has trade
  create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: status = active and configurations.bid_end_time = null.
  Then read the event group back.
- **Expected.** No 5xx. validate_rfp_rfq_bid_end_time evaluates Time.at(params["bid_end_time"])
  (app/controllers/concerns/trade_controller_helper.rb:668) — Time.at(nil) raises TypeError. Expected 422.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-022` · `app/controllers/concerns/trade_controller_helper.rb:668`

#### API-XSTG-023 — A round whose bid end is before its bid start is refused
- **Why it matters.** An inverted window makes the round closed before it opens; vendors never get to respond.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.bid_end_time = bid_start_time − 3600
  (1893452400). Then read the event group back.
- **Expected.** No 5xx. It SHOULD be refused: create_trade_schedule does not compare start and end
  (app/controllers/concerns/trade_controller_helper.rb:1997-2006) and TradeSchedule has no validations
  (app/models/trade_schedule.rb), so a negative-length window is stored. A 2xx is a defect.
- **Oracle.** 4xx expected; if 2xx, flag it.
- **Trace.** P1 · automate · `EDGE-STG-023` · `app/controllers/concerns/trade_controller_helper.rb:1997`

#### API-XSTG-024 — A zero-length bidding window is refused
- **Why it matters.** A round that closes the instant it opens is unusable and hides behind a 2xx.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.bid_end_time = bid_start_time
  (1893456000). Then read the event group back.
- **Expected.** No 5xx. No minimum duration is checked (app/controllers/concerns/trade_controller_helper.rb:1997-2006); a 0-second round SHOULD be
  refused.
- **Oracle.** 4xx expected; if 2xx, flag it.
- **Trace.** P1 · automate · `EDGE-STG-024` · `app/controllers/concerns/trade_controller_helper.rb:1997`

#### API-XSTG-025 — A round starting in the past is refused or normalised
- **Why it matters.** Back-dated starts confuse the evaluation clock and audit trail.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.bid_start_time = 1577836800
  (2020-01-01). Then read the event group back.
- **Expected.** No 5xx. No lower bound on bid_start_time (app/controllers/concerns/trade_controller_helper.rb:510-512). Expected either a refusal
  or the start clamped to now.
- **Oracle.** Status < 500; if 2xx, read the stored start.
- **Trace.** P1 · automate · `EDGE-STG-025` · `app/controllers/concerns/trade_controller_helper.rb:511`

#### API-XSTG-026 — An extra closing time before the bid end is refused
- **Why it matters.** The app treats bidding as over at the extra closing time; an earlier one closes the round early.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.extra_closing_time = bid_end_time −
  1800. Then read the event group back.
- **Expected.** No 5xx. The extra-closing schedule starts at bid_end_time and ends at extra_closing_time
  (app/controllers/concerns/trade_controller_helper.rb:521-529) with no ordering check, so an inverted grace period is stored.
  SHOULD be refused.
- **Oracle.** 4xx expected.
- **Trace.** P1 · automate · `EDGE-STG-026` · `app/controllers/concerns/trade_controller_helper.rb:526`

#### API-XSTG-027 — No extra closing time at all is allowed
- **Why it matters.** The grace period is an option, not a requirement; making it mandatory would break quick-flow rounds.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.extra_closing_time = null. Then read the
  event group back.
- **Expected.** 2xx. extra_closing_time is optional: set_trade_schedules only builds that row when it is present
  (app/controllers/concerns/trade_controller_helper.rb:521).
- **Oracle.** 2xx and a round with a bidding-time schedule only.
- **Trace.** P2 · automate · `EDGE-STG-027` · `app/controllers/concerns/trade_controller_helper.rb:521`

#### API-XSTG-028 — Millisecond timestamps are not silently read as the year 61970
- **Why it matters.** ms-vs-s is the most common epoch bug in JS clients; the round would never close.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.bid_end_time = 1893459600000
  (milliseconds, as JavaScript Date.now() gives). Then read the event group back.
- **Expected.** No 5xx. strptime(’%s’) accepts it (app/controllers/concerns/trade_controller_helper.rb:1997) and the round is stored ending in
  year ~61970. It SHOULD be refused as out of range.
- **Oracle.** 4xx expected; if 2xx, read the stored end time and flag it.
- **Trace.** P1 · automate · `EDGE-STG-028` · `app/controllers/concerns/trade_controller_helper.rb:1997`

#### API-XSTG-029 — A decimal epoch does not crash the schedule builder
- **Why it matters.** Fractional seconds come from any client that divides ms by 1000.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.bid_end_time = 1893459600.5. Then read
  the event group back.
- **Expected.** No 5xx. DateTime.strptime("1893459600.5", ’%s’) leaves ".5" unparsed and raises ArgumentError
  (app/controllers/concerns/trade_controller_helper.rb:1997), which is not rescued. Expected 422 or truncation.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-029` · `app/controllers/concerns/trade_controller_helper.rb:1997`

#### API-XSTG-030 — An ISO-8601 date string for bid_end_time does not crash
- **Why it matters.** Integrations send ISO dates far more often than epochs.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.bid_end_time = "2030-01-01T01:00:00Z".
  Then read the event group back.
- **Expected.** No 5xx. "2030-01-01T01:00:00Z".to_i is 2030 (> 0), then strptime("2030-01-01T01:00:00Z", ’%s’) raises on the leftover text
  (app/controllers/concerns/trade_controller_helper.rb:1997). Expected 422.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-030` · `app/controllers/concerns/trade_controller_helper.rb:1997`

#### API-XSTG-031 — A negative bid_end_time does not crash on the NOT NULL schedule column
- **Why it matters.** Guards the create path's error handling, not just the value.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.bid_end_time = -1. Then read the event
  group back.
- **Expected.** No 5xx. to_i <= 0 leaves end_time nil (app/controllers/concerns/trade_controller_helper.rb:1997); trade_schedules.end_time is NOT
  NULL, and the resulting NotNullViolation is not the RecordInvalid that create rescues
  (app/controllers/api/trade_controller.rb:349). Expected 422.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-031` · `app/controllers/concerns/trade_controller_helper.rb:1997`

#### API-XSTG-032 — No bid_start_time means the round starts now
- **Why it matters.** Documents the default so a stricter rule is a deliberate change.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.bid_start_time = null. Then read the
  event group back.
- **Expected.** 2xx. start_time defaults to DateTime.now when bid_start_time is absent
  (app/controllers/concerns/trade_controller_helper.rb:2002-2005).
- **Oracle.** 2xx; the stored start is within a minute of the call.
- **Trace.** P2 · automate · `EDGE-STG-032` · `app/controllers/concerns/trade_controller_helper.rb:2003`

#### API-XSTG-033 — A staggered line-item round without per-item times does not crash
- **Why it matters.** Staggered closing is a config toggle; flipping it on an existing template must not 500.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.staggered = true (auction_closing_mode
  is line_item_based) with no start_time/end_time on the data row. Then read the event group back.
- **Expected.** No 5xx. is_staggered_on_line is true, so add_staggered_details calls valid_time_entries(nil, nil, …) and Time.at(nil) raises
  TypeError (app/controllers/concerns/trade_template_helper.rb:1686-1703). Expected 422 507.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-033` · `app/controllers/concerns/trade_template_helper.rb:1701`

#### API-XSTG-034 — A staggered line item that opens before the round is refused
- **Why it matters.** Per-item windows must sit inside the round window or the round-level clock lies.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.staggered = true and
  data[0].start_time.value = bid_start_time − 600. Then read the event group back.
- **Expected.** HTTP 422 with error.code 507 'Invalid Time Input' from TradeTemplateHelper#add_staggered_details
  app/controllers/concerns/trade_template_helper.rb:1689 (valid_time_entries
  app/controllers/concerns/trade_template_helper.rb:1699-1705); nothing is created.
- **Oracle.** 422 code 507.
- **Trace.** P1 · automate · `EDGE-STG-034` · `app/controllers/concerns/trade_template_helper.rb:1689`

#### API-XSTG-035 — A non-epoch closed_at does not crash
- **Why it matters.** closed_at is merged from configurations into params and parsed unguarded.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.closed_at = "tomorrow". Then read the
  event group back.
- **Expected.** No 5xx. DateTime.strptime("tomorrow", ’%s’) raises ArgumentError inside the create transaction
  (app/controllers/api/trade_controller.rb:240). Expected 422 or ignore.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-STG-035` · `app/controllers/api/trade_controller.rb:240`

## 3. Auction configuration

Strategy (`auction_config`), traffic-light ranges, knockout/dutch price ladders, basket auctions and fast bidding, all validated in `set_configurations_for_trade` (app/controllers/concerns/trade_controller_helper.rb:3277-3636). The body is the journey's auction round (rfx_mode auction, lot_based closing).

#### API-XSTG-036 — An auction strategy outside the enum is a 4xx, not a crash
- **Why it matters.** Strategy is the one field that decides what vendors see; bad values must fail cleanly.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.auction_config = "silent". Then read the
  event group back.
- **Expected.** No 5xx. new_trade.auction_config = "silent" raises ArgumentError against the enum (app/models/trade_request.rb:166, assigned at
  app/controllers/concerns/trade_controller_helper.rb:3534). Expected 422.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-036` · `app/controllers/concerns/trade_controller_helper.rb:3534`

#### API-XSTG-037 — An auction with no strategy defaults to rank
- **Why it matters.** A silent default changes what vendors see (rank vs price) without the buyer choosing it.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.auction_config removed. Then read the
  event group back.
- **Expected.** No 5xx and, today, a 2xx: auction_config.present? ? auction_config : "rank"
  (app/controllers/concerns/trade_controller_helper.rb:3534). This contradicts library case EVT-RFPA-002, which expects a refusal —
  one of the two is wrong; read back auction_config.
- **Oracle.** Status < 500; read back auction_config.
- **Trace.** P1 · automate · `EDGE-STG-037` · `app/controllers/concerns/trade_controller_helper.rb:3534`

#### API-XSTG-038 — A traffic-light auction without ranges is refused
- **Why it matters.** Without ranges every vendor's colour is undefined.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.auction_config = traffic_light, no
  traffic_light_ranges. Then read the event group back.
- **Expected.** HTTP 422 with error.code 269 'You have not provided valid traffic light ranges.' from set_configurations_for_trade
  app/controllers/concerns/trade_controller_helper.rb:3436-3440 (lot-based sheet auction); nothing is created.
- **Oracle.** 422 code 269.
- **Trace.** P0 · automate · `EDGE-STG-038` · `app/controllers/concerns/trade_controller_helper.rb:3440`

#### API-XSTG-039 — Traffic-light ranges with equal bounds are refused
- **Why it matters.** Equal bounds collapse the yellow band; boundary for the strict < comparison.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: traffic_light_ranges {lower_bound 10, upper_bound 10}.
  Then read the event group back.
- **Expected.** HTTP 422 with error.code 269 'You have not provided valid traffic light ranges.' from is_valid_traffic_light_ranges?
  app/controllers/concerns/trade_controller_helper.rb:3167-3172 (buy needs lower < upper); nothing is created.
- **Oracle.** 422 code 269.
- **Trace.** P1 · automate · `EDGE-STG-039` · `app/controllers/concerns/trade_controller_helper.rb:3444`

#### API-XSTG-040 — Inverted traffic-light ranges on a buy auction are refused
- **Why it matters.** Inverted ranges paint the best bid red.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: traffic_light_ranges {lower_bound 20, upper_bound 10}.
  Then read the event group back.
- **Expected.** HTTP 422 with error.code 269 'You have not provided valid traffic light ranges.' from is_valid_traffic_light_ranges?
  app/controllers/concerns/trade_controller_helper.rb:3168-3169; nothing is created.
- **Oracle.** 422 code 269.
- **Trace.** P1 · automate · `EDGE-STG-040` · `app/controllers/concerns/trade_controller_helper.rb:3444`

#### API-XSTG-041 — Valid traffic-light ranges are accepted
- **Why it matters.** The positive control for the three refusals above.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: traffic_light_ranges {lower_bound 10, upper_bound 20}.
  Then read the event group back.
- **Expected.** 2xx. lower < upper on a buy auction passes is_valid_traffic_light_ranges?
  (app/controllers/concerns/trade_controller_helper.rb:3168-3169) and is stored in misc.traffic_light_ranges.
- **Oracle.** 2xx; misc.traffic_light_ranges reads back 10/20.
- **Trace.** P2 · automate · `EDGE-STG-041` · `app/controllers/concerns/trade_controller_helper.rb:3445`

#### API-XSTG-042 — A line-item traffic-light auction without ranges is not refused (ranges skipped)
- **Why it matters.** Closing-mode changes silently move a validation — worth pinning.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: auction_config traffic_light with auction_closing_mode
  line_item_based and no ranges. Then read the event group back.
- **Expected.** No 5xx. store_ranges_on_lot is false for a line-item sheet (app/controllers/concerns/trade_controller_helper.rb:3437), so no
  ranges are demanded at creation; they must come per line item later (app/controllers/concerns/trade_controller_helper.rb:1928).
  Documents where the rule moves.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-STG-042` · `app/controllers/concerns/trade_controller_helper.rb:3437`

#### API-XSTG-043 — A knockout auction without a start price is refused
- **Why it matters.** Knockout rounds tick down from bulk_price; without it there is no ladder.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: auction_config knockout with bulk_price null. Then read
  the event group back.
- **Expected.** HTTP 422 with error.code 237 'Please enter all the required entries for creating the auction.' from set_configurations_for_trade
  knockout branch app/controllers/concerns/trade_controller_helper.rb:3458-3459; nothing is created.
- **Oracle.** 422 code 237.
- **Trace.** P1 · automate · `EDGE-STG-043` · `app/controllers/concerns/trade_controller_helper.rb:3459`

#### API-XSTG-044 — A knockout start price of zero is refused
- **Why it matters.** 0 is present? in Ruby (0.0.present? is true), so this hits the price check, not the missing-field check.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: auction_config knockout with bulk_price 0. Then read
  the event group back.
- **Expected.** HTTP 422 with error.code 106 'Please enter a valid price' from app/controllers/concerns/trade_controller_helper.rb:3452-3453
  (bulk_price <= 0); nothing is created.
- **Oracle.** 422 code 106.
- **Trace.** P1 · automate · `EDGE-STG-044` · `app/controllers/concerns/trade_controller_helper.rb:3453`

#### API-XSTG-045 — A knockout step interval under 30 seconds is refused
- **Why it matters.** Sub-30s steps outrun vendors' ability to respond.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: auction_config knockout with time_difference 29. Then
  read the event group back.
- **Expected.** HTTP 422 with error.code 248 'Time difference cannot be less than 30 seconds' from
  app/controllers/concerns/trade_controller_helper.rb:3455-3456; nothing is created.
- **Oracle.** 422 code 248.
- **Trace.** P1 · automate · `EDGE-STG-045` · `app/controllers/concerns/trade_controller_helper.rb:3456`

#### API-XSTG-046 — A knockout step interval of exactly 30 seconds is accepted
- **Why it matters.** Pins the inclusive boundary.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: auction_config knockout with time_difference 30. Then
  read the event group back.
- **Expected.** 2xx. The guard is time_difference < 30 (app/controllers/concerns/trade_controller_helper.rb:3455); 30 passes, start+30 is inside
  the window, status draft so nothing publishes (app/controllers/api/trade_controller.rb:274).
- **Oracle.** 2xx; misc.auction_strategy_config.time_difference = 30.
- **Trace.** P2 · automate · `EDGE-STG-046` · `app/controllers/concerns/trade_controller_helper.rb:3455`

#### API-XSTG-047 — A knockout step interval sent as a string does not crash
- **Why it matters.** Form-encoded clients send numbers as strings.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: auction_config knockout with time_difference "45". Then
  read the event group back.
- **Expected.** No 5xx. "45" < 30 raises ArgumentError (comparison of String with Integer) at
  app/controllers/concerns/trade_controller_helper.rb:3455. Expected 422 or coercion.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-047` · `app/controllers/concerns/trade_controller_helper.rb:3455`

#### API-XSTG-048 — A knockout step interval longer than the round is refused
- **Why it matters.** The first step would fall after the round closes.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: auction_config knockout with time_difference 7200 in a
  3600-second window. Then read the event group back.
- **Expected.** HTTP 422 with error.code 238 'Time difference cannot be greater than auction time.' from
  app/controllers/concerns/trade_controller_helper.rb:3461-3462; nothing is created.
- **Oracle.** 422 code 238.
- **Trace.** P1 · automate · `EDGE-STG-048` · `app/controllers/concerns/trade_controller_helper.rb:3462`

#### API-XSTG-049 — A knockout auction inside a basket is refused
- **Why it matters.** Basket rounds duplicate the trade per product; knockout state cannot be duplicated.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: auction_config knockout and is_basket_auction true.
  Then read the event group back.
- **Expected.** HTTP 422 with error.code 474 'Sorry, trade with this configuration is not allowed' from Api::TradeController#create
  app/controllers/api/trade_controller.rb:142-143; nothing is created.
- **Oracle.** 422 code 474.
- **Trace.** P1 · automate · `EDGE-STG-049` · `app/controllers/api/trade_controller.rb:143`

#### API-XSTG-050 — A dutch auction with the journey's end_price 0 is refused
- **Why it matters.** The working body always sends end_price 0; switching strategy to dutch without touching it must be refused, not stored.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: auction_config dutch with the body's own end_price 0.
  Then read the event group back.
- **Expected.** HTTP 422 with error.code 106 'Please enter a valid price' from app/controllers/concerns/trade_controller_helper.rb:3482-3483
  (end_price <= 0); nothing is created.
- **Oracle.** 422 code 106.
- **Trace.** P1 · automate · `EDGE-STG-050` · `app/controllers/concerns/trade_controller_helper.rb:3483`

#### API-XSTG-051 — A buy-side dutch auction whose start is above its end is refused
- **Why it matters.** A buy dutch ladder climbs; a descending one is a sell ladder in disguise.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: auction_config dutch with bulk_price 300, end_price
  200. Then read the event group back.
- **Expected.** HTTP 422 with error.code 242 'Start Price cannot be less than End Price' from
  app/controllers/concerns/trade_controller_helper.rb:3492-3493 (buy: bulk_price > end_price); nothing is created.
- **Oracle.** 422 code 242.
- **Trace.** P1 · automate · `EDGE-STG-051` · `app/controllers/concerns/trade_controller_helper.rb:3493`

#### API-XSTG-052 — A dutch price step bigger than the whole range is refused
- **Why it matters.** One step would jump past the end price.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: auction_config dutch with price_difference 150 on a
  100-wide range. Then read the event group back.
- **Expected.** HTTP 422 with error.code 243 'Invalid Tick Size' from app/controllers/concerns/trade_controller_helper.rb:3494; nothing is
  created.
- **Oracle.** 422 code 243.
- **Trace.** P1 · automate · `EDGE-STG-052` · `app/controllers/concerns/trade_controller_helper.rb:3494`

#### API-XSTG-053 — A dutch price step equal to the range is accepted
- **Why it matters.** Pins the inclusive boundary of the tick rule.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: auction_config dutch with price_difference 100 on a
  100-wide range. Then read the event group back.
- **Expected.** 2xx. The guard is price_difference > (end_price − bulk_price) (app/controllers/concerns/trade_controller_helper.rb:3494); equality
  passes.
- **Oracle.** 2xx.
- **Trace.** P2 · automate · `EDGE-STG-053` · `app/controllers/concerns/trade_controller_helper.rb:3494`

#### API-XSTG-054 — A sell-side dutch auction whose start is below its end is refused
- **Why it matters.** The sell branch has its own inverted rule and negates price_difference; both need coverage.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: order_type sell, auction_config dutch, bulk_price 100,
  end_price 200. Then read the event group back.
- **Expected.** HTTP 422 with error.code 241 'Start Price cannot be greater than End Price' from
  app/controllers/concerns/trade_controller_helper.rb:3488-3489 (sell: bulk_price < end_price); nothing is created.
- **Oracle.** 422 code 241.
- **Trace.** P2 · automate · `EDGE-STG-054` · `app/controllers/concerns/trade_controller_helper.rb:3489`

#### API-XSTG-055 — A basket auction whose rows carry no per-item T&C does not crash
- **Why it matters.** Basket is a checkbox on the auction screen; turning it on for a normal sheet must not 500.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.is_basket_auction = true on the
  rank/price auction. Then read the event group back.
- **Expected.** No 5xx. set_configurations_for_trade reads params["trade_products"][0]["terms_and_conditions"]["status"]
  (app/controllers/concerns/trade_controller_helper.rb:3544); the row has no terms_and_conditions (compact! drops it), so
  nil["status"] raises NoMethodError. Expected 422.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-055` · `app/controllers/concerns/trade_controller_helper.rb:3544`

#### API-XSTG-056 — is_basket_auction "false" (a string) is not treated as true
- **Why it matters.** String booleans from form posts flip behaviour silently.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.is_basket_auction = "false". Then read
  the event group back.
- **Expected.** No 5xx. is_basket_auctions = params["is_basket_auction"].present? ? … (app/controllers/api/trade_controller.rb:139) makes the
  string "false" truthy and takes the basket path, then the per-item T&C read crashes
  (app/controllers/concerns/trade_controller_helper.rb:3544). Expected a boolean cast.
- **Oracle.** Status < 500; if 2xx, misc.is_basket_auctions must read false.
- **Trace.** P1 · automate · `EDGE-STG-056` · `app/controllers/api/trade_controller.rb:139`

#### API-XSTG-057 — Auction-only fields on a technical round are not validated as an auction
- **Why it matters.** A technical round refused for missing auction prices shows the strategy checks are not scoped to auctions.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.auction_config = knockout on the RFP
  body (bulk_price null). Then read the event group back.
- **Expected.** HTTP 422 with error.code 237 'Please enter all the required entries for creating the auction.' from
  app/controllers/concerns/trade_controller_helper.rb:3458-3459 — the knockout branch keys on auction_config, not rfx_mode, so it
  runs for an RFP; nothing is created.
- **Oracle.** 422 code 237.
- **Trace.** P2 · automate · `EDGE-STG-057` · `app/controllers/concerns/trade_controller_helper.rb:3459`

#### API-XSTG-058 — Fast bidding on a technical round is refused
- **Why it matters.** Order-of-assignment bug: the guard validates the DB default, not the requested mode.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: fast_bidding_mode_enabled true and auction_closing_mode
  lot_based on the RFP body. Then read the event group back.
- **Expected.** No 5xx. It SHOULD be 101: fast bidding is for auction / rfq_then_auction only (FAST_FILLING_VALID_RFX_MODES
  app/models/trade_request.rb:316). But the check at app/controllers/concerns/trade_controller_helper.rb:3354-3360 reads
  new_trade.rfx_mode BEFORE it is assigned (app/controllers/concerns/trade_controller_helper.rb:3568-3589) — the column default is 0
  = auction — so every mode passes with lot_based closing. A 2xx with is_fast_bidding_mode_enabled on an RFP is the defect.
- **Oracle.** 4xx expected; if 2xx, read back is_fast_bidding_mode_enabled.
- **Trace.** P1 · automate · `EDGE-STG-058` · `app/controllers/concerns/trade_controller_helper.rb:3357`

#### API-XSTG-059 — Fast bidding with line-item closing is refused
- **Why it matters.** Fast bidding compares a lot total; line-item closing has none.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: fast_bidding_mode_enabled true with
  auction_closing_mode line_item_based on the auction. Then read the event group back.
- **Expected.** HTTP 422 with error.code 101 'You are not allowed to perform this action' from
  app/controllers/concerns/trade_controller_helper.rb:3355-3358 (not rfq_then_auction and line_item_based); nothing is created.
- **Oracle.** 422 code 101.
- **Trace.** P2 · automate · `EDGE-STG-059` · `app/controllers/concerns/trade_controller_helper.rb:3358`

#### API-XSTG-060 — A negative tick size is refused
- **Why it matters.** Tick size is the auction's anti-sniping rule; a negative value inverts it.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: data[0].tick_size.value = -5. Then read the event group
  back.
- **Expected.** No 5xx. tick_size is only to_f’d into validations.default.tick_size (app/controllers/concerns/trade_template_helper.rb:1455-1458,
  1482); nothing checks its sign. A negative decrement lets vendors RAISE price in a reverse auction. SHOULD be refused.
- **Oracle.** 4xx expected; if 2xx, flag it.
- **Trace.** P1 · automate · `EDGE-STG-060` · `app/controllers/concerns/trade_template_helper.rb:1458`

#### API-XSTG-061 — A tick size over 100 percent is refused
- **Why it matters.** Percent fields need a 0–100 range.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: data[0].tick_size_percentage.value = 150. Then read the
  event group back.
- **Expected.** No 5xx. tick_size_percentage is to_f’d without a range (app/controllers/concerns/trade_template_helper.rb:1459). A >100% decrement
  makes every second bid impossible.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-STG-061` · `app/controllers/concerns/trade_template_helper.rb:1459`

#### API-XSTG-062 — A price cap below the price floor is refused
- **Why it matters.** An empty price band makes the round unbiddable without any error to the buyer.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: data[0].ceil_price.value = 100 and
  data[0].floor_price.value = 500. Then read the event group back.
- **Expected.** No 5xx. ceil_price and floor_price are stored side by side (app/controllers/concerns/trade_template_helper.rb:1481-1485) with no
  cap ≥ floor check at creation. No valid bid exists; SHOULD be refused.
- **Oracle.** 4xx expected.
- **Trace.** P1 · automate · `EDGE-STG-062` · `app/controllers/concerns/trade_template_helper.rb:1481`

#### API-XSTG-063 — Dynamic extension without a trigger window is refused
- **Why it matters.** Without last-N minutes the extension can never trigger or triggers always.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: is_dynamic_closing_time_allowed true,
  last_n_minutes_for_time_extension null. Then read the event group back.
- **Expected.** HTTP 422 with error.code 501 'Invalid Trigger Time for Dynamic Time Extension.' from set_configurations_for_trade
  app/controllers/concerns/trade_controller_helper.rb:3317-3320; nothing is created.
- **Oracle.** 422 code 501.
- **Trace.** P0 · automate · `EDGE-STG-063` · `app/controllers/concerns/trade_controller_helper.rb:3319`

#### API-XSTG-064 — A zero-minute extension trigger is refused
- **Why it matters.** Boundary under the < 1 rule.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: last_n_minutes_for_time_extension = 0. Then read the
  event group back.
- **Expected.** HTTP 422 with error.code 501 'Invalid Trigger Time for Dynamic Time Extension.' from
  app/controllers/concerns/trade_controller_helper.rb:3317 (last_n < 1); nothing is created.
- **Oracle.** 422 code 501.
- **Trace.** P1 · automate · `EDGE-STG-064` · `app/controllers/concerns/trade_controller_helper.rb:3319`

#### API-XSTG-065 — A one-minute extension trigger is accepted
- **Why it matters.** Inclusive lower boundary.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: last_n_minutes_for_time_extension = 1. Then read the
  event group back.
- **Expected.** 2xx. 1 is not < 1 and is far under half of the (2030) window (app/controllers/concerns/trade_controller_helper.rb:6259-6268).
- **Oracle.** 2xx; config.last_n_minutes_for_time_extension = 1.
- **Trace.** P2 · automate · `EDGE-STG-065` · `app/controllers/concerns/trade_controller_helper.rb:3317`

#### API-XSTG-066 — An extension trigger sent as a string does not crash
- **Why it matters.** String numbers from form posts.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: last_n_minutes_for_time_extension = "5". Then read the
  event group back.
- **Expected.** No 5xx. "5" < 1 raises ArgumentError at app/controllers/concerns/trade_controller_helper.rb:3317. Expected 422 501 or coercion.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-066` · `app/controllers/concerns/trade_controller_helper.rb:3317`

#### API-XSTG-067 — A fractional extension trigger does not trip the Integer signature
- **Why it matters.** Sorbet sigs raise at runtime; untyped JSON reaches them directly.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: last_n_minutes_for_time_extension = 2.5. Then read the
  event group back.
- **Expected.** No 5xx. less_than_half_of_trade_end_time has sig minutes: Integer (app/controllers/concerns/trade_controller_helper.rb:6258-6259);
  a Float fails the Sorbet runtime check with TypeError. Expected 422 or rounding.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-067` · `app/controllers/concerns/trade_controller_helper.rb:6258`

#### API-XSTG-068 — An extension trigger longer than half the remaining window is refused
- **Why it matters.** The trigger must fit inside the live part of the round.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: last_n_minutes_for_time_extension = 10000000 (≈19
  years, over half of now→2030). Then read the event group back.
- **Expected.** HTTP 422 with error.code 501 'Invalid Trigger Time for Dynamic Time Extension.' from less_than_half_of_trade_end_time
  app/controllers/concerns/trade_controller_helper.rb:6259-6268; nothing is created.
- **Oracle.** 422 code 501.
- **Trace.** P1 · automate · `EDGE-STG-068` · `app/controllers/concerns/trade_controller_helper.rb:3319`

#### API-XSTG-069 — Dynamic extension on a window that has already ended is refused
- **Why it matters.** Only guard at creation that notices a round in the past.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: last_n 5 with bid_start 2020-01-01 00:00 and bid_end
  2020-01-01 01:00. Then read the event group back.
- **Expected.** HTTP 422 with error.code 501 'Invalid Trigger Time for Dynamic Time Extension.' from
  app/controllers/concerns/trade_controller_helper.rb:6261-6263 (negative remaining time); nothing is created.
- **Oracle.** 422 code 501.
- **Trace.** P1 · automate · `EDGE-STG-069` · `app/controllers/concerns/trade_controller_helper.rb:3319`

#### API-XSTG-070 — is_dynamic_closing_time_allowed "false" (a string) is not treated as on
- **Why it matters.** Today the buyer who switched the feature OFF gets an error about the feature's settings; the cast is the bug the 501 exposes.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: is_dynamic_closing_time_allowed = "false", no trigger
  window. Then read the event group back.
- **Expected.** HTTP 422 with error.code 501 'Invalid Trigger Time for Dynamic Time Extension.' from
  app/controllers/concerns/trade_controller_helper.rb:3317 — the string "false" is truthy; nothing is created.
- **Oracle.** 422 code 501 (and the message proves the flag was read as on).
- **Trace.** P1 · automate · `EDGE-STG-070` · `app/controllers/concerns/trade_controller_helper.rb:3317`

#### API-XSTG-071 — A negative extension length is refused
- **Why it matters.** Sign errors on extension turn anti-sniping into early closing.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: last_n 5 and time_extension_value = -10. Then read the
  event group back.
- **Expected.** No 5xx. time_extension_value is stored raw (app/controllers/concerns/trade_controller_helper.rb:3376); a negative extension
  shortens the round each time a bid lands. SHOULD be refused.
- **Oracle.** 4xx expected; if 2xx, flag it.
- **Trace.** P1 · automate · `EDGE-STG-071` · `app/controllers/concerns/trade_controller_helper.rb:3376`

## 4. Technical forms — vendor assessment, line-item questionnaire and evaluators

The RFP round's `forms` go through `add_mandatory_widgets_for_rfp_templates` (app/controllers/concerns/trade_template_helper.rb:1993), then `Templates::ValidateService#valid_forms?` (app/services/templates/validate_service.rb:204-252), then `create_form_helper` (app/helpers/api/forms_helper.rb:11-35). valid_forms? RAISES on some shapes (InvalidFormError, InvalidFormDataError) and only rescues two error classes, so several malformed forms reach the client as 500s. Evaluators are attached by `add_evaluators_for_trade_request` (app/controllers/concerns/trade_template_helper.rb:1872-1935) for rfp_evaluation_mode lot_based.

#### API-XSTG-072 — A technical round with no forms is a 4xx, not a crash
- **Why it matters.** The most basic malformed technical round; today it is an unhandled exception.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: forms removed. Then read the event group back.
- **Expected.** No 5xx. valid_forms? raises InvalidFormError when forms is blank (app/services/templates/validate_service.rb:206-208); nothing
  rescues it. Expected 422 792.
- **Oracle.** Status < 500 with {code,message}.
- **Trace.** P0 · automate · `EDGE-STG-072` · `app/services/templates/validate_service.rb:208`

#### API-XSTG-073 — A technical round with an empty forms list is a 4xx, not a crash
- **Why it matters.** Empty list vs missing key take the same path; both must be clean.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: forms = []. Then read the event group back.
- **Expected.** No 5xx. [] is not present?, so the same InvalidFormError is raised (app/services/templates/validate_service.rb:206-208). Expected
  422 792.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-073` · `app/services/templates/validate_service.rb:208`

#### API-XSTG-074 — A form without a name is a 4xx, not a crash
- **Why it matters.** The validator's own error class escapes it.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: forms[0].name removed. Then read the event group back.
- **Expected.** No 5xx. check_required_keys_in_form raises InvalidFormDataError (app/services/templates/validate_service.rb:260-276), which
  is_valid_form? does not rescue (app/services/templates/validate_service.rb:246). Expected 422 792.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-074` · `app/services/templates/validate_service.rb:276`

#### API-XSTG-075 — A vendor-assessment form with no questions is a 4xx, not a crash
- **Why it matters.** A questionnaire with nothing to answer must be a clean refusal.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: forms[0].page_response_headers = []. Then read the
  event group back.
- **Expected.** No 5xx. An empty array fails present? in check_required_keys_in_form and raises InvalidFormDataError
  (app/services/templates/validate_service.rb:270-276). (If the tenant has mandatory RFP global widgets,
  add_mandatory_widgets_for_rfp_templates fills the list first — app/controllers/concerns/trade_template_helper.rb:2004-2006 — and
  it passes.)
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-075` · `app/services/templates/validate_service.rb:276`

#### API-XSTG-076 — A form without page_headers is a 4xx, not a crash
- **Why it matters.** page_headers is optional in the UI's mental model but mandatory in code.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: forms[0].page_headers removed. Then read the event
  group back.
- **Expected.** No 5xx. is_valid_form? computes form[’page_headers’] + response_headers (app/services/templates/validate_service.rb:230); nil +
  Array is a NoMethodError (not rescued). create_form_helper would also call nil.map (app/helpers/api/forms_helper.rb:21).
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-076` · `app/services/templates/validate_service.rb:230`

#### API-XSTG-077 — A question without a key_attribute is refused
- **Why it matters.** key_attribute is how answers are stored and scored; a question without one can never be answered.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: forms[0].page_response_headers[0].key_attribute
  removed. Then read the event group back.
- **Expected.** HTTP 422 with error.code 792 'Please fill all the required fields' from is_valid_widget?
  app/services/templates/validate_service.rb:281-293 → rescued InvalidWidgetDataError app/services/templates/validate_service.rb:246
  → 792 app/services/templates/validate_service.rb:212-216; nothing is created.
- **Oracle.** 422 code 792.
- **Trace.** P0 · automate · `EDGE-STG-077` · `app/services/templates/validate_service.rb:214`

#### API-XSTG-078 — A question with an unknown field_type is refused
- **Why it matters.** field_type decides who fills the cell (buyer vs vendor).
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only:
  forms[0].page_response_headers[0].configuration.field_type = "robot". Then read the event group back.
- **Expected.** HTTP 422 with error.code 792 'Please fill all the required fields' from is_valid_widget?
  app/services/templates/validate_service.rb:285 (Template::WIDGET_FIELD_TYPES = creator, participant, formula); nothing is created.
- **Oracle.** 422 code 792.
- **Trace.** P1 · automate · `EDGE-STG-078` · `app/services/templates/validate_service.rb:285`

#### API-XSTG-079 — A question with an unknown input_type is refused
- **Why it matters.** The validator reads as a whitelist and behaves as a presence check.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: forms[0].page_response_headers[0].input_type =
  "rocket". Then read the event group back.
- **Expected.** No 5xx. It SHOULD be 792, but the row check is an OR-chain that passes as soon as input_type is present
  (app/services/templates/validate_service.rb:239-242) — Widget.input_types_for_form is never actually enforced. A 2xx stores a
  question the vendor UI cannot render.
- **Oracle.** 4xx expected; if 2xx, flag it.
- **Trace.** P1 · automate · `EDGE-STG-079` · `app/services/templates/validate_service.rb:239`

#### API-XSTG-080 — Two questions with the same key_attribute on one form are refused
- **Why it matters.** Silent answer loss in a scored questionnaire.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: forms[0].page_response_headers[1].key_attribute =
  "Kh4H2" (same as the first question). Then read the event group back.
- **Expected.** No 5xx. It SHOULD be refused: key-attribute uniqueness (valid_key_attributes? app/services/templates/validate_service.rb:185-203)
  is only run for trade templates, not for forms at round creation. Duplicate keys make the second answer overwrite the first.
- **Oracle.** 4xx expected; if 2xx, flag it.
- **Trace.** P1 · automate · `EDGE-STG-080` · `app/services/templates/validate_service.rb:185`

#### API-XSTG-081 — Script and SQL text in a question name is stored inert
- **Why it matters.** Question names are rendered to every invited vendor.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: forms[0].page_response_headers[0].name / description
  carry a script tag and an SQL fragment. Then read the event group back.
- **Expected.** No 5xx. sanitize_input_params strips HTML tags from every string param (app/controllers/concerns/params_auth.rb:18-41); the SQL
  text is data. Read back the name: no tags.
- **Oracle.** Status < 500; stored name has no < > tags.
- **Trace.** P2 · automate · `EDGE-STG-081` · `app/controllers/concerns/params_auth.rb:29`

#### API-XSTG-082 — A non-existent evaluator is refused, not silently dropped
- **Why it matters.** The journey's own evaluator step depends on this; a silent drop means nobody can score the technical round.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: forms[0].evaluators[0].shared_with_uuid =
  Z2dnWmdaUWtnZw==. Then read the event group back.
- **Expected.** No 5xx. It SHOULD be refused. create_access_list_for_trade_request calls save and ignores the result
  (app/controllers/concerns/trade_template_helper.rb:1939-1951); AccessList belongs_to :shared_with is required
  (app/models/access_list.rb:34, belongs_to_required_by_default = true), so the row fails validation and the round is created with
  NO evaluator while the caller sees success.
- **Oracle.** 4xx expected; if 2xx, the round's evaluator list is empty — file it.
- **Trace.** P1 · automate · `EDGE-STG-082` · `app/controllers/concerns/trade_template_helper.rb:1949`

#### API-XSTG-083 — An evaluator with an unknown shared_with_type is a 4xx, not a crash
- **Why it matters.** shared_with_type is a class name taken from the client.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: forms[0].evaluators[0].shared_with_type = "Foo". Then
  read the event group back.
- **Expected.** No 5xx. The required polymorphic belongs_to (app/models/access_list.rb:34) resolves "Foo".constantize during validation →
  NameError, not rescued. Expected 422.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-083` · `app/models/access_list.rb:34`

#### API-XSTG-084 — A vendor company cannot be made an evaluator of its own technical round
- **Why it matters.** Evaluator access exposes competitors' technical answers and scores.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: forms[0].evaluators[0] = {shared_with_uuid:
  {{vendorUuid}}, shared_with_type: Company}. Then read the event group back.
- **Expected.** No 5xx. It SHOULD be refused: nothing checks that the evaluator is a user of the buyer company
  (app/controllers/concerns/trade_template_helper.rb:1925-1926, 1939-1951). A 2xx gives the invited vendor’s company evaluator
  access to the round that judges it.
- **Oracle.** 4xx expected; if 2xx, file a security defect.
- **Trace.** P0 · automate · `EDGE-STG-084` · `app/controllers/concerns/trade_template_helper.rb:1926`

#### API-XSTG-085 — Evaluators sent as a plain string are a 4xx, not a crash
- **Why it matters.** Shape errors in the evaluator list come straight from integrations.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: forms[0].evaluators = "{{userUuid}}" (a string, not a
  list). Then read the event group back.
- **Expected.** No 5xx. should_add_evaluators? sees it as present and form_hash[:evaluators].each is called on a String
  (app/controllers/concerns/trade_template_helper.rb:1925) → NoMethodError. Expected 422.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-085` · `app/controllers/concerns/trade_template_helper.rb:1925`

#### API-XSTG-086 — A technical round with no evaluator at all is refused
- **Why it matters.** The journey's evaluator gate exists because this is missed in the UI.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: forms[0].evaluators = [] (so no form names an
  evaluator). Then read the event group back.
- **Expected.** No 5xx. Nothing requires an evaluator at creation (app/controllers/concerns/trade_template_helper.rb:1921-1924 simply skips forms
  with no evaluators). A round nobody can score SHOULD be refused, or at publish.
- **Oracle.** Status < 500; note whether publish later refuses.
- **Trace.** P1 · automate · `EDGE-STG-086` · `app/controllers/concerns/trade_template_helper.rb:1921`

#### API-XSTG-087 — An unknown rfp_evaluation_mode is refused
- **Why it matters.** A typo in the mode throws away the evaluator with a 2xx.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.rfp_evaluation_mode = "banana". Then
  read the event group back.
- **Expected.** No 5xx. It is stored as-is (app/controllers/concerns/trade_controller_helper.rb:3370); should_add_evaluators? is then false
  (app/controllers/api/trade_controller.rb:1848-1856), so the evaluator in the body is silently NOT attached. SHOULD be refused
  (lot_based / line-item only).
- **Oracle.** 4xx expected; if 2xx, the evaluator list is empty.
- **Trace.** P1 · automate · `EDGE-STG-087` · `app/controllers/concerns/trade_controller_helper.rb:3370`

#### API-XSTG-088 — A technical round without rfp_evaluation_mode keeps its evaluator
- **Why it matters.** The code already knows this is wrong (it alerts) but still returns success.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.rfp_evaluation_mode removed. Then read
  the event group back.
- **Expected.** No 5xx. Only a Sentry message is sent (app/controllers/api/trade_controller.rb:365-376); with no mode, should_add_evaluators? is
  false and the evaluator is dropped. Expected 422 or a default.
- **Oracle.** Status < 500; evaluator list read back.
- **Trace.** P2 · automate · `EDGE-STG-088` · `app/controllers/api/trade_controller.rb:366`

## 5. Templates

template_uuid / vendor_assessment_template_uuid are decoded to ids by `ParamsAuth#check_for_uuid` (app/controllers/concerns/params_auth.rb:57-67). The library has no template placeholder, so the working bodies here omit both (the round then uses the company app_configuration, app/controllers/concerns/trade_controller_helper.rb:3322-3325); these cases add one bad value each.

#### API-XSTG-089 — A non-existent template on a technical round is a 4xx, not a crash
- **Why it matters.** Deleted or stale templates are routine; the round endpoint must not 500 on them.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.template_uuid = Z2dnWmdaUWtnZw==. Then
  read the event group back.
- **Expected.** No 5xx. Template.find_by_id(...) returns nil and template.configurations is called on it
  (app/controllers/concerns/trade_controller_helper.rb:3592-3595) → NoMethodError. Expected 422 477 (Template not found).
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-089` · `app/controllers/concerns/trade_controller_helper.rb:3595`

#### API-XSTG-090 — A non-existent template on an auction round is a 4xx, not a crash
- **Why it matters.** Same guard on the commercial path.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.template_uuid = Z2dnWmdaUWtnZw==. Then
  read the event group back.
- **Expected.** No 5xx. Same nil.configurations at app/controllers/concerns/trade_controller_helper.rb:3595. Expected 422 477.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-090` · `app/controllers/concerns/trade_controller_helper.rb:3595`

#### API-XSTG-091 — A non-existent vendor-assessment template is refused
- **Why it matters.** Stored dangling references break clone/publish later.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.vendor_assessment_template_uuid =
  Z2dnWmdaUWtnZw==. Then read the event group back.
- **Expected.** No 5xx. Template.find_by is nil-safe (app/controllers/concerns/trade_controller_helper.rb:3336) but the id is still persisted to
  misc.vendor_assessment_template_id (app/controllers/concerns/trade_controller_helper.rb:3635-3637), so the UI later loads a
  template that does not exist. Expected 477.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-STG-091` · `app/controllers/concerns/trade_controller_helper.rb:3636`

## 6. Pricing sheet — widgets, rows, units, delivery location, tabs

The commercial round's `widgets` + `data` are reshaped by `transform_trade_product` (app/controllers/concerns/trade_template_helper.rb:1386-1562) before the controller runs, then decorated by `add_data_for_templates` (app/controllers/concerns/trade_template_helper.rb:1710-1868). Neither re-runs the template validator (key uniqueness, formula, custom widget rules in app/services/templates/validate_service.rb), so the stage trusts the sheet it is sent.

#### API-XSTG-092 — A blank unit on the quantity column is refused
- **Why it matters.** Quantities without units cannot be compared or awarded.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: data[0].creator_quantity.configuration.suffix = "".
  Then read the event group back.
- **Expected.** HTTP 422 with error.code 574 'Unit cannot be blank' from TradeTemplateHelper#transform_trade_product
  app/controllers/concerns/trade_template_helper.rb:1393-1395 (falls back to product.unit_type, absent); nothing is created.
- **Oracle.** 422 code 574.
- **Trace.** P1 · automate · `EDGE-STG-092` · `app/controllers/concerns/trade_template_helper.rb:1395`

#### API-XSTG-093 — A unit the workspace does not have is refused by name
- **Why it matters.** The message is built from the value, so it also proves the lower-casing.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: data[0].creator_quantity.configuration.suffix =
  "Furlong". Then read the event group back.
- **Expected.** HTTP 422 with error.code 495 'The unit furlong is not present' from app/controllers/concerns/trade_template_helper.rb:1398-1415
  (units looked up lower-cased in Current.workspace.units); nothing is created.
- **Oracle.** 422 code 495 with that message.
- **Trace.** P1 · automate · `EDGE-STG-093` · `app/controllers/concerns/trade_template_helper.rb:1415`

#### API-XSTG-094 — The same unit in two letter-cases counts as two units for a per-unit charge
- **Why it matters.** Inconsistent normalisation: KG and kg are one unit for lookup and two units for this rule.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: a second identical row whose creator_quantity.postfix
  is "kg" (first is "KG") plus a per-unit (input_group price) global widget. Then read the event group back.
- **Expected.** HTTP 422 with error.code 486 'You cannot add multiple units in this template.' from
  app/controllers/concerns/trade_template_helper.rb:1845-1848 — compares meta_data.postfix case-sensitively, while units are matched
  lower-cased at app/controllers/concerns/trade_template_helper.rb:1396; nothing is created.
- **Oracle.** 422 code 486.
- **Trace.** P2 · automate · `EDGE-STG-094` · `app/controllers/concerns/trade_template_helper.rb:1848`

#### API-XSTG-095 — A pricing row without a product is a 4xx, not a crash
- **Why it matters.** Runs in the before-create transform, so no controller guard can catch it.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: data[0].product removed. Then read the event group
  back.
- **Expected.** No 5xx. transform_trade_product reads item[:product][:id] (app/controllers/concerns/trade_template_helper.rb:1468) → nil[:id]
  NoMethodError, before the controller’s 80 check. Expected 422 80.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-095` · `app/controllers/concerns/trade_template_helper.rb:1468`

#### API-XSTG-096 — A pricing row without a variant is a 4xx, not a crash
- **Why it matters.** Variant is optional in some catalogs; the transform assumes it.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: data[0].variant removed. Then read the event group
  back.
- **Expected.** No 5xx. item[:variant][:id] (app/controllers/concerns/trade_template_helper.rb:1469) → NoMethodError. Expected 422.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-096` · `app/controllers/concerns/trade_template_helper.rb:1469`

#### API-XSTG-097 — A pricing row without a delivery location is refused
- **Why it matters.** The known event_groups update 500 began with an unfilled delivery location; this pins the stage-level refusal.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: data[0].buyer_hub.uuid removed. Then read the event
  group back.
- **Expected.** HTTP 422 with error.code 125 'Delivery location not found' from set_trade_products
  app/controllers/concerns/trade_controller_helper.rb:855 (inside the create transaction, rolled back); nothing is created.
- **Oracle.** 422 code 125.
- **Trace.** P1 · automate · `EDGE-STG-097` · `app/controllers/concerns/trade_controller_helper.rb:855`

#### API-XSTG-098 — A sheet without inline columns is a 4xx, not a crash
- **Why it matters.** Every decoration step assumes both widget lists exist.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: widgets.inline_components removed. Then read the event
  group back.
- **Expected.** No 5xx. add_data_for_templates calls params[:widgets][:inline_components].unshift(serial_number)
  (app/controllers/concerns/trade_template_helper.rb:1729) → nil.unshift NoMethodError.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-098` · `app/controllers/concerns/trade_template_helper.rb:1729`

#### API-XSTG-099 — A dropdown column without dropdown_data is a 4xx, not a crash
- **Why it matters.** A dropdown added ad hoc on the create screen skips the template rules.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: an inline dropdown widget with no
  configuration.dropdown_data. Then read the event group back.
- **Expected.** No 5xx. widget[’configuration’]["dropdown_data"].gsub(...) on nil (app/controllers/concerns/trade_template_helper.rb:1838) →
  NoMethodError. The template validator’s valid_dropdown_widgets? (app/services/templates/validate_service.rb:74-90) would have
  returned code 2, but it is not run here.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-099` · `app/controllers/concerns/trade_template_helper.rb:1838`

#### API-XSTG-100 — Two price columns with the same key_attribute are refused
- **Why it matters.** Duplicate price keys corrupt the comparison sheet.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: a second inline widget with key_attribute "price". Then
  read the event group back.
- **Expected.** No 5xx. It SHOULD be refused ("Duplicate columns" code 2 from valid_key_attributes?
  app/services/templates/validate_service.rb:185-203), but that validator is only run when a template is saved; the round keeps both
  columns and bids write to one key.
- **Oracle.** 4xx expected; if 2xx, flag it.
- **Trace.** P1 · automate · `EDGE-STG-100` · `app/services/templates/validate_service.rb:197`

#### API-XSTG-101 — A formula column that refers to itself is refused
- **Why it matters.** Self-referencing formulas are an infinite loop at bid time.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: widgets.inline_components[Total
  Amount].configuration.formula = "total_amount*2". Then read the event group back.
- **Expected.** No 5xx. valid_formula? rejects self-reference (app/services/templates/validate_service.rb:115-118) but is not run at round
  creation; the round stores a formula that recurses at bid time. SHOULD be refused.
- **Oracle.** 4xx expected.
- **Trace.** P2 · automate · `EDGE-STG-101` · `app/services/templates/validate_service.rb:118`

#### API-XSTG-102 — A tab without sections is a 4xx, not a crash
- **Why it matters.** tabs is sent (empty) by every round; a non-empty one takes an unguarded path.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: tabs = [{name: …}] with no sections. Then read the
  event group back.
- **Expected.** No 5xx. add_ranges_to_sections calls tab["sections"].each (app/controllers/concerns/trade_controller_helper.rb:6270-6272, reached
  from app/controllers/api/trade_controller.rb:162) → nil.each NoMethodError.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-STG-102` · `app/controllers/concerns/trade_controller_helper.rb:6272`

## 7. Savings references, terms & conditions, currency conversion

The commercial settings that ride on the round: `savings_configuration` (SavingsConfiguration, app/models/savings_configuration.rb), `is_tnc_mandatory` / `terms_and_conditions` / t_and_c attachments (app/controllers/concerns/trade_controller_helper.rb:3391, 3540-3566) and `currency_configuration` (TradeRequests::CurrencyConfiguration, app/models/trade_requests/currency_configuration.rb).

#### API-XSTG-103 — Savings are required when the tenant makes them mandatory
- **Why it matters.** A tenant-level rule that must bite at round creation, before any row is written.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Company
  config is_saving_configuration_mandatory is ON.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: nothing — the working RFQ body with
  savings_configuration null. Then read the event group back.
- **Expected.** HTTP 422 with error.code 719 'Saving Configurations is mandatory for Event' from transform_trade_product
  app/controllers/concerns/trade_template_helper.rb:1436-1437 (rfq/auction, not alternate bidding); nothing is created.
- **Oracle.** 422 code 719.
- **Trace.** P1 · automate · `EDGE-STG-103` · `app/controllers/concerns/trade_template_helper.rb:1437`

#### API-XSTG-104 — Alternate-bidding rounds are exempt from mandatory savings
- **Why it matters.** Pins the exemption so the mandatory rule is not widened by accident.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Company
  config is_saving_configuration_mandatory is ON.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: is_alternate_bidding_allowed true with
  savings_configuration null (auction round). Then read the event group back.
- **Expected.** No 5xx. The mandatory-savings check skips is_alternate_bidding_allowed == true
  (app/controllers/concerns/trade_template_helper.rb:1436); alternate bidding also forces line_item_based closing
  (app/controllers/concerns/trade_controller_helper.rb:3350-3353).
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-STG-104` · `app/controllers/concerns/trade_template_helper.rb:1436`

#### API-XSTG-105 — savings strategy_options sent as a list is a 4xx, not a crash
- **Why it matters.** The UI sends a hash; integrations send a list.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: savings_configuration = {savings_comparison_on:
  lot_based, strategy_options: ["budget"]}. Then read the event group back.
- **Expected.** No 5xx. set_strategy_options does {}.merge(configuration_data[:strategy_options]) (app/models/savings_configuration.rb:102) →
  TypeError for an Array. Expected 422.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-105` · `app/models/savings_configuration.rb:102`

#### API-XSTG-106 — A line-item savings reference on a non-price column is refused
- **Why it matters.** Savings against GST% would report nonsense savings.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: savings_configuration line_item_based with a reference
  on the gst column. Then read the event group back.
- **Expected.** HTTP 422 with error.code 575 'Savings Column not found' from set_savings_configuration_in_trade_product
  app/controllers/concerns/trade_controller_helper.rb:1086-1090 (reference must be a price/amount column); nothing is created.
- **Oracle.** 422 code 575.
- **Trace.** P1 · automate · `EDGE-STG-106` · `app/controllers/concerns/trade_controller_helper.rb:1090`

#### API-XSTG-107 — Mandatory T&C with nothing to accept is refused
- **Why it matters.** Mandatory-but-empty is a blocked bid screen with no explanation.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: is_tnc_mandatory true with terms_and_conditions [] and
  no t_and_c attachment values. Then read the event group back.
- **Expected.** No 5xx. is_tnc_mandatory is stored raw (app/controllers/concerns/trade_controller_helper.rb:3391) with no check that any clause or
  attachment exists. Vendors are then asked to accept an empty T&C before bidding. SHOULD be refused.
- **Oracle.** Status < 500; if 2xx, flag it.
- **Trace.** P1 · automate · `EDGE-STG-107` · `app/controllers/concerns/trade_controller_helper.rb:3391`

#### API-XSTG-108 — A T&C clause with script is stored inert
- **Why it matters.** T&C is shown to every vendor and in the PO.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: terms_and_conditions =
  ["QA_Platform_<script>alert(document.cookie)</script> Pay in 30 days"]. Then read the event group back.
- **Expected.** No 5xx. String clauses are kept bit-for-bit by PersistedArrayBuilder
  (app/services/terms_and_conditions/persisted_array_builder.rb:10) — the only defence is sanitize_input_params
  (app/controllers/concerns/params_auth.rb:18-41). Read back: no <script>.
- **Oracle.** Status < 500; stored clause has no tags.
- **Trace.** P1 · automate · `EDGE-STG-108` · `app/services/terms_and_conditions/persisted_array_builder.rb:10`

#### API-XSTG-109 — A currency configuration without allowed currencies is a 4xx, not a crash
- **Why it matters.** Partial multi-currency payloads come from half-configured tenants.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: currency_configuration = {base_currency INR,
  currency_mode} with no allowed_currencies. Then read the event group back.
- **Expected.** No 5xx. get_hash maps allowed_currencies (app/models/trade_requests/currency_configuration.rb:65) — nil.map NoMethodError, called
  from app/controllers/concerns/trade_controller_helper.rb:3630-3631. Expected 422 520/535.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-109` · `app/models/trade_requests/currency_configuration.rb:65`

#### API-XSTG-110 — A zero conversion rate is refused
- **Why it matters.** A zero rate makes a USD vendor the cheapest bidder by definition.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only:
  currency_configuration.allowed_currencies.USD.rate_in_base = 0. Then read the event group back.
- **Expected.** No 5xx. Currency stores rate_in_base as given (app/poro_classes/currency.rb:9); nothing checks > 0. Every USD bid converts to 0
  INR (or divides by zero). SHOULD be refused.
- **Oracle.** 4xx expected; if 2xx, flag it.
- **Trace.** P1 · automate · `EDGE-STG-110` · `app/poro_classes/currency.rb:9`

#### API-XSTG-111 — A base currency that is not among the allowed currencies is refused
- **Why it matters.** Defers a crash from write time to every read.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: currency_configuration.base_currency.code = EUR
  (allowed: INR, USD). Then read the event group back.
- **Expected.** No 5xx on create, but get_base_currency is T.must(allowed_currencies[base_currency.code])
  (app/models/trade_requests/currency_configuration.rb:57-59), so every later read that needs the base currency raises. SHOULD be
  refused here.
- **Oracle.** Status < 500; a follow-up GET of the round must not 500.
- **Trace.** P1 · automate · `EDGE-STG-111` · `app/models/trade_requests/currency_configuration.rb:58`

## 8. Titles, audience and other body-wide robustness

Fields every round body carries. Note that `ParamsAuth` runs before the controller and rewrites every *_uuid / *_uuids key (app/controllers/concerns/params_auth.rb:55-94) and strips HTML from every string (app/controllers/concerns/params_auth.rb:18-41).

#### API-XSTG-112 — A null audience list is a 4xx, not a crash
- **Why it matters.** The journey sends this key on every round; a client that nulls it takes the whole request down.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: audience_company_uuids = null. Then read the event
  group back.
- **Expected.** No 5xx. decode_the_uuid_for_hash calls value.map for any key containing ’uuids’ unless it is a String
  (app/controllers/concerns/params_auth.rb:72-73); nil.map raises in a before_action on EVERY endpoint. Expected the null to be
  ignored or a 422.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-STG-112` · `app/controllers/concerns/params_auth.rb:73`

#### API-XSTG-113 — A technical round with no title is refused
- **Why it matters.** Titles are how buyers find rounds; also exposes that forms are written before the transaction.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.title = "". Then read the event group
  back.
- **Expected.** HTTP 422 with error.code 54 'Title or Description missing' from set_title_and_description
  app/controllers/concerns/trade_controller_helper.rb:1422-1432 (non-sheet round); the create transaction rolls back (forms created
  earlier by create_form_helper may persist as orphans).
- **Oracle.** 422 code 54.
- **Trace.** P1 · automate · `EDGE-STG-113` · `app/controllers/concerns/trade_controller_helper.rb:1431`

#### API-XSTG-114 — An auction round with no title is refused
- **Why it matters.** The sheet branch has its own title rule and code.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.title = "". Then read the event group
  back.
- **Expected.** HTTP 422 with error.code 55 'Title is missing' from set_title_and_description
  app/controllers/concerns/trade_controller_helper.rb:1409-1421 (sheet round); nothing is created.
- **Oracle.** 422 code 55.
- **Trace.** P1 · automate · `EDGE-STG-114` · `app/controllers/concerns/trade_controller_helper.rb:1420`

#### API-XSTG-115 — A title made only of HTML is refused as empty
- **Why it matters.** Proves the sanitiser runs before the presence check (and that nothing executable is stored).
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?).
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.title = "<b></b><img src=x
  onerror=alert(1)>". Then read the event group back.
- **Expected.** HTTP 422 with error.code 55 'Title is missing' from sanitize_input_params app/controllers/concerns/params_auth.rb:18-41 strips the
  tags, then app/controllers/concerns/trade_controller_helper.rb:1419-1420; nothing is created.
- **Oracle.** 422 code 55.
- **Trace.** P2 · automate · `EDGE-STG-115` · `app/controllers/concerns/params_auth.rb:29`

#### API-XSTG-116 — auto_award_configs sent as a string is a 4xx, not a crash
- **Why it matters.** Only the key's presence is checked before the call.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.auto_award_configs = "on". Then read the
  event group back.
- **Expected.** No 5xx. params["auto_award_configs"]&.to_unsafe_h is called on a String
  (app/controllers/concerns/trade_controller_helper.rb:3415-3416) → NoMethodError. Expected 422.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-STG-116` · `app/controllers/concerns/trade_controller_helper.rb:3416`

#### API-XSTG-117 — A draft_uuid is only honoured for the caller's own drafts
- **Why it matters.** Cross-tenant write through a side-effect parameter.
- **Setup.** Draft event group {{eventGroupUuid}} with line item {{lineItemUuid}}, catalog product {{productUuid}} / variant
  {{productQualityUuid}}, delivery location {{locationUuid}} and unit KG in the workspace. On a DRAFT event a new stage of an
  rfx_mode the draft already has voids the old one (check_duplicate_stages_in_draft_event_group), so these cases do not collide.
  Buyer session whose user has trade create_record permission and sourcing-events access (TradeRequestPolicy#create?). Evaluator
  {{userUuid}} is an active user of the buyer company.
- **Steps.** POST `/trade/template_input` (buyer) with the working body, changing only: configurations.draft_uuid = Z2dnWmdaUWtnZw==. Then read
  the event group back.
- **Expected.** No 5xx (no such draft). Note for review: Draft.active.where(id: params["draft_id"]) is not scoped to the company or user
  (app/controllers/api/trade_controller.rb:356-361), so a real id from another tenant would be deactivated by this call. Oracle here
  is only the no-crash.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-STG-117` · `app/controllers/api/trade_controller.rb:357`
