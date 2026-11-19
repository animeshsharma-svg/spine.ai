# Prompt for Aanya's Claude — merge your work onto `demo` (paste everything below the line)

Written by Animesh on 20 Nov 2026. The day-4 brief (`docs/Prompt_for_Aanya_Day4_2026-11-18.md`) and `docs/ONE-BRANCH-PLAN-2026-11-18.md` still stand; this one is only the merge, plus the four rules that changed since 18 Nov.

---

You are the Claude working with Aanya on spine.ai, Procol's QA platform. Today's job is one thing: get everything Aanya has built since 16 Nov onto the team trunk `demo`, without losing a line of hers or undoing a line of Animesh's. Read `docs/ONE-BRANCH-PLAN-2026-11-18.md` §1–§3 first.

## 0. Where things stand (checked on the team repo, 20 Nov)

- The team repo is the remote `spine` (`https://github.com/animeshsharma-svg/spine.ai`, **public**). The trunk is `spine/demo`. Animesh keeps `demo` equal to his `rca-wt`.
- The last push on `spine/aanya` is **b710dca9 (16 Nov)**, and all of it is already inside `demo`. So everything Aanya has done since 16 Nov exists **only on her machine** — committed locally, uncommitted, or stashed. That is what this merge brings over.
- `demo` still carries two **stand-ins** for modules commit 4c16953a imports but never committed: `prototype/src/p2pCollection.ts` and `prototype/src/model/backendRules.ts`. Aanya's real files replace them in this merge.

## 1. Before touching git — take stock (read-only)

Run and paste the output into the chat before going on:

```
git remote -v
git branch --show-current
git status --short
git stash list
git log --oneline -10
git log --oneline spine/aanya..HEAD
```

Make the list of **Aanya's own files** that changed since 16 Nov (her area: `prototype/public/prd.js`, `prototype/public/*session*` screens she built, `prototype/src/routes/prd.ts`, her `converse.ts`, `tokenClients.ts`, the session-guided screens, `p2pCollection.ts`, `model/backendRules.ts`, her docs). Anything in `prototype/src/**` or `procol-ui-tests/**` that is not hers: say which file and why it changed, and ask Aanya before committing it.

## 2. Save her work as commits on her branch (no merge yet)

1. If there are stashes with her work, `git stash show -p stash@{N}` each and ask Aanya which to keep; apply the kept ones (`git stash apply`, never `pop` until it is committed).
2. Stage **only her files by name** (`git add <path> …` — never `git add -A` / `git add .`). Include the two real modules:
   ```
   git add prototype/src/p2pCollection.ts prototype/src/model/backendRules.ts
   ```
   (if git says they are ignored, `git add -f` those two only).
3. Check nothing secret or per-machine is staged — this must print nothing:
   ```
   git diff --cached --name-only | grep -iE '\.xlsx$|\.env|\.auth|/data/(runs|sessions|sheets|hubspot|prd|run-cases)/|\.local-rca'
   ```
4. Commit: `git commit -m "Aanya's work 16–20 Nov: <one line of what is in it>"` and end the message with the attribution line your Claude uses.

## 3. Merge `demo` into it (merge, never rebase)

```
git fetch spine
git merge spine/demo
```

Conflicts, by file owner (in this merge "ours" = Aanya's branch, "theirs" = `demo`):

| File | Keep |
|---|---|
| `prototype/src/p2pCollection.ts`, `prototype/src/model/backendRules.ts` (add/add) | **ours** — `git checkout --ours <file>`; her real module replaces the stand-in |
| `prototype/public/prd.js`, her session screens, `routes/prd.ts`, her docs | **ours**, unless the `demo` hunk is clearly new work by Animesh — then keep both |
| Anything else in `prototype/src/**`, `procol-ui-tests/**`, `prototype/data/**`, `prototype/config/**` (Animesh's) | **theirs** — `git checkout --theirs <file>` |
| A file both edited where both sides add code | keep both, in the order that compiles |

Then `git add` each resolved file by name and `git commit` (the merge message git offers is fine). List every conflicted file and the side kept — this list goes in the stand-up.

If the merge goes wrong at any point: `git merge --abort` and tell Aanya. Never `reset --hard`, never force-push, never delete a branch.

## 4. Prove it works before pushing

From the repo root:

```
cd prototype && npx tsc --noEmit -p . 2>&1 | grep -v "procol-ui-tests" | head -30
npx tsx scripts/session-unit-tests.ts
npx tsx scripts/apiplanner-unit-tests.ts
```

Expected: no type errors outside procol-ui-tests noise; session tests **12 / 12**; API-planner tests **57 / 57**. A type error in `p2pCollection` / `backendRules` callers means her real module's exports differ from the stand-in's — fix the caller in **her** file, or name the export in the stand-up for Animesh.

Then start the server **only** from the launch entry (`spine-demo-merged`, port 4320 — never from Bash). Its command must contain `SPINE_QA_VENDORS_ONLY=1` (see §6). Open `http://localhost:4320/#/s` and the PRD page; confirm the P2P collection page and the Test cases tab's code citations are back (they were off while the stand-ins were in).

## 5. Push and hand over

```
git push spine HEAD:aanya
```

(if `git push` asks for a password, stop and tell Aanya; never paste a password or token into the chat). Animesh merges `aanya` into `demo` the same day. Stand-up line, in this shape:

> **Aanya — merge (20 Nov):** pushed `aanya` = `<hash>` (her work 16–20 Nov + `demo` at `<demo hash>`). Conflicts: `<file>` → ours/theirs, … Real `p2pCollection.ts` + `model/backendRules.ts` in. tsc clean, session 12/12, api-planner 57/57. :4320 up from the launch entry, `#/s` lists sessions. Needs Animesh: <exact file / route / field, or "nothing">.

After this, back to the day-4 rule: every morning `git fetch spine && git merge spine/demo`, every evening push `aanya`.

## 6. Four rules that changed since 18 Nov (they are in `demo`; know them before testing)

1. **Every invite is tested both ways** (the tester's rule, 20 Nov). A case that puts vendors on an event is written twice: once adding the vendors **by name** — as many as the case needs (Vendor A, B, …) — and once pressing the product's own **"Invite Vendor"**, which invites every vendor the product suggests. The generator writes the pair (`(vendors invited by name)` / `(Invite Vendor — all suggested vendors)` in the title) and the runner performs each as written. If a screen of yours writes or edits cases, keep both halves; never merge them into one.
2. **"Vendor A / Vendor B" are placeholders**, never company names: the runner turns them into the prepared event's vendors or the company's QA test vendors. Do not write a real or made-up vendor, product or template name into a case the PRD does not name ("the test product", "the first pricing template").
3. **QA vendors only on PROCOL DEMO runs**: the :4320 launch entry runs with `SPINE_QA_VENDORS_ONLY=1`. Only a case that says to press "Invite Vendor" presses it; nothing else may fall through to it (on 19 Nov four DEMO events reached every suggested vendor that way; fixed). Never set `SPINE_ALLOW_REAL_VENDORS`. Never GMMCO.
4. **The sheet store is shared** (`prototype/data/sheet-cases.json`): server, CLIs and the night runner all write it. Never edit it by hand while the server runs. Cases a session queues "for the night" run with `npm run night:queue` (or `npm run nightly`) — not by retyping them.

## 7. What not to do

- Never edit Animesh's files to make a merge "go green" — keep `theirs` and say what broke.
- Never commit `.env`, `.auth`, runs, sessions, findings, HubSpot/RCA ticket content, or any xlsx (the repo is public).
- Never rebase, force-push, `reset --hard`, or delete a branch. Never run `gh auth setup-git`.
- Never run a test case by typing it into the chat session; cases run through the sheet runner (Test sheets / Home / the session's Run).
