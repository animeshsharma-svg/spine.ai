# Evaluation, negotiation and awarding — API edge cases

Negative and edge cases for technical evaluation, re-evaluation, QCS, counter offers,
RFQ → auction conversion and awarding, each grounded in the backend guard it exercises
(`procol-backend` at `origin/main`). Every case mirrors a runnable library case in
`prototype/data/api-cases-extra/awd.json` (`EDGE-AWD-NNN`).

**Read before running.** Uuids are decoded by `ParamsAuth#check_for_uuid`: any key containing
`uuid` becomes the matching `_id` and a string that does not decode becomes `nil`.
`Z2dnWmdaUWtnZw==` is a well-formed uuid for id 999999999 (no such row); `WrongUuid1=` decodes to nil.
Evaluation scores are **label keys** (default 0–5), not marks out of 10.

## 1. Scoring — every way POST /evaluations answers 'Insufficient parameters'

#### API-XAWD-001 — Scoring without naming the vendor is refused
- **Why it matters.** company_id is the first of the three ANDed conditions in valid_params?; without it the score has no vendor to attach to.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time has passed; caller is an assigned evaluator.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "form": {"uuid": "{{evalFormUuid}}", "score": 3, "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. Log in as the evaluator. 2. POST /evaluations with the journey body minus company_uuid. 3. Assert 422 code 2 and no row.
- **Expected.** HTTP 422, error.code 2 'Insufficient parameters' — Evaluations::ValidateService#valid_params? requires @options[:company_id].present? (app/services/evaluations/validate_service.rb:44). No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 2; GET schema afterwards shows no score for the vendor.
- **Trace.** P1 · automate · `EDGE-AWD-001` · `app/services/evaluations/validate_service.rb:43-47`

#### API-XAWD-002 — Scoring with no form object is refused
- **Why it matters.** Second ANDed condition of valid_params?; the lock identifier also reads params.dig(:form, :id), so a missing form must not break the before_action either.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time has passed.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}"}`. 1. POST /evaluations with trade_request_uuid and company_uuid only.
- **Expected.** HTTP 422 code 2 — @options[:form].present? is false (app/services/evaluations/validate_service.rb:45). No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 2.
- **Trace.** P0 · automate · `EDGE-AWD-002` · `app/services/evaluations/validate_service.rb:45`

#### API-XAWD-003 — A score with no form identifier is refused
- **Why it matters.** The journey sends form.uuid, which ParamsAuth rewrites to form.id; a client that forgets it must get code 2, not a score on 'no form'.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time has passed.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"score": 3, "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. POST /evaluations with form {score: 3, remark} and no uuid/id.
- **Expected.** HTTP 422 code 2 — valid_form? needs form[:id].present? (app/services/evaluations/validate_service.rb:61). No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 2.
- **Trace.** P0 · automate · `EDGE-AWD-003` · `app/services/evaluations/validate_service.rb:61`

#### API-XAWD-004 — A form id sent as text is refused
- **Why it matters.** Only form.uuid is decoded to an Integer; a raw form.id must be a JSON integer. The Integer check is what stops '10abc'-style coercion matching an allowed id.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time has passed; form.uuid is {{evalFormUuid}}, the form assigned to the evaluator.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"id": "10", "score": 3, "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. POST /evaluations with form.id sent as the string "10" (no uuid).
- **Expected.** HTTP 422 code 2 — form[:id].instance_of?(Integer) is false for a string (app/services/evaluations/validate_service.rb:62); ParamsAuth only decodes keys containing 'uuid', so 'id' is passed through untouched. No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 2.
- **Trace.** P1 · automate · `EDGE-AWD-004` · `app/services/evaluations/validate_service.rb:62`

#### API-XAWD-005 — Scoring a form assigned to another evaluator is refused as bad parameters
- **Why it matters.** Scoring someone else's form surfaces as a PARAMS error, which is why the journey sees 'Insufficient parameters' when it picks the wrong form. A regression that moves the form check into validate_evaluator would change the code the UI keys on.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time has passed; the caller evaluates a DIFFERENT line item's form; the body deliberately keeps the non-existent form Z2dnWmdaUWtnZw== instead of {{evalFormUuid}}.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "Z2dnWmdaUWtnZw==", "score": 3, "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. As evaluator A, POST /evaluations with the form uuid assigned to evaluator B (here the non-existent Z2dnWmdaUWtnZw==).
- **Expected.** HTTP 422 code 2 'Insufficient parameters' (not 101) — form[:id].in?(get_allowed_forms_for_user(...).pluck(:id)) is part of valid_form? (app/services/evaluations/validate_service.rb:63), which runs before validate_evaluator. No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 2 and the other evaluator's form still shows no score from A.
- **Trace.** P0 · automate · `EDGE-AWD-005` · `app/services/evaluations/validate_service.rb:63`

#### API-XAWD-006 — A form with no score is refused
- **Why it matters.** A missing score must not be stored as nil: nil scores drop out of QCS averages and silently raise a vendor's mean.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time has passed; form.uuid is {{evalFormUuid}}, the form assigned to the evaluator.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. POST /evaluations with form {uuid, remark} and no score.
- **Expected.** HTTP 422 code 2 — form[:score].present? is false (app/services/evaluations/validate_service.rb:64). No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 2.
- **Trace.** P0 · automate · `EDGE-AWD-006` · `app/services/evaluations/validate_service.rb:64`

#### API-XAWD-007 — A score sent as text is refused
- **Why it matters.** Form inputs are strings by default; a client that forgets to parseInt gets 'Insufficient parameters' with no hint the TYPE is the problem.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time has passed; form.uuid is {{evalFormUuid}}, the form assigned to the evaluator.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "score": "3", "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. POST /evaluations with form.score = "3" (string).
- **Expected.** HTTP 422 code 2 — form[:score].instance_of?(Integer) is required unless the event is vendor-onboarding v2 (app/services/evaluations/validate_service.rb:65). No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 2.
- **Trace.** P0 · automate · `EDGE-AWD-007` · `app/services/evaluations/validate_service.rb:65`

#### API-XAWD-008 — A fractional score is refused
- **Why it matters.** Scores are discrete label keys; a half-score would not map to any label (TNA/T1/T2…) and would break display_value_for_evaluation_score.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time has passed; form.uuid is {{evalFormUuid}}, the form assigned to the evaluator.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "score": 3.5, "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. POST /evaluations with form.score = 3.5.
- **Expected.** HTTP 422 code 2 — 3.5 is a Float, not Integer (app/services/evaluations/validate_service.rb:65), and not a label key (app/services/evaluations/validate_service.rb:66). No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 2.
- **Trace.** P1 · automate · `EDGE-AWD-008` · `app/services/evaluations/validate_service.rb:65-66`

#### API-XAWD-009 — A score one above the highest label is refused (journey root cause)
- **Why it matters.** ROOT CAUSE of the journey's intermittent 'Insufficient parameters': eventJourney.ts scores randInt(1,10), so every draw of 6-10 is refused. The score is NOT 'out of 10' — it is a label key.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time has passed; the RFP uses the default evaluation_score_label_mapping (scores 0-5); form.uuid is {{evalFormUuid}}, the form assigned to the evaluator.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "score": 6, "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. POST /evaluations with form.score = 6 (one above the highest default label).
- **Expected.** HTTP 422 code 2 — form[:score].in?(event_group.get_evaluation_score_vs_label.keys) is false; the default mapping has keys 0..5 (db/migrate/20250209130259_set_evaluation_score_label_mapping.rb, app/services/evaluations/validate_service.rb:66). No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 2; the same call with score 5 passes the params check.
- **Trace.** P0 · automate · `EDGE-AWD-009` · `app/services/evaluations/validate_service.rb:66`

#### API-XAWD-010 — A negative score is refused
- **Why it matters.** A negative score would pull a weighted QCS total below zero.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time has passed; form.uuid is {{evalFormUuid}}, the form assigned to the evaluator.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "score": -1, "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. POST /evaluations with form.score = -1.
- **Expected.** HTTP 422 code 2 — -1 is not a label key (app/services/evaluations/validate_service.rb:66). No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 2.
- **Trace.** P1 · automate · `EDGE-AWD-010` · `app/services/evaluations/validate_service.rb:66`

#### API-XAWD-011 — A TNA (zero) score with a blank reason is refused
- **Why it matters.** Score 0 is TNA (technically not accepted) in the default mapping — the one score that disqualifies a vendor from awarding. An empty-string remark is the easy bypass of the mandatory justification.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time has passed; not vendor-onboarding v2; form.uuid is {{evalFormUuid}}, the form assigned to the evaluator.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "score": 0, "remark": ""}}`. 1. POST /evaluations with form.score = 0 and remark = "".
- **Expected.** HTTP 422 code 2 — a zero score is only valid when form[:remark].present? (app/services/evaluations/validate_service.rb:67-69); "" is not present. No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 2.
- **Trace.** P0 · automate · `EDGE-AWD-011` · `app/services/evaluations/validate_service.rb:67-69`

#### API-XAWD-012 — A TNA score with a reason is accepted
- **Why it matters.** Pairs with the two refusals above: the rule is 'zero needs a reason', not 'zero is forbidden'.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time has passed; form.uuid is {{evalFormUuid}}, the form assigned to the evaluator; 0 is a key of the event's evaluation_score_label_mapping (TNA in both defaults).
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "score": 0, "remark": "QA_Platform_TNA_reason_{{stamp}}"}}`. 1. POST /evaluations with form.score = 0 and a real remark.
- **Expected.** 200 success:true — 0 is a label key and the remark is present, so valid_form? passes; a draft evaluation_score of 0 with a Remark row is written. (app/services/evaluations/validate_service.rb:67-69, app/helpers/api/evaluations_helper.rb:1099)
- **Oracle.** success:true and the vendor shows TNA on the evaluator's form.
- **Trace.** P1 · automate · `EDGE-AWD-012` · `app/services/evaluations/validate_service.rb:67-69`

#### API-XAWD-013 — The highest label score is accepted, and may mean Regret
- **Why it matters.** The top of the range is a boundary AND, depending on which mapping the RFP carries, a disqualification — the same number means T1 in the company default and Regret in the per-RFP default.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time has passed; 5 is a key of the event's evaluation_score_label_mapping; form.uuid is {{evalFormUuid}}, the form assigned to the evaluator.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "score": 5, "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. POST /evaluations with form.score = 5 (highest default label key).
- **Expected.** 200 success:true — 5 is a key of both default mappings (app/services/evaluations/validate_service.rb:66). NOTE the per-RFP mapping from the 2025-02 migration makes 5 = 'Regret', which BLOCKS awarding when restrict_awarding_for_tna_vendors is on (app/helpers/api/proposal_helper.rb:1271-1280). If the event's mapping tops out below 5 this becomes code 2.
- **Oracle.** success:true; then check which label the vendor now shows.
- **Trace.** P1 · automate · `EDGE-AWD-013` · `app/services/evaluations/validate_service.rb:66`

#### API-XAWD-014 — Every score is refused when the RFP carries no label mapping
- **Why it matters.** CONFIG trap: no code path writes evaluation_score_label_mapping into a NEW RFP's config (only the 2025-02 backfill migration did). If new RFPs lack it, scoring is impossible and every attempt reads as 'Insufficient parameters'.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; the RFP's config has no evaluation_score_label_mapping key (EventGroup#evaluation_score_label_mapping uses the RFP's config whenever an RFP exists, and TradeRequest#evaluation_score_label_mapping returns [] when the key is absent); form.uuid is {{evalFormUuid}}, the form assigned to the evaluator.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "score": 3, "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. POST /evaluations with a normally valid score 3.
- **Expected.** HTTP 422 code 2 for EVERY score — get_evaluation_score_vs_label.keys is [] (app/models/event_group.rb:718-735, app/models/model_helpers/trade_request_model_helper.rb:912-914). The company-level MasterConfiguration default is never consulted once an RFP exists. No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 2 for scores 0..5 alike; GET /v1/trade/{{rfpTradeId}}/schema trade_config.evaluation_score_label_mapping is empty.
- **Trace.** P0 · automate · `EDGE-AWD-014` · `app/models/event_group.rb:726-735`

#### API-XAWD-015 — A numeric remark does not crash scoring
- **Why it matters.** DEFECT-IN-WAITING: the remark is never type-checked; only strings have html_safe.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time has passed; form.uuid is {{evalFormUuid}}, the form assigned to the evaluator.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "score": 3, "remark": 5}}`. 1. POST /evaluations with form.remark = 5 (a number).
- **Expected.** Must be a 422, not a 500. Today valid_form? passes (remark is only checked for score 0) and find_or_create_remark calls message.html_safe on an Integer (app/helpers/api/evaluations_helper.rb:1120), which raises NoMethodError → 500.
- **Oracle.** Status < 500; no half-saved evaluation row with a nil remark.
- **Trace.** P1 · automate · `EDGE-AWD-015` · `app/helpers/api/evaluations_helper.rb:1114-1124`

#### API-XAWD-016 — A malformed score breakdown does not crash scoring
- **Why it matters.** Optional nested hash never validated for type.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time has passed; form.uuid is {{evalFormUuid}}, the form assigned to the evaluator.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "score": 3, "remark": "QA_Platform_eval_{{stamp}}", "score_type_vs_key_attribute_vs_score": "QA_Platform_{{stamp}}"}}`. 1. POST /evaluations with form.score_type_vs_key_attribute_vs_score = "QA_Platform_{{stamp}}".
- **Expected.** Must be a 422. build_updated_score_obj calls score_type_vs_key_attribute_vs_score&.to_unsafe_h (app/helpers/api/evaluations_helper.rb:1108), which a String does not have → 500 today.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-AWD-016` · `app/helpers/api/evaluations_helper.rb:1101-1108`

#### API-XAWD-017 — Re-scoring without the breakdown does not crash
- **Why it matters.** Re-scoring is routine; a partial payload on the second save is exactly what a UI that only sends changed fields does.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; the evaluator already saved a score WITH score_type_vs_key_attribute_vs_score; form.uuid is {{evalFormUuid}}, the form assigned to the evaluator.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "score": 4, "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. Score once with a breakdown {"technical": {"q1": 3}}. 2. Re-score the same form without the breakdown key.
- **Expected.** Must be 200 or 422. get_meta_data_for_evaluation_score iterates the OLD breakdown and indexes new_score_type_vs_key_attribute_vs_score[...] on nil (app/helpers/api/evaluations_helper.rb:1161-1172) → NoMethodError → 500 today.
- **Oracle.** Status < 500 and the stored score is 4.
- **Trace.** P2 · automate · `EDGE-AWD-017` · `app/helpers/api/evaluations_helper.rb:1166-1170`

## 2. Scoring — wrong state, wrong actor, wrong time

#### API-XAWD-018 — Scoring before the technical round closes is refused
- **Why it matters.** Two-envelope confidentiality: scoring while vendors can still edit would let a score leak and responses change after it.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; the RFP is still accepting responses (bid_end_time in the future).
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "score": 3, "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. POST /evaluations with a valid body while the RFP is live.
- **Expected.** HTTP 422 code 33 'Order not active' — render_error_json(33) if trade_request.bid_end_time > Time.now (app/controllers/api/evaluations_controller.rb:25). No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 33.
- **Trace.** P0 · automate · `EDGE-AWD-018` · `app/controllers/api/evaluations_controller.rb:25`

#### API-XAWD-019 — Scoring against a pricing round is refused
- **Why it matters.** Commercial stages have no forms; the scope is the only thing stopping a score being filed against a price round.
- **Setup.** {{tradeId}} is the PRICING (RFQ) stage of the sandbox event; form.uuid is {{evalFormUuid}}.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{tradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "score": 3, "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. POST /evaluations with trade_request_uuid = the RFQ stage ({{tradeId}}) instead of {{rfpTradeId}}.
- **Expected.** HTTP 422 code 33 — the lookup is TradeRequest.active.rfi_or_rfp (app/controllers/api/evaluations_controller.rb:14-16), so an RFQ/auction id finds nothing. No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 33.
- **Trace.** P1 · automate · `EDGE-AWD-019` · `app/controllers/api/evaluations_controller.rb:14`

#### API-XAWD-020 — Scoring an unpublished technical round is refused
- **Why it matters.** Wrong order of actions: evaluating an event no vendor has seen.
- **Setup.** {{rfpTradeId}} is an RFP stage still in draft (event not activated).
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "score": 3, "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. POST /evaluations against the draft stage.
- **Expected.** HTTP 422 code 33 — TradeRequest.active excludes status draft (app/controllers/api/evaluations_controller.rb:14). No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 33.
- **Trace.** P1 · automate · `EDGE-AWD-020` · `app/controllers/api/evaluations_controller.rb:14`

#### API-XAWD-021 — A vendor cannot score itself
- **Why it matters.** Self-scoring is the most direct fraud on a technical evaluation.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time has passed; caller is the VENDOR user.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "score": 5, "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. Log in as the vendor. 2. POST /evaluations scoring itself 5.
- **Expected.** HTTP 422 code 33 — the lookup is scoped to company_id: Current.workspace.id (app/controllers/api/evaluations_controller.rb:14); the vendor's workspace owns no RFP. No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 33 and the vendor's score is unchanged.
- **Trace.** P0 · automate · `EDGE-AWD-021` · `app/controllers/api/evaluations_controller.rb:14`

#### API-XAWD-022 — Scoring a vendor who never responded is refused
- **Why it matters.** Scoring a non-respondent invents a qualification for a vendor who never qualified; code 101, not 2, is the tell that the params were fine.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time has passed; {{vendorUuid}} was invited but never submitted a technical response (or it was deleted).
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "score": 3, "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. POST /evaluations for that vendor with the evaluator's assigned form.
- **Expected.** HTTP 422 code 101 'You are not allowed to perform this action' — allowed_to_evaluate_participant? requires trade_request.template_responses.active.exists?(company_id:) (app/services/evaluations/validate_service.rb:79). No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 101 (not 2 — the params were valid).
- **Trace.** P1 · automate · `EDGE-AWD-022` · `app/services/evaluations/validate_service.rb:77-82`

#### API-XAWD-023 — A double-clicked score is saved once
- **Why it matters.** Without the lock two draft Evaluation rows are created for the same vendor (the find-or-new at app/helpers/api/evaluations_helper.rb:25-36 is not atomic).
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time has passed; form.uuid is {{evalFormUuid}}, the form assigned to the evaluator.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "score": 3, "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. Fire two identical POST /evaluations within 3 seconds.
- **Expected.** The second returns HTTP 422 code 516 'Transaction in Progress' — lock_evaluation_create keys on trade/company/form/user for 3s (app/controllers/api/evaluations_controller.rb:126-132). Exactly one evaluation_score row.
- **Oracle.** One 200, one 516; one evaluation_scores row.
- **Trace.** P1 · automate · `EDGE-AWD-023` · `app/controllers/api/evaluations_controller.rb:126-132`

#### API-XAWD-024 — Scoring after the evaluation window closes is not time-guarded
- **Why it matters.** DEFECT-IN-WAITING: re-evaluation is explicitly limited to in_evaluation_time? (app/controllers/api/v1/trade_controller.rb:1352) but first-time scoring is not, so a late score changes QCS after the window everyone relied on.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; now is AFTER extra_closing_time (the evaluation window has ended) but the stage is still status active.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "score": 3, "remark": "QA_Platform_eval_{{stamp}}"}}`. 1. POST /evaluations with a valid body.
- **Expected.** Today the create action only checks the LOWER bound (bid_end_time > now → 33, app/controllers/api/evaluations_controller.rb:25); nothing refuses a score after extra_closing_time. Expected per product rules: refused. Must never 5xx.
- **Oracle.** Record the status; if 200, the score changed after the window closed.
- **Trace.** P1 · automate · `EDGE-AWD-024` · `app/controllers/api/evaluations_controller.rb:25`

#### API-XAWD-025 — Section-wise scoring refuses an unknown question
- **Why it matters.** Keys must be the form's page_response_headers key_attributes; an unknown key would otherwise be stored and weighted as 0.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; config: section-wise scoring enabled on the RFP; the form is a vendor-assessment form; form.uuid is {{evalFormUuid}}, the form assigned to the evaluator.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "question_scores": {"QA_Platform_bogus_key": 3}}}`. 1. POST /evaluations with form.question_scores = {"QA_Platform_bogus_{{stamp}}": 3}.
- **Expected.** HTTP 422 code 15 with message 'Invalid question keys: QA_Platform_bogus_key' from validate_and_parse_question_scores (app/helpers/api/evaluations_helper.rb:838-841). No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 15 and the message names the key.
- **Trace.** P2 · automate · `EDGE-AWD-025` · `app/helpers/api/evaluations_helper.rb:834-855`

#### API-XAWD-026 — Section-wise scoring refuses a score above the maximum
- **Why it matters.** Section-wise scores are floats with a per-form max, unlike the label-key scores.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; config: section-wise scoring; form.uuid is {{evalFormUuid}}, the form assigned to the evaluator; the question key is valid.
- **Steps.** `POST /evaluations` with body `{"trade_request_uuid": "{{rfpTradeId}}", "company_uuid": "{{vendorUuid}}", "form": {"uuid": "{{evalFormUuid}}", "question_scores": {"q1": 99999}}}`. 1. POST /evaluations with a question score of 99999.
- **Expected.** HTTP 422 code 15 'Score for q1 must be between 0 and <section_wise_max_score>' (app/helpers/api/evaluations_helper.rb:848-850). No evaluations / evaluation_scores row is written.
- **Oracle.** 422 + code 15.
- **Trace.** P2 · automate · `EDGE-AWD-026` · `app/helpers/api/evaluations_helper.rb:848-850`

## 3. Evaluator reads and evaluation submit

#### API-XAWD-027 — The evaluator schema for a non-existent round is refused
- **Why it matters.** The evaluator's first call; a nil trade must be a clean 4, not a nil dereference in the Dynamo logging that follows.
- **Setup.** Caller is the evaluator.
- **Steps.** `GET /v1/trade/Z2dnWmdaUWtnZw==/schema?response_type=template&additional_fields=order_details`. 1. GET /v1/trade/Z2dnWmdaUWtnZw==/schema (decodes to id 999999999).
- **Expected.** HTTP 422 code 4 'Request not found' — validate_event returns 4 when trade is nil (app/controllers/concerns/trade_controller_helper.rb:2215), called from app/controllers/api/v1/trade_controller.rb:276-277.
- **Oracle.** 422 + code 4.
- **Trace.** P1 · automate · `EDGE-AWD-027` · `app/controllers/api/v1/trade_controller.rb:261-277`

#### API-XAWD-028 — An uninvited vendor cannot read the technical round
- **Why it matters.** The schema carries sheets.forms with evaluator assignments and extra_closing_time; an uninvited vendor must not read another vendor's technical round.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; caller is a vendor user who is NOT in the RFP's audience.
- **Steps.** `GET /v1/trade/{{rfpTradeId}}/schema?response_type=template&additional_fields=order_details`. 1. GET the RFP schema as that vendor.
- **Expected.** HTTP 422 code 536 'You are not allowed to view this event.' — validate_event checks trade.is_allowed_to_view?(Current.user) (app/controllers/concerns/trade_controller_helper.rb:2219-2221).
- **Oracle.** 422 + code 536.
- **Trace.** P0 · automate · `EDGE-AWD-028` · `app/controllers/concerns/trade_controller_helper.rb:2219-2221`

#### API-XAWD-029 — Submitting evaluations with POST is not routed
- **Why it matters.** Documents that the four existing submit cases are exercising the router, not the guards they describe.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event.
- **Steps.** `POST /evaluations/submit` with body `{"trade_request_uuid": "{{rfpTradeId}}"}`. 1. POST (not PATCH) /evaluations/submit.
- **Expected.** Routing error (404) — config/routes.rb:741-742 declares only `patch 'submit'`. The existing library cases EVAL-QCS-001..004 use POST and therefore never reach the controller.
- **Oracle.** 404 (or the app's routing-error envelope), never 5xx, and no proposal row.
- **Trace.** P2 · automate · `EDGE-AWD-029` · `config/routes.rb:741-744`

#### API-XAWD-030 — Submitting evaluations before close is refused (PATCH)
- **Why it matters.** Same guard as EVAL-QCS-001 but on the route that actually exists (PATCH).
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time is in the future; the evaluator has draft scores.
- **Steps.** `PATCH /evaluations/submit` with body `{"trade_request_uuid": "{{rfpTradeId}}"}`. 1. PATCH /evaluations/submit before the RFP closes.
- **Expected.** HTTP 422 code 33 — trade_request.bid_end_time > Time.now (app/controllers/api/evaluations_controller.rb:42). No Proposal created by create_proposal_for_evaluations.
- **Oracle.** 422 + code 33.
- **Trace.** P0 · automate · `EDGE-AWD-030` · `app/controllers/api/evaluations_controller.rb:42`

#### API-XAWD-031 — Submitting with one vendor unscored is refused
- **Why it matters.** A half-scored submission would create a technical proposal that disqualifies the unscored vendor by omission.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time passed; two vendors responded; the evaluator scored only one.
- **Steps.** `PATCH /evaluations/submit` with body `{"trade_request_uuid": "{{rfpTradeId}}"}`. 1. PATCH /evaluations/submit.
- **Expected.** HTTP 422 code 571 'Please, evaluate on all fields' — rfp_evaluation_count_invalid? compares expected (participants × items) with draft/peer_review scores (app/helpers/api/evaluations_helper.rb:811-832, returned at app/helpers/api/evaluations_helper.rb:609).
- **Oracle.** 422 + code 571; evaluations stay draft.
- **Trace.** P0 · automate · `EDGE-AWD-031` · `app/helpers/api/evaluations_helper.rb:609`

#### API-XAWD-032 — A vendor cannot submit an evaluation
- **Why it matters.** Wrong actor on the call that publishes the technical outcome.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; caller is a vendor.
- **Steps.** `PATCH /evaluations/submit` with body `{"trade_request_uuid": "{{rfpTradeId}}"}`. 1. PATCH /evaluations/submit as the vendor.
- **Expected.** HTTP 422 code 33 — the trade lookup is scoped to Current.workspace.id (app/controllers/api/evaluations_controller.rb:41).
- **Oracle.** 422 + code 33.
- **Trace.** P1 · automate · `EDGE-AWD-032` · `app/controllers/api/evaluations_controller.rb:41`

#### API-XAWD-033 — An unknown submit action only saves the technical proposal
- **Why it matters.** An unknown enum is silently treated as 'save', which a client may mistake for a submission.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time passed; the evaluator scored every vendor.
- **Steps.** `PATCH /evaluations/submit` with body `{"trade_request_uuid": "{{rfpTradeId}}", "action_type": "QA_Platform_bogus"}`. 1. PATCH /evaluations/submit with action_type = "QA_Platform_bogus".
- **Expected.** 200 with a DRAFT proposal and no approval started — only action_type == 'proposal_submit' submits (app/controllers/api/evaluations_controller.rb:97-100). Never 5xx.
- **Oracle.** Response proposal status is draft.
- **Trace.** P2 · automate · `EDGE-AWD-033` · `app/controllers/api/evaluations_controller.rb:84-100`

#### API-XAWD-034 — Section-wise submit without naming the section is refused
- **Why it matters.** CONFIG-dependent: the same body is valid when section-wise scoring is off.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; config: section-wise scoring enabled; caller is NOT on an evaluating team; all sections scored.
- **Steps.** `PATCH /evaluations/submit` with body `{"trade_request_uuid": "{{rfpTradeId}}", "action_type": "proposal_submit"}`. 1. PATCH /evaluations/submit with no form_id / form_ids.
- **Expected.** HTTP 422 code 2 — section-wise submission needs form_ids.first (app/controllers/api/evaluations_controller.rb:85-87); get_form_ids_for_evaluation_submission returns [] without form_id (app/helpers/api/evaluations_helper.rb:749-762).
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-AWD-034` · `app/controllers/api/evaluations_controller.rb:85-87`

#### API-XAWD-035 — A double-submitted evaluation creates one proposal
- **Why it matters.** find_or_initialize_draft_proposal is not atomic; the 3s cache lock is the only guard against two proposals.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; bid_end_time passed; every vendor scored.
- **Steps.** `PATCH /evaluations/submit` with body `{"trade_request_uuid": "{{rfpTradeId}}"}`. 1. Fire two PATCH /evaluations/submit within 3s.
- **Expected.** Second call → HTTP 422 code 516 (app/controllers/api/evaluations_controller.rb:113-119). One draft technical proposal.
- **Oracle.** One success, one 516.
- **Trace.** P1 · automate · `EDGE-AWD-035` · `app/controllers/api/evaluations_controller.rb:113-119`

## 4. Technical re-evaluation (TR) rules

#### API-XAWD-036 — Re-evaluation items cannot be listed outside evaluation time
- **Why it matters.** Re-evaluation is only meaningful during evaluation time; listing items outside it invites requests that will all fail.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; the RFP is still live (before bid_end_time).
- **Steps.** `GET /v1/trade/{{rfpTradeId}}/line_items_for_reevaluation`. 1. GET /v1/trade/{{rfpTradeId}}/line_items_for_reevaluation.
- **Expected.** HTTP 422 code 101 — render_error_json(101) unless trade_request.in_evaluation_time? (app/controllers/api/v1/trade_controller.rb:1316); in_evaluation_time? is the window bid_end_time..extra_closing_time.
- **Oracle.** 422 + code 101.
- **Trace.** P0 · automate · `EDGE-AWD-036` · `app/controllers/api/v1/trade_controller.rb:1316`

#### API-XAWD-037 — Re-evaluation cannot be requested while vendors are still responding
- **Why it matters.** 'Only during evaluation time' rule.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; the RFP is still live.
- **Steps.** `PATCH /v1/trade/{{rfpTradeId}}/request_tr_reevaluation` with body `{"form_uuids": ["{{evalFormUuid}}"], "remarks": "QA_Platform_reeval_{{stamp}}"}`. 1. PATCH request_tr_reevaluation with a form uuid and remarks.
- **Expected.** HTTP 422 code 101 (app/controllers/api/v1/trade_controller.rb:1352). No AdditionalRequest created.
- **Oracle.** 422 + code 101.
- **Trace.** P0 · automate · `EDGE-AWD-037` · `app/controllers/api/v1/trade_controller.rb:1352`

#### API-XAWD-038 — Re-evaluation cannot be requested after the evaluation window
- **Why it matters.** Upper bound of the same rule; contrast with first-time scoring, which has no upper bound.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; now is after extra_closing_time.
- **Steps.** `PATCH /v1/trade/{{rfpTradeId}}/request_tr_reevaluation` with body `{"form_uuids": ["{{evalFormUuid}}"], "remarks": "QA_Platform_reeval_{{stamp}}"}`. 1. PATCH request_tr_reevaluation.
- **Expected.** HTTP 422 code 101 — in_evaluation_time? (alias of is_auction_in_extra_closing_time?, app/models/trade_request.rb:968) is false after the window (app/controllers/api/v1/trade_controller.rb:1352).
- **Oracle.** 422 + code 101.
- **Trace.** P0 · automate · `EDGE-AWD-038` · `app/controllers/api/v1/trade_controller.rb:1352`

#### API-XAWD-039 — Requesting re-evaluation without naming forms does not crash
- **Why it matters.** DEFECT-IN-WAITING: the only params guard is id.blank? (app/controllers/api/v1/trade_controller.rb:1349); form_ids is never presence-checked.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; inside evaluation time; line-item (not lot) evaluation.
- **Steps.** `PATCH /v1/trade/{{rfpTradeId}}/request_tr_reevaluation` with body `{"remarks": "QA_Platform_reeval_{{stamp}}"}`. 1. PATCH request_tr_reevaluation with remarks only.
- **Expected.** Must be 422 code 2/786. Today form_ids is nil and `(form_ids & form_objects.pluck(:id))` raises NoMethodError (app/controllers/api/v1/trade_controller.rb:1364) → 500.
- **Oracle.** Status < 500; no AdditionalRequest.
- **Trace.** P1 · automate · `EDGE-AWD-039` · `app/controllers/api/v1/trade_controller.rb:1364`

#### API-XAWD-040 — A non-list of forms for re-evaluation does not crash
- **Why it matters.** Wrong container type.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; inside evaluation time.
- **Steps.** `PATCH /v1/trade/{{rfpTradeId}}/request_tr_reevaluation` with body `{"form_ids": "12", "remarks": "QA_Platform_reeval_{{stamp}}"}`. 1. PATCH request_tr_reevaluation with form_ids = "12" (a string, not an array).
- **Expected.** Must be 422. String#& does not exist → NoMethodError at app/controllers/api/v1/trade_controller.rb:1364 → 500 today.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-AWD-040` · `app/controllers/api/v1/trade_controller.rb:1364`

#### API-XAWD-041 — Re-evaluation of a form you cannot see is refused
- **Why it matters.** Re-evaluation resets another evaluator's score; it must be limited to forms the requester can see.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; inside evaluation time; the caller can see some forms.
- **Steps.** `PATCH /v1/trade/{{rfpTradeId}}/request_tr_reevaluation` with body `{"form_uuids": ["Z2dnWmdaUWtnZw=="], "remarks": "QA_Platform_reeval_{{stamp}}"}`. 1. PATCH request_tr_reevaluation with form_uuids = [Z2dnWmdaUWtnZw==].
- **Expected.** HTTP 422 code 786 'Select correct line items for reevaluation' — (form_ids & allowed ids) != form_ids (app/controllers/api/v1/trade_controller.rb:1364-1366).
- **Oracle.** 422 + code 786.
- **Trace.** P0 · automate · `EDGE-AWD-041` · `app/controllers/api/v1/trade_controller.rb:1363-1366`

#### API-XAWD-042 — Re-evaluation of an item whose TR is not submitted is refused
- **Why it matters.** 'Only TR-submitted items' rule: you cannot send back something that was never handed in.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; inside evaluation time; the form's evaluation is still DRAFT (evaluator has not submitted TR); form.uuid is {{evalFormUuid}}, the form assigned to the evaluator.
- **Steps.** `PATCH /v1/trade/{{rfpTradeId}}/request_tr_reevaluation` with body `{"form_uuids": ["{{evalFormUuid}}"], "remarks": "QA_Platform_reeval_{{stamp}}"}`. 1. PATCH request_tr_reevaluation for that form.
- **Expected.** HTTP 422 code 786 — get_item_status returns reevaluation_disabled_reason 'TR is Pending' for evaluation_status draft (app/controllers/concerns/trade_controller_helper.rb:5680-5691), refused at app/controllers/api/v1/trade_controller.rb:1379-1381.
- **Oracle.** 422 + code 786.
- **Trace.** P0 · automate · `EDGE-AWD-042` · `app/controllers/concerns/trade_controller_helper.rb:5649-5691`

#### API-XAWD-043 — Re-evaluation cannot be requested twice for the same item
- **Why it matters.** Two pending requests on one score would each flip it back to draft on accept.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; inside evaluation time; a re-evaluation for this form is already pending; form.uuid is {{evalFormUuid}}, the form assigned to the evaluator.
- **Steps.** `PATCH /v1/trade/{{rfpTradeId}}/request_tr_reevaluation` with body `{"form_uuids": ["{{evalFormUuid}}"], "remarks": "QA_Platform_reeval_{{stamp}}"}`. 1. PATCH request_tr_reevaluation for the same form again.
- **Expected.** HTTP 422 code 786 ('Reevaluation is already requested', app/controllers/concerns/trade_controller_helper.rb:5688-5689) or, if the status check is bypassed, 787 'Reevaluation already Requested' (app/helpers/api/additional_requests_helper.rb:555).
- **Oracle.** 422 with 786/787; still exactly one requested AdditionalRequest.
- **Trace.** P1 · automate · `EDGE-AWD-043` · `app/helpers/api/additional_requests_helper.rb:555`

#### API-XAWD-044 — Re-evaluation without a reason is not refused by the backend
- **Why it matters.** 'Reason required' is enforced client-side only — an API caller can send an evaluator's score back with no justification.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; inside evaluation time; TR submitted for the form; form.uuid is {{evalFormUuid}}, the form assigned to the evaluator.
- **Steps.** `PATCH /v1/trade/{{rfpTradeId}}/request_tr_reevaluation` with body `{"form_uuids": ["{{evalFormUuid}}"]}`. 1. PATCH request_tr_reevaluation with no remarks.
- **Expected.** Per product rules the reason is mandatory; the backend stores request_remark: remarks || '' (app/helpers/api/additional_requests_helper.rb:574) and accepts it. Record: 200 means the rule lives only in the UI. Never 5xx.
- **Oracle.** If 200, the AdditionalRequest has request_remark ''.
- **Trace.** P1 · automate · `EDGE-AWD-044` · `app/helpers/api/additional_requests_helper.rb:574`

#### API-XAWD-045 — An unknown re-evaluation decision is refused
- **Why it matters.** Invalid enum on the call that either resets or keeps a score.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; inside evaluation time; a pending re-evaluation exists; caller is the requested evaluator.
- **Steps.** `PATCH /v1/trade/{{rfpTradeId}}/resolve_tr_reevaluation_request/{{evalFormUuid}}` with body `{"request_action": "approve", "remarks": "QA_Platform_{{stamp}}"}`. 1. PATCH resolve_tr_reevaluation_request with request_action = "approve".
- **Expected.** HTTP 422 code 2 — return 2 if !action.in?(['accept','reject']) (app/helpers/additional_request_resolution_helper.rb:1146).
- **Oracle.** 422 + code 2; request still requested.
- **Trace.** P1 · automate · `EDGE-AWD-045` · `app/helpers/additional_request_resolution_helper.rb:1146`

#### API-XAWD-046 — Only the asked evaluator can accept a re-evaluation
- **Why it matters.** Only the evaluator who owns the score can agree to re-open it.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; inside evaluation time; a pending re-evaluation is addressed to evaluator B; caller is buyer A.
- **Steps.** `PATCH /v1/trade/{{rfpTradeId}}/resolve_tr_reevaluation_request/{{evalFormUuid}}` with body `{"request_action": "accept", "remarks": "QA_Platform_{{stamp}}"}`. 1. As A, PATCH resolve with request_action accept.
- **Expected.** HTTP 422 code 101 — return 101 if user.id != additional_request.requested_from_id (app/helpers/additional_request_resolution_helper.rb:1160).
- **Oracle.** 422 + code 101; score status unchanged.
- **Trace.** P0 · automate · `EDGE-AWD-046` · `app/helpers/additional_request_resolution_helper.rb:1160`

#### API-XAWD-047 — Resolving a re-evaluation that is not pending is refused
- **Why it matters.** Resolve twice / resolve nothing.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; inside evaluation time; no re-evaluation pending on the form; form.uuid is {{evalFormUuid}}, the form assigned to the evaluator.
- **Steps.** `PATCH /v1/trade/{{rfpTradeId}}/resolve_tr_reevaluation_request/{{evalFormUuid}}` with body `{"request_action": "reject", "remarks": "QA_Platform_{{stamp}}"}`. 1. PATCH resolve with request_action reject.
- **Expected.** HTTP 422 code 4 'Request not found' — AdditionalRequest.active.requested.where(grouping_id:) is blank (app/helpers/additional_request_resolution_helper.rb:1155-1156).
- **Oracle.** 422 + code 4.
- **Trace.** P1 · automate · `EDGE-AWD-047` · `app/helpers/additional_request_resolution_helper.rb:1156`

#### API-XAWD-048 — A user with no forms resolving a re-evaluation does not crash
- **Why it matters.** DEFECT-IN-WAITING in both re-evaluation writes.
- **Setup.** {{rfpTradeId}} is the TECHNICAL (RFP) stage of the sandbox event; inside evaluation time; caller is a buyer-side user who is allowed to show the trade but has NO allowed forms.
- **Steps.** `PATCH /v1/trade/{{rfpTradeId}}/resolve_tr_reevaluation_request/{{evalFormUuid}}` with body `{"request_action": "accept", "remarks": "QA_Platform_{{stamp}}"}`. 1. PATCH resolve with request_action accept.
- **Expected.** Must be 422 code 101. get_forms returns [allowed_forms, nil] when nothing is allowed (app/helpers/api/forms_helper.rb:56), and form_objects.find on nil raises (app/helpers/additional_request_resolution_helper.rb:1148) → 500 today. request_tr_reevaluation has the same shape at app/controllers/api/v1/trade_controller.rb:1363-1364.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-AWD-048` · `app/helpers/api/forms_helper.rb:53-56`

#### API-XAWD-049 — Only the requester can withdraw a re-evaluation
- **Why it matters.** Revoking a re-evaluation restores the old score; only its requester or the owner may do it.
- **Setup.** A re-evaluation request exists, raised by buyer A; caller is buyer B (not requester, not super admin, not event owner). The request id is supplied by the runner.
- **Steps.** `PATCH /additional_request/revoke_additional_requests` with body `{"item_type": "reevaluation", "requests": [{"id": "Z2dnWmdaUWtnZw==", "status": "revoke"}]}`. 1. PATCH /additional_request/revoke_additional_requests with item_type reevaluation.
- **Expected.** HTTP 422 code 5 'Not authorized' when the id is real (app/controllers/api/additional_requests_controller.rb:199-203); code 4 for the ghost id (app/controllers/api/additional_requests_controller.rb:182-185).
- **Oracle.** 422 with 5 (real id) or 4 (ghost).
- **Trace.** P1 · automate · `EDGE-AWD-049` · `app/controllers/api/additional_requests_controller.rb:181-205`

## 5. QCS and master QCS

#### API-XAWD-050 — A client cannot regenerate master QCS
- **Why it matters.** Regeneration re-runs PrecomputationEngine over every bid; a client must not be able to trigger it.
- **Setup.** Caller is an ordinary client buyer (not a Procol employee on the ALLOWED_USER_IDS_TO_REGENERATE_MASTER_QCS list).
- **Steps.** `POST /event_groups/regenerate_master_qcs` with body `{"event_group_uuids": ["{{eventGroupUuid}}"]}`. 1. POST /event_groups/regenerate_master_qcs with event_group_uuids [{{eventGroupUuid}}].
- **Expected.** HTTP 422 code 455 'You are not authorized to perform this action' — EventGroupPolicy#regenerate_master_qcs? requires is_procol_employee? and the allow-list (app/policies/event_group_policy.rb:92-97), rescued by app/controllers/concerns/api_auth.rb:16,117-118.
- **Oracle.** 422 + code 455.
- **Trace.** P0 · automate · `EDGE-AWD-050` · `app/policies/event_group_policy.rb:92-97`

#### API-XAWD-051 — A vendor cannot read the award proposal
- **Why it matters.** The proposal carries every vendor's allocation and price — the QCS in award form.
- **Setup.** {{proposalUuid}} is the sandbox award proposal; caller is the vendor.
- **Steps.** `GET /proposal/{{proposalUuid}}`. 1. GET /proposal/{{proposalUuid}} as the vendor.
- **Expected.** HTTP 422 code 455 — ProposalPolicy#show? → add_response? requires record.company_id in Company.allowed_companies(user) (app/policies/proposal_policy.rb:10-23).
- **Oracle.** 422 + code 455.
- **Trace.** P0 · automate · `EDGE-AWD-051` · `app/policies/proposal_policy.rb:17-23`

## 6. Counter offers — raise, bulk, revoke, vendor response

#### API-XAWD-052 — A counter offer with no type is refused
- **Why it matters.** Guard order: the before_action answers first, so the documented code-2 check is unreachable from this body.
- **Setup.** {{bidUuid}} is the vendor's submitted bid on the closed RFQ.
- **Steps.** `POST /additional_request/raise_additional_request` with body `{"item_uuid": "{{bidUuid}}", "sheets": {"inline_components": {"data": [{"status": {"value": "active", "key": "status"}, "creator_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "creator_quantity"}, "participant_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "participant_quantity"}, "price": {"value": 90, "key": "price"}, "product": {"value": "product", "uuid": "{{productUuid}}", "unit_type": "KG", "event_group_line_item_uuid": "{{lineItemUuid}}", "key": "product"}, "variant": {"uuid": "{{productQualityUuid}}", "key": "variant"}}]}}, "remarks": "QA_Platform_co_{{stamp}}"}`. 1. POST raise_additional_request without item_type.
- **Expected.** HTTP 422 — the before_action transform_bid_products finds no trade (item_type is not counter_offer_for_bid and there is no trade_request_id) and returns code 4 (app/controllers/concerns/trade_template_helper.rb:5548-5555); without the filter the action would return 2 (app/controllers/api/additional_requests_controller.rb:20-21). No additional_requests row; bid status unchanged.
- **Oracle.** 422 with code 4 (or 2).
- **Trace.** P1 · automate · `EDGE-AWD-052` · `app/controllers/api/additional_requests_controller.rb:20-21`

#### API-XAWD-053 — A counter offer on a non-existent bid does not crash
- **Why it matters.** DEFECT-IN-WAITING: a well-formed but unknown id crashes the before_action; the nil guard is on the wrong side of the dereference.
- **Setup.** Authenticated buyer.
- **Steps.** `POST /additional_request/raise_additional_request` with body `{"item_uuid": "Z2dnWmdaUWtnZw==", "item_type": "counter_offer_for_bid", "sheets": {"inline_components": {"data": [{"status": {"value": "active", "key": "status"}, "creator_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "creator_quantity"}, "participant_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "participant_quantity"}, "price": {"value": 90, "key": "price"}, "product": {"value": "product", "uuid": "{{productUuid}}", "unit_type": "KG", "event_group_line_item_uuid": "{{lineItemUuid}}", "key": "product"}, "variant": {"uuid": "{{productQualityUuid}}", "key": "variant"}}]}}, "remarks": "QA_Platform_co_{{stamp}}"}`. 1. POST raise_additional_request with item_uuid Z2dnWmdaUWtnZw== (well-formed, id 999999999, no such bid).
- **Expected.** Must be 422 code 4. Today transform_product does Bid.find_by_id(bid_id).trade_request on nil (app/controllers/concerns/trade_template_helper.rb:5550) → NoMethodError → 500; create_additional_request_for_bid would also call nil.status (app/helpers/api/additional_requests_helper.rb:157-158).
- **Oracle.** Status < 500.
- **Trace.** P0 · automate · `EDGE-AWD-053` · `app/controllers/concerns/trade_template_helper.rb:5550`

#### API-XAWD-054 — An unknown counter-offer type answers success without doing anything
- **Why it matters.** An invalid enum answered with success:true makes the caller believe a counter offer was sent.
- **Setup.** {{bidUuid}} is a submitted bid; body also carries trade_request_uuid so the before_action resolves a trade.
- **Steps.** `POST /additional_request/raise_additional_request` with body `{"item_uuid": "{{bidUuid}}", "item_type": "QA_Platform_bogus", "sheets": {"inline_components": {"data": [{"status": {"value": "active", "key": "status"}, "creator_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "creator_quantity"}, "participant_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "participant_quantity"}, "price": {"value": 90, "key": "price"}, "product": {"value": "product", "uuid": "{{productUuid}}", "unit_type": "KG", "event_group_line_item_uuid": "{{lineItemUuid}}", "key": "product"}, "variant": {"uuid": "{{productQualityUuid}}", "key": "variant"}}]}}, "remarks": "QA_Platform_co_{{stamp}}", "trade_request_uuid": "{{tradeId}}"}`. 1. POST raise_additional_request with item_type = "QA_Platform_bogus".
- **Expected.** Today 200 success with nothing created — neither branch of the if/elsif matches and the action falls through to render_success_json (app/controllers/api/additional_requests_controller.rb:23-32). Expected: 422 code 2.
- **Oracle.** If 200, confirm no additional_requests row — the 'success' was a no-op.
- **Trace.** P1 · automate · `EDGE-AWD-054` · `app/controllers/api/additional_requests_controller.rb:23-32`

#### API-XAWD-055 — A second counter offer while one is pending is refused
- **Why it matters.** Two open counter offers on one bid would race on accept.
- **Setup.** {{bidUuid}} already has a pending counter offer (bid status requested).
- **Steps.** `POST /additional_request/raise_additional_request` with body `{"item_uuid": "{{bidUuid}}", "item_type": "counter_offer_for_bid", "sheets": {"inline_components": {"data": [{"status": {"value": "active", "key": "status"}, "creator_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "creator_quantity"}, "participant_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "participant_quantity"}, "price": {"value": 90, "key": "price"}, "product": {"value": "product", "uuid": "{{productUuid}}", "unit_type": "KG", "event_group_line_item_uuid": "{{lineItemUuid}}", "key": "product"}, "variant": {"uuid": "{{productQualityUuid}}", "key": "variant"}}]}}, "remarks": "QA_Platform_co_{{stamp}}"}`. 1. POST raise_additional_request again.
- **Expected.** HTTP 422 code 101 — return 101 if bid.status != 'active' (app/helpers/api/additional_requests_helper.rb:158). No additional_requests row; bid status unchanged.
- **Oracle.** 422 + code 101; one open request.
- **Trace.** P0 · automate · `EDGE-AWD-055` · `app/helpers/api/additional_requests_helper.rb:158`

#### API-XAWD-056 — A counter offer on an awarded bid is refused
- **Why it matters.** Negotiating after award changes a committed price.
- **Setup.** {{bidUuid}} has been awarded (status selected).
- **Steps.** `POST /additional_request/raise_additional_request` with body `{"item_uuid": "{{bidUuid}}", "item_type": "counter_offer_for_bid", "sheets": {"inline_components": {"data": [{"status": {"value": "active", "key": "status"}, "creator_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "creator_quantity"}, "participant_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "participant_quantity"}, "price": {"value": 90, "key": "price"}, "product": {"value": "product", "uuid": "{{productUuid}}", "unit_type": "KG", "event_group_line_item_uuid": "{{lineItemUuid}}", "key": "product"}, "variant": {"uuid": "{{productQualityUuid}}", "key": "variant"}}]}}, "remarks": "QA_Platform_co_{{stamp}}"}`. 1. POST raise_additional_request on the awarded bid.
- **Expected.** HTTP 422 code 101 (app/helpers/api/additional_requests_helper.rb:158).
- **Oracle.** 422 + code 101.
- **Trace.** P0 · automate · `EDGE-AWD-056` · `app/helpers/api/additional_requests_helper.rb:158`

#### API-XAWD-057 — A counter offer on an unsubmitted bid is refused
- **Why it matters.** Counter-offering a price the vendor never committed to.
- **Setup.** {{bidUuid}} is a vendor's DRAFT bid (never submitted).
- **Steps.** `POST /additional_request/raise_additional_request` with body `{"item_uuid": "{{bidUuid}}", "item_type": "counter_offer_for_bid", "sheets": {"inline_components": {"data": [{"status": {"value": "active", "key": "status"}, "creator_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "creator_quantity"}, "participant_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "participant_quantity"}, "price": {"value": 90, "key": "price"}, "product": {"value": "product", "uuid": "{{productUuid}}", "unit_type": "KG", "event_group_line_item_uuid": "{{lineItemUuid}}", "key": "product"}, "variant": {"uuid": "{{productQualityUuid}}", "key": "variant"}}]}}, "remarks": "QA_Platform_co_{{stamp}}"}`. 1. POST raise_additional_request on the draft.
- **Expected.** HTTP 422 code 101 — status draft ≠ active (app/helpers/api/additional_requests_helper.rb:158).
- **Oracle.** 422 + code 101.
- **Trace.** P0 · automate · `EDGE-AWD-057` · `app/helpers/api/additional_requests_helper.rb:158`

#### API-XAWD-058 — A buyer from another company cannot counter a bid
- **Why it matters.** Cross-tenant price pressure on someone else's vendor.
- **Setup.** Caller is a buyer of a different company with trade create/read rights.
- **Steps.** `POST /additional_request/raise_additional_request` with body `{"item_uuid": "{{bidUuid}}", "item_type": "counter_offer_for_bid", "sheets": {"inline_components": {"data": [{"status": {"value": "active", "key": "status"}, "creator_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "creator_quantity"}, "participant_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "participant_quantity"}, "price": {"value": 90, "key": "price"}, "product": {"value": "product", "uuid": "{{productUuid}}", "unit_type": "KG", "event_group_line_item_uuid": "{{lineItemUuid}}", "key": "product"}, "variant": {"uuid": "{{productQualityUuid}}", "key": "variant"}}]}}, "remarks": "QA_Platform_co_{{stamp}}"}`. 1. POST raise_additional_request on {{bidUuid}}.
- **Expected.** HTTP 422 code 101 — is_allowed_to_raise_additional_request? requires trade_request.is_allowed_to_view?(Current.user) for buyers (app/helpers/api/additional_requests_helper.rb:954-963), checked at app/helpers/api/additional_requests_helper.rb:161.
- **Oracle.** 422 + code 101.
- **Trace.** P0 · automate · `EDGE-AWD-058` · `app/helpers/api/additional_requests_helper.rb:954-963`

#### API-XAWD-059 — A vendor raising a counter offer on its own bid
- **Why it matters.** DEFECT-IN-WAITING: the actor check for vendors is 'can see the bid', not 'is the buyer'.
- **Setup.** Caller is the VENDOR who owns {{bidUuid}} (status active).
- **Steps.** `POST /additional_request/raise_additional_request` with body `{"item_uuid": "{{bidUuid}}", "item_type": "counter_offer_for_bid", "sheets": {"inline_components": {"data": [{"status": {"value": "active", "key": "status"}, "creator_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "creator_quantity"}, "participant_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "participant_quantity"}, "price": {"value": 90, "key": "price"}, "product": {"value": "product", "uuid": "{{productUuid}}", "unit_type": "KG", "event_group_line_item_uuid": "{{lineItemUuid}}", "key": "product"}, "variant": {"uuid": "{{productQualityUuid}}", "key": "variant"}}]}}, "remarks": "QA_Platform_co_{{stamp}}"}`. 1. POST raise_additional_request on its own bid.
- **Expected.** Expected: refused (only the buyer counters). Today for non-buyer users is_allowed_to_raise_additional_request? returns can_view_bid? (app/helpers/api/additional_requests_helper.rb:962-963), which is true for the owner, so the request proceeds (to 587 without a trade product, or to a real counter offer addressed to the vendor itself).
- **Oracle.** Record status; any 200 is a vendor-raised counter offer.
- **Trace.** P1 · automate · `EDGE-AWD-059` · `app/helpers/api/additional_requests_helper.rb:954-965`

#### API-XAWD-060 — A zero counter price answers success without raising anything
- **Why it matters.** A zero counter price is answered 'success' — the buyer believes a counter was sent.
- **Setup.** {{bidUuid}} is active; the row's product.trade_product_uuid (the vendor's quoted line) has no library placeholder; without it the row matches no bid line and the first line-level guard to fire is 587.
- **Steps.** `POST /additional_request/raise_additional_request` with body `{"item_uuid": "{{bidUuid}}", "item_type": "counter_offer_for_bid", "sheets": {"inline_components": {"data": [{"status": {"value": "active", "key": "status"}, "creator_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "creator_quantity"}, "participant_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "participant_quantity"}, "price": {"value": 0, "key": "price"}, "product": {"value": "product", "uuid": "{{productUuid}}", "unit_type": "KG", "event_group_line_item_uuid": "{{lineItemUuid}}", "key": "product"}, "variant": {"uuid": "{{productQualityUuid}}", "key": "variant"}}]}}, "remarks": "QA_Platform_co_{{stamp}}"}`. 1. POST raise_additional_request with price.value = 0.
- **Expected.** Expected: 422. Today get_bid_products_array drops the row because allowed_to_add needs price > 0 (app/controllers/concerns/trade_template_helper.rb:5839-5843), no change is detected and create_additional_request_for_bid returns nil → 200 success with nothing raised (app/helpers/api/additional_requests_helper.rb:189).
- **Oracle.** If 200, confirm no additional_requests row.
- **Trace.** P0 · automate · `EDGE-AWD-060` · `app/controllers/concerns/trade_template_helper.rb:5839-5851`

#### API-XAWD-061 — A negative counter price answers success without raising anything
- **Why it matters.** Negative price must never be accepted as a counter.
- **Setup.** {{bidUuid}} is active.
- **Steps.** `POST /additional_request/raise_additional_request` with body `{"item_uuid": "{{bidUuid}}", "item_type": "counter_offer_for_bid", "sheets": {"inline_components": {"data": [{"status": {"value": "active", "key": "status"}, "creator_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "creator_quantity"}, "participant_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "participant_quantity"}, "price": {"value": -50, "key": "price"}, "product": {"value": "product", "uuid": "{{productUuid}}", "unit_type": "KG", "event_group_line_item_uuid": "{{lineItemUuid}}", "key": "product"}, "variant": {"uuid": "{{productQualityUuid}}", "key": "variant"}}]}}, "remarks": "QA_Platform_co_{{stamp}}"}`. 1. POST raise_additional_request with price.value = -50.
- **Expected.** Same path as zero: row dropped by allowed_to_add (app/controllers/concerns/trade_template_helper.rb:5841), 200 no-op. Expected: 422.
- **Oracle.** No additional_requests row.
- **Trace.** P1 · automate · `EDGE-AWD-061` · `app/controllers/concerns/trade_template_helper.rb:5841`

#### API-XAWD-062 — Countering above the vendor's price depends on the reversal setting
- **Why it matters.** The journey counters with price + 50 — above the bid — which only works because the default allows reversal; flip the config and the journey step fails.
- **Setup.** {{bidUuid}} active on a BUY RFQ; the row carries the vendor's trade_product_uuid (the row's product.trade_product_uuid (the vendor's quoted line) has no library placeholder; without it the row matches no bid line and the first line-level guard to fire is 587); config: RFQ trade config allow_price_reversal_in_counter_offer_in_rfq = false.
- **Steps.** `POST /additional_request/raise_additional_request` with body `{"item_uuid": "{{bidUuid}}", "item_type": "counter_offer_for_bid", "sheets": {"inline_components": {"data": [{"status": {"value": "active", "key": "status"}, "creator_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "creator_quantity"}, "participant_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "participant_quantity"}, "price": {"value": 999999, "key": "price"}, "product": {"value": "product", "uuid": "{{productUuid}}", "unit_type": "KG", "event_group_line_item_uuid": "{{lineItemUuid}}", "key": "product"}, "variant": {"uuid": "{{productQualityUuid}}", "key": "variant"}}]}}, "remarks": "QA_Platform_co_{{stamp}}"}`. 1. POST raise_additional_request with price above the vendor's quoted price (the journey sends bid + 50).
- **Expected.** With the config false: HTTP 422 code 300 'You cannot increase the price' (app/helpers/api/additional_requests_helper.rb:935-949). With the key absent the default is TRUE (app/models/model_helpers/trade_request_model_helper.rb:90-96) and a higher counter is allowed. For auctions the rule follows is_price_increase_allowed?.
- **Oracle.** 422 + code 300 under the config; otherwise 200.
- **Trace.** P0 · automate · `EDGE-AWD-062` · `app/helpers/api/additional_requests_helper.rb:935-952`

#### API-XAWD-063 — A counter offer on a line the vendor did not quote is refused
- **Why it matters.** Negotiating a line the vendor declined creates a price nobody quoted.
- **Setup.** {{bidUuid}} active; the row names a trade product the vendor did not quote (the row's product.trade_product_uuid (the vendor's quoted line) has no library placeholder; without it the row matches no bid line and the first line-level guard to fire is 587).
- **Steps.** `POST /additional_request/raise_additional_request` with body `{"item_uuid": "{{bidUuid}}", "item_type": "counter_offer_for_bid", "sheets": {"inline_components": {"data": [{"status": {"value": "active", "key": "status"}, "creator_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "creator_quantity"}, "participant_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "participant_quantity"}, "price": {"value": 90, "key": "price"}, "product": {"value": "product", "uuid": "{{productUuid}}", "unit_type": "KG", "event_group_line_item_uuid": "{{lineItemUuid}}", "key": "product"}, "variant": {"uuid": "{{productQualityUuid}}", "key": "variant"}}]}}, "remarks": "QA_Platform_co_{{stamp}}"}`. 1. POST raise_additional_request (single, not bulk).
- **Expected.** HTTP 422 code 587 'You cannot raise a counter offer on a non quoted item.' — prev_bid_trade_product blank and not bulk (app/helpers/api/additional_requests_helper.rb:795-800). No additional_requests row; bid status unchanged.
- **Oracle.** 422 + code 587.
- **Trace.** P1 · automate · `EDGE-AWD-063` · `app/helpers/api/additional_requests_helper.rb:795-800`

#### API-XAWD-064 — Countering on a column that is not negotiable is refused
- **Why it matters.** Only negotiable widgets may move in a counter offer.
- **Setup.** {{bidUuid}} active; participant_quantity is not a negotiable widget; the row carries the vendor's trade_product_uuid.
- **Steps.** `POST /additional_request/raise_additional_request` with body `{"item_uuid": "{{bidUuid}}", "item_type": "counter_offer_for_bid", "sheets": {"inline_components": {"data": [{"status": {"value": "active", "key": "status"}, "creator_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "creator_quantity"}, "participant_quantity": {"value": "7", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "participant_quantity"}, "price": {"value": 90, "key": "price"}, "product": {"value": "product", "uuid": "{{productUuid}}", "unit_type": "KG", "event_group_line_item_uuid": "{{lineItemUuid}}", "key": "product"}, "variant": {"uuid": "{{productQualityUuid}}", "key": "variant"}}]}}, "remarks": "QA_Platform_co_{{stamp}}"}`. 1. POST raise_additional_request changing participant_quantity 10 → 7.
- **Expected.** HTTP 422 code 504 'You cannot give a counter offer on these columns.' — is_counter_offer_allowed? rejects a quantity change when participant_quantity is not negotiable (app/models/model_helpers/trade_request_model_helper.rb:512-527), checked at app/helpers/api/additional_requests_helper.rb:168-169.
- **Oracle.** 422 + code 504.
- **Trace.** P1 · automate · `EDGE-AWD-064` · `app/helpers/api/additional_requests_helper.rb:168-169`

#### API-XAWD-065 — A counter offer with no price sheet does not crash
- **Why it matters.** DEFECT-IN-WAITING: bid_products presence is never checked.
- **Setup.** {{bidUuid}} active.
- **Steps.** `POST /additional_request/raise_additional_request` with body `{"item_uuid": "{{bidUuid}}", "item_type": "counter_offer_for_bid", "remarks": "QA_Platform_co_{{stamp}}"}`. 1. POST raise_additional_request with item_uuid/item_type but no sheets.
- **Expected.** Must be 422 code 2. Today params[:bid_products] is nil and is_counter_offer_allowed?(btps, nil) calls nil.map (app/models/model_helpers/trade_request_model_helper.rb:514) → 500.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-AWD-065` · `app/helpers/api/additional_requests_helper.rb:163-169`

#### API-XAWD-066 — A counter-offer row with no product does not crash
- **Why it matters.** Missing nested object in a before_action transform.
- **Setup.** {{bidUuid}} active.
- **Steps.** `POST /additional_request/raise_additional_request` with body `{"item_uuid": "{{bidUuid}}", "item_type": "counter_offer_for_bid", "sheets": {"inline_components": {"data": [{"status": {"value": "active", "key": "status"}, "creator_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "creator_quantity"}, "participant_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "participant_quantity"}, "price": {"value": 90, "key": "price"}, "variant": {"uuid": "{{productQualityUuid}}", "key": "variant"}}]}}, "remarks": "QA_Platform_co_{{stamp}}"}`. 1. POST raise_additional_request with a row that has no product key.
- **Expected.** Must be 422. get_line_item_object reads item[:product][:trade_product_id] (app/controllers/concerns/trade_template_helper.rb:5644) → nil[] → 500 today.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-AWD-066` · `app/controllers/concerns/trade_template_helper.rb:5638-5645`

#### API-XAWD-067 — A counter offer with too many attachments does not crash half-way
- **Why it matters.** DEFECT-IN-WAITING: a render inside a helper that returns normally — the request half-commits.
- **Setup.** {{bidUuid}} active; the row carries a real price change for the vendor's trade product.
- **Steps.** `POST /additional_request/raise_additional_request` with body `{"item_uuid": "{{bidUuid}}", "item_type": "counter_offer_for_bid", "sheets": {"inline_components": {"data": [{"status": {"value": "active", "key": "status"}, "creator_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "creator_quantity"}, "participant_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "participant_quantity"}, "price": {"value": 90, "key": "price"}, "product": {"value": "product", "uuid": "{{productUuid}}", "unit_type": "KG", "event_group_line_item_uuid": "{{lineItemUuid}}", "key": "product"}, "variant": {"uuid": "{{productQualityUuid}}", "key": "variant"}}]}}, "remarks": "QA_Platform_co_{{stamp}}", "attachments": ["QA_Platform_a1_{{stamp}}", "QA_Platform_a2_{{stamp}}", "QA_Platform_a3_{{stamp}}", "QA_Platform_a4_{{stamp}}", "QA_Platform_a5_{{stamp}}", "QA_Platform_a6_{{stamp}}", "QA_Platform_a7_{{stamp}}", "QA_Platform_a8_{{stamp}}", "QA_Platform_a9_{{stamp}}", "QA_Platform_a10_{{stamp}}", "QA_Platform_a11_{{stamp}}"]}`. 1. POST raise_additional_request with 11 attachments.
- **Expected.** Must be a single 422. create_remarks_helper fails and the helper calls render_error_json inside the model loop, marked '! POTENTIAL RENDERING ISSUE' (app/helpers/api/additional_requests_helper.rb:421-428); the action then renders success again → AbstractController::DoubleRenderError (500) with the additional request already saved.
- **Oracle.** Status < 500 and either no request or a request with its remark.
- **Trace.** P1 · automate · `EDGE-AWD-067` · `app/helpers/api/additional_requests_helper.rb:421-428`

#### API-XAWD-068 — Two simultaneous counter offers do not crash
- **Why it matters.** DEFECT-IN-WAITING: the lock is detected but the request is not stopped.
- **Setup.** {{bidUuid}} active; the row carries a real price change.
- **Steps.** `POST /additional_request/raise_additional_request` with body `{"item_uuid": "{{bidUuid}}", "item_type": "counter_offer_for_bid", "sheets": {"inline_components": {"data": [{"status": {"value": "active", "key": "status"}, "creator_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "creator_quantity"}, "participant_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "participant_quantity"}, "price": {"value": 90, "key": "price"}, "product": {"value": "product", "uuid": "{{productUuid}}", "unit_type": "KG", "event_group_line_item_uuid": "{{lineItemUuid}}", "key": "product"}, "variant": {"uuid": "{{productQualityUuid}}", "key": "variant"}}]}}, "remarks": "QA_Platform_co_{{stamp}}"}`. 1. Fire two raise_additional_request calls for the same bid within 3s.
- **Expected.** The second must be 422 'This bid is being revised, please try again later'. Today render_error_json(15, …) at app/controllers/api/additional_requests_controller.rb:15 has no `&& return`, so the action keeps going and renders again → DoubleRenderError 500.
- **Oracle.** One counter offer; the other call < 500.
- **Trace.** P1 · automate · `EDGE-AWD-068` · `app/controllers/api/additional_requests_controller.rb:14-15`

#### API-XAWD-069 — A counter offer to a deactivated vendor
- **Why it matters.** A counter offer nobody can answer holds the bid in 'requested' and blocks awarding it.
- **Setup.** {{bidUuid}} active, but the vendor company's profile was deactivated after bidding.
- **Steps.** `POST /additional_request/raise_additional_request` with body `{"item_uuid": "{{bidUuid}}", "item_type": "counter_offer_for_bid", "sheets": {"inline_components": {"data": [{"status": {"value": "active", "key": "status"}, "creator_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "creator_quantity"}, "participant_quantity": {"value": "10", "configuration": {"unit_type": "KG", "suffix": "KG"}, "key": "participant_quantity"}, "price": {"value": 90, "key": "price"}, "product": {"value": "product", "uuid": "{{productUuid}}", "unit_type": "KG", "event_group_line_item_uuid": "{{lineItemUuid}}", "key": "product"}, "variant": {"uuid": "{{productQualityUuid}}", "key": "variant"}}]}}, "remarks": "QA_Platform_co_{{stamp}}"}`. 1. POST raise_additional_request.
- **Expected.** No vendor-status check exists on this path (app/helpers/api/additional_requests_helper.rb:155-200); the counter goes to bid.user (app/helpers/api/additional_requests_helper.rb:989-1005). Expected product behaviour: refused like awarding is (1124). Never 5xx.
- **Oracle.** Record status; if 200 the bid is stuck in requested.
- **Trace.** P2 · automate · `EDGE-AWD-069` · `app/helpers/api/additional_requests_helper.rb:989-1005`

#### API-XAWD-070 — A bulk counter offer with no event does not crash
- **Why it matters.** The action itself has no nil guard and no authorize call.
- **Setup.** Authenticated buyer.
- **Steps.** `POST /additional_request/raise_bulk_counter_offer` with body `{"change_type": "counter_offer_for_bid", "is_bulk_counter_offer": true, "remarks": "QA_Platform_bulk_{{stamp}}"}`. 1. POST raise_bulk_counter_offer with change_type counter_offer_for_bid and no trade_request_uuid.
- **Expected.** Must be 422 code 4. The before_action returns 4 when it cannot resolve a trade (app/controllers/concerns/trade_template_helper.rb:5555); if that ever passes, TradeRequest.find_by_id(nil).bids (app/controllers/api/additional_requests_controller.rb:39-40) is a nil dereference.
- **Oracle.** Status < 500.
- **Trace.** P0 · automate · `EDGE-AWD-070` · `app/controllers/api/additional_requests_controller.rb:35-56`

#### API-XAWD-071 — An unknown bulk counter-offer type answers success without doing anything
- **Why it matters.** Invalid enum answered with success.
- **Setup.** {{tradeId}} is the closed RFQ with active bids.
- **Steps.** `POST /additional_request/raise_bulk_counter_offer` with body `{"trade_request_uuid": "{{tradeId}}", "change_type": "QA_Platform_bogus", "is_bulk_counter_offer": true, "remarks": "QA_Platform_bulk_{{stamp}}"}`. 1. POST raise_bulk_counter_offer with change_type = "QA_Platform_bogus".
- **Expected.** Today 200 {success:true} with nothing raised (app/controllers/api/additional_requests_controller.rb:38,55). Expected: 422 code 2.
- **Oracle.** No additional_requests rows.
- **Trace.** P2 · automate · `EDGE-AWD-071` · `app/controllers/api/additional_requests_controller.rb:38-55`

#### API-XAWD-072 — A vendor cannot send a bulk counter offer
- **Why it matters.** Security depends entirely on a per-bid helper; a competitor's own bid in the set would be counter-offered by the competitor.
- **Setup.** {{tradeId}} is the closed RFQ with other vendors' active bids; caller is a vendor.
- **Steps.** `POST /additional_request/raise_bulk_counter_offer` with body `{"trade_request_uuid": "{{tradeId}}", "change_type": "counter_offer_for_bid", "is_bulk_counter_offer": true, "sheets": {"inline_components": {"data": []}}, "remarks": "QA_Platform_bulk_{{stamp}}"}`. 1. POST raise_bulk_counter_offer as the vendor.
- **Expected.** HTTP 422 code 101 — the controller has NO authorize call; the only stop is per-bid is_allowed_to_raise_additional_request? → can_view_bid? false for a competitor's bid, raised as error '101' and rendered at app/controllers/api/additional_requests_controller.rb:48-50.
- **Oracle.** 422 + code 101; no requests on other vendors' bids.
- **Trace.** P0 · automate · `EDGE-AWD-072` · `app/controllers/api/additional_requests_controller.rb:35-56`

#### API-XAWD-073 — Revoking with no request list does not crash
- **Why it matters.** DEFECT-IN-WAITING: the revoke action reads requests before any presence check.
- **Setup.** Authenticated buyer.
- **Steps.** `PATCH /additional_request/revoke_additional_requests`. 1. PATCH revoke_additional_requests with {}.
- **Expected.** Must be 422 code 2/4. Today params['requests'].pluck(:id) on nil (app/controllers/api/additional_requests_controller.rb:95-96) → 500.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-AWD-073` · `app/controllers/api/additional_requests_controller.rb:93-96`

#### API-XAWD-074 — Revoking with an invented status does not crash
- **Why it matters.** DEFECT-IN-WAITING: the client chooses the stored status and it is not whitelisted.
- **Setup.** A pending counter offer raised by the caller exists (id supplied by the runner).
- **Steps.** `PATCH /additional_request/revoke_additional_requests` with body `{"requests": [{"id": 999999999, "status": "QA_Platform_bogus"}]}`. 1. PATCH revoke_additional_requests with requests [{id, status: "QA_Platform_bogus"}].
- **Expected.** Must be 422. With a real id, additional_request.status = request['status'] (app/helpers/api/additional_requests_helper.rb:652) assigns an unknown enum value → ArgumentError → 500 (enum status: in_active/active/revoke/draft, app/models/additional_request.rb:53). With the ghost id: code 4.
- **Oracle.** Status < 500 with the real id.
- **Trace.** P1 · automate · `EDGE-AWD-074` · `app/helpers/api/additional_requests_helper.rb:646-652`

#### API-XAWD-075 — Another buyer cannot revoke my counter offer
- **Why it matters.** Revoke restores the vendor's original price; it belongs to the requester.
- **Setup.** A pending counter offer raised by buyer A; caller is buyer B (not requester, not owner, not super admin).
- **Steps.** `PATCH /additional_request/revoke_additional_requests` with body `{"requests": [{"id": 999999999, "status": "revoke"}]}`. 1. PATCH revoke_additional_requests as B.
- **Expected.** HTTP 422 code 5 'Not authorized' with the real id (app/controllers/api/additional_requests_controller.rb:199-203).
- **Oracle.** 422 + code 5.
- **Trace.** P1 · automate · `EDGE-AWD-075` · `app/controllers/api/additional_requests_controller.rb:199-203`

#### API-XAWD-076 — An unknown answer to a counter offer answers success without deciding
- **Why it matters.** An invalid decision is acknowledged as success; the vendor believes they answered.
- **Setup.** A counter offer is pending to the caller (vendor); the id is supplied by the runner.
- **Steps.** `PATCH /additional_request/resolve_additional_request` with body `{"item_type": "counter_offer_for_bid", "resolution": "maybe", "request_ids": [999999999]}`. 1. PATCH resolve_additional_request with resolution = "maybe".
- **Expected.** Expected 422. With a real id today: resolve_additional_request_for_counter_offer matches neither 'accepted' nor 'rejected' and renders success (app/helpers/additional_request_resolution_helper.rb:597-609) — the request stays pending. With the ghost id: code 4.
- **Oracle.** Request still 'requested' after a 200.
- **Trace.** P1 · automate · `EDGE-AWD-076` · `app/helpers/additional_request_resolution_helper.rb:597-609`

#### API-XAWD-077 — The buyer cannot accept its own counter offer for the vendor
- **Why it matters.** Accepting on the vendor's behalf would commit the vendor to a price they never agreed.
- **Setup.** A counter offer is pending to the vendor; caller is the BUYER who raised it.
- **Steps.** `PATCH /additional_request/resolve_additional_request` with body `{"item_type": "counter_offer_for_bid", "resolution": "accepted", "request_ids": [999999999]}`. 1. As the buyer, PATCH resolve_additional_request with resolution accepted.
- **Expected.** With the real id: HTTP 422 code 5 — the buyer is not requested_from and the buyer's allowed companies exclude requesting_from_company_id (the vendor) (app/controllers/api/additional_requests_controller.rb:153-162). Ghost id: code 4.
- **Oracle.** 422 + code 5; bid price unchanged.
- **Trace.** P0 · automate · `EDGE-AWD-077` · `app/controllers/api/additional_requests_controller.rb:153-162`

#### API-XAWD-078 — Accepting a counter offer twice is refused
- **Why it matters.** Double-accept must not re-run update_bid_action_helper and create a second revised bid.
- **Setup.** The vendor already accepted this counter offer.
- **Steps.** `PATCH /additional_request/resolve_additional_request` with body `{"item_type": "counter_offer_for_bid", "resolution": "accepted", "request_ids": [999999999]}`. 1. PATCH resolve_additional_request accepted again.
- **Expected.** HTTP 422 code 4 — the lookup is status active + resolution requested (app/controllers/api/additional_requests_controller.rb:146), so a resolved request is not found.
- **Oracle.** 422 + code 4; one revised bid.
- **Trace.** P1 · automate · `EDGE-AWD-078` · `app/controllers/api/additional_requests_controller.rb:146-152`

## 7. Convert RFQ to auction

#### API-XAWD-079 — A trade uuid under trade_request_id is not found
- **Why it matters.** The existing library conversion cases (API-CONV-*, AUC-CONV-*) send trade_request_id with a uuid, so every one of them lands on 95 regardless of the rule it describes.
- **Setup.** {{tradeId}} is the closed RFQ.
- **Steps.** `POST /trade/move_to_auction` with body `{"data": [{"product": {"key": "product", "value": "product", "uuid": "{{productUuid}}", "event_group_line_item_uuid": "{{lineItemUuid}}", "unit_type": "KG"}, "creator_quantity": {"key": "creator_quantity", "value": 10, "configuration": {"suffix": "KG"}}, "variant": {"uuid": "{{productQualityUuid}}"}, "order": 1}], "configurations": {"rfx_mode": "rfq_then_auction", "auction_config": "rank", "auction_closing_mode": "lot_based", "title": "QA_Platform_Auction_{{stamp}}", "closing_mode": "single"}, "status": "active", "audience_company_uuids": ["{{vendorUuid}}"], "creation_flow_type": "quick_flow", "use_rfq_quotes_as_bids": true, "allow_tna_vendors_to_bid": true, "transfer_weights": false, "trade_request_id": "{{tradeId}}"}`. 1. POST move_to_auction with trade_request_id = "{{tradeId}}" (a uuid under an *_id key).
- **Expected.** HTTP 422 code 95 'Trade Request not found' — only keys containing 'uuid' are decoded (app/controllers/concerns/params_auth.rb:74-75), so where(id: '<uuid>') finds nothing (app/controllers/api/trade_controller.rb:965-969). No child trade_requests row.
- **Oracle.** 422 + code 95.
- **Trace.** P1 · automate · `EDGE-AWD-079` · `app/controllers/api/trade_controller.rb:965-969`

#### API-XAWD-080 — An unpublished RFQ cannot be converted
- **Why it matters.** Converting an event no vendor has seen.
- **Setup.** {{tradeId}} is an RFQ stage still in draft (event not activated).
- **Steps.** `POST /trade/move_to_auction` with body `{"trade_request_uuid": "{{tradeId}}", "data": [{"product": {"key": "product", "value": "product", "uuid": "{{productUuid}}", "event_group_line_item_uuid": "{{lineItemUuid}}", "unit_type": "KG"}, "creator_quantity": {"key": "creator_quantity", "value": 10, "configuration": {"suffix": "KG"}}, "variant": {"uuid": "{{productQualityUuid}}"}, "order": 1}], "configurations": {"rfx_mode": "rfq_then_auction", "auction_config": "rank", "auction_closing_mode": "lot_based", "title": "QA_Platform_Auction_{{stamp}}", "closing_mode": "single"}, "status": "active", "audience_company_uuids": ["{{vendorUuid}}"], "creation_flow_type": "quick_flow", "use_rfq_quotes_as_bids": true, "allow_tna_vendors_to_bid": true, "transfer_weights": false}`. 1. POST move_to_auction.
- **Expected.** HTTP 422 code 95 — TradeRequest.active excludes draft (app/controllers/api/trade_controller.rb:965-969). No child trade_requests row.
- **Oracle.** 422 + code 95.
- **Trace.** P0 · automate · `EDGE-AWD-080` · `app/controllers/api/trade_controller.rb:965`

#### API-XAWD-081 — Converting a technical round is not refused by type
- **Why it matters.** DEFECT-IN-WAITING: nothing names the RFQ as the only legal source; a technical round could become an 'auction' with no prices to start from.
- **Setup.** {{tradeId}} is replaced by the event's RFP (technical) stage; latest event version; caller owns it.
- **Steps.** `POST /trade/move_to_auction` with body `{"trade_request_uuid": "{{tradeId}}", "data": [{"product": {"key": "product", "value": "product", "uuid": "{{productUuid}}", "event_group_line_item_uuid": "{{lineItemUuid}}", "unit_type": "KG"}, "creator_quantity": {"key": "creator_quantity", "value": 10, "configuration": {"suffix": "KG"}}, "variant": {"uuid": "{{productQualityUuid}}"}, "order": 1}], "configurations": {"rfx_mode": "rfq_then_auction", "auction_config": "rank", "auction_closing_mode": "lot_based", "title": "QA_Platform_Auction_{{stamp}}", "closing_mode": "single"}, "status": "active", "audience_company_uuids": ["{{vendorUuid}}"], "creation_flow_type": "quick_flow", "use_rfq_quotes_as_bids": true, "allow_tna_vendors_to_bid": true, "transfer_weights": false}`. 1. POST move_to_auction on the RFP.
- **Expected.** Expected: refused. The controller never checks rfx_mode — only active, latest?, no existing child, company and auctioning? (app/controllers/api/trade_controller.rb:963-979); TradeRequestPolicy#move_to_auction? is create? && allowed_to_view_event? (app/policies/trade_request_policy.rb:158-160). Record what RfqToAuction::CreateService does; never 5xx.
- **Oracle.** Status < 500; if 200 an auction child hangs off the RFP.
- **Trace.** P0 · automate · `EDGE-AWD-081` · `app/controllers/api/trade_controller.rb:963-979`

#### API-XAWD-082 — A vendor cannot convert an RFQ
- **Why it matters.** Wrong actor on a call that creates a trade; also documents the pre-authorize information leak.
- **Setup.** {{tradeId}} is the closed RFQ; caller is a vendor.
- **Steps.** `POST /trade/move_to_auction` with body `{"trade_request_uuid": "{{tradeId}}", "data": [{"product": {"key": "product", "value": "product", "uuid": "{{productUuid}}", "event_group_line_item_uuid": "{{lineItemUuid}}", "unit_type": "KG"}, "creator_quantity": {"key": "creator_quantity", "value": 10, "configuration": {"suffix": "KG"}}, "variant": {"uuid": "{{productQualityUuid}}"}, "order": 1}], "configurations": {"rfx_mode": "rfq_then_auction", "auction_config": "rank", "auction_closing_mode": "lot_based", "title": "QA_Platform_Auction_{{stamp}}", "closing_mode": "single"}, "status": "active", "audience_company_uuids": ["{{vendorUuid}}"], "creation_flow_type": "quick_flow", "use_rfq_quotes_as_bids": true, "allow_tna_vendors_to_bid": true, "transfer_weights": false}`. 1. POST move_to_auction as the vendor.
- **Expected.** HTTP 422 code 455 — authorize old_trade → TradeRequestPolicy#move_to_auction? fails (app/controllers/api/trade_controller.rb:975, app/controllers/concerns/api_auth.rb:117-118). Note 95/101/94 are checked BEFORE authorize, so a vendor can probe which RFQs already have auctions (94) by id.
- **Oracle.** 422 + code 455.
- **Trace.** P0 · automate · `EDGE-AWD-082` · `app/controllers/api/trade_controller.rb:971-975`

#### API-XAWD-083 — An auction line with no unit is refused
- **Why it matters.** Every auction line needs a unit to rank on.
- **Setup.** {{tradeId}} is the closed RFQ; caller owns it.
- **Steps.** `POST /trade/move_to_auction` with body `{"trade_request_uuid": "{{tradeId}}", "data": [{"product": {"uuid": "{{productUuid}}", "event_group_line_item_uuid": "{{lineItemUuid}}"}, "creator_quantity": {"value": 10}, "order": 1}], "configurations": {"rfx_mode": "rfq_then_auction", "auction_config": "rank", "auction_closing_mode": "lot_based", "title": "QA_Platform_Auction_{{stamp}}", "closing_mode": "single"}, "status": "active", "audience_company_uuids": ["{{vendorUuid}}"], "creation_flow_type": "quick_flow", "use_rfq_quotes_as_bids": true, "allow_tna_vendors_to_bid": true, "transfer_weights": false}`. 1. POST move_to_auction with a data row whose product has no unit_type and no creator_quantity suffix.
- **Expected.** HTTP 422 code 574 'Unit cannot be blank' (app/controllers/concerns/trade_template_helper.rb:1393-1395). No child trade_requests row.
- **Oracle.** 422 + code 574.
- **Trace.** P1 · automate · `EDGE-AWD-083` · `app/controllers/concerns/trade_template_helper.rb:1393-1395`

#### API-XAWD-084 — An auction line with an unknown unit is refused
- **Why it matters.** Units are looked up in the workspace; a stranger unit must be named in the error.
- **Setup.** {{tradeId}} is the closed RFQ; caller owns it.
- **Steps.** `POST /trade/move_to_auction` with body `{"trade_request_uuid": "{{tradeId}}", "data": [{"product": {"uuid": "{{productUuid}}", "event_group_line_item_uuid": "{{lineItemUuid}}", "unit_type": "QA_PLATFORM_UNIT"}, "creator_quantity": {"value": 10, "configuration": {"suffix": "QA_PLATFORM_UNIT"}}, "order": 1}], "configurations": {"rfx_mode": "rfq_then_auction", "auction_config": "rank", "auction_closing_mode": "lot_based", "title": "QA_Platform_Auction_{{stamp}}", "closing_mode": "single"}, "status": "active", "audience_company_uuids": ["{{vendorUuid}}"], "creation_flow_type": "quick_flow", "use_rfq_quotes_as_bids": true, "allow_tna_vendors_to_bid": true, "transfer_weights": false}`. 1. POST move_to_auction with unit 'QA_PLATFORM_UNIT'.
- **Expected.** HTTP 422 code 495 with message 'The unit qa_platform_unit is not present' (app/controllers/concerns/trade_template_helper.rb:1402-1415). No child trade_requests row.
- **Oracle.** 422 + code 495 and the message names the unit.
- **Trace.** P1 · automate · `EDGE-AWD-084` · `app/controllers/concerns/trade_template_helper.rb:1402-1415`

#### API-XAWD-085 — Converting with no lines does not crash
- **Why it matters.** An auction with no lines.
- **Setup.** {{tradeId}} is the closed RFQ; caller owns it.
- **Steps.** `POST /trade/move_to_auction` with body `{"trade_request_uuid": "{{tradeId}}", "data": [], "configurations": {"rfx_mode": "rfq_then_auction", "auction_config": "rank", "auction_closing_mode": "lot_based", "title": "QA_Platform_Auction_{{stamp}}", "closing_mode": "single"}, "status": "active", "audience_company_uuids": ["{{vendorUuid}}"], "creation_flow_type": "quick_flow", "use_rfq_quotes_as_bids": true, "allow_tna_vendors_to_bid": true, "transfer_weights": false}`. 1. POST move_to_auction with data [].
- **Expected.** Expected 422. transform_trade_product defaults data to [] (app/controllers/api/trade_controller.rb:986 → app/controllers/concerns/trade_template_helper.rb:1389) and trade_products.pluck(:id) is [] (app/controllers/api/trade_controller.rb:996-997); what RfqToAuction::CreateService does with zero products is unguarded. Never 5xx.
- **Oracle.** Status < 500; if 200, the auction has zero trade products.
- **Trace.** P1 · automate · `EDGE-AWD-085` · `app/controllers/api/trade_controller.rb:996-999`

#### API-XAWD-086 — A knockout auction cannot start above the RFQ L1
- **Why it matters.** Knockout/dutch availability: a start above L1 makes the first round meaningless. CONFIG-dependent.
- **Setup.** {{tradeId}} is the closed RFQ with valid bids; config: company rfx_project_enabled; the L1 RFQ sum total is known.
- **Steps.** `POST /trade/move_to_auction` with body `{"trade_request_uuid": "{{tradeId}}", "data": [{"product": {"key": "product", "value": "product", "uuid": "{{productUuid}}", "event_group_line_item_uuid": "{{lineItemUuid}}", "unit_type": "KG"}, "creator_quantity": {"key": "creator_quantity", "value": 10, "configuration": {"suffix": "KG"}}, "variant": {"uuid": "{{productQualityUuid}}"}, "order": 1}], "configurations": {"rfx_mode": "rfq_then_auction", "auction_config": "knockout", "title": "QA_Platform_Auction_{{stamp}}"}, "status": "active", "audience_company_uuids": ["{{vendorUuid}}"], "creation_flow_type": "quick_flow", "use_rfq_quotes_as_bids": true, "allow_tna_vendors_to_bid": true, "transfer_weights": false, "auction_config": "knockout", "bulk_price": 999999999}`. 1. POST move_to_auction with auction_config knockout and bulk_price far above L1.
- **Expected.** HTTP 422 code 966 'Starting price cannot be more than the lowest RFQ (L1) Sum Total' (app/controllers/concerns/trade_controller_helper.rb:5813-5815). Only when rfx_project_enabled (app/controllers/api/trade_controller.rb:989-994); otherwise no check. No child trade_requests row.
- **Oracle.** 422 + code 966 with the config on.
- **Trace.** P1 · automate · `EDGE-AWD-086` · `app/controllers/concerns/trade_controller_helper.rb:5813-5815`

#### API-XAWD-087 — A dutch auction cannot end above the RFQ L1
- **Why it matters.** Dutch auctions descend to end_price; an end above L1 lets the auction close above what was already offered.
- **Setup.** As above; auction_config dutch.
- **Steps.** `POST /trade/move_to_auction` with body `{"trade_request_uuid": "{{tradeId}}", "data": [{"product": {"key": "product", "value": "product", "uuid": "{{productUuid}}", "event_group_line_item_uuid": "{{lineItemUuid}}", "unit_type": "KG"}, "creator_quantity": {"key": "creator_quantity", "value": 10, "configuration": {"suffix": "KG"}}, "variant": {"uuid": "{{productQualityUuid}}"}, "order": 1}], "configurations": {"rfx_mode": "rfq_then_auction", "auction_config": "dutch", "title": "QA_Platform_Auction_{{stamp}}"}, "status": "active", "audience_company_uuids": ["{{vendorUuid}}"], "creation_flow_type": "quick_flow", "use_rfq_quotes_as_bids": true, "allow_tna_vendors_to_bid": true, "transfer_weights": false, "auction_config": "dutch", "bulk_price": 1, "end_price": 999999999}`. 1. POST move_to_auction with auction_config dutch, a valid bulk_price, and end_price above L1.
- **Expected.** HTTP 422 code 968 'End price cannot be more than the lowest RFQ (L1) Sum Total' (app/controllers/concerns/trade_controller_helper.rb:5817-5818), end_price read only for dutch (app/controllers/api/trade_controller.rb:990). No child trade_requests row.
- **Oracle.** 422 + code 968 with rfx_project_enabled.
- **Trace.** P1 · automate · `EDGE-AWD-087` · `app/controllers/concerns/trade_controller_helper.rb:5817-5818`

#### API-XAWD-088 — An auction that ends before it starts
- **Why it matters.** An auction that ends before it starts would close instantly with the RFQ bids copied in as final.
- **Setup.** {{tradeId}} is the closed RFQ; caller owns it.
- **Steps.** `POST /trade/move_to_auction` with body `{"trade_request_uuid": "{{tradeId}}", "data": [{"product": {"key": "product", "value": "product", "uuid": "{{productUuid}}", "event_group_line_item_uuid": "{{lineItemUuid}}", "unit_type": "KG"}, "creator_quantity": {"key": "creator_quantity", "value": 10, "configuration": {"suffix": "KG"}}, "variant": {"uuid": "{{productQualityUuid}}"}, "order": 1}], "configurations": {"rfx_mode": "rfq_then_auction", "auction_config": "rank", "title": "QA_Platform_Auction_{{stamp}}", "bid_start_time": 4102444800, "bid_end_time": 4102441200, "extra_closing_time": 4102441200}, "status": "active", "audience_company_uuids": ["{{vendorUuid}}"], "creation_flow_type": "quick_flow", "use_rfq_quotes_as_bids": true, "allow_tna_vendors_to_bid": true, "transfer_weights": false}`. 1. POST move_to_auction with bid_end_time one hour before bid_start_time.
- **Expected.** Expected 422. set_trade_schedules only runs validate_rfp_rfq_bid_end_time (RFP vs RFQ ordering, app/controllers/concerns/trade_controller_helper.rb:500-503, 643+) — it does not compare the auction's own start and end. Never 5xx.
- **Oracle.** Status < 500; if 200, inspect the trade_schedules.
- **Trace.** P1 · automate · `EDGE-AWD-088` · `app/controllers/concerns/trade_controller_helper.rb:500-530`

## 8. Award proposal — creating it

#### API-XAWD-089 — A proposal on a non-existent event is refused
- **Why it matters.** Well-formed unknown id.
- **Setup.** Authenticated buyer.
- **Steps.** `POST /proposal` with body `{"event_group_uuid": "Z2dnWmdaUWtnZw=="}`. 1. POST /proposal with event_group_uuid Z2dnWmdaUWtnZw==.
- **Expected.** HTTP 422 code 2 (app/controllers/api/proposal_controller.rb:50).
- **Oracle.** 422 + code 2.
- **Trace.** P1 · automate · `EDGE-AWD-089` · `app/controllers/api/proposal_controller.rb:50`

#### API-XAWD-090 — An unpublished event cannot be awarded
- **Why it matters.** Awarding an event nobody bid on.
- **Setup.** {{eventGroupUuid}} is a DRAFT event group (never activated).
- **Steps.** `POST /proposal` with body `{"event_group_uuid": "{{eventGroupUuid}}"}`. 1. POST /proposal.
- **Expected.** HTTP 422 code 2 — EventGroup.active excludes draft (enum status active:1, draft:2; app/controllers/api/proposal_controller.rb:49-50).
- **Oracle.** 422 + code 2.
- **Trace.** P0 · automate · `EDGE-AWD-090` · `app/controllers/api/proposal_controller.rb:49-50`

#### API-XAWD-091 — A vendor cannot open an award
- **Why it matters.** A vendor opening an award on its own event.
- **Setup.** {{eventGroupUuid}} is the sandbox event; caller is a vendor.
- **Steps.** `POST /proposal` with body `{"event_group_uuid": "{{eventGroupUuid}}"}`. 1. POST /proposal as the vendor.
- **Expected.** HTTP 422 code 455 — EventGroupPolicy#create_proposal? → update? requires the event's company in Current.allowed_companies and create_record permission (app/policies/event_group_policy.rb:34-37,68-70).
- **Oracle.** 422 + code 455.
- **Trace.** P0 · automate · `EDGE-AWD-091` · `app/policies/event_group_policy.rb:68-70`

#### API-XAWD-092 — Opening the award twice returns the same draft
- **Why it matters.** Double-click on 'Award' must not fork two drafts.
- **Setup.** {{eventGroupUuid}} is closed and awardable; the caller already has a draft proposal on it.
- **Steps.** `POST /proposal` with body `{"event_group_uuid": "{{eventGroupUuid}}"}`. 1. POST /proposal twice.
- **Expected.** 200 both times with the SAME proposal uuid — create_proposal returns the existing draft before any awarding check (app/helpers/api/proposal_helper.rb:25-28).
- **Oracle.** Both responses carry one uuid; one draft row.
- **Trace.** P1 · automate · `EDGE-AWD-092` · `app/helpers/api/proposal_helper.rb:25-28`

#### API-XAWD-093 — Awarding during bidding is only blocked by configuration
- **Why it matters.** 'Award before close' is guarded only by an opt-in trade config — by default a buyer can start allocating while vendors are still bidding.
- **Setup.** {{eventGroupUuid}}'s latest commercial stage is still LIVE (before bid_end_time); the caller has no draft.
- **Steps.** `POST /proposal` with body `{"event_group_uuid": "{{eventGroupUuid}}"}`. 1. POST /proposal during bidding.
- **Expected.** Only when the stage config is_order_allowed_to_close_in_extra_closing_time_only is true is this refused: HTTP 422 code 720 'You are not allowed to award in bidding time' (app/controllers/concerns/event_group_controller_helper.rb:644-645, app/helpers/api/proposal_helper.rb:29-30). With the config off, a draft is created during bidding and add_response has no time check either.
- **Oracle.** Config on → 720; config off → 200 draft (record it).
- **Trace.** P0 · automate · `EDGE-AWD-093` · `app/controllers/concerns/event_group_controller_helper.rb:629-648`

#### API-XAWD-094 — An award for a lot that does not exist
- **Why it matters.** A lot-scoped draft for a phantom lot is a trap for the next call.
- **Setup.** {{eventGroupUuid}} is closed, not lot-based.
- **Steps.** `POST /proposal` with body `{"event_group_uuid": "{{eventGroupUuid}}", "lot_no": "QA_Platform_lot_{{stamp}}"}`. 1. POST /proposal with lot_no = "QA_Platform_lot_{{stamp}}".
- **Expected.** Expected 422. latest_commercial_stage_for_lot returns nil for an unknown lot and is_awarding_allowed? tolerates a nil stage (app/controllers/concerns/event_group_controller_helper.rb:630-644), so a draft is created for a lot that does not exist; the later add_response then calls nil.bids (app/helpers/api/proposal_helper.rb:1041). Never 5xx here.
- **Oracle.** Status < 500; if 200 note the lot_no stored.
- **Trace.** P2 · automate · `EDGE-AWD-094` · `app/controllers/concerns/event_group_controller_helper.rb:630-633`

#### API-XAWD-095 — Allocating on an event with no pricing round does not crash
- **Why it matters.** DEFECT-IN-WAITING: create does not require a commercial stage but every allocation does.
- **Setup.** {{eventGroupUuid}} has only an RFP stage (no RFQ/auction); a draft proposal {{proposalUuid}} was created on it.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "add", "egli_data": {"{{lineItemUuid}}": {"awarded_quantity": 10}}}}}`. 1. POST /proposal/{{proposalUuid}}/add_response with the journey body.
- **Expected.** Must be 422. extract_initial_params does latest_stage.bids with latest_commercial_stage nil (app/helpers/api/proposal_helper.rb:1040-1041) → 500 today; POST /proposal happily creates the draft (app/helpers/api/proposal_helper.rb:21-39).
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-AWD-095` · `app/helpers/api/proposal_helper.rb:1037-1041`

## 9. Award allocation — add_response

#### API-XAWD-096 — Allocating with no responses does not crash
- **Why it matters.** DEFECT-IN-WAITING: the controller passes params[:responses] straight through (app/controllers/api/proposal_controller.rb:60-64).
- **Setup.** {{proposalUuid}} is the caller's draft proposal on a closed event.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=`. 1. POST add_response with {}.
- **Expected.** Must be 422 code 2. Today extract_initial_params calls responses.values on nil (app/helpers/api/proposal_helper.rb:1051) and add_response_in_proposal then responses.keys (app/helpers/api/proposal_helper.rb:55) → 500.
- **Oracle.** Status < 500; proposals.responses_hash unchanged.
- **Trace.** P0 · automate · `EDGE-AWD-096` · `app/helpers/api/proposal_helper.rb:1051`

#### API-XAWD-097 — A vendor entry that is not an object does not crash
- **Why it matters.** Scalar where an object is expected.
- **Setup.** {{proposalUuid}} is the caller's draft.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": "add"}}`. 1. POST add_response with responses = {"<vendor>": "add"}.
- **Expected.** Must be 422. responses[vendor_id].permit! on a String (app/helpers/api/proposal_helper.rb:97) → NoMethodError → 500 today.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-AWD-097` · `app/helpers/api/proposal_helper.rb:95-98`

#### API-XAWD-098 — Awarding a vendor without naming lines does not crash
- **Why it matters.** DEFECT-IN-WAITING: the most natural 'award the vendor, all lines' shorthand crashes.
- **Setup.** {{proposalUuid}} is the caller's draft.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "add"}}}`. 1. POST add_response with responses {<vendor>: {action: add}} — no egli_data, no egli_uuids.
- **Expected.** Must be 422 (683 'Proposal cannot be empty' or 2). Today egli_ids is nil and process_vendor does (egli_ids - eg_line_items.map(&:id)) (app/helpers/api/proposal_helper.rb:1082-1084) → NoMethodError → 500.
- **Oracle.** Status < 500; proposals.responses_hash unchanged.
- **Trace.** P0 · automate · `EDGE-AWD-098` · `app/helpers/api/proposal_helper.rb:1082-1084`

#### API-XAWD-099 — Awarding a line item not on this event is refused
- **Why it matters.** A line item from another event (or none) must not be awarded into this proposal.
- **Setup.** {{proposalUuid}} is the caller's draft.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "add", "egli_data": {"Z2dnWmdaUWtnZw==": {"awarded_quantity": 10}}}}}`. 1. POST add_response with egli_data key Z2dnWmdaUWtnZw==.
- **Expected.** HTTP 422 code 738 (app/helpers/api/proposal_helper.rb:1084). proposals.responses_hash unchanged.
- **Oracle.** 422 + code 738.
- **Trace.** P0 · automate · `EDGE-AWD-099` · `app/helpers/api/proposal_helper.rb:1084`

#### API-XAWD-100 — A vendor who never bid cannot be awarded
- **Why it matters.** Award with no bids: the PO would carry no price.
- **Setup.** {{proposalUuid}} is the caller's draft; {{vendorUuid}} was invited but never bid.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "add", "egli_data": {"{{lineItemUuid}}": {"awarded_quantity": 10}}}}}`. 1. POST add_response for that vendor.
- **Expected.** HTTP 422 code 826 — no bid in Bid::VALID_STATUSES_TO_RANK (active/selected/requested) on the latest stage (app/helpers/api/proposal_helper.rb:1041-1042,1085-1086). proposals.responses_hash unchanged.
- **Oracle.** 422 + code 826.
- **Trace.** P0 · automate · `EDGE-AWD-100` · `app/helpers/api/proposal_helper.rb:1085-1086`

#### API-XAWD-101 — A vendor absent from the latest round cannot be awarded
- **Why it matters.** The error seen live. Awarding an earlier-stage price after an auction discards the auction's result.
- **Setup.** The RFQ was converted to an auction; {{vendorUuid}} bid on the RFQ but has no bid in the auction (latest stage).
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "add", "egli_data": {"{{lineItemUuid}}": {"awarded_quantity": 10}}}}}`. 1. POST add_response for that vendor.
- **Expected.** HTTP 422 code 826 'Awarded vendor is not present in the latest stage' — only latest_commercial_stage bids are considered (app/helpers/api/proposal_helper.rb:1040-1042,1086).
- **Oracle.** 422 + code 826.
- **Trace.** P0 · automate · `EDGE-AWD-101` · `app/helpers/api/proposal_helper.rb:1040-1042`

#### API-XAWD-102 — A vendor whose bid was withdrawn cannot be awarded
- **Why it matters.** A regretted/withdrawn vendor must not be awarded by API even if the UI hides them.
- **Setup.** {{vendorUuid}}'s latest-stage bid was revoked or rejected.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "add", "egli_data": {"{{lineItemUuid}}": {"awarded_quantity": 10}}}}}`. 1. POST add_response for that vendor.
- **Expected.** HTTP 422 code 826 — revoked/rejected are outside VALID_STATUSES_TO_RANK (app/models/bid.rb:163; app/helpers/api/proposal_helper.rb:1086).
- **Oracle.** 422 + code 826.
- **Trace.** P1 · automate · `EDGE-AWD-102` · `app/helpers/api/proposal_helper.rb:1086`

#### API-XAWD-103 — A line the vendor did not quote cannot be awarded to them
- **Why it matters.** Awarding a line at a price the vendor never gave.
- **Setup.** Two-line event; {{vendorUuid}} quoted line A only; the body awards line B ({{lineItemUuid}}).
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "add", "egli_data": {"{{lineItemUuid}}": {"awarded_quantity": 10}}}}}`. 1. POST add_response for line B.
- **Expected.** HTTP 422 code 715 'Bid not present on this line item' — egli.precomputed_data[company_id] blank (app/helpers/api/proposal_helper.rb:1308).
- **Oracle.** 422 + code 715.
- **Trace.** P0 · automate · `EDGE-AWD-103` · `app/helpers/api/proposal_helper.rb:1308`

#### API-XAWD-104 — An unknown allocation action silently removes the award
- **Why it matters.** DEFECT-IN-WAITING: an invalid enum silently UN-awards a line.
- **Setup.** {{proposalUuid}} already awards {{lineItemUuid}} to {{vendorUuid}}.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "QA_Platform_bogus", "egli_data": {"{{lineItemUuid}}": {"awarded_quantity": 10}}}}}`. 1. POST add_response with action = "QA_Platform_bogus".
- **Expected.** Expected 422 code 2. Today every action that is not 'add' takes the remove branch: validations are skipped (they return unless action == 'add', app/helpers/api/proposal_helper.rb:1245,1288), the line is subtracted from the vendor's set and totals are decremented (app/helpers/api/proposal_helper.rb:1097,1109-1121).
- **Oracle.** If 200, the line is gone from the proposal — record it.
- **Trace.** P0 · automate · `EDGE-AWD-104` · `app/helpers/api/proposal_helper.rb:1097`

#### API-XAWD-105 — Awarding a hair over the line quantity is refused
- **Why it matters.** The smallest over-award; there is no rounding tolerance on this branch.
- **Setup.** Config: is_partial_awarding_enabled on, is_over_awarding_allowed off; line quantity 10.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "add", "egli_data": {"{{lineItemUuid}}": {"awarded_quantity": 10.001}}}}}`. 1. POST add_response with awarded_quantity 10.001.
- **Expected.** HTTP 422 code 561 'You cannot select bid with more than requested quantity.' — sum + awarded > egli_quantity (app/helpers/api/proposal_helper.rb:836-837). proposals.responses_hash unchanged.
- **Oracle.** 422 + code 561.
- **Trace.** P0 · automate · `EDGE-AWD-105` · `app/helpers/api/proposal_helper.rb:836-837`

#### API-XAWD-106 — Awarding exactly the line quantity is accepted
- **Why it matters.** Exactly-at-limit is allowed; the pair with the case above pins the comparison as '>' not '>='.
- **Setup.** Config: is_partial_awarding_enabled on; line quantity 10; nothing else awarded.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "add", "egli_data": {"{{lineItemUuid}}": {"awarded_quantity": 10}}}}}`. 1. POST add_response with awarded_quantity 10.
- **Expected.** 200 — 0 + 10 is not > 10 (app/helpers/api/proposal_helper.rb:837).
- **Oracle.** 200 and the proposal shows 10.
- **Trace.** P1 · automate · `EDGE-AWD-106` · `app/helpers/api/proposal_helper.rb:837`

#### API-XAWD-107 — Over-awarding is unchecked when partial and over-awarding are both off
- **Why it matters.** DEFECT-IN-WAITING: the quantity ceiling exists only when one of two opt-in configs is on; the journey's own awarded_quantity lands on this branch by default.
- **Setup.** Config: is_partial_awarding_enabled OFF and is_over_awarding_allowed OFF (the defaults); line quantity 10.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "add", "egli_data": {"{{lineItemUuid}}": {"awarded_quantity": 999999}}}}}`. 1. POST add_response with awarded_quantity 999999.
- **Expected.** Expected 422 code 561. Today when awarded_quantity is supplied and neither config is on, none of the if/elsif branches applies and validate_awarding_quantity returns nil (app/helpers/api/proposal_helper.rb:820-839) — the value is stored unchecked.
- **Oracle.** If 200, responses_hash stores 999999 for a line of 10.
- **Trace.** P0 · automate · `EDGE-AWD-107` · `app/helpers/api/proposal_helper.rb:820-839`

#### API-XAWD-108 — A negative award quantity is not refused
- **Why it matters.** DEFECT-IN-WAITING: no lower bound (the existing AWD-PART-001/002 expect a refusal the code does not make).
- **Setup.** Config: is_partial_awarding_enabled on.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "add", "egli_data": {"{{lineItemUuid}}": {"awarded_quantity": -5}}}}}`. 1. POST add_response with awarded_quantity -5.
- **Expected.** Expected 422. The only comparison is sum + awarded > egli_quantity (app/helpers/api/proposal_helper.rb:837); -5 passes. get_previously_fulfilled_quantity later clamps negatives to 0 for OTHER vendors (app/helpers/api/proposal_helper.rb:1327-1328), which lets the next vendor be awarded the full quantity on top.
- **Oracle.** If 200, the proposal stores -5.
- **Trace.** P0 · automate · `EDGE-AWD-108` · `app/helpers/api/proposal_helper.rb:1324-1333`

#### API-XAWD-109 — A zero award quantity is not refused
- **Why it matters.** Zero awards create empty POs.
- **Setup.** Config: is_partial_awarding_enabled on.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "add", "egli_data": {"{{lineItemUuid}}": {"awarded_quantity": 0}}}}}`. 1. POST add_response with awarded_quantity 0.
- **Expected.** Expected 422. 0 passes the ceiling check (app/helpers/api/proposal_helper.rb:837) and — note — awarded_quantity_provided uses .present?, which is TRUE for 0 (app/helpers/api/proposal_helper.rb:820). A vendor 'awarded' 0 still becomes a PO recipient.
- **Oracle.** If 200, the vendor is in responses_hash with 0.
- **Trace.** P1 · automate · `EDGE-AWD-109` · `app/helpers/api/proposal_helper.rb:820-837`

#### API-XAWD-110 — A word as the award quantity
- **Why it matters.** Validated value and stored value differ.
- **Setup.** Config: is_partial_awarding_enabled on.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "add", "egli_data": {"{{lineItemUuid}}": {"awarded_quantity": "ten"}}}}}`. 1. POST add_response with awarded_quantity "ten".
- **Expected.** Expected 422. safe_to_f('ten') is 0.0 (app/helpers/api/proposal_helper.rb:1346-1354), so it is validated as 0 but the RAW string is merged into responses_hash (app/helpers/api/proposal_helper.rb:1099-1100).
- **Oracle.** If 200, responses_hash holds the string 'ten'.
- **Trace.** P1 · automate · `EDGE-AWD-110` · `app/helpers/api/proposal_helper.rb:1346-1354`

#### API-XAWD-111 — Over-awarding on a line with no PR has no ceiling
- **Why it matters.** CONFIG: the tolerance only bounds PR-linked lines; a manual event with over-awarding on has no ceiling at all.
- **Setup.** Config: is_over_awarding_allowed ON; the line is NOT linked to a PR.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "add", "egli_data": {"{{lineItemUuid}}": {"awarded_quantity": 999999}}}}}`. 1. POST add_response with awarded_quantity 999999.
- **Expected.** 200 by design — `elsif is_over_awarding_allowed && !pr_mapping_exists` returns nil (app/helpers/api/proposal_helper.rb:834-835); over_quantity_tolerance_percentage is ignored without a PR.
- **Oracle.** 200; record the stored quantity.
- **Trace.** P1 · automate · `EDGE-AWD-111` · `app/helpers/api/proposal_helper.rb:834-835`

#### API-XAWD-112 — Over-awarding beyond the PR tolerance is refused
- **Why it matters.** The tolerance ceiling on PR-linked lines.
- **Setup.** Config: is_over_awarding_allowed ON, over_quantity_tolerance_percentage 10; the line is PR-linked with 10 open.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "add", "egli_data": {"{{lineItemUuid}}": {"awarded_quantity": 12}}}}}`. 1. POST add_response with awarded_quantity 12 (above 10 × 1.10).
- **Expected.** HTTP 422 code 561 — awarded + sum > max(egli_quantity, pr_uncompleted × (1 + tol/100) − other_events_in_progress) (app/helpers/api/proposal_helper.rb:824-830).
- **Oracle.** 422 + code 561; 11 would pass.
- **Trace.** P0 · automate · `EDGE-AWD-112` · `app/helpers/api/proposal_helper.rb:824-830`

#### API-XAWD-113 — An under-award is refused when partial awarding is off
- **Why it matters.** Under-award refused with an over-award message.
- **Setup.** Config: is_over_awarding_allowed ON, is_partial_awarding_enabled OFF; PR-linked line of 10.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "add", "egli_data": {"{{lineItemUuid}}": {"awarded_quantity": 6}}}}}`. 1. POST add_response with awarded_quantity 6.
- **Expected.** HTTP 422 code 561 — with partial awarding off, sum + awarded < egli_quantity is refused too (app/helpers/api/proposal_helper.rb:831-833). The message ('more than requested') is misleading for an UNDER-award.
- **Oracle.** 422 + code 561.
- **Trace.** P1 · automate · `EDGE-AWD-113` · `app/helpers/api/proposal_helper.rb:831-833`

#### API-XAWD-114 — A line item marked Regret cannot be awarded
- **Why it matters.** Line-level disqualification (vendor-level cases already exist).
- **Setup.** Config: restrict_awarding_for_tna_vendors on; the vendor's score on {{lineItemUuid}} is the Regret score.
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "add", "egli_data": {"{{lineItemUuid}}": {"awarded_quantity": 10}}}}}`. 1. POST add_response for that line.
- **Expected.** HTTP 422 code 1136 'One or more selected line items cannot be awarded as they have been marked as Regret' (app/helpers/api/proposal_helper.rb:1262-1266, codes at app/helpers/api/proposal_helper.rb:16-19).
- **Oracle.** 422 + code 1136.
- **Trace.** P0 · automate · `EDGE-AWD-114` · `app/helpers/api/proposal_helper.rb:1244-1269`

#### API-XAWD-115 — A TNA vendor can be awarded when the round lets TNA vendors bid
- **Why it matters.** The journey's move_to_auction body sets allow_tna_vendors_to_bid: true, which silently lifts TNA award blocking for the whole event.
- **Setup.** Config: restrict_awarding_for_tna_vendors on; the vendor is TNA; the latest stage has misc.allow_tna_vendors_to_bid = true (the journey's convert body sets it).
- **Steps.** `POST /proposal/{{proposalUuid}}/add_response?lot_no=` with body `{"responses": {"{{vendorUuid}}": {"action": "add", "egli_data": {"{{lineItemUuid}}": {"awarded_quantity": 10}}}}}`. 1. POST add_response for the TNA vendor.
- **Expected.** TNA is not blocked — get_blocked_evaluation_scores only adds 'tna' when !latest_stage.allow_tna_vendors_to_bid? (app/helpers/api/proposal_helper.rb:1271-1277); Regret stays blocked.
- **Oracle.** Not 1137.
- **Trace.** P1 · automate · `EDGE-AWD-115` · `app/helpers/api/proposal_helper.rb:1271-1280`

## 10. Award approval workflows

#### API-XAWD-116 — Only the proposal's creator can list its workflows
- **Why it matters.** Creator-scoped read.
- **Setup.** {{proposalUuid}} was created by another buyer of the same company.
- **Steps.** `GET /proposal/{{proposalUuid}}/approval_workflows`. 1. GET approval_workflows as a different buyer.
- **Expected.** HTTP 422 code 4 — lookup is scoped to created_by_user_id: Current.user.id (app/controllers/api/proposal_controller.rb:72).
- **Oracle.** 422 + code 4.
- **Trace.** P1 · automate · `EDGE-AWD-116` · `app/controllers/api/proposal_controller.rb:72`

#### API-XAWD-117 — An evaluating-team member gets no body for award workflows
- **Why it matters.** Precedence bug: the journey's parser treats a 204 as 'no workflow configured' and skips submit.
- **Setup.** Caller is on an evaluating team in this workspace.
- **Steps.** `GET /proposal/{{proposalUuid}}/approval_workflows`. 1. GET /proposal/{{proposalUuid}}/approval_workflows.
- **Expected.** Intended {}; actual: `render json: {} && return if …` parses as render(json: ({} && return)) (app/controllers/api/proposal_controller.rb:71), so the method returns BEFORE rendering and Rails answers 204 No Content. Never 5xx.
- **Oracle.** Status is 200 with {} (intended) or 204 (today).
- **Trace.** P2 · automate · `EDGE-AWD-117` · `app/controllers/api/proposal_controller.rb:71`

#### API-XAWD-118 — Listing award workflows with POST is not routed
- **Why it matters.** Documents the wrong verb in an existing case.
- **Setup.** Authenticated buyer.
- **Steps.** `POST /proposal/{{proposalUuid}}/approval_workflows`. 1. POST /proposal/{{proposalUuid}}/approval_workflows.
- **Expected.** Routing error — config/routes.rb:338 declares only GET. The existing AWD-APPR-001 uses POST.
- **Oracle.** 404/routing error, never 5xx.
- **Trace.** P2 · automate · `EDGE-AWD-118` · `config/routes.rb:338`

## 11. Award submit

#### API-XAWD-119 — Submitting an award twice is refused
- **Why it matters.** Double submit must not start a second approval; the code is 2, which clients must not show as 'fill all fields'.
- **Setup.** {{proposalUuid}} was already submitted (status requested or selected).
- **Steps.** `POST /proposal/{{proposalUuid}}/submit` with body `{"attachments": [], "remarks": "QA_Platform_award_{{stamp}}", "step_uuid_vs_user_uuid": {}}`. 1. POST submit again.
- **Expected.** HTTP 422 code 2 'Insufficient parameters' — the lookup requires status: :draft (app/controllers/api/proposal_controller.rb:82-83), so the second submit reads as a missing proposal, not 573 'already submitted'.
- **Oracle.** 422 + code 2; one approval_requests row.
- **Trace.** P0 · automate · `EDGE-AWD-119` · `app/controllers/api/proposal_controller.rb:82-83`

#### API-XAWD-120 — Submitting after un-awarding everyone is refused
- **Why it matters.** responses_hash is present but its data is empty — the SECOND of the two 683 guards.
- **Setup.** {{proposalUuid}} had one allocation which was then removed via add_response action remove.
- **Steps.** `POST /proposal/{{proposalUuid}}/submit` with body `{"attachments": [], "remarks": "QA_Platform_award_{{stamp}}", "step_uuid_vs_user_uuid": {}}`. 1. POST submit.
- **Expected.** HTTP 422 code 683 'Proposal cannot be empty. Please award the vendors again.' — responses_hash['data'] is {} (app/controllers/api/proposal_controller.rb:84-86). The proposal stays draft; no approval_requests row.
- **Oracle.** 422 + code 683.
- **Trace.** P0 · automate · `EDGE-AWD-120` · `app/controllers/api/proposal_controller.rb:85-86`

#### API-XAWD-121 — Eleven award attachments are refused
- **Why it matters.** One over the limit (the existing case uses 16). The guard runs BEFORE submit_proposal, so nothing is awarded.
- **Setup.** {{proposalUuid}} is a populated draft.
- **Steps.** `POST /proposal/{{proposalUuid}}/submit` with body `{"attachments": ["QA_Platform_att1_{{stamp}}", "QA_Platform_att2_{{stamp}}", "QA_Platform_att3_{{stamp}}", "QA_Platform_att4_{{stamp}}", "QA_Platform_att5_{{stamp}}", "QA_Platform_att6_{{stamp}}", "QA_Platform_att7_{{stamp}}", "QA_Platform_att8_{{stamp}}", "QA_Platform_att9_{{stamp}}", "QA_Platform_att10_{{stamp}}", "QA_Platform_att11_{{stamp}}"], "remarks": "QA_Platform_award_{{stamp}}", "step_uuid_vs_user_uuid": {}}`. 1. POST submit with 11 attachments.
- **Expected.** HTTP 422 code 472 with message 'You can attach a maximum of 10 files. Please remove some attachments and try again.' (app/controllers/api/proposal_controller.rb:88-89; Remark::MAX_ATTACHMENTS = 10, app/models/remark.rb:29). The proposal stays draft; no approval_requests row.
- **Oracle.** 422 + code 472 with the custom message (the en-IN default for 472 is 'failed to add remark').
- **Trace.** P1 · automate · `EDGE-AWD-121` · `app/controllers/api/proposal_controller.rb:88-89`

#### API-XAWD-122 — Submitting without approver overrides does not crash
- **Why it matters.** DEFECT-IN-WAITING: an optional field is mandatory by crash; every API client must send {}.
- **Setup.** {{proposalUuid}} is a populated draft.
- **Steps.** `POST /proposal/{{proposalUuid}}/submit` with body `{"attachments": [], "remarks": "QA_Platform_award_{{stamp}}"}`. 1. POST submit without step_uuid_vs_user_uuid.
- **Expected.** Must be 200/422. Today params[:step_uuid_vs_user_uuid].to_enum.to_h on nil (app/controllers/api/proposal_controller.rb:93) raises NoMethodError → 500 before authorize.
- **Oracle.** Status < 500.
- **Trace.** P0 · automate · `EDGE-AWD-122` · `app/controllers/api/proposal_controller.rb:93`

#### API-XAWD-123 — A text approver map does not crash submit
- **Why it matters.** Wrong type.
- **Setup.** {{proposalUuid}} is a populated draft.
- **Steps.** `POST /proposal/{{proposalUuid}}/submit` with body `{"attachments": [], "remarks": "QA_Platform_award_{{stamp}}", "step_uuid_vs_user_uuid": "QA_Platform_{{stamp}}"}`. 1. POST submit with step_uuid_vs_user_uuid = "QA_Platform_{{stamp}}".
- **Expected.** Must be 422. String#to_enum(:each) → to_h raises NoMethodError (app/controllers/api/proposal_controller.rb:93) → 500 today.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-AWD-123` · `app/controllers/api/proposal_controller.rb:93`

#### API-XAWD-124 — Submitting without a flow when approval is configured is refused
- **Why it matters.** Skipping approval by omitting the flow; without 570 close_bids would award immediately.
- **Setup.** destructive — acts on the sandbox copy only and must run last: if the company has NO award approval configured, this body awards the proposal for real via close_bids. {{proposalUuid}} is a populated draft on the sandbox copy; the company HAS an award (close_event_group) approval configured.
- **Steps.** `POST /proposal/{{proposalUuid}}/submit` with body `{"attachments": [], "remarks": "QA_Platform_award_{{stamp}}", "step_uuid_vs_user_uuid": {}}`. 1. POST submit with no approval_flow_uuid.
- **Expected.** HTTP 422 code 570 'Approval Flow not found' — check_proposal_approval returns 570 when is_approval_exists?(close_event_group) and no flow was sent (app/helpers/api/proposal_approval_helper.rb:40). The proposal stays draft; no approval_requests row.
- **Oracle.** 422 + code 570.
- **Trace.** P0 · automate · `EDGE-AWD-124` · `app/helpers/api/proposal_approval_helper.rb:40`

#### API-XAWD-125 — A malformed approval flow id is treated as no flow
- **Why it matters.** A garbage flow id is treated as absence, not as an error — safe only while an approval exists.
- **Setup.** destructive — acts on the sandbox copy only and must run last: if the company has NO award approval configured, this body awards the proposal for real via close_bids. {{proposalUuid}} is a populated draft on the sandbox copy; the company HAS an award approval.
- **Steps.** `POST /proposal/{{proposalUuid}}/submit` with body `{"attachments": [], "remarks": "QA_Platform_award_{{stamp}}", "step_uuid_vs_user_uuid": {}, "approval_flow_uuid": "WrongUuid1="}`. 1. POST submit with approval_flow_uuid 'WrongUuid1='.
- **Expected.** HTTP 422 code 570 — the uuid decodes to approval_flow_id nil, identical to 'no flow' (app/helpers/api/proposal_approval_helper.rb:11,40). If the company had NO approval configured the same body awards straight away via close_bids.
- **Oracle.** 422 + code 570.
- **Trace.** P0 · automate · `EDGE-AWD-125` · `app/helpers/api/proposal_approval_helper.rb:10-41`

#### API-XAWD-126 — An unknown approval flow is refused
- **Why it matters.** Well-formed id that is not an applicable flow.
- **Setup.** {{proposalUuid}} is a populated draft.
- **Steps.** `POST /proposal/{{proposalUuid}}/submit` with body `{"attachments": [], "remarks": "QA_Platform_award_{{stamp}}", "step_uuid_vs_user_uuid": {}, "approval_flow_uuid": "Z2dnWmdaUWtnZw=="}`. 1. POST submit with approval_flow_uuid Z2dnWmdaUWtnZw==.
- **Expected.** HTTP 422 code 523 'Invalid Approval' — is_valid_approval_flow_id fails (app/helpers/api/proposal_approval_helper.rb:12-13). The proposal stays draft; no approval_requests row.
- **Oracle.** 422 + code 523.
- **Trace.** P1 · automate · `EDGE-AWD-126` · `app/helpers/api/proposal_approval_helper.rb:12-13`

#### API-XAWD-127 — A peer reviewer outside the team is refused
- **Why it matters.** CONFIG-dependent: with peer review off, peer_id is ignored.
- **Setup.** Config: peer_review_enabled; {{proposalUuid}} is a populated draft; a valid approval flow is supplied by the runner; peer_id is a user outside the caller's teams.
- **Steps.** `POST /proposal/{{proposalUuid}}/submit` with body `{"attachments": [], "remarks": "QA_Platform_award_{{stamp}}", "step_uuid_vs_user_uuid": {}, "peer_id": 999999999}`. 1. POST submit with peer_id 999999999.
- **Expected.** HTTP 422 code 70 'User does not exist' — peer lookup restricted to the caller's active teams (app/helpers/api/proposal_approval_helper.rb:22-25). Only reached with a flow present.
- **Oracle.** 422 + code 70.
- **Trace.** P2 · automate · `EDGE-AWD-127` · `app/helpers/api/proposal_approval_helper.rb:22-25`

#### API-XAWD-128 — A second buyer's submit after a colleague's does not crash
- **Why it matters.** DEFECT-IN-WAITING: every other error in submit_proposal is a Hash; this one is an Integer, so the one race the guard exists for crashes.
- **Setup.** Two buyers each opened a draft on the same event; buyer B submitted first (B's proposal requested). Caller is buyer A with a populated draft {{proposalUuid}}.
- **Steps.** `POST /proposal/{{proposalUuid}}/submit` with body `{"attachments": [], "remarks": "QA_Platform_award_{{stamp}}", "step_uuid_vs_user_uuid": {}}`. 1. As A, POST submit.
- **Expected.** Must be 422 code 573 'The proposal has already been submitted'. Today submit_proposal does `return proposal, 573` (a bare Integer, app/helpers/api/proposal_helper.rb:128) and the controller reads error[:code] (app/controllers/api/proposal_controller.rb:98) → 573[:code] → TypeError → 500.
- **Oracle.** Status < 500 and A's proposal stays draft.
- **Trace.** P0 · automate · `EDGE-AWD-128` · `app/helpers/api/proposal_helper.rb:128`

#### API-XAWD-129 — Submitting an award on a revised bid is refused
- **Why it matters.** Awarding a stale price.
- **Setup.** {{proposalUuid}} awards a bid that the vendor has since revised (old bid status revised).
- **Steps.** `POST /proposal/{{proposalUuid}}/submit` with body `{"attachments": [], "remarks": "QA_Platform_award_{{stamp}}", "step_uuid_vs_user_uuid": {}}`. 1. POST submit.
- **Expected.** HTTP 422 code 1126 'A few bids have been revised. Please re-award to continue.' (app/helpers/api/proposal_helper.rb:241-250). The proposal stays draft; no approval_requests row.
- **Oracle.** 422 + code 1126.
- **Trace.** P0 · automate · `EDGE-AWD-129` · `app/helpers/api/proposal_helper.rb:241-250`

## 12. Letter of Award preview and PO preconditions

#### API-XAWD-130 — An LOA preview with no vendor is refused
- **Why it matters.** Missing vendor.
- **Setup.** {{proposalUuid}} is a populated draft of the caller.
- **Steps.** `POST /proposal/{{proposalUuid}}/preview_loa`. 1. POST preview_loa with {}.
- **Expected.** HTTP 422 code 896 'Vendor is not part of this proposal' — decode_data(nil).to_i is 0 (app/controllers/api/proposal_controller.rb:132-133).
- **Oracle.** 422 + code 896.
- **Trace.** P1 · automate · `EDGE-AWD-130` · `app/controllers/api/proposal_controller.rb:132-133`

#### API-XAWD-131 — An LOA preview for a vendor not in the award is refused
- **Why it matters.** An LOA to a vendor not awarded would be a binding letter with no allocation.
- **Setup.** {{proposalUuid}} is a populated draft that does NOT award {{vendorUuid}}.
- **Steps.** `POST /proposal/{{proposalUuid}}/preview_loa` with body `{"vendor_uuid": "Z2dnWmdaUWtnZw=="}`. 1. POST preview_loa for that vendor.
- **Expected.** HTTP 422 code 896 — get_response_data_for_vendor(vendor_company_id).blank? (app/controllers/api/proposal_controller.rb:134).
- **Oracle.** 422 + code 896.
- **Trace.** P1 · automate · `EDGE-AWD-131` · `app/controllers/api/proposal_controller.rb:134`

#### API-XAWD-132 — An LOA preview without a template is refused
- **Why it matters.** CONFIG: LOA needs a template; the error must say so rather than 897.
- **Setup.** {{proposalUuid}} is a populated draft awarding {{vendorUuid}}; the company has NO t-loa report template.
- **Steps.** `POST /proposal/{{proposalUuid}}/preview_loa` with body `{"vendor_uuid": "{{vendorUuid}}"}`. 1. POST preview_loa for the awarded vendor.
- **Expected.** HTTP 422 code 895 'Letter of Award template is not configured for this company' (app/controllers/api/proposal_controller.rb:136-137).
- **Oracle.** 422 + code 895.
- **Trace.** P1 · automate · `EDGE-AWD-132` · `app/controllers/api/proposal_controller.rb:136-137`

#### API-XAWD-133 — An LOA that fails to render answers 897, not a crash
- **Why it matters.** Template rendering errors must be contained inside Reports::LoaService.
- **Setup.** {{proposalUuid}} is a populated draft awarding {{vendorUuid}}; an LOA template exists but references a field the proposal lacks.
- **Steps.** `POST /proposal/{{proposalUuid}}/preview_loa` with body `{"vendor_uuid": "{{vendorUuid}}"}`. 1. POST preview_loa.
- **Expected.** A generation failure must be HTTP 422 code 897 'Failed to generate Letter of Award' (app/controllers/api/proposal_controller.rb:145-147), never 5xx.
- **Oracle.** Status < 500; 897 on failure.
- **Trace.** P2 · automate · `EDGE-AWD-133` · `app/controllers/api/proposal_controller.rb:139-147`

#### API-XAWD-134 — PO forms cannot be built on a submitted award
- **Why it matters.** PO forms are built while the award is still a draft.
- **Setup.** {{proposalUuid}} is submitted.
- **Steps.** `POST /proposal/{{proposalUuid}}/create_po_form`. 1. POST create_po_form.
- **Expected.** HTTP 422 code 2 — draft-only (app/controllers/api/proposal_controller.rb:107-108).
- **Oracle.** 422 + code 2.
- **Trace.** P1 · automate · `EDGE-AWD-134` · `app/controllers/api/proposal_controller.rb:107-108`

#### API-XAWD-135 — PO forms need every line awarded when partial line awarding is disallowed
- **Why it matters.** CONFIG-dependent PO precondition.
- **Setup.** Config: disallow_partial_line_item_awarding on; the event has 2 lines and {{proposalUuid}} awards 1.
- **Steps.** `POST /proposal/{{proposalUuid}}/create_po_form`. 1. POST create_po_form.
- **Expected.** HTTP 422 code 791 'Please ensure all line items are awarded before continuing.' (app/helpers/api/proposal_helper.rb:219-231).
- **Oracle.** 422 + code 791.
- **Trace.** P0 · automate · `EDGE-AWD-135` · `app/helpers/api/proposal_helper.rb:219-231`

#### API-XAWD-136 — PO forms without a PO template are refused
- **Why it matters.** PO precondition.
- **Setup.** {{proposalUuid}} is a populated draft; no PO template is configured for the event.
- **Steps.** `POST /proposal/{{proposalUuid}}/create_po_form`. 1. POST create_po_form.
- **Expected.** HTTP 422 code 477 'Template not found' (app/helpers/api/proposal_helper.rb:553-555).
- **Oracle.** 422 + code 477.
- **Trace.** P1 · automate · `EDGE-AWD-136` · `app/helpers/api/proposal_helper.rb:553-555`

#### API-XAWD-137 — PO forms on an empty award are refused
- **Why it matters.** PO forms with no allocation.
- **Setup.** {{proposalUuid}} is an EMPTY draft; a PO template exists.
- **Steps.** `POST /proposal/{{proposalUuid}}/create_po_form`. 1. POST create_po_form.
- **Expected.** HTTP 422 code 684 'Please award for at least one Vendor' (app/helpers/api/proposal_helper.rb:619-621).
- **Oracle.** 422 + code 684.
- **Trace.** P1 · automate · `EDGE-AWD-137` · `app/helpers/api/proposal_helper.rb:619-621`

#### API-XAWD-138 — Contract forms need contract creation enabled
- **Why it matters.** CONFIG gate.
- **Setup.** {{proposalUuid}} is a populated draft; is_contract_creation_enabled is off.
- **Steps.** `POST /proposal/{{proposalUuid}}/create_contract_form`. 1. POST create_contract_form.
- **Expected.** HTTP 422 code 455 — ProposalPolicy#create_contract_form? needs the config (app/policies/proposal_policy.rb:33-35).
- **Oracle.** 422 + code 455.
- **Trace.** P2 · automate · `EDGE-AWD-138` · `app/policies/proposal_policy.rb:33-35`

#### API-XAWD-139 — Discarding a colleague's draft award is not creator-scoped
- **Why it matters.** DEFECT-IN-WAITING: every other proposal write is creator-scoped; discard is not.
- **Setup.** {{proposalUuid}} is buyer A's draft; caller is buyer B of the same company.
- **Steps.** `POST /proposal/discard_draft_proposal` with body `{"proposal_uuid": "{{proposalUuid}}"}`. 1. POST /proposal/discard_draft_proposal with proposal_uuid {{proposalUuid}} as B.
- **Expected.** Expected: refused like add_response/submit (creator-scoped). Today discard looks up Proposal.find_by(id:) with no created_by filter (app/controllers/api/proposal_controller.rb:182) and ProposalPolicy only checks the company (app/policies/proposal_policy.rb:43-45) → A's draft becomes in_active.
- **Oracle.** If 200, A's allocation work is gone.
- **Trace.** P1 · automate · `EDGE-AWD-139` · `app/controllers/api/proposal_controller.rb:180-188`

#### API-XAWD-140 — A submitted award cannot be discarded
- **Why it matters.** An award in approval must be withdrawn through the approval, not discarded.
- **Setup.** {{proposalUuid}} is submitted (requested).
- **Steps.** `POST /proposal/discard_draft_proposal` with body `{"proposal_uuid": "{{proposalUuid}}"}`. 1. POST discard_draft_proposal.
- **Expected.** HTTP 422 code 888 'Invalid Parameters' — render_error_json(888) unless proposal.draft? (app/controllers/api/proposal_controller.rb:185).
- **Oracle.** 422 + code 888; status unchanged.
- **Trace.** P1 · automate · `EDGE-AWD-140` · `app/controllers/api/proposal_controller.rb:185`

