# 11. Contract Module (MOD-22) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Contract Module module overview
Contract Module (MOD-22) is a Procure-to-Pay (P2P) module of Procol, in the "Award, PO & contract" stage of the procurement lifecycle.
Description: Contract repository and lifecycle for executed agreements.
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP
Registry status: GA
Roadmap notes: Imported from downstream P2P feature list (PM).
Features: 9 (4 GA (Already in Procol), 5 Roadmap (Suggested — not in product yet)). Test cases: test-cases/product-11-contract-module.md, group PRD-CON.

## Contract Module features

9 features in 2 categories: Core, Compliance.

### FEAT-CON-001 — Contract Repository
Contract Repository is a Core feature of Contract Module (MOD-22). Persona: Category Manager. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a category manager, I want a central contract repository, so that all vendor agreements are stored and searchable in one place.
Business use case: All executed contracts are stored with metadata (vendor, category, value, validity) for retrieval and reference.
Why it exists: Removes reliance on scattered local files for contract records.
Edge cases / notes: Should support full-text search across contract documents.
Test cases: PRD-CON-001 … PRD-CON-004 (4).

### FEAT-CON-002 — Contract Expiry Notification
Contract Expiry Notification is a Core feature of Contract Module (MOD-22). Persona: Category Manager. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a category manager, I want to be notified ahead of contract expiry, so that renewal or re-sourcing happens with lead time.
Business use case: Automated alerts fire at configurable intervals (e.g., 90/60/30 days) before a contract's end date.
Why it exists: Prevents contracts from lapsing unnoticed and causing supply disruption.
Edge cases / notes: Notification recipients and lead times are configurable per contract type.
Test cases: PRD-CON-005 … PRD-CON-008 (4).

### FEAT-CON-003 — Contract Amendment
Contract Amendment is a Core feature of Contract Module (MOD-22). Persona: Category Manager. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a category manager, I want to amend a live contract through a controlled flow, so that term or price changes are tracked with version history.
Business use case: Changes to an active contract are recorded as a new version with the amendment reason logged.
Why it exists: Auditability of contractual changes over the contract's life.
Edge cases / notes: Original terms remain visible alongside each amendment.
Test cases: PRD-CON-009 … PRD-CON-012 (4).

### FEAT-CON-004 — Contract Consumption Tracking
Contract Consumption Tracking is a Core feature of Contract Module (MOD-22). Persona: Category Manager. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a category manager, I want to track how much value/quantity has been drawn against a contract, so that I know remaining commitment or entitlement.
Business use case: POs issued against a rate/blanket contract reduce the contract's tracked balance.
Why it exists: Prevents over-commitment beyond negotiated contract terms.
Edge cases / notes: Ties directly into blanket PO consumption tracking.
Test cases: PRD-CON-013 … PRD-CON-016 (4).

### FEAT-CON-005 — Contract Clause Library & Redlining
Contract Clause Library & Redlining is a Core feature of Contract Module (MOD-22). Persona: Category Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a category manager, I want a clause library with redlining support, so that contract drafting and negotiation happen faster and more consistently.
Business use case: Standard clauses are assembled into a draft contract; negotiation changes are tracked as redlines.
Why it exists: Speeds up contract drafting and keeps negotiation history auditable.
Edge cases / notes: Should integrate with e-signature tools like DocuSign for execution.
Test cases: PRD-CON-017 … PRD-CON-020 (4).

### FEAT-CON-006 — Contract Renewal Auto-Workflow
Contract Renewal Auto-Workflow is a Core feature of Contract Module (MOD-22). Persona: Category Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a category manager, I want a renewal workflow to auto-trigger ahead of contract expiry, so that renewal decisions aren't made under time pressure.
Business use case: Approaching expiry, a renewal task is auto-created for the category manager with the current contract terms pre-loaded.
Why it exists: Turns a manual renewal reminder into a structured decision workflow.
Edge cases / notes: Should support auto-renewal vs. manual-decision contract types differently.
Test cases: PRD-CON-021 … PRD-CON-024 (4).

### FEAT-CON-007 — Contract-to-PO Price Snapshot Enforcement
Contract-to-PO Price Snapshot Enforcement is a Core feature of Contract Module (MOD-22). Persona: Buyer. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a buyer, I want contract-fetched pricing on a PO to be locked as a snapshot, not a live link, so that later contract changes don't silently alter an issued PO.
Business use case: Price/vendor fields pulled from a contract at PO creation are stored as a point-in-time snapshot.
Why it exists: Preserves what was actually approved at PO creation; corrections go through amendment, not silent update.
Edge cases / notes: This mirrors the same read-only-after-commitment principle used for PO-invoice links.
Test cases: PRD-CON-025 … PRD-CON-027 (3).

### FEAT-CON-008 — Contract Compliance Tracking
Contract Compliance Tracking is a Compliance feature of Contract Module (MOD-22). Persona: Category Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a category manager, I want to track vendor compliance against contract SLAs, so that non-performance is visible before renewal decisions.
Business use case: Delivery, quality, and pricing performance are tracked against the contracted SLA over the contract's life.
Why it exists: Turns contract terms into an actively monitored commitment, not just a static document.
Edge cases / notes: Should feed into the vendor scorecard alongside QC and delivery data.
Test cases: PRD-CON-028 … PRD-CON-031 (4).

### FEAT-CON-009 — Multi-Entity Contract Applicability
Multi-Entity Contract Applicability is a Core feature of Contract Module (MOD-22). Persona: Category Manager. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a category manager, I want a contract to be applicable across multiple entities/plants where relevant, so that group-negotiated rates aren't re-entered per entity.
Business use case: One negotiated contract can be flagged as applicable to multiple legal entities or plants, each drawing from the same terms.
Why it exists: Avoids duplicate contract records for group-wide agreements.
Edge cases / notes: Consumption tracking must still be able to break down usage by entity.
Test cases: PRD-CON-032 … PRD-CON-035 (4).
