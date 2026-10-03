# Counter offers and negotiation — deep cases

Deep cases for the negotiation step of a sourcing event: the buyer counters a vendor's quote (one vendor or all at once),
the vendor accepts, rejects or modifies it, the buyer revokes it, and the award is made afterwards. Each case is grounded in
`procol-backend` at `origin/main` (`additional_requests_controller`, `Api::AdditionalRequestsHelper`,
`AdditionalRequestResolutionHelper`, the shared sheet transform in `trade_template_helper.rb`) or in the buyer dashboard
(`procol-client-dashboard`). The field-level basics already in `api-edge-awd.md` (API-XAWD-052…078) are not repeated; this
file goes into states, actors, settings, read-backs, the bulk path and the screens. Cases with a runnable twin share the number
with `prototype/data/api-cases-extra/deep-neg.json` (`EDGE-DNEG-NNN`).

**Read before running.** Every runnable case is sent as the buyer. `{{bidUuid}}` is the QA vendor's submitted bid on the
journey's CLOSED pricing round `{{pricingTradeUuid}}`; the award proposal has already been submitted, which revokes any pending
counter offer (so the bid is `selected`, or `active` when an approval flow is still pending). The sandbox round `{{tradeId}}`
is published, open and has no bids. Uuids are decoded by `ParamsAuth#check_for_uuid`: `Z2dnWmdaUWtnZw==` is id 999999999 (no such
row); `WrongUuid1=` decodes to nil. The raise endpoint answers `{success: true}` without the new request's id, so
`{{counterOfferUuid}}` is never filled by the journey and no runnable case relies on it.

**Settings that change behaviour.** `counter_offer_modification_enabled` (company master configuration "Allow Counter Offer
Modification", default off, read from the round's config, `trade_request_model_helper.rb:1108-1110`) lets the vendor modify instead
of only accepting/rejecting, and only inside the evaluation window (`rfq_extra_closing_time`, `trade_request.rb:934-966`).
`allow_price_reversal_in_counter_offer_in_rfq` (template configuration "Allow price reversal in RFQ counter offer", default on,
`trade_request_model_helper.rb:90-96`) lets an RFQ counter go above the quote (below it for a sell event); auctions follow
`is_price_increase_allowed` / `is_price_decrease_allowed` instead. `hide_counter_offer_rfq` (company custom configuration,
`api/v1/users_controller.rb:786`) only hides the button. `allow_fixed_quantity_for_bidding`, `is_under_quantity_allowed`,
`is_over_quantity_allowed` constrain counter quantities.

## 1. Raising a counter offer — malformed requests

#### API-XDNEG-001 — A counter offer naming an unreadable bid id is refused as not found
- **Why it matters.** The before_action that prepares the price sheet decides which round the request belongs to. An id that
  decodes to nothing must be refused cleanly; today it is, while an id that decodes to a missing number crashes (API-XAWD-053).
  This pins the safe branch so a refactor of the uuid decoding cannot open a path where the action runs with no bid.
- **Setup.** Authenticated buyer. `WrongUuid1=` decodes to nil.
- **Steps.** Send the journey's counter-offer body with `item_uuid` replaced:
  `POST /additional_request/raise_additional_request` with `{"item_uuid": "WrongUuid1=", "item_type": "counter_offer_for_bid", "sheets": {"inline_components": {"data": [<the journey row>]}}, "remarks": "QA_Platform_dneg_{{stamp}}"}`.
- **Expected.** Refused; nothing is created and no vendor is notified. HTTP 422, code 4, 'Request not found'.
- **Oracle.** 422 with code 4; no new additional request for any bid.
- **Trace.** P1 · automate · `EDGE-DNEG-001` · `app/controllers/concerns/trade_template_helper.rb:5548-5555`

#### API-XDNEG-002 — A counter-offer price sheet sent as an object does not crash
- **Why it matters.** The rows of the counter offer are iterated without checking they are a list. An object yields
  `[key, row]` pairs and the first read of a row blows up. A 500 here means a client bug looks like a server outage, and the
  buyer gets no usable error.
- **Setup.** `{{bidUuid}}` is the vendor's bid on the closed round; `{{tradeProductUuid}}` is the quoted line. The failure is in
  the before_action, before any bid-state check, so the award state does not matter.
- **Steps.** `POST /additional_request/raise_additional_request` with the journey body but
  `"sheets": {"inline_components": {"data": {"0": <row>}}}`.
- **Expected.** A clean refusal (HTTP 422, code 2). Today: TypeError while reading `creator_quantity` from the pair → HTTP 500.
  Nothing is written.
- **Oracle.** Status < 500; bid status unchanged.
- **Trace.** P1 · automate · `EDGE-DNEG-002` · `app/controllers/concerns/trade_template_helper.rb:5613-5622`

#### API-XDNEG-003 — A counter-offer row without the buyer's quantity block does not crash
- **Why it matters.** The unit of every row is taken from `creator_quantity.configuration.suffix` before the price is even looked
  at. A client that sends only the columns it changed (price) crashes the request. This is a different crash point from the
  missing-product case (API-XAWD-066).
- **Setup.** `{{bidUuid}}` exists (journey bid).
- **Steps.** `POST /additional_request/raise_additional_request` with one row that carries `status`, `participant_quantity`,
  `price` and `product` but no `creator_quantity`.
- **Expected.** HTTP 422 naming the missing field. Today: NoMethodError on nil → HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DNEG-003` · `app/controllers/concerns/trade_template_helper.rb:5617`

#### API-XDNEG-004 — A plain-text entry in the price sheet does not crash
- **Why it matters.** Type confusion inside the list (a string where a row object is expected) must be refused, not crash the
  request.
- **Setup.** `{{bidUuid}}` exists.
- **Steps.** `POST /additional_request/raise_additional_request` with `"data": ["QA_Platform_row_{{stamp}}"]`.
- **Expected.** HTTP 422. Today: `"…"[:creator_quantity]` raises TypeError → HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-DNEG-004` · `app/controllers/concerns/trade_template_helper.rb:5617`

#### API-XDNEG-005 — A counter offer that also names a vendor company does not crash
- **Why it matters.** The sheet transform is shared with the close-bid flow, where rows are keyed by vendor. If a counter-offer
  body carries `company_uuid`, the transform indexes the row LIST with the company id as text and crashes. Any client that
  reuses a close-bid payload builder hits a 500.
- **Setup.** `{{bidUuid}}` exists. `Z2dnWmdaUWtnZw==` is a well-formed company uuid (id 999999999).
- **Steps.** `POST /additional_request/raise_additional_request` with the journey body plus `"company_uuid": "Z2dnWmdaUWtnZw=="`.
- **Expected.** The company key is ignored for a list, or HTTP 422. Today: `data['999999999']` on an Array raises TypeError →
  HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DNEG-005` · `app/controllers/concerns/trade_template_helper.rb:5521-5526`

#### API-XDNEG-006 — Global counter-offer fields sent as text do not crash
- **Why it matters.** Header-level (global) fields such as freight or payment terms are negotiable in a counter offer. Their
  container is never type-checked: a string makes the transform call `key?` and `[:trade_credit_discount]` on text.
- **Setup.** `{{bidUuid}}` exists.
- **Steps.** `POST /additional_request/raise_additional_request` with the journey body plus
  `"global_price_components": {"global_data": "QA_Platform_x_{{stamp}}"}` inside `sheets`.
- **Expected.** HTTP 422. Today: NoMethodError/TypeError → HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-DNEG-006` · `app/controllers/concerns/trade_template_helper.rb:5567-5582`

#### API-XDNEG-007 — A counter offer whose sheets field is text does not crash
- **Why it matters.** The very first read of the body (`params[:sheets][:inline_components]`) is unguarded.
- **Setup.** `{{bidUuid}}` exists.
- **Steps.** `POST /additional_request/raise_additional_request` with `"sheets": "QA_Platform_x_{{stamp}}"`.
- **Expected.** HTTP 422 code 2. Today: TypeError → HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-DNEG-007` · `app/controllers/concerns/trade_template_helper.rb:5524`

## 2. Raising a counter offer — states, actors and settings

#### API-XDNEG-008 — Two quick clicks on Send Counter Offer can raise two counter offers
- **Why it matters.** The single-vendor raise calls `lock_transaction` with no arguments. Inside it,
  `params ||= data_params` creates a LOCAL `params` set to `{}`, so `item_type` is nil and the method returns without locking;
  the matching unlock is a no-op too. Two requests that both read the bid as active before either commits each create a full
  set of counter-offer rows and each email the vendor. (API-XAWD-068 expects the lock to fire and render twice; it never fires.)
- **Setup.** A vendor bid in status active on an RFQ round (open or in its evaluation window). Not runnable: needs two parallel
  requests on an active bid, and on the journey's bid a success would place a real counter offer.
- **Steps.** 1. Send the same counter-offer request twice in parallel (≤ 50 ms apart). 2. Read the bid's pending tasks.
- **Expected.** Exactly one counter offer; the second request refused ('This bid is being revised, please try again later', code
  15, or code 101 once the first has committed). Today: both can succeed.
- **Oracle.** Count of additional requests with grouping `Bid#<id>`, resolution requested = one set; one "new counter offer"
  email to the vendor.
- **Trace.** P1 · manual · `app/helpers/api/additional_requests_helper.rb:16-23`, `app/controllers/api/additional_requests_controller.rb:14-15`

#### API-XDNEG-009 — A counter offer during live bidding freezes the vendor's own revisions
- **Why it matters.** Counter offers are allowed while the bid window is open (the journey does exactly that). While it is pending,
  the vendor cannot simply lower the price on their own unless modification is enabled — the vendor must first answer.
  A regression either blocks the vendor forever or lets two prices exist at once.
- **Setup.** Live RFQ; QA vendor bid active; `counter_offer_modification_enabled` is OFF. Needs a vendor session.
- **Steps.** 1. Buyer raises a counter offer (bid becomes requested). 2. Vendor revises the existing bid. 3. Vendor tries to place a new bid.
- **Expected.** Step 1 succeeds. Step 2 refused: HTTP 422 code 499 'You have a counter offer pending on this bid'. Step 3
  refused: HTTP 422 code 490 'Your current bid is awaiting approval'.
- **Oracle.** Bid stays requested with the original price; codes 499/490.
- **Trace.** P1 · manual · `app/helpers/api/v1/bids_controller_helper.rb:374-383`, `app/helpers/api/v1/bids_controller_helper.rb:55-66`

#### API-XDNEG-010 — A counter offer raised after the round closed, with no evaluation window, can never be accepted
- **Why it matters.** Raising has no time guard, but accepting requires the round to be running or inside its evaluation
  window. Without that window the vendor gets 'Order not active' on Accept and the counter offer hangs until the award revokes
  it. The buyer believes they are negotiating; the vendor cannot say yes.
- **Setup.** RFQ round closed, no `rfq_extra_closing_time` schedule; vendor bid active. Needs a vendor session for step 2.
- **Steps.** 1. Buyer raises a counter offer (200). 2. Vendor accepts it via `PATCH /additional_request/resolve_additional_request`
  `{"item_type": "counter_offer_for_bid", "requests": [{"uuid": "<request>", "resolution": "accepted"}]}`.
- **Expected.** Product: the raise is refused when no response window remains. Today: step 1 succeeds; step 2 answers HTTP 422
  code 33 'Order not active' and the accept is rolled back.
- **Oracle.** Request stays resolution requested; bid stays requested; no new revised bid.
- **Trace.** P0 · manual · `app/controllers/concerns/bids_controller_helper.rb:54-57`, `app/helpers/additional_request_resolution_helper.rb:635-637`

#### API-XDNEG-011 — Reminder emails for a counter offer raised after closing go out at once
- **Why it matters.** Reminders are scheduled at 50% and 75% of (round end − counter-offer time). After the end that duration is
  negative, so both "reminder" emails are due in the past and Sidekiq sends them immediately, together with the new-offer email.
  The vendor gets three emails in a minute for an offer they cannot accept (see API-XDNEG-010).
- **Setup.** Closed RFQ without an evaluation window; vendor bid active; QA vendor mailbox.
- **Steps.** Raise a counter offer; watch the vendor mailbox for 2 minutes.
- **Expected.** No reminder when no response window remains (or reminders relative to a real deadline). Today: new-offer mail +
  "50 percent" + "75 percent" reminders at once.
- **Oracle.** Mail timestamps; EmailNotificationWorker jobs `counter_offer_reminder_to_vendor` scheduled in the past.
- **Trace.** P1 · manual · `app/helpers/api/additional_requests_helper.rb:867-889`

#### API-XDNEG-012 — A counter offer on a bid that is in an award awaiting approval is accepted by the API
- **Why it matters.** When the award goes to an approver, the bid stays active (the award revoked its pending counter offers).
  The screen hides Counter Offer while a proposal is under approval, but the API only checks the bid status. If the vendor then
  accepts, the bid is revised and the approval can no longer complete.
- **Setup.** Award proposal submitted with an approval flow (proposal requested); vendor bid active. Not runnable: on the journey
  this request would succeed and put a real pending counter offer on the journey's bid.
- **Steps.** 1. Buyer raises a counter offer on the bid via the API. 2. Vendor accepts inside the window. 3. Approver approves the award.
- **Expected.** Step 1 refused (bid is part of an award under approval). Today: step 1 succeeds; step 3 fails with HTTP 422 code
  832 'Bid cannot be awarded as it is already revised.'
- **Oracle.** Proposal stuck in requested; bid revised.
- **Trace.** P0 · manual · `app/helpers/api/additional_requests_helper.rb:158`, `app/helpers/api/proposal_helper.rb:312-316`

#### API-XDNEG-013 — A counter offer on a surrogate bid is addressed to an arbitrary vendor user
- **Why it matters.** The screen never offers Counter Offer on a bid the buyer entered for the vendor, but the API does. The
  request is addressed to `bid.company.users.first` (the code carries a TODO), which may be a deactivated or unrelated user — the
  person who actually quoted may never see it.
- **Setup.** A surrogate bid entered by the buyer for a vendor with two users. Not runnable (needs a surrogate bid in active state).
- **Steps.** Raise a counter offer on the surrogate bid via the API; read who it is requested from.
- **Expected.** Refused like the screen, or addressed to the vendor's active primary contact. Today: accepted, requested from the
  vendor company's first user.
- **Oracle.** additional_requests.requested_from_id.
- **Trace.** P1 · manual · `app/helpers/api/additional_requests_helper.rb:989-1005`

#### API-XDNEG-014 — A single counter offer flagged as bulk skips the column and unquoted-line checks
- **Why it matters.** `is_bulk_counter_offer` is read from the body of a single-vendor raise. When present, the negotiable-column
  check (504) is skipped and lines the vendor did not quote are silently ignored instead of refused (587). Any client can switch
  the guards off by adding one flag.
- **Setup.** Active vendor bid on a lot-closed RFQ with one unquoted line. Not runnable (needs an active bid; would create a real counter offer).
- **Steps.** Raise a counter offer that changes a line's status and names an unquoted line, with `"is_bulk_counter_offer": true`.
- **Expected.** The flag is ignored on the single-vendor route; HTTP 422 code 504 or 587 as without it. Today: accepted.
- **Oracle.** Compare with the same body without the flag.
- **Trace.** P1 · manual · `app/helpers/api/additional_requests_helper.rb:166-170`, `app/helpers/api/additional_requests_helper.rb:797-800`

#### API-XDNEG-015 — Price and quantity can always be countered, whatever the template says
- **Why it matters.** `get_negotiable_widgets_key_attributes` always appends price and participant_quantity, so the quantity and
  price checks inside `is_counter_offer_allowed?` can never refuse, and the quantity change is recorded unconditionally. A buyer
  can push a quantity change on a template where quantity is not negotiable. (API-XAWD-064 expects 504 here; it cannot be
  produced this way.)
- **Setup.** RFQ template whose participant_quantity is not negotiable; active vendor bid for 50 KG.
- **Steps.** Raise a counter offer for the line with quantity 40 and the same price.
- **Expected.** Product: HTTP 422 code 504 'You cannot give a counter offer on these columns.' Today: accepted; the vendor is asked
  to accept 40 KG.
- **Oracle.** additional_requests.change_requested contains quantity.
- **Trace.** P1 · manual · `app/models/trade_request.rb:1836-1843`, `app/models/model_helpers/trade_request_model_helper.rb:526-538`, `app/helpers/api/additional_requests_helper.rb:367-368`

#### API-XDNEG-016 — On a lot-closed event a counter offer may not change a line's status
- **Why it matters.** This is the one column rule that does fire: on events closed per lot, the vendor's line status must stay as
  quoted. A counter that drops a line would change the lot the vendor competed on.
- **Setup.** Event closed on lot; active vendor bid with two lines.
- **Steps.** Raise a counter offer that sends one row with status `in_active` (the dashboard does this for an edited row the buyer unticks).
- **Expected.** HTTP 422 code 504 'You cannot give a counter offer on these columns.'
- **Oracle.** 422 + 504; bid status stays active.
- **Trace.** P2 · manual · `app/models/model_helpers/trade_request_model_helper.rb:529-531`

#### API-XDNEG-017 — An unticked row skips every price rule of the counter offer
- **Why it matters.** Rows with status `in_active` or `negotiated` are skipped by the whole price/quantity validation (reversal,
  ceiling, floor, best price), yet the price change on that row is still recorded. A buyer can attach a price the rules would
  refuse, as long as the row is marked unticked.
- **Setup.** RFQ with `allow_price_reversal_in_counter_offer_in_rfq` OFF (not lot-closed); active vendor bid at 100.
- **Steps.** Raise a counter offer with price 150 on a row whose status is `in_active`.
- **Expected.** Refused with code 300 like a ticked row. Today: accepted with change_requested {price: 150, status: in_active}.
- **Oracle.** change_requested of the new request.
- **Trace.** P2 · manual · `app/helpers/api/additional_requests_helper.rb:802`, `app/helpers/api/additional_requests_helper.rb:359-371`

#### API-XDNEG-018 — On a sell event a counter below the vendor's price depends on the reversal setting
- **Why it matters.** The reversal rule is mirrored for sell (forward) events: the buyer may not lower the vendor's offer when
  reversal is off. Only the buy side is covered so far (API-XAWD-062).
- **Setup.** Sell RFQ with `allow_price_reversal_in_counter_offer_in_rfq` OFF; vendor offer 100.
- **Steps.** Counter with 90.
- **Expected.** HTTP 422 code 301 'You cannot decrease the price'. With the setting on (or absent — default on) the counter is accepted.
- **Oracle.** 422 + 301 vs 200.
- **Trace.** P1 · manual · `app/helpers/api/additional_requests_helper.rb:935-952`

#### API-XDNEG-019 — On an auction the price-reversal rule follows the auction's own setting
- **Why it matters.** For auction rounds the RFQ reversal setting is ignored; `is_price_increase_allowed` decides, and it is
  forced false during the review time of a reverse auction. A buyer who expects the RFQ setting to apply gets a surprise.
- **Setup.** Reverse auction with `is_price_increase_allowed` false; vendor bid 100 in the extra-closing time.
- **Steps.** Counter with 110.
- **Expected.** HTTP 422 code 300 'You cannot increase the price'; with `is_price_increase_allowed` true it is accepted.
- **Oracle.** 422 + 300.
- **Trace.** P1 · manual · `app/models/model_helpers/trade_request_model_helper.rb:69-96`

#### API-XDNEG-020 — On an English auction a counter above the best price is refused
- **Why it matters.** In an English (rank-on-price) auction a counter offer cannot be worse than the current best price for the line.
- **Setup.** Buy English auction with default validations on the line; best price 95; vendor bid 100.
- **Steps.** Counter the vendor with 98.
- **Expected.** HTTP 422 code 480 'Quoted price must be less than the best price'. (Sell: code 481 below the best price.)
- **Oracle.** 422 + 480.
- **Trace.** P2 · manual · `app/helpers/api/additional_requests_helper.rb:812-835`

#### API-XDNEG-021 — A counter above the round's ceiling price is refused
- **Why it matters.** The ceiling (and floor for sell events) set on the line binds counter offers too, for RFQs as well as auctions.
- **Setup.** Buy RFQ line with default validations ceil_price 120; vendor bid 100.
- **Steps.** Counter with 130.
- **Expected.** HTTP 422 code 211 'Quoted price must be less than the ceil price'. (Sell with floor_price: code 212 'Quoted price
  must be more than the floor price'.)
- **Oracle.** 422 + 211.
- **Trace.** P2 · manual · `app/helpers/api/additional_requests_helper.rb:840-848`

#### API-XDNEG-022 — A counter quantity below the floor quantity is refused
- **Why it matters.** The minimum quantity of the line applies to the counter as it applied to the bid.
- **Setup.** Line with default validations floor_quantity 30; vendor bid for 50.
- **Steps.** Counter with quantity 20.
- **Expected.** HTTP 422 code 213 'Quoted quantity must be more than the floor quantity'.
- **Oracle.** 422 + 213.
- **Trace.** P2 · manual · `app/helpers/api/additional_requests_helper.rb:837-851`

#### API-XDNEG-023 — With a fixed quantity, a counter offer cannot change the quantity
- **Why it matters.** `allow_fixed_quantity_for_bidding` means everyone quotes the full quantity; a counter offer that changes it
  breaks the comparison.
- **Setup.** Round config `allow_fixed_quantity_for_bidding` ON; line quantity 50.
- **Steps.** Counter with quantity 40.
- **Expected.** HTTP 422 code 208 'Offer Quantity should be equal to the Auction Quantity'.
- **Oracle.** 422 + 208.
- **Trace.** P1 · manual · `app/helpers/api/additional_requests_helper.rb:919-925`

#### API-XDNEG-024 — Under- and over-quantity rules bind counter quantities
- **Why it matters.** When under- or over-quantity quoting is not allowed, a counter offer must not ask for it either.
- **Setup.** Round config `is_under_quantity_allowed` false (then `is_over_quantity_allowed` false); line quantity 50.
- **Steps.** Counter with 40, then with 60.
- **Expected.** 40 → HTTP 422 code 39 'Quantity cannot be less than the allowed quantity'; 60 → code 42 'Quantity cannot be more
  than the allowed quantity'. With both settings at their default (true) both are accepted.
- **Oracle.** 422 + 39 / 42.
- **Trace.** P2 · manual · `app/helpers/api/additional_requests_helper.rb:926-931`

#### API-XDNEG-025 — A counter offer on a line the vendor regretted is refused
- **Why it matters.** A regretted line has no active quote (its bid line is inactive, which the raise filters out). Countering it
  would create a price the vendor declined to give.
- **Setup.** Vendor bid with line 1 quoted and line 2 regretted.
- **Steps.** Counter line 2 only.
- **Expected.** HTTP 422 code 587 'You cannot raise a counter offer on a non quoted item.' In a bulk counter offer the line is
  skipped silently instead.
- **Oracle.** 422 + 587.
- **Trace.** P1 · manual · `app/helpers/api/additional_requests_helper.rb:159`, `app/helpers/api/additional_requests_helper.rb:795-800`

#### API-XDNEG-026 — A counter offer that changes nothing answers success without sending anything
- **Why it matters.** When every row equals the quote (or only a remark is given), no request is created and the remark is lost,
  but the reply is still success. The dashboard blocks this ('You must change atleast one column…'); API clients do not get told.
- **Setup.** Active vendor bid at 100 for 50 KG.
- **Steps.** Raise a counter offer with price 100, quantity 50 and a remark.
- **Expected.** HTTP 422 'nothing to counter'. Today: HTTP 200 {success: true}, no request, no remark, bid stays active.
- **Oracle.** No additional request; bid status active.
- **Trace.** P2 · manual · `app/helpers/api/additional_requests_helper.rb:186`

#### API-XDNEG-027 — The buyer's counter-offer remark is cleaned and shown to the vendor
- **Why it matters.** The remark is the buyer's justification. HTML is stripped from every string parameter before the controller
  runs, then the remark is stored as a counter_offer_remark on the first request and returned by the counter-offer log.
- **Setup.** Active vendor bid.
- **Steps.** Raise a counter offer with remark `<b>Best</b> offer <script>x</script>`; open the counter-offer log.
- **Expected.** Stored and shown as plain text without tags; creator_counter_offer_remarks carries it.
- **Oracle.** GET `/v1/additional_requests/<id>/counter_offer_details` → creator_counter_offer_remarks.
- **Trace.** P2 · manual · `app/controllers/concerns/params_auth.rb:18-43`, `app/helpers/api/additional_requests_helper.rb:421-428`, `app/controllers/api/v1/additional_requests_controller.rb:176`

#### API-XDNEG-028 — A buyer colleague who cannot view the event cannot counter its bids
- **Why it matters.** Counter offers move prices; only users who can see the event may raise them.
- **Setup.** Same company; second buyer not on the event team and without company-wide event visibility.
- **Steps.** The second buyer raises a counter offer on a bid of the event.
- **Expected.** HTTP 422 code 101 'You are not allowed to perform this action'.
- **Oracle.** 422 + 101.
- **Trace.** P1 · manual · `app/helpers/api/additional_requests_helper.rb:954-963`

#### API-XDNEG-029 — A buyer without create rights on events cannot counter
- **Why it matters.** Read-only buyer roles must not negotiate.
- **Setup.** Buyer whose role has trade read_record but not create_record.
- **Steps.** Raise a counter offer on a bid of an event the user can view.
- **Expected.** HTTP 422 code 101.
- **Oracle.** 422 + 101.
- **Trace.** P1 · manual · `app/helpers/api/additional_requests_helper.rb:956-958`

#### API-XDNEG-030 — Screen-only switches do not stop a counter offer sent through the API
- **Why it matters.** `hide_counter_offer_rfq` (company), view-only mode (`read_only_mode_enabled` on the round), a blacklisted
  vendor and a fast bid outside evaluation time all hide or disable the button, but none is checked by the raise endpoint. If the
  business relies on them as rules, the API is a bypass.
- **Setup.** Company `hide_counter_offer_rfq` ON; an RFQ round in view-only mode; one blacklisted vendor with an active bid.
- **Steps.** Raise a counter offer on that vendor's bid through the API.
- **Expected.** Product decision needed: refused like the screen. Today: accepted (no such checks in the raise path).
- **Oracle.** 200 + new additional request.
- **Trace.** P2 · manual · `app/helpers/api/additional_requests_helper.rb:155-198`, `app/controllers/api/v1/users_controller.rb:786`

## 3. Bulk counter offers

#### API-XDNEG-031 — A bulk counter offer for an unknown round is refused as not found
- **Why it matters.** The bulk action dereferences the round without a nil check; the before_action is the only stop.
- **Setup.** Authenticated buyer. `Z2dnWmdaUWtnZw==` is a round id that does not exist (`WrongUuid1=` takes the same branch).
- **Steps.** `POST /additional_request/raise_bulk_counter_offer` with `{"trade_request_uuid": "Z2dnWmdaUWtnZw==", "change_type": "counter_offer_for_bid", "is_bulk_counter_offer": true, "sheets": {"inline_components": {"data": [<row>]}}}`.
- **Expected.** HTTP 422 code 4 'Request not found'; no counter offer anywhere.
- **Oracle.** 422 + code 4.
- **Trace.** P1 · automate · `EDGE-DNEG-031` · `app/controllers/concerns/trade_template_helper.rb:5551-5555`

#### API-XDNEG-032 — A bulk counter offer that also names a missing bid does not crash
- **Why it matters.** The shared transform prefers the bid branch whenever `item_type` is `counter_offer_for_bid` and an item id is
  present, ignoring the round named in the body, and dereferences a nil bid.
- **Setup.** `{{tradeId}}` is the sandbox round (open, no bids).
- **Steps.** `POST /additional_request/raise_bulk_counter_offer` for `{{tradeId}}` plus `"item_type": "counter_offer_for_bid", "item_uuid": "Z2dnWmdaUWtnZw=="`.
- **Expected.** HTTP 422 code 4. Today: NoMethodError on nil → HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DNEG-032` · `app/controllers/concerns/trade_template_helper.rb:5548-5550`

#### API-XDNEG-033 — A bulk counter-offer sheet sent as an object does not crash
- **Why it matters.** Same unguarded transform as API-XDNEG-002, reached from the bulk route.
- **Setup.** `{{tradeId}}` sandbox round.
- **Steps.** `POST /additional_request/raise_bulk_counter_offer` for `{{tradeId}}` with `"data": {"0": <row>}`.
- **Expected.** HTTP 422. Today: TypeError → HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-DNEG-033` · `app/controllers/concerns/trade_template_helper.rb:5613-5622`

#### API-XDNEG-034 — A bulk counter offer that reaches no vendor still answers success
- **Why it matters.** The bulk action only counters bids in status active and answers `{success: true}` whatever happened. On a
  round with no bids (or where every bid is already countered or awarded) the buyer is told the offer went out. The screen hides
  the action below two bids; the API does not.
- **Setup.** `{{tradeId}}` sandbox round: open, no bids.
- **Steps.** `POST /additional_request/raise_bulk_counter_offer` for `{{tradeId}}` with one priced row; then read the round.
- **Expected.** Product: a refusal saying there is no vendor to counter. Today: HTTP 200 {success: true}, nothing raised. Never 5xx.
- **Oracle.** No vendor shows a pending counter offer after the call.
- **Trace.** P2 · automate · `EDGE-DNEG-034` · `app/controllers/api/additional_requests_controller.rb:38-55`

#### API-XDNEG-035 — A bulk counter offer is all-or-nothing
- **Why it matters.** All vendors are countered inside one transaction. If one vendor's counter is refused (for example price
  reversal off and the counter is above that vendor's quote), nobody receives it and the reply names only the first failure.
- **Setup.** Closed RFQ with three active bids (100, 120, 140); `allow_price_reversal_in_counter_offer_in_rfq` OFF.
- **Steps.** Bulk counter at 110 for the line.
- **Expected.** HTTP 422 code 300 'You cannot increase the price' and no counter offer on any of the three bids (the 120 and 140
  vendors are not countered either).
- **Oracle.** No additional requests for the round; all bids active.
- **Trace.** P1 · manual · `app/controllers/api/additional_requests_controller.rb:43-51`

#### API-XDNEG-036 — A bulk counter offer silently skips vendors already countered or awarded
- **Why it matters.** Only bids in status active are included; vendors with a pending counter offer, an awarded bid or a bid under
  price approval are skipped without telling the buyer, who believes everyone was countered.
- **Setup.** Round with three bids: one active, one requested (pending counter offer), one selected.
- **Steps.** Bulk counter offer; read each vendor's state.
- **Expected.** Only the active vendor is countered; the reply should say who was skipped (today it does not).
- **Oracle.** One new grouping of requests.
- **Trace.** P1 · manual · `app/controllers/api/additional_requests_controller.rb:40`

#### API-XDNEG-037 — A bulk counter offer while another counter is being sent answers an empty 204
- **Why it matters.** When a vendor's bid is locked by a concurrent counter offer, the helper raises `_error_`, the action returns
  without rendering, and Rails answers 204 No Content with the whole bulk rolled back — the dashboard treats that as success.
  (Only bulk raises and answers take this lock; a single-vendor raise never does — API-XDNEG-008.)
- **Setup.** Two buyers send a bulk counter offer on the same round at the same moment (the lock is held per bid only while that
  bid's requests are written).
- **Steps.** Fire both requests in parallel.
- **Expected.** The second answers a 422 'Transaction in Progress' (code 516). Today: 204 empty body, nothing raised for the second.
- **Oracle.** Status of the second call; no second set of requests.
- **Trace.** P1 · manual · `app/helpers/api/additional_requests_helper.rb:50-52`, `app/controllers/api/additional_requests_controller.rb:48-49`

#### API-XDNEG-038 — A bulk counter offer includes bids the buyer entered for vendors
- **Why it matters.** The check that would exclude surrogate bids is commented out, while the screen hides Bulk Counter Offer
  whenever any vendor's bid is a surrogate. Through the API the vendor is countered on a price they never typed.
- **Setup.** Round with one vendor bid and one surrogate bid, both active.
- **Steps.** Bulk counter offer through the API.
- **Expected.** Product decision: skip surrogate bids (matching the screen). Today: both are countered.
- **Oracle.** Requests exist on the surrogate bid.
- **Trace.** P1 · manual · `app/helpers/api/additional_requests_helper.rb:53`

#### API-XDNEG-039 — Without the bulk flag, one vendor's unquoted line aborts the whole bulk counter offer
- **Why it matters.** `is_bulk_counter_offer` is what makes the per-bid checks tolerant (skip unquoted lines, skip the column
  check). A client that forgets it gets a 587 for the first vendor who regretted a line, and nobody is countered.
- **Setup.** Round with two active bids; vendor B did not quote line 2.
- **Steps.** Bulk counter offer on lines 1 and 2 without `is_bulk_counter_offer`.
- **Expected.** HTTP 422 code 587 'You cannot raise a counter offer on a non quoted item.'; no counter offers. With the flag:
  vendor A countered on both lines, vendor B on line 1.
- **Oracle.** Requests per bid.
- **Trace.** P2 · manual · `app/helpers/api/additional_requests_helper.rb:166-170`, `app/helpers/api/additional_requests_helper.rb:795-800`

#### API-XDNEG-040 — A bulk counter offer is sent with only one bid on the round
- **Why it matters.** The screen disables Bulk Counter Offer when the round has one bid or fewer, and when view-only mode or a
  project hold is on. None of these are checked by the API.
- **Setup.** Closed RFQ with exactly one active bid.
- **Steps.** Bulk counter offer through the API.
- **Expected.** Product decision: refused like the screen, or documented as allowed. Today: accepted.
- **Oracle.** 200 + one counter offer.
- **Trace.** P2 · manual · `app/controllers/api/additional_requests_controller.rb:35-56`

## 4. The vendor's answer — accept, reject, modify

#### API-XDNEG-041 — Answering a counter offer with an empty body is refused as not found
- **Why it matters.** Baseline for the answer endpoint: no ids must be refused, never treated as "nothing to do, success".
- **Setup.** Authenticated buyer.
- **Steps.** `PATCH /additional_request/resolve_additional_request` with `{}`.
- **Expected.** HTTP 422 code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EDGE-DNEG-041` · `app/controllers/api/additional_requests_controller.rb:145-152`

#### API-XDNEG-042 — An answer whose request list is a single object does not crash
- **Why it matters.** Sending one object instead of a one-element list is a common client mistake; `pluck` is called on it without
  a type check.
- **Setup.** Authenticated buyer; ghost id.
- **Steps.** `PATCH /additional_request/resolve_additional_request` with `{"item_type": "counter_offer_for_bid", "requests": {"uuid": "Z2dnWmdaUWtnZw==", "resolution": "accepted"}}`.
- **Expected.** HTTP 422 code 2. Today: NoMethodError (Parameters has no pluck) → HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DNEG-042` · `app/controllers/api/additional_requests_controller.rb:63-64`

#### API-XDNEG-043 — An answer whose request list holds bare numbers does not crash
- **Why it matters.** `requests` and `request_ids` are two accepted shapes; numbers under `requests` crash.
- **Setup.** Authenticated buyer.
- **Steps.** `PATCH /additional_request/resolve_additional_request` with `{"item_type": "counter_offer_for_bid", "requests": [999999999], "resolution": "accepted"}`.
- **Expected.** HTTP 422. Today: `999999999[:id]` raises TypeError → HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-DNEG-043` · `app/controllers/api/additional_requests_controller.rb:64`

#### API-XDNEG-044 — An answer in the dashboard's shape for an unknown request is refused
- **Why it matters.** Pins the real client shape (`requests: [{uuid, resolution}]`, uuid decoded to id by ParamsAuth) so a change in
  how uuids inside lists are decoded is caught.
- **Setup.** Authenticated buyer.
- **Steps.** `PATCH /additional_request/resolve_additional_request` with `{"item_type": "counter_offer_for_bid", "requests": [{"uuid": "Z2dnWmdaUWtnZw==", "resolution": "accepted"}], "resolution_remarks": "QA_Platform_{{stamp}}"}`.
- **Expected.** HTTP 422 code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EDGE-DNEG-044` · `app/controllers/api/additional_requests_controller.rb:146-152`

#### API-XDNEG-045 — The vendor accepts inside the window and the bid is revised to the counter price
- **Why it matters.** The happy path every other case is measured against: accepting creates a new bid at the counter price, the
  old bid becomes revised, the requests are marked accepted with the vendor's remark, and the buyer is emailed.
- **Setup.** Live RFQ (or evaluation window); vendor bid 100 × 50 KG; buyer counter at 90. Vendor session.
- **Steps.** 1. Vendor `PATCH /additional_request/resolve_additional_request` `{"item_type": "counter_offer_for_bid", "requests": [{"uuid": "<request>", "resolution": "accepted"}], "resolution_remarks": "ok"}`.
  2. Buyer reads the vendor's quote details.
- **Expected.** HTTP 200 success. New active bid at 90; previous bid revised; request resolution accepted; buyer email "counter
  offer accepted"; bid context label counter_offer_accepted (green thumbs-up on the screen).
- **Oracle.** GET `/v1/trade/<round>/quote_details/<new bid>` → price 90, counter_offer_additional_requests [{resolution: accepted}].
- **Trace.** P0 · manual · `app/helpers/additional_request_resolution_helper.rb:612-640`

#### API-XDNEG-046 — The vendor rejects after the round closed, and the original quote stands
- **Why it matters.** Rejecting has no time guard (unlike accepting, API-XDNEG-010), so a vendor can always say no. The line goes
  back to its quoted state and the bid becomes active again.
- **Setup.** Closed RFQ, no evaluation window; pending counter offer. Vendor session.
- **Steps.** Vendor resolves with `"resolution": "rejected"` and a remark.
- **Expected.** HTTP 200. Requests not_accepted; bid active at the original price; buyer email "rejected" with the remark.
- **Oracle.** counter_offer_details → participant_counter_offer_remarks = the remark; bid price unchanged.
- **Trace.** P1 · manual · `app/helpers/additional_request_resolution_helper.rb:693-725`

#### API-XDNEG-047 — The vendor must answer every part of one counter offer together
- **Why it matters.** A counter offer on two lines plus a global field is one group. Answering only part of it is refused, so a
  vendor cannot accept the price on line 1 and reject line 2.
- **Setup.** Pending counter offer on two lines (two requests in one grouping). Vendor session.
- **Steps.** Vendor accepts only the first request id.
- **Expected.** HTTP 422 code 888 'Invalid Parameters'; nothing changes.
- **Oracle.** Both requests still requested.
- **Trace.** P1 · manual · `app/controllers/api/additional_requests_controller.rb:207-219`

#### API-XDNEG-048 — Rejecting without a remark is allowed
- **Why it matters.** Nothing requires the vendor's reason; the buyer then sees an empty remark. Pins current behaviour so a
  later mandatory-remark rule is a deliberate change.
- **Setup.** Pending counter offer. Vendor session.
- **Steps.** Reject with no resolution_remarks.
- **Expected.** HTTP 200; participant_counter_offer_remarks is null in the counter-offer log.
- **Oracle.** counter_offer_details.
- **Trace.** P2 · manual · `app/helpers/additional_request_resolution_helper.rb:1138-1144`, `app/controllers/api/v1/additional_requests_controller.rb:175`

#### API-XDNEG-049 — The vendor modifies the counter offer inside the evaluation window
- **Why it matters.** With modification enabled, the vendor answers with their own price instead of yes/no: they place a revised
  bid with a remark; the requests become modified and the buyer gets a "modified" email.
- **Setup.** `counter_offer_modification_enabled` ON; round in its evaluation window (`rfq_extra_closing_time`); bid 100, counter 85.
  Vendor session.
- **Steps.** Vendor revises the bid to 92 with resolution_remarks "best we can do".
- **Expected.** HTTP 200. New bid 92; requests resolution modified; old bid lines revised; buyer email "modified" with the remark;
  orange thumbs-up on the buyer's screen.
- **Oracle.** quote_details → counter_offer_additional_requests [{resolution: modified}].
- **Trace.** P0 · manual · `app/models/model_helpers/trade_request_model_helper.rb:1108-1110`, `app/models/model_helpers/trade_request_model_helper.rb:1165-1167`, `app/helpers/additional_request_resolution_helper.rb:727-748`

#### API-XDNEG-050 — Modifying is refused when the setting is off or the evaluation window is over
- **Why it matters.** Both conditions are needed. During live bidding the vendor gets 499; after the window it is 33. A regression
  either lets vendors bypass the buyer's counter or blocks a configured negotiation.
- **Setup.** Pending counter offer; (a) setting OFF in the evaluation window; (b) setting ON after the window ended. Vendor session.
- **Steps.** Vendor revises the bid in each state.
- **Expected.** (a) HTTP 422 code 499 'You have a counter offer pending on this bid'; (b) HTTP 422 code 33 'Order not active'.
- **Oracle.** Codes; requests still requested.
- **Trace.** P1 · manual · `app/helpers/api/v1/bids_controller_helper.rb:374-383`, `app/helpers/api/v1/bids_controller_helper.rb:564-571`

#### API-XDNEG-051 — A vendor revising a bid that is under approval does not crash
- **Why it matters.** The revise path looks up the pending request for a bid in status requested OR approval_requested and reads
  its change_requested without a nil check. A bid in approval_requested (new approval workflow) has no such request → crash.
- **Setup.** Vendor bid in status approval_requested (e.g. price-increase approval through the new workflow). Vendor session.
- **Steps.** Vendor revises the bid.
- **Expected.** HTTP 422 'Your current bid is awaiting approval' (code 490) or similar. Today: NoMethodError on nil → HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P1 · manual · `app/helpers/api/v1/bids_controller_helper.rb:376-379`

#### API-XDNEG-052 — A colleague at the vendor company can answer the counter offer
- **Why it matters.** The answer is allowed for the addressed user OR anyone whose companies include the vendor company. That suits
  shared vendor inboxes, but it must not extend to other companies.
- **Setup.** Pending counter offer addressed to vendor user A; vendor user B in the same company. Vendor sessions.
- **Steps.** User B accepts; separately a user of a third company tries.
- **Expected.** User B: HTTP 200. Third company: HTTP 422 code 5 'Not authorized'.
- **Oracle.** Codes; who is recorded as resolver.
- **Trace.** P2 · manual · `app/controllers/api/additional_requests_controller.rb:153-162`

#### API-XDNEG-053 — Accepting a counter offer requested for partial closing awards the bid
- **Why it matters.** A raise with `request_source: counter_offer_for_partial_closing` stores close-bid data on the bid; when the
  vendor accepts, the bid is closed (awarded) with that data, re-selecting the approval flow by value. The request source is taken
  from the client body, so any raise can carry it. The clean-up line `other_details["close_bid_meta_data"] = nil && ranked_bid.save`
  never calls save (`nil && …`), so the stored close data is only cleared in memory.
- **Setup.** Partial-closing counter offer raised from the award screen; vendor accepts inside the window.
- **Steps.** 1. Raise with request_source counter_offer_for_partial_closing and close_bid_meta_data. 2. Vendor accepts.
- **Expected.** The accepted bid is closed for the partial quantity; the close_trade approval is evaluated for the partial value
  (not the stored flow); notifications for the award go out. A raise from the plain counter-offer screen must not be able to set
  this source.
- **Oracle.** Bid selected/approval requested after accept.
- **Trace.** P1 · manual · `app/helpers/api/additional_requests_helper.rb:156`, `app/helpers/api/additional_requests_helper.rb:191`, `app/helpers/additional_request_resolution_helper.rb:641-668`

#### API-XDNEG-054 — An unknown answer leaves the counter offer pending but says success
- **Why it matters.** Covered for the code path in API-XAWD-076; this is the read-back: after a 200 for `resolution: "maybe"` the
  vendor still sees the banner and the buyer still sees Revoke.
- **Setup.** Pending counter offer. Vendor session.
- **Steps.** Answer with `"resolution": "maybe"`; read the round as buyer.
- **Expected.** Product: HTTP 422. Today: 200 and the request stays requested.
- **Oracle.** quote_details pending tasks unchanged.
- **Trace.** P2 · manual · `app/helpers/additional_request_resolution_helper.rb:597-609`

## 5. Revoking a counter offer

#### API-XDNEG-055 — Revoking with the request list sent as text does not crash
- **Why it matters.** Revoke reads `requests.pluck(:id)` with no type check (missing list is API-XAWD-073).
- **Setup.** Authenticated buyer.
- **Steps.** `PATCH /additional_request/revoke_additional_requests` with `{"requests": "QA_Platform_x_{{stamp}}"}`.
- **Expected.** HTTP 422 code 2. Today: NoMethodError → HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DNEG-055` · `app/controllers/api/additional_requests_controller.rb:95-96`

#### API-XDNEG-056 — Revoking with bare numbers does not crash
- **Why it matters.** Unlike resolve, revoke has no `request_ids` alternative, so a client sending ids directly crashes it.
- **Setup.** Authenticated buyer.
- **Steps.** `PATCH /additional_request/revoke_additional_requests` with `{"requests": [999999999]}`.
- **Expected.** HTTP 422. Today: TypeError → HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-DNEG-056` · `app/controllers/api/additional_requests_controller.rb:96`

#### API-XDNEG-057 — Revoking in the dashboard's shape for an unknown request is refused
- **Why it matters.** Pins the exact body the Revoke Counter Offer button sends (`requests: [{uuid, status: "revoke"}]`, no item_type).
- **Setup.** Authenticated buyer.
- **Steps.** `PATCH /additional_request/revoke_additional_requests` with `{"requests": [{"uuid": "Z2dnWmdaUWtnZw==", "status": "revoke"}]}`.
- **Expected.** HTTP 422 code 4 'Request not found'; nothing revoked.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EDGE-DNEG-057` · `app/controllers/api/additional_requests_controller.rb:181-185`

#### API-XDNEG-058 — Revoking an empty list is refused, not a silent success
- **Why it matters.** The dashboard sends `[]` when it has no request ids for the vendor; that must not answer success while the
  counter offer stays live.
- **Setup.** Authenticated buyer.
- **Steps.** `PATCH /additional_request/revoke_additional_requests` with `{"requests": []}`.
- **Expected.** HTTP 422 code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EDGE-DNEG-058` · `app/controllers/api/additional_requests_controller.rb:181-185`

#### API-XDNEG-059 — A counter offer the vendor already accepted cannot be revoked
- **Why it matters.** Revoke restores the original price; after acceptance the price is committed in a new bid.
- **Setup.** Vendor accepted the counter offer (API-XDNEG-045).
- **Steps.** Buyer revokes it with the same request ids.
- **Expected.** HTTP 422 code 4 'Request not found' (only requested + active requests can be revoked); new bid unchanged.
- **Oracle.** 422 + 4; bid price stays at the counter price.
- **Trace.** P1 · manual · `app/controllers/api/additional_requests_controller.rb:181-185`

#### API-XDNEG-060 — The event owner or a super admin can revoke another buyer's counter offer
- **Why it matters.** Revoke is allowed for the requester, the event owner and super admins; everyone else gets 5
  (API-XAWD-075). Pins the allowed side.
- **Setup.** Counter offer raised by buyer A on an event owned by buyer O.
- **Steps.** Buyer O revokes it.
- **Expected.** HTTP 200; request void/revoke; bid active; vendor gets the "revoked" push.
- **Oracle.** quote_details → resolution revoke.
- **Trace.** P2 · manual · `app/controllers/api/additional_requests_controller.rb:199-203`

#### API-XDNEG-061 — Revoking with a valid but wrong status voids the request yet stores it as active
- **Why it matters.** The client chooses the stored status (`request["status"]`). With `"active"` the request is voided
  (resolution void) but keeps status active — an inconsistent row that any report filtering on status alone counts as live,
  while the bid is already back to active.
- **Setup.** Pending counter offer raised by the caller.
- **Steps.** Revoke with `requests: [{uuid: <request>, status: "active"}]`.
- **Expected.** HTTP 422 (only "revoke" is a valid revoke status). Today: 200; status active, resolution void.
- **Oracle.** The request row: status active, resolution void.
- **Trace.** P2 · manual · `app/helpers/api/additional_requests_helper.rb:646-653`

#### API-XDNEG-062 — Revoke takes encoded ids only under "uuid", unlike the answer endpoint
- **Why it matters.** Resolve decodes encoded ids found under `id`; revoke does not, so the same encoded id under `id` is
  "not found" for revoke. Integrators following one endpoint fail on the other.
- **Setup.** Pending counter offer; its encoded id.
- **Steps.** Revoke with `requests: [{id: "<encoded id>", status: "revoke"}]`.
- **Expected.** Same behaviour as resolve (decoded and revoked). Today: HTTP 422 code 4 'Request not found'.
- **Oracle.** 422 + 4 vs 200 with `uuid`.
- **Trace.** P2 · manual · `app/controllers/api/additional_requests_controller.rb:96`, `app/controllers/api/additional_requests_controller.rb:124-128`

#### API-XDNEG-063 — A revoked counter offer is announced to the vendor by push only
- **Why it matters.** Raising sends a push and an email; revoking sends only a push, so a vendor working from email still sees the
  offer and may accept a counter that no longer exists (their accept then answers 'Request not found').
- **Setup.** Pending counter offer; QA vendor mailbox.
- **Steps.** Buyer revokes; check the mailbox and the vendor's notifications.
- **Expected.** Product decision: an email like the one for a new counter offer. Today: push `revoked_counter_offer` only.
- **Oracle.** Mailbox empty; notification menu entry present.
- **Trace.** P2 · manual · `app/helpers/api/additional_requests_helper.rb:892-894`

## 6. Read-backs — counter-offer log, quote details, pending tasks

#### API-XDNEG-064 — The counter-offer log for an unknown request does not crash
- **Why it matters.** The log loads the first matching request and dereferences it with no not-found branch, before any
  authorisation. A stale link or a deleted request crashes the Counter offer logs screen.
- **Setup.** Authenticated buyer.
- **Steps.** `GET /v1/additional_requests/Z2dnWmdaUWtnZw==/counter_offer_details`.
- **Expected.** HTTP 422 code 4. Today: NoMethodError on nil → HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EDGE-DNEG-064` · `app/controllers/api/v1/additional_requests_controller.rb:156-157`

#### API-XDNEG-065 — The counter-offer log for an unreadable id does not pick someone else's request
- **Why it matters.** With an id that decodes to nil, the query becomes `id IS NULL OR parent_id IS NULL`, which matches every
  top-level request in the database; the oldest one (any company, any kind) is loaded and its bid fetched. Only the tenant check
  afterwards stands between the buyer and another company's negotiation, and a non-bid grouping key loads a random bid.
- **Setup.** Authenticated buyer. The runnable twin is held: once the crash is fixed without a company scope, running it would copy another company's counter offer into our logs (live 2026-10-03: HTTP 500).
- **Steps.** `GET /v1/additional_requests/WrongUuid1=/counter_offer_details`.
- **Expected.** HTTP 422 code 4 without reading any request. Today: refused late (455 / 101) or 404 from Bid.find — never 5xx, and
  a 200 would be a cross-tenant leak.
- **Oracle.** Status < 500 and not 2xx.
- **Trace.** P1 · automate · `EDGE-DNEG-065` · `app/controllers/api/v1/additional_requests_controller.rb:156-162`

#### API-XDNEG-066 — The vendor's quote details show the counter offer the award revoked
- **Why it matters.** The read-back for "what happened to my counter offer": the log lists resolved, modified and voided requests
  (void shown as revoke) for the vendor's bid. The journey raises a counter offer and nobody answers it; submitting the award
  revokes it, so it must appear here as revoked and the award must use the original price.
- **Setup.** `{{pricingTradeUuid}}` is the journey's closed round; `{{bidUuid}}` the QA vendor's bid; the run ticked the counter-offer feature.
- **Steps.** `GET /v1/trade/{{pricingTradeUuid}}/quote_details/{{bidUuid}}` as the buyer; read
  participants → counter_offer_additional_requests.
- **Expected.** HTTP 200 with one entry, resolution revoke. Never 5xx.
- **Oracle.** counter_offer_additional_requests[0].resolution == "revoke"; bid price = the vendor's original price.
- **Trace.** P2 · automate · `EDGE-DNEG-066` · `app/controllers/concerns/trade_controller_helper.rb:5595-5610`

#### API-XDNEG-067 — The pending-tasks list never offers counter offers for approval
- **Why it matters.** The older pending-tasks list is where approvers act. It is filtered to approval kinds (event creation,
  surrogate bid, bid selection); a counter offer leaking in would give the buyer an approve button for the vendor's decision.
- **Setup.** Authenticated buyer (PROCOL DEMO).
- **Steps.** `GET /v1/additional_requests/pending_tasks`.
- **Expected.** HTTP 200; every task's approval_key_attribute is an approval kind. Never 5xx.
- **Oracle.** No task with change_type counter_offer_for_bid.
- **Trace.** P2 · automate · `EDGE-DNEG-067` · `app/controllers/api/v1/additional_requests_controller.rb:9-12`

#### API-XDNEG-068 — The counter-offer log of another company's event is refused
- **Why it matters.** The tenant check is the only guard on this read (see API-XDNEG-065).
- **Setup.** A counter offer id from another client's event (known to the tester, not to the caller).
- **Steps.** Buyer of PROCOL DEMO calls counter_offer_details for it.
- **Expected.** HTTP 422 code 101 'You are not allowed to perform this action' (or 455 from the policy); no sheet data.
- **Oracle.** No inline_data in the reply.
- **Trace.** P1 · manual · `app/controllers/api/v1/additional_requests_controller.rb:159-162`

## 7. Awarding after a counter offer, and notifications

#### API-XDNEG-069 — Submitting the award revokes counter offers the vendors never answered
- **Why it matters.** Which price does the award use? Pending counter offers on the latest commercial round are revoked when the
  award is submitted, so the award uses the vendor's quoted price, and the vendor only gets a push saying it was revoked.
- **Setup.** Closed round; vendor bid 100 with a pending counter offer at 90; award proposal for that vendor (no contract form).
- **Steps.** Submit the award; read the vendor's quote details.
- **Expected.** Award submitted at 100. Counter offer resolution void (shown as revoke); bid active then selected (or active while
  approval is pending).
- **Oracle.** API-XDNEG-066 read-back; awarding sheet value 100 × qty.
- **Trace.** P0 · manual · `app/helpers/api/proposal_helper.rb:168-169`, `app/helpers/api/proposal_helper.rb:252-268`

#### API-XDNEG-070 — An award with a contract form leaves pending counter offers alive
- **Why it matters.** The revoke step runs only on the non-contract path. With a contract form, bids are closed while a counter
  offer is still pending to the vendor; the vendor still sees an offer they can try to accept after the award.
- **Setup.** Award proposal with a contract form; vendor bid with a pending counter offer.
- **Steps.** Submit the award; vendor accepts the counter offer.
- **Expected.** Product: the counter offer is revoked at award, as on the normal path. Today: it stays requested; the accept then
  fails (the awarded bid is not found, code 32 'Bid not found') or the award itself is refused — either way the state is left
  inconsistent.
- **Oracle.** Counter offer resolution after submit (should be void).
- **Trace.** P0 · manual · `app/helpers/api/proposal_helper.rb:148-169`, `app/controllers/concerns/bids_controller_helper.rb:45-46`

#### API-XDNEG-071 — An award prepared before the vendor accepted must be re-done
- **Why it matters.** Accepting a counter offer revises the bid. A proposal built on the old bid is refused at submit, so the buyer
  re-awards and the award picks up the counter price.
- **Setup.** Proposal drafted for vendor bid 100; vendor then accepts a counter at 90 (new bid).
- **Steps.** 1. Submit the old proposal. 2. Re-create the proposal and submit.
- **Expected.** 1. HTTP 422 code 1126 'A few bids have been revised. Please re-award to continue.' 2. Accepted at 90.
- **Oracle.** Awarding sheet price 90.
- **Trace.** P0 · manual · `app/helpers/api/proposal_helper.rb:121-125`, `app/helpers/api/proposal_helper.rb:241-250`

#### API-XDNEG-072 — Approving an award whose bid was revised by a counter offer fails cleanly
- **Why it matters.** Follows API-XDNEG-012: the approver approves, close_bids finds a revised bid and refuses. The approver must
  get a readable error and the proposal must not be half-closed.
- **Setup.** Award under approval; a counter offer raised through the API and accepted by the vendor.
- **Steps.** Approver approves.
- **Expected.** HTTP 422 code 832 'Bid cannot be awarded as it is already revised.'; proposal unchanged; no PO/LOA.
- **Oracle.** Proposal status; no order created.
- **Trace.** P1 · manual · `app/helpers/api/proposal_helper.rb:312-316`

#### API-XDNEG-073 — The vendor is emailed once per counter offer, and the buyer once per answer
- **Why it matters.** The notification contract: new counter → push + email to the vendor (5 s delay) + reminders; accept / reject
  / modify → email to the buyer with the vendor's remark; revoke → push only. Duplicates or gaps are what users notice first.
- **Setup.** QA vendor and QA buyer mailboxes; live RFQ with an evaluation window.
- **Steps.** Raise; vendor rejects with a remark; raise again; vendor accepts.
- **Expected.** Vendor: 2 "new counter offer" emails (+ reminders inside the window). Buyer: one "rejected" (with remark) and one
  "accepted" email.
- **Oracle.** Mailboxes; EmailNotificationWorker job names new_counter_offer_to_vendor / send_counter_offer_mail_to_buyer.
- **Trace.** P1 · manual · `app/helpers/api/additional_requests_helper.rb:861-866`, `app/helpers/additional_request_resolution_helper.rb:640`, `app/helpers/additional_request_resolution_helper.rb:712-718`

#### API-XDNEG-074 — Several rounds of negotiation on the same vendor are allowed
- **Why it matters.** After a reject the bid is active again; after an accept the new bid is active. Either way the buyer can counter
  again, and the log keeps every round in order. There is no limit on rounds.
- **Setup.** Live RFQ; vendor bid 100.
- **Steps.** Counter 90 → vendor rejects; counter 95 → vendor accepts; counter 93 on the new bid.
- **Expected.** Each raise HTTP 200; the third is on the revised bid; the log lists two resolved entries (rejected, accepted) and the
  third stays pending (pending ones are not in the log).
- **Oracle.** quote_details counter_offer_additional_requests order and resolutions.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:5595-5610`, `app/helpers/additional_request_resolution_helper.rb:705-711`

#### API-XDNEG-075 — Withdrawing the event leaves bid counter offers pending
- **Why it matters.** Withdraw revokes requests attached to the round itself, not the counter offers attached to its bids, so the
  vendor keeps a counter-offer banner on a withdrawn event (and an accept answers 'Order not active').
- **Setup.** Live RFQ with a pending counter offer.
- **Steps.** Withdraw the round; read the counter offer.
- **Expected.** Product: bid counter offers revoked with the event. Today: still requested.
- **Oracle.** Request resolution after withdraw.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:253`

#### API-XDNEG-076 — Putting the PR line on hold revokes its pending counter offers
- **Why it matters.** When a purchase-request line feeding the event is held, pending counter offers on the commercial round are
  revoked so the vendor cannot accept a price for held demand.
- **Setup.** Event created from a PR; pending counter offer; hold the PR line.
- **Steps.** Hold the PR item; let PrItemHoldWorker run.
- **Expected.** Counter offer void; bid active; vendor push "revoked".
- **Oracle.** Request resolution void.
- **Trace.** P2 · manual · `app/workers/pr_item_hold_worker.rb:125-147`

## 8. Smart Suggest (AI counter offer)

#### API-XDNEG-077 — Smart Suggest without any line ids does not crash
- **Why it matters.** The suggestion endpoint has no parameter validation; it builds SQL from the line ids it was given.
- **Setup.** Authenticated buyer; `{{tradeId}}` sandbox round. The crash is reached only when the workspace has the Smart Suggest
  AI feature; otherwise the policy answers 455 first.
- **Steps.** `POST /ask_ai_chats/counter_offer` with `{"trade_request_uuid": "{{tradeId}}", "vendor_uuid": "Z2dnWmdaUWtnZw==", "trade_schedule_phase": "live"}`.
- **Expected.** HTTP 422 code 2 (or 455). Today: `nil.map` → HTTP 500, before the AI service is called.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-DNEG-077` · `app/controllers/concerns/ask_ai_chats_controller_helper.rb:1672-1676`

#### API-XDNEG-078 — Smart Suggest with an empty line list does not crash
- **Why it matters.** An empty selection builds `WHERE ip.id IN ()`, which Postgres rejects; the error is re-raised as a 500.
- **Setup.** As API-XDNEG-077.
- **Steps.** `POST /ask_ai_chats/counter_offer` with `"trade_product_uuids": []` added.
- **Expected.** HTTP 422 code 2. Today: PG syntax error → HTTP 500.
- **Oracle.** Status < 500.
- **Trace.** P2 · automate · `EDGE-DNEG-078` · `app/controllers/concerns/ask_ai_chats_controller_helper.rb:1720-1744`

#### API-XDNEG-079 — Smart Suggest for an unknown event is refused before anything is sent to the AI
- **Why it matters.** Prices must never be gathered for a round that does not exist.
- **Setup.** Authenticated buyer.
- **Steps.** `POST /ask_ai_chats/counter_offer` with `"trade_request_uuid": "Z2dnWmdaUWtnZw=="` and `"trade_product_uuids": ["{{tradeProductUuid}}"]`.
- **Expected.** Refused: 404 (round not found) or 455 'You are not authorized to perform this action' when the feature is off.
- **Oracle.** Non-2xx, not 5xx.
- **Trace.** P2 · automate · `EDGE-DNEG-079` · `app/controllers/concerns/ask_ai_chats_controller_helper.rb:1691`

#### API-XDNEG-080 — Smart Suggest does not check that the event belongs to the caller
- **Why it matters.** The policy only checks the workspace has the AI feature; the helper loads any round by id and sends every
  vendor's quoted prices for the named lines to the AI service, returning per-vendor suggestions. A buyer of company A can get
  price-derived suggestions for company B's event.
- **Setup.** Two clients, both with the Smart Suggest feature; a round of client B with bids. Manual: must not be automated against
  real client data.
- **Steps.** As client A's buyer, call Smart Suggest with client B's round and line ids.
- **Expected.** HTTP 422 code 101 / 455. Today: no ownership check exists.
- **Oracle.** No output for B's lines.
- **Trace.** P1 · manual · `app/controllers/concerns/ask_ai_chats_controller_helper.rb:1666-1695`, `app/policies/ask_ai_chat_policy.rb:26-28`

## 9. The buyer's screens

#### UI-XDNEG-001 — Counter Offer appears only on a live, active, latest bid in a pricing round
- **Why it matters.** The button is the main entry to negotiation; showing it on the wrong bid sends offers nobody can act on.
- **Setup.** RFQ event with bids from three vendors: one active, one with a pending counter offer, one revised (older bid shown).
- **Steps.** Open the comparison view in submission time, in evaluation time, and after the round closed.
- **Expected.** Counter Offer shows only on the active, latest bid while the round is live or in evaluation time; never on RFP/RFI
  rounds; hidden when the round is closed.
- **Oracle.** isCounterOfferAllowed = live/evaluation time + bid active + pricing round + not under approval + no lot justification pending.
- **Trace.** P0 · automate · `src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:577-597`, `src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:707-715`

#### UI-XDNEG-002 — Counter Offer is hidden while an award proposal is under approval
- **Why it matters.** The screen's only protection against API-XDNEG-012; it must hold.
- **Setup.** Award proposal submitted for approval (proposal requested).
- **Steps.** Open the comparison view.
- **Expected.** No Counter Offer button on any vendor (for the proposal's lot).
- **Oracle.** isBidUnderApproval true.
- **Trace.** P1 · automate · `src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:571-575`

#### UI-XDNEG-003 — The "hide counter offer on RFQ" setting removes the button on RFQ rounds only
- **Why it matters.** A company-level switch (`hide_counter_offer_rfq`) changes what buyers can do; it must not hide auction counter offers.
- **Setup.** Company with `hide_counter_offer_rfq` ON; one RFQ and one auction with active bids.
- **Steps.** Open both comparison views.
- **Expected.** No Counter Offer on the RFQ; available on the auction. (The API still accepts RFQ counters — API-XDNEG-030.)
- **Oracle.** Button presence.
- **Trace.** P1 · manual · `src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:714`, `src/redux/user/index.js:536`

#### UI-XDNEG-004 — No Counter Offer on a bid the buyer entered for the vendor
- **Why it matters.** Surrogate bids are not countered from the screen; Bulk Counter Offer disappears too when any vendor's bid is a surrogate.
- **Setup.** Round with one vendor bid and one surrogate bid.
- **Steps.** Open the comparison view and the Settings menu.
- **Expected.** Counter Offer disabled/absent on the surrogate bid; Bulk Counter Offer not offered.
- **Oracle.** canSendCounterOffer = !isSurrogateBid; menu condition `layers.every(l => l.canSendCounterOffer)`.
- **Trace.** P1 · automate · `src/redux/orders/selectors.js:1253-1254`, `src/views/orderDetails/eventHeader/eventHeader.jsx:795-797`

#### UI-XDNEG-005 — Counter Offer is disabled for a blacklisted vendor and in view-only mode
- **Why it matters.** Screen-only rules (the API does not enforce them — API-XDNEG-030); the buyer must at least not be offered them.
- **Setup.** Blacklisted vendor with an active bid; separately, a round in view-only mode.
- **Steps.** Open the comparison view.
- **Expected.** Button disabled for the blacklisted vendor; no header actions at all in view-only mode.
- **Oracle.** disabled = !canSendCounterOffer || isBidLoading || isVendorBlackListed; getHeaderAction returns nothing when view-only.
- **Trace.** P2 · manual · `src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:1120-1121`, `src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:1198-1201`

#### UI-XDNEG-006 — A fast bid can be countered only in evaluation time
- **Why it matters.** Fast bids are meant to be negotiated after submission closes.
- **Setup.** Round with a fast bid.
- **Steps.** Open the comparison view during submission time and during evaluation time.
- **Expected.** No Counter Offer during submission time; available in evaluation time.
- **Oracle.** canSendCounterOnFastBid.
- **Trace.** P2 · manual · `src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:704-706`

#### UI-XDNEG-007 — Send Counter Offer is disabled until a row is ticked
- **Why it matters.** Prevents empty submissions; also disabled while Smart Suggest is loading.
- **Setup.** Counter Offer drawer open for a vendor.
- **Steps.** Untick every row; then tick one.
- **Expected.** Primary button "Send Counter Offer" disabled with no rows ticked, enabled with one.
- **Oracle.** isButtonDisabled.
- **Trace.** P1 · automate · `src/views/orderDetails/counterOfferDrawer.jsx:692-693`, `src/views/orderDetails/counterOfferDrawer.jsx:770-775`

#### UI-XDNEG-008 — The drawer refuses a counter offer with no change or a zero total
- **Why it matters.** The screen's own guard for API-XDNEG-026; the backend answers success for an unchanged counter.
- **Setup.** Drawer open; rows ticked.
- **Steps.** 1. Click Send without changing a value. 2. Untick all rows after editing one. 3. Set every price to 0 and send.
- **Expected.** 1. "You must change atleast one column to send counter offer". 2. "Please select atleast one product to send
  counter offer". 3. "Gross total can't be 0, please check your entries." No request is sent in any case.
- **Oracle.** No call to raise_additional_request in the network log.
- **Trace.** P1 · automate · `src/views/orderDetails/counterOfferDrawer.jsx:376-440`, `src/translations/en.json:217-221`

#### UI-XDNEG-009 — The drawer validates edited rows before sending, but bulk skips validation
- **Why it matters.** Required columns and value rules are checked only on rows that were edited and ticked; in bulk mode nothing is
  checked on the screen, so the backend's rules are the only ones.
- **Setup.** Template with a required inline column; drawer open (single), then Bulk Counter Offer.
- **Steps.** Clear the required column on an edited row and send; repeat in bulk.
- **Expected.** Single: inline error listing the column ("… required field") and no request. Bulk: request sent.
- **Oracle.** errors.keyError rendered under the sheet.
- **Trace.** P2 · manual · `src/views/orderDetails/counterOfferDrawer.jsx:359-374`, `src/views/orderDetails/counterOfferDrawer.jsx:889-908`

#### UI-XDNEG-010 — The bulk counter-offer note is silently dropped
- **Why it matters.** The drawer shows "Counter Offer Remarks" in bulk mode too, but the bulk path never passes the remark to the
  request, so vendors receive the bulk counter offer without the buyer's note. The KB says the note is optional, not ignored.
- **Setup.** Round with two active bids.
- **Steps.** Settings → Bulk Counter Offer; change a price; type a note; send. Open a vendor's counter-offer details.
- **Expected.** The note is sent and shown to every vendor. Today: the request body has no remarks; creator_counter_offer_remarks is empty.
- **Oracle.** Network body of raise_bulk_counter_offer lacks `remarks`.
- **Trace.** P1 · automate · `src/views/orderDetails/orderDetails.jsx:819-825`, `src/redux/pendingTasks/actions.js:212-245`, `src/views/orderDetails/counterOfferDrawer.jsx:961-973`

#### UI-XDNEG-011 — Bulk Counter Offer is offered only in live or evaluation time with at least two bids
- **Why it matters.** The menu is the bulk path's only gate (the API has none — API-XDNEG-034/040).
- **Setup.** Rounds: one with a single bid, one with two bids, one closed, one with a project on hold.
- **Steps.** Open Settings on each.
- **Expected.** Item absent on closed rounds and RFP rounds; disabled with ≤1 bid, in view-only mode, on an old version or a held
  project; enabled otherwise. With a pending bid justification, clicking shows the justification-pending prompt instead.
- **Oracle.** Menu item state.
- **Trace.** P1 · automate · `src/views/orderDetails/eventHeader/eventHeader.jsx:795-809`, `src/views/orderDetails/eventHeader/eventHeader.jsx:272-281`

#### UI-XDNEG-012 — A sent counter offer shows the pending banner and Revoke Counter Offer
- **Why it matters.** After sending, the buyer must see that the vendor owes an answer and must be able to take it back.
- **Setup.** Live RFQ; send a counter offer to one vendor.
- **Steps.** Watch the toast; look at the vendor's header.
- **Expected.** Toast "Counter offer sent to supplier"; vendor header shows the pending state and a "Revoke Counter Offer" link (in
  place of Counter Offer); the buyer's remark is available from the remarks popover.
- **Oracle.** showRevokeButton (bid requested + pending task type counter offer + live).
- **Trace.** P0 · automate · `src/redux/pendingTasks/actions.js:160`, `src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:665-668`, `src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:1122-1134`

#### UI-XDNEG-013 — Revoke Counter Offer restores the vendor's original quote on screen
- **Why it matters.** The screen must refresh the vendor's sheet after revoke, not keep showing the counter values.
- **Setup.** Pending counter offer from UI-XDNEG-012.
- **Steps.** Click "Revoke Counter Offer".
- **Expected.** Toast "Counter offer revoked"; the vendor shows the original values and the Counter Offer button again.
- **Oracle.** Revoke request body `requests: [{uuid, status: "revoke"}]`; refreshed quote details.
- **Trace.** P1 · automate · `src/views/orderDetails/orderDetails.jsx:873-900`, `src/redux/pendingTasks/actions.js:169-187`

#### UI-XDNEG-014 — The vendor's answer is shown with the right badge
- **Why it matters.** The buyer reads the outcome from the badge: accepted (green thumbs-up), modified (orange thumbs-up),
  rejected/declined and revoked appear in the log.
- **Setup.** Three vendors: one accepted, one modified, one rejected the buyer's counter.
- **Steps.** Open the comparison view.
- **Expected.** Accepted vendor: green thumbs-up context icon; modified: orange; values show the counter outcome.
- **Oracle.** BidContextIcon colours #10b981 / #f97316.
- **Trace.** P2 · manual · `src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:136-160`

#### UI-XDNEG-015 — Counter offer logs list every resolved round with its outcome
- **Why it matters.** The log is the audit trail of the negotiation; pending offers are not in it, resolved ones are, newest first.
- **Setup.** Vendor with one rejected, one accepted and one revoked counter offer.
- **Steps.** Vendor header menu → "Counter offer logs"; page with the arrows.
- **Expected.** Modal "Counter Offer Logs for <vendor>"; entries "1st – (date) Declined/Accepted/Revoked" with colours red /
  green / grey; arrows disabled at the ends; the sheet shows previous value, counter value and value after resolution. The menu item
  is absent until a counter offer is resolved.
- **Oracle.** One counter_offer_details call per entry shown.
- **Trace.** P2 · manual · `src/views/orderDetails/counterOfferLog/counterOfferLog.jsx:24-140`, `src/views/orderDetails/counterOfferLog/constant.js:1-6`, `src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:1090-1097`

#### UI-XDNEG-016 — Smart Suggest appears only for buy events with more than one bid
- **Why it matters.** The AI suggestion needs competition to reason about and is not offered in bulk mode.
- **Setup.** Workspace with the Smart Suggest AI feature; buy RFQ with one bid, then with three; a sell event.
- **Steps.** Open the counter-offer drawer in each.
- **Expected.** Smart Suggest only on the buy RFQ with three bids, not in bulk. After a suggestion, "Revert To Previous Price"
  restores the typed prices.
- **Oracle.** showSmartSuggest = bidCount > 1 && buy && feature && !bulk.
- **Trace.** P2 · manual · `src/views/orderDetails/counterOfferDrawer.jsx:210-214`, `src/views/orderDetails/counterOfferDrawer.jsx:63-110`, `src/views/orderDetails/counterOfferDrawer.jsx:442-455`

#### UI-XDNEG-017 — The drawer marks lines already countered with another vendor and hides TNA rows when configured
- **Why it matters.** A buyer countering vendor B needs to know line 3 is already under negotiation with vendor A; and rows the
  vendor was found technically not acceptable for must not be countered when the round filters them.
- **Setup.** Line 3 has a pending counter with vendor A; round with TNA filtering in auction enabled and one TNA row for vendor B.
- **Steps.** Open the drawer for vendor B.
- **Expected.** Legend "C — Counter offer already present on other vendor" and the C tag on line 3; the TNA row is not listed.
- **Oracle.** Rows rendered.
- **Trace.** P2 · manual · `src/views/orderDetails/counterOfferDrawer.jsx:829-853`, `src/views/orderDetails/counterOfferDrawer.jsx:640-647`

#### UI-XDNEG-018 — Cancelling the drawer discards the draft counter offer
- **Why it matters.** Reopening the drawer for another vendor must not carry over the previous vendor's edited prices or remark.
- **Setup.** Two vendors with active bids.
- **Steps.** Open Counter Offer for vendor A, change a price and type a remark, Cancel; open Counter Offer for vendor B.
- **Expected.** Vendor B's drawer shows B's quoted values and an empty remark; nothing was sent for A.
- **Oracle.** No raise call; drawer state reset.
- **Trace.** P2 · automate · `src/views/orderDetails/counterOfferDrawer.jsx:456-465`
