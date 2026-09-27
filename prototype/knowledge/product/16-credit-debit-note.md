# 16. Credit-Debit Note (MOD-21) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Credit-Debit Note module overview
Credit / Debit Note (MOD-21) is a Procure-to-Pay (P2P) module of Procol, in the "Procure-to-Pay (receipt → pay)" stage of the procurement lifecycle.
Description: Credit and debit notes for post-invoice adjustments and mismatches.
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP
Registry status: GA
Roadmap notes: Imported from downstream P2P feature list (PM).
Features: 12 (5 GA (Already in Procol), 7 Roadmap (Suggested — not in product yet)). Test cases: test-cases/product-16-credit-debit-note.md, group PRD-CDN.

## Credit-Debit Note features

12 features in 3 categories: Core, Integration, Reporting.

### FEAT-CDN-001 — Credit/Debit Note Auto-Suggestion on Invoice Mismatch
Credit/Debit Note Auto-Suggestion on Invoice Mismatch is a Core feature of Credit / Debit Note (MOD-21). Persona: AP Executive. Plan: Growth, Enterprise. Status: GA (Already in Procol).
User story: As an AP executive, I want the system to suggest a credit or debit note when an invoiced item isn't found on the PO, so that mismatches are resolved through a formal document.
Business use case: When invoice-to-PO matching finds no corresponding line, the system prompts a credit or debit note instead of leaving it as an open exception.
Why it exists: Keeps every unmatched item resolved through an auditable financial document rather than an ad-hoc adjustment.
Edge cases / notes: Direction (credit vs. debit) is inferred from whether the discrepancy favors buyer or vendor.
Test cases: PRD-CDN-001 … PRD-CDN-004 (4).

### FEAT-CDN-002 — Return Note (RTV Note)
Return Note (RTV Note) is a Core feature of Credit / Debit Note (MOD-21). Persona: Warehouse Executive. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a warehouse executive, I want a return note raised when goods are sent back to the vendor, so that the physical return is documented against the original GRN.
Business use case: Return-to-vendor movements are recorded with quantity, reason, and reference to the originating GRN/QC rejection.
Why it exists: Provides the physical-movement counterpart to the financial credit/debit note.
Edge cases / notes: Should link to the QC rejection or GRN shortage that triggered it.
Test cases: PRD-CDN-005 … PRD-CDN-008 (4).

### FEAT-CDN-003 — Credit/Debit Note Approval Workflow
Credit/Debit Note Approval Workflow is a Core feature of Credit / Debit Note (MOD-21). Persona: Finance Controller. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a finance controller, I want credit/debit notes above a threshold to require approval, so that financial adjustments have a control check.
Business use case: Notes crossing a configured value threshold route for approval before posting.
Why it exists: Prevents unauthorized or erroneous financial adjustments.
Edge cases / notes: Threshold and approver chain configurable per entity.
Test cases: PRD-CDN-009 … PRD-CDN-012 (4).

### FEAT-CDN-004 — Credit/Debit Note Vendor Acknowledgment
Credit/Debit Note Vendor Acknowledgment is a Core feature of Credit / Debit Note (MOD-21). Persona: Vendor. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a vendor, I want to acknowledge or dispute a debit note raised against me, so that I have a formal chance to respond before deduction is finalized.
Business use case: Vendor receives the note via portal and can accept or raise a dispute within a defined window.
Why it exists: Preserves vendor dispute rights before a deduction is locked in.
Edge cases / notes: Deduction should not be finalized until the dispute window closes or the vendor responds.
Test cases: PRD-CDN-013 … PRD-CDN-016 (4).

### FEAT-CDN-005 — Credit/Debit Note GL/Accounting Posting Integration
Credit/Debit Note GL/Accounting Posting Integration is a Integration feature of Credit / Debit Note (MOD-21). Persona: Finance Controller. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a finance controller, I want approved notes to post automatically to the GL via ERP integration, so that the books reflect adjustments without manual journal entries.
Business use case: Approved credit/debit notes push to SAP/Oracle FI as accounting documents.
Why it exists: Removes manual journal entry and the errors that come with it.
Edge cases / notes: Posting failures need a retry/alert mechanism, not silent drop.
Test cases: PRD-CDN-017 … PRD-CDN-020 (4).

### FEAT-CDN-006 — Credit/Debit Note Aging & Ledger Reconciliation
Credit/Debit Note Aging & Ledger Reconciliation is a Reporting feature of Credit / Debit Note (MOD-21). Persona: Finance Controller. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a finance controller, I want to see open credit/debit notes by age against the vendor ledger, so that unresolved adjustments don't linger.
Business use case: Report shows outstanding notes and their offset status against future invoices or payments.
Why it exists: Ensures adjustments actually get realized, not just recorded.
Edge cases / notes: Should flag notes open beyond a configurable SLA.
Test cases: PRD-CDN-021 … PRD-CDN-024 (4).

### FEAT-CDN-007 — Quality-Rejection-Triggered Debit Note
Quality-Rejection-Triggered Debit Note is a Core feature of Credit / Debit Note (MOD-21). Persona: Quality Inspector. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a quality inspector, I want a QC rejection to auto-generate a draft debit note, so that recovery for rejected goods starts immediately.
Business use case: A failed QC inspection creates a draft debit note pending finance/vendor confirmation of the deduction amount.
Why it exists: Speeds up financial recovery for quality failures without a manual handoff.
Edge cases / notes: Should stay in draft until confirmation authority signs off on the amount — an open question flagged for confirmation-authority design.
Test cases: PRD-CDN-025 … PRD-CDN-028 (4).

### FEAT-CDN-008 — Debit Note Recovery Tracking
Debit Note Recovery Tracking is a Reporting feature of Credit / Debit Note (MOD-21). Persona: Finance Controller. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a finance controller, I want to track how a debit note is actually recovered (offset against future invoice vs. direct deduction), so that recovery is auditable end-to-end.
Business use case: Each debit note's realization method and status is tracked until fully offset or recovered.
Why it exists: Closes the loop between raising a debit note and actually recovering the value.
Edge cases / notes: Should support partial recovery across multiple future invoices.
Test cases: PRD-CDN-029 … PRD-CDN-032 (4).

### FEAT-CDN-009 — Credit/Debit Note Template Customization
Credit/Debit Note Template Customization is a Core feature of Credit / Debit Note (MOD-21). Persona: AP Executive. Plan: Growth, Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As an AP executive, I want credit/debit note templates configurable per entity, so that issued notes match our required format.
Business use case: Note layout, numbering, and required fields are configured like PO/invoice templates.
Why it exists: Consistency with the rest of the document-template framework.
Edge cases / notes: Should reuse the same templating engine as PO/invoice templates.
Test cases: PRD-CDN-033 … PRD-CDN-036 (4).

### FEAT-CDN-010 — Credit/Debit Note Numbering Series per Entity
Credit/Debit Note Numbering Series per Entity is a Core feature of Credit / Debit Note (MOD-21). Persona: Finance Controller. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a finance controller, I want a distinct, sequential numbering series per legal entity, so that notes comply with statutory numbering requirements.
Business use case: Numbering series is configured per entity/GSTIN and auto-increments without gaps.
Why it exists: Meets statutory sequential-numbering compliance requirements.
Edge cases / notes: Series reset rules (annual, fiscal-year) need to be configurable.
Test cases: PRD-CDN-037 … PRD-CDN-040 (4).

### FEAT-CDN-011 — Credit/Debit Note Dispute Flag & Resolution Log
Credit/Debit Note Dispute Flag & Resolution Log is a Core feature of Credit / Debit Note (MOD-21). Persona: AP Executive. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As an AP executive, I want a disputed note flagged and its resolution logged, so that disagreements with vendors don't get lost in email.
Business use case: Disputes raised by a vendor are logged against the note with a resolution trail (accepted, revised, withdrawn).
Why it exists: Keeps dispute resolution auditable instead of happening off-system.
Edge cases / notes: Should support partial resolution (amount revised, not just accept/reject).
Test cases: PRD-CDN-041 … PRD-CDN-044 (4).

### FEAT-CDN-012 — Credit/Debit Note Reporting Dashboard
Credit/Debit Note Reporting Dashboard is a Reporting feature of Credit / Debit Note (MOD-21). Persona: Finance Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a finance manager, I want a dashboard of all credit/debit notes by vendor, category, and reason, so that recurring issues (e.g., a vendor with frequent debit notes) are visible.
Business use case: Aggregated view of notes issued, broken down by reason code, vendor, and status.
Why it exists: Surfaces systemic vendor or process issues, not just individual transactions.
Edge cases / notes: Reason-code taxonomy should be consistent with QC and GRN reason codes.
Test cases: PRD-CDN-045 … PRD-CDN-048 (4).
