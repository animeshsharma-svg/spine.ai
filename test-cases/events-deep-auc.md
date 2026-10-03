# Auctions in depth — types, conversion, configuration, live bidding, reports

Deep test cases for Procol auctions: which auction types really exist, converting an RFQ into an auction
(`POST /trade/move_to_auction`), the auction configuration block (dynamic extension, knockout, dutch, traffic light,
serial bidding), the rules a vendor's bid must pass in a live auction (tick size, ceiling/floor, price increase,
last minute, ties), what each party sees (rank, price, colour), knockout/dutch rounds, the auction reports, the
auction T&C acceptance and live audience changes — plus the dashboard side. Every case is grounded in
`procol-backend` at `origin/main` or in `procol-client-dashboard/src`. Cases with a runnable twin share the number:
`API-XDAUC-007` ↔ `EDGE-DAUC-007` in `prototype/data/api-cases-extra/deep-auc.json`.

**Read before running.**
- Auction types are the `auction_config` enum: rank 0, price 1, rank_and_price 2, traffic_light 3, knockout 4,
  dutch 5, book_building 6 (`app/models/trade_request.rb:166`). "English" is a flag (`is_english_auction_enabled`),
  "serial bidding" is a staggered line-item mode (`config.staggered` + line_item_based closing), "reverse" is simply
  `order_type: buy`, "forward" is `order_type: sell` + auctioning (`trade_request.rb:1523-1525`).
- Uuids are decoded by `ParamsAuth#check_for_uuid`: any key containing `uuid` becomes the matching `_id`.
  `Z2dnWmdaUWtnZw==` is id 999999999 (no such row); `WrongUuid1=` decodes to nil. A raw `trade_request_id` is NOT
  decoded — the older library cases AUC-CONV-001..004, AUC-PRICE-*, AUC-INC-*, AUC-DYN-* and API-CONV-* send it and
  therefore all stop at 95 before reaching what they claim to test.
- **The base conversion body** used by the runnable twins is the journey's own body
  (`procol test/src/flows/bodies.ts:725-801`) trimmed to what the controller reads: `trade_request_uuid`, one `data` row
  (product `{{productUuid}}` / line `{{lineItemUuid}}`, 10 KG, variant `{{productQualityUuid}}`), `configurations`
  (`order_type: buy`, `rfx_mode: rfq_then_auction`, `auction_config: rank`, `auction_closing_mode: lot_based`,
  window 2100-01-01 00:00–01:00, title `QA_Platform_Auction_{{stamp}}`), `audience_company_uuids: []`,
  `use_rfq_quotes_as_bids: false`, `allow_tna_vendors_to_bid: true`. **Safety backstop:** the row names a delivery
  location that does not exist (`buyer_hub.uuid = Z2dnWmdaUWtnZw==`). The conversion runs inside one transaction
  (`app/services/rfq_to_auction/create_service.rb:24-104`) and the line items are created after every configuration
  check, so a case whose guard regresses is still refused with 125 'Delivery location not found'
  (`app/controllers/concerns/trade_controller_helper.rb:855`) and rolled back — no auction is created, the sandbox RFQ
  is not closed, nobody is invited. A few cases use that 125 deliberately as their oracle ("got past the check").
- Guard order in `move_to_auction` (`app/controllers/api/trade_controller.rb:963-1012`): 95 stage not active →
  101 not latest version → 94 auction already exists → Pundit (`move_to_auction?`) → 101 other company → 93 already an
  auction → 503 line-item→lot on multi-item → row/unit checks (574/495/33/507) → `rfx_project_enabled` start/end price
  (965/966/968) → 798 fast bidding → `RfqToAuction::CreateService` (config 501/269/106/237/238/248/241/242/243/53,
  schedules, audience 511, line items 125).

## 1. Which auction types exist, and what the conversion accepts

#### API-XDAUC-001 — Converting with an auction type that does not exist crashes instead of being refused
- **Why it matters.** "Serial bidding", "english" or "Rank" are words buyers and integrators use, but none is an
  `auction_config` value. The conversion has no allow-list, so the bad value reaches an enum assignment and the buyer
  gets an untyped server error instead of "invalid auction type".
- **Setup.** {{tradeId}} is the sandbox RFQ (published, window open, one KG line, no bids). Base conversion body with
  the safety backstop.
- **Steps.** 1. Send the base conversion body with `configurations.auction_config = "serial_bidding"` to
  `POST /trade/move_to_auction`. 2. Read the status.
- **Expected.** A clean 4xx naming the bad type. Today: `change_rfq_info` assigns the value to the enum, Rails 7.0
  raises ArgumentError ("'serial_bidding' is not a valid auction_config"), which is not a CustomException, is re-raised
  and is not rescued → HTTP 500. The transaction rolls back; the sandbox RFQ is untouched.
- **Oracle.** No 5xx; `GET /trade/{{tradeId}}` still shows the RFQ open and not converted.
- **Trace.** P1 · automate · `EDGE-DAUC-001` · `app/services/rfq_to_auction/create_service.rb:231, 99-103`

#### API-XDAUC-002 — A conversion with no auction type silently becomes a rank auction
- **Why it matters.** A client bug that drops the type should be refused; instead the buyer gets a rank auction they
  did not choose, with rank visibility rules for the vendors.
- **Setup.** Sandbox RFQ; base body with the backstop.
- **Steps.** 1. Send the base body with `configurations.auction_config = null`. 2. Read the error.
- **Expected.** Today the request passes every configuration check (the type defaults to rank) and is stopped only
  by the bogus delivery location: HTTP 422 code 125 'Delivery location not found'. A future "type is required" guard
  would change this message — then update the case.
- **Oracle.** 422 + 125 proves the request reached line-item creation.
- **Trace.** P2 · automate · `EDGE-DAUC-002` · `app/controllers/concerns/trade_controller_helper.rb:3521, 3534`

#### API-XDAUC-003 — Book building can be chosen through the conversion although the screen never offers it
- **Why it matters.** The dashboard's conversion screen has no book-building tab, and the create path guards book
  building in baskets (474), but the conversion accepts it. A book-building auction behaves completely differently
  (booked quantity, no prefilled values).
- **Setup.** Sandbox RFQ; base body with the backstop.
- **Steps.** 1. Send the base body with `configurations.auction_config = "book_building"`.
- **Expected.** Today HTTP 422 code 125 'Delivery location not found' — book building only forces line-item closing
  and passes. Desired: refused as not allowed for a conversion.
- **Oracle.** 422 + 125.
- **Trace.** P2 · automate · `EDGE-DAUC-003` · `app/controllers/concerns/trade_controller_helper.rb:3349-3353, 3382`

#### API-XDAUC-004 — "Rank and price" exists in the API but cannot be chosen in the dashboard
- **Why it matters.** `rank_and_price` (vendor sees both rank and best price) is a valid type that drives rank and
  best-price widgets, but the dashboard's strategy tabs offer only rank, price, traffic light, knockout and dutch. An
  event created through the API or MCP in this mode shows indicators the buyer cannot reproduce or edit.
- **Setup.** Needs `POST /trade/template_input` (cannot run here) for creation; reading works.
- **Steps.** 1. Create an auction stage with `auction_config: "rank_and_price"` via template_input. 2. Open it in the
  dashboard's configuration drawer. 3. As a vendor, open the live auction.
- **Expected.** Backend accepts it; vendor sees rank AND best price (`should_show_rank?`, `is_best_price_required?`).
  The drawer shows no matching tab — record what it shows (it should not silently switch the strategy on save).
- **Oracle.** `GET /trade/<id>` → auction_config rank_and_price; drawer state.
- **Trace.** P2 · manual · `app/models/trade_request.rb:166, 669, 699` · `src/constants/index.js:110-118`

#### API-XDAUC-005 — The English-auction flag is ignored unless the template allows English auctions
- **Why it matters.** `is_english_auction_enabled: true` is only honoured when the template configuration carries
  `is_english_auction_allowed`; otherwise it is silently dropped and the buyer believes vendors see the best price.
- **Setup.** template_input (cannot run here). Two templates: one with `is_english_auction_allowed: true`, one without.
- **Steps.** 1. Create a rank auction with `is_english_auction_enabled: true` on each template. 2. Read both stages.
- **Expected.** Allowed template → config.is_english_auction_enabled true and `other_auction_indicators_config.best_price`
  true. Other template → flag absent, no error returned to the buyer.
- **Oracle.** `GET /trade/<id>` config of each stage.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:3615-3626`

#### API-XDAUC-006 — Knockout and dutch auctions never appear in a vendor's "participated auctions" list
- **Why it matters.** The vendor feed of running auctions filters out auction_config 4 and 5, so a vendor in a
  knockout or dutch auction cannot find it from that list on mobile.
- **Setup.** Needs a vendor session and a running knockout auction the vendor has bid in.
- **Steps.** 1. As the vendor, `GET /v1/trade/get_participated_auctions` during a running rank auction and during a
  running knockout auction.
- **Expected.** The rank auction is listed; the knockout auction is not (by design of the query). Confirm with product
  whether this is intended.
- **Oracle.** participated_auctions contents.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:144-154`

## 2. Converting an RFQ into an auction — which stage, which state, which order

#### API-XDAUC-007 — Converting a stage that does not exist is refused
- **Why it matters.** The correctly-keyed version of the not-found case (the older AUC-CONV-001 sends
  `trade_request_id`, which is never decoded, so it cannot tell a missing stage from a mis-keyed one).
- **Setup.** None beyond the buyer session.
- **Steps.** 1. Send the base body with `trade_request_uuid = "Z2dnWmdaUWtnZw=="`.
- **Expected.** HTTP 422 code 95 'Trade Request not found'. Nothing created.
- **Oracle.** 422 + 95.
- **Trace.** P1 · automate · `EDGE-DAUC-007` · `app/controllers/api/trade_controller.rb:965-969`

#### API-XDAUC-008 — A conversion request with no stage id is answered "not found", not "missing parameter"
- **Why it matters.** The one mandatory field has no presence check; client bugs that drop it look like a deleted
  stage.
- **Setup.** None.
- **Steps.** 1. Send the base body without `trade_request_uuid`.
- **Expected.** HTTP 422 code 95 'Trade Request not found' (where(id: nil)). Desired: code 2 'Insufficient parameters'.
- **Oracle.** 422 + 95.
- **Trace.** P2 · automate · `EDGE-DAUC-008` · `app/controllers/api/trade_controller.rb:965-969`

#### API-XDAUC-009 — Converting the same RFQ a second time is refused
- **Why it matters.** Two auctions on one RFQ split the vendors' bids, and awarding requires the vendor to be in the
  latest stage (826) — the second auction would orphan the first.
- **Setup.** Run with auction.convert ticked: {{pricingTradeUuid}} is the journey RFQ already converted into
  {{auctionTradeUuid}}. Base body (backstop included).
- **Steps.** 1. Send the base body with `trade_request_uuid = {{pricingTradeUuid}}`.
- **Expected.** HTTP 422 code 94 (An auction has already been made for this event.) while the RFQ is still status
  active — the normal case, conversion does not change the RFQ's status; code 95 if the award has closed it. Never a
  second child.
- **Oracle.** 422; `GET /trade/{{pricingTradeUuid}}` unchanged; still one auction stage on the event.
- **Trace.** P0 · automate · `EDGE-DAUC-009` · `app/controllers/api/trade_controller.rb:973`

#### API-XDAUC-010 — Converting the auction itself is refused
- **Why it matters.** An auction of an auction would copy auction bids as starting bids and reset the rounds.
- **Setup.** auction.convert ticked; {{auctionTradeUuid}} is the closed auction.
- **Steps.** 1. Send the base body with `trade_request_uuid = {{auctionTradeUuid}}`.
- **Expected.** HTTP 422 code 93 (Trade is already of auction type) while the auction is status active; code 95 once
  the award has closed it.
- **Oracle.** 422; no new stage.
- **Trace.** P1 · automate · `EDGE-DAUC-010` · `app/controllers/api/trade_controller.rb:979`

#### API-XDAUC-011 — Converting a running RFQ closes it immediately for every vendor
- **Why it matters.** The RFQ's open schedules are cut to "now" the moment the auction is created — a vendor typing a
  quote in the RFQ loses it. Buyers convert early "to save time" without knowing this.
- **Setup.** A published RFQ whose window is still open, with one QA vendor bid (cannot run here: a successful
  conversion of a shared event is destructive).
- **Steps.** 1. Convert the RFQ with a valid body. 2. As the vendor, try to revise the RFQ quote. 3. Read the RFQ.
- **Expected.** RFQ schedules with end_time > now are set to now; misc.is_rfq_converted_to_auction true; closed_at now;
  status stays active. The vendor's RFQ revision is refused as closed (33/101). The vendor's RFQ quote reappears as
  their first auction bid only if `use_rfq_quotes_as_bids` was true and they are in the audience.
- **Oracle.** `GET /trade/<rfq>` schedules and misc; vendor revision refusal.
- **Trace.** P0 · manual · `app/services/rfq_to_auction/create_service.rb:212-217, 168-186`

#### API-XDAUC-012 — A knockout start price is not checked at all when the RFQ has no quotes
- **Why it matters.** The 966 guard ("start price cannot be more than L1") is the only protection against a typo of
  extra zeros, and it silently disappears for an RFQ with no ranked bids.
- **Setup.** Sandbox RFQ (no bids); `rfx_project_enabled` is ON; base body with the backstop.
- **Steps.** 1. Send the base body as a knockout: `bulk_price 999999999, price_difference 10, time_difference 60`.
- **Expected.** Today HTTP 422 code 125 'Delivery location not found' — no start-price check fired. Desired: some upper
  bound (or at least the dashboard's tick ≤ base check) server-side.
- **Oracle.** 422 + 125.
- **Trace.** P1 · automate · `EDGE-DAUC-012` · `app/controllers/concerns/trade_controller_helper.rb:5811, 3452-3454`

#### API-XDAUC-013 — With an auction team, the converted auction is created as a draft and RFQ quotes wait
- **Why it matters.** Companies that route auctions to an auction team get a DRAFT auction; RFQ quotes are not copied
  until the auction team activates it, and both stages are shared with the auction team as owner. If activation never
  copies the quotes, vendors start the auction with nothing.
- **Setup.** A company with an active team of type auction; the converting buyer is not in it (cannot run here).
- **Steps.** 1. Convert an RFQ with bids and `use_rfq_quotes_as_bids: true`. 2. Read the auction. 3. As an auction-team
  user, activate it. 4. Read the auction's bids.
- **Expected.** Step 2: status draft, no bids, access lists for the auction team on RFQ and auction. Step 4: the
  quotes are present after activation. The dashboard toasts "Event sent to Auction Team successfully".
- **Oracle.** Stage status, bids before/after activation.
- **Trace.** P1 · manual · `app/services/rfq_to_auction/create_service.rb:169-171, 229, 246-261` · `app/controllers/concerns/trade_controller_helper.rb:5431-5436`

#### API-XDAUC-014 — A multi-item line-wise RFQ cannot become a lot auction, and the message talks about awarding
- **Why it matters.** The refusal is correct but reuses code 503 "You cannot award entire lot when RFQ was done for
  partial lot." — a buyer converting (not awarding) cannot understand it.
- **Setup.** A published multi-item RFQ closed line-item-wise (cannot run here: the sandbox has one item).
- **Steps.** 1. Convert with `configurations.auction_closing_mode = "lot_based"`.
- **Expected.** HTTP 422 code 503 before any row checks. Desired: a conversion-specific message.
- **Oracle.** 422 + 503.
- **Trace.** P2 · manual · `app/controllers/api/trade_controller.rb:981-984`

#### API-XDAUC-015 — Vendors who marked every line "TNA" are dropped from the auction when TNA bidding is off
- **Why it matters.** With `allow_tna_vendors_to_bid: false` such vendors are removed from the audience AND their RFQ
  quotes are not carried over; with true they stay. The dashboard defaults the checkbox to true.
- **Setup.** An RFQ with two invited vendors, one of which marked all lines TNA (needs vendor sessions).
- **Steps.** 1. Convert with `allow_tna_vendors_to_bid: false`, both vendors in the audience, quotes as bids.
  2. Repeat on a copy with true.
- **Expected.** False → only the non-TNA vendor is in the auction audience and has a bid; misc.allow_tna_vendors_to_bid
  false. True → both are present.
- **Oracle.** `GET /event_groups/<id>/get_audience`; auction bids.
- **Trace.** P1 · manual · `app/services/rfq_to_auction/create_service.rb:18, 130-145, 174-180`

#### API-XDAUC-016 — Unaccepted unregistered-vendor quotes are not carried into the auction
- **Why it matters.** Quotes from unregistered vendors count only after the buyer accepted them; carrying the rest
  would rank a vendor nobody approved.
- **Setup.** An RFQ with one unregistered-vendor quote not accepted (needs the unregistered flow).
- **Steps.** 1. Convert with quotes as bids. 2. Read the auction's bids.
- **Expected.** That quote is absent from the auction; accepted ones are present.
- **Oracle.** Auction bids list.
- **Trace.** P2 · manual · `app/services/rfq_to_auction/create_service.rb:182-185`

## 3. Conversion request shapes the controller does not guard

#### API-XDAUC-017 — A conversion without its settings block says "Order not active"
- **Why it matters.** Support chases the wrong problem: the stage IS active; the body simply lacks `configurations`.
- **Setup.** Sandbox RFQ. Refused before CreateService.
- **Steps.** 1. Send the base body without `configurations`.
- **Expected.** HTTP 422 code 33 'Order not active' (transform_trade_product finds no settings and no stage id).
  Desired: 2 'Insufficient parameters'.
- **Oracle.** 422 + 33.
- **Trace.** P1 · automate · `EDGE-DAUC-017` · `app/controllers/concerns/trade_template_helper.rb:1418-1432`

#### API-XDAUC-018 — An empty line row crashes the conversion
- **Why it matters.** The unit check assumes every row has a product hash; one malformed row gives a 500.
- **Setup.** Sandbox RFQ. Refused before CreateService.
- **Steps.** 1. Send the base body with `data = [{}, <valid row>]`.
- **Expected.** A 4xx (574 'Unit cannot be blank'). Today: `item[:product][:unit_type]` on nil → NoMethodError → 500.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EDGE-DAUC-018` · `app/controllers/concerns/trade_template_helper.rb:1393-1394`

#### API-XDAUC-019 — Line rows sent as one object instead of a list crash the conversion
- **Why it matters.** No type check on `data` before iterating it.
- **Setup.** Sandbox RFQ.
- **Steps.** 1. Send the base body with `data` = the row object itself (not wrapped in an array).
- **Expected.** A 4xx. Today each key/value pair is an Array and `Array#[](:creator_quantity)` raises TypeError → 500.
- **Oracle.** No 5xx.
- **Trace.** P2 · automate · `EDGE-DAUC-019` · `app/controllers/concerns/trade_template_helper.rb:1389-1394`

#### API-XDAUC-020 — Line rows sent as text crash the conversion
- **Why it matters.** Same gap as 019 with a scalar.
- **Setup.** Sandbox RFQ.
- **Steps.** 1. Send the base body with `data = "QA_Platform_{{stamp}}"`.
- **Expected.** A 4xx. Today String has no `each` → NoMethodError → 500.
- **Oracle.** No 5xx.
- **Trace.** P2 · automate · `EDGE-DAUC-020` · `app/controllers/concerns/trade_template_helper.rb:1389-1392`

#### API-XDAUC-021 — A line row without its variant crashes the conversion
- **Why it matters.** EDGE-AWD-083/084 dropped the variant too but were stopped by the unit check first, so this crash
  was never reached by the library.
- **Setup.** Sandbox RFQ; the row keeps a valid KG unit.
- **Steps.** 1. Send the base body with the row's `variant` removed.
- **Expected.** A 4xx. Today `item[:variant][:id]` on nil → NoMethodError → 500.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EDGE-DAUC-021` · `app/controllers/concerns/trade_template_helper.rb:1469`

#### API-XDAUC-022 — A line row without a quantity crashes the conversion
- **Why it matters.** Quantity is mandatory for an auction line but nothing checks it is present when the unit comes
  from `product.unit_type`.
- **Setup.** Sandbox RFQ.
- **Steps.** 1. Send the base body with `creator_quantity` removed and `product.unit_type = "KG"`.
- **Expected.** A 4xx. Today `item[:creator_quantity][:value]` on nil → NoMethodError → 500.
- **Oracle.** No 5xx.
- **Trace.** P2 · automate · `EDGE-DAUC-022` · `app/controllers/concerns/trade_template_helper.rb:1465`

#### API-XDAUC-023 — Two unknown units are both named in the refusal
- **Why it matters.** EDGE-AWD-084 pins the singular message; this pins the plural branch and the lower-casing the
  buyer actually sees.
- **Setup.** Sandbox RFQ.
- **Steps.** 1. Send two rows with units `QA_PLATFORM_U1` and `QA_PLATFORM_U2`.
- **Expected.** HTTP 422 code 495 with 'The units qa_platform_u1, qa_platform_u2 are not present'.
- **Oracle.** 422 + exact text.
- **Trace.** P2 · automate · `EDGE-DAUC-023` · `app/controllers/concerns/trade_template_helper.rb:1396, 1408-1415`

#### API-XDAUC-024 — Settings sent as text crash the conversion
- **Why it matters.** On a line-wise RFQ the 503 guard digs into `configurations` before anything checks its type.
- **Setup.** Sandbox RFQ (closes line-item-wise).
- **Steps.** 1. Send the base body with `configurations = "rank"`.
- **Expected.** A 4xx. Today `params.dig(:configurations, 'auction_closing_mode')` raises TypeError on a String → 500
  (on a lot-wise RFQ, `String#to_unsafe_h` in transform_config fails instead).
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EDGE-DAUC-024` · `app/controllers/api/trade_controller.rb:981` · `app/controllers/concerns/trade_template_helper.rb:1623`

#### API-XDAUC-025 — Fast (CBD) bidding needs two lines; a one-line RFQ is refused
- **Why it matters.** Correctly-keyed version of AUC-INC-004 (which never reaches this guard).
- **Setup.** Sandbox RFQ (one line).
- **Steps.** 1. Send the base body with `configurations.fast_bidding_mode_enabled = true`.
- **Expected.** HTTP 422 code 798 'CBD mode requires at least two active line items. Please add more line items to
  continue.'
- **Oracle.** 422 + 798.
- **Trace.** P1 · automate · `EDGE-DAUC-025` · `app/controllers/api/trade_controller.rb:995-999`

#### API-XDAUC-026 — A conversion without an auction window crashes
- **Why it matters.** The auction's own start/end are used before anything checks they exist.
- **Setup.** Sandbox RFQ; base body without `bid_start_time`/`bid_end_time` (crash happens inside the transaction and
  rolls back; the backstop covers a non-crash).
- **Steps.** 1. Send the base body without the two times.
- **Expected.** A 4xx. Today `create_trade_schedule` compares the copied RFQ `closed_at` with a nil end → ArgumentError
  → 500.
- **Oracle.** No 5xx; sandbox RFQ unchanged.
- **Trace.** P1 · automate · `EDGE-DAUC-026` · `app/controllers/concerns/trade_controller_helper.rb:508, 1997-2001`

#### API-XDAUC-027 — An auction that ends before it starts is accepted
- **Why it matters.** Sharper than EDGE-AWD-088 (which only asks for no 5xx): proves the inverted window passes every
  check — the RFP-vs-RFQ comparison is the only schedule check and it is skipped for rfq_then_auction.
- **Setup.** Sandbox RFQ; base body with the backstop.
- **Steps.** 1. Send start 2100-01-01 01:00, end 2100-01-01 00:00.
- **Expected.** Today HTTP 422 code 125 'Delivery location not found' (only the backstop stops it). Desired: a time
  validation error (507-style) before line-item creation.
- **Oracle.** 422 + 125.
- **Trace.** P1 · automate · `EDGE-DAUC-027` · `app/controllers/concerns/trade_controller_helper.rb:500-533, 643-675`

#### API-XDAUC-028 — An auction window entirely in the past is accepted
- **Why it matters.** Conversion closes the RFQ; pairing that with an auction that is already over leaves the vendors
  no round at all.
- **Setup.** Sandbox RFQ; base body with the backstop.
- **Steps.** 1. Send start 2000-01-01 00:00, end 2000-01-01 01:00.
- **Expected.** Today HTTP 422 code 125 'Delivery location not found'. Desired: refused as a past window.
- **Oracle.** 422 + 125.
- **Trace.** P2 · automate · `EDGE-DAUC-028` · `app/controllers/concerns/trade_controller_helper.rb:500-533`

## 4. The auction configuration block, as validated by the conversion

#### API-XDAUC-029 — Extension switched on with no trigger window is refused
- **Why it matters.** Runnable twin of STG-063 (template_input, held out): the same rule must hold on conversion.
- **Setup.** Sandbox RFQ; base body with the backstop.
- **Steps.** 1. Send `is_dynamic_closing_time_allowed: true`, `last_n_minutes_for_time_extension: null`, strategy
  rank_based, extend 2 min, rank limit 3.
- **Expected.** HTTP 422 code 501 'Invalid Trigger Time for Dynamic Time Extension.' (inside CreateService, rolled back).
- **Oracle.** 422 + 501.
- **Trace.** P1 · automate · `EDGE-DAUC-029` · `app/controllers/concerns/trade_controller_helper.rb:3317-3320`

#### API-XDAUC-030 — A zero-minute extension trigger is refused
- **Why it matters.** Lower boundary of the 1-minute floor.
- **Setup.** As 029.
- **Steps.** 1. Send the extension on with trigger 0.
- **Expected.** HTTP 422 code 501.
- **Oracle.** 422 + 501.
- **Trace.** P1 · automate · `EDGE-DAUC-030` · `app/controllers/concerns/trade_controller_helper.rb:3317`

#### API-XDAUC-031 — A trigger window longer than half the remaining auction is refused
- **Why it matters.** The half-window rule is the only time check the conversion runs on its own window.
- **Setup.** As 029; window placed in 2000 so half of the remaining time is negative.
- **Steps.** 1. Send the extension on with trigger 600 minutes and end 2000-01-01 01:00.
- **Expected.** HTTP 422 code 501.
- **Oracle.** 422 + 501.
- **Trace.** P2 · automate · `EDGE-DAUC-031` · `app/controllers/concerns/trade_controller_helper.rb:3317-3318, 6259-6268`

#### API-XDAUC-032 — A trigger window sent as text crashes the conversion
- **Why it matters.** Runnable twin of STG-066; form-encoded clients send strings.
- **Setup.** As 029.
- **Steps.** 1. Send the extension on with `last_n_minutes_for_time_extension: "5"`.
- **Expected.** A 4xx or the number accepted. Today `"5" < 1` raises ArgumentError → 500 (rolled back).
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EDGE-DAUC-032` · `app/controllers/concerns/trade_controller_helper.rb:3317`

#### API-XDAUC-033 — The extension flag sent as the text "false" switches extension ON
- **Why it matters.** A client that serialises booleans as text turns anti-sniping on when it meant off, and the
  buyer then gets a trigger-window error they never asked for.
- **Setup.** As 029.
- **Steps.** 1. Send `is_dynamic_closing_time_allowed: "false"` and no trigger window.
- **Expected.** HTTP 422 code 501 — the string is truthy. Desired: cast to boolean.
- **Oracle.** 422 + 501.
- **Trace.** P2 · automate · `EDGE-DAUC-033` · `app/controllers/concerns/trade_controller_helper.rb:3311, 3317`

#### API-XDAUC-034 — A one-minute trigger with a long window passes the extension check
- **Why it matters.** Boundary pair with 030: 0 refused, 1 accepted.
- **Setup.** As 029; window in 2100.
- **Steps.** 1. Send the extension on with trigger 1, extend 2, rank limit 3.
- **Expected.** HTTP 422 code 125 'Delivery location not found' — the extension check passed. A 501 here is a
  regression.
- **Oracle.** 422 + 125.
- **Trace.** P2 · automate · `EDGE-DAUC-034` · `app/controllers/concerns/trade_controller_helper.rb:3317`

#### API-XDAUC-035 — A negative extension length is stored without any check
- **Why it matters.** In the live auction a last-minute bid would move the end time BACK — anti-sniping turned into an
  early close.
- **Setup.** As 029.
- **Steps.** 1. Send the extension on, trigger 1, `time_extension_value: -5`.
- **Expected.** Today HTTP 422 code 125 'Delivery location not found' (value accepted). Desired: refused (> 0).
- **Oracle.** 422 + 125.
- **Trace.** P1 · automate · `EDGE-DAUC-035` · `app/controllers/concerns/trade_controller_helper.rb:3376` · `app/models/bid.rb:2264-2282`

#### API-XDAUC-036 — A text rank limit for the extension is stored and blows up in the final minutes
- **Why it matters.** The bad value is accepted at set-up; the live price-based check compares an Integer rank with it
  and raises on the vendor's last-minute bid.
- **Setup.** As 029, strategy price_based.
- **Steps.** 1. Send the extension on, trigger 1, `rank_limit_for_time_extension: "top"`.
- **Expected.** Today HTTP 422 code 125 'Delivery location not found'. Desired: refused (positive integer).
- **Oracle.** 422 + 125.
- **Trace.** P1 · automate · `EDGE-DAUC-036` · `app/controllers/concerns/trade_controller_helper.rb:3321, 3378` · `app/models/bid.rb:452`

#### API-XDAUC-037 — An unknown extension strategy is stored and the extension never fires
- **Why it matters.** Neither the rank_based nor the price_based branch matches in the live auction, so the protection
  the buyer switched on silently does nothing.
- **Setup.** As 029.
- **Steps.** 1. Send the extension on, trigger 1, `dynamic_closing_time_strategy: "qa_platform_strategy"`.
- **Expected.** Today HTTP 422 code 125 'Delivery location not found'. Desired: refused (rank_based | price_based).
- **Oracle.** 422 + 125.
- **Trace.** P2 · automate · `EDGE-DAUC-037` · `app/models/model_helpers/trade_request_model_helper.rb:501-503` · `app/models/bid.rb:399-406`

#### API-XDAUC-038 — A traffic-light conversion without colour bounds is refused
- **Why it matters.** Without bounds every vendor's colour is undefined.
- **Setup.** Sandbox RFQ; base body with the backstop; lot closing.
- **Steps.** 1. Send `auction_config: traffic_light`, `traffic_light_config: price`, no `traffic_light_ranges`.
- **Expected.** HTTP 422 code 269 'You have not provided valid traffic light ranges.'
- **Oracle.** 422 + 269.
- **Trace.** P1 · automate · `EDGE-DAUC-038` · `app/controllers/concerns/trade_controller_helper.rb:3436-3441`

#### API-XDAUC-039 — Equal traffic-light bounds are refused although the screen accepts them
- **Why it matters.** The dashboard only blocks lower > upper; the server needs lower < upper for buy. The buyer gets a
  server error for input the form accepted.
- **Setup.** As 038.
- **Steps.** 1. Send lower_bound = upper_bound = 100 on a buy auction.
- **Expected.** HTTP 422 code 269 'You have not provided valid traffic light ranges.' Pair with UI-XDAUC-012.
- **Oracle.** 422 + 269.
- **Trace.** P1 · automate · `EDGE-DAUC-039` · `app/controllers/concerns/trade_controller_helper.rb:3167-3170, 3444` · `src/views/eventCreation/components/auctionConfiguration/auctionConfiguration.jsx:681-686`

#### API-XDAUC-040 — A knockout starting at zero is refused
- **Why it matters.** Runnable conversion twin of STG-044.
- **Setup.** Sandbox RFQ; base body with the backstop.
- **Steps.** 1. Send knockout with `bulk_price 0, price_difference 10, time_difference 60`.
- **Expected.** HTTP 422 code 106 'Please enter a valid price'.
- **Oracle.** 422 + 106.
- **Trace.** P1 · automate · `EDGE-DAUC-040` · `app/controllers/concerns/trade_controller_helper.rb:3452-3454`

#### API-XDAUC-041 — Knockout rounds shorter than 30 seconds are refused
- **Why it matters.** Boundary of the round floor; the dashboard sends minutes×60, so 0.5 min = 30 s is its minimum.
- **Setup.** As 040.
- **Steps.** 1. Send knockout 1000 / 10 / `time_difference 29`.
- **Expected.** HTTP 422 code 248 'Time difference cannot be less than 30 seconds'.
- **Oracle.** 422 + 248.
- **Trace.** P1 · automate · `EDGE-DAUC-041` · `app/controllers/concerns/trade_controller_helper.rb:3455-3457`

#### API-XDAUC-042 — A knockout round length sent as text crashes the conversion
- **Why it matters.** Runnable conversion twin of STG-047.
- **Setup.** As 040.
- **Steps.** 1. Send knockout with `time_difference: "60"`.
- **Expected.** A 4xx. Today `"60" < 30` raises ArgumentError → 500 (rolled back).
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EDGE-DAUC-042` · `app/controllers/concerns/trade_controller_helper.rb:3455`

#### API-XDAUC-043 — A knockout without a price step is refused
- **Why it matters.** Without a step the rounds never move the price.
- **Setup.** As 040.
- **Steps.** 1. Send knockout with bulk 1000 and time_difference 60, no `price_difference`.
- **Expected.** HTTP 422 code 237 'Please enter all the required entries for creating the auction.'
- **Oracle.** 422 + 237.
- **Trace.** P1 · automate · `EDGE-DAUC-043` · `app/controllers/concerns/trade_controller_helper.rb:3458-3460`

#### API-XDAUC-044 — A knockout round longer than the whole auction is refused
- **Why it matters.** The second price would never be offered.
- **Setup.** As 040; window 60 seconds (2100-01-01 00:00–00:01).
- **Steps.** 1. Send knockout 1000 / 10 / `time_difference 120`.
- **Expected.** HTTP 422 code 238 'Time difference cannot be greater than auction time.'
- **Oracle.** 422 + 238.
- **Trace.** P1 · automate · `EDGE-DAUC-044` · `app/controllers/concerns/trade_controller_helper.rb:3461-3462`

#### API-XDAUC-045 — A knockout without an end time crashes the conversion
- **Why it matters.** The knockout block reads the end time before anything checks it exists.
- **Setup.** As 040; no bid_start_time/bid_end_time.
- **Steps.** 1. Send a valid knockout (1000 / 10 / 60) without the window.
- **Expected.** A 4xx. Today `(now + 60) > nil` raises ArgumentError → 500 (rolled back).
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EDGE-DAUC-045` · `app/controllers/concerns/trade_controller_helper.rb:3461-3462`

#### API-XDAUC-046 — A dutch auction whose start is above its end is refused with the wording reversed
- **Why it matters.** The rule fires because the start is GREATER than the end on a buy auction, but the message says
  it cannot be LESS — the buyer lowers the start and hits the same error. 241 has the mirror problem for sell.
- **Setup.** Sandbox RFQ; base body with the backstop.
- **Steps.** 1. Send dutch buy with `bulk_price 1000, end_price 500, price_difference 10, time_difference 60`.
- **Expected.** HTTP 422 code 242 'Start Price cannot be less than End Price' (wording to be fixed to "greater").
- **Oracle.** 422 + 242.
- **Trace.** P1 · automate · `EDGE-DAUC-046` · `app/controllers/concerns/trade_controller_helper.rb:3488-3495` · `config/locales/en-IN.yml (241/242)`

#### API-XDAUC-047 — A dutch price step bigger than the whole range is refused
- **Why it matters.** Runnable conversion twin of STG-052.
- **Setup.** As 046.
- **Steps.** 1. Send dutch buy 100 → 200 with `price_difference 500`.
- **Expected.** HTTP 422 code 243 'Invalid Tick Size'.
- **Oracle.** 422 + 243.
- **Trace.** P2 · automate · `EDGE-DAUC-047` · `app/controllers/concerns/trade_controller_helper.rb:3494`

#### API-XDAUC-048 — A serial-bidding item scheduled outside the auction window is refused
- **Why it matters.** Each serial item must fit inside the event; an item before the start would open early.
- **Setup.** Sandbox RFQ. Refused before CreateService.
- **Steps.** 1. Send `auction_closing_mode: line_item_based, staggered: true`, window 2100-01-01 00:00–01:00, and the
  row with start 23:40 the evening before and end 00:20.
- **Expected.** HTTP 422 code 507 'Invalid Time Input'.
- **Oracle.** 422 + 507.
- **Trace.** P1 · automate · `EDGE-DAUC-048` · `app/controllers/concerns/trade_template_helper.rb:1520-1522, 1689, 1699-1705`

#### API-XDAUC-049 — A serial-bidding item with no times crashes the conversion
- **Why it matters.** Rows are not checked for their own times before `Time.at`.
- **Setup.** Sandbox RFQ.
- **Steps.** 1. Send the staggered settings of 048 with a row that has no start_time/end_time.
- **Expected.** A 4xx (507). Today `Time.at(nil)` → TypeError → 500.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EDGE-DAUC-049` · `app/controllers/concerns/trade_template_helper.rb:1684-1689, 1701`

#### API-XDAUC-050 — A knockout start price above the RFQ's L1 is refused
- **Why it matters.** The only server-side link between RFQ quotes and the auction's opening price. EDGE-AWD-086
  targets the sandbox, which has no quotes, so it can never fire there.
- **Setup.** A published RFQ with one ranked quote of total T, no auction yet, `rfx_project_enabled` ON (needs the
  journey RFQ before conversion — not available to edge cases).
- **Steps.** 1. Convert as knockout with `bulk_price = T` (equal) and again with T − 1.
- **Expected.** Equal → 422 code 966 'Starting price cannot be more than the lowest RFQ (L1) Sum Total' (the check is
  `<=`). T − 1 → passes this check. Dutch: end price above L1 → 968.
- **Oracle.** 422 + 966 / acceptance.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:5776-5821` · `app/controllers/api/trade_controller.rb:989-993`

## 5. What the conversion copies — read-back

#### API-XDAUC-051 — The converted auction reads back as an auction stage linked to its RFQ
- **Why it matters.** The read-back oracle for every conversion case.
- **Setup.** auction.convert ticked.
- **Steps.** 1. `GET /trade/{{auctionTradeUuid}}`.
- **Expected.** HTTP 200: rfx_mode rfq_then_auction, current status auctioning, auction_config rank, stage number one
  after the RFQ, parent = the RFQ, the QA vendor's RFQ quote carried over as a bid.
- **Oracle.** Field values in the reply.
- **Trace.** P1 · automate · `EDGE-DAUC-051` · `app/services/rfq_to_auction/create_service.rb:226-235, 168-186`

#### API-XDAUC-052 — The RFQ reads back closed for bidding and flagged as converted
- **Why it matters.** Proves conversion cuts the RFQ window immediately.
- **Setup.** auction.convert ticked.
- **Steps.** 1. `GET /trade/{{pricingTradeUuid}}`.
- **Expected.** HTTP 200: bidding schedule ends at the conversion time, misc.is_rfq_converted_to_auction true, status
  still active (only MarkEventClosedWorker closes a stage, when all its lines are closed).
- **Oracle.** Field values.
- **Trace.** P1 · automate · `EDGE-DAUC-052` · `app/services/rfq_to_auction/create_service.rb:212-217` · `app/workers/mark_event_closed_worker.rb:5-15`

#### API-XDAUC-053 — Savings set-up is not carried into the auction, and a lost reference is only logged
- **Why it matters.** The auction starts with savings_data/savings_configuration removed; if the RFQ's reference
  prices do not survive, the buyer gets no error — only a Sentry event — and savings reports go blank.
- **Setup.** An RFQ with a lot-based savings configuration (needs template set-up).
- **Steps.** 1. Convert. 2. Read the auction's savings configuration and the savings report.
- **Expected.** Savings re-derived for the auction from the request; any missing reference key raises "Savings
  configuration is not present in Auction" to Sentry and the request still returns 200.
- **Oracle.** Auction misc.savings_configuration vs RFQ.
- **Trace.** P2 · manual · `app/services/rfq_to_auction/create_service.rb:219-224` · `app/controllers/api/trade_controller.rb:1008, 1015-1045`

#### API-XDAUC-054 — Weighted scoring is copied only when asked
- **Why it matters.** A weighted RFQ converted without `transfer_weights` ranks the auction on plain price.
- **Setup.** A weighted RFQ (line-item weights).
- **Steps.** 1. Convert with transfer_weights false; 2. on a copy with true.
- **Expected.** True → weightages duplicated per new line; false → none.
- **Oracle.** Weightage rows on the auction.
- **Trace.** P2 · manual · `app/services/rfq_to_auction/create_service.rb:77-79, 263-278`

#### API-XDAUC-055 — Auction reminder mails are scheduled 24 hours and 30 minutes before the start
- **Why it matters.** Vendors join late without them; a start under 30 minutes away gets no reminder at all.
- **Setup.** Successful conversions with starts 2 days, 2 hours and 10 minutes ahead.
- **Steps.** 1. Convert each. 2. Inspect scheduled EmailNotificationWorker jobs.
- **Expected.** 2 days → both reminders; 2 hours → only the 30-minute one; 10 minutes → none.
- **Oracle.** Sidekiq scheduled set.
- **Trace.** P2 · manual · `app/services/rfq_to_auction/create_service.rb:295-315`

#### API-XDAUC-056 — Knockout and dutch conversions create their first round for the active, non-broker audience
- **Why it matters.** A vendor missing from round 1 can never accept an offer (458).
- **Setup.** Successful knockout conversion published active, audience = two vendors + one broker.
- **Steps.** 1. Convert. 2. Read the auction's trade rounds.
- **Expected.** Round 1 starts at the auction start with the start price, participants = the two active vendors (not
  the broker). A draft (auction-team) conversion creates no rounds.
- **Oracle.** trade_rounds rows.
- **Trace.** P1 · manual · `app/services/rfq_to_auction/create_service.rb:198-210`

#### API-XDAUC-057 — Only one live auction per RFQ — but a draft auction does not block a second at model level
- **Why it matters.** The controller's 94 guard counts drafts; the model validation does not
  (`not_draft_or_cancelled_or_withdrawn`). Any path that bypasses the controller (MCP, clone) can create a second
  auction while the first is a draft.
- **Setup.** An auction-team company (draft conversions).
- **Steps.** 1. Convert (draft). 2. Convert again via the controller. 3. Via any non-controller creation path.
- **Expected.** Step 2 → 94. Step 3 should also be refused; record what happens.
- **Oracle.** Number of children of the RFQ.
- **Trace.** P2 · manual · `app/models/trade_request.rb:3100-3105` · `app/controllers/api/trade_controller.rb:973`

## 6. Auction set-up on the create screen (template_input — not runnable here)

#### API-XDAUC-058 — Book building inside a basket auction is refused
- **Why it matters.** STG-049 covers knockout-in-basket; book building and dutch take the same guard.
- **Setup.** A draft event; template_input with `is_basket_auction: true`.
- **Steps.** 1. Add an auction stage with `auction_config: book_building`. 2. Repeat with dutch.
- **Expected.** HTTP 422 code 474 'Sorry, trade with this configuration is not allowed' for both.
- **Oracle.** 422 + 474; no stage.
- **Trace.** P2 · manual · `app/controllers/api/trade_controller.rb:139-144`

#### API-XDAUC-059 — An auction stage without an order type is refused
- **Why it matters.** Order type decides reverse vs forward auction and the direction every price rule takes.
- **Setup.** template_input on a draft event, web client (mobile is exempt).
- **Steps.** 1. Add a rank auction stage without `order_type`.
- **Expected.** HTTP 422 code 53 'Order Type not mentioned'. (Note: without order_type the price-increase rule would
  default to allowed — `get_config_for_new_trade` else-branch.)
- **Oracle.** 422 + 53.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:3530-3532, 3150-3159`

#### API-XDAUC-060 — Fast bidding on a standalone line-wise auction is refused
- **Why it matters.** CBD only works lot-wise or on converted RFQs.
- **Setup.** template_input, rfx_mode auction, auction_closing_mode line_item_based.
- **Steps.** 1. Add the stage with `fast_bidding_mode_enabled: true`.
- **Expected.** HTTP 422 code 101.
- **Oracle.** 422 + 101.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:3354-3359`

#### API-XDAUC-061 — Ceiling, floor and tick size per line are stored without cross-checks
- **Why it matters.** A ceiling below the floor makes every bid impossible (38 above, 41 below); a tick and a tick
  percentage on the same line are both enforced.
- **Setup.** template_input auction stage, one row with ceil_price 90, floor_price 100, tick_size 5,
  tick_size_percentage 2.
- **Steps.** 1. Create the stage. 2. Read the line validations.
- **Expected.** Stage created; validations.default holds all four values unchanged. Desired: refuse ceil < floor and
  tick > ceil−floor. (The dashboard's conversion screen leaves only these three columns editable.)
- **Oracle.** Line validations in `GET /trade/<id>`.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_template_helper.rb:1455-1459, 1477-1488`

#### API-XDAUC-062 — Tie bids are allowed unless the stage says otherwise
- **Why it matters.** `is_tie_bid_allowed` missing means allowed; a template that forgets the key lets two vendors
  sit on the same price (see API-XDAUC-081 for the rank this produces).
- **Setup.** Two auction stages: one with config is_tie_bid_allowed false, one without the key.
- **Steps.** 1. Read both configs; 2. run API-XDAUC-072 on each.
- **Expected.** Missing key → tie accepted; false → 98.
- **Oracle.** Vendor bid outcome.
- **Trace.** P2 · manual · `app/controllers/concerns/bids_controller_helper.rb:125`

#### API-XDAUC-063 — Choosing book building switches the auction to line-wise closing
- **Why it matters.** Book building is quantity-led; the backend forces line_item_based closing and turns off
  prefilled values regardless of what the buyer chose.
- **Setup.** template_input auction with `auction_config: book_building`, `auction_closing_mode: lot_based`.
- **Steps.** 1. Create. 2. Read config.
- **Expected.** auction_closing_mode line_item_based, rank_type inline, is_prefilled_value false; booked-quantity
  widgets added.
- **Oracle.** Stage config/widgets.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:3349-3353, 3382, 3389` · `app/controllers/concerns/trade_template_helper.rb:1765-1770`

#### API-XDAUC-064 — Editing the extension on a live auction re-checks the trigger against the stage's own end
- **Why it matters.** On update there is no bid_end_time param, so the half-window rule uses the stage's end — near
  the close any trigger is refused.
- **Setup.** A live auction with 10 minutes left (needs a live auction).
- **Steps.** 1. PATCH the stage's dynamic extension with trigger 6 minutes.
- **Expected.** 422 code 501 (6 > 10/2). Trigger 4 → accepted.
- **Oracle.** 422 + 501 / 200.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:3316-3320` · `src/views/orderDetails/eventDetails.jsx:853-870`

## 7. Bidding in a live auction (needs a vendor session — markdown only)

#### API-XDAUC-065 — A revision that moves the price by less than the tick is refused
- **Why it matters.** The tick stops penny-shaving that churns ranks without real savings.
- **Setup.** Live rank auction, tick_size 10 on the line; vendor's active bid at 1000.
- **Steps.** 1. As the vendor, revise to 995.
- **Expected.** 422 code 214 'Quoted price difference must be greater than the tick size'. Revise to 990 → accepted.
- **Oracle.** 422 + 214 / new bid at 990.
- **Trace.** P0 · manual · `app/controllers/concerns/bids_controller_helper.rb:1869-1879`

#### API-XDAUC-066 — Re-submitting exactly the same price is not stopped by the tick rule
- **Why it matters.** A zero difference is explicitly skipped, so a vendor can re-submit to bump the timestamp (and
  in the last minutes trigger an extension under the rank strategy).
- **Setup.** As 065.
- **Steps.** 1. Revise at 1000 again.
- **Expected.** Not refused by 214 (`!price_difference.zero?`). Record whether a new bid row and an extension result.
- **Oracle.** Bid history; schedules.
- **Trace.** P1 · manual · `app/controllers/concerns/bids_controller_helper.rb:1875-1876`

#### API-XDAUC-067 — The tick is measured against the vendor's own last bid, in either direction
- **Why it matters.** The tick is not relative to L1, and `abs` means an INCREASE by more than the tick also passes the
  tick rule (only the price-increase rule, 300, can stop it).
- **Setup.** As 065; vendor A at 1000, vendor B (L1) at 900; `is_price_increase_allowed` true on the stage.
- **Steps.** 1. A revises to 989 (beats own by 11, still above L1). 2. A revises to 1100.
- **Expected.** Step 1 accepted (tick vs own bid). Step 2 passes the tick rule; accepted because increases are allowed.
- **Oracle.** Bid outcomes.
- **Trace.** P1 · manual · `app/controllers/concerns/bids_controller_helper.rb:1866-1875`

#### API-XDAUC-068 — A percentage tick is converted to a value from the previous bid
- **Why it matters.** 2 % of the previous price, not of the start; a cheaper bid needs a smaller absolute move.
- **Setup.** tick_size_percentage 2 on the line; vendor at 1000.
- **Steps.** 1. Revise to 985. 2. Revise to 980.
- **Expected.** 985 → 214 (15 < 20); 980 → accepted.
- **Oracle.** 422 + 214 / accepted.
- **Trace.** P1 · manual · `app/controllers/concerns/bids_controller_helper.rb:1881-1891`

#### API-XDAUC-069 — Bids above the ceiling or below the floor are refused
- **Why it matters.** The ceiling is the buyer's budget cap in a reverse auction; the floor stops dumping.
- **Setup.** Line ceil_price 1000, floor_price 500.
- **Steps.** 1. Bid 1001. 2. Bid 499. 3. Bid 1000 and 500.
- **Expected.** 1001 → 38 'Price cannot be more than the allowed price'; 499 → 41 'Price cannot be less than the
  allowed price'; the bounds themselves accepted (comparison after currency rounding).
- **Oracle.** Codes; accepted bids.
- **Trace.** P0 · manual · `app/controllers/concerns/bids_controller_helper.rb:1839-1855`

#### API-XDAUC-070 — Raising the price in a reverse auction is refused when increases are off
- **Why it matters.** The core reverse-auction contract; in a forward (sell) auction the mirror rule refuses decreases.
- **Setup.** Live buy auction with config is_price_increase_allowed false; vendor at 1000.
- **Steps.** 1. Revise to 1010. 2. On a sell auction with is_price_decrease_allowed false, revise down.
- **Expected.** 1 → 300 'You cannot increase the price'; 2 → 301 'You cannot decrease the price'. With approval
  required instead, the revision becomes a pending approval request.
- **Oracle.** Codes / additional request.
- **Trace.** P0 · manual · `app/helpers/api/bids_helper.rb:5-11` · `app/models/model_helpers/trade_request_model_helper.rb:69-107`

#### API-XDAUC-071 — In the last five minutes a single-line bid can never go up — measured on the original end time
- **Why it matters.** Applies to every non-sell stage (RFQs too) and uses `bid_end_time`, not the extended end — after a
  dynamic extension the window may be wrong.
- **Setup.** Single-line live auction, increases allowed; vendor at 1000; 4 minutes left.
- **Steps.** 1. Revise to 1010. 2. After a dynamic extension pushes the end out, repeat.
- **Expected.** 300 'You cannot increase the price' in both cases while within 5 minutes of bid_end_time; record which
  end time is used after an extension.
- **Oracle.** Codes.
- **Trace.** P1 · manual · `app/controllers/concerns/bids_controller_helper.rb:139-141` · `app/models/bid.rb:1423-1428`

#### API-XDAUC-072 — A bid at a price another vendor already holds is refused when ties are off
- **Why it matters.** With ties off, the second vendor must quote a different price.
- **Setup.** Live auction, config is_tie_bid_allowed false; vendor B holds 900.
- **Steps.** 1. Vendor A bids 900 (single line, then a multi-line stage).
- **Expected.** 98 'A bid at this price already exists, please quote a different price.' in both layouts; RFQ and
  offline stages are exempt; re-quoting your OWN price is not a tie.
- **Oracle.** 422 + 98.
- **Trace.** P1 · manual · `app/controllers/concerns/bids_controller_helper.rb:142-153, 1916-2003`

#### API-XDAUC-073 — Quantity rules in an auction bid
- **Why it matters.** Fixed-quantity auctions must be bid for the full quantity; floor quantity protects minimum lots.
- **Setup.** Lines with allow_fixed_quantity_for_bidding, floor_quantity 5, over/under quantity off.
- **Steps.** 1. Bid quantity ≠ auction quantity. 2. Above. 3. Below. 4. Below floor.
- **Expected.** 207 'Bid Quantity should be equal to the Auction Quantity'; 138; 139; 39.
- **Oracle.** Codes.
- **Trace.** P1 · manual · `app/controllers/concerns/bids_controller_helper.rb:1893-1908`

#### API-XDAUC-074 — A bid after the auction has ended is refused
- **Why it matters.** The window is the auction; anything after it is a buyer action (surrogate in extra closing time)
  or a counter-offer flow.
- **Setup.** Auction just ended; vendor session.
- **Steps.** 1. Revise the bid.
- **Expected.** 422 code 33 (or 101 when the buyer can edit bids). A buyer surrogate bid is allowed only during the
  auction's extra closing time.
- **Oracle.** Codes.
- **Trace.** P1 · manual · `app/controllers/concerns/bids_controller_helper.rb:67-85`

## 8. Dynamic extension during a live auction (markdown only)

#### API-XDAUC-075 — A bid in the last N minutes pushes the end out by the configured minutes
- **Why it matters.** The anti-sniping promise made to every vendor.
- **Setup.** Live rank auction: extension on, trigger 2 minutes, extend 3, strategy rank_based, rank limit 3.
- **Steps.** 1. With 90 s left, a vendor moves from rank 4 to rank 2. 2. Read the schedules.
- **Expected.** A dynamic_extra_time schedule from the old end to old end + 3 min; closed_at moved; every bid's
  end_time updated; misc.dynamic_time_extension_count +1.
- **Oracle.** `GET /trade/<id>` schedules/end time.
- **Trace.** P0 · manual · `app/models/bid.rb:411-425, 355-372, 2256-2288` · `app/models/trade_schedule.rb:176-181`

#### API-XDAUC-076 — There is no cap on the number of extensions
- **Why it matters.** Two vendors trading bids can extend forever; the only brake is a sealed-bid suggestion shown after
  5 extensions.
- **Setup.** As 075.
- **Steps.** 1. Trigger 6 extensions. 2. Read the stage as the buyer.
- **Expected.** All 6 applied; config.show_sealbid_feature_notification true after the 6th.
- **Oracle.** Extension count; config flag.
- **Trace.** P1 · manual · `app/controllers/api/v1/trade_controller.rb:314-318` · `app/models/trade_schedule.rb:176-181`

#### API-XDAUC-077 — Rank-based extension fires only when the change touches the top N
- **Why it matters.** Movement below the limit must not keep the auction open.
- **Setup.** As 075, rank limit 2.
- **Steps.** 1. In the trigger window, a vendor moves from rank 5 to 4. 2. Another from 3 to 1.
- **Expected.** 1 → no extension; 2 → extension.
- **Oracle.** Schedules.
- **Trace.** P1 · manual · `app/models/bid.rb:439-448`

#### API-XDAUC-078 — Price-based extension needs a better price within the rank limit
- **Why it matters.** A worse re-bid must not extend.
- **Setup.** Strategy price_based, rank limit 3.
- **Steps.** 1. In the window, a rank-2 vendor improves its price. 2. A rank-5 vendor improves. 3. A rank-1 vendor
  re-bids higher (increase allowed).
- **Expected.** Only 1 extends.
- **Oracle.** Schedules.
- **Trace.** P1 · manual · `app/models/bid.rb:401-405, 450-462`

#### API-XDAUC-079 — Extension switched on with no extension length breaks the vendor's last-minute bid
- **Why it matters.** The journey's own body sends `time_extension_value: null`; with extension on, the trigger path
  computes `nil * 60` in an after-commit callback — the vendor's bid is saved but the request errors and no extension
  happens.
- **Setup.** Auction with extension on, trigger 2, time_extension_value null (template_input accepts it).
- **Steps.** 1. With 60 s left, a vendor improves rank.
- **Expected.** Desired: refused at set-up (or default 3 minutes, as update_dynamic_closing_schedule does). Today:
  NoMethodError in `trigger_dynamic_time_extension` after commit → 5xx to the vendor, bid saved, no extension.
- **Oracle.** Vendor reply; bid present; schedules unchanged.
- **Trace.** P0 · manual · `app/models/bid.rb:355-357, 149` · `procol test/src/flows/bodies.ts:783`

#### API-XDAUC-080 — Price-based extension with no rank limit breaks the vendor's last-minute bid
- **Why it matters.** `new_rank <= nil` / the Integer sig on `dynamic_time_extension_applicable_for_price?` raise for a
  missing limit — and nothing at set-up requires the limit.
- **Setup.** Extension on, price_based, rank_limit_for_time_extension null.
- **Steps.** 1. In the window, a vendor improves price.
- **Expected.** Desired: limit required at set-up. Today: error during save_scores_on_line_item (after commit).
- **Oracle.** Vendor reply; extension absent.
- **Trace.** P1 · manual · `app/models/bid.rb:450-452` · `app/controllers/concerns/trade_controller_helper.rb:3321, 3378`

## 9. What a vendor sees: rank, price, colour, ties (markdown only)

#### API-XDAUC-081 — Two vendors tied at the best price are both shown rank 2 — nobody is rank 1
- **Why it matters.** There is no timestamp tie-break: ranks are dense, and when more than one vendor holds the best
  score every rank shifts by one. Vendors read "rank 2" as "someone beat me" and cut again.
- **Setup.** Live rank auction, ties allowed; vendor A 900, vendor B 900, vendor C 950.
- **Steps.** 1. Read each vendor's rank (vendor view and buyer bid cards).
- **Expected.** A → 2, B → 2, C → 3 (sorted unique scores [900, 950] → 1, 2; best rank shared → +1). Confirm this
  is the intended product rule; if "earlier bid wins" is expected, this is a defect.
- **Oracle.** Rank values in indicators and bid list.
- **Trace.** P1 · manual · `app/models/concerns/bid_rank_helper.rb:208-222` · `app/services/event_indicators/concerns/rank_calculator.rb:22-31`

#### API-XDAUC-082 — Which indicator each auction type shows vendors
- **Why it matters.** The fairness contract: a vendor must see exactly what the strategy promises.
- **Setup.** One live auction per type, plus a knockout and a dutch on an eRFX company.
- **Steps.** 1. As a vendor, read each auction's indicators. 2. As the buyer, toggle "Show Rank" / "Show Best Prices".
- **Expected.** rank/rank_and_price → rank shown; price/rank_and_price → best price shown; traffic light → colour (and
  rank only for rank-based traffic light, v1 layouts); knockout/dutch → rank hidden from vendors, shown to the buyer;
  the buyer's toggles add rank/best_price via other_auction_indicators_config.
- **Oracle.** event_indicators per caller.
- **Trace.** P0 · manual · `app/models/trade_request.rb:654-700` · `src/views/orderDetails/auctionIndicators.jsx:68-308`

## 10. Knockout and dutch rounds

#### API-XDAUC-083 — Accepting a knockout offer on a stage that is not a knockout is refused
- **Why it matters.** The accept endpoints have no permission check at all; the stage lookup is the first line of
  defence.
- **Setup.** Sandbox RFQ (auction_config defaults to rank). Refused before any write.
- **Steps.** 1. `POST /bids/accept_knockout_offer` with `{"trade_request_uuid": "{{tradeId}}", "accepted_round_no": 1}`.
- **Expected.** HTTP 422 code 95 'Trade Request not found'.
- **Oracle.** 422 + 95.
- **Trace.** P1 · automate · `EDGE-DAUC-083` · `app/controllers/concerns/bids_controller_helper.rb:818-820` · `app/controllers/api/bids_controller.rb:199-233`

#### API-XDAUC-084 — Accepting a dutch offer on a stage that is not a dutch auction is refused
- **Why it matters.** A dutch acceptance creates AND closes (awards) a bid in one call — the most destructive single
  request in the auction family.
- **Setup.** Sandbox RFQ. Refused before any write.
- **Steps.** 1. `POST /bids/accept_dutch_offer` with `{"trade_request_uuid": "{{tradeId}}", "accepted_round_no": 1,
  "participant_quantity": 10}`.
- **Expected.** HTTP 422 code 95 'Trade Request not found'.
- **Oracle.** 422 + 95.
- **Trace.** P1 · automate · `EDGE-DAUC-084` · `app/controllers/concerns/bids_controller_helper.rb:818-820` · `app/controllers/api/bids_controller.rb:236-270`

#### API-XDAUC-085 — Accepting a round that is not running, or as a non-participant, is refused
- **Why it matters.** Only the current round's participants may take its price.
- **Setup.** A running knockout; vendor V in round 2's participants, vendor W knocked out.
- **Steps.** 1. V accepts round 1 (finished). 2. W accepts round 2. 3. The buyer accepts round 2.
- **Expected.** 1 → 457 'No such offer exists!'; 2 and 3 → 458 'You cannot participate in this offer !'.
- **Oracle.** Codes.
- **Trace.** P1 · manual · `app/controllers/concerns/bids_controller_helper.rb:832-837`

#### API-XDAUC-086 — The same round cannot be accepted twice; a dutch price only once in total
- **Why it matters.** Double acceptance would double the vendor's bid revisions or awards.
- **Setup.** Running knockout and dutch auctions.
- **Steps.** 1. In the knockout, V accepts round 2 twice. 2. In the dutch, V accepts round 1 then round 2.
- **Expected.** 1 → second call 459 'You have already accepted this offer, please wait for the next one.';
  2 → second call 458.
- **Oracle.** Codes; one acceptance recorded.
- **Trace.** P1 · manual · `app/controllers/concerns/bids_controller_helper.rb:841-854`

#### API-XDAUC-087 — Dutch acceptance with multiple winners needs a valid quantity
- **Why it matters.** Multi-vendor dutch closing splits the quantity; a missing or zero quantity would award nothing.
- **Setup.** Single-line dutch, closing_mode multiple, floor quantity 5.
- **Steps.** 1. Accept with no participant_quantity. 2. With 0. 3. With 3.
- **Expected.** 249 'Quantity Missing'; 101; 246 'Quantity is less than minimum quantity'.
- **Oracle.** Codes.
- **Trace.** P2 · manual · `app/controllers/api/bids_controller.rb:243-253`

## 11. Reports and reads during and after an auction

#### API-XDAUC-088 — The auction report for a stage that does not exist crashes
- **Why it matters.** The sibling reports answer 4 for the same input; this one dereferences nil through `T.must`
  (sorbet-runtime is loaded) and 500s.
- **Setup.** Read-only.
- **Steps.** 1. `GET /trade/Z2dnWmdaUWtnZw==/auction_report` (same for `WrongUuid1=`).
- **Expected.** A 4xx (4 'Request not found'). Today TypeError "Passed `nil` into T.must" → 500.
- **Oracle.** No 5xx.
- **Trace.** P0 · automate · `EDGE-DAUC-088` · `app/controllers/api/trade_controller.rb:1626-1628`

#### API-XDAUC-089 — The auction report endpoint answers for a running RFQ
- **Why it matters.** Pins that the endpoint has no "auction ended" guard (the dashboard hides the tab instead, and the
  show reply carries a separate show_auction_report flag).
- **Setup.** Sandbox RFQ. Read-only.
- **Steps.** 1. `GET /trade/{{tradeId}}/auction_report`.
- **Expected.** HTTP 200: one KG line, empty prices_graph_data, available_data_options [price, total_amount].
- **Oracle.** Reply shape.
- **Trace.** P2 · automate · `EDGE-DAUC-089` · `app/controllers/api/trade_controller.rb:1625-1665` · `app/policies/trade_request_policy.rb:92-98` · `app/controllers/api/v1/trade_controller.rb:302-306`

#### API-XDAUC-090 — The auction report renders for the converted, closed auction
- **Why it matters.** Post-auction analytics are what the buyer shows management.
- **Setup.** auction.convert ticked. Read-only.
- **Steps.** 1. `GET /trade/{{auctionTradeUuid}}/auction_report`.
- **Expected.** HTTP 200 with the QA vendor's carried-over and auction bids in prices_graph_data and the auction's end.
- **Oracle.** Reply content.
- **Trace.** P1 · automate · `EDGE-DAUC-090` · `app/controllers/api/trade_controller.rb:1625-1665`

#### API-XDAUC-091 — Bidding summary with a rank limit of zero is refused
- **Why it matters.** The dashboard never sends < 1, but the API must guard it.
- **Setup.** Sandbox RFQ. Read-only.
- **Steps.** 1. `GET /trade/{{tradeId}}/event_summary?rank_limit=0`.
- **Expected.** HTTP 422 code 2 'Insufficient parameters'.
- **Oracle.** 422 + 2.
- **Trace.** P2 · automate · `EDGE-DAUC-091` · `app/controllers/api/trade_controller.rb:1713-1716`

#### API-XDAUC-092 — Bidding summary with a text rank limit is refused
- **Why it matters.** Pins the coercion: text is refused, not read as "all vendors".
- **Setup.** As 091.
- **Steps.** 1. `GET /trade/{{tradeId}}/event_summary?rank_limit=top`.
- **Expected.** HTTP 422 code 2 ("top".to_i is 0).
- **Oracle.** 422 + 2.
- **Trace.** P2 · automate · `EDGE-DAUC-092` · `app/controllers/api/trade_controller.rb:1713-1716`

#### API-XDAUC-093 — Bidding summary for a stage that does not exist is refused
- **Why it matters.** Contrast with 088.
- **Setup.** Read-only.
- **Steps.** 1. `GET /trade/Z2dnWmdaUWtnZw==/event_summary`.
- **Expected.** HTTP 422 code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EDGE-DAUC-093` · `app/controllers/api/trade_controller.rb:1711-1712`

#### API-XDAUC-094 — Detailed report for a stage that does not exist is refused
- **Why it matters.** Guard parity across the report family.
- **Setup.** Read-only.
- **Steps.** 1. `GET /trade/Z2dnWmdaUWtnZw==/detailed_report`.
- **Expected.** HTTP 422 code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EDGE-DAUC-094` · `app/controllers/api/trade_controller.rb:1669-1671`

#### API-XDAUC-095 — Detailed report for the closed auction lists the participant
- **Why it matters.** The report a buyer downloads after the auction.
- **Setup.** auction.convert ticked. Read-only.
- **Steps.** 1. `GET /trade/{{auctionTradeUuid}}/detailed_report`.
- **Expected.** HTTP 200: audience_count ≥ 1, the QA vendor under participating vendors, top-3 graph data, bidding logs.
- **Oracle.** Reply content.
- **Trace.** P2 · automate · `EDGE-DAUC-095` · `app/controllers/api/trade_controller.rb:1668-1707`

#### API-XDAUC-096 — L1 data for a stage that does not exist is refused
- **Why it matters.** L1 is the most sensitive read in an auction; its not-found path must be clean.
- **Setup.** Read-only.
- **Steps.** 1. `GET /v1/trade/Z2dnWmdaUWtnZw==/l1_data_for_event`.
- **Expected.** HTTP 422 code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EDGE-DAUC-096` · `app/controllers/api/v1/trade_controller.rb:549-552`

#### API-XDAUC-097 — Rank indicators for the closed auction
- **Why it matters.** The data behind the buyer's rank/colour cards.
- **Setup.** auction.convert ticked. Read-only.
- **Steps.** 1. `GET /v1/trade/{{auctionTradeUuid}}/event_indicators`.
- **Expected.** HTTP 200 with auction_identifiers + auction_identifiers_data including the rank indicator ({} only when
  event masking applies to the caller).
- **Oracle.** Reply content.
- **Trace.** P1 · automate · `EDGE-DAUC-097` · `app/controllers/api/v1/trade_controller.rb:531-547` · `app/models/trade_request.rb:654-670`

#### API-XDAUC-098 — The alternate-bidding leader board for a stage that does not exist crashes
- **Why it matters.** `authorize(nil)` runs before the nil check; Pundit cannot find a policy for nil and raises
  NotDefinedError, which is not rescued (only NotAuthorizedError is).
- **Setup.** Read-only.
- **Steps.** 1. `GET /v1/trade/Z2dnWmdaUWtnZw==/alternate_bidding_leader_board`.
- **Expected.** A 4xx. Today 500.
- **Oracle.** No 5xx.
- **Trace.** P1 · automate · `EDGE-DAUC-098` · `app/controllers/api/v1/trade_controller.rb:866-869` · `app/controllers/concerns/api_auth.rb:16`

#### API-XDAUC-099 — The leader board exists only for alternate-bidding stages
- **Why it matters.** It exposes everyone's lines side by side.
- **Setup.** Sandbox RFQ (is_alternate_bidding_allowed false). Read-only.
- **Steps.** 1. `GET /v1/trade/{{tradeId}}/alternate_bidding_leader_board`.
- **Expected.** HTTP 422 code 101 'You are not allowed to perform this action'.
- **Oracle.** 422 + 101.
- **Trace.** P2 · automate · `EDGE-DAUC-099` · `app/controllers/api/v1/trade_controller.rb:871` · `app/models/model_helpers/trade_request_model_helper.rb:870-873`

#### API-XDAUC-100 — The vendor feed of running auctions is empty for a buyer
- **Why it matters.** A buyer must never see other buyers' running auctions through the vendor feed.
- **Setup.** Read-only; buyer session.
- **Steps.** 1. `GET /v1/trade/get_participated_auctions`.
- **Expected.** HTTP 200, participated_auctions [] (only running stages where the caller's companies hold an
  active/requested bid; never knockout/dutch).
- **Oracle.** Empty list.
- **Trace.** P2 · automate · `EDGE-DAUC-100` · `app/controllers/api/v1/trade_controller.rb:221-258` · `app/controllers/concerns/trade_controller_helper.rb:144-154`

#### API-XDAUC-101 — Bidding summary for a user who cannot view the event returns an empty success
- **Why it matters.** The action does `return 510, 422` instead of rendering the error, so Rails falls through to an
  implicit render — the caller gets an empty 2xx (or a template error) instead of 510 'You are not allowed to view
  this event'.
- **Setup.** A buyer of the same company with no view access to the event (needs a second user).
- **Steps.** 1. As that user, `GET /trade/<id>/event_summary`.
- **Expected.** Desired 422 code 510. Record the actual status/body (likely 204 or an HTML missing-template error).
- **Oracle.** Status + body.
- **Trace.** P1 · manual · `app/controllers/api/trade_controller.rb:1717-1720`

## 12. Auction terms acceptance and live audience changes

#### API-XDAUC-102 — Accepting auction terms on a stage that does not exist is refused
- **Why it matters.** Guard of the only write a vendor makes before bidding.
- **Setup.** Refused before any write.
- **Steps.** 1. `PATCH /v1/trade/Z2dnWmdaUWtnZw==/accept_auction_tnc` with `{}`.
- **Expected.** HTTP 422 code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EDGE-DAUC-102` · `app/controllers/api/v1/trade_controller.rb:899-901`

#### API-XDAUC-103 — The buyer cannot accept the auction terms on a vendor's behalf
- **Why it matters.** Only a participant company can accept; the buyer passes the policy but no participant company
  resolves for them.
- **Setup.** Sandbox RFQ (no technical responses; buyer's company not in the audience). Refused before the write.
- **Steps.** 1. `PATCH /v1/trade/{{tradeId}}/accept_auction_tnc` with `{}`.
- **Expected.** HTTP 422 code 101 'You are not allowed to perform this action'; misc.tnc_popup_acceptances unchanged.
- **Oracle.** 422 + 101.
- **Trace.** P1 · automate · `EDGE-DAUC-103` · `app/controllers/api/v1/trade_controller.rb:903-913` · `app/policies/trade_request_policy.rb:68-72`

#### API-XDAUC-104 — Accepting the auction terms is recorded but never enforced
- **Why it matters.** The acceptance is stored once per company (the first acceptance is kept forever, later users are
  no-ops) and only surfaced to the client; the bid endpoints do not check it, so an API client can bid without
  accepting.
- **Setup.** Live auction with is_tnc_mandatory true; vendor who has not accepted (vendor session).
- **Steps.** 1. Place a bid via the API without calling accept_auction_tnc. 2. Accept as user A, then as user B of the
  same company.
- **Expected.** Desired: bid refused until accepted. Today: bid accepted. Step 2: only A's acceptance stored.
- **Oracle.** Bid outcome; misc.tnc_popup_acceptances.
- **Trace.** P1 · manual · `app/models/trade_request.rb:3048-3063` · `app/serializers/trade_template_serializer.rb:312`

#### API-XDAUC-105 — Removing audience without naming anyone is refused
- **Why it matters.** EDGE-PUB covers the add side and the 512 branches; this is the remove side's empty-list guard.
- **Setup.** Sandbox RFQ. Refused before any change.
- **Steps.** 1. `PATCH /v1/trade/remove_audience?id={{tradeId}}` with only update_remarks.
- **Expected.** HTTP 422 code 2 'Insufficient parameters'.
- **Oracle.** 422 + 2.
- **Trace.** P2 · automate · `EDGE-DAUC-105` · `app/controllers/api/v1/trade_controller.rb:55-57`

#### API-XDAUC-106 — Vendors can still be added to an auction that has ended
- **Why it matters.** There is no time check — only status active/draft. Added vendors are mailed "update_audience"
  for an event that is over.
- **Setup.** auction.convert ticked; no vendor list sent, so nothing can be added.
- **Steps.** 1. `PATCH /v1/trade/add_audience?id={{auctionTradeUuid}}` with only update_remarks.
- **Expected.** Refused — today with code 2 (every other gate passed) while the auction is still status active; code
  95 once the award closed it. Desired: refused as ended.
- **Oracle.** 422 + which code.
- **Trace.** P1 · automate · `EDGE-DAUC-106` · `app/controllers/api/v1/trade_controller.rb:28-44` · `app/controllers/concerns/common_controller_helper.rb:31-43`

#### API-XDAUC-107 — Audience can be added to a draft auction but not removed from it
- **Why it matters.** add uses active_or_draft, remove uses active only — on an auction-team draft the buyer can add a
  wrong vendor and then cannot take them off (95).
- **Setup.** A draft converted auction (auction-team company).
- **Steps.** 1. add_audience a QA vendor. 2. remove_audience the same vendor.
- **Expected.** 1 → success; 2 → 422 code 95. Desired: symmetric.
- **Oracle.** Codes; audience list.
- **Trace.** P2 · manual · `app/controllers/api/v1/trade_controller.rb:30, 47`

#### API-XDAUC-108 — Adding a vendor to a draft knockout crashes
- **Why it matters.** Draft knockouts have no rounds yet (rounds are created only when published active), but adding
  audience edits the rounds and `T.must(nil)` raises — the buyer cannot prepare a knockout's audience before publishing.
- **Setup.** A draft knockout auction (auction-team conversion).
- **Steps.** 1. add_audience one QA vendor.
- **Expected.** Desired: vendor added; rounds built on activation. Today: TypeError from T.must → 500.
- **Oracle.** Status; audience.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:5312-5320` · `app/controllers/concerns/common_controller_helper.rb:42` · `app/services/rfq_to_auction/create_service.rb:198-210`

## 13. The dashboard side (UI)

#### UI-XDAUC-001 — "Convert to Auction" appears only on a published RFQ without vendor masking
- **Why it matters.** The entry point decides who can convert; showing it on an RFP or a draft leads to a backend
  refusal (or worse, a technical round turned into an auction, EDGE-AWD-081).
- **Setup.** Three events: a published RFQ, a draft RFQ, a published RFP; plus a published RFQ with vendor masking on.
- **Steps.** 1. Open each event's Settings dropdown (`event-settings-button`).
- **Expected.** Item "Convert to Auction" visible only for the published, unmasked RFQ.
- **Oracle.** Menu contents.
- **Trace.** P1 · automate · `src/views/orderDetails/eventHeader/eventHeader.jsx:220-223, 736-745`

#### UI-XDAUC-002 — "Convert to Auction" is disabled on an old version, a project on hold, or a closed trade-mode event
- **Why it matters.** Mirrors backend 101 (not latest version); the menu must not invite a request that will fail.
- **Setup.** An RFQ with two versions (open the older), a project on hold, a closed trade-mode RFQ.
- **Steps.** 1. Open the Settings dropdown on each.
- **Expected.** The item is present but disabled in all three.
- **Oracle.** Disabled state.
- **Trace.** P1 · automate · `src/views/orderDetails/eventHeader/eventHeader.jsx:167-174, 379-381, 739-741`

#### UI-XDAUC-003 — Converting an RFQ that already has an auction is only stopped by the server
- **Why it matters.** The dashboard has no "auction exists" or "bid end reached" check; the buyer fills the whole
  configuration and then sees error 94.
- **Setup.** An RFQ already converted (journey with auction.convert).
- **Steps.** 1. Settings → Convert to Auction → Continue → fill the drawer → Publish.
- **Expected.** The server answers 94 "An auction has already been made for this event." and the page shows it; no
  second auction. Desired: the menu item hidden/disabled once a child auction exists (the auction shows a "Linked RFQ"
  tag, so the link is known).
- **Oracle.** Error toast; one auction.
- **Trace.** P2 · manual · `src/views/orderDetails/eventHeader/eventHeader.jsx:289-323, 1013-1024` · `app/controllers/api/trade_controller.rb:973`

#### UI-XDAUC-004 — "Use RFQ quotes as initial bids" is disabled with no quotes and pre-ticked with quotes
- **Why it matters.** Carrying quotes over is the main value of converting.
- **Setup.** One RFQ with no bids, one with bids.
- **Steps.** 1. Open the conversion popover on each.
- **Expected.** No bids → checkbox disabled; bids → checked by default; "Allow TNA vendors to bid" shown only with
  eRFX + TNA filtering, default checked.
- **Oracle.** Checkbox states.
- **Trace.** P1 · automate · `src/views/orderDetails/eventHeader/eventHeader.jsx:164, 198, 448-452, 528-549`

#### UI-XDAUC-005 — Pending bid justifications block the conversion popover
- **Why it matters.** Converting while justifications are pending would freeze unexplained quotes as auction bids.
- **Setup.** An RFQ with a vendor whose bid justification is pending.
- **Steps.** 1. Settings → Convert to Auction.
- **Expected.** The Pending Bid Justification modal opens instead of the popover.
- **Oracle.** Modal visible.
- **Trace.** P2 · manual · `src/views/orderDetails/eventHeader/eventHeader.jsx:256-262, 984-991`

#### UI-XDAUC-006 — In conversion mode only tick size, ceiling and floor can be edited in the sheet
- **Why it matters.** Everything else must come from the RFQ; editing quantities would break the quote carry-over.
- **Setup.** Continue from the conversion popover.
- **Steps.** 1. Try to edit quantity, product, tick size, ceiling price, floor price.
- **Expected.** Only tick_size, ceil_price, floor_price are editable; RFQ/RFP event-type tabs disabled with the
  "already configured as an RFQ" tooltip.
- **Oracle.** Editable cells; tab state.
- **Trace.** P1 · automate · `src/views/projectCreation/projectCreation.jsx:770-778` · `src/constants/index.js:1460-1464` · `src/views/eventCreation/components/auctionConfiguration/auctionConfiguration.jsx:297-303, 811-815`

#### UI-XDAUC-007 — Knockout and Dutch can be chosen only when converting (eRFX)
- **Why it matters.** Both need RFQ quotes for a sensible start price (966/968).
- **Setup.** eRFX company: open the configuration drawer once in conversion mode and once on a new auction stage.
- **Steps.** 1. Hover the Knockout and Dutch tabs.
- **Expected.** Conversion → enabled. New stage → disabled with "Knockout auctions can be created only when converting
  an RFQ to an auction". No Book Building or Rank & Price tab anywhere.
- **Oracle.** Tab state/tooltip.
- **Trace.** P1 · automate · `src/views/eventCreation/components/auctionConfiguration/auctionConfiguration.jsx:841-895` · `src/constants/index.js:110-118`

#### UI-XDAUC-008 — Auction-team users are sent through the edit flow and the auction goes to the team
- **Why it matters.** The success message differs and the auction lands as a draft (API-XDAUC-013).
- **Setup.** A company with an auction team; once as a team member, once as a non-member.
- **Steps.** 1. Convert an RFQ and publish.
- **Expected.** Non-member → toast "Event sent to Auction Team successfully", auction draft. Member → "Event created
  successfully", redirect to the auction (or the project page with eRFX).
- **Oracle.** Toast text; redirect; stage status.
- **Trace.** P2 · manual · `src/views/projectCreation/projectCreation.jsx:1781-1800, 1891-1908`

#### UI-XDAUC-009 — Dynamic extension fields are required once the box is ticked
- **Why it matters.** The server refuses a missing trigger (501) but stores a missing extension length and rank
  limit (API-XDAUC-079/080) — the form is the only guard for those.
- **Setup.** Rank auction configuration drawer.
- **Steps.** 1. Tick "Dynamic Event Extension". 2. Leave "Extend time by", "Trigger time extension on last" and
  "Time extension on change in" empty; save. 3. Enter trigger 0.5.
- **Expected.** "Select one of the options" under the two selects; "Trigger time extension cannot be less than
  1 min" for 0.5 and for empty; the block is absent for knockout/dutch.
- **Oracle.** Inline errors; block visibility.
- **Trace.** P1 · automate · `src/views/eventCreation/components/auctionConfiguration/auctionConfiguration.jsx:652-676` · `src/views/eventCreation/components/configurations/orderConfigBlocks.jsx:539-683` · `src/views/createOrder/helpers.js:61-64`

#### UI-XDAUC-010 — Extension options are shown in seconds and sent in minutes
- **Why it matters.** The backend treats time_extension_value as MINUTES; a unit slip would extend by an hour.
- **Setup.** As 009.
- **Steps.** 1. Choose "1 min" (60) and save; 2. choose Custom 90 s.
- **Expected.** Request carries time_extension_value 1 and 1.5; after a trigger the end moves by 1 / 1.5 minutes.
- **Oracle.** Network payload; schedule.
- **Trace.** P1 · automate · `src/views/createOrder/constants.js:70` · `src/views/projectCreation/helpers.js:815` · `src/redux/orders/helpers.js:1140-1150`

#### UI-XDAUC-011 — Knockout and Dutch field validations on the drawer
- **Why it matters.** The server checks fewer rules than the form (no tick ≥ global tick, no tick ≤ base price).
- **Setup.** Conversion drawer, Knockout then Dutch.
- **Steps.** 1. Base price "abc"; 2. tick below the currency's global tick; 3. Dutch tick > |end − start|;
  4. time difference 0.4 min and one longer than the event; 5. Dutch buy end below start.
- **Expected.** "Please enter valid base price" / "Please enter valid tick size" / "Please enter valid time difference" /
  "Please enter valid end price" as applicable; nothing sent.
- **Oracle.** Inline errors; no request.
- **Trace.** P1 · automate · `src/views/eventCreation/components/auctionConfiguration/auctionConfiguration.jsx:556-625` · `src/views/eventCreation/components/configurations/orderConfigBlocks.jsx:414-528`

#### UI-XDAUC-012 — The traffic-light form accepts equal bounds that the server refuses
- **Why it matters.** Pair of API-XDAUC-039: the form blocks only lower > upper for buy (and lower < upper for sell);
  equal bounds reach the server and come back as 269.
- **Setup.** Lot-based traffic-light auction, price type, buy.
- **Steps.** 1. Enter green 100 and yellow 100; publish.
- **Expected.** Desired: the form refuses equal bounds. Today: no inline error; server error "You have not provided
  valid traffic light ranges." shown after submit.
- **Oracle.** Inline error vs toast.
- **Trace.** P1 · manual · `src/views/eventCreation/components/auctionConfiguration/auctionConfiguration.jsx:677-708` · `src/views/eventCreation/components/configurations/configuration.jsx:308-354`

#### UI-XDAUC-013 — The live timer turns red under ten minutes and offers "Extend time"
- **Why it matters.** The buyer's only live cue that the close is near and the manual extension entry point.
- **Setup.** A live auction with 12 minutes left.
- **Steps.** 1. Watch the header timer across the 10-minute mark. 2. Hover the plus icon. 3. Let it end.
- **Expected.** Ring turns red below 10 minutes; tooltip "Extend time"; "Ended" after close; toast "Your auction is
  live" on the upcoming→live change.
- **Oracle.** Visual state; toast.
- **Trace.** P2 · manual · `src/views/orderDetails/timer.jsx:110-160` · `src/views/orderDetails/eventHeader/eventHeader.jsx:945-967`

#### UI-XDAUC-014 — Buyer's live bid cards show rank, colour and the gap to the best quote
- **Why it matters.** What the buyer sees must match what the API ranks (and the tie rule of API-XDAUC-081).
- **Setup.** Live rank auction with three bids; a traffic-light auction with bids in each colour.
- **Steps.** 1. Open the bids panel.
- **Expected.** Trophy + rank on each card; traffic background + emoji (green 🎉, red ⛔, yellow ⚠️) with the colour name
  on hover; "This quote is higher/lower than best quote of X". No Gold/Silver/Bronze labels.
- **Oracle.** Card contents vs `event_indicators`.
- **Trace.** P1 · manual · `src/views/orderDetails/layerDetails.jsx:516-558, 745-751` · `src/redux/orders/selectors.js:1296, 1330-1356`

#### UI-XDAUC-015 — The "Actions" menu controls what vendors see, and is hidden in view-only mode
- **Why it matters.** These toggles change the fairness contract mid-auction.
- **Setup.** Live rank auction; a view-only user.
- **Steps.** 1. Toggle "Show Best Prices", then "Show Rank" (traffic light), "Enable English Auction" (if allowed).
  2. Open as the view-only user.
- **Expected.** Each toggle sends PATCH `/trade/<id>/template_input` with other_auction_indicators_config /
  is_english_auction_enabled and toasts e.g. "Supplier will be able to see Rank"; "Show Best Prices" absent for book
  building/weighted; "Sealed Bid Strategy" absent for dutch/knockout/fast bidding; menu hidden for view-only.
- **Oracle.** Network calls; toasts; menu visibility.
- **Trace.** P1 · manual · `src/views/orderDetails/auctionIndicators.jsx:68-308` · `src/views/orderDetails/actionBar.jsx:124-130` · `src/redux/orders/actions.js:1985-2023`

#### UI-XDAUC-016 — The Analytics tab is hidden for RFI/RFP and says "No bids placed yet." without bids
- **Why it matters.** The report must not render empty charts or leak live bidding stats.
- **Setup.** An RFP, an auction with no bids, an auction with bids.
- **Steps.** 1. Look for the Analytics tab; open it.
- **Expected.** Absent on the RFP; "No bids placed yet." on the empty auction; an "Auction Report" iframe otherwise;
  hidden while live when show_bidding_stats hides the audience.
- **Oracle.** Tab/iframe presence.
- **Trace.** P2 · manual · `src/views/orderDetails/eventHeader/eventHeader.jsx:407-413` · `src/views/orderDetails/orderDetails.jsx:338-343, 1496-1521`

#### UI-XDAUC-017 — The bidding-summary rank filter only offers sensible limits
- **Why it matters.** The API refuses rank_limit ≤ 0 (API-XDAUC-091); the screen must never send it.
- **Setup.** An auction with 3 active participants.
- **Steps.** 1. Open Event Details → Bidding Summary → rank menu. 2. Choose "All Vendors".
- **Expected.** Options Top 1 and Top 2 Vendors and All Vendors only; "All" sends no rank_limit; the panel refreshes
  every 30 s.
- **Oracle.** Menu items; request URL.
- **Trace.** P2 · automate · `src/views/orderDetails/eventDetails.jsx:1186-1209, 1408-1419` · `src/models/orders/ordersService.js:372-378` · `src/views/orderDetails/constants.js:35-42`

#### UI-XDAUC-018 — Updating the audience of a live auction needs a remark and a live/upcoming event
- **Why it matters.** Audience changes mid-auction must be explained; the API itself does not check the state
  (API-XDAUC-106).
- **Setup.** Live auction; an ended auction; a view-only user.
- **Steps.** 1. Add a QA vendor in the Audience tab; click "Update audience". 2. Try on the ended auction and as the
  view-only user.
- **Expected.** Live → "Update Audience Remarks" modal, OK disabled until a remark is typed, then toast "Audience
  Updated". Ended / view-only → button disabled. Hidden entirely with vendor masking.
- **Oracle.** Button/modal states; PATCH add_audience payload.
- **Trace.** P1 · automate · `src/components/audienceList/audienceList.jsx:665-675, 763-798` · `src/views/orderDetails/orderDetails.jsx:344-348, 980-1036`

#### UI-XDAUC-019 — Knockout buyer view: round countdown, extension limit, everyone knocked out
- **Why it matters.** The buyer runs the rounds from this screen.
- **Setup.** A running knockout with two vendors.
- **Steps.** 1. Watch "Next round in mm:ss"; 2. extend the round beyond the event end; 3. let both vendors decline.
- **Expected.** Countdown with + icon; "Extend your auction time in order to extend current round's time!" when
  past the end; "All participants are knocked out!" with tags Knocked Out per vendor.
- **Oracle.** Texts/tags.
- **Trace.** P2 · manual · `src/views/orderDetails/knockoutDetails.jsx:468-477, 671-690, 1059-1066` · `src/views/orderDetails/auctionPriceTrail.jsx:272-289`

#### UI-XDAUC-020 — The live page refreshes from the socket and falls back to polling
- **Why it matters.** Ranks and extensions must reach the buyer within seconds; there is no dedicated "time extended"
  banner, so the refresh is the only signal.
- **Setup.** Live auction; then block the websocket.
- **Steps.** 1. Have a vendor bid; watch the buyer page. 2. Block the socket; bid again.
- **Expected.** TradesChannel message with auction_identifiers/bid_identifiers triggers a refetch of details, bids and
  indicators; with the socket closed the page polls every 30 s.
- **Oracle.** Network refetches; timing.
- **Trace.** P2 · manual · `src/views/orderDetails/orderDetails.jsx:1250-1371` · `src/views/orders/constants.js:156`

#### UI-XDAUC-021 — The converted auction links back to its RFQ
- **Why it matters.** The buyer must be able to compare RFQ quotes with auction results.
- **Setup.** auction.convert journey.
- **Steps.** 1. Open the auction's header.
- **Expected.** A "Linked RFQ" tag linking to the parent RFQ.
- **Oracle.** Tag present; link target = {{pricingTradeUuid}}.
- **Trace.** P2 · automate · `src/views/orderDetails/eventHeader/eventHeader.jsx:1013-1024` · `src/redux/orders/selectors.js:504-505`
