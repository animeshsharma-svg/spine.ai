# 21. Analytics & Reporting (MOD-08) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Analytics & Reporting module overview
Analytics & Reporting (MOD-08) is a Intelligence module of Procol, in the "Reporting & analytics" stage of the procurement lifecycle.
Description: Spend analytics, compliance dashboards, and custom reports
Business purpose: Provide leadership and category managers with real-time visibility into procurement performance and spend patterns
Default state: Enabled
Plan availability: Growth, Enterprise
Depends on modules: All modules
Key integrations: BI Tools, Data Warehouse
Registry status: GA
Roadmap notes: AI-powered spend insights on roadmap
Features: 2 (2 GA). Test cases: test-cases/product-21-analytics-and-reporting.md, group PRD-ANL.

## Analytics & Reporting features

2 features in 1 categories: Optional.

### FEAT-ANL-001 — Price-Trend Dashboard
Price-Trend Dashboard is a Optional feature of Analytics & Reporting (MOD-08). Persona: Category Manager. Plan: Enterprise. Status: GA.
User story: As a category manager, I want item and category price-trend analytics, so that I can shape sourcing strategy with data.
Business use case: Category managers analyze item- and category-level purchase-price trends over time to shape strategy.
Why it exists: Data-driven sourcing strategy.
Edge cases / notes: Analytics module otherwise pending capture.
Test cases: PRD-ANL-001 … PRD-ANL-003 (3).

### FEAT-ANL-002 — Savings & Spend Analytics
Savings & Spend Analytics is a Optional feature of Analytics & Reporting (MOD-08). Persona: Procurement Manager. Plan: Enterprise. Status: GA.
User story: As a procurement manager, I want savings and spend analytics against benchmarks, so that I can quantify procurement's value.
Business use case: Management reviews savings and spend against benchmarks to quantify procurement value.
Why it exists: Demonstrates procurement ROI.
Edge cases / notes: Ties to MQCS savings.
Test cases: PRD-ANL-004 … PRD-ANL-007 (4).

## Analytics & Reporting configuration dependencies

### DEP-004 — AI Spend Insights depends on Standard Dashboards (Feature)
Configuration dependency (Required): FF-004 depends on FEAT-ANL-001 "Price-Trend Dashboard".
Impact if missing or misconfigured: AI Spend Insights is an overlay on the analytics module; cannot be enabled if the Analytics module itself is inactive for the tenant
Guidance: Ensure MOD-07 (Analytics) is active for the tenant before enabling FF-004
Note: FF-004 is not defined anywhere else in the workbook.
