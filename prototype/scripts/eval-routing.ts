/**
 * ROUTING EVAL — measures how accurately `interpret()` (src/agents/uiIntent.ts)
 * routes free-text QA instructions to real journeys in UI_FLOWS.
 *
 * This is an EVALUATION harness, not a training script: it calls the existing,
 * unmodified `interpret()` against a labelled corpus (prompts/routing.jsonl)
 * and reports how often its answer matches the label. Nothing here changes
 * model weights or the router's code — see prompts/README.md for the full
 * distinction between "evaluation" and "fine-tuning".
 *
 * Usage:
 *   npm run eval:routing
 *   EVAL_MIN_ACCURACY=0.9 npm run eval:routing
 */
import { config as loadEnv } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// Load our own .env the same way scripts/test-llm.ts does, BEFORE importing
// anything that reads process.env at call time.
loadEnv({ path: join(here, "..", ".env") });

const { interpret } = await import("../src/agents/uiIntent.js");
const { llmMode } = await import("../src/ai/llm.js");
const { UI_FLOWS } = await import("../src/ui/uiFlowRunner.js");
import type { UiIntent } from "../src/agents/uiIntent.js";

// ── Corpus types ────────────────────────────────────────────────────────────
interface ExpectedIntent {
  flowKey?: string;
  flowKeyAnyOf?: string[];
  /**
   * The prompt has no correct journey — it asks for something the platform
   * cannot do at all. Scoring flowKey would be scoring a coin toss, so only
   * the caveat is judged. Pinning an arbitrary "expected" journey on such a
   * prompt makes the accuracy number mean less, not more.
   */
  flowKeyAny?: boolean;
  lineItems: number | null;
  template: string | null;
  scheduleMinutes: number | null;
  expectCaveat?: true;
}

interface CorpusCase {
  id: string;
  prompt: string;
  expect: ExpectedIntent;
  why: string;
  tags: string[];
}

interface CaseResult {
  id: string;
  prompt: string;
  tags: string[];
  expect: ExpectedIntent;
  got: {
    flowKey: string;
    lineItems: number | null;
    template: string | null;
    scheduleMinutes: number | null;
    caveat: string | null;
    source: "llm" | "keyword";
    reasoning: string;
  };
  pass: {
    flowKey: boolean;
    lineItems: boolean;
    template: boolean;
    scheduleMinutes: boolean;
    caveat: boolean;
  };
  overallPass: boolean;
  attempts: number;
}

// ── Load + sanity-check the corpus ──────────────────────────────────────────
const CORPUS_PATH = join(here, "..", "prompts", "routing.jsonl");
const LAST_EVAL_PATH = join(here, "..", "prompts", "last-eval.json");

const rawLines = readFileSync(CORPUS_PATH, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
const cases: CorpusCase[] = rawLines.map((line, i) => {
  try {
    return JSON.parse(line) as CorpusCase;
  } catch (e) {
    throw new Error(`routing.jsonl line ${i + 1} is not valid JSON: ${(e as Error).message}`);
  }
});

const VALID_KEYS = new Set(UI_FLOWS.map((f) => f.key));
for (const c of cases) {
  if (c.expect.flowKeyAny) continue;
  const keys = c.expect.flowKey ? [c.expect.flowKey] : c.expect.flowKeyAnyOf ?? [];
  if (keys.length === 0) {
    throw new Error(`case ${c.id} has neither expect.flowKey nor expect.flowKeyAnyOf`);
  }
  for (const k of keys) {
    if (!VALID_KEYS.has(k)) {
      throw new Error(`case ${c.id} references flowKey "${k}", which is not in UI_FLOWS`);
    }
  }
}

const coveredKeys = new Set<string>();
for (const c of cases) for (const k of c.expect.flowKey ? [c.expect.flowKey] : c.expect.flowKeyAnyOf ?? []) coveredKeys.add(k);
const uncoveredKeys = [...VALID_KEYS].filter((k) => !coveredKeys.has(k));
if (uncoveredKeys.length) {
  console.warn(`WARNING: these UI_FLOWS keys appear in no corpus case: ${uncoveredKeys.join(", ")}`);
}

// ── Helpers ──────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const norm = (v: unknown): unknown => (v === undefined ? null : v);
const normTemplate = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : null);

/**
 * `interpret()` swallows every LLM failure (network error, unparseable
 * response, 429/503 that exhausted its own one retry) into a generic
 * keyword-routed UiIntent, indistinguishable from the outside except by its
 * templated reasoning string. When a key IS configured (llmMode()==="groq")
 * but we still got that generic fallback, it's cheap and safe to assume a
 * transient/rate-limit hiccup and retry the whole case with backoff, rather
 * than recording a false "keyword routing" result. A genuine hallucinated
 * flowKey is NOT retried — interpret() rewrites `reasoning` in that case
 * ("...which is not a journey that exists...") and that is a real, reportable
 * finding, not something to paper over by retrying.
 */
const GENERIC_FALLBACK_RE = /no LLM key set, so this is keyword routing/;

async function interpretWithRetry(prompt: string, maxAttempts = 4): Promise<{ intent: UiIntent; attempts: number }> {
  const mode = llmMode();
  let last: UiIntent | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const intent = await interpret(prompt);
    last = intent;
    const looksLikeTransientFallback =
      mode !== "fallback" && intent.source === "keyword" && GENERIC_FALLBACK_RE.test(intent.reasoning);
    if (!looksLikeTransientFallback || attempt === maxAttempts) {
      return { intent, attempts: attempt };
    }
    const backoffMs = Math.min(8000, 1000 * 2 ** (attempt - 1));
    console.warn(`  … retrying "${prompt.slice(0, 50)}..." after apparent transient failure (attempt ${attempt}, waiting ${backoffMs}ms)`);
    await sleep(backoffMs);
  }
  return { intent: last!, attempts: maxAttempts };
}

// ── Run ──────────────────────────────────────────────────────────────────
console.log(`llmMode: ${llmMode()}`);
console.log(`Running ${cases.length} cases from ${CORPUS_PATH}\n`);

const results: CaseResult[] = [];
const INTER_CASE_DELAY_MS = Number(process.env.EVAL_DELAY_MS) || 350;

for (const c of cases) {
  const { intent, attempts } = await interpretWithRetry(c.prompt);

  const gotFlowKey = intent.flowKey;
  const expectKeys = c.expect.flowKey ? [c.expect.flowKey] : c.expect.flowKeyAnyOf ?? [];
  // "Any journey" cases (the platform cannot do what was asked): any REAL
  // journey counts — only the caveat says whether it understood.
  const flowKeyPass = c.expect.flowKeyAny ? VALID_KEYS.has(gotFlowKey) : expectKeys.includes(gotFlowKey);

  const lineItemsPass = norm(intent.lineItems) === norm(c.expect.lineItems);
  const templatePass = normTemplate(intent.template) === normTemplate(c.expect.template);
  const scheduleMinutesPass = norm(intent.scheduleMinutes) === norm(c.expect.scheduleMinutes);

  const wantsCaveat = c.expect.expectCaveat === true;
  const gotCaveat = typeof intent.caveat === "string" && intent.caveat.length > 0;
  const caveatPass = wantsCaveat === gotCaveat;

  const overallPass = flowKeyPass && lineItemsPass && templatePass && scheduleMinutesPass && caveatPass;

  results.push({
    id: c.id,
    prompt: c.prompt,
    tags: c.tags,
    expect: c.expect,
    got: {
      flowKey: gotFlowKey,
      lineItems: norm(intent.lineItems) as number | null,
      template: (intent.template ?? null) as string | null,
      scheduleMinutes: norm(intent.scheduleMinutes) as number | null,
      caveat: intent.caveat ?? null,
      source: intent.source,
      reasoning: intent.reasoning,
    },
    pass: { flowKey: flowKeyPass, lineItems: lineItemsPass, template: templatePass, scheduleMinutes: scheduleMinutesPass, caveat: caveatPass },
    overallPass,
    attempts,
  });

  const mark = overallPass ? "PASS" : "FAIL";
  process.stdout.write(`${mark}  ${c.id}  ${flowKeyPass ? "" : "[flowKey] "}${lineItemsPass ? "" : "[lineItems] "}${templatePass ? "" : "[template] "}${scheduleMinutesPass ? "" : "[scheduleMinutes] "}${caveatPass ? "" : "[caveat] "}\n`);

  await sleep(INTER_CASE_DELAY_MS);
}

// ── Scoring ──────────────────────────────────────────────────────────────
const total = results.length;
const pct = (n: number) => (total ? ((n / total) * 100).toFixed(1) : "0.0");

const flowKeyAccuracy = results.filter((r) => r.pass.flowKey).length / total;
const lineItemsAccuracy = results.filter((r) => r.pass.lineItems).length / total;
const templateAccuracy = results.filter((r) => r.pass.template).length / total;
const scheduleMinutesAccuracy = results.filter((r) => r.pass.scheduleMinutes).length / total;
const overallExactAccuracy = results.filter((r) => r.overallPass).length / total;

const caveatCases = results.filter((r) => r.expect.expectCaveat === true || r.got.caveat);
const tp = results.filter((r) => r.expect.expectCaveat === true && r.got.caveat).length;
const fp = results.filter((r) => r.expect.expectCaveat !== true && r.got.caveat).length;
const fn = results.filter((r) => r.expect.expectCaveat === true && !r.got.caveat).length;
const caveatPrecision = tp + fp ? tp / (tp + fp) : 1;
const caveatRecall = tp + fn ? tp / (tp + fn) : 1;

console.log("\n================ SUMMARY ================");
console.log(`Total cases:            ${total}`);
console.log(`flowKey accuracy:       ${(flowKeyAccuracy * 100).toFixed(1)}%  (${results.filter((r) => r.pass.flowKey).length}/${total})`);
console.log(`lineItems accuracy:     ${(lineItemsAccuracy * 100).toFixed(1)}%`);
console.log(`template accuracy:      ${(templateAccuracy * 100).toFixed(1)}%`);
console.log(`scheduleMinutes acc.:   ${(scheduleMinutesAccuracy * 100).toFixed(1)}%`);
console.log(`caveat precision:       ${(caveatPrecision * 100).toFixed(1)}%  (tp=${tp} fp=${fp})`);
console.log(`caveat recall:          ${(caveatRecall * 100).toFixed(1)}%  (tp=${tp} fn=${fn})`);
console.log(`ALL-FIELDS exact match: ${(overallExactAccuracy * 100).toFixed(1)}%`);

// Per-journey accuracy (bucket by the case's expected key set; ambiguous
// (flowKeyAnyOf) cases get their own bucket rather than being folded into one
// of their candidate keys, since a hit on one candidate isn't a hit against a
// pinned single-journey expectation).
const buckets = new Map<string, CaseResult[]>();
for (const r of results) {
  const key = r.expect.flowKey ?? (r.expect.flowKeyAnyOf ? `(ambiguous) ${r.expect.flowKeyAnyOf.join(" | ")}` : "(any journey — caveat only)");
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key)!.push(r);
}
console.log("\n--- accuracy per journey (flowKey match) ---");
const bucketRows = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
for (const [key, rs] of bucketRows) {
  const ok = rs.filter((r) => r.pass.flowKey).length;
  console.log(`  ${ok}/${rs.length}  ${key}`);
}

const misses = results.filter((r) => !r.overallPass);
console.log(`\n--- misses (${misses.length}/${total}) ---`);
for (const r of misses) {
  const expected = r.expect.flowKey ?? `anyOf(${r.expect.flowKeyAnyOf!.join(",")})`;
  console.log(`  ${r.id}: "${r.prompt}"`);
  console.log(`      → got flowKey=${r.got.flowKey} lineItems=${r.got.lineItems} template=${r.got.template} scheduleMinutes=${r.got.scheduleMinutes} caveat=${r.got.caveat ? JSON.stringify(r.got.caveat) : "null"}`);
  console.log(`        expected flowKey=${expected} lineItems=${JSON.stringify(r.expect.lineItems)} template=${JSON.stringify(r.expect.template)} scheduleMinutes=${JSON.stringify(r.expect.scheduleMinutes)} expectCaveat=${r.expect.expectCaveat === true}`);
}

writeFileSync(
  LAST_EVAL_PATH,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      llmMode: llmMode(),
      total,
      summary: {
        flowKeyAccuracy,
        lineItemsAccuracy,
        templateAccuracy,
        scheduleMinutesAccuracy,
        overallExactAccuracy,
        caveatPrecision,
        caveatRecall,
      },
      results,
    },
    null,
    2,
  ),
);
console.log(`\nWrote ${LAST_EVAL_PATH}`);

const threshold = Number(process.env.EVAL_MIN_ACCURACY) || 0.85;
console.log(`\nThreshold (EVAL_MIN_ACCURACY): ${threshold}`);
if (flowKeyAccuracy < threshold) {
  console.error(`FAIL: flowKey accuracy ${(flowKeyAccuracy * 100).toFixed(1)}% is below the ${(threshold * 100).toFixed(1)}% threshold.`);
  process.exitCode = 1;
} else {
  console.log(`OK: flowKey accuracy ${(flowKeyAccuracy * 100).toFixed(1)}% meets the ${(threshold * 100).toFixed(1)}% threshold.`);
}
