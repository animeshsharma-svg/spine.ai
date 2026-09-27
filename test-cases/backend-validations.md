# Procol backend — validation rules as test cases

A deep, read-only map of **where the backend actually validates data** — API field/data validations, the dynamic **form/template** validations, the configurable **Flexi** rule engine, **bulk-upload/Excel** validations, and every validation that is **gated behind a company flag**. Each rule is grounded in `file:line` and written as human QA cases with a **field-validation checklist** where it's API-assertable.

This complements [backend-recent-changes.md](backend-recent-changes.md) (which covers *what changed* Sep 1–25). This doc covers *the validation layer as it stands*.

> **Source & method:** read-only analysis of `procol-backend` (`git show` / reads only — live code/config/DB untouched). Error codes resolve through `config/locales/en-IN.yml` `api_errors`; every code is **HTTP 422** unless noted. Routes are cited in the `/api/...` form.

> **The big theme you flagged:** *a lot of validation is behind a flag.* Most `CustomConfiguration` keys **default OFF** (an absent row is falsy), so the validation simply doesn't fire until a company turns it on — which means the "correct" behavior differs per tenant. Part 1 is the catalog of those. And several validations are **client-side only** or have **known gaps** (empty-treated-as-0, required not enforced on partial saves) — Part 6.

---

# Part 1 · Flag-gated validations (the catalog)

Each row: the config/flag key, its default, what validation it turns on, the endpoint, and the reject when it's ON. All keys default **OFF** unless noted. This is the "sometimes it's behind a flag" list — to test any of these you must first know the tenant's config.

| # | config key | default | validation gated | endpoint / flow | reject when ON | file:line |
|---|---|---|---|---|---|---|
| 1 | `prevent_duplicate_product_categories` | off | duplicate category name (case-insensitive, per level) | `POST /product_categories` | 422 "already exists" | product_category.rb:141 |
| 2 | `material_codification` | off | category/product code presence, exact length, sibling code+name uniqueness | product_category / product create | model err 422 | product_category.rb:65-66,162-180 |
| 3 | `allow_duplicate_product_code` | off | product_code uniqueness scope (off=per company, on=per category subtree) | product create/update | model err 422 | product.rb:378-397 |
| 4 | `article_code_mandatory_on_product_create` | off | product_code presence on create | `POST /products` | 1120 | products_controller.rb:76 |
| 5 | `vendor_code_mandatory_on_vendor_create` | off | vendor_code presence | `POST /v1/companies` create_vendor | 2007 | v1/companies_controller.rb:156 |
| 6 | `boq_in_erfx_allowed` | off | BOQ-based event creation allowed | `POST /event_groups` (boq) | 101 | event_groups_controller.rb:29-30 |
| 7 | `scheduled_events_enabled` | off | scheduled-events listing/create | `GET /event_groups/scheduled` | 904 / 403 | event_groups_controller.rb:375 |
| 8 | `enable_pr_bulk_upload` | off | PR bulk-upload permission | `POST /bulk_upload` | 906 / 403 | bulk_upload_controller.rb:145 |
| 9 | `is_download_bulk_report_disabled_for_members` | off | bulk report blocked for non-super-admin | `GET /reports/download_bulk_report` | 10 | reports_controller.rb:158-159 |
| 10 | `block_pr_unhold` | off | blocks moving a held PR item back to active | PR unhold | 101 | purchase_requests_controller_helper.rb:631 |
| 11 | `is_pr_amendment_enabled` | off | in-progress PR line reopen/hold rules | PR hold flow | 592 | purchase_requests_controller_helper.rb:645 |
| 12 | `disable_manual_vendor_creation` | off | blocks manual vendor invite/bulk create | `POST /invitations/send_invite`, `POST /v1/bulk_create_vendor` | 745 | invitations_controller.rb:9-12 |
| 13 | `is_intake_edit_allowed` | off | edit a non-draft intake | `intake_requests#update` | 101 | intake_requests_controller.rb:167 |
| 14 | `is_intake_resubmit_allowed` | off | resubmit a rejected intake | `intake_requests#update` | 101 | intake_requests_controller.rb:163 |
| 15 | `licensing_restrictions_enabled` | off | per-user license-seat check on mapping | user-company mapping | model err 422 | user_company_mapping.rb:138-146 |
| 16 | `allowed_surrogate_bid_even_after_bid` | off | buyer surrogate bid after a response exists | surrogate response create | 30 | template_responses_controller_helper.rb:266 |
| 17 | `restrict_event_visibility_to_owner` | off | non-owner/non-planner blocked from events | event index/show | filter/deny | event_groups_controller.rb:140 |
| 18 | `config_key_exists` (MasterConfiguration allow-list) | n/a | only whitelisted config keys/types can be set | `POST /custom_configuration` | 1103 | custom_configuration_controller.rb:22-26 |
| 19 | event `allow_quantity_less_auction` | off | zero/blank line quantity at event create | event create | 35 | trade_controller_helper.rb:1623 |
| 20 | event `is_over_quantity_allowed` (+multi-vendor) | **on** | bid qty may exceed line qty | bid placement | 138 (if off) | bids_controller_helper.rb:1812 |
| 21 | event `is_under_quantity_allowed` | **on** | bid qty may be below line qty | bid placement | 139 (if off) | bids_controller_helper.rb:1816 |
| 22 | event `allow_fixed_quantity_for_bidding` | off | bid qty must equal auction qty | bid placement | 207 | bids_controller_helper.rb:1809 |
| 23 | event `is_price_increase_allowed` / `is_price_decrease_allowed` | **on** | direction of price move on revise | bid revise | 300 / 301 (if off) | bids_controller_helper.rb:2291 |
| 24 | event `is_user_allowed_to_modify_audience` | **on** | edit event audience | `POST /v1/trade` audience | 685 | v1/trade_controller.rb:37,54 |
| 25 | event masking (`show_bidding_stats*`, `lock_bid_by_default`) | off | hide savings/aggregates during live bidding | `GET /v1/trade/:id/aggregate_savings` | 577 | v1/trade_controller.rb:567 |
| — | **recent (origin/main, not on sandbox yet):** `super_admin_edit_user_contact_enabled`, `restricted_pan_email_domains`, `disable_quantity_widgets`/`_template`, `is_pr_audit_trail_available`, `auto_onboarding_for_self_registered_vendors`, unique-invoice | mixed | see [backend-recent-changes.md](backend-recent-changes.md) | — | — | — |

**Note (client-enforced, no backend reject):** `mandatory_approval_remarks` and `allowed_maximum_line_items` (the BOQ cap) are only pushed to the frontend (`v1/users_controller.rb:540,592,724`) — the backend does not reject on them. Don't write a backend case expecting a 4xx.

#### VAL-FLAG-001 — an unknown config key is rejected (allow-list)
- **Precondition:** none.
- **Steps:** `POST /custom_configuration` with a `config_key` that isn't in the MasterConfiguration allow-list (or a wrong `item_type`).
- **Expected:** **1103** / 422, before anything is persisted.
- **Validations:**

| # | check | expected |
|---|---|---|
| 1 | HTTP status | 422 |
| 2 | `error.code` | 1103 |
| 3 | side effect | no config row written |

- **Priority:** P1 · **Runnable:** **yes** (pure reject, no flag needed)

#### VAL-FLAG-002 — scheduled-events access is gated
- **Precondition:** `scheduled_events_enabled` off on the company (the default).
- **Steps:** `GET /event_groups/scheduled`.
- **Expected:** **904 / 403** when off; a `200` list when on.
- **Priority:** P2 · **Runnable:** **yes** (read-only; result reveals the tenant's flag state)

#### VAL-FLAG-003 — duplicate product category (gate-dependent)
- **Precondition:** create `API_Test_X`, then create it again.
- **Expected:** with `prevent_duplicate_product_categories` **on** → 422 "already exists"; **off** → the duplicate is accepted (legacy). *(This is what the sandbox run already showed: gate off here.)*
- **Priority:** P0 · **Runnable:** **yes** (sandbox-named)

#### VAL-FLAG-004 — bid quantity bounds flip with event config
- **Precondition:** an event with `is_over_quantity_allowed` **off** (non-default).
- **Steps:** place a bid with qty greater than the line quantity.
- **Expected:** **138** rejected. With `is_under_quantity_allowed` off, a lower qty → **139**; with `allow_fixed_quantity_for_bidding` on, any qty ≠ auction qty → **207**. All three are **on/permissive by default**, so the *absence* of rejection is the default — worth asserting both directions.
- **Priority:** P1 · **Runnable:** no (needs an event + bidding)

---

# Part 2 · Field / data validations (model + validator layer)

The explicit `validates` rules and the `Validate::` validator classes. Error-code quick reference: `3` invalid phone · `310` phone taken · `350` incorrect details · `393` invalid email · `460` invalid name · `541` email taken · `550` email pending · `888` unit-validator envelope.

### VAL-USR · User email & phone — `PATCH /users` (`Validate::UserValidator`, user_validator.rb)

#### VAL-USR-001 — email format
- **Steps:** `PATCH /users` email="foo@bar" (no TLD).
- **Expected:** **393** "Invalid Email ID". (Regex requires a `.[a-z]+` TLD, `utils.rb:13`.)
- **Validations:** status 422 · `error.code` 393 · no change persisted.
- **Priority:** P0 · **Runnable:** **yes** (reject, no mutation) — *confirmed live: 422 code 393.*

#### VAL-USR-002 — email uniqueness is bypassed for a verified actor
- **Steps:** as a user whose own email is already verified, set email to one used by another active+verified user.
- **Expected:** **accepted** (uniqueness only runs when the actor's email is *not* verified, `user_validator.rb:46`). As an *unverified* actor → **541**.
- **Priority:** P1 · **Runnable:** partial (needs two users) — a known bypass worth a dev confirm.

#### VAL-USR-003 — phone validity & uniqueness
- **Steps:** phone="12345" (invalid) → **3**; a valid but already-active number (changed) → **310**; the same number unchanged → accepted (short-circuit).
- **Priority:** P1 · **Runnable:** partial.

### VAL-UNIT · Unit — `POST /units`, `PATCH /units/:id/edit` (validator + model)

#### VAL-UNIT-001 — symbol format
- **Steps:** `POST /units` name="API_Test_U", symbol="kg@#".
- **Expected:** rejected — "can only contain alphabets, numbers or spaces" (`unit.rb:40`).
- **Priority:** P1 · **Runnable:** **yes** (reject).

#### VAL-UNIT-002 — conversion factor must be > 0
- **Steps:** `conversion_factor: 0` (and `-1`).
- **Expected:** rejected — "must be greater than 0".
- **Priority:** P1 · **Runnable:** **yes**.

#### VAL-UNIT-003 — the validator/model cap mismatch (known issue)
- **Steps:** symbol of **16** characters.
- **Expected:** rejected by the validator (max **15**), even though the model allows 30. The create path enforces the stricter 15 — a real inconsistency to confirm with dev.
- **Priority:** P2 · **Runnable:** **yes**.

#### VAL-UNIT-004 — duplicate symbol per company (case-insensitive)
- **Steps:** create symbol "KG" when an active "kg" exists in the company (symbols are stored lowercased).
- **Expected:** "has already been taken" (scope `[company, status]`, `if active?`).
- **Priority:** P1 · **Runnable:** **yes** (sandbox-named name; the reject is the assertion).

### VAL-CATTR · Custom attribute — `POST /custom_attributes`
#### VAL-CATTR-001 — dropdown requires options
- **Steps:** create with `input_type="dropdown"` and no `options`.
- **Expected:** rejected — `options` presence is required **only** when input_type is dropdown (conditional validation, `custom_attribute.rb:38`).
- **Priority:** P2 · **Runnable:** **yes**.

### VAL-TAG · Tag — `POST /tags`
#### VAL-TAG-001 — name format + scoped, case-insensitive uniqueness
- **Steps:** name="a-b!" → rejected ("is invalid", word/space only). Then a duplicate name in the same visibility scope (name column is `citext`) → "has already been taken".
- **Priority:** P2 · **Runnable:** **yes**.

### VAL-VP · Vendor payment — `POST /vendor_payments/submit_proof`
#### VAL-VP-001 — amount & per-vendor/event uniqueness
- **Steps:** `amount:-1` → "must be greater than or equal to 0"; a second payment for the same `event_id`+`vendor_id`+`company_id` → "A payment record already exists for this vendor and event."
- **Note:** `amount:0` is **accepted** (`>= 0.0`) — confirm intent. Currency defaults to INR; a 2-char currency → "wrong length (should be 3)".
- **Priority:** P1 · **Runnable:** partial.

### VAL-RT · Report template — `POST /nfa_report_templates` vs `/mqcs_report_templates`
#### VAL-RT-001 — PDF-config checks are NFA-only
- **Steps:** `align:"Sideways"` on an NFA template → rejected ("not included in the list"); the same on an MQCS template → **accepted** (the inclusion checks are gated `if: nfa_template?`).
- **Priority:** P2 · **Runnable:** partial.

### VAL-PRI · Purchase-request item (PR ingest)
#### VAL-PRI-001 — line-number uniqueness & conditional presence
- **Steps:** two material items with the same `prLno` in one PR → "Item already exists"; an activity item missing `serviceLno` → rejected; the same `serviceLno` under a different package (ancestry) → accepted.
- **Note:** the presence set flips on `line_item_type` (`activity?`/`service?`). `quantity_requested` is `NOT NULL` at the DB.
- **Priority:** P1 · **Runnable:** no (PR ingest flow).

---

# Part 3 · Dynamic form / template field validations

There are **two form engines**, each with its own validation stack:

- **Template/Form engine** — RFP/RFI proposal forms, questionnaires, vendor-onboarding v1/v2. Submit validator: `TemplateResponses::ValidateService`.
- **Flexi/Datasource engine** — vendor-onboarding v3, generic intake. Validator: `FlexiModule::FxValidationService` (Part 4).

**Template-create** validation is **structural only** (each widget needs `key_attribute`, `name`, a valid `field_type`; dropdowns need options; formulas must resolve; keys unique — `templates/validate_service.rb`). **Per-value** enforcement happens on **response submit** (status→active).

Submit-time gate (`template_responses/validate_service.rb:154-169`):
- required field blank → **572** "Please fill '<name>'" (only for `field_type` in `[participant, creator]`)
- a field whose async `validations` returned `validated:false` → **773** (unless the widget has `allow_failed_validation_submit`)
- `mode_type: "hidden"` fields are skipped
- `is_rfip_all_line_items_required` (event config) on + a line item unanswered → **718**

#### VAL-FORM-001 — mandatory field enforced on submit
- **Steps:** submit a proposal/questionnaire with a required text field blank.
- **Expected:** **572** "Please fill '<name>'".
- **Priority:** P0 · **Runnable:** no (needs a template response).

#### VAL-FORM-002 — a hidden required field is skipped
- **Steps:** a required field whose condition makes it `mode_type:"hidden"`, left blank; submit.
- **Expected:** **accepted** — hidden fields bypass the required check. (Regression-prone; worth asserting.)
- **Priority:** P1 · **Runnable:** no.

#### VAL-FORM-003 — failed async validation (GST/PAN) blocks submit unless overridden
- **Steps:** a field with `validations` whose stored `validated:false`; submit.
- **Expected:** **773**; but with the widget's `allow_failed_validation_submit` on → **accepted**.
- **Priority:** P1 · **Runnable:** no.

#### VAL-FORM-004 — grouped table validates children only when the group is touched
- **Steps:** an optional grouped-table section: (a) leave the whole group empty; (b) fill one optional cell but leave a required cell blank.
- **Expected:** (a) **accepted** (no child validated); (b) **572** (any-filled forces all required children). Multi-response rows validate per row.
- **Priority:** P1 · **Runnable:** no.

#### VAL-FORM-005 — vendor onboarding: failed validations only block final approval when the company opts in
- **Steps:** complete a v2 onboarding form with a field whose async validation failed.
- **Expected:** with `block_vendor_onboarding_if_validation_fails_at_final_approval` **off** (default), final approval proceeds; **on** → blocked with the list of failed fields.
- **Priority:** P1 · **Runnable:** no.

---

# Part 4 · Flexi configurable validation engine

The **live** form-field engine. Each `FxDatasourceField` carries a JSONB `validations` array parsed into `Flexi::ValidationConfig` rules; they run **synchronously on `FxResponse` create/update, before save** (`fx_response_service.rb:760-816`). Data-type checks run first and short-circuit the rule checks. Errors → **422** `{errors:[{field_key, validation_type, operator, error_message}], success:false}`.

> **Architecture note:** the ActiveRecord `FxValidation` model is **dead code** (no live references); the JSONB `Flexi::ValidationConfig` PORO is the real engine. Don't write cases against `fx_validations` rows.

**Operator catalog** (`validation_config.rb`): `is_required`, `is_unique`, `min_length`/`max_length`, `min_value`/`max_value`, `matches_regex{pattern}`, `in_list{values}`, `equals/not_equals/greater_than/less_than/contains/starts_with/ends_with`, `*_current_time`/`*_current_date{offset}`, `same_datasource{field_key}`, `cross_datasource{datasource_key,field_key}`, `custom_rule{expression}` (Dentaku). **Data-type** checks: number (`-?\d+(\.\d+)?`), date (Unix ts), boolean, dropdown (∈ options).

Endpoints: `POST /fx_responses/create_row`, `PATCH /fx_responses/:id`, `POST /fx_responses/:id/field_responses`, `POST /fx_responses/submit`.

**Gating (three ways, no company flag):** the field has no `validations`; the caller passes `validate:false`; or a rule's `severity` is `warning`/`mismatch` → the error is **collected but does not block** the save.

#### VAL-FX-001 — required field on submit
- **Steps:** set the record's status to active with an `is_required` field blank.
- **Expected:** **422**, operator `required`, "<name> is required".
- **Priority:** P0 · **Runnable:** no (needs a datasource).

#### VAL-FX-002 — data-type error short-circuits rule errors
- **Steps:** a `number` field = "12abc" that also has a `min_value` rule.
- **Expected:** only the `data_type/number` error ("must be a valid number") — the rule check is skipped.
- **Priority:** P1 · **Runnable:** no.

#### VAL-FX-003 — `is_unique` excludes the record itself
- **Steps:** a field with `is_unique`: create record A with "INV-1"; edit A (keep "INV-1") → accepted; create B with "INV-1" → rejected.
- **Priority:** P1 · **Runnable:** no. *(Off-by-one on self-exclusion is a classic bug.)*

#### VAL-FX-004 — a `warning`-severity failure does NOT block
- **Steps:** a field failing a rule whose `severity:"warning"`.
- **Expected:** the save **succeeds**; the message is reported but non-blocking.
- **Priority:** P1 · **Runnable:** no. *(This is the one real "flag" inside the engine.)*

#### VAL-FX-005 — cross-datasource compare with a blank counterpart
- **Steps:** a `cross_datasource equals` rule (e.g. bill.amount vs po.amount) where the compared value is blank, with `skip_if_comparison_value_blank:true` vs `false`.
- **Expected:** `true` → skipped (accepted); `false` → rejected. (3-way-match logic.)
- **Priority:** P1 · **Runnable:** no.

---

# Part 5 · Bulk-upload / Excel validations

Four surfaces, two error models: **auction/BOQ/vendor** return a `valid`/`in_valid` (or per-row `failed`) partition (no hard batch reject); **FX** hard-rejects the whole batch (422) and won't enqueue.

### Auction Excel — `POST /templates/product_sheet_params`
Row checks in priority order (`auction_excel_validation_service.rb:120-160`): data-type ("Input type is not valid") → mandatory null ("Mandatory Item cannot be left empty", `.nil?`) → "Invalid Product Code" (active product in `allowed_companies`) → "Invalid Location Code" → schedule > now → delivery ≥ schedule → attachments ≤ **15** (code 498; **the message says "5" — stale**).

#### VAL-BULK-001 — bad numeric cell outranks a null cell
- **Steps:** upload a row with Quantity="ten" and also a blank mandatory cell.
- **Expected:** the row lands in `in_valid` with "Input type is not valid" (data-type check has priority over the null check).
- **Priority:** P1 · **Runnable:** no (Excel upload).

#### VAL-BULK-002 — multistage BOQ skips cell validation (regression risk)
- **Steps:** the same bad rows on a `boq?` multistage template.
- **Expected:** rows pass through unvalidated — the multistage branch is structural only.
- **Priority:** P2 · **Runnable:** no.

### Vendor bulk upload (V2 is the only live path) — `POST /v1/bulk_create_vendor`
#### VAL-BULK-003 — old-format sheet is rejected wholesale (the v1→v2 gate)
- **Steps:** upload a sheet whose header row still has `GST` / `POC - Phone Number` / `POC 2 - Mobile`.
- **Expected:** **422**, "Format is updated for bulk upload, please download the format to continue." — before any per-row processing.
- **Priority:** P1 · **Runnable:** no.

#### VAL-BULK-004 — tax-number & configuration checks (per country)
- **Steps:** a row with a `Tax No.` that fails the country's `TaxTypeCountryMapping.regex`; and a valid-looking Tax No. for a country with no mapping.
- **Expected:** row `failed` with "Invalid Tax No."; the second with "Tax Type not configured for the selected Business Location". Duplicate POC emails across rows are **accepted** (dedupe removed — trap). Blank Vendor Profile is optional under `vendor_invitation_v2`.
- **Priority:** P1 · **Runnable:** no.

### FX bulk upload — `POST /fx_bulk_upload/validate` (dry-run) / `populate_data`
#### VAL-BULK-005 — required, unknown-option, over-limit, and warning severity
- **Steps:** (a) a required field blank; (b) a dropdown value not in the options; (c) 101 upload groups; (d) a field failing a `severity:warning` rule.
- **Expected:** (a) 422 "Required field 'X' is missing"; (b) 422 "…value '…' not found. Available options: …"; (c) 422 "Upload exceeds the 100-group limit"; (d) **success** with the message in `warnings[]`, not `errors[]`. An unknown *column* is a warning, not a failure.
- **Priority:** P1 · **Runnable:** no.

---

# Part 6 · Known gaps & message/behavior mismatches (confirm with dev)

These came out of reading the code — each is worth a dev sign-off and a regression test:

1. **Empty-treated-as-0 (Flexi).** Numeric comparisons coerce with `.to_f`, so `""` and `"abc"` become `0.0`. A `min_value:0` rule therefore **accepts** an empty or non-numeric value. (`validation_config.rb:224-235`) → VAL-FX like case.
2. **Required not enforced on partial saves (Flexi).** The required sweep runs **only** when the `status` field is being set. A normal field update that omits a required field passes. (`fx_response_service.rb` `validate_required_fields`)
3. **Dropdown data-type check may never fire (Flexi).** `validate_dropdown` keys on `data_type == "dropdown"`, but the enum value is `dropdown_select` — so option-membership relies on an `in_list` rule, not the data-type check. (`fx_validation_service.rb:104`, `fx_datasource_field.rb:43`)
4. **Template engine has no server-side type/min/max on submit.** A `number` field accepts "abc"; price/quantity have no `>0` at submit. Enforcement is client-side unless an async `validations` rule exists. (`template_responses/validate_service.rb`)
5. **Async validations run on draft-save, not submit.** Submit only re-reads the stored `validated` flag; a value changed after a passing validation can slip unless `revalidate_on_change_key` is set. (`forms_helper.rb:539-547`)
6. **Unit symbol cap mismatch** — validator 15 vs model 30; the create path enforces 15. (VAL-UNIT-003)
7. **Attachment limit message wrong** — code 498 says "5" but the constant is **15**. (`trade_product.rb:55`)
8. **Duplicate POC emails accepted** in vendor bulk upload (dedupe deliberately removed). (`companies_helper.rb:702`)
9. **BOQ "purchasable" test is Unit-presence only** — a row with a description + quantity but a blank Unit silently demotes to a section note. (`dynamic_boq_helper.rb:52-64`)
10. **`vendor_payment` amount 0 accepted** (`>= 0.0`) — confirm whether zero should be allowed.

---

## Running the runnable ones

Safe to fire live against the sandbox (reject-only or sandbox-named, no real mutation): **VAL-FLAG-001** (unknown config key → 1103), **VAL-FLAG-002** (scheduled-events read), **VAL-FLAG-003** (duplicate category), **VAL-USR-001** (email format 393 — already confirmed live), **VAL-UNIT-001/002/003/004**, **VAL-CATTR-001**, **VAL-TAG-001**. The form/Flexi/bulk cases (Parts 3–5) need a datasource, template, or spreadsheet set up, so they're written for staged verification. Execution stays sandbox-only per the project rule; a 404 on any of these means the feature isn't deployed to the sandbox yet (the sandbox backend is older than `origin/main`).

_Source: `procol-backend` — model layer, `app/controllers/validate/`, `app/services/validations/`, `app/services/flexi_module/`, `app/services/template_responses/`, `app/poro_classes/flexi/`, and `config/locales/en-IN.yml`. Every rule cited to file:line in the analysis; nothing inferred without reading the code._
