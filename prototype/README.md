# spine.ai — autonomous QA for Procol

An AI platform that **plans, runs, and reports** software tests for Procol by
itself. Pick a client, type a request in plain English, and a team of 7 AI
agents reads the product, designs tests, runs the **real** flows against UAT,
verifies them in the database, and writes a report that catches real bugs.

Built on top of the existing `procol test/` framework (17 config-gated flows,
no-OTP DB login, database-as-oracle). Runs for **₹0** — no paid API required.

## Run it

```bash
cd prototype
npm install
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

## Enable the LLM (optional, free)

1. Get a free key at <https://console.groq.com>.
2. Create `prototype/.env` with: `GROQ_API_KEY=your_key_here`
3. Restart `npm run serve`. The provider badge turns green and the agents'
   reasoning becomes LLM-written. Decisions and results are already real either way.

Provider is one setting in `config/settings.ts` (`AI.provider`) — swap to Claude later.

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
