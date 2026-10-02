# Root-cause analysis: `PATCH /api/event_groups/:uuid` 500 on both `draft` and `active`

Scope note: static-analysis only (read-only repo, no DB/log access, per instructions). Every claim
below is anchored to `file:line` in `procol-backend`. The previous pass's #1 candidate
(`publish_auction` → `TradeSchedule.change_auction_time` dereferencing a nil bidding-time schedule) is
**confirmed still real** but is only reachable when `status == 'active'` — it cannot explain the
`status: 'draft'` 500, so it is demoted below the candidates that are actually shared code.

## 0. Why there's no error code (unchanged from prior pass, re-verified)

No `rescue_from` exists in `app/controllers/application_controller.rb` or
`app/controllers/api/api_controller.rb` (grepped, none found), and
`Api::EventGroupsController` adds none either. `render_error_json`
(`app/controllers/concerns/json_helpers.rb:8-27`) always emits `{"error": {...}}`. The response you're
getting — `{"status":500,"error":"Internal Server Error"}` — is Rails' own default handler for an
**unrescued exception**, of any class. That broadens candidates to include control-flow bugs
(double-render, etc.), not just `NoMethodError`-on-nil.

## 1. What's actually shared between the two statuses (traced line by line)

`Api::EventGroupsController#update` (`app/controllers/api/event_groups_controller.rb:70-103`) is
**identical code for both payloads** up through the call to `update_event_group_data`. Only *inside*
`update_event_group_data` (`app/controllers/concerns/event_group_controller_helper.rb:15-46`) does the
branch split:

```ruby
if (event_group.draft? && params[:status] == 'active') || (params[:status] == 'active' && params[:draft_trade_request_ids].present?)
  _event_group, is_amendment_draft_event_published, error_code = update_service.publish(params)   # active only
elsif ['withdrawn', 'draft'].include?(params[:status]) || params[:line_items].present? || params[:config].present?
  _, new_event_group_line_item_ids, error_code = update_service.execute(params)                    # draft only
end
```
(`event_group_controller_helper.rb:29-34`)

I confirmed `params[:status] == 'active'` is false for both clauses when the request body has
`"status":"draft"`, so **`publish()`/`publish_auction` genuinely cannot run for the draft payload** —
the previous report's #1 is correctly ruled out for that case, as the task states.

I also re-verified the uuid-decoding claim from the prior pass, since it's load-bearing for several
candidates below: `before_action :check_for_uuid` (`app/controllers/concerns/params_auth.rb:9`) →
`decode_the_uuid_for_hash` (`params_auth.rb:66-79`) walks the **entire** params tree recursively and,
for any key containing `"uuids"`, decodes every element and writes it under the `ids`-suffixed key
back into `params` (`params_auth.rb:54-55`). So `params[:draft_trade_request_ids]`,
`params[:audience_company_ids]`, and `params[:delete_draft_stage_ids]` really are populated (as empty
or single-element arrays, matching the `_uuids` payload) by the time the controller runs. **Verified,
not the bug** — same conclusion as before, re-derived independently.

Given that, the two service methods (`execute` for draft, `publish` for active) are **different Ruby
methods** — most of their code is not literally shared. The candidates below are ranked by how much of
the actual crash site is identical/reachable in both, not by which one merely produces the same
symptom.

## 2. Ranked candidates

### #1 (most likely) — `lock_transaction` renders, then `update` renders again → `AbstractController::DoubleRenderError`

```ruby
def update
  event_group, purchase_request, error_code = find_and_validate_event_group_and_pr(params)
  render_error_json(error_code) && return if error_code.present?
  authorize(event_group)
  lock_transaction                                          # <- event_groups_controller.rb:74, no "&& return"
  ...
  render(json: ActiveModelSerializers::SerializableResource.new(...))   # <- event_groups_controller.rb:93-103
end
```
(`app/controllers/api/event_groups_controller.rb:70-103`, call site at line 74)

```ruby
def lock_transaction
  eg_lock_key_identifier = EventGroup.get_eg_lock_key_identifier(params["id"])
  return if eg_lock_key_identifier.blank?
  if Rails.cache.fetch(eg_lock_key_identifier).present?
    render_error_json(516) && return                          # <- only returns from lock_transaction!
  end
  Rails.cache.write(eg_lock_key_identifier, 'locked', expires_in: 8.seconds)
end
```
(`app/controllers/api/event_groups_controller.rb:1511-1518`)

`return` inside a private helper method returns from **that method**, not from the caller. Every other
guard in `update` uses `render_error_json(...) && return if ...` at the *call site*
(`event_groups_controller.rb:71, 76, 77`), but the call to `lock_transaction` itself
(line 74) is bare — no `&& return`. If `Rails.cache.fetch(eg_lock_key_identifier).present?` is true
(i.e., a lock for this exact event_group id is already held), `lock_transaction` calls
`render_error_json(516)` (a real `render`, confirmed at `app/controllers/concerns/json_helpers.rb:26`)
and returns `nil` — but `update` doesn't notice and **keeps running**: it re-validates URLs, calls
`update_event_group_data` (a second, redundant write attempt), and finishes with a second
`render(json: ...)` at line 93-103. Two `render` calls in one action is
`AbstractController::DoubleRenderError` — an unrescued Rails exception, which produces **exactly** the
generic `{"status":500,"error":"Internal Server Error"}` shape, with **no application error code**,
identically regardless of `status: 'draft'` or `status: 'active'`, line-item count, audience count, or
stage type — because it fires **before any of that request's own branch-specific code runs at all**.

**Reachable with status=draft? YES.** `lock_transaction` (line 74) runs unconditionally, before the
draft/active branch is even reached.
**Reachable with status=active? YES**, same call site.

**Before or after the write commits:** BEFORE — for the *colliding* request, the double-render happens
after `update_event_group_data` runs a second time (so if that second run doesn't itself error, its
write *does* commit, then the trailing render is what blows up). The event_group draft is not
necessarily lost, but the response the client sees is a 500 either way.

**Why this fits every dimension of the repro:** it doesn't care what's in the JSON body at all — line
items, audience count, T&C shape are irrelevant because the crash is in code that runs before that
payload is ever inspected. It explains identical failures for auction/RFQ/RFP equally (stage type is
irrelevant too). The one thing it *requires* is that a lock for the same event_group id is already held
when the failing request arrives — i.e., **two `PATCH` calls to the same `/api/event_groups/:id` within
the same rolling 8-second window** (`expires_in: 8.seconds`, `event_groups_controller.rb:1517`). This is
very plausible for UI-automation reproduction: a debounced/duplicate button click, a Stagehand
retry-on-selector-miss re-issuing the same "Save"/"Publish" click, or the harness re-sending a payload
after a slow response — all of which would hit this exact code path on the second attempt. (Titles like
`UI_Probe_Draft_...` in your repro are consistent with a probing/retrying harness.) Note this candidate
explains why **retries/duplicates** 500 with this exact shape; it doesn't by itself explain why the
very first, non-duplicated call would fail — for that, the first call's own root cause is one of the
service-layer candidates below, and this lock bug is what makes *every subsequent attempt* look
identically broken (masking the real first-failure cause behind an unrelated `DoubleRenderError`).

**Confirmation step:** grep the Rails/Sentry backtrace for `AbstractController::DoubleRenderError`
(distinct exception class from a `NoMethodError`, easy to tell apart in one log line). Discriminating
request variation: space the two PATCH calls (or a single PATCH retried) more than 8 seconds apart —
if that succeeds where back-to-back calls fail, this is confirmed. Also check the app/access log for
two `PATCH /api/event_groups/<id>` hits within ~8s of each other for the *same* id.

---

### #2 — `set_customized_audiences`, the one substantive method actually shared by both branches

Draft path: `EventGroups::UpdateService#execute` calls it directly with the real request params:
```ruby
_trade_request, error_code = set_customized_audiences(params, trade_request, is_draft_event: true)
```
(`app/services/event_groups/update_service.rb:69`, inside the `if @status == 'draft'` block,
`update_service.rb:61-74`)

Active/publish path: `publish` → `process_trade_requests_for_publish` → `publish_trade` calls the
*same* method with a hand-built options hash:
```ruby
def publish_trade(trade, options)
  options["trade_products"] = trade.trade_products
  new_trade, error_code = set_customized_audiences(options, trade)     # is_draft_event defaults to false
  ...
```
(`app/services/event_groups/update_service.rb:315-318`, `options` built at `update_service.rb:188-190`)

This is the **only non-trivial method literally shared** by both statuses (as opposed to two separate
methods that merely look similar). Full body: `app/controllers/concerns/trade_controller_helper.rb:687-729`.

Key facts that make this method's behavior different from what it was written for: a stage created for
an eRFX event group (`event_group_id` present) **never gets its audience initialized at creation time**
— `Api::TradeController#create` only calls `set_customized_audiences` `if new_trade.event_group_id.nil?`
(`app/controllers/api/trade_controller.rb:176-179`). So by the time either PATCH (draft-save or
publish) runs, this is the **first time ever** that `customised_audience`/`audiences` are touched for
that stage — it's running against a stage in a state (`customised_audience == "everyone"` default, zero
`audiences` rows) that this code may not be exercised against elsewhere. I traced the exact given
payloads (`audience_company_uuids: []` and `: ["WE5YWlpa"]`) through every line of
`trade_controller_helper.rb:687-729`, `get_audience_company_ids`
(`trade_controller_helper.rb:4364-4376`), and `create_audience`/`get_valid_audience_ids`
(`app/controllers/concerns/common_controller_helper.rb:94-101, 104-110`) and could not find a raise for
*these exact* values — every branch degrades to empty arrays cleanly. I flag it as #2 rather than #1
because I could not pin the exact line without live data (this method's behavior depends on DB state —
existing `audiences` rows, `Current.workspace.vendors` blacklist status, `trade.trade_products` — none
of which is visible from the request body alone), but it remains the most likely *service-layer*
candidate precisely because it's the one piece of real logic both branches actually run.

**Reachable with status=draft? YES** (`update_service.rb:69`, `is_draft_event: true`).
**Reachable with status=active? YES** (`update_service.rb:317`, `is_draft_event: false`).

**Before or after the write commits:** BEFORE — this runs, then `trade_request.save!`
(`update_service.rb:73`, draft path) / `tr.save` (`update_service.rb:448`, active path) persist the
stage. If this method raises, nothing for that trade_request is saved on this request.

**Confirmation step:** this is the single best place to point Sentry/APM at. If the backtrace is inside
`trade_controller_helper.rb:687-729` (or the audience helpers it calls) for **both** the draft and
active reproductions, this is confirmed. Absent Sentry, add temporary logging (or check existing
request logs) for the stage's `audiences` row count and `trade_products` row count immediately before
this call on both reproductions — an empty `trade_products` association on what should be a
product-bearing stage is the most likely trigger for a downstream `nil`/type error in the "map vendors
to categories" block (`trade_controller_helper.rb:702-707`, active-only) or in `get_audience_company_ids`
for a non-"everyone" trade product lookup.

---

### #3 — `TradeSchedule.change_auction_time(nil)` inside `publish_auction` — real, but **active-only**, confirmed not shared

```ruby
trade_schedule = trade_request.trade_schedules.for_bidding_time.last   # trade_controller_helper.rb:4309
trade_schedule = TradeSchedule.change_auction_time(trade_schedule)     # trade_controller_helper.rb:4310
```
```ruby
def self.change_auction_time(trade_schedule)
  return trade_schedule if trade_schedule.start_time > DateTime.now    # trade_schedule.rb:139
```
If `for_bidding_time.last` (scope at `app/models/trade_schedule.rb:35`, includes the RFI/RFP-generic
`bidding_time` type per the comment at line 29) returns `nil` for this stage, line 139 raises
`NoMethodError: undefined method 'start_time' for nil:NilClass` — unrescued, matching your symptom
exactly, for **auction, RFQ, and RFP alike** (the scope is stage-type-agnostic).

**Reachable with status=draft? NO** — confirmed by re-tracing `update_event_group_data`
(`event_group_controller_helper.rb:29-32`): `publish()` (and therefore `publish_auction`,
`update_service.rb:320`) only runs when `params[:status] == 'active'`; for `status: 'draft'` this whole
branch is skipped in favor of `execute()`. This candidate **cannot** be the fault common to both
statuses, per the task's own ruling — kept here only because it's still a real, confirmed bug on the
active/publish reproduction specifically, and worth fixing regardless of whether it's the one explaining
your draft repro.

**Before or after the write commits:** DURING — `process_trade_requests_for_publish` wraps each
trade_request's publish in its own `ActiveRecord::Base.transaction` (`update_service.rb:440-449`), and
the outer `ActiveRecord::Base.transaction do ... end` in `update_event_group_data`
(`event_group_controller_helper.rb:23-32`) wraps the whole publish call — an uncaught exception here
rolls back both, so the event group stays in `draft` in the DB even though the client sees a 500.

**Confirmation step:** for the specific stage referenced by the *active* repro's
`draft_trade_request_uuids`, check whether it has a `trade_schedules` row with `schedule_type` in
`(rfq, auction, bidding_time, dynamic_extra_time, sealbid_extension_time)`. No such row (or a Sentry
frame through `trade_schedule.rb:139` / `trade_controller_helper.rb:4310`) confirms it. This is
orthogonal to #1/#2 above and would need to be fixed separately if present.

## 3. Hints explicitly checked and ruled out for these exact payloads

- **`line_items: []`** — guarded by `if @line_items.present?` at both `create_line_items`/`update_line_items`
  call sites (`update_service.rb:78-79`); `[].present?` is `false` in Rails, so these are skipped
  entirely for both payloads. No index/`.first`/`reduce` runs.
- **`terms_and_conditions` with `clauses: []` and `attachments: [{"type":"t_and_c","value":[]}]`** —
  traced through `TermsAndConditions.new` (`app/poro_classes/terms_and_conditions.rb:32-35`) and
  `Attachment.new`/`AttachmentValue` (`app/poro_classes/attachment.rb:12-15`): every `.map` is over an
  empty array, no raise. Traced the read-back path too (`EventGroup#terms_and_conditions_structured`,
  `app/models/event_group.rb:355-368`, and `parse_tnc_clauses`, `event_group.rb:1271-1273`) — `raw.blank?`
  short-circuits to `[]` cleanly. Not the bug for this payload.
- **`amendment_remarks: {}` vs `{"remarks":""}`** — `add_amendment_remarks!`
  (`app/models/versioning/methods.rb:102-108`) is only ever called from `publish()`
  (`update_service.rb:193`), gated by `@event_group.is_amendment_draft?`. That method
  (`versioning/methods.rb:97-100`) short-circuits `return nil if self.status != "draft"` — at the point
  it's called in `publish()`, `@event_group.status` is **still** `"draft"` (the flip to `active` happens
  later, `update_service.rb:214`), so the guard doesn't return early, and the subsequent
  `Versioning::ItemVersion.exists?(...)` check is `false` for a first-time (non-amendment) event, so
  `add_amendment_remarks!` never runs for your repro. Also unreachable for `status: 'draft'` regardless.
- **`delete_draft_stage_uuids: []` / `audience_company_uuids: []`** — decode confirmed correct (see
  §1); both resolve to `[]`/absent, and every consumer (`update_service.rb:65-66`,
  `set_customized_audiences`) treats empty arrays as "no-op" branches without raising, as traced above.
- **`lock_transaction` / `event_group.latest?`** — `latest?` (`versioning/methods.rb:72-74`) is a plain
  `.blank?` query, no raise. `lock_transaction` itself doesn't raise — but see candidate #1, which is
  about what happens *around* it, not inside it.
- **uuid→id decode helper / `find_and_validate_event_group_and_pr`** — `find_and_validate_event_group_and_pr`
  (`event_group_controller_helper.rb:2578-2588`) is a straightforward `find_by`/blank check, no raise for
  a valid id. `decode_the_uuid_for_hash` was traced in full in §1 — no raise path found for these payloads.
- **Config/feature-flag dependence (#8)** — `scheduled_events_enabled?` gates are all additionally
  guarded by `event_group.is_scheduled_template?` and/or `params[:line_items].present?`
  (`event_group_controller_helper.rb:16-19`, `update_service.rb:83-84`), both false here; not
  environment-specific for this repro. `rfx_project_enabled?` only gates code inside `publish_auction`
  (candidate #3), not the draft path.

## 4. Bottom line

Ranked: **#1 lock/double-render** (`event_groups_controller.rb:74` + `:1511-1518`, common to both
statuses, explains the exact no-error-code 500 shape, needs a same-id retry within 8s to trigger) >
**#2 `set_customized_audiences`** (`trade_controller_helper.rb:687-729`, the one real method both
branches share, exact line unconfirmed without live data) > **#3 `publish_auction`/nil trade_schedule**
(`trade_controller_helper.rb:4309-4310`, confirmed real but active-only, cannot explain the draft repro).

**First thing to run:** pull the Sentry issue (or raw Rails log) for one of the two reproductions and
read the exception class name off the first line — `AbstractController::DoubleRenderError` confirms #1
immediately; anything else with a backtrace frame in `trade_controller_helper.rb` around line 687-729
confirms #2. That single lookup resolves this faster than any further static reading can.
