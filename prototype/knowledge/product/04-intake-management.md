# 04. Intake Management (MOD-13) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Intake Management module overview
Intake Management (MOD-13) is a Procurement module of Procol, in the "Demand" stage of the procurement lifecycle.
Description: In-platform demand intake and request orchestration when no ERP PR feed exists
Business purpose: Capture and route demand (PR, approvals, material/vendor requests) via configurable templates and Delegation of Authority
Default state: Optional
Plan availability: Growth, Enterprise
Depends on modules: MOD-09 Approval Engine, MOD-12 Master Data Management
Key integrations: ERP Budgeting (Fund Center/WBS)
Registry status: GA
Roadmap notes: NEW (provisional) - non-integrated counterpart to MOD-02
Features: 12 (12 GA). Test cases: test-cases/product-04-intake-management.md, group PRD-INTK.

## Intake Management features

12 features in 2 categories: Core, Optional.

### FEAT-INTK-001 — Intake Demand Generation
Intake Demand Generation is a Core feature of Intake Management (MOD-13). Persona: Requester / End User. Plan: Growth, Enterprise. Status: GA.
User story: As a requester, I want to raise demand via intake when there's no ERP feed, so that I can initiate a purchase need directly.
Business use case: Non-integrated tenants; requesters raise demand directly in Procol when there is no ERP PR feed.
Why it exists: Captures demand for non-integrated tenants.
Edge cases / notes: Non-integrated counterpart to MOD-02.
Test cases: PRD-INTK-001 … PRD-INTK-003 (3).

### FEAT-INTK-002 — Configurable Intake Templates
Configurable Intake Templates is a Core feature of Intake Management (MOD-13). Persona: Tenant Admin. Plan: Growth, Enterprise. Status: GA.
User story: As a tenant admin, I want template types for PRs, standalone approvals, and PO-amendment requests, so that we standardize how every request is raised.
Business use case: Admins define intake templates for PRs, standalone approvals, and PO-amendment requests.
Why it exists: One intake layer for many request types.
Edge cases / notes: PO-amendment template implies a PO area (parked).
Test cases: PRD-INTK-004 … PRD-INTK-006 (3).

### FEAT-INTK-003 — Configurable Request Form
Configurable Request Form is a Core feature of Intake Management (MOD-13). Persona: Tenant Admin. Plan: Growth, Enterprise. Status: GA.
User story: As a tenant admin, I want intake forms configurable per business, so that we capture exactly what each request needs without code.
Business use case: Intake forms are configured per business to capture exactly what each request type needs.
Why it exists: Tailored capture without code.
Test cases: PRD-INTK-007 … PRD-INTK-009 (3).

### FEAT-INTK-004 — DoA / DoFP Routing
DoA / DoFP Routing is a Core feature of Intake Management (MOD-13). Persona: Approver. Plan: Growth, Enterprise. Status: GA.
User story: As an approver, I want intake routed through the Delegation of Authority, so that requests are approved by the right authority.
Business use case: Submitted intakes route through the Delegation of Authority for approval.
Why it exists: Enforces spend governance at intake.
Edge cases / notes: Cross-links MOD-09 DoA matrix.
Test cases: PRD-INTK-010 … PRD-INTK-012 (3).

### FEAT-INTK-005 — Approved-Intake Outcomes
Approved-Intake Outcomes is a Core feature of Intake Management (MOD-13). Persona: Requester / End User. Plan: Growth, Enterprise. Status: GA.
User story: As a requester, I want an approved intake to become a PR, ticket, material request, or vendor request, so that demand flows to the right downstream process.
Business use case: On approval; an intake becomes a PR, ticket, material request, or vendor-onboarding request as appropriate.
Why it exists: Single intake feeds multiple workflows.
Edge cases / notes: Cross-links MOD-02 / MOD-12 / MOD-01.
Test cases: PRD-INTK-013 … PRD-INTK-015 (3).

### FEAT-INTK-006 — multi-Currency Intake
multi-Currency Intake is a Core feature of Intake Management (MOD-13). Persona: Requester / End User. Plan: Growth, Enterprise. Status: GA.
User story: As a requester, I want a unique intake ID that tracks downstream status, so that I can trace my request from demand to fulfillment.
Business use case: Each intake's unique ID tracks downstream status from PR through sourcing to PO/fulfilment.
Why it exists: Traceability from demand to fulfillment.
Test cases: PRD-INTK-016 … PRD-INTK-018 (3).

### FEAT-INTK-007 — Withdraw Intake Request
Withdraw Intake Request is a Core feature of Intake Management (MOD-13). Persona: Requester / End User. Plan: Growth, Enterprise. Status: GA.
User story: As a requester, I want to withdraw an intake while approvals are pending, so that I can cancel demand I no longer need.
Business use case: Requesters cancel an intake mid-approval when the need disappears.
Why it exists: Avoids processing stale demand.
Test cases: PRD-INTK-019 … PRD-INTK-021 (3).

### FEAT-INTK-008 — Intake Dashboard (Search/Filter)
Intake Dashboard (Search/Filter) is a Core feature of Intake Management (MOD-13). Persona: Requester / End User. Plan: Growth, Enterprise. Status: GA.
User story: As a requester, I want to search and filter my intakes by category with status visibility, so that I can manage my requests myself.
Business use case: Requesters self-serve via search/filter on the intake dashboard with status visibility.
Why it exists: Self-serve request management.
Test cases: PRD-INTK-022 … PRD-INTK-024 (3).

### FEAT-INTK-009 — Ticketing Outcome
Ticketing Outcome is a Optional feature of Intake Management (MOD-13). Persona: Requester / End User. Plan: Growth, Enterprise. Status: GA.
User story: As a requester, I want standard-approval intakes to generate an id, so that non-procurement approvals are tracked properly.
Business use case: Standard-approval intakes generate a ticket on a ticketing dashboard for non-procurement approvals.
Why it exists: Handles general approvals outside procurement.
Edge cases / notes: Ticketing is a provisional sub-capability.
Test cases: PRD-INTK-025 … PRD-INTK-027 (3).

### FEAT-INTK-010 — ERP Budget Fetch at Intake
ERP Budget Fetch at Intake is a Optional feature of Intake Management (MOD-13). Persona: Requester / End User. Plan: Enterprise. Status: GA.
User story: As a requester, I want available budget pulled from the ERP at intake and shown to approvers, so that demand is raised against real budget.
Business use case: At intake; available budget is pulled from the ERP fund center/WBS and shown to approvers.
Why it exists: Budget-aware intake prevents overspend.
Edge cases / notes: Cross-links MOD-11; mirrors WF-PR-001 budget check.
Test cases: PRD-INTK-028 … PRD-INTK-030 (3).

### FEAT-INTK-011 — Multi-Currency Intake
Multi-Currency Intake is a Optional feature of Intake Management (MOD-13). Persona: Requester / End User. Plan: Enterprise. Status: GA.
User story: As a requester, I want intake templates to support multiple currencies, so that I can raise cross-border demand.
Business use case: Cross-border intakes capture demand in multiple currencies.
Why it exists: Global intake support.
Test cases: PRD-INTK-031 … PRD-INTK-033 (3).

### FEAT-INTK-012 — Intake Estimate-to-Budget Mapping
Intake Estimate-to-Budget Mapping is a Optional feature of Intake Management (MOD-13). Persona: Approver. Plan: Enterprise. Status: GA.
User story: As an approver, I want the intake estimate mapped to the PR budget, so that I can see estimate against budget when approving.
Business use case: The intake estimate is mapped to the PR budget so approvers compare estimate against budget.
Why it exists: Budget-aware demand.
Test cases: PRD-INTK-034 … PRD-INTK-036 (3).
