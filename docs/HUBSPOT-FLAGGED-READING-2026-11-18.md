# The 21 flagged replays, read by hand (18 Nov 2026)

`npm run hubspot:reproduce` replayed the 93 open-defect regression cases that had never been tried (API only, PROCOL DEMO, a fresh event per case, a failure repeated on a second fresh event). 21 ended **flagged**: the plan failed the same way twice. The metric counts them as "a person decides". This is that person's reading, against the ticket's own expected / observed lines (read locally; no ticket text is copied here) and the replay's step lines.

The rule applied: a flagged case is a **catch** only when the step that failed is the ticket's own point. When the failing check was added by the compiler, or the runner sent the request as someone else, or the setup never reached the ticket's state, it is a **platform gap**, and the gap is named so it can be closed.

## Verdict of the reading

| Reading | Cases | Which |
|---|---|---|
| Catch (the ticket's own point failed) | 0 | — |
| Worth a hand-check (failed near the point, cause unclear) | 1 | HS-4540038419-1 |
| Platform gap: the compiler's own stricter check failed, not the ticket's | 12 | the Order Activity family (below) |
| Platform gap: the plan never reached the ticket's state | 6 | HS-8950744869-1, HS-919958798517-1, HS-333728207591-1, HS-2620000536-1, HS-3000057409-1, HS-4500423596-1 |
| Platform gap: the expectation was the compiler's, not the ticket's | 2 | HS-1060010159-1, HS-1060010160-1 |

So the honest line for today: **0 tickets caught at bug-sheet grade on the API alone, 1 to hand-check, 20 are expression gaps of the platform.** The gaps are concrete and listed below with what closes each.

## The Order Activity family — 12 cases, one decision

HS-1788491428-1, HS-1788494052-1, HS-1788513360-1, HS-1788589550-1, HS-1788758509-1, HS-1788771919-1, HS-1788779706-1, HS-1788780109-1, HS-1788845589-1, HS-1788864597-1, HS-1789275953-1, HS-4400001037-1 (module events, features rfq_only / lifecycle).

- **The tickets' point:** the buyer-facing Order Activity section of a closed RFQ shows nothing.
- **What the replay saw:** on every fresh event the activity read returned entries ("… has placed the bid", "You rejected the bid of …"). The section is not empty at the API.
- **Why they failed anyway:** the compiler asserted that the entries *contain the words* price / taxes / published / invited / invitation. The app's activity lines name the actor and the action, not the amounts. That check is the compiler's, not the ticket's. HS-1788845589-1 differs only in that its read was refused (401): the read was sent on the wrong app, the known wrong-app sign-out trap.
- **Reading:** not reproduced at the API; the ticket is about the web page, so a UI check of the Order Activity section on a closed event decides all 12 at once (the backlog item "hand-check Order Activity on 99080/99214").
- **What closes the gap:** the activity assertion vocabulary should allow "has entries" / "names the vendor" and refuse "contains price" unless the case says so; the Order Activity read must be sent on the buyer app only.
- **Re-replay after the rule (10:40–10:51):** the compiler now turns a "contains <word>" the case never says into "the entries are there" — but these 12 cases *do* say price / invitation / delivery themselves (the regression case copies the ticket's "including the relevant price…" line), so the rule did not fire. Recompiled, 2 of 12 now pass (HS-1788494052-1, HS-1788780109-1: not showing) and 10 stay flagged on the same check. The dashboard's Order Activity renders each entry's message, time and change_logs (components/activityLogs/select.js); a bid entry's message is "… has placed the bid" with no amount, so whether "price" belongs in the section is a product question, and the UI check on a closed event remains the decider for the 10.

## The plan never reached the ticket's state — 6 cases

| Case | Ticket's point | What the replay did | Gap |
|---|---|---|---|
| HS-8950744869-1, HS-919958798517-1 | line-item descriptions merge across withdraw and re-float | published, withdrew, expected "active" and read "withdrawn" | re-float (publish again after withdraw) is not a step the API planner can express |
| HS-333728207591-1 | Create new event / Delete line item enabled on an editable event | the case's own update-and-publish request left the event "draft" | the self-written publish request does not publish; the compiler should use the publish op it knows |
| HS-2620000536-1 | Re-order visible for a line whose previous event is Closed | same self-written request, event stayed "draft" | same; plus the PR line-item state (previous event Closed) is not buildable yet |
| HS-3000057409-1 | split award makes two POs with the split quantities | award proposal refused 422/573 "already submitted" at step 1 | the setup had already sent a proposal; a second proposal on the same event is not the ticket's flow — the plan needs one proposal with two vendor lines |
| HS-4500423596-1 | MQCS pushed to the DMS names the wrong vendor | award refused 422/826 "Awarded vendor is not present in the latest stage" | two-stage event with the vendor carried into the latest stage is not built by the recipe; the DMS push is outside the API scope |

## The expectation was the compiler's — 2 cases

- **HS-1060010159-1** (PR → event specifications): the plan's read-back expected 200 and got 422 on an event built without a purchase request. The ticket needs an event created from a PR; the recipe has none (named as a gap by the compiler itself).
- **HS-1060010160-1** (variant specification shown to buyer and vendor): the rules plan expected publish to be *refused* because "a round whose template carries no line items" was added; that add was itself refused (Product not found), the event kept its valid line item, and publish was rightly accepted. The expectation did not follow the ticket.

## Worth a hand-check — 1 case

- **HS-4540038419-1** (RFQ → auction conversion loses the requisition budget price): convert accepted 200; the read of the pricing round still says mode "rfq", and the vendor's bid read shows the price but no item or quantity. The ticket's own point (budget price gone after conversion) is not checkable at the API (no read-back field exposes it, as the plan says). The mode reading is most likely the old round being read after a convert that creates a new auction round (the convert_to_auction behaviour recorded on 13 Nov), so this is probably a read-target gap, not a product bug. Decide on screen: convert a published RFQ on PROCOL DEMO and look at the budget price column.

## The derived rows' Fails, read the same way (first 35 tickets, 30 sheet runs)

The API-runnable rows written around the first 35 tickets ran on PROCOL DEMO: 15 Not run, 10 Partly checked, 9 Couldn't tell, 9 Fail. The 9 Fails:

| Row | Around ticket | Reading |
|---|---|---|
| DRV-AUC-010 | HS-4540039216-1 (budget price after conversion) | **Real.** POST /trade/move_to_auction with no "data" block (missing, [] or {}) answers HTTP 500 on a published RFQ; 5 fresh events (2 in the run, 3 probes); on 8 Oct the same shape on a closed RFQ was refused 422. Backend: trade_controller.rb move_to_auction, trade_products empty after transform_trade_product. Bug sheet: test-cases/HubSpot_Derived_Bugs.xlsx HSD-01 (local). |
| DRV-VND-011 | HS-1111444444-1 | False: the row has the vendor send the buyer's add-vendor request; the runner sent it as the buyer. Planner now refuses such a plan; re-run reads Not run with the reason. |
| DRV-VND-006, DRV-AUC-011 (HS-321087028937-1) | buyer *without* the permission | False: the only buyer the plan signs in is the support console's super_admin. Planner now refuses. |
| DRV-VND-010 | archived vendor | False: the runner invited QA vendor 2, who is not archived. Planner now refuses (no recipe makes an archived / inactive / blocked vendor). |
| DRV-AUC-013, DRV-TPL-011 | vendor cannot change ranking config; save without GST | False: the decisive step was a read (the change the row names has no operation), so "accepted, must refuse" meant nothing. Planner now refuses a reject-expected plan whose decisive step is a read. |
| DRV-AUC-011 (HS-4540038419-1) | conversion without use_rfq_quotes_as_bids must be refused | Not a bug: the "flag is required" rule is the derivation's own; the app accepts the conversion without it. Goes to the product questions, not the bug sheet. |
| DRV-BID-008 | best price hidden from the vendor (show_best_price_in_all_event Off) | False: the vendor's read of the other bid was rightly refused (422 Bid not found); the failing check read the comparison as the *buyer*, for whom the best price is meant to show (the setting was already Off on PROCOL DEMO, so nothing had to be switched). Gap: the read-back actor must follow the row's role. |

So of 9 Fails, 1 is real, 7 are platform false Fails (5 now refused at compile time), 1 is a derivation rule the product does not have.

## The remaining 77 tickets' derived rows (second batch, afternoon)

All 112 open-defect cases now have a derived sheet (model spend of the second batch: $28). Their API-runnable rows ran on PROCOL DEMO; the VPN tunnel to the UAT API and the Procol database died at 13:23 half-way through, so 50 sheets run after that moment carry an outage verdict (the model gateway was unreachable too, so most read "no valid API plan could be compiled" rather than naming the network) and are re-run once the tunnel is back. Of the 32 sheets that ran before the outage: 2 Fails, both false.

| Row | Around ticket | Reading |
|---|---|---|
| DRV-LI-179 | HS-1060010159-1 | False: the row's expected line says the two requests "produce rate-only lines **rather than rejecting** zero or missing quantity"; the compiler read the word *rejecting* as "must refuse" and failed the accept. The polarity reader now takes "rather than / instead of / without … rejecting (refusal, error, failure)" as the refusal that does **not** happen. |
| DRV-AUC-088 | HS-162417491700-1 | False: every data check held (QA vendor 1 rank 1, best bidder) and the one failing check was the compiler's own "rank value is a number", while the app sends the rank as the text "1". The row never says *number*. A type check the case does not ask for is now checked as "the field is there". |

## The 50 outage-spoiled sheets, re-run (19 Nov, VPN back)

The 50 sheets that ran during the 13:23 outage were run again on PROCOL DEMO (`hubspot:derive --run-pending --again --ids …`): 101 API rows — 59 Not run (the reason named), 32 Partly checked, 3 Couldn't tell, 7 Fail. No row read "unreachable" this time. Every one of the 7 Fails is false:

| Row | Around ticket | Reading |
|---|---|---|
| DRV-LI-105 | HS-9958798517-1 (publish with no products) | False: the plan published with `line_items: []`, which the backend drops (`event_groups#update` reads it with `.present?`), so the draft kept the line item the start state gave it and publishing it is correct. |
| DRV-LI-250 | HS-2000189583-1 (a row with no unit) | False: the plan added an ordinary pricing round; nothing in the request was blank, so the app rightly accepted it. |
| DRV-AUC-049 | HS-329436196599-1 (below-floor bid) | False: the auction had no floor price, so a 21000 bid is an ordinary bid. |
| DRV-AUC-032 | HS-327180075741-1 (vendor rejects another vendor's Knockout offer) | False: the plan had the buyer invite QA vendor 2 — a legitimate action — instead of the vendor acting for another vendor. |
| DRV-RFQ-094 | HS-1788778411-1 (vendor reads another vendor's activity) | False: the read *was* refused (422 "Bid not found"); the compiler demanded 403, a code the row never names. |
| DRV-RFQ-171 | HS-1788778411-1 | Not reproduced: the closed RFQ's activity log came back empty once; two fresh events today (live with a bid, closed with a bid) both returned 2 entries. Not counted. |
| DRV-RFQ-106 | HS-1788758509-1 | Order Activity family: the log names actor + action ("… has placed the bid"); the row wants quotes, clarifications, taxes and delivery there. Waits for the one UI check that decides the family. |

New compile-time rules from these (apiPlanner, unit tests 57/57):

1. A must-refuse step that sends the ordinary request — nothing changed, the usual actor, a start state where the app accepts it, and no earlier step building the condition — is refused at compile time with the reason (DRV-LI-250, DRV-AUC-049, DRV-AUC-032). Checked against the 1,003 stored API plans: 8 more are refused, all partial and none run recently; each sends an ordinary request the case expects refused.
2. `line_items: []` on publish/update is refused as a way to remove line items (DRV-LI-105).
3. A refusal code the case never names is checked as "any refusal (4xx)" (DRV-RFQ-094).

**Real-bug tally after all 112 tickets' derived rows: still one — HSD-01** (move_to_auction with no data block → HTTP 500).

## What this changes in the pipeline

1. Four refusals the run cannot test are now refused at compile time (apiPlanner), so they read "Not run" with the reason instead of a false Fail: a refusal expected of one actor but sent as another; a refusal expected of a buyer without the permission (the only buyer is the super_admin); a refusal that needs an archived / inactive / blocked vendor; a refusal whose decisive step is a read. These came from the derived rows' Fails above, not from the 21, but it is the same family.
2. The Order Activity assertion vocabulary and the re-float step are the two gaps that would move the most cases (12 + 2) from "flagged" to a real verdict.
