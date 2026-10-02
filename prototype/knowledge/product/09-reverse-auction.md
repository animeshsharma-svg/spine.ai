# 09. Reverse Auction (MOD-05) — Procol product knowledge

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

## Reverse Auction module overview
Reverse Auction (MOD-05) is a Sourcing module of Procol, in the "Sourcing" stage of the procurement lifecycle.
Description: Real-time price discovery via live online auction events
Business purpose: Achieve best-price outcomes for high-value, commodity, or repeat procurement through competitive real-time bidding
Default state: Optional
Plan availability: Growth, Enterprise
Depends on modules: MOD-01 Vendor Management, MOD-03 RFQ
Registry status: GA
Features: 15 (15 GA). Test cases: test-cases/product-09-reverse-auction.md, group PRD-RA.

## Reverse Auction features

15 features in 2 categories: Core, Optional.

### FEAT-RA-001 — Vendor Selection into Auction
Vendor Selection into Auction is a Core feature of Reverse Auction (MOD-05). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want to choose which vendors advance to the auction, so that I can curate the live bidder set.
Business use case: Before the auction; the buyer selects which qualified vendors advance.
Why it exists: Focused competition.
Test cases: PRD-RA-001 … PRD-RA-003 (3).

### FEAT-RA-002 — TNA and Regret Gating
TNA and Regret Gating is a Core feature of Reverse Auction (MOD-05). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want technically-rejected and regretted vendors barred from bidding those lines, so that only qualified vendors compete.
Business use case: Technically-rejected and regretted vendors are gated out of bidding the relevant lines.
Why it exists: Only qualified vendors compete.
Test cases: PRD-RA-004 … PRD-RA-006 (3).

### FEAT-RA-003 — Loading Factors
Loading Factors is a Optional feature of Reverse Auction (MOD-05). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want loading factors applied to bids for ranking, so that I can compare vendors on a normalized basis.
Business use case: Loading factors (template-defined) normalize bids for ranking, auto-applied for non-bidders.
Why it exists: Comparable rankings despite gaps.
Test cases: PRD-RA-029 … PRD-RA-031 (3).

### FEAT-RA-004 — Multiple Auction Strategies
Multiple Auction Strategies is a Core feature of Reverse Auction (MOD-05). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want multiple auction formats (English, Dutch, Japanese, and more), so that I can pick the best format for the category.
Business use case: The buyer picks an auction format (English/Dutch/Japanese/etc.) suited to the category and market.
Why it exists: Strategy fit to category/market.
Test cases: PRD-RA-007 … PRD-RA-009 (3).

### FEAT-RA-005 — Auction Scope (Line/Lot)
Auction Scope (Line/Lot) is a Core feature of Reverse Auction (MOD-05). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want auctions at line or lot level with rankings at both, so that I can compete at the right granularity.
Business use case: The auction runs at line-item or whole-lot level, ranking at both.
Why it exists: Flexible competition scope.
Test cases: PRD-RA-010 … PRD-RA-012 (3).

### FEAT-RA-006 — Dynamic Time Extension
Dynamic Time Extension is a Core feature of Reverse Auction (MOD-05). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want auctions to auto-extend on last-moment bids, so that I can prevent sniping and ensure a fair close.
Business use case: Last-moment bids auto-extend the auction per configured anti-sniping rules.
Why it exists: Fair price discovery.
Test cases: PRD-RA-013 … PRD-RA-015 (3).

### FEAT-RA-007 — Price Caps and Tick Size
Price Caps and Tick Size is a Core feature of Reverse Auction (MOD-05). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want starting price caps and a minimum decrement (tick size), so that I can control auction dynamics.
Business use case: The buyer sets a starting price cap and minimum decrement (tick size) before the auction.
Why it exists: Meaningful, bounded bidding.
Test cases: PRD-RA-016 … PRD-RA-018 (3).

### FEAT-RA-008 — Cost-Breakdown Auction
Cost-Breakdown Auction is a Optional feature of Reverse Auction (MOD-05). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want vendors to compete on lot price then break it down, so that I can split award and share-of-business.
Business use case: Vendors compete on lot price then provide a line-item breakup so the buyer can split award and share-of-business.
Why it exists: Granular award from lot competition.
Test cases: PRD-RA-032 … PRD-RA-034 (3).

### FEAT-RA-009 — Auction Time Controls
Auction Time Controls is a Core feature of Reverse Auction (MOD-05). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want to extend, shorten, or end submission with a logged reason, so that I can manage live timing accountably.
Business use case: During a live auction; the buyer extends, shortens, or ends submission, logging a reason.
Why it exists: Controlled, auditable timing.
Edge cases / notes: Reason logged.
Test cases: PRD-RA-019 … PRD-RA-022 (4).

### FEAT-RA-010 — Auction Team Permissions
Auction Team Permissions is a Optional feature of Reverse Auction (MOD-05). Persona: Tenant Admin. Plan: Enterprise. Status: GA.
User story: As an admin, I want a dedicated auction team with handoff permissions, so that specialists can run auctions with proper separation.
Business use case: Where a dedicated auction team runs auctions; the buyer drafts and hands off with proper permissions.
Why it exists: Separation of duties.
Test cases: PRD-RA-035 … PRD-RA-037 (3).

### FEAT-RA-011 — Post-Auction Negotiation
Post-Auction Negotiation is a Core feature of Reverse Auction (MOD-05). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want to counter per vendor in the QCS after the auction, so that I can extract final value.
Business use case: After the auction closes; the buyer issues per-vendor counters in the QCS for final value.
Why it exists: Continued negotiation leverage.
Test cases: PRD-RA-023 … PRD-RA-025 (3).

### FEAT-RA-012 — Serial / Sequential Lot Auctions
Serial / Sequential Lot Auctions is a Optional feature of Reverse Auction (MOD-05). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want lots to run one-by-one, so that I can focus bidder attention and improve per-lot discovery.
Business use case: Lots run live one-by-one to focus bidder attention and improve per-lot discovery.
Why it exists: Better price discovery per lot.
Test cases: PRD-RA-038 … PRD-RA-040 (3).

### FEAT-RA-013 — Request for Best Offer in Auction
Request for Best Offer in Auction is a Core feature of Reverse Auction (MOD-05). Persona: Buyer. Plan: Growth, Enterprise. Status: GA.
User story: As a buyer, I want a best-offer request within the auction with bid re-lock, so that I can extract final pricing.
Business use case: A best-offer request is issued within the auction, re-locking bids on a revised offer.
Why it exists: Continued competition.
Test cases: PRD-RA-026 … PRD-RA-028 (3).

### FEAT-RA-014 — Dummy Quote Auto-Generation
Dummy Quote Auto-Generation is a Optional feature of Reverse Auction (MOD-05). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want dummy quotes generated for non-bidders, so that auction rankings stay complete.
Business use case: Dummy quotes are generated for non-bidding/regretted/TNA vendors so rankings stay complete.
Why it exists: Consistent auction ranking.
Test cases: PRD-RA-041 … PRD-RA-043 (3).

### FEAT-RA-015 — Enhanced Rank-Based Auction Logic
Enhanced Rank-Based Auction Logic is a Optional feature of Reverse Auction (MOD-05). Persona: Buyer. Plan: Enterprise. Status: GA.
User story: As a buyer, I want refined rank-based logic beyond raw price, so that rankings are fair.
Business use case: Refined rank-based logic governs ranking beyond raw price.
Why it exists: Accurate competitive ranking.
Test cases: PRD-RA-044 … PRD-RA-046 (3).

## Reverse Auction integrations

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
