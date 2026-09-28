# Product test cases — 14. Quality Check (MOD-20)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-20 · 21 features · 83 cases · group `PRD-QC` · plan availability: All Plans · status: GA

Quality inspection (incl. MDCC, FAT, PDI) with configurable checklists and outcomes.

## 1. Core features

#### PRD-QC-001 — Configurable QC Checklist per Item/Category: happy path for the Quality Inspector

- **Why it matters.** Standardizes inspection quality across inspectors and categories. Business use: Checklist items, pass/fail criteria, and required evidence are set up per category (e.g., raw material vs. finished goods).
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Use Configurable QC Checklist per Item/Category to get what the story asks for: a checklist configured per item or category.
  3. Follow the business scenario the workbook gives: "Checklist items, pass/fail criteria, and required evidence are set up per category (e.g., raw material vs. finished goods)".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Inspector achieves the story's outcome: inspections are consistent and category-appropriate. The business use case is served: checklist items, pass/fail criteria, and required evidence are set up per category (e.g., raw material vs. finished goods).
- **Oracle.** Observable proof that Configurable QC Checklist per Item/Category did its job for the Quality Inspector — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-001.
- **Trace.** P0 · manual · `FEAT-QC-001` · workbook sheet "14. Quality Check"

#### PRD-QC-002 — Configurable QC Checklist per Item/Category: checklist versioning needed so historical inspections reference the checklist…

- **Why it matters.** The workbook records this edge case for Configurable QC Checklist per Item/Category: "Checklist versioning needed so historical inspections reference the checklist used at the time".
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup.
  2. Set up the situation the note describes: "Checklist versioning needed so historical inspections reference the checklist used at the time".
  3. Use Configurable QC Checklist per Item/Category to get a checklist configured per item or category.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Configurable QC Checklist per Item/Category behaves as the workbook states: "Checklist versioning needed so historical inspections reference the checklist used at the time".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-QC-001 quoting the note.
- **Trace.** P2 · manual · `FEAT-QC-001` · workbook sheet "14. Quality Check"

#### PRD-QC-003 — Configurable QC Checklist per Item/Category: not available on the Growth plan

- **Why it matters.** The workbook limits Configurable QC Checklist per Item/Category to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Inspector on the lower-plan tenant.
  2. Try it: use Configurable QC Checklist per Item/Category to get a checklist configured per item or category.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-QC-001` · workbook sheet "14. Quality Check"

#### PRD-QC-004 — Configurable QC Checklist per Item/Category: refused for a user without the Quality Inspector role

- **Why it matters.** The workbook names Quality Inspector as the user of Configurable QC Checklist per Item/Category. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Configurable QC Checklist per Item/Category to get a checklist configured per item or category.
  3. Repeat as a Quality Inspector.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Inspector can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Inspector.
- **Trace.** P1 · automate-later · `FEAT-QC-001` · workbook sheet "14. Quality Check"

#### PRD-QC-005 — QC Hold on GRN Pending Inspection: happy path for the Quality Inspector

- **Why it matters.** Prevents unchecked goods from entering use ahead of quality sign-off. Business use: Linked directly to GRN: category flagged for QC auto-holds the GRN until inspection is logged.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Use QC Hold on GRN Pending Inspection to get what the story asks for: QC-mandatory GRNs held automatically.
  3. Follow the business scenario the workbook gives: "Linked directly to GRN: category flagged for QC auto-holds the GRN until inspection is logged".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Inspector achieves the story's outcome: unchecked goods can't move into consumption or invoicing. The business use case is served: linked directly to GRN: category flagged for QC auto-holds the GRN until inspection is logged.
- **Oracle.** Observable proof that QC Hold on GRN Pending Inspection did its job for the Quality Inspector — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-002.
- **Trace.** P0 · manual · `FEAT-QC-002` · workbook sheet "14. Quality Check"

#### PRD-QC-006 — QC Hold on GRN Pending Inspection: hold release should be system-driven on inspection completion, not manual

- **Why it matters.** The workbook records this edge case for QC Hold on GRN Pending Inspection: "Hold release should be system-driven on inspection completion, not manual".
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup.
  2. Set up the situation the note describes: "Hold release should be system-driven on inspection completion, not manual".
  3. Use QC Hold on GRN Pending Inspection to get QC-mandatory GRNs held automatically.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** QC Hold on GRN Pending Inspection behaves as the workbook states: "Hold release should be system-driven on inspection completion, not manual".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-QC-002 quoting the note.
- **Trace.** P2 · manual · `FEAT-QC-002` · workbook sheet "14. Quality Check"

#### PRD-QC-007 — QC Hold on GRN Pending Inspection: not available on the Growth plan

- **Why it matters.** The workbook limits QC Hold on GRN Pending Inspection to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Inspector on the lower-plan tenant.
  2. Try it: use QC Hold on GRN Pending Inspection to get QC-mandatory GRNs held automatically.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-QC-002` · workbook sheet "14. Quality Check"

#### PRD-QC-008 — QC Hold on GRN Pending Inspection: refused for a user without the Quality Inspector role

- **Why it matters.** The workbook names Quality Inspector as the user of QC Hold on GRN Pending Inspection. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use QC Hold on GRN Pending Inspection to get QC-mandatory GRNs held automatically.
  3. Repeat as a Quality Inspector.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Inspector can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Inspector.
- **Trace.** P1 · automate-later · `FEAT-QC-002` · workbook sheet "14. Quality Check"

#### PRD-QC-009 — QC Pass / Fail / Partial-Accept Decisioning: happy path for the Quality Inspector

- **Why it matters.** Reflects real inspection outcomes where part of a batch may be acceptable. Business use: Inspector records a graded outcome per batch/lot rather than a binary result.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Record pass, fail, or partial-accept against a batch.
  3. Follow the business scenario the workbook gives: "Inspector records a graded outcome per batch/lot rather than a binary result".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Inspector achieves the story's outcome: mixed-quality deliveries are handled precisely. The business use case is served: inspector records a graded outcome per batch/lot rather than a binary result.
- **Oracle.** Observable proof that QC Pass / Fail / Partial-Accept Decisioning did its job for the Quality Inspector — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-003.
- **Trace.** P0 · manual · `FEAT-QC-003` · workbook sheet "14. Quality Check"

#### PRD-QC-010 — QC Pass / Fail / Partial-Accept Decisioning: partial-accept quantity must flow correctly into GRN and invoicing

- **Why it matters.** The workbook records this edge case for QC Pass / Fail / Partial-Accept Decisioning: "Partial-accept quantity must flow correctly into GRN and invoicing".
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup.
  2. Set up the situation the note describes: "Partial-accept quantity must flow correctly into GRN and invoicing".
  3. Use QC Pass / Fail / Partial-Accept Decisioning to record pass, fail, or partial-accept against a batch.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** QC Pass / Fail / Partial-Accept Decisioning behaves as the workbook states: "Partial-accept quantity must flow correctly into GRN and invoicing".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-QC-003 quoting the note.
- **Trace.** P2 · manual · `FEAT-QC-003` · workbook sheet "14. Quality Check"

#### PRD-QC-011 — QC Pass / Fail / Partial-Accept Decisioning: not available on the Growth plan

- **Why it matters.** The workbook limits QC Pass / Fail / Partial-Accept Decisioning to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Inspector on the lower-plan tenant.
  2. Try it: use QC Pass / Fail / Partial-Accept Decisioning to record pass, fail, or partial-accept against a batch.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-QC-003` · workbook sheet "14. Quality Check"

#### PRD-QC-012 — QC Pass / Fail / Partial-Accept Decisioning: refused for a user without the Quality Inspector role

- **Why it matters.** The workbook names Quality Inspector as the user of QC Pass / Fail / Partial-Accept Decisioning. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use QC Pass / Fail / Partial-Accept Decisioning to record pass, fail, or partial-accept against a batch.
  3. Repeat as a Quality Inspector.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Inspector can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Inspector.
- **Trace.** P1 · automate-later · `FEAT-QC-003` · workbook sheet "14. Quality Check"

#### PRD-QC-013 — QC Approval Workflow: happy path for the Quality Manager

- **Why it matters.** Adds a control layer for consequential quality decisions. Business use: High-value or high-risk inspection outcomes route to a quality manager for approval before the result is finalized.
- **Setup.**
  Persona: Quality Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Manager on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Use QC Approval Workflow to get what the story asks for: inspection results above a risk threshold to require sign-off.
  3. Follow the business scenario the workbook gives: "High-value or high-risk inspection outcomes route to a quality manager for approval before the result is finalized".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Manager achieves the story's outcome: critical quality decisions aren't made unilaterally. The business use case is served: high-value or high-risk inspection outcomes route to a quality manager for approval before the result is finalized.
- **Oracle.** Observable proof that QC Approval Workflow did its job for the Quality Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-007.
- **Trace.** P0 · manual · `FEAT-QC-007` · workbook sheet "14. Quality Check"

#### PRD-QC-014 — QC Approval Workflow: tenant configuration — Threshold for mandatory sign-off is configurable

- **Why it matters.** The workbook says "Threshold for mandatory sign-off is configurable". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Quality Manager (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Threshold for mandatory sign-off is configurable") and record its current value.
  2. As the Quality Manager: use QC Approval Workflow to get inspection results above a risk threshold to require sign-off.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs QC Approval Workflow follows the tenant's configured value, as the workbook states: "Threshold for mandatory sign-off is configurable". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-QC-007` · workbook sheet "14. Quality Check"

#### PRD-QC-015 — QC Approval Workflow: not available on the Growth plan

- **Why it matters.** The workbook limits QC Approval Workflow to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Manager on the lower-plan tenant.
  2. Try it: use QC Approval Workflow to get inspection results above a risk threshold to require sign-off.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-QC-007` · workbook sheet "14. Quality Check"

#### PRD-QC-016 — QC Approval Workflow: refused for a user without the Quality Manager role

- **Why it matters.** The workbook names Quality Manager as the user of QC Approval Workflow. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use QC Approval Workflow to get inspection results above a risk threshold to require sign-off.
  3. Repeat as a Quality Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Manager.
- **Trace.** P1 · automate-later · `FEAT-QC-007` · workbook sheet "14. Quality Check"

#### PRD-QC-017 — MDCC Request Initiation: happy path for the Quality Inspector

- **Why it matters.** Formalizes the pre-dispatch clearance gate for critical materials. Business use: Buyer/QC team raises an MDCC request against a PO/batch ahead of vendor dispatch.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Initiate a Material Dispatch Clearance Certificate request.
  3. Follow the business scenario the workbook gives: "Buyer/QC team raises an MDCC request against a PO/batch ahead of vendor dispatch".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Inspector achieves the story's outcome: dispatch clearance is formally triggered before goods leave the vendor. The business use case is served: buyer/QC team raises an MDCC request against a PO/batch ahead of vendor dispatch.
- **Oracle.** Observable proof that MDCC Request Initiation did its job for the Quality Inspector — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-010.
- **Trace.** P0 · manual · `FEAT-QC-010` · workbook sheet "14. Quality Check"

#### PRD-QC-018 — MDCC Request Initiation: tenant configuration — Should be configurable as mandatory for specific categories only

- **Why it matters.** The workbook says "Should be configurable as mandatory for specific categories only". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Quality Inspector (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Should be configurable as mandatory for specific categories only") and record its current value.
  2. As the Quality Inspector: use MDCC Request Initiation to initiate a Material Dispatch Clearance Certificate request.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs MDCC Request Initiation follows the tenant's configured value, as the workbook states: "Should be configurable as mandatory for specific categories only". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-QC-010` · workbook sheet "14. Quality Check"

#### PRD-QC-019 — MDCC Request Initiation: not available on the Growth plan

- **Why it matters.** The workbook limits MDCC Request Initiation to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Inspector on the lower-plan tenant.
  2. Try it: use MDCC Request Initiation to initiate a Material Dispatch Clearance Certificate request.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-QC-010` · workbook sheet "14. Quality Check"

#### PRD-QC-020 — MDCC Request Initiation: refused for a user without the Quality Inspector role

- **Why it matters.** The workbook names Quality Inspector as the user of MDCC Request Initiation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use MDCC Request Initiation to initiate a Material Dispatch Clearance Certificate request.
  3. Repeat as a Quality Inspector.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Inspector can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Inspector.
- **Trace.** P1 · automate-later · `FEAT-QC-010` · workbook sheet "14. Quality Check"

#### PRD-QC-021 — MDCC Inspection Scheduling: happy path for the Quality Inspector

- **Why it matters.** Prevents dispatch delays caused by unscheduled inspection. Business use: Inspection date/location is scheduled and communicated to the vendor and inspecting party.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Schedule the MDCC inspection with the vendor.
  3. Follow the business scenario the workbook gives: "Inspection date/location is scheduled and communicated to the vendor and inspecting party".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Inspector achieves the story's outcome: dispatch clearance inspection happens on time. The business use case is served: inspection date/location is scheduled and communicated to the vendor and inspecting party.
- **Oracle.** Observable proof that MDCC Inspection Scheduling did its job for the Quality Inspector — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-011.
- **Trace.** P0 · manual · `FEAT-QC-011` · workbook sheet "14. Quality Check"

#### PRD-QC-022 — MDCC Inspection Scheduling: should support third-party inspection agencies, not just internal QC staff

- **Why it matters.** The workbook records this edge case for MDCC Inspection Scheduling: "Should support third-party inspection agencies, not just internal QC staff". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup.
  2. Set up the situation the note describes: "Should support third-party inspection agencies, not just internal QC staff".
  3. Use MDCC Inspection Scheduling to schedule the MDCC inspection with the vendor.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** MDCC Inspection Scheduling behaves as the workbook states: "Should support third-party inspection agencies, not just internal QC staff".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-QC-011 quoting the note.
- **Trace.** P2 · manual · `FEAT-QC-011` · workbook sheet "14. Quality Check"

#### PRD-QC-023 — MDCC Inspection Scheduling: not available on the Growth plan

- **Why it matters.** The workbook limits MDCC Inspection Scheduling to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Inspector on the lower-plan tenant.
  2. Try it: use MDCC Inspection Scheduling to schedule the MDCC inspection with the vendor.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-QC-011` · workbook sheet "14. Quality Check"

#### PRD-QC-024 — MDCC Inspection Scheduling: refused for a user without the Quality Inspector role

- **Why it matters.** The workbook names Quality Inspector as the user of MDCC Inspection Scheduling. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use MDCC Inspection Scheduling to schedule the MDCC inspection with the vendor.
  3. Repeat as a Quality Inspector.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Inspector can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Inspector.
- **Trace.** P1 · automate-later · `FEAT-QC-011` · workbook sheet "14. Quality Check"

#### PRD-QC-025 — MDCC Certificate Generation & Dispatch Clearance: happy path for the Quality Inspector

- **Why it matters.** Creates an auditable, formal record of dispatch authorization. Business use: On a pass outcome, a certificate is generated and attached, unlocking the vendor's dispatch step.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Generate the MDCC on a passed inspection.
  3. Follow the business scenario the workbook gives: "On a pass outcome, a certificate is generated and attached, unlocking the vendor's dispatch step".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Inspector achieves the story's outcome: the vendor is formally cleared to dispatch. The business use case is served: on a pass outcome, a certificate is generated and attached, unlocking the vendor's dispatch step.
- **Oracle.** Observable proof that MDCC Certificate Generation & Dispatch Clearance did its job for the Quality Inspector — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-012.
- **Trace.** P0 · manual · `FEAT-QC-012` · workbook sheet "14. Quality Check"

#### PRD-QC-026 — MDCC Certificate Generation & Dispatch Clearance: certificate should be visible to the vendor via portal, not just internally

- **Why it matters.** The workbook records this edge case for MDCC Certificate Generation & Dispatch Clearance: "Certificate should be visible to the vendor via portal, not just internally".
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup.
  2. Set up the situation the note describes: "Certificate should be visible to the vendor via portal, not just internally".
  3. Use MDCC Certificate Generation & Dispatch Clearance to generate the MDCC on a passed inspection.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** MDCC Certificate Generation & Dispatch Clearance behaves as the workbook states: "Certificate should be visible to the vendor via portal, not just internally".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-QC-012 quoting the note.
- **Trace.** P2 · manual · `FEAT-QC-012` · workbook sheet "14. Quality Check"

#### PRD-QC-027 — MDCC Certificate Generation & Dispatch Clearance: not available on the Growth plan

- **Why it matters.** The workbook limits MDCC Certificate Generation & Dispatch Clearance to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Inspector on the lower-plan tenant.
  2. Try it: use MDCC Certificate Generation & Dispatch Clearance to generate the MDCC on a passed inspection.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-QC-012` · workbook sheet "14. Quality Check"

#### PRD-QC-028 — MDCC Certificate Generation & Dispatch Clearance: refused for a user without the Quality Inspector role

- **Why it matters.** The workbook names Quality Inspector as the user of MDCC Certificate Generation & Dispatch Clearance. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use MDCC Certificate Generation & Dispatch Clearance to generate the MDCC on a passed inspection.
  3. Repeat as a Quality Inspector.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Inspector can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Inspector.
- **Trace.** P1 · automate-later · `FEAT-QC-012` · workbook sheet "14. Quality Check"

#### PRD-QC-029 — FAT Scheduling & Checklist: happy path for the Quality Manager

- **Why it matters.** Verifies equipment performance at the factory before costly shipment and installation. Business use: FAT date, location, and test checklist are set up against the relevant PO milestone, typically for capex/equipment POs.
- **Setup.**
  Persona: Quality Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
  Context from the workbook: Typically applies to capex/equipment categories, not routine materials.
- **Steps.**
  1. Sign in as a Quality Manager on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Schedule a Factory Acceptance Test with a defined checklist.
  3. Follow the business scenario the workbook gives: "FAT date, location, and test checklist are set up against the relevant PO milestone, typically for capex/equipment POs".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Manager achieves the story's outcome: capital equipment is verified before shipment. The business use case is served: FAT date, location, and test checklist are set up against the relevant PO milestone, typically for capex/equipment POs.
- **Oracle.** Observable proof that FAT Scheduling & Checklist did its job for the Quality Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-014.
- **Trace.** P0 · manual · `FEAT-QC-014` · workbook sheet "14. Quality Check"

#### PRD-QC-030 — FAT Scheduling & Checklist: not available on the Growth plan

- **Why it matters.** The workbook limits FAT Scheduling & Checklist to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Manager on the lower-plan tenant.
  2. Try it: use FAT Scheduling & Checklist to schedule a Factory Acceptance Test with a defined checklist.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-QC-014` · workbook sheet "14. Quality Check"

#### PRD-QC-031 — FAT Scheduling & Checklist: refused for a user without the Quality Manager role

- **Why it matters.** The workbook names Quality Manager as the user of FAT Scheduling & Checklist. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use FAT Scheduling & Checklist to schedule a Factory Acceptance Test with a defined checklist.
  3. Repeat as a Quality Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Manager.
- **Trace.** P1 · automate-later · `FEAT-QC-014` · workbook sheet "14. Quality Check"

#### PRD-QC-032 — FAT Report Upload & Sign-off: happy path for the Quality Manager

- **Why it matters.** Formal, auditable record of equipment acceptance. Business use: Test results and witness sign-offs are attached to the FAT record before the PO milestone is marked cleared.
- **Setup.**
  Persona: Quality Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Manager on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Upload the FAT report and record multi-party sign-off.
  3. Follow the business scenario the workbook gives: "Test results and witness sign-offs are attached to the FAT record before the PO milestone is marked cleared".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Manager achieves the story's outcome: equipment acceptance is formally documented. The business use case is served: test results and witness sign-offs are attached to the FAT record before the PO milestone is marked cleared.
- **Oracle.** Observable proof that FAT Report Upload & Sign-off did its job for the Quality Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-016.
- **Trace.** P0 · manual · `FEAT-QC-016` · workbook sheet "14. Quality Check"

#### PRD-QC-033 — FAT Report Upload & Sign-off: should require all designated witnesses to sign before completion

- **Why it matters.** The workbook records this edge case for FAT Report Upload & Sign-off: "Should require all designated witnesses to sign before completion". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Quality Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Should require all designated witnesses to sign before completion".
  3. Use FAT Report Upload & Sign-off to upload the FAT report and record multi-party sign-off.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** FAT Report Upload & Sign-off behaves as the workbook states: "Should require all designated witnesses to sign before completion".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-QC-016 quoting the note.
- **Trace.** P2 · manual · `FEAT-QC-016` · workbook sheet "14. Quality Check"

#### PRD-QC-034 — FAT Report Upload & Sign-off: not available on the Growth plan

- **Why it matters.** The workbook limits FAT Report Upload & Sign-off to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Quality Manager on the lower-plan tenant.
  2. Try it: use FAT Report Upload & Sign-off to upload the FAT report and record multi-party sign-off.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-QC-016` · workbook sheet "14. Quality Check"

#### PRD-QC-035 — FAT Report Upload & Sign-off: refused for a user without the Quality Manager role

- **Why it matters.** The workbook names Quality Manager as the user of FAT Report Upload & Sign-off. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use FAT Report Upload & Sign-off to upload the FAT report and record multi-party sign-off.
  3. Repeat as a Quality Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Manager.
- **Trace.** P1 · automate-later · `FEAT-QC-016` · workbook sheet "14. Quality Check"

## 2. Roadmap features — not in the product yet (acceptance specifications)

#### PRD-QC-036 — [Roadmap] Sampling Plan Configuration (AQL-Based): happy path for the Quality Manager

- **Why it matters.** Balances inspection thoroughness against inspection cost/time. Business use: Sample size and acceptance/rejection numbers are derived from a configured AQL table per category.
- **Setup.**
  Persona: Quality Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Manager on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Configure an AQL-based sampling plan.
  3. Follow the business scenario the workbook gives: "Sample size and acceptance/rejection numbers are derived from a configured AQL table per category".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Manager achieves the story's outcome: inspection effort is proportionate to batch size and risk. The business use case is served: sample size and acceptance/rejection numbers are derived from a configured AQL table per category.
- **Oracle.** Observable proof that Sampling Plan Configuration (AQL-Based) did its job for the Quality Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-004.
- **Trace.** P3 · manual · `FEAT-QC-004` · workbook sheet "14. Quality Check"

#### PRD-QC-037 — [Roadmap] Sampling Plan Configuration (AQL-Based): should support standard AQL tables (e.g., ISO 2859-1) as a default

- **Why it matters.** The workbook records this edge case for Sampling Plan Configuration (AQL-Based): "Should support standard AQL tables (e.g., ISO 2859-1) as a default". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Quality Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Should support standard AQL tables (e.g., ISO 2859-1) as a default".
  3. Use Sampling Plan Configuration (AQL-Based) to configure an AQL-based sampling plan.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Sampling Plan Configuration (AQL-Based) behaves as the workbook states: "Should support standard AQL tables (e.g., ISO 2859-1) as a default".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-QC-004 quoting the note.
- **Trace.** P3 · manual · `FEAT-QC-004` · workbook sheet "14. Quality Check"

#### PRD-QC-038 — [Roadmap] Sampling Plan Configuration (AQL-Based): not available on the Growth plan

- **Why it matters.** The workbook limits Sampling Plan Configuration (AQL-Based) to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Manager on the lower-plan tenant.
  2. Try it: use Sampling Plan Configuration (AQL-Based) to configure an AQL-based sampling plan.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-QC-004` · workbook sheet "14. Quality Check"

#### PRD-QC-039 — [Roadmap] Sampling Plan Configuration (AQL-Based): refused for a user without the Quality Manager role

- **Why it matters.** The workbook names Quality Manager as the user of Sampling Plan Configuration (AQL-Based). If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Sampling Plan Configuration (AQL-Based) to configure an AQL-based sampling plan.
  3. Repeat as a Quality Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Manager.
- **Trace.** P3 · manual · `FEAT-QC-004` · workbook sheet "14. Quality Check"

#### PRD-QC-040 — [Roadmap] QC Rejection → Auto Debit Note / RTV Trigger: happy path for the Quality Inspector

- **Why it matters.** Closes the loop from quality failure to financial/physical recovery without manual handoff. Business use: A failed inspection routes directly into the Return-to-Vendor and/or Credit/Debit Note workflow.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Use QC Rejection → Auto Debit Note / RTV Trigger to get what the story asks for: a QC failure to automatically initiate an RTV or debit note.
  3. Follow the business scenario the workbook gives: "A failed inspection routes directly into the Return-to-Vendor and/or Credit/Debit Note workflow".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Inspector achieves the story's outcome: rejected goods have an immediate recovery path. The business use case is served: a failed inspection routes directly into the Return-to-Vendor and/or Credit/Debit Note workflow.
- **Oracle.** Observable proof that QC Rejection → Auto Debit Note / RTV Trigger did its job for the Quality Inspector — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-005.
- **Trace.** P3 · manual · `FEAT-QC-005` · workbook sheet "14. Quality Check"

#### PRD-QC-041 — [Roadmap] QC Rejection → Auto Debit Note / RTV Trigger: should respect open items: vendor dispute rights before deduction is finalized

- **Why it matters.** The workbook records this edge case for QC Rejection → Auto Debit Note / RTV Trigger: "Should respect open items: vendor dispute rights before deduction is finalized". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup.
  2. Set up the situation the note describes: "Should respect open items: vendor dispute rights before deduction is finalized".
  3. Use QC Rejection → Auto Debit Note / RTV Trigger to get a QC failure to automatically initiate an RTV or debit note.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** QC Rejection → Auto Debit Note / RTV Trigger behaves as the workbook states: "Should respect open items: vendor dispute rights before deduction is finalized".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-QC-005 quoting the note.
- **Trace.** P3 · manual · `FEAT-QC-005` · workbook sheet "14. Quality Check"

#### PRD-QC-042 — [Roadmap] QC Rejection → Auto Debit Note / RTV Trigger: not available on the Growth plan

- **Why it matters.** The workbook limits QC Rejection → Auto Debit Note / RTV Trigger to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the lower-plan tenant.
  2. Try it: use QC Rejection → Auto Debit Note / RTV Trigger to get a QC failure to automatically initiate an RTV or debit note.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-QC-005` · workbook sheet "14. Quality Check"

#### PRD-QC-043 — [Roadmap] QC Rejection → Auto Debit Note / RTV Trigger: refused for a user without the Quality Inspector role

- **Why it matters.** The workbook names Quality Inspector as the user of QC Rejection → Auto Debit Note / RTV Trigger. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use QC Rejection → Auto Debit Note / RTV Trigger to get a QC failure to automatically initiate an RTV or debit note.
  3. Repeat as a Quality Inspector.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Inspector can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Inspector.
- **Trace.** P3 · manual · `FEAT-QC-005` · workbook sheet "14. Quality Check"

#### PRD-QC-044 — [Roadmap] QC Certificate Upload & Repository: happy path for the Quality Inspector

- **Why it matters.** Centralizes quality documentation for audits and disputes. Business use: COAs, test reports, and third-party certification are stored against the relevant GRN/batch.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Attach test/inspection certificates to a QC record.
  3. Follow the business scenario the workbook gives: "COAs, test reports, and third-party certification are stored against the relevant GRN/batch".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Inspector achieves the story's outcome: compliance documentation is centrally retrievable. The business use case is served: COAs, test reports, and third-party certification are stored against the relevant GRN/batch.
- **Oracle.** Observable proof that QC Certificate Upload & Repository did its job for the Quality Inspector — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-006.
- **Trace.** P3 · manual · `FEAT-QC-006` · workbook sheet "14. Quality Check"

#### PRD-QC-045 — [Roadmap] QC Certificate Upload & Repository: should support expiry tracking for time-bound certifications

- **Why it matters.** The workbook records this edge case for QC Certificate Upload & Repository: "Should support expiry tracking for time-bound certifications". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup.
  2. Set up the situation the note describes: "Should support expiry tracking for time-bound certifications".
  3. Use QC Certificate Upload & Repository to attach test/inspection certificates to a QC record.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** QC Certificate Upload & Repository behaves as the workbook states: "Should support expiry tracking for time-bound certifications".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-QC-006 quoting the note.
- **Trace.** P3 · manual · `FEAT-QC-006` · workbook sheet "14. Quality Check"

#### PRD-QC-046 — [Roadmap] QC Certificate Upload & Repository: not available on the Growth plan

- **Why it matters.** The workbook limits QC Certificate Upload & Repository to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the lower-plan tenant.
  2. Try it: use QC Certificate Upload & Repository to attach test/inspection certificates to a QC record.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-QC-006` · workbook sheet "14. Quality Check"

#### PRD-QC-047 — [Roadmap] QC Certificate Upload & Repository: refused for a user without the Quality Inspector role

- **Why it matters.** The workbook names Quality Inspector as the user of QC Certificate Upload & Repository. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use QC Certificate Upload & Repository to attach test/inspection certificates to a QC record.
  3. Repeat as a Quality Inspector.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Inspector can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Inspector.
- **Trace.** P3 · manual · `FEAT-QC-006` · workbook sheet "14. Quality Check"

#### PRD-QC-048 — [Roadmap] Non-Conformance Report (NCR) Tracking: happy path for the Quality Manager

- **Why it matters.** Turns individual quality failures into a trackable improvement process. Business use: Each QC failure generates an NCR that is tracked through root-cause, corrective action, and closure.
- **Setup.**
  Persona: Quality Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Manager on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Use Non-Conformance Report (NCR) Tracking to get what the story asks for: non-conformances logged and tracked to closure.
  3. Follow the business scenario the workbook gives: "Each QC failure generates an NCR that is tracked through root-cause, corrective action, and closure".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Manager achieves the story's outcome: recurring quality issues with a vendor are visible. The business use case is served: each QC failure generates an NCR that is tracked through root-cause, corrective action, and closure.
- **Oracle.** Observable proof that Non-Conformance Report (NCR) Tracking did its job for the Quality Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-008.
- **Trace.** P3 · manual · `FEAT-QC-008` · workbook sheet "14. Quality Check"

#### PRD-QC-049 — [Roadmap] Non-Conformance Report (NCR) Tracking: should aggregate into vendor quality scorecards over time

- **Why it matters.** The workbook records this edge case for Non-Conformance Report (NCR) Tracking: "Should aggregate into vendor quality scorecards over time". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Quality Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Should aggregate into vendor quality scorecards over time".
  3. Use Non-Conformance Report (NCR) Tracking to get non-conformances logged and tracked to closure.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Non-Conformance Report (NCR) Tracking behaves as the workbook states: "Should aggregate into vendor quality scorecards over time".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-QC-008 quoting the note.
- **Trace.** P3 · manual · `FEAT-QC-008` · workbook sheet "14. Quality Check"

#### PRD-QC-050 — [Roadmap] Non-Conformance Report (NCR) Tracking: not available on the Growth plan

- **Why it matters.** The workbook limits Non-Conformance Report (NCR) Tracking to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Manager on the lower-plan tenant.
  2. Try it: use Non-Conformance Report (NCR) Tracking to get non-conformances logged and tracked to closure.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-QC-008` · workbook sheet "14. Quality Check"

#### PRD-QC-051 — [Roadmap] Non-Conformance Report (NCR) Tracking: refused for a user without the Quality Manager role

- **Why it matters.** The workbook names Quality Manager as the user of Non-Conformance Report (NCR) Tracking. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Non-Conformance Report (NCR) Tracking to get non-conformances logged and tracked to closure.
  3. Repeat as a Quality Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Manager.
- **Trace.** P3 · manual · `FEAT-QC-008` · workbook sheet "14. Quality Check"

#### PRD-QC-052 — [Roadmap] Vendor QC Scorecard: happy path for the Procurement Manager

- **Why it matters.** Makes quality performance a first-class input to vendor decisions. Business use: Pass/fail/NCR history rolls up into a per-vendor quality score visible in vendor management.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Use Vendor QC Scorecard to get what the story asks for: a vendor quality scorecard.
  3. Follow the business scenario the workbook gives: "Pass/fail/NCR history rolls up into a per-vendor quality score visible in vendor management".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: inspection outcomes factor into sourcing and renewal decisions. The business use case is served: pass/fail/NCR history rolls up into a per-vendor quality score visible in vendor management.
- **Oracle.** Observable proof that Vendor QC Scorecard did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-009.
- **Trace.** P3 · manual · `FEAT-QC-009` · workbook sheet "14. Quality Check"

#### PRD-QC-053 — [Roadmap] Vendor QC Scorecard: should be visible from both the Quality and Vendor Management modules

- **Why it matters.** The workbook records this edge case for Vendor QC Scorecard: "Should be visible from both the Quality and Vendor Management modules". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Should be visible from both the Quality and Vendor Management modules".
  3. Use Vendor QC Scorecard to get a vendor quality scorecard.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Vendor QC Scorecard behaves as the workbook states: "Should be visible from both the Quality and Vendor Management modules".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-QC-009 quoting the note.
- **Trace.** P3 · manual · `FEAT-QC-009` · workbook sheet "14. Quality Check"

#### PRD-QC-054 — [Roadmap] Vendor QC Scorecard: not available on the Growth plan

- **Why it matters.** The workbook limits Vendor QC Scorecard to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Procurement Manager on the lower-plan tenant.
  2. Try it: use Vendor QC Scorecard to get a vendor quality scorecard.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-QC-009` · workbook sheet "14. Quality Check"

#### PRD-QC-055 — [Roadmap] Vendor QC Scorecard: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of Vendor QC Scorecard. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor QC Scorecard to get a vendor quality scorecard.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P3 · manual · `FEAT-QC-009` · workbook sheet "14. Quality Check"

#### PRD-QC-056 — [Roadmap] MDCC Rejection & Re-Inspection Cycle: happy path for the Quality Inspector

- **Why it matters.** Prevents non-conforming goods from ever being dispatched. Business use: Failed MDCC blocks dispatch clearance and routes to a corrective-action/re-inspection loop.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Use MDCC Rejection & Re-Inspection Cycle to get what the story asks for: a failed MDCC inspection to trigger a re-inspection cycle.
  3. Follow the business scenario the workbook gives: "Failed MDCC blocks dispatch clearance and routes to a corrective-action/re-inspection loop".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Inspector achieves the story's outcome: dispatch is blocked until issues are resolved. The business use case is served: failed MDCC blocks dispatch clearance and routes to a corrective-action/re-inspection loop.
- **Oracle.** Observable proof that MDCC Rejection & Re-Inspection Cycle did its job for the Quality Inspector — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-013.
- **Trace.** P3 · manual · `FEAT-QC-013` · workbook sheet "14. Quality Check"

#### PRD-QC-057 — [Roadmap] MDCC Rejection & Re-Inspection Cycle: tenant configuration — Number of re-inspection cycles allowed should be configurable

- **Why it matters.** The workbook says "Number of re-inspection cycles allowed should be configurable". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Quality Inspector (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Number of re-inspection cycles allowed should be configurable") and record its current value.
  2. As the Quality Inspector: use MDCC Rejection & Re-Inspection Cycle to get a failed MDCC inspection to trigger a re-inspection cycle.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs MDCC Rejection & Re-Inspection Cycle follows the tenant's configured value, as the workbook states: "Number of re-inspection cycles allowed should be configurable". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P3 · manual · `FEAT-QC-013` · workbook sheet "14. Quality Check"

#### PRD-QC-058 — [Roadmap] MDCC Rejection & Re-Inspection Cycle: not available on the Growth plan

- **Why it matters.** The workbook limits MDCC Rejection & Re-Inspection Cycle to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the lower-plan tenant.
  2. Try it: use MDCC Rejection & Re-Inspection Cycle to get a failed MDCC inspection to trigger a re-inspection cycle.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-QC-013` · workbook sheet "14. Quality Check"

#### PRD-QC-059 — [Roadmap] MDCC Rejection & Re-Inspection Cycle: refused for a user without the Quality Inspector role

- **Why it matters.** The workbook names Quality Inspector as the user of MDCC Rejection & Re-Inspection Cycle. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use MDCC Rejection & Re-Inspection Cycle to get a failed MDCC inspection to trigger a re-inspection cycle.
  3. Repeat as a Quality Inspector.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Inspector can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Inspector.
- **Trace.** P3 · manual · `FEAT-QC-013` · workbook sheet "14. Quality Check"

#### PRD-QC-060 — [Roadmap] FAT Witness / Attendee Management: happy path for the Quality Manager

- **Why it matters.** Ensures the right people are present to validate and sign off the test. Business use: Attendee list (buyer engineer, third-party inspector, vendor rep) is tracked against the FAT event.
- **Setup.**
  Persona: Quality Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Manager on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Manage buyer and third-party witnesses for FAT.
  3. Follow the business scenario the workbook gives: "Attendee list (buyer engineer, third-party inspector, vendor rep) is tracked against the FAT event".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Manager achieves the story's outcome: attendance and sign-off authority are clear. The business use case is served: attendee list (buyer engineer, third-party inspector, vendor rep) is tracked against the FAT event.
- **Oracle.** Observable proof that FAT Witness / Attendee Management did its job for the Quality Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-015.
- **Trace.** P3 · manual · `FEAT-QC-015` · workbook sheet "14. Quality Check"

#### PRD-QC-061 — [Roadmap] FAT Witness / Attendee Management: should support external (non-tenant) users as invited witnesses

- **Why it matters.** The workbook records this edge case for FAT Witness / Attendee Management: "Should support external (non-tenant) users as invited witnesses". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Quality Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Should support external (non-tenant) users as invited witnesses".
  3. Use FAT Witness / Attendee Management to manage buyer and third-party witnesses for FAT.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** FAT Witness / Attendee Management behaves as the workbook states: "Should support external (non-tenant) users as invited witnesses".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-QC-015 quoting the note.
- **Trace.** P3 · manual · `FEAT-QC-015` · workbook sheet "14. Quality Check"

#### PRD-QC-062 — [Roadmap] FAT Witness / Attendee Management: not available on the Growth plan

- **Why it matters.** The workbook limits FAT Witness / Attendee Management to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Manager on the lower-plan tenant.
  2. Try it: use FAT Witness / Attendee Management to manage buyer and third-party witnesses for FAT.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-QC-015` · workbook sheet "14. Quality Check"

#### PRD-QC-063 — [Roadmap] FAT Witness / Attendee Management: refused for a user without the Quality Manager role

- **Why it matters.** The workbook names Quality Manager as the user of FAT Witness / Attendee Management. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use FAT Witness / Attendee Management to manage buyer and third-party witnesses for FAT.
  3. Repeat as a Quality Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Manager.
- **Trace.** P3 · manual · `FEAT-QC-015` · workbook sheet "14. Quality Check"

#### PRD-QC-064 — [Roadmap] FAT-Linked PO Milestone Release: happy path for the Buyer

- **Why it matters.** Ties financial/logistics milestones directly to quality verification. Business use: FAT completion is a gating condition on the relevant PO milestone.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Use FAT-Linked PO Milestone Release to get what the story asks for: the PO payment/delivery milestone to release only after FAT sign-off.
  3. Follow the business scenario the workbook gives: "FAT completion is a gating condition on the relevant PO milestone".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: we don't pay or accept shipment on unverified equipment. The business use case is served: FAT completion is a gating condition on the relevant PO milestone.
- **Oracle.** Observable proof that FAT-Linked PO Milestone Release did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-017.
- **Trace.** P3 · manual · `FEAT-QC-017` · workbook sheet "14. Quality Check"

#### PRD-QC-065 — [Roadmap] FAT-Linked PO Milestone Release: should integrate with milestone-based invoice payment tracking

- **Why it matters.** The workbook records this edge case for FAT-Linked PO Milestone Release: "Should integrate with milestone-based invoice payment tracking". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Should integrate with milestone-based invoice payment tracking".
  3. Use FAT-Linked PO Milestone Release to get the PO payment/delivery milestone to release only after FAT sign-off.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** FAT-Linked PO Milestone Release behaves as the workbook states: "Should integrate with milestone-based invoice payment tracking".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-QC-017 quoting the note.
- **Trace.** P3 · manual · `FEAT-QC-017` · workbook sheet "14. Quality Check"

#### PRD-QC-066 — [Roadmap] FAT-Linked PO Milestone Release: not available on the Growth plan

- **Why it matters.** The workbook limits FAT-Linked PO Milestone Release to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use FAT-Linked PO Milestone Release to get the PO payment/delivery milestone to release only after FAT sign-off.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-QC-017` · workbook sheet "14. Quality Check"

#### PRD-QC-067 — [Roadmap] FAT-Linked PO Milestone Release: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of FAT-Linked PO Milestone Release. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use FAT-Linked PO Milestone Release to get the PO payment/delivery milestone to release only after FAT sign-off.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P3 · manual · `FEAT-QC-017` · workbook sheet "14. Quality Check"

#### PRD-QC-068 — [Roadmap] PDI Scheduling & Checklist: happy path for the Quality Inspector

- **Why it matters.** Final quality gate immediately before goods leave the vendor. Business use: PDI date and checklist are configured per category/PO, typically closer to dispatch than FAT.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Schedule a Pre-Delivery Inspection with a defined checklist.
  3. Follow the business scenario the workbook gives: "PDI date and checklist are configured per category/PO, typically closer to dispatch than FAT".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Inspector achieves the story's outcome: goods are verified just before dispatch. The business use case is served: PDI date and checklist are configured per category/PO, typically closer to dispatch than FAT.
- **Oracle.** Observable proof that PDI Scheduling & Checklist did its job for the Quality Inspector — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-018.
- **Trace.** P3 · manual · `FEAT-QC-018` · workbook sheet "14. Quality Check"

#### PRD-QC-069 — [Roadmap] PDI Scheduling & Checklist: may run in addition to or instead of FAT depending on category

- **Why it matters.** The workbook records this edge case for PDI Scheduling & Checklist: "May run in addition to or instead of FAT depending on category".
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup.
  2. Set up the situation the note describes: "May run in addition to or instead of FAT depending on category".
  3. Use PDI Scheduling & Checklist to schedule a Pre-Delivery Inspection with a defined checklist.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** PDI Scheduling & Checklist behaves as the workbook states: "May run in addition to or instead of FAT depending on category".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-QC-018 quoting the note.
- **Trace.** P3 · manual · `FEAT-QC-018` · workbook sheet "14. Quality Check"

#### PRD-QC-070 — [Roadmap] PDI Scheduling & Checklist: not available on the Growth plan

- **Why it matters.** The workbook limits PDI Scheduling & Checklist to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the lower-plan tenant.
  2. Try it: use PDI Scheduling & Checklist to schedule a Pre-Delivery Inspection with a defined checklist.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-QC-018` · workbook sheet "14. Quality Check"

#### PRD-QC-071 — [Roadmap] PDI Scheduling & Checklist: refused for a user without the Quality Inspector role

- **Why it matters.** The workbook names Quality Inspector as the user of PDI Scheduling & Checklist. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PDI Scheduling & Checklist to schedule a Pre-Delivery Inspection with a defined checklist.
  3. Repeat as a Quality Inspector.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Inspector can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Inspector.
- **Trace.** P3 · manual · `FEAT-QC-018` · workbook sheet "14. Quality Check"

#### PRD-QC-072 — [Roadmap] PDI Report & Photo Evidence Capture: happy path for the Quality Inspector

- **Why it matters.** Provides visual, auditable evidence of pre-dispatch condition. Business use: Inspection findings and photos are logged against the PDI record.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Capture PDI results with photo evidence.
  3. Follow the business scenario the workbook gives: "Inspection findings and photos are logged against the PDI record".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Inspector achieves the story's outcome: pre-dispatch condition is documented. The business use case is served: inspection findings and photos are logged against the PDI record.
- **Oracle.** Observable proof that PDI Report & Photo Evidence Capture did its job for the Quality Inspector — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-019.
- **Trace.** P3 · manual · `FEAT-QC-019` · workbook sheet "14. Quality Check"

#### PRD-QC-073 — [Roadmap] PDI Report & Photo Evidence Capture: photo evidence should be mandatory for a fail outcome

- **Why it matters.** The workbook records this edge case for PDI Report & Photo Evidence Capture: "Photo evidence should be mandatory for a fail outcome".
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup.
  2. Set up the situation the note describes: "Photo evidence should be mandatory for a fail outcome".
  3. Use PDI Report & Photo Evidence Capture to capture PDI results with photo evidence.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** PDI Report & Photo Evidence Capture behaves as the workbook states: "Photo evidence should be mandatory for a fail outcome".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-QC-019 quoting the note.
- **Trace.** P3 · manual · `FEAT-QC-019` · workbook sheet "14. Quality Check"

#### PRD-QC-074 — [Roadmap] PDI Report & Photo Evidence Capture: not available on the Growth plan

- **Why it matters.** The workbook limits PDI Report & Photo Evidence Capture to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the lower-plan tenant.
  2. Try it: use PDI Report & Photo Evidence Capture to capture PDI results with photo evidence.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-QC-019` · workbook sheet "14. Quality Check"

#### PRD-QC-075 — [Roadmap] PDI Report & Photo Evidence Capture: refused for a user without the Quality Inspector role

- **Why it matters.** The workbook names Quality Inspector as the user of PDI Report & Photo Evidence Capture. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PDI Report & Photo Evidence Capture to capture PDI results with photo evidence.
  3. Repeat as a Quality Inspector.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Inspector can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Inspector.
- **Trace.** P3 · manual · `FEAT-QC-019` · workbook sheet "14. Quality Check"

#### PRD-QC-076 — [Roadmap] PDI Sign-off Gating Dispatch: happy path for the Quality Inspector

- **Why it matters.** Final control point before goods leave the vendor's facility. Business use: Vendor's dispatch action is gated on a passed and signed-off PDI.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Use PDI Sign-off Gating Dispatch to get what the story asks for: dispatch blocked until PDI sign-off.
  3. Follow the business scenario the workbook gives: "Vendor's dispatch action is gated on a passed and signed-off PDI".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Inspector achieves the story's outcome: non-conforming goods can't be shipped. The business use case is served: vendor's dispatch action is gated on a passed and signed-off PDI.
- **Oracle.** Observable proof that PDI Sign-off Gating Dispatch did its job for the Quality Inspector — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-020.
- **Trace.** P3 · manual · `FEAT-QC-020` · workbook sheet "14. Quality Check"

#### PRD-QC-077 — [Roadmap] PDI Sign-off Gating Dispatch: should tie into the same dispatch-clearance mechanism as MDCC where both apply

- **Why it matters.** The workbook records this edge case for PDI Sign-off Gating Dispatch: "Should tie into the same dispatch-clearance mechanism as MDCC where both apply". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup.
  2. Set up the situation the note describes: "Should tie into the same dispatch-clearance mechanism as MDCC where both apply".
  3. Use PDI Sign-off Gating Dispatch to get dispatch blocked until PDI sign-off.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** PDI Sign-off Gating Dispatch behaves as the workbook states: "Should tie into the same dispatch-clearance mechanism as MDCC where both apply".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-QC-020 quoting the note.
- **Trace.** P3 · manual · `FEAT-QC-020` · workbook sheet "14. Quality Check"

#### PRD-QC-078 — [Roadmap] PDI Sign-off Gating Dispatch: not available on the Growth plan

- **Why it matters.** The workbook limits PDI Sign-off Gating Dispatch to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the lower-plan tenant.
  2. Try it: use PDI Sign-off Gating Dispatch to get dispatch blocked until PDI sign-off.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-QC-020` · workbook sheet "14. Quality Check"

#### PRD-QC-079 — [Roadmap] PDI Sign-off Gating Dispatch: refused for a user without the Quality Inspector role

- **Why it matters.** The workbook names Quality Inspector as the user of PDI Sign-off Gating Dispatch. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PDI Sign-off Gating Dispatch to get dispatch blocked until PDI sign-off.
  3. Repeat as a Quality Inspector.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Inspector can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Inspector.
- **Trace.** P3 · manual · `FEAT-QC-020` · workbook sheet "14. Quality Check"

#### PRD-QC-080 — [Roadmap] PDI Non-Compliance Escalation: happy path for the Quality Manager

- **Why it matters.** Prevents failed inspections from silently stalling a shipment. Business use: A PDI fail auto-notifies the quality manager and category owner rather than sitting until manually reviewed.
- **Setup.**
  Persona: Quality Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Manager on the tenant described in Setup and open Quality Check (incl. MDCC, FAT, PDI).
  2. Use PDI Non-Compliance Escalation to get what the story asks for: a failed PDI escalated automatically.
  3. Follow the business scenario the workbook gives: "A PDI fail auto-notifies the quality manager and category owner rather than sitting until manually reviewed".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Manager achieves the story's outcome: dispatch-blocking issues get timely attention. The business use case is served: a PDI fail auto-notifies the quality manager and category owner rather than sitting until manually reviewed.
- **Oracle.** Observable proof that PDI Non-Compliance Escalation did its job for the Quality Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-QC-021.
- **Trace.** P3 · manual · `FEAT-QC-021` · workbook sheet "14. Quality Check"

#### PRD-QC-081 — [Roadmap] PDI Non-Compliance Escalation: tenant configuration — Escalation SLA and recipients should be configurable per category

- **Why it matters.** The workbook says "Escalation SLA and recipients should be configurable per category". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Quality Manager (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Escalation SLA and recipients should be configurable per category") and record its current value.
  2. As the Quality Manager: use PDI Non-Compliance Escalation to get a failed PDI escalated automatically.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs PDI Non-Compliance Escalation follows the tenant's configured value, as the workbook states: "Escalation SLA and recipients should be configurable per category". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P3 · manual · `FEAT-QC-021` · workbook sheet "14. Quality Check"

#### PRD-QC-082 — [Roadmap] PDI Non-Compliance Escalation: not available on the Growth plan

- **Why it matters.** The workbook limits PDI Non-Compliance Escalation to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Manager on the lower-plan tenant.
  2. Try it: use PDI Non-Compliance Escalation to get a failed PDI escalated automatically.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-QC-021` · workbook sheet "14. Quality Check"

#### PRD-QC-083 — [Roadmap] PDI Non-Compliance Escalation: refused for a user without the Quality Manager role

- **Why it matters.** The workbook names Quality Manager as the user of PDI Non-Compliance Escalation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PDI Non-Compliance Escalation to get a failed PDI escalated automatically.
  3. Repeat as a Quality Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Manager.
- **Trace.** P3 · manual · `FEAT-QC-021` · workbook sheet "14. Quality Check"
