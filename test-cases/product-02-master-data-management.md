# Product test cases — 02. Master Data Management (MOD-12)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-12 · 9 features · 22 cases · group `PRD-MDM` · plan availability: All Plans · status: GA

Material master, service master, and user master onboarding plus bulk uploads. Establish clean item, service, and user master data as the foundation for every procurement transaction.

## 1. Core features

#### PRD-MDM-001 — Bulk User Upload: happy path for the Tenant Admin

- **Why it matters.** Mass user setup without manual entry. Business use: At go-live; admins bulk-create all user accounts from the customer's user list.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Master Data Management.
  2. Bulk-create user accounts from a list.
  3. Follow the business scenario the workbook gives: "At go-live; admins bulk-create all user accounts from the customer's user list".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: provision all users at go-live. The business use case is served: at go-live; admins bulk-create all user accounts from the customer's user list.
- **Oracle.** Observable proof that Bulk User Upload did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-MDM-001.
- **Trace.** P0 · manual · `FEAT-MDM-001` · `MOD-10` · workbook sheet "2. Master Data Management"

#### PRD-MDM-002 — Bulk User Upload: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Bulk User Upload. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Bulk User Upload to bulk-create user accounts from a list.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-MDM-001` · `MOD-10` · workbook sheet "2. Master Data Management"

#### PRD-MDM-003 — Material Master Import: happy path for the Tenant Admin

- **Why it matters.** Clean item master underpins all procurement. Business use: Material master is imported and, for integrated tenants, auto-created from inbound ERP PRs.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Master Data Management.
  2. Import and auto-maintain the material master from ERP PRs.
  3. Follow the business scenario the workbook gives: "Material master is imported and, for integrated tenants, auto-created from inbound ERP PRs".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: buyers reference accurate item data everywhere. The business use case is served: material master is imported and, for integrated tenants, auto-created from inbound ERP PRs.
- **Oracle.** Observable proof that Material Master Import did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-MDM-002.
- **Trace.** P0 · manual · `FEAT-MDM-002` · `INT-002` · workbook sheet "2. Master Data Management"

#### PRD-MDM-004 — Material Master Import: auto-create via INT-002

- **Why it matters.** The workbook records this edge case for Material Master Import: "Auto-create via INT-002".
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup.
  2. Set up the situation the note describes: "Auto-create via INT-002".
  3. Use Material Master Import to import and auto-maintain the material master from ERP PRs.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Material Master Import behaves as the workbook states: "Auto-create via INT-002".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-MDM-002 quoting the note.
- **Trace.** P2 · manual · `FEAT-MDM-002` · `INT-002` · workbook sheet "2. Master Data Management"

#### PRD-MDM-005 — Material Master Import: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Material Master Import. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Material Master Import to import and auto-maintain the material master from ERP PRs.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-MDM-002` · `INT-002` · workbook sheet "2. Master Data Management"

#### PRD-MDM-006 — Service Master Import: happy path for the Tenant Admin

- **Why it matters.** Service catalog accuracy. Business use: Service master is imported and maintained for service-based procurement.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Master Data Management.
  2. Import and maintain the service master.
  3. Follow the business scenario the workbook gives: "Service master is imported and maintained for service-based procurement".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: buyers reference accurate service definitions. The business use case is served: service master is imported and maintained for service-based procurement.
- **Oracle.** Observable proof that Service Master Import did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-MDM-003.
- **Trace.** P0 · manual · `FEAT-MDM-003` · workbook sheet "2. Master Data Management"

#### PRD-MDM-007 — Service Master Import: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Service Master Import. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Service Master Import to import and maintain the service master.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-MDM-003` · workbook sheet "2. Master Data Management"

#### PRD-MDM-008 — Product Catalog & Bulk Product Upload: happy path for the Procurement Manager

- **Why it matters.** Catalog-driven procurement. Business use: Buyers select from a product catalog populated via bulk upload with HSN/make/model/dimension fields.
- **Setup.**
  Persona: Procurement Manager.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Master Data Management.
  2. Use Product Catalog & Bulk Product Upload to get what the story asks for: a product catalog with bulk upload and rich fields.
  3. Follow the business scenario the workbook gives: "Buyers select from a product catalog populated via bulk upload with HSN/make/model/dimension fields".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: buyers can select from accurate, structured product data. The business use case is served: buyers select from a product catalog populated via bulk upload with HSN/make/model/dimension fields.
- **Oracle.** Observable proof that Product Catalog & Bulk Product Upload did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-MDM-006.
- **Trace.** P0 · manual · `FEAT-MDM-006` · workbook sheet "2. Master Data Management"

#### PRD-MDM-009 — Product Catalog & Bulk Product Upload: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of Product Catalog & Bulk Product Upload. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Product Catalog & Bulk Product Upload to get a product catalog with bulk upload and rich fields.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P1 · automate-later · `FEAT-MDM-006` · workbook sheet "2. Master Data Management"

## 2. Optional features

#### PRD-MDM-010 — ERP-Driven Master Creation: happy path for the Tenant Admin

- **Why it matters.** Avoids manual master maintenance for integrated tenants. Business use: During integrated operation; material/service records are auto-created as ERP PRs arrive.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Master Data Management.
  2. Use ERP-Driven Master Creation to get what the story asks for: material and service records auto-created from inbound ERP PRs.
  3. Follow the business scenario the workbook gives: "During integrated operation; material/service records are auto-created as ERP PRs arrive".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: masters stay in sync without manual upkeep. The business use case is served: during integrated operation; material/service records are auto-created as ERP PRs arrive.
- **Oracle.** Observable proof that ERP-Driven Master Creation did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-MDM-004.
- **Trace.** P1 · manual · `FEAT-MDM-004` · `MOD-11` · workbook sheet "2. Master Data Management"

#### PRD-MDM-011 — ERP-Driven Master Creation: not available on the Growth plan

- **Why it matters.** The workbook limits ERP-Driven Master Creation to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use ERP-Driven Master Creation to get material and service records auto-created from inbound ERP PRs.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-MDM-004` · `MOD-11` · workbook sheet "2. Master Data Management"

#### PRD-MDM-012 — ERP-Driven Master Creation: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of ERP-Driven Master Creation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use ERP-Driven Master Creation to get material and service records auto-created from inbound ERP PRs.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-MDM-004` · `MOD-11` · workbook sheet "2. Master Data Management"

#### PRD-MDM-013 — Material Codification & Validations: happy path for the MDM / Master Data Team

- **Why it matters.** Prevents bad master data entering the ERP. Business use: When creating codes; MDM applies codification and validation rules (e.g., SAP 40-char limit, mandatory article code).
- **Setup.**
  Persona: MDM / Master Data Team.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an MDM / Master Data Team on the tenant described in Setup and open Master Data Management.
  2. Use Material Codification & Validations to get what the story asks for: configurable codification rules and validations.
  3. Follow the business scenario the workbook gives: "When creating codes; MDM applies codification and validation rules (e.g., SAP 40-char limit, mandatory article code)".
  4. Check the result against the story's promised outcome.
- **Expected.** The MDM / Master Data Team achieves the story's outcome: keep material codes clean and ERP-valid. The business use case is served: when creating codes; MDM applies codification and validation rules (e.g., SAP 40-char limit, mandatory article code).
- **Oracle.** Observable proof that Material Codification & Validations did its job for the MDM / Master Data Team — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-MDM-005.
- **Trace.** P1 · manual · `FEAT-MDM-005` · workbook sheet "2. Master Data Management"

#### PRD-MDM-014 — Material Codification & Validations: not available on the Growth plan

- **Why it matters.** The workbook limits Material Codification & Validations to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: MDM / Master Data Team.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an MDM / Master Data Team on the lower-plan tenant.
  2. Try it: use Material Codification & Validations to get configurable codification rules and validations.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-MDM-005` · workbook sheet "2. Master Data Management"

#### PRD-MDM-015 — Material Codification & Validations: refused for a user without the MDM / Master Data Team role

- **Why it matters.** The workbook names MDM / Master Data Team as the user of Material Codification & Validations. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: MDM / Master Data Team.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Material Codification & Validations to get configurable codification rules and validations.
  3. Repeat as an MDM / Master Data Team.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the MDM / Master Data Team can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the MDM / Master Data Team.
- **Trace.** P1 · automate-later · `FEAT-MDM-005` · workbook sheet "2. Master Data Management"

#### PRD-MDM-016 — Geo & Tax Mapping Master: happy path for the Tenant Admin

- **Why it matters.** Consistent location/tax handling. Business use: Admins maintain city/state/country/zone and tax mappings; pincode auto-fills city/state on forms.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Master Data Management.
  2. Manage city, state, country, zone, and tax mappings with pincode autofill.
  3. Follow the business scenario the workbook gives: "Admins maintain city/state/country/zone and tax mappings; pincode auto-fills city/state on forms".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: location and tax data stay consistent. The business use case is served: admins maintain city/state/country/zone and tax mappings; pincode auto-fills city/state on forms.
- **Oracle.** Observable proof that Geo & Tax Mapping Master did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-MDM-007.
- **Trace.** P0 · manual · `FEAT-MDM-007` · workbook sheet "2. Master Data Management"

#### PRD-MDM-017 — Geo & Tax Mapping Master: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Geo & Tax Mapping Master. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Geo & Tax Mapping Master to manage city, state, country, zone, and tax mappings with pincode autofill.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-MDM-007` · workbook sheet "2. Master Data Management"

#### PRD-MDM-018 — UOM Standardization: happy path for the Tenant Admin

- **Why it matters.** Data integrity for quantities. Business use: Admins standardize UOMs against a master list to keep quantities consistent across items.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Master Data Management.
  2. Use UOM Standardization to get what the story asks for: UOMs standardized against a master list.
  3. Follow the business scenario the workbook gives: "Admins standardize UOMs against a master list to keep quantities consistent across items".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: quantities stay consistent across items. The business use case is served: admins standardize UOMs against a master list to keep quantities consistent across items.
- **Oracle.** Observable proof that UOM Standardization did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-MDM-008.
- **Trace.** P1 · manual · `FEAT-MDM-008` · workbook sheet "2. Master Data Management"

#### PRD-MDM-019 — UOM Standardization: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of UOM Standardization. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use UOM Standardization to get UOMs standardized against a master list.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-MDM-008` · workbook sheet "2. Master Data Management"

#### PRD-MDM-020 — Withholding Tax Automation: happy path for the Finance Controller

- **Why it matters.** Tax compliance. Business use: Withholding tax is determined and applied automatically on applicable transactions.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open Master Data Management.
  2. Use Withholding Tax Automation to get what the story asks for: withholding tax determined automatically.
  3. Follow the business scenario the workbook gives: "Withholding tax is determined and applied automatically on applicable transactions".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: apply the correct WHT and stay compliant. The business use case is served: withholding tax is determined and applied automatically on applicable transactions.
- **Oracle.** Observable proof that Withholding Tax Automation did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-MDM-009.
- **Trace.** P0 · manual · `FEAT-MDM-009` · workbook sheet "2. Master Data Management"

#### PRD-MDM-021 — Withholding Tax Automation: not available on the Growth plan

- **Why it matters.** The workbook limits Withholding Tax Automation to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use Withholding Tax Automation to get withholding tax determined automatically.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-MDM-009` · workbook sheet "2. Master Data Management"

#### PRD-MDM-022 — Withholding Tax Automation: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of Withholding Tax Automation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Withholding Tax Automation to get withholding tax determined automatically.
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P1 · automate-later · `FEAT-MDM-009` · workbook sheet "2. Master Data Management"
