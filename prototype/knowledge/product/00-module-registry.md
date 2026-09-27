# Procol module registry — product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Procol modules at a glance
Procol has 25 registered modules; 23 have a feature sheet with 365 features in total.
Plan tiers named in the workbook, lowest first: Growth < Enterprise ("All Plans" means every tier).
Status legend: GA = live; Beta = maturing; Roadmap = planned; "GA (Already in Procol)" marks pre-existing downstream features.
Foundation & suppliers: Master Data Management (MOD-12), Vendor Management (MOD-01).
Demand: Intake Management (MOD-13), Purchase Requisition (MOD-02).
Sourcing: Sourcing Events (RFX) (MOD-14), RFP - Technical (MOD-04), RFQ (MOD-03), Reverse Auction (MOD-05).
Award, PO & contract: PO Management (MOD-15), Contract Module (MOD-22).
Procure-to-Pay (receipt → pay): ASN (MOD-18), GRN (MOD-19), Quality Check (MOD-20), Invoice Module (MOD-17), Credit-Debit Note (MOD-21), Dispute Management (MOD-24).
Governance: Budget Module (MOD-23), Approval Engine (MOD-09).
Reporting & analytics: Reporting & Doc Generation (MOD-16), Analytics & Reporting (MOD-08).
Platform & admin: Admin & Configuration (MOD-10), Platform Settings (MOD-25), Integration Hub (MOD-11).

## Module registry

### MOD-01 — Vendor Management
Vendor Management (MOD-01) is a Supplier module of Procol.
Description: End-to-end vendor lifecycle: onboarding, amendment, discovery, blocking
Business purpose: Centralise vendor master data; enforce compliance and qualification before a vendor is usable in any procurement flow
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP MDG, HRMS, Email
Status: GA
Feature sheet: "3. Vendor Management" with 45 features; knowledge file product/03-vendor-management.md; test cases group PRD-VM.

### MOD-02 — Purchase Requisition
Purchase Requisition (MOD-02) is a Procurement module of Procol.
Description: Employee-initiated requests to purchase goods or services
Business purpose: Digitise and govern the purchase request process with approvals, budget checks, and GL coding before PO creation
Default state: Enabled
Plan availability: Growth, Enterprise
Depends on: MOD-01
Key integrations: SAP MM, ERP
Status: GA
Feature sheet: "5. Purchase Requisition" with 22 features; knowledge file product/05-purchase-requisition.md; test cases group PRD-PR.

### MOD-03 — RFQ
RFQ (MOD-03) is a Sourcing module of Procol.
Description: Structured competitive commercial bidding
Business purpose: Drive competitive pricing and vendor selection through a governed, auditable bidding process
Default state: Enabled
Plan availability: All Plans
Depends on: MOD-01, MOD-02
Key integrations: Email, SAP MM
Status: GA
Feature sheet: "8. RFQ" with 16 features; knowledge file product/08-rfq.md; test cases group PRD-RFQ.

### MOD-04 — RFP / Technical
RFP / Technical (MOD-04) is a Sourcing module of Procol.
Description: Structured competitive Technical bidding
Business purpose: Drive competitive scopes/ technical specifications and vendor selection through a governed, auditable bidding process
Default state: Enabled
Plan availability: All Plans
Depends on: MOD-01, MOD-02
Key integrations: Email, SAP MM
Status: GA
Feature sheet: "7. RFP - Technical" with 15 features; knowledge file product/07-rfp-technical.md; test cases group PRD-RFP.

### MOD-05 — Reverse Auction
Reverse Auction (MOD-05) is a Sourcing module of Procol.
Description: Real-time price discovery via live online auction events
Business purpose: Achieve best-price outcomes for high-value, commodity, or repeat procurement through competitive real-time bidding
Default state: Optional
Plan availability: Growth, Enterprise
Depends on: MOD-01, MOD-03
Status: GA
Feature sheet: "9. Reverse Auction" with 15 features; knowledge file product/09-reverse-auction.md; test cases group PRD-RA.

### MOD-06 — Contract Management
Contract Management (MOD-06) is a Legal / Compliance module of Procol.
Description: Creation, negotiation, execution, and tracking of vendor contracts
Business purpose: Enforce contractual terms, reduce maverick spend, and provide auditability for all vendor agreements
Default state: Optional
Plan availability: Enterprise
Depends on: MOD-01, MOD-03
Key integrations: DocuSign, SAP MM
Status: GA
No feature sheet in the workbook — a registry entry only.

### MOD-07 — Invoice & Payment
Invoice & Payment (MOD-07) is a Finance module of Procol.
Description: Vendor invoice submission, 3-way matching, and payment milestone tracking
Business purpose: Automate the AP cycle, reduce manual reconciliation, and enforce payment discipline against POs and GRNs
Default state: Optional
Plan availability: Enterprise
Depends on: MOD-01, MOD-02
Key integrations: SAP FI, ERP, Banking
Status: GA
No feature sheet in the workbook — a registry entry only.

### MOD-08 — Analytics & Reporting
Analytics & Reporting (MOD-08) is a Intelligence module of Procol.
Description: Spend analytics, compliance dashboards, and custom reports
Business purpose: Provide leadership and category managers with real-time visibility into procurement performance and spend patterns
Default state: Enabled
Plan availability: Growth, Enterprise
Depends on: All modules
Key integrations: BI Tools, Data Warehouse
Status: GA
Roadmap notes: AI-powered spend insights on roadmap
Feature sheet: "21. Analytics & Reporting" with 2 features; knowledge file product/21-analytics-and-reporting.md; test cases group PRD-ANL.

### MOD-09 — Approval Engine
Approval Engine (MOD-09) is a Platform module of Procol.
Description: Configurable multi-level approval workflows across all modules
Business purpose: Centralise approval logic to enforce spend controls, delegation of authority, and escalation policies consistently
Default state: Enabled
Plan availability: All Plans
Key integrations: Email, SSO
Status: GA
Feature sheet: "19. Approval Engine" with 18 features; knowledge file product/19-approval-engine.md; test cases group PRD-AE.

### MOD-10 — Admin & Configuration
Admin & Configuration (MOD-10) is a Platform module of Procol.
Description: Tenant settings, user management, org structure, roles, and feature toggles
Business purpose: Give tenant admins control over their instance — org hierarchy, user roles, feature flags, and integration setup
Default state: Enabled
Plan availability: All Plans
Key integrations: SSO/SAML, SCIM, HRMS
Status: GA
Feature sheet: "22. Admin & Configuration" with 8 features; knowledge file product/22-admin-and-configuration.md; test cases group PRD-ADM.

### MOD-11 — Integration Hub
Integration Hub (MOD-11) is a Platform module of Procol.
Description: Connector management for ERP, HRMS, and third-party systems
Business purpose: Provide a governed, configurable layer for all inbound/outbound data exchange so modules stay decoupled from integrations
Default state: Optional
Plan availability: Enterprise
Depends on: MOD-09
Key integrations: SAP, Oracle, Workday, API
Status: GA
Roadmap notes: Self-serve connector config on roadmap
Feature sheet: "24. Integration Hub" with 2 features; knowledge file product/24-integration-hub.md; test cases group PRD-INTG.

### MOD-12 — Master Data Management
Master Data Management (MOD-12) is a Platform / Master Data module of Procol.
Description: Material master, service master, and user master onboarding plus bulk uploads
Business purpose: Establish clean item, service, and user master data as the foundation for every procurement transaction
Default state: Enabled
Plan availability: All Plans
Depends on: MOD-11
Key integrations: SAP MM/MDG, ERP
Status: GA
Roadmap notes: NEW (provisional) - confirm name/placement
Last updated: 12-Jun-26
Feature sheet: "2. Master Data Management" with 9 features; knowledge file product/02-master-data-management.md; test cases group PRD-MDM.

### MOD-13 — Intake Management
Intake Management (MOD-13) is a Procurement module of Procol.
Description: In-platform demand intake and request orchestration when no ERP PR feed exists
Business purpose: Capture and route demand (PR, approvals, material/vendor requests) via configurable templates and Delegation of Authority
Default state: Optional
Plan availability: Growth, Enterprise
Depends on: MOD-09, MOD-12
Key integrations: ERP Budgeting (Fund Center/WBS)
Status: GA
Roadmap notes: NEW (provisional) - non-integrated counterpart to MOD-02
Last updated: 12-Jun-26
Feature sheet: "4. Intake Management" with 12 features; knowledge file product/04-intake-management.md; test cases group PRD-INTK.

### MOD-14 — Sourcing Events (RFX)
Sourcing Events (RFX) (MOD-14) is a Sourcing module of Procol.
Description: Orchestration of multi-stage sourcing events (technical, RFQ, auction) as a single auditable project
Business purpose: Provide a unified sourcing-event layer that composes technical, RFQ, and auction stages over PR or standalone demand
Default state: Enabled
Plan availability: All Plans
Depends on: MOD-02, MOD-03, MOD-04, MOD-05
Key integrations: Currency Rate API, Email/WhatsApp/SMS
Status: GA
Roadmap notes: NEW (provisional) - MOD-03/04/05 read as stages within this; confirm structure
Last updated: 12-Jun-26
Feature sheet: "6. Sourcing Events (RFX)" with 30 features; knowledge file product/06-sourcing-events-rfx.md; test cases group PRD-RFX.

### MOD-15 — PO Management
PO Management (MOD-15) is a Procurement module of Procol.
Description: Purchase order assembly, configurable PO templates, PO amendment, and ERP PO creation
Business purpose: Convert awards into governed, ERP-aligned purchase orders and keep them synced with SAP
Default state: Enabled
Plan availability: All Plans
Depends on: MOD-02, MOD-14, MOD-09
Key integrations: SAP, ERP PO/DMS
Status: GA
Roadmap notes: NEW (provisional) - from award/PO flow
Last updated: 12-Jun-26
Feature sheet: "10. PO Management" with 25 features; knowledge file product/10-po-management.md; test cases group PRD-PO.

### MOD-16 — Reporting & Document Generation
Reporting & Document Generation (MOD-16) is a Platform / Reporting module of Procol.
Description: NFA/NTD and award-document generation plus the sourcing/vendor/PR report suite and custom report builder
Business purpose: Produce auditable approval documents and configurable reports across the procurement lifecycle
Default state: Enabled
Plan availability: Growth, Enterprise
Depends on: MOD-03, MOD-14, MOD-15
Key integrations: PDF/Excel export
Status: GA
Roadmap notes: NEW (provisional) - large sub-system surfaced from RFX squad sheet
Last updated: 12-Jun-26
Feature sheet: "20. Reporting & Doc Generation" with 8 features; knowledge file product/20-reporting-and-doc-generation.md; test cases group PRD-RPT.

### MOD-17 — Invoice Module
Invoice Module (MOD-17) is a Procure-to-Pay (P2P) module of Procol.
Description: Vendor invoice capture, PO/GRN matching, tax & exception handling in the P2P cycle.
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP
Status: GA
Roadmap notes: Imported from downstream P2P feature list (PM).
Last updated: 2026-07-02
Feature sheet: "15. Invoice Module" with 24 features; knowledge file product/15-invoice-module.md; test cases group PRD-INV.

### MOD-18 — ASN (Advance Shipment Notice)
ASN (Advance Shipment Notice) (MOD-18) is a Procure-to-Pay (P2P) module of Procol.
Description: Advance Shipment Notices from vendors ahead of physical goods receipt.
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP
Status: GA
Roadmap notes: Imported from downstream P2P feature list (PM).
Last updated: 2026-07-02
Feature sheet: "12. ASN" with 14 features; knowledge file product/12-asn.md; test cases group PRD-ASN.

### MOD-19 — GRN (Goods Receipt Note)
GRN (Goods Receipt Note) (MOD-19) is a Procure-to-Pay (P2P) module of Procol.
Description: Goods Receipt Notes against POs — physical receipt, acceptance and returns.
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP
Status: GA
Roadmap notes: Imported from downstream P2P feature list (PM).
Last updated: 2026-07-02
Feature sheet: "13. GRN" with 16 features; knowledge file product/13-grn.md; test cases group PRD-GRN.

### MOD-20 — Quality Check (incl. MDCC, FAT, PDI)
Quality Check (incl. MDCC, FAT, PDI) (MOD-20) is a Procure-to-Pay (P2P) module of Procol.
Description: Quality inspection (incl. MDCC, FAT, PDI) with configurable checklists and outcomes.
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP
Status: GA
Roadmap notes: Imported from downstream P2P feature list (PM).
Last updated: 2026-07-02
Feature sheet: "14. Quality Check" with 21 features; knowledge file product/14-quality-check.md; test cases group PRD-QC.

### MOD-21 — Credit / Debit Note
Credit / Debit Note (MOD-21) is a Procure-to-Pay (P2P) module of Procol.
Description: Credit and debit notes for post-invoice adjustments and mismatches.
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP
Status: GA
Roadmap notes: Imported from downstream P2P feature list (PM).
Last updated: 2026-07-02
Feature sheet: "16. Credit-Debit Note" with 12 features; knowledge file product/16-credit-debit-note.md; test cases group PRD-CDN.

### MOD-22 — Contract Module
Contract Module (MOD-22) is a Procure-to-Pay (P2P) module of Procol.
Description: Contract repository and lifecycle for executed agreements.
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP
Status: GA
Roadmap notes: Imported from downstream P2P feature list (PM).
Last updated: 2026-07-02
Feature sheet: "11. Contract Module" with 9 features; knowledge file product/11-contract-module.md; test cases group PRD-CON.

### MOD-23 — Budget Module
Budget Module (MOD-23) is a Procure-to-Pay (P2P) module of Procol.
Description: Budget creation, mapping and consumption tracking across the P2P cycle.
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP
Status: GA
Roadmap notes: Imported from downstream P2P feature list (PM).
Last updated: 2026-07-02
Feature sheet: "18. Budget Module" with 8 features; knowledge file product/18-budget-module.md; test cases group PRD-BUD.

### MOD-24 — Dispute Management
Dispute Management (MOD-24) is a Procure-to-Pay (P2P) module of Procol.
Description: Structured resolution of invoice/GRN/PO mismatches and disputes.
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP
Status: GA
Roadmap notes: Imported from downstream P2P feature list (PM).
Last updated: 2026-07-02
Feature sheet: "17. Dispute Management" with 11 features; knowledge file product/17-dispute-management.md; test cases group PRD-DIS.

### MOD-25 — Platform Settings (Approvals, Access, Cost Centers, Analytics)
Platform Settings (Approvals, Access, Cost Centers, Analytics) (MOD-25) is a Procure-to-Pay (P2P) module of Procol.
Description: Downstream platform configuration — approvals, access, cost centers and analytics.
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP
Status: GA
Roadmap notes: Imported from downstream P2P feature list (PM).
Last updated: 2026-07-02
Feature sheet: "23. Platform Settings" with 23 features; knowledge file product/23-platform-settings.md; test cases group PRD-PLT.
