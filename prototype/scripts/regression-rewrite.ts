/**
 * REWRITE THE TERSE CASES IN A PERSON'S WORDS (approved by the user, 23 Nov 2026: about $5 of Slingring).
 *
 * The regression suite's catalog and API-library cases that read as engineer's notes ("Create eRFX → RFQ-only →
 * title → … → Publish", a single eight-word step, steps of two words) are rewritten by the model into the house
 * style: one action per step, each as the screen names it, the expected result as what the screen shows, nothing
 * invented. The facts stay: no new values, no new names, no new checks. The result is kept in
 * data/regression-rewrites.json keyed by the case id with a hash of the source text, and the suite builder shows it
 * (display only — a run keeps the case's own request).
 *
 *   npx tsx scripts/regression-rewrite.ts --dry          count and show what would be rewritten
 *   npx tsx scripts/regression-rewrite.ts --limit 40     rewrite the first 40 (for a look)
 *   npx tsx scripts/regression-rewrite.ts                rewrite every terse case not rewritten yet
 */
import { config } from "dotenv";
config();
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chat } from "../src/ai/llm.js";
import { buildSuite, type SuiteCase } from "../src/regression/suite.js";
import { STYLE_GUIDE } from "../src/agents/caseStyle.js";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "data", "regression-rewrites.json");
const DRY = process.argv.includes("--dry");
const LIMIT = Number(process.argv[process.argv.indexOf("--limit") + 1]) || 0;
const BATCH = Number(process.env.REWRITE_BATCH) || 8;
const IN_FLIGHT = 4;
let warned = false;

export interface Rewrite { sig: string; steps: string[]; expected: string; preconditions?: string; at: string }
const sigOf = (c: SuiteCase) => createHash("sha1").update([c.title, c.preconditions, ...c.steps, c.expected].join("\n")).digest("hex").slice(0, 12);

/** engineer's notes, not a tester's steps */
export function isTerse(c: SuiteCase): boolean {
  if (c.part || c.source === "sheet") return false;
  const st = c.steps;
  if (!st.length) return true;
  const w = st.map((s) => s.trim().split(/\s+/).length);
  const tiny = w.filter((x) => x <= 3).length;
  const avg = w.reduce((a, b) => a + b, 0) / w.length;
  return tiny >= Math.ceil(st.length / 2) || avg < 5 || (st.length === 1 && w[0] < 10) || st.some((s) => /[;|]\s*[a-z]/.test(s) && s.split(/[;|]/).length >= 3);
}

const SYSTEM = `You rewrite test cases so that anyone on a procurement team can follow them. ${STYLE_GUIDE}
HARD RULES FOR THIS REWRITE:
- Keep every fact: the same actions in the same order, the same values, the same names, the same expected outcome. Add nothing the case does not say; invent no button names, values, messages or checks. If a detail is missing, keep the step general ("Open the event") rather than guessing.
- One action per step, in plain words, as the screen names it (in quotes when it is a button, tab, field or menu). For an API case say what the call does in words ("Create the draft event through the API with the details the case gives"), never a method, path or code.
- Expected result: what the person sees, in one or two plain sentences. No code words, no status codes.
- Pre-conditions: one plain sentence saying the state the case starts from, only if the case gives one.
Answer with JSON only: {"cases":[{"id":"…","steps":["…"],"expected":"…","preconditions":"…"}]}.`;

function jsonOf(raw: string): any {
  const s = raw.indexOf("{"); const e = raw.lastIndexOf("}");
  if (s < 0 || e < 0) return null;
  try { return JSON.parse(raw.slice(s, e + 1)); } catch { return null; }
}

async function rewriteBatch(cases: SuiteCase[]): Promise<Record<string, Rewrite>> {
  const user = cases.map((c) => `CASE ${c.id}\nTitle: ${c.title}\nLayer: ${c.layer === "api" ? "API (through the app's calls)" : "browser (the screens)"}\nPre-conditions: ${c.preconditions}\nSteps:\n${c.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\nExpected: ${c.expected}`).join("\n\n");
  const raw = await chat([{ role: "system", content: SYSTEM }, { role: "user", content: `Rewrite these ${cases.length} cases.\n\n${user}` }], { tier: "fast", temperature: 0.2, maxTokens: 6000 }).catch((e) => { if (!warned) { warned = true; console.error(`model call failed: ${String((e as Error).message).slice(0, 200)}`); } return ""; });
  if (!raw && !warned) { warned = true; console.error("the model answered nothing"); }
  const j = jsonOf(raw);
  const out: Record<string, Rewrite> = {};
  for (const r of (j?.cases ?? []) as any[]) {
    const c = cases.find((x) => x.id === String(r?.id ?? "").trim());
    if (!c || !Array.isArray(r.steps) || !r.steps.length || typeof r.expected !== "string" || !r.expected.trim()) continue;
    const steps = r.steps.map((s: unknown) => String(s).replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean);
    // the model must not pad: more than three times the steps, or a step that names a code word, is refused
    if (steps.length > c.steps.length * 4 + 3 || steps.some((s: string) => /\b(GET|POST|PATCH|PUT|DELETE)\b|\/[a-z_]+\/|\bjson\b|\bpayload\b|\buuid\b/i.test(s))) continue;
    out[c.key] = { sig: sigOf(c), steps, expected: String(r.expected).trim(), ...(typeof r.preconditions === "string" && r.preconditions.trim() && r.preconditions.trim() !== "-" ? { preconditions: r.preconditions.trim() } : {}), at: new Date().toISOString() };
  }
  return out;
}

async function main() {
  // the cases in their OWN words: a rewrite is judged and keyed by the source text, never by an earlier rewrite
  const suite = buildSuite({ write: false, rewrites: false });
  const have: Record<string, Rewrite> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const todo = suite.cases.filter((c) => isTerse(c) && have[c.key]?.sig !== sigOf(c));
  const by: Record<string, number> = {};
  for (const c of todo) by[`${c.source}/${c.layer}`] = (by[`${c.source}/${c.layer}`] ?? 0) + 1;
  console.log(`${todo.length} terse case(s) to rewrite (${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(", ")}); ${Object.keys(have).length} rewritten before`);
  if (DRY) { for (const c of todo.slice(0, 8)) console.log(`  ${c.id} | ${c.steps.join(" / ").slice(0, 120)}`); return; }
  const list = LIMIT ? todo.slice(0, LIMIT) : todo;
  const batches: SuiteCase[][] = [];
  for (let i = 0; i < list.length; i += BATCH) batches.push(list.slice(i, i + BATCH));
  let done = 0, kept = 0;
  const t0 = Date.now();
  let next = 0;
  const save = () => writeFileSync(OUT, JSON.stringify(have, null, 1));
  await Promise.all(Array.from({ length: IN_FLIGHT }, async () => {
    while (next < batches.length) {
      const b = batches[next++];
      const got = await rewriteBatch(b);
      Object.assign(have, got);
      done += b.length; kept += Object.keys(got).length;
      if (done % (BATCH * 5) === 0 || done === list.length) { save(); console.log(`${done}/${list.length} looked at, ${kept} rewritten, ${Math.round((Date.now() - t0) / 60_000)} min`); }
    }
  }));
  save();
  console.log(`done: ${kept} of ${list.length} rewritten in ${Math.round((Date.now() - t0) / 60_000)} min → ${OUT}`);
  const ex = list.filter((c) => have[c.key]).slice(0, 3);
  for (const c of ex) console.log(`\n${c.id} — ${c.title}\n  before: ${c.steps.join(" / ").slice(0, 160)}\n  after:  ${have[c.key].steps.join(" / ").slice(0, 300)}\n  expect: ${have[c.key].expected.slice(0, 160)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
