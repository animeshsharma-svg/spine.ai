<!-- Phase 3 design input, written by a read-only research agent on 2026-10-01 from procol-backend origin/main ae36e86894 and UAT (SELECT only). Not yet verified live. -->

# PHASE 3 design input: bidding matrix (several vendors, surrogate bids, time rules)

**Main takeaways**
- **Vendor data is the blocker.** No company has a vendor that is both invitable and safe to email. The 23 QA test vendors (`qa_…@example.com`) all have their buyer–vendor link set to *rejected*. Using the real vendors would send real invite and OTP emails. We need fresh QA vendors with an *active* link before any multi-vendor run.
- **Five suspected backend defects**, found by reading code only, not run live (section 3.3). Each has a safe probe in the matrix.
- **Only 4 of the 14 combinations need more than 3 minutes.** If we set `bst/bet/ect` ourselves, the rest fit in 1.5–3.5 minutes each.

**Sources and limits**
- Backend refs are `procol-backend` `origin/main` @ `ae36e86894` (2026-09-25), read with `git show`.
- Error codes come from `config/locales/en-IN.yml`.
- The database was read with SELECT only. I printed only counts and email domains, no full emails, no OTP values.
- Paths without a repo prefix are inside `procol-backend`.
- Route prefixes: `api_routes` covers `config/routes.rb:42-907`. `v1_api_routes` covers `routes.rb:908-1030` and is mounted under `/v1` (`routes.rb:68-70`).
- Any `*_uuid` you send is decoded to `*_id` before the controllers see it (`app/controllers/concerns/params_auth.rb:57-79`).

---

## 1. Vendor side, end to end

### 1.1 Login (who can log in)

**Our client (`procol test`)**
- `src/auth/login.ts:58-185`. Vendors log in by email; console users by phone (`login.ts:61-62`).
- Calls: `POST /v1/generate_otp {email}`, then `POST /v1/verify_otp {email, otp, push_token, device_info, device_id}` (`login.ts:103-127`).
- It tries up to 4 codes (`login.ts:82`), moving to the next code only on "Invalid OTP" or code 6 (`login.ts:131`).
- On 705 it re-sends with `terms_and_policy_accepted:true`, but only for `qa_…@example.(com|org|net)` users (`login.ts:34, 142-156`).
- Code order (`src/auth/uatOtp.ts:62-129`):
  1. the tenant's `uat_login_otp`;
  2. the user's own company code if that company is verified;
  3. otherwise the codes of every buyer the vendor deals with (statuses 1–7, `uatOtp.ts:35, 115-125`);
  4. if the company is still signing up, the inviter's code (`uatOtp.ts:103-110`);
  5. if no such user exists, `MASTER_OTP_6`.

**Backend rules for email OTP**
- `app/controllers/api/v1/users_controller.rb:133-194`.
- `find_user_by_email` (`app/controllers/concerns/users_controller_helper.rb:323-342`):
  - Active users with that email, preferring `email_verified = done`.
  - If none is verified and more than one user has the email → **585** "Please use your linked phone number".
- `check_otp_on_email_allowed` (`users_controller_helper.rb:153-176`):
  - No user and no active invitation → **733**.
  - Procol employee, or user whose home company is a buyer category → **5**.
  - App is not the mobile app or the web vendor portal → **567** "Email Login Not allowed here".
- Unregistered POC → 5 (`users_controller.rb:154-156`). SSO user → **556** (`:173-175`).
- Terms not accepted → **705** on verify. The response carries `show_terms_and_policy` (`users_controller.rb:191`). Current terms version is `"v1"` (`app/models/user.rb:156`); the check is `user.rb:1033-1035`.

**A vendor can bid for a company only if:**
- that company is in the event audience (`allowed_to_bid?`, `bids_controller_helper.rb:17-31` → **782**), and
- `can_place_bid_for_company` is true (`app/models/user.rb:678-691`): the user belongs to that company.

### 1.2 Opening an invited event
- `GET /trade/:uuid?response_type=template&additional_fields=order_details`. Used for both rounds (`procol test/src/flows/vendorBid.ts:46, 57`; `prototype/src/checks/eventJourney.ts:750-797`).
- The pricing read gives `order_details[0].product.{trade_product_uuid, trade_product_id, trade_product_category_uuid, id, product_code}` (`vendorBid.ts:47-54`).
- The technical read gives `sheets.forms[1].{uuid, page_uuids[0]}` (line-item form) (`vendorBid.ts:58-61`).

### 1.3 Participation, accept or decline
- **Open-tender self-registration:** `POST /event_groups/:id/participants` (`routes.rb:691` → `event_groups_controller.rb:276-286`).
  - `ParticipateService` (`app/services/event_groups/participate_service.rb:25-48`).
  - Every open-tender stage must be upcoming or running, else **33** (`:27-29`).
  - It creates a `trade_accept` intent and a `self_registered` audience row on each stage.
- **Accept or decline an invited event:** `POST /user_intents` (`routes.rb:643`; `app/controllers/api/user_intents_controller.rb:4-24`).
  - Body: `{item_type, item_uuid, intent_type:"trade_accept"|"trade_reject"(default), reason|remarks}`.
  - A decline with no reason/remarks → **2** (`:11-13`).
  - **A decline is never enforced.** No bid guard reads `trade_reject` (the only hit is `user_intents_controller.rb:19`). An active intent is just set to `converted` when the vendor bids (`api/bids_controller.rb:521-528, 664`).

### 1.4 Technical response: start → answer → submit
1. **Start:** `POST /template_responses {item_uuid, item_type:"TradeRequest", company_uuid}` (`bodies.ts:399-408`; `template_responses_controller.rb:13-40`).
   - The stage must be inside a schedule window of type `rfq|auction|offline_trade|bidding_time|dynamic_extra_time|sealbid_extension_time` (`trade_request.rb:222-227`), else **33** (`template_responses_controller_helper.rb:132-133`).
   - Bidding as your own buyer company, a stage you cannot view, or a seller rejected from rebidding → **101** (`:135-137`).
2. **Answer:** `PUT /template_responses/:id/create_page_responses {form_uuid, page_uuids[], page_responses{page_uuid:[{key_attribute,value}]}, item_type, item_uuid}` (`bodies.ts:411-425`; controller `:69-95`).
   - For a vendor: **33** unless `is_running` (`:81`); **101** unless the event group is the latest version (`:80`).
3. **Submit:** `PATCH /template_responses/:id {status:"active", item_uuid, item_type, company_uuid}` (`bodies.ts:428-438`; controller `:55-67`).
   - `revise_for_item_type` gives **33** unless `is_running` (`:291-299`). Missing required fields fail validation (`ValidateService`, `helper:23-24`).
   - Submitting again marks the previous active response `revised` (`helper:17-22`). That is how a technical revision works.

### 1.5 RFQ bid: open → price lines → submit (and revise)

**1. Open:** `POST /v1/bids {trade_request_uuid, company_uuid, currency_preference, broker_company_uuid:false}` (`bodies.ts:441-457`; `app/controllers/api/v1/bids_controller.rb:11-39`).
- Missing trade or company → 2. Not the latest version → 101 (`:18`).
- Company not in the audience → **782** (`:20`).
- Then `is_allowed_to_create_bid` (`app/helpers/api/v1/bids_controller_helper.rb:7-78`):

| Code | When | Line |
|---|---|---|
| 101 | rejected seller | `:8` |
| 33 | surrogate (buyer) on this endpoint without counter-offer modification | `:9-12` |
| 737 | invited to RFP but no technical response | `:30-38, 313-320` |
| 370 | previous bid revoked | `:54-56` |
| 852 / 490 | requested bid pending | `:57-67` |
| 96 | subsidiary network | `:68` |
| **33** | `!is_running` unless counter-offer modification applies | `:71-73` |
| **875** | `lock_quote_after_submission` and an active bid exists | `:74-76` |
| 516 | concurrent call within 3 s | `v1/bids_controller.rb:168-174` |

- This reuses the vendor's own draft (`v1/bids_controller_helper.rb:142-145`) and copies data from the last active or requested bid (`:125-132`).

**2. Price lines:** `POST /v1/bids/:id/create_bid_products {company_uuid, trade_request_uuid, sheets.inline_components.data{company_uuid:[row]}}` (`bodies.ts:468-532`; `v1/bids_controller.rb:113-139`).
- Draft bid not found → 32.
- When `!is_running`: `is_allowed_to_modify_counter_offer` (`bids_controller_helper.rb:792-804`) → **33**, or **508** if there is no requested counter-offer line.
- 473 anomaly; 96 subsidiary.
- Line void/inactive → **569** (`v1 helper:189-191`).
- Technical-participation check on the line item (`v1 helper:197, 289-311`): line regretted in the technical stage → **736**; did not participate → **737**.
- Price and quantity checks (`bids_controller_helper.rb:1828-1913`):

| Code | Meaning |
|---|---|
| 38 | above ceiling price |
| 41 | below floor price |
| 214 | price change smaller than the tick size |
| 39 | below floor quantity |
| 207 | fixed quantity not matched |
| 138 | over quantity |
| 139 | under quantity |
| 578 | custom validation failed |

- These checks fire at submit or revision time (`v1 helper:800-805`); first-bid timing is unverified.

**3. Submit:** `PATCH /v1/bids/:id {company_uuid, trade_request_uuid, status:"active", sheets.global_price_components.global_data{company_uuid:{gross_total:{value}}}, currency_preference, bill_to_broker, fast_bid_enabled}` (`bodies.ts:535-551`; `v1/bids_controller.rb:41-66`).
- Bid already active and the request asks for active/draft → 34.
- `update_bid_helper` (`v1 helper:367-487`): 499 counter offer pending (`:375-384`); **875** lock (`:385-387`); **748** a non-regretted line has no bid (`:388-390, 985-1000`); 508 staggered timing (`:391-396`).
- `update_bid_action_helper_v1` (`v1 helper:541-882`):
  - **33** if `!is_running`, unless counter-offer modification applies and the active bid is requested, or a justification is pending (`:562-572`).
  - 300: last-5-minute price increase on a single product (`:627`; `bid.rb:1423-1428`).
  - **98** tie (auction only, when `is_tie_bid_allowed` is false, `:601, 628-641`).
  - 372: lot plus sheet template with a missing line (`:619-621, 819-821`).
  - **800** regretted line (`:744-749, 885-894`).

**4. Revise:** repeat steps 1–3 (open draft → price lines → `PATCH status active`).
- Because an active bid exists, the draft becomes the new active bid and the old one becomes `revised` (`v1 helper:459-463, 775-817`).
- The legacy route `PATCH /bids/revise_bid/:id` (`routes.rb:308` → `api/bids_controller.rb:109-131`) is the **buyer-edit / surrogate-revision** path (see 3.1).

### 1.6 Regret a line (commercial)
- `PATCH /v1/bids/:id/line_items/:egli_uuid/regret_status {company_uuid, trade_request_uuid, action_type:"regret"|"undo_regret"}` (`routes.rb:996`; `v1/bids_controller.rb:141-157`).
- Service: `app/services/bids/line_item_regret_service.rb:40-113`.
- It needs a **draft** bid (`:42`). Errors: 805 action, 806 bid, 807 bid status, 808 line, 95 trade, 130 company, **844** "cannot regret all line items in a lot split event" (`:115-128`).
- It only writes `bid.meta_data.regretted_eglis`. The real effect happens on submit (`mark_egli_regretted`, `v1 helper:476-528`). There is **no time guard** in the service; the submit applies the 33 guard.

### 1.7 Cost breakdown
- Buyer opens the window: `PATCH /trade/:id {end_time_type:"request_for_cost_break_down"|"request_for_best_price", end_time, end_time_applicable_vendor_ids[]}`.
  - Code: `api/trade_controller.rb:442-448, 579-581, 642-692`. Dashboard body: `procol-client-dashboard src/views/orderDetails/orderDetails.jsx:646-651`.
  - It creates a `response_review_time_for_participant` schedule (`trade_controller_helper.rb:5843-5869`). For cost breakdown it also creates tasks (`app/models/trade_schedule.rb:55`).
- During the window `is_running` is true (`trade_request.rb:1185-1194`), so vendors re-bid through the normal path.
- **Unverified:** I found no vendor-only cost-breakdown submission endpoint.

### 1.8 T&C acceptance
- Auction T&C pop-up: `PATCH /v1/trade/:id/accept_auction_tnc` (`routes.rb:991`; `api/v1/trade_controller.rb:899-917`) → `trade_request.misc.tnc_popup_acceptances[company]` (`trade_request.rb:3048-3058`).
- **No server guard was found.** `tnc_popup_accepted?` is only read by serializers (`trade_serializer.rb:67-68`, `trade_template_serializer.rb:311-312`).
- `is_tnc_mandatory` only changes the effective clause mode (`trade_request.rb:994-1000`).
- On the surrogate path, bid T&C are stored as sent (`bids_controller_helper.rb:453-459`).
- *So "bid without accepting T&C" should be accepted by the API. That is a UI-only rule; mark it unverified.*

---

## 2. What changes with N vendors

- **Ranking**
  - Score per bid: `bid_rank_helper.rb:65-97` (landed cost, gross total, or the ranking widget; weighted if configured).
  - Rank: `app/services/event_indicators/concerns/rank_calculator.rb:22-31`. It is a dense rank over unique scores (descending for sell orders).
  - **If more than one vendor ties for the best score, every rank shifts by 1** (two tied lowest bids are both L2, and no vendor is L1). Good deterministic oracle.
  - Ranks count only bids in `active|selected|requested` (`bid_rank_helper.rb:14`).
- **Rank visible to vendors**
  - Bid serializer: `rank` is nil unless `should_show_rank?` (`new_bid_serializer.rb:121-131`).
  - `should_show_rank?` is **always false for RFQ** (`trade_request.rb:655`). For auctions it needs `auction_config` rank or rank_and_price, or `other_auction_indicators_config.rank` (`:654-670`). For knockout/dutch, only the buyer sees rank (`:658-662`).
  - `show_rank_to_sellers` has no reader outside its definition (`trade_request_model_helper.rb:152`). Dead flag.
- **Per line vs overall**
  - Line-item based ⇒ `rank_type = inline` (`trade_controller_helper.rb:3389`).
  - Per-line rank is shown when inline, more than one product, and rank required (`api/bids_controller.rb:597`).
  - Line-item based is `config.auction_closing_mode == "line_item_based"`; everything else is lot based (`trade_request_model_helper.rb:478-484`).
  - Lot plus sheet template needs every line quoted → 372 (`bids_controller_helper.rb:569-571`).
- **Ties**
  - Rejected (98) only on **revision**, only for non-RFQ, non-offline stages, only when `is_tie_bid_allowed == false` (`v1 helper:601, 628-641`; `bids_controller_helper.rb:1916-2003`).
  - Template default is `true` on all three clients (master config, item_type 0). So by default ties are accepted, and the +1 rank shift above applies.
- **Price cap / floor**
  - `ceil_price` / `floor_price`, per vendor or default (`trade_product.rb:158-185`) → 38 / 41.
  - **English auction** (`is_english_auction_enabled`, which `bodies.ts:335` sets for auction stages): a vendor who has not bid yet has their ceiling replaced by the current best price minus the tick size (`trade_product.rb:170-179`). The 2nd and 3rd vendor must beat L1.
- **Minimum decrement:** tick size or tick-size percentage → 214 (`bids_controller_helper.rb:1869-1891`).
- **Auto-extension (more bids near close)**
  - Last-minute extension: `bid_trade.rb:118-129, 45-58` (needs `update_trade_end_time`, not RFQ, rank changed within the threshold). Extends by 3 minutes (`bids_controller_helper.rb:381-408`).
  - Dynamic closing (`bid_trade.rb:131-143`): set per stage in the body (`trade_controller_helper.rb:3311-3320`). The trigger needs `last_n_minutes ≥ 1` and less than half the remaining time, else **501**.
- **QCS (what the buyer sees)**
  - Dashboard calls: `GET /v1/trade/:id/schema?response_type=template&additional_fields=order_details&l1_prices=true`, `/v1/trade/:id/event_indicators`, `/v1/trade/:id/l1_data_for_event`, `/v1/trade/:id/quote_details/:quote_id`, `/v1/trade/:id/best_line_wise_savings`, `/v1/trade/:id/aggregate_savings` (`procol-client-dashboard src/redux/orders/api.js:40-89, 348`), and project level `GET /event_groups/:id/get_line_items` (`src/redux/project/api.js:45`).
  - Vendor rank inside the auction QCS needs company config `display_vendor_rank_in_auction_qcs` (`api/v1/trade_controller.rb:541`). GMMCO = true; the other two = false.
  - Vendor names are masked while the event is upcoming or running if masking is on (`trade_request_model_helper.rb:967-969`).
- **Evaluation with N vendors**
  - Submit needs a score for **every** vendor that has an active response, else **571** (`app/helpers/api/evaluations_helper.rb:604-609, 811-826`).
  - Scoring a vendor with no active response → 101 (`app/services/evaluations/validate_service.rb:77-82`).
- **Award to one vendor, or split across vendors**
  - Calls: `POST /proposal {event_group_uuid}`; `POST /proposal/:id/add_response?lot_no= {responses:{vendor_uuid:{action:"add", egli_data:{egli_uuid:{awarded_quantity}}}}}`; `GET /proposal/:id/approval_workflows`; `POST /proposal/:id/submit` (`procol test/src/flows/awarding.ts`; `bodies.ts:807-853`; `api/proposal_controller.rb:45-103`).
  - Awarding a vendor with no bid on the line → **715** (`app/helpers/api/proposal_helper.rb:1308`).
  - Quantity check `validate_awarding_quantity` (`proposal_helper.rb:811-844`):
    - Partial awarding on: 561 if the total exceeds the line quantity.
    - Over-awarding on with a PR: allowed up to the PR ceiling.
    - **Partial awarding off and `awarded_quantity` sent: the code falls through with no check (returns nil).** *Suspected gap, unverified.*
    - `awarded_quantity` missing: 561 if the sum of quoted quantities exceeds the line quantity.
  - TNA/Regret blocks (1134–1137) apply only with `restrict_awarding_for_tna_vendors` (`:1244-1267`). False for all three.
  - `disallow_partial_line_item_awarding` → 791 (`:219-231`). False for all three.
  - A bid revised after it was added to the proposal → **1126** on submit (`:121-125, 241-250`).
  - A proposal already submitted → 573.

---

## 3. Surrogate bids

### 3.1 The code paths

| Path | Endpoint | Code |
|---|---|---|
| S-tech | `POST /template_responses/create_surrogate_response {item_uuid,item_type,company_uuid,page_uuids,page_responses,surrogate_remarks}` | `template_responses_controller.rb:224-238` → `template_responses_controller_helper.rb:263-318` |
| S-rfq | `POST /bids/template_input {company_uuid,trade_request_uuid,sheets.{global,inline},surrogate_remarks}` | `api/bids_controller.rb:26-31 → 33-85`; `create_bid_helper` `bids_controller_helper.rb:440-647` |
| S-revise | inside S-rfq: an existing surrogate bid **and** `allowed_surrogate_bid_even_after_bid` → `delegate_to_surrogate_revision` → `update_bid` | `api/bids_controller.rb:54-58`; `bids_controller_helper.rb:2822-2830` |
| B-edit (buyer overrides a vendor bid) | `PATCH /bids/revise_bid/:id {bid_products…}` | `api/bids_controller.rb:109-131`; `bids_controller_helper.rb:2809-2820, 2055-2128` |
| B-v1 (buyer on the vendor endpoint) | `POST /v1/bids` | `v1/bids_controller_helper.rb:9-13` |

**Who may place a surrogate bid** (`is_surrogate_bidding_and_is_allowed?`, `bids_controller_helper.rb:2130-2141`):
- Any user of the event's company; the stage must not be offline trading.
- Blocked when `config.is_buyer_not_allowed_to_add_surrogate_bid` is set → **10**.
- Otherwise allowed for a super admin, a team that covers the event's category or hub, or the event creator; anyone else → **165**.
- An approval flow may make the bid `approval_requested` (`:2654-2658, 2781-2807`); approval v2 plus over-quantity → 781.

**Timing**
- S-rfq: **33** unless `is_running`, or (surrogate **and** (`is_upcoming_or_running` **or** `is_allowed_to_add_surrogate_bid_post_expiry`)) (`api/bids_controller.rb:50`).
- S-tech: the same rule (`helper:265`).
- `is_upcoming_or_running` = `bid_end_time >= now` or inside a review window, and status not closed (`trade_request.rb:1197-1200`).
- **So a surrogate bid is accepted before the start time; a vendor bid is not.**

**When a bid already exists** (`validate_existing_bids_if_present`, `bids_controller_helper.rb:2741-2773`):
- Previous bid revoked → 370.
- Existing *surrogate* bid without the config → **99** "already placed on behalf".
- Existing surrogate bid with the config → returned for revision.
- Existing *vendor* bid without the config → **96**.
- S-tech with an existing active response and no config → **30** (`helper:268-273`).

**Who can be bid for**
- S-rfq checks only `can_place_bid_for_company` (`api/bids_controller.rb:51`): the vendor must be in the buyer's `dealing_with_company_ids` (`user.rb:685-687`), meaning a link status in `allowed_statuses_for_vendor` (`company.rb:179-181, 509-514`). Otherwise → **101**.
- **There is no audience check** (`allowed_to_bid?` is never called) **and no technical-participation check** (`create_bid_helper` → `create_bid_trade_product` only runs `validate_bid_product_details`, `bids_controller_helper.rb:1110-1330`).

**B-edit**
- Needs `can_buyer_edit_bid` or a bid context that allows editing, else **101** (`:2055-2061`).
- No change → **758** (`:2063-2080`).
- Allowed while running and during extra closing time; after that 101 (`bids_controller_helper.rb:66-85`).
- Only `is_buyer_editable` fields are taken (`:2102-2128`).

**Vendor after a surrogate bid**
- The vendor's `POST /v1/bids` is not blocked by an active surrogate bid.
- The vendor's submit revises it (`v1 helper:459-463`).
- If the surrogate bid is still awaiting approval it is withdrawn (`:808-810`).

**Surrogate in an auction**
- Same S-rfq path. Only knockout/dutch auctions and rfi/rfp stages are excluded (→ 95) (`trade_controller_helper.rb:6507-6517`).
- English-auction ceiling and tick rules still apply to surrogate bids (`create_bid_trade_product` → `validate_bid_product_details`).

### 3.2 Combinations that take distinct code paths (generate only these)

| ID | Pattern | Expected (code) |
|---|---|---|
| S1 | Surrogate tech + RFQ for an invited vendor while running; vendor never logs in | accepted |
| S2 | Surrogate before `bst` (vendor gets 33 at the same moment) | accepted (`bids_controller.rb:50`) |
| S3 | Surrogate after the vendor's own bid | **96** |
| S4 | Second surrogate for the same vendor | **99** |
| S5 | Vendor logs in and revises over a surrogate bid | accepted, old bid revised |
| S6 | Surrogate tech after the vendor's own technical response | **30** |
| S7 | Surrogate RFQ for a vendor that is dealt with but **not in the audience** | *code says accepted, suspected defect* |
| S8 | Surrogate RFQ for a vendor that is not dealt with | **101** |
| S9 | Surrogate after `bet` (in or after extra closing time) | **33** |
| S10 | Surrogate in an English auction above (best price − tick) | **38** |
| S11 | Surrogate RFQ on RFP+RFQ with no technical response (vendor path would give 737) | *accepted (no check)* |
| S12 | Buyer (event owner) calls `POST /v1/bids` while running | **33** (`v1 helper:9-12`) |
| S13 | Buyer outside any valid team calls `/bids/template_input` | **165** |
| S14 | B-edit on 198678 (`can_buyer_edit_bid`=true) while running, then after extra closing time | accepted, then **101** |

**Same code path; do not generate separate cases for:** surrogate on RFQ vs RFQ-then-auction; surrogate for vendor A vs B; surrogate remarks present vs absent (only adds a remark, `:633-644`).

### 3.3 Suspected defects (code reading only, need a live probe on QA records)

1. **Permission errors swallowed on `/v1/bids`.** `return error_code if error_code` (`v1/bids_controller_helper.rb:13`) returns a single integer. The caller unpacks two values (`v1/bids_controller.rb:24`), so `error_code` becomes nil. A buyer who would get **10 or 165** passes and gets a draft bid.
2. **Technical response for any company.** `create_surrogate_response` has no `authorize`, no allowed-companies check, and no audience check (`template_responses_controller.rb:224-238`; `helper:263-318`). Any signed-in user (including vendor A) could create a technical response for any `company_uuid` on any upcoming or running RFP.
3. **Uninvited vendor on the surrogate RFQ path.** `/bids/template_input` has no audience check. The same applies to a vendor calling it for their own company (`BidPolicy#template_input?` is `true`, `app/policies/bid_policy.rb:9-11`).
4. **Review-window restriction is UI-only.** Best-offer / cost-breakdown limits by vendor exist only as a UI flag (`trade_template_helper.rb:6532-6542`, used only at `:2846, 5893`). The server's `is_running` is true for every vendor during the window (`trade_request.rb:1185-1194`).
5. **Award during bidding.** Award is blocked (720) only when `is_order_allowed_to_close_in_extra_closing_time_only` is set (`event_group_controller_helper.rb:629-648`). That flag is false on all three clients, so a proposal can apparently be created and submitted **while bidding is open**. *Unverified, and possibly intended.*

---

## 4. Time rules

| Rule | Guard (file:line) | Code | Fits a 1–3 min run? |
|---|---|---|---|
| Vendor bid before `bst` | `v1 helper:71-73` (`is_running` false; counter-offer modification only applies after `bet`) | 33 | yes (`bst = now+60`) |
| Vendor technical response before `bst` | `template_responses_controller_helper.rb:132-133` | 33 | yes |
| Surrogate before `bst` | `api/bids_controller.rb:50`; `helper:265` | accepted | yes |
| Vendor during extra closing time (`bet < now ≤ ect`) | create: `v1 helper:71-73` lets the draft through (counter-offer modification is on in ~all events, see 5.3); products: `bids_controller_helper.rb:792-800` → **508**; submit: `v1 helper:562-571` → **33**; tech: `template_responses_controller.rb:81`, `:296` → **33** | 508/33 | yes (`bet = now+45`, `ect = bet+60`) |
| Vendor after `ect` | `v1 helper:71-73` | 33 | yes |
| Surrogate in or after extra closing time | `api/bids_controller.rb:50` (post-expiry config false everywhere) | 33 | yes |
| What "extra closing time" means | `is_auction_in_extra_closing_time?` = `max(bet, review_end) ≤ now ≤ ect` (`trade_request.rb:954-968`, alias `in_evaluation_time?`) | — | — |
| Extend submission time | `PATCH /trade/:id {increase_auction_time: epoch, extend_rfq_time?}` (`api/trade_controller.rb:642-692`; dashboard `orderDetails.jsx:601-651`) → `update_trade_schedule` (`trade_controller_helper.rb:2018-2056`) | see the next 6 rows | yes |
| …blocked once a proposal exists | `trade_controller_helper.rb:6794-6805`, checked at `api/trade_controller.rb:438-440` | 801 | yes |
| …reopening an expired RFQ or auction | `trade_controller_helper.rb:5830-5832`; allowed for a Procol employee, a super admin (template default true), `is_user_allowed_to_reopen_event` (**198678 company custom = true**), or **any RFP** (`:2028-2029`) | 496 | yes |
| …RFP end must not exceed RFQ end | `validate_rfp_rfq_bid_end_time` `trade_controller_helper.rb:643-675`; called at stage create `:501`, edit `:538`, extension `:2025`, `event_groups/update_service.rb:232`; skipped for drafts and MCP (`:646-647`) | **712** | yes |
| …`extend_rfq_time` on an RFP | `trade_controller_helper.rb:5754-5764` (lots present 818, auction present 819, no RFQ 820) | 818/819/820 | yes |
| …effect on extra closing time and review windows | `adjust_trade_schedules` shifts the extra-closing (and cost-breakdown) window after the new end (`:5524-5561`) | — | — |
| …effect on vendors who already bid | Bids stay active. A new submit is a normal revision. A closed RFP is set back to `active` (`api/trade_controller.rb:674-676`). Bid `end_time` is refreshed only on auto-extension (`bids_controller_helper.rb:406-407`). **Verified live 2026-10-01 (M7): a manual extension DOES refresh existing bids' end time** — the extension sets a flag and the round's save hook rewrites every bid's end time. | — | yes |
| Extend extra closing time | `api/trade_controller.rb:647-657` (746 not allowed; send-to-evaluation mode stores a duration instead); `trade_controller_helper.rb:5871-5901` (195 earlier than now or than its start; 496 already ended and reopening the evaluation not allowed) | 746/195/496 | yes |
| Evaluation window | create and submit need `bid_end_time ≤ now` and stage `active` (`evaluations_controller.rb:14-26, 41-44`). **No upper bound at `ect`.** The stage turns `closed` only when every line is closed (`mark_event_closed_worker.rb:5-21`). | 33 | yes (after `bet`) |
| Award timing | `is_awarding_allowed?` (`event_group_controller_helper.rb:629-648`): blocked outside extra closing time only with `is_order_allowed_to_close_in_extra_closing_time_only` (template default false; 0 recent events have it) | 720 | yes |
| Last-minute / dynamic auto-extension | `bid_trade.rb:118-143`; dynamic trigger needs ≥1 min and < half the remaining time (`trade_controller_helper.rb:3317-3320, 6259-6265`) | 501 | **no**: needs a ≥2–3 min window plus a 1–3 min extension, about 5–6 min |
| Staggered line timing | `v1 helper:975-983` | 508 | needs a staggered config. Out of scope / scheduled |

The journey's own window settings: stage window 45 s (`eventJourney.ts:1586`); extra closing time = bet + 5 s (`:1085-1088`); wait cap 5 min plus 8 s grace (`:1090-1091`). For extra-closing-time tests, make `ect` longer than `bet + 5 s` (for example +60 s) so the window can actually be hit.

---

## 5. Data on UAT (SELECT only)

### 5.1 Invitable vendor companies (vendor company active)

| Client | link active (1) | active + invited (1, 2) | any status | Allowed statuses (`allowed_statuses_for_vendor`) |
|---|---|---|---|---|
| PROCOL DEMO 198678 | 143 | 190 | 723 | custom: active, invited, onboarding_in_progress, in_review |
| Demo Account 2 32461 | 47 | 83 | 295 | master default: active, invited |
| GMMCO 47053 | 133 | 192 | 649 | custom: active, invited, onboarding_in_progress |

### 5.2 Vendors with a user who can log in by email
Rule applied: active user, email present, home company not a buyer category, and (email verified or the only active user with that email). Only active links.

| Client | Vendors with a loginable user | Users | Verified email | T&C v1 accepted | `qa_…@example.*` |
|---|---|---|---|---|---|
| 198678 | 74 | 68 | all | all | **0** |
| 32461 | 35 | 35 | all | all | **0** |
| 47053 | 35 | 35 | all | all | **0** |

No vendor user is blocked by 585 or by a buyer home company.

**Email domains** (vendors / users per client; counts only)

| Client | Public mailbox | Fake-looking domain | procol.in staff | Company domain |
|---|---|---|---|---|
| 198678 | 49 / 45 (gmail.com) | 15 / 13 (email.com, dummy.com, test.com, user.com, vendor1.com, sample.in, aaaa.com and other keyboard-mash `.com`s) | 4 / 4 | 6 / 6 |
| 32461 | 22 / 21 (gmail.com, rediffmail.com) | 5 / 5 (email.com, gow.com, ssmail.com, samplesas.co, testsas1234.co) | 1 / 1 | 8 / 8 |
| 47053 | 22 / 22 (gmail.com) | 3 / 3 (2 × example.com without the qa_ prefix, gmail.comn) | 8 / 8 | 2 / 2 |

**QA test users overall:** 113 `qa_…@example.*` users (112 active, 2 verified email) and 80 active QA invitations. They link to 17 GMMCO and 6 PROCOL DEMO vendor companies, **but every one of those links is status 5 (rejected)**. Rejected is outside the allowed statuses, so these vendors are **not invitable and cannot be surrogate targets** (101). Their home companies are selling firms and active. 15 of the 17 GMMCO ones and all 6 PROCOL DEMO ones have no T&C acceptance, which login.ts auto-accepts for QA users.

**Consequence**
- Under hard rule 1, multi-vendor runs **cannot** use the real vendors: publishing the event emails the audience, and vendor login sends an OTP to that address.
- The only reserved-domain vendors are 2 GMMCO `example.com` users without the `qa_` prefix, so login.ts would not auto-accept T&C for them. Their T&C are already accepted, so that does not matter here.
- **Prerequisite:** create 3+ QA vendors (`qa_<stamp>@example.com`) per client with an **active** link, using bulk upload (Status = active) or the invite flow. *I have not checked which path ends with an active link.*
- All three clients have `uat_login_otp` configured (row present; value not read).

### 5.3 Settings that change the matrix (master default unless marked custom)

| Setting | 198678 | 32461 | 47053 |
|---|---|---|---|
| `allowed_surrogate_bid_even_after_bid` | false | false | false |
| `is_partial_awarding_enabled` | **true** (custom) | false | **true** (custom) |
| `is_over_awarding_allowed` | false | false | **true** (custom) |
| `display_vendor_rank_in_auction_qcs` | false | false | **true** (custom) |
| `can_buyer_edit_bid` | **true** (custom) | false | false |
| `is_user_allowed_to_reopen_event` | **true** (custom; 100% of recent events) | false | false |
| `counter_offer_modification_enabled` | true (custom) | true (custom) | true (custom) |
| `send_rfp_to_evaluation_manually` | false | false | **true** (custom → evaluation-time rules differ, `api/trade_controller.rb:650-652`) |

- Counter-offer modification is on in about 100% of recent events (GMMCO 100%, PROCOL DEMO 100%, Demo Account 2 about 85%).
- Template defaults (master, item_type 0): `is_tie_bid_allowed`=true, `lock_quote_after_submission`=false, `is_order_allowed_to_close_in_extra_closing_time_only`=false, `is_buyer_not_allowed_to_add_surrogate_bid`=false, post-expiry surrogate=false, super-admin reopen=true.
- Recent events (120 days) with tie off, lock on, close-in-extra-time-only, surrogate post-expiry, or surrogate blocked: **0** on all three.
- A query for buyer-edit, last-minute-extension and dynamic-closing flags on real events timed out; I stopped it, so those values are unknown.
- Per-event settings come from the template and company configs (`trade_controller_helper.rb:3131-3149, 3327-3329`). The stage body cannot set them, except the dynamic-closing fields (`:3311-3321`).
- *Possible per-event lever (unverified):* `PATCH /trade/:id {trade_config:{…}}` **replaces** `trade_request.config` (`api/trade_controller.rb:748-757`). If used, send the full config read back from the schema, and only on QA events.

---

## 6. Proposed matrix

**Dimensions**
- Event type: RFQ / RFP+RFQ / RFP+auction (English, rank) / RFP only.
- Vendor count: 1 / 2 / 3.
- Surrogate pattern: none, or S1–S14.
- Timing pattern: T0 normal; Tpre before `bst`; Tect in extra closing time; Tpost after `ect`; Text extension; T712; Trev review window.
- Award pattern: A1 one vendor; A2 split with partial on; A3 split with partial off ± `awarded_quantity`; A4 revised after adding to the proposal (1126); A5 award during bidding.

**Distinct engine paths per combination**
- Vendor path (v1 create / products / submit).
- Revision path (`v1 helper:775-817`).
- Surrogate create path (`api/bids_controller.rb:33-85`).
- Surrogate technical path.
- Buyer-edit path.
- Time guard branches: `is_running`, counter-offer branch, `is_upcoming_or_running`.
- Rank calculator branch: unique scores vs tie at best.
- Award quantity branch.
- Evaluation completeness.

Each combination below hits at least one branch the others do not. Combinations are pairwise over (type × vendors × surrogate × timing × award) where the code actually branches. Run times assume ~1 s per call, ~4 s per login, a 45–60 s window where waited, and +8 s grace.

| # | Client | Type | Vendors | Surrogate | Timing | Award | Est. run | Steps (endpoints in §1–4) |
|---|---|---|---|---|---|---|---|---|
| M1 | 198678 | RFQ | 3 own | none | T0 | A2 split 3 ways | ~2.5 min | buyer login → draft → RFQ stage (audience = 3) → publish → for each vendor: login, GET trade, open bid, price lines (prices 100/110/120), submit → buyer GET schema / l1_data: ranks 1/2/3; each vendor's own bid shows rank = null (RFQ) → wait `ect` → proposal → add_response with 3 vendors (qty split) → workflows → submit |
| M2 | 32461 | RFQ | 2 own | none | T0 | A3 (partial off) | ~2.5 min | both vendors bid the **same** price → buyer view: both rank 2 (no L1) → wait → proposal: vendor A without `awarded_quantity` (full quantity), then vendor B without `awarded_quantity` → expect 561; second proposal with `awarded_quantity` on both → *probe the suspected gap* |
| M3 | 47053 | RFP+RFQ | 2 own | none | T0 | A1 | ~3.5 min | A: tech start/answer/submit + bid; B: tech only (no RFQ) → B's `POST /v1/bids` without tech is impossible here, so instead C (invited to both) bids RFQ without tech → **737** → wait → evaluator scores only A → submit → **571** → scores B → submit OK → award A |
| M4 | 198678 | RFP+RFQ | 1 own + 1 surrogate | S11, S6 | T0 | A1 | ~2.5 min | surrogate RFQ for vendor B with no technical response → accepted (suspect) → vendor A tech submit → surrogate tech for A → **30** → evaluate → award |
| M5 | 198678 | RFQ | 3 (A, B surrogate targets; C own) + D not invited | S2, S3, S4, S5, S7, S8, S9, S12 | Tpre→T0→Tect | — | ~3 min | stage `bst = now+60`, `bet = +120`, `ect = +180`. Pre-start: surrogate A → OK; vendor C `POST /v1/bids` → **33**. After start: C bids; surrogate for C → **96**; surrogate A again → **99**; vendor A logs in and revises → OK (old bid revised); surrogate for D (dealt with, not in audience) → *probe S7*; surrogate for a non-dealt company → **101**; buyer `POST /v1/bids` for A → **33**. After `bet`: surrogate for B → **33** |
| M6 | 32461 | RFQ | 2 own | none | Tect, Tpost | — | ~3 min | `bet = +45`, `ect = +105`. Both bid. In extra closing time: vendor create draft → OK; price lines → **508**; submit → **33**; tech → n/a. After `ect`: create → **33** |
| M7 | 198678 | RFQ | 2 own | none | Text | A4, then the 801 probe | ~3.5 min | A bids → window closes → buyer `PATCH /trade/:id {increase_auction_time: now+90}` → OK (reopen config true; on 32461 expect **496**) → B bids after the extension → A revises → check `ect` shifted → proposal adds A → A revises again → proposal submit → **1126** → new proposal + submit → `PATCH increase_auction_time` → **801** |
| M8 | 47053 | RFP+RFQ | 1 own | none | T712 | — | ~1.5 min | stage create with RFP `bet` > RFQ `bet` → **712**; valid event, then `PATCH` RFP `increase_auction_time` past RFQ end → **712**; with `extend_rfq_time:true` → OK (RFQ moved first) |
| M9 | 47053 | RFP+auction (English, rank, lot based) | 3 own | S10 | T0 | A1 | ~3 min | A bids 100 → B bids 100 → **38** if a tick is set (else accepted; tie → both rank 2) → B bids 99 → each vendor reads its own bid: rank visible → surrogate for C at 100 → **38** → event_indicators shows vendor rank (GMMCO config on) → award L1 |
| M10 | 198678 | RFQ | 2 own | S14 (buyer edit) | T0→Tect→Tpost | — | ~3 min | A bids → buyer `PATCH /bids/revise_bid/:id` with an unchanged body → **758**; with an editable field changed → OK; in extra closing time → OK; after `ect` → **101** |
| M11 | 198678 | RFQ | 2 own | none | Trev | — | ~3 min | after `bet`: `PATCH /trade/:id {end_time_type:"request_for_best_price", end_time:+60, end_time_applicable_vendor_ids:[A]}` → B revises during the window → *probe suspected defect 4* (code says accepted) |
| M12 | 32461 | RFQ | 1 own | none | T0 | A5 | ~1.5 min | vendor bids; while still running, buyer creates proposal, adds the vendor, submits → *probe suspected defect 5* (code says accepted) |
| M13 | 198678 | RFQ | 2 own | none | T0 | — | ~1.5 min | A sends `POST /user_intents {intent_type:"trade_reject", reason}` then bids → accepted (no guard); reject without a reason → **2**; A accepts the auction T&C → misc recorded; bid without accepting T&C → accepted (no guard) |
| M14 | 198678 | RFP only | 2 own + vendor A (QA) probing as vendor B | S-tech authorization (defect 2) | T0 | — | ~1.5 min | vendor A calls `create_surrogate_response` with vendor B's `company_uuid` → *probe*; buyer from a team without access → 165 |
| M15 (scheduled) | 198678 | auction | 2 own | none | dynamic closing | — | ~6 min | stage with `is_dynamic_closing_time_allowed`, `last_n_minutes_for_time_extension:1`, `time_extension_value:1`, `bet = +180` → bid inside the last minute → `bet` grows by 1 min; trigger of 2 when the window is only 3 min long → **501** at create |

Supporting single-vendor regression coverage stays in the existing `eventJourney.ts` (`stepsFor`, `journeyModel.ts:347-373`).

**What the runner needs**
1. N vendor actors. Today there is a single `j.actors.vendorApi` (`eventJourney.ts:206`) and one pick from the first page of `vendorlist_filtered` (`procol test/src/context.ts:52-55`; `flows/vendors.ts:16-28`). The `email` it uses may be the company's email rather than a user's login email; pick vendors from the database instead.
2. Separate `bst`, `bet`, `ect` per stage. Today one shared timing is used (`eventJourney.ts:1657`).
3. Expected-refusal steps. Here 33, 96, 99, 737, 712 and so on are the *pass* outcome.
4. QA vendors with an active link, as described in 5.2.

**Total time:** about 37 minutes run in sequence. Most combinations can run in parallel on separate events, but vendor logins share the 3-second bid lock per trade and company (`v1/bids_controller.rb:168-174`), so vendor steps on one event must stay in sequence.

**Uncertain / unverified (not run live)**
- The 5 suspected defects in 3.3.
- The award quantity gap with partial awarding off.
- ~~Whether a manual extension refreshes bid `end_time`~~ — answered: it does (M7, both clients).
- ~~A vendor-side cost-breakdown submission endpoint~~ — answered: none exists; vendors answer through the normal bid (open → price → submit).
- Whether a fake-looking domain (for example test.com) is a real mailbox.
- Which QA-vendor creation path produces an active link.
