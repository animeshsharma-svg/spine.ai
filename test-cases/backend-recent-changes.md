# Procol backend — test cases for recent changes

**Scope:** the `Procol-Tech/procol-backend` commits merged to `main` **between 2026-09-01 and 2026-09-25** — the 129 commits added since this machine's checkout (`0ac00b3e72`) up to `ae36e86894`. 29 features + 44 fixes; the single-customer ones (Decathlon, Bluestar, Laxmi, Zupee, Synthite, Somany, SLRM) are left out. What follows are the **generic, testable** changes, each grounded in the real code at `origin/main` with `file:line`, and written as human QA cases with a **field-level validation checklist** where the change is API-assertable — the same "did each field come back correct" idea as the recorded-flow report.

> **How this was made:** read-only deep-dive of the diffs (`git show`), no live code/config/DB touched. Anything marked **Runnable** can be exercised against the `API_Test_`/`QA_Platform_` sandbox through the existing API framework; the rest need a specific company flag or role and are written for manual/verification runs.

## Change index

| ID group | Change | PR | Endpoint / trigger | Gate | Runnable |
|---|---|---|---|---|---|
| BE-CAT | Prevent duplicate product-category names | #15750 | `POST /product_categories`, `PATCH /product_categories/edit` | company `prevent_duplicate_product_categories` (off by default) | **Yes** |
| BE-QTY | Hide requested quantity from sellers | #16001 | `GET /event_groups/:id/get_line_items` + submission sheet | company/template config + `is_seller?` | Partial |
| BE-USR | Recover-user API for Super Admins | #15591 | `POST /users/recover/:id` | Super Admin / Procol employee | Partial |
| BE-REG | Self-registration auto-onboarding switch | #15944 | `POST /become_vendor/verify_otp` + `/submit` | company `auto_onboarding_for_self_registered_vendors` | Partial |
| BE-LOA | `loa: null` when no LOA template | #16003 | `GET /proposal/:id` | data-driven (LOA template) | Partial |
| BE-EML | Super Admin edit user email & phone | #15600 | `PATCH /users` | company `super_admin_edit_user_contact_enabled` + Super Admin | Yes (negatives) |
| BE-VND | `restricted_vendor_email_address` PAN↔domain | #15974 | `POST /send_invite`, `POST /create_subsidiary` | company `restricted_pan_email_domains` (empty = off) | Partial |
| BE-BOQ | BOQ 1000 = bulk-insert perf rework (cap unchanged) | #15339 | `POST /event_groups`, `POST /download_report` | `boq_in_erfx_allowed?`; cap = config `allowed_maximum_line_items` | Partial |
| BE-VER | Event-group versioning / amendment fixes (×6) | various | PR amendment → new version | — | No (setup-heavy) |
| BE-AUC | Auction / counter-offer fixes (×7) | various | mixed (auction report, bids api, mailers, workers) | Dutch / rfx_project / rfq_then_auction | Mostly no |
| BE-PR | PR / intake / hold-unhold (×8+) | various | `change_hold_status_for_item`, `/activity_logs`, intake | mixed configs | Partial |
| BE-VNR | Vendor invoice-uniqueness, SCIM tenant-scope, reports, LOA, mailer switch | various | mixed (flexi automation, SCIM, reports, proposal) | mixed configs; SCIM = security | Partial |

---

# BE-CAT · Prevent duplicate product-category names within a company (#15750)

**What changed.** An opt-in company config rejects a product category / sub-category whose name already **exists at the same level** (same parent, `hierarchy_type`, `category_type`) for that company — on **create, rename, or reparent** — matching **case-insensitively and whitespace-trimmed**. Existing duplicate rows stay editable on unrelated fields. The integrations/PR path is deliberately **idempotent-reuse** (it returns the existing node instead of erroring).

- **Endpoints:** `POST /api/product_categories` → `ProductCategoriesController#create` (`app/controllers/api/product_categories_controller.rb:120`); `PATCH /api/product_categories/edit` → `#edit_category` (`:146`). Model validation fires on any `.save`.
- **The rule:** `["LOWER(TRIM(name)) = ?", name.strip.downcase]` (`app/models/product_category.rb:253`), scoped `ProductCategory.active.where(company_id:, ancestry:, hierarchy_type:, category_type:)` excluding self (`:237`). Fires when `new_record?` or name/ancestry/hierarchy_type/category_type changed (`:214`). `na_category?` and blank names exempt; only **active** rows collide.
- **Gate:** config key `prevent_duplicate_product_categories`, **default OFF** (`Company`, invisible switch). `ProductCategory.duplicate_prevention_enabled?(company)`.
- **Rejection:** base error `"Category already exists."` (root) or `"Sub-Category already exists under this Category."` (has parent) → HTTP **422** `{"error":{"code":15,"message":"…"}}`.

#### BE-CAT-001 — a genuinely new sibling name is accepted
- **Precondition:** gate ON; category "Bolts" exists under parent P.
- **Steps:** `POST /product_categories` name="Washers", parent_id=P, hierarchy_type as for a sub-category.
- **Expected:** 201; the category is created; response carries its `id`/`uuid` and `name: "Washers"`.
- **Validations:**

| # | Field / check | Assertion | Expected |
|---|---|---|---|
| 1 | HTTP status | responds 2xx | 200/201 |
| 2 | `name` | echoes what was sent | `Washers` |
| 3 | `id`/`uuid` | present in response | a value |

- **Priority:** P1 · **Runnable:** yes (sandbox company with gate on)

#### BE-CAT-002 — a case-only variant is rejected
- **Precondition:** gate ON; sibling "Bolts" exists under P.
- **Steps:** create name="bolts" (also try "BOLTS") under P.
- **Expected:** **422**, message `"Sub-Category already exists under this Category."` No row created.
- **Validations:**

| # | Field / check | Assertion | Expected |
|---|---|---|---|
| 1 | HTTP status | rejects | 422 |
| 2 | `error.message` | names the duplicate | contains "already exists" |
| 3 | side effect | no new category persisted | count unchanged |

- **Priority:** P0 · **Runnable:** yes

#### BE-CAT-003 — surrounding whitespace is trimmed and still collides
- **Precondition:** gate ON; sibling "Bolts" exists.
- **Steps:** create name="  Bolts  " under P.
- **Expected:** **422** (duplicate). Separately, when a *new* trimmed name is accepted, it is stored trimmed (no leading/trailing spaces).
- **Priority:** P1 · **Runnable:** yes

#### BE-CAT-004 — exact duplicate at root vs sub level gives the right message
- **Precondition:** gate ON; a root category "Fasteners" exists, and a sub "Bolts" under P exists.
- **Steps:** (a) create root "Fasteners"; (b) create sub "Bolts" under P.
- **Expected:** (a) 422 `"Category already exists."`; (b) 422 `"Sub-Category already exists under this Category."`.
- **Priority:** P1 · **Runnable:** yes

#### BE-CAT-005 — rename / reparent into an existing name is rejected (not create-only)
- **Precondition:** gate ON; "Nuts" and "Bolts" both under P.
- **Steps:** `PATCH /product_categories/edit` rename "Nuts" → "Bolts" (and separately, reparent another "Bolts" under P).
- **Expected:** 422 duplicate. But an unrelated-field edit of a legacy duplicate row still succeeds.
- **Priority:** P0 · **Runnable:** yes

#### BE-CAT-006 — gate OFF keeps legacy behavior; integrations path reuses, never errors
- **Precondition:** two variants — (a) gate OFF; (b) gate ON via the integrations/PR-worker path.
- **Steps:** (a) create duplicate "Bolts" under P with the config off; (b) push a PR line that resolves category "Bolts" when it already exists.
- **Expected:** (a) duplicate is **accepted** (old behavior); (b) the worker **reuses** the existing node (lowest id), backfills a blank `category_code`, and does **not** raise — but a genuinely invalid node still surfaces a `RecordInvalid` on `category_id`.
- **Priority:** P0 (backward-compat + integration idempotency) · **Runnable:** partial (integration path needs the PR worker)

---

# BE-QTY · Hide requested quantity from sellers (#16001)

**What changed.** When a company (or an event's template) has the quantity kill-switch on, **seller-facing** responses suppress the requested quantity: the line-items list nulls `quantity`/`quantity_open`, the submission sheet hides the `creator_quantity` widget and blanks its value, and the payload flags `disable_quantity_widgets` so the UI hides the column. Buyers still see quantities.

- **Endpoint:** `GET /event_groups/:id/get_line_items` (`config/routes.rb:679`; `Api::EventGroupsController#get_line_items` `:466`), via `EventGroupLineItemSerializer`. Submission sheet via `TradeTemplateHelper`.
- **Gate:** `disable_quantity_widgets_for_event_group?(event_group) && Current.user.is_seller?` (`event_groups_controller.rb:495`). Company `CustomConfiguration disable_quantity_widgets`, **or** any active (not cancelled/withdrawn) trade-request template with `disable_quantity_widgets_template`.
- **Response:** `line_items[].quantity` → null, `line_items[].quantity_open` → null (`event_group_line_item_serializer.rb:31,108`); top-level `disable_quantity_widgets: true`. Sheet: `creator_quantity` added to `participants_widgets_to_hide` (`trade_template_helper.rb:365`); `data_dict["creator_quantity"].value` → nil unless an allowed/creator company (`:774`).

#### BE-QTY-001 — default (no config): sellers see quantities
- **Precondition:** no `disable_quantity_widgets` config, no template flag; view as a **seller** (invited vendor).
- **Steps:** `GET /event_groups/:id/get_line_items`.
- **Expected:** 200; each `line_items[].quantity` and `quantity_open` carry real values; `disable_quantity_widgets: false`.
- **Validations:**

| # | Field / check | Assertion | Expected |
|---|---|---|---|
| 1 | HTTP status | responds 200 | 200 |
| 2 | `line_items[0].quantity` | present, numeric | a number |
| 3 | `disable_quantity_widgets` | flag off by default | `false` |

- **Priority:** P1 · **Runnable:** partial (needs a seller identity + an event)

#### BE-QTY-002 — company config ON: seller's quantity is nulled and flagged
- **Precondition:** company `CustomConfiguration disable_quantity_widgets` on; view as **seller**.
- **Steps:** `GET .../get_line_items`.
- **Expected:** 200; `line_items[].quantity` = **null**, `quantity_open` = **null**; `disable_quantity_widgets: true`.
- **Validations:**

| # | Field / check | Assertion | Expected |
|---|---|---|---|
| 1 | `line_items[0].quantity` | nulled for seller | `null` |
| 2 | `line_items[0].quantity_open` | nulled for seller | `null` |
| 3 | `disable_quantity_widgets` | flag on | `true` |

- **Priority:** P0 · **Runnable:** partial

#### BE-QTY-003 — template config ON (separate OR branch)
- **Precondition:** company config off, but one **active** trade-request template has `disable_quantity_widgets_template`; view as seller.
- **Steps:** `GET .../get_line_items`.
- **Expected:** quantities nulled; flag true. (Regression: the template path is a distinct branch from the company config.)
- **Priority:** P1 · **Runnable:** partial

#### BE-QTY-004 — buyer still sees quantities with config ON
- **Precondition:** config on; view as **buyer** (non-seller).
- **Steps:** `GET .../get_line_items`; open the submission sheet.
- **Expected:** quantities **present** (the gate ANDs `is_seller?`); `creator_quantity.value` still populated for the allowed company.
- **Priority:** P0 (role asymmetry) · **Runnable:** partial

#### BE-QTY-005 — cancelled template only does not trigger hiding
- **Precondition:** company config off; the template flag lives only on a **cancelled/withdrawn** trade-request.
- **Steps:** `GET .../get_line_items` as seller.
- **Expected:** quantities present (the gate filters to not-cancelled/withdrawn templates).
- **Priority:** P2 · **Runnable:** partial

#### BE-QTY-006 — submission sheet hides the creator_quantity widget
- **Precondition:** config on; seller renders the bid/submission sheet.
- **Steps:** load the sheet form response.
- **Expected:** `creator_quantity` is in the hidden-widgets list and its `value` is nil.
- **Priority:** P1 · **Runnable:** no (UI/sheet render)

---

# BE-USR · Recover-user API for Super Admins (#15591)

**What changed.** A new endpoint **undeletes** a soft-removed user, restoring the exact team memberships and extended fields captured at removal time (a new `removal_snapshot` JSONB written by `remove_user`), re-checking license seats. Restricted to Super Admins / Procol employees. Both remove and recover gained a cross-company `client_company_id` guarded by `Current.allowed_companies`.

- **Endpoint:** `POST /users/recover/:id` → `users#recover_user` (`config/routes.rb:103`).
- **Request:** `id` (path, required); `client_company_id` (body, optional; must be in `Current.allowed_companies`; defaults to `Current.workspace.id`).
- **Gate:** Pundit `UserCompanyMappingPolicy#recover_user?` — `allowed_companies.include?(record.company_id)` AND (`is_super_admin` OR `is_procol_employee?`).
- **Errors:** 455 not authorized · 764 already active · 70 user does not exist · 714 cannot recover a Procol employee · 713 cannot recover a Super Admin (unless caller is a Procol employee) · 761/762 license limit exceeded.

#### BE-USR-001 — Super Admin recovers a soft-deleted user
- **Precondition:** caller is Super Admin; target user has an `in_active` mapping with a `removal_snapshot`; seats available.
- **Steps:** `POST /users/recover/:id`.
- **Expected:** 200; the mapping becomes active; `removal_snapshot` cleared; the snapshot's team members and extended fields are reactivated.
- **Validations:**

| # | Field / check | Assertion | Expected |
|---|---|---|---|
| 1 | HTTP status | success | 200 |
| 2 | mapping status | user active again | `active` |
| 3 | team memberships | restored from snapshot | present |

- **Priority:** P0 · **Runnable:** partial (needs a super-admin identity + a removed user)

#### BE-USR-002 — a non-admin caller is denied
- **Precondition:** caller is a normal buyer (not super admin, not Procol employee).
- **Steps:** `POST /users/recover/:id`.
- **Expected:** authorization denied (Pundit `recover_user?` false). No recovery.
- **Priority:** P0 (this is the whole point of the feature) · **Runnable:** yes (negative — safe)

#### BE-USR-003 — recovering an already-active user
- **Precondition:** the user is already active in the company.
- **Steps:** `POST /users/recover/:id`.
- **Expected:** error **764** "User is already active in this company".
- **Priority:** P1 · **Runnable:** yes

#### BE-USR-004 — unknown / never-removed user
- **Precondition:** no `in_active` mapping for the user, or the user is not active.
- **Steps:** `POST /users/recover/:id`.
- **Expected:** error **70** "User does not exist".
- **Priority:** P2 · **Runnable:** yes

#### BE-USR-005 — recovering into a company outside the caller's allowed set
- **Precondition:** `client_company_id` is a company not in `Current.allowed_companies`.
- **Steps:** `POST /users/recover/:id` with that `client_company_id`.
- **Expected:** error **455** not authorized. (This is a privilege-escalation guard — worth an explicit negative.)
- **Priority:** P0 · **Runnable:** yes

#### BE-USR-006 — license seats full
- **Precondition:** target company has licensing on and `licensing_limit <= used_license_count`.
- **Steps:** `POST /users/recover/:id`.
- **Expected:** error **761** (sourcing) or **762** (non-sourcing); no reactivation. (Seat check is against the **target** company, not the caller's workspace.)
- **Priority:** P1 · **Runnable:** partial

---

# BE-REG · Self-registration auto-onboarding behind a per-company switch (#15944)

**What changed.** Public vendor self-registration used to always auto-create an onboarding form. Now a per-buyer-company switch controls it; when off, the self-registered vendor is left in **Invited** status for manual onboarding. The OTP-verify response also surfaces the switch state.

- **Endpoints:** `POST /become_vendor/verify_otp` (`config/routes.rb:26`) now returns `features.auto_onboarding_enabled` (bool); `POST /become_vendor/submit` (`:27`) gates `trigger_auto_vendor_onboarding` with `return unless auto_onboarding_enabled?(buyer_company)` (`vendor_registrations_controller.rb:334`).
- **Gate:** company `CustomConfiguration auto_onboarding_for_self_registered_vendors` (switch, **default true**, invisible). Only an explicit `false` disables; a blank company is treated as enabled.

#### BE-REG-001 — default (unset) surfaces enabled
- **Precondition:** buyer company has no config row.
- **Steps:** `POST /become_vendor/verify_otp`.
- **Expected:** 200; `features.auto_onboarding_enabled: true`.
- **Validations:**

| # | Field / check | Assertion | Expected |
|---|---|---|---|
| 1 | HTTP status | success | 200 |
| 2 | `features.auto_onboarding_enabled` | default on | `true` |

- **Priority:** P1 · **Runnable:** partial (public flow, OTP)

#### BE-REG-002 — switch OFF surfaces disabled
- **Precondition:** config `auto_onboarding_for_self_registered_vendors` = false.
- **Steps:** `POST /become_vendor/verify_otp`.
- **Expected:** 200; `features.auto_onboarding_enabled: false`.
- **Priority:** P1 · **Runnable:** partial

#### BE-REG-003 — switch OFF suppresses the onboarding form
- **Precondition:** config false; a vendor self-registers.
- **Steps:** `POST /become_vendor/submit`.
- **Expected:** 200; **no** onboarding form created; the vendor is left in **Invited** status.
- **Priority:** P0 · **Runnable:** partial

#### BE-REG-004 — switch ON keeps auto-onboarding (regression)
- **Precondition:** config true (or unset); valid `onboarding_template_id`.
- **Steps:** `POST /become_vendor/submit`.
- **Expected:** onboarding form auto-created as before.
- **Priority:** P0 · **Runnable:** partial

#### BE-REG-005 — switch ON, missing template
- **Precondition:** config on; blank/invalid `onboarding_template_id`.
- **Steps:** `POST /become_vendor/submit`.
- **Expected:** error **839** "Onboarding Template not found" (only reachable when the gate is on).
- **Priority:** P2 · **Runnable:** partial

---

# BE-LOA · `loa: null` when no LOA template is configured (#16003)

**What changed.** The allocation-summary response no longer builds a Letter of Award per vendor when the buyer has **no active LOA template** — unless an LOA was already generated for that vendor (a template deactivated after generation still shows the entry).

- **Endpoint:** `GET /proposal/:id` → `Api::ProposalController#show` (`config/routes.rb:342`) → allocation-summary v0/v1 builders in `Api::ProposalHelper`.
- **Rule:** `loa_template_configured = Reports::LoaService.template_for(company_id).present?` (`proposal_helper.rb:711,747`); `show_loa_entry = template_configured || loa_ever_generated`; `return nil unless show_loa_entry` (`:758`).
- **Field path:** `allocation_summary_data[<vendor_uuid>].loa`.

#### BE-LOA-001 — no template, never generated → null, service skipped
- **Precondition:** company has no active LOA `ReportTemplate`; no prior LOA for the vendor.
- **Steps:** `GET /proposal/:id`.
- **Expected:** 200; `allocation_summary_data[vendor].loa` = **null**; `LoaService.allocation_summary_entry` is not called (also a small perf win).
- **Validations:**

| # | Field / check | Assertion | Expected |
|---|---|---|---|
| 1 | HTTP status | success | 200 |
| 2 | `allocation_summary_data[v].loa` | nulled when no template | `null` |

- **Priority:** P1 · **Runnable:** partial (needs an awarded proposal)

#### BE-LOA-002 — template configured → populated
- **Precondition:** an active LOA template exists for the company.
- **Steps:** `GET /proposal/:id`.
- **Expected:** `loa` is the populated LOA entry object.
- **Priority:** P1 · **Runnable:** partial

#### BE-LOA-003 — template deactivated after an LOA was generated → still shown
- **Precondition:** no active template now, but `loa_data_for_vendor` exists.
- **Steps:** `GET /proposal/:id`.
- **Expected:** `loa` populated (the OR branch — deactivation must not erase an existing LOA).
- **Priority:** P1 · **Runnable:** no (data setup)

#### BE-LOA-004 — mixed vendors in one payload
- **Precondition:** no template; vendor A has a prior LOA, vendor B does not.
- **Steps:** `GET /proposal/:id`.
- **Expected:** `loa` populated for A, `null` for B in the same response (per-vendor evaluation).
- **Priority:** P2 · **Runnable:** no

---

# BE-VER · Event-group versioning / amendment fixes (#various)

**How versioning works (for setup).** Amending a **running** event clones the whole `EventGroup` into a new `draft` version rather than editing the live one. The trigger is a **PR amendment**: a mapped PR item is edited/re-pushed → the item is put on hold (schedules force-closed) → `PurchaseRequests::AmendmentService#execute` decides `versioning_required` (items added, or a change carrying the `"event_version"` type) → `EventGroup#create_version` → `Versions::EventGroup#replicate` deep-dups the group, line items and stages. **Rule of thumb: structure/config inherits; live-run state resets.** These six fixes each move one attribute to the correct side of that line. None shipped with RSpec coverage — they are untested regressions worth authoring.

#### BE-VER-001 — a new version keeps the configured bidding window, not the collapsed one (#23249ea497)
- **Precondition:** a live RFQ with a 3-day window; put its PR item on hold, then amend to trigger a new version.
- **Steps:** amend the event; open the new draft version's stage schedule.
- **Expected:** the new stage's window ends **~3 days after publish** (restored from `meta_data["configured_duration"]`), not near-instantly. Multi-stage events restore each stage's own duration.
- **Bug it guards:** the hold worker had force-closed the old schedule to ~0 span, and the new version inherited that near-zero window.
- **Priority:** P0 · **Runnable:** no (amendment flow)

#### BE-VER-002 — the old version leaves evaluation when a new one is published (#35594426c6)
- **Precondition:** an RFP event with an `event_version` change.
- **Steps:** amend with versioning; check the previous version's state.
- **Expected:** the old RFP/commercial extra-closing schedule ends **now**; the old version is **not** in evaluation. An amend **without** versioning still gets the full evaluation duration (unchanged).
- **Priority:** P0 · **Runnable:** no

#### BE-VER-003 — stale evaluation scores don't carry into the new version (#aa0d302047)
- **Precondition:** score line items on v1, then amend to create v2.
- **Steps:** open v2's line items.
- **Expected:** v2 shows **no** scores/remarks — `has_evaluations`, `evaluation_score`, `evaluation_remark` are stripped from `precomputed_data` (top-level **and** nested per-vendor). Other precomputed keys (e.g. pricing) survive.
- **Priority:** P0 · **Runnable:** no

#### BE-VER-004 — the quotation-template cache is dropped on versioning (#317488abbc)
- **Precondition:** v1 has cached `meta_data["quotation_templates"]`; amend to v2.
- **Steps:** open v2 and load quotation templates.
- **Expected:** v2 has **no** inherited `quotation_templates` key; templates recompute fresh. Other `meta_data` keys survive.
- **Priority:** P1 · **Runnable:** no

#### BE-VER-005 — a service scope-of-work change forces a new version (#93d3652bb4)
- **Precondition:** a live **service** event.
- **Steps:** amend it changing only the scope-of-work text (`itemText`).
- **Expected:** a `service_itemText` change is detected → promoted to `event_version` → a **new version** is created. Changing only `shortText`/`quantity` still versions as before; an identical re-push, or a whitespace-only `itemText` change, creates **no** version.
- **Bug it guards:** `itemText` used to be ignored, so scope changes silently edited in place.
- **Priority:** P0 · **Runnable:** no

#### BE-VER-006 — the auction/buying team keeps project access after an amendment (#261106c632)
- **Precondition:** give the auction team access on a v1 **commercial** (RFQ/auction) stage; amend to v2.
- **Steps:** open v2 as a member of that team.
- **Expected:** the team still has access on v2. (Access-list replication now runs for **all** stage types, not just RFP.) RFP form-level evaluator access is still replicated too.
- **Bug it guards:** commercial-stage access lists weren't replicated, so the team lost access after an amendment.
- **Priority:** P0 · **Runnable:** no

---

# BE-EML · Super Admin can edit another user's email & phone (#15600)

**What changed.** Previously only Procol employees could change another user's phone or verified email. Now a company **Super Admin** can too — but only when a per-company switch is on **and** they're editing *someone else* (self-edit stays blocked). Uniqueness and format are still validated afterward, and the target's active sessions are invalidated on an email change.

- **Endpoint:** `PATCH /users` → `users#update` (`config/routes.rb:98`); gate at `users_controller.rb:102`.
- **Rule (`users_controller_helper.rb`):** `super_admin_contact_edit = is_super_admin && user != Current.user && CustomConfiguration(config_key: "super_admin_edit_user_contact_enabled") == true`. If false: a phone change → **487**, a verified-email change → **551**. Email compare is case-insensitive. `add_email` mirrors the gate, sets the new email verified, and invalidates the target's non-MCP sessions.
- **Still validated after the gate (`UserValidator`):** format **393**, uniqueness **541** (only if the target isn't already verified), phone invalid **3**, phone taken **310**, pending on another account **550**.
- **Gate:** company switch `super_admin_edit_user_contact_enabled` (**default OFF**); role `is_super_admin`; scope `Current.workspace`.

#### BE-EML-001 — Super Admin edits another user's verified email, switch ON
- **Precondition:** caller is Super Admin; target ≠ caller; config on.
- **Steps:** `PATCH /users` id=target, email="new@example.com".
- **Expected:** accepted; the email changes and is marked verified; the target's active sessions are invalidated.
- **Priority:** P0 · **Runnable:** partial (needs a super-admin identity + config)

#### BE-EML-002 — same edit with the switch OFF is blocked
- **Precondition:** caller Super Admin; target ≠ caller; config off (the shipping default).
- **Steps:** `PATCH /users` id=target, phone="+91/9999999999".
- **Expected:** **487** "You are not allowed to change the phone number." (and **551** for a verified-email change).
- **Priority:** P0 · **Runnable:** yes (negative)

#### BE-EML-003 — a Super Admin still cannot edit *their own* verified email
- **Precondition:** caller Super Admin editing self; config on.
- **Steps:** `PATCH /users` id=self, email="new@…".
- **Expected:** **551** — the `user != Current.user` guard holds even with the feature on.
- **Priority:** P0 · **Runnable:** yes

#### BE-EML-004 — a non-super-admin can't edit contacts even with the switch on
- **Precondition:** caller is an ordinary member; target ≠ caller; config on.
- **Steps:** `PATCH /users` id=target, phone="…".
- **Expected:** **487** — the config must not grant the ability to non-super-admins.
- **Priority:** P0 · **Runnable:** yes

#### BE-EML-005 — the permission does not bypass format/uniqueness
- **Precondition:** caller Super Admin; config on.
- **Steps:** (a) email="not-an-email"; (b) set an unverified target's email to one already used by an active verified account.
- **Expected:** (a) **393** invalid format; (b) **541** already taken (or **550** if pending). Permission ≠ skipping validation.
- **Priority:** P1 · **Runnable:** yes

---

# BE-VND · `restricted_vendor_email_address` — PAN ↔ email-domain allow-list (#15974)

**What changed.** A per-company allow-list binds a vendor's **PAN** (tax id) to specific POC **email domains**. On a vendor / broker / vendor-member invite (and on subsidiary creation), if either the PAN or the email domain appears in the company's config, the invite is rejected **unless that exact PAN is listed under that exact domain**. Case-insensitive, `@`-prefix and whitespace tolerant.

- **Trigger (no new route):** `POST /send_invite` → `Invitation::SendService#validate` (+ V3); `POST /create_subsidiary` → `VPCNetwork::SubsidiaryService#create_subsidiary`. Both call the new `Validations::PanEmailDomainService.validate`.
- **Request fields:** `email` (required; domain via `Utils.get_domain_from_email`), `pan_no` (for `vendor_member_invite`, read from the invited `Company.pan_no`), `invite_type` (`vendor_invite`/`broker_invite`/`vendor_member_invite`; other types skip; a **blank** type does *not* skip → subsidiary runs it), `company_id`.
- **Rule (`pan_email_domain_service.rb`):** skip when workspace/rules blank, or PAN/domain blank, or neither PAN nor domain is in config. Allow if `pans_for_domain.include?(pan)`. Else reject `{code: 1138}`. `rules = { domain => [PAN,…] }`; domains normalized `strip.downcase.delete_prefix("@")`, PANs `strip.upcase`.
- **Gate:** company config `restricted_pan_email_domains` (invisible text, **default `{}` = OFF**).
- **Rejection:** code **1138** "This PAN cannot be registered with this email address" → HTTP **422** (no exception; error hash merged).

#### BE-VND-001 — PAN invited from its mapped domain
- **Precondition:** config `{ "acme.com": ["ABCDE1234F"] }`.
- **Steps:** `POST /send_invite` invite_type="vendor_invite", email="poc@acme.com", pan_no="ABCDE1234F".
- **Expected:** accepted.
- **Priority:** P1 · **Runnable:** partial (needs the config)

#### BE-VND-002 — listed domain, wrong PAN → rejected
- **Precondition:** same config.
- **Steps:** email="poc@acme.com", pan_no="ZZZZZ9999Z".
- **Expected:** **1138 / 422** — the domain is gated to its whitelisted PANs.
- **Priority:** P0 · **Runnable:** partial

#### BE-VND-003 — listed PAN invited from a different domain → rejected
- **Precondition:** config maps the PAN to acme.com.
- **Steps:** email="poc@gmail.com", pan_no="ABCDE1234F".
- **Expected:** **1138 / 422** — a bound PAN can't slip in via another domain.
- **Priority:** P0 · **Runnable:** partial

#### BE-VND-004 — neither PAN nor domain in config → accepted
- **Precondition:** config `{ "acme.com": [...] }`.
- **Steps:** email="poc@other.com", pan_no="NEWPA1111N".
- **Expected:** accepted — unrestricted vendors must pass freely.
- **Priority:** P1 · **Runnable:** partial

#### BE-VND-005 — case / `@` / whitespace variance still matches
- **Precondition:** config `{ "@Acme.com": [" abcde1234f "] }`.
- **Steps:** email="POC@ACME.COM", pan_no="abcde1234f".
- **Expected:** accepted — normalization must be robust.
- **Priority:** P2 · **Runnable:** partial

#### BE-VND-006 — out-of-scope invite type / empty config is skipped
- **Precondition:** either invite_type="buyer_share_invite", or config `{}`.
- **Steps:** send the invite.
- **Expected:** accepted (validation skipped) — the type filter and default-off must not over-block.
- **Priority:** P1 · **Runnable:** partial

---

# BE-AUC · Auction & counter-offer fixes (#various)

A cluster of Dutch-auction / counter-offer fixes. Recurring gates: `is_dutch_auction?` = `auction_config == 'dutch'`; `is_auction?` = rfx_mode `auction` **or** `rfq_then_auction`; `rfx_project_enabled?` = `config["rfx_project_enabled"]`; `in_submission_time?` = `bid_start ≤ now ≤ bid_end`. None ship with RSpec — behavior-derived.

#### BE-AUC-001 — Dutch participation report excludes post-close bids (#0326777665)
- **Precondition:** a Dutch / `rfq_then_auction` event where a vendor's only bid is the carried-over `rfq_final_bid` with `placed_at` **after** `bid_end_time`.
- **Steps:** generate the auction participation report.
- **Expected:** that vendor is **not** shown as "Bid Placed". A vendor who bid before (or exactly at) `bid_end_time` **is** shown. (Fix adds `placed_at <= bid_end_time`.)
- **Priority:** P0 · **Runnable:** no (report generation)

#### BE-AUC-002 — Rank indicator appears for Dutch under rfx-project (#a53fb7f22b)
- **Precondition:** a Dutch event with `rfx_project_enabled = true`.
- **Steps:** `GET /api/event_indicators` for the event.
- **Expected:** the indicators include `rank` (exactly once). A Dutch event **without** the flag, and RFI/RFP, return no `rank`.
- **Priority:** P1 · **Runnable:** partial

#### BE-AUC-003 — an RFQ→Dutch conversion doesn't self-end the auction (#ae6bef68ce)
- **Precondition:** convert a fast-bidding RFQ to a Dutch auction; the RFQ final bids carry over as `rfq_final_bid`.
- **Steps:** complete the conversion; observe the new auction.
- **Expected:** the auction **stays live** (the auto-close callback now skips `rfq_final_bid` bids). A genuine round acceptance still ends the auction.
- **Priority:** P0 · **Runnable:** no

#### BE-AUC-004 — ending a Dutch auction is decoupled from the bid API (#2226176548)
- **Precondition:** a live Dutch rfx auction; a vendor accepts the current round via `PATCH /api/bids/revise_bid/:id`.
- **Steps:** place the accepting bid; inspect timing.
- **Expected:** the API returns success and the auction ends via the post-commit callback / scheduler (not inline). Knockout acceptance is unaffected (still adds the next round, doesn't end).
- **Priority:** P1 · **Runnable:** no

#### BE-AUC-005 — counter-offer emails go only to active vendor users (#513d1a7b73)
- **Precondition:** a vendor company with one active user and one deactivated user (or an inactive user-company mapping); `send_mail_to_vendors` on.
- **Steps:** raise a counter offer to that vendor; trigger the reminder.
- **Expected:** only the **active** user receives the counter-offer mail and reminder; the deactivated user/inactive mapping gets nothing; a user mapped twice receives it once.
- **Priority:** P1 · **Runnable:** no (mailer)

#### BE-AUC-006 — a pending counter offer marks the PR line item "in progress" (#3867edde17)
- **Precondition:** an event (rfq / auction / rfq_then_auction) with a bid that has a pending counter offer, linked to a PR line item.
- **Steps:** let `EventGroupUpdateWorker` run.
- **Expected:** the linked PR line item shows **in_progress** (was wrongly `active`). No counter offer → normal status; a `completed` sibling isn't downgraded.
- **Priority:** P1 · **Runnable:** no (worker)

#### BE-AUC-007 — pending "Submit Bid" task shows title + icon for rfq_then_auction (#d80284afda)
- **Precondition:** a published `rfq_then_auction` event with a pending submission task.
- **Steps:** fetch the pending-tasks list.
- **Expected:** the task reads **"Submit Auction Bid"** with the hammer icon (was blank "Submit  Bid"). Pure auction / RFQ / RFP tasks keep their own correct titles.
- **Priority:** P2 · **Runnable:** partial

---

# BE-PR · PR, intake & hold/unhold (#various)

Changes on the purchase-request side — the flow that feeds PR → Event. Two new **config-gated** capabilities (PR audit trail, intake header approval conditions, PR-assignee in email) and a run of hold/unhold + versioning-mapping fixes.

#### BE-PR-001 — intake approval can key off a page-level (header) question (#2d0045ff00)
- **Precondition:** an intake template with a page-level `price` header used as an approval condition, exceeding a threshold.
- **Steps:** submit the intake; fetch `GET /api/intake_requests/:id/approval_flows`.
- **Expected:** the flow matches on the header value; a dropdown answer resolves to its **option label** (e.g. stored `{option_key:"fresh", value:"Fresh"}` → `"Fresh"`); a `multi_select` with >1 value is omitted; conditions display as `"<name> - <Template>"`.
- **Priority:** P1 · **Runnable:** partial

#### BE-PR-002 — creating an intake template doesn't duplicate an existing approval condition (#2d0045ff00)
- **Precondition:** the company already has an active condition `total_cost`.
- **Steps:** create another intake template that also exposes `total_cost`.
- **Expected:** no duplicate condition, no 500 — the existing one is reused (dedupe by `key_attribute`, uniqueness `[company_id, status]`).
- **Priority:** P1 · **Runnable:** partial

#### BE-PR-003 — PR audit trail records each mutation, gated by config (#7a10bd178b)
- **Precondition:** company config `is_pr_audit_trail_available` **on**.
- **Steps:** assign PR items to a user; then `GET /api/activity_logs?item_type=purchase_request&item_id=<pr>`.
- **Expected:** an `assigned` card appears; a reassign produces a `reassigned` card with `assignee_from`/`assignee_to`.
- **Validations:**

| # | Field / check | Assertion | Expected |
|---|---|---|---|
| 1 | HTTP status | success | 200 |
| 2 | latest card `pri_event_type` | records the action | `assigned` |
| 3 | audit write | never fails the PR op | assign still 200 even if logging errors |

- **Priority:** P1 · **Runnable:** partial (needs config + a PR)

#### BE-PR-004 — audit trail is denied without the gate / cross-tenant / on a deleted PR (#7a10bd178b)
- **Precondition:** (a) `is_pr_audit_trail_available` off; (b) a user whose `allowed_companies` excludes the PR's company; (c) a deleted PR.
- **Steps:** `GET /api/activity_logs` and `GET /api/activity_logs/download` for each.
- **Expected:** **101** not allowed in all three; download with `item_type=purchase_request_item` → **2** (bad request). No report generated.
- **Priority:** P0 (permission + tenant isolation) · **Runnable:** yes (negative)

#### BE-PR-005 — an unsaved draft event group no longer blocks a PR-item hold (#28c8b25332)
- **Precondition:** a PR item linked only to a **draft** event group with `saved_count = 0`; PR amendment enabled; item in progress.
- **Steps:** `PATCH /api/purchase_requests/change_hold_status_for_item` status=hold.
- **Expected:** the hold **succeeds** (no 590/591). A draft EG with a saved project, or a live EG, still blocks (590), and multiple real EGs → 591; a selected proposal still → 589.
- **Priority:** P1 · **Runnable:** partial

#### BE-PR-006 — quantity-update worker skips inactive/deleted PR items (#793c7d81ca)
- **Precondition:** a PR item with status `deleted` (and separately `in_active`).
- **Steps:** run `UpdateInProgressQuantityWorker` for it.
- **Expected:** the worker returns without touching status/quantity (it used to resurrect a deleted item to `active`). An active BOQ item still recomputes normally.
- **Priority:** P1 · **Runnable:** no (worker)

#### BE-PR-007 — draft proposals inactivated by hold are restored on unhold (#1d31b83b1e)
- **Precondition:** an event group with a draft proposal.
- **Steps:** put the PR item on hold, then unhold it.
- **Expected:** on hold the draft goes `in_active` with `meta_data.in_active_by_pr_hold = true`; on unhold it returns to **draft** and the flag is cleared. A draft made inactive by other means (no flag) is left untouched; a second unhold is idempotent.
- **Priority:** P1 · **Runnable:** no

#### BE-PR-008 — after an amendment, the previous version keeps its original PR text (#39aa6a0089)
- **Precondition:** an event with a prior version; amend a PR item's text.
- **Steps:** create the new version; open both versions.
- **Expected:** the new version's line item carries the active PR mapping (re-pointed via `old_egli_id`); the **previous** version shows the **original** text, not the amended one. Duplicate live mappings are retired to `in_active`; deleted PR items aren't moved.
- **Priority:** P0 · **Runnable:** no

#### BE-PR-009 — reopening a stale/deleted PR line item is rejected (#7bf572abe7)
- **Precondition:** a PR item that is `deleted` (and separately `in_active`).
- **Steps:** `PATCH .../change_hold_status_for_item` status=active.
- **Expected:** **593** "This line item no longer exists. Please refresh and try again." (HTTP 422). A valid item reopens; an item with in-progress qty > 0 gives **592** (correct precedence); `block_pr_unhold` on → **101**.
- **Priority:** P1 · **Runnable:** partial

#### BE-PR-010 — PR assignment email shows "Assigned To" only when configured (#a42c915082)
- **Precondition:** company config `show_pr_assignee` on; items assigned to users.
- **Steps:** trigger the PR-assignment email.
- **Expected:** the email has an "Assigned To" column with each assignee's display name ("-" when none); with the config off the column is absent (unchanged layout).
- **Priority:** P2 · **Runnable:** no (mailer)

---

# BE-BOQ · "BOQ 1000 line items" — a performance rework, not a limit bump (#15339)

**What it actually changed (correction).** This PR does **not** raise the line-item cap in code. It rewrites the event/stage creation path to insert BOQ line items in **bulk** (`TradeProduct.import`, batched EGLI + PR mappings, N+1 removal in the bid/form/report paths) so an event can hold ~1000 line items without timing out. The BOQ ceiling is still the per-company config `allowed_maximum_line_items` (default `{ boq: 500, non_boq: 65 }`, from an older migration), it's **enforced client-side** (surfaced via `users_controller#…` config, no server-side reject), and reaching 1000 means overriding that config for the company. The one genuinely new number is a **report-download** threshold `MAX_LINE_ITEMS_FOR_REPORT_DOWNLOAD = 150` that routes large reports to async email.

> This corrects our own note that said the ceiling is "500" — that's the *default config value* (still true), but it's config-driven and enforced in the UI, not a hard backend limit; 1000 is now performant.

- **Endpoints:** `POST /api/event_groups` → `EventGroupsController#create` (BOQ gated by `boq_in_erfx_allowed?`); the bulk trade-product path in `TradeController#create` (no REST route at this commit — driven by the event/stage flow); `POST /api/download_report`.

#### BE-BOQ-001 — a mid-size BOQ imports every line item
- **Precondition:** `boq_in_erfx_allowed?` on; create an event with **250** BOQ line items.
- **Steps:** submit the event/stage.
- **Expected:** accepted; all 250 `trade_products` are bulk-inserted and their EGLI/PR mappings created — none silently dropped.
- **Priority:** P0 · **Runnable:** partial (sandbox BOQ event)

#### BE-BOQ-002 — the configured cap and a raised cap both hold end-to-end
- **Precondition:** (a) default config (BOQ 500); (b) config `allowed_maximum_line_items.boq = 1000`.
- **Steps:** create with (a) 500 and (b) 1000 line items.
- **Expected:** both accepted in a single transaction without timeout (this is the PR's whole point). Note the cap is client-enforced; the backend does not reject "> limit".
- **Priority:** P1 · **Runnable:** partial

#### BE-BOQ-003 — an invalid line item rolls the whole batch back
- **Precondition:** 300 line items, one with a bad `product_id`/quantity.
- **Steps:** submit.
- **Expected:** **422**, code **15** "Operation failed", and a **full rollback** — nothing persisted (the import runs `validate: true, raise_error: true` inside a transaction). No half-created event.
- **Validations:**

| # | Field / check | Assertion | Expected |
|---|---|---|---|
| 1 | HTTP status | rejects | 422 |
| 2 | `error.code` | operation failed | 15 |
| 3 | side effect | nothing persisted | event + all line items rolled back |

- **Priority:** P0 · **Runnable:** partial

#### BE-BOQ-004 — BOQ creation is blocked when the feature is off
- **Precondition:** `boq_in_erfx_allowed?` = false.
- **Steps:** attempt a BOQ create.
- **Expected:** **101** "You are not allowed to perform this action" (422), before any writes.
- **Priority:** P1 · **Runnable:** yes (negative)

#### BE-BOQ-005 — large report downloads switch to email at 150 line items
- **Precondition:** threshold `MAX_LINE_ITEMS_FOR_REPORT_DOWNLOAD` = 150.
- **Steps:** `POST /api/download_report` for an event with **151** active line items, and separately with **150**.
- **Expected:** 151 → HTTP 200 "You will receive the report in your email shortly" (async draft `Report` + delivery worker, with a 10-min dedup); 150 → a synchronous signed URL.
- **Priority:** P1 · **Runnable:** partial

---

# BE-VNR · Vendor, reports & multi-tenant (#various)

Vendor-side validations, new reports/views, a mailer switch, and a **multi-tenant security fix**.

#### BE-VNR-001 — unique invoice number per vendor + financial year (#c2405d07a0)
- **What it is.** A Flexi automation action `validate_unique_document_number` blocks saving a record whose document number already exists for the **same vendor** in the **same financial year** (same datasource ⇒ per-buyer). Comparison is whitespace-**trimmed** but **case-sensitive**; FY is taken from the record's `created_at` (default anchor 1 April). It **fails open** (allows the save) if a field key is unresolved or a value is blank.
- **Trigger:** `POST /api/fx_automations/trigger_automation` (not a REST invoice endpoint). Params on the action: `document_number_field`, `vendor_field` (both required), `financial_year_start_month/day`, `error_title/message`.
- **Precondition:** an automation configured with this action; an active record already carries `INV-001` for vendor V this FY.
- **Steps:** trigger the automation on a new record.
- **Expected & validations:**

| # | scenario | input | expected |
|---|---|---|---|
| 1 | exact duplicate | `INV-001`, vendor V, same FY | **422** code 15 — "already exists for this vendor in the financial year starting <DD Mon YYYY>" |
| 2 | FY rollover | one created 2026-03-31, new created 2026-04-01, same number/vendor | **accept** (different FY) |
| 3 | trim vs case | `" INV-001 "` vs `"inv-001"` | `" INV-001 "` → reject; `"inv-001"` → **accept** (case-sensitive) |
| 4 | different vendor | same number, vendor W | **accept** (vendor is part of the key) |
| 5 | misconfig / blank | wrong `document_number_field`, or blank value | **accept** — fails open (warning logged) |

- **Priority:** P0 · **Runnable:** partial (needs a configured Flexi automation)

#### BE-VNR-002 — SCIM de-provisioning & attributes are scoped to the requesting tenant (#846c64886a)
- **What it is (security).** Users are global, shared across tenants via user-company mappings. A SCIM call from tenant B used to be able to de-provision the user in their **home** company (possibly tenant A) and overwrite another tenant's attributes. Now delete/activate is scoped to the **requesting** tenant's mapping, and attributes are only written if the user isn't already owned by another company (`action: "linked"` instead).
- **Endpoint:** `POST /api/scim/v2/Users` (create/upsert/delete via `status`), `GET /api/scim/v2/Users`. Tenant is `Current.workspace.id`, never client-supplied.
- **Precondition:** a user mapped to both tenant A and tenant B.
- **Steps / expected (strong negatives):**

| # | scenario | expected | why |
|---|---|---|---|
| 1 | tenant B sends `status=deleted` | only **B's** mapping deactivated; A's mapping and the user's attributes untouched | the core isolation fix |
| 2 | tenant B upserts a different first_name/phone for a user owned by A | attributes **not** overwritten; `action: "linked"`; B's mapping activated | prevents cross-tenant PII overwrite |
| 3 | tenant A re-syncs an existing global user | found via global lookup; **no duplicate** user created | old code duplicated shared users |
| 4 | delete-status variants (`deleted/removed/inactive/in_active/0`, any case) | all treated as delete | enum breadth |
| 5 | blank tenant | activate/deactivate skipped with a warning | fail-safe |

- **Priority:** P0 (multi-tenant data isolation) · **Runnable:** partial (SCIM integration + token)

#### BE-VNR-003 — template-wise quantity hiding OR-combines with the company flag (#989940ae0f)
- **What it is.** Adds a **template-level** `disable_quantity_widgets_template`, the companion to the company-wide flag in **BE-QTY** (#16001). The event-group `config.disable_quantity_widgets` is true if the **company** flag is on **or** any active (not cancelled/withdrawn) template on the event has the template flag on.
- **Endpoint:** `config.disable_quantity_widgets` in `GET/POST/PATCH /api/event_groups`.
- **Expected:** both off → `false`; company on → `true` (short-circuits); template on with company off → `true`; a flagged template that lives only on a cancelled/withdrawn trade request → `false`. (Seller-side field nulling is covered by **BE-QTY-002/003**.)
- **Priority:** P1 · **Runnable:** partial

#### BE-VNR-004 — vendor participation report (#5760d4570d)
- **Endpoint:** `GET /api/reports/download_bulk_report?report_category=vendor_participation_report&starting_from=&ending_at=` — `starting_from`/`ending_at` **required**.
- **Steps/expected:** valid range → Excel enqueued, a row per event×vendor with status **Participated > Invited > Mapped** (precedence) and per-event totals. Missing dates → **422** (code 2). A non-super-admin with `is_download_bulk_report_disabled_for_members` on → **422** (code 10). A vendor mapped but never invited/bidding shows status **Mapped**.
- **Priority:** P1 · **Runnable:** partial

#### BE-VNR-005 — send Letter of Award to vendors (#cb2fd0110d)
- **Endpoints:** `POST /api/proposal/:id/preview_loa` (new); `POST /api/proposal/:id/submit` now takes `send_loa: { vendor_uuid => bool }`. Async generation + email.
- **Steps/expected:**

| # | scenario | expected |
|---|---|---|
| 1 | preview on own draft proposal, EventGroup, vendor in proposal, LOA template exists | 200; `loa.url` signed, `status: "not_sent"`, `url_expires_in: 7200` |
| 2 | vendor not in the proposal | **896** "Vendor is not part of this proposal" |
| 3 | no LOA template for company | **895** "Letter of Award template is not configured…" |
| 4 | opt in on submit, then award | LOA persisted per vendor and emailed **once** (worker skips already-sent) |
| 5 | mailer invoked with a key not matching `report/.../loa/*.pdf` | `ArgumentError`, no S3 read (path-traversal hardening) |

- **Priority:** P1 · **Runnable:** partial

#### BE-VNR-006 — suppress vendor-invite emails via `disabled_mailer_keys` (#f92839d316)
- **What it is.** A company config `disabled_mailer_keys` (array). If it contains `vendor_invite_email`, both invite emails are suppressed. **Fails safe** (still sends) when the value is nil, a bare string, or an array without the key.
- **Trigger:** `NewVendorInviteWorker`, `VendorInviteWorker`.
- **Expected:** default/nil → email sent; `['vendor_invite_email']` → suppressed on both paths; bare string `'vendor_invite_email'` → still sent; `['other_key']` → still sent.
- **Priority:** P2 · **Runnable:** no (worker)

#### BE-VNR-007 — Vendor Product Mapping flexi view (#3ce797157c)
- **Endpoint:** `GET /api/views?item=VendorProductMapping&group_key=default&page=<n>` (+ `/schema`, `/count`, `/filter_options`). Columns: `vendor_code`, `vendor_name` (groupable), `material_code`, `material_name`.
- **Steps/expected:** with vendors that have product recommendations → 200 with groups and the four columns; a vendor with no `recommendation_identifier` → rows with null material fields (left-join); without the `PreferredVendorItemMapping` index permission → forbidden; Excel export names the sheet from the view (not the old hardcoded "PO Report").
- **Priority:** P2 · **Runnable:** partial

#### BE-VNR-008 — auto-select onboarding template per country tax-type (#3b6cce7243)
- **Endpoint:** `GET /api/countries/include_tax_types` — each country gains `template_uuid` when a mapping is configured.
- **Steps/expected:** a mapping to an **allowed** active `vendor_onboarding` template → `template_uuid` present; no/empty config → absent; a malformed entry (`template_id: 0`) → skipped; **all** templates disallowed → `{}` (none emitted). **Known quirk to log:** the allow-check is all-or-nothing — if *any* configured template is allowed, the map still emits **disallowed** template ids too. Worth a dev confirmation.
- **Priority:** P2 · **Runnable:** partial

---

## Running the runnable ones

The **BE-CAT**, **BE-USR** (negatives), **BE-EML** (negatives), and **BE-PR-004** (negatives) cases are safe to fire against the `API_Test_`/`QA_Platform_` sandbox through the API framework in `procol test/` — they either only read or only assert a rejection, so they create no live data. The gated ones (BE-QTY, BE-REG, BE-LOA, BE-VND, BE-BOQ, BE-VNR-001/004/005) need a sandbox company with the relevant config or role set first; the versioning (**BE-VER**), auction (**BE-AUC**), and worker/mailer cases are written for manual or staged verification because they need a full amendment/bidding lifecycle. None of these were run here — this document is the read-only analysis; execution stays sandbox-only per the project's safety rule.

_Source: `Procol-Tech/procol-backend` at `origin/main` (`ae36e86894`, 2026-09-25), commits since `0ac00b3e72` (2026-09-01). Every rule above is cited to `file:line` in the analysis; nothing was inferred without reading the code._

