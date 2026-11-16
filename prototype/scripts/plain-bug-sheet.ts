/**
 * TECHNICAL FINDINGS → THE TEAM'S PLAIN WORDS, then the house bug sheet.
 *
 *   npx tsx scripts/plain-bug-sheet.ts data/night/bugs-2026-11-13-technical.json data/night/bugs-2026-11-13-plain.json
 *
 * Input: {api:[row], ui:[row]} as the sheet builder takes them (id, summary, description, steps[], artefact,
 * qa_comment, module, priority…). Output: the same rows with the text rewritten by src/ai/plainWords.ts —
 * summary = the one-line bug, description = what goes wrong + what should happen + what actually happens,
 * steps = how to see it — and the technical facts kept in "verified" for the QA Comment. The sheet is then
 * built by test-cases/bug_sheet.py from the output (scripts/plain-bug-sheet.py).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { plainBug } from "../src/ai/plainWords.js";

const [inFile, outFile] = process.argv.slice(2);
if (!inFile || !outFile) { console.error("usage: plain-bug-sheet.ts <technical.json> <plain.json>"); process.exit(2); }
const data = JSON.parse(readFileSync(inFile, "utf8")) as { api: any[]; ui: any[] };

async function rewrite(row: any): Promise<any> {
  const desc = String(row.description ?? "");
  const expected = desc.match(/Expected behavior:\s*([^]*?)(?:\s*Why it matters:|$)/)?.[1]?.trim() ?? "";
  const why = desc.match(/Why it matters:\s*([^]*)$/)?.[1]?.trim() ?? "";
  const what = desc.replace(/Expected behavior:[^]*$/, "").trim();
  const p = await plainBug({ title: row.summary, module: row.module, whatHappened: what, expected, why, steps: row.steps, technical: `${row.artefact ?? ""}${row.qa_comment ? ` ${row.qa_comment}` : ""}`.trim() });
  const out = {
    ...row,
    summary: p.bug,
    // the house Description: what happens, then "Expected behavior: …", then "Why it matters: …" (prompts/test-case-runner.md §9.3)
    description: `${p.whatGoesWrong}${p.whatActuallyHappens && !p.whatGoesWrong.includes(p.whatActuallyHappens.slice(0, 40)) ? ` ${p.whatActuallyHappens}` : ""} Expected behavior: ${p.whatShouldHappen}${p.whyItMatters ? ` Why it matters: ${p.whyItMatters}` : ""}`,
    steps: p.howToSeeIt.length ? p.howToSeeIt : row.steps,
    qa_comment: `How it was verified: ${p.howItWasVerified}`,
    artefact: row.shots ? undefined : "See QA Comment for how it was verified.",
    technical: { summary: row.summary, description: row.description, steps: row.steps },
  };
  console.log(`${row.id}: ${p.bug}`);
  return out;
}

const out = { api: [] as any[], ui: [] as any[] };
for (const r of data.api) out.api.push(await rewrite(r));
for (const r of data.ui) out.ui.push(await rewrite(r));
writeFileSync(outFile, JSON.stringify(out, null, 1));
console.log(`wrote ${outFile}: ${out.api.length} + ${out.ui.length} rows`);
