# Product test cases — 20. Reporting & Doc Generation (MOD-16)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-16 · 8 features · 21 cases · group `PRD-RPT` · plan availability: Growth, Enterprise · status: GA

NFA/NTD and award-document generation plus the sourcing/vendor/PR report suite and custom report builder. Produce auditable approval documents and configurable reports across the procurement lifecycle.

## 1. Core features

#### PRD-RPT-001 — NFA / NTD Generation: happy path for the Buyer

- **Why it matters.** Standardized, auditable approval documents. Business use: At award; NFA/NTD documents are generated (PDF, client format) with ranks, comparison, and allocation for approvers.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Reporting & Document Generation.
  2. Use NFA / NTD Generation to get what the story asks for: NFA/NTD documents generated with ranks, comparison, and allocation.
  3. Follow the business scenario the workbook gives: "At award; NFA/NTD documents are generated (PDF, client format) with ranks, comparison, and allocation for approvers".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: approvers get a standardized, auditable award note. The business use case is served: at award; NFA/NTD documents are generated (PDF, client format) with ranks, comparison, and allocation for approvers.
- **Oracle.** Observable proof that NFA / NTD Generation did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RPT-001.
- **Trace.** P0 · manual · `FEAT-RPT-001` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-002 — NFA / NTD Generation: not available on the Growth plan

- **Why it matters.** The workbook limits NFA / NTD Generation to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use NFA / NTD Generation to get NFA/NTD documents generated with ranks, comparison, and allocation.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RPT-001` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-003 — NFA / NTD Generation: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of NFA / NTD Generation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use NFA / NTD Generation to get NFA/NTD documents generated with ranks, comparison, and allocation.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RPT-001` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-004 — Event Reports: happy path for the Procurement Manager

- **Why it matters.** Operational reporting. Business use: PMs and management pull event detailed/summary, bulk-event, and transaction reports.
- **Setup.**
  Persona: Procurement Manager.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Reporting & Document Generation.
  2. Use Event Reports to get what the story asks for: event detailed, summary, and transaction reports.
  3. Follow the business scenario the workbook gives: "PMs and management pull event detailed/summary, bulk-event, and transaction reports".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: review event outcomes. The business use case is served: PMs and management pull event detailed/summary, bulk-event, and transaction reports.
- **Oracle.** Observable proof that Event Reports did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RPT-003.
- **Trace.** P0 · manual · `FEAT-RPT-003` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-005 — Event Reports: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of Event Reports. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Event Reports to get event detailed, summary, and transaction reports.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P1 · automate-later · `FEAT-RPT-003` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-006 — QCS / Comparative Reports: happy path for the Buyer

- **Why it matters.** Defensible award evidence. Business use: Buyers export QCS/comparative statements and quote-selection reports as award evidence.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Reporting & Document Generation.
  2. Use QCS / Comparative Reports to get what the story asks for: QCS and comparative reports.
  3. Follow the business scenario the workbook gives: "Buyers export QCS/comparative statements and quote-selection reports as award evidence".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: they have defensible evidence for the award. The business use case is served: buyers export QCS/comparative statements and quote-selection reports as award evidence.
- **Oracle.** Observable proof that QCS / Comparative Reports did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RPT-004.
- **Trace.** P0 · manual · `FEAT-RPT-004` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-007 — QCS / Comparative Reports: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of QCS / Comparative Reports. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use QCS / Comparative Reports to get QCS and comparative reports.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RPT-004` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-008 — PR & Master Data Reports: happy path for the Procurement Manager

- **Why it matters.** Master/demand visibility. Business use: Teams run PR, item-master, and vendor-master (incl. scorecard) reports for visibility.
- **Setup.**
  Persona: Procurement Manager.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Reporting & Document Generation.
  2. Use PR & Master Data Reports to get what the story asks for: PR, item-master, and vendor-master reports.
  3. Follow the business scenario the workbook gives: "Teams run PR, item-master, and vendor-master (incl. scorecard) reports for visibility".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: they have visibility into demand, items, and vendors. The business use case is served: teams run PR, item-master, and vendor-master (incl. scorecard) reports for visibility.
- **Oracle.** Observable proof that PR & Master Data Reports did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RPT-005.
- **Trace.** P0 · manual · `FEAT-RPT-005` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-009 — PR & Master Data Reports: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of PR & Master Data Reports. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PR & Master Data Reports to get PR, item-master, and vendor-master reports.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P1 · automate-later · `FEAT-RPT-005` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-010 — Report Access & Timing Controls: happy path for the Tenant Admin

- **Why it matters.** Confidentiality and integrity of reports. Business use: Admins control report access and timing (e.g., block downloads before unlock; master downloads to super admin).
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Reporting & Document Generation.
  2. Control report access and timing.
  3. Follow the business scenario the workbook gives: "Admins control report access and timing (e.g., block downloads before unlock; master downloads to super admin)".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: sensitive reports stay confidential until appropriate. The business use case is served: admins control report access and timing (e.g., block downloads before unlock; master downloads to super admin).
- **Oracle.** Observable proof that Report Access & Timing Controls did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RPT-008.
- **Trace.** P0 · manual · `FEAT-RPT-008` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-011 — Report Access & Timing Controls: not available on the Growth plan

- **Why it matters.** The workbook limits Report Access & Timing Controls to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Report Access & Timing Controls to control report access and timing.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RPT-008` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-012 — Report Access & Timing Controls: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Report Access & Timing Controls. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Report Access & Timing Controls to control report access and timing.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-RPT-008` · workbook sheet "20. Reporting & Doc Generation"

## 2. Optional features

#### PRD-RPT-013 — Letter of Award / ARN: happy path for the Buyer

- **Why it matters.** Formal award communication. Business use: After award; a Letter of Award/ARN is generated in the client's format for the vendor.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Reporting & Document Generation.
  2. Use Letter of Award / ARN to get what the story asks for: a NFA generated in the organisation's format.
  3. Follow the business scenario the workbook gives: "After award; a Letter of Award/ARN is generated in the client's format for the vendor".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: communicate the award formally. The business use case is served: after award; a Letter of Award/ARN is generated in the client's format for the vendor.
- **Oracle.** Observable proof that Letter of Award / ARN did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RPT-002.
- **Trace.** P1 · manual · `FEAT-RPT-002` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-014 — Letter of Award / ARN: not available on the Growth plan

- **Why it matters.** The workbook limits Letter of Award / ARN to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Letter of Award / ARN to get a NFA generated in the organisation's format.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RPT-002` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-015 — Letter of Award / ARN: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Letter of Award / ARN. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Letter of Award / ARN to get a NFA generated in the organisation's format.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RPT-002` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-016 — Operational Reports & Dashboards: happy path for the Procurement Manager

- **Why it matters.** Operational insight. Business use: Management tracks adoption and performance via MIS, live-event, utilisation, and project-health reports.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Reporting & Document Generation.
  2. Use Operational Reports & Dashboards to get what the story asks for: MIS, live-event, utilisation, and health reports.
  3. Follow the business scenario the workbook gives: "Management tracks adoption and performance via MIS, live-event, utilisation, and project-health reports".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: track adoption and performance. The business use case is served: management tracks adoption and performance via MIS, live-event, utilisation, and project-health reports.
- **Oracle.** Observable proof that Operational Reports & Dashboards did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RPT-006.
- **Trace.** P1 · manual · `FEAT-RPT-006` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-017 — Operational Reports & Dashboards: not available on the Growth plan

- **Why it matters.** The workbook limits Operational Reports & Dashboards to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the lower-plan tenant.
  2. Try it: use Operational Reports & Dashboards to get MIS, live-event, utilisation, and health reports.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RPT-006` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-018 — Operational Reports & Dashboards: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of Operational Reports & Dashboards. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Operational Reports & Dashboards to get MIS, live-event, utilisation, and health reports.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P1 · automate-later · `FEAT-RPT-006` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-019 — Custom Report Builder: happy path for the Tenant Admin

- **Why it matters.** Self-serve, client-specific reporting. Business use: Admins and PMs build custom reports with their own fields, formulas, and pricing history.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Reporting & Document Generation.
  2. Build custom reports with their own fields and formulas.
  3. Follow the business scenario the workbook gives: "Admins and PMs build custom reports with their own fields, formulas, and pricing history".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: reporting fits the organisation's needs. The business use case is served: admins and PMs build custom reports with their own fields, formulas, and pricing history.
- **Oracle.** Observable proof that Custom Report Builder did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RPT-007.
- **Trace.** P1 · manual · `FEAT-RPT-007` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-020 — Custom Report Builder: not available on the Growth plan

- **Why it matters.** The workbook limits Custom Report Builder to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Custom Report Builder to build custom reports with their own fields and formulas.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RPT-007` · workbook sheet "20. Reporting & Doc Generation"

#### PRD-RPT-021 — Custom Report Builder: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Custom Report Builder. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Custom Report Builder to build custom reports with their own fields and formulas.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-RPT-007` · workbook sheet "20. Reporting & Doc Generation"
