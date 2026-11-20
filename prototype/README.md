# spine.ai — autonomous QA for Procol

An AI platform that **plans, runs, and reports** software tests for Procol by
itself. Pick a client, type a request in plain English, and a team of 7 AI
agents reads the product, designs tests, runs the **real** flows against UAT,
verifies them in the database, and writes a report that catches real bugs.

Built on top of the existing `procol test/` framework (17 config-gated flows,
no-OTP DB login, database-as-oracle). Runs for **₹0** — no paid API required.

## Run it

First-time setup (accounts, `.env` files, VPN, database): [`../docs/SETUP-ALL-IN-ONE.md`](../docs/SETUP-ALL-IN-ONE.md).

```bash
cd prototype
npm install
cp .env.example .env # then fill it in — values come through a password manager
npm run serve        # → http://localhost:4300
```

Open the URL, keep **PROCOL DEMO (198678)**, and click **Run QA**.

> First run downloads a ~90MB embedding model once (for RAG). The AI runs in a
> deterministic fallback mode with no key; add a free Groq key to enable richer
> LLM narration (see below).

## What each command does

| Command | What it does |
|---|---|
| `npm run serve` | Start the web UI + streaming API (the demo). |
| `npm run orchestrate -- "your request" 198678` | Run the full 7-agent pipeline in the terminal. |
| `npm run run:flow <flowId> 198678` | Run one real flow and print a clean result. |
| `npm run run:flow -- --map 198678` | Print a client's capability map. |
| `npm run run:flow -- --validate 198678` | Run just the phone-field validation probe. |
| `npm run rag:build` | Build the RAG knowledge index. |
| `npm run rag:query "question"` | Ask the knowledge base a question. |
| `npm run check:catalog` | Verify the flow catalog matches the real registry. |
| `npm run typecheck` | TypeScript check. |

## Enable the LLM

1. Put the team's `SLINGRING_API_KEY` (Procol's AI gateway) in `prototype/.env` — it is the primary model and
   the memory's embedder. `GROQ_API_KEY` / `GOOGLE_API_KEY` are optional fallbacks.
2. Rebuild the memory (`npm run rag:build`) and restart `npm run serve`.

Without any key the platform runs in a deterministic fallback mode. Pass/fail never depends on the model.
Providers and models are set in `config/settings.ts` (section 4, AI provider).

## How it's built (the 6 layers)

1. **Procol under test** — UAT (`sec-api-v1.ag-ri.in`), read-only.
2. **Data & config** — the existing framework: DB session login + capability map.
3. **Flow catalog** — `data/catalog.json` (mirrors the registry).
4. **Executor** — `src/executor.ts`: runs a flow by id → structured result (the agents' tool).
5. **AI orchestrator** — `src/agents/`: 7 agents wired in a LangGraph state machine
   (analyst → planner → designer → data → critic ⟳ → executor → reporter), grounded
   by RAG (`src/rag/`).
6. **UI** — `src/server.ts` + `public/`: dropdowns, capability map, live agent
   reasoning, results, report.

See `blockers.md` for parked items and the roadmap.
