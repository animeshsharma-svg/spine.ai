# 17. Dispute Management (MOD-24) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Dispute Management module overview
Dispute Management (MOD-24) is a Procure-to-Pay (P2P) module of Procol, in the "Procure-to-Pay (receipt → pay)" stage of the procurement lifecycle.
Description: Structured resolution of invoice/GRN/PO mismatches and disputes.
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP
Registry status: GA
Roadmap notes: Imported from downstream P2P feature list (PM).
Features: 11 (4 GA (Already in Procol), 7 Roadmap (Suggested — not in product yet)). Test cases: test-cases/product-17-dispute-management.md, group PRD-DIS.

## Dispute Management features

11 features in 4 categories: Core, Compliance, Reporting, Optional.

### FEAT-DIS-001 — Match Mismatch Dispute Case Creation
Match Mismatch Dispute Case Creation is a Core feature of Dispute Management (MOD-24). Persona: AP Executive. Plan: Growth, Enterprise. Status: GA (Already in Procol).
User story: As an AP executive, I want a 3-way/4-way match mismatch to automatically open a dispute case, so that the discrepancy is tracked and resolved on-platform.
Business use case: A discrepancy found during PO-Invoice-GRN(-QC) matching auto-creates a dispute case with all linked documents attached.
Why it exists: Keeps mismatch resolution auditable and centralized instead of happening over email.
Edge cases / notes: Case carries direct links to the PO, invoice, and GRN lines that triggered it.
Test cases: PRD-DIS-001 … PRD-DIS-004 (4).

### FEAT-DIS-002 — In-Platform Stakeholder Collaboration
In-Platform Stakeholder Collaboration is a Core feature of Dispute Management (MOD-24). Persona: AP Executive / Buyer / Vendor. Plan: Growth, Enterprise. Status: GA (Already in Procol).
User story: As a stakeholder, I want to comment and collaborate on a dispute case within the platform, so that resolution doesn't happen over scattered emails or calls.
Business use case: A comment thread with attachments sits on every dispute case, visible to all assigned stakeholders.
Why it exists: Centralizes dispute communication and keeps a permanent, auditable record of how it was resolved.
Edge cases / notes: Vendor-visible comments should be distinguishable from internal-only notes.
Test cases: PRD-DIS-005 … PRD-DIS-008 (4).

### FEAT-DIS-003 — Dispute Task Assignment to Stakeholders
Dispute Task Assignment to Stakeholders is a Core feature of Dispute Management (MOD-24). Persona: AP Manager. Plan: Growth, Enterprise. Status: GA (Already in Procol).
User story: As an AP manager, I want to assign a dispute to the correct stakeholder (buyer, vendor, warehouse, finance), so that resolution ownership is always clear.
Business use case: A dispute case is assigned or reassigned to whichever role or individual needs to act next.
Why it exists: Removes ambiguity over who owns resolving a given mismatch.
Edge cases / notes: Reassignment history is retained so ownership changes are traceable.
Test cases: PRD-DIS-009 … PRD-DIS-012 (4).

### FEAT-DIS-004 — Invoice Assignment for Processing
Invoice Assignment for Processing is a Core feature of Dispute Management (MOD-24). Persona: AP Manager. Plan: Growth, Enterprise. Status: GA (Already in Procol).
User story: As an AP manager, I want invoices routed and assigned to the correct stakeholder for processing, so that invoices don't sit unowned in a shared queue.
Business use case: Invoices are assigned to a specific AP processor or approver based on category, vendor, or exception type.
Why it exists: Prevents invoices from stalling because no one has explicit ownership of them.
Edge cases / notes: Assignment rules can be manual or auto-routed by category/vendor.
Test cases: PRD-DIS-013 … PRD-DIS-016 (4).

### FEAT-DIS-005 — Dispute Status Tracking & SLA Timers
Dispute Status Tracking & SLA Timers is a Core feature of Dispute Management (MOD-24). Persona: AP Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As an AP manager, I want each dispute's status and age tracked against an SLA, so that stale disputes are visible before they become a payment-delay problem.
Business use case: Dispute status (open, in-progress, resolved) and elapsed time are tracked and surfaced on a dashboard.
Why it exists: Turns dispute resolution into a measurable, manageable process instead of an ad-hoc one.
Edge cases / notes: SLA duration should be configurable per dispute type/category.
Test cases: PRD-DIS-017 … PRD-DIS-020 (4).

### FEAT-DIS-006 — Dispute Escalation on SLA Breach
Dispute Escalation on SLA Breach is a Core feature of Dispute Management (MOD-24). Persona: AP Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As an AP manager, I want an unresolved dispute past its SLA to escalate automatically, so that it doesn't sit indefinitely with an unresponsive stakeholder.
Business use case: A dispute untouched beyond its SLA auto-notifies the assignee's manager or a designated escalation contact.
Why it exists: Keeps dispute resolution moving without manual chasing.
Edge cases / notes: Escalation path should be configurable per stakeholder type (internal vs. vendor).
Test cases: PRD-DIS-021 … PRD-DIS-024 (4).

### FEAT-DIS-007 — Dispute Resolution Audit Trail
Dispute Resolution Audit Trail is a Compliance feature of Dispute Management (MOD-24). Persona: Tenant Admin. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a tenant admin, I want every dispute's resolution decision and justification permanently logged, so that we can demonstrate the reasoning in an audit.
Business use case: Final resolution (accepted, revised, rejected) and supporting comments are locked into an immutable audit log.
Why it exists: Provides the evidence trail auditors and finance controllers expect for financial adjustments.
Edge cases / notes: Should be exportable alongside the related credit/debit note.
Test cases: PRD-DIS-025 … PRD-DIS-028 (4).

### FEAT-DIS-008 — Dispute Root-Cause Tagging & Analytics
Dispute Root-Cause Tagging & Analytics is a Reporting feature of Dispute Management (MOD-24). Persona: Procurement Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a procurement manager, I want disputes tagged by root cause (rate, quantity, GST, quality), so that recurring patterns by vendor or category are visible.
Business use case: Each resolved dispute is tagged with a root-cause category feeding into a trend dashboard.
Why it exists: Turns individual disputes into actionable process and vendor-performance insight.
Edge cases / notes: Root-cause taxonomy should stay consistent with QC and GRN reason codes.
Test cases: PRD-DIS-029 … PRD-DIS-032 (4).

### FEAT-DIS-009 — Vendor-Facing Dispute Portal Access
Vendor-Facing Dispute Portal Access is a Core feature of Dispute Management (MOD-24). Persona: Vendor. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a vendor, I want to view and respond to disputes concerning my invoices via the vendor portal, so that I can participate in resolution directly.
Business use case: Vendors see relevant dispute cases, can comment, and can accept/dispute a proposed resolution.
Why it exists: Extends collaborative resolution to the vendor side, not just internal stakeholders.
Edge cases / notes: Vendor visibility should be scoped only to disputes concerning their own invoices.
Test cases: PRD-DIS-033 … PRD-DIS-036 (4).

### FEAT-DIS-010 — Bulk Dispute Reassignment
Bulk Dispute Reassignment is a Optional feature of Dispute Management (MOD-24). Persona: AP Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As an AP manager, I want to reassign multiple disputes at once, so that coverage gaps (e.g., a stakeholder going on leave) don't stall multiple cases individually.
Business use case: Manager selects a batch of open disputes and reassigns them to a new owner in one action.
Why it exists: Efficient workload rebalancing during absences or overload.
Edge cases / notes: Should preserve the reassignment audit trail per case, not just in bulk.
Test cases: PRD-DIS-037 … PRD-DIS-040 (4).

### FEAT-DIS-011 — Dispute-to-Credit/Debit-Note Conversion
Dispute-to-Credit/Debit-Note Conversion is a Core feature of Dispute Management (MOD-24). Persona: AP Executive. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As an AP executive, I want a resolved dispute to convert directly into a credit or debit note, so that I don't have to re-key the agreed adjustment.
Business use case: On resolution, the agreed amount and reason flow directly into a new credit/debit note pre-filled from the dispute case.
Why it exists: Removes a manual, error-prone re-entry step between resolution and the financial document.
Edge cases / notes: Should respect vendor dispute rights before the resulting deduction is locked.
Test cases: PRD-DIS-041 … PRD-DIS-044 (4).
