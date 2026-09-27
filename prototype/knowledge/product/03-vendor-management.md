# 03. Vendor Management (MOD-01) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Vendor Management module overview
Vendor Management (MOD-01) is a Supplier module of Procol, in the "Foundation & suppliers" stage of the procurement lifecycle.
Description: End-to-end vendor lifecycle: onboarding, amendment, discovery, blocking
Business purpose: Centralise vendor master data; enforce compliance and qualification before a vendor is usable in any procurement flow
Default state: Enabled
Plan availability: All Plans
Key integrations: SAP MDG, HRMS, Email
Registry status: GA
Features: 45 (44 GA, 1 Roadmap). Test cases: test-cases/product-03-vendor-management.md, group PRD-VM.

## Vendor Management features

45 features in 2 categories: Optional, Core.

### FEAT-VM-001 — VMS / VRP Import
VMS / VRP Import is a Optional feature of Vendor Management (MOD-01). Persona: Implementation Partner. Plan: Enterprise. Status: GA.
User story: As an implementation partner, I want to import vendors directly from the enterprise's existing VMS/VRP, so that I can avoid re-onboarding established suppliers and accelerate go-live.
Business use case: Run once at go-live for integrated enterprises that already maintain a VMS/VRP; implementation and MDM teams migrate the existing approved-vendor records so history is preserved.
Why it exists: Avoids re-keying established vendor data and accelerates go-live.
Edge cases / notes: One of two intake paths; cross-links MOD-11.
Configs: CONF-VM-001 `vendor.form.sections` (default Basic Info, Banking, Documents, Tax; allowed Basic Info | Banking | Documents | Tax | Qualifications | References); CONF-VM-002 `vendor.documents.required` (default PAN, GST Certificate; allowed PAN | GST Certificate | MSME Certificate | ISO Certificate | TAN | Bank Cancel Cheque | Trade Licence)
Test cases: PRD-VM-077 … PRD-VM-089 (13).

### FEAT-VM-002 — Buyer-Initiated Vendor Invitation
Buyer-Initiated Vendor Invitation is a Core feature of Vendor Management (MOD-01). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want to invite a new supplier with their primary details into the Prospect list, so that I can start onboarding in a structured, traceable way instead of creating vendors ad hoc.
Business use case: Triggered when a buyer needs a supplier not yet on Procol; buyer enters primary details, the vendor lands in the Prospect list, and onboarding begins once the invite is accepted.
Why it exists: Structured, invite-based intake prevents ad-hoc vendor creation.
Edge cases / notes: Adds vendor to Prospect list.
Configs: CONF-VM-003 `vendor.approval.levels` (default 2; allowed 1 – 5)
Test cases: PRD-VM-001 … PRD-VM-008 (8).

### FEAT-VM-003 — Configurable Vendor Lifecycle Statuses
Configurable Vendor Lifecycle Statuses is a Core feature of Vendor Management (MOD-01). Persona: Procurement Manager. Plan: All Plans. Status: GA.
User story: As a vendor management lead, I want configurable lifecycle statuses for every vendor, so that I can track and control exactly where each supplier sits from prospect to active.
Business use case: Day-to-day tracking and filtering of vendors by stage (prospect, in-progress, active, blacklisted, etc.); the status set is configured to the customer's SOP at setup.
Why it exists: A governed status model gives clear lifecycle visibility and control.
Edge cases / notes: Status set is tenant-configurable.
Test cases: PRD-VM-009 … PRD-VM-011 (3).

### FEAT-VM-004 — Multiple Onboarding Templates
Multiple Onboarding Templates is a Core feature of Vendor Management (MOD-01). Persona: Procurement Manager. Plan: All Plans. Status: GA.
User story: As a vendor management lead, I want category-specific onboarding templates with configurable fields, so that I can collect the right data per vendor type without building separate forms.
Business use case: At onboarding, the vendor's category/subcategory determines which template loads, each with its own fields and required documents (e.g., MRO vs services vs capex).
Why it exists: Different categories need different data and compliance without separate builds.
Edge cases / notes: MRO/Service/RM/Capex names are tenant config.
Test cases: PRD-VM-012 … PRD-VM-014 (3).

### FEAT-VM-005 — Domestic and Foreign Vendor Types
Domestic and Foreign Vendor Types is a Core feature of Vendor Management (MOD-01). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want onboarding to adapt to domestic versus foreign vendor types, so that I can capture the correct identity and tax fields for each geography.
Business use case: Form adapts at load to vendor geography; domestic vendors are asked for PAN/GSTIN while foreign vendors provide VAT/TIN and skip India-specific checks.
Why it exists: Identity and tax fields differ by geography.
Edge cases / notes: Foreign vendors skip PAN/GSTIN auto-fetch.
Test cases: PRD-VM-015 … PRD-VM-017 (3).

### FEAT-VM-006 — Section Weightage and Prequalification Scoring
Section Weightage and Prequalification Scoring is a Optional feature of Vendor Management (MOD-01). Persona: Category Manager. Plan: Growth, Enterprise. Status: GA.
User story: As a category manager, I want weighted sections that auto-score a vendor's prequalification rating, so that I can qualify suppliers objectively and reuse the score at award.
Business use case: During onboarding evaluation for prequalification categories; category managers score weighted sections and the rating is later surfaced at RFQ award.
Why it exists: Objective, reusable qualification scoring reduces subjective selection.
Edge cases / notes: Score pulls into RFX/RFQ.
Test cases: PRD-VM-090 … PRD-VM-093 (4).

### FEAT-VM-007 — Onboarding-History and Existing-Vendor Detection
Onboarding-History and Existing-Vendor Detection is a Core feature of Vendor Management (MOD-01). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I'm not able to easily tell whether a vendor already exists, so that I can be routed to extension instead of creating a duplicate record.
Business use case: Fires the moment onboarding is initiated; a history check routes to extension, resume, or rejection-review instead of allowing a duplicate.
Why it exists: Prevents duplicate vendor master records.
Edge cases / notes: Routes to Vendor Extension.
Test cases: PRD-VM-018 … PRD-VM-020 (3).

### FEAT-VM-008 — Conflict-of-Interest Hard Blocks
Conflict-of-Interest Hard Blocks is a Core feature of Vendor Management (MOD-01). Persona: Compliance Officer. Plan: Enterprise. Status: GA.
User story: As a compliance officer, I want onboarding blocked when a vendor's email domain or PAN belongs to a group entity, so that I can prevent related-party and fraud risk.
Business use case: Enforced at submission when a vendor's email domain or PAN matches a group/employee entity; onboarding is hard-blocked pending compliance review.
Why it exists: Mitigates fraud and conflict-of-interest risk.
Edge cases / notes: Hard block; domain/PAN rules are tenant config.
Test cases: PRD-VM-021 … PRD-VM-025 (5).

### FEAT-VM-009 — Multi-GSTIN-per-PAN Selection
Multi-GSTIN-per-PAN Selection is a Optional feature of Vendor Management (MOD-01). Persona: Vendor. Plan: All Plans. Status: GA.
User story: As a vendor, I want all GSTINs linked to my PAN fetched with the already-registered ones greyed out, so that I can pick the correct registration without duplication.
Business use case: During registration for vendors with multiple state GST registrations; all GSTINs are fetched from the portal and already-registered ones are greyed out.
Why it exists: Handles multi-state GST registrations cleanly.
Edge cases / notes: Depends on GST API.
Test cases: PRD-VM-094 … PRD-VM-095 (2).

### FEAT-VM-010 — Vendor Self-Registration (OTP)
Vendor Self-Registration (OTP) is a Core feature of Vendor Management (MOD-01). Persona: Vendor. Plan: All Plans. Status: GA.
User story: As a vendor, I want to sign up with email and phone OTP verification, so that I can create a verified account quickly.
Business use case: Immediately after a vendor accepts an invite; they verify email and phone via OTP before the registration form opens.
Why it exists: Verified contact details ensure reachability and reduce spam onboarding.
Edge cases / notes: Domestic phone starts 9/8/7/6; foreign uses country rules.
Test cases: PRD-VM-026 … PRD-VM-029 (4).

### FEAT-VM-011 — Document OCR and Auto-Fill
Document OCR and Auto-Fill is a Core feature of Vendor Management (MOD-01). Persona: Vendor. Plan: Growth, Enterprise. Status: GA.
User story: As a vendor, I want my uploaded documents read by OCR to auto-fill the form, so that I can complete onboarding faster with fewer manual errors.
Business use case: As the vendor uploads PAN/GST/cheque/MSME documents; OCR extracts and locks key fields, with manual entry as a fail-safe on persistent failure.
Why it exists: Reduces manual data entry and transcription errors.
Edge cases / notes: Manual-entry fail-safe on persistent OCR error; manual edits highlighted.
Test cases: PRD-VM-030 … PRD-VM-034 (5).

### FEAT-VM-012 — Automated Identity and Bank Verification
Automated Identity and Bank Verification is a Core feature of Vendor Management (MOD-01). Persona: MDM / Master Data Team. Plan: All Plans. Status: GA.
User story: As an MDM reviewer, I want PAN, GST, bank, and MSME verified automatically via API, so that I can trust vendor identity and bank details before approval.
Business use case: Pre-approval verification by MDM/system validating PAN, GST, bank (penny drop), and MSME via API; manual override is available on API outage.
Why it exists: Automated checks de-risk onboarding and ensure payable accuracy.
Edge cases / notes: Includes Aadhaar match for proprietors; overrides logged.
Test cases: PRD-VM-035 … PRD-VM-038 (4).

### FEAT-VM-013 — Enhanced Due Diligence
Enhanced Due Diligence is a Optional feature of Vendor Management (MOD-01). Persona: Finance Controller. Plan: Enterprise. Status: GA.
User story: As a finance controller, I want financial and credit-rating due diligence on high-value vendors, so that I can assess financial risk before engaging them.
Business use case: For high-value, import, or select categories; finance reviews audited financials and credit ratings before approval.
Why it exists: Higher-risk vendors warrant deeper financial scrutiny.
Edge cases / notes: Provider (CRISIL/Corpository) is tenant config.
Test cases: PRD-VM-096 … PRD-VM-099 (4).

### FEAT-VM-014 — Sanctions / PEP / UBO Screening
Sanctions / PEP / UBO Screening is a Optional feature of Vendor Management (MOD-01). Persona: Compliance Officer. Plan: Enterprise. Status: Roadmap.
User story: As a compliance officer, I want vendors screened against sanctions, PEP, and UBO data, so that I can mitigate regulatory and reputational exposure.
Business use case: Compliance screens vendors against sanctions/PEP/UBO lists during onboarding for regulated or higher-risk categories.
Why it exists: Regulatory and reputational risk mitigation.
Edge cases / notes: Feasibility-pending per SDD.
Test cases: PRD-VM-154 … PRD-VM-156 (3).

### FEAT-VM-015 — Duplicate Detection
Duplicate Detection is a Core feature of Vendor Management (MOD-01). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want new vendors matched against existing records on PAN, GST, bank, email, and mobile, so that I can avoid creating duplicate suppliers and splitting spend.
Business use case: At submission, the system matches PAN/GST/bank/email/mobile against the master and alerts the initiator with the existing vendor code.
Why it exists: Keeps the vendor master clean and prevents split spend.
Test cases: PRD-VM-039 … PRD-VM-040 (2).

### FEAT-VM-016 — Blacklist Re-Onboarding Prevention
Blacklist Re-Onboarding Prevention is a Core feature of Vendor Management (MOD-01). Persona: Compliance Officer. Plan: Enterprise. Status: GA.
User story: As a compliance officer, I want blacklisted entities blocked from re-onboarding via shared identifiers, so that I can keep barred suppliers out.
Business use case: When a previously blacklisted entity attempts to re-onboard under a new profile; shared digital identifiers block it.
Why it exists: Enforces blacklist integrity.
Test cases: PRD-VM-041 … PRD-VM-043 (3).

### FEAT-VM-017 — Related-Party Screening
Related-Party Screening is a Optional feature of Vendor Management (MOD-01). Persona: Compliance Officer. Plan: Enterprise. Status: GA.
User story: As a compliance officer, I want vendors screened against employee data for related-party links, so that I can surface undisclosed conflicts of interest.
Business use case: During onboarding, vendor identifiers are screened against HRMS/AD employee data to flag related-party conflicts.
Why it exists: Surfaces undisclosed conflicts of interest.
Edge cases / notes: Depends on HRMS/SuccessFactors API.
Test cases: PRD-VM-100 … PRD-VM-102 (3).

### FEAT-VM-018 — Per-Category Vendor Typing
Per-Category Vendor Typing is a Core feature of Vendor Management (MOD-01). Persona: Vendor. Plan: All Plans. Status: GA.
User story: As a vendor, I want to declare my vendor type per category with the required supporting documents, so that I can be sourced accurately for what I actually supply.
Business use case: At onboarding, the vendor declares a type (OEM/dealer/trader/etc.) per category; OEM and dealer types must attach the mandatory supporting certificate.
Why it exists: Category-accurate typing drives correct sourcing and compliance.
Test cases: PRD-VM-044 … PRD-VM-045 (2).

### FEAT-VM-019 — Surrogate Onboarding
Surrogate Onboarding is a Optional feature of Vendor Management (MOD-01). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want to onboard a vendor on their behalf with a persistent surrogate tag, so that I can bring in suppliers who can't self-serve while keeping it traceable.
Business use case: For import/FI/non-PO vendors who can't self-serve; the buyer completes the form on their behalf with a surrogate tag that carries into RFQ.
Why it exists: Covers vendors unable to self-serve while preserving traceability.
Edge cases / notes: Surrogate tag visible at all stages.
Test cases: PRD-VM-103 … PRD-VM-106 (4).

### FEAT-VM-020 — Collaborative Submission Review
Collaborative Submission Review is a Core feature of Vendor Management (MOD-01). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want to edit a vendor's submission collaboratively before finalizing, so that I can fix minor errors without a full resubmission cycle.
Business use case: After a vendor submits, the buyer/end-user co-edits to fix minor errors before finalizing, avoiding a full resubmission loop.
Why it exists: Speeds correction loops.
Test cases: PRD-VM-046 … PRD-VM-047 (2).

### FEAT-VM-021 — Site Visit and Assessment
Site Visit and Assessment is a Optional feature of Vendor Management (MOD-01). Persona: Technical Evaluator. Plan: Enterprise. Status: GA.
User story: As an evaluator, I want to attach a site visit or assessment that triggers approval, so that I can physically qualify a vendor before activation.
Business use case: For categories needing physical qualification; an evaluator schedules a site visit and logs immutable findings, photos, and CAPAs, triggering approval.
Why it exists: Some categories require on-site qualification.
Test cases: PRD-VM-107 … PRD-VM-109 (3).

### FEAT-VM-022 — Onboarding Approval Workflow
Onboarding Approval Workflow is a Core feature of Vendor Management (MOD-01). Persona: Approver. Plan: All Plans. Status: GA.
User story: As an approver, I want configurable multi-level approval of onboarding with query and reject options, so that I can enforce qualification governance before engagement.
Business use case: Before activation; the onboarding request runs a configurable multi-level approval (finance/legal/category/MDM) with query and reject.
Why it exists: Enforces qualification governance before commercial engagement.
Edge cases / notes: 7-level standard / 3-level FI are tenant config; cross-links MOD-09.
Test cases: PRD-VM-048 … PRD-VM-050 (3).

### FEAT-VM-023 — Finance / Tax / MDM Review
Finance / Tax / MDM Review is a Core feature of Vendor Management (MOD-01). Persona: Finance Controller. Plan: Enterprise. Status: GA.
User story: As a taxation reviewer, I want a dedicated step to set the TDS code and rate without touching other fields, so that I can ensure tax accuracy before SAP creation.
Business use case: Within onboarding approval; finance, taxation, and MDM each review their slice — taxation sets the TDS code/rate, MDM does the final completeness check.
Why it exists: Segregated review ensures accuracy and tax correctness.
Edge cases / notes: MDM cannot edit Account Group/PAN.
Test cases: PRD-VM-051 … PRD-VM-054 (4).

### FEAT-VM-024 — SAP Vendor Master Creation
SAP Vendor Master Creation is a Core feature of Vendor Management (MOD-01). Persona: MDM / Master Data Team. Plan: Enterprise. Status: GA.
User story: As an MDM reviewer, I want approved vendors created in SAP automatically with the code returned, so that I can avoid manual master creation and catch failures.
Business use case: On final approval; the vendor is created in SAP via API, the returned code is stored, and failures are auto-retried and logged for MDM.
Why it exists: Procol-as-source-of-truth with automated ERP propagation removes manual master creation.
Edge cases / notes: Cross-links MOD-11.
Test cases: PRD-VM-055 … PRD-VM-057 (3).

### FEAT-VM-025 — Document Push to SAP DMS
Document Push to SAP DMS is a Core feature of Vendor Management (MOD-01). Persona: MDM / Master Data Team. Plan: Enterprise. Status: GA.
User story: As an MDM reviewer, I want vendor documents pushed to SAP DMS as read-only, so that ERP users can view them without altering the source of truth.
Business use case: After creation; vendor documents and metadata are pushed to SAP DMS as read-only for ERP users.
Why it exists: Single source of truth with a read-only ERP mirror.
Edge cases / notes: Docs cannot be deleted from SAP.
Test cases: PRD-VM-058 … PRD-VM-061 (4).

### FEAT-VM-026 — Vendor Amendment Workflow
Vendor Amendment Workflow is a Core feature of Vendor Management (MOD-01). Persona: Vendor. Plan: All Plans. Status: GA.
User story: As a vendor, I want to amend my details through type-specific validation and approval, so that I can keep my record accurate and auditable.
Business use case: Post-onboarding, when bank/address/statutory/tax/status details change; type-specific validation and approval run with a three-way match.
Why it exists: Controlled change management keeps the master accurate and auditable.
Test cases: PRD-VM-062 … PRD-VM-063 (2).

### FEAT-VM-027 — Vendor Extension
Vendor Extension is a Core feature of Vendor Management (MOD-01). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want to extend an existing vendor to a new org or plant reusing its code, so that I can avoid duplicate masters across units.
Business use case: When an approved vendor is needed at a new plant or company code; extension reuses the existing code and inherited (unexpired) documents.
Why it exists: Avoids duplicate masters across org units.
Test cases: PRD-VM-064 … PRD-VM-066 (3).

### FEAT-VM-028 — Vendor Blocking and Inactive Lifecycle
Vendor Blocking and Inactive Lifecycle is a Core feature of Vendor Management (MOD-01). Persona: Procurement Manager. Plan: Enterprise. Status: GA.
User story: As a procurement manager, I want to block vendors and reactivate SAP-inactivated ones, so that I can enforce controls across sourcing and payments.
Business use case: Procurement/compliance blocks a non-compliant vendor across RFQ/PO; SAP-inactivated vendors are reactivated through amendment.
Why it exists: Enforces sourcing/payment controls on risky vendors.
Test cases: PRD-VM-067 … PRD-VM-069 (3).

### FEAT-VM-029 — Periodic Re-Validation Scheduler
Periodic Re-Validation Scheduler is a Optional feature of Vendor Management (MOD-01). Persona: MDM / Master Data Team. Plan: Enterprise. Status: GA.
User story: As an MDM reviewer, I want vendor compliance re-validated on schedule with auto-block on failure, so that I can keep supplier data current without manual checks.
Business use case: A scheduled job re-validates KYC/PAN/GST/bank/MSME/turnover on configured cadences, auto-blocking on a critical failure.
Why it exists: Ongoing compliance instead of point-in-time onboarding checks.
Edge cases / notes: Cadences tenant-config.
Test cases: PRD-VM-110 … PRD-VM-113 (4).

### FEAT-VM-030 — Certificate Expiry Tracking
Certificate Expiry Tracking is a Optional feature of Vendor Management (MOD-01). Persona: MDM / Master Data Team. Plan: Enterprise. Status: GA.
User story: As an MDM reviewer, I want certificate expiry tracked with staged reminders and auto-block, so that I can stop transacting with lapsed-compliance vendors.
Business use case: As certificates near expiry; 60/45/30/15-day reminders are sent to the vendor and a lapse auto-blocks them.
Why it exists: Prevents transacting with lapsed-compliance vendors.
Test cases: PRD-VM-114 … PRD-VM-116 (3).

### FEAT-VM-031 — Vendor Discovery and EOI
Vendor Discovery and EOI is a Optional feature of Vendor Management (MOD-01). Persona: Category Manager. Plan: Growth, Enterprise. Status: GA.
User story: As a category manager, I want to discover new vendors by region and commodity and collect expressions of interest, so that I can expand the supplier base beyond existing AVLs.
Business use case: When sourcing a requirement with no suitable AVL vendors; category managers search by region/commodity and collect expressions of interest.
Why it exists: Expands the supplier base beyond existing AVLs.
Edge cases / notes: Supersedes sample FEAT-VM-003.
Test cases: PRD-VM-117 … PRD-VM-119 (3).

### FEAT-VM-032 — Bulk Vendor Upload
Bulk Vendor Upload is a Core feature of Vendor Management (MOD-01). Persona: Implementation Partner. Plan: All Plans. Status: GA.
User story: As an implementation partner, I want to bulk-create vendors from an Excel list deduped on PAN, so that I can onboard an approved-vendor list at go-live without manual entry.
Business use case: At implementation; the customer's approved-vendor list is mass-created from an Excel template, deduped on PAN.
Why it exists: Mass onboarding at implementation without manual entry.
Edge cases / notes: From master-data onboarding step.
Test cases: PRD-VM-070 … PRD-VM-071 (2).

### FEAT-VM-033 — Vendor Grievance and SPOC Management
Vendor Grievance and SPOC Management is a Optional feature of Vendor Management (MOD-01). Persona: Vendor. Plan: Growth, Enterprise. Status: GA.
User story: As a vendor, I want to log grievances and manage my SPOCs, so that I can raise issues and keep my contacts current.
Business use case: Ongoing vendor support; vendors raise grievances with attachments and maintain their SPOCs, with changes notifying the buyer.
Why it exists: Structured vendor support and contact governance.
Test cases: PRD-VM-120 … PRD-VM-122 (3).

### FEAT-VM-034 — Multi-Channel and Broadcast Notifications
Multi-Channel and Broadcast Notifications is a Core feature of Vendor Management (MOD-01). Persona: Tenant Admin. Plan: All Plans. Status: GA.
User story: As a tenant admin, I want email, WhatsApp, SMS, and broadcast notifications with acknowledgement, so that I can reach vendors reliably and prove receipt.
Business use case: Platform-wide vendor communication; invites/reminders go via email/WhatsApp/SMS, and admins broadcast notices with mandatory acknowledgement.
Why it exists: Reliable, branded, trackable vendor communication.
Edge cases / notes: Email domain/SMTP and WhatsApp consent are tenant config.
Test cases: PRD-VM-072 … PRD-VM-074 (3).

### FEAT-VM-035 — Broker / Sub-Vendor Flow
Broker / Sub-Vendor Flow is a Optional feature of Vendor Management (MOD-01). Persona: Broker / Channel Partner. Plan: Enterprise. Status: GA.
User story: As a broker, I want to onboard and manage my sub-vendors with the PO issued to the supplier, so that I can bring my network onto the platform.
Business use case: A broker/channel-partner model where one party manages multiple sub-vendors; the PO is issued to the supplying vendor, not the broker.
Why it exists: Supports broker-mediated supply models.
Edge cases / notes: PO to supplier, not broker.
Test cases: PRD-VM-123 … PRD-VM-126 (4).

### FEAT-VM-036 — Buyer-Side Vendor Profile Editing
Buyer-Side Vendor Profile Editing is a Optional feature of Vendor Management (MOD-01). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want to edit existing vendor details directly within governance rules, so that I can correct data without a full amendment cycle.
Business use case: Buyers/MDM correct vendor details directly from the profile (editable fields only) without a full amendment cycle.
Why it exists: Faster master-data upkeep.
Edge cases / notes: Editable-field rules apply.
Test cases: PRD-VM-127 … PRD-VM-130 (4).

### FEAT-VM-037 — Prospect-to-Vendor Promotion
Prospect-to-Vendor Promotion is a Core feature of Vendor Management (MOD-01). Persona: Procurement Manager. Plan: All Plans. Status: GA.
User story: As a procurement manager, I want to promote a prospect to an active vendor, so that I can advance qualified suppliers explicitly.
Business use case: The VM team manually advances a vetted prospect to active vendor status.
Why it exists: Explicit lifecycle progression control.
Test cases: PRD-VM-075 … PRD-VM-076 (2).

### FEAT-VM-038 — PQ vs Non-PQ Onboarding Paths
PQ vs Non-PQ Onboarding Paths is a Optional feature of Vendor Management (MOD-01). Persona: Procurement Manager. Plan: Enterprise. Status: GA.
User story: As a procurement manager, I want both pre-qualified and direct onboarding paths, so that I can match qualification rigor to the vendor type.
Business use case: Orgs choose PQ (scored) vs non-PQ (direct) onboarding by vendor type/risk; low-risk vendors skip prequalification.
Why it exists: Right-sized onboarding effort.
Test cases: PRD-VM-131 … PRD-VM-133 (3).

### FEAT-VM-039 — Public Self-Registration Link
Public Self-Registration Link is a Optional feature of Vendor Management (MOD-01). Persona: Vendor. Plan: All Plans. Status: GA.
User story: As a vendor, I want to self-register via a public link, so that I can onboard without waiting for an internal invite.
Business use case: Vendors onboard themselves via a shared public link (e.g., from a tender notice) without an internal invite.
Why it exists: Scales vendor acquisition.
Test cases: PRD-VM-134 … PRD-VM-135 (2).

### FEAT-VM-040 — Foreign Bank Routing & IFSC Autofill
Foreign Bank Routing & IFSC Autofill is a Optional feature of Vendor Management (MOD-01). Persona: Vendor. Plan: Enterprise. Status: GA.
User story: As a vendor, I want routing-number capture and IFSC branch autofill, so that my bank details are accurate.
Business use case: At bank-detail capture; foreign vendors enter a routing number while domestic IFSC auto-fills the branch.
Why it exists: Payable accuracy.
Test cases: PRD-VM-136 … PRD-VM-138 (3).

### FEAT-VM-041 — Phone-Primary Registration
Phone-Primary Registration is a Optional feature of Vendor Management (MOD-01). Persona: Vendor. Plan: Enterprise. Status: GA.
User story: As a vendor, I want to register with my phone as the primary authentication, so that I can onboard in a mobile-first way.
Business use case: For mobile-first suppliers; registration uses phone as the primary identifier instead of email.
Why it exists: Accessibility for mobile-first suppliers.
Test cases: PRD-VM-139 … PRD-VM-141 (3).

### FEAT-VM-042 — Vendor Clone
Vendor Clone is a Optional feature of Vendor Management (MOD-01). Persona: Procurement Manager. Plan: Growth, Enterprise. Status: GA.
User story: As a procurement manager, I want to clone an active vendor, so that I can create a similar record quickly.
Business use case: Procurement quickly creates a near-identical vendor by cloning an existing active record.
Why it exists: Reduces re-entry.
Test cases: PRD-VM-142 … PRD-VM-144 (3).

### FEAT-VM-043 — Vendor IP Capture
Vendor IP Capture is a Optional feature of Vendor Management (MOD-01). Persona: Compliance Officer. Plan: Enterprise. Status: GA.
User story: As a compliance officer, I want participating vendors' IP addresses captured, so that I can detect fraud and support audit.
Business use case: Compliance captures participating vendors' IP addresses for fraud detection and audit.
Why it exists: Fraud detection and auditability.
Test cases: PRD-VM-145 … PRD-VM-147 (3).

### FEAT-VM-044 — Litigation Tracking
Litigation Tracking is a Optional feature of Vendor Management (MOD-01). Persona: Compliance Officer. Plan: Enterprise. Status: GA.
User story: As a compliance officer, I want supplier litigation status tracked in a dedicated tab, so that I can monitor legal exposure beyond blacklisting.
Business use case: Compliance logs and monitors supplier litigation in a dedicated tab, separate from blacklisting.
Why it exists: Risk visibility beyond blacklist.
Test cases: PRD-VM-148 … PRD-VM-150 (3).

### FEAT-VM-045 — TAN Verification
TAN Verification is a Optional feature of Vendor Management (MOD-01). Persona: MDM / Master Data Team. Plan: Enterprise. Status: GA.
User story: As an MDM reviewer, I want vendor TAN verified via API, so that statutory verification is complete.
Business use case: During verification; TAN is validated via API alongside PAN/GST for applicable vendors.
Why it exists: Completes statutory verification.
Edge cases / notes: Cross-links MOD-11.
Test cases: PRD-VM-151 … PRD-VM-153 (3).

## Vendor Management configuration

### CONF-VM-001 — Vendor Form Sections (`vendor.form.sections`)
Configuration parameter of Vendor Management (MOD-01), feature FEAT-VM-001 "VMS / VRP Import".
Type: Multi-select
Default: Basic Info, Banking, Documents, Tax
Allowed values: Basic Info | Banking | Documents | Tax | Qualifications | References
What it does: Controls which sections are visible and required on the vendor onboarding form
Why it exists: Different tenants have different compliance requirements. A manufacturing client may require HSE certificates; an FMCG client may not. This config avoids building separate forms per tenant
Business impact: Changes which data is collected at onboarding; removing Banking section means payment details must be captured elsewhere
Plan required: All Plans
Risk if changed: Medium
Tenant-configurable: Yes

### CONF-VM-002 — Mandatory Document Types (`vendor.documents.required`)
Configuration parameter of Vendor Management (MOD-01), feature FEAT-VM-001 "VMS / VRP Import".
Type: Multi-select / JSON
Default: PAN, GST Certificate
Allowed values: PAN | GST Certificate | MSME Certificate | ISO Certificate | TAN | Bank Cancel Cheque | Trade Licence
What it does: List of document types a vendor must upload before their profile can be submitted for approval
Why it exists: Mandatory document lists differ by country, industry, and company policy. Making it configurable ensures compliance without code changes per tenant
Business impact: Missing documents won't be flagged as blocking; vendors could be onboarded without critical compliance documents
Plan required: All Plans
Risk if changed: High
Tenant-configurable: Yes
Depends on: CONF-VM-001

### CONF-VM-003 — Vendor Approval Levels (`vendor.approval.levels`)
Configuration parameter of Vendor Management (MOD-01), feature FEAT-VM-002 "Buyer-Initiated Vendor Invitation".
Type: Number
Default: 2
Allowed values: 1 – 5
What it does: Number of sequential approval levels required before a vendor is activated
Why it exists: Different organizations have different governance requirements. A startup may need 1 approver; an enterprise like JSPL needs Finance + Legal + Category approval
Business impact: Directly affects how many people must approve each new vendor; reducing this relaxes controls, increasing it adds friction
Plan required: All Plans
Risk if changed: High
Tenant-configurable: Yes

## Vendor Management workflows and approvals

### WF-VM-001 — Vendor Onboarding workflow
Approval workflow of Vendor Management (MOD-01). Trigger: Vendor submits onboarding form.
Step 1 Form Completeness Check — System Validation; actor System (Auto); bypass/condition: All required fields and documents present; tenant-configurable: No.
Step 2 Finance Approval — Approval; actor Finance Controller; mode Sequential; SLA 48h; escalates to Finance Head; tenant-configurable: Yes (timeout + levels).
Step 3 Legal / Compliance Review — Approval; actor Legal / Compliance; mode Sequential; SLA 72h; escalates to Legal Head; bypass/condition: Vendor already approved in Global DB; tenant-configurable: Yes; note: Optional step; configurable to skip for pre-approved vendors.
Step 4 Category Manager Endorsement — Approval; actor Category Manager; mode Parallel with Step 3; SLA 24h; escalates to Procurement Head; tenant-configurable: Yes; note: Can run parallel with Legal if configured.
Step 5 Vendor Activation — System Action; actor System (Auto); bypass/condition: All prior steps Approved; tenant-configurable: No; note: Vendor status changes to Active; SAP MDG sync triggered if integration enabled.

## Vendor Management integrations

### INT-001 — SAP MDG (Master Data Governance) integration
External integration for Vendor Management (MOD-01), Integration Hub (MOD-11).
Type: Bidirectional
Trigger: Vendor created/updated in Procol OR vendor changed in SAP MDG
Data exchanged: Vendor master: name, PAN, GSTIN, bank details, vendor code, status, category
Key config parameters: sap.mdg.endpoint, sap.mdg.client_id, sap.mdg.sync_mode (Push/Pull/Bi), sap.mdg.batch_size
Auth: OAuth 2.0
Tenant-configurable: Yes
Required for module: Yes (SAP tenants)
Config dependencies: CONF-INT-001, CONF-VM-002
Failure handling: Retry 3x with exponential backoff; after 3 failures, alert sent to admin and record queued for manual review
Status: GA
Notes: Primary MDG integration for large enterprise clients

## Vendor Management configuration dependencies

### DEP-001 — Mandatory Document Types depends on Vendor Form Sections
Configuration dependency (Required): CONF-VM-002 "Mandatory Document Types" (`vendor.documents.required`) depends on CONF-VM-001 "Vendor Form Sections" (`vendor.form.sections`).
Impact if missing or misconfigured: If 'Documents' section is removed from form sections (CONF-VM-001), mandatory document config is ignored — vendors can be submitted without documents
Guidance: Always ensure 'Documents' is included in vendor form sections when CONF-VM-002 has any values set
