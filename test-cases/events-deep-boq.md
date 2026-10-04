# BOQ (bill of quantities) events — deep cases

Deep API and screen cases for BOQ sourcing: starting a BOQ project, uploading and re-uploading the BOQ sheet,
the line limit, BOQ templates and the sample sheet, the BOQ stage (tabs, sections, serial numbers), reading
BOQ lines page by page, vendor bidding on BOQ lines, and awarding a BOQ. Every case is grounded in
`procol-backend` at `origin/main` (ae36e86894, 2026-09-25) or in `procol-client-dashboard`. Cases with a runnable
twin carry the library id `EDGE-DBOQ-NNN` (same number) in their Trace, from
`prototype/data/api-cases-extra/deep-boq.json`.

**Read before running.** What makes something "BOQ" is two different things. A **BOQ project** is an event group whose
`config.boq_based_rfx` is truthy (`app/models/event_group.rb:936-938`). A **BOQ stage** is a stage with tabs whose template
type contains `t-boq` (`app/models/trade_request.rb:447-449`). The company switch is `boq_in_erfx_allowed`, and
`Company#boq_in_erfx_allowed?` is true only when that switch is set **and** the company has an active BOQ template
(`app/models/company.rb:1096-1103`) — the dashboard reads the same method (`api/v1/users_controller.rb:728`).
**The line limit is not enforced by the server.** `allowed_maximum_line_items` (default `{boq: 500, non_boq: 65}`,
`db/migrate/20250305075906_add_custom_maximum_line_items_allowed_config.rb`) is only handed to the dashboard
(`api/v1/users_controller.rb:593,732`), which checks it when the event is published (`src/views/projectCreation/helpers.js:369-374`)
and falls back to 500/65 when the config is missing (`src/redux/user/selectors.js:346-360`). Backend #15339 ("BOQ 1000 line
items") made large BOQs fast (bulk insert); it did not change any limit. A company raises its cap by overriding
`allowed_maximum_line_items.boq` for that company. Uuids are decoded by `ParamsAuth#check_for_uuid`: keys containing
`uuid` become `_id`; `Z2dnWmdaUWtnZw==` decodes to id 999999999 (no such row) and `WrongUuid1=` decodes to nil.

## 1. Starting a BOQ project — POST /event_groups

#### API-XDBOQ-001 — A BOQ project with real line items is still refused when BOQ is switched off
- **Why it matters.** The dashboard hides "BOQ based RFX Project" when the switch is off, but a hand-made request could
  try to sneak a BOQ project in by also sending ordinary line items. The BOQ gate must win.
- **Setup.** gate: `boq_in_erfx_allowed` OFF for the workspace (switch not set, or no active BOQ template). Buyer
  session; a catalog product and variant.
- **Steps.** 1. Create a draft event with the BOQ flag on and one catalog line item:
  `POST /event_groups` `{"status":"draft","title":"QA_Platform_DBOQ_001_{{stamp}}","config":{"boq_based_rfx":true},"line_items":[{"product_uuid":"{{productUuid}}","product_quality_uuid":"{{productQualityUuid}}","quantity":{"unitSymbol":"Nos","value":10}}]}`.
  2. Read the error.
- **Expected.** Refused; no event is created. HTTP 422, code 101 "You are not allowed to perform this action".
- **Oracle.** 422 + code 101; the Draft tab shows no `QA_Platform_DBOQ_001_…` event.
- **Trace.** P0 · automate · `EDGE-DBOQ-001` · `app/controllers/api/event_groups_controller.rb:28-30`

#### API-XDBOQ-002 — An empty BOQ flag is read as "BOQ on"
- **Why it matters.** The controller reads the flag with Ruby truthiness (`params.dig(...) || false`), so an empty string
  counts as on. A client that clears the field gets a BOQ create, not an ordinary one.
- **Setup.** gate: `boq_in_erfx_allowed` OFF. Buyer session.
- **Steps.** 1. `POST /event_groups` with `config.boq_based_rfx: ""` and no line items. 2. Read the error.
- **Expected (today).** Refused with code 101 (the BOQ gate), because "" is truthy. With a proper boolean the answer would
  be code 2 "Insufficient parameters" (no line items). Either refusal is acceptable; never a 2xx or 5xx.
- **Oracle.** 4xx; nothing created.
- **Trace.** P2 · automate · `EDGE-DBOQ-002` · `app/controllers/api/event_groups_controller.rb:28-32`

#### API-XDBOQ-003 — A BOQ flag sent as an empty object is read as "BOQ on"
- **Why it matters.** Same coercion with a wrong type; `{}` is truthy. Wrong-type flags must not produce half-BOQ projects.
- **Setup.** gate: `boq_in_erfx_allowed` OFF. Buyer session.
- **Steps.** 1. `POST /event_groups` with `config.boq_based_rfx: {}` and no line items.
- **Expected (today).** Refused with code 101; with boolean coercion it would be code 2. Never 2xx/5xx.
- **Oracle.** 4xx; nothing created.
- **Trace.** P2 · automate · `EDGE-DBOQ-003` · `app/controllers/api/event_groups_controller.rb:28-32`

#### API-XDBOQ-004 — A null BOQ flag with no line items is "insufficient parameters"
- **Why it matters.** Only a BOQ project may start empty. A null flag must fall back to the ordinary rule.
- **Setup.** Any `boq_in_erfx_allowed` state. Buyer session.
- **Steps.** 1. `POST /event_groups` with `config.boq_based_rfx: null` and no line items.
- **Expected.** Refused. HTTP 422, code 2 "Insufficient parameters".
- **Oracle.** 422 + code 2; nothing created.
- **Trace.** P1 · automate · `EDGE-DBOQ-004` · `app/controllers/api/event_groups_controller.rb:28-32`

#### API-XDBOQ-005 — An explicit "not BOQ" with no line items is "insufficient parameters"
- **Why it matters.** `boq_based_rfx: false` must keep the line-items requirement of an ordinary event.
- **Setup.** Any `boq_in_erfx_allowed` state. Buyer session.
- **Steps.** 1. `POST /event_groups` with `config.boq_based_rfx: false` and no line items.
- **Expected.** Refused. HTTP 422, code 2 "Insufficient parameters".
- **Oracle.** 422 + code 2.
- **Trace.** P1 · automate · `EDGE-DBOQ-005` · `app/controllers/api/event_groups_controller.rb:28-32`

#### API-XDBOQ-006 — A BOQ project starts empty when line items are null
- **Why it matters.** This is exactly what the dashboard sends when a buyer opens "BOQ based RFX Project": an empty BOQ
  draft is created on page load and the lines arrive later from the sheet upload.
- **Setup.** gate: `boq_in_erfx_allowed` ON (switch set and an active BOQ template exists). Buyer session.
- **Steps.** 1. `POST /event_groups` `{"status":"draft","title":"QA_Platform_DBOQ_006_{{stamp}}","config":{"boq_based_rfx":true},"line_items":null}`.
- **Expected.** A draft BOQ project with no line items. HTTP 200; `config.boq_based_rfx` true; no line-item ids.
- **Oracle.** Reply config + empty `event_group_line_item_ids` (the project and line reads answer 455 until a stage exists — see API-XDBOQ-016).
- **Trace.** P1 · automate · `EDGE-DBOQ-006` · `app/controllers/api/event_groups_controller.rb:37-41` · `app/services/event_groups/create_service.rb:48-50` · `src/views/projectCreation/projectCreation.jsx:3085-3093`

#### API-XDBOQ-007 — A BOQ project with line items "" starts empty
- **Why it matters.** "" is blank and must behave like "no lines yet" rather than reaching the typed service with a string.
- **Setup.** gate: `boq_in_erfx_allowed` ON.
- **Steps.** 1. `POST /event_groups` with the BOQ flag on and `line_items: ""`.
- **Expected.** HTTP 200 with no line items.
- **Oracle.** Reply shows no line-item ids.
- **Trace.** P2 · automate · `EDGE-DBOQ-007` · `app/controllers/api/event_groups_controller.rb:37-41`

#### API-XDBOQ-008 — A BOQ project seeded with one catalog line keeps it, numbered 1
- **Why it matters.** BOQ projects created from a PR or a clone arrive with lines; the BOQ flag must not drop them, and
  serial numbers are what the BOQ grid prints next to each line.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A catalog product and variant.
- **Steps.** 1. `POST /event_groups` with the BOQ flag on and one line (10 Nos). 2. Read the reply.
- **Expected.** HTTP 200 with exactly one line-item id; the line's serial number is 1 and its variant is the one sent.
- **Oracle.** Reply: one id, and the serialized line shows serial_number 1 (the line read needs a stage first).
- **Trace.** P1 · automate · `EDGE-DBOQ-008` · `app/services/event_groups/create_service.rb:52-63` · `app/controllers/concerns/trade_controller_helper.rb:6290-6334`

#### API-XDBOQ-009 — Two BOQ lines are numbered 1 and 2 in request order
- **Why it matters.** Vendors' quotes are mapped back by line order; a reorder silently swaps prices between items.
- **Setup.** gate: `boq_in_erfx_allowed` ON.
- **Steps.** 1. `POST /event_groups` with the BOQ flag on and the same product twice (10 Nos, then 20 Nos).
- **Expected.** HTTP 200 with two ids; serial numbers 1 (10 Nos) and 2 (20 Nos). The same product twice is allowed.
- **Oracle.** Reply: two ids; the serialized lines show serials 1 and 2 matching the quantities.
- **Trace.** P2 · automate · `EDGE-DBOQ-009` · `app/services/event_groups/create_service.rb:52-60`

#### API-XDBOQ-010 — A zero-quantity BOQ line is kept as "rate only"
- **Why it matters.** BOQs carry rate-only items (provisional sums). Refusing or dropping them breaks the sheet; they must
  be stored and then contribute nothing to tab totals or loading.
- **Setup.** gate: `boq_in_erfx_allowed` ON.
- **Steps.** 1. `POST /event_groups` with the BOQ flag on and one line with quantity 0.
- **Expected.** HTTP 200; the stored line is marked rate-only (`is_rate_only` true).
- **Oracle.** Reply: the line's meta shows is_rate_only true, quantity 0.
- **Trace.** P2 · automate · `EDGE-DBOQ-010` · `app/controllers/concerns/trade_controller_helper.rb:6319-6321`

#### API-XDBOQ-011 — Exactly 500 BOQ lines (the default cap) are created in one request
- **Why it matters.** 500 is the default BOQ limit the dashboard enforces. #15339 reworked the create path to bulk-insert
  so a BOQ this size no longer times out; a slow or failed create here is a performance regression.
- **Setup.** gate: `boq_in_erfx_allowed` ON; `allowed_maximum_line_items` at its default (BOQ 500).
- **Steps.** 1. `POST /event_groups` with the BOQ flag on and 500 catalog lines (quantities 1..500). 2. Time the reply.
- **Expected.** HTTP 200 with 500 ids, serial numbers 1..500, well inside the request timeout. The server applies no cap.
- **Oracle.** Reply has 500 ids with serials 1..500.
- **Trace.** P1 · automate · `EDGE-DBOQ-011` · `app/services/event_groups/create_service.rb:51-63` · `app/controllers/api/v1/users_controller.rb:593,732`

#### API-XDBOQ-012 — The server does not cap an ordinary event at 65 lines
- **Why it matters.** The 65-line limit for ordinary events exists only in the dashboard. Anything that bypasses the
  dashboard (API clients, integrations, PR conversion) can go past it — the team should know which side owns the rule.
- **Setup.** Buyer session; the dashboard's default non-BOQ limit (65).
- **Steps.** 1. `POST /event_groups` (no BOQ flag) with 66 catalog lines.
- **Expected (today).** HTTP 200 with 66 ids — no server-side limit. A 4xx would mean a server cap was introduced. Never 5xx.
- **Oracle.** Reply ids count 66.
- **Trace.** P2 · automate · `EDGE-DBOQ-012` · `app/controllers/api/event_groups_controller.rb:24-41` · `src/redux/user/selectors.js:346-360`

#### API-XDBOQ-013 — A BOQ flag stored as an empty object stays a non-boolean
- **Why it matters.** The raw config is stored as sent. `{}` then reads as BOQ in Ruby and in the dashboard, but any
  strict `== true` consumer reads it as not BOQ — the project behaves differently per screen.
- **Setup.** gate: `boq_in_erfx_allowed` ON.
- **Steps.** 1. `POST /event_groups` with `config.boq_based_rfx: {}` and no line items. 2. `GET /event_groups/<new>`.
- **Expected (today).** HTTP 200, project created with `boq_based_rfx: {}`. Should: coerce to true/false or refuse. Never 5xx.
- **Oracle.** GET shows config.boq_based_rfx as `{}`.
- **Trace.** P2 · automate · `EDGE-DBOQ-013` · `app/services/event_groups/create_service.rb:40` · `app/models/event_group.rb:936-938`

#### API-XDBOQ-014 — The switch alone is not enough: no active BOQ template means no BOQ project
- **Why it matters.** `boq_in_erfx_allowed?` also requires an active `t-boq` template. A company whose only BOQ template is
  deactivated loses the menu item and the create — support tickets look like "BOQ disappeared".
- **Setup.** A QA company with `boq_in_erfx_allowed` set; deactivate (or never create) every BOQ template. Needs a
  company-configuration change, so no twin.
- **Steps.** 1. Read `GET /v1/dashboard_configuration` → `boq_in_erfx_allowed`. 2. `POST /event_groups` with the BOQ flag on.
  3. Re-activate one BOQ template and repeat.
- **Expected.** Without a template: config shows false; create refused with code 101 "You are not allowed to perform this
  action". With a template: config true; create 200.
- **Oracle.** The two replies differ only by the template's status.
- **Trace.** P1 · manual · `app/models/company.rb:1096-1103` · `app/controllers/api/v1/users_controller.rb:728`

#### API-XDBOQ-015 — The BOQ gate answers before the permission check
- **Why it matters.** In a workspace without BOQ, a user who may not create events at all gets 101 (BOQ not allowed)
  rather than 455 (not authorised) — the message points support at the wrong problem.
- **Setup.** A QA user without trade `create_record` permission, in a workspace with `boq_in_erfx_allowed` OFF. Needs a
  second user, so no twin.
- **Steps.** 1. As that user, `POST /event_groups` with the BOQ flag on. 2. Repeat without the flag but with one line.
- **Expected (today).** BOQ request: 422 code 101. Ordinary request: 422 code 455 "You are not authorized to perform this
  action" (Pundit). Both refuse; record the order.
- **Oracle.** Codes 101 then 455; nothing created.
- **Trace.** P2 · manual · `app/controllers/api/event_groups_controller.rb:28-34` · `app/policies/event_group_policy.rb:21-23`

#### API-XDBOQ-016 — Read-back of a fresh BOQ project
- **Why it matters.** Every later BOQ screen keys off `config.boq_based_rfx` from the project read; if the flag is lost
  on read-back the dashboard renders an ordinary project (Items button, line-item delete, line evaluation).
- **Setup.** gate: `boq_in_erfx_allowed` ON. A BOQ draft from API-XDBOQ-006 (needs that uuid, so no twin).
- **Steps.** 1. `GET /event_groups/<uuid>`. 2. `GET /event_groups/<uuid>/get_line_items`.
- **Expected.** Before a stage exists both reads are refused: HTTP 422, code 455 "You are not authorized to perform this
  action" — `show?` and `get_line_items?` require a stage the user can see. After the BOQ stage is added (template_input) the
  project read shows `config.boq_based_rfx` true and the line read returns the BOQ lines with total_pages ≥ 1.
- **Oracle.** 455 before the stage; config flag and line count after.
- **Trace.** P1 · automate-later · `app/policies/event_group_policy.rb:52-62` · `app/controllers/api/event_groups_controller.rb:129-136,466-522` · `src/redux/project/selectors.js:75`

## 2. Re-uploading the BOQ sheet — PATCH /event_groups line items on a BOQ project

After a BOQ sheet upload the dashboard sends the parsed lines to `PATCH /event_groups/:id` (`src/views/eventCreation/eventCreation.jsx:789-836`).
On a BOQ project the update service creates the new lines first and then deletes **every other line of the project**
(`app/services/event_groups/update_service.rb:96-101,163-167`); on an ordinary project only rows marked `"status":"deleted"`
are removed. None of these can run on the sandbox (it is not a BOQ project), so they have no twin.

#### API-XDBOQ-017 — Re-uploading on a draft BOQ project replaces every line
- **Why it matters.** A buyer fixing a typo in the BOQ re-uploads the whole sheet; the old lines must disappear completely
  (lines, their stage rows, forms and PR links), or vendors see duplicates.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A draft QA BOQ project with a BOQ RFQ stage built from a 3-line sheet
  (lines L1–L3), linked to a QA BOQ PR.
- **Steps.** 1. `PATCH /event_groups/<uuid>` with `line_items` = two NEW rows (no ids). 2. `GET /event_groups/<uuid>/get_line_items`.
  3. Read the stage (`GET /trade/<stage>`).
- **Expected.** 200; reply `event_group_line_item_ids` = the 2 new ids. L1–L3 become in_active (draft project), their
  stage rows become void, their forms and form mappings in_active, their line-to-stage mappings in_active, and their PR
  mappings in_active with PR quantities recomputed. get_line_items count 2.
- **Oracle.** Line count 2; stage shows no rows for L1–L3; PR open quantity restored.
- **Trace.** P0 · automate-later · `app/services/event_groups/update_service.rb:163-167,188-212,390-432`

#### API-XDBOQ-018 — Re-uploading on a live BOQ project deletes the old lines and can close the stage
- **Why it matters.** On a live project the old lines are marked deleted and their forms deleted; a stage left with no
  active line is closed on the spot — vendors in the middle of bidding lose the event.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A LIVE QA BOQ project (lot-based, with `lot_config`), one BOQ RFQ stage, 3 lines, QA vendor invited.
- **Steps.** 1. `PATCH /event_groups/<uuid>` with two new rows. 2. Read lines, the stage and the PR activity log.
- **Expected.** 200; L1–L3 status deleted; their forms deleted; an activity entry "deleted_from_event" on the linked PR items;
  any lot stage that no longer has an active line is set to closed with closed_at now.
- **Oracle.** get_line_items count 2; stage status (closed when its lines were all replaced); PR item activity log.
- **Trace.** P0 · manual · `app/services/event_groups/update_service.rb:188-199,435-450,504-525`

#### API-XDBOQ-019 — Rows that carry an existing id are updated in place, only the omitted ones are deleted
- **Why it matters.** The dashboard may resend existing lines with their ids; those must be kept (same id, same bids)
  and only the lines missing from the request deleted — otherwise every re-upload wipes vendor quotes.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A draft QA BOQ project with lines L1, L2, L3.
- **Steps.** 1. `PATCH /event_groups/<uuid>` with rows `{uuid: L1, …new quantity}`, `{uuid: L2, …}` and one new row.
- **Expected.** 200; L1 and L2 keep their ids with updated quantity/serial; a new id for the third row; L3 in_active.
  Serial numbers are 1, 2, 3 in request order.
- **Oracle.** get_line_items: ids L1, L2, new; L3 absent.
- **Trace.** P1 · automate-later · `app/services/event_groups/update_service.rb:99-145,163-167`

#### API-XDBOQ-020 — Re-uploading is refused when a live proposal includes the old lines
- **Why it matters.** Once lines are in an active, submitted or approved award, deleting them would orphan the award.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A QA BOQ project with a proposal in status active/requested/selected that covers L1.
- **Steps.** 1. `PATCH /event_groups/<uuid>` with a fresh set of rows (L1 omitted).
- **Expected.** Refused, nothing changes (the new rows are rolled back). HTTP 422, code 711 "You cannot delete this line item from the project".
- **Oracle.** 422 + 711; get_line_items unchanged.
- **Trace.** P0 · manual · `app/services/event_groups/update_service.rb:176-181` · `app/controllers/concerns/event_group_controller_helper.rb:743-750`

#### API-XDBOQ-021 — Re-uploading clears the draft award of each lot
- **Why it matters.** A draft award that points at deleted lines would submit garbage; the update service resets draft
  proposals (responses emptied, snapshot reset) — the buyer has to award again.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A QA BOQ project with a DRAFT proposal for lot 1 (not section-form based).
- **Steps.** 1. Re-upload (PATCH with new rows). 2. Read the draft proposal.
- **Expected.** 200; the draft proposal's responses are empty and its meta reset to the project ref and lot number.
- **Oracle.** Proposal read shows empty responses_hash.
- **Trace.** P1 · manual · `app/services/event_groups/update_service.rb:184-196,206-209` · `app/controllers/concerns/event_group_controller_helper.rb:770-790`

#### API-XDBOQ-022 — Replacing a one-line BOQ with a different single line is not mistaken for a deletion
- **Why it matters.** The "cannot delete the only line" guard counts request rows against ACTIVE lines. On a draft project
  the lines are draft (active count 0); on a live one the new line is inserted first (active count 2) — either way the
  replacement passes. A regression in that order would block every one-line re-upload.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A draft QA BOQ project with exactly one line L1.
- **Steps.** 1. `PATCH /event_groups/<uuid>` with one NEW row.
- **Expected.** 200; one new id; L1 in_active. Not 711.
- **Oracle.** get_line_items count 1 with the new id.
- **Trace.** P2 · automate-later · `app/services/event_groups/update_service.rb:174-175`

#### API-XDBOQ-023 — On a BOQ project the client's "deleted" flags are ignored
- **Why it matters.** BOQ deletion is computed by the server (everything not in the new set). A client that sends
  `"status":"deleted"` rows expecting the ordinary behaviour still loses every omitted line.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A draft QA BOQ project with L1, L2.
- **Steps.** 1. `PATCH` with `[{uuid: L1, status: "deleted"}]` only.
- **Expected (today).** No non-deleted rows → no new ids → every line of the project (L1 and L2) is in the deletion set;
  with one request row and two active lines the 711 guard does not fire, so both lines go. Should: refuse an upload that
  leaves the BOQ empty.
- **Oracle.** get_line_items count 0 afterwards.
- **Trace.** P1 · manual · `app/services/event_groups/update_service.rb:96-101,163-175`

#### API-XDBOQ-024 — A live re-upload does not touch the stage's own rows
- **Why it matters.** The project-level PATCH changes project lines and forms; the stage sheet the vendors bid on is
  edited separately (PATCH /trade/:id). If the two drift, vendors quote on lines the project no longer has.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A LIVE QA BOQ project with one RFQ stage; the QA vendor has a draft bid.
- **Steps.** 1. Re-upload via `PATCH /event_groups/<uuid>`. 2. Read the stage sheet and the vendor's bid.
- **Expected.** Project lines replaced (deleted/new); stage rows are not voided by this request (void only happens on a
  draft project); the dashboard then saves the stage sheet with `PATCH /trade/<stage>` — check both end in the same set.
- **Oracle.** get_line_items vs the stage's trade products.
- **Trace.** P1 · manual · `app/services/event_groups/update_service.rb:188-212` · `src/views/orderDetails/eventDetails.jsx:713-722`

## 3. Changing a live event's BOQ nature and the line-item deletion guards — PATCH /event_groups

#### API-XDBOQ-025 — PATCH can turn an ordinary live event into a BOQ project without the BOQ switch
- **Why it matters.** Create checks `boq_in_erfx_allowed?`; update does not. The update service merges any `config` keys
  into the stored config, so `{"config":{"boq_based_rfx":true}}` flips an ordinary event to BOQ in a workspace that has
  not bought BOQ — and from then on every line edit replaces ALL lines (section 2).
- **Setup.** gate: `boq_in_erfx_allowed` OFF. A live QA ordinary event with two lines. Changes what the event is, so no
  twin on the shared sandbox (it would change the deletion rules for every later case).
- **Steps.** 1. `PATCH /event_groups/<uuid>` `{"config":{"boq_based_rfx":true}}`. 2. `GET /event_groups/<uuid>`.
  3. `PATCH` with one new line row.
- **Expected.** Should: 422 code 101, config unchanged. Today (likely defect): 200, config.boq_based_rfx true, and step 3
  deletes both original lines.
- **Oracle.** Config read-back; get_line_items after step 3.
- **Trace.** P0 · manual · `app/services/event_groups/update_service.rb:49-54` · `app/controllers/concerns/event_group_controller_helper.rb:28-33` · `app/controllers/api/event_groups_controller.rb:28-30`

#### API-XDBOQ-026 — Switching a BOQ project back to ordinary hides its tabs everywhere
- **Why it matters.** `EventGroup#tabs` and `tabs_summary` return nil when the flag is off, so vendor tab totals and the
  BOQ grid vanish while the stage still has tabs — a half-BOQ event.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A live QA BOQ project with a BOQ stage and one vendor bid.
- **Steps.** 1. `PATCH /event_groups/<uuid>` `{"config":{"boq_based_rfx":false}}`. 2. Read the project, the master QCS and the vendor's quote summary.
- **Expected.** Should: refused once a BOQ stage exists. Today: 200; project tabs nil; the stage itself still reports
  `is_boq_event` true — record the mismatch.
- **Oracle.** Project read vs stage read.
- **Trace.** P1 · manual · `app/models/event_group.rb:940-962` · `app/services/event_groups/update_service.rb:49-54`

#### API-XDBOQ-027 — Deleting the only line item of a live event is refused
- **Why it matters.** An event with no lines cannot be bid on or awarded.
- **Setup.** The sandbox: live, one pricing stage, exactly one active line item {{lineItemUuid}}, no bids, no proposals.
- **Steps.** 1. `PATCH /event_groups/{{eventGroupUuid}}` `{"line_items":[{"uuid":"{{lineItemUuid}}","status":"deleted"}]}`.
  2. `GET /event_groups/{{eventGroupUuid}}/get_line_items`.
- **Expected.** Refused; the line is still active. HTTP 422, code 711 "You cannot delete this line item from the project".
- **Oracle.** 422 + 711; get_line_items count still 1.
- **Trace.** P1 · automate · `EDGE-DBOQ-027` · `app/services/event_groups/update_service.rb:172-175`

#### API-XDBOQ-028 — Deleting a line item that doesn't exist is answered "cannot delete" instead of "not found"
- **Why it matters.** The guard compares counts, not identity. A wrong id on a one-line event gets the same 711 as a real
  deletion, which hides client bugs and is the root of API-XDBOQ-029–031.
- **Setup.** The sandbox (one active line).
- **Steps.** 1. `PATCH /event_groups/{{eventGroupUuid}}` `{"line_items":[{"uuid":"WrongUuid1=","status":"deleted"}]}`.
- **Expected.** HTTP 422, code 711 "You cannot delete this line item from the project"; nothing changes.
- **Oracle.** 422 + 711; line count 1.
- **Trace.** P2 · automate · `EDGE-DBOQ-028` · `app/services/event_groups/update_service.rb:172-175` · `app/controllers/concerns/params_auth.rb:66-71`

#### API-XDBOQ-029 — Two "deleted" rows get past the one-line guard and empty the event
- **Why it matters.** The guard only fires when the request has exactly one row. Sending the same line twice (or the line
  plus any junk row) deletes the event's only line.
- **Setup.** A live QA ordinary event with exactly one line L1 (not the shared sandbox — this case destroys its line).
- **Steps.** 1. `PATCH /event_groups/<uuid>` `{"line_items":[{"uuid":"L1","status":"deleted"},{"uuid":"L1","status":"deleted"}]}`.
  2. Read lines and the stage.
- **Expected.** Should: 422 code 711. Today (likely defect): 200; L1 deleted, its forms deleted, and a lot stage with no
  active line is closed.
- **Oracle.** get_line_items count 0; stage status.
- **Trace.** P0 · manual · `app/services/event_groups/update_service.rb:172-199`

#### API-XDBOQ-030 — A line item of ANOTHER event can be pulled into mine by sending its id
- **Why it matters.** `create_line_items` loads existing lines by the ids in the request with no event or company filter,
  then sets their event group to mine and upserts them. Any buyer who knows (or enumerates — raw integer `id` is accepted)
  a line id can move another event's line, even another company's, into their own event. Cross-tenant write.
- **Setup.** Two QA events in the same QA company, A (mine) and B (one line LB). Never use a real event.
- **Steps.** 1. `PATCH /event_groups/<A>` `{"line_items":[{"uuid":"<LB uuid>","product_uuid":"{{productUuid}}","product_quality_uuid":"{{productQualityUuid}}","quantity":{"unitSymbol":"Nos","value":1}}]}`.
  2. Read lines of A and of B.
- **Expected.** Should: 422 (line does not belong to this event), B untouched. Today (likely defect): 200; LB now belongs
  to A (event_group_id overwritten, serial and quantity replaced) and has disappeared from B.
- **Oracle.** get_line_items of A includes LB; of B no longer does.
- **Trace.** P0 · manual · `app/services/event_groups/update_service.rb:97-145` · `app/controllers/api/event_groups_controller.rb:70-80`

#### API-XDBOQ-031 — A line item of ANOTHER event can be deleted by sending its id with status "deleted"
- **Why it matters.** The ordinary deletion path looks lines up by the request ids with no event filter
  (`EventGroupLineItem…where(id: egli_ids)`) and marks them deleted, deletes their forms, and on a draft voids their stage
  rows. The only authorisation is on MY event.
- **Setup.** Two QA events in the same QA company: A (mine, two lines so the one-line guard does not fire) and B (two lines, LB1, LB2).
- **Steps.** 1. `PATCH /event_groups/<A>` `{"line_items":[{"uuid":"<LB1 uuid>","status":"deleted"}]}`. 2. Read B.
- **Expected.** Should: 422, B untouched. Today (likely defect): 200 and LB1 (event B) is deleted with its forms.
- **Oracle.** get_line_items of B count drops to 1.
- **Trace.** P0 · manual · `app/services/event_groups/update_service.rb:168-201`

#### API-XDBOQ-032 — Line items sent as text on a PATCH are refused, not a crash
- **Why it matters.** Both the BOQ re-upload and ordinary line edits go through this request; malformed input must be
  refused, not take the server down.
- **Setup.** The sandbox.
- **Steps.** 1. `PATCH /event_groups/{{eventGroupUuid}}` `{"line_items":"QA_Platform_not_a_list_{{stamp}}"}`.
- **Expected.** Should: 422 code 2; sandbox unchanged. Today: HTTP 500 (the service calls `.select` on the string). Never 5xx.
- **Oracle.** Status < 500; line count unchanged.
- **Trace.** P1 · automate · `EDGE-DBOQ-032` · `app/services/event_groups/update_service.rb:97`

#### API-XDBOQ-033 — A PATCH line with an unknown product is refused, not a crash
- **Why it matters.** A BOQ re-upload containing a product that was deactivated meanwhile must name the bad row, not fail the whole save.
- **Setup.** The sandbox; a catalog variant.
- **Steps.** 1. `PATCH /event_groups/{{eventGroupUuid}}` with one new row whose `product_uuid` is `Z2dnWmdaUWtnZw==`.
- **Expected.** Should: 4xx (80 "Product not found" or 2); nothing added. Today: HTTP 500 (`product.id` on nil). Never 5xx.
- **Oracle.** Status < 500; line count unchanged.
- **Trace.** P1 · automate · `EDGE-DBOQ-033` · `app/controllers/concerns/trade_controller_helper.rb:6290-6300`

#### API-XDBOQ-034 — An empty row in a PATCH is refused, not a crash
- **Why it matters.** A spreadsheet with trailing blank lines produces empty rows.
- **Setup.** The sandbox.
- **Steps.** 1. `PATCH /event_groups/{{eventGroupUuid}}` `{"line_items":[{}]}`.
- **Expected.** Should: 4xx; nothing changes. Today: HTTP 500. Never 5xx.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-DBOQ-034` · `app/controllers/concerns/trade_controller_helper.rb:6298-6300`

## 4. Linking the BOQ purchase request — PATCH /event_groups with purchase_request_id

#### API-XDBOQ-035 — Linking a purchase request that does not exist is refused
- **Why it matters.** Only an active BOQ PR of this workspace may feed a BOQ project.
- **Setup.** The sandbox.
- **Steps.** 1. `PATCH /event_groups/{{eventGroupUuid}}` `{"purchase_request_uuid":"Z2dnWmdaUWtnZw=="}`.
- **Expected.** Refused; nothing linked. HTTP 422, code 101 "You are not allowed to perform this action" (checked before authorize).
- **Oracle.** 422 + 101.
- **Trace.** P1 · automate · `EDGE-DBOQ-035` · `app/controllers/concerns/event_group_controller_helper.rb:2579-2590`

#### API-XDBOQ-036 — An undecodable purchase request uuid is silently ignored
- **Why it matters.** The client asked for a link and got a 200 without one; the PR's in-progress quantity is then wrong
  with no error anywhere.
- **Setup.** The sandbox.
- **Steps.** 1. `PATCH /event_groups/{{eventGroupUuid}}` `{"purchase_request_uuid":"WrongUuid1="}`.
- **Expected (today).** HTTP 200, nothing changes (the id decodes to nil and the PR check is skipped). Should: 422. Never 5xx.
- **Oracle.** 200; event unchanged.
- **Trace.** P2 · automate · `EDGE-DBOQ-036` · `app/controllers/concerns/event_group_controller_helper.rb:2584` · `app/controllers/concerns/params_auth.rb:66-71`

#### API-XDBOQ-037 — A non-numeric raw purchase request id is refused
- **Why it matters.** Raw ids skip uuid decoding; they must still be validated and scoped.
- **Setup.** The sandbox.
- **Steps.** 1. `PATCH /event_groups/{{eventGroupUuid}}` `{"purchase_request_id":"abc"}`.
- **Expected.** HTTP 422, code 101 "You are not allowed to perform this action".
- **Oracle.** 422 + 101.
- **Trace.** P2 · automate · `EDGE-DBOQ-037` · `app/controllers/concerns/event_group_controller_helper.rb:2584-2587`

#### API-XDBOQ-038 — A material purchase request cannot be linked as the BOQ PR
- **Why it matters.** Linking a material PR to a BOQ project would double-count its quantities.
- **Setup.** The sandbox; {{prId}} is the workspace's first PR (a REAL record; this request writes nothing to it).
- **Steps.** 1. `PATCH /event_groups/{{eventGroupUuid}}` `{"purchase_request_uuid":"{{prId}}"}`.
- **Expected.** Material/service PR: 422 code 101. A BOQ PR: 200 and no mapping (the sandbox is not a BOQ project). Never 5xx.
- **Oracle.** Status; no PR mapping on the sandbox.
- **Trace.** P2 · automate · `EDGE-DBOQ-038` · `app/controllers/concerns/event_group_controller_helper.rb:2585,2640-2641`

#### API-XDBOQ-039 — Linking an active BOQ PR to a live BOQ project maps it once and marks it in progress
- **Why it matters.** This is how a BOQ PR shows "in progress" and later "completed"; double links or a missing worker
  leave the PR open forever.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A QA BOQ PR (one item) and a LIVE QA BOQ project.
- **Steps.** 1. `PATCH /event_groups/<uuid>` `{"purchase_request_uuid":"<pr>"}`. 2. Repeat the same request. 3. Read the PR.
- **Expected.** Both 200; exactly one project↔PR mapping (find_or_create); the in-progress worker runs; the PR item becomes
  in_progress (quantity_in_progress 1) while the commercial stage is open, completed once it closes.
- **Oracle.** PR read; one mapping row.
- **Trace.** P1 · manual · `app/controllers/concerns/event_group_controller_helper.rb:2640-2653` · `app/workers/update_in_progress_quantity_worker.rb:34-53`

#### API-XDBOQ-040 — A BOQ PR with no items crashes the link after the event was already saved
- **Why it matters.** The worker is enqueued with `purchase_request_items.first.id`; with no items that raises outside the
  rescued errors, after the event update committed — the buyer sees an error but the change stuck.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A QA BOQ PR whose only item was removed; a live QA BOQ project.
- **Steps.** 1. `PATCH /event_groups/<uuid>` `{"title":"QA_Platform_DBOQ_040_{{stamp}}","status":"active","purchase_request_uuid":"<pr>"}`.
- **Expected.** Should: 4xx before any write. Today (likely defect): 500 after the update was saved.
- **Oracle.** Status; event read shows the new title anyway.
- **Trace.** P2 · manual · `app/controllers/concerns/event_group_controller_helper.rb:2640-2653`

#### API-XDBOQ-041 — A BOQ PR sent with a draft or ordinary event is accepted but never mapped
- **Why it matters.** Mapping happens only for an ACTIVE BOQ project. On a draft the link is silently skipped and must be
  re-sent on publish — the dashboard does so; an API client may not.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A QA BOQ PR; a DRAFT QA BOQ project.
- **Steps.** 1. PATCH the draft with the PR. 2. Publish without the PR. 3. Read PR mappings.
- **Expected.** Step 1 200 with no mapping; after step 2 still no mapping. Publish with the PR → mapping created.
- **Oracle.** Mapping rows per step.
- **Trace.** P2 · manual · `app/controllers/concerns/event_group_controller_helper.rb:2640-2641`

## 5. BOQ templates and the sample sheet — GET /templates

#### API-XDBOQ-042 — The BOQ template picker list comes back well-formed
- **Why it matters.** This is the exact call the BOQ project's template picker makes; an error or a non-BOQ template in
  it sends the buyer down the wrong sheet.
- **Setup.** Buyer session.
- **Steps.** 1. `GET /templates?type_identifier=boq&hide_onboarding_v2_templates=true`.
- **Expected.** HTTP 200 with `{default:[…], saved:[…]}`, every entry a `t-boq` template (either list may be empty). When
  `boq_in_erfx_allowed` is ON the company has at least one active BOQ template, but `saved` only lists those this user may see.
- **Oracle.** Every returned template's type identifiers include `t-boq`.
- **Trace.** P1 · automate · `EDGE-DBOQ-042` · `app/controllers/api/templates_controller.rb:107-143` · `app/helpers/templates_helper.rb:4-50` · `src/views/eventCreation/templateSelection.jsx:444-446`

#### API-XDBOQ-043 — The stored identifier "t-boq" is not a valid filter
- **Why it matters.** Clients that mix the stored and the public identifier must get a clear refusal, not an empty list.
- **Setup.** Buyer session.
- **Steps.** 1. `GET /templates?type_identifier=t-boq`.
- **Expected.** HTTP 422, code 2 "Insufficient parameters".
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DBOQ-043` · `app/controllers/api/templates_controller.rb:118-120` · `app/models/template.rb:58-61`

#### API-XDBOQ-044 — "BOQ" in capitals is not a valid filter
- **Why it matters.** The membership test is case-sensitive; guards the exact-match contract.
- **Setup.** Buyer session.
- **Steps.** 1. `GET /templates?type_identifier=BOQ`.
- **Expected.** HTTP 422, code 2 "Insufficient parameters".
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DBOQ-044` · `app/controllers/api/templates_controller.rb:119`

#### API-XDBOQ-045 — An exclude list sent as plain text is refused, not a JSON crash
- **Why it matters.** Ordinary eRFX projects exclude BOQ templates from their picker. A string exclude list goes straight
  into `JSON.parse`, and the parse error is not rescued.
- **Setup.** Buyer session.
- **Steps.** 1. `GET /templates?type_identifier=trade&exclude_type_identifiers=boq`.
- **Expected.** Should: 422 code 2. Today (likely defect): HTTP 500 (JSON::ParserError). Never 5xx.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DBOQ-045` · `app/controllers/api/templates_controller.rb:113-115` · `src/views/eventCreation/templateSelection.jsx:126-131`

#### API-XDBOQ-046 — Asking for BOQ templates while excluding BOQ gives empty lists
- **Why it matters.** Contradictory filters must give a well-formed, empty answer.
- **Setup.** Buyer session.
- **Steps.** 1. `GET /templates?type_identifier=boq&exclude_type_identifiers=["boq"]` (URL-encoded JSON).
- **Expected.** HTTP 200, `default: []`, `saved: []`.
- **Oracle.** Both arrays empty.
- **Trace.** P2 · automate · `EDGE-DBOQ-046` · `app/helpers/templates_helper.rb:52-57`

#### API-XDBOQ-047 — Excluding "t-boq" is refused
- **Why it matters.** Same identifier contract on the exclude list.
- **Setup.** Buyer session.
- **Steps.** 1. `GET /templates?type_identifier=boq&exclude_type_identifiers=["t-boq"]`.
- **Expected.** HTTP 422, code 2 "Insufficient parameters".
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DBOQ-047` · `app/controllers/api/templates_controller.rb:121-123`

#### API-XDBOQ-048 — An exclude list sent as an object is refused
- **Why it matters.** `Array({"boq":1})` becomes `[["boq",1]]`; wrong shapes must be refused, not half-applied.
- **Setup.** Buyer session.
- **Steps.** 1. `GET /templates?type_identifier=boq&exclude_type_identifiers={"boq":1}`.
- **Expected.** HTTP 422, code 2 "Insufficient parameters".
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DBOQ-048` · `app/controllers/api/templates_controller.rb:113-123`

#### API-XDBOQ-049 — "Hide default templates" removes Procol's stock BOQ templates from the picker
- **Why it matters.** Companies that only want their own BOQ formats turn on `hide_default_templates`; stock templates
  must then never appear (and a company with no own BOQ template is left with an empty picker).
- **Setup.** A QA company with `hide_default_templates` ON and one own BOQ template. Config change, so no twin.
- **Steps.** 1. `GET /templates?type_identifier=boq`. 2. Turn the setting off and repeat.
- **Expected.** With the setting on, `default` lists only the company's own default-type BOQ templates (no company_id-nil
  ones); off, Procol's stock BOQ templates appear too.
- **Oracle.** company_id of each `default` entry.
- **Trace.** P2 · manual · `app/helpers/templates_helper.rb:4-21`

#### API-XDBOQ-050 — Downloading the BOQ sample sheet of a template that doesn't exist is refused
- **Why it matters.** "Download Template" in the BOQ upload modal must fail cleanly for a deleted template.
- **Setup.** Buyer session.
- **Steps.** 1. `GET /templates/excel_template/Z2dnWmdaUWtnZw==?sheet_type=boq_items_sheet`.
- **Expected.** HTTP 422, code 4 "Request not found".
- **Oracle.** 422 + code 4.
- **Trace.** P2 · automate · `EDGE-DBOQ-050` · `app/controllers/api/templates_controller.rb:177-179` · `app/models/template.rb:117-121`

#### API-XDBOQ-051 — Downloading the BOQ sample sheet with an undecodable template id is refused
- **Why it matters.** Undecodable ids must not reach the Excel builder.
- **Setup.** Buyer session.
- **Steps.** 1. `GET /templates/excel_template/WrongUuid1=?sheet_type=boq_items_sheet`.
- **Expected.** HTTP 422, code 4 "Request not found".
- **Oracle.** 422 + code 4.
- **Trace.** P2 · automate · `EDGE-DBOQ-051` · `app/models/template.rb:118-120`

#### API-XDBOQ-052 — The BOQ sample sheet has the layout the uploader expects
- **Why it matters.** Buyers fill the downloaded sheet and upload it back; if the sample's headers or section numbering
  don't match the parser's rules (section 6), every first upload fails.
- **Setup.** gate: `boq_in_erfx_allowed` ON. One active QA BOQ template (needs its id, so no twin).
- **Steps.** 1. `GET /templates/excel_template/<template>?sheet_type=boq_items_sheet`. 2. Open the file from `excel_url`.
  3. Repeat with `sheet_type=nonsense`.
- **Expected.** Step 1: 200 with `excel_url`; the workbook has sheets "Tab 1".."Tab 4"; row 1 is the Buyer/Vendor group header,
  row 2 the column headers starting with "Section", with "Unit" right after the quantity column and hidden widgets left out;
  sample sections A (A.1, A.2) and B (B.1, B.2). The download is logged. Step 3: 422 code 2 "Insufficient parameters".
- **Oracle.** Workbook structure; the step-3 code.
- **Trace.** P1 · automate-later · `app/controllers/api/templates_controller.rb:177-208` · `app/services/procol_excel/boq_excel_sheet_service.rb`

#### API-XDBOQ-053 — Deactivating the last BOQ template switches BOQ off for the whole company
- **Why it matters.** `boq_in_erfx_allowed?` reads template existence live, so deleting one template silently removes
  the BOQ menu for every buyer and refuses BOQ creates, while existing BOQ projects keep working.
- **Setup.** A QA company with `boq_in_erfx_allowed` ON and exactly one BOQ template; one existing QA BOQ project.
- **Steps.** 1. Deactivate the template (`DELETE /templates/<id>` from the dashboard). 2. Re-read the dashboard config.
  3. Try a BOQ create. 4. Open the existing BOQ project and its quote summary.
- **Expected.** Config `boq_in_erfx_allowed` false; create refused 101; the existing project still reads and its stage
  remains a BOQ stage (the stage keeps its own template type).
- **Oracle.** Config flag; create code; existing project still shows tabs.
- **Trace.** P2 · manual · `app/models/company.rb:1096-1103` · `app/models/trade_request.rb:447-449`

## 6. Uploading the BOQ sheet — POST /templates/product_sheet_params

The dashboard uploads the BOQ sheet with `{template_uuid, excel_data, excel_type: "multistage"}`
(`src/redux/orders/actions.js:2049-2066`). Template-based BOQ templates are parsed by `ExcelToJsonConversionService`
(multistage branch) and turned into stage rows by `AuctionParamsGenerationService`; dynamic templates by
`DynamicTemplateBoqSheetParser`. Every parse error comes back as HTTP 422 code 15 with the message below. The parse path
inserts units, free-text products and a "BOQ" category into the company's master data, so only refusals that fire
before parsing have twins.

#### API-XDBOQ-054 — Uploading a BOQ sheet without the file is refused
- **Why it matters.** The first line of the upload; a missing file must be refused before any parsing or master-data insert.
- **Setup.** Buyer session. (Endpoint not on the runner's default allowlist; refused on its first line.)
- **Steps.** 1. `POST /templates/product_sheet_params` `{"template_uuid":"Z2dnWmdaUWtnZw==","excel_type":"multistage","sheet_type":"boq_items_sheet"}`.
- **Expected.** HTTP 422, code 2 "Insufficient parameters".
- **Oracle.** 422 + code 2.
- **Trace.** P1 · automate · `EDGE-DBOQ-054` · `app/controllers/api/templates_controller.rb:215-217`

#### API-XDBOQ-055 — Uploading a BOQ sheet against a template that doesn't exist is refused
- **Why it matters.** A stale template id must not reach the parser (or create an upload log for nothing).
- **Setup.** Buyer session. (Not on the default allowlist; refused at the template lookup, before the upload log.)
- **Steps.** 1. `POST /templates/product_sheet_params` with a tiny base64 `excel_data` and `template_uuid` `Z2dnWmdaUWtnZw==`.
- **Expected.** HTTP 422, code 4 "Request not found".
- **Oracle.** 422 + code 4.
- **Trace.** P2 · automate · `EDGE-DBOQ-055` · `app/controllers/api/templates_controller.rb:219-220` · `app/models/template.rb:117-121`

#### API-XDBOQ-056 — A BOQ sheet uploaded without excel_type "multistage" crashes instead of being refused
- **Why it matters.** The BOQ checks only run for `excel_type=multistage`; the default `"trade"` feeds flat rows into the
  multistage validator, which calls `.map` on nil. Any client (or a dashboard regression) that forgets the type gets a 500.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A QA BOQ template (template-based, not dynamic) and a valid BOQ sample sheet.
- **Steps.** 1. `POST /templates/product_sheet_params` with the sheet and the template, without `excel_type`.
- **Expected.** Should: 422 code 15 with a clear message. Today (likely defect): HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P1 · manual · `app/controllers/api/templates_controller.rb:228-240` · `app/services/validations/auction_excel_validation_service.rb:221-267`

#### API-XDBOQ-057 — The first section must be "A"
- **Why it matters.** Section labels drive the hierarchy (A, A.1, A.1.1). A sheet starting at "B" or "1" is refused with
  the expected label in the message so the buyer can fix it.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A QA BOQ template; a sheet whose first Section is "B".
- **Steps.** 1. Upload with `excel_type=multistage`.
- **Expected.** HTTP 422, code 15, message "Invalid section, current section B, expected section A, Please Add Valid one".
- **Oracle.** Exact message.
- **Trace.** P1 · manual · `app/services/conversions/excel_to_json_conversion_service.rb:304-318`

#### API-XDBOQ-058 — Section label rules: duplicate, trailing dot, lowercase, skipped level, non-consecutive
- **Why it matters.** Each rule protects the parent/child roll-up of section totals. Run one sheet per rule.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A QA BOQ template; five sheets: (a) "A, A.1, A.1" duplicate; (b) "A." trailing dot;
  (c) "a" lowercase; (d) "A, A.1.1" skipping A.1; (e) "A, A.1, A.3" skipping A.2; (f) "A, B" with no A.1 between.
- **Steps.** 1. Upload each sheet with `excel_type=multistage`.
- **Expected.** Each: HTTP 422, code 15, "Invalid section, current section <label>, expected section <x>, Please Add Valid one",
  where <x> is the next valid label (e.g. "A.2", "A.1"), or "Should include Capital Alphabet" for (c).
- **Oracle.** The expected-section part of each message.
- **Trace.** P1 · manual · `app/services/conversions/excel_to_json_conversion_service.rb:291-536`

#### API-XDBOQ-059 — Sections A.9 → A.10 are accepted as consecutive
- **Why it matters.** The checks compare labels partly by string length; BOQs routinely have 10+ items per section and a
  string comparison mistake refuses every such sheet.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A sheet with A, A.1 … A.12, B, B.1.
- **Steps.** 1. Upload with `excel_type=multistage`.
- **Expected.** HTTP 200, 13 rows under A in order A.1..A.12, then B.
- **Oracle.** `valid.data` order and labels.
- **Trace.** P1 · manual · `app/services/conversions/excel_to_json_conversion_service.rb:400-460`

#### API-XDBOQ-060 — A sheet without a "Section" column is refused
- **Why it matters.** Without sections there is no hierarchy; the parser must say so.
- **Setup.** gate: `boq_in_erfx_allowed` ON. The sample sheet with the "Section" column removed.
- **Steps.** 1. Upload with `excel_type=multistage`.
- **Expected.** HTTP 422, code 15, "Please ensure that Sections are Present".
- **Oracle.** Exact message.
- **Trace.** P2 · manual · `app/services/conversions/excel_to_json_conversion_service.rb:581`

#### API-XDBOQ-061 — A missing required buyer column is named with its section
- **Why it matters.** Buyers delete columns they think unused; the message must name the column and the section.
- **Setup.** gate: `boq_in_erfx_allowed` ON. The sample sheet with the quantity column removed.
- **Steps.** 1. Upload with `excel_type=multistage`.
- **Expected.** HTTP 422, code 15, "<column> is missing at section <A.1>, Please add the required component". Formula,
  dropdown, attachment and delivery-location columns are not required.
- **Oracle.** Message names the column and section.
- **Trace.** P2 · manual · `app/services/conversions/excel_to_json_conversion_service.rb:560-570`

#### API-XDBOQ-062 — A sheet with no header row is "BOQ sheet not filled"
- **Why it matters.** An empty sample uploaded by mistake must get a plain message.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A workbook whose sheets have no row 2.
- **Steps.** 1. Upload with `excel_type=multistage`.
- **Expected.** HTTP 422, code 15, "Please ensure that the BOQ sheet is filled in". Empty tabs among filled ones are dropped silently.
- **Oracle.** Exact message; tab count of a mixed workbook.
- **Trace.** P2 · manual · `app/services/conversions/excel_to_json_conversion_service.rb:260-293`

#### API-XDBOQ-063 — Rows without a unit become section notes, not priced lines
- **Why it matters.** BOQs carry headings and description rows; those must not become lines vendors have to price.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A sheet where A.1 has Unit "Nos" and A.2 has no unit (description only).
- **Steps.** 1. Upload with `excel_type=multistage`.
- **Expected.** 200; A.1 is a line; A.2 becomes a note/split point of the section (no product row); `in_valid` is null for BOQ.
- **Oracle.** `valid.data` rows.
- **Trace.** P2 · manual · `app/services/validations/auction_excel_validation_service.rb:221-267`

#### API-XDBOQ-064 — Uploading a BOQ sheet writes free-text master data
- **Why it matters.** The upload — before the buyer even saves — inserts new units, free-text products ("Quality: Free
  Text" variants), a "BOQ" free-text category and a "Free Text" delivery location into the company. Repeated uploads must
  reuse them, not multiply them.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A QA company; a sheet with a new unit "QA_Platform_Unit_{{stamp}}" and two new item names.
- **Steps.** 1. Upload the sheet twice. 2. Read units, products (free_text) and categories.
- **Expected.** One new unit, two free-text products (product_type free_text), at most one "BOQ" free-text category and one
  "Free Text" location, each created once across both uploads.
- **Oracle.** Master-data counts before/after.
- **Trace.** P1 · manual · `app/services/params_generator/auction_params_generation_service.rb:23-27,159-252,349-366`

#### API-XDBOQ-065 — Uploading a sheet for a DYNAMIC BOQ template crashes on the unit lookup
- **Why it matters.** `insert_units` calls `get_hash_value(line_item, unit_col, ["Unit", …])` with the fallback list as a
  third positional argument, but the helper takes it as a keyword (`fallback_keys:`). On Ruby 3.2 that raises
  ArgumentError for any sheet with at least one priced row — dynamic BOQ upload cannot succeed.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A QA BOQ template of template_type "dynamic"; a sheet with one priced row.
- **Steps.** 1. Upload with `excel_type=multistage`.
- **Expected.** Should: 200 with the row in `valid.data`. Today (likely defect, from reading the code): HTTP 500 ArgumentError.
- **Oracle.** Status and body.
- **Trace.** P0 · manual · `app/services/params_generator/dynamic_template_boq_params_generation_service.rb:260-270` · `app/helpers/dynamic_boq_helper.rb:4`

#### API-XDBOQ-066 — There is no server-side row limit on a BOQ sheet
- **Why it matters.** The 500-line cap is applied only when the event is published in the dashboard; the upload itself
  accepts any size. Large uploads must still parse in time.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A valid 1,000-row BOQ sheet.
- **Steps.** 1. Upload with `excel_type=multistage`. 2. Time it.
- **Expected.** 200 with 1,000 rows (no 4xx for size), within the request timeout. The dashboard later blocks publish with
  "Maximum no of product addition reached" (UI-XDBOQ-012) unless the company's `allowed_maximum_line_items.boq` is ≥ 1000.
- **Oracle.** Row count; response time.
- **Trace.** P1 · manual · `app/controllers/api/templates_controller.rb:215-247` · `src/views/projectCreation/helpers.js:369-374`

## 7. The BOQ stage — POST /trade/template_input and PATCH /trade/:id

Stage creation bodies are too large for the runner, so these cases are manual or for the stage framework.

#### API-XDBOQ-067 — A stage is BOQ only when it has tabs AND a BOQ template
- **Why it matters.** Everything BOQ-specific (edit after close, tab summaries, BOQ bid upload, BOQ award) keys off
  `TradeRequest#boq?`. A BOQ template sent without tabs is an ordinary stage; tabs on a non-BOQ template are not BOQ.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A draft QA BOQ project.
- **Steps.** 1. Add a stage with the BOQ template and `tabs: []`. 2. Add one with an ordinary template and tabs. 3. Add one
  with the BOQ template and tabs. 4. Read each with `GET /trade/<id>` (`trade_config.is_boq_event`).
- **Expected.** Only stage 3 reports `is_boq_event` true; creating it also sets the project's `boq_based_rfx` true and
  turns off last-purchase-price savings in its config.
- **Oracle.** `is_boq_event` per stage; project config.
- **Trace.** P1 · manual · `app/models/trade_request.rb:445-449` · `app/controllers/concerns/trade_controller_helper.rb:3344-3346,3816` · `app/serializers/trade_template_serializer.rb:149`

#### API-XDBOQ-068 — Tabs and sections are not validated when the stage is saved
- **Why it matters.** `add_ranges_to_sections` trusts the client: a section without `section_no` or `range` crashes (500),
  an inverted range is silently left out of the parent's roll-up, and child detection is a substring match ("A" also
  claims "AA"). Totals per section then disagree with the sheet.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A draft QA BOQ project; the BOQ stage body with (a) a section missing
  `section_no`, (b) a section range [5,3], (c) sections "A" and "AA".
- **Steps.** 1. `POST /trade/template_input` with each variant. 2. Read `GET /v1/trade/<id>/quote_summary/<any>`.
- **Expected.** Should: 422 for (a) and (b). Today: (a) HTTP 500; (b) 200 with the bad section ignored in the parent range;
  (c) "AA" counted as a child of "A".
- **Oracle.** Status; tab summary ranges.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:6270-6288` · `app/controllers/api/trade_controller.rb:162`

#### API-XDBOQ-069 — A CLOSED BOQ stage can still be edited; an ordinary closed stage cannot
- **Why it matters.** BOQ stages are deliberately editable after close (quantity corrections before award). The
  exception must stay limited to BOQ and RFP stages.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A closed QA BOQ RFQ stage with no bids, and a closed ordinary RFQ stage.
- **Steps.** 1. `PATCH /trade/<boq stage>` with edited widgets/rows. 2. Same on the ordinary stage.
- **Expected.** BOQ: 200 and the sheet is rebuilt. Ordinary: 422 code 4 "Request not found" (closed is not an editable
  status, and the bid-end check also refuses).
- **Oracle.** Status per stage; BOQ stage rows after edit.
- **Trace.** P1 · manual · `app/controllers/api/trade_controller.rb:590-594` · `app/controllers/concerns/trade_controller_helper.rb:331` · `app/controllers/concerns/trade_template_helper.rb:1420-1424`

#### API-XDBOQ-070 — Editing a closed BOQ stage that has bids only changes columns, caps and savings
- **Why it matters.** Rows must not be rebuilt under existing bids; only widget, savings and ceiling/floor changes go
  through, and those are still validated.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A closed QA BOQ stage with one QA vendor bid.
- **Steps.** 1. PATCH with a changed row quantity. 2. PATCH with a price cap below an existing bid.
- **Expected.** Step 1: rows unchanged. Step 2: HTTP 422, code 15 with a message such as "Price Cap should be greater than or equal to …".
- **Oracle.** Stage rows; error text.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:331-458`

#### API-XDBOQ-071 — A BOQ stage that has started cannot be rescheduled
- **Why it matters.** Editing after close is allowed, rescheduling is not — the two must not be confused.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A closed QA BOQ stage.
- **Steps.** 1. `PATCH /trade/<id>` with new `bid_start_time` and `bid_end_time` and no configurations.
- **Expected.** HTTP 422, code 258 "You cannot re-schedule this event!".
- **Oracle.** 422 + 258; schedule unchanged.
- **Trace.** P2 · manual · `app/controllers/api/trade_controller.rb:605-606`

#### API-XDBOQ-072 — Serial numbers on BOQ lines come from the Section column, not a running number
- **Why it matters.** The grid prints `line_item_no` (e.g. A.1.2); the serial-number column is hidden for tabbed stages.
  If the section label is lost the vendor cannot tell which BOQ item they are pricing.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A BOQ stage built from a sheet with A.1, A.2, B.1.
- **Steps.** 1. `GET /trade/<id>`; read each row's product `line_item_no` and the widgets list.
- **Expected.** Rows carry line_item_no A.1, A.2, B.1 in `order`; no serial_number widget is shown.
- **Oracle.** Row labels and widget list.
- **Trace.** P2 · manual · `app/services/params_generator/auction_params_generation_service.rb:159-252` · `app/controllers/concerns/trade_template_helper.rb:1463,1726`

## 8. Reading BOQ lines and tab pages

#### API-XDBOQ-073 — Reading the line items of a project that doesn't exist is refused
- **Why it matters.** The line read is the oracle for every upload/replace case; it must fail cleanly on a bad id.
- **Setup.** Buyer session.
- **Steps.** 1. `GET /event_groups/Z2dnWmdaUWtnZw==/get_line_items`.
- **Expected.** HTTP 422, code 533 "Project does not exist.".
- **Oracle.** 422 + code 533.
- **Trace.** P2 · automate · `EDGE-DBOQ-073` · `app/controllers/api/event_groups_controller.rb:466-471`

#### API-XDBOQ-074 — A negative page on the line read falls back to page 1
- **Why it matters.** Big BOQ projects are paged; a bad page must not error.
- **Setup.** The sandbox (one line).
- **Steps.** 1. `GET /event_groups/{{eventGroupUuid}}/get_line_items?page=-3`.
- **Expected.** HTTP 200 with the one line, total_pages 1, count 1. (When `hide_line_items_from_project_details_vendor_side`
  is ON the reply is `{}` for everyone, buyer included — that check runs before authorize.)
- **Oracle.** count 1.
- **Trace.** P2 · automate · `EDGE-DBOQ-074` · `app/controllers/api/event_groups_controller.rb:472-473,1703-1705`

#### API-XDBOQ-075 — A search filter that is a JSON list is refused, not a crash
- **Why it matters.** With no `filters`, `search` is parsed as the whole filter object; a list then crashes the line filter.
- **Setup.** The sandbox.
- **Steps.** 1. `GET /event_groups/{{eventGroupUuid}}/get_line_items?search=[1]`.
- **Expected.** Should: 200 (ignored) or 4xx. Today (likely defect): HTTP 500 (`[1]['category_ids']`). Never 5xx.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DBOQ-075` · `app/controllers/api/event_groups_controller.rb:1551,1603-1604`

#### API-XDBOQ-076 — Malformed filters AND search together crash the line read
- **Why it matters.** `create_filter_params` rescues the parse error but leaves `@filters` nil; the crash moves to the filter step.
- **Setup.** The sandbox.
- **Steps.** 1. `GET /event_groups/{{eventGroupUuid}}/get_line_items?filters=notjson&search=notjson`.
- **Expected.** Should: 200 or 4xx. Today (likely defect): HTTP 500 (`nil['category_ids']`). Never 5xx.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DBOQ-076` · `lib/common_functions.rb:83-96` · `app/controllers/api/event_groups_controller.rb:1578-1608,1551`

#### API-XDBOQ-077 — The BOQ tab summary of an ordinary stage is refused
- **Why it matters.** The tab-total endpoint is BOQ-only and must refuse ordinary stages instead of computing nonsense.
- **Setup.** The sandbox stage {{tradeId}} (ordinary RFQ, no tabs). (Not on the default allowlist; a read.)
- **Steps.** 1. `GET /v1/trade/{{tradeId}}/quote_summary/Z2dnWmdaUWtnZw==`.
- **Expected.** HTTP 422, code 101 "You are not allowed to perform this action".
- **Oracle.** 422 + code 101.
- **Trace.** P2 · automate · `EDGE-DBOQ-077` · `app/controllers/api/v1/trade_controller.rb:806-813`

#### API-XDBOQ-078 — Asking for a tab page on an ordinary stage crashes the quote view
- **Why it matters.** The dashboard sends `tab` and `page` when it pages a BOQ sheet. The stage version of the paging
  helper has no "no tabs" guard (the project version has one), so tab/page on any stage without tabs is a 500 — and it
  runs before the quote is even looked up.
- **Setup.** The sandbox stage {{tradeId}} (no tabs). (Not on the default allowlist; a read.)
- **Steps.** 1. `GET /v1/trade/{{tradeId}}/quote_details/Z2dnWmdaUWtnZw==?tab=1&page=1`.
- **Expected.** Should: 422 code 4 (no such quote) or the tab params ignored. Today (likely defect): HTTP 500 (`nil['range']`). Never 5xx.
- **Oracle.** Status < 500.
- **Trace.** P0 · automate · `EDGE-DBOQ-078` · `app/controllers/concerns/trade_controller_helper.rb:6337-6342` · `app/controllers/api/v1/trade_controller.rb:643-651` · `app/controllers/concerns/event_group_controller_helper.rb:204-209`

#### API-XDBOQ-079 — A line-range filter with a text bound is refused, not a crash
- **Why it matters.** The `range` filter is the BOQ tab window; client values reach Ruby's Range constructor unchecked.
- **Setup.** The sandbox stage.
- **Steps.** 1. `GET /trade/{{tradeId}}?filters={"range":{"from":"a","to":1}}`.
- **Expected.** 200 (range ignored) or 4xx; never 5xx (`"a"..1` raises ArgumentError on the sheet path).
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-DBOQ-079` · `app/controllers/concerns/trade_template_helper.rb:668` · `app/controllers/concerns/trade_controller_filter_helper.rb:555-575`

#### API-XDBOQ-080 — Project sheet paging: tab -1 jumps to the last tab, page 0 returns the tail of the whole BOQ
- **Why it matters.** Ruby negative indexes: `tabs[-1]` is the last tab and an array slice with a negative start wraps to
  the end. The master QCS then shows rows from another tab under the selected one.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A live QA BOQ project with 3 tabs of 20 lines and one vendor bid.
- **Steps.** 1. `GET /sheets/details?event_group_uuid=<uuid>&view_type=summary_view&tab=-1&page=1`. 2. `…&tab=0&page=0`.
  3. `…&tab=0&page=99`.
- **Expected.** Should: 4xx or tab/page clamped. Today: step 1 returns tab 3's rows; step 2 returns rows from the END of
  the project (wrong rows, no error); step 3 returns an empty page.
- **Oracle.** Line numbers in each reply vs the tab's range.
- **Trace.** P2 · manual · `app/controllers/concerns/event_group_controller_helper.rb:204-221` · `app/controllers/api/sheets_controller.rb:86`

#### API-XDBOQ-081 — Quote paging on a BOQ stage: an unknown tab falls back to the first tab
- **Why it matters.** A stale tab index after a re-upload with fewer tabs silently shows tab 1, which the vendor may
  mistake for the tab they chose.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A BOQ stage with 2 tabs; the QA vendor's bid.
- **Steps.** 1. `GET /v1/trade/<stage>/quote_details/<bid>?tab=7&page=1`. 2. `…?tab=1&page=0`.
- **Expected.** Step 1: tab 1's rows. Step 2: rows before tab 2's start (the end of tab 1) or empty — no error.
- **Oracle.** Row orders vs tab ranges.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:6337-6349` · `app/controllers/concerns/trade_template_helper.rb:668`

#### API-XDBOQ-082 — BOQ project defaults force lot-based evaluation, even for the string "false"
- **Why it matters.** The flag is read with Ruby truthiness, so `"false"` still gives BOQ defaults.
- **Setup.** Buyer with trade create permission. (GET /v1/trade/new_request_config is not on the default allowlist; a read.)
- **Steps.** 1. `GET /v1/trade/new_request_config?filters={"for_boq_based_project":"false"}`. 2. Same without the filter.
- **Expected (today).** Both 200; step 1's defaults have `rfp_evaluation_mode` "lot_based" whatever the workspace default is.
- **Oracle.** Compare the two replies' default evaluation mode.
- **Trace.** P2 · automate · `EDGE-DBOQ-082` · `app/controllers/api/v1/trade_controller.rb:129-152` · `app/controllers/concerns/trade_controller_helper.rb:5576-5578` · `src/redux/orders/actions.js:424-425`

## 9. Vendor bidding on BOQ lines

BOQ bids are usually filled offline: the bid template is downloaded (`GET /v1/trade/:id/download_event_details`) and
uploaded with `POST /v1/trade/:id/upload_bid_excel`, which only PARSES the sheet and returns rows; the bid itself is then
created and submitted through `/v1/bids`. Bid cases need a vendor session, so only the stage-lookup refusal has a twin.

#### API-XDBOQ-083 — Uploading a bid sheet for a stage that doesn't exist is refused before anything is stored
- **Why it matters.** The upload stores the file (S3) and a Report row before parsing; a stale stage id must be refused first.
- **Setup.** Buyer session. (Not on the default allowlist; refused at the active-stage lookup.)
- **Steps.** 1. `POST /v1/trade/Z2dnWmdaUWtnZw==/upload_bid_excel` `{"excel_data":"<tiny base64>","excel_type":"bid"}`.
- **Expected.** HTTP 422, code 4 "Request not found"; no Report row, no file stored.
- **Oracle.** 422 + code 4.
- **Trace.** P2 · automate · `EDGE-DBOQ-083` · `app/controllers/api/v1/trade_controller.rb:1065-1073`

#### API-XDBOQ-084 — The bid-sheet upload is open to the buyer team and only returns parsed rows
- **Why it matters.** The policy is "can view the event", not "is a vendor": buyers use it for surrogate bids. It must
  never create or submit a bid on its own, and it does not check the bidding window.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A live QA BOQ stage; the QA buyer; a filled bid template.
- **Steps.** 1. As the buyer, `POST /v1/trade/<stage>/upload_bid_excel` with the sheet. 2. Read the stage's bids.
  3. Repeat after the stage closes.
- **Expected.** Both uploads 200 with `{inline_components, global}` per tab row; no bid row is created by either; a Report
  row records each upload.
- **Oracle.** Bid count unchanged; Report rows.
- **Trace.** P1 · manual · `app/policies/trade_request_policy.rb:184,222-223` · `app/controllers/concerns/trade_controller_helper.rb:6634-6660,6754-6769`

#### API-XDBOQ-085 — Missing tab sheets are skipped silently; a missing "Global Fields" sheet is refused
- **Why it matters.** A vendor who deletes a tab from the workbook gets a "successful" upload with that tab's prices
  missing — and only finds out at submit.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A live QA BOQ stage with tabs "Civil" and "Electrical"; a workbook without
  "Electrical", and one without "Global Fields".
- **Steps.** 1. Upload each workbook (QA vendor or buyer).
- **Expected.** Workbook 1: 200 with only Civil rows (should: refuse or warn). Workbook 2: HTTP 422, code 794 "Invalid excel file uploaded".
- **Oracle.** Rows per tab; error code.
- **Trace.** P1 · manual · `app/services/conversions/excel_to_json_conversion_service.rb:106-120,376-399`

#### API-XDBOQ-086 — Non-numeric and negative rates pass the upload and are only caught at bid create
- **Why it matters.** The upload returns rates as text; validation happens only when the bid products are saved. The
  vendor must see the price error there, mapped to the right BOQ line.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A live QA BOQ stage with a price floor/cap; a workbook with "abc", -5 and a
  rate above the cap on three lines.
- **Steps.** 1. Upload. 2. As the QA vendor, create the bid products from the parsed rows (`POST /v1/bids/<bid>/create_bid_products`).
- **Expected.** Step 1: 200, values echoed as text. Step 2: refused, e.g. code 38 "Price cannot be more than the allowed
  price" / 41 "Price cannot be less than the allowed price" / 578 "Validation Failed" — never a 5xx and never a stored negative rate.
- **Oracle.** Error code per row; bid products unchanged.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:6651` · `app/controllers/concerns/bids_controller_helper.rb:1828-1913`

#### API-XDBOQ-087 — An empty tab sheet or a missing file crashes the bid upload
- **Why it matters.** `sheet.last_row` is nil on an empty sheet and the loop compares `3 <= nil`; a missing `excel_data`
  reaches `Base64.decode64(nil)` after the Report row is saved. Both are 500s.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A live QA BOQ stage; a workbook whose "Civil" sheet is empty.
- **Steps.** 1. Upload it. 2. Upload with no `excel_data`.
- **Expected.** Should: 422 (794 or 2). Today (likely defect): HTTP 500 in both; step 2 leaves a Report row.
- **Oracle.** Status; Report rows.
- **Trace.** P1 · manual · `app/services/conversions/excel_to_json_conversion_service.rb:384` · `lib/excel_sheet_utils.rb:17-22` · `app/controllers/api/v1/trade_controller.rb:1071-1074`

#### API-XDBOQ-088 — During the cost-breakdown window every bid-sheet upload crashes
- **Why it matters.** `parse_components_for_bid` calls `component.slice!` outside the block that defines `component`
  (NameError) whenever the stage is in its cost-breakdown time — BOQ or not, no vendor can upload a sheet then.
- **Setup.** A live QA stage with a cost-breakdown window currently open (`in_cost_break_down_time?` true).
- **Steps.** 1. Upload a valid bid sheet.
- **Expected.** Should: 200 with only price and serial number kept. Today (likely defect): HTTP 500 NameError.
- **Oracle.** Status.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:6650-6662`

#### API-XDBOQ-089 — A partial BOQ bid is allowed once the vendor passed the technical stage
- **Why it matters.** For ordinary events a vendor must quote every line not regretted in the technical stage (748). BOQ
  skips that line-by-line check — vendors may quote part of a BOQ. Lot-closed sheets still demand all prices on the first bid (372).
- **Setup.** gate: `boq_in_erfx_allowed` ON. A live QA BOQ project: RFP stage (QA vendor responded) + BOQ RFQ stage
  (line-item closing); same for an ordinary project.
- **Steps.** 1. As the QA vendor, submit a bid pricing 2 of 5 BOQ lines (`PATCH /v1/bids/<bid>` status active). 2. Same on the ordinary project.
  3. Repeat 1 on a BOQ stage with lot closing.
- **Expected.** 1: accepted. 2: HTTP 422, code 748 "Please enter bid for all line items that are not regretted in technical
  stage.". 3: HTTP 422, code 372 "Please quote prices for all the products.".
- **Oracle.** Status/code per step.
- **Trace.** P1 · manual · `app/helpers/api/v1/bids_controller_helper.rb:389,819-820,985-1013`

#### API-XDBOQ-090 — On BOQ, technical participation is checked per company, not per line
- **Why it matters.** BOQ technical stages are evaluated vendor-wise; a vendor who answered the technical stage may quote
  any BOQ line. A vendor who did not must be refused.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A live QA BOQ project with RFP + RFQ; QA vendor A responded to the RFP, QA vendor B did not.
- **Steps.** 1. As A, create bid products on any line. 2. As B, the same.
- **Expected.** A: accepted. B: HTTP 422, code 737 "You cannot quote for this item because you didn't participate in the technical stage".
- **Oracle.** Codes.
- **Trace.** P1 · manual · `app/helpers/api/v1/bids_controller_helper.rb:197,300-320`

#### API-XDBOQ-091 — Tab and section totals are plain sums; unquoted and rate-only lines count as 0
- **Why it matters.** Totals are what buyers compare first. They are prefix sums of each line's total over ALL the stage's
  rows in order; no rounding is applied, so a 3-decimal rate can show a long float.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A BOQ stage: tab 1 = A.1 (2 Nos), A.2 (rate only), B.1 (3 Nos); QA vendor quotes
  A.1 at 10.333 and leaves B.1 empty.
- **Steps.** 1. `GET /v1/trade/<stage>/quote_summary/<bid>`.
- **Expected.** Section A total 20.666 (no rounding), section B 0, tab total 20.666; A.2 contributes 0. Only top-level
  sections are listed. Displayed values in the dashboard are rounded to the widget precision.
- **Oracle.** tabs_summary values.
- **Trace.** P1 · manual · `app/models/bid.rb:1821-1842` · `app/controllers/api/v1/trade_controller.rb:806-822`

#### API-XDBOQ-092 — Split tabs are merged only when tab collation is on
- **Why it matters.** Long BOQs are split into "Civil-1", "Civil-2"; with `tab_collation_enabled` the summary must show one
  "Civil" total, without it two.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A BOQ stage with tabs "Civil-1", "Civil-2"; collation on in one stage, off in another.
- **Steps.** 1. Read both quote summaries.
- **Expected.** Collation on: one parent "Civil" with the summed total. Off: two tabs. A tab with no name crashes today (nil `.split`) — should be refused at stage save.
- **Oracle.** Tab names and totals.
- **Trace.** P2 · manual · `app/models/model_helpers/common_model_helper.rb:105-150` · `app/models/bid.rb:1815`

#### API-XDBOQ-093 — The BOQ loading factor counts lines the vendor "bid" on in any status
- **Why it matters.** BOQ ranks add a loading for lines a vendor did not quote (best price × quantity). The lookup of
  "did quote" has no status filter, so a draft or withdrawn bid row hides the gap and the vendor ranks better than it should.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A BOQ stage, two QA vendors; vendor A quotes all lines; vendor B quotes all but
  B.1 in its active bid, but has an old draft row on B.1.
- **Steps.** 1. Read rank/scores for both (QCS or event score).
- **Expected.** Should: B loaded with best(B.1) × qty(B.1). Today (suspected): no loading for B.
- **Oracle.** Event score per vendor.
- **Trace.** P1 · manual · `app/models/model_helpers/trade_request_model_helper.rb:1588-1618` · `app/models/bid.rb:1971-1977` · `app/models/trade_product.rb:788-793`

#### API-XDBOQ-094 — A tab range past the last line crashes the tab summary
- **Why it matters.** Ranges are saved unchecked (API-XDBOQ-068); a range ending beyond the row count makes the prefix
  lookup return nil and the subtraction raise.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A BOQ stage saved with 10 rows but a tab range [1, 12].
- **Steps.** 1. `GET /v1/trade/<stage>/quote_summary/<any>`.
- **Expected.** Should: refused at save time. Today: HTTP 500 on the summary.
- **Oracle.** Status.
- **Trace.** P2 · manual · `app/models/trade_request.rb:2437-2467` · `app/models/bid.rb:1821-1842`

## 10. Awarding a BOQ

#### API-XDBOQ-095 — A BOQ award always gives the whole BOQ to the chosen vendor
- **Why it matters.** On a BOQ project the server overwrites each vendor's line selection with every line that vendor
  quoted; a partial or item-wise payload is silently widened, not refused. Buyers who think they awarded part of a BOQ have
  in fact awarded all of it.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A closed QA BOQ project with one RFQ stage, QA vendor quoted 5 lines.
- **Steps.** 1. `POST /proposal` for the project. 2. `POST /proposal/<id>/add_response` naming the vendor with `egli_uuids` of 2 lines.
  3. Read the proposal.
- **Expected.** 200; the proposal holds all 5 lines for the vendor; no error.
- **Oracle.** Proposal's line ids for the vendor.
- **Trace.** P0 · manual · `app/helpers/api/proposal_helper.rb:78-101,873-883,1048-1049`

#### API-XDBOQ-096 — Item-wise BOQ awarding only through the Excel award with the company setting
- **Why it matters.** `should_treat_as_boq_item_awarding?` is false only when the award is made with Excel AND
  `is_awarding_items_wise_in_boq_allowed` is on. Any other combination is whole-BOQ.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A closed QA BOQ project; setting `is_awarding_items_wise_in_boq_allowed` toggled on a QA company.
- **Steps.** 1. Setting ON: `POST /proposal {is_awarding_with_excel:true}`, then upload an awarding sheet that splits lines
  between two vendors. 2. Setting OFF: same. 3. Setting ON, manual (no Excel) partial award.
- **Expected.** Only 1 keeps the split. 2 and 3 award each vendor every line it quoted.
- **Oracle.** Proposal line ids per vendor.
- **Trace.** P1 · manual · `app/helpers/api/proposal_helper.rb:873-883` · `src/components/masterQcs/awardWithExcelDrawer/awardWithExcelDrawer.jsx`

#### API-XDBOQ-097 — Awarding a vendor with no valid BOQ bid crashes instead of saying so
- **Why it matters.** On BOQ the vendor's lines come from its bid; with no bid the list is nil and `nil - [...]` raises
  before the friendly 826 check.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A closed QA BOQ project; QA vendor B invited but did not bid.
- **Steps.** 1. `POST /proposal/<id>/add_response` naming vendor B.
- **Expected.** Should: HTTP 422, code 826 "Awarded vendor is not present in the latest stage" (or 715). Today (likely defect): HTTP 500.
- **Oracle.** Status/code.
- **Trace.** P1 · manual · `app/helpers/api/proposal_helper.rb:1084-1088`

#### API-XDBOQ-098 — With "close on partial BOQ", the first selected bid closes the whole stage
- **Why it matters.** `trade_request_close_on_partial_boq` closes the BOQ commercial stage as soon as one bid is selected —
  other vendors can no longer be awarded or negotiated on that stage. Without it, the stage closes only when every line is closed.
- **Setup.** gate: `boq_in_erfx_allowed` ON. Two QA companies or a toggle of `trade_request_close_on_partial_boq`; a BOQ stage with two vendors' bids.
- **Steps.** 1. Award vendor A and complete approval (bid selection). 2. Read the stage status.
- **Expected.** Setting ON: stage closed with closed_at now after the first selection. OFF: stays open until all lines closed.
- **Oracle.** Stage status/closed_at.
- **Trace.** P1 · manual · `app/controllers/concerns/bids_controller_helper.rb:1539,1628-1635`

#### API-XDBOQ-099 — BOQ reports keep "other charges" and skip the master QCS block
- **Why it matters.** The "remove other charges" setting deliberately does not apply to BOQ; the awarding report also omits
  the master QCS section for BOQ. Totals in BOQ reports therefore include other charges.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A QA company with `remove_other_charges` ON; one awarded BOQ project and one ordinary.
- **Steps.** 1. `GET /sheets/details` for both. 2. Download the awarding proposal report for both.
- **Expected.** BOQ: other charges present; no master QCS block in the awarding report. Ordinary: other charges removed; master QCS present.
- **Oracle.** Report contents.
- **Trace.** P2 · manual · `app/controllers/api/sheets_controller.rb:101-108` · `app/services/reporting_engine/master_qcs_report_v3.rb:47-48` · `app/data_models/awarding_proposal_report_data_model.rb:709`

#### API-XDBOQ-100 — The Excel award round trip produces the same award as the sheet
- **Why it matters.** Awarding with Excel is the only route to item-wise BOQ awards; the quantities in the uploaded sheet
  must be exactly what the proposal records.
- **Setup.** gate: `boq_in_erfx_allowed` ON; `allow_sheet_awarding` ON; `is_awarding_items_wise_in_boq_allowed` ON. A closed QA BOQ project with two vendors' bids.
- **Steps.** 1. `GET /reports/download_awarding_sheet/<project>`; poll `GET /reports/status/<report>`. 2. Fill awarded quantities.
  3. `POST /proposal {is_awarding_with_excel:true}`. 4. `POST /reports/upload_awarding_sheet/<proposal> {s3_url}`. 5. Read the proposal.
- **Expected.** Each vendor's awarded lines and quantities equal the sheet; quantities above the requested quantity are
  refused with code 561 "You cannot select bid with more than requested quantity.".
- **Oracle.** Proposal vs sheet.
- **Trace.** P1 · manual · `app/helpers/api/proposal_helper.rb:873-883` · `src/redux/orders/api.js:324-335`

## 11. Screens — creating a BOQ project and uploading the BOQ

#### UI-XDBOQ-001 — "BOQ based RFX Project" appears in New Event only when BOQ is allowed
- **Why it matters.** The menu item is the only door into BOQ; it must follow the company's BOQ permission (switch + an
  active BOQ template) in both directions.
- **Setup.** gate: `boq_in_erfx_allowed`. Two QA buyers: one in a workspace where it is ON, one where it is OFF; eRFX allowed in both.
- **Steps.** 1. Events page → open "New Event". 2. Read the menu items.
- **Expected.** ON: three items — "Single Stage", "eRFX Project", and "BOQ based RFX Project" ("Source BOQ via a project
  approach"). OFF: only the first two.
- **Oracle.** Menu item titles; the dashboard config `boq_in_erfx_allowed` from `/v1/dashboard_configuration`.
- **Trace.** P1 · automate · `src/views/orders/components/projectTable.jsx:187-193,205` · `src/redux/user/selectors.js:304-305`

#### UI-XDBOQ-002 — Choosing the BOQ project creates an empty BOQ draft and opens the BOQ template picker
- **Why it matters.** The draft is created on page load with the BOQ flag; the picker must then offer only BOQ templates.
- **Setup.** gate: `boq_in_erfx_allowed` ON; at least one BOQ template.
- **Steps.** 1. New Event → "BOQ based RFX Project". 2. Watch network calls. 3. Open the template picker.
- **Expected.** URL has `projectCreation=true&boqProject=true`; one `POST /event_groups` with `config.boq_based_rfx: true`;
  the picker requests `GET /templates?type_identifier=boq&hide_onboarding_v2_templates=true` and lists only BOQ templates.
  Banner: "Please choose a template and upload a BOQ sheet to proceed".
- **Oracle.** Network log; picker contents; banner text.
- **Trace.** P1 · automate · `src/views/orders/components/projectTable.jsx:147-153` · `src/views/projectCreation/projectCreation.jsx:3085-3093` · `src/views/eventCreation/templateSelection.jsx:444-446` · `src/views/eventCreation/eventCreation.jsx:110-111`

#### UI-XDBOQ-003 — An ordinary eRFX project never offers BOQ templates
- **Why it matters.** A BOQ template on an ordinary project produces a stage with tabs but a project that is not BOQ (mixed rules).
- **Setup.** gate: `boq_in_erfx_allowed` ON; a BOQ template and an ordinary template.
- **Steps.** 1. New Event → "eRFX Project". 2. Open the pricing-stage template picker.
- **Expected.** BOQ-labelled templates are absent.
- **Oracle.** Picker contents vs `GET /templates?type_identifier=trade` reply.
- **Trace.** P2 · automate · `src/views/eventCreation/templateSelection.jsx:126-131`

#### UI-XDBOQ-004 — A BOQ project hides the line-item controls an ordinary project has
- **Why it matters.** BOQ lines come only from the sheet; manual line editing would desynchronise the BOQ.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A new BOQ project draft.
- **Steps.** 1. Look at the project header and the technical (RFP) stage form. 2. Open stage configuration.
- **Expected.** No "Items" button/count; no "Line Items" section on the RFP stage; evaluation offers only "I'll do vendor
  wise evaluation" (no line-item-wise option); no AI RFP generator; no fast-bidding option.
- **Oracle.** Elements absent.
- **Trace.** P2 · automate · `src/views/projectCreation/projectCreation.jsx:3329` · `src/views/eventCreation/eventCreation.jsx:1942` · `src/views/eventCreation/components/configurations/configuration.jsx:142-143,202` · `src/views/eventCreation/helpers.js:1203`

#### UI-XDBOQ-005 — Upload Sheet modal: file types, disabled OK, and the BOQ sample download
- **Why it matters.** The sample must be the BOQ sample (`boq_items_sheet`), or the buyer fills the wrong layout.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A BOQ project with a BOQ template chosen.
- **Steps.** 1. Click "Upload Sheet". 2. Check OK before choosing a file. 3. Click "Download Template". 4. Open the file chooser.
- **Expected.** Title "Upload Excel"; OK disabled until a file is chosen; Download calls
  `GET /templates/excel_template/<template>?sheet_type=boq_items_sheet` and downloads the returned `excel_url`; the chooser
  accepts .csv, .xlsx, .xls.
- **Oracle.** Button state; network call; accept attribute.
- **Trace.** P1 · automate · `src/views/createOrder/uploadExcelModal.jsx:114,127,139-147` · `src/redux/orders/api.js:261-271`

#### UI-XDBOQ-006 — A good BOQ upload builds the tabbed grid and saves the lines to the project
- **Why it matters.** The upload is two calls (parse, then save lines). If the save fails silently the grid shows lines
  that the project does not have.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A BOQ project; a valid 2-tab sample sheet.
- **Steps.** 1. Upload the sheet. 2. Watch network calls. 3. Inspect the grid.
- **Expected.** `POST /templates/product_sheet_params` with `excel_type: "multistage"`, then `PATCH /event_groups/<id>` with
  the lines; toast "Product sheet updated"; tabs shown, section header rows (section number, widgets, description), line
  numbers like A.1, notes rows with a file icon.
- **Oracle.** Network order; grid rows vs sheet; project line count via `get_line_items` after a stage exists.
- **Trace.** P0 · automate · `src/redux/orders/actions.js:2049-2066` · `src/views/eventCreation/eventCreation.jsx:789-836` · `src/components/sheet/sheet.jsx:267-313`

#### UI-XDBOQ-007 — Rejected rows are listed under "View failed entries"
- **Why it matters.** Buyers fix uploads row by row; each failing cell must say why.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A sheet the server returns with `in_valid` rows (ordinary template-product
  sheet; for BOQ `in_valid` is normally empty — see API-XDBOQ-063).
- **Steps.** 1. Upload. 2. Click "View failed entries".
- **Expected.** "Failed to upload N entries." with "Click here"/"View failed entries"; a "Failed Entries" modal with each bad
  cell's error message as a tooltip.
- **Oracle.** N equals `in_valid.length`.
- **Trace.** P2 · automate · `src/views/eventCreation/productSheet/productSheet.jsx:245-259` · `src/views/createOrder/uploadErrorsModal.jsx:13-33`

#### UI-XDBOQ-008 — A section-numbering error from the server is shown as a toast
- **Why it matters.** The frontend has no BOQ-specific messages; the server's text is the only guidance the buyer gets.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A sheet starting at section "B".
- **Steps.** 1. Upload.
- **Expected.** Toast "Invalid section, current section B, expected section A, Please Add Valid one"; the grid is unchanged.
- **Oracle.** Toast text equals the API message (API-XDBOQ-057).
- **Trace.** P1 · automate · `src/redux/error/index.js:26-33` · `app/services/conversions/excel_to_json_conversion_service.rb:304-318`

#### UI-XDBOQ-009 — Re-uploading a BOQ replaces the existing one without any warning
- **Why it matters.** A re-upload deletes every line not in the new sheet (and resets draft awards). There is no confirm
  dialog; a buyer who uploads the wrong file loses the BOQ.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A BOQ project with an uploaded 3-line sheet.
- **Steps.** 1. Click "Upload Sheet" again and upload a 2-line sheet.
- **Expected (today).** No confirmation; the grid shows the 2 new lines; the 3 old ones are gone. Should: a "this will
  replace the current BOQ" confirmation. Record as a UX gap.
- **Oracle.** Grid; project lines.
- **Trace.** P1 · manual · `src/views/createOrder/uploadExcelModal.jsx:80-89` · `src/views/eventCreation/eventCreation.jsx:789-836` · `app/services/event_groups/update_service.rb:163-167`

#### UI-XDBOQ-010 — Publishing a BOQ over the line limit is blocked; exactly at the limit is allowed
- **Why it matters.** This is the only place the BOQ cap is enforced. 500 must pass, 501 must be blocked with the message.
- **Setup.** gate: `boq_in_erfx_allowed` ON; `allowed_maximum_line_items` default (BOQ 500). Two sheets: 500 and 501 priced lines.
- **Steps.** 1. Upload the 501-line sheet and try to publish. 2. Upload the 500-line sheet and publish.
- **Expected.** 501: publish blocked with "Maximum no of product addition reached". 500: publishes.
- **Oracle.** Error shown; publish request sent only for 500.
- **Trace.** P0 · automate · `src/views/projectCreation/helpers.js:369-374` · `src/views/projectCreation/projectCreation.jsx:1669-1671`

#### UI-XDBOQ-011 — A company-specific limit overrides the default
- **Why it matters.** Raising a customer to 1,000 BOQ lines is done by overriding `allowed_maximum_line_items.boq` for that
  company; the dashboard must use it.
- **Setup.** A QA company with `allowed_maximum_line_items` = `{boq: 1000, non_boq: 65}`. A 1,000-line and a 1,001-line sheet.
- **Steps.** 1. Publish each.
- **Expected.** 1,000 publishes; 1,001 shows "Maximum no of product addition reached".
- **Oracle.** As above.
- **Trace.** P1 · manual · `src/redux/user/index.js:392,501` · `src/redux/user/selectors.js:346-360`

#### UI-XDBOQ-012 — A limit config with only one key disables the other limit
- **Why it matters.** If the override is `{boq: 1000}` (no `non_boq`), the selector returns `nonBoq: undefined`, and
  `count > undefined` is always false — ordinary events lose their limit entirely. Missing config falls back to 500/65.
- **Setup.** A QA company with `allowed_maximum_line_items` = `{boq: 1000}` only.
- **Steps.** 1. Create an ordinary event with 70 lines and publish.
- **Expected (today).** Publishes (no limit). Should: fall back to 65 for the missing key.
- **Oracle.** Publish succeeds with 70 lines.
- **Trace.** P2 · manual · `src/redux/user/selectors.js:346-360`

#### UI-XDBOQ-013 — Recreate Event counts lines differently from create
- **Why it matters.** Create and live edit compare `data.length - 1` (the sheet has a trailing empty row); Recreate compares
  `data.length`, so a BOQ of exactly the limit is refused on recreate. One hard-coded company is exempt in three places.
- **Setup.** gate: `boq_in_erfx_allowed` ON; default limit 500. A closed QA BOQ event with exactly 500 lines.
- **Steps.** 1. Recreate the event from its menu and continue.
- **Expected (today).** "You can have at max 500 line-items in an event" although the original had 500. Should: same rule as create.
- **Oracle.** Error shown.
- **Trace.** P2 · manual · `src/components/orderRecreation/orderRecreation.jsx:417-425` · `src/views/createOrder/createOrder.jsx:1289-1297`

## 12. Screens — the BOQ grid, bidding and awarding

#### UI-XDBOQ-014 — The BOQ sheet grid: no row delete, no pagination, line numbers from the BOQ
- **Why it matters.** BOQ rows must keep their identity; deleting or auto-filling single rows would break section totals.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A BOQ project with an uploaded 2-tab sheet.
- **Steps.** 1. Inspect the sheet grid on the create screen.
- **Expected.** Tabs at the top (first auto-selected, hidden tabs skipped); row numbers shown as the BOQ line numbers; no
  delete-row column; no pagination; no drag-to-fill; product cell is plain text; quantities show value + unit.
- **Oracle.** DOM checks.
- **Trace.** P2 · automate · `src/components/sheet/sheet.jsx:247,761,1113-1136,1865-1878,2276-2282,2335` · `src/views/eventCreation/productSheet/sheetTabs.jsx`

#### UI-XDBOQ-015 — Comparison grid for a BOQ: Event Summary first, tab totals, section rows with notes
- **Why it matters.** Buyers compare BOQ bids by tab and section totals; the summary tab must agree with the API totals.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A live BOQ project with two QA vendors' bids.
- **Steps.** 1. Open the comparison/QCS. 2. Switch tabs. 3. Toggle notes on a section.
- **Expected.** First tab "Event Summary" with one row per tab/section and each vendor's total; each tab ends with a
  "<tab> Total" row; section rows show number, title and widgets with "Hide Notes"/"Show Notes"; "Other Charges" rows hidden
  on tabs; a tab with a pending task shows a red info icon. Totals equal `quote_summary` (API-XDBOQ-091), rounded for display.
- **Oracle.** Grid totals vs API.
- **Trace.** P1 · automate · `src/components/dataGrid/formatters/comparisonTabFormatter.jsx:24` · `src/components/dataGrid/comparisonGrid/helpers.jsx:112-152,363-430,612,1079-1103` · `src/utils/comparisonHelpers.js:8-61`

#### UI-XDBOQ-016 — Switching tabs pages the quote by tab
- **Why it matters.** Large BOQs are fetched per tab and page; a wrong tab index shows another tab's rows (API-XDBOQ-081).
- **Setup.** gate: `boq_in_erfx_allowed` ON. A BOQ stage with 3 tabs and one vendor bid.
- **Steps.** 1. Open the vendor's quote. 2. Switch to tab 3 and scroll.
- **Expected.** Requests `GET /v1/trade/<stage>/quote_details/<bid>?tab=<index>&page=<n>` with the selected tab's index;
  rows shown belong to tab 3 only.
- **Oracle.** Network params; row line numbers.
- **Trace.** P2 · automate · `src/redux/orders/api.js:78-87` · `src/redux/orders/actions.js:824-835` · `src/views/orderDetails/orderDetails.jsx:1204-1206`

#### UI-XDBOQ-017 — The buyer's surrogate bid upload for BOQ
- **Why it matters.** Buyers enter offline BOQ quotes on a vendor's behalf; the upload button follows a company setting.
- **Setup.** gate: `boq_in_erfx_allowed` ON; `is_bid_sheet_upload_enabled` ON (and a second QA company with it OFF). A live BOQ stage.
- **Steps.** 1. Open "Add Bid" for the QA vendor. 2. Download the template. 3. Upload it filled.
- **Expected.** ON: "Upload Excel" shown; download calls `GET /v1/trade/<stage>/download_event_details?company_uuid=…`;
  the upload accepts only .xlsx/.xls, calls `POST /v1/trade/<stage>/upload_bid_excel` and shows "Excel Uploaded
  Successfully"; prices fill the drawer but no bid is placed until "Place bid" ("Bid placed on behalf of <vendor>"). OFF: no Upload Excel button.
- **Oracle.** Button presence; network; bid count before/after.
- **Trace.** P1 · automate · `src/views/orderDetails/addBidDrawer.jsx:600-603` · `src/views/orderDetails/uploadBidExcelModal.jsx:12-13,72` · `src/redux/orders/api.js:348-369`

#### UI-XDBOQ-018 — A partial surrogate BOQ bid is allowed unless the stage closes as a lot
- **Why it matters.** Matches the server (API-XDBOQ-089): required fields are only enforced on rows with a price, unless lot closing.
- **Setup.** gate: `boq_in_erfx_allowed` ON. Two live BOQ stages: line-item closing and lot closing.
- **Steps.** 1. In "Add Bid", price only 2 of 5 lines and place the bid on each stage.
- **Expected.** Line-item closing: accepted. Lot closing: blocked by the drawer's validation. At least one priced row is always required.
- **Oracle.** Validation message; bid created or not.
- **Trace.** P2 · automate · `src/components/sheet/helper.js:9-70`

#### UI-XDBOQ-019 — Awarding a BOQ is vendor-level only
- **Why it matters.** The server widens any BOQ award to the whole BOQ (API-XDBOQ-095); the screen must not pretend
  otherwise by offering line selection.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A closed BOQ project with two vendors' bids.
- **Steps.** 1. Start Awarding (manual). 2. Try to select individual lines. 3. Submit with no vendor selected.
- **Expected.** No per-line selection; vendor columns say "Select for awarding"/"Awarded"; no "Select All"; submitting
  empty shows "Please award for at least one Vendor"; the request is `POST /proposal/<id>/add_response?lot_no=…` without line ids.
- **Oracle.** UI elements; request body.
- **Trace.** P1 · automate · `src/views/awardingFlow/awardingQCS.jsx:272,384,428,461,482` · `src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:988,1545-1556`

#### UI-XDBOQ-020 — "Awarding with Excel" appears for BOQ when sheet awarding is allowed
- **Why it matters.** It is the only item-wise route for BOQ (API-XDBOQ-096); its steps and messages must be clear.
- **Setup.** gate: `boq_in_erfx_allowed` ON; `allow_sheet_awarding` ON. A closed BOQ project.
- **Steps.** 1. Click "Start Awarding". 2. Choose "Awarding with Excel". 3. Download, then upload a filled sheet and submit.
  4. On the awarding page, click "Discard Proposal".
- **Expected.** Dropdown "Manual Award" / "Awarding with Excel"; drawer "Upload File" with "Download the Awarding sheet" and
  "Upload filled sheet"; toasts "Generating template", "Report is ready for download", "File uploaded successfully",
  "Awarding sheet submitted successfully"; submitting without a file: "Please upload a file before submitting"; the
  awarding page tag "Awarding is done via the award sheet. To change it, upload a revised sheet."; discard → "Draft proposal discarded".
- **Oracle.** Texts and network sequence.
- **Trace.** P1 · automate · `src/components/masterQcs/masterQcs.jsx:405-416,949-991` · `src/components/masterQcs/awardWithExcelDrawer/awardWithExcelDrawer.jsx` · `src/views/awardingFlow/awardingQCS.jsx:355-366,661-672`

#### UI-XDBOQ-021 — Controls hidden on a BOQ event
- **Why it matters.** These features have no BOQ meaning (or break with tabs); they must stay hidden.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A live BOQ event and an ordinary one.
- **Steps.** 1. Compare the event header, action bar, create footer and auction configuration.
- **Expected.** On BOQ: no "View by" dropdown, no Price Trends tab, no bidding/default currency toggle, no Savings footer
  button on create, no basket-auction config, no auction strategy tabs (unless a service template).
- **Oracle.** Elements present on ordinary, absent on BOQ.
- **Trace.** P2 · automate · `src/views/orderDetails/actionBar.jsx:102` · `src/views/orderDetails/eventHeader.jsx:416,825` · `src/views/eventCreation/components/footer/footer.jsx:171` · `src/views/eventCreation/components/configurations/configuration.jsx:253` · `auctionConfiguration.jsx:841`

#### UI-XDBOQ-022 — The BOQ report is offered only for BOQ events
- **Why it matters.** The BOQ report has its own fixed format; offering it elsewhere produces empty files.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A BOQ event and an ordinary event.
- **Steps.** 1. Open "Download Report" on each.
- **Expected.** "BOQ Report" listed only on the BOQ event, with its format selector disabled.
- **Oracle.** Report list.
- **Trace.** P2 · automate · `src/components/downloadReportDrawer/downloadReportDrawer.jsx:236-241,571`

#### UI-XDBOQ-023 — No line-item delete in a BOQ project's details
- **Why it matters.** Deleting one BOQ line by hand bypasses the sheet; on the API side even one-line deletes reach the
  unscoped deletion path (API-XDBOQ-031).
- **Setup.** gate: `boq_in_erfx_allowed` ON. A BOQ project and an ordinary project.
- **Steps.** 1. Open project details → line items → row menu.
- **Expected.** "Delete" absent on BOQ, present on ordinary.
- **Oracle.** Menu items.
- **Trace.** P2 · automate · `src/redux/project/tableHelpers.jsx:50-51`

#### UI-XDBOQ-024 — Convert to auction and new version keep the BOQ context
- **Why it matters.** Both flows reopen the creation screen; losing `boqProject=true` there turns a BOQ auction into an ordinary one.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A closed BOQ RFQ project.
- **Steps.** 1. "Convert to auction". 2. Back, then "Create new version".
- **Expected.** Both navigations carry `boqProject=true`; the screens show the BOQ grid (tabs), not the line-item form.
- **Oracle.** URL; grid.
- **Trace.** P2 · automate · `src/views/orderDetails/eventHeader.jsx:312,1171` · `src/views/projectDetails/projectDetails.jsx:327,408`

#### UI-XDBOQ-025 — BOQ PRs cannot be put in the cart with other PRs
- **Why it matters.** One BOQ PR becomes one BOQ project; mixing would create a project with two BOQs or a BOQ plus material lines.
- **Setup.** gate: `boq_in_erfx_allowed` ON. Two QA BOQ PRs and one QA material PR.
- **Steps.** 1. Select both BOQ PRs → purchase. 2. Select one BOQ + the material PR → purchase.
- **Expected.** 1: "Multiple BOQ-based PR cannot be purchased together". 2: "BOQ-based PR cannot pe purchased along with
  <type> PR" (note the typo "pe" — log it).
- **Oracle.** Messages.
- **Trace.** P2 · automate · `src/views/purchaseRequisitions/purchaseRequisitions.jsx:551,555`

#### UI-XDBOQ-026 — Marking a template as BOQ hides the delivery-location column
- **Why it matters.** BOQ lines use a "Free Text" location created by the upload; a buyer-hub column would demand a real location per line.
- **Setup.** A QA buyer with template permissions.
- **Steps.** 1. Templates → new pricing template. 2. Tick "BOQ". 3. Save; open the template list.
- **Expected.** The buyer_hub widget disappears when BOQ is ticked; the list labels the template "BOQ"; after saving, the
  company's `boq_in_erfx_allowed?` can become true (if the switch is set).
- **Oracle.** Widget list; label.
- **Trace.** P2 · automate · `src/views/templatesAuction/templateCategories.jsx:16-17,42-48` · `src/views/templatesAuction/templateList.jsx:46-47`

#### UI-XDBOQ-027 — Editing the sheet of a live BOQ event respects the limit
- **Why it matters.** Live edits are allowed for BOQ (even after close on the API side); the line limit must still apply.
- **Setup.** gate: `boq_in_erfx_allowed` ON; default limit 500. A live BOQ event with 499 lines.
- **Steps.** 1. Edit the event sheet and add two lines; save.
- **Expected.** "You can have at max 500 line-items in an event"; nothing saved.
- **Oracle.** Message; stage unchanged.
- **Trace.** P2 · automate · `src/views/orderDetails/eventDetails.jsx:713-722`

#### UI-XDBOQ-028 — A BOQ project from a PR keeps the PR's template and lets the sheet be edited
- **Why it matters.** A BOQ PR fixes the template (it carries the BOQ sheet); the sheet must still be editable before publish.
- **Setup.** gate: `boq_in_erfx_allowed` ON. A QA BOQ PR with an attached BOQ sheet.
- **Steps.** 1. Convert the PR into a project. 2. Try to change the template. 3. Edit a quantity in the sheet.
- **Expected.** The template selector is locked; the sheet is unlocked and editable; on publish the PR is linked (API-XDBOQ-039).
- **Oracle.** Selector state; PR mapping after publish.
- **Trace.** P2 · manual · `src/views/eventCreation/eventCreation.jsx:441-442` · `src/views/eventCreation/productSheet/productSheet.jsx:172-179`
