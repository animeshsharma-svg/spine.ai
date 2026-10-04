# Building, copying and changing events (lifecycle services) — rule cases

Cases for the rules of the services that build draft events from PR items, add rounds in the quick (Clara/PR) flow, clone
and amend rounds, move an RFQ to auction or lots, accept unregistered vendors' bids, and save technical answers, extracted
from `prototype/knowledge/events/backend-digest/services-lifecycle.md`. Each case names its rule (`R-LIF-…`,
`prototype/data/rules/events-rules.json`) and the line of `procol-backend` (origin/main ae36e86894) that makes it true; the
cited lines of every P0/P1 gap were opened before writing. No runnable twins: each case needs PR items, a closed RFQ with
bids, an unregistered vendor's bid or a technical-answer route the case runner's allow-list does not open (see report).

## 1. Draft events built from PR items

#### API-EVRLIF-001 — A line's quantity keeps its unit whether the PR sends a number or a quantity object
- **Why it matters.** The quantity and its unit are what vendors quote against; a lost unit turns "100 KG" into "100".
- **Setup.** Two PR items pulled into a draft event: one whose quantity arrives as {value 100, unit KG}, one as the plain number 50 with display unit "NOS".
- **Steps.** Read both lines of the draft.
- **Expected.** Line 1: 100 KG. Line 2: 50 NOS (the display unit).
- **Oracle.** Line `precomputed_data.creator_fields.creator_quantity` = {value, unitSymbol} (per `R-LIF-001-4`, `event_groups/create_service.rb`).
- **Trace.** P2 · automate-later · `R-LIF-001-4` · `app/services/event_groups/create_service.rb`

#### API-EVRLIF-002 — PR items show the right open and in-progress quantity while the event is draft, live or withdrawn
- **Why it matters.** Procurement uses the open quantity to decide what still needs sourcing; a withdrawn event must give its quantity back.
- **Setup.** PR item P (quantity 100) linked to a draft event's line (quantity 100).
- **Steps.** 1. Read P. 2. Publish the event and read P. 3. Withdraw the event and read P and its history.
- **Expected.** Draft: 100 in the draft. Published: 0 counted from the draft (the line is no longer draft). Withdrawn: quantity back to open, history entry "event withdrawn – reopened" with the open quantity (respecting `gate: open_pr_quantity_on_partial_order`). Links are found whatever their status.
- **Oracle.** `event_groups/update_service.rb:411-430, 450-472`.
- **Trace.** P1 · automate-later · `R-LIF-006-1` `R-LIF-006-3` `R-LIF-006-4` · `app/services/event_groups/update_service.rb:411-472`

#### API-EVRLIF-003 — Deactivating one PR item should not throw away the whole draft event
- **Why it matters.** A draft built from ten PR items is discarded when one of them is deactivated; the other nine lose their draft quantity and the buyer's work.
- **Setup.** Draft event with lines from PR items P1, P2, P3.
- **Steps.** Deactivate P2; read the draft and P1/P3.
- **Expected.** Only P2's line leaves the draft; P1 and P3 stay in it with their quantities.
- **Expected (today).** The whole draft is discarded and P1/P3 lose their draft quantity.
- **Oracle.** `purchase_request_item.rb:537-541` → `discard_draft_project`.
- **Trace.** P1 · automate-later · `R-LIF-007-5` · `app/models/purchase_request_item.rb:537-541`

#### API-EVRLIF-004 — PR items added to an empty draft are checked like any other batch
- **Why it matters.** The checks for quantity, duplicates and inactive PR items are skipped for the first batch into an empty draft — which is exactly how Clara builds events.
- **Setup.** Empty draft event (as Clara creates it); PR items: one with quantity 0, one inactive, the same item twice.
- **Steps.** Pull the items into the draft (Clara flow, then the normal "add PR items" action).
- **Expected.** Each faulty item refused with its reason (the same as when the draft already has lines).
- **Expected (today).** All three accepted into the empty draft (unverified live).
- **Oracle.** Per `R-LIF-019-6`: `event_groups/pr_to_erfx_service.rb` rule 1; Clara creates the event with no lines (`mcp/purchase_request_tools/handler.rb:316-333`). Refusal code 557 per digest.
- **Trace.** P1 · manual · `R-LIF-019-6` · `app/services/mcp/purchase_request_tools/handler.rb:316-333`

## 2. Rounds built in the quick (Clara / PR) flow

#### API-EVRLIF-005 — A quick-flow round starts at the scheduled publish time and its evaluation ends after bidding
- **Why it matters.** The evaluation end is counted from the start, not from the bid end; a company whose bidding lasts longer than its evaluation days gets an evaluation window that ends before bidding.
- **Setup.** Company policies: bid duration 5 days, evaluation 4 days. Event scheduled to publish tomorrow 10:00; second event with a past schedule; a round added from an existing RFQ.
- **Steps.** Build a round in each; read its times.
- **Expected.** Start = tomorrow 10:00 (future schedule), else now; bid end = start + 5 days; evaluation end after bid end. Defaults without policies: 2 days bidding, evaluation 4 days. A round added from an RFQ ends with that RFQ's bidding end; an existing round keeps its own times.
- **Expected (today).** Evaluation end = start + 4 days, i.e. 1 day before the bid end (unverified whether saving the schedule refuses it).
- **Oracle.** `trade_requests/base.rb:57-76, 87-105, 219-244`; `event_group.rb:279-281`.
- **Trace.** P1 · automate-later · `R-LIF-021-1` `R-LIF-021-2` `R-LIF-021-3` `R-LIF-021-4` `R-LIF-021-5` `R-LIF-021-6` · `app/services/trade_requests/base.rb:57-76`

#### API-EVRLIF-006 — A quick-flow round starts as a draft with safe default settings
- **Why it matters.** The quick flow publishes with little buyer review, so its defaults decide the event.
- **Setup.** Clara/PR quick flow; company with `gate: show_variant_widget` on and off.
- **Steps.** Build a round; read its settings, columns and savings strategies.
- **Expected.** Draft status, sheet layout; terms not mandatory, English auction off, alternate bidding off, pickup off, dynamic closing price based, end price 0, auction on base price, closing mode single. Columns added when the template has none: material code, line number, PR number, product variant (editable only with the variant setting on, else hidden). Savings strategies Budget and Historical Price, per line.
- **Oracle.** `trade_requests/base.rb:16-24, 42-55, 57-117, 144-157`.
- **Trace.** P2 · automate-later · `R-LIF-022-1` `R-LIF-022-2` `R-LIF-022-3` `R-LIF-022-4` · `app/services/trade_requests/base.rb:42-157`

#### API-EVRLIF-007 — A multi-currency quick-flow round derives each currency's precision from its rate
- **Why it matters.** A currency worth 83 base units needs more decimals in base terms; too few decimals round vendors' prices.
- **Setup.** Company with multi-currency on, base INR, USD rate 83, JPY rate 0.55; a currency not in the company catalogue; a second company with no rates.
- **Steps.** Build a round; read its currency setup.
- **Expected.** INR rate 1; USD precision 2 + floor(log10 83) = 3; JPY 2 + floor(log10 0.55) = 1; the unknown currency skipped; mode "multiple currencies". No rates → no currency setup. A failure while building leaves the round without currency setup (not a failed round).
- **Oracle.** `trade_requests/base.rb:246-297`.
- **Trace.** P1 · automate-later · `R-LIF-023-1` `R-LIF-023-2` `R-LIF-023-3` `R-LIF-023-4` · `app/services/trade_requests/base.rb:246-297`

#### API-EVRLIF-008 — A price round built from PR items carries each item's location, unit, number and reference prices
- **Why it matters.** Vendors quote per delivery location and unit; the PR number and line number link the PO back to the PR.
- **Setup.** Draft event with line 1 from PR "RFQ/24/001 " item 10 (location Pune, unit KG, budget 50, historical 48, custom dropdown "Grade A"), line 2 with no PR item (unit symbol "NOS").
- **Steps.** Build the price round; read its lines.
- **Expected.** Line 1: location Pune, unit KG, item no 10, material code = product code, PR number "RFQ/24/001" (trimmed), dropdown mapped to its option id, references budget 50 and historical 48. Line 2: the company's first active location, unit matching "NOS" (empty if none). Title "RFQ", no ceiling/floor/tick. Lines in serial order. A round added from another round copies its vendors and is restricted to them.
- **Oracle.** `trade_requests/create/rfq.rb:22-137`; `base.rb:159-172`.
- **Trace.** P1 · automate-later · `R-LIF-024-1` `R-LIF-024-2` `R-LIF-024-3` `R-LIF-024-4` `R-LIF-024-5` `R-LIF-024-6` `R-LIF-024-7` · `app/services/trade_requests/create/rfq.rb:22-137`

#### API-EVRLIF-009 — A technical round built from PR items asks one question per quality parameter and names an evaluator
- **Why it matters.** The technical form must ask what the PR specifies, and someone must be responsible for scoring each line.
- **Setup.** PR item with quality parameters "Grade" and "Size" and item text; created by user U. Second PR item with no creator whose fund center has planner P. Third with neither.
- **Steps.** Build the technical round; read its forms and evaluators.
- **Expected.** One form per line: "Grade" and "Size" required multi-line answers, "Item Text" (only when the PR has it), optional "Attach additional documents if any" and "Remarks". Evaluators U, P, none. Title "Technical Stage"; template = the company's last default RFI template. A line with no PR item is refused cleanly (today it would raise on `nil.product`; PR flows always have one).
- **Oracle.** `trade_requests/create/rfp.rb:35-80`; `base.rb:190-193`.
- **Trace.** P1 · automate-later · `R-LIF-025-1` `R-LIF-025-2` `R-LIF-025-3` `R-LIF-025-5` · `app/services/trade_requests/create/rfp.rb:35-80`

#### API-EVRLIF-010 — A quick-flow auction uses fixed 2-day bidding and 4-day evaluation whatever the company policy
- **Why it matters.** A company that set 5-day bidding gets 2 days on auctions only; buyers should know or the policy should apply.
- **Setup.** Company policies: bid duration 5 days, evaluation 6 days; auction strategy policy "rank".
- **Steps.** Build an auction in the quick flow.
- **Expected (today).** Title "Auction", strategy rank, bid end = start + 2 days, evaluation end = start + 4 days (policy ignored), order type from the template. A template without an order type should be refused cleanly, not raise.
- **Oracle.** `trade_requests/create/auction.rb:23-44`.
- **Trace.** P2 · automate-later · `R-LIF-025-4` · `app/services/trade_requests/create/auction.rb:23-44`

#### API-EVRLIF-011 — Adding PR items to a draft round fills the new lines the same way as a fresh round
- **Why it matters.** Lines added later lose the PR columns and evaluators that a freshly built round would have, so the same event looks different depending on when an item was added.
- **Setup.** Draft event with a price round and a technical round built from PR items; then a new PR item (with custom columns, creator U) is added.
- **Steps.** Re-sync the rounds; read the new line and the new form.
- **Expected.** New line: PR custom columns filled, material code from the PR item as on create. New form: evaluator U. Existing lines and forms keep their values; an auction's existing price limits are kept.
- **Expected (today).** New line's custom columns empty and material code taken from the product; new form has no evaluator.
- **Oracle.** `trade_requests/update/rfq.rb:58-64` vs `create/rfq.rb:89, 97-125`; `update/rfp.rb:48-64` vs `create/rfp.rb:57-72`; `update/auction.rb:8-10`.
- **Trace.** P2 · automate-later · `R-LIF-026-2` `R-LIF-026-3` `R-LIF-026-4` `R-LIF-026-5` `R-LIF-026-6` · `app/services/trade_requests/update/rfq.rb:58-64`

#### API-EVRLIF-012 — Removing lines re-numbers the round's sections and drops empty ones
- **Why it matters.** Section tabs show ranges of lines ("1–5"); after removing lines the ranges must still match.
- **Setup.** Round with 6 lines in sections 1 (lines 1–3, child 1.1 = 2–3) and 2 (lines 4–6), one tab each.
- **Steps.** Remove lines 2 and 4–6; read the tabs.
- **Expected.** Section 1 = 1–2, child 1.1 = 2–2; section 2 and its tab dropped. Nothing removed → tabs unchanged.
- **Oracle.** `trade_requests/tab_range_resync.rb:17-90`.
- **Trace.** P2 · automate-later · `R-LIF-027-1` `R-LIF-027-2` `R-LIF-027-3` `R-LIF-027-4` · `app/services/trade_requests/tab_range_resync.rb:17-90`

## 3. Cloning and amending rounds

#### API-EVRLIF-013 — Cloning an event whose live round had a line deleted should not fail
- **Why it matters.** Deleting a line on a live event leaves its price-round line active; the clone then looks up the deleted line and crashes.
- **Setup.** Published event with 3 lines; line 2 deleted while live. Vendors invited (one hidden).
- **Steps.** Clone the event; read the clone.
- **Expected.** Clone created with lines 1 and 3; vendors copied with the same status and visibility; settings and columns copied as they are; lines whose item is missing or inactive skipped.
- **Expected (today).** The deleted line is not skipped (only missing/inactive are), `nil.id` raises → untyped HTTP 500.
- **Oracle.** `trade_product.rb:325-343` (skip only missing/in_active at `:328-329`, `.id` at `:333`); `event_groups/update_service.rb:188-192`; audience copy `trade_request_replication_base.rb:24-26`.
- **Trace.** P1 · automate-later · `R-LIF-009-4` `R-LIF-011-1` `R-LIF-012-2` `R-LIF-012-3` · `app/models/trade_product.rb:325-343`

#### API-EVRLIF-014 — An amended round's bidding window is its configured length, wherever extensions happened
- **Why it matters.** Every copied schedule (including old auto-extension rows) restarts at the same moment, so the amended round's end depends on which copied row is last rather than on the configured duration.
- **Setup.** Auction (configured 1 h) that got two 2-minute auto-extensions, followed by an evaluation window of 1 day.
- **Steps.** Amend the event; read the amended auction's windows.
- **Expected.** Bidding now → now + 1 h; evaluation after bidding.
- **Expected (today).** All rows start now; extension rows end at now + 2 min and the evaluation window now + 1 day, so the auction's end = the latest of these (now + 1 h, by the max rule) while the evaluation starts with bidding (unverified live).
- **Oracle.** `versions/trade_request.rb:111-130`; inactive rows copied too (`trade_request.rb:111`).
- **Trace.** P1 · automate-later · `R-LIF-015-3` `R-LIF-015-5` · `app/services/versions/trade_request.rb:111-130`

#### API-EVRLIF-015 — An amended technical round copies live forms and active evaluators, without stray questions
- **Why it matters.** Forms of deleted lines come along without a line and are then treated as the round's global form — vendors see a question about an item that no longer exists.
- **Setup.** Technical round with forms on lines 1–3 (line 3 deleted), evaluator E1 active and E2 removed on line 1.
- **Steps.** Amend; read the amended round's forms and evaluators; open it as the QA vendor.
- **Expected.** Forms for lines 1 and 2 only, each with E1 only; no extra global question.
- **Expected (today).** Line 3's form (status deleted) is copied without a line link and can be picked as the global form (unverified live).
- **Oracle.** `versions/trade_request.rb:70-107`; `form.rb:37`; global-form pick in `TradeRequests::Update::Rfp` (per digest).
- **Trace.** P2 · manual · `R-LIF-016-1` `R-LIF-016-2` `R-LIF-016-3` `R-LIF-016-4` · `app/services/versions/trade_request.rb:70-107`

#### API-EVRLIF-016 — A PR amendment closes the previous version immediately
- **Why it matters.** Unlike a manual amendment (closed by a background job), a PR amendment closes the old version in the same request; both must leave the old version unbiddable.
- **Setup.** Live event from a PR; change the PR so that an amendment is created and published.
- **Steps.** Immediately after the amendment, bid on the old version as the QA vendor.
- **Expected.** Refused: the old version's technical round and latest price round already ended.
- **Oracle.** `purchase_requests/amendment_service.rb:366` calls `update_previous_version_data` synchronously; compare API-EVRMEG-025.
- **Trace.** P2 · automate-later · `R-LIF-018-4` · `app/services/purchase_requests/amendment_service.rb:366`

## 4. Moving an RFQ to auction or lots

#### API-EVRLIF-017 — The auction made from an RFQ inherits its settings and renumbers lines when some were dropped
- **Why it matters.** The auction must keep the RFQ's columns, locations and terms; with service grouping, dropped lines must not leave gaps in line numbers.
- **Setup.** RFQ with custom columns, a delivery location and terms; service-grouped RFQ with lines 1–4, line 2 inactive.
- **Steps.** Move each to auction; read the auction's settings and lines.
- **Expected.** Columns, location and terms as in the RFQ unless the request overrides them. Service-grouped: lines numbered 1–3 and section ranges resynced.
- **Oracle.** `rfq_to_auction/create_service.rb:14, 32-44, 110-128`.
- **Trace.** P1 · automate-later · `R-LIF-028-1` `R-LIF-028-4` · `app/services/rfq_to_auction/create_service.rb:14-128`

#### API-EVRLIF-018 — A failed move to auction is a typed refusal, never a server error
- **Why it matters.** A half-made auction or a 500 leaves the buyer unsure whether vendors were moved.
- **Setup.** RFQ whose technical weights include a line not carried to the auction; an RFQ where a step fails with a known code.
- **Steps.** Move each to auction.
- **Expected.** Known failure → its code or message; weights for dropped lines skipped; any other failure → a typed error, nothing created.
- **Expected (today).** Unexpected errors are re-raised (untyped 500); a weight on a dropped line is inserted with an empty line reference (unverified whether the column allows it).
- **Oracle.** `rfq_to_auction/create_service.rb:60-63, 99-103, 143-164, 185, 266-277`.
- **Trace.** P1 · manual · `R-LIF-029-2` `R-LIF-029-3` `R-LIF-029-5` · `app/services/rfq_to_auction/create_service.rb:99-103, 266-277`

#### API-EVRLIF-019 — Bids carried from the RFQ into the auction keep only the auction's lines and start clean
- **Why it matters.** Vendors start the auction from their RFQ price; a carried bid with the RFQ's approval state, a TNA line or a line not in the auction distorts the opening rank.
- **Setup.** RFQ with 3 lines; vendor A bid on all 3 (line 3 scored TNA for A); vendor B bid only on line 3; A's RFQ bid was approved. Auction with fast bidding made from lines 1–3; a second auction with lines 1–2.
- **Steps.** Move to auction; read the carried bids.
- **Expected.** Auction 1: A's bid with lines 1–2 (TNA line removed), status active, no approval state, no revision history, closing time = the auction's, label "RFQ final bid", each line remembering its RFQ price. Auction 2: B has no carried bid (no line in the auction). Surrogate and counter-offer markers removed. A line that fails to save stops the copy with a message.
- **Expected (today).** Line saves are not checked (`save` without a result check), so a failed line leaves an empty id in the bid's line list (unverified).
- **Oracle.** `create_duplicate_bids` (`bids_controller_helper.rb:1745-1800`).
- **Trace.** P0 · automate-later · `R-LIF-030-1` `R-LIF-030-2` `R-LIF-030-3` `R-LIF-030-4` `R-LIF-030-5` `R-LIF-030-6` · `app/controllers/concerns/bids_controller_helper.rb:1745-1800`

#### API-EVRLIF-020 — A lot's evaluation end follows the company default, then the latest sibling lot, then the parent
- **Why it matters.** Lots split from one RFQ should evaluate on a common timetable.
- **Setup.** RFQ evaluation ends Friday; company default lot evaluation 2 days (second company with none); an earlier lot whose evaluation ends Thursday (future).
- **Steps.** Split a new lot in each company.
- **Expected.** Company with default: now + 2 days. Without: Thursday (latest sibling lot, still future); if no future sibling: Friday (parent).
- **Oracle.** `create_event_lots/create_service.rb:229-240`.
- **Trace.** P2 · automate-later · `R-LIF-031-4` · `app/services/create_event_lots/create_service.rb:229-240`

#### API-EVRLIF-021 — A lot split that failed must not be reported as done
- **Why it matters.** A save error during the split rolls everything back but answers "success", so the buyer believes lots exist and vendors are not moved.
- **Setup.** RFQ with bids; a split request that makes one lot round fail to save (e.g. a lot whose round fails validation); a vendor whose old line totals are all 0.
- **Steps.** Split into lots; read the event's lots.
- **Expected.** The split is refused with the save error message; no lot exists; the RFQ is unchanged. A vendor with all-zero totals gets 0 (not "NaN") in the moved bid.
- **Expected (today).** HTTP 200 success with no lot created (lots back to draft): the controller checks only for an error code and the service returns a message-only error.
- **Oracle.** `create_event_lots/create_service.rb:40-75` (rescue returns `{message}`), `trade_controller.rb:1831-1834` (`render_error_json` only when `error[:code]`); NaN per `R-LIF-032-4` (b).
- **Trace.** P1 · automate-later · `R-LIF-032-1` `R-LIF-032-4` · `app/controllers/api/trade_controller.rb:1831-1834`

## 5. Bids from vendors who are not registered yet

#### API-EVRLIF-022 — Accepting or rejecting an unregistered vendor's bid
- **Why it matters.** Bids that arrive by mail from unregistered vendors must be confirmed by the buyer before they count.
- **Setup.** Live event with an unregistered vendor's bid (and a technical answer) flagged "unregistered"; a normal bid; pending-unregistered count 1.
- **Steps.** 1. Send an invalid status; act on the normal bid. 2. Accept the unregistered bid; accept it again. 3. On another event, reject one.
- **Expected.** 1: "Insufficient parameters" for both; a deactivated vendor contact → "User does not exist". 2: accepted — the contact's email marked verified, all its unregistered links become normal, count 1 → 0; the second accept changes nothing and succeeds. 3: bid, its lines and trade rejected; count never below 0; the contact deactivated only if it has no other active bid or answer in the buyer's other live events. The buyer gets the "unregistered bid" notification after each action.
- **Oracle.** HTTP 422 code 2 / code 70; `poc_bid_action_service.rb:14-130`; `email_bid_unregistered_helper.rb:99-115`; controller `template_responses_controller.rb:220`.
- **Trace.** P1 · automate-later · `R-LIF-035-1` `R-LIF-035-2` `R-LIF-035-3` `R-LIF-035-4` `R-LIF-035-5` `R-LIF-035-6` · `app/services/poc_bid_action_service.rb:14-130`

#### API-EVRLIF-023 — An unregistered vendor's bid cannot be rejected after it was accepted, or twice
- **Why it matters.** Reject has no state check: rejecting an accepted bid silently removes a valid bid and deactivates the vendor contact, and each repeat lowers the pending count again.
- **Setup.** Unregistered bid B1 accepted; unregistered bid B2 already rejected; pending count 2 for other bids.
- **Steps.** Reject B1; reject B2 again; read the bids, the contact and the pending count.
- **Expected.** Both refused (already decided); count unchanged.
- **Expected (today).** B1 becomes rejected after acceptance, the contact may be deactivated, and the count drops on each call.
- **Oracle.** `poc_bid_action_service.rb:79-98` (no guard; approve has one at `:52`).
- **Trace.** P1 · automate-later · `R-LIF-035-7` · `app/services/poc_bid_action_service.rb:79-98`

#### API-EVRLIF-024 — Accepting or rejecting a contact's bid applies to its other bids in the event and restores the registered bid
- **Why it matters.** The same contact may have bid on several rounds; rejecting it must give back the vendor's last bid made by a registered user, but never leave two active bids.
- **Setup.** Vendor V: registered user's bid R (later revised), then unregistered contact's bid U on the RFQ and an answer on the RFP; a second round with another U bid.
- **Steps.** Reject U; read V's bids on each round. Repeat with accept on a copy.
- **Expected.** Accept: U's other active/revised bids and answers accepted. Reject: they become rejected, and per round V's latest revised registered bid R becomes active again with its lines — exactly one active bid per round. A self-registered contact lowers the pending count once. If the sibling update fails, the primary rejection is rolled back too.
- **Expected (today).** Siblings run outside the primary transaction (a failure leaves the primary rejected, siblings untouched) and the restore does not check for an existing active bid (two active bids possible).
- **Oracle.** `poc_bid_sibling_action_service.rb:24-205`; `poc_bid_action_service.rb:81-100`.
- **Trace.** P1 · manual · `R-LIF-036-1` `R-LIF-036-2` `R-LIF-036-3` `R-LIF-036-4` `R-LIF-036-5` · `app/services/poc_bid_sibling_action_service.rb:24-205`

## 6. Saving and checking technical answers

#### API-EVRLIF-025 — Starting a technical answer reuses the vendor's draft and carries its last submitted answers
- **Why it matters.** A vendor revising its answer should start from what it submitted; two drafts for the same vendor would split the work.
- **Setup.** QA vendor with a submitted answer on the technical round; a draft award proposal with the same numeric id as the round (rare; for part c).
- **Steps.** 1. Start a revision; read its answers. 2. Start again with different extra details. 3. Start a surrogate revision with a remark twice.
- **Expected.** 1: a draft linked to the submitted answers. 2: the same draft, only its answers replaced (other fields of the new call ignored). 3: the surrogate remark recorded once. Forms marked "auto-generate" get empty answers.
- **Expected (today).** The surrogate remark is added again on every call; the draft lookup ignores what kind of item it is for, so a draft on a round and one on a proposal with the same id are the same row (unverified live).
- **Oracle.** `template_responses/create_service.rb:52-110`.
- **Trace.** P2 · automate-later · `R-LIF-037-1` `R-LIF-037-2` `R-LIF-037-3` `R-LIF-037-4` `R-LIF-037-5` · `app/services/template_responses/create_service.rb:52-110`

#### API-EVRLIF-026 — Updating a technical answer merges data and keeps remarks unless they are changed
- **Why it matters.** Saving one section should not erase others; today a save without remarks clears the vendor's saved remarks.
- **Setup.** Draft answer with sections A and B filled and remark "see attachment"; masked round with 2 responding vendors; service-grouped RFP with 2 activities in one service.
- **Steps.** Save section A only, without remarks; submit; read as the buyer. Submit the service RFP with only one activity form answered.
- **Expected.** B unchanged; empty values dropped; remark still "see attachment". The third vendor appears as "Vendor 3" in the masked round. One answered form per service group is enough. "Edit again" returns the answer and its forms to draft.
- **Expected (today).** The remark is cleared (remarks always taken from the call).
- **Oracle.** `template_responses/update_service.rb:33-59, 86-91, 103-119`; `forms_helper.rb:290-297`.
- **Trace.** P1 · automate-later · `R-LIF-038-2` `R-LIF-038-4` `R-LIF-038-5` `R-LIF-038-6` `R-LIF-038-7` · `app/services/template_responses/update_service.rb:33-119`

#### API-EVRLIF-027 — Submitting a technical answer checks required answers, groups and conditions
- **Why it matters.** A vendor must not submit with a required question blank; a buyer condition that makes a field required must be enforced.
- **Setup.** Technical round: question group "Certificate no + expiry" (optional, two members), a condition "if ISO = yes then certificate required".
- **Steps.** Submit with no answers and no remarks; with no company; with certificate number but no expiry; with ISO = yes and no certificate.
- **Expected.** First two: "Insufficient parameters". Group partly filled → every member checked (expiry required). ISO = yes → certificate required. Multi-row groups checked per row.
- **Oracle.** HTTP 422 code 2 (and the field-level codes 572/773 per digest); `template_responses/validate_service.rb:11-14, 51-53, 80-147`.
- **Trace.** P1 · automate-later · `R-LIF-039-1` `R-LIF-039-2` `R-LIF-039-6` `R-LIF-039-7` · `app/services/template_responses/validate_service.rb:11-147`

#### API-EVRLIF-028 — The direct answer check refuses blank required fields and unknown fields cleanly
- **Why it matters.** An answer that names a field the form does not have should be refused, not crash the submission.
- **Setup.** Technical round whose form has required field "make".
- **Steps.** Submit with no data; with "make" blank; with an extra unknown field "colour".
- **Expected.** All three "Insufficient parameters" (or the unknown field ignored).
- **Expected (today).** The unknown field has no configuration and `nil["is_required"]` raises → untyped 500 (unverified live).
- **Oracle.** `template_responses/validate_service.rb:26-41`; code 2.
- **Trace.** P1 · automate-later · `R-LIF-040-1` `R-LIF-040-2` `R-LIF-040-3` · `app/services/template_responses/validate_service.rb:26-41`

## 7. Counter-offer tasks, AI audit, knockout rounds and draft awards

#### API-EVRLIF-029 — A counter offer creates one task per bid, due at the evaluation end, and the due date follows extensions
- **Why it matters.** Vendors see "respond by"; a task due at the wrong time or never closed sends false reminders.
- **Setup.** Price round with an evaluation window; QA vendor bid; a second round with a participant review window.
- **Steps.** Raise a counter offer; raise another on the same bid; extend the round; resolve; on round 2 extend and read the task.
- **Expected.** One task set per bid while one is pending; description "<event ref> / Lot n - <round ref>" linking to the round; due at the evaluation end (bid end if none); moved with the evaluation end on extension; completed when resolved, inactive when revoked. Round 2: due date also moved.
- **Expected (today).** Round 2 (with a review window): the due date is not moved; a deleted bid makes the task update raise.
- **Oracle.** `pending_tasks/additional_requests/raise_counter_offer.rb:18-83`; `push_notification.rb:3197-3212`; `additional_request.rb:577-584`; `trade_schedule.rb:195-203`.
- **Trace.** P1 · automate-later · `R-LIF-041-1` `R-LIF-041-2` `R-LIF-041-3` `R-LIF-041-4` `R-LIF-041-5` `R-LIF-041-6` · `app/services/pending_tasks/additional_requests/raise_counter_offer.rb:18-83`

#### API-EVRLIF-030 — Saving the AI counter-offer audit reports failure when nothing was saved
- **Why it matters.** The audit is the record of AI-suggested vs final prices; "saved successfully" when it was not hides gaps in the audit trail.
- **Setup.** AI counter-offer suggestion on the sandbox round; a request whose snapshot is invalid (e.g. missing vendor).
- **Steps.** Save the audit for both.
- **Expected.** Valid: saved with suggested and final values per line. Invalid: an error.
- **Expected (today).** Invalid snapshot → "Audit deltas saved successfully" (`create` without a check); other exceptions → code 15 "Error in saving audit deltas: …".
- **Oracle.** `ai_auditor/counter_offer_auditor.rb:10-35`.
- **Trace.** P2 · manual · `R-LIF-042-1` `R-LIF-042-2` `R-LIF-042-3` · `app/services/ai_auditor/counter_offer_auditor.rb:10-35`

#### API-EVRLIF-031 — A knockout round that cannot be saved is reported, not returned as if created
- **Why it matters.** The round builder returns an unsaved round with no error; callers continue as if the round exists.
- **Setup.** Knockout auction with round 2 active; build another active round 2.
- **Steps.** Build the round; read the auction's rounds.
- **Expected.** An error naming the duplicate; one round 2. A valid round carries the stage, strategy, number, version, times, bulk price and participants.
- **Expected (today).** No error; the duplicate is silently not saved.
- **Oracle.** `trade_rounds/create_service.rb:22-35`; uniqueness `trade_round.rb:43-45`.
- **Trace.** P2 · manual · `R-LIF-043-1` `R-LIF-043-4` · `app/services/trade_rounds/create_service.rb:22-35`

#### API-EVRLIF-032 — A draft award proposal records the event, lot and Excel mode
- **Why it matters.** The draft award must stay tied to its event and lot; companies with an allocation summary template get the new summary.
- **Setup.** Event with lots; company with an allocation summary template.
- **Steps.** Start an award for lot 2 by Excel; read the draft proposal.
- **Expected.** Draft proposal on the event, creator = buyer, event number, lot 2, awarding-by-Excel flag, allocation summary v1 on.
- **Oracle.** `proposals/create_draft_service.rb:15-29`.
- **Trace.** P3 · automate-later · `R-LIF-043-2` `R-LIF-043-3` · `app/services/proposals/create_draft_service.rb:15-29`

## 8. Service events (activities grouped by service)

#### API-EVRLIF-033 — Deleting one activity of a service deletes all of that service's activities
- **Why it matters.** Service RFPs are evaluated per service; removing one activity must not leave a partial service, but must also not touch other services.
- **Setup.** Service-grouped event: service S1 with activities a, b, c; service S2 with d.
- **Steps.** Delete activity a; read the lines and forms. Delete d on an event without service grouping.
- **Expected.** a, b, c (active or draft) deleted and their forms marked deleted; d untouched. Without grouping (or no siblings found) only the requested line is deleted.
- **Oracle.** `event_groups/service_line_item_deletion.rb:10-72`.
- **Trace.** P1 · automate-later · `R-LIF-046-1` `R-LIF-046-2` `R-LIF-046-3` · `app/services/event_groups/service_line_item_deletion.rb:10-72`

#### API-EVRLIF-034 — One form per service activity, shown once, and duplicate PR links tidied
- **Why it matters.** The vendor answers one form per service; duplicates and extra links confuse the PR quantity.
- **Setup.** Service S with activities a and b; a form sent for a; line L with two links to the same PR item.
- **Steps.** Build the forms; list them; read L's links.
- **Expected.** Forms for a and b; the list shows only the first per service; L keeps the oldest link not owned by another line, the rest retired.
- **Oracle.** `event_groups/service_activity_line_item_mapper.rb:21-78`; `forms_helper.rb:13`; `trade_form_helper.rb:255`.
- **Trace.** P2 · automate-later · `R-LIF-046-4` `R-LIF-046-5` `R-LIF-046-6` · `app/services/event_groups/service_activity_line_item_mapper.rb:21-78`

## 9. Finding events

#### API-EVRLIF-035 — Open-tender search matches title or number literally, and the list sorts only on allowed fields
- **Why it matters.** A vendor searching "100%" or "A_B" gets unrelated events because % and _ act as wildcards.
- **Setup.** Open-tender events "Steel 100% recycled", "Steel 1000 MT", "A_B pipes", "AXB pipes"; an amended event RFX-n.1; vendor login.
- **Steps.** Search the open tenders for "100%", "A_B", "rfx-n.1", and with a created-from/to range; sort the buyer's events list by "title" and by "created_at asc".
- **Expected.** "100%" → only the first; "A_B" → only "A_B pipes"; "rfx-n.1" finds the amended event (case-insensitive; amended numbers are stored with the suffix); the created range includes both ends. Sort: only id, created at, updated at or latest round time; anything else falls back to id, newest first.
- **Expected (today).** "100%" also matches "Steel 1000 MT"; "A_B" also matches "AXB pipes". Most event lists apply only the sort (the text filter is used on the open-tender list).
- **Oracle.** `event_groups/search_query.rb:5-42`; `event_group.rb:90-107, 216-218`; `event_group_controller_helper.rb:2512`; Procol DB shows amended `ref_id` like "RFX-12830.1" (so the digest's claim that the shown ref finds nothing is wrong).
- **Trace.** P2 · automate-later · `R-LIF-047-1` `R-LIF-047-2` `R-LIF-047-3` `R-LIF-047-4` `R-LIF-047-5` · `app/services/event_groups/search_query.rb:5-42`
