# 24. Integration Hub (MOD-11) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Integration Hub module overview
Integration Hub (MOD-11) is a Platform module of Procol, in the "Platform & admin" stage of the procurement lifecycle.
Description: Connector management for ERP, HRMS, and third-party systems
Business purpose: Provide a governed, configurable layer for all inbound/outbound data exchange so modules stay decoupled from integrations
Default state: Optional
Plan availability: Enterprise
Depends on modules: MOD-09 Approval Engine
Key integrations: SAP, Oracle, Workday, API
Registry status: GA
Roadmap notes: Self-serve connector config on roadmap
Features: 2 (2 GA). Test cases: test-cases/product-24-integration-hub.md, group PRD-INTG.

## Integration Hub features

2 features in 1 categories: Core.

### FEAT-INTG-001 — MQCS to SAP PO Integration
MQCS to SAP PO Integration is a Core feature of Integration Hub (MOD-11). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want the final Master QCS transferred to SAP for PO creation, so that award data flows to the ERP automatically.
Business use case: On award/PO; the final Master QCS is transferred to SAP for PO creation.
Why it exists: Closes the sourcing-to-ERP loop.
Edge cases / notes: Cross-links MOD-15.
Test cases: PRD-INTG-001 … PRD-INTG-003 (3).

### FEAT-INTG-002 — Statutory Verification APIs
Statutory Verification APIs is a Core feature of Integration Hub (MOD-11). Persona: MDM / Master Data Team. Plan: All Plans. Status: GA.
User story: As an MDM reviewer, I want PAN, GST, bank, MSME, TAN, and IFSC verified via API, so that vendor checks are automated and reliable.
Business use case: During onboarding/verification; PAN, GST, bank, MSME, TAN, and IFSC are checked via external APIs.
Why it exists: Automated compliance checks.
Edge cases / notes: Realized in MOD-01.
Test cases: PRD-INTG-004 … PRD-INTG-005 (2).

## Integration Hub configuration

### CONF-INT-001 — SAP PR Sync Mode (`integration.sap.pr.sync_mode`)
Configuration parameter of Integration Hub (MOD-11).
Type: Dropdown
Default: Push (SAP → Procol)
Allowed values: Push (SAP → Procol) | Pull (Procol polls SAP) | Bidirectional
What it does: Controls the direction of Purchase Requisition data flow between SAP and Procol
Why it exists: Different SAP landscapes have different integration capabilities. Some S/4HANA environments support event-driven push; others require scheduled polling. This config avoids hardcoding integration mode in code
Business impact: Affects data freshness and system load; Bidirectional mode requires conflict resolution logic to be configured
Plan required: Enterprise
Risk if changed: High
Tenant-configurable: Yes
Depends on: CONF-INT-002

## Integration Hub integrations

### INT-001 — SAP MDG (Master Data Governance) integration
External integration for Vendor Management (MOD-01), Integration Hub (MOD-11).
Type: Bidirectional
Trigger: Vendor created/updated in Procol OR vendor changed in SAP MDG
Data exchanged: Vendor master: name, PAN, GSTIN, bank details, vendor code, status, category
Key config parameters: sap.mdg.endpoint, sap.mdg.client_id, sap.mdg.sync_mode (Push/Pull/Bi), sap.mdg.batch_size
Auth: OAuth 2.0
Tenant-configurable: Yes
Required for module: Yes (SAP tenants)
Config dependencies: CONF-INT-001, CONF-VM-002
Failure handling: Retry 3x with exponential backoff; after 3 failures, alert sent to admin and record queued for manual review
Status: GA
Notes: Primary MDG integration for large enterprise clients

### INT-002 — SAP MM (Purchase Requisition) integration
External integration for Purchase Requisition (MOD-02), Integration Hub (MOD-11).
Type: Bidirectional
Trigger: PR approved in Procol → PO created in SAP; OR PR created in SAP → pulled into Procol
Data exchanged: PR fields: PR number, line items, GL code, cost centre, plant, vendor, amount, currency
Key config parameters: sap.mm.rfc_host, sap.mm.pr_doc_type, sap.mm.plant_mapping, sap.mm.sync_interval_minutes
Auth: RFC / API Key
Tenant-configurable: Yes
Required for module: Yes (SAP tenants)
Config dependencies: CONF-INT-001
Failure handling: Failed PO creation triggers webhook alert; PR held in 'Sync Pending' state; daily reconciliation job re-attempts
Status: GA
Notes: RFC-based for older SAP versions; REST API for S/4HANA Cloud

## Integration Hub configuration dependencies

### DEP-002 — Auto PR-to-PO Conversion depends on SAP PR Sync Mode
Configuration dependency (Conditional): FF-003 depends on CONF-INT-001 "SAP PR Sync Mode" (`integration.sap.pr.sync_mode`).
Condition: Only relevant if SAP integration is active
Impact if missing or misconfigured: Auto-conversion may create POs in Procol that never sync to SAP, causing data inconsistency between systems
Guidance: FF-003 should only be enabled after SAP MM integration (INT-002) is fully configured and tested
Note: FF-003 is not defined anywhere else in the workbook.

### DEP-003 — SAP PR Sync Mode depends on SAP RFC Connection Config
Configuration dependency (Required): CONF-INT-001 "SAP PR Sync Mode" (`integration.sap.pr.sync_mode`) depends on CONF-INT-002.
Impact if missing or misconfigured: SAP PR sync cannot function without RFC connection details; enabling sync without this config causes all PR sync jobs to fail
Guidance: CONF-INT-002 must be configured before activating any SAP-related sync mode
Note: CONF-INT-002 is not defined anywhere else in the workbook.
