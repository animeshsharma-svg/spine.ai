# 08. RFQ (MOD-03) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## RFQ module overview
RFQ (MOD-03) is a Sourcing module of Procol, in the "Sourcing" stage of the procurement lifecycle.
Description: Structured competitive commercial bidding
Business purpose: Drive competitive pricing and vendor selection through a governed, auditable bidding process
Default state: Enabled
Plan availability: All Plans
Depends on modules: MOD-01 Vendor Management, MOD-02 Purchase Requisition
Key integrations: Email, SAP MM
Registry status: GA
Features: 16 (16 GA). Test cases: test-cases/product-08-rfq.md, group PRD-RFQ.

## RFQ features

16 features in 2 categories: Core, Optional.

### FEAT-RFQ-001 — RFQ Templates (Line/Global/Formula)
RFQ Templates (Line/Global/Formula) is a Core feature of RFQ (MOD-03). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want configurable RFQ templates with line and global terms and formulas, so that commercial bids are consistent and computable.
Business use case: The commercial stage uses configurable templates (line + global terms + formula fields) set at implementation.
Why it exists: Consistent, computable commercial bids.
Edge cases / notes: Set at implementation.
Configs: CONF-RFQ-001 `rfq.bid.allow_partial` (default OFF; allowed ON | OFF)
Test cases: PRD-RFQ-001 … PRD-RFQ-005 (5).

### FEAT-RFQ-002 — Bidding Scope Rule
Bidding Scope Rule is a Core feature of RFQ (MOD-03). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want to require all-line or allow partial bidding, so that I can control coverage and award flexibility.
Business use case: Buyer sets whether vendors must bid all lines or may bid partially, enabling line- or lot-level award.
Why it exists: Balances participation and award strategy.
Edge cases / notes: Maps to CONF-RFQ-001 partial bidding.
Configs: CONF-RFQ-001 `rfq.bid.allow_partial` (default OFF; allowed ON | OFF)
Test cases: PRD-RFQ-006 … PRD-RFQ-007 (2).

### FEAT-RFQ-003 — Commercial Masking and RFQ Opening
Commercial Masking and RFQ Opening is a Core feature of RFQ (MOD-03). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want commercials masked until close and opened automatically or by OTP, so that bid confidentiality holds.
Business use case: Commercials stay sealed until close, then open automatically or via OTP and password by an authorized person.
Why it exists: Integrity of the sealed-bid process.
Edge cases / notes: RFQ never visible to evaluators/requisitioners.
Test cases: PRD-RFQ-008 … PRD-RFQ-010 (3).

### FEAT-RFQ-004 — Counter Offers
Counter Offers is a Core feature of RFQ (MOD-03). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want to counter on commercial and non-commercial terms per the template, so that I can negotiate better terms.
Business use case: During negotiation; the buyer issues counters on commercial and non-commercial terms per the template.
Why it exists: Structured negotiation.
Test cases: PRD-RFQ-011 … PRD-RFQ-012 (2).

### FEAT-RFQ-005 — Request for Best Offer
Request for Best Offer is a Core feature of RFQ (MOD-03). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want to request full-and-final pricing without revealing a target, so that I can drive best pricing.
Business use case: The buyer requests full-and-final pricing without revealing a target, within a set window.
Why it exists: Competitive final-price discovery.
Test cases: PRD-RFQ-013 … PRD-RFQ-014 (2).

### FEAT-RFQ-006 — Bid Revisions and History
Bid Revisions and History is a Core feature of RFQ (MOD-03). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want every counter to create a revision I can review, so that I have an auditable negotiation trail.
Business use case: Each accepted counter creates a bid revision the buyer can review in the QCS.
Why it exists: Auditable negotiation trail.
Test cases: PRD-RFQ-015 … PRD-RFQ-016 (2).

### FEAT-RFQ-007 — QCS Ranking and L1 Highlighting
QCS Ranking and L1 Highlighting is a Core feature of RFQ (MOD-03). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want the QCS to rank bids and highlight L1 per line, so that I can spot the best bid instantly.
Business use case: The QCS ranks bids (including landed price) and highlights L1 per line for award.
Why it exists: Faster, clearer award decisions.
Test cases: PRD-RFQ-017 … PRD-RFQ-018 (2).

### FEAT-RFQ-008 — Vendor Bid Submission
Vendor Bid Submission is a Core feature of RFQ (MOD-03). Persona: Vendor. Plan: All Plans. Status: GA.
User story: As a vendor, I want to submit quotes manually, by Excel, or quick-fill with revisions, so that I can quote efficiently.
Business use case: Vendors submit commercial quotes manually, by Excel, or quick-fill, revising during the window.
Why it exists: Lower-friction commercial bidding.
Test cases: PRD-RFQ-019 … PRD-RFQ-020 (2).

### FEAT-RFQ-009 — RFQ to Auction Conversion
RFQ to Auction Conversion is a Optional feature of RFQ (MOD-03). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want to flip the latest RFQ bids into an auction, so that I can escalate to live competition.
Business use case: When more competition is needed; the buyer flips the latest RFQ bids into an auction.
Why it exists: Price discovery via auction.
Edge cases / notes: Cross-links MOD-05.
Test cases: PRD-RFQ-028 … PRD-RFQ-030 (3).

### FEAT-RFQ-010 — Mid-Event Lot Splitting
Mid-Event Lot Splitting is a Optional feature of RFQ (MOD-03). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want to split RFQ lines into lots mid-event, so that I can improve negotiation and processing.
Business use case: Mid-event; the buyer splits RFQ lines into lots to aid negotiation and processing.
Why it exists: Negotiation leverage.
Test cases: PRD-RFQ-031 … PRD-RFQ-033 (3).

### FEAT-RFQ-011 — Delete Line Items
Delete Line Items is a Core feature of RFQ (MOD-03). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want to delete lines and return them to the open PR pool, so that I can proceed with viable lines only.
Business use case: When all vendors regret a line; the buyer deletes it (it returns to the open PR pool) and proceeds.
Why it exists: Keeps events clean; recovers demand.
Edge cases / notes: Returns to MOD-02 Open.
Test cases: PRD-RFQ-021 … PRD-RFQ-023 (3).

### FEAT-RFQ-012 — Participation Status Tracking
Participation Status Tracking is a Core feature of RFQ (MOD-03). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want stage-wise per-vendor participation status, so that I can monitor engagement and nudge laggards.
Business use case: During the window; the buyer monitors per-vendor participation status stage by stage.
Why it exists: Drives reminder actions.
Test cases: PRD-RFQ-024 … PRD-RFQ-025 (2).

### FEAT-RFQ-013 — Quote Mode (Discount % or Price)
Quote Mode (Discount % or Price) is a Optional feature of RFQ (MOD-03). Persona: Vendor. Plan: Enterprise. Status: GA.
User story: As a vendor, I want to quote a discount percentage or an absolute price per line, so that I can bid the way my market prices.
Business use case: Vendors quote either a discount percentage or an absolute price per line, per configuration.
Why it exists: Flexible commercial capture.
Test cases: PRD-RFQ-034 … PRD-RFQ-036 (3).

### FEAT-RFQ-014 — Baseline / Historical Price
Baseline / Historical Price is a Optional feature of RFQ (MOD-03). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want a baseline price in the template, so that I can benchmark bids without revealing my target.
Business use case: A hidden baseline/historical price in the template lets the buyer benchmark bids without revealing targets.
Why it exists: Protects negotiation position.
Test cases: PRD-RFQ-037 … PRD-RFQ-039 (3).

### FEAT-RFQ-015 — Previous RFQ Terms Prefill
Previous RFQ Terms Prefill is a Optional feature of RFQ (MOD-03). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want to pull previous RFQ terms into a new event, so that I can set up events faster.
Business use case: Setting up a new event; the buyer pulls in terms from a previous RFQ for the same product/commodity.
Why it exists: Faster event setup.
Test cases: PRD-RFQ-040 … PRD-RFQ-042 (3).

### FEAT-RFQ-016 — Bulk / Line-wise Counter Offer
Bulk / Line-wise Counter Offer is a Core feature of RFQ (MOD-03). Persona: Buyer. Plan: All Plans. Status: GA.
User story: As a buyer, I want bulk counters with line-wise accept/reject and auto price propagation, so that I can negotiate many lines efficiently.
Business use case: Across many lines; the buyer issues bulk counters and vendors accept/reject line-by-line with auto price propagation.
Why it exists: Negotiation at scale.
Test cases: PRD-RFQ-026 … PRD-RFQ-027 (2).

## RFQ configuration

### CONF-RFQ-001 — Allow Partial Bidding (`rfq.bid.allow_partial`)
Configuration parameter of RFQ (MOD-03), feature FEAT-RFQ-001 "RFQ Templates (Line/Global/Formula)".
Type: Toggle
Default: OFF
Allowed values: ON | OFF
What it does: When ON, vendors can submit bids for a subset of line items in the RFQ rather than the full BOQ
Why it exists: For large RFQs with many line items, forcing full bids limits vendor participation. Partial bidding increases competition and can reduce overall cost by splitting award across specialists
Business impact: Enabling this requires Procurement team to handle split-award decisions and manage multiple POs; disabling ensures single-source RFQ completion
Plan required: Growth, Enterprise
Risk if changed: Medium
Tenant-configurable: Yes

## RFQ integrations

### INT-005 — Email Notifications integration
External integration for RFQ (MOD-03), Reverse Auction (MOD-05).
Type: Outbound
Trigger: Any workflow event: approval request, bid invitation, PO issued, etc.
Data exchanged: Notification content: recipient email, subject, body, action links, attachments
Key config parameters: email.provider (SES/SendGrid/SMTP), email.from_address, email.reply_to, email.template_overrides
Auth: API Key / SMTP
Tenant-configurable: Yes
Required for module: Yes (all modules)
Failure handling: Failed emails retried 3x; after failures, notification logged as 'undelivered'; fallback to in-app notification
Status: GA
Notes: Template customisation per module event is configurable in Admin
