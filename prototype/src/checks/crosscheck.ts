/**
 * UI ↔ API CROSS-CHECK — the platform side.
 *
 * The browser part lives in procol-ui-tests (tests/crosscheck.spec.ts): it opens
 * an event's screens, records every API response each screen was built from,
 * reads the screen, and writes one record per run to
 *   procol-ui-tests/findings/crosscheck/<runId>/result.json
 * with screenshots and the (token-masked) network capture beside it.
 *
 * This module reads those records for the dashboard and starts new runs. It
 * never decides a verdict itself — the spec's deterministic maps did that.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireBrowser, setSlotProgress } from "../ui/browserSlot.js";

const here = dirname(fileURLToPath(import.meta.url));
export const UI_TESTS_DIR = resolve(here, "..", "..", "..", "procol-ui-tests");
export const CROSSCHECK_DIR = join(UI_TESTS_DIR, "findings", "crosscheck");
const MAPS_DIR = join(UI_TESTS_DIR, "src", "crosscheck", "maps");
const CATALOG = resolve(here, "..", "..", "..", "test-cases", "ui-api-crosscheck.md");

export interface CrossRunSummary {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  companyId: number | null;
  event: { uuid: string; title?: string; ref?: string };
  verdict: "passed" | "failed" | "inconclusive";
  summary: string;
  cases: Array<{ case: string; verdict: string }>;
  findings: number;
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Every recorded run, newest first. Falls back to scanning when the index is missing. */
export function listCrossRuns(limit = 50): CrossRunSummary[] {
  const index = readJson<CrossRunSummary[]>(join(CROSSCHECK_DIR, "index.json"));
  let runs = index ?? [];
  if (!index && existsSync(CROSSCHECK_DIR)) {
    runs = readdirSync(CROSSCHECK_DIR)
      .filter((d) => existsSync(join(CROSSCHECK_DIR, d, "result.json")))
      .map((d) => readJson<any>(join(CROSSCHECK_DIR, d, "result.json")))
      .filter(Boolean)
      .map((r) => ({
        runId: r.runId,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        companyId: r.companyId,
        event: r.event,
        verdict: r.verdict,
        summary: r.summary,
        cases: (r.cases ?? []).map((c: any) => ({ case: c.case, verdict: c.verdict })),
        findings: (r.findings ?? []).length,
      }));
  }
  return [...runs].sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt))).slice(0, limit);
}

const SAFE_ID = /^[A-Za-z0-9_.-]{1,80}$/;

/** One run's full record. `items: false` drops per-field rows to keep the payload small. */
export function readCrossRun(runId: string, opts: { items?: boolean } = {}): unknown | null {
  if (!SAFE_ID.test(runId)) return null;
  const rec = readJson<any>(join(CROSSCHECK_DIR, runId, "result.json"));
  if (!rec) return null;
  if (opts.items === false) {
    for (const c of rec.cases ?? []) for (const r of c.results ?? []) delete r.items;
    delete rec.discovered;
  }
  return rec;
}

/** A file inside a run folder (screenshot, screen text, network capture), path-checked. */
export function crossRunFile(runId: string, rel: string): string | null {
  if (!SAFE_ID.test(runId)) return null;
  const base = join(CROSSCHECK_DIR, runId);
  const full = normalize(join(base, rel));
  if (!full.startsWith(base + "/") || !existsSync(full) || !statSync(full).isFile()) return null;
  return full;
}

/** The reviewed maps and the latest discovery per screen. */
export function readCrossMaps(): { maps: unknown[]; discovered: Record<string, unknown> } {
  const maps = existsSync(MAPS_DIR)
    ? readdirSync(MAPS_DIR).filter((f) => f.endsWith(".json")).sort().map((f) => readJson(join(MAPS_DIR, f))).filter(Boolean)
    : [];
  const ddir = join(MAPS_DIR, "discovered");
  const discovered: Record<string, unknown> = {};
  if (existsSync(ddir)) for (const f of readdirSync(ddir).filter((x) => x.endsWith(".json"))) discovered[f.replace(/\.json$/, "")] = readJson(join(ddir, f));
  return { maps, discovered };
}

/** The written cases (id, title, section, priority, verdict), from the catalog file itself. */
export function crossCases(): Array<{ id: string; title: string; section: string; priority: string; automation: string }> {
  if (!existsSync(CATALOG)) return [];
  const out: Array<{ id: string; title: string; section: string; priority: string; automation: string }> = [];
  let section = "";
  let cur: { id: string; title: string; section: string; priority: string; automation: string } | null = null;
  for (const line of readFileSync(CATALOG, "utf8").split("\n")) {
    const sec = line.match(/^##\s+\d+\.\s+(.+)$/);
    if (sec) section = sec[1].trim();
    const head = line.match(/^#{3,4}\s+(UI-XCHK-\d+)\s+[—–-]\s+(.+)$/);
    if (head) {
      cur = { id: head[1], title: head[2].trim(), section, priority: "P2", automation: "automate" };
      out.push(cur);
    }
    const trace = line.match(/^-\s+\*\*Trace\.\*\*\s+(.*)$/);
    if (trace && cur) {
      cur.priority = trace[1].match(/\bP[0-3]\b/)?.[0] ?? "P2";
      cur.automation = /automate-later/.test(trace[1]) ? "automate-later" : /manual/.test(trace[1]) ? "manual" : "automate";
    }
  }
  return out;
}

// ── starting a run ──────────────────────────────────────────────────────────
export interface CrossRunState {
  runId: string;
  state: "queued" | "running" | "finished" | "failed";
  startedAt: string;
  finishedAt?: string;
  lastLine?: string;
  exitCode?: number | null;
  error?: string;
}

const RUNS = new Map<string, CrossRunState>();

export function crossRunState(runId: string): CrossRunState | null {
  return RUNS.get(runId) ?? null;
}

/**
 * Start a cross-check for one event. Read-only by construction: the spec is
 * given an existing event and never CROSSCHECK_CREATE from here, so a click in
 * the dashboard cannot publish an event or invite anyone.
 */
export function startCrossRun(opts: { companyId: number; event: string; cases?: string[]; headed?: boolean }): CrossRunState {
  const runId = `xchk-${Date.now().toString(36)}`;
  const st: CrossRunState = { runId, state: "queued", startedAt: new Date().toISOString() };
  RUNS.set(runId, st);
  const { ready } = acquireBrowser(`cross-check ${opts.event}`);
  void ready.then((release) => {
    st.state = "running";
    const args = ["playwright", "test", "tests/crosscheck.spec.ts", "--project=chromium", "--no-deps", "--workers=1", "--reporter=line"];
    if (opts.headed) args.push("--headed");
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      COMPANY_ID: String(opts.companyId),
      CROSSCHECK_EVENT: opts.event,
      QA_RUN_ID: runId,
    };
    delete env.CROSSCHECK_CREATE;
    if (opts.cases?.length) env.CROSSCHECK_CASES = opts.cases.join(",");
    let child;
    try {
      child = spawn("npx", args, { cwd: UI_TESTS_DIR, env, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      st.state = "failed";
      st.error = (e as Error).message;
      release();
      return;
    }
    const onLine = (buf: Buffer) => {
      for (const line of buf.toString().split("\n")) {
        const l = line.trim();
        if (l.startsWith("[crosscheck]")) {
          st.lastLine = l.slice(13, 300);
          setSlotProgress(st.lastLine);
        }
      }
    };
    child.stdout?.on("data", onLine);
    child.stderr?.on("data", onLine);
    child.on("close", (code) => {
      st.exitCode = code;
      st.finishedAt = new Date().toISOString();
      st.state = existsSync(join(CROSSCHECK_DIR, runId, "result.json")) ? "finished" : "failed";
      if (st.state === "failed") st.error ??= `the run ended (exit ${code}) without writing a result`;
      release();
    });
  });
  return st;
}
