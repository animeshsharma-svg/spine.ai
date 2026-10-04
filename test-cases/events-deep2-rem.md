# Reminders a buyer sends from an event — who is pending, sending the reminder, and what the server does not check

Deep cases for the "Send Reminders" drawer on a live event: the list of people still owing an action
(`GET /reminders/:id?resource_type=event_group`, `reminders#index`) and the send itself
(`POST /reminders/:id/send_reminder`, `reminders#send_reminder`), routes `config/routes.rb:898-901`. The list is built by
`Reminders::EventGroupService#get_reminder_data` from seven strategies — offer submissions (invited vendors who have not
bid while bidding is open), pending evaluations (evaluators of the first technical stage), counter offers, best-offer
submissions, cost-breakdown submissions, approvals and auction reminders (before an auction starts). The send stores one
`Reminder` row per recipient (a 10-minute "Retry in 10 mins" lock is computed from it) and queues `ReminderWorker`, which
emails every active user of each vendor company (or the named user for evaluations and approvals). Every case is grounded
in `procol-backend` at `origin/main` (backend paths below are relative to that repo) or in `procol-client-dashboard` for
the UI cases.

**What is runnable and how.** Cases whose Trace names an `EVD2-REM-NNN` id have a twin in
`prototype/data/deep2-cases/rem.json`. Every twin goes through the DIRECT runner (path `/reminders/…`): one fresh event
per recipe (`none`, `draft_rfq`, `published_rfq`, `rfq_with_bid`, `closed_rfq_with_bid`) is shared by all twins of that
recipe and each twin's single request is sent once as the QA buyer. So every twin is either a read (the list) or a send
that the code refuses, crashes on, or returns from BEFORE it writes a `Reminder` row (`base_service.rb:54`) or queues an
email (`event_group_service.rb:69`) — each such case cites the line that stops it first. The direct runner only checks the
HTTP status, so the list contents per state are written in Expected and Oracle for a person (or a later verify) to read.
`Z2dnWmdaUWtnZw==` decodes to id 999999999 (no such row); `WrongUuid1=` decodes to nil; the path `:id` is decoded by
`ParamsAuth#check_for_uuid` (`app/controllers/concerns/params_auth.rb:57-68`).

**Deliberately manual.** Every send that would really go out (the happy paths, the 10-minute lock, every "the server does
not check X" defect) writes `Reminder` rows and emails people, so it is manual and must only ever name QA vendors 1/2 and
the QA buyer. The vendor app may not call either action (`aac.mjs reminders index send_reminder` → vendor app NOT
ALLOWED): a vendor token is answered 401 and that session is signed out, so vendor cases are manual. Cases that need a
second buyer, an RFP sent to evaluation, a counter offer, a best-offer or cost-breakdown window, an approval or an auction
that has not started are manual because no recipe builds those states.

## 1. The pending list per event state — `GET /reminders/:id?resource_type=event_group`

#### API-EVDREM-001 — A live RFQ with no bids lists the invited vendor under "Offer submissions"
- **Why it matters.** This is the drawer's main use: chase vendors who have not quoted while bidding is still open. If the list is empty here, the feature is dead.
- **Setup.** A published RFQ, QA vendor 1 invited, bidding open, no bids (recipe `published_rfq`). Read only.
- **Steps.** `GET /reminders/{{eventGroupUuid}}?resource_type=event_group` as the event's buyer.
- **Expected.** The list answers with one entry per reminder kind. "Offer submissions" holds exactly one vendor — QA vendor 1 — with the RFQ round's title under "Bid Pending For", no last-reminded time, and remindable. Kinds with nobody pending (pending evaluations, counter offers, best offer, cost breakdown, auction reminders) come back empty (null). HTTP 200.
- **Oracle.** 200; `offer_submissions.total_count` = 1; `offer_submissions.recipients[0]` has `recipient_uuid` = QA vendor 1's company uuid, `uuids` = [the RFQ round's uuid], `bid_pending_for` = [round title], `last_reminded_at` null, `can_remind` true; `offer_submissions.columns` = Vendor Name / Bid Pending For / Last Reminded At; `pending_evaluations`, `counter_offers`, `best_offer_submissions`, `cost_break_down_submissions`, `auction_reminders` null. `approvals` is null unless the company has a pending approval on this event.
- **Trace.** P0 · automate · `EVD2-REM-001` · `app/services/reminders/event_group_service.rb:10-31` · `app/services/reminders/strategies/offer_submissions.rb:6-24` · `app/services/reminders/strategies/base_strategy.rb:12-35`

#### API-EVDREM-002 — Once the vendor submits a bid it drops out of the offer-submission list
- **Why it matters.** Reminding a vendor who already quoted is noise and makes the buyer look careless; the list must subtract vendors who have bid.
- **Setup.** Live RFQ, QA vendor 1 has SUBMITTED a bid, bidding still open (recipe `rfq_with_bid`). Read only.
- **Steps.** `GET /reminders/{{eventGroupUuid}}?resource_type=event_group`.
- **Expected.** QA vendor 1 is no longer pending, so "Offer submissions" is empty (null); nothing else is pending. HTTP 200.
- **Oracle.** 200; `offer_submissions` null (vendor 1 is in the round's `bid_company_ids`, added when the bid became active, `app/models/bid.rb:507-508`). If `offer_submissions` still lists vendor 1, the subtraction is broken.
- **Trace.** P1 · automate · `EVD2-REM-002` · `app/services/reminders/strategies/offer_submissions.rb:14-18` · `app/models/trade_request.rb:2470-2472`

#### API-EVDREM-003 — After the round has fully closed there is nothing left to remind
- **Why it matters.** Only rounds whose closing time is still in the future are considered; a closed event must not offer "submit your offer" reminders.
- **Setup.** QA vendor 1 bid, bidding window and extra closing time over (recipe `closed_rfq_with_bid`). Read only.
- **Steps.** `GET /reminders/{{eventGroupUuid}}?resource_type=event_group`.
- **Expected.** No open round is left, so the reply body is empty (`null`) and the drawer shows "No Pending Actions to Remind". HTTP 200.
- **Oracle.** 200 with body `null` (`get_reminder_data` returns nil when no round has `closed_at` in the future). Never a 5xx.
- **Trace.** P1 · automate · `EVD2-REM-003` · `app/services/reminders/event_group_service.rb:14-15` · `app/controllers/api/reminders_controller.rb:9-11`

#### API-EVDREM-004 — A draft event has nothing to remind
- **Why it matters.** The reminder service only looks at published (active) events; a draft must answer cleanly, not crash on rounds that have no schedule yet.
- **Setup.** Draft event with an unpublished RFQ round (recipe `draft_rfq`), the caller is its owner. Read only.
- **Steps.** `GET /reminders/{{eventGroupUuid}}?resource_type=event_group`.
- **Expected.** The owner passes the view check, but the service finds no live event and answers an empty body (`null`). HTTP 200.
- **Oracle.** 200 with body `null`. `EventGroup.active.find_by` skips drafts (`status` enum `active: 1, draft: 2`).
- **Trace.** P2 · automate · `EVD2-REM-004` · `app/services/reminders/event_group_service.rb:6,11` · `app/models/event_group.rb:85`

#### API-EVDREM-005 — With two invited vendors and one bid, only the vendor who has not bid is listed
- **Why it matters.** The subtraction must be per vendor, not "anyone bid → nobody pending".
- **Setup.** Live RFQ with QA vendors 1 and 2 invited; only QA vendor 2 has submitted. No recipe leaves exactly one of two vendors without a bid for the direct runner, so manual.
- **Steps.** `GET /reminders/:eventUuid?resource_type=event_group`.
- **Expected.** "Offer submissions" lists QA vendor 1 only, total 1.
- **Oracle.** `offer_submissions.total_count` = 1 and the one `recipient_uuid` is vendor 1's company uuid.
- **Trace.** P1 · manual · `app/services/reminders/strategies/offer_submissions.rb:9-20`

#### API-EVDREM-006 — A vendor removed from the event (or hidden from it) is not listed
- **Why it matters.** Only active, visible invitations count; reminding a vendor the buyer removed would tell them about an event they were dropped from.
- **Setup.** Live RFQ, QA vendors 1 and 2 invited; remove QA vendor 2 (its audience becomes inactive). Changes the event — manual.
- **Steps.** 1. Remove QA vendor 2. 2. `GET /reminders/:eventUuid?resource_type=event_group`.
- **Expected.** Only QA vendor 1 is pending under "Offer submissions".
- **Oracle.** No recipient with vendor 2's company uuid.
- **Trace.** P1 · manual · `app/services/reminders/strategies/offer_submissions.rb:10-12`

#### API-EVDREM-007 — Pending evaluations appear only for the first technical stage, and only until its evaluation end time
- **Why it matters.** Evaluator reminders are driven by the technical round's closing time, which "send to evaluation" moves to the evaluation end time. After that time — or for a second technical stage — evaluators can no longer be chased from this drawer.
- **Setup.** Live RFP+RFQ; QA vendor 1 submitted the technical response; the RFP was sent to evaluation with an end time in the future; an evaluator assigned who has not scored. Manual (needs the evaluation set-up).
- **Steps.** 1. `GET /reminders/:eventUuid?resource_type=event_group` while the evaluation window is open. 2. Repeat after the evaluation end time.
- **Expected.** 1: "Pending evaluations" lists the evaluator (columns Evaluator Name / Last Reminded At), `bid_pending_for` holds the technical stage title. 2: the kind is gone (the RFP's closing time has passed). With two technical stages only the first one still open is ever considered.
- **Oracle.** Step 1 `pending_evaluations.recipients[0].recipient_uuid` = the evaluator's user uuid; step 2 `pending_evaluations` null.
- **Trace.** P1 · manual · `app/services/reminders/event_group_service.rb:14,19` · `app/services/reminders/strategies/pending_evaluations.rb:6-17` · `app/controllers/concerns/trade_controller_helper.rb:2084-2086`

#### API-EVDREM-008 — An evaluator who has finished drops out; a re-evaluation request brings them back
- **Why it matters.** The list should chase only evaluators who still owe a score, including those asked to re-evaluate.
- **Setup.** As API-EVDREM-007, one evaluator. Manual.
- **Steps.** 1. Evaluator scores every response; read the list. 2. Buyer requests re-evaluation; read the list again.
- **Expected.** 1: "Pending evaluations" empty. 2: the evaluator is listed again.
- **Oracle.** `pending_evaluations` null after step 1, one recipient after step 2.
- **Trace.** P2 · manual · `app/services/reminders/strategies/pending_evaluations.rb:10-13`

#### API-EVDREM-009 — Counter offers are listed only while the round's closing time is still ahead
- **Why it matters.** A counter offer is usually raised in negotiation after bidding closes; the list only looks at rounds whose closing time is in the future, so vendors sitting on a counter offer for a fully closed round may never be listed.
- **Setup.** RFQ where the buyer sent QA vendor 1 a counter offer (bid in "requested" with `additional_request_type` `counter_offer_for_bid`). Read the list (a) while the round's closing time is ahead and (b) after it. Manual.
- **Steps.** `GET /reminders/:eventUuid?resource_type=event_group` at (a) and (b).
- **Expected.** (a) "Counter offers" lists QA vendor 1 with the round title. (b) Should still list the vendor while the counter offer is unanswered; today the round is filtered out once `closed_at` has passed — confirm whether counter offers extend `closed_at`; if not, record it as a gap.
- **Oracle.** `counter_offers.recipients` at (a) and (b).
- **Trace.** P2 · manual · `app/services/reminders/event_group_service.rb:14,23` · `app/services/reminders/strategies/counter_offers.rb:9-14` · `app/models/bid.rb:1887-1889`

#### API-EVDREM-010 — Best-offer reminders list vendors asked for a best price who have not revised yet
- **Why it matters.** Only the vendors the buyer asked, and only those who have not yet sent a best-offer revision, should be chased, and only while the best-offer window is open.
- **Setup.** Closed RFQ with bids from QA vendors 1 and 2; buyer requested best price from both; QA vendor 2 submitted its best offer. Manual.
- **Steps.** Read the list during the best-offer window, then after it ends.
- **Expected.** During: "Best offer submissions" lists QA vendor 1 only. After: empty.
- **Oracle.** `best_offer_submissions.recipients` = [vendor 1]; null after the window.
- **Trace.** P2 · manual · `app/services/reminders/strategies/best_offer_submissions.rb:9-17` · `app/models/trade_request.rb:986-991`

#### API-EVDREM-011 — Cost-breakdown reminders list vendors with a quick bid during the cost-breakdown window
- **Why it matters.** Vendors who submitted a total-only (fast) bid must be chased for the item breakdown only while that window is open.
- **Setup.** An auction with a cost-breakdown request window open; QA vendor 1's active bid is a fast bid. Manual.
- **Steps.** Read the list inside and after the window.
- **Expected.** Inside: "Cost breakdown submissions" lists QA vendor 1. After: empty.
- **Oracle.** `cost_break_down_submissions.recipients`.
- **Trace.** P2 · manual · `app/services/reminders/strategies/cost_break_down_submissions.rb:9-14` · `app/models/trade_request.rb:979-984`

#### API-EVDREM-012 — Approval reminders list the pending approvers of the current step only
- **Why it matters.** Approvers of later steps or who already acted must not be chased.
- **Setup.** An event with a pending approval request (two steps), step 1 approver pending. Manual.
- **Steps.** Read the list; then approve step 1 and read again.
- **Expected.** First read: "Approvals" lists the step-1 approver (columns Approver Name / Last Reminded At). Second read: the step-2 approver instead.
- **Oracle.** `approvals.recipients[*].recipient_uuid`.
- **Trace.** P2 · manual · `app/services/reminders/strategies/approvals.rb:9-20`

#### API-EVDREM-013 — Auction reminders appear only before the auction starts, one entry per live lot
- **Why it matters.** The auction reminder is "please join the auction"; it is offered only for an active auction that has not started, the latest auction stage per active lot, with the lot title.
- **Setup.** An auction scheduled to start later, QA vendor 1 invited; optionally a lot-split event with two lots. Manual (no auction recipe).
- **Steps.** Read the list before the start, then after the auction starts.
- **Expected.** Before: "Auction reminders" is a list with one entry per auction (per active lot, carrying `lot_title`), each listing the invited vendors. After start: gone.
- **Oracle.** `auction_reminders` is an array; each item has `recipients`, `columns` (Vendor Name / Last Reminded At) and `lot_title`.
- **Trace.** P1 · manual · `app/services/reminders/event_group_service.rb:93-110` · `app/services/reminders/strategies/auction_reminders.rb:6-37`

#### API-EVDREM-014 — A withdrawn event lists nothing
- **Why it matters.** A withdrawn event must not let the buyer chase vendors.
- **Setup.** A withdrawn event of the QA buyer. Manual (no withdrawn recipe for the direct runner).
- **Steps.** `GET /reminders/:eventUuid?resource_type=event_group`.
- **Expected.** HTTP 200 with an empty body (`null`) — the view check passes on the withdrawn stages, the service ignores non-active events.
- **Oracle.** Body `null`.
- **Trace.** P2 · manual · `app/services/reminders/event_group_service.rb:6,11` · `app/policies/event_group_policy.rb:52-54`

## 2. Who may read the list

#### API-EVDREM-015 — The vendor app may not read a buyer's reminder list
- **Why it matters.** The list names every vendor still pending on the event — competitor names a vendor must never see.
- **Setup.** QA vendor 1 signed in to the vendor app. Manual: the backend answers a vendor-app call to this action with 401 and signs that session out, so it can never be a runnable twin.
- **Steps.** As the vendor, `GET /reminders/:eventUuid?resource_type=event_group`.
- **Expected.** Refused as an unauthorised app; no data. HTTP 401.
- **Oracle.** 401, no `offer_submissions` in the body.
- **Trace.** P1 · manual · app-access map (vendor app NOT ALLOWED for `reminders#index`) · `app/controllers/concerns/api_auth.rb:11-14`

#### API-EVDREM-016 — A buyer from another company cannot read the list
- **Why it matters.** Vendor names and pending status of a competitor's tender.
- **Setup.** A buyer of Demo Account 2 and an event of PROCOL DEMO. Manual (needs a second company's buyer).
- **Steps.** As that buyer, `GET /reminders/:eventUuid?resource_type=event_group`.
- **Expected.** Refused. HTTP 422, code 455 'You are not authorized to perform this action'.
- **Oracle.** 422 code 455.
- **Trace.** P1 · manual · `app/controllers/api/reminders_controller.rb:6,48-53` · `app/policies/event_group_policy.rb:52-54` · `app/controllers/concerns/api_auth.rb:16,117-119`

#### API-EVDREM-017 — A colleague who cannot see any stage of the event cannot read the list
- **Why it matters.** Viewing requires at least one stage the user may see (team / sharing rules).
- **Setup.** A second PROCOL DEMO buyer with read permission but no team or share on the event. Manual.
- **Steps.** As that buyer, `GET /reminders/:eventUuid?resource_type=event_group`.
- **Expected.** HTTP 422, code 455 'You are not authorized to perform this action'.
- **Oracle.** 422 code 455.
- **Trace.** P2 · manual · `app/policies/event_group_policy.rb:52-54` · `app/models/event_group.rb:511-525`

#### API-EVDREM-018 — A read-only buyer can open the list
- **Why it matters.** Reading needs only the read permission on events; a read-only user should see who is pending (sending is a separate permission, API-EVDREM-036).
- **Setup.** A buyer with trade read but no create permission, on the event's team. Manual.
- **Steps.** `GET /reminders/:eventUuid?resource_type=event_group`.
- **Expected.** HTTP 200 with the same lists the owner sees.
- **Oracle.** 200; same `offer_submissions` as the owner's read.
- **Trace.** P2 · manual · `app/policies/event_group_policy.rb:52-54`

## 3. Bad input to the list

#### API-EVDREM-019 — Reading reminders for an event that does not exist crashes instead of "not found"
- **Why it matters.** An unknown event id reaches the permission check as "nothing", which the permission library cannot handle; only "not authorised" errors are caught, so the user gets a server error.
- **Setup.** Any signed-in buyer; no event needed (recipe `none`).
- **Steps.** `GET /reminders/Z2dnWmdaUWtnZw==?resource_type=event_group` (decodes to id 999999999).
- **Expected.** Should be refused cleanly (404 or 422 "does not exist"). Today the lookup returns nil and `authorize(nil, :show?)` raises `Pundit::NotDefinedError`, which is not rescued → HTTP 500.
- **Oracle.** Any 5xx is the defect; a 4xx with a readable message is the fix.
- **Trace.** P1 · automate · `EVD2-REM-019` · `app/controllers/api/reminders_controller.rb:51-52` · `app/controllers/concerns/api_auth.rb:16`

#### API-EVDREM-020 — A garbled event id also crashes
- **Why it matters.** Same unguarded path with an id that decodes to nothing — the most common shape of a bad link.
- **Setup.** Any buyer (recipe `none`).
- **Steps.** `GET /reminders/WrongUuid1=?resource_type=event_group`.
- **Expected.** Should be a clean 4xx. Today `EventGroup.find_by(id: nil)` → nil → `authorize(nil, …)` → `Pundit::NotDefinedError` → HTTP 500.
- **Oracle.** 5xx = defect.
- **Trace.** P2 · automate · `EVD2-REM-020` · `app/controllers/concerns/params_auth.rb:61-62` · `app/controllers/api/reminders_controller.rb:51-52`

#### API-EVDREM-021 — An unknown resource type skips every permission check and reports an error as success
- **Why it matters.** With any type other than `event_group` the controller neither authorises nor looks anything up, and answers 200 with an error message — a caller (or monitoring) reading the status sees success.
- **Setup.** The live RFQ (recipe `published_rfq`). Read only.
- **Steps.** `GET /reminders/{{eventGroupUuid}}?resource_type=trade_request`.
- **Expected (today).** HTTP 200 with body `{"error": "Reminders does not exist"}` and no permission check at all. Should be a 422 (unsupported resource type).
- **Oracle.** 200 + that error text = today's behaviour (suspected defect: an error with a success status); a 5xx would be a new defect.
- **Trace.** P2 · automate · `EVD2-REM-021` · `app/controllers/api/reminders_controller.rb:6-11,35-53`

#### API-EVDREM-022 — A missing resource type behaves the same way
- **Why it matters.** The dashboard always sends the type; a client that forgets it should get a parameter error, not a 200.
- **Setup.** Recipe `published_rfq`.
- **Steps.** `GET /reminders/{{eventGroupUuid}}` (no query).
- **Expected (today).** HTTP 200, `{"error": "Reminders does not exist"}`. Should be 422 code 2 'Insufficient parameters'.
- **Oracle.** 200 + error text today.
- **Trace.** P2 · automate · `EVD2-REM-022` · `app/controllers/api/reminders_controller.rb:4,9,36`

#### API-EVDREM-023 — The resource type is case-sensitive
- **Why it matters.** "EVENT_GROUP" is not recognised and silently gets the same 200-with-error answer, with no authorisation.
- **Setup.** Recipe `published_rfq`.
- **Steps.** `GET /reminders/{{eventGroupUuid}}?resource_type=EVENT_GROUP`.
- **Expected (today).** HTTP 200, `{"error": "Reminders does not exist"}`.
- **Oracle.** 200 + error text.
- **Trace.** P2 · automate · `EVD2-REM-023` · `app/controllers/api/reminders_controller.rb:36,49`

#### API-EVDREM-024 — A resource type sent as a list crashes the list
- **Why it matters.** `resource_type[]=…` makes the type an array, and the controller calls `to_sym` on it before anything else — an unguarded crash any client can trigger.
- **Setup.** Recipe `published_rfq`. Read only (the crash happens before any lookup).
- **Steps.** `GET /reminders/{{eventGroupUuid}}?resource_type[]=event_group`.
- **Expected.** Should be a clean 422. Today `Array#to_sym` raises `NoMethodError` → HTTP 500.
- **Oracle.** 5xx = defect.
- **Trace.** P2 · automate · `EVD2-REM-024` · `app/controllers/api/reminders_controller.rb:4,6,49`

## 4. Sending a reminder — happy paths and read-backs (all manual: they email)

#### API-EVDREM-025 — Sending an offer-submission reminder to QA vendor 1
- **Why it matters.** The core action: the vendor gets an email asking them to submit before the deadline, and the buyer gets a confirmation.
- **Setup.** Live RFQ, QA vendor 1 invited, no bid; list read first (API-EVDREM-001). Manual: writes a reminder row and emails the QA vendor's users.
- **Steps.** `POST /reminders/:eventUuid/send_reminder` with `{"resource_type": "event_group", "reminder_type": "offer_submissions", "reminders": {"<vendor 1 company uuid>": ["<RFQ round uuid>"]}}` (exactly what the drawer sends).
- **Expected.** HTTP 200 `{"success": true, "message": "Reminders sent successfully.", "recipients_count": 1, "type": "offer_submissions"}`. QA vendor 1's users get an email titled "[<event ref>] [Reminder] Submit Your Offer Before the Deadline." naming the round and its end time.
- **Oracle.** Response as above; one `reminders` row (category `OfferSubmission`, recipient `c-<vendor 1 id>`, `reminder_type` manual, channel email); the QA vendor mailbox.
- **Trace.** P0 · manual · `app/services/reminders/event_group_service.rb:34-71` · `app/services/reminders/base_service.rb:33-64` · `app/workers/reminder_worker.rb:8-61,64-67`

#### API-EVDREM-026 — After sending, the list shows when the vendor was last reminded and locks them for 10 minutes
- **Why it matters.** The lock is what stops a buyer spamming a vendor from the drawer.
- **Setup.** Right after API-EVDREM-025. Manual.
- **Steps.** `GET /reminders/:eventUuid?resource_type=event_group`.
- **Expected.** QA vendor 1 is still pending under "Offer submissions" with "Last Reminded At" set to the send time (format like "3 Oct 2026, 4:05 PM") and not remindable.
- **Oracle.** `last_reminded_at` non-null, `can_remind` false.
- **Trace.** P1 · manual · `app/services/reminders/event_group_service.rb:112-134` · `app/services/reminders/strategies/base_strategy.rb:14-23` · `app/models/reminder.rb:28-30`

#### API-EVDREM-027 — The lock lifts after 10 minutes
- **Why it matters.** The boundary is "more than 10 minutes since the last reminder"; an off-by-one or a timezone slip would lock vendors for hours.
- **Setup.** After API-EVDREM-025. Manual.
- **Steps.** Read the list at 9 minutes and at 11 minutes after the send.
- **Expected.** At 9 min `can_remind` false; at 11 min true, with the same last-reminded time.
- **Oracle.** `can_remind` flips between the two reads.
- **Trace.** P2 · manual · `app/models/reminder.rb:28-30`

#### API-EVDREM-028 — The lock is per vendor and per kind of reminder, across all rounds
- **Why it matters.** The last-reminded time is stored per vendor per kind, not per round: reminding QA vendor 1 about the technical round also locks the reminder about the commercial round for 10 minutes, while a best-offer reminder stays available.
- **Setup.** Live RFP+RFQ with both rounds open, QA vendor 1 pending on both. Manual.
- **Steps.** Send an offer-submission reminder naming only the RFP round; read the list.
- **Expected.** QA vendor 1's single offer-submission row (which lists both rounds under "Bid Pending For") is locked.
- **Oracle.** One recipient row with two `uuids`, `can_remind` false.
- **Trace.** P2 · manual · `app/services/reminders/event_group_service.rb:117-131` · `app/services/reminders/strategies/base_strategy.rb:17-26`

#### API-EVDREM-029 — Every active user of the vendor company receives the reminder
- **Why it matters.** The worker emails all active users of the vendor company, not only the contact who was invited; with large supplier companies that is a lot of people.
- **Setup.** QA vendor 1 company with two active users. Manual.
- **Steps.** Send as in API-EVDREM-025.
- **Expected.** Both QA vendor users receive the email (confirm this is the intended audience).
- **Oracle.** Two mails, one per active user with an email address.
- **Trace.** P2 · manual · `app/workers/reminder_worker.rb:21-34`

#### API-EVDREM-030 — Sending an auction reminder before the auction starts
- **Why it matters.** Auction reminders use their own email and also leave an activity-log entry on the auction stage.
- **Setup.** An auction not yet started, QA vendor 1 invited. Manual.
- **Steps.** `POST /reminders/:eventUuid/send_reminder` with `reminder_type` `auction_reminders` and the vendor → auction stage map from the list.
- **Expected.** 200 success, `type` `auction_reminders`; the vendor gets the auction reminder email; the stage's activity log shows a reminder entry; re-reading the list shows the vendor locked for that auction only.
- **Oracle.** Reminder row category `AuctionReminder` with `meta_data.trade_id` = the auction stage id; activity entry category `AuctionReminder`.
- **Trace.** P1 · manual · `app/services/reminders/event_group_service.rb:60-70,78-91` · `app/workers/reminder_worker.rb:37-40`

#### API-EVDREM-031 — Sending a pending-evaluation reminder to an evaluator
- **Why it matters.** For evaluations and approvals the recipient is a person, not a company; the stored identifier switches to `u-<user id>`.
- **Setup.** As API-EVDREM-007, a QA buyer-side evaluator. Manual.
- **Steps.** Send `reminder_type` `pending_evaluations` with the evaluator's uuid → [RFP uuid].
- **Expected.** 200 success; the evaluator gets "[<ref>] [Reminder] Technical Requires Your Evaluation."; the list then shows the evaluator locked.
- **Oracle.** Reminder row recipient `u-<evaluator id>`, category `PendingEvaluation`.
- **Trace.** P1 · manual · `app/services/reminders/base_service.rb:23-31` · `app/workers/reminder_worker.rb:17-19,72-73`

#### API-EVDREM-032 — Sending an approval reminder
- **Why it matters.** The approval reminder names who asked for the approval; the subject carries the initiator's name.
- **Setup.** As API-EVDREM-012. Manual.
- **Steps.** Send `reminder_type` `approvals` with approver uuid → [approval request uuid].
- **Expected.** 200 success; approver gets "[<ref>] | <initiator> Requires Your approval".
- **Oracle.** Reminder row category `Approval`, recipient `u-<approver id>`.
- **Trace.** P2 · manual · `app/services/reminders/event_group_service.rb:44-45,137-143` · `app/workers/reminder_worker.rb:76-77`

#### API-EVDREM-033 — Counter-offer, best-offer and cost-breakdown reminders carry the right subject
- **Why it matters.** Each kind has its own subject; a wrong one tells the vendor to do the wrong thing.
- **Setup.** States from API-EVDREM-009/010/011. Manual.
- **Steps.** Send each kind to QA vendor 1.
- **Expected.** Counter offer: "[<ref>] | Action required: Counter Offer Sent by <buyer company>." Best offer: "[<ref>] [Reminder] Submit Your Best Offer Before the Deadline." Cost breakdown: "[<ref>] [Reminder] Submit Your Best Item Cost Breakdown."
- **Oracle.** The three mail subjects.
- **Trace.** P2 · manual · `app/workers/reminder_worker.rb:64-80`

## 5. Who may send

#### API-EVDREM-034 — The vendor app may not send reminders
- **Why it matters.** A vendor triggering emails to other vendors from the buyer's account would be abuse.
- **Setup.** QA vendor 1 in the vendor app. Manual: a 401 here signs the vendor session out.
- **Steps.** As the vendor, `POST /reminders/:eventUuid/send_reminder` with a valid body.
- **Expected.** HTTP 401; nothing sent, no reminder row.
- **Oracle.** 401; reminder count unchanged.
- **Trace.** P1 · manual · app-access map (vendor app NOT ALLOWED for `reminders#send_reminder`) · `app/controllers/concerns/api_auth.rb:11-14`

#### API-EVDREM-035 — A buyer from another company cannot send reminders on this event
- **Why it matters.** Sending requires the event's company to be one of the caller's companies.
- **Setup.** Demo Account 2 buyer; PROCOL DEMO event. Manual.
- **Steps.** `POST /reminders/:eventUuid/send_reminder` with a valid body.
- **Expected.** HTTP 422, code 455 'You are not authorized to perform this action'; nothing sent.
- **Oracle.** 422 code 455; no reminder row.
- **Trace.** P1 · manual · `app/controllers/api/reminders_controller.rb:23` · `app/policies/event_group_policy.rb:37-40`

#### API-EVDREM-036 — A read-only buyer cannot send reminders
- **Why it matters.** Sending needs the create permission on events; the drawer still offers the button (UI-EVDREM-063).
- **Setup.** Same-company buyer with read but not create permission. Manual.
- **Steps.** Send a valid offer-submission reminder.
- **Expected.** HTTP 422, code 455 'You are not authorized to perform this action'.
- **Oracle.** 422 code 455; no reminder row.
- **Trace.** P2 · manual · `app/policies/event_group_policy.rb:37-40`

#### API-EVDREM-037 — A colleague who cannot see the event can still send reminders for it
- **Why it matters.** Reading the list requires seeing a stage of the event, but sending only checks "same company + create permission". Anyone in the company can spam an event's vendors they are not allowed to look at.
- **Setup.** Second PROCOL DEMO buyer with create permission, not on the event's team (read refused, API-EVDREM-017). Manual: it emails QA vendor 1.
- **Steps.** As that buyer, send an offer-submission reminder for QA vendor 1 on the QA buyer's event.
- **Expected.** Should be refused (455) like the read. Today: 200 "Reminders sent successfully." (suspected missing authorisation).
- **Oracle.** 200 + a reminder row with `sender_id` = the colleague.
- **Trace.** P1 · manual · `app/policies/event_group_policy.rb:37-40` vs `:52-54`

## 6. What the send does not check (suspected defects, all manual)

#### API-EVDREM-038 — The 10-minute lock exists only in the screen; the API sends again immediately
- **Why it matters.** `can_remind` is computed for the list but never checked by the send; a double click, a script or a second tab mails the vendor again.
- **Setup.** Right after API-EVDREM-025. Manual (emails QA vendor 1 twice).
- **Steps.** Send the same offer-submission reminder again within a minute.
- **Expected.** Should be refused ("retry in 10 minutes"). Today: 200 success and a second email.
- **Oracle.** Two reminder rows minutes apart; two emails.
- **Trace.** P1 · manual · `app/services/reminders/event_group_service.rb:34-71` (no `can_remind?` call) · `app/models/reminder.rb:28-30`

#### API-EVDREM-039 — Rounds from a different event are accepted in the reminder map
- **Why it matters.** The round ids are looked up across the whole database (`TradeRequest.where(id: …)`), never limited to this event. A buyer can send, from their own event, an email that carries another event's round title and end time — including another company's.
- **Setup.** Two QA-buyer events A and B, QA vendor 1 invited to A. Manual (emails). Use only the QA buyer's own events.
- **Steps.** On event A, send `offer_submissions` with `{"<vendor 1 uuid>": ["<round uuid of event B>"]}`.
- **Expected.** Should be refused (round not part of this event). Today: 200 success; vendor 1 gets a reminder for event A whose body names event B's round and end time.
- **Oracle.** Email content shows B's round title; reminder row on A.
- **Trace.** P0 · manual · `app/services/reminders/event_group_service.rb:40-48` · `app/workers/reminder_worker.rb:30-36`

#### API-EVDREM-040 — A vendor who is not invited still gets the reminder
- **Why it matters.** The recipient companies are never checked against the event's invitations, so any company id can be mailed details of the event (reference, round title, end time).
- **Setup.** Live RFQ with QA vendor 1 invited; QA vendor 2 NOT invited. Manual (emails QA vendor 2).
- **Steps.** Send `offer_submissions` with `{"<vendor 2 company uuid>": ["<RFQ round uuid>"]}`.
- **Expected.** Should be refused (vendor not on the event). Today: 200 and QA vendor 2's users receive the reminder.
- **Oracle.** QA vendor 2 mailbox; reminder row `c-<vendor 2 id>`.
- **Trace.** P0 · manual · `app/services/reminders/event_group_service.rb:37-58` · `app/workers/reminder_worker.rb:21-27`

#### API-EVDREM-041 — A vendor who already bid can still be told to "submit your offer"
- **Why it matters.** The send does not re-check that the vendor is still pending.
- **Setup.** Live RFQ where QA vendor 1 has submitted. Manual.
- **Steps.** Send `offer_submissions` for vendor 1 and the RFQ round.
- **Expected.** Should be refused or skipped. Today: 200 and the vendor is emailed.
- **Oracle.** Email received; `recipients_count` 1.
- **Trace.** P2 · manual · `app/services/reminders/event_group_service.rb:34-71`

#### API-EVDREM-042 — A reminder for a round whose deadline has passed is still sent
- **Why it matters.** "Submit before the deadline" with a deadline in the past confuses vendors.
- **Setup.** Closed RFQ, QA vendor 1 invited without a bid. Manual.
- **Steps.** Send `offer_submissions` for vendor 1 and the closed round.
- **Expected.** Should be refused. Today: 200 and the email shows the past end time.
- **Oracle.** Email body end time earlier than the send time.
- **Trace.** P2 · manual · `app/services/reminders/event_group_service.rb:42-56`

#### API-EVDREM-043 — The meaning of a recipient id depends on the reminder kind and is never checked
- **Why it matters.** For evaluations and approvals the map keys are treated as USER ids, otherwise as COMPANY ids. Sending a company uuid with `pending_evaluations` mails whatever user happens to have that number.
- **Setup.** Manual and only on UAT with care: pick a QA-vendor company uuid whose decoded number equals a QA user id, or inspect the queued job instead of letting it send.
- **Steps.** Send `pending_evaluations` with `{"<QA vendor 1 company uuid>": ["<RFP uuid>"]}`.
- **Expected.** Should be refused (recipient is not an evaluator of this event). Today: 200; the stored recipient is `u-<company id>` and the worker looks that number up as a user.
- **Oracle.** Reminder row `recipient_identifier` = `u-<company id>`.
- **Trace.** P1 · manual · `app/services/reminders/base_service.rb:23-31` · `app/workers/reminder_worker.rb:17-19`

#### API-EVDREM-044 — An unknown reminder kind is stored and emailed as a generic notification
- **Why it matters.** The kind is never validated: "foo" is stored as category "Foo" and sent with the subject "[Reminder] Notification".
- **Setup.** Live RFQ, QA vendor 1. Manual (emails).
- **Steps.** Send `reminder_type` `QA_Platform_kind` for vendor 1 and the RFQ round.
- **Expected.** Should be 422 (unknown kind). Today: 200 success, a reminder row with an invented category, and a generic email (or a mail-template failure in the worker).
- **Oracle.** Reminder row category; mailbox.
- **Trace.** P1 · manual · `app/services/reminders/event_group_service.rb:42-48,68-71` · `app/services/reminders/base_service.rb:40` · `app/workers/reminder_worker.rb:78-79`

#### API-EVDREM-045 — The success count includes vendors who were sent nothing
- **Why it matters.** `recipients_count` is the number of keys in the map, even when none of a vendor's round ids resolved; the toast says "Reminders Sent to 2 Vendors" while only one was mailed — and a reminder row (with its 10-minute lock) is still written for the other.
- **Setup.** Live RFQ, QA vendors 1 and 2. Manual.
- **Steps.** Send `offer_submissions` with vendor 1 → [RFQ uuid] and vendor 2 → [`Z2dnWmdaUWtnZw==`].
- **Expected.** Should report 1 recipient (or refuse the bad entry). Today: `recipients_count` 2; only vendor 1 is mailed; two reminder rows.
- **Oracle.** Response count vs mailboxes vs reminder rows.
- **Trace.** P2 · manual · `app/services/reminders/event_group_service.rb:50-58,68` · `app/services/reminders/base_service.rb:57-63` · `app/workers/reminder_worker.rb:35`

#### API-EVDREM-046 — If the event's creator has been deactivated, nobody is reminded but the buyer is told it worked
- **Why it matters.** The worker looks up the creator's name among ACTIVE users only and crashes on nil; the API has already answered success and stamped the 10-minute lock.
- **Setup.** An event whose creator user is inactive (e.g. after ownership transfer and deactivation). Manual.
- **Steps.** Send an offer-submission reminder; watch the worker.
- **Expected.** Should send (use any name or the current owner). Today: 200 "Reminders sent successfully.", the `ReminderWorker` job fails with `NoMethodError` on `display_name`, no email.
- **Oracle.** Sidekiq failure; empty mailbox; reminder row present.
- **Trace.** P1 · manual · `app/workers/reminder_worker.rb:13` · `app/services/reminders/event_group_service.rb:167`

#### API-EVDREM-047 — An approval request without a known requester crashes the send
- **Why it matters.** The approval reminder looks up the requester's name with `User.find_by(...).display_name`, unguarded.
- **Setup.** A pending approval request whose `requested_by_user_id` is empty or points to a deleted user. Manual.
- **Steps.** Send `approvals` with the approver → [that approval request uuid].
- **Expected.** Should send with a fallback name. Today: `NoMethodError` → HTTP 500 (before any reminder row is written).
- **Oracle.** 5xx = defect.
- **Trace.** P2 · manual · `app/services/reminders/event_group_service.rb:136-143`

## 7. Bad input to the send

#### API-EVDREM-048 — A send without the reminders map crashes before doing anything
- **Why it matters.** The map is read with `params[:reminders].to_unsafe_h` on the first lines; when it is missing the `|| {}` fallback is never reached and the request dies with a server error.
- **Setup.** Live RFQ (recipe `published_rfq`). Nothing is written: the crash is on controller line 18, before the service, the permission check or any email.
- **Steps.** `POST /reminders/{{eventGroupUuid}}/send_reminder` with `{"resource_type": "event_group", "reminder_type": "offer_submissions"}`.
- **Expected.** Should be 422 code 2 'Insufficient parameters'. Today `nil.to_unsafe_h` raises `NoMethodError` → HTTP 500.
- **Oracle.** 5xx = defect; no reminder row.
- **Trace.** P1 · automate · `EVD2-REM-048` · `app/controllers/api/reminders_controller.rb:18`

#### API-EVDREM-049 — A reminders map sent as text crashes
- **Why it matters.** Same line, different hostile shape.
- **Setup.** Recipe `published_rfq`. Crashes on line 18, before anything else.
- **Steps.** Same request with `"reminders": "QA_Platform_text_{{stamp}}"`.
- **Expected.** Should be 422. Today `String#to_unsafe_h` → `NoMethodError` → HTTP 500.
- **Oracle.** 5xx = defect.
- **Trace.** P2 · automate · `EVD2-REM-049` · `app/controllers/api/reminders_controller.rb:18`

#### API-EVDREM-050 — A reminders map sent as a list crashes
- **Why it matters.** A client that sends the recipients as a list (a natural mistake) gets a server error instead of a validation message.
- **Setup.** Recipe `published_rfq`. Crashes on line 18.
- **Steps.** Same request with `"reminders": ["Z2dnWmdaUWtnZw=="]`.
- **Expected.** Should be 422. Today `Array#to_unsafe_h` → HTTP 500.
- **Oracle.** 5xx = defect.
- **Trace.** P2 · automate · `EVD2-REM-050` · `app/controllers/api/reminders_controller.rb:18`

#### API-EVDREM-051 — Sending for an event that does not exist crashes instead of "not found"
- **Why it matters.** The service is built first (it quietly finds nothing), then the permission check is handed nil and raises an error nobody catches.
- **Setup.** Any buyer, no event (recipe `none`). Crashes at the permission check, before the service's send (no row, no email).
- **Steps.** `POST /reminders/Z2dnWmdaUWtnZw==/send_reminder` with `{"resource_type": "event_group", "reminder_type": "offer_submissions", "reminders": {"Z2dnWmdaUWtnZw==": ["Z2dnWmdaUWtnZw=="]}}`.
- **Expected.** Should be a clean 4xx. Today: `EventGroup.find_by` → nil → `authorize(nil, :update?)` → `Pundit::NotDefinedError` (not rescued) → HTTP 500.
- **Oracle.** 5xx = defect.
- **Trace.** P1 · automate · `EVD2-REM-051` · `app/controllers/api/reminders_controller.rb:20-23,51-52` · `app/controllers/concerns/api_auth.rb:16`

#### API-EVDREM-052 — Sending with a garbled event id crashes
- **Why it matters.** Same path, id decodes to nothing.
- **Setup.** Recipe `none`. Crashes at the permission check.
- **Steps.** `POST /reminders/WrongUuid1=/send_reminder` with the body of API-EVDREM-051.
- **Expected.** Should be a clean 4xx. Today HTTP 500 (`Pundit::NotDefinedError`).
- **Oracle.** 5xx = defect.
- **Trace.** P2 · automate · `EVD2-REM-052` · `app/controllers/concerns/params_auth.rb:61-62` · `app/controllers/api/reminders_controller.rb:51-52`

#### API-EVDREM-053 — An unknown resource type on the send answers an empty success
- **Why it matters.** With no service the controller renders an unassigned variable: HTTP 200 with body `null` — the dashboard would read that as a success with nothing in it.
- **Setup.** Recipe `published_rfq`. No service is built, nothing is looked up or sent.
- **Steps.** `POST /reminders/{{eventGroupUuid}}/send_reminder` with `{"resource_type": "trade_request", "reminder_type": "offer_submissions", "reminders": {"Z2dnWmdaUWtnZw==": ["Z2dnWmdaUWtnZw=="]}}`.
- **Expected (today).** HTTP 200 with body `null`; no permission check. Should be a 422.
- **Oracle.** 200 + `null` today; a 5xx would be a new defect.
- **Trace.** P2 · automate · `EVD2-REM-053` · `app/controllers/api/reminders_controller.rb:20-30,35-45`

#### API-EVDREM-054 — Sending on a draft event returns an error inside a success reply
- **Why it matters.** The owner passes the permission check, then the service (which only knows live events) returns `{error: true, code: 533}` — but with HTTP 200, so callers that trust the status think it was sent. (The drawer is hidden on drafts, so only API callers hit this.)
- **Setup.** Draft RFQ (recipe `draft_rfq`), caller the owner. Returns on service line 35, before the map is read, any row is written or any email is queued.
- **Steps.** `POST /reminders/{{eventGroupUuid}}/send_reminder` with `{"resource_type": "event_group", "reminder_type": "offer_submissions", "reminders": {"Z2dnWmdaUWtnZw==": ["Z2dnWmdaUWtnZw=="]}}`.
- **Expected (today).** HTTP 200 with body `{"error": true, "code": 533}` (533 means 'Project does not exist.'). Should be HTTP 422 with code 533 and its message.
- **Oracle.** 200 + that body today (suspected defect: error with a success status); no reminder row.
- **Trace.** P2 · automate · `EVD2-REM-054` · `app/services/reminders/event_group_service.rb:6,35` · `app/controllers/api/reminders_controller.rb:22-30`

#### API-EVDREM-055 — An auction reminder on an event without an auction returns an error inside a success reply
- **Why it matters.** The auction branch needs an auction stage in the map; on an RFQ-only event it bails out with code 533 ("Project does not exist." — the wrong meaning) and HTTP 200.
- **Setup.** Live RFQ, no auction (recipe `published_rfq`). The map names QA vendor 1 and the RFQ round; the service returns on line 62, BEFORE `create_reminder_records` (line 68) and the email (line 69), so nothing is written or sent.
- **Steps.** `POST /reminders/{{eventGroupUuid}}/send_reminder` with `{"resource_type": "event_group", "reminder_type": "auction_reminders", "reminders": {"{{vendorUuid}}": ["{{pricingTradeUuid}}"]}}`.
- **Expected (today).** HTTP 200 with body `{"error": true, "code": 533}`. Should be a 422 saying the event has no auction to remind about.
- **Oracle.** 200 + that body; no reminder row, no email to QA vendor 1.
- **Trace.** P2 · automate · `EVD2-REM-055` · `app/services/reminders/event_group_service.rb:60-63`

#### API-EVDREM-056 — An auction reminder with unknown ids after the round closed returns the same error-as-success
- **Why it matters.** Unknown round ids resolve to nothing, so no auction is found; same early return on a closed event.
- **Setup.** Closed RFQ with a bid (recipe `closed_rfq_with_bid`). Returns on line 62, before any write or email.
- **Steps.** `POST /reminders/{{eventGroupUuid}}/send_reminder` with `{"resource_type": "event_group", "reminder_type": "auction_reminders", "reminders": {"Z2dnWmdaUWtnZw==": ["Z2dnWmdaUWtnZw=="]}}`.
- **Expected (today).** HTTP 200, body `{"error": true, "code": 533}`.
- **Oracle.** 200 + that body.
- **Trace.** P2 · automate · `EVD2-REM-056` · `app/services/reminders/event_group_service.rb:40-48,60-63`

#### API-EVDREM-057 — A send without a reminder kind crashes
- **Why it matters.** The kind is not validated; with it missing the code reaches the reminder-row builder and calls `singularize` on nothing.
- **Setup.** Live RFQ (recipe `published_rfq`). The map uses unknown ids so it resolves to no round; the crash is inside the row builder's `map` (base service line 40), BEFORE `Reminder.insert_all` (line 54) and before the email (service line 69).
- **Steps.** `POST /reminders/{{eventGroupUuid}}/send_reminder` with `{"resource_type": "event_group", "reminders": {"Z2dnWmdaUWtnZw==": ["Z2dnWmdaUWtnZw=="]}}`.
- **Expected.** Should be 422 code 2 'Insufficient parameters'. Today `nil.singularize` → `NoMethodError` → HTTP 500.
- **Oracle.** 5xx = defect; no reminder row.
- **Trace.** P1 · automate · `EVD2-REM-057` · `app/services/reminders/event_group_service.rb:60-68` · `app/services/reminders/base_service.rb:34-40,54`

#### API-EVDREM-058 — A numeric reminder kind crashes
- **Why it matters.** Same unvalidated field, a different hostile type.
- **Setup.** Recipe `published_rfq`. Crash at base service line 40, before the insert and the email.
- **Steps.** As API-EVDREM-057 with `"reminder_type": 5`.
- **Expected.** Should be 422. Today `Integer#singularize` → HTTP 500.
- **Oracle.** 5xx = defect.
- **Trace.** P2 · automate · `EVD2-REM-058` · `app/services/reminders/base_service.rb:40`

#### API-EVDREM-059 — A vendor's round list sent as text crashes
- **Why it matters.** Each map value must be a list of round ids; a single id sent as text reaches `.map` on a String.
- **Setup.** Recipe `published_rfq`, caller the owner (passes the permission check). Crash on service line 38, before any row or email.
- **Steps.** `POST /reminders/{{eventGroupUuid}}/send_reminder` with `{"resource_type": "event_group", "reminder_type": "offer_submissions", "reminders": {"Z2dnWmdaUWtnZw==": "Z2dnWmdaUWtnZw=="}}`.
- **Expected.** Should be 422. Today `String#map` → `NoMethodError` → HTTP 500.
- **Oracle.** 5xx = defect.
- **Trace.** P2 · automate · `EVD2-REM-059` · `app/services/reminders/event_group_service.rb:37-38`

#### API-EVDREM-060 — Sending on a withdrawn event returns the error-as-success reply
- **Why it matters.** Same as the draft case; the drawer IS shown on withdrawn events, so a user can reach it (see UI-EVDREM-070).
- **Setup.** A withdrawn QA-buyer event. Manual (no withdrawn recipe for the direct runner).
- **Steps.** Send a valid offer-submission body.
- **Expected (today).** HTTP 200 `{"error": true, "code": 533}`; nothing sent.
- **Oracle.** That body; no reminder row.
- **Trace.** P2 · manual · `app/services/reminders/event_group_service.rb:6,35`

#### API-EVDREM-061 — An empty reminders map reports success with zero recipients
- **Why it matters.** Nothing is written, but an (empty) email job is still queued and the reply says "Reminders sent successfully." with count 0.
- **Setup.** Live RFQ. Manual: the code reaches `send_reminder_email` (it enqueues a worker), which the direct runner must not do.
- **Steps.** Send `{"resource_type": "event_group", "reminder_type": "offer_submissions", "reminders": {}}`.
- **Expected (today).** HTTP 200 `{"success": true, "message": "Reminders sent successfully.", "recipients_count": 0, ...}`. Should be 422 (nobody selected).
- **Oracle.** Count 0; no reminder row (`create_reminder_records` returns on blank); one no-op `ReminderWorker` job.
- **Trace.** P2 · manual · `app/services/reminders/base_service.rb:34` · `app/services/reminders/event_group_service.rb:68-71`

## 8. The Send Reminders drawer (dashboard)

#### UI-EVDREM-062 — "Send Reminders" is not offered on a draft event
- **Why it matters.** Drafts have no vendors to chase; the option is removed from the event's ⋮ menu.
- **Setup.** A draft event of the QA buyer.
- **Steps.** Open the event; open the ⋮ options menu.
- **Expected.** The menu has no "Send Reminders" entry; on a live event it does.
- **Oracle.** Menu items for draft vs live.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/projectDetails/projectDetails.jsx:256,269-271`

#### UI-EVDREM-063 — "Send Reminders" is offered to users who are not allowed to send
- **Why it matters.** The menu only checks "not a draft"; a read-only buyer opens the drawer, selects vendors and only learns at the end that they are not authorised.
- **Setup.** A read-only buyer on the event's team.
- **Steps.** Open the live event → ⋮ → Send Reminders → pick a kind → select a vendor → Send Reminder.
- **Expected.** Should hide the option (or disable Send) for users without create permission. Today: the drawer works until Send, which fails with "You are not authorized to perform this action".
- **Oracle.** Error toast after Send; no reminder sent.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/projectDetails/projectDetails.jsx:258-273` · `app/policies/event_group_policy.rb:37-40`

#### UI-EVDREM-064 — The drawer shows one card per kind with something pending, with a count
- **Why it matters.** The first screen is the overview; empty kinds must not show.
- **Setup.** Live RFQ with QA vendor 1 pending (API-EVDREM-001).
- **Steps.** Open Send Reminders.
- **Expected.** Title "Send Reminders", subtitle "Streamline Follow-ups on Pending Actions"; a single card "Offer submissions" with "1 Pending" and "View".
- **Oracle.** Card list equals the non-empty kinds of the list reply.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/projectDetails/components/bulkReminderDrawer.jsx:100-105,190-227` · `procol-client-dashboard/src/redux/project/selectors.js:1477-1502`

#### UI-EVDREM-065 — With nothing pending the drawer shows an empty state
- **Why it matters.** Closed, withdrawn or fully-bid events answer an empty list; the user must see a clear message, not a blank panel.
- **Setup.** Live RFQ where every invited vendor has bid, or a closed event.
- **Steps.** Open Send Reminders.
- **Expected.** Illustration and "No Pending Actions to Remind"; no Send / Cancel buttons.
- **Oracle.** Empty-state text present; footer buttons absent.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/projectDetails/components/bulkReminderDrawer.jsx:108-114,174-188`

#### UI-EVDREM-066 — The recipient table shows the columns the server chose for that kind
- **Why it matters.** Vendors show what they owe ("Bid Pending For"); evaluators and approvers show only name and last reminded.
- **Setup.** Live RFQ with QA vendor 1 pending.
- **Steps.** Open "Offer submissions" → View.
- **Expected.** Header "Offer submission Reminders" / "Notify vendors to complete bid submissions"; columns: checkbox, Vendor Name, Bid Pending For (round title as a tag), Last Reminded At ("-" when never).
- **Oracle.** Column headers and first row.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/projectDetails/components/reminderTableColumns.jsx:5-16,77-88` · `app/services/reminders/strategies/base_strategy.rb:37-87`

#### UI-EVDREM-067 — A vendor reminded in the last 10 minutes cannot be selected
- **Why it matters.** This greyed checkbox is the ONLY anti-spam guard (the API does not enforce it, API-EVDREM-038).
- **Setup.** Right after sending vendor 1 a reminder.
- **Steps.** Reopen the drawer → Offer submissions → View; hover the checkbox; tick the header checkbox.
- **Expected.** Vendor 1's checkbox is disabled with the tooltip "Retry in 10 mins"; "Last Reminded At" shows the time; select-all selects only remindable rows (none here).
- **Oracle.** Disabled checkbox + tooltip; header checkbox selects nothing.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/projectDetails/components/reminderTableColumns.jsx:24-74`

#### UI-EVDREM-068 — Send Reminder stays disabled until someone is selected
- **Why it matters.** Prevents empty sends (which the API would otherwise "succeed" with 0 recipients, API-EVDREM-061).
- **Setup.** Drawer on the Offer submissions table.
- **Steps.** Look at the Send Reminder button; tick vendor 1; untick.
- **Expected.** Disabled with no selection, enabled with one, disabled again after untick.
- **Oracle.** Button state.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/projectDetails/components/bulkReminderDrawer.jsx:121-129` · `procol-client-dashboard/src/utils/index.js:371`

#### UI-EVDREM-069 — A successful send confirms with the right count and noun, closes the drawer and refreshes the list
- **Why it matters.** The buyer needs to know who was reminded; the wording uses "Vendor/Vendors", "Evaluator", "Approver" by kind.
- **Setup.** Live RFQ, QA vendor 1 pending. Sends a real reminder to QA vendor 1.
- **Steps.** Select vendor 1 → Send Reminder.
- **Expected.** Toast "Reminders Sent to 1 Vendor"; drawer closes; reopening shows vendor 1 locked. (Two vendors → "2 Vendors"; evaluations → "1 Evaluator".)
- **Oracle.** Toast text; request body `{"resource_type": "event_group", "reminder_type": "offer_submissions", "reminders": {"<vendor uuid>": ["<round uuid>"]}}`.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/projectDetails/mutation.js:45-75` · `procol-client-dashboard/src/views/projectDetails/components/bulkReminderDrawer.jsx:61-76` · `procol-client-dashboard/src/utils/index.js:508-514`

#### UI-EVDREM-070 — When the server answers an error inside a 200, the drawer neither confirms nor explains
- **Why it matters.** The success handler reads `type` and `recipients_count` from the reply; `{error: true, code: 533}` has neither, so building the toast fails on an undefined kind — the user sees no confirmation and no error, and the drawer stays open.
- **Setup.** Open the drawer on a live event, then withdraw the event in another tab (or let an auction reminder hit API-EVDREM-055's path).
- **Steps.** Select a vendor → Send Reminder.
- **Expected.** Should show a clear error ("event is no longer live"). Today: no "Reminders Sent" confirmation; the success handler throws a TypeError reading `stakeholder` of undefined, so the close-and-refresh step never runs and the drawer stays open (whether any generic error toast appears depends on the app's global mutation error handler — note what is shown).
- **Oracle.** Reply `{"error": true, "code": 533}` with HTTP 200; no success toast; drawer still open.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/projectDetails/mutation.js:66-74` · `app/services/reminders/event_group_service.rb:35`

#### UI-EVDREM-071 — Auction reminder cards are split by lot and carry the lot title
- **Why it matters.** With several lots the buyer must know which auction they are chasing.
- **Setup.** A lot-split auction event, both lots not yet started.
- **Steps.** Open Send Reminders; open one auction card.
- **Expected.** One card per lot titled "Auction reminders - <lot title>"; the table header "Auction reminders - <lot title> Reminders".
- **Oracle.** Two cards, each with its lot's vendors.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/projectDetails/components/bulkReminderDrawer.jsx:87-95,193-213` · `app/services/reminders/strategies/auction_reminders.rb:32-34`

#### UI-EVDREM-072 — The approvals card's subtitle says "Notify vendors to approvals"
- **Why it matters.** Approvals go to internal approvers, not vendors; the wording is wrong and ungrammatical.
- **Setup.** An event with a pending approval.
- **Steps.** Open Send Reminders → Approvals → View.
- **Expected.** Should read like "Notify approvers to complete their approvals". Today: "Notify vendors to approvals".
- **Oracle.** Subtitle text.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/projectDetails/constants.js:153-158`

#### UI-EVDREM-073 — Back and Cancel reset the selection
- **Why it matters.** A selection carried from one kind to another would send the wrong people.
- **Setup.** Drawer with at least one card.
- **Steps.** View a card → tick vendor 1 → Back → open the same card again; then tick → Cancel → reopen.
- **Expected.** After Back the card list returns and the reopened table has nothing ticked; Cancel closes the drawer and reopening starts on the card list.
- **Oracle.** No ticked rows after Back/Cancel.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/projectDetails/components/bulkReminderDrawer.jsx:42-59`

#### UI-EVDREM-074 — Scheduled-template events have no options menu, so no reminders
- **Why it matters.** The whole ⋮ menu (including Send Reminders) is hidden for scheduled templates; confirm that is intended.
- **Setup.** An event opened as a scheduled template.
- **Steps.** Open the event header.
- **Expected.** No ⋮ options menu.
- **Oracle.** Menu absent.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/projectDetails/projectDetails.jsx:342,1084`
