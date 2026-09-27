# Procol configuration, workflows, flags and integrations — product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Configuration reference

7 configuration parameters.

### CONF-VM-001 — Vendor Form Sections (`vendor.form.sections`)
Configuration parameter of Vendor Management (MOD-01), feature FEAT-VM-001 "VMS / VRP Import".
Type: Multi-select
Default: Basic Info, Banking, Documents, Tax
Allowed values: Basic Info | Banking | Documents | Tax | Qualifications | References
What it does: Controls which sections are visible and required on the vendor onboarding form
Why it exists: Different tenants have different compliance requirements. A manufacturing client may require HSE certificates; an FMCG client may not. This config avoids building separate forms per tenant
Business impact: Changes which data is collected at onboarding; removing Banking section means payment details must be captured elsewhere
Plan required: All Plans
Risk if changed: Medium
Tenant-configurable: Yes

### CONF-VM-002 — Mandatory Document Types (`vendor.documents.required`)
Configuration parameter of Vendor Management (MOD-01), feature FEAT-VM-001 "VMS / VRP Import".
Type: Multi-select / JSON
Default: PAN, GST Certificate
Allowed values: PAN | GST Certificate | MSME Certificate | ISO Certificate | TAN | Bank Cancel Cheque | Trade Licence
What it does: List of document types a vendor must upload before their profile can be submitted for approval
Why it exists: Mandatory document lists differ by country, industry, and company policy. Making it configurable ensures compliance without code changes per tenant
Business impact: Missing documents won't be flagged as blocking; vendors could be onboarded without critical compliance documents
Plan required: All Plans
Risk if changed: High
Tenant-configurable: Yes
Depends on: CONF-VM-001

### CONF-VM-003 — Vendor Approval Levels (`vendor.approval.levels`)
Configuration parameter of Vendor Management (MOD-01), feature FEAT-VM-002 "Buyer-Initiated Vendor Invitation".
Type: Number
Default: 2
Allowed values: 1 – 5
What it does: Number of sequential approval levels required before a vendor is activated
Why it exists: Different organizations have different governance requirements. A startup may need 1 approver; an enterprise like JSPL needs Finance + Legal + Category approval
Business impact: Directly affects how many people must approve each new vendor; reducing this relaxes controls, increasing it adds friction
Plan required: All Plans
Risk if changed: High
Tenant-configurable: Yes

### CONF-AE-001 — DoA Threshold Currency (`approval.doa.currency`)
Configuration parameter of Approval Engine (MOD-09), feature FEAT-AE-001 "Modular Approval Setup".
Type: Dropdown
Default: INR
Allowed values: INR | USD | EUR | GBP | AED | SGD
What it does: Currency unit used for all spend threshold definitions in the Delegation of Authority matrix
Why it exists: Multi-geography tenants may operate in different currencies. Locking DoA amounts to a single currency config prevents ambiguity in approval routing
Business impact: Affects all approval routing thresholds; changing after go-live requires reconfiguration of all DoA rules
Plan required: All Plans
Risk if changed: High
Tenant-configurable: Yes

### CONF-AE-002 — Escalation Timeout (Hours) (`approval.escalation.timeout_hours`)
Configuration parameter of Approval Engine (MOD-09), feature FEAT-AE-002 "Condition-Based Triggering".
Type: Number
Default: 48
Allowed values: 1 – 720
What it does: Number of hours an approval can remain pending before it is auto-escalated to the next level
Why it exists: Without a timeout, approvals can stall indefinitely. SLA-based escalation ensures procurement cycles don't block on individual approver availability
Business impact: Setting too low creates approval fatigue; too high defeats the purpose of escalation. Must be aligned to the tenant's internal SLA policy
Plan required: All Plans
Risk if changed: Medium
Tenant-configurable: Yes

### CONF-RFQ-001 — Allow Partial Bidding (`rfq.bid.allow_partial`)
Configuration parameter of RFQ (MOD-03), feature FEAT-RFQ-001 "RFQ Templates (Line/Global/Formula)".
Type: Toggle
Default: OFF
Allowed values: ON | OFF
What it does: When ON, vendors can submit bids for a subset of line items in the RFQ rather than the full BOQ
Why it exists: For large RFQs with many line items, forcing full bids limits vendor participation. Partial bidding increases competition and can reduce overall cost by splitting award across specialists
Business impact: Enabling this requires Procurement team to handle split-award decisions and manage multiple POs; disabling ensures single-source RFQ completion
Plan required: Growth, Enterprise
Risk if changed: Medium
Tenant-configurable: Yes

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

## Workflow and approval chains

2 workflows.

### WF-VM-001 — Vendor Onboarding workflow
Approval workflow of Vendor Management (MOD-01). Trigger: Vendor submits onboarding form.
Step 1 Form Completeness Check — System Validation; actor System (Auto); bypass/condition: All required fields and documents present; tenant-configurable: No.
Step 2 Finance Approval — Approval; actor Finance Controller; mode Sequential; SLA 48h; escalates to Finance Head; tenant-configurable: Yes (timeout + levels).
Step 3 Legal / Compliance Review — Approval; actor Legal / Compliance; mode Sequential; SLA 72h; escalates to Legal Head; bypass/condition: Vendor already approved in Global DB; tenant-configurable: Yes; note: Optional step; configurable to skip for pre-approved vendors.
Step 4 Category Manager Endorsement — Approval; actor Category Manager; mode Parallel with Step 3; SLA 24h; escalates to Procurement Head; tenant-configurable: Yes; note: Can run parallel with Legal if configured.
Step 5 Vendor Activation — System Action; actor System (Auto); bypass/condition: All prior steps Approved; tenant-configurable: No; note: Vendor status changes to Active; SAP MDG sync triggered if integration enabled.

### WF-PR-001 — PR Approval workflow
Approval workflow of Purchase Requisition (MOD-02). Trigger: Employee submits Purchase Requisition.
Step 1 Budget Check — System Validation; actor System (Auto); tenant-configurable: No; note: Checks available budget against GL code; blocks if exceeded.
Step 2 Line Manager Approval — Approval; actor Requestor's Line Manager; mode Sequential; SLA 24h; escalates to Department Head; bypass/condition: Amount ≤ INR 10,000 and vendor pre-approved; tenant-configurable: Yes; note: Bypass threshold is configurable.
Step 3 Finance Approval — Approval; actor Finance Controller; mode Sequential; SLA 48h; escalates to CFO; bypass/condition: Amount ≤ INR 50,000 and within budget; tenant-configurable: Yes; note: Conditional on DoA matrix thresholds.
Step 4 PR-to-PO Conversion — System Action; actor System / Buyer; bypass/condition: All approvals complete; tenant-configurable: No; note: Auto-converts to PO if template mapped; else Buyer manually creates PO.

## Feature flags

The Feature Flags sheet has no rows. Flags referenced elsewhere in the workbook but not defined: FF-003 (DEP-002); FF-004 (DEP-004); FF-005 (DEP-005, INT-004).

## Integration catalog

5 integrations.

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

### INT-003 — SSO / SAML 2.0 integration
External integration for Admin & Configuration (MOD-10).
Type: Inbound
Trigger: User login attempt on Procol
Data exchanged: User identity: email, name, roles, department, entity from IdP
Key config parameters: sso.provider (Okta/Azure AD/ADFS), sso.entity_id, sso.sso_url, sso.certificate, sso.role_mapping
Auth: SAML 2.0
Tenant-configurable: Yes
Required for module: No (optional)
Failure handling: Falls back to Procol-native login if SSO fails; admin alerted; SSO errors logged
Status: GA

### INT-004 — SCIM 2.0 (HRMS Sync) integration
External integration for Admin & Configuration (MOD-10).
Type: Inbound
Trigger: User created/updated/deprovisioned in HRMS (Workday, SAP HCM, etc.)
Data exchanged: User profile: name, email, department, designation, reporting manager, status
Key config parameters: scim.base_url, scim.bearer_token, scim.attribute_mapping, scim.deprovision_action (Deactivate/Delete)
Auth: Bearer Token
Tenant-configurable: Yes
Required for module: No (Enterprise only)
Config dependencies: FF-005
Failure handling: Failed SCIM events are queued and retried; admin dashboard shows sync errors
Status: Active
Notes: Requires FF-005 (SCIM Provisioning) to be enabled

### INT-005 — Email Notifications integration
External integration for RFQ (MOD-03), Reverse Auction (MOD-05).
Type: Outbound
Trigger: Any workflow event: approval request, bid invitation, PO issued, etc.
Data exchanged: Notification content: recipient email, subject, body, action links, attachments
Key config parameters: email.provider (SES/SendGrid/SMTP), email.from_address, email.reply_to, email.template_overrides
Auth: API Key / SMTP
Tenant-configurable: Yes
Required for module: Yes (all modules)
Failure handling: Failed emails retried 3x; after failures, notification logged as 'undelivered'; fallback to in-app notification
Status: GA
Notes: Template customisation per module event is configurable in Admin

## Configuration dependencies

6 dependencies.

### DEP-001 — Mandatory Document Types depends on Vendor Form Sections
Configuration dependency (Required): CONF-VM-002 "Mandatory Document Types" (`vendor.documents.required`) depends on CONF-VM-001 "Vendor Form Sections" (`vendor.form.sections`).
Impact if missing or misconfigured: If 'Documents' section is removed from form sections (CONF-VM-001), mandatory document config is ignored — vendors can be submitted without documents
Guidance: Always ensure 'Documents' is included in vendor form sections when CONF-VM-002 has any values set

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

### DEP-004 — AI Spend Insights depends on Standard Dashboards (Feature)
Configuration dependency (Required): FF-004 depends on FEAT-ANL-001 "Price-Trend Dashboard".
Impact if missing or misconfigured: AI Spend Insights is an overlay on the analytics module; cannot be enabled if the Analytics module itself is inactive for the tenant
Guidance: Ensure MOD-07 (Analytics) is active for the tenant before enabling FF-004
Note: FF-004 is not defined anywhere else in the workbook.

### DEP-005 — SCIM User Provisioning depends on SSO Configuration
Configuration dependency (Recommended): FF-005 depends on CONF-ADM-001.
Condition: SCIM is typically deployed alongside SSO
Impact if missing or misconfigured: SCIM without SSO is valid but unusual; users will be auto-provisioned but still use password login unless SSO is also configured
Guidance: Always validate SSO config before enabling SCIM to avoid orphaned provisioned accounts
Note: FF-005 and CONF-ADM-001 is not defined anywhere else in the workbook.

### DEP-006 — Escalation Timeout (Hours) depends on DoA Threshold Currency
Configuration dependency (Conditional): CONF-AE-002 "Escalation Timeout (Hours)" (`approval.escalation.timeout_hours`) depends on CONF-AE-001 "DoA Threshold Currency" (`approval.doa.currency`).
Condition: Only matters when DoA matrix thresholds trigger escalation
Impact if missing or misconfigured: If DoA currency is misconfigured, amount-based escalation rules may route to wrong approver level
Guidance: Always configure CONF-AE-001 (DoA Currency) before setting up escalation policies in CONF-AE-002

## Undefined references in the workbook

FF-003 is referenced by DEP-002 but not defined in any sheet.
CONF-INT-002 is referenced by DEP-003, CONF-INT-001 but not defined in any sheet.
FF-004 is referenced by DEP-004 but not defined in any sheet.
FF-005 is referenced by DEP-005, INT-004 but not defined in any sheet.
CONF-ADM-001 is referenced by DEP-005 but not defined in any sheet.
