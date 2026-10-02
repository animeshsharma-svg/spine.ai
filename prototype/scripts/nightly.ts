/**
 * THE NIGHTLY REGRESSION — the live event journeys against UAT, every night,
 * with a short plain-English note of what broke since the last time.
 *
 *   npm run nightly                                   all six journeys on PROCOL DEMO and Demo Account 2
 *   npm run nightly -- --clients 198678 --only rfp_only   a reduced run
 *   npm run nightly -- --dry-run                      say what would run, run nothing
 *
 * Options
 *   --clients 198678,32461     which UAT companies (default both)
 *   --only rfq_full,rfp_only   which journeys (default all six; names in ci-lib.ts COMBOS)
 *   --edges 0                  journeys only, without their edge / negative cases
 *   --stage-seconds 45         how long each bidding window stays open
 *   --combo-timeout-min 45     one journey that runs longer than this is stopped
 *   --total-timeout-min 360    the whole night stops after this, whatever is left
 *   --port 4316                port for its own platform server (never 4300)
 *
 * What it does, in order:
 *   1. takes a lock (data/nightly/.lock) — a second copy started meanwhile exits at once
 *   2. starts its OWN platform server (`tsx src/server.ts`, not watch mode) on a
 *      free port; the owner's dashboard on :4300 is never used or touched
 *   3. runs each journey through /api/features-run, exactly like the Run button;
 *      the server saves each run (data/runs + spine DB) itself
 *   4. compares every verdict with that check's previous real verdict
 *      (spine DB results / case_track_record; the run files if the DB is down)
 *   5. writes data/nightly/<date>.md (the note) and <date>.json (the raw numbers)
 *   6. stops its server and releases the lock — also on Ctrl-C, SIGTERM or a timeout
 *
 * Everything it creates on UAT is a sandbox record (API_Journey_… / API_Test_…),
 * as with any journey run. No configuration is changed and no mail goes to a
 * real address.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { argParser, CLIENT_NAMES, COMBOS, localDate, minutes, PROTO, runFeatures, startPlatformServer, takeLock, WATCH_PORT, type FeatureRunResult, type PlatformServer } from "./ci-lib.js";
import { changeSections, clientName, compareRuns, loadTitleWords } from "./ci-history.js";
import { assignEdgeCases } from "./ci-backend-map.js";
import { closeSpineDb } from "../src/db/spineDb.js";

const args = argParser();
const OUT_DIR = join(PROTO, "data", "nightly");
const LOG_DIR = join(OUT_DIR, "logs");
const LOCK = join(OUT_DIR, ".lock");
const SERVER_PID = join(OUT_DIR, ".server.pid");

const clients = (args.list("--clients") ?? ["198678", "32461"]).map(Number).filter((n) => Number.isInteger(n) && n > 0);
const only = args.list("--only");
const unknown = (only ?? []).filter((n) => !COMBOS.some((c) => c.name === n));
if (unknown.length) {
  console.error(`unknown journey(s): ${unknown.join(", ")} — choose from ${COMBOS.map((c) => c.name).join(", ")}`);
  process.exit(2);
}
const combos = COMBOS.filter((c) => !only || only.includes(c.name));
const edges = args.get("--edges") !== "0";
const stageSeconds = Number(args.get("--stage-seconds") ?? 45);
const comboTimeoutMs = Number(args.get("--combo-timeout-min") ?? 45) * 60_000;
const totalTimeoutMs = Number(args.get("--total-timeout-min") ?? 360) * 60_000;
const port = args.get("--port") ? Number(args.get("--port")) : undefined;
if (port === WATCH_PORT) {
  console.error(`--port ${WATCH_PORT} is the owner's dashboard; pick another (or leave it out for a free one)`);
  process.exit(2);
}

// The edge / negative cases (EDGE-…): each feature's set runs once per client,
// on the journey that fits it — not six times over.
const edgeCases: Array<{ id: string; feature: string }> = [];
for (const f of ["api-cases.json", ...readdirSync(join(PROTO, "data", "api-cases-extra")).filter((n) => n.endsWith(".json")).map((n) => `api-cases-extra/${n}`)]) {
  try {
    const list = JSON.parse(readFileSync(join(PROTO, "data", f), "utf8"));
    for (const c of Array.isArray(list) ? list : (list.cases ?? [])) if (/^EDGE-/.test(c?.id ?? "") && !c.notRunnable) edgeCases.push({ id: c.id, feature: c.feature });
  } catch {
    /* ci:check reports a broken file; the nightly just runs without it */
  }
}
const { byCombo: edgePlan, unplaced: edgeUnplaced } = assignEdgeCases(edgeCases, combos);
const plan = clients.flatMap((c) =>
  combos.map((combo) => {
    const e = edgePlan.get(combo.name)!;
    return { company: c, combo, features: edges ? [...combo.features, ...e.features] : combo.features, cases: edges ? e.cases : [] };
  }),
);
console.log(`Nightly regression — ${plan.length} journey run(s): ${combos.map((c) => c.name).join(", ")} on ${clients.map((c) => `${CLIENT_NAMES[c] ?? c} (${c})`).join(", ")}${edges ? ", with edge cases" : ", journeys only"}`);
if (args.has("--dry-run")) {
  for (const p of plan) console.log(`  would run: ${clientName(p.company)} · ${p.combo.label}  [${p.features.join(", ")}] + ${p.cases.length} edge case(s)`);
  if (edges && edgeUnplaced.length) console.log(`  edge cases of ${edgeUnplaced.join(", ")} have no journey tonight (their journey is not in --only)`);
  process.exit(0);
}

// ── 1. one at a time ────────────────────────────────────────────────────────

mkdirSync(LOG_DIR, { recursive: true });
const lock = takeLock(LOCK, "nightly");
if (!lock.ok) {
  console.log(`Another nightly is already running (${lock.heldBy}) — nothing to do.`);
  process.exit(0);
}
// A server left behind by a nightly that was killed outright (kill -9, a
// reboot mid-run): its lock was stale, so its server is ours to stop.
if (existsSync(SERVER_PID)) {
  const old = Number(readFileSync(SERVER_PID, "utf8").trim());
  // Only if that pid is still OUR kind of process: after a reboot the number
  // may belong to something else entirely.
  let cmd = "";
  try {
    cmd = execFileSync("ps", ["-o", "command=", "-p", String(old)], { encoding: "utf8" }).trim();
  } catch {
    /* no such process */
  }
  if (old > 1 && /src\/server\.ts/.test(cmd)) {
    try {
      process.kill(-old, "SIGTERM");
      console.log(`Stopped a platform server (pid ${old}) left behind by an earlier nightly.`);
    } catch {
      /* already gone */
    }
  }
  rmSync(SERVER_PID, { force: true });
}

const startedAt = new Date();
const date = localDate(startedAt);
const serverLog = join(LOG_DIR, `${date}-server.log`);
let server: PlatformServer | undefined;
let finishing = false;

async function cleanup(): Promise<void> {
  if (server) await server.stop().catch(() => {});
  server = undefined;
  rmSync(SERVER_PID, { force: true });
  lock.ok && lock.release();
  await closeSpineDb().catch(() => {});
}
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => {
    console.log(`\n${sig} — stopping the platform server and releasing the lock.`);
    void cleanup().finally(() => process.exit(130));
  });
}
const hardStop = setTimeout(() => {
  if (finishing) return;
  console.log(`\nThe night's time limit (${minutes(totalTimeoutMs)}) is up — stopping.`);
  void cleanup().finally(() => process.exit(3));
}, totalTimeoutMs + 10 * 60_000); // the loop below stops starting journeys at totalTimeoutMs; this is the backstop
hardStop.unref();

async function ensureServer(): Promise<PlatformServer> {
  if (server) {
    try {
      const r = await fetch(`${server.base}/api/clients`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) return server;
    } catch {
      /* fall through: restart */
    }
    console.log("  the platform server stopped answering — restarting it");
    await server.stop().catch(() => {});
  }
  server = await startPlatformServer({ port, logFile: serverLog });
  if (server.pid) writeFileSync(SERVER_PID, String(server.pid));
  return server;
}

// ── 2–3. the journeys ───────────────────────────────────────────────────────

interface Ran {
  company: number;
  combo: string;
  label: string;
  result?: FeatureRunResult;
  skipped?: string;
}
const ran: Ran[] = [];
let exitCode = 0;
try {
  try {
    const s = await ensureServer();
    console.log(`Platform server up on port ${s.port} (log: ${serverLog.replace(PROTO + "/", "")})\n`);
  } catch (e) {
    console.error(`✗ could not start the platform server: ${(e as Error).message}`);
    exitCode = 1;
    throw e;
  }
  for (const p of plan) {
    const tag = `${clientName(p.company)} · ${p.combo.label}`;
    if (Date.now() - startedAt.getTime() > totalTimeoutMs) {
      ran.push({ company: p.company, combo: p.combo.name, label: p.combo.label, skipped: "the night's time limit was reached before it started" });
      continue;
    }
    console.log(`▶ ${tag}`);
    let s: PlatformServer;
    try {
      s = await ensureServer();
    } catch (e) {
      ran.push({ company: p.company, combo: p.combo.name, label: p.combo.label, skipped: `the platform server could not be started: ${(e as Error).message}` });
      continue;
    }
    if (p.cases.length) console.log(`  + ${p.cases.length} edge / negative case(s) after the journey`);
    // No edge cases for this journey → say so to the server (edges=0), or it
    // would run every remaining case of the ticked features instead.
    const go = (base: string) => runFeatures(base, p.company, p.features, { timeoutMs: comboTimeoutMs, stageSeconds, edges: p.cases.length > 0, cases: p.cases, onLine: (l) => console.log(l) });
    let r = await go(s.base);
    // The stream dropped before the run was saved (not a time-out): try once
    // more on a fresh server, so one lost connection does not cost the night.
    if (!r.runId && !r.timedOut && r.errors.length && Date.now() - startedAt.getTime() < totalTimeoutMs) {
      console.log(`  the run was cut off (${r.errors[0]}) — trying it once more on a fresh server`);
      if (server) await server.stop().catch(() => {});
      server = undefined;
      try {
        const first = r;
        r = await go((await ensureServer()).base);
        r.errors = [`first attempt cut off: ${first.errors[0]}`, ...r.errors];
      } catch (e) {
        r.errors.push(`retry could not start: ${(e as Error).message}`);
      }
    }
    ran.push({ company: p.company, combo: p.combo.name, label: p.combo.label, result: r });
    const checks = r.checks.total ? ` · cases ${r.checks.pass} passed, ${r.checks.fail} failed, ${r.checks.inconclusive} couldn't tell` : "";
    console.log(`  → ${r.timedOut ? `stopped after ${minutes(r.ms)} (time limit)` : (r.journeyOutcome ?? (r.errors[0] ? `did not finish: ${r.errors[0]}` : "finished"))}${checks} (${minutes(r.ms)})\n`);
    // A journey stopped mid-way may still be running inside the server; a
    // fresh server for the next one keeps the two from overlapping.
    if (r.timedOut && server) {
      await server.stop().catch(() => {});
      server = undefined;
    }
  }
} catch {
  /* reported above; the note below still gets written */
}

// ── 4–5. what changed, in words ─────────────────────────────────────────────

finishing = true;
const runIds = ran.map((r) => r.result?.runId).filter((x): x is string => !!x);
// Let the server's background copy into the database land before reading it.
await new Promise((r) => setTimeout(r, 3000));
await loadTitleWords();
const { compared, prev, counts, rows } = await compareRuns(runIds, startedAt);
const tookMs = Date.now() - startedAt.getTime();

const md: string[] = [];
const long = startedAt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
md.push(`# Nightly regression — ${long}`, "");
const finished = ran.filter((r) => r.result && !r.result.timedOut && r.result.runId).length;
const newly = counts["newly-broken"];
const headline =
  !runIds.length
    ? "No run was saved tonight, so nothing could be compared — see “How each journey went” for why."
    : newly
      ? `**${newly} check${newly === 1 ? "" : "s"} broke since last time.** ${counts.fixed} fixed, ${counts["still-broken"]} still broken from before, ${counts["broken-first-time"]} broken with nothing earlier to compare, ${counts.unclear} could not be judged.`
      : `**Nothing broke that worked last time.** ${counts.fixed} fixed, ${counts["still-broken"]} still broken from before, ${counts["broken-first-time"]} broken with nothing earlier to compare, ${counts.unclear} could not be judged.`;
md.push(
  headline,
  "",
  `${finished} of ${plan.length} journey run(s) finished on ${clients.map(clientName).join(" and ")} in ${minutes(tookMs)}. ` +
    `${rows.length} verdicts were compared with each check's previous result (from the ${prev.source}).`,
  "",
);
const { md: sections, details } = changeSections(compared, prev.track);
md.push(...sections);

md.push("## How each journey went", "", "| Client | Journey | Result | Cases (passed / failed / couldn't tell) | Time |", "|---|---|---|---|---|");
for (const r of ran) {
  const res = r.result;
  const outcome = r.skipped
    ? `Not run — ${r.skipped}`
    : res!.timedOut
      ? `Stopped at the time limit (${minutes(comboTimeoutMs)})`
      : !res!.runId
        ? `Cut off before its result was saved${res!.journeyOutcome ? ` (the journey itself: ${res!.journeyOutcome})` : ""} — not compared`
        : (res!.journeyOutcome ?? (res!.errors.length ? `Did not finish: ${res!.errors[0]}` : "Finished"));
  const cases = res?.checks.total ? `${res.checks.pass} / ${res.checks.fail} / ${res.checks.inconclusive}` : "—";
  md.push(`| ${clientName(r.company)} | ${r.label} | ${outcome.replace(/\|/g, "/")} | ${cases} | ${res ? minutes(res.ms) : "—"} |`);
}
md.push("");
md.push(
  "<details><summary>Details (run ids, case ids, how this was made)</summary>",
  "",
  `- Started ${startedAt.toISOString()}, took ${minutes(tookMs)}; journeys: ${combos.map((c) => c.name).join(", ")}; edge cases ${edges ? "on" : "off"}; bidding window ${stageSeconds} s.`,
  ...(edges ? combos.map((c) => `- ${c.name}: features \`${[...c.features, ...edgePlan.get(c.name)!.features].join(",")}\`, ${edgePlan.get(c.name)!.cases.length} edge case(s)`) : []),
  ...(edges && edgeUnplaced.length ? [`- edge cases with no journey in this run: ${edgeUnplaced.join(", ")}`] : []),
  `- Compared against each check's most recent pass/fail before tonight, from the ${prev.source}.`,
  ...ran.map((r) => `- ${r.company} ${r.combo}: run \`${r.result?.runId ?? "none"}\`${r.result?.errors.length ? ` — errors: ${r.result.errors.map((e) => e.slice(0, 160)).join(" | ")}` : ""}`),
  `- Open a run in the dashboard (Recent runs), or \`data/runs/<run id>.json\`.`,
  "",
  ...details,
  "</details>",
  "",
);

mkdirSync(OUT_DIR, { recursive: true });
let base = join(OUT_DIR, date);
for (let n = 2; existsSync(`${base}.md`); n++) base = join(OUT_DIR, `${date}-${n}`);
writeFileSync(`${base}.md`, md.join("\n"));
writeFileSync(
  `${base}.json`,
  JSON.stringify(
    {
      startedAt: startedAt.toISOString(),
      tookMs,
      clients,
      combos: combos.map((c) => c.name),
      edges,
      comparedWith: prev.source,
      counts,
      runs: ran.map((r) => ({ company: r.company, combo: r.combo, label: r.label, skipped: r.skipped, runId: r.result?.runId, outcome: r.result?.journeyOutcome, timedOut: r.result?.timedOut, checks: r.result?.checks, errors: r.result?.errors, ms: r.result?.ms })),
      changes: compared
        .filter((c) => c.change !== "still-good" && c.change !== "new-good")
        .map((c) => ({ change: c.change, kind: c.row.kind, caseId: c.row.case_id, feature: c.row.feature, company: c.row.company_id, title: c.row.title, verdict: c.row.verdict, previous: c.previous, runId: c.row.run_id })),
    },
    null,
    2,
  ),
);
console.log(`\n${headline.replace(/\*\*/g, "")}\nWrote ${base.replace(PROTO + "/", "")}.md`);

await cleanup();
clearTimeout(hardStop);
process.exit(exitCode);
