# Publishing and running an event — edge and negative API cases

Negative and edge cases for everything that happens after an event is built: publishing
it (`PATCH /event_groups/:id` with `status: "active"`), inviting and removing vendors,
self-participation and rejection, extending and force-ending a round, withdrawing,
read-back and visibility, ownership transfer, amendment (`/item_versions`), cloning
and recurring (scheduled) events.

Every case is the working request the journey sends with **one** thing changed, and
every expectation cites the guard in `procol-backend` (origin/main) that decides it.
Runnable twins live in `prototype/data/api-cases-extra/pub.json` under the same number
(`API-XPUB-NNN` here ↔ `EDGE-PUB-NNN` there).

**Read this first.** Failures come back as HTTP 422 `{code, message}` through
`render_error_json`; the one exception here is 904 (HTTP 403). An untyped 500 is an
unhandled exception. Three platform facts drive many of the cases below:

- `ParamsAuth#check_for_uuid` runs before every action and decodes every key that
  contains `uuid`/`uuids`. A junk uuid becomes `nil`; a `null` or numeric value for a
  `…_uuids` key crashes it (`params_auth.rb:73`).
- `EventGroups::UpdateService#initialize` is Sorbet-typed, so a wrong-type `title`,
  `description`, `show_under_open_events`, `terms_and_conditions` or `withdraw_remark`
  raises `TypeError` (500) before any business rule runs.
- The sandbox the runner uses is an **active** event. Cases whose Setup says "draft
  copy" need a fresh draft; on the active sandbox they can only prove "no 5xx".

**Contents**

1. Publish — state and order of actions
2. Publish — body shape and types
3. Audience at publish
4. Live audience — add and remove vendors on a running stage
5. Participants — self-participation and rejection
6. Extend the submission deadline
7. Force-end, withdraw and cancel
8. Read-back and visibility
9. Change ownership
10. Versioning and amendment
11. Clone
12. Scheduled (recurring) events
13. Concurrency

## 1. Publish — state and order of actions

#### API-XPUB-001 — Re-publishing an already live event changes nothing
- **Why it matters.** A client that retries a publish after a timeout sends exactly this.
  Publish must be idempotent: no duplicate audience rows, no re-sent invites, no re-stamped
  window.
- **Setup.** The sandbox event {{eventGroupUuid}} is already active with stage {{tradeId}}
  live and vendor {{vendorUuid}} invited.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. Read GET
  /event_groups/{{eventGroupUuid}}/get_audience and note the participant count. 2. PATCH
  /event_groups/{{eventGroupUuid}} with the exact publish body the journey sent. 3. Read the
  audience and stages again.
- **Expected.** HTTP 200. The event is not a draft, so update_event_group_data takes the
  'publish a new stage' branch (event_group_controller_helper.rb:29-31); every listed stage
  is already non-draft and is skipped by `next unless tr.draft?` (update_service.rb:267).
  Audience count, stage count and stage statuses are unchanged.
- **Oracle.** Audience count and stage statuses are identical before and after; no second
  invite email is queued.
- **Trace.** P1 · automate · `EDGE-PUB-001` · `app/services/event_groups/update_service.rb:267`

#### API-XPUB-002 — A publish body with no status publishes nothing but answers 200
- **Why it matters.** A 200 that did nothing is the worst possible answer to a publish: the
  UI shows success while vendors are never invited.
- **Setup.** A draft copy of the sandbox event with its stage attached (not yet published).
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with the publish body minus `status`. 2. Read the event
  back.
- **Expected (today).** No branch of update_event_group_data matches (status is nil,
  line_items empty, config absent — event_group_controller_helper.rb:29-36), so nothing is
  written and the controller renders 200 with the unchanged event. Correct behaviour would
  be a 422 code 2 (Insufficient parameters); today the client is told 'OK' for a publish
  that did not happen — even the new title is dropped.
- **Oracle.** Read-back status is still `draft` and the title is still the old one.
- **Trace.** P1 · automate · `EDGE-PUB-002` · `app/controllers/concerns/event_group_controller_helper.rb:29`

#### API-XPUB-003 — An unknown status together with a config change crashes with a 500
- **Why it matters.** Unvalidated enum assignment is the classic Rails 500. Any typo'd
  status from a client takes the endpoint down for that request.
- **Setup.** The sandbox event {{eventGroupUuid}} (any state).
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with status "banana" and config {show_under_open_events:
  true}. 2. Check the response shape.
- **Expected (today).** Must be a 422 {code, message}. Today `config.present?` routes into
  UpdateService#execute (event_group_controller_helper.rb:33-34), which does
  `@event_group.status = @status` (update_service.rb:79); assigning 'banana' to the
  EventGroup enum (in_active/active/draft/withdrawn) raises ArgumentError, which no
  rescue_from catches, so the answer is an untyped 500.
- **Oracle.** Response is 422 with a numeric code, not `{status: 500}`; event status
  unchanged.
- **Trace.** P0 · automate · `EDGE-PUB-003` · `app/services/event_groups/update_service.rb:79`

#### API-XPUB-004 — status "in_active" plus a config change soft-deletes a live event with no withdraw flow
- **Why it matters.** It is a second, unguarded exit from a live event that skips everything
  the withdraw path does (remarks, stage closure, PR release, notifications).
- **Setup.** A dedicated active sandbox copy (this case is destructive — run it last or on
  its own copy).
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with status "in_active" and config
  {show_under_open_events: true}. 2. Read the event and its stages back.
- **Expected (today).** Should be refused (only 'withdrawn' is a legal way down, with
  remarks). Today execute() sets status 'in_active' directly (update_service.rb:79) — no
  withdraw remark, stages left active, PR quantities not released, no vendor notification.
- **Oracle.** Event status and every stage's status after the call; if the event is
  in_active while stages are still active, the defect is confirmed.
- **Trace.** P0 · automate · `EDGE-PUB-004` · `app/services/event_groups/update_service.rb:79`

#### API-XPUB-005 — status "draft" on a live event turns it back into a draft
- **Why it matters.** A live event silently vanishing from invited vendors mid-bidding is a
  business-critical failure, reachable with a one-field PATCH.
- **Setup.** A dedicated active sandbox copy with vendor {{vendorUuid}} invited
  (destructive).
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with {status: "draft"}. 2. Read the event back as the
  buyer and as the vendor.
- **Expected (today).** Should be refused — amendment of a live event goes through
  /item_versions. Today ['withdrawn','draft'].include?(status) routes into execute
  (event_group_controller_helper.rb:33), which has no 'is the event a draft?' check and sets
  status draft (update_service.rb:62-79); get_valid_stages_for_user then hides the event
  from everyone but the owner (event_group.rb:512-514).
- **Oracle.** Read-back status; the vendor's GET of the event.
- **Trace.** P0 · automate · `EDGE-PUB-005` · `app/controllers/concerns/event_group_controller_helper.rb:33`

#### API-XPUB-006 — Publishing a withdrawn event does not bring it back
- **Why it matters.** Resurrecting a withdrawn event would re-open bidding vendors were told
  had ended.
- **Setup.** A withdrawn sandbox copy.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with the publish body. 2. Read the event back.
- **Expected (today).** The event is not a draft, so only the new-stage branch runs; its
  stages are not drafts (`next unless tr.draft?`, update_service.rb:267), so nothing changes
  and it stays withdrawn. Ideally a 422 saying a withdrawn event cannot be published; today
  a silent 200.
- **Oracle.** Read-back status remains `withdrawn`; no stage becomes active.
- **Trace.** P1 · automate · `EDGE-PUB-006` · `app/services/event_groups/update_service.rb:262`

#### API-XPUB-007 — status "draft" on a withdrawn event resurrects it
- **Why it matters.** Withdrawn is meant to be terminal (it is what the clone rules treat as
  a closed event).
- **Setup.** A withdrawn sandbox copy.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with {status: "draft"}. 2. Read the event back.
- **Expected (today).** Should be refused. Today execute() has no source-state guard and
  writes status draft over withdrawn (update_service.rb:62-79), making a closed event
  editable and re-publishable.
- **Oracle.** Read-back status; if it is `draft`, the defect is confirmed.
- **Trace.** P1 · automate · `EDGE-PUB-007` · `app/services/event_groups/update_service.rb:79`

#### API-XPUB-008 — An empty draft_trade_request_uuids list publishes every stage
- **Why it matters.** Documents that [] means 'all', not 'none' — the opposite of what a
  reader expects, and the reason the next cases are dangerous.
- **Setup.** A draft copy of the sandbox event with two stages attached.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with draft_trade_request_uuids: []. 2. Read every stage's
  status.
- **Expected.** HTTP 200, event active. An empty list is `.present? == false`, so
  process_trade_requests_for_publish does not exclude anything and publishes every stage
  (update_service.rb:528-533).
- **Oracle.** Every attached stage is active (or requested under approvals); none is void.
- **Trace.** P1 · automate · `EDGE-PUB-008` · `app/services/event_groups/update_service.rb:528`

#### API-XPUB-009 — A junk stage uuid in the publish list voids every real stage and still goes live
- **Why it matters.** One bad id in a client's list silently destroys the event's stages —
  and the reply is 200.
- **Setup.** A draft copy of the sandbox event with its stage attached.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with draft_trade_request_uuids: ["WrongUuid1="]. 2. Read
  the event and its stages back.
- **Expected (today).** Should be 422 (unknown stage). Today ParamsAuth decodes the junk to
  nil (params_auth.rb:72-73) giving [nil]; that list is present, so every real stage
  `exclude?`s and is set to void (update_service.rb:528-530), yet the event itself is saved
  as active (update_service.rb:251-253). Result: an 'active' event with no live stage.
- **Oracle.** Event status vs stage statuses: event active with every stage void confirms
  the defect.
- **Trace.** P0 · automate · `EDGE-PUB-009` · `app/services/event_groups/update_service.rb:528`

#### API-XPUB-010 — A valid uuid of some other record in the stage list voids this event's stages
- **Why it matters.** Same failure as the junk-uuid case but with a well-formed id — the
  kind a buggy client really sends (wrong variable).
- **Setup.** A draft copy of the sandbox event with its stage attached; {{lineItemUuid}} is
  a line item (not a stage).
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with draft_trade_request_uuids: ["{{lineItemUuid}}"]. 2.
  Read stages back.
- **Expected (today).** Should be 422. uuids are untyped (EncryptDecrypt just encodes an
  integer), so the line-item uuid decodes to an integer that is not one of this event's
  stage ids; every real stage is voided (update_service.rb:528-530) and the event still goes
  active (update_service.rb:251-253).
- **Oracle.** Stage statuses after the call.
- **Trace.** P0 · automate · `EDGE-PUB-010` · `app/services/event_groups/update_service.rb:528`

#### API-XPUB-011 — draft_trade_request_uuids: null crashes the request before it reaches the controller
- **Why it matters.** JSON null for an optional list is a normal client output; a
  before_action crash on it is a platform-wide 500.
- **Setup.** The sandbox event {{eventGroupUuid}}.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with draft_trade_request_uuids: null. 2. Check the
  response shape.
- **Expected (today).** Must be a 422. Today the global before_action check_for_uuid runs
  `value.map` on every key containing 'uuids' (params_auth.rb:72-73); nil.map raises
  NoMethodError → untyped 500. This affects every endpoint, not only publish.
- **Oracle.** Response is 422 {code, message}, not a 500.
- **Trace.** P0 · automate · `EDGE-PUB-011` · `app/controllers/concerns/params_auth.rb:73`

#### API-XPUB-012 — A draft with no stages can be published into an empty live event
- **Why it matters.** 'Publish without a schedule/without a stage' is the most basic publish
  precondition and nothing enforces it.
- **Setup.** A fresh draft event group (POST /event_groups) with a line item but no stage
  attached.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with the publish body and draft_trade_request_uuids: [].
  2. Read the event back.
- **Expected (today).** Should be 422 (nothing to publish). Today
  process_trade_requests_for_publish loops over zero stages (update_service.rb:525-537) and
  the event is saved active (update_service.rb:251-253) — an active event nobody can bid on.
- **Oracle.** Read-back: status active with zero stages confirms the defect.
- **Trace.** P0 · automate · `EDGE-PUB-012` · `app/services/event_groups/update_service.rb:239`

#### API-XPUB-013 — Publishing an RFP that ends after its RFQ is refused with 712
- **Why it matters.** The technical stage must finish before commercial bids close;
  publishing the wrong order makes evaluation impossible.
- **Setup.** A draft event with an RFP stage (technical) and an RFQ stage, where the RFP
  bid_end_time is later than the RFQ bid_end_time. {{tradeId}} is one of them.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with both stage uuids in draft_trade_request_uuids. 2.
  Read the event back.
- **Expected.** HTTP 422, code 712 'RFP duration exceeds RFQ end time. Please adjust.' from
  UpdateService#validate_rfp_rfq_bid_end_time (update_service.rb:303-312), checked before
  any stage is touched. Event stays draft.
- **Oracle.** 422 with code 712; event status still draft; no stage active.
- **Trace.** P0 · automate · `EDGE-PUB-013` · `app/services/event_groups/update_service.rb:311`

#### API-XPUB-014 — A stage whose window has already started is slid forward to 'now' at publish
- **Why it matters.** Documents that 'publish with a stage in the past' is accepted by
  design and pins the duration-preserving shift.
- **Setup.** A draft event whose stage was created with bid_start_time in the past (e.g. 10
  minutes ago) and a 30-minute window.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. Note the stage's bid_start_time
  and bid_end_time. 2. Publish with the working body. 3. Read the stage schedule back.
- **Expected.** HTTP 200. publish_auction calls TradeSchedule.change_auction_time
  (trade_controller_helper.rb:4542), which — when start_time <= now — moves start to now and
  end to now + original duration (trade_schedule.rb:138-147). The stage is live for its full
  duration.
- **Oracle.** New start ≈ publish time; end − start equals the original duration.
- **Trace.** P1 · automate · `EDGE-PUB-014` · `app/models/trade_schedule.rb:138`

#### API-XPUB-015 — Under a create-trade approval flow the event reports active while its stage is 'requested'
- **Why it matters.** Two statuses that disagree is exactly where visibility leaks: a vendor
  must not be able to bid on a 'requested' stage.
- **Setup.** Config-dependent: a workspace whose approval flow requires approval for
  create_trade. Draft event with an RFQ stage.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. Publish with the working body. 2.
  Read the event and the stage status.
- **Expected (today).** HTTP 200. publish_auction sets the non-RFP stage to 'requested' when
  approval is needed (trade_controller_helper.rb:4536) while the event group is saved
  'active'. Vendors must not see the stage until approved.
- **Oracle.** Stage status `requested`; the invited vendor cannot place a bid on it.
- **Trace.** P1 · automate · `EDGE-PUB-015` · `app/controllers/concerns/trade_controller_helper.rb:4536`

#### API-XPUB-016 — A vendor cannot publish the buyer's event
- **Why it matters.** Wrong actor on the most powerful write in the module.
- **Setup.** Signed in as the invited vendor of the sandbox event.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. As the vendor, PATCH
  /event_groups/{{eventGroupUuid}} with the publish body.
- **Expected.** HTTP 422, code 455 'You are not authorized to perform this action' —
  EventGroupPolicy#update? requires the event's company in Current.allowed_companies and
  create_record permission (event_group_policy.rb:37-40), raised at
  event_groups_controller.rb:73 and mapped by pundit_user_not_authorized.
- **Oracle.** 422 code 455; event unchanged.
- **Trace.** P0 · automate · `EDGE-PUB-016` · `app/policies/event_group_policy.rb:39`

#### API-XPUB-017 — Publishing an event uuid that does not exist answers 533
- **Why it matters.** A stale link or truncated uuid must give a clean not-found, not a type
  error.
- **Setup.** Authenticated buyer.
- **Steps.** `PATCH /event_groups/WrongUuid1=`. 1. PATCH /event_groups/WrongUuid1= with the
  publish body.
- **Expected.** HTTP 422, code 533 'Project does not exist.' — check_for_uuid decodes the id
  to nil and find_and_validate_event_group_and_pr returns 533
  (event_group_controller_helper.rb:2580-2581).
- **Oracle.** 422 code 533.
- **Trace.** P1 · automate · `EDGE-PUB-017` · `app/controllers/concerns/event_group_controller_helper.rb:2581`

#### API-XPUB-018 — Publishing with a purchase_request_id that is not this workspace's BOQ PR is refused
- **Why it matters.** Linking another tenant's PR to your event would leak or consume their
  quantities.
- **Setup.** The sandbox event {{eventGroupUuid}}.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with the publish body plus purchase_request_id: 1 (a raw
  id that is not an active BOQ PR of this workspace).
- **Expected.** HTTP 422, code 101 'You are not allowed to perform this action' — the PR
  lookup is scoped to PurchaseRequest.active.boq for Current.workspace
  (event_group_controller_helper.rb:2583-2587). Note: a junk purchase_request_uuid decodes
  to nil and is silently ignored instead.
- **Oracle.** 422 code 101; no PR mapping written.
- **Trace.** P1 · automate · `EDGE-PUB-018` · `app/controllers/concerns/event_group_controller_helper.rb:2586`

## 2. Publish — body shape and types

#### API-XPUB-019 — A numeric title crashes the update service's type signature
- **Why it matters.** Wrong-type scalars are the commonest client bug; every one of them is
  a 500 on this endpoint today.
- **Setup.** The sandbox event {{eventGroupUuid}}.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with title: 12345.
- **Expected (today).** Must be 422. UpdateService#initialize is Sorbet-typed `title:
  T.nilable(String)` (update_service.rb:16); an Integer violates the sig and sorbet-runtime
  raises TypeError (no T::Configuration override exists), which is unrescued → 500.
- **Oracle.** No 5xx; title unchanged.
- **Trace.** P0 · automate · `EDGE-PUB-019` · `app/services/event_groups/update_service.rb:16`

#### API-XPUB-020 — show_under_open_events: "yes" crashes with a 500
- **Why it matters.** Form-encoded clients send booleans as strings; this field is in the
  working publish body.
- **Setup.** The sandbox event {{eventGroupUuid}}.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with show_under_open_events: "yes".
- **Expected (today).** Must be 422. The sig is `show_under_open_events:
  T.nilable(T::Boolean)` (update_service.rb:19); a String raises TypeError → 500.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EDGE-PUB-020` · `app/services/event_groups/update_service.rb:19`

#### API-XPUB-021 — An unknown key inside terms_and_conditions crashes with a 500
- **Why it matters.** Extra keys from a newer client version must not take the endpoint
  down.
- **Setup.** A draft copy of the sandbox event with its stage attached.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with terms_and_conditions: {clauses: [], attachments: [],
  QA_Platform_extra: 1}.
- **Expected (today).** Must be 422. publish builds
  `TermsAndConditions.new(**@terms_and_conditions.symbolize_keys)` (update_service.rb:242);
  an unknown keyword raises ArgumentError (terms_and_conditions.rb:34) → 500.
- **Oracle.** No 5xx; event still draft.
- **Trace.** P1 · automate · `EDGE-PUB-021` · `app/services/event_groups/update_service.rb:242`

#### API-XPUB-022 — terms_and_conditions.clauses as a string crashes with a 500
- **Why it matters.** A single clause sent as a string instead of a one-element array is an
  obvious client slip.
- **Setup.** A draft copy of the sandbox event with its stage attached.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with terms_and_conditions: {clauses:
  "QA_Platform_tnc_{{stamp}}", attachments: []}.
- **Expected (today).** Must be 422. TermsAndConditions#initialize is typed `clauses:
  T::Array[String]` (terms_and_conditions.rb:33) → TypeError → 500.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EDGE-PUB-022` · `app/poro_classes/terms_and_conditions.rb:33`

#### API-XPUB-023 — attachments as a string crashes the URL check with a 500
- **Why it matters.** The attachment guard added for tenant isolation itself crashes on the
  simplest malformed input.
- **Setup.** The sandbox event {{eventGroupUuid}}.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with attachments: "QA_Platform_file_{{stamp}}.pdf".
- **Expected (today).** Must be 422. extract_urls_from_attachments calls `attachments.each`
  (event_groups_controller.rb:1749) — String has no #each → NoMethodError → 500, before the
  101 URL check.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EDGE-PUB-023` · `app/controllers/api/event_groups_controller.rb:1749`

#### API-XPUB-024 — An attachment URL from another company's S3 folder is refused
- **Why it matters.** Attaching another tenant's file path to your event (and so getting a
  signed URL for it) is a cross-tenant read.
- **Setup.** The sandbox event {{eventGroupUuid}}.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with attachments: [{url:
  "https://procol.s3.amazonaws.com/trade_files/docs/QA_Platform_999999999/QA_Platform_{{stamp}}.pdf"}].
- **Expected.** HTTP 422, code 101 'You are not allowed to perform this action' —
  validate_company_urls extracts company id 999999999 from /trade_files/<x>/<name>_<id>/ and
  it is not in Current.allowed_companies (s3_url_validator.rb:25-33;
  event_groups_controller.rb:78).
- **Oracle.** 422 code 101; attachments unchanged.
- **Trace.** P0 · automate · `EDGE-PUB-024` · `app/controllers/api/event_groups_controller.rb:78`

#### API-XPUB-025 — A non-S3 attachment URL (external host or javascript:) is accepted unchecked
- **Why it matters.** A stored javascript:/phishing link shown to every invited vendor is a
  stored-XSS / phishing vector.
- **Setup.** The sandbox event {{eventGroupUuid}}.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with attachments: [{url:
  "javascript:alert('QA_Platform_{{stamp}}')"}]. 2. Read the event back.
- **Expected (today).** Should be refused. url_belongs_to_allowed_companies? returns true
  for any URL that does not contain 'amazonaws.com/trade_files/' (s3_url_validator.rb:26),
  so the value is stored and later rendered to vendors as a link.
- **Oracle.** Read-back attachments: if the javascript: URL is stored, the defect is
  confirmed.
- **Trace.** P1 · automate · `EDGE-PUB-025` · `app/controllers/concerns/s3_url_validator.rb:26`

#### API-XPUB-026 — config as a string on publish crashes with a 500
- **Why it matters.** Config is T.untyped in the sig, so nothing screens it before it is
  used.
- **Setup.** A draft copy of the sandbox event with its stage attached.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with the publish body plus config:
  "QA_Platform_{{stamp}}".
- **Expected (today).** Must be 422. publish does `@config.respond_to?(:to_unsafe_h) ? … :
  @config.to_h` (update_service.rb:246); String#to_h does not exist → NoMethodError → 500 —
  after the stages were already processed, inside the transaction.
- **Oracle.** No 5xx; event still draft (transaction rolled back).
- **Trace.** P2 · automate · `EDGE-PUB-026` · `app/services/event_groups/update_service.rb:246`

#### API-XPUB-027 — A title with a script tag is stored with the tag stripped
- **Why it matters.** Titles are shown in vendor emails and dashboards; this pins the global
  sanitiser for this endpoint.
- **Setup.** The sandbox event {{eventGroupUuid}}.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH with title
  "<script>alert(1)</script>QA_Platform_{{stamp}}". 2. Read the event back.
- **Expected (today).** HTTP 200 (or 422), never 500. The global sanitize_input_params
  strips HTML tags from every string param (params_auth.rb:18-31), so the stored title must
  contain no <script>.
- **Oracle.** Read-back title contains no '<script'.
- **Trace.** P1 · automate · `EDGE-PUB-027` · `app/controllers/concerns/params_auth.rb:18`

## 3. Audience at publish

#### API-XPUB-028 — Publishing with an empty audience goes live with no participants
- **Why it matters.** 'Publish without participants' — an event no vendor can see, reported
  as live.
- **Setup.** A draft copy of the sandbox event with its stage attached.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with audience_company_uuids: []. 2. GET
  /event_groups/{{eventGroupUuid}}/get_audience.
- **Expected (today).** Should be 422 (no participants). Today the key is present, so the
  stage is marked customised_audience 'restricted' (trade_controller_helper.rb:704-706) with
  no audience rows — a restricted stage nobody can see. HTTP 200.
- **Oracle.** Audience count 0 while status active confirms the defect.
- **Trace.** P0 · automate · `EDGE-PUB-028` · `app/controllers/concerns/trade_controller_helper.rb:704`

#### API-XPUB-029 — audience_company_uuids: null crashes with a 500
- **Why it matters.** The field the invite screen sends most; null when the user clears the
  picker.
- **Setup.** The sandbox event {{eventGroupUuid}}.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with audience_company_uuids: null.
- **Expected (today).** Must be 422. check_for_uuid runs nil.map for the 'uuids' key
  (params_auth.rb:73) → NoMethodError → 500.
- **Oracle.** No 5xx.
- **Trace.** P0 · automate · `EDGE-PUB-029` · `app/controllers/concerns/params_auth.rb:73`

#### API-XPUB-030 — A junk vendor uuid in the audience is dropped silently
- **Why it matters.** Silent drops mean the buyer believes a vendor was invited when it was
  not.
- **Setup.** A draft copy of the sandbox event with its stage attached.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH with audience_company_uuids:
  ["WrongUuid1="]. 2. GET get_audience.
- **Expected (today).** HTTP 200. The uuid decodes to nil; get_valid_audience_ids keeps only
  ids with a BuyerSellerCompanyMapping in an allowed status
  (common_controller_helper.rb:110-115), so nil is dropped and no row is written. Should
  arguably be a 422 naming the bad id.
- **Oracle.** Audience count is 0; no 5xx.
- **Trace.** P1 · automate · `EDGE-PUB-030` · `app/controllers/concerns/common_controller_helper.rb:113`

#### API-XPUB-031 — 501 audience entries are refused with 511
- **Why it matters.** The 500 cap is the only size guard on invitations; the count is taken
  on the raw list, which is what this case exploits cheaply.
- **Setup.** A draft copy of the sandbox event with its stage attached.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH with audience_company_uuids
  containing 501 entries (here, 501 copies of "WrongUuid1="). 2. Read the event back.
- **Expected.** HTTP 422, code 511 'Participants limit exceeded. Maximum 500 participants
  are allowed.' — set_customized_audiences counts the NEW audience ids before any validity
  filter and refuses > 500 (trade_controller_helper.rb:728-729). The whole publish is
  refused.
- **Oracle.** 422 code 511; event still draft.
- **Trace.** P0 · automate · `EDGE-PUB-031` · `app/controllers/concerns/trade_controller_helper.rb:729`

#### API-XPUB-032 — Exactly 500 audience entries pass the cap
- **Why it matters.** Exact-limit boundary for the 511 guard, plus proof that duplicates
  collapse to one row.
- **Setup.** A draft copy of the sandbox event with its stage attached.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH with 500 copies of
  "{{vendorUuid}}" in audience_company_uuids. 2. GET get_audience.
- **Expected.** HTTP 200. 500 is not > 500 (trade_controller_helper.rb:728); create_audience
  de-duplicates with .uniq (common_controller_helper.rb:97), so exactly one audience row is
  written for the vendor.
- **Oracle.** Status active; audience count 1.
- **Trace.** P1 · automate · `EDGE-PUB-032` · `app/controllers/concerns/trade_controller_helper.rb:728`

#### API-XPUB-033 — The same vendor listed twice gets one audience row
- **Why it matters.** Duplicate invites double-count a vendor in participation and awarding.
- **Setup.** A draft copy of the sandbox event with its stage attached.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH with audience_company_uuids:
  ["{{vendorUuid}}", "{{vendorUuid}}"]. 2. GET get_audience.
- **Expected.** HTTP 200; exactly one active audience row per stage — create_audience calls
  .uniq (common_controller_helper.rb:97). This matters because the Audience uniqueness
  validation is dead code (see the participate-twice case).
- **Oracle.** One audience row for the vendor on each stage.
- **Trace.** P1 · automate · `EDGE-PUB-033` · `app/controllers/concerns/common_controller_helper.rb:97`

#### API-XPUB-034 — A blacklisted vendor in the audience is dropped without telling the buyer
- **Why it matters.** Inviting a blacklisted vendor must never succeed, and silently not
  inviting them surprises the buyer.
- **Setup.** A vendor ALREADY blacklisted in this workspace (do not blacklist one for the
  test); put its uuid in place of {{vendorUuid}}. Draft copy of the sandbox event.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH with audience_company_uuids:
  [<blacklisted vendor uuid>]. 2. GET get_audience.
- **Expected (today).** HTTP 200 and the vendor is NOT invited: set_customized_audiences
  subtracts blacklisted vendors (trade_controller_helper.rb:695). Correct outcome for the
  vendor; the gap is that the buyer gets no error or warning.
- **Oracle.** The blacklisted vendor has no audience row.
- **Trace.** P1 · automate · `EDGE-PUB-034` · `app/controllers/concerns/trade_controller_helper.rb:695`

#### API-XPUB-035 — A user uuid passed as a vendor uuid is decoded as a company id
- **Why it matters.** Untyped ids mean a wrong-kind id can collide with a real vendor,
  inviting a company nobody chose.
- **Setup.** A draft copy of the sandbox event; {{userUuid}} is a user, not a company.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH with audience_company_uuids:
  ["{{userUuid}}"]. 2. GET get_audience.
- **Expected (today).** Should be refused as 'not a vendor'. uuids are untyped encodings of
  integers (params_auth.rb:72-73), so the user's integer id is treated as a company id; it
  is invited only if it happens to equal a mapped vendor company id
  (common_controller_helper.rb:113). Usually dropped silently — occasionally invites an
  unrelated vendor.
- **Oracle.** Audience rows after the call match no unexpected company.
- **Trace.** P1 · automate · `EDGE-PUB-035` · `app/controllers/concerns/params_auth.rb:73`

#### API-XPUB-036 — audience_except_company_uuids is ignored at publish
- **Why it matters.** A documented field that is silently ignored on one path is an
  invitation leak.
- **Setup.** A draft copy of the sandbox event with its stage attached.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH with the publish body plus
  audience_except_company_uuids: ["{{vendorUuid}}"] and audience_company_uuids:
  ["{{vendorUuid}}"]. 2. GET get_audience.
- **Expected (today).** HTTP 200 and the vendor IS invited: publish builds options with only
  audience_company_ids and stage_numbers (update_service.rb:229-238), so the except list
  never reaches set_customized_audiences. A client relying on 'everyone except' at publish
  gets the wrong audience.
- **Oracle.** The vendor has an audience row despite being in the except list.
- **Trace.** P2 · automate · `EDGE-PUB-036` · `app/services/event_groups/update_service.rb:229`

## 4. Live audience — add and remove vendors on a running stage

#### API-XPUB-037 — Adding an already-invited vendor to a live stage creates nothing new
- **Why it matters.** Idempotency of the invite action — a double click must not re-send
  invites.
- **Setup.** Stage {{tradeId}} is live with {{vendorUuid}} already invited.
- **Steps.** `PATCH /v1/trade/add_audience?id={{tradeId}}`. 1. PATCH
  /v1/trade/add_audience?id={{tradeId}} with audience_to_add_uuids: ["{{vendorUuid}}"]. 2.
  Count audience rows.
- **Expected.** HTTP 200 'Selected vendors successfully added'.
  bucket_audience_by_visibility removes ids that already have an active row
  (common_controller_helper.rb:24-29), so no row, email or activity log is created.
- **Oracle.** Audience row count unchanged; no update_audience email queued.
- **Trace.** P1 · automate · `EDGE-PUB-037` · `app/controllers/concerns/common_controller_helper.rb:27`

#### API-XPUB-038 — Adding an empty list of vendors is refused with code 2
- **Why it matters.** Empty-array boundary for the only required field.
- **Setup.** Stage {{tradeId}} is live.
- **Steps.** `PATCH /v1/trade/add_audience?id={{tradeId}}`. 1. PATCH
  /v1/trade/add_audience?id={{tradeId}} with audience_to_add_uuids: [].
- **Expected.** HTTP 422, code 2 'Insufficient parameters' (v1/trade_controller.rb:40).
- **Oracle.** 422 code 2.
- **Trace.** P1 · automate · `EDGE-PUB-038` · `app/controllers/api/v1/trade_controller.rb:40`

#### API-XPUB-039 — audience_to_add as a plain string crashes with a 500
- **Why it matters.** The endpoint accepts two spellings of the field and only one is
  type-normalised.
- **Setup.** Stage {{tradeId}} is live.
- **Steps.** `PATCH /v1/trade/add_audience?id={{tradeId}}`. 1. PATCH
  /v1/trade/add_audience?id={{tradeId}} with audience_to_add: "QA_Platform_{{stamp}}" (the
  non-uuid key, as a string).
- **Expected (today).** Must be 422. The raw key is not uuid-decoded, so
  set_trade_request_audience runs `audience_to_add -= blacklisted_audience` on a String
  (common_controller_helper.rb:10) → NoMethodError → 500.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EDGE-PUB-039` · `app/controllers/concerns/common_controller_helper.rb:10`

#### API-XPUB-040 — Adding vendors to a closed stage is refused with 95
- **Why it matters.** Inviting a vendor to a round that has ended would send them a dead
  invite.
- **Setup.** Stage {{tradeId}} has closed (window over) or been withdrawn.
- **Steps.** `PATCH /v1/trade/add_audience?id={{tradeId}}`. 1. PATCH
  /v1/trade/add_audience?id={{tradeId}} with a vendor.
- **Expected.** HTTP 422, code 95 — the lookup is TradeRequest.active_or_draft
  (v1/trade_controller.rb:30), so a closed/withdrawn stage is 'not found'.
- **Oracle.** 422 code 95; no audience row.
- **Trace.** P1 · automate · `EDGE-PUB-040` · `app/controllers/api/v1/trade_controller.rb:30`

#### API-XPUB-041 — An invited vendor can call add-audience on the buyer's live stage
- **Why it matters.** A bidder able to change who else is bidding is a direct
  procurement-integrity breach.
- **Setup.** Signed in as the invited vendor of stage {{tradeId}}; the stage's config has no
  is_user_allowed_to_modify_audience key (the default).
- **Steps.** `PATCH /v1/trade/add_audience?id={{tradeId}}`. 1. As the vendor, PATCH
  /v1/trade/add_audience?id={{tradeId}} with audience_to_add_uuids: ["{{vendorUuid}}"]. 2.
  Check the response.
- **Expected (today).** Must be refused (422 code 455). Today the policy is
  add_audience_live_auction? → allowed_to_view_event? = show? (read_record) &&
  is_allowed_to_view? (trade_request_policy.rb:125-127, 222-224) — both true for an invited
  vendor — and is_audience_modification_allowed? returns true when the config key is absent
  (trade_request_model_helper.rb:936-941). A vendor can add (or, via remove_audience,
  remove) participants.
- **Oracle.** A 200 'successfully added' to the vendor confirms the defect.
- **Trace.** P0 · automate · `EDGE-PUB-041` · `app/policies/trade_request_policy.rb:126`

#### API-XPUB-042 — An invited vendor can remove a competitor who has not bid yet
- **Why it matters.** Same hole as add — used offensively it removes rivals before they
  quote.
- **Setup.** Signed in as the invited vendor; another invited vendor (uuid in place of
  {{vendorUuid}}) has not bid.
- **Steps.** `PATCH /v1/trade/remove_audience?id={{tradeId}}`. 1. As the vendor, PATCH
  /v1/trade/remove_audience?id={{tradeId}} with audience_to_remove_uuids: [<competitor
  uuid>].
- **Expected (today).** Must be refused (455). remove_audience_live_auction authorises with
  the same add_audience_live_auction? policy (v1/trade_controller.rb:52) and only blocks
  removal of vendors who already bid (512). The competitor is hidden.
- **Oracle.** Competitor's audience row visibility after the call.
- **Trace.** P0 · automate · `EDGE-PUB-042` · `app/controllers/api/v1/trade_controller.rb:52`

#### API-XPUB-043 — With audience modification disabled on the stage, a buyer cannot add vendors
- **Why it matters.** Stage-level lock on the audience; the one switch that closes the
  vendor hole above.
- **Setup.** Config-dependent: stage {{tradeId}} has config
  is_user_allowed_to_modify_audience: false; caller is not a super admin.
- **Steps.** `PATCH /v1/trade/add_audience?id={{tradeId}}`. 1. PATCH
  /v1/trade/add_audience?id={{tradeId}} with a vendor.
- **Expected.** HTTP 422, code 685 'You are not allowed to update the audience'
  (v1/trade_controller.rb:37; trade_request_model_helper.rb:936-941). Super admins bypass
  it.
- **Oracle.** 422 code 685.
- **Trace.** P1 · automate · `EDGE-PUB-043` · `app/controllers/api/v1/trade_controller.rb:37`

#### API-XPUB-044 — Live add-audience has no 500-participant cap
- **Why it matters.** The cap enforced at publish is trivially bypassed by publishing small
  and adding later.
- **Setup.** Stage {{tradeId}} is live.
- **Steps.** `PATCH /v1/trade/add_audience?id={{tradeId}}`. 1. PATCH
  /v1/trade/add_audience?id={{tradeId}} with 501 entries in audience_to_add_uuids.
- **Expected (today).** For parity with publish it should be 422 code 511.
  set_trade_request_audience → process_audience_addition has no size check
  (common_controller_helper.rb:7-45); here the junk ids are then filtered, but 501 real
  vendors would all be invited.
- **Oracle.** Response code: 200 (no cap) vs 511.
- **Trace.** P1 · automate · `EDGE-PUB-044` · `app/controllers/concerns/common_controller_helper.rb:31`

#### API-XPUB-045 — A vendor who has already bid cannot be removed
- **Why it matters.** Removing a bidder would orphan a live bid.
- **Setup.** Stage {{tradeId}} (RFQ) has an active bid from {{vendorUuid}}.
- **Steps.** `PATCH /v1/trade/remove_audience?id={{tradeId}}`. 1. PATCH
  /v1/trade/remove_audience?id={{tradeId}} with audience_to_remove_uuids:
  ["{{vendorUuid}}"].
- **Expected.** HTTP 422, code 512 'You cannot remove a vendor who has already
  participated.' (v1/trade_controller.rb:63-66).
- **Oracle.** 422 code 512; the vendor is still visible.
- **Trace.** P0 · automate · `EDGE-PUB-045` · `app/controllers/api/v1/trade_controller.rb:66`

#### API-XPUB-046 — A vendor with a technical response cannot be removed from the RFP
- **Why it matters.** Technical-stage variant of the same guard.
- **Setup.** An RFP stage (its uuid in place of {{tradeId}}) with a latest template response
  from {{vendorUuid}}.
- **Steps.** `PATCH /v1/trade/remove_audience?id={{tradeId}}`. 1. PATCH
  /v1/trade/remove_audience?id=<rfp stage> with that vendor.
- **Expected.** HTTP 422, code 512 (v1/trade_controller.rb:59-61).
- **Oracle.** 422 code 512.
- **Trace.** P1 · automate · `EDGE-PUB-046` · `app/controllers/api/v1/trade_controller.rb:61`

#### API-XPUB-047 — Removing and re-adding a vendor makes them visible again without a duplicate row
- **Why it matters.** The re-invite path must reuse the row, not duplicate it.
- **Setup.** Stage {{tradeId}} is live; {{vendorUuid}} invited with no bid.
- **Steps.** `PATCH /v1/trade/add_audience?id={{tradeId}}`. 1. PATCH remove_audience with
  the vendor. 2. PATCH /v1/trade/add_audience?id={{tradeId}} with the vendor. 3. Count
  audience rows.
- **Expected.** HTTP 200. The not-visible row is flipped back to visible by
  set_audience_visible (common_controller_helper.rb:37, 76-83); no second row.
- **Oracle.** Exactly one row, visible: yes.
- **Trace.** P1 · automate · `EDGE-PUB-047` · `app/controllers/concerns/common_controller_helper.rb:37`

## 5. Participants — self-participation and rejection

#### API-XPUB-048 — Self-participating in a draft event answers 533
- **Why it matters.** A vendor must never join an event that has not been published.
- **Setup.** gate: `open_tenders`. A draft event; caller is a vendor.
- **Steps.** `POST /event_groups/{{eventGroupUuid}}/participants`. 1. As a vendor, POST
  /event_groups/{{eventGroupUuid}}/participants.
- **Expected.** HTTP 422, code 533 'Project does not exist.' — the lookup is
  EventGroup.active (event_groups_controller.rb:277-278).
- **Oracle.** 422 code 533; no audience row.
- **Trace.** P1 · automate · `EDGE-PUB-048` · `app/controllers/api/event_groups_controller.rb:278`

#### API-XPUB-049 — Self-participation without the open-tenders feature is refused
- **Why it matters.** The only uninvited-join path must be gated on the feature.
- **Setup.** Config-dependent: the buyer company does NOT have open_tenders. Event active;
  caller is an invited vendor.
- **Steps.** `POST /event_groups/{{eventGroupUuid}}/participants`. 1. POST
  /event_groups/{{eventGroupUuid}}/participants as the vendor.
- **Expected.** HTTP 422, code 455 — EventGroupPolicy#participate? = show? &&
  record.company.open_tenders? (event_group_policy.rb:25-27).
- **Oracle.** 422 code 455.
- **Trace.** P1 · automate · `EDGE-PUB-049` · `app/policies/event_group_policy.rb:26`

#### API-XPUB-050 — Self-participation after a stage has ended answers 33
- **Why it matters.** Joining a closed round would let a vendor into a window that has
  ended.
- **Setup.** gate: `open_tenders`. Event active but one open-tender stage's window is over.
- **Steps.** `POST /event_groups/{{eventGroupUuid}}/participants`. 1. POST
  /event_groups/{{eventGroupUuid}}/participants as a vendor.
- **Expected.** HTTP 422, code 33 'Order not active' — ParticipateService raises unless
  every open-tender stage is upcoming or running (participate_service.rb:27-29).
- **Oracle.** 422 code 33; no audience row.
- **Trace.** P1 · automate · `EDGE-PUB-050` · `app/services/event_groups/participate_service.rb:28`

#### API-XPUB-051 — Self-participating twice creates duplicate audience rows
- **Why it matters.** Dead uniqueness validation: any path that forgets to de-dupe produces
  double participants.
- **Setup.** gate: `open_tenders`. Active open-tender event; caller is a mapped vendor.
- **Steps.** `POST /event_groups/{{eventGroupUuid}}/participants`. 1. POST
  /event_groups/{{eventGroupUuid}}/participants as the vendor. 2. POST it again. 3. Count
  the vendor's active audience rows per stage.
- **Expected (today).** Second call should be a no-op or 422. Today Audience.create! runs
  again (participate_service.rb:38) and the model's uniqueness validation never fires
  because its condition compares the enum string to a symbol — `if: -> { self.status ==
  :active }` is always false (audience.rb:36). Two active rows per stage.
- **Oracle.** Row count 1 after the second call; 2 confirms the defect.
- **Trace.** P0 · automate · `EDGE-PUB-051` · `app/models/audience.rb:36`

#### API-XPUB-052 — Self-participation by a company with no vendor mapping crashes with a 500
- **Why it matters.** Unmapped/pending vendors browsing open tenders are exactly who clicks
  'participate'.
- **Setup.** gate: `open_tenders`. Active open-tender event; caller is a company that can
  see open tenders but has no BuyerSellerCompanyMapping with the buyer (e.g. the buyer
  itself).
- **Steps.** `POST /event_groups/{{eventGroupUuid}}/participants`. 1. POST
  /event_groups/{{eventGroupUuid}}/participants.
- **Expected (today).** Must be 422. BuyerSellerCompanyMapping.find_by(...) returns nil and
  `.dealing_with_company_id` is called on it (participate_service.rb:30-34) → NoMethodError,
  which is not a CustomException or RecordInvalid, so the controller's rescues miss it →
  500.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EDGE-PUB-052` · `app/services/event_groups/participate_service.rb:34`

#### API-XPUB-053 — Rejecting a participant without remarks is refused with 752
- **Why it matters.** Rejection emails the vendor; it must carry a reason.
- **Setup.** Active sandbox event; {{vendorUuid}} has participated.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}/reject_participant`. 1. PATCH
  /event_groups/{{eventGroupUuid}}/reject_participant with company_uuid only.
- **Expected.** HTTP 422, code 752 'Please enter remarks to reject the participant.'
  (event_groups_controller.rb:983).
- **Oracle.** 422 code 752; vendor not in rejected_company_ids.
- **Trace.** P1 · automate · `EDGE-PUB-053` · `app/controllers/api/event_groups_controller.rb:983`

#### API-XPUB-054 — Rejecting a vendor who never responded is refused with 751
- **Why it matters.** Reject is for responses; a non-participant should be removed from the
  audience instead.
- **Setup.** Active sandbox event; {{vendorUuid}} invited but has no bid and no technical
  response.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}/reject_participant`. 1. PATCH
  reject_participant with the vendor and remarks.
- **Expected.** HTTP 422, code 751 'You cannot reject a vendor that has not participated in
  any event.' (event_group_controller_helper.rb:2575).
- **Oracle.** 422 code 751.
- **Trace.** P1 · automate · `EDGE-PUB-054` · `app/controllers/concerns/event_group_controller_helper.rb:2575`

#### API-XPUB-055 — Rejecting a vendor already in a proposal is refused with 750
- **Why it matters.** Rejecting an awarded vendor would invalidate an award in flight.
- **Setup.** Active event with a proposal (active/selected/requested) that includes
  {{vendorUuid}}, or a commercial stage with a selected bid.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}/reject_participant`. 1. PATCH
  reject_participant with the vendor and remarks.
- **Expected.** HTTP 422, code 750 'You cannot reject a vendor that is already evaluated or
  awarded' (event_group_controller_helper.rb:2566-2573).
- **Oracle.** 422 code 750.
- **Trace.** P0 · automate · `EDGE-PUB-055` · `app/controllers/concerns/event_group_controller_helper.rb:2568`

#### API-XPUB-056 — A vendor cannot reject another participant
- **Why it matters.** Wrong actor; show? alone would let any viewer reject.
- **Setup.** Signed in as an invited vendor.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}/reject_participant`. 1. As the vendor,
  PATCH reject_participant with another company and remarks.
- **Expected.** HTTP 422, code 101 'You are not allowed to perform this action' — after
  show? passes, the caller must be a purchaser or auction-team member
  (event_groups_controller.rb:987).
- **Oracle.** 422 code 101 (or 455).
- **Trace.** P0 · automate · `EDGE-PUB-056` · `app/controllers/api/event_groups_controller.rb:987`

#### API-XPUB-057 — Rejecting the same vendor twice records it twice and re-notifies
- **Why it matters.** Double-submits of a punitive action should not double-notify.
- **Setup.** Active event; {{vendorUuid}} participated and is not awarded.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}/reject_participant`. 1. PATCH
  reject_participant with the vendor and remarks. 2. Repeat. 3. Read precomputed
  rejected_company_ids (via get_audience).
- **Expected (today).** Second call should be a no-op. Today there is no 'already rejected'
  check: the id is appended again and RejectParticipantWorker is enqueued again
  (event_groups_controller.rb:998-1000), so the vendor gets a second rejection email.
- **Oracle.** rejected_company_ids contains the vendor once.
- **Trace.** P2 · automate · `EDGE-PUB-057` · `app/controllers/api/event_groups_controller.rb:998`

## 6. Extend the submission deadline

#### API-XPUB-058 — The deadline can be extended to the year 2100
- **Why it matters.** An accidental extra digit leaves an event open for decades, blocking
  awarding.
- **Setup.** Stage {{tradeId}} is live (RFQ, no proposal yet).
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. PATCH /trade/{{tradeId}} with
  increase_auction_time: 4102444800 (2100-01-01) and remarks. 2. Read the stage schedule.
- **Expected (today).** HTTP 200 today — get_auction_trade_schedule assigns the new end time
  with no upper bound (trade_controller_helper.rb:5833). A sane maximum would refuse it; at
  minimum it must not 5xx.
- **Oracle.** Stage bid_end_time after the call.
- **Trace.** P2 · automate · `EDGE-PUB-058` · `app/controllers/concerns/trade_controller_helper.rb:5833`

#### API-XPUB-059 — 'Extending' to a past time ends a running stage immediately
- **Why it matters.** 'Extend to a past time' is a back door to force-ending an event.
- **Setup.** Stage {{tradeId}} is live and its window has not ended; trade_force_close may
  be OFF.
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. PATCH /trade/{{tradeId}} with
  increase_auction_time: 946684800 (2000-01-01). 2. Read the stage.
- **Expected (today).** Should be 422 code 195 'Invalid time.' Today the only time check is
  the reopen rule, which applies only when the current end has ALREADY passed
  (trade_controller_helper.rb:5830-5831); a running stage's end is simply overwritten
  (5833). The stage closes now — a force-close that bypasses the trade_force_close config
  and its mandatory remarks.
- **Oracle.** bid_end_time in the past and stage closed after a 200 confirms the defect.
- **Trace.** P0 · automate · `EDGE-PUB-059` · `app/controllers/concerns/trade_controller_helper.rb:5833`

#### API-XPUB-060 — A non-numeric extension time is coerced to 1970
- **Why it matters.** Unvalidated numeric coercion on a time field turns garbage into an
  early close.
- **Setup.** Stage {{tradeId}} is live.
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. PATCH /trade/{{tradeId}} with
  increase_auction_time: "QA_Platform_{{stamp}}".
- **Expected (today).** Should be 422 code 195/507. The controller does
  `Time.at(increase_auction_time.to_i)` (trade_controller.rb:645); a non-numeric string
  .to_i's to 0, so the end becomes 1970-01-01 and the stage ends.
- **Oracle.** bid_end_time unchanged (correct) vs 1970 (defect).
- **Trace.** P0 · automate · `EDGE-PUB-060` · `app/controllers/api/trade_controller.rb:645`

#### API-XPUB-061 — Extending an expired stage without reopen permission is refused with 496
- **Why it matters.** 'Extend after close' — reopening must be a privileged act.
- **Setup.** Stage {{tradeId}} (RFQ/auction) whose window has ended but is not yet closed;
  reopen configs off; caller is a normal buyer (not Procol employee, not super admin).
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. PATCH /trade/{{tradeId}} with
  increase_auction_time in the future.
- **Expected.** HTTP 422, code 496 'You are not allowed to reopen an expired event'
  (trade_controller_helper.rb:5830-5831). RFP stages are always reopenable
  (trade_controller_helper.rb:2027-2028).
- **Oracle.** 422 code 496; end time unchanged.
- **Trace.** P0 · automate · `EDGE-PUB-061` · `app/controllers/concerns/trade_controller_helper.rb:5831`

#### API-XPUB-062 — Extending a closed RFQ stage answers 4
- **Why it matters.** Closed commercial stages must stay closed.
- **Setup.** Stage {{tradeId}} is an RFQ with status closed.
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. PATCH /trade/{{tradeId}} with
  increase_auction_time.
- **Expected.** HTTP 422, code 4 'Request not found' — only active/draft/requested (plus
  closed for BOQ/RFP) are editable (trade_controller.rb:590-594).
- **Oracle.** 422 code 4.
- **Trace.** P1 · automate · `EDGE-PUB-062` · `app/controllers/api/trade_controller.rb:594`

#### API-XPUB-063 — Extending after an award proposal exists is refused with 801
- **Why it matters.** Re-opening bidding under an award would let vendors re-price after
  seeing the outcome.
- **Setup.** The event has a proposal in requested/active/selected status (for this stage's
  lot, if lots are used).
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. PATCH /trade/{{tradeId}} with
  increase_auction_time.
- **Expected.** HTTP 422, code 801 'You cannot edit the time as proposals are already
  submitted.' (trade_controller.rb:438-439; time_extension_blocked?
  trade_controller_helper.rb:6794-6804).
- **Oracle.** 422 code 801.
- **Trace.** P0 · automate · `EDGE-PUB-063` · `app/controllers/api/trade_controller.rb:439`

#### API-XPUB-064 — Extending the RFP beyond the RFQ's end is refused with 712
- **Why it matters.** Same ordering rule as publish, on the extend path.
- **Setup.** Live event with an RFP stage (its uuid in place of {{tradeId}}) and an RFQ
  stage.
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. PATCH /trade/<rfp stage> with
  increase_auction_time later than the RFQ's bid end (no extend_rfq_time).
- **Expected.** HTTP 422, code 712 'RFP duration exceeds RFQ end time. Please adjust.' —
  update_trade_schedule → validate_rfp_rfq_bid_end_time (trade_controller_helper.rb:2025,
  668-669).
- **Oracle.** 422 code 712.
- **Trace.** P1 · automate · `EDGE-PUB-064` · `app/controllers/concerns/trade_controller_helper.rb:669`

#### API-XPUB-065 — Extending the RFP with extend_rfq_time moves the RFQ too
- **Why it matters.** The escape hatch for the 712 rule must keep the RFP ≤ RFQ invariant.
- **Setup.** Live event with RFP + RFQ; {{tradeId}} replaced by the RFP stage uuid.
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. PATCH /trade/<rfp stage> with
  increase_auction_time past the RFQ end and extend_rfq_time: true. 2. Read both schedules.
- **Expected (today).** HTTP 200. update_rfq_time_with_rfp runs before the RFP schedule is
  updated (trade_controller.rb:659-662), so the 712 check then passes.
- **Oracle.** RFP end ≤ RFQ end after the call.
- **Trace.** P2 · automate · `EDGE-PUB-065` · `app/controllers/api/trade_controller.rb:660`

#### API-XPUB-066 — Extending a stage that has not been published does not 500
- **Why it matters.** 'Extend before publish' is a wrong-order action the UI never sends.
- **Setup.** Stage {{tradeId}} is a draft (event not published).
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. PATCH /trade/{{tradeId}} with
  increase_auction_time.
- **Expected (today).** Drafts are diverted to edit_draft before any schedule logic
  (trade_controller.rb:603), so the extension field is either ignored or applied as a
  schedule edit. It must not 5xx and must not mark the draft live.
- **Oracle.** No 5xx; stage still draft.
- **Trace.** P2 · automate · `EDGE-PUB-066` · `app/controllers/api/trade_controller.rb:603`

#### API-XPUB-067 — A vendor cannot extend the deadline
- **Why it matters.** A bidder extending their own deadline is a fairness breach.
- **Setup.** Signed in as the invited vendor of {{tradeId}}.
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. As the vendor, PATCH /trade/{{tradeId}} with
  increase_auction_time.
- **Expected.** HTTP 422, code 455 — TradeRequestPolicy#update? requires the stage's company
  in the user's allowed companies and create_record (trade_request_policy.rb:74-79;
  trade_controller.rb:404).
- **Oracle.** 422 code 455.
- **Trace.** P0 · automate · `EDGE-PUB-067` · `app/controllers/api/trade_controller.rb:404`

#### API-XPUB-068 — Moving the evaluation end to the past is refused with 195
- **Why it matters.** The evaluation path has the guard the bidding path lacks — this pins
  the good one.
- **Setup.** Stage {{tradeId}} is in its evaluation (extra closing) window, which has not
  yet ended.
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. PATCH /trade/{{tradeId}} with
  extra_closing_time: 946684800.
- **Expected.** HTTP 422, code 195 'Invalid time.' — get_extra_closing_trade_schedule
  refuses a time before now or before the window start
  (trade_controller_helper.rb:5889-5890). Note the bidding-window path has no such check
  (see the past-time extension case).
- **Oracle.** 422 code 195.
- **Trace.** P1 · automate · `EDGE-PUB-068` · `app/controllers/concerns/trade_controller_helper.rb:5890`

## 7. Force-end, withdraw and cancel

#### API-XPUB-069 — Force-ending without remarks is refused with 783
- **Why it matters.** Force-ending must be justified and audited.
- **Setup.** gate: `trade_force_close`. Stage {{tradeId}} is inside its submission window.
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. PATCH /trade/{{tradeId}} with force_end: true
  and no remarks.
- **Expected.** HTTP 422, code 783 'Missing Remarks' — get_trade_force_close_data
  (trade_controller_helper.rb:5905), reached only when allow_force_end? is true
  (trade_controller.rb:423-425).
- **Oracle.** 422 code 783; stage still running.
- **Trace.** P0 · automate · `EDGE-PUB-069` · `app/controllers/concerns/trade_controller_helper.rb:5905`

#### API-XPUB-070 — force_end with trade_force_close OFF answers 200 and does nothing
- **Why it matters.** The buyer is told the event ended when it did not.
- **Setup.** Config-dependent: trade_force_close is OFF for the company. Stage {{tradeId}}
  is running.
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. PATCH /trade/{{tradeId}} with force_end: true
  and remarks. 2. Read the stage.
- **Expected (today).** Should be 422 (not allowed). allow_force_end? is false
  (trade_request_model_helper.rb:1621-1624; trade_controller_helper.rb:5928-5930), so the
  flag is ignored and, with no other field, the request falls through to a 200 success with
  the stage still open.
- **Oracle.** Stage still running after a 200.
- **Trace.** P1 · automate · `EDGE-PUB-070` · `app/controllers/concerns/trade_controller_helper.rb:5929`

#### API-XPUB-071 — force_end: "false" (a string) still force-ends
- **Why it matters.** Truthiness bug on a destructive flag; form clients send 'false'.
- **Setup.** gate: `trade_force_close`. Stage {{tradeId}} is running (use a copy —
  destructive).
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. PATCH /trade/{{tradeId}} with force_end: "false"
  and remarks. 2. Read the stage.
- **Expected (today).** Should NOT end the stage. The gate is `params["force_end"].present?`
  (trade_controller_helper.rb:5929); the string 'false' is present, so the stage is
  force-closed.
- **Oracle.** Stage still running after the call.
- **Trace.** P1 · automate · `EDGE-PUB-071` · `app/controllers/concerns/trade_controller_helper.rb:5929`

#### API-XPUB-072 — status "closed" on a running stage closes it with no force-close gate
- **Why it matters.** The force-close feature flag is meaningless if a plain status write
  does the same thing.
- **Setup.** Stage {{tradeId}} is running; trade_force_close OFF (use a copy — destructive).
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. PATCH /trade/{{tradeId}} with status: "closed".
  2. Read the stage.
- **Expected (today).** Should be refused. Any present status goes to
  set_trade_request_in_active (trade_controller.rb:638-641), which assigns it verbatim
  (trade_controller_helper.rb:201). 'closed' is not a cancel status, so no remarks and no
  schedule handling — the stage is just closed, bypassing the trade_force_close config and
  the mandatory remarks (783).
- **Oracle.** Stage status `closed` after a 200 confirms the defect.
- **Trace.** P0 · automate · `EDGE-PUB-072` · `app/controllers/concerns/trade_controller_helper.rb:201`

#### API-XPUB-073 — An unknown stage status crashes with a 500
- **Why it matters.** Unvalidated enum assignment on the stage endpoint.
- **Setup.** Stage {{tradeId}} is live.
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. PATCH /trade/{{tradeId}} with status: "banana".
- **Expected (today).** Must be 422. `trade_request.status = 'banana'` on the TradeRequest
  enum raises ArgumentError (trade_controller_helper.rb:201) → 500.
- **Oracle.** No 5xx; stage unchanged.
- **Trace.** P1 · automate · `EDGE-PUB-073` · `app/controllers/concerns/trade_controller_helper.rb:201`

#### API-XPUB-074 — Cancelling a live (non-draft) stage is refused with 101
- **Why it matters.** Cancel is the draft-only removal; on a live stage it would skip vendor
  notification.
- **Setup.** Stage {{tradeId}} is live.
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. PATCH /trade/{{tradeId}} with status:
  "cancelled".
- **Expected.** HTTP 422, code 101 — allowed_to_cancel? is false for any non-draft stage
  (trade_request_model_helper.rb:1495-1496; trade_controller_helper.rb:187-188). Live stages
  are withdrawn (in_active), not cancelled.
- **Oracle.** 422 code 101.
- **Trace.** P1 · automate · `EDGE-PUB-074` · `app/controllers/concerns/trade_controller_helper.rb:188`

#### API-XPUB-075 — A stage cannot be withdrawn once a proposal is submitted
- **Why it matters.** Withdrawing under an award in approval would orphan the approval.
- **Setup.** The event has a selected or requested proposal.
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. PATCH /trade/{{tradeId}} with status:
  "in_active" and withdraw_remark.
- **Expected.** HTTP 422, code 841 'Cannot withdraw the event as proposals are already
  submitted.' (trade_controller_helper.rb:193-198).
- **Oracle.** 422 code 841.
- **Trace.** P0 · automate · `EDGE-PUB-075` · `app/controllers/concerns/trade_controller_helper.rb:195`

#### API-XPUB-076 — Withdrawing an event with remarks closes every stage
- **Why it matters.** The legal way down, and the baseline for the refusals below.
- **Setup.** A dedicated active sandbox copy with no submitted proposals (destructive — run
  last).
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with status withdrawn and withdraw_remark {remarks,
  attachments: []}. 2. Read the event and stages.
- **Expected.** HTTP 200. withdraw_event_group sets closed_at/closed_by, writes a
  withdraw_project_remark, marks each live stage in_active (drafts cancelled) and withdraws
  open proposals (update_service.rb:316-346).
- **Oracle.** Event withdrawn; every stage in_active/cancelled; one remark.
- **Trace.** P0 · automate · `EDGE-PUB-076` · `app/services/event_groups/update_service.rb:316`

#### API-XPUB-077 — Withdrawing an event without withdraw_remark crashes with a 500
- **Why it matters.** A missing optional-looking field crashes the most consequential
  lifecycle action.
- **Setup.** An active sandbox copy with at least one live stage.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with {status: "withdrawn"} only.
- **Expected (today).** Must be 422 (remarks required). add_withdraw_remarks returns early
  for a blank remark, but the stage loop then reads `@withdraw_remark['remarks']` on nil
  (update_service.rb:327) → NoMethodError → 500 (the transaction rolls back).
- **Oracle.** No 5xx; event still active.
- **Trace.** P0 · automate · `EDGE-PUB-077` · `app/services/event_groups/update_service.rb:327`

#### API-XPUB-078 — withdraw_remark as a plain string crashes with a 500
- **Why it matters.** The event and stage endpoints disagree on this field's type.
- **Setup.** The sandbox event {{eventGroupUuid}}.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH with status withdrawn and
  withdraw_remark: "QA_Platform_withdraw_{{stamp}}".
- **Expected (today).** Must be 422. The UpdateService sig is `withdraw_remark:
  T.nilable(T.any(Hash, ActionController::Parameters))` (update_service.rb:20); a String
  raises TypeError → 500. (The stage endpoint takes a string here, so clients confuse the
  two.)
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EDGE-PUB-078` · `app/services/event_groups/update_service.rb:20`

#### API-XPUB-079 — An event with a submitted proposal cannot be withdrawn
- **Why it matters.** Withdraw must never pull the rug from under an award in approval.
- **Setup.** The event has a selected or requested proposal.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with the withdraw body.
- **Expected.** HTTP 422, code 841 — each stage's set_trade_request_in_active refuses
  (trade_controller_helper.rb:193-198) and the error is returned from withdraw_event_group
  (update_service.rb:329-330). Transaction rolls back.
- **Oracle.** 422 code 841; event still active.
- **Trace.** P0 · automate · `EDGE-PUB-079` · `app/services/event_groups/update_service.rb:330`

#### API-XPUB-080 — A buyer who does not own the event can withdraw it through the API
- **Why it matters.** The UI hides the button; the API does not enforce the same rule.
- **Setup.** Signed in as a second buyer of the same company with create_record permission,
  who is not the event's owner and not a super admin. Dedicated sandbox copy.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. As that buyer, PATCH
  /event_groups/{{eventGroupUuid}} with the withdraw body.
- **Expected (today).** Should be 101 — is_allowed_to_withdraw? (owner or super admin only,
  event_group_controller_helper.rb:2604-2611) is used only to build the UI config (…:552).
  The API only checks EventGroupPolicy#update? (company + create_record), so any buyer can
  withdraw anyone's event.
- **Oracle.** A 200 for the non-owner confirms the defect.
- **Trace.** P0 · automate · `EDGE-PUB-080` · `app/controllers/concerns/event_group_controller_helper.rb:2604`

#### API-XPUB-081 — Withdrawing an already-withdrawn event again re-stamps it
- **Why it matters.** Double submit on a terminal action should not rewrite who closed it
  and when.
- **Setup.** A withdrawn sandbox copy.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with the withdraw body again. 2. Read closed_at and
  withdraw remarks.
- **Expected (today).** Should be a no-op or 422. There is no 'already withdrawn' guard:
  closed_at/closed_by are overwritten and a second withdraw_project_remark is written
  (update_service.rb:318-322); stage loop finds nothing.
- **Oracle.** closed_at unchanged and one remark.
- **Trace.** P2 · automate · `EDGE-PUB-081` · `app/services/event_groups/update_service.rb:318`

#### API-XPUB-082 — Withdraw-remark attachments bypass the company URL check
- **Why it matters.** Same cross-tenant file leak the top-level guard exists to stop, via a
  side door.
- **Setup.** A dedicated active sandbox copy.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH with the withdraw body whose
  withdraw_remark.attachments holds another company's trade_files S3 URL.
- **Expected (today).** Should be 101 like top-level attachments. validate_company_urls runs
  only on params[:attachments] (event_groups_controller.rb:77-78);
  withdraw_remark.attachments goes straight into the Remark (update_service.rb:348-353) and
  is later signed for readers (event_group_controller_helper.rb:2620).
- **Oracle.** The foreign URL is not stored.
- **Trace.** P2 · automate · `EDGE-PUB-082` · `app/controllers/api/event_groups_controller.rb:77`

## 8. Read-back and visibility

#### API-XPUB-083 — An uninvited vendor cannot read the event
- **Why it matters.** The core confidentiality rule of a restricted event.
- **Setup.** Signed in as a vendor mapped to the buyer but NOT on any stage's audience.
- **Steps.** `GET /event_groups/{{eventGroupUuid}}`. 1. As that vendor, GET
  /event_groups/{{eventGroupUuid}}.
- **Expected.** HTTP 422, code 455 — EventGroupPolicy#show? requires
  get_valid_stages_for_user to be non-empty (event_group_policy.rb:52-54), so the
  controller's own 682 check (event_groups_controller.rb:135) is never reached.
- **Oracle.** 422 (455); no event payload.
- **Trace.** P0 · automate · `EDGE-PUB-083` · `app/policies/event_group_policy.rb:53`

#### API-XPUB-084 — A buyer cannot read another buyer's draft
- **Why it matters.** Drafts are private to their creator until published.
- **Setup.** A draft owned by buyer A; signed in as buyer B of the same company (not super
  admin).
- **Steps.** `GET /event_groups/{{eventGroupUuid}}`. 1. As buyer B, GET
  /event_groups/{{eventGroupUuid}}.
- **Expected.** HTTP 422, code 455 — get_valid_stages_for_user returns [] for a draft whose
  owner is someone else (event_group.rb:512-514), so show? fails.
- **Oracle.** 422.
- **Trace.** P1 · automate · `EDGE-PUB-084` · `app/models/event_group.rb:512`

#### API-XPUB-085 — With restrict_event_visibility_to_owner, a non-owner buyer is refused
- **Why it matters.** The owner-only visibility switch is a customer-requested
  confidentiality control.
- **Setup.** Config-dependent: restrict_event_visibility_to_owner ON. Signed in as a buyer
  who is not the owner, not an approver, has no assigned chat and no share, and is not in a
  planning designation.
- **Steps.** `GET /event_groups/{{eventGroupUuid}}`. 1. GET /event_groups/{{eventGroupUuid}}
  as that buyer.
- **Expected.** HTTP 422, code 101 'You are not allowed to perform this action' —
  is_valid_owner is false (event_groups_controller.rb:140-143;
  trade_controller_helper.rb:5932-5946). With the config OFF the same user reads the event
  (200).
- **Oracle.** 101 with config ON; 200 with config OFF.
- **Trace.** P0 · automate · `EDGE-PUB-085` · `app/controllers/api/event_groups_controller.rb:143`

#### API-XPUB-086 — A vendor reading get_audience does not see competitors
- **Why it matters.** A competitor list is the single most sensitive thing a vendor could
  read.
- **Setup.** Signed in as the invited vendor.
- **Steps.** `GET /event_groups/{{eventGroupUuid}}/get_audience`. 1. As the vendor, GET
  /event_groups/{{eventGroupUuid}}/get_audience. 2. Inspect the companies returned.
- **Expected (today).** Refused, or a response listing only the vendor's own company. The
  action only authorises show? (event_groups_controller.rb:553), which an invited vendor
  passes; nothing in get_audience itself checks the caller is the buyer, so the participant
  list must be confirmed not to leak.
- **Oracle.** No company other than the vendor's own in the response.
- **Trace.** P0 · automate · `EDGE-PUB-086` · `app/controllers/api/event_groups_controller.rb:553`

#### API-XPUB-087 — get_audience with malformed filters does not 500
- **Why it matters.** A rescue that returns nil just moves the crash one call later.
- **Setup.** Active sandbox event.
- **Steps.** `GET /event_groups/{{eventGroupUuid}}/get_audience?filters=%7Bbad`. 1. GET
  /event_groups/{{eventGroupUuid}}/get_audience?filters={bad.
- **Expected (today).** HTTP 200 or 422, never 500. CommonFunctions.parse_filters rescues
  the JSON error and returns nil (lib/common_functions.rb parse_filters), and that nil is
  then handed to apply_audience_filters/apply_stage_participation_filters
  (event_groups_controller.rb:569-580), which must tolerate it.
- **Oracle.** No 5xx.
- **Trace.** P2 · automate · `EDGE-PUB-087` · `app/controllers/api/event_groups_controller.rb:569`

#### API-XPUB-088 — A raw integer event id cannot be used to read another tenant's event
- **Why it matters.** Enumerable integer ids are the classic IDOR.
- **Setup.** Authenticated buyer using the current web client version.
- **Steps.** `GET /event_groups/1`. 1. GET /event_groups/1.
- **Expected.** HTTP 422, code 533 or 455 — for uuid-enabled clients check_for_uuid decodes
  even an integer id (params_auth.rb:57-61), which yields nil (533); on an old client the
  raw id is used but EventGroupPolicy#show? blocks another company's event (455).
- **Oracle.** Never a 200 with another company's event.
- **Trace.** P1 · automate · `EDGE-PUB-088` · `app/controllers/concerns/params_auth.rb:57`

#### API-XPUB-089 — During bidding, a non-owner buyer's read of a masked event shows no bid stats
- **Why it matters.** Sealed-bid confidentiality inside the buyer's own organisation.
- **Setup.** Config-dependent: stage {{tradeId}} has show_bidding_stats (or closed-envelope
  bidding) enabled and is running; signed in as a buyer of the company who is not the
  owner/super admin and not on the auction team.
- **Steps.** `GET /event_groups/{{eventGroupUuid}}`. 1. GET /event_groups/{{eventGroupUuid}}
  and the stage details. 2. Inspect bid amounts/ranks.
- **Expected (today).** HTTP 200 with bidders/bids masked — event_masking_enabled? is true
  for a running stage viewed by a non-owner (trade_request_model_helper.rb:258-270);
  auction-team users are never masked.
- **Oracle.** No bid prices or bidder names in the payload.
- **Trace.** P1 · automate · `EDGE-PUB-089` · `app/models/model_helpers/trade_request_model_helper.rb:258`

## 9. Change ownership

#### API-XPUB-090 — Changing ownership without a new owner is refused with code 2
- **Why it matters.** Missing-field baseline.
- **Setup.** Signed in as the event's owner.
- **Steps.** `POST /event_groups/{{eventGroupUuid}}/change_ownership`. 1. POST
  /event_groups/{{eventGroupUuid}}/change_ownership with {}.
- **Expected.** HTTP 422, code 2 — validate_new_owner returns 2 for a blank owner
  (trade_controller_helper.rb:5950-5952).
- **Oracle.** 422 code 2; owner unchanged.
- **Trace.** P1 · automate · `EDGE-PUB-090` · `app/controllers/concerns/trade_controller_helper.rb:5951`

#### API-XPUB-091 — Transferring to a user outside the owner's teams is refused with 960
- **Why it matters.** Ownership moves within a team only.
- **Setup.** Signed in as the owner (active); target user shares no active team with the
  owner (put their uuid in place of {{userUuid}}).
- **Steps.** `POST /event_groups/{{eventGroupUuid}}/change_ownership`. 1. POST
  change_ownership with that user.
- **Expected.** HTTP 422, code 960 'New Owner must be in same team as that of current owner'
  (trade_controller_helper.rb:5955-5957).
- **Oracle.** 422 code 960.
- **Trace.** P1 · automate · `EDGE-PUB-091` · `app/controllers/concerns/trade_controller_helper.rb:5957`

#### API-XPUB-092 — A vendor cannot change the event's owner
- **Why it matters.** Wrong actor.
- **Setup.** Signed in as the invited vendor.
- **Steps.** `POST /event_groups/{{eventGroupUuid}}/change_ownership`. 1. POST
  change_ownership as the vendor.
- **Expected.** HTTP 422, code 533 or 455 — the lookup is scoped to Current.workspace
  (event_groups_controller.rb:1090-1091) and change_ownership? needs show? plus owner/super
  admin/Procol employee (event_group_policy.rb:88-90).
- **Oracle.** 422; owner unchanged.
- **Trace.** P0 · automate · `EDGE-PUB-092` · `app/policies/event_group_policy.rb:89`

#### API-XPUB-093 — A buyer who is not the owner cannot change ownership
- **Why it matters.** Taking over a colleague's event must need admin rights.
- **Setup.** Signed in as another buyer of the company (not owner, not super admin).
- **Steps.** `POST /event_groups/{{eventGroupUuid}}/change_ownership`. 1. POST
  change_ownership.
- **Expected.** HTTP 422, code 455 (event_group_policy.rb:88-90).
- **Oracle.** 422 code 455.
- **Trace.** P1 · automate · `EDGE-PUB-093` · `app/policies/event_group_policy.rb:89`

#### API-XPUB-094 — Ownership can be changed on a draft even though the UI forbids it
- **Why it matters.** UI-only rules are not rules.
- **Setup.** A draft event (no active commercial stage) owned by the caller; a valid
  same-team user in place of {{userUuid}}.
- **Steps.** `POST /event_groups/{{eventGroupUuid}}/change_ownership`. 1. GET the event and
  note config.is_allowed_to_change_ownership (false). 2. POST change_ownership.
- **Expected (today).** Should be refused to match the UI. is_allowed_to_change_ownership?
  requires an active commercial stage and restrict_event_visibility_to_owner ON
  (event_group_controller_helper.rb:604-614) but is only used for the UI config (…:563); the
  change_ownership action never calls it (event_groups_controller.rb:1089-1103), so the
  transfer succeeds.
- **Oracle.** A 200 'Ownership transferred' while the config said false.
- **Trace.** P1 · automate · `EDGE-PUB-094` · `app/controllers/concerns/event_group_controller_helper.rb:607`

#### API-XPUB-095 — When the current owner is deactivated, ownership can go to any active user anywhere
- **Why it matters.** Handing a tenant's event to an outsider is a cross-tenant data leak.
- **Setup.** An event whose owner's UserCompanyMapping is no longer active; caller is a
  super admin; target is an active user of ANOTHER company (put their uuid in place of
  {{userUuid}}).
- **Steps.** `POST /event_groups/{{eventGroupUuid}}/change_ownership`. 1. POST
  change_ownership with the foreign user.
- **Expected (today).** Must be refused. validate_new_owner returns nil (valid) as soon as
  the current owner is inactive (trade_controller_helper.rb:5953-5954), and the target is
  looked up with User.active.find_by(id:) — not scoped to the workspace
  (event_groups_controller.rb:1093). A user from another tenant can be made owner.
- **Oracle.** Owner after the call is not a member of the event's company → defect.
- **Trace.** P0 · automate · `EDGE-PUB-095` · `app/controllers/concerns/trade_controller_helper.rb:5954`

## 10. Versioning and amendment

#### API-XPUB-096 — Versioning a live event creates an amendment draft
- **Why it matters.** Baseline for every amendment case.
- **Setup.** A dedicated active sandbox copy (after this, the original is no longer
  'latest').
- **Steps.** `POST /item_versions`. 1. POST /item_versions with {item_uuid:
  "{{eventGroupUuid}}", item_type: "EventGroup"}. 2. Read the returned uuid and
  new_item_data.
- **Expected.** HTTP 200 {uuid, new_item_data} — item is active and latest, create_version?
  passes, create_version builds a replica (item_versions_controller.rb:5-27;
  versioning/methods.rb:3-18).
- **Oracle.** A new draft event exists; the original is still active but not latest.
- **Trace.** P0 · automate · `EDGE-PUB-096` · `app/controllers/api/item_versions_controller.rb:22`

#### API-XPUB-097 — Versioning the same event twice is refused with 888
- **Why it matters.** Two amendments of one event would fork it.
- **Setup.** The sandbox event was just versioned once.
- **Steps.** `POST /item_versions`. 1. POST /item_versions again with the same body.
- **Expected.** HTTP 422, code 888 'Invalid Parameters' — the original is no longer latest?
  once a non-inactive ItemVersion exists (versioning/methods.rb:72-74;
  item_versions_controller.rb:13-16). The find_or_initialize idempotency in create_version
  (methods.rb:8) is therefore unreachable.
- **Oracle.** 422 code 888; still one draft version.
- **Trace.** P1 · automate · `EDGE-PUB-097` · `app/controllers/api/item_versions_controller.rb:14`

#### API-XPUB-098 — Versioning without item_type is refused with code 2
- **Why it matters.** Missing-field baseline.
- **Setup.** Active sandbox event.
- **Steps.** `POST /item_versions`. 1. POST /item_versions with item_uuid only.
- **Expected.** HTTP 422, code 2 (item_versions_controller.rb:9-11).
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EDGE-PUB-098` · `app/controllers/api/item_versions_controller.rb:9`

#### API-XPUB-099 — Versioning a TradeRequest (not allow-listed) is refused with code 2
- **Why it matters.** Stages must be amended through their event, not directly.
- **Setup.** Active sandbox event.
- **Steps.** `POST /item_versions`. 1. POST /item_versions with item_uuid {{tradeId}},
  item_type "TradeRequest".
- **Expected.** HTTP 422, code 2 — ALLOWED_ITEM_TYPES is %w(EventGroup)
  (item_versions_controller.rb:3, 9).
- **Oracle.** 422 code 2.
- **Trace.** P1 · automate · `EDGE-PUB-099` · `app/controllers/api/item_versions_controller.rb:3`

#### API-XPUB-100 — A class name like "User" is refused before constantize
- **Why it matters.** constantize on user input is a known Rails RCE/IDOR shape; the
  allow-list is the only thing in the way.
- **Setup.** Authenticated buyer.
- **Steps.** `POST /item_versions`. 1. POST /item_versions with item_uuid {{userUuid}} and
  item_type "User".
- **Expected.** HTTP 422, code 2 — the allow-list check runs before `item_type.constantize`
  (item_versions_controller.rb:9-13), so no arbitrary class is instantiated.
- **Oracle.** 422 code 2; no ItemVersion of type User.
- **Trace.** P0 · automate · `EDGE-PUB-100` · `app/controllers/api/item_versions_controller.rb:13`

#### API-XPUB-101 — Versioning a draft is refused with 888
- **Why it matters.** 'Versioning a draft' is a wrong-state action.
- **Setup.** A draft event (its uuid in place of {{eventGroupUuid}}).
- **Steps.** `POST /item_versions`. 1. POST /item_versions with the draft's uuid.
- **Expected.** HTTP 422, code 888 — `!item.active?` (item_versions_controller.rb:14).
  Drafts are edited in place.
- **Oracle.** 422 code 888.
- **Trace.** P1 · automate · `EDGE-PUB-101` · `app/controllers/api/item_versions_controller.rb:14`

#### API-XPUB-102 — A raw integer item_id of another tenant's event cannot be versioned
- **Why it matters.** The lookup is unscoped, so the policy is the only barrier to amending
  another tenant's event.
- **Setup.** Authenticated buyer.
- **Steps.** `POST /item_versions`. 1. POST /item_versions with item_id: 1 (raw, not a uuid)
  and item_type EventGroup.
- **Expected.** HTTP 422, code 888 (if id 1 is not active/latest) or 455 — the raw item_id
  is looked up unscoped (item_versions_controller.rb:13), then create_version? → update?
  requires the event's company in the caller's allowed companies
  (event_group_policy.rb:37-44).
- **Oracle.** Never a 200; no ItemVersion created.
- **Trace.** P0 · automate · `EDGE-PUB-102` · `app/controllers/api/item_versions_controller.rb:18`

#### API-XPUB-103 — A vendor cannot version the buyer's event
- **Why it matters.** Wrong actor.
- **Setup.** Signed in as the invited vendor.
- **Steps.** `POST /item_versions`. 1. POST /item_versions as the vendor.
- **Expected.** HTTP 422, code 455 — create_version? = update? && create_record
  (event_group_policy.rb:42-44; item_versions_controller.rb:18).
- **Oracle.** 422 code 455.
- **Trace.** P0 · automate · `EDGE-PUB-103` · `app/policies/event_group_policy.rb:43`

#### API-XPUB-104 — The original event can no longer be edited once an amendment exists
- **Why it matters.** Edits must go to the amendment, or the two versions diverge.
- **Setup.** The sandbox event has been versioned (an amendment draft exists).
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} (the ORIGINAL) with the publish body.
- **Expected.** HTTP 422, code 101 — `event_group.latest?` is false
  (event_groups_controller.rb:79).
- **Oracle.** 422 code 101.
- **Trace.** P0 · automate · `EDGE-PUB-104` · `app/controllers/api/event_groups_controller.rb:79`

#### API-XPUB-105 — Vendors cannot be added to the original once an amendment exists
- **Why it matters.** Same latest-version rule on the audience path.
- **Setup.** The sandbox event has been versioned.
- **Steps.** `PATCH /v1/trade/add_audience?id={{tradeId}}`. 1. PATCH
  /v1/trade/add_audience?id={{tradeId}} (a stage of the original).
- **Expected.** HTTP 422, code 101 (v1/trade_controller.rb:36).
- **Oracle.** 422 code 101.
- **Trace.** P1 · automate · `EDGE-PUB-105` · `app/controllers/api/v1/trade_controller.rb:36`

#### API-XPUB-106 — The original's deadline cannot be extended once an amendment exists
- **Why it matters.** Same rule on the extend path.
- **Setup.** The sandbox event has been versioned.
- **Steps.** `PATCH /trade/{{tradeId}}`. 1. PATCH /trade/{{tradeId}} with
  increase_auction_time.
- **Expected.** HTTP 422, code 101 (trade_controller.rb:403).
- **Oracle.** 422 code 101.
- **Trace.** P1 · automate · `EDGE-PUB-106` · `app/controllers/api/trade_controller.rb:403`

#### API-XPUB-107 — Publishing an amendment draft without amendment_remarks crashes with a 500
- **Why it matters.** The amendment remark is mandatory by design, but the refusal is a
  crash instead of a validation error.
- **Setup.** {{eventGroupUuid}} is an AMENDMENT draft (the new_item returned by
  /item_versions), with its stages.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH /event_groups/<amendment
  draft> with the publish body minus amendment_remarks.
- **Expected (today).** Must be 422 (remarks required). publish calls
  add_amendment_remarks!(nil) for amendment drafts (update_service.rb:234), which raises
  StandardError 'Remarks for amendment not found' (versioning/methods.rb:103); nothing
  rescues it → 500.
- **Oracle.** 422 with a message; draft unchanged.
- **Trace.** P0 · automate · `EDGE-PUB-107` · `app/models/versioning/methods.rb:103`

#### API-XPUB-108 — An amendment published with blank remarks is accepted and notifies vendors with no reason
- **Why it matters.** Vendors get a 'the event was revised' email that does not say what
  changed.
- **Setup.** {{eventGroupUuid}} is an amendment draft.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH with the working body
  (amendment_remarks: {remarks: ""}).
- **Expected (today).** Should be 422. `remarks.blank?` checks the HASH, which is non-empty
  (versioning/methods.rb:103), so a remark with an empty message is stored and
  event_revise_notification is sent with remark ''
  (event_group_controller_helper.rb:2632-2637).
- **Oracle.** Remark message after publish.
- **Trace.** P1 · automate · `EDGE-PUB-108` · `app/models/versioning/methods.rb:103`

## 11. Clone

#### API-XPUB-109 — Cloning a live event returns a new draft
- **Why it matters.** 'Clone of a live event' baseline.
- **Setup.** Active sandbox event not created from a PR.
- **Steps.** `POST /event_groups/{{eventGroupUuid}}/create_clone`. 1. POST
  /event_groups/{{eventGroupUuid}}/create_clone with {}. 2. GET the returned
  event_group_uuid.
- **Expected.** HTTP 200 {event_group_uuid}. CloneService copies the event and line items
  and ONLY the technical/RFQ stages (clone_service.rb:13-27);
  meta_data.source_event_group_id points at the source.
- **Oracle.** New event is a draft; source unchanged; no auction stage copied.
- **Trace.** P1 · automate · `EDGE-PUB-109` · `app/controllers/api/event_groups_controller.rb:127`

#### API-XPUB-110 — Cloning a draft is refused by the policy (455), not by the state check
- **Why it matters.** Pins which code a client actually gets; the helpful message is dead
  code for this case.
- **Setup.** A draft event.
- **Steps.** `POST /event_groups/{{eventGroupUuid}}/create_clone`. 1. POST create_clone on
  the draft.
- **Expected.** HTTP 422, code 455 — create_clone? already requires !record.draft?
  (event_group_policy.rb:49), so the controller's friendlier 1122 'Only active or withdrawn
  events can be cloned.' (event_groups_controller.rb:111-113) is unreachable for drafts.
- **Oracle.** 422 code 455.
- **Trace.** P2 · automate · `EDGE-PUB-110` · `app/policies/event_group_policy.rb:49`

#### API-XPUB-111 — Cloning a PR-created event is refused by the policy (455), not 1123
- **Why it matters.** Cloning a PR event would double-consume PR quantities; the user just
  gets a generic 'not authorized'.
- **Setup.** An active event created from a purchase request.
- **Steps.** `POST /event_groups/{{eventGroupUuid}}/create_clone`. 1. POST create_clone.
- **Expected.** HTTP 422, code 455 — create_clone? requires !record.created_from_pr?
  (event_group_policy.rb:49), so 1123 'Events with purchase requests cannot be cloned.'
  (event_groups_controller.rb:115-117) is never returned.
- **Oracle.** 422 code 455.
- **Trace.** P2 · automate · `EDGE-PUB-111` · `app/policies/event_group_policy.rb:49`

#### API-XPUB-112 — Cloning a soft-deleted (in_active) event answers 1122
- **Why it matters.** The one state where 1122 is actually reachable.
- **Setup.** An event in status in_active.
- **Steps.** `POST /event_groups/{{eventGroupUuid}}/create_clone`. 1. POST create_clone.
- **Expected.** HTTP 422, code 1122 'Only active or withdrawn events can be cloned.' — the
  policy passes (not draft), the state check refuses (event_groups_controller.rb:111-113).
- **Oracle.** 422 code 1122.
- **Trace.** P2 · automate · `EDGE-PUB-112` · `app/controllers/api/event_groups_controller.rb:112`

#### API-XPUB-113 — A vendor cannot clone the buyer's event
- **Why it matters.** A vendor cloning the buyer's event would copy its line items and specs
  into a new event.
- **Setup.** Signed in as the invited vendor.
- **Steps.** `POST /event_groups/{{eventGroupUuid}}/create_clone`. 1. POST create_clone as
  the vendor.
- **Expected.** HTTP 422, code 455 — create_clone? requires the event's company in
  Current.allowed_companies and create_record (event_group_policy.rb:46-50).
- **Oracle.** 422 code 455.
- **Trace.** P0 · automate · `EDGE-PUB-113` · `app/policies/event_group_policy.rb:48`

## 12. Scheduled (recurring) events

#### API-XPUB-114 — Listing scheduled events without the feature answers 904 (HTTP 403)
- **Why it matters.** Feature gate; also the only 403 (not 422) in this area.
- **Setup.** Config-dependent: scheduled_events_enabled is OFF for the workspace.
- **Steps.** `GET /event_groups/scheduled`. 1. GET /event_groups/scheduled.
- **Expected.** HTTP 403, code 904 'Scheduled events feature is not enabled for your
  workspace' (event_groups_controller.rb:375). With the config ON it answers 200 with the
  templates.
- **Oracle.** 403 with code 904.
- **Trace.** P1 · automate · `EDGE-PUB-114` · `app/controllers/api/event_groups_controller.rb:375`

#### API-XPUB-115 — Asking for a scheduled template without the feature is silently ignored
- **Why it matters.** No error tells the buyer their recurrence was dropped.
- **Setup.** Config-dependent: scheduled_events_enabled OFF. A draft copy with its stage.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH with the publish body plus
  config {is_scheduled_template: true, schedule: {schedule_type: "daily", time_of_day:
  "09:00"}}. 2. Read the event.
- **Expected (today).** HTTP 200; the event is published as a normal event —
  is_scheduled_template is only set when scheduled_events_enabled? (update_service.rb:250),
  and the schedule keys are stripped from the persisted config (…:247).
- **Oracle.** is_scheduled_template false; no ScheduledJob.
- **Trace.** P2 · automate · `EDGE-PUB-115` · `app/services/event_groups/update_service.rb:250`

#### API-XPUB-116 — An unknown schedule_type crashes the publish with a 500
- **Why it matters.** User-supplied recurrence validated by raising is a guaranteed 500.
- **Setup.** gate: `scheduled_events_enabled`. A draft copy with its stage.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH with the publish body plus
  config {is_scheduled_template: true, schedule: {schedule_type: "hourly", time_of_day:
  "09:00"}}.
- **Expected (today).** Must be 422. handle_recurring_template → ScheduleBuilder.build
  raises ArgumentError 'Unknown schedule_type: hourly' (schedule_builder.rb:52;
  update_service.rb:567), unrescued → 500 after the stages were processed (the transaction
  rolls back).
- **Oracle.** No 5xx; event still draft.
- **Trace.** P1 · automate · `EDGE-PUB-116` · `app/services/scheduled_jobs/schedule_builder.rb:52`

#### API-XPUB-117 — A time_of_day that is not HH:MM crashes with a 500
- **Why it matters.** Format validation by exception.
- **Setup.** gate: `scheduled_events_enabled`. A draft copy with its stage.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH with schedule
  {schedule_type: "daily", time_of_day: "9am"}.
- **Expected (today).** Must be 422. validate_time! raises ArgumentError 'time_of_day must
  be HH:MM format' (schedule_builder.rb:224) → 500. Note '25:99' passes the regex and fails
  later.
- **Oracle.** No 5xx.
- **Trace.** P2 · automate · `EDGE-PUB-117` · `app/services/scheduled_jobs/schedule_builder.rb:224`

#### API-XPUB-118 — Editing line items of a live scheduled template turns it back into a draft and pauses the job
- **Why it matters.** A silent pause of a recurring event is easy to miss; this pins the
  documented behaviour.
- **Setup.** gate: `scheduled_events_enabled`. {{eventGroupUuid}} is an ACTIVE scheduled
  template with an active ScheduledJob.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. PATCH
  /event_groups/{{eventGroupUuid}} with status draft and a line_items list. 2. Read the
  event and its job.
- **Expected (today).** HTTP 200; transition_scheduled_template_to_draft flips the event and
  its active stages to draft and pauses the job (event_group_controller_helper.rb:17-19;
  trade_controller_helper.rb transition_scheduled_template_to_draft). Republishing resumes
  it (update_service.rb:541-554).
- **Oracle.** Event draft; ScheduledJob paused.
- **Trace.** P2 · automate · `EDGE-PUB-118` · `app/controllers/concerns/event_group_controller_helper.rb:17`

## 13. Concurrency

#### API-XPUB-119 — Two publishes at once: the lock answers 516 but the second update still runs and then 500s
- **Why it matters.** The lock meant to stop double-publish both fails to stop it and turns
  it into a 500.
- **Setup.** A draft copy with its stage attached.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}`. 1. Fire two identical publish PATCHes
  to /event_groups/{{eventGroupUuid}} within the same second. 2. Compare both responses and
  read the event and audience.
- **Expected (today).** Expected: one 200 and one 422 code 516 'Transaction in Progress'
  with no second write. Today lock_transaction renders 516 but only `return`s from itself
  (event_groups_controller.rb:1513-1518), so update carries on, performs the publish/update
  a second time and then renders again → AbstractController::DoubleRenderError → 500. The
  after_action also deletes the lock the other request holds (…:1522-1526).
- **Oracle.** Exactly one of the two answers is 516 and nothing is written twice (audience
  rows, remarks, notifications).
- **Trace.** P0 · automate · `EDGE-PUB-119` · `app/controllers/api/event_groups_controller.rb:1517`

