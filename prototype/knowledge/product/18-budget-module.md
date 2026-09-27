# 18. Budget Module (MOD-23) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Budget Module module overview
Budget Module (MOD-23) is a Procure-to-Pay (P2P) module of Procol, in the "Governance" stage of the procurement lifecycle.
Description: Budget creation, mapping and consumption tracking across the P2P cycle.
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP
Registry status: GA
Roadmap notes: Imported from downstream P2P feature list (PM).
Features: 8 (5 GA (Already in Procol), 3 Roadmap (Suggested — not in product yet)). Test cases: test-cases/product-18-budget-module.md, group PRD-BUD.

## Budget Module features

8 features in 2 categories: Core, Reporting.

### FEAT-BUD-001 — Budget Creation
Budget Creation is a Core feature of Budget Module (MOD-23). Persona: Finance Controller. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a finance controller, I want to create budgets against any configurable hierarchy key, so that spend limits align with how our organization actually plans budgets.
Business use case: Budgets are created against cost center, department, project, or any other configured hierarchy key.
Why it exists: Flexibility to match diverse organizational budgeting structures.
Edge cases / notes: Hierarchy key is fully configurable, not fixed to cost center alone.
Test cases: PRD-BUD-001 … PRD-BUD-004 (4).

### FEAT-BUD-002 — Budget Consumption Tracking
Budget Consumption Tracking is a Core feature of Budget Module (MOD-23). Persona: Finance Controller. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a finance controller, I want to see budget consumption in real time, so that I know how much is left before approving further spend.
Business use case: Every PR/PO/invoice against a budget line reduces available budget visibly and immediately.
Why it exists: Prevents budget overruns from being discovered only at period-end.
Edge cases / notes: Consumption updates at the relevant transaction stage (PR, PO, or invoice, per config).
Test cases: PRD-BUD-005 … PRD-BUD-008 (4).

### FEAT-BUD-003 — Configurable Budget Hierarchy Key
Configurable Budget Hierarchy Key is a Core feature of Budget Module (MOD-23). Persona: Finance Controller. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a finance controller, I want to define which hierarchy key drives budget checks, so that budgeting logic matches our specific structure.
Business use case: Admin configures whether budgets check against cost center, project, WBS, or a custom key.
Why it exists: Avoids forcing a rigid, one-size-fits-all budget structure on every client.
Edge cases / notes: Different hierarchy keys can be used for different budget types simultaneously.
Test cases: PRD-BUD-009 … PRD-BUD-012 (4).

### FEAT-BUD-004 — Realized vs. Actual Budget Consumption
Realized vs. Actual Budget Consumption is a Core feature of Budget Module (MOD-23). Persona: Finance Controller. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a finance controller, I want to see both realized (committed) and actual (invoiced) budget consumption, so that I understand true remaining headroom.
Business use case: Dashboard distinguishes budget locked by open POs (realized) from budget actually spent (invoiced/actual).
Why it exists: Gives an accurate picture of remaining budget, not just cash spent to date.
Edge cases / notes: Realized consumption should release back to available budget on PO cancel/short-close.
Test cases: PRD-BUD-013 … PRD-BUD-016 (4).

### FEAT-BUD-005 — Budget Threshold Alerts
Budget Threshold Alerts is a Core feature of Budget Module (MOD-23). Persona: Finance Controller. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a finance controller, I want alerts when a budget line crosses a threshold (e.g., 80% consumed), so that I can act before it's fully exhausted.
Business use case: Configurable threshold alerts notify budget owners as consumption approaches the limit.
Why it exists: Enables proactive budget management instead of reactive overrun handling.
Edge cases / notes: Threshold % and recipients configurable per budget line.
Test cases: PRD-BUD-021 … PRD-BUD-024 (4).

### FEAT-BUD-006 — Budget Carry-Forward Rules
Budget Carry-Forward Rules is a Core feature of Budget Module (MOD-23). Persona: Finance Controller. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a finance controller, I want to configure whether unused budget carries forward to the next period, so that budget policy matches our fiscal rules.
Business use case: At period close, unused budget either lapses or carries forward based on a configured rule per budget type.
Why it exists: Supports different organizational policies on budget carry-forward.
Edge cases / notes: Should be configurable per budget category, not just globally.
Test cases: PRD-BUD-025 … PRD-BUD-028 (4).

### FEAT-BUD-007 — Budget Revision Workflow
Budget Revision Workflow is a Core feature of Budget Module (MOD-23). Persona: Finance Controller. Plan: Enterprise. Status: Roadmap (Suggested — not in product yet).
User story: As a finance controller, I want budget revisions to go through an approval workflow, so that mid-year budget changes are controlled.
Business use case: Requests to increase/decrease a budget line route through approval before taking effect.
Why it exists: Prevents budget figures from being changed without oversight.
Edge cases / notes: Revision history should remain visible alongside current budget.
Test cases: PRD-BUD-029 … PRD-BUD-032 (4).

### FEAT-BUD-008 — Budget vs. Actual Variance Reporting
Budget vs. Actual Variance Reporting is a Reporting feature of Budget Module (MOD-23). Persona: Finance Manager. Plan: Enterprise. Status: GA (Already in Procol).
User story: As a finance manager, I want a variance report comparing budgeted vs. actual spend, so that deviations are visible at period close.
Business use case: Report breaks down budget vs. realized vs. actual by hierarchy key, with variance highlighted.
Why it exists: Standard financial control reporting expected by finance leadership.
Edge cases / notes: Should be exportable and schedulable like other reports.
Test cases: PRD-BUD-017 … PRD-BUD-020 (4).
