# 05. Purchase Requisition (MOD-02) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Purchase Requisition module overview
Purchase Requisition (MOD-02) is a Procurement module of Procol, in the "Demand" stage of the procurement lifecycle.
Description: Employee-initiated requests to purchase goods or services
Business purpose: Digitise and govern the purchase request process with approvals, budget checks, and GL coding before PO creation
Default state: Enabled
Plan availability: Growth, Enterprise
Depends on modules: MOD-01 Vendor Management
Key integrations: SAP MM, ERP
Registry status: GA
Features: 22 (22 GA). Test cases: test-cases/product-05-purchase-requisition.md, group PRD-PR.

## Purchase Requisition features

22 features in 2 categories: Core, Optional.

### FEAT-PR-001 — ERP PR Ingestion
ERP PR Ingestion is a Core feature of Purchase Requisition (MOD-02). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want released PRs to flow automatically from the ERP into Procol, so that I can act on ready-to-source demand without re-keying.
Business use case: Integrated tenants; only released PRs flow from SAP/Oracle into Procol automatically (drafts are excluded).
Why it exists: Brings governed ERP demand into Procol without re-keying.
Edge cases / notes: Only released PRs; cross-links MOD-11 / INT-002.
Test cases: PRD-PR-001 … PRD-PR-004 (4).

### FEAT-PR-002 — Configurable PR Dashboard
Configurable PR Dashboard is a Core feature of Purchase Requisition (MOD-02). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want to arrange, freeze, hide, filter, and save my PR dashboard view, so that I can work my queue the way that suits me.
Business use case: Buyers personalize the PR worklist (columns, freeze, filters) and the layout persists per user across logins.
Why it exists: Relevant, persistent views improve buyer throughput.
Edge cases / notes: Saved view persists per user.
Test cases: PRD-PR-005 … PRD-PR-008 (4).

### FEAT-PR-003 — PR Status Buckets
PR Status Buckets is a Core feature of Purchase Requisition (MOD-02). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want PR line items tracked across Open, In-Progress, Completed, Hold, and Draft, so that I can see where each item sits in the sourcing cycle.
Business use case: Buyers track each PR line across Open/In-Progress/Completed/Hold/Draft buckets throughout the sourcing cycle.
Why it exists: Clear lifecycle visibility per line item.
Edge cases / notes: Statuses configurable and filterable.
Test cases: PRD-PR-009 … PRD-PR-012 (4).

### FEAT-PR-004 — PR Hold and ERP Send-Back
PR Hold and ERP Send-Back is a Core feature of Purchase Requisition (MOD-02). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want to hold an ambiguous PR line and send it back to the ERP for correction, so that I can resolve unclear demand without losing the PR.
Business use case: When a requirement is ambiguous; the buyer holds the line and sends it back to the ERP for the requester to correct.
Why it exists: Resolves requirement ambiguity without losing the PR.
Edge cases / notes: Round-trips to ERP.
Test cases: PRD-PR-013 … PRD-PR-016 (4).

### FEAT-PR-005 — PR Detail View
PR Detail View is a Core feature of Purchase Requisition (MOD-02). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want a PR detail view showing all line items, their statuses, and the requisitioner, so that I can make informed processing decisions.
Business use case: Buyers open a PR to inspect all its line items, statuses, and the requisitioner before processing.
Why it exists: Context for processing decisions.
Test cases: PRD-PR-017 … PRD-PR-019 (3).

### FEAT-PR-006 — PR Sync Modes (Real-time / Batch)
PR Sync Modes (Real-time / Batch) is a Core feature of Purchase Requisition (MOD-02). Persona: Tenant Admin. Plan: Growth, Enterprise. Status: GA.
User story: As an admin, I want PR sync configurable as real-time or scheduled batch, so that I can align ingestion with our ERP's capability.
Business use case: At integration setup; PR ingestion is configured as real-time on release or scheduled batch to suit the ERP.
Why it exists: Different ERP landscapes need different sync modes.
Edge cases / notes: Maps to CONF-INT-001 sync mode + interval.
Configs: CONF-INT-001 `integration.sap.pr.sync_mode` (default Push (SAP → Procol); allowed Push (SAP → Procol) | Pull (Procol polls SAP) | Bidirectional)
Test cases: PRD-PR-020 … PRD-PR-026 (7).

### FEAT-PR-007 — Line-Item Assignment Rule Engine
Line-Item Assignment Rule Engine is a Optional feature of Purchase Requisition (MOD-02). Persona: Procurement Manager. Plan: Growth, Enterprise. Status: GA.
User story: As a procurement manager, I want PR line items auto-assigned by category, location, and value rules, so that I can route demand to the right buyer without manual triage.
Business use case: As PRs arrive; rule-based routing auto-assigns lines to buyers by category, location, or value.
Why it exists: Removes manual triage of incoming PRs.
Test cases: PRD-PR-046 … PRD-PR-048 (3).

### FEAT-PR-008 — ERP Assignee Auto-Mapping
ERP Assignee Auto-Mapping is a Optional feature of Purchase Requisition (MOD-02). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want the PR's ERP assignee mapped to a Procol user when no rule exists, so that ownership is honored without extra setup.
Business use case: Where no routing rule exists but the PR carries an ERP assignee; it is mapped to the matching Procol user.
Why it exists: Fallback assignment without rule setup.
Test cases: PRD-PR-049 … PRD-PR-051 (3).

### FEAT-PR-009 — Reassign Line Item
Reassign Line Item is a Core feature of Purchase Requisition (MOD-02). Persona: Procurement Manager. Plan: Growth, Enterprise. Status: GA.
User story: As a procurement manager, I want to reassign a PR line item to another user, so that I can reroute work when an owner is unavailable.
Business use case: When an owner is unavailable; a permissioned user reassigns the PR line to someone else.
Why it exists: Operational flexibility.
Edge cases / notes: RBAC-gated.
Test cases: PRD-PR-027 … PRD-PR-029 (3).

### FEAT-PR-010 — PR Grouping and Consolidation Engine
PR Grouping and Consolidation Engine is a Optional feature of Purchase Requisition (MOD-02). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want to group line items by category, location, or vendor within guardrails and float an RFX from the group, so that I can consolidate demand for better leverage.
Business use case: Before sourcing; buyers group lines by category/location/vendor within guardrails and float an RFX from the group.
Why it exists: Consolidation improves leverage and reduces event count.
Test cases: PRD-PR-052 … PRD-PR-054 (3).

### FEAT-PR-011 — Bulk Consolidate Across PRs
Bulk Consolidate Across PRs is a Core feature of Purchase Requisition (MOD-02). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want to consolidate line items across multiple PRs into one event, so that I can run fewer, larger sourcing events.
Business use case: Buyers select lines across several PRs and consolidate them into a single event.
Why it exists: Fewer, larger events.
Test cases: PRD-PR-030 … PRD-PR-032 (3).

### FEAT-PR-012 — Line-Item Quantity Split
Line-Item Quantity Split is a Core feature of Purchase Requisition (MOD-02). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want to split a line item's quantity (capped at the PR amount) before an event, so that I can source partial quantities now.
Business use case: When sourcing part of a line now (e.g., 500 of 1,000); the buyer splits the quantity, capped at the PR amount.
Why it exists: Phased or partial sourcing.
Edge cases / notes: Cannot exceed PR quantity.
Test cases: PRD-PR-033 … PRD-PR-036 (4).

### FEAT-PR-013 — ARC Item Tagging
ARC Item Tagging is a Optional feature of Purchase Requisition (MOD-02). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want ARC-tagged items to skip sourcing and go straight to PO, so that I can avoid redundant events for rate-contracted items.
Business use case: For items under an Annual Rate Contract; buyers tag them and route straight to PO, skipping sourcing.
Why it exists: Avoids redundant sourcing for rate-contracted items.
Edge cases / notes: Cross-links MOD-06.
Test cases: PRD-PR-055 … PRD-PR-057 (3).

### FEAT-PR-014 — Reorder Flow
Reorder Flow is a Optional feature of Purchase Requisition (MOD-02). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want a reorder option to re-award to the previous vendor within a lookback window, so that I can repeat recent purchases without an RFX.
Business use case: When a matching item was bought within the lookback window; the buyer re-awards to the same vendor without an RFX.
Why it exists: Speeds repeat procurement.
Edge cases / notes: Window per SOP.
Test cases: PRD-PR-058 … PRD-PR-061 (4).

### FEAT-PR-015 — Bulk ARC Processing
Bulk ARC Processing is a Core feature of Purchase Requisition (MOD-02). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want to bulk-process items through the ARC route, so that I can clear many contracted items at once.
Business use case: Buyers bulk-select many contracted items and push them through the ARC route at once.
Why it exists: Throughput for rate-contract items.
Test cases: PRD-PR-037 … PRD-PR-039 (3).

### FEAT-PR-016 — Add to Draft RFX from PR
Add to Draft RFX from PR is a Core feature of Purchase Requisition (MOD-02). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want to append PR line items to an existing draft RFX, so that I can build up an event incrementally.
Business use case: Buyers add selected PR lines to an in-progress draft event over time.
Why it exists: Incremental event assembly.
Test cases: PRD-PR-040 … PRD-PR-042 (3).

### FEAT-PR-017 — PR Ageing Auto-Lock
PR Ageing Auto-Lock is a Optional feature of Purchase Requisition (MOD-02). Persona: Procurement Manager. Plan: Enterprise. Status: GA.
User story: As a procurement lead, I want PRs older than a threshold locked from sourcing, so that I can force review of stale demand before acting on it.
Business use case: PRs left unactioned past a threshold are auto-locked from sourcing until reviewed.
Why it exists: Prevents acting on outdated requirements.
Test cases: PRD-PR-062 … PRD-PR-064 (3).

### FEAT-PR-018 — PR Linkage to Non-PR Event
PR Linkage to Non-PR Event is a Optional feature of Purchase Requisition (MOD-02). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want to link a PR to a standalone event, so that I can connect ad-hoc sourcing back to demand.
Business use case: Buyers link a PR to a standalone (non-PR) event to tie ad-hoc sourcing back to demand.
Why it exists: Connects ad-hoc events back to demand.
Test cases: PRD-PR-065 … PRD-PR-067 (3).

### FEAT-PR-019 — PR Amendment Flow
PR Amendment Flow is a Core feature of Purchase Requisition (MOD-02). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want to amend PR line items with re-validation and approval, so that I can revise demand in a controlled way.
Business use case: When demand changes; buyers amend PR lines with re-validation and approval.
Why it exists: Controlled demand changes.
Test cases: PRD-PR-043 … PRD-PR-045 (3).

### FEAT-PR-020 — Bulk PR Upload
Bulk PR Upload is a Optional feature of Purchase Requisition (MOD-02). Persona: Procurement Manager. Plan: Growth, Enterprise. Status: GA.
User story: As a procurement manager, I want to bulk-upload PRs via template, so that I can load demand at scale without an ERP feed.
Business use case: Non-integrated tenants bulk-upload PRs (with assignee and preferred vendor) via template.
Why it exists: Non-integrated demand entry at scale.
Test cases: PRD-PR-068 … PRD-PR-070 (3).

### FEAT-PR-021 — Off-Platform & Partial PR Closure
Off-Platform & Partial PR Closure is a Optional feature of Purchase Requisition (MOD-02). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want to short-close or close off-platform PRs with approval, so that I can reconcile demand accurately.
Business use case: Buyers reconcile demand handled off-platform or partially fulfilled by closing/short-closing lines with approval.
Why it exists: Accurate demand closure.
Edge cases / notes: Short close needs approval.
Test cases: PRD-PR-071 … PRD-PR-074 (4).

### FEAT-PR-022 — PR Collator
PR Collator is a Optional feature of Purchase Requisition (MOD-02). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want to collate multiple PRs into one supplier window, so that I can engage a supplier across aggregated demand.
Business use case: Buyers collate multiple PRs into a single supplier window for aggregated engagement.
Why it exists: Consolidated supplier engagement.
Test cases: PRD-PR-075 … PRD-PR-077 (3).

## Purchase Requisition configuration

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

## Purchase Requisition workflows and approvals

### WF-PR-001 — PR Approval workflow
Approval workflow of Purchase Requisition (MOD-02). Trigger: Employee submits Purchase Requisition.
Step 1 Budget Check — System Validation; actor System (Auto); tenant-configurable: No; note: Checks available budget against GL code; blocks if exceeded.
Step 2 Line Manager Approval — Approval; actor Requestor's Line Manager; mode Sequential; SLA 24h; escalates to Department Head; bypass/condition: Amount ≤ INR 10,000 and vendor pre-approved; tenant-configurable: Yes; note: Bypass threshold is configurable.
Step 3 Finance Approval — Approval; actor Finance Controller; mode Sequential; SLA 48h; escalates to CFO; bypass/condition: Amount ≤ INR 50,000 and within budget; tenant-configurable: Yes; note: Conditional on DoA matrix thresholds.
Step 4 PR-to-PO Conversion — System Action; actor System / Buyer; bypass/condition: All approvals complete; tenant-configurable: No; note: Auto-converts to PO if template mapped; else Buyer manually creates PO.

## Purchase Requisition integrations

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
