# Continue Here — spine.ai (the Procol autonomous-QA platform) — handoff for the next chat

Paste the **Continuation Prompt** below into a new Claude Code chat to resume. Your
memory (MEMORY.md + the `procol-qa-platform-build` memory file) auto-loads too.

---

## ▶ CONTINUATION PROMPT (copy–paste this)

> Continue building the Procol autonomous-QA hackathon prototype in
> `/Users/animesh/Desktop/procol/prototype/`. FIRST read your memory (MEMORY.md +
> the `procol-qa-platform-build` memory file), plus `prototype/CONTINUE-HERE.md`
> and `prototype/blockers.md`.
>
> **What's built & working** (live vs UAT `sec-api-v1.ag-ri.in`, ₹0, Groq
> `openai/gpt-oss-120b`; key already in `prototype/.env`):
> catalog + settings; config-driven capability map; a 7-agent LangGraph
> orchestrator with real RAG (Transformers.js + local store); detailed LLM
> test-case generation (Procol house style); a field-aware **API check engine**
> (7 flow suites) that fires real requests → live pass/fail + a bug report
> (finds real 5xx + validation gaps); a **Direct-Flows control panel** (▶ run /
> 🧪 checks per flow, Run-all); per-check **re-run**; **run history + replay**;
> a **PR-reader** (`npm run pr -- backend 15221` → reads a PR diff from LOCAL git,
> read-only, → grounded test plan); **vendor-entity-mapping** API automation
> (`npm run multi-entity -- 56777`, 6/6 green on Ashoka); a **headed-Chromium UI
> automation** (`🖥 Watch UI test`, OTP login + Create-User form validation, with
> a background popup-watcher).
>
> **Active task: the MULTI-COMPANY-USER SWITCHER feature** (one user in ≥2
> companies → dropdown → per-company permissions/config/data; branch
> `feat/multi-company-user-switcher`, flag `enable_multi_company_user_onboarding`).
> The API harness is BUILT + verified: `src/flows/multiCompanyChecks.ts`,
> `npm run multi-company`. It DB-logs in on our envs OR uses a pasted token, and
> config-gate-SKIPs if the feature isn't on the target env.
>
> **BLOCKER:** the branch is NOT deployed on `sec-api` (cpanel/UAT) — verified
> (the unconditional `is_multi_company_user` field is absent). It's on preview
> deploys (sandbox `procol-sandbox-demo-rfx-qa.ag-ri.in`, which has its OWN DB we
> don't have). To run the REAL multi-company checks we need ONE of: (a) the
> preview's `DATABASE_URL`; (b) a `procol_access_token` from a user onboarded to
> 2+ companies on the preview; or (c) the feature merged to sec-api (then
> `npm run multi-company -- https://sec-api.ag-ri.in/api 16297` runs it
> automatically — we have that DB + real multi-co users).
>
> **NEXT STEPS:** (1) check **console.ag-ri.in** (admin console for ALL client
> config) — enable/verify configs and ONBOARD a user to a 2nd company to make a
> multi-company test user; (2) get preview DB URL or a multi-co token → run
> `npm run multi-company`; (3) build the **Stagehand** UI switcher test (inject
> the token into the preview frontend → drive the dropdown A↔B + verify
> per-company view). Also pending: wire multi-entity/multi-company into the UI
> control panel; add more flow suites.
>
> **Working style:** I'm a beginner — simple language, a short walkthrough before
> big builds then wait for my OK, verify things live yourself (don't ask me to
> check). ABSOLUTE: never disturb Procol's live code / config / DB — read-only
> only (the framework's designed `API_Test_`/`QA_Platform_` sandbox record
> creation is fine).

---

## Key commands (run from `prototype/`)
| Command | What |
|---|---|
| `npm run serve` | The web UI at http://localhost:4300 (agents, control panel, UI test, history) |
| `npm run orchestrate -- "request" 198678` | Full 7-agent pipeline in the terminal |
| `npm run pr -- backend 15221` | PR-reader → test plan from a PR diff (read-only git) |
| `npm run multi-entity -- 56777` | Vendor-entity-mapping API checks (Ashoka) |
| `npm run multi-company [-- baseUrl userId]` | Multi-company switcher checks (needs the feature's env) |
| `npm run rag:build` / `rag:query "…"` | Rebuild / query the RAG knowledge base |
| `npm run typecheck` | TypeScript check |

## Environments & auth (the "any URL" model)
- Each env needs its own auth: **its DB URL** (→ no-OTP DB-login, what we have for UAT) **or a login/token**.
- **UAT** `sec-api-v1.ag-ri.in` — DB `agribid-uat-latest` (`DATABASE_URL` in `procol test/.env`). Fully automated.
- **cpanel** `cpanel.ag-ri.in` → backend **`sec-api.ag-ri.in`** (same DB) — fully automated too.
- **Sandbox preview** `procol-sandbox-demo-rfx-qa.ag-ri.in` — has the multi-company branch, but its **own DB** (we lack it). Needs its DB URL or a token.

## Multi-company test users (real, in our DB, for when the feature lands on sec-api)
16297 → [32215 Barmati (flag ON), 32216] · 16223 → [32071 Indospace (ON), 32072] · 16509 → [32215, 32713]. All have fresh console sessions.

## The feature flags (read-only from the DB; do NOT flip on live envs)
- `is_vendor_entity_mapping_enabled` → 1 client (Ashoka 56777) — vendor-entity mapping (PR #15221), tested green.
- `enable_multi_company_user_onboarding` → 7 clients (Indospace 32071, Barmati 32215, Bajaj 40493, GMMCO 47053, Indospace. 65415, Saint Gobain 68628/68630) — the multi-company switcher.

## Where things live
`config/settings.ts` · `data/{catalog.json,vector-store.json,runs/}` · `knowledge/*.md` (RAG + feature docs incl. multi-entity + multi-company) · `src/{executor,server,runStore}.ts` · `src/rag/*` · `src/ai/*` · `src/agents/*` · `src/checks/*` (engine+suites) · `src/flows/{multiEntityChecks,multiCompanyChecks,validationRunner}.ts` · `src/pr/prReader.ts` · `src/ui/browserRunner.ts` (headed) · `public/*` (UI) · `scripts/*` (diagnostics) · `blockers.md`.
