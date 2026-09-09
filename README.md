# Procol Autonomous QA Platform

An AI system that conducts a QA investigation against Procol: it decides what to test, drives the
real product in a browser, judges the evidence, and remembers what it found.

> **This repository must stay private.** `procol-ui-tests/src/config.ts` carries sandbox credentials
> as defaults (buyer phone, OTP, vendor email, internal `*.ag-ri.in` hostnames), and
> `prototype/knowledge/` holds mined API contracts and defect history. Procol's own source
> (`procol-backend/`, `procol-client-dashboard/`) is deliberately git-ignored and is **not** part of
> this project.

## The three pieces

| Directory | What it is |
|---|---|
| `prototype/` | The platform: LangGraph agent orchestration, the two-tier QA memory (RAG), the Oracle, the dashboard. |
| `procol-ui-tests/` | Playwright browser automation — the journeys the platform actually runs, plus the execution-layer Oracle that records evidence and issues verdicts. |
| `procol test/` | Playwright API automation — the same idea at the HTTP layer. |

`prototype` spawns `procol-ui-tests` as a child process, so **keep the three directories siblings**
exactly as they are checked out. Relative paths (`../procol-ui-tests`) depend on it.

## How it fits together

```
you type an instruction
        │
        ▼
  Interpreter ── picks a journey from the real catalog + its parameters
        │           (never invents one; says so when nothing covers your ask)
        ▼
   QA memory ── what SHOULD happen here · what HAS broken here before
        │
        ▼
   Playwright ── drives the live console deterministically
        │
        ▼
     Oracle ── product defect? test gap? harness? environment?
        │        deterministic — from HTTP codes, the app's own messages,
        │        the final URL. An LLM never decides pass/fail.
        ▼
    Findings ── grouped by defect, with evidence and reproduction
```

## First-time setup

```bash
# 1 · install
cd prototype && npm install
cd ../procol-ui-tests && npm install && npx playwright install chromium
cd "../procol test" && npm install

# 2 · configure (ask a teammate for the values — never commit these)
cp prototype/.env.example prototype/.env
cp procol-ui-tests/.env.example procol-ui-tests/.env
cp "procol test/.env.example" "procol test/.env"

# 3 · build the QA memory (embeds the knowledge base locally, ~10s)
cd prototype && npm run rag:build

# 4 · run the dashboard
npm run serve      # then open http://localhost:4300
```

`GROQ_API_KEY` in `prototype/.env` turns on the LLM. Without it the platform still runs end to end —
routing falls back to keyword matching and agent narration is templated — so nothing hard-fails in a
demo.

## Running things

```bash
# One browser journey, watching it happen
cd procol-ui-tests
UI_LINE_ITEMS=3 UI_QUIET_MAP=1 npx playwright test tests/ui-master.spec.ts -g "events\.rfq_only" --workers=1 --headed --reporter=line

# The whole events module (11 journeys, ~25 min)
UI_LINE_ITEMS=2 UI_QUIET_MAP=1 npx playwright test tests/ui-master.spec.ts -g "events\." --workers=1 --reporter=line
```

Run-time parameters (all optional): `UI_LINE_ITEMS`, `UI_BOQ_ITEMS`, `UI_TEMPLATE`,
`UI_SCHEDULE_MINUTES`, `UI_AI_HEAL=1`, `ACTIVE_CLIENT`, `COMPANY_ID`, `QA_RUN_ID`.

## Adding a new journey step (the pattern)

Every step a journey can vary is a parameter, so the AI can drive it without new plumbing. Four
edits, always the same four:

1. a reader in `procol-ui-tests/src/master/params.ts`
2. the step itself on the page object (`src/pages/CreateEventPage.ts`)
3. a field on `UiRunOptions` in `prototype/src/ui/uiFlowRunner.ts`, passed through as an env var
4. a field on `UiIntent` in `prototype/src/agents/uiIntent.ts` so an instruction can set it

`UI_TEMPLATE` and `UI_SCHEDULE_MINUTES` are worked examples of exactly this.

## Working together

Two rules keep this pleasant:

- **Never commit a `.env`, `.auth/`, or anything under `findings/`.** `.gitignore` covers them; don't
  force past it. If you need to share a value, share it out of band.
- **Never add `procol-backend/` or `procol-client-dashboard/`.** They are company repositories that
  happen to live in the same folder for reference. `git add -A` will not pick them up — keep it that
  way.

Branch, then open a PR:

```bash
git checkout -b your-name/what-you-are-doing
git add -A && git commit -m "what changed"
git push -u origin your-name/what-you-are-doing
```

Both TypeScript projects must typecheck before you push:

```bash
cd prototype && npx tsc --noEmit && cd ../procol-ui-tests && npx tsc --noEmit
```

## Known blocker in the environment

Every eRFX event save and publish currently fails with
`PATCH /api/event_groups/:id → 500 Internal Server Error`, for both `status: "draft"` and
`status: "active"`. It is a regression: the same automation published successfully at 07:49 on
2026-09-08 and has failed since ~16:29 that day. Non-eRFX single-stage creation still works.

The write-up, with the ranked causes and what would confirm each, is in
[`prototype/knowledge/events/regression-event-group-update-500.md`](prototype/knowledge/events/regression-event-group-update-500.md).
So the seven eRFX journeys reach publish and stop there — that is the product failing, not the
automation, and the Oracle labels it as such.
