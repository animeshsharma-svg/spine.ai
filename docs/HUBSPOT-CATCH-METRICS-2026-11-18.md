# Can the platform catch the support tickets on its own? (2026-11-18)

Truth: the team's own "Is Defect = yes" rows of the RCA export (Jul–Sep 2026), stage not Closed. Every number is read from the pipeline's stored evidence (tickets.processed.json, data/hubspot/plans, data/hubspot/derived). No ticket text here.

## The funnel

| Step | Tickets / cases | Of the step before |
|---|---|---|
| Team-marked defects in the export | 740 | |
| … not Closed (open defects — the denominator) | 200 | 27.0% |
| Sorted as a defect by the platform | 193 | 96.5% |
| Inside the sourcing-events scope (the platform's remit) | 113 | 58.5% |
| A regression case written | 113 tickets → 112 cases | 100.0% |
| An API plan compiled | 94 cases | 83.9% |
| Run on a fresh test event (PROCOL DEMO) | 62 cases | 55.4% |

## The verdicts (per case)

| Verdict | Cases | Of all cases | Meaning |
|---|---|---|---|
| caught | 0 | 0.0% | failed the same way on two fresh events at the ticket's own step, full coverage, backend line cited — bug-sheet grade |
| flagged | 19 | 17.0% | failed on two fresh events, but at another step / partial coverage / no citation yet — a person decides |
| not showing | 38 | 33.9% | passed on two fresh events — fixed since, or needs the customer's data |
| couldn't tell | 5 | 4.5% | the run could not read the result it needed |
| cannot express yet (no plan) | 18 | 16.1% | no API plan could be compiled from the case's words |
| cannot express yet (off-point plan) | 31 | 27.7% | a plan ran and passed, but it admitted its decisive step tests something else than the ticket's point |
| not yet run | 1 | 0.9% | not replayed yet |

## By module

| Module | caught | flagged | not showing | couldn't tell | cannot express yet (no plan) | cannot express yet (off-point plan) | not yet run |
|---|---|---|---|---|---|---|---|
| auction | 0 | 1 | 2 | 1 | 2 | 3 | 0 |
| award | 0 | 1 | 1 | 0 | 1 | 0 | 0 |
| bids | 0 | 0 | 1 | 1 | 1 | 1 | 0 |
| erfx | 0 | 0 | 0 | 0 | 2 | 0 | 0 |
| evaluation | 0 | 1 | 7 | 1 | 1 | 2 | 0 |
| eventfeatures | 0 | 0 | 0 | 0 | 0 | 2 | 0 |
| events | 0 | 16 | 27 | 2 | 9 | 23 | 1 |
| pr | 0 | 0 | 0 | 0 | 2 | 0 | 0 |

## Cases written around the tickets (hubspot:derive)

- Tickets derived from: 112; rows written: 1650 (1590 new, 60 already in the catalog); by how they can run: {"ui":1233,"api":130,"manual":287}; questions for the product team: 1193.
- Runs of the API-runnable rows: 92 sheet runs; verdicts {"Not run":99,"Fail":17,"Couldn't tell":13,"Partly checked":52}.

## Every open-defect case

| Case | Tickets | Module · feature | Verdict | Plan | Fresh events | Decisive step | Other finding | Derived rows (run) |
|---|---|---|---|---|---|---|---|---|
| HS-0070400031-1 | 0070400031 | events · events.validation | cannot express yet (no plan) | none | – | – | – | 16 (7 Not run) |
| HS-1111444444-1 | 1111444444 | events · events.invite_vendors | cannot express yet (no plan) | none | – | – | – | 16 (2 Not run) |
| HS-162417491700-1 | 162417491700 | auction · auction.rank | cannot express yet (no plan) | none | – | – | – | 16 (1 Partly checked, 1 Fail) |
| HS-2000156785-1 | 2000156785 | events · events.validation | cannot express yet (no plan) | none | – | – | – | 7 (2 Not run) |
| HS-2000190539-1 | 2000190539 | events · events.validation | cannot express yet (no plan) | none | – | – | – | 11 (1 Not run) |
| HS-2200009770-1 | 2200009770 | pr · pr.to_event | cannot express yet (no plan) | none | – | – | – | 16 (1 Not run) |
| HS-3000057411-1 | 3000057411 | events · events.validation | cannot express yet (no plan) | none | – | – | – | 14 (2 Not run) |
| HS-321355426517-1 | 321355426517 | bids · bids.surrogate | cannot express yet (no plan) | none | – | – | – | 17 (9 UI pending) |
| HS-322271654635-1 | 322271654635 | erfx · erfx.create | cannot express yet (no plan) | none | – | – | – | 16 (4 Not run) |
| HS-329435504362-1 | 329435504362 | evaluation · evaluation.score | cannot express yet (no plan) | none | – | – | – | 16 (1 Not run) |
| HS-332299326201-1 | 332299326201 | auction · auction.dutch | cannot express yet (no plan) | none | – | – | – | 17 (1 Not run) |
| HS-333683980007-1 | 333683980007 | events · events.validation | cannot express yet (no plan) | none | – | – | – | 12 (1 Not run) |
| HS-335013936856-1 | 335013936856 | events · events.validation | cannot express yet (no plan) | none | – | – | – | 13 (11 UI pending) |
| HS-335186475751-1 | 335186475751 | award · award.approval | cannot express yet (no plan) | none | – | – | – | 16 (1 UI pending) |
| HS-337763574467-1 | 337763574467 | events · events.validation | cannot express yet (no plan) | none | – | – | – | 16 (3 Not run) |
| HS-7705006032-1 | 7705006032 | pr · pr.to_event | cannot express yet (no plan) | none | – | – | – | 16 (1 Not run) |
| HS-800000888-1 | 800000888 | events · events.validation | cannot express yet (no plan) | none | – | – | – | 15 (2 Not run) |
| HS-9896077729-1 | 9896077729 | erfx · erfx.create | cannot express yet (no plan) | none | – | – | – | 14 (1 Not run) |
| HS-1060010163-1 | 1060010163 | events · events.validation | cannot express yet (off-point plan) | partial (llm-fast) | a2RYY1FR | – | – | 15 (1 Not run) |
| HS-1432154329-1 | 1432154329 | events · events.validation | cannot express yet (off-point plan) | partial (llm-fast) | TmdRY1FR | The invited QA vendor reads the bid. → 200 passed | – | 16 (3 Partly checked) |
| HS-1788758476-1 | 1788758476 | events · events.rfq_only | cannot express yet (off-point plan) | partial (llm-fast) | RFhYY1FR | The buyer reads the round's activity log (the Order Activity lines). → 200 passed | – | 16 (3 Not run, 1 Partly checked, 1 Couldn't tell) |
| HS-1788778741-1 | 1788778741 | events · events.lifecycle | cannot express yet (off-point plan) | partial (llm-fast) | cFpnY1FR | – | – | 16 (12 UI pending) |
| HS-1788930353-1 | 1788930353 | events · events.rfq_only | cannot express yet (off-point plan) | partial (llm-fast) | cERrY1FR | The invited QA vendor places a complete bid (open, price, submit); QA vendor 2's bid is {{bid2Uuid}}. → 200 passed | – | 15 (1 Partly checked) |
| HS-2000175782-1 | 2000175782 | events · events.validation | cannot express yet (off-point plan) | partial (llm-fast) | a05RY1FR | The buyer lists the event's line items. → 200 passed | – | 13 (1 Not run) |
| HS-260127838-1 | 260127838 | events · events.validation | cannot express yet (off-point plan) | partial (llm-fast) | cFhRY1FR | – | – | 16 (11 UI pending) |
| HS-3000057240-1 | 3000057240 | events · events.validation | cannot express yet (off-point plan) | partial (llm-fast) | Y2dEY1FR | – | – | 17 (1 Partly checked) |
| HS-3000061725-1 | 3000061725 | events · events.validation | cannot express yet (off-point plan) | partial (llm-fast) | cFFYY1FR | – | – | 13 (1 Partly checked) |
| HS-3000061825-1 | 3000061825 | events · events.validation | cannot express yet (off-point plan) | partial (llm-fast) | TmdnY1FR | – | – | 16 (3 Not run) |
| HS-318440667838-1 | 318440667838 | events · events.invite_vendors | cannot express yet (off-point plan) | partial (llm-fast) | UWtaY1Fk | – | – | 16 (2 Fail, 1 Couldn't tell, 2 Not run, 1 Partly checked) |
| HS-318541871855-1 | 318541871855 | evaluation · evaluation.tna | cannot express yet (off-point plan) | partial (llm-fast) | UWtEY1Fk | The buyer opens an award proposal. → 200 passed | – | 18 (1 Not run) |
| HS-320401698541-1 | 320401698541 | auction · auction.rank | cannot express yet (off-point plan) | partial (llm-fast) | UWtYY1Fk | The buyer reads the round's comparison (ranks, best bidder). → 200 passed | – | 10 (1 Fail) |
| HS-322189737665-1 | 322189737665 | bids · bids.submit | cannot express yet (off-point plan) | partial (llm-fast) | Y1pnY1FR | The invited QA vendor places a complete bid of 365000 (open, price, submit). → 200 passed | – | 12 (1 Not run) |
| HS-323016027878-1 | 323016027878 | events · events.publish | cannot express yet (off-point plan) | partial (llm-fast) | Y1pOY1FR | The buyer publishes the event. → 200 passed | – | 11 (1 Partly checked) |
| HS-323484509932-1 | 323484509932 | evaluation · evaluation.score | cannot express yet (off-point plan) | partial (llm-fast) | Y2NwY1FR | – | – | 12 |
| HS-326409478852-1 | 326409478852 | events · events.validation | cannot express yet (off-point plan) | partial (llm-fast) | Y1hnY1FR | – | – | 14 (1 Couldn't tell) |
| HS-326474213058-1 | 326474213058 | events · events.config | cannot express yet (off-point plan) | partial (llm-fast) | Y1FaY1FR | – | – | 13 (1 Not run, 1 Fail, 1 Partly checked) |
| HS-328422495969-1 | 328422495969 | eventfeatures · events.templates | cannot express yet (off-point plan) | partial (llm-fast) | RGdkY1FR | – | – | 14 (1 Partly checked) |
| HS-329246146274-1 | 329246146274 | eventfeatures · events.boq | cannot express yet (off-point plan) | partial (llm-fast) | a0RwY1FR | The buyer publishes the event. → 200 passed | – | 12 (1 Partly checked) |
| HS-329424690883-1 | 329424690883 | events · events.lifecycle | cannot express yet (off-point plan) | partial (llm-fast) | a05nY1FR | The buyer withdraws the event. → 200 passed | – | 14 (1 Not run) |
| HS-330097993445-1 | 330097993445 | events · events.invite_vendors | cannot express yet (off-point plan) | partial (llm-fast) | a05OY1FR | The buyer lists the event's invited vendors. → 200 passed | – | 15 (1 Not run, 1 Partly checked) |
| HS-334415541969-1 | 334415541969 | events · events.lifecycle | cannot express yet (off-point plan) | partial (llm-fast) | TmdOY1FR | The buyer invites QA vendor 2 to the live round. → 200 passed | – | 10 (9 UI pending) |
| HS-335715298033-1 | 335715298033 | events · events.invite_vendors | cannot express yet (off-point plan) | partial (llm-fast) | TmNaY1FR | Wait until the round has closed (bid end and extra closing time over). →  done | – | 16 (2 Not run, 1 Partly checked) |
| HS-336793407180-1 | 336793407180 | auction · auction.increments | cannot express yet (off-point plan) | partial (llm-fast) | TmtnY1FR | The invited QA vendor places a complete bid of 5750 (open, price, submit). → 200 passed | – | 12 (1 Couldn't tell) |
| HS-3411990095-1 | 3411990095 | events · events.validation | cannot express yet (off-point plan) | partial (llm-fast) | Y1pRY1FR | The invited QA vendor submits the bid. → 200 passed | – | 16 (1 Partly checked) |
| HS-3411990096-1 | 3411990096 | auction · auction.dutch | cannot express yet (off-point plan) | partial (llm-fast) | Y2RwY1FR | The invited QA vendor places a complete bid (open, price, submit); QA vendor 2's bid is {{bid2Uuid}}. → 200 passed | – | 10 (1 Partly checked) |
| HS-4500373795-1 | 4500373795 | events · events.validation | cannot express yet (off-point plan) | partial (llm-fast) | TlpjY1FR | – | – | 16 (3 Not run) |
| HS-4540039216-1 | 4540039216 | events · events.rfq_only | cannot express yet (off-point plan) | partial (llm-fast) | Y0RRY1FR | The buyer converts the pricing round into a live auction. → 200 passed | – | 12 (1 Fail) |
| HS-454500007777-1 | 454500007777 | events · events.rfp_rfq | cannot express yet (off-point plan) | partial (llm-fast) | a2tRY1FR | – | – | 16 (1 Not run) |
| HS-9568742315-1 | 9568742315 | events · events.validation | cannot express yet (off-point plan) | partial (llm-fast) | Y1hrY1FR | – | – | 14 (1 Not run) |
| HS-2000189583-1 | 2000189583 | events · events.validation | couldn't tell | partial (llm-fast) | WlFkY1FR | The buyer adds a pricing (RFQ) round to the event. → 200 passed | – | 16 (2 Not run, 1 Fail) |
| HS-314944956126-1 | 314944956126 | bids · bids.surrogate | couldn't tell | partial (llm-fast) | ZFhjY1FY | The buyer awards the line to a vendor on the proposal for a second QA vendor. → 200 passed | – | 14 (1 Couldn't tell) |
| HS-318439224006-1 | 318439224006 | auction · auction.visibility | couldn't tell | partial (llm-fast) | ZFhwY1FY | – | – | 16 (1 Partly checked) |
| HS-328492719802-1 | 328492719802 | events · events.validation | couldn't tell | partial (llm-fast) | a2dOY1FR | The invited QA vendor reads the pricing round. → 200 passed | – | 16 (1 Not run) |
| HS-4500423113-1 | 4500423113 | evaluation · evaluation.qcs | couldn't tell | partial (llm-fast) | a1FOY1FR | The invited QA vendor places a complete bid (open, price, submit); QA vendor 2's bid is {{bid2Uuid}}. → 422 couldn't tell | – | 12 (1 Not run) |
| HS-1060010159-1 | 1060010159 | events · events.validation | flagged | partial (llm-fast) | a1hjY1FR, a1hwY1FR | – | As the invited QA vendor, read the event and check that Status check: the reply's status code is 200 — OK — the request worked. → 422 455 | 16 (4 Not run, 1 Fail) |
| HS-1060010160-1 | 1060010160 | events · events.config | flagged | partial (rules) | a2RaY1FR, a2REY1FR | The buyer publishes the event. → 200 failed | – | 17 (2 Not run) |
| HS-1788491428-1 | 1788491428 | events · events.rfq_only | flagged | partial (llm-fast) | ZFprY1FR, ZFpRY1FR | – | As the buyer, read the round's activity log (the Order Activity lines) and check that Status check: the reply's status code is a success (2xx — the request worked); Schema check: “items” is not empty; Data check: “items” contains price; Schema check: “items” is not empty; Data check: “items” contains delivery. → 200 | 16 (3 Not run, 2 Partly checked) |
| HS-1788513360-1 | 1788513360 | events · events.lifecycle | flagged | partial (llm-fast) | ZGtEY1FR, ZERnY1FR | – | As the buyer, read the round's activity log (the Order Activity lines) and check that Status check: the reply's status code is a success (2xx — the request worked); Schema check: “items” is not empty; Data check: “items” contains invitation; Schema check: “items” is not empty; Schema check: “items” is not empty. → 200 | 16 (13 UI pending) |
| HS-1788589550-1 | 1788589550 | events · events.lifecycle | flagged | partial (llm-fast) | ZEROY1FR, ZHBjY1FR | – | As the buyer, read the round's activity log (the Order Activity lines) and check that Status check: the reply's status code is a success (2xx — the request worked); Schema check: “items” is not empty; Data check: “items” contains RFQ; Schema check: “items” is not empty. → 200 | 16 (1 Partly checked) |
| HS-1788758509-1 | 1788758509 | events · events.rfq_only | flagged | partial (llm-fast) | ZHBkY1FR, ZE5YY1FR | – | As the buyer, read the round's activity log (the Order Activity lines) and check that Status check: the reply's status code is a success (2xx — the request worked); Schema check: “items” is not empty; Data check: “items” contains price; Schema check: “items” is not empty; Data check: “items” contains delivery. → 200 | 9 (1 Fail) |
| HS-1788771919-1 | 1788771919 | events · events.rfq_only | flagged | partial (llm-fast) | ZFhrY1FR, ZFhOY1FR | – | As the buyer, read the round's activity log (the Order Activity lines) and check that Status check: the reply's status code is a success (2xx — the request worked); Schema check: “items” is not empty; Data check: “items” contains price; Data check: “items” contains taxes; Data check: “items” contains delivery terms. → 200 | 16 (3 Not run, 1 Partly checked, 1 Couldn't tell) |
| HS-1788779706-1 | 1788779706 | events · events.lifecycle | flagged | partial (llm-fast) | ZGRwY1FR, ZFFEY1FR | – | As the buyer, read the round's activity log (the Order Activity lines) and check that Schema check: “items” is not empty; Data check: “items” contains publication; Data check: “items” contains invitation; Schema check: “items” is not empty; Data check: “items” contains closure. → 200 | 16 (1 Partly checked) |
| HS-1788845589-1 | 1788845589 | events · events.rfq_only | flagged | partial (llm-fast) | UVpkY1FR, UWNaY1FR | – | As the buyer, read the round's activity log (the Order Activity lines) and check that Status check: the reply's status code is a success (2xx — the request worked); Schema check: “items” is not empty; Data check: “items” contains price; Data check: “items” contains taxes; Data check: “items” contains delivery. → 200 | 16 (1 Not run) |
| HS-1788864597-1 | 1788864597 | events · events.rfq_only | flagged | partial (llm-fast) | UWtnY1FR, UURjY1FR | – | As the buyer, read the round's activity log (the Order Activity lines) and check that Status check: the reply's status code is a success (2xx — the request worked); Schema check: “items” is not empty; Schema check: “items” is not empty; Schema check: “items” is not empty; Data check: “items” contains delivery. → 200 | 16 (4 Partly checked, 1 Not run) |
| HS-1789275953-1 | 1789275953 | events · events.rfq_only | flagged | partial (llm-fast) | UXBaY1FR, UXBYY1FR | The buyer reads the round's activity log (the Order Activity lines). → 200 passed | As the buyer, read the round's activity log (the Order Activity lines) and check that the closed RFQ has Order Activity entries; activity includes the vendor's submitted price; activity includes tax details; activity includes delivery terms. → 200 | 16 (3 Not run, 2 Partly checked) |
| HS-2620000536-1 | 2620000536 | events · events.validation | flagged | partial (llm-fast) | cFFaY1FR, cFFEY1FR | The buyer sends the request that updates (and publishes) the event, the request the case itself writes. → 200 passed | As the buyer, read the event and check that the current event no longer has the active line item. → 200 | 16 (1 Not run) |
| HS-3000057409-1 | 3000057409 | award · award.partial | flagged | partial (llm-fast) | Y05aY1FR, Y05EY1FR | The buyer sends the award proposal call, exactly as the matching library case writes it. → 422 failed | – | 16 (1 Couldn't tell) |
| HS-333728207591-1 | 333728207591 | events · events.validation | flagged | partial (llm-fast) | cGRjY1FR, cGRwY1FR | The buyer sends the request that updates (and publishes) the event, the request the case itself writes. → 200 passed | As the buyer, read the event and check that Data check: “status” equals in_active. → 200 | 15 (1 Not run) |
| HS-4400001037-1 | 4400001037 | events · events.rfq_only | flagged | partial (llm-fast) | UU5rY1FR, UU5OY1FR | – | As the buyer, read the round's activity log (the Order Activity lines) and check that Status check: the reply's status code is a success (2xx — the request worked); Schema check: “items” is not empty; Data check: “items” contains price; Data check: “items” contains taxes; Data check: “items” contains delivery terms. → 200 | 9 (7 UI pending) |
| HS-4500423596-1 | 4500423596 | evaluation · evaluation.qcs | flagged | partial (llm-fast) | a0RkY1FR, a3BEY1FR | The buyer awards the line to a vendor on the proposal for the invited QA vendor. → 422 failed | – | 15 (1 Not run) |
| HS-4540038419-1 | 4540038419 | auction · auction.convert | flagged | partial (llm-fast) | Y0RrY1FR, Y0ROY1FR | The buyer converts the pricing round into a live auction. → 200 passed | As the buyer, read the pricing round and check that Status check: the reply's status code is a success (2xx — the request worked); Data check: “rfx mode” equals auction. → 200 | 14 (1 Fail) |
| HS-8950744869-1 | 8950744869 | events · events.validation | flagged | partial (llm-fast) | a1pjY1FR, a1pwY1FR | The buyer publishes the event. → 200 passed | As the buyer, read the event and check that Status check: the reply's status code is a success (2xx — the request worked); Data check: “status” equals active. → 200 | 17 (17 UI pending) |
| HS-919958798517-1 | 919958798517 | events · events.validation | flagged | partial (llm-fast) | a1pkY1FR, a2NaY1FR | The buyer publishes the event. → 200 passed | As the buyer, read the event and check that Data check: “status” equals active. → 200 | 15 (1 Partly checked) |
| HS-1234567596-1 | 1234567596 | events · events.invite_vendors | not showing | partial (llm-fast) | Y3BjY1FR | The invited QA vendor starts a technical response on the RFP round. → 200 passed | – | 15 (1 Couldn't tell) |
| HS-123456798-1 | 123456798 | events · events.invite_vendors | not showing | partial (llm-fast) | TmtrY1FR | The buyer invites QA vendor 2 to the live round. → 200 passed | – | 16 (1 Not run) |
| HS-1788494052-1 | 1788494052 | events · events.rfq_only | not showing | partial (llm-fast) | ZGtaY1FR | – | – | 16 (3 Not run, 2 Partly checked) |
| HS-1788594796-1 | 1788594796 | events · events.lifecycle | not showing | partial (llm-fast) | RE5wY1FR | – | – | 16 (12 UI pending) |
| HS-1788758537-1 | 1788758537 | events · events.rfq_only | not showing | partial (llm-fast) | RFFjY1FR | The invited QA vendor places a complete bid of 100 (open, price, submit). → 200 passed | – | 16 (3 Not run, 1 Couldn't tell, 1 Partly checked) |
| HS-1788766646-1 | 1788766646 | events · events.rfq_only | not showing | partial (llm-fast) | RFFwY1FR | – | – | 16 (3 Not run, 2 Partly checked) |
| HS-1788778411-1 | 1788778411 | events · events.rfq_only | not showing | partial (llm-fast) | cGdYY1FR | – | – | 16 (1 Not run, 2 Fail, 2 Partly checked) |
| HS-1788780109-1 | 1788780109 | events · events.rfq_only | not showing | partial (llm-fast) | UWdRY1FR | – | – | 16 (4 Partly checked, 1 Not run) |
| HS-1788939608-1 | 1788939608 | events · events.rfq_only | not showing | partial (llm-fast) | cERRY1FR | – | – | 16 (3 Not run, 2 Partly checked) |
| HS-2000183961-1 | 2000183961 | events · events.validation | not showing | partial (llm-fast) | TmdrY1FR | – | – | 18 (1 Not run) |
| HS-260127813-1 | 260127813 | events · events.validation | not showing | partial (llm-fast) | cFhrY1FR | The buyer publishes the event. → 200 passed | – | 14 (12 UI pending) |
| HS-260127814-1 | 260127814 | events · events.validation | not showing | partial (llm-fast) | cFhOY1FR | – | – | 9 (1 Not run) |
| HS-314647015155-1 | 314647015155 | events · events.invite_vendors | not showing | partial (llm-fast) | ZE5OY1FY | – | – | 16 (1 Not run, 1 Partly checked) |
| HS-318439218889-1 | 318439218889 | auction · auction.rank | not showing | partial (llm-fast) | UWdkY1FY | The buyer reads the round's comparison (ranks, best bidder). → 200 passed | – | 16 (1 Fail) |
| HS-320376728260-1 | 320376728260 | events · events.invite_vendors | not showing | partial (llm-fast) | UVpYY1FY | – | – | 12 (10 UI pending) |
| HS-320408068811-1 | 320408068811 | events · events.publish | not showing | partial (llm-fast) | UWNrY1FY | The buyer publishes the event to 1 vendor. → 200 passed | – | 16 (1 Not run) |
| HS-320410213071-1 | 320410213071 | events · events.config | not showing | partial (llm-fast) | UWNOY1FY | The invited QA vendor places a complete bid (open, price, submit). → 200 passed | – | 16 (1 Couldn't tell, 1 Partly checked) |
| HS-321087028937-1 | 321087028937 | events · events.invite_vendors | not showing | partial (llm-fast) | UWNnY1FY | The buyer lists the event's invited vendors. → 200 passed | – | 16 (1 Fail) |
| HS-322197653203-1 | 322197653203, 330557444824 | evaluation · evaluation.qcs | not showing | partial (llm-fast) | UWtwY1FY | The buyer reads the pricing round. → 200 passed | – | 16 (1 Not run) |
| HS-325223479016-1 | 325223479016 | events · events.invite_vendors | not showing | partial (llm-fast) | Y3BwY1FR | – | – | 15 (1 Couldn't tell) |
| HS-325460232894-1 | 325460232894 | evaluation · evaluation.score | not showing | partial (llm-fast) | Y3BkY1FR | The buyer reads the technical round. → 200 passed | – | 13 (1 UI pending) |
| HS-325496725236-1 | 325496725236 | bids · bids.submit | not showing | partial (llm-fast) | Y05YY1FR | The invited QA vendor places a complete bid of 100 (open, price, submit). → 200 passed | – | 16 (1 Couldn't tell) |
| HS-326785788660-1 | 326785788660 | award · award.proposal | not showing | partial (llm-fast) | Y2RkY1FR | The buyer opens an award proposal. → 200 passed | – | 16 (10 UI pending) |
| HS-327180075741-1 | 327180075741 | auction · auction.knockout | not showing | partial (llm-fast) | a2dnY1FR | The buyer publishes the event. → 200 passed | – | 16 (1 Fail, 1 Partly checked) |
| HS-329436196599-1 | 329436196599 | events · events.config | not showing | partial (llm-fast) | a05rY1FR | The invited QA vendor places a complete bid of 21000 (open, price, submit). → 200 passed | – | 16 (1 Not run, 1 Fail, 1 Couldn't tell) |
| HS-331433635542-1 | 331433635542 | events · events.invite_vendors | not showing | partial (llm-fast) | a1FRY1FR | The buyer invites QA vendor 2 to the live round. → 200 passed | – | 16 (1 Not run) |
| HS-331472847553-1 | 331472847553 | events · events.validation | not showing | partial (llm-fast) | a1FrY1FR | The invited QA vendor reads the pricing round's schema. → 200 passed | – | 18 (1 Partly checked) |
| HS-331486867157-1 | 331486867157 | events · events.validation | not showing | partial (llm-fast) | a1FnY1FR | The buyer publishes the event. → 200 passed | – | 17 (2 Partly checked) |
| HS-333079559919-1 | 333079559919 | evaluation · evaluation.score | not showing | partial (llm-fast) | RGdjY1FR | – | – | 17 |
| HS-333686162167-1 | 333686162167 | events · events.rfp_rfq | not showing | partial (llm-fast) | cGRkY1FR | The invited QA vendor reads the pricing round. → 200 passed | – | 10 (10 UI pending) |
| HS-4500422950-1 | 4500422950 | evaluation · evaluation.qcs | not showing | partial (llm-fast) | a2trY1FR | – | – | 11 (1 Not run) |
| HS-4540037851-1 | 4540037851 | events · events.rfq_only | not showing | partial (llm-fast) | UWtjY1FY | The invited QA vendor reads the pricing round. → 200 passed | – | 16 (1 Partly checked) |
| HS-493427019463-1 | 493427019463 | evaluation · evaluation.tna | not showing | partial (llm-fast) | Y0RnY1FR | The buyer opens an award proposal. → 200 passed | – | 16 (1 Not run) |
| HS-5000000781-1 | 5000000781 | evaluation · evaluation.score | not showing | partial (llm-fast) | Y1FYY1FR | The buyer reads the technical round. → 200 passed | – | 16 |
| HS-5200049644-1 | 5200049644 | events · events.validation | not showing | partial (llm-fast) | TmNYY1FR | – | – | 9 (1 Partly checked) |
| HS-7015450020-1 | 7015450020 | events · events.validation | not showing | partial (llm-fast) | a2dRY1FR | – | – | 15 (1 Partly checked) |
| HS-9958798517-1 | 9958798517 | events · events.publish | not showing | partial (llm-fast) | a2NEY1FR | The buyer publishes the event to 1 vendor. → 200 passed | – | 12 (1 Fail) |
| HS-9984820222-1 | 9984820222 | evaluation · evaluation.score | not showing | partial (llm-fast) | a2drY1FR | – | – | 16 (3 UI pending) |
| HS-1788779309-1 | 1788779309 | events · events.rfq_only | not yet run | partial (llm-fast) | – | – | – | 16 (12 UI pending) |
