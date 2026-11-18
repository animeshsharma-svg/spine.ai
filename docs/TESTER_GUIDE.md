# spine.ai: setup and testing guide for a tester

**For the tester:** follow the four steps below. Everything after "Instructions for Claude" is for the Claude you
work with. Paste this whole file to it, together with the repository link.

1. Have **Claude Code** installed (the desktop app or the `claude` command in a terminal) on a Mac.
2. Make sure your GitHub account can open **https://github.com/Procol-Tech/procol-backend**. Ask your Procol
   admin if it can't. The platform needs Procol's backend code next to it.
3. Animesh will send you **three `.env` files** separately, through a password manager. Keep them; don't
   forward them, paste them into chats, or commit them anywhere.
4. Start Claude Code in an empty folder (e.g. your Desktop) and send it:
   > Set up and test this project by following the guide. Repo: https://github.com/animeshsharma-svg/spine.ai (branch `demo`).
   > *(then paste this whole file)*

Claude asks you whenever it needs something from you: where the `.env` files are, a one-time code, or turning
on the Procol VPN.

---

## Instructions for Claude

You are helping a tester set up and test **spine.ai**, Procol's QA platform. It tests Procol's
procurement product (sourcing events, RFQs, auctions, awards) on Procol's **UAT** environment through its
API and its screens, and shows the results on a local dashboard at http://localhost:4300.

Your job has three parts:
- **A.** Set the project up on this Mac.
- **B.** Test that the platform works, following the test plan below.
- **C.** Write a report of what worked and what didn't.

The tester **does not change code and does not commit**. Animesh and Aanya merge the code into the `demo`
branch; the tester pulls it and tests it.

### Hard rules (read these first; they override anything else)

1. **Never commit, push, merge or open pull requests** in this repository. Read-only git: `clone`, `fetch`, `pull`,
   `status`, `log`, `diff` only. If something needs a code change, write it in the report instead.
2. **Never edit `procol-backend/` or `procol-client-dashboard/`**. They are Procol's own code, used read-only.
3. **Secrets:** never print, log, paste, screenshot or summarise the contents of any `.env` file, `.auth/` folder,
   access token, password or one-time code (OTP). To check a variable is set, test for its name only
   (example below). Never put a secret in a URL, a commit, a report or a chat message.
4. **UAT and test data only.** Use the client **PROCOL DEMO · UAT** unless Animesh or Aanya name another.
   Events the platform creates are titled `QA_Platform_…` / `API_Test_…` / `spine-API-automation-…`.
   Vendors are only the QA test vendors (`qa_…@example.com`). Never set `SPINE_ALLOW_REAL_VENDORS`, never
   invite a real supplier, never click **"Invite Vendor — invite N more"** in a run.
5. **Procol's database is read-only:** SELECT queries only, never INSERT, UPDATE or DELETE.
6. **Don't change company settings, templates, approval workflows, users or teams** on any client, unless the
   tester confirms that Animesh or Aanya asked for that exact change.
7. **Never sign in as a real person.** Only the buyer login configured in the `.env` files and the QA vendors.
8. **Don't expose localhost:4300 to the internet** (no ngrok, no tunnels, no port forwarding). It holds a
   signed-in UAT session.
9. If an action would email, message or invite real people, or would be hard to undo, **stop and ask the
   tester first**.

### A. Set up

**A1. Tools.** Check, and install what is missing (ask before installing):

```bash
node -v      # must be v24.x  →  brew install node@24  (then follow brew's PATH note)
git --version
brew --version   # Homebrew; install from https://brew.sh if missing
```

**A2. Get the code.** The folder name `procol` matters: the platform finds its sibling folders by relative path.

```bash
cd ~/Desktop
git clone -b demo https://github.com/animeshsharma-svg/spine.ai.git procol
cd ~/Desktop/procol
git clone https://github.com/Procol-Tech/procol-backend.git
git clone https://github.com/Procol-Tech/procol-client-dashboard.git
```

The two Procol repos go **inside** `procol/`. They are git-ignored there, so they are never committed.
If cloning them fails with "Repository not found", the tester's GitHub account has no Procol access: stop and
tell the tester (see step 2 at the top). `procol-backend` is required; without it API runs report "not sent".

**A3. Install packages.** Three folders; `procol test` has a space in its name, so keep the quotes.

```bash
cd ~/Desktop/procol/prototype        && npm install
cd ~/Desktop/procol/"procol test"    && npm install
cd ~/Desktop/procol/procol-ui-tests  && npm install && npx playwright install chromium
```

**A4. Put the `.env` files in place.** Ask the tester where they saved the three files they received. Copy
(don't print) each to exactly this path. Each file is literally named `.env`:

| Put it at | It holds (names only) |
|---|---|
| `~/Desktop/procol/prototype/.env` | `SLINGRING_API_KEY` (AI gateway), optional `GROQ_API_KEY`, `GOOGLE_API_KEY`, `SPINE_DB_URL` |
| `~/Desktop/procol/procol test/.env` | `ACTIVE_CLIENT`, `CLIENTA_*` UAT app key/secret, buyer phone, OTP, `DATABASE_URL` (read-only) |
| `~/Desktop/procol/procol-ui-tests/.env` | `ACTIVE_CLIENT`, sign-in codes, `DATABASE_URL` (read-only) |

Check them **without showing values**:

```bash
cd ~/Desktop/procol
for f in prototype/.env "procol test/.env" procol-ui-tests/.env; do
  [ -f "$f" ] && echo "OK   $f ($(grep -c '=' "$f") settings)" || echo "MISSING  $f"
done
grep -q '^SLINGRING_API_KEY=.\+' prototype/.env && echo "AI key set" || echo "AI key MISSING"
grep -q '^DATABASE_URL=.\+' "procol test/.env" && echo "DB url set" || echo "DB url MISSING"
git status --short | grep -i env || echo "no .env file is visible to git (correct)"
```

If git ever lists a `.env` file, stop and tell the tester; it must never be committed.

**A5. (Optional) The platform's own database.** This stores run history and the product model. Without it the
platform saves to files and still works. Ask the tester before installing.

```bash
brew install postgresql@17 pgvector
brew services start postgresql@17
/opt/homebrew/opt/postgresql@17/bin/createdb spine
echo 'SPINE_DB_URL=postgres://localhost:5432/spine' >> ~/Desktop/procol/prototype/.env
cd ~/Desktop/procol/prototype && npm run db:migrate
```

**A6. Build the memory and start the dashboard.**

```bash
cd ~/Desktop/procol/prototype
npm run rag:build     # once; ~2–5 min. Again after pulling new test cases.
npm run serve         # dashboard on http://localhost:4300. Leave it running.
```

Run `npm run serve` in the background (or in its own terminal tab) and keep it running while testing. If port
4300 is busy: `PORT=4301 npx tsx src/server.ts`. Then open http://localhost:4300. On the sign-in page, use the
tester's own Procol work email.

**A7. Procol VPN.** Anything that reads Procol's UAT database needs the tester's **Procol VPN switched on**. If
a step says it cannot reach the database, ask the tester to turn the VPN on and retry.

**A8. Getting a new build later.** When Animesh or Aanya say the `demo` branch was updated:

```bash
cd ~/Desktop/procol && git pull origin demo
cd prototype && npm install && cd ../"procol test" && npm install && cd ../procol-ui-tests && npm install
cd ~/Desktop/procol/prototype && npm run rag:build
```

Then restart `npm run serve`. Also pull the Procol repos (`git -C procol-backend pull`,
`git -C procol-client-dashboard pull`).

### B. Test plan

Use **PROCOL DEMO · UAT** for every run. For each test, write down what you did, what you expected, and what
happened: Pass, Fail, Blocked (could not be tried), or Couldn't Tell (no clear answer). For a Fail, also note
the exact message on screen, the session link or id, and a screenshot path. Take screenshots with the
platform's own evidence when it gives one, otherwise ask the tester to take one. Keep notes as you go in
`~/Desktop/spine-test-notes/notes.md`, **outside** the repository.

Before starting, ask the tester whether Animesh or Aanya asked them to focus on specific features. If they
did, test those first.

| ID | Area (dashboard page) | What to do | Expected |
|---|---|---|---|
| T-01 | Start-up | Open http://localhost:4300 and sign in with the tester's work email | Home page loads, no error banner; the terminal running `serve` shows no red errors |
| T-02 | Home, API mode | Client **PROCOL DEMO · UAT**, mode **API**. Type `create an RFQ with 2 line items and publish it`, press Start | A session opens, steps turn green one by one, and the run ends with the event's RFX number |
| T-03 | Home, Browser mode | Same sentence, mode **Browser** | A Chrome window opens and drives Procol's screens; the session view shows each step with a picture |
| T-04 | Home, unclear text | Type something vague, e.g. `test award` | It asks what you mean (choices or a question) instead of guessing |
| T-05 | Sessions | Open **Sessions** and the runs from T-02 and T-03 | Each run is listed with its status; opening one shows the steps, the verdict and the evidence |
| T-06 | Test catalogue | Open **Test catalogue**, search for `award`, open a case | Cases are listed with their steps; filter and search work |
| T-07 | Run tests | Open **Run tests**, pick 2–3 cases from one journey, run them | Each case gets a verdict (Pass / Fail / Blocked / Couldn't tell) with a reason in plain words |
| T-08 | Test sheets | Open **Test sheets**, upload a small sheet of test cases (ask Animesh or Aanya for a sample if there is none), run one case, then run all | Cases run one by one; a results sheet can be downloaded and has a verdict and screenshot per case |
| T-09 | Home, upload a PRD | On Home, drop a PRD (a .pdf / .docx / .md the tester has for a Procol feature) | Test cases are written from the PRD, can be reviewed, and can be run |
| T-10 | Bugs | Open **Bugs** | Verified bugs are listed with steps and evidence; a bug from a case that now passes is not shown as open |
| T-11 | Bidding scenarios | Open **Bidding scenarios**, run one scenario | QA vendors bid through their own logins; the scenario ends with a verdict per check |
| T-12 | UI vs API | Open **UI vs API**, run the check on one event screen | Each value the backend sent is compared with what the screen shows; differences are listed |
| T-13 | Product knowledge | Open **Product knowledge** and ask a question, e.g. `what does bid masking do?` | An answer that cites where it comes from |
| T-14 | Screens | Open **Screens** | Screens the platform has visited are shown with their pictures and the cases on each |
| T-15 | Guided testing session | If Home offers a guided session (environment → requirement → sanity → cases → review → run), go through it once | Each stage completes and leads to the next; the run at the end shows results |
| T-16 | Stop and re-run | Start a run, stop it halfway, start it again | It stops cleanly and the second run is not confused by the first |
| T-17 | Wrong input | In Home, type a case for a feature Procol doesn't have, e.g. `pay the vendor in bitcoin` | It says it can't do this (or asks), and does not report Pass |
| T-18 | Restart | Stop `serve`, start it again, reopen the dashboard | Earlier sessions and results are still there |

While testing, also watch for:
- pages that don't load, buttons that do nothing, or spinners that never stop;
- text that is confusing, too technical, or wrong;
- a Pass that looks unearned (for example, the step never actually happened);
- anything slow, with how many seconds it took;
- errors in the terminal running `serve`. Copy the error line into the notes, but never any secret.

If the same thing fails twice, record it once with "happened 2 of 2 times". If a run fails because of the
environment (VPN off, UAT down, sign-in code refused), mark it **Blocked**, not Fail, and say why.

### C. The report

At the end, make one Excel sheet at `~/Desktop/spine-test-notes/spine_test_report_<date>.xlsx` (outside the
repo) with one row per test. Use these columns:

`Test ID | Area | What I did | Expected | What happened | Status | Session / RFX | Screenshot | Notes`

- **Status** is a dropdown: Pass, Fail, Blocked, Couldn't Tell.
- Write in plain, short sentences, as a tester would; no code.
- Add a second short list, **"Ideas / confusing things"**, for things that are not bugs but could be better.

Show the tester the summary (how many Pass, Fail, Blocked) and the file path. The tester sends the file to
Animesh and Aanya. Don't email or upload it yourself.

### Troubleshooting

| What you see | What it means / do |
|---|---|
| A run step says **"not sent"** | `procol-backend` is missing or not inside `~/Desktop/procol/` (A2) |
| **Can't sign in** to UAT in a run | A value is missing in `procol test/.env`; ask the tester to check with Animesh |
| "no model" or the planner falls back | `SLINGRING_API_KEY` is missing in `prototype/.env` |
| Database or `ECONNREFUSED` / timeout on a DB read | Procol VPN is off: ask the tester to switch it on |
| `EADDRINUSE :4300` | Something already uses the port: stop the old `serve`, or use `PORT=4301` |
| `npm install` errors about Node version | Node is not v24: `brew install node@24`, then open a new terminal |
| Browser mode opens nothing | Run `npx playwright install chromium` in `procol-ui-tests` again |
| `rag:build` fails on the AI key | Same as "no model" above |

For anything not in this table: describe it to the tester in plain words with the exact error line (no
secrets), and suggest they send it to Animesh or Aanya. Don't change code to work around it.
