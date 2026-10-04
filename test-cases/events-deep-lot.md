# Lots and multi-currency — deep cases

Deep API and screen cases for splitting an RFQ into lots (smart lots, draft lot plans, publishing lots, per-lot
withdraw/award), per-line staggered closing, and multi-currency events (currency table, vendor currency, exchange-rate
updates, conversion in the comparison sheet and the award). Each case is grounded in `procol-backend` at `origin/main`
or in `procol-client-dashboard`. Cases with a runnable twin share its number (API-XDLOT-007 ↔ EDGE-DLOT-007 in
`prototype/data/api-cases-extra/deep-lot.json`); the twins run as the QA buyer against the run's sandbox event. Settings
that change behaviour: is_lot_creation_enabled (menu only — the API does not read it), rfx_project_enabled,
enable_multi_currency_flow, auto_fetch_currency_exchange_rates, show_proposal_value_in_base_currency.

**Read before running.** `GET .../get_lots` is NOT read-only: when the event has no lot plan (or only smart lots) it
builds smart lots and SAVES them on the event. `Z2dnWmdaUWtnZw==` is a well-formed id for 999999999 (no such row);
`WrongUuid1=` decodes to nil.

## 1. Reading lots — GET /event_groups/:id/get_lots

#### API-XDLOT-001 — Asking for lots without naming the RFQ round is refused
- **Why it matters.** The Manage Lots drawer always passes the RFQ round; a call without it must say 'missing parameter', not guess a
  round or build lots for nothing.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** Read the lots of the sandbox event without the round: `GET /event_groups/{{eventGroupUuid}}/get_lots`.
- **Expected.** A clean refusal; nothing is computed or saved. HTTP 422, error code 2 'Insufficient parameters' — the event passes
  the latest-version and visibility checks, then the RFQ lookup with no id comes back empty.
- **Oracle.** 422 + code 2; a later read of the event shows no lots.
- **Trace.** P1 · automate · `EDGE-DLOT-001` · `app/controllers/api/event_groups_controller.rb:891-899`

#### API-XDLOT-002 — Asking for lots of the technical (RFP) round is refused
- **Why it matters.** Only an RFQ can be split into lots; pointing the lot panel at the technical round must not build a lot sheet from
  technical answers.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer. This
  needs an RFP+RFQ run: {{rfpTradeId}} is the sandbox's technical round.
- **Steps.** `GET /event_groups/{{eventGroupUuid}}/get_lots?trade_request_uuid={{rfpTradeId}}`.
- **Expected.** Refused, nothing saved. HTTP 422, error code 2 'Insufficient parameters' — the round lookup is filtered to rfx_mode
  rfq.
- **Oracle.** 422 + code 2.
- **Trace.** P1 · automate · `EDGE-DLOT-002` · `app/controllers/api/event_groups_controller.rb:898-899`

#### API-XDLOT-003 — An unreadable round id in the lot request is refused
- **Why it matters.** A corrupted link (copied uuid with a character missing) decodes to nothing; the answer must be a refusal, not lots
  of some other round.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `GET /event_groups/{{eventGroupUuid}}/get_lots?trade_request_uuid=WrongUuid1=` (decodes to nil).
- **Expected.** HTTP 422, error code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DLOT-003` · `app/controllers/concerns/params_auth.rb:70-75` · `app/controllers/api/event_groups_controller.rb:898-899`

#### API-XDLOT-004 — Lots of an event that does not exist are refused, not a crash
- **Why it matters.** DEFECT-IN-WAITING. The controller asks the event whether it is the latest version BEFORE checking that the event was
  found, so a stale or mistyped link crashes the endpoint instead of answering 'not found'. Any monitoring that counts
  500s will page on harmless typos.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer. The
  event id is the well-formed but non-existent `Z2dnWmdaUWtnZw==` (id 999999999).
- **Steps.** `GET /event_groups/Z2dnWmdaUWtnZw==/get_lots?trade_request_uuid={{tradeId}}`.
- **Expected.** Should be a typed refusal (422 code 2 or 4). Today `nil.latest?` raises NoMethodError → HTTP 500, because the
  latest? check (line 895) runs before the blank check (line 896).
- **Oracle.** Status < 500; ideally 422 code 2.
- **Trace.** P1 · automate · `EDGE-DLOT-004` · `app/controllers/api/event_groups_controller.rb:894-896`

#### API-XDLOT-005 — Lots with an unreadable event id are refused, not a crash
- **Why it matters.** Same guard-order defect reached through the path id: a uuid that does not decode becomes nil and crashes the
  endpoint.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `GET /event_groups/WrongUuid1=/get_lots?trade_request_uuid={{tradeId}}`.
- **Expected.** Should be 422 code 2. Today 500 (nil.latest?).
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-DLOT-005` · `app/controllers/concerns/params_auth.rb:61-62` · `app/controllers/api/event_groups_controller.rb:894-896`

#### API-XDLOT-006 — Lots of this event cannot be read through another event's RFQ
- **Why it matters.** DEFECT-IN-WAITING (data exposure + cross-event write). get_lots authorises the event in the URL but then loads
  whatever RFQ id is in the query, with no check that it belongs to that event or even to the same company, and the
  service builds and SAVES smart lots on the RFQ's own event. A buyer who can see any one event can read another
  event's L1 amounts and vendor names, and seed its lot plan.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
  {{pricingTradeUuid}} is the JOURNEY's own RFQ stage (bid window over, one submitted bid from the QA vendor, an award
  proposal created and submitted); {{tradeProductUuid}} is that stage's quoted line. The two events are different. Run
  it last: if the defect is present the journey event gets draft smart lots written onto it.
- **Steps.** `GET /event_groups/{{eventGroupUuid}}/get_lots?trade_request_uuid={{pricingTradeUuid}}` (sandbox event, journey
  RFQ).
- **Expected.** Should be refused (422 code 2) like reset_to_smart_lots, which scopes the round by event and company. Today the
  lookup is `TradeRequest.where(id:, rfx_mode: :rfq).last` (no event_group_id, no company_id) and the journey's lots
  come back with HTTP 200.
- **Oracle.** Status 4xx. If 200: the reply's lots list the JOURNEY's line item and vendor; GET get_lots on the journey event now
  shows mode smart_lots.
- **Trace.** P0 · automate · `EDGE-DLOT-006` · `app/controllers/api/event_groups_controller.rb:898-902` · `app/services/lots/lot_splitting_service.rb:9-11, 23-35`

#### API-XDLOT-007 — Opening the lots of a live RFQ works and builds smart lots
- **Why it matters.** The buyer can open Manage Lots any time (only publishing is blocked while bidding). The first read must build a
  sensible starting split, not crash on an event with no bids yet.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer. The
  event has never had lots. Run it last: this read SAVES the generated lots on the sandbox.
- **Steps.** `GET /event_groups/{{eventGroupUuid}}/get_lots?trade_request_uuid={{tradeId}}`.
- **Expected.** HTTP 200 with `lot_state` {is_smart_lots_enabled: true, mode: smart_lots} and lots 1-5. With no bids and no
  technical round the single item lands in lot 1 described 'Lot Summary: This lot includes items marked as Regret and
  TNA.'; lots 2-5 are empty. Each lot is status draft, every line shows L1 '-' and 'Not Placed'.
- **Oracle.** 200; event_groups.lot_config now holds five draft smart lots (read it back with the same GET: identical answer).
- **Trace.** P1 · automate · `EDGE-DLOT-007` · `app/services/lots/lot_splitting_service.rb:23-35, 138-171, 248-285`

#### API-XDLOT-008 — Opening the lots must not hide the event's master QCS report
- **Why it matters.** DEFECT-IN-WAITING. Because get_lots SAVES draft smart lots, the event now has a lot_config. The report list then
  takes the 'lot event' branch and only lists reports for ACTIVE lots — so merely opening Manage Lots (without
  publishing anything) makes the single 'QCS-Purchase' and 'Approval Note' entries disappear from the downloads list.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer. Run it
  after the previous case (it relies on the draft smart lots that read saved). Run it last.
- **Steps.** `GET /event_groups/{{eventGroupUuid}}/get_all_attachments` after get_lots.
- **Expected.** Must not 500. Expected: the report list is the same as before the lots were opened (QCS-Purchase present once the
  event qualifies). Today the lot branch is taken on `lot_config.present?` and every draft lot is skipped, so no
  master QCS entry is produced.
- **Oracle.** No 5xx. Content oracle (manual): compare the report names before and after opening Manage Lots on an event in
  evaluation; 'QCS-Purchase' must not vanish.
- **Trace.** P1 · automate · `EDGE-DLOT-008` · `app/controllers/api/event_groups_controller.rb:1185-1209` · `app/services/lots/lot_splitting_service.rb:31-33`

#### API-XDLOT-009 — Lots of a draft (never published) event are refused, not a crash
- **Why it matters.** A buyer can only split a published RFQ, but the endpoint looks the event up among active/withdrawn events only and
  then calls latest? on the empty result — a draft event id crashes the endpoint.
- **Setup.** A QA_Platform_ draft event with an RFQ stage (not published). No twin: the run's sandbox is always published.
- **Steps.** `GET /event_groups/<draft uuid>/get_lots?trade_request_uuid=<its RFQ>`.
- **Expected.** Should be 422 code 2. Today 500 — `EventGroup.where(status: VALID_STATUSES_FOR_DASHBOARD)` excludes drafts and
  `nil.latest?` raises.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `app/controllers/api/event_groups_controller.rb:893-896` · `app/models/event_group.rb:147`

#### API-XDLOT-010 — An invited vendor cannot read the buyer's lot sheet
- **Why it matters.** SECURITY. get_lots and the two lot writes only ask the event policy for show?, which is true for an invited vendor
  (they can view the stage). The reply carries every bidder's name, the L1 amount per line and each vendor's technical
  score label — the competitive picture a vendor must never see.
- **Setup.** Event in evaluation with two vendors' bids; session of one invited vendor (client_admin_dashboard app allows
  event_groups#get_lots). No twin: cases only run as the buyer.
- **Steps.** As the vendor: `GET /event_groups/<event>/get_lots?trade_request_uuid=<RFQ>`.
- **Expected.** Refused (HTTP 422 code 455 'You are not authorized to perform this action' or 101). Today EventGroupPolicy#show?
  passes for anyone who can view a stage and the full sheet (vendor_data per line) is returned.
- **Oracle.** Vendor gets 4xx; no vendor names / L1 values in any vendor-visible reply.
- **Trace.** P0 · manual · `app/policies/event_group_policy.rb:52-54` · `app/controllers/api/event_groups_controller.rb:897` · `app/services/lots/lot_splitting_service.rb:199-240`

#### API-XDLOT-011 — A buyer from another company cannot read this event's lots
- **Why it matters.** Basic tenant isolation for the lot sheet.
- **Setup.** Session of a buyer in a different company. No twin: needs a second company's user.
- **Steps.** `GET /event_groups/<this event>/get_lots?trade_request_uuid=<its RFQ>`.
- **Expected.** HTTP 422 code 455 'You are not authorized to perform this action' — show? requires a visible stage and the other
  company's user has none. (The event lookup itself is not company-scoped, so the refusal relies entirely on the
  policy.)
- **Oracle.** 455; nothing saved on the event.
- **Trace.** P1 · manual · `app/controllers/api/event_groups_controller.rb:893-897` · `app/policies/event_group_policy.rb:52-54`

#### API-XDLOT-012 — Smart lots group items by technical outcome
- **Why it matters.** Smart lots are the product's suggestion of how to split; a wrong rule puts a single-source item into a competitive
  lot and the award goes wrong.
- **Setup.** RFP+RFQ event in evaluation, three vendors, technical scores entered: item A only one vendor technically accepted;
  item B all three accepted; item C every vendor TNA or regretted; item D a mix; item E not yet evaluated.
- **Steps.** `PATCH /event_groups/<id>/reset_to_smart_lots?trade_request_uuid=<RFQ>` then `GET .../get_lots?...`.
- **Expected.** Lots in this order, each draft: OEM (single valid vendor) = A; all technically accepted = B; Regret and TNA = C;
  mixed = D; evaluation pending = E; empty categories are appended after the filled ones. Descriptions match the
  category.
- **Oracle.** Each lot's old_trade_product_uuids and description match the rule in classify_into_lots.
- **Trace.** P1 · manual · `app/services/lots/lot_splitting_service.rb:138-171, 248-273`

#### API-XDLOT-013 — Smart lots return five lots although the product promises at most four
- **Why it matters.** The help centre says items can be split into at most four lots, and EventGroup#get_default_lot_config builds exactly
  four — but smart lots always produce five (one per category, empty ones included) and nothing in save/publish caps
  the count.
- **Setup.** Any RFQ; open lots for the first time.
- **Steps.** `GET /event_groups/<id>/get_lots?trade_request_uuid=<RFQ>`; then save a draft with lot keys 1-9.
- **Expected.** Product decision needed: either the limit is real (refuse lot 5+ with a 4xx) or the help text is wrong. Today: 5
  smart lots, and 9 manual lots save with HTTP 200; get_default_lot_config is never called.
- **Oracle.** Count of lots in the reply; record it against the documented limit.
- **Trace.** P2 · manual · `app/services/lots/lot_splitting_service.rb:248-273` · `app/models/event_group.rb:840-846`

## 2. Saving a draft lot plan — PATCH /event_groups/:id/save_draft_lots

#### API-XDLOT-014 — Saving a lot plan with no lots is refused
- **Why it matters.** The 'Move items to' dropdown always sends the whole plan; an empty body must not wipe or corrupt the saved plan.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}/save_draft_lots` with body `{}`.
- **Expected.** HTTP 422, error code 2 'Insufficient parameters'; the saved plan is unchanged.
- **Oracle.** 422 + code 2; GET get_lots unchanged.
- **Trace.** P1 · automate · `EDGE-DLOT-014` · `app/controllers/api/event_groups_controller.rb:931-932`

#### API-XDLOT-015 — A lot with no line items is refused
- **Why it matters.** The server works out which RFQ the plan belongs to from the first line item it finds; a plan with no items has no
  RFQ and must be refused.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `PATCH .../save_draft_lots` with `{"lots": {"1": {"lot_title": "QA_Platform_lot_{{stamp}}", "description": ""}}}`.
- **Expected.** HTTP 422, error code 2 'Insufficient parameters' (first_tp_id is blank).
- **Oracle.** 422 + code 2.
- **Trace.** P1 · automate · `EDGE-DLOT-015` · `app/controllers/api/event_groups_controller.rb:933-934`

#### API-XDLOT-016 — A lot naming a line item that does not exist is refused
- **Why it matters.** A stale drawer (item deleted in another tab) sends an id that no longer exists; the server must refuse instead of
  saving a plan with a ghost line.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `PATCH .../save_draft_lots` with `{"lots": {"1": {"lot_title": "QA_Platform_lot_{{stamp}}",
  "old_trade_product_uuids": ["Z2dnWmdaUWtnZw=="]}}}`.
- **Expected.** HTTP 422, error code 2 'Insufficient parameters' — the line's RFQ cannot be found.
- **Oracle.** 422 + code 2.
- **Trace.** P1 · automate · `EDGE-DLOT-016` · `app/controllers/api/event_groups_controller.rb:935-936`

#### API-XDLOT-017 — Lots sent as a list instead of a map are refused, not a crash
- **Why it matters.** DEFECT-IN-WAITING. The controller calls `.values` on whatever 'lots' is; a JSON array (the natural shape for a list
  of lots) has no `.values` and the endpoint crashes.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `PATCH .../save_draft_lots` with `{"lots": [{"lot_title": "QA_Platform_lot_{{stamp}}", "old_trade_product_uuids":
  ["Z2dnWmdaUWtnZw=="]}]}`.
- **Expected.** Should be 422 code 2. Today Array#values → NoMethodError → HTTP 500 (before any write).
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DLOT-017` · `app/controllers/api/event_groups_controller.rb:931-933`

#### API-XDLOT-018 — Lots sent as plain text are refused, not a crash
- **Why it matters.** Same unguarded `.values`, reached with a string.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `PATCH .../save_draft_lots` with `{"lots": "QA_Platform_lot_{{stamp}}"}`.
- **Expected.** Should be 422 code 2. Today String#values → NoMethodError → HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-DLOT-018` · `app/controllers/api/event_groups_controller.rb:931-933`

#### API-XDLOT-019 — Saving lots on an event that does not exist is refused, not a crash
- **Why it matters.** DEFECT-IN-WAITING: the same guard-order slip as get_lots — latest? is asked of a missing event.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `PATCH /event_groups/Z2dnWmdaUWtnZw==/save_draft_lots` with a one-lot body naming a non-existent item.
- **Expected.** Should be 422 code 2. Today `nil.latest?` → HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DLOT-019` · `app/controllers/api/event_groups_controller.rb:927-929`

#### API-XDLOT-020 — A second lot without an item list is refused, not a crash
- **Why it matters.** DEFECT-IN-WAITING. Only the FIRST item id is checked up front; every lot's list is then counted with `ids.count {}`.
  A lot whose list is null (a lot the screen emptied) crashes the save.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
  {{pricingTradeUuid}} is the JOURNEY's own RFQ stage (bid window over, one submitted bid from the QA vendor, an award
  proposal created and submitted); {{tradeProductUuid}} is that stage's quoted line. No sandbox line-item placeholder
  exists, so lot 1 names the journey's quoted line to get past the first checks (this also exercises the missing event
  check of the next case).
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}/save_draft_lots` with lot 1 = [{{tradeProductUuid}}] and lot 2 =
  `{"old_trade_product_ids": null}`.
- **Expected.** Should be 422 (code 2, or 842 'Unable to save lots'). Today, when the journey's stage is still active,
  validate_lot_config calls `nil.count` → HTTP 500 (before save!, so nothing is written). If the stage is no longer
  active the request stops earlier with code 2.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DLOT-020` · `app/controllers/api/event_groups_controller.rb:944, 965-971`

#### API-XDLOT-021 — Lots of this event cannot be filled with another event's line items
- **Why it matters.** DEFECT-IN-WAITING (cross-event corruption). The RFQ is inferred from the FIRST item id and never compared with the
  event in the URL. A plan saved on event A with event B's items passes the count check against B, is saved on A, and
  the reply shows B's lots. The buyer's real lot plan on A is overwritten with ids A does not own.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
  {{pricingTradeUuid}} is the JOURNEY's own RFQ stage (bid window over, one submitted bid from the QA vendor, an award
  proposal created and submitted); {{tradeProductUuid}} is that stage's quoted line. Run it last: if the guard is
  missing the sandbox's lot plan is overwritten and the journey event may get draft smart lots.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}/save_draft_lots` with `{"lots": {"1": {"lot_title":
  "QA_Platform_lot_{{stamp}}", "old_trade_product_uuids": ["{{tradeProductUuid}}"]}}}`.
- **Expected.** Should be refused (422 code 2: the item does not belong to this event). Today: HTTP 200, the sandbox's lot_config
  lot 1 now lists the journey's line, and the reply is the journey event's lots.
- **Oracle.** 4xx; GET get_lots on the sandbox unchanged.
- **Trace.** P0 · automate · `EDGE-DLOT-021` · `app/controllers/api/event_groups_controller.rb:933-938, 949-961`

#### API-XDLOT-022 — The same line item in two lots is refused
- **Why it matters.** An item counted twice would be published in two lot RFQs and awarded twice.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
  {{pricingTradeUuid}} is the JOURNEY's own RFQ stage (bid window over, one submitted bid from the QA vendor, an award
  proposal created and submitted); {{tradeProductUuid}} is that stage's quoted line. Uses the journey's quoted line
  (no sandbox line placeholder exists).
- **Steps.** `PATCH .../save_draft_lots` with lot 1 = [{{tradeProductUuid}}] and lot 2 = [{{tradeProductUuid}}].
- **Expected.** Refused, nothing saved: HTTP 422 code 842 'Unable to save lots' — the duplicated id is counted twice, so 2 ≠ 1 line
  on the RFQ. (Code 2 if the journey stage is no longer active.)
- **Oracle.** 422; lot plan unchanged.
- **Trace.** P1 · automate · `EDGE-DLOT-022` · `app/controllers/api/event_groups_controller.rb:965-974`

#### API-XDLOT-023 — A published lot is not changed by a draft save
- **Why it matters.** Once a lot is published its items are in a live lot RFQ; a later draft save must not move them. The code silently
  skips active lots — the buyer gets HTTP 200 and may believe the move happened.
- **Setup.** Event with lot 1 published (active) and lot 2 draft. Buyer session.
- **Steps.** `PATCH .../save_draft_lots` moving an item from lot 1 to lot 2.
- **Expected.** Lot 1 is unchanged (skipped). Because lot 1's items are still counted, the moved id now appears twice and the save
  is refused 842 'Unable to save lots'; if the body leaves lot 1 out entirely the item silently stays in lot 1 with
  HTTP 200. Expected: an explicit refusal naming the published lot.
- **Oracle.** GET get_lots: lot 1 still active with its items.
- **Trace.** P1 · manual · `app/controllers/api/event_groups_controller.rb:940-948, 965-974`

#### API-XDLOT-024 — Renaming a lot from the drawer is not saved
- **Why it matters.** The drawer's 'Move items to' sends each lot as `{old_trade_product_uuids, status, title}`, but the API reads
  `lot_title`. Lot names typed by the buyer (or carried from the publish payload) are lost on every move.
- **Setup.** Lots drawer open; any move.
- **Steps.** Inspect the save_draft_lots request the drawer sends; then GET get_lots.
- **Expected.** The name the buyer sees is kept. Today `title` is ignored (only `lot_title` is read) and `status` is ignored too.
- **Oracle.** get_lots lot_title after a move equals the title sent.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orderDetails/splitLineItemDrawer/lotSelect.jsx:69-76` · `app/controllers/api/event_groups_controller.rb:943`

#### API-XDLOT-025 — An invited vendor or view-only user cannot rearrange the buyer's lots
- **Why it matters.** SECURITY. save_draft_lots and reset_to_smart_lots write the event's lot plan but only check show?. A vendor who can
  view the RFQ, or a buyer user with read-only trade permission, can overwrite the plan the buyer is about to publish.
- **Setup.** Event in evaluation with a draft lot plan. Session of the invited QA vendor (or a read-only buyer). No twin: cases
  run as the buyer only.
- **Steps.** As that user: `PATCH /event_groups/<id>/save_draft_lots` with a valid plan for the event's items.
- **Expected.** HTTP 422 code 455 'You are not authorized to perform this action' (update?/create_record should be required). Today
  show? passes and the plan is saved.
- **Oracle.** Lot plan unchanged after the call.
- **Trace.** P0 · manual · `app/controllers/api/event_groups_controller.rb:930, 917` · `app/policies/event_group_policy.rb:52-54`

#### API-XDLOT-026 — A lot whose item list is text is refused, not a crash
- **Why it matters.** `old_trade_product_ids: "12"` reaches `"12".count {}`, which needs an argument → ArgumentError → 500.
- **Setup.** Event in evaluation; lot 1 valid, lot 2 has `old_trade_product_ids` as a string. No twin beyond the null variant
  above.
- **Steps.** `PATCH .../save_draft_lots` with lot 2 `{"old_trade_product_ids": "12"}`.
- **Expected.** Should be 422 code 2. Today HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `app/controllers/api/event_groups_controller.rb:969-970`

#### API-XDLOT-027 — Lot names and descriptions are stored safely
- **Why it matters.** Lot titles reach PO/NFA documents and emails; markup must be stripped and long text must not break the plan.
- **Setup.** Event in evaluation; valid plan.
- **Steps.** Save lot 1 with title `QA_Platform_<b>bold</b> O'Brien` + 5,000-character description.
- **Expected.** Saved with tags stripped by the global input sanitiser; quotes kept; no length limit is enforced (record the stored
  length). No 5xx. NOTE: the same title later breaks publishing — see the apostrophe case in section 4.
- **Oracle.** GET get_lots returns the stripped title.
- **Trace.** P2 · automate · `app/controllers/concerns/params_auth.rb:18-41` · `app/controllers/api/event_groups_controller.rb:943-945`

## 3. Going back to smart lots — PATCH /event_groups/:id/reset_to_smart_lots

#### API-XDLOT-028 — Resetting without naming the RFQ is refused
- **Why it matters.** The 'Generate Smart Lot' button always sends the round; a call without it must not touch the plan.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}/reset_to_smart_lots` (no trade_request_uuid).
- **Expected.** HTTP 422, error code 2 'Insufficient parameters' — this is the very first check.
- **Oracle.** 422 + code 2.
- **Trace.** P1 · automate · `EDGE-DLOT-028` · `app/controllers/api/event_groups_controller.rb:906-910`

#### API-XDLOT-029 — Resetting lots of an event that does not exist is refused, not a crash
- **Why it matters.** DEFECT-IN-WAITING: both ids are present so the blank check passes; the event lookup is empty and latest? is asked of
  nil one line before the nil check.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `PATCH /event_groups/Z2dnWmdaUWtnZw==/reset_to_smart_lots?trade_request_uuid={{tradeId}}`.
- **Expected.** Should be 422 code 2. Today HTTP 500 (nil.latest?).
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DLOT-029` · `app/controllers/api/event_groups_controller.rb:911-916`

#### API-XDLOT-030 — Resetting with another event's RFQ is refused
- **Why it matters.** This endpoint scopes the RFQ to the event and the company — the correct pattern the other two lot reads/writes lack.
  It must stay that way.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
  {{pricingTradeUuid}} is the JOURNEY's own RFQ stage (bid window over, one submitted bid from the QA vendor, an award
  proposal created and submitted); {{tradeProductUuid}} is that stage's quoted line.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}/reset_to_smart_lots?trade_request_uuid={{pricingTradeUuid}}`.
- **Expected.** HTTP 422, error code 2 'Insufficient parameters'; neither event's lots change.
- **Oracle.** 422 + code 2.
- **Trace.** P1 · automate · `EDGE-DLOT-030` · `app/controllers/api/event_groups_controller.rb:913-916`

#### API-XDLOT-031 — Resetting the sandbox's lots rebuilds smart lots
- **Why it matters.** The button's happy path: any manual draft plan is discarded and the smart suggestion rebuilt.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer. Run it
  last: it rewrites the sandbox's draft lot plan.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}/reset_to_smart_lots?trade_request_uuid={{tradeId}}`.
- **Expected.** HTTP 200 with lot_state.mode 'smart_lots' and the five smart lots (no lot is published, so 815 does not apply).
- **Oracle.** 200; GET get_lots returns the same plan.
- **Trace.** P2 · automate · `EDGE-DLOT-031` · `app/controllers/api/event_groups_controller.rb:918-922` · `app/services/lots/lot_splitting_service.rb:78-84`

#### API-XDLOT-032 — Smart lots cannot be regenerated after a lot is published
- **Why it matters.** Regenerating would reshuffle items that are already in a live lot RFQ.
- **Setup.** Event with at least one published (active) lot. No twin: the sandbox is still bidding and cannot be split.
- **Steps.** `PATCH .../reset_to_smart_lots?trade_request_uuid=<parent RFQ>`.
- **Expected.** HTTP 422 code 815 'Smart Lot generation failed, a lot has already been published'; plan unchanged.
- **Oracle.** 815; GET get_lots unchanged.
- **Trace.** P0 · automate · `app/services/lots/lot_splitting_service.rb:78-80` · `app/controllers/api/event_groups_controller.rb:919-920`

#### API-XDLOT-033 — A vendor cannot reset the buyer's lot plan
- **Why it matters.** Same show?-only authorisation as save_draft_lots: a viewer can wipe the buyer's manual plan.
- **Setup.** Event in evaluation with a manual draft plan; invited vendor session.
- **Steps.** As the vendor: `PATCH .../reset_to_smart_lots?trade_request_uuid=<RFQ>`.
- **Expected.** HTTP 422 code 455. Today allowed (show?).
- **Oracle.** Manual plan still in place.
- **Trace.** P1 · manual · `app/controllers/api/event_groups_controller.rb:917`

## 4. Publishing lots — POST /trade/create_new_lot

#### API-XDLOT-034 — Lots cannot be published while vendors are still bidding
- **Why it matters.** Splitting mid-bidding would move vendors' half-finished quotes into new rounds. The help centre promises the option
  only during evaluation.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `POST /trade/create_new_lot` with `{"trade_request_uuid": "{{tradeId}}", "lots": {"1": {...}}}` (the drawer's
  Publish Lot body).
- **Expected.** HTTP 422, error code 740 'RFQ event cannot be converted to lots as it is still live.'; no lot RFQ is created.
- **Oracle.** 740; GET get_lots shows no active lot; the RFQ is still live.
- **Trace.** P0 · automate · `EDGE-DLOT-034` · `app/controllers/api/trade_controller.rb:1821-1824` · `app/models/trade_request.rb:1191-1195`

#### API-XDLOT-035 — Publishing lots without naming the RFQ is refused
- **Why it matters.** Without the RFQ there is nothing to split.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `POST /trade/create_new_lot` with only `lots`.
- **Expected.** HTTP 422, error code 95 'Trade Request not found'.
- **Oracle.** 95.
- **Trace.** P1 · automate · `EDGE-DLOT-035` · `app/controllers/api/trade_controller.rb:1821-1822`

#### API-XDLOT-036 — Publishing lots for an RFQ that does not exist is refused
- **Why it matters.** Stale or forged ids must not reach the split service.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `POST /trade/create_new_lot` with trade_request_uuid `Z2dnWmdaUWtnZw==`.
- **Expected.** HTTP 422, error code 95 'Trade Request not found'.
- **Oracle.** 95.
- **Trace.** P1 · automate · `EDGE-DLOT-036` · `app/controllers/api/trade_controller.rb:1821-1822`

#### API-XDLOT-037 — A technical round cannot be split into lots
- **Why it matters.** Only an RFQ (rfx_mode 1) is split; a technical round must be refused, not converted.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer. RFP+RFQ
  run: {{rfpTradeId}} is the technical round.
- **Steps.** `POST /trade/create_new_lot` with trade_request_uuid {{rfpTradeId}}.
- **Expected.** HTTP 422, error code 95 'Trade Request not found'.
- **Oracle.** 95.
- **Trace.** P1 · automate · `EDGE-DLOT-037` · `app/controllers/api/trade_controller.rb:1821-1822`

#### API-XDLOT-038 — Splitting is refused once an award is submitted — with a misleading message
- **Why it matters.** Once an award proposal for the whole RFQ is submitted, splitting would orphan it. The refusal is right, but the
  message talks about an auction that does not exist, so buyers raise support tickets.
- **Setup.** {{pricingTradeUuid}} is the JOURNEY's own RFQ stage (bid window over, one submitted bid from the QA vendor, an award
  proposal created and submitted); {{tradeProductUuid}} is that stage's quoted line. Company setting
  rfx_project_enabled is ON. No twin: if the guard failed the journey's RFQ would really be split (bids moved, round
  closed), which other cases still use.
- **Steps.** `POST /trade/create_new_lot` with trade_request_uuid {{pricingTradeUuid}} and one lot.
- **Expected.** Refused, nothing created: HTTP 422 code 769 'You cannot edit rfq once the auction is created.' —
  is_rfq_changes_restricted? is true because a requested/selected proposal with no lot exists. Expected wording: 'an
  award proposal is already submitted'.
- **Oracle.** 769; the RFQ is not converted (trade_config.read_only_mode false).
- **Trace.** P1 · automate · `app/controllers/api/trade_controller.rb:1825` · `app/models/model_helpers/trade_request_model_helper.rb:1434-1444`

#### API-XDLOT-039 — Publishing with no lots field is refused, not a crash
- **Why it matters.** `params["lots"].to_unsafe_h` runs on nil once the timing checks pass.
- **Setup.** An RFQ whose bid window has closed, no proposal, no lots. Buyer session. No twin: the sandbox stops at 740 first.
- **Steps.** `POST /trade/create_new_lot` with only trade_request_uuid.
- **Expected.** Should be 422 code 2. Today NoMethodError → HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `app/controllers/api/trade_controller.rb:1827`

#### API-XDLOT-040 — A lot entry without its item list is refused, not a crash
- **Why it matters.** The controller tolerates a missing list (flatten of nil) but the split service maps it: `nil.map` crashes inside the
  service constructor, after nothing has been saved yet.
- **Setup.** Closed RFQ, no proposals. Buyer.
- **Steps.** `POST /trade/create_new_lot` with `{"lots": {"1": {"lot_title": "QA_Platform_lot"}}}`.
- **Expected.** Should be 422 code 2. Today HTTP 500.
- **Oracle.** Status < 500; no lot RFQ created.
- **Trace.** P2 · automate · `app/services/create_event_lots/create_service.rb:19-22`

#### API-XDLOT-041 — The same item in two new lots in one request is not refused
- **Why it matters.** DEFECT-IN-WAITING. The overlap check only compares new items with items already in active/in-progress lots, and the
  new list is uniq'd. Two lots in one request that share an item both get it: two lot RFQs, the item awarded twice.
- **Setup.** Closed RFQ with items A, B; no lots published. Buyer.
- **Steps.** `POST /trade/create_new_lot` with lot 1 = [A, B] and lot 2 = [B].
- **Expected.** Should be 422 code 739 'A lot for one or more items already exists.'. Today both lots are created (HTTP 200).
- **Oracle.** After the call each item appears in exactly one active lot (GET get_lots).
- **Trace.** P0 · automate · `app/controllers/api/trade_controller.rb:1826-1828` · `app/services/create_event_lots/create_service.rb:19-31`

#### API-XDLOT-042 — A lot with no items is published
- **Why it matters.** The integration spec admits it: 'Currently, the validation for this is missing from BE'. An empty lot RFQ is created
  and the vendors are notified about a round with nothing to quote.
- **Setup.** Closed RFQ; buyer.
- **Steps.** `POST /trade/create_new_lot` with lot 1 = [] (the spec's own payload).
- **Expected.** Should be 422. Today the request is accepted (spec test is xit).
- **Oracle.** No active lot with zero line items exists.
- **Trace.** P1 · automate · `spec/integrations/sourcing/non_bidding/lot_splitting_spec.rb:81-106`

#### API-XDLOT-043 — A single lot holding every item is accepted by the API
- **Why it matters.** The 'at least two lots' rule exists only in the drawer (toast); the API converts the whole RFQ into one lot, closing
  the parent for nothing. The spec marks the backend rule as pending.
- **Setup.** Closed RFQ; buyer.
- **Steps.** `POST /trade/create_new_lot` with lot 1 = all items.
- **Expected.** Product decision: refuse with 'Please assign line item to at least two lots' like the UI. Today HTTP 200.
- **Oracle.** Record the status.
- **Trace.** P2 · automate · `spec/integrations/sourcing/non_bidding/lot_splitting_spec.rb:108-139` · `procol-client-dashboard/src/views/orderDetails/splitLineItemDrawer/splitLineItemDrawer.jsx:107-149`

#### API-XDLOT-044 — A lot title with an apostrophe breaks publishing
- **Why it matters.** DEFECT-IN-WAITING (SQL injection). The lot entry, title included, is written with a raw SQL string
  `jsonb_set(lot_config, '{<lot_no>}', '<json>'::jsonb)` — no quoting. A title like `Supplier's lot` ends the string
  literal: the publish fails with a database error, and a crafted title can run SQL. Titles are typed by buyers.
- **Setup.** Closed RFQ with a saved draft plan; buyer.
- **Steps.** `POST /trade/create_new_lot` with lot 1 `lot_title` = `QA_Platform_O'Brien lot`.
- **Expected.** Should publish with the title stored verbatim (parameterised SQL). Today PG syntax error → HTTP 500 raised from the
  service constructor (update_event_group_lot_config('in_progress')), before the transaction.
- **Oracle.** Status < 500; lot title read back exactly.
- **Trace.** P0 · manual · `app/services/create_event_lots/create_service.rb:33, 96-101`

#### API-XDLOT-045 — A lot number that is not a number goes into the SQL path unescaped
- **Why it matters.** Same raw SQL: the lot key from the request is pasted into the jsonb path `'{<lot_no>}'`. Keys like `1}',
  '{}'::jsonb)--` change the statement.
- **Setup.** Closed RFQ; buyer.
- **Steps.** `POST /trade/create_new_lot` with lot key `x}'` .
- **Expected.** Should be 422 code 2 (lot numbers are positive integers). Today a DB error → HTTP 500, or worse.
- **Oracle.** Status < 500; lot_config keys are numeric strings only.
- **Trace.** P0 · manual · `app/services/create_event_lots/create_service.rb:96-101` · `app/controllers/api/trade_controller.rb:1831`

#### API-XDLOT-046 — Lots published before the lot panel was ever opened are lost from the event
- **Why it matters.** DEFECT-IN-WAITING. `jsonb_set(NULL, ...)` returns NULL, so on an event whose lot_config is still empty the lot
  entries are never written: the lot RFQs are created, bids moved, the parent closed and marked converted — but the
  event shows no lots. The drawer always reads lots first, so only API/integration clients hit it.
- **Setup.** Closed RFQ whose event has never had get_lots/save_draft_lots called (lot_config NULL).
- **Steps.** `POST /trade/create_new_lot` straight away with two lots.
- **Expected.** Either refuse (code 2) or initialise lot_config. Today HTTP 200 and GET /event_groups/<id> has no lots; the parent
  RFQ is read-only.
- **Oracle.** After the call get_lots lists the published lots as active.
- **Trace.** P1 · manual · `app/services/create_event_lots/create_service.rb:96-101` · `app/serializers/trade_template_serializer.rb:121`

#### API-XDLOT-047 — Turning lot creation off still lets the API split an RFQ
- **Why it matters.** The company switch is_lot_creation_enabled (master config 'Allow users to create RFQ lots', default off) only hides
  the menu; create_new_lot never reads it. A company that has deliberately disabled lots can still have RFQs split by
  any integration or old browser tab.
- **Setup.** Company setting is_lot_creation_enabled is OFF (the default). Closed RFQ; buyer.
- **Steps.** `POST /trade/create_new_lot` with two valid lots.
- **Expected.** HTTP 422 (e.g. 101 'You are not allowed to perform this action'). Today the split succeeds.
- **Oracle.** No lot RFQs when the setting is off.
- **Trace.** P1 · manual · `app/controllers/api/trade_controller.rb:1819-1835` · `db/migrate/20240530125808_is_lot_creation_enabled_master_config.rb:4-17` · `app/serializers/trade_template_serializer.rb:131`

#### API-XDLOT-048 — A lot of a lot is refused, with a misleading message
- **Why it matters.** A lot RFQ (parent_id set) cannot be split again; the refusal reuses 739, which talks about items already in a lot.
- **Setup.** A published lot RFQ, bid window over; buyer.
- **Steps.** `POST /trade/create_new_lot` with the lot RFQ's uuid.
- **Expected.** HTTP 422 code 739 'A lot for one or more items already exists.'.
- **Oracle.** 739; no grand-child RFQ.
- **Trace.** P2 · automate · `app/controllers/api/trade_controller.rb:1829`

#### API-XDLOT-049 — Items already in a published lot cannot be published again
- **Why it matters.** Publishing lot 2 with an item of the already-published lot 1 would put the item in two live RFQs.
- **Setup.** Lot 1 published with item A; buyer.
- **Steps.** `POST /trade/create_new_lot` with lot 2 = [A].
- **Expected.** HTTP 422 code 739 'A lot for one or more items already exists.' (asserted by the integration spec).
- **Oracle.** 739.
- **Trace.** P1 · automate · `app/controllers/api/trade_controller.rb:1826-1828` · `spec/integrations/sourcing/non_bidding/lot_splitting_spec.rb:141-176`

#### API-XDLOT-050 — A member without event-creation permission cannot publish lots
- **Why it matters.** Publishing creates new RFQs and notifies vendors; only buyers who may create events should do it.
- **Setup.** Member user without the trade create permission; closed RFQ.
- **Steps.** As that member: `POST /trade/create_new_lot`.
- **Expected.** HTTP 422 'You are not authorized to perform this action' (spec 'unauthorized_access'). Note the company check (101)
  only runs AFTER the timing checks, so another company's buyer learns whether the RFQ is live (740) before being
  refused.
- **Oracle.** 455/101; nothing created.
- **Trace.** P1 · manual · `app/controllers/api/trade_controller.rb:1823-1830` · `spec/integrations/sourcing/non_bidding/lot_splitting_spec.rb:15-23`

#### API-XDLOT-051 — Publishing lots one at a time keeps the remaining items available
- **Why it matters.** The drawer publishes ONE lot per click. The first publish closes the parent RFQ's schedule and marks it converted;
  the second lot must still be publishable from the same parent.
- **Setup.** Closed RFQ with a draft plan of lots 1 and 2; buyer.
- **Steps.** Publish lot 1, then lot 2 (two create_new_lot calls).
- **Expected.** Both succeed; lot 2's round timing copies lot 1 (sibling lot RFQ); each item is in exactly one active lot.
- **Oracle.** GET get_lots: lots 1 and 2 active; parent trade_config.read_only_mode true.
- **Trace.** P1 · manual · `app/services/create_event_lots/create_service.rb:16-17, 195-200` · `procol-client-dashboard/src/views/orderDetails/splitLineItemDrawer/splitLineItemDrawer.jsx:107-150`

#### API-XDLOT-052 — After a split the vendors are told and asked to review their charges
- **Why it matters.** Vendors' global charges were quoted for the whole RFQ; each lot needs its own. The product creates a bid-
  justification request per moved bid and notifies vendors ('Bid Adjustment Pending').
- **Setup.** Closed RFQ with the QA vendor's bid; buyer publishes two lots.
- **Steps.** Publish; as the vendor list live events; as the buyer open the lot RFQ.
- **Expected.** Vendor sees 'Bid Adjustment Pending' on each lot; one bid-justification request per moved bid; the parent RFQ is
  read-only (read_only_mode true via is_converted_to_lots).
- **Oracle.** Additional requests of type bid_justification exist for each lot RFQ bid; lot split email/push to the QA vendor
  only.
- **Trace.** P1 · manual · `app/services/create_event_lots/create_service.rb:56, 77, 156-165` · `app/models/event_group.rb:888-899` · `app/serializers/trade_template_serializer.rb:121`

#### API-XDLOT-053 — A vendor whose bid totals zero gets 'NaN' charges after a split
- **Why it matters.** DEFECT-IN-WAITING. Global amount charges are re-split by each lot's share of the vendor's total (new_total /
  old_total). A vendor who quoted 0 (free sample, or all lines regretted) divides 0 by 0 and their charges become
  'NaN' in every lot, breaking totals and the QCS.
- **Setup.** Closed RFQ with a global amount charge; one vendor quoted 0 on every line but entered a freight charge.
- **Steps.** Publish two lots.
- **Expected.** Charges split without NaN (e.g. evenly or kept on the first lot). Today other_details[charge] = 'NaN'.
- **Oracle.** Lot RFQ bid other_details contain only numbers.
- **Trace.** P1 · manual · `app/services/create_event_lots/create_service.rb:176-192`

## 5. Living with lots — withdraw, award, extend, hold

#### API-XDLOT-054 — Withdrawing one lot is blocked only by that lot's own award
- **Why it matters.** On a lot event each lot is awarded separately. A submitted award for lot 1 must not freeze lot 2, and lot 2's
  withdrawal must not touch lot 1's award. The 841 check is per lot.
- **Setup.** Lots 1 and 2 published; lot 1 has a selected proposal (meta_data lot_no '1'); lot 2 has none.
- **Steps.** Withdraw lot 2's RFQ (`PATCH /trade/<lot 2 RFQ>` status withdrawn), then try lot 1's.
- **Expected.** Lot 2: allowed (HTTP 200, lot 2 returns to draft). Lot 1: HTTP 422 code 841 'Cannot withdraw the event as proposals
  are already submitted.'.
- **Oracle.** Lot 1 still active with its proposal; lot 2 draft with stage_ids [].
- **Trace.** P0 · manual · `app/controllers/concerns/trade_controller_helper.rb:190-199`

#### API-XDLOT-055 — Withdrawing the parent RFQ of a lot event checks every award
- **Why it matters.** The parent is not in any lot's stage list, so its lot number is blank and the whole-event proposal check applies.
- **Setup.** Lot event; lot 1 has a selected proposal.
- **Steps.** Withdraw the parent RFQ.
- **Expected.** HTTP 422 code 841.
- **Oracle.** Parent and lots unchanged.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:190-199` · `app/models/event_group.rb:757-760`

#### API-XDLOT-056 — Withdrawing a lot's last round returns the lot to draft and frees the parent
- **Why it matters.** After a lot is withdrawn its items must be splittable again; when no lot is active the parent must be editable
  again.
- **Setup.** Lot 1 (only lot) published, no proposals.
- **Steps.** Withdraw lot 1's RFQ.
- **Expected.** lot_config['1'] becomes status draft, stage_ids [], egli_ids removed; parent misc is_converted_to_lots false; a
  transaction failure answers 422 code 1106 'Failed to update lot configuration. Please try again.'.
- **Oracle.** GET get_lots: lot 1 draft; parent trade_config.read_only_mode false.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:230-240, 274-282`

#### API-XDLOT-057 — An award for lot 1 is shown against lot 1 whatever type the lot number was sent as
- **Why it matters.** The event screen matches proposals to lots by `meta_data['lot_no']` against lot_config keys, which are strings. A
  proposal created with lot_no 1 (a number, as some clients send) is stored as a number and never matched: the lot
  shows no proposal and the buyer starts a second one.
- **Setup.** Lot 1 published and closed; buyer.
- **Steps.** `POST /proposal` with `{"event_group_uuid": <id>, "lot_no": 1}` (number), then GET /event_groups/<id>.
- **Expected.** lots['1'].proposal_uuid is the new proposal. Today it is null (only the string '1' matches). (Unknown lot numbers:
  see API-XAWD-094.)
- **Oracle.** GET /event_groups/<id> lots['1'].proposal_uuid not null.
- **Trace.** P1 · manual · `app/serializers/event_group/show_serializer.rb:176-190` · `app/models/proposal.rb:44`

#### API-XDLOT-058 — The technical round cannot be extended once lots exist
- **Why it matters.** Extending the technical round would also push the RFQ, which has already been split.
- **Setup.** RFP+RFQ event with a published lot.
- **Steps.** Extend the technical round's end time.
- **Expected.** HTTP 422 code 818 'You cannot extend the RFQ time after lot creation'.
- **Oracle.** 818; schedules unchanged.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:5754-5756`

#### API-XDLOT-059 — A PR item cannot be put on hold once its event is split into lots
- **Why it matters.** Holding a PR line would desynchronise the lot RFQs built from it.
- **Setup.** PR item linked to an event with a published lot.
- **Steps.** Put the PR item on hold.
- **Expected.** HTTP 422 code 590 'This item cannot be put on hold because the event is split into lots.'.
- **Oracle.** 590.
- **Trace.** P2 · manual · `app/controllers/concerns/purchase_requests_controller_helper.rb:217`

## 6. Staggered (per-line) closing — PATCH /trade/:id/staggered_time

#### API-XDLOT-060 — Staggered times on a round that is not staggered are refused
- **Why it matters.** Per-line closing times only exist on staggered line-item auctions; on an RFQ the call must change nothing.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `PATCH /trade/{{tradeId}}/staggered_time` with `{"trade_products_time": {}}`.
- **Expected.** HTTP 422, error code 4 'Request not found'.
- **Oracle.** 4; schedules unchanged.
- **Trace.** P1 · automate · `EDGE-DLOT-060` · `app/controllers/api/trade_controller.rb:1408-1412` · `app/controllers/concerns/trade_template_helper.rb:1626-1630`

#### API-XDLOT-061 — Staggered times on a round that does not exist are refused
- **Why it matters.** Bogus ids fail closed.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `PATCH /trade/Z2dnWmdaUWtnZw==/staggered_time`.
- **Expected.** HTTP 422, error code 4 'Request not found'.
- **Oracle.** 4.
- **Trace.** P2 · automate · `EDGE-DLOT-061` · `app/controllers/api/trade_controller.rb:1410-1411`

#### API-XDLOT-062 — Anyone signed in can move another company's staggered closing times
- **Why it matters.** SECURITY (missing authorisation). staggered_time has no `authorize` call and no company filter — it looks up any
  active trade by id. Any logged-in user (a vendor in the auction, a buyer of another company) can push out the end
  time of each line, and with it the auction and evaluation schedule. reopen_line_items, next to it, does both checks.
- **Setup.** A live staggered line-item auction of company A; session of a vendor invited to it, or a buyer of company B.
- **Steps.** As that user: `PATCH /trade/<A's auction>/staggered_time` with a later end time for one line.
- **Expected.** HTTP 422 code 455 (or 4). Today HTTP 200 and the line's end time (and the auction end, if later) moves.
- **Oracle.** Trade schedules unchanged after the call.
- **Trace.** P0 · manual · `app/controllers/api/trade_controller.rb:1408-1423 (compare 1426-1430)`

#### API-XDLOT-063 — An unknown line in the staggered times is refused, not a crash
- **Why it matters.** `trade_products_time[key]['start_time']` is read for every key sent; a key that is not a line of the round is nil.
- **Setup.** Live staggered auction; buyer.
- **Steps.** `PATCH /trade/<id>/staggered_time` with `{"trade_products_time": {"999999999": {"start_time": <now>, "end_time":
  <now+600>}}}`.
- **Expected.** Should be 422 (code 507 or 80). Today NoMethodError → HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:2120-2125`

#### API-XDLOT-064 — Staggered times sent as text are refused, not a crash
- **Why it matters.** Comparing a text time with a stored number raises ArgumentError.
- **Setup.** Live staggered auction; buyer.
- **Steps.** Send start_time/end_time as strings for a real line.
- **Expected.** Should be 422 code 507 'Invalid Time Input'. Today valid_time_entries or the >= comparison may raise → 500.
- **Oracle.** Status < 500.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:2122-2123`

#### API-XDLOT-065 — A line's window can only be pushed later, and doing so past the end moves the auction
- **Why it matters.** Shortening a line's window after vendors planned for it is unfair; extending the last line beyond the round end must
  extend the round and the evaluation by the same amount.
- **Setup.** Live staggered auction; buyer.
- **Steps.** 1) Send an earlier end for a line. 2) Send an end 10 minutes after the round end.
- **Expected.** 1) HTTP 422 code 507 'Invalid Time Input'. 2) HTTP 200; auction end = the new line end; evaluation end moved by the
  same delta; closed_at updated.
- **Oracle.** Trade schedules read back.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:2113-2144, 2169-2189`

#### API-XDLOT-066 — Empty staggered times are refused with a misleading message
- **Why it matters.** A blank payload answers 'Product not found', which sends buyers looking for a missing product.
- **Setup.** Live staggered auction; buyer.
- **Steps.** `PATCH /trade/<id>/staggered_time` with `{}`.
- **Expected.** HTTP 422 code 80 'Product not found' (should be code 2).
- **Oracle.** 80.
- **Trace.** P2 · manual · `app/controllers/api/trade_controller.rb:1414-1415`

## 7. Exchange rates on a published round — PATCH /v1/trade/:id/currency_exchange_rates

#### API-XDLOT-067 — A round without multi-currency refuses exchange-rate changes
- **Why it matters.** Single-currency rounds have no rates; the call must say so instead of inventing a currency table.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer. The
  journey creates the RFQ with currency_configuration null, so the round has no currency table unless its pricing
  template carries one.
- **Steps.** `PATCH /v1/trade/{{tradeId}}/currency_exchange_rates` with `{"currency_rates": [{"QA_Platform_XYZ": 83.5}]}`.
- **Expected.** HTTP 422, error code 879 'Multi-currency is not configured for this trade request.'; nothing written. (If the
  template does carry a currency table the unknown code gets code 2 instead — still refused.)
- **Oracle.** 879; GET /trade/{{tradeId}} still has no currency_configuration.
- **Trace.** P1 · automate · `EDGE-DLOT-067` · `app/controllers/api/v1/trade_controller.rb:1466-1472`

#### API-XDLOT-068 — Exchange rates for a round that does not exist are refused
- **Why it matters.** Bogus ids fail closed.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `PATCH /v1/trade/Z2dnWmdaUWtnZw==/currency_exchange_rates`.
- **Expected.** HTTP 422, error code 4 'Request not found'.
- **Oracle.** 4.
- **Trace.** P2 · automate · `EDGE-DLOT-068` · `app/controllers/api/v1/trade_controller.rb:1467-1468`

#### API-XDLOT-069 — Exchange rates with an unreadable round id are refused
- **Why it matters.** Undecodable path ids become nil and must fail closed.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `PATCH /v1/trade/WrongUuid1=/currency_exchange_rates`.
- **Expected.** HTTP 422, error code 4 'Request not found'.
- **Oracle.** 4.
- **Trace.** P2 · automate · `EDGE-DLOT-069` · `app/controllers/concerns/params_auth.rb:61-62` · `app/controllers/api/v1/trade_controller.rb:1467-1468`

#### API-XDLOT-070 — Exchange rates cannot change once a bid is in
- **Why it matters.** A vendor's quote was converted at the rate published when they bid; changing it afterwards silently re-ranks them.
- **Setup.** {{pricingTradeUuid}} is the JOURNEY's own RFQ stage (bid window over, one submitted bid from the QA vendor, an award
  proposal created and submitted); {{tradeProductUuid}} is that stage's quoted line.
- **Steps.** `PATCH /v1/trade/{{pricingTradeUuid}}/currency_exchange_rates` with `{"currency_rates": [{"QA_Platform_XYZ": 1}]}`.
- **Expected.** Refused, nothing written: HTTP 422 code 877 'Exchange rates cannot be updated after bids have been placed.' on a
  multi-currency round; 879 on a single-currency one (the journey's case); 4 if the stage is no longer active.
- **Oracle.** 4xx; rates unchanged.
- **Trace.** P0 · automate · `EDGE-DLOT-070` · `app/controllers/api/v1/trade_controller.rb:1472-1473`

#### API-XDLOT-071 — Rates sent as an object instead of a list are refused
- **Why it matters.** The screen sends a list of one-key objects; a plain object must be a typed refusal.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `PATCH /v1/trade/{{tradeId}}/currency_exchange_rates` with `{"currency_rates": {"USD": 83.5}}`.
- **Expected.** HTTP 422 code 2 'Insufficient parameters' on a multi-currency round; 879 on the sandbox (no currency table). Nothing
  written.
- **Oracle.** 4xx.
- **Trace.** P2 · automate · `EDGE-DLOT-071` · `app/controllers/api/v1/trade_controller.rb:1475-1478`

#### API-XDLOT-072 — A rate written with a thousands separator is refused, not a crash
- **Why it matters.** DEFECT-IN-WAITING. The positive check uses `rate.to_f` ('1,000' → 1.0, passes) but the store uses
  `BigDecimal('1,000')`, which raises ArgumentError → 500. Same for '12abc'. A buyer pasting a rate from a spreadsheet
  crashes the save.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer. The 500
  is only reachable on a multi-currency round with no bids where USD is an allowed, non-base currency; on the sandbox
  (no currency table) the call is refused 879 and this case passes vacuously.
- **Steps.** `PATCH /v1/trade/{{tradeId}}/currency_exchange_rates` with `{"currency_rates": [{"USD": "1,000"}]}`.
- **Expected.** Should be 422 code 878 'Invalid exchange rate: rate_in_base must be a positive number.'. Today, on a multi-currency
  round: HTTP 500 at BigDecimal(rate.to_s), before anything is saved.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DLOT-072` · `app/controllers/api/v1/trade_controller.rb:1487, 1491`

#### API-XDLOT-073 — A rate list holding bare currency codes is refused, not a crash
- **Why it matters.** `currency_rates.flat_map(&:to_unsafe_h)` assumes every element is an object; a list of strings crashes.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
  Reachable only on a multi-currency round with no bids; 879 on the sandbox.
- **Steps.** `PATCH /v1/trade/{{tradeId}}/currency_exchange_rates` with `{"currency_rates": ["USD"]}`.
- **Expected.** Should be 422 code 2. Today NoMethodError (String#to_unsafe_h) → HTTP 500 on a multi-currency round.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-DLOT-073` · `app/controllers/api/v1/trade_controller.rb:1480`

#### API-XDLOT-074 — Zero, negative and non-numeric rates are refused
- **Why it matters.** A zero rate makes a foreign bid free; a negative one makes it the cheapest by definition.
- **Setup.** Published multi-currency RFQ (INR base, USD allowed), no bids. Buyer. No twin: the sandbox has no currency table.
- **Steps.** Send USD = 0, then -5, then 'abc'.
- **Expected.** Each: HTTP 422 code 878 'Invalid exchange rate: rate_in_base must be a positive number.'; USD rate unchanged (the
  spec covers 0).
- **Oracle.** 878 x3; GET /trade/<id> USD rate_in_base unchanged.
- **Trace.** P1 · automate · `app/controllers/api/v1/trade_controller.rb:1487` · `spec/controllers/api/v1/trade_controller_spec.rb:840-930`

#### API-XDLOT-075 — The base currency's own rate cannot be changed
- **Why it matters.** The base is 1 by definition; changing it would rescale every price.
- **Setup.** Multi-currency RFQ, INR base, no bids.
- **Steps.** Send `[{"INR": 2}]`.
- **Expected.** HTTP 422 code 2 'Insufficient parameters' (no message says why — the expected wording is 'base currency rate cannot
  be changed').
- **Oracle.** 2; INR still 1.
- **Trace.** P1 · automate · `app/controllers/api/v1/trade_controller.rb:1486`

#### API-XDLOT-076 — A currency that is not on the event is refused
- **Why it matters.** Adding a currency is a configuration change, not a rate update.
- **Setup.** Multi-currency RFQ with INR+USD, no bids.
- **Steps.** Send `[{"GBP": 110}]`.
- **Expected.** HTTP 422 code 2; no GBP added (spec covers).
- **Oracle.** 2.
- **Trace.** P2 · automate · `app/controllers/api/v1/trade_controller.rb:1485`

#### API-XDLOT-077 — Absurd rates are accepted, and an infinite one is stored as empty
- **Why it matters.** There is no upper bound: 830000000 instead of 83 is saved and every USD bid becomes the most expensive. A JSON 1e400
  parses to Infinity, passes `> 0`, and BigDecimal('Infinity') serialises to null — the currency then has no rate at
  all.
- **Setup.** Multi-currency RFQ, no bids.
- **Steps.** Send USD = 830000000; then USD = 1e400.
- **Expected.** Product decision for a sanity bound (e.g. ±50% of the auto-fetched rate). The infinite rate must be refused 878.
  Today: both HTTP 200; the second leaves rate_in_base null.
- **Oracle.** GET /trade/<id> USD rate_in_base after each call.
- **Trace.** P1 · automate · `app/controllers/api/v1/trade_controller.rb:1487, 1491`

#### API-XDLOT-078 — After a rate update the comparison sheet in bidding currency crashes
- **Why it matters.** DEFECT-IN-WAITING (high impact). The rate is stored as `BigDecimal(rate)`, which Rails writes into the JSON column
  as TEXT ("95.5"); the spec itself compares with `.to_f`. Several readers divide or multiply by rate_in_base without
  converting: the master QCS value in the vendor's currency (`value.to_f / currency.rate_in_base`) and the report
  helper (`value.to_f * currency.rate_in_base`) raise TypeError. So: buyer corrects a rate before bidding opens → a
  USD vendor bids → the comparison sheet / report in bidding currency fails.
- **Setup.** Published multi-currency RFQ (INR base, USD allowed), no bids. Buyer + a vendor bidding in USD.
- **Steps.** 1) `PATCH /v1/trade/<id>/currency_exchange_rates` `[{"USD": 95.5}]`. 2) GET /trade/<id>: note rate_in_base's JSON
  type. 3) Vendor bids in USD. 4) Open the master QCS with 'Show Bidding Currencies'; download the QCS report.
- **Expected.** rate_in_base stays a number and every screen works. Today step 2 shows "95.5" (a string) and step 4 fails with HTTP
  500 (String can't be coerced into Float).
- **Oracle.** Step 2 JSON type is number; step 4 no 5xx.
- **Trace.** P0 · manual · `app/controllers/api/v1/trade_controller.rb:1491` · `app/helpers/api/currency_helper.rb:15-22` · `app/data_models/base_report_data_model_helper.rb:191-192` · `app/controllers/concerns/event_group_controller_helper.rb:2062-2081`

#### API-XDLOT-079 — Two entries for the same currency: the last one silently wins
- **Why it matters.** The list is merged into one map before validation, so `[{USD: -1}, {USD: 80}]` passes (the -1 disappears) and
  `[{USD: 80}, {USD: -1}]` fails. Order-dependent validation hides client bugs.
- **Setup.** Multi-currency RFQ, no bids.
- **Steps.** Send the two orders.
- **Expected.** Both refused (duplicate currency). Today the first is accepted (USD = 80), the second 878.
- **Oracle.** Record both statuses.
- **Trace.** P2 · automate · `app/controllers/api/v1/trade_controller.rb:1480-1488`

#### API-XDLOT-080 — Rates of a draft event cannot be changed here
- **Why it matters.** The endpoint only finds ACTIVE rounds; a draft round answers 'Request not found', which reads like a broken link.
  Buyers must use Edit Currencies on the draft instead.
- **Setup.** Draft event with a multi-currency RFQ.
- **Steps.** `PATCH /v1/trade/<draft RFQ>/currency_exchange_rates`.
- **Expected.** HTTP 422 code 4 'Request not found' (expected wording: 'publish the event first' or allow drafts).
- **Oracle.** 4.
- **Trace.** P2 · automate · `app/controllers/api/v1/trade_controller.rb:1467-1468`

#### API-XDLOT-081 — A vendor cannot change the buyer's exchange rates
- **Why it matters.** Rates decide who is L1; only the buying company may set them.
- **Setup.** Multi-currency RFQ, no bids; invited vendor session.
- **Steps.** As the vendor: `PATCH /v1/trade/<id>/currency_exchange_rates`.
- **Expected.** HTTP 422 code 455 'You are not authorized to perform this action' (update? requires the trade's company).
- **Oracle.** 455; rates unchanged.
- **Trace.** P1 · manual · `app/controllers/api/v1/trade_controller.rb:1470` · `app/policies/trade_request_policy.rb:74-92, 212-214`

#### API-XDLOT-082 — Draft bids do not block a rate change
- **Why it matters.** Only active/requested bids freeze the rates. A vendor halfway through a USD bid (draft) sees the rate move under
  them.
- **Setup.** Multi-currency RFQ; the QA vendor has a DRAFT bid in USD.
- **Steps.** Buyer updates the USD rate; vendor submits.
- **Expected.** Record: today the update succeeds and the submitted bid converts at the new rate. Product decision whether drafts
  should block or the vendor be warned.
- **Oracle.** Converted amount in the QCS uses the new rate.
- **Trace.** P2 · manual · `app/controllers/api/v1/trade_controller.rb:1473`

#### API-XDLOT-083 — A failed save is reported as success
- **Why it matters.** `trade_request.save` (not save!) — its result is ignored, so a validation failure still answers 200 and the screen
  shows 'Exchange rates updated successfully'.
- **Setup.** Multi-currency RFQ whose trade fails a model validation on save (e.g. data from an older template).
- **Steps.** Update a rate.
- **Expected.** 4xx when the save fails. Today HTTP 200 with nothing stored.
- **Oracle.** GET /trade/<id> rate matches the reply.
- **Trace.** P2 · manual · `app/controllers/api/v1/trade_controller.rb:1494-1495`

#### API-XDLOT-084 — A base-currency event's conversion factor can never be corrected after publishing
- **Why it matters.** In 'Base Currency' mode the event's only currency IS the base, with the conversion factor stored as its rate. The
  update endpoint refuses any change to the base code, so a mistyped factor cannot be fixed without recreating the
  event — and the screen offers the pencil anyway (see the UI case).
- **Setup.** Event created with Edit Currencies → Base Currency = USD, factor 83; published; no bids.
- **Steps.** `PATCH /v1/trade/<id>/currency_exchange_rates` `[{"USD": 84}]`.
- **Expected.** A way to correct the factor before bids. Today HTTP 422 code 2.
- **Oracle.** Record the status.
- **Trace.** P1 · manual · `app/controllers/api/v1/trade_controller.rb:1482-1486` · `procol-client-dashboard/src/views/createOrder/currencyModal.jsx:113-137` · `procol-client-dashboard/src/redux/orders/helpers.js:855-893`

## 8. Currency and lots elsewhere — create, update, read, bid, compare, award

#### API-XDLOT-085 — A currency on a draft line item is accepted and ignored
- **Why it matters.** Integrations send a currency per line (from the PR). The event has no per-line currency: it must be accepted without
  error and must not become a second currency for that line.
- **Setup.** Buyer session; catalog product and quality.
- **Steps.** `POST /event_groups` with the working draft body plus `"currency": {"code": "USD"}` on the line.
- **Expected.** HTTP 200, a QA_Platform_ draft event; the value only lands in the line's meta_data; the round created later uses the
  event currency.
- **Oracle.** 200; the new draft's line shows no currency of its own.
- **Trace.** P2 · automate · `EDGE-DLOT-085` · `app/services/event_groups/create_service.rb:51-60`

#### API-XDLOT-086 — Lot and currency keys in the event's settings do not create lots or currencies
- **Why it matters.** Event config is merged as-is; a client cannot create a lot plan or a currency table by stuffing keys into it.
- **Setup.** Buyer session.
- **Steps.** `POST /event_groups` with `config: {"lot_config": {...}, "currency_configuration": {...}}`.
- **Expected.** HTTP 200; the keys stay inside config; the event's real lot plan is empty (GET /event_groups/<new> has no lots).
- **Oracle.** 200; show reply lots null.
- **Trace.** P2 · automate · `EDGE-DLOT-086` · `app/services/event_groups/create_service.rb:40` · `app/serializers/event_group/show_serializer.rb:176`

#### API-XDLOT-087 — A lot number on a draft line item does not create a lot
- **Why it matters.** Some clients send lot numbers with PR lines; only the lot drawer may create lots.
- **Setup.** Buyer session.
- **Steps.** `POST /event_groups` with `"lot_no": "2"` on the line.
- **Expected.** HTTP 200; lot plan empty.
- **Oracle.** 200.
- **Trace.** P2 · automate · `EDGE-DLOT-087` · `app/services/event_groups/create_service.rb:51-60`

#### API-XDLOT-088 — The lot plan cannot be written through the event update
- **Why it matters.** The lot plan must change only through the lot endpoints (which check the items). A PATCH carrying lot_config must
  not mass-assign it.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}` with only `{"lot_config": {"1": {"status": "active", ...}}}`.
- **Expected.** No 5xx; the top-level lot_config is ignored (the update only reads
  status/title/description/attachments/config/line_items/terms). GET get_lots unchanged.
- **Oracle.** No 5xx; no active lot appears.
- **Trace.** P1 · automate · `EDGE-DLOT-088` · `app/controllers/concerns/event_group_controller_helper.rb:15-38`

#### API-XDLOT-089 — Reading the RFQ returns its currency and lot-creation settings
- **Why it matters.** These read-backs are the oracle for every currency and lot case: the currency table, vendor preferences, the lot-
  creation switch and read-only state.
- **Setup.** {{eventGroupUuid}} / {{tradeId}} are the run's SANDBOX: a published (status active) event with one RFQ stage,
  30-minute bid window still open, the QA vendor invited, no bids, no proposals. Caller is the run's QA buyer.
- **Steps.** `GET /trade/{{tradeId}}?response_type=template`.
- **Expected.** HTTP 200; trade_config carries is_lot_creation_enabled (false for a lot round or when the company switch is off) and
  read_only_mode; currency_configuration is null on the sandbox.
- **Oracle.** No 5xx; fields present.
- **Trace.** P2 · automate · `EDGE-DLOT-089` · `app/serializers/trade_template_serializer.rb:121, 131, 14`

#### API-XDLOT-090 — A vendor's currency choice sent as text or a number is refused, not a crash
- **Why it matters.** DEFECT-IN-WAITING. On a multi-currency round the bid create does `T.let(params['currency_preference']['code'],
  String)`. A plain string preference (`"USD"`) makes `'USD'['code']` nil, and a numeric code fails the type check —
  both raise TypeError → 500. (An unknown code is covered by API-XBID-054.)
- **Setup.** Multi-currency RFQ (INR, USD); invited QA vendor session. No twin: needs the vendor.
- **Steps.** As the vendor: `POST /v1/bids` with `currency_preference: "USD"`, then with `{"code": 840}`.
- **Expected.** Both HTTP 422 code 15 'Please choose a valid currency'. Today HTTP 500.
- **Oracle.** Status < 500; no bid row.
- **Trace.** P1 · manual · `app/controllers/api/v1/bids_controller.rb:181-198`

#### API-XDLOT-091 — Bids in different currencies are ranked on the converted value
- **Why it matters.** The QCS must compare like with like: 1.2 USD at 83 = 99.6 INR beats 100 INR.
- **Setup.** Multi-currency RFQ (INR base, USD rate 83); vendor A bids 1.2 USD/unit, vendor B 100 INR/unit.
- **Steps.** Buyer opens the QCS (default view), then toggles 'Show Bidding Currencies'.
- **Expected.** Default view: A 99.6 (₹), B 100 (₹), A is L1. Bidding view: A $1.2, B ₹100, ranks unchanged; rounding uses the
  currency's adjusted precision.
- **Oracle.** QCS values and ranks.
- **Trace.** P0 · manual · `app/controllers/concerns/event_group_controller_helper.rb:2062-2081` · `app/helpers/api/currency_helper.rb:15-22`

#### API-XDLOT-092 — A bid without a currency preference does not break the bid notification
- **Why it matters.** On a multi-currency round the notification and participant sheet convert each bid 'to the original currency' using
  the vendor's preference. A bid that was placed without one (surrogate, excel or email bid) gets a nil currency and
  `Utils.convert_currency(..., nil)` raises.
- **Setup.** Multi-currency (multiple_currencies mode) RFQ; buyer places a surrogate bid for a vendor who never chose a currency.
- **Steps.** Open the bid's quote details / trigger the bid notification.
- **Expected.** Falls back to the base currency. Today NoMethodError → 500 / failed notification job.
- **Oracle.** No 5xx; notification text shows the base currency.
- **Trace.** P1 · manual · `app/models/trade_request.rb:1703-1712` · `app/models/bid.rb:762-768`

#### API-XDLOT-093 — The award value follows the 'show proposal value in base currency' setting
- **Why it matters.** Approvers sign off on the award total; it must be in the currency they expect, and a bad rate must not crash the
  award screen.
- **Setup.** Company setting show_proposal_value_in_base_currency is ON; event created in Base Currency mode (USD, factor 83); an
  award proposal.
- **Steps.** Open the proposal (`GET /proposal/<id>`); repeat with the setting OFF; repeat with the factor stored as 0 (accepted
  at creation, see API-XSTG-110).
- **Expected.** ON: totals divided by 83 and shown in $; OFF: totals in the company currency. Factor 0: should fall back, today
  BigDecimal division by zero → HTTP 500 on the proposal.
- **Oracle.** proposal_values.total_proposal_value currency symbol and amount; no 5xx.
- **Trace.** P1 · manual · `app/serializers/proposal_serializer.rb:13-40` · `app/controllers/concerns/utils.rb:257-259`

## 9. Screens — lots drawer, currency picker, exchange-rate editor

#### UI-XDLOT-001 — Who sees 'Split line items into lots' and when it is disabled
- **Why it matters.** The menu is the only entry to lots in the product; it must appear only where splitting is allowed.
- **Setup.** Buyer on the RFQ page of a project event.
- **Steps.** Open the RFQ's settings menu on: (a) multi-line RFQ, company switch is_lot_creation_enabled ON; (b) single-line RFQ;
  (c) switch OFF; (d) a lot RFQ (has a parent); (e) closed RFQ; (f) old version / project on hold; (g) service RFP
  grouping on.
- **Expected.** Shown only for (a) and (e)-(f); disabled for (e) closed, (f) old version or on hold; hidden for (b), (c), (d), (g).
- **Oracle.** Menu item presence/disabled state matches.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/orderDetails/eventHeader/eventHeader.jsx:355-360, 622-633` · `app/serializers/trade_template_serializer.rb:131`

#### UI-XDLOT-002 — 'Generate Smart Lot' is disabled once smart lots are in place or a lot is published
- **Why it matters.** Regenerating over a published lot is refused by the server (815); the button should not invite it.
- **Setup.** Lots drawer open.
- **Steps.** Look at the button: (a) plan in smart mode; (b) manual plan, nothing published; (c) a lot published.
- **Expected.** (a) disabled; (b) enabled; (c) disabled. The button only shows when lot_state.is_smart_lots_enabled (always true
  from the server today).
- **Oracle.** Button state.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orderDetails/splitLineItemDrawer/splitLineItemDrawer.jsx:64-81, 227-236` · `app/services/lots/lot_splitting_service.rb:40-41`

#### UI-XDLOT-003 — 'Publish Lot' needs at least two lots that have items
- **Why it matters.** The two-lot rule exists only on this screen (the API accepts a single lot).
- **Setup.** Drawer with all items in lot 1 (e.g. fresh smart lots on an event with no bids).
- **Steps.** Click Publish Lot on lot 1.
- **Expected.** Error toast 'Please assign line item to at least two lots'; no request sent.
- **Oracle.** No create_new_lot call in the network log.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/orderDetails/splitLineItemDrawer/splitLineItemDrawer.jsx:107-149`

#### UI-XDLOT-004 — An empty lot cannot be published
- **Why it matters.** Publishing a lot with nothing in it creates an empty RFQ.
- **Setup.** Drawer with an empty lot.
- **Steps.** Look at the empty lot.
- **Expected.** Text 'This Lot can’t be published until it contains at least one item.'; Publish Lot disabled.
- **Oracle.** Button disabled.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orderDetails/splitLineItemDrawer/splitLineItemDrawer.jsx:346-355, 388-392`

#### UI-XDLOT-005 — Items in a published lot cannot be selected or moved
- **Why it matters.** Moving items out of a live lot RFQ would desynchronise it.
- **Setup.** Drawer with lot 1 published, lot 2 draft.
- **Steps.** Try to tick a row in lot 1; open 'Move items to' from lot 2.
- **Expected.** Lot 1 rows have disabled checkboxes and the lot shows a 'Published' tag; the move list does not offer lot 1; the
  dropdown is disabled until a row of the current lot is ticked.
- **Oracle.** Checkbox/option state.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/orderDetails/splitLineItemDrawer/splitLineItemDrawer.jsx:98-101, 362-366` · `procol-client-dashboard/src/views/orderDetails/splitLineItemDrawer/lotSelect.jsx:95-100`

#### UI-XDLOT-006 — A move the server refuses puts the items back
- **Why it matters.** The drawer updates optimistically; after a refusal it must not show a plan the server never saved.
- **Setup.** Drawer; make the save fail (e.g. offline, or a plan the server refuses with 842).
- **Steps.** Move an item to another lot.
- **Expected.** Error toast; the item returns to its original lot (state restored when the thunk returns 'error').
- **Oracle.** Drawer matches GET get_lots after the failure.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orderDetails/splitLineItemDrawer/lotSelect.jsx:77-90` · `procol-client-dashboard/src/redux/project/actions.js:1111-1123`

#### UI-XDLOT-007 — Lot header totals add up
- **Why it matters.** Buyers decide the split from the 'Total L1 Amount' and vendor count in each lot header.
- **Setup.** Drawer on an event in evaluation with bids.
- **Steps.** Compare each lot header with its rows.
- **Expected.** Total L1 Amount = sum of the rows' L1 values; vendor count = number of vendors in the sheet. On multi-currency
  events L1 values are base-currency amounts with the RFQ's default symbol.
- **Oracle.** Header equals the row sum.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orderDetails/splitLineItemDrawer/splitLineItemDrawer.jsx:40-49, 300-320` · `app/services/lots/lot_splitting_service.rb:199-206`

#### UI-XDLOT-008 — 'Manage Lots' re-opens the drawer and re-reads the lots
- **Why it matters.** After closing the drawer the buyer needs a way back; re-opening must show the saved plan (and note: every open is a
  get_lots call that SAVES smart lots on a fresh event).
- **Setup.** Drawer opened once from the settings menu, then closed.
- **Steps.** Click the floating 'Manage Lots' button.
- **Expected.** Drawer opens with the plan saved on the server.
- **Oracle.** Network: one get_lots per open; plan matches.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orderDetails/orderDetails.jsx:695-698, 778-790, 1809-1820`

#### UI-XDLOT-009 — When the exchange-rate pencil appears and what the field accepts
- **Why it matters.** Rates may only change before bids; the field must stop obvious mistakes.
- **Setup.** Published multi-currency RFQ, event details panel.
- **Steps.** Check the pencil with 0 bids and with 1 bid; click it and type '-5', 'abc', '1,000', '83.5'.
- **Expected.** Pencil only when there is at least one non-default currency and bid count is 0. The field accepts digits and one dot
  only: '-', letters and ',' are not typed; '83.5' is.
- **Oracle.** Typed value.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orderDetails/eventDetails.jsx:2104-2135, 346-360`

#### UI-XDLOT-010 — The exchange-rate editor refuses empty or zero rates before saving
- **Why it matters.** Client-side checks mirror the server's 878.
- **Setup.** Editing rates.
- **Steps.** Clear a rate, or enter 0 or '.', then Save; separately, let a bid arrive while editing, then Save.
- **Expected.** 'All exchange rates must be positive numbers' (editor stays open); if bids now exist: 'Cannot edit rates after bids
  have been placed' and the editor closes. No request in either case.
- **Oracle.** No PATCH sent.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orderDetails/eventDetails.jsx:374-388`

#### UI-XDLOT-011 — Server refusals of a rate change always show 'Failed to update currency rates'
- **Why it matters.** DEFECT. The request helper rejects with the raw response TEXT, but the handler reads `err.status` and
  `err.response.data.message` — both undefined. Every refusal (877 bids placed, 878 bad rate, 879 not multi-currency,
  2 base currency) shows the generic 'Failed to update currency rates' and the editor stays open, so the buyer retries
  a request that can never succeed.
- **Setup.** Editing rates on a round where the server will refuse (e.g. a bid arrives after the page loaded).
- **Steps.** Save.
- **Expected.** The server's message is shown (e.g. 'Exchange rates cannot be updated after bids have been placed.') and the editor
  closes on 422. Today: generic toast, editor open.
- **Oracle.** Toast text equals the API message.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/orderDetails/eventDetails.jsx:405-416` · `procol-client-dashboard/src/services/xhr/index.js:173-177`

#### UI-XDLOT-012 — On a base-currency event the editor offers the base currency and saving always fails
- **Why it matters.** DEFECT. The editor lists every currency except the COMPANY's default (from local storage), not except the EVENT's
  base. On an event whose base currency is USD the editor lists USD and saving sends it; the server refuses a change
  to the base (code 2), and the screen shows the generic failure.
- **Setup.** Company default INR; event created with Base Currency = USD (factor 83); published, no bids.
- **Steps.** Click the pencil, change USD's rate, Save.
- **Expected.** The base currency is not editable (or the factor can be corrected). Today the pencil shows, Save sends `[{"USD":
  ...}]` and fails with 'Failed to update currency rates'.
- **Oracle.** Network: PATCH answered 422 code 2.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/orderDetails/eventDetails.jsx:313, 329-337, 389-392` · `app/controllers/api/v1/trade_controller.rb:1486`

#### UI-XDLOT-013 — Currency picker: each ticked currency needs a rate
- **Why it matters.** A ticked currency without a rate would create a currency with no conversion (and see API-XSTG-110 for zero).
- **Setup.** Event creation → Edit Currencies → Multiple Currency.
- **Steps.** Tick USD with no rate → OK; tick nothing → OK; enter 0.000000001 (below the minimum).
- **Expected.** 'Please enter price in INR' (company default code); 'Please select atleast one currency.'; the number field clamps
  to 0.00000001.
- **Oracle.** Modal stays open with the error; no currency table saved.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/createOrder/currencyModal.jsx:75-104, 396-430`

#### UI-XDLOT-014 — Currency picker: base-currency mode requires a conversion factor
- **Why it matters.** Changing the event's base currency without a factor makes every amount wrong by the exchange rate.
- **Setup.** Edit Currencies → Base Currency.
- **Steps.** Pick USD without a factor → OK; then factor 0.001 (below min 0.01).
- **Expected.** 'Please enter price in INR'; the factor field clamps to 0.01. With a factor the saved table holds USD as base with
  rate_in_base = the factor.
- **Oracle.** Event payload currency_configuration (network).
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/createOrder/currencyModal.jsx:76-80, 480-512` · `procol-client-dashboard/src/redux/orders/helpers.js:855-893`

#### UI-XDLOT-015 — 'Add Bid Currencies' is offered only when allowed
- **Why it matters.** Adding currencies after publishing is a configuration change that must respect the company's switch.
- **Setup.** Event details panel.
- **Steps.** Check with: no currencies yet + edit allowed + enable_multi_currency_flow ON + event base = company default; then
  change each condition.
- **Expected.** Shown only when all four hold; otherwise the 'Multiple bidding currenices are not added' text or nothing.
- **Oracle.** Button presence.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orderDetails/eventDetails.jsx:315-322` · `procol-client-dashboard/src/redux/orders/selectors.js:4456`

#### UI-XDLOT-016 — The 'Show Bidding / Default Currencies' switch appears only where it means something
- **Why it matters.** On a single-currency or BOQ event, or before any bid, the switch has nothing to switch.
- **Setup.** RFQ settings menu.
- **Steps.** Check on: multi-currency with bids; multi-currency without bids; single currency; BOQ event.
- **Expected.** Shown only for multi-currency, non-BOQ, with bids; the label flips between 'Show Bidding Currencies' and 'Show
  Default Currencies'.
- **Oracle.** Menu item presence and label.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orderDetails/eventHeader/eventHeader.jsx:825-834`
