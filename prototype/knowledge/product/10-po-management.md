# 10. PO Management (MOD-15) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## PO Management module overview
PO Management (MOD-15) is a Procurement module of Procol, in the "Award, PO & contract" stage of the procurement lifecycle.
Description: Purchase order assembly, configurable PO templates, PO amendment, and ERP PO creation
Business purpose: Convert awards into governed, ERP-aligned purchase orders and keep them synced with SAP
Default state: Enabled
Plan availability: All Plans
Depends on modules: MOD-02 Purchase Requisition, MOD-14 Sourcing Events (RFX), MOD-09 Approval Engine
Key integrations: SAP, ERP PO/DMS
Registry status: GA
Roadmap notes: NEW (provisional) - from award/PO flow
Features: 25 (9 GA, 12 GA (Already in Procol), 4 Roadmap (Suggested — not in product yet)). Test cases: test-cases/product-10-po-management.md, group PRD-PO.

## PO Management features

25 features in 2 categories: Core, Optional.

### FEAT-PO-001 — Three-Source PO Assembly
Three-Source PO Assembly is a Core feature of PO Management (MOD-15). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want a PO assembled from PR, event, and form data, so that I can generate a complete PO from all sources.
Business use case: At PO creation; data from the PR, the event, and the PO form are combined into one complete PO.
Why it exists: Single, complete PO from all sources.
Test cases: PRD-PO-001 … PRD-PO-002 (2).

### FEAT-PO-002 — Configurable PO Form / Template
Configurable PO Form / Template is a Core feature of PO Management (MOD-15). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want the PO form to follow our ERP template and fill the gaps, so that I can create ERP-aligned POs.
Business use case: The PO form follows the customer's ERP template; Procol's template fills fields not supplied by PR/event.
Why it exists: ERP-aligned PO creation.
Edge cases / notes: Per-ERP; cross-links MOD-11.
Test cases: PRD-PO-003 … PRD-PO-005 (3).

### FEAT-PO-003 — Award Proposal for Approval
Award Proposal for Approval is a Core feature of PO Management (MOD-15). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want to route the award proposal (NFA/NTD) through the Delegation of Authority, so that awards are properly authorized.
Business use case: The award proposal (NFA/NTD) is routed through DoFP approval before PO release.
Why it exists: Governed award authorization.
Edge cases / notes: Cross-links MOD-09, MOD-16.
Test cases: PRD-PO-006 … PRD-PO-007 (2).

### FEAT-PO-004 — PO Amendment Flow
PO Amendment Flow is a Core feature of PO Management (MOD-15). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want to amend an issued PO through approval, so that I can revise POs in a controlled way.
Business use case: When an issued PO needs changes; a controlled amendment flow with approval is used.
Why it exists: Controlled PO changes.
Test cases: PRD-PO-008 … PRD-PO-010 (3).

### FEAT-PO-005 — PO Award Tolerance Validation
PO Award Tolerance Validation is a Optional feature of PO Management (MOD-15). Persona: Finance Controller. Plan: Enterprise. Status: GA.
User story: As a finance controller, I want award amounts validated against the approved limit, so that I can prevent overspend at the PO stage.
Business use case: At award/PO; the amount is validated against the sanctioned limit and tolerance, flagging overages.
Why it exists: Spend control at PO.
Test cases: PRD-PO-044 … PRD-PO-046 (3).

### FEAT-PO-006 — Multiple PO Split
Multiple PO Split is a Optional feature of PO Management (MOD-15). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want to split one award into multiple POs, so that I can handle delivery and batch needs.
Business use case: One award is split into multiple POs for the same product/location/vendor to suit delivery or batches.
Why it exists: Delivery/batch flexibility.
Test cases: PRD-PO-047 … PRD-PO-049 (3).

### FEAT-PO-007 — PO History Prefill
PO History Prefill is a Optional feature of PO Management (MOD-15). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want the PO form prefilled from the last PO, so that I can create POs faster.
Business use case: The PO form is pre-filled from the most recent PO and edited as needed.
Why it exists: Faster PO creation.
Test cases: PRD-PO-050 … PRD-PO-052 (3).

### FEAT-PO-008 — PO Export & Search/Filter
PO Export & Search/Filter is a Core feature of PO Management (MOD-15). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want to export POs and find events by PO number, so that POs are traceable.
Business use case: Buyers export POs and locate events by PO number; event titles show all linked PO numbers.
Why it exists: PO traceability.
Test cases: PRD-PO-011 … PRD-PO-012 (2).

### FEAT-PO-009 — SAP PO Creation & MQCS Push
SAP PO Creation & MQCS Push is a Core feature of PO Management (MOD-15). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want the PO created in SAP with the MQCS pushed and attached, so that approved awards provision in the ERP automatically.
Business use case: On approval; the PO is created in SAP and the final Master QCS is pushed and attached.
Why it exists: Closes the sourcing-to-ERP loop.
Edge cases / notes: Cross-links MOD-11.
Test cases: PRD-PO-013 … PRD-PO-015 (3).

### FEAT-PO-010 — PO Short Close
PO Short Close is a Core feature of PO Management (MOD-15). Persona: Buyer. Plan: All Plans. Status: GA (Already in Procol).
User story: As a buyer, I want to short-close a PO before full quantity/value is consumed, so that residual undelivered qty doesn't keep the PO open indefinitely.
Business use case: Buyer marks a PO short-closed when a vendor can't fulfill the balance quantity, freeing budget and cleaning up open-PO reports.
Why it exists: Prevents open POs from sitting perpetually pending in reports and budget locks.
Edge cases / notes: Requires a reason code and, optionally, approval before short-close is allowed.
Test cases: PRD-PO-016 … PRD-PO-018 (3).

### FEAT-PO-011 — PO Hold
PO Hold is a Core feature of PO Management (MOD-15). Persona: Buyer / Approver. Plan: All Plans. Status: GA (Already in Procol).
User story: As a buyer, I want to place a PO on hold, so that downstream GRN and invoicing pause until the hold is cleared.
Business use case: A dispute, compliance flag, or vendor issue triggers a hold; GRN/invoice actions are blocked while active.
Why it exists: Risk control — stops further transactions against a PO under review.
Edge cases / notes: Auto-release rules and hold-reason taxonomy are configurable.
Test cases: PRD-PO-019 … PRD-PO-021 (3).

### FEAT-PO-012 — PO Cancel
PO Cancel is a Core feature of PO Management (MOD-15). Persona: Buyer. Plan: All Plans. Status: GA (Already in Procol).
User story: As a buyer, I want to cancel a PO, so that unwanted or erroneous POs are voided with a full audit trail.
Business use case: Buyer cancels a PO that is no longer needed; the cancellation and reason are logged.
Why it exists: Governance and auditability of PO lifecycle.
Edge cases / notes: Cannot cancel a PO once GRN or invoice has been posted against it.
Test cases: PRD-PO-022 … PRD-PO-024 (3).

### FEAT-PO-013 — Blanket PO
Blanket PO is a Core feature of PO Management (MOD-15). Persona: Buyer. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a buyer, I want to raise an open-value/open-quantity blanket PO, so that repeat low-value spend doesn't need a fresh PO every time.
Business use case: Long-term or rate-contract-backed spend is drawn down against one blanket PO via multiple releases.
Why it exists: Reduces repetitive PO creation for recurring, pre-negotiated spend.
Edge cases / notes: Validity period, max release value, and expiry alerts are configurable.
Test cases: PRD-PO-025 … PRD-PO-028 (4).

### FEAT-PO-014 — Service PO
Service PO is a Core feature of PO Management (MOD-15). Persona: Buyer. Plan: All Plans. Status: GA (Already in Procol).
User story: As a buyer, I want to raise a service PO, so that service categories are procured against Service Entry Sheets instead of physical GRN.
Business use case: Used for AMC, consulting, manpower and other non-material spend where receipt is service-based, not goods-based.
Why it exists: Accommodates non-material procurement correctly.
Edge cases / notes: Service Entry Sheet approval substitutes for GRN in the match cycle.
Test cases: PRD-PO-029 … PRD-PO-031 (3).

### FEAT-PO-015 — Recurring PO
Recurring PO is a Optional feature of PO Management (MOD-15). Persona: Buyer. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a buyer, I want POs to auto-generate on a defined schedule, so that I don't manually recreate the same PO every period.
Business use case: Recurring monthly rent, subscription, or AMC POs are auto-created on schedule.
Why it exists: Eliminates manual, repetitive PO creation.
Edge cases / notes: Schedule has an end date; failed auto-creation escalates to the buyer.
Test cases: PRD-PO-053 … PRD-PO-057 (5).

### FEAT-PO-016 — Accruals
Accruals is a Core feature of PO Management (MOD-15). Persona: Finance Controller. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a finance controller, I want the system to compute accrual liability for received-but-not-invoiced value, so that month-end close is accurate.
Business use case: Accrual report is generated automatically from the GRN-minus-Invoice gap, by cost center and GL code.
Why it exists: Accurate financial close without manual accrual workbooks.
Edge cases / notes: Currency and tax treatment are handled within the accrual calculation.
Test cases: PRD-PO-032 … PRD-PO-035 (4).

### FEAT-PO-017 — PO Consumption Tracking
PO Consumption Tracking is a Core feature of PO Management (MOD-15). Persona: Buyer / Finance. Plan: All Plans. Status: GA (Already in Procol).
User story: As a buyer, I want to see consumed vs. remaining PO quantity and value, so that I know how much of a blanket/service PO is left.
Business use case: A live consumption view sits on top of every PO, updated by GRN and invoice postings.
Why it exists: Prevents over-delivery and over-billing against a PO.
Edge cases / notes: Handles partial GRNs and multi-invoice splits against a single PO line.
Test cases: PRD-PO-036 … PRD-PO-038 (3).

### FEAT-PO-018 — Multi-Currency PO
Multi-Currency PO is a Optional feature of PO Management (MOD-15). Persona: Buyer. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a buyer, I want to raise a PO in the vendor's transaction currency with automatic FX conversion, so that international POs book correctly.
Business use case: Cross-border vendor POs are issued in foreign currency and converted to base currency for reporting.
Why it exists: Accurate books for international procurement.
Edge cases / notes: FX rate source and rate-lock date (PO date vs. invoice date) need definition.
Test cases: PRD-PO-066 … PRD-PO-069 (4).

### FEAT-PO-019 — Vendor PO Acknowledgment
Vendor PO Acknowledgment is a Optional feature of PO Management (MOD-15). Persona: Vendor. Plan: Growth, Enterprise. Status: GA (Already in Procol).
User story: As a vendor, I want to accept or flag a PO with a committed delivery date via the portal, so that expectations are aligned before fulfillment starts.
Business use case: Vendor confirms qty/price/date on the vendor portal before work begins; disagreements are flagged back to the buyer.
Why it exists: Reduces PO disputes discovered only at delivery.
Edge cases / notes: Auto-escalation to buyer if vendor doesn't respond within SLA.
Test cases: PRD-PO-058 … PRD-PO-061 (4).

### FEAT-PO-020 — Rate-Contract-Backed PO Pricing
Rate-Contract-Backed PO Pricing is a Core feature of PO Management (MOD-15). Persona: Buyer. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a buyer, I want PO price and terms to auto-populate from the linked rate contract, so that I can't accidentally issue an off-contract price.
Business use case: At PO creation, price/vendor fields fetched from the contract are locked as a snapshot of what was matched at that point.
Why it exists: Pricing governance and contract compliance; snapshot preserves what was actually approved.
Edge cases / notes: Fetched fields are read-only after commitment; corrections go through PO amendment, not a silent edit.
Test cases: PRD-PO-070 … PRD-PO-074 (5).

### FEAT-PO-021 — Budget Check at PO Gate
Budget Check at PO Gate is a Core feature of PO Management (MOD-15). Persona: Buyer / Finance. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a finance controller, I want available budget validated before a PO is released, so that we can't commit spend beyond sanction.
Business use case: PO release is soft-blocked or hard-blocked if the mapped cost center/budget line is insufficient.
Why it exists: Spend control at the point of commitment, not after the fact.
Edge cases / notes: Soft-block (warn + override with approval) vs. hard-block is configurable.
Test cases: PRD-PO-075 … PRD-PO-078 (4).

### FEAT-PO-022 — Delivery Schedule Lines
Delivery Schedule Lines is a Optional feature of PO Management (MOD-15). Persona: Buyer. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a buyer, I want to define multiple delivery dates/quantities within one PO line, so that staggered deliveries don't need separate POs.
Business use case: A single PO line ships in tranches (e.g., 40% now, 60% in 30 days) with GRN validated per schedule line.
Why it exists: Matches real-world staggered delivery cadence.
Edge cases / notes: GRN must validate against the schedule line, not just the overall PO line.
Test cases: PRD-PO-079 … PRD-PO-082 (4).

### FEAT-PO-023 — Bulk PO Creation / Upload
Bulk PO Creation / Upload is a Optional feature of PO Management (MOD-15). Persona: Buyer. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a buyer, I want to create multiple POs via a bulk upload template, so that high-volume categories aren't created one at a time.
Business use case: Buyer uploads a spreadsheet of PO lines; the system validates and creates POs in bulk with an error report for failed rows.
Why it exists: Efficiency at scale for high-volume, low-complexity categories.
Edge cases / notes: Failed rows return a downloadable error report, not a silent partial failure.
Test cases: PRD-PO-062 … PRD-PO-065 (4).

### FEAT-PO-024 — PO Dispatch & Vendor Notification Log
PO Dispatch & Vendor Notification Log is a Core feature of PO Management (MOD-15). Persona: Buyer. Plan: All Plans. Status: GA (Already in Procol).
User story: As a buyer, I want the signed PO PDF auto-emailed to the vendor with a delivery log, so that dispatch is formal and traceable.
Business use case: On approval, the PO PDF is emailed to the vendor's registered contact and the send/open status is logged.
Why it exists: Formal dispatch with an audit trail of vendor notification.
Edge cases / notes: Bounce-back or undelivered notifications should re-alert the buyer.
Test cases: PRD-PO-039 … PRD-PO-041 (3).

### FEAT-PO-025 — Multiple invoice and GRN against 1 PO
Multiple invoice and GRN against 1 PO is a Core feature of PO Management (MOD-15). Persona: Buyer. Plan: All Plans. Status: GA (Already in Procol).
User story: As a buyer, I receive multiple deliveries against a PO and hence multiple invoices and GRN
Why it exists: To support batch deliveries
Test cases: PRD-PO-042 … PRD-PO-043 (2).
