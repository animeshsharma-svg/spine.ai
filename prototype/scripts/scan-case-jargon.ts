/**
 * How much code-speak is left in the human text of every test case?
 *
 *   npx tsx scripts/scan-case-jargon.ts [--show N] [--kind snake]
 *
 * Renders every case (the runnable library + the written catalog) through
 * src/checks/caseDisplay.ts and counts the cases whose title, preconditions,
 * steps or expected result still contain snake_case, dotted field paths,
 * {{placeholders}}, uuids/reference ids, HTTP verbs or paths, or class names.
 * The details section is not scanned — that is where the technical part belongs.
 */
import { readdirSync, readFileSync } from "node:fs";
import {
  displayCatalogCase,
  displayFieldCheck,
  displayJourneyStep,
  displayLibraryCase,
  displayResult,
  knownIds,
  type CaseDisplay,
} from "../src/checks/caseDisplay.js";
import { heldCases, loadCases } from "../src/checks/caseLibrary.js";
import { allCases } from "../src/checks/testCatalog.js";

const KINDS: Record<string, RegExp> = {
  snake: /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/,
  // field paths, not e-mail addresses, file names or web addresses
  dotted: /(?<![@\w.\/-])[a-z][a-zA-Z0-9]*\.(?!(?:com|in|org|net|io|pdf|xlsx?|csv|png|jpe?g|txt|html?)\b)[a-z][a-zA-Z0-9_]*\b(?<!\be\.g)(?<!\bi\.e)(?<!\bwww\.\w+)/,
  placeholder: /\{\{|\}\}/,
  uuid: /\b[0-9a-f]{8}-[0-9a-f]{4}-|(?<![\w@.\/+=-])(?![A-Z]\d\/)(?=[A-Za-z0-9+\/]*[A-Z])(?=[A-Za-z0-9+\/]*\d)[A-Za-z0-9+\/]{8}(?![\w@.+\/=-])/,
  http: /\b(GET|POST|PATCH|PUT|DELETE)\b|(?:^|\s)\/[a-z_]+\/|\bHTTP\b|\b(?:status|code|with|returns?|answers?|refused|rejected|same|[Aa]ssert|is|an?|A|empty)\s+[1-9]\d\d\b(?![-+,]|\s*(?:in history|new|ids?|items?|characters|entries|rows?|vendors?|line|participants?|copies|products?|audience|BOQ|companies))/,
  className: /\b(?!Dup)[A-Z][a-z]+(?:[A-Z][a-z]+)+\b|::|#\w+|\bSorbet\b|\bsig\b|\bparams\b/,
  codey: /`|=>|\bnull\b|\btrue\b|\bfalse\b|\[\]|\bjson\b|(?<!subject, )\bbody\b|\bpayload\b|\bendpoint\b|\bassert\b/i,
  // from the reports agent's leak scanner
  opaqueId: /(?<![\w@.\/-])(?=[A-Za-z0-9]*[A-Z])(?=[A-Za-z0-9]*[a-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{6,}={0,2}(?![\w@.-])/,
  stampNum: /\b\d{10,}\b/,
  camel: /\b[a-z]+[A-Z][a-z]+[A-Za-z]*\b/,
  json: /\{\s*"|"\s*:\s*["\d{\[tfn]/,
};
const args = process.argv.slice(2);
const show = Number(args[args.indexOf("--show") + 1]) || 0;
const only = args.includes("--kind") ? args[args.indexOf("--kind") + 1] : undefined;
const field = args.includes("--field") ? args[args.indexOf("--field") + 1] : undefined;

const items: Array<{ src: string; d: CaseDisplay }> = [];
const seen = new Set<string>();
for (const c of [...loadCases(), ...heldCases()]) {
  if (seen.has(c.id)) continue;
  seen.add(c.id);
  items.push({ src: "library", d: displayLibraryCase(c) });
}
for (const c of allCases()) if (!seen.has(c.id)) items.push({ src: "catalog", d: displayCatalogCase(c) });
// results: the last 40 saved runs — check rows, journey steps and their field checks
if (!args.includes("--cases-only")) {
  const dir = new URL("../data/runs/", import.meta.url).pathname;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort().reverse().slice(0, 40)) {
    const r = JSON.parse(readFileSync(dir + f, "utf8"));
    for (const c of r.checkResults ?? []) items.push({ src: "result", d: displayResult(c) });
    const j = r.journey;
    for (const st of j?.steps ?? []) {
      items.push({ src: "step", d: displayJourneyStep(st, j.made ?? {}) });
      for (const fc of st.assertions?.results ?? []) items.push({ src: "field", d: displayFieldCheck(fc, st, { ...knownIds(j.made), ...knownIds(st.produced) }) });
    }
  }
}

const fields = (d: CaseDisplay): Record<string, string> => ({
  title: d.title,
  preconditions: d.preconditions,
  steps: d.steps.join(" | "),
  expected: d.expected,
  why: d.why ?? "",
  actual: d.actual ?? "",
  reason: d.reason ?? "",
});
const byKind: Record<string, number> = {};
const byField: Record<string, number> = {};
let dirty = 0;
const samples: string[] = [];
for (const { d } of items) {
  let hit = false;
  for (const [f, rawText] of Object.entries(fields(d))) {
    // e-mail addresses are data a person reads as-is (as in the reports agent's scanner); "Base64" is a word
    const text = rawText.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, " ").replace(/\bBase64\b/g, " ");
    if (field && f !== field) continue;
    for (const [k, re] of Object.entries(KINDS)) {
      if (only && k !== only) continue;
      const m = text.match(re);
      if (!m) continue;
      byKind[k] = (byKind[k] ?? 0) + 1;
      byField[f] = (byField[f] ?? 0) + 1;
      hit = true;
      if (samples.length < show) samples.push(`${d.ref} [${k}/${f}] «${m[0]}»  ${text.slice(Math.max(0, (m.index ?? 0) - 70), (m.index ?? 0) + 70)}`);
    }
  }
  if (hit) dirty += 1;
}
const bySrc: Record<string, number> = {};
for (const it of items) bySrc[it.src] = (bySrc[it.src] ?? 0) + 1;
console.log(JSON.stringify({ items: items.length, bySrc, withJargon: dirty, byKind, byField }, null, 1));
for (const s of samples) console.log(s);
