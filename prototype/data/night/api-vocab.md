# API test compiler — overnight notes (10 Nov 2026, branch night/api-vocab)

Progress file; updated as the night goes. Final summary at the end.

## Baseline (00:45 IST, no model)

Measured in this worktree with `scripts/compile-api-plans-stats.ts` (every catalog case whose route is
`api-plan`, judged by `planSpeaksForCase`):

| | cases |
|---|---|
| api-plan cases (all priorities/verdicts) | 1,379 |
| stored plan files | 496 (59 full, 237 partial that speak for the case, 200 partial that do not) |
| none (tried, no plan) | 641 |
| never compiled | 242 |
| **plans that speak for their case** | **293** |

`compile-api-plans.ts --dry --priority P0,P1,P2,P3 --all-verdicts`: 1,282 cases route at P0–P3;
441 already stored; 768 need the model.

The 641 "none" split: 409 "no valid API plan could be compiled from the words", 387 "the model's answer
was not JSON" (16 Oct, 100 ms apart, $0 — the model was never reached), 11 timeouts.

Top gap clusters behind "does not speak": 88 "the case reads as X, but the plan checks Y"; 39
"documented correct behaviour is a refusal, but the case checks only no crash"; 35 "library case needs a
starting state no recipe builds"; 22 "no read-back"; 20 "compiled by a fixed rule"; 14 company setting;
12 screen-only; 11+10+7+4 wrong actor/app; 9 not-super-admin.

## Changes so far

- `PLAN_VERSION` 1 → 2.
- New ops: `read_bid` (GET /bids/:id), `read_proposal` (GET /proposal/:id), `read_history`
  (GET /event_groups/:id/history) and `request` — the case's own request (method/path/body as written),
  kept by the validator to sourcing-event routes (+ reminders, v1/chats), known placeholders, no fixed ids,
  no `<description>` records; a verify step may be a GET request. Runner executes both.
- Validator (`validatePlan(raw, ctx)`): actor fixed from the app allow-lists (buyer on POST /v1/bids →
  vendor; vendor on event_indicators → buyer; library case written for the vendor → vendor) unless the case
  is about the cross-app refusal (then "cannot be executed"); expected outcome read against the case's
  words (`casePolarity`: title/expected first) → soft problems that trigger ONE repair round, kept with the
  gap when the repair does not help; `no-5xx` on a case expecting success becomes `accept`; the refusal
  code the case names is taken; a new field whose parent exists gets `add:true` with a warning.
- `polarityOf`: HTTP 2xx/4xx read first; product actions ("the buyer rejects a bid", "regrets a line",
  "blocks the vendor") are not refusals (seen on API-EVDRJB-001: planned as a refusal with code 33).
- `autoVerify`: a plan with no read-back gets one from its decisive step + outcome (title kept / status
  reached / bid counted / still draft / bid count unchanged …), only with fields seen in real replies.
- Journey-mutation family (API-N*, 138 cases, "Send `X` exactly as the journey does. Remove `f`…"):
  planned in code (`journeyMutation`), no model; 90 have an op, the rest are an honest none.
- Prompt: real body field paths of every write op (from the builders), request-op guidance, actor rule.
- Candidates: library cases whose starting state no recipe builds are no longer offered to the model.
- `askModel` reports gateway problems (`unreachable: …` / `fallback: <model>`) → `CompiledApiPlan.gateway`.
- `scripts/compile-api-plans-all.ts`: worker pool (concurrency 2 per the coordinator), 120 s/case,
  resumable, budget guard, atomic per-case files (none stored with plan null), index rebuilt from files,
  gateway failures retried once after 30 s then listed in `data/night/not-compiled-gateway.json`.
- `scripts/apiplanner-unit-tests.ts`: 37 checks, green. `scripts/compile-api-plans-stats.ts`: the numbers.
- Worktree: `procol-backend` symlinked at the root (untracked) so `errorMessage(code)` finds en-IN.yml.

## 01:00 IST — first long run in progress

- `compile-api-plans-all.ts --redo none --concurrency 2` started 00:53 on 883 cases (242 never
  compiled + 641 none); ~25 cases/min, no gateway problems so far. Log: `data/night/api-compile.log`.
- At 75/883: 30 full, 23 partial (51 speak), 22 none.
- Commits: 673d5ba (compiler v2 + scripts), b01c0b6 (convert_to_auction, empty-body rule,
  dependsOnSetting, recheckStoredPlan/--revalidate).
- Seen in the first results and fixed for the next pass: a vendor reading "another vendor's bid" was
  planned as reading its own (`read_bid2` added, prompt names it); a model gap admitting the decisive
  step stands in for the case ("…instead", "verifies only…") is now prefixed "the decisive step tests
  something else than the case's point" so routing's `planSpeaksForCase` sees it is about the point.
- Next: when the run ends → `compile-api-plans.ts --revalidate` (re-checks all stored plans in code:
  actors, outcome, codes, read-backs) → `--redo silent` for partial plans that still do not speak →
  stats → notes.

## 01:35 IST — pass 1 done, in-code re-check done, pass 2 running

- Pass 1 (`--redo none`, 883 cases, 41 min, 0 budget stops): 156 full, 293 partial (413 speak), 430 none,
  4 not compiled (gateway — in fact cut-off JSON answers; fixed in f425c48 to retry with a repair).
- `compile-api-plans.ts --revalidate` over 946 stored plans: 122 changed in code (actors fixed, no-5xx →
  accept, read-backs added), 34 upgraded to full, 1 downgraded, 24 no longer valid (request steps with an
  empty body — recompiled in pass 2).
- Stats after that: **619 of 1,379 plans speak for their case** (was 293); stored 945 (242 full, 380
  partial-speaks, 323 partial-silent); none 433; never compiled 1.
- Pass 2 started 01:35: `--redo silent` (318 partial plans that do not speak), log `api-compile-2.log`.
- Commits so far: 673d5ba, b01c0b6, cbb2628, f425c48, b6020cf.

## 04:30 IST — FINAL SUMMARY

Every api-plan case has now been compiled at least once (never compiled: 0). Four compile passes with the
fast tier only (concurrency 2 per the coordinator; 0 cases left "not compiled (gateway)" — the 6 that hit
cut-off answers or 429 timeouts were retried and stored), three in-code re-checks (`--revalidate`), no
UAT traffic, no reason tier. Slingring reported $0 for the HACK26 model (no price in the tally); the gateway
rate-limited once (22:28–22:44 UTC, two 120 s timeouts, both recompiled).

### Before / after

| | before (00:45) | after (04:27) |
|---|---|---|
| api-plan cases (all priorities / verdicts) | 1,379 | 1,379 |
| stored plan files | 496 | 1,002 (+377 `none` results stored with their reasons, plan null) |
| full | 59 | **343** |
| partial that speaks for the case (`planSpeaksForCase`) | 237 | **537** |
| partial that does not speak | 200 | 122 |
| none (tried, no honest plan) | 641 | 377 |
| never compiled | 242 | **0** |
| **plans that speak for their case** | **293** | **877** |

Per group: `data/night/final-by-group.txt` (e.g. API-XAWD 47/75, API-EVDWGT 44/57, API-EVDDOC 41/54,
API-EVDQRY 42/49, API-EVDRJB 38/42, API-N* journey-mutation 96/138, API-XREV 0/90).

### What changed in the compiler (src/agents/apiPlanner.ts, PLAN_VERSION 2)

1. `request` op — the case's own request (method/path/body as the case writes it), validator-bound to the
   sourcing-event routes (+ reminders, v1/chats, attachments), tokens from the plan's placeholders only, the
   two probe ids (Z2dnWmdaUWtnZw== = does not exist, WrongUuid1= = garbled), no `<description>` records,
   no empty write body (unless the case sends one); a verify step may be a GET request. Runner executes both.
2. New read-backs: `read_bid`, `read_bid2` (another vendor's bid), `read_proposal`, `read_history`.
3. `convert_to_auction` (the journey's auction body, `buildAuctionBody`) — API-NCONVERT 16/16 speak.
4. Validator with the case's words (`validatePlan(raw, ctx)`): actors fixed from the app allow-lists
   (buyer on POST /v1/bids → vendor; vendor on event_indicators → buyer; library case written for the
   vendor → vendor) unless the case is about that very refusal ("cannot be executed"); expected outcome read
   against the words → soft problem → one repair round, kept with the gap when the repair does not help;
   `no-5xx` on a case expecting success → `accept`; the refusal code the case names is kept (message from
   en-IN.yml); a new field whose parent exists → `add:true`.
5. `polarityOf` / `casePolarity`: the EXPECTED column before the title; HTTP 2xx/4xx read first; product
   actions ("the buyer rejects a bid", "regrets a line", "blocks the vendor", passive forms) are not refusals;
   "is not blocked" / "no savings error" = acceptance; "no second award can be started" = refusal; a
   "crashes" case with a reject plan is no contradiction.
6. `autoVerify`: a plan with no read-back gets one from its decisive step + outcome (title kept, status
   reached / unchanged, bid count up / unchanged, rounds added / unchanged, proposal present), only with
   fields seen in real replies.
7. `journeyMutation` (API-N*: "Send `X` exactly as the journey does. Remove `f`…"): planned in code, no
   model, 103 of 138 (the 35 others name steps with no builder: verify_otp, create_page_responses,
   evaluations, proposal submit, counter — honest none).
8. Prompt: real body field paths of every write op, request-op routes with examples, actor rule, product
   actions, `dependsOnSetting`; a case pointing at another case ("same as API-EVDWGT-013 with …") shows
   that case to the model; library cases whose starting state no recipe builds are not offered.
9. Honest gaps: a model gap admitting the decisive step stands in for the case ("…instead", "verifies
   only", "the setup cannot create…") is prefixed "the decisive step tests something else than the case's
   point" (matches routing's `GAP_ABOUT_THE_POINT`); a company setting/gate the case names →
   `dependsOnSetting` + its gap; the evaluator's form → "a starting state no recipe builds".
10. `askModel`: gateway problems reported (`unreachable:` / `fallback: <model>`); a cut-off JSON answer is
    retried with a repair; fast-tier answer budget 3,000 tokens.
11. `recheckStoredPlan` + `compile-api-plans.ts --revalidate`: every stored plan re-checked in code (actors,
    outcome, code, read-back, coverage, actor/app/role problems).

### Scripts

- `scripts/compile-api-plans-all.ts` — pool (default concurrency 2), 120 s/case, resumable, budget guard
  (`slingringOverBudget` → stop + `data/night/remaining.json`), atomic per-case files, index rebuilt from
  files, gateway failures retried once after 30 s then listed in `data/night/not-compiled-gateway.json`
  (empty at the end), `--redo partial,none,silent`, `--groups`, `--ids`, `--rebuild-index`, `--dry`.
- `scripts/compile-api-plans-stats.ts` — the before/after table, gap clusters, `--by-group`, `--sample`,
  `--endpoints`, `--mutations`.
- `scripts/compile-api-plans-smoke.ts` — one case with the model, verbose.
- `scripts/apiplanner-unit-tests.ts` — 51 checks, green (no model).

### What still cannot compile, and why (377 none + 122 partial-not-speaking)

Remaining `none`, by group (full table: `data/night/final-none-by-group.md`):

| group | none | example | first reason |
|---|---|---|---|
| API-XREV | 90 | API-XREV-A-01 | GET /runs/<the client's latest run>?workspace_id=<client> is outside the available operations and allowed requ |
| API-N* | 35 | API-NAWDSUB-001 | the step the case mutates (POST /proposal/:id/submit) is not an operation the plan vocabulary sends — the jour |
| API-XDPRE | 35 | API-XDPRE-013 | The vocabulary cannot create or use a second user session whose teams lack trade: create_record. |
| API-XAWD | 16 | API-XAWD-014 | act 1: library case EDGE-AWD-014 needs {{evalFormUuid}}, which setup "closed_rfp_rfq_with_tech_response" does  |
| API-EVRMEG | 15 | API-EVRMEG-007 | The available setup recipes cannot create two events, two technical rounds with distinct scales and modes, or  |
| API-EVDWGT | 13 | API-EVDWGT-005 | The valid lot weight request body is not specified, so the required PATCH request cannot be expressed without  |
| API-EVRMTR | 13 | API-EVRMTR-002 | Changing a draft round's type is not covered by an available operation or permitted request field. |
| API-EVRLIF | 12 | API-EVRLIF-003 | Deactivating a PR item is not expressible with the available recipes, operations, fields, or tokens. |
| API-EVDDOC | 8 | API-EVDDOC-016 | POST /trade/upload_file with numeric data is not covered by an operation or library case |
| API-EVDRGT | 8 | API-EVDRGT-002 | No recipe creates a draft whose line is already regretted. |
| API-BID | 7 | API-BID-018 | The POST endpoint/path for trade_credit_discount.discount is not provided, and no listed operation covers this |
| API-AUTH | 6 | API-AUTH-001 | OTP generation and verification endpoints, request bodies, and session/token assertions are outside the availa |
| API-STG | 6 | API-STG-008 | POST /trade/template_input requires a request body, but the case does not provide one; no matching library cas |
| API-EVDAPO | 5 | API-EVDAPO-001 | No operation can approve an award to completion. |
| API-PERM | 5 | API-PERM-004 | Stage creation via POST /trade/template_input is not covered by an operation or library case. |
| API-VAL | 5 | API-VAL-004 | No operation or library case provides a path for posting the truncated JSON body. |
| API-XDBOQ | 5 | API-XDBOQ-017 | No setup recipe creates a draft BOQ project with a BOQ RFQ stage built from a 3-line sheet and linked to a QA  |
| API-XDLOT | 5 | API-XDLOT-027 | No operation or library case expresses saving a lot with a title and description. |
| API-EVDQRY | 4 | API-EVDQRY-074 | The requested GET /chats endpoint is not available in the allowed vocabulary; only /v1/chats is permitted. |
| API-CONV | 3 | API-CONV-003 | Converting a non-existent trade cannot be expressed: no provided operation or library case specifies the conve |
| API-EVDAWD | 3 | API-EVDAWD-002 | No setup recipe creates the required post-split award with three vendors and awarded quantities of 10, 15, and |
| API-EVDNFA | 3 | API-EVDNFA-003 | No operation or library case expresses changing a vendor's awarded quantity on a submitted award, and the case |
| (other groups) | 75 | | |

Grouped by reason:

- **Not Procol's sourcing API at all (90)** — API-XREV-* target the platform's own vendor-revalidation
  API (`GET /runs`, `POST /trigger`, `/companies/filter_options`); they have their own runner
  (vendor-revalidation) and should not be routed `api-plan` (routing is not mine; flagged for the routing agent).
- **A caller no run signs in (≈60)** — a second/restricted console user, a non-super-admin, another company,
  the EVALUATOR (POST /evaluations needs the evaluator's session + `{{evalFormUuid}}`; the journey signs
  the evaluator in and closes the session, eventJourney.ts — exposing it to the runner is the next lever:
  ~30 cases in API-XAWD/API-N(E)*), three vendors.
- **A starting state no recipe builds (≈70)** — events from a purchase request with specific PR lines
  (API-XDPRE 35, API-EVRLIF), two/three line items with per-line bids, BOQ sheets, lots, split awards,
  multi-currency, a regretted line, a withdrawn technical round, evaluation scales.
- **A journey step with no body builder here (35)** — verify_otp, create_page_responses (tech answer),
  PATCH template_responses (tech submit), evaluations, proposal submit, counter offer. `bodies.ts` has
  builders for several (buildTechnicalAnswerBody, buildSubmitTechnicalResponse, buildCounterOfferBody,
  buildAwardSubmitBody) — each needs runner plumbing (form pages / approval flow uuids).
- **The case names a request without its body (≈25)** — "with a valid lot weight body" where the happy
  path body lives in another case the words do not name; the empty-body rule refuses to invent one.
- **Reads/screens/exports an API plan cannot see (≈40)** — reference numbers of rounds, weights
  shown, PDF/report, dashboard config, screen-only checks.
- **Partial that does not speak (122)**: 39 library cases whose expected result documents a refusal while
  the case records today's non-crashing behaviour ("should be 422") — honest; 12 "needs a caller who is
  not a super admin"; 13 library cases needing `{{evalFormUuid}}`; 9 whose outcome still contradicts the
  words after a repair; ~10 substitute plans the model admitted to; the rest edges (no read-back on a
  record with no sampled shape, screen parts).

### Caveats for the run on UAT

- `request`-op plans send the body the CASE wrote (as the API library does); where the case's body was a
  paraphrase the run will show a refusal on our side, not a product bug — treat a 422 "Insufficient
  parameters" on a `request` step as suspect before reporting.
- `autoVerify` read-backs assume `bid_count` counts submitted (and surrogate) bids and `stages` lists the
  event's rounds; both come from real replies (READ_SHAPES) but the counts were not run tonight.
- The worktree has an untracked `procol-backend` symlink (for en-IN.yml messages); not committed.

### Files changed (branch night/api-vocab)

- `prototype/src/agents/apiPlanner.ts`, `prototype/src/checks/apiPlanRunner.ts`
- `prototype/scripts/compile-api-plans.ts` (--revalidate rewritten), `compile-api-plans-all.ts`,
  `compile-api-plans-stats.ts`, `compile-api-plans-smoke.ts`, `apiplanner-unit-tests.ts`
- `prototype/data/compiled-plans/api/**` (1,379 per-case files + index.json)
- `prototype/data/night/api-vocab.md`, `final-stats.txt`, `final-by-group.txt`, `final-none-by-group.md`
