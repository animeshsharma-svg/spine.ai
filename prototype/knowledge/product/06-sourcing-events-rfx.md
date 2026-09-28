# 06. Sourcing Events (RFX) (MOD-14) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Sourcing Events (RFX) module overview
Sourcing Events (RFX) (MOD-14) is a Sourcing module of Procol, in the "Sourcing" stage of the procurement lifecycle.
Description: Orchestration of multi-stage sourcing events (technical, RFQ, auction) as a single auditable project
Business purpose: Provide a unified sourcing-event layer that composes technical, RFQ, and auction stages over PR or standalone demand
Default state: Enabled
Plan availability: All Plans
Depends on modules: MOD-02 Purchase Requisition, MOD-03 RFQ, MOD-04 RFP / Technical, MOD-05 Reverse Auction
Key integrations: Currency Rate API, Email/WhatsApp/SMS
Registry status: GA
Roadmap notes: NEW (provisional) - MOD-03/04/05 read as stages within this; confirm structure
Features: 30 (28 GA, 2 Beta). Test cases: test-cases/product-06-sourcing-events-rfx.md, group PRD-RFX.

## Sourcing Events (RFX) features

30 features in 2 categories: Core, Optional.

### FEAT-RFX-001 — RFX Project Creation
RFX Project Creation is a Core feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want to create a sourcing project composed of technical, RFQ, and auction stages, so that I can run structured multi-stage sourcing.
Business use case: Buyer launches a sourcing project composing technical, RFQ, and auction stages over selected demand.
Why it exists: Unified, auditable multi-stage sourcing.
Edge cases / notes: Orchestrates MOD-03/04/05 stages.
Test cases: PRD-RFX-001 … PRD-RFX-002 (2).

### FEAT-RFX-002 — Two Entry Routes
Two Entry Routes is a Core feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want to start an event from PR lines or as a standalone RFX, so that I can source from ERP demand or ad-hoc needs.
Business use case: The event is started from open PR lines (single or across PRs) or as a standalone RFX.
Why it exists: Flexible event origination.
Test cases: PRD-RFX-003 … PRD-RFX-004 (2).

### FEAT-RFX-003 — Cart View (PR Route)
Cart View (PR Route) is a Core feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want a cart of selected PR lines with delete and quantity-reduce, so that I can finalize scope before configuring the event.
Business use case: Coming from PRs; the buyer reviews a cart of selected lines (delete/reduce qty) before configuring.
Why it exists: Scope review prevents over-sourcing.
Test cases: PRD-RFX-005 … PRD-RFX-006 (2).

### FEAT-RFX-004 — Stage Selection and Configuration
Stage Selection and Configuration is a Core feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want to choose and configure each stage, so that I can right-size the event to the sourcing need.
Business use case: On the configuration screen; the buyer chooses and sets up each stage of the event.
Why it exists: Right-sized events per category.
Test cases: PRD-RFX-007 … PRD-RFX-008 (2).

### FEAT-RFX-005 — Parallel/Sequential Flow and Scheduling
Parallel/Sequential Flow and Scheduling is a Core feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want to run stages in parallel or sequence and schedule each, so that I can balance speed against gated evaluation.
Business use case: Buyer schedules stages and runs technical and RFQ in parallel or sequentially (technical-gated).
Why it exists: Flexible event timing and gating.
Test cases: PRD-RFX-009 … PRD-RFX-010 (2).

### FEAT-RFX-006 — Terms and Conditions
Terms and Conditions is a Core feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want to attach default or custom T&Cs at project or stage level, so that consistent terms apply to every event.
Business use case: Buyer attaches default or custom T&Cs at project or stage level before floating.
Why it exists: Consistent, enforceable terms.
Edge cases / notes: Defaults set in MOD-10.
Test cases: PRD-RFX-011 … PRD-RFX-012 (2).

### FEAT-RFX-007 — Vendor Invitation and Auto-Suggestion
Vendor Invitation and Auto-Suggestion is a Core feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want vendors auto-suggested by category from PO, AVL, and Clara sources, so that I can assemble the bidder list quickly.
Business use case: At vendor selection; Procol suggests vendors from PO history/AVL/recommendations/Clara and the buyer adjusts the list.
Why it exists: Faster, data-driven vendor selection.
Edge cases / notes: Pulls from MOD-01 AVLs.
Test cases: PRD-RFX-013 … PRD-RFX-014 (2).

### FEAT-RFX-008 — Clara AI Sourcing Assistant
Clara AI Sourcing Assistant is a Optional feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: Enterprise. Status: Beta.
User story: As a buyer, I want Clara to assist me through the sourcing event, so that I can work faster with AI support.
Business use case: Throughout the event; Clara assists the buyer with vendor suggestions and recommendations.
Why it exists: AI augmentation of sourcing.
Edge cases / notes: Cross-cutting AI capability; parked: own module?
Test cases: PRD-RFX-042 … PRD-RFX-044 (3).

### FEAT-RFX-009 — Participation Consent and Decline Capture
Participation Consent and Decline Capture is a Core feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want vendors to record participate or decline with a reason, so that I can see engagement and why suppliers opt out.
Business use case: Invited vendors record participate or decline; declines capture a configurable reason.
Why it exists: Visibility into vendor engagement.
Test cases: PRD-RFX-015 … PRD-RFX-016 (2).

### FEAT-RFX-010 — Multi-Channel Invitation and Reminders
Multi-Channel Invitation and Reminders is a Core feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want vendors notified across channels with automated reminders, so that I can maximize participation.
Business use case: On publish and during the window; vendors are notified and reminded across email/WhatsApp/SMS at set intervals.
Why it exists: Timely nudges improve response rates.
Edge cases / notes: Intervals configurable.
Test cases: PRD-RFX-017 … PRD-RFX-019 (3).

### FEAT-RFX-011 — Embedded Communication Module
Embedded Communication Module is a Core feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want an in-event query system with type-based routing and confidentiality, so that clarifications stay in context and auditable.
Business use case: Within the event; vendors, buyers, and evaluators exchange general/commercial/technical queries under confidentiality rules.
Why it exists: Auditable, segregated Q&A.
Edge cases / notes: Commercial queries hidden from evaluators/requisitioners.
Test cases: PRD-RFX-020 … PRD-RFX-022 (3).

### FEAT-RFX-012 — Multi-Currency Bidding
Multi-Currency Bidding is a Core feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want vendors to bid in their own currency with rates locked at publish, so that I can compare bids fairly.
Business use case: For multi-country sourcing; vendors bid in their own currency with rates locked at publish for fair comparison.
Why it exists: Apples-to-apples multi-currency comparison.
Edge cases / notes: Rate API (MOD-11).
Test cases: PRD-RFX-023 … PRD-RFX-025 (3).

### FEAT-RFX-013 — Master QCS (MQCS)
Master QCS (MQCS) is a Core feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want a cross-stage Master QCS showing each vendor's bid evolution and benchmarks, so that I can make defensible award decisions.
Business use case: During evaluation and award; the buyer and approvers review the cross-stage Master QCS (scores, bid evolution, benchmarks).
Why it exists: Holistic, defensible award decisions.
Edge cases / notes: Flagship cross-stage capability.
Test cases: PRD-RFX-026 … PRD-RFX-028 (3).

### FEAT-RFX-014 — Benchmarking
Benchmarking is a Optional feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want bids compared to historical, budgeted, and custom benchmarks, so that I can judge competitiveness objectively.
Business use case: During evaluation; bids are compared against LPP, budget, and custom benchmarks.
Why it exists: Objective price assessment.
Test cases: PRD-RFX-045 … PRD-RFX-047 (3).

### FEAT-RFX-015 — Project Overview Page
Project Overview Page is a Core feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want a single overview of line items, stages, vendors, T&Cs, and timelines, so that I can grasp the event at a glance.
Business use case: Stakeholders open the project overview to see lines, stages, vendors, participation, T&Cs, and timelines at a glance.
Why it exists: Operational visibility.
Test cases: PRD-RFX-029 … PRD-RFX-030 (2).

### FEAT-RFX-016 — Per-Stage Activity Log
Per-Stage Activity Log is a Core feature of Sourcing Events (RFX) (MOD-14). Persona: Auditor. Plan: All Plans. Status: GA.
User story: As an auditor, I want every stage to log all stakeholder activity, so that I can trace exactly what happened.
Business use case: Auditors and buyers review the per-stage activity log of all stakeholder actions.
Why it exists: Auditability per stage.
Edge cases / notes: Feeds audit trail.
Test cases: PRD-RFX-031 … PRD-RFX-033 (3).

### FEAT-RFX-017 — Award via Master QCS
Award via Master QCS is a Core feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want to award directly from the Master QCS by line item and vendor, so that I can finalize allocations with full context.
Business use case: At award; the buyer selects line-item by vendor and allocates quantities from the Master QCS.
Why it exists: Single award surface with full context.
Test cases: PRD-RFX-034 … PRD-RFX-035 (2).

### FEAT-RFX-018 — Award Decision Metrics & Allocation
Award Decision Metrics & Allocation is a Core feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want total, L1, and non-L1 values with allocation visibility, so that I can see the value and split before committing.
Business use case: While awarding; the buyer sees total/L1/non-L1 values and pending and location-wise allocation before committing.
Why it exists: Informed award decisions.
Test cases: PRD-RFX-036 … PRD-RFX-037 (2).

### FEAT-RFX-019 — Over-Ordering Config
Over-Ordering Config is a Optional feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want to award beyond the requested quantity within tolerance, so that I can handle batch and minimum-order-quantity buys.
Business use case: For batch or MOQ buys; the buyer awards above the requested quantity within a configured tolerance.
Why it exists: Flexibility for batch/MOQ buys.
Test cases: PRD-RFX-048 … PRD-RFX-050 (3).

### FEAT-RFX-020 — Share-of-Business / Award via Sheet
Share-of-Business / Award via Sheet is a Optional feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want to split award across vendors as share-of-business, so that I can diversify risk and share capacity.
Business use case: To diversify supply; the buyer splits the award across vendors, including via an uploaded allocation sheet.
Why it exists: Risk diversification and capacity sharing.
Test cases: PRD-RFX-051 … PRD-RFX-053 (3).

### FEAT-RFX-021 — Smart Awarding
Smart Awarding is a Optional feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: Enterprise. Status: Beta.
User story: As a buyer, I want an optimized award recommendation, so that I can reach the best split faster.
Business use case: For complex multi-vendor awards; the system recommends an optimized split.
Why it exists: Faster, optimized awards.
Edge cases / notes: Likely AI-assisted (Clara family).
Test cases: PRD-RFX-054 … PRD-RFX-056 (3).

### FEAT-RFX-022 — BOQ Events
BOQ Events is a Optional feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want BOQ events with thousands of lines, rate-only items, and pre-bid updates, so that I can run large infra and construction tenders.
Business use case: Infra/construction sourcing with very large BOQs, rate-only lines, protected BOQ Excel, and a pre-bid BOQ meeting.
Why it exists: Supports high-line-count, BOQ-driven categories.
Test cases: PRD-RFX-057 … PRD-RFX-059 (3).

### FEAT-RFX-023 — Service & Hierarchical Events
Service & Hierarchical Events is a Optional feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want ERFx for services with hierarchical scope, so that I can source services as robustly as materials.
Business use case: Services sourcing run as an ERFx with hierarchical scope and service-PR-to-event flow.
Why it exists: Service procurement parity with materials.
Test cases: PRD-RFX-060 … PRD-RFX-062 (3).

### FEAT-RFX-024 — Recurring Events
Recurring Events is a Optional feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want to schedule recurring events, so that I can automate periodic sourcing.
Business use case: For repeating spend; the buyer schedules recurring events.
Why it exists: Reduces repetitive setup.
Test cases: PRD-RFX-063 … PRD-RFX-065 (3).

### FEAT-RFX-025 — Project Clone / Recreate
Project Clone / Recreate is a Core feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want to clone an existing project, so that I can reuse a prior setup and create events faster.
Business use case: The buyer clones a prior project to set up a similar event quickly.
Why it exists: Faster event creation.
Test cases: PRD-RFX-038 … PRD-RFX-039 (2).

### FEAT-RFX-026 — Open / Public Tender
Open / Public Tender is a Optional feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want to publish tenders visible without an invite, so that I can open sourcing to broad participation.
Business use case: For open tenders; the event is published to suppliers without an explicit invite.
Why it exists: Wider competition.
Test cases: PRD-RFX-066 … PRD-RFX-068 (3).

### FEAT-RFX-027 — Lock Vendor Addition & Per-Event Masking
Lock Vendor Addition & Per-Event Masking is a Core feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want to lock the bidder set and mask vendors per event, so that I can protect event integrity and anonymity.
Business use case: After creation; the buyer locks the bidder set and masks vendor identities for that event.
Why it exists: Event-level integrity and confidentiality.
Test cases: PRD-RFX-040 … PRD-RFX-041 (2).

### FEAT-RFX-028 — Mobile Vendor Bidding
Mobile Vendor Bidding is a Optional feature of Sourcing Events (RFX) (MOD-14). Persona: Vendor. Plan: Enterprise. Status: GA.
User story: As a vendor, I want to bid from the mobile app, so that I can participate on the go.
Business use case: When away from a desk; vendors participate and bid from the mobile app.
Why it exists: Higher participation in mobile-first markets.
Test cases: PRD-RFX-069 … PRD-RFX-071 (3).

### FEAT-RFX-029 — Multiple Scope of Work (SoW)
Multiple Scope of Work (SoW) is a Optional feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want multiple scopes of work per vendor, so that I can handle complex, differentiated service scopes in one event.
Business use case: For differentiated service scopes; the buyer attaches multiple scopes of work per vendor.
Why it exists: Handles complex service scopes.
Test cases: PRD-RFX-072 … PRD-RFX-074 (3).

### FEAT-RFX-030 — Project / WBS / Cost-Centre Tagging
Project / WBS / Cost-Centre Tagging is a Optional feature of Sourcing Events (RFX) (MOD-14). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want to tag lines with project, WBS, and cost centre, so that costs map to the right financial objects.
Business use case: For project or capex spend; lines are tagged with project, WBS, control number, and cost centre.
Why it exists: Financial traceability.
Test cases: PRD-RFX-075 … PRD-RFX-077 (3).
