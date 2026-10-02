/**
 * CLI: turn a recorded flow into human test cases with field validations.
 *
 *   tsx scripts/flow-to-cases.ts <recording-name> [--replay] [--no-llm]
 *
 *   <recording-name>   base name under procol-ui-tests/recordings/ (e.g. "proof"
 *                      for proof.flow.json). "--all" does every recording.
 *   --replay           re-fire the READ calls with a fresh token and mark each
 *                      validation passed/failed live (safe; mutations are never
 *                      fired against live data).
 *   --no-llm           skip the LLM prose pass; keep the deterministic framing.
 *
 * Writes, per recording:
 *   prototype/data/recorded-<name>.cases.json   (machine — dashboard/report)
 *   prototype/test-cases/recorded-<name>.md     (human — reads like Postman results)
 */
import { readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chat } from "../src/ai/llm.js";
import {
  flowToCases,
  loadRecording,
  type FlowCases,
  type RecordedCase,
} from "../src/checks/flowToCases.js";
import { replayCase, disposeReplay } from "../src/checks/flowReplay.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const REC_DIR = join(ROOT, "..", "procol-ui-tests", "recordings");
const DATA_DIR = join(ROOT, "data");
const MD_DIR = join(ROOT, "test-cases");

const argv = process.argv.slice(2);
const doReplay = argv.includes("--replay");
const noLlm = argv.includes("--no-llm");
const target = argv.find((a) => !a.startsWith("--"));

function recordingNames(): string[] {
  if (!existsSync(REC_DIR)) return [];
  const files = readdirSync(REC_DIR).filter((f) => f.endsWith(".flow.json"));
  return files.map((f) => f.replace(/\.flow\.json$/, ""));
}

/** One LLM round names all the cases in nicer human prose. Deterministic checklist is untouched. */
async function llmName(fc: FlowCases): Promise<void> {
  if (noLlm) return;
  const brief = fc.cases.map((c) => ({
    id: c.id,
    method: c.method,
    path: c.path,
    status: c.recordedStatus,
    sentFields: c.validations.filter((v) => v.kind === "request-field").map((v) => v.target).slice(0, 12),
    returned: c.validations.filter((v) => v.kind === "response-field").map((v) => v.target).slice(0, 12),
  }));
  const sys =
    "You are a senior QA engineer naming API test cases from a recorded flow. " +
    "For each call return a crisp, human title (what the call DOES in the product, not the HTTP verb), " +
    "a one-line `why` it matters, a `steps` line, and an `expected` line. " +
    "Business language, not jargon. Reply ONLY with a JSON array of {id,title,why,steps,expected}.";
  let out = "";
  try {
    out = await chat(
      [
        { role: "system", content: sys },
        { role: "user", content: `Flow "${fc.name}". Calls:\n${JSON.stringify(brief, null, 1)}` },
      ],
      { tier: "fast" },
    );
  } catch {
    return; // deterministic framing stands
  }
  const m = out.match(/\[[\s\S]*\]/);
  if (!m) return;
  let arr: Array<Partial<RecordedCase> & { id: string }>;
  try {
    arr = JSON.parse(m[0]);
  } catch {
    return;
  }
  const byId = new Map(arr.map((a) => [a.id, a]));
  for (const c of fc.cases) {
    const n = byId.get(c.id);
    if (!n) continue;
    if (n.title) c.title = n.title;
    if (n.why) c.why = n.why;
    if (n.steps) c.steps = n.steps;
    if (n.expected) c.expected = n.expected;
  }
}

const badge = (s: string) =>
  ({ passed: "✅ PASS", failed: "❌ FAIL", skipped: "⏭️ SKIP", recorded: "📼 REC" } as Record<string, string>)[s] ?? s;

function toMarkdown(fc: FlowCases, replayed: boolean): string {
  const L: string[] = [];
  L.push(`# Recorded flow → test cases: \`${fc.name}\``);
  L.push("");
  L.push(
    `_Captured ${new Date(fc.recordedAt).toLocaleString()} · ${fc.totalCalls} calls seen · ` +
      `${fc.meaningful} turned into cases · ${fc.context} config/boilerplate calls collapsed._`,
  );
  if (replayed) L.push("");
  if (replayed)
    L.push(`> Reads were **replayed live** with a fresh access token; each ✅/❌ below is a real result. Mutations are shown from the capture (📼) and never fired against live data.`);
  L.push("");
  for (const c of fc.cases) {
    const stats = {
      passed: c.validations.filter((v) => v.state === "passed").length,
      failed: c.validations.filter((v) => v.state === "failed").length,
    };
    const head =
      replayed && (stats.passed || stats.failed)
        ? ` — ${stats.failed ? `❌ ${stats.failed} failed` : `✅ ${stats.passed} passed`}`
        : "";
    L.push(`## ${c.id} · ${c.title}${head}`);
    L.push("");
    L.push(`**\`${c.method} ${c.path}\`** → ${c.recordedStatus}  ·  priority ${c.priority}`);
    L.push("");
    L.push(`- **Why:** ${c.why}`);
    L.push(`- **Setup:** ${c.setup}`);
    L.push(`- **Steps:** ${c.steps}`);
    L.push(`- **Expected:** ${c.expected}`);
    L.push("");
    L.push(`**Validations**`);
    L.push("");
    L.push(`| # | Field / check | Assertion | Result |`);
    L.push(`|---|---|---|---|`);
    c.validations.forEach((v, i) => {
      const actual =
        v.state === "failed" && v.actual !== undefined ? ` _(got: ${JSON.stringify(v.actual)})_` : "";
      L.push(`| ${i + 1} | \`${v.target}\` | ${v.assertion}${actual} | ${badge(v.state)} |`);
    });
    L.push("");
  }
  if (fc.contextCalls.length) {
    L.push(`---`);
    L.push(`### Config / boilerplate calls (not tested)`);
    L.push("");
    for (const c of fc.contextCalls) L.push(`- \`${c.method} ${c.path}\` → ${c.status}`);
    L.push("");
  }
  return L.join("\n");
}

async function convertOne(name: string): Promise<void> {
  const src = join(REC_DIR, `${name}.flow.json`);
  if (!existsSync(src)) {
    console.error(`✗ no recording at ${src}`);
    return;
  }
  const rec = loadRecording(src);
  const fc = flowToCases(rec, src);
  console.log(`\n[${name}] ${fc.totalCalls} calls → ${fc.meaningful} cases (${fc.context} config collapsed)`);

  await llmName(fc);

  if (doReplay) {
    for (const c of fc.cases) {
      const { case: judged, outcome } = await replayCase(c);
      Object.assign(c, judged);
      const tag = outcome.replayed
        ? `live ${outcome.liveStatus} — ✅${outcome.passed} ❌${outcome.failed} ⏭️${outcome.skipped}`
        : `not replayed (${outcome.reason})`;
      console.log(`  ${c.id} ${c.method} ${c.path} → ${tag}`);
    }
    await disposeReplay();
  }

  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(MD_DIR, { recursive: true });
  const jsonPath = join(DATA_DIR, `recorded-${name}.cases.json`);
  const mdPath = join(MD_DIR, `recorded-${name}.md`);
  writeFileSync(jsonPath, JSON.stringify({ ...fc, replayed: doReplay }, null, 2));
  writeFileSync(mdPath, toMarkdown(fc, doReplay));
  console.log(`  ✓ ${jsonPath.replace(ROOT + "/", "")}`);
  console.log(`  ✓ ${mdPath.replace(ROOT + "/", "")}`);
}

async function main() {
  const names =
    !target || target === "--all" ? recordingNames() : [target.replace(/\.flow\.json$/, "")];
  if (!names.length) {
    console.error(`No recordings found in ${REC_DIR}. Record one first: UI_RECORD_FLOW=<name> in procol-ui-tests.`);
    process.exit(1);
  }
  for (const n of names) await convertOne(n);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
