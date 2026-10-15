import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
 * The set is kept with the run (data/run-cases/<key>.json, the key being the
 * run's id), with what the tester did to it: a suggested case they ran keeps
 * its Pass or Fail and the link to that run. Asking again shows the kept set;
 * "Write again" writes a fresh one, and every case already run keeps its result
 * in it. (They used to be written afresh on every ask and kept only in the
 * page, so a case run a minute earlier came back "Suggested".)
 *
 *   POST /api/run-cases { transcript, ask?, mode?, kind?, company?, runIds?, key?, fresh? }
 *     → { cases, source: "saved" | "ai" | "steps", note?, key?, savedAt? }
 *   PUT  /api/run-cases { key, cases }   the table as it stands — results, edits, ticks
 */

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, "..", "..", "data");
const UI_TESTS = join(here, "..", "..", "..", "procol-ui-tests");

// ── kept with the run ──────────────────────────────────────────────────────

const SAVED = join(DATA, "run-cases");

/** A case as the table keeps it: what was written, plus what the tester did with it. */
type KeptCase = RunCase & { why?: string; runId?: string | null; testedAt?: string; keep?: boolean; review?: Review };
/** A person's sign-off on spine.ai's Pass or Fail: pending until they approve it or change it. */
type Review = { state: "pending" | "approved" | "changed"; by?: string; at?: string; from?: string };
const reviewOf = (r: any): Review | undefined =>
  r && ["pending", "approved", "changed"].includes(r.state)
    ? { state: r.state, by: str(r.by, 80) || undefined, at: typeof r.at === "string" && !Number.isNaN(Date.parse(r.at)) ? r.at : undefined, from: str(r.from, 20) || undefined }
    : undefined;
interface KeptSet {
  key: string;
  runIds: string[];
  ask: string;
  source: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  cases: KeptCase[];
}

function loadSet(key: string): KeptSet | undefined {
  const d = readJson(join(SAVED, `${key}.json`));
  return d && Array.isArray(d.cases) ? (d as KeptSet) : undefined;
}
function saveSet(set: KeptSet): void {
  mkdirSync(SAVED, { recursive: true });
  const file = join(SAVED, `${set.key}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify(set, null, 1));
  renameSync(`${file}.tmp`, file);
}

/**
 * A fresh set, with the results of the old one carried in: a case already run
 * keeps its status, why and run link, matched by library id or by a scenario
 * that says the same thing; one the fresh set no longer has is kept at the end.
 * A result is never dropped by writing again.
 */
function carryOver(fresh: RunCase[], old: KeptCase[]): KeptCase[] {
  const out: KeptCase[] = fresh.map((c) => ({ ...c }));
  const used = new Set<number>();
  for (const c of out) {
    const w = words(c.scenario);
    let best = -1;
    let bestJ = 0;
    old.forEach((o, i) => {
      if (used.has(i) || !o.testedAt) return;
      if (c.libraryId && o.libraryId === c.libraryId) {
        if (bestJ < 1) [best, bestJ] = [i, 1];
        return;
      }
      const t = words(o.scenario);
      const both = overlap(w, t);
      const j = both / (w.size + t.size - both || 1);
      if (j >= 0.6 && j > bestJ) [best, bestJ] = [i, j];
    });
    if (best < 0) continue;
    const o = old[best];
    used.add(best);
    Object.assign(c, { scenario: o.scenario, expected: o.expected, status: o.status, why: o.why, runId: o.runId, testedAt: o.testedAt, automated: o.automated, review: o.review });
  }
  old.forEach((o, i) => {
    if (o.testedAt && !used.has(i)) out.push({ ...o });
  });
  return out.map((c, i) => ({ ...c, id: `TC-${String(i + 1).padStart(3, "0")}` }));
}

/** One case from the page, back to the kept shape — only known fields, bounded. */
function fromPage(c: any, i: number): KeptCase | null {
  if (!c || !str(c.scenario)) return null;
  return {
    id: str(c.id, 12) || `TC-${String(i + 1).padStart(3, "0")}`,
    module: str(c.module, 60),
    feature: str(c.feature, 80),
    scenario: str(c.scenario, 400),
    preconditions: str(c.preconditions),
    steps: (Array.isArray(c.steps) ? c.steps : []).map((s: unknown) => str(s, 300)).filter(Boolean).slice(0, 10),
    testData: str(c.testData, 300),
    expected: str(c.expected),
    priority: PRIORITIES.has(c.priority) ? c.priority : "P1",
    type: TYPES.has(c.type) ? c.type : "Positive",
    layer: c.layer === "API" ? "API" : "UI",
    sourceStep: str(c.sourceStep, 120),
    status: str(c.status, 60) || "Suggested",
    libraryId: str(c.libraryId, 60) || undefined,
    similarTo: str(c.similarTo, 60) || undefined,
    automated: str(c.automated, 60),
    why: str(c.why, 400) || undefined,
    runId: safeId(c.runId) ?? null,
    testedAt: typeof c.testedAt === "string" && !Number.isNaN(Date.parse(c.testedAt)) ? c.testedAt : undefined,
    keep: c.keep !== false,
    review: reviewOf(c.review),
  };
}

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
  // The table as it stands — a case's result after it ran, an edit, a tick.
  if (ctx.req.method === "PUT") {
    const b = await ctx.body();
    const key = safeId(b?.key);
    if (!key || !Array.isArray(b?.cases)) {
      ctx.json({ error: "send the set's key and its cases" }, 400);
      return true;
    }
    const cases = (b.cases as unknown[]).slice(0, 40).map(fromPage).filter((c): c is KeptCase => !!c);
    const was = loadSet(key);
    const now = new Date().toISOString();
    saveSet({ key, runIds: was?.runIds ?? [key], ask: was?.ask ?? "", source: was?.source ?? "page", note: was?.note, createdAt: was?.createdAt ?? now, updatedAt: now, cases });
    ctx.json({ ok: true, savedAt: now });
    return true;
  }
  if (ctx.req.method !== "POST") {
    ctx.json({ error: "POST the run's transcript" }, 405);
    return true;
  }
  const started = Date.now();
  const took = () => `${Math.round((Date.now() - started) / 1000)}s`;
  const b = await ctx.body();
  const key = safeId(b?.key) ?? (Array.isArray(b?.runIds) ? safeId(b.runIds[0]) : undefined);
  const kept = key ? loadSet(key) : undefined;
  // Asked again: the set kept with this run, with what was done to it.
  if (kept && b?.fresh !== true) {
    console.log(`[run-cases] ${kept.cases.length} kept case(s) for ${key}`);
    ctx.json({ cases: kept.cases, source: "saved", note: kept.note, key, savedAt: kept.updatedAt });
    return true;
  }
  /** Keep the set with the run; a fresh one carries the old one's results. */
  const keep = (cases: RunCase[], source: string, note?: string): KeptCase[] => {
    if (!key) return cases;
    const now = new Date().toISOString();
    const merged = kept ? carryOver(cases, kept.cases) : cases;
    saveSet({ key, runIds: runIdsOf(b), ask: str(b?.ask, 400), source, note, createdAt: kept?.createdAt ?? now, updatedAt: now, cases: merged });
    return merged;
  };
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
    const why = `Written without AI${note ? ` — ${note}` : ""}: the run's main flow and its failures only. Write again for variations.`;
    const out = keep(fromSteps(ask, [...transcript.split("\n"), ...stored], layer), "steps", why);
    console.log(`[run-cases] ${out.length} case(s) from the steps, without AI, in ${took()}${note ? ` — ${note}` : ""}`);
    ctx.json({ cases: out, source: "steps", note: why, key });
    return true;
  }
  const out = keep(cases, "ai");
  console.log(`[run-cases] ${cases.length} case(s) written by AI in ${took()}${kept ? `, results carried from the kept set` : ""}`);
  ctx.json({ cases: out, source: "ai", runIds, key });
  return true;
};

const runIdsOf = (b: any): string[] => (Array.isArray(b?.runIds) ? b.runIds : []).map(safeId).filter(Boolean).slice(0, 4) as string[];
