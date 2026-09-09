# Events module — API contract, model rules, authorization

Source: `procol-backend` (read-only). All claims cite `file:line`. Routes drawn from
`config/routes.rb`; behavior drawn from the named controller/service/model files.

---

## 1. Endpoint reference

### 1.1 Event group lifecycle

#### `POST /api/event_groups` — create (draft or single-shot active)
- **Controller:** `Api::EventGroupsController#create` (`app/controllers/api/event_groups_controller.rb:24-68`)
- **Auth:** `authorize EventGroup` → `EventGroupPolicy#create?` — `user.is_allowed_to_perform_action?(team_type: nil, module_name: "trade", operation: "create_record")` (`app/policies/event_group_policy.rb:21-23`)
- **Params:**
  | param | type | required | notes |
  |---|---|---|---|
  | `status` | string enum | required | must be present or → error `2` (`event_groups_controller.rb:25-27`) |
  | `line_items` | array | required unless BOQ-based | if `config.boq_based_rfx` is false/absent and `line_items` blank → error `2` (`:28-33`) |
  | `config` | object | optional | `config.boq_based_rfx` gates the line-items requirement; if true, requires `Current.workspace.boq_in_erfx_allowed?` or → error `101` (`:29-30`) |
  | `title`, `description`, `attachments` | string/string/array | optional | passed through as-is |
- **Behavior:** wraps `EventGroups::CreateService#execute` in a DB transaction (`:46-53`). `CreateService` (`app/services/event_groups/create_service.rb`) creates only the `EventGroup` row and its `EventGroupLineItem` rows (`:33-65`) — **it never creates a `TradeRequest`/stage**. Stages are created separately via `POST /trade/template_input` (below), linked back via `event_group_id`.
- **Special case — dormant PR lock:** if any `line_items[].pr_line_item_id` belongs to a dormant-locked PurchaseRequest, `CreateService#check_dormant_pr_lock!` raises `DormantPrError` before any writes (`create_service.rb:102-123`); the controller catches this via `rescue DormantPrError => e; render_dormant_pr_error(e)` (`event_groups_controller.rb:54-56`) — a dedicated error shape, not `render_error_json`.
- **Success (200):** `EventGroup::ShowSerializer` (`app/serializers/event_group/show_serializer.rb`) with `event_group_line_item_ids`, `config` (via `get_eg_config`), `allowed_companies`, `is_bid_placed_globally: false` (`event_groups_controller.rb:59-67`).
- **Errors:** `2` "Insufficient parameters" (422), `101` "You are not allowed to perform this action" (422), `15` "Operation failed" (422, when `event_group.valid?` fails post-save — message overridden to `event_group.errors.full_messages.first`).

#### `PATCH /api/event_groups/:id` — update / activate / withdraw
- **Controller:** `Api::EventGroupsController#update` (`event_groups_controller.rb:70-103`)
- **Auth:** `authorize(event_group)` → `EventGroupPolicy#update?` — true if `user.is_procol_employee? && user.is_csm_for_company?(record.company_id)`, else `record.company_id.in?(Current.allowed_companies) && user.is_allowed_to_perform_action?(team_type: nil, module_name: "trade", operation: "create_record")` (`event_group_policy.rb:37-40`)
- **Preconditions checked before any write:**
  1. `find_and_validate_event_group_and_pr` — `EventGroup.find_by(id: params[:id])`, else error `533` "Project does not exist." (`event_group_controller_helper.rb:2578-2589`)
  2. `validate_company_urls(attachment_urls)` on every attachment URL, else error `101` (`event_groups_controller.rb:77-78`)
  3. `event_group.latest?` must be true (i.e. this isn't a superseded version), else error `101` (`:79`)
- **Params (from the reproduced activation body):**
  | param | type | notes |
  |---|---|---|
  | `status` | string enum: `draft`\|`active`\|`withdrawn` | drives which internal branch runs (see below) |
  | `title`, `description` | string | optional |
  | `attachments` | array | validated for company ownership before anything else |
  | `line_items` | array | **only consumed on the non-publish branch** (`execute`, not `publish`) — see §3 |
  | `config` | object | merged into `event_group.config` (persistent keys only — `is_scheduled_template`, `schedule`, `ends_at`, `max_occurrences` are stripped, `update_service.rb:52,206`) |
  | `terms_and_conditions` | object `{clauses: [], attachments: [{type, value}]}` | rehydrated into `TermsAndConditions` PORO (`app/poro_classes/terms_and_conditions.rb`) |
  | `show_under_open_events` | boolean | written into `config["show_under_open_events"]` (`update_service.rb:254-260`) |
  | `withdraw_remark` | object `{remarks, attachments}` | required when `status == 'withdrawn'` (see §1.1 withdraw) |
  | `draft_trade_request_uuids` → decoded to `draft_trade_request_ids` | array of ids | the stages to actually publish; any stage on the event group NOT in this list gets voided (`update_service.rb:441-443`) |
  | `audience_company_uuids` → `audience_company_ids` | array of ids | vendor company ids to invite, applied per stage via `set_customized_audiences` |
  | `delete_draft_stage_uuids` → `delete_draft_stage_ids` | array of ids | only read on the `status == 'draft'` (save-as-draft) branch, not on activation |
  | `amendment_remarks` | object `{remarks}` | only consumed if `event_group.is_amendment_draft?` |
  | `purchase_request_id` | id | if present, must resolve to an active BOQ PurchaseRequest owned by the workspace, else error `101` (`event_group_controller_helper.rb:2583-2585`) |
- **Branch selection** (`event_group_controller_helper.rb:28-38`):
  - **Publish branch** — `event_group.draft? && status=='active'` OR (`status=='active'` AND `draft_trade_request_ids` present) → `EventGroups::UpdateService#publish` (activation; adds a new stage to an already-live event in the second case).
  - **Generic branch** — `status` in `['withdrawn','draft']`, or `line_items` present, or `config` present → `EventGroups::UpdateService#execute` (draft autosave, line-item add/remove, withdraw).
  - If neither guard matches (e.g. `status=='active'` with no draft flag on an already-active event and no line_items/config change) → **no service call runs at all**; the controller falls through past the `elsif` with `new_event_group_line_item_ids`/`is_amendment_draft_event_published` undefined-but-nil-defaulted, and still attempts to render — this is itself a latent edge case worth a regression test (see BE-1.9x in the test-case file).
- **Success (200):** `EventGroup::ShowSerializer` with `stages`, `stage_vs_participants_data`, `config`, `is_bid_placed_globally` (`event_groups_controller.rb:92-102`).
- **Errors:** `533` (event not found), `101` (URL/company validation, not-latest-version, generic "not allowed"), `15` (model validation failure post-save), `712` "RFP duration exceeds RFQ end time. Please adjust." (`update_service.rb:191,262-273` — RFP bid-end must be ≤ RFQ bid-end when publishing both), `711` "You cannot delete this line item from the project" (deleting the last active line item, or one referenced by a valid proposal — `update_service.rb:134-141`), `511` "Participants limit exceeded. Maximum 500 participants are allowed." (`trade_controller_helper.rb:722-724`), `512` "You cannot remove a vendor who has already participated." (audience-removal guard, `set_audience_not_visible`/related path), and **an unhandled 500** on the activation path under the conditions analyzed in `publish-500-analysis.md`.

#### `GET /api/event_groups/:id` — show
- **Controller:** `#show` (`event_groups_controller.rb:130-289`, large — builds the full project-details payload: widgets, layers, proposals, approvals)
- **Auth:** `EventGroupPolicy#show?` — read permission on `"trade"` AND `record.get_valid_stages_for_user(Current.user).present?` (`event_group_policy.rb:52-54`) — i.e. a user with zero visible stages (e.g. a vendor not on any stage's audience) gets an authorization failure even if they otherwise have read access.

#### `GET /api/event_groups` — index / listing
- **Controller:** `#index` (`:290-330`); auth `EventGroupPolicy#index?` — read permission on `"trade"`.

#### `PATCH /api/event_groups/:id/reject_participant`
- **Controller:** `#reject_participant` (`:978-1000+`)
- **Validations, in order:** event must be active or → `2`; `remarks` required or → `752`; event must be `latest?` or → `101`; `authorize event_group, :show?`; caller must be purchaser or on the auction team or → `101`; must have at least one visible stage or → `682`; `validate_if_can_reject_participant` for stage/proposal-state conflicts.
- **Effect:** appends to `precomputed_data["rejected_company_ids"]` via `update_columns` (bypasses callbacks) and enqueues `RejectParticipantWorker`.

#### `POST /api/event_groups/:id/participants` — vendor self-participate
- **Controller:** `#participate` (`:276-288`)
- Looks up `EventGroup.active.find_by(id:)` → `533` if missing; `authorize event_group` (`EventGroupPolicy#participate?` = `show? && record.company.open_tenders?`, `:25-27`); delegates to `EventGroups::ParticipateService#execute` (`app/services/event_groups/participate_service.rb`); `ActiveRecord::RecordInvalid` → `render_error_json(15, 422, e.record.errors.full_messages.to_sentence)`; app-level `CustomException` → its own `{code, message}`.

#### `POST /api/event_groups/:id/create_clone`
- **Controller:** `#create_clone` (`:105-128`)
- Requires event `active?` or `withdrawn?` else `1122` "Only active or withdrawn events can be cloned."; requires `!created_from_pr?` else `1123` "Events with purchase requests cannot be cloned."; `EventGroupPolicy#create_clone?` additionally forbids planners and draft/PR-created events (`event_group_policy.rb:46-50`).

### 1.2 Trade request (stage) create / update

#### `POST /trade/template_input` (aliases to `#create`) / `POST /api/trade` (`resources :trade` create is NOT routed — only `show`/`update` are `resources`; creation is exclusively via the named `template_input`/`create_vendor_onboarding_events`/etc. routes)
- **Controller:** `Api::TradeController#create` (`app/controllers/api/trade_controller.rb:143-…`)
- **Auth:** `authorize TradeRequest, :create?` → `TradeRequestPolicy#create?` — create-record permission on `"trade"` AND `user.has_access_for_sourcing_events?` (`trade_request_policy.rb:13-16`)
- **Guards, in order:** `Current.workspace.trade_mode != "sell"` else `101`; if `trade_products` present — validates allowed products/locations, else a specific error code; `all_products_exist?` else `80` "Product not found"; attachment count ≤ limit else `489`; knockout/dutch + basket-auction combo forbidden → `474`.
- **Key params:** `status` (default `"active"`), `company_id`, `event_group_id` (links this stage to a previously-created draft `EventGroup` — set inside `set_configurations_for_trade`, `trade_controller_helper.rb:3063-3070`), `trade_products` (array; required unless RFI/RFP, else `80`), `bid_start_time`/`bid_end_time` (Unix epoch seconds; feed `set_trade_schedules`), `extra_closing_time`, `audience_company_ids` (only applied here if `event_group_id` is nil — i.e. non-eRFX single trades set their own audience at creation; eRFX stages get audience at event-group-activation time instead, `trade_controller.rb:180-183`), `configurations` (nested hash: `order_type`, `auction_closing_mode`, `currency_configuration`, etc.), `rfx_mode`.
- **Schedule creation:** `set_trade_schedules` (`trade_controller_helper.rb:494-527`) always builds a bidding-time `TradeSchedule` from `bid_start_time`/`bid_end_time` (`trade_schedules.end_time` is `NOT NULL` at the DB level — `db/schema.rb`, `create_table "trade_schedules"` — so a blank `bid_end_time` should surface as a DB constraint failure at this step, not later).
- **Publish-at-creation shortcut:** if `is_knockout_or_dutch_auction? && status == "active"`, `publish_auction` runs immediately (`trade_controller.rb:271-274`) — for every other `rfx_mode` created directly as `"active"`, `publish_auction` is **not called at all** here (see root-cause doc §2, candidate #1).
- **Success (200):** trade/event-group serializer (varies by whether a dummy event group was auto-created).
- **Errors:** `101`, `80`, `489`, `474`, plus whatever `set_trade_products`/`set_trade_schedules`/`set_customized_audiences` surface (`511` participant cap, etc.).

#### `PATCH /trade/:id` — update (`resources :trade, only: [:show, :update]`)
- **Controller:** `#update`; auth `TradeRequestPolicy#update?` — procol employees pass unconditionally; otherwise requires `record.company_id` in `Company.allowed_companies(user)` AND create-record permission on `"trade"`; vendor-onboarding-v2 stages additionally require `is_allowed_to_initiate_or_evaluate_vendor_onboarding_v2?`; non-vendor-onboarding stages additionally require `has_access_for_sourcing_events?` (`trade_request_policy.rb:74-90`).
- Internally reuses `edit_trade_schedules` (`trade_controller_helper.rb:530-…`) for reschedule semantics, and `edit_and_invalidate_associations_for_trade` (`:4380-…`) for products/audience/schedule edits together.

#### `PATCH /trade/:id/template_input` — same as create, but for an existing draft trade (`template_input_trade_update`, `trade_controller.rb:35-47`)
- Strips `status` from params before delegating to `#update` when the trade belongs to a scheduled template still in draft, so the update runs the draft-save path rather than draft→active (`:39-46`).

#### `POST /trade/create_new_lot`, `POST /trade/:id/add_new_stage_in_live_event`
- Lot/stage-addition entry points for already-live eRFX events; `add_new_stage_in_live_event?` policy allows either the event's owner or anyone with create access (`trade_request_policy.rb:192-194`).

#### `PATCH /trade/move_to_auction` — RFQ → Auction conversion
- **Controller:** `#move_to_auction` (`trade_controller.rb:948-…`)
- **Guards, in order:** old trade must exist (`TradeRequest.active...last`) else `95`; `old_trade.event_group.latest?` else `101`; no non-cancelled child trade already exists for this `parent_id` else `94` (idempotency guard — you cannot convert the same RFQ twice); `authorize old_trade` (`TradeRequestPolicy#move_to_auction?` = `create? && allowed_to_view_event?`, `:158-160`); caller's company must be the trade's own or broker company else `101`; old trade must not already be `auctioning?` else `93`; `auction_closing_mode` line-item→lot switch on a multi-product trade forbidden → `503`; for rank-based (`rfx_project_enabled?`) companies, `validate_start_and_end_price` runs and can return its own error code; fast-bidding requires >1 active/closed trade product else `798`.
- **Effect:** `RfqToAuction::CreateService#execute` (creates the new auction `TradeRequest` as a child of the RFQ via `parent_id`; the RFQ↔Auction link is enforced uniquely by `TradeRequest#validate_unique_auction_for_parent`, `app/models/trade_request.rb:3004-3009` — only one non-draft/cancelled/withdrawn auction per `(parent_id, event_group_id)`).

### 1.3 Line items

There is **no standalone REST resource** for event-group line items — they are managed entirely as a
nested array inside `POST /api/event_groups` (create) and `PATCH /api/event_groups/:id` (add/update/
delete, on the non-publish branch — `EventGroups::UpdateService#create_line_items` /
`#update_line_items`, `update_service.rb:95-175`). The only dedicated line-item endpoint is:

#### `PATCH /event_groups/update_egli` (evaluator scoring only)
- **Controller:** `Api::EventGroupLineItemController#update_egli` (`app/controllers/api/event_group_line_item_controller.rb:7-16`)
- Looks up the `Form` by `form_id` else `2`; `authorize trade_request` (the form's trade request, via `TradeRequestPolicy#update_egli?` = `update?`); `validate_event(trade_request)` for generic state checks; stage must be `is_auction_in_extra_closing_time?` else `741` "You can update evaluators only in evaluation time."; delegates to `update_evaluators`.

**Line-item delete semantics** (`update_service.rb:123-175`): deleting the event group's *only* line item, or the *last remaining active* one, is blocked with `711`; deleting a line item referenced by a "valid" proposal is also blocked with `711`; otherwise status is set to `in_active` (draft events) or `deleted` (active events), associated `TradeProduct`/`Form`/`EventGroupLineItemTradeMapping` rows are void/in_active'd, and PR quantity is reconciled (`update_quantity_of_purchase_request_items`).

### 1.4 Participants / audience

- `POST /api/event_groups/:id/participants` — vendor opts in (see §1.1).
- `PATCH /api/event_groups/:id/reject_participant` — buyer rejects a participant (see §1.1).
- `PATCH /trade/add_audience` / `PATCH /trade/remove_audience` (routes: `add_audience_live_auction` /
  `remove_audience_live_auction`, `config/routes.rb:959-960`) — live-auction audience edits; policy
  `add_audience_live_auction?` = `allowed_to_view_event?` (`trade_request_policy.rb:125-127`).
- Audience persistence: `Audience` model (`app/models/audience.rb`) — `enum status: {in_active, active}`,
  `enum visible: {no, yes}`; **uniqueness constraint**: `validates_uniqueness_of :audience_id, scope:
  [:item_id, :item_type, :visible, :status], if: -> { status == :active }` (`audience.rb:24`) — i.e. a
  company can only have one *active* audience row per `(item, visible)` combination, but can have
  multiple in_active/historical rows (soft-delete pattern, not hard-delete).
- Audience cap enforced during publish: max 500 new audience company ids per stage, else `511`
  (`trade_controller_helper.rb:722-724`).

### 1.5 Bids

- `POST /bids/template_input` — bid creation.
- `PATCH /bids/:id` (`edit_bid`), `PATCH /bids/revise_bid/:id` (`update_bid`), `PATCH
  /bids/sheet_update/:id`, `PATCH /bids/update_bid_status/:id`, `PATCH /bids/:id/reject`.
- `POST /bids/accept_knockout_offer`, `POST /bids/accept_dutch_offer` — automated-offer acceptance for
  those auction modes.
- `resources :bids, only: [:show, :index]` and, in the seller-scoped route group, `only: [:create,
  :update]` (`config/routes.rb:316, 989`).
- **Auth:** `BidPolicy` is almost entirely open (`create_bid?`, `update_bid?`, `edit_bid?`,
  `revise_bid?`, `show?`, `index?` all `return true` — `app/policies/bid_policy.rb:9-47`); the two
  exceptions are `approval_workflows_for_surrogate_bid_create?` (gated on approval-flow read
  permission) and `add_feedback?` (must own the trade request or be on the team + super-admin/close-bid
  config, `bid_policy.rb:53-60`). Real bid-eligibility gating happens deeper in the bid services, not at
  the policy layer.

### 1.6 Awarding

- `POST /proposal` (create), `GET /proposal/:id` (show), `POST /proposal/:id/add_response`, `POST
  /proposal/:id/submit` — the awarding proposal workflow.
- `POST /trade/:id/close_bid` (buyer selects a winning bid) and `POST
  /trade/:id/close_bid/approval_workflows`.
- `GET /reports/download_awarding_sheet/:uuid`, `POST /reports/upload_awarding_sheet/:uuid`.
- **Auth:** `ProposalPolicy#add_response?` (used by `show?`, `submit?`,
  `approval_workflows_for_proposal_create?`, `discard_draft_proposal?`) — procol employees pass
  unconditionally, otherwise `record.company_id.in? Company.allowed_companies(user)`
  (`app/policies/proposal_policy.rb:18-23`). `create_contract_form?` additionally requires the
  `is_contract_creation_enabled` custom-configuration flag (`:33-35`).
- **Awarding-allowed gate** (used to compute `config.should_allow_awarding` in every event-group
  response): `is_awarding_allowed?` (`event_group_controller_helper.rb:629-648`) — false if a
  `selected`/`requested` proposal already exists, or the current user already has a `draft` proposal, or
  the latest commercial stage is in an "extra-closing-time-only" close window it hasn't reached yet.

---

## 2. Model rules

### 2.1 `EventGroup` (`app/models/event_group.rb`)
- **Status enum:** `{in_active: 0, active: 1, draft: 2, withdrawn: 3}` (`:85`) — note there is **no
  "closed"/"requested" status at the event-group level**; those exist only on individual
  `TradeRequest` stages.
- **Validations:** only `user_id` presence and `company_id` presence (`:57-58`) — essentially all
  activation/transition rules live in the controller/service layer (`EventGroups::UpdateService`), not
  as model validations.
- **Callbacks:**
  - `before_create :precompute_data, :precompute_data_v1, :add_configs` (`:110`)
  - `after_commit :send_rfi_invitation_mails, :notify_planner_on_creation, :send_rfx_invitation_mails`,
    each `if: saved_change_to_status?(to: 'active')` (`:112-114`) — all three internally
    `return if is_scheduled_template?` and/or check for a "dummy event group" before doing anything
    (`:489-503, 743-750`) — reviewed, guarded, safe on nil association data.
  - `after_create_commit :add_ref_id` (`:115`) — assigns `"RFX-#{count}"` via `update_columns` (bypasses
    validation/callbacks).
  - `after_update_commit :send_event_group_withdraw_mails, if: saved_change_to_status?(to:
    'withdrawn')` (`:116`)
  - `after_update_commit :update_in_progress_quantity, if: saved_change_to_status?(to: 'active') ||
    saved_change_to_status?(to: 'withdrawn')` (`:117`)
  - `after_update_commit :update_previous_version_data, if: saved_change_to_status?(to: 'active', from:
    'draft')` (`:118`) — this is the exact callback for a draft→active transition; it early-returns if
    `previous_version_item.blank?` (`:704-708`), i.e. a no-op for a first-time (non-amendment) publish.
  - `after_save_commit :invalidate_mcp_cache` (`:119`)
- **Visibility scope:** `get_valid_stages_for_user(user, participant_company_ids: nil)`
  (`event_group.rb:511-…`) — for a draft event, only the owner / super-admin / procol employee sees any
  stages at all (`:512-514`); otherwise per-stage `is_allowed_to_view?(user)` gates visibility, and this
  method is what `EventGroupPolicy#show?` uses to decide access.

### 2.2 `TradeRequest` (stage) (`app/models/trade_request.rb`)
- **Status enum:** `{in_active: 0, active: 1, closed: 2, scheduled: 3, void: 4, withdrawn: 5, requested:
  6, draft: 7, cancelled: 8}` (`:162`) — `void` is reserved for hard "remove from everywhere" (comment:
  "done only via ssh"); `cancelled` is specifically for removing draft events (`:159-161`).
- **`rfx_mode` enum:** `{auction: 0, rfq: 1, rfq_then_auction: 2, offline_trade: 3, rfi: 4, rfp: 5}`
  (`:164`) — DB column is `NOT NULL` with `default: 0` (schema).
- **`STANDARD_STAGES_SEQUENCE`:** `{rfp: 1, rfq: 2, auction: 3, rfq_then_auction: 4}` (`:155`) — used to
  order stages during publish; note `rfi` and `offline_trade` are **not** in this map (`.compact`'d away
  wherever used — not an error, just excluded from ordering).
- **Validation:** only one custom validator found — `validate_unique_auction_for_parent, on: :create`
  (`:277`) — enforces at most one non-draft/cancelled/withdrawn auction per `(parent_id,
  event_group_id)`, i.e. an RFQ can only be converted to a live auction once (`:3004-3009`).
- **Schema nullability (important for the 500 investigation):** `bid_start_time`/`bid_end_time` on
  `trade_requests` itself are nullable (`db/schema.rb`, no `null: false`) — but the *actual bidding
  window* lives in the separate `trade_schedules` table, where `end_time`/`start_time` ARE `NOT NULL`.
  A `TradeRequest` can exist with null `bid_start_time`/`bid_end_time` denormalized columns; it cannot
  have a persisted `TradeSchedule` with a null `end_time`.
- **Callbacks (selected, `:275-309`):** `before_save :set_bid_end_time, :set_tender_value,
  :skip_activity_log_for_draft`; `after_create_commit :schedule_auto_award_worker,
  :send_notification_and_mail_trade_creation, :add_event_group_details,
  :update_latest_stage_time_on_eg, :add_ref_id, :update_trade_reference_in_fx_response`;
  `after_update_commit :update_event_group_details (if changed_closed_at_or_status?),
  :send_trade_update_notification, :send_notifications_and_mail_for_published_order`; `after_commit
  :calculate_savings, :mark_event_closed (if saved_change_to_closed_at?), :delete_draft_bids (if
  saved_change_to_closed_at?), :enqueue_event_closed_report (if saved_change_to_status?(to:
  'closed'))`.

### 2.3 `TradeSchedule` (`app/models/trade_schedule.rb`)
- **`schedule_type` enum:** `{rfq: 0, auction: 1, rfq_extra_closing_time: 2,
  auction_extra_closing_time: 3, offline_trade: 4, bidding_time: 5, extra_closing_time: 6,
  dynamic_extra_time: 7, approval_pending_time: 8, sealbid_extension_time: 9,
  response_review_time_for_participant: 10}` (`:24-27`) — comment: "`bidding_time` and
  `extra_closing_time` are generic ... not dependent on RFX mode," i.e. used by RFI/RFP ("technical")
  stages in place of `rfq`/`auction`.
- **Scopes:** `for_bidding_time` = `[rfq, auction, bidding_time, dynamic_extra_time,
  sealbid_extension_time]`; `for_extra_closing_time` = `[rfq_extra_closing_time,
  auction_extra_closing_time, extra_closing_time]` (`:35-36`).
- **No `validates` calls at all** on this model — every invariant (non-null end_time, chronological
  ordering) is enforced only by the DB column constraint (`NOT NULL`) or by caller-side logic, never by
  Rails validations. A caller that builds a `TradeSchedule` and calls plain `.save` (not `.save!`) will
  get `false` back on constraint violation, not an exception — but a bare DB-level `NOT NULL` violation
  on `.save`/`.save!` still raises `ActiveRecord::NotNullViolation`, uncaught, if nothing rescues it.

### 2.4 `EventGroupLineItem` (`app/models/event_group_line_item.rb`)
- **Status enum:** `{in_active: 0, active: 1, draft: 2, deleted: 3}` (`:28`); `VALID_STATUSES = [:active,
  :deleted]` is the set actually shown in most read paths (`:32`).
- **Callbacks:** `after_update_commit :enqueue_deletion_worker, :enqueue_eg_update_worker, if:
  saved_change_to_status?(to: 'deleted')` (`:44`); `after_save_commit :invalidate_mcp_cache` (`:45`).
- No presence/uniqueness validations declared on this model either.

### 2.5 `Audience` (`app/models/audience.rb`)
- **Enums:** `status: {in_active: 0, active: 1}`, `visible: {no: 0, yes: 1}`, `source: {added_by_creator:
  0, self_registered: 1}` (`:11-13`).
- **Uniqueness:** `validates_uniqueness_of :audience_id, scope: [:item_id, :item_type, :visible,
  :status], if: status == :active` (`:24`).
- **Callbacks:** `after_save_commit :send_push_notification, :invalidate_mcp_cache`;
  `after_save_commit :update_vendor_onboarding_status, if: item_type == "TradeRequest" &&
  item.vendor_onboarding? && item.vendor_activity_onboarding?`; `after_update_commit
  :notify_invisible_audience_with_active_bid, if: visibility_changed_to_no?` — this last one emits a
  Sentry message (not an exception) if a vendor with an active bid gets hidden (`:71-90`).

---

## 3. Authorization table

| Action | Endpoint | Policy method | Gate |
|---|---|---|---|
| List events | `GET /api/event_groups` | `EventGroupPolicy#index?` | read-permission on module `"trade"` |
| View one event | `GET /api/event_groups/:id` | `EventGroupPolicy#show?` | read-permission on `"trade"` **and** at least one visible stage for this user (`get_valid_stages_for_user`) |
| Create event (draft or direct) | `POST /api/event_groups` | `EventGroupPolicy#create?` | create-permission on `"trade"` |
| Update / activate / withdraw event | `PATCH /api/event_groups/:id` | `EventGroupPolicy#update?` | procol-employee-and-CSM-for-company, **or** (`company_id` in caller's allowed companies **and** create-permission on `"trade"`) |
| Clone event | `POST /api/event_groups/:id/create_clone` | `EventGroupPolicy#create_clone?` | company in allowed companies, create-permission on `"trade"`, **not** a planner, **not** draft, **not** PR-created |
| Vendor self-participate | `POST /api/event_groups/:id/participants` | `EventGroupPolicy#participate?` | `show?` **and** `company.open_tenders?` |
| Reject a participant | `PATCH /api/event_groups/:id/reject_participant` | `EventGroupPolicy#show?` + inline checks | purchaser or auction-team member (checked inline in the action, not the policy) |
| Change event ownership | `POST /api/event_groups/:id/change_ownership` | `EventGroupPolicy#change_ownership?` | `show?` **and** (super-admin, procol employee, or the event's own creator) |
| Create stage / trade | `POST /trade/template_input` etc. | `TradeRequestPolicy#create?` | create-permission on `"trade"` **and** `has_access_for_sourcing_events?` |
| Update stage | `PATCH /trade/:id` | `TradeRequestPolicy#update?` | procol employee passes unconditionally; else company in allowed companies **and** create-permission on `"trade"`, plus mode-specific vendor-onboarding checks |
| RFQ → Auction conversion | `PATCH /trade/move_to_auction` | `TradeRequestPolicy#move_to_auction?` | `create?` **and** `allowed_to_view_event?` (`show? && record.is_allowed_to_view?(user)`) |
| Add stage to live event | `POST /trade/:id/add_new_stage_in_live_event` | `TradeRequestPolicy#add_new_stage_in_live_event?` | event owner **or** `create?` |
| Update evaluators (line item) | `PATCH /event_groups/update_egli` | `TradeRequestPolicy#update_egli?` (= `update?`) | same as stage update, **plus** inline check that the stage is in extra-closing/evaluation time |
| Create/edit/revise bid | `POST/PATCH /bids/...` | `BidPolicy` (mostly `true`) | effectively open at the policy layer — eligibility enforced deeper in bid services |
| Awarding — view/respond to proposal | `GET/POST /proposal/...` | `ProposalPolicy#add_response?` | procol employee passes unconditionally; else company in allowed companies |
| Awarding — create contract form | `POST /proposal/:id/create_contract_form` | `ProposalPolicy#create_contract_form?` | `add_response?` **and** `is_contract_creation_enabled` custom config |

All `is_allowed_to_perform_action?` checks resolve against the caller's team/role permission matrix
(`module_name: "trade"`, various `operation` values — `"create_record"`, `"read_record"`); this is a
separate role-config subsystem not re-derived here (see `User#is_allowed_to_perform_action?` if you need
the exact permission-key storage format).
