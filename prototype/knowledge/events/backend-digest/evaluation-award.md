# Evaluation and Award — backend digest (procol-backend origin/main ae36e86894)

## Overview
Technical evaluation is evaluators scoring each vendor's response in the technical round (RFP, or an RFI) after its bid end time. Scores go through `Api::EvaluationsController` (`POST /api/evaluations` to score, `PATCH /api/evaluations/submit` to submit), with rules in `app/services/evaluations/validate_service.rb` and `app/helpers/api/evaluations_helper.rb`. Submitting creates a technical proposal (a `Proposal` on the TradeRequest) that is finalised at once or sent for approval. Awarding is the award proposal (a `Proposal` on the EventGroup) built through `Api::ProposalController` (`/api/proposal`, rules in `app/helpers/api/proposal_helper.rb`) and submitted to close the winning bids, directly or after an approval workflow. Both controllers are buyer web console only (`config/app_auth_config.yml:652-663`, `:1147`); the vendor website calling them gets 401 "This app is not authorized to use this API" and is signed out. Re-evaluation lives on `/api/v1/trade/...`, evaluator changes on `/api/event_group_line_item/update_egli`.

### evaluations#create — POST /api/evaluations — score a vendor: entry checks (part 1)
An evaluator gives one vendor a score on one form (a line item or a vendor-assessment section) of the technical round. Console only. Params: `trade_request_id`, `company_id` (vendor), `form: {id, score, remark}`.
Checks, in order:
1. Same user + round + vendor + form within 3 s → 516 "Transaction in Progress" (HTTP 422) — app/controllers/api/evaluations_controller.rb:126-141
2. Round is not an ACTIVE RFI/RFP of the workspace (draft, closed, cancelled all fail) → 33 "Order not active" (HTTP 422) — evaluations_controller.rb:14-17
3. Vendor-onboarding v2 round: user not vendor-management team / super admin → 101 "You are not allowed to perform this action" (HTTP 422); round upcoming or running → 789 "Evaluation Score can be filled only in evaluation period" (HTTP 422) — :19-23
4. Any other RFI/RFP whose bid end time is still in the future → 33 "Order not active" (HTTP 422); normal RFPs never get 789 — :24-26
Then payload (part 2), evaluator (part 3) and save (part 4) checks — :28-35.

### evaluations#create — POST /api/evaluations — score must be a configured label (part 2)
What a valid `form` payload looks like. Every failure here is 2 "Insufficient parameters" (HTTP 422).
Checks, in order:
1. `company_id` or `form` missing → 2 — app/services/evaluations/validate_service.rb:43-47
2. `form.id` missing, not a JSON integer, or not a form this user may evaluate (`get_allowed_forms_for_user`) → 2 — validate_service.rb:61-63
3. `form.score` missing or not a JSON integer (4.0 or "4" fail) → 2. Skipped for vendor-onboarding v2 — :64-65
4. `form.score` not a key of the event's score→label map (`event_group.get_evaluation_score_vs_label`) → 2. Skipped for vendor-onboarding v2 — :66, app/models/event_group.rb:718-720
5. Score 0 without `form.remark` → 2 (a 0 / TNA score needs a remark). Skipped for vendor-onboarding v2 — :67-69
6. Section-wise scoring with `form.question_scores`: only the form id/allowed checks apply; no score needed — :52-59

### Evaluation score labels — evaluation_score_label_mapping (TNA, Regret, T1, T2, T3, Trial)
Which score numbers are legal and what they mean. The map is the event's valid RFP config `evaluation_score_label_mapping` (empty list when the key is missing), else the company configuration of the same name, sorted by `order` — app/models/event_group.rb:726-735, app/models/model_helpers/trade_request_model_helper.rb:912-913, app/models/company.rb:1040-1041.
Master default: 0 TNA, 1 Regret (hidden), 2 Trial, 3 T3, 4 T2, 5 T1 — db/migrate/20250206071658_add_label_to_evaluation_score.rb:12-19. A backfill gave existing RFPs another numbering: 0 TNA, 1 T3, 2 T2, 3 T1, 4 Trial, 5 Regret — db/migrate/20250209130259_set_evaluation_score_label_mapping.rb:3-58. Never hard-code scores in tests; read the map. TNA/Regret are found by label via `get_score_for_key('tna'|'regret')` — event_group.rb:737-741, app/models/evaluation_score.rb:52.
If an RFP's config lacks the key, the map is empty and EVERY score is refused with 2 (unverified: no writer of this RFP config found under app/).

### evaluations#create — POST /api/evaluations — who may evaluate (part 3)
Evaluator access rules, after the payload rules. Every refusal is 101 "You are not allowed to perform this action" (HTTP 422).
Checks, in order:
1. Round's company not in the evaluator's allowed companies → 101 — app/services/evaluations/validate_service.rb:78
2. Vendor has no ACTIVE response (template response) on the round, i.e. did not submit → 101 — :79
3. Vendor-onboarding v2: allowed from here — :80
4. Section-wise scoring on a vendor-assessment section (form with no line-item mapping): user must be an evaluator on that form, else 101 — :85-91
5. User is an evaluator on the whole round (round access list) → allowed — :93
6. RFI → 101. RFP: the form must map to a line item that is NOT yet evaluated and the user must be its evaluator, else 101 (a finished line item cannot be re-scored here; use re-evaluation) — :94-99
Cites: validate_service.rb:30-35, 77-100

### evaluations#create — POST /api/evaluations — what gets saved (part 4)
How a score is stored. Nothing reaches the buyer's ranking until submit.
Checks, in order:
1. Vendor company id unknown → 1124 "This vendor has an inactive vendor profile. Reject this bid to proceed with comparison." (HTTP 422); vendor not a (non-inactive) vendor of the buyer → 1124 "<vendor> has an inactive vendor profile…" — app/helpers/api/evaluations_helper.rb:12-17, app/models/company.rb:929-931
2. Evaluation or score fails to save → 15 with the model errors as message (HTTP 422) — evaluations_helper.rb:41, 47
State rules: reuses the user's latest active/draft/peer_review Evaluation for that vendor, else a new `draft` one — :25-36. The score row is the line-item mapping (RFP) or the Form (RFI / unmapped form), matched among draft/peer_review rows; if only an `active` (submitted) row exists a NEW draft row is added — :1083-1096, 1126-1148. Score status `draft`, type `restricted` — :1101-1110. `form.remark` is saved as a Remark — :1099, 1114-1124.

### evaluations#create — POST /api/evaluations — vendor onboarding v2 forms (part 5)
How vendor-onboarding v2 rounds score differently.
State rules: one Evaluation per vendor (not per evaluator), set `active` at once, last scorer recorded — app/helpers/api/evaluations_helper.rb:18-23. Score row status `active`, type `unrestricted` — :1101, 1110, 1127. `form.score` is not used: before save the score is recomputed as the sum of `meta_data.score_type_vs_key_attribute_vs_score.score_widget` values — app/models/evaluation_score.rb:49, 54-61.
Skips: integer/label/remark score rules (validate_service.rb:65-69) and the per-form evaluator check (validate_service.rb:80) do not apply.
Gates: user must be vendor-management team or super admin (101), and the round must be past bidding (789) — app/controllers/api/evaluations_controller.rb:19-23, app/models/user.rb:631-635.
Submit is not used for these rounds: evaluations#submit refuses them with 33 — evaluations_controller.rb:42-44.

### evaluations#create — POST /api/evaluations — section-wise question scores (part 6)
Section-wise scoring (`config.section_wise_scoring_enabled`) on a vendor-assessment form (no line-item mapping) — app/helpers/api/evaluations_helper.rb:7-10, 857-895.
Checks, in order:
1. Form not found → 15 "Form not found" (HTTP 422) — :859
2. User not an evaluator on that section → 101 "Evaluator not assigned to this section" (HTTP 422) — :861-863
3. `question_scores` missing → 15 "question_scores is required"; unknown key → 15 "Invalid question keys: …"; non-number → 15 "Score for <key> must be a number"; outside 0..`section_wise_max_score` → 15 "Score for <key> must be between 0 and <max>" (all HTTP 422) — :834-855
4. Vendor not found → 15 "Vendor not found"; any exception → 15 "Operation failed" — :868-869, 892-895
State rules: section score = average of question scores once every question is scored; weighted total (by `section_weightage`) stored in `scoring_info.total_weighted_score` — :794-809, 897-952.

### evaluations#submit — PATCH /api/evaluations/submit — submit scores: entry checks (part 1)
The evaluator submits all their scores for a technical round. Console only. Params: `trade_request_id`, optional `form_ids`/`form_id`, `action_type`, `approval_flow_id`, `remarks`, `attachments`, `peer_id`.
Checks, in order:
1. Same user + round within 3 s → 516 "Transaction in Progress" (HTTP 422) — app/controllers/api/evaluations_controller.rb:113-119
2. Round not an ACTIVE RFI/RFP of the workspace, bid end time in the future, or a vendor-onboarding v2 round → 33 "Order not active" (HTTP 422) — :41-44
3. Round company not in user's allowed companies → 101 "You are not allowed to perform this action" (HTTP 422) — :46
4. RFP in line-item mode but no active line-item mappings for the forms → 2 "Insufficient parameters" (HTTP 422) — :51-61
5. No evaluations picked up (part 2) → 571 "Please, evaluate on all fields" (HTTP 422) — :69
6. Completeness check (parts 3–4) → 571 — :77-78

### evaluations#submit — PATCH /api/evaluations/submit — which evaluations count (part 2)
Which forms and evaluations are submitted.
Forms: `form_ids` if sent; else section-wise `form_id`; else, for lot-based RFPs, all forms not tied to a line item — app/helpers/api/evaluations_helper.rb:749-762.
Line-item mode: RFP with `is_both_evaluation_enabled` → only when the forms map to line items; otherwise when `rfp_evaluation_mode` is `line_item_based` or `is_linewise_rfp_evaluation_allowed` — app/models/model_helpers/trade_request_model_helper.rb:1458-1485, evaluations_helper.rb:764-770.
Planner without role-based permissions (`is_planner_gated?`) on an RFP: per form, the planner's own scores if the planner is the form's evaluator, or the assigned evaluator's `peer_review` scores — evaluations_helper.rb:209-247, app/models/user.rb:614-616.
Everyone else: their evaluations in active/draft/peer_review — app/controllers/api/evaluations_controller.rb:63-68.
Errors from the auto-Regret step (part 8) are returned with their own code, HTTP 422 — :64-65, 71-75.

### evaluations#submit — PATCH /api/evaluations/submit — code 571 for RFPs (part 3)
571 "Please, evaluate on all fields" (HTTP 422) means the evaluator has not scored every vendor that has an active (submitted) response.
Checks, in order:
1. RFP line-item mode: the user's draft/peer_review scores on the selected line items must EQUAL vendors-with-active-response × line items; more than expected is also 571 (and logs Sentry "Evaluation scores count mismatch") — app/helpers/api/evaluations_helper.rb:811-829, 675-690
2. RFP lot mode: only the LAST form of `form_ids` is counted (`Form.where(id: form_ids).last`); its draft/peer_review scores must equal the number of responding vendors. With no form ids nothing is counted, so 571 whenever any vendor responded — :820-829
3. Already-submitted (`active`) scores do not count, so submitting twice gives 571 — :824-827
Vendors who regretted or never submitted (no active response) need no score — app/controllers/api/evaluations_controller.rb:47.
Cites: evaluations_helper.rb:604-625

### evaluations#submit — PATCH /api/evaluations/submit — code 571 for RFIs and section-wise scoring (part 4)
The other two completeness rules, both 571 "Please, evaluate on all fields" (HTTP 422).
RFI: the sorted vendor ids of the user's evaluations must equal the vendors with an active response, AND each evaluation must hold exactly as many scores as forms the user may evaluate — app/helpers/api/evaluations_helper.rb:812-815, 611-622, app/controllers/api/evaluations_controller.rb:148-153.
Section-wise scoring (not line-item mode) — evaluations_helper.rb:605-607, 627-673:
1. No evaluations → 571 — :628
2. User is evaluator on no section → 571 — :632-641
3. Scoped to the submitted `form_ids`; none assigned to the user → passes — :644-645
4. During a re-evaluation, sections whose re-evaluation was rejected are excluded — :651-659
5. draft/peer_review scores must equal responding vendors × remaining sections, else 571 — :663-672

### evaluations#submit — PATCH /api/evaluations/submit — section/line/area incharge goes to peer review (part 5)
When the submitter's designation is section_incharge, line_incharge or area_incharge (the evaluating team), submit does NOT create a proposal: the evaluations and scores move to `peer_review` and the API returns plain success — app/controllers/api/evaluations_controller.rb:80-82, app/models/user.rb:157, 379-382.
State rules: `peer_review` scores are not pushed to the event ranking — app/helpers/api/evaluations_helper.rb:553-555. A gated planner later submits them (part 2), picking up those peer_review scores.
Side effects: the status change re-sets "pending on evaluator" for the line item — app/models/evaluation_score.rb:51, 63-66.
Cites: evaluations_helper.rb:536-558

### evaluations#submit — PATCH /api/evaluations/submit — technical proposal: "selected" vs "draft" (part 6)
Everyone else gets a technical proposal back (ProposalSerializer). The user's existing draft technical proposal on the round is reused, else a new `draft`; its `responses_hash` lists per vendor the submitted score ids and the vendor's response id — app/helpers/api/evaluations_helper.rb:394-416, 426-451, 469-476.
State rules: if the company has NO active approval flow with key `technical_evaluation`, the proposal is saved `selected` and all evaluations/scores become `active` at once — even without `action_type` — :417-421. If any such flow exists (its trigger rule is not checked here) the proposal stays `draft` and scores stay draft until a second call with `action_type=proposal_submit` (part 7).
Section-wise scoring: one draft proposal per section (`meta_data.section_form_id`); no `form_id` → 2 "Insufficient parameters" (HTTP 422) — app/controllers/api/evaluations_controller.rb:85-92.

### evaluations#submit — PATCH /api/evaluations/submit — action_type=proposal_submit and approval (part 7)
Second step when a technical-evaluation approval flow exists.
Checks, in order (app/helpers/api/proposal_approval_helper.rb:10-43):
1. `approval_flow_id` not among the flows applicable to this user/proposal → 523 "Invalid Approval" (HTTP 422) — :11-14
2. `peer_id` sent, company config `peer_review_enabled` on, peer not an active member of the user's teams → 70 "User does not exist" (HTTP 422) — :22-26
3. Approval request could not start → 523 — :36
4. No `approval_flow_id` but an approval rule applies (`is_approval_exists?`) → 570 "Approval Flow not found" (HTTP 422) — :41, app/models/proposal.rb:340-344
State rules: with a flow, proposal → `requested`, scores → `requested`, approver identifiers added to the round — app/helpers/api/evaluations_helper.rb:489-493. With no applicable rule, proposal → `selected`, scores → `active` — :494-498.
Side effects: `remarks`/`attachments` saved as a "proposal_submitted" Remark — :486-488.

### evaluations#submit — PATCH /api/evaluations/submit — automatic Regret scores (part 8)
For RFP line-item evaluation, vendors who regretted (declined) a line item and were not scored get an automatic Regret score before the 571 check, so the evaluator does not have to score them.
Applies when: RFP in line-item mode and the user is not a gated planner (app/controllers/api/evaluations_controller.rb:71-75), or a gated planner who is the form's evaluator on a non-lot RFP (app/helpers/api/evaluations_helper.rb:220, 229-236).
How: per line item, `egli.regretted_participants` minus vendors already scored get `score = get_score_for_key('regret')` through the normal create path — evaluations_helper.rb:692-720. A failure returns that path's code (1124 or 15), HTTP 422.
If the event's label map has no "Regret" label the score is nil (unverified: whether that saves or fails with 15).

### Evaluation scores going active — ranking and RFP auto-close (part 1)
What happens when submitted scores become `active` (no approval, or approval accepted).
Side effects:
1. Evaluations set active; round `event_score_for_participants[vendor].rank` = sum of active scores / number of forms / number of evaluators; submitter added to `misc.evaluated_by_users` — app/helpers/api/evaluations_helper.rb:585-602, 1179-1185
2. Each active score is written into the line item's or event's precomputed data (`evaluation_score`, remark) — app/models/evaluation_score.rb:68-96
3. When the RFP becomes fully evaluated it is set `closed` and its extra closing time (evaluation window) ends now; with both lot and line evaluation only once every line item is evaluated — evaluation_score.rb:99-102, 151-165. RFIs close the same way — app/models/evaluation.rb:40-48
4. After the RFP closes, further evaluations#create / submit on it get 33 "Order not active" (only ACTIVE rounds are found) — app/controllers/api/evaluations_controller.rb:14, 41, app/models/trade_request.rb:162

### Evaluation scores going active — award drafts reset and re-ranking (part 2)
Side effects on the commercial side when a score becomes active or re-evaluated:
1. ALL draft award proposals of the event (except section-wise technical drafts) are emptied — responses and totals reset — so a buyer's half-built award is lost — app/models/evaluation_score.rb:98, app/controllers/concerns/event_group_controller_helper.rb:770-789
2. Bids of that vendor in commercial rounds (auction / RFQ / RFQ-then-auction) are re-precomputed and proposal snapshots refreshed — evaluation_score.rb:103, 136-149
3. Section-wise scoring: precompute waits until every section of the vendor is active; a vendor whose weighted total equals the TNA score gets its event rank score cleared — evaluation_score.rb:73-76, app/helpers/api/evaluations_helper.rb:975-994
4. Vendor-onboarding rounds and scores on other item types skip all of this — evaluation_score.rb:69-71

### Technical proposal approval outcomes — approved, rejected, expired, withdrawn
What the approval workflow does to a technical (RFP) proposal when it finishes — app/models/proposal.rb:351-372.
State rules:
1. Approved: ranking updated (section-wise only records the evaluator), all proposal scores → `active` (triggers the side effects above), proposal → `selected`; save failure → 15 — app/helpers/api/proposal_helper.rb:378-393
2. Rejected: proposal → `rejected`; every score → `rejected` and a new draft score (in a draft evaluation) is created for the proposal creator; evaluator access on that line item/round moves to the proposal creator — proposal_helper.rb:402-413, 1197-1231, 671-691
3. Expired: proposal → `active`, scores back to `draft` — :415-424
4. Withdrawn: proposal → `withdrawn`, scores back to `draft` — :426-435
No new draft proposal is copied for technical proposals (only for award proposals) — :437-451.

### event_group_line_item#update_egli — PATCH /api/event_group_line_item/update_egli — change line-item evaluators: checks (part 1)
The buyer changes who evaluates one RFP line item. Console (`config/app_auth_config.yml:1204`). Params: `form_id`, `add_evaluators`, `remove_evaluators`, `resend_evaluation` (lists of `{shared_with_type, shared_with_id}`).
Checks, in order:
1. Form not found → 2 "Insufficient parameters" (HTTP 422) — app/controllers/api/event_group_line_item_controller.rb:8-10
2. User may not update the round (TradeRequestPolicy#update_egli? = update?) → 455 "You are not authorized to perform this action" (HTTP 422) — :12, app/policies/trade_request_policy.rb:196-198
3. Round void/cancelled → 4 "Request not found"; not visible to the user → 536 "You are not allowed to view this event." (HTTP 422) — :13-14, app/controllers/concerns/trade_controller_helper.rb:2214-2222
4. Round not inside its evaluation window (after bid end / response review end, before extra closing time) → 741 "You can update evaluators only in evaluation time." (HTTP 422) — :15, app/models/trade_request.rb:954-968

### event_group_line_item#update_egli — PATCH /api/event_group_line_item/update_egli — what add/remove/resend do (part 2)
Side effects — app/helpers/api/evaluations_helper.rb:722-747:
1. add_evaluators: evaluator access on the line item, user added to `evaluator_user_ids` and the round's `trade_identifiers`, "notify_evaluators" email queued (RfpEmailNotificationWorker); when the adder is a planner, the planner's draft scores for that line item are copied to the new evaluator — :725-729, 114-146, 178-207
2. remove_evaluators: their evaluator access set in_active, their non-final scores set in_active, evaluations left with no other scores set in_active, and they lose round visibility unless they still evaluate/own another line item — :730-732, 1004-1051
3. resend_evaluation: their non-final scores and evaluations go back to `draft` so they can re-submit — :733-735, 1053-1059
4. "Pending on evaluator" for the line item is recomputed — :736, 739-747

### Evaluator assignment at RFP creation — evaluator_config and fund center
How line-item evaluators are set when the RFP's forms are created — app/helpers/api/forms_helper.rb:907-935.
State rules:
1. Evaluators sent with the form become `owner` and `evaluator` of the line item, and the line item is marked pending on them — forms_helper.rb:918-921
2. For PR-linked line items extra users are added as `editor`: with company configuration `evaluator_config`, users matching its source entities (`source_entity_mode` AND/OR) filtered by target entities (`target_entity_mode`, default AND); without it, planners in the PR item's fund center or WBS element — forms_helper.rb:923-934, app/helpers/api/evaluations_helper.rb:249-303, app/models/company.rb:1388-1390
3. Vendor-assessment sections get Form-level `evaluator` and `owner` access when sent with the template — app/controllers/concerns/trade_template_helper.rb:1894-1895, evaluations_helper.rb:148-176
Each evaluator is added to the round's `trade_identifiers` (`u<user_id>`) to see it — evaluations_helper.rb:128, 143-144.

### trade#request_tr_reevaluation — PATCH /api/v1/trade/:id/request_tr_reevaluation — ask for re-evaluation (part 1)
The buyer asks the original evaluator to re-score evaluated line items (or the lot) of a technical round. Console only. Params: `form_ids`, `line_item_evaluation`, `remarks`.
Checks, in order:
1. TradeRequest show? policy fails → 455 (HTTP 422) — app/controllers/api/v1/trade_controller.rb:1348
2. No `id` → 2 "Insufficient parameters" (HTTP 422) — :1349
3. Not an active RFI/RFP of the workspace → 4 "Request not found" (HTTP 422) — :1350-1351
4. Not in the evaluation window (extra closing time) → 101 "You are not allowed to perform this action" (HTTP 422) — :1352
5. Lot-level context (lot-based RFP, or both-evaluation without `line_item_evaluation=true`), not section-wise → `form_ids` replaced by the lot forms — :1354-1361, app/models/model_helpers/trade_request_model_helper.rb:1462-1469
6. A form id not visible to the user → 786 "Select correct line items for reevaluation" (HTTP 422) — :1363-1366. Missing `form_ids` in line-item mode → untyped 500 (defect-shaped)

### trade#request_tr_reevaluation — PATCH /api/v1/trade/:id/request_tr_reevaluation — blocked states and effect (part 2)
Per form, any "disabled reason" → 786 "Select correct line items for reevaluation" (HTTP 422) — app/controllers/api/v1/trade_controller.rb:1376-1384. Reasons (app/controllers/concerns/trade_controller_helper.rb:5649-5733): line item deleted; latest technical proposal requested, draft, rejected or reevaluated; score still draft/peer_review/in approval or already reevaluation_requested; line item in an award proposal under approval; PO in progress/generated/failed.
Then an open re-evaluation request on the form → 787 "Reevaluation already Requested" (HTTP 422) — app/helpers/api/additional_requests_helper.rb:554-555.
Side effects: one AdditionalRequest per score, requested from the form's creator/evaluator with `change_requested.status = reevaluated`; each score → `reevaluation_requested`; TrReevaluationNotificationWorker "trigger"; MCP cache invalidated — additional_requests_helper.rb:556-584, trade_controller.rb:1386-1390. A form with no scores → `nil.item` untyped 500 (unverified reachability).

### trade#resolve_tr_reevaluation_request — PATCH /api/v1/trade/:id/resolve_tr_reevaluation_request/:form_uuid — evaluator answers: checks (part 1)
The evaluator accepts or rejects a re-evaluation request. Console only. Params: `request_action` (accept/reject), `form_id` (an integer read from the body; the `:form_uuid` path segment is not used), `remarks`.
Checks, in order:
1. 455 / 2 / 4 / 101 exactly as request_tr_reevaluation (policy, id, active RFI/RFP, evaluation window) — app/controllers/api/v1/trade_controller.rb:1396-1400
2. `request_action` not accept/reject → 2 "Insufficient parameters" (HTTP 422) — app/helpers/additional_request_resolution_helper.rb:1146
3. Form not visible to the user (a string `form_id` never matches) → 101 "You are not allowed to perform this action" (HTTP 422) — :1147-1149
4. No open request for that form → 4 "Request not found" (HTTP 422) — :1153-1156
5. User is not the person the request was sent to → 101 — :1160
Errors from re-creating the evaluation (part 2) return their code (15) — :1184-1185.

### trade#resolve_tr_reevaluation_request — PATCH /api/v1/trade/:id/resolve_tr_reevaluation_request/:form_uuid — accept vs reject (part 2)
State rules:
1. Reject: the form's (lot) or line item's scores go back to `active`, request resolution `not_accepted` with the remarks — app/helpers/additional_request_resolution_helper.rb:1162-1176
2. Accept: request `accepted`, score → `reevaluated`; the old evaluation becomes `reevaluated` and a new `draft` evaluation copies its other scores plus a new draft score for this item; technical proposals holding that score → `reevaluated` — :1177-1186, 1197-1210, app/helpers/api/evaluations_helper.rb:51-92
3. The evaluator then re-scores with POST /api/evaluations and submits again; old proposal score ids are re-pointed to the new scores — app/models/evaluation.rb:50-77
Side effects: TrReevaluationNotificationWorker with the action; MCP cache invalidated — :1190, app/controllers/api/v1/trade_controller.rb:1408.

### trade#line_items_for_reevaluation and trade#reevaluation_remarks — GET — re-evaluation screens
line_items_for_reevaluation (GET /api/v1/trade/:id/line_items_for_reevaluation, console only) lists forms with proposal/item status and disabled reason. Checks: 455 (show? policy), 2 (no id), 4 (not an active RFI/RFP of the workspace), 101 (not in evaluation window) — app/controllers/api/v1/trade_controller.rb:1310-1343.
reevaluation_remarks (GET /api/v1/trade/reevaluation_remarks/:id, console AND vendor app) returns the requested/accepted re-evaluation remarks of a line item. Checks: 455, 2 (no id), 4 (line item not found), then on the event's RFP: 4 if missing/void/cancelled, 536 "You are not allowed to view this event." if not visible — trade_controller.rb:825-840, app/controllers/concerns/trade_controller_helper.rb:2214-2222.

### proposal#create — POST /api/proposal — start an award proposal
The buyer opens awarding for an event (or one lot) and gets a draft award proposal. Console only. Params: `event_group_id`, `lot_no`, `is_awarding_with_excel`.
Checks, in order:
1. Event not found or not active → 2 "Insufficient parameters" (HTTP 422) — app/controllers/api/proposal_controller.rb:49-50
2. Event is an older version (a newer version exists) → 101 "You are not allowed to perform this action" (HTTP 422) — :51, app/models/versioning/methods.rb:72-74
3. User may not update the event (workspace + trade create permission) → 455 "You are not authorized to perform this action" (HTTP 422) — :52, app/policies/event_group_policy.rb:37-40, 68-70
4. An award proposal already `requested`/`selected` (that lot; no lot = any) → 573 "The proposal has already been submitted" (HTTP 422) — app/helpers/api/proposal_helper.rb:22-24, 931-938
5. User already has a draft for this event/lot → it is returned, no more checks — :25-28
6. Award-time rule (next section) → 720 "You are not allowed to award in bidding time" (HTTP 422) — :29-31
7. Save fails → 15 "Operation failed" (HTTP 422) — :32-37

### Award while bidding is still open — the only time gate
Can a buyer award while the price round is still open? Yes, by default. The only time gate is in proposal#create: round config `is_order_allowed_to_close_in_extra_closing_time_only` ("allow to close order in extra time only", config/locales/en-IN.yml:210) on the latest commercial round. When true and the round is NOT in its extra closing time → 720 "You are not allowed to award in bidding time" (HTTP 422) — app/controllers/concerns/event_group_controller_helper.rb:629-648, app/models/model_helpers/trade_request_model_helper.rb:124-126.
The window runs from bid end (or response review end) to `extra_closing_time` (app/models/trade_request.rb:954-968), so with the flag on awarding is ALSO refused after extra time ends or when none is set. Flagged rounds default extra time to bid end + 30 min; dutch forces it off — app/controllers/concerns/trade_controller_helper.rb:3386, 3523-3525.
add_response, submit and bid selection (select_bid_v2) have no bid-end-time check — app/controllers/concerns/bids_controller_helper.rb:1539-1551, 2005-2030. (unverified: whether a company configuration seeds the round flag.)

### proposal#add_response — POST /api/proposal/:id/add_response — add or remove awarded vendors (part 1)
The buyer adds or removes vendor/line-item awards in their draft proposal. Console only. Body `responses`: `{ "<vendor_uuid>": { action: "add"|"remove", egli_ids: [...], egli_data: { "<line_item_uuid>": { awarded_quantity, <buyer-editable widgets> } } } }`.
Checks, in order:
1. Same proposal changed within 3 s → 516 "Transaction in Progress" (HTTP 422) — app/controllers/api/proposal_controller.rb:12, 353-364
2. Proposal not a `draft` created by this user → 721 "Proposal does not exists" (HTTP 422) — :61-62
3. Proposal company not in user's allowed companies (procol employees pass) → 455 (HTTP 422) — :63, app/policies/proposal_policy.rb:18-23
4. Another proposal of the event/lot already requested/selected → 573 "The proposal has already been submitted" (HTTP 422) — app/helpers/api/proposal_helper.rb:44-46
5. Per-vendor checks (part 2), TNA/Regret (part 3), quantity (part 4); save failure → 15 — :1084-1089, 297-300

### proposal#add_response — POST /api/proposal/:id/add_response — per-vendor checks (part 2)
Checks, in order, for each vendor in `responses`:
1. A line item that is not an active line item of the event (or of the lot) → 738 "Proposal product not found." (HTTP 422) — app/helpers/api/proposal_helper.rb:1084
2. Vendor has no rankable bid in the latest commercial round → 826 "Awarded vendor is not present in the latest stage" (HTTP 422) — :1085-1086, 1040-1042
3. TNA / Regret block (part 3) and quantity checks (part 4) — only for `action=add` — :1088-1089
State rules: any `action` other than "add" is treated as remove — :1097, 1111-1119. Line item uuids in `egli_data` are decoded and, when present, replace `egli_ids` — :61-62.
Defect-shaped: a vendor entry with neither `egli_ids` nor `egli_data` → untyped 500 (`nil - …`) — :1083-1084. The first failing vendor stops the call; earlier vendors are not saved (save happens at the end) — :57-71.

### proposal#add_response — POST /api/proposal/:id/add_response — TNA / Regret vendors cannot be awarded (part 3)
Awarding a technically rejected vendor. Only for `action=add` on award proposals and only when company configuration `restrict_awarding_for_tna_vendors` is on — app/helpers/api/proposal_helper.rb:1244-1250.
Checks, in order:
1. Vendor-level score (vendor assessment) equals Regret → 1134 "You cannot award to this vendor as this vendor is marked as Regret"; equals TNA → 1137 "You cannot award to this vendor as this vendor is marked as TNA" (HTTP 422) — :1256-1257, 16-19
2. A selected line item scored Regret for the vendor → 1136 "One or more selected line items cannot be awarded as they have been marked as Regret"; TNA → 1135 "One or more selected line items cannot be awarded as they have been marked as TNA" (HTTP 422) — :1259-1265
Skips: TNA is allowed when the latest commercial round has `misc.allow_tna_vendors_to_bid = true`; Regret is always blocked; events with no TNA/Regret label skip it — :1271-1280, app/models/model_helpers/trade_request_model_helper.rb:1627-1630. With the configuration off, TNA/Regret vendors can be awarded.

### proposal#add_response — POST /api/proposal/:id/add_response — quantity checks (part 4)
Over-awarding a line item. Only for `action=add`, per line item — app/helpers/api/proposal_helper.rb:1287-1322.
Checks, in order:
1. Vendor has no bid data on the line (`precomputed_data[vendor]` blank) → 715 "Bid not present on this line item" (HTTP 422) — :1308
2. `awarded_quantity` sent, company config `is_over_awarding_allowed` on, line linked to a PR: ceiling = max(line qty, PR open qty × (1 + tolerance%) − qty in other events); above it → 561 "You cannot select bid with more than requested quantity." (HTTP 422); also 561 if `is_partial_awarding_enabled` is off and total awarded is BELOW line qty — :811-833
3. Over-awarding on, no PR link → no check — :834-835
4. Partial awarding on: already awarded + this qty > line qty → 561 — :836-837
5. `awarded_quantity` sent with neither config → NO check — :822-838
6. Not sent: other awarded vendors' bid qty + this vendor's bid qty > line qty → 561 — :839-842
"Already awarded" = others' `awarded_quantity` (partial on) or bid quantity (off) — :1324-1334.

### Award with zero quantity — awarded_quantity 0 and ₹0 values
What happens when a buyer awards a vendor with awarded quantity 0.
State rules:
1. `awarded_quantity: 0` (or "0") counts as sent (Ruby `present?`): with partial awarding on it passes, with no quantity config it is unchecked, with over-awarding on for a PR-linked line and partial off it fails 561 (below line qty) — app/helpers/api/proposal_helper.rb:820-838
2. Proposal value per line: the master QCS `proposal_value` formula when configured (a 0 variable is replaced by the vendor's precomputed value), else the round's `proposal_value_source` widget, else the full bid line gross total — so without a formula a 0-quantity award adds the full bid amount to the totals (unverified end to end) — :1003-1030, 974-992
3. Comparison "Awarded <widget>" columns show 0 (₹0) when no line has awarded quantity > 0 — app/controllers/concerns/awarded_quantity_widgets_helper.rb:207-230
On submit the bid line is still selected (closed) — app/controllers/concerns/bids_controller_helper.rb:1568-1577.

### proposal#add_response — POST /api/proposal/:id/add_response — BOQ awarding, totals and saved data (part 5)
How the proposal is built.
State rules:
1. BOQ events: a vendor is awarded ALL line items it bid on in the latest round, ignoring sent `egli_ids`; with `is_awarding_with_excel` and company config `is_awarding_items_wise_in_boq_allowed` on, item-wise awarding is used instead — app/helpers/api/proposal_helper.rb:873-883, 74-104, 1048-1055
2. Per vendor the proposal keeps round id, bid id, line item ids, total amount and `egli_data`; a vendor left with no line items is removed — :1123-1131
3. Totals `total_l1_proposal` (vendor rank 1 on the line) and `total_non_l1_proposal` move with add/remove — :1092-1096, 994-1001, 1109-1121
4. Buyer-editable master QCS widgets in `egli_data` are written onto the bid lines when the award closes — :1178-1195
5. Base-currency rounds convert values to base currency — :1024-1028
Side effects: meta_data stores `total_selected_eglis_in_proposal` (used by 791) and `show_allocation_summary_v1` — :270-302.

### proposal#submit — POST /api/proposal/:id/submit — submit the award: entry checks (part 1)
The buyer submits the award proposal; it goes for approval or is awarded at once. Console only. Params: `approval_flow_id`, `remarks`, `attachments`, `peer_id`, `step_uuid_vs_user_uuid`, `send_loa`.
Checks, in order:
1. Proposal not a `draft` created by this user → 2 "Insufficient parameters" (HTTP 422) — app/controllers/api/proposal_controller.rb:82-83
2. Empty proposal (no `responses_hash` / no vendors) → 683 "Proposal cannot be empty. Please award the vendors again." (HTTP 422) — :84-86
3. More than 10 attachments → 472 "You can attach a maximum of 10 files. Please remove some attachments and try again." (HTTP 422) — :87-90, app/models/remark.rb:29
4. Company mismatch → 455 (HTTP 422) — :95, app/policies/proposal_policy.rb:29-31
5. Budget check (part 2) — app/helpers/api/proposal_helper.rb:114-119
6. An awarded bid was since revised by the vendor → 1126 "A few bids have been revised. Please re-award to continue." (HTTP 422) — :121-125, 241-250

### proposal#submit — POST /api/proposal/:id/submit — race and PO-form checks (part 1b)
Checks that run inside the submit transaction, after part 1:
1. Another award proposal of the event/lot became requested/selected meanwhile (e.g. a colleague submitted first) → untyped 500 (defect-shaped: the helper returns the bare code 573 where the controller expects a hash, and `573[:code]` raises TypeError) — app/helpers/api/proposal_helper.rb:128, app/controllers/api/proposal_controller.rb:98
2. Each vendor's draft PO-form response is activated; a required-field failure returns that code and message — proposal_helper.rb:129-144
3. Unneeded PO-form response mappings are set in_active first (hotfix for duplicates) — :133, 234-239
Note: add_response and proposal#create return a proper 573 for the same situation — proposal_helper.rb:22-24, 44-46.

### proposal#submit — POST /api/proposal/:id/submit — budget validation (part 2)
Only for award proposals on events created from a PR whose customer has a `budget_config`; skipped when a PR matches `skip_pr_conditions` — app/helpers/api/budget_helper.rb:9-20, 47-54.
Checks, in order:
1. No items to validate → 871 "No items found for budget validation" (HTTP 422) — budget_helper.rb:22-23
2. Budget auth call fails → 872 "Budget API authentication failed" (HTTP 422) — :28-30
3. Budget API call fails → 873 "Budget API request failed" (HTTP 422) — :32-35
4. Allocation exceeds budget → 874 with the joined per-item errors as message (default "Budget validation failed") (HTTP 422) — :37-42
Returned before any state change — app/helpers/api/proposal_helper.rb:114-119.

### proposal#submit — POST /api/proposal/:id/submit — approval workflow (part 3)
Uses approval key `close_event_group` ("Bid Proposal", app/models/approval.rb:33, 59).
Checks, in order (app/helpers/api/proposal_approval_helper.rb:10-43):
1. `approval_flow_id` not among the applicable flows (team flows whose trigger rule matches, else company flows; data includes `total_proposal_value_not_exceeding_budget`) → 523 "Invalid Approval" (HTTP 422) — :11-14, 45-63
2. `peer_id` not a team-mate while `peer_review_enabled` → 70 "User does not exist" (HTTP 422) — :22-26
3. Approval request not created → 523 — :36
4. No `approval_flow_id` but a rule applies → 570 "Approval Flow not found" (HTTP 422) — :41
State rules: pending vendor counter offers on the latest round are revoked first; with a flow, proposal → `requested`, LOA generation pending, approver identifiers added to all rounds and the event, and the latest commercial round's submission time is expired (bidding stops) — app/helpers/api/proposal_helper.rb:169-182, 252-268.

### proposal#submit — POST /api/proposal/:id/submit — awarding without approval: checks (part 4)
No applicable approval: the bids are awarded (closed) immediately — app/helpers/api/proposal_helper.rb:183-186, 308-338.
Checks, in order:
1. No latest commercial round → 95 "Trade Request not found" (HTTP 422) — :310
2. Any awarded bid revised → 832 "Bid cannot be awarded as it is already revised." (HTTP 422) — :312-317
3. Per bid (select_bid_v2): vendor blacklisted → 755 "Can't select bid of a blacklisted vendor"; vendor unverified and the round does not allow unverified selection → 588 "You cannot select bid for an unverified vendor."; bid revised → 832 (HTTP 422) — app/controllers/concerns/bids_controller_helper.rb:2005-2017
4. Dummy-event rounds without over-quantity: selected qty + this qty > line qty → 126 "You cannot close this bid as final quantity exceeds the original quantity" (HTTP 422) — bids_controller_helper.rb:2018-2030
5. Save fails → 15 "Operation failed" — proposal_helper.rb:336
The first failing vendor stops the submit with that code — :329-330.

### proposal#submit — POST /api/proposal/:id/submit — awarding without approval: state changes (part 5)
State rules:
1. Awarded bid lines → `selected` (buyer-edited widget values applied); the vendor's other bid lines → `negotiated` — app/helpers/api/proposal_helper.rb:1157-1176
2. Trade products closed (dummy-event rounds keep them active while quantity remains); bid → `selected` — app/controllers/concerns/bids_controller_helper.rb:1568-1627
3. The round is closed when all its products are closed, or for BOQ events when company config `trade_request_close_on_partial_boq` is on — bids_controller_helper.rb:1628-1635
4. Proposal → `selected`, LOA dispatch pending — proposal_helper.rb:332-337
Side effects: audience snapshot when the round has `enable_audience_snapshot_for_proposal` — :188-192, 848-853; document marked active — :187; `remarks`/`attachments` saved as a "proposal_submitted" Remark — app/controllers/api/proposal_controller.rb:99-101; callbacks notify the buyer and refresh event statuses — app/models/proposal.rb:53-64.

### proposal#submit — POST /api/proposal/:id/submit — contract flow (part 6)
When the proposal has contract forms (made by create_contract_form), submit takes the contract path instead of the approval path — app/helpers/api/proposal_helper.rb:148-166.
State rules: bids are closed without creating orders (`skip_order_creation`), then `Contracts::ContractCreationService` runs and its failure code is returned. No approval workflow and no counter-offer revocation on this path — :152-165, 168-193.
Other effects on every submit: `send_loa` (vendor uuid → boolean) sets each vendor's `send_loa` flag — :146, 199-217.

### Award proposal approval outcomes — approved, rejected, expired, withdrawn
What the approval workflow does to an award (EventGroup) proposal when it finishes — app/models/proposal.rb:351-372.
State rules:
1. Approved → the bids are awarded exactly as a no-approval submit (close_bids); its codes (95, 832, 755, 588, 126, 15) go back to the approval flow — app/helpers/api/proposal_helper.rb:394-397
2. Rejected / expired / withdrawn → a draft copy is created (owned by the event owner instead when `restrict_event_visibility_to_owner` is on and the creator is not super admin), PO forms and responses duplicated, LOA documents cleared; old proposal → `rejected` / `active` / `withdrawn` — :402-470, 472-550
3. Save failures → 15 — :444, 448
The new draft keeps `previous_proposal_id` in meta_data — :453-461.

### proposal#approval_workflows_for_proposal_create — GET /api/proposal/:id/approval_workflows — list applicable approval flows
Returns the approval flows the buyer can pick on submit. Console only.
Checks, in order:
1. Evaluating team (section/line/area incharge) → meant to return `{}`, but `render json: {} && return` returns before rendering (unverified: likely an empty 204) — app/controllers/api/proposal_controller.rb:71
2. Proposal not found for this creator → 4 "Request not found" (HTTP 422) — :72-73
3. Company mismatch → 455 (HTTP 422) — :74
Flows: technical proposals use key `technical_evaluation`, award proposals `close_event_group` (with `total_proposal_value_not_exceeding_budget`), reorders `close_reorder`; team flows whose trigger rule is true win over company flows — app/helpers/api/proposal_approval_helper.rb:45-63.

### proposal#discard_draft_proposal — POST /api/proposal/discard_draft_proposal — discard a draft award
Throws away a draft proposal. Console only. Param: `proposal_id`.
Checks, in order:
1. Proposal not found → 2 "Insufficient parameters" (HTTP 422) — app/controllers/api/proposal_controller.rb:181-183
2. Proposal company not in user's allowed companies → 455 (HTTP 422) — :184, app/policies/proposal_policy.rb:41-43
3. Proposal not `draft` → 888 "Invalid Parameters" (HTTP 422) — :185
State rules: proposal → `in_active` — :186. No creator check: any user of the company can discard another user's draft.
Side effects: event snapshot updated on in_active — app/models/proposal.rb:63.

### proposal#create_po_form and proposal#create_contract_form — POST /api/proposal/:id/create_po_form | create_contract_form — PO / contract forms
Build per-vendor PO (or contract) forms on a draft award proposal before submit. Console only.
Checks, in order:
1. Not a draft by this user → 2 "Insufficient parameters" (HTTP 422) — app/controllers/api/proposal_controller.rb:107-108, 192-193
2. Company mismatch → 455; contract form also needs company configuration `is_contract_creation_enabled`, else 455 — :109, 195, app/policies/proposal_policy.rb:33-35
3. Company configuration `disallow_partial_line_item_awarding` on and fewer line items awarded than the event/lot has → 791 "Please ensure all line items are awarded before continuing." (HTTP 422) — :110-111, 197-198, app/helpers/api/proposal_helper.rb:219-232
4. No PO template → 477 "Template not found" (HTTP 422) — proposal_helper.rb:553-555; contract builder failure → its code — proposal_controller.rb:200-205
Side effects: forms and draft vendor template responses created; responses of vendors no longer awarded set in_active — :114-122, 207-220, proposal_helper.rb:652-659.

### proposal — other actions (one line each)
- show (GET /api/proposal/:id): 2 if not found or in_active, 455 on company mismatch; returns vendors, allocation summary, line items and report stage data — app/controllers/api/proposal_controller.rb:14-43
- preview_loa (POST /api/proposal/:id/preview_loa): 2 if not a draft by this user or not an award proposal, 896 "Vendor is not part of this proposal", 895 "Letter of Award template is not configured for this company", 897 "Failed to generate Letter of Award" (all HTTP 422) — :126-161
- get_reorder_approval_workflows (GET /api/proposal/get_reorder_approval_workflows): 2 when uuid/proposal/reorder missing; lists `close_event_group` flows — :163-178

### Awarded quantity widgets — "Awarded <widget>" columns in comparison
When the master QCS template config lists `awarded_quantity_widget_keys`, the comparison view adds a copy of each listed global widget of the latest commercial round, named "Awarded <name>" with key `awarded_<key>` and the default currency prefix — app/controllers/concerns/awarded_quantity_widgets_helper.rb:23-77, app/controllers/concerns/event_group_controller_helper.rb:182-195.
State rules:
1. Values only for a vendor layer with a proposal and a latest bid; otherwise the original value is kept — awarded_quantity_widgets_helper.rb:182-195
2. No line item with awarded quantity > 0 → every awarded widget is 0 (₹0) — :207, 226-229
3. Otherwise formulas are re-evaluated with `participant_quantity` replaced by `awarded_quantity` per line — :209-225, 154-162
A key listed in the template but missing from the round's global widgets → `cloned_widget` nil → untyped 500 (defect-shaped, config error) — :55-66.

### Auto awarding — AutoAwardWorker and AutoAwardingService (part 1)
Automatic award of the L1 vendor when a commercial round ends, enabled by round config `auto_awarding_enabled` (a hash of scenario → action) — app/models/trade_request.rb:2664-2670.
State rules:
1. Scheduled at bid end + 3 s when the round has auto awarding on — trade_request.rb:3227-3234
2. Worker stops if disabled, before bid end, or round not `active` (re-scheduling itself if bid end is still ahead) — app/workers/auto_award_worker.rb:7-14
3. Timeline in `misc`: in_progress, then completed or aborted with reasons — :16-30
4. Line-item closing: each product's rank-1 vendor bid lines are awarded; lot closing: the rank-1 vendor's whole bid — app/services/auto_awarding_service.rb:16-44
5. Awarding uses select_bid_v2 (same 755/588/832/126 checks) as the round owner; any error raises inside the transaction, so nothing is awarded and Sidekiq retries (retry: 2) — auto_awarding_service.rb:48-56, 137-143, auto_award_worker.rb:5, 20-27
No award proposal is created by auto awarding.

### Auto awarding — abort scenarios (part 2)
When auto awarding aborts instead of awarding — app/services/auto_awarding_service.rb:86-135.
State rules:
1. No bid for the rank-1 vendor (or no ranks at all) → aborted "No bid found to Auto Award"; in line-item mode ONE product without a bid aborts the whole round — :90, 22-23
2. Only scenarios configured in `auto_awarding_enabled` are checked: `pending_counter_offers` ("Pending counter offers are present"), `tie_bid` (tie on L1 → "Tie bid on L1 vendor"), `price_increase_approval` ("Price increase approval is pending") — :8, 92-116
3. A matching configured scenario ALWAYS aborts: the "auto_award" action and tie splitting are TODO stubs — :121-135
4. Unconfigured scenarios are ignored, so a tie is awarded to whichever bid ranks first — :111

### MCP awarding tools — fetch_awarding_scenarios and apply_awarding_scenario
The assistant (MCP) can draft an award — app/services/mcp/awarding_tools/handler.rb.
State rules:
1. fetch_awarding_scenarios: event missing → "Can not find rfx"; not active → "RFX is not live. Can not create proposal for it"; offers "l1_vendor", plus "last_po_vendor" when a line item has a last PO vendor code — handler.rb:48-73
2. apply_awarding_scenario: event missing / not active refused; any active/selected/requested proposal → "Proposal already Created for this RFX. Can not create another proposal"; lot-split events refused — :75-87, app/models/proposal.rb:75
3. Then proposal#create rules (573, 720, 15); every audience vendor removed from all line items; the L1 vendor (or last-PO vendor by vendor code) added per line via add_response rules (738, 826, TNA/Regret, 715, 561) — handler.rb:89-109, 141-198
4. It only builds the DRAFT; submitting is left to the buyer — :111-120
A coded error is returned as `I18n.t("api_errors.<code>")`, the whole hash rather than the message (defect-shaped) — handler.rb:90, 100, 107.

### Proposal and evaluation statuses — reference
Proposal: in_active 0, active 1, selected 2, draft 3, requested 4, rejected 5, withdrawn 6, reevaluated 7 — app/models/proposal.rb:50. "Active" proposals = active/selected/requested (proposal.rb:75); the award-create block uses requested/selected only (app/helpers/api/proposal_helper.rb:931-938).
Evaluation: in_active, active, draft, requested, revised, peer_review, reevaluated — app/models/evaluation.rb:34.
Evaluation score: in_active, active, draft, requested, revised, peer_review, rejected, reevaluation_requested, reevaluated — app/models/evaluation_score.rb:42-45.
Score lifecycle: `draft` → submit → `peer_review` (incharge) / `requested` (approval) / `active` → re-evaluation `reevaluation_requested` → accepted `reevaluated` (new draft) or rejected back to `active`; approval rejection → `rejected` (creator gets a new draft).
Technical proposals: `item_type = TradeRequest`; award proposals: `item_type = EventGroup` with `meta_data.lot_no` — app/helpers/api/evaluations_helper.rb:432-450.

## Error codes in this area

### Evaluation error codes (part 1)
- 2 (HTTP 422) "Insufficient parameters" — evaluations#create bad payload / score not a label key (app/services/evaluations/validate_service.rb:23-28, 49-75); evaluations#submit no line-item mappings or no section form_id (app/controllers/api/evaluations_controller.rb:60, 87)
- 15 (HTTP 422) "Operation failed" — evaluation save errors (message = model errors) and section-wise question errors (app/helpers/api/evaluations_helper.rb:41, 47, 834-895)
- 33 (HTTP 422) "Order not active" — evaluations#create/submit when the round is not an active RFI/RFP or bid end time has not passed (evaluations_controller.rb:14-26, 41-44)
- 101 (HTTP 422) "You are not allowed to perform this action" — evaluator not allowed (validate_service.rb:30-35, 77-100); section not assigned (evaluations_helper.rb:862, custom message); submit company check (evaluations_controller.rb:46)
- 516 (HTTP 422) "Transaction in Progress" — duplicate create/submit within 3 s (evaluations_controller.rb:113-141); add_response (app/controllers/api/proposal_controller.rb:353-364)

### Evaluation error codes (part 2)
- 571 (HTTP 422) "Please, evaluate on all fields" — evaluations#submit with incomplete scoring (evaluations_controller.rb:69, app/helpers/api/evaluations_helper.rb:604-673)
- 789 (HTTP 422) "Evaluation Score can be filled only in evaluation period" — evaluations#create on a running vendor-onboarding v2 round (app/controllers/api/evaluations_controller.rb:23)
- 1124 (HTTP 422) "This vendor has an inactive vendor profile. Reject this bid to proceed with comparison." — vendor not found / not a vendor of the buyer (evaluations_helper.rb:12-17)
- 455 (HTTP 422) "You are not authorized to perform this action" — Pundit policy failures (app/controllers/concerns/api_auth.rb:117-119)
- 523 (HTTP 422) "Invalid Approval", 570 (HTTP 422) "Approval Flow not found", 70 (HTTP 422) "User does not exist" — approval checks on evaluations#submit action_type=proposal_submit and proposal#submit (app/helpers/api/proposal_approval_helper.rb:13, 25, 36, 41)

### Re-evaluation and evaluator error codes
- 4 (HTTP 422) "Request not found" — re-evaluation round or open request missing (app/controllers/api/v1/trade_controller.rb:1315, 1351, 1399; app/helpers/additional_request_resolution_helper.rb:1156); update_egli on a void/cancelled round
- 536 (HTTP 422) "You are not allowed to view this event." — update_egli / reevaluation_remarks on an event the user cannot view (app/controllers/concerns/trade_controller_helper.rb:2219-2222)
- 741 (HTTP 422) "You can update evaluators only in evaluation time." — update_egli outside the evaluation window (app/controllers/api/event_group_line_item_controller.rb:15)
- 786 (HTTP 422) "Select correct line items for reevaluation" — request_tr_reevaluation with bad or blocked forms (trade_controller.rb:1365, 1381)
- 787 (HTTP 422) "Reevaluation already Requested" — open re-evaluation request exists (app/helpers/api/additional_requests_helper.rb:555)
- 101 (HTTP 422) "You are not allowed to perform this action" — re-evaluation outside the evaluation window or by a non-requested evaluator (trade_controller.rb:1352, 1400; additional_request_resolution_helper.rb:1160)

### Award error codes (part 1)
- 573 (HTTP 422) "The proposal has already been submitted" — proposal#create / add_response when the event/lot already has a requested/selected proposal (app/helpers/api/proposal_helper.rb:22-24, 44-46); in proposal#submit it surfaces as an untyped 500 (proposal_helper.rb:128)
- 720 (HTTP 422) "You are not allowed to award in bidding time" — proposal#create with round flag is_order_allowed_to_close_in_extra_closing_time_only outside extra time (proposal_helper.rb:29-31)
- 721 (HTTP 422) "Proposal does not exists" — add_response on a non-draft or someone else's proposal (app/controllers/api/proposal_controller.rb:62)
- 738 (HTTP 422) "Proposal product not found." — add_response line item not in the event/lot (proposal_helper.rb:1084)
- 826 (HTTP 422) "Awarded vendor is not present in the latest stage" — add_response vendor without a rankable bid in the latest round (proposal_helper.rb:1086)

### Award error codes (part 2)
- 715 (HTTP 422) "Bid not present on this line item" — add_response vendor has no bid on the line (app/helpers/api/proposal_helper.rb:1308)
- 561 (HTTP 422) "You cannot select bid with more than requested quantity." — add_response quantity rules (proposal_helper.rb:811-842)
- 683 (HTTP 422) "Proposal cannot be empty. Please award the vendors again." — proposal#submit with no vendors (app/controllers/api/proposal_controller.rb:84-86)
- 1126 (HTTP 422) "A few bids have been revised. Please re-award to continue." — proposal#submit with a revised bid (proposal_helper.rb:241-250)
- 832 (HTTP 422) "Bid cannot be awarded as it is already revised." — close_bids / select_bid_v2 (proposal_helper.rb:316, app/controllers/concerns/bids_controller_helper.rb:2016)
- 472 (HTTP 422) custom "You can attach a maximum of 10 files. Please remove some attachments and try again." — proposal#submit (proposal_controller.rb:88-90)

### Award error codes (part 3) — TNA / Regret
- 1134 (HTTP 422) "You cannot award to this vendor as this vendor is marked as Regret" — add_response with restrict_awarding_for_tna_vendors (app/helpers/api/proposal_helper.rb:17, 1257)
- 1137 (HTTP 422) "You cannot award to this vendor as this vendor is marked as TNA" — same (proposal_helper.rb:17, 1257)
- 1135 (HTTP 422) "One or more selected line items cannot be awarded as they have been marked as TNA" — same, line level (proposal_helper.rb:18, 1264)
- 1136 (HTTP 422) "One or more selected line items cannot be awarded as they have been marked as Regret" — same, line level (proposal_helper.rb:18, 1264)

### Award error codes (part 4) — closing bids and budget
- 95 (HTTP 422) "Trade Request not found" — awarding with no latest commercial round (app/helpers/api/proposal_helper.rb:310)
- 755 (HTTP 422) "Can't select bid of a blacklisted vendor" — select_bid_v2 (app/controllers/concerns/bids_controller_helper.rb:2007)
- 588 (HTTP 422) "You cannot select bid for an unverified vendor." — select_bid_v2 (bids_controller_helper.rb:2008-2010)
- 126 (HTTP 422) "You cannot close this bid as final quantity exceeds the original quantity" — select_bid_v2 on dummy-event rounds (bids_controller_helper.rb:2027)
- 871 / 872 / 873 / 874 (HTTP 422) "No items found for budget validation" / "Budget API authentication failed" / "Budget API request failed" / "Budget validation failed" (874 message replaced by per-item errors) — proposal#submit budget check (app/helpers/api/budget_helper.rb:23, 30, 35, 41)

### Award error codes (part 5) — forms, LOA, discard
- 888 (HTTP 422) "Invalid Parameters" — discard_draft_proposal on a non-draft (app/controllers/api/proposal_controller.rb:185)
- 791 (HTTP 422) "Please ensure all line items are awarded before continuing." — create_po_form / create_contract_form with disallow_partial_line_item_awarding (app/helpers/api/proposal_helper.rb:230)
- 477 (HTTP 422) "Template not found" — create_po_form without a PO template (proposal_helper.rb:555)
- 895 (HTTP 422) "Letter of Award template is not configured for this company" — preview_loa (proposal_controller.rb:137)
- 896 (HTTP 422) "Vendor is not part of this proposal" — preview_loa (proposal_controller.rb:133-134)
- 897 (HTTP 422) "Failed to generate Letter of Award" — preview_loa (proposal_controller.rb:145-147)
