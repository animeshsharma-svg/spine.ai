# 22. Admin & Configuration (MOD-10) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Admin & Configuration module overview
Admin & Configuration (MOD-10) is a Platform module of Procol, in the "Platform & admin" stage of the procurement lifecycle.
Description: Tenant settings, user management, org structure, roles, and feature toggles
Business purpose: Give tenant admins control over their instance — org hierarchy, user roles, feature flags, and integration setup
Default state: Enabled
Plan availability: All Plans
Key integrations: SSO/SAML, SCIM, HRMS
Registry status: GA
Features: 8 (8 GA). Test cases: test-cases/product-22-admin-and-configuration.md, group PRD-ADM.

## Admin & Configuration features

8 features in 2 categories: Optional, Core.

### FEAT-ADM-001 — SSO Authentication
SSO Authentication is a Optional feature of Admin & Configuration (MOD-10). Persona: Tenant Admin. Plan: Enterprise. Status: GA.
User story: As a tenant admin, I want single sign-on, so that users authenticate via our corporate identity securely.
Business use case: Users sign in via corporate SSO; the platform stores and uses the SSO payload.
Why it exists: Enterprise security and convenience.
Test cases: PRD-ADM-011 … PRD-ADM-013 (3).

### FEAT-ADM-002 — Template Management & Versioning
Template Management & Versioning is a Core feature of Admin & Configuration (MOD-10). Persona: Tenant Admin. Plan: Enterprise. Status: GA.
User story: As a tenant admin, I want template versioning and UAT-to-PROD promotion, so that I can evolve configurations safely.
Business use case: Admins manage templates with versioning/revert and promote them from UAT to PROD.
Why it exists: Safe configuration lifecycle.
Test cases: PRD-ADM-001 … PRD-ADM-003 (3).

### FEAT-ADM-003 — Platform-Wide Activity & Audit Log
Platform-Wide Activity & Audit Log is a Core feature of Admin & Configuration (MOD-10). Persona: Auditor. Plan: All Plans. Status: GA.
User story: As an auditor, I want a complete platform-wide activity log, so that I can trace any action.
Business use case: Auditors trace any action via the platform-wide activity/audit log, including project-level and live-event changes.
Why it exists: Compliance and traceability.
Test cases: PRD-ADM-004 … PRD-ADM-005 (2).

### FEAT-ADM-004 — Data-Visibility Scoping
Data-Visibility Scoping is a Optional feature of Admin & Configuration (MOD-10). Persona: Tenant Admin. Plan: Enterprise. Status: GA.
User story: As a tenant admin, I want to scope what users can see, so that access stays need-to-know.
Business use case: Admins scope user visibility (e.g., own-requests-only, hide others' events).
Why it exists: Need-to-know data access.
Test cases: PRD-ADM-014 … PRD-ADM-016 (3).

### FEAT-ADM-005 — Intake vs Event-Creation User Separation
Intake vs Event-Creation User Separation is a Optional feature of Admin & Configuration (MOD-10). Persona: Tenant Admin. Plan: Enterprise. Status: GA.
User story: As a tenant admin, I want separate intake and event-creation roles, so that I can enforce separation of duties.
Business use case: Admins separate Intake and Event-Creation roles to enforce separation of duties.
Why it exists: Separation of duties.
Test cases: PRD-ADM-017 … PRD-ADM-019 (3).

### FEAT-ADM-006 — User Tagging
User Tagging is a Optional feature of Admin & Configuration (MOD-10). Persona: Tenant Admin. Plan: Growth, Enterprise. Status: GA.
User story: As a tenant admin, I want to tag users, so that I can group and filter them flexibly.
Business use case: Admins tag users to group, map, and filter them.
Why it exists: Flexible user management.
Test cases: PRD-ADM-020 … PRD-ADM-022 (3).

### FEAT-ADM-007 — User Inactivation
User Inactivation is a Core feature of Admin & Configuration (MOD-10). Persona: Tenant Admin. Plan: All Plans. Status: GA.
User story: As a tenant admin, I want to inactivate users, so that departed staff lose access.
Business use case: Admins inactivate users so departed staff lose access.
Why it exists: Access hygiene.
Test cases: PRD-ADM-006 … PRD-ADM-007 (2).

### FEAT-ADM-008 — Role-Based Data Restrictions
Role-Based Data Restrictions is a Core feature of Admin & Configuration (MOD-10). Persona: Tenant Admin. Plan: Enterprise. Status: GA.
User story: As an admin, I want vendor data, downloads, and deletion restricted by role, so that sensitive actions stay with authorized users.
Business use case: Admins restrict vendor data, downloads, and deletion by role (e.g., master downloads to super admin).
Why it exists: Data protection.
Test cases: PRD-ADM-008 … PRD-ADM-010 (3).

## Admin & Configuration integrations

### INT-003 — SSO / SAML 2.0 integration
External integration for Admin & Configuration (MOD-10).
Type: Inbound
Trigger: User login attempt on Procol
Data exchanged: User identity: email, name, roles, department, entity from IdP
Key config parameters: sso.provider (Okta/Azure AD/ADFS), sso.entity_id, sso.sso_url, sso.certificate, sso.role_mapping
Auth: SAML 2.0
Tenant-configurable: Yes
Required for module: No (optional)
Failure handling: Falls back to Procol-native login if SSO fails; admin alerted; SSO errors logged
Status: GA

### INT-004 — SCIM 2.0 (HRMS Sync) integration
External integration for Admin & Configuration (MOD-10).
Type: Inbound
Trigger: User created/updated/deprovisioned in HRMS (Workday, SAP HCM, etc.)
Data exchanged: User profile: name, email, department, designation, reporting manager, status
Key config parameters: scim.base_url, scim.bearer_token, scim.attribute_mapping, scim.deprovision_action (Deactivate/Delete)
Auth: Bearer Token
Tenant-configurable: Yes
Required for module: No (Enterprise only)
Config dependencies: FF-005
Failure handling: Failed SCIM events are queued and retried; admin dashboard shows sync errors
Status: Active
Notes: Requires FF-005 (SCIM Provisioning) to be enabled

## Admin & Configuration configuration dependencies

### DEP-005 — SCIM User Provisioning depends on SSO Configuration
Configuration dependency (Recommended): FF-005 depends on CONF-ADM-001.
Condition: SCIM is typically deployed alongside SSO
Impact if missing or misconfigured: SCIM without SSO is valid but unusual; users will be auto-provisioned but still use password login unless SSO is also configured
Guidance: Always validate SSO config before enabling SCIM to avoid orphaned provisioned accounts
Note: FF-005 and CONF-ADM-001 is not defined anywhere else in the workbook.
