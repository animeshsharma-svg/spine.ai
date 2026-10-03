# Bids — backend digest (procol-backend origin/main ae36e86894)

## Overview
This area covers how a vendor quote (a "bid") is created, revised, regretted, rejected, reopened and ranked on a sourcing-event stage (a TradeRequest: price round RFQ, auction, or technical round RFP). Vendors use a two-step v1 flow on the vendor website (draft bid, add line items, then submit), while the buyer console places surrogate bids (buyer bids on a vendor's behalf) and revises/edits bids through the unversioned /bids endpoints. Code: app/controllers/api/v1/bids_controller.rb, app/controllers/api/bids_controller.rb, app/helpers/api/v1/bids_controller_helper.rb, app/controllers/concerns/bids_controller_helper.rb, services under app/services/bid_submit, app/services/bids, app/services/anomaly_bid_detector, and ranking in app/models/concerns/bid_rank_helper.rb. Almost every refusal is HTTP 422; 401 only for wrong-app calls.

### bids — which app may call which bid API (wrong app = 401 and sign-out)
Every bid endpoint is gated per calling app; calling from the wrong app is refused and the session is signed out.
Checks, in order:
1. Action not listed for the calling app in config/app_auth_config.yml → refused with app_error_auth_failed "This app is not authorized to use this API" (HTTP 401); the 401 marks the session in_active (signed out) unless it is an MCP session — app/controllers/concerns/api_auth.rb:78-96, app/controllers/concerns/json_helpers.rb:31-35
State rules: vendor website v1: create, create_bid_trade_products, update, update_regret_status (yml:1977); vendor unversioned: update_bid, template_input, sheet_update, show, delete_draft_bid, accept knockout/dutch offer (1882-1892). Console unversioned: index, show, edit_bid, update_bid, update_bid_status, get_bid_details, template_input, sheet_update, reject, get_suspicious_bids_detail, get_approvals, approval_workflows_for_surrogate_bid_create (963-977); console v1: update_poc_bid only (527). So POST /v1/bids from the console = 401 + buyer signed out; reject/update_bid_status from the vendor website = 401.
Cites: config/app_auth_config.yml:963-977, 1882-1892

### Bid model — statuses, validation and save callbacks
A bid row moves through these statuses: in_active 0, active 1, selected 2 (awarded), revised 3 (superseded by a newer bid), rejected 4, revoke 5 (vendor withdrew), requested 6 (approval/counter offer pending), pending 7, anomaly_detected 8, draft 9, approval_requested 10 (surrogate-create approval pending) — app/models/bid.rb:104
Checks, in order:
1. Becoming active from draft/new with no line items (not fast bid, not buyer-added) → model error "Please bid on at least one product"; callers turn the failed save into 15 "Operation failed" (HTTP 422) — app/models/bid.rb:217-223
State rules: ranked statuses are active/selected/requested; regret is allowed on draft/active/selected/requested — app/models/bid.rb:163-164
Side effects on save: placed_at stamped on first activation (bid.rb:131); other draft bids of the same company on the stage set in_active when a bid becomes active (bid.rb:139, 1844-1850); after commit: rank-change notifications, push, precompute scores, rank slip handler, suspicious-IP cache, dutch auto-close (bid.rb:144-161).
Cites: app/models/bid.rb:104, app/models/bid.rb:128-164

### v1 bids#create — POST /v1/bids — vendor starts a draft bid (part 1: access)
Vendor website creates (or reuses) the vendor's draft bid on a stage; the line items are added later. Vendor-only (console = 401).
Checks, in order:
1. Same stage+company request within 3 s (cache lock t<trade_request_id>_c<company_id>) → 516 "Transaction in Progress" (HTTP 422) — app/controllers/api/v1/bids_controller.rb:8, 168-174
2. trade_request_id not found or company_id blank → 2 "Insufficient parameters" (HTTP 422) — v1/bids_controller.rb:14-17
3. Event is an older version (event_group not latest) → 101 "You are not allowed to perform this action" (HTTP 422) — v1/bids_controller.rb:18; a stage with no event group raises → untyped 500 (defect-shaped)
4. Vendor (or its broker) not in the stage audience (restricted = visible audiences; except_for = all dealing vendors minus hidden; everyone = creator company's dealing vendors) → 782 "Bid could not be placed. Please refresh and try again." (HTTP 422) — v1/bids_controller.rb:20, app/controllers/concerns/bids_controller_helper.rb:17-31
Cites: app/controllers/api/v1/bids_controller.rb:11-39

### v1 bids#create — POST /v1/bids — vendor starts a draft bid (part 2: eligibility rules)
Continuation of draft-bid creation: is_allowed_to_create_bid.
Checks, in order:
1. Buyer earlier rejected this vendor with "do not allow rebidding" → 101 (HTTP 422) — app/helpers/api/v1/bids_controller_helper.rb:8
2. make_id (alternative make) not active / not this company / not this event → 101 — v1 helper:17-28
3. A technical round (RFI/RFP, not cancelled/withdrawn) exists, vendor is not a dummy vendor and has no technical response: if vendor was invited to the RFP → 737 "You cannot quote for this item because you didn't participate in the technical stage"; if invited only to the price round → allowed; else 737 (HTTP 422) — v1 helper:30-38, 313-320
4. Latest bid of the company is revoked → 370 "You cannot place a bid after revoking the previous one" — v1 helper:54-56
5. Latest bid is requested (not surrogate-create approval): bid-justification pending → allowed; counter-offer modification window and no open request → 852 "No active counter offer found to modify"; otherwise → 490 "Your current bid is awaiting approval" — v1 helper:57-67
Cites: app/helpers/api/v1/bids_controller_helper.rb:7-78

### v1 bids#create — POST /v1/bids — vendor starts a draft bid (part 3: time, lock, currency)
Continuation of draft-bid creation.
Checks, in order:
1. Sibling/parent company already bid on the stage → 96 "A bid has already been placed by your team" (HTTP 422) — app/helpers/api/v1/bids_controller_helper.rb:68, app/models/company.rb:620-625
2. Stage not running (outside bid start/end and participant review time), no justification pending, counter-offer modification not applicable → 33 "Order not active" — v1 helper:71-73
3. Config lock_quote_after_submission and an active bid exists → 875 "Revise bid is locked..." — v1 helper:74-76
4. Multi-currency and currency_preference.code not allowed → 15 with message "Please choose a valid currency" — app/controllers/api/v1/bids_controller.rb:181-197
5. fast_bid_enabled but stage has no fast bidding and is not knockout/dutch → 715 "Bid not present on this line item" (misleading) — v1 helper:118-124
6. Draft save fails → 15 "Operation failed" — v1 helper:104-108
Side effects: draft reused or created (closed_at = bid end time), GST/discount/lines copied from the latest active bid, IP recorded — v1 helper:81-145
Cites: app/controllers/api/v1/bids_controller.rb:24-37

### v1 bids#create — known swallowed error (surrogate path)
On the v1 draft create, a buyer-side "surrogate not allowed" result is not returned as an error.
Checks, in order:
1. is_surrogate_bidding_and_is_allowed? returns [nil, 10] or [nil, 165]; line 13 does `return error_code`, a bare integer, and the controller destructures `_allowed, error_code = 10`, so error_code is nil and creation continues — app/helpers/api/v1/bids_controller_helper.rb:9-13, app/controllers/api/v1/bids_controller.rb:24-25 (defect-shaped; practically reachable only by a buyer-company user on the vendor app)
2. If the caller is a surrogate bidder and counter-offer modification is not applicable → 33 "Order not active" — v1 helper:10-12
Same pattern in the email/Excel commercial submit: app/services/bid_submit/commercial_bid_service.rb:78.
Cites: app/helpers/api/v1/bids_controller_helper.rb:9-14

### v1 bids#create_bid_trade_products — POST /v1/bids/:id/create_bid_products — add line items to draft (part 1)
Vendor website saves line-item quotes into its draft bid (status draft line items). Vendor-only.
Checks, in order:
1. Sheet payload stage not found → 4 "Request not found" (HTTP 422) — app/controllers/concerns/trade_template_helper.rb:5519-5555
2. Draft bid not found for the user's companies → 32 "Bid not found" — app/controllers/api/v1/bids_controller.rb:120-121
3. Older event version → 101 — v1/bids_controller.rb:124
4. Stage not running: counter-offer modification not applicable → 33; no line items → 80 "Product not found"; no requested line item of this company for a trade product → 508 "Not allowed to bid on this product" — v1/bids_controller.rb:125-128, app/controllers/concerns/bids_controller_helper.rb:792-804
5. Bid anomaly_detected → 473 "You cannot revise the bid, Please resolve the error prices first"; user cannot bid for company → 101; sibling company bid → 96 — v1/bids_controller.rb:132-135
Cites: app/controllers/api/v1/bids_controller.rb:113-139

### v1 bids#create_bid_trade_products — per line item rules (part 2: delete, staggered, technical round)
Continuation: create_bid_trade_product_helper, per submitted line item.
Checks, in order:
1. No trade_products: allowed only to clear the vendor's draft rows (all required participant fields empty, rows draft); else → 732 "Invalid Input" (HTTP 422) — app/helpers/api/v1/bids_controller_helper.rb:151-157, 322-351
2. Staggered line-item event: mobile app → app_error_auth_failed (HTTP 401, signs out); outside that line's window → 508 "Not allowed to bid on this product" — v1 helper:162-167, 975-983
3. Line void/in_active → 569 "Products have been updated, please refresh page" — v1 helper:189-191
4. Technical round (skipped for dummy vendors, email submits past the RFP, or when no ACTIVE RFP stage — a closed RFP skips it here): line regretted in technical → 736; vendor not a participant of that line (BOQ/service-form: not in RFP bid_company_ids) and invited to RFP → 737 — v1 helper:168, 289-320
5. Price/quantity limits (see "Line item price/quantity limits"); bulk insert failure → 15 — v1 helper:199-204, 226-230
Cites: app/helpers/api/v1/bids_controller_helper.rb:148-230

### Line item price/quantity limits — validate_bid_product_details (38, 41, 214, 39, 207, 138, 139, 578)
Every new/revised line item (draft add, submit, revise, surrogate bid) is checked against the stage limits.
Checks, in order:
1. Landed price (price+freight; sheet events net_price; English auction its widget) above the vendor's max (ceil) price (broker VPC uses broker company) → 38 "Price cannot be more than the allowed price" (HTTP 422) — app/controllers/concerns/bids_controller_helper.rb:1837-1846, 1722-1732
2. Below the floor price → 41 "Price cannot be less than the allowed price" — :1848-1855
3. Tick size (absolute or %): previous active bid exists and price moved by a non-zero amount below the tick → 214 "Quoted price difference must be greater than the tick size" — :1857-1891
4. Quantity below min quantity → 39 "Quantity cannot be less than the allowed quantity" — :1893-1896
5. Fixed-quantity stage, quantity differs → 207 — :1898-1900
6. Over-quantity off and quantity > asked → 138; under-quantity off and quantity < asked → 139 — :1902-1908
7. Custom trade validations fail → 578 "Validation Failed" — :1910-1912
Code 42 "Quantity cannot be more than the allowed quantity" is never raised in app/.
Cites: app/controllers/concerns/bids_controller_helper.rb:1828-1913

### Negative-value guards — filter_invalid_params (106, 35, 107, 369)
Rejects negative price/quantity/GST and bad discount before a revise.
Checks, in order:
1. Any line item price < 0 → 106 "Please enter a valid price"; quantity < 0 → 35 "Quantity must be greater than zero"; GST < 0 → 107 "Please enter valid GST" (HTTP 422) — app/controllers/api/bids_controller.rb:539-554
2. trade_credit_discount.discount < 0 or > 100 → 369 "Please enter a valid discount" — bids_controller.rb:555-560
3. Same checks on top-level price/quantity/gst (old apps) — bids_controller.rb:561-570
Skip conditions: runs only for actions create_bid, update_bid, edit_bid (bids_controller.rb:15). It does NOT run for template_input, sheet_update or any v1 endpoint, and it only sees bid_products/trade_products already in params (sheet payloads are transformed later). Zero quantity or zero price is not rejected here despite the 35 message.
Cites: app/controllers/api/bids_controller.rb:15, app/controllers/api/bids_controller.rb:539-571

### v1 bids#update — PATCH /v1/bids/:id — vendor submits/saves the draft (part 1: entry checks)
Vendor website saves the draft (status=draft) or submits it (status=active), which activates it or revises the current active bid. Vendor-only.
Checks, in order:
1. 3 s lock → 516 "Transaction in Progress" — app/controllers/api/v1/bids_controller.rb:8
2. Bid (not in_active, own/broker company) not found → 32 "Bid not found"; bid already active and status param active/draft → 34 "A bid has already been placed from your team" (HTTP 422) — v1/bids_controller.rb:43-47
3. Older event version → 101; missing trade_request_id → untyped 500 (defect-shaped) — v1/bids_controller.rb:48-50
4. Note: the "stage not running → 33" check here is commented out; timing is enforced later — v1/bids_controller.rb:51-52
5. No active bid but a requested bid without open counter offer/justification → 499 "You have a counter offer pending on this bid"; a requested bid with no open additional request raises → untyped 500 (defect-shaped) — app/helpers/api/v1/bids_controller_helper.rb:374-384
6. lock_quote_after_submission and active bid exists → 875 — v1 helper:385-387
Cites: app/controllers/api/v1/bids_controller.rb:41-66

### v1 bids#update — PATCH /v1/bids/:id — submit: technical round, staggered, knockout/dutch (part 2)
Continuation of update_bid_helper.
Checks, in order:
1. status=active and an RFP stage (status active or closed; RFI not looked at) exists: vendor invited to RFP must have quoted every non-regretted, non-deleted, non-TNA line (BOQ/service-form events: must be in RFP bid_company_ids) → 748 "Please enter bid for all line items that are not regretted in technical stage." (HTTP 422); skipped when vendor was invited only to the price round, is a dummy vendor, or the email submit already passed the RFP — app/helpers/api/v1/bids_controller_helper.rb:388-390, 985-1014
2. Staggered line-item event outside the line window → 508 (mobile: 401 sign-out) — v1 helper:391-396
3. Knockout/dutch stage in submission time: offer acceptance rules (95/580/217/457/458/459, see knockout section); bulk price is taken from the current round, not the request — v1 helper:398-408
Side effects: draft save (status=draft) only stores global fields; status=active goes to update_bid_action_helper_v1; then regretted lines are processed (see regret section) — v1 helper:453-477
Cites: app/helpers/api/v1/bids_controller_helper.rb:367-487

### v1 bids#update — submit: time window and eligibility (part 3, update_bid_action_helper_v1)
The submit path validates timing and vendor eligibility before activating.
Checks, in order:
1. Stage not running (outside bid start/end and outside participant review time) → 33 "Order not active" (HTTP 422), unless counter-offer modification applies (config counter_offer_modification_enabled + inside extra closing/evaluation time) and the active bid is requested, or a bid justification is pending — app/helpers/api/v1/bids_controller_helper.rb:561-572, app/models/trade_request.rb:1191-1194
2. Bid anomaly_detected → 473 — v1 helper:576
3. User cannot bid for the company → 101; vendor blocked from rebidding after rejection → 101 — v1 helper:577-578
4. Sibling/parent company bid on stage → 96 — v1 helper:579-580
5. Old counter-offer flow (open counter_offer request) outside running/extra closing time → 33 — v1 helper:591-597
Skip: when request_source=additional_request the running check also accepts extra closing time and rebidding/permission checks are relaxed per source type — v1 helper:551-560
Cites: app/helpers/api/v1/bids_controller_helper.rb:541-597

### v1 bids#update — submit: last-minute price increase and tie bids (part 4)
Single-product and multi-product price guards on submit.
Checks, in order:
1. Lot-closing sheet event and a submitted row is in_active (not via additional request) → 372 "Please quote prices for all the products." (HTTP 422) — app/helpers/api/v1/bids_controller_helper.rb:619-621
2. Single-product: price increase within the last 5 minutes before bid end time → 300 "You cannot increase the price"; skipped for additional-request revisions and sell (forward) orders — v1 helper:622-627, app/models/bid.rb:1423-1428
3. Tie bid: config is_tie_bid_allowed=false (default true), stage not RFQ and not offline, and the new landed price equals an existing price in trade_product.validations.all_bid_prices → 98 "A bid at this price already exists, please quote a different price." — v1 helper:601, 628-641, app/controllers/concerns/bids_controller_helper.rb:1916-2003
Note: currency stages compare with currency precision rounding; unchanged price is never a tie — bids_controller_helper.rb:1981-1989
Cites: app/helpers/api/v1/bids_controller_helper.rb:599-643

### v1 bids#update — submit: price-change approval (part 5)
When an active bid exists on a non-RFQ stage, a price change may need buyer approval instead of going live.
Checks, in order:
1. Ranking value down with config is_price_decrease_allowed=false → 301 "You cannot decrease the price"; up with is_price_increase_allowed=false → 300 (HTTP 422); increase also blocked in participant review time (reverse auctions) — app/controllers/concerns/bids_controller_helper.rb:2379-2391, app/models/model_helpers/trade_request_model_helper.rb:69-107
2. Approval needed on a sheet event during counter-offer modification → 15 — app/helpers/api/v1/bids_controller_helper.rb:695-697
3. Old mobile app, or no action_on_approval_reject → 217 "Update your app to perform this action." — v1 helper:700-703
State rules: approval when is_price_increase/decrease_approval_required; lot events count only a change of the lot ranking value — v1 helper:647-693
Side effects: the ACTIVE bid → requested, price-approval requests created, notification sent; the draft stays draft — v1 helper:705-738
Cites: app/helpers/api/v1/bids_controller_helper.rb:668-741

### v1 bids#update — submit: activation and revision effects (part 6)
Normal (no-approval) submit: the draft becomes the active bid and the old one is revised.
Checks, in order:
1. Event has an RFP and a submitted line was regretted (technical or commercial) → 800 "You have regretted this line item. Reset your draft bid to continue." (HTTP 422) — app/helpers/api/v1/bids_controller_helper.rb:742-750, 885-894
2. First bid on a lot-closing sheet event that does not quote every line → 372 (skipped when fast bidding is on) — v1 helper:818-821
3. Any save failure → 15; new line items re-validated for limits (38/41/214/39/207/138/139/578) — v1 helper:796-805
State rules: draft → active; previous active → revised (lines revised); a previous pending surrogate-create bid is withdrawn instead (5 "Not authorized" if the approval requester differs) — v1 helper:807-817, 1030-1044
Side effects: counter offer/justification resolved; fast-bid autofill; quote revision count; all_bid_prices updated (569 if a line became void); context label (counter_offer_modified, price_*_approval_requested, lot_adjusted_revision, normal_revision) — v1 helper:751-881, 1016-1028
Cites: app/helpers/api/v1/bids_controller_helper.rb:742-882

### Bid without the technical round done (737, 748, 736, 800)
Summary of how a technical round (RFI/RFP) gates commercial bidding on a multi-stage event.
Checks, in order:
1. Draft create: an RFI/RFP stage (not cancelled/withdrawn) exists, vendor has no technical response and was invited to the RFP → 737 "You cannot quote for this item because you didn't participate in the technical stage" — app/helpers/api/v1/bids_controller_helper.rb:30-38, 313-320
2. Adding a line: line regretted in technical → 736; vendor not a participant of that line and invited to RFP → 737 (only when the RFP stage is still status active) — v1 helper:168, 289-311
3. Submit: an RFP stage (active or closed) exists and the vendor invited to it must quote every non-regretted, non-TNA line → 748 — v1 helper:985-1014
4. Submit with a regretted line → 800 — v1 helper:885-894
Skip conditions: vendor invited only to the price round, dummy_vendor custom config, email/Excel submit after a successful technical submit (has_participated_in_technical_stage) — v1 helper:290-297, 994-996
The surrogate/template_input path (POST /bids/template_input) has no 737/748 check (none found in that chain).
Cites: app/helpers/api/v1/bids_controller_helper.rb:289-320, app/helpers/api/v1/bids_controller_helper.rb:985-1014

### bids#template_input — POST /bids/template_input — place a bid from the sheet / surrogate bid (part 1)
Places a full active bid in one call (sheet payload → trade_products → create_bid). Console uses it for surrogate bids (buyer bids on a vendor's behalf); also allowed for the vendor website.
Checks, in order:
1. 3 s lock → 516 — app/controllers/api/bids_controller.rb:16
2. Stage not found → 4; stage status not active/draft → 95 "Trade Request not found" (HTTP 422) — bids_controller.rb:26-38, app/controllers/concerns/trade_controller_helper.rb:6507-6517
3. Project RFQ whose auction/proposal exists → 769 "You cannot edit rfq once the auction is created." — bids_controller.rb:40
4. Vendor blocked from rebidding → 101 — bids_controller.rb:44
5. Surrogate: config is_buyer_not_allowed_to_add_surrogate_bid → 10; caller not super admin, creator or valid bidding team → 165 "Cannot place bid on trade by your own company"; staggered event and not surrogate → 508 — bids_controller.rb:47-49, 419-431, app/controllers/concerns/bids_controller_helper.rb:2130-2141
Note: where.not(rfx_mode: [rfi,rfp], auction_config: [knockout,dutch]) is a NAND in Rails 7.0: only an RFI/RFP stage that is also knockout/dutch is excluded — trade_controller_helper.rb:6508-6510
Cites: app/controllers/api/bids_controller.rb:26-85

### bids#template_input — POST /bids/template_input — timing and existing bids (part 2)
Continuation of create_bid.
Checks, in order:
1. Vendor bid, stage not running → 33 "Order not active" (HTTP 422). Surrogate bid allowed while upcoming or running, and after bid end time only with config is_allowed_to_add_surrogate_bid_post_expiry — app/controllers/api/bids_controller.rb:50, app/models/trade_request.rb:1191-1200
2. Cannot bid for that company (buyer: must be a dealing vendor or subsidiary) → 101 — bids_controller.rb:51, app/models/user.rb:678-691
3. Company already has an active/selected/revoke/approval_requested/anomaly_detected bid: revoked → 370; surrogate bid and config allowed_surrogate_bid_even_after_bid off → 99 "A bid is already placed on behalf of this company."; surrogate bid with it on → turned into a surrogate revision (update_bid); any other bid or a sibling company bid → 96 — bids_controller.rb:54-58, app/controllers/concerns/bids_controller_helper.rb:2741-2773, 2822-2830
4. Anomaly check (disabled, see anomaly section) — bids_controller.rb:60-61
No audience (invited vendor) check found on this path (unverified gap).
Cites: app/controllers/api/bids_controller.rb:50-61

### bids#template_input — POST /bids/template_input — create and approvals (part 3)
Continuation: approval flow, currency, bid row creation.
Checks, in order:
1. approval_flow_id matches one of the user's surrogate-bid-create flows → status approval_requested instead of active — app/controllers/concerns/bids_controller_helper.rb:2654-2658
2. Multi-currency, currency code not allowed → 520 "Please choose a valid currency" (HTTP 422) — app/controllers/concerns/trade_controller_helper.rb:6520-6535
3. No trade_products → 80 "Product not found"; factory_pickup with zero freight → 36 "Freight cannot be zero" — bids_controller_helper.rb:443-444, 499-502
4. Lot sheet event not quoting every line → 372; unknown line → 80; line limits (38/41/214/39/207/138/139/578); save failure → 15 — :569-625
5. Approval flow v2 and quantity in approval exceeds asked → 781 "Approval flow version v2 is required" (misleading) — :2781-2807
Side effects: meta is_surrogate_bid, vendor's first make if none sent, surrogate_remarks remark, context label surrogate_bid, approval started; response = template view — app/controllers/api/bids_controller.rb:63-84, 654-677
Cites: app/controllers/api/bids_controller.rb:63-84, app/controllers/concerns/bids_controller_helper.rb:440-647

### bids#approval_workflows_for_surrogate_bid_create — GET /bids/approval_workflows_for_surrogate_bid_create
Console lists the approval flows that apply when a buyer creates a surrogate bid on a stage.
Checks, in order:
1. User lacks approval_flows read permission → 455 "You are not authorized to perform this action" (HTTP 422) — app/policies/bid_policy.rb:49-51, app/controllers/concerns/api_auth.rb:117-118
2. trade_request_id missing → 2 "Insufficient parameters" — app/controllers/api/bids_controller.rb:90
3. Surrogate not allowed (10, 165) or staggered (508) — bids_controller.rb:95-96
Note: the stage lookup is scoped to the current workspace; a stage of another company returns nil and the next call raises → untyped 500 (defect-shaped) — bids_controller.rb:92-95
Side effects: none; returns team approval flows with key surrogate_bid_create — app/controllers/concerns/bids_controller_helper.rb:2775-2779
Cites: app/controllers/api/bids_controller.rb:87-101

### bids#update_bid — PATCH /bids/revise_bid/:id — revise a bid / buyer edit (part 1: entry)
Revises an existing bid (vendor website revise, console surrogate revision or buyer edit of a vendor bid). Creates a new bid row; the old one becomes revised.
Checks, in order:
1. 3 s lock → 516; negative price/qty/GST or bad discount → 106/35/107/369 — app/controllers/api/bids_controller.rb:15-16
2. Bid not found or status revised/rejected/selected/revoke/in_active/draft → 32 "Bid not found" (HTTP 422) — bids_controller.rb:110-111
3. Mobile app on an event not viewable on mobile → 580 "Login to ... on your dekstop to view this event" — bids_controller.rb:114-116
4. Caller from the buyer company (and not is_surrogate_revision) = buyer edit: needs config can_buyer_edit_bid or the bid's latest context is email_ai_submitted_bid → else 101; no inline/global value actually changed → 758 "No changes found. Please update the template to continue."; only buyer-editable fields are kept — app/controllers/concerns/bids_controller_helper.rb:2809-2820, 2051-2128
5. Staggered event and not a buyer edit/surrogate revision → 508 — bids_controller_helper.rb:2816-2818
Cites: app/controllers/api/bids_controller.rb:109-131

### bids#update_bid — PATCH /bids/revise_bid/:id — eligibility and timing (part 2)
Continuation: update_bid_action_helper.
Checks, in order:
1. lock_quote_after_submission, bid not requested, not via additional request, company has an active bid → 875 (HTTP 422) — app/controllers/concerns/bids_controller_helper.rb:48-51
2. Stage not running: without buyer-edit permission → 33 "Order not active" unless counter-offer modification applies to a requested bid or a justification is pending; with buyer-edit permission → 101 unless it is a buyer edit during extra closing (evaluation) time — :67-85
3. Requested bid on a sheet event without counter-offer modification/justification → 101 — :86-90
4. anomaly_detected → 473; cannot bid for company → 101 (company config skip_vendor_review_blacklisted lets a blacklisted vendor through); rebidding blocked → 101; sibling company → 96 — :91-103
5. Old counter-offer flow outside running/extra closing time → 33 — :114-122
Skip: request_source=additional_request uses the lighter checks at :54-65.
Cites: app/controllers/concerns/bids_controller_helper.rb:38-122

### bids#update_bid — PATCH /bids/revise_bid/:id — price rules and approval (part 3)
Continuation: price guards and price-change approval for revisions.
Checks, in order:
1. Lot sheet event with an in_active row (not via additional request) → 372 — app/controllers/concerns/bids_controller_helper.rb:132-133
2. Single product: price increase in the last 5 min before bid end → 300; tie with an existing price when is_tie_bid_allowed=false (non-RFQ, non-offline) → 98 — :134-146
3. Multi product tie → 98 — :147-154
4. Not RFQ, not additional request, not buyer edit: ranking value change blocked by config → 300/301; approval needed on sheet event with old app or no action_on_approval_reject → 217 — :187-219, 2379-2391
State rules: approval needed → the same bid goes to requested (lot or line item), price approvals created, notification sent; no approval → normal revision — :213-263
Cites: app/controllers/concerns/bids_controller_helper.rb:123-263

### bids#update_bid — PATCH /bids/revise_bid/:id — new bid row and effects (part 4)
Normal revision path.
Checks, in order:
1. Counter offer/justification on a requested bid without an open request → error from get_additional_request_for_counter_offer — app/controllers/concerns/bids_controller_helper.rb:268-273
2. Revising a line whose quote was revoked → 373 "You cannot place a quote after revoking the previous quote"; unknown line → 80; city_id unknown → 187 "City does not exist."; line limits (skipped for additional-request revisions); save failure → 15 (HTTP 422) — :651-717, 978-1096
State rules: new bid = copy of old, active, user = caller; old bid → revised; line status in_active = counter-offer accept (negotiated), negotiated = partial closing, revoke = revoke line — :265-326, 663-675
Side effects: meta is_surrogate_bid/is_buyer_added_bid, quote revision count (not for buyer edits), rank recomputed, all_bid_prices updated, old counter offer voided, context label buyer_edit — :274-377, app/controllers/api/bids_controller.rb:128-130
Cites: app/controllers/concerns/bids_controller_helper.rb:265-377

### bids#sheet_update — PATCH /bids/sheet_update/:id — revise from the sheet
Same as revise (bids#update_bid) but the payload is the sheet format (sheets.inline_components / global_price_components) which is first transformed into bid_products. Console and vendor website.
Checks, in order:
1. 3 s lock → 516 — app/controllers/api/bids_controller.rb:16
2. Stage in sheet payload not found → 4 "Request not found" (HTTP 422) — bids_controller.rb:21-22, app/controllers/concerns/trade_template_helper.rb:5555
3. Then every check of bids#update_bid (32, 580, 101, 758, 508, 875, 33, 473, 96, 372, 300, 301, 98, 217, 373, 80, 187, limits, 15) — bids_controller.rb:23
Skip: the negative-value guard (106/35/107/369) does not run for sheet_update (before_action only lists update_bid) — bids_controller.rb:15
Cites: app/controllers/api/bids_controller.rb:19-24

### Revise — update_bid_action_helper renders inside the helper (defect-shaped)
In the old revise path, when check_new_bid says no new bid is needed the helper itself renders the bid JSON and continues; the controller then renders again, which would be a double render → untyped 500 (defect-shaped) — app/controllers/concerns/bids_controller_helper.rb:166-177
Checks, in order:
1. check_new_bid returns true when delivery type, discount or freight changed, bid_products were sent, or the old bid has no other_details[:freight_charges] (symbol key on a JSON hash, likely always nil) — :917-937
(unverified: whether other_details is indifferent-access; if it is not, a new bid is always created and the double render never happens)
Cites: app/controllers/concerns/bids_controller_helper.rb:166-177, app/controllers/concerns/bids_controller_helper.rb:917-937

### bids#update_bid_status — PATCH /bids/update_bid_status/:id — reopen, reject, revoke a bid (part 1)
Console changes a bid's status directly (reopen a rejected bid = active, reject, revoke, in_active). Console-only (vendor website = 401).
Checks, in order:
1. status not one of active/rejected/revoke/in_active, or no id → 2 "Insufficient parameters" (HTTP 422) — app/controllers/api/bids_controller.rb:322-324
2. Bid not found → 32 — bids_controller.rb:325-326
3. Stage must be (status active AND running) or offline trade or draft → else 33 "Order not active" — bids_controller.rb:329-331
4. Bid already revoked → 151 "Sorry, You cannot perform this action at this time" (HTTP 403) — bids_controller.rb:334
5. active/rejected/in_active: caller must be event creator, super admin of the company, or in the broker company → 101 — app/controllers/concerns/bids_controller_helper.rb:737-740
6. revoke: config is_allowed_to_revoke_bid (default true) and caller must be the bid's own user → 101 — :741-746
Cites: app/controllers/api/bids_controller.rb:318-355

### bids#update_bid_status — PATCH /bids/update_bid_status/:id — effects (part 2)
Continuation: validate_and_update_bid_status.
Checks, in order:
1. status=active by the buyer company and the vendor is not in the stage audience (audience not "everyone") → 392 "Please add this vendor to audience to re-open bid" (HTTP 422) — app/controllers/concerns/bids_controller_helper.rb:770-773
State rules: revoke → revoke; rejected → rejected; active → requested + surrogate_bidding approval raised when the bid's user is from the buyer company and approval is required, else active; in_active only applies on a draft stage (otherwise status is left unchanged and saved) — :766-787
Side effects: all line items take the bid status; revoke marks every line's quote status revoked (later revisions of those lines get 373); rank recomputed; if save fails nothing is rendered (unverified: empty 204) — app/controllers/api/bids_controller.rb:344-354, bids_controller_helper.rb:807-815
Cites: app/controllers/concerns/bids_controller_helper.rb:762-789

### bids#reject — PATCH /bids/:id/reject — buyer rejects a vendor bid
Console rejects an active bid with remarks and optionally blocks rebidding. Console-only.
Checks, in order:
1. Bid not found → 250 "No such bid exists" (HTTP 422) — app/controllers/api/bids_controller.rb:276-277
2. Bid not active → 101 — :278
3. Stage in_active/withdrawn/cancelled → 101 — :410-412
4. Config disable_reject_bid_in_bidding_time and stage running → 686 "Bid rejection is disabled while bidding is in progress" — :413, app/models/model_helpers/trade_request_model_helper.rb:908-910
5. RFQ in a project with an auction created / proposal → 769 — :414
6. Vendor already has lines awarded in a proposal for this lot → 785 "Can not reject a bid which is selected for proposal" — :415, app/models/event_group.rb:1015-1027
7. Policy reject? (can view event AND super admin/CSM/creator/auction team) → 455 — :282, app/policies/trade_request_policy.rb:149-152
Side effects: bid, lines, mapping → rejected; remarks saved; allow_rebidding == false (JSON boolean) adds vendor to misc not_allow_rebidding_to_sellers (later bids → 101); vendor's last revised bid (same make) becomes active again — :283-304
Cites: app/controllers/api/bids_controller.rb:272-305

### bids#delete_draft_bid — PATCH /bids/delete_draft_bid/:id — vendor discards its draft
Vendor website discards its own draft bid. Vendor-only (console = 401).
Checks, in order:
1. 3 s lock → 516 — app/controllers/api/bids_controller.rb:16
2. No draft bid with this id created by the current user → 250 "No such bid exists" (HTTP 422) — bids_controller.rb:308-310
3. Column update fails → 32 with the model message (HTTP 422) — bids_controller.rb:311-315
State rules: draft → in_active via update_columns (no callbacks, no timing check; works after bid end time too) — bids_controller.rb:311
Cites: app/controllers/api/bids_controller.rb:307-316

### bids#accept_automated_knockout_offer — POST /bids/accept_knockout_offer — vendor accepts a knockout round (part 1)
Vendor website accepts the current knockout round's price; vendor-only.
Checks, in order (validate_automated_offer_acceptance):
1. Stage not active, not inside any schedule now, or auction_config not knockout → 95 "Trade Request not found" (HTTP 422) — app/controllers/concerns/bids_controller_helper.rb:819-820
2. Mobile app on an rfx-project company → 580; mobile app older than 6.3/4.5/2.3/1.8 → 217 — :821-826
3. Round accepted_round_no not active+running → 457 "No such offer exists!" — :832-833
4. Vendor not in round_participant_ids → 458 "You cannot participate in this offer !" — :836-837
5. Not first acceptance and already accepted this round → 459 "You have already accepted this offer, please wait for the next one." — :852-854
First acceptance = no fast bid yet (fast bidding stages) or never accepted any round (others) — :841-847
Cites: app/controllers/concerns/bids_controller_helper.rb:818-863

### bids#accept_automated_knockout_offer — effects (part 2)
Continuation after validation.
Side effects: first acceptance creates an active bid at the round's bulk_price via create_bid_helper (line limits apply: 38/41/...); later acceptances revise the active bid with request_source=additional_request (relaxed checks) — app/controllers/api/bids_controller.rb:208-217. Vendor added to accepted_participant_ids, push notification trade_round_acceptance_notification; if every participant accepted and more than 60 s remain, the next round is started after a random 15-60 s delay (DelayedRoundsForKnockoutWorker); vendor is added to the next round's participants — bids_controller.rb:218-232, 440-447
State rules: base-price single-line knockout puts bulk_price as the line price; otherwise only bulk_price is set — bids_controller.rb:454-466
Cites: app/controllers/api/bids_controller.rb:198-233

### bids#accept_automated_dutch_offer — POST /bids/accept_dutch_offer — vendor accepts a dutch round
Vendor website accepts the current dutch price; the bid is created and immediately awarded. Vendor-only.
Checks, in order:
1. Same as knockout acceptance (95, 580, 217, 457, 458, 459); for dutch, any second acceptance → 458 — app/controllers/concerns/bids_controller_helper.rb:818-854
2. Single-product dutch closing on multiple vendors: participant_quantity missing → 249 "Quantity Missing"; ≤ 0 → 101; below line min quantity → 246 "Quantity is less than minimum quantity" (HTTP 422) — app/controllers/api/bids_controller.rb:243-253
3. Bid creation errors (limits 38/41/..., 15) — bids_controller.rb:255-257
Side effects: bid created active at the round bulk price, then closed (selected) via close_bid_action_helper as the event creator; round acceptance recorded; push notification; on rfx-project dutch stages the bid save also ends the auction immediately — bids_controller.rb:259-269, app/models/bid.rb:516-524
Cites: app/controllers/api/bids_controller.rb:235-270

### v1 bids#update_regret_status — PATCH /v1/bids/:id/line_items/:egli_id/regret_status — regret a line item (part 1)
Vendor website marks a line item as "regret" (will not quote) or undoes it, on its draft bid. Vendor-only.
Checks, in order:
1. company_id not one of the user's companies → 101 — app/controllers/api/v1/bids_controller.rb:145
2. Draft bid not found → 32 "Bid not found" (HTTP 422) — v1/bids_controller.rb:146-147
3. action_type not regret/undo_regret → 805 "Invalid action type"; bid status invalid → 807; event line item (egli_id, encrypted) not active → 808 "Line item not found"; stage not active or not the bid's stage → 95; company not active → 130 "Company not found" — app/services/bids/line_item_regret_service.rb:95-102
4. Lot-split event and this regret would regret every line → 844 "You cannot regret all line items in a lot split event" — :115-128
5. anomaly_detected → 473; cannot bid for company → 101; sibling company → 96 — :108-112
6. Any exception: the rescue calls ServiceResult.failure with one argument (needs two) → ArgumentError → untyped 500 (defect-shaped) — :53-56, 21-23
Cites: app/services/bids/line_item_regret_service.rb:40-113

### v1 bids#update_regret_status — when a regret takes effect (part 2)
Effects of regret / undo regret.
Side effects: regret only writes bid.meta_data.regretted_eglis[egli] = {status: draft, stage_type: commercial}; response status regretted/REGRET — app/services/bids/line_item_regret_service.rb:60-72. On the next PATCH /v1/bids/:id (any save, including status=draft) the line item's participants entry for the vendor becomes "regretted" ("Regretted in Commercial"), the entry is marked processed, and the bid's lines for those items are set revised; if no line is left the bid itself becomes revised — app/helpers/api/v1/bids_controller_helper.rb:476-477, 499-528, 1101-1125. Undo regret deletes the entry and, if already processed, sets the vendor back to "participated" — line_item_regret_service.rb:73-92
State rules: a technically regretted line cannot be quoted (736) and a regretted line in a submit → 800 — v1 helper:300-301, 885-894
Cites: app/services/bids/line_item_regret_service.rb:60-93, app/helpers/api/v1/bids_controller_helper.rb:499-528

### v1 bids#update_poc_bid — PATCH /v1/bids/:id/poc_bid — accept/reject an unregistered vendor's bid
Console approves or rejects a bid placed by an unregistered vendor POC (e.g. email bid). Console-only.
Checks, in order:
1. Current user is not a buyer → 5 "Not authorized" (HTTP 422) — app/controllers/api/v1/bids_controller.rb:104
2. No active bid with that id → 70 "User does not exist" (misleading message) — v1/bids_controller.rb:106-107
3. status not approved/rejected, or bid is not an unregistered bid → 2 "Insufficient parameters" — app/services/poc_bid_action_service.rb:15-16
4. Vendor POC user not active → 70 — poc_bid_action_service.rb:18-19
No check that the bid belongs to the caller's company was found (unverified: authorization relies only on buyer?).
Side effects: approved → POC registered, meta unregistered_bid_accepted, pending count decremented, sibling records accepted, push; rejected → bid, lines and BidTrade rejected, POC deactivated if no other active bid/response — poc_bid_action_service.rb:51-109
Cites: app/controllers/api/v1/bids_controller.rb:103-111

### Email bids — POST /v1/bids/email and POST /v1/bids/email_bid_ai
Bids that arrive by email are queued; these endpoints are server-to-server (howler and clara apps, no login).
Checks, in order:
1. create_email_bid: file_s3_urls or email blank → 2 "Insufficient parameters" (HTTP 422) — app/controllers/api/v1/bids_controller.rb:93-101
2. create_email_bid_ai: no validation; queues EmailBidCreationTriggerAiWorker (Excel-like attachments trigger the Excel flow) and returns the clara chat identifier — v1/bids_controller.rb:68-91
Processing (EmailBid::Caller): attachments for different events → 103; old combined Excel → 104; no valid bid file → 101; RFP present but no technical Excel → 102; then technical submit then commercial submit in one transaction; commercial error 799 is ignored — app/services/email_bid/caller.rb:34-63
Allowed apps: config/app_auth_config.yml:2083, 2096.
Cites: app/controllers/api/v1/bids_controller.rb:68-101, app/services/email_bid/caller.rb:34-63

### Commercial bid submit — BidSubmit::CommercialBidService (email / Excel / AI)
Submits a vendor's price quote parsed from Excel/AI on the latest commercial stage, reusing the v1 draft → line items → submit chain.
Checks, in order:
1. No user / vendor company → 101 — app/services/bid_submit/commercial_bid_service.rb:31-32
2. Stage is not RFQ → 101; event not latest → 805 (yml message "Invalid action type", misleading); vendor not in audience → 806 (yml "Bid not found", misleading) — :74-77
3. is_allowed_to_create_bid rules (101/737/370/852/490/96/33/875) — :78; cannot bid for company → 806 — :81
4. Required participant global field empty → 15 "Missing required field: <name>" — :219-226, 240-245
5. Then draft (15), line items (732/508/569/736/737/limits) and submit (499/875/748/33/473/96/300/98/800/372) — :89-117
Skip: rows with blank/zero price or quantity are dropped; technical-participation checks skipped when the technical submit already succeeded — :189, 53
Side effects: currency preference saved (INR default), bid context email_submitted_bid / email_ai_submitted_bid (buyer may then edit it) — :119-157
Cites: app/services/bid_submit/commercial_bid_service.rb:30-117

### Technical bid submit — BidSubmit::TechnicalBidService (RFP answers from Excel)
Submits a vendor's technical round (RFP/RFI) answers parsed from the emailed Excel as a template response. The web technical submit lives in template_responses (not this digest).
Checks, in order:
1. Stage not RFI/RFP or vendor not allowed (validate_params_for_trade_request) → that error code, message "Invalid trade request" — app/services/bid_submit/technical_bid_service.rb:58-64
2. Vendor company and stage not running → 33 "Trade request is not running" — :79-83
3. A form question missing in the sheet, invalid radio option, bad date → 2 with a "please check the uploaded sheet" message — :151, 172, 186-189
4. revise_template_response_helper error → that code — :96-101
5. Deadlock → 15 "Bid submission encountered a conflict. Please try again."; any other error → 15 — :115-128
Side effects: draft template response → form page answers → active response; attachments only go into the "Vendor Assessment" form — :69-105, 145
Cites: app/services/bid_submit/technical_bid_service.rb:51-129

### Duplicate bid and concurrent submits (516, 34, 96, 99, 30)
How the backend stops a second bid from the same vendor.
Checks, in order:
1. Two bid writes for the same stage+company within 3 s → 516 "Transaction in Progress" (HTTP 422); key t<trade_request_id>_c<company_id> (company from the bid id, else company_id param, else workspace); lock released after the action — app/controllers/api/bids_controller.rb:621-639, app/controllers/api/v1/bids_controller.rb:161-179
2. Vendor v1 flow never creates a second active bid: PATCH on an already-active bid with status active/draft → 34 "A bid has already been placed from your team"; submitting a draft while an active bid exists revises it — v1/bids_controller.rb:45-47
3. Surrogate/template_input create when the company already has a bid → 96 (or 99 if the existing one is a surrogate bid) — app/controllers/concerns/bids_controller_helper.rb:2741-2773
4. Parent/subsidiary company already bid → 96 everywhere
Code 30 "Bid already placed for this order" is defined but never raised.
Cites: app/controllers/api/bids_controller.rb:628-634, app/controllers/concerns/bids_controller_helper.rb:2741-2773

### Bid after the bid end time (33 and its exceptions)
What happens when a vendor or buyer bids after the stage's bid end time.
Checks, in order:
1. "Running" = bid_start_time ≤ now ≤ bid_end_time, OR inside the participant review time window. Bid end time = rfq schedule end (rfqing), max of auction/dynamic extra/sealbid extension ends (auctioning), bidding_time end (RFI/RFP) — app/models/trade_request.rb:1191-1194, 828-838
2. Outside it, vendor create/submit/revise → 33 "Order not active" (HTTP 422) — app/helpers/api/v1/bids_controller_helper.rb:71-73, 561-572; app/controllers/concerns/bids_controller_helper.rb:67-85; app/controllers/api/bids_controller.rb:50
Exceptions: counter-offer modification (config counter_offer_modification_enabled) inside extra closing (evaluation) time on a requested bid; pending bid justification; buyer edit during extra closing time; surrogate bid while upcoming, or after end with config is_allowed_to_add_surrogate_bid_post_expiry; update_bid_status on offline/draft stages — app/models/model_helpers/trade_request_model_helper.rb:1165-1167, app/models/trade_request.rb:954-967
Cites: app/models/trade_request.rb:1191-1200

### Bid on a closed / withdrawn / cancelled stage or an old event version
How stage status affects bidding.
Checks, in order:
1. template_input/surrogate create: stage status not active/draft (closed, withdrawn, cancelled, in_active) → 95 "Trade Request not found" (HTTP 422) — app/controllers/concerns/trade_controller_helper.rb:6507-6514, app/models/trade_request.rb:173
2. v1 create / create_bid_products / update: event version superseded (event_group not latest) → 101 — app/controllers/api/v1/bids_controller.rb:18, 50, 124
3. v1 vendor flow does not check stage status, only the time window (unverified: whether withdraw/close also ends the schedule so the 33 check catches it)
4. Reject on a withdrawn/cancelled/in_active stage → 101 — app/controllers/api/bids_controller.rb:410-412
5. update_bid_status on a closed stage → 33 — bids_controller.rb:329-331
6. Knockout/dutch acceptance needs stage active and inside a schedule → 95 — app/controllers/concerns/bids_controller_helper.rb:819-820
Cites: app/controllers/concerns/trade_controller_helper.rb:6507-6517, app/models/model_helpers/trade_request_model_helper.rb:1434-1444

### Bid from a vendor that is not invited
How audience (invited vendors) is enforced on bids.
Checks, in order:
1. v1 create (vendor website): company not in audience (restricted: visible audiences; except_for: all dealing vendors minus hidden ones; everyone: creator company's dealing vendors), and not a broker linked to an invited company → 782 "Bid could not be placed. Please refresh and try again." (HTTP 422) — app/controllers/api/v1/bids_controller.rb:20, app/controllers/concerns/bids_controller_helper.rb:17-35
2. Email/Excel commercial submit → 806 — app/services/bid_submit/commercial_bid_service.rb:77
3. Reopening a bid (update_bid_status active) for a vendor not in the audience → 392 — app/controllers/concerns/bids_controller_helper.rb:772-773
4. Knockout/dutch: vendor must be a visible audience AND a round participant → 458 — :829-837
5. template_input / revise: only can_place_bid_for_company (own company, or buyer's dealing vendor/subsidiary, or broker mapping) → 101; no audience check found (unverified gap) — app/models/user.rb:678-691
Cites: app/controllers/concerns/bids_controller_helper.rb:17-31

### Anomaly (suspicious price) checks — currently disabled
Price-anomaly validation of a quote against reference price / previous average price.
Checks, in order:
1. CreateBidAnomalyValidator#validate and ReviseBidAnomalyValidator#validate start with a bare `return`, so they always return nil and never refuse — app/services/anomaly_bid_detector/create_bid_anomaly_validator.rb:22-23, app/services/anomaly_bid_detector/revise_bid_anomaly_validator.rb:25-26
2. Hence 'anomaly_bid_detected' "Quote seems wrong. Please check once!" (HTTP 422; message would be "Total Amount Quoted seems wrong, please check once!") is unreachable from template_input and revise — app/controllers/api/bids_controller.rb:60-61, 488-501, app/controllers/concerns/bids_controller_helper.rb:426-437
3. Bid#anomaly_detector is defined but not wired as a callback — app/models/bid.rb:206-215
4. A bid already in status anomaly_detected still blocks revise/line items/regret → 473 "You cannot revise the bid, Please resolve the error prices first" — bids_controller_helper.rb:91
Cites: app/services/anomaly_bid_detector/create_bid_anomaly_validator.rb:19-45

### bids#get_suspicious_bids_detail — GET /bids/get_suspicious_bids_detail — same-IP vendors
Console lists vendors whose bids came from the same IP address on a stage.
Checks, in order:
1. Stage not found → 95 "Trade Request not found" (HTTP 422) — app/controllers/api/bids_controller.rb:390-391
2. Cannot view the event → 455 — :392, app/policies/trade_request_policy.rb:168-170
3. Config is_suspicious_bid_indicator_enabled off, or vendor names masked for the user, or event read_only_mode (non super admin) → 101 — :393, app/models/model_helpers/trade_request_model_helper.rb:81-88
Side effects: none; data comes from a 24 h cache filled on each active/requested bid save, excluding surrogate and broker bids — app/models/bid.rb:2302-2312
Cites: app/controllers/api/bids_controller.rb:389-406

### Bid ranks — dense rank, ties at the best price shift everyone
How L1/L2... ranks are computed from event scores.
Checks, in order:
1. Scores = each participant's 'rank' score in trade_request.event_score_for_participants (loading factor added if enabled); sorted ascending (reverse for sell/forward orders), de-duplicated → dense rank (equal scores share a rank, next distinct score is +1) — app/models/concerns/bid_rank_helper.rb:193-221, app/services/event_indicators/concerns/rank_calculator.rb:8-31
2. If more than one participant is tied at the best score, EVERY rank is shifted +1: tied leaders are both L2, the next is L3 (nobody is L1) — bid_rank_helper.rb:215-218, rank_calculator.rb:26-29
3. Old events without event scores read trade_request.auction_rank_hash — bid_rank_helper.rb:194-199
4. Only active/selected/requested bids are ranked — app/models/concerns/bid_rank_helper.rb:14
Example: scores 100, 100, 120 → ranks 2, 2, 3.
Cites: app/models/concerns/bid_rank_helper.rb:208-221

### Bid ranks — what score is ranked
The rank score of a bid (get_score_for_rank).
State rules: knockout/dutch → bulk_price (or the buyer ranking widget value on rfx-project stages with separate buyer ranking); single-product → per-unit landed cost, or the configured ranking widget (gross_total, a global price component, or an inline widget), or base price when ranking_on_base_price; multi-product → effective gross total (auto CD) / landed_cost_without_tax / a global component / gross_total; weighted events apply weights — app/models/concerns/bid_rank_helper.rb:65-138
Rounding: currency precision for multi-currency stages, else widget precision — :149-177
Separate buyer ranking (config buyer_ranking_widget*) adds a buyer_rank score — :179-191, app/models/model_helpers/trade_request_model_helper.rb:1241-1243
Cites: app/models/concerns/bid_rank_helper.rb:65-97

### Last-minute bid → auction end time extension (BidTrade callback)
A bid saved in the last minute can push the bid end time out.
Checks, in order:
1. After a bid-trade mapping save (not revised): bid active, stage not RFQ, not dynamic closing, bid end time within the next 1 minute, config update_trade_end_time on, and the bid's rank changed to ≤ config rank_for_update_trade_end_time (default 1) (price_based strategy uses trigger_dynamic_time_on_price?) → schedule end +3 min (default) — app/models/bid_trade.rb:38, 45-58, 118-129
2. Rejected/revoked L1 bid in the last 3 minutes also extends — :145-157
Side effects: schedule end_time moved, trade closed_at moved, all bids' end_time updated, last-minute notification (not for sealed bids) — app/controllers/concerns/bids_controller_helper.rb:381-408
Note: update_dynamic_trade_end_time (dynamic closing) is defined but not registered as a callback, and its rank_based branch always returns false — bid_trade.rb:131-143, 60-76
Cites: app/models/bid_trade.rb:118-157

### bids — other actions (one line each)
- bids#index GET /bids — super admin / Procol employee only (101); vendor_ids filter required (5) — app/controllers/api/bids_controller.rb:133-145
- bids#show GET /bids/:id — 32 if missing or not viewable; 455 if the stage's show? policy fails; returns the template view for sheet events — bids_controller.rb:147-196
- bids#get_bid_details GET /bids/get_bid_details — needs user_id, company_id, trade_request_id (2); stage active/closed (4); super admin or creator (101); if that vendor has no active/selected bid it raises on bid.id → untyped 500 (defect-shaped) — bids_controller.rb:357-387
- bids#edit_bid PATCH /bids/:id and bids#get_approvals GET /bids/:id/get_approvals are routed and allowed for the console but have no action method in Api::BidsController (unverified response: Rails ActionNotFound, typically 404) — config/routes.rb:309, 319
- v1 bids#create_email_bid / create_email_bid_ai — see "Email bids"

## Error codes in this area

### Error codes — access, params, lookup
- app_error_auth_failed (HTTP 401) "This app is not authorized to use this API" — wrong app (api_auth.rb:87-95); staggered line bid from mobile (api/v1/bids_controller_helper.rb:976)
- 2 (HTTP 422) "Insufficient parameters" — v1 create (v1/bids_controller.rb:16), update_bid_status (bids_controller.rb:323), email bid (v1/bids_controller.rb:97), poc_bid (poc_bid_action_service.rb:15)
- 4 (HTTP 422) "Request not found" — sheet transform (trade_template_helper.rb:5555), get_bid_details (bids_controller.rb:366)
- 5 (HTTP 422) "Not authorized" — poc_bid non-buyer (v1/bids_controller.rb:104), surrogate withdraw (api/v1/bids_controller_helper.rb:1037)
- 32 (HTTP 422) "Bid not found" — v1 update (v1/bids_controller.rb:44), revise (bids_controller.rb:111), update_bid_status (:326), show (:153)
- 95 (HTTP 422) "Trade Request not found" — template_input (trade_controller_helper.rb:6513), knockout/dutch (bids_controller_helper.rb:820), regret (line_item_regret_service.rb:100)
- 250 (HTTP 422) "No such bid exists" — reject (bids_controller.rb:277), delete_draft_bid (:310)
- 455 (HTTP 422) "You are not authorized to perform this action" — Pundit refusal (api_auth.rb:117-118)

### Error codes — eligibility and permissions
- 10 (HTTP 422) "You are not allowed to use this functionality" — surrogate disabled by config (bids_controller_helper.rb:2135)
- 101 (HTTP 422) "You are not allowed to perform this action" — rebidding blocked, cannot bid for company, old event version, reject on non-active bid (bids_controller.rb:44, 51, 278; v1/bids_controller.rb:18)
- 165 (HTTP 422) "Cannot place bid on trade by your own company" — buyer not allowed to surrogate bid (bids_controller_helper.rb:2138)
- 392 (HTTP 422) "Please add this vendor to audience to re-open bid" — update_bid_status (bids_controller_helper.rb:773)
- 782 (HTTP 422) "Bid could not be placed. Please refresh and try again." — vendor not invited (v1/bids_controller.rb:20)
- 806 (HTTP 422) "Bid not found" — regret bid missing (line_item_regret_service.rb:97); commercial submit not invited (commercial_bid_service.rb:77)
- 805 (HTTP 422) "Invalid action type" — regret action_type (line_item_regret_service.rb:96); commercial submit old event (commercial_bid_service.rb:76)
- 70 (HTTP 422) "User does not exist" — poc_bid bid/POC missing (v1/bids_controller.rb:107, poc_bid_action_service.rb:19)

### Error codes — timing and stage state
- 33 (HTTP 422) "Order not active" — bid outside running window (bids_controller.rb:50; api/v1/bids_controller_helper.rb:72, 569; bids_controller_helper.rb:75), update_bid_status (bids_controller.rb:330)
- 151 (HTTP 403) "Sorry, You cannot perform this action at this time" — bid already revoked (bids_controller.rb:334)
- 508 (HTTP 422) "Not allowed to bid on this product" — staggered (bids_controller.rb:427; api/v1/bids_controller_helper.rb:980)
- 516 (HTTP 422) "Transaction in Progress" — 3 s bid lock (bids_controller.rb:631; v1/bids_controller.rb:171)
- 580 (HTTP 422) "Login to ... on your dekstop to view this event" — mobile (bids_controller.rb:115; bids_controller_helper.rb:822)
- 686 (HTTP 422) "Bid rejection is disabled while bidding is in progress" — reject (bids_controller.rb:413)
- 769 (HTTP 422) "You cannot edit rfq once the auction is created." — template_input, reject (bids_controller.rb:40, 414)
- 785 (HTTP 422) "Can not reject a bid which is selected for proposal" — reject (bids_controller.rb:415)

### Error codes — existing / duplicate bids and approvals
- 34 (HTTP 422) "A bid has already been placed from your team" — v1 update on active bid (v1/bids_controller.rb:46)
- 96 (HTTP 422) "A bid has already been placed by your team" — existing/sibling bid (bids_controller_helper.rb:2769; api/v1/bids_controller_helper.rb:68)
- 99 (HTTP 422) "A bid is already placed on behalf of this company." — surrogate exists (bids_controller_helper.rb:2763)
- 370 (HTTP 422) "You cannot place a bid after revoking the previous one" (bids_controller_helper.rb:2758; api/v1/bids_controller_helper.rb:55)
- 490 (HTTP 422) "Your current bid is awaiting approval" (api/v1/bids_controller_helper.rb:65)
- 499 (HTTP 422) "You have a counter offer pending on this bid" (api/v1/bids_controller_helper.rb:381)
- 852 (HTTP 422) "No active counter offer found to modify" (api/v1/bids_controller_helper.rb:63)
- 875 (HTTP 422) "Revise bid is locked. You cannot edit your quote after submission." (api/v1/bids_controller_helper.rb:75, 386; bids_controller_helper.rb:50)

### Error codes — price and quantity
- 35 (HTTP 422) "Quantity must be greater than zero" — negative quantity only (bids_controller.rb:548, 566)
- 38 (HTTP 422) "Price cannot be more than the allowed price" (bids_controller_helper.rb:1845)
- 39 (HTTP 422) "Quantity cannot be less than the allowed quantity" (bids_controller_helper.rb:1895)
- 41 (HTTP 422) "Price cannot be less than the allowed price" (bids_controller_helper.rb:1854)
- 42 (HTTP 422) "Quantity cannot be more than the allowed quantity" — defined, never raised
- 106 (HTTP 422) "Please enter a valid price" / 107 "Please enter valid GST" — negatives (bids_controller.rb:545, 551)
- 138 (HTTP 422) "Quantity cannot be greater than the mentioned quantity." / 139 "Quantity cannot be less than the mentioned quantity." (bids_controller_helper.rb:1903, 1907)
- 207 (HTTP 422) "Bid Quantity should be equal to the Auction Quantity" (bids_controller_helper.rb:1899)

### Error codes — price changes, ties, sheet completeness
- 98 (HTTP 422) "A bid at this price already exists, please quote a different price." — tie (bids_controller_helper.rb:144, 1956)
- 214 (HTTP 422) "Quoted price difference must be greater than the tick size" (bids_controller_helper.rb:1877, 1889)
- 300 (HTTP 422) "You cannot increase the price" — last 5 min / config (bids_controller_helper.rb:140, 2386)
- 301 (HTTP 422) "You cannot decrease the price" (bids_controller_helper.rb:2381)
- 369 (HTTP 422) "Please enter a valid discount" (bids_controller.rb:558)
- 372 (HTTP 422) "Please quote prices for all the products." (bids_controller_helper.rb:133, 570; api/v1/bids_controller_helper.rb:620, 820)
- 373 (HTTP 422) "You cannot place a quote after revoking the previous quote" (bids_controller_helper.rb:678, 698)
- 578 (HTTP 422) "Validation Failed" — custom trade validations (bids_controller_helper.rb:1912)

### Error codes — line items, technical round, regret
- 36 (HTTP 422) "Freight cannot be zero" — factory pickup (bids_controller_helper.rb:501)
- 80 (HTTP 422) "Product not found" (bids_controller_helper.rb:444, 596, 694, 794)
- 187 (HTTP 422) "City does not exist." (bids_controller_helper.rb:1001)
- 569 (HTTP 422) "Products have been updated, please refresh page" (api/v1/bids_controller_helper.rb:190; bids_controller_helper.rb:897)
- 732 (HTTP 422) "Invalid Input" — empty line items (api/v1/bids_controller_helper.rb:155)
- 736 (HTTP 422) "You have declined to provide this line item; therefore, you are not permitted to quote for it commercially" (api/v1/bids_controller_helper.rb:301)
- 737 (HTTP 422) "You cannot quote for this item because you didn't participate in the technical stage" (api/v1/bids_controller_helper.rb:315, 319)
- 748 (HTTP 422) "Please enter bid for all line items that are not regretted in technical stage." (api/v1/bids_controller_helper.rb:389)

### Error codes — regret, offers, misc
- 800 (HTTP 422) "You have regretted this line item. Reset your draft bid to continue." (api/v1/bids_controller_helper.rb:891)
- 807 (HTTP 422) "Bid status is not valid" / 808 "Line item not found" / 130 "Company not found" / 844 "You cannot regret all line items in a lot split event" (line_item_regret_service.rb:98-101, 126)
- 457 (HTTP 422) "No such offer exists!" / 458 "You cannot participate in this offer !" / 459 "You have already accepted this offer, please wait for the next one." (bids_controller_helper.rb:833, 837, 849, 853)
- 246 (HTTP 422) "Quantity is less than minimum quantity" / 249 "Quantity Missing" — dutch (bids_controller.rb:245, 251)
- 473 (HTTP 422) "You cannot revise the bid, Please resolve the error prices first" (bids_controller_helper.rb:91)
- 715 (HTTP 422) "Bid not present on this line item" — fast bid not enabled (api/v1/bids_controller_helper.rb:122)
- 758 (HTTP 422) "No changes found. Please update the template to continue." — buyer edit (bids_controller_helper.rb:2077)

### Error codes — generic and approval
- 15 (HTTP 422) "Operation failed" — save failures (bids_controller_helper.rb:625; api/v1/bids_controller_helper.rb:107)
- 217 (HTTP 422) "Update your app to perform this action." (bids_controller_helper.rb:219, 826)
- 520 (HTTP 422) "Please choose a valid currency" — template_input (trade_controller_helper.rb:6529)
- 781 (HTTP 422) "Approval flow version v2 is required" — surrogate create over-quantity (bids_controller_helper.rb:2794)
- anomaly_bid_detected (HTTP 422) "Quote seems wrong. Please check once!" — unreachable, validators disabled (bids_controller.rb:61)
