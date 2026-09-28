# Product test cases — 22. Admin & Configuration (MOD-10)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-10 · 8 features · 32 cases · group `PRD-ADM` · plan availability: All Plans · status: GA

Tenant settings, user management, org structure, roles, and feature toggles. Give tenant admins control over their instance — org hierarchy, user roles, feature flags, and integration setup.

## 1. Core features

#### PRD-ADM-001 — Template Management & Versioning: happy path for the Tenant Admin

- **Why it matters.** Safe configuration lifecycle. Business use: Admins manage templates with versioning/revert and promote them from UAT to PROD.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Admin & Configuration.
  2. Use Template Management & Versioning to get what the story asks for: template versioning and UAT-to-PROD promotion.
  3. Follow the business scenario the workbook gives: "Admins manage templates with versioning/revert and promote them from UAT to PROD".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: evolve configurations safely. The business use case is served: admins manage templates with versioning/revert and promote them from UAT to PROD.
- **Oracle.** Observable proof that Template Management & Versioning did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ADM-002.
- **Trace.** P0 · manual · `FEAT-ADM-002` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-002 — Template Management & Versioning: not available on the Growth plan

- **Why it matters.** The workbook limits Template Management & Versioning to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Template Management & Versioning to get template versioning and UAT-to-PROD promotion.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-ADM-002` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-003 — Template Management & Versioning: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Template Management & Versioning. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Template Management & Versioning to get template versioning and UAT-to-PROD promotion.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-ADM-002` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-004 — Platform-Wide Activity & Audit Log: happy path for the Auditor

- **Why it matters.** Compliance and traceability. Business use: Auditors trace any action via the platform-wide activity/audit log, including project-level and live-event changes.
- **Setup.**
  Persona: Auditor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as an Auditor on the tenant described in Setup and open Admin & Configuration.
  2. Use Platform-Wide Activity & Audit Log to get what the story asks for: a complete platform-wide activity log.
  3. Follow the business scenario the workbook gives: "Auditors trace any action via the platform-wide activity/audit log, including project-level and live-event changes".
  4. Check the result against the story's promised outcome.
- **Expected.** The Auditor achieves the story's outcome: trace any action. The business use case is served: auditors trace any action via the platform-wide activity/audit log, including project-level and live-event changes.
- **Oracle.** Observable proof that Platform-Wide Activity & Audit Log did its job for the Auditor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ADM-003.
- **Trace.** P0 · manual · `FEAT-ADM-003` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-005 — Platform-Wide Activity & Audit Log: refused for a user without the Auditor role

- **Why it matters.** The workbook names Auditor as the user of Platform-Wide Activity & Audit Log. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Auditor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Platform-Wide Activity & Audit Log to get a complete platform-wide activity log.
  3. Repeat as an Auditor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Auditor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Auditor.
- **Trace.** P1 · automate-later · `FEAT-ADM-003` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-006 — User Inactivation: happy path for the Tenant Admin

- **Why it matters.** Access hygiene. Business use: Admins inactivate users so departed staff lose access.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Admin & Configuration.
  2. Inactivate users.
  3. Follow the business scenario the workbook gives: "Admins inactivate users so departed staff lose access".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: departed staff lose access. The business use case is served: admins inactivate users so departed staff lose access.
- **Oracle.** Observable proof that User Inactivation did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ADM-007.
- **Trace.** P0 · manual · `FEAT-ADM-007` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-007 — User Inactivation: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of User Inactivation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use User Inactivation to inactivate users.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-ADM-007` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-008 — Role-Based Data Restrictions: happy path for the Tenant Admin

- **Why it matters.** Data protection. Business use: Admins restrict vendor data, downloads, and deletion by role (e.g., master downloads to super admin).
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Admin & Configuration.
  2. Use Role-Based Data Restrictions to get what the story asks for: vendor data, downloads, and deletion restricted by role.
  3. Follow the business scenario the workbook gives: "Admins restrict vendor data, downloads, and deletion by role (e.g., master downloads to super admin)".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: sensitive actions stay with authorized users. The business use case is served: admins restrict vendor data, downloads, and deletion by role (e.g., master downloads to super admin).
- **Oracle.** Observable proof that Role-Based Data Restrictions did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ADM-008.
- **Trace.** P0 · manual · `FEAT-ADM-008` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-009 — Role-Based Data Restrictions: not available on the Growth plan

- **Why it matters.** The workbook limits Role-Based Data Restrictions to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Role-Based Data Restrictions to get vendor data, downloads, and deletion restricted by role.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-ADM-008` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-010 — Role-Based Data Restrictions: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Role-Based Data Restrictions. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Role-Based Data Restrictions to get vendor data, downloads, and deletion restricted by role.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-ADM-008` · workbook sheet "22. Admin & Configuration"

## 2. Optional features

#### PRD-ADM-011 — SSO Authentication: happy path for the Tenant Admin

- **Why it matters.** Enterprise security and convenience. Business use: Users sign in via corporate SSO; the platform stores and uses the SSO payload.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Admin & Configuration.
  2. Use SSO Authentication to get what the story asks for: single sign-on.
  3. Follow the business scenario the workbook gives: "Users sign in via corporate SSO; the platform stores and uses the SSO payload".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: users authenticate via the organisation's corporate identity securely. The business use case is served: users sign in via corporate SSO; the platform stores and uses the SSO payload.
- **Oracle.** Observable proof that SSO Authentication did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ADM-001.
- **Trace.** P1 · manual · `FEAT-ADM-001` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-012 — SSO Authentication: not available on the Growth plan

- **Why it matters.** The workbook limits SSO Authentication to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use SSO Authentication to get single sign-on.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-ADM-001` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-013 — SSO Authentication: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of SSO Authentication. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use SSO Authentication to get single sign-on.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-ADM-001` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-014 — Data-Visibility Scoping: happy path for the Tenant Admin

- **Why it matters.** Need-to-know data access. Business use: Admins scope user visibility (e.g., own-requests-only, hide others' events).
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Admin & Configuration.
  2. Scope what users can see.
  3. Follow the business scenario the workbook gives: "Admins scope user visibility (e.g., own-requests-only, hide others' events)".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: access stays need-to-know. The business use case is served: admins scope user visibility (e.g., own-requests-only, hide others' events).
- **Oracle.** Observable proof that Data-Visibility Scoping did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ADM-004.
- **Trace.** P1 · manual · `FEAT-ADM-004` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-015 — Data-Visibility Scoping: not available on the Growth plan

- **Why it matters.** The workbook limits Data-Visibility Scoping to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Data-Visibility Scoping to scope what users can see.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-ADM-004` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-016 — Data-Visibility Scoping: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Data-Visibility Scoping. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Data-Visibility Scoping to scope what users can see.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-ADM-004` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-017 — Intake vs Event-Creation User Separation: happy path for the Tenant Admin

- **Why it matters.** Separation of duties. Business use: Admins separate Intake and Event-Creation roles to enforce separation of duties.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Admin & Configuration.
  2. Use Intake vs Event-Creation User Separation to get what the story asks for: separate intake and event-creation roles.
  3. Follow the business scenario the workbook gives: "Admins separate Intake and Event-Creation roles to enforce separation of duties".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: enforce separation of duties. The business use case is served: admins separate Intake and Event-Creation roles to enforce separation of duties.
- **Oracle.** Observable proof that Intake vs Event-Creation User Separation did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ADM-005.
- **Trace.** P1 · manual · `FEAT-ADM-005` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-018 — Intake vs Event-Creation User Separation: not available on the Growth plan

- **Why it matters.** The workbook limits Intake vs Event-Creation User Separation to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Intake vs Event-Creation User Separation to get separate intake and event-creation roles.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-ADM-005` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-019 — Intake vs Event-Creation User Separation: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Intake vs Event-Creation User Separation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Intake vs Event-Creation User Separation to get separate intake and event-creation roles.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-ADM-005` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-020 — User Tagging: happy path for the Tenant Admin

- **Why it matters.** Flexible user management. Business use: Admins tag users to group, map, and filter them.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Admin & Configuration.
  2. Tag users.
  3. Follow the business scenario the workbook gives: "Admins tag users to group, map, and filter them".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: group and filter them flexibly. The business use case is served: admins tag users to group, map, and filter them.
- **Oracle.** Observable proof that User Tagging did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ADM-006.
- **Trace.** P1 · manual · `FEAT-ADM-006` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-021 — User Tagging: not available on plans below Growth

- **Why it matters.** The workbook limits User Tagging to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use User Tagging to tag users.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-ADM-006` · workbook sheet "22. Admin & Configuration"

#### PRD-ADM-022 — User Tagging: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of User Tagging. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use User Tagging to tag users.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-ADM-006` · workbook sheet "22. Admin & Configuration"

## 3. Integrations

#### PRD-ADM-023 — SSO / SAML 2.0: user login attempt on Procol

- **Why it matters.** Required for the module: No (optional).
- **Setup.**
  Integration INT-003 "SSO / SAML 2.0" (Inbound) configured on the tenant; key parameters: sso.provider (Okta/Azure AD/ADFS), sso.entity_id, sso.sso_url, sso.certificate, sso.role_mapping.
  Auth: SAML 2.0.
- **Steps.**
  1. Make sure the integration is configured as in Setup.
  2. Cause the trigger: user login attempt on Procol.
  3. Compare the data on both sides.
- **Expected.** The integration runs for this trigger and exchanges: User identity: email, name, roles, department, entity from IdP.
- **Oracle.** The listed fields match in Procol and the external system after the sync, with no error recorded for the integration.
- **Trace.** P1 · automate-later · `INT-003` · workbook sheet "28. Integration Catalog"

#### PRD-ADM-024 — SSO / SAML 2.0: on failure — falls back to Procol-native login if SSO fails

- **Why it matters.** The Integration Catalog states how SSO / SAML 2.0 must fail: "Falls back to Procol-native login if SSO fails; admin alerted; SSO errors logged". A silent failure leaves the two systems out of step with nobody told.
- **Setup.**
  Integration INT-003 "SSO / SAML 2.0" (Inbound) configured on the tenant; key parameters: sso.provider (Okta/Azure AD/ADFS), sso.entity_id, sso.sso_url, sso.certificate, sso.role_mapping.
  Auth: SAML 2.0.
- **Steps.**
  1. Configure the integration as in Setup.
  2. Make the external side fail or be unreachable.
  3. Cause the trigger: user login attempt on Procol.
- **Expected.** The stated failure handling happens: falls back to Procol-native login if SSO fails.
- **Oracle.** Evidence of exactly this handling is visible (state, alert, log or retry record as named) and nothing is silently dropped.
- **Trace.** P2 · automate-later · `INT-003` · workbook sheet "28. Integration Catalog"

#### PRD-ADM-025 — SSO / SAML 2.0: on failure — admin alerted

- **Why it matters.** The Integration Catalog states how SSO / SAML 2.0 must fail: "Falls back to Procol-native login if SSO fails; admin alerted; SSO errors logged". A silent failure leaves the two systems out of step with nobody told.
- **Setup.**
  Integration INT-003 "SSO / SAML 2.0" (Inbound) configured on the tenant; key parameters: sso.provider (Okta/Azure AD/ADFS), sso.entity_id, sso.sso_url, sso.certificate, sso.role_mapping.
  Auth: SAML 2.0.
- **Steps.**
  1. Configure the integration as in Setup.
  2. Make the external side fail or be unreachable.
  3. Cause the trigger: user login attempt on Procol.
- **Expected.** The stated failure handling happens: admin alerted.
- **Oracle.** Evidence of exactly this handling is visible (state, alert, log or retry record as named) and nothing is silently dropped.
- **Trace.** P2 · automate-later · `INT-003` · workbook sheet "28. Integration Catalog"

#### PRD-ADM-026 — SSO / SAML 2.0: on failure — SSO errors logged

- **Why it matters.** The Integration Catalog states how SSO / SAML 2.0 must fail: "Falls back to Procol-native login if SSO fails; admin alerted; SSO errors logged". A silent failure leaves the two systems out of step with nobody told.
- **Setup.**
  Integration INT-003 "SSO / SAML 2.0" (Inbound) configured on the tenant; key parameters: sso.provider (Okta/Azure AD/ADFS), sso.entity_id, sso.sso_url, sso.certificate, sso.role_mapping.
  Auth: SAML 2.0.
- **Steps.**
  1. Configure the integration as in Setup.
  2. Make the external side fail or be unreachable.
  3. Cause the trigger: user login attempt on Procol.
- **Expected.** The stated failure handling happens: SSO errors logged.
- **Oracle.** Evidence of exactly this handling is visible (state, alert, log or retry record as named) and nothing is silently dropped.
- **Trace.** P2 · automate-later · `INT-003` · workbook sheet "28. Integration Catalog"

#### PRD-ADM-027 — SCIM 2.0 (HRMS Sync): user created/updated/deprovisioned in HRMS (Workday, SAP HCM, etc.)

- **Why it matters.** Requires FF-005 (SCIM Provisioning) to be enabled. Required for the module: No (Enterprise only).
- **Setup.**
  Integration INT-004 "SCIM 2.0 (HRMS Sync)" (Inbound) configured on the tenant; key parameters: scim.base_url, scim.bearer_token, scim.attribute_mapping, scim.deprovision_action (Deactivate/Delete).
  Auth: Bearer Token.
  Config dependencies (workbook): FF-005.
- **Steps.**
  1. Make sure the integration is configured as in Setup.
  2. Cause the trigger: user created/updated/deprovisioned in HRMS (Workday, SAP HCM, etc.).
  3. Compare the data on both sides.
- **Expected.** The integration runs for this trigger and exchanges: User profile: name, email, department, designation, reporting manager, status.
- **Oracle.** The listed fields match in Procol and the external system after the sync, with no error recorded for the integration.
- **Trace.** P1 · automate-later · `INT-004` · `FF-005` · workbook sheet "28. Integration Catalog"

#### PRD-ADM-028 — SCIM 2.0 (HRMS Sync): on failure — failed SCIM events are queued and retried

- **Why it matters.** The Integration Catalog states how SCIM 2.0 (HRMS Sync) must fail: "Failed SCIM events are queued and retried; admin dashboard shows sync errors". A silent failure leaves the two systems out of step with nobody told.
- **Setup.**
  Integration INT-004 "SCIM 2.0 (HRMS Sync)" (Inbound) configured on the tenant; key parameters: scim.base_url, scim.bearer_token, scim.attribute_mapping, scim.deprovision_action (Deactivate/Delete).
  Auth: Bearer Token.
  Config dependencies (workbook): FF-005.
- **Steps.**
  1. Configure the integration as in Setup.
  2. Make the external side fail or be unreachable.
  3. Cause the trigger: user created/updated/deprovisioned in HRMS (Workday, SAP HCM, etc.).
- **Expected.** The stated failure handling happens: failed SCIM events are queued and retried.
- **Oracle.** Evidence of exactly this handling is visible (state, alert, log or retry record as named) and nothing is silently dropped.
- **Trace.** P2 · automate-later · `INT-004` · `FF-005` · workbook sheet "28. Integration Catalog"

#### PRD-ADM-029 — SCIM 2.0 (HRMS Sync): on failure — admin dashboard shows sync errors

- **Why it matters.** The Integration Catalog states how SCIM 2.0 (HRMS Sync) must fail: "Failed SCIM events are queued and retried; admin dashboard shows sync errors". A silent failure leaves the two systems out of step with nobody told.
- **Setup.**
  Integration INT-004 "SCIM 2.0 (HRMS Sync)" (Inbound) configured on the tenant; key parameters: scim.base_url, scim.bearer_token, scim.attribute_mapping, scim.deprovision_action (Deactivate/Delete).
  Auth: Bearer Token.
  Config dependencies (workbook): FF-005.
- **Steps.**
  1. Configure the integration as in Setup.
  2. Make the external side fail or be unreachable.
  3. Cause the trigger: user created/updated/deprovisioned in HRMS (Workday, SAP HCM, etc.).
- **Expected.** The stated failure handling happens: admin dashboard shows sync errors.
- **Oracle.** Evidence of exactly this handling is visible (state, alert, log or retry record as named) and nothing is silently dropped.
- **Trace.** P2 · automate-later · `INT-004` · `FF-005` · workbook sheet "28. Integration Catalog"

#### PRD-ADM-030 — SCIM 2.0 (HRMS Sync): inactive while FF-005 is not enabled

- **Why it matters.** The Integration Catalog says: "Requires FF-005 (SCIM Provisioning) to be enabled".
- **Setup.**
  Integration INT-004 "SCIM 2.0 (HRMS Sync)" (Inbound) configured on the tenant; key parameters: scim.base_url, scim.bearer_token, scim.attribute_mapping, scim.deprovision_action (Deactivate/Delete).
  Auth: Bearer Token.
  Config dependencies (workbook): FF-005.
  FF-005 NOT enabled (this id is not defined in the workbook's flag/config sheets).
- **Steps.**
  1. Leave FF-005 disabled.
  2. Cause the trigger: user created/updated/deprovisioned in HRMS (Workday, SAP HCM, etc.).
  3. Then enable FF-005 and repeat.
- **Expected.** Nothing is exchanged while FF-005 is disabled; after enabling it the integration runs.
- **Oracle.** No sync activity for the first trigger; normal sync for the second.
- **Trace.** P1 · automate-later · `INT-004` · `FF-005` · workbook sheet "28. Integration Catalog"

## 4. Configuration dependencies

#### PRD-ADM-031 — SCIM User Provisioning with SSO Configuration correctly configured (DEP-005)

- **Why it matters.** SCIM User Provisioning depends on SSO Configuration. Always validate SSO config before enabling SCIM to avoid orphaned provisioned accounts.
- **Setup.**
  Source: FF-005 "SCIM User Provisioning".
  Depends on: CONF-ADM-001 "SSO Configuration" (Recommended).
  Workbook guidance: Always validate SSO config before enabling SCIM to avoid orphaned provisioned accounts.
  SSO Configuration configured correctly.
- **Steps.**
  1. Configure SSO Configuration (CONF-ADM-001) correctly.
  2. Configure SCIM User Provisioning (FF-005).
  3. Exercise the behaviour SCIM User Provisioning controls.
- **Expected.** SCIM User Provisioning works as configured; none of the stated failure impact occurs.
- **Oracle.** The impact named in the missing-dependency case (DEP-005) is absent.
- **Trace.** P1 · automate-later · `DEP-005` · `FF-005` · `CONF-ADM-001` · workbook sheet "29. Config Dependencies"

#### PRD-ADM-032 — SCIM User Provisioning with SSO Configuration missing or misconfigured (DEP-005)

- **Why it matters.** The workbook states the impact: "SCIM without SSO is valid but unusual; users will be auto-provisioned but still use password login unless SSO is also configured".
- **Setup.**
  Source: FF-005 "SCIM User Provisioning".
  Depends on: CONF-ADM-001 "SSO Configuration" (Recommended).
  Workbook guidance: Always validate SSO config before enabling SCIM to avoid orphaned provisioned accounts.
  SSO Configuration missing or misconfigured.
- **Steps.**
  1. Leave SSO Configuration (CONF-ADM-001) missing or misconfigured.
  2. Configure SCIM User Provisioning (FF-005).
  3. Exercise the behaviour SCIM User Provisioning controls.
- **Expected.** The stated impact appears: SCIM without SSO is valid but unusual; users will be auto-provisioned but still use password login unless SSO is also configured. (The dependency is Recommended, not Required — this is valid but should be visible to the admin.)
- **Oracle.** The consequence named in Expected can be observed; if Procol instead prevents the misconfiguration up front, record that as the actual (safer) behaviour.
- **Trace.** P1 · automate-later · `DEP-005` · `FF-005` · `CONF-ADM-001` · workbook sheet "29. Config Dependencies"
