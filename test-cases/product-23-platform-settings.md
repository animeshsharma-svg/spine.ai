# Product test cases — 23. Platform Settings (MOD-25)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-25 · 23 features · 78 cases · group `PRD-PLT` · plan availability: All Plans · status: GA

Downstream platform configuration — approvals, access, cost centers and analytics.

## 1. Core features

#### PRD-PLT-001 — Configurable Multi-Level Approval Workflow: happy path for the Tenant Admin

- **Why it matters.** Centralizes spend-control logic instead of hardcoding it per module. Business use: Approval matrix (levels, approvers, value bands) is configured per module — PR, PO, invoice, notes, contracts.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Configure multi-level approval chains per module and value band.
  3. Follow the business scenario the workbook gives: "Approval matrix (levels, approvers, value bands) is configured per module — PR, PO, invoice, notes, contracts".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: spend controls match the organisation's authority structure. The business use case is served: approval matrix (levels, approvers, value bands) is configured per module — PR, PO, invoice, notes, contracts.
- **Oracle.** Observable proof that Configurable Multi-Level Approval Workflow did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-001.
- **Trace.** P0 · manual · `FEAT-PLT-001` · workbook sheet "23. Platform Settings"

#### PRD-PLT-002 — Configurable Multi-Level Approval Workflow: chains can vary by category, entity, and value simultaneously

- **Why it matters.** The workbook records this edge case for Configurable Multi-Level Approval Workflow: "Chains can vary by category, entity, and value simultaneously".
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup.
  2. Set up the situation the note describes: "Chains can vary by category, entity, and value simultaneously".
  3. Use Configurable Multi-Level Approval Workflow to configure multi-level approval chains per module and value band.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Configurable Multi-Level Approval Workflow behaves as the workbook states: "Chains can vary by category, entity, and value simultaneously".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PLT-001 quoting the note.
- **Trace.** P2 · manual · `FEAT-PLT-001` · workbook sheet "23. Platform Settings"

#### PRD-PLT-003 — Configurable Multi-Level Approval Workflow: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Configurable Multi-Level Approval Workflow. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Configurable Multi-Level Approval Workflow to configure multi-level approval chains per module and value band.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-PLT-001` · workbook sheet "23. Platform Settings"

#### PRD-PLT-004 — Role-Based Access Control (RBAC): happy path for the Tenant Admin

- **Why it matters.** Enforces least-privilege access across the platform. Business use: Roles (buyer, approver, AP, QC, admin) map to a defined set of module and action permissions.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Assign permissions by role.
  3. Follow the business scenario the workbook gives: "Roles (buyer, approver, AP, QC, admin) map to a defined set of module and action permissions".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: users only see and act on what their role requires. The business use case is served: roles (buyer, approver, AP, QC, admin) map to a defined set of module and action permissions.
- **Oracle.** Observable proof that Role-Based Access Control (RBAC) did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-002.
- **Trace.** P0 · manual · `FEAT-PLT-002` · workbook sheet "23. Platform Settings"

#### PRD-PLT-005 — Role-Based Access Control (RBAC): custom roles beyond the default set are supported

- **Why it matters.** The workbook records this edge case for Role-Based Access Control (RBAC): "Custom roles beyond the default set are supported".
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup.
  2. Set up the situation the note describes: "Custom roles beyond the default set are supported".
  3. Use Role-Based Access Control (RBAC) to assign permissions by role.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Role-Based Access Control (RBAC) behaves as the workbook states: "Custom roles beyond the default set are supported".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PLT-002 quoting the note.
- **Trace.** P2 · manual · `FEAT-PLT-002` · workbook sheet "23. Platform Settings"

#### PRD-PLT-006 — Role-Based Access Control (RBAC): refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Role-Based Access Control (RBAC). If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Role-Based Access Control (RBAC) to assign permissions by role.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-PLT-002` · workbook sheet "23. Platform Settings"

#### PRD-PLT-007 — Cost Center Master & Hierarchy Mapping: happy path for the Tenant Admin

- **Why it matters.** Foundation for budget control and financial reporting by unit. Business use: Cost centers are set up with parent-child hierarchy and mapped to users/categories for spend attribution.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Maintain a cost center master with hierarchy.
  3. Follow the business scenario the workbook gives: "Cost centers are set up with parent-child hierarchy and mapped to users/categories for spend attribution".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: spend is attributable to the right business unit. The business use case is served: cost centers are set up with parent-child hierarchy and mapped to users/categories for spend attribution.
- **Oracle.** Observable proof that Cost Center Master & Hierarchy Mapping did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-003.
- **Trace.** P0 · manual · `FEAT-PLT-003` · workbook sheet "23. Platform Settings"

#### PRD-PLT-008 — Cost Center Master & Hierarchy Mapping: tenant configuration — Hierarchy depth and structure are tenant-configurable

- **Why it matters.** The workbook says "Hierarchy depth and structure are tenant-configurable". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Tenant Admin (to use the feature).
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Hierarchy depth and structure are tenant-configurable") and record its current value.
  2. As the Tenant Admin: use Cost Center Master & Hierarchy Mapping to maintain a cost center master with hierarchy.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Cost Center Master & Hierarchy Mapping follows the tenant's configured value, as the workbook states: "Hierarchy depth and structure are tenant-configurable". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-PLT-003` · workbook sheet "23. Platform Settings"

#### PRD-PLT-009 — Cost Center Master & Hierarchy Mapping: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Cost Center Master & Hierarchy Mapping. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Cost Center Master & Hierarchy Mapping to maintain a cost center master with hierarchy.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-PLT-003` · workbook sheet "23. Platform Settings"

#### PRD-PLT-010 — Approval Delegation / Out-of-Office Auto-Reassignment: happy path for the Approver

- **Why it matters.** Prevents approval-chain bottlenecks caused by approver unavailability. Business use: Approver sets an OOO period; pending and new approvals route to a designated delegate automatically.
- **Setup.**
  Persona: Approver.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an Approver on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Use Approval Delegation / Out-of-Office Auto-Reassignment to get what the story asks for: their pending approvals to auto-reassign when they are out of office.
  3. Follow the business scenario the workbook gives: "Approver sets an OOO period; pending and new approvals route to a designated delegate automatically".
  4. Check the result against the story's promised outcome.
- **Expected.** The Approver achieves the story's outcome: approvals don't stall in their absence. The business use case is served: approver sets an OOO period; pending and new approvals route to a designated delegate automatically.
- **Oracle.** Observable proof that Approval Delegation / Out-of-Office Auto-Reassignment did its job for the Approver — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-008.
- **Trace.** P0 · manual · `FEAT-PLT-008` · workbook sheet "23. Platform Settings"

#### PRD-PLT-011 — Approval Delegation / Out-of-Office Auto-Reassignment: delegate should have the same authority level, not a broader one, by default

- **Why it matters.** The workbook records this edge case for Approval Delegation / Out-of-Office Auto-Reassignment: "Delegate should have the same authority level, not a broader one, by default".
- **Setup.**
  Persona: Approver.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an Approver on the tenant described in Setup.
  2. Set up the situation the note describes: "Delegate should have the same authority level, not a broader one, by default".
  3. Use Approval Delegation / Out-of-Office Auto-Reassignment to get their pending approvals to auto-reassign when they are out of office.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Approval Delegation / Out-of-Office Auto-Reassignment behaves as the workbook states: "Delegate should have the same authority level, not a broader one, by default".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PLT-008 quoting the note.
- **Trace.** P2 · manual · `FEAT-PLT-008` · workbook sheet "23. Platform Settings"

#### PRD-PLT-012 — Approval Delegation / Out-of-Office Auto-Reassignment: not available on the Growth plan

- **Why it matters.** The workbook limits Approval Delegation / Out-of-Office Auto-Reassignment to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Approver.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an Approver on the lower-plan tenant.
  2. Try it: use Approval Delegation / Out-of-Office Auto-Reassignment to get their pending approvals to auto-reassign when they are out of office.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-PLT-008` · workbook sheet "23. Platform Settings"

#### PRD-PLT-013 — Approval Delegation / Out-of-Office Auto-Reassignment: refused for a user without the Approver role

- **Why it matters.** The workbook names Approver as the user of Approval Delegation / Out-of-Office Auto-Reassignment. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Approver.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Approval Delegation / Out-of-Office Auto-Reassignment to get their pending approvals to auto-reassign when they are out of office.
  3. Repeat as an Approver.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Approver can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Approver.
- **Trace.** P1 · automate-later · `FEAT-PLT-008` · workbook sheet "23. Platform Settings"

## 2. Compliance features

#### PRD-PLT-014 — User Activity / Audit Log: happy path for the Tenant Admin

- **Why it matters.** Security and compliance visibility into platform usage. Business use: Login, view, edit, and export actions are logged per user across modules.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Use User Activity / Audit Log to get what the story asks for: a log of user activity across the platform.
  3. Follow the business scenario the workbook gives: "Login, view, edit, and export actions are logged per user across modules".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: investigate anomalies or disputes. The business use case is served: login, view, edit, and export actions are logged per user across modules.
- **Oracle.** Observable proof that User Activity / Audit Log did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-013.
- **Trace.** P0 · manual · `FEAT-PLT-013` · workbook sheet "23. Platform Settings"

#### PRD-PLT-015 — User Activity / Audit Log: tenant configuration — Retention period for logs should be configurable to meet compliance needs

- **Why it matters.** The workbook says "Retention period for logs should be configurable to meet compliance needs". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Tenant Admin (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Retention period for logs should be configurable to meet compliance needs") and record its current value.
  2. As the Tenant Admin: use User Activity / Audit Log to get a log of user activity across the platform.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs User Activity / Audit Log follows the tenant's configured value, as the workbook states: "Retention period for logs should be configurable to meet compliance needs". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-PLT-013` · workbook sheet "23. Platform Settings"

#### PRD-PLT-016 — User Activity / Audit Log: not available on the Growth plan

- **Why it matters.** The workbook limits User Activity / Audit Log to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use User Activity / Audit Log to get a log of user activity across the platform.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-PLT-013` · workbook sheet "23. Platform Settings"

#### PRD-PLT-017 — User Activity / Audit Log: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of User Activity / Audit Log. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use User Activity / Audit Log to get a log of user activity across the platform.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-PLT-013` · workbook sheet "23. Platform Settings"

## 3. Reporting features

#### PRD-PLT-018 — Real-Time Dashboard Widgets: happy path for the All Users

- **Why it matters.** Gives at-a-glance visibility without navigating to full reports. Business use: Live widgets (pending approvals, open POs, invoice aging, budget status) surface on each module's landing dashboard.
- **Setup.**
  Persona: All Users.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an All Users on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Use Real-Time Dashboard Widgets to get what the story asks for: real-time widgets on every dashboard.
  3. Follow the business scenario the workbook gives: "Live widgets (pending approvals, open POs, invoice aging, budget status) surface on each module's landing dashboard".
  4. Check the result against the story's promised outcome.
- **Expected.** The All Users achieves the story's outcome: they see current status without running a report. The business use case is served: live widgets (pending approvals, open POs, invoice aging, budget status) surface on each module's landing dashboard.
- **Oracle.** Observable proof that Real-Time Dashboard Widgets did its job for the All Users — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-004.
- **Trace.** P1 · manual · `FEAT-PLT-004` · workbook sheet "23. Platform Settings"

#### PRD-PLT-019 — Real-Time Dashboard Widgets: tenant configuration — Widget set is configurable per role

- **Why it matters.** The workbook says "Widget set is configurable per role". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and All Users (to use the feature).
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Widget set is configurable per role") and record its current value.
  2. As the All Users: use Real-Time Dashboard Widgets to get real-time widgets on every dashboard.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Real-Time Dashboard Widgets follows the tenant's configured value, as the workbook states: "Widget set is configurable per role". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-PLT-004` · workbook sheet "23. Platform Settings"

#### PRD-PLT-020 — Real-Time Dashboard Widgets: not available on plans below Growth

- **Why it matters.** The workbook limits Real-Time Dashboard Widgets to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: All Users.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an All Users on the lower-plan tenant.
  2. Try it: use Real-Time Dashboard Widgets to get real-time widgets on every dashboard.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-PLT-004` · workbook sheet "23. Platform Settings"

#### PRD-PLT-021 — Module-Wise Reporting: happy path for the All Users

- **Why it matters.** Keeps reporting close to the data users already work with. Business use: PO, Invoice, GRN, QC, and other modules each expose their own report set.
- **Setup.**
  Persona: All Users.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an All Users on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Use Module-Wise Reporting to get what the story asks for: each module to have its own dedicated reporting section.
  3. Follow the business scenario the workbook gives: "PO, Invoice, GRN, QC, and other modules each expose their own report set".
  4. Check the result against the story's promised outcome.
- **Expected.** The All Users achieves the story's outcome: module-specific data isn't buried in a generic report. The business use case is served: PO, Invoice, GRN, QC, and other modules each expose their own report set.
- **Oracle.** Observable proof that Module-Wise Reporting did its job for the All Users — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-006.
- **Trace.** P1 · manual · `FEAT-PLT-006` · workbook sheet "23. Platform Settings"

#### PRD-PLT-022 — Module-Wise Reporting: consistent filter/export UX is maintained across all module reports

- **Why it matters.** The workbook records this edge case for Module-Wise Reporting: "Consistent filter/export UX is maintained across all module reports".
- **Setup.**
  Persona: All Users.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an All Users on the tenant described in Setup.
  2. Set up the situation the note describes: "Consistent filter/export UX is maintained across all module reports".
  3. Use Module-Wise Reporting to get each module to have its own dedicated reporting section.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Module-Wise Reporting behaves as the workbook states: "Consistent filter/export UX is maintained across all module reports".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PLT-006 quoting the note.
- **Trace.** P3 · manual · `FEAT-PLT-006` · workbook sheet "23. Platform Settings"

#### PRD-PLT-023 — Filter & Sort on Reports/Listings: happy path for the All Users

- **Why it matters.** Baseline usability expectation for any data-heavy platform. Business use: Standard filter and sort controls are available on every list view and report across the platform.
- **Setup.**
  Persona: All Users.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an All Users on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Filter and sort any listing or report.
  3. Follow the business scenario the workbook gives: "Standard filter and sort controls are available on every list view and report across the platform".
  4. Check the result against the story's promised outcome.
- **Expected.** The All Users achieves the story's outcome: quickly find the records relevant to them. The business use case is served: standard filter and sort controls are available on every list view and report across the platform.
- **Oracle.** Observable proof that Filter & Sort on Reports/Listings did its job for the All Users — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-007.
- **Trace.** P1 · manual · `FEAT-PLT-007` · workbook sheet "23. Platform Settings"

#### PRD-PLT-024 — Filter & Sort on Reports/Listings: filter sets are contextual per module

- **Why it matters.** The workbook records this edge case for Filter & Sort on Reports/Listings: "Filter sets are contextual per module".
- **Setup.**
  Persona: All Users.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an All Users on the tenant described in Setup.
  2. Set up the situation the note describes: "Filter sets are contextual per module".
  3. Use Filter & Sort on Reports/Listings to filter and sort any listing or report.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Filter & Sort on Reports/Listings behaves as the workbook states: "Filter sets are contextual per module".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PLT-007 quoting the note.
- **Trace.** P3 · manual · `FEAT-PLT-007` · workbook sheet "23. Platform Settings"

## 4. Roadmap features — not in the product yet (acceptance specifications)

#### PRD-PLT-025 — [Roadmap] Custom Report Builder: happy path for the Procurement Manager

- **Why it matters.** Covers reporting needs standard reports don't anticipate. Business use: Users select fields, filters, and groupings across modules to build ad-hoc reports.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Build custom reports from any module's data.
  3. Follow the business scenario the workbook gives: "Users select fields, filters, and groupings across modules to build ad-hoc reports".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: they are not limited to pre-built reports. The business use case is served: users select fields, filters, and groupings across modules to build ad-hoc reports.
- **Oracle.** Observable proof that Custom Report Builder did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-005.
- **Trace.** P3 · manual · `FEAT-PLT-005` · workbook sheet "23. Platform Settings"

#### PRD-PLT-026 — [Roadmap] Custom Report Builder: saved custom reports can be scheduled and shared

- **Why it matters.** The workbook records this edge case for Custom Report Builder: "Saved custom reports can be scheduled and shared".
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Saved custom reports can be scheduled and shared".
  3. Use Custom Report Builder to build custom reports from any module's data.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Custom Report Builder behaves as the workbook states: "Saved custom reports can be scheduled and shared".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PLT-005 quoting the note.
- **Trace.** P3 · manual · `FEAT-PLT-005` · workbook sheet "23. Platform Settings"

#### PRD-PLT-027 — [Roadmap] Custom Report Builder: not available on the Growth plan

- **Why it matters.** The workbook limits Custom Report Builder to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Procurement Manager on the lower-plan tenant.
  2. Try it: use Custom Report Builder to build custom reports from any module's data.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-PLT-005` · workbook sheet "23. Platform Settings"

#### PRD-PLT-028 — [Roadmap] Custom Report Builder: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of Custom Report Builder. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Custom Report Builder to build custom reports from any module's data.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P3 · manual · `FEAT-PLT-005` · workbook sheet "23. Platform Settings"

#### PRD-PLT-029 — [Roadmap] Approval Escalation on SLA Breach: happy path for the Tenant Admin

- **Why it matters.** Keeps the approval chain moving without manual chasing. Business use: An approval untouched beyond a configured time auto-escalates to the next level or a designated escalation contact.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Use Approval Escalation on SLA Breach to get what the story asks for: approvals pending beyond an SLA to escalate automatically.
  3. Follow the business scenario the workbook gives: "An approval untouched beyond a configured time auto-escalates to the next level or a designated escalation contact".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: nothing stalls indefinitely. The business use case is served: an approval untouched beyond a configured time auto-escalates to the next level or a designated escalation contact.
- **Oracle.** Observable proof that Approval Escalation on SLA Breach did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-009.
- **Trace.** P3 · manual · `FEAT-PLT-009` · workbook sheet "23. Platform Settings"

#### PRD-PLT-030 — [Roadmap] Approval Escalation on SLA Breach: tenant configuration — SLA duration configurable per module/approval level

- **Why it matters.** The workbook says "SLA duration configurable per module/approval level". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Tenant Admin (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("SLA duration configurable per module/approval level") and record its current value.
  2. As the Tenant Admin: use Approval Escalation on SLA Breach to get approvals pending beyond an SLA to escalate automatically.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Approval Escalation on SLA Breach follows the tenant's configured value, as the workbook states: "SLA duration configurable per module/approval level". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P3 · manual · `FEAT-PLT-009` · workbook sheet "23. Platform Settings"

#### PRD-PLT-031 — [Roadmap] Approval Escalation on SLA Breach: not available on the Growth plan

- **Why it matters.** The workbook limits Approval Escalation on SLA Breach to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Approval Escalation on SLA Breach to get approvals pending beyond an SLA to escalate automatically.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-PLT-009` · workbook sheet "23. Platform Settings"

#### PRD-PLT-032 — [Roadmap] Approval Escalation on SLA Breach: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Approval Escalation on SLA Breach. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Approval Escalation on SLA Breach to get approvals pending beyond an SLA to escalate automatically.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P3 · manual · `FEAT-PLT-009` · workbook sheet "23. Platform Settings"

#### PRD-PLT-033 — [Roadmap] Approval Audit Trail & E-Signature Log: happy path for the Tenant Admin

- **Why it matters.** Provides the audit evidence regulators and internal audit expect. Business use: Every approve/reject/delegate action is logged immutably with actor, timestamp, and comments.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Use Approval Audit Trail & E-Signature Log to get what the story asks for: a full audit trail of every approval action with timestamp and identity.
  3. Follow the business scenario the workbook gives: "Every approve/reject/delegate action is logged immutably with actor, timestamp, and comments".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: we can demonstrate compliance in an audit. The business use case is served: every approve/reject/delegate action is logged immutably with actor, timestamp, and comments.
- **Oracle.** Observable proof that Approval Audit Trail & E-Signature Log did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-010.
- **Trace.** P3 · manual · `FEAT-PLT-010` · workbook sheet "23. Platform Settings"

#### PRD-PLT-034 — [Roadmap] Approval Audit Trail & E-Signature Log: log should be exportable and tamper-evident

- **Why it matters.** The workbook records this edge case for Approval Audit Trail & E-Signature Log: "Log should be exportable and tamper-evident".
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup.
  2. Set up the situation the note describes: "Log should be exportable and tamper-evident".
  3. Use Approval Audit Trail & E-Signature Log to get a full audit trail of every approval action with timestamp and identity.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Approval Audit Trail & E-Signature Log behaves as the workbook states: "Log should be exportable and tamper-evident".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PLT-010 quoting the note.
- **Trace.** P3 · manual · `FEAT-PLT-010` · workbook sheet "23. Platform Settings"

#### PRD-PLT-035 — [Roadmap] Approval Audit Trail & E-Signature Log: not available on the Growth plan

- **Why it matters.** The workbook limits Approval Audit Trail & E-Signature Log to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Approval Audit Trail & E-Signature Log to get a full audit trail of every approval action with timestamp and identity.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-PLT-010` · workbook sheet "23. Platform Settings"

#### PRD-PLT-036 — [Roadmap] Approval Audit Trail & E-Signature Log: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Approval Audit Trail & E-Signature Log. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Approval Audit Trail & E-Signature Log to get a full audit trail of every approval action with timestamp and identity.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P3 · manual · `FEAT-PLT-010` · workbook sheet "23. Platform Settings"

#### PRD-PLT-037 — [Roadmap] SSO/SAML & SCIM User Provisioning: happy path for the Tenant Admin

- **Why it matters.** Removes manual user administration and improves access security. Business use: User login and lifecycle (create/deactivate) sync automatically with the tenant's IdP.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Use SSO/SAML & SCIM User Provisioning to get what the story asks for: users provisioned via SSO/SAML and SCIM.
  3. Follow the business scenario the workbook gives: "User login and lifecycle (create/deactivate) sync automatically with the tenant's IdP".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: access is managed centrally through the organisation's identity provider. The business use case is served: user login and lifecycle (create/deactivate) sync automatically with the tenant's IdP.
- **Oracle.** Observable proof that SSO/SAML & SCIM User Provisioning did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-011.
- **Trace.** P3 · manual · `FEAT-PLT-011` · workbook sheet "23. Platform Settings"

#### PRD-PLT-038 — [Roadmap] SSO/SAML & SCIM User Provisioning: de-provisioning on the IdP side should immediately revoke platform access

- **Why it matters.** The workbook records this edge case for SSO/SAML & SCIM User Provisioning: "De-provisioning on the IdP side should immediately revoke platform access".
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup.
  2. Set up the situation the note describes: "De-provisioning on the IdP side should immediately revoke platform access".
  3. Use SSO/SAML & SCIM User Provisioning to get users provisioned via SSO/SAML and SCIM.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** SSO/SAML & SCIM User Provisioning behaves as the workbook states: "De-provisioning on the IdP side should immediately revoke platform access".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PLT-011 quoting the note.
- **Trace.** P3 · manual · `FEAT-PLT-011` · workbook sheet "23. Platform Settings"

#### PRD-PLT-039 — [Roadmap] SSO/SAML & SCIM User Provisioning: not available on the Growth plan

- **Why it matters.** The workbook limits SSO/SAML & SCIM User Provisioning to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use SSO/SAML & SCIM User Provisioning to get users provisioned via SSO/SAML and SCIM.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-PLT-011` · workbook sheet "23. Platform Settings"

#### PRD-PLT-040 — [Roadmap] SSO/SAML & SCIM User Provisioning: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of SSO/SAML & SCIM User Provisioning. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use SSO/SAML & SCIM User Provisioning to get users provisioned via SSO/SAML and SCIM.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P3 · manual · `FEAT-PLT-011` · workbook sheet "23. Platform Settings"

#### PRD-PLT-041 — [Roadmap] Granular Field-Level Permissions: happy path for the Tenant Admin

- **Why it matters.** Supports least-privilege access even within a shared screen/module. Business use: Specific fields (cost, margin, vendor bank details) can be hidden or made read-only per role.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Control visibility/edit rights at the field level, not just the module level.
  3. Follow the business scenario the workbook gives: "Specific fields (cost, margin, vendor bank details) can be hidden or made read-only per role".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: sensitive fields (e.g., pricing) are restricted appropriately. The business use case is served: specific fields (cost, margin, vendor bank details) can be hidden or made read-only per role.
- **Oracle.** Observable proof that Granular Field-Level Permissions did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-012.
- **Trace.** P3 · manual · `FEAT-PLT-012` · workbook sheet "23. Platform Settings"

#### PRD-PLT-042 — [Roadmap] Granular Field-Level Permissions: should not conflict with audit-trail visibility requirements

- **Why it matters.** The workbook records this access rule for Granular Field-Level Permissions: "Should not conflict with audit-trail visibility requirements". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup.
  2. Set up the situation the note describes: "Should not conflict with audit-trail visibility requirements".
  3. Use Granular Field-Level Permissions to control visibility/edit rights at the field level, not just the module level.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Granular Field-Level Permissions behaves as the workbook states: "Should not conflict with audit-trail visibility requirements".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PLT-012 quoting the note.
- **Trace.** P3 · manual · `FEAT-PLT-012` · workbook sheet "23. Platform Settings"

#### PRD-PLT-043 — [Roadmap] Granular Field-Level Permissions: not available on the Growth plan

- **Why it matters.** The workbook limits Granular Field-Level Permissions to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Granular Field-Level Permissions to control visibility/edit rights at the field level, not just the module level.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-PLT-012` · workbook sheet "23. Platform Settings"

#### PRD-PLT-044 — [Roadmap] Granular Field-Level Permissions: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Granular Field-Level Permissions. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Granular Field-Level Permissions to control visibility/edit rights at the field level, not just the module level.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P3 · manual · `FEAT-PLT-012` · workbook sheet "23. Platform Settings"

#### PRD-PLT-045 — [Roadmap] IP / Geo Access Restrictions: happy path for the Tenant Admin

- **Why it matters.** Adds a network-level security control on top of RBAC. Business use: Login is blocked or flagged outside configured IP ranges/regions.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Restrict platform access by IP range or geography.
  3. Follow the business scenario the workbook gives: "Login is blocked or flagged outside configured IP ranges/regions".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: access aligns with the organisation's security policy. The business use case is served: login is blocked or flagged outside configured IP ranges/regions.
- **Oracle.** Observable proof that IP / Geo Access Restrictions did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-014.
- **Trace.** P3 · manual · `FEAT-PLT-014` · workbook sheet "23. Platform Settings"

#### PRD-PLT-046 — [Roadmap] IP / Geo Access Restrictions: should have a break-glass exception process for legitimate travel/remote cases

- **Why it matters.** The workbook records this edge case for IP / Geo Access Restrictions: "Should have a break-glass exception process for legitimate travel/remote cases". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup.
  2. Set up the situation the note describes: "Should have a break-glass exception process for legitimate travel/remote cases".
  3. Use IP / Geo Access Restrictions to restrict platform access by IP range or geography.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** IP / Geo Access Restrictions behaves as the workbook states: "Should have a break-glass exception process for legitimate travel/remote cases".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PLT-014 quoting the note.
- **Trace.** P3 · manual · `FEAT-PLT-014` · workbook sheet "23. Platform Settings"

#### PRD-PLT-047 — [Roadmap] IP / Geo Access Restrictions: not available on the Growth plan

- **Why it matters.** The workbook limits IP / Geo Access Restrictions to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use IP / Geo Access Restrictions to restrict platform access by IP range or geography.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-PLT-014` · workbook sheet "23. Platform Settings"

#### PRD-PLT-048 — [Roadmap] IP / Geo Access Restrictions: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of IP / Geo Access Restrictions. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use IP / Geo Access Restrictions to restrict platform access by IP range or geography.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P3 · manual · `FEAT-PLT-014` · workbook sheet "23. Platform Settings"

#### PRD-PLT-049 — [Roadmap] Cost Center–to–GL Code Cross-Mapping: happy path for the Finance Controller

- **Why it matters.** Removes manual GL coding at the point of financial posting. Business use: Each cost center carries a default GL mapping used during accounting postings (accruals, invoices, notes).
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Use Cost Center–to–GL Code Cross-Mapping to get what the story asks for: cost centers mapped to GL codes.
  3. Follow the business scenario the workbook gives: "Each cost center carries a default GL mapping used during accounting postings (accruals, invoices, notes)".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: transactions post to the correct account automatically. The business use case is served: each cost center carries a default GL mapping used during accounting postings (accruals, invoices, notes).
- **Oracle.** Observable proof that Cost Center–to–GL Code Cross-Mapping did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-015.
- **Trace.** P3 · manual · `FEAT-PLT-015` · workbook sheet "23. Platform Settings"

#### PRD-PLT-050 — [Roadmap] Cost Center–to–GL Code Cross-Mapping: should support multiple GL mappings per cost center by transaction type

- **Why it matters.** The workbook records this edge case for Cost Center–to–GL Code Cross-Mapping: "Should support multiple GL mappings per cost center by transaction type". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup.
  2. Set up the situation the note describes: "Should support multiple GL mappings per cost center by transaction type".
  3. Use Cost Center–to–GL Code Cross-Mapping to get cost centers mapped to GL codes.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Cost Center–to–GL Code Cross-Mapping behaves as the workbook states: "Should support multiple GL mappings per cost center by transaction type".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PLT-015 quoting the note.
- **Trace.** P3 · manual · `FEAT-PLT-015` · workbook sheet "23. Platform Settings"

#### PRD-PLT-051 — [Roadmap] Cost Center–to–GL Code Cross-Mapping: not available on the Growth plan

- **Why it matters.** The workbook limits Cost Center–to–GL Code Cross-Mapping to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use Cost Center–to–GL Code Cross-Mapping to get cost centers mapped to GL codes.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-PLT-015` · workbook sheet "23. Platform Settings"

#### PRD-PLT-052 — [Roadmap] Cost Center–to–GL Code Cross-Mapping: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of Cost Center–to–GL Code Cross-Mapping. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Cost Center–to–GL Code Cross-Mapping to get cost centers mapped to GL codes.
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P3 · manual · `FEAT-PLT-015` · workbook sheet "23. Platform Settings"

#### PRD-PLT-053 — [Roadmap] Multi-Entity Cost Center Consolidation: happy path for the Finance Manager

- **Why it matters.** Supports multi-entity organizations without manual Excel consolidation. Business use: Spend across legal entities rolls up into a consolidated cost-center view for group finance.
- **Setup.**
  Persona: Finance Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Manager on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. View cost center spend consolidated across entities.
  3. Follow the business scenario the workbook gives: "Spend across legal entities rolls up into a consolidated cost-center view for group finance".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Manager achieves the story's outcome: group-level reporting doesn't require manual aggregation. The business use case is served: spend across legal entities rolls up into a consolidated cost-center view for group finance.
- **Oracle.** Observable proof that Multi-Entity Cost Center Consolidation did its job for the Finance Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-016.
- **Trace.** P3 · manual · `FEAT-PLT-016` · workbook sheet "23. Platform Settings"

#### PRD-PLT-054 — [Roadmap] Multi-Entity Cost Center Consolidation: currency conversion needs to be handled consistently in consolidation

- **Why it matters.** The workbook records this edge case for Multi-Entity Cost Center Consolidation: "Currency conversion needs to be handled consistently in consolidation".
- **Setup.**
  Persona: Finance Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Currency conversion needs to be handled consistently in consolidation".
  3. Use Multi-Entity Cost Center Consolidation to view cost center spend consolidated across entities.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Multi-Entity Cost Center Consolidation behaves as the workbook states: "Currency conversion needs to be handled consistently in consolidation".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PLT-016 quoting the note.
- **Trace.** P3 · manual · `FEAT-PLT-016` · workbook sheet "23. Platform Settings"

#### PRD-PLT-055 — [Roadmap] Multi-Entity Cost Center Consolidation: not available on the Growth plan

- **Why it matters.** The workbook limits Multi-Entity Cost Center Consolidation to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Manager on the lower-plan tenant.
  2. Try it: use Multi-Entity Cost Center Consolidation to view cost center spend consolidated across entities.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-PLT-016` · workbook sheet "23. Platform Settings"

#### PRD-PLT-056 — [Roadmap] Multi-Entity Cost Center Consolidation: refused for a user without the Finance Manager role

- **Why it matters.** The workbook names Finance Manager as the user of Multi-Entity Cost Center Consolidation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Multi-Entity Cost Center Consolidation to view cost center spend consolidated across entities.
  3. Repeat as a Finance Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Manager.
- **Trace.** P3 · manual · `FEAT-PLT-016` · workbook sheet "23. Platform Settings"

#### PRD-PLT-057 — [Roadmap] AI-Powered Spend Insights: happy path for the Category Manager

- **Why it matters.** Turns raw transaction data into actionable procurement insight. Business use: System surfaces trends, maverick spend, and consolidation opportunities from historical transaction data.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Use AI-Powered Spend Insights to get what the story asks for: AI-generated insights on spend patterns.
  3. Follow the business scenario the workbook gives: "System surfaces trends, maverick spend, and consolidation opportunities from historical transaction data".
  4. Check the result against the story's promised outcome.
- **Expected.** The Category Manager achieves the story's outcome: savings opportunities and anomalies surface without manual analysis. The business use case is served: system surfaces trends, maverick spend, and consolidation opportunities from historical transaction data.
- **Oracle.** Observable proof that AI-Powered Spend Insights did its job for the Category Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-017.
- **Trace.** P3 · manual · `FEAT-PLT-017` · workbook sheet "23. Platform Settings"

#### PRD-PLT-058 — [Roadmap] AI-Powered Spend Insights: not available on the Growth plan

- **Why it matters.** The workbook limits AI-Powered Spend Insights to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Category Manager on the lower-plan tenant.
  2. Try it: use AI-Powered Spend Insights to get AI-generated insights on spend patterns.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-PLT-017` · workbook sheet "23. Platform Settings"

#### PRD-PLT-059 — [Roadmap] AI-Powered Spend Insights: refused for a user without the Category Manager role

- **Why it matters.** The workbook names Category Manager as the user of AI-Powered Spend Insights. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use AI-Powered Spend Insights to get AI-generated insights on spend patterns.
  3. Repeat as a Category Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Category Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Category Manager.
- **Trace.** P3 · manual · `FEAT-PLT-017` · workbook sheet "23. Platform Settings"

#### PRD-PLT-060 — [Roadmap] Scheduled Report Email Delivery: happy path for the All Users

- **Why it matters.** Pushes information to users instead of requiring them to pull it. Business use: Any custom or standard report can be scheduled for recurring email delivery in Excel/PDF.
- **Setup.**
  Persona: All Users.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an All Users on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Use Scheduled Report Email Delivery to get what the story asks for: reports emailed to them on a schedule.
  3. Follow the business scenario the workbook gives: "Any custom or standard report can be scheduled for recurring email delivery in Excel/PDF".
  4. Check the result against the story's promised outcome.
- **Expected.** The All Users achieves the story's outcome: they don't have to log in to check the same report every week. The business use case is served: any custom or standard report can be scheduled for recurring email delivery in Excel/PDF.
- **Oracle.** Observable proof that Scheduled Report Email Delivery did its job for the All Users — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-018.
- **Trace.** P3 · manual · `FEAT-PLT-018` · workbook sheet "23. Platform Settings"

#### PRD-PLT-061 — [Roadmap] Scheduled Report Email Delivery: should respect the same RBAC/field-level permissions as the live report

- **Why it matters.** The workbook records this edge case for Scheduled Report Email Delivery: "Should respect the same RBAC/field-level permissions as the live report". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: All Users.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an All Users on the tenant described in Setup.
  2. Set up the situation the note describes: "Should respect the same RBAC/field-level permissions as the live report".
  3. Use Scheduled Report Email Delivery to get reports emailed to them on a schedule.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Scheduled Report Email Delivery behaves as the workbook states: "Should respect the same RBAC/field-level permissions as the live report".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PLT-018 quoting the note.
- **Trace.** P3 · manual · `FEAT-PLT-018` · workbook sheet "23. Platform Settings"

#### PRD-PLT-062 — [Roadmap] Scheduled Report Email Delivery: not available on the Growth plan

- **Why it matters.** The workbook limits Scheduled Report Email Delivery to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: All Users.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an All Users on the lower-plan tenant.
  2. Try it: use Scheduled Report Email Delivery to get reports emailed to them on a schedule.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-PLT-018` · workbook sheet "23. Platform Settings"

#### PRD-PLT-063 — [Roadmap] Role-Based Dashboard Views: happy path for the All Users

- **Why it matters.** Reduces cognitive load by surfacing only what's relevant per role. Business use: Default dashboard layout varies by persona (buyer, approver, finance, admin) out of the box.
- **Setup.**
  Persona: All Users.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an All Users on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Use Role-Based Dashboard Views to get what the story asks for: their dashboard to show widgets relevant to their role by default.
  3. Follow the business scenario the workbook gives: "Default dashboard layout varies by persona (buyer, approver, finance, admin) out of the box".
  4. Check the result against the story's promised outcome.
- **Expected.** The All Users achieves the story's outcome: they are not sifting through irrelevant data. The business use case is served: default dashboard layout varies by persona (buyer, approver, finance, admin) out of the box.
- **Oracle.** Observable proof that Role-Based Dashboard Views did its job for the All Users — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-019.
- **Trace.** P3 · manual · `FEAT-PLT-019` · workbook sheet "23. Platform Settings"

#### PRD-PLT-064 — [Roadmap] Role-Based Dashboard Views: users should still be able to customize beyond the role default

- **Why it matters.** The workbook records this edge case for Role-Based Dashboard Views: "Users should still be able to customize beyond the role default".
- **Setup.**
  Persona: All Users.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an All Users on the tenant described in Setup.
  2. Set up the situation the note describes: "Users should still be able to customize beyond the role default".
  3. Use Role-Based Dashboard Views to get their dashboard to show widgets relevant to their role by default.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Role-Based Dashboard Views behaves as the workbook states: "Users should still be able to customize beyond the role default".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PLT-019 quoting the note.
- **Trace.** P3 · manual · `FEAT-PLT-019` · workbook sheet "23. Platform Settings"

#### PRD-PLT-065 — [Roadmap] Role-Based Dashboard Views: not available on plans below Growth

- **Why it matters.** The workbook limits Role-Based Dashboard Views to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: All Users.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an All Users on the lower-plan tenant.
  2. Try it: use Role-Based Dashboard Views to get their dashboard to show widgets relevant to their role by default.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P3 · manual · `FEAT-PLT-019` · workbook sheet "23. Platform Settings"

#### PRD-PLT-066 — [Roadmap] Data Export (Excel / PDF / API): happy path for the All Users

- **Why it matters.** Baseline interoperability expectation for enterprise software. Business use: Standard export options are available consistently across modules and reports.
- **Setup.**
  Persona: All Users.
  Plan: any tenant (Plan Required: All Plans).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an All Users on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Export any report or listing to Excel, PDF, or via API.
  3. Follow the business scenario the workbook gives: "Standard export options are available consistently across modules and reports".
  4. Check the result against the story's promised outcome.
- **Expected.** The All Users achieves the story's outcome: data can be used outside the platform when needed. The business use case is served: standard export options are available consistently across modules and reports.
- **Oracle.** Observable proof that Data Export (Excel / PDF / API) did its job for the All Users — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-020.
- **Trace.** P3 · manual · `FEAT-PLT-020` · workbook sheet "23. Platform Settings"

#### PRD-PLT-067 — [Roadmap] Data Export (Excel / PDF / API): API export should respect the same RBAC as UI export

- **Why it matters.** The workbook records this edge case for Data Export (Excel / PDF / API): "API export should respect the same RBAC as UI export".
- **Setup.**
  Persona: All Users.
  Plan: any tenant (Plan Required: All Plans).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an All Users on the tenant described in Setup.
  2. Set up the situation the note describes: "API export should respect the same RBAC as UI export".
  3. Use Data Export (Excel / PDF / API) to export any report or listing to Excel, PDF, or via API.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Data Export (Excel / PDF / API) behaves as the workbook states: "API export should respect the same RBAC as UI export".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PLT-020 quoting the note.
- **Trace.** P3 · manual · `FEAT-PLT-020` · workbook sheet "23. Platform Settings"

#### PRD-PLT-068 — [Roadmap] Tenant-Level Feature Flag Management: happy path for the Tenant Admin

- **Why it matters.** Improves transparency for admins managing their own instance. Business use: Admin-facing view of enabled/disabled flags relevant to the tenant's plan.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Use Tenant-Level Feature Flag Management to get what the story asks for: visibility into which feature flags are enabled for their tenant.
  3. Follow the business scenario the workbook gives: "Admin-facing view of enabled/disabled flags relevant to the tenant's plan".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: they understand what's active without contacting support. The business use case is served: admin-facing view of enabled/disabled flags relevant to the tenant's plan.
- **Oracle.** Observable proof that Tenant-Level Feature Flag Management did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-021.
- **Trace.** P3 · manual · `FEAT-PLT-021` · workbook sheet "23. Platform Settings"

#### PRD-PLT-069 — [Roadmap] Tenant-Level Feature Flag Management: some flags may remain engineering-only if they carry technical risk

- **Why it matters.** The workbook records this edge case for Tenant-Level Feature Flag Management: "Some flags may remain engineering-only if they carry technical risk".
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup.
  2. Set up the situation the note describes: "Some flags may remain engineering-only if they carry technical risk".
  3. Use Tenant-Level Feature Flag Management to get visibility into which feature flags are enabled for their tenant.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Tenant-Level Feature Flag Management behaves as the workbook states: "Some flags may remain engineering-only if they carry technical risk".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PLT-021 quoting the note.
- **Trace.** P3 · manual · `FEAT-PLT-021` · workbook sheet "23. Platform Settings"

#### PRD-PLT-070 — [Roadmap] Tenant-Level Feature Flag Management: not available on the Growth plan

- **Why it matters.** The workbook limits Tenant-Level Feature Flag Management to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Tenant-Level Feature Flag Management to get visibility into which feature flags are enabled for their tenant.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-PLT-021` · workbook sheet "23. Platform Settings"

#### PRD-PLT-071 — [Roadmap] Tenant-Level Feature Flag Management: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Tenant-Level Feature Flag Management. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Tenant-Level Feature Flag Management to get visibility into which feature flags are enabled for their tenant.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P3 · manual · `FEAT-PLT-021` · workbook sheet "23. Platform Settings"

#### PRD-PLT-072 — [Roadmap] Multi-Entity / Multi-Org Configuration: happy path for the Tenant Admin

- **Why it matters.** Supports group/holding-company structures without separate tenants per entity. Business use: Entities have their own numbering series, approval chains, and cost centers within one shared tenant.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Configure multiple legal entities or business units within one tenant.
  3. Follow the business scenario the workbook gives: "Entities have their own numbering series, approval chains, and cost centers within one shared tenant".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: a single Procol instance serves the organisation's whole group. The business use case is served: entities have their own numbering series, approval chains, and cost centers within one shared tenant.
- **Oracle.** Observable proof that Multi-Entity / Multi-Org Configuration did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-022.
- **Trace.** P3 · manual · `FEAT-PLT-022` · workbook sheet "23. Platform Settings"

#### PRD-PLT-073 — [Roadmap] Multi-Entity / Multi-Org Configuration: cross-entity reporting must still be possible for group finance

- **Why it matters.** The workbook records this edge case for Multi-Entity / Multi-Org Configuration: "Cross-entity reporting must still be possible for group finance".
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup.
  2. Set up the situation the note describes: "Cross-entity reporting must still be possible for group finance".
  3. Use Multi-Entity / Multi-Org Configuration to configure multiple legal entities or business units within one tenant.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Multi-Entity / Multi-Org Configuration behaves as the workbook states: "Cross-entity reporting must still be possible for group finance".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PLT-022 quoting the note.
- **Trace.** P3 · manual · `FEAT-PLT-022` · workbook sheet "23. Platform Settings"

#### PRD-PLT-074 — [Roadmap] Multi-Entity / Multi-Org Configuration: not available on the Growth plan

- **Why it matters.** The workbook limits Multi-Entity / Multi-Org Configuration to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Multi-Entity / Multi-Org Configuration to configure multiple legal entities or business units within one tenant.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-PLT-022` · workbook sheet "23. Platform Settings"

#### PRD-PLT-075 — [Roadmap] Multi-Entity / Multi-Org Configuration: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Multi-Entity / Multi-Org Configuration. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Multi-Entity / Multi-Org Configuration to configure multiple legal entities or business units within one tenant.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P3 · manual · `FEAT-PLT-022` · workbook sheet "23. Platform Settings"

#### PRD-PLT-076 — [Roadmap] Notification Preference Center (Email/SMS/WhatsApp): happy path for the All Users

- **Why it matters.** Improves the odds that time-sensitive alerts are actually seen. Business use: Users configure channel preferences per notification type (approval pending, ASN alert, budget threshold, etc.).
- **Setup.**
  Persona: All Users.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an All Users on the tenant described in Setup and open Platform Settings (Approvals, Access, Cost Centers, Analytics).
  2. Choose how they are notified (email, SMS, WhatsApp, in-app).
  3. Follow the business scenario the workbook gives: "Users configure channel preferences per notification type (approval pending, ASN alert, budget threshold, etc.)".
  4. Check the result against the story's promised outcome.
- **Expected.** The All Users achieves the story's outcome: alerts reach them the way they actually check them. The business use case is served: users configure channel preferences per notification type (approval pending, ASN alert, budget threshold, etc.).
- **Oracle.** Observable proof that Notification Preference Center (Email/SMS/WhatsApp) did its job for the All Users — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PLT-023.
- **Trace.** P3 · manual · `FEAT-PLT-023` · workbook sheet "23. Platform Settings"

#### PRD-PLT-077 — [Roadmap] Notification Preference Center (Email/SMS/WhatsApp): whatsApp/SMS require the relevant integration to be enabled for the tenant

- **Why it matters.** The workbook records this edge case for Notification Preference Center (Email/SMS/WhatsApp): "WhatsApp/SMS require the relevant integration to be enabled for the tenant".
- **Setup.**
  Persona: All Users.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an All Users on the tenant described in Setup.
  2. Set up the situation the note describes: "WhatsApp/SMS require the relevant integration to be enabled for the tenant".
  3. Use Notification Preference Center (Email/SMS/WhatsApp) to choose how they are notified (email, SMS, WhatsApp, in-app).
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Notification Preference Center (Email/SMS/WhatsApp) behaves as the workbook states: "WhatsApp/SMS require the relevant integration to be enabled for the tenant".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PLT-023 quoting the note.
- **Trace.** P3 · manual · `FEAT-PLT-023` · workbook sheet "23. Platform Settings"

#### PRD-PLT-078 — [Roadmap] Notification Preference Center (Email/SMS/WhatsApp): not available on plans below Growth

- **Why it matters.** The workbook limits Notification Preference Center (Email/SMS/WhatsApp) to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: All Users.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an All Users on the lower-plan tenant.
  2. Try it: use Notification Preference Center (Email/SMS/WhatsApp) to choose how they are notified (email, SMS, WhatsApp, in-app).
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P3 · manual · `FEAT-PLT-023` · workbook sheet "23. Platform Settings"
