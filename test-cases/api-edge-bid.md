# Bids and the vendor side — API edge & negative cases

Negative, boundary, workflow and robustness cases for the vendor's side of a sourcing event: participation intent, opening the event, the technical response, and the full bid lifecycle (open → price → submit → revise), plus surrogate bids, line-item regret, cost-breakdown and mandatory T&C.

Each case is one working request with a single thing changed, grounded in the backend at `origin/main`. Paths are relative to the API base. `{{tradeId}}` is the PRICING/RFQ stage; `{{rfpTradeId}}` is the technical/RFP stage; `{{bidUuid}}` is a draft bid an earlier case opened. Cases marked *records current behaviour* document what the code does today where that behaviour is itself the suspected defect.

Read [README.md](README.md) for the case format and priority scale.

## 1. Participation and user intent

The vendor's participate / not-participate answer is `POST /user_intents` (`Api::UserIntentsController#create`, 25 lines). It has presence checks only, and the bid endpoints never read the intent back — so the key workflow cases below record what is *not* guarded.

#### API-XBID-001 — Declaring intent without the event id is refused
- **Why it matters.** item_id links the answer to the event; item_id is NOT NULL, so without the guard this would be a DB error instead of a typed refusal.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Sandbox stage {{tradeId}} is live and the vendor is invited.
- **Steps.** 1. POST /user_intents with the working body minus item_uuid.
- **Expected.** HTTP 422 with error.code 2 'Insufficient parameters' from Api::UserIntentsController#create app/controllers/api/user_intents_controller.rb:14-15 (item_id blank); no user_intents row.
- **Oracle.** Error body {error:{code:2}}; vendor's intent count on the stage unchanged.
- **Trace.** P1 · automate · `EDGE-BID-001` · `app/controllers/api/user_intents_controller.rb:14`

#### API-XBID-002 — Declaring intent without item_type is refused
- **Why it matters.** item_type drives the polymorphic association; blank must never reach the model.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Live sandbox stage.
- **Steps.** 1. POST /user_intents with item_type removed.
- **Expected.** HTTP 422 error.code 2 'Insufficient parameters' from app/controllers/api/user_intents_controller.rb:14-15.
- **Oracle.** No row created.
- **Trace.** P2 · automate · `EDGE-BID-002` · `app/controllers/api/user_intents_controller.rb:14`

#### API-XBID-003 — Declining to participate without any reason is refused
- **Why it matters.** Regret reasons feed the buyer's participation report; a reasonless decline loses the signal the feature exists for.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Live sandbox stage.
- **Steps.** 1. POST /user_intents with intent_type trade_reject and neither reason nor remarks.
- **Expected.** HTTP 422 error.code 2 'Insufficient parameters' from app/controllers/api/user_intents_controller.rb:11-12 — a non-accept intent must carry reason or remarks.
- **Oracle.** No intent row; the buyer's participants table still shows no answer.
- **Trace.** P1 · automate · `EDGE-BID-003` · `app/controllers/api/user_intents_controller.rb:11`

#### API-XBID-004 — An intent with no intent_type is treated as a decline and still needs a reason
- **Why it matters.** Pins the default: an omitted intent_type is a decline, never a silent accept.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Live sandbox stage.
- **Steps.** 1. POST /user_intents with intent_type, reason and remarks all removed.
- **Expected.** HTTP 422 error.code 2 'Insufficient parameters' from app/controllers/api/user_intents_controller.rb:11 (nil is not 'trade_accept'); the default :trade_reject at :19 is never reached.
- **Oracle.** No row.
- **Trace.** P2 · automate · `EDGE-BID-004` · `app/controllers/api/user_intents_controller.rb:19`

#### API-XBID-005 — An unknown intent_type does not crash the server
- **Why it matters.** Rails enums raise on unknown values and the controller assigns the raw param.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Live sandbox stage.
- **Steps.** 1. POST /user_intents with intent_type 'maybe' and a reason.
- **Expected.** Should be a typed 422. intent_type is a Rails enum (app/models/user_intent.rb:33); assigning 'maybe' at app/controllers/api/user_intents_controller.rb:19 raises ArgumentError and nothing rescues it — an untyped 500 is the suspected defect.
- **Oracle.** Status < 500 and error.code present.
- **Trace.** P1 · automate · `EDGE-BID-005` · `app/controllers/api/user_intents_controller.rb:19`

#### API-XBID-006 — An intent against a made-up item_type does not crash
- **Why it matters.** The controller only checks presence of item_type; any string reaches constantize.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Live sandbox stage.
- **Steps.** 1. POST /user_intents with item_type 'QA_Platform_NotAModel_{{stamp}}'.
- **Expected.** Should be 422. belongs_to :item, polymorphic: true (app/models/user_intent.rb:29) constantizes item_type during validation; an unknown class raises NameError — 500 suspected. app/controllers/api/user_intents_controller.rb:18
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-BID-006` · `app/controllers/api/user_intents_controller.rb:18`

#### API-XBID-007 — An intent can only be recorded against an event, not another record type
- **Why it matters.** No allowlist on item_type; intents can be attached to arbitrary records. (This case records current behaviour: the risk is that today's response is the wrong one.)
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). {{userUuid}} is any user in the workspace.
- **Steps.** 1. POST /user_intents with item_type 'User' and item_uuid {{userUuid}}.
- **Expected.** Should be refused — only TradeRequest/EventGroup are meaningful targets. app/controllers/api/user_intents_controller.rb:18-23 has no allowlist of item types, so today a 200 is likely.
- **Oracle.** No user_intents row with item_type 'User'.
- **Trace.** P2 · automate · `EDGE-BID-007` · `app/controllers/api/user_intents_controller.rb:18`

#### API-XBID-008 — An intent on a non-existent event is refused, not silently dropped
- **Why it matters.** `render_success_json if save` with no failure branch turns validation errors into a silent 204.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). None.
- **Steps.** 1. POST /user_intents with item_uuid 'WrongUuid1='.
- **Expected.** Should be a typed 422. If save fails (belongs_to item required) app/controllers/api/user_intents_controller.rb:23 has no else branch, so Rails answers 204 No Content — which every client reads as success.
- **Oracle.** Status is a typed 4xx with a body, not an empty 204.
- **Trace.** P1 · automate · `EDGE-BID-008` · `app/controllers/api/user_intents_controller.rb:23`

#### API-XBID-009 — Accepting to participate needs no reason
- **Why it matters.** The one explicit exemption; a tightening refactor would break the one-click participate button.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Live sandbox stage, vendor invited.
- **Steps.** 1. POST /user_intents with intent_type 'trade_accept' and no reason/remarks.
- **Expected.** HTTP 200 success — app/controllers/api/user_intents_controller.rb:11 exempts trade_accept from the reason rule; saved at :23.
- **Oracle.** One active trade_accept intent for the user on the stage.
- **Trace.** P2 · automate · `EDGE-BID-009` · `app/controllers/api/user_intents_controller.rb:11`

#### API-XBID-010 — Script, SQL-ish and unicode text in regret remarks is stored safely
- **Why it matters.** Regret remarks are shown to the buyer in the participants table — a stored-XSS and length sink.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Live sandbox stage.
- **Steps.** 1. POST /user_intents with remarks containing a script tag, a quote/semicolon SQL fragment, emoji, Devanagari and 5,000 characters.
- **Expected.** 200 or typed 4xx, never 5xx. ParamsAuth#sanitize_input_params (app/controllers/concerns/params_auth.rb:18-20) strips HTML tags; remarks is an unbounded varchar (app/controllers/api/user_intents_controller.rb:21).
- **Oracle.** Participants view shows no surviving <script>.
- **Trace.** P2 · automate · `EDGE-BID-010` · `app/controllers/api/user_intents_controller.rb:21`

#### API-XBID-011 — A numeric reason instead of a list does not crash
- **Why it matters.** Type confusion on a jsonb column the buyer's report later renders.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Live sandbox stage.
- **Steps.** 1. POST /user_intents with reason: 12345.
- **Expected.** 200 or typed 4xx. reason is jsonb; display_intent calls to_s (app/models/user_intent.rb). app/controllers/api/user_intents_controller.rb:20
- **Oracle.** The event's audience list still returns 200 afterwards.
- **Trace.** P2 · automate · `EDGE-BID-011` · `app/controllers/api/user_intents_controller.rb:20`

#### API-XBID-012 — Declining after accepting leaves one effective answer
- **Why it matters.** No supersede logic — two contradictory active intents are possible. (This case records current behaviour: the risk is that today's response is the wrong one.)
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). The vendor already POSTed a trade_accept intent on {{tradeId}}.
- **Steps.**
  1. POST /user_intents trade_accept.
  2. POST /user_intents trade_reject with a reason.
- **Expected.** Expected one effective answer. app/controllers/api/user_intents_controller.rb:18 always inserts a new active row and never deactivates the previous one, so both stay active; the buyer's table (latest) and the trade page (exists?) can disagree.
- **Oracle.** Active intents for (user, stage) = 1, or the older one marked in_active.
- **Trace.** P2 · automate · `EDGE-BID-012` · `app/controllers/api/user_intents_controller.rb:18`

#### API-XBID-013 — A vendor cannot record intent on an event they are not invited to
- **Why it matters.** A write path with no authorization check beyond login. (This case records current behaviour: the risk is that today's response is the wrong one.)
- **Setup.** Session: a vendor NOT on the audience of {{tradeId}}.
- **Steps.** 1. POST /user_intents for {{tradeId}} as the uninvited vendor.
- **Expected.** Should be refused (101). app/controllers/api/user_intents_controller.rb:4-23 performs no audience or ownership check before writing.
- **Oracle.** Buyer's participants table shows no answer from this vendor.
- **Trace.** P1 · automate · `EDGE-BID-013` · `app/controllers/api/user_intents_controller.rb:18`

#### API-XBID-014 — Changing the participation answer after the event closed
- **Why it matters.** No is_running guard — participation history can be rewritten after the event is decided. (This case records current behaviour: the risk is that today's response is the wrong one.)
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). {{tradeId}} has passed its bid_end_time.
- **Steps.** 1. POST /user_intents trade_reject with reason.
- **Expected.** No window check exists in app/controllers/api/user_intents_controller.rb; today 200. Recorded so product decides whether post-close answers may rewrite the participation report.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-BID-014` · `app/controllers/api/user_intents_controller.rb:18`

#### API-XBID-015 — A vendor who never answered participate can still open a bid
- **Why it matters.** The user asked for 'bid without participating'. The only gate is client-side. (This case records current behaviour: the risk is that today's response is the wrong one.)
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Live RFQ stage {{tradeId}}, vendor invited, no user_intents row for this vendor, no technical stage.
- **Steps.**
  1. Skip the participate step.
  2. POST /v1/bids with the working body.
- **Expected.** Today 200 with bid_uuid: Api::V1::BidsController#create (app/controllers/api/v1/bids_controller.rb:11-39) and is_allowed_to_create_bid (app/helpers/api/v1/bids_controller_helper.rb:7-78) never read UserIntent. The UI gates on user_intent_answered; the API does not.
- **Oracle.** A draft bid exists while user_intents has no row for the vendor.
- **Trace.** P0 · automate · `EDGE-BID-015` · `app/helpers/api/v1/bids_controller_helper.rb:7`

#### API-XBID-016 — A vendor who declined to participate can still open a bid
- **Why it matters.** The buyer's report would show the vendor as both declined and bidding. (This case records current behaviour: the risk is that today's response is the wrong one.)
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). The vendor recorded a trade_reject intent on {{tradeId}}; stage is live.
- **Steps.**
  1. POST /user_intents trade_reject.
  2. POST /v1/bids with the working body.
- **Expected.** Should be refused. Nothing in app/controllers/api/v1/bids_controller.rb:11-39 or app/helpers/api/v1/bids_controller_helper.rb:7-78 reads the trade_reject intent, so 200 is expected today; only the legacy surrogate path touches intents (app/controllers/api/bids_controller.rb:521-528, marks them converted).
- **Oracle.** Intent still active trade_reject AND a draft bid exists.
- **Trace.** P0 · automate · `EDGE-BID-016` · `app/controllers/api/v1/bids_controller.rb:11`

#### API-XBID-017 — A vendor who declined can still submit a priced bid
- **Why it matters.** The version that changes ranks and savings: a declined vendor can end up L1. (This case records current behaviour: the risk is that today's response is the wrong one.)
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). trade_reject intent recorded; a priced draft bid {{bidUuid}} exists.
- **Steps.** 1. PATCH /v1/bids/{{bidUuid}} with the working submit body.
- **Expected.** Should be refused. update (app/controllers/api/v1/bids_controller.rb:41-66) → update_bid_helper (app/helpers/api/v1/bids_controller_helper.rb:367-487) has no intent check; success:true expected today and the declined vendor ranks.
- **Oracle.** Bid status active while the intent says trade_reject.
- **Trace.** P0 · automate · `EDGE-BID-017` · `app/helpers/api/v1/bids_controller_helper.rb:367`

## 2. The vendor opens the event

`GET /trade/:id` and `GET /v1/trade/:id/schema` both run `validate_event` (trade_controller_helper.rb:2214): not found → 4, void/cancelled → 4, not viewable → 536. `is_allowed_to_view?` hides drafts from vendors.

#### API-XBID-018 — Opening a non-existent event does not crash
- **Why it matters.** The nil guard is defeated by a fallback query that returns a Relation.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). None.
- **Steps.** 1. GET /trade/WrongUuid1=
- **Expected.** Should be 422 code 4 'Request not found'. Api::TradeController#show replaces a nil trade with `TradeRequest.joins(:bids)...` (app/controllers/api/trade_controller.rb:1067-1068), a Relation that is never nil, so validate_event's `trade.void?` (trade_controller_helper.rb:2216) runs on a Relation — NoMethodError/500 suspected.
- **Oracle.** Status < 500 with a typed body.
- **Trace.** P1 · automate · `EDGE-BID-018` · `app/controllers/api/trade_controller.rb:1068`

#### API-XBID-019 — The schema of a non-existent event is refused cleanly
- **Why it matters.** Contrast case for the /trade/:id crash — same helper, no Relation fallback, correct result.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). None.
- **Steps.** 1. GET /v1/trade/WrongUuid1=/schema
- **Expected.** HTTP 422 error.code 4 'Request not found' from validate_event (app/controllers/concerns/trade_controller_helper.rb:2215), called by Api::V1::TradeController#event_schema (app/controllers/api/v1/trade_controller.rb:265-277).
- **Oracle.** Typed error body.
- **Trace.** P1 · automate · `EDGE-BID-019` · `app/controllers/concerns/trade_controller_helper.rb:2215`

#### API-XBID-020 — An uninvited vendor cannot read a restricted event
- **Why it matters.** Specs, quantities and sometimes target prices are competitor-sensitive.
- **Setup.** Session: a vendor that deals with the buyer but is NOT on the restricted audience of {{tradeId}}.
- **Steps.** 1. GET /trade/{{tradeId}} as that vendor.
- **Expected.** HTTP 422 error.code 536 'You are not allowed to view this event.' from validate_event (app/controllers/concerns/trade_controller_helper.rb:2219-2221); is_allowed_to_view? is false for a restricted audience (app/models/model_helpers/trade_request_model_helper.rb:366-369).
- **Oracle.** No sheets/forms in the body.
- **Trace.** P0 · automate · `EDGE-BID-020` · `app/controllers/concerns/trade_controller_helper.rb:2221`

#### API-XBID-021 — A vendor cannot read an unpublished (draft) stage
- **Why it matters.** Buyers add audiences while drafting; unfinished prices and quantities must stay invisible until publish.
- **Setup.** Session: a vendor already added to the audience of a DRAFT stage {{tradeId}}.
- **Steps.** 1. GET /trade/{{tradeId}} as the vendor.
- **Expected.** HTTP 422 error.code 536 'You are not allowed to view this event.' — is_allowed_to_view? denies drafts vendor-side (app/models/model_helpers/trade_request_model_helper.rb:352-353).
- **Oracle.** No payload.
- **Trace.** P0 · automate · `EDGE-BID-021` · `app/models/model_helpers/trade_request_model_helper.rb:352`

#### API-XBID-022 — A vendor cannot read the schema of a draft stage
- **Why it matters.** The schema carries widget configuration incl. required fields and price validations.
- **Setup.** Session: vendor on the audience of a DRAFT stage {{tradeId}}.
- **Steps.** 1. GET /v1/trade/{{tradeId}}/schema as the vendor.
- **Expected.** HTTP 422 error.code 536 'You are not allowed to view this event.' via event_schema → validate_event (app/controllers/concerns/trade_controller_helper.rb:2219-2221).
- **Oracle.** No schema payload.
- **Trace.** P1 · automate · `EDGE-BID-022` · `app/controllers/concerns/trade_controller_helper.rb:2221`

#### API-XBID-023 — A cancelled stage reads as not found
- **Why it matters.** Vendors keep links in email; a cancelled event must read as gone.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). {{tradeId}} was cancelled or voided by the buyer.
- **Steps.** 1. GET /v1/trade/{{tradeId}}/schema
- **Expected.** HTTP 422 error.code 4 'Request not found' from validate_event (app/controllers/concerns/trade_controller_helper.rb:2216-2217).
- **Oracle.** Typed error body.
- **Trace.** P1 · automate · `EDGE-BID-023` · `app/controllers/concerns/trade_controller_helper.rb:2216`

#### API-XBID-024 — Hostile layer_ids on the schema read do not crash
- **Why it matters.** Query-string ids feed layer filtering unvalidated.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Live stage.
- **Steps.** 1. GET /v1/trade/{{tradeId}}/schema with layer_ids containing a script tag and a quote fragment.
- **Expected.** 200 or typed 4xx. layer_ids is read raw in event_schema (app/controllers/api/v1/trade_controller.rb:264).
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-BID-024` · `app/controllers/api/v1/trade_controller.rb:264`

#### API-XBID-025 — Two teammates of the same vendor see the same participation answer
- **Why it matters.** Company-level vs user-level lookup of the same flag; the second teammate is asked to participate again. (This case records current behaviour: the risk is that today's response is the wrong one.)
- **Setup.** Session: a SECOND user of vendor company {{vendorUuid}}, after the first user answered trade_accept.
- **Steps.**
  1. GET /trade/{{tradeId}} and read user_intent_answered.
  2. GET /v1/trade/{{tradeId}}/schema and read user_intent_answered.
- **Expected.** Both reads should agree. /trade/:id uses Current.workspace.user_intents (app/controllers/api/trade_controller.rb:1095); /v1/trade/:id/schema uses Current.user.user_intents (app/controllers/api/v1/trade_controller.rb:287) — the teammate gets true from one and false from the other.
- **Oracle.** Both endpoints return the same user_intent_answered.
- **Trace.** P2 · automate · `EDGE-BID-025` · `app/controllers/api/v1/trade_controller.rb:287`

## 3. The vendor's technical response

Three calls: `POST /template_responses` (start), `PUT /template_responses/:id/create_page_responses` (answers), `PATCH /template_responses/:id` (submit). Here `{{tradeId}}` is the sandbox TECHNICAL (RFP) stage unless a case says otherwise. Cases needing the response/page ids use `{{templateResponseUuid}}`, `{{techFormUuid}}`, `{{techPageUuid}}` — produced by the start call and the technical-stage read, not by the sandbox context, so they are held until an earlier case makes them.

#### API-XBID-026 — Starting a technical response without the stage id is refused
- **Why it matters.** The start call returns the id the answer and submit calls hang off; a missing stage must be refused.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Live technical stage {{rfpTradeId}}.
- **Steps.** 1. POST /template_responses without item_uuid.
- **Expected.** HTTP 422 error.code 2 'Insufficient parameters' from TemplateResponsesController#create app/controllers/api/template_responses_controller.rb:16-17.
- **Oracle.** No draft response.
- **Trace.** P1 · automate · `EDGE-BID-026` · `app/controllers/api/template_responses_controller.rb:16`

#### API-XBID-027 — Starting a response on an unsupported item type is refused
- **Why it matters.** Only TradeRequest and Proposal are supported; anything else must fall to 101.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Live technical stage.
- **Steps.** 1. POST /template_responses with item_type 'Bid'.
- **Expected.** HTTP 422 error.code 101 'You are not allowed to perform this action' from the else branch app/controllers/api/template_responses_controller.rb:50-51.
- **Oracle.** No row.
- **Trace.** P2 · automate · `EDGE-BID-027` · `app/controllers/api/template_responses_controller.rb:51`

#### API-XBID-028 — A technical response cannot be started on an RFQ (commercial) stage
- **Why it matters.** A technical answer on a pricing stage would never be evaluated; the misleading 'Order not active' message is worth pinning.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). {{tradeId}} here is the sandbox RFQ/pricing stage (rfx_mode rfq).
- **Steps.** 1. POST /template_responses with item_uuid of the RFQ stage.
- **Expected.** HTTP 422 error.code 33 'Order not active' — create restricts the lookup to rfi/rfp (app/controllers/api/template_responses_controller.rb:23), so the set is empty and validate_params_for_trade_request returns 33 (app/controllers/concerns/template_responses_controller_helper.rb:132-133).
- **Oracle.** No template response on the RFQ stage.
- **Trace.** P1 · automate · `EDGE-BID-028` · `app/controllers/concerns/template_responses_controller_helper.rb:133`

#### API-XBID-029 — A technical response cannot be started before the stage opens
- **Why it matters.** Same fairness rule as bidding: no head start on the technical stage.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). {{rfpTradeId}} is an Upcoming (published, not yet started) technical stage.
- **Steps.** 1. POST /template_responses.
- **Expected.** HTTP 422 error.code 33 'Order not active' — currently_running_in_bidding_time (app/models/trade_request.rb:222-226) excludes it; app/controllers/concerns/template_responses_controller_helper.rb:132-133.
- **Oracle.** No draft response.
- **Trace.** P0 · automate · `EDGE-BID-029` · `app/controllers/concerns/template_responses_controller_helper.rb:133`

#### API-XBID-030 — A technical response cannot be started after the stage closed
- **Why it matters.** Late technical responses change who qualifies for the commercial stage after evaluation began.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). {{rfpTradeId}} technical stage bid_end_time has passed.
- **Steps.** 1. POST /template_responses.
- **Expected.** HTTP 422 error.code 33 'Order not active' from app/controllers/concerns/template_responses_controller_helper.rb:132-133.
- **Oracle.** No response.
- **Trace.** P0 · automate · `EDGE-BID-030` · `app/controllers/concerns/template_responses_controller_helper.rb:133`

#### API-XBID-031 — The buyer cannot answer their own technical stage as a participant
- **Why it matters.** A buyer-company response on its own event pollutes evaluation and could be awarded.
- **Setup.** Session: the BUYER who owns the sandbox event (this is how the platform runner authenticates). Live technical stage; company_uuid set to the buyer's own company.
- **Steps.** 1. POST /template_responses with company_uuid = the event's own company.
- **Expected.** Should be 422 code 101 'You are not allowed to perform this action' from app/controllers/concerns/template_responses_controller_helper.rb:135 (company_id == trade company). Uses the buyer's own company id.
- **Oracle.** No response for the buyer's own company.
- **Trace.** P1 · automate · `EDGE-BID-031` · `app/controllers/concerns/template_responses_controller_helper.rb:135`

#### API-XBID-032 — A vendor cannot start a technical response in another vendor's name
- **Why it matters.** Cross-vendor write: A can seed B's technical response and, since the reason strings are shown to the buyer, tamper with B's qualification. (This case records current behaviour: the risk is that today's response is the wrong one.)
- **Setup.** Session: vendor A. {{vendorUuid}} is a DIFFERENT invited vendor B.
- **Steps.** 1. As vendor A, POST /template_responses with company_uuid of vendor B.
- **Expected.** Should be refused. validate_params_for_trade_request (app/controllers/concerns/template_responses_controller_helper.rb:108-140) never checks company_id belongs to the caller (unlike bids, which call can_place_bid_for_company). Today a draft owned by A for company B is the suspected outcome.
- **Oracle.** No draft response exists for company B created by user A.
- **Trace.** P0 · automate · `EDGE-BID-032` · `app/controllers/concerns/template_responses_controller_helper.rb:108`

#### API-XBID-033 — Saving answers with no form id is refused
- **Why it matters.** The answer call is keyed by form and page uuids; a missing form must not become a crash.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A technical response {{templateResponseUuid}} has been started.
- **Steps.** 1. PUT /template_responses/{{templateResponseUuid}}/create_page_responses with form_uuid removed.
- **Expected.** Should be a typed 4xx. create_form_page_responses (app/controllers/api/template_responses_controller.rb:69-95) reads params['page_ids'] and page_responses; a blank/absent form leaves nothing to persist. Must not 5xx.
- **Oracle.** Status < 500.
- **Trace.** P1 · manual · `EDGE-BID-033` · `app/controllers/api/template_responses_controller.rb:69`

#### API-XBID-034 — An answer with a key_attribute that is not on the form is ignored, not crashing
- **Why it matters.** A wrong key_attribute is the single most common malformed-answer case; it must be dropped, not saved or crashed.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Technical response {{templateResponseUuid}} started; {{techPageUuid}} is its line-item page.
- **Steps.** 1. PUT create_page_responses with page_responses whose key_attribute is 'NOT_A_WIDGET_{{stamp}}'.
- **Expected.** 200 or typed 4xx. create_draft_form_response iterates form_key_attributes and only stores keys present in the header set (app/helpers/api/forms_helper.rb:343-368); an unknown key falls through get_key_attribute_vs_response_data (app/helpers/api/forms_helper.rb:452-457) and is dropped.
- **Oracle.** The stored response_data contains no NOT_A_WIDGET key.
- **Trace.** P1 · manual · `EDGE-BID-034` · `app/helpers/api/forms_helper.rb:343`

#### API-XBID-035 — An attachment answer sent as an object instead of a list does not crash
- **Why it matters.** Attachment shape confusion is a known raise site inside a transaction; it must stay a typed error.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Technical response {{templateResponseUuid}} started.
- **Steps.** 1. PUT create_page_responses with an attachment widget value set to {url:...} (an object, not a list).
- **Expected.** validate_form_pages_responses_data (app/helpers/api/forms_helper.rb:299-312) raises StandardError 'Invalid Attachments Data' for a non-array, non-string attachment value; that surfaces as a handled error, not a 500 (this widget may be a string field, so no-5xx is the honest assertion).
- **Oracle.** Status < 500.
- **Trace.** P1 · manual · `EDGE-BID-035` · `app/helpers/api/forms_helper.rb:308`

#### API-XBID-036 — Submitting a technical response with a required answer blank is refused
- **Why it matters.** Required technical answers gate qualification; a blank required field must block submission.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A technical response {{templateResponseUuid}} with a required widget left blank.
- **Steps.**
  1. Save the page with the required field empty.
  2. PATCH /template_responses/{{templateResponseUuid}} to submit.
- **Expected.** Should be 422 error.code 572 "Please fill '<field>'" from ValidateService#validate_header (app/services/template_responses/validate_service.rb:158-162), reached via revise_for_item_type → revise_template_response_helper (app/controllers/concerns/template_responses_controller_helper.rb:23). The generic submit body cannot force a specific field blank in one run, so no-5xx is the runnable assertion.
- **Oracle.** Status < 500; ideally 422 code 572.
- **Trace.** P0 · automate · `EDGE-BID-036` · `app/services/template_responses/validate_service.rb:160`

#### API-XBID-037 — A different user cannot submit another user's draft response without edit access
- **Why it matters.** The technical response is competitor-sensitive; only its owner or a shared editor may submit it.
- **Setup.** Session: a vendor user who did NOT create response {{templateResponseUuid}} and has no editor access-list entry.
- **Steps.** 1. PATCH /template_responses/{{templateResponseUuid}} to submit.
- **Expected.** Should be 422 code 2 (draft not found for company) or 101 (not an editor). update (app/controllers/api/template_responses_controller.rb:55-67) scopes to company_id, and unauthorized_template_response_editor? (app/controllers/api/template_responses_controller.rb:402-410) denies non-owners without editor access.
- **Oracle.** No state change on the response owned by another user.
- **Trace.** P0 · automate · `EDGE-BID-037` · `app/controllers/api/template_responses_controller.rb:402`

#### API-XBID-038 — Answers cannot be saved on a stage that is not running
- **Why it matters.** A late technical answer edits a response after the window; the window guard must fire.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A response {{templateResponseUuid}} exists on a technical stage that has since closed.
- **Steps.** 1. PUT /template_responses/{{templateResponseUuid}}/create_page_responses.
- **Expected.** Should be 422 code 33 'Order not active' — for a vendor (not the buyer's company) create_form_page_responses checks item.is_running (app/controllers/api/template_responses_controller.rb:78-82). Requires a closed stage; no-5xx if the sandbox stage is still live.
- **Oracle.** Status < 500; ideally 422 code 33.
- **Trace.** P1 · manual · `EDGE-BID-038` · `app/controllers/api/template_responses_controller.rb:81`

#### API-XBID-039 — Submitting the same technical response twice does not create a second active response
- **Why it matters.** Vendors retry submit on flaky networks; a second active response would double-count in evaluation.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Response {{templateResponseUuid}} already submitted (active).
- **Steps.** 1. PATCH /template_responses/{{templateResponseUuid}} to submit again.
- **Expected.** Should be 422 code 2: update (app/controllers/api/template_responses_controller.rb:59) fetches TemplateResponse.draft, which is empty once the response is active, so a re-submit refuses cleanly. No second active row either way.
- **Oracle.** Exactly one active response for the vendor on the stage.
- **Trace.** P1 · automate · `EDGE-BID-039` · `app/controllers/api/template_responses_controller.rb:59`

#### API-XBID-040 — Saving answers against a non-existent response is refused cleanly
- **Why it matters.** A stale or guessed response id must produce a typed error, not a crash.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). None.
- **Steps.** 1. PUT /template_responses/WrongUuid1=/create_page_responses.
- **Expected.** Should be 422 code 888 'Invalid Parameters' from fetch_template_response (app/controllers/concerns/template_responses_controller_helper.rb:61-62). Must not 5xx.
- **Oracle.** Status < 500; ideally 422 code 888.
- **Trace.** P1 · automate · `EDGE-BID-040` · `app/controllers/concerns/template_responses_controller_helper.rb:62`

#### API-XBID-041 — Submitting a non-existent response is refused
- **Why it matters.** Guessed response ids must not submit anything.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). None.
- **Steps.** 1. PATCH /template_responses/WrongUuid1=.
- **Expected.** HTTP 422 error.code 2 'Insufficient parameters' — update (app/controllers/api/template_responses_controller.rb:59-60) finds no draft response for that id/company.
- **Oracle.** Typed error body; nothing submitted.
- **Trace.** P2 · automate · `EDGE-BID-041` · `app/controllers/api/template_responses_controller.rb:60`

## 4. Opening a bid

`POST /v1/bids` (`Api::V1::BidsController#create`, bids_controller.rb:11-39). Order of guards: blank trade/company → 2, not latest version → 101, not on audience → 782, then is_allowed_to_create_bid (helper:7-78) → window (33), duplicate (96), revoked (370), lock-after-submit (875). `{{tradeId}}` is the sandbox RFQ/pricing stage.

#### API-XBID-042 — Opening a bid without a company is refused
- **Why it matters.** company_id names who the bid is for; blank must be refused before any row.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Live RFQ stage {{tradeId}}, vendor invited.
- **Steps.** 1. POST /v1/bids with company_uuid removed.
- **Expected.** HTTP 422 error.code 2 'Insufficient parameters' from app/controllers/api/v1/bids_controller.rb:15-16 (company_id blank).
- **Oracle.** No bid_uuid returned; no draft bid.
- **Trace.** P1 · automate · `EDGE-BID-042` · `app/controllers/api/v1/bids_controller.rb:15`

#### API-XBID-043 — Opening a bid without a trade id is refused
- **Why it matters.** No stage means no event to bid on; the presence guard must fire.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Vendor invited.
- **Steps.** 1. POST /v1/bids with trade_request_uuid removed.
- **Expected.** HTTP 422 error.code 2 'Insufficient parameters' — trade_request is nil at app/controllers/api/v1/bids_controller.rb:14-16.
- **Oracle.** No bid created.
- **Trace.** P1 · automate · `EDGE-BID-043` · `app/controllers/api/v1/bids_controller.rb:15`

#### API-XBID-044 — Opening a bid on a non-existent event is refused
- **Why it matters.** A guessed stage id must not open a bid.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). None.
- **Steps.** 1. POST /v1/bids with trade_request_uuid 'WrongUuid1='.
- **Expected.** HTTP 422 error.code 2 'Insufficient parameters' — find_by_id returns nil, blank check at app/controllers/api/v1/bids_controller.rb:14-16.
- **Oracle.** No bid created.
- **Trace.** P1 · automate · `EDGE-BID-044` · `app/controllers/api/v1/bids_controller.rb:14`

#### API-XBID-045 — An uninvited vendor cannot open a bid
- **Why it matters.** The core fairness rule: only invited vendors may bid.
- **Setup.** Session: a vendor NOT on the audience of {{tradeId}}.
- **Steps.** 1. POST /v1/bids as the uninvited vendor.
- **Expected.** HTTP 422 error.code 782 'Bid could not be placed. Please refresh and try again.' from app/controllers/api/v1/bids_controller.rb:20 (allowed_to_bid? false — company not in audience_ids, app/controllers/concerns/bids_controller_helper.rb:17-31).
- **Oracle.** No bid_uuid; no draft bid for the uninvited company.
- **Trace.** P0 · automate · `EDGE-BID-045` · `app/controllers/api/v1/bids_controller.rb:20`

#### API-XBID-046 — The buyer cannot open an ordinary bid on their own event
- **Why it matters.** A buyer self-bid would seed a competing quote on their own event. (This case records current behaviour: the risk is that today's response is the wrong one.)
- **Setup.** Session: the BUYER who owns the sandbox event (this is how the platform runner authenticates). Live RFQ stage; company_uuid set to the buyer's own company.
- **Steps.** 1. POST /v1/bids with company_uuid = the event's own company.
- **Expected.** Should be refused. is_surrogate_bidding_and_is_allowed? treats the owner as a surrogate bidder (app/controllers/concerns/bids_controller_helper.rb:2130-2141); a plain self-bid should not create a vendor bid. Uses the buyer's own company id.
- **Oracle.** No ordinary (non-surrogate) bid for the buyer's own company.
- **Trace.** P0 · automate · `EDGE-BID-046` · `app/controllers/concerns/bids_controller_helper.rb:2130`

#### API-XBID-047 — A bid on a superseded event version is refused
- **Why it matters.** Bidding on a stale version writes to an event nobody is running.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). {{tradeId}} belongs to an event group that has been amended (a newer version exists).
- **Steps.** 1. POST /v1/bids on the old version's stage.
- **Expected.** HTTP 422 error.code 101 'You are not allowed to perform this action' from app/controllers/api/v1/bids_controller.rb:18 (event_group.latest? false). Requires an amended event; on a fresh sandbox this stays a clean 4xx.
- **Oracle.** No bid on the old version.
- **Trace.** P1 · automate · `EDGE-BID-047` · `app/controllers/api/v1/bids_controller.rb:18`

#### API-XBID-048 — A bid cannot be opened before the window opens
- **Why it matters.** Bidding early breaks fairness — the single most important window rule.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). {{tradeId}} is an Upcoming (published, not started) RFQ stage.
- **Steps.** 1. POST /v1/bids.
- **Expected.** HTTP 422 error.code 33 'Order not active' from is_allowed_to_create_bid (app/helpers/api/v1/bids_controller_helper.rb:71-73, !is_running).
- **Oracle.** No bid created.
- **Trace.** P0 · automate · `EDGE-BID-048` · `app/helpers/api/v1/bids_controller_helper.rb:71`

#### API-XBID-049 — A bid cannot be opened after the window closes
- **Why it matters.** A late bid changes the result after the event closed.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). {{tradeId}} RFQ stage bid_end_time has passed.
- **Steps.** 1. POST /v1/bids.
- **Expected.** HTTP 422 error.code 33 'Order not active' from app/helpers/api/v1/bids_controller_helper.rb:71-73 (is_running false once bid_end_time passed; is_running at app/models/trade_request.rb:1191-1194).
- **Oracle.** No bid created.
- **Trace.** P0 · automate · `EDGE-BID-049` · `app/helpers/api/v1/bids_controller_helper.rb:71`

#### API-XBID-050 — A bid cannot be opened on an unpublished (draft) stage
- **Why it matters.** Bidding on an unpublished stage writes into an event the buyer is still editing.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A DRAFT RFQ stage {{tradeId}} with the vendor pre-added to the audience.
- **Steps.** 1. POST /v1/bids on the draft stage.
- **Expected.** HTTP 422 error.code 33 'Order not active' — a draft has no running schedule, so is_running is false (app/helpers/api/v1/bids_controller_helper.rb:71-73). A draft is also unviewable to the vendor (is_allowed_to_view? app/models/model_helpers/trade_request_model_helper.rb:352).
- **Oracle.** No draft bid on the unpublished stage.
- **Trace.** P0 · automate · `EDGE-BID-050` · `app/helpers/api/v1/bids_controller_helper.rb:71`

#### API-XBID-051 — Two concurrent create calls do not both succeed
- **Why it matters.** The submit/create pair is the most retried write; the cache lock prevents a double bid.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Live RFQ stage; two create calls fire within 3 seconds for the same (trade, company).
- **Steps.**
  1. POST /v1/bids.
  2. Immediately POST /v1/bids again.
- **Expected.** The second call should get 422 code 516 'Transaction in Progress' from lock_transaction (app/controllers/api/v1/bids_controller.rb:168-174; Rails.cache 3s lock keyed t<id>_c<company>).
- **Oracle.** At most one draft bid created; the loser gets code 516.
- **Trace.** P1 · automate · `EDGE-BID-051` · `app/controllers/api/v1/bids_controller.rb:171`

#### API-XBID-052 — A second bid after one is already active is refused
- **Why it matters.** Config-dependent: with the lock on, one submitted quote is final.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). The vendor already has an active bid on {{tradeId}} and lock_quote_after_submission is ON.
- **Steps.** 1. POST /v1/bids again for the same company.
- **Expected.** HTTP 422 error.code 875 'Revise bid is locked. You cannot edit your quote after submission.' from is_allowed_to_create_bid (app/helpers/api/v1/bids_controller_helper.rb:74-76) when lock_quote_after_submission? is set. gate: lock_quote_after_submission
- **Oracle.** Still one active bid.
- **Trace.** P1 · automate · `EDGE-BID-052` · `app/helpers/api/v1/bids_controller_helper.rb:74`

#### API-XBID-053 — A vendor who revoked cannot open a new bid
- **Why it matters.** Revocation is meant to be final for that vendor.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). The vendor's previous bid on {{tradeId}} is in revoke status.
- **Steps.** 1. POST /v1/bids.
- **Expected.** HTTP 422 error.code 370 'You cannot place a bid after revoking the previous one' from app/helpers/api/v1/bids_controller_helper.rb:54-56.
- **Oracle.** No new bid.
- **Trace.** P1 · automate · `EDGE-BID-053` · `app/helpers/api/v1/bids_controller_helper.rb:54`

#### API-XBID-054 — An unsupported currency code is refused on a multi-currency event
- **Why it matters.** Currency drives every price comparison; an invalid code must be rejected.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). {{tradeId}} has a currency_configuration; the vendor sends an out-of-list code.
- **Steps.** 1. POST /v1/bids with currency_preference.code 'XYZ'.
- **Expected.** Should be 422 code 15 'Operation failed' 'Please choose a valid currency' from validate_currency_preference (app/controllers/api/v1/bids_controller.rb:28, app/controllers/api/v1/bids_controller.rb:191-192). gate: currency_configuration — no-5xx if the sandbox is single-currency.
- **Oracle.** Status < 500; ideally 422 with the currency message.
- **Trace.** P1 · automate · `EDGE-BID-054` · `app/controllers/api/v1/bids_controller.rb:191`

#### API-XBID-055 — A vendor who skipped the technical stage cannot open the commercial bid
- **Why it matters.** Two-stage events require technical qualification before commercial bidding.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). The event has a live/closed RFP technical stage the vendor never responded to; {{tradeId}} is the commercial stage.
- **Steps.** 1. POST /v1/bids without any technical response.
- **Expected.** Should be 422 code 737 'You cannot quote for this item because you didn't participate in the technical stage' — is_allowed_to_create_bid checks template responses (app/helpers/api/v1/bids_controller_helper.rb:30-37) → check_participation_in_technical_and_commercial_stage (app/helpers/api/v1/bids_controller_helper.rb:313-320). gate: a technical (RFP) stage exists.
- **Oracle.** Status < 500; ideally 422 code 737.
- **Trace.** P1 · automate · `EDGE-BID-055` · `app/helpers/api/v1/bids_controller_helper.rb:35`

## 5. Pricing the bid — create_bid_products

`POST /v1/bids/:id/create_bid_products` prices each line item. Order: negative price/qty/gst filtered up front (bids_controller.rb:539-571), then bid found as draft (32), version (101), anomaly (473), subsidiary (96), then per-product ceil/floor/tick/quantity checks in validate_bid_product_details (bids_controller_helper.rb:1828-1913). The platform's `create_bid_products` allowlist covers this path; these run on a real draft `{{bidUuid}}`.

#### API-XBID-056 — A negative price is refused
- **Why it matters.** Negative prices are the canonical bad input; whichever path runs, they must not become a valid quote.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A draft bid {{bidUuid}} on the live RFQ stage.
- **Steps.** 1. POST /v1/bids/{{bidUuid}}/create_bid_products with a trade_products entry priced -5.
- **Expected.** HTTP 422 error.code 106 'Please enter a valid price' from filter_invalid_params (app/controllers/api/bids_controller.rb:539-546) — note this guard lives on the legacy Api::BidsController path; the v1 create_bid_trade_products path stores price as a float and relies on floor/ceil, so a negative here may instead pass to validate_bid_product_details.
- **Oracle.** No bid_trade_products row with a negative price.
- **Trace.** P0 · automate · `EDGE-BID-056` · `app/controllers/api/bids_controller.rb:544`

#### API-XBID-057 — A zero price is not added as a quote
- **Why it matters.** A zero price is a common 'no quote' signal; it must not create a zero-value bid.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A draft bid {{bidUuid}} on the live RFQ stage.
- **Steps.** 1. POST create_bid_products with price 0 in the inline sheet.
- **Expected.** allowed_to_add (app/controllers/concerns/trade_template_helper.rb:5839-5851) only adds a row when price > 0, so a zero-priced row is dropped and create_bid_trade_product_helper sees blank products → 732 'Invalid Input' (app/helpers/api/v1/bids_controller_helper.rb:151-156).
- **Oracle.** No zero-priced bid_trade_product; ideally 422 code 732.
- **Trace.** P1 · automate · `EDGE-BID-057` · `app/controllers/concerns/trade_template_helper.rb:5841`

#### API-XBID-058 — A non-numeric price does not crash
- **Why it matters.** String-where-number is a classic fuzz input on the money field.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A draft bid {{bidUuid}}.
- **Steps.** 1. POST create_bid_products with price value 'abc'.
- **Expected.** 200 or typed 4xx. get_line_item_object coerces with &.to_f (app/controllers/concerns/trade_template_helper.rb:5639) so 'abc' becomes 0.0 and is dropped by allowed_to_add (app/controllers/concerns/trade_template_helper.rb:5841); must not 5xx.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-BID-058` · `app/controllers/concerns/trade_template_helper.rb:5639`

#### API-XBID-059 — An enormous price is handled without overflow
- **Why it matters.** Unbounded price with no ceiling is an integrity risk in the savings/total math.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A draft bid {{bidUuid}} on an event with no ceiling price.
- **Steps.** 1. POST create_bid_products with price 1e18.
- **Expected.** 200 or a ceiling refusal (38). price is a float column (db/schema.rb bid_trade_products); with no ceil_price the value is stored (app/controllers/concerns/bids_controller_helper.rb:1145). Must not 5xx or overflow.
- **Oracle.** Status < 500; any stored total is finite.
- **Trace.** P1 · automate · `EDGE-BID-059` · `app/controllers/concerns/bids_controller_helper.rb:1145`

#### API-XBID-060 — A price above the configured ceiling is refused
- **Why it matters.** The price cap is a hard business rule; over-ceiling quotes must be blocked.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A draft bid {{bidUuid}} on a stage whose line item has a ceiling (max) price.
- **Steps.** 1. POST create_bid_products priced far above the ceiling.
- **Expected.** Should be 422 code 38 'Price cannot be more than the allowed price' from validate_bid_product_details (app/controllers/concerns/bids_controller_helper.rb:1840-1846), comparing estimated_price to ceil_price_for_user. gate: ceiling price set — no-5xx otherwise.
- **Oracle.** Status < 500; ideally 422 code 38.
- **Trace.** P0 · automate · `EDGE-BID-060` · `app/controllers/concerns/bids_controller_helper.rb:1845`

#### API-XBID-061 — A price below the configured floor is refused
- **Why it matters.** Floor caps stop unrealistically low quotes on forward/sell events.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A draft bid {{bidUuid}} on a stage whose line item has a floor (min) price.
- **Steps.** 1. POST create_bid_products priced below the floor.
- **Expected.** Should be 422 code 41 'Price cannot be less than the allowed price' from the floor branch of validate_bid_product_details (app/controllers/concerns/bids_controller_helper.rb:1848-1855). gate: floor price set.
- **Oracle.** Status < 500; ideally 422 code 41.
- **Trace.** P1 · automate · `EDGE-BID-061` · `app/controllers/concerns/bids_controller_helper.rb:1854`

#### API-XBID-062 — A quantity above the line quantity is refused when over-quantity is off
- **Why it matters.** Over-quantity bids distort awarding when the buyer disallows them.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A draft bid {{bidUuid}}; is_over_quantity_allowed is OFF; line quantity is 10. gate: `is_over_quantity_allowed` must be off for this case's outcome to hold.
- **Steps.** 1. POST create_bid_products with participant_quantity 100.
- **Expected.** Should be 422 code 138 'Quantity cannot be greater than the mentioned quantity.' from validate_bid_product_details (app/controllers/concerns/bids_controller_helper.rb:1902-1904). gate: is_over_quantity_allowed=false (default is true, so this is config-dependent).
- **Oracle.** Status < 500; ideally 422 code 138.
- **Trace.** P1 · automate · `EDGE-BID-062` · `app/controllers/concerns/bids_controller_helper.rb:1903`

#### API-XBID-063 — A quantity below the line quantity is refused when under-quantity is off
- **Why it matters.** Under-quantity bids are disallowed when the buyer needs the full lot.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A draft bid {{bidUuid}}; is_under_quantity_allowed is OFF; line quantity is 10. gate: `is_under_quantity_allowed` must be off for this case's outcome to hold.
- **Steps.** 1. POST create_bid_products with participant_quantity 1.
- **Expected.** Should be 422 code 139 'Quantity cannot be less than the mentioned quantity.' from validate_bid_product_details (app/controllers/concerns/bids_controller_helper.rb:1906-1908). gate: is_under_quantity_allowed=false.
- **Oracle.** Status < 500; ideally 422 code 139.
- **Trace.** P1 · automate · `EDGE-BID-063` · `app/controllers/concerns/bids_controller_helper.rb:1907`

#### API-XBID-064 — A quantity not equal to the auction quantity is refused when fixed-quantity bidding is on
- **Why it matters.** Fixed-quantity events require an exact-match quantity.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A draft bid {{bidUuid}}; allow_fixed_quantity_for_bidding is ON; line quantity is 10. gate: `allow_fixed_quantity_for_bidding` must be on for this case's outcome to hold.
- **Steps.** 1. POST create_bid_products with participant_quantity 9.
- **Expected.** Should be 422 code 207 'Bid Quantity should be equal to the Auction Quantity' from validate_bid_product_details (app/controllers/concerns/bids_controller_helper.rb:1898-1900). gate: allow_fixed_quantity_for_bidding=true.
- **Oracle.** Status < 500; ideally 422 code 207.
- **Trace.** P1 · automate · `EDGE-BID-064` · `app/controllers/concerns/bids_controller_helper.rb:1899`

#### API-XBID-065 — A negative quantity is refused
- **Why it matters.** Negative quantity is another canonical bad input.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A draft bid {{bidUuid}}.
- **Steps.** 1. POST create_bid_products (legacy trade_products form) with quantity -3.
- **Expected.** HTTP 422 error.code 35 'Quantity must be greater than zero' from filter_invalid_params (app/controllers/api/bids_controller.rb:547-549) on the legacy path.
- **Oracle.** No bid product with negative quantity.
- **Trace.** P1 · automate · `EDGE-BID-065` · `app/controllers/api/bids_controller.rb:547`

#### API-XBID-066 — A negative GST is refused
- **Why it matters.** GST feeds the landed cost; negative GST would understate the total.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A draft bid {{bidUuid}}.
- **Steps.** 1. POST create_bid_products (trade_products form) with gst -5.
- **Expected.** HTTP 422 error.code 107 'Please enter valid GST' from filter_invalid_params (app/controllers/api/bids_controller.rb:550-552).
- **Oracle.** No bid product with negative GST.
- **Trace.** P2 · automate · `EDGE-BID-066` · `app/controllers/api/bids_controller.rb:550`

#### API-XBID-067 — Pricing with no products is refused
- **Why it matters.** A bid with no products is a participation with no offer.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A draft bid {{bidUuid}}.
- **Steps.** 1. POST create_bid_products with an empty inline data map.
- **Expected.** Should be 422 code 732 'Invalid Input' — create_bid_trade_product_helper (app/helpers/api/v1/bids_controller_helper.rb:151-156) refuses a blank product list unless it is a valid delete.
- **Oracle.** Status < 500; ideally 422 code 732.
- **Trace.** P1 · automate · `EDGE-BID-067` · `app/helpers/api/v1/bids_controller_helper.rb:155`

#### API-XBID-068 — Pricing a non-existent bid is refused
- **Why it matters.** A guessed bid id must not receive prices.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). None.
- **Steps.** 1. POST /v1/bids/WrongUuid1=/create_bid_products with a valid row.
- **Expected.** HTTP 422 error.code 32 'Bid not found' — Bid.draft.for_company(...).where(id: bid_id).last is nil (app/controllers/api/v1/bids_controller.rb:120-121).
- **Oracle.** No products created.
- **Trace.** P1 · automate · `EDGE-BID-068` · `app/controllers/api/v1/bids_controller.rb:121`

#### API-XBID-069 — A vendor cannot price a bid belonging to another company
- **Why it matters.** Cross-company write into a competitor's bid.
- **Setup.** Session: vendor A. {{bidUuid}} is a draft bid owned by vendor B.
- **Steps.** 1. As A, POST /v1/bids/{{bidUuid}}/create_bid_products.
- **Expected.** Should be 422 code 32 'Bid not found' — the bid lookup is scoped to Current.allowed_companies (app/controllers/api/v1/bids_controller.rb:119-121), so B's bid is invisible to A. Requires a bid owned by another company.
- **Oracle.** B's bid is unchanged.
- **Trace.** P0 · automate · `EDGE-BID-069` · `app/controllers/api/v1/bids_controller.rb:119`

#### API-XBID-070 — Pricing a bid after the window closes is refused
- **Why it matters.** Late pricing edits a bid after the window.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A draft bid {{bidUuid}} whose stage bid_end_time has passed.
- **Steps.** 1. POST /v1/bids/{{bidUuid}}/create_bid_products.
- **Expected.** When not running, create_bid_trade_products routes to is_allowed_to_modify_counter_offer (app/controllers/api/v1/bids_controller.rb:125-127) which returns 33 'Order not active' unless a counter-offer modification is applicable (app/controllers/concerns/bids_controller_helper.rb:792-793). Requires a closed stage.
- **Oracle.** Status < 500; ideally 422 code 33.
- **Trace.** P1 · automate · `EDGE-BID-070` · `app/controllers/api/v1/bids_controller.rb:125`

#### API-XBID-071 — A sister company cannot pile a second bid onto the same subsidiary network
- **Why it matters.** Subsidiary collusion is blocked so one network cannot occupy two ranks.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A draft bid {{bidUuid}}; another company in the same subsidiary network already bid on {{tradeId}}.
- **Steps.** 1. POST /v1/bids/{{bidUuid}}/create_bid_products.
- **Expected.** Should be 422 code 96 'A bid has already been placed by your team' from app/controllers/api/v1/bids_controller.rb:134-135 (is_part_of_subsidiary_network?). gate: subsidiary network configured.
- **Oracle.** Status < 500; ideally 422 code 96.
- **Trace.** P2 · automate · `EDGE-BID-071` · `app/controllers/api/v1/bids_controller.rb:135`

## 6. Submitting the bid

`PATCH /v1/bids/:id` (`Api::V1::BidsController#update`, bids_controller.rb:41-66). Order: bid found in not_in_active/for_company (32), already-active re-submit to active/draft (34), version (101), then update_bid_helper (helper:367-487): lock-after-submit (875), technical-participation (748), regretted items (800/736), price direction (300/301) and the base validators. The platform's submit-a-bid allowlist covers PATCH /v1/bids/:id; these run on a real draft `{{bidUuid}}`.

#### API-XBID-072 — Submitting with no status does not crash
- **Why it matters.** A missing status must not silently activate the bid or crash.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A priced draft bid {{bidUuid}}.
- **Steps.** 1. PATCH /v1/bids/{{bidUuid}} with status removed.
- **Expected.** 200 or typed 4xx. With no status the bid stays draft (update_bid_helper draft branch app/helpers/api/v1/bids_controller_helper.rb:453) and no technical-participation gate fires; must not 5xx.
- **Oracle.** Status < 500; the bid is not activated by an empty status.
- **Trace.** P2 · automate · `EDGE-BID-072` · `app/helpers/api/v1/bids_controller_helper.rb:453`

#### API-XBID-073 — Submitting a bid with no products is refused
- **Why it matters.** A submitted bid with no products is a participation with no offer — the model's own guard.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A draft bid {{bidUuid}} created but never priced (no bid_products).
- **Steps.** 1. PATCH /v1/bids/{{bidUuid}} to active with the working submit body.
- **Expected.** Should be 422 code 8 'Model error' 'Please bid on at least one product' from Bid#validate_bid_products (app/models/bid.rb:217-223), which fires for a non-fast, non-buyer-added bid activated from draft. surfaces via error_code 15 in the helper.
- **Oracle.** Status < 500; the bid is not active with zero products.
- **Trace.** P0 · automate · `EDGE-BID-073` · `app/models/bid.rb:220`

#### API-XBID-074 — Submitting the same bid twice does not create a second active bid
- **Why it matters.** Vendors retry submit; a second active bid would double-rank the same company.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A bid {{bidUuid}} already submitted (active).
- **Steps.** 1. PATCH /v1/bids/{{bidUuid}} to active again.
- **Expected.** Should be 422 code 34 'A bid has already been placed from your team' — update refuses when bid.active? and status in [active,draft] (app/controllers/api/v1/bids_controller.rb:45-47).
- **Oracle.** Still exactly one active bid for the company.
- **Trace.** P0 · automate · `EDGE-BID-074` · `app/controllers/api/v1/bids_controller.rb:45`

#### API-XBID-075 — A bid cannot be submitted after the window closes
- **Why it matters.** A late submit changes the result after the event closed.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A priced draft bid {{bidUuid}} whose stage bid_end_time has passed.
- **Steps.** 1. PATCH /v1/bids/{{bidUuid}} to active.
- **Expected.** Should be 422 code 33 'Order not active' — update_bid_action_helper_v1 returns 33 when !is_running and not a counter-offer/justification (app/helpers/api/v1/bids_controller_helper.rb:562-571). Requires a closed stage.
- **Oracle.** Status < 500; ideally 422 code 33; the bid stays draft.
- **Trace.** P0 · automate · `EDGE-BID-075` · `app/helpers/api/v1/bids_controller_helper.rb:562`

#### API-XBID-076 — A locked event refuses a second submitted quote
- **Why it matters.** With the lock on, the first submitted quote is final.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). lock_quote_after_submission is ON; the vendor already has an active bid; {{bidUuid}} is a new draft. gate: `lock_quote_after_submission` must be on for this case's outcome to hold.
- **Steps.** 1. PATCH /v1/bids/{{bidUuid}} to active.
- **Expected.** Should be 422 code 875 'Revise bid is locked. You cannot edit your quote after submission.' from update_bid_helper (app/helpers/api/v1/bids_controller_helper.rb:385-387). gate: lock_quote_after_submission=true.
- **Oracle.** Status < 500; ideally 422 code 875.
- **Trace.** P1 · automate · `EDGE-BID-076` · `app/helpers/api/v1/bids_controller_helper.rb:385`

#### API-XBID-077 — Submitting a commercial bid that skips technically-qualified lines is refused
- **Why it matters.** A partial commercial bid must not leave qualified lines unpriced.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Two-stage event; the vendor participated technically but priced only some non-regretted lines; {{bidUuid}} is the commercial draft.
- **Steps.** 1. PATCH /v1/bids/{{bidUuid}} to active.
- **Expected.** Should be 422 code 748 'Please enter bid for all line items that are not regretted in technical stage.' — valid_bid_wrt_technical_stage? (app/helpers/api/v1/bids_controller_helper.rb:389, 985-1014) requires every non-regretted, non-TNA technical line to be priced. gate: a technical (RFP) stage exists.
- **Oracle.** Status < 500; ideally 422 code 748.
- **Trace.** P1 · automate · `EDGE-BID-077` · `app/helpers/api/v1/bids_controller_helper.rb:389`

#### API-XBID-078 — A regretted line item cannot then receive a commercial price
- **Why it matters.** Regretting a line then bidding on it commercially is contradictory; the guard exists for exactly this.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). The vendor marked a line item as regretted; {{bidUuid}} carries a price on that same line.
- **Steps.** 1. PATCH /v1/bids/{{bidUuid}} to active.
- **Expected.** Should be 422 code 800 'You have regretted this line item. Reset your draft bid to continue.' from check_for_regretted_items (app/helpers/api/v1/bids_controller_helper.rb:747, 885-894), or 736 during product creation (app/helpers/api/v1/bids_controller_helper.rb:300-301). gate: line marked regretted first.
- **Oracle.** Status < 500; ideally 422 code 800 or 736.
- **Trace.** P1 · automate · `EDGE-BID-078` · `app/helpers/api/v1/bids_controller_helper.rb:885`

#### API-XBID-079 — A vendor cannot submit another company's bid
- **Why it matters.** Cross-company submit would let A finalize B's quote.
- **Setup.** Session: vendor A. {{bidUuid}} is a draft bid owned by vendor B.
- **Steps.** 1. As A, PATCH /v1/bids/{{bidUuid}} to active.
- **Expected.** Should be 422 code 32 'Bid not found' — Bid.not_in_active.for_company(Current.allowed_companies) excludes B's bid (app/controllers/api/v1/bids_controller.rb:42-44). Requires a bid owned by another company.
- **Oracle.** B's bid is unchanged.
- **Trace.** P0 · automate · `EDGE-BID-079` · `app/controllers/api/v1/bids_controller.rb:42`

#### API-XBID-080 — Submitting a non-existent bid is refused
- **Why it matters.** A guessed bid id must not be submittable.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). None.
- **Steps.** 1. PATCH /v1/bids/WrongUuid1=.
- **Expected.** HTTP 422 error.code 32 'Bid not found' from app/controllers/api/v1/bids_controller.rb:43-44.
- **Oracle.** Nothing submitted.
- **Trace.** P1 · automate · `EDGE-BID-080` · `app/controllers/api/v1/bids_controller.rb:44`

#### API-XBID-081 — A non-numeric gross_total does not crash
- **Why it matters.** gross_total is echoed in the orders sheet view — a stored-XSS/type sink.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A priced draft bid {{bidUuid}}.
- **Steps.** 1. PATCH /v1/bids/{{bidUuid}} with global gross_total value '<script>'.
- **Expected.** 200 or typed 4xx. gross_total flows into other_details (app/helpers/api/v1/bids_controller_helper.rb:420); it is display data, not the ranking price. Must not 5xx.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-BID-081` · `app/helpers/api/v1/bids_controller_helper.rb:420`

## 7. Revising a bid — price direction and locks

Revision runs through `update_bid_action_helper_v1` (helper:541-882) and, for single-product, `revise_bid_helper` (bids_helper.rb:5-44). Direction rules: is_price_increase_allowed? / is_price_decrease_allowed? (trade_request_model_helper.rb:69-107); `PATCH /api/bids/revise_bid/:id` is the legacy revise route. These need a live, already-submitted bid, so they are documented as workflow negatives.

#### API-XBID-082 — Increasing the price is refused when price increase is not allowed
- **Why it matters.** In a reverse auction prices should only fall; the direction rule enforces it.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A submitted bid {{bidUuid}} on an event with is_price_increase_allowed=false. gate: `is_price_increase_allowed` must be off for this case's outcome to hold.
- **Steps.** 1. PATCH /api/bids/revise_bid/{{bidUuid}} with a higher price.
- **Expected.** Should be 422 code 300 'You cannot increase the price' — get_approval_type (app/controllers/concerns/bids_controller_helper.rb:2385-2386) and revise_bid_helper (app/helpers/api/bids_helper.rb:6-7) return 300 when the revised value exceeds the current and increase is disallowed. gate: is_price_increase_allowed=false.
- **Oracle.** Status < 500; ideally 422 code 300; the active price is unchanged.
- **Trace.** P1 · automate · `EDGE-BID-082` · `app/controllers/concerns/bids_controller_helper.rb:2386`

#### API-XBID-083 — Decreasing the price is refused when price decrease is not allowed
- **Why it matters.** In a forward auction prices should only rise; the mirror of the increase rule.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A submitted bid {{bidUuid}} on a forward/sell event with is_price_decrease_allowed=false. gate: `is_price_decrease_allowed` must be off for this case's outcome to hold.
- **Steps.** 1. PATCH /api/bids/revise_bid/{{bidUuid}} with a lower price.
- **Expected.** Should be 422 code 301 'You cannot decrease the price' — get_approval_type (app/controllers/concerns/bids_controller_helper.rb:2380-2381) / revise_bid_helper (app/helpers/api/bids_helper.rb:9-10). gate: is_price_decrease_allowed=false (forward/sell event).
- **Oracle.** Status < 500; ideally 422 code 301.
- **Trace.** P1 · automate · `EDGE-BID-083` · `app/controllers/concerns/bids_controller_helper.rb:2381`

#### API-XBID-084 — A revision smaller than the tick size is refused
- **Why it matters.** Tick size stops micro-undercutting in auctions.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A submitted bid {{bidUuid}} on a line item with a tick size; the new price is within one tick.
- **Steps.** 1. PATCH /api/bids/revise_bid/{{bidUuid}} changing the price by less than the tick size.
- **Expected.** Should be 422 code 214 'Quoted price difference must be greater than the tick size' from validate_bid_product_details (app/controllers/concerns/bids_controller_helper.rb:1869-1891), which fires only when the non-zero difference is below the tick. gate: tick size configured.
- **Oracle.** Status < 500; ideally 422 code 214.
- **Trace.** P1 · automate · `EDGE-BID-084` · `app/controllers/concerns/bids_controller_helper.rb:1876`

#### API-XBID-085 — A bid cannot be revised after the window closes
- **Why it matters.** Late revision changes the result after close.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A submitted bid {{bidUuid}} on a stage whose bid_end_time has passed (no counter-offer open).
- **Steps.** 1. PATCH /api/bids/revise_bid/{{bidUuid}} with a new price.
- **Expected.** Should be 422 code 33 'Order not active' — update_bid_action_helper (app/controllers/concerns/bids_controller_helper.rb:67-77) returns 33 when !is_running and no counter-offer modification/justification applies. Requires a closed stage.
- **Oracle.** Status < 500; ideally 422 code 33.
- **Trace.** P1 · automate · `EDGE-BID-085` · `app/controllers/concerns/bids_controller_helper.rb:67`

#### API-XBID-086 — A locked event refuses any revision after submission
- **Why it matters.** With the lock on, a submitted quote cannot be revised at all.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). lock_quote_after_submission is ON; {{bidUuid}} is an active submitted bid. gate: `lock_quote_after_submission` must be on for this case's outcome to hold.
- **Steps.** 1. PATCH /api/bids/revise_bid/{{bidUuid}}.
- **Expected.** Should be 422 code 875 'Revise bid is locked. You cannot edit your quote after submission.' from update_bid_action_helper (app/controllers/concerns/bids_controller_helper.rb:48-50). gate: lock_quote_after_submission=true.
- **Oracle.** Status < 500; ideally 422 code 875.
- **Trace.** P1 · automate · `EDGE-BID-086` · `app/controllers/concerns/bids_controller_helper.rb:48`

#### API-XBID-087 — Revising a non-existent bid is refused
- **Why it matters.** A guessed bid id must not be revisable.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). None.
- **Steps.** 1. PATCH /api/bids/revise_bid/WrongUuid1=.
- **Expected.** HTTP 422 error.code 32 'Bid not found' — update_bid finds no bid outside revised/rejected/selected/revoke/in_active/draft (app/controllers/api/bids_controller.rb:110-111).
- **Oracle.** Nothing revised.
- **Trace.** P1 · automate · `EDGE-BID-087` · `app/controllers/api/bids_controller.rb:110`

#### API-XBID-088 — A bid already selected for award cannot be revised
- **Why it matters.** A selected bid is committed; revising it would rewrite the award basis.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). {{bidUuid}} is a bid the buyer has selected.
- **Steps.** 1. PATCH /api/bids/revise_bid/{{bidUuid}}.
- **Expected.** Should be 422 code 32 'Bid not found' — update_bid excludes selected bids from the lookup (app/controllers/api/bids_controller.rb:110-111). Requires a selected bid.
- **Oracle.** Status < 500; the selected bid is unchanged.
- **Trace.** P1 · automate · `EDGE-BID-088` · `app/controllers/api/bids_controller.rb:110`

## 8. Surrogate bids (buyer on behalf of a vendor)

Surrogate technical: `POST /template_responses/create_surrogate_response`; surrogate RFQ bid: `POST /bids/template_input`. is_surrogate_bidding_and_is_allowed? (bids_controller_helper.rb:2130-2141) blocks it when the company disallows it (10) or the user is not a valid surrogate bidder (165). allowed_surrogate_bid_even_after_bid governs re-entry after a real bid.

#### API-XBID-089 — A surrogate technical response with no stage id is refused
- **Why it matters.** Presence guard on the surrogate entry point.
- **Setup.** Session: the BUYER who owns the sandbox event (this is how the platform runner authenticates). Live technical stage; surrogate answer for vendor {{vendorUuid}}.
- **Steps.** 1. POST /template_responses/create_surrogate_response with item_uuid removed.
- **Expected.** HTTP 422 error.code 2 'Insufficient parameters' from create_surrogate_response app/controllers/api/template_responses_controller.rb:226-227.
- **Oracle.** No surrogate response.
- **Trace.** P1 · automate · `EDGE-BID-089` · `app/controllers/api/template_responses_controller.rb:226`

#### API-XBID-090 — Surrogate bidding disabled by the company is refused
- **Why it matters.** Some companies forbid buyers entering bids for vendors; the config must be honoured.
- **Setup.** Session: the BUYER who owns the sandbox event (this is how the platform runner authenticates). is_buyer_not_allowed_to_add_surrogate_bid is set on {{tradeId}}. gate: `is_buyer_not_allowed_to_add_surrogate_bid` must be on for this case's outcome to hold.
- **Steps.** 1. POST /template_responses/create_surrogate_response for vendor {{vendorUuid}}.
- **Expected.** Should be 422 code 10 'You are not allowed to use this functionality' — is_surrogate_bidding_and_is_allowed? (app/controllers/concerns/bids_controller_helper.rb:2134-2135) via create_surrogate_trade_request_response (app/controllers/concerns/template_responses_controller_helper.rb:266-267). gate: is_buyer_not_allowed_to_add_surrogate_bid=true.
- **Oracle.** Status < 500; ideally 422 code 10.
- **Trace.** P1 · manual · `EDGE-BID-090` · `app/controllers/concerns/bids_controller_helper.rb:2134`

#### API-XBID-091 — A user without surrogate rights cannot enter a vendor's technical response
- **Why it matters.** Surrogate entry is a powerful buyer action; only authorised users may do it.
- **Setup.** Session: a member who is not the event owner, not a valid team member and not a super_admin, on {{tradeId}}.
- **Steps.** 1. POST /template_responses/create_surrogate_response for vendor {{vendorUuid}}.
- **Expected.** Should be 422 code 165 'Cannot place bid on trade by your own company' — is_valid_surrogate_bidder requires super_admin or valid team or owner (app/controllers/concerns/bids_controller_helper.rb:2136-2138).
- **Oracle.** Status < 500; ideally 422 code 165.
- **Trace.** P1 · manual · `EDGE-BID-091` · `app/controllers/concerns/bids_controller_helper.rb:2137`

#### API-XBID-092 — A surrogate technical response is refused after the window unless post-expiry surrogates are on
- **Why it matters.** Post-close surrogate entry is only allowed when the buyer explicitly enabled it.
- **Setup.** Session: the BUYER who owns the sandbox event (this is how the platform runner authenticates). {{tradeId}} technical stage has closed and is_allowed_to_add_surrogate_bid_post_expiry is off. gate: `is_allowed_to_add_surrogate_bid_post_expiry` must be off for this case's outcome to hold.
- **Steps.** 1. POST /template_responses/create_surrogate_response.
- **Expected.** Should be 422 code 33 'Order not active' — create_surrogate_trade_request_response (app/controllers/concerns/template_responses_controller_helper.rb:265) requires is_upcoming_or_running or the post-expiry flag. gate: is_allowed_to_add_surrogate_bid_post_expiry=false + closed stage.
- **Oracle.** Status < 500; ideally 422 code 33.
- **Trace.** P1 · manual · `EDGE-BID-092` · `app/controllers/concerns/template_responses_controller_helper.rb:265`

#### API-XBID-093 — A surrogate response after the vendor already responded is refused unless allowed-after-bid is on
- **Why it matters.** The buyer must not overwrite a vendor's own submitted response by default.
- **Setup.** Session: the BUYER who owns the sandbox event (this is how the platform runner authenticates). Vendor {{vendorUuid}} already has an active technical response on {{tradeId}}; allowed_surrogate_bid_even_after_bid is off. gate: `allowed_surrogate_bid_even_after_bid` must be off for this case's outcome to hold.
- **Steps.** 1. POST /template_responses/create_surrogate_response for that vendor.
- **Expected.** Should be 422 code 30 'Bid already placed for this order' — create_surrogate_trade_request_response (app/controllers/concerns/template_responses_controller_helper.rb:268-272) blocks a second response unless allowed_surrogate_bid_even_after_bid. gate: allowed_surrogate_bid_even_after_bid=false.
- **Oracle.** Status < 500; ideally 422 code 30.
- **Trace.** P2 · manual · `EDGE-BID-093` · `app/controllers/concerns/template_responses_controller_helper.rb:272`

#### API-XBID-094 — A surrogate RFQ bid disabled by the company is refused
- **Why it matters.** The config that forbids surrogate bidding must apply to the commercial path too.
- **Setup.** Session: the BUYER who owns the sandbox event (this is how the platform runner authenticates). is_buyer_not_allowed_to_add_surrogate_bid is set on the RFQ stage {{tradeId}}. gate: `is_buyer_not_allowed_to_add_surrogate_bid` must be on for this case's outcome to hold.
- **Steps.** 1. POST /bids/template_input for vendor {{vendorUuid}}.
- **Expected.** Should be 422 code 10 'You are not allowed to use this functionality' — create_bid → allowed_surrogate_bid_placement (app/controllers/api/bids_controller.rb:47) → is_surrogate_bidding_and_is_allowed? (app/controllers/concerns/bids_controller_helper.rb:2134-2135). gate: is_buyer_not_allowed_to_add_surrogate_bid=true.
- **Oracle.** Status < 500; ideally 422 code 10.
- **Trace.** P1 · automate · `EDGE-BID-094` · `app/controllers/concerns/bids_controller_helper.rb:2134`

#### API-XBID-095 — A surrogate bid after the vendor already bid is refused unless allowed-after-bid is on
- **Why it matters.** The buyer must not clobber a vendor's own bid; the flag governs re-entry.
- **Setup.** Session: the BUYER who owns the sandbox event (this is how the platform runner authenticates). Vendor {{vendorUuid}} already has an active bid on {{tradeId}}; allowed_surrogate_bid_even_after_bid is off. gate: `allowed_surrogate_bid_even_after_bid` must be off for this case's outcome to hold.
- **Steps.** 1. POST /bids/template_input for that vendor.
- **Expected.** Should be 422 code 99 'A bid is already placed on behalf of this company.' — validate_existing_bids_if_present (app/controllers/concerns/bids_controller_helper.rb:2760-2764). gate: allowed_surrogate_bid_even_after_bid=false.
- **Oracle.** Status < 500; ideally 422 code 99.
- **Trace.** P1 · automate · `EDGE-BID-095` · `app/controllers/concerns/bids_controller_helper.rb:2762`

#### API-XBID-096 — A surrogate RFQ bid before the window is refused unless surrogate is allowed
- **Why it matters.** Timing rules apply to surrogate bids too.
- **Setup.** Session: the BUYER who owns the sandbox event (this is how the platform runner authenticates). {{tradeId}} is an Upcoming RFQ stage.
- **Steps.** 1. POST /bids/template_input for vendor {{vendorUuid}}.
- **Expected.** Should be 422 code 33 'Order not active' — create_bid requires is_running, or (surrogate AND upcoming_or_running/post-expiry) (app/controllers/api/bids_controller.rb:50). An upcoming surrogate is allowed only via is_upcoming_or_running, so a not-yet-published stage refuses.
- **Oracle.** Status < 500; ideally 422 code 33.
- **Trace.** P1 · automate · `EDGE-BID-096` · `app/controllers/api/bids_controller.rb:50`

#### API-XBID-097 — A non-surrogate call on a staggered event is refused
- **Why it matters.** Serial bidding has its own path; ordinary create must be refused.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). {{tradeId}} is a staggered (serial) auction and the caller is not surrogate.
- **Steps.** 1. POST /v1/bids on the staggered stage as the vendor.
- **Expected.** Should be 422 code 508 'Not allowed to bid on this product' — allowed_surrogate_bid_placement (app/controllers/api/bids_controller.rb:426-427) blocks non-surrogate bids on staggered events via this API. gate: staggered/serial auction.
- **Oracle.** Status < 500; ideally 422 code 508.
- **Trace.** P2 · automate · `EDGE-BID-097` · `app/controllers/api/bids_controller.rb:426`

#### API-XBID-098 — A surrogate RFQ bid with no company is refused
- **Why it matters.** The surrogate call still needs to name the vendor it bids for.
- **Setup.** Session: the BUYER who owns the sandbox event (this is how the platform runner authenticates). Live RFQ stage.
- **Steps.** 1. POST /bids/template_input with company_uuid removed.
- **Expected.** Should be a typed 4xx. create_bid reads company_id (app/controllers/api/bids_controller.rb:35); a blank company means can_place_bid_for_company fails (101) or the transform finds no data. Must not 5xx.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-BID-098` · `app/controllers/api/bids_controller.rb:35`

## 9. Regretting a line, cost-breakdown and T&C

`PATCH /v1/bids/:id/line_items/:egli_id/regret_status` runs `Bids::LineItemRegretService` (validate at line 95). Cost-breakdown time strips price/global updates (trade_controller_helper.rb:6658-6661). Mandatory T&C is `is_tnc_mandatory` (trade_request_model_helper effective_tnc_mode). The regret path is not on the platform allowlist, so those cases are documented as workflow negatives and reported not-run.

#### API-XBID-099 — An unknown regret action type is refused
- **Why it matters.** Only regret/undo_regret are valid; anything else must be refused.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A draft bid {{bidUuid}} and line item {{lineItemUuid}} on {{tradeId}}.
- **Steps.** 1. PATCH /v1/bids/{{bidUuid}}/line_items/{{lineItemUuid}}/regret_status with action_type 'delete'.
- **Expected.** Should be 422 code 805 'Invalid action type' from LineItemRegretService#validate (app/services/bids/line_item_regret_service.rb:96, ACTION_TYPES = regret/undo_regret). This route is not on the platform allowlist, so it is reported not-run.
- **Oracle.** Status < 500; ideally 422 code 805.
- **Trace.** P1 · automate · `EDGE-BID-099` · `app/services/bids/line_item_regret_service.rb:96`

#### API-XBID-100 — Regretting a line on a non-existent bid is refused
- **Why it matters.** A guessed bid id must not accept a regret.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). None.
- **Steps.** 1. PATCH /v1/bids/WrongUuid1=/line_items/{{lineItemUuid}}/regret_status.
- **Expected.** Should be 422 code 806 'Bid not found' from LineItemRegretService#validate (app/services/bids/line_item_regret_service.rb:97). Not on the platform allowlist — reported not-run.
- **Oracle.** Status < 500; ideally 422 code 806.
- **Trace.** P1 · automate · `EDGE-BID-100` · `app/services/bids/line_item_regret_service.rb:97`

#### API-XBID-101 — Regretting with a trade id that is not this bid's trade is refused
- **Why it matters.** A regret must apply to the bid's own stage, not an arbitrary one.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A draft bid {{bidUuid}}; the trade id passed belongs to a different stage.
- **Steps.** 1. PATCH /v1/bids/{{bidUuid}}/line_items/{{lineItemUuid}}/regret_status with a mismatched trade_request_uuid.
- **Expected.** Should be 422 code 95 'Trade Request not found' — validate returns 95 when trade_request nil or trade_request.id != bid.trade_request_id (app/services/bids/line_item_regret_service.rb:100, 102). Not on the platform allowlist — reported not-run.
- **Oracle.** Status < 500; ideally 422 code 95.
- **Trace.** P2 · automate · `EDGE-BID-101` · `app/services/bids/line_item_regret_service.rb:102`

#### API-XBID-102 — A vendor cannot regret every line item in a lot-split event
- **Why it matters.** Regretting the whole lot would leave the vendor participating in nothing.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). A lot-split event where regretting {{lineItemUuid}} would leave no active lines for the vendor.
- **Steps.** 1. PATCH /v1/bids/{{bidUuid}}/line_items/{{lineItemUuid}}/regret_status action_type regret.
- **Expected.** Should be 422 code 844 'You cannot regret all line items in a lot split event' — restrict_lot_event_full_egli_prunning (app/services/bids/line_item_regret_service.rb:115-128). gate: lot-split event. Not on the platform allowlist — reported not-run.
- **Oracle.** Status < 500; ideally 422 code 844.
- **Trace.** P2 · automate · `EDGE-BID-102` · `app/services/bids/line_item_regret_service.rb:126`

#### API-XBID-103 — During cost-breakdown time, global price updates are ignored
- **Why it matters.** CBD is a cost-justification phase, not a re-quote; global changes must not move the rank.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). {{tradeId}} is in cost-breakdown (CBD) review time; {{bidUuid}} is the vendor's bid.
- **Steps.** 1. PATCH /v1/bids/{{bidUuid}} with a changed gross_total while CBD is running.
- **Expected.** During CBD, parse_components_for_bid drops all but price/serial_number and clears global updates (app/controllers/concerns/trade_controller_helper.rb:6658-6661). The global gross_total change should not alter the ranking price. gate: in_cost_break_down_time.
- **Oracle.** Status < 500; the ranking price is unchanged by the global edit.
- **Trace.** P2 · automate · `EDGE-BID-103` · `app/controllers/concerns/trade_controller_helper.rb:6658`

#### API-XBID-104 — With mandatory T&C on, every clause is treated as required
- **Why it matters.** Mandatory T&C is a compliance gate; ignoring it must not yield a valid bid.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). {{tradeId}} has is_tnc_mandatory=true; the vendor submits without accepting a clause. gate: `is_tnc_mandatory` must be on for this case's outcome to hold.
- **Steps.** 1. PATCH /v1/bids/{{bidUuid}} to active without accepting the mandatory terms.
- **Expected.** With is_tnc_mandatory=true, effective_tnc_mode returns 'required' for every clause and attachment (trade_request.rb:998-1003; trade_request_model_helper). A submit that ignores them should be refused. gate: is_tnc_mandatory=true. Documented as no-5xx since the acceptance state cannot be forced in one run.
- **Oracle.** Status < 500; ideally the bid is not activated without acceptance.
- **Trace.** P2 · automate · `EDGE-BID-104` · `app/models/trade_request.rb:1000`

#### API-XBID-105 — The valid create-bid request stays typed under repeated calls
- **Why it matters.** A control case: the base request never 5xxes even when repeated.
- **Setup.** Session: the invited VENDOR user of {{vendorUuid}} (not the buyer). Live RFQ stage; a clean create then a duplicate.
- **Steps.**
  1. POST /v1/bids.
  2. POST /v1/bids again immediately.
- **Expected.** The happy path returns 200 with a bid_uuid (app/controllers/api/v1/bids_controller.rb:37); a same-window duplicate returns a typed 4xx (516 lock or 96 duplicate). Neither is a 5xx.
- **Oracle.** Both responses are < 500.
- **Trace.** P2 · automate · `EDGE-BID-105` · `app/controllers/api/v1/bids_controller.rb:37`
