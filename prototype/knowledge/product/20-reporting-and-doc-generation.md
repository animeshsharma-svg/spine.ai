# 20. Reporting & Doc Generation (MOD-16) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Reporting & Doc Generation module overview
Reporting & Document Generation (MOD-16) is a Platform / Reporting module of Procol, in the "Reporting & analytics" stage of the procurement lifecycle.
Description: NFA/NTD and award-document generation plus the sourcing/vendor/PR report suite and custom report builder
Business purpose: Produce auditable approval documents and configurable reports across the procurement lifecycle
Default state: Enabled
Plan availability: Growth, Enterprise
Depends on modules: MOD-03 RFQ, MOD-14 Sourcing Events (RFX), MOD-15 PO Management
Key integrations: PDF/Excel export
Registry status: GA
Roadmap notes: NEW (provisional) - large sub-system surfaced from RFX squad sheet
Features: 8 (8 GA). Test cases: test-cases/product-20-reporting-and-doc-generation.md, group PRD-RPT.

## Reporting & Doc Generation features

8 features in 2 categories: Core, Optional.

### FEAT-RPT-001 — NFA / NTD Generation
NFA / NTD Generation is a Core feature of Reporting & Document Generation (MOD-16). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want NFA/NTD documents generated with ranks, comparison, and allocation, so that approvers get a standardized, auditable award note.
Business use case: At award; NFA/NTD documents are generated (PDF, client format) with ranks, comparison, and allocation for approvers.
Why it exists: Standardized, auditable approval documents.
Edge cases / notes: Most-shipped reporting sub-system.
Test cases: PRD-RPT-001 … PRD-RPT-003 (3).

### FEAT-RPT-002 — Letter of Award / ARN
Letter of Award / ARN is a Optional feature of Reporting & Document Generation (MOD-16). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want a NFA generated in our format, so that I can communicate the award formally.
Business use case: After award; a Letter of Award/ARN is generated in the client's format for the vendor.
Why it exists: Formal award communication.
Test cases: PRD-RPT-013 … PRD-RPT-015 (3).

### FEAT-RPT-003 — Event Reports
Event Reports is a Core feature of Reporting & Document Generation (MOD-16). Persona: Procurement Manager. Plan: All Plans. Status: GA.
User story: As a procurement manager, I want event detailed, summary, and transaction reports, so that I can review event outcomes.
Business use case: PMs and management pull event detailed/summary, bulk-event, and transaction reports.
Why it exists: Operational reporting.
Test cases: PRD-RPT-004 … PRD-RPT-005 (2).

### FEAT-RPT-004 — QCS / Comparative Reports
QCS / Comparative Reports is a Core feature of Reporting & Document Generation (MOD-16). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want QCS and comparative reports, so that I have defensible evidence for the award.
Business use case: Buyers export QCS/comparative statements and quote-selection reports as award evidence.
Why it exists: Defensible award evidence.
Test cases: PRD-RPT-006 … PRD-RPT-007 (2).

### FEAT-RPT-005 — PR & Master Data Reports
PR & Master Data Reports is a Core feature of Reporting & Document Generation (MOD-16). Persona: Procurement Manager. Plan: All Plans. Status: GA.
User story: As a procurement manager, I want PR, item-master, and vendor-master reports, so that I have visibility into demand, items, and vendors.
Business use case: Teams run PR, item-master, and vendor-master (incl. scorecard) reports for visibility.
Why it exists: Master/demand visibility.
Test cases: PRD-RPT-008 … PRD-RPT-009 (2).

### FEAT-RPT-006 — Operational Reports & Dashboards
Operational Reports & Dashboards is a Optional feature of Reporting & Document Generation (MOD-16). Persona: Procurement Manager. Plan: Enterprise. Status: GA.
User story: As a procurement manager, I want MIS, live-event, utilisation, and health reports, so that I can track adoption and performance.
Business use case: Management tracks adoption and performance via MIS, live-event, utilisation, and project-health reports.
Why it exists: Operational insight.
Test cases: PRD-RPT-016 … PRD-RPT-018 (3).

### FEAT-RPT-007 — Custom Report Builder
Custom Report Builder is a Optional feature of Reporting & Document Generation (MOD-16). Persona: Tenant Admin. Plan: Enterprise. Status: GA.
User story: As a tenant admin, I want to build custom reports with my own fields and formulas, so that reporting fits our needs.
Business use case: Admins and PMs build custom reports with their own fields, formulas, and pricing history.
Why it exists: Self-serve, client-specific reporting.
Test cases: PRD-RPT-019 … PRD-RPT-021 (3).

### FEAT-RPT-008 — Report Access & Timing Controls
Report Access & Timing Controls is a Core feature of Reporting & Document Generation (MOD-16). Persona: Tenant Admin. Plan: Enterprise. Status: GA.
User story: As a tenant admin, I want to control report access and timing, so that sensitive reports stay confidential until appropriate.
Business use case: Admins control report access and timing (e.g., block downloads before unlock; master downloads to super admin).
Why it exists: Confidentiality and integrity of reports.
Test cases: PRD-RPT-010 … PRD-RPT-012 (3).
