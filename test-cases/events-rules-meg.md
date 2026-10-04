# The event, its lines, technical answers and scoring (event model) — rule cases

Cases for the rules of the event (project), event line, technical answer, evaluation and score models that no written case
checked yet, extracted from `prototype/knowledge/events/backend-digest/models-event-group.md`. Each case names its rule
(`R-MEG-…`, `prototype/data/rules/events-rules.json`) and the line of `procol-backend` (origin/main ae36e86894) that makes it
true; the cited lines of every P0/P1 case were opened before writing. Vendor-onboarding rounds, flexi (FxResponse) links, enum
integers and Clara mail-routing internals are outside the sourcing-event scope or not observable and are listed in
`prototype/data/rules/not-checkable.json`. Runnable twin: EDGE-EVRMEG-005 (`data/api-cases-extra/rules-meg.json`).

"Line-level scoring" = the technical round scores each line per vendor; "lot-level" = one score per vendor for the whole round;
"section-wise" = scored per form section with section weights.

## 1. Event times, numbers, rounds and summary

#### API-EVRMEG-001 — The event's start, end and current round follow its live rounds
- **Why it matters.** The event card's dates and "current stage" decide where a buyer lands; a cancelled round must not drag them.
- **Setup.** Event with a technical round (Mon 10:00 → Tue 10:00), a price round (Wed 10:00 → Thu 10:00) and a cancelled round (Sun → Fri).
- **Steps.** Read the event on Sun, Mon 12:00, Tue 12:00 (between rounds), Wed 12:00 and Fri.
- **Expected.** Start Mon 10:00, end Thu 10:00 (the cancelled round is ignored). Current round: Sun → technical (first not started), Mon 12:00 → technical (running), Tue 12:00 → technical (the previous one, the next has not started), Wed 12:00 → price round, Fri → price round (last). Reports show "Total Duration" = start → end.
- **Oracle.** Event read `current_active_stage` uuid (`event_group/show_serializer.rb:201`); `starting_from` / `ending_at` / `current_active_stage` / `total_duration` (`event_group.rb:439-447, 671-673`); rounds exclude void and cancelled (`:62`, `trade_request.rb:256-259`).
- **Trace.** P1 · automate-later · `R-MEG-005-1` `R-MEG-005-2` `R-MEG-005-3` `R-MEG-005-4` · `app/models/event_group.rb:439-447`

#### API-EVRMEG-002 — Reports of an event with no price round are produced, not crashed
- **Why it matters.** Technical-only events (or events whose price rounds were all withdrawn) still need their Master QCS and auction reports; the report header looks up "the latest price round" without checking that one exists.
- **Setup.** Event A with only a technical round, evaluated. Event B whose only price round was withdrawn. Event C with a round that has no start time.
- **Steps.** Download the Master QCS (and the auction report) for each.
- **Expected.** Each report is produced; header fields that need a price round are blank. Title "<lot>/<event>" for a lot report; id = event number.
- **Expected (today).** A and B: the summary raises on `nil.template` (no price round); C: `nil.strftime` on the start; an event with a round whose closing time is empty raises in `max` (unverified that an empty closing time occurs).
- **Oracle.** `get_summary_data` (`event_group.rb:813-838`) called by `master_qcs_report.rb:54`, `master_qcs_report_v1.rb:43`, `auction_report.rb:43`; `ending_at` uses `max` without `compact` (`:444-447`). Report status "failed" or never ready.
- **Trace.** P1 · manual · `R-MEG-006-1` `R-MEG-006-2` `R-MEG-006-3` `R-MEG-006-4` `R-MEG-005-6` · `app/models/event_group.rb:813-838`

#### API-EVRMEG-003 — Event numbers are "RFX-n", gain ".1", ".2" on each amendment, and can be searched
- **Why it matters.** The event number is how buyers and vendors refer to an event across amendments; a reused number points two teams at different events.
- **Setup.** Company with n events; event E numbered RFX-n. `gate: show_reference_id` on and off.
- **Steps.** 1. Create an event. 2. Amend E twice. 3. Search the events list for "RFX-n.2".
- **Expected.** The new event is RFX-(n+1) and no two of the company's events share a number. E's versions read RFX-n.1 then RFX-n.2; search by "RFX-n.2" finds the second amendment. With reference display on, titles read "Title [RFX-n]".
- **Oracle.** `add_ref_id` = "RFX-" + count of the company's latest events (`event_group.rb:429-433`) — a count, not a sequence, so reuse after a count drop is possible (unverified in data); versioned ref (`versioning/methods.rb:86-95`), order (`item_version.rb:55, 102-105`); search ILIKE (`event_group.rb:90-92`); `title_ref` (`:228-230, 319-321`).
- **Trace.** P2 · automate-later · `R-MEG-002-5` `R-MEG-002-6` `R-MEG-013-1` `R-MEG-013-3` `R-MEG-029-2` · `app/models/event_group.rb:429-433`

#### API-EVRMEG-004 — Event-level money uses the latest price round's base currency and precision
- **Why it matters.** Event totals in reports are shown in one currency; using the company default when the price round is in USD mislabels every amount.
- **Setup.** Event 1 with no price round; event 2 whose latest price round is multi-currency (base USD, adjusted precision 3); event 3 whose price round has no currency setup.
- **Steps.** Read the event-level currency and precision (Master QCS header / event totals).
- **Expected.** 1: company default currency with its default precision. 2: USD, precision 3 (adjusted). 3: the price round's default currency, default precision.
- **Oracle.** `event_group.rb:640-668`.
- **Trace.** P2 · manual · `R-MEG-007-1` `R-MEG-007-2` `R-MEG-007-3` · `app/models/event_group.rb:640-668`

#### API-EVRMEG-005 — An event lists its rounds in stage order, without cancelled ones, and its price rounds newest first
- **Why it matters.** The console's round tabs and "latest price round" for awarding are taken from these lists; a withdrawn round must still be shown (as withdrawn), a cancelled one not at all.
- **Setup.** Event with technical (stage 1), price round (2, withdrawn), price round (3, live), and a cancelled draft round.
- **Steps.** Read the event.
- **Expected.** Rounds in stage order 1, 2, 3 (withdrawn and draft rounds included, cancelled/void excluded). The latest price round is stage 3 (withdrawn, draft and inactive rounds are never the latest). The latest proposal is the newest selected or requested one.
- **Oracle.** `event_group.rb:62, 68-76, 149-154`; `trade_request.rb:256-259`. Twin EDGE-EVRMEG-005 reads the sandbox event (one round) and must succeed.
- **Trace.** P2 · automate · `R-MEG-001-1` `R-MEG-001-4` `R-MEG-001-5` · `app/models/event_group.rb:62, 71-76` · `EDGE-EVRMEG-005`

#### API-EVRMEG-006 — A new event carries the company's trade reasons and starts unsaved, not on hold
- **Why it matters.** The "why are you running this event" reasons come from company settings; a draft counts as saved only after the buyer saves it once.
- **Setup.** Company with configured trade reasons.
- **Steps.** Create a draft event; read it; save it; schedule its publication.
- **Expected.** The event's trade reasons equal the company's (empty ones dropped); "on hold" false; saved count 0 then 1; a line counts as "part of a draft event" only after the first save; the scheduled publish time is returned as set.
- **Oracle.** `before_create` copy (`event_group.rb` per `R-MEG-002-2`); `is_project_on_hold?`, `has_evaluations`, `draft_project_saved_count` (`:224-226, 694-697, 1001-1004`); `scheduled_publish_at` (`:279-281`); `is_part_of_draft_project?` (`event_group_line_item.rb:108-114`).
- **Trace.** P3 · automate-later · `R-MEG-002-2` `R-MEG-028-6` `R-MEG-028-7` `R-MEG-034-4` · `app/models/event_group.rb:224-226, 279-281`

## 2. Technical scoring set-up and labels

#### API-EVRMEG-007 — Scoring scale and mode come from the last live technical round
- **Why it matters.** Evaluators can only use the labels of the scale in force; picking a withdrawn round's scale accepts or refuses the wrong scores.
- **Setup.** Event with technical round T1 (scale 0–5, line-level), later T2 (scale 0–10, lot-level) withdrawn; second event with no technical round.
- **Steps.** Submit a score of 7 on each event; read the scoring mode.
- **Expected.** Event 1 uses T1 (T2 is withdrawn): 7 refused, mode line-level. A draft or closed technical round does count as "live" for this. Event 2 uses the company scale (none → no labels).
- **Oracle.** `get_valid_rfp_trade_request` (`event_group.rb:973-975`), scale fallback (`:726-735`, `company.rb:1040-1042`), modes (`:963-971`). Score refusal HTTP 422 code 2 (see brief: scores must be keys of the label map).
- **Trace.** P1 · automate-later · `R-MEG-004-1` `R-MEG-004-2` `R-MEG-004-3` · `app/models/event_group.rb:726-735, 963-975`

#### API-EVRMEG-008 — Score labels: fractional scores show the whole-number label; "TNA" and "Regret" are matched exactly
- **Why it matters.** A 2.5 shown as "2 – Fair" and a label spelt "tna" not recognised as Technically Not Acceptable change who goes to the price round.
- **Setup.** Scale {0: TNA, 1: Poor, 2: Fair, 3: Good}; a second scale whose TNA label is spelt "Tna".
- **Steps.** Score a vendor 2.5 on a line; score another vendor TNA on both scales.
- **Expected.** 2.5 shows "Fair". On the first scale the TNA vendor is treated as TNA; on the second it is not (exact "TNA" only). A line with no evaluations yet returns no score for anyone.
- **Oracle.** `event_group.rb:688-692, 718-724, 737-741`; `evaluation_score.rb:52`; `event_group_line_item.rb:133-145`.
- **Trace.** P2 · automate-later · `R-MEG-021-1` `R-MEG-021-2` `R-MEG-036-3` `R-MEG-036-4` · `app/models/event_group.rb:688-741`

#### API-EVRMEG-009 — A vendor that regretted every line is shown as regretted, not as "technically not acceptable"
- **Why it matters.** The price round's invite list and the L1 price use the "all lines TNA" test; a vendor that simply declined is labelled as failing technically.
- **Setup.** Technical round with 3 lines; vendor A regrets all 3; vendor B scored TNA on all 3; vendor C TNA on 2 and regretted 1.
- **Steps.** Open the price round's vendor list (TNA status) and the L1 price.
- **Expected.** B and C are TNA; A is "regretted" (not TNA). None of them sets the L1 price.
- **Expected (today).** A is TNA too: after dropping regretted lines nothing is left and `all?` on an empty list is true.
- **Oracle.** `all_line_items_tna_for_vendor?` (`event_group.rb:795-811`), used by `trade_request.rb:1098-1107` (audience TNA status) and `trade_controller_helper.rb:5793` (L1). Regretted list `event_group_line_item.rb:147-149`; lot-level score `event_group.rb:683-686`.
- **Trace.** P2 · automate-later · `R-MEG-021-3` `R-MEG-021-4` `R-MEG-021-5` `R-MEG-036-2` · `app/models/event_group.rb:795-811`

## 3. When a technical round closes itself

#### API-EVRMEG-010 — An RFI should not close when the first vendor's evaluation is submitted
- **Why it matters.** The RFI closes itself as soon as any one evaluation is active, so evaluators of the other vendors are locked out.
- **Setup.** RFI with three QA vendors' responses and their evaluations in draft.
- **Steps.** Submit the evaluation of vendor 1; try to submit vendor 2's.
- **Expected.** The RFI stays in evaluation until every responding vendor is evaluated; vendor 2's evaluation is accepted.
- **Expected (today).** The RFI status becomes closed (closing time = now) right after vendor 1's evaluation; vendor 2's submission then meets a closed round.
- **Oracle.** `Evaluation#close_trade_request` after every save (`evaluation.rb:36, 40-48`) → `is_evaluated?` for RFI = any active evaluation (`trade_request_model_helper.rb:1281-1282`). Round status in the stage read.
- **Trace.** P0 · automate-later · `R-MEG-041-2` `R-MEG-041-4` `R-MEG-045-1` · `app/models/evaluation.rb:40-48`

#### API-EVRMEG-011 — A line-level RFP should not close until every vendor on every line is scored
- **Why it matters.** The RFP closes (and its evaluation window ends) when each line has a score from one vendor, while other vendors on the same lines are still unscored — they then go to the price round without a technical verdict.
- **Setup.** RFP with line-level scoring, 2 lines, vendors A and B responded.
- **Steps.** Score A on both lines; read the round; then try to score B.
- **Expected.** The round stays open for evaluation; it closes only after A and B are scored on both lines and no line has "re-evaluation requested".
- **Expected (today).** After A's two scores the round is closed, closing time now, and the evaluation window ends now.
- **Oracle.** `check_if_eglis_evaluated` needs one vendor with `evaluation_score` per line (`trade_request_model_helper.rb:1305-1330`); `EvaluationScore#update_trade` closes and ends the extra closing schedule (`evaluation_score.rb:151-164`).
- **Trace.** P0 · automate-later · `R-MEG-045-2` `R-MEG-045-5` `R-MEG-045-6` · `app/models/model_helpers/trade_request_model_helper.rb:1305-1330`

#### API-EVRMEG-012 — A lot-level RFP closes when every active response has a score; with both modes on, the lines must be scored too
- **Why it matters.** Lot-level closing counts scored vendors against active responses; a withdrawn response must not keep it open forever, and in "both" mode a lot score alone must not close it.
- **Setup.** RFP lot-level, three responses (one later withdrawn). Second RFP with both lot and line scoring.
- **Steps.** Score the two active vendors at lot level; read the round. On the second RFP give lot scores only, then line scores.
- **Expected.** First: closed after the 2nd lot score (2 scored = 2 active). Second: still open after lot scores; closed after every line is scored. Each score marks the line and the event as "has evaluations".
- **Oracle.** `trade_request_model_helper.rb:1286-1294, 1462-1469`; both-mode check `evaluation_score.rb:151-158`; `has_evaluations` writes `:213, 228, 267-269`. Lot score count reads `get_precomputed_data`, which is the older data block when the platform flag MQCS_GROUPING_ENABLED is off while scores are written only to the newer block — then a lot RFP would never close (unverified which value the flag has on UAT).
- **Trace.** P1 · automate-later · `R-MEG-045-3` `R-MEG-045-4` `R-MEG-044-5` `R-MEG-044-7` · `app/models/evaluation_score.rb:151-164`

#### API-EVRMEG-013 — A re-evaluated score clears that line's score, and a TNA score clears the vendor's line rank
- **Why it matters.** After "re-evaluate" the old score must not keep the vendor qualified; a TNA vendor must not hold a rank on that line.
- **Setup.** Line-level RFP; vendor A scored 4 with remark "ok"; vendor B scored TNA.
- **Steps.** Request re-evaluation of A's score and complete it; read the line's data for A and B.
- **Expected.** A: score and remark empty until a new active score is given (then that score and its remark). B: its line rank score is empty. Only active or re-evaluated scores update the line data; inactive scores and remarks are ignored. On a service RFP grouped by PR item, the same score and remark appear on the sibling activity lines of that PR item.
- **Oracle.** `evaluation_score.rb:68-71, 87-89, 231-239`; `evaluation.rb:31-32`.
- **Trace.** P1 · automate-later · `R-MEG-044-1` `R-MEG-044-2` `R-MEG-044-3` `R-MEG-043-4` `R-MEG-041-3` `R-MEG-044-4` · `app/models/evaluation_score.rb:68-89, 214-239`

#### API-EVRMEG-014 — Section-wise total: Σ score × weight / 100, and a later draft must not override an approved score
- **Why it matters.** The weighted total is the vendor's technical score; today the most recently edited score per section wins even if it is another evaluator's unsent draft.
- **Setup.** Section-wise RFP: section S1 weight 60, S2 weight 40. Evaluator E1 submits S1 = 8, S2 = 5 (active). Evaluator E2 then saves S1 = 2 as a draft.
- **Steps.** Read the vendor's total after E1's submission and after E2's draft.
- **Expected.** 8 × 60/100 + 5 × 40/100 = 6.80, unchanged by E2's draft. The total is computed only when every section has an active (or re-evaluated) score. The TNA test compares the weighted total with the TNA score.
- **Expected (today).** After E2's draft the total becomes 2 × 0.6 + 5 × 0.4 = 3.20 (draft, requested and peer-review scores are included; latest update wins).
- **Oracle.** `compute_weighted_total_score` (`evaluations_helper.rb:897-922`, statuses `:915`, order `:919`); stored `evaluation.scoring_info.total_weighted_score` (`evaluation_score.rb:183-192`); wait `evaluations_helper.rb:954-973`; TNA `evaluation_score.rb:248-251`.
- **Trace.** P1 · automate-later · `R-MEG-046-1` `R-MEG-046-2` `R-MEG-046-3` `R-MEG-046-4` `R-MEG-046-5` `R-MEG-046-6` · `app/helpers/api/evaluations_helper.rb:897-922`

#### API-EVRMEG-015 — Re-evaluating a score that sits in a pending technical award points the award to the new score
- **Why it matters.** The approver must approve the new score, not the old one; and a re-evaluation must not end in a server error after the data is saved.
- **Setup.** Technical award proposal in "requested" holding vendor A's and B's scores; B has no active evaluation (e.g. withdrawn).
- **Steps.** Re-evaluate A's score on line 1; read the proposal's score list.
- **Expected.** The proposal's score for A on line 1 is the new score; B's entries are unchanged; the request succeeds.
- **Expected (today).** For B (no active, peer-review or draft evaluation) the rewrite hits `nil.evaluation_scores` in an after-commit hook → HTTP 500 after the re-evaluation was already saved (unverified live).
- **Oracle.** `Evaluation#update_proposal_data` (`evaluation.rb:50-76`), write with `update_columns` (`:75`).
- **Trace.** P1 · manual · `R-MEG-042-1` `R-MEG-042-2` `R-MEG-042-3` · `app/models/evaluation.rb:50-76`

#### API-EVRMEG-016 — A line waits on its evaluator, and on the owner during peer review
- **Why it matters.** "Pending on" tells everyone whose turn it is; a line stuck on the wrong person is never finished.
- **Setup.** Line-level RFP; line 1 has evaluator E and owner O; E is a section in-charge.
- **Steps.** Read pending-on before scoring; after E scores; after a score goes to peer review; after a score is requested back.
- **Expected.** Before: E. Peer review: O. Section in-charge with a requested score, or line already scored for any vendor: O. Lines in "quote in evaluation" list their evaluators as pending.
- **Oracle.** Line `meta_data.pending_on_evaluator_ids` (`evaluation_score.rb:51, 63-66`; `evaluations_helper.rb:739-747`); rules `event_group_line_item_trade_mapping.rb:57-67`; pending list `event_group.rb:314-317`.
- **Trace.** P2 · automate-later · `R-MEG-038-1` `R-MEG-038-2` `R-MEG-038-3` `R-MEG-043-3` `R-MEG-020-4` · `app/models/event_group_line_item_trade_mapping.rb:57-67`

#### API-EVRMEG-017 — A score change refreshes the draft award's snapshot
- **Why it matters.** The award approver reads the snapshot; a score changed after the proposal was drafted must show the new value.
- **Setup.** Technical award proposal in draft with A's line score 3 (section-wise variant too).
- **Steps.** Change A's score to 4; read the proposal snapshot.
- **Expected.** Snapshot shows 4 (empty if the new score is not active). The section-wise path must not fail when the vendor is only in the unfiltered data.
- **Oracle.** `evaluation_score.rb:106-134` (Form path `:126-128` writes without a presence check).
- **Trace.** P2 · manual · `R-MEG-052-4` `R-MEG-052-5` · `app/models/evaluation_score.rb:106-134`

#### API-EVRMEG-018 — Clara lists the event's evaluators by scoring mode and says whose evaluation is pending
- **Why it matters.** The assistant answers "who still has to evaluate"; listing the wrong people sends reminders to the wrong colleagues.
- **Setup.** Three events: section-wise scoring with evaluators on forms; lot-level with evaluators on the round; line-level with evaluators on lines (one line inactive). A fourth with no scoring mode.
- **Steps.** Ask Clara for each event's evaluators and pending evaluations; ask whether all lines have an evaluator.
- **Expected.** Section-wise: the form evaluators. Lot-level: the round's evaluators. Line-level: evaluators of active lines only. No mode: none. "All lines have an evaluator" is true only if every active line of the draft has an active evaluator (or the round itself has one).
- **Oracle.** `evaluator_users` (`event_group.rb:239-276`), `all_line_items_have_evaluator?` (`:283-311`), used by `mcp/erfx_tools/handler.rb:52, 120-129, 572`.
- **Trace.** P3 · manual · `R-MEG-019-1` `R-MEG-019-2` `R-MEG-019-3` `R-MEG-019-4` `R-MEG-019-5` `R-MEG-020-1` `R-MEG-020-2` `R-MEG-020-3` · `app/models/event_group.rb:239-311`

## 4. Technical answers from vendors

#### API-EVRMEG-019 — A vendor's first technical submission is time-stamped, replaces its drafts and adds it to the participants
- **Why it matters.** The submission time is evidence of on-time response; a leftover draft must not be scored instead of the submission.
- **Setup.** Technical round; QA vendor with two drafts (one per alternative is out of scope — same alternative).
- **Steps.** Submit one draft; read the vendor's responses, the round's participants and the vendor's pending tasks.
- **Expected.** Submitted response has a submission time (set only on the first draft → submitted move); the other draft is inactive; the vendor is in the round's participant list; its "submit response" task is completed. Later revisions keep the first submission time.
- **Oracle.** `template_response.rb:62, 87-89, 294-296, 562-599`; `misc.bid_company_ids`; latest/valid statuses `:95, 100`.
- **Trace.** P1 · automate-later · `R-MEG-047-2` `R-MEG-047-3` `R-MEG-047-4` `R-MEG-048-1` `R-MEG-048-3` · `app/models/template_response.rb:562-599`

#### API-EVRMEG-020 — Technical answers pre-fill the price round's "fetched from RFP" columns
- **Why it matters.** Vendors should not retype make, model or lead time; the price round must show what they answered in the RFP.
- **Setup.** Price round with columns set to fetch "make" from the RFP; vendor answers "make = Siemens" on the global form and per line.
- **Steps.** Submit the RFP answer; open the price round as the vendor.
- **Expected.** The make column shows "Siemens" (global answer at event level, line answer per line). A price round with no such columns is untouched.
- **Oracle.** `template_response.rb:86, 113-161`; columns in `config.auto_fetch_from_rfp_widget_keys`.
- **Trace.** P1 · automate-later · `R-MEG-048-5` · `app/models/template_response.rb:113-161`

#### API-EVRMEG-021 — Submission mails go to the buyer side only when the company asks for them
- **Why it matters.** Owners and intake creators want to know when a vendor answers; nobody else should be mailed.
- **Setup.** Needs a readable buyer mailbox. `gate: send_new_bid_mail_to_intake_creator` on; RFP raised from an intake; an RFI where the vendor was invited by the buyer.
- **Steps.** Vendor submits the RFP; vendor submits the RFI (first time, then revised).
- **Expected.** RFP: the event owner and intake creators with an email get the submission mail. RFI: "complete" mail on the first submission only (not on a revision), plus the form-submission mail to the inviter.
- **Oracle.** Mailbox; `template_response.rb:579-615`, `company.rb:292-294`.
- **Trace.** P2 · manual · `R-MEG-048-2` `R-MEG-048-4` · `app/models/template_response.rb:579-615`

#### API-EVRMEG-022 — A surrogate technical answer is marked as surrogate and can be scored
- **Why it matters.** Answers typed by the buyer on a vendor's behalf must be labelled; scoring one must not fail on an answer without extra details.
- **Setup.** Buyer submits a surrogate technical answer for the QA vendor; an older answer saved without extra details.
- **Steps.** Read both answers; score both.
- **Expected.** Surrogate answer flagged as surrogate; the other not; both can be scored.
- **Expected (today).** An answer with no extra details raises when asked whether it is a surrogate (unverified which answers lack them).
- **Oracle.** `template_response.rb:107-111, 390-392`.
- **Trace.** P2 · automate-later · `R-MEG-047-5` `R-MEG-047-6` · `app/models/template_response.rb:390-392`

## 5. Amendments (new versions of an event)

#### API-EVRMEG-023 — An amendment copies the technical round and one price round, never lot rounds
- **Why it matters.** Buyers expect the amended draft to contain what they will re-run; a lot round left out (or an older price round copied) changes the event.
- **Setup.** Event with technical round, RFQ, auction made from the RFQ, and a lot round; second event raised from a PR.
- **Steps.** Amend each; read the amended draft's rounds.
- **Expected.** Technical round = the last live one; price round = the latest non-lot price round (the auction) — for a PR amendment the RFQ is preferred; no lot rounds.
- **Oracle.** `versions/event_group.rb` (per `R-MEG-014-4`, lines 50+).
- **Trace.** P1 · automate-later · `R-MEG-014-4` · `app/services/versions/event_group.rb`

#### API-EVRMEG-024 — The amended draft keeps each window's length and their order
- **Why it matters.** Every copied window restarts at the moment of amendment, so the evaluation window (normally after bidding) now starts with bidding and can end before it.
- **Setup.** Event with RFP bidding 2 days followed by a 1-day evaluation window.
- **Steps.** Amend at time A; read the draft's windows.
- **Expected.** Bidding A → A + 2 days; evaluation A + 2 days → A + 3 days.
- **Expected (today).** Both start at A: bidding A → A + 2 days, evaluation A → A + 1 day (each keeps its configured length). Whether publishing the amendment re-times them is (unverified).
- **Oracle.** `replicate_trade_schedules` (`versions/trade_request.rb:111-130`).
- **Trace.** P1 · automate-later · `R-MEG-015-2` · `app/services/versions/trade_request.rb:111-130`

#### API-EVRMEG-025 — Publishing an amendment closes every open round of the previous version
- **Why it matters.** Vendors must not keep bidding on the old version once the new one is live.
- **Setup.** Event with a technical round, an RFQ, an auction from it and a lot round, all open; PR items linked.
- **Steps.** Publish an amendment; immediately bid on each old round as the QA vendor; read the old rounds and the PR links.
- **Expected.** All old rounds end now; bids on them are refused; PR item links move to the new lines and the old ones become inactive.
- **Expected (today).** Only the old version's last technical round and latest non-lot price round are force-closed (the earlier RFQ and the lot round stay open), and the close runs in a background job, so bids are accepted until it runs.
- **Oracle.** `update_previous_version_data` (`event_group.rb:703-709` → `Versions::EventGroupWorker`); `versions/event_group.rb:91-113` closes `[rfp, latest_non_lot_commercial_stage]` only; PR links `:116-210`, `event_group_line_item.rb:277-294`. Skipped for recurring templates and events with no previous version.
- **Trace.** P0 · automate-later · `R-MEG-016-1` `R-MEG-016-3` `R-MEG-016-5` `R-MEG-016-6` · `app/services/versions/event_group.rb:91-113`

#### API-EVRMEG-026 — The amendment reason shown is the latest active one
- **Why it matters.** Approvers read why an event was amended; an old or deleted reason misleads them.
- **Setup.** Amend an event with reason R1, edit to R2, delete R2 (inactive).
- **Steps.** Read the version's amendment remarks.
- **Expected.** R1 with its attachments and time (R2 is inactive); nothing when no reason was given.
- **Oracle.** `versioning/methods.rb:114-123`, `remark.rb:11, 34`.
- **Trace.** P3 · automate-later · `R-MEG-017-3` · `app/models/versioning/methods.rb:114-123`

#### API-EVRMEG-027 — A second amendment while another buyer's draft amendment exists is refused clearly
- **Why it matters.** Two people amending at once must get "a draft already exists", not a server error — especially when the second one is a PR amendment.
- **Setup.** Buyer A starts an amendment (draft). Buyer B amends the same event; separately a PR change triggers a PR amendment.
- **Steps.** B creates an amendment; the PR amendment runs.
- **Expected.** Both refused with a message naming the existing draft; the version chain is unchanged.
- **Expected (today).** The API's "is latest" check shields B (unverified wording); the PR amendment calls version creation directly and hits the unique index → untyped 500 (unverified live). Version chains are cached 24 h and refreshed on every version save.
- **Oracle.** `versioning/methods.rb:131-147`, `item_version.rb:95-100`; API check at `:888` (per digest).
- **Trace.** P2 · manual · `R-MEG-012-3` `R-MEG-012-4` `R-MEG-013-6` · `app/models/versioning/methods.rb:131-147`

#### API-EVRMEG-028 — Forms of deleted lines do not reappear as extra sections in the amendment
- **Why it matters.** A form copied without its line is treated as an event-level section, adding an unexpected section (and weight) to the technical total.
- **Setup.** Line-level RFP with a form on line 3; delete line 3; amend.
- **Steps.** Read the amended technical round's sections and weighted total.
- **Expected.** No section for line 3's form.
- **Expected (today).** The form is copied without a line link and can show up as an extra section (unverified live).
- **Oracle.** Per `R-MEG-015-6`; unmapped forms count as sections in `evaluations_helper.rb:897-904`.
- **Trace.** P2 · manual · `R-MEG-015-6` · `app/helpers/api/evaluations_helper.rb:897-904`

## 6. Lines, PR links, last PO and terms

#### API-EVRMEG-029 — A line's quantity, unit and closed quantity read from what the buyer entered
- **Why it matters.** Quantity drives totals and partial awards; a line whose stored data is empty must not crash the event.
- **Setup.** Line with quantity 100 KG; second line whose quantity was set only on its price-round line (80); a third with no data; award 30 of line 1 then 20 more.
- **Steps.** Read each line's quantity, unit symbol and closed quantity.
- **Expected.** Line 1: 100, "KG", closed 30 then 50. Line 2: 80 (from the last active/closed price-round line). Line 3: 0 and no unit — never a server error.
- **Oracle.** `event_group_line_item.rb:62-106` (`precomputed_data.dig` without a nil guard at `:63, 101` → 500 for a line with null data, unverified reachability).
- **Trace.** P2 · automate-later · `R-MEG-035-1` `R-MEG-035-2` `R-MEG-035-3` `R-MEG-035-4` `R-MEG-035-6` · `app/models/event_group_line_item.rb:62-106`

#### API-EVRMEG-030 — Publishing or withdrawing an event updates the "in progress" quantity on its PR items
- **Why it matters.** PR owners see how much is already being sourced; stale numbers cause double buying.
- **Setup.** Event from a PR with 3 items (one later deleted); BOQ event from a BOQ PR with 2 items.
- **Steps.** Publish each; withdraw each; read the PR items' in-progress quantity.
- **Expected.** Normal event: every linked live PR item updated (deleted/inactive items skipped). BOQ event: both items updated.
- **Expected (today).** BOQ: only the last item of the last PR is recomputed; the other keeps a stale value (unverified that BOQ PRs carry several items).
- **Oracle.** `event_group.rb:988-999`; `update_in_progress_quantity_worker.rb:18-21`.
- **Trace.** P1 · automate-later · `R-MEG-024-1` `R-MEG-024-4` `R-MEG-024-5` · `app/models/event_group.rb:988-999`

#### API-EVRMEG-031 — A line is linked to one PR item at a time, and relinking replaces the old link
- **Why it matters.** Each line's PR item drives in-progress quantity and PO creation; two active links double-count.
- **Setup.** Line L linked to PR item P1.
- **Steps.** Relink L to P2; try to link L to P2 again; read L's PR item and the event's PRs.
- **Expected.** P1 link inactive, P2 active; the duplicate is refused ("Reference has already been taken") — not a server error; L shows P2 (if no active link, the most recent one). Only active links count as the event's PRs.
- **Oracle.** `purchase_request_trade_mapping.rb:28-44`; `event_group_line_item.rb:166-170`; `event_group.rb:64-65`.
- **Trace.** P2 · automate-later · `R-MEG-040-2` `R-MEG-040-3` `R-MEG-040-5` `R-MEG-001-3` · `app/models/purchase_request_trade_mapping.rb:28-44`

#### API-EVRMEG-032 — Refreshing last-PO prices is allowed only when switched on, for live events with PR-linked lines
- **Why it matters.** The refresh rewrites reference prices used for savings; it must not touch awarded lines or run twice at once.
- **Setup.** `gate: allow_lpo_update` off, then on; live event with 2 PR-linked lines, one already in a selected award.
- **Steps.** Refresh last-PO data; refresh again while the first is in progress.
- **Expected.** Off: "You are not allowed to perform this action". On: status "in progress", only the non-awarded line refreshed; the second request queues nothing. A draft event or one with no PR-linked line is refused.
- **Oracle.** HTTP 422 code 101 (`event_groups_controller.rb:1109`); `event_group.rb:909-929`, `company.rb:891-893`.
- **Trace.** P2 · automate-later · `R-MEG-023-1` `R-MEG-023-2` `R-MEG-023-3` · `app/models/event_group.rb:909-929`

#### API-EVRMEG-033 — Last-PO details on a line: date formats and the vendor looked up by its padded code
- **Why it matters.** Buyers compare offers with the last PO; a wrong date or vendor makes the comparison useless.
- **Setup.** Lines with last-PO data: date "20250315", date "2025-03-15", date "00000000"; vendor code "12345" mapped to an active vendor (stored as 0000012345); another code of an inactive vendor.
- **Steps.** Read each line's last-PO fields (and the line report).
- **Expected.** 15 Mar 2025 for both formats; no date for "00000000"; vendor name/city found for 12345; nothing for the inactive vendor; missing PR details show "-" in the report.
- **Oracle.** `event_group_line_item.rb:172-187, 301-388`.
- **Trace.** P2 · automate-later · `R-MEG-039-1` `R-MEG-039-2` `R-MEG-039-3` `R-MEG-035-5` · `app/models/event_group_line_item.rb:301-388`

#### API-EVRMEG-034 — Event terms: mandatory on the first round makes every clause required; one-round events fall back to the round's terms
- **Why it matters.** Vendors must accept required clauses before bidding; a wrong mode lets them skip one.
- **Setup.** Event with structured terms (one clause "optional"); first round with "terms mandatory"; a second event with no event terms and one round with terms and an attachment; a third with two rounds and no event terms.
- **Steps.** Read each event's terms (structured and plain).
- **Expected.** 1: every clause "required". 2: the round's clauses and attachment (signed link). 3: empty. Plain-text clauses get ids "legacy_<event>_<n>", mode "none", HTML escaped; the plain form is empty when there are no clauses and no attachments.
- **Oracle.** `event_group.rb:346-367, 1271-1327`.
- **Trace.** P2 · automate-later · `R-MEG-027-1` `R-MEG-027-2` `R-MEG-027-3` `R-MEG-027-4` `R-MEG-027-5` · `app/models/event_group.rb:346-367, 1271-1327`

#### API-EVRMEG-035 — "Owned by" filter uses the event's owner, falling back to its creator
- **Why it matters.** After a hand-over the event must appear under the new owner, not the creator.
- **Setup.** Event created by A, handed to B (owner access list). Another event by A with no owner row.
- **Steps.** Filter the events list by owner B, then by A.
- **Expected.** B: the handed-over event. A: only the event without an owner row.
- **Oracle.** `owned_by_users` (`event_group.rb:133-136`).
- **Trace.** P2 · automate-later · `R-MEG-029-3` · `app/models/event_group.rb:133-136`

#### API-EVRMEG-036 — Each vendor's current bid across price rounds comes from the latest round
- **Why it matters.** The award report compares each vendor's latest bid; taking an RFQ bid after an auction understates the auction result.
- **Setup.** RFQ (vendor A bid 100) then auction from it (A bid 95); a withdrawn RFQ with A's bid 90.
- **Steps.** Download the award proposal report.
- **Expected.** A's bid = 95 (later round wins; withdrawn/void/cancelled rounds and non-active bids ignored).
- **Oracle.** `get_vendor_vs_latest_bid` (`event_groups_helper.rb:78-100`), used by `awarding_proposal_report_data_model.rb:240`.
- **Trace.** P1 · manual · `R-MEG-026-1` `R-MEG-026-2` · `app/models/model_helpers/event_groups_helper.rb:78-100`

#### API-EVRMEG-037 — After award, the event's start and close times are set from its rounds and open rounds are pulled in
- **Why it matters.** The event's closing time is what reports and spend dashboards use; rounds still open after the award must end.
- **Setup.** Event with RFP and RFQ, awarded while an evaluation window is still open; a technical-only event; an event whose rounds are all withdrawn.
- **Steps.** Award (PO/order created); read the event's start/close and the rounds' end times.
- **Expected.** Start = earliest round start; close = latest price-round close; rounds closing later are pulled to that time and the technical round's future windows end now. Technical-only: close = latest close of RFIs / evaluated RFPs. All withdrawn: their latest close. A withdrawn event never gets these times (only live events are processed).
- **Oracle.** `event_groups_helper.rb:7-69`, `event_group_update_worker.rb` (loads `EventGroup.active`).
- **Trace.** P2 · automate-later · `R-MEG-025-1` `R-MEG-025-3` `R-MEG-025-4` `R-MEG-025-5` `R-MEG-025-6` · `app/models/model_helpers/event_groups_helper.rb:7-69`

#### API-EVRMEG-038 — Lot participants and lot membership use only active lots
- **Why it matters.** A lot report must list the vendors of that lot; a cancelled lot must not claim lines.
- **Setup.** Event split into lots 1 and 2; lot 2 cancelled; lot 1 with 2 participants.
- **Steps.** Read lot 1's participants; read which lot line X (moved from lot 2) belongs to.
- **Expected.** Lot 1: its 2 participants (falls back to the event's participants only if lot data is missing). Line X belongs to no lot while lot 2 is cancelled. Events without lots answer "no lot" rather than failing.
- **Oracle.** `event_group.rb:757-770, 1042-1067`; `event_group_line_item.rb:199-205`.
- **Trace.** P2 · automate-later · `R-MEG-030-1` `R-MEG-030-2` `R-MEG-030-3` `R-MEG-022-2` `R-MEG-022-6` · `app/models/event_group.rb:1042-1067`

#### API-EVRMEG-039 — A line's stage status follows its round's timeline
- **Why it matters.** Line badges (open, in evaluation, closed) are read from this; seconds and milliseconds in the timeline must not pick a different "latest" status.
- **Setup.** Line in a technical round moving open → quote in evaluation → closed.
- **Steps.** Read the line's event statuses after each move.
- **Expected.** The latest status of each active round link; a line is "evaluated" when any vendor on it has a score.
- **Expected (today).** The line uses the alphabetically largest time key while the link uses the numerically largest; with keys of different length the line shows an older status (unverified that mixed key lengths occur).
- **Oracle.** `event_group_line_item_trade_mapping.rb:34-55`; `event_group_line_item.rb:151-160`.
- **Trace.** P3 · manual · `R-MEG-037-2` `R-MEG-037-3` `R-MEG-037-4` `R-MEG-037-5` · `app/models/event_group_line_item.rb:151-160`
