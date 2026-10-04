# Rejecting bids, changing a bid's status and discarding drafts

Deep cases for what happens to a vendor's quote after it is sent: the buyer rejecting a bid with a reason and choosing
whether the vendor may quote again (`PATCH /bids/:id/reject`), the older status endpoint the dashboard still calls
(`PATCH /bids/update_bid_status/:id` — rejected / active / revoke / in_active), the vendor discarding its own draft
(`PATCH /bids/delete_draft_bid/:id`), and the rejected-bids list (`GET /v1/trade/:id/rejected_bids`). Every case is
grounded in `procol-backend` at `origin/main` (paths below are relative to that repo) or in `procol-client-dashboard`
for the UI cases. Cases whose Trace names an `EVD2-RJB-NNN` id have a runnable twin in
`prototype/data/deep2-cases/rjb.json`; each twin runs on its OWN fresh event (built by the API plan runner) and a
failure is re-run on a second fresh event before it is reported. Before this file the catalog had no case for the
reject action, the status endpoint or the draft-discard call (only API-BID-028/029 named them).

**Read before running.** `reject` and `update_bid_status` are buyer-console actions and `delete_draft_bid` is a
vendor-website action (`config/app_auth_config.yml`); calling one from the other app is answered 401 and signs that
session out, so every wrong-app case below is manual. The reject action is refused while bidding is open when the
round's `disable_reject_bid_in_bidding_time` setting is on (`app/models/model_helpers/trade_request_model_helper.rb:908-910`);
twins that reject during bidding carry that setting and are reported as "couldn't tell", never as a bug, where it differs.

## 1. The buyer rejects a submitted bid

#### API-EVDRJB-001 — The buyer rejects a submitted bid while bidding is open
- **Why it matters.** Rejecting a non-compliant quote is the buyer's main lever before the close; if it fails the buyer has to cancel the whole event.
- **Setup.** A fresh live RFQ where QA vendor 1 has submitted a bid; `disable_reject_bid_in_bidding_time` is off on the round.
- **Steps.** 1. As the buyer, reject QA vendor 1's bid with a reason, allowing re-bidding: `PATCH /bids/{{bidUuid}}/reject` with `{"rejection_remarks": "QA_Platform_reject_{{stamp}}", "allow_rebidding": true}`.
- **Expected.** The bid is rejected and the reason is stored for the vendor. HTTP 200.
- **Oracle.** HTTP 200; the bid no longer counts as active (see API-EVDRJB-008: a second rejection is refused).
- **Trace.** P0 · automate · `EVD2-RJB-001` · `app/controllers/api/bids_controller.rb:272-300`

#### API-EVDRJB-002 — Rejecting without allowing re-bidding puts the vendor on the round's block list
- **Why it matters.** The block list is the only thing that stops a rejected vendor from quoting again, and the dashboard greys the vendor out from it; if it is not written, the block silently does nothing.
- **Setup.** A fresh live RFQ where QA vendor 1 has submitted a bid; rejecting during bidding allowed.
- **Steps.** 1. As the buyer, reject the bid with `"allow_rebidding": false`. 2. Read the round back as the buyer (`GET /trade/{{tradeId}}?response_type=template`).
- **Expected.** The round's settings now list QA vendor 1 as not allowed to re-bid. HTTP 200 on both calls.
- **Oracle.** `misc.not_allow_rebidding_to_sellers` in the round reply contains QA vendor 1's company id (the serializer encodes it for the buyer).
- **Trace.** P0 · automate · `EVD2-RJB-002` · `app/controllers/api/bids_controller.rb:291-294` · `app/serializers/trade_template_serializer.rb:417-423` · `procol-client-dashboard src/redux/orders/selectors.js:1169-1172`

#### API-EVDRJB-003 — A vendor blocked from re-bidding cannot place a new bid
- **Why it matters.** If the block does not hold, a rejected vendor simply re-quotes and the buyer's decision is undone.
- **Setup.** A fresh live RFQ where QA vendor 1 has submitted a bid; rejecting during bidding allowed.
- **Steps.** 1. As the buyer, reject the bid with `"allow_rebidding": false`. 2. As QA vendor 1, try to place a new bid (open, price, submit).
- **Expected.** Step 2 is refused at the first call. HTTP 422, code 101 'You are not allowed to perform this action'.
- **Oracle.** Step 2 answers code 101; no new bid exists.
- **Trace.** P0 · automate · `EVD2-RJB-003` · `app/helpers/api/v1/bids_controller_helper.rb:8` · `app/models/model_helpers/trade_request_model_helper.rb:962-965`

#### API-EVDRJB-004 — A vendor allowed to re-bid can quote again after the rejection
- **Why it matters.** 'Allow re-bidding' is the dialog's default; a vendor wrongly blocked loses the event without being told why.
- **Setup.** A fresh live RFQ where QA vendor 1 has submitted a bid; rejecting during bidding allowed.
- **Steps.** 1. As the buyer, reject the bid with `"allow_rebidding": true`. 2. As QA vendor 1, place a new bid.
- **Expected.** Step 2 is accepted — the rejected bid does not count as an existing quote. HTTP 200.
- **Oracle.** The new bid's submit answers 200.
- **Trace.** P0 · automate · `EVD2-RJB-004` · `app/controllers/api/bids_controller.rb:291-294` · `app/helpers/api/v1/bids_controller_helper.rb:51`

#### API-EVDRJB-005 — Sending 'allow re-bidding' as the text "false" does not block the vendor
- **Why it matters.** The code compares the flag with the boolean false only, so any caller sending text booleans (forms, integrations) silently loses the block.
- **Setup.** A fresh live RFQ where QA vendor 1 has submitted a bid; rejecting during bidding allowed.
- **Steps.** 1. As the buyer, reject with `"allow_rebidding": "false"` (text). 2. As QA vendor 1, place a new bid.
- **Expected (today).** Step 2 is accepted — the vendor was not blocked. Should be treated like false (suspected looseness); today HTTP 200.
- **Oracle.** Step 2 answers 200; `misc.not_allow_rebidding_to_sellers` is empty.
- **Trace.** P1 · automate · `EVD2-RJB-005` · `app/controllers/api/bids_controller.rb:293`

#### API-EVDRJB-006 — Leaving out the re-bidding choice allows re-bidding
- **Why it matters.** Documents the default an API caller gets when it says nothing.
- **Setup.** A fresh live RFQ where QA vendor 1 has submitted a bid; rejecting during bidding allowed.
- **Steps.** 1. As the buyer, reject the bid without the `allow_rebidding` field. 2. As QA vendor 1, place a new bid.
- **Expected.** Step 2 is accepted. HTTP 200.
- **Oracle.** Step 2 answers 200.
- **Trace.** P2 · automate · `EVD2-RJB-006` · `app/controllers/api/bids_controller.rb:293`

#### API-EVDRJB-007 — A rejection with no reason is accepted by the API
- **Why it matters.** The dashboard refuses to send a rejection without a reason, but the API stores one with an empty remark — the vendor is told nothing about why.
- **Setup.** A fresh live RFQ where QA vendor 1 has submitted a bid; rejecting during bidding allowed.
- **Steps.** 1. As the buyer, reject the bid with only `{"allow_rebidding": true}` (no `rejection_remarks`).
- **Expected (today).** Today the rejection is stored with an empty reason (HTTP 200). Should be refused like the dialog does (suspected gap: the Remark model has no presence rule).
- **Oracle.** HTTP 200; the rejected-bids list shows the bid with no remark.
- **Trace.** P1 · automate · `EVD2-RJB-007` · `app/controllers/api/bids_controller.rb:274,289` · `app/controllers/concerns/trade_controller_helper.rb:3890-3893` · `app/models/remark.rb:27-40` · `procol-client-dashboard src/views/orderDetails/rejectBidModal.jsx:48-66`

#### API-EVDRJB-008 — Rejecting the same bid twice is refused
- **Why it matters.** A double click or a retried request must not record two rejections or re-run the side effects (remarks, block list, re-activating an older revision).
- **Setup.** A fresh live RFQ where QA vendor 1 has submitted a bid; rejecting during bidding allowed.
- **Steps.** 1. As the buyer, reject the bid. 2. Reject the same bid again.
- **Expected.** Step 2 is refused because the bid is no longer active. HTTP 422, code 101 'You are not allowed to perform this action'.
- **Oracle.** Step 2 answers code 101.
- **Trace.** P1 · automate · `EVD2-RJB-008` · `app/controllers/api/bids_controller.rb:277`

#### API-EVDRJB-009 — Rejecting a bid that does not exist
- **Why it matters.** An unknown id must be a clean refusal, not a crash.
- **Setup.** A signed-in buyer.
- **Steps.** 1. `PATCH /bids/Z2dnWmdaUWtnZw==/reject` with a reason.
- **Expected.** Refused. HTTP 422, code 250 'No such bid exists'.
- **Oracle.** Code 250.
- **Trace.** P2 · automate · `EVD2-RJB-009` · `app/controllers/api/bids_controller.rb:275-276`

#### API-EVDRJB-010 — Rejecting with an id that cannot be decoded
- **Why it matters.** The id decodes to nothing; `Bid.find_by_id(nil)` must still be a clean refusal.
- **Setup.** A signed-in buyer.
- **Steps.** 1. `PATCH /bids/WrongUuid1=/reject` with a reason.
- **Expected.** Refused. HTTP 422, code 250 'No such bid exists'.
- **Oracle.** Code 250, never 500.
- **Trace.** P2 · automate · `EVD2-RJB-010` · `app/controllers/api/bids_controller.rb:275-276` · `app/controllers/concerns/params_auth.rb:57-66`

#### API-EVDRJB-011 — A draft bid the vendor has not sent cannot be rejected
- **Why it matters.** The buyer must not act on a quote the vendor has not submitted.
- **Setup.** A fresh live RFQ; QA vendor 1 opens a bid and leaves it as a draft.
- **Steps.** 1. As QA vendor 1, open a bid (`POST /v1/bids`). 2. As the buyer, reject that draft.
- **Expected.** Step 2 is refused. HTTP 422, code 101 'You are not allowed to perform this action'.
- **Oracle.** Code 101.
- **Trace.** P1 · automate · `EVD2-RJB-011` · `app/controllers/api/bids_controller.rb:277`

#### API-EVDRJB-012 — A bid can be rejected after bidding has closed
- **Why it matters.** Buyers reject non-compliant quotes during evaluation; the reject action has no time rule, and the 'disable while bidding' setting applies only while the round runs.
- **Setup.** A fresh RFQ where QA vendor 1 bid and the bidding window plus extra closing time are over.
- **Steps.** 1. As the buyer, reject the bid.
- **Expected.** Accepted. HTTP 200.
- **Oracle.** HTTP 200.
- **Trace.** P1 · automate · `EVD2-RJB-012` · `app/controllers/api/bids_controller.rb:272-300` · `app/models/model_helpers/trade_request_model_helper.rb:908-910`

#### API-EVDRJB-013 — A bid on a withdrawn event cannot be rejected
- **Why it matters.** Withdrawing marks every live round in_active; nothing may change on a withdrawn event afterwards.
- **Setup.** A fresh live RFQ where QA vendor 1 bid.
- **Steps.** 1. As the buyer, withdraw the event with a remark. 2. Reject the vendor's bid.
- **Expected.** Step 2 is refused. HTTP 422, code 101 'You are not allowed to perform this action'.
- **Oracle.** Code 101; the event stays withdrawn.
- **Trace.** P1 · automate · `EVD2-RJB-013` · `app/controllers/api/bids_controller.rb:277,412` · `app/services/event_groups/update_service.rb:324-330` · `app/models/trade_request.rb:318`

#### API-EVDRJB-014 — A bid on a submitted award cannot be rejected
- **Why it matters.** Rejecting a bid that is already on an award proposal would leave the award pointing at a rejected quote.
- **Setup.** A fresh RFQ the QA vendor bid on, closed, and awarded to that vendor (award submitted).
- **Steps.** 1. As the buyer, reject the awarded vendor's bid.
- **Expected.** Refused. HTTP 422, code 785 'Can not reject a bid which is selected for proposal' (or code 101 if submitting the proposal already moved the bid out of the active state).
- **Oracle.** A refusal (422), never 200; the proposal is unchanged.
- **Trace.** P1 · automate · `EVD2-RJB-014` · `app/controllers/api/bids_controller.rb:277,415`

#### API-EVDRJB-015 — Script, SQL-like text and emoji in the reason are stored safely
- **Why it matters.** The reason is shown to the vendor and printed in reports.
- **Setup.** A fresh live RFQ where QA vendor 1 bid; rejecting during bidding allowed.
- **Steps.** 1. Reject with a reason containing `<script>`, `' OR 1=1 --`, Chinese text and an emoji.
- **Expected.** No server error; tags are stripped on the way in.
- **Oracle.** Any 2xx/4xx, never 5xx.
- **Trace.** P2 · automate · `EVD2-RJB-015` · `app/controllers/api/bids_controller.rb:281,289` · `app/controllers/concerns/params_auth.rb:18-43`

#### API-EVDRJB-016 — A very long reason does not crash the rejection
- **Why it matters.** The reason goes to a JSON field on the bid and to a remark row.
- **Setup.** A fresh live RFQ where QA vendor 1 bid; rejecting during bidding allowed.
- **Steps.** 1. Reject with a 6,000-character reason.
- **Expected.** No server error (stored, or refused cleanly).
- **Oracle.** Never 5xx.
- **Trace.** P2 · automate · `EVD2-RJB-016` · `app/controllers/api/bids_controller.rb:281,289`

#### API-EVDRJB-017 — Rejecting one vendor's bid leaves the other vendor's bid active
- **Why it matters.** A rejection must touch one company only; a wrong scope would wipe every quote on the round.
- **Setup.** A fresh live RFQ with QA vendors 1 and 2, each with a submitted bid; rejecting during bidding allowed.
- **Steps.** 1. As the buyer, reject QA vendor 1's bid. 2. Reject QA vendor 2's bid.
- **Expected.** Step 2 is accepted — vendor 2's bid was still active after step 1. HTTP 200.
- **Oracle.** Step 2 answers 200 (the action only accepts an active bid).
- **Trace.** P0 · automate · `EVD2-RJB-017` · `app/controllers/api/bids_controller.rb:277-298`

#### API-EVDRJB-018 — Blocking one vendor does not block another
- **Why it matters.** The block list is per company; a wrong id in it would lock out the wrong vendor.
- **Setup.** A fresh live RFQ with QA vendors 1 and 2, each with a submitted bid; rejecting during bidding allowed.
- **Steps.** 1. As the buyer, reject QA vendor 2's bid without re-bidding. 2. As QA vendor 1, revise its bid.
- **Expected.** Step 2 is accepted. HTTP 200.
- **Oracle.** QA vendor 1's revision is submitted.
- **Trace.** P1 · automate · `EVD2-RJB-018` · `app/controllers/api/bids_controller.rb:293` · `app/helpers/api/v1/bids_controller_helper.rb:8`

#### API-EVDRJB-019 — The second vendor is blocked as well when it is the one rejected
- **Why it matters.** Guards against a block list that only ever holds the first company.
- **Setup.** A fresh live RFQ with QA vendors 1 and 2, each with a submitted bid; rejecting during bidding allowed.
- **Steps.** 1. As the buyer, reject QA vendor 2's bid without re-bidding. 2. As QA vendor 2, try to bid again.
- **Expected.** Step 2 is refused. HTTP 422, code 101 'You are not allowed to perform this action'.
- **Oracle.** Code 101.
- **Trace.** P1 · automate · `EVD2-RJB-019` · `app/helpers/api/v1/bids_controller_helper.rb:8`

#### API-EVDRJB-020 — Rejecting during bidding is refused where the round disables it
- **Why it matters.** The setting exists so buyers cannot knock vendors out mid-round.
- **Setup.** A fresh live RFQ where QA vendor 1 bid; `disable_reject_bid_in_bidding_time` is ON on the round (a client setting — the twin is reported as couldn't tell where it is off).
- **Steps.** 1. As the buyer, reject the bid while bidding is open.
- **Expected.** Refused. HTTP 422, code 686 'Bid rejection is disabled while bidding is in progress'.
- **Oracle.** Code 686; the bid stays active.
- **Trace.** P1 · automate · `EVD2-RJB-020` · `app/controllers/api/bids_controller.rb:413` · `app/models/model_helpers/trade_request_model_helper.rb:908-910`

#### API-EVDRJB-060 — Rejecting the latest revision brings the vendor's previous quote back
- **Why it matters.** The code re-activates the vendor's most recent revised bid when its active bid is rejected, so the buyer may 'reject' a price and find the older one live again.
- **Setup.** A fresh live RFQ where QA vendor 1 bid at 100 and then revised to 90; rejecting during bidding allowed. Manual: no plan can name the first bid once the revision replaced it.
- **Steps.** 1. As the buyer, reject the 90 bid. 2. Open the comparison / the vendor's quote.
- **Expected (today).** Today the 100 bid becomes the vendor's active quote again (by design per the code comment). Confirm with product that the buyer is told.
- **Oracle.** The vendor's active bid after step 1 is the earlier revision (status active, price 100).
- **Trace.** P1 · manual · `app/controllers/api/bids_controller.rb:295-305`

#### API-EVDRJB-061 — Rejecting is refused once the RFQ has been turned into an auction
- **Why it matters.** After conversion the RFQ is frozen; a rejection would change the auction's starting field.
- **Setup.** An RFQ on a project-enabled company converted to an auction. Manual: needs rfx_project_enabled and a conversion.
- **Steps.** 1. As the buyer, reject a bid on the original RFQ.
- **Expected.** Refused. HTTP 422, code 769 'You cannot edit rfq once the auction is created.'
- **Oracle.** Code 769.
- **Trace.** P2 · manual · `app/controllers/api/bids_controller.rb:414` · `app/models/model_helpers/trade_request_model_helper.rb:1434-1440`

#### API-EVDRJB-062 — A buyer of another company cannot reject the bid
- **Why it matters.** The policy allows only the owner, a super admin, a CSM or the auction team of a company that can view the event.
- **Setup.** A buyer user of a different company. Manual: the run signs in one buyer only.
- **Steps.** 1. As the other company's buyer, reject the bid.
- **Expected.** Refused. HTTP 422, code 455 'You are not authorized to perform this action'.
- **Oracle.** Code 455; the bid is still active.
- **Trace.** P0 · manual · `app/policies/trade_request_policy.rb:149-152` · `app/controllers/concerns/api_auth.rb:16,105-107`

#### API-EVDRJB-063 — A vendor cannot call the reject action
- **Why it matters.** Only the buyer console may reject; the vendor website is not allowed this action, and a 401 signs the vendor out.
- **Setup.** QA vendor 1 signed in. Manual: a wrong-app call ends the vendor's session.
- **Steps.** 1. As QA vendor 1, `PATCH /bids/:id/reject` on its own bid.
- **Expected.** Refused before the action runs: HTTP 401 (app not authorized).
- **Oracle.** 401; the bid is unchanged.
- **Trace.** P1 · manual · `config/app_auth_config.yml (agribid_website → bids: no reject)` · `app/controllers/concerns/api_auth.rb:79-91`

#### API-EVDRJB-064 — Two rejections sent at the same moment
- **Why it matters.** There is no lock on the reject action (unlike creating or editing bids), so two concurrent calls can both pass the 'still active' check.
- **Setup.** A fresh live RFQ where QA vendor 1 bid. Manual: needs two requests in flight together.
- **Steps.** 1. Send two reject calls for the same bid in parallel.
- **Expected.** Exactly one succeeds; the other answers code 101. Watch for two remark rows or a duplicated block-list entry.
- **Oracle.** One 200 and one 422; one 'bid_rejection' remark.
- **Trace.** P2 · manual · `app/controllers/api/bids_controller.rb:15-16,272-300`

## 2. The older bid-status endpoint

#### API-EVDRJB-021 — The status endpoint rejects a submitted bid while bidding is open
- **Why it matters.** The dashboard's services still call this endpoint; it must keep working for the owner of the event.
- **Setup.** A fresh live RFQ where QA vendor 1 submitted a bid.
- **Steps.** 1. As the buyer, `PATCH /bids/update_bid_status/{{bidUuid}}` with `{"status": "rejected", "rejection_remarks": "QA_Platform_reject_{{stamp}}"}`.
- **Expected.** Accepted; the reply is the bid with status rejected. HTTP 200.
- **Oracle.** HTTP 200.
- **Trace.** P1 · automate · `EVD2-RJB-021` · `app/controllers/api/bids_controller.rb:318-355` · `app/controllers/concerns/bids_controller_helper.rb:732-749,762-768`

#### API-EVDRJB-022 — A rejection through the status endpoint never blocks re-bidding
- **Why it matters.** Two rejection paths behave differently: this one writes no block list and no remark row, so the buyer cannot block a vendor through it.
- **Setup.** A fresh live RFQ where QA vendor 1 submitted a bid.
- **Steps.** 1. As the buyer, reject the bid through the status endpoint. 2. As QA vendor 1, place a new bid.
- **Expected.** Step 2 is accepted. HTTP 200.
- **Oracle.** The vendor's new bid is submitted.
- **Trace.** P1 · automate · `EVD2-RJB-022` · `app/controllers/api/bids_controller.rb:318-355` · `app/controllers/api/bids_controller.rb:291-294`

#### API-EVDRJB-023 — An unknown status value is refused
- **Why it matters.** Only active, rejected, revoke and in_active may be set from outside; 'selected' would be an award by the back door.
- **Setup.** A fresh live RFQ where QA vendor 1 submitted a bid.
- **Steps.** 1. Send `{"status": "selected"}`.
- **Expected.** Refused. HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** Code 2; the bid is unchanged.
- **Trace.** P1 · automate · `EVD2-RJB-023` · `app/controllers/api/bids_controller.rb:322-324`

#### API-EVDRJB-024 — A status call without a status is refused
- **Why it matters.** A call that says nothing must not be read as some default status.
- **Setup.** A fresh live RFQ where QA vendor 1 submitted a bid.
- **Steps.** 1. Send only a remark, no status.
- **Expected.** Refused. HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** Code 2.
- **Trace.** P2 · automate · `EVD2-RJB-024` · `app/controllers/api/bids_controller.rb:322-324`

#### API-EVDRJB-025 — Changing the status of a bid that does not exist
- **Why it matters.** An unknown id must be a clean refusal, not a crash.
- **Setup.** A signed-in buyer.
- **Steps.** 1. `PATCH /bids/update_bid_status/Z2dnWmdaUWtnZw==` with status rejected.
- **Expected.** Refused. HTTP 422, code 32 'Bid not found'.
- **Oracle.** Code 32.
- **Trace.** P2 · automate · `EVD2-RJB-025` · `app/controllers/api/bids_controller.rb:325-326`

#### API-EVDRJB-026 — Changing the status with an id that cannot be decoded
- **Why it matters.** A nil id must be refused before any lookup.
- **Setup.** A signed-in buyer.
- **Steps.** 1. `PATCH /bids/update_bid_status/WrongUuid1=` with status rejected.
- **Expected.** Refused as missing parameters (the id is empty). HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** Code 2.
- **Trace.** P2 · automate · `EVD2-RJB-026` · `app/controllers/api/bids_controller.rb:322-324`

#### API-EVDRJB-027 — The status endpoint refuses changes after the close, unlike the reject action
- **Why it matters.** The two rejection paths disagree about time: reject works during evaluation (API-EVDRJB-012), the status endpoint does not.
- **Setup.** A fresh RFQ where QA vendor 1 bid and the window is over.
- **Steps.** 1. As the buyer, set the bid's status to rejected.
- **Expected.** Refused. HTTP 422, code 33 'Order not active'.
- **Oracle.** Code 33.
- **Trace.** P1 · automate · `EVD2-RJB-027` · `app/controllers/api/bids_controller.rb:329-331`

#### API-EVDRJB-028 — 'Remove bid' on a live round answers success but leaves the bid in place
- **Why it matters.** The dashboard's 'remove participant bid' sends status in_active and shows 'bid discarded'; on a live round the backend applies in_active only to draft rounds, so nothing changes.
- **Setup.** A fresh live RFQ where QA vendor 1 submitted a bid; rejecting during bidding allowed.
- **Steps.** 1. As the buyer, send `{"status": "in_active"}`. 2. Reject the same bid with the reject action (it only accepts an active bid).
- **Expected (today).** Today step 1 answers HTTP 200 and step 2 is accepted — the bid was still active. Should either remove the bid or refuse (suspected defect: success reported for a change that never happened).
- **Oracle.** Step 1 = 200 and step 2 = 200.
- **Trace.** P1 · automate · `EVD2-RJB-028` · `app/controllers/concerns/bids_controller_helper.rb:784-786` · `app/controllers/api/bids_controller.rb:332-345` · `procol-client-dashboard src/redux/bids/actions.js:10-22` · `procol-client-dashboard src/views/createOrder/audience.jsx:125-141`

#### API-EVDRJB-029 — The buyer cannot revoke a vendor's bid
- **Why it matters.** Revoking is the bid author's own action and only where the round allows it.
- **Setup.** A fresh live RFQ where QA vendor 1 submitted a bid.
- **Steps.** 1. As the buyer, send `{"status": "revoke"}` for the vendor's bid.
- **Expected.** Refused. HTTP 422, code 101 'You are not allowed to perform this action' (whether revoking is allowed on the round or not).
- **Oracle.** Code 101.
- **Trace.** P1 · automate · `EVD2-RJB-029` · `app/controllers/concerns/bids_controller_helper.rb:741-745`

#### API-EVDRJB-030 — A rejected bid can be put back to active while bidding is open
- **Why it matters.** Undoing a mistaken rejection without asking the vendor to quote again.
- **Setup.** A fresh live RFQ where QA vendor 1 submitted a bid; rejecting during bidding allowed.
- **Steps.** 1. Reject the bid through the status endpoint. 2. Send `{"status": "active"}`. 3. Reject it with the reject action (only possible when active).
- **Expected.** Steps 2 and 3 are accepted. HTTP 200.
- **Oracle.** Step 3 answers 200.
- **Trace.** P1 · automate · `EVD2-RJB-030` · `app/controllers/concerns/bids_controller_helper.rb:770-782` · `app/controllers/api/bids_controller.rb:277`

#### API-EVDRJB-031 — A bid cannot be re-activated for a vendor removed from the round
- **Why it matters.** A removed vendor's quote must not come back into the comparison.
- **Setup.** A fresh live RFQ where QA vendor 1 submitted a bid.
- **Steps.** 1. Reject the bid through the status endpoint. 2. Remove QA vendor 1 from the round. 3. Send `{"status": "active"}`.
- **Expected.** Step 3 is refused. HTTP 422, code 392 'Please add this vendor to audience to re-open bid'.
- **Oracle.** Code 392.
- **Trace.** P1 · automate · `EVD2-RJB-031` · `app/controllers/concerns/bids_controller_helper.rb:772-773`

#### API-EVDRJB-032 — Setting an active bid to active again is harmless
- **Why it matters.** A repeated 're-open' click must not raise an approval or change the quote.
- **Setup.** A fresh live RFQ where QA vendor 1 submitted a bid.
- **Steps.** 1. Send `{"status": "active"}` for the active bid.
- **Expected.** Accepted; nothing changes. HTTP 200.
- **Oracle.** HTTP 200.
- **Trace.** P2 · automate · `EVD2-RJB-032` · `app/controllers/concerns/bids_controller_helper.rb:770-782`

#### API-EVDRJB-033 — Hostile text in the status endpoint's reason is handled safely
- **Why it matters.** The reason is stored on the bid and shown to the vendor.
- **Setup.** A fresh live RFQ where QA vendor 1 submitted a bid.
- **Steps.** 1. Reject through the status endpoint with an `<img onerror>` / SQL-like reason.
- **Expected.** No server error.
- **Oracle.** Never 5xx.
- **Trace.** P2 · automate · `EVD2-RJB-033` · `app/controllers/api/bids_controller.rb:337`

#### API-EVDRJB-034 — A status sent as a list is refused
- **Why it matters.** Wrong types must be refused before any lookup, not crash the comparison.
- **Setup.** A fresh live RFQ where QA vendor 1 submitted a bid.
- **Steps.** 1. Send `{"status": ["rejected"]}`.
- **Expected.** Refused. HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** Code 2.
- **Trace.** P2 · automate · `EVD2-RJB-034` · `app/controllers/api/bids_controller.rb:322-324`

#### API-EVDRJB-065 — A bid already revoked cannot be changed
- **Why it matters.** A revoked bid is final for the vendor.
- **Setup.** A round where revoking is allowed and a surrogate bid the buyer revoked. Manual: needs is_revoke_bid_allowed on the round.
- **Steps.** 1. Send any status for the revoked bid.
- **Expected.** Refused. HTTP 403, code 151 'Sorry, You cannot perform this action at this time'.
- **Oracle.** Code 151.
- **Trace.** P2 · manual · `app/controllers/api/bids_controller.rb:334`

#### API-EVDRJB-066 — Re-activating a bid the buyer entered for a vendor goes for approval
- **Why it matters.** Where surrogate bidding needs approval, putting a buyer-entered bid back to active must raise that approval instead of going live.
- **Setup.** A company with a surrogate-bidding approval flow; a surrogate bid that was rejected. Manual: needs an approval flow.
- **Steps.** 1. Send `{"status": "active"}` for the surrogate bid.
- **Expected.** The bid becomes 'requested' and an approval request is raised. HTTP 200.
- **Oracle.** Bid status requested; an approval exists.
- **Trace.** P2 · manual · `app/controllers/concerns/bids_controller_helper.rb:771-779`

#### API-EVDRJB-067 — The vendor website cannot use the status endpoint
- **Why it matters.** The vendor app is not allowed this action; a 401 signs the vendor out.
- **Setup.** QA vendor 1 signed in. Manual (wrong app).
- **Steps.** 1. As QA vendor 1, `PATCH /bids/update_bid_status/:id` with status revoke.
- **Expected.** HTTP 401 (app not authorized).
- **Oracle.** 401.
- **Trace.** P2 · manual · `config/app_auth_config.yml (agribid_website → bids: no update_bid_status)`

## 3. The vendor discards its own draft bid

#### API-EVDRJB-040 — A vendor discards its own draft bid
- **Why it matters.** Vendors abandon half-filled quotes; the draft must go away cleanly.
- **Setup.** A fresh live RFQ; QA vendor 1 opens a bid and does not submit it.
- **Steps.** 1. As QA vendor 1, open a bid. 2. `PATCH /bids/delete_draft_bid/{{bidUuid}}` as QA vendor 1.
- **Expected.** Accepted; the draft becomes inactive. HTTP 200.
- **Oracle.** HTTP 200.
- **Trace.** P1 · automate · `EVD2-RJB-040` · `app/controllers/api/bids_controller.rb:307-316`

#### API-EVDRJB-041 — After discarding a draft the vendor can quote from scratch
- **Why it matters.** A discarded draft must not count as an existing bid.
- **Setup.** A fresh live RFQ.
- **Steps.** 1. As QA vendor 1, open a bid. 2. Discard it. 3. Place a full bid (open, price, submit).
- **Expected.** Step 3 is accepted. HTTP 200.
- **Oracle.** The new bid is submitted.
- **Trace.** P1 · automate · `EVD2-RJB-041` · `app/controllers/api/bids_controller.rb:307-316` · `app/helpers/api/v1/bids_controller_helper.rb:51`

#### API-EVDRJB-042 — A submitted bid cannot be discarded as a draft
- **Why it matters.** A sent quote must not vanish without a revoke trail.
- **Setup.** A fresh live RFQ where QA vendor 1 submitted a bid.
- **Steps.** 1. As QA vendor 1, call the draft-discard on the submitted bid.
- **Expected.** Refused. HTTP 422, code 250 'No such bid exists' (only drafts are looked up).
- **Oracle.** Code 250; the bid is still active.
- **Trace.** P1 · automate · `EVD2-RJB-042` · `app/controllers/api/bids_controller.rb:309-310`

#### API-EVDRJB-043 — Discarding the same draft twice is refused
- **Why it matters.** A retried click must answer cleanly.
- **Setup.** A fresh live RFQ.
- **Steps.** 1. As QA vendor 1, open a bid. 2. Discard it. 3. Discard it again.
- **Expected.** Step 3 is refused. HTTP 422, code 250 'No such bid exists'.
- **Oracle.** Code 250.
- **Trace.** P2 · automate · `EVD2-RJB-043` · `app/controllers/api/bids_controller.rb:309-310`

#### API-EVDRJB-044 — Discarding a bid that does not exist
- **Why it matters.** An unknown id must be a clean refusal.
- **Setup.** QA vendor 1 signed in.
- **Steps.** 1. `PATCH /bids/delete_draft_bid/Z2dnWmdaUWtnZw==` as QA vendor 1.
- **Expected.** Refused. HTTP 422, code 250 'No such bid exists'.
- **Oracle.** Code 250.
- **Trace.** P2 · automate · `EVD2-RJB-044` · `app/controllers/api/bids_controller.rb:309-310`

#### API-EVDRJB-045 — Another vendor cannot discard my draft
- **Why it matters.** One vendor must never be able to wipe another vendor's quote; the lookup is limited to the caller's own drafts.
- **Setup.** A fresh live RFQ; QA vendor 1 opens a bid; QA vendor 2 is a different company.
- **Steps.** 1. As QA vendor 1, open a bid. 2. As QA vendor 2, discard QA vendor 1's draft.
- **Expected.** Refused. HTTP 422, code 250 'No such bid exists'.
- **Oracle.** Code 250; vendor 1's draft is untouched.
- **Trace.** P0 · automate · `EVD2-RJB-045` · `app/controllers/api/bids_controller.rb:309`

#### API-EVDRJB-046 — A draft can still be discarded after the round closed
- **Why it matters.** Records present behaviour: discarding has no time rule (harmless — a draft is not a quote).
- **Setup.** A fresh live RFQ with a two-minute window; QA vendor 1 opens a bid; the window then closes.
- **Steps.** 1. As QA vendor 1, open a bid. 2. Wait for the close. 3. Discard the draft.
- **Expected (today).** Accepted. HTTP 200.
- **Oracle.** HTTP 200.
- **Trace.** P2 · automate · `EVD2-RJB-046` · `app/controllers/api/bids_controller.rb:307-316`

#### API-EVDRJB-068 — The buyer console cannot use the draft-discard call
- **Why it matters.** The console app is not allowed this action; a 401 signs the buyer out of the web console.
- **Setup.** Manual (wrong app).
- **Steps.** 1. As the buyer, `PATCH /bids/delete_draft_bid/:id`.
- **Expected.** HTTP 401 (app not authorized).
- **Oracle.** 401.
- **Trace.** P2 · manual · `config/app_auth_config.yml (client_admin_dashboard → bids: no delete_draft_bid)`

## 4. Reading rejections back

#### API-EVDRJB-050 — The rejected-bids list answers after a rejection
- **Why it matters.** The list is where the buyer sees who was rejected, why, and re-opens a bid.
- **Setup.** A fresh live RFQ where QA vendor 1 bid; rejecting during bidding allowed.
- **Steps.** 1. As the buyer, reject the bid. 2. `GET /v1/trade/{{tradeId}}/rejected_bids`.
- **Expected.** Step 2 answers HTTP 200 with the rejected bid under QA vendor 1 and its reason.
- **Oracle.** HTTP 200 (the twin checks the answer; the content is checked by eye or in API-EVDRJB-069).
- **Trace.** P1 · automate · `EVD2-RJB-050` · `app/controllers/api/v1/trade_controller.rb:597-620`

#### API-EVDRJB-069 — The rejected-bids list shows the reason the buyer typed
- **Why it matters.** The reason is the vendor's only explanation.
- **Setup.** As API-EVDRJB-050. Manual oracle: the plan language cannot assert inside this reply yet.
- **Steps.** 1. Reject with reason R. 2. Open the rejected-bids list.
- **Expected.** The entry for QA vendor 1 carries reason R.
- **Oracle.** The reply's entry for QA vendor 1 has the remark R.
- **Trace.** P2 · manual · `app/controllers/api/v1/trade_controller.rb:597-620` · `app/serializers/rejected_bids_serializer.rb`

## 5. On the screen

#### UI-EVDRJB-001 — The reject dialog will not send without a reason
- **Why it matters.** The reason is mandatory only in the browser (the API accepts none, API-EVDRJB-007).
- **Setup.** A live event with a submitted bid, opened as the buyer.
- **Steps.** 1. Open the bid's Reject dialog. 2. Leave the reason empty. 3. Press Reject.
- **Expected.** The dialog shows the reason error and sends nothing.
- **Oracle.** No PATCH /bids/:id/reject is sent; the field shows its error.
- **Trace.** P2 · manual · `procol-client-dashboard src/views/orderDetails/rejectBidModal.jsx:48-66`

#### UI-EVDRJB-002 — 'Allow re-bidding' is ticked by default
- **Why it matters.** Blocking a vendor is the exception and must be a deliberate choice.
- **Setup.** As UI-EVDRJB-001.
- **Steps.** 1. Open the Reject dialog.
- **Expected.** The re-bidding box is ticked; unticking shows the 'block supplier' warning.
- **Oracle.** Checkbox checked on open.
- **Trace.** P2 · manual · `procol-client-dashboard src/views/orderDetails/rejectBidModal.jsx:22,37-45,106-118`

#### UI-EVDRJB-003 — A vendor already blocked cannot be unblocked from the dialog
- **Why it matters.** Once blocked, the checkbox is disabled and shows 'supplier blocked'.
- **Setup.** A vendor rejected earlier without re-bidding.
- **Steps.** 1. Open the Reject dialog for that vendor's next bid.
- **Expected.** The checkbox is unticked and disabled, with the blocked message.
- **Oracle.** Disabled checkbox.
- **Trace.** P2 · manual · `procol-client-dashboard src/views/orderDetails/rejectBidModal.jsx:35-45,112-116`

#### UI-EVDRJB-004 — 'Remove bid' on a live event shows 'bid discarded' although the bid stays
- **Why it matters.** Mirrors API-EVDRJB-028 on the screen the buyer uses.
- **Setup.** A live event with QA vendor 1's submitted bid, opened in the edit/audience view.
- **Steps.** 1. Remove the vendor's bid from the audience view. 2. Refresh the event.
- **Expected.** Today: the success toast appears and the bid is still there after refresh.
- **Oracle.** Bid visible after refresh.
- **Trace.** P1 · manual · `procol-client-dashboard src/views/createOrder/audience.jsx:125-141`
