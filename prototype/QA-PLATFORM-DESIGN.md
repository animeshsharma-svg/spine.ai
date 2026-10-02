# spine.ai — Design Document (index + build plan)

> **Full rendered document (read this first):**
> https://claude.ai/code/artifact/ce708832-412b-443e-9452-fa5601011586
> (built 2026-09-04, grounded in the live `procol-backend` specs/models/PR history)

This file is the short, actionable record. The artifact has the full explainer (plain-English
primer, the domain map, the 29-area spec inventory, the test strategy, and the Stagehand plan).

## Where the ground truth came from (5 read-only research agents, 2026-09-04)
1. **Backend spec inventory** — `spec/requests` (9) + `spec/controllers` (52) + `spec/services` (77) →
   **29 feature areas** with concrete edge cases + numeric error codes. Ranked top-10 value list.
2. **Permissions/roles** — Pundit (`app/policies`), central gate `User#is_allowed_to_perform_action?`,
   the two-enum role trap, config-AND-gating, cross-workspace denial. Gap: **no e2e 401-vs-422 tests.**
3. **Data model** — users/`user_company_mappings`, teams/`team_members`(role), products/`product_categories`
   (ancestry, not parent_id), the Product→Event chain, `buyer_seller_company_mappings` + `vendor_entity_mappings`,
   `master_configurations` + `custom_configurations` (precedence: custom→company default→global).
4. **PR/feature history** — flags: `is_vendor_entity_mapping_enabled`, `enable_multi_company_user_onboarding`,
   `planner_role_based_permissions_enabled`, `over_quantity_tolerance_percentage`,
   `vendor_code_mandatory_on_vendor_create`, `is_take_lead_enabled`, etc. Branches: multi-company, multi-make, vendor-onboarding-*.
5. **Stagehand v4** (shipped Aug 2026) — runs **fully local headed Chromium (no Browserbase acct)**,
   **Groq-native** (`groq/…`, reuse our key), self-heal via `observe()`→`act()` + action caching,
   primitives `act/observe/extract/agent`, wraps Playwright (raw `page.*` still available).
   Caveat: v4 API differs from older tutorials; server-side cache is Browserbase-backed (confirm locally).

## KEY DOMAIN FACTS (for building suites)
- **Role trap:** `users.role` = member0/manager1/admin2/super_admin3/quality_check4 BUT
  `team_members.role` = member0/quality_check1/manager2/admin3. Different numbers, same words.
  Effective event authority = `team_members.role`, not `users.role`.
- **Permission gate order:** valid token(else 401) → super_admin/procol-employee bypass →
  all-non-"client"-cos bypass → required config flag OFF (else 422) → (company,team_type,role) grants
  module·operation (else 422) → record ∈ Current.workspace/allowed_companies (else 422) → allow.
  Authorization deny = code **455 → HTTP 422**; auth failure = **401**.
- **Config read path:** `CustomConfiguration.cached_all_configs(item: company, config_key: "…")`.
- **Product→Event chain:** Product → EventGroupLineItem → EGLI_trade_mapping (polymorphic) →
  TradeProduct (quality+qty+unit+buyer_hub) → TradeRequest → EventGroup. Biddable numbers live on TradeProduct.

## BUILD PLAN (Stagehand-first, pending user OK)
- **Phase 1 (PRIORITY):** Stand up the Stagehand v4 self-healing UI runner — Groq + local headed
  Chromium; prove act/observe/extract on Procol login + one form; new `layer:"ui"` check kind that
  streams into the existing panel/report/history.
- **Phase 2:** UI journeys — (1) multi-company switcher, (2) role-based visibility (member/manager/admin),
  (3) AI popup handling (replace brittle watcher), (4) Create-User/Create-Event form mirrors.
- **Phase 3:** Two flagship API suites from the spec goldmine — **partial awarding/bids**
  (codes 557/558/561/889) and **PR partial-closure** (861/823/528/862/868/863/867).
- **Phase 4:** Permission/config matrix engine — {role × flag × workspace} cross-product → allow/deny,
  filling the backend's e2e 401-vs-422 gap.
- **Phase 5:** Wire new suites (subcategory, team_member) + the UI runner into the dashboard control panel
  (add catalog entries + buttons).

## OPEN DECISIONS (asked in the doc)
1. Confirm phase order (Stagehand first?). 2. Start Stagehand on Groq (free)? 3. Multi-company env:
need a 2-company user token on the preview OR the branch merged to sec-api. 4. Build both flagship
API suites or one first?

## Guardrails (absolute)
Read-only vs live (SELECTs only); create only `QA_Platform_*`/`API_Test_*` sandbox records; never flip
a live flag; PRs from local git only (no checkout/pull/fetch/push).
