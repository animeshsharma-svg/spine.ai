# 15. Invoice Module (MOD-17) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Invoice Module module overview
Invoice Module (MOD-17) is a Procure-to-Pay (P2P) module of Procol, in the "Procure-to-Pay (receipt → pay)" stage of the procurement lifecycle.
Description: Vendor invoice capture, PO/GRN matching, tax & exception handling in the P2P cycle.
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP
Registry status: GA
Roadmap notes: Imported from downstream P2P feature list (PM).
Features: 24 (20 GA (Already in Procol), 4 Roadmap (Suggested — not in product yet)). Test cases: test-cases/product-15-invoice-module.md, group PRD-INV.

## Invoice Module features

24 features in 4 categories: Core, Optional, Compliance, Reporting.

### FEAT-INV-001 — Customizable Invoice Template
Customizable Invoice Template is a Core feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: All Plans. Status: GA (Already in Procol).
User story: As an AP executive, I want invoice capture templates configurable per vendor/invoice type, so that every invoice format we receive maps correctly.
Business use case: Field mapping is configured per vendor or invoice type (standard, freight, CHA) to match how vendors actually invoice us.
Why it exists: Consistent, correct capture across varied vendor invoice formats.
Edge cases / notes: Template varies by invoice type (standard/freight/CHA/credit/debit).
Test cases: PRD-INV-001 … PRD-INV-003 (3).

### FEAT-INV-002 — Invoice OCR
Invoice OCR is a Core feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: Growth, Enterprise. Status: GA (Already in Procol).
User story: As an AP executive, I want the system to OCR-extract invoice data automatically, so that I don't manually key in every field.
Business use case: Scanned/PDF invoices are parsed and key fields (vendor, amount, tax, line items) are auto-extracted for review.
Why it exists: Removes manual data entry and reduces keying errors.
Edge cases / notes: Low-confidence extractions are flagged for manual review before posting.
Test cases: PRD-INV-004 … PRD-INV-007 (4).

### FEAT-INV-003 — Email OCR — Auto-Fetch from Inbox
Email OCR — Auto-Fetch from Inbox is a Core feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: Enterprise. Status: GA (Already in Procol).
User story: As an AP executive, I want invoices emailed by vendors to be fetched and OCR'd automatically, so that I don't have to download and upload them manually.
Business use case: A monitored AP inbox is polled; attached invoices are pulled in, OCR'd, and queued for matching without manual upload.
Why it exists: Removes the manual download/upload step entirely from the AP workflow.
Edge cases / notes: Non-invoice attachments/spam need filtering logic to avoid false capture.
Test cases: PRD-INV-008 … PRD-INV-011 (4).

### FEAT-INV-004 — Line-Item Level PO–Invoice Matching
Line-Item Level PO–Invoice Matching is a Core feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: Growth, Enterprise. Status: GA (Already in Procol).
User story: As an AP executive, I want invoice line items matched to PO line items individually, so that mismatches are caught at the line, not just the header total.
Business use case: Every invoice line is checked against the corresponding PO line for item, rate, and quantity.
Why it exists: Line-level accuracy catches errors that header-level totals would miss.
Edge cases / notes: Multiple invoice lines can map to one PO line and vice versa.
Test cases: PRD-INV-012 … PRD-INV-015 (4).

### FEAT-INV-005 — 3-Way Match (PO – Invoice – GRN)
3-Way Match (PO – Invoice – GRN) is a Core feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: All Plans. Status: GA (Already in Procol).
User story: As an AP executive, I want the system to 3-way match PO, invoice, and GRN, so that we only pay for what was ordered and received.
Business use case: Standard match cycle for goods POs before an invoice is released for payment.
Why it exists: Prevents payment for undelivered or unordered goods.
Edge cases / notes: Partial GRNs allow partial invoice release against the matched portion.
Test cases: PRD-INV-016 … PRD-INV-018 (3).

### FEAT-INV-006 — 2-Way Match (PO – Invoice)
2-Way Match (PO – Invoice) is a Core feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: All Plans. Status: GA (Already in Procol).
User story: As an AP executive, I want a 2-way match option for service/non-GRN POs, so that invoices can still be validated without a physical receipt step.
Business use case: Used for service POs or categories where GRN isn't applicable.
Why it exists: Enables matching for non-material spend.
Edge cases / notes: Applies to service POs where Service Entry Sheet substitutes for GRN.
Test cases: PRD-INV-019 … PRD-INV-021 (3).

### FEAT-INV-007 — 4-Way Match (PO – Invoice – GRN – Quality/Inspection)
4-Way Match (PO – Invoice – GRN – Quality/Inspection) is a Optional feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: Enterprise. Status: GA (Already in Procol).
User story: As an AP executive, I want a 4-way match that also checks quality sign-off, so that we never pay for goods that failed inspection.
Business use case: Adds the QC/inspection result as a fourth check before invoice release, for categories requiring inspection.
Why it exists: Prevents payment release ahead of quality clearance.
Edge cases / notes: Requires the Quality Check module result to be available before match completes.
Test cases: PRD-INV-064 … PRD-INV-067 (4).

### FEAT-INV-008 — Vendor GST Mismatch Validation
Vendor GST Mismatch Validation is a Compliance feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: Growth, Enterprise. Status: GA (Already in Procol).
User story: As an AP executive, I want the system to flag when invoice GST doesn't match the vendor master GST, so that we don't post invoices with incorrect tax registration.
Business use case: Invoice GSTIN is checked against the vendor master record at capture time.
Why it exists: Prevents compliance and input-tax-credit issues from GST mismatches.
Edge cases / notes: Multi-GSTIN vendors (branch-wise registration) need a mapping table.
Test cases: PRD-INV-048 … PRD-INV-051 (4).

### FEAT-INV-009 — Configurable Invoice Validation Rule Engine
Configurable Invoice Validation Rule Engine is a Core feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: Growth, Enterprise. Status: GA (Already in Procol).
User story: As an AP executive, I want a configurable set of validation checks run on every invoice, so that bad data is caught before it enters the match/approval cycle.
Business use case: Rules (duplicate PO reference, missing GSTIN, date sanity, mandatory fields) run automatically at intake.
Why it exists: Reduces downstream exceptions by catching data issues at entry.
Edge cases / notes: Rule set is configurable per tenant/entity.
Test cases: PRD-INV-022 … PRD-INV-025 (4).

### FEAT-INV-010 — GST Recon (2-Way, Third-Party Integration)
GST Recon (2-Way, Third-Party Integration) is a Compliance feature of Invoice Module (MOD-17). Persona: Finance Controller. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a finance controller, I want invoice GST reconciled against GSTR-2B via a third-party GST tool, so that input tax credit claims are accurate.
Business use case: Invoices are reconciled two-way against the government GST return feed pulled via an integrated third-party service.
Why it exists: Protects ITC claims and simplifies GST compliance.
Edge cases / notes: Recon mismatches are routed to AP for vendor follow-up.
Test cases: PRD-INV-052 … PRD-INV-055 (4).

### FEAT-INV-011 — LDC (Lower Deduction Certificate) Handling
LDC (Lower Deduction Certificate) Handling is a Compliance feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: Enterprise. Status: GA (Already in Procol).
User story: As an AP executive, I want vendor LDCs applied automatically during TDS computation, so that the correct lower/nil TDS rate is used.
Business use case: LDC validity and rate are checked against the vendor master before TDS is computed on an invoice.
Why it exists: Ensures correct TDS deduction per vendor's certificate status.
Edge cases / notes: LDC expiry must trigger reversion to standard TDS rate automatically.
Test cases: PRD-INV-056 … PRD-INV-059 (4).

### FEAT-INV-012 — TDS Computation & Section Mapping
TDS Computation & Section Mapping is a Compliance feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: Enterprise. Status: GA (Already in Procol).
User story: As an AP executive, I want TDS computed automatically against the correct section, so that deduction is compliant without manual lookup.
Business use case: TDS section (194C, 194J, etc.) is mapped per vendor/category and applied at invoice booking.
Why it exists: Removes manual TDS section lookup and reduces compliance risk.
Edge cases / notes: Section mapping can vary by transaction nature, not just vendor.
Test cases: PRD-INV-060 … PRD-INV-063 (4).

### FEAT-INV-013 — Fuzzy Line-Item Matching
Fuzzy Line-Item Matching is a Core feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: Growth, Enterprise. Status: GA (Already in Procol).
User story: As an AP executive, I want fuzzy matching between invoice and PO line item descriptions, so that minor wording differences don't block auto-match.
Business use case: Line item text is matched using similarity scoring rather than exact string match.
Why it exists: Reduces false-mismatch exceptions caused by cosmetic description differences.
Edge cases / notes: Similarity threshold is configurable to balance false positives vs. false negatives.
Test cases: PRD-INV-026 … PRD-INV-029 (4).

### FEAT-INV-014 — Rate & Quantity Match at Line-Item Level
Rate & Quantity Match at Line-Item Level is a Core feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: All Plans. Status: GA (Already in Procol).
User story: As an AP executive, I want rate and quantity checked line-by-line, so that a rate or quantity discrepancy is caught precisely.
Business use case: Each matched line is checked for rate and quantity variance against tolerance.
Why it exists: Precise exception isolation instead of a generic header mismatch.
Edge cases / notes: Tolerance bands (%, absolute) are configurable per category.
Test cases: PRD-INV-030 … PRD-INV-032 (3).

### FEAT-INV-015 — Invoice-Triggered Credit/Debit Note Suggestion
Invoice-Triggered Credit/Debit Note Suggestion is a Core feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: Growth, Enterprise. Status: GA (Already in Procol).
User story: As an AP executive, I want the system to suggest a credit or debit note when an invoiced item isn't found on the PO, so that the mismatch is resolved formally.
Business use case: When an invoice line has no PO match, the system prompts creation of a credit/debit note instead of silent rejection.
Why it exists: Keeps unmatched items auditable rather than stuck as an unresolved exception.
Edge cases / notes: See Credit/Debit Note module for the full note lifecycle.
Test cases: PRD-INV-033 … PRD-INV-035 (3).

### FEAT-INV-016 — Invoice Amendment
Invoice Amendment is a Core feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: Growth, Enterprise. Status: GA (Already in Procol).
User story: As an AP executive, I want to amend a submitted invoice through a controlled flow, so that corrections are tracked, not silently overwritten.
Business use case: Corrections to a submitted invoice go through an amendment workflow with the original values preserved for audit.
Why it exists: Auditability of invoice corrections.
Edge cases / notes: Original invoice values are retained; amendment is logged as a new version.
Test cases: PRD-INV-036 … PRD-INV-040 (5).

### FEAT-INV-017 — Specialized Invoice Types (Freight, CHA)
Specialized Invoice Types (Freight, CHA) is a Core feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: Enterprise. Status: GA (Already in Procol).
User story: As an AP executive, I want freight and CHA invoices captured with their own field sets, so that logistics-specific charges are handled correctly.
Business use case: Freight and Customs House Agent invoices use dedicated templates and validation distinct from standard material invoices.
Why it exists: Logistics and import invoices have structurally different line items than material invoices.
Edge cases / notes: Freight/CHA invoices may not link to a standard PO line at all.
Test cases: PRD-INV-041 … PRD-INV-044 (4).

### FEAT-INV-018 — Match Mismatch → Dispute Case Auto-Creation
Match Mismatch → Dispute Case Auto-Creation is a Core feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: Growth, Enterprise. Status: GA (Already in Procol).
User story: As an AP executive, I want a 3-way/4-way match mismatch to automatically open a dispute case, so that resolution happens on-platform instead of over email.
Business use case: A discrepancy found during matching auto-creates a linked dispute case with the PO, invoice, and GRN references attached.
Why it exists: Keeps mismatch resolution auditable and centralized rather than scattered across email threads.
Edge cases / notes: See the Dispute Management module for the full case lifecycle.
Test cases: PRD-INV-045 … PRD-INV-047 (3).

### FEAT-INV-019 — Invoice Aging Report
Invoice Aging Report is a Reporting feature of Invoice Module (MOD-17). Persona: AP Manager. Plan: Growth, Enterprise. Status: GA (Already in Procol).
User story: As an AP manager, I want an invoice aging report by bucket, so that I can prioritize invoices approaching or past due.
Business use case: Dashboard/report buckets open invoices by age (0-30, 31-60, 60+ days) across vendors and entities.
Why it exists: Surfaces payment-cycle bottlenecks proactively.
Edge cases / notes: Aging buckets are configurable per tenant.
Test cases: PRD-INV-072 … PRD-INV-075 (4).

### FEAT-INV-020 — Duplicate Invoice Detection
Duplicate Invoice Detection is a Compliance feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As an AP executive, I want the system to flag potential duplicate invoices, so that we never pay the same invoice twice.
Business use case: Invoice number, vendor, amount, and date combinations are checked against invoice history at intake.
Why it exists: Prevents duplicate-payment leakage, a common AP risk.
Edge cases / notes: Should catch near-duplicates (same invoice, re-numbered) not just exact matches.
Test cases: PRD-INV-076 … PRD-INV-079 (4).

### FEAT-INV-021 — AI Classification for Non-PO Invoices
AI Classification for Non-PO Invoices is a Core feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As an AP executive, I want non-PO invoices auto-classified by type, so that routing doesn't rely on manual tagging.
Business use case: For invoices with no linked PO, an AI classifier infers invoice type; AP confirms before the invoice proceeds.
Why it exists: Avoids burdening AP with manual classification while keeping a human check.
Edge cases / notes: AP confirmation step stays mandatory even when classifier confidence is high.
Test cases: PRD-INV-080 … PRD-INV-083 (4).

### FEAT-INV-022 — Invoice Splitting Across Multiple POs
Invoice Splitting Across Multiple POs is a Optional feature of Invoice Module (MOD-17). Persona: AP Executive. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As an AP executive, I want to split one invoice across multiple POs, so that consolidated vendor billing doesn't block matching.
Business use case: A single vendor invoice covering multiple POs is apportioned and matched against each PO separately.
Why it exists: Handles real-world consolidated vendor billing.
Edge cases / notes: Apportionment logic (pro-rata, manual) needs to be defined.
Test cases: PRD-INV-084 … PRD-INV-087 (4).

### FEAT-INV-023 — Vendor Self-Service Invoice Submission Portal
Vendor Self-Service Invoice Submission Portal is a Optional feature of Invoice Module (MOD-17). Persona: Vendor. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a vendor, I want to submit invoices directly through a portal, so that I don't rely solely on email.
Business use case: Vendors upload or key in invoices via a portal, reducing OCR dependency and email-based intake errors.
Why it exists: Improves invoice data quality at the source and reduces AP workload.
Edge cases / notes: Portal submissions still pass through the same validation and match engine.
Test cases: PRD-INV-068 … PRD-INV-071 (4).

### FEAT-INV-024 — Invoice Payment Milestone Tracking
Invoice Payment Milestone Tracking is a Optional feature of Invoice Module (MOD-17). Persona: Finance Controller. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a finance controller, I want to track invoice payment against defined milestones, so that milestone-based service payments are controlled.
Business use case: Service invoices linked to project milestones release payment only as milestones are marked complete.
Why it exists: Controls payment pacing for milestone-based service contracts.
Edge cases / notes: Milestone completion should require the same sign-off as GRN would for goods.
Test cases: PRD-INV-088 … PRD-INV-091 (4).
