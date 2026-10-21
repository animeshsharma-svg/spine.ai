/**
 * Measure the agent: run the eval dataset (src/eval/dataset.ts) through the real agent k times
 * on fresh records, plant known bugs (src/eval/mutate.ts), and write a versioned report with
 * every metric, its sample size, its 95% interval and the case ids behind it (docs/METRICS.md).
 *
 *   npx tsx scripts/eval-agent.ts [--k 3] [--plant-k 1] [--candidates 10] [--only A,B] [--c 198678]
 *   --no-plants     skip planted bugs        --no-gate-exit  exit 0 even when a gate fails
 * Reports: data/eval/reports/<time>-<agent>.json and .md. QA vendors only; runs are not saved
 * to run history (planted failures must never look like real ones there).
 */
import { config } from "dotenv";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
const { buildDataset } = await import("../src/eval/dataset.js");
const { plantsFor, mutatorFor } = await import("../src/eval/mutate.js");
const M = await import("../src/eval/metrics.js");
const { runApiPlan, setResponseMutator } = await import("../src/checks/apiPlanRunner.js");
const { openClientContext } = await import("../src/executor.js");
const { usageReport } = await import("../src/ai/llm.js");
const { spineDb } = await import("../src/db/spineDb.js");

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (k: string) => process.argv.includes(`--${k}`);
const K = Math.max(1, Number(arg("k") ?? 3));
const PLANT_K = Math.max(1, Number(arg("plant-k") ?? 1));
const CANDIDATES = Math.max(0, Number(arg("candidates") ?? 10));
const COMPANY = Number(arg("c") ?? 198678);
const ONLY = arg("only")?.split(",").map((s) => s.trim()).filter(Boolean);
const OUT = join(here, "..", "data", "eval", "reports");
const CONFIG = join(here, "..", "data", "eval", "config.json");
const ESCAPED = join(here, "..", "data", "eval", "escaped-bugs.json");
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

const cfg = existsSync(CONFIG)
  ? JSON.parse(readFileSync(CONFIG, "utf8"))
  : {
      weights: { f05: 25, ddp: 15, mutation: 10, passk: 15, steady: 10, time: 10, cost: 5, dora: 10 },
      thresholds: { timeP90Ms: 300000, costUsdPerRun: 1 },
      gates: [
        { key: "precision_real", op: ">=", threshold: 0.85 },
        { key: "pass^k", op: ">=", threshold: 0.9 },
        { key: "flaky_rate", op: "<=", threshold: 0.05 },
      ],
    };

const git = (c: string) => {
  try {
    return execSync(c, { cwd: here, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
};
const agentVersion = `${git("git rev-parse --short HEAD") || "unknown"}${git("git status --porcelain -- ../src ../../procol-ui-tests/src ../data/compiled-plans") ? "-dirty" : ""}`;

const ds = buildDataset();
let picked = ds.cases.filter((c: any) => c.label !== "candidate");
picked.push(...ds.cases.filter((c: any) => c.label === "candidate").slice(0, CANDIDATES));
if (ONLY) picked = ds.cases.filter((c: any) => ONLY.includes(c.caseId));
log(`agent ${agentVersion} · dataset ${ds.version} · ${picked.length} case(s) (${["bug", "clean", "candidate"].map((l) => `${picked.filter((c: any) => c.label === l).length} ${l}`).join(", ")}) · k=${K} · plants ${flag("no-plants") ? "off" : `k=${PLANT_K}`}`);

const client: any = await openClientContext(COMPANY).catch((e: Error) => {
  log(`could not open the client: ${e.message}`);
  process.exit(2);
});

type Row = import("../src/eval/metrics.js").Outcome & { reason?: string; verdict?: string };
const rows: Row[] = [];
/** every baseline run, candidates included: flakiness and time need no label */
const baselineAll: Row[] = [];
/** reports on cases nobody has labelled: listed for a person (or HubSpot) to label, never guessed into precision */
const unlabelled: Array<{ caseId: string; runs: string[]; reason: string }> = [];
const said = (v: string) => (v === "failed" ? "reported" : v === "passed" ? "passed" : "excluded") as "reported" | "passed" | "excluded";

async function runOnce(plan: any) {
  return runApiPlan(plan, { companyId: COMPANY, client, confirm: true, save: false, onLine: () => {} });
}

for (const c of picked as any[]) {
  // BASELINE: the real agent on real replies, k times
  const base: Row[] = [];
  for (let run = 1; run <= K; run++) {
    const r = await runOnce(c.plan);
    const s = said(r.verdict);
    const row: Row = { caseId: c.caseId, label: c.label === "candidate" ? "clean" : c.label, run, said: s, ms: r.ms, verdict: r.verdict, reason: r.reason.slice(0, 300), ...(c.bugKeys.length ? { bugKey: c.bugKeys[0] } : {}), ...(s === "excluded" ? { excludedWhy: r.reason.slice(0, 200) } : {}) };
    base.push(row);
    baselineAll.push(row);
    if (c.label !== "candidate") rows.push(row); // candidates are not labelled clean by history: kept out of precision
    log(`${c.caseId} [${c.label}] run ${run}/${K}: ${r.verdict} (${Math.round(r.ms / 1000)} s)`);
  }
  if (c.label === "candidate" && base.some((x) => x.said === "reported")) unlabelled.push({ caseId: c.caseId, runs: base.map((x) => x.verdict ?? ""), reason: base.find((x) => x.said === "reported")?.reason ?? "" });
  if (c.label === "bug" && c.bugKeys.length > 1) for (const b of c.bugKeys.slice(1)) for (const x of base) rows.push({ ...x, bugKey: b });
  if (flag("no-plants") || c.label === "bug") continue;
  // PLANTED: only on a case the real replies pass every usable time ("passes on the fixed version")
  const usable = base.filter((x) => x.said !== "excluded");
  if (!usable.length || usable.some((x) => x.said !== "passed")) {
    log(`  no planted bugs on ${c.caseId}: its baseline did not pass cleanly (${base.map((x) => x.verdict).join(", ")})`);
    continue;
  }
  for (const plant of plantsFor(c.plan)) {
    for (let run = 1; run <= PLANT_K; run++) {
      const m = mutatorFor(c.plan, plant);
      setResponseMutator(m.mutate);
      let r: any;
      try {
        r = await runOnce(c.plan);
      } finally {
        setResponseMutator(null);
      }
      const bugKey = `${c.caseId}#${plant.plantClass}`;
      if (!m.touched.length) {
        rows.push({ caseId: c.caseId, label: "planted", bugKey, plantClass: plant.plantClass, run, said: "excluded", excludedWhy: "the planted bug was never applied (its target call was not made)", ms: r.ms, verdict: r.verdict, reason: r.reason.slice(0, 300) });
        log(`  ${bugKey}: not applied`);
        continue;
      }
      const s = said(r.verdict);
      const failedStep = (r.steps ?? []).find((x: any) => x.verdict === "failed");
      const rightPlace = s === "reported" ? !!failedStep?.call && m.touched.some((t) => t.method === String(failedStep.call.method).toUpperCase() && t.path === failedStep.call.path) : undefined;
      rows.push({ caseId: c.caseId, label: "planted", bugKey, plantClass: plant.plantClass, run, said: s, ...(rightPlace !== undefined ? { rightPlace } : {}), ...(s === "excluded" ? { excludedWhy: r.reason.slice(0, 200) } : {}), ms: r.ms, verdict: r.verdict, reason: r.reason.slice(0, 300) });
      log(`  ${bugKey} run ${run}: ${r.verdict}${rightPlace === false ? " (failed somewhere else)" : ""}`);
    }
  }
}
await client?.dispose?.().catch?.(() => {});

// ── metrics ──────────────────────────────────────────────────────────────
const t = M.tally(rows);
const P = M.precision(t);
const R = M.recall(t);
const db: any = await spineDb().catch(() => null);
const escapedFile: Array<{ id: string; linkedBug?: string }> = existsSync(ESCAPED) ? JSON.parse(readFileSync(ESCAPED, "utf8")) : [];
const escapedDb: Array<{ id: string; linkedBug?: string }> = db ? (await db.query("SELECT id, linked_bug FROM escaped_bugs").catch(() => ({ rows: [] }))).rows.map((r: any) => ({ id: r.id, linkedBug: r.linked_bug ?? undefined })) : [];
const escaped = [...new Map([...escapedFile, ...escapedDb].map((e) => [e.id, e])).values()];
const sheetBugs = Array.from({ length: ds.bugsOnSheet }, (_, i) => `sheet#${i + 1}`);
const escapedIds = escaped.filter((e) => !e.linkedBug).map((e) => `escaped:${e.id}`);
const baselineMs = baselineAll.filter((r) => r.ms).map((r) => r.ms!);
const usage = usageReport();
const runs = rows.length || 1;
const metrics: Record<string, any> = {
  precision: P,
  precision_real: M.precisionReal(t),
  recall: R,
  recall_known_bugs: M.recall(t, "bug"),
  recall_planted: M.recall(t, "planted"),
  f05: { key: "f05", value: M.fBeta(P.value, R.value, 0.5), note: "F-beta with β = 0.5 from precision and recall above" },
  false_alarm_rate: M.falseAlarmRate(t),
  mutation_score: M.mutationScore(t),
  mutation_server_error: M.mutationScore(t, "server_error"),
  mutation_flipped_outcome: M.mutationScore(t, "flipped_outcome"),
  mutation_wrong_data: M.mutationScore(t, "wrong_data"),
  [`pass^${K}`]: M.passK(rows.filter((r) => r.label !== "planted"), K),
  flaky_rate: M.flakyRate(baselineAll),
  couldnt_tell_rate: M.couldntTellRate(rows),
  ddp: escaped.length ? M.ddp(sheetBugs, escapedIds) : { key: "ddp", value: null, k: 0, n: 0, ci: null, note: "waiting for escaped bugs (HubSpot) — data/eval/escaped-bugs.json is empty" },
  leakage: escaped.length ? M.leakage(sheetBugs, escapedIds) : { key: "leakage", value: null, k: 0, n: 0, ci: null, note: "waiting for escaped bugs (HubSpot)" },
  unlabelled_reports: { key: "unlabelled_reports", value: null, k: unlabelled.length, n: picked.filter((c: any) => c.label === "candidate").length, ci: null, note: "candidate cases the agent reported on real replies — need a person's label before they count either way" },
  bug_recheck_coverage: M.proportion("bug_recheck_coverage", ds.bugsWithPlan, Array.from({ length: ds.bugsOnSheet - ds.bugsWithPlan.length }, (_, i) => `no-plan#${i + 1}`), "verified bugs a stored plan can re-check ÷ verified bugs on the sheet"),
  verify_depth: M.proportion("verify_depth", ds.cases.filter((c: any) => (c.plan.verify ?? []).some((v: any) => (v.assert ?? []).some((a: any) => a.op !== "status_2xx"))).map((c: any) => c.caseId), ds.cases.filter((c: any) => !(c.plan.verify ?? []).some((v: any) => (v.assert ?? []).some((a: any) => a.op !== "status_2xx"))).map((c: any) => c.caseId), "stored plans whose read-back checks data, not only a 2xx status"),
  time_to_verdict_ms: { key: "time_to_verdict_ms", p50: M.percentile(baselineMs, 50), p90: M.percentile(baselineMs, 90), n: baselineMs.length },
  cost_usd_per_run: { key: "cost_usd_per_run", value: Math.round((usage.totalUsd / runs) * 1e6) / 1e6, n: runs, note: "model spend during this eval ÷ runs (stored plans need no model at run time)" },
};
const passKey = `pass^${K}`;
const comp = M.composite(
  {
    f05: metrics.f05.value,
    ddp: metrics.ddp.value,
    mutation: metrics.mutation_score.value,
    passk: metrics[passKey].value,
    steady: metrics.flaky_rate.value === null ? null : 1 - metrics.flaky_rate.value,
    time: metrics.time_to_verdict_ms.p90 === null ? null : Math.max(0, 1 - metrics.time_to_verdict_ms.p90 / cfg.thresholds.timeP90Ms),
    cost: Math.max(0, 1 - metrics.cost_usd_per_run.value / cfg.thresholds.costUsdPerRun),
    dora: null,
  },
  cfg.weights,
);
const gates = cfg.gates.map((g: any) => M.gate(g.key === "pass^k" ? passKey : g.key, (metrics[g.key === "pass^k" ? passKey : g.key] ?? {}).value ?? null, g.op, g.threshold));

// ── report ───────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
const prev = readdirSync(OUT).filter((f) => f.endsWith(".json")).sort().pop();
const before = prev ? JSON.parse(readFileSync(join(OUT, prev), "utf8")) : null;
const delta: Record<string, number> = {};
for (const [k, v] of Object.entries(metrics)) {
  const a = (v as any).value;
  const b = before?.metrics?.[k]?.value;
  if (typeof a === "number" && typeof b === "number") delta[k] = Math.round((a - b) * 1e6) / 1e6;
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const report = {
  agentVersion,
  dataset: { version: ds.version, builtAt: ds.builtAt, sources: ds.sources, picked: picked.map((c: any) => ({ caseId: c.caseId, label: c.label, bugKeys: c.bugKeys, why: c.why })) },
  run: { at: new Date().toISOString(), company: COMPANY, k: K, plantK: PLANT_K, plants: !flag("no-plants") },
  metrics,
  composite: comp,
  gates,
  comparedWith: before ? { file: prev, agentVersion: before.agentVersion, delta } : null,
  unlabelled,
  /** every baseline run, candidates included — lets a later label be re-applied without re-running UAT */
  baseline: baselineAll.map((r) => ({ ...r, datasetLabel: (picked as any[]).find((c) => c.caseId === r.caseId)?.label })),
  lists: { detected: t.detected, missed: t.missed, bugExcluded: t.bugExcluded, falseAlarms: t.falseAlarm, cleanQuiet: t.quiet, cleanExcluded: t.cleanExcluded },
  outcomes: rows,
};
const base = join(OUT, `${stamp}-${agentVersion}`);
writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);
const line = (m: any) => `| ${m.key} | ${pct(m.value)} | ${m.k ?? ""}/${m.n ?? ""} | ${m.ci ? `${pct(m.ci[0])} – ${pct(m.ci[1])}` : "—"} | ${m.note ?? ""} |`;
const md = [
  `# Agent eval — ${agentVersion}`,
  "",
  `Dataset ${ds.version} (${ds.sources.plans} stored plans, ${ds.bugsOnSheet} bugs on ${ds.sources.bugSheet}); ${picked.length} cases; k = ${K}; planted bugs ${flag("no-plants") ? "off" : `k = ${PLANT_K}`}; company ${COMPANY}; ${new Date().toISOString().slice(0, 16)} UTC.`,
  "",
  `Labelled clean controls: ${picked.filter((c: any) => c.label === "clean").length} · known-bug cases: ${picked.filter((c: any) => c.label === "bug").length} · candidates (planted bugs only): ${picked.filter((c: any) => c.label === "candidate").length}`,
  "",
  `**Composite** ${comp.score === null ? "—" : comp.score} (measured over ${Object.keys(comp.used).join(", ") || "nothing"}${comp.missing.length ? `; not yet measurable: ${comp.missing.join(", ")}` : ""})`,
  "",
  `**Gates** ${gates.map((g: any) => `${g.key} ${g.op} ${g.threshold}: **${g.status}** (${g.value ?? "—"})`).join(" · ")}`,
  "",
  "| Metric | Value | k/n | 95% interval | How it is counted |",
  "|---|---:|---:|---|---|",
  ...Object.values(metrics).filter((m: any) => "k" in m).map(line),
  `| time to verdict | p50 ${metrics.time_to_verdict_ms.p50 ?? "—"} ms · p90 ${metrics.time_to_verdict_ms.p90 ?? "—"} ms | n=${metrics.time_to_verdict_ms.n} | | baseline runs |`,
  `| cost per run | $${metrics.cost_usd_per_run.value} | n=${metrics.cost_usd_per_run.n} | | ${metrics.cost_usd_per_run.note} |`,
  "",
  `**Detected** ${t.detected.join(", ") || "none"}`,
  `**Missed** ${t.missed.join(", ") || "none"}`,
  `**False alarms** ${t.falseAlarm.join(", ") || "none"}`,
  `**Reported on unlabelled cases (need a person's label)** ${unlabelled.map((u) => `${u.caseId} — ${u.reason.slice(0, 140)}`).join(" · ") || "none"}`,
  `**Excluded (never counted)** bugs: ${t.bugExcluded.join(", ") || "none"} · clean: ${t.cleanExcluded.join(", ") || "none"}`,
  before ? `\nCompared with ${prev} (${before.agentVersion}): ${Object.entries(delta).map(([k, d]) => `${k} ${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)} pt`).join(" · ") || "no common metrics"}` : "",
  "",
  "Definitions and formulas: docs/METRICS.md. Every outcome behind these numbers is in the JSON report beside this file.",
].join("\n");
writeFileSync(`${base}.md`, md);
if (db) {
  try {
    const ins = await db.query(
      "INSERT INTO eval_reports (agent_version, dataset_version, company_id, k, plant_k, composite, gates_passed, report) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
      [agentVersion, ds.version, COMPANY, K, flag("no-plants") ? null : PLANT_K, comp.score, !gates.some((g: any) => g.status === "fail"), JSON.stringify({ ...report, outcomes: undefined })],
    );
    const id = ins.rows[0].id;
    for (const o of rows) {
      await db.query(
        "INSERT INTO eval_outcomes (report_id, case_id, label, bug_key, plant_class, run, said, right_place, excluded_why, verdict, reason, ms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [id, o.caseId, o.label, o.bugKey ?? null, o.plantClass ?? null, o.run, o.said, o.rightPlace ?? null, o.excludedWhy ?? null, o.verdict ?? null, o.reason ?? null, o.ms ? Math.round(o.ms) : null],
      );
    }
    log(`saved to spine DB as eval report ${id} (${rows.length} outcomes)`);
  } catch (e) {
    log(`not saved to spine DB: ${(e as Error).message}`);
  }
}
log(`report → ${base}.md`);
console.log("\n" + md);
const failedGate = gates.some((g: any) => g.status === "fail");
process.exit(failedGate && !flag("no-gate-exit") ? 1 : 0);
