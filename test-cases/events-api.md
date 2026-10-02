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

---

## 6. Audience and participants

Audience rows are a soft-delete pattern: `Audience` has a uniqueness constraint on
`audience_id` scoped to `(item_id, item_type, visible, status)` **only when the row is
active**, so a company can hold one active row per (item, visibility) and any number of
historical inactive ones. Most bugs in this area are duplicate active rows.

#### API-AUD-001 — Activation applies the audience per stage
- **Why it matters.** For eRFX, this is the only point at which vendors are invited —
  the stage-creation call ignores the audience (API-STG-017).
- **Steps.** Activate with `audience_company_uuids`. Read the audience.
- **Expected.** One active row per company per stage.
- **Oracle.** `GET /event_groups/:uuid/get_audience` returns exactly those companies.
- **Trace.** P0 · automate

#### API-AUD-002 — The invited vendor can read the event
- **Why it matters.** The invitation is only real if it grants read access; the policy
  needs both trade-read *and* a visible stage.
- **Steps.** As the invited vendor, `GET /api/event_groups/:id`.
- **Expected.** 200 with the event.
- **Oracle.** The response contains the event's line items and its own stage.
- **Trace.** P0 · automate

#### API-AUD-003 — A vendor with no visible stage cannot read the event
- **Why it matters.** `show?` requires `get_valid_stages_for_user` to be non-empty, so a
  vendor with read permission and no stage is refused. It is a rule people forget.
- **Setup.** A vendor on the platform, not on any stage's audience.
- **Steps.** `GET /api/event_groups/:id`.
- **Expected.** Refused.
- **Oracle.** No event payload. ≈ BE-8.1.
- **Trace.** P0 · automate-later · `event_group_policy.rb:52-54`

#### API-AUD-004 — 501 new audience companies on one stage is refused
- **Why it matters.** The 500 cap, enforced at publish (511).
- **Steps.** Activate with 501 uuids.
- **Expected.** 422, code 511.
- **Oracle.** Not activated with 501.
- **Trace.** P1 · automate-later

#### API-AUD-005 — One company cannot hold two active audience rows on one stage
- **Why it matters.** It is the model's own invariant, and violating it double-counts a
  vendor everywhere.
- **Steps.** Apply the same company twice to one stage.
- **Expected.** Still one active row.
- **Oracle.** Count active rows in the database for that (company, stage). ≈ BE-4.7.
- **Trace.** P1 · automate-later · `audience.rb:24`

#### API-AUD-006 — Repeating the same activation does not duplicate audience rows
- **Why it matters.** The retry case for the same invariant, and the one a client
  actually causes.
- **Steps.** Issue the identical activation `PATCH` twice.
- **Expected.** No new rows.
- **Oracle.** Active audience count identical. ≈ BE-9.4.
- **Trace.** P0 · automate

#### API-AUD-007 — Removing a vendor who has not participated succeeds
- **Why it matters.** The legal removal path, and the baseline for the refusal below.
- **Steps.** Remove an invited vendor with no bid.
- **Expected.** Their row becomes inactive/invisible; they can no longer read the event.
- **Oracle.** As that vendor, the read is refused.
- **Trace.** P1 · automate-later

#### API-AUD-008 — Removing a vendor who already participated is refused
- **Why it matters.** Code 512-family guard — removing a bidder would silently
  invalidate a bid.
- **Setup.** A vendor with a submitted bid.
- **Steps.** Attempt the removal.
- **Expected.** Refused.
- **Oracle.** The bid is still counted. ≈ BE-4.8.
- **Trace.** P0 · automate-later

#### API-AUD-009 — Hiding a vendor with an active bid is reported, not raised
- **Why it matters.** The callback emits a Sentry message rather than raising, so
  nothing visible happens — this case is the only way it is ever noticed.
- **Steps.** Flip a bidding vendor's visibility to `no`.
- **Expected.** The change is recorded; the bid remains reachable by the buyer.
- **Oracle.** The buyer can still read the bid afterwards.
- **Trace.** P2 · automate-later · `audience.rb:71-90`

#### API-AUD-010 — Live-auction audience addition requires view access
- **Why it matters.** `add_audience_live_auction?` is gated only on view access — a
  wider gate than publish, which makes it worth confirming that it is at least that.
- **Setup.** A user without view access to the event.
- **Steps.** `PATCH /v1/trade/add_audience?id=…`.
- **Expected.** Refused.
- **Oracle.** No audience row created. ≈ BE-4.9.
- **Trace.** P1 · automate-later

#### API-AUD-011 — A vendor self-participates on an active open-tender event
- **Why it matters.** The only path where a vendor joins uninvited, and it needs
  `open_tenders` on the company.
- **Setup.** gate: `open_tenders`. An active event.
- **Steps.** `POST /api/event_groups/:id/participants` as the vendor.
- **Expected.** 200; an audience row with source self-registered.
- **Oracle.** The buyer's participant list includes them, marked self-registered.
  ≈ BE-4.1.
- **Trace.** P1 · automate-later

#### API-AUD-012 — Self-participation on a non-active event is refused
- **Why it matters.** The lookup is scoped to active events, so a draft must answer 533
  rather than joining.
- **Steps.** `POST` participants on a draft event.
- **Expected.** 422, code 533.
- **Oracle.** No audience row. ≈ BE-4.2.
- **Trace.** P1 · automate-later

#### API-AUD-013 — Self-participation is refused without open tenders
- **Why it matters.** The gate. Without it, any vendor could join any active event.
- **Setup.** A company without `open_tenders`.
- **Steps.** `POST` participants.
- **Expected.** Refused.
- **Oracle.** No audience row. ≈ BE-4.3.
- **Trace.** P0 · automate-later

#### API-AUD-014 — Rejecting a participant requires remarks
- **Why it matters.** Code 752 — the remark is the audit trail for excluding a bidder.
- **Steps.** `PATCH /api/event_groups/:id/reject_participant` with blank remarks.
- **Expected.** 422, code 752.
- **Oracle.** The participant is unchanged. ≈ BE-4.4.
- **Trace.** P1 · automate

#### API-AUD-015 — Rejecting a participant is refused for a caller who is neither purchaser nor auction team
- **Why it matters.** The check is inline in the action rather than in the policy, which
  is exactly the kind of check that disappears in a refactor.
- **Setup.** A buyer who is neither.
- **Steps.** `PATCH .../reject_participant` with valid remarks.
- **Expected.** Refused (101).
- **Oracle.** No rejection recorded. ≈ BE-4.6.
- **Trace.** P1 · automate-later

#### API-AUD-016 — A successful rejection is written by bypassing callbacks, and still consistent
- **Why it matters.** It appends to precomputed data with `update_columns` — no
  callbacks, no validations — and enqueues a worker. Anything derived from that field
  must still agree afterwards.
- **Steps.** Reject a participant. Re-read the event.
- **Expected.** The rejected company is listed as rejected everywhere it appears.
- **Oracle.** The precomputed rejected list and the participant view agree.
- **Trace.** P2 · automate-later

---

## 7. The vendor's technical response

For a two-stage event, the vendor answers the questionnaire before pricing. It is three
calls: start a template response, fill the page responses, submit.

#### API-TECH-001 — A vendor starts a technical response
- **Why it matters.** The first of the three calls; the uuid it returns keys the other
  two.
- **Setup.** A live RFP stage with the vendor invited.
- **Steps.** `POST /template_responses` for the technical trade.
- **Expected.** 200 with a response uuid.
- **Oracle.** Uuid returned and readable back.
- **Trace.** P0 · automate · `flows/vendorBid.ts`

#### API-TECH-002 — The technical trade exposes its forms and pages
- **Why it matters.** The answer payload is keyed by form and page uuids, which must be
  read from the trade rather than guessed. On this build the line-item form is the
  second entry, and the global one the first.
- **Steps.** `GET /trade/:id` for the technical stage and read `sheets.forms`.
- **Expected.** A global form and one line-item form, each with page uuids.
- **Oracle.** Both forms present with non-empty page uuid lists — read the index from
  the payload rather than hard-coding it.
- **Trace.** P0 · automate

#### API-TECH-003 — Answers are saved to the line-item form
- **Why it matters.** The middle call; a wrong form uuid saves answers nobody reads.
- **Steps.** `PUT /template_responses/:uuid/create_page_responses` with the line-item
  form and page.
- **Expected.** 200; the answers are readable back on the response.
- **Oracle.** Read the response and compare the answers.
- **Trace.** P0 · automate

#### API-TECH-004 — The response is submitted and visible to the buyer
- **Why it matters.** Submission is what makes it evaluable; a draft response is not a
  participation.
- **Steps.** `PATCH /template_responses/:uuid` to submit.
- **Expected.** Submitted state.
- **Oracle.** The buyer's read of the event shows a submitted response for that vendor.
- **Trace.** P0 · automate

#### API-TECH-005 — An unanswered required question blocks submission
- **Why it matters.** An incomplete questionnaire cannot be scored fairly.
- **Steps.** Submit with a required answer missing.
- **Expected.** Refused, naming the gap.
- **Oracle.** The response is not in a submitted state.
- **Trace.** P1 · automate-later

#### API-TECH-006 — A vendor cannot start a response on a stage they are not on
- **Why it matters.** It is a write path into another event's data.
- **Setup.** A vendor not on the stage's audience.
- **Steps.** `POST /template_responses` for that stage.
- **Expected.** Refused.
- **Oracle.** No response created.
- **Trace.** P0 · automate-later

#### API-TECH-007 — A vendor cannot read another vendor's response
- **Why it matters.** PRD §7.2 extends past prices — a competitor's technical answers
  are commercially sensitive too.
- **Setup.** Two vendors with responses.
- **Steps.** As A, `GET /template_responses/:B_uuid`.
- **Expected.** Refused.
- **Oracle.** No payload for B.
- **Trace.** P0 · automate-later · PRD §7.2

#### API-TECH-008 — Submitting twice does not create a second response
- **Why it matters.** Idempotency on the vendor's most retried call.
- **Steps.** Submit the same response twice.
- **Expected.** One submitted response.
- **Oracle.** Response count for that vendor is 1.
- **Trace.** P1 · automate-later

#### API-TECH-009 — A response cannot be started before the window opens
- **Why it matters.** Same fairness rule as bidding, on the technical stage.
- **Setup.** An Upcoming RFP stage.
- **Steps.** `POST /template_responses`.
- **Expected.** Refused.
- **Oracle.** No response created.
- **Trace.** P1 · automate-later

#### API-TECH-010 — A response cannot be submitted after the window closes
- **Why it matters.** A late technical response changes the qualification set after the
  fact.
- **Setup.** A closed RFP stage with a started response.
- **Steps.** Submit.
- **Expected.** Refused.
- **Oracle.** The response stays unsubmitted.
- **Trace.** P1 · automate-later

#### API-TECH-011 — An evaluator can score a submitted response
- **Why it matters.** It closes the RFP loop and feeds the awarding comparison.
- **Setup.** gate: evaluation. A submitted response, stage in evaluation time.
- **Steps.** `POST /evaluations`, then `POST /evaluations/submit`.
- **Expected.** The score is saved and visible to the buyer.
- **Oracle.** The buyer's read shows a non-empty evaluation score for that vendor.
- **Trace.** P1 · automate · `flows/evaluation.ts`

#### API-TECH-012 — A non-evaluator cannot submit an evaluation
- **Why it matters.** Scores decide who qualifies; the wrong person scoring is an
  integrity failure.
- **Setup.** A buyer who is not an assigned evaluator.
- **Steps.** `POST /evaluations/submit`.
- **Expected.** Refused.
- **Oracle.** No score recorded.
- **Trace.** P1 · automate-later

---

## 8. The vendor's bid

The heart of PRD §3.4. Four calls in sequence: read the pricing trade to learn its
`trade_product` identifiers, create the bid, create the bid products, submit.

An important structural note: **`BidPolicy` is almost entirely open** — `create_bid?`,
`update_bid?`, `edit_bid?`, `revise_bid?`, `show?` and `index?` all return true. Real
eligibility is enforced deeper, inside the bid services and the controller's own guard
sequence. That means the cases below are the *only* place bid eligibility is verified;
a policy-level test would prove nothing.

The guard order in `create_bid` is worth knowing, because it determines which error you
should expect when two things are wrong at once: RFQ-changes-restricted (769) → rebidding
not allowed (101) → surrogate permission → window/status (33) → can-place-bid-for-company
(101) → existing bid (99/96/370) → anomaly detection → approval requirement.

#### API-BID-001 — An eligible vendor creates a bid
- **Why it matters.** The base case. Everything else in this section is a variation.
- **Setup.** A live RFQ stage with the vendor invited.
- **Steps.** `POST /v1/bids` with the trade and company.
- **Expected.** 200 with a bid uuid.
- **Oracle.** Uuid returned; the bid is readable back. ≈ BE-5.1.
- **Trace.** P0 · automate · `flows/vendorBid.ts`

#### API-BID-002 — Bid products carry the price and quantity per line item
- **Why it matters.** The bid is a container; the prices live in the products. A bid with
  no products is a participation with no offer.
- **Steps.** `POST /v1/bids/:uuid/create_bid_products` with one entry per line item.
- **Expected.** 200; each line item has a price and quantity.
- **Oracle.** Product count equals the line-item count; prices as sent.
- **Trace.** P0 · automate

#### API-BID-003 — The bid is submitted and the total is what was offered
- **Why it matters.** The total is the number the buyer compares and the award is based
  on. A derivation error here is invisible and expensive.
- **Steps.** `PATCH /v1/bids/:uuid` to submit, with the computed total.
- **Expected.** 200; the bid is active with that total.
- **Oracle.** Total equals the sum of price × quantity across the products, at the
  template's precision.
- **Trace.** P0 · automate

#### API-BID-004 — A bid with no products is refused on submission
- **Why it matters.** The model validates it ("Please bid on at least one product") for
  non-fast, non-buyer-added bids.
- **Steps.** Create a bid, skip the products, submit.
- **Expected.** Refused.
- **Oracle.** The bid does not become active. `bid.rb:216-222`.
- **Trace.** P0 · automate

#### API-BID-005 — A bid outside the window is refused
- **Why it matters.** Code 33 "Order not active" — the single most important fairness
  rule in the module.
- **Steps.** Create a bid on a closed stage, then on an Upcoming one.
- **Expected.** Refused both times.
- **Oracle.** No bid created in either case.
- **Trace.** P0 · automate

#### API-BID-006 — A bid on a withdrawn event is refused
- **Why it matters.** Withdrawal must be immediate at the API layer, not just in the UI.
- **Steps.** Create a bid on a withdrawn event's stage.
- **Expected.** Refused.
- **Oracle.** No bid created.
- **Trace.** P0 · automate-later

#### API-BID-007 — A vendor not on the audience is refused
- **Why it matters.** With an open policy layer, this is where invitation is actually
  enforced.
- **Setup.** A vendor not invited.
- **Steps.** `POST /v1/bids`.
- **Expected.** Refused.
- **Oracle.** No bid created — a 200 here would be a serious finding.
- **Trace.** P0 · automate-later

#### API-BID-008 — A user cannot bid for a company they are not entitled to
- **Why it matters.** `can_place_bid_for_company` is what stops one vendor bidding as
  another.
- **Steps.** `POST /v1/bids` with another company's uuid.
- **Expected.** Refused (101).
- **Oracle.** No bid created for that company.
- **Trace.** P0 · automate-later

#### API-BID-009 — The buying company cannot bid on its own event
- **Why it matters.** Code 165, "Cannot place bid on trade by your own company".
- **Steps.** `POST /v1/bids` with the buyer's own company id, as a non-surrogate bid.
- **Expected.** Refused.
- **Oracle.** No bid created.
- **Trace.** P0 · automate-later

#### API-BID-010 — A second bid from the same company is refused
- **Why it matters.** Code 99 / 96 — the check is at company and team level, which is
  the level that matters commercially.
- **Setup.** A vendor with an active bid.
- **Steps.** `POST /v1/bids` again.
- **Expected.** Refused.
- **Oracle.** One active bid for that company.
- **Trace.** P1 · automate

#### API-BID-011 — A bid from a subsidiary of an existing bidder is refused
- **Why it matters.** `is_part_of_subsidiary_network?` prevents one corporate group
  bidding twice under different names — a genuine collusion control.
- **Setup.** Two companies in one subsidiary network; one has bid.
- **Steps.** Bid as the other.
- **Expected.** Refused (96).
- **Oracle.** One bid across the network.
- **Trace.** P1 · automate-later · `bids_controller_helper.rb:2678`

#### API-BID-012 — Bidding after revoking is refused
- **Why it matters.** Code 370. Revocation is meant to be final within the event.
- **Setup.** A vendor whose bid is revoked.
- **Steps.** `POST /v1/bids`.
- **Expected.** Refused.
- **Oracle.** No new bid.
- **Trace.** P1 · automate-later

#### API-BID-013 — Bidding is refused once the RFQ's auction exists
- **Why it matters.** Code 769, "You cannot edit rfq once the auction is created." It is
  the first guard in the sequence, so it also proves the ordering.
- **Setup.** A converted RFQ.
- **Steps.** `POST /v1/bids` on the RFQ.
- **Expected.** Refused with 769.
- **Oracle.** That specific code — not 33 — which is what confirms the guard order.
- **Trace.** P1 · automate-later

#### API-BID-014 — Rebidding is refused where the seller is barred from it
- **Why it matters.** `not_allow_rebidding_to_seller?` is a per-event configuration and
  a silent bypass would let a barred vendor improve their price.
- **Setup.** An event configured to bar rebidding.
- **Steps.** Bid, then attempt a revision.
- **Expected.** The revision is refused (101).
- **Oracle.** The original bid is unchanged.
- **Trace.** P1 · automate-later

#### API-BID-015 — A negative price is refused
- **Why it matters.** Code 106, checked on every product in the payload.
- **Steps.** `POST` bid products with `price: -100`.
- **Expected.** 422, code 106.
- **Oracle.** No bid product created.
- **Trace.** P0 · automate · PRD §5

#### API-BID-016 — A negative quantity is refused
- **Why it matters.** Code 35, a separate check from price.
- **Steps.** `POST` bid products with a negative quantity.
- **Expected.** 422, code 35.
- **Oracle.** Nothing created.
- **Trace.** P0 · automate · PRD §5

#### API-BID-017 — A negative GST is refused
- **Why it matters.** Code 107 — the third of the three per-product checks, and the one
  most likely to be forgotten.
- **Steps.** `POST` bid products with a negative GST.
- **Expected.** 422, code 107.
- **Oracle.** Nothing created.
- **Trace.** P1 · automate

#### API-BID-018 — A discount above 100 percent is refused
- **Why it matters.** Code 369 — above 100% inverts the price, which no downstream
  arithmetic expects.
- **Steps.** `POST` with `trade_credit_discount.discount: 150`.
- **Expected.** 422, code 369.
- **Oracle.** Nothing created.
- **Trace.** P2 · automate-later

#### API-BID-019 — A negative discount is refused
- **Why it matters.** Same check, other end of the range.
- **Steps.** `POST` with a negative discount.
- **Expected.** 422, code 369.
- **Oracle.** Nothing created.
- **Trace.** P2 · automate-later

#### API-BID-020 — Legacy top-level price and quantity fields are validated too
- **Why it matters.** The controller validates both the nested products *and* the older
  flat fields. An unvalidated legacy path is a real bypass for old clients.
- **Steps.** `POST` with a top-level negative `price`, then a negative `quantity`, then a
  negative `gst`.
- **Expected.** Refused each time (106 / 35 / 107).
- **Oracle.** Nothing created in any case.
- **Trace.** P1 · automate-later · `bids_controller.rb:559-570`

#### API-BID-021 — A non-numeric price is refused, not coerced
- **Why it matters.** A coerced `0` is a winning bid.
- **Steps.** `POST` bid products with `price: "abc"`.
- **Expected.** Refused.
- **Oracle.** No bid product with price 0.
- **Trace.** P0 · automate · PRD §5

#### API-BID-022 — Offering more than the requested quantity is refused
- **Why it matters.** Code 511 at the bid layer, and over-offering distorts the
  comparison.
- **Steps.** `POST` bid products with quantity above the line item's.
- **Expected.** Refused.
- **Oracle.** No bid product above the requested quantity.
- **Trace.** P1 · automate-later

#### API-BID-023 — Offering in a different unit is refused
- **Why it matters.** Code 512 — a unit mismatch makes every price incomparable.
- **Steps.** `POST` bid products with a different unit.
- **Expected.** Refused.
- **Oracle.** Nothing created.
- **Trace.** P1 · automate-later

#### API-BID-024 — A bid on a line item from another event is refused
- **Why it matters.** Cross-event writes are the most damaging category of bid bug.
- **Steps.** `POST` bid products with a `line_item_uuid` from a different event.
- **Expected.** Refused.
- **Oracle.** No bid product created; the other event is untouched.
- **Trace.** P0 · automate-later

#### API-BID-025 — Revising a bid replaces the price and keeps history
- **Why it matters.** Revision is normal, and the *latest* value must be what ranks while
  the earlier one stays auditable.
- **Steps.** `PATCH /bids/revise_bid/:id` with a new price.
- **Expected.** 200; the current price is the new one, the old one is in history.
- **Oracle.** Current price and history both as expected. ≈ BE-5.2.
- **Trace.** P0 · automate

#### API-BID-026 — Revising a non-existent bid is refused
- **Why it matters.** Code 32 "Bid not found" — must not be a nil dereference.
- **Steps.** `PATCH /bids/revise_bid/<fabricated>`.
- **Expected.** 422, code 32.
- **Oracle.** That code; no 500. ≈ BE-5.7.
- **Trace.** P1 · automate

#### API-BID-027 — A bid in a terminal state cannot be revised
- **Why it matters.** The lookup deliberately excludes revised, rejected, selected,
  revoked, inactive and draft bids. Revising a *selected* bid would change an award
  after the fact.
- **Steps.** Attempt to revise a selected bid, then a rejected one.
- **Expected.** Refused both times (32).
- **Oracle.** Neither bid changes.
- **Trace.** P0 · automate-later · `bids_controller.rb:110`

#### API-BID-028 — Rejecting a bid works only on an active bid
- **Why it matters.** Rejecting a non-active bid is meaningless and the endpoint guards
  it explicitly.
- **Steps.** `PATCH /bids/:id/reject` on an active bid, then on an already-rejected one.
- **Expected.** First succeeds; second refused (101).
- **Oracle.** One rejection recorded. ≈ BE-5.3.
- **Trace.** P1 · automate-later

#### API-BID-029 — Updating the status of a revoked bid is refused
- **Why it matters.** Code 151 — a revoked bid is out of the event and must stay out.
- **Steps.** `PATCH /bids/update_bid_status/:id` on a revoked bid.
- **Expected.** 422, code 151.
- **Oracle.** Status unchanged.
- **Trace.** P2 · automate-later

#### API-BID-030 — A vendor cannot read another vendor's bid
- **Why it matters.** PRD §7.2 at the layer where it is actually enforced
  (`can_view_bid?`). The UI check in UI-VBID-025 is the symptom; this is the cause.
- **Setup.** Two vendors with bids.
- **Steps.** As A, `GET /bids/:B_id`.
- **Expected.** Refused (32).
- **Oracle.** No bid payload for B — assert on the body, not only the status.
- **Trace.** P0 · automate · PRD §7.2

#### API-BID-031 — The bid index is restricted to super admins and Procol employees
- **Why it matters.** It is a cross-vendor read by design, so its gate is the only thing
  standing between it and a full bid dump.
- **Steps.** `GET /bids` as a normal buyer, then without `vendor_ids`.
- **Expected.** Refused (101) for the buyer; 422 (5) for the missing filter.
- **Oracle.** No bid list returned in either case.
- **Trace.** P0 · automate-later · `bids_controller.rb:133-136`

#### API-BID-032 — Bid feedback is restricted to the order's team or a super admin
- **Why it matters.** One of only two genuinely gated methods on an otherwise open bid
  policy.
- **Setup.** A buyer not on the order's team and not a super admin.
- **Steps.** `POST /bids/:id/feedback`.
- **Expected.** Refused.
- **Oracle.** No feedback recorded. ≈ BE-5.4.
- **Trace.** P2 · automate

#### API-BID-033 — Accepting a knockout offer twice is idempotent
- **Why it matters.** Double submission at round boundaries must not advance the round
  twice.
- **Setup.** A live knockout auction with an open offer.
- **Steps.** `POST /bids/accept_knockout_offer` twice.
- **Expected.** One acceptance.
- **Oracle.** One acceptance recorded; no 500. ≈ BE-5.6.
- **Trace.** P1 · automate-later

#### API-BID-034 — Accepting a dutch offer validates the quantity
- **Why it matters.** Three distinct refusals live here — missing (249), non-positive
  (101) and below-minimum (246) — and they are easy to collapse into one.
- **Steps.** `POST /bids/accept_dutch_offer` with no quantity, then `0`, then below the
  minimum.
- **Expected.** 249, 101 and 246 respectively.
- **Oracle.** Each specific code; no acceptance in any case.
- **Trace.** P1 · automate-later

#### API-BID-035 — Uploading a bid Excel requires view access to the event
- **Why it matters.** A bulk write path — weak authorization here is worth more than any
  single-bid bypass.
- **Setup.** A user without view access.
- **Steps.** `POST /trade/:id/upload_bid_excel`.
- **Expected.** Refused.
- **Oracle.** No bids created. ≈ BE-5.8.
- **Trace.** P1 · automate-later

#### API-BID-036 — Two vendors' bids coexist and rank correctly
- **Why it matters.** Everything in §11 needs two bids to award between, and ranking is
  the derived value the whole auction depends on.
- **Setup.** A live rank auction with two invited vendors.
- **Steps.** Bid 100 as A, then 90 as B. Read the buyer's view.
- **Expected.** Two bids from two distinct companies; B ranks ahead of A.
- **Oracle.** Two bids with **different** company ids, and the rank order as expected.
- **Trace.** P0 · automate

#### API-BID-037 — Anomaly detection flags a wildly out-of-band bid
- **Why it matters.** It fires only with three or more bids on a line item, skips
  surrogate bids, and does not run for knockout, dutch or book-building — a lot of
  conditions to get wrong, and a false positive blocks a legitimate bid.
- **Setup.** A line item with three comparable bids, then a fourth far outside the range.
- **Steps.** Submit the outlier.
- **Expected.** Flagged as an anomaly with a message and a suggested price, rather than
  silently accepted or hard-refused.
- **Oracle.** The anomaly response is returned; verify a *normal* bid in the same state
  is not flagged.
- **Trace.** P1 · automate-later · `price_anomaly_detector.rb:69-104`

#### API-BID-038 — A staggered event refuses a non-surrogate bid on this endpoint
- **Why it matters.** Code 508 — staggered events accept bids only through their own
  path, and this is the guard that keeps the two apart.
- **Setup.** A staggered event.
- **Steps.** `POST /v1/bids` as a vendor.
- **Expected.** 422, code 508.
- **Oracle.** No bid created.
- **Trace.** P2 · automate-later

---

## 9. Surrogate bids

The buyer bidding for a vendor, from PRD §3.4. At the API layer it is the same
`create_bid` endpoint taking a different path through the guards, plus a dedicated
endpoint for the technical half (`POST /template_responses/create_surrogate_response`)
and one for RFQ prices (`POST /bids/template_input`).

The recognition logic is worth stating exactly, because everything here follows from it:
a bid is treated as surrogate when the trade is not in offline-trading status **and the
caller's allowed companies include the trade's own company** — that is, the buyer is
bidding on their own event. From there: the company config can forbid it entirely (10),
the caller must be a super admin, on a valid bidding team, or the event's own creator
(165), and the event must be upcoming or running — or expired with post-expiry surrogate
bidding enabled.

#### API-SUR-001 — A buyer places a surrogate RFQ bid for a vendor
- **Why it matters.** The core capability. It must land as a bid attributed to the
  vendor, not to the buyer.
- **Setup.** A live RFQ stage with a vendor invited; the caller is the event's creator.
- **Steps.** `POST /bids/template_input` with the vendor's `company_id` and the trade.
- **Expected.** 200; a bid for that vendor.
- **Oracle.** The bid's `company_id` is the vendor's and it is flagged as a surrogate
  bid. `flows/surrogate.ts`.
- **Trace.** P0 · automate

#### API-SUR-002 — A buyer places a surrogate technical response for a vendor
- **Why it matters.** The technical half, with its own endpoint and its own payload
  covering both the global and line-item forms.
- **Setup.** A live RFP stage with a vendor invited.
- **Steps.** `POST /template_responses/create_surrogate_response` with both forms'
  pages.
- **Expected.** 200; a submitted response attributed to the vendor.
- **Oracle.** The response exists for that vendor and is marked surrogate.
- **Trace.** P1 · automate

#### API-SUR-003 — A surrogate bid is refused on an offline-trading event
- **Why it matters.** The recognition logic explicitly excludes offline trading, so the
  call falls through to the normal path and is refused as a self-company bid.
- **Setup.** An offline-trade stage.
- **Steps.** `POST /bids/template_input` as the buyer.
- **Expected.** Refused.
- **Oracle.** No bid created.
- **Trace.** P2 · automate-later

#### API-SUR-004 — A surrogate bid is refused when the company config forbids it
- **Why it matters.** Code 10. Some organisations bar it on principle and honouring that
  is a compliance requirement, not a preference.
- **Setup.** An event whose config sets `is_buyer_not_allowed_to_add_surrogate_bid`.
- **Steps.** `POST /bids/template_input`.
- **Expected.** 422, code 10.
- **Oracle.** No bid created.
- **Trace.** P0 · automate-later

#### API-SUR-005 — A buyer who is not a valid surrogate bidder is refused
- **Why it matters.** Code 165. The permitted set is super admin, valid bidding team, or
  the event's creator — anyone else placing bids for vendors is a serious problem.
- **Setup.** A buyer in the company but none of those three.
- **Steps.** `POST /bids/template_input`.
- **Expected.** 422, code 165.
- **Oracle.** No bid created.
- **Trace.** P0 · automate-later

#### API-SUR-006 — The event's creator can place a surrogate bid
- **Why it matters.** The positive half of API-SUR-005; without it the gate could be
  refusing everyone.
- **Setup.** The event's creator, not a super admin, not on a bidding team.
- **Steps.** `POST /bids/template_input`.
- **Expected.** Accepted.
- **Oracle.** Bid created for the vendor.
- **Trace.** P1 · automate

#### API-SUR-007 — A surrogate bid is accepted on an Upcoming event
- **Why it matters.** Deliberately wider than a vendor's own window — a buyer records a
  bid received offline before the event opens. Contrast with API-BID-005.
- **Setup.** An Upcoming event.
- **Steps.** `POST /bids/template_input`.
- **Expected.** Accepted.
- **Oracle.** Bid created while a vendor's own bid on the same stage is refused with 33.
- **Trace.** P1 · automate-later

#### API-SUR-008 — After expiry, a surrogate bid depends on the post-expiry setting
- **Why it matters.** It is the only setting that permits a bid after the window closed,
  which makes it the highest-integrity switch in this section.
- **Setup.** A closed event, on a tenant with the setting off and one with it on.
- **Steps.** `POST /bids/template_input` on each.
- **Expected.** Refused (33) where off; accepted where on.
- **Oracle.** Both outcomes, and where accepted the bid is marked surrogate.
- **Trace.** P0 · automate-later · `is_allowed_to_add_surrogate_bid_post_expiry?`

#### API-SUR-009 — A surrogate bid for a vendor who already bid is refused by default
- **Why it matters.** Code 99. Overwriting a vendor's own bid is the most damaging thing
  this feature could do, and it is refused unless a specific config allows it.
- **Setup.** A vendor with their own active bid; no
  `allowed_surrogate_bid_even_after_bid`.
- **Steps.** `POST /bids/template_input` for them.
- **Expected.** 422, code 99.
- **Oracle.** The vendor's own bid is unchanged.
- **Trace.** P0 · automate-later

#### API-SUR-010 — With the config on, a repeat surrogate bid revises rather than duplicates
- **Why it matters.** With `allowed_surrogate_bid_even_after_bid`, an existing surrogate
  bid is *returned for revision* instead of a second one being created. A duplicate
  would double-count the vendor in the comparison.
- **Setup.** gate: `allowed_surrogate_bid_even_after_bid`. A vendor with an existing
  surrogate bid.
- **Steps.** `POST /bids/template_input` again at a new price.
- **Expected.** One bid, at the new price, with history.
- **Oracle.** Bid count for that vendor is still 1. `bids_controller_helper.rb:2670-2677`.
- **Trace.** P0 · automate-later

#### API-SUR-011 — Reading surrogate approval flows requires approval-read permission
- **Why it matters.** One of only two genuinely gated bid-policy methods. An empty list
  would read as "no approval needed" and let the bid straight through, so a refusal is
  the correct behaviour and an empty 200 is a finding.
- **Setup.** A buyer without approval-flow read permission.
- **Steps.** `POST /bids/approval_workflows_for_surrogate_bid_create`.
- **Expected.** Refused.
- **Oracle.** A refusal, not an empty array. ≈ BE-5.5.
- **Trace.** P1 · automate

#### API-SUR-012 — The approval-flow lookup requires a trade request id
- **Why it matters.** Code 2 — a missing id must not be a nil dereference.
- **Steps.** `POST` the same endpoint with no `trade_request_id`.
- **Expected.** 422, code 2.
- **Oracle.** That code; no 500.
- **Trace.** P2 · automate

#### API-SUR-013 — The approval-flow lookup applies the surrogate permission checks too
- **Why it matters.** It runs the same `allowed_surrogate_bid_placement` guard, so a
  buyer barred from surrogate bidding must not be able to enumerate the approval flows
  either.
- **Setup.** A buyer refused by API-SUR-005.
- **Steps.** `POST` the approval-flow endpoint.
- **Expected.** The same refusal.
- **Oracle.** Same error code as the bid attempt.
- **Trace.** P2 · automate-later

#### API-SUR-014 — A surrogate bid requiring approval enters a requested state
- **Why it matters.** On approval-configured tenants the bid does not count yet, and a
  test asserting an active bid fails there permanently.
- **Setup.** gate: surrogate-bid approval configured.
- **Steps.** `POST /bids/template_input` with approval remarks.
- **Expected.** The bid is approval-requested; an approval record carries the remarks.
- **Oracle.** Bid status approval-requested; remarks stored.
- **Trace.** P1 · automate-later

#### API-SUR-015 — A surrogate bid is exempt from anomaly detection
- **Why it matters.** Anomaly detection deliberately skips surrogate bids; if it did
  not, a buyer recording a genuinely low offline quote would be blocked.
- **Setup.** Three comparable bids and a surrogate bid far outside the range.
- **Steps.** Place the surrogate bid.
- **Expected.** Accepted without an anomaly flag.
- **Oracle.** No anomaly response; the same price as a vendor's own bid *is* flagged.
- **Trace.** P2 · automate-later · `price_anomaly_detector.rb:97`

#### API-SUR-016 — A surrogate bid picks up the vendor's first make where makes exist
- **Why it matters.** When the vendor has alternative makes, the surrogate path assigns
  the first one automatically. Without it the bid is unattributable to a make and the
  comparison is incomplete.
- **Setup.** A vendor with alternatives mapped on the event group.
- **Steps.** `POST /bids/template_input` without an alternatives mapping.
- **Expected.** The bid carries the vendor's first active make.
- **Oracle.** The mapping id on the bid equals the lowest-id active mapping for that
  vendor.
- **Trace.** P2 · automate-later · `bids_controller.rb:69-75`

#### API-SUR-017 — A surrogate bid validates prices exactly like a vendor's
- **Why it matters.** The surrogate path must not be the lenient one — a negative price
  entered by a buyer is as wrong as one entered by a vendor.
- **Steps.** `POST /bids/template_input` with a negative price, a negative quantity and
  a negative GST in turn.
- **Expected.** 106, 35 and 107 respectively.
- **Oracle.** Nothing created in any case.
- **Trace.** P0 · automate

#### API-SUR-018 — A surrogate bid with no products is refused
- **Why it matters.** Buyer-added bids are exempt from *some* product validation, so
  this case establishes what the exemption actually covers rather than assuming it
  covers everything.
- **Steps.** `POST /bids/template_input` with no trade products.
- **Expected.** Refused, or accepted-and-documented — with the resulting state recorded.
- **Oracle.** Record the behaviour; if a bid with no products becomes active, that is a
  finding worth raising against `bid.rb:216-222`'s `is_buyer_added_bid?` exemption.
- **Trace.** P1 · automate-later

#### API-SUR-019 — A surrogate bid is distinguishable from a vendor's own bid
- **Why it matters.** At award time it matters enormously which is which. If the flag is
  not set, the audit trail is gone.
- **Setup.** One vendor bid and one surrogate bid on the same event.
- **Steps.** Read both.
- **Expected.** Exactly one is marked as a surrogate/buyer-added bid.
- **Oracle.** The flag differs between the two.
- **Trace.** P0 · automate

#### API-SUR-020 — A buyer-edited bid is labelled as such
- **Why it matters.** `BidContextLabelService` stamps a `buyer_edit` context, and that
  label is what a later auditor reads.
- **Setup.** A vendor's bid, edited by the buyer.
- **Steps.** `PATCH` the bid as the buyer.
- **Expected.** The bid carries a buyer-edit context entry.
- **Oracle.** The context's latest key is a buyer-edit key.
- **Trace.** P1 · automate-later · `bids_controller.rb:129`

#### API-SUR-021 — A surrogate bid cannot be placed for a vendor who is not on the event
- **Why it matters.** Otherwise the buyer could manufacture a bid from an uninvited
  company.
- **Steps.** `POST /bids/template_input` with a company that is not on the audience.
- **Expected.** Refused.
- **Oracle.** No bid created for that company.
- **Trace.** P0 · automate-later

#### API-SUR-022 — A surrogate bid appears in the vendor's own view
- **Why it matters.** If the vendor cannot see it they may bid again, and the two records
  disagree. Whatever the product's intent, the state must be honest.
- **Setup.** A surrogate bid placed for a vendor.
- **Steps.** As that vendor, read their bids on the event.
- **Expected.** The bid is visible with its price.
- **Oracle.** The vendor's read returns a bid at that price.
- **Trace.** P1 · automate-later

---

## 10. RFQ → Auction conversion

`PATCH /trade/move_to_auction`. The guards run in a specific order and each has its own
code, which makes this the easiest section in the file to write precise negative cases
for.

#### API-CONV-001 — An active RFQ converts to an auction
- **Why it matters.** The happy path, and it is the only way to reach knockout and dutch
  strategies at all.
- **Setup.** A published RFQ with bids.
- **Steps.** `PATCH /trade/move_to_auction` with the RFQ's trade id and an auction
  config.
- **Expected.** 200; a new auction trade as a child of the RFQ.
- **Oracle.** The new trade's `parent_id` is the RFQ's id. ≈ BE-7.1.
- **Trace.** P0 · automate · `flows/eventsContract.ts`

#### API-CONV-002 — Converting the same RFQ twice is refused
- **Why it matters.** Code 94. The model enforces at most one non-cancelled auction per
  `(parent_id, event_group_id)`, and a second one would split the event's bids.
- **Steps.** Convert, then convert again.
- **Expected.** 422, code 94.
- **Oracle.** Still exactly one auction child. ≈ BE-7.2.
- **Trace.** P1 · automate

#### API-CONV-003 — Converting a non-existent trade is refused
- **Why it matters.** Code 95 — the first guard, and it must not be a nil dereference.
- **Steps.** `PATCH` with a fabricated trade id.
- **Expected.** 422, code 95.
- **Oracle.** That code. ≈ BE-7.3.
- **Trace.** P1 · automate

#### API-CONV-004 — Converting on a superseded event version is refused
- **Why it matters.** Code 101 — the same staleness rule as publish, on a path that
  creates a new trade.
- **Setup.** An RFQ whose event group has a newer version.
- **Steps.** `PATCH move_to_auction`.
- **Expected.** Refused.
- **Oracle.** No auction created. ≈ BE-7.4.
- **Trace.** P2 · automate-later

#### API-CONV-005 — Converting an already-auctioning trade is refused
- **Why it matters.** Code 93 "Trade is already of auction type" — distinct from the
  duplicate-child guard, and reached by a different route.
- **Steps.** `PATCH move_to_auction` on an auction.
- **Expected.** 422, code 93.
- **Oracle.** That specific code, not 94. ≈ BE-7.5.
- **Trace.** P2 · automate-later

#### API-CONV-006 — A caller from neither the owning nor the broker company is refused
- **Why it matters.** The company check is separate from the policy check, and brokers
  are a legitimate third party — so the rule is narrower than "same company".
- **Setup.** A caller from an unrelated company with create permission.
- **Steps.** `PATCH move_to_auction`.
- **Expected.** Refused (101).
- **Oracle.** No auction created. ≈ BE-7.6.
- **Trace.** P1 · automate-later

#### API-CONV-007 — Conversion requires both create permission and view access
- **Why it matters.** `move_to_auction?` is `create? && allowed_to_view_event?` — two
  independent gates, and passing one is not enough.
- **Setup.** A user with create permission but no view access to this event, and the
  reverse.
- **Steps.** `PATCH move_to_auction` as each.
- **Expected.** Both refused.
- **Oracle.** No auction created in either case.
- **Trace.** P1 · automate-later

#### API-CONV-008 — A line-item to lot closing-mode switch on a multi-product trade is refused
- **Why it matters.** Code 503, "You cannot award entire lot when RFQ was done for
  partial lot." — a genuine commercial constraint, not a technical one.
- **Setup.** A multi-product RFQ run as line-item.
- **Steps.** `PATCH move_to_auction` with `auction_closing_mode: lot`.
- **Expected.** 422, code 503.
- **Oracle.** No auction created. ≈ BE-7.8.
- **Trace.** P1 · automate-later

#### API-CONV-009 — Fast bidding requires more than one active or closed trade product
- **Why it matters.** Code 798 — "CBD mode requires at least two active line items."
- **Setup.** A single-product RFQ.
- **Steps.** `PATCH move_to_auction` with fast bidding enabled.
- **Expected.** 422, code 798.
- **Oracle.** No auction created. ≈ BE-7.7.
- **Trace.** P2 · automate-later

#### API-CONV-010 — Rank-based tenants validate the start and end prices
- **Why it matters.** `validate_start_and_end_price` runs only for rank-enabled
  companies, so an invalid pair passes silently elsewhere and is caught here.
- **Setup.** gate: `rfx_project_enabled` (rank-based). An invalid start/end pair.
- **Steps.** `PATCH move_to_auction`.
- **Expected.** Refused with the price-validation error.
- **Oracle.** No auction created.
- **Trace.** P2 · automate-later

#### API-CONV-011 — The RFQ becomes bid-restricted once its auction exists
- **Why it matters.** Code 769. It is the state change conversion makes to the *parent*,
  and it is easy to overlook because the new auction is what everyone looks at.
- **Steps.** Convert, then attempt a bid on the RFQ.
- **Expected.** Refused with 769.
- **Oracle.** That specific code.
- **Trace.** P1 · automate-later

#### API-CONV-012 — The RFQ's bids survive the conversion
- **Why it matters.** They are the baseline the auction's savings are computed against;
  losing them changes every number afterwards.
- **Steps.** Convert an RFQ that had two bids. Read the RFQ.
- **Expected.** Both bids still present and readable.
- **Oracle.** Bid count on the RFQ unchanged.
- **Trace.** P1 · automate-later

---

## 11. Awarding

`POST /proposal` → `POST /proposal/:id/add_response` → read the approval workflow →
`POST /proposal/:id/submit`. Awarding is also gated by a computed flag,
`is_awarding_allowed?`, which is false when a selected or requested proposal already
exists, when the caller already holds a draft proposal, or when the latest commercial
stage has not reached its close window.

#### API-AWD-001 — A proposal is created for an eligible company
- **Why it matters.** The first of the four calls, and the one the gate applies to.
- **Setup.** A closed event with at least one submitted bid.
- **Steps.** `POST /proposal` with the event group.
- **Expected.** 200 with a proposal uuid, in draft.
- **Oracle.** Uuid returned; status draft. ≈ BE-6.1. `flows/awarding.ts`.
- **Trace.** P0 · automate

#### API-AWD-002 — An award response allocates a line item to a vendor
- **Why it matters.** It is the actual allocation; a proposal with no responses awards
  nothing.
- **Setup.** A draft proposal and a submitted bid on the line item.
- **Steps.** `POST /proposal/:uuid/add_response` with the vendor, line item and quantity.
- **Expected.** 200; the allocation is on the proposal.
- **Oracle.** The proposal's responses contain that vendor and quantity.
- **Trace.** P0 · automate

#### API-AWD-003 — Adding a response with no submitted bid is refused
- **Why it matters.** Awarding a vendor who never bid is the clearest possible integrity
  failure in this section.
- **Setup.** A vendor with no bid.
- **Steps.** `POST add_response` for them.
- **Expected.** Refused.
- **Oracle.** No allocation created for that vendor.
- **Trace.** P0 · automate-later

#### API-AWD-004 — The approval workflow is readable for a proposal
- **Why it matters.** Submission needs the flow's uuid, so an empty or wrong flow makes
  submission impossible — and a *silently* empty one makes it look approved.
- **Steps.** `GET /proposal/:uuid/approval_workflows`.
- **Expected.** At least one flow with steps and approvers.
- **Oracle.** A flow uuid and at least one approver uuid.
- **Trace.** P0 · automate

#### API-AWD-005 — Submitting the proposal moves it to requested and blocks further awarding
- **Why it matters.** PRD §3.5 — the award goes through a proposal and an approval
  workflow, and one event must not carry two live proposals.
- **Steps.** `POST /proposal/:uuid/submit` with the approval flow uuid. Then attempt a
  second proposal.
- **Expected.** Submitted; the second proposal is refused.
- **Oracle.** `should_allow_awarding` is false afterwards. ≈ BE-6.2.
- **Trace.** P0 · automate

#### API-AWD-006 — Awarding is blocked while the caller holds a draft proposal
- **Why it matters.** The gate is per-user for drafts, which is subtly different from the
  selected/requested rule.
- **Setup.** The same buyer with a draft proposal.
- **Steps.** `POST /proposal` again.
- **Expected.** Refused, or `should_allow_awarding` already false.
- **Oracle.** Proposal count unchanged. ≈ BE-6.3.
- **Trace.** P1 · automate-later

#### API-AWD-007 — Discarding a draft proposal re-enables awarding
- **Why it matters.** It is the escape hatch from API-AWD-006 and it must actually clear
  the flag.
- **Steps.** Discard the draft. Re-read the event group.
- **Expected.** `should_allow_awarding` is true again.
- **Oracle.** The flag flips back; a new proposal can be created. ≈ BE-6.6.
- **Trace.** P1 · automate-later

#### API-AWD-008 — Awarding is blocked before the close window is reached
- **Why it matters.** Awarding while bidding is still legally open would cut off bids
  that were still permitted.
- **Setup.** A live event whose latest commercial stage has not reached its close window.
- **Steps.** Read `config.should_allow_awarding`; attempt a proposal.
- **Expected.** The flag is false and the proposal is refused.
- **Oracle.** Both. `event_group_controller_helper.rb:629-648`.
- **Trace.** P0 · automate-later

#### API-AWD-009 — A caller from another company cannot add a response
- **Why it matters.** `add_response?` is the policy method behind show, submit and the
  approval lookup, so a hole here opens four endpoints at once.
- **Setup.** A caller whose allowed companies exclude the proposal's company.
- **Steps.** `POST add_response`.
- **Expected.** Refused.
- **Oracle.** No allocation created. ≈ BE-6.5.
- **Trace.** P0 · automate

#### API-AWD-010 — A Procol employee passes the proposal policy unconditionally
- **Why it matters.** A deliberate support back door; it must work for them and for
  nobody else.
- **Setup.** A Procol employee.
- **Steps.** `GET /proposal/:id`.
- **Expected.** Allowed.
- **Oracle.** Readable; then confirm a non-employee outside the company is refused.
- **Trace.** P1 · automate-later

#### API-AWD-011 — Creating a contract form requires the contract-creation config
- **Why it matters.** It is an extra gate on top of `add_response?` and it is
  tenant-specific.
- **Setup.** A workspace without `is_contract_creation_enabled`.
- **Steps.** `POST /proposal/:uuid/create_contract_form`.
- **Expected.** Refused.
- **Oracle.** No contract form created. ≈ BE-6.4.
- **Trace.** P2 · automate

#### API-AWD-012 — Partial awarding splits a line item across vendors and the quantities add up
- **Why it matters.** It is why line-item awarding exists, and the arithmetic is what
  gets billed.
- **Setup.** A line item of 100 with two bids.
- **Steps.** `add_response` 60 to A and 40 to B, then submit.
- **Expected.** Both allocations recorded; total awarded = 100.
- **Oracle.** Sum of awarded quantities equals the requested quantity; neither vendor
  exceeds their offered quantity.
- **Trace.** P0 · automate-later

#### API-AWD-013 — Awarding more than the requested quantity is refused
- **Why it matters.** Over-awarding creates a commitment the requisition never covered.
- **Steps.** `add_response` 60 and 60 on a quantity of 100.
- **Expected.** The second is refused.
- **Oracle.** Total awarded never exceeds 100.
- **Trace.** P0 · automate-later

#### API-AWD-014 — Awarding more than a vendor offered is refused
- **Why it matters.** A vendor who offered 40 cannot be awarded 60; the validation is
  per-vendor, not just per-line.
- **Setup.** A vendor who offered 40.
- **Steps.** `add_response` 60 for them.
- **Expected.** Refused.
- **Oracle.** No allocation above the offered quantity.
- **Trace.** P0 · automate-later · `validate_partial_awarding_for_non_erfx`

#### API-AWD-015 — Awarding a zero or negative quantity is refused
- **Why it matters.** PRD §5's positive-quantity rule, at the last step where it matters.
- **Steps.** `add_response` with `0`, then `-10`.
- **Expected.** Refused both times.
- **Oracle.** No allocation created.
- **Trace.** P1 · automate-later

#### API-AWD-016 — Closing the bid to select a winner is refused outside the window
- **Why it matters.** Code 9, "Unable to close the order at this time. Please wait for
  the bidding to end."
- **Setup.** A live event inside its window.
- **Steps.** `POST /trade/:id/close_bid`.
- **Expected.** Refused.
- **Oracle.** No winner selected. ≈ BE-6.7.
- **Trace.** P1 · automate-later

#### API-AWD-017 — Closing the bid selects the winning bid
- **Why it matters.** The positive half; it is what actually marks a bid selected.
- **Setup.** A closed event with bids.
- **Steps.** `POST /trade/:id/close_bid` naming the winning bid.
- **Expected.** That bid becomes selected.
- **Oracle.** The bid's status is selected and no other bid is.
- **Trace.** P0 · automate-later

#### API-AWD-018 — A selected bid can no longer be revised
- **Why it matters.** It is the guarantee that an award is final; revision after
  selection would change the awarded price.
- **Steps.** Attempt `PATCH /bids/revise_bid/:id` on the selected bid.
- **Expected.** Refused (32).
- **Oracle.** The selected bid's price is unchanged.
- **Trace.** P0 · automate-later

#### API-AWD-019 — The awarding sheet downloads for a valid uuid and is refused for an invalid one
- **Why it matters.** It is a data-export endpoint; a permissive one leaks a whole
  event's commercials.
- **Steps.** `GET /reports/download_awarding_sheet/:uuid` with a valid uuid, then a
  fabricated one, then another company's.
- **Expected.** The first succeeds; the others are refused.
- **Oracle.** No file content in the refused cases. ≈ BE-6.8.
- **Trace.** P1 · automate-later

#### API-AWD-020 — The awarded event reports its awarded state consistently
- **Why it matters.** Several read paths derive from the award; if they disagree, the
  buyer and the vendor see different outcomes.
- **Steps.** After the award, read the event group, the stage and the bid.
- **Expected.** All three agree on the awarded vendor and quantity.
- **Oracle.** Three-way consistency check.
- **Trace.** P0 · automate-later

#### API-AWD-021 — The full chain runs end to end
- **Why it matters.** It is the acceptance test for PRD §3 as a whole, and it is what the
  existing suite already drives — create, publish, bid, award.
- **Setup.** A buyer, a vendor, and a live event.
- **Steps.** Create the draft → create the stage(s) → activate → vendor technical
  response → vendor bid → close → proposal → response → approval flow → submit.
- **Expected.** Every step succeeds and the event ends awarded to the bidding vendor.
- **Oracle.** Assert each step's own oracle, and finally that the awarded vendor equals
  the vendor who bid.
- **Trace.** P0 · automate · `tests/flows/lifecycle.spec.ts`

#### API-AWD-022 — A rejected proposal returns the event to awardable
- **Why it matters.** Otherwise a rejection deadlocks the event and there is no route
  out.
- **Setup.** A submitted proposal.
- **Steps.** Reject it through the approval workflow. Re-read the event group.
- **Expected.** `should_allow_awarding` is true; a new proposal can be created.
- **Oracle.** The flag and a successful new proposal.
- **Trace.** P1 · automate-later

---

## 12. Lifecycle

Withdraw, clone, amend, change ownership. The parts of an event's life that happen after
publish and before (or instead of) an award.

#### API-LC-001 — Withdrawing an active event requires a remark and succeeds
- **Why it matters.** It is the buyer's emergency stop, and the remark is the audit
  trail vendors are shown.
- **Steps.** `PATCH` with `status: "withdrawn"` and `withdraw_remark: {remarks,
  attachments}`.
- **Expected.** 200; status withdrawn.
- **Oracle.** Status withdrawn and the remark stored. ≈ BE-2.17.
- **Trace.** P0 · automate

#### API-LC-002 — Withdrawing with blank remarks is refused
- **Why it matters.** Without it, an event can vanish for vendors with no explanation.
- **Steps.** `PATCH` with `status: "withdrawn"` and empty remarks.
- **Expected.** Refused.
- **Oracle.** Status unchanged. ≈ BE-2.18.
- **Trace.** P1 · automate

#### API-LC-003 — Withdrawal notifies vendors exactly once
- **Why it matters.** The mail fires on the status transition; two mails is a support
  call and none leaves vendors bidding on a dead event.
- **Steps.** Withdraw, then re-issue the withdrawal.
- **Expected.** One notification overall.
- **Oracle.** Count the enqueued mail jobs across both calls. ≈ BE-9.2.
- **Trace.** P1 · automate-later · `event_group.rb:116`

#### API-LC-004 — Withdrawing twice is idempotent
- **Why it matters.** Retries happen; a second withdrawal record would corrupt the
  history.
- **Steps.** `PATCH` withdrawn twice.
- **Expected.** One withdrawal.
- **Oracle.** One remark, one status change.
- **Trace.** P1 · automate

#### API-LC-005 — Activating a withdrawn event is refused
- **Why it matters.** Resurrecting a withdrawn event reopens bidding vendors were told
  was over.
- **Steps.** `PATCH` a withdrawn event with `status: "active"`.
- **Expected.** Refused.
- **Oracle.** Status stays withdrawn. ≈ BE-9.1.
- **Trace.** P0 · automate-later

#### API-LC-006 — Withdrawal releases the PR's in-progress quantity
- **Why it matters.** `update_in_progress_quantity` fires on the withdrawn transition;
  without it a withdrawn event permanently consumes the requisition.
- **Setup.** A PR-linked published event.
- **Steps.** Withdraw it. Read the PR.
- **Expected.** The quantity returns to open.
- **Oracle.** PR open quantity back to its pre-event value.
- **Trace.** P1 · automate-later

#### API-LC-007 — An active event can be cloned
- **Why it matters.** It is how buyers run a recurring event, and its policy has four
  separate refusal conditions.
- **Steps.** `POST /event_groups/:uuid/create_clone`.
- **Expected.** 200; a new draft with the same line items and configuration.
- **Oracle.** New event group with matching line items and a different ref id.
- **Trace.** P1 · automate

#### API-LC-008 — A withdrawn event can be cloned
- **Why it matters.** Deliberately allowed — cloning is how a buyer relaunches an event
  they had to pull.
- **Steps.** `POST create_clone` on a withdrawn event.
- **Expected.** Allowed.
- **Oracle.** A new draft exists.
- **Trace.** P2 · automate-later

#### API-LC-009 — Cloning a draft is refused
- **Why it matters.** Code 1122, "Only active or withdrawn events can be cloned."
- **Steps.** `POST create_clone` on a draft.
- **Expected.** 422, code 1122.
- **Oracle.** No clone created. ≈ BE-8.3.
- **Trace.** P2 · automate

#### API-LC-010 — Cloning a PR-created event is refused
- **Why it matters.** Code 1123 — the clone would have no requisition behind it.
- **Steps.** `POST create_clone` on a PR-created event.
- **Expected.** 422, code 1123.
- **Oracle.** No clone created. ≈ BE-8.4.
- **Trace.** P2 · automate

#### API-LC-011 — A planner cannot clone
- **Why it matters.** A policy carve-out that would otherwise pass because cloning
  needs only create permission.
- **Setup.** A planner with create permission.
- **Steps.** `POST create_clone`.
- **Expected.** Refused.
- **Oracle.** No clone created. ≈ BE-8.2.
- **Trace.** P2 · automate-later

#### API-LC-012 — An amendment publish requires non-blank remarks
- **Why it matters.** An amendment changes what vendors bid against; the remark is what
  they are shown.
- **Setup.** An amendment draft.
- **Steps.** `PATCH` to activate with blank `amendment_remarks.remarks`, then with real
  ones.
- **Expected.** First refused, second published.
- **Oracle.** The amendment is recorded with the remark text. ≈ BE-2.20.
- **Trace.** P1 · automate-later

#### API-LC-013 — An amendment publish with the remarks key absent does not crash
- **Why it matters.** The amendment-draft path reads that key directly, so an absent one
  is a nil-dereference candidate.
- **Steps.** `PATCH` to activate an amendment draft with no `amendment_remarks` at all.
- **Expected.** A readable refusal.
- **Oracle.** Not a 500. ≈ BE-2.21.
- **Trace.** P1 · automate-later

#### API-LC-014 — Ownership changes for the owner, a super admin or a Procol employee, and nobody else
- **Why it matters.** It is how an event survives someone leaving the company, and it
  hands over full control — so the gate matters as much as the feature.
- **Steps.** `POST /event_groups/:uuid/change_ownership` as the owner, as a super admin,
  and as an unrelated buyer.
- **Expected.** First two allowed, the third refused.
- **Oracle.** Owner reflected after the allowed calls; unchanged after the refusal.
  ≈ BE-4.10, BE-4.11.
- **Trace.** P1 · automate-later

---

## 13. The authorization matrix

The contract's authorization table, turned into cases. Every row needs a positive and a
negative, because a gate that refuses everyone passes a negative-only test.

#### API-PERM-001 — `GET /api/event_groups` requires trade read permission
- **Why it matters.** The listing is the module's front door.
- **Steps.** List as a user with trade read, then as one without.
- **Expected.** Allowed, then refused.
- **Oracle.** Both outcomes.
- **Trace.** P0 · automate

#### API-PERM-002 — `GET /api/event_groups/:id` requires read *and* a visible stage
- **Why it matters.** Two conditions, and the second is the one people forget — a user
  with read access and no visible stage is refused.
- **Steps.** Read as the owner, then as a user with trade read but no stage visibility.
- **Expected.** Allowed, then refused.
- **Oracle.** No event payload in the refusal. ≈ BE-8.1.
- **Trace.** P0 · automate

#### API-PERM-003 — `POST /api/event_groups` requires trade create permission
- **Why it matters.** The privileged write in the module.
- **Steps.** Create with and without the permission.
- **Expected.** Allowed, then refused.
- **Oracle.** One event group created in total. ≈ BE-1.7.
- **Trace.** P0 · automate

#### API-PERM-004 — Stage creation requires create permission *and* sourcing-events access
- **Why it matters.** Two independent gates; a user can pass the first and fail the
  second, which is a real configuration.
- **Steps.** `POST /trade/template_input` as a user with both, then with only create.
- **Expected.** Allowed, then refused.
- **Oracle.** One stage created in total. ≈ BE-8.7.
- **Trace.** P1 · automate

#### API-PERM-005 — Stage update allows a Procol employee unconditionally
- **Why it matters.** A support back door, and back doors need their own cases so nobody
  removes them accidentally — or widens them.
- **Steps.** `PATCH /trade/:id` as a Procol employee outside the company.
- **Expected.** Allowed.
- **Oracle.** The update applies; then confirm a non-employee outside the company is
  refused.
- **Trace.** P1 · automate-later

#### API-PERM-006 — Vendor-onboarding-v2 stage updates need the onboarding permission
- **Why it matters.** A mode-specific extra gate that a generic stage-update test would
  miss entirely.
- **Setup.** A vendor-onboarding-v2 stage and a user without that permission.
- **Steps.** `PATCH /trade/:id`.
- **Expected.** Refused.
- **Oracle.** No update applied. ≈ BE-8.6.
- **Trace.** P2 · automate-later

#### API-PERM-007 — Event-group update accepts either policy branch and refuses outside both
- **Why it matters.** The policy is a two-branch OR (Procol CSM, or allowed-company plus
  trade create). Testing one branch proves half a rule.
- **Steps.** `PATCH` as a CSM Procol employee, as an in-company buyer with create, and
  as a user in neither category.
- **Expected.** First two allowed, third refused.
- **Oracle.** All three outcomes.
- **Trace.** P0 · automate-later

#### API-PERM-008 — Clone requires allowed company, create permission, non-planner, non-draft, non-PR
- **Why it matters.** Five conditions on one endpoint; each is its own way in.
- **Steps.** Vary one condition at a time from a known-good clone.
- **Expected.** The good case succeeds; each variation is refused.
- **Oracle.** Exactly one clone created across the whole set.
- **Trace.** P1 · automate-later

#### API-PERM-009 — Vendor self-participation requires show access and open tenders
- **Why it matters.** `participate?` is `show? && open_tenders?` — again two conditions.
- **Steps.** Participate as an invited vendor on an open-tender event, then as an
  uninvited vendor, then on a non-open-tender event.
- **Expected.** First allowed, other two refused.
- **Oracle.** One audience row created in total.
- **Trace.** P1 · automate-later

#### API-PERM-010 — `update_egli` needs stage-update rights *and* the evaluation window
- **Why it matters.** The policy allows it while the inline time check still refuses —
  two layers, and a test that only has permission passes wrongly.
- **Steps.** Call it with rights inside the window, with rights outside it, and without
  rights inside it.
- **Expected.** Only the first succeeds.
- **Oracle.** Evaluators change exactly once. ≈ BE-3.5.
- **Trace.** P1 · automate-later

#### API-PERM-011 — Bid feedback needs the order's team or super admin plus the config
- **Why it matters.** One of the two genuinely gated bid-policy methods.
- **Steps.** Add feedback as a team member, then as an outsider.
- **Expected.** Allowed, then refused.
- **Oracle.** One feedback record. ≈ BE-5.4.
- **Trace.** P2 · automate

#### API-PERM-012 — Surrogate approval-flow reads need approval-flow read permission
- **Why it matters.** The other gated bid-policy method, and an empty list would read as
  "no approval needed".
- **Steps.** Call it with and without the permission.
- **Expected.** Allowed, then refused — not an empty success.
- **Oracle.** Both outcomes. ≈ BE-5.5.
- **Trace.** P1 · automate

#### API-PERM-013 — Proposal endpoints all sit behind `add_response?`
- **Why it matters.** Show, submit, the approval lookup and discard share one policy
  method — so one hole opens four endpoints.
- **Steps.** Call each of the four as a caller outside the allowed companies.
- **Expected.** All four refused.
- **Oracle.** Four refusals; no proposal state changes.
- **Trace.** P0 · automate-later

#### API-PERM-014 — Contract-form creation needs `add_response?` *and* the tenant config
- **Why it matters.** A config gate stacked on a policy gate.
- **Steps.** Call it with the policy satisfied and the config off.
- **Expected.** Refused.
- **Oracle.** No contract form. ≈ BE-6.4.
- **Trace.** P2 · automate

#### API-PERM-015 — Live-auction audience edits need view access
- **Why it matters.** A narrow gate on a write that changes who can bid.
- **Steps.** Add an audience with and without view access.
- **Expected.** Allowed, then refused.
- **Oracle.** One audience row. ≈ BE-4.9.
- **Trace.** P1 · automate-later

#### API-PERM-016 — Restricted admin operations are limited to an explicit allow-list
- **Why it matters.** Some maintenance endpoints are restricted to named Procol
  employees; an allow-list that stops being enforced is a privileged-access failure.
- **Steps.** Call the restricted operation as a non-listed Procol employee.
- **Expected.** Refused.
- **Oracle.** Nothing regenerated or changed. ≈ BE-8.8.
- **Trace.** P2 · automate-later

#### API-PERM-017 — A vendor cannot call any buyer write endpoint
- **Why it matters.** A sweep rather than a single case — it is the cheapest way to
  catch a newly added endpoint with no policy.
- **Steps.** As a vendor session, call event-group create/update, stage create,
  proposal create and close_bid.
- **Expected.** All refused.
- **Oracle.** Nothing created by any of them; add new write endpoints to this sweep as
  they appear.
- **Trace.** P0 · automate-later

#### API-PERM-018 — Every 403/422 refusal leaks nothing about the resource
- **Why it matters.** A refusal that echoes the event's title or the vendor's name is an
  information leak dressed as an authorization success.
- **Steps.** Collect the bodies of ten refusals from this section.
- **Expected.** Each carries a code and a generic message only.
- **Oracle.** No titles, vendor names or prices in any refusal body.
- **Trace.** P1 · automate-later

---

## 14. Data validation and robustness

PRD §5 and §6, at the layer that persists things. The theme throughout: a 4xx with a
readable message, never a 500, never a partial write.

#### API-VAL-001 — Every required parameter is enforced on every write endpoint
- **Why it matters.** It is the broadest requirement in the PRD; a systematic sweep beats
  one case per field.
- **Steps.** For event-group create/update, stage create, bid create and proposal
  create: omit each required parameter in turn.
- **Expected.** 422 with code 2 (or the endpoint's specific code) each time.
- **Oracle.** Nothing created in any variation.
- **Trace.** P0 · automate · PRD §5

#### API-VAL-002 — Unknown parameters are ignored, not persisted
- **Why it matters.** An endpoint that stores whatever it is sent is a mass-assignment
  risk.
- **Steps.** Send `{"is_admin": true, "company_id": <another company>}` alongside a
  valid create.
- **Expected.** Created, with those values ignored.
- **Oracle.** The created row's company is the caller's own.
- **Trace.** P0 · automate-later

#### API-VAL-003 — A malformed body type is refused, not coerced
- **Why it matters.** PRD §5's "no partial record" clause.
- **Steps.** Send `line_items` as a string, `config` as an array, `quantity` as an
  object where a number belongs.
- **Expected.** 4xx with a readable message each time.
- **Oracle.** No 500; nothing created. ≈ BE-1.12.
- **Trace.** P0 · automate

#### API-VAL-004 — Invalid JSON is refused cleanly
- **Why it matters.** The framework's default answer to broken JSON is easy to leave as
  a 500.
- **Steps.** `POST` a truncated JSON body.
- **Expected.** A 4xx.
- **Oracle.** Not a 500.
- **Trace.** P1 · automate

#### API-VAL-005 — A fabricated uuid is refused with a not-found code
- **Why it matters.** Every id-taking endpoint should answer 533/95/32/250 as
  appropriate rather than raising.
- **Steps.** Call event-group show/update, trade show, bid show and proposal show with
  fabricated ids.
- **Expected.** The appropriate not-found code each time.
- **Oracle.** No 500 in any case.
- **Trace.** P0 · automate

#### API-VAL-006 — An id of the wrong type is refused
- **Why it matters.** `"abc"` or `null` where an integer or uuid belongs is a classic
  500.
- **Steps.** Call the same endpoints with `"abc"`, `null` and `-1`.
- **Expected.** 4xx each time.
- **Oracle.** No 500.
- **Trace.** P1 · automate

#### API-VAL-007 — Another company's id is refused, not treated as not-found
- **Why it matters.** The distinction matters: "not found" for a resource that exists
  elsewhere is acceptable, but succeeding is a cross-tenant breach.
- **Steps.** Read and update company B's event group from a company A session.
- **Expected.** Refused.
- **Oracle.** No payload and no write.
- **Trace.** P0 · automate-later

#### API-VAL-008 — Very long strings are bounded politely
- **Why it matters.** PRD §6. An unbounded string field becomes a database error, which
  becomes a 500.
- **Steps.** Send a 100,000-character title, description and clause.
- **Expected.** Either accepted or refused with a stated limit. No 500, no silent
  truncation.
- **Oracle.** Compare the stored value to what was sent.
- **Trace.** P1 · automate · PRD §6

#### API-VAL-009 — Emoji and multi-byte text round-trip byte for byte
- **Why it matters.** Four-byte characters are where encoding and column charset
  assumptions break.
- **Steps.** Create an event with emoji and CJK text in the title and a line-item
  description. Read it back.
- **Expected.** Byte-identical.
- **Oracle.** Exact equality on read-back, and again in the database. ≈ PRD §6.
- **Trace.** P1 · automate

#### API-VAL-010 — Numeric edge values are handled or refused explicitly
- **Why it matters.** `0`, huge values, high precision and `e`-notation each fail
  differently.
- **Steps.** Send `0`, `999999999999.99`, `1e10`, `0.000001` as prices and quantities.
- **Expected.** Each either accepted with the exact value preserved or refused with a
  message.
- **Oracle.** The stored value equals the sent value wherever accepted.
- **Trace.** P1 · automate

#### API-VAL-011 — Epoch times outside a sane range are refused
- **Why it matters.** Schedules take epoch seconds; `0` and year-3000 values would
  create events nobody can bid on and reports nobody can read.
- **Steps.** Send `bid_start_time: 0`, a negative value, and a value 100 years out.
- **Expected.** Refused, or accepted with a documented clamp.
- **Oracle.** No schedule row with an absurd time.
- **Trace.** P1 · automate-later

#### API-VAL-012 — Epoch times as strings are handled consistently
- **Why it matters.** Clients send `"1757404800"` as often as the integer; silently
  parsing one and not the other creates a phantom scheduling bug.
- **Steps.** Send both forms.
- **Expected.** Both accepted identically, or the string refused with a message.
- **Oracle.** The resulting schedules are identical, or the refusal is explicit.
- **Trace.** P2 · automate

#### API-VAL-013 — A script payload in a text field is stored inert
- **Why it matters.** Event titles reach every invited vendor's screen — stored XSS here
  has the widest blast radius in the product.
- **Steps.** Create an event whose title is `<img src=x onerror=alert(1)>`. Read it as
  the buyer and as a vendor.
- **Expected.** Stored and returned as text.
- **Oracle.** The response is escaped or plainly text; the UI counterpart is UI-VAL-003.
- **Trace.** P0 · automate-later

#### API-VAL-014 — SQL-ish input is treated as data
- **Why it matters.** The cheapest probe for a whole class of failure, and search
  endpoints are the usual place it is missed.
- **Steps.** Send `'; DROP TABLE event_groups; --` to product search, vendor search and
  the events filter.
- **Expected.** Empty or literal results; no error.
- **Oracle.** Normal responses; the table still exists (a subsequent read succeeds).
- **Trace.** P1 · automate

#### API-VAL-015 — Duplicate creation requests do not produce duplicate events
- **Why it matters.** A retried create is the most common client behaviour on a slow
  network.
- **Steps.** Send the identical create twice.
- **Expected.** Either one event, or two with distinct ids and a documented behaviour.
- **Oracle.** Record which; if two events result, flag it as a finding for the UI's
  double-submit case (UI-PUB-007).
- **Trace.** P1 · automate-later

#### API-VAL-016 — A concurrent double activation produces one published event
- **Why it matters.** The `lock_transaction` on this endpoint exists for it — and a
  double-render on a held lock is the top-ranked cause of the standing 500.
- **Steps.** Fire two activations for the same event group simultaneously.
- **Expected.** One activation; the other refused with a lock/conflict code.
- **Oracle.** One set of stages and audiences. If the loser returns an untyped 500, that
  confirms the double-render candidate — record the exception class.
- **Trace.** P0 · automate-later · `event_groups_controller.rb:74`

#### API-VAL-017 — A duplicate user email is refused on user create
- **Why it matters.** PRD §6, and duplicated identities break team-based permissions.
- **Steps.** `POST /users/create_user` twice with the same email.
- **Expected.** The second refused with a readable message.
- **Oracle.** One user. `flows/masterData.ts`.
- **Trace.** P1 · automate · PRD §4

#### API-VAL-018 — The phone rule is verified against the PRD's stated criterion
- **Why it matters.** The PRD states "any 10-digit number, stored with a `+91` prefix by
  default" **and explicitly asks QA to verify the claim**. If the product is stricter or
  looser, the difference is the deliverable.
- **Steps.** `POST /users/create_user` with `9876543210`, `1234567890`, `0000000000`, a
  9-digit and an 11-digit number.
- **Expected (as specified).** All 10-digit values accepted and stored as `+91…`; 9 and
  11 digits refused.
- **Oracle.** Record the stored value for each input and diff against the specified rule.
  This case is expected to produce a finding either way.
- **Trace.** P1 · automate · PRD §4.3

---

## 15. Persistence

PRD §3.6: *every created event must be persisted and retrievable, verifiable in the
database.* These cases go behind the API and read the rows, because an API that echoes
back what you sent is indistinguishable from one that saved it.

#### API-DB-001 — A created event group exists as a row
- **Why it matters.** It is the PRD requirement in its most literal form.
- **Steps.** Create a draft. Query `event_groups` by uuid.
- **Expected.** One row with status draft and the caller's company and user.
- **Oracle.** Row present with those columns. `src/db/verify.ts`.
- **Trace.** P0 · automate · PRD §3.6

#### API-DB-002 — The event group belongs to the acting workspace
- **Why it matters.** For a multi-company user, the wrong `company_id` writes an event
  into another tenant.
- **Steps.** Create as a multi-company user in company A. Read the row.
- **Expected.** `company_id` is A.
- **Oracle.** Column equals A's id.
- **Trace.** P0 · automate-later

#### API-DB-003 — The reference id is assigned and unique
- **Why it matters.** `add_ref_id` uses `update_columns`, bypassing validations — so
  uniqueness is not enforced by the model.
- **Steps.** Create three events. Read their ref ids.
- **Expected.** Three non-null, distinct ids.
- **Oracle.** Distinctness across the three.
- **Trace.** P1 · automate-later

#### API-DB-004 — Line-item rows carry their serial numbers and statuses
- **Why it matters.** Serials order the sheet and the award; statuses drive every read
  filter.
- **Steps.** Create two line items. Read `event_group_line_items`.
- **Expected.** Two active rows with serials 1 and 2.
- **Oracle.** Rows, serials and statuses.
- **Trace.** P1 · automate

#### API-DB-005 — A published stage has a bidding-time schedule row with a non-null end time
- **Why it matters.** It is the row whose absence is the top suspect for the activation
  500, and `end_time` is `NOT NULL` at the database level.
- **Steps.** Publish. Query `trade_schedules` for the stage.
- **Expected.** A bidding-time row with both times set.
- **Oracle.** Row present; `end_time` not null. This is the definitive form of
  API-STG-014.
- **Trace.** P0 · automate

#### API-DB-006 — Audience rows are unique per company, item and visibility while active
- **Why it matters.** The model's own invariant, and duplicate active rows double-count a
  vendor everywhere downstream.
- **Steps.** Publish, then re-publish. Query `audiences`.
- **Expected.** One active row per company per stage.
- **Oracle.** No duplicate `(audience_id, item_id, item_type, visible)` among active
  rows.
- **Trace.** P1 · automate-later

#### API-DB-007 — A submitted bid and its products are persisted with the right prices
- **Why it matters.** The bid is the commercial artefact; if the row disagrees with the
  API response, the award is built on the wrong number.
- **Steps.** Submit a bid. Query the bid and its products.
- **Expected.** One active bid with one product row per line item, prices as submitted.
- **Oracle.** Row-level equality with the submitted payload.
- **Trace.** P0 · automate

#### API-DB-008 — A withdrawn event's status and remark are persisted
- **Why it matters.** The remark is the audit trail and it lives in the row, not in the
  response.
- **Steps.** Withdraw. Query the event group.
- **Expected.** Status withdrawn with the remark stored.
- **Oracle.** Status column and remark content.
- **Trace.** P1 · automate-later

#### API-DB-009 — A voided stage is marked void and stays out of every read
- **Why it matters.** `void` means "remove from everywhere" — a void stage that still
  appears in a read is a ghost that can accept bids.
- **Steps.** Publish two of three stages. Query the third.
- **Expected.** Status void; absent from every API read.
- **Oracle.** Row status and API absence together.
- **Trace.** P1 · automate-later

#### API-DB-010 — Nothing is written when a create or activation is refused
- **Why it matters.** PRD §5's "no partial record" clause, verified where it actually
  matters. During the activation regression this was the one reassuring fact: nothing
  was written.
- **Steps.** For five refusal paths in this file, count the relevant rows before and
  after.
- **Expected.** Identical counts.
- **Oracle.** Row counts for `event_groups`, `event_group_line_items`, `trade_requests`,
  `trade_schedules`, `audiences` and `bids` unchanged.
- **Trace.** P0 · automate · PRD §5

---

## 16. Non-functional

#### API-NFR-001 — The events listing responds inside the performance budget
- **Why it matters.** PRD §7.1, measured at the API layer where the number is clean.
- **Steps.** `GET /api/event_groups` on tenants with ~10, ~100 and ~1000 events.
- **Expected.** Under ~3 seconds throughout.
- **Oracle.** Record the three timings and trend them.
- **Trace.** P2 · automate · PRD §7.1

#### API-NFR-002 — Activating a 500-line-item event completes
- **Why it matters.** PRD §6's large-event case at the heaviest write in the module.
- **Setup.** A BOQ event with 500 line items.
- **Steps.** Activate and time it.
- **Expected.** Completes without a timeout.
- **Oracle.** 200 within the client's timeout; record the duration.
- **Trace.** P1 · automate-later

#### API-NFR-003 — Reading an event with 500 line items and 100 bids stays usable
- **Why it matters.** The show action builds the whole project payload — widgets,
  layers, proposals, approvals — and it is where a large event first becomes unusable.
- **Steps.** `GET /api/event_groups/:id` on such an event.
- **Expected.** A complete response in reasonable time.
- **Oracle.** Response completeness and duration recorded.
- **Trace.** P2 · manual

#### API-NFR-004 — Concurrent bids from many vendors are all recorded
- **Why it matters.** An auction's last minute *is* a concurrency test, and a lost bid
  is a lost vendor.
- **Steps.** Submit bids from 20 vendors simultaneously on one stage.
- **Expected.** All 20 recorded, correctly ranked.
- **Oracle.** 20 bid rows; ranks consistent with the prices.
- **Trace.** P1 · automate-later

#### API-NFR-005 — Rate limiting, if present, answers with a code rather than a 500
- **Why it matters.** A suite that trips a rate limit should be able to tell that apart
  from a real failure.
- **Steps.** Issue a burst of reads.
- **Expected.** Either all succeed or a rate-limit response identifies itself.
- **Oracle.** No untyped 500 in the burst.
- **Trace.** P2 · automate

#### API-NFR-006 — Errors follow one shape across the module
- **Why it matters.** The whole regression guard rests on this convention: failures are
  `{code, message}` with a 422, so an untyped 500 is definitionally an exception.
- **Steps.** Collect twenty refusals from across this file.
- **Expected.** Every one carries a numeric code and a human message.
- **Oracle.** No refusal without a code; report any that lack one.
- **Trace.** P0 · automate

#### API-NFR-007 — Timestamps and timezones are consistent across reads
- **Why it matters.** Buyer and vendor must agree on when bidding ends; a mixed
  representation is a fairness bug.
- **Steps.** Read one event's window through the event-group, trade and vendor-facing
  endpoints.
- **Expected.** The same instant everywhere, in one representation.
- **Oracle.** Normalise all three to UTC and compare.
- **Trace.** P1 · automate

#### API-NFR-008 — Idempotency holds for every write in this file
- **Why it matters.** A sweep rather than a single case; retries are the norm and the
  cost of a duplicate differs wildly by endpoint.
- **Steps.** Repeat each write endpoint's happy-path call once.
- **Expected.** No duplicates of events, stages, audiences, bids or proposals.
- **Oracle.** Row counts unchanged after the repeat; where a duplicate is created
  deliberately, document why.
- **Trace.** P0 · automate-later

---

## Exit criteria

The API slice of the events module is releasable when:

1. Every **P0** case passes, or has a filed defect with an agreed owner.
2. The full chain (API-AWD-021) is green: draft → stages → activate → technical response
   → bid → close → proposal → approval → submit.
3. Activation succeeds for every stage type the tenant supports, and no case in the run
   observed an untyped 500 (API-PUB-002, API-NFR-006).
4. Bid isolation holds at the API layer (API-BID-030) and for technical responses
   (API-TECH-007).
5. Both halves of every authorization row in §13 are proven — the allow and the refuse.
6. Nothing is written on any refused create or activation (API-DB-010).
7. The phone-field claim in PRD §4.3 has been verified and the actual behaviour recorded
   (API-VAL-018), whichever way it lands.

## What the existing suite already covers

`procol test/` currently drives auth, reads, the events contract, event creation, the
vendor bid, surrogate bidding, awarding, features and master data, with 103 machine-shaped
cases in `prototype/knowledge/events/backend-test-cases.json`. The `≈ BE-x.y` markers in
this file map to those, so the two can be reconciled rather than diverging: a case here
with no marker is new coverage, and a `BE-` case with no counterpart here is either
already sufficient or a candidate for retirement.
