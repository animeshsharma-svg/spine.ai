# Rescheduling a round and per-line timing

Deep cases for what a buyer can do to a round's clock other than the plain bid-end extension: rescheduling a round
before it starts (`PATCH /trade/:id` with `bid_start_time` + `bid_end_time` and no `configurations`), the emails and
reminders that the Sep-25 commit c74ea64581 "Feat/auction emails (#16149)" added to reschedules and extensions of
auctions, per-line (staggered) closing times (`PATCH /trade/:id/staggered_time`), reopening expired lines of a staggered
auction (`POST /trade/:id/reopen_line_items`), and what a vendor can still do once the clock has moved. Every case is
grounded in `procol-backend` at `origin/main` (backend paths below are relative to that repo) or in
`procol-client-dashboard` for the UI cases. Cases whose Trace names an `EVD2-TME-NNN` id have a runnable twin in
`prototype/data/deep2-cases/tme.json`; each twin runs on its OWN fresh event built by the API plan runner and a failure
is re-run on a second fresh event before it is reported.
This file goes deeper than `api-edge-pub.md` API-XPUB-058…075 (extension to 2100, to the past, text, reopen rule 496,
closed 4, proposal 801, RFP/RFQ 712, force end), `api-bidding-matrix.md` API-XMAT-030…038 / 072…074 (bidding in and
after the extra closing time, reopening by extension, bids' stored end time, dynamic extension),
`events-deep-amd.md` API-XDAMD-045 / UI-XDAMD-014 (a running stage cannot be rescheduled; the menu item) and
`events-deep-lot.md` API-XDLOT-060…066 (staggered_time on a non-staggered round, unknown round, missing authorisation,
unknown line, text times, push-later-only rule, empty body). Before this file `reopen_line_items` had no case at all and
the auction-email commit had none.

**Read before running.** Every fresh recipe starts bidding at publish, so a round is never "upcoming" in a run: the
reschedule happy path and every validation that sits after the "already started" guard (code 258,
`app/controllers/api/trade_controller.rb:606`) is catalog-only, with exact steps for a manual run on an event created with
a future start. On a started round the guard order for a reschedule body is: round lookup (4) → latest version (101) →
Pundit `update?` (455) → sell workspace (101) → RFQ-change restriction (769) → sourcing access (101) → status allowed
(4; RFQ: active/draft/requested, RFP and BOQ also closed) → company (101) → draft diverts to the draft editor → 258.
Neither per-line endpoint can be exercised on a fresh event beyond its refusals: both require a staggered-on-line round
(`config.auction_closing_mode == "line_item_based"` and `config.staggered`), and every recipe builds an RFQ, so the
runnable twins pin the guard order (code 4) and the happy paths are manual. All three actions are buyer-console-only
(`config/app_auth_config.yml` via `aac.mjs`: `update`, `staggered_time`, `reopen_line_items` NOT ALLOWED on the vendor
website), so every vendor-actor case is manual — the vendor app is answered 401 and signed out. **Email effects are
manual and must only be checked with QA vendors on a restricted audience:** a reschedule of an auction also mails the
owner and every member of the company's auction team (real people), and for an auction whose audience is "everyone" the
vendor mail goes to every vendor the company deals with (`app/models/trade_request.rb:1451-1460`).

## 1. A round that has already started cannot be rescheduled

#### API-EVDTME-001 — A started round cannot be moved to a later window, and its clock is untouched
- **Why it matters.** Moving a live round's start would close bidding under vendors who are quoting; the refusal must also leave the clock exactly as it was.
- **Setup.** A fresh live RFQ whose bidding started when it was published (about 20 minutes open), QA vendor 1 invited, no bids.
- **Steps.** 1. As the buyer, `PATCH /trade/{{tradeId}}` with `{"bid_start_time": {{now+3600}}, "bid_end_time": {{now+7200}}}`. 2. Read the round back (`GET /trade/{{tradeId}}?response_type=template`).
- **Expected.** The reschedule is refused and the round still starts in the past and ends at its original time. HTTP 422, code 258 'You cannot re-schedule this event!'.
- **Oracle.** 422 + 258; `starting_from` ≤ now and `ending_at` ≤ now + 30 min (not moved to two hours from now).
- **Trace.** P0 · automate · `EVD2-TME-001` · `app/controllers/api/trade_controller.rb:399-408,590-606`

#### API-EVDTME-002 — A reversed window on a started round is refused by the "already started" rule first
- **Why it matters.** Shows the guard order: whatever the times are, a started round answers 258 — the reschedule path has no end-after-start check of its own (API-EVDTME-018).
- **Setup.** A fresh live RFQ, bidding started at publish, no bids.
- **Steps.** `PATCH /trade/{{tradeId}}` with `{"bid_start_time": {{now+7200}}, "bid_end_time": {{now+3600}}}`.
- **Expected.** Refused. HTTP 422, code 258 'You cannot re-schedule this event!'.
- **Oracle.** 422 + 258.
- **Trace.** P2 · automate · `EVD2-TME-002` · `app/controllers/api/trade_controller.rb:605-606`

#### API-EVDTME-003 — Times sent as words on a started round are refused without a crash
- **Why it matters.** On an upcoming round the same words crash in the time conversion (API-EVDTME-023); on a started round the 258 guard must come first.
- **Setup.** A fresh live RFQ, bidding started at publish, no bids.
- **Steps.** `PATCH /trade/{{tradeId}}` with `{"bid_start_time": "QA_Platform_later_{{stamp}}", "bid_end_time": "QA_Platform_later_{{stamp}}"}`.
- **Expected.** Refused cleanly, never a server error. HTTP 422, code 258 'You cannot re-schedule this event!'.
- **Oracle.** 422 + 258, not 5xx.
- **Trace.** P2 · automate · `EVD2-TME-003` · `app/controllers/api/trade_controller.rb:605-606` · `app/controllers/concerns/trade_controller_helper.rb:541`

#### API-EVDTME-004 — Sending only a new start time is silently ignored
- **Why it matters.** The reschedule branch needs BOTH times; with one of them the request falls through to the generic save and answers success, so an integration or a stale screen believes the reschedule worked.
- **Setup.** A fresh live RFQ, bidding started at publish, no bids.
- **Steps.** 1. `PATCH /trade/{{tradeId}}` with `{"bid_start_time": {{now+3600}}}`. 2. Read the round back.
- **Expected (today).** HTTP 200 and nothing changes — the round still starts in the past. Should be refused (422, code 2 'Insufficient parameters') so the caller knows nothing happened.
- **Oracle.** 200; `starting_from` ≤ now.
- **Trace.** P1 · automate · `EVD2-TME-004` · `app/controllers/api/trade_controller.rb:605,635-779`

#### API-EVDTME-005 — Sending only a new end time does not extend the round
- **Why it matters.** `bid_end_time` on its own is neither a reschedule nor an extension (that is `increase_auction_time`); a caller "extending" this way gets a success while vendors are still cut off at the old time.
- **Setup.** A fresh live RFQ open about 20 minutes, no bids.
- **Steps.** 1. `PATCH /trade/{{tradeId}}` with `{"bid_end_time": {{now+7200}}}`. 2. Read the round back.
- **Expected (today).** HTTP 200 but the end does not move. Should be refused (code 2) or applied.
- **Oracle.** 200; `ending_at` ≤ now + 30 min (not two hours from now).
- **Trace.** P1 · automate · `EVD2-TME-005` · `app/controllers/api/trade_controller.rb:605,642`

#### API-EVDTME-006 — A started technical round cannot be rescheduled
- **Why it matters.** Technical rounds take a slightly different path (evaluator handling runs first, closed is an allowed status); the started rule must still hold and nothing must be written before it.
- **Setup.** A fresh live RFP+RFQ event; both rounds started at publish; QA vendor 1 invited to both.
- **Steps.** `PATCH /trade/{{rfpTradeId}}` with `{"bid_start_time": {{now+3600}}, "bid_end_time": {{now+7200}}}`.
- **Expected.** Refused. The evaluator step that runs before the guard only acts when `forms` are sent, so it writes nothing. HTTP 422, code 258 'You cannot re-schedule this event!'.
- **Oracle.** 422 + 258.
- **Trace.** P1 · automate · `EVD2-TME-006` · `app/controllers/api/trade_controller.rb:590-606,1848-1857` · `app/controllers/concerns/trade_template_helper.rb:1872-1936`

#### API-EVDTME-007 — A closed technical round answers the same "cannot re-schedule"
- **Why it matters.** Technical rounds stay editable after close, so only the started rule stops a "reschedule" from reopening a finished technical round and wiping its evaluation timeline.
- **Setup.** A fresh RFP+RFQ event whose technical response is in and whose windows are both over.
- **Steps.** `PATCH /trade/{{rfpTradeId}}` with `{"bid_start_time": {{now+3600}}, "bid_end_time": {{now+7200}}}`.
- **Expected.** Refused. HTTP 422, code 258 'You cannot re-schedule this event!'.
- **Oracle.** 422 + 258.
- **Trace.** P1 · automate · `EVD2-TME-007` · `app/controllers/api/trade_controller.rb:590-594,605-606`

#### API-EVDTME-008 — A closed pricing round cannot be rescheduled
- **Why it matters.** A closed commercial round must never be reopened through the reschedule path.
- **Setup.** A fresh RFQ whose bidding window and extra closing time are over; QA vendor 1 invited, no bids.
- **Steps.** `PATCH /trade/{{tradeId}}` with `{"bid_start_time": {{now+3600}}, "bid_end_time": {{now+7200}}}`.
- **Expected.** Refused. HTTP 422 with code 4 'Request not found' once the round's status is closed (closed RFQ rounds are not editable), or code 258 'You cannot re-schedule this event!' if the close job has not flipped the status yet.
- **Oracle.** Any 422 without a 5xx; the code is 4 or 258.
- **Trace.** P1 · automate · `EVD2-TME-008` · `app/controllers/api/trade_controller.rb:590-594,605-606` · `app/workers/mark_event_closed_worker.rb:5-15`

#### API-EVDTME-009 — An awarded round cannot be rescheduled
- **Why it matters.** Moving the clock of a round whose award proposal is submitted would orphan the award.
- **Setup.** A fresh RFQ where QA vendor 1 bid, the round closed, and an award proposal was created and submitted.
- **Steps.** `PATCH /trade/{{tradeId}}` with `{"bid_start_time": {{now+3600}}, "bid_end_time": {{now+7200}}}`.
- **Expected.** Refused (HTTP 422): code 769 'You cannot edit rfq once the auction is created.' where the company has rfx projects on (a requested/selected proposal restricts RFQ changes — misleading wording, see API-XMAT-035), otherwise code 4 'Request not found' (closed) or 258.
- **Oracle.** 422 without a 5xx.
- **Trace.** P1 · automate · `EVD2-TME-009` · `app/controllers/api/trade_controller.rb:408,590-606` · `app/models/model_helpers/trade_request_model_helper.rb:1434-1445`

#### API-EVDTME-010 — Rescheduling a round that does not exist
- **Why it matters.** Bogus ids must fail closed before any policy or schedule logic.
- **Setup.** Signed-in QA buyer; no event needed.
- **Steps.** `PATCH /trade/Z2dnWmdaUWtnZw==` with `{"bid_start_time": {{now+3600}}, "bid_end_time": {{now+7200}}}`.
- **Expected.** Refused. HTTP 422, code 4 'Request not found' (the id decodes to 999999999).
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EVD2-TME-010` · `app/controllers/api/trade_controller.rb:400-402`

#### API-EVDTME-011 — Rescheduling with a garbled round id
- **Why it matters.** A garbled id decodes to nothing; the lookup must not crash.
- **Setup.** Signed-in QA buyer; no event needed.
- **Steps.** `PATCH /trade/WrongUuid1=` with `{"bid_start_time": {{now+3600}}, "bid_end_time": {{now+7200}}}`.
- **Expected.** Refused. HTTP 422, code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EVD2-TME-011` · `app/controllers/api/trade_controller.rb:400-402` · `app/controllers/concerns/params_auth.rb:57-66`

#### API-EVDTME-012 — The vendor app cannot reschedule, re-time lines or reopen lines
- **Why it matters.** A bidder moving its own deadline is a fairness breach; the block is the app gate, not the policy.
- **Setup.** QA vendor 1's session on the vendor website, invited to a live round. Manual: the backend answers a vendor-app call to a console-only action with 401 and SIGNS THAT SESSION OUT, so this can never be a runnable twin.
- **Steps.** As the vendor (vendor website), send each of: `PATCH /trade/<round>` with a reschedule body, `PATCH /trade/<round>/staggered_time`, `POST /trade/<round>/reopen_line_items`.
- **Expected.** Each is refused at the app gate: HTTP 401 'app not authorized', and the vendor's session ends. No schedule changes. (So the "vendor in the auction" attacker of API-XDLOT-062 cannot reach staggered_time; the realistic attacker is a console user of another company, API-EVDTME-013.)
- **Oracle.** 401 on all three; round times unchanged when read by the buyer.
- **Trace.** P1 · manual · `config/app_auth_config.yml` (trade#update / staggered_time / reopen_line_items: not allowed for agribid_website) · `app/controllers/concerns/api_auth.rb:95-104`

#### API-EVDTME-013 — A buyer of another company: reschedule and reopen are blocked, staggered_time is not
- **Why it matters.** The three time actions have three different ownership checks; only one of them is complete.
- **Setup.** Buyer B of a second company (console) and a live staggered auction of company A. Needs two companies and a staggered auction; manual.
- **Steps.** As B: 1. `PATCH /trade/<A's round>` with a reschedule body. 2. `POST /trade/<A's round>/reopen_line_items`. 3. `PATCH /trade/<A's round>/staggered_time` with a later end for one line.
- **Expected.** 1. HTTP 422, code 455 'You are not authorized to perform this action' (Pundit `update?` requires A in B's allowed companies). 2. HTTP 422, code 4 'Request not found' (the lookup is scoped to B's company). 3. Should be refused the same way; today it is accepted (API-XDLOT-062).
- **Oracle.** 455 / 4 / (defect) 200 with A's line end moved.
- **Trace.** P0 · manual · `app/controllers/api/trade_controller.rb:404,1408-1411,1427-1429` · `app/policies/trade_request_policy.rb:74-79`

#### API-EVDTME-014 — A reschedule body that also carries configurations skips the started rule
- **Why it matters.** The reschedule branch is chosen only when `configurations` is blank; adding any configurations turns the request into a full settings edit that rebuilds the round's config, re-runs the RFP/RFQ time rule and can move the extra closing (evaluation) window of a live round.
- **Setup.** A live RFQ with an extra closing time and no bids. Manual: the settings edit rewrites the round's config from the company defaults and cannot be bounded on a run's event.
- **Steps.** `PATCH /trade/<round>` with `{"bid_start_time": <now+3600>, "bid_end_time": <now+7200>, "extra_closing_time": <now+9000>, "configurations": {"template_id": <the round's template id>}}`; read the round back.
- **Expected (today).** No 258. The bidding window keeps its start/end (`edit_trade_schedules(…, true)` only re-types it) but the extra closing schedule is moved to the sent times and closed_at follows. Should be refused like any other reschedule of a started round.
- **Oracle.** `extra_closing_time` in the read-back equals the sent value; `starting_from` unchanged.
- **Trace.** P2 · manual · `app/controllers/api/trade_controller.rb:605,723-741` · `app/controllers/concerns/trade_controller_helper.rb:549-552,620-626`

#### API-EVDTME-015 — "Rescheduling" a draft round is a full draft rewrite
- **Why it matters.** A draft is diverted to the draft editor before the reschedule branch; that editor rebuilds the round from the body — with only two times in it, the round's lines are voided and its config rebuilt.
- **Setup.** A draft event with an RFQ round and one line. Manual (destructive to the draft; API-XPUB-066 already checks the same path does not 5xx).
- **Steps.** 1. `PATCH /trade/<draft round>` with only `{"bid_start_time": <now+3600>, "bid_end_time": <now+7200>}`. 2. Read the round and the event's line items back.
- **Expected (today).** Either refused by the draft editor's own checks or 200 with the round's lines voided (`delete_draft_trade_products_and_associations`) and any draft bids made inactive. Should only change the times, or be refused with a clear code.
- **Oracle.** Round line count before vs after; no 5xx.
- **Trace.** P1 · manual · `app/controllers/api/trade_controller.rb:603,796-810` · `app/controllers/concerns/trade_controller_helper.rb:3906-3935`

## 2. Rescheduling an upcoming round (manual — every recipe starts bidding at publish)

#### API-EVDTME-016 — An upcoming round can be moved to a later window
- **Why it matters.** This is the product's Reschedule Event action; the schedule, close time and vendor view must all follow.
- **Setup.** An RFQ published with bid start = now + 2 h, end = now + 3 h, extra closing time now + 3.5 h; QA vendor 1 only (restricted audience); no bids. Manual: no recipe builds an upcoming round.
- **Steps.** 1. `PATCH /trade/<round>` with `{"bid_start_time": <now+4h>, "bid_end_time": <now+5h>, "extra_closing_time": <now+5.5h>}`. 2. `GET /trade/<round>?response_type=template`. 3. As QA vendor 1, open the round.
- **Expected.** HTTP 200. `starting_from` = now + 4 h, `ending_at` = now + 5 h, `extra_closing_time` = now + 5.5 h; the vendor sees the new times; QA vendor 1 gets the reschedule push.
- **Oracle.** Read-back values equal the sent epochs; trade schedule rows (bidding + extra closing) updated in place, not duplicated.
- **Trace.** P0 · manual · `app/controllers/api/trade_controller.rb:605-632` · `app/controllers/concerns/trade_controller_helper.rb:536-640`

#### API-EVDTME-017 — An upcoming round can be "rescheduled" to a start in the past
- **Why it matters.** The 258 guard checks the round's CURRENT start, not the new one, and `edit_trade_schedules` has no lower bound — the round goes live immediately with a start in the past and vendors get a "new trade" push instead of a scheduled-auction notice. The screen blocks this (UI-EVDTME-002); the API does not.
- **Setup.** An upcoming RFQ as API-EVDTME-016.
- **Steps.** `PATCH /trade/<round>` with `{"bid_start_time": <now-3600>, "bid_end_time": <now+3600>}`.
- **Expected (today).** HTTP 200; the round is running at once. Should be 422 code 195 'Invalid time.'.
- **Oracle.** `starting_from` < now after the call.
- **Trace.** P1 · manual · `app/controllers/api/trade_controller.rb:606` · `app/controllers/concerns/trade_controller_helper.rb:540-546` · `app/models/trade_request.rb:2113-2122`

#### API-EVDTME-018 — An end before (or equal to) the start is accepted
- **Why it matters.** There is no end-after-start check and no minimum duration anywhere on the reschedule path (TradeSchedule has no validations); a round with end ≤ start never runs and is closed by the close job at its "end".
- **Setup.** An upcoming RFQ as API-EVDTME-016.
- **Steps.** 1. `PATCH /trade/<round>` with `{"bid_start_time": <now+4h>, "bid_end_time": <now+3h>}`. 2. Repeat with end = start.
- **Expected (today).** HTTP 200 both times. Should be 422 code 195 'Invalid time.' (or 507 'Invalid Time Input').
- **Oracle.** Read-back `ending_at` ≤ `starting_from`; a vendor can never bid (code 33).
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:536-558` · `app/models/trade_schedule.rb:20-60`

#### API-EVDTME-019 — Leaving out the extra closing time silently drops the evaluation window
- **Why it matters.** `edit_trade_schedules` marks an existing extra closing schedule inactive whenever the reschedule body has no `extra_closing_time`; the dashboard always sends it, but any other caller loses the evaluation window without a word.
- **Setup.** An upcoming RFQ with an extra closing time (as API-EVDTME-016).
- **Steps.** 1. `PATCH /trade/<round>` with only `{"bid_start_time": <now+4h>, "bid_end_time": <now+5h>}`. 2. Read the round back.
- **Expected (today).** HTTP 200; `extra_closing_time` is gone and closed_at = the new bid end. Should keep the window (shifted) or refuse.
- **Oracle.** `extra_closing_time` absent/null in the read-back; the extra closing trade schedule row has status in_active.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:546,627-631`

#### API-EVDTME-020 — An upcoming pricing round cannot end before its technical round
- **Why it matters.** Business rule: the RFP must not end after the RFQ; the reschedule path runs the same check as publish.
- **Setup.** A live RFP+RFQ event where the RFQ is still upcoming (start in 2 h) and the RFP ends in 3 h.
- **Steps.** `PATCH /trade/<rfq round>` with `{"bid_start_time": <now+2h>, "bid_end_time": <now+2.5h>}`.
- **Expected.** Refused; nothing moves (the transaction is left early and rolled back). HTTP 422, code 712 'RFP duration exceeds RFQ end time. Please adjust.'.
- **Oracle.** 422 + 712; RFQ schedule unchanged.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:538-539,643-675`

#### API-EVDTME-021 — An upcoming technical round cannot be moved past its pricing round
- **Why it matters.** The same rule from the other side.
- **Setup.** A live RFP+RFQ event where the RFP is upcoming and the RFQ ends in 3 h.
- **Steps.** `PATCH /trade/<rfp round>` with `{"bid_start_time": <now+1h>, "bid_end_time": <now+4h>}`.
- **Expected.** HTTP 422, code 712 'RFP duration exceeds RFQ end time. Please adjust.'.
- **Oracle.** 422 + 712.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:668-669`

#### API-EVDTME-022 — Adding "from_mcp" to the body skips the RFP-before-RFQ rule
- **Why it matters.** The flag meant for the internal assistant is read straight from request params, so any console caller can bypass the 712 rule on a reschedule (the extension path reads it from code options instead and cannot be bypassed).
- **Setup.** As API-EVDTME-021.
- **Steps.** `PATCH /trade/<rfp round>` with `{"bid_start_time": <now+1h>, "bid_end_time": <now+4h>, "from_mcp": true}`.
- **Expected (today).** HTTP 200; the RFP now ends after the RFQ. Should be 712 regardless of the flag.
- **Oracle.** RFP `ending_at` > RFQ `ending_at` after the call.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:647` (compare `:2025` where from_mcp comes from options)

#### API-EVDTME-023 — Text times on an upcoming round crash the request
- **Why it matters.** `Time.at` is called on the raw parameter; a string raises TypeError, which is not rescued.
- **Setup.** An upcoming RFQ as API-EVDTME-016.
- **Steps.** `PATCH /trade/<round>` with `{"bid_start_time": "2026-10-10 10:00", "bid_end_time": "2026-10-10 12:00"}`.
- **Expected.** Should be 422 code 195 'Invalid time.'. Today HTTP 500 (TypeError in `Time.at`; in an RFP+RFQ event it already fails in the 712 check).
- **Oracle.** Status < 500.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:541,668-670`

#### API-EVDTME-024 — A bad delivery schedule in a reschedule cancels the whole reschedule
- **Why it matters.** Unlike the live-edit path (API-XDAMD-047/052), the reschedule path scopes the delivery schedule to the round and refuses an unknown one; because the refusal leaves the transaction early, Rails 7.0 rolls the new times back too.
- **Setup.** An upcoming RFQ as API-EVDTME-016.
- **Steps.** 1. `PATCH /trade/<round>` with `{"bid_start_time": <now+4h>, "bid_end_time": <now+5h>, "delivery_schedules": [{"uuid": "Z2dnWmdaUWtnZw==", "delivery_by": <now+30d>}]}`. 2. Read the round back. 3. Repeat with a real delivery schedule and `"delivery_by": null`.
- **Expected.** 1. HTTP 422, code 15 'Operation failed'; 2. the times are unchanged (rolled back); no reschedule notification. 3. Should be 422; today `Time.at(nil)` raises → HTTP 500.
- **Oracle.** Read-back times = the old ones after step 1; status < 500 in step 3.
- **Trace.** P2 · manual · `app/controllers/api/trade_controller.rb:622-629`

#### API-EVDTME-025 — A staggered auction's line times shift only by the change in start
- **Why it matters.** `reschedule_trade_products_time` adds (new start − old start) to every line and ignores the new end: lengthening the round leaves the tail with no open line; shortening leaves the last lines open after the round has ended.
- **Setup.** An upcoming staggered line-item auction, 3 lines of 20 min each (start S, end S+60 min), QA vendors only.
- **Steps.** 1. Reschedule to start S+1 h, end S+1 h+30 min (shorter). 2. Read `misc.trade_products_time` back. 3. Separately, reschedule to start S+1 h, end S+3 h (longer).
- **Expected (today).** Lines move by exactly +1 h in both cases: in 1 the third line ends 30 min after the round; in 3 the round has 2 h with no open line. Should rescale the lines or refuse a duration change on a staggered round.
- **Oracle.** Max line end vs `ending_at`.
- **Trace.** P1 · manual · `app/controllers/api/trade_controller.rb:614` · `app/controllers/concerns/trade_template_helper.rb:1632-1643`

#### API-EVDTME-026 — Rescheduling a knockout or Dutch auction rebuilds its rounds
- **Why it matters.** Knockout/Dutch auctions run in rounds; the old rounds must be voided and new ones built from the new start, or the auction runs on the old clock.
- **Setup.** An upcoming knockout auction (QA vendors only).
- **Steps.** Reschedule it; read its trade rounds back.
- **Expected.** HTTP 200; previous active rounds are void, a new set starts at the new start with the same price/time difference; for Dutch with rfx projects, the round scheduler job is enqueued for the first round's end.
- **Oracle.** trade_rounds rows: old status void, new version = previous max + 1.
- **Trace.** P2 · manual · `app/controllers/api/trade_controller.rb:621` · `app/controllers/concerns/trade_controller_helper.rb:4508-4520`

#### API-EVDTME-027 — Rescheduling an RFQ or a technical round tells vendors by push only
- **Why it matters.** The new reschedule emails are for auctions only (and RFI has its own mails); a vendor invited to an RFQ or RFP whose start moved gets no email.
- **Setup.** An upcoming RFQ and an upcoming RFP round, QA vendor 1 invited to each.
- **Steps.** Reschedule each; check QA vendor 1's mailbox and push/notification menu.
- **Expected (today).** A push ("auction notification" when the audience is everyone, plus the 15-minutes-before push) and the manager push when `auction_create_notification_to_admins` is on; no email. Product to confirm whether RFQ/RFP vendors should be emailed.
- **Oracle.** No email to QA vendor 1; notification-menu entry present.
- **Trace.** P2 · manual · `app/models/trade_request.rb:1977-1984,2113-2125,2231-2240`

#### API-EVDTME-028 — After a reschedule, a vendor cannot bid at the old start time
- **Why it matters.** The bid lock follows the moved clock: a vendor who prepared for the original start must be told to wait, not allowed in early.
- **Setup.** An upcoming RFQ with QA vendor 1, originally starting at T; rescheduled to start at T+1 h.
- **Steps.** At T + 1 min, as QA vendor 1, `POST /v1/bids` for the round.
- **Expected.** Refused. HTTP 422, code 33 'Order not active' (not running).
- **Oracle.** 422 + 33; at T+1 h the same call succeeds.
- **Trace.** P1 · manual · `app/helpers/api/v1/bids_controller_helper.rb:71-73` · `app/models/trade_request.rb:1191-1194`

## 3. Auction reschedule and extension emails (commit c74ea64581, manual)

#### API-EVDTME-029 — Rescheduling an upcoming auction emails each invited vendor the old and new times
- **Why it matters.** New in #16149: vendors used to learn of an auction reschedule only by push.
- **Setup.** An upcoming auction (rfx_mode auction) with a restricted audience of QA vendor 1 and QA vendor 2 only; a company with NO active auction team (or one made only of QA users) — the buyer-side mail goes to every auction-team member.
- **Steps.** Reschedule the auction from start S to S+2 h; open QA vendor 1's and 2's mailboxes.
- **Expected.** Each QA vendor gets "📅 <ref> | Auction has been rescheduled" with old start/end and new start/end in the vendor's own time zone and the invited count; plus the "Auction has been rescheduled." push (auction_reschedule_to_vendor).
- **Oracle.** Mail body old start = S, new start = S+2 h; one mail per vendor user with an email.
- **Trace.** P0 · manual · `app/models/trade_request.rb:294,1977-1984,2384-2404` · `app/workers/email_notification_worker.rb:501-520` · `app/mailers/auction_reschedule_mailer.rb:2-13`

#### API-EVDTME-030 — The buyer-side reschedule mail goes to the owner and the auction team and names who rescheduled
- **Why it matters.** The owner must know another user moved their auction.
- **Setup.** As API-EVDTME-029; a second QA buyer (not the owner) does the reschedule; auction team = QA users only.
- **Steps.** Reschedule as the second buyer; open the owner's and auction-team mailboxes.
- **Expected.** The owner gets "📅 <ref> | Auction has been rescheduled by <second buyer>"; each other auction-team member gets the same mail once; the owner is not mailed twice; push "Auction rescheduled" to owner + team.
- **Oracle.** Recipients = owner ∪ auction team, de-duplicated; "by" = the rescheduling user (falls back to the owner when the user id is missing).
- **Trace.** P1 · manual · `app/workers/email_notification_worker.rb:522-545` · `app/mailers/auction_reschedule_mailer.rb:31-48` · `lib/modules/push_notification.rb` (notify_buyer_on_auction_reschedule)

#### API-EVDTME-031 — The 24-hour and 30-minute start reminders follow the new start
- **Why it matters.** Without re-planning, vendors would be reminded for the old start; the old jobs are left queued and must drop themselves.
- **Setup.** An upcoming auction starting in 3 days; QA vendors only.
- **Steps.** Reschedule to start in 2 days; watch the Sidekiq schedule and QA vendor mailboxes at the old and new reminder times.
- **Expected.** New jobs at new start − 24 h and − 30 min; the old jobs fire at their time and do nothing (the worker skips a reminder more than one minute away from start − 24 h / − 30 min); each vendor receives exactly one 24-hour and one 30-minute reminder.
- **Oracle.** Mail count per vendor = 1 per reminder type.
- **Trace.** P1 · manual · `app/models/trade_request.rb:2406-2413` · `app/workers/email_notification_worker.rb:591-604`

#### API-EVDTME-032 — An RFQ-then-auction rescheduled with its evaluation time sends each start reminder twice
- **Why it matters.** For rfq_then_auction rounds `edit_trade_schedules` already queues the 24 h / 30 min reminders whenever `extra_closing_time` is sent (and the dashboard always sends it), and the new `reschedule_auction_reminder_jobs` queues them again; both pass the ±1 minute check, so vendors get duplicates.
- **Setup.** An upcoming RFQ-then-auction round with an extra closing time, start more than 24 h away; QA vendors only.
- **Steps.** Reschedule it via the dashboard dialog (body includes `extra_closing_time`); count the reminder mails each QA vendor receives.
- **Expected.** One 24-hour and one 30-minute reminder per vendor. Today: two of each (suspected defect from #16149).
- **Oracle.** Sidekiq schedule holds two `auction_reminder_24h_before` jobs for the round at the same time.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:597-615` · `app/models/trade_request.rb:2384-2413`

#### API-EVDTME-033 — Moving an auction earlier can lose the 80% expiry reminder
- **Why it matters.** A reschedule re-plans the start reminders but not the expiry reminders; the old 80% job only re-times itself forward, so if the new 80% point is before the old job, the reminder comes late — or not at all once the round has ended.
- **Setup.** An upcoming auction (start S, 1 h long) with `send_event_expiry_reminder_to_vendor` true; QA vendors only.
- **Steps.** Reschedule to start S − 3 h (same length); watch for the "expiry reminder" mail.
- **Expected (today).** The reminder that was due at S+48 min fires after the new round has ended and is dropped (`bid_end_time < now`); vendors get no expiry reminder. Should be re-planned to new start + 80%.
- **Oracle.** No `event_expiry_reminder_to_vendor` mail during the new window.
- **Trace.** P2 · manual · `app/models/trade_request.rb:2384-2413` · `app/workers/email_notification_worker.rb:272-283`

#### API-EVDTME-034 — Extending a live auction emails vendors "Submission time extended"
- **Why it matters.** New in #16149: vendors used to get only a push when an auction was extended.
- **Setup.** A live auction (rfx_mode auction, not knockout/Dutch, not BOQ) with QA vendors 1 and 2 only.
- **Steps.** Extend it (`PATCH /trade/<round>` with `increase_auction_time` = end + 10 min); open both mailboxes.
- **Expected.** Each vendor gets "⏰ <ref>[ Lot-n] | Submission time extended for <mode>" with the new end date/time in its time zone and the line items; plus the "buyer_time_increase" push.
- **Oracle.** One mail per vendor; new end in the mail = the read-back `ending_at`.
- **Trace.** P0 · manual · `app/controllers/api/trade_controller.rb:641-684` · `app/models/trade_request.rb:2152-2160` · `app/workers/email_notification_worker.rb:547-563` · `app/mailers/auction_reschedule_mailer.rb:15-29`

#### API-EVDTME-035 — Which extensions do NOT send the new email
- **Why it matters.** The mail is gated on auction mode; testers must not expect it elsewhere, and the gaps should be a product decision.
- **Setup.** Live rounds of each kind, QA vendors only: RFQ, knockout auction, Dutch auction, BOQ auction, staggered line-item auction.
- **Steps.** Extend each by its normal path (staggered: the screen's per-line extension, API-EVDTME-045; also reopen lines, API-EVDTME-048); check mailboxes.
- **Expected (today).** No "Submission time extended" mail for RFQ (not `is_auction?`), knockout/Dutch (excluded), BOQ (gets the older bidding-time-extension mail instead) and staggered per-line changes (no extension flag is set). Only `auction` / `rfq_then_auction` rounds get it.
- **Oracle.** Mail present only for auction / rfq_then_auction.
- **Trace.** P2 · manual · `app/models/trade_request.rb:1519-1521,2152-2160` · `app/controllers/concerns/trade_controller_helper.rb:2113-2177`

#### API-EVDTME-036 — Force-ending an auction emails vendors "Submission time extended"
- **Why it matters.** Force-close during submission is implemented as `increase_auction_time = now`, which sets the same flag as an extension; after #16149 every vendor receives "Submission time extended" at the moment the auction is ended early.
- **Setup.** A live auction with QA vendors only; company config `trade_force_close` on.
- **Steps.** `PATCH /trade/<round>` with `{"force_end": true, "remarks": "QA_Platform_force_end"}`; open the vendors' mailboxes.
- **Expected.** The auction ends; vendors are told it ended. Today they also receive "⏰ … | Submission time extended for Auction" showing the new (past) end time (suspected defect).
- **Oracle.** Presence of the submission-extended mail after a force end.
- **Trace.** P1 · manual · `app/controllers/api/trade_controller.rb:423-431,680-684` · `app/controllers/concerns/trade_controller_helper.rb:5903-5911` · `app/models/trade_request.rb:2156-2158`

#### API-EVDTME-037 — Pulling an auction's end earlier also emails "Submission time extended"
- **Why it matters.** The extension field accepts an earlier time (API-EVDTME-066); the email does not distinguish and tells vendors their time was extended when it was cut.
- **Setup.** A live auction ending in 30 min, QA vendors only.
- **Steps.** `PATCH /trade/<round>` with `increase_auction_time` = now + 5 min; open the mailboxes.
- **Expected (today).** 200; vendors get "Submission time extended" with the earlier end. Should be refused (or worded as a change, not an extension).
- **Oracle.** Mail subject vs new `ending_at` < old.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:5824-5833` · `app/models/trade_request.rb:2156-2158`

#### API-EVDTME-038 — After an extension, vendors get the expiry reminder again at the new 80% point
- **Why it matters.** #16149 re-plans expiry reminders on extension so a vendor reminded before the extension is reminded again before the new end.
- **Setup.** A live auction (start S, 60 min) with QA vendors; round config `send_event_expiry_reminder_to_vendor` = true and `event_expiry_reminder_times` = [0.8] (key read at trade_request.rb:2208-2211).
- **Steps.** 1. Wait until S + 50 min (the 80% reminder has fired). 2. Extend to S + 120 min. 3. Watch mailboxes. 4. On a second auction, extend at S + 30 min (before the 80% point).
- **Expected.** 1–3: a second reminder at S + 96 min (80% of the new length). 4: no new job is queued; the original job fires at S + 48 min, sees the new 80% point is ≥ 2 min away and re-times itself to S + 96 min — one reminder in total. With the config not exactly `true` (e.g. "true" text) no vendor reminder is re-planned.
- **Oracle.** Reminder mail times per vendor.
- **Trace.** P1 · manual · `app/models/trade_request.rb:2176-2229` · `app/workers/email_notification_worker.rb:272-283`

#### API-EVDTME-039 — An extension can start buyer expiry reminders an event never had
- **Why it matters.** At publish, buyer expiry reminders are planned only for single-round (dummy event group) events; the new extension code plans one for any auction unless `send_event_expiry_reminder_to_buyer` = "disable_for_buyer", so buyers of normal events start receiving a reminder only after a late extension.
- **Setup.** A live auction inside a normal (non-dummy) event group; `send_event_expiry_reminder_to_buyer` absent; QA buyer is the only buyer-side user.
- **Steps.** Past the 80% point, extend the auction by 60 min; check the buyer's mailbox. Repeat with `send_event_expiry_reminder_to_buyer` = "disable_for_buyer".
- **Expected (today).** First run: the buyer gets an expiry reminder at the new 80% point (none existed before). Second run: none. Product to confirm whether the first is intended.
- **Oracle.** `event_expiry_reminder_to_buyer` job present only in the first run.
- **Trace.** P2 · manual · `app/models/trade_request.rb:2133-2149,2186-2203`

#### API-EVDTME-040 — A refused or rolled-back reschedule sends nothing
- **Why it matters.** The reschedule notifications moved from `after_save` to `after_save_commit` in #16149; a reschedule that fails after the save (bad delivery schedule, API-EVDTME-024) must not tell vendors their auction moved.
- **Setup.** An upcoming auction, QA vendors only.
- **Steps.** 1. Reschedule with an unknown delivery schedule id (code 15). 2. Try to reschedule after it has started (code 258).
- **Expected.** No reschedule mail or push in either case; times unchanged.
- **Oracle.** QA vendor mailboxes and notification menus empty for the round.
- **Trace.** P2 · manual · `app/models/trade_request.rb:294` · `app/controllers/api/trade_controller.rb:606,622-629`

## 4. Per-line closing times — `PATCH /trade/:id/staggered_time` (beyond API-XDLOT-060…066)

#### API-EVDTME-041 — Per-line times on a draft round are refused
- **Why it matters.** staggered_time has no permission check of its own; the lookup (active rounds only) and the staggered check are all that stand between a caller and the schedule.
- **Setup.** A fresh draft event with an unpublished RFQ round.
- **Steps.** `PATCH /trade/{{tradeId}}/staggered_time` with `{"trade_products_time": {"999999999": {"start_time": {{now+60}}, "end_time": {{now+600}}}}}`.
- **Expected.** Refused. HTTP 422, code 4 'Request not found' — a draft is not in the active lookup.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EVD2-TME-041` · `app/controllers/api/trade_controller.rb:1408-1411`

#### API-EVDTME-042 — Per-line times on a closed round are refused
- **Why it matters.** Re-timing lines after close would reopen bidding through the back door.
- **Setup.** A fresh RFQ whose window and extra closing time are over; no bids.
- **Steps.** As API-EVDTME-041 on this round.
- **Expected.** HTTP 422, code 4 'Request not found' (not active, or not staggered — both answer 4).
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EVD2-TME-042` · `app/controllers/api/trade_controller.rb:1408-1412`

#### API-EVDTME-043 — Per-line times on a technical round are refused
- **Why it matters.** A technical round never has per-line closing.
- **Setup.** A fresh live RFP+RFQ event.
- **Steps.** As API-EVDTME-041 on `/trade/{{rfpTradeId}}/staggered_time`.
- **Expected.** HTTP 422, code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EVD2-TME-043` · `app/controllers/api/trade_controller.rb:1408-1412` · `app/controllers/concerns/trade_template_helper.rb:1626-1630`

#### API-EVDTME-044 — Per-line times on an awarded round are refused
- **Why it matters.** Nothing about an awarded round's clock may change.
- **Setup.** A fresh RFQ with QA vendor 1's bid, closed, award proposal submitted.
- **Steps.** As API-EVDTME-041 on this round.
- **Expected.** HTTP 422, code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EVD2-TME-044` · `app/controllers/api/trade_controller.rb:1408-1412`

#### API-EVDTME-045 — Extending a live staggered auction from the screen tells nobody and keeps no remark
- **Why it matters.** On a live staggered round the "Increase time" dialog calls staggered_time instead of the normal extension (UI-EVDTME-006); that action sets no extension flag, so vendors get no push or email, the bids' stored end time is not updated, and the remark typed in the dialog is never sent.
- **Setup.** A live staggered line-item auction with QA vendors 1 and 2 (each bid on line 1); line 2 running.
- **Steps.** In the buyer console, Settings → Increase time by 10 min with a remark; then check vendor notifications/mail, the round's remarks and the bids' end time.
- **Expected (today).** HTTP 200; running and upcoming lines move +10 min (and the round + evaluation end if the last line now ends later); no vendor notice, no remark, bids' end_time unchanged. Should notify vendors and record the remark like a normal extension.
- **Oracle.** No `buyer_time_increase` push; `remarks` without the new entry.
- **Trace.** P1 · manual · `app/controllers/api/trade_controller.rb:1408-1423` (compare `:680-684`) · `procol-client-dashboard src/views/orderDetails/orderDetails.jsx:472-499,597-600`

#### API-EVDTME-046 — Per-line times sent as a list or as text crash the request
- **Why it matters.** The code iterates `trade_products_time` as a key→times map; a list element arrives as the "key" with nil times and text has no `each` — both unrescued.
- **Setup.** A live staggered auction; buyer console.
- **Steps.** 1. `PATCH /trade/<round>/staggered_time` with `{"trade_products_time": [{"start_time": <now>, "end_time": <now+600>}]}`. 2. Same with `{"trade_products_time": "QA_Platform_text"}`.
- **Expected.** Should be 422 (code 2 or 507 'Invalid Time Input'). Today HTTP 500 (NoMethodError on nil / on String).
- **Oracle.** Status < 500.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:2120-2125`

#### API-EVDTME-047 — A normal extension of a staggered round leaves every line closed at its old time
- **Why it matters.** `increase_auction_time` moves the round's end but not the per-line windows; after the generic save the line hash is only re-validated, so the extra time has no open line and vendors still cannot bid (suspected — confirm the line-level bid check).
- **Setup.** A live staggered auction (3 lines); QA vendor 1 invited; the last line ends with the round.
- **Steps.** 1. `PATCH /trade/<round>` with `increase_auction_time` = end + 15 min. 2. Read `misc.trade_products_time`. 3. 5 minutes after the old end, QA vendor 1 tries to bid on line 3.
- **Expected (today).** Step 1: 200; step 2: line times unchanged; step 3: refused (line closed). Should extend the running/last line (as the screen's per-line path does) or refuse the plain extension on staggered rounds.
- **Oracle.** Max line end < `ending_at` after the call.
- **Trace.** P1 · manual · `app/controllers/api/trade_controller.rb:642-690,769-775` · `app/controllers/concerns/trade_controller_helper.rb:2113-2143`

## 5. Reopening expired lines — `POST /trade/:id/reopen_line_items`

#### API-EVDTME-048 — Reopening two expired lines gives each its own slot after the round's end
- **Why it matters.** This is the Reopen Line Items drawer; vendors must be able to bid again on exactly those lines, one after another.
- **Setup.** A live staggered line-item auction, 3 lines; lines 1 and 2 have ended, line 3 is running; round end E, evaluation end E+30 min; QA vendors only.
- **Steps.** 1. `POST /trade/<round>/reopen_line_items` with `{"trade_product_uuids": ["<line 1>", "<line 2>"], "reopen_time_extension": 600}`. 2. Read the round back.
- **Expected.** HTTP 200. Line 1: E → E+10 min; line 2: E+10 → E+20 min; both flagged in `misc.trade_products_reopened_status`; round bid end = E+20 min; evaluation end moved by the same 20 min (E+50 min); closed_at = the new evaluation end.
- **Oracle.** `misc.trade_products_time` and `ending_at` / `extra_closing_time` in the read-back.
- **Trace.** P0 · manual · `app/controllers/api/trade_controller.rb:1426-1445` · `app/controllers/concerns/trade_controller_helper.rb:2146-2197`

#### API-EVDTME-049 — Reopening during the evaluation window needs the right to reopen an expired event
- **Why it matters.** The drawer is offered in the "buffer" (evaluation) state, but once the round's bidding has ended the schedule update applies the reopen rule; buyers without that right get a refusal the screen does not explain.
- **Setup.** A staggered auction whose bidding has ended and whose evaluation window is running; a buyer who is not super admin / Procol, company without `user_allowed_to_reopen_event`.
- **Steps.** Reopen one expired line for 10 min.
- **Expected.** HTTP 422, code 496 'You are not allowed to reopen an expired event'. With the right: 200 and the line runs from NOW (not from the old end) for 10 min.
- **Oracle.** 496 / line start ≈ request time.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:2155,5830-5831`

#### API-EVDTME-050 — Reopening a line that has not ended yet is refused with a misleading message
- **Why it matters.** The check is right, the message ('Operation failed') is not.
- **Setup.** A live staggered auction where line 3 is still running.
- **Steps.** Reopen line 3 for 10 min.
- **Expected.** Refused: HTTP 422, code 15 'Operation failed'. Should say the line is still open.
- **Oracle.** 422 + 15; line 3 times unchanged.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:6771-6782`

#### API-EVDTME-051 — Reopening with no lines, or a zero, negative or word extension, is refused on a staggered round
- **Why it matters.** The parameter checks behind the round check; on a staggered round they are what answers.
- **Setup.** A live staggered auction with one expired line.
- **Steps.** Send `{"reopen_time_extension": 600}`; then `{"trade_product_uuids": ["<line>"], "reopen_time_extension": 0}`; `-600`; `"ten"`.
- **Expected.** Each: HTTP 422, code 2 'Insufficient parameters' (a word converts to 0).
- **Oracle.** 422 + 2 four times; times unchanged.
- **Trace.** P2 · manual · `app/controllers/api/trade_controller.rb:1433-1437`

#### API-EVDTME-052 — A numeric extension sent as text crashes the reopen
- **Why it matters.** "600" passes the `.to_i > 0` check but is then added to an integer time unconverted.
- **Setup.** A live staggered auction with one expired line.
- **Steps.** `POST /trade/<round>/reopen_line_items` with `{"trade_product_uuids": ["<line>"], "reopen_time_extension": "600"}`.
- **Expected.** Should be 200 (or 422). Today HTTP 500 (TypeError: String can't be coerced into Integer); the transaction is rolled back.
- **Oracle.** Status < 500.
- **Trace.** P1 · manual · `app/controllers/api/trade_controller.rb:1434-1441` · `app/controllers/concerns/trade_controller_helper.rb:2158-2160`

#### API-EVDTME-053 — An unknown line id crashes the reopen
- **Why it matters.** The validator silently drops ids that are not lines of the round, then the loop writes into a missing entry.
- **Setup.** A live staggered auction with one expired line.
- **Steps.** Reopen `["<expired line>", "Z2dnWmdaUWtnZw=="]` for 600 s.
- **Expected.** Should be 422 (code 80 'Product not found' or 2). Today HTTP 500 (NoMethodError on nil) — rolled back.
- **Oracle.** Status < 500.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:2149-2165,6771-6779`

#### API-EVDTME-054 — A null line list crashes before the controller runs
- **Why it matters.** `trade_product_uuids` is the exact key the drawer sends; the id decoding that runs before every action calls `.map` on any key ending in "uuids", so null from a bad client is a server error (same class as API-XPUB-011, on this endpoint).
- **Setup.** A fresh live RFQ (not staggered), QA vendor 1 invited, no bids.
- **Steps.** `POST /trade/{{tradeId}}/reopen_line_items` with `{"trade_product_uuids": null, "reopen_time_extension": 600}`.
- **Expected.** Should be refused cleanly (422; code 4 here since the round is not staggered). Today HTTP 500 (NoMethodError: undefined method `map` for nil).
- **Oracle.** Status < 500.
- **Trace.** P1 · automate · `EVD2-TME-054` · `app/controllers/concerns/params_auth.rb:72-73`

#### API-EVDTME-055 — Any buyer of the company with create rights can reopen lines of someone else's auction
- **Why it matters.** reopen_line_items checks only "may create events" and "same company", not ownership or team (reschedule and extension use the full `update?` policy).
- **Setup.** Buyer B of the same company, with create permission, not on the owner's team, not super admin; a live staggered auction owned by A with an expired line.
- **Steps.** As B, reopen the expired line.
- **Expected (today).** HTTP 200. Product to confirm; the reschedule/extension equivalent applies `update?`.
- **Oracle.** Line reopened by B (paper trail whodunnit = B).
- **Trace.** P2 · manual · `app/controllers/api/trade_controller.rb:1427-1429` (compare `:404`)

#### API-EVDTME-056 — Reopened lines are not announced to vendors
- **Why it matters.** Vendors who saw a line close have no reason to come back unless told; the reopen sets none of the extension notification flags.
- **Setup.** As API-EVDTME-048, QA vendors 1 and 2.
- **Steps.** Reopen two lines; check vendor push/notification menu and mailboxes.
- **Expected (today).** No push or email about the reopen (the round's live view updates only when the vendor reloads). Product to confirm.
- **Oracle.** No new notification for QA vendors.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:2146-2177` · `app/models/trade_request.rb:2152-2171`

#### API-EVDTME-057 — Reopening a line on a round that is not staggered
- **Why it matters.** Reopening exists only for staggered line-item auctions; on anything else the call must change nothing.
- **Setup.** A fresh live RFQ (not staggered), QA vendor 1 invited, no bids. The buyer has create permission.
- **Steps.** `POST /trade/{{tradeId}}/reopen_line_items` with `{"trade_product_uuids": ["Z2dnWmdaUWtnZw=="], "reopen_time_extension": 600}`.
- **Expected.** Refused. HTTP 422, code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EVD2-TME-057` · `app/controllers/api/trade_controller.rb:1426-1431`

#### API-EVDTME-058 — Reopen without naming any line: the round check answers first
- **Why it matters.** Pins the guard order (permission → own active round → staggered → parameters); on a staggered round this body answers 2 (API-EVDTME-051).
- **Setup.** A fresh live RFQ (not staggered).
- **Steps.** `POST /trade/{{tradeId}}/reopen_line_items` with `{"reopen_time_extension": 600}`.
- **Expected.** HTTP 422, code 4 'Request not found'.
- **Oracle.** 422 + 4 (not 2).
- **Trace.** P2 · automate · `EVD2-TME-058` · `app/controllers/api/trade_controller.rb:1426-1437`

#### API-EVDTME-059 — Reopen for zero seconds: the round check answers first
- **Why it matters.** Boundary of the extension check, behind the round check.
- **Setup.** A fresh live RFQ (not staggered).
- **Steps.** `POST /trade/{{tradeId}}/reopen_line_items` with `{"trade_product_uuids": ["Z2dnWmdaUWtnZw=="], "reopen_time_extension": 0}`.
- **Expected.** HTTP 422, code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EVD2-TME-059` · `app/controllers/api/trade_controller.rb:1426-1437`

#### API-EVDTME-060 — Reopen with the extension written as a word: the round check answers first
- **Why it matters.** Hostile input must be refused cleanly, never reach the time arithmetic on a non-staggered round.
- **Setup.** A fresh live RFQ (not staggered).
- **Steps.** `POST /trade/{{tradeId}}/reopen_line_items` with `{"trade_product_uuids": ["Z2dnWmdaUWtnZw=="], "reopen_time_extension": "QA_Platform_ten_minutes_{{stamp}}"}`.
- **Expected.** HTTP 422, code 4 'Request not found'.
- **Oracle.** 422 + 4, not 5xx.
- **Trace.** P2 · automate · `EVD2-TME-060` · `app/controllers/api/trade_controller.rb:1426-1437`

#### API-EVDTME-061 — Reopen on a round that does not exist
- **Why it matters.** Bogus ids fail closed.
- **Setup.** Signed-in QA buyer; no event.
- **Steps.** `POST /trade/Z2dnWmdaUWtnZw==/reopen_line_items` with `{"trade_product_uuids": ["Z2dnWmdaUWtnZw=="], "reopen_time_extension": 600}`.
- **Expected.** HTTP 422, code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EVD2-TME-061` · `app/controllers/api/trade_controller.rb:1427-1430`

#### API-EVDTME-062 — Reopen with a garbled round id
- **Why it matters.** A garbled id decodes to nothing; the scoped lookup must not crash.
- **Setup.** Signed-in QA buyer; no event.
- **Steps.** `POST /trade/WrongUuid1=/reopen_line_items` with the body of API-EVDTME-061.
- **Expected.** HTTP 422, code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EVD2-TME-062` · `app/controllers/api/trade_controller.rb:1427-1430`

#### API-EVDTME-063 — Reopen on a draft round
- **Why it matters.** Only active rounds of the buyer's own company are looked up.
- **Setup.** A fresh draft event with an unpublished RFQ round.
- **Steps.** `POST /trade/{{tradeId}}/reopen_line_items` with the body of API-EVDTME-061.
- **Expected.** HTTP 422, code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EVD2-TME-063` · `app/controllers/api/trade_controller.rb:1429-1430`

#### API-EVDTME-064 — Reopen on a fully closed round
- **Why it matters.** After the evaluation window the round is closed; reopening lines then must be impossible.
- **Setup.** A fresh RFQ whose window and extra closing time are over; no bids.
- **Steps.** `POST /trade/{{tradeId}}/reopen_line_items` with the body of API-EVDTME-061.
- **Expected.** HTTP 422, code 4 'Request not found' (not active, or not staggered).
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EVD2-TME-064` · `app/controllers/api/trade_controller.rb:1429-1431`

#### API-EVDTME-065 — Reopen on a technical round
- **Why it matters.** A technical round has no lines to reopen.
- **Setup.** A fresh live RFP+RFQ event.
- **Steps.** `POST /trade/{{rfpTradeId}}/reopen_line_items` with the body of API-EVDTME-061.
- **Expected.** HTTP 422, code 4 'Request not found'.
- **Oracle.** 422 + 4.
- **Trace.** P2 · automate · `EVD2-TME-065` · `app/controllers/api/trade_controller.rb:1429-1431`

## 6. Late bids against a moved clock

#### API-EVDTME-066 — After the end is pulled in, a vendor cannot bid
- **Why it matters.** The extension field accepts a time EARLIER than the current end (no check that the new end is later), silently cutting the vendors' window; the bid lock-out must follow the new clock.
- **Setup.** A fresh live RFQ open about 20 minutes, QA vendor 1 invited, no bids. `counter_offer_modification_enabled` is off on the round (otherwise a vendor may still open a draft during the extra closing time).
- **Steps.** 1. As the buyer, `PATCH /trade/{{tradeId}}` with `{"increase_auction_time": {{now+90}}, "remarks": "QA_Platform_shorten_{{stamp}}"}`. 2. Wait until that end has passed. 3. As QA vendor 1, place a bid (open, price, submit). 4. Read the round back.
- **Expected (today).** Step 1 is accepted (should be refused — an extension to an earlier time is a shortening). Step 3 is refused at the first call: HTTP 422, code 33 'Order not active'.
- **Oracle.** Step 3 code 33; `ending_at` ≤ now in the read-back.
- **Trace.** P0 · automate · `EVD2-TME-066` · `app/controllers/concerns/trade_controller_helper.rb:5824-5833` · `app/helpers/api/v1/bids_controller_helper.rb:71-73`

#### API-EVDTME-067 — A draft opened before the end was pulled in cannot be priced after it
- **Why it matters.** A vendor half-way through a quote when the clock moves must not finish it after the new end.
- **Setup.** A fresh live RFQ open about 20 minutes, QA vendor 1 invited, no bids.
- **Steps.** 1. As QA vendor 1, open a draft bid. 2. As the buyer, pull the end in to now + 90 s. 3. Wait until it has passed. 4. As QA vendor 1, price the line on the draft from step 1.
- **Expected.** Step 4 is refused (HTTP 422): code 32 'Bid not found' once the end-of-bidding job has discarded drafts, otherwise code 33 'Order not active' (or 508 'Not allowed to bid on this product' where counter-offer modification is on and the round is in its extra closing time).
- **Oracle.** Step 4 is a 422, never 2xx or 5xx.
- **Trace.** P1 · automate · `EVD2-TME-067` · `app/controllers/api/v1/bids_controller.rb:113-127` · `app/controllers/concerns/bids_controller_helper.rb:792-800` · `app/workers/delete_draft_bids_worker.rb:7-21`

#### API-EVDTME-068 — A vendor who already bid cannot revise after the end is pulled in
- **Why it matters.** Revisions follow the moved clock too; a vendor must not slip a better price in after the new end.
- **Setup.** A fresh live RFQ where QA vendor 1 has submitted a bid, bidding still open; `counter_offer_modification_enabled` off on the round.
- **Steps.** 1. As the buyer, pull the end in to now + 90 s. 2. Wait until it has passed. 3. As QA vendor 1, place a new bid. 4. Read the round back.
- **Expected.** Step 3 is refused: HTTP 422, code 33 'Order not active'. The earlier bid remains the vendor's quote.
- **Oracle.** Step 3 code 33; `ending_at` ≤ now.
- **Trace.** P1 · automate · `EVD2-TME-068` · `app/helpers/api/v1/bids_controller_helper.rb:39-73`

## 7. Screens

#### UI-EVDTME-001 — The Reschedule dialog keeps the round's length and shifts the evaluation window
- **Why it matters.** The dialog asks only for a new start; the end and the extra closing time are derived, so a buyer cannot change the duration here — and the API's omission trap (API-EVDTME-019) is avoided only because the dialog sends the extra time.
- **Setup.** An upcoming RFQ, start S, end S+1 h, extra closing S+1.5 h.
- **Steps.** Settings → Reschedule Event; pick S+2 h; OK; watch the PATCH body.
- **Expected.** Body `{"bid_start_time": S+2h, "bid_end_time": S+3h, "extra_closing_time": S+3.5h}`; the header shows the new times.
- **Oracle.** Network request body; end − start unchanged.
- **Trace.** P1 · automate · `procol-client-dashboard src/views/orderDetails/rescheduleEventModal.jsx:25-63` · `src/redux/orders/actions.js:1880-1896`

#### UI-EVDTME-002 — The Reschedule dialog refuses a past time and a start after the delivery date
- **Why it matters.** The screen is the only guard against a past start (API-EVDTME-017).
- **Setup.** An upcoming RFQ with a delivery date D.
- **Steps.** 1. Pick today at a time already past. 2. Pick a date after D.
- **Expected.** 1. "Scheduled time is invalid!" and no request. 2. "Schedule time should be on or before  Delivery Date" (Pickup Date for sell events) and no request. Past days are disabled in the picker.
- **Oracle.** No PATCH sent; error text under the field.
- **Trace.** P1 · automate · `src/views/orderDetails/helpers.js:236-254` · `src/views/orderDetails/rescheduleEventModal.jsx:28,33-37`

#### UI-EVDTME-003 — Changing only the delivery date in the Reschedule dialog does not reschedule
- **Why it matters.** With the start unchanged the dialog sends no times, so the request takes the live-edit path (unscoped delivery schedule lookup, API-XDAMD-052) instead of the reschedule path.
- **Setup.** An upcoming RFQ with a delivery date.
- **Steps.** Open Reschedule; change only the delivery date; OK.
- **Expected.** Body contains only `delivery_schedules: [{delivery_by, uuid}]` (no bid times); the round's times are unchanged; no reschedule notification.
- **Oracle.** Network request body; no reschedule push to vendors.
- **Trace.** P2 · automate · `src/views/orderDetails/rescheduleEventModal.jsx:40-63` · `src/redux/orders/actions.js:1880-1896`

#### UI-EVDTME-004 — "Reopen Line Items" is offered only on staggered rounds and only after a line has expired
- **Why it matters.** The menu must match the backend rules (staggered only; reopen only expired lines).
- **Setup.** A live staggered auction before any line ends, the same after line 1 ends, and a live RFQ.
- **Steps.** Open Settings on each.
- **Expected.** RFQ: no item. Staggered, no line expired: item disabled with tooltip "Line items can only be reopened if at least one line item has expired". After line 1 ended: enabled. Shown in live and buffer (evaluation) status only.
- **Oracle.** Menu item presence/disabled state.
- **Trace.** P2 · automate · `src/views/orderDetails/eventHeader/eventHeader.jsx:235-246,666-681`

#### UI-EVDTME-005 — The Reopen drawer lists only expired lines and sends seconds
- **Why it matters.** The drawer decides which lines can be sent and converts the duration; a wrong unit would reopen for hours instead of minutes.
- **Setup.** A live staggered auction with lines 1–2 expired, line 3 running; serial duration 10 min.
- **Steps.** Open the drawer; try OK with nothing selected and with an empty duration; then select lines 1 and 2, keep 10 minutes, OK.
- **Expected.** Only lines 1–2 are listed (with bid counts); errors for no selection / no duration and no request; final body `{"trade_product_uuids": [<line 1>, <line 2>], "reopen_time_extension": 600}`; success message "Line items reopened successfully"; tooltip explains reopened lines move to the end.
- **Oracle.** Network body; the reopened lines appear after line 3 in the schedule.
- **Trace.** P1 · automate · `src/views/orderDetails/reopenLineItem/reopenLineItemDrawer.jsx:53-95` · `src/views/orderDetails/reopenLineItem/mutation.js:5-13`

#### UI-EVDTME-006 — "Increase time" on a live staggered round re-times the lines instead of the round
- **Why it matters.** This is the only caller of staggered_time; the payload decides which lines move (and explains API-EVDTME-045).
- **Setup.** A live staggered auction: line 1 expired, line 2 running, line 3 upcoming.
- **Steps.** Settings → Increase time by 10 minutes with a remark; watch the request.
- **Expected.** `PATCH /trade/<id>/staggered_time` with `trade_products_time` = { line 2: same start, end + 600; line 3: start + 600, end + 600 }; line 1 omitted; no remark and no `increase_auction_time` in the body. In buffer status the normal extension is sent instead.
- **Oracle.** Network body.
- **Trace.** P1 · automate · `src/views/orderDetails/orderDetails.jsx:472-499,597-600` · `src/redux/orders/actions.js:528-540`
