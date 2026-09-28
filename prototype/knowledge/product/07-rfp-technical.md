# 07. RFP - Technical (MOD-04) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## RFP - Technical module overview
RFP / Technical (MOD-04) is a Sourcing module of Procol, in the "Sourcing" stage of the procurement lifecycle.
Description: Structured competitive Technical bidding
Business purpose: Drive competitive scopes/ technical specifications and vendor selection through a governed, auditable bidding process
Default state: Enabled
Plan availability: All Plans
Depends on modules: MOD-01 Vendor Management, MOD-02 Purchase Requisition
Key integrations: Email, SAP MM
Registry status: GA
Features: 15 (15 GA). Test cases: test-cases/product-07-rfp-technical.md, group PRD-RFP.

## RFP - Technical features

15 features in 2 categories: Core, Optional.

### FEAT-RFP-001 — Technical Evaluation Modes
Technical Evaluation Modes is a Core feature of RFP / Technical (MOD-04). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want evaluators to evaluate per line item or per vendor against a template, so that I can scope technical scrutiny appropriately.
Business use case: Buyer scopes the technical stage to evaluate per line item or per vendor against a template.
Why it exists: Right depth of technical evaluation.
Test cases: PRD-RFP-001 … PRD-RFP-002 (2).

### FEAT-RFP-002 — Configurable Questionnaire Templates
Configurable Questionnaire Templates is a Core feature of RFP / Technical (MOD-04). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want per-category technical questionnaire templates, so that I can standardize technical evaluation.
Business use case: Category-specific technical questionnaire templates load for the technical stage.
Why it exists: Consistent technical evaluation.
Test cases: PRD-RFP-003 … PRD-RFP-004 (2).

### FEAT-RFP-003 — Line-Item Templates from PR Specs
Line-Item Templates from PR Specs is a Core feature of RFP / Technical (MOD-04). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want question templates generated from PR specs, so that technical questions derive directly from the requirement.
Business use case: Line-item question templates are generated from the PR specifications.
Why it exists: Less manual question authoring.
Edge cases / notes: Specs from MOD-02.
Test cases: PRD-RFP-005 … PRD-RFP-006 (2).

### FEAT-RFP-004 — Configurable Question Response Types
Configurable Question Response Types is a Core feature of RFP / Technical (MOD-04). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want varied response types per question, so that I can capture the right kind of answer.
Business use case: Each technical question uses an appropriate response type (yes/no, dropdowns, text, file upload).
Why it exists: Flexible technical data capture.
Test cases: PRD-RFP-007 … PRD-RFP-008 (2).

### FEAT-RFP-005 — Buyer Add/Remove Questions
Buyer Add/Remove Questions is a Core feature of RFP / Technical (MOD-04). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want to add or remove questions, so that I can tailor the questionnaire to each event.
Business use case: Buyer tailors the questionnaire by adding or removing questions per event.
Why it exists: Event-specific technical asks.
Test cases: PRD-RFP-009 … PRD-RFP-010 (2).

### FEAT-RFP-006 — Evaluator Assignment and Groups
Evaluator Assignment and Groups is a Core feature of RFP / Technical (MOD-04). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want evaluators auto-fetched from the PR with reassignment and groups, so that the right experts evaluate.
Business use case: Evaluators default to the PR requisitioner; the buyer reassigns or assigns groups, at lot or vendor level.
Why it exists: Accurate, accountable evaluation.
Test cases: PRD-RFP-011 … PRD-RFP-012 (2).

### FEAT-RFP-007 — Weighted Technical Scoring
Weighted Technical Scoring is a Core feature of RFP / Technical (MOD-04). Persona: Technical Evaluator. Plan: All Plans. Status: GA.
User story: As an evaluator, I want weighted questions rolled into one technical score, so that ranking is objective and comparable.
Business use case: Evaluators score weighted questions, producing one comparable technical score per vendor.
Why it exists: Defensible technical ranking.
Test cases: PRD-RFP-013 … PRD-RFP-014 (2).

### FEAT-RFP-008 — Configurable Rating Scale
Configurable Rating Scale is a Core feature of RFP / Technical (MOD-04). Persona: Tenant Admin. Plan: All Plans. Status: GA.
User story: As an admin, I want the rating scale configurable (T1/T2/T3, preferences, or numeric), so that we use our preferred convention.
Business use case: The org configures the rating scale (T1/T2/T3/TNA, preferences, or numeric) at setup.
Why it exists: Familiar scoring conventions.
Test cases: PRD-RFP-015 … PRD-RFP-016 (2).

### FEAT-RFP-009 — Vendor Technical Response
Vendor Technical Response is a Core feature of RFP / Technical (MOD-04). Persona: Vendor. Plan: All Plans. Status: GA.
User story: As a vendor, I want to respond manually, by bulk Excel, or quick-fill with revisions, so that I can answer technical asks efficiently.
Business use case: Vendors submit technical responses manually, via bulk Excel, or quick-fill, revising during the window.
Why it exists: Lower-friction vendor responses.
Test cases: PRD-RFP-017 … PRD-RFP-018 (2).

### FEAT-RFP-010 — Line-Item Regret
Line-Item Regret is a Core feature of RFP / Technical (MOD-04). Persona: Vendor. Plan: All Plans. Status: GA.
User story: As a vendor, I want to regret specific line items, so that I'm not forced to quote items I can't supply.
Business use case: A vendor regrets specific lines it cannot supply, barring commercial quoting on them.
Why it exists: Accurate bid coverage.
Test cases: PRD-RFP-019 … PRD-RFP-020 (2).

### FEAT-RFP-011 — Technical Evaluation Approval and Re-evaluation
Technical Evaluation Approval and Re-evaluation is a Core feature of RFP / Technical (MOD-04). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want a configurable evaluation approval that I can challenge, so that technical scoring is governed and correctable.
Business use case: Evaluators submit scores via a configurable approval; the buyer can challenge and trigger re-evaluation.
Why it exists: Approval rigor and recourse.
Edge cases / notes: Approval step optional per tenant.
Test cases: PRD-RFP-021 … PRD-RFP-023 (3).

### FEAT-RFP-012 — Department/Location-Based Evaluator Mapping
Department/Location-Based Evaluator Mapping is a Optional feature of RFP / Technical (MOD-04). Persona: Tenant Admin. Plan: Enterprise. Status: GA.
User story: As an admin, I want evaluation auto-routed by department or location, so that the right experts evaluate at scale.
Business use case: Technical evaluation auto-routes to evaluators mapped by department or site.
Why it exists: Accurate routing at scale.
Test cases: PRD-RFP-026 … PRD-RFP-028 (3).

### FEAT-RFP-013 — Change Evaluator During Event
Change Evaluator During Event is a Core feature of RFP / Technical (MOD-04). Persona: Buyer/Evaluator. Plan: All Plans. Status: GA.
User story: As a buyer/evaluator, I want to reassign the evaluator mid-event, so that I can cover absences without stalling.
Business use case: The buyer/evaluator reassigns the evaluator mid-event to cover an absence.
Why it exists: Operational continuity.
Test cases: PRD-RFP-024 … PRD-RFP-025 (2).

### FEAT-RFP-014 — Lot-Basis Re-evaluation
Lot-Basis Re-evaluation is a Optional feature of RFP / Technical (MOD-04). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want re-evaluation at lot level, so that I can challenge a lot-level technical result.
Business use case: Re-evaluation is run at lot level when a lot-wide technical result is challenged.
Why it exists: Flexible re-evaluation scope.
Test cases: PRD-RFP-029 … PRD-RFP-030 (2).

### FEAT-RFP-015 — Intake-Selected Technical Template
Intake-Selected Technical Template is a Optional feature of RFP / Technical (MOD-04). Persona: Requester / End User. Plan: Growth, Enterprise. Status: GA.
User story: As a requester, I want to pick the technical template at intake, so that the right questionnaire is set early.
Business use case: The technical template is pre-selected by the intake user upfront.
Why it exists: Earlier, accurate technical scoping.
Edge cases / notes: Cross-links MOD-13.
Test cases: PRD-RFP-031 … PRD-RFP-033 (3).
