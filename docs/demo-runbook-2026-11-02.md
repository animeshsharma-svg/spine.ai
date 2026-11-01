# Demo runbook — 2 November 2026 (morning after the night build)

What runs where, what to say, and what to do when something stalls. Written for the person at the
keyboard; every fact below was checked tonight on the `demo` branch.

## Start

```bash
cd /private/tmp/claude-501/-Users-animesh-Desktop-procol/2b2263d4-5da5-4f4e-9ad5-f87e1cb87aec/scratchpad/integ/prototype && PORT=4320 ./node_modules/.bin/tsx src/server.ts
```

- Open http://localhost:4320 → Sign in with a Procol work email (no password: it only names who runs).
- The demo checkout's credentials are links to the main checkout's files (`procol-ui-tests/.env`,
  `procol-ui-tests/.auth`, `procol test/.env`) — git-ignored, never committed.
- Plain `tsx`, not `tsx watch`: a watching server restarts on any file write and kills a running test.
- Client PROCOL DEMO (198678) · UAT. Settings are switched only there and switched back.

## The AI behind the compile

Slingring's budget is **exhausted** (250 / 250 since 31 Oct). Until it is raised the compiler answers
through Groq (rate-limited, and too small for the prepared-case prompt) and then **Gemini** (free tier).
Compiles take 5–20 s and work; a typed case already compiled once is reused from the cache for a week.
If a compile says "the model could not be reached", wait a minute and run it again — that is the free
tier's rate limit, not a broken platform.

Slingring embeddings (the matcher) are off for the same reason; the local embedder is in use, so matching
a typed case to the catalog still works.

## What to show

1. **Run tests** (`#/run-tests`): pick PROCOL DEMO, tick a feature, Run. Every case shows how it runs
   and how much a green says (exact / compile / none). Numbers: 7,881 cases, 2,500 run today.
2. **Type a case** on Run tests → it plans the steps (draft in a second, compiled plan in ~15 s) and runs
   them in a real Chrome you watch, with a framed photo per action (the spotlight).
   Safe demo cases (each ≈ 4–6 min live on UAT):
   - "Create an RFQ with 2 line items, invite the vendor and publish it" — the core create flow.
   - "Create an RFQ, publish it, then as the vendor open it in the supplier portal and check the line
     items and quantities are shown" — NEW tonight: the second browser signs in as the QA vendor.
   - "Open the events list, switch to History and open the first closed event" — NEW `open_first_event`.
   - "On a published RFQ with a bid, open Master QCS and check the vendor's rank" — API builds the state.
3. **Bugs** (`#/bugs`): every product defect with its reproduction; sheet-run bugs and explored bugs.
4. **Screens** (`#/screens`): the photographed screen library and the walks.
5. **Sheets** (`#/sheets`): the 13-column test sheets, run one or many, results with screenshots.

## New tonight (say it as "the vocabulary grew")

- 129 → 131 steps. `switch_portal` (buyer ↔ supplier portal, a second browser signed in as the event's
  QA vendor, streamed and photographed), `vendor_open_event` (the event in the vendor's list, its bid sheet
  or overview), `open_first_event` (first card under Live / History / Drafts). After `switch_portal` every
  generic step — click, fill, expect_text, expect_count — acts on the vendor's screen.
- The supplier portal is a SCREEN in the model: UI-VBID cases (29 of 32) compile and run; the plan creates
  and publishes the event in the console first (an API-built event never reaches the vendor's list).
- A "converted" start state: the API converts a bid RFQ into a live auction and the vendor bids in it.
- The 97 UI cases every claim of which is API-observable now route to the API test compiler; their plans
  were compiled tonight (see `bench/night/api-decided-compile.log` for how many came out full).
- The bench executor fixes from 31 Oct (hydration guard etc.) are in the same branch.

## If it stalls

- **A run never starts its browser**: one browser slot per machine. `pgrep -f run-ui-cases` / `pgrep -f
  "tsx src/server.ts"`; a finished run that still streams frames holds the slot — kill it.
- **The vendor cannot see the event**: the plan must publish it first; the lint adds the create steps in
  front of `switch_portal`. "NOT INVITED after 132s" means the event was built by API, not published in the
  console.
- **"Request too large" from Groq**: expected; the next provider answers.
- **Everything slow**: another spine server (port 4300, the other session's campaign) can hold half a core.
  Stop it before the demo if it is not needed.

## What is NOT there (do not promise)

- Purchase-request / PO / GRN / invoice screens in the browser (22 cases): not in the screen model.
- Permissions / second company / load (15 cases): no accounts for them.
- Withdrawn, amended, dutch/knockout start states (17 cases): the API builder does not make them yet.
- 154 UI cases the catalog itself marks "for a person".
