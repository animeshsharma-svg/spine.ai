# Vendors regretting line items and declining participation — regret, undo, submit, decline, participate

Deep cases for the vendor saying "no" inside a sourcing event: regretting one line on a draft bid and undoing it
(`PATCH /v1/bids/:id/line_items/:egli_id/regret_status`, `Api::V1::BidsController#update_regret_status` +
`Bids::LineItemRegretService`), what happens to a regretted line when the bid is saved or submitted (the draft regret is
written onto the line's `participants` as "regretted", the priced line is dropped and, if nothing is left, the whole bid
turns "revised"), quoting again after a regret, the technical-round "Regret" answer, how the buyer, the evaluation and
the award see a regret, and the vendor-level answer to "will you participate?" (`POST /user_intents`, vendor app only, and
`POST /event_groups/:id/participants`, the open-tender self-join). Every case is grounded in `procol-backend` at
`origin/main` (backend paths below are relative to that repo) or in `procol-client-dashboard` for the UI cases.
Cases whose Trace names an `EVD2-RGT-NNN` id have a runnable twin in `prototype/data/deep2-cases/rgt.json`: each builds its
own fresh event (mostly a live RFQ with QA vendor 1 invited), has QA vendor 1 open a draft bid through the vendor app,
then sends the regret / decline as that vendor and reads the result back as the buyer or the vendor. Two helper twins
(`EVD2-RGT-H01` = regret the line, `EVD2-RGT-H02` = decline the event with a reason) are reused as steps.

**Read before running.** Regret is a vendor-app action (`data/app-access.json` → apps.vendor.v1.bids.update_regret_status;
`config/app_auth_config.yml:1977`). A buyer (console) token is answered 401 and that buyer is signed out
(`app/controllers/concerns/json_helpers.rb:31-35`), so the older regret cases EDGE-BID-099..102, whose twins carry no actor
and therefore run as the buyer, cannot reach the code they describe; the vendor-side twins here replace them. EDGE-BID-100
also expects code 806 for an unknown bid, but the controller answers 32 before the service is called (see 031).
Deliberately manual: anything needing a lot-split event, a second line item, a second user of the vendor company, a
"save draft" body, two parallel requests, a line item of another event (unsafe: on submit it would write into a real
record), or a buyer token on a vendor-only route. `Z2dnWmdaUWtnZw==` decodes to id 999999999 (no such row) and
`WrongUuid1=` to nil. Keys containing `uuid` are decoded by `ParamsAuth#check_for_uuid`
(app/controllers/concerns/params_auth.rb:57-91); the path segment `:egli_id` is not — the service decodes it itself
(app/services/bids/line_item_regret_service.rb:35). Existing cases this file goes deeper than: EDGE-BID-001..017 (intent
validation), EDGE-BID-078, EDGE-BID-099..102, EDGE-AWD-114, EVAL-TNA-004, XMAT-051, API-XPUB-048..057, API-AUD-011..016.

## 1. Regretting and un-regretting a line on a draft bid

#### API-EVDRGT-001 — A vendor regrets a line on its own draft bid
- **Why it matters.** This is the "I cannot supply this item" button; if it fails the vendor has to leave the line blank and the buyer cannot tell a decline from a forgotten line.
- **Setup.** A live RFQ with QA vendor 1 invited; the vendor has opened a draft bid and priced nothing.
- **Steps.** As QA vendor 1 (vendor app), `PATCH /v1/bids/{{bidUuid}}/line_items/{{lineItemUuid}}/regret_status` with `{"company_uuid": "{{vendorUuid}}", "trade_request_uuid": "{{tradeId}}", "action_type": "regret"}`.
- **Expected.** Accepted. The reply echoes the bid and labels the line as regretted; nothing changes on the line for the buyer yet — the regret only lives in the draft until the vendor saves or submits. HTTP 200 with `bid_uuid` and `status: {"value": "regretted", "label": "REGRET"}`.
- **Oracle.** 200; the draft's `meta_data.regretted_eglis` has the line with status "draft" (DB read), and the line's `participants` is unchanged.
- **Trace.** P1 · automate · `EVD2-RGT-001` · `app/controllers/api/v1/bids_controller.rb:141-157` · `app/services/bids/line_item_regret_service.rb:40-52,61-72`

#### API-EVDRGT-002 — Regretting the same line twice is harmless
- **Why it matters.** A double click must not create two entries or flip the line back.
- **Setup.** As 001, and the line has already been regretted once on this draft.
- **Steps.** Send the 001 request a second time.
- **Expected.** Accepted again; the draft still holds the line once, as regretted (the entry is keyed by the line id and simply rewritten). HTTP 200, status label "REGRET".
- **Oracle.** 200; one key for the line in `regretted_eglis`.
- **Trace.** P2 · automate · `EVD2-RGT-002` · `app/services/bids/line_item_regret_service.rb:63-72`

#### API-EVDRGT-003 — Undoing a regret before submitting gives a normal bid
- **Why it matters.** Vendors change their minds; an undone regret must leave no trace when they then quote and submit.
- **Setup.** A live RFQ, QA vendor 1's draft with the line regretted (helper H01).
- **Steps.** 1. `PATCH …/regret_status` with `"action_type": "undo_regret"`. 2. Price the line. 3. Submit the bid. 4. As the buyer, read the round.
- **Expected.** The undo is accepted (the draft entry is removed; the line was never written as regretted, so nothing else changes), the bid submits normally and the buyer sees one live bid. Undo answers HTTP 200 with `status: {"value": null, "label": null}`.
- **Oracle.** Buyer `GET /trade/{{tradeId}}` → `bid_count` is 1.
- **Trace.** P1 · automate · `EVD2-RGT-003` · `app/services/bids/line_item_regret_service.rb:73-91` · `app/helpers/api/v1/bids_controller_helper.rb:499-503`

#### API-EVDRGT-004 — "Undo" with nothing to undo is accepted and changes nothing
- **Why it matters.** The screen may send undo for a line that was never regretted (stale state); it must not fail or invent a regret.
- **Setup.** A fresh draft of QA vendor 1, nothing regretted.
- **Steps.** `PATCH …/regret_status` with `"action_type": "undo_regret"`.
- **Expected.** Accepted as a no-op: the delete finds nothing and the bid is saved unchanged. HTTP 200, status value null.
- **Oracle.** 200; `regretted_eglis` is empty.
- **Trace.** P2 · automate · `EVD2-RGT-004` · `app/services/bids/line_item_regret_service.rb:73-91`

#### API-EVDRGT-005 — A line regretted in the draft can still be priced
- **Why it matters.** The vendor says "I can't supply this" and then types a price on the same line; the server should either refuse or make one of the two win predictably.
- **Setup.** A live RFQ (one round, no technical stage), QA vendor 1's draft with the line regretted.
- **Steps.** Price the regretted line (`POST /v1/bids/{{bidUuid}}/create_bid_products`).
- **Expected (today).** Accepted. The price check that refuses regretted lines (736) reads only the line's saved `participants`, which a draft regret has not touched yet, and it only runs when a technical round exists. The regret wins later, at submit (see 006). HTTP 200.
- **Oracle.** 200 on the price step; then 006's outcome on submit.
- **Trace.** P2 · automate · `EVD2-RGT-005` · `app/helpers/api/v1/bids_controller_helper.rb:289-301` · `app/controllers/api/v1/bids_controller.rb:113-139`

#### API-EVDRGT-006 — Regretting the only line and submitting leaves the vendor with no live bid
- **Why it matters.** The submit says "success" but the bid silently disappears: the vendor thinks it has quoted, the buyer's count of bids drops, yet the buyer's participants list still says "bid placed".
- **Setup.** A live one-round RFQ with one line; QA vendor 1's draft with the line regretted (step 1 of this case).
- **Steps.** 1. Regret the line. 2. Price it. 3. Submit the bid. 4. As the buyer read the round and the event's participants (`GET /event_groups/{{eventGroupUuid}}/get_audience`).
- **Expected (today).** The submit is accepted. Right after activating the bid the server writes "regretted" onto the line for this vendor, marks the draft entry "processed", drops the priced line and — because no line is left — turns the whole bid "revised". The buyer's round shows no live bid, while the participants list still counts the vendor under "bid placed" (it includes revised bids). Submit answers HTTP 200.
- **Oracle.** Buyer round `bid_count` = 0; `get_audience` → `stages[*].bid_placed_company_uuids` still contains the vendor; DB: the bid's status is revised, the line's `meta_data.participants[<vendor id>]` = "regretted", `participants_data[<vendor id>].flow` = "Regretted in Commercial".
- **Trace.** P1 · automate · `EVD2-RGT-006` · `app/helpers/api/v1/bids_controller_helper.rb:476-477,499-528,1047-1099,1101-1125` · `app/controllers/concerns/event_group_controller_helper.rb:398-401`

#### API-EVDRGT-007 — Submitting a regret-only draft (no prices) in a one-round event
- **Why it matters.** "Regret everything, quote nothing" is a legitimate way to decline; it must end in a clean answer, never a crash.
- **Setup.** A live one-round RFQ; QA vendor 1's draft with the line regretted and no price.
- **Steps.** Submit the draft (`PATCH /v1/bids/{{bidUuid}}` with `status: "active"`).
- **Expected.** A clean answer: either refused because nothing is priced (e.g. 372 'Please quote prices for all the products.' on a lot-closing round) or accepted and the bid immediately turned "revised" (the empty bid has no line to keep). Never a 5xx.
- **Oracle.** Status below 500; if 200, buyer `bid_count` = 0.
- **Trace.** P2 · automate · `EVD2-RGT-007` · `app/helpers/api/v1/bids_controller_helper.rb:465-477,818-821,1101-1125`

#### API-EVDRGT-008 — Regretting every line on a new draft withdraws an already-submitted bid
- **Why it matters.** There is no "withdraw my quote" button for vendors, but this path does exactly that, during bidding, without any buyer approval or audit wording that says "withdrawn".
- **Setup.** A live RFQ where QA vendor 1 has a submitted bid; the round's `lock_quote_after_submission` is off and no price-change approval applies.
- **Steps.** 1. Open a new draft (it starts with the live bid's lines). 2. Regret the only line. 3. Re-price at 95. 4. Submit. 5. As the buyer, read the round.
- **Expected (today).** The submit is accepted as a revision: the old bid becomes "revised", the new one is activated and then, because its only line is regretted, also turned "revised". The vendor ends with no live bid. HTTP 200.
- **Oracle.** Buyer round `bid_count` = 0.
- **Trace.** P1 · automate · `EVD2-RGT-008` · `app/helpers/api/v1/bids_controller_helper.rb:113-141,456-477,1101-1125`

#### API-EVDRGT-009 — Undo after submitting is refused because the bid is no longer a draft
- **Why it matters.** Once submitted, the regret can no longer be taken back through this button; the vendor needs to be told clearly.
- **Setup.** A live RFQ; QA vendor 1 regretted the line, priced it and submitted (the bid is now revised).
- **Steps.** `PATCH /v1/bids/{{bidUuid}}/line_items/{{lineItemUuid}}/regret_status` with `"action_type": "undo_regret"` on the submitted bid.
- **Expected.** Refused: only draft bids are looked up. HTTP 422, code 32 'Bid not found'.
- **Oracle.** 422 code 32; the line stays "regretted".
- **Trace.** P1 · automate · `EVD2-RGT-009` · `app/controllers/api/v1/bids_controller.rb:146-147`

#### API-EVDRGT-010 — Opening a fresh draft does not let the vendor undo a submitted regret
- **Why it matters.** The only remaining route to "un-regret" is a new draft, and it silently does nothing: the line stays regretted for this vendor for the rest of the event.
- **Setup.** As 009; then the vendor opens a new draft (a new bid row — the old draft is no longer draft, and a new draft starts with empty `meta_data`).
- **Steps.** 1. Open a new draft. 2. `undo_regret` on the line. 3. Read the line's `participants` (DB) or the vendor's round view.
- **Expected (today).** Step 2 answers 200 (status null) but changes nothing: the new draft has no `regretted_eglis` entry, and only a "processed" entry on the same bid resets the line to "participated". Should either reset the line or refuse with a clear message.
- **Oracle.** `participants[<vendor id>]` is still "regretted" after a 200.
- **Trace.** P1 · manual (7 steps, over the plan limit) · `app/services/bids/line_item_regret_service.rb:73-91` · `app/helpers/api/v1/bids_controller_helper.rb:113-146`

#### API-EVDRGT-011 — One-round event: the vendor can quote again on a regretted line, but the line stays flagged
- **Why it matters.** After a submitted regret the vendor can bid on the same line again and the bid is accepted, yet the line keeps saying "regretted" for this vendor — the buyer's comparison shows a REGRET tag and disables awarding on a line that carries a live price.
- **Setup.** A live one-round RFQ; QA vendor 1 regretted, priced and submitted (bid revised, line regretted).
- **Steps.** 1–3 as 006. 4. Place a fresh bid on the line (open, price, submit). 5. As the buyer read the round.
- **Expected (today).** The new bid is accepted: in a one-round event neither the price check (736) nor the submit check (800) runs, and the new draft carries no regret. The buyer sees one live bid. The stale "regretted" flag is the defect: the line should no longer be marked regretted once the vendor quotes it.
- **Oracle.** Buyer round `bid_count` = 1; DB: `participants[<vendor id>]` still "regretted"; buyer comparison cell shows the REGRET tag (UI-EVDRGT-068).
- **Trace.** P1 · automate · `EVD2-RGT-011` · `app/helpers/api/v1/bids_controller_helper.rb:296,744-749` · `app/controllers/concerns/trade_template_helper.rb:3412-3431`

#### API-EVDRGT-012 — Two-round event: a submitted regret blocks quoting that line again
- **Why it matters.** With a technical round, the commercial regret is enforced from then on; the vendor must get the specific "you declined this line" message.
- **Setup.** A live RFP+RFQ; QA vendor 1 submitted its technical response, then in the RFQ regretted the line, priced and submitted (bid revised).
- **Steps.** 1–3 as 006 in the RFQ. 4. Place a fresh bid on the same line.
- **Expected.** The new draft opens, but pricing the line is refused. HTTP 422, code 736 'You have declined to provide this line item; therefore, you are not permitted to quote for it commercially'.
- **Oracle.** The place-bid price step answers 422 code 736; buyer `bid_count` stays 0.
- **Trace.** P1 · automate · `EVD2-RGT-012` · `app/helpers/api/v1/bids_controller_helper.rb:289-301`

#### API-EVDRGT-013 — Two-round event: a regret-only draft cannot be submitted
- **Why it matters.** The vendor declines the only line commercially and submits, and is told to "enter a bid for all lines not regretted in the technical stage" — the commercial regret does not count, so the vendor cannot decline that way.
- **Setup.** A live RFP+RFQ; QA vendor 1 submitted its technical response (no "Regret" answer), opened an RFQ draft and regretted the line, priced nothing.
- **Steps.** Submit the draft.
- **Expected (today).** Refused: the "every non-regretted line must be priced" check reads only the line's saved `participants` (still "participated" from the technical response), not the draft regret. HTTP 422, code 748 'Please enter bid for all line items that are not regretted in technical stage.'
- **Oracle.** 422 code 748. Product decision: should a commercial regret exempt the line?
- **Trace.** P2 · automate · `EVD2-RGT-013` · `app/helpers/api/v1/bids_controller_helper.rb:388-390,985-1014`

#### API-EVDRGT-014 — Saving a draft makes the regret permanent before the vendor submits
- **Why it matters.** "Save draft" is not a submission, yet it writes "regretted" onto the line for everyone to see (buyer comparison, evaluation auto-scoring, lot splitting, AI dataset) even if the vendor never submits.
- **Setup.** A live RFQ; QA vendor 1's draft with one line regretted. Needs the vendor app's draft-save body (`PATCH /v1/bids/:id` with `status: "draft"` and global data); not runnable from the op list.
- **Steps.** 1. Save the draft. 2. Read the line (DB) and the bid's `regretted_eglis`. 3. `undo_regret`.
- **Expected (today).** Step 1 runs the same "mark regretted" step as a submit (it sits after the draft branch), so the line becomes "regretted" and the entry "processed". Step 3 then resets the line to "participated" and clears `participants_data`. Should only take effect on submit.
- **Oracle.** After step 1 `participants[<vendor id>]` = "regretted" while the bid is still draft; after step 3 = "participated".
- **Trace.** P1 · manual · `app/helpers/api/v1/bids_controller_helper.rb:453-458,476-477` · `app/services/bids/line_item_regret_service.rb:76-87`

#### API-EVDRGT-015 — Saving a draft after regretting every priced line removes the draft
- **Why it matters.** The vendor's draft vanishes on "Save": the clean-up that drops regretted lines also runs for drafts and turns a draft with no remaining line into "revised".
- **Setup.** As 014, with every priced line regretted.
- **Steps.** 1. Save the draft. 2. Try any further regret or price on it.
- **Expected (today).** Step 1 answers 200 but the bid becomes "revised"; step 2 is refused with 422 code 32 'Bid not found'. Should keep the draft.
- **Oracle.** DB bid status revised after a draft save.
- **Trace.** P1 · manual · `app/helpers/api/v1/bids_controller_helper.rb:1101-1125` (`VALID_STATUSES_TO_REGRET` includes draft, app/models/bid.rb:164)

#### API-EVDRGT-016 — A teammate can regret lines on a colleague's draft
- **Why it matters.** Drafts are per user (the open call reuses only the caller's own draft), but the regret lookup is per company, so one user can change another user's unsent quote.
- **Setup.** Two users of the same vendor company; user A has a draft. Needs a second vendor user.
- **Steps.** As user B, regret a line on A's draft.
- **Expected (today).** 200 — `Bid.draft.for_company(allowed_companies)` finds A's draft. Should be limited to the draft's owner or clearly shared.
- **Oracle.** A's draft carries B's regret.
- **Trace.** P2 · manual · `app/controllers/api/v1/bids_controller.rb:146` · `app/helpers/api/v1/bids_controller_helper.rb:142-146`

#### API-EVDRGT-017 — A regret can be recorded under a different company than the bid's
- **Why it matters.** For users linked to several companies (brokers, groups) the regret stores the company named in the request, and on submit the line is marked regretted for that company — not necessarily the bidder.
- **Setup.** A user whose allowed companies include A and B; a draft bid of company B. Needs a multi-company vendor user.
- **Steps.** Regret with `company_uuid` = A on B's draft, then submit.
- **Expected (today).** 200, and the line becomes "regretted" for A. Should require the bid's own company.
- **Oracle.** `participants[A]` = "regretted" while B's bid is the one submitted.
- **Trace.** P2 · manual · `app/controllers/api/v1/bids_controller.rb:143-146` · `app/services/bids/line_item_regret_service.rb:64-69` · `app/helpers/api/v1/bids_controller_helper.rb:505-511`

## 2. Validation and the order of checks (vendor-side)

The controller checks the company (101) and then looks the bid up among the caller's DRAFT bids (32) before the service
runs; the service then checks action (805), bid (806, unreachable), bid status (807, unreachable — the lookup is already
drafts only), line (808), round (95), company (130, unreachable — 101 comes first), round = bid's round (95), lot rule
(844), anomaly (473), permission (101) and subsidiary (96).

#### API-EVDRGT-018 — An unknown action is refused
- **Why it matters.** Only "regret" and "undo_regret" are meaningful; anything else must not touch the bid. (Vendor-side twin of EDGE-BID-099.)
- **Setup.** QA vendor 1's open draft.
- **Steps.** `PATCH …/regret_status` with `"action_type": "delete"`.
- **Expected.** Refused, bid untouched. HTTP 422, code 805 'Invalid action type'.
- **Oracle.** 422 code 805.
- **Trace.** P1 · automate · `EVD2-RGT-018` · `app/services/bids/line_item_regret_service.rb:96`

#### API-EVDRGT-019 — A request without an action is refused
- **Why it matters.** A dropped field must not default to "regret".
- **Setup.** As 018.
- **Steps.** The 001 body without `action_type`.
- **Expected.** Refused (nil becomes "", which is not an allowed action). HTTP 422, code 805 'Invalid action type'.
- **Oracle.** 422 code 805.
- **Trace.** P2 · automate · `EVD2-RGT-019` · `app/services/bids/line_item_regret_service.rb:36,96`

#### API-EVDRGT-020 — The action is case-sensitive
- **Why it matters.** "REGRET" is the label the server itself returns; a client echoing it back must get a clear refusal, not a silent no-op.
- **Setup.** As 018.
- **Steps.** `"action_type": "REGRET"`.
- **Expected.** Refused. HTTP 422, code 805 'Invalid action type'.
- **Oracle.** 422 code 805.
- **Trace.** P2 · automate · `EVD2-RGT-020` · `app/services/bids/line_item_regret_service.rb:5,96`

#### API-EVDRGT-021 — The action is checked before the line
- **Why it matters.** Pins the guard order so a refactor that reorders checks shows up.
- **Setup.** As 018.
- **Steps.** `"action_type": "delete"` with the line segment `Z2dnWmdaUWtnZw==`.
- **Expected.** HTTP 422, code 805 'Invalid action type' (not 808).
- **Oracle.** 422 code 805.
- **Trace.** P2 · automate · `EVD2-RGT-021` · `app/services/bids/line_item_regret_service.rb:96-99`

#### API-EVDRGT-022 — A line that does not exist is refused
- **Why it matters.** A guessed line id must not be stored in the bid.
- **Setup.** As 018.
- **Steps.** Path `/v1/bids/{{bidUuid}}/line_items/Z2dnWmdaUWtnZw==/regret_status`, action regret.
- **Expected.** Refused. HTTP 422, code 808 'Line item not found'.
- **Oracle.** 422 code 808; `regretted_eglis` empty.
- **Trace.** P1 · automate · `EVD2-RGT-022` · `app/services/bids/line_item_regret_service.rb:35,43,99`

#### API-EVDRGT-023 — A garbled line id is refused, not crashed
- **Why it matters.** The service decodes the path itself; an undecodable value must still end in a typed refusal.
- **Setup.** As 018.
- **Steps.** Line segment `WrongUuid1=`.
- **Expected.** Refused. HTTP 422, code 808 'Line item not found'.
- **Oracle.** 422 code 808.
- **Trace.** P2 · automate · `EVD2-RGT-023` · `app/services/bids/line_item_regret_service.rb:35,43,99`

#### API-EVDRGT-024 — The line is checked before the round
- **Why it matters.** Guard-order pin.
- **Setup.** As 018.
- **Steps.** Line `Z2dnWmdaUWtnZw==` and no `trade_request_uuid`.
- **Expected.** HTTP 422, code 808 'Line item not found' (not 95).
- **Oracle.** 422 code 808.
- **Trace.** P2 · automate · `EVD2-RGT-024` · `app/services/bids/line_item_regret_service.rb:99-100`

#### API-EVDRGT-025 — The round is required
- **Why it matters.** The round ties the regret to the bid's own stage.
- **Setup.** As 018.
- **Steps.** The 001 body without `trade_request_uuid`.
- **Expected.** Refused. HTTP 422, code 95 'Trade Request not found'.
- **Oracle.** 422 code 95.
- **Trace.** P1 · automate · `EVD2-RGT-025` · `app/services/bids/line_item_regret_service.rb:44,100`

#### API-EVDRGT-026 — An unknown round is refused
- **Why it matters.** As 025, with a value that decodes to a missing row.
- **Setup.** As 018.
- **Steps.** `"trade_request_uuid": "Z2dnWmdaUWtnZw=="`.
- **Expected.** HTTP 422, code 95 'Trade Request not found'.
- **Oracle.** 422 code 95.
- **Trace.** P2 · automate · `EVD2-RGT-026` · `app/services/bids/line_item_regret_service.rb:100`

#### API-EVDRGT-027 — Another round of the same event is refused
- **Why it matters.** The regret must apply to the round the bid belongs to, not the technical round next to it.
- **Setup.** A live RFP+RFQ; QA vendor 1 submitted its technical response and opened an RFQ draft.
- **Steps.** Regret with `"trade_request_uuid": "{{rfpTradeId}}"` (the technical round).
- **Expected.** Refused: the round exists but is not the bid's. HTTP 422, code 95 'Trade Request not found'.
- **Oracle.** 422 code 95.
- **Trace.** P1 · automate · `EVD2-RGT-027` · `app/services/bids/line_item_regret_service.rb:102`

#### API-EVDRGT-028 — The vendor company is required
- **Why it matters.** The company is what gets marked regretted on the line.
- **Setup.** As 018.
- **Steps.** The 001 body without `company_uuid`.
- **Expected.** Refused by the controller's first check. HTTP 422, code 101 'You are not allowed to perform this action'.
- **Oracle.** 422 code 101.
- **Trace.** P1 · automate · `EVD2-RGT-028` · `app/controllers/api/v1/bids_controller.rb:143-145`

#### API-EVDRGT-029 — An unknown company is refused as "not allowed", not "not found"
- **Why it matters.** The service's 130 'Company not found' can never be reached; the vendor always sees 101.
- **Setup.** As 018.
- **Steps.** `"company_uuid": "Z2dnWmdaUWtnZw=="`.
- **Expected.** HTTP 422, code 101 'You are not allowed to perform this action'.
- **Oracle.** 422 code 101.
- **Trace.** P2 · automate · `EVD2-RGT-029` · `app/controllers/api/v1/bids_controller.rb:145` · `app/services/bids/line_item_regret_service.rb:101`

#### API-EVDRGT-030 — The company is checked before the bid
- **Why it matters.** Guard-order pin for the controller.
- **Setup.** A live RFQ; no bid needed.
- **Steps.** Path bid `Z2dnWmdaUWtnZw==`, body without `company_uuid`.
- **Expected.** HTTP 422, code 101 'You are not allowed to perform this action' (not 32).
- **Oracle.** 422 code 101.
- **Trace.** P2 · automate · `EVD2-RGT-030` · `app/controllers/api/v1/bids_controller.rb:145-147`

#### API-EVDRGT-031 — A bid that does not exist is "Bid not found" (code 32, not 806)
- **Why it matters.** Corrects EDGE-BID-100, which expects 806: the controller refuses first with 32, so the service's 806 is dead code.
- **Setup.** A live RFQ.
- **Steps.** Path bid `Z2dnWmdaUWtnZw==` with a valid body.
- **Expected.** HTTP 422, code 32 'Bid not found'.
- **Oracle.** 422 code 32.
- **Trace.** P1 · automate · `EVD2-RGT-031` · `app/controllers/api/v1/bids_controller.rb:146-147` · `app/services/bids/line_item_regret_service.rb:97`

#### API-EVDRGT-032 — A garbled bid id is refused
- **Why it matters.** The path id decodes to nil; the lookup must still refuse.
- **Setup.** A live RFQ.
- **Steps.** Path bid `WrongUuid1=`.
- **Expected.** HTTP 422, code 32 'Bid not found'.
- **Oracle.** 422 code 32.
- **Trace.** P2 · automate · `EVD2-RGT-032` · `app/controllers/concerns/params_auth.rb:57-66` · `app/controllers/api/v1/bids_controller.rb:146-147`

#### API-EVDRGT-033 — A submitted bid cannot be regretted directly (code 32, never 807)
- **Why it matters.** `VALID_STATUSES_TO_REGRET` lists active/selected/requested too, which suggests submitted bids were meant to be regrettable; the controller only looks at drafts, so 807 'Bid status is not valid' can never be returned.
- **Setup.** A live RFQ where QA vendor 1 has submitted a bid; no draft open.
- **Steps.** Regret on `{{bidUuid}}` (the submitted bid).
- **Expected.** HTTP 422, code 32 'Bid not found'.
- **Oracle.** 422 code 32.
- **Trace.** P1 · automate · `EVD2-RGT-033` · `app/controllers/api/v1/bids_controller.rb:146` · `app/models/bid.rb:164` · `app/services/bids/line_item_regret_service.rb:98`

#### API-EVDRGT-034 — A line of another event is accepted and, on submit, written into that event
- **Why it matters.** The service finds the line by id across the whole platform and never checks it belongs to the bid's event. A vendor can mark itself "regretted" on any event's line (even one it is not invited to); on submit the raw SQL update writes the vendor id into that line's `participants`, which shows up in the other buyer's comparison, evaluation and AI data.
- **Setup.** NOT runnable: the only foreign line id a run could use would be a real record. Use two test events of the run's own buyer, A and B, with QA vendor 1 invited to A only.
- **Steps.** 1. On A's draft, regret with B's line id in the path. 2. Price A's line and submit.
- **Expected.** Step 1 should be refused (808 or 101). Today 200; after step 2 B's line has `participants[<vendor 1>]` = "regretted".
- **Oracle.** DB read of B's line after step 2.
- **Trace.** P0 · manual · `app/services/bids/line_item_regret_service.rb:43,95-112` · `app/helpers/api/v1/bids_controller_helper.rb:499-516,1047-1099`

#### API-EVDRGT-035 — Any unexpected error inside the regret becomes an untyped 500
- **Why it matters.** The catch-all builds its failure with one argument while `failure` needs two, so instead of a readable error the rescue itself raises `ArgumentError` and the vendor gets a 500.
- **Setup.** Any path that raises inside `process_regret_action` (a failing `save!`, a nil association in `validate`, see 036).
- **Steps.** Trigger the error and send a regret.
- **Expected.** Should be a typed 422 ('An unexpected error occurred…'). Today: HTTP 500 — `ServiceResult.failure("An unexpected error occurred: …")` → wrong number of arguments (given 1, expected 2).
- **Oracle.** No 5xx.
- **Trace.** P1 · manual · `app/services/bids/line_item_regret_service.rb:21-23,53-55`

#### API-EVDRGT-036 — In a lot-split event, regretting crashes when any line has never been touched by a vendor
- **Why it matters.** The lot rule reads `egli.participants[<vendor>]` on every active line; `participants` is nil until a technical response or a regret writes it, so the first regret in such an event raises and (via 035) answers 500.
- **Setup.** A lot-split event where at least one active line has no `participants` hash (e.g. no technical round, or a line without a technical form). Needs lot split; no twin.
- **Steps.** As QA vendor 1, regret any line on a draft in a lot stage.
- **Expected.** Should be 200 (or 844 when it would regret every line). Today suspected HTTP 500: NoMethodError on nil → rescue → ArgumentError.
- **Oracle.** No 5xx.
- **Trace.** P1 · manual · `app/services/bids/line_item_regret_service.rb:117-122` · `app/models/event_group_line_item.rb:120-122`

#### API-EVDRGT-037 — In a lot-split event, even "undo" is refused once every line is regretted
- **Why it matters.** The lot rule runs for both actions and counts the current line as "to be regretted" even when undoing, so a vendor that reached "all regretted" (e.g. through the technical round) cannot undo anything.
- **Setup.** A lot-split event; every active line already "regretted" for QA vendor 1, or listed in the draft's `regretted_eglis` (processed entries count too). Needs lot split.
- **Steps.** `undo_regret` on one of the lines.
- **Expected (today).** HTTP 422, code 844 'You cannot regret all line items in a lot split event'. Undo should be allowed.
- **Oracle.** 422 code 844 for an undo.
- **Trace.** P2 · manual · `app/services/bids/line_item_regret_service.rb:103,115-127`

#### API-EVDRGT-038 — The lot rule counts the whole event, not the lot
- **Why it matters.** The check compares against every active line of the event, so a vendor may regret every line of one lot (its stage ends with nothing quoted) as long as another lot still has a line. Deeper than EDGE-BID-102.
- **Setup.** A lot-split event with lots L1 (lines 1–2) and L2 (line 3). Needs lot split.
- **Steps.** On the L1 stage draft regret line 1, then line 2.
- **Expected (today).** Both 200 (line 3 keeps the event "not all regretted"). Regretting line 3 on the L2 draft afterwards answers 422 code 844 'You cannot regret all line items in a lot split event'.
- **Oracle.** The status sequence 200, 200, 844.
- **Trace.** P2 · manual · `app/services/bids/line_item_regret_service.rb:119-126`

#### API-EVDRGT-039 — A bid flagged with price anomalies cannot be regretted
- **Why it matters.** Anomaly bids must be fixed before any change.
- **Setup.** A draft of QA vendor 1 whose status is anomaly_detected — unreachable through the draft-only lookup today (the controller looks up drafts only), so record whether 473 is ever returned.
- **Steps.** Regret a line on that bid.
- **Expected.** HTTP 422, code 32 'Bid not found' (the controller's draft lookup) — 473 'You cannot revise the bid, Please resolve the error prices first' is unreachable from this route.
- **Oracle.** 422 code 32.
- **Trace.** P2 · manual · `app/controllers/api/v1/bids_controller.rb:146` · `app/services/bids/line_item_regret_service.rb:108` · `app/models/bid.rb:104` (`anomaly_detected?` is the status predicate)

#### API-EVDRGT-040 — A subsidiary of a company that already bid cannot regret
- **Why it matters.** Group companies must not split one participation across two bids.
- **Setup.** QA vendor 1 is a subsidiary of (or parent to) a company that already bid on the round. Needs a company hierarchy.
- **Steps.** Regret a line on vendor 1's draft.
- **Expected.** HTTP 422, code 96 'A bid has already been placed by your team'.
- **Oracle.** 422 code 96.
- **Trace.** P2 · manual · `app/services/bids/line_item_regret_service.rb:111-112` · `app/models/company.rb:620-625`

## 3. Who may regret

#### API-EVDRGT-041 — A buyer calling the regret route is refused and signed out
- **Why it matters.** Regret is a vendor-app action; a buyer token gets 401 and the backend deactivates the buyer's console session. EDGE-BID-099..102 were written to run as the buyer, so they only ever exercise this refusal.
- **Setup.** Manual only (a runnable twin would sign the QA buyer out).
- **Steps.** As the buyer (console app), send the 001 request.
- **Expected.** HTTP 401 'This app is not authorized to use this API' and the buyer's session becomes inactive.
- **Oracle.** 401; the next console call is unauthenticated.
- **Trace.** P1 · manual · `config/app_auth_config.yml:1977` · `app/controllers/concerns/json_helpers.rb:31-35`

#### API-EVDRGT-042 — A vendor cannot regret a line on another vendor's draft
- **Why it matters.** Cross-company tampering with an unsent quote.
- **Setup.** A live RFQ with QA vendors 1 and 2 both bidding; QA vendor 2 opens a new draft (round setting `lock_quote_after_submission` off).
- **Steps.** As QA vendor 1, regret on vendor 2's draft id with `company_uuid` = vendor 1.
- **Expected.** Refused: vendor 2's draft is outside vendor 1's companies. HTTP 422, code 32 'Bid not found'.
- **Oracle.** 422 code 32; vendor 2's draft unchanged.
- **Trace.** P0 · automate · `EVD2-RGT-042` · `app/controllers/api/v1/bids_controller.rb:146-147` · `app/models/bid.rb:113`

#### API-EVDRGT-043 — An uninvited vendor cannot regret in another vendor's name
- **Why it matters.** Naming someone else's company must be refused before any lookup.
- **Setup.** A live RFQ, QA vendor 1 invited with an open draft; QA vendor 2 not invited.
- **Steps.** As QA vendor 2, regret on vendor 1's draft with `company_uuid` = vendor 1.
- **Expected.** HTTP 422, code 101 'You are not allowed to perform this action'.
- **Oracle.** 422 code 101.
- **Trace.** P0 · automate · `EVD2-RGT-043` · `app/controllers/api/v1/bids_controller.rb:144-145`

#### API-EVDRGT-044 — A vendor cannot name another company on its own draft
- **Why it matters.** Prevents marking a competitor as "regretted" on a line (the company in the body is what gets written onto the line).
- **Setup.** A live RFQ; QA vendor 1's open draft.
- **Steps.** As QA vendor 1, regret with `company_uuid` = QA vendor 2.
- **Expected.** HTTP 422, code 101 'You are not allowed to perform this action'.
- **Oracle.** 422 code 101.
- **Trace.** P1 · automate · `EVD2-RGT-044` · `app/controllers/api/v1/bids_controller.rb:145`

#### API-EVDRGT-045 — A regret racing a submit is not locked
- **Why it matters.** Submit and create take a 3-second lock per round and company; regret does not, so a regret that lands after the submit read the bid is lost or applied half-way.
- **Setup.** Two parallel requests (the runner sends one at a time).
- **Steps.** Fire the submit and a regret on the same draft within a few milliseconds.
- **Expected.** One consistent outcome: either the regret is applied before activation, or it is refused (32) because the bid is no longer a draft. Never a submitted bid whose `regretted_eglis` still says "draft".
- **Oracle.** DB: no active bid with a "draft" regret entry.
- **Trace.** P2 · manual · `app/controllers/api/v1/bids_controller.rb:8-9,141-157`

## 4. State of the event and the round

#### API-EVDRGT-046 — No regret on a withdrawn event
- **Why it matters.** After withdrawal every round is inactive; a late regret must not be stored.
- **Setup.** A live RFQ; QA vendor 1 opens a draft; the buyer withdraws the event.
- **Steps.** As QA vendor 1, regret on the draft.
- **Expected.** Refused: the round is no longer active. HTTP 422, code 95 'Trade Request not found'.
- **Oracle.** 422 code 95.
- **Trace.** P1 · automate · `EVD2-RGT-046` · `app/services/event_groups/update_service.rb:315-330` · `app/controllers/concerns/trade_controller_helper.rb:201` · `app/services/bids/line_item_regret_service.rb:44,100`

#### API-EVDRGT-047 — Regret after the bidding window has closed
- **Why it matters.** Nothing in the regret path checks the window; a regret after close still changes the draft.
- **Setup.** A short live RFQ; QA vendor 1 opens a draft; the window and extra closing time pass (the round's status stays "active" until award).
- **Steps.** Regret on the draft.
- **Expected.** A clean answer. Today 200 — no window check exists; product to decide whether it should be 33 'Order not active'. Never a 5xx.
- **Oracle.** Status below 500.
- **Trace.** P2 · automate · `EVD2-RGT-047` · `app/services/bids/line_item_regret_service.rb:40-52,95-113` · `app/workers/mark_event_closed_worker.rb:6-16`

#### API-EVDRGT-048 — Regret on an event that has been superseded by a new version
- **Why it matters.** Open, price and submit all refuse non-latest events (101); regret does not, so a vendor keeps editing a dead draft.
- **Setup.** A live RFQ; QA vendor 1 opens a draft; the buyer issues a new version (not published).
- **Steps.** Regret on the draft of the old version.
- **Expected.** Should match the bid routes (422 code 101). Today 200 (no `latest?` check); never a 5xx.
- **Oracle.** Status below 500.
- **Trace.** P2 · automate · `EVD2-RGT-048` · `app/controllers/api/v1/bids_controller.rb:18,50,124,141-157`

#### API-EVDRGT-049 — Regret on an auction round is stored as "commercial"
- **Why it matters.** `VALID_STAGES = %w(commercial)` is declared but never used; every regret is tagged `stage_type: commercial` and applied the same way on auctions (including knockout/dutch rounds whose acceptance logic runs right after).
- **Setup.** A live auction (or RFQ converted to auction) with a draft bid of QA vendor 1. Needs an auction.
- **Steps.** Regret a line, then place the auction bid.
- **Expected.** Product decision; record the outcome. Today 200 and the line is dropped on submit exactly as in an RFQ.
- **Oracle.** `regretted_eglis[<line>].stage_type` = "commercial".
- **Trace.** P2 · manual · `app/services/bids/line_item_regret_service.rb:6,64-69` · `app/helpers/api/v1/bids_controller_helper.rb:476-484`

## 5. How the buyer, evaluation and award see a regret

#### API-EVDRGT-050 — The buyer's comparison labels a regretted line "REGRET" for that vendor only
- **Why it matters.** Per-vendor labelling: one vendor's regret must not grey the line for others.
- **Setup.** Two lines, two QA vendors; vendor 1 regrets line 2 and submits a price for line 1; vendor 2 quotes both. Needs a two-line event.
- **Steps.** As the buyer, `GET /trade/{{tradeId}}?response_type=template` and read each vendor's line status.
- **Expected.** Vendor 1 line 2: status `{"value": "regretted", "label": "REGRET"}`; vendor 2 line 2: its normal status. Vendor 1 keeps a live bid on line 1.
- **Oracle.** The two statuses differ only for vendor 1.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_template_helper.rb:3412-3431` · `app/models/event_group_line_item.rb:124-127`

#### API-EVDRGT-051 — A vendor that regretted every line drops out of the comparison data
- **Why it matters.** The background recompute removes a fully regretted vendor from the event's participant list (non-lot events), which should match what the round and participants screens show (see 006, UI-EVDRGT-074).
- **Setup.** As 006 (one line, fully regretted, submitted).
- **Steps.** Wait for recompute; read `event_groups.precomputed_data_v1.participant_vendor_company_ids` (DB) and the buyer's participants list.
- **Expected (today).** The vendor is removed from the precomputed participant list but still listed as "bid placed" in the participants list.
- **Oracle.** DB list lacks vendor 1; `get_audience` still has it under bid placed.
- **Trace.** P2 · manual · `app/services/precomputation_engine/bid_service_v1.rb:31,47-75`

#### API-EVDRGT-052 — A commercial regret becomes an automatic "Regret" technical score
- **Why it matters.** When an evaluator submits the technical evaluation, every vendor listed as "regretted" on a line gets an automatic Regret score — including vendors who regretted only in the RFQ and answered the technical form fully. This can disqualify them from award (EVAL-TNA-004).
- **Setup.** RFP+RFQ; QA vendor 1 answers the technical form (no "Regret"), then regrets the line in the RFQ and submits; the event has a "Regret" score label. Needs an evaluator flow.
- **Steps.** Submit the technical evaluation without scoring vendor 1 on that line.
- **Expected (today).** An evaluation with the Regret score is created for vendor 1. If the event has no "Regret" label the auto score is nil — record what the evaluation submit then answers.
- **Oracle.** `evaluation_scores` row for vendor 1 with the regret score.
- **Trace.** P1 · manual · `app/helpers/api/evaluations_helper.rb:229-231,692-720` · `app/models/event_group.rb:737-741`

#### API-EVDRGT-053 — Awarding a commercially regretted line is blocked only on screen
- **Why it matters.** The server's award check (EDGE-AWD-114) blocks lines by their evaluation SCORE only; a line that is "regretted" in `participants` but never scored passes the API, while the screen greys it out.
- **Setup.** Two lines; QA vendor 1 regrets line 2 and later quotes it again (011), so a live price exists; `restrict_awarding_for_tna_vendors` on; no evaluation score. Needs two lines and a proposal.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` awarding line 2 to vendor 1.
- **Expected.** Should be 422 code 1136 'One or more selected line items cannot be awarded as they have been marked as Regret'. Today 200 — `validate_tna_for_awarding` reads `evaluation_score_for`, never `participants`.
- **Oracle.** Proposal response for line 2 exists after a 200.
- **Trace.** P1 · manual · `app/helpers/api/proposal_helper.rb:1244-1269` · `procol-client-dashboard/src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx:111-129`

#### API-EVDRGT-054 — A technical "Regret" answer splits the vendor's commercial bid — unless it covers every line
- **Why it matters.** The two regret paths behave differently: a commercial regret of every line kills the bid (006), a technical regret of every line leaves the full commercial bid active.
- **Setup.** RFP+RFQ; QA vendor 1 has an active RFQ bid on two lines. Needs two lines.
- **Steps.** 1. Submit the technical response with "Regret" on line 2. 2. Read vendor 1's bids. 3. Repeat on a fresh event with "Regret" on both lines.
- **Expected (today).** Case 1: the old bid becomes revised and a copy with only line 1 becomes active. Case 2: nothing is dropped — only a recompute runs, the bid stays active on both lines. Should drop (or revise) the bid in case 2 as well.
- **Oracle.** Case 2: an active bid still prices both regretted lines.
- **Trace.** P1 · manual · `app/helpers/api/forms_helper.rb:700-727,748-778` · `app/services/template_responses/update_service.rb:50`

#### API-EVDRGT-055 — Updating the technical response silently cancels a commercial regret
- **Why it matters.** Re-submitting the technical response rewrites `participants` for every answered line ("participated" unless "Regret"), wiping a regret the vendor made in the RFQ; the line becomes quotable again without the vendor undoing anything.
- **Setup.** RFP and RFQ both open; QA vendor 1 regrets the line in the RFQ and submits (line "regretted"); then edits and re-submits its technical response. Needs a technical response update op.
- **Steps.** Read the line's `participants` after the technical re-submit; try to price the line in the RFQ.
- **Expected (today).** `participants[<vendor 1>]` = "participated" and pricing is accepted (no 736).
- **Oracle.** DB value flips from "regretted" to "participated".
- **Trace.** P2 · manual · `app/helpers/api/forms_helper.rb:707-716`

#### API-EVDRGT-056 — Lot splitting treats commercially regretted vendors as not participating on that line
- **Why it matters.** Lot creation summarises "technically accepted and not regretted" items; a commercial regret made before the split changes which vendors and lines go into each lot.
- **Setup.** RFP+RFQ before lot split; QA vendor 1 commercially regretted one line. Needs lot split.
- **Steps.** Run lot splitting; read each lot's `tna_regretted_vendors`.
- **Expected.** Vendor 1 is listed under the regretted line's `tna_regretted_vendors`.
- **Oracle.** Lot summary text "includes a mix of … regretted".
- **Trace.** P2 · manual · `app/services/lots/lot_splitting_service.rb:70-74,94-101,125-130`

## 6. Declining participation (user intents) and self-participation

#### API-EVDRGT-057 — A vendor's event-level decline reaches the buyer's participants list
- **Why it matters.** "Reason for not participating" is the buyer's only view of why a vendor said no.
- **Setup.** A live RFQ, QA vendor 1 invited.
- **Steps.** 1. As QA vendor 1, `POST /user_intents` with `{"item_uuid": "{{eventGroupUuid}}", "item_type": "EventGroup", "intent_type": "trade_reject", "reason": ["QA_Platform_reason_{{stamp}}"], "remarks": "QA_Platform_decline_{{stamp}}"}`. 2. As the buyer, `GET /event_groups/{{eventGroupUuid}}/get_audience`.
- **Expected.** The decline is saved and the vendor's row shows the reason and remark. HTTP 200 `{"success": true}`.
- **Oracle.** `vendors[*].user_intent` contains "QA_Platform_decline_{{stamp}}".
- **Trace.** P1 · automate · `EVD2-RGT-057` · `app/controllers/api/user_intents_controller.rb:4-24` · `app/controllers/api/event_groups_controller.rb:1662-1672` · `app/models/user_intent.rb:35-43`

#### API-EVDRGT-058 — A round-level decline never reaches that list
- **Why it matters.** The same button can be recorded against the round (`TradeRequest`) — that is what the round page's "answered" flag reads — but the buyer's participants list reads only event-level answers, so the buyer never sees the reason.
- **Setup.** A live RFQ, QA vendor 1 invited.
- **Steps.** 1. As QA vendor 1, `POST /user_intents` with `item_type: "TradeRequest"`, `item_uuid: "{{tradeId}}"`, `intent_type: "trade_reject"` and a reason. 2. As the buyer read `get_audience`.
- **Expected (today).** 200, and the vendor's "reason" column stays empty. The two places should read the same answer.
- **Oracle.** `vendors[*].user_intent` is null for every row.
- **Trace.** P2 · automate · `EVD2-RGT-058` · `app/controllers/api/event_groups_controller.rb:1662` · `app/controllers/api/trade_controller.rb:1095`

#### API-EVDRGT-059 — Declining counts as having answered the participation question
- **Why it matters.** The vendor must not be asked again on every visit after saying no.
- **Setup.** A live RFQ, QA vendor 1 invited.
- **Steps.** 1. Round-level decline as in 058. 2. As QA vendor 1, `GET /trade/{{tradeId}}?response_type=template`.
- **Expected.** The round says the vendor has answered. HTTP 200 and `user_intent_answered: true` (the field is left out when false).
- **Oracle.** `user_intent_answered` = true.
- **Trace.** P2 · automate · `EVD2-RGT-059` · `app/controllers/api/trade_controller.rb:1095,1267` · `app/serializers/trade_template_serializer.rb:734-738`

#### API-EVDRGT-060 — A decline on the technical round does not answer the pricing round
- **Why it matters.** Answers are per round (and per company on `/trade`, per user on `/v1/trade/:id/schema`), so a vendor who declined the RFP is asked again on the RFQ of the same event.
- **Setup.** A live RFP+RFQ, QA vendor 1 invited to both. Manual: the vendor's read of the RFQ before technical participation may be gated.
- **Steps.** 1. Decline `{{rfpTradeId}}`. 2. Read `{{tradeId}}` as the vendor.
- **Expected (today).** `user_intent_answered` is absent on the RFQ. Product to decide whether one decline should cover the event.
- **Oracle.** Field absent on the RFQ read.
- **Trace.** P2 · manual · `app/controllers/api/trade_controller.rb:1095` · `app/controllers/api/v1/trade_controller.rb:287`

#### API-EVDRGT-061 — A declined vendor can still bid, and the buyer sees both answers at once
- **Why it matters.** Goes deeper than XMAT-051 / EDGE-BID-016-017: none of the bid routes read the decline, so the buyer's list shows a "reason for not participating" next to a vendor marked "bid placed".
- **Setup.** A live RFQ, QA vendor 1 invited.
- **Steps.** 1. Event-level decline as in 057. 2. Vendor places a full bid. 3. As the buyer read `get_audience`.
- **Expected (today).** Both accepted; the vendor row keeps the decline text and the stage lists the vendor as bid placed. Either the bid should be refused or the decline cleared when the vendor bids.
- **Oracle.** `vendors[*].user_intent` contains the decline remark AND `stages[*].bid_placed_company_uuids` contains `{{vendorUuid}}`.
- **Trace.** P1 · automate · `EVD2-RGT-061` · `app/controllers/api/v1/bids_controller.rb:11-35` · `app/controllers/concerns/event_group_controller_helper.rb:393-408`

#### API-EVDRGT-062 — Declining and then accepting: the latest answer wins in the vendor's event view
- **Why it matters.** Answers are never superseded (both rows stay active, EDGE-BID-012); the event view must at least show the newest one.
- **Setup.** A live RFQ; QA vendor 1 already declined at event level (helper H02).
- **Steps.** 1. `POST /user_intents` with `{"item_uuid": "{{eventGroupUuid}}", "item_type": "EventGroup", "intent_type": "trade_accept"}`. 2. As the vendor, `GET /event_groups/{{eventGroupUuid}}`.
- **Expected.** Accept saved (no reason needed); the event view shows the acceptance. HTTP 200.
- **Oracle.** `user_intent.intent_type` = "trade_accept".
- **Trace.** P2 · automate · `EVD2-RGT-062` · `app/controllers/api/event_groups_controller.rb:166` · `app/serializers/event_group/show_serializer.rb:246-249`

#### API-EVDRGT-063 — The vendor's own event view shows its decline and remark
- **Why it matters.** The vendor app decides from this whether to show the participate prompt or "you declined".
- **Setup.** A live RFQ, QA vendor 1 invited.
- **Steps.** 1. Event-level decline as in 057. 2. As the vendor, `GET /event_groups/{{eventGroupUuid}}`.
- **Expected.** HTTP 200; `user_intent` carries the decline and the remark.
- **Oracle.** `user_intent.intent_type` = "trade_reject"; `user_intent.remarks` contains "QA_Platform_decline_{{stamp}}".
- **Trace.** P2 · automate · `EVD2-RGT-063` · `app/serializers/user_intent_serializer.rb:1-3` · `app/controllers/api/event_groups_controller.rb:166`

#### API-EVDRGT-064 — Joining through "participate" after declining records an acceptance the buyer never sees
- **Why it matters.** Self-participation writes a `trade_accept` on the event without a company, while the buyer's list filters answers by company — so the buyer keeps seeing the old decline reason for a vendor who joined.
- **Setup.** Buyer company setting `enable_open_tender_events` ON; a live event; QA vendor 1 mapped to the buyer and has declined at event level (H02).
- **Steps.** 1. As QA vendor 1, `POST /event_groups/{{eventGroupUuid}}/participants`. 2. Vendor reads the event. 3. Buyer reads `get_audience`.
- **Expected (today).** Step 1 HTTP 200 `{"success": true}`; step 2 shows `user_intent.intent_type` = "trade_accept"; step 3 still shows the decline text (the new row has no `company_id`). Should store the vendor's company.
- **Oracle.** Steps 2 and 3 disagree.
- **Trace.** P2 · automate · `EVD2-RGT-064` · `app/services/event_groups/participate_service.rb:26-45` · `app/policies/event_group_policy.rb:25-27` · `app/models/company.rb:215-220`

#### API-EVDRGT-065 — Placing a bid never turns the vendor's decline into "converted"
- **Why it matters.** The "converted" status exists for this, but it is only set by the old surrogate path, and there it converts the BUYER's own intent (Current.user), never the vendor's. So declines stay active forever.
- **Setup.** QA vendor 1 declined the round, then bids (vendor app), or the buyer enters a surrogate bid for it.
- **Steps.** Read the vendor's `user_intents` rows (DB) after each.
- **Expected (today).** Still `status: active, intent_type: trade_reject` in both cases.
- **Oracle.** No row with status converted.
- **Trace.** P2 · manual · `app/controllers/api/bids_controller.rb:521-528,664` · `app/models/user_intent.rb:32`

#### API-EVDRGT-066 — The event view and the event list pick the answer differently
- **Why it matters.** The event view takes the newest intent of any status; the event list takes an arbitrary one (indexed by event, last row wins) and also ignores status, so the two can show different answers.
- **Setup.** A vendor user with a decline then an accept on the same event.
- **Steps.** Compare `GET /event_groups/:id` (`user_intent`) with the vendor's event list card.
- **Expected.** Both should show the newest active answer.
- **Oracle.** Same intent type in both.
- **Trace.** P2 · manual · `app/controllers/api/event_groups_controller.rb:166` · `app/controllers/concerns/event_group_controller_helper.rb:2883-2886`

#### API-EVDRGT-067 — A decline unlocks the vendor's stage card exactly like an acceptance
- **Why it matters.** The card locks a stage until the vendor answers; "No, I won't participate" opens it just the same, inviting the vendor into a round it declined.
- **Setup.** A live one-round event; QA vendor 1 declines at event level.
- **Steps.** Read the vendor's event cards.
- **Expected (today).** `is_stage_locked` false after a decline. Product decision whether a decline should keep it locked.
- **Oracle.** `is_stage_locked` before (true) and after the decline (false).
- **Trace.** P2 · manual · `app/serializers/trade_request/vendor_card_serializer.rb:192-203` · `app/serializers/event_group/card_serializer.rb:108-130`

## 7. Screens (buyer console)

#### UI-EVDRGT-068 — The comparison cell shows a "Regretted" tag for a regretted line
- **Why it matters.** The buyer must see at a glance which vendor declined which line.
- **Setup.** As API-EVDRGT-050 (vendor 1 regretted line 2), or 011 (regretted then re-quoted).
- **Steps.** Open the event's quote comparison.
- **Expected.** Vendor 1's line-2 cell shows the REGRET tag and no "0" quantity filler. In the 011 situation the tag sits next to a live price — the stale-flag defect made visible.
- **Oracle.** Tag text equals the server's `status.label`.
- **Trace.** P2 · manual · `procol-client-dashboard/src/components/dataGrid/formatters/cellValueFormatter.jsx:477,543-545`

#### UI-EVDRGT-069 — The award cell is disabled and reads "Regretted"
- **Why it matters.** This screen guard is the only thing stopping an award of a regretted line (API-EVDRGT-053).
- **Setup.** As 050, with an award proposal open.
- **Steps.** Try to award vendor 1 on line 2.
- **Expected.** The cell is disabled with the text "Regretted".
- **Oracle.** No add_response request is sent.
- **Trace.** P1 · manual · `procol-client-dashboard/src/components/dataGrid/formatters/comparisonSelectionFormatter.jsx:111-129,178-179`

#### UI-EVDRGT-070 — "Select all items" for awarding skips regretted lines
- **Why it matters.** Bulk awarding must not sneak a regretted line in.
- **Setup.** As 069, select-all enabled.
- **Steps.** Click select-all for vendor 1.
- **Expected.** Only line 1 is selected; the master checkbox shows checked once line 1 is awarded.
- **Oracle.** Requests sent contain line 1 only.
- **Trace.** P2 · manual · `procol-client-dashboard/src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:962-977,1032-1043`

#### UI-EVDRGT-071 — The line-status checkbox is unchecked and inactive for regretted lines
- **Why it matters.** Status toggles on a regretted line must not be editable.
- **Setup.** As 050.
- **Steps.** Open the comparison sheet; inspect vendor 1's line-2 status cell.
- **Expected.** Checkbox unchecked and inactive.
- **Oracle.** No toggle request on click.
- **Trace.** P2 · manual · `procol-client-dashboard/src/redux/orders/selectors.js:2490-2494,2805-2830`

#### UI-EVDRGT-072 — A regretted line shows the event's "Regret" score in the evaluation cell
- **Why it matters.** The score shown must match the one the server auto-creates (API-EVDRGT-052).
- **Setup.** RFP with evaluation; vendor 1 regretted a line technically; event score mapping with and without a "Regret" entry.
- **Steps.** Open the technical evaluation grid.
- **Expected.** The cell shows the Regret score; if the mapping has no "Regret" value the score is blank — record it.
- **Oracle.** Cell score equals mapping score for "Regret".
- **Trace.** P2 · manual · `procol-client-dashboard/src/components/dataGrid/formatters/cellEvaluationFormatter.jsx:39-65,227`

#### UI-EVDRGT-073 — "Reason for not participating" shows raw list brackets and also acceptance remarks
- **Why it matters.** The column prints `reason.to_s + ", " + remarks`; a list of reasons appears as `["Price not feasible"]`, an acceptance with a remark appears as a "reason for not participating", and round-level declines (058) never appear.
- **Setup.** A live event; QA vendor 1 declines with `reason: ["A", "B"]` and a remark; another run accepts with a remark.
- **Steps.** Open Participants on the event.
- **Expected.** Readable reasons ("A, B — remark"); acceptances not shown in this column. Today: brackets and quotes, and accept remarks shown.
- **Oracle.** Column text.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/projectDetails/components/participantsTable.jsx:128,223-227` · `app/models/user_intent.rb:35-43`

#### UI-EVDRGT-074 — The participants stage column says "bid placed" for a vendor whose bid vanished through regret
- **Why it matters.** After 006 the round shows no bid, but Participants still says the vendor bid.
- **Setup.** As API-EVDRGT-006.
- **Steps.** Open Participants; read the RFQ stage column for vendor 1; compare with the round's bid count.
- **Expected.** Should read "regretted"/"no bid". Today "bid placed" (revised bids count).
- **Oracle.** Column value vs `bid_count` 0.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/projectDetails/components/participantsTable.jsx:135-138` · `app/controllers/api/event_groups_controller.rb:1680-1692`

#### UI-EVDRGT-075 — The invitation delivery list and the participants table disagree about a decline
- **Why it matters.** Delivery stats read round-level and event-level answers; Participants reads event-level only — the same vendor looks declined in one place and silent in the other.
- **Setup.** QA vendor 1 declines at round level (058).
- **Steps.** Open the round's sellers/delivery list (`GET /trade/:id/bidders_delivery_stats`) and the event's Participants.
- **Expected.** Both show the decline. Today only the delivery list carries it.
- **Oracle.** `user.user_intents[0].intent_type` = "trade_reject" vs empty Participants column.
- **Trace.** P2 · manual · `procol-client-dashboard/src/redux/vendorsDeliveryStats/index.js:33-37` · `app/controllers/concerns/trade_controller_helper.rb:4342-4343`

#### UI-EVDRGT-076 — The RFI builder's "Regret Item" column action fills every row with "Regret"
- **Why it matters.** This is how a technical-round regret is entered; it feeds API-EVDRGT-054/055 and evaluation auto-scoring.
- **Setup.** An RFI/RFP template open in the builder with the default action column.
- **Steps.** Use the column header action "Regret Item".
- **Expected.** Each row's `rfi_response` becomes "Regret"; on submit the server marks those lines regretted for the vendor.
- **Oracle.** Saved form response values "Regret".
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/rfiBuilder/rfiTableSection.jsx:210-219` · `procol-client-dashboard/src/views/rfiBuilder/defaultRfiTemplate.js:218` · `app/helpers/api/forms_helper.rb:707-713`
