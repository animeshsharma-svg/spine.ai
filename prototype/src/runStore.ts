/**
 * RUN STORE — the platform's own small memory.
 *
 * Every QA run is saved to disk (data/runs/*.json): the request, the client,
 * the AI provider, the full agent trace, the flow + validation results, and the
 * final report. This is the platform's "own database" — separate from Procol's
 * — so past runs can be listed and re-opened without re-running anything.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentEvent, Report, CheckResult } from "./ai/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = join(here, "..", "data", "runs");

export interface RunRecord {
  id: string;
  ts: string;
  request: string;
  companyId: number;
  companyName: string | null;
  provider: string;
  durationMs: number;
  report: Report | undefined;
  events: AgentEvent[];
  flowResults: any[];
  validationResults: any[];
  checkResults?: CheckResult[];
}

export interface RunSummary {
  id: string;
  ts: string;
  request: string;
  companyName: string | null;
  headline: string;
  passed: number;
  failed: number;
  findings: number;
  mismatches: number;
  provider: string;
}

function ensureDir() {
  if (!existsSync(RUNS_DIR)) mkdirSync(RUNS_DIR, { recursive: true });
}

/** A sortable, filesystem-safe id: 2026-09-02T12-30-05-123Z */
export function newRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function saveRun(rec: RunRecord): void {
  ensureDir();
  writeFileSync(join(RUNS_DIR, `${rec.id}.json`), JSON.stringify(rec, null, 0));
}

export function getRun(id: string): RunRecord | null {
  const safe = id.replace(/[^0-9a-zA-Z_-]/g, "");
  const file = join(RUNS_DIR, `${safe}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as RunRecord;
}

/** Newest first. */
export function listRuns(limit = 20): RunSummary[] {
  ensureDir();
  const files = readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit);
  const out: RunSummary[] = [];
  for (const f of files) {
    try {
      const r = JSON.parse(readFileSync(join(RUNS_DIR, f), "utf8")) as RunRecord;
      out.push({
        id: r.id,
        ts: r.ts,
        request: r.request,
        companyName: r.companyName,
        headline: r.report?.headline ?? "—",
        passed: r.report?.passed ?? 0,
        failed: r.report?.failed ?? 0,
        findings: r.report?.findings?.length ?? 0,
        mismatches: (r.validationResults ?? []).filter((v: any) => v.mismatch).length,
        provider: r.provider,
      });
    } catch {
      /* skip a corrupt file */
    }
  }
  return out;
}
