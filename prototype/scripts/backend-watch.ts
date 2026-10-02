/**
 * BACKEND WATCH — new procol-backend commits → the platform features they
 * reach → targeted runs of exactly those features.
 *
 *   npm run backend:watch                          compare origin/main with the last commit seen
 *   npm run backend:watch -- --run                 …and start the targeted runs
 *   npm run backend:watch -- --since 20 --dry-run  rehearse: pretend the last seen commit is 20 back
 *   npm run backend:watch -- --fetch               update origin/main from GitHub first (opt-in, see below)
 *
 * Options
 *   --since <sha | N>   pretend the last seen commit is this one (N = N commits back on origin/main)
 *   --run               start the targeted runs (own platform server, never :4300)
 *   --dry-run           write the summary, but do not move the "last seen" marker
 *   --fetch             `git fetch` first — ALSO enabled by BACKEND_WATCH_FETCH=1
 *   --clients 198678    where the targeted runs go (default PROCOL DEMO)
 *   --max-runs 3        at most this many journey runs per check
 *   --all-features      also run matched features outside the sourcing-events POC
 *   --run-timeout-min 45
 *
 * THE BACKEND REPO IS READ-ONLY. Every git command here reads (`rev-parse`,
 * `log`, `diff`, `show`, `grep` against origin/main) — except `git fetch`,
 * which only runs when the owner switches it on. A fetch downloads new
 * objects and moves `refs/remotes/origin/main` (and FETCH_HEAD); it never
 * touches the checked-out branch, the index or any file in the working tree,
 * so nobody's local work in that repo changes. It is still off by default:
 * it needs the owner's GitHub access to Procol-Tech/procol-backend, and the
 * decision to let a scheduled job use it is the owner's.
 *
 * State: the last seen commit lives in spine.ai's database (migration
 * 004_backend_watch.sql, tables backend_watch_state + backend_watch_log), with
 * data/backend-watch/state.json as the fallback when the database is down.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURES, findFeature } from "../config/featureTree.js";
import { journeyPlan, journeyWalksFeature } from "../src/checks/journeyModel.js";
import { closeSpineDb, spineDb } from "../src/db/spineDb.js";
import { mapChangedFiles, parseRoutes, planTargetedRuns, controllerOfFile, type CaseRef, type FileMapping } from "./ci-backend-map.js";
import { changeSections, clientName, compareRuns, loadTitleWords } from "./ci-history.js";
import { argParser, BACKEND, COMBOS, git, localDate, lockHolder, minutes, oneLine, PROTO, runFeatures, startPlatformServer, takeLock, WATCH_PORT, type FeatureRunResult } from "./ci-lib.js";

const args = argParser();
const REPO_NAME = "procol-backend";
const BRANCH = "origin/main";
const OUT_DIR = join(PROTO, "data", "backend-watch");
const STATE_FILE = join(OUT_DIR, "state.json");
const fetchOn = args.has("--fetch") || process.env.BACKEND_WATCH_FETCH === "1";
let dryRun = args.has("--dry-run");
let doRun = args.has("--run");
// The nightly walks the same journeys with the same buyer; two at once would
// only slow both. While it runs, plan without running — and leave the marker
// where it is, so the next hourly check picks these commits up again.
const nightlyBusy = lockHolder(join(PROTO, "data", "nightly", ".lock"));
if (doRun && nightlyBusy) {
  console.log(`The nightly regression is running (${nightlyBusy}) — planning only this time; the next check will run them.`);
  doRun = false;
  dryRun = true;
}
const clients = (args.list("--clients") ?? ["198678"]).map(Number).filter((n) => n > 0);
const maxRuns = Number(args.get("--max-runs") ?? 3);
const runTimeoutMs = Number(args.get("--run-timeout-min") ?? 45) * 60_000;
const port = args.get("--port") ? Number(args.get("--port")) : undefined;
if (port === WATCH_PORT) {
  console.error(`--port ${WATCH_PORT} is the owner's dashboard; pick another`);
  process.exit(2);
}

const g = (a: string[]) => git(BACKEND, a).trim();

if (!existsSync(join(BACKEND, ".git"))) {
  console.error(`✗ ${BACKEND} is not a git checkout — nothing to watch.`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
const lock = takeLock(join(OUT_DIR, ".lock"), "backend-watch");
if (!lock.ok) {
  console.log(`Another backend watch is running (${lock.heldBy}) — nothing to do.`);
  process.exit(0);
}

// ── state ───────────────────────────────────────────────────────────────────

async function readState(): Promise<{ sha: string; source: string } | undefined> {
  try {
    const db = await spineDb();
    if (db) {
      const r = await db.query(`SELECT last_seen_sha FROM backend_watch_state WHERE repo = $1 AND branch = $2`, [REPO_NAME, BRANCH]);
      if (r.rows[0]) return { sha: r.rows[0].last_seen_sha, source: "database" };
    }
  } catch (e) {
    console.warn(`[backend-watch] could not read the state from the database (${(e as Error).message}) — trying the file`);
  }
  if (existsSync(STATE_FILE)) {
    const s = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    if (s?.lastSeenSha) return { sha: s.lastSeenSha, source: "state file" };
  }
  return undefined;
}

async function writeState(sha: string, at: string): Promise<string> {
  writeFileSync(STATE_FILE, JSON.stringify({ repo: REPO_NAME, branch: BRANCH, lastSeenSha: sha, lastSeenAt: at, updatedAt: new Date().toISOString() }, null, 2));
  try {
    const db = await spineDb();
    if (!db) return "state file only (database down)";
    await db.query(
      `INSERT INTO backend_watch_state (repo, branch, last_seen_sha, last_seen_at, updated_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (repo, branch) DO UPDATE SET last_seen_sha = EXCLUDED.last_seen_sha, last_seen_at = EXCLUDED.last_seen_at, updated_at = now()`,
      [REPO_NAME, BRANCH, sha, at],
    );
    return "database and state file";
  } catch (e) {
    return `state file only (${(e as Error).message})`;
  }
}

async function writeLog(row: Record<string, unknown>): Promise<void> {
  try {
    const db = await spineDb();
    if (!db) return;
    await db.query(
      `INSERT INTO backend_watch_log (repo, branch, from_sha, to_sha, commits, files, fetched, dry_run, features, mapping, runs, summary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [REPO_NAME, BRANCH, row.from, row.to, row.commits, row.files, row.fetched, row.dryRun, row.features, JSON.stringify(row.mapping), JSON.stringify(row.runs), row.summary],
    );
  } catch (e) {
    console.warn(`[backend-watch] log row not written (${(e as Error).message})`);
  }
}

// ── main ────────────────────────────────────────────────────────────────────

let exitCode = 0;
try {
  if (fetchOn) {
    console.log("Fetching origin/main (updates remote refs only; the working tree is not touched)…");
    try {
      execFileSync("git", ["fetch", "--no-tags", "--quiet", "origin", "main"], {
        cwd: BACKEND,
        timeout: 120_000,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, // never hang on a password prompt
      });
    } catch (e) {
      console.warn(`  fetch failed (${oneLine((e as any).stderr?.toString() || (e as Error).message, 160)}) — carrying on with the origin/main already here`);
    }
  }
  const to = g(["rev-parse", BRANCH]);
  const toDate = g(["log", "-1", "--format=%cI", to]);

  // Where to start from.
  let from: string | undefined;
  let fromSource = "";
  const since = args.get("--since");
  if (since) {
    from = /^\d+$/.test(since) ? g(["rev-list", "--first-parent", "-n", "1", "--skip", since, to]) : g(["rev-parse", since]);
    fromSource = `--since ${since}`;
  } else {
    const st = await readState();
    if (st) {
      from = st.sha;
      fromSource = st.source;
    }
  }
  if (!from) {
    const where = dryRun ? "(dry run — not recorded)" : await writeState(to, toDate);
    console.log(`First check: nothing seen before. Recorded ${to.slice(0, 10)} (${toDate}) as the starting point ${where}. The next check reports what lands after it.`);
    throw "done";
  }
  if (from === to) {
    console.log(`No new commits on ${BRANCH} since ${to.slice(0, 10)} (${toDate})${fetchOn ? "" : " — note: fetching is off, so only commits fetched by someone else would show up"}.`);
    throw "done";
  }
  let base = from;
  let rewritten = false;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", from, to], { cwd: BACKEND, stdio: "ignore" });
  } catch {
    base = g(["merge-base", from, to]);
    rewritten = true;
  }

  const commits = g(["log", "--first-parent", "--format=%h%x09%cs%x09%an%x09%s", `${base}..${to}`])
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [sha, date, author, ...subject] = l.split("\t");
      return { sha, date, author, subject: subject.join("\t") };
    });
  const files = g(["diff", "--name-only", "-M", base, to]).split("\n").filter(Boolean);
  console.log(`${commits.length} new commit(s) on ${BRANCH} (${base.slice(0, 10)} → ${to.slice(0, 10)}, from ${fromSource}${rewritten ? "; history was rewritten, compared from the merge base" : ""}), ${files.length} file(s) changed.`);

  // The platform's knowledge: routes at the new commit, the runnable case library.
  const routes = parseRoutes(g(["show", `${to}:config/routes.rb`]));
  const dataDir = join(PROTO, "data");
  const cases: CaseRef[] = [
    ...JSON.parse(readFileSync(join(dataDir, "api-cases.json"), "utf8")),
    ...readdirSync(join(dataDir, "api-cases-extra"))
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => JSON.parse(readFileSync(join(dataDir, "api-cases-extra", f), "utf8"))),
  ].map((c: any) => ({ id: c.id, feature: c.feature, title: c.title, method: c.method, path: c.path }));
  const refCache = new Map<string, string[]>();
  const mapping: FileMapping[] = mapChangedFiles({
    files,
    routes,
    cases,
    sourceOf: (f) => {
      try {
        return git(BACKEND, ["show", `${to}:${f}`]);
      } catch {
        return undefined; // deleted
      }
    },
    diffOf: (f) => {
      try {
        return git(BACKEND, ["diff", "-U0", base, to, "--", f]);
      } catch {
        return undefined;
      }
    },
    controllersReferencing: (cls) => {
      if (!refCache.has(cls)) {
        let out: string[] = [];
        try {
          out = git(BACKEND, ["grep", "-l", "-w", "-F", cls, to, "--", "app/controllers"])
            .split("\n")
            .filter(Boolean)
            .map((l) => l.replace(`${to}:`, ""))
            .map((f) => controllerOfFile(f))
            .filter((c): c is string => !!c);
        } catch {
          out = []; // git grep exits 1 on no match
        }
        refCache.set(cls, [...new Set(out)]);
      }
      return refCache.get(cls)!;
    },
  });

  // Features, with what reached them.
  const featureIds = new Set(FEATURES.map((f) => f.id));
  const matched = mapping.flatMap((m) =>
    m.features
      .filter((f) => featureIds.has(f))
      .map((feature) => ({ feature, via: m.via, file: m.file, cases: m.cases.filter((id) => cases.find((c) => c.id === id)?.feature === feature) })),
  );
  const features = [...new Set(matched.map((m) => m.feature))];
  const walks = (feature: string, comboFeatures: string[]) => journeyWalksFeature(feature, journeyPlan(comboFeatures));
  const plan = planTargetedRuns(matched, COMBOS, walks, { maxRuns, allFeatures: args.has("--all-features") });

  // ── targeted runs ─────────────────────────────────────────────────────────
  const ran: Array<{ company: number; label: string; features: string[]; cases: number; result: FeatureRunResult }> = [];
  const startedAt = new Date();
  if (doRun && plan.runs.length) {
    const server = await startPlatformServer({ port, logFile: join(OUT_DIR, "logs", `${localDate()}-server.log`) });
    try {
      for (const c of clients)
        for (const r of plan.runs) {
          console.log(`▶ ${clientName(c)} · ${r.label}${r.cases.length ? ` (${r.cases.length} matched case(s))` : ""}`);
          const result = await runFeatures(server.base, c, r.features, { timeoutMs: runTimeoutMs, cases: r.cases, onLine: (l) => console.log(l) });
          console.log(`  → ${result.timedOut ? "stopped at the time limit" : (result.journeyOutcome ?? result.errors[0] ?? "finished")} (${minutes(result.ms)})`);
          ran.push({ company: c, label: r.label, features: r.features, cases: r.cases.length, result });
        }
    } finally {
      await server.stop();
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  // ── the summary ───────────────────────────────────────────────────────────
  const label = (id: string) => findFeature(id)?.label ?? id;
  const viaWord: Record<FileMapping["via"], string> = {
    route: "its API routes are called by test cases",
    reference: "used by a controller whose routes test cases call",
    keyword: "matched by name only",
    inert: "tests, docs or scripts",
    none: "not linked to anything the platform tests",
  };
  const md: string[] = [];
  md.push(`# New backend code — ${commits.length} commit${commits.length === 1 ? "" : "s"} to check`, "");
  md.push(
    `Checked ${new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}. ` +
      `${files.length} file(s) changed in the backend's main branch, reaching **${features.length} platform feature(s)**` +
      (dryRun ? ". This was a rehearsal: the “last seen” marker was not moved." : "."),
    "",
  );
  md.push("## What landed", "", ...commits.slice(0, 40).map((c) => `- ${c.date} — ${oneLine(c.subject, 140)} (${c.author})`), ...(commits.length > 40 ? [`- … and ${commits.length - 40} more`] : []), "");
  const byFeature = new Map<string, typeof matched>();
  for (const m of matched) byFeature.set(m.feature, [...(byFeature.get(m.feature) ?? []), m]);
  const strength = (list: typeof matched) => (list.some((m) => m.via === "route") ? 0 : list.some((m) => m.via === "reference") ? 1 : 2);
  if (byFeature.size) {
    md.push("## Features the change reaches", "", "Strongest link first: a changed API action that a test case calls, then code a controller uses, then a match by name only.", "");
    for (const [f, list] of [...byFeature].sort((a, b) => strength(a[1]) - strength(b[1]) || b[1].length - a[1].length)) {
      const nCases = new Set(list.flatMap((m) => m.cases)).size;
      const how = strength(list) === 0 ? "a changed action its cases call" : strength(list) === 1 ? "code its endpoints use" : "the file names only";
      md.push(`- **${label(f)}** — ${list.length} changed file(s), through ${how}${nCases ? `; ${nCases} test case(s) exercise it` : ""}`);
    }
    md.push("");
  }
  const counts = mapping.reduce<Record<string, number>>((a, m) => ({ ...a, [m.via]: (a[m.via] ?? 0) + 1 }), {});
  md.push("## How the changed files were linked", "", ...Object.entries(counts).map(([v, n]) => `- ${n} file(s): ${viaWord[v as FileMapping["via"]]}`), "");

  md.push("## Runs", "");
  if (!plan.runs.length) md.push("No sourcing-event feature was reached, so no journey needs to run.");
  for (const r of plan.runs)
    md.push(`- **${r.label}** — covers ${r.covers.map(label).join(", ")}${r.cases.length ? `; narrowed to the ${r.cases.length} matched test case(s) after the journey` : ""}`);
  if (plan.outOfScope.length) md.push(`- Not run (outside the sourcing-events scope — add \`--all-features\`): ${plan.outOfScope.map(label).join(", ")}`);
  if (plan.dropped.length) md.push(`- Not run (over the limit of ${maxRuns} runs — raise \`--max-runs\`): ${plan.dropped.map(label).join(", ")}`);
  md.push("");
  if (!doRun && plan.runs.length) md.push("These were planned, not started. Start them with `npm run backend:watch -- --run` (or let the scheduled job do it).", "");
  let details: string[] = [];
  if (ran.length) {
    md.push("## What the runs found", "");
    for (const r of ran) md.push(`- ${clientName(r.company)} · ${r.label}: ${r.result.timedOut ? "stopped at the time limit" : (r.result.journeyOutcome ?? r.result.errors[0] ?? "finished")} (${minutes(r.result.ms)})`);
    md.push("");
    const ids = ran.map((r) => r.result.runId).filter((x): x is string => !!x);
    await loadTitleWords();
    const cmp = await compareRuns(ids, startedAt);
    const s = changeSections(cmp.compared, cmp.prev.track);
    md.push(...(s.md.length ? s.md : ["Nothing changed compared with each check's previous result.", ""]));
    details = s.details;
  }
  md.push(
    "<details><summary>Details (commits, files, routes, case ids)</summary>",
    "",
    `- ${REPO_NAME} ${BRANCH}: ${base} → ${to} (${toDate}); started from ${fromSource}; fetch ${fetchOn ? "on" : "off"}.`,
    ...commits.map((c) => `- \`${c.sha}\` ${c.subject}`),
    "",
    "| File | Linked by | Actions | Features | Cases |",
    "|---|---|---|---|---|",
    ...mapping.map(
      (m) =>
        `| \`${m.file}\` | ${m.via}${m.note ? ` — ${m.note}` : ""} | ${m.actions.join(", ") || "—"} | ${m.features.join(", ") || "—"} | ${m.cases.length ? (m.cases.length > 8 ? `${m.cases.slice(0, 8).join(", ")} … (${m.cases.length})` : m.cases.join(", ")) : "—"} |`,
    ),
    "",
    ...plan.runs.map((r) => `- run: features \`${r.features.join(",")}\`${r.cases.length ? ` cases \`${r.cases.join(",")}\`` : ""}`),
    ...ran.map((r) => `- ran on ${r.company}: run \`${r.result.runId ?? "none"}\``),
    "",
    ...details,
    "</details>",
    "",
  );
  const file = join(OUT_DIR, `${localDate()}-${base.slice(0, 7)}-${to.slice(0, 7)}${dryRun ? "-rehearsal" : ""}.md`);
  writeFileSync(file, md.join("\n"));
  await writeLog({
    from: base,
    to,
    commits: commits.length,
    files: files.length,
    fetched: fetchOn,
    dryRun,
    features,
    mapping,
    runs: ran.map((r) => ({ company: r.company, label: r.label, features: r.features, cases: r.cases, runId: r.result.runId, outcome: r.result.journeyOutcome })),
    summary: md.join("\n"),
  });
  const where = dryRun ? "not moved (dry run)" : `moved to ${to.slice(0, 10)} in the ${await writeState(to, toDate)}`;
  console.log(`\n${features.length} feature(s) reached; ${plan.runs.length} run(s) ${doRun ? "run" : "planned"}. Last-seen marker ${where}.\nWrote ${file.replace(PROTO + "/", "")}`);
} catch (e) {
  if (e !== "done") {
    console.error(`✗ ${(e as Error).message ?? e}`);
    exitCode = 1;
  }
} finally {
  lock.release();
  await closeSpineDb();
}
process.exit(exitCode);
