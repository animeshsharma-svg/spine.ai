# CI/CD for spine.ai: how the platform checks itself

The platform checks itself in three ways. Each one is set up to fit where it can run.

| What | Where it runs | When | Talks to Procol? |
|---|---|---|---|
| **Offline checks** (`.github/workflows/ci.yml`) | GitHub Actions, and your Mac with `npm run ci:check` | every push and pull request, on every branch | **No.** No network calls to UAT and no secrets |
| **Nightly regression** (`prototype/scripts/nightly.ts`) | your Mac (launchd, 02:00) | every night | Yes. It runs the live event journeys on UAT |
| **Backend watch** (`prototype/scripts/backend-watch.ts`) | your Mac (launchd, hourly) | every hour | Reads the local `procol-backend` checkout, then runs targeted journeys on UAT |

The split exists because Procol's UAT gateway and database are private. GitHub's machines cannot reach them,
and the repository must never hold credentials. So GitHub checks the code, and the Mac, which can reach UAT,
checks the product.

---

## 1. Offline checks (GitHub Actions + `npm run ci:check`)

Before pushing, run this locally from `prototype/`:

```bash
npm run ci:check                 # every check, about 5 seconds
npm run ci:check -- --list       # what each check does
npm run ci:check -- --only catalog,case-data
npm run ci:check -- --fix        # keep the regenerated catalog instead of restoring it
```

| Check | Fails when |
|---|---|
| `typecheck-prototype` | `prototype/` has a TypeScript error (`tsc --noEmit`) |
| `typecheck-procol-test` | `procol test/` has a TypeScript error |
| `catalog` | `npm run cases:import` finds **orphans** (written cases that belong to no journey), finds duplicate case ids, or produces a `data/test-cases.json` / `data/journeys.json` that differs from the committed one, apart from the timestamp. This means someone edited `test-cases/*.md` (or the routing code) and did not re-run the import. Fix: `npm run cases:import`, then commit. Locally the check puts the files back the way it found them unless you pass `--fix`. |
| `case-data` | `data/api-cases.json` or `data/api-cases-extra/*.json` is not valid JSON, has a case missing `id/feature/title/method/path/expected/expectedResult`, reuses an id, has `expected` other than `accept`, `reject` or `no-5xx`, names a feature that is not in `config/featureTree.ts`, or uses a `{{placeholder}}` that no run fills in. The allowed placeholders are read from `KNOWN_PLACEHOLDERS` in `src/checks/caseLibrary.ts` itself, so the two lists cannot drift. A case that deliberately uses an unknown placeholder must say why in `notRunnable`. |
| `migrations` | a file in `db/migrations` is not named `NNN_name.sql`, two files share a number, applying them to an **empty** pgvector database fails, a second `db:migrate` applies anything, or a file errors when it runs a second time (each file must be idempotent on its own: `IF NOT EXISTS`, `OR REPLACE`). GitHub uses a throwaway `pgvector/pgvector:pg17` container. On your Mac it uses a scratch *schema* inside spine.ai's database and drops it straight afterwards, because the local `spine` role cannot create databases. It refuses to run locally if a migration names `public.` explicitly. |
| `unit` | one of the node:test unit tests in `scripts/ci-unit-tests.ts` fails. They cover the verdict rules (`engine.classify`), field checks (`apiAssertions`), the human wording (`humanize`), journey planning and outcomes, run-history flattening, the nightly's "what changed" rules, the lock, the case-data validator, and the backend-watch routes parser, mapper and run planner |
| `workflow` | a workflow file is not valid YAML, has a job with no steps, or reads a repository secret |
| `no-secrets` | a `.env` file is tracked by git, or a tracked file contains something that looks like a private key, a live access-token header, a GitHub/API/AWS key, or a database URL with a real password |

In GitHub each check is a separate step. A failure in one does not hide the others, and each step writes a
short summary to the run's page. A check that cannot run (for example, no database) is a **failure** in CI
and a **skip** on your Mac. Neither counts as a pass.

### What you must do to switch it on

Nothing secret is involved. The workflow needs no repository secrets.

1. Commit and push `.github/workflows/ci.yml` (the coordinator does this). The first push starts it.
2. On GitHub: **animeshsharmaa208/procol-qa-platform → Settings → Actions → General**
   - *Actions permissions*: "Allow all actions and reusable workflows", or at least allow
     `actions/checkout` and `actions/setup-node`. Those are the only two the workflow uses.
   - *Workflow permissions*: "Read repository contents" is enough. The workflow asks only for `contents: read`.
3. Optional: **Settings → Branches → Add rule** for `main` → "Require status checks to pass before merging" →
   choose **Offline checks**. A pull request from `aanya` or `animesh` then cannot merge while CI is red.
4. Private repositories on a personal account get a monthly allowance of free Actions minutes. One CI run
   takes a few minutes, mostly `npm ci`, which is cached after the first run.

### What CI cannot catch

It cannot catch anything that needs UAT: a journey that breaks, a refusal that changed, a 500. That is the nightly's job.

---

## 2. The nightly regression

```bash
cd prototype
npm run nightly                                   # all six journeys, PROCOL DEMO + Demo Account 2, with edge cases
npm run nightly -- --clients 198678 --only rfp_only    # a short one
npm run nightly -- --dry-run                      # what it would run
```

The six journeys are the same set as `scripts/capture-journey-samples.ts`:

- RFQ with counter offer, conversion to auction and a new version
- Technical (RFP) round only
- Technical round, then RFQ
- Technical round, then auction
- RFQ with a surrogate bid
- Technical round, then RFQ, with a surrogate bid

After its journey, each run also works through edge and negative cases (`EDGE-…`, 503 in
`data/api-cases-extra`) on a second copy of the event. A feature's edge cases run once per client, not six
times. They go on the journey that already ticks the feature, or else on the fitting journey with the fewest
cases so far: evaluation cases need a technical round, award, bid and PO cases need a priced round, and
auction cases need an auction. Cases that would change the journey itself (surrogate bid, counter offer,
conversion to auction, versioning, a different event type) only run on their own journey, so a reduced
`--only` run says which ones had no journey that night. `--dry-run` shows the placement. Turn edge cases off
with `--edges 0`.

**What it writes:** `prototype/data/nightly/<date>.md` is the note to read, and `<date>.json` holds the same
numbers for tools. The note starts with the one thing that matters: **what broke since last time**. That means
checks that worked the last time they were checked and do not work tonight. It then lists what was fixed, what
broke with no earlier result to compare, what is still broken from before (folded away), how many results
could not be judged (never counted as a pass), and a table of how each journey went. Ids and run ids are in a
folded *Details* section at the end.

"Last time" is each check's most recent real verdict (pass or fail) before tonight, from spine.ai's database
(`results`, with `case_track_record` used to flag checks that have gone both ways before, which may be flaky).
If the database is down, the run files in `data/runs` are used instead.

**Safe to run unattended:**
- **One at a time.** `data/nightly/.lock` holds the run's pid. A second start exits straight away. A lock left
  by a crashed run, whose pid is gone, is taken over, and a platform server it left behind is stopped.
- **Its own server.** It runs `tsx src/server.ts` (not watch mode) on a free port, or `--port`. It refuses
  `4300`, so the dashboard you work in is never used, restarted or slowed by it. Server output goes to
  `data/nightly/logs/` (git-ignored).
- **Time limits.** Each journey is stopped after 45 minutes (`--combo-timeout-min`), and the server is
  restarted before the next one so that two runs never overlap. No new journey starts after 6 hours
  (`--total-timeout-min`), and a backstop timer ends the process 10 minutes after that.
- **Cleans up** on Ctrl-C, SIGTERM and SIGHUP: it stops its server and releases the lock.
- Each run is saved by the server itself (`data/runs` + spine DB), exactly as the dashboard's Run button
  saves it, so nightly runs show up in Recent runs and in every track record.

### Switching on the nightly (your decision; nothing is installed)

```bash
cd /Users/animesh/Desktop/procol/prototype
mkdir -p ~/Library/Logs/spine-ai
NODE_BIN_DIR="$(dirname "$(which node)")"
sed -e "s#__PROTOTYPE_DIR__#$PWD#g" \
    -e "s#__NODE_BIN_DIR__#$NODE_BIN_DIR#g" \
    -e "s#__LOG_DIR__#$HOME/Library/Logs/spine-ai#g" \
    ops/ai.spine.nightly.plist.template > ~/Library/LaunchAgents/ai.spine.nightly.plist
plutil -lint ~/Library/LaunchAgents/ai.spine.nightly.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.spine.nightly.plist
launchctl kickstart gui/$(id -u)/ai.spine.nightly      # optional: run it once now
```

To switch it off: `launchctl bootout gui/$(id -u)/ai.spine.nightly`, then delete the plist.

Things to know before you switch it on:
- The Mac has to be on for it to run. If it is asleep at 02:00, launchd runs the job when it wakes. To make
  sure it is awake, run `sudo pmset repeat wakeorpoweron MTWRFSU 01:55:00`.
- spine.ai's Postgres must be running (`brew services start postgresql@17`) for the "since last time"
  comparison to use the database. Without it, the note still gets written, using the run files.
- Every run creates sandbox events on UAT (`API_Journey_…`), the same as running a journey from the dashboard.
  Six journeys on two clients come to roughly 12 events a night.

---

## 3. The backend watch

```bash
cd prototype
npm run backend:watch                            # anything new on origin/main since the last check?
npm run backend:watch -- --since 20 --dry-run    # rehearse: act as if the last seen commit were 20 back
npm run backend:watch -- --run                   # …and start the targeted runs
```

**How it decides what to test.** It uses fixed rules, with no AI involved. Strongest link first:

1. **Route.** A controller changed. The watcher finds the methods the diff touched (or every action, when the
   change is outside any method), looks up their routes in `config/routes.rb` at `origin/main`, then the
   library cases that call those routes, then those cases' features. The route reader matches 1,351 of the
   1,359 library cases to a backend route. The other 8 call a method and path that `routes.rb` does not
   define: `POST evaluations/submit` (the route is `PATCH`) and `POST proposal/:id/approval_workflows` (the
   route is `GET`).
2. **Reference.** A service, model, policy, concern or worker changed. The watcher finds the controllers whose
   source names its class (`git grep` at `origin/main`) and applies rule 1 to them. A class named by more than
   6 controllers (`Company`, `TradeRequest`) is too widely shared to pin down, so it falls through to rule 3.
3. **Keyword.** Neither rule found anything, so the watcher matches the file's own words (auction, proposal,
   surrogate, bulk upload…) against feature groups.

Tests, docs, scripts and data clean-ups are set aside as "nothing a request can observe". A change to the
error-message files (`config/locales`) is flagged, because a case that checks a refusal's exact wording may be
affected.

**Which runs.** The watcher picks the fewest of the six journeys that walk every reached sourcing-event
feature, at most 3 per check (`--max-runs`). Features that no journey walks (validation, templates, BOQ…) are
added to a run that can carry them, so their own cases and edge cases run too. When every feature in a run was
reached through a route or a reference, the run is narrowed to just the matched cases. Features outside the
sourcing-events POC (PR, PO, users, vendor bulk upload) are listed but not run unless you pass `--all-features`.
While the nightly is running, the watch plans but does not run, and leaves its "last seen" marker where it is,
so the next hourly check runs them.

**What it writes:** `prototype/data/backend-watch/<date>-<from>-<to>.md` contains what landed (the commit
titles), which features the change reaches and how strongly, which runs were started, and, after `--run`, what
broke compared with last time. The full file-by-file mapping is in the *Details* section. The "last seen"
marker is stored in spine.ai's database (`backend_watch_state`, migration `004_backend_watch.sql`), with a
history row per check in `backend_watch_log`. If the database is down, `data/backend-watch/state.json` is
used instead.

### Why fetching is off by default

The watch can only see commits that are already in the Mac's copy of `origin/main`. To get new ones, someone
has to run `git fetch` in `procol-backend`. That repository is read-only for this project, so the watch never
fetches unless you switch it on with `--fetch` or `BACKEND_WATCH_FETCH=1`.

When fetching is on, the watch runs exactly one command: `git fetch --no-tags origin main`. **It only
downloads new commits and moves `refs/remotes/origin/main` (and FETCH_HEAD).** It does not change the
checked-out branch, the index, or any file in the working tree, so nobody's work in that folder is affected.
It does need your GitHub access to `Procol-Tech/procol-backend`. It never asks for a password
(`GIT_TERMINAL_PROMPT=0`), so a missing credential means a skipped fetch rather than a job stuck waiting.
If a fetch fails, the watch carries on with the `origin/main` it already has.

### Switching on the backend watch (your decision; nothing is installed)

```bash
cd /Users/animesh/Desktop/procol/prototype
mkdir -p ~/Library/Logs/spine-ai
NODE_BIN_DIR="$(dirname "$(which node)")"
FETCH=0     # 1 = let it run `git fetch` in procol-backend (see above)
sed -e "s#__PROTOTYPE_DIR__#$PWD#g" \
    -e "s#__NODE_BIN_DIR__#$NODE_BIN_DIR#g" \
    -e "s#__LOG_DIR__#$HOME/Library/Logs/spine-ai#g" \
    -e "s#__FETCH__#$FETCH#g" \
    ops/ai.spine.backend-watch.plist.template > ~/Library/LaunchAgents/ai.spine.backend-watch.plist
plutil -lint ~/Library/LaunchAgents/ai.spine.backend-watch.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.spine.backend-watch.plist
```

To switch it off: `launchctl bootout gui/$(id -u)/ai.spine.backend-watch`.

The first check, when the database has no marker yet, records the current `origin/main` as its starting
point and runs nothing. As of 1 October the marker is already set to `ae36e86894`, the commit from 25
September that this Mac has. The commits from 1 to 25 September were already covered by
`test-cases/backend-recent-changes.md`.

---

## Files

| File | What it is |
|---|---|
| `.github/workflows/ci.yml` | the GitHub Actions workflow (offline checks) |
| `prototype/scripts/ci-check.ts` | the checks, runnable locally (`npm run ci:check`) |
| `prototype/scripts/ci-unit-tests.ts` | node:test unit tests (`npm run ci:unit`) |
| `prototype/scripts/ci-lib.ts` | shared: lock, own-port server, streamed feature run, the "what changed" rules, case validation, the six journeys |
| `prototype/scripts/ci-history.ts` | reads previous verdicts (spine DB or run files) and words the changes |
| `prototype/scripts/ci-backend-map.ts` | routes.rb parser, changed files → features, run planner (pure) |
| `prototype/scripts/nightly.ts` | the nightly regression (`npm run nightly`) |
| `prototype/scripts/backend-watch.ts` | the backend watch (`npm run backend:watch`) |
| `prototype/db/migrations/004_backend_watch.sql` | `backend_watch_state`, `backend_watch_log` |
| `prototype/ops/*.plist.template` | launchd templates (not installed) |
