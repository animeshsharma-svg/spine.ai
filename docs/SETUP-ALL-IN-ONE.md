# spine.ai — complete setup for a new tester (all in one)

Written 20 Nov 2026 for setting the platform up on one person's Mac and account. Everything is merged on the
team trunk **`demo`**. Follow the sections in order; plan about an hour, most of it installs.

**The values for the `.env` files are not in this document.** They come separately, through a password manager
(1Password / Bitwarden shared note). Never paste them into Slack, WhatsApp, email, git, or a chat with an AI.

---

## 1. What this is

spine.ai is Procol's QA platform. It tests Procol's **UAT** environment the way a careful tester would:

- it builds real test events on UAT;
- it bids with Procol's own QA test vendors;
- it drives the screens in a browser;
- it decides pass or fail with fixed rules;
- it writes every result as a plain-language test case, with screenshots and a bug sheet.

Once set up, the tester can:

- type a test case or a flow on **Home** and watch it run (API mode or Browser mode);
- upload a test-case sheet or a PRD on Home → cases → run → test report + bug sheet (Excel);
- run whole 13-column test sheets on **Sheets**, and see verified bugs on **Bugs**;
- run the bidding scenarios, the template field checks, and the screen ↔ API cross-check.

---

## 2. Accounts and access — get these first

| # | What | Who gives it | Notes |
|---|---|---|---|
| 1 | GitHub collaborator on **`animeshsharma-svg/spine.ai`** | Animesh (repo owner) | The team repo. Accept the invite from email or github.com/notifications. **This repo is PUBLIC** — never commit anything secret. |
| 2 | Read access to **`Procol-Tech/procol-backend`** and **`Procol-Tech/procol-client-dashboard`** | Procol GitHub admin | Read-only reference; nothing is ever pushed to them. `procol-backend` is **required**. |
| 3 | **Pritunl VPN** profile for Procol | Procol IT / DevOps | Needed only to reach Procol's UAT **database** (read-only). The UAT website and API work without it. |
| 4 | The three **`.env` files** (values) | Animesh, through a password manager | See §7 for the exact list of names. |
| 5 | (Optional) **Claude Code** on the tester's own Anthropic account | The tester | See §12. |

The private mirror `animeshsharmaa208/procol-qa-platform` is Animesh's personal copy. A new tester does **not** need it.

---

## 3. Repository details

| | |
|---|---|
| Team repository | https://github.com/animeshsharma-svg/spine.ai (public) |
| Trunk branch | **`demo`** — everything merged here. `main` is old (4 Oct) — do not use it. |
| Trunk commit on 20 Nov 2026 | `6b53a180` "Stand-up 20 Nov: invites both ways, deep generation measured, A12 eval" |
| Personal branches | `aanya` (Aanya), `rca-wt` (Animesh; kept equal to `demo`). A new tester makes their own (§13). |
| Procol backend | https://github.com/Procol-Tech/procol-backend (read-only) |
| Procol buyer dashboard | https://github.com/Procol-Tech/procol-client-dashboard (read-only) |

### Folder layout (must be exactly this)

```
~/Desktop/procol/                 ← the spine.ai clone (branch demo)
├── prototype/                    ← the platform: server + dashboard (port 4300)
├── procol test/                  ← API test framework (note the SPACE in the name)
├── procol-ui-tests/              ← Playwright browser automation
├── test-cases/                   ← the written test cases (source of truth) + Python sheet builders
├── docs/                         ← guides (this file, TESTER_GUIDE.md, TEST-SHEETS.md, LESSONS.md …)
├── procol-backend/               ← Procol's backend, cloned INSIDE (git-ignored, read-only)
└── procol-client-dashboard/      ← Procol's dashboard, cloned INSIDE (git-ignored, read-only)
```

`prototype`, `procol test` and `procol-ui-tests` must stay side by side. The platform imports `procol test` and
starts `procol-ui-tests` by relative path. `procol-backend` must be inside the folder: before every API call the
platform reads `procol-backend/config/app_auth_config.yml`. That check stops a call from the wrong app, which would
sign the UAT buyer out.

---

## 4. Install the tools (macOS)

Run these in **Terminal** one by one. Check each with the command on the right.

| Tool | Install | Check |
|---|---|---|
| Homebrew | see https://brew.sh (one-line installer) | `brew -v` |
| Git | `brew install git` | `git --version` |
| Node **24** | `brew install node@24` then follow the "add to PATH" line it prints | `node -v` → v24.x |
| Python 3 + packages | `brew install python` then `pip3 install openpyxl pillow` | `python3 -c "import openpyxl, PIL"` |
| PostgreSQL 17 + pgvector | `brew install postgresql@17 pgvector` then `brew services start postgresql@17` | `/opt/homebrew/opt/postgresql@17/bin/psql --version` |
| Google Chrome | normal download | — |
| Pritunl client | https://client.pritunl.com, then import the profile from IT | connect once (§8) |

Python is used by the test-case builders and the bug-sheet / report generators in `test-cases/`.

---

## 5. Get the code

```bash
cd ~/Desktop
git clone -b demo https://github.com/animeshsharma-svg/spine.ai.git procol
cd procol
git clone https://github.com/Procol-Tech/procol-backend.git
git clone https://github.com/Procol-Tech/procol-client-dashboard.git
```

GitHub asks for a username and a **personal access token**, not your password. Create the token at
github.com → Settings → Developer settings → Personal access tokens, with `repo` scope. When you paste it at the
password prompt nothing shows; that's normal. Never paste the token anywhere else.

---

## 6. Install the packages

```bash
cd ~/Desktop/procol/prototype        && npm install
cd ~/Desktop/procol/"procol test"    && npm install
cd ~/Desktop/procol/procol-ui-tests  && npm install && npx playwright install chromium
```

Keep the quotes around `"procol test"`.

---

## 7. The three `.env` files

Each file is literally named `.env` and goes exactly where shown. Start from the example file next to it:

```bash
cd ~/Desktop/procol
cp prototype/.env.example prototype/.env
cp "procol test/.env.example" "procol test/.env"
cp procol-ui-tests/.env.example procol-ui-tests/.env
```

Then fill in the values from the password manager. The blocks below show the variables the team actually uses in
each file. The example files also list optional overrides, commented out, with notes on where each key comes from.
Lines marked *optional* can stay empty.

### 7a. `~/Desktop/procol/prototype/.env`

```bash
# AI gateway (planner, memory, case writing) — REQUIRED for the AI parts
SLINGRING_API_KEY=
# Fallback AI providers — optional (used when Slingring is down or over budget)
GROQ_API_KEY=
GOOGLE_API_KEY=
# spine.ai's own database (§9) — optional; without it the platform uses files
SPINE_DB_URL=postgres://localhost:5432/spine
# rfx-qa sandbox (preview build) — optional, only for sandbox runs
SANDBOX_APP_KEY=
SANDBOX_APP_SECRET=
SANDBOX_APP_VERSION=
SANDBOX_USER_ID=
SANDBOX_ACCESS_TOKEN=
# Vendor-revalidation write cases — optional
VR_QA_TOKEN=
```

### 7b. `~/Desktop/procol/procol test/.env`

```bash
ACTIVE_CLIENT=clientA

# UAT API + app keys
CLIENTA_BASE_URL=            # the UAT API base (https://sec-api-v1.ag-ri.in/…)
CLIENTA_APP_KEY=
CLIENTA_APP_SECRET=
APP_VERSION=

# Test buyer (phone login) and test vendor (email login)
CLIENTA_BUYER_PHONE=
CLIENTA_BUYER_PHONE_PREFIX=
CLIENTA_VENDOR_EMAIL=        # a qa_…@example.com QA vendor
CLIENTA_OTP=                 # UAT sign-in code (otherwise looked up by company)
CLIENTA_COMPANY_UUID=
CLIENTA_TEMPLATE_UUID=

# Client B — unused placeholders, leave empty
CLIENTB_BASE_URL=
CLIENTB_APP_KEY=
CLIENTB_APP_SECRET=
CLIENTB_BUYER_PHONE=
CLIENTB_BUYER_PHONE_PREFIX=
CLIENTB_VENDOR_EMAIL=
CLIENTB_OTP=
CLIENTB_COMPANY_UUID=
CLIENTB_TEMPLATE_UUID=

# Procol UAT database — READ-ONLY (SELECT only); reachable only on the VPN (§8)
DATABASE_URL=
# rfxdev sandbox sign-in code — optional
RFXDEV_OTP=
```

### 7c. `~/Desktop/procol/procol-ui-tests/.env`

```bash
ACTIVE_CLIENT=clientA
DATABASE_URL=                # same read-only UAT database URL as above
CLIENTA_OTP=                 # buyer sign-in code
CLIENTA_VENDOR_OTP=          # vendor sign-in code
```

### Checklist of values to send

Send these to the tester through the password manager:

- `SLINGRING_API_KEY`;
- optionally `GROQ_API_KEY` and `GOOGLE_API_KEY`;
- `CLIENTA_BASE_URL`, `CLIENTA_APP_KEY`, `CLIENTA_APP_SECRET`, `APP_VERSION`;
- `CLIENTA_BUYER_PHONE`, `CLIENTA_BUYER_PHONE_PREFIX`, `CLIENTA_VENDOR_EMAIL`;
- `CLIENTA_OTP`, `CLIENTA_VENDOR_OTP`;
- `CLIENTA_COMPANY_UUID`, `CLIENTA_TEMPLATE_UUID`;
- `DATABASE_URL` (read-only user);
- optionally the `SANDBOX_*` values and `VR_QA_TOKEN`.

Never commit a `.env`. `.gitignore` already blocks them; never force-add one.

---

## 8. VPN (only for Procol's database)

1. Open Pritunl and connect the Procol profile.
2. Check it works:

```bash
cd ~/Desktop/procol
DBHOST=$(grep -oE '@[^:/]+' "procol test/.env" | head -1 | tr -d @)
nc -z -G 5 "$DBHOST" 5432 && echo "DB reachable" || echo "VPN not connected"
```

(The database host is read from your own `.env`, so it never has to be written anywhere else.)

- **Without the VPN:** the UAT website, the vendor portal, the API and the dashboard all work. Steps that read
  Procol's database fail: cross-checks, read-backs, looking up sign-in codes, data checks.
- **If a run says "connect ETIMEDOUT <database host>:5432":** the VPN dropped. Reconnect it and re-run those cases.
  Don't count those cases as failures.

---

## 9. spine.ai's own database (recommended)

This database holds run history, memory and the product model. Without it the platform falls back to files.

```bash
/opt/homebrew/opt/postgresql@17/bin/createdb spine
cd ~/Desktop/procol/prototype
npm run db:migrate
```

`SPINE_DB_URL=postgres://localhost:5432/spine` must be in `prototype/.env` (§7a). It is also what lists the QA
vendors for the bidding scenarios: without it every scenario skips with "0 QA vendors".

---

## 10. Build the memory and start

```bash
cd ~/Desktop/procol/prototype
npm run rag:build      # once now, and again after pulling new test cases (2–5 min)
npm run serve          # dashboard → http://localhost:4300
```

Open http://localhost:4300 and leave the terminal running. To use another port, start it with `PORT=4310 npm run serve`.

For Claude Code's browser preview, use only the **`spine-dashboard`** entry in `.claude/launch.json`. The other
entries point to folders on Animesh's Mac.

---

## 11. Environments and logins used in testing

| What | Where |
|---|---|
| Buyer console (UAT) | https://cpanel.ag-ri.in — login by phone + one-time code |
| Vendor portal (UAT) | https://vendor-app.ag-ri.in — login by email + one-time code |
| UAT API | https://sec-api-v1.ag-ri.in/api |
| Main test client | **PROCOL DEMO** (company 198678) — all test events go here |
| Second client | Demo Account 2 (company 32461) — used read-only and for cross-company checks |
| Test vendors | QA_Platform Vendor 1–4 (`qa_…@example.com`) — the ONLY vendors a run may invite or sign in as |
| Sandbox (optional) | rfx-qa preview build (own backend/database; URLs and code sent with the env) |

The codes come from the `.env` files, or the platform looks them up from Procol's database (VPN needed).
Never print, screenshot or share a code.

---

## 12. Claude Code (optional, on the tester's own account)

1. Install it: https://claude.com/claude-code (the desktop app, or `npm install -g @anthropic-ai/claude-code`), and
   sign in with the tester's own account.
2. Open the folder `~/Desktop/procol`.
3. The repo brings a QA skill: `.claude/skills/procol-qa/` (understand → write cases → build automation → execute).
   Ask for it by name, e.g. "use the procol-qa skill to write cases for …".
4. Claude's memory from Animesh's machine is **not** transferred. The team knowledge is in the docs:
   - `docs/LESSONS.md`
   - `docs/TESTER_GUIDE.md`
   - `docs/TEST-SHEETS.md`
   - `docs/ONE-BRANCH-PLAN-2026-11-18.md`
   - `docs/SCREENS.md`
   - `docs/phase3-bidding-matrix.md`

   Point Claude at them at the start.
5. `procol-backend/CLAUDE.md` (feature-planning, "caveman" replies) is for backend developers. It does not apply
   to QA work.

---

## 13. First run — check everything works (10 minutes)

1. **Home** → client **PROCOL DEMO · UAT**, mode **API**. Type
   `create an RFQ with 2 line items and publish it` → Start. It should build an event and finish with green steps.
2. Same in mode **Browser**: a Chrome window opens and drives the screens. The session view shows each step.
3. **Sheets** (`#/sheets`): open a sheet, run one case, and download the results Excel.
4. **Bugs** lists the verified bugs. **Sessions** shows your runs.
5. Terminal check:

   ```bash
   cd ~/Desktop/procol/prototype && npm run ci:check
   ```

   This runs the same checks CI runs: types, catalog, schemas, unit tests, and no secrets.

| If you see | Fix |
|---|---|
| "not sent" on API steps | `procol-backend` is missing or not inside `~/Desktop/procol` (§5) |
| "can't sign in" / 401 | a value in `procol test/.env` is missing or wrong |
| Planner says "no model" or falls back | `SLINGRING_API_KEY` missing, or the gateway budget is used up (Groq takes over; big prompts may fail) |
| `ETIMEDOUT <database host>:5432` | VPN not connected (§8) |
| Bidding scenarios "0 QA vendors" | `SPINE_DB_URL` not set (§9) |
| Port 4300 in use | another server is running: `lsof -i :4300`, stop that terminal, or use `PORT=…` |
| `npx tsc` says 0 errors from the repo root | run it INSIDE prototype: `cd prototype && npx tsc --noEmit -p .` |

---

## 14. Everyday commands

```bash
cd ~/Desktop/procol/prototype
npm run serve                                        # dashboard (4300)
npm run matrix -- --company 198678 --combos M1,M5    # bidding scenarios with QA vendors
npm run template:check -- --c 198678 --type rfq      # field tests for a client's template
npm run model:build -- --c 198678                    # refresh a client's product model
npm run cases:import                                 # after editing test-cases/*.md
npm run rag:build                                    # after new test cases
npm run coverage:report                              # what can run, what to build next
npm run ci:check                                     # before every push
```

Dashboard pages:

- `#/home`: type or upload; the sheet/PRD upload is here.
- `#/sessions`
- `#/sheets`
- `#/run-tests`
- `#/bugs`
- `#/screens`
- `#/prd`
- `#/matrix`
- `#/crosscheck`
- `#/journeys`
- `#/stuck`: steps the automation still needs.

---

## 15. Git workflow for the tester

```bash
cd ~/Desktop/procol
git checkout -b <your-name> origin/demo     # your own branch, from the trunk
# …work…
cd prototype && npm run ci:check && cd ..
git add <file> <file>                       # stage files BY NAME — never `git add -A` / `git add .`
git diff --cached --name-only               # check: no .xlsx, .env, .auth, data/runs|sessions|sheets|hubspot|prd
git commit -m "what changed, in one line"
git push -u origin <your-name>              # then open a pull request into demo
```

Every morning:

```bash
git pull origin demo
```

Then run `npm install` in any folder whose `package.json` changed, and `npm run rag:build` if test cases changed.

Never push to `main`. Never force-push `demo`.

### What git does NOT carry (per-machine)

- Run history: `prototype/data/runs`, `sessions`, `sheets`, `run-cases`, `hubspot`, `prd`
- Browser logins: `.auth/`
- Screenshots and findings
- The memory index: `vector-store.json` (rebuilt by `rag:build`)

A fresh setup starts with these empty, which is fine. If the tester needs Animesh's past runs or sheets, copy those
folders by hand. Never commit them.

---

## 16. Rules everyone follows (non-negotiable)

- **UAT and sandbox only.** Test events go on **PROCOL DEMO (198678)**. Names start `QA_Platform_…` /
  `API_Test_…` / `spine-…`.
- **QA test vendors only** (`qa_…@example.com`). Never set `SPINE_ALLOW_REAL_VENDORS`. Never click
  "Invite Vendor — invite N more" in a run.
- **Procol's database is read-only** — SELECT only.
- **`procol-backend` and `procol-client-dashboard` are never edited.**
- Don't change a client's company settings, templates, workflows, teams or users you didn't create. If a test
  needs a setting switched, ask first and switch it back afterwards.
- Never act as another real user. Never message real approvers or vendors without asking first.
- Never commit `.env`, `.auth/`, `findings/`, run outputs or Excel files. **The repo is public.**
- Never share codes, tokens or passwords — not in chat, screenshots, bug sheets or AI prompts.
- Don't expose `localhost:4300` to the internet (no ngrok etc.) — it holds a signed-in UAT session.
- Don't run broad `pkill` commands (e.g. `pkill -f chrome`): they stop every running server and browser.

---

## 17. Who to ask

- **Access to spine.ai, the `.env` values, past run data:** Animesh.
- **Procol GitHub access, VPN profile:** Procol IT / DevOps.
- **Branch / merge questions:** read `docs/ONE-BRANCH-PLAN-2026-11-18.md` first.
