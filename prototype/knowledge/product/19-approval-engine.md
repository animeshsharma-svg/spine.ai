# 19. Approval Engine (MOD-09) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Approval Engine module overview
Approval Engine (MOD-09) is a Platform module of Procol, in the "Governance" stage of the procurement lifecycle.
Description: Configurable multi-level approval workflows across all modules
Business purpose: Centralise approval logic to enforce spend controls, delegation of authority, and escalation policies consistently
Default state: Enabled
Plan availability: All Plans
Key integrations: Email, SSO
Registry status: GA
Features: 18 (18 GA). Test cases: test-cases/product-19-approval-engine.md, group PRD-AE.

## Approval Engine features

18 features in 2 categories: Core, Optional.

### FEAT-AE-001 — Modular Approval Setup
Modular Approval Setup is a Core feature of Approval Engine (MOD-09). Persona: Tenant Admin. Plan: All Plans. Status: GA.
User story: As a tenant admin, I want approvals attachable to any entity (events, onboarding, PO, payments, LC, and more), so that every critical action is governed.
Business use case: Approvals are attached to many entities (events, onboarding, counters, PO release, payments, LC, etc.) per the customer's governance.
Why it exists: One engine governs approvals platform-wide.
Edge cases / notes: Shared across MOD-01/13/14/15/07.
Configs: CONF-AE-001 `approval.doa.currency` (default INR; allowed INR | USD | EUR | GBP | AED | SGD)
Test cases: PRD-AE-001 … PRD-AE-008 (8).

### FEAT-AE-002 — Condition-Based Triggering
Condition-Based Triggering is a Core feature of Approval Engine (MOD-09). Persona: Tenant Admin. Plan: All Plans. Status: GA.
User story: As a tenant admin, I want approvals triggered by conditions like value or category, so that the right approvals fire for the right cases.
Business use case: Approval chains fire based on conditions such as value, currency, category, or site.
Why it exists: Targeted governance.
Configs: CONF-AE-002 `approval.escalation.timeout_hours` (default 48; allowed 1 – 720)
Test cases: PRD-AE-009 … PRD-AE-015 (7).

### FEAT-AE-003 — Person or Role Assignment
Person or Role Assignment is a Core feature of Approval Engine (MOD-09). Persona: Tenant Admin. Plan: All Plans. Status: GA.
User story: As a tenant admin, I want steps assigned to a person or a role, so that approvals stay resilient to staffing changes.
Business use case: Each step targets a named person or a role, set during configuration.
Why it exists: Resilient to staffing changes.
Test cases: PRD-AE-016 … PRD-AE-017 (2).

### FEAT-AE-004 — Series & Parallel Routing
Series & Parallel Routing is a Core feature of Approval Engine (MOD-09). Persona: Tenant Admin. Plan: All Plans. Status: GA.
User story: As a tenant admin, I want sequential and parallel routing, so that I can model our real approval structures.
Business use case: Chains model real structures using sequential and parallel routing.
Why it exists: Faster, accurate routing.
Test cases: PRD-AE-018 … PRD-AE-019 (2).

### FEAT-AE-005 — Dynamic Approvals
Dynamic Approvals is a Core feature of Approval Engine (MOD-09). Persona: Approver. Plan: All Plans. Status: GA.
User story: As an approver, I want to add a step or set the next approver, so that I can handle exceptions mid-flow.
Business use case: Mid-flow; an approver inserts a step or sets the next approver to handle an exception.
Why it exists: Adaptive approvals.
Test cases: PRD-AE-020 … PRD-AE-021 (2).

### FEAT-AE-006 — Initiator-Added Approvers
Initiator-Added Approvers is a Optional feature of Approval Engine (MOD-09). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As an initiator, I want to add approvers ad hoc, so that I can include needed reviewers.
Business use case: An initiator adds extra approvers ad hoc when a request needs additional review.
Why it exists: Flexibility with governance.
Test cases: PRD-AE-039 … PRD-AE-040 (2).

### FEAT-AE-007 — Delegation
Delegation is a Core feature of Approval Engine (MOD-09). Persona: Approver. Plan: All Plans. Status: GA.
User story: As an approver, I want to delegate to a subordinate for a period, so that approvals don't stall while I'm away.
Business use case: An approver on leave delegates to a subordinate for a set period.
Why it exists: No approval bottlenecks.
Test cases: PRD-AE-022 … PRD-AE-023 (2).

### FEAT-AE-008 — Version Control on Proposals
Version Control on Proposals is a Core feature of Approval Engine (MOD-09). Persona: Approver. Plan: All Plans. Status: GA.
User story: As an approver, I want proposal versions kept across rejections, so that I can see what changed.
Business use case: Across rejections and amendments; proposal versions are retained for comparison.
Why it exists: Auditable change history.
Test cases: PRD-AE-024 … PRD-AE-025 (2).

### FEAT-AE-009 — Approver Actions
Approver Actions is a Core feature of Approval Engine (MOD-09). Persona: Approver. Plan: All Plans. Status: GA.
User story: As an approver, I want to approve, reject, comment, or withdraw, so that my decisions are clear and recorded.
Business use case: At each step; the approver approves, rejects, comments, or withdraws.
Why it exists: Clear decision trail.
Test cases: PRD-AE-026 … PRD-AE-027 (2).

### FEAT-AE-010 — Approvals Dashboard
Approvals Dashboard is a Core feature of Approval Engine (MOD-09). Persona: Approver. Plan: All Plans. Status: GA.
User story: As an approver, I want a dashboard with mine, upcoming, completed, and rejected buckets and filters, so that I can manage my queue efficiently.
Business use case: Approvers work their queue via the dashboard's mine/upcoming/completed/rejected buckets and filters.
Why it exists: Efficient approver workflow.
Test cases: PRD-AE-028 … PRD-AE-029 (2).

### FEAT-AE-011 — TAT & Step-Time Enforcement
TAT & Step-Time Enforcement is a Core feature of Approval Engine (MOD-09). Persona: Procurement Manager. Plan: All Plans. Status: GA.
User story: As a procurement manager, I want TAT shown and step durations enforced with overdue flags, so that I can surface and reduce delays.
Business use case: TAT is shown and per-step durations are enforced, flagging overdue steps to managers.
Why it exists: Accountability on cycle time.
Test cases: PRD-AE-030 … PRD-AE-031 (2).

### FEAT-AE-012 — Escalation Matrix
Escalation Matrix is a Core feature of Approval Engine (MOD-09). Persona: Tenant Admin. Plan: Enterprise. Status: GA.
User story: As a tenant admin, I want stalled approvals auto-escalated to the next authority, so that non-response doesn't bottleneck the process.
Business use case: When an approver (or vendor) does not act in time; the request auto-escalates to the next authority.
Why it exists: Prevents bottlenecks; top recurring squad ask.
Test cases: PRD-AE-032 … PRD-AE-034 (3).

### FEAT-AE-013 — Dimension-Based Routing
Dimension-Based Routing is a Optional feature of Approval Engine (MOD-09). Persona: Tenant Admin. Plan: Enterprise. Status: GA.
User story: As a tenant admin, I want approvals routed by department, state, or category, so that authority mapping matches our org.
Business use case: Approvals route by department, state, or category to match the org's authority structure.
Why it exists: Accurate authority mapping.
Test cases: PRD-AE-041 … PRD-AE-043 (3).

### FEAT-AE-014 — Mobile Approvals
Mobile Approvals is a Optional feature of Approval Engine (MOD-09). Persona: Approver. Plan: Growth, Enterprise. Status: GA.
User story: As an approver, I want to approve from mobile, so that I can act on the go.
Business use case: Approvers act on requests from the mobile app.
Why it exists: Faster turnaround.
Test cases: PRD-AE-044 … PRD-AE-046 (3).

### FEAT-AE-015 — Techno-Commercial Peer Review
Techno-Commercial Peer Review is a Optional feature of Approval Engine (MOD-09). Persona: Approver. Plan: Enterprise. Status: GA.
User story: As an approver, I want a peer-review step combining technical and commercial input, so that awards get cross-functional validation.
Business use case: A techno-commercial peer-review step validates an award across functions before approval.
Why it exists: Higher-quality decisions.
Test cases: PRD-AE-047 … PRD-AE-049 (3).

### FEAT-AE-016 — Reject & Send-Back Logging
Reject & Send-Back Logging is a Core feature of Approval Engine (MOD-09). Persona: Approver. Plan: All Plans. Status: GA.
User story: As an approver, I want rejects and send-backs logged with reasons, so that returns are fully traceable.
Business use case: Rejects and send-backs are logged with reasons and notify stakeholders.
Why it exists: Auditability and clarity.
Test cases: PRD-AE-035 … PRD-AE-036 (2).

### FEAT-AE-017 — Approvals on Master-Data Creation
Approvals on Master-Data Creation is a Optional feature of Approval Engine (MOD-09). Persona: Tenant Admin. Plan: Enterprise. Status: GA.
User story: As an admin, I want user, item, and product creation routed through approval, so that master-data changes are governed.
Business use case: Creation of users, items, and products is routed through approval to govern master data.
Why it exists: Master-data integrity.
Edge cases / notes: Cross-links MOD-12.
Test cases: PRD-AE-050 … PRD-AE-052 (3).

### FEAT-AE-018 — Vendor Lifecycle Approval Hooks
Vendor Lifecycle Approval Hooks is a Core feature of Approval Engine (MOD-09). Persona: Approver. Plan: All Plans. Status: GA.
User story: As an approver, I want approval hooks across the vendor lifecycle, so that vendor actions stay consistently governed.
Business use case: Vendor lifecycle actions (onboarding/amendment/blocking/extension) invoke approval hooks.
Why it exists: Consistent vendor governance.
Edge cases / notes: Realized in MOD-01.
Test cases: PRD-AE-037 … PRD-AE-038 (2).

## Approval Engine configuration

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

## Approval Engine configuration dependencies

### DEP-006 — Escalation Timeout (Hours) depends on DoA Threshold Currency
Configuration dependency (Conditional): CONF-AE-002 "Escalation Timeout (Hours)" (`approval.escalation.timeout_hours`) depends on CONF-AE-001 "DoA Threshold Currency" (`approval.doa.currency`).
Condition: Only matters when DoA matrix thresholds trigger escalation
Impact if missing or misconfigured: If DoA currency is misconfigured, amount-based escalation rules may route to wrong approver level
Guidance: Always configure CONF-AE-001 (DoA Currency) before setting up escalation policies in CONF-AE-002
