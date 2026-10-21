/**
 * A QA-Bench-v0-style score for the test cases the platform writes (the three numbers Canary's
 * QA-Bench v0 reports: relevance, coverage, coherence — an LLM judge, 1–5 each), on top of the
 * harder benchmark in scripts/eval-agent.ts (bugs actually caught, planted bugs, repeat runs).
 *
 * Input: the screen library (data/screens/*.json) — each screen's inventory, the code rules that
 * apply to it, and the cases written from it. For every screen:
 *   • relevance  — judge: are the cases about THIS screen's controls and rules? (1–5)
 *   • coverage   — judge (1–5) AND a measured share: controls named by at least one case ÷ controls
 *                  on screen, and untested rules a case cites ÷ untested rules given
 *   • coherence  — judge: do the steps follow in an order a tester could execute, and does the
 *                  expected result follow from the steps? (1–5)
 * Scores are averaged with a Wilson interval on "≥ 4 of 5" (the share of screens the judge rates
 * good). The judge sees the inventory and the rules, never the plans or the run results, so it
 * judges the writing, not the execution.
 *
 *   npx tsx scripts/eval-qabench.ts [--limit 12] [--only <screen-id,…>]
 * Reports: data/eval/reports/qabench-<date>.json and .md
 */
import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "45000";
const { chat } = await import("../src/ai/llm.js");
const { getScreen, listScreens } = await import("../src/agents/screenModel.js");
const { wilson } = await import("../src/eval/metrics.js");

const argv = process.argv.slice(2);
const arg = (k: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const limit = Number(arg("limit") ?? 0) || Infinity;
const only = arg("only")?.split(",").map((s) => s.trim()).filter(Boolean);
const t = () => new Date().toISOString().slice(11, 19);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

interface Row {
  screen: string;
  cases: number;
  relevance: number | null;
  coverageJudge: number | null;
  coherence: number | null;
  controlsTouched: number;
  controls: number;
  untestedRulesCited: number;
  untestedRules: number;
  judgeNote: string;
}

const rows: Row[] = [];
const screens = listScreens().filter((s) => s.cases > 0 && (!only?.length || only.includes(s.id))).slice(0, limit);
console.log(`[${t()}] judging the cases of ${screens.length} screen(s)`);
for (const s of screens) {
  const r = getScreen(s.id);
  if (!r) continue;
  const text = r.cases.map((c) => `${c.id} ${c.title} ${c.steps.join(" ")} ${c.expected}`.toLowerCase()).join("\n");
  const controlsTouched = r.controls.filter((c) => c.name.length >= 4 && text.includes(c.name.toLowerCase())).length;
  const untested = r.rules.filter((x) => x.verdict === "not covered");
  const cited = untested.filter((x) => r.cases.some((c) => c.grounded === x.id)).length;
  const system = [
    "You are the judge of an AI QA benchmark. You see ONE screen of a B2B sourcing product (its visible controls and the rules its code enforces) and the test cases an AI wrote from that screen.",
    "Score three things, each an integer 1–5:",
    "- relevance: the cases are about THIS screen's controls and rules, not generic or invented behaviour (5 = every case names real controls and a real rule or visible behaviour).",
    "- coverage: how much of what matters on this screen the cases check — the important controls, the required fields, the refusals, the untested rules (5 = the set a senior tester would write).",
    "- coherence: steps a tester could execute in that order, with an expected result that follows from them and the app's words where given (5 = all cases; 1 = steps out of order, missing setup, or expectations unrelated to the steps).",
    'Return ONLY JSON: {"relevance":n,"coverage":n,"coherence":n,"note":"one sentence on the biggest weakness"}.',
  ].join("\n");
  const user = [
    `SCREEN: ${r.label} (${r.path})${r.state && r.state !== "none" ? ` — event state ${r.state}` : ""}`,
    `CONTROLS: ${r.controls.slice(0, 60).map((c) => `${c.kind} "${c.name}"${c.disabled ? " (disabled)" : ""}${c.required ? " (required)" : ""}`).join(", ")}`,
    `RULES THE CODE ENFORCES HERE (${untested.length} untested):\n${r.rules.slice(0, 30).map((x) => `- ${x.id} [${x.verdict}] ${x.statement.slice(0, 180)}`).join("\n")}`,
    `TEST CASES WRITTEN FROM THIS SCREEN (${r.cases.length}):\n${r.cases.map((c) => `${c.id} — ${c.title}\n  grounded: ${c.grounded ?? "screen"}\n  steps: ${c.steps.join(" | ")}\n  expected: ${c.expected}`).join("\n")}`,
  ].join("\n\n");
  const raw = await chat([{ role: "system", content: system }, { role: "user", content: user }], { tier: "reason", temperature: 0, maxTokens: 400 }).catch(() => "");
  let j: any = null;
  try {
    j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    j = null;
  }
  const score = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 1 && Number(v) <= 5 ? Number(v) : null);
  const row: Row = { screen: r.label, cases: r.cases.length, relevance: score(j?.relevance), coverageJudge: score(j?.coverage), coherence: score(j?.coherence), controlsTouched, controls: r.controls.length, untestedRulesCited: cited, untestedRules: untested.length, judgeNote: String(j?.note ?? (raw ? "unparseable judge answer" : "no judge answer")).slice(0, 200) };
  rows.push(row);
  console.log(`[${t()}] ${r.label.padEnd(34)} rel ${row.relevance ?? "–"} cov ${row.coverageJudge ?? "–"} coh ${row.coherence ?? "–"} · controls ${controlsTouched}/${r.controls.length} · untested rules cited ${cited}/${untested.length} · ${row.judgeNote}`);
}

const judged = rows.filter((r) => r.relevance !== null);
const mean = (k: "relevance" | "coverageJudge" | "coherence") => (judged.length ? Math.round((judged.reduce((s, r) => s + (r[k] ?? 0), 0) / judged.length) * 100) / 100 : null);
const good = (k: "relevance" | "coverageJudge" | "coherence") => judged.filter((r) => (r[k] ?? 0) >= 4).length;
const ci = (k: "relevance" | "coverageJudge" | "coherence") => wilson(good(k), judged.length);
const controlsShare = rows.reduce((s, r) => s + r.controlsTouched, 0) / Math.max(1, rows.reduce((s, r) => s + r.controls, 0));
const rulesShare = rows.reduce((s, r) => s + r.untestedRulesCited, 0) / Math.max(1, rows.reduce((s, r) => s + r.untestedRules, 0));
const report = {
  benchmark: "qabench-style (relevance / coverage / coherence, LLM judge 1–5) over the screen library",
  at: new Date().toISOString(),
  screens: rows.length,
  judged: judged.length,
  cases: rows.reduce((s, r) => s + r.cases, 0),
  means: { relevance: mean("relevance"), coverage: mean("coverageJudge"), coherence: mean("coherence") },
  goodShare: { relevance: { k: good("relevance"), n: judged.length, ci: ci("relevance") }, coverage: { k: good("coverageJudge"), n: judged.length, ci: ci("coverageJudge") }, coherence: { k: good("coherence"), n: judged.length, ci: ci("coherence") } },
  measured: { controlsTouchedShare: Math.round(controlsShare * 1000) / 1000, untestedRulesCitedShare: Math.round(rulesShare * 1000) / 1000 },
  rows,
};
const dir = join(here, "..", "data", "eval", "reports");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(join(dir, `qabench-${stamp}.json`), JSON.stringify(report, null, 2));
const pct = (x: [number, number] | null) => (x ? `${Math.round(x[0] * 100)}–${Math.round(x[1] * 100)}%` : "—");
const md = [
  `# QA-Bench-style score — ${report.at.slice(0, 16)}`,
  "",
  `${report.screens} screens, ${report.cases} cases, ${report.judged} judged. Judge: the reason tier of the model chain (no plans or run results shown to it).`,
  "",
  "| Dimension | Mean (1–5) | Screens rated ≥ 4 | Wilson 95% |",
  "| --- | ---: | ---: | --- |",
  `| Relevance | ${report.means.relevance ?? "—"} | ${report.goodShare.relevance.k}/${report.goodShare.relevance.n} | ${pct(report.goodShare.relevance.ci)} |`,
  `| Coverage (judge) | ${report.means.coverage ?? "—"} | ${report.goodShare.coverage.k}/${report.goodShare.coverage.n} | ${pct(report.goodShare.coverage.ci)} |`,
  `| Coherence | ${report.means.coherence ?? "—"} | ${report.goodShare.coherence.k}/${report.goodShare.coherence.n} | ${pct(report.goodShare.coherence.ci)} |`,
  "",
  `Measured coverage: cases name ${Math.round(controlsShare * 100)}% of the controls on screen and cite ${Math.round(rulesShare * 100)}% of the untested code rules given.`,
  "",
  "| Screen | Cases | Rel | Cov | Coh | Controls touched | Untested rules cited | Judge's note |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ...rows.map((r) => `| ${r.screen} | ${r.cases} | ${r.relevance ?? "—"} | ${r.coverageJudge ?? "—"} | ${r.coherence ?? "—"} | ${r.controlsTouched}/${r.controls} | ${r.untestedRulesCited}/${r.untestedRules} | ${r.judgeNote.replace(/\|/g, "/")} |`),
  "",
  "This is the weaker benchmark (what Canary's QA-Bench v0 reports: an LLM's opinion of the writing). Bugs actually caught, planted bugs, repeat runs and false alarms are in `scripts/eval-agent.ts` reports (docs/METRICS.md).",
].join("\n");
writeFileSync(join(dir, `qabench-${stamp}.md`), md);
console.log(`[${t()}] relevance ${report.means.relevance} · coverage ${report.means.coverage} · coherence ${report.means.coherence} (means of ${judged.length}) · controls touched ${Math.round(controlsShare * 100)}% · untested rules cited ${Math.round(rulesShare * 100)}%`);
console.log(`report → data/eval/reports/qabench-${stamp}.md`);
process.exit(0);
