# 14. Quality Check (MOD-20) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Quality Check module overview
Quality Check (incl. MDCC, FAT, PDI) (MOD-20) is a Procure-to-Pay (P2P) module of Procol, in the "Procure-to-Pay (receipt → pay)" stage of the procurement lifecycle.
Description: Quality inspection (incl. MDCC, FAT, PDI) with configurable checklists and outcomes.
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP
Registry status: GA
Roadmap notes: Imported from downstream P2P feature list (PM).
Features: 21 (9 GA (Already in Procol), 12 Roadmap (Suggested — not in product yet)). Test cases: test-cases/product-14-quality-check.md, group PRD-QC.

## Quality Check features

21 features in 3 categories: Core, Optional, Reporting.

### FEAT-QC-001 — Configurable QC Checklist per Item/Category
Configurable QC Checklist per Item/Category is a Core feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Inspector. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a quality inspector, I want a checklist configured per item or category, so that inspections are consistent and category-appropriate.
Business use case: Checklist items, pass/fail criteria, and required evidence are set up per category (e.g., raw material vs. finished goods).
Why it exists: Standardizes inspection quality across inspectors and categories.
Edge cases / notes: Checklist versioning needed so historical inspections reference the checklist used at the time.
Test cases: PRD-QC-001 … PRD-QC-004 (4).

### FEAT-QC-002 — QC Hold on GRN Pending Inspection
QC Hold on GRN Pending Inspection is a Core feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Inspector. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a quality inspector, I want QC-mandatory GRNs held automatically, so that unchecked goods can't move into consumption or invoicing.
Business use case: Linked directly to GRN: category flagged for QC auto-holds the GRN until inspection is logged.
Why it exists: Prevents unchecked goods from entering use ahead of quality sign-off.
Edge cases / notes: Hold release should be system-driven on inspection completion, not manual.
Test cases: PRD-QC-005 … PRD-QC-008 (4).

### FEAT-QC-003 — QC Pass / Fail / Partial-Accept Decisioning
QC Pass / Fail / Partial-Accept Decisioning is a Core feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Inspector. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a quality inspector, I want to record pass, fail, or partial-accept against a batch, so that mixed-quality deliveries are handled precisely.
Business use case: Inspector records a graded outcome per batch/lot rather than a binary result.
Why it exists: Reflects real inspection outcomes where part of a batch may be acceptable.
Edge cases / notes: Partial-accept quantity must flow correctly into GRN and invoicing.
Test cases: PRD-QC-009 … PRD-QC-012 (4).

### FEAT-QC-004 — Sampling Plan Configuration (AQL-Based)
Sampling Plan Configuration (AQL-Based) is a Optional feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a quality manager, I want to configure an AQL-based sampling plan, so that inspection effort is proportionate to batch size and risk.
Business use case: Sample size and acceptance/rejection numbers are derived from a configured AQL table per category.
Why it exists: Balances inspection thoroughness against inspection cost/time.
Edge cases / notes: Should support standard AQL tables (e.g., ISO 2859-1) as a default.
Test cases: PRD-QC-036 … PRD-QC-039 (4).

### FEAT-QC-005 — QC Rejection → Auto Debit Note / RTV Trigger
QC Rejection → Auto Debit Note / RTV Trigger is a Core feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Inspector. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a quality inspector, I want a QC failure to automatically initiate an RTV or debit note, so that rejected goods have an immediate recovery path.
Business use case: A failed inspection routes directly into the Return-to-Vendor and/or Credit/Debit Note workflow.
Why it exists: Closes the loop from quality failure to financial/physical recovery without manual handoff.
Edge cases / notes: Should respect open items: vendor dispute rights before deduction is finalized.
Test cases: PRD-QC-040 … PRD-QC-043 (4).

### FEAT-QC-006 — QC Certificate Upload & Repository
QC Certificate Upload & Repository is a Core feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Inspector. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a quality inspector, I want to attach test/inspection certificates to a QC record, so that compliance documentation is centrally retrievable.
Business use case: COAs, test reports, and third-party certification are stored against the relevant GRN/batch.
Why it exists: Centralizes quality documentation for audits and disputes.
Edge cases / notes: Should support expiry tracking for time-bound certifications.
Test cases: PRD-QC-044 … PRD-QC-047 (4).

### FEAT-QC-007 — QC Approval Workflow
QC Approval Workflow is a Core feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Manager. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a quality manager, I want inspection results above a risk threshold to require sign-off, so that critical quality decisions aren't made unilaterally.
Business use case: High-value or high-risk inspection outcomes route to a quality manager for approval before the result is finalized.
Why it exists: Adds a control layer for consequential quality decisions.
Edge cases / notes: Threshold for mandatory sign-off is configurable.
Test cases: PRD-QC-013 … PRD-QC-016 (4).

### FEAT-QC-008 — Non-Conformance Report (NCR) Tracking
Non-Conformance Report (NCR) Tracking is a Core feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a quality manager, I want non-conformances logged and tracked to closure, so that recurring quality issues with a vendor are visible.
Business use case: Each QC failure generates an NCR that is tracked through root-cause, corrective action, and closure.
Why it exists: Turns individual quality failures into a trackable improvement process.
Edge cases / notes: Should aggregate into vendor quality scorecards over time.
Test cases: PRD-QC-048 … PRD-QC-051 (4).

### FEAT-QC-009 — Vendor QC Scorecard
Vendor QC Scorecard is a Reporting feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Procurement Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a procurement manager, I want a vendor quality scorecard, so that inspection outcomes factor into sourcing and renewal decisions.
Business use case: Pass/fail/NCR history rolls up into a per-vendor quality score visible in vendor management.
Why it exists: Makes quality performance a first-class input to vendor decisions.
Edge cases / notes: Should be visible from both the Quality and Vendor Management modules.
Test cases: PRD-QC-052 … PRD-QC-055 (4).

### FEAT-QC-010 — MDCC Request Initiation
MDCC Request Initiation is a Core feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Inspector. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a quality inspector, I want to initiate a Material Dispatch Clearance Certificate request, so that dispatch clearance is formally triggered before goods leave the vendor.
Business use case: Buyer/QC team raises an MDCC request against a PO/batch ahead of vendor dispatch.
Why it exists: Formalizes the pre-dispatch clearance gate for critical materials.
Edge cases / notes: Should be configurable as mandatory for specific categories only.
Test cases: PRD-QC-017 … PRD-QC-020 (4).

### FEAT-QC-011 — MDCC Inspection Scheduling
MDCC Inspection Scheduling is a Core feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Inspector. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a quality inspector, I want to schedule the MDCC inspection with the vendor, so that dispatch clearance inspection happens on time.
Business use case: Inspection date/location is scheduled and communicated to the vendor and inspecting party.
Why it exists: Prevents dispatch delays caused by unscheduled inspection.
Edge cases / notes: Should support third-party inspection agencies, not just internal QC staff.
Test cases: PRD-QC-021 … PRD-QC-024 (4).

### FEAT-QC-012 — MDCC Certificate Generation & Dispatch Clearance
MDCC Certificate Generation & Dispatch Clearance is a Core feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Inspector. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a quality inspector, I want to generate the MDCC on a passed inspection, so that the vendor is formally cleared to dispatch.
Business use case: On a pass outcome, a certificate is generated and attached, unlocking the vendor's dispatch step.
Why it exists: Creates an auditable, formal record of dispatch authorization.
Edge cases / notes: Certificate should be visible to the vendor via portal, not just internally.
Test cases: PRD-QC-025 … PRD-QC-028 (4).

### FEAT-QC-013 — MDCC Rejection & Re-Inspection Cycle
MDCC Rejection & Re-Inspection Cycle is a Core feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Inspector. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a quality inspector, I want a failed MDCC inspection to trigger a re-inspection cycle, so that dispatch is blocked until issues are resolved.
Business use case: Failed MDCC blocks dispatch clearance and routes to a corrective-action/re-inspection loop.
Why it exists: Prevents non-conforming goods from ever being dispatched.
Edge cases / notes: Number of re-inspection cycles allowed should be configurable.
Test cases: PRD-QC-056 … PRD-QC-059 (4).

### FEAT-QC-014 — FAT Scheduling & Checklist
FAT Scheduling & Checklist is a Core feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Manager. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a quality manager, I want to schedule a Factory Acceptance Test with a defined checklist, so that capital equipment is verified before shipment.
Business use case: FAT date, location, and test checklist are set up against the relevant PO milestone, typically for capex/equipment POs.
Why it exists: Verifies equipment performance at the factory before costly shipment and installation.
Edge cases / notes: Typically applies to capex/equipment categories, not routine materials.
Test cases: PRD-QC-029 … PRD-QC-031 (3).

### FEAT-QC-015 — FAT Witness / Attendee Management
FAT Witness / Attendee Management is a Optional feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a quality manager, I want to manage buyer and third-party witnesses for FAT, so that attendance and sign-off authority are clear.
Business use case: Attendee list (buyer engineer, third-party inspector, vendor rep) is tracked against the FAT event.
Why it exists: Ensures the right people are present to validate and sign off the test.
Edge cases / notes: Should support external (non-tenant) users as invited witnesses.
Test cases: PRD-QC-060 … PRD-QC-063 (4).

### FEAT-QC-016 — FAT Report Upload & Sign-off
FAT Report Upload & Sign-off is a Core feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Manager. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a quality manager, I want to upload the FAT report and record multi-party sign-off, so that equipment acceptance is formally documented.
Business use case: Test results and witness sign-offs are attached to the FAT record before the PO milestone is marked cleared.
Why it exists: Formal, auditable record of equipment acceptance.
Edge cases / notes: Should require all designated witnesses to sign before completion.
Test cases: PRD-QC-032 … PRD-QC-035 (4).

### FEAT-QC-017 — FAT-Linked PO Milestone Release
FAT-Linked PO Milestone Release is a Core feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Buyer. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a buyer, I want the PO payment/delivery milestone to release only after FAT sign-off, so that we don't pay or accept shipment on unverified equipment.
Business use case: FAT completion is a gating condition on the relevant PO milestone.
Why it exists: Ties financial/logistics milestones directly to quality verification.
Edge cases / notes: Should integrate with milestone-based invoice payment tracking.
Test cases: PRD-QC-064 … PRD-QC-067 (4).

### FEAT-QC-018 — PDI Scheduling & Checklist
PDI Scheduling & Checklist is a Core feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Inspector. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a quality inspector, I want to schedule a Pre-Delivery Inspection with a defined checklist, so that goods are verified just before dispatch.
Business use case: PDI date and checklist are configured per category/PO, typically closer to dispatch than FAT.
Why it exists: Final quality gate immediately before goods leave the vendor.
Edge cases / notes: May run in addition to or instead of FAT depending on category.
Test cases: PRD-QC-068 … PRD-QC-071 (4).

### FEAT-QC-019 — PDI Report & Photo Evidence Capture
PDI Report & Photo Evidence Capture is a Core feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Inspector. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a quality inspector, I want to capture PDI results with photo evidence, so that pre-dispatch condition is documented.
Business use case: Inspection findings and photos are logged against the PDI record.
Why it exists: Provides visual, auditable evidence of pre-dispatch condition.
Edge cases / notes: Photo evidence should be mandatory for a fail outcome.
Test cases: PRD-QC-072 … PRD-QC-075 (4).

### FEAT-QC-020 — PDI Sign-off Gating Dispatch
PDI Sign-off Gating Dispatch is a Core feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Inspector. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a quality inspector, I want dispatch blocked until PDI sign-off, so that non-conforming goods can't be shipped.
Business use case: Vendor's dispatch action is gated on a passed and signed-off PDI.
Why it exists: Final control point before goods leave the vendor's facility.
Edge cases / notes: Should tie into the same dispatch-clearance mechanism as MDCC where both apply.
Test cases: PRD-QC-076 … PRD-QC-079 (4).

### FEAT-QC-021 — PDI Non-Compliance Escalation
PDI Non-Compliance Escalation is a Core feature of Quality Check (incl. MDCC, FAT, PDI) (MOD-20). Persona: Quality Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a quality manager, I want a failed PDI escalated automatically, so that dispatch-blocking issues get timely attention.
Business use case: A PDI fail auto-notifies the quality manager and category owner rather than sitting until manually reviewed.
Why it exists: Prevents failed inspections from silently stalling a shipment.
Edge cases / notes: Escalation SLA and recipients should be configurable per category.
Test cases: PRD-QC-080 … PRD-QC-083 (4).
