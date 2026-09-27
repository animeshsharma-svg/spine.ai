# 02. Master Data Management (MOD-12) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Master Data Management module overview
Master Data Management (MOD-12) is a Platform / Master Data module of Procol, in the "Foundation & suppliers" stage of the procurement lifecycle.
Description: Material master, service master, and user master onboarding plus bulk uploads
Business purpose: Establish clean item, service, and user master data as the foundation for every procurement transaction
Default state: Enabled
Plan availability: All Plans
Depends on modules: MOD-11 Integration Hub
Key integrations: SAP MM/MDG, ERP
Registry status: GA
Roadmap notes: NEW (provisional) - confirm name/placement
Features: 9 (9 GA). Test cases: test-cases/product-02-master-data-management.md, group PRD-MDM.

## Master Data Management features

9 features in 2 categories: Core, Optional.

### FEAT-MDM-001 — Bulk User Upload
Bulk User Upload is a Core feature of Master Data Management (MOD-12). Persona: Tenant Admin. Plan: All Plans. Status: GA.
User story: As a tenant admin, I want to bulk-create user accounts from a list, so that I can provision all users at go-live.
Business use case: At go-live; admins bulk-create all user accounts from the customer's user list.
Why it exists: Mass user setup without manual entry.
Edge cases / notes: Cross-links MOD-10.
Test cases: PRD-MDM-001 … PRD-MDM-002 (2).

### FEAT-MDM-002 — Material Master Import
Material Master Import is a Core feature of Master Data Management (MOD-12). Persona: Tenant Admin. Plan: All Plans. Status: GA.
User story: As an admin, I want to import and auto-maintain the material master from ERP PRs, so that buyers reference accurate item data everywhere.
Business use case: Material master is imported and, for integrated tenants, auto-created from inbound ERP PRs.
Why it exists: Clean item master underpins all procurement.
Edge cases / notes: Auto-create via INT-002.
Test cases: PRD-MDM-003 … PRD-MDM-005 (3).

### FEAT-MDM-003 — Service Master Import
Service Master Import is a Core feature of Master Data Management (MOD-12). Persona: Tenant Admin. Plan: All Plans. Status: GA.
User story: As an admin, I want to import and maintain the service master, so that buyers reference accurate service definitions.
Business use case: Service master is imported and maintained for service-based procurement.
Why it exists: Service catalog accuracy.
Test cases: PRD-MDM-006 … PRD-MDM-007 (2).

### FEAT-MDM-004 — ERP-Driven Master Creation
ERP-Driven Master Creation is a Optional feature of Master Data Management (MOD-12). Persona: Tenant Admin. Plan: Enterprise. Status: GA.
User story: As an admin, I want material and service records auto-created from inbound ERP PRs, so that masters stay in sync without manual upkeep.
Business use case: During integrated operation; material/service records are auto-created as ERP PRs arrive.
Why it exists: Avoids manual master maintenance for integrated tenants.
Edge cases / notes: Cross-links MOD-11.
Test cases: PRD-MDM-010 … PRD-MDM-012 (3).

### FEAT-MDM-005 — Material Codification & Validations
Material Codification & Validations is a Optional feature of Master Data Management (MOD-12). Persona: MDM / Master Data Team. Plan: Enterprise. Status: GA.
User story: As an MDM lead, I want configurable codification rules and validations, so that I can keep material codes clean and ERP-valid.
Business use case: When creating codes; MDM applies codification and validation rules (e.g., SAP 40-char limit, mandatory article code).
Why it exists: Prevents bad master data entering the ERP.
Test cases: PRD-MDM-013 … PRD-MDM-015 (3).

### FEAT-MDM-006 — Product Catalog & Bulk Product Upload
Product Catalog & Bulk Product Upload is a Core feature of Master Data Management (MOD-12). Persona: Procurement Manager. Plan: All Plans. Status: GA.
User story: As a procurement manager, I want a product catalog with bulk upload and rich fields, so that buyers can select from accurate, structured product data.
Business use case: Buyers select from a product catalog populated via bulk upload with HSN/make/model/dimension fields.
Why it exists: Catalog-driven procurement.
Test cases: PRD-MDM-008 … PRD-MDM-009 (2).

### FEAT-MDM-007 — Geo & Tax Mapping Master
Geo & Tax Mapping Master is a Optional feature of Master Data Management (MOD-12). Persona: Tenant Admin. Plan: All Plans. Status: GA.
User story: As an admin, I want to manage city, state, country, zone, and tax mappings with pincode autofill, so that location and tax data stay consistent.
Business use case: Admins maintain city/state/country/zone and tax mappings; pincode auto-fills city/state on forms.
Why it exists: Consistent location/tax handling.
Test cases: PRD-MDM-016 … PRD-MDM-017 (2).

### FEAT-MDM-008 — UOM Standardization
UOM Standardization is a Optional feature of Master Data Management (MOD-12). Persona: Tenant Admin. Plan: All Plans. Status: GA.
User story: As an admin, I want UOMs standardized against a master list, so that quantities stay consistent across items.
Business use case: Admins standardize UOMs against a master list to keep quantities consistent across items.
Why it exists: Data integrity for quantities.
Test cases: PRD-MDM-018 … PRD-MDM-019 (2).

### FEAT-MDM-009 — Withholding Tax Automation
Withholding Tax Automation is a Optional feature of Master Data Management (MOD-12). Persona: Finance Controller. Plan: Enterprise. Status: GA.
User story: As a finance controller, I want withholding tax determined automatically, so that I can apply the correct WHT and stay compliant.
Business use case: Withholding tax is determined and applied automatically on applicable transactions.
Why it exists: Tax compliance.
Test cases: PRD-MDM-020 … PRD-MDM-022 (3).
