/**
 * How well does the layer decider (src/agents/layerDecider.ts) pick where a case
 * can be observed — and what does it say about the written screen cases?
 *
 *   npx tsx scripts/layer-eval.ts            rules only (no model)
 *   npx tsx scripts/layer-eval.ts --model    ties broken by the fast-tier model
 *   npx tsx scripts/layer-eval.ts --json out.json   also write every decision
 *
 * 1. Accuracy on data/evals/layer-eval.json (60 catalog cases labelled by hand).
 * 2. The split for the written screen cases (UI-* except the cross-check):
 *    really UI, API-only, or both.
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allCases } from "../src/checks/testCatalog.js";
import { decideLayer, type Layer } from "../src/agents/layerDecider.js";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
const MODEL = process.argv.includes("--model");
const jsonAt = process.argv.indexOf("--json");
const jsonOut = jsonAt >= 0 ? process.argv[jsonAt + 1] : undefined;

type Row = { id: string; layer: Layer };
const evalSet = JSON.parse(readFileSync(join(here, "..", "data", "evals", "layer-eval.json"), "utf8")) as { rows: Row[]; secondTuning?: Row[]; heldOut?: Row[] };
const byId = new Map(allCases().map((c) => [c.id, c]));

/** 3-way accuracy, and the decision that matters for routing: does the case need the browser (ui|both) or not (api)? */
async function score(rows: Row[]) {
  let same = 0;
  let browser = 0;
  for (const r of rows) {
    const c = byId.get(r.id);
    if (!c) continue;
    const d = await decideLayer(c, { model: MODEL });
    if (d.layer === r.layer) same += 1;
    if ((d.layer === "api") === (r.layer === "api")) browser += 1;
  }
  return `${same}/${rows.length} = ${((same / rows.length) * 100).toFixed(0)}% exact layer · ${browser}/${rows.length} = ${((browser / rows.length) * 100).toFixed(0)}% right on "needs the browser or not"`;
}

let right = 0;
const confusion: Record<string, number> = {};
const wrong: string[] = [];
for (const r of evalSet.rows) {
  const c = byId.get(r.id);
  if (!c) continue;
  const d = await decideLayer(c, { model: MODEL });
  confusion[`${r.layer}→${d.layer}`] = (confusion[`${r.layer}→${d.layer}`] ?? 0) + 1;
  if (d.layer === r.layer) right += 1;
  else wrong.push(`${r.id}: labelled ${r.layer}, decided ${d.layer} (${d.assertions.map((a) => `${a.layer}:${a.because}`).join(" | ").slice(0, 160)})`);
}
const n = evalSet.rows.length;
console.log(`LAYER DECIDER — ${MODEL ? "rules + fast model for ties" : "rules only"}`);
console.log(`accuracy on ${n} hand-labelled cases: ${right}/${n} = ${((right / n) * 100).toFixed(1)}%`);
console.log(`confusion (label→decided): ${Object.entries(confusion).map(([k, v]) => `${k} ${v}`).join(", ")}`);
for (const w of wrong) console.log(`  ✗ ${w}`);
console.log(`tuning set (60):        ${await score(evalSet.rows)}`);
if (evalSet.secondTuning) console.log(`second tuning set (20): ${await score(evalSet.secondTuning)}`);
if (evalSet.heldOut) console.log(`HELD OUT (20, never tuned on): ${await score(evalSet.heldOut)}`);

const screen = allCases().filter((c) => /^UI-/.test(c.group) && c.group !== "UI-XCHK");
const split: Record<string, Record<Layer, number>> = {};
const decisions: Array<{ id: string; layer: Layer; ties: number; assertions: unknown }> = [];
let ties = 0;
let modelBroke = 0;
for (const c of screen) {
  const d = await decideLayer(c, { model: MODEL });
  ties += d.assertions.filter((a) => a.by === "fallback").length;
  modelBroke += d.assertions.filter((a) => a.by === "model").length;
  const k = /^UI-(XD|EVD)/.test(c.group) ? "deep-dig (UI-XD*/UI-EVD*)" : "written (UI-ENV…UI-NFR)";
  split[k] ??= { ui: 0, api: 0, both: 0 };
  split[k][d.layer] += 1;
  decisions.push({ id: c.id, layer: d.layer, ties: d.ties, assertions: d.assertions });
}
console.log(`\nWRITTEN SCREEN CASES (${screen.length}) — where their expectations can be observed:`);
for (const [k, v] of Object.entries(split)) console.log(`  ${k.padEnd(28)} ui ${v.ui} · both ${v.both} · api-only ${v.api}`);
const tot = Object.values(split).reduce((a, v) => ({ ui: a.ui + v.ui, both: a.both + v.both, api: a.api + v.api }), { ui: 0, both: 0, api: 0 });
console.log(`  ${"total".padEnd(28)} ui ${tot.ui} · both ${tot.both} · api-only ${tot.api}   (${ties} assertion(s) left to the written layer${MODEL ? `, ${modelBroke} tie(s) broken by the fast model` : ""})`);
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ accuracy: right / n, confusion, split, decisions }, null, 1));
  console.log(`wrote ${jsonOut}`);
}
