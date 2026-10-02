# Product test cases — 24. Integration Hub (MOD-11)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-11 · 2 features · 10 cases · group `PRD-INTG` · plan availability: Enterprise · status: GA

Connector management for ERP, HRMS, and third-party systems. Provide a governed, configurable layer for all inbound/outbound data exchange so modules stay decoupled from integrations.

## 1. Core features

#### PRD-INTG-001 — MQCS to SAP PO Integration: happy path for the Buyer

- **Why it matters.** Closes the sourcing-to-ERP loop. Business use: On award/PO; the final Master QCS is transferred to SAP for PO creation.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Integration Hub.
  2. Use MQCS to SAP PO Integration to get what the story asks for: the final Master QCS transferred to SAP for PO creation.
  3. Follow the business scenario the workbook gives: "On award/PO; the final Master QCS is transferred to SAP for PO creation".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: award data flows to the ERP automatically. The business use case is served: on award/PO; the final Master QCS is transferred to SAP for PO creation.
- **Oracle.** Observable proof that MQCS to SAP PO Integration did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INTG-001.
- **Trace.** P0 · manual · `FEAT-INTG-001` · `MOD-15` · workbook sheet "24. Integration Hub"

#### PRD-INTG-002 — MQCS to SAP PO Integration: not available on the Growth plan

- **Why it matters.** The workbook limits MQCS to SAP PO Integration to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use MQCS to SAP PO Integration to get the final Master QCS transferred to SAP for PO creation.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-INTG-001` · `MOD-15` · workbook sheet "24. Integration Hub"

#### PRD-INTG-003 — MQCS to SAP PO Integration: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of MQCS to SAP PO Integration. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use MQCS to SAP PO Integration to get the final Master QCS transferred to SAP for PO creation.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-INTG-001` · `MOD-15` · workbook sheet "24. Integration Hub"

#### PRD-INTG-004 — Statutory Verification APIs: happy path for the MDM / Master Data Team

- **Why it matters.** Automated compliance checks. Business use: During onboarding/verification; PAN, GST, bank, MSME, TAN, and IFSC are checked via external APIs.
- **Setup.**
  Persona: MDM / Master Data Team.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as an MDM / Master Data Team on the tenant described in Setup and open Integration Hub.
  2. Use Statutory Verification APIs to get what the story asks for: PAN, GST, bank, MSME, TAN, and IFSC verified via API.
  3. Follow the business scenario the workbook gives: "During onboarding/verification; PAN, GST, bank, MSME, TAN, and IFSC are checked via external APIs".
  4. Check the result against the story's promised outcome.
- **Expected.** The MDM / Master Data Team achieves the story's outcome: vendor checks are automated and reliable. The business use case is served: during onboarding/verification; PAN, GST, bank, MSME, TAN, and IFSC are checked via external APIs.
- **Oracle.** Observable proof that Statutory Verification APIs did its job for the MDM / Master Data Team — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INTG-002.
- **Trace.** P0 · manual · `FEAT-INTG-002` · `MOD-01` · workbook sheet "24. Integration Hub"

#### PRD-INTG-005 — Statutory Verification APIs: refused for a user without the MDM / Master Data Team role

- **Why it matters.** The workbook names MDM / Master Data Team as the user of Statutory Verification APIs. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: MDM / Master Data Team.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Statutory Verification APIs to get PAN, GST, bank, MSME, TAN, and IFSC verified via API.
  3. Repeat as an MDM / Master Data Team.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the MDM / Master Data Team can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the MDM / Master Data Team.
- **Trace.** P1 · automate-later · `FEAT-INTG-002` · `MOD-01` · workbook sheet "24. Integration Hub"

## 2. Configuration dependencies

#### PRD-INTG-006 — Auto PR-to-PO Conversion with SAP PR Sync Mode correctly configured (DEP-002)

- **Why it matters.** Auto PR-to-PO Conversion depends on SAP PR Sync Mode. FF-003 should only be enabled after SAP MM integration (INT-002) is fully configured and tested.
- **Setup.**
  Source: FF-003 "Auto PR-to-PO Conversion".
  Depends on: CONF-INT-001 "SAP PR Sync Mode" (`integration.sap.pr.sync_mode`) (Conditional).
  gate: `integration.sap.pr.sync_mode`.
  Condition: Only relevant if SAP integration is active.
  Workbook guidance: FF-003 should only be enabled after SAP MM integration (INT-002) is fully configured and tested.
  SAP PR Sync Mode configured correctly.
- **Steps.**
  1. Configure SAP PR Sync Mode (CONF-INT-001) correctly.
  2. Configure Auto PR-to-PO Conversion (FF-003).
  3. Exercise the behaviour Auto PR-to-PO Conversion controls with the condition true (only relevant if SAP integration is active).
- **Expected.** Auto PR-to-PO Conversion works as configured; none of the stated failure impact occurs.
- **Oracle.** The impact named in the missing-dependency case (DEP-002) is absent.
- **Trace.** P1 · automate-later · `DEP-002` · `FF-003` · `CONF-INT-001` · `integration.sap.pr.sync_mode` · workbook sheet "29. Config Dependencies"

#### PRD-INTG-007 — Auto PR-to-PO Conversion with SAP PR Sync Mode missing or misconfigured (DEP-002)

- **Why it matters.** The workbook states the impact: "Auto-conversion may create POs in Procol that never sync to SAP, causing data inconsistency between systems".
- **Setup.**
  Source: FF-003 "Auto PR-to-PO Conversion".
  Depends on: CONF-INT-001 "SAP PR Sync Mode" (`integration.sap.pr.sync_mode`) (Conditional).
  gate: `integration.sap.pr.sync_mode`.
  Condition: Only relevant if SAP integration is active.
  Workbook guidance: FF-003 should only be enabled after SAP MM integration (INT-002) is fully configured and tested.
  SAP PR Sync Mode missing or misconfigured.
- **Steps.**
  1. Leave SAP PR Sync Mode (CONF-INT-001) missing or misconfigured.
  2. Configure Auto PR-to-PO Conversion (FF-003).
  3. Exercise the behaviour Auto PR-to-PO Conversion controls with the condition true (only relevant if SAP integration is active).
- **Expected.** The stated impact appears: auto-conversion may create POs in Procol that never sync to SAP, causing data inconsistency between systems.
- **Oracle.** The consequence named in Expected can be observed; if Procol instead prevents the misconfiguration up front, record that as the actual (safer) behaviour.
- **Trace.** P1 · automate-later · `DEP-002` · `FF-003` · `CONF-INT-001` · `integration.sap.pr.sync_mode` · workbook sheet "29. Config Dependencies"

#### PRD-INTG-008 — Auto PR-to-PO Conversion: dependency on SAP PR Sync Mode does not apply when "Only relevant if SAP integration is active" is false (DEP-002)

- **Why it matters.** The dependency is conditional: "Only relevant if SAP integration is active". Outside that condition, SAP PR Sync Mode must not constrain Auto PR-to-PO Conversion.
- **Setup.**
  Source: FF-003 "Auto PR-to-PO Conversion".
  Depends on: CONF-INT-001 "SAP PR Sync Mode" (`integration.sap.pr.sync_mode`) (Conditional).
  gate: `integration.sap.pr.sync_mode`.
  Workbook guidance: FF-003 should only be enabled after SAP MM integration (INT-002) is fully configured and tested.
  Condition NOT met: Only relevant if SAP integration is active.
- **Steps.**
  1. Make the condition false.
  2. Leave SAP PR Sync Mode unconfigured and configure Auto PR-to-PO Conversion.
  3. Exercise the behaviour Auto PR-to-PO Conversion controls.
- **Expected.** Auto PR-to-PO Conversion works without SAP PR Sync Mode; the stated impact does not occur.
- **Oracle.** No trace of the impact "Auto-conversion may create POs in Procol that never sync to SAP, causing data…".
- **Trace.** P1 · automate-later · `DEP-002` · `FF-003` · `CONF-INT-001` · `integration.sap.pr.sync_mode` · workbook sheet "29. Config Dependencies"

#### PRD-INTG-009 — SAP PR Sync Mode with SAP RFC Connection Config correctly configured (DEP-003)

- **Why it matters.** SAP PR Sync Mode depends on SAP RFC Connection Config. CONF-INT-002 must be configured before activating any SAP-related sync mode.
- **Setup.**
  Source: CONF-INT-001 "SAP PR Sync Mode" (`integration.sap.pr.sync_mode`).
  Depends on: CONF-INT-002 "SAP RFC Connection Config" (Required).
  gate: `integration.sap.pr.sync_mode`.
  Workbook guidance: CONF-INT-002 must be configured before activating any SAP-related sync mode.
  SAP RFC Connection Config configured correctly.
- **Steps.**
  1. Configure SAP RFC Connection Config (CONF-INT-002) correctly.
  2. Configure SAP PR Sync Mode (CONF-INT-001).
  3. Exercise the behaviour SAP PR Sync Mode controls.
- **Expected.** SAP PR Sync Mode works as configured; none of the stated failure impact occurs.
- **Oracle.** The impact named in the missing-dependency case (DEP-003) is absent.
- **Trace.** P1 · automate-later · `DEP-003` · `CONF-INT-001` · `CONF-INT-002` · `integration.sap.pr.sync_mode` · workbook sheet "29. Config Dependencies"

#### PRD-INTG-010 — SAP PR Sync Mode with SAP RFC Connection Config missing or misconfigured (DEP-003)

- **Why it matters.** The workbook states the impact: "SAP PR sync cannot function without RFC connection details; enabling sync without this config causes all PR sync jobs to fail".
- **Setup.**
  Source: CONF-INT-001 "SAP PR Sync Mode" (`integration.sap.pr.sync_mode`).
  Depends on: CONF-INT-002 "SAP RFC Connection Config" (Required).
  gate: `integration.sap.pr.sync_mode`.
  Workbook guidance: CONF-INT-002 must be configured before activating any SAP-related sync mode.
  SAP RFC Connection Config missing or misconfigured.
- **Steps.**
  1. Leave SAP RFC Connection Config (CONF-INT-002) missing or misconfigured.
  2. Configure SAP PR Sync Mode (CONF-INT-001).
  3. Exercise the behaviour SAP PR Sync Mode controls.
- **Expected.** The stated impact appears: SAP PR sync cannot function without RFC connection details; enabling sync without this config causes all PR sync jobs to fail.
- **Oracle.** The consequence named in Expected can be observed; if Procol instead prevents the misconfiguration up front, record that as the actual (safer) behaviour.
- **Trace.** P1 · automate-later · `DEP-003` · `CONF-INT-001` · `CONF-INT-002` · `integration.sap.pr.sync_mode` · workbook sheet "29. Config Dependencies"
