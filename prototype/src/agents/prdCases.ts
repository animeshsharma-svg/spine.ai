/**
 * TEST CASES FROM THE PRD ONLY — prompts/test-case-writer.md.
 *
 * The writer is given the PRD and nothing else: no pull request, no code, no running app. The code is what the
 * cases test; a case written from it would copy its mistakes into the expected result and let the wrong feature
 * ship. So:
 *   1. the PRD is read into numbered requirements (each with the PRD's own words and its section);
 *   2. cases are written a few requirements at a time, in the house columns plus "PRD Reference";
 *   3. any requirement left without a case is asked for once more, and what is still uncovered is listed;
 *   4. what the PRD leaves open becomes "Record what happens" plus a question for the product manager.
 * The result is an .xlsx (Test Cases · Requirements · Questions for the PM) imported as a sheet and linked to the
 * PRD, so the runner judges every case by the same document.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { chat } from "../ai/llm.js";
import { parseJsonObject } from "../hubspot/slingringFast.js";
import { SHEET_COLUMNS, STYLE_GUIDE, styleExamplesText, toSheetRow, parseConfigs } from "./caseStyle.js";
import { importSheetBuffer, type SheetInfo } from "../checks/sheetCases.js";
import { linkPrd, type Prd } from "../checks/prdDocs.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
const PROMPT = join(ROOT, "prompts", "test-case-writer.md");
const OUT = join(ROOT, "data", "prd-sheets");

export interface Requirement { id: string; section: string; text: string; quote: string }
interface Drafted {
  module: string; scenario: string; title: string; role: string; portal: string; preconditions: string; configs: string;
  testData: string; steps: string[]; expected: string; priority: string; testType: string; reqs: string[]; prdQuote: string;
}
export interface PrdCasesResult {
  sheet: SheetInfo;
  file: string;
  feature: string;
  requirements: Requirement[];
  uncovered: Requirement[];
  questions: string[];
  cases: number;
}

const MAX_PRD = 120_000;
const BATCH = 5;

async function ask(system: string, user: string, maxTokens: number): Promise<any> {
  // the whole PRD goes in every call, so a case is never written from a fragment (the "fast" tier: Slingring's
  // long-context model is refused by the gateway, and the reason tier costs $50 per 1M tokens)
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await chat([{ role: "system", content: system }, { role: "user", content: user }], { tier: "fast", temperature: 0.2, maxTokens, timeoutMs: 180_000 }).catch(() => "");
    const j = parseJsonObject(raw);
    if (j) return j;
    // a reasoning model can spend the budget thinking and stop mid-answer: give the retry more room
    console.log(`[prdCases] answer ${attempt} did not parse (${raw.length} chars${raw ? `, ends "${raw.slice(-60).replace(/\s+/g, " ")}"` : ""})`);
    maxTokens = Math.round(maxTokens * 1.6);
  }
  return null;
}

const prefixOf = (name: string) =>
  name.replace(/\.[a-z]+$/i, "").replace(/^(plan|prd|spec)[\s:_-]+/i, "").split(/[^A-Za-z0-9]+/).filter((w) => w.length > 2 && !/^(and|the|for|with)$/i.test(w)).slice(0, 3).map((w) => w[0].toUpperCase()).join("") || "PRD";

/** Write house-format cases from the PRD alone, save them as a sheet linked to the PRD. */
export async function writeCasesFromPrd(prd: Prd, onLine: (l: string) => void = () => {}, isStopped: () => boolean = () => false): Promise<PrdCasesResult> {
  const system = `${readFileSync(PROMPT, "utf8")}\n\n---\n\n${STYLE_GUIDE}\n\nTwo cases in the house voice:\n${styleExamplesText()}`;
  const doc = prd.text.slice(0, MAX_PRD);

  onLine(`Reading "${prd.name}" into requirements (the PRD only — no code, no pull request)…`);
  const r = await ask(system, `THE PRD ("${prd.name}"):\n${doc}\n\nTASK: list the requirements (section 2 of your instructions) — observable behaviour only, one behaviour once. Answer:\n{"feature": "the feature's name, short", "requirements": [{"id": "R1", "section": "the PRD section it is in", "text": "one testable statement, plain words", "quote": "the PRD's own words it comes from"}], "outOfScope": ["…"], "questions": ["what the PRD leaves open that a tester must know"]}`, 12000);
  const reqs: Requirement[] = (Array.isArray(r?.requirements) ? r.requirements : [])
    .map((x: any, i: number) => ({ id: String(x?.id || `R${i + 1}`), section: String(x?.section ?? "").trim() || "General", text: String(x?.text ?? "").trim(), quote: String(x?.quote ?? "").trim() }))
    .filter((x: Requirement) => x.text);
  if (!reqs.length) throw new Error("no requirements could be read from the PRD (the model gave no usable answer)");
  const feature = String(r?.feature ?? "").trim() || prd.name.replace(/\.[a-z]+$/i, "");
  const questions = new Set<string>((Array.isArray(r?.questions) ? r.questions : []).map(String).filter(Boolean));
  onLine(`${reqs.length} requirements found${questions.size ? `, ${questions.size} open questions` : ""}. Writing cases…`);

  const drafted: Drafted[] = [];
  const write = async (batch: Requirement[], note = "") => {
    const j = await ask(
      system,
      `THE PRD ("${prd.name}"):\n${doc}\n\nFEATURE: ${feature}\n\nFor EACH requirement write at least one Positive case AND at least one Negative or Edge case (section 3) — usually 2 to 4 cases per requirement.\nWRITE CASES FOR THESE REQUIREMENTS ONLY${note}:\n${batch.map((q) => `${q.id} [${q.section}] ${q.text} — PRD: "${q.quote}"`).join("\n")}\n\nAlready written for other requirements (do not repeat): ${drafted.slice(-40).map((d) => d.title).join(" | ") || "none"}\n\nAnswer:\n{"cases": [{"module": "the PRD section", "scenario": "short name of the situation", "title": "…", "role": "Buyer|Vendor|Approver|Admin|…", "portal": "Buyer portal|Vendor portal|API|Email", "preconditions": "…", "configs": "setting_key = On|Off — what it does, one per line, or None", "testData": "placeholders: PR-1, User A …", "steps": ["Log in …", "…"], "expected": "…", "priority": "Critical|High|Medium|Low", "testType": "Positive|Negative|Edge", "reqs": ["R1"], "prdQuote": "the PRD's words the expected result comes from"}], "questions": ["anything this batch showed the PRD leaves open"]}`,
      14000,
    );
    for (const q of Array.isArray(j?.questions) ? j.questions : []) if (q) questions.add(String(q));
    for (const x of Array.isArray(j?.cases) ? j.cases : []) {
      const steps = (Array.isArray(x?.steps) ? x.steps : String(x?.steps ?? "").split(/\n+/)).map(String).filter(Boolean);
      if (!x?.title || !steps.length || !x?.expected) continue;
      drafted.push({
        module: String(x.module || batch[0].section), scenario: String(x.scenario || "-"), title: String(x.title), role: String(x.role || ""), portal: String(x.portal || ""),
        preconditions: String(x.preconditions || "-"), configs: String(x.configs || "None"), testData: String(x.testData || "-"), steps, expected: String(x.expected),
        priority: String(x.priority || "Medium"), testType: String(x.testType || ""), reqs: (Array.isArray(x.reqs) ? x.reqs : [x.reqs]).map(String).filter(Boolean), prdQuote: String(x.prdQuote || ""),
      });
    }
  };
  for (let i = 0; i < reqs.length; i += BATCH) {
    if (isStopped()) throw new Error("stopped");
    const batch = reqs.slice(i, i + BATCH);
    onLine(`Writing cases for ${batch.map((b) => b.id).join(", ")} (${Math.min(i + BATCH, reqs.length)} of ${reqs.length} requirements)…`);
    await write(batch);
  }
  // every requirement needs a case: ask once more for the ones left out
  const covered = () => new Set(drafted.flatMap((d) => d.reqs));
  let missing = reqs.filter((q) => !covered().has(q.id));
  if (missing.length && !isStopped()) {
    onLine(`${missing.length} requirement${missing.length === 1 ? " has" : "s have"} no case yet (${missing.map((m) => m.id).join(", ")}) — writing those…`);
    for (let i = 0; i < missing.length; i += BATCH) await write(missing.slice(i, i + BATCH), " (they were left without a case — every one needs at least one)");
    missing = reqs.filter((q) => !covered().has(q.id));
  }
  // a requirement with only Positive cases has not been tested: ask for its Negative and Edge cases
  const typesOf = (id: string) => new Set(drafted.filter((d) => d.reqs.includes(id)).map((d) => d.testType.toLowerCase()));
  const shallow = reqs.filter((q) => covered().has(q.id) && !typesOf(q.id).has("negative") && !typesOf(q.id).has("edge"));
  if (shallow.length && !isStopped()) {
    onLine(`${shallow.length} requirement${shallow.length === 1 ? " has" : "s have"} only positive cases — writing their negative and edge cases…`);
    for (let i = 0; i < shallow.length; i += BATCH) {
      if (isStopped()) break;
      await write(shallow.slice(i, i + BATCH), " — they already have Positive cases; write ONLY their Negative and Edge cases (wrong user, not allowed, empty, one, many, the limit, the setting Off, the second page …)");
    }
  }
  if (!drafted.length) throw new Error("no cases could be written from the PRD (the model gave no usable answer)");

  // review against the PRD: drop duplicates, correct any expected result whose words are not the PRD's
  if (!isStopped()) {
    onLine(`Checking all ${drafted.length} cases against the PRD (duplicates, misquoted texts)…`);
    const drop = new Set<number>();
    for (let from = 0; from < drafted.length; from += 60) {
      const part = drafted.slice(from, from + 60);
      const j = await ask(
        system,
        `THE PRD ("${prd.name}"):\n${doc}\n\nTHE CASES WRITTEN SO FAR:\n${part.map((d, i) => `C${from + i + 1} [${d.testType}] ${d.title}\n   Expected: ${d.expected}`).join("\n")}\n\nTASK: review them against the PRD only. (1) A case that checks the same thing as an earlier one is a duplicate — same user, same action, same outcome, even when worded differently: drop the later one. A Positive and a Negative or Edge case of the same rule are NOT duplicates, nor are the same check on the screen and through the API; when unsure, keep it. A case about an implementation detail no tester can observe (number of database queries, code structure, deploy order) is dropped too. (2) An expected result whose quoted text, link or number is not what the PRD says: give the corrected expected result, using the PRD's exact words. (3) A title that contradicts its own expected result: give a corrected title. Change nothing else.\nAnswer: {"drop": ["C7"], "fix": [{"id": "C3", "title": "only when it changes", "expected": "only when it changes"}]}`,
        8000,
      );
      for (const id of Array.isArray(j?.drop) ? j.drop : []) {
        const n = Number(String(id).replace(/\D/g, "")) - 1;
        if (n >= from && n < from + part.length) drop.add(n);
      }
      for (const f of Array.isArray(j?.fix) ? j.fix : []) {
        const n = Number(String(f?.id ?? "").replace(/\D/g, "")) - 1;
        if (!(n >= from && n < from + part.length)) continue;
        if (f.title) drafted[n].title = String(f.title);
        if (f.expected) drafted[n].expected = String(f.expected);
      }
    }
    // never drop a requirement's last case of a kind (its only Positive, Negative or Edge case)
    for (const n of [...drop].sort((a, b) => b - a)) {
      const left = drafted.filter((d, i) => i !== n && !drop.has(i));
      const t = drafted[n].testType.toLowerCase();
      if (drafted[n].reqs.every((r) => left.some((d) => d.reqs.includes(r) && d.testType.toLowerCase() === t))) drafted.splice(n, 1);
      drop.delete(n);
    }
  }

  // the sheet: house columns + PRD Reference, then the traceability and the questions
  const prefix = `${prefixOf(prd.name)}-PRD`;
  const reqById = new Map(reqs.map((q) => [q.id, q]));
  const rows = drafted.map((d, i) => {
    const row = toSheetRow(`${prefix}-${String(i + 1).padStart(3, "0")}`, d.module, d.scenario, {
      title: d.title, steps: d.steps, expected: d.expected, setup: d.preconditions, testData: d.testData, priority: d.priority,
      role: d.role || undefined, portal: d.portal || undefined, testType: d.testType || undefined, configs: parseConfigs(d.configs),
    });
    const ref = `${d.reqs.join(", ")}${d.prdQuote ? ` — "${d.prdQuote}"` : d.reqs[0] && reqById.get(d.reqs[0]) ? ` — "${reqById.get(d.reqs[0])!.quote}"` : ""}`;
    return { ...row, "PRD Reference": ref };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: [...SHEET_COLUMNS, "PRD Reference"] }), "Test Cases");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(reqs.map((q) => ({ Requirement: q.id, Section: q.section, "What must be true": q.text, "PRD words": q.quote, Cases: rows.filter((_, i) => drafted[i].reqs.includes(q.id)).map((x) => x["Test Case ID"]).join(", ") || "NONE — not covered" }))),
    "Requirements",
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([...questions].map((q, i) => ({ "#": i + 1, "Question for the product manager": q }))), "Questions for the PM");
  mkdirSync(OUT, { recursive: true });
  const fileName = `${prd.name.replace(/\.[a-z]+$/i, "").replace(/[^\w .()-]/g, "").trim() || "PRD"} - Test Cases.xlsx`;
  const file = join(OUT, fileName);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  writeFileSync(file, buf);
  const sheet = importSheetBuffer(fileName, buf);
  linkPrd(sheet.id, prd.id);
  onLine(`Wrote ${rows.length} cases for ${reqs.length - missing.length} of ${reqs.length} requirements${missing.length ? ` (not covered: ${missing.map((m) => m.id).join(", ")})` : ""}.`);
  return { sheet, file, feature, requirements: reqs, uncovered: missing, questions: [...questions], cases: rows.length };
}
