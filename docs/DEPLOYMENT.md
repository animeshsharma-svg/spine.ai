# Deploying spine.ai on a Google Cloud VM — requirements

For the engineer setting up the instance. Everything the platform needs, nothing it does not.
Written 21 October 2026 from the code as it runs on the developer's Mac today.

## 1. What runs

One Node.js process serves everything — the dashboard (static files), the HTTP/SSE API, and the
test runners — and spawns a headless Chromium (Playwright) when a browser test runs. There is no
separate frontend service and no build step: the UI is plain HTML/JS/CSS under `prototype/public`.

| Part | What it is | Where |
| --- | --- | --- |
| Dashboard + API | Node 24, TypeScript run with `tsx` (no compile step), port **4300** (`PORT` env) | `prototype/src/server.ts` |
| Browser tests | Playwright **Chromium**, headless, one at a time (an in-process slot) | `procol-ui-tests/` (spawned as `npx playwright test`) |
| API tests | plain HTTPS calls to Procol's UAT API | `procol test/`, `prototype/src/checks/*` |
| spine.ai's own database | **PostgreSQL 15+ with the `pgvector` extension** — runs, results, cases, memory vectors, evidence index | 22 migrations in `prototype/db/migrations` |
| Memory (RAG) | a vector store: Postgres+pgvector when `SPINE_DB_URL` is set, else a JSON file `prototype/data/vector-store.json` (~13,600 chunks) | `prototype/src/rag` |
| Models | Procol's Slingring gateway (primary), Groq and Google Gemini (fallbacks) — outbound HTTPS only | `prototype/src/ai/llm.ts` |

The three packages are three `npm install`s in one repo (`prototype/`, `procol-ui-tests/`,
`procol test/`); `prototype` imports the other two by relative path, so they must sit side by side.

## 2. The machine

| | Minimum | Comfortable |
| --- | --- | --- |
| Machine type | e2-standard-2 (2 vCPU, 8 GB) | **e2-standard-4 (4 vCPU, 16 GB)** — Chromium + the local embedding model + Postgres together |
| Boot disk | 50 GB SSD | **100 GB SSD** — evidence screenshots grow ~0.5–1 GB per heavy night; keep 30 days |
| OS | Ubuntu 22.04 or 24.04 LTS | same |
| Region | asia-south1 (Mumbai): the UAT it tests is in India and latency is in every run time | same |

The VM must stay **awake all the time** (nightly runs, long browser flows up to 48 minutes).

## 3. Software on the VM

```bash
# Node 24 (nodesource), git, build tools for native modules (pg, onnxruntime for the local embedder)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt-get install -y nodejs git build-essential
# Chromium's system libraries, installed by Playwright itself
cd procol-ui-tests && npx playwright install --with-deps chromium
# PostgreSQL 15+ with pgvector (either on the VM or Cloud SQL, see §4)
sudo apt-get install -y postgresql postgresql-contrib postgresql-15-pgvector
```

Then, per package: `npm ci` in `prototype/`, `procol-ui-tests/` and `procol test/`.
Start: `cd prototype && npm run serve` (dev) — for a server use `npx tsx src/server.ts` under systemd
(§7). First start applies the migrations; `npm run rag:build` builds the memory (10–15 min, needs
the embedding model or gateway).

## 4. Databases — two, with very different rules

1. **spine.ai's own Postgres** (`SPINE_DB_URL`): ours, read-write. Options: Postgres on the VM
   (simplest, fine for one team) or **Cloud SQL for PostgreSQL** with the `vector` extension enabled
   (managed backups). Size: a few GB. Daily backup wanted (results and the defect ledger live here).
2. **Procol's UAT database** (`DATABASE_URL` in `procol-ui-tests`): **read-only**. The platform only
   ever runs `SELECT` — it reads sessions, QA vendors, event rows to verify what the screen shows.
   The VM's egress IP must be allow-listed on that database (or it must be reachable over the
   company VPN), and the role used must be a read-only role. This is the one access the senior
   engineer has to arrange with whoever owns UAT.

## 5. Network

Outbound (HTTPS, 443) to:
- Procol UAT console and API (`cpanel.ag-ri.in`, `sec-api.ag-ri.in`, `sec-api-v1.ag-ri.in`, `quotes.ag-ri.in` — the supplier portal, `procol-sandbox-demo-rfx-qa.ag-ri.in`) — the system under test;
- the Slingring model gateway, `api.groq.com`, `generativelanguage.googleapis.com` — models;
- `github.com` (deploys), `huggingface.co` once (the local embedding model, ~90 MB) — optional;
- Procol's UAT Postgres (5432) — see §4.

Inbound: **nothing public.** Port 4300 is reached only through an authenticated front door:
- preferred: **Identity-Aware Proxy** in front of an HTTPS load balancer, allowing the `procol.in`
  Google Workspace domain; or
- a Cloudflare Tunnel + Cloudflare Access with the company's identity provider.
The dashboard's own sign-in is a name field, not authentication, so the front door is required.
Firewall: allow 22 (IAP TCP forwarding only) and the load balancer's health check; deny the rest.

## 6. Secrets and configuration (names only — values come from the owner)

Put them in **Secret Manager** and render them into the three `.env` files at deploy time; never
commit them. The platform reads `.env` files (dotenv), nothing else.

| File | Keys |
| --- | --- |
| `prototype/.env` | `SLINGRING_API_KEY`, `GROQ_API_KEY`, `GOOGLE_API_KEY`, `SPINE_DB_URL`, `PORT` (4300), `SLINGRING_FAST_TIMEOUT_MS` (45000 recommended on a server); optional `VR_QA_TOKEN`, `SANDBOX_*` (preview environment only) |
| `procol-ui-tests/.env` | `ACTIVE_CLIENT`, `DATABASE_URL` (Procol UAT, read-only), `COMPANY_ID` is passed per run |
| `procol test/.env` | per client: `CLIENTA_BASE_URL`, `CLIENTA_APP_KEY`, `CLIENTA_APP_SECRET`, `CLIENTA_BUYER_PHONE`, `CLIENTA_BUYER_PHONE_PREFIX`, `CLIENTA_VENDOR_EMAIL`, `CLIENTA_OTP`, `CLIENTA_COMPANY_UUID`, `CLIENTA_TEMPLATE_UUID` (same set as `CLIENTB_*`), `APP_VERSION` |

Rules the owner enforces: QA test vendors only (`SPINE_ALLOW_REAL_VENDORS` must stay unset), no
real customer data on the box, UAT only (never production URLs).

## 7. Running it as a service

```ini
# /etc/systemd/system/spine.service
[Unit]
Description=spine.ai QA platform
After=network-online.target postgresql.service
[Service]
User=spine
WorkingDirectory=/opt/spine/prototype
ExecStart=/usr/bin/npx tsx src/server.ts
Restart=always
Environment=NODE_ENV=production
# Playwright's browsers live under the service user's home
Environment=PLAYWRIGHT_BROWSERS_PATH=/opt/spine/.pw-browsers
[Install]
WantedBy=multi-user.target
```

Scheduled work (cron or systemd timers, same user): `npm run nightly` (the regression night, 3–6 h),
`npx tsx scripts/combo-night.ts` (the 22 event combinations, ~40 min), `npx tsx scripts/screen-walk.ts`
(refresh the screen library, ~40 min), `npm run rag:build` (memory, ~15 min). One browser at a time:
never schedule two browser jobs to overlap.

## 8. Storage and retention

| Path | What | Size today | Keep |
| --- | --- | --- | --- |
| `procol-ui-tests/evidence/` | screenshots, spotlight pictures, accessibility trees per run | 325 MB | 30 days (a cron `find -mtime +30 -delete`) |
| `prototype/data/` | runs, combos, screens library, memory file, rules | 382 MB | keep; `data/runs` and `data/combos` can be pruned at 90 days |
| Postgres | results, defects, cases, vectors | a few GB | backup daily |

Mount these on the persistent disk (they are inside the repo checkout; a `git pull` never touches
them because they are git-ignored). Optional: sync evidence to a GCS bucket with a lifecycle rule.

## 9. Deploying a new version

```bash
cd /opt/spine && git pull origin animesh
(cd prototype && npm ci) && (cd procol-ui-tests && npm ci) && (cd "procol test" && npm ci)
sudo systemctl restart spine
```
No build, no containers needed. (A Dockerfile is possible later — `mcr.microsoft.com/playwright:v1.62.1-jammy` as the base — but the VM route above is enough for one team.)

## 10. Monitoring

- `GET /api/screens` and the dashboard home as the health check; systemd restarts on crash.
- Logs: journald (`journalctl -u spine`); the platform prints one line per step and per model call (`[plan]`, `[llm]`), so Cloud Logging's agent on journald is enough.
- Watch: disk free (evidence), the model gateway's budget (a `429 ExceededBudget` makes compiles fall back to Gemini), Chromium zombie processes after a killed run (`pkill -f chromium` is safe when no run is going).

## 11. Cost (Mumbai, on-demand, rough)

e2-standard-4 ≈ $100/month (≈ $30 with a 1-year commitment or ≈ $35 as a spot/preemptible — not advised, runs are long); 100 GB SSD ≈ $17; Cloud SQL small instance ≈ $30–50 (or $0 with Postgres on the VM); load balancer + IAP ≈ $20; egress negligible. **≈ $120–190/month**, or ≈ $50 with Postgres on the VM and a committed-use discount.

## 12. Checklist for go-live

- [ ] VM up, Node 24, Playwright Chromium installed with deps
- [ ] Postgres with `vector` extension; `SPINE_DB_URL` works; migrations applied on first start
- [ ] Procol UAT DB: read-only role, VM IP allow-listed, `DATABASE_URL` works (`SELECT 1`)
- [ ] three `.env` files rendered from Secret Manager
- [ ] `npm run rag:build` completed once
- [ ] systemd service running; `curl localhost:4300/api/screens` answers
- [ ] IAP (or Cloudflare Access) in front; port 4300 not reachable from the internet
- [ ] evidence pruning cron; Postgres backup
- [ ] one browser run from the dashboard passes end to end (Screens → any case → Run with spotlight)
