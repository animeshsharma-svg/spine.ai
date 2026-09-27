# Product test cases — 21. Analytics & Reporting (MOD-08)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-08 · 2 features · 9 cases · group `PRD-ANL` · plan availability: Growth, Enterprise · status: GA

Spend analytics, compliance dashboards, and custom reports. Provide leadership and category managers with real-time visibility into procurement performance and spend patterns.

## 1. Optional features

#### PRD-ANL-001 — Price-Trend Dashboard: happy path for the Category Manager

- **Why it matters.** Data-driven sourcing strategy. Business use: Category managers analyze item- and category-level purchase-price trends over time to shape strategy.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup and open Analytics & Reporting.
  2. Use Price-Trend Dashboard to get what the story asks for: item and category price-trend analytics.
  3. Follow the business scenario the workbook gives: "Category managers analyze item- and category-level purchase-price trends over time to shape strategy".
  4. Check the result against the story's promised outcome.
- **Expected.** The Category Manager achieves the story's outcome: shape sourcing strategy with data. The business use case is served: category managers analyze item- and category-level purchase-price trends over time to shape strategy.
- **Oracle.** Observable proof that Price-Trend Dashboard did its job for the Category Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ANL-001.
- **Trace.** P1 · manual · `FEAT-ANL-001` · workbook sheet "21. Analytics & Reporting"

#### PRD-ANL-002 — Price-Trend Dashboard: not available on the Growth plan

- **Why it matters.** The workbook limits Price-Trend Dashboard to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Category Manager on the lower-plan tenant.
  2. Try it: use Price-Trend Dashboard to get item and category price-trend analytics.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-ANL-001` · workbook sheet "21. Analytics & Reporting"

#### PRD-ANL-003 — Price-Trend Dashboard: refused for a user without the Category Manager role

- **Why it matters.** The workbook names Category Manager as the user of Price-Trend Dashboard. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Price-Trend Dashboard to get item and category price-trend analytics.
  3. Repeat as a Category Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Category Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Category Manager.
- **Trace.** P1 · automate-later · `FEAT-ANL-001` · workbook sheet "21. Analytics & Reporting"

#### PRD-ANL-004 — Savings & Spend Analytics: happy path for the Procurement Manager

- **Why it matters.** Demonstrates procurement ROI. Business use: Management reviews savings and spend against benchmarks to quantify procurement value.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Analytics & Reporting.
  2. Use Savings & Spend Analytics to get what the story asks for: savings and spend analytics against benchmarks.
  3. Follow the business scenario the workbook gives: "Management reviews savings and spend against benchmarks to quantify procurement value".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: quantify procurement's value. The business use case is served: management reviews savings and spend against benchmarks to quantify procurement value.
- **Oracle.** Observable proof that Savings & Spend Analytics did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ANL-002.
- **Trace.** P1 · manual · `FEAT-ANL-002` · workbook sheet "21. Analytics & Reporting"

#### PRD-ANL-005 — Savings & Spend Analytics: ties to MQCS savings

- **Why it matters.** The workbook records this edge case for Savings & Spend Analytics: "Ties to MQCS savings".
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Ties to MQCS savings".
  3. Use Savings & Spend Analytics to get savings and spend analytics against benchmarks.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Savings & Spend Analytics behaves as the workbook states: "Ties to MQCS savings".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-ANL-002 quoting the note.
- **Trace.** P3 · manual · `FEAT-ANL-002` · workbook sheet "21. Analytics & Reporting"

#### PRD-ANL-006 — Savings & Spend Analytics: not available on the Growth plan

- **Why it matters.** The workbook limits Savings & Spend Analytics to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the lower-plan tenant.
  2. Try it: use Savings & Spend Analytics to get savings and spend analytics against benchmarks.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-ANL-002` · workbook sheet "21. Analytics & Reporting"

#### PRD-ANL-007 — Savings & Spend Analytics: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of Savings & Spend Analytics. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Savings & Spend Analytics to get savings and spend analytics against benchmarks.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P1 · automate-later · `FEAT-ANL-002` · workbook sheet "21. Analytics & Reporting"

## 2. Configuration dependencies

#### PRD-ANL-008 — AI Spend Insights with Standard Dashboards (Feature) correctly configured (DEP-004)

- **Why it matters.** AI Spend Insights depends on Standard Dashboards (Feature). Ensure MOD-07 (Analytics) is active for the tenant before enabling FF-004.
- **Setup.**
  Source: FF-004 "AI Spend Insights".
  Depends on: FEAT-ANL-001 "Price-Trend Dashboard" (Required).
  Workbook guidance: Ensure MOD-07 (Analytics) is active for the tenant before enabling FF-004.
  Standard Dashboards (Feature) configured correctly.
- **Steps.**
  1. Configure Standard Dashboards (Feature) (FEAT-ANL-001) correctly.
  2. Configure AI Spend Insights (FF-004).
  3. Exercise the behaviour AI Spend Insights controls.
- **Expected.** AI Spend Insights works as configured; none of the stated failure impact occurs.
- **Oracle.** The impact named in the missing-dependency case (DEP-004) is absent.
- **Trace.** P1 · automate-later · `DEP-004` · `FF-004` · `FEAT-ANL-001` · workbook sheet "29. Config Dependencies"

#### PRD-ANL-009 — AI Spend Insights with Standard Dashboards (Feature) missing or misconfigured (DEP-004)

- **Why it matters.** The workbook states the impact: "AI Spend Insights is an overlay on the analytics module; cannot be enabled if the Analytics module itself is inactive for the tenant".
- **Setup.**
  Source: FF-004 "AI Spend Insights".
  Depends on: FEAT-ANL-001 "Price-Trend Dashboard" (Required).
  Workbook guidance: Ensure MOD-07 (Analytics) is active for the tenant before enabling FF-004.
  Standard Dashboards (Feature) missing or misconfigured.
- **Steps.**
  1. Leave Standard Dashboards (Feature) (FEAT-ANL-001) missing or misconfigured.
  2. Configure AI Spend Insights (FF-004).
  3. Exercise the behaviour AI Spend Insights controls.
- **Expected.** The stated impact appears: AI Spend Insights is an overlay on the analytics module; cannot be enabled if the Analytics module itself is inactive for the tenant.
- **Oracle.** The consequence named in Expected can be observed; if Procol instead prevents the misconfiguration up front, record that as the actual (safer) behaviour.
- **Trace.** P1 · automate-later · `DEP-004` · `FF-004` · `FEAT-ANL-001` · workbook sheet "29. Config Dependencies"
