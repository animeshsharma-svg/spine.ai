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
| DRV-BID-008 | best price hidden from the vendor (show_best_price_in_all_event Off) | False: the vendor's read of the other bid was rightly refused (422 Bid not found); the failing check read the comparison as the *buyer*, and the run record shows no setting switched. Gap: the read-back actor must follow the row's role; the API path's setting switch needs a look (the UI path records it, the API path recorded none). |

So of 9 Fails, 1 is real, 7 are platform false Fails (5 now refused at compile time), 1 is a derivation rule the product does not have.

## What this changes in the pipeline

1. Four refusals the run cannot test are now refused at compile time (apiPlanner), so they read "Not run" with the reason instead of a false Fail: a refusal expected of one actor but sent as another; a refusal expected of a buyer without the permission (the only buyer is the super_admin); a refusal that needs an archived / inactive / blocked vendor; a refusal whose decisive step is a read. These came from the derived rows' Fails above, not from the 21, but it is the same family.
2. The Order Activity assertion vocabulary and the re-float step are the two gaps that would move the most cases (12 + 2) from "flagged" to a real verdict.
