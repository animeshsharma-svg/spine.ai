/**
 * Shared pieces for the CI / nightly / backend-watch scripts.
 *
 *   ci-check.ts      — the offline checks GitHub Actions runs on every push
 *   nightly.ts       — the live regression against UAT, run on this machine
 *   backend-watch.ts — new procol-backend commits → targeted runs
 *
 * Everything here is either pure (and unit-tested in ci-unit-tests.ts) or a
 * small, careful wrapper around a process: a lock file, a platform server on
 * a free port, a streamed feature run. Nothing here ever talks to :4300 — the
 * owner's `tsx watch` dashboard restarts on every edit and would kill a run.
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
/** prototype/ */
export const PROTO = join(here, "..");
/** the repository root (procol/) */
export const REPO = join(PROTO, "..");
export const PROCOL_TEST = join(REPO, "procol test");
export const BACKEND = join(REPO, "procol-backend");

/** The owner's dashboard. Never started, stopped or called by these scripts. */
export const WATCH_PORT = 4300;

// ── arguments ───────────────────────────────────────────────────────────────

export function argParser(argv = process.argv.slice(2)) {
  const get = (k: string): string | undefined => {
    const i = argv.indexOf(k);
    if (i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) return argv[i + 1];
    const eq = argv.find((a) => a.startsWith(`${k}=`));
    return eq ? eq.slice(k.length + 1) : undefined;
  };
  const has = (k: string): boolean => argv.includes(k) || argv.some((a) => a.startsWith(`${k}=`));
  const list = (k: string): string[] | undefined =>
    get(k)
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return { get, has, list, argv };
}

// ── time ────────────────────────────────────────────────────────────────────

/** Local calendar date, YYYY-MM-DD — the file name a person looks for. */
export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function minutes(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m} min` : `${(m / 60).toFixed(1)} h`;
}

// ── single-instance lock ────────────────────────────────────────────────────

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Take an exclusive lock file, or say who holds it.
 *
 * A lock left behind by a crashed run (its pid is gone) is taken over; a lock
 * whose owner is still alive is respected, so launchd firing a second nightly
 * while the first is still on its fourth journey does nothing.
 */
export function takeLock(file: string, label: string): { ok: true; release: () => void } | { ok: false; heldBy: string } {
  mkdirSync(dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(file, "wx");
      writeSync(fd, JSON.stringify({ pid: process.pid, label, since: new Date().toISOString() }));
      closeSync(fd);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        try {
          const cur = JSON.parse(readFileSync(file, "utf8"));
          if (cur.pid === process.pid) rmSync(file, { force: true });
        } catch {
          /* already gone */
        }
      };
      return { ok: true, release };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      let holder: { pid?: number; since?: string; label?: string } = {};
      try {
        holder = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        /* half-written lock: treat as stale */
      }
      if (holder.pid && pidAlive(holder.pid)) return { ok: false, heldBy: `pid ${holder.pid} (${holder.label ?? "?"}, since ${holder.since ?? "?"})` };
      rmSync(file, { force: true }); // stale — its owner died
    }
  }
  return { ok: false, heldBy: "could not take the lock" };
}

/** Who holds a lock right now, or undefined when nobody (or a dead process) does. */
export function lockHolder(file: string): string | undefined {
  try {
    const h = JSON.parse(readFileSync(file, "utf8"));
    return h?.pid && pidAlive(h.pid) ? `pid ${h.pid} (${h.label ?? "?"}, since ${h.since ?? "?"})` : undefined;
  } catch {
    return undefined;
  }
}

// ── a platform server of our own ────────────────────────────────────────────

/** A free TCP port that is not the owner's dashboard. */
export async function freePort(preferred?: number): Promise<number> {
  const tryPort = (p: number) =>
    new Promise<number | null>((resolve) => {
      const s = createServer();
      s.once("error", () => resolve(null));
      s.listen(p, "127.0.0.1", () => {
        const got = (s.address() as { port: number }).port;
        s.close(() => resolve(got));
      });
    });
  if (preferred && preferred !== WATCH_PORT) {
    const p = await tryPort(preferred);
    if (p) return p;
  }
  for (;;) {
    const p = await tryPort(0);
    if (p && p !== WATCH_PORT) return p;
  }
}

export interface PlatformServer {
  port: number;
  base: string;
  /** the server's process-group id (it is started detached) */
  pid?: number;
  stop: () => Promise<void>;
}

/**
 * Start `tsx src/server.ts` (NOT `tsx watch`) on a port of its own, and wait
 * until it answers. Its output goes to `logFile`, not to the console: the
 * server logs requests, and a log is where a stray credential would land, so
 * it stays in a git-ignored folder.
 */
export async function startPlatformServer(opts: { port?: number; logFile: string; readyTimeoutMs?: number }): Promise<PlatformServer> {
  const port = await freePort(opts.port);
  if (port === WATCH_PORT) throw new Error(`refusing to use port ${WATCH_PORT} — that is the owner's dashboard`);
  mkdirSync(dirname(opts.logFile), { recursive: true });
  const log = createWriteStream(opts.logFile, { flags: "a" });
  log.write(`\n── server start ${new Date().toISOString()} on port ${port}\n`);
  const tsx = join(PROTO, "node_modules", ".bin", "tsx");
  const child: ChildProcess = spawn(tsx, ["src/server.ts"], {
    cwd: PROTO,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // its own process group, so stop() takes tsx's child with it
  });
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  let exited: number | null = null;
  child.once("exit", (code) => {
    exited = code ?? -1;
    log.write(`── server exited (${code})\n`);
  });

  const base = `http://127.0.0.1:${port}`;
  const stop = async () => {
    if (exited !== null || !child.pid) return;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* gone */
    }
    const t0 = Date.now();
    while (exited === null && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 100));
    if (exited === null) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* gone */
      }
    }
    log.end();
  };

  const deadline = Date.now() + (opts.readyTimeoutMs ?? 120_000);
  while (Date.now() < deadline) {
    if (exited !== null) throw new Error(`the platform server exited during start-up (code ${exited}) — see ${opts.logFile}`);
    try {
      const r = await fetch(`${base}/api/clients`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return { port, base, pid: child.pid, stop };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await stop();
  throw new Error(`the platform server did not answer within ${Math.round((opts.readyTimeoutMs ?? 120_000) / 1000)} s — see ${opts.logFile}`);
}

// ── one streamed feature run ────────────────────────────────────────────────

export interface FeatureRunResult {
  runId?: string;
  ok: boolean;
  timedOut: boolean;
  /** the journey's own one-line verdict, when the features include a journey */
  journeyOutcome?: string;
  journeyLabel?: string;
  steps: Array<{ n: number; title: string; verdict: string }>;
  checks: { total: number; pass: number; fail: number; inconclusive: number };
  errors: string[];
  ms: number;
}

/**
 * Run features through the platform's own /api/features-run and follow its
 * event stream to the end — exactly what the dashboard's Run button does, so
 * the run is saved (data/runs + spine DB) by the server's own saveRun.
 */
export async function runFeatures(
  base: string,
  company: number,
  features: string[],
  opts: { timeoutMs: number; stageSeconds?: number; edges?: boolean; cases?: string[]; onLine?: (s: string) => void },
): Promise<FeatureRunResult> {
  const out: FeatureRunResult = { ok: false, timedOut: false, steps: [], checks: { total: 0, pass: 0, fail: 0, inconclusive: 0 }, errors: [], ms: 0 };
  const q = new URLSearchParams({ c: String(company), features: features.join(","), stageSeconds: String(opts.stageSeconds ?? 45) });
  if (opts.edges === false) q.set("edges", "0");
  if (opts.cases?.length) q.set("cases", opts.cases.join(","));
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const res = await fetch(`${base}/api/features-run?${q}`, { signal: ctrl.signal });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let event = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trimEnd();
        buf = buf.slice(i + 1);
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) {
          let d: any;
          try {
            d = JSON.parse(line.slice(5));
          } catch {
            continue;
          }
          if (event === "journey-step") {
            const s = d.step;
            out.steps.push({ n: s.n, title: s.title, verdict: s.verdict });
            opts.onLine?.(`    ${String(s.n).padStart(2)}. ${String(s.verdict).padEnd(8)} ${s.title}`);
          } else if (event === "journey") {
            out.journeyOutcome = d.journey?.outcome;
            out.journeyLabel = d.journey?.label;
          } else if (event === "check") {
            const c = d.check ?? {};
            out.checks.total++;
            if (c.inconclusive) out.checks.inconclusive++;
            else if (c.pass) out.checks.pass++;
            else out.checks.fail++;
            if (out.checks.total % 25 === 0) opts.onLine?.(`    … ${out.checks.total} case(s) done (${out.checks.pass} passed, ${out.checks.fail} failed, ${out.checks.inconclusive} couldn't tell)`);
          } else if (event === "done") {
            out.runId = d.runId;
            out.ok = !!d.ok;
          } else if (event === "run-error" || event === "fatal") {
            out.errors.push(String(d.message ?? d.line ?? "unknown error"));
          }
        }
      }
    }
  } catch (e) {
    if (ctrl.signal.aborted) out.timedOut = true;
    else {
      const cause = (e as { cause?: { code?: string; message?: string } }).cause;
      out.errors.push(`${(e as Error).message}${cause ? ` (${cause.code ?? ""} ${cause.message ?? ""})`.replace(/\(\s+/, "(") : ""} after ${out.steps.length} step(s) and ${out.checks.total} case(s)`);
    }
  } finally {
    clearTimeout(timer);
    out.ms = Date.now() - t0;
  }
  return out;
}

// ── git, read-only ──────────────────────────────────────────────────────────

/** Run git and return stdout. Only ever called with read-only subcommands, except `fetchBackend`. */
export function git(cwd: string, args: string[], maxBuffer = 64 * 1024 * 1024): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer, stdio: ["ignore", "pipe", "pipe"] });
}

export function exists(p: string): boolean {
  return existsSync(p);
}

// ── the nightly's comparison: tonight against each check's previous result ──

export type Verdict = string;
const GOOD = new Set(["pass", "worked"]);
const BAD = new Set(["fail", "broken", "refused"]);
export const isGood = (v: Verdict | undefined) => !!v && GOOD.has(v);
export const isBad = (v: Verdict | undefined) => !!v && BAD.has(v);

export interface ResultLike {
  company_id: number | null;
  kind: string;
  case_id: string;
  feature: string | null;
  title: string | null;
  verdict: string;
  reason: string | null;
  run_id?: string;
}

/**
 * The identity of a check across runs. A journey step's id is its step kind
 * (`create_draft`), which every event type has — so a step is keyed by its
 * event type too: "create the draft" on an RFP-only event is not the same
 * check as on an RFQ-only one.
 */
export function resultKey(r: Pick<ResultLike, "company_id" | "kind" | "case_id" | "feature">): string {
  return [r.company_id ?? "", r.kind, r.case_id, r.kind === "journey-step" ? (r.feature ?? "") : ""].join("|");
}

export type Change = "newly-broken" | "still-broken" | "broken-first-time" | "fixed" | "still-good" | "new-good" | "unclear";

export function classifyChange(tonight: Verdict, previous: Verdict | undefined): Change {
  if (isBad(tonight)) {
    if (previous === undefined) return "broken-first-time";
    return isGood(previous) ? "newly-broken" : isBad(previous) ? "still-broken" : "broken-first-time";
  }
  if (isGood(tonight)) {
    if (isBad(previous)) return "fixed";
    return previous === undefined ? "new-good" : "still-good";
  }
  return "unclear"; // inconclusive / not-run — never counted as a pass
}

export interface Compared<R extends ResultLike = ResultLike> {
  row: R;
  previous?: { verdict: string; at?: string; run_id?: string };
  change: Change;
}

/** Tonight's rows, each set against the most recent earlier result for the same check. */
export function compareResults<R extends ResultLike>(
  tonight: R[],
  previous: Map<string, { verdict: string; at?: string; run_id?: string }>,
): Compared<R>[] {
  return tonight.map((row) => {
    const prev = previous.get(resultKey(row));
    return { row, previous: prev, change: classifyChange(row.verdict, prev?.verdict) };
  });
}

/** Group counts by change, for the headline. */
export function tally(list: Array<{ change: Change }>): Record<Change, number> {
  const t: Record<Change, number> = { "newly-broken": 0, "still-broken": 0, "broken-first-time": 0, fixed: 0, "still-good": 0, "new-good": 0, unclear: 0 };
  for (const c of list) t[c.change]++;
  return t;
}

/** Keep a sentence readable in a report line: one line, clipped. */
export function oneLine(s: string | null | undefined, max = 220): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// ── the case library's shape (ci-check's case-data check) ────────────────────

/**
 * The placeholders a run knows how to fill, read out of caseLibrary.ts itself
 * so this list can never drift from the one the runner uses.
 */
export function knownPlaceholders(): Set<string> {
  const src = readFileSync(join(PROTO, "src", "checks", "caseLibrary.ts"), "utf8");
  const m = src.match(/const KNOWN_PLACEHOLDERS = new Set\(\[([\s\S]*?)\]\)/);
  if (!m) throw new Error("could not find KNOWN_PLACEHOLDERS in src/checks/caseLibrary.ts");
  return new Set([...m[1].replace(/\/\/[^\n]*/g, "").matchAll(/"(\w+)"/g)].map((x) => x[1]));
}

const EXPECTED = new Set(["accept", "reject", "no-5xx"]);
const METHODS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE"]);

export function validateCases(
  files: Array<{ name: string; text: string }>,
  known: Set<string>,
  featureIds: Set<string>,
): { errors: string[]; notes: string[]; count: number } {
  const errors: string[] = [];
  const notes: string[] = [];
  const seen = new Map<string, string>();
  let count = 0;
  for (const f of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(f.text);
    } catch (e) {
      errors.push(`${f.name}: not valid JSON — ${(e as Error).message}`);
      continue;
    }
    const list = Array.isArray(parsed) ? parsed : (parsed as any)?.cases;
    if (!Array.isArray(list)) {
      errors.push(`${f.name}: expected a list of cases (or { "cases": [...] })`);
      continue;
    }
    list.forEach((c: any, i: number) => {
      count++;
      const at = `${f.name} #${i + 1}${c?.id ? ` (${c.id})` : ""}`;
      if (!c || typeof c !== "object") return void errors.push(`${at}: not an object`);
      for (const k of ["id", "feature", "title", "method", "path", "expected", "expectedResult"])
        if (typeof c[k] !== "string" || !c[k].trim()) errors.push(`${at}: "${k}" is missing or empty`);
      if (typeof c.id === "string") {
        const prev = seen.get(c.id);
        if (prev) errors.push(`${at}: id ${c.id} is used twice (also in ${prev})`);
        else seen.set(c.id, f.name);
      }
      if (c.expected !== undefined && !EXPECTED.has(c.expected)) errors.push(`${at}: expected is "${c.expected}" — must be accept, reject or no-5xx`);
      if (typeof c.method === "string" && !METHODS.has(c.method)) errors.push(`${at}: method "${c.method}" is not an HTTP method the runner sends`);
      if (typeof c.path === "string" && !c.path.startsWith("/")) errors.push(`${at}: path must start with "/" (it is relative to the API base)`);
      if (typeof c.feature === "string" && featureIds.size && !featureIds.has(c.feature))
        errors.push(`${at}: feature "${c.feature}" is not in config/featureTree.ts, so no run would ever pick this case`);
      if (c.body !== undefined && (c.body === null || typeof c.body !== "object")) errors.push(`${at}: body must be a JSON object or array when present`);
      const unknown = [...new Set([...JSON.stringify({ p: c.path, b: c.body }).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).filter((n) => !known.has(n)))];
      if (unknown.length) {
        if (typeof c.notRunnable === "string" && c.notRunnable.trim())
          notes.push(`${at}: uses ${unknown.map((n) => `{{${n}}}`).join(", ")} — marked not runnable on purpose`);
        else
          errors.push(
            `${at}: uses ${unknown.map((n) => `{{${n}}}`).join(", ")}, which no run can fill in — so it would silently never run. ` +
              `Either add the name to KNOWN_PLACEHOLDERS in src/checks/caseLibrary.ts (and fill it in the runner) or give the case a "notRunnable" reason.`,
          );
      }
    });
  }
  return { errors, notes, count };
}

// ── the six event journeys (same set as scripts/capture-journey-samples.ts) ──

export interface Combo {
  name: string;
  /** what a person calls it */
  label: string;
  features: string[];
}

export const COMBOS: Combo[] = [
  { name: "rfq_full", label: "RFQ with counter offer, conversion to auction and a new version", features: ["events.rfq_only", "bids.counter_offer", "auction.convert", "events.versioning"] },
  { name: "rfp_only", label: "Technical (RFP) round only", features: ["events.rfp_only"] },
  { name: "rfp_rfq", label: "Technical round, then RFQ", features: ["events.rfp_rfq"] },
  { name: "rfp_auction", label: "Technical round, then auction", features: ["events.rfp_auction"] },
  { name: "rfq_surrogate", label: "RFQ with a surrogate bid", features: ["events.rfq_only", "bids.surrogate"] },
  { name: "rfp_rfq_surrogate", label: "Technical round, then RFQ, with a surrogate bid", features: ["events.rfp_rfq", "bids.surrogate"] },
];

/** Known client names, so a report never says "company 198678". */
export const CLIENT_NAMES: Record<number, string> = { 198678: "PROCOL DEMO", 32461: "Demo Account 2", 39490: "M/s Moon Beverages", 47053: "GMMCO LIMITED" };
