/**
 * TEST CASES FROM A PRD (Aanya, 10 Nov: "provide our chatbot the PRD … the agent makes testcases out of
 * the prd which covers all positive negative boundary regression cases, and gives user the option to run
 * all cases, or happy flow or selected cases").
 *
 * A product requirements document — PDF, Word, Markdown or pasted text — is read into its rules
 * (R1, R2 …: a rule, a field with its limits, a role, a message), then the same scenario-then-cases
 * writer the runs use (runCases.ts) writes the cases from those rules: the positive case, the negatives
 * per rule, the boundaries per limit, and a Regression scenario from the known bugs and library cases
 * of the same module. Every case names the rules it proves in sourceStep ("PRD R3, R4 · Invite vendors"),
 * so the page can say which rules are covered and which are not.
 *
 * The cases are kept as a run-cases set under the key prd-<id> (data/run-cases), so the Test cases tab
 * runs, reviews, edits and exports them exactly as it does a run's; the PRD itself (its rules, coverage)
 * is kept in data/prd/<id>.json.
 *
 *   GET    /api/prd            the PRDs read so far
 *   GET    /api/prd?id=…       one PRD with its cases as they stand
 *   POST   /api/prd            { name, fileName?, fileBase64?, text?, companyId?, company? } → read + write cases
 *   POST   /api/prd            { id, again: true } → write the cases again (cases already run keep their result)
 *   DELETE /api/prd?id=…       forget it
 *
 * Reading files needs no package: a PDF's text comes from the Mac's own PDFKit (osascript), a Word file's
 * from textutil. Procol's backend code is not a source (Aanya, 2 Nov).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RouteHandler } from "./index.js";
import { chat } from "../ai/llm.js";
import { CATEGORIES, carryOver, loadSet, related, saveSet, tidyScenarios, type RunCase } from "./runCases.js";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, "..", "..", "data");
const PRD_DIR = join(DATA, "prd");
const KNOWN_BUGS = join(here, "..", "..", "config", "knownBugs.json");

const str = (v: unknown, max = 600) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const safeId = (s: unknown) => (typeof s === "string" && /^[\w.-]{3,80}$/.test(s) ? s : undefined);

export interface PrdRule {
  id: string;
  feature: string;
  text: string;
  /** rule | field | limit | role | message | flow */
  kind: string;
}
export interface PrdDoc {
  id: string;
  key: string;
  name: string;
  fileName?: string;
  companyId?: number | null;
  company?: string;
  createdAt: string;
  updatedAt: string;
  chars: number;
  module: string;
  summary: string;
  features: Array<{ title: string; rules: PrdRule[] }>;
  /** what the PRD flags as intended-but-surprising or a known defect */
  known?: string[];
  /** ambiguous, contradictory or unreachable items — listed, never turned into cases */
  openQuestions?: string[];
  /** the PRD's words, kept so the cases can be written again */
  text: string;
  note?: string;
}

const readJson = (p: string): any => {
  try {
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : undefined;
  } catch {
    return undefined;
  }
};
const loadPrd = (id: string): PrdDoc | undefined => readJson(join(PRD_DIR, `${id}.json`));
function savePrd(p: PrdDoc): void {
  mkdirSync(PRD_DIR, { recursive: true });
  writeFileSync(join(PRD_DIR, `${p.id}.json`), JSON.stringify(p, null, 2));
}
function listPrds(): PrdDoc[] {
  if (!existsSync(PRD_DIR)) return [];
  return readdirSync(PRD_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson(join(PRD_DIR, f)) as PrdDoc | undefined)
    .filter((p): p is PrdDoc => !!p?.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── reading the file ────────────────────────────────────────────────────────

/** The document's text: a PDF through PDFKit, a Word/RTF file through textutil, anything else as it is. */
export function textOf(fileName: string, bytes: Buffer): string {
  const ext = (fileName.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
  const tmp = join(tmpdir(), `spine-prd-${Date.now()}.${ext || "bin"}`);
  try {
    if (ext === "pdf") {
      writeFileSync(tmp, bytes);
      const js = 'ObjC.import("Quartz"); function run(a){ const d=$.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(a[0])); return d.isNil() ? "" : d.string.js; }';
      return execFileSync("osascript", ["-l", "JavaScript", "-e", js, tmp], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 60_000 });
    }
    if (["docx", "doc", "rtf", "odt", "rtfd", "html", "htm"].includes(ext)) {
      writeFileSync(tmp, bytes);
      return execFileSync("textutil", ["-convert", "txt", "-stdout", tmp], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 60_000 });
    }
    return bytes.toString("utf8");
  } finally {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* a leftover temp file is nobody's problem */
    }
  }
}

/** Tidy for the model: no blank runs, no page furniture, at most ~60k characters. */
function tidyText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s*(page \d+( of \d+)?|\d+)\s*$/gim, "")
    .trim()
    .slice(0, 60_000);
}

// ── the model ───────────────────────────────────────────────────────────────

const STRUCTURE_SYSTEM = [
  "You read a PRODUCT REQUIREMENTS DOCUMENT (sometimes a tech doc) for Procol, a procure-to-pay platform (buyers run sourcing events, vendors bid, purchase orders, receipts, invoices and bills follow), and list every testable rule in it for a QA team. The document is the single source of truth: read all of it before answering.",
  "A rule is one sentence a tester can prove or disprove: what a screen, record, export or API must show or do; a field and its limits (required, type, minimum, maximum, format, default); who may do it (role); a message; an order of states and the terminal states; a calculation; what happens when a thing the feature relies on is renamed, deactivated, deleted or merged; timing windows (capture / refresh delays); feature flags and rollback.",
  "Keep the document's own words, numbers and section names; never add a rule the document does not state. One rule per sentence; split a sentence that holds two. 10-80 rules, grouped under the document's own sections (its headings, with their numbers when it has them, e.g. \"§6.4 Closed documents\").",
  'kind: one of "rule", "field", "limit", "role", "message", "flow", "calculation", "integrity", "timing", "surface" (a value that must appear on detail / list / PDF / Excel / API), "config".',
  "known: things the document flags as intended-but-surprising, a known defect, or a limitation — each in one sentence with the root cause the document gives. questions: what the document leaves ambiguous, contradictory or unreachable — one sentence each, with the section. Empty lists when there are none.",
  'Return JSON only: {"module":"<the Procol module>","summary":"<two sentences on what the PRD adds or changes>","features":[{"title":"<section as the PRD names it>","rules":[{"text":"","kind":"rule"}]}],"known":[""],"questions":[""]}',
].join("\n");

const SCENARIO_SYSTEM = [
  "You plan TEST SCENARIOS for a QA team from a PRODUCT REQUIREMENTS DOCUMENT for Procol, a procure-to-pay platform. Its rules are numbered R1, R2 … under the document's sections. Optimise for PROVING behaviour, not confirming that an action happened.",
  'A test scenario is ONE thing to prove about a feature ("A closed document keeps its old values while the master changes"). Its test cases are written later, separately.',
  "Cover every one of these the PRD touches, and only those: the happy path per trigger / action / status; every state and lifecycle transition and terminal state; negatives (invalid input, wrong state, unauthorised, blocked actions, boundaries); data integrity when a dependency is renamed vs deactivated vs deleted vs merged vs key-changed; concurrency and timing (capture / refresh windows, races, a later edit or refresh corrupting prior state); permissions and roles; integration and cross-module ripples (upstream and downstream documents, links, bulk upload, import, notifications, approvals); config, rollout and rollback (flags, tenant scoping, pre-rollout data, OFF reverts cleanly); non-functional claims (performance, volume) with a measurable method.",
  'When the PRD says "A stays / B changes", plan ONE scenario that proves the contrast, never one per side. When a value must appear on several surfaces (detail, list, PDF, Excel, API, export), plan ONE scenario that asserts all of them. Fewer, denser scenarios: 6-12.',
  "THE ADVERSARIAL EDGES ARE NOT OPTIONAL (the tester's rule): for every dependency the feature relies on (a master record, a datasource, a source row, a linked document), plan the scenarios the PRD's principle implies even where the PRD is silent — the dependency DEACTIVATED (not only renamed), DELETED or MERGED (the feature must survive, nothing goes blank), a RACE inside any capture/refresh window the PRD names (an edit or refresh right after the trigger must not leak live values or un-freeze), formula fields that must not recompute, and a live status shown inside otherwise frozen data. Mark such a scenario's covers with '(implied by the PRD; to confirm)'. That is different from inventing a feature, screen or field: these act on things the PRD names.",
  "Respect the product's own constraints: never plan a scenario the PRD makes unreachable (a locked record cannot be edited → plan that the edit is BLOCKED, or leave it to the open questions). Never contradict another scenario.",
  'One scenario with category "Regression" when KNOWN BUGS or LIBRARY CASES touch this module. A scenario for each KNOWN item the PRD flags, so it is confirmed and tracked, not passed and forgotten.',
  "PLAIN WORDS: a scenario title is a short everyday sentence a new tester understands at a glance (at most 12 words). covers: one plain sentence on the risk. rules: the ids of the PRD rules the scenario proves.",
  `category: one of ${CATEGORIES.map((c) => `"${c}"`).join(", ")}.`,
  'Return JSON only: {"scenarios":[{"title":"","category":"","covers":"","module":"","feature":"<the PRD section>","rules":["R1","R2"]}]}',
].join("\n");

const CASES_SYSTEM = [
  "You write the EXECUTABLE TEST CASES for ONE test scenario, for a QA tester with zero prior context, from a PRODUCT REQUIREMENTS DOCUMENT for Procol (a procure-to-pay platform). The PRD's numbered rules are your only evidence. Optimise for PROVING behaviour, not confirming that an action happened.",
  "THE QUALITY BAR, non-negotiable:",
  "- PROVE, don't confirm. The expected result asserts a concrete observable CONSEQUENCE — a value, a state, a message, a count — never \"the status changes\", \"a snapshot is created\", \"the action succeeds\".",
  "- SELF-CONTAINED. The case stands alone: one-line precondition naming exactly what the tester must prepare, short numbered imperative steps, objective pass/fail. Never \"repeat TC-X\": inline it.",
  "- CONTRAST. When the behaviour is \"A stays / B changes\", BOTH sides go in this ONE case — the thing under test and its control — asserted side by side (closed = OLD value, control = NEW value). One-sided cases prove nothing.",
  "- ALL SURFACES. If the PRD says a value appears on detail, list, PDF, Excel, API, export or mobile, assert it on EACH surface inside this one case (that is where behaviour silently diverges).",
  "- CONCRETE DATA. Real ids, values and statuses from the PRD when given; otherwise clearly labelled placeholders like <RELEASED_PO>, <REJECTED_INVOICE>, and the precondition lists exactly what to prepare. Never \"a valid record\".",
  '- OBJECTIVE. Nothing unmeasurable. "Faster", "better", "handled gracefully" become a method and a threshold (how to measure, what number passes) — or the case is type "Observation", not Positive.',
  "- RESPECT THE PRODUCT'S CONSTRAINTS. If the PRD says X cannot happen (a closed document cannot take a new line), never write a case that assumes X: test that it is BLOCKED, with the refusal the PRD names. Never contradict another case or the PRD.",
  '- KNOWN ITEMS. A behaviour the PRD flags as intended-but-surprising or a known defect gets a case of type "Bug-confirm" whose qaComment starts with "[BUG-CONFIRM]" or "[KNOWN BEHAVIOUR]" followed by the root cause, so it is tracked, not passed and forgotten.',
  '- ASSUMPTIONS EXPLICIT. Where the PRD is silent and the case needs an answer, say it in qaComment: "Assumes X; confirm with dev". Never guess silently. A thing the PRD makes untestable is NOT a case: name it in "untestable".',
  "- ADVERSARIAL EDGES ARE CASES. An edge on a dependency the PRD names (deactivated, deleted, merged, a race in the capture window, a formula field, a live status inside frozen data) IS a case even when the PRD is silent on it: its expected result states what the PRD's principle implies and ends with '(to confirm)', and qaComment notes the silence ('PRD silent on deactivation; expects the frozen value to stay — confirm with dev'). Silence is not a reason to skip the edge.",
  "- COMPACT. Fewer, denser cases: 1-4 per scenario. Related assertions go into ONE case, not one row per micro-check. Each case still checks one behaviour.",
  'type "Regression" ONLY for a case that re-tests a KNOWN BUG listed below or a behaviour the PRD says was broken before; the feature\'s own main flow is "Positive" even when known bugs touch the module.',
  "Each case: title (what the tester does and what it proves, one short plain line, at most 12 everyday words a new tester understands — no PRD jargon like 'unaccounted closure'); preconditions (one line); steps (short, numbered, imperative — the screen, the control, the value); testData (the concrete values or placeholders); expected (the consequence on every claimed surface, in plain words); priority P0 = core feature, data integrity, security; P1 = important; P2 = the rest; type: Positive | Negative | Boundary | Edge | Integration | Security | Regression | Performance | Bug-confirm | Observation; layer \"UI\" or \"API\"; rules: the PRD rule ids this case proves; qaComment: tags and assumptions, else \"\".",
  'status: always "Suggested". Prefer a LIBRARY CASE\'s expected result when one fits and put its id in libraryId. Where the PRD is silent on an outcome, end the expected result with "(to confirm)".',
  'untestable: at most 2, only for a thing the PRD makes impossible to reach or judge — an unspecified value is an assumption in qaComment, not an untestable item.',
  'Return JSON only: {"cases":[{"title":"","preconditions":"","steps":["..."],"testData":"","expected":"","priority":"P1","type":"Negative","layer":"UI","rules":["R1"],"qaComment":"","status":"Suggested","libraryId":""}],"untestable":["<what and why, with the PRD section>"]}',
].join("\n");

const REVIEW_SYSTEM = [
  "You are the senior QA engineer doing the SELF-REVIEW of a test suite written from a PRD for Procol (a procure-to-pay platform). You get the PRD's numbered rules and every case in short form. Fix what fails the bar; change nothing else.",
  "The bar: [ ] every expected result asserts a consequence, not \"it happened\"; [ ] every case is runnable standalone with concrete or placeholder data and an objective pass/fail; [ ] each \"A stays / B changes\" behaviour is ONE contrast case, not two one-sided ones; [ ] every surface the PRD claims is asserted in that one case; [ ] no case contradicts the PRD's constraints or another case; [ ] nothing unmeasurable is left (made measurable, or type Observation); [ ] known behaviours and bugs are typed Bug-confirm and tagged in qaComment; [ ] ambiguities are open questions, not invented cases.",
  "Actions: remove (a case that contradicts the PRD or another case, or duplicates one — say which); rewrite (a case whose title, steps, expected, type or qaComment must change — give the full new text for the fields you change); merge (two one-sided cases into one contrast case or one all-surfaces case: keep one id, drop the others, give the merged title, steps, expected, type).",
  "Plain words throughout: titles are short everyday sentences; expected results say what the screen, record or file shows.",
  "openQuestions: at most 8, only items that block a case from being written or judged — not every silence in the PRD.",
  'Return JSON only: {"edits":[{"id":"TC-01.02","action":"remove","reason":""},{"id":"TC-03.01","action":"rewrite","reason":"","title":"","steps":["..."],"expected":"","type":"","qaComment":"","testData":"","preconditions":""},{"id":"TC-03.01","action":"merge","drop":["TC-06.01"],"reason":"","title":"","steps":["..."],"expected":"","type":""}],"openQuestions":["<ambiguous, contradictory or unreachable item, with the PRD section>"]}',
].join("\n");

const parse = (raw: string) => {
  const j = raw.match(/\{[\s\S]*\}/)?.[0];
  try {
    return j ? JSON.parse(j) : null;
  } catch {
    return null;
  }
};

/** The PRD's rules, numbered R1… across the document. */
async function structure(text: string): Promise<Pick<PrdDoc, "module" | "summary" | "features" | "known" | "openQuestions">> {
  const raw = await chat(
    [
      { role: "system", content: STRUCTURE_SYSTEM },
      { role: "user", content: `THE PRD:\n${text}` },
    ],
    { tier: "reason", temperature: 0.1, maxTokens: 6000, deadlineMs: 120_000 },
  );
  const j = parse(raw);
  let n = 0;
  const features = (Array.isArray(j?.features) ? j.features : [])
    .map((f: any) => ({
      title: str(f?.title, 120) || "Untitled",
      rules: (Array.isArray(f?.rules) ? f.rules : [])
        .map((r: any) => ({ id: `R${++n}`, feature: str(f?.title, 120) || "Untitled", text: str(r?.text, 400), kind: str(r?.kind, 20) || "rule" }))
        .filter((r: PrdRule) => r.text),
    }))
    .filter((f: { rules: PrdRule[] }) => f.rules.length)
    .slice(0, 30);
  if (!features.length) throw new Error("no rules could be read from this document — is it a PRD with requirements in it?");
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 300)).filter(Boolean).slice(0, 30) : []);
  return { module: str(j?.module, 60) || "Procol", summary: str(j?.summary, 400), features, known: list(j?.known), openQuestions: list(j?.questions) };
}

function knownBugsFor(module: string, text: string): string[] {
  const bugs: any[] = readJson(KNOWN_BUGS) ?? [];
  const words = new Set(`${module} ${text.slice(0, 4000)}`.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  return bugs
    .map((b) => ({ b, hits: `${b.module ?? ""} ${b.feature ?? ""} ${b.title ?? ""}`.toLowerCase().match(/[a-z]{4,}/g)?.filter((w) => words.has(w)).length ?? 0 }))
    .filter((x) => x.hits >= 2)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 12)
    .map(({ b }) => `- ${b.id} [${b.status ?? "?"}] ${str(b.title, 160)}`);
}

/** Scenarios, then each one's cases, then the senior QA's self-review; every case names its rules in sourceStep. */
async function writeCases(prd: PrdDoc): Promise<{ cases: RunCase[]; note?: string; openQuestions: string[] }> {
  const rules = prd.features.flatMap((f) => f.rules);
  const ruleLines = prd.features.map((f) => `## ${f.title}\n${f.rules.map((r) => `${r.id} (${r.kind}): ${r.text}`).join("\n")}`).join("\n\n");
  const lib = related(`${prd.module} ${prd.summary} ${rules.map((r) => r.text).join(" ")}`, 25);
  const bugs = knownBugsFor(prd.module, prd.text);
  const user = [
    `PRD: ${prd.name} · module ${prd.module}${prd.company ? ` · client ${prd.company}` : ""}`,
    `WHAT IT ADDS: ${prd.summary || "(no summary)"}`,
    `ITS RULES, BY SECTION:\n${ruleLines}`,
    prd.known?.length ? `KNOWN ITEMS the PRD flags (confirm and tag them, never pass them silently):\n${prd.known.map((k) => `- ${k}`).join("\n")}` : "",
    prd.openQuestions?.length ? `OPEN QUESTIONS already found (do not invent cases for these):\n${prd.openQuestions.map((k) => `- ${k}`).join("\n")}` : "",
    bugs.length ? `KNOWN BUGS in this module (from the QA sheets):\n${bugs.join("\n")}` : "",
    lib.length
      ? `LIBRARY CASES that may fit (reuse their expected result and id; do not copy ones that do not fit):\n${lib.map((c) => `- ${c.id} [${c.layer}${c.priority ? ` ${c.priority}` : ""}] ${c.title}${c.expected ? ` | expected: ${str(c.expected, 180)}` : ""}`).join("\n")}`
      : "LIBRARY CASES: none close to this PRD.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const planned = parse(
    await chat(
      [
        { role: "system", content: SCENARIO_SYSTEM },
        { role: "user", content: user },
      ],
      { tier: "reason", temperature: 0.2, maxTokens: 3500, deadlineMs: 90_000 },
    ),
  );
  const scenarios = (Array.isArray(planned?.scenarios) ? planned.scenarios : []).filter((x: any) => str(x?.title)).slice(0, 12);
  if (!scenarios.length) throw new Error("the scenarios could not be planned from the PRD's rules");
  // THE EDGES THE PLANNER KEEPS SKIPPING (Aanya, 12 Nov: "deactivation, not just rename; delete / merge the source;
  // the capture race"): when the PRD names a dependency and no planned scenario covers those edges, one is added
  // here, deterministically, so the case writer has to write them — with "(to confirm)" where the PRD is silent.
  const edgeWords = /deactivat|delet|merge|race|capture window|refresh window/i;
  const dependsOn = rules.some((r) => /\b(master|source|datasource|linked|lookup|reference|snapshot|frozen|vendor|cost cent|cached|copied)\b/i.test(r.text) || /^(integrity|timing|surface)$/.test(r.kind));
  if (dependsOn && !scenarios.some((sc: any) => edgeWords.test(`${sc.title} ${sc.covers}`))) {
    const edgeRules = rules.filter((r) => /^(integrity|timing)$/.test(r.kind) || /\b(master|source|datasource|linked|snapshot|frozen|cached|copied|refresh|capture|seconds?)\b/i.test(r.text)).map((r) => r.id).slice(0, 12);
    scenarios.push({
      title: "Sources deactivated, deleted or merged, and edits inside the capture window",
      category: "Error handling & recovery",
      covers: "(implied by the PRD; to confirm) A record the feature relies on is deactivated — not renamed — or deleted or merged, and an edit or refresh lands inside the capture window: nothing goes blank, frozen values stay frozen, formula fields do not recompute, and only a live status may change.",
      module: prd.module,
      feature: rules.find((r) => edgeRules.includes(r.id))?.feature ?? prd.features[0]?.title ?? "",
      rules: edgeRules,
    });
  }
  const ids = new Set(rules.map((r) => r.id));
  const ruleIds = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).toUpperCase().trim()).filter((x) => ids.has(x)) : []);
  const untestable: string[] = [];
  const ask1 = (sc: any, k: number, tier: "fast" | "reason") =>
    chat(
      [
        { role: "system", content: CASES_SYSTEM },
        {
          role: "user",
          content: `${user}\n\nTHE SCENARIO (${k + 1} of ${scenarios.length}): ${str(sc.title, 240)}\nCategory: ${str(sc.category, 40)}\nIt guards against: ${str(sc.covers, 300)}\nIts rules: ${ruleIds(sc.rules).join(", ") || "(none named — choose the ones that fit)"}`,
        },
      ],
      { tier, temperature: 0.2, maxTokens: 4000, deadlineMs: 90_000 },
    ).then((raw) => {
      const j = parse(raw);
      for (const u of Array.isArray(j?.untestable) ? j.untestable : []) if (str(u)) untestable.push(str(u, 300));
      return Array.isArray(j?.cases) ? j.cases : [];
    });
  const written = await Promise.all(
    scenarios.map(async (sc: any, k: number) => {
      let got: any[] = await ask1(sc, k, "reason").catch(() => []);
      if (!got.length) got = await ask1(sc, k, "fast").catch(() => []);
      const feature = str(sc.feature, 80) || rules.find((r) => ruleIds(sc.rules).includes(r.id))?.feature || "";
      // the rules a case proves travel in sourceStep (the only free text the table keeps): "PRD R3, R4 · §6.4 Closed documents"
      const cases = got.map((c: any) => {
        const rs = ruleIds(c?.rules);
        const fallback = rs.length ? rs : ruleIds(sc.rules);
        return { ...c, module: c?.module || sc.module || prd.module, feature: c?.feature || feature, status: "Suggested", sourceStep: `PRD ${fallback.join(", ") || "—"}${feature ? ` · ${feature}` : ""}` };
      });
      return { sc: { ...sc, sourceStep: `PRD ${ruleIds(sc.rules).join(", ")}` }, cases };
    }),
  );
  let cases = tidyScenarios(written, undefined, 5, 120).map((c) => ({ ...c, expected: plain(c.expected), scenario: plain(c.scenario) }));
  const empty = written.filter((w) => !w.cases.length).length;

  // THE SELF-REVIEW (Aanya, 12 Nov): the senior QA's checklist over the whole set — contradictions, one-sided
  // contrast cases, missing surfaces, unmeasurable expectations, untagged known items — fixed in place.
  let openQuestions = [...(prd.openQuestions ?? []), ...untestable];
  let reviewed = 0;
  try {
    const short = cases.map((c) => `${c.id} [${c.type}] ${c.scenario} | steps: ${c.steps.join(" / ").slice(0, 260)} | expected: ${c.expected.slice(0, 300)}${c.qaComment ? ` | qa: ${c.qaComment.slice(0, 120)}` : ""}`).join("\n");
    const rv = parse(
      await chat(
        [
          { role: "system", content: REVIEW_SYSTEM },
          { role: "user", content: `PRD: ${prd.name} · ${prd.module}\n\nITS RULES, BY SECTION:\n${ruleLines}\n\n${prd.known?.length ? `KNOWN ITEMS:\n${prd.known.map((k) => `- ${k}`).join("\n")}\n\n` : ""}THE CASES:\n${short}` },
        ],
        { tier: "reason", temperature: 0.1, maxTokens: 7000, deadlineMs: 150_000 },
      ),
    );
    const byId = new Map(cases.map((c) => [c.id, c]));
    const drop = new Set<string>();
    const field = (v: unknown, max = 600) => (str(v, max) ? str(v, max) : undefined);
    for (const e of Array.isArray(rv?.edits) ? rv.edits : []) {
      const c = byId.get(str(e?.id, 12));
      if (!c) continue;
      const act = str(e?.action, 10).toLowerCase();
      if (act === "remove") {
        drop.add(c.id);
        reviewed++;
        continue;
      }
      if (act === "rewrite" || act === "merge") {
        const steps = Array.isArray(e?.steps) ? e.steps.map((x: unknown) => str(x, 300)).filter(Boolean).slice(0, 12) : [];
        Object.assign(c, {
          ...(field(e?.title, 240) ? { scenario: plain(field(e?.title, 240)!) } : {}),
          ...(steps.length ? { steps } : {}),
          ...(field(e?.expected) ? { expected: plain(field(e?.expected)!) } : {}),
          ...(field(e?.testData, 300) ? { testData: field(e?.testData, 300) } : {}),
          ...(field(e?.preconditions) ? { preconditions: field(e?.preconditions) } : {}),
          ...(TYPES_ALL.has(str(e?.type, 20)) ? { type: str(e?.type, 20) as RunCase["type"] } : {}),
          ...(field(e?.qaComment, 400) ? { qaComment: field(e?.qaComment, 400) } : {}),
        });
        if (act === "merge") {
          const merged = (Array.isArray(e?.drop) ? e.drop : []).map((x: unknown) => str(x, 12)).filter((x: string) => byId.has(x) && x !== c.id);
          for (const d of merged) {
            drop.add(d);
            const from = byId.get(d)!;
            // the merged case proves both sides' rules
            const rs = new Set([...(c.sourceStep.match(/\bR\d+\b/g) ?? []), ...(from.sourceStep.match(/\bR\d+\b/g) ?? [])]);
            c.sourceStep = `PRD ${[...rs].join(", ")}${c.sourceStep.includes("·") ? ` ·${c.sourceStep.split("·").slice(1).join("·")}` : ""}`;
          }
        }
        reviewed++;
      }
    }
    cases = cases.filter((c) => !drop.has(c.id));
    for (const q of Array.isArray(rv?.openQuestions) ? rv.openQuestions : []) if (str(q) && !openQuestions.includes(str(q, 300))) openQuestions.push(str(q, 300));
    const offered = Array.isArray(rv?.edits) ? rv.edits.length : 0;
    console.log(`[prd] self-review: ${offered} edit(s) offered, ${reviewed} applied (${drop.size} removed), ${Array.isArray(rv?.openQuestions) ? rv.openQuestions.length : 0} open question(s)${!rv ? " — the review answer could not be read" : ""}`);
  } catch (e) {
    console.log(`[prd] the self-review did not run: ${str((e as Error).message, 160)}`);
  }
  openQuestions = [...new Set(openQuestions)].slice(0, 20);
  const notes = [empty ? `${empty} of ${scenarios.length} scenarios came back without test cases — “Write again” tries them again.` : "", reviewed ? `Self-review changed ${reviewed} case${reviewed === 1 ? "" : "s"}.` : ""].filter(Boolean);
  return { cases, note: notes.join(" ") || undefined, openQuestions };
}
const TYPES_ALL = new Set(["Positive", "Negative", "Edge", "Boundary", "Regression", "Integration", "Security", "Performance", "Bug-confirm", "Observation"]);

/** Plain words: a library case's "<feature> behaves as the workbook states: "…"" is only the quoted result. */
export function plain(t: string): string {
  const m = t.match(/behaves as the workbook states:?\s*["“]?([\s\S]*?)["”]?\s*$/i);
  return (m ? m[1] : t).replace(/\s+/g, " ").trim();
}

/** Which rules the cases prove: every rule, with the ids of the cases that name it. */
export function coverageOf(prd: PrdDoc, cases: Array<{ id: string; sourceStep?: string; type?: string }>): Array<{ rule: PrdRule; cases: string[]; negative: boolean }> {
  return prd.features.flatMap((f) =>
    f.rules.map((rule) => {
      const hit = cases.filter((c) => new RegExp(`\\b${rule.id}\\b`).test(c.sourceStep ?? ""));
      return { rule, cases: hit.map((c) => c.id), negative: hit.some((c) => c.type === "Negative" || c.type === "Boundary") };
    }),
  );
}

const answer = (prd: PrdDoc) => {
  const set = loadSet(prd.key);
  const cases = set?.cases ?? [];
  const { text: _t, ...rest } = prd;
  return { prd: rest, cases, coverage: coverageOf(prd, cases), savedAt: set?.updatedAt };
};

export const handle: RouteHandler = async (ctx) => {
  if (ctx.path !== "/api/prd") return false;
  const q = new URL(ctx.req.url ?? "/", "http://spine").searchParams;
  if (ctx.req.method === "GET") {
    const id = safeId(q.get("id"));
    if (!id) {
      ctx.json({
        prds: listPrds().map((p) => {
          const set = loadSet(p.key);
          const n = set?.cases.length ?? 0;
          const ran = set?.cases.filter((c) => /^(pass|fail)/i.test(c.status)).length ?? 0;
          return { id: p.id, key: p.key, name: p.name, fileName: p.fileName, company: p.company, companyId: p.companyId, module: p.module, createdAt: p.createdAt, updatedAt: set?.updatedAt ?? p.updatedAt, rules: p.features.reduce((s, f) => s + f.rules.length, 0), cases: n, ran };
        }),
      });
      return true;
    }
    const prd = loadPrd(id);
    if (!prd) return ctx.json({ error: "no such PRD" }, 404), true;
    ctx.json(answer(prd));
    return true;
  }
  if (ctx.req.method === "DELETE") {
    const id = safeId(q.get("id"));
    const prd = id ? loadPrd(id) : undefined;
    if (!id || !prd) return ctx.json({ error: "no such PRD" }, 404), true;
    for (const f of [join(PRD_DIR, `${id}.json`), join(DATA, "run-cases", `${prd.key}.json`)]) if (existsSync(f)) unlinkSync(f);
    ctx.json({ ok: true });
    return true;
  }
  if (ctx.req.method !== "POST") return ctx.json({ error: "GET, POST or DELETE" }, 405), true;

  const started = Date.now();
  const took = () => `${Math.round((Date.now() - started) / 1000)}s`;
  const b = await ctx.body();

  // The same PRD, written again: the cases already run keep their result.
  if (b?.again && safeId(b.id)) {
    const prd = loadPrd(b.id);
    if (!prd) return ctx.json({ error: "no such PRD" }, 404), true;
    try {
      const { cases, note, openQuestions } = await writeCases(prd);
      prd.openQuestions = openQuestions;
      const was = loadSet(prd.key);
      const now = new Date().toISOString();
      saveSet({ key: prd.key, runIds: [], ask: `PRD: ${prd.name}`, source: "prd", note, createdAt: was?.createdAt ?? now, updatedAt: now, cases: was ? carryOver(cases, was.cases) : cases });
      prd.updatedAt = now;
      prd.note = note;
      savePrd(prd);
      console.log(`[prd] ${prd.name}: ${cases.length} case(s) written again in ${took()}`);
      ctx.json(answer(prd));
    } catch (e) {
      ctx.json({ error: `the cases could not be written again: ${str((e as Error).message, 200)}` }, 502);
    }
    return true;
  }

  const name = str(b?.name, 120);
  const fileName = str(b?.fileName, 160);
  let text = "";
  try {
    if (typeof b?.fileBase64 === "string" && b.fileBase64.length) {
      const bytes = Buffer.from(b.fileBase64.replace(/^data:[^;]+;base64,/, ""), "base64");
      if (bytes.length > 25 * 1024 * 1024) return ctx.json({ error: "the file is over 25 MB" }, 413), true;
      text = textOf(fileName || "prd.txt", bytes);
    } else text = String(b?.text ?? "");
  } catch (e) {
    return ctx.json({ error: `the file could not be read: ${str((e as Error).message, 200)}` }, 400), true;
  }
  text = tidyText(text);
  if (text.length < 200) return ctx.json({ error: text.length ? "that is too short to be a PRD (under 200 characters of text came out of it)" : "no text came out of the document — a scanned PDF has none; paste the text instead" }, 400), true;

  const id = `prd-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  let prd: PrdDoc;
  try {
    const s = await structure(text);
    prd = { id, key: id, name: name || fileName.replace(/\.[a-z0-9]+$/i, "") || s.module || "PRD", fileName: fileName || undefined, companyId: Number(b?.companyId) || null, company: str(b?.company, 80) || undefined, createdAt: now, updatedAt: now, chars: text.length, text, ...s };
  } catch (e) {
    return ctx.json({ error: `the PRD could not be read into rules: ${str((e as Error).message, 200)}` }, 502), true;
  }
  console.log(`[prd] ${prd.name}: ${prd.features.reduce((n, f) => n + f.rules.length, 0)} rule(s) in ${prd.features.length} feature(s) read in ${took()} — writing the cases`);
  try {
    const { cases, note, openQuestions } = await writeCases(prd);
    prd.note = note;
    prd.openQuestions = openQuestions;
    savePrd(prd);
    saveSet({ key: prd.key, runIds: [], ask: `PRD: ${prd.name}`, source: "prd", note, createdAt: now, updatedAt: now, cases });
    console.log(`[prd] ${prd.name}: ${cases.length} case(s) written in ${took()}${note ? ` — ${note}` : ""}`);
    ctx.json(answer(prd));
  } catch (e) {
    // The rules were read: keep them, so "Write again" can try the cases without re-reading the file.
    prd.note = `the cases could not be written (${str((e as Error).message, 160)}) — press Write again`;
    savePrd(prd);
    ctx.json({ ...answer(prd), error: prd.note }, 502);
  }
  return true;
};
