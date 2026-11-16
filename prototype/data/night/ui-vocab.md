# Night of 10 Nov 2026 — browser compiler vocabulary (agent: ui-vocab)

Worktree `/Users/animesh/Desktop/procol-night-ui-vocab`, branch `night/ui-vocab`. Compile-only: no browser tonight.
Every new executor step below is **not yet exercised live** — the orchestrator runs them tomorrow.

## 00:30–01:10 Baseline

Measured set = 291 screen cases (prep-ok UI- cases): 125 stored plans at coverage **none**, 87 **partial**, 79 prep-ok cases with **no stored plan** (27 of them UI-VBID vendor-portal cases; 25 UI-F* flow-map cases; the rest scattered).
Stored plans (copied from rca-wt as the baseline, 274 files): full 61 / partial 87 / none 125.

Gap sources clustered (ledger 2,338 needs + 562 plan-meta gaps = 2,900 needs; one need may match several themes, first match wins):

| needs | cases | theme | mine? | example |
|---|---|---|---|---|
| 451 | 281 | vendor bid (any mention of a bid) | partly — vendor-side bid steps after switch_portal | UI-FCOL-002 "sign in as the vendor, enter a net price above the cap, submit" |
| 295 | 197 | verify/assert of a value (generic) | yes — compare / read steps | UI-SCH-014 "footer chip's start and end equal the drawer's values" |
| 213 | 137 | setting / tenant gate flip | no (state) | UI-TECH-009 "rfpEvaluationOn = lot" |
| 195 | 137 | "the prepared state cannot …" | no (state agent) | UI-SUR-009 withdrawn event |
| 190 | 91 | proposal / award / approver | mostly no (approver login, second proposal) | UI-AWD-013 |
| 160 | 95 | table row / cell / count | yes — expect_table | UI-PART-007 "audience count before and after" |
| 124 | 95 | second vendor / two vendors | no (state) | UI-FQCS-003 |
| 113 | 77 | compare two values (API ↔ screen, screen ↔ screen, buyer ↔ vendor) | yes — remember/expect_remembered across targets | UI-XCHK-OVW-004 savings on Responses vs Overview |
| 113 | 64 | schedule / absolute times | partly — compiler rules; absolute start/end needs the drawer live | UI-FSCH-002 start in the past |
| 111 | 91 | vendor portal view | yes — the compiler is not told switch_portal/vendor_open_event firmly enough | UI-PART-018 |
| 95 | 66 | API / network / status code | no (API cases) | UI-VAL-016 |
| 91 | 95 | "log in as Vendor A in a separate session" | **yes** — switch_portal exists since 2 Nov, still listed as a gap | SRC-TNC-064 |
| 86 | 54 | tabs / stage switch | partly (go_to tab exists) | UI-XDBOQ-015 |
| 58 | 37 | counter offer | steps exist; gaps are two-vendor state | UI-XDNEG-010 |
| 57 | 37 | toast / message wording | yes — rule lines (expect_message any) | UI-PR-004 |
| 52 | 33 | downloads / uploads | partly — rule lines (expect_download exists) | UI-BOQ-004 |
| 31 | 21 | disabled control + tooltip | yes — rule line (expect_disabled + expect_message tooltip) | UI-TPL-006 |
| 23 | 13 | ⋮ / Settings menu items | yes — the rules never mention event_menu / expect_menu_item | UI-TPL-007 |
| 11 | 9 | dropdown / menu option lists | yes — expect_options | UI-FSCH-004 duration presets |

Themes picked, in order: (A) vendor separate session → switch_portal (rule + gap resolver), (D) option lists `expect_options`, (C) tables `expect_table`, (B) cross-target comparison via `remember` / `expect_remembered`, (E/F/H/L) rule lines for disabled+tooltip, menus, messages, sheet cells, (J) vendor-side bid steps on the open portal, (K) schedule rules.

## 01:10–02:00 Built (commit c38cd9f) — all executors NOT YET EXERCISED LIVE

New steps (procol-ui-tests):
- `expect_options{name|label, options, absent, disabled, enabled, count, only}` (generic, assertion) — opens a dropdown / select / menu / tab strip / radio group, reads what it offers and which items are greyed out, judges, closes it. Executor `generic/run.ts expectOptions`.
- `expect_table{within, rows|min|max, row, present, cells:{header: value}, eachRow}` (generic, assertion) — HTML / antd / ARIA tables: row count (two equal reads), a row by its words, a row's cell under a header (numbers compared as numbers). Executor `expectTable`.
- `expect_remembered` extended: compare the remembered text with ANOTHER element (role/name/label/text/within — another tab, the other portal), `as:"number"`, `delta:"+1"`, `contains`.
- `vendor_bid{price, submit}` (vendor portal) — on the OPEN supplier portal: types the price into every price cell (VendorPortalPage.fillBid, the live-proven code of place_bid) and presses Submit Quote; returns "bid submitted …" / "blocked: …" (a disabled Submit, a refusal toast) / "could not tell". `attempt{step:"vendor_bid", args:{price:-100}, expect:"refused"}` for a refused price. Executor `runPlan.ts vendorBid`.
- `numberOf()` exported from generic/run.ts (₹, Indian grouping, units ignored) — unit-tested.

Compiler (prototype/src/agents/planner.ts):
- DOMAIN_RULES gained "WHAT THE VOCABULARY CAN ALREADY SAY": the vendor's separate session = switch_portal + vendor_open_event (+ vendor_bid); option lists; tables; comparisons across screens; greyed-out + tooltip; the ⋮ / Settings menus (expect_menu_item / event_menu); messages; one sheet cell (set_sheet_cell); downloads; and an explicit STILL GAPS list (tenant settings, a second vendor's session, approver sign-in, payload structure, absolute schedule times, knockout/dutch on a fresh screen) so the compiler does not substitute.
- `resolveCoveredGaps()` — a declared gap is dropped ONLY when the plan holds the step that does it (switch_portal for "separate session" — never for a second / uninvited vendor; expect_message tooltip; expect_options; expect_table or expect_remembered{delta}; expect_remembered with a target / expect_api_value; expect_menu_item; set_sheet_cell; vendor_bid). Every drop is a "resolved: …" warning.
- lint: place_bid / attempt{place_bid} after switch_portal → vendor_bid; vendor_bid with no portal open gets switch_portal + vendor_open_event in front; the "vendor only looks" drop now covers vendor_bid; VENDOR_BIDS also reads "as the vendor, enter -100 and submit", "try to bid", "revise the bid"; on a prepared vendor screen place_bid → vendor_bid before lint.
- `expect_options` and `expect_remembered` are LABELLED_STEPS (a guessed opener = partial coverage).

Measurement: `scripts/compile-ui-measure.ts` (concurrency 2, Slingring-only, retry after 30 s, "not compiled (gateway)" left out; `--store` writes the runner's meta shape). Unit tests: `scripts/ui-vocab-unit-tests.ts` 13/13.

Baseline of the 79 missing cases is being compiled with the OLD compiler (rca-wt code, read-only) → `data/night/before-missing.json`.

Fresh ledger (rca-wt, orchestrator, since 00:30): 240 needs — SRC-AWD 128 (awarding page: Show awarded bids, hidden fields / full screen, Stop Auto Awarding menu, "no approver" refusal, Excel awarding upload), SRC-ACT 39, SRC-AUC 20, UI-VBID 17 (old code: still "sign in as the vendor" gaps — the new rules address these after merge).

## 02:00–02:30 More vocabulary (commits bd9c247, 86ea193)
- A SECOND VENDOR'S BID on a prepared live/bid event = `place_surrogate_bid` (event-vendor mode — many vendors invited; the runner never drops it): preparedRules + DOMAIN_RULES say so; the resolver drops a "only one vendor / second vendor's bid" gap when the plan holds a surrogate bid — never a second vendor's own session / view / sign-in. (In QA-vendors-only mode the rule is not shown.)
- Known labels: 20 awarding / auto-awarding / comparison-grid strings from the dashboard source (en.json keys + the jsx rendering them: Start Awarding, Select for awarding, Download the Awarding sheet, Upload filled sheet, Disable Auto Awarding, Auto Awarding Enabled/Disabled/in progress, Hide fields, hidden field, Row Height, Fullscreen, Exit Fullscreen, Download Report, the two Start-Awarding refusals) and 15 supplier-portal labels the live place_bid step matched (Submit Quote, Submitted, Terms and Conditions, Details / Technical Stage / RFQ, Quick Fill, Same as requested, the draft bar, Accept Counter Offer, Price / Quantity Available). Catalog: 133 steps, 565 known + 64 seen labels.
- Unit tests 14/14.

## 02:30 Baseline measured — the 79 prep-ok cases with no stored plan, OLD compiler (rca-wt code, Slingring-only, 0 gateway failures)
full 17 / partial 50 / none 12. The 12 none: 8 of them "the plan has no assertion step" (ask_tester / do_on_screen as the last step — UI-ENV-007, UI-FSCH-002, UI-FSCH-006, UI-FVND-002, UI-VBID-022, UI-VBID-030, UI-FTTL-001, UI-FUPL-002), 4 state/setting-bound (UI-XDBOQ-015, UI-XDAPR-009, UI-FCAP-003, UI-FVND-004).
Recurring partial gaps: dynamic values the case does not state (auto titles, "exactly one card with the ref id"), guessed preset labels ("30 minutes"), "needs a different starting state than live (asked for invite_vendor)" = the prep put a create-screen case on a live event (prep agent's area), tenant settings, second-user / second-vendor sessions.
→ commit 8c50017: dynamic values via remember + expect_remembered{contains}; every plan ends in an assertion; exact preset labels (30 Mins / 1 Hrs / 4 Hrs / 1 Days) added as known labels from getReadableDuration.
After-measure of the 79 (NEW compiler, --store) running → data/night/after-missing.json.

## 02:50 The 79 missing cases — before (old compiler) → after (commit 86ea193 state: new steps, vendor rules, resolver, labels; NOT yet the assertion / preset-label / vendor-list rules of 8c50017 + ac8283a, which landed while this run was compiling)
full 17 → 25, partial 50 → 41, none 12 → 13 (0 gateway failures either side). Moves: partial→full 9, none→full 3, none→partial 6; full→partial 4 (model variance on the fast tier: UI-VBID-020/014, UI-VAL-017, UI-TECH-017 — honest partials), partial→none 10 — 7 of those are plans ending in ask_tester ("the plan has no assertion step": UI-SCH-006, UI-AUC-010, UI-VBID-022, UI-XDBOQ-018, UI-FVND-005, UI-FCOL-007, UI-FVND-004), which the later "every plan ends in an assertion" rule targets.
10 of the 79 plans use the new steps (vendor_bid / expect_options / expect_table / expect_remembered): UI-VBID-004/006/007/011/015/021, UI-FCOL-001/004, UI-BOQ-011, UI-FSCH-004.
Now compiling the 212 stored non-full plans with the final rules (--store) → data/night/after-nonfull.json; the 79 are re-measured with the final rules afterwards.

## 03:10 FINAL SUMMARY (written 01:45 IST — all measurement done; no browser was opened tonight)

### Numbers (compile-only, fast tier, Slingring-only, concurrency 2; 0 "not compiled (gateway)" in any run)
Measured set = the 125 none + 87 partial stored plans + the 79 prep-ok cases with no plan (291 ids; 2 ids did not resolve, 289 compiled).
16 of the stored plans are now REFUSED by `prepFor` ("the API setup does not build a withdrawn / amended / dutch-knockout / masked state yet") — those belong to the state agent and are counted apart: UI-AUC-009/016/018, UI-CONV-009, UI-PUB-019, UI-SUR-009/012/013, UI-XDAMD-007/009/015, UI-XDAPR-012/014, UI-XDAUC-001/011, UI-XDLST-006.

| set | before (full / partial / none) | after (full / partial / none) |
|---|---|---|
| 79 prep-ok, no stored plan (before = OLD compiler run tonight) | 17 / 50 / 12 | **26 / 44 / 9** |
| 212 stored non-full plans (before = the stored plans; 16 prep-refused left out → 194) | 0 / 72 / 122 | **45 / 121 / 28** |
| **all 273** | **17 / 122 / 134** | **71 / 165 / 37** |

Reachable (full or partial): 139 → 236 of 273. "none" fell from 134 to 37; honesty kept — every remaining none names what no step can observe, and the model's own "none" is only read as partial when every gap it named is done by a step in the plan (said out loud).
Steps used in the new plans: switch_portal 45, expect_options 10, place_surrogate_bid 9, set_sheet_cell 7, expect_remembered 7, expect_menu_item 5, expect_table 4, vendor_bid 3; the gap resolver fired in 12 plans.
Stored plans were rewritten with `--store` (same meta shape as run-ui-cases.ts) — committed separately so the orchestrator can take or drop that commit.

### New steps (ALL "not yet exercised live" — the orchestrator runs them tomorrow)
- `expect_options` — what a dropdown / select / menu / tab strip / radio group offers (present, absent, greyed-out, count, only). `generic/run.ts expectOptions`.
- `expect_table` — rows and cells of a table / antd table / ARIA grid (rows|min|max, row present/absent, cells {header: value}, eachRow). `expectTable`.
- `expect_remembered` (extended) — compare with ANOTHER element / screen / portal; `as:"number"`, `delta:"+1"`, `contains`.
- `vendor_bid{price, submit}` — the vendor's own bid on the OPEN supplier portal (place_bid's fillBid / submitBid / bidSubmitted); "blocked: …" on a disabled Submit or a refusal toast; `attempt{vendor_bid}` for a refused price. `runPlan.ts vendorBid`.
- `numberOf()` helper (unit-tested).

### Compiler changes (prototype/src/agents/planner.ts, additive)
- DOMAIN_RULES "WHAT THE VOCABULARY CAN ALREADY SAY": vendor separate session = switch_portal + vendor_open_event (+ vendor_bid); a second vendor's bid = place_surrogate_bid; option lists; tables; comparisons via remember/expect_remembered; greyed-out + tooltip; ⋮ / Settings menus; messages; one sheet cell; downloads; dynamic values; every plan ends in an assertion; exact preset labels; an explicit STILL GAPS list.
- preparedRules: vendor screen bids with vendor_bid; a second vendor's bid on live/bid = place_surrogate_bid (event-vendor mode only).
- `resolveCoveredGaps()` (exported, unit-tested): a declared gap is dropped only when the plan holds the step that does it; never a second vendor's / another user's session. Model "none" with every gap resolved → "partial" with a warning.
- lint: place_bid / attempt{place_bid} after switch_portal → vendor_bid; vendor_bid without a portal gets switch_portal + vendor_open_event; VENDOR_BIDS reads "as the vendor, enter -100 and submit", "try to bid", "revise".
- LABELLED_STEPS include expect_options / expect_remembered (a guessed opener = partial).
- Known labels (+39, from the dashboard source and the live-matched vendor page object): awarding / auto-awarding / comparison-grid options, supplier-portal controls, the schedule drawer's duration presets (30 Mins / 1 Hrs / 4 Hrs / 1 Days).

### Files changed
prototype/src/agents/planner.ts · prototype/scripts/compile-ui-measure.ts (new) · prototype/scripts/ui-vocab-unit-tests.ts (new, 15 tests) · procol-ui-tests/src/plan/generic/catalog.ts · generic/run.ts · generic/knownLabels.json · vendorPortalCatalog.ts · runPlan.ts · plan-catalog.json · prototype/data/night/* (notes + measurement summaries) · prototype/data/compiled-plans/ui-prepared/* (stored plans, separate commit).

### Remaining gap clusters (273 kept, after; gaps / cases / one example)
| gaps | cases | cluster | example |
|---|---|---|---|
| 59 | 50 | tenant setting / gate flip (not the compiler's) | UI-AUC-023 book building disabled by tenant setting |
| 30 | 27 | network payload / API / DB inspection | UI-AUC-011 "exactly one acceptance recorded" |
| 29 | 27 | a state the API does not build (second vendor's/user's session, two events, withdrawn, amended, knockout/dutch, staggered, BOQ upload) | UI-AUC-011 knockout offer accepted twice |
| 27 | 23 | label not rendered / unconfirmed | UI-CRE-015 stage tab "My Stage" |
| 20 | 19 | dynamic / unspecified value (no name, figure or id in the case) | UI-LI-016 "the same product P" with no product named |
| 15 | 10 | downloaded workbook contents (xlsx cells) | UI-AWD-020 awarding sheet cell by cell |
| 10 | 9 | another user / role / approver sign-in | UI-AWD-013 the approver approves |
| 10 | 8 | unchanged record counts after an action (proposals, bids) | UI-AWD-007 proposal count unchanged |
| 8 | 8 | either / or outcomes | UI-VBID-011 zero price refused OR accepted |
| 8 | 6 | absolute schedule times / evaluation window on the create screen | UI-SCH-009 separate evaluation duration |
| 7 | 6 | inline stage rename / icon-only controls | UI-CRE-015 |
| 4 | 4 | no assertion (ask_tester last) | UI-PART-018 |
| 4 | 4 | exhaustive proofs ("specifically because", "anywhere") | UI-CONV-005 |
| 4 | 3 | timer / countdown / auto-refresh | UI-SCH-010 |
| 189 | 118 | long tail: BOQ grid specifics (tabs, section rows, 500-line limit), approvals page (tabs, bulk Add Response), conversion popover checkboxes, "Update audience" modal, counter-offer drawer row selection, staggered-auction reopen drawer, knockout/dutch configuration, "needs a different starting state than live (asked for set_schedule, invite_vendor, publish)" = create-screen cases the prep put on a live event (prep agent) | UI-XDBOQ-014, UI-XDAPR-002, UI-XDAUC-004/018, UI-XDNEG-008, UI-EVDTME-005 |

Next vocabulary worth building (by count): an `expect_schedule`/`set_schedule{start,end,evaluation}` with absolute times on the create screen (needs the drawer live), BOQ grid readers (tabs + section rows — expect_table gets part of it once the BOQ fixture exists), approvals-page steps (tabs + bulk Add Response), the conversion popover's checkbox states (expect_options could read it if the popover's labels are confirmed live), counter-offer drawer row ticks.
