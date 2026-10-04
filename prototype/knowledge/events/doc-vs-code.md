# Product docs vs code — sourcing events (procol-backend ae36e86894, procol-client-dashboard 9776df3cd)

## Overview
Each section takes one checkable claim from the product docs and sets it against the code that decides it.
Doc paths are relative to `prototype/knowledge/` (notion/sourcing/*.md, product/06-09, prd-procol-sourcing.md); PRD
workbook cases are `test-cases/product-kb-0*.md` (ids PRD-KBSRC-nnn). Backend cites are procol-backend origin/main blobs
(`app/...`, `config/...`). Frontend cites are procol-client-dashboard working-tree files (`src/...`). Error messages come from
config/locales/en-IN.yml.
Verdicts: CONTRADICTS (doc says X, code does Y), CODE-LOOSER (the server allows what the doc forbids; often only the screen
enforces the doc), CODE-STRICTER (code adds a gate or config the doc does not mention), DOC-ONLY (no code found; the section
says where I looked), AGREES (kept only where the rule matters for tests).
Order: contradictions first, then server-looser, stricter, doc-only, agrees.
A recurring pattern: the screen enforces the documented rule and the API does not. Tests that drive the API will see the
looser behaviour.

### Lot splitting — doc says "all items start in Lot 1, max 4 lots", code builds 5 auto-classified "smart lots"
Doc: "By default, all line items are in Lot 1", "up to a maximum of 4 lots" — notion/sourcing/how-to-split-line-items-into-lots-in-an-rfq-event.md:16,21; PRD-KBSRC-069
Rules:
1. [calculation] GET lots with no manual lot config generates smart lots and saves them: items are classified, in this order, into oem_vendor_items (exactly 1 technically accepted vendor), all_technically_accepted_items, no_valid_bid_items, mixed_status_items, evaluation_pending_items — app/services/lots/lot_splitting_service.rb:23-37, 138-169
2. [state] One lot is created per type, non-empty types first, so 5 lots ("Lot 1".."Lot 5") with status draft and mode smart_lots — lot_splitting_service.rb:248-283
3. [config] The 4-lot default `get_default_lot_config` ((1..4) "Lot n") has no caller — app/models/event_group.rb:840-846
4. [visibility] The screen puts every item in the first lot only when the lot response has no item ids — src/redux/project/selectors.js:1453-1475, src/redux/project/helpers.js:136-147
5. [validation] create_new_lot has no cap on the number of lots — app/controllers/api/trade_controller.rb:1819-1835
Verdict: CONTRADICTS
Test: open Split Line Items on an RFQ with 2+ vendors and a technical stage. Count the lots and check which lot each item is in.
Cites: lot_splitting_service.rb:23-37,138-169,248-283; event_group.rb:840-846; trade_controller.rb:1819-1835

### RFQ→auction conversion — doc says Knockout/Dutch "cannot be selected during conversion", code allows them only there
Doc: Knockout and Dutch "cannot be selected during conversion" — notion/sourcing/how-do-i-convert-an-rfq-to-an-auction.md:27; PRD-KBSRC-081
Rules:
1. [config] In eRFx companies the Knockout and Dutch strategy tabs are disabled when `isErfxAllowed && !isRfqToAuction`. So they can be chosen only during conversion — src/views/eventCreation/components/auctionConfiguration/auctionConfiguration.jsx:871-892, 326-334
2. [validation] The move_to_auction API checks a knockout/dutch start price against the RFQ L1 total in rfx_project companies (965 / 966 / 968). This confirms that conversion is a supported path — app/controllers/api/trade_controller.rb:989-993
3. [state] On conversion with status active, knockout/dutch rounds are created from bid_start_time with bulk_price, price_difference and time_difference — app/services/rfq_to_auction/create_service.rb:198-210
Verdict: CONTRADICTS
Test: on an eRFx-enabled client, open Convert to Auction and check that Knockout and Dutch are selectable. On a fresh project auction, check that they are disabled.
Cites: auctionConfiguration.jsx:326-334,871-892; trade_controller.rb:989-993; create_service.rb:198-210

### Dutch auction — doc says the End Price "cannot be edited", code lets the buyer change it mid-auction
Doc: "The End Price ... cannot be edited" — notion/sourcing/how-to-run-a-dutch-auction.md:36; PRD-KBSRC-389
Rules:
1. [state] PATCH /api/trade/:id with end_price on a running dutch auction sets a new end price. The next round's price must not already pass it (buy: end_price < last round + tick → 244 "Invalid End Price", HTTP 422). A closed stage gets 151 (HTTP 403) — app/controllers/api/trade_controller.rb:876-893
2. [side-effect] Widening the end price appends rounds from the last scheduled round. Otherwise later rounds are voided and regenerated — trade_controller.rb:888-893, 940-953
3. [visibility] The live screen has an "Ending Price Updated!" edit action — src/views/orderDetails/knockoutDetails.jsx:95, 109, 443
Verdict: CONTRADICTS
Test: on a live buy dutch auction, change End Price from the Responses tab (or PATCH end_price). Expect success and regenerated future rounds.
Cites: trade_controller.rb:876-893,940-953; knockoutDetails.jsx:95,109,443

### Evaluation Time "Not Applicable" — doc says the window stays open indefinitely, code creates no evaluation window
Doc: choose "Not Applicable" to keep the evaluation window "open indefinitely (no expiry)" — notion/sourcing/how-do-i-schedule-events-and-change-event-duration.md:57; PRD-KBSRC-037
Rules:
1. [time] in_evaluation_time? is true only when an extra_closing_time exists, now <= it, and now >= max(bid end, review end). With no evaluation time it is always false — app/models/trade_request.rb:954-968
2. [visibility] The screen's status is "buffer" (evaluation) only when `extra` exists. Otherwise, after the end time the event is "expired" — src/redux/orders/selectors.js:785-808
3. [state] The features gated on the evaluation window are therefore unavailable: re-evaluation request/resolve → 101 "You are not allowed to perform this action" (app/controllers/api/v1/trade_controller.rb:1352, 1400), Unlock Bids and Request Best Offer menus (src/views/orderDetails/eventHeader/eventHeader.jsx:341-344, 400-403), counter-offer modification (app/models/model_helpers/trade_request_model_helper.rb:1165-1167)
4. [config] The "Not applicable" option is in the stage scheduler — src/views/projectCreation/components/projectScheduler/stageSchedulerCard/stageSchedulerCard.jsx:654-659 (unverified: that it sends no extra_closing_time)
Verdict: CONTRADICTS
Test: publish an RFQ with Evaluation "Not Applicable" and let it end. Request re-evaluation, unlock or best offer. Expect 101 or a hidden menu, not an open evaluation window.
Cites: trade_request.rb:954-968; selectors.js:785-808; eventHeader.jsx:341-344,400-403

### Reject Quote — doc says the quote is removed from the QCS, code brings back the vendor's previous revision
Doc: Reject Quote/Bid "remove it from the comparison view and the QCS" — notion/sourcing/how-do-you-run-an-rfq-event.md:25; how-to-run-a-rank-based-auction-event.md:35; PRD-KBSRC-047
Rules:
1. [state] bids#reject sets the bid and its lines to rejected. The vendor's latest `revised` bid (same make) is then set back to active with its lines and mappings, so the vendor stays in the QCS at its older price — app/controllers/api/bids_controller.rb:283-303
2. [permission] `allow_rebidding == false` (a JSON boolean) adds the vendor to not_allow_rebidding_to_sellers. Its later bids get 101 — bids_controller.rb:292-294, 44
3. [state] Refused when the stage is cancelled/withdrawn (101), reject is disabled during bidding (686 "Bid rejection is disabled while bidding is in progress"), the RFQ is locked (769), or the vendor is in a proposal (785) — bids_controller.rb:410-416
Verdict: CONTRADICTS
Test: a vendor bids 100, then revises to 90. The buyer rejects the 90 bid. Check whether the vendor still appears in the QCS at 100.
Cites: bids_controller.rb:272-305,410-416

### Bid isolation — PRD says a vendor never sees another vendor's bid, code ships competitors' prices and names to every vendor
Doc: "A vendor must never see another vendor's bid" — prd-procol-sourcing.md:52; rank auctions show vendors "rank, not actual prices" — notion/sourcing/how-to-choose-and-configure-auction-strategies.md:34
Rules:
1. [visibility] Every bid line writes the vendor's price into the line item's shared `meta_data.prices_hash[company_id]`, and that record is sent to every caller — app/models/bid_trade_product.rb:120-131 (BUG-60, Critical, reproduced on 12 fresh events)
2. [visibility] The event schema lists every bid of the round (all VALID_STATUSES_TO_RANK + approval_requested), with company name, company uuid, bid status, approval status and bids_count, for any viewer including vendors — app/controllers/api/v1/trade_controller.rb:349-372, app/controllers/concerns/trade_template_helper.rb:5856-5900 (BUG-63, High)
3. [visibility] The name is masked only when vendor masking applies to the caller — trade_template_helper.rb:5859-5862
Verdict: CONTRADICTS
Test: two vendors bid. As vendor A, read the raw event payload. It must contain no other company id, name or price.
Cites: bid_trade_product.rb:120-131; v1/trade_controller.rb:349-372; trade_template_helper.rb:5856-5900; docs/bugs/Procol_bugs_found_2026-10-03.xlsx BUG-60, BUG-63

### Unlock Bids timing — doc says unlock only after submission closes, the server unlocks at any time
Doc: bids "can only be unlocked after the event's submission window has closed" — notion/sourcing/how-do-i-unlock-bids.md:14; PRD-KBSRC-059
Rules:
1. [time] send_otp_for_unlocking_bids checks: read permission, finance user (10), active stage in the workspace (4), sealed (`lock_bid_by_default`, else 10), and technical evaluation done when `restrict_unlock_bid_before_evaluation` is set (790 "Bids can't be unlocked until technical evaluation is done"). It has no time check — app/controllers/api/v1/trade_controller.rb:1246-1268
2. [time] verify_otp_for_unlocking_bids has no time check either. `bid_visibility` everyone/self/none is applied at once — v1/trade_controller.rb:1270-1293, app/controllers/concerns/trade_controller_helper.rb:5633-5647
3. [visibility] The screen shows Unlock Bids only when the stage status is "buffer" (inside the evaluation window), which is stricter than the doc — src/views/orderDetails/eventHeader/eventHeader.jsx:400-403, src/redux/orders/selectors.js:799-805
4. [state] Extending the submission end re-locks bids — app/controllers/api/trade_controller.rb:678-680
Verdict: CODE-LOOSER
Test: on a sealed RFQ that is still running, call send/verify OTP with a finance user. Expect success; bids become visible during bidding.
Cites: v1/trade_controller.rb:1246-1293; trade_controller_helper.rb:5633-5647; eventHeader.jsx:400-403

### Unlock Bids two-person rule — doc says neither party can see bids alone, code lets the auction team and the finance user see them alone
Doc: "two-person authentication system ... neither party can view the bids independently"; the OTP goes out "via ... (email/SMS)" — notion/sourcing/how-do-i-unlock-bids.md:10, 24
Rules:
1. [visibility] event_masking_enabled? returns false for any auction-team member before the bid lock is checked. Auction-team users see sealed bids with no OTP — app/models/model_helpers/trade_request_model_helper.rb:258-260
2. [permission] No check that the OTP recipient (`user_id`) differs from the caller. A buyer who is also a finance user can unlock alone — v1/trade_controller.rb:1253-1255, 1286-1289
3. [validation] The OTP goes only to the finance user's email (543 "Email not present for verification" if missing). No SMS path was found — app/services/otp_service.rb:30-34 (per trade-live-v1 digest; unverified line read)
4. [visibility] Locked = buyer-company user, not RFI/RFP, `lock_bid_by_default`, and no active bid_visibility containing "everyone" or the user's id — trade_request_model_helper.rb:273-284
Verdict: CODE-LOOSER
Test: put a user in the auction team and open a sealed RFQ's QCS with no OTP. As a finance-user buyer, send the OTP to yourself and unlock.
Cites: trade_request_model_helper.rb:255-284; v1/trade_controller.rb:1246-1293

### Auction strategy — doc says it cannot change after go-live, the configuration edit rewrites it on a live stage
Doc: "You can update the strategy before publishing the event, but not after the event goes live" — notion/sourcing/how-to-choose-and-configure-auction-strategies.md:28; PRD-KBSRC-305
Rules:
1. [state] trade#update with `configurations` on an active/requested stage runs set_configurations_for_trade. It is refused only when bids exist AND bid end has passed (4 "Request not found") — app/controllers/api/trade_controller.rb:590-594, 723-741
2. [config] set_configurations_for_trade writes `auction_config = params["auction_config"]`, defaulting to "rank" when absent. A live config edit that omits auction_config therefore resets a price/traffic-light auction to rank — app/controllers/concerns/trade_controller_helper.rb:3308, 3521, 3534
3. [validation] Knockout/dutch fields are validated when switching (106/237/238/248, 241-243) — trade_controller_helper.rb:3447-3514
Verdict: CODE-LOOSER
Test: on a running price-based auction with bids, PATCH configurations with auction_config=rank (and once without it). Read auction_config back.
Cites: trade_controller.rb:590-594,723-741; trade_controller_helper.rb:3308,3521,3534

### 65 line-item limit — doc says the event allows "up to 65 line items", only the screen enforces it and it is configurable
Doc: "There is a limit of up to 65 line items" — notion/sourcing/how-to-create-a-single-stage-event-rfp-rfq-auction.md:47; how-to-set-up-an-rfq-request-for-quotation.md:31; how-to-set-up-a-reverse-auction.md:46; PRD-KBSRC-004
Rules:
1. [config] The limit is company custom config `allowed_maximum_line_items` {boq, non_boq}. Defaults when unset: non-BOQ 65, BOQ 500 — app/controllers/api/v1/users_controller.rb:593; src/redux/user/selectors.js:346-360
2. [validation] The screen refuses Next with "You can have at max N line-items in an event" when rows − 1 > N. It is skipped for one hard-coded company uuid ("cFpjWmQ=") and for basket auctions — src/views/createOrder/createOrder.jsx:1288-1298
3. [validation] No server count check was found; the key is only echoed by users_controller — users_controller.rb:593 (git grep `allowed_maximum_line_items` gives no other hit)
Verdict: CODE-LOOSER
Test: POST a stage with 66 (and 501 BOQ) line items through the API. Expect it accepted. On the screen, expect the error at 66.
Cites: users_controller.rb:593; selectors.js:346-360; createOrder.jsx:1288-1298

### Lot publishing time — doc says "only during the evaluation stage", the server refuses only while bidding is running
Doc: "You can only publish lots during the evaluation stage of the RFQ" — notion/sourcing/how-to-split-line-items-into-lots-in-an-rfq-event.md:26; PRD-KBSRC-070
Rules:
1. [time] create_new_lot refuses with 740 "RFQ event cannot be converted to lots as it is still live." only when `live?` = running (start <= now <= end, or in the review window) — app/controllers/api/trade_controller.rb:1824; app/models/trade_request.rb:1191-1195
2. [time] An upcoming RFQ (not started) and an RFQ whose evaluation window has ended both pass the time gate — trade_request.rb:1191-1195
3. [state] Other refusals: 769 (auction or proposal exists), 739 "A lot for one or more items already exists." (item already in an active lot, or the RFQ is itself a lot) — trade_controller.rb:1825-1829
4. [visibility] The screen's Split menu is disabled only when the stage is closed, the version is old or the project is on hold. It has no time gate — src/views/orderDetails/eventHeader/eventHeader.jsx:355-360, 622-633
Verdict: CODE-LOOSER
Test: create lots on an RFQ scheduled for tomorrow, and on one whose evaluation window has ended. Expect both to succeed.
Cites: trade_controller.rb:1819-1835; trade_request.rb:1191-1195; eventHeader.jsx:355-360,622-633

### Technical evaluation remarks — doc says remarks are mandatory, the server requires one only for score 0
Doc: "Remarks are mandatory when submitting an evaluation" — notion/sourcing/how-do-i-evaluate-a-technical-stage.md:41; PRD-KBSRC-409
Rules:
1. [validation] POST /api/evaluations needs `form.remark` only when `form.score` is 0 (TNA in the default map); otherwise → 2 "Insufficient parameters". Vendor-onboarding v2 is exempt — app/services/evaluations/validate_service.rb:61-69
2. [validation] The screen opens a remark modal for every score and refuses an empty remark ("Please enter a valid remark"), but a whitespace-only remark passes (`!scoreRemark && ...trim()`) — src/components/dataGrid/formatters/cellEvaluationFormatter.jsx:74-77, 99-101
Verdict: CODE-LOOSER
Test: POST /api/evaluations with score T1 (non-zero) and no remark. Expect 200. Then score 0 with no remark: expect code 2.
Cites: validate_service.rb:61-69; cellEvaluationFormatter.jsx:74-101

### When evaluators can score — doc says "Send to Evaluation" gives access, the server only needs bidding to have ended
Doc: "Send to Evaluation ... gives access to the technical evaluator"; it "triggers the start of the Evaluation time" — notion/sourcing/how-to-run-a-technical-stage-event.md:27-31; PRD-KBSRC-400
Rules:
1. [time] evaluations#create and #submit need an active RFI/RFP with bid_end_time <= now (else 33 "Order not active"). They do not check that the evaluation window has started, been triggered, or not yet ended — app/controllers/api/evaluations_controller.rb:13-26, 40-44
2. [config] "Send to Evaluation" exists only with company custom config `send_rfp_to_evaluation_manually` and a user in purchase/customer_success mode. It needs an expired stage and no evaluation window yet — app/models/model_helpers/trade_request_model_helper.rb:1169-1189; app/controllers/concerns/trade_controller_helper.rb:3392
3. [time] Without that config the evaluation window starts automatically at bid end — trade_request_model_helper.rb:1184-1189 (window is created at stage creation, per trade-stages digest)
Verdict: CODE-LOOSER
Test: on a send-to-evaluation RFP that has ended but not been sent, POST /api/evaluations as the evaluator. Expect success.
Cites: evaluations_controller.rb:13-44; trade_request_model_helper.rb:1169-1189

### Re-evaluation reasons — doc says the buyer's reason and the evaluator's rejection reason are mandatory, the server checks neither
Doc: the reason "is mandatory"; "Enter a mandatory rejection reason" — notion/sourcing/how-do-i-request-for-revaluation.md:23; how-do-re-evaluate-line-items-in-technical-stage.md:46; PRD-KBSRC-422, -427
Rules:
1. [validation] request_tr_reevaluation passes `params[:remarks]` straight through. No presence check — app/controllers/api/v1/trade_controller.rb:1346-1391; app/helpers/api/additional_requests_helper.rb:550-555
2. [validation] resolve_tr_reevaluation_request validates only `request_action` in accept/reject (2). Remarks are optional — v1/trade_controller.rb:1402-1406; app/helpers/additional_request_resolution_helper.rb:1145-1162
3. [time] Both are refused outside the evaluation window → 101 (AGREES with "only in Evaluation Time") — v1/trade_controller.rb:1352, 1400
4. [permission] Any workspace user with trade read may request it. The doc's Buyer/Owner persona is not enforced — v1/trade_controller.rb:1348
Verdict: CODE-LOOSER
Test: PATCH request_tr_reevaluation with valid form_ids and no remarks, then resolve with reject and no remarks. Expect 200 both times.
Cites: v1/trade_controller.rb:1346-1410; additional_request_resolution_helper.rb:1145-1162

### Request for Best Offer timing — doc says only in the Evaluation stage, the server accepts it at any time
Doc: "Ensure the RFQ event is in the Evaluation stage"; "Once Evaluation time has started you can request" — notion/sourcing/how-do-i-use-request-for-best-offer.md:14; how-do-you-run-an-rfq-event.md:59; PRD-KBSRC-067
Rules:
1. [time] trade#update with end_time_type checks only that the type is valid (2) and that no proposal is submitted (801). It has no stage, time or bid-exists check — app/controllers/api/trade_controller.rb:438-448
2. [time] If bidding is still running, the best-offer review window is created to start at bid end. It is not refused — app/controllers/concerns/trade_controller_helper.rb:5855-5866
3. [visibility] The screen offers it only in buffer/response_review, for RFQs (or auctions with allowBestOfferOnAuction), and only when bids exist — src/views/orderDetails/eventHeader/eventHeader.jsx:341-344
4. [config] `end_time_applicable_vendor_ids` limits it to selected vendors (AGREES "select vendors") — trade_controller.rb:447, 579-581
Verdict: CODE-LOOSER
Test: PATCH end_time_type=request_for_best_price on a running RFQ with no bids. Expect 200 and a review window starting at bid end.
Cites: trade_controller.rb:438-448,579-581; trade_controller_helper.rb:5843-5869; eventHeader.jsx:341-344

### View-Only Mode — doc says it blocks counter offers, quote edits and surrogate bids, the server enforces none of them
Doc: "Enable View-Only Mode to restrict users from sending counter offers, editing quotes, or placing surrogate bids" — notion/sourcing/how-do-you-run-an-rfq-event.md:46; how-to-run-a-rank-based-auction-event.md:67; PRD-KBSRC-054
Rules:
1. [config] `read_only_mode_enabled` can be set only when `read_only_mode_allowed`. It is written by trade#update — app/controllers/api/trade_controller.rb:486-488; app/models/model_helpers/trade_request_model_helper.rb:899-906
2. [visibility] Its only backend uses are serializer flags (`read_only_mode` true for non-super-admins; the toggle is shown only to super admins) and hiding suspicious bids — app/serializers/trade_template_serializer.rb:120-121, 828-835; trade_request_model_helper.rb:84-86
3. [permission] Counter-offer create, surrogate bid create and buyer edit do not read it — app/helpers/api/additional_requests_helper.rb:155-172, 954-965; app/controllers/api/bids_controller.rb:40-85; app/controllers/concerns/bids_controller_helper.rb:2051-2060
Verdict: CODE-LOOSER
Test: enable read-only mode, then as a non-super-admin buyer call raise_additional_request (counter offer) and POST /bids/template_input (surrogate). Expect success.
Cites: trade_controller.rb:486-488; trade_template_serializer.rb:120-121,828-835; additional_requests_helper.rb:155-172

### Mandatory T&C acceptance — doc says vendors must accept before bidding, the server does not check acceptance on any bid path
Doc: "mark all T&Cs as mandatory, requiring vendors to accept them before submitting bids" — notion/sourcing/how-to-add-terms-and-conditions-for-my-vendors-in-my-events.md:35; PRD-KBSRC-030
Rules:
1. [config] `is_tnc_mandatory` is stored from params, and effective_tnc_mode returns "required" for every clause when it is on — app/controllers/concerns/trade_controller_helper.rb:3391; app/models/trade_request.rb:993-1003
2. [side-effect] Acceptance is recorded per vendor company by PATCH accept_auction_tnc into misc.tnc_popup_acceptances — app/controllers/api/v1/trade_controller.rb:915; trade_request.rb:3048-3058
3. [visibility] `tnc_popup_accepted?` is read only by serializers. No "tnc" check exists in bids_controller.rb, v1/bids_controller.rb or the v1 bids helper — app/serializers/trade_template_serializer.rb:311-312; trade_request.rb:3060-3063 (unverified: the vendor website, not in these repos, may gate it)
Verdict: CODE-LOOSER
Test: with mandatory T&Cs, as a vendor that has not called accept_auction_tnc, create and submit a bid via /v1/bids. Expect success.
Cites: trade_request.rb:993-1003,3048-3063; trade_controller_helper.rb:3391

### Surrogate bids and "lock vendor addition" — doc implies invited participants and a locked bidder set, the surrogate path checks neither
Doc: surrogate starts from "the Participants section"; "lock the bidder set" — notion/sourcing/surrogate-bidding-how-to-place-bids-on-behalf-of-vendors.md:19-25; product/06-sourcing-events-rfx.md:213-218
Rules:
1. [permission] Surrogate allowed: buyer company, config `is_buyer_not_allowed_to_add_surrogate_bid` not true (else 10), and the user is a super admin, the event owner or in a valid bidding team (else 165 "Cannot place bid on trade by your own company") — app/controllers/concerns/bids_controller_helper.rb:2130-2141
2. [permission] The vendor only has to be a dealing vendor or subsidiary of the workspace (`can_place_bid_for_company`). There is no audience (invited) check on POST /bids/template_input — app/models/user.rb:678-691; app/controllers/api/bids_controller.rb:40-85
3. [time] Surrogate is allowed while upcoming or running, and after the end only with `is_allowed_to_add_surrogate_bid_post_expiry` (else 33) — bids_controller.rb:50
4. [config] Lock vendor addition = config `is_user_allowed_to_modify_audience` false → add_audience gives 685 "You are not allowed to update the audience". Super admins bypass it, and an unset key allows changes — app/models/model_helpers/trade_request_model_helper.rb:936-941; app/controllers/api/v1/trade_controller.rb:37
Verdict: CODE-LOOSER
Test: lock the audience, then place a surrogate bid for a dealing vendor that is not invited. Expect the bid to be created.
Cites: bids_controller_helper.rb:2130-2141; user.rb:678-691; bids_controller.rb:40-85; trade_request_model_helper.rb:936-941

### Stage combinations — doc says "RFQ and Auction cannot be created together, 2 stages max", the stage-create API checks only same-type duplicates
Doc: "you cannot create an RFQ and Auction together ... You can only have 2 stages at max during creation" — notion/sourcing/how-to-create-a-sourcing-project-technical-stage-rfq-auction.md:29
Rules:
1. [validation] Adding a stage to a project compares only stages with the same rfx_mode. Draft project: 854, or the older one is silently voided. Live project: 830 "Same type of event already exists for this Project." — app/controllers/concerns/trade_controller_helper.rb:3663-3667
2. [validation] There is no check for an rfq + auction mix and no stage-count limit in that path — trade_controller_helper.rb:3645-3669
3. [config] Stages routed to an auction team are ignored in the duplicate check — trade_controller_helper.rb:3671-3676
Verdict: CODE-LOOSER
Test: on a draft project with an RFQ, POST /trade/template_input with rfx_mode=auction and the event_group_id. Expect it accepted.
Cites: trade_controller_helper.rb:3645-3677

### Multi-currency rates — doc says rates are "locked at publish", the buyer can change them until the first bid
Doc: "vendors bid in their own currency with rates locked at publish" — product/06-sourcing-events-rfx.md:106-108
Rules:
1. [state] PATCH /api/v1/trade/:id/currency_exchange_rates works on an active (published) stage and is refused only once an active/requested bid exists → 877 "Exchange rates cannot be updated after bids have been placed." — app/controllers/api/v1/trade_controller.rb:1466-1473
2. [validation] Each code must be an allowed non-base currency (else 2) and the rate must be > 0 (878) — v1/trade_controller.rb:1475-1488
3. [side-effect] rate_in_base is overwritten and the save result is not checked — v1/trade_controller.rb:1490-1495
Verdict: CODE-LOOSER
Test: publish a multi-currency RFQ, change a rate before any bid (expect 200), then after a bid (expect 877).
Cites: v1/trade_controller.rb:1466-1496

### Auction time controls — doc says extend/shorten/end log a reason, the server requires and keeps one only for force-end
Doc: "extend, shorten, or end submission, logging a reason"; "Reason logged" — product/09-reverse-auction.md:77-80
Rules:
1. [validation] Force end requires remarks → 783 "Missing Remarks" (HTTP 422) and needs company setting trade_force_close — app/controllers/concerns/trade_controller_helper.rb:5903-5930
2. [side-effect] For an extension (increase_auction_time), `remarks` goes to update_remarks, which saves a Remark only when end_time_for is request_for_best_price. Extension reasons are silently dropped — app/controllers/api/trade_controller.rb:664; trade_controller_helper.rb:2059-2071
3. [time] No check that the new end is in the future, so a "shorten" to a past time ends bidding at once. Reopening an expired RFQ/auction → 496 unless allowed. Knockout/dutch in rfx companies → 969 — app/controllers/api/trade_controller.rb:642-692
Verdict: CODE-LOOSER
Test: extend a live auction with remarks "x". Check that no remark row is stored. Force-end without remarks: expect 783.
Cites: trade_controller.rb:642-692; trade_controller_helper.rb:2059-2071,5903-5930

### Over-ordering — doc says awards above the requested quantity stay "within a configured tolerance", in some configs the server has no ceiling
Doc: "awards above the requested quantity within a configured tolerance" — product/06-sourcing-events-rfx.md:156-161
Rules:
1. [calculation] `is_over_awarding_allowed` on and the line linked to a PR: ceiling = max(line qty, PR open qty × (1 + over_quantity_tolerance_percentage/100) − qty in other events). Above it → 561 "You cannot select bid with more than requested quantity." — app/helpers/api/proposal_helper.rb:811-833
2. [validation] Over-awarding on and no PR link → no check at all (unlimited) — proposal_helper.rb:834-835
3. [validation] awarded_quantity sent with neither `is_over_awarding_allowed` nor `is_partial_awarding_enabled` → no check — proposal_helper.rb:822-838
4. [validation] Partial awarding on: already awarded + qty > line qty → 561 — proposal_helper.rb:836-837
Verdict: CODE-LOOSER
Test: with over-awarding on, award 10× the quantity on a non-PR line via add_response. Expect it accepted.
Cites: proposal_helper.rb:811-844

### Award timing — doc says award after negotiations end, the server allows a proposal while bidding is open
Doc: "After negotiations are complete in RFQ or auction stages, buyers can proceed to award" — notion/sourcing/how-to-award-vendors-and-submit-proposal-for-approval.md:6
Rules:
1. [time] proposal#create is refused for time reasons only when the latest commercial stage has `is_order_allowed_to_close_in_extra_closing_time_only` and is not in its evaluation window → 720 "You are not allowed to award in bidding time" — app/controllers/concerns/event_group_controller_helper.rb:629-648; app/helpers/api/proposal_helper.rb:21-31
2. [state] One requested/selected proposal per event/lot (573 "The proposal has already been submitted") — proposal_helper.rb:22-24
3. [side-effect] Submitting into an approval flow revokes pending counter offers and expires the latest commercial stage's submission time — proposal_helper.rb:169-183
Verdict: CODE-LOOSER
Test: on a running RFQ with bids and no flag, POST /api/proposal. Expect a draft proposal. Submit it and check that bidding ends.
Cites: event_group_controller_helper.rb:629-648; proposal_helper.rb:21-31,169-183

### TNA and regret gating — doc says technically rejected and regretted vendors are barred from those lines, the server bars only regretted lines
Doc: "Technically-rejected and regretted vendors are gated out of bidding the relevant lines" — product/09-reverse-auction.md:26-31; line regret "barring commercial quoting" — product/07-rfp-technical.md:84-89
Rules:
1. [validation] A line the vendor regretted in the technical stage cannot be quoted → 736 "You have declined to provide this line item; therefore, you are not permitted to quote for it commercially" — app/helpers/api/v1/bids_controller_helper.rb:299-301
2. [validation] No TNA check when adding a line. TNA lines are only excluded from the "quote every line" rule (748) — v1 bids_controller_helper.rb:289-311, 1011
3. [side-effect] On RFQ→auction, vendors whose every line is TNA are dropped from the audience unless `allow_tna_vendors_to_bid` is true. A vendor that is TNA on some lines can still bid on them — app/services/rfq_to_auction/create_service.rb:18, 134-141
4. [config] Awarding a TNA/Regret vendor is blocked (1134-1137) only with company config `restrict_awarding_for_tna_vendors` — app/helpers/api/proposal_helper.rb:18 (per evaluation-award digest :1244-1280)
Verdict: CODE-LOOSER
Test: a vendor is TNA on line 1 only. In the RFQ, quote line 1. Expect it accepted (no 736).
Cites: v1 bids_controller_helper.rb:289-320,1011; create_service.rb:134-141

### Skip Vendor Review after lot split — doc says a reason must be entered, the server does not require one
Doc: "Enter a valid reason for skipping vendor review" — notion/sourcing/how-to-skip-vendor-review-in-lot-splitting.md:21
Rules:
1. [permission] The buyer resolves the vendor's bid_justification request. It is allowed when the request's requesting company is in the caller's companies or the caller owns the project (else 5 "Not authorized") — app/controllers/api/additional_requests_controller.rb:163-167
2. [validation] resolve_additional_request_for_bid_justification uses `resolution_remarks` only as stored text. No presence check — app/helpers/additional_request_resolution_helper.rb:750-774; additional_requests_controller.rb:60-76
3. [side-effect] The bid is revised through the additional-request path (lighter checks) and labelled buyer_edit — additional_request_resolution_helper.rb:754-764
Verdict: CODE-LOOSER
Test: PATCH resolve_additional_request with item_type=bid_justification and no resolution_remarks. Expect success.
Cites: additional_requests_controller.rb:60-91,145-171; additional_request_resolution_helper.rb:750-774

### Positive quantities — PRD says quantities must be positive, a negative line quantity is accepted at stage creation
Doc: "Quantities must be positive numbers" — prd-procol-sourcing.md:40
Rules:
1. [validation] Stage line items refuse only a blank or zero quantity → 35 "Quantity must be greater than zero" (unless rate-only or config `allow_quantity_less_auction`). A negative value is not refused — app/controllers/concerns/trade_controller_helper.rb:1826-1832, 3184-3186
2. [validation] No negative guard runs before template_input (before_actions only check licence etc.) — app/controllers/api/trade_controller.rb:19-26
3. [validation] Bids do have negative guards (106/35/107/369 via filter_invalid_params, update_bid only) — app/controllers/api/bids_controller.rb:15 (unverified, from the bids digest)
Verdict: CODE-LOOSER
Test: POST /trade/template_input with quantity −5. Expect the stage to be created (unverified: whether a later DB constraint rejects it).
Cites: trade_controller_helper.rb:1826-1834,3184-3186

### RFQ→auction locks — doc says template, products and quantities cannot change and only RFQ bidders are enrolled, the server takes all of them from the request
Doc: "You cannot modify the products or quantities"; "Vendors who submitted bids in the RFQ will be automatically enrolled" — notion/sourcing/how-do-i-convert-an-rfq-to-an-auction.md:22-25, 37
Rules:
1. [validation] Auction line items come from `params["trade_products"]`. move_to_auction does not compare them with the RFQ's items or quantities — app/controllers/concerns/trade_controller_helper.rb:772-797 (:794); app/services/rfq_to_auction/create_service.rb:162-165
2. [state] The audience is `audience_company_ids` from the request (all-TNA vendors dropped by default). RFQ bids are copied as active auction bids only when `use_rfq_quotes_as_bids` is true and the auction is not a draft — create_service.rb:82, 134-145, 168-186
3. [time] The RFQ need not have ended. Conversion cuts every future RFQ window to now and sets is_rfq_converted_to_auction — create_service.rb:212-217
4. [state] A second conversion → 94 "An auction has already been made for this event."; an RFQ already auctioning → 93 — app/controllers/api/trade_controller.rb:973, 979
Verdict: CODE-LOOSER
Test: POST move_to_auction on a running RFQ with a changed quantity and an extra vendor. Expect success, the RFQ closed now, and the new quantity.
Cites: create_service.rb:82,134-186,212-217; trade_controller.rb:963-1012

### "Show Rank" in a Price-Based auction — doc frames it as the buyer seeing ranks, the flag shows ranks to vendors too
Doc: "If you want to see Rank as well in a price based Auction ... You can now see the Ranks" — notion/sourcing/how-to-run-a-price-based-auction.md:25-30; PRD-KBSRC-372
Rules:
1. [visibility] `other_auction_indicators_config.rank = true` makes should_show_rank? true for the whole stage (any auction_config). The same flag drives the vendor's bid layer rank — app/models/trade_request.rb:654-670; app/controllers/concerns/trade_template_helper.rb:2782
2. [visibility] Vendors see position indicators only after the start. The buyer always sees them — trade_template_helper.rb:2084
3. [visibility] Knockout (and dutch in rfx companies): only the buyer sees rank — trade_request.rb:658-662
Verdict: CODE-LOOSER
Test: turn Show Rank on in a live price-based auction and open the vendor view. Expect the rank to appear.
Cites: trade_request.rb:654-670; trade_template_helper.rb:2084,2782

### Show Best Price — doc says the best price is visible to participating vendors, the server shows it only to vendors that have bid
Doc: "This column is visible to both buyers and participating vendors" — notion/sourcing/how-to-enable-show-best-price.md:19; PRD-KBSRC-342, -656
Rules:
1. [visibility] Best price is required when `other_auction_indicators_config.best_price` is true, for price / rank_and_price auctions, or for line-item rank events with show-best-price-in-all-events — app/models/trade_request.rb:686-707
2. [visibility] In the bid layer, show_best_prices also needs the caller's company to have placed a bid (`bid_placed?`), enough revisions, and no hidden indicators — app/controllers/concerns/trade_template_helper.rb:2775-2779; trade_request.rb:2479-2482
3. [visibility] An invited vendor that has not bid gets no best price (unverified for the buyer's QCS path)
Verdict: CODE-STRICTER
Test: with Show Best Prices on, open the event as an invited vendor that has not bid (expect no best price), then after its first bid (expect it shown).
Cites: trade_request.rb:686-707,2479-2482; trade_template_helper.rb:2775-2779

### Modify a counter offer — doc presents it as always available, the server needs a config and the evaluation window
Doc: vendors "can choose to accept, reject, or modify" a counter offer — notion/sourcing/how-do-i-modify-counter-offers-as-a-vendor.md:6, 23; how-to-send-and-manage-counter-offers.md:56; PRD-KBSRC-621
Rules:
1. [config] Modification applies only when stage config `counter_offer_modification_enabled` == true AND the stage is in its evaluation (extra closing) window — app/models/model_helpers/trade_request_model_helper.rb:1108-1110, 1165-1167
2. [state] A vendor with a requested bid otherwise gets 490 "Your current bid is awaiting approval". With modification applicable but no open request → 852 "No active counter offer found to modify" — app/helpers/api/v1/bids_controller_helper.rb:57-67
3. [time] Outside the running window the vendor gets 33 unless modification applies — v1 bids_controller_helper.rb:71-73
Verdict: CODE-STRICTER
Test: without the config, send a counter offer in evaluation time and try a modified bid as the vendor. Expect 490.
Cites: trade_request_model_helper.rb:1108-1110,1165-1167; v1 bids_controller_helper.rb:54-76

### Buyer "Edit Quote" — doc presents it as always available, the server needs company config `can_buyer_edit_bid`
Doc: "Select Edit Quote to update specific global fields such as taxes or delivery terms" — notion/sourcing/how-do-you-run-an-rfq-event.md:26
Rules:
1. [config] A revise by a buyer-company user (not a surrogate revision) needs stage config `can_buyer_edit_bid`, or the bid's latest context is valid for edit (email-AI bid). Else → 101 "You are not allowed to perform this action" — app/controllers/concerns/bids_controller_helper.rb:2051-2060, 2809-2815; app/models/model_helpers/trade_request_model_helper.rb:1211-1213
2. [validation] Only template widgets with `is_buyer_editable` (or participant fields for email-AI bids) are kept from the payload — bids_controller_helper.rb:2104-2114
3. [config] The company switch is echoed to the screen from custom config `can_buyer_edit_bid` — app/controllers/api/v1/users_controller.rb:594
Verdict: CODE-STRICTER
Test: without the config, PATCH /bids/revise_bid/:id as the buyer changing a global field. Expect 101.
Cites: bids_controller_helper.rb:2051-2060,2104-2114,2809-2820

### Reminder intervals — doc says reminder intervals are configurable, pre-start auction reminders are fixed
Doc: "vendors are notified and reminded ... at set intervals"; "Intervals configurable" — product/06-sourcing-events-rfx.md:88-94
Rules:
1. [time] On RFQ→auction, reminders are queued at bid_start − 24 h and bid_start − 30 min, each only if still ahead. Both are fixed — app/services/rfq_to_auction/create_service.rb:295-315
2. [config] Vendor expiry reminders run at fractions of the duration from config `event_expiry_reminder_times` (default [0.8]) when `send_event_expiry_reminder_to_vendor` is true. The buyer expiry reminder is at 0.8 of the duration unless "disable_for_buyer" — app/models/trade_request.rb:2147-2149, 2206-2214
Verdict: CODE-STRICTER
Test: convert an RFQ to an auction starting in 2 days. Check that the queued jobs are exactly at −24 h and −30 min.
Cites: create_service.rb:295-315; trade_request.rb:2134-2149,2206-2214

### Partial bidding toggle `rfq.bid.allow_partial` — no such setting; partial bidding follows the awarding type
Doc: CONF-RFQ-001 `rfq.bid.allow_partial` default OFF — product/08-rfq.md:26, 141-151
Rules:
1. [config] No key matching allow_partial / partial_bid exists under app/ (git grep). The closing mode decides it: `auction_closing_mode` defaults to "lot_based" — app/controllers/concerns/trade_controller_helper.rb:3349-3352
2. [validation] Lot-based sheet events must quote every line → 372 "Please quote prices for all the products." (create and revise) — app/controllers/concerns/bids_controller_helper.rb:569-570; app/helpers/api/v1/bids_controller_helper.rb:618-620
3. [config] Line-item closing ("I may partially award") lets vendors quote a subset. book_building and alternate bidding force line-item — trade_controller_helper.rb:3349-3352
Verdict: DOC-ONLY
Test: on a lot-based RFQ, submit a bid quoting 1 of 2 lines (expect 372). On a line-item RFQ, do the same (expect success).
Cites: trade_controller_helper.rb:3349-3352; bids_controller_helper.rb:569-570

### Cost breakdown limits — doc says no line may exceed its RFQ value and the total must match; no server check found
Doc: "no individual line item can have a price greater than the RFQ value and the total must match"; breakdown "locked" after submit — notion/sourcing/cost-breakdown-mode.md:66, 6, 75
Rules:
1. [validation] CBD (fast bidding) conversion needs at least 2 active line items → 798 "CBD mode requires at least two active line items. Please add more line items to continue." — app/controllers/api/trade_controller.rb:995-999
2. [time] The buyer opens or extends the CBD window with end_time_type request_for_cost_break_down (AGREES "buyer can extend") — app/controllers/api/trade_controller.rb:442-448
3. [validation] No per-line ≤ RFQ-price or total-equals-auction-bid check was found. Searched: en-IN.yml for breakdown/justif messages; app/helpers, bids_controller_helper.rb, bid.rb, bid_trade_product.rb for cost_break_down (only fast-bid formula guards at app/models/bid.rb:1102, 1132) (unverified: the screen or price-cap widgets may enforce it)
Verdict: DOC-ONLY
Test: in the CBD window, submit a breakdown with one line above its RFQ price and a total ≠ the auction bid via the API. Record the response.
Cites: trade_controller.rb:442-448,995-999; bid.rb:1102,1132

### Minimum revisions before an indicator shows — AGREES, with a single shared count and two diverging implementations
Doc: ranks / best price / traffic light shown "only after they have revised their price at least n times" — notion/sourcing/how-to-choose-and-configure-auction-strategies.md:53, 61, 84; PRD-KBSRC-322, -323, -327
Rules:
1. [config] One stage config `num_revisions_req_to_show_indicator` (default 0 = always show) applies to the auction's default indicator. Non-zero also sets show_best_price_stepper false — app/controllers/concerns/trade_controller_helper.rb:3309, 3372-3373; app/models/model_helpers/trade_request_model_helper.rb:63-67
2. [visibility] The buyer company always sees it. A vendor sees the default indicator once quote_revisions_count >= n — app/models/concerns/revision_recorder_helper.rb:6-27
3. [calculation] A revision counts only if the value changed: lot = total landed amount differs, line = price differs — revision_recorder_helper.rb:29-41
Gaps: for a non-default indicator, revision_recorder_helper returns true (shown at once), while TradeRequest#have_enough_revisions_to_show_given_indicator? returns false (never shown) — revision_recorder_helper.rb:16-18 vs trade_request_model_helper.rb:793-799 (unverified: callers of the model version)
Verdict: AGREES
Test: n=2 on a rank auction. A vendor revising with the same price twice still sees no rank. After 2 price changes the rank appears.
Cites: revision_recorder_helper.rb:6-41; trade_request_model_helper.rb:776-800

### Traffic-light bands — AGREES (inclusive bounds); the doc's "award on the entire lot" is not required
Doc: green ≤ X, yellow > X and ≤ Y, "inclusive"; "Make sure awarding is on the entire lot" — notion/sourcing/how-to-choose-and-configure-auction-strategies.md:77-82; how-to-run-a-traffic-light-auction.md:23; PRD-KBSRC-325, -326, -374
Rules:
1. [calculation] Reverse (buy) or rank-based: value <= lower_bound → green; lower < value <= upper → yellow; else red — app/models/bids_group.rb:381-389
2. [calculation] Forward auction on price: value >= lower → green; upper <= value < lower → yellow; else red — bids_group.rb:390-395
3. [calculation] The value is the rank (traffic light on rank), else the ranking score (÷ quantity for single-product weighted events) — bids_group.rb:350-357
4. [validation] Bounds missing or not ordered (buy: lower < upper) → 269 "You have not provided valid traffic light ranges." — app/controllers/concerns/trade_controller_helper.rb:3167-3172, 3436-3446
5. [config] Line-item traffic light is supported via per-line meta_data bounds, so a lot award is not required — bids_group.rb:366-378
Verdict: AGREES
Test: bounds 100/120. Bids of 100, 120 and 121 must show green, yellow and red.
Cites: bids_group.rb:348-395; trade_controller_helper.rb:3167-3172,3436-3446

### Vendor masking — AGREES (masked until bidding ends), with exemptions the doc does not mention
Doc: "hide the names of all the Vendor's names until bidding ends"; Participants tab hidden — notion/sourcing/how-to-enable-vendor-masking.md:13, 16; PRD-KBSRC-653, -654
Rules:
1. [visibility] Names are masked for a buyer-company user while `is_upcoming_or_running` (bid end >= now or review time, and not closed) and masking is enabled for that user — app/models/model_helpers/trade_request_model_helper.rb:967-969; app/models/trade_request.rb:1197-1200
2. [config] In "everyone except super admin" mode, super admins see names. Company custom config `vendor_masking_true` turns masking on by default — trade_request_model_helper.rb:1223-1230; app/controllers/concerns/trade_controller_helper.rb:3396-3399
3. [permission] Masking can be switched on or off mid-event through trade#update when it is allowed — app/controllers/api/trade_controller.rb:490-492
4. [visibility] The screen hides the share-participants action when masking is on — src/views/orderDetails/eventHeader/eventHeader.jsx:634-636
Verdict: AGREES
Test: as a non-super-admin buyer, check the QCS names during bidding (Vendor 1..N) and after the end (real names).
Cites: trade_request_model_helper.rb:967-969,1223-1234; trade_controller.rb:490-492

### Knockout rounds — AGREES (only acceptors go forward), with a round-extension defect
Doc: "Only vendors who accept the current offer move forward"; buyer can extend the ongoing round — notion/sourcing/how-to-run-a-knockout-auction.md:35, 39; PRD-KBSRC-381, -383
Rules:
1. [state] The next knockout round's participants = the accepted participants of the round just executed — app/controllers/api/trade_controller.rb:954-958
2. [calculation] Knockout next price = previous − price_difference (sign flipped for sell) — trade_controller.rb:936, 941; app/controllers/concerns/trade_controller_helper.rb:3463-3465
3. [validation] time_difference < 30 → 248 "Time difference cannot be less than 30 seconds". A start + time_difference after the end → 238 — trade_controller_helper.rb:3452-3462
4. [time] Round extension beyond the auction end → 235 "You cannot extend round time beyond auction expiry time. Please extend auction time first." — trade_controller.rb:894-905
Gaps: on extend, the current round is voided and its copy saved before the 235 check, and this is not rolled back — trade_controller.rb:896-905
Verdict: AGREES
Test: extend the current round past the auction end. Expect 235, then check whether the round is still active.
Cites: trade_controller.rb:894-958; trade_controller_helper.rb:3447-3474

### Dutch rounds and closing — AGREES on direction and first-accept award; the immediate auction end is rfx-project only
Doc: the price moves by the tick each round toward the End Price; the first acceptor wins and the auction closes — notion/sourcing/how-to-run-a-dutch-auction.md:36, 52, 54; PRD-KBSRC-390, -391
Rules:
1. [calculation] Dutch next price = previous + price_difference for buy (negated for sell). Buy needs start <= end (242), sell start >= end (241). Tick > |end − start| → 243 "Invalid Tick Size" — app/controllers/api/trade_controller.rb:937, 942; app/controllers/concerns/trade_controller_helper.rb:3488-3495
2. [side-effect] Accepting creates an active bid at the round price and immediately closes (selects) it as the event creator — app/controllers/api/bids_controller.rb:255-262
3. [time] The auction is ended at once on acceptance only when the stage is dutch, rfx_project_enabled and in submission time — app/models/bid.rb:516-524
4. [validation] Single-product multi-vendor closing needs participant_quantity (249) above the min quantity (246) — bids_controller.rb:243-253
Gaps: the doc's own example steps the dutch price as "₹X − Tick", which is the knockout direction — how-to-run-a-dutch-auction.md:49
Verdict: AGREES
Test: in a non-rfx company, accept a dutch round. Check whether the stage keeps running after the award.
Cites: bids_controller.rb:235-270; bid.rb:516-524; trade_controller_helper.rb:3475-3514

### Anti-sniping extension — AGREES (last-moment bids extend the auction)
Doc: "Last-moment bids auto-extend the auction per configured anti-sniping rules" — product/09-reverse-auction.md:54-59 (Notion page empty: notion/sourcing/dynamic-event-extension.md:6)
Rules:
1. [time] Without dynamic closing: an active bid when the end is within the next 1 minute, with `update_trade_end_time` on and a rank change to <= rank_for_update_trade_end_time (default 1), adds 3 minutes — app/models/bid_trade.rb:44-58, 118-129; app/controllers/concerns/bids_controller_helper.rb:381-388
2. [config] update_trade_end_time is forced off for RFQs and line-item-closing stages — app/controllers/concerns/trade_controller_helper.rb:3383-3385
3. [time] Dynamic closing: triggered when bid end lies within [bid time, bid time + last_n_minutes]. rank_based = a rank change within the limit; price_based = a revised line within the limit with a better price — app/models/bid.rb:399-406, 411-425
4. [validation] last_n_minutes blank, < 1 or over half the time left → 501 "Invalid Trigger Time for Dynamic Time Extension." — trade_controller_helper.rb:3317-3320, 6259-6268
5. [time] Not triggered when the bid became active from a declined counter offer or price-change request — bid.rb:412-416
Verdict: AGREES
Test: rank auction with update_trade_end_time on. A rank-changing bid 40 s before the end moves the end by +3 min.
Cites: bid_trade.rb:44-58,118-129; bid.rb:395-425; trade_controller_helper.rb:3311-3320

### Price cap, tick size, min quantity — AGREES, the tick is measured against the vendor's own previous price in either direction
Doc: Price Cap "upper limit"; Tick Size "minimum amount change ... when revising"; Min Quantity — notion/sourcing/how-do-i-add-additional-columns-to-a-template.md:20-25; product/09-reverse-auction.md:61-66
Rules:
1. [validation] Landed (estimated) price above the cap (vendor-specific cap first) → 38 "Price cannot be more than the allowed price"; below the floor → 41 — app/controllers/concerns/bids_controller_helper.rb:1839-1855
2. [validation] Tick: only on a revision (a parent line and a previous active bid exist). |new − previous| non-zero and < tick → 214 "Quoted price difference must be greater than the tick size". An equal change passes, an unchanged price passes, and the direction is not checked — bids_controller_helper.rb:1869-1879
3. [validation] Tick %: same rule against tick_size_value — bids_controller_helper.rb:1881-1891
4. [validation] Quantity below floor_quantity → 39 "Quantity cannot be less than the allowed quantity" — bids_controller_helper.rb:1893-1896 (unverified, from the bids digest)
Verdict: AGREES
Test: tick 10. Revise 100→95 (expect 214), 100→90 (ok), 100→110 (passes the tick check; the increase rule decides).
Cites: bids_controller_helper.rb:1836-1891

### Serial (staggered) bidding — AGREES (bid only on the current item), with creation times not validated
Doc: "Vendors can only bid on the current active Line Item"; the system computes the total time — notion/sourcing/how-to-create-serial-bidding-events.md:19, 29; PRD-KBSRC-362
Rules:
1. [time] Adding a line, or submitting, checks now is within that item's start/end from misc.trade_products_time, else 508 "Not allowed to bid on this product". Mobile apps are refused — app/helpers/api/v1/bids_controller_helper.rb:162-167, 391-396, 975-983
2. [validation] On submit only the last bid line's window is checked — v1 bids_controller_helper.rb:393
3. [validation] At creation, per-item start/end are copied from the request with no ordering or overlap check (the screen computes them). Edits via staggered_time check them (507 "Invalid Time Input") — app/controllers/concerns/trade_controller_helper.rb:3798-3811, 2115-2126
4. [permission] The old bid API refuses non-surrogate bids on staggered events (508) — app/controllers/api/bids_controller.rb:426-428
Verdict: AGREES
Test: create a staggered auction via API with overlapping item windows. Expect it accepted. Bid on a not-yet-open item: expect 508.
Cites: v1 bids_controller_helper.rb:162-167,391-396,975-983; trade_controller_helper.rb:2115-2126,3798-3811
