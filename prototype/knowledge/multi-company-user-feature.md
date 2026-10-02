# Feature: Multi-Company User + Company Switcher

Config flag: **`enable_multi_company_user_onboarding`** (Company master config, default OFF; ON for 7 clients).
Source: unmerged branch **`feat/multi-company-user-switcher`** (procol-backend), key commit `d014313f82`.
**STATUS: NOT deployed on UAT (sec-api-v1).** Verified — `dashboard_configuration` has no `is_multi_company_user` /
`allowed_client_companies`. To test live, point the platform at an environment running this branch (a preview URL),
or wait for it to merge to UAT.

## What it does
One registered user belongs to several companies. When enabled, the user sees a **company-switcher dropdown**;
switching "boxes" them to that one company — scoping config, permissions, and data to it.

## Membership model
Table **`user_company_mappings`** (user_id, company_id, status[active=1], user_type, trade_identifier, erp_id).
`User#companies`/`workspaces` = active mappings. `is_buyer_mapped_to_multiple_company?` = >1 buyer-category company.

## The switch mechanism (KEY for automation)
No dedicated switch endpoint. Every authenticated request carries an **encrypted `client_company_uuid`** param.
Backend (`lib/current.rb`, `login_signup_helper.rb`): `decode_data(client_company_uuid)` → if the user
`is_allowed_for_workspace?`, boxes `Current.workspace` / `Current.allowed_companies = [that company]` /
`Current.client_company_id`. Non-member uuid → silent fallback to the user's full scope (no 403).

Switcher options come from `GET /api/v1/dashboard_configuration`:
`is_multi_company_user: true` + `allowed_client_companies: [{uuid (encrypted id), name}]`.
The client echoes a chosen `uuid` back as `client_company_uuid` on subsequent calls.

## Per-company scoping
- Config: all reads use `CustomConfiguration.cached_all_configs(item: Current.workspace)` → the boxed company's config.
- Permissions: `User#active_teams_in_scope` filters teams to `Current.allowed_companies` → `authorized_modes` /
  `team_wise_roles` / `authorized_permissions` reflect ONLY the selected company. Boxed to a company with no team →
  `authorized_modes == []` (no default "purchase").
- Writes: `can_act_for_company?(id)` gates product/tds/tariff/trade mutations (error 101 if not a member).
- Data isolation: `Current.allowed_companies=[id]` confines queries; vendor-bulk-upload jobs stamped with company_id;
  notifications filtered by `data.company_id == Current.workspace.id` (legacy nil company_id items leak by design).

## Test plan (ready to run against an env that has the feature)
Setup: buyer user U with active mappings to buyer-category verified companies A and B (is_multi_company_user=true).
uuid_A/uuid_B from `allowed_client_companies`.
- **Functional:** F1 login/dashboard_configuration → is_multi_company_user=true + A,B listed. F2 single-company buyer → false, sending uuid has no effect. F3 dashboard_configuration with uuid_A vs uuid_B → two DIFFERENT configs. F4 boxing sets Current.workspace/allowed_companies=[A].
- **Permissions:** P1 a mode in A not B → present with uuid_A, absent with uuid_B. P2 authorized_permissions per company. P3 feature flag ON for A/OFF for B → endpoint enabled with uuid_A, gated with uuid_B. P4 boxed to a no-team company → authorized_modes=[]. P5 write with client_company_id=B (member) → allowed; non-member → 101.
- **Data isolation (P0):** S1 lists/reads return only the boxed company's records. S2 vendor-job created in A not returned in B. S3 notification with company_id=A hidden in B. S4 non-member uuid → fallback, NO C data. S5 cross-company write → 101. S6 legacy nil-company items visible under any box (intended).
- **Edge:** E1 user removed from B mid-session → uuid_B falls back. E2 down to one company → switcher hidden. E3 concurrent requests with different uuids don't bleed (Current is per-request). E4 malformed uuid → no boxing. E5 onboarding gate: existing buyer + config ON → new mapping (reuse user); OFF → blocked.

## Spec-confirmed rules (from the branch's own tests — user_multi_company_spec, current_spec)
- `buyer_companies` = verified, buyer-category companies the user is mapped to, **excluding the parent** company; **excludes** virtual/unverified and seller (non-buyer-category) companies.
- `is_buyer_mapped_to_multiple_company?` = true only with **>1** buyer company (false for exactly 1 or 0) → switcher shows only then.
- Selecting a company (`set_global_variables client_company_id: A`) → `Current.workspace == A`, `Current.allowed_companies == [A.id]` (BOXED to one).
- Selecting a company the user is **not** mapped to → **silent fallback** to the user's full company list (no error). Single-company buyer → never boxed.
These map to the black-box checks below (is_multi_company_user, per-company scoping, non-member fallback).

## Automation harness (BUILT — `src/flows/multiCompanyChecks.ts`, ready to run)
For a multi-company user U on an env with the feature: authenticate (DB session), then for each company:
GET /api/v1/dashboard_configuration with `client_company_uuid=<uuid_X>` and assert the config/authorized_permissions
differ correctly per company + a data-list endpoint returns only that company's rows. Skip-with-reason if the env
lacks the feature (no is_multi_company_user field) — same config-gating pattern the platform already uses.
