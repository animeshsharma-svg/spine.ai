# Events — API test cases

The same journey as [events-ui.md](events-ui.md), driven straight at the backend: create
a draft event group, hang stages off it, activate, let a vendor bid, let the buyer bid
for a vendor, award. Plus everything the UI can never reach — the authorization matrix,
the malformed payloads, and the idempotency of every write.

Read [README.md](README.md) first for the case format and the priority scale.

**Two things to know before the first case.**

An event is **two objects, created by two calls**. `POST /api/event_groups` creates the
container and its line items and *never* creates a stage — `CreateService` writes only
the `EventGroup` and its `EventGroupLineItem` rows. Stages are separate
`TradeRequest`s, created by `POST /trade/template_input` and linked back through
`event_group_id`. Activation is a third call, `PATCH /api/event_groups/:id` with
`status: "active"` and the stage uuids in `draft_trade_request_uuids`. A test that
expects one call to produce a whole event is testing something that does not exist.

**Failures come back as `{code, message}` with a 422**, through `render_error_json`.
That convention is itself an assertion: an untyped `{"status":500,"error":"Internal
Server Error"}` is, by definition, an unhandled exception. Several cases below assert
the *shape* of the failure for exactly that reason.

Where a case corresponds to one already in
`prototype/knowledge/events/backend-test-cases.json`, the trace line names it
(`≈ BE-2.2`) so the two catalogs stay reconcilable rather than diverging.

**Contents**

1. [Auth and session](#1-auth-and-session)
2. [Creating the draft event group](#2-creating-the-draft-event-group)
3. [Creating stages, per rfx_mode](#3-creating-stages)
4. [Activation — the publish call](#4-activation)
5. [Line items](#5-line-items)
6. [Audience and participants](#6-audience-and-participants)
7. [The vendor's technical response](#7-the-vendors-technical-response)
8. [The vendor's bid](#8-the-vendors-bid)
9. [Surrogate bids](#9-surrogate-bids)
10. [RFQ → Auction conversion](#10-rfq--auction-conversion)
11. [Awarding](#11-awarding)
12. [Lifecycle — withdraw, clone, amend, ownership](#12-lifecycle)
13. [The authorization matrix](#13-the-authorization-matrix)
14. [Data validation and robustness](#14-data-validation-and-robustness)
15. [Persistence — database oracles](#15-persistence)
16. [Non-functional](#16-non-functional)

---

## 1. Auth and session

Short section. It exists so that a suite failing on a stale token says so in one line.

#### API-AUTH-001 — OTP login returns a usable session for a buyer
- **Why it matters.** Every case after this one depends on it, and the two-step
  generate/verify shape is easy to get wrong.
- **Setup.** A buyer phone/email with a known test OTP.
- **Steps.** `POST /v1/generate_otp`, then `POST /v1/verify_otp` with the code.
- **Expected.** 200 with a session/token the subsequent calls accept.
- **Oracle.** A following authenticated read succeeds with the returned credential.
- **Trace.** P0 · automate · `tests/auth.spec.ts`

#### API-AUTH-002 — A wrong OTP is refused
- **Why it matters.** "Invalid OTP" (6) must be a refusal, not a 500, and not a
  success.
- **Steps.** Verify with a wrong code.
- **Expected.** 422 with code 6.
- **Oracle.** No session issued.
- **Trace.** P1 · automate

#### API-AUTH-003 — The stored session is reused across the suite
- **Why it matters.** Re-authenticating per test triples the run and invites OTP rate
  limits.
- **Setup.** A saved auth state.
- **Steps.** Run two specs back to back.
- **Expected.** Both use the stored session; no second OTP request.
- **Oracle.** One auth exchange per run.
- **Trace.** P1 · automate · `tests/auth.setup.ts`

#### API-AUTH-004 — An expired or absent token is refused everywhere
- **Why it matters.** An endpoint that answers unauthenticated is the worst possible
  finding, and it must be checked on writes as well as reads.
- **Steps.** Call `GET /api/event_groups`, `POST /api/event_groups` and
  `POST /v1/bids` with no credential and with a corrupted one.
- **Expected.** All refused.
- **Oracle.** Nothing created by the write attempts.
- **Trace.** P0 · automate

#### API-AUTH-005 — The dashboard configuration reports the tenant's real capabilities
- **Why it matters.** It is the source the gating decisions read; if it lies, every
  gated case is decided wrongly.
- **Steps.** `GET /v1/dashboard_configuration`.
- **Expected.** Flags and module permissions matching the tenant.
- **Oracle.** Spot-check three flags against observed endpoint behaviour.
- **Trace.** P1 · automate · `master/config.ts`

#### API-AUTH-006 — A vendor session cannot call buyer endpoints
- **Why it matters.** The two apps share an identity layer; the authorization boundary
  is the only separation.
- **Setup.** A vendor session.
- **Steps.** Call `POST /api/event_groups`.
- **Expected.** Refused.
- **Oracle.** No event group created.
- **Trace.** P0 · automate-later

#### API-AUTH-007 — A user from company B cannot read company A's event
- **Why it matters.** Cross-tenant isolation at the API layer, where it actually lives.
- **Setup.** An event in company A; a session in company B.
- **Steps.** `GET /api/event_groups/:id` for A's event.
- **Expected.** Refused (not an empty 200).
- **Oracle.** No event payload in the response body.
- **Trace.** P0 · automate-later

#### API-AUTH-008 — Multi-company users act in exactly one workspace at a time
- **Why it matters.** A user attached to several companies is a real configuration, and
  ambiguity here writes data into the wrong tenant.
- **Setup.** gate: multi-company user. A user in two companies.
- **Steps.** Select company A, create a draft; select company B, list events.
- **Expected.** The draft belongs to A and is absent from B's listing.
- **Oracle.** `company_id` on the created event group equals A. Also verify in the
  database (see API-DB-002).
- **Trace.** P0 · automate-later · multi-company-user-feature.md

---

## 2. Creating the draft event group

`POST /api/event_groups` — the container. Everything here is about what it accepts,
what it refuses, and what it deliberately does *not* do.

#### API-EG-001 — A draft with valid line items is created
- **Why it matters.** The base case; every flow in this file starts here.
- **Steps.** `POST /api/event_groups` with `status: "draft"`, a title, and one line item
  (`product_id`, `quantity: {value, unit}`).
- **Expected.** 200, an event group with one line-item id, status draft.
- **Oracle.** `event_group_line_item_ids.length == 1`; `status == "draft"`.
- **Trace.** P0 · automate · ≈ BE-1.1 · `flows/createEvent.ts`

#### API-EG-002 — A missing status is refused
- **Why it matters.** `status` drives every downstream branch, so it is required rather
  than defaulted.
- **Steps.** Omit `status`.
- **Expected.** 422, code 2 "Insufficient parameters".
- **Oracle.** No event group created.
- **Trace.** P0 · automate · ≈ BE-1.2

#### API-EG-003 — Blank line items are refused on a non-BOQ create
- **Why it matters.** An event with nothing to bid on is meaningless, and the rule is
  conditional on the BOQ flag — which makes it worth two cases.
- **Steps.** `POST` with `line_items: []` and no `config.boq_based_rfx`.
- **Expected.** 422, code 2.
- **Oracle.** No event group created.
- **Trace.** P0 · automate · ≈ BE-1.3

#### API-EG-004 — A BOQ-based create succeeds with empty line items
- **Why it matters.** The one legal empty-items create, and the flag is what makes it
  legal.
- **Setup.** A workspace with BOQ-in-eRFX allowed.
- **Steps.** `POST` with `config.boq_based_rfx: true` and `line_items: []`.
- **Expected.** 200, event group created with no line items.
- **Oracle.** Created; zero line-item ids.
- **Trace.** P1 · automate · ≈ BE-1.4

#### API-EG-005 — A BOQ-based create is refused where the workspace forbids it
- **Why it matters.** Without the negative half, the gate is unproven — and a leak here
  lets an event exist with no items on a tenant that cannot handle it.
- **Setup.** A workspace without BOQ-in-eRFX.
- **Steps.** Same body as API-EG-004.
- **Expected.** 422, code 101.
- **Oracle.** Nothing created.
- **Trace.** P1 · automate · ≈ BE-1.5

#### API-EG-006 — A dormant-locked PR line item blocks the create before any write
- **Why it matters.** It has its own error shape (a dedicated dormant-PR renderer, not
  `render_error_json`), and the guard runs before the transaction — so a partial event
  must be impossible.
- **Setup.** A PR line item under a dormant lock.
- **Steps.** `POST` referencing it via `line_items[].pr_line_item_id`.
- **Expected.** A dormant-PR error response.
- **Oracle.** No event group **and** no line items in the database.
- **Trace.** P1 · automate-later · ≈ BE-1.6 · `create_service.rb:102-123`

#### API-EG-007 — A caller without trade create-record permission is refused
- **Why it matters.** The one authorization gate on this endpoint, and it is
  team-based.
- **Setup.** A user whose teams lack `trade: create_record`.
- **Steps.** `POST /api/event_groups`.
- **Expected.** Refused.
- **Oracle.** Nothing created.
- **Trace.** P0 · automate · ≈ BE-1.7

#### API-EG-008 — Title, description and attachments pass through unchanged
- **Why it matters.** They are stored verbatim; a transform here would be invisible
  until a vendor read it.
- **Steps.** `POST` with all three set. Read the event group back.
- **Expected.** Identical values.
- **Oracle.** Field-by-field equality on the read.
- **Trace.** P1 · automate · ≈ BE-1.8

#### API-EG-009 — Two line items get serial numbers 1 and 2
- **Why it matters.** Serial numbers order the sheet and the award; duplicates or gaps
  scramble both.
- **Steps.** `POST` with two line items.
- **Expected.** Serials 1 and 2, in the order sent.
- **Oracle.** Serial values and their order.
- **Trace.** P1 · automate · ≈ BE-1.9

#### API-EG-010 — The create response never contains a stage
- **Why it matters.** It is the structural fact the whole flow depends on. If a stage
  ever appeared here, the two-call model would have changed and every flow would need
  rewriting.
- **Steps.** `POST` and inspect the response.
- **Expected.** No `trade_request` / stage in the payload.
- **Oracle.** No stage key present; `stages` empty or absent.
- **Trace.** P0 · automate · ≈ BE-1.10 · `create_service.rb:33-65`

#### API-EG-011 — A model validation failure surfaces the model's own message
- **Why it matters.** Code 15 "Operation failed" alone is useless; the endpoint
  overrides the message with the model's first error for a reason.
- **Setup.** A payload that saves but fails `valid?`.
- **Steps.** `POST`.
- **Expected.** 422 code 15 whose message is the model's error text.
- **Oracle.** Message is not the literal "Operation failed".
- **Trace.** P1 · automate-later · ≈ BE-1.11

#### API-EG-012 — Malformed line items are refused, not coerced
- **Why it matters.** PRD §5's "never a 500, never a silent partial save".
- **Steps.** `POST` with `line_items` as a string, then as an object, then as an array
  of strings.
- **Expected.** 4xx each time, with a readable message.
- **Oracle.** No 500; nothing created.
- **Trace.** P0 · automate · ≈ BE-1.12

#### API-EG-013 — A line item with a non-existent product is refused
- **Why it matters.** A dangling product id produces an event nobody can bid on.
- **Steps.** `POST` with a product id that does not exist.
- **Expected.** Refused with a product error.
- **Oracle.** Nothing created.
- **Trace.** P1 · automate

#### API-EG-014 — A line item with a product from another company is refused
- **Why it matters.** It is a cross-tenant read dressed up as a create.
- **Steps.** `POST` with company B's product id from company A's session.
- **Expected.** Refused.
- **Oracle.** Nothing created; no cross-company row.
- **Trace.** P0 · automate-later

#### API-EG-015 — A zero or negative quantity is refused
- **Why it matters.** PRD §5, at the layer that actually persists it.
- **Steps.** `POST` with `quantity.value` of `0`, then `-5`.
- **Expected.** Refused both times.
- **Oracle.** Nothing created.
- **Trace.** P0 · automate · PRD §5

#### API-EG-016 — A non-numeric quantity is refused rather than coerced
- **Why it matters.** A coerced `"abc" → 0` line item is a silently broken event.
- **Steps.** `POST` with `quantity.value: "abc"`.
- **Expected.** Refused.
- **Oracle.** No line item with quantity 0. ≈ BE-3.8's create-side twin.
- **Trace.** P0 · automate

#### API-EG-017 — A missing quantity unit is refused
- **Why it matters.** Without a unit, a quantity cannot be compared against a bid, and
  the bid-side check (512) assumes the event has one.
- **Steps.** `POST` with `quantity: {value: 10}`.
- **Expected.** Refused.
- **Oracle.** Nothing created.
- **Trace.** P1 · automate-later

#### API-EG-018 — 65 line items are accepted on a non-BOQ create
- **Why it matters.** The documented cap, at the API layer where the UI's message does
  not exist.
- **Steps.** `POST` with 65 line items.
- **Expected.** 200 with 65 line-item ids.
- **Oracle.** Count is exactly 65.
- **Trace.** P1 · automate-later

#### API-EG-019 — 501 BOQ line items are refused
- **Why it matters.** The other cap, and the case that shows whether the limit is
  enforced server-side or only in the browser.
- **Setup.** A BOQ-allowed workspace.
- **Steps.** `POST` with 501 line items.
- **Expected.** Refused.
- **Oracle.** Nothing created — a UI-only limit would show as a 200 here, which is the
  finding.
- **Trace.** P1 · automate-later · PRD §6

#### API-EG-020 — A created event group is assigned a reference id
- **Why it matters.** `add_ref_id` runs `after_create_commit` via `update_columns`,
  bypassing validations and callbacks — a path where a failure is easy to miss.
- **Steps.** `POST`, then read the event group back.
- **Expected.** A `RFX-…` reference id.
- **Oracle.** Ref id present and unique. Confirm in the database (API-DB-003).
- **Trace.** P1 · automate · `event_group.rb:115`

---

## 3. Creating stages

`POST /trade/template_input` — one call per stage, each with its own `rfx_mode`,
schedule and (for non-eRFX) audience. This is where the event types actually come from:
`rfx_mode` is `{auction: 0, rfq: 1, rfq_then_auction: 2, offline_trade: 3, rfi: 4,
rfp: 5}`.

#### API-STG-001 — An RFQ stage is created against a draft event group
- **Why it matters.** The most common stage, and the one every bid case needs.
- **Steps.** `POST /trade/template_input` with `rfx_mode: rfq`, `event_group_id`,
  `trade_products`, `bid_start_time`, `bid_end_time`, `status: "draft"`.
- **Expected.** 200 with a trade uuid linked to the event group.
- **Oracle.** The trade's `event_group_id` matches; `rfx_mode` is rfq.
- **Trace.** P0 · automate · `flows/createEvent.ts`

#### API-STG-002 — An auction stage is created with a rank strategy
- **Why it matters.** The default auction shape, and the strategy travels in nested
  `configurations` rather than at the top level — easy to send in the wrong place.
- **Steps.** `POST` with `rfx_mode: auction` and a rank auction config.
- **Expected.** Created with `auction_config` rank.
- **Oracle.** Strategy on the created trade is rank.
- **Trace.** P0 · automate

#### API-STG-003 — An auction stage is created with a price strategy
- **Why it matters.** The second strategy, to prove the config is read rather than
  defaulted.
- **Steps.** As above with a price config.
- **Expected.** Created with price.
- **Oracle.** Strategy is price, not rank.
- **Trace.** P1 · automate

#### API-STG-004 — A technical (RFP) stage is created without trade products
- **Why it matters.** `trade_products` is required *unless* the stage is RFI/RFP. The
  exemption is the case worth proving; sending products anyway is how RFP stages end up
  looking like pricing stages.
- **Steps.** `POST` with `rfx_mode: rfp`, a technical template and an evaluator, no
  `trade_products`.
- **Expected.** Created.
- **Oracle.** Stage created with rfx_mode rfp and no trade products.
- **Trace.** P0 · automate

#### API-STG-005 — A pricing stage without trade products is refused
- **Why it matters.** The other side of the same rule ("Product not found", 80).
- **Steps.** `POST` with `rfx_mode: rfq` and no `trade_products`.
- **Expected.** 422, code 80.
- **Oracle.** No stage created.
- **Trace.** P1 · automate

#### API-STG-006 — An RFI stage is created
- **Why it matters.** `rfi` is in the enum but not in `STANDARD_STAGES_SEQUENCE` and has
  no UI on this build, so the API is the only way to prove it works — or that it does
  not.
- **Steps.** `POST` with `rfx_mode: rfi`.
- **Expected.** Created; it uses generic `bidding_time` schedules rather than
  rfq/auction ones.
- **Oracle.** Stage created; its schedule type is `bidding_time`.
- **Trace.** P2 · automate-later

#### API-STG-007 — An offline-trade stage is created where the tenant allows it
- **Why it matters.** It is a legitimate event type with no bidding window semantics,
  and it is also excluded from stage ordering.
- **Setup.** gate: offline trade enabled.
- **Steps.** `POST` with `rfx_mode: offline_trade`.
- **Expected.** Created.
- **Oracle.** Stage created; surrogate/bid behaviour differs (see API-SUR-003).
- **Trace.** P2 · automate-later

#### API-STG-008 — A stage in a `sell`-mode workspace is refused
- **Why it matters.** The first guard on this endpoint, and it fails before anything
  else is validated.
- **Setup.** A workspace with `trade_mode == "sell"`.
- **Steps.** `POST /trade/template_input`.
- **Expected.** 422, code 101.
- **Oracle.** No stage created.
- **Trace.** P2 · automate-later

#### API-STG-009 — A product not allowed for the workspace is refused
- **Why it matters.** Allowed-products validation runs before existence checks, so its
  own error code matters.
- **Steps.** `POST` with a product outside the allowed set.
- **Expected.** Refused with the specific allowed-products error.
- **Oracle.** No stage created; the code is not the generic 80.
- **Trace.** P2 · automate-later

#### API-STG-010 — A non-existent product is refused with "Product not found"
- **Why it matters.** The existence check, distinct from the allowed check.
- **Steps.** `POST` with a fabricated product id.
- **Expected.** 422, code 80.
- **Oracle.** No stage created.
- **Trace.** P1 · automate

#### API-STG-011 — Too many attachments on a stage are refused
- **Why it matters.** Code 489 with a readable message, and it is a cheap DoS vector if
  unbounded.
- **Steps.** `POST` with attachments beyond the limit.
- **Expected.** 422, code 489.
- **Oracle.** No stage created.
- **Trace.** P2 · automate-later

#### API-STG-012 — Knockout combined with a basket auction is refused
- **Why it matters.** An explicitly forbidden configuration (474), and forbidden
  combinations are exactly what an API-level suite should hold.
- **Steps.** `POST` with a knockout auction config and basket auction on.
- **Expected.** 422, code 474.
- **Oracle.** No stage created.
- **Trace.** P1 · automate-later

#### API-STG-013 — A dutch auction combined with a basket auction is refused
- **Why it matters.** Same guard, other strategy.
- **Steps.** `POST` with dutch + basket.
- **Expected.** 422, code 474.
- **Oracle.** No stage created.
- **Trace.** P2 · automate-later

#### API-STG-014 — A stage always gets a bidding-time schedule row
- **Why it matters.** This row is the one the activation path dereferences unguarded.
  Its existence at creation is the single most load-bearing fact in this file.
- **Steps.** `POST` with `bid_start_time` and `bid_end_time` as epoch seconds. Read the
  stage's schedules.
- **Expected.** A `TradeSchedule` in the bidding-time family with both times set.
- **Oracle.** Verify in the database, not only in the response — the response can
  echo times the row does not have. Pairs with API-PUB-002.
- **Trace.** P0 · automate · `trade_controller_helper.rb:494-527`

#### API-STG-015 — A stage created with no bid_end_time fails at creation, not later
- **Why it matters.** `trade_schedules.end_time` is `NOT NULL` in the database, so this
  either fails here with a constraint error or — worse — creates a stage with no
  schedule that explodes at activation.
- **Steps.** `POST` omitting `bid_end_time`.
- **Expected.** Refused at creation with a readable error.
- **Oracle.** No stage created **and** no schedule row. A 200 here is the finding: it
  means the failure has been deferred to activation.
- **Trace.** P0 · automate · ≈ BE-10.3

#### API-STG-016 — An end time before the start time is refused
- **Why it matters.** `TradeSchedule` has **no Rails validations at all**, so
  chronology is only enforced by callers. That makes this a genuine hole worth probing.
- **Steps.** `POST` with `bid_end_time < bid_start_time`.
- **Expected.** Refused.
- **Oracle.** No stage created. If it is accepted, record the inverted window as a
  finding and check what the vendor's portal does with it.
- **Trace.** P0 · automate-later · `trade_schedule.rb`

#### API-STG-017 — An eRFX stage does not take its audience at creation
- **Why it matters.** `audience_company_ids` is applied here only when `event_group_id`
  is nil. An eRFX stage gets its audience at activation instead — so a test that invites
  vendors here and then asserts they are on the stage is asserting the wrong step.
- **Steps.** `POST` with both `event_group_id` and `audience_company_ids`.
- **Expected.** Created; no audience rows yet.
- **Oracle.** Audience count on the stage is 0 before activation.
- **Trace.** P1 · automate · `trade_controller.rb:180-183`

#### API-STG-018 — A non-eRFX stage does take its audience at creation
- **Why it matters.** The other branch, and it is how the classic single-stage events
  in UI §14 get their participants.
- **Steps.** `POST` with `audience_company_ids` and no `event_group_id`.
- **Expected.** Created with the audience applied.
- **Oracle.** Audience count matches the request.
- **Trace.** P1 · automate

#### API-STG-019 — A non-eRFX stage created with status active goes live directly
- **Why it matters.** The baseline contrast case: this path worked throughout the eRFX
  activation regression, which is what proved the fault was specific to the event-group
  update.
- **Steps.** `POST` with `status: "active"`, no event group.
- **Expected.** 200; the stage is live and biddable.
- **Oracle.** Stage status active; a vendor bid on it is accepted.
- **Trace.** P0 · automate · ≈ BE-10.1

#### API-STG-020 — A knockout or dutch stage created active publishes inline
- **Why it matters.** Those two modes call `publish_auction` immediately at creation;
  **every other mode does not**. That asymmetry is a prime suspect for activation-path
  bugs and needs to be pinned.
- **Steps.** `POST` a knockout auction with `status: "active"`.
- **Expected.** Created and published in the same call.
- **Oracle.** The auction's schedule and state reflect a published auction. Contrast
  with API-STG-021.
- **Trace.** P1 · automate-later · ≈ BE-10.2 · `trade_controller.rb:271-274`

#### API-STG-021 — A plain auction created active does not publish inline
- **Why it matters.** It documents the asymmetry rather than assuming symmetry — and it
  is the difference that makes the activation path load-bearing at all.
- **Steps.** `POST` a rank auction with `status: "active"`.
- **Expected.** Created without `publish_auction` having run.
- **Oracle.** Compare the resulting state against API-STG-020's; record the difference.
- **Trace.** P1 · automate-later

#### API-STG-022 — A draft stage links to an existing draft event group
- **Why it matters.** It is the link that makes the two-call model work; a broken link
  produces an event group with no stages and an orphan trade.
- **Steps.** `POST` with `event_group_id` of an existing draft.
- **Expected.** Created and linked.
- **Oracle.** The event group's stage list contains it. ≈ BE-10.4.
- **Trace.** P0 · automate

#### API-STG-023 — Updating a draft stage via template_input strips the status
- **Why it matters.** `template_input_trade_update` deliberately removes `status` so the
  update runs the draft-save path rather than draft→active. Without that, editing a
  scheduled draft would publish it.
- **Setup.** A draft stage on a scheduled template.
- **Steps.** `PATCH /trade/:id/template_input` with `status: "active"`.
- **Expected.** The stage stays draft; the other edits apply.
- **Oracle.** Status still draft after the call.
- **Trace.** P1 · automate-later · `trade_controller.rb:39-46`

#### API-STG-024 — Adding a stage to a live event uses its own endpoint and policy
- **Why it matters.** The policy allows either the event's owner or anyone with create
  access — a wider gate than stage creation, and worth confirming rather than assuming.
- **Setup.** A live event; a non-owner buyer with create access.
- **Steps.** `POST /trade/:id/add_new_stage_in_live_event` as each.
- **Expected.** Both allowed; a user with neither is refused.
- **Oracle.** Three outcomes as expected; the live event's existing stage is untouched.
- **Trace.** P1 · automate-later

---

## 4. Activation

`PATCH /api/event_groups/:id` with `status: "active"` — the publish. The largest and
most consequential section in this file, and the one that carries the standing
regression.

Two mechanics to hold in mind. **Which branch runs is decided before anything else**:
the publish branch runs when the event group is a draft going active, *or* when
`draft_trade_request_ids` are present on an already-active event (that second case is
how a stage is added to a live event). The generic branch runs for `withdrawn`/`draft`
status, or when `line_items` or `config` are present. If neither guard matches, **no
service runs at all** and the controller still tries to render — a latent edge case with
its own case below.

And **`line_items` is only consumed on the generic branch**. Sending line items with
`status: "active"` does not update them; the array is ignored. A test that publishes and
expects new line items to appear is testing something the code does not do.

#### API-PUB-001 — A fresh single-stage draft activates
- **Why it matters.** The happy-path baseline the rest of the section is measured
  against.
- **Setup.** A draft event group with one draft stage that has a bidding-time schedule.
- **Steps.** `PATCH` with `status: "active"` and the stage uuid in
  `draft_trade_request_uuids`.
- **Expected.** 200; the event group is active with one live stage.
- **Oracle.** Status active; the stage appears in `stages`; a vendor can bid on it.
- **Trace.** P0 · automate · ≈ BE-2.1

#### API-PUB-002 — Activation must never answer with an untyped 500
- **Why it matters.** The standing regression. From ~16:29 on 2026-09-08 this endpoint
  returned `{"status":500,"error":"Internal Server Error"}` for **both**
  `status: "active"` and `status: "draft"`, invariant across stage type (auction / RFQ /
  RFP), line-item count (1 or 2), invited vendors (0, 1, 154), sheet filled or empty,
  and schedule default or explicitly saved. Nothing was written — the title never
  appeared in the events list — so the raise happened before the commit.
- **Setup.** Any valid draft event group and stage.
- **Steps.** `PATCH` to activate. Capture the full response body and the request
  payload.
- **Expected.** Either 200, or a `render_error_json` failure with a `{code, message}`.
- **Oracle.** Fail if the body is `{"status":500,"error":…}` with no code. Attach the
  payload to the failure — the payload is what makes the report actionable. The three
  ranked causes are a `lock_transaction` double-render at
  `event_groups_controller.rb:74`, `set_customized_audiences`
  (`trade_controller_helper.rb:687-729`), and `TradeSchedule.change_auction_time(nil)`
  in `publish_auction`; the third cannot explain the draft-status 500, so an exception
  class from Sentry is what distinguishes them.
- **Trace.** P0 · automate · regression-event-group-update-500.md · publish-500-analysis.md

#### API-PUB-003 — Activation of a stage with no bidding-time schedule fails cleanly
- **Why it matters.** `change_auction_time(nil)` has no nil guard, so this is a real
  unguarded dereference. The correct behaviour is a refusal naming the schedule.
- **Setup.** A draft stage whose bidding-time `TradeSchedule` is absent.
- **Steps.** `PATCH` to activate.
- **Expected.** A `{code, message}` refusal about the schedule.
- **Oracle.** Not a bare 500. This is the regression guard's narrowest form.
- **Trace.** P0 · automate · ≈ BE-2.2 · `trade_schedule.rb:139`

#### API-PUB-004 — Activation succeeds identically for auction, rfq and rfp stages
- **Why it matters.** Publishing must not be strategy-sensitive; if one mode fails, the
  cause is in that mode's setup rather than in publish.
- **Steps.** Build three single-stage drafts, one per mode. Activate each.
- **Expected.** All three activate.
- **Oracle.** Three active events; report per-mode outcomes separately so a single
  failure is attributable.
- **Trace.** P0 · automate · ≈ BE-2.3

#### API-PUB-005 — Activation succeeds with one line item and with several
- **Why it matters.** It rules line-item count in or out as a factor — which is exactly
  what the regression investigation needed.
- **Steps.** Activate a 1-item event and a 2-item event.
- **Expected.** Both succeed.
- **Oracle.** Both active with the expected item counts.
- **Trace.** P1 · automate · ≈ BE-2.4, BE-2.5

#### API-PUB-006 — Activation succeeds with a single invited vendor
- **Why it matters.** The minimum useful audience, and the fixture every bid case needs.
- **Steps.** `PATCH` with one `audience_company_uuids` entry.
- **Expected.** Active with that vendor invited.
- **Oracle.** One audience row for the stage; the vendor can see the event.
- **Trace.** P0 · automate · ≈ BE-2.6

#### API-PUB-007 — Activation succeeds with a large audience below the cap
- **Why it matters.** Large audiences are normal on real tenants (154 on one client),
  and they are where the audience-application code path gets exercised properly.
- **Steps.** `PATCH` with ~150 vendor uuids.
- **Expected.** Active with all of them invited.
- **Oracle.** Audience count equals the request; record the duration.
- **Trace.** P1 · automate · ≈ BE-2.7

#### API-PUB-008 — More than 500 new audience companies is refused
- **Why it matters.** The explicit cap ("Participants limit exceeded. Maximum 500
  participants are allowed.", 511), enforced during publish.
- **Steps.** `PATCH` with 501 uuids.
- **Expected.** 422, code 511.
- **Oracle.** The event is not activated with 501; the message names the limit.
- **Trace.** P1 · automate-later · ≈ BE-2.8

#### API-PUB-009 — Activation succeeds with the pricing sheet filled and with it empty
- **Why it matters.** It separates sheet completeness from activation. The UI enforces
  "sheet partially filled"; the API's tolerance is the thing to know.
- **Steps.** Activate with sheet values present, then with none.
- **Expected.** Both succeed at the API layer, or the refusal is a readable one.
- **Oracle.** Record both outcomes; a 500 on either is the finding.
- **Trace.** P1 · automate · ≈ BE-2.9, BE-2.10

#### API-PUB-010 — Activating a non-existent event group is refused
- **Why it matters.** The first precondition, and it must not be a 500.
- **Steps.** `PATCH /api/event_groups/<fabricated>`.
- **Expected.** 422, code 533 "Project does not exist."
- **Oracle.** That code and message.
- **Trace.** P1 · automate · ≈ BE-2.11

#### API-PUB-011 — Activating a superseded version is refused
- **Why it matters.** `latest?` is checked before any write; without it, a stale client
  could overwrite newer work.
- **Setup.** An event group with a newer version.
- **Steps.** `PATCH` the older one.
- **Expected.** 422, code 101.
- **Oracle.** The newer version is untouched.
- **Trace.** P1 · automate-later · ≈ BE-2.12

#### API-PUB-012 — An attachment URL from another company is refused
- **Why it matters.** Every attachment URL is validated for company ownership before
  anything else happens; it is a cross-tenant read vector.
- **Steps.** `PATCH` with an attachment URL owned by another company.
- **Expected.** 422, code 101.
- **Oracle.** Nothing written; the event stays draft.
- **Trace.** P0 · automate-later · ≈ BE-2.13

#### API-PUB-013 — A caller without update permission is refused
- **Why it matters.** The policy has two independent branches (Procol employee acting as
  CSM, or allowed-company plus trade create) and both need proving.
- **Setup.** A user in neither branch.
- **Steps.** `PATCH` to activate.
- **Expected.** Refused.
- **Oracle.** Event unchanged.
- **Trace.** P0 · automate · ≈ BE-2.14

#### API-PUB-014 — A Procol-employee CSM can update without the trade permission flag
- **Why it matters.** The other policy branch. It is a deliberate back door for support,
  and it must work for the right people and nobody else.
- **Setup.** A Procol employee who is CSM for the company, without `trade:
  create_record`.
- **Steps.** `PATCH` to update.
- **Expected.** Allowed.
- **Oracle.** The update applies. Then repeat as a Procol employee who is *not* CSM for
  that company — that must be refused.
- **Trace.** P1 · automate-later · ≈ BE-8.5

#### API-PUB-015 — Publishing RFP + RFQ where the RFP ends later is refused
- **Why it matters.** Code 712, "RFP duration exceeds RFQ end time. Please adjust." — a
  real ordering constraint between stage windows.
- **Setup.** A two-stage draft with the RFP ending after the RFQ.
- **Steps.** `PATCH` to activate both.
- **Expected.** 422, code 712.
- **Oracle.** Neither stage goes live.
- **Trace.** P0 · automate · ≈ BE-2.15

#### API-PUB-016 — A `purchase_request_id` must resolve to an active BOQ PR in the workspace
- **Why it matters.** An unvalidated link would attach an event to a foreign or
  inactive requisition.
- **Steps.** `PATCH` with an inactive PR id, then with another workspace's PR id.
- **Expected.** Refused both times (101).
- **Oracle.** No link created.
- **Trace.** P1 · automate-later

#### API-PUB-017 — A draft-status PATCH with line items takes the generic branch
- **Why it matters.** It is the autosave path, and confusing it with publish is how a
  draft accidentally goes live.
- **Steps.** `PATCH` with `status: "draft"` and `line_items` present.
- **Expected.** Line items are updated; the event stays draft.
- **Oracle.** Status draft; line items reflect the payload.
- **Trace.** P1 · automate · ≈ BE-2.16

#### API-PUB-018 — Line items sent with `status: "active"` are ignored
- **Why it matters.** They are only read on the generic branch. Silently ignoring them
  is the documented behaviour, and a test expecting otherwise chases a phantom.
- **Steps.** `PATCH` to activate with a new line item in `line_items`.
- **Expected.** Activation succeeds; the new line item is **not** created.
- **Oracle.** Line-item count unchanged. Record it as expected behaviour, not a bug —
  but flag it if the UI ever relies on it.
- **Trace.** P1 · automate · `update_service.rb`

#### API-PUB-019 — `status: "active"` on an already-active event with no draft stages runs no service
- **Why it matters.** Neither branch guard matches, so no service is called and the
  controller still renders with variables that were never assigned. That is a latent
  edge case, and this is the case that watches it.
- **Setup.** An active event group, no `draft_trade_request_ids`, no `line_items`, no
  `config`.
- **Steps.** `PATCH` with `status: "active"`.
- **Expected.** A coherent response — not a 500, not a silent state change.
- **Oracle.** Assert no state change **and** no 500. ≈ BE-9.6.
- **Trace.** P1 · automate · `event_group_controller_helper.rb:28-38`

#### API-PUB-020 — Re-activating an already-active event is idempotent
- **Why it matters.** Clients retry. A retry that duplicates stages or audiences is a
  data-integrity bug.
- **Steps.** `PATCH` to activate twice with identical bodies.
- **Expected.** No duplicates.
- **Oracle.** Stage count, audience count and bid count identical after the second call.
- **Trace.** P0 · automate · ≈ BE-2.25, BE-9.4

#### API-PUB-021 — Transient config keys are stripped from the persisted config
- **Why it matters.** `is_scheduled_template`, `schedule`, `ends_at` and
  `max_occurrences` are deliberately removed; a leak would make an ordinary event behave
  like a recurring template.
- **Steps.** `PATCH` with all four in `config`. Read the event group back.
- **Expected.** None of them are persisted.
- **Oracle.** All four absent from the stored config.
- **Trace.** P2 · automate-later · `update_service.rb:52,206`

#### API-PUB-022 — A terms attachment missing its `type` key is refused cleanly
- **Why it matters.** The structure is rehydrated into a PORO, so a missing key is a
  prime candidate for an unhandled exception — precisely what PRD §5 forbids.
- **Steps.** `PATCH` with `terms_and_conditions.attachments: [{value: []}]`.
- **Expected.** A 4xx with a readable message.
- **Oracle.** Not a 500. ≈ BE-2.22.
- **Trace.** P1 · automate-later · PRD §5

#### API-PUB-023 — Absent `terms_and_conditions.clauses` does not crash activation
- **Why it matters.** The UI sends an empty-but-present structure; other clients may
  send neither. Both must work.
- **Steps.** `PATCH` with clauses nil, then with the whole key absent.
- **Expected.** Activation succeeds both ways.
- **Oracle.** No 500; the stored terms are empty rather than null-broken. ≈ BE-2.24.
- **Trace.** P1 · automate · ≈ BE-2.23, BE-2.24

#### API-PUB-024 — A stage absent from `draft_trade_request_uuids` is voided
- **Why it matters.** Any stage on the event group not named in the publish gets voided.
  A ghost stage that survived would accept bids nobody expects.
- **Setup.** A draft event group with three draft stages.
- **Steps.** `PATCH` naming two of them.
- **Expected.** Two live stages; the third voided.
- **Oracle.** The third stage's status is `void`; it is absent from the read payload.
  ≈ BE-9.3.
- **Trace.** P1 · automate-later · `update_service.rb:441-443`

#### API-PUB-025 — Adding a draft stage to an already-live event publishes just that stage
- **Why it matters.** It is the second publish-branch trigger, and it must not
  re-publish or disturb the live stage.
- **Setup.** A live event plus a new draft stage on the same event group.
- **Steps.** `PATCH` with `status: "active"` and only the new stage's uuid.
- **Expected.** The new stage goes live; the existing one is untouched, bids intact.
- **Oracle.** Stage count +1; the original stage's bid count unchanged. ≈ BE-2.19.
- **Trace.** P1 · automate-later

#### API-PUB-026 — Activating an event group with zero stages is a safe no-op
- **Why it matters.** The publish loop over stages must tolerate an empty set rather
  than raising on it.
- **Setup.** A draft event group with no stages.
- **Steps.** `PATCH` to activate.
- **Expected.** A coherent response, no exception.
- **Oracle.** No 500; the resulting state is explainable. ≈ BE-9.5.
- **Trace.** P1 · automate-later

#### API-PUB-027 — An approval-gated stage becomes `requested`, not `active`
- **Why it matters.** On those tenants "published" means "pending approval", so an
  assertion of active is wrong there and would look like a publish failure.
- **Setup.** gate: publish approval configured.
- **Steps.** `PATCH` to activate.
- **Expected.** Stage status `requested`; an approval record exists.
- **Oracle.** Status requested; approval present. ≈ BE-9.7.
- **Trace.** P1 · automate-later

#### API-PUB-028 — Auto-routing to the auction team forces the stage to `draft`
- **Why it matters.** gate: `routeAuctionsToAuctionTeam`. It looks exactly like a failed
  publish unless you know.
- **Setup.** gate: `routeAuctionsToAuctionTeam`. An auction stage.
- **Steps.** `PATCH` to activate.
- **Expected.** Stage status draft, assigned to the auction team.
- **Oracle.** Status draft plus the assignment. ≈ BE-9.8.
- **Trace.** P1 · automate-later

#### API-PUB-029 — Activation fires invitation mails exactly once
- **Why it matters.** Three `after_commit` callbacks fire on the draft→active
  transition, each guarded against scheduled templates and dummy event groups. Two
  invitation mails per vendor is a support call; zero is a dead event.
- **Steps.** Activate, then re-issue the same activation.
- **Expected.** One invitation per vendor overall.
- **Oracle.** Count the enqueued mail jobs across both calls.
- **Trace.** P1 · automate-later · `event_group.rb:112-114`

#### API-PUB-030 — The activation response carries the full published shape
- **Why it matters.** The response is what the UI renders straight after publish; a
  missing key there is what makes the screen look broken after a successful publish.
- **Steps.** Activate and inspect the response.
- **Expected.** `stages`, `stage_vs_participants_data`, `config` (including
  `should_allow_awarding`) and `is_bid_placed_globally` all present.
- **Oracle.** Each key present and internally consistent with the request.
- **Trace.** P1 · automate · `event_groups_controller.rb:92-102`

---

## 5. Line items

There is no REST resource for event-group line items. They are managed entirely as a
nested array on the create and on the generic-branch update. The one dedicated endpoint
is for evaluator scoring.

#### API-LI-001 — A line item is added to a draft via the generic branch
- **Why it matters.** The only way to add an item after creation.
- **Steps.** `PATCH` with `status: "draft"` and an extra entry in `line_items`.
- **Expected.** The item is created and returned in the new ids.
- **Oracle.** Line-item count +1. ≈ BE-3.1.
- **Trace.** P1 · automate

#### API-LI-002 — Deleting a line item on a draft sets it inactive
- **Why it matters.** Drafts soft-delete to `in_active`, active events to `deleted` —
  two different terminal states, and confusing them makes a read filter wrong.
- **Steps.** Delete a line item on a draft.
- **Expected.** Status `in_active`.
- **Oracle.** The row's status is exactly `in_active`. ≈ BE-3.4.
- **Trace.** P1 · automate-later

#### API-LI-003 — Deleting a line item on an active event sets it deleted and voids associations
- **Why it matters.** The associated `TradeProduct`, `Form` and mapping rows must go
  with it, or the sheet keeps rendering a phantom row.
- **Steps.** Delete a line item on an active event.
- **Expected.** Status `deleted`; associations void/inactive; PR quantity reconciled.
- **Oracle.** Verify each association's status in the database. ≈ BE-3.3.
- **Trace.** P1 · automate-later

#### API-LI-004 — Deleting the only line item is refused
- **Why it matters.** Code 711 — it would leave an event with nothing to bid on.
- **Steps.** Delete the sole line item.
- **Expected.** 422, code 711.
- **Oracle.** The item remains active. ≈ BE-3.10.
- **Trace.** P1 · automate

#### API-LI-005 — Deleting the last remaining *active* line item is refused
- **Why it matters.** Distinct from API-LI-004: several rows may exist with only one
  active. The rule is about the active count.
- **Setup.** Three line items, two already deleted.
- **Steps.** Delete the third.
- **Expected.** 422, code 711.
- **Oracle.** The active count stays 1.
- **Trace.** P1 · automate-later

#### API-LI-006 — Deleting a line item referenced by a valid proposal is refused
- **Why it matters.** It would orphan an award in progress.
- **Setup.** A requested or selected proposal referencing the item.
- **Steps.** Delete it.
- **Expected.** 422, code 711.
- **Oracle.** The proposal is intact. ≈ BE-3.2.
- **Trace.** P0 · automate-later

#### API-LI-007 — Replacing BOQ line items deletes the old set and creates the new
- **Why it matters.** Appending instead of replacing silently doubles a 500-row event.
- **Steps.** Send a new set of BOQ line items on a generic-branch update.
- **Expected.** The old ones are deleted, the new ones created.
- **Oracle.** Active count equals the new set's size, not the sum. ≈ BE-3.7.
- **Trace.** P1 · automate-later

#### API-LI-008 — A string quantity is refused, not coerced
- **Why it matters.** PRD §5. A coerced `0` quantity is an event nobody can price.
- **Steps.** `PATCH` with `quantity.value: "ten"`.
- **Expected.** Refused.
- **Oracle.** No line item with quantity 0. ≈ BE-3.8.
- **Trace.** P0 · automate

#### API-LI-009 — Line-item deletion enqueues its cleanup worker
- **Why it matters.** The `after_update_commit` callbacks are what actually clean up;
  a deletion that skips them leaves stale derived data.
- **Steps.** Delete a line item.
- **Expected.** The deletion and event-group update workers are enqueued.
- **Oracle.** Both jobs present. ≈ BE-3.9.
- **Trace.** P2 · automate-later · `event_group_line_item.rb:44`

#### API-LI-010 — Updating a line item's quantity reconciles the PR
- **Why it matters.** The requisition's in-progress quantity is derived from this; drift
  here means the PR never closes correctly.
- **Setup.** A PR-linked event.
- **Steps.** Reduce a line item's quantity.
- **Expected.** The PR's in-progress quantity matches.
- **Oracle.** Read the PR and compare.
- **Trace.** P1 · automate-later

#### API-LI-011 — `update_egli` is refused outside evaluation time
- **Why it matters.** Code 741 — evaluator changes mid-bidding would change the scoring
  after the fact.
- **Setup.** A stage not in extra-closing/evaluation time.
- **Steps.** `PATCH /event_groups/update_egli`.
- **Expected.** 422, code 741.
- **Oracle.** Evaluators unchanged. ≈ BE-3.5.
- **Trace.** P1 · automate

#### API-LI-012 — `update_egli` without a form id is refused
- **Why it matters.** The lookup is by `form_id`; a missing one must be a 422, not a nil
  dereference.
- **Steps.** `PATCH /event_groups/update_egli` with no `form_id`.
- **Expected.** 422, code 2.
- **Oracle.** That code; no 500. ≈ BE-3.6.
- **Trace.** P1 · automate

#### API-LI-013 — `update_egli` succeeds inside evaluation time
- **Why it matters.** The positive half; without it API-LI-011 could pass on a broken
  endpoint.
- **Setup.** A stage in evaluation time.
- **Steps.** `PATCH` with a valid form id and evaluators.
- **Expected.** 200; evaluators updated.
- **Oracle.** The new evaluators are on the line item.
- **Trace.** P1 · automate-later

#### API-LI-014 — Line items are readable back with their quantities and products
- **Why it matters.** PRD §3.6 — every created event must be retrievable. This is the
  read half.
- **Steps.** `GET /event_groups/:uuid/get_line_items`.
- **Expected.** Every active item with its product, quantity and unit.
- **Oracle.** Count and values match what was created.
- **Trace.** P0 · automate · PRD §3.6
