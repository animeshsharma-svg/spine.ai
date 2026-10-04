# Purchase request → sourcing event — deep cases

How purchase-request (PR) lines become event lines, and what happens to the PR afterwards:
pulling PR lines into a draft (`POST /event_groups/:id/pri_to_draft_project`), creating a draft
straight from PR lines (`POST /event_groups` with `line_items[].pr_line_item_uuid`), the quantity
and status rules on both paths, the PR's open / in-progress / closed quantities as the event is
published, withdrawn, trimmed and ordered, partial closure (`PATCH /purchase_requests/partial_close`)
and mapping PR lines onto an existing non-PR event (`POST /event_groups/pr_linking`). Every case is
grounded in `procol-backend` at `origin/main` or `procol-client-dashboard`. Runnable twins live in
`prototype/data/api-cases-extra/deep-pre.json` (`EDGE-DPRE-NNN`, same number as the case here).

**Read before running.** The dashboard sends `pr_line_item_uuid` / `pr_item_uuids`; `ParamsAuth#check_for_uuid`
rewrites any key containing `uuid` to the matching `_id` (a `*_uuids` string is split on commas), and a
value that does not decode becomes `nil`. `Z2dnWmdaUWtnZw==` decodes to id 999999999 (no such row);
`WrongUuid1=` decodes to nil. The runnable sandbox event is PUBLISHED, so every
`pri_to_draft_project` twin is answered by the draft-only lookup (code 2) — those twins pin the guard
ORDER; the quantity / status / tenancy rules behind it need a fresh QA draft and are written as
automate-later cases. `{{prId}}` / `{{prItemId}}` are REAL PR records and are only used in requests
that are refused before any write.

Settings that change behaviour in this area (CustomConfiguration keys): `allow_draft_project_creation`,
`over_quantity_tolerance_percentage`, `open_pr_quantity_on_partial_order`, `is_pr_partial_closure_enabled`
(a hash: `enabled`, `closure_reasons`, `closure_label`), `pr_linking_enabled`, `group_service_activities_in_rfp`,
`pr_dormant_threshold_days`, `is_pr_teams_filtering_enabled`, `offline_pr_closure_enabled`; dashboard-side
`is_pr_collation_enabled`, `is_pr_hold_enabled`, `freeze_pr_savings_reference`.

## 1. Pulling PR lines into an event that is not a draft

#### API-XDPRE-001 — PR lines cannot be pulled into a published event
- **Why it matters.** "Add to draft" is only defined for drafts. If a live event could grow new PR-backed
  lines, vendors would be bidding on a sheet that changed under them and the PR would show quantity
  reserved by an event that never asked for it.
- **Setup.** The sandbox event is published (active, window open, no bids). `{{prItemId}}` is a real PR
  line; the request is refused before any write.
- **Steps.** Send exactly what the PR screen's "Add Items" button sends, aimed at the live event:
  `POST /event_groups/{{eventGroupUuid}}/pri_to_draft_project` with
  `{"line_items":[{"status":"draft","quantity":{"unitSymbol":"Nos","value":1},"product_uuid":"{{productUuid}}","product_quality_uuid":"{{productQualityUuid}}","pr_line_item_uuid":"{{prItemId}}"}]}`.
  Then read the PR back.
- **Expected.** Refused as bad input; nothing is added to the event and the PR line's open quantity does
  not move. HTTP 422, code 2 'Insufficient parameters' — the target is looked up only among DRAFT events
  of the workspace, so the live event is "not found" and the blank guard answers before the PR service
  is built.
- **Oracle.** 422 + code 2; `GET /event_groups/{{eventGroupUuid}}/get_line_items` unchanged;
  `GET /purchase_requests/{{prId}}` shows the same open quantity as before. Note: the older PR-EVT-005
  sends a huge quantity to this same sandbox expecting 557 — it can only ever get this code 2.
- **Trace.** P0 · automate · `EDGE-DPRE-001` · `app/controllers/api/event_groups_controller.rb:1009-1011`

#### API-XDPRE-002 — Pulling into an event id that does not exist is refused the same way
- **Why it matters.** A missing event must get the same typed refusal as a non-draft one. A 404 or 500
  here means the service was built with no event (it immediately reads the event's company).
- **Setup.** Path id `Z2dnWmdaUWtnZw==` (well-formed, event 999999999 does not exist); PR reference bogus.
- **Steps.** `POST /event_groups/Z2dnWmdaUWtnZw==/pri_to_draft_project` with one valid-shaped line.
- **Expected.** Refused; HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2, no 404/500.
- **Trace.** P1 · automate · `EDGE-DPRE-002` · `app/controllers/api/event_groups_controller.rb:1008-1011` · `app/services/event_groups/pr_to_erfx_service.rb:13`

#### API-XDPRE-003 — A raw numeric event id gives no hint whether the event exists elsewhere
- **Why it matters.** Raw integer ids are the classic probe for other tenants' drafts. The answer must be
  identical for "someone else's draft" and "no such draft", and must never reach the service.
- **Setup.** Path id `999999999` (integer, not a uuid); PR reference bogus.
- **Steps.** `POST /event_groups/999999999/pri_to_draft_project` with one valid-shaped line.
- **Expected.** Refused; HTTP 422, code 2 'Insufficient parameters'. An integer-looking id skips uuid
  decoding (unless the uuid-enabled version flag is on), but the lookup is scoped to the caller's company
  and to drafts either way.
- **Oracle.** 422 + code 2.
- **Trace.** P1 · automate · `EDGE-DPRE-003` · `app/controllers/concerns/params_auth.rb:60-63` · `app/controllers/api/event_groups_controller.rb:1009`

#### API-XDPRE-004 — Line items sent as an object are refused, not crashed
- **Why it matters.** On a DRAFT target this body would crash: the service constructor calls
  `pluck(:pr_line_item_id)` on the payload outside its own error handling. Only the draft lookup stands in
  front of it, so this case pins that order.
- **Setup.** Published sandbox.
- **Steps.** `POST /event_groups/{{eventGroupUuid}}/pri_to_draft_project` with `line_items` as a JSON
  object (`{"first": {…}}`) instead of an array.
- **Expected.** Refused; HTTP 422, code 2 'Insufficient parameters'. Never a 500.
- **Oracle.** 422 + code 2.
- **Trace.** P1 · automate · `EDGE-DPRE-004` · `app/controllers/api/event_groups_controller.rb:1010` · `app/services/event_groups/pr_to_erfx_service.rb:12,96`

#### API-XDPRE-005 — Line items sent as a plain string are refused, not crashed
- **Why it matters.** Same constructor-time crash risk as API-XDPRE-004 (`String#pluck` does not exist).
- **Setup.** Published sandbox.
- **Steps.** Same request with `"line_items": "QA_Platform_not_a_list_<stamp>"`.
- **Expected.** Refused; HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DPRE-005` · `app/controllers/api/event_groups_controller.rb:1010` · `app/services/event_groups/pr_to_erfx_service.rb:96`

#### API-XDPRE-006 — Line items that are strings inside the array are refused, not crashed
- **Why it matters.** Element-level type confusion: on a draft, `"text"[:pr_line_item_id]` raises a
  TypeError in the constructor — an untyped 500.
- **Setup.** Published sandbox.
- **Steps.** Same request with `"line_items": ["QA_Platform_a_<stamp>", "QA_Platform_b_<stamp>"]`.
- **Expected.** Refused; HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DPRE-006` · `app/services/event_groups/pr_to_erfx_service.rb:96`

#### API-XDPRE-007 — A live event's own line cannot be pulled into the PR flow by its uuid
- **Why it matters.** The line `uuid` field is the most dangerous field in this body: on a draft target,
  the line lookup is NOT scoped to the target event, so a known line uuid is re-homed (see
  API-XDPRE-047). The draft guard is what keeps a running event's line safe.
- **Setup.** Published sandbox; `{{lineItemUuid}}` is one of its active lines.
- **Steps.** `POST /event_groups/{{eventGroupUuid}}/pri_to_draft_project` with one line carrying
  `"uuid": "{{lineItemUuid}}"` and a bogus PR reference. Read the event's lines back.
- **Expected.** Refused; HTTP 422, code 2 'Insufficient parameters'. The sandbox line stays where it is,
  still active.
- **Oracle.** 422 + code 2; `GET /event_groups/{{eventGroupUuid}}/get_line_items` unchanged.
- **Trace.** P0 · automate · `EDGE-DPRE-007` · `app/controllers/api/event_groups_controller.rb:1009-1011` · `app/services/event_groups/update_service.rb:99,111-113`

#### API-XDPRE-008 — A negative quantity aimed at a live event is refused (by state, not by any quantity rule)
- **Why it matters.** Documents that nothing but the state guard stops a negative quantity here — the
  draft-side quantity rule only checks "more than allowed" (API-XDPRE-027).
- **Setup.** Published sandbox.
- **Steps.** Same request as 001 with `quantity.value = -5` and a bogus PR reference.
- **Expected.** Refused; HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P1 · automate · `EDGE-DPRE-008` · `app/controllers/concerns/event_group_controller_helper.rb:85-86`

#### API-XDPRE-009 — A 100-line batch aimed at a live event is refused quickly
- **Why it matters.** There is no batch-size cap on this endpoint (partial close has 20). A big cart must
  still be refused in constant time on a non-draft.
- **Setup.** Published sandbox; 100 lines with bogus PR references.
- **Steps.** Send the 100-line body; time the reply.
- **Expected.** Refused promptly; HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2 within normal latency.
- **Trace.** P2 · automate · `EDGE-DPRE-009` · `app/controllers/api/event_groups_controller.rb:1007-1011`

#### API-XDPRE-010 — The purchase-cart read is refused for a live event
- **Why it matters.** `purchase_cart_params` is the read that pairs with "add to draft"; it must agree that a
  live event is not a cart.
- **Setup.** Published sandbox.
- **Steps.** `GET /event_groups/{{eventGroupUuid}}/purchase_cart_params`.
- **Expected.** Refused; HTTP 422, code 2 'Insufficient parameters'. No PR data returned.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DPRE-010` · `app/controllers/api/event_groups_controller.rb:1022-1027`

#### API-XDPRE-011 — The purchase-cart read is refused for an unknown event
- **Why it matters.** The policy call must never run with a nil record.
- **Setup.** Path id `Z2dnWmdaUWtnZw==`.
- **Steps.** `GET /event_groups/Z2dnWmdaUWtnZw==/purchase_cart_params`.
- **Expected.** Refused; HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2, no 455/500.
- **Trace.** P2 · automate · `EDGE-DPRE-011` · `app/controllers/api/event_groups_controller.rb:1024-1026`

#### API-XDPRE-012 — The "Add to draft project" picker list reads cleanly and shows only PR-based drafts
- **Why it matters.** This list decides which drafts a buyer can add PR lines to; a crash blocks the whole
  flow, and a draft without PR links is (by design) never offered.
- **Setup.** QA buyer; read only.
- **Steps.** `GET /event_groups/draft?listing_view=true`.
- **Expected.** HTTP 200; every event group listed is a draft with at least one linked purchase request.
  A draft made from catalog products only does not appear. Never a 5xx.
- **Oracle.** No 5xx; each listed event shows a PR reference.
- **Trace.** P2 · automate · `EDGE-DPRE-012` · `app/controllers/api/event_groups_controller.rb:350-352`

## 2. Who may add PR lines to a draft

#### API-XDPRE-013 — A user without event-create permission cannot pull PR lines
- **Why it matters.** The very first line of the action authorises "create event"; a planner or viewer who
  can see PRs must not be able to build events from them.
- **Setup.** A console user whose teams lack `trade: create_record`; a QA draft in the same company.
  No twin: needs a second, restricted user session.
- **Steps.** As that user, `POST /event_groups/<draft>/pri_to_draft_project` with a valid body.
- **Expected.** Refused; HTTP 422, code 455 'You are not authorized to perform this action' (Pundit's
  NotAuthorizedError handler). Nothing written.
- **Oracle.** 455; the draft's lines and the PR line unchanged.
- **Trace.** P0 · automate-later · `app/controllers/api/event_groups_controller.rb:1006` · `app/policies/event_group_policy.rb:21-23` · `app/controllers/concerns/api_auth.rb:117-119`

#### API-XDPRE-014 — With draft projects switched off for the company, pulling is refused
- **Why it matters.** `allow_draft_project_creation` is the company switch for the whole draft-project
  feature; when it is off the PR screen hides "Add to Draft Project", and the API must agree.
- **Setup.** gate: `allow_draft_project_creation` OFF (and no Clara AI access for the user); an existing
  QA draft. No twin: needs a company setting change.
- **Steps.** `POST /event_groups/<draft>/pri_to_draft_project` with a valid body from the dashboard.
- **Expected.** Refused; HTTP 422, code 455 'You are not authorized to perform this action'. Note the
  check runs AFTER the draft lookup, so a non-draft target still answers code 2 first.
- **Oracle.** 455; nothing written.
- **Trace.** P1 · automate-later · `app/controllers/api/event_groups_controller.rb:1014-1016` · `app/controllers/concerns/users_controller_helper.rb:371-382` · `app/models/company.rb:1302-1304`

#### API-XDPRE-015 — An auction-team member cannot pull PR lines even when drafts are allowed
- **Why it matters.** Companies that route auctions to a separate team keep that team out of draft
  creation; the rule is "any user with the auction team type", regardless of other teams.
- **Setup.** gate: `allow_draft_project_creation` ON; the workspace has an active auction-type team and the
  caller belongs to it. No twin: needs that user.
- **Steps.** As that user, pull a PR line into a QA draft.
- **Expected.** Refused; HTTP 422, code 455.
- **Oracle.** 455; nothing written.
- **Trace.** P1 · automate-later · `app/controllers/concerns/users_controller_helper.rb:378-390`

#### API-XDPRE-016 — A colleague can add PR lines to someone else's draft (owner is not checked)
- **Why it matters.** Drafts are personal work in progress. The policy only checks "can create events" and
  "same company", not "is the draft's owner" — so buyer B can push PR lines (and their quantity
  reservations) into buyer A's draft.
- **Setup.** Two buyers in one company, both with create permission; buyer A owns a QA draft. No twin:
  needs a second buyer.
- **Steps.** As buyer B, `POST /event_groups/<A's draft>/pri_to_draft_project` with a valid PR line.
- **Expected (today).** Accepted (200 "success"); A's draft gains B's line. Desired: refused for a non-owner
  unless the user is super admin / CSM. Record as a defect to confirm with product.
- **Oracle.** A's draft line list; the PR line now shows A's draft in its event details.
- **Trace.** P1 · manual · `app/policies/event_group_policy.rb:76-78` · `app/controllers/api/event_groups_controller.rb:1013`

#### API-XDPRE-017 — Another company's draft cannot be targeted, even with its real uuid
- **Why it matters.** The draft lookup is scoped to the caller's workspace; this is the tenancy wall for
  the whole endpoint.
- **Setup.** A draft uuid from a different client company (e.g. Demo Account 2's QA draft). No twin: needs a
  second tenant's draft uuid.
- **Steps.** As the PROCOL DEMO buyer, `POST /event_groups/<foreign draft>/pri_to_draft_project`.
- **Expected.** Refused; HTTP 422, code 2 'Insufficient parameters' — identical to a missing id.
- **Oracle.** 422 + code 2; the foreign draft is unchanged.
- **Trace.** P0 · automate-later · `app/controllers/api/event_groups_controller.rb:1009`

#### API-XDPRE-018 — A draft built from grouped service PR lines refuses further PR lines
- **Why it matters.** With service grouping on, a draft that already holds service-activity lines is laid
  out as RFP forms per service; adding more PR lines through this path is blocked outright.
- **Setup.** gate: `group_service_activities_in_rfp` ON; a QA draft created from a service PR (its
  `meta_data.pr_item_details` has activity lines with a service id). No twin: needs a service PR.
- **Steps.** Pull any PR line into that draft.
- **Expected.** Refused; HTTP 422, code 2 'Insufficient parameters' (the same code as "not a draft", which
  gives the buyer no hint why).
- **Oracle.** 422 + code 2; draft unchanged.
- **Trace.** P2 · automate-later · `app/controllers/api/event_groups_controller.rb:1010` · `app/models/event_group.rb:171-185`

#### API-XDPRE-019 — A draft with both an RFQ and an auction stage refuses PR lines with a readable reason
- **Why it matters.** The service guards against a stage mix it cannot rebuild; the reason is returned in
  plain words.
- **Setup.** A QA draft holding an RFQ stage and an auction stage. No twin: needs that draft.
- **Steps.** Pull a valid PR line into it.
- **Expected.** Refused; HTTP 422, code 15 with message "rfq and auction cannot both be present in
  rfx_modes". Nothing written (the check runs before the transaction).
- **Oracle.** 422 + code 15 + that message.
- **Trace.** P2 · automate-later · `app/services/event_groups/pr_to_erfx_service.rb:27-29`

#### API-XDPRE-020 — A discarded draft no longer accepts PR lines
- **Why it matters.** Discarding a draft sets it in_active and releases its reservations; it must not be
  revived by a stale "Add Items" tab.
- **Setup.** A QA draft that was discarded (status in_active). No twin: needs a discarded draft.
- **Steps.** Pull a PR line into it.
- **Expected.** Refused; HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2; the PR line's reservations unchanged.
- **Trace.** P2 · automate-later · `app/services/event_groups/update_service.rb:485-502` · `app/controllers/api/event_groups_controller.rb:1009`

#### API-XDPRE-021 — Outside the Procol dashboard app the pull is refused unless the user has Clara AI
- **Why it matters.** The draft tab is a dashboard feature: the permission check returns false for any other
  app context unless the workspace grants the user Clara AI access.
- **Setup.** gate: `allow_draft_project_creation` ON; a session whose current app is not the Procol
  dashboard; user without Clara AI access. No twin.
- **Steps.** Pull a PR line into a QA draft from that session.
- **Expected.** Refused; HTTP 422, code 455.
- **Oracle.** 455.
- **Trace.** P2 · manual · `app/controllers/concerns/users_controller_helper.rb:371-376`

## 3. Quantities when pulling into a draft

#### API-XDPRE-022 — Pulling part of a PR line reserves exactly that part
- **Why it matters.** The everyday flow: source 40 of a 100-unit line now, keep 60 open for later. The PR
  page must show 40 in progress and 60 open straight away.
- **Setup.** gate: `allow_draft_project_creation` ON. A QA draft that already has one line; a QA PR line
  of 100 Nos, fully open. No twin: needs a draft and a disposable PR line.
- **Steps.** `POST /event_groups/<draft>/pri_to_draft_project` with that PR line at quantity 40. Then read
  the PR in the Open and In-progress tabs.
- **Expected.** 200 `{"message":"success"}`. The draft gains one line of 40 linked to the PR line; the PR
  line's `meta_data.draft_projects_quantity_data[<draft id>] = 40`, its quantity in progress becomes 40,
  open becomes 60, and its status moves to in_progress.
- **Oracle.** `GET /purchase_requests?filters={"status":["active"]}` shows quantity_open 60;
  `{"status":["in_progress"]}` shows 40 with the draft in event_details.
- **Trace.** P0 · automate-later · `app/services/event_groups/pr_to_erfx_service.rb:31-43` · `app/models/purchase_request_item.rb:664-677` · `app/workers/update_in_progress_quantity_worker.rb:55-82`

#### API-XDPRE-023 — Exactly the open quantity plus the over-quantity tolerance is accepted
- **Why it matters.** The limit is open × (1 + tolerance%), compared with "greater than", so the boundary
  itself must pass — an off-by-one here blocks buyers who source the full allowance.
- **Setup.** gate: `over_quantity_tolerance_percentage` = 10. A QA PR line with 100 open; a QA draft with
  at least one line. No twin.
- **Steps.** Pull the line at 110, then (in another draft) at 110.01.
- **Expected.** 110 is accepted; 110.01 is refused with HTTP 422, code 557 'Purchase request items are not
  valid'.
- **Oracle.** 200 then 557; reservation 110 recorded only for the first.
- **Trace.** P1 · automate-later · `app/controllers/concerns/event_group_controller_helper.rb:83-88` · `app/models/company.rb:282-286`

#### API-XDPRE-024 — More than the open quantity (plus tolerance) is refused
- **Why it matters.** Sourcing more than was requisitioned is an approval bypass.
- **Setup.** Tolerance 0; a QA PR line with 100 open; a QA draft with one line. No twin.
- **Steps.** Pull the line at 101.
- **Expected.** Refused; HTTP 422, code 557 'Purchase request items are not valid' (no hint WHICH line or
  why). Nothing written.
- **Oracle.** 557; PR line still 100 open.
- **Trace.** P0 · automate-later · `app/controllers/concerns/event_group_controller_helper.rb:85-87` · `app/services/event_groups/pr_to_erfx_service.rb:24-26`

#### API-XDPRE-025 — With a tolerance set, pending reorders and other drafts reduce what can be pulled
- **Why it matters.** Two different formulas are used: with tolerance 0 the stored open quantity is used;
  with tolerance > 0 it is recomputed from active events, other drafts' reservations and reorders still
  awaiting PO or approval. A line with a pending reorder can therefore be over-pulled when tolerance is 0
  if the stored figure is stale.
- **Setup.** A QA PR line of 100 with a reorder of 30 pending approval. Run once with
  `over_quantity_tolerance_percentage` 0 and once with 1. No twin.
- **Steps.** Pull the line at 80 into a QA draft that already has a line.
- **Expected.** With tolerance 1: refused 557 (open is 70, limit 70.7). With tolerance 0: the answer
  depends on whether the stored quantity_in_progress already includes the 30 — both runs must agree.
- **Oracle.** Compare both runs; any disagreement is a defect.
- **Trace.** P1 · manual · `app/controllers/concerns/event_group_controller_helper.rb:94-110` · `app/models/purchase_request_item.rb:476-495`

#### API-XDPRE-026 — A zero quantity is accepted and reserves nothing
- **Why it matters.** `0 > limit` is false, so zero passes; the line becomes rate-only and the
  reservation for that draft is removed. The PR line then looks untouched although an event holds it,
  and it can be pulled in full into another event.
- **Setup.** A QA PR line of 100 open; a QA draft with one line. No twin.
- **Steps.** Pull the line at quantity 0. Read the PR.
- **Expected (today).** 200; the draft has a rate-only line; the PR line still shows 100 open. Desired:
  either refuse zero or treat it as an explicit "rate-only" choice that still marks the line in progress.
- **Oracle.** PR open quantity 100; draft line `is_rate_only` true.
- **Trace.** P1 · automate-later · `app/controllers/concerns/event_group_controller_helper.rb:86` · `app/controllers/concerns/trade_controller_helper.rb:6317-6320` · `app/models/purchase_request_item.rb:671-675`

#### API-XDPRE-027 — A negative quantity is accepted (no sign check)
- **Why it matters.** Once published, line quantities are SUMMED into the PR's in-progress figure, so a
  negative line lowers it and inflates the PR's open quantity — the same requisition can then be sourced
  twice.
- **Setup.** A QA PR line of 100; a QA draft with one line. No twin.
- **Steps.** Pull the line at -5; read the draft; publish it; read the PR.
- **Expected.** Desired: HTTP 422 refusal. Today the validator only checks "more than allowed" and the
  line is stored with -5 (record as a defect if so).
- **Oracle.** Draft line quantity; PR open/in-progress after publish.
- **Trace.** P0 · automate-later · `app/controllers/concerns/event_group_controller_helper.rb:85-86` · `app/models/purchase_request_item.rb:497-519`

#### API-XDPRE-028 — A decimal quantity on a "Nos" line is accepted as-is
- **Why it matters.** No integer rule exists for count units; 2.5 Nos is reserved as 2.5. Buyers relying on
  whole units must not assume the API rounds.
- **Setup.** A QA PR line in Nos; a QA draft with one line. No twin.
- **Steps.** Pull the line at 2.5.
- **Expected.** 200; reservation 2.5; PR open drops by 2.5.
- **Oracle.** PR open quantity.
- **Trace.** P2 · automate-later · `app/models/purchase_request_item.rb:664-677`

#### API-XDPRE-029 — A quantity sent as text fails with a raw Ruby message
- **Why it matters.** `"5" > 10.0` raises "comparison of String with Float failed"; the service rescues it
  and returns the exception text to the buyer.
- **Setup.** A QA draft with one line; a QA PR line. No twin.
- **Steps.** Pull with `"quantity": {"value": "5"}`.
- **Expected.** HTTP 422, code 15 (not 500) — but with an internal Ruby message. Desired: code 2 or 557
  with a readable message.
- **Oracle.** 422 code 15; message text recorded.
- **Trace.** P2 · automate-later · `app/services/event_groups/pr_to_erfx_service.rb:45-47` · `app/controllers/concerns/event_group_controller_helper.rb:79,86`

#### API-XDPRE-030 — A quantity sent as a bare number (not an object) fails with a raw Ruby message
- **Why it matters.** The validator digs `quantity.value`; a bare number has no `dig`, so a client that
  sends `"quantity": 5` gets an internal error string.
- **Setup.** As 029. No twin.
- **Steps.** Pull with `"quantity": 5`.
- **Expected.** HTTP 422, code 15 with a NoMethodError message. Desired: accept the bare number (the create
  path does) or refuse with code 2.
- **Oracle.** 422 code 15.
- **Trace.** P2 · automate-later · `app/controllers/concerns/event_group_controller_helper.rb:79` · `app/controllers/concerns/trade_controller_helper.rb:6303-6309`

#### API-XDPRE-031 — A cleared quantity (null) fails with a raw Ruby message
- **Why it matters.** Clearing the cart's number box sends `value: null` (UI-XDPRE-005); `nil > limit`
  raises and the buyer sees "Failed to add items to draft" with no reason.
- **Setup.** As 029. No twin.
- **Steps.** Pull with `"quantity": {"unitSymbol":"Nos","value": null}`.
- **Expected.** HTTP 422, code 15. Desired: code 2 "quantity required".
- **Oracle.** 422 code 15.
- **Trace.** P2 · automate-later · `app/controllers/concerns/event_group_controller_helper.rb:86`

#### API-XDPRE-032 — The first PR lines into a draft that has never had a line skip every check
- **Why it matters.** The validator returns "valid" immediately when the draft has no lines at all, so the
  quantity cap, the "already in this draft" rule and the "PR line exists" rule are all skipped. The
  dashboard's BOQ drafts and freshly emptied drafts hit this.
- **Setup.** A QA BOQ draft created with no line items (workspace allows BOQ-in-eRFX); a QA PR line of 100.
  No twin.
- **Steps.** Pull the PR line at 1,000.
- **Expected.** Desired: 557. Today: accepted and 1,000 reserved against a 100-unit line (record as defect).
- **Oracle.** PR line's draft reservation and open quantity.
- **Trace.** P0 · automate-later · `app/controllers/concerns/event_group_controller_helper.rb:50-51`

#### API-XDPRE-033 — A unit different from the PR's unit is stored on the line but ignored by the stage
- **Why it matters.** The cart greys out the unit, but the API takes `quantity.unitSymbol` / `display_unit`
  as sent. The event line then shows the client's unit while the RFQ stage is rebuilt with the PR's unit —
  vendors and the buyer see different units for one line.
- **Setup.** A QA PR line in Nos; a QA draft with an RFQ stage. No twin.
- **Steps.** Pull the line with `unitSymbol: "KG"`; open the draft and its stage.
- **Expected.** Desired: refused (559 'Quantity should be in same unit as requested', as on the stage path).
  Today: accepted; line shows KG, stage line shows Nos.
- **Oracle.** Line precomputed creator quantity unit vs trade product unit.
- **Trace.** P1 · manual · `app/services/event_groups/pr_to_erfx_service.rb:137-145` · `app/services/trade_requests/update/rfq.rb:43-52`

#### API-XDPRE-034 — An astronomically large quantity is refused or fails cleanly
- **Why it matters.** `1e400` parses to Infinity. On a draft with lines it is above the cap (557); on an
  empty draft it slips past validation and the reservation SQL writes `'Infinity'::jsonb`, which Postgres
  rejects.
- **Setup.** One QA draft with lines, one without. No twin.
- **Steps.** Pull a QA PR line with `"value": 1e400` into each.
- **Expected.** First: 422 code 557. Second: 422 code 15 with a database message (desired: 557). Never 500.
- **Oracle.** Codes as above; no reservation written in either.
- **Trace.** P2 · automate-later · `app/models/purchase_request_item.rb:683-708` · `app/services/event_groups/pr_to_erfx_service.rb:45-47`

## 4. Which PR lines may be pulled

#### API-XDPRE-035 — The same PR line cannot be pulled twice into one draft
- **Why it matters.** Two lines for one requisition line would double-count it.
- **Setup.** A QA draft that already holds PR line L (active mapping). No twin.
- **Steps.** Pull L again into the same draft.
- **Expected.** Refused; HTTP 422, code 557 'Purchase request items are not valid'.
- **Oracle.** 557; still one line for L.
- **Trace.** P1 · automate-later · `app/controllers/concerns/event_group_controller_helper.rb:59-65,84-87`

#### API-XDPRE-036 — The same PR line in a second draft is limited to what is left
- **Why it matters.** Buyers split one requisition across events; the second event must only get the
  remainder, and the PR must show both drafts.
- **Setup.** QA PR line of 100; draft A holds 70 of it; draft B has one other line. No twin.
- **Steps.** Pull the line into draft B at 31, then at 30.
- **Expected.** 31 refused (557); 30 accepted. The line's draft reservations read {A: 70, B: 30}; open 0.
- **Oracle.** PR line meta and Open/In-progress tabs.
- **Trace.** P0 · automate-later · `app/models/purchase_request_item.rb:476-495,522-525`

#### API-XDPRE-037 — A PR line on hold slips into a draft that has no stage yet, and loses its hold
- **Why it matters.** Holding a line is how a requisitioner stops sourcing (and tells the ERP). The PR
  service only excludes in_active lines, and the reservation recalculation rewrites status from quantities
  alone — so pulling a held line silently turns it back to in_progress.
- **Setup.** gate: `is_pr_hold_enabled` ON. A QA PR line on hold with open quantity; a QA draft with lines
  but no stage yet (created by POST /event_groups only). No twin.
- **Steps.** Pull the held line into the draft. Read the PR line's status.
- **Expected.** Desired: refused (557 or a dedicated "on hold" code). Today: accepted and the line's status
  becomes in_progress (record as defect).
- **Oracle.** PR line status and Hold tab.
- **Trace.** P0 · automate-later · `app/services/event_groups/pr_to_erfx_service.rb:94-98` · `app/workers/update_in_progress_quantity_worker.rb:64-82`

#### API-XDPRE-038 — A PR line on hold is refused when the draft already has a pricing stage
- **Why it matters.** The stage rebuild uses the stricter "active or in progress, with open quantity" rule;
  the outcome for the same line therefore depends on whether the draft has a stage yet (compare 037).
- **Setup.** As 037 but the draft has an RFQ stage. No twin.
- **Steps.** Pull the held line.
- **Expected.** Refused; HTTP 422, code 557. Nothing written (the transaction rolls back).
- **Oracle.** 557; hold status unchanged.
- **Trace.** P1 · automate-later · `app/controllers/concerns/trade_controller_helper.rb:1736-1748` · `app/services/event_groups/pr_to_erfx_service.rb:38-40`

#### API-XDPRE-039 — A completed PR line cannot be pulled
- **Why it matters.** Fully ordered lines have nothing left to source.
- **Setup.** A QA PR line with quantity_closed = requested (status completed); a draft with lines. No twin.
- **Steps.** Pull it at 1.
- **Expected.** Refused; HTTP 422, code 557 (open is 0).
- **Oracle.** 557.
- **Trace.** P1 · automate-later · `app/controllers/concerns/event_group_controller_helper.rb:83-87` · `app/models/purchase_request_item.rb:377-379`

#### API-XDPRE-040 — Rejected or send-back-pending PR lines are blocked only by the screen
- **Why it matters.** The PR page refuses to put "Rejected or Send Back Pending PR" lines in the cart, but
  the API rule only excludes in_active lines; a client calling the API directly can source them.
- **Setup.** A QA PR line in status rejected (or approval_in_progress) with open quantity; a stage-less
  draft. No twin.
- **Steps.** Pull it.
- **Expected.** Desired: refused like the UI. Today: accepted (record as defect if so).
- **Oracle.** Response code; PR line status afterwards.
- **Trace.** P1 · automate-later · `app/services/event_groups/pr_to_erfx_service.rb:97` · `src/views/purchaseRequisition/purchaseRequisitions.jsx:527-536`

#### API-XDPRE-041 — A PR line deleted in the ERP (in_active) cannot be pulled
- **Why it matters.** Deleted lines must never re-enter sourcing.
- **Setup.** A QA PR line set in_active; a draft with lines. No twin.
- **Steps.** Pull it.
- **Expected.** Refused; HTTP 422, code 557 (the line is not found among valid lines).
- **Oracle.** 557.
- **Trace.** P1 · automate-later · `app/controllers/concerns/event_group_controller_helper.rb:55,81`

#### API-XDPRE-042 — Another company's PR line can be pulled into my draft (no tenant scope)
- **Why it matters.** Neither the PR-line lookup nor the validator filters by company. A buyer who knows a
  foreign PR line id can pull it into their own draft and reserve quantity on the other tenant's PR.
- **Setup.** A QA PR line in Demo Account 2 (32461); a QA draft in PROCOL DEMO. No twin: cross-tenant write.
- **Steps.** As the PROCOL DEMO buyer, pull the foreign line's uuid into the draft. Read the foreign PR as
  its own buyer.
- **Expected.** Desired: refused (557 or 101). Today the code accepts it and reserves quantity on the
  foreign line — a cross-tenant write. Treat as a security defect if reproduced.
- **Oracle.** Foreign PR line's draft reservations and open quantity.
- **Trace.** P0 · manual · `app/services/event_groups/pr_to_erfx_service.rb:94-98` · `app/controllers/concerns/event_group_controller_helper.rb:55`

#### API-XDPRE-043 — PR lines from a team the buyer cannot see can still be pulled
- **Why it matters.** With team filtering on, the PR list only shows PRs tagged to the user's teams (and
  assignee visibility may narrow further). The pull path has no such filter.
- **Setup.** gate: `is_pr_teams_filtering_enabled` ON; a non-super-admin buyer; a QA PR line tagged to a
  team the buyer is not in. No twin.
- **Steps.** Confirm the line is absent from the buyer's PR list; pull it by uuid into the buyer's draft.
- **Expected.** Desired: refused. Today: accepted (record as defect to confirm).
- **Oracle.** PR list (absent) vs draft (present).
- **Trace.** P1 · manual · `app/services/purchase_requests/search_query.rb:63-68` · `app/services/event_groups/pr_to_erfx_service.rb:94-98`

#### API-XDPRE-044 — A dormant-locked PR line can be pulled into an existing draft
- **Why it matters.** The dormant lock (code 1125) is enforced only when a draft is CREATED; the "Add to
  draft" path has no dormant check, so the lock is bypassed by adding to an older draft.
- **Setup.** gate: `pr_dormant_threshold_days` set; a QA PR older than the threshold, not unlocked; an
  existing QA draft with lines. No twin.
- **Steps.** Pull a line of the dormant PR into the draft.
- **Expected.** Desired: HTTP 422, code 1125 "PR(s) <numbers> are dormant and locked from sourcing events".
  Today: accepted (record as defect).
- **Oracle.** Response; PR line reservations.
- **Trace.** P0 · automate-later · `app/services/event_groups/create_service.rb:103-124` · `app/services/event_groups/pr_to_erfx_service.rb:22-49`

#### API-XDPRE-045 — A draft line with no PR reference is refused on this path
- **Why it matters.** This endpoint is for PR lines; a "draft" line without a PR reference is the one shape
  the validator explicitly blocks.
- **Setup.** A draft with lines. No twin.
- **Steps.** Pull `{"status":"draft", …}` with no `pr_line_item_uuid`.
- **Expected.** Refused; HTTP 422, code 557.
- **Oracle.** 557.
- **Trace.** P2 · automate-later · `app/controllers/concerns/event_group_controller_helper.rb:73-75`

#### API-XDPRE-046 — A line with no status and no PR reference slips in as a plain catalog line
- **Why it matters.** The "needs a PR reference" rule only fires when `status` is "draft"; omit the status
  and a non-PR line is added through the PR endpoint, then breaks the stage rebuild (see 050).
- **Setup.** A draft with lines. No twin.
- **Steps.** Pull a line with product and quantity but no status and no PR reference.
- **Expected.** Desired: 557. Today: accepted.
- **Oracle.** Draft line list.
- **Trace.** P2 · automate-later · `app/controllers/concerns/event_group_controller_helper.rb:73-89`

#### API-XDPRE-047 — Sending another event's line uuid moves that line into my draft
- **Why it matters.** The line lookup in the draft update is `EventGroupLineItem.where(id: …)` with no
  event or company scope; the found row is given this draft's event and status and upserted. A buyer can
  pull a line out of any live event (even another tenant's) into their draft.
- **Setup.** QA draft D (with one line) and a separate QA live event E with line X; a QA PR line with open
  quantity. No twin: moving lines between events is a destructive write.
- **Steps.** Pull `{"uuid": "<X>", "status":"draft", "pr_line_item_uuid": "<QA PR line>", …}` into D. Read E.
- **Expected.** Desired: refused (or a NEW line created in D, X untouched). Today the code reassigns X to D
  and sets it draft — E loses a live line. Security defect if reproduced.
- **Oracle.** `GET /event_groups/<E>/get_line_items` before/after.
- **Trace.** P0 · manual · `app/services/event_groups/update_service.rb:95-127` · `app/services/event_groups/pr_to_erfx_service.rb:136-151`

#### API-XDPRE-048 — A pulled line without a product fails with a raw Ruby message
- **Why it matters.** The dashboard always sends the product; a client that does not gets "undefined method
  'id' for nil" back as the error message.
- **Setup.** A draft with lines; a QA PR line. No twin.
- **Steps.** Pull the PR line with no `product_uuid`.
- **Expected.** HTTP 422, code 15 with the Ruby message (desired: code 80 'Product not found' or take the
  product from the PR line). Nothing written.
- **Oracle.** 422 code 15.
- **Trace.** P2 · automate-later · `app/controllers/concerns/trade_controller_helper.rb:6299-6300`

#### API-XDPRE-049 — A pulled line can carry another company's product
- **Why it matters.** The product lookup is `Product.active.where(id:)` with no company filter; the PR line
  says one material, the event line another tenant's product.
- **Setup.** A product uuid from another client; a QA PR line; a draft with lines. No twin.
- **Steps.** Pull the PR line with the foreign `product_uuid`.
- **Expected.** Desired: refused. Today: accepted (record as defect).
- **Oracle.** Draft line product vs PR line material.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:6290-6294`

#### API-XDPRE-050 — Adding PR lines to a draft that already has a catalog line and a stage fails with a raw message
- **Why it matters.** The RFQ stage rebuild reads the PR line of EVERY draft line; a catalog line has none,
  so the rebuild hits `nil.buyer_hub_id` and the buyer gets an internal error instead of their lines.
- **Setup.** A QA draft with one catalog (non-PR) line and an RFQ stage; a QA PR line. No twin.
- **Steps.** Pull the PR line into the draft.
- **Expected.** Today: HTTP 422, code 15 "undefined method 'buyer_hub_id' for nil"; everything rolled back.
  Desired: mixed drafts supported or refused with a readable reason.
- **Oracle.** 422 code 15; draft unchanged.
- **Trace.** P1 · automate-later · `app/services/trade_requests/update/rfq.rb:43-52` · `app/services/event_groups/pr_to_erfx_service.rb:38-48`

## 5. Creating a draft straight from PR lines

#### API-XDPRE-051 — A draft can be created against a PR line that does not exist
- **Why it matters.** "Start New Project" creates the draft with `pr_line_item_uuid` on each line. Create
  never checks that the PR line exists, so a stale cart produces a draft whose failure only shows when the
  buyer builds the stage.
- **Setup.** QA buyer; catalog product; PR reference `Z2dnWmdaUWtnZw==` (does not exist). Creates a new
  QA_Platform_ draft only.
- **Steps.** `POST /event_groups` with `{"status":"draft","title":"QA_Platform_DPRE_051_<stamp>","line_items":[{"product_uuid":…,"product_quality_uuid":…,"quantity":{"unitSymbol":"Nos","value":10},"pr_line_item_uuid":"Z2dnWmdaUWtnZw=="}]}`.
- **Expected.** No 5xx. Today: 200 and a draft whose line carries the dangling PR reference; the stage build
  later answers 557. Desired: 422 code 557 at create.
- **Oracle.** Status code; returned line's PR reference.
- **Trace.** P1 · automate · `EDGE-DPRE-051` · `app/services/event_groups/create_service.rb:47-90` · `app/controllers/concerns/trade_controller_helper.rb:1737-1748`

#### API-XDPRE-052 — The same PR line twice in one create is not stopped
- **Why it matters.** Duplicated cart rows double-count a requisition line.
- **Setup.** As 051; both lines reference the same (bogus) PR line.
- **Steps.** `POST /event_groups` with two lines, both `pr_line_item_uuid = Z2dnWmdaUWtnZw==`.
- **Expected.** No 5xx. Today: 200 with two lines on one PR line (only the pull path checks duplicates).
- **Oracle.** Status code; line count.
- **Trace.** P1 · automate · `EDGE-DPRE-052` · `app/services/event_groups/create_service.rb:47-66`

#### API-XDPRE-053 — An undecodable PR reference degrades to a plain draft
- **Why it matters.** A garbled uuid must mean "no PR link", not a crash.
- **Setup.** As 051 with `pr_line_item_uuid = "WrongUuid1="`.
- **Steps.** `POST /event_groups` with that line.
- **Expected.** HTTP 200; an ordinary draft whose line has no PR reference.
- **Oracle.** 200; line's PR reference empty.
- **Trace.** P2 · automate · `EDGE-DPRE-053` · `app/controllers/concerns/params_auth.rb:74-75` · `app/services/event_groups/create_service.rb:104-105`

#### API-XDPRE-054 — A raw numeric PR line id is stored without any check
- **Why it matters.** Raw ids bypass uuid decoding and are how a client could point a draft at another
  tenant's PR line; create stores them unchecked.
- **Setup.** As 051 with `"pr_line_item_id": 999999999`.
- **Steps.** `POST /event_groups` with that line.
- **Expected.** No 5xx. Today: 200 with the raw id stored. Desired: 557.
- **Oracle.** Status code.
- **Trace.** P1 · automate · `EDGE-DPRE-054` · `app/services/event_groups/create_service.rb:69-90`

#### API-XDPRE-055 — A text PR line id does not crash the create or its response
- **Why it matters.** The query casts the text to NULL harmlessly; the risk is the response serializer
  trying to encode a non-numeric PR reference.
- **Setup.** As 051 with `"pr_line_item_id": "QA_Platform_x_<stamp>"`.
- **Steps.** `POST /event_groups` with that line.
- **Expected.** No 5xx (a 422 is fine).
- **Oracle.** Status code.
- **Trace.** P2 · automate · `EDGE-DPRE-055` · `app/services/event_groups/create_service.rb:79-81,111-113`

#### API-XDPRE-056 — A PR line created with zero quantity becomes a rate-only line
- **Why it matters.** Zero is the boundary between "buy" and "ask for a rate". A PR line silently turning
  rate-only reserves nothing on the PR.
- **Setup.** As 051 with quantity 0.
- **Steps.** `POST /event_groups` with that line.
- **Expected.** No 5xx. Today: 200 with the line marked rate-only.
- **Oracle.** Status code; `is_rate_only` on the line.
- **Trace.** P1 · automate · `EDGE-DPRE-056` · `app/controllers/concerns/trade_controller_helper.rb:6317-6320`

#### API-XDPRE-057 — A PR line created with a negative quantity should be refused
- **Why it matters.** Same inflation risk as API-XDPRE-027, on the create path; there is no sign check
  anywhere on create.
- **Setup.** As 051 with quantity -5.
- **Steps.** `POST /event_groups` with that line.
- **Expected.** No 5xx. Desired: 422. If accepted, read the draft back and record the negative line as a
  defect.
- **Oracle.** Status code; stored quantity.
- **Trace.** P1 · automate · `EDGE-DPRE-057` · `app/services/event_groups/create_service.rb:47-66`

#### API-XDPRE-058 — A dormant PR blocks the create, names the PR and writes nothing
- **Why it matters.** Deeper than API-EG-006: the refusal has its own body shape — the message lists the
  PR numbers and a `dormant_pr_ids` array that the screen uses to offer "Request unlock" — and it is raised
  before the event row is saved. Unlocking must make the same request succeed.
- **Setup.** gate: `pr_dormant_threshold_days` set; a QA PR older than the threshold, never unlocked. No
  twin: needs a dormant PR.
- **Steps.** `POST /event_groups` with one of its lines; then `POST /purchase_requests/unlock_dormant` as a
  manager; repeat the create.
- **Expected.** First: HTTP 422 `{"error":{"code":1125,"message":"PR(s) <rfq_no> are dormant and locked from
  sourcing events"},"dormant_pr_ids":[…]}`, no event row. After unlock: 200.
- **Oracle.** Body shape; event count for the title before/after.
- **Trace.** P1 · automate-later · `app/services/event_groups/create_service.rb:103-124` · `app/controllers/api/event_groups_controller.rb:1135-1142`

#### API-XDPRE-059 — Creating the draft alone reserves nothing on the PR
- **Why it matters.** Create stores the PR reference only in the line's data; no PR mapping or reservation
  is made until the stage is built (or the line is pulled through pri_to_draft_project). A buyer who
  abandons the create screen leaves the PR untouched — and two buyers can both start a project from the
  same open line.
- **Setup.** A QA PR line of 100 open. No twin (uses a real PR line in a successful write).
- **Steps.** Create a draft from it via "Start New Project"; read the PR before building any stage; then
  build the RFQ stage; read again.
- **Expected.** Before the stage: PR still 100 open. After the stage: in progress by the line quantity.
- **Oracle.** PR Open / In-progress tabs at both points.
- **Trace.** P1 · automate-later · `app/services/event_groups/create_service.rb:31-45` · `app/controllers/concerns/trade_controller_helper.rb:1762-1795`

#### API-XDPRE-060 — Building the pricing stage re-checks the PR line (557 / 558 / 559)
- **Why it matters.** The stage build is the strict gate for PR-created drafts: status must be active or in
  progress with open quantity (557), quantity within open × (1 + tolerance) (558), and the unit must match
  the PR's (559).
- **Setup.** QA drafts created from QA PR lines in each state. No twin (stage creation is held out of runs).
- **Steps.** Build the RFQ stage with (a) a held line, (b) quantity above the cap, (c) a different unit.
- **Expected.** (a) 557 'Purchase request items are not valid'; (b) 558 'Quantity should be less than open
  quantity'; (c) 559 'Quantity should be in same unit as requested'.
- **Oracle.** Codes; no trade products created.
- **Trace.** P1 · automate-later · `app/controllers/concerns/trade_controller_helper.rb:1735-1760`

#### API-XDPRE-061 — The unit check treats the unit as a search pattern, so "%" passes any PR unit
- **Why it matters.** The 559 check is `data->>'uom' NOT ILIKE <sent unit>`; a unit of "%" (or "_" for
  one-character units) matches everything and bypasses the unit rule.
- **Setup.** A QA draft from a QA PR line in Nos. No twin (stage creation is held out).
- **Steps.** Build the stage with the line's `unit_symbol` = "%".
- **Expected.** Desired: 559. Today: accepted (record as defect).
- **Oracle.** Response code; stage line unit.
- **Trace.** P1 · automate-later · `app/controllers/concerns/trade_controller_helper.rb:1758`

#### API-XDPRE-062 — Lines already reserved in this draft skip the quantity cap when the stage is rebuilt
- **Why it matters.** When a PR line is already "part of this draft project", the 558 check is skipped
  entirely; raising the quantity in the stage sheet after pulling is not bounded by the PR.
- **Setup.** A QA draft with a PR line pulled at 40 of 100. No twin.
- **Steps.** Rebuild the RFQ stage with that line at 400.
- **Expected.** Desired: 558. Today: accepted.
- **Oracle.** Response; reservation after save.
- **Trace.** P1 · automate-later · `app/controllers/concerns/trade_controller_helper.rb:1739-1756`

## 6. What the PR shows as the event moves on

#### API-XDPRE-063 — Publishing moves the line from "reserved by a draft" to "in progress in an event"
- **Why it matters.** On publish the draft reservation is cleared and in-progress is derived from the live
  mapping; a mistake double-counts (draft + live) or drops the line back to Open.
- **Setup.** A QA draft holding 40 of a QA PR line of 100. No twin.
- **Steps.** Publish the draft; read the PR.
- **Expected.** Draft reservation for that event gone; in progress 40; open 60; status in_progress.
- **Oracle.** PR line meta + tabs.
- **Trace.** P0 · automate-later · `app/services/event_groups/update_service.rb:254-255,407-433` · `app/models/event_group.rb:117,988-999`

#### API-XDPRE-064 — Discarding the draft releases its reservation
- **Why it matters.** Abandoned drafts must not hold requisitions hostage.
- **Setup.** As 063, before publishing. No twin.
- **Steps.** Discard the draft; read the PR.
- **Expected.** Reservation removed; PR mappings in_active; line back to 100 open, status active.
- **Oracle.** PR line meta + Open tab.
- **Trace.** P1 · automate-later · `app/services/event_groups/update_service.rb:485-502`

#### API-XDPRE-065 — Removing a PR line from a draft returns its quantity
- **Why it matters.** Partial selection must be reversible line by line.
- **Setup.** A QA draft with two PR lines. No twin.
- **Steps.** Delete one line from the draft; read the PR.
- **Expected.** That line's mapping goes in_active and its quantity returns to open; the other stays.
- **Oracle.** PR tabs.
- **Trace.** P1 · automate-later · `app/services/event_groups/update_service.rb:200-210`

#### API-XDPRE-066 — Removing a PR line from a live event returns its quantity after the deletion job
- **Why it matters.** On live events deletion is asynchronous; the PR must catch up.
- **Setup.** A published QA event with two PR lines, no bids on the removed line. No twin.
- **Steps.** Delete one line; wait (bounded, 60 s) for the deletion job; read the PR.
- **Expected.** The removed line's PR quantity returns to open; activity log "deleted from event".
- **Oracle.** PR tabs + activity log.
- **Trace.** P1 · automate-later · `app/models/event_group_line_item.rb:45,52-54` · `app/services/event_groups/update_service.rb:435-448`

#### API-XDPRE-067 — Withdrawing logs which PR lines reopened and by how much
- **Why it matters.** Deeper than API-LC-006: besides returning the quantity, withdrawal writes an
  "event withdrawn – reopened" activity per line that was in progress, with the reopened open quantity
  — the requisitioner's only explanation of why the line came back.
- **Setup.** A published QA event holding 40 of a QA PR line. No twin.
- **Steps.** Withdraw with a remark; read the PR line's activity log.
- **Expected.** Line back to open; one `event_withdrawn_reopened` entry naming the event ref and quantity.
- **Oracle.** Activity log.
- **Trace.** P2 · automate-later · `app/services/event_groups/update_service.rb:316-346,450-472`

#### API-XDPRE-068 — Awarding alone does not close PR quantity; the purchase order does
- **Why it matters.** Buyers expect "awarded" to complete the PR; in fact closed quantity grows only when a
  PO is generated, by the PO's quantity, and the line completes when closed equals requested.
- **Setup.** A published QA event holding a QA PR line fully; award to the QA vendor. No twin.
- **Steps.** Submit the award; read the PR. Generate the PO; wait (bounded) for the quantity job; read again.
- **Expected.** After award: still in progress. After PO: closed += ordered quantity; completed if equal.
- **Oracle.** PR Completed tab.
- **Trace.** P1 · automate-later · `app/workers/pr_quantity_update_worker.rb:38-55` · `app/models/order.rb:845-855`

#### API-XDPRE-069 — A partial order reopens the rest only when the company says so
- **Why it matters.** `open_pr_quantity_on_partial_order` decides whether the un-ordered remainder of a
  line goes back to Open or stays in progress with the event.
- **Setup.** A QA event line of 100 from a QA PR line; a PO for 60. Run with the setting ON and OFF. No twin.
- **Steps.** Generate the PO; read the PR.
- **Expected.** ON: 60 closed, 40 open, activity "partial award reopened". OFF: 60 closed, 40 in progress.
- **Oracle.** PR tabs + activity log.
- **Trace.** P1 · automate-later · `app/models/purchase_request_item.rb:497-519` · `app/workers/pr_quantity_update_worker.rb:22-35`

#### API-XDPRE-070 — A hold placed during a live event is not consistently preserved
- **Why it matters.** The event-status job deliberately skips held lines, but the quantity job rewrites
  status from quantities and has no hold branch — so the next recalculation can silently undo a hold.
- **Setup.** gate: `is_pr_hold_enabled` ON. A published QA event on a QA PR line. No twin.
- **Steps.** Hold the line; trigger a recalculation (e.g. remove another line of the same event, or close
  the stage); read the PR line.
- **Expected.** Desired: still on hold. Today: may flip to in_progress (record as defect if so).
- **Oracle.** PR line status / Hold tab.
- **Trace.** P1 · manual · `app/workers/event_group_update_worker.rb:206` · `app/workers/update_in_progress_quantity_worker.rb:64-82`

#### API-XDPRE-071 — A PR line deactivated by the ERP discards every draft that holds it
- **Why it matters.** When a PR line goes in_active, every draft holding it is discarded as a whole —
  including the buyer's other lines in those drafts.
- **Setup.** A QA draft holding QA PR line L plus another line. No twin.
- **Steps.** Mark L in_active (ERP sync); read the draft.
- **Expected.** The whole draft is in_active; all its reservations released. Record whether the buyer is told.
- **Oracle.** Draft status; other line's PR quantities.
- **Trace.** P2 · manual · `app/models/purchase_request_item.rb:313,531-540`

## 7. The PR list as the read-back oracle

#### API-XDPRE-072 — Asking for Open and In-progress together must not crash the PR list
- **Why it matters.** The PR list is how every case in this file reads quantities back. The status filter
  only handles exactly one of active / in_progress / approval_in_progress; any mix returns a nil relation
  that the next line calls `.distinct` on.
- **Setup.** QA buyer; read only.
- **Steps.** `GET /purchase_requests?page=1&filters={"status":["active","in_progress"]}`.
- **Expected.** No 5xx (union of both buckets, or a 422). Suspected today: untyped 500.
- **Oracle.** Status code.
- **Trace.** P0 · automate · `EDGE-DPRE-072` · `app/services/purchase_requests/search_query.rb:402-413,112`

#### API-XDPRE-073 — An unknown status must not crash the PR list
- **Why it matters.** A renamed tab key on the client would take the PR page down.
- **Setup.** Read only.
- **Steps.** `GET /purchase_requests?page=1&filters={"status":["QA_Platform_bogus"]}`.
- **Expected.** No 5xx (empty list or 422). Suspected today: 500 (no branch matches, nil relation).
- **Oracle.** Status code.
- **Trace.** P1 · automate · `EDGE-DPRE-073` · `app/services/purchase_requests/search_query.rb:400-421`

#### API-XDPRE-074 — A status sent as text must not crash the PR list
- **Why it matters.** The view service already accepts a string status, but the query runs first and does
  `array & "active"`, a TypeError.
- **Setup.** Read only.
- **Steps.** `GET /purchase_requests?page=1&filters={"status":"active"}`.
- **Expected.** No 5xx; ideally treated as ["active"].
- **Oracle.** Status code.
- **Trace.** P1 · automate · `EDGE-DPRE-074` · `app/services/purchase_requests/search_query.rb:402` · `app/services/purchase_requests/view_service.rb:100-102`

#### API-XDPRE-075 — An unknown closure type must not crash the Completed tab
- **Why it matters.** Closure type separates partially-closed, PO-closed and deleted lines; an unknown value
  falls through to a branch that returns nil.
- **Setup.** Read only.
- **Steps.** `GET /purchase_requests?page=1&filters={"status":["completed"],"closure_type":["QA_Platform_bogus"]}`.
- **Expected.** No 5xx (empty page). Suspected today: 500.
- **Oracle.** Status code.
- **Trace.** P1 · automate · `EDGE-DPRE-075` · `app/services/purchase_requests/search_query.rb:530-537,143`

#### API-XDPRE-076 — The partial-closure filter is silently dropped when the feature is off
- **Why it matters.** With partial closure off, the filter value is removed and the Completed list comes back
  UNFILTERED — a report built on it would count every completed line.
- **Setup.** Read only; behaviour depends on `is_pr_partial_closure_enabled`.
- **Steps.** `GET /purchase_requests?page=1&filters={"status":["completed"],"closure_type":["partial_closure"]}`.
- **Expected.** HTTP 200 either way; ON: only partially-closed lines; OFF: all completed lines.
- **Oracle.** Status code; row count vs the unfiltered Completed tab.
- **Trace.** P2 · automate · `EDGE-DPRE-076` · `app/services/purchase_requests/search_query.rb:513-515`

#### API-XDPRE-077 — Filtering PR lines by a non-PR event returns nothing
- **Why it matters.** "Which PR lines does this event consume?" is the read-back for every pull case; it
  must be exact and must not crash on an event built from the catalog.
- **Setup.** Read only; the sandbox was built from the catalog.
- **Steps.** `GET /purchase_requests?page=1&filters={"status":["in_progress"],"rfx_uuids":["{{eventGroupUuid}}"]}`.
- **Expected.** HTTP 200, empty list.
- **Oracle.** Status code; zero rows.
- **Trace.** P2 · automate · `EDGE-DPRE-077` · `app/models/purchase_request_item.rb:282` · `lib/common_functions.rb:83-96`

#### API-XDPRE-078 — Searching PR lines by event reference treats % as a wildcard
- **Why it matters.** The event-reference search binds the value safely but does not escape % and _, so
  "%" lists every PR line linked to any event (unlike PR-number search).
- **Setup.** Read only.
- **Steps.** `GET /purchase_requests?page=1&filters={"status":["in_progress"],"rfx_id_ilike":"%"}`.
- **Expected.** HTTP 200 (all linked lines). No 5xx.
- **Oracle.** Status code.
- **Trace.** P2 · automate · `EDGE-DPRE-078` · `app/models/purchase_request_item.rb:283-286`

#### API-XDPRE-079 — An unknown event status filter is harmless
- **Why it matters.** The event-status column filter on In-progress is how buyers find lines whose event was
  awarded; unknown values must match nothing.
- **Setup.** Read only.
- **Steps.** `GET /purchase_requests?page=1&filters={"status":["in_progress"],"event_statuses":["QA_Platform_bogus"]}`.
- **Expected.** HTTP 200, empty.
- **Oracle.** Status code; zero rows.
- **Trace.** P2 · automate · `EDGE-DPRE-079` · `app/models/purchase_request_item.rb:256-268`

#### API-XDPRE-080 — The event list's PR-number options accept a wildcard safely
- **Why it matters.** Feeds the "PR number" filter on the events list; must stay read-only and crash-free.
- **Setup.** Read only.
- **Steps.** `GET /event_groups/pr_number_options?page=1&search_query=%25`.
- **Expected.** HTTP 200 with PR numbers linked to ACTIVE events only.
- **Oracle.** Status code.
- **Trace.** P2 · automate · `EDGE-DPRE-080` · `app/controllers/concerns/filter_options_helper.rb:38-53`

#### API-XDPRE-081 — A negative page for PR-number options is clamped to the first page
- **Why it matters.** Negative paging must clamp, not raise.
- **Setup.** Read only.
- **Steps.** `GET /event_groups/pr_number_options?page=-5`.
- **Expected.** HTTP 200, first page.
- **Oracle.** Status code.
- **Trace.** P2 · automate · `EDGE-DPRE-081` · `app/controllers/api/event_groups_controller.rb:1703-1705`

## 8. Partial closure, deeper

#### API-XDPRE-082 — A real PR line cannot be partially closed without a reason
- **Why it matters.** Uses the key the dashboard really sends (`pr_item_uuids`, decoded by ParamsAuth).
  The older PR-PCL cases send uuids under `pr_item_ids`, which are never decoded and can only ever reach
  528. This proves a reason-less closure is impossible on a real line.
- **Setup.** `is_pr_partial_closure_enabled` ON. `{{prItemId}}` is a real line; no reason can match "".
- **Steps.** `PATCH /purchase_requests/partial_close` with `{"pr_item_uuids":["{{prItemId}}"],"remarks":"QA_Platform_no_reason_<stamp>"}`.
  Read the PR back.
- **Expected.** Refused; HTTP 422, code 2 'Invalid closure reason' (861 if the feature is off). No closure
  metadata on the line.
- **Oracle.** 422 + message; `GET /purchase_requests/{{prId}}` shows no partial closure.
- **Trace.** P1 · automate · `EDGE-DPRE-082` · `app/controllers/api/purchase_requests_controller.rb:1006` · `app/services/purchase_requests/partial_closure_service.rb:154`

#### API-XDPRE-083 — Remarks made only of markup count as no remarks
- **Why it matters.** The drawer trims remarks before sending; the API strips HTML tags from every string, so
  "<p> </p>" must land on the same "Remarks are required" verdict.
- **Setup.** Bogus line id, so nothing can be closed even if a rung regressed.
- **Steps.** `PATCH /purchase_requests/partial_close` with `{"pr_item_uuids":["Z2dnWmdaUWtnZw=="],"closure_reason":"budget_cut","remarks":"<p> </p>"}`.
- **Expected.** Refused (never 5xx): 861 (off), 2 'Invalid closure reason' (reason not configured),
  2 'Remarks are required', or 528 — depending on the company's reason list.
- **Oracle.** Non-2xx, no 5xx.
- **Trace.** P2 · automate · `EDGE-DPRE-083` · `app/controllers/concerns/params_auth.rb:18-30` · `app/services/purchase_requests/partial_closure_service.rb:155`

#### API-XDPRE-084 — A reason sent as an object is refused with a readable message
- **Why it matters.** Posting the whole option (key + label) instead of the key is a realistic client bug.
- **Setup.** `is_pr_partial_closure_enabled` ON; real line `{{prItemId}}` (refusal guaranteed).
- **Steps.** `PATCH /purchase_requests/partial_close` with `closure_reason = {"key":"budget_cut"}`.
- **Expected.** HTTP 422, code 2 'Invalid closure reason'. Not a 500.
- **Oracle.** 422 + message; PR unchanged.
- **Trace.** P2 · automate · `EDGE-DPRE-084` · `app/controllers/api/purchase_requests_controller.rb:1006` · `app/services/purchase_requests/partial_closure_service.rb:154`

#### API-XDPRE-085 — A comma-separated uuid string is accepted as a list
- **Why it matters.** Every `*_uuids` parameter silently accepts "a,b" as two ids; it must still go through
  every rung.
- **Setup.** `is_pr_partial_closure_enabled` ON; bogus ids only.
- **Steps.** `PATCH /purchase_requests/partial_close` with `pr_item_uuids = "Z2dnWmdaUWtnZw==,Z2dnWmdaUWtnZw=="` and an
  unconfigurable reason.
- **Expected.** HTTP 422, code 2 'Invalid closure reason' (the two ids de-duplicate to one first).
- **Oracle.** 422 + message.
- **Trace.** P2 · automate · `EDGE-DPRE-085` · `app/controllers/concerns/params_auth.rb:72-73` · `app/services/purchase_requests/partial_closure_service.rb:36`

#### API-XDPRE-086 — Line ids sent as an object do not crash the closure service
- **Why it matters.** `Array(object)` wraps rather than converts; the service must still answer with a typed
  refusal.
- **Setup.** `is_pr_partial_closure_enabled` ON; bogus ids only.
- **Steps.** `PATCH /purchase_requests/partial_close` with `pr_item_ids = {"a": 999999999}` and an unconfigurable reason.
- **Expected.** HTTP 422, code 2 'Invalid closure reason'.
- **Oracle.** 422 + message.
- **Trace.** P2 · automate · `EDGE-DPRE-086` · `app/controllers/api/purchase_requests_controller.rb:1005`

#### API-XDPRE-087 — No line ids at all is refused at the first rung
- **Why it matters.** Missing (not empty) list; the 2 must come from the first rung so the reason and
  remarks rungs are never consulted.
- **Setup.** `is_pr_partial_closure_enabled` ON.
- **Steps.** `PATCH /purchase_requests/partial_close` with only `closure_reason` and `remarks`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + message.
- **Trace.** P1 · automate · `EDGE-DPRE-087` · `app/services/purchase_requests/partial_closure_service.rb:152`

#### API-XDPRE-088 — A line on hold can be partially closed through the API
- **Why it matters.** The screen offers closure only from Open / In-progress selections; the service excludes
  in_active, deleted and completed lines but not held ones, so a held line can be closed (and the ERP told)
  without being reopened first.
- **Setup.** gate: `is_pr_hold_enabled` and partial closure ON; a QA PR line on hold with open quantity;
  a configured reason. No twin (a successful close is a real write).
- **Steps.** Partially close the held line.
- **Expected.** Desired: refused (or documented as allowed). Today: closed.
- **Oracle.** Line closure metadata; Hold tab.
- **Trace.** P2 · manual · `app/services/purchase_requests/partial_closure_service.rb:157-162`

#### API-XDPRE-089 — Partial closure accepts any number of attachments
- **Why it matters.** Code 864 'Number of attachments exceed the maximum allowed limit' exists, but the
  closure service never applies it; every attachment is copied into the line's metadata.
- **Setup.** Partial closure ON; a QA PR line; a configured reason. No twin.
- **Steps.** Close it with 200 attachment entries.
- **Expected.** Desired: 864 over a limit. Today: accepted.
- **Oracle.** Line metadata size.
- **Trace.** P2 · manual · `app/services/purchase_requests/partial_closure_service.rb:70-81,235-244`

#### API-XDPRE-090 — Closing the last open line completes the parent PR
- **Why it matters.** The PR header status is derived; after the last line is closed the PR must move to
  completed and the requisitioner be notified.
- **Setup.** A QA PR whose other lines are completed; partial closure ON. No twin.
- **Steps.** Partially close its last open line.
- **Expected.** Line completed; PR completed; one notification job.
- **Oracle.** PR status; activity log `partially_closed`.
- **Trace.** P2 · automate-later · `app/services/purchase_requests/partial_closure_service.rb:284-315`

#### API-XDPRE-091 — Closing in-progress quantity while the event is still live leaves the two out of step
- **Why it matters.** Without PO integration, closing an only-in-progress line zeroes its in-progress figure
  while the event still holds it; the next recalculation re-derives in-progress from the live mapping.
- **Setup.** No PO integration; partial closure ON; a QA PR line fully in a live QA event. No twin.
- **Steps.** Close it; then withdraw the event; read the PR.
- **Expected.** Record final open/closed/in-progress; any line showing open > 0 after being fully closed is a
  defect.
- **Oracle.** PR tabs over time.
- **Trace.** P2 · manual · `app/services/purchase_requests/partial_closure_service.rb:262-282` · `app/workers/update_in_progress_quantity_worker.rb:55-82`

#### API-XDPRE-092 — A partially closed line cannot then be pulled into a draft
- **Why it matters.** Closure is meant to be final for the closed part; open becomes 0.
- **Setup.** A QA PR line partially closed; a draft with lines. No twin.
- **Steps.** Pull it at 1.
- **Expected.** Refused; HTTP 422, code 557.
- **Oracle.** 557.
- **Trace.** P2 · automate-later · `app/services/purchase_requests/partial_closure_service.rb:246-260`

#### API-XDPRE-093 — Offline-PO closure has its own switch and batch cap
- **Why it matters.** "Add PO & Close" is a different endpoint with different rules; mixing them up gives the
  wrong error.
- **Setup.** `offline_pr_closure_enabled` OFF, then ON. No twin (`PATCH /purchase_requests/close` is not on the run allowlist).
- **Steps.** Close with a PO number: (a) setting off; (b) 21 lines; (c) a foreign or completed line.
- **Expected.** (a) 824; (b) 823; (c) code 2 "Invalid PR items or items already processed".
- **Oracle.** Codes.
- **Trace.** P2 · automate-later · `app/controllers/api/purchase_requests_controller.rb:947-979`

## 9. Mapping PR lines onto an existing non-PR event

#### API-XDPRE-094 — Mapping is refused when PR linking is off
- **Why it matters.** `pr_linking_enabled` gates "Map to Existing Event".
- **Setup.** Setting OFF. No twin (`POST /event_groups/pr_linking` is not on the run allowlist).
- **Steps.** `POST /event_groups/pr_linking` with a QA PR line and a QA event.
- **Expected.** HTTP 422, code 837 'PR linking is disabled for your organization'.
- **Oracle.** 837.
- **Trace.** P2 · automate-later · `app/controllers/api/event_groups_controller.rb:865-866`

#### API-XDPRE-095 — Lines the user cannot see are refused with a misleading message
- **Why it matters.** Visibility failures answer 834 'Purchase request item has no product' — wrong words
  for "not your PR".
- **Setup.** Setting ON; a PR line from a team the user is not in (or another tenant). No twin.
- **Steps.** Map it.
- **Expected.** HTTP 422, code 834 (message to be fixed).
- **Oracle.** 834.
- **Trace.** P2 · automate-later · `app/controllers/concerns/event_group_controller_helper.rb:2970-2987`

#### API-XDPRE-096 — Held or completed lines cannot be mapped
- **Why it matters.** Mapping is sourcing; same status rule as the stage build.
- **Setup.** Setting ON; a held QA PR line. No twin.
- **Steps.** Map it.
- **Expected.** HTTP 422, code 838.
- **Oracle.** 838.
- **Trace.** P2 · automate-later · `app/controllers/concerns/event_group_controller_helper.rb:2989-2992`

#### API-XDPRE-097 — An event that already has an active award proposal cannot take mapped lines
- **Why it matters.** Mapping after awarding would attach PR lines to an award they were never part of.
- **Setup.** Setting ON; a QA event with an active proposal. No twin.
- **Steps.** Map a matching QA PR line.
- **Expected.** HTTP 422, code 835 'Event group already has an active proposal'.
- **Oracle.** 835.
- **Trace.** P2 · automate-later · `app/controllers/concerns/event_group_controller_helper.rb:2696-2699`

#### API-XDPRE-098 — No matching event line returns internal ids in the message
- **Why it matters.** A line matches only on product + location code + quantity within the open allowance.
  The 836 message embeds the internal PR item id, product name and location.
- **Setup.** Setting ON; a QA event whose line has a different location. No twin.
- **Steps.** Map the QA PR line.
- **Expected.** HTTP 422, code 836 "No matching event group line item found for purchase request item ID
  <internal id> …" (internal id leaked — should be the PR number).
- **Oracle.** 836 + message.
- **Trace.** P2 · automate-later · `app/controllers/concerns/event_group_controller_helper.rb:2742-2763,2786-2800`

#### API-XDPRE-099 — Another company's event can be the mapping target
- **Why it matters.** The PR lines are checked against the user's company, but the target event is fetched
  with a bare `find_by(id:)`; PR mappings can be written onto another tenant's event.
- **Setup.** Setting ON; a QA event uuid from Demo Account 2; a matching PROCOL DEMO QA PR line. No twin:
  cross-tenant write.
- **Steps.** Map the line onto the foreign event.
- **Expected.** Desired: 836 'Event group not found'. Today: mapped if a line matches (security defect if
  reproduced).
- **Oracle.** Foreign event's PR mappings.
- **Trace.** P0 · manual · `app/controllers/concerns/event_group_controller_helper.rb:2691-2694`

## 10. Screens

#### UI-XDPRE-001 — "Purchase Items" appears only on the Open tab and only with PR collation on
- **Why it matters.** It is the only entry from the PR page into sourcing; showing it elsewhere (e.g. In
  progress) would let buyers re-source lines already in events.
- **Setup.** gate: `is_pr_collation_enabled`. A buyer with PR lines in Open and In-progress.
- **Steps.** Open the PR page; switch tabs; select a line on each.
- **Expected.** The shopping-cart "Purchase Items (n)" button shows only on Open, with the selected count.
  With collation off it never shows.
- **Oracle.** Button presence per tab; count tag equals selection.
- **Trace.** P1 · automate-later · `src/views/purchaseRequisition/purchaseRequisitions.jsx:1116-1150` · `src/views/purchaseRequisition/purchaseItemsDropdown.jsx:108-125`

#### UI-XDPRE-002 — "Purchase Items" is disabled with a reason for lines that cannot be sourced together
- **Why it matters.** The screen is the first line of defence for rules the API does not enforce (see
  API-XDPRE-040).
- **Setup.** Lines that are dormant-locked (dormant feature on), rejected / send-back pending, two BOQ PRs, a
  BOQ plus a material PR, services plus materials with service grouping on.
- **Steps.** Select each combination and hover the button.
- **Expected.** Disabled with: "Dormant locked PR cannot be purchased" · "Rejected or Send Back Pending PR
  cannot be purchased" · "Multiple BOQ-based PR cannot be purchased together" · "BOQ-based PR cannot pe
  purchased along with Material PR" (typo "pe" is in the product) · "Services and Materials cannot be
  purchased together".
- **Oracle.** Tooltip text and disabled state.
- **Trace.** P1 · automate-later · `src/views/purchaseRequisition/purchaseRequisitions.jsx:516-566`

#### UI-XDPRE-003 — "Add to Draft Project" is offered only when four conditions hold
- **Why it matters.** The option depends on `allow_draft_project_creation`, a non-BOQ selection, no service
  lines AND `group_service_activities_in_rfp` being on. The last condition hides the option for every
  company without service grouping — confirm with product whether that is intended.
- **Setup.** Toggle each of the four conditions.
- **Steps.** Open the Purchase Items menu.
- **Expected.** "Start New Project" always; "Add to Draft Project" only when all four hold; with the
  contract module on, both sit under a "Purchase Item" sub-menu next to "Purchase Contract".
- **Oracle.** Menu items present.
- **Trace.** P1 · automate-later · `src/views/purchaseRequisition/purchaseItemsDropdown.jsx:53-99` · `src/views/purchaseRequisition/purchaseRequisitions.jsx:1134-1136`

#### UI-XDPRE-004 — The cart caps quantity at the line's open quantity and locks the unit
- **Why it matters.** Partial selection happens here: the buyer can lower a line's quantity but not exceed
  what is open or change the unit.
- **Setup.** A material PR line with 100 open.
- **Steps.** Open the cart; type 150, then 0, then 40; try the unit dropdown.
- **Expected.** The number box clamps to 100 max and 0.1 min; the unit select is disabled and shows the PR
  unit; 40 is kept.
- **Oracle.** Field value after blur; request body `quantity.value` = 40, `unitSymbol` = PR unit.
- **Trace.** P0 · automate-later · `src/views/purchaseRequisition/purchaseCart/prPanelContent.jsx:86-112`

#### UI-XDPRE-005 — Clearing a cart quantity sends no quantity at all
- **Why it matters.** An emptied number box sends `value: null`: "Start New Project" then creates a
  rate-only line (API-XDPRE-056) and "Add Items" fails with a generic toast (API-XDPRE-031).
- **Setup.** A material PR line in the cart.
- **Steps.** Clear the quantity box; use each action.
- **Expected.** Desired: the action is blocked until a quantity is entered. Today: as described.
- **Oracle.** Request body; resulting line / toast.
- **Trace.** P1 · automate-later · `src/views/purchaseRequisition/purchaseCart/purchaseCart.jsx:410-420` · `src/views/purchaseRequisition/purchaseCart/helpers.js:48-56`

#### UI-XDPRE-006 — Service and activity lines cannot have their quantity edited in the cart
- **Why it matters.** Service quantities come from activities; editing them in the cart would desync.
- **Setup.** A service PR line with activities.
- **Steps.** Open the cart.
- **Expected.** The quantity box is greyed and disabled for service and activity lines; the label shows the
  short text instead of code | name.
- **Oracle.** Disabled state.
- **Trace.** P2 · automate-later · `src/views/purchaseRequisition/purchaseCart/prPanelContent.jsx:38-58`

#### UI-XDPRE-007 — The cart's create button waits for content
- **Why it matters.** Double clicks or an empty cart must not create empty drafts.
- **Setup.** Cart with lines, then remove all; a BOQ line whose BOQ data is still loading.
- **Steps.** Watch the create / Add Items buttons.
- **Expected.** Disabled when the cart is empty, while a create is in flight, or while BOQ data has not
  loaded.
- **Oracle.** Disabled state.
- **Trace.** P2 · automate-later · `src/views/purchaseRequisition/purchaseCart/purchaseCart.jsx:101-102`

#### UI-XDPRE-008 — The draft picker lists only PR-based drafts and says so when none match
- **Why it matters.** Buyers search their drafts by name; an empty result must explain why a draft they
  know exists is missing (it has no PR lines).
- **Setup.** One PR-based draft and one catalog-only draft.
- **Steps.** "Add to Draft Project" → open the picker; search both names.
- **Expected.** Only the PR-based draft is listed; the other search shows "You don't have any PR based draft
  projects named <query>".
- **Oracle.** Options; empty-state text.
- **Trace.** P2 · automate-later · `src/views/purchaseRequisition/purchaseCart/draftProjectSelect.jsx:41-90` · `app/controllers/api/event_groups_controller.rb:350-352`

#### UI-XDPRE-009 — "Add Items" reports success with the draft's reference and refreshes the PR list
- **Why it matters.** The PR list must show the moved quantities without a manual reload.
- **Setup.** gate: `allow_draft_project_creation`. A PR-based draft; an open PR line.
- **Steps.** Add the line to the draft.
- **Expected.** Toast "Items successfully added to draft <ref>"; the line's open quantity drops; on failure
  "Failed to add items to draft <ref>" and nothing changes.
- **Oracle.** Toast; PR row values.
- **Trace.** P1 · automate-later · `src/views/purchaseRequisition/addItemButtonWrapper/addItemButtonWrapper.jsx:24-52`

#### UI-XDPRE-010 — "Start New Project" creates a draft and opens the creation screen pre-filled
- **Why it matters.** The PR-to-event hand-off; the draft's line ids must be matched back to PR lines.
- **Setup.** eRFX workspace; two material PR lines.
- **Steps.** Start New Project; choose stages.
- **Expected.** Loading message "Redirecting to project creation screen..."; redirect to quick-create with
  `fromPR=true&projectCreation=true` (plus `boqProject=true` for BOQ); each line linked to its PR line.
- **Oracle.** URL; `POST /event_groups` body carries `pr_line_item_uuid` per line.
- **Trace.** P1 · automate-later · `src/views/purchaseRequisition/purchaseCart/purchaseCart.jsx:225-280,331-345`

#### UI-XDPRE-011 — A PR-created event locks template choice and Recreate
- **Why it matters.** PR-created events take their layout from the PR; switching templates or recreating
  would lose the PR link.
- **Setup.** A PR-created event (BOQ, or with tabs); a published PR-created event.
- **Steps.** On creation, open template selection; on the live event, open the settings menu.
- **Expected.** Template selection disabled; "Recreate" disabled. PR-created is detected by the PR-number
  widget on the stage.
- **Oracle.** Disabled controls.
- **Trace.** P2 · automate-later · `src/views/eventCreation/eventCreation.jsx:441-442` · `src/views/orderDetails/eventHeader/eventHeader.jsx:613-620` · `src/views/orderDetails/eventDetails.jsx:421-423`

#### UI-XDPRE-012 — Savings reference is frozen to historical price when the company asks
- **Why it matters.** `freeze_pr_savings_reference` keeps savings on PR events measured against the PR's
  last price.
- **Setup.** gate: `freeze_pr_savings_reference` ON; a PR-created event.
- **Steps.** Open "Add Savings".
- **Expected.** The historical-price strategy is locked.
- **Oracle.** Strategy control state.
- **Trace.** P2 · automate-later · `src/views/eventCreation/eventCreation.jsx:2364-2369`

#### UI-XDPRE-013 — "Partially Closed" appears only where and when it should
- **Why it matters.** Closure is irreversible; it must be offered only with the feature on, with a selection,
  and never on a mixed selection.
- **Setup.** gate: `is_pr_partial_closure_enabled` with a custom `closure_label`.
- **Steps.** In-progress tab → Actions; Open tab → assignment menu; select lines of two closure types.
- **Expected.** The item shows the configured label (default "Partially Closed"), is disabled with no
  selection, and a mixed selection shows "Selected items have different closure types".
- **Oracle.** Menu state; warning text.
- **Trace.** P1 · automate-later · `src/views/purchaseRequisition/purchaseRequisitions.jsx:1066-1113` · `src/views/purchaseRequisition/prLineAssignment.jsx:96-97,207-236`

#### UI-XDPRE-014 — The partial-closure drawer insists on a reason and remarks
- **Why it matters.** Matches the API rungs (reason, then remarks) with friendlier words.
- **Setup.** Feature on with configured reasons.
- **Steps.** Submit with no reason; with spaces-only remarks; then valid.
- **Expected.** "Please select a closure reason"; submit disabled while remarks are blank after trimming;
  success "Items marked as partially closed successfully".
- **Oracle.** Messages; request sent only on the valid attempt.
- **Trace.** P1 · automate-later · `src/views/purchaseRequisition/partiallyClosedDrawer.jsx:34-82,201-204`

#### UI-XDPRE-015 — The assignee can only be changed while every selected line is fully open
- **Why it matters.** Once part of a line is in an event the assignee is the person running that event.
- **Setup.** Two lines: one fully open, one partly in a draft.
- **Steps.** Select each and open the assign control.
- **Expected.** Enabled only when every selected line's open quantity equals its requested quantity.
- **Oracle.** Disabled state.
- **Trace.** P2 · automate-later · `src/views/purchaseRequisition/prLineAssignment.jsx:84-86`

#### UI-XDPRE-016 — "Map to Existing Event" lists only eligible live events
- **Why it matters.** The drawer is the screen side of pr_linking (section 9).
- **Setup.** gate: `pr_linking_enabled`; open PR lines; a matching active non-PR event.
- **Steps.** Select lines → Map to Existing Event.
- **Expected.** The option is disabled without a selection or with the setting off; the drawer lists active
  non-PR events from the search API; the submit button stays disabled until an event is chosen.
- **Oracle.** Menu and drawer states; `POST /event_groups/search` called with the line uuids.
- **Trace.** P2 · automate-later · `src/views/purchaseRequisition/prLineAssignment.jsx:99-102` · `src/views/purchaseRequisition/mapToExistingEventDrawer.jsx:58-80,133,227`

#### UI-XDPRE-017 — Selection checkboxes appear only for multi-select users or the purchase team
- **Why it matters.** Without selection there is no way into the cart; the gate must match the role.
- **Setup.** A user with `canSelectMultiplePrs` off and not in a purchase team; then one in a purchase team.
- **Steps.** Open the PR page.
- **Expected.** No checkboxes for the first user; checkboxes for the second.
- **Oracle.** Checkbox column present.
- **Trace.** P2 · automate-later · `src/redux/user/selectors.js:322-324` · `src/views/purchaseRequisition/purchaseRequisitions.jsx:597`
