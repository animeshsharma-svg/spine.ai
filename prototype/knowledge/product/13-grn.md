# 13. GRN (MOD-19) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## GRN module overview
GRN (Goods Receipt Note) (MOD-19) is a Procure-to-Pay (P2P) module of Procol, in the "Procure-to-Pay (receipt → pay)" stage of the procurement lifecycle.
Description: Goods Receipt Notes against POs — physical receipt, acceptance and returns.
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP
Registry status: GA
Roadmap notes: Imported from downstream P2P feature list (PM).
Features: 16 (7 GA (Already in Procol), 9 Roadmap (Suggested — not in product yet)). Test cases: test-cases/product-13-grn.md, group PRD-GRN.

## GRN features

16 features in 3 categories: Core, Optional, Reporting.

### FEAT-GRN-001 — GRN Creation against PO / ASN
GRN Creation against PO / ASN is a Core feature of GRN (Goods Receipt Note) (MOD-19). Persona: Warehouse Executive. Plan: All Plans. Status: GA (Already in Procol).
User story: As a warehouse executive, I want to create a GRN against an open PO or linked ASN, so that receipt is tied to what was actually ordered.
Business use case: Goods Receipt Note is raised at the point of physical receipt, referencing the PO (and ASN where available).
Why it exists: Anchors physical receipt to the procurement record for downstream matching.
Edge cases / notes: GRN without a PO reference (non-PO receipt) needs a separate controlled path.
Test cases: PRD-GRN-001 … PRD-GRN-003 (3).

### FEAT-GRN-002 — Partial / Multiple GRNs against a Single PO
Partial / Multiple GRNs against a Single PO is a Core feature of GRN (Goods Receipt Note) (MOD-19). Persona: Warehouse Executive. Plan: All Plans. Status: GA (Already in Procol).
User story: As a warehouse executive, I want to raise multiple partial GRNs against one PO, so that staggered deliveries are each recorded as they arrive.
Business use case: Each delivery tranche against a PO is recorded as its own GRN, rolling up to overall PO consumption.
Why it exists: Reflects real receiving patterns instead of forcing one lump-sum GRN.
Edge cases / notes: PO consumption tracking must aggregate correctly across all partial GRNs.
Test cases: PRD-GRN-004 … PRD-GRN-006 (3).

### FEAT-GRN-003 — GRN–PO Line-Item Auto-Match
GRN–PO Line-Item Auto-Match is a Core feature of GRN (Goods Receipt Note) (MOD-19). Persona: Warehouse Executive. Plan: All Plans. Status: GA (Already in Procol).
User story: As a warehouse executive, I want GRN lines automatically matched to PO lines, so that I only need to confirm quantities received.
Business use case: System pre-fills GRN lines from the PO (or ASN) and the user confirms or edits received quantity.
Why it exists: Reduces manual entry and the chance of mismatched line references.
Edge cases / notes: Should support many-to-many mapping where deliveries don't mirror PO lines exactly.
Test cases: PRD-GRN-007 … PRD-GRN-009 (3).

### FEAT-GRN-004 — Over-Receipt Tolerance Control
Over-Receipt Tolerance Control is a Core feature of GRN (Goods Receipt Note) (MOD-19). Persona: Warehouse Executive. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a warehouse executive, I want over-receipt beyond a tolerance to be blocked or flagged, so that we don't accept and pay for excess quantity.
Business use case: GRN quantity exceeding the PO balance beyond a configured tolerance % is stopped or requires approval.
Why it exists: Prevents unauthorized over-delivery from silently entering the books.
Edge cases / notes: Tolerance % configurable by category; hard-block vs. soft-flag configurable.
Test cases: PRD-GRN-024 … PRD-GRN-028 (5).

### FEAT-GRN-005 — Under-Receipt / Shortage Handling
Under-Receipt / Shortage Handling is a Core feature of GRN (Goods Receipt Note) (MOD-19). Persona: Warehouse Executive. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a warehouse executive, I want to record a shortage against the PO quantity, so that the gap is documented rather than silently closed.
Business use case: Received quantity less than PO/ASN quantity is logged with a shortage reason and routed for follow-up.
Why it exists: Creates an auditable record for vendor follow-up and short-close decisions.
Edge cases / notes: Shortage should optionally auto-trigger a debit note or vendor query.
Test cases: PRD-GRN-010 … PRD-GRN-013 (4).

### FEAT-GRN-006 — GRN Rejection & Return-to-Vendor Trigger
GRN Rejection & Return-to-Vendor Trigger is a Core feature of GRN (Goods Receipt Note) (MOD-19). Persona: Warehouse Executive. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a warehouse executive, I want to reject part of a GRN and trigger a return, so that defective or wrong goods don't sit in inventory.
Business use case: Rejected quantity at receipt kicks off the Return-to-Vendor (RTV) process instead of being GRN'd as accepted.
Why it exists: Keeps rejected goods out of consumable inventory and starts recovery immediately.
Edge cases / notes: Should link directly into the Quality Check and Credit/Debit Note modules.
Test cases: PRD-GRN-029 … PRD-GRN-032 (4).

### FEAT-GRN-007 — Batch / Lot & Serial Number Capture at GRN
Batch / Lot & Serial Number Capture at GRN is a Optional feature of GRN (Goods Receipt Note) (MOD-19). Persona: Warehouse Executive. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a warehouse executive, I want to capture batch/lot or serial numbers at GRN, so that traceability is preserved from receipt onward.
Business use case: Batch/lot/serial data entered or scanned at GRN feeds inventory and later quality/warranty traceability.
Why it exists: Enables recall, warranty, and quality traceability back to the receiving event.
Edge cases / notes: Mandatory only for categories where the item master flags batch/serial tracking.
Test cases: PRD-GRN-033 … PRD-GRN-036 (4).

### FEAT-GRN-008 — GRN Photo / Document Attachment
GRN Photo / Document Attachment is a Optional feature of GRN (Goods Receipt Note) (MOD-19). Persona: Warehouse Executive. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a warehouse executive, I want to attach photos or documents to a GRN, so that condition-at-receipt is visually documented.
Business use case: Photos of received goods, damage, or packaging are attached directly to the GRN record.
Why it exists: Provides visual evidence for disputes, damage claims, or quality escalation.
Edge cases / notes: Particularly relevant for damage or shortage GRNs.
Test cases: PRD-GRN-021 … PRD-GRN-023 (3).

### FEAT-GRN-009 — GRN Approval Workflow
GRN Approval Workflow is a Core feature of GRN (Goods Receipt Note) (MOD-19). Persona: Warehouse Manager. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a warehouse manager, I want GRNs above a value/quantity threshold to require approval, so that large receipts get a second check before posting.
Business use case: GRNs crossing a configured threshold route to a manager for approval before the GRN is finalized.
Why it exists: Adds a control layer for high-value or high-risk receipts.
Edge cases / notes: Threshold and approver chain configurable per category/entity.
Test cases: PRD-GRN-014 … PRD-GRN-017 (4).

### FEAT-GRN-010 — GRN Reversal / Cancellation
GRN Reversal / Cancellation is a Core feature of GRN (Goods Receipt Note) (MOD-19). Persona: Warehouse Executive. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a warehouse executive, I want to reverse a GRN posted in error, so that inventory and PO consumption correct themselves cleanly.
Business use case: An erroneous GRN is reversed through a controlled flow rather than deleted, preserving the audit trail.
Why it exists: Auditability of corrections to physical receipt records.
Edge cases / notes: Reversal should be blocked once an invoice has matched against the GRN.
Test cases: PRD-GRN-037 … PRD-GRN-040 (4).

### FEAT-GRN-011 — Warehouse / Bin Location Mapping at GRN
Warehouse / Bin Location Mapping at GRN is a Optional feature of GRN (Goods Receipt Note) (MOD-19). Persona: Warehouse Executive. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a warehouse executive, I want to assign a bin/storage location at GRN, so that put-away is tracked from the moment of receipt.
Business use case: Received items are mapped to a bin/location code as part of the GRN transaction.
Why it exists: Links receiving directly into warehouse/inventory management.
Edge cases / notes: Relevant mainly for clients with WMS-level granularity needs.
Test cases: PRD-GRN-041 … PRD-GRN-043 (3).

### FEAT-GRN-012 — GRN-Triggered Quality Check Hold
GRN-Triggered Quality Check Hold is a Core feature of GRN (Goods Receipt Note) (MOD-19). Persona: Warehouse Executive. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a warehouse executive, I want GRNs for QC-flagged categories to auto-hold pending inspection, so that unchecked goods aren't consumed or invoiced.
Business use case: GRN for a QC-mandatory category is held in a pending-inspection state until the Quality Check module clears it.
Why it exists: Prevents goods from entering use or invoicing ahead of required quality sign-off.
Edge cases / notes: Hold should release automatically on QC pass, or route to RTV/debit-note on QC fail.
Test cases: PRD-GRN-044 … PRD-GRN-047 (4).

### FEAT-GRN-013 — GRN Aging Report
GRN Aging Report is a Reporting feature of GRN (Goods Receipt Note) (MOD-19). Persona: Warehouse Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a warehouse manager, I want to see GRNs pending invoice matching by age, so that stuck receipts are surfaced for follow-up.
Business use case: Report buckets GRNs by how long they've sat without a matching invoice.
Why it exists: Surfaces AP-GRN bottlenecks before they become accrual problems.
Edge cases / notes: Aging buckets configurable per tenant.
Test cases: PRD-GRN-048 … PRD-GRN-051 (4).

### FEAT-GRN-014 — Mobile / Barcode-Scanner GRN Entry
Mobile / Barcode-Scanner GRN Entry is a Optional feature of GRN (Goods Receipt Note) (MOD-19). Persona: Warehouse Executive. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a warehouse executive, I want to scan barcodes to create a GRN on a handheld device, so that receiving on the dock is fast and accurate.
Business use case: Barcode/QR scan of items and PO reference populates the GRN on a mobile device at the point of receipt.
Why it exists: Speeds up dock-side receiving and reduces manual keying errors.
Edge cases / notes: Requires offline-capable mobile app for low-connectivity warehouse zones.
Test cases: PRD-GRN-052 … PRD-GRN-055 (4).

### FEAT-GRN-015 — GRN-to-Invoice 3-Way Match Trigger
GRN-to-Invoice 3-Way Match Trigger is a Core feature of GRN (Goods Receipt Note) (MOD-19). Persona: AP Executive. Plan: All Plans. Status: GA (Already in Procol).
User story: As an AP executive, I want a posted GRN to automatically become available for 3-way matching, so that invoice processing isn't delayed waiting on manual GRN lookups.
Business use case: GRN completion event feeds directly into the invoice matching queue.
Why it exists: Removes a manual handoff step between receiving and AP.
Edge cases / notes: Should respect the GRN's QC-hold status before making it match-eligible.
Test cases: PRD-GRN-018 … PRD-GRN-020 (3).

### FEAT-GRN-016 — Consignment / Non-PO GRN Handling
Consignment / Non-PO GRN Handling is a Optional feature of GRN (Goods Receipt Note) (MOD-19). Persona: Warehouse Executive. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a warehouse executive, I want to record receipt of consignment stock without a PO, so that vendor-owned inventory is tracked correctly.
Business use case: Goods received under a consignment arrangement are GRN'd against a consignment agreement reference instead of a PO.
Why it exists: Accommodates procurement models that don't start with a PO.
Edge cases / notes: Consumption from consignment stock should trigger billing separately.
Test cases: PRD-GRN-056 … PRD-GRN-059 (4).
