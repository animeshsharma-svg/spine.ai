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
