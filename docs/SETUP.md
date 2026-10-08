# Running spine.ai on your own Mac

This gets the dashboard (http://localhost:4300) running on your machine exactly as the team uses it:
type a case in Home, watch it run in the browser view, read results in Sessions, Defects and History.
About 30 minutes, most of it installs.

## 0. What you need first

| Need | How to get it |
|---|---|
| Access to `animeshsharma-svg/spine.ai` | Accept the GitHub collaborator invite (email, or github.com/notifications). |
| Access to `Procol-Tech/procol-backend` and `Procol-Tech/procol-client-dashboard` | Your Procol GitHub access. Read-only use; nothing is ever pushed to them. |
| Node 24 | `brew install node@24` (check with `node -v`). |
| The three `.env` files | From Animesh **through a password manager** (1Password / Bitwarden shared note) — never Slack, WhatsApp, email or git. |
| PostgreSQL 17 + pgvector | *Optional.* Without it the platform uses file fallbacks; with it you get run history and the product model in a database. |

## 1. Get the code

The daily branch is `animesh` — `main` is older.

```bash
cd ~/Desktop
git clone -b animesh https://github.com/animeshsharma-svg/spine.ai.git procol
cd procol

# Procol's own repos go INSIDE this folder (they are git-ignored here, never committed)
git clone https://github.com/Procol-Tech/procol-backend.git
git clone https://github.com/Procol-Tech/procol-client-dashboard.git
```

`procol-backend` is required: the request guard reads its `config/app_auth_config.yml` before every API
call (a call the buyer console may not make would sign the UAT buyer out). Without it, API journeys
report "not sent". `procol-client-dashboard` is used to rebuild the app-rule catalog and for PR reading.

## 2. Install

```bash
cd ~/Desktop/procol/prototype       && npm install
cd ~/Desktop/procol/"procol test"   && npm install
cd ~/Desktop/procol/procol-ui-tests && npm install && npx playwright install chromium
```

(`procol test` has a space in its name — keep the quotes.)

## 3. Put the `.env` files in place

Save the three files you received exactly here — each is a file literally named `.env`:

| File | Holds |
|---|---|
| `prototype/.env` | `SLINGRING_API_KEY` (AI gateway — the platform's planner and memory), optional `GROQ_API_KEY` / `GOOGLE_API_KEY` fallbacks, optional `SPINE_DB_URL` |
| `procol test/.env` | UAT app key/secret, test buyer phone, sign-in codes, read-only `DATABASE_URL` |
| `procol-ui-tests/.env` | `ACTIVE_CLIENT`, sign-in codes, read-only `DATABASE_URL` |

The `.env.example` next to each shows the variable names. Never commit a `.env` — `.gitignore`
already blocks it; don't force it.

## 4. (Optional) spine.ai's own database

```bash
brew install postgresql@17 pgvector
brew services start postgresql@17
/opt/homebrew/opt/postgresql@17/bin/createdb spine
echo 'SPINE_DB_URL=postgres://localhost:5432/spine' >> ~/Desktop/procol/prototype/.env
cd ~/Desktop/procol/prototype && npm run db:migrate
```

## 5. Build the memory and start

```bash
cd ~/Desktop/procol/prototype
npm run rag:build      # once, and again after pulling new test cases (~2-5 min)
npm run serve          # dashboard on http://localhost:4300
```

Open http://localhost:4300. Leave the terminal running.

## 6. Check it works (5 minutes)

1. **Home** → client **PROCOL DEMO · UAT**, mode **API**. Type
   `create an RFQ with 2 line items and publish it` → Start. It should build an event and end with
   green steps.
2. Same, mode **Browser**: a Chrome window opens and drives the screens; the session view shows each step.
3. **Defects** lists the verified bugs; **History** shows your runs.

If step 1 says "not sent", `procol-backend` is missing or in the wrong folder (step 1).
If it says it can't sign in, a value in `procol test/.env` is missing.
If the planner falls back or says no model, `SLINGRING_API_KEY` is missing.

## Rules everyone follows

* UAT and sandbox only. Live runs create `QA_Platform_…` / `API_Test_…` events and invite **only QA
  test vendors** (`qa_…@example.com`). Never set `SPINE_ALLOW_REAL_VENDORS`.
* Procol's database is read-only (SELECT). `procol-backend` and `procol-client-dashboard` are never edited.
* Never commit `.env`, `.auth/`, `findings/` or run outputs; mask secrets and OTPs in anything you share.
* Never click "Invite Vendor — invite N more" in a run.
* Don't expose localhost:4300 to the internet (no ngrok etc.) — it holds a signed-in UAT session.

## Contributing

```bash
git checkout -b saurabh          # your own branch
# …work…
cd prototype && npm run ci:check # the same checks CI runs on push
git push -u origin saurabh       # then open a pull request into animesh
```

Pull the team's latest with `git pull origin animesh`, then `npm install` in `prototype/` if
`package.json` changed, and `npm run rag:build` if test cases changed.
