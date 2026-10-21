/**
 * THE ORCHESTRATOR, MEASURED FROM WHAT IT ALREADY RAN — every browser plan result the runner
 * kept (procol-ui-tests/.plans/*-result.json, with its plan beside it) and the combination grid.
 * No model, no browser: arithmetic over the record.
 *
 *   • time to verdict per plan: p50 / p90 (from the steps' ms)
 *   • step reliability: steps ok ÷ steps attempted; plans passed ÷ plans
 *   • where the platform stops: APP refusal (the product's own message — a finding) vs
 *     AUTOMATION failure (a locator, a timeout, "not evidence about the product") vs other
 *   • self-repair: steps that were recovered after the app refused (recovered ÷ refusals met)
 *   • prepared-state use: plans that opened an API-built event by route vs searched the list
 *   • pictures: spotlight pictures per plan (plans run since the spotlight landed)
 *
 *   npx tsx scripts/eval-orchestrator.ts [--since 2026-10-20]
 * Report: data/eval/reports/orchestrator-<date>.json and .md
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { percentile, wilson } from "../src/eval/metrics.js";

const here = dirname(fileURLToPath(import.meta.url));
const PLANS = join(here, "..", "..", "procol-ui-tests", ".plans");
const argv = process.argv.slice(2);
const i = argv.indexOf("--since");
const since = i >= 0 ? new Date(argv[i + 1]).getTime() : 0;

const files = readdirSync(PLANS).filter((f) => f.endsWith("-result.json")).filter((f) => statSync(join(PLANS, f)).mtimeMs >= since);
const APP_REFUSAL = /refused by the app|rejected by the app|the app's own rule|the app said/i;
const AUTOMATION = /not evidence about the product|automation needs update|no candidate was clickable|Timeout \d+ms exceeded|timed out|did not open|not a QA test vendor|needs a QA test vendor/i;
let plans = 0, passed = 0, stepsOk = 0, stepsRun = 0, refusals = 0, recovered = 0, pictures = 0, withPictures = 0, prepared = 0, searched = 0, created = 0;
const stops = { app: 0, automation: 0, other: 0 };
const times: number[] = [];
const byKind: Record<string, { n: number; passed: number }> = {};
const stopReasons: Record<string, number> = {};
for (const f of files) {
  let r: any;
  try {
    r = JSON.parse(readFileSync(join(PLANS, f), "utf8"));
  } catch {
    continue;
  }
  const st: any[] = r.steps ?? [];
  if (!st.length) continue;
  plans++;
  if (r.passed) passed++;
  const kind = f.replace(/-result\.json$/, "").replace(/-[a-z0-9]+$/, "").split("-")[0];
  byKind[kind] = byKind[kind] ?? { n: 0, passed: 0 };
  byKind[kind].n++;
  if (r.passed) byKind[kind].passed++;
  times.push(st.reduce((s, x) => s + (x.ms ?? 0), 0));
  const attempted = st.filter((x) => x.status !== "skipped");
  stepsRun += attempted.length;
  stepsOk += attempted.filter((x) => x.status === "ok").length;
  for (const x of st) {
    if (x.recovered) {
      refusals++;
      recovered++;
    }
    if (x.spotlights?.length) pictures += x.spotlights.length;
  }
  if (st.some((x) => x.spotlights?.length)) withPictures++;
  const first = st[0]?.step;
  if (first === "open_prepared") prepared++;
  else if (first === "open_create") created++;
  else if (st.some((x) => x.step === "open_event" && x.args?.title)) searched++;
  const failed = st.find((x) => x.status === "failed");
  if (failed) {
    const d = String(failed.detail ?? "");
    const k = APP_REFUSAL.test(d) ? "app" : AUTOMATION.test(d) ? "automation" : "other";
    stops[k]++;
    if (k === "app") refusals++;
    const key = `${failed.step}: ${d.replace(/[“”"']/g, "").slice(0, 70)}`;
    stopReasons[key] = (stopReasons[key] ?? 0) + 1;
  }
}
const report = {
  at: new Date().toISOString(), since: since ? new Date(since).toISOString() : "all", plans, passed, passRate: [passed, plans, wilson(passed, plans)],
  steps: { run: stepsRun, ok: stepsOk, rate: [stepsOk, stepsRun, wilson(stepsOk, stepsRun)] },
  timeToVerdict: { p50s: Math.round((percentile(times, 50) ?? 0) / 1000), p90s: Math.round((percentile(times, 90) ?? 0) / 1000) },
  stops, selfRepair: [recovered, refusals, wilson(recovered, Math.max(refusals, 1))],
  start: { prepared, created, searchedByTitle: searched },
  pictures: { total: pictures, plansWithPictures: withPictures, perPlan: withPictures ? Math.round(pictures / withPictures) : 0 },
  byKind, topStops: Object.entries(stopReasons).sort((a, b) => b[1] - a[1]).slice(0, 15),
};
const dir = join(here, "..", "data", "eval", "reports");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(join(dir, `orchestrator-${stamp}.json`), JSON.stringify(report, null, 2));
const pct = (x: any) => `${x[0]}/${x[1]} (${x[1] ? Math.round((x[0] / x[1]) * 100) : 0}%${x[2] ? `, 95% ${Math.round(x[2][0] * 100)}–${Math.round(x[2][1] * 100)}%` : ""})`;
const md = [
  `# The orchestrator, from the record — ${report.at.slice(0, 16)} (${report.since})`,
  "",
  `${plans} browser plans kept by the runner.`,
  "",
  `- Plans passed: ${pct(report.passRate)}`,
  `- Steps that did what they should: ${pct(report.steps.rate)}`,
  `- Time to verdict: p50 ${report.timeToVerdict.p50s}s · p90 ${report.timeToVerdict.p90s}s`,
  `- Where failed plans stopped: the APP refused with its own message ${stops.app} · automation (locator, timeout, harness) ${stops.automation} · other ${stops.other}`,
  `- Self-repair after an app refusal: ${pct(report.selfRepair)}`,
  `- How plans start: API-built event by route ${prepared} · fresh create ${created} · searched the list by title ${searched}`,
  `- Spotlight pictures: ${pictures} over ${withPictures} plans (${report.pictures.perPlan} per plan)`,
  "",
  "| Kind of run | Plans | Passed |",
  "| --- | ---: | ---: |",
  ...Object.entries(byKind).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `| ${k} | ${v.n} | ${v.passed} |`),
  "",
  "Most frequent stops:",
  ...report.topStops.map(([k, n]) => `- ${n} × ${k}`),
].join("\n");
writeFileSync(join(dir, `orchestrator-${stamp}.md`), md);
console.log(md);
