# Changing a draft round through the round-update call

Cases for `PATCH /trade/:id` sent to a round that is still a DRAFT (the event has not been published). On a live round
this call is the "extend the bid end / add a remark / change a setting" call and works (API-XPUB-058…075). On a draft
round the controller does something else: it hands the request to the draft branch (`edit_draft`), which re-runs the
whole stage save (configurations, templates, line items) as if the body were a complete stage. These cases come from a
lead the support-ticket pipeline found (synthetic ticket 900000003, "technical round ending after the RFQ"): moving a
draft technical round's end answered HTTP 500. Every case is grounded in `procol-backend` at `origin/main`. Cases whose
Trace names an `EVD2-DRF-NNN` id have a runnable twin in `prototype/data/deep2-cases/drf.json`, run on its own fresh
draft event; a failure is re-run on a second fresh event.

**What the runs showed (PROCOL DEMO 198678, 2026-10-03).** All seven twins answered HTTP 500 on two fresh events each —
including an EMPTY body. So the trigger is not the time field or the RFP/RFQ order: any partial body sent to a draft
round reaches the full stage save and breaks inside it.

## 1. Partial updates to a draft round

#### API-EVDDRF-001 — Moving a draft technical round's end past the pricing round's end does not break the server
- **Why it matters.** This is exactly what a buyer (or an integration) does while preparing a two-round event, and the publish-time rule (code 712) can only be exercised if the draft can be edited first. A 500 here hides the rule and leaves the buyer with no message.
- **Setup.** A fresh draft event with a technical (RFP) round and a pricing (RFQ) round, not published.
- **Steps.** 1. As the buyer, `PATCH /trade/{{rfpTradeId}}` with `{"increase_auction_time": <RFQ end + 3600>, "remarks": "QA_Platform_extend_{{stamp}}"}`.
- **Expected.** The change is applied or refused cleanly (a 4xx with a message). Never a server error. Today: HTTP 500.
- **Oracle.** Any 2xx/4xx passes; a 5xx is the defect.
- **Trace.** P1 · automate · `EVD2-DRF-001` · `app/controllers/api/trade_controller.rb:594-603` · `app/controllers/api/trade_controller.rb:796-809` · `app/controllers/concerns/trade_controller_helper.rb:3906-3936`

#### API-EVDDRF-002 — Moving a draft technical round's end to before the pricing round's end does not break the server
- **Why it matters.** The legal direction must work too; it shows the crash is not about the 712 rule.
- **Setup.** A fresh draft event with an RFP round and an RFQ round.
- **Steps.** 1. As the buyer, `PATCH /trade/{{rfpTradeId}}` with `increase_auction_time` = RFQ end − 60 s and a remark.
- **Expected.** Applied or refused cleanly; never a 5xx. Today: HTTP 500.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EVD2-DRF-002` · `app/controllers/api/trade_controller.rb:603,796-809`

#### API-EVDDRF-003 — A remark alone sent to a draft technical round does not break the server
- **Why it matters.** Pins the trigger: no time field at all.
- **Setup.** A fresh draft event with an RFP round and an RFQ round.
- **Steps.** 1. As the buyer, `PATCH /trade/{{rfpTradeId}}` with only `{"remarks": "QA_Platform_extend_{{stamp}}"}`.
- **Expected.** Applied or refused cleanly; never a 5xx. Today: HTTP 500.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EVD2-DRF-003` · `app/controllers/api/trade_controller.rb:603,796-809`

#### API-EVDDRF-004 — An empty update to a draft technical round does not break the server
- **Why it matters.** The smallest possible request: if this breaks, every partial edit of a draft round does.
- **Setup.** A fresh draft event with an RFP round and an RFQ round.
- **Steps.** 1. As the buyer, `PATCH /trade/{{rfpTradeId}}` with `{}`.
- **Expected.** Refused cleanly (e.g. missing parameters) or a no-op; never a 5xx. Today: HTTP 500.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EVD2-DRF-004` · `app/controllers/api/trade_controller.rb:603,796-809` · `app/controllers/concerns/trade_template_helper.rb:1710-1720`

#### API-EVDDRF-005 — Moving a draft pricing round's end in a two-round event does not break the server
- **Why it matters.** Shows the crash is not specific to technical rounds.
- **Setup.** A fresh draft event with an RFP round and an RFQ round.
- **Steps.** 1. As the buyer, `PATCH /trade/{{tradeId}}` (the RFQ round) with `increase_auction_time` = its end + 3600 and a remark.
- **Expected.** Applied or refused cleanly; never a 5xx. Today: HTTP 500.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EVD2-DRF-005` · `app/controllers/api/trade_controller.rb:603,796-809`

#### API-EVDDRF-006 — Moving the end of a draft RFQ-only round does not break the server
- **Why it matters.** The most common event type; rules out the two-round layout as the cause.
- **Setup.** A fresh draft RFQ-only event, not published.
- **Steps.** 1. As the buyer, `PATCH /trade/{{tradeId}}` with `increase_auction_time` = its end + 3600 and a remark.
- **Expected.** Applied or refused cleanly; never a 5xx. Today: HTTP 500.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EVD2-DRF-006` · `app/controllers/api/trade_controller.rb:603,796-809` · `app/controllers/concerns/trade_controller_helper.rb:3906-3936`

#### API-EVDDRF-007 — An empty update to a draft RFQ-only round does not break the server
- **Why it matters.** Same as 004 on a pricing round.
- **Setup.** A fresh draft RFQ-only event.
- **Steps.** 1. As the buyer, `PATCH /trade/{{tradeId}}` with `{}`.
- **Expected.** Refused cleanly or a no-op; never a 5xx. Today: HTTP 500.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EVD2-DRF-007` · `app/controllers/api/trade_controller.rb:603,796-809`

#### API-EVDDRF-008 — After a failed partial update the draft round is unchanged
- **Why it matters.** The draft branch deactivates the round's forms, access lists and line-item mappings before it rebuilds them (`delete_previous_forms_and_access_lists`, `delete_draft_trade_products_and_associations`). It runs inside a transaction, so a crash should roll everything back — if it does not, the draft silently loses its line items or questionnaire.
- **Setup.** A fresh draft RFP + RFQ event. Manual: the plan runner stops at the first server error, so the read-back cannot follow it yet.
- **Steps.** 1. Send API-EVDDRF-004's empty update (HTTP 500). 2. `GET /trade/{{rfpTradeId}}?response_type=template` and `GET /event_groups/{{eventGroupUuid}}/get_line_items`. 3. Publish the event.
- **Expected.** The round still has its form and the event its line item; publishing works as on an untouched draft.
- **Oracle.** Same form/line counts as before step 1; publish 200.
- **Trace.** P1 · manual · `app/controllers/api/trade_controller.rb:799-809` · `app/controllers/concerns/trade_controller_helper.rb:3918-3930`

#### API-EVDDRF-009 — The publish-time rule still refuses a technical round that ends after the pricing round
- **Why it matters.** The rule the ticket was about (code 712) is checked at publish, and draft rounds are skipped while editing (`trade_controller_helper.rb:643`). With partial draft edits broken, the only way to set up the scenario is to build the technical round with the later end time in the stage body itself.
- **Setup.** A draft RFP + RFQ event whose RFP round was CREATED (POST /trade/template_input) with bid_end_time after the RFQ's. Manual: stage bodies are not runnable in the plan language.
- **Steps.** 1. Publish the event (`PATCH /event_groups/:id` status active with both draft round ids).
- **Expected.** Refused. HTTP 422, code 712 'RFP duration exceeds RFQ end time. Please adjust.'; both rounds stay draft.
- **Oracle.** Code 712; `GET /event_groups/:id` status draft.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:643-675` · `app/services/event_groups/update_service.rb:303-314`
