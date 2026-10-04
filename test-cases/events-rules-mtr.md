# Rounds of an event (the stage model) — rule cases

Cases for the rules of the stage (round) and line-item models that no written case checked yet, extracted from
`prototype/knowledge/events/backend-digest/models-trade-request.md`. Each case names its rule (`R-MTR-…`,
`prototype/data/rules/events-rules.json`) and the line of `procol-backend` (origin/main ae36e86894) that makes it true; every
cited line was opened before the case was written. Rules that cannot be seen from outside (enum integers, callbacks that only
queue internal jobs, websocket pings, Slack logs, raw-SQL helpers with no caller reachable from an event) are listed in
`prototype/data/rules/not-checkable.json` instead. Runnable twins: EDGE-EVRMTR-008 and 038 (`data/api-cases-extra/rules-mtr.json`).

Where a case says "the stage read" it means what the buyer's console receives when it opens the round (the round's
settings block is the stored settings plus computed flags, `trade_template_serializer.rb:95-166`).

## 1. Round numbers, names and status labels

#### API-EVRMTR-001 — Every new round gets a reference number whose prefix tells its type
- **Why it matters.** Buyers quote these numbers to vendors and finance; a wrong prefix or a reused number sends people to the wrong round.
- **Setup.** One event with a technical round (RFP), a price round (RFQ), and the price round later moved to a reverse auction. `gate: show_reference_id` on one stage, off on another.
- **Steps.** 1. Publish the event. 2. Note each round's reference. 3. Move the price round to auction and note the new auction round's reference. 4. Create a second event and note its price round's reference.
- **Expected.** Technical round "RFP-n", price round "RFQ-n", the auction made from it "RA-n" with a fresh number (not the RFQ's), a forward auction would be "FA-n". The number is the company's running count of rounds, so the next event's round has a higher number. With reference display on, the round title reads "Title [RFQ-n]"; with it off, the reference is not shown.
- **Oracle.** Stage `ref_uuid` (only present when `config.show_reference_id` is true, `trade_template_serializer.rb:55-57`); otherwise Procol DB `trade_requests.ref_id` (SELECT). Prefix `get_ref_identifier` (`trade_request.rb:2527-2543`); number = `companies.trade_requests_count` at create (`:382-386`); rfq_then_auction always re-numbered (`:374-380`).
- **Trace.** P2 · automate-later · `R-MTR-009-1` `R-MTR-009-2` `R-MTR-009-3` `R-MTR-009-4` · `app/models/trade_request.rb:374-386, 2527-2543`

#### API-EVRMTR-002 — Changing a draft round's type keeps its number and changes only the prefix
- **Why it matters.** A buyer who switches a draft round from RFQ to auction should not get a new number that no longer matches what was shared internally.
- **Setup.** Draft event with a price round numbered RFQ-n.
- **Steps.** 1. Change the draft round's type to auction and save. 2. Read its reference.
- **Expected.** The reference becomes RA-n with the same n.
- **Oracle.** `trade_requests.ref_id` before/after; `before_update :update_ref_id` splits on "-" and re-prefixes (`trade_request.rb:278, 388-394`).
- **Trace.** P3 · automate-later · `R-MTR-004-4` · `app/models/trade_request.rb:388-394`

#### API-EVRMTR-003 — Round status in the auction report reads Open, Expired, Closed or Withdrawn
- **Why it matters.** The status column of the downloaded auction report is what auditors read; a raw internal word looks like a broken report.
- **Setup.** Four auction rounds: one live, one past its end but not closed, one closed, one withdrawn.
- **Steps.** Download the auction bidding report for each.
- **Expected.** "Open", "Expired", "Closed", "Withdrawn". A round withdrawn through the path that stores status "withdrawn" (not "in_active") should also read "Withdrawn"; today it prints the raw lowercase "withdrawn".
- **Oracle.** RFQ-status column = `display_status` (`auction_bidding_excel_report_data_model.rb:139`); mapping `trade_request.rb:1228-1238` maps only `in_active` to "Withdrawn".
- **Trace.** P3 · manual · `R-MTR-001-6` `R-MTR-001-7` · `app/models/trade_request.rb:1228-1238`

#### API-EVRMTR-004 — Downloaded attachment folders are named after the round type
- **Why it matters.** The zip of a round's attachments is filed by its folder name; "Technical", "RFQ" and "Auction" must match the round.
- **Setup.** Event with a technical round, a price round and an auction, each with one attachment.
- **Steps.** Download the attachments zip of each round.
- **Expected.** Folder "<event ref>_Technical_Attachments" for the technical round (RFP or RFI), "<event ref>_RFQ_Attachments" for the price round, "<event ref>_Auction_Attachments" for the auction (also for an auction made from an RFQ).
- **Oracle.** `download_zip_task_controller.rb:55` uses `stage_name` (`trade_request.rb:1240-1251`).
- **Trace.** P3 · manual · `R-MTR-002-7` · `app/models/trade_request.rb:1240-1251`

## 2. Owner, open tender and a second auction

#### API-EVRMTR-005 — The owner of every round is the owner of the event, not the colleague who added it
- **Why it matters.** Cancel, close and "my events" checks compare against the round owner; if a colleague who added a round kept owner rights after a hand-over, the new owner could not act.
- **Setup.** Buyer A owns an event; colleague B (same company, no admin rights) adds a price round. Then A hands the event to buyer C.
- **Steps.** 1. As B, try to cancel the round. 2. As C (new owner), open, close and cancel the round.
- **Expected.** B is treated as not the owner (refused unless another permission allows it). C acts as the owner of every round immediately after the hand-over, with no change to the rounds themselves.
- **Oracle.** `TradeRequest#user`/`#user_id` return the event's owner (`trade_request.rb:3017-3023`); `allowed_to_cancel?`, `is_created_by_user?` compare `user_id` (`trade_request_model_helper.rb:148-150, 444`). Refusal: HTTP 422 code 101 "You are not allowed to perform this action".
- **Trace.** P1 · automate-later · `R-MTR-010-1` `R-MTR-010-2` `R-MTR-010-3` · `app/models/trade_request.rb:3017-3023`

#### API-EVRMTR-006 — A round is a closed tender open to everyone unless the company has open tenders switched on
- **Why it matters.** An open tender is listed publicly to vendors; a round becoming open by accident exposes the buyer's requirement.
- **Setup.** Company without `gate: enable_open_tender_events`; a second company with it on, an event marked "show under open events", one price round and one auction in each.
- **Steps.** Publish each and read the stored tender type and audience.
- **Expected.** First company: closed tender, audience "everyone". Second company: the price round becomes an open tender; the auction stays closed (auctions are never open tenders); an event not marked "show under open events" stays closed.
- **Oracle.** `before_save :set_tender_value` (`trade_request.rb:3152-3159`, `company.rb:215-217`); DB `trade_requests.tender` (0 open / 1 closed), `customised_audience` 0; stage read `customised_audience` false.
- **Trace.** P2 · automate-later · `R-MTR-002-5` `R-MTR-004-2` · `app/models/trade_request.rb:3152-3159`

#### API-EVRMTR-007 — A price round can be moved to auction only once
- **Why it matters.** Two live auctions made from the same RFQ split the vendors and give two "winning" prices.
- **Setup.** Closed price round with bids; it has already been moved to an auction that is live (not draft, cancelled or withdrawn).
- **Steps.** Move the same price round to auction again.
- **Expected.** Refused with "An auction has already been made for this event."; no second auction round exists. After the first auction is withdrawn or cancelled, a new move is allowed.
- **Oracle.** `validate_unique_auction_for_parent` (`trade_request.rb:3100-3105`) adds a base error on create of a rfq_then_auction round whose parent already has one outside draft/cancelled/withdrawn; the HTTP status/code with which move_to_auction reports a base error is (unverified).
- **Trace.** P1 · automate-later · `R-MTR-004-3` · `app/models/trade_request.rb:3100-3105`

## 3. Bidding window, extensions and evaluation windows

#### API-EVRMTR-008 — The stored end of a round always equals the end of its live schedule
- **Why it matters.** Lists, filters and reminders use the stored end; if it lagged behind an extension, the round would show as expired while vendors can still bid.
- **Setup.** Live price round ending at T.
- **Steps.** 1. Extend the round to T + 2 h. 2. Read the round and find it in the events list filtered by end time.
- **Expected.** The round's end time is T + 2 h everywhere (stage read, list, filter). For a price round the end is the last price-round schedule; for a technical round the last bidding schedule; for an auction the latest of the auction, auto-extension and sealed-bid-extension schedules. A cancelled (void) schedule never counts.
- **Oracle.** `before_save :set_bid_end_time` (`trade_request.rb:277, 3096-3098`); `bid_end_time` per mode (`:828-838`), `bid_start_time` (`:723-733`); `trade_schedules` excludes status 5 (`:111`).
- **Trace.** P1 · automate · `R-MTR-004-1` `R-MTR-011-1` `R-MTR-011-2` `R-MTR-011-4` · `app/models/trade_request.rb:723-733, 828-838, 3096-3098` · `EDGE-EVRMTR-008`

#### API-EVRMTR-009 — An auction's end includes automatic extensions; an RFQ's end does not
- **Why it matters.** If the auction's end ignored the extension, the round would close (and rank) while the last vendor is still inside the extra minutes.
- **Setup.** Live reverse auction with auto-extension: last 2 minutes, extend by 2 minutes. A QA vendor.
- **Steps.** 1. Bid 60 seconds before the end. 2. Read the round's end time and the extension count.
- **Expected.** The end moves to the original end + 2 minutes, the extension count goes from 0 to 1, and bids are accepted until the new end. On a price round (RFQ) no such schedule is added to the end.
- **Oracle.** `bid_end_time` for auctioning = max end of `auction`, `dynamic_extra_time`, `sealbid_extension_time` (`trade_request.rb:830-832`); `misc.dynamic_time_extension_count` (`trade_request_model_helper.rb:1003-1014`).
- **Trace.** P1 · automate-later · `R-MTR-011-3` `R-MTR-017-4` · `app/models/trade_request.rb:828-838`

#### API-EVRMTR-010 — Automatic award waits for the extended end
- **Why it matters.** An auto-award that ran at the original end would award while the auction is still running after an extension.
- **Setup.** `gate: auto_awarding_enabled` on an auction round ending at T. A QA vendor.
- **Steps.** 1. Trigger an auto-extension (or extend manually) to T + 5 min. 2. Watch the round's auto-award timeline.
- **Expected.** At creation the timeline has "enabled". Nothing is awarded at T + 3 s; the award runs only after T + 5 min (timeline "in_progress" then "completed" or "aborted" with a reason).
- **Oracle.** `schedule_auto_award_worker` at `bid_end_time + 3 s` (`trade_request.rb:3227-3234`); `AutoAwardWorker` re-schedules itself while `now < bid_end_time` (`auto_award_worker.rb:11-13`); `misc.auto_award_timeline` in the stage read's misc. Note: the digest's gap R-MTR-005-6 ("not moved on extension") is wrong for the outcome — the worker re-checks.
- **Trace.** P0 · manual · `R-MTR-005-1` `R-MTR-005-6` · `app/models/trade_request.rb:3227-3234`

#### API-EVRMTR-011 — Draft bids that were never sent are discarded when bidding ends
- **Why it matters.** A half-filled draft must not appear in the comparison, and the vendor must see that it was not sent.
- **Setup.** Live price round; a QA vendor saves a draft bid without submitting.
- **Steps.** 1. Let the round end (or end it). 2. As the buyer read the bid list; as the vendor read its bid.
- **Expected.** After the end the draft is inactive and never listed for the buyer; the round status turns closed at its closing time and the event's status refreshes within seconds.
- **Oracle.** `DeleteDraftBidsWorker` at `bid_end_time` marks `bids.draft` → in_active only when `bid_end_time <= now` (`delete_draft_bids_worker.rb:7-21`); scheduled on closed_at change unless status changed to active (`trade_request.rb:304, 3199-3203`); `MarkEventClosedWorker` at closed_at (`:358-361`). Whether the job is queued when the end is set at publish in the same save as the activation is (unverified).
- **Trace.** P1 · automate-later · `R-MTR-006-4` `R-MTR-006-5` `R-MTR-006-7` · `app/models/trade_request.rb:3199-3203`

#### API-EVRMTR-012 — Extending a technical round moves its evaluation window and keeps its length
- **Why it matters.** Evaluators planned a fixed evaluation period; an extension must not shorten it or start it before bidding ends.
- **Setup.** Technical round (RFP) bidding ends T, evaluation window T → T + 2 days.
- **Steps.** 1. Extend bidding to T + 1 day. 2. Read the round's end and evaluation end.
- **Expected.** Bidding ends T + 1 day; the evaluation window starts at T + 1 day and ends at T + 3 days (same 2-day length). Every active, pending or requested response gets the new closing time. The stored evaluation duration equals evaluation end − bidding end (2 days).
- **Oracle.** `shift_schedule_after_self_schedule` keeps duration (`trade_schedule.rb:154-170`); stage `extra_closing_time` (`trade_request.rb:934-942`, serializer `:534-542`); `config.evaluation_duration` (`trade_request.rb:1388-1391`).
- **Trace.** P1 · automate-later · `R-MTR-016-3` `R-MTR-016-5` `R-MTR-012-1` `R-MTR-012-4` · `app/models/trade_schedule.rb:154-170`

#### API-EVRMTR-013 — With a cost-breakdown review window, an extension shifts the review window first and the evaluation after it
- **Why it matters.** Vendors need their full cost-breakdown time after the real end of bidding, and evaluation must start after that.
- **Setup.** Price round ending T, cost-breakdown review window T → T + 1 h, evaluation window T + 1 h → T + 1 day.
- **Steps.** 1. Extend bidding by 30 minutes (or trigger an auto-extension on an auction). 2. Read the three windows.
- **Expected.** Bidding T + 30 min; review T + 30 min → T + 1 h 30 min; evaluation T + 1 h 30 min → T + 1 day 30 min. Counter-offer task due dates follow the moved window.
- **Oracle.** `check_for_auction_extra_closing_time` (`trade_schedule.rb:216-222`); auto-extension path `increase_extra_closing_time_on_extension` (`:190-204`).
- **Trace.** P1 · automate-later · `R-MTR-016-2` `R-MTR-017-2` · `app/models/trade_schedule.rb:190-226`

#### API-EVRMTR-014 — With a best-offer review window, an extension should not make evaluation overlap the review
- **Why it matters.** Today a manual extension shifts only the evaluation window, so it starts at the new bidding end while vendors are still sending best offers.
- **Setup.** Price round ending T, best-offer review window T → T + 1 h, evaluation window T + 1 h → T + 1 day.
- **Steps.** 1. Extend bidding by 30 minutes (manual edit, not an auto-extension). 2. Read the windows.
- **Expected.** Review window T + 30 min → T + 1 h 30 min and evaluation after it (as in API-EVRMTR-013).
- **Expected (today).** Only a cost-breakdown review window is shifted on this path; the evaluation window is moved to start at T + 30 min, overlapping the unchanged best-offer window.
- **Oracle.** `trade_schedule.rb:219` shifts the review window only when `is_cost_breakdown_time`; else `:224-225` shifts the evaluation window straight after the bidding schedule. Compare the auto-extension path `:196-199`, which handles both.
- **Trace.** P1 · manual · `R-MTR-016-6` · `app/models/trade_schedule.rb:216-226`

#### API-EVRMTR-015 — On a round that closes line by line, an extension does not move the following window
- **Why it matters.** Line-by-line (staggered) closing has its own timetable; only the round's overall closing time follows the extension.
- **Setup.** Auction with staggered line closing, followed by an evaluation window.
- **Steps.** Extend the last line's end; read the round's closing time and the evaluation window.
- **Expected.** The round closing time becomes the extended end; the evaluation window is not shifted.
- **Oracle.** `trade_schedule.rb:151-152, 158` (staggered → only `closed_at` updated).
- **Trace.** P2 · manual · `R-MTR-016-4` · `app/models/trade_schedule.rb:151-158`

#### API-EVRMTR-016 — Savings are recalculated after the extended end, not at the original end
- **Why it matters.** Savings computed at the original end miss the bids placed in the extension.
- **Setup.** Live price round with a reference price; QA vendor bid; `gate: show_custom_savings` for the custom figures.
- **Steps.** 1. Extend the round; the vendor improves its price in the extension. 2. After the new end, read the round's savings.
- **Expected.** Savings use the improved price; custom savings appear about 2 s and standard savings about 5 s after the new end.
- **Oracle.** `trade_schedule.rb:168-169` queues `SavingsCalculatorWorker` (end + 5 s) and `CustomSavingsCalculatorWorker` (end + 2 s); custom worker returns early while `closed_at > now` (`custom_savings_calculator_worker.rb:9`).
- **Trace.** P2 · automate-later · `R-MTR-007-4` · `app/models/trade_schedule.rb:168-169`

#### API-EVRMTR-017 — Best-offer review times are shown only to the buyer and the vendors asked for a best offer, and only during the window
- **Why it matters.** A vendor that was not asked must not learn that others got extra time; a cost-breakdown request, by contrast, is public to all participants.
- **Setup.** Closed price round, two QA vendors; best-offer review window for vendor A only. Second round with a cost-breakdown window.
- **Steps.** 1. During the window, read the round as the buyer, as A and as B. 2. Repeat after the window. 3. Read the cost-breakdown round as B before, during and after its window.
- **Expected.** Best offer: during the window the buyer and A see the review end time and type, B sees neither; after the window nobody gets them. While the window is open, "price increase allowed" reads false for everyone. Cost breakdown: start, end and type are returned to everyone at any time.
- **Oracle.** Stage read `response_review_end_time_for_participant`, `response_review_time_for` (`trade_template_serializer.rb:529-532, 973-975`); readers `trade_request.rb:778-825`; window = last schedule of that type, inclusive bounds (`:808-810, 1185-1189`); allowed vendors = flattened `config.allowed_participants_to_edit_in_bid_review_time` (`:1206-1209`); `is_price_increase_allowed` forced false (`trade_template_serializer.rb:148`).
- **Trace.** P1 · automate-later · `R-MTR-014-1` `R-MTR-014-3` `R-MTR-014-4` `R-MTR-014-5` · `app/models/trade_request.rb:778-825`

## 4. Send to evaluation and evaluation status

#### API-EVRMTR-018 — "Send to evaluation" is offered only after bidding ended and before any evaluation window exists
- **Why it matters.** Sending too early cuts bidding short; sending twice creates two evaluation windows.
- **Setup.** Technical round with manual send-to-evaluation (`gate: send_rfp_to_evaluation_manually`); a buyer with purchase mode and one without (e.g. view-only mode).
- **Steps.** 1. Read the round's configuration while bidding is open, after it ends, after sending to evaluation, and after withdrawing a second such round. 2. As the user without purchase mode, try to extend evaluation time before sending.
- **Expected.** The button flag is false while bidding is open, true after the end, false again once an evaluation window exists and false for a withdrawn round. The user without purchase or customer-success mode may not extend evaluation time until the round has been sent; everyone else may.
- **Oracle.** `show_send_to_evaluation_button` (`trade_request.rb:1382-1386`) = enabled for user ∧ expired ∧ not in_active ∧ no extra_closing_time (`trade_request_model_helper.rb:1184-1189`); `allowed_to_extend_evaluation_time?` (`:1176-1182`).
- **Trace.** P1 · automate-later · `R-MTR-044-2` `R-MTR-044-3` · `app/models/model_helpers/trade_request_model_helper.rb:1176-1189`

#### API-EVRMTR-019 — The event card shows evaluation as pending, overdue or completed at the right moments
- **Why it matters.** Evaluators work from the "overdue" flag; a technical round marked done before every response is scored hides pending work.
- **Setup.** Event with a technical round (lot-level scoring, two responses) and a technical round with line-level scoring; an RFI.
- **Steps.** Read the event card while bidding runs, after it ends, after scoring one of two responses, after scoring both, after the evaluation end passes with one unscored, and for line-level after asking for re-evaluation of one line.
- **Expected.** While upcoming or running: no evaluation status. After the end: pending, then overdue once the closing time passes. Lot-level: completed only when every active response has a score. Line-level: completed only when every active line has a score and none is "re-evaluation requested". RFI: completed as soon as any active evaluation exists. A closed round or one moved to auction: completed.
- **Oracle.** Card `evaluation_status` from `evaluation_status_hash` (`trade_request.rb:396-419`, `buyer_card_serializer.rb:9, 63-64, 300`); `is_evaluated?` (`trade_request_model_helper.rb:1281-1330`).
- **Trace.** P1 · automate-later · `R-MTR-044-6` `R-MTR-045-2` `R-MTR-045-3` `R-MTR-045-4` · `app/models/trade_request.rb:396-419`

#### API-EVRMTR-020 — With "only the creator's scores" on, scoring after bidding ends only refreshes the buyer rank
- **Why it matters.** The setting freezes other evaluators' scores; if it still re-ran the full scoring, a late evaluator could change results.
- **Setup.** `gate: update_only_creator_scores_in_evaluation`; technical round with two responses scored; bidding ended.
- **Steps.** A second evaluator changes a score; read the responses' ranks and line best prices.
- **Expected.** Only the buyer rank (and line best price) is recalculated; other stored scores are unchanged. Before the bidding end the full recalculation runs.
- **Oracle.** `update_only_creator_scores?` (`trade_request_model_helper.rb:1362-1373`), branch at `trade_request.rb:1987-2004`.
- **Trace.** P2 · manual · `R-MTR-045-5` · `app/models/trade_request.rb:1987-2004`

#### API-EVRMTR-021 — The technical report with approvals should not fail for a round that was never sent to evaluation
- **Why it matters.** The report's approval section prints "Send for TR at" from the first evaluation window; a round evaluated without one makes the whole report fail.
- **Setup.** Technical round with an approved technical award proposal, where the round has no evaluation (extra closing) window (e.g. scored straight after bidding).
- **Steps.** Download the technical report.
- **Expected.** The report is produced; "Send for TR at" is blank when there was no window.
- **Expected (today).** The report job raises (no window → `.first` is nil) and the report never becomes ready (unverified whether an evaluated round can lack the window on this client).
- **Oracle.** `rfi_comparison_report.rb:474` → `get_send_for_evaluation_start_time` (`trade_request.rb:774-776`, `.first.start_time` with no guard).
- **Trace.** P2 · manual · `R-MTR-012-5` `R-MTR-012-6` · `app/models/trade_request.rb:774-776`

## 5. Who may open a round

#### API-EVRMTR-022 — Auction-team members cannot open technical or price rounds, but can open shared ones only if allowed
- **Why it matters.** Companies that route auctions to a separate team rely on that team not seeing the sourcing (RFQ/RFP) prices.
- **Setup.** Buyer company with an auction team; user U in it. Event with a technical round, a price round and an auction. Another price round shared with U through the access list.
- **Steps.** As U, open each round.
- **Expected.** U is refused on the technical and price rounds and allowed on the auction. Note: the auction-team refusal is checked before sharing, so the shared price round is refused too (Expected (today)); a user outside the buyer workspace is always refused.
- **Oracle.** `is_allowed_to_view_client_side?` order: workspace (`trade_request_model_helper.rb:412`) → auction team on RFI/RFP/RFQ → false (`:420-423`) → shared (`:425-428`). Refusal HTTP 422 code 101.
- **Trace.** P0 · automate-later · `R-MTR-041-2` `R-MTR-041-3` `R-MTR-041-4` · `app/models/model_helpers/trade_request_model_helper.rb:402-428`

#### API-EVRMTR-023 — A Procol employee sees a client's round only as that client's CSM inside that client's workspace
- **Why it matters.** Support staff must not browse any client's prices; and a support call without a workspace must be refused, not crash.
- **Setup.** Procol employee E who is CSM for client X only.
- **Steps.** 1. As E in workspace X, open X's round. 2. As E in workspace Y, open X's round. 3. As E with no workspace selected, open X's round.
- **Expected.** Allowed in X; refused in Y; refused (not a server error) with no workspace.
- **Oracle.** `trade_request_model_helper.rb:402-410`; `Current.workspace.id` without a guard (`:404`) — step 3 outcome (unverified: whether the API always sets a workspace for an employee).
- **Trace.** P1 · manual · `R-MTR-041-1` `R-MTR-041-7` · `app/models/model_helpers/trade_request_model_helper.rb:402-410`

#### API-EVRMTR-024 — A vendor sees an "everyone" round only when its category or location mapping matches the round
- **Why it matters.** "Everyone" means every mapped vendor of the matching category/location, not every vendor of the buyer; a wrong match leaks the requirement or hides it from the right vendors.
- **Setup.** Round for category C at location L, audience everyone. Vendor V1 mapped to C, V2 mapped to another category only, V3 mapped with no restriction.
- **Steps.** As each vendor, list open rounds and open this one.
- **Expected.** V1 and V3 see it; V2 does not. A round with no category/location identifiers is visible to every mapped vendor. A restricted round shows only to listed vendors; "everyone except" hides the listed ones. Inactive vendors or inactive user mappings never see it.
- **Oracle.** Vendor `is_allowed_to_view?` (`trade_request_model_helper.rb:358-361, 454-468`); audience lists `trade_request.rb:1413-1437`; identifiers per (category ancestors, location, zone) `:1543-1596`; NULL identifiers visible to all (`:183-190`); team match rules `:2865-2893`.
- **Trace.** P0 · manual · `R-MTR-040-4` `R-MTR-042-1` `R-MTR-042-2` `R-MTR-042-3` `R-MTR-042-4` `R-MTR-042-5` `R-MTR-006-1` · `app/models/trade_request.rb:1413-1437, 1543-1596`

#### API-EVRMTR-025 — Saving a round whose product has no category should not crash
- **Why it matters.** The round's category/location identifiers are rebuilt on every save; a product without a category makes that rebuild fail and the whole save returns a server error.
- **Setup.** A product with no category (if the client allows creating one), used on a price round at a delivery location.
- **Steps.** Save (or publish) the round.
- **Expected.** Saved; the identifiers are built from the location alone.
- **Expected (today).** Untyped HTTP 500 (`all_category_ids.each` on nil). Unverified whether this client lets a product exist without a category.
- **Oracle.** `generate_identifier_hash` returns early only when both category ids and location are nil (`trade_request.rb:1582-1592`), called from after-save `update_team_identifier` (`:1576-1580`).
- **Trace.** P1 · manual · `R-MTR-042-6` · `app/models/trade_request.rb:1576-1592`

#### API-EVRMTR-026 — A vendor cannot read a round's activity log
- **Why it matters.** The activity log lists every buyer action (extensions, invitations, who opened bids); it is buyer-only.
- **Setup.** Live sandbox round; the invited QA vendor.
- **Steps.** As the buyer read the round's activity log; as the vendor do the same.
- **Expected.** Buyer: returned. Vendor: refused (never a server error).
- **Oracle.** `trade_request.rb:2545-2553` (read permission + view access; CSM or buyer-company user). The vendor half is (unverified): which app may call the activity-log route.
- **Trace.** P1 · automate-later · `R-MTR-043-7` · `app/models/trade_request.rb:2545-2553`

## 6. Vendor-name masking and bid statistics

#### API-EVRMTR-027 — Vendor-name masking follows "everyone" or "everyone except super admins"
- **Why it matters.** Masking keeps evaluators unbiased; a super admin should see names only when the setting says so.
- **Setup.** Masked round with `gate: is_vendor_masking_allowed_for_everyone_except_super_admin`; second round with `…_for_everyone`; third with neither. A super admin and a normal buyer.
- **Steps.** Read each round's settings and bid list as both users.
- **Expected.** Except-super-admin: names masked for the normal buyer, shown to the super admin. Everyone: masked for both. Neither: shown to both. Buyer user names next to actions are hidden when the round says "do not show user names" (price rounds are created with it off).
- **Oracle.** `is_vendor_masking_enabled_for_user` in the stage settings (`trade_template_serializer.rb:129`); readers `trade_request_model_helper.rb:924-930, 1223-1230`; `is_show_user_name` false on RFQ create (`trade_controller_helper.rb:3574`).
- **Trace.** P0 · automate-later · `R-MTR-039-1` `R-MTR-039-4` · `app/models/model_helpers/trade_request_model_helper.rb:924-930, 1223-1230`

#### API-EVRMTR-028 — In a masked live round, the buyer gets only placed-bid counts when "bidding stats in masked events" is on
- **Why it matters.** The setting exists so a buyer can watch participation without seeing who bid what while the round is live.
- **Setup.** Masked live round with `gate: show_bidding_stats_in_masked_events`; a second live round with `show_placed_bids_stats` set false; a super admin.
- **Steps.** Read the participation statistics as the buyer, as the super admin, and after the end.
- **Expected.** Round 1 while live: stats-only for buyer-company users. Round 2: the stored value (false) for normal buyers, ignored for a super admin. After the end: full data.
- **Oracle.** `should_show_placed_bids_stats_only?` (`trade_request_model_helper.rb:297-305`), used at `trade_controller.rb:1099, 1462`. The digest omits the buyer-company condition in the second branch (`:301`).
- **Trace.** P1 · automate-later · `R-MTR-038-6` · `app/models/model_helpers/trade_request_model_helper.rb:297-305`

## 7. Quantities, line counts, attachments and price limits

#### API-EVRMTR-029 — A vendor sees the requested quantity unless it is a Dutch auction closing on several vendors
- **Why it matters.** In a multi-vendor Dutch auction the quantity is hidden by design; elsewhere a vendor cannot quote without it.
- **Setup.** Price round with no quantity-display setting; Dutch auction closing on multiple vendors with no setting; one with the setting explicitly true. Remaining quantity setting on and off.
- **Steps.** As the QA vendor read each round.
- **Expected.** Price round: quantity shown. Multi-vendor Dutch, no setting: hidden. Setting true: shown. Remaining quantity is shown only when that setting is exactly on.
- **Oracle.** `show_quantity_requested?` (`trade_request_model_helper.rb:164-169`), `show_remaining_quantity_to_sellers?` (`:171-173`).
- **Trace.** P1 · manual · `R-MTR-033-6` · `app/models/model_helpers/trade_request_model_helper.rb:164-173`

#### API-EVRMTR-030 — The number of items on a round is counted the way the buyer sees them
- **Why it matters.** Event cards and reports show "n items"; a technical round counting its form instead of the event's lines, or variants counted as separate items, misleads the buyer.
- **Setup.** Event with 3 lines; technical round; price round with the same 3 lines; an alternate-bidding round with 2 products × 2 variants at one location.
- **Steps.** Read each round's item count.
- **Expected.** Technical round 3 (the event's lines); price round 3 (its lines); alternate bidding: 2 items, 4 variants, and it counts as a multi-product round.
- **Oracle.** `number_of_products` (`trade_request.rb:2243-2256`); `is_multi_product` (`:1174-1179`); `misc.number_of_variants`.
- **Trace.** P2 · automate-later · `R-MTR-034-1` `R-MTR-034-2` `R-MTR-034-3` `R-MTR-033-5` `R-MTR-003-5` · `app/models/trade_request.rb:2243-2256`

#### API-EVRMTR-031 — More than 15 attachments on one line is refused on every way of creating a round
- **Why it matters.** The limit protects storage and the vendor's download; it is enforced on one create path only.
- **Setup.** Draft event.
- **Steps.** 1. Create a round through the classic create with a line carrying 16 attachments. 2. Add a round through the event flow (template input) with a line carrying 16 attachments.
- **Expected.** Both refused with "Maximum attachment limit exceeded."; 15 accepted.
- **Expected (today).** Only the classic create checks it (`trade_controller.rb:136`); the event-flow path has no such check (unverified: whether it has its own limit elsewhere).
- **Oracle.** HTTP 422 code 489; `maximum_attachments_limit_exceeded?` (`trade_controller_helper.rb:5376-5379`), `MAX_ATTACHMENT_COUNT = 15` (`trade_product.rb:55`).
- **Trace.** P2 · automate-later · `R-MTR-047-4` · `app/controllers/api/trade_controller.rb:136`

#### API-EVRMTR-032 — A line needs a delivery location and a unit; missing either is a clear refusal
- **Why it matters.** A line without location or unit cannot be quoted; the buyer must be told which field is missing, not get a server error.
- **Setup.** Draft event.
- **Steps.** Add a line with no delivery location; then one with no unit.
- **Expected.** Refused with a message naming the missing field ("must exist"); nothing saved. Never HTTP 500.
- **Oracle.** `belongs_to :buyer_hub`, `:unit` required (`trade_product.rb:60-66`). How the event-flow controller reports the model error (status/code) is (unverified) — an untyped 500 here is a defect.
- **Trace.** P1 · automate-later · `R-MTR-047-3` · `app/models/trade_product.rb:60-66`

#### API-EVRMTR-033 — A vendor-specific floor price wins over the default; minimum quantity has no vendor-specific value
- **Why it matters.** Floor prices protect the buyer per vendor; using the wrong one lets a vendor bid below its floor.
- **Setup.** Line with default floor 100.456 and vendor-specific floor 120 for vendor A; default minimum quantity 10 and an attempted vendor-specific minimum 5 for A.
- **Steps.** As A and as vendor B read the line limits; as A bid 110.
- **Expected.** A's floor 120 (bid 110 refused), B's floor 100.46 (2 decimals). Minimum quantity 10 for both. The buyer sees the default floor.
- **Oracle.** `floor_price_for_user` vendor > default (`trade_product.rb:228-237`), called by bid validation `bids_controller_helper.rb:1848`; `floor_quantity_for_user` column else default (`:213-225`); readers round to 2 dp (`:533-549`).
- **Trace.** P0 · automate-later · `R-MTR-048-3` `R-MTR-048-4` `R-MTR-048-5` · `app/models/trade_product.rb:213-237, 533-549`

#### API-EVRMTR-034 — A minimum decrement below half a paisa should not silently become no minimum
- **Why it matters.** Rounding the tick to two decimals turns 0.004 into 0, so vendors can lower by any amount.
- **Setup.** Auction line with tick size 0.004 (and a second line with no tick but a round-level price-change slab of 5).
- **Steps.** A vendor lowers its price by 0.001 on each line.
- **Expected.** Line 1: refused (or the tick rejected when the buyer saves it). Line 2: refused, the round-level slab applies.
- **Expected (today).** Line 1 tick reads 0.0 and the change is accepted.
- **Oracle.** `tick_size` = `to_f.round(2)` (`trade_product.rb:508-512`); fallback `config.price_change_slab` (`trade_request_model_helper.rb:193-196`).
- **Trace.** P2 · manual · `R-MTR-049-1` `R-MTR-049-2` `R-MTR-049-7` · `app/models/trade_product.rb:508-518`

#### API-EVRMTR-035 — English auction: each vendor's step and floor are measured from the best price
- **Why it matters.** In an English auction a vendor must beat the best price by a tick; a wrong step lets a vendor "beat" the best by nothing.
- **Setup.** English auction (`gate: is_english_auction_enabled`), line best 1,000, vendor A at 1,050, tick 10 (second line: tick 1 %).
- **Steps.** Read A's required step and floor; A bids 990, then 995.
- **Expected.** Step = |1,050 − 1,000| + 10 = 60 → A must reach 990 or lower; 990 accepted, a later 995 refused. Percentage line: + 1 % × best, rounded up to 2 decimals. A non-English percentage tick = previous target value × tick % / 100, rounded up.
- **Oracle.** `trade_product.rb:187-197, 239-251`; `trade_template_helper.rb:5479-5513`. Default widget for English auction "price", allowed flag default false (`trade_request_model_helper.rb:884-897`).
- **Trace.** P2 · manual · `R-MTR-049-4` `R-MTR-049-5` `R-MTR-049-6` `R-MTR-046-3` · `app/models/trade_product.rb:187-197, 239-251`

#### API-EVRMTR-036 — The price ceiling is checked on the price unless the round names another column
- **Why it matters.** A ceiling checked on the wrong number (price vs landed) lets an over-budget bid through.
- **Setup.** Price round with ceiling 500 and GST and freight widgets; second round whose validation settings name a net-price column.
- **Steps.** A vendor bids price 480 with GST 18 % and freight 30 on each.
- **Expected.** Round 1: accepted (480 ≤ 500). Round 2: checked on 480 + 86.4 + 30 = 596.4 → refused.
- **Oracle.** `validation_widgets_configuration[key].target_column`, default "price"; net-price fallback formula (`trade_request_model_helper.rb:608-638`).
- **Trace.** P1 · manual · `R-MTR-037-6` · `app/models/model_helpers/trade_request_model_helper.rb:608-638`

## 8. Ranking and indicators

#### API-EVRMTR-037 — Vendors are ranked on line price and on the lot gross total unless the round says otherwise
- **Why it matters.** Rank decides L1; a buyer-specific ranking setting must win over the generic one.
- **Setup.** Round A: no ranking setting. Round B: generic ranking widget "landed cost" (a lot widget) only. Round C: buyer line widget set and generic ranking widget set.
- **Steps.** Read each round's ranking widgets.
- **Expected.** A: line "price", lot "gross_total". B: lot ranks on landed cost, line falls back to "price". C: the buyer setting is used. Rounds created on or before 8 May 2024 rank on "price" for both.
- **Oracle.** Stage `ranking_widgets`; `get_ranking_widgets_line_and_lot` (`trade_request.rb:2587-2616`); legacy `ranking_widget_line` in settings (`:1891-1895`, serializer `:128`).
- **Trace.** P1 · automate-later · `R-MTR-037-1` `R-MTR-037-2` `R-MTR-037-3` `R-MTR-037-5` · `app/models/trade_request.rb:2587-2616`

#### API-EVRMTR-038 — Each auction type shows its own default indicators to vendors
- **Why it matters.** Indicators tell a vendor how far it is from winning; a price-based auction must not show rank and a traffic-light auction must show its colour.
- **Setup.** Four auctions: rank, rank with line-by-line closing, price, traffic light; plus a Dutch and a knockout.
- **Steps.** Read each round's indicator settings.
- **Expected.** Rank → rank; rank + line closing → rank and best price on gross total; price → best price on gross total and best price; traffic light → colour and best price on gross total (plus the best-ranking widget when the template has one). Optional indicators are the rest of rank / best price / gross total, each defaulting to off; Dutch and technical rounds offer none (Dutch with projects: rank); knockout offers rank. Traffic-light zones for best-price and rank indicators default to none.
- **Oracle.** `trade_config.other_auction_indicators_config` (`trade_template_serializer.rb:98`); `default_auction_indicator` / `get_possible_other_auction_indicators` (`trade_request_model_helper.rb:698-726, 745-774`); traffic light rank vs price (`:227-233`). Twin EDGE-EVRMTR-038 reads the sandbox round, whose settings block carries the indicators.
- **Trace.** P2 · automate · `R-MTR-036-1` `R-MTR-036-2` `R-MTR-036-3` `R-MTR-036-5` `R-MTR-003-2` `R-MTR-003-3` `R-MTR-003-4` · `app/models/model_helpers/trade_request_model_helper.rb:698-726` · `EDGE-EVRMTR-038`

## 9. Knockout and Dutch auctions

#### API-EVRMTR-039 — Knockout and Dutch auctions refuse multi-product rounds without fast bidding
- **Why it matters.** These strategies work on one price per vendor; publishing a multi-line one without fast bidding would run an auction that cannot rank.
- **Setup.** Company with projects; knockout auction with 2 lines, fast bidding off; second with fast bidding on; Dutch auction made as a plain price round type.
- **Steps.** Publish each.
- **Expected.** Round 1 and the wrong-mode round: refused "You are not allowed to perform this action". Round 2: published.
- **Oracle.** HTTP 422 code 101 (`trade_controller_helper.rb:4552-4556`, `FAST_FILLING_VALID_RFX_MODES`).
- **Trace.** P1 · automate-later · `R-MTR-021-6` · `app/controllers/concerns/trade_controller_helper.rb:4552-4556`

#### API-EVRMTR-040 — Fast-bidding bulk price: a formula missing an input is a clear refusal, not a crash
- **Why it matters.** The bulk price drives the knockout; a vendor who leaves one formula input empty should be told so.
- **Setup.** Knockout auction with fast bidding and a template bulk-price formula `qty * rate`.
- **Steps.** 1. Vendor submits rate and qty → bulk price computed. 2. Vendor submits only rate. 3. A round with no strategy settings stored is read.
- **Expected.** 1: bulk price = qty × rate. 2: refused with a message naming the missing input. 3: read succeeds.
- **Expected (today).** 2: "Missing required formula variables: qty" is raised as an ArgumentError → untyped 500; 3: `.with_indifferent_access` on nil → 500.
- **Oracle.** `trade_request.rb:739-763` (Dentaku, strings → float, raise at `:751-755`); readers `:1635-1669`.
- **Trace.** P1 · manual · `R-MTR-021-1` `R-MTR-021-4` `R-MTR-021-5` `R-MTR-021-7` · `app/models/trade_request.rb:739-763, 1635-1669`

#### API-EVRMTR-041 — Knockout rounds run one at a time in order and remember who took part
- **Why it matters.** Only vendors who took part in earlier rounds may go on; two active rounds with the same number would let a vendor bid twice.
- **Setup.** Knockout auction with 3 rounds; Dutch closing on multiple vendors; Dutch "on total amount" (not on base price).
- **Steps.** Watch the running round at each boundary; vendor A bids in round 1 only; read round 2's eligible vendors.
- **Expected.** Exactly one round is running at any moment (a round is running strictly between its start and end); the next round is the one numbered +1; A is listed as having taken part in round 1. A second active round with the same number is refused ("Round no has already been taken", wording unverified). Dutch closes on several vendors only when closing mode is "multiple"; "on total amount" only when base-price mode is explicitly off.
- **Oracle.** `trade_round.rb:27-45`; next round `trade_request.rb:735-737`; Dutch flags `:1639-1645`.
- **Trace.** P2 · manual · `R-MTR-020-2` `R-MTR-020-3` `R-MTR-020-4` `R-MTR-020-5` `R-MTR-021-2` `R-MTR-021-3` · `app/models/trade_round.rb:27-45`

## 10. Counter offers and bid tags in reports

#### API-EVRMTR-042 — Award and comparison reports pick each vendor's initial, negotiated and best-offer bids correctly
- **Why it matters.** "Initial vs final" and negotiation savings come from these tags; a wrong tag credits savings to the wrong step.
- **Setup.** Price round, QA vendor: bid 1 (normal); buyer counter offer accepted; bid 2; buyer adds a surrogate bid; best-offer revision bid 3; a rejected bid 4.
- **Steps.** Download the award proposal report and the Master QCS for the vendor.
- **Expected.** Initial = bid 1; bid 2 = negotiated (it follows an accepted counter offer); the surrogate after a countered normal bid = pre-negotiated; bid 3 = best offer; bid 4 ignored. A vendor whose only remaining bids are best-offer revisions still gets a report.
- **Expected (today).** Last sentence: a vendor with no normal bid left makes the comparison `>= nil` raise (unverified reachability: needs the normal bid rejected or revoked before a best-offer revision).
- **Oracle.** `trade_request.rb:2731-2830` (tags; latest counter offer by created_at, id desc; rejected/revoked removed `:2769`; `:2787, 2791` compare with `final_normal_bid_id`); used by `awarding_proposal_report_data_model.rb:772`, `mqcs_diff_checker_service.rb:231`.
- **Trace.** P1 · manual · `R-MTR-032-1` `R-MTR-032-2` `R-MTR-032-3` `R-MTR-032-4` `R-MTR-032-5` · `app/models/trade_request.rb:2731-2830`

## 11. Currencies

#### API-EVRMTR-043 — A round without a currency setup shows the rupee symbol; a multi-currency round shows each vendor its own currency
- **Why it matters.** A vendor quoting in the wrong currency is a 80× error on USD.
- **Setup.** Round 1 with no currency configuration. Round 2 multi-currency (base INR, allowed USD with precision 2, no label set); vendor A prefers USD, vendor B has no preference.
- **Steps.** Read both rounds as the buyer and as each vendor.
- **Expected.** Round 1: symbol from the round's default currency symbol, ₹ when unset. Round 2: currency mode "multiple currencies"; A sees USD with precision 2 and the label falling back to the symbol; B gets no preferred currency (base). A round whose currency setup lacks a base currency should be refused when saved, not break every later read (today: NoMethodError, unverified how it can be saved).
- **Oracle.** Stage `currency_configuration`, `currency_preferences`, `default_currency_symbol`, `default_currency_label_type`; `currency_configuration.rb:9-94`; `trade_request.rb:1535-1537, 2638-2644`.
- **Trace.** P1 · automate-later · `R-MTR-051-1` `R-MTR-051-2` `R-MTR-051-3` `R-MTR-051-4` `R-MTR-051-5` `R-MTR-052-1` `R-MTR-052-2` · `app/models/trade_requests/currency_configuration.rb:9-94`

## 12. Savings

#### API-EVRMTR-044 — Realised and unrealised custom savings use different reference amounts
- **Why it matters.** Realised savings are on the awarded quantity, unrealised on the full quantity; today the second overwrite makes both the same number, so one of them is always wrong.
- **Setup.** `gate: show_custom_savings`. Price round, one line of 100 units; vendor A 10/unit, vendor B 9/unit; award 40 units to B.
- **Steps.** Close the round; read the custom savings references (realised, unrealised).
- **Expected.** Realised reference uses the selected 40 units, unrealised the full 100 units (e.g. initial best amount 360 vs 900 for B's price); bid lines that are rejected, draft, inactive, revoked, pending or flagged are not counted.
- **Expected (today).** Both references hold the same value — the value of whichever option was computed last.
- **Oracle.** Stage `misc.custom_savings_configuration` / line meta `custom_savings_configuration`; `update_reference_price` overwrites every reference (`savings_configuration.rb:210-216`, the `reference_price unless …` line is a no-op); options `:73-76`, references `:341-356`.
- **Trace.** P1 · automate-later · `R-MTR-054-1` `R-MTR-054-3` `R-MTR-054-6` · `app/models/savings_configuration.rb:210-216, 341-356`

#### API-EVRMTR-045 — A forward auction's best possible amount should use the highest offers
- **Why it matters.** In a sale the buyer wants the highest price; filling the quantity from the lowest offers understates the achievable amount and the savings.
- **Setup.** Forward (sell) round, one line of 100 units; offers: A 50 units at 10, B 100 units at 12.
- **Steps.** Close; read the line's best possible amount in savings.
- **Expected.** 100 × 12 = 1,200.
- **Expected (today).** The result of `btps.reverse` is thrown away, so the walk takes A first: 50 × 10 + 50 × 12 = 1,100 (assuming the lines arrive in ascending price, as the code comment says).
- **Oracle.** `get_possible_best_bid_amount` (`trade_product.rb:695-711`), used by `savings_configuration.rb:173, 184` and `event_indicators/lot_based.rb:107`. Selected amount = Σ price × quantity of selected lines (`:713-719`).
- **Trace.** P1 · manual · `R-MTR-050-1` `R-MTR-050-2` `R-MTR-050-7` · `app/models/trade_product.rb:695-719`

#### API-EVRMTR-046 — Savings strategies drop references with no value and compute the lot best amount by closing mode
- **Why it matters.** A strategy with no reference price would show 100 % savings; the lot best amount differs for lot-closing and line-closing rounds.
- **Setup.** Lot-based savings with budget set and last purchase price empty; round A closes as a lot, round B line by line with 2 lines (best 10 × 5 and none on line 2).
- **Steps.** Read the savings strategies and best amounts.
- **Expected.** Last purchase price is not offered for lot-based savings; references without a value are not stored. A uses the lot best price; B uses Σ best line price × quantity = 50 (line 2 skipped). A reference is per unit when it is "on price", else an amount. Initial best amount takes each vendor's first bid line. In the auction reports the vendor savings column is "realised price drop" on a buy round and "realised price increase" on a sell round; the buyer performance report's awarded amount is the sum of the selected bids' landed amounts.
- **Oracle.** `savings_configuration.rb:44-46, 55-63, 87-90, 124, 190-207`; `trade_product.rb:721-740`.
- **Trace.** P2 · automate-later · `R-MTR-053-2` `R-MTR-053-3` `R-MTR-053-4` `R-MTR-053-5` `R-MTR-050-3` `R-MTR-055-3` `R-MTR-055-4` · `app/models/savings_configuration.rb:44-207`; `app/models/trade_request.rb:1216-1226, 2710-2712`

#### API-EVRMTR-047 — An apostrophe in a line description should not stop savings from being saved
- **Why it matters.** Line meta data (which holds the buyer's product description) is written with hand-built SQL; "Men's gloves" ends the string early and the save fails, so custom savings or a PR amendment silently never lands.
- **Setup.** `gate: show_custom_savings`. Price round whose line description is "Men's safety gloves"; a QA vendor bid.
- **Steps.** Close the round; after 10 s read the line's custom savings.
- **Expected.** Custom savings present on the line.
- **Expected (today).** The background job fails with a database syntax error and the line has no custom savings (the round-level part, written first, is present). Not reproduced live.
- **Oracle.** Line `meta_data.custom_savings_configuration` missing while stage `misc.custom_savings_configuration` exists; `TradeProduct.update_meta_data` interpolates `'#{meta_data_hash.to_json}'` (`trade_product.rb:305-319`), called by `custom_savings_calculator_worker.rb:31`, `purchase_requests/amendment_service.rb:790, 852`, `lpo/refresh_data_service.rb:193`. Line meta data holds `product_description` (Procol DB SELECT on 198678).
- **Trace.** P1 · manual · `R-MTR-060-2` `R-MTR-060-6` · `app/models/trade_product.rb:305-319`

## 13. Terms, default settings and reads that must not crash

#### API-EVRMTR-048 — Terms stored as old plain text are returned as text with stable ids
- **Why it matters.** Rounds copied from old events carry plain-text terms; the acceptance pop-up must still list them.
- **Setup.** Round copied from an old event with plain-text terms; a new round with structured terms.
- **Steps.** Read both rounds' terms (plain and structured).
- **Expected.** Plain text in both; legacy items get ids "legacy_<round>_<n>".
- **Oracle.** `terms_and_conditions_structurable.rb:18-59`; stage `terms_and_conditions`, `terms_and_conditions_structured`.
- **Trace.** P3 · automate-later · `R-MTR-056-2` · `app/models/concerns/terms_and_conditions_structurable.rb:18-59`

#### API-EVRMTR-049 — A new price round starts with the documented default settings
- **Why it matters.** Defaults decide whether vendors get mails, whether bids can be revoked and how numbers are rounded; a wrong default silently changes every new event.
- **Setup.** New price round on a client with no overrides.
- **Steps.** Read the round's settings.
- **Expected.** Price-increase and price-decrease approvals off; user names hidden; revoke bid allowed (default on); reopen flags unset; new-bid mail, web-bidding mail and select-bid notification off; auto cash discount off; auto-award off; multiple POs per bid off; baseline cost adjustment off; T&A bids not hidden from QCS; unverified-vendor selection allowed (default on); widget precision 2; request layout "json template"; vendor activity type "onboarding"; fast bidding off; English auction off; partial closing: no participant approval, editable widget "participant quantity"; company profile shown only when the round has no settings at all.
- **Oracle.** Stage settings block; defaults at `trade_request_model_helper.rb:10-61, 128-217, 505-510, 884-897, 1084-1086, 1120-1138, 1379-1386`, `trade_request.rb:876-886, 1321-1323, 1500-1509, 2664-2670, 2895-2897, 3002-3009`, `trade_controller_helper.rb:3574-3577`.
- **Trace.** P2 · automate-later · `R-MTR-030-5` `R-MTR-033-3` `R-MTR-043-4` `R-MTR-057-1` `R-MTR-057-2` `R-MTR-057-3` `R-MTR-057-4` `R-MTR-057-6` `R-MTR-058-1` `R-MTR-058-2` `R-MTR-058-3` `R-MTR-058-5` `R-MTR-058-6` · `app/models/model_helpers/trade_request_model_helper.rb:10-61`

#### API-EVRMTR-050 — Reading a round that has no lines, no schedule or no widgets is a clear answer, not a crash
- **Why it matters.** Half-built drafts exist (a round saved before its lines, an imported round without widgets); listing or opening them must not take the page down.
- **Setup.** Draft price round saved with no line items; a round whose widget list for one line type is missing; a book-building line with no threshold.
- **Steps.** Open each round, its summary and its line list; save a line on the round without widgets.
- **Expected.** Each read returns the round with empty values; the line save is accepted or refused with a message.
- **Expected (today).** Product readers on a round with no lines, the summary with no schedule, widget readers and line save with a missing widget list, and the threshold quantity raise → untyped 500 (each path unverified live).
- **Oracle.** `trade_request.rb:459-460, 1053-1061, 1109-1117, 1253-1258, 1295-1308, 1836-1840, 1883-1888`; `trade_product.rb:263-269, 828-835`.
- **Trace.** P2 · manual · `R-MTR-059-1` `R-MTR-059-3` `R-MTR-059-5` `R-MTR-059-7` `R-MTR-047-5` `R-MTR-047-8` · `app/models/trade_request.rb:1053-1061, 1295-1308`

#### API-EVRMTR-051 — A line's unit symbol and formula columns are filled when the line is saved
- **Why it matters.** Vendors read the unit next to the quantity; buyer formula columns (e.g. budget = qty × rate) must be computed before vendors see the line.
- **Setup.** Template with a buyer formula column `qty * target_rate`; line qty 10, target rate 25, unit "KG" with custom symbol.
- **Steps.** Save the line; read it.
- **Expected.** Formula column 250; unit shows the line's own symbol, else the unit's symbol. A formula that cannot be computed leaves the column blank (only logged).
- **Oracle.** `save_formula_values` (`trade_product.rb:93, 828-835`) into `other_details`; `unit_value` (`:114-116`).
- **Trace.** P2 · automate-later · `R-MTR-047-5` `R-MTR-047-7` · `app/models/trade_product.rb:114-116, 828-835`

## 14. Mails and notifications to vendors

#### API-EVRMTR-052 — Invitation, go-live and reminder mails reach exactly the round's audience at the right times
- **Why it matters.** Vendors bid only if they are told; an invited-but-unregistered vendor that never gets the mail is lost competition, and a mail about a draft leaks a plan.
- **Setup.** Needs vendor mailboxes the tester can read (not example.com). Round with `gate: send_web_bidding_mail`, `send_event_live_email_to_vendor` and `send_event_expiry_reminder_to_vendor` (reminder at 80 %), starting 1 h after creation, lasting 10 h. Audience "everyone" with one registered mapped vendor and one invited (not yet registered) vendor; a second round restricted to one vendor; a draft event; a technical round.
- **Steps.** Publish; collect the mails each vendor receives and their times.
- **Expected.** Registered and invited vendors in the audience each get the invitation (custom company template when one exists, else the standard one); the restricted round mails only its listed vendor; vendors with a status outside the allowed list get nothing. Go-live mail 2 min before the start (only because the start is ≥ 30 min after creation); reminder at start + 8 h. Times in the vendor's mail time zone (default India), format like "Oct 04, 2026 03:30 PM IST". A draft event, a lot price round and a technical round send no invitation mail; the WhatsApp alert goes 1 h before the start. Managers' "starting soon" alert is not sent for a start already less than 15 min away.
- **Expected (today).** For "everyone" / "everyone except" audiences, invited vendors are filtered as if their invitation ids were company ids, so the invited vendor is likely missed (unverified live).
- **Oracle.** Mailbox contents and timestamps. `send_web_bidding_mail` (`trade_request.rb:2332-2371`); recipients `:1413-1437, 1476-1480`; times `:843-864`, `company.rb:1075-1090`; creation notifications `:1935-1975`; WhatsApp `:2312-2320`; managers' alert `:2236`; approval-completion pushes `:1943-1951`; RFI/RFP evaluation reminder end − 1 day or end − duration/4 (`trade_request_model_helper.rb:982-988`).
- **Trace.** P1 · manual · `R-MTR-026-1` `R-MTR-026-2` `R-MTR-026-3` `R-MTR-026-4` `R-MTR-026-5` `R-MTR-026-6` `R-MTR-026-7` `R-MTR-023-1` `R-MTR-023-2` `R-MTR-023-3` `R-MTR-023-5` `R-MTR-023-6` `R-MTR-024-6` `R-MTR-022-6` `R-MTR-044-5` `R-MTR-005-2` · `app/models/trade_request.rb:2332-2371, 1476-1480`
