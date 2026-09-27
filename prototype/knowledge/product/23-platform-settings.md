# 23. Platform Settings (MOD-25) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Platform Settings module overview
Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25) is a Procure-to-Pay (P2P) module of Procol, in the "Platform & admin" stage of the procurement lifecycle.
Description: Downstream platform configuration — approvals, access, cost centers and analytics.
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP
Registry status: GA
Roadmap notes: Imported from downstream P2P feature list (PM).
Features: 23 (8 GA (Already in Procol), 15 Roadmap (Suggested — not in product yet)). Test cases: test-cases/product-23-platform-settings.md, group PRD-PLT.

## Platform Settings features

23 features in 4 categories: Core, Reporting, Compliance, Integration.

### FEAT-PLT-001 — Configurable Multi-Level Approval Workflow
Configurable Multi-Level Approval Workflow is a Core feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: Tenant Admin. Plan: All Plans. Status: GA (Already in Procol).
User story: As a tenant admin, I want to configure multi-level approval chains per module and value band, so that spend controls match our organization's authority structure.
Business use case: Approval matrix (levels, approvers, value bands) is configured per module — PR, PO, invoice, notes, contracts.
Why it exists: Centralizes spend-control logic instead of hardcoding it per module.
Edge cases / notes: Chains can vary by category, entity, and value simultaneously.
Test cases: PRD-PLT-001 … PRD-PLT-003 (3).

### FEAT-PLT-002 — Role-Based Access Control (RBAC)
Role-Based Access Control (RBAC) is a Core feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: Tenant Admin. Plan: All Plans. Status: GA (Already in Procol).
User story: As a tenant admin, I want to assign permissions by role, so that users only see and act on what their role requires.
Business use case: Roles (buyer, approver, AP, QC, admin) map to a defined set of module and action permissions.
Why it exists: Enforces least-privilege access across the platform.
Edge cases / notes: Custom roles beyond the default set are supported.
Test cases: PRD-PLT-004 … PRD-PLT-006 (3).

### FEAT-PLT-003 — Cost Center Master & Hierarchy Mapping
Cost Center Master & Hierarchy Mapping is a Core feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: Tenant Admin. Plan: All Plans. Status: GA (Already in Procol).
User story: As a tenant admin, I want to maintain a cost center master with hierarchy, so that spend is attributable to the right business unit.
Business use case: Cost centers are set up with parent-child hierarchy and mapped to users/categories for spend attribution.
Why it exists: Foundation for budget control and financial reporting by unit.
Edge cases / notes: Hierarchy depth and structure are tenant-configurable.
Test cases: PRD-PLT-007 … PRD-PLT-009 (3).

### FEAT-PLT-004 — Real-Time Dashboard Widgets
Real-Time Dashboard Widgets is a Reporting feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: All Users. Plan: Growth, Enterprise. Status: GA (Already in Procol).
User story: As a user, I want real-time widgets on every dashboard, so that I see current status without running a report.
Business use case: Live widgets (pending approvals, open POs, invoice aging, budget status) surface on each module's landing dashboard.
Why it exists: Gives at-a-glance visibility without navigating to full reports.
Edge cases / notes: Widget set is configurable per role.
Test cases: PRD-PLT-018 … PRD-PLT-020 (3).

### FEAT-PLT-005 — Custom Report Builder
Custom Report Builder is a Reporting feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: Procurement Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a procurement manager, I want to build custom reports from any module's data, so that I'm not limited to pre-built reports.
Business use case: Users select fields, filters, and groupings across modules to build ad-hoc reports.
Why it exists: Covers reporting needs standard reports don't anticipate.
Edge cases / notes: Saved custom reports can be scheduled and shared.
Test cases: PRD-PLT-025 … PRD-PLT-028 (4).

### FEAT-PLT-006 — Module-Wise Reporting
Module-Wise Reporting is a Reporting feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: All Users. Plan: All Plans. Status: GA (Already in Procol).
User story: As a user, I want each module to have its own dedicated reporting section, so that module-specific data isn't buried in a generic report.
Business use case: PO, Invoice, GRN, QC, and other modules each expose their own report set.
Why it exists: Keeps reporting close to the data users already work with.
Edge cases / notes: Consistent filter/export UX is maintained across all module reports.
Test cases: PRD-PLT-021 … PRD-PLT-022 (2).

### FEAT-PLT-007 — Filter & Sort on Reports/Listings
Filter & Sort on Reports/Listings is a Reporting feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: All Users. Plan: All Plans. Status: GA (Already in Procol).
User story: As a user, I want to filter and sort any listing or report, so that I can quickly find the records relevant to me.
Business use case: Standard filter and sort controls are available on every list view and report across the platform.
Why it exists: Baseline usability expectation for any data-heavy platform.
Edge cases / notes: Filter sets are contextual per module.
Test cases: PRD-PLT-023 … PRD-PLT-024 (2).

### FEAT-PLT-008 — Approval Delegation / Out-of-Office Auto-Reassignment
Approval Delegation / Out-of-Office Auto-Reassignment is a Core feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: Approver. Plan: Enterprise. Status: GA (Already in Procol).
User story: As an approver, I want my pending approvals to auto-reassign when I'm out of office, so that approvals don't stall in my absence.
Business use case: Approver sets an OOO period; pending and new approvals route to a designated delegate automatically.
Why it exists: Prevents approval-chain bottlenecks caused by approver unavailability.
Edge cases / notes: Delegate should have the same authority level, not a broader one, by default.
Test cases: PRD-PLT-010 … PRD-PLT-013 (4).

### FEAT-PLT-009 — Approval Escalation on SLA Breach
Approval Escalation on SLA Breach is a Core feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: Tenant Admin. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a tenant admin, I want approvals pending beyond an SLA to escalate automatically, so that nothing stalls indefinitely.
Business use case: An approval untouched beyond a configured time auto-escalates to the next level or a designated escalation contact.
Why it exists: Keeps the approval chain moving without manual chasing.
Edge cases / notes: SLA duration configurable per module/approval level.
Test cases: PRD-PLT-029 … PRD-PLT-032 (4).

### FEAT-PLT-010 — Approval Audit Trail & E-Signature Log
Approval Audit Trail & E-Signature Log is a Compliance feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: Tenant Admin. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a tenant admin, I want a full audit trail of every approval action with timestamp and identity, so that we can demonstrate compliance in an audit.
Business use case: Every approve/reject/delegate action is logged immutably with actor, timestamp, and comments.
Why it exists: Provides the audit evidence regulators and internal audit expect.
Edge cases / notes: Log should be exportable and tamper-evident.
Test cases: PRD-PLT-033 … PRD-PLT-036 (4).

### FEAT-PLT-011 — SSO/SAML & SCIM User Provisioning
SSO/SAML & SCIM User Provisioning is a Integration feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: Tenant Admin. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a tenant admin, I want users provisioned via SSO/SAML and SCIM, so that access is managed centrally through our identity provider.
Business use case: User login and lifecycle (create/deactivate) sync automatically with the tenant's IdP.
Why it exists: Removes manual user administration and improves access security.
Edge cases / notes: De-provisioning on the IdP side should immediately revoke platform access.
Test cases: PRD-PLT-037 … PRD-PLT-040 (4).

### FEAT-PLT-012 — Granular Field-Level Permissions
Granular Field-Level Permissions is a Core feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: Tenant Admin. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a tenant admin, I want to control visibility/edit rights at the field level, not just the module level, so that sensitive fields (e.g., pricing) are restricted appropriately.
Business use case: Specific fields (cost, margin, vendor bank details) can be hidden or made read-only per role.
Why it exists: Supports least-privilege access even within a shared screen/module.
Edge cases / notes: Should not conflict with audit-trail visibility requirements.
Test cases: PRD-PLT-041 … PRD-PLT-044 (4).

### FEAT-PLT-013 — User Activity / Audit Log
User Activity / Audit Log is a Compliance feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: Tenant Admin. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a tenant admin, I want a log of user activity across the platform, so that I can investigate anomalies or disputes.
Business use case: Login, view, edit, and export actions are logged per user across modules.
Why it exists: Security and compliance visibility into platform usage.
Edge cases / notes: Retention period for logs should be configurable to meet compliance needs.
Test cases: PRD-PLT-014 … PRD-PLT-017 (4).

### FEAT-PLT-014 — IP / Geo Access Restrictions
IP / Geo Access Restrictions is a Compliance feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: Tenant Admin. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a tenant admin, I want to restrict platform access by IP range or geography, so that access aligns with our security policy.
Business use case: Login is blocked or flagged outside configured IP ranges/regions.
Why it exists: Adds a network-level security control on top of RBAC.
Edge cases / notes: Should have a break-glass exception process for legitimate travel/remote cases.
Test cases: PRD-PLT-045 … PRD-PLT-048 (4).

### FEAT-PLT-015 — Cost Center–to–GL Code Cross-Mapping
Cost Center–to–GL Code Cross-Mapping is a Core feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: Finance Controller. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a finance controller, I want cost centers mapped to GL codes, so that transactions post to the correct account automatically.
Business use case: Each cost center carries a default GL mapping used during accounting postings (accruals, invoices, notes).
Why it exists: Removes manual GL coding at the point of financial posting.
Edge cases / notes: Should support multiple GL mappings per cost center by transaction type.
Test cases: PRD-PLT-049 … PRD-PLT-052 (4).

### FEAT-PLT-016 — Multi-Entity Cost Center Consolidation
Multi-Entity Cost Center Consolidation is a Reporting feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: Finance Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a finance manager, I want to view cost center spend consolidated across entities, so that group-level reporting doesn't require manual aggregation.
Business use case: Spend across legal entities rolls up into a consolidated cost-center view for group finance.
Why it exists: Supports multi-entity organizations without manual Excel consolidation.
Edge cases / notes: Currency conversion needs to be handled consistently in consolidation.
Test cases: PRD-PLT-053 … PRD-PLT-056 (4).

### FEAT-PLT-017 — AI-Powered Spend Insights
AI-Powered Spend Insights is a Reporting feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: Category Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a category manager, I want AI-generated insights on spend patterns, so that savings opportunities and anomalies surface without manual analysis.
Business use case: System surfaces trends, maverick spend, and consolidation opportunities from historical transaction data.
Why it exists: Turns raw transaction data into actionable procurement insight.
Edge cases / notes: Already flagged on the broader Analytics module roadmap.
Test cases: PRD-PLT-057 … PRD-PLT-059 (3).

### FEAT-PLT-018 — Scheduled Report Email Delivery
Scheduled Report Email Delivery is a Reporting feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: All Users. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a user, I want reports emailed to me on a schedule, so that I don't have to log in to check the same report every week.
Business use case: Any custom or standard report can be scheduled for recurring email delivery in Excel/PDF.
Why it exists: Pushes information to users instead of requiring them to pull it.
Edge cases / notes: Should respect the same RBAC/field-level permissions as the live report.
Test cases: PRD-PLT-060 … PRD-PLT-062 (3).

### FEAT-PLT-019 — Role-Based Dashboard Views
Role-Based Dashboard Views is a Core feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: All Users. Plan: Growth, Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a user, I want my dashboard to show widgets relevant to my role by default, so that I'm not sifting through irrelevant data.
Business use case: Default dashboard layout varies by persona (buyer, approver, finance, admin) out of the box.
Why it exists: Reduces cognitive load by surfacing only what's relevant per role.
Edge cases / notes: Users should still be able to customize beyond the role default.
Test cases: PRD-PLT-063 … PRD-PLT-065 (3).

### FEAT-PLT-020 — Data Export (Excel / PDF / API)
Data Export (Excel / PDF / API) is a Core feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: All Users. Plan: All Plans. Status: Roadmap (Suggested — not in product yet).
User story: As a user, I want to export any report or listing to Excel, PDF, or via API, so that data can be used outside the platform when needed.
Business use case: Standard export options are available consistently across modules and reports.
Why it exists: Baseline interoperability expectation for enterprise software.
Edge cases / notes: API export should respect the same RBAC as UI export.
Test cases: PRD-PLT-066 … PRD-PLT-067 (2).

### FEAT-PLT-021 — Tenant-Level Feature Flag Management
Tenant-Level Feature Flag Management is a Core feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: Tenant Admin. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a tenant admin, I want visibility into which feature flags are enabled for my tenant, so that I understand what's active without contacting support.
Business use case: Admin-facing view of enabled/disabled flags relevant to the tenant's plan.
Why it exists: Improves transparency for admins managing their own instance.
Edge cases / notes: Some flags may remain engineering-only if they carry technical risk.
Test cases: PRD-PLT-068 … PRD-PLT-071 (4).

### FEAT-PLT-022 — Multi-Entity / Multi-Org Configuration
Multi-Entity / Multi-Org Configuration is a Core feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: Tenant Admin. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a tenant admin, I want to configure multiple legal entities or business units within one tenant, so that a single Procol instance serves our whole group.
Business use case: Entities have their own numbering series, approval chains, and cost centers within one shared tenant.
Why it exists: Supports group/holding-company structures without separate tenants per entity.
Edge cases / notes: Cross-entity reporting must still be possible for group finance.
Test cases: PRD-PLT-072 … PRD-PLT-075 (4).

### FEAT-PLT-023 — Notification Preference Center (Email/SMS/WhatsApp)
Notification Preference Center (Email/SMS/WhatsApp) is a Core feature of Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25). Persona: All Users. Plan: Growth, Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a user, I want to choose how I'm notified (email, SMS, WhatsApp, in-app), so that alerts reach me the way I actually check them.
Business use case: Users configure channel preferences per notification type (approval pending, ASN alert, budget threshold, etc.).
Why it exists: Improves the odds that time-sensitive alerts are actually seen.
Edge cases / notes: WhatsApp/SMS require the relevant integration to be enabled for the tenant.
Test cases: PRD-PLT-076 … PRD-PLT-078 (3).
