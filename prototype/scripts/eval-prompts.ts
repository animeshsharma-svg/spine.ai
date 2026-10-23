/**
 * DOES IT READ THE TEST CASE CORRECTLY, AND TEST WHAT WAS ASKED — the 66 stress prompts
 * (docs/STRESS-PROMPTS.md), each with the gap it was built to find.
 *
 * Phase 1 (compile, model only): every prompt is compiled the way Run tests does. Measured: steps,
 * assertions, coverage label, gaps. Judged (a model, the prompt + its intent note + the plan):
 *   • fidelity 1–5 — the plan tests what the sentence asks, in the right order, with an assertion
 *     for the outcome asked;
 *   • honesty yes/no — for a prompt whose note says it must be refused, partial or "cannot be
 *     expressed", the compiler said so instead of producing a plan that would pass by skipping it.
 * Phase 2 (--run, the browser): each runnable plan is executed with the spotlight on; measured:
 *   passed / failed / couldn't tell, where it stopped, pictures, time; judged: did the RUN
 *   exercise what the prompt asked (the executed steps and their details, 1–5).
 *
 *   npx tsx scripts/eval-prompts.ts [--run] [--only 1,24,33] [--limit N] [--c 198678]
 * Report: data/eval/reports/prompts-<date>.json and .md
 */
import { config } from "dotenv";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "45000";
const { chat } = await import("../src/ai/llm.js");
const { compileTestCase } = await import("../src/agents/planner.js");
const { wilson, percentile } = await import("../src/eval/metrics.js");
const { runUiPlan, readPlanResult } = await import("../src/ui/uiFlowRunner.js");
const { contextForPlan } = await import("../src/ui/prepareForPlan.js");

/** What each step DOES, so the judge does not mistake an assertion that presses Publish and expects the refusal for "never attempting to publish". */
const CATALOG = JSON.parse(readFileSync(join(here, "..", "..", "procol-ui-tests", "plan-catalog.json"), "utf8")) as { steps: Array<{ name: string; purpose: string }> };
const GLOSSARY = CATALOG.steps.map((st) => `- ${st.name}: ${st.purpose.replace(/\s+/g, " ").slice(0, 170)}`).join("\n");
const argv = process.argv.slice(2);
const arg = (k: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const REJUDGE = arg("rejudge");
const RUN = argv.includes("--run") || !!REJUDGE;
const only = arg("only")?.split(",").map((s) => Number(s.trim())).filter(Boolean);
const limit = Number(arg("limit") ?? 0) || Infinity;
const companyId = Number(arg("c") ?? 198678);
const t = () => new Date().toISOString().slice(11, 19);

const md = readFileSync(join(here, "..", "..", "docs", "STRESS-PROMPTS.md"), "utf8");
const prompts = [...md.matchAll(/^(\d+)\. (.+?)(?: → (.+))?$/gm)].map((m) => ({ n: Number(m[1]), text: m[2].trim(), intent: (m[3] ?? "").trim() })).filter((p) => (!only?.length || only.includes(p.n))).slice(0, limit);
const ASSERT = /^expect_|^attempt$/;
const TRAP = /refus|cannot be expressed|must be refused|honest|never silently|expect partial|not pass|never a fake/i;
console.log(`[${t()}] ${prompts.length} prompt(s)${RUN ? ", compile + run" : ", compile only"}`);

interface Row {
  n: number;
  text: string;
  intent: string;
  trap: boolean;
  coverage: string;
  steps: string[];
  assertions: number;
  gaps: string[];
  source: string;
  fidelity: number | null;
  honesty: boolean | null;
  judgeNote: string;
  run?: { passed: boolean | null; ok: number; steps: number; stoppedAt?: string; pictures: number; ms: number; infra: boolean; runFidelity: number | null; runNote: string };
}
const rows: Row[] = [];
const PLANS_DIR = join(here, "..", "..", "procol-ui-tests", ".plans");
const latestResult = (n: number): any => {
  const files = readdirSync(PLANS_DIR).filter((f) => f.startsWith(`prompt-${n}-`) && f.endsWith("-result.json")).sort((a, b) => statSync(join(PLANS_DIR, b)).mtimeMs - statSync(join(PLANS_DIR, a)).mtimeMs);
  if (!files.length) return null;
  try {
    return JSON.parse(readFileSync(join(PLANS_DIR, files[0]), "utf8"));
  } catch {
    return null;
  }
};
/** --rejudge <report.json>: no compile, no browser — the stored plans and the latest run of each prompt, judged again with the glossary. */
if (REJUDGE) {
  const prev = JSON.parse(readFileSync(REJUDGE, "utf8")) as { rows: Row[] };
  for (const r of prev.rows) {
    const steps = r.steps;
    const judgeRaw = await chat(
      [
        { role: "system", content: `You judge a QA compiler. A tester typed ONE sentence; the compiler produced browser steps (a plan) with a coverage label (full / partial / none) and gaps. Score fidelity 1–5: the plan tests exactly what the sentence asks — right flow, right order, an assertion for the outcome asked, nothing substituted (a plan that opens a different screen, skips the hard step, or asserts something easier is 1–2). Judge steps by WHAT THEY DO (glossary below), not by their names: expect_publish_blocked PRESSES Publish and asserts the app refused — it IS the publish attempt for a "try to publish without X" case; attempt{step} performs that step expecting the app's refusal; expect_error reads the app's own error. If the TRAP note says the request must be refused, partial or 'cannot be expressed', set honesty true only when the coverage label or gaps say so; if there is no trap note, honesty is true when the compiler did not over-claim. Return ONLY JSON {"fidelity":n,"honesty":true|false,"note":"one sentence"}.\n\nSTEP GLOSSARY:\n${GLOSSARY}` },
        { role: "user", content: `SENTENCE: ${r.text}\nTRAP NOTE (what this prompt is built to catch): ${r.intent || "none"}\nCOVERAGE LABEL: ${r.coverage}\nGAPS: ${r.gaps.join(" | ") || "none"}\nPLAN:\n${steps.map((x, i) => `${i + 1}. ${x}`).join("\n") || "(no steps)"}` },
      ],
      { tier: "reason", temperature: 0, maxTokens: 300 },
    ).catch(() => "");
    try {
      const j = JSON.parse(judgeRaw.slice(judgeRaw.indexOf("{"), judgeRaw.lastIndexOf("}") + 1));
      r.fidelity = Number.isFinite(Number(j.fidelity)) ? Math.min(5, Math.max(1, Number(j.fidelity))) : null;
      r.honesty = typeof j.honesty === "boolean" ? j.honesty : null;
      r.judgeNote = String(j.note ?? "").slice(0, 160);
    } catch {
      r.judgeNote = "unparseable judge answer";
    }
    const result = latestResult(r.n);
    if (result?.steps?.length) {
      const st: any[] = result.steps;
      const failed = st.find((x) => x.status === "failed");
      const infra = !!failed && /not evidence about the product|automation needs update|no candidate was clickable|Timeout|timed out|did not open|not a QA test vendor|needs a QA test vendor|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|DNS resolution|fetch failed|Target page, context or browser has been closed/i.test(String(failed.detail ?? ""));
      const runRaw = await chat(
        [
          { role: "system", content: `You judge whether a browser run tested what a tester asked. You get the sentence, then each executed step with what the runner reported. Score runFidelity 1–5: the run exercised the asked flow and checked the asked outcome (a run that passed by never reaching the asked step is 1–2; a run that reached the asked step and was refused by the APP with its own message is 4–5 when that refusal is the expected outcome; a run stopped by an automation fault — "not evidence about the product", a timeout, a missing locator — is 1–2). Judge steps by what they do (glossary below): expect_publish_blocked presses Publish and asserts the refusal. Return ONLY JSON {"runFidelity":n,"note":"one sentence"}.\n\nSTEP GLOSSARY:\n${GLOSSARY}` },
          { role: "user", content: `SENTENCE: ${r.text}\nTRAP NOTE: ${r.intent || "none"}\nRUN (${result.passed ? "passed" : "failed"}):\n${st.map((x, i) => `${i + 1}. ${x.step} [${x.status}] ${String(x.detail ?? "").slice(0, 220)}`).join("\n")}` },
        ],
        { tier: "reason", temperature: 0, maxTokens: 300 },
      ).catch(() => "");
      let rf: number | null = null, rn = "";
      try {
        const j = JSON.parse(runRaw.slice(runRaw.indexOf("{"), runRaw.lastIndexOf("}") + 1));
        rf = Number.isFinite(Number(j.runFidelity)) ? Math.min(5, Math.max(1, Number(j.runFidelity))) : null;
        rn = String(j.note ?? "").slice(0, 160);
      } catch {
        rn = "unparseable judge answer";
      }
      const pictures = st.reduce((n, x) => n + (x.spotlights?.length ?? 0), 0);
      r.run = { passed: !!result.passed, ok: st.filter((x) => x.status === "ok").length, steps: st.length, ...(failed ? { stoppedAt: `${failed.step}: ${String(failed.detail ?? "").slice(0, 200)}` } : {}), pictures, ms: st.reduce((n, x) => n + (x.ms ?? 0), 0), infra, runFidelity: rf, runNote: rn };
    }
    rows.push(r);
    console.log(`[${t()}] #${r.n} fidelity ${r.fidelity ?? "–"} honesty ${r.honesty ?? "–"}${r.run ? ` · run ${r.run.passed ? "✓" : "✗"} ${r.run.ok}/${r.run.steps} rf ${r.run.runFidelity ?? "–"}${r.run.infra ? " (infra)" : ""}` : ""} · ${r.run?.runNote || r.judgeNote}`);
  }
}
for (const p of REJUDGE ? [] : prompts) {
  const c = await compileTestCase(p.text, "events", { tier: "reason", dryRun: true }).catch((e) => ({ plan: { title: p.text, steps: [] as any[] }, coverage: "none" as const, gaps: [String((e as Error).message)], source: "fallback" as const, reasoning: "", warnings: [], context: { expectations: [], experience: [] } }));
  const steps = (c.plan?.steps ?? []).map((s: any) => `${s.step}${s.args && Object.keys(s.args).length ? JSON.stringify(s.args) : ""}`);
  const row: Row = { n: p.n, text: p.text, intent: p.intent, trap: TRAP.test(p.intent), coverage: c.coverage, steps, assertions: (c.plan?.steps ?? []).filter((s: any) => ASSERT.test(s.step)).length, gaps: c.gaps ?? [], source: c.source, fidelity: null, honesty: null, judgeNote: "" };
  const judgeRaw = await chat(
    [
      { role: "system", content: `You judge a QA compiler. A tester typed ONE sentence; the compiler produced browser steps (a plan) with a coverage label (full / partial / none) and gaps. Score fidelity 1–5: the plan tests exactly what the sentence asks — right flow, right order, an assertion for the outcome asked, nothing substituted (a plan that opens a different screen, skips the hard step, or asserts something easier is 1–2). Judge steps by WHAT THEY DO (glossary below), not by their names: expect_publish_blocked PRESSES Publish and asserts the app refused — it IS the publish attempt for a "try to publish without X" case; attempt{step} performs that step expecting the app's refusal; expect_error reads the app's own error. If the TRAP note says the request must be refused, partial or 'cannot be expressed', set honesty true only when the coverage label or gaps say so; if there is no trap note, honesty is true when the compiler did not over-claim. Return ONLY JSON {"fidelity":n,"honesty":true|false,"note":"one sentence"}.\n\nSTEP GLOSSARY:\n${GLOSSARY}` },
      { role: "user", content: `SENTENCE: ${p.text}\nTRAP NOTE (what this prompt is built to catch): ${p.intent || "none"}\nCOVERAGE LABEL: ${c.coverage}\nGAPS: ${(c.gaps ?? []).join(" | ") || "none"}\nPLAN:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n") || "(no steps)"}` },
    ],
    { tier: "reason", temperature: 0, maxTokens: 300 },
  ).catch(() => "");
  try {
    const j = JSON.parse(judgeRaw.slice(judgeRaw.indexOf("{"), judgeRaw.lastIndexOf("}") + 1));
    row.fidelity = Number.isFinite(Number(j.fidelity)) ? Math.min(5, Math.max(1, Number(j.fidelity))) : null;
    row.honesty = typeof j.honesty === "boolean" ? j.honesty : null;
    row.judgeNote = String(j.note ?? "").slice(0, 160);
  } catch {
    row.judgeNote = "unparseable judge answer";
  }
  rows.push(row);
  console.log(`[${t()}] #${p.n} ${c.coverage.padEnd(7)} ${steps.length} steps/${row.assertions} assert · fidelity ${row.fidelity ?? "–"} honesty ${row.honesty ?? "–"} · ${row.judgeNote}`);

  if (RUN && c.coverage !== "none" && steps.length) {
    const runId = `prompt-${p.n}-${Date.now().toString(36)}`;
    const t0 = Date.now();
    let pictures = 0;
    // a case that starts from an existing event: build that event first (as Run tests now does)
    const prep = await contextForPlan(p.text, c.plan, companyId, (l) => console.log(`[${t()}]      ${l}`));
    if (prep.why) console.log(`[${t()}]      ${prep.why}`);
    const planToRun = prep.context ? { ...c.plan, context: prep.context } : c.plan;
    const result: any = await new Promise((resolve) => {
      runUiPlan({ plan: planToRun, companyId, runId, headed: false }, (e: any) => {
        if (e.type === "spot") pictures++;
        if (e.type === "done" || e.type === "run-error") resolve(readPlanResult(runId));
      });
    });
    const st: any[] = result?.steps ?? [];
    const failed = st.find((s) => s.status === "failed");
    const infra = !!failed && /not evidence about the product|automation needs update|did not open|no candidate was clickable|Timeout|timed out|not a QA test vendor|needs a QA test vendor|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|DNS resolution|fetch failed|Target page, context or browser has been closed/i.test(String(failed.detail ?? ""));
    const runRaw = await chat(
      [
        { role: "system", content: `You judge whether a browser run tested what a tester asked. You get the sentence, then each executed step with what the runner reported. Score runFidelity 1–5: the run exercised the asked flow and checked the asked outcome (a run that passed by never reaching the asked step is 1–2; a run that reached the asked step and was refused by the APP with its own message is 4–5 when that refusal is the expected outcome; a run stopped by an automation fault — "not evidence about the product", a timeout, a missing locator — is 1–2). Judge steps by what they do (glossary below): expect_publish_blocked presses Publish and asserts the refusal. Return ONLY JSON {"runFidelity":n,"note":"one sentence"}.\n\nSTEP GLOSSARY:\n${GLOSSARY}` },
        { role: "user", content: `SENTENCE: ${p.text}\nTRAP NOTE: ${p.intent || "none"}\nRUN (${result?.passed ? "passed" : "failed"}):\n${st.map((s, i) => `${i + 1}. ${s.step} [${s.status}] ${String(s.detail ?? "").slice(0, 220)}`).join("\n")}` },
      ],
      { tier: "reason", temperature: 0, maxTokens: 300 },
    ).catch(() => "");
    let rf: number | null = null, rn = "";
    try {
      const j = JSON.parse(runRaw.slice(runRaw.indexOf("{"), runRaw.lastIndexOf("}") + 1));
      rf = Number.isFinite(Number(j.runFidelity)) ? Math.min(5, Math.max(1, Number(j.runFidelity))) : null;
      rn = String(j.note ?? "").slice(0, 160);
    } catch {
      rn = "unparseable judge answer";
    }
    row.run = { passed: result ? !!result.passed : null, ok: st.filter((s) => s.status === "ok").length, steps: st.length, ...(failed ? { stoppedAt: `${failed.step}: ${String(failed.detail ?? "").slice(0, 200)}` } : {}), pictures, ms: Date.now() - t0, infra, runFidelity: rf, runNote: rn };
    console.log(`[${t()}]    run ${row.run.passed ? "✓" : "✗"} ${row.run.ok}/${row.run.steps} · ${pictures} pictures · ${Math.round(row.run.ms / 1000)}s${failed ? ` · stopped at ${failed.step}${infra ? " (infra)" : ""}` : ""} · runFidelity ${rf ?? "–"} · ${rn}`);
  }
}

const judged = rows.filter((r) => r.fidelity !== null);
const traps = rows.filter((r) => r.trap && r.honesty !== null);
const honest = traps.filter((r) => r.honesty).length;
const fid4 = judged.filter((r) => (r.fidelity ?? 0) >= 4).length;
const ran = rows.filter((r) => r.run);
const passed = ran.filter((r) => r.run!.passed).length;
const infra = ran.filter((r) => r.run!.infra).length;
const rf4 = ran.filter((r) => (r.run!.runFidelity ?? 0) >= 4).length;
const times = ran.map((r) => r.run!.ms);
const report = {
  at: new Date().toISOString(), prompts: rows.length, judged: judged.length,
  compile: { coverage: Object.fromEntries(["full", "partial", "none"].map((k) => [k, rows.filter((r) => r.coverage === k).length])), fallback: rows.filter((r) => r.source === "fallback").length, fidelityMean: judged.length ? Math.round((judged.reduce((s, r) => s + (r.fidelity ?? 0), 0) / judged.length) * 100) / 100 : null, fidelityGood: [fid4, judged.length, wilson(fid4, judged.length)], honesty: [honest, traps.length, wilson(honest, traps.length)] },
  run: RUN ? { ran: ran.length, passed, failed: ran.length - passed, infraFailures: infra, pictures: ran.reduce((s, r) => s + r.run!.pictures, 0), p50s: Math.round((percentile(times, 50) ?? 0) / 1000), p90s: Math.round((percentile(times, 90) ?? 0) / 1000), runFidelityGood: [rf4, ran.filter((r) => r.run!.runFidelity !== null).length, wilson(rf4, ran.filter((r) => r.run!.runFidelity !== null).length)] } : null,
  rows,
};
const dir = join(here, "..", "data", "eval", "reports");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(join(dir, `prompts-${stamp}.json`), JSON.stringify(report, null, 2));
const pct = (x: any) => (x?.[2] ? `${x[0]}/${x[1]} · ${Math.round(x[2][0] * 100)}–${Math.round(x[2][1] * 100)}%` : `${x?.[0] ?? 0}/${x?.[1] ?? 0}`);
const out = [
  `# Reading the test case and testing what was asked — ${report.at.slice(0, 16)}`,
  "",
  `${rows.length} stress prompts (docs/STRESS-PROMPTS.md). Compiled with the production compiler; judged by a model that saw the sentence, the trap note and the plan.`,
  "",
  `- Coverage labels: full ${report.compile.coverage.full}, partial ${report.compile.coverage.partial}, none ${report.compile.coverage.none}; generic fallback ${report.compile.fallback}`,
  `- **Compile fidelity** (plan tests what the sentence asks): mean ${report.compile.fidelityMean} / 5; rated ≥ 4: ${pct(report.compile.fidelityGood)}`,
  `- **Honesty on trap prompts** (refused / partial / cannot-express instead of a plan that would pass by skipping): ${pct(report.compile.honesty)}`,
  ...(report.run ? ["", `- Ran ${report.run.ran} plans: passed ${report.run.passed}, failed ${report.run.failed} (infra/automation ${report.run.infraFailures}), ${report.run.pictures} spotlight pictures, time to verdict p50 ${report.run.p50s}s / p90 ${report.run.p90s}s`, `- **Run fidelity** (the run exercised the asked flow and checked the asked outcome): rated ≥ 4: ${pct(report.run.runFidelityGood)}`] : []),
  "",
  "| # | Prompt | Built to catch | Cov | Steps | Fidelity | Honest | Run | Judge |",
  "| --- | --- | --- | --- | ---: | ---: | --- | --- | --- |",
  ...rows.map((r) => `| ${r.n} | ${r.text.slice(0, 90).replace(/\|/g, "/")} | ${r.intent.slice(0, 60).replace(/\|/g, "/")} | ${r.coverage} | ${r.steps.length}/${r.assertions} | ${r.fidelity ?? "—"} | ${r.honesty === null ? "—" : r.honesty ? "yes" : "no"} | ${r.run ? `${r.run.passed ? "✓" : "✗"} ${r.run.ok}/${r.run.steps}${r.run.stoppedAt ? ` @${r.run.stoppedAt.split(":")[0]}` : ""}${r.run.runFidelity !== null ? ` · rf ${r.run.runFidelity}` : ""}` : "—"} | ${(r.run?.runNote || r.judgeNote).replace(/\|/g, "/")} |`),
].join("\n");
writeFileSync(join(dir, `prompts-${stamp}.md`), out);
console.log(`[${t()}] fidelity ${report.compile.fidelityMean} · ≥4 ${pct(report.compile.fidelityGood)} · honesty ${pct(report.compile.honesty)}${report.run ? ` · ran ${report.run.ran} passed ${report.run.passed} infra ${report.run.infraFailures}` : ""}`);
console.log(`report → data/eval/reports/prompts-${stamp}.md`);
process.exit(0);
