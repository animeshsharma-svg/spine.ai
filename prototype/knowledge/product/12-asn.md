# 12. ASN (MOD-18) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## ASN module overview
ASN (Advance Shipment Notice) (MOD-18) is a Procure-to-Pay (P2P) module of Procol, in the "Procure-to-Pay (receipt → pay)" stage of the procurement lifecycle.
Description: Advance Shipment Notices from vendors ahead of physical goods receipt.
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP
Registry status: GA
Roadmap notes: Imported from downstream P2P feature list (PM).
Features: 14 (5 GA (Already in Procol), 9 Roadmap (Suggested — not in product yet)). Test cases: test-cases/product-12-asn.md, group PRD-ASN.

## ASN features

14 features in 4 categories: Core, Optional, Reporting, Integration.

### FEAT-ASN-001 — ASN Creation by Vendor (Portal/EDI)
ASN Creation by Vendor (Portal/EDI) is a Core feature of ASN (Advance Shipment Notice) (MOD-18). Persona: Vendor. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a vendor, I want to raise an Advance Shipment Notice before dispatch, so that the buyer knows what's coming and when.
Business use case: Vendor submits shipment details (items, qty, dispatch date, carrier) via portal or EDI ahead of physical delivery.
Why it exists: Gives the buyer/warehouse advance visibility instead of receiving goods unannounced.
Edge cases / notes: EDI-integrated vendors vs. portal-only vendors need two intake paths.
Test cases: PRD-ASN-001 … PRD-ASN-004 (4).

### FEAT-ASN-002 — ASN–PO Auto-Linking
ASN–PO Auto-Linking is a Core feature of ASN (Advance Shipment Notice) (MOD-18). Persona: Warehouse Executive. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a warehouse executive, I want an ASN auto-linked to its source PO, so that I know exactly what shipment to expect against which order.
Business use case: ASN line items are matched to open PO lines automatically at submission.
Why it exists: Removes manual cross-referencing between ASN and PO at the dock.
Edge cases / notes: One ASN can span multiple POs from the same vendor/shipment.
Test cases: PRD-ASN-005 … PRD-ASN-008 (4).

### FEAT-ASN-003 — ASN Line-Item Validation vs. PO
ASN Line-Item Validation vs. PO is a Core feature of ASN (Advance Shipment Notice) (MOD-18). Persona: Warehouse Executive. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a warehouse executive, I want ASN quantities checked against remaining open PO quantity, so that over-shipment is flagged before goods arrive.
Business use case: System validates ASN qty against PO balance and flags excess or unauthorized items.
Why it exists: Catches shipment errors before they reach the dock.
Edge cases / notes: Tolerance thresholds for over-shipment should be configurable.
Test cases: PRD-ASN-009 … PRD-ASN-012 (4).

### FEAT-ASN-004 — Shipment & Compliance Document Upload
Shipment & Compliance Document Upload is a Core feature of ASN (Advance Shipment Notice) (MOD-18). Persona: Vendor. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a vendor, I want to attach the packing list, e-way bill, and LR/AWB to the ASN, so that the warehouse has everything needed at receipt.
Business use case: Compliance and transport documents travel with the ASN record instead of arriving separately.
Why it exists: Reduces document-chasing at the receiving dock.
Edge cases / notes: Mandatory document types can be configured per category/geography.
Test cases: PRD-ASN-013 … PRD-ASN-016 (4).

### FEAT-ASN-005 — Expected Delivery Date from ASN
Expected Delivery Date from ASN is a Optional feature of ASN (Advance Shipment Notice) (MOD-18). Persona: Buyer. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a buyer, I want the expected delivery date populated from the ASN, so that PO delivery tracking reflects the actual shipment plan.
Business use case: ASN dispatch and transit data feed the expected-delivery field on the PO/tracking dashboard.
Why it exists: Keeps delivery expectations grounded in actual shipment data, not just the original PO date.
Edge cases / notes: Should recalculate automatically if the ASN is amended.
Test cases: PRD-ASN-021 … PRD-ASN-024 (4).

### FEAT-ASN-006 — ASN Discrepancy Alerts
ASN Discrepancy Alerts is a Optional feature of ASN (Advance Shipment Notice) (MOD-18). Persona: Buyer / Warehouse Executive. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a warehouse executive, I want to be alerted when ASN and PO details diverge, so that I can flag it before the shipment arrives.
Business use case: Automated alert fires when ASN quantity, item, or date deviates materially from the PO.
Why it exists: Surfaces problems while there's still time to act, not after goods are on the dock.
Edge cases / notes: Alert thresholds should be configurable per category.
Test cases: PRD-ASN-025 … PRD-ASN-028 (4).

### FEAT-ASN-007 — Multi-Item / Multi-PO Consolidated ASN
Multi-Item / Multi-PO Consolidated ASN is a Optional feature of ASN (Advance Shipment Notice) (MOD-18). Persona: Vendor. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a vendor, I want to raise one ASN covering multiple POs in a single shipment, so that consolidated dispatches don't need separate notices.
Business use case: One shipment carrying items against several POs is captured as a single ASN with line-level PO references.
Why it exists: Matches real-world consolidated logistics.
Edge cases / notes: Reporting must still be able to break the consolidated ASN back into per-PO views.
Test cases: PRD-ASN-029 … PRD-ASN-032 (4).

### FEAT-ASN-008 — ASN Amendment
ASN Amendment is a Core feature of ASN (Advance Shipment Notice) (MOD-18). Persona: Vendor. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a vendor, I want to amend an ASN if dispatch details change, so that the buyer always sees the current shipment plan.
Business use case: Changes to dispatch date, quantity, or carrier post-submission are logged as an amendment, not a silent edit.
Why it exists: Keeps the buyer's expectation in sync with reality while preserving an audit trail.
Edge cases / notes: Original ASN values are retained for audit alongside the amendment.
Test cases: PRD-ASN-033 … PRD-ASN-036 (4).

### FEAT-ASN-009 — ASN-to-GRN Auto-Prefill
ASN-to-GRN Auto-Prefill is a Core feature of ASN (Advance Shipment Notice) (MOD-18). Persona: Warehouse Executive. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a warehouse executive, I want the GRN form pre-filled from the linked ASN, so that I only need to confirm actuals, not re-key everything.
Business use case: At receipt, GRN fields default to ASN values and the warehouse team edits only where actuals differ.
Why it exists: Speeds up GRN creation and reduces manual entry errors.
Edge cases / notes: Any GRN quantity differing from ASN should be visibly flagged, not silently accepted.
Test cases: PRD-ASN-017 … PRD-ASN-020 (4).

### FEAT-ASN-010 — ASN Tracking / Status Dashboard
ASN Tracking / Status Dashboard is a Reporting feature of ASN (Advance Shipment Notice) (MOD-18). Persona: Buyer / Warehouse Executive. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a buyer, I want a dashboard of all in-transit ASNs, so that I can see what's coming across all vendors at a glance.
Business use case: Dashboard shows ASN status (submitted, in-transit, received, discrepant) across the org.
Why it exists: Centralized inbound-shipment visibility.
Edge cases / notes: Should support filtering by vendor, plant, and expected date.
Test cases: PRD-ASN-037 … PRD-ASN-040 (4).

### FEAT-ASN-011 — Carrier & Transport Details Capture
Carrier & Transport Details Capture is a Optional feature of ASN (Advance Shipment Notice) (MOD-18). Persona: Vendor. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a vendor, I want to record carrier, vehicle, and driver details on the ASN, so that gate/security checks at the receiving site are faster.
Business use case: Transport metadata is captured on the ASN and made available to site security/warehouse teams.
Why it exists: Speeds up physical gate entry and receiving processes.
Edge cases / notes: Relevant mainly for manufacturing/plant-gate scenarios.
Test cases: PRD-ASN-041 … PRD-ASN-043 (3).

### FEAT-ASN-012 — ASN Notification to Warehouse
ASN Notification to Warehouse is a Optional feature of ASN (Advance Shipment Notice) (MOD-18). Persona: Warehouse Executive. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a warehouse executive, I want to be notified automatically when a new ASN is raised against my location, so that I can plan receiving capacity.
Business use case: Warehouse team gets an alert (email/in-app) the moment a relevant ASN is submitted or amended.
Why it exists: Enables proactive receiving-dock planning instead of surprise arrivals.
Edge cases / notes: Notification routing should follow the same location/entity mapping as GRN.
Test cases: PRD-ASN-044 … PRD-ASN-047 (4).

### FEAT-ASN-013 — Vendor ASN Compliance Scorecard
Vendor ASN Compliance Scorecard is a Reporting feature of ASN (Advance Shipment Notice) (MOD-18). Persona: Procurement Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a procurement manager, I want to track how consistently vendors submit ASNs on time and accurately, so that I can factor it into vendor performance reviews.
Business use case: Scorecard tracks ASN timeliness and accuracy rate per vendor over time.
Why it exists: Turns ASN discipline into a measurable vendor-performance input.
Edge cases / notes: Should roll up into the broader vendor scorecard, not stand alone.
Test cases: PRD-ASN-048 … PRD-ASN-051 (4).

### FEAT-ASN-014 — EDI/API Integration for ASN
EDI/API Integration for ASN is a Integration feature of ASN (Advance Shipment Notice) (MOD-18). Persona: Vendor / Engineering. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As an integration engineer, I want ASN data to flow via EDI/API for ERP-integrated vendors, so that high-volume vendors don't use manual portal entry.
Business use case: Large or system-integrated vendors push ASN data directly via EDI 856 or API instead of the web portal.
Why it exists: Scales ASN intake for high-volume vendors without manual bottlenecks.
Edge cases / notes: Requires a fallback portal path for vendors without EDI capability.
Test cases: PRD-ASN-052 … PRD-ASN-055 (4).
