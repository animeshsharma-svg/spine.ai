/**
 * Link the results of the special runners to their catalog cases.
 *
 * The round-3 runner (scripts/run-deep3.ts → data/runs/deep3/*.json) and the
 * bid-number integrity runner (scripts/run-integrity.ts → data/runs/integrity/*.json)
 * decide catalog cases (API-EVD…, EVI-…) but write their own result files, so
 * the coverage report and the dashboard showed those cases as "never run".
 * This saves each file as a normal run whose check results carry the catalog
 * case id (flowId "api-plan" → counted as `plan:<case id>`, metrics.ts).
 *
 * One run per runner and client (fixed id, so re-running replaces it). Each
 * case takes its LATEST result across that client's files; runs that were
 * thrown away (cut by the network outage, an early partial run) are skipped
 * (EXCLUDE). "not run" verdicts are left out — they are not results.
 *
 *   npx tsx scripts/link-special-runs.ts            link every file
 *   npx tsx scripts/link-special-runs.ts --dry      say what would be linked
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { saveRun, whenRunsSaved } from "../src/runStore.js";
import { closeSpineDb } from "../src/db/spineDb.js";

const here = dirname(fileURLToPath(import.meta.url));
const RUNS = join(here, "..", "data", "runs");
const DRY = process.argv.includes("--dry");

const SOURCES = [
  { dir: "deep3", label: "Deep-dig round 3 (award outcomes, award → PO, competition)" },
  { dir: "integrity", label: "Bid-number integrity (independent recalculation)" },
] as const;

type Verdict = "passed" | "failed" | "couldn't tell" | "not run";
const linked: Record<string, number> = {};

// Runs that were discarded by the runners themselves (see their reports).
const EXCLUDE = new Set([
  "deep3/198678-2026-10-03T13-04-58-892Z.json", // early partial run, superseded the same hour
  "deep3/32461-2026-10-03T17-44-29-414Z.json", // cut by the network outage (ENOTFOUND), re-run in full
  "integrity/198678-2026-10-03T13-30-28-048Z.json", // cut by the network outage, re-run on fresh events
]);

for (const src of SOURCES) {
  const dir = join(RUNS, src.dir);
  if (!existsSync(dir)) continue;
  const byCompany = new Map<string, { latest: Map<string, any>; company: any; ts: string; files: string[] }>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    if (EXCLUDE.has(`${src.dir}/${f}`)) continue;
    let d: any;
    try {
      d = JSON.parse(readFileSync(join(dir, f), "utf8"));
    } catch {
      continue;
    }
    const cases: Record<string, any> = d?.cases && typeof d.cases === "object" && !Array.isArray(d.cases) ? d.cases : {};
    const key = String(d.companyId ?? d.company?.id ?? f.split("-")[0]);
    const g = byCompany.get(key) ?? { latest: new Map<string, any>(), company: d.company, ts: "", files: [] as string[] };
    // files sort by time, so a later file's verdict replaces an earlier one
    for (const [caseId, c] of Object.entries(cases)) if (["passed", "failed", "couldn't tell"].includes(c?.verdict)) g.latest.set(caseId, c);
    g.ts = String(d.finishedAt ?? d.startedAt ?? g.ts);
    g.files.push(f);
    byCompany.set(key, g);
  }
  for (const [companyId, g] of byCompany) {
    const rows = [...g.latest].map(([caseId, c]) => {
      const lines: any[] = c.steps ?? c.evidence ?? [];
      const why = lines.find((x) => x?.verdict === c.verdict)?.actual ?? lines[0]?.actual ?? "";
      return {
        id: caseId, flowId: "api-plan", module: "API plan", scenario: String(c.title ?? lines[0]?.title ?? caseId),
        type: "functional", category: src.label, priority: "P2", severity: "Medium", expected: "see the case",
        inconclusive: c.verdict === "couldn't tell", layer: "api", inputSummary: `${src.dir} runner`,
        httpStatus: null, accepted: c.verdict === "passed", message: null, durationMs: 0,
        pass: c.verdict === "passed", verdict: `${c.verdict} — ${String(why).slice(0, 400)}`,
      };
    });
    if (!rows.length) continue;
    const runId = `linked-${src.dir}-${companyId}`;
    linked[`${src.dir} ${companyId}`] = rows.length;
    if (DRY) {
      console.log(`${runId}: ${rows.length} case(s) from ${g.files.join(", ")}`);
      continue;
    }
    saveRun({
      id: runId,
      ts: g.ts || new Date().toISOString(),
      request: `${src.label} — results linked to the catalog`,
      companyId: Number(companyId) || undefined,
      companyName: typeof g.company === "string" ? g.company : g.company?.name ?? null,
      provider: "none",
      durationMs: 0,
      report: undefined,
      events: [{ seq: 1, agent: "System", status: "done", title: "linked results", data: { sources: g.files.map((x) => `data/runs/${src.dir}/${x}`) }, ts: g.ts }],
      flowResults: [],
      validationResults: [],
      checkResults: rows as any,
    } as any);
  }
}

console.log(`${DRY ? "would link" : "linked"}: ${Object.entries(linked).map(([k, v]) => `${k} ${v}`).join(", ") || "nothing"}`);
await whenRunsSaved(60_000);
await closeSpineDb();
process.exit(0);
