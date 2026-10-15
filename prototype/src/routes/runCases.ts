import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RouteHandler } from "./index.js";
import { chat } from "../ai/llm.js";

/**
 * TEST CASES FROM A FINISHED RUN — the "Write test cases from this run" button
 * under a session's DONE box (public/runCases.js).
 *
 * Grounded the way QA agents that write cases from what they saw are (QA.tech,
 * Octomind, Checksum): the run is the evidence. The page sends what its turn
 * showed — the ask, every narrated step with its outcome, how it ended — and
 * the run ids on its DONE box; the stored run adds the requests and statuses.
 * Three kinds of case come back, each saying which step it came from:
 *  - main flow: the run itself, in cases of at most ten steps, with this run's result;
 *  - variations around the steps that ran, taken from the case library when one
 *    fits (cited by id), else "Suggested" with an expected result to confirm;
 *  - regression: one per failure the run hit.
 * Nothing is saved here: the page shows them for review and exports the ticked ones.
 *
 *   POST /api/run-cases { transcript, ask?, mode?, kind?, company?, runIds? }
 *     → { cases: RunCase[], source: "ai" | "steps", note? }
 */

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, "..", "..", "data");
const UI_TESTS = join(here, "..", "..", "..", "procol-ui-tests");

export interface RunCase {
  id: string;
  module: string;
  feature: string;
  scenario: string;
  preconditions: string;
  steps: string[];
  testData: string;
  expected: string;
  priority: "P0" | "P1" | "P2";
  type: "Positive" | "Negative" | "Edge" | "Regression";
  layer: "UI" | "API";
  sourceStep: string;
  status: string;
  libraryId?: string;
  similarTo?: string;
  automated: string;
}

// ── the stored run, by the ids on the DONE box ─────────────────────────────

const safeId = (s: unknown) => (typeof s === "string" && /^[\w.-]{3,80}$/.test(s) ? s : undefined);
const readJson = (p: string): any => {
  try {
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : undefined;
  } catch {
    return undefined;
  }
};

/** What the stored run adds to the page's words: each step's request and status, the failed cases. */
function storedRun(id: string): string[] {
  const api = readJson(join(DATA, "runs", `${id}.json`));
  if (api) {
    const out: string[] = [];
    for (const s of api.journey?.steps ?? []) {
      out.push(
        `step ${s.n}: ${s.title} — ${s.verdict}${s.call ? ` (${s.call.method} ${s.call.path} → ${s.status ?? "no reply"})` : ""}: ${String(s.actual ?? "").slice(0, 220)}`,
      );
    }
    for (const c of (api.checkResults ?? []).filter((c: any) => !c.pass && !c.inconclusive).slice(0, 15)) {
      out.push(`failed case ${c.id}: ${c.scenario ?? ""} — ${String(c.message ?? c.verdict ?? "").slice(0, 200)}`);
    }
    return out;
  }
  const trail = readJson(join(DATA, "ui-trails", `${id}.json`));
  if (trail) {
    return (trail.steps ?? [])
      .filter((s: any) => s.phase !== "playwright" && s.phase !== "queue")
      .slice(0, 80)
      .map((s: any) => `[${s.phase}] ${s.kind}: ${String(s.text ?? "").slice(0, 220)}`);
  }
  const plan = readJson(join(UI_TESTS, ".plans", `${id}-result.json`));
  if (plan) {
    return (plan.steps ?? []).map(
      (s: any, i: number) => `step ${i + 1}: ${s.step}${s.args && Object.keys(s.args).length ? ` ${JSON.stringify(s.args)}` : ""} — ${s.status}${s.detail ? `: ${String(s.detail).slice(0, 200)}` : ""}`,
    );
  }
  return [];
}

// ── the case library: what a variation should reuse, and what is already there ──

type LibCase = { id: string; layer: string; section?: string; title: string; expected?: string; priority?: string };
let LIB: LibCase[] | undefined;
function library(): LibCase[] {
  if (LIB) return LIB;
  const d = readJson(join(DATA, "test-cases.json"));
  LIB = (d?.cases ?? []).filter((c: any) => c?.id && c?.title);
  return LIB!;
}

const STOP = new Set("the and with from into that this then after when their them its for not are was has have can still try please event events vendor vendors buyer step steps".split(" "));
function words(text: string): Set<string> {
  return new Set(
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => w.replace(/(ing|ed|es|s)$/, "")),
  );
}
const overlap = (a: Set<string>, b: Set<string>) => {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
};

/** The library cases closest to what the run did — offered to the model to reuse, never to invent. */
function related(text: string, n = 30): LibCase[] {
  const run = words(text);
  return library()
    .map((c) => {
      const t = words(`${c.title} ${c.section ?? ""}`);
      return { c, score: t.size ? overlap(t, run) / t.size : 0 };
    })
    .filter((x) => x.score >= 0.34)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.c);
}

/** A library case that says the same thing, when the model did not cite one. */
function similar(scenario: string): string | undefined {
  const s = words(scenario);
  if (s.size < 3) return undefined;
  let best: { id: string; j: number } | undefined;
  for (const c of library()) {
    const t = words(c.title);
    const both = overlap(s, t);
    const j = both / (s.size + t.size - both || 1);
    if (j >= 0.55 && (!best || j > best.j)) best = { id: c.id, j };
  }
  return best?.id;
}

// ── writing them ───────────────────────────────────────────────────────────

const SYSTEM = [
  "You write manual test cases for a QA team from ONE finished automation run on Procol, a procure-to-pay platform (buyers run sourcing events; vendors bid).",
  "The run is your evidence. Rules:",
  "- MAIN FLOW: restate what ran as 1-3 positive cases of at most 10 steps each. Signing in, the company and data set up beforehand go in preconditions, not steps. status = what this run showed: \"Pass\", \"Fail at step N\" or \"Not reached\".",
  "- VARIATIONS: 4-8 negative or edge cases around steps that actually ran (missing or invalid input, limits, permissions, timing, who may do it). Prefer a LIBRARY CASE when one fits: reuse its expected result and put its id in libraryId. With no library case, state the expected result only if the run shows the rule; otherwise end it with \"(to confirm)\". status \"Suggested\".",
  "- REGRESSION: one case for each failure or bug the run hit, checking it is fixed. status \"Suggested\".",
  "- Write for a tester who has never seen the automation: plain English, screens and buttons named as the run names them. Never invent a field, value, vendor, template or endpoint that is not in the run or the library.",
  "- priority: P0 = the main flow and anything that blocks it; P1 = important variations; P2 = the rest.",
  "- layer: \"UI\" for screen steps, \"API\" for request steps.",
  "- sourceStep: the run step it comes from, as \"step N: <title>\".",
  "- At most 15 cases.",
  'Return JSON only: {"cases":[{"module":"","feature":"","scenario":"","preconditions":"","steps":["..."],"testData":"","expected":"","priority":"P0","type":"Positive|Negative|Edge|Regression","layer":"UI|API","sourceStep":"","status":"","libraryId":""}]}',
].join("\n");

const PRIORITIES = new Set(["P0", "P1", "P2"]);
const TYPES = new Set(["Positive", "Negative", "Edge", "Regression"]);
const str = (v: unknown, max = 600) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function tidy(raw: any[], fromRun: boolean): RunCase[] {
  const ids = new Set(library().map((c) => c.id));
  return raw
    .filter((c) => c && str(c.scenario))
    .slice(0, 15)
    .map((c, i) => {
      const type = TYPES.has(c.type) ? c.type : "Positive";
      const libraryId = ids.has(str(c.libraryId)) ? str(c.libraryId) : undefined;
      const scenario = str(c.scenario, 240);
      const status = str(c.status, 60) || (type === "Positive" && fromRun ? "Pass" : "Suggested");
      return {
        id: `TC-${String(i + 1).padStart(3, "0")}`,
        module: str(c.module, 60),
        feature: str(c.feature, 80),
        scenario,
        preconditions: str(c.preconditions),
        steps: (Array.isArray(c.steps) ? c.steps : [c.steps]).map((s: unknown) => str(s, 300)).filter(Boolean).slice(0, 10),
        testData: str(c.testData, 300),
        expected: str(c.expected),
        priority: PRIORITIES.has(c.priority) ? c.priority : "P1",
        type,
        layer: c.layer === "API" ? "API" : "UI",
        sourceStep: str(c.sourceStep, 120),
        status,
        libraryId,
        similarTo: libraryId ? undefined : similar(scenario),
        automated: libraryId ? "Yes — library case" : status !== "Suggested" ? "Yes — this run's journey" : "Not yet",
      } satisfies RunCase;
    });
}

/** Without the model: the run as one main-flow case, and a regression case per failed step. */
function fromSteps(ask: string, lines: string[], layer: "UI" | "API"): RunCase[] {
  const steps = lines.filter((l) => /^\s*(step \d+:|\[)/i.test(l)).slice(0, 10).map((l) => l.replace(/^\s*step \d+:\s*/i, "").split(" — ")[0]);
  const failed = lines.filter((l) => /— (broken|refused|failed)|\bbad:|✗/i.test(l)).slice(0, 5);
  const main = {
    scenario: ask || "The journey this run walked",
    steps: steps.length ? steps : ["Repeat the steps of the run"],
    expected: "Every step completes as it did in a passing run.",
    priority: "P0",
    type: "Positive",
    layer,
    sourceStep: "the whole run",
    status: failed.length ? "Fail" : "Pass",
  };
  const regressions = failed.map((l) => ({
    scenario: `It works again: ${l.replace(/^\s*step \d+:\s*/i, "").split(" — ")[0]}`,
    steps: ["Repeat the run up to this step", "Do the step again"],
    expected: "The step completes without the failure this run saw (to confirm).",
    priority: "P1",
    type: "Regression",
    layer,
    sourceStep: l.slice(0, 120),
    status: "Suggested",
  }));
  return tidy([main, ...regressions], true);
}

export const handle: RouteHandler = async (ctx) => {
  if (ctx.path !== "/api/run-cases") return false;
  if (ctx.req.method !== "POST") {
    ctx.json({ error: "POST the run's transcript" }, 405);
    return true;
  }
  const started = Date.now();
  const took = () => `${Math.round((Date.now() - started) / 1000)}s`;
  const b = await ctx.body();
  const transcript = String(b?.transcript ?? "").slice(0, 16_000);
  const ask = str(b?.ask, 400);
  if (!transcript.trim()) {
    ctx.json({ error: "nothing from the run was sent" }, 400);
    return true;
  }
  const runIds = (Array.isArray(b?.runIds) ? b.runIds : []).map(safeId).filter(Boolean).slice(0, 4) as string[];
  const stored = runIds.flatMap((id) => storedRun(id)).slice(0, 120);
  const layer: "UI" | "API" = b?.mode === "api" ? "API" : "UI";
  const lib = related(`${ask} ${transcript} ${stored.join(" ")}`);

  const user = [
    `RUN: ${ask || "(no request text)"} · channel ${str(b?.mode, 10) || "?"} · kind ${str(b?.kind, 20) || "?"}${b?.company ? ` · company ${str(b.company, 60)}` : ""}`,
    `WHAT THE SESSION SHOWED (its own words, in order):\n${transcript}`,
    stored.length ? `THE STORED RUN (requests and statuses):\n${stored.join("\n")}` : "",
    lib.length
      ? `LIBRARY CASES that may fit (reuse their expected result and id; do not copy ones that do not fit):\n${lib
          .map((c) => `- ${c.id} [${c.layer}${c.priority ? ` ${c.priority}` : ""}] ${c.title}${c.expected ? ` | expected: ${str(c.expected, 180)}` : ""}`)
          .join("\n")}`
      : "LIBRARY CASES: none close to this run.",
  ]
    .filter(Boolean)
    .join("\n\n");

  let cases: RunCase[] = [];
  let note: string | undefined;
  try {
    const raw = await chat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      // The gateway's reason model has been timing out at its full 90 s
      // (server log, 14 Oct); hand over to the next model sooner so the
      // request stays well inside what a browser will wait for.
      { tier: "reason", temperature: 0.2, maxTokens: 4500, deadlineMs: 45_000 },
    );
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    const parsed = json ? JSON.parse(json) : null;
    cases = tidy(Array.isArray(parsed?.cases) ? parsed.cases : [], true);
  } catch (e) {
    note = `the AI did not answer (${str((e as Error).message, 120)})`;
  }
  if (!cases.length) {
    cases = fromSteps(ask, [...transcript.split("\n"), ...stored], layer);
    console.log(`[run-cases] ${cases.length} case(s) from the steps, without AI, in ${took()}${note ? ` — ${note}` : ""}`);
    ctx.json({
      cases,
      source: "steps",
      note: `Written without AI${note ? ` — ${note}` : ""}: the run's main flow and its failures only. Try again for variations.`,
    });
    return true;
  }
  console.log(`[run-cases] ${cases.length} case(s) written by AI in ${took()}`);
  ctx.json({ cases, source: "ai", runIds });
  return true;
};
