# spine.ai — bugs found and ticket replay, as of 17 Nov 2026

Every number below comes from a file in this repo (named beside it). Nothing is counted from memory. "UAT" means Procol's test tenants: PROCOL DEMO (company 198678 on cpanel.ag-ri.in), Demo Account 2, Procol Sandbox Demo, DLF UAT, GMMCO (revalidation) and the console on console.ag-ri.in.

## 1. Real bugs the platform found

Three tiers, by how far each finding has been checked.

### Tier 1 — confirmed by people on fresh test events, delivered on a bug sheet: 151

| Stream (when, where) | Bugs | Severity | Source file |
|---|---|---|---|
| Events module POC — API + UI (1–9 Oct, PROCOL DEMO, Demo Account 2, Sandbox PO) | 86 | 2 Critical · 19 High · 49 Medium · 16 Low | docs/bugs/Procol_bugs_found_2026-10-03.xlsx — Bugs |
| Vendor bulk upload (9–20 Oct) | 34 | BUG-01…BUG-34 | test-cases/vendor-bulk-bug-sheet.md |
| Approval routing (3–4 Nov, DLF UAT) | 12 | 4 High · 5 Medium · 2 Low · 1 Info | test-cases/Approval_Routing_Test_Cases_and_Bugs.xlsx — Bug Sheet |
| Template Studio (29 Oct, support console) | 9 | 4 High · 3 Medium · 2 Low | test-cases/Template_Studio_Test_Cases_and_Bugs.xlsx — Bug Sheet |
| Vendor onboarding end to end (30 Oct, cpanel + vendor portal) | 6 | 3 High · 3 Medium | test-cases/Vendor_Onboarding_E2E_Test_Cases_and_Bugs.xlsx — Bug Sheet |
| Vendor revalidation (15–20 Oct, GMMCO on rfx-uat-api) | 4 confirmed (+1 intermittent) | 3 High · 1 Medium · 1 Low | procol test/config/findings.json |

What the 86 are, by kind (from the same sheet): 47 server crashes, 8 business-rule breaks, 7 screens showing wrong data, 6 wrong results, 4 wrong messages, 4 data-integrity faults, 3 permission faults, 3 validation gaps, 3 data leaks, 1 crash with a wrong result. Every row names how it was verified ("Reproduced on PROCOL DEMO on two separate fresh test events", "Replayed today and still present").

### Tier 2 — reproduced twice by the platform with the request and reply attached, on a bug sheet, awaiting the team's sign-off: 30

| Stream | Bugs | Evidence |
|---|---|---|
| Stored API plans re-run on fresh events (13 Nov, PROCOL DEMO): 19 of 21 failed again the same way — 10 server errors (5xx) and 9 "accepted where the product documents a refusal" | 19 | prototype/data/night/api-pairs-2026-11-13.md (real payloads); bug sheet docs/bugs/Procol_bugs_found_2026-11-13.xlsx (local): 15 API rows + 2 auction rows |
| HubSpot ticket replay (5–9 Nov): a vendor removed from the technical stage can still price and submit an RFQ bid (ticket 323881661152, closed P4 without a fix) | 1 | test-cases/RCA_Real_Bugs_Run_Report.xlsx (RCA-API-035); test-cases/rca-review.json |
| Explored flows with settings switched (12 Nov): greyed-out Settings items with no tooltip, "RFQ NaN" on the award proposal, and five more | 7 | commit 72e861e2; sheet procol-explored-flows (395 cases) |
| PR assignee filter + notifications (4 Nov, DLF UAT): cross-page Assign, empty notification message | 3 | commit 6aecd940; sheet pr-assignee (66 cases) |

### Tier 3 — seen live, waiting for a hand check or a product answer: 23

- 12 "needs product confirmation" rows on the 3 Oct sheet; 3 client data problems beside them (not code bugs).
- 7 auction-strategy findings (13–16 Nov): tick size 0 accepted on a Dutch auction; Dutch start 100 / end 200 accepted on a reverse auction; knockout base price 0 refused with the tick-size message; empty traffic-light ranges refused with the TYPE's message ("Traffic light type is required"); the single-product + traffic-light rule the dashboard reads but never sets (SRC-AUC-014); the dynamic-extension trigger refused by the server in different words from the screen; tied bids both shown as "Rank 2". All in docs/bugs/platform-fixes-needed.md.
- 2 report observations (16 Nov): the Master QCS report's "Event End Time" is the evaluation end and "Event Closed At" is blank on a finished auction; a bid's stored end-time copies stay at the old end after a dynamic extension.
- 1 intermittent revalidation finding; 1 open backend change the multi-entity e-mail cases wait on (procol-backend PR 17775).

### What a raw "Fail" is not

The sheet runner's latest verdicts for the sourcing sheet (60 cases run 9–16 Nov) read 15 Pass, 19 Fail, 21 Couldn't tell, 3 Partly checked, 2 Not run. Of the 19 Fails, 4 are the auction-strategy findings above; the other 15 were runner faults since fixed (product-variant and delivery-location cells, template rules). A Fail becomes a bug only after the re-run on a second fresh event and a person's read of the evidence — that step is why the tier-1 numbers hold.

## 2. HubSpot tickets → cases → replay

The HubSpot pipeline (`npm run hubspot:ingest` → `cases:import` → `hubspot:reproduce`, docs/hubspot-pipeline.md) strips personal data, sorts each ticket, matches it to a feature and writes a regression case; a ticket becomes a bug only when its case fails on two fresh test events. The only HubSpot drop in the repo is a synthetic dataset (3 Oct) because the CSV export needs a HubSpot admin; the real tickets came through the RCA export.

| | Animesh (Jul–Sep export) | Aanya (full export as PDF) |
|---|---|---|
| Tickets considered | 36 distinct HubSpot ids | 1,033 rows, every HubSpot id matched |
| Cases written from them | 38 (14 Critical · 17 High · 6 Medium · 1 Low; 36 Regression · 2 Negative) | 40 (29 Regression · 9 Negative …), in the sourcing sheet's 14 columns + Ticket + QA Comment |
| Where run | PROCOL DEMO, 4–9 Nov | PROCOL DEMO on a second server, QA vendor only, 13–14 Nov |
| Replay result | 13 Pass · 11 Couldn't tell · 9 Partly checked · 2 Blocked · 1 Fail · 1 Observation · 1 Not run | 0 Pass · 3 Fail · 27 Not run · 10 Couldn't tell |
| Still-present bugs | 1 (RCA-API-035, reproduced twice, High) | 0 — the 3 Fails were test problems on re-read (Download Excel not pressed, Update audience not pressed, "You created the event" looked for by a non-creator); all three fixed in the runner on 16 Nov |
| Fixed since the ticket (the expected behaviour now holds) | 13 | — |
| Files | test-cases/RCA_Real_Bugs_Jul-Sep_2026.xlsx, RCA_Real_Bugs_Run_Report.xlsx, rca-review.json, RCA_Replay_Report.html | test-cases/rca-retrieval-pdf-to-json.py, rca-build-v2-cases.py (branch aanya); RCA_Real_Bugs_v2.xlsx and rca-review-v2.json are local, never committed (ticket text) |

What the replay proves: a case written from a ticket tells "fixed" from "still broken" with evidence — 13 tickets confirmed fixed, 1 confirmed still open — and it says plainly when it cannot judge (Couldn't tell, Blocked) instead of guessing. Aanya's 27 "Not run" are the runner's set-up gaps, now listed and mostly closed (vendor-portal steps, save-draft, three bidders, technical stage); the 10 "Couldn't tell" need a tester answering the on-screen questions, which is the day-3 plan.

## 3. How many cases exist, and where

| Set | Cases | File |
|---|---|---|
| Catalog (UI 2,634 · API 4,151) | 6,785 | prototype/data/test-cases.json |
| Sheet cases (sourcing 1,096 · explored flows 395 · email approvals 80 · PR assignee 66 · RCA 38 · derived 24) | 2,235 | prototype/data/sheet-cases.json |
| Team workbooks: approval routing 119 · Template Studio 124 · vendor onboarding 63 · vendor bulk upload 204 · revalidation 159 | 669 | test-cases/*.xlsx, vendor-bulk, reval:gen |
| Bug write-ups the platform drafted in plain words (338 distinct titles; 53 about server errors; sourcing events 206, vendors 28, bulk upload 24, revalidation 19 …) | 341 | prototype/data/plain-bugs.json (9–16 Nov) |

## 4. What is measured, and what is not yet

- docs/METRICS.md defines precision (real), recall, false-alarm rate, mutation score, flaky rate, DDP and leakage, with the 3 Oct bug sheet as the truth for "known bug". The evaluation harness and its planted-bug hooks exist; the last results are not stored in the repo (prototype/data/eval holds the config and labels only), so no precision figure is claimed here.
- Routing eval (docs/PLATFORM-REPORT.md): 102 instructions, journey accuracy 98.0 %, parameters 100 %.

## 6. Proof made by the platform itself (17 Nov, afternoon)

No case below was written by hand or by Claude; the platform wrote and ran them.

**A feature described in words → flows → live runs on PROCOL DEMO.** One plain-language description of "Traffic light auction with dynamic time extension" was given to the guided session. The platform read it into 5 flows, 7 rules and 5 questions of its own, built each start state through the API on the product the description names ("CYLINDER WITH KEY & KNOB", 1100001325, quantity 10, bounds 950 / 1,000), and ran each flow on the real screens:

| Flow the platform found | Verdict | What it showed |
|---|---|---|
| Create a traffic-light auction with dynamic extension | works (12/12) | published from the single-stage screen |
| Vendor bidding and zone tags | works (14/14) | test@dummy.com bid 120 → "Red Zone" (₹1,200), 100 → "Yellow Zone" (₹1,000), 95 → "Green Zone" (₹950) on its own portal |
| Dynamic extension trigger | works (15/15) | NON PQ VENDOR's late 95 (first bid 100) moved the end 06:28:32 → 06:30:32; the platform signed in as the second QA vendor (qa_1790821112465_v2@example.com) and saw the same move on its own portal; buyer console agreed; Overview "Dynamic time extended: 2 min"; Order Activity logged the extension |
| Zone visibility | works (20/20) | green only allowed: test@dummy.com (95) sees "1 ₹ 950 Green Zone Rank: 1"; signed in as samplevendor@vendortestt.co (100) → "Yellow Zone", no rank, no best price; as Sampletest.sas@sasco45.in (120) → "Red Zone", no rank, no best price |
| Finished auction on Master QCS | works | ranks and the downloaded report match the screen |

All five flows ran with nobody answering a question: every "check it in the other vendor's own session" became a real sign-in on that vendor's portal.

**One intermittent finding:** on 2 of 3 fresh events (99080 / RFX-21265, 99214 / RFX-21389) the extension happened — the database holds the dynamic_extra_time schedule and the extension count 1 — but Order Activity did not log it; on the third it did. A hand check, not a confirmed bug (docs/bugs/platform-fixes-needed.md).

**The real HubSpot export through the platform's own pipeline.** The RCA retrieval export (1,033 real tickets, Jul–Sep 2026) went through `hubspot:ingest` on the platform's fast model: personal data removed (502 names, 147 phone numbers, 112 company names …), 872 sorted as defects. Against the team's own "Is Defect" column: 700 agree, 172 extra, 40 missed — precision 80.3 %, recall 94.6 %. The platform wrote 527 regression cases (test-cases/hubspot-regressions.md, ids HS-<ticket>-N). The 153 tickets the team marks as defects and not yet closed have 79 platform cases; 14 of them were replayed on fresh PROCOL DEMO events through the API: 8 no longer reproduce, 3 failed the same way on a second fresh event and are flagged for confirmation (HS-318440667838-1, HS-318541871855-1, HS-320401698541-1), 2 couldn't tell (a company setting the run does not switch), 1 no verdict.

## 5. The one-paragraph version

Across the events module, vendor bulk upload, approval routing, Template Studio, vendor onboarding and revalidation, the platform has 151 bugs confirmed by people on fresh UAT test events and delivered on bug sheets, 30 more reproduced twice with evidence awaiting sign-off, and 23 observations in the hand-check queue. From HubSpot tickets it has written 78 regression cases (38 from 36 Jul–Sep tickets, 40 from the full 1,033-row export); replaying the 38 confirmed 13 tickets fixed and 1 still open on UAT with evidence, and the 40 gave the honest list of what the runner still needs to start them.
