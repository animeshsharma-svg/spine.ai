/**
 * Derive test cases from the command line — one subject, a file of subjects, or every feature of a product sheet.
 *
 *   npx tsx scripts/derive-cases.ts "test reject bid"
 *   npx tsx scripts/derive-cases.ts --file subjects.txt            one subject per line
 *   npx tsx scripts/derive-cases.ts --product 08 --max 30          every "#### PRD-…" feature of test-cases/product-08-*.md
 *   npx tsx scripts/derive-cases.ts --prd path/to/prd.md           a whole PRD as one subject
 *
 * Each derivation saves its sheet (derived-<slug>) and its questions (data/product-questions.json); this prints
 * the counts per dimension and writes a summary to data/derivations/<date>.jsonl.
 */
import { appendFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveCases } from "../src/agents/deriveCases.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const max = Number(opt("--max")) || 40;
const companyId = Number(opt("--company")) || 198678;

const subjects: string[] = [];
if (opt("--file")) subjects.push(...readFileSync(opt("--file")!, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
if (opt("--prd")) subjects.push(readFileSync(opt("--prd")!, "utf8"));
if (opt("--product")) {
  const dir = join(ROOT, "..", "test-cases");
  const file = readdirSync(dir).find((f) => f.startsWith(`product-${opt("--product")}-`) && f.endsWith(".md"));
  if (!file) throw new Error(`no test-cases/product-${opt("--product")}-*.md`);
  const md = readFileSync(join(dir, file), "utf8");
  // one subject per feature heading, with its "why it matters" line — the happy-path cases, not the per-setting variants
  const seen = new Set<string>();
  for (const block of md.split(/\n(?=#### )/)) {
    const title = block.match(/^#### [A-Z-]+-\d+ — (.+?)(?::| \(|$)/m)?.[1]?.trim();
    const why = block.match(/\*\*Why it matters\.\*\* ([^\n]+)/)?.[1]?.trim() ?? "";
    if (!title || /= (ON|OFF)|not available on plans/i.test(block.split("\n")[0]) || seen.has(title)) continue;
    seen.add(title);
    subjects.push(`Feature: ${title}. ${why}`.slice(0, 600));
  }
}
const free = args.filter((a, i) => !a.startsWith("--") && !["--file", "--prd", "--product", "--max", "--company"].includes(args[i - 1] ?? ""));
subjects.push(...free);
if (!subjects.length) {
  console.log("give a subject, --file, --prd or --product");
  process.exit(1);
}
mkdirSync(join(ROOT, "data", "derivations"), { recursive: true });
const log = join(ROOT, "data", "derivations", `${new Date().toISOString().slice(0, 10)}.jsonl`);
let totalNew = 0;
for (const [i, s] of subjects.entries()) {
  console.log(`\n[${i + 1}/${subjects.length}] ${s.slice(0, 100)}`);
  try {
    const d = await deriveCases({ text: s, companyId, max }, (e) => {
      if (e.type === "line") console.log("   ·", e.line);
    });
    const fresh = d.cases.filter((c) => !c.already).length;
    totalNew += fresh;
    console.log(`   → ${d.cases.length} cases (${fresh} new, ${d.cases.length - fresh} already written), ${d.questions.length} questions, sheet ${d.sheet}, ${Math.round(d.ms / 1000)}s`);
    console.log("   dimensions:", JSON.stringify(d.dimensions));
    appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), subject: d.subject, kind: d.kind, module: d.module, sheet: d.sheet, cases: d.cases.length, fresh, questions: d.questions.length, dimensions: d.dimensions, grounding: d.grounding, ms: d.ms }) + "\n");
  } catch (e) {
    console.log("   failed:", (e as Error).message.slice(0, 200));
  }
}
console.log(`\n${subjects.length} subject(s), ${totalNew} new cases in all.`);
process.exit(0);
