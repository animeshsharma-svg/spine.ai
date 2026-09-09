# Feature: Multi-Entity Vendor Mapping (PR #15221 + #15716)

Derived read-only from `procol-backend` local git. The frontend PR is #5629.
Gating flag: **`is_vendor_entity_mapping_enabled`** (Company master config, default OFF).
**Live on:** Ashoka University (company 56777) — the only client with the flag ON.

## What it does
A Procol client may be a group of several **legal entities / subsidiaries**, each with its
own ERP and its own vendor code for the same vendor. This makes vendor→ERP mapping
**entity-scoped**: one vendor (`bsm_id`) can be mapped independently to multiple entities,
each mapping firing its own outbound ERP call and storing that entity's vendor code.
When the flag is ON, the legacy single-integration onboarding path is bypassed.

Core object `VendorEntityMapping` = join row (`bsm_id` + `entity_key`) → `vendor_code`, `erp_synced`.
Entity catalog comes from `WidgetDataMapping (key='vendor_entity_mapping', company_id=workspace, active)`.
ERP routing per entity via a new `subsidiary_key` column on `integration_templates`.

## Endpoints (all require `dealing_with_company_id` = the vendor company)
- `GET  /api/vendor_entity_mappings/unmapped?dealing_with_company_id=` → entities not yet mapped for this vendor: `[{display_value, value}]`.
- `GET  /api/vendor_entity_mappings?dealing_with_company_id=` → `{columns (from vendor_entity_mapping_columns config), rows (VendorEntityMapping for this bsm + workspace)}`.
- `POST /api/vendor_entity_mappings?dealing_with_company_id=` body `{entity_key}` → maps vendor→entity, fires sync ERP dispatch, stores vendor_code. `201` on success.

### create flow (validation ladder — the test targets)
1. blank `entity_key` → **400** "entity_key is required".
2. missing `dealing_with_company_id` → **400** / **404** "Vendor mapping not found".
3. `entity_key` not in WidgetDataMapping (active) → **404** "Entity not found in mapping configuration".
4. already mapped `(bsm_id, entity_key)` → **422** "Entity already mapped for this vendor".
5. ERP dispatch nil (no template) → **422** "No integration template found for this entity".
6. ERP `!success?` → **422** with the ERP error message.
7. success → **201**, row persisted, `erp_synced = vendor_code.present?`. `entity_name = WDM display_value || entity_key`.
8. DB unique index `(bsm_id, entity_key)` → concurrent dup returns **422** (RecordNotUnique rescued), never 500.

## Model rules (`vendor_entity_mapping.rb`)
- `validates :entity_name, :entity_key, presence: true`
- `validates :entity_key, uniqueness: { scope: :bsm_id }` (+ DB unique index)
- `belongs_to :company` (company_id mandatory), `belongs_to :buyer_seller_company_mapping (bsm_id)`
- deleting the vendor mapping cascades (`dependent: :destroy`)

## Isolation rules (highest-value tests — cross-entity & cross-tenant)
- Workspace scoping: `set_bsm` finds bsm by `client_company_id = Current.workspace.id`; `index` filters `company_id = workspace` AND `bsm_id`. Workspace A can't see/create workspace B's mappings → **404**.
- Entity routing: ERP dispatch + template lookup filter on `subsidiary_key = entity_key`, so entity A's template/credentials/vendor_code can't be used for entity B.
- Policy gate: with the flag OFF, `index/unmapped/create` are all denied by Pundit (401/403) regardless of role.
- `#15716`: template selection constrained to `trigger:['on_creation', nil]` so the vendor_code is read from the correct template.

## Test plan (greenfield — NO existing specs)
- **Functional:** create→201 with vendor_code; create with no vendor_code at path → row with erp_synced=false; index returns columns+rows; unmapped excludes already-mapped; delete-vendor cascades; flag ON skips legacy integration on form submit.
- **Data-validation:** blank entity_key→400; missing dealing_with_company_id→400/404; unknown entity_key→404; duplicate→422; company_id/bsm_id NOT NULL.
- **Edge:** ERP nil→422; ERP error→422; concurrent dup→one row + 422 (not 500); vendor_code_path missing→fallback→erp_synced=false; inactive WDM treated as not-found.
- **Non-functional:** index no N+1 (includes extended_fields); columns cached; sync ERP timeout leaves no partial row.
- **Security/isolation (P0):** S1 workspace A cannot access workspace B's vendor (404); S2 index never returns another company's rows; S3 entity A mapping never surfaces for entity B; S4 entity A template can't be used for entity B; S5 flag OFF → all endpoints denied; S6 role without app-auth entry denied.

## Testing constraints (for automation)
- **API automation:** runnable against **56777 (Ashoka University)** via DB-session API auth (needs one of 56777's vendors as `dealing_with_company_id` + valid `entity_key`s from its WidgetDataMapping).
- **UI automation:** the mapping screen only appears for a console where the flag is ON (56777). Our current UI login is OTP-as-clientA (different company) and DB-session injection is currently dead — so UI-testing THIS feature needs a login into 56777. (Stagehand's AI-driven navigation would handle the screen once logged in.)
