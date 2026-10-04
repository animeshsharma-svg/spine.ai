# Weighted bidding — weight parameters on a pricing round

Deep cases for the buyer's "Add / Edit Weight Params" action on a live pricing round: `PATCH /trade/:id/edit_weight_parameters`
(`Api::TradeController#edit_weight_parameters`). A weight is a per-vendor adjustment the buyer adds on top of a vendor's quoted
score — an absolute amount (₹) or a relative percentage between -100 and 100 — set once for the whole lot or per line item. The
weights are stored as `Weightage` rows (one per vendor, per line or per round, per weight key), the round remembers the weight
list in `misc.weightage` (keys, names, "lot" or "line_item", plus a synthetic `weighted_total` column), and from then on the
round is a "weighted bid event": ranking adds the vendor's weights to its score, the buyer's sheet and schema get one read-only
column per weight plus "Weighted Total", and the vendor's terms carry a sentence naming the criteria. The first save on a round
without weights runs `add_weightages_to_trade` (it also requires a rank or traffic-light round and turns on
`allow_fixed_quantity_for_bidding`); later saves run `ValidateService` → `CreateService` → `handle_removed_weight_keys` directly.
Weights can also be sent at round creation (`POST /trade/template_input`) — those cases (§8) are catalog only.
Every case is grounded in `procol-backend` at `origin/main` (paths relative to that repo) or in `procol-client-dashboard` for UI cases.

**How the runnable twins work.** Cases whose Trace names an `EVD2-WGT-NNN` id have a twin in
`prototype/data/deep2-cases/wgt.json`, run by the plan runner as the QA buyer on the run's OWN fresh event (recipes
`published_rfq`, `rfq_with_bid`, `draft_rfq`, `closed_rfq`, `closed_rfq_with_bid`, `awarded_rfq`, `published_rfp_rfq`, or `none`
for bogus ids). A fresh recipe round is never weighted: `misc.weightage` is written only by this endpoint and by
`template_input` when the create request carries `weightages`, which the recipe does not send — so every twin's first save takes
the `add_weightages_to_trade` path deterministically. The recipe RFQ is created without `auction_config`, so it is a `rank`
round (`app/controllers/concerns/trade_controller_helper.rb:3534`) and passes the rank / traffic-light check. Weights are only
ever written for QA vendor 1 / 2 or for the bogus id `Z2dnWmdaUWtnZw==` (999999999, no such row), on the run's own round.
Line-item weights need the round's trade-product ids, which no recipe exposes; line-item twins therefore only use refused shapes
or the bogus id, and the line-item happy path is manual. Two helper twins (`EVD2-WGT-H01`, `-H02`) are first saves reused as
arrange steps.

**Left manual on purpose.** The vendor app may not call this action (`agribid_website` → NOT ALLOWED): a vendor attempt is
answered 401 and signs that vendor out, so it is never a twin. Other-company buyers, read-only buyers, auctions (no auction
recipe), ranking with two weighted vendors, concurrency, and anything that needs a real trade-product id are manual.
Error codes: 2 = 'Insufficient parameters' (422), 15 = 'Operation failed' (422), 455 = 'You are not authorized to perform this
action' (422). Success: HTTP 200 `{"success": true, "message": "Weights added successfully!"}` (`config/locales/en-IN.yml:153`).

## 1. The request shape and finding the round

#### API-EVDWGT-001 — A request without the weightages object is refused
- **Why it matters.** The whole weight table must sit under `weightages`; a flat payload must not half-apply.
- **Setup.** A live RFQ round with no bids and no weights (recipe `published_rfq`).
- **Steps.** `PATCH /trade/{{tradeId}}/edit_weight_parameters` with `{"weightage_on": "lot", "values": {…one valid weight…}}` (no `weightages` wrapper).
- **Expected.** Refused, nothing saved, the round stays unweighted. HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2; `GET /trade/{{tradeId}}` shows no `weightages` and `trade_config.is_weighted_bid_event` false.
- **Trace.** P1 · automate · `EVD2-WGT-001` · `app/controllers/api/trade_controller.rb:1778-1783`

#### API-EVDWGT-002 — The older payload shape (key list + name list, no "weight on") is refused
- **Why it matters.** The legacy create-screen modal still builds `{key_attributes, weightage_names, values: {vendor: [..]}}`; the server must refuse it cleanly rather than store a half-understood table.
- **Setup.** `published_rfq`.
- **Steps.** `PATCH /trade/{{tradeId}}/edit_weight_parameters` with `{"weightages": {"key_attributes": ["qa_freight_adj"], "weightage_names": ["QA_Platform_Freight_{{stamp}}"], "values": {"{{vendorUuid}}": ["100"]}}}`.
- **Expected.** Refused because "weight on" is missing. HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2; round still unweighted.
- **Trace.** P1 · automate · `EVD2-WGT-002` · `app/controllers/api/trade_controller.rb:1779-1782`

#### API-EVDWGT-003 — A blank "weight on" is refused
- **Why it matters.** Lot versus line decides where every weight row is stored; an empty value must not default silently.
- **Setup.** `published_rfq`.
- **Steps.** Same as the happy path (API-EVDWGT-013) with `"weightage_on": ""`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2; no weight rows, round unweighted.
- **Trace.** P2 · automate · `EVD2-WGT-003` · `app/controllers/api/trade_controller.rb:1781-1782`

#### API-EVDWGT-004 — A round that does not exist answers "insufficient parameters", not "not found"
- **Why it matters.** The lookup uses `find_by_id`, so an unknown round falls into the parameter check. The screen shows "Insufficient parameters" for a deleted or mistyped round, which sends the buyer looking at the wrong thing.
- **Setup.** Signed-in buyer only (recipe `none`).
- **Steps.** `PATCH /trade/Z2dnWmdaUWtnZw==/edit_weight_parameters` with a valid lot weight body.
- **Expected.** Refused before any policy check. HTTP 422, code 2 'Insufficient parameters' (a 404 or code 4 'Request not found' would be clearer).
- **Oracle.** 422 code 2, never 500.
- **Trace.** P2 · automate · `EVD2-WGT-004` · `app/controllers/api/trade_controller.rb:1777,1781-1782`

#### API-EVDWGT-005 — A garbled round id is refused the same way
- **Why it matters.** `WrongUuid1=` decodes to nothing; `find_by_id(nil)` must stay a clean refusal.
- **Setup.** Recipe `none`.
- **Steps.** `PATCH /trade/WrongUuid1=/edit_weight_parameters` with a valid lot weight body.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-WGT-005` · `app/controllers/concerns/params_auth.rb:57-68` · `app/controllers/api/trade_controller.rb:1777`

#### API-EVDWGT-006 — Weights cannot be added to a draft round through this action
- **Why it matters.** The lookup is `TradeRequest.active`, so a draft round (status draft) is invisible here. Buyers preparing an event must set weights in the create flow instead; the refusal reads "Insufficient parameters", which does not say why.
- **Setup.** A draft event with an unpublished RFQ round (recipe `draft_rfq`).
- **Steps.** `PATCH /trade/{{tradeId}}/edit_weight_parameters` with a valid lot weight body.
- **Expected.** Refused. HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2; the draft round has no weights afterwards.
- **Trace.** P1 · automate · `EVD2-WGT-006` · `app/controllers/api/trade_controller.rb:1777` · `app/models/trade_request.rb:162`

#### API-EVDWGT-007 — A withdrawn event's round cannot be weighted
- **Why it matters.** Withdrawal marks every stage in-active; scoring changes on a cancelled event would confuse any later audit.
- **Setup.** `published_rfq`, then the event is withdrawn with a remark (arrange step `withdraw_event`; QA vendor 1 is the only invitee).
- **Steps.** 1. Withdraw the event. 2. `PATCH /trade/{{tradeId}}/edit_weight_parameters` with a valid lot weight body.
- **Expected.** Refused. HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P1 · automate · `EVD2-WGT-007` · `app/services/event_groups/update_service.rb:324-329` · `app/controllers/api/trade_controller.rb:1777`

#### API-EVDWGT-008 — A round waiting for creation approval cannot be weighted
- **Why it matters.** A round in "requested" status is not `active`; the buyer sees the weight button on the order page but every save answers "Insufficient parameters".
- **Setup.** A company with create-trade approval (v1 or v2) so the published round sits in status requested. Needs an approval-flow company; manual.
- **Steps.** `PATCH /trade/:id/edit_weight_parameters` with a valid body.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'. Product decision: either allow weights before approval or say why.
- **Oracle.** 422 code 2; round status still requested.
- **Trace.** P2 · manual · `app/controllers/api/trade_controller.rb:1777` · `app/models/trade_request.rb:162`

#### API-EVDWGT-009 — The parameter check runs before authorization, so outsiders can probe which rounds exist
- **Why it matters.** For another company's live round a valid body answers 455, an empty body answers 2, and a non-existent or non-live id answers 2 — the difference tells an outsider that the id is a live round.
- **Setup.** Buyer of company B (e.g. Demo Account 2) and the id of a live round of company A (the run's own round). Two companies' logins; manual.
- **Steps.** As B: 1. valid body on A's round; 2. valid body on `Z2dnWmdaUWtnZw==`.
- **Expected.** Today: step 1 HTTP 422 code 455 'You are not authorized to perform this action', step 2 HTTP 422 code 2. Better: authorize (or answer one code) before revealing existence.
- **Oracle.** Different codes for "exists" and "does not exist".
- **Trace.** P2 · manual · `app/controllers/api/trade_controller.rb:1777-1784`

## 2. Who may change weights

#### API-EVDWGT-010 — A buyer from another company is refused
- **Why it matters.** Weights decide ranks; only the round's own company may set them.
- **Setup.** Buyer of company B; a live round of company A. Manual (two companies).
- **Steps.** As B, `PATCH /trade/<A's round>/edit_weight_parameters` with a valid lot weight body.
- **Expected.** HTTP 422, code 455 'You are not authorized to perform this action'; no weight rows on A's round.
- **Oracle.** 422 code 455; A's round `GET` unchanged.
- **Trace.** P0 · manual · `app/policies/trade_request_policy.rb:100-102`

#### API-EVDWGT-011 — Any user of the company can change weights, even one who may not edit the round
- **Why it matters.** `edit_weight_parameters?` checks only the company. `update?` on the same round also requires the "create record" trade permission and sourcing-events access; neither the owner nor the team is checked. A view-only colleague can quietly re-rank vendors on someone else's live event.
- **Setup.** A second buyer in PROCOL DEMO without the trade create permission (or without sourcing-events access), not in the owner's team. Manual (second user).
- **Steps.** As that user, `PATCH /trade/:id/edit_weight_parameters` on the owner's live round.
- **Expected.** Should be 455 like `PATCH /trade/:id`. Today: HTTP 200 'Weights added successfully!'.
- **Oracle.** Weight rows created; `GET /trade/:id` shows the new weights.
- **Trace.** P0 · manual · `app/policies/trade_request_policy.rb:74-90` vs `app/policies/trade_request_policy.rb:100-102`

#### API-EVDWGT-012 — The vendor app may not call this action, and trying signs the vendor out
- **Why it matters.** Vendors must never edit weights; the app-level block is the guard, and its side effect (session ended) must be known.
- **Setup.** QA vendor 1 session (vendor app). Manual: the app answer is 401 and it ends the session, so it is never a twin.
- **Steps.** As the vendor, `PATCH /trade/:id/edit_weight_parameters` with a valid body.
- **Expected.** HTTP 401 (app not authorized for this action); the vendor session is marked in-active.
- **Oracle.** 401; the vendor must log in again; no weight rows.
- **Trace.** P1 · manual · `aac.mjs trade edit_weight_parameters` (agribid_website NOT ALLOWED) · `app/controllers/concerns/json_helpers.rb:31-35`

## 3. First save, re-edits and what the round shows afterwards

#### API-EVDWGT-013 — Adding a lot weight for an invited vendor makes the round a weighted round
- **Why it matters.** The basic promise: one save and the round carries the weight list, the vendor's value, and the weighted flag the screens key off.
- **Setup.** `published_rfq` (live RFQ, QA vendor 1 invited, no bids, no weights).
- **Steps.** `PATCH /trade/{{tradeId}}/edit_weight_parameters` with `{"weightages": {"weightage_on": "lot", "values": {"qa_freight_adj": {"label": "QA_Platform_Freight_{{stamp}}", "input_type": "absolute", "data": {"{{vendorUuid}}": "100"}}}}}`. Then read the round.
- **Expected.** Saved. The round now reads as weighted, weights are "lot", the weight list is the new key plus "weighted_total", and QA vendor 1's value is 100. HTTP 200 'Weights added successfully!'.
- **Oracle.** `GET /trade/{{tradeId}}?response_type=template`: `trade_config.is_weighted_bid_event` true; `weightages.weightage_on` "lot"; `weightages.key_attributes` contains "qa_freight_adj" and "weighted_total"; `weightages.values.qa_freight_adj.data.<vendor 1>` "100.0"; `misc.weightage.weightage_names` contains the label.
- **Trace.** P0 · automate · `EVD2-WGT-013` · `app/controllers/api/trade_controller.rb:1790-1794` · `app/controllers/concerns/trade_controller_helper.rb:3839-3867` · `app/models/trade_request.rb:1760-1772,3107-3150`

#### API-EVDWGT-014 — The first weight save also locks vendors' quantities (allow_fixed_quantity_for_bidding)
- **Why it matters.** The first save quietly turns on `allow_fixed_quantity_for_bidding` on a live round and drops participant quantity from the partial-closing widgets. Vendors who could quote partial quantities a minute ago are now refused with code 207 'Bid Quantity should be equal to the Auction Quantity' (`bids_controller_helper.rb:1898-1900`), and nothing tells the buyer.
- **Setup.** `published_rfq`.
- **Steps.** The happy-path save, then read the round.
- **Expected (today).** HTTP 200; `trade_config.allow_fixed_quantity_for_bidding` is true afterwards. Product confirmation needed that a weight save should change bidding rules; at minimum the screen should say so.
- **Oracle.** `trade_config.allow_fixed_quantity_for_bidding` true after the save.
- **Trace.** P1 · automate · `EVD2-WGT-014` · `app/controllers/concerns/trade_controller_helper.rb:3863-3866` · `app/controllers/concerns/bids_controller_helper.rb:1898-1900`

#### API-EVDWGT-015 — Vendors are told which criteria they are weighted on
- **Why it matters.** The vendor's terms gain the sentence "Your evaluation for this event will depend on … along with the Gross Total"; this is how a vendor learns the criteria exist.
- **Setup.** `published_rfq`; the happy-path save.
- **Steps.** Save, then read the round as QA vendor 1.
- **Expected.** The vendor's terms include a line naming "QA_Platform_Freight_…". Today the list also names the synthetic "Weighted Total" column ("depend on QA_Platform_Freight_…, Weighted Total along with the Gross Total") — cosmetic defect.
- **Oracle.** Vendor `GET /trade/{{tradeId}}`: some `terms_and_conditions` entry contains the label.
- **Trace.** P1 · automate · `EVD2-WGT-015` · `app/models/trade_request.rb:1025-1035` · `app/serializers/trade_template_serializer.rb:295-297`

#### API-EVDWGT-016 — Saving a new value for the same weight replaces the old one
- **Why it matters.** Rows are matched on (round, vendor, key); if a re-save added a second row, the vendor's weight would silently double (the lot read sums every row).
- **Setup.** `published_rfq`; arrange: the happy-path save (value 100).
- **Steps.** Save the same key for QA vendor 1 with `"250"`, then read the round.
- **Expected.** HTTP 200; QA vendor 1's value is 250, not 350.
- **Oracle.** `weightages.values.qa_freight_adj.data.<vendor 1>` equals "250.0".
- **Trace.** P0 · automate · `EVD2-WGT-016` · `app/services/weightages/create_service.rb:22-38` · `app/models/trade_request.rb:3129-3145`

#### API-EVDWGT-017 — Leaving a weight out of the next save removes it
- **Why it matters.** The screen's "Delete" works by omission; the dropped weight must stop counting.
- **Setup.** `published_rfq`; arrange: save two weights (qa_freight_adj and qa_quality_pen).
- **Steps.** Save again with only qa_freight_adj; read the round.
- **Expected.** HTTP 200; the weight list is qa_freight_adj + weighted_total only; qa_quality_pen is gone from the values (its rows are set in-active).
- **Oracle.** `weightages.key_attributes` has 2 entries; `weightages.values.qa_quality_pen` absent; `misc.weightage.key_attributes` has 2 entries.
- **Trace.** P1 · automate · `EVD2-WGT-017` · `app/controllers/api/trade_controller.rb:1804-1815` · `app/models/trade_request.rb:2567-2580`

#### API-EVDWGT-018 — Weights cannot be cleared back to an unweighted round
- **Why it matters.** Sending an empty table is the natural "remove all weights"; it is refused, and no other action clears `misc.weightage`. Once weighted, a round stays weighted.
- **Setup.** `published_rfq`; arrange: the happy-path save.
- **Steps.** `PATCH …/edit_weight_parameters` with `{"weightages": {"weightage_on": "lot", "values": {}}}`; read the round.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'; the round is still weighted with qa_freight_adj. (Product gap: no way to remove all weights.)
- **Oracle.** 422 code 2; `trade_config.is_weighted_bid_event` true; `weightages.key_attributes` contains "qa_freight_adj".
- **Trace.** P2 · automate · `EVD2-WGT-018` · `app/services/weightages/validate_service.rb:58-60`

#### API-EVDWGT-019 — Switching a round from lot weights to line-item weights
- **Why it matters.** The closing mode can change after weights exist; the second save must replace the lot rows, not add line rows beside them.
- **Setup.** A live RFQ with two line items and lot weights saved; the trade-product ids from the round read (no recipe exposes them, so manual).
- **Steps.** Save the same key with `"weightage_on": "line_item"` and `{vendor: {<tp1>: "10", <tp2>: "20"}}`; read the round.
- **Expected.** HTTP 200; `weightages.weightage_on` "line_item"; per-line values shown. The old lot rows should be in-active.
- **Oracle.** Round read; DB: `weightages` rows with item_type TradeRequest for that key are in_active.
- **Trace.** P1 · manual · `app/controllers/api/trade_controller.rb:1810-1812` · `app/models/trade_request.rb:2567-2580`

#### API-EVDWGT-020 — After a lot → line switch the old lot weights keep counting in the ranking
- **Why it matters.** `handle_removed_weight_keys` deactivates only keys that disappeared, and only on the storage of the OLD mode. If the key names stay the same, the round-level (lot) rows stay active; the lot score still adds them through `get_weight_for_participant` (which sums every active row of the round, regardless of the current mode) while the line score adds the new line rows. The vendor is penalised twice.
- **Setup.** As API-EVDWGT-019, then two vendors bid (or `allow_edit_weight_param_rfq` ON and bids already in). Manual.
- **Steps.** Compare the vendor's weighted total in the QCS with price + new line weights.
- **Expected.** Only the line weights count. Today (suspected): the stale lot amount is still added.
- **Oracle.** DB: active Weightage rows of item_type TradeRequest for the round after the switch; QCS weighted total ≠ expected.
- **Trace.** P1 · manual · `app/models/trade_request.rb:2567-2580` · `app/models/model_helpers/common_model_helper.rb:64-69` · `app/models/bid.rb:1309-1324`

#### API-EVDWGT-021 — Line-item weights for each line and vendor
- **Why it matters.** The line mode is what multi-line RFQs with per-item freight differences use; each line's value must land on that line only.
- **Setup.** Live RFQ with two lines, two invited vendors, no bids; trade-product ids from the round read. Manual (needs trade-product ids).
- **Steps.** Save `{"weightage_on": "line_item", "values": {"qa_freight_adj": {"label": "…", "input_type": "absolute", "data": {<v1>: {<tp1>: "10", <tp2>: "20"}, <v2>: {<tp1>: "5"}}}}}`; read the round and the buyer schema.
- **Expected.** HTTP 200; values come back per line per vendor; the buyer's line sheet gets one column per weight plus "Weighted Price" (named after the ranking key).
- **Oracle.** `weightages.values.qa_freight_adj.data.<v1>.<tp1>` "10.0" etc.; schema inline widgets include the weight keys.
- **Trace.** P1 · manual · `app/services/weightages/create_service.rb:49-66` · `app/controllers/concerns/trade_template_helper.rb:156-167`

#### API-EVDWGT-022 — Weights do not stop the vendor from bidding
- **Why it matters.** Turning a round into a weighted round changes bidding config (fixed quantity); a vendor must still be able to submit afterwards.
- **Setup.** `published_rfq`.
- **Steps.** 1. Buyer saves the happy-path weight. 2. QA vendor 1 opens, prices and submits a bid. 3. Read the round.
- **Expected.** Both succeed; the round is still weighted.
- **Oracle.** Step 1 HTTP 200, step 2 accepted; `trade_config.is_weighted_bid_event` true.
- **Trace.** P1 · automate · `EVD2-WGT-022` · `app/controllers/concerns/trade_controller_helper.rb:3863` · `app/models/bid.rb:149`

#### API-EVDWGT-023 — A vendor's unsubmitted draft bid does not lock the weights
- **Why it matters.** The lock counts only submitted (active / selected / requested / anomaly) bids; an opened but unsent draft must not freeze the buyer.
- **Setup.** `published_rfq`; QA vendor 1 opens a draft bid but does not submit it.
- **Steps.** Buyer saves the happy-path weight.
- **Expected.** HTTP 200 'Weights added successfully!'.
- **Oracle.** 200; round weighted.
- **Trace.** P2 · automate · `EVD2-WGT-023` · `app/models/bid.rb:475-493` · `app/models/model_helpers/trade_request_model_helper.rb:857-859`

## 4. What the weight table must look like (ValidateService)

#### API-EVDWGT-024 — "Weight on" must be lot or line_item
- **Why it matters.** Any other value would store rows nobody reads.
- **Setup.** `published_rfq`.
- **Steps.** Happy-path body with `"weightage_on": "vendor"`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2; round unweighted.
- **Trace.** P1 · automate · `EVD2-WGT-024` · `app/services/weightages/validate_service.rb:58-60`

#### API-EVDWGT-025 — A table with no weights is refused
- **Why it matters.** "Weight on" alone would make the round weighted with only the synthetic total.
- **Setup.** `published_rfq`.
- **Steps.** `{"weightages": {"weightage_on": "lot"}}`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2; round unweighted.
- **Trace.** P1 · automate · `EVD2-WGT-025` · `app/services/weightages/validate_service.rb:58-60`

#### API-EVDWGT-026 — Each weight must be an object, not a bare number
- **Why it matters.** `{"qa_freight_adj": "100"}` has no label or type; it must not be guessed.
- **Setup.** `published_rfq`.
- **Steps.** `"values": {"qa_freight_adj": "100"}`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-WGT-026` · `app/services/weightages/validate_service.rb:29-31,62-64`

#### API-EVDWGT-027 — A weight needs a name
- **Why it matters.** The name is the column header in the sheet and the criterion in the vendor's terms; a blank one is meaningless.
- **Setup.** `published_rfq`.
- **Steps.** Happy-path body with `"label": "   "`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P1 · automate · `EVD2-WGT-027` · `app/services/weightages/validate_service.rb:62-64`

#### API-EVDWGT-028 — A name made only of HTML tags is stripped to nothing and refused
- **Why it matters.** Every string parameter is HTML-stripped before the action runs; `<b></b>` becomes empty and must hit the blank-name rule, not store an empty header.
- **Setup.** `published_rfq`.
- **Steps.** Happy-path body with `"label": "<b></b>"`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-WGT-028` · `app/controllers/concerns/params_auth.rb:9,18-41` · `config/initializers/string.rb:11,38-40`

#### API-EVDWGT-029 — The weight type must be absolute or relative
- **Why it matters.** The type decides whether the value is ₹ or %; an unknown type has no maths.
- **Setup.** `published_rfq`.
- **Steps.** Happy-path body with `"input_type": "percentage"`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P1 · automate · `EVD2-WGT-029` · `app/services/weightages/validate_service.rb:62-64`

#### API-EVDWGT-030 — The weight type is case-sensitive
- **Why it matters.** Integrations that send "Relative" get a generic error; documents the exact contract.
- **Setup.** `published_rfq`.
- **Steps.** Happy-path body with `"input_type": "Relative"`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-WGT-030` · `app/services/weightages/validate_service.rb:63`

#### API-EVDWGT-031 — A weight with no vendor values is refused
- **Why it matters.** A named weight with nobody in it would add a column of blanks.
- **Setup.** `published_rfq`.
- **Steps.** Happy-path body without `"data"`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-WGT-031` · `app/services/weightages/validate_service.rb:36-38`

#### API-EVDWGT-032 — A weight sent as a JSON number is refused (only text numbers pass)
- **Why it matters.** The value check is `instance_of?(String) || instance_of?(Numeric)`; no JSON number is ever an *instance of* Numeric (it is an Integer or Float), so `100` is refused while `"100"` is accepted. Any integration sending numbers gets "Insufficient parameters" with no hint.
- **Setup.** `published_rfq`.
- **Steps.** Happy-path body with `"data": {"{{vendorUuid}}": 100}` (number, not text).
- **Expected (today).** HTTP 422, code 2 'Insufficient parameters'. Should be accepted (`is_a?(Numeric)`).
- **Oracle.** 422 code 2.
- **Trace.** P1 · automate · `EVD2-WGT-032` · `app/services/weightages/validate_service.rb:54-56`

#### API-EVDWGT-033 — A missing (null) vendor value is refused
- **Why it matters.** A null must not be stored as 0.
- **Setup.** `published_rfq`.
- **Steps.** Happy-path body with `"data": {"{{vendorUuid}}": null}`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-WGT-033` · `app/services/weightages/validate_service.rb:40-43,54-56`

#### API-EVDWGT-034 — A relative weight of exactly 100% is refused
- **Why it matters.** The server range is -100 < x < 100 (exclusive), while the screen allows -100…100 inclusive (UI-EVDWGT-005). The boundary must be known.
- **Setup.** `published_rfq`.
- **Steps.** Happy-path body with `"input_type": "relative"` and value `"100"`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P1 · automate · `EVD2-WGT-034` · `app/services/weightages/validate_service.rb:66-71`

#### API-EVDWGT-035 — A relative weight of exactly -100% is refused
- **Why it matters.** Lower boundary of the same rule.
- **Setup.** `published_rfq`.
- **Steps.** Relative, value `"-100"`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-WGT-035` · `app/services/weightages/validate_service.rb:66-71`

#### API-EVDWGT-036 — A relative weight just inside the range is accepted
- **Why it matters.** Confirms the boundary is exclusive, not off by one.
- **Setup.** `published_rfq`.
- **Steps.** Relative, value `"99.99"`; read the round.
- **Expected.** HTTP 200; QA vendor 1's value reads 99.99.
- **Oracle.** `weightages.values.qa_freight_adj.data.<vendor 1>` "99.99".
- **Trace.** P2 · automate · `EVD2-WGT-036` · `app/services/weightages/validate_service.rb:66-71`

#### API-EVDWGT-037 — A negative absolute weight (a credit) is accepted
- **Why it matters.** Absolute weights have no range; a negative amount is how a buyer credits a preferred vendor. It must be stored with its sign.
- **Setup.** `published_rfq`.
- **Steps.** Absolute, value `"-250"`; read the round.
- **Expected.** HTTP 200; value reads -250.
- **Oracle.** `weightages.values.qa_freight_adj.data.<vendor 1>` "-250.0".
- **Trace.** P2 · automate · `EVD2-WGT-037` · `app/services/weightages/validate_service.rb:66-72`

#### API-EVDWGT-038 — A non-numeric absolute weight is stored as zero
- **Why it matters.** An absolute value is only checked for being text, then saved with `to_f`; "abc" (or "") becomes 0 with a success message, so a typo silently removes a vendor's penalty.
- **Setup.** `published_rfq`.
- **Steps.** Absolute, value `"abc"`.
- **Expected (today).** HTTP 200 'Weights added successfully!' and the vendor's value is 0.0. Should be HTTP 422 code 2.
- **Oracle.** No 5xx; a read shows "0.0" for the vendor.
- **Trace.** P1 · automate · `EVD2-WGT-038` · `app/services/weightages/validate_service.rb:54-56,66-72` · `app/services/weightages/create_service.rb:62`

#### API-EVDWGT-039 — Line-item weights must be given per line, not as one number per vendor
- **Why it matters.** In line mode each vendor's value must be a map of line → value.
- **Setup.** `published_rfq`.
- **Steps.** `"weightage_on": "line_item"`, `"data": {"{{vendorUuid}}": "100"}`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2; round unweighted.
- **Trace.** P1 · automate · `EVD2-WGT-039` · `app/services/weightages/validate_service.rb:44`

#### API-EVDWGT-040 — A line value that is itself an object is refused
- **Why it matters.** Deeper nesting must be refused, not flattened.
- **Setup.** `published_rfq`.
- **Steps.** Line mode, `"data": {"{{vendorUuid}}": {"Z2dnWmdaUWtnZw==": {"v": 1}}}`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-WGT-040` · `app/services/weightages/validate_service.rb:45-47,54-56`

#### API-EVDWGT-041 — Relative weights do not have to add up to 100
- **Why it matters.** Weights are independent ± adjustments, not shares of a whole; buyers coming from scoring-matrix tools expect a sum rule. Documents that none exists.
- **Setup.** `published_rfq`.
- **Steps.** Two relative weights for QA vendor 1: qa_freight_adj "60" and qa_quality_pen "70".
- **Expected.** HTTP 200; both stored.
- **Oracle.** 200; `weightages.key_attributes` has 3 entries.
- **Trace.** P2 · automate · `EVD2-WGT-041` · `app/services/weightages/validate_service.rb:26-34`

#### API-EVDWGT-042 — Two weights with the same name are accepted
- **Why it matters.** The screen refuses duplicate names; the API does not, so two identical column headers and a repeated criterion in the vendor's terms are possible.
- **Setup.** `published_rfq`.
- **Steps.** Two keys (qa_freight_adj, qa_quality_pen) both labelled "QA_Platform_Same_{{stamp}}".
- **Expected (today).** HTTP 200. Should be refused like the screen does.
- **Oracle.** No 5xx; `misc.weightage.weightage_names` lists the name twice.
- **Trace.** P2 · automate · `EVD2-WGT-042` · `app/services/weightages/validate_service.rb:62-64` · `src/components/addWeightedParams/addWeightedParams.jsx:160-171`

#### API-EVDWGT-043 — A weight can be set for a vendor who is not invited to the round
- **Why it matters.** Vendor keys are decoded to a company id and stored without checking the round's audience, so weights pile up for companies that never see the event and appear in every read of the round.
- **Setup.** `published_rfq` (QA vendor 2 is NOT invited).
- **Steps.** Happy-path body with `"data": {"{{vendor2Uuid}}": "100"}`.
- **Expected (today).** HTTP 200 and a weight row for QA vendor 2. Should be refused (vendor not in audience).
- **Oracle.** No 5xx; read shows a value under QA vendor 2.
- **Trace.** P1 · automate · `EVD2-WGT-043` · `app/services/weightages/create_service.rb:46-47`

#### API-EVDWGT-044 — A weight for a company that does not exist reports success but saves nothing
- **Why it matters.** `Weightage#save` fails validation (no such company) and its result is ignored; the buyer is told "Weights added successfully!" and the round becomes weighted with an empty column.
- **Setup.** `published_rfq`.
- **Steps.** Happy-path body with `"data": {"Z2dnWmdaUWtnZw==": "100"}`.
- **Expected (today).** HTTP 200 'Weights added successfully!'; no weight row; round marked weighted. Should be 422.
- **Oracle.** No 5xx; read shows the key but no vendor value.
- **Trace.** P1 · automate · `EVD2-WGT-044` · `app/services/weightages/create_service.rb:22-38` · `app/models/weightage.rb:28-32`

#### API-EVDWGT-045 — A line weight for a line that does not exist reports success but saves nothing
- **Why it matters.** Same silent failure in line mode: the line id is not checked against the round.
- **Setup.** `published_rfq`.
- **Steps.** Line mode, `"data": {"{{vendorUuid}}": {"Z2dnWmdaUWtnZw==": "100"}}`.
- **Expected (today).** HTTP 200; nothing stored; round now "line_item" weighted. Should be 422.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EVD2-WGT-045` · `app/services/weightages/create_service.rb:51-64` · `app/models/weightage.rb:31-32`

#### API-EVDWGT-046 — A line weight can be written onto another round's line item
- **Why it matters.** In line mode the line ids come from the request and are never checked to belong to this round. A buyer who knows any trade-product id (of any company) can attach an active weight row to that line under its own round's request — a write across rounds and companies.
- **Setup.** Two rounds A (own) and B (another event, ideally another company); B's trade-product id. Manual only — never run against a real record.
- **Steps.** On A: line mode, `"data": {<vendor>: {<B's trade-product id>: "500"}}`; then read B's sheet.
- **Expected.** Should be 422 (line not in this round). Today (suspected): HTTP 200 and an active Weightage row on B's line, which B's ranking sums in if B is weighted.
- **Oracle.** DB: `weightages` row with item_type TradeProduct, item_id = B's line, created by A's request.
- **Trace.** P0 · manual · `app/services/weightages/create_service.rb:51-64` · `app/models/model_helpers/common_model_helper.rb:64-69`

## 5. Hostile input

#### API-EVDWGT-047 — weightages sent as text (or a number) is refused, not a crash
- **Why it matters.** The first line reads `weightages[:weightage_on]`; on a String or Integer that raises TypeError before any check.
- **Setup.** `published_rfq`.
- **Steps.** `{"weightages": "QA_Platform_weights_{{stamp}}"}` (also try `{"weightages": 5}` by hand).
- **Expected.** Should be HTTP 422 code 2. Today the code path at trade_controller.rb:1779 raises TypeError → HTTP 500.
- **Oracle.** Any 5xx is the defect.
- **Trace.** P1 · automate · `EVD2-WGT-047` · `app/controllers/api/trade_controller.rb:1779`

#### API-EVDWGT-048 — weightages sent as a list is refused, not a crash
- **Why it matters.** Same unguarded index on an Array.
- **Setup.** `published_rfq`.
- **Steps.** `{"weightages": ["lot"]}`.
- **Expected.** Should be HTTP 422 code 2. Today `Array#[](:weightage_on)` raises TypeError → HTTP 500.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EVD2-WGT-048` · `app/controllers/api/trade_controller.rb:1779`

#### API-EVDWGT-049 — weightages sent as true is refused cleanly
- **Why it matters.** Contrast with 047/048: `true` has no `[]`, so `try` returns nil and the parameter check catches it.
- **Setup.** `published_rfq`.
- **Steps.** `{"weightages": true}`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-WGT-049` · `app/controllers/api/trade_controller.rb:1779-1782`

#### API-EVDWGT-050 — The weight list sent as text crashes the validator
- **Why it matters.** `values` only has to be present; the validator then calls `.each` on it.
- **Setup.** `published_rfq`.
- **Steps.** `{"weightages": {"weightage_on": "lot", "values": "QA_Platform_text"}}`.
- **Expected.** Should be HTTP 422 code 2. Today `String#each` → NoMethodError → HTTP 500.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EVD2-WGT-050` · `app/services/weightages/validate_service.rb:29`

#### API-EVDWGT-051 — A weight's vendor values sent as text crash the validator
- **Why it matters.** `data` is only checked for blankness, then iterated.
- **Setup.** `published_rfq`.
- **Steps.** Happy-path body with `"data": "QA_Platform_text"`.
- **Expected.** Should be HTTP 422 code 2. Today `String#each` → NoMethodError → HTTP 500.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EVD2-WGT-051` · `app/services/weightages/validate_service.rb:38-40`

#### API-EVDWGT-052 — A weight list sent as key/value pairs passes validation, writes rows, then crashes
- **Why it matters.** `[["qa_freight_adj", {…}]]` iterates exactly like a hash, so validation passes and the weight rows are committed; then `weights.keys` fails on the Array. The buyer sees an error, but the vendor's weight row is live while the round is not marked weighted.
- **Setup.** `published_rfq`.
- **Steps.** `{"weightages": {"weightage_on": "lot", "values": [["qa_freight_adj", {"label": "QA_Platform_Freight_{{stamp}}", "input_type": "absolute", "data": {"{{vendorUuid}}": "100"}}]]}}`.
- **Expected.** Should be HTTP 422 code 2 with nothing written. Today (suspected): HTTP 500 (NoMethodError `keys` for Array) after the Weightage row is saved.
- **Oracle.** No 5xx; DB: no Weightage row for the round.
- **Trace.** P1 · automate · `EVD2-WGT-052` · `app/controllers/concerns/trade_controller_helper.rb:3849-3855` · `app/services/weightages/create_service.rb:42-45`

#### API-EVDWGT-053 — A garbled line id in line mode crashes the save
- **Why it matters.** A line id that decodes to nothing is passed as `item_id: nil` into a Sorbet-typed method that requires an Integer.
- **Setup.** `published_rfq`.
- **Steps.** Line mode, `"data": {"{{vendorUuid}}": {"WrongUuid1=": "100"}}`.
- **Expected.** Should be HTTP 422 code 2. Today (suspected): TypeError from the `item_id: Integer` signature → HTTP 500.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EVD2-WGT-053` · `app/services/weightages/create_service.rb:16-22,56-60` · `lib/encrypt_decrypt.rb:59-72`

#### API-EVDWGT-054 — A weight key containing "uuid" is mangled by the id decoder
- **Why it matters.** Every parameter key containing "uuid" is renamed and its value decoded as an id — including a weight key the buyer named e.g. "qa_uuid_bonus". The weight object becomes a number and the save is refused with a generic message the buyer cannot act on.
- **Setup.** `published_rfq`.
- **Steps.** Happy-path body with the key `qa_uuid_bonus` instead of `qa_freight_adj`.
- **Expected (today).** HTTP 422, code 2 'Insufficient parameters'. (The screen builds keys from the typed name, so a weight called "uuid bonus" can never be saved.)
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-WGT-054` · `app/controllers/concerns/params_auth.rb:70-86` · `src/redux/orders/helpers.js:253-254`

#### API-EVDWGT-055 — Script text in a weight name is stripped before it is stored
- **Why it matters.** The name is echoed into the sheet header and the vendor's terms; it must never come back as markup.
- **Setup.** `published_rfq`.
- **Steps.** Happy-path body with `"label": "QA_Platform_<script>alert(1)</script>_{{stamp}}"`; read the round.
- **Expected.** HTTP 200; the stored name is "QA_Platform_alert(1)_…" (tags removed).
- **Oracle.** `misc.weightage.weightage_names` contains "QA_Platform_alert(1)_{{stamp}}".
- **Trace.** P1 · automate · `EVD2-WGT-055` · `app/controllers/concerns/params_auth.rb:18-41` · `config/initializers/string.rb:38-40`

#### API-EVDWGT-056 — HTML in a weight KEY is stored raw
- **Why it matters.** Values are HTML-stripped, keys are not. The key becomes a sheet column `key_attribute` and, on the edit screen, the displayed weight name (underscores → spaces). Raw markup in keys relies entirely on every renderer escaping.
- **Setup.** `published_rfq`.
- **Steps.** Happy-path body with the key `qa_<img src=x onerror=alert(1)>`.
- **Expected (today).** HTTP 200 and the key kept verbatim in `misc.weightage.key_attributes`. Should be refused (keys limited to letters, digits, underscore).
- **Oracle.** No 5xx.
- **Trace.** P2 · automate · `EVD2-WGT-056` · `app/controllers/concerns/params_auth.rb:22-41` · `app/controllers/api/trade_controller.rb:1804`

#### API-EVDWGT-057 — A 400-digit weight becomes Infinity and the round still reads
- **Why it matters.** `to_f` of a huge string is Infinity, which Postgres stores; reads and later rankings must not break on it.
- **Setup.** `published_rfq`.
- **Steps.** Absolute value of 400 nines; read the round.
- **Expected.** Should be refused as out of range. Today: HTTP 200 and the value reads "Infinity". The round read must stay 2xx.
- **Oracle.** No 5xx on the save or the read.
- **Trace.** P2 · automate · `EVD2-WGT-057` · `app/services/weightages/create_service.rb:62` · `app/models/trade_request.rb:3141-3145`

#### API-EVDWGT-058 — A weight named "weighted_total" collides with the synthetic total column
- **Why it matters.** The action appends `weighted_total` to every list; a buyer key with the same name gives two total columns and makes `handle_removed_weight_keys` ignore that key on removal.
- **Setup.** `published_rfq`.
- **Steps.** Happy-path body with the key `weighted_total`.
- **Expected (today).** HTTP 200 and `weighted_total` twice in the key list. Should be refused as a reserved key.
- **Oracle.** No 5xx.
- **Trace.** P2 · automate · `EVD2-WGT-058` · `app/controllers/api/trade_controller.rb:1804-1808` · `app/models/trade_request.rb:2571-2572`

#### API-EVDWGT-059 — A weight named like a bid column ("price") still leaves the schema readable
- **Why it matters.** Weight widgets are appended to the buyer's sheet with the weight key as `key_attribute`; "price" duplicates the real price column's key.
- **Setup.** `published_rfq`.
- **Steps.** Happy-path body with the key `price`; read the buyer schema.
- **Expected.** Should be refused (reserved widget key). Today: HTTP 200; the schema read must not crash.
- **Oracle.** No 5xx on save; `GET /v1/trade/{{tradeId}}/schema` 2xx.
- **Trace.** P2 · automate · `EVD2-WGT-059` · `app/controllers/concerns/trade_template_helper.rb:156-167`

## 6. Bids already in, and the round's state

#### API-EVDWGT-060 — Once a vendor has bid, RFQ weights are locked unless the round allows edits
- **Why it matters.** Changing the scoring after prices are in can flip the winner; `allow_edit_weight_param_rfq` (round config, copied from the template / company configuration at creation; absent = off) is the only switch.
- **Setup.** Live RFQ with QA vendor 1's submitted bid (recipe `rfq_with_bid`); round `trade_config.allow_edit_weight_param_rfq` off/absent.
- **Steps.** `PATCH /trade/{{tradeId}}/edit_weight_parameters` with the happy-path body.
- **Expected.** Refused, nothing changed. HTTP 422, code 15 'Operation failed' — the same generic code also means "not a rank round" (§6, 068), so the screen cannot say "bids already received".
- **Oracle.** 422 code 15; round still unweighted.
- **Trace.** P0 · automate · `EVD2-WGT-060` · `app/controllers/api/trade_controller.rb:1786-1788` · `app/models/model_helpers/trade_request_model_helper.rb:857-859,1092-1094`

#### API-EVDWGT-061 — With allow_edit_weight_param_rfq on, weights can be added after bids
- **Why it matters.** The other side of the switch: companies that enable it expect the save to go through.
- **Setup.** `rfq_with_bid` on a company whose template sets `allow_edit_weight_param_rfq` true.
- **Steps.** Happy-path save.
- **Expected.** HTTP 200 'Weights added successfully!'.
- **Oracle.** 200; round weighted.
- **Trace.** P1 · automate · `EVD2-WGT-061` · `app/controllers/api/trade_controller.rb:1786` · `app/models/model_helpers/trade_request_model_helper.rb:1092-1094`

#### API-EVDWGT-062 — Editing weights after bids does not re-rank the bids already in
- **Why it matters.** The weighted path only updates rows and `misc`; it never recalculates `event_score_for_participants` (the publish path does, trade_controller_helper.rb:4575-4577). Ranks and the vendor's own rank stay on the old weights until some vendor saves a bid again.
- **Setup.** `allow_edit_weight_param_rfq` ON; two QA vendors bid; weights saved, then changed to flip the order. Manual (setting + two bids).
- **Steps.** Change the weights; read indicators / QCS before and after a vendor revises.
- **Expected.** Ranks follow the new weights immediately. Today (suspected): unchanged until the next bid save.
- **Oracle.** `GET /v1/trade/:id/event_indicators` rank unchanged right after the edit.
- **Trace.** P1 · manual · `app/controllers/api/trade_controller.rb:1797-1816` · `app/controllers/concerns/trade_controller_helper.rb:4575-4577` · `app/models/trade_request.rb:1987-2003`

#### API-EVDWGT-063 — A rejected or revoked bid no longer locks the weights
- **Why it matters.** The lock counts only bids in active / selected / requested / anomaly_detected. After the only bid is rejected the buyer may re-weight even though a vendor has already shown its price.
- **Setup.** `rfq_with_bid`, setting off; buyer rejects the bid (with rebidding allowed). Manual (reject step).
- **Steps.** Happy-path save after the rejection.
- **Expected (today).** HTTP 200. Product decision whether a priced-then-rejected bid should still lock.
- **Oracle.** 200 after the reject; 422 code 15 before it.
- **Trace.** P2 · manual · `app/models/bid.rb:491-493`

#### API-EVDWGT-064 — Two saves at the same moment can double a vendor's weight
- **Why it matters.** Rows are found-or-built with no unique index; two concurrent first saves both insert, and the score sums every active row.
- **Setup.** `published_rfq`; two identical saves fired within milliseconds. Manual (concurrency).
- **Steps.** Fire both; count Weightage rows for (round, vendor, key).
- **Expected.** One row. Today (suspected): two rows, weight counted twice.
- **Oracle.** DB row count; read shows "200.0" instead of "100.0" for a lot weight of 100.
- **Trace.** P2 · manual · `app/services/weightages/create_service.rb:23-28` · `app/models/model_helpers/common_model_helper.rb:64-69`

#### API-EVDWGT-065 — Weights can still be added after the bidding window closed with no bids
- **Why it matters.** There is no time check, and a round with no bids stays `active` after expiry (it moves to closed only when every line is closed). Weights added after the deadline change the record of an expired event.
- **Setup.** RFQ, QA vendor 1 invited, no bids, window and extra time over (recipe `closed_rfq`).
- **Steps.** Happy-path save.
- **Expected (today).** HTTP 200 'Weights added successfully!' (or 422 code 2 if the round has already been moved to closed). Should be refused after close.
- **Oracle.** No 5xx.
- **Trace.** P2 · automate · `EVD2-WGT-065` · `app/workers/mark_event_closed_worker.rb:5-16` · `app/controllers/api/trade_controller.rb:1777-1788`

#### API-EVDWGT-066 — A closed round with a bid refuses weight changes
- **Why it matters.** After close, the bid lock (or the closed status) must hold.
- **Setup.** `closed_rfq_with_bid`; `allow_edit_weight_param_rfq` off.
- **Steps.** Happy-path save.
- **Expected.** Refused: HTTP 422 code 15 'Operation failed' while the round is still active, or code 2 'Insufficient parameters' once it is closed.
- **Oracle.** Non-2xx, no 5xx.
- **Trace.** P1 · automate · `EVD2-WGT-066` · `app/controllers/api/trade_controller.rb:1777,1786-1788`

#### API-EVDWGT-067 — An awarded round refuses weight changes
- **Why it matters.** Re-weighting after award would make the award contradict the ranking.
- **Setup.** `awarded_rfq` (bid in, closed, proposal submitted); `allow_edit_weight_param_rfq` off.
- **Steps.** Happy-path save.
- **Expected.** Refused: 422 code 15 or code 2 (see 066). With the setting on and the round still active the API would accept — there is no award check.
- **Oracle.** Non-2xx, no 5xx.
- **Trace.** P1 · automate · `EVD2-WGT-067` · `app/controllers/api/trade_controller.rb:1777-1788`

#### API-EVDWGT-068 — A technical (RFP) round cannot be weighted
- **Why it matters.** Weights adjust prices; a technical round has no ranking mode (`auction_config` nil), so the first save is refused.
- **Setup.** Live RFP + RFQ event (recipe `published_rfp_rfq`).
- **Steps.** `PATCH /trade/{{technicalTradeUuid}}/edit_weight_parameters` with the happy-path body.
- **Expected.** HTTP 422, code 15 'Operation failed'.
- **Oracle.** 422 code 15.
- **Trace.** P2 · automate · `EVD2-WGT-068` · `app/controllers/concerns/trade_controller_helper.rb:3586,3844-3846`

#### API-EVDWGT-069 — Price-based, knockout, Dutch and rank-and-price auctions cannot get weights after creation
- **Why it matters.** The first save requires a rank or traffic-light round. A price-based auction refuses with the generic "Operation failed", which looks like a server fault.
- **Setup.** Live auctions of each strategy, no weights, no bids. Manual (no auction recipe).
- **Steps.** Happy-path save on each.
- **Expected.** rank / traffic_light: HTTP 200. price / rank_and_price / knockout / dutch / book_building: HTTP 422 code 15 'Operation failed'.
- **Oracle.** Codes per strategy.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:3844-3846` · `app/models/trade_request.rb:166`

#### API-EVDWGT-070 — Auctions and RFQ-then-auction rounds use allow_edit_weight_param_auction after bids
- **Why it matters.** Auctions have their own switch; an RFQ-then-auction stage follows the auction switch, not the RFQ one.
- **Setup.** Rank auction and RFQ-then-auction stage with one bid each; `allow_edit_weight_param_auction` off, then on. Manual.
- **Steps.** Happy-path save on each, both settings.
- **Expected.** Off: HTTP 422 code 15 'Operation failed'. On: HTTP 200.
- **Oracle.** As stated; `allow_edit_weight_param_rfq` has no effect on these rounds.
- **Trace.** P1 · manual · `app/controllers/api/trade_controller.rb:1786` · `app/models/model_helpers/trade_request_model_helper.rb:1088-1090`

## 7. Ranking, comparison and who can see the weights

#### API-EVDWGT-071 — A vendor can read the weights set for a competitor
- **Why it matters.** The round read serialises `weightages` for every caller, with every vendor's company id and value. A vendor opening the round learns which competitors the buyer penalises or favours and by how much — a breach of the fairness contract.
- **Setup.** `published_rfq`; the buyer saves weights for QA vendor 1 ("100") and QA vendor 2 ("300").
- **Steps.** 1. Buyer saves. 2. QA vendor 1 reads the round (`GET /trade/{{tradeId}}?response_type=template`).
- **Expected.** The vendor's read carries no value for QA vendor 2 (ideally no `weightages` at all). Today (suspected): `weightages.values.qa_freight_adj.data.<vendor 2>` = "300.0" is visible to vendor 1.
- **Oracle.** Vendor read: path `weightages.values.qa_freight_adj.data.<vendor 2>` absent.
- **Trace.** P0 · automate · `EVD2-WGT-071` · `app/serializers/trade_template_serializer.rb:15,877-879` · `app/models/trade_request.rb:1760-1772,3129-3145`

#### API-EVDWGT-072 — Weights change who is L1 in the comparison sheet
- **Why it matters.** The point of the feature: vendor A quotes lower but carries a ₹ penalty larger than the gap, so B must rank first in the QCS and the indicators.
- **Setup.** Live RFQ, vendors A and B invited, lot absolute weight A = +500, B = 0 saved before any bid; A bids 1000, B bids 1200. Manual (two vendors + weights before bids).
- **Steps.** Read the QCS / sheet and `GET /v1/trade/:id/event_indicators`.
- **Expected.** "Weighted Total" A = 1500, B = 1200; B ranked L1; the Best Price CTA is hidden on weighted events.
- **Oracle.** Ranks from indicators; weighted_total column values.
- **Trace.** P0 · manual · `app/models/bid.rb:1309-1324` · `app/models/concerns/bid_rank_helper.rb:95` · `src/views/orderDetails/auctionIndicators.jsx:68-71`

#### API-EVDWGT-073 — Relative weights are a percentage of the vendor's own score
- **Why it matters.** A relative weight adds score × value / 100 (4-decimal precision by default), not a flat amount; a -10% on a 2000 bid must read 1800.
- **Setup.** As 072 with relative weights A = -10, B = +5; bids A 2000, B 1800. Manual.
- **Steps.** Read weighted totals.
- **Expected.** A 1800.0, B 1890.0; A ranks L1.
- **Oracle.** Weighted totals in the sheet.
- **Trace.** P1 · manual · `app/models/weightage.rb:37-41` · `app/models/model_helpers/common_model_helper.rb:64-69`

#### API-EVDWGT-074 — Weight columns appear only in the buyer's web sheet
- **Why it matters.** Buyers see one read-only column per weight plus "Weighted Total" (line mode: "Weighted <ranking key>"); vendors and the mobile app do not get the columns.
- **Setup.** A weighted round. Manual (sheet layer shape is not asserted by the runner).
- **Steps.** Read `GET /v1/trade/:id/schema` as buyer (web), as vendor, and as buyer from the mobile app.
- **Expected.** Buyer web: weight widgets present with `mode_type` read and the round currency prefix. Vendor / mobile: absent.
- **Oracle.** Global (lot) or inline (line) widgets list.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_template_helper.rb:156-167,6078-6080` · `app/models/widget.rb:537-552`

## 8. Weights set while creating the round (POST /trade/template_input) — catalog only

#### API-EVDWGT-075 — Line weights sent at creation are matched to lines by weight identifier
- **Why it matters.** At creation the lines have no ids yet; the create flow maps each line's `meta_data.weight_identifier` to its new trade-product id before saving weights.
- **Setup.** Create an RFQ with `weightages` (line mode) whose inner keys are the lines' weight identifiers. Manual (create flow).
- **Steps.** `POST /trade/template_input` with weights; read the new round.
- **Expected.** Round created weighted from the start; values per new line id.
- **Oracle.** `weightages.values` keyed by the new trade-product ids.
- **Trace.** P1 · manual · `app/controllers/api/trade_controller.rb:316-321` · `app/controllers/concerns/trade_controller_helper.rb:5563-5574`

#### API-EVDWGT-076 — Weights on a price-based auction at creation refuse the whole create
- **Why it matters.** The rank / traffic-light rule also applies at creation; the error is raised inside the create transaction, and Rails 7.0 rolls back on `return`, so no half-created round should remain.
- **Setup.** Create a price-based auction with `weightages`. Manual.
- **Steps.** `POST /trade/template_input`; list the event's stages afterwards.
- **Expected.** HTTP 422 code 15 'Operation failed'; no new round.
- **Oracle.** No trade_request row created.
- **Trace.** P2 · manual · `app/controllers/api/trade_controller.rb:204,316-321` · `app/controllers/concerns/trade_controller_helper.rb:3844-3846`

#### API-EVDWGT-077 — An unknown weight identifier at creation crashes instead of being refused
- **Why it matters.** An identifier with no matching line maps to a nil key, which reaches the Sorbet-typed save as `item_id: nil`.
- **Setup.** Create an RFQ with line weights keyed by an identifier no line carries. Manual.
- **Steps.** `POST /trade/template_input`.
- **Expected.** Should be 422 code 2. Today (suspected): TypeError → HTTP 500 (create rolled back).
- **Oracle.** 5xx is the defect.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:5564-5571` · `app/services/weightages/create_service.rb:16-22,56-60`

## 9. The weight screens (procol-client-dashboard)

#### UI-EVDWGT-001 — The weight button reads Add, Edit or View depending on bids and existing weights
- **Why it matters.** The label is the buyer's only hint of what is possible.
- **Setup.** Order details → Participants list of a live RFQ: (a) no weights, no bids; (b) weights, no bids; (c) weights and a bid; (d) an RFP stage.
- **Steps.** Look at the link next to the vendor search.
- **Expected.** (a) "Add Weight Params", (b) "Edit Weight Params", (c) "View Weight Params" (modal read-only, OK disabled), (d) no button.
- **Oracle.** Button text / presence.
- **Trace.** P2 · manual · `src/components/audienceList/audienceList.jsx:65-91,95-118,609-617`

#### UI-EVDWGT-002 — After bids the screen never allows editing, even when the round allows it
- **Why it matters.** `getWeightParamsStatus` returns "view" for bids > 0 in both branches, so `allow_edit_weight_param_rfq` / `_auction` have no effect on this screen while the API honours them.
- **Setup.** Round with `allow_edit_weight_param_rfq` on, weights saved, one bid.
- **Steps.** Open the weight modal.
- **Expected.** Editable (setting on). Today: "View Weight Params", read-only.
- **Oracle.** OK button disabled.
- **Trace.** P2 · manual · `src/components/audienceList/audienceList.jsx:80-87`

#### UI-EVDWGT-003 — A live RFQ reads the AUCTION edit flag
- **Why it matters.** `(info.rfxMode === ORDER_MODE.auction || ORDER_MODE.rfqToAuction)` is always true, so for every non-expired round the screen uses `allow_edit_weight_param_auction`; the RFQ branch is unreachable.
- **Setup.** Live RFQ with `allow_edit_weight_param_rfq` on and `allow_edit_weight_param_auction` off (and the reverse).
- **Steps.** Inspect `tradeConfig.isAllowedToModifyWeightParams` / the weight sheet's read-only cells.
- **Expected.** The RFQ flag decides. Today: the auction flag decides.
- **Oracle.** Value of `isAllowedToModifyWeightParams` vs the two flags.
- **Trace.** P2 · manual · `src/redux/orders/selectors.js:4387-4401`

#### UI-EVDWGT-004 — An expired round with no bids still offers Add / Edit Weight Params
- **Why it matters.** The expired branch sets "view" but the next `if (bidCount === 0)` overwrites it; together with API-EVDWGT-065 the buyer can re-weight an expired event.
- **Setup.** Expired RFQ, no bids.
- **Steps.** Open Participants.
- **Expected.** View only (or hidden). Today: "Add Weight Params" / "Edit Weight Params" and the save succeeds.
- **Oracle.** Button text; a save returns success.
- **Trace.** P2 · manual · `src/components/audienceList/audienceList.jsx:73-84`

#### UI-EVDWGT-005 — A relative weight of exactly 100% passes the screen and fails on the server
- **Why it matters.** The sheet rule is -100 ≤ x ≤ 100; the server needs -100 < x < 100, so the buyer gets the server's generic "Insufficient parameters".
- **Setup.** Weight modal, a relative (%) weight.
- **Steps.** Enter 100 for a vendor; OK.
- **Expected.** The screen should block 100 with its own message. Today: no screen error, then a server error toast.
- **Oracle.** Network: 422 code 2.
- **Trace.** P2 · manual · `src/components/addWeightedParams/utils.jsx:98-107,129-138` · `app/services/weightages/validate_service.rb:66-71`

#### UI-EVDWGT-006 — Reopening the modal shows the key, not the name the buyer typed
- **Why it matters.** The name is rebuilt from the key with underscores turned into spaces; a name typed "Freight_Cost (FY25)" comes back as "Freight Cost (FY25)" and is then re-saved under a different key.
- **Setup.** Save a weight named "Freight_Cost"; reopen the modal.
- **Steps.** Read the name field; save without changes; read the round.
- **Expected.** The stored label is shown. Today: "Freight Cost", and the next save sends key "Freight_Cost" with label "Freight Cost".
- **Oracle.** `misc.weightage.weightage_names` before and after.
- **Trace.** P2 · manual · `src/redux/orders/selectors.js:7776` · `src/components/addWeightedParams/utils.jsx:158`

#### UI-EVDWGT-007 — "Freight cost" and "Freight_cost" pass the duplicate check but overwrite each other
- **Why it matters.** Duplicates are checked on the raw name; the payload key replaces spaces with underscores, so the second weight silently replaces the first.
- **Setup.** Weight modal.
- **Steps.** Add "Freight cost" (values A) and "Freight_cost" (values B); OK.
- **Expected.** Refused as duplicate. Today: saved, only one weight (values B) exists.
- **Oracle.** Read the round: one key.
- **Trace.** P2 · manual · `src/components/addWeightedParams/addWeightedParams.jsx:160-171` · `src/redux/orders/helpers.js:253-254,274-275`

#### UI-EVDWGT-008 — The modal blocks an empty name, no weights and an empty sheet
- **Why it matters.** These screen checks are what keep the server's generic code 2 from reaching buyers.
- **Setup.** Weight modal.
- **Steps.** 1. OK with no weights. 2. Add a weight with no name. 3. A named weight with no values.
- **Expected.** 1 "Please add at least one weight value"; 2 "Name of weight parameter can't be empty" and the field outlined red; 3 "Please add minium one value for <name>"; nothing sent.
- **Oracle.** No PATCH in the network log.
- **Trace.** P2 · manual · `src/components/addWeightedParams/addWeightedParams.jsx:130-194`

#### UI-EVDWGT-009 — The create-screen weight modal sends a payload the server always refuses
- **Why it matters.** `updateWeightParams` sends `{key_attributes, weightage_names, values}` (wrapped in `weightages` only for "order detail add") with no `weightage_on`; every such save answers "Insufficient parameters".
- **Setup.** Create-order flow → Audience → weights modal on an existing round (edit path).
- **Steps.** Change a vendor's weight; OK.
- **Expected.** Saved. Today: 422 code 2 toast.
- **Oracle.** Network: request body lacks `weightages.weightage_on`; response code 2.
- **Trace.** P2 · manual · `src/views/createOrder/addWeightModal.jsx:205-238` · `src/redux/orders/actions.js:2229-2238` · `src/redux/orders/helpers.js:759-783`

#### UI-EVDWGT-010 — The modal sheet and the saved payload can use different modes
- **Why it matters.** The sheet is built from the STORED `weightage_on`, but the payload's `weightage_on` comes from the round's closing mode; a lot-weighted round now closing per item submits a one-row lot sheet as line weights for the first product only.
- **Setup.** A round with lot weights whose closing mode is item-wise.
- **Steps.** Open Edit Weight Params; change a value; OK; read the round.
- **Expected.** Mode kept (lot). Today (suspected): saved as line_item with only line 1 populated.
- **Oracle.** `weightages.weightage_on` and values after the save.
- **Trace.** P2 · manual · `src/components/addWeightedParams/addWeightedParams.jsx:21-28,45-48` · `src/redux/orders/helpers.js:215-283`
