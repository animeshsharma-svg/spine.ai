/**
 * FIND THE TEST CASES ABOUT WHAT WAS TYPED — "test placing bids", "surrogate", "extend time", a Hinglish line.
 *
 * The matcher (caseMatcher.ts) answers "is this ONE typed case already written?". This answers the other
 * question a tester asks first: "which cases do we have about this?" — and answers it with GROUPS (the
 * catalog's own sections), not eight loosely similar sentences.
 *
 * How:
 *   1. the words are normalised the way the matcher does (Hinglish, typos), then every term is folded to
 *      Procol's canonical word (supplier → vendor, quote → bid, RA → auction, on behalf → surrogate …) and
 *      stemmed; the same folding is applied to every case, so "quotes" finds "bids";
 *   2. a word index (BM25, title weighted) over every case — catalog, sheets, derived — scores the cases;
 *   3. meaning: the case vectors already in the memory store, plus the ones it lacks embedded once here
 *      (data/case-index-extra.json), compared with the typed text's vector when the embedder is reachable;
 *   4. the two scores are blended per case, then rolled up per SECTION (a section whose name says the
 *      topic rises), and the answer is: the sections about it with their best cases, then the flat list.
 *
 * `scripts/eval-case-search.ts` keeps this honest on a set of typed topics with the sections they must find.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allCases, type CatalogCase } from "./testCatalog.js";
import { normalizeText } from "./caseMatcher.js";
import { catalogCaseVectors } from "../rag/knowledgeBase.js";
import { embedFor, embedMany, embedderId, similarity } from "../rag/embedder.js";

const here = dirname(fileURLToPath(import.meta.url));
const EXTRA = join(here, "..", "..", "data", "case-index-extra.json");

// ── 1 · words → Procol's canonical words ───────────────────────────────────
/** Phrases first (longest first), then single words. Both sides — the query and every case — go through this. */
const PHRASES: Array<[RegExp, string]> = [
  [/\breverse auctions?\b|\bforward auctions?\b|\be-?auctions?\b|\b(?:r\.?a\.?)\b(?=\s|$)/g, " auction "],
  [/\bon (?:the )?behalf(?: of)?\b|\bbehalf\b/g, " surrogate "],
  [/\bcounter[- ]?offers?\b|\bnegotiat\w*\b|\bcounter[- ]?bids?\b/g, " counteroffer "],
  [/\bmaster qcs\b|\bmqcs\b|\bquote comparison\b|\bcomparison (?:sheet|view|grid)\b|\bqcs\b/g, " masterqcs "],
  [/\bpurchase orders?\b|\bp\.?o\.?s?\b(?=\s|$)/g, " purchaseorder "],
  [/\bpurchase requisitions?\b|\bpurchase requests?\b|\bp\.?r\.?s?\b(?=\s|$)/g, " purchaserequest "],
  [/\btechnical (?:stage|round|evaluation|bid|response)s?\b|\brfp\b|\bquestionnaires?\b/g, " technical "],
  [/\bsubmission time\b|\bbid(?:ding)? (?:end|close|closing|deadline|window)\b|\bdeadline\b|\bend time\b/g, " submissiontime "],
  [/\bextend\w*\b|\bextension\b|\bmore time\b|\bprolong\w*\b/g, " extend "],
  [/\bgo(?:es)? live\b|\bfloat\w*\b|\bpublish\w*\b|\brelease\w*\b/g, " publish "],
  [/\bwithdraw\w*\b|\bcancel\w*\b|\bcall(?:ed)? off\b/g, " withdraw "],
  [/\bnew version\b|\bversion\w*\b|\bamend\w*\b|\bre-?issue\w*\b/g, " amend "],
  [/\bconvert\w*\b|\bmove to auction\b|\bturn\w* into an? auction\b/g, " convert "],
  [/\baward\w*\b|\ballocat\w*\b|\bselect(?:ed|ion)? for award\w*\b|\bl1 vendor\b|\bwinner\b/g, " award "],
  [/\bapprov\w*\b|\bnfa\b|\bnote for approval\b/g, " approval "],
  [/\breject\w*\b|\bdecline\w*\b|\brefus\w*\b|\bdisqualif\w*\b/g, " reject "],
  [/\bline items?\b|\bitems?\b|\bproducts?\b|\bsku\b|\bmaterials?\b/g, " lineitem "],
  [/\bprice caps?\b|\bceiling prices?\b|\bmax(?:imum)? prices?\b/g, " pricecap "],
  [/\bsavings?\b|\bhistorical price\b|\blast purchase price\b|\blpp\b|\bbudget\b/g, " savings "],
  [/\branks?\b|\branking\b|\bl1\b|\bl2\b|\blowest\b|\bbest (?:offer|price|bidder)\b/g, " rank "],
  [/\bsuppliers?\b|\bbidders?\b|\bparticipants?\b|\bvendors?\b/g, " vendor "],
  [/\bbuyers?\b|\bpurchasers?\b|\bplanners?\b|\bprocurement\b/g, " buyer "],
  [/\bquotes?\b|\bquotations?\b|\bquoted\b|\boffers?\b(?!\s*letter)|\bbids?\b|\bbidding\b|\bbidded\b/g, " bid "],
  [/\bplac(?:e|es|ed|ing)\b|\bsubmit\w*\b|\benter\w*\b|\bput\w*\b|\bgive\w*\b|\bmake\w*\b|\bsend\w*\b/g, " place "],
  [/\bevents?\b|\bprojects?\b|\brfx\b|\brfqs?\b|\btenders?\b|\benquir\w*\b|\binquir\w*\b/g, " event "],
  [/\bsettings?\b|\bconfigs?\b|\bconfigurations?\b|\btoggles?\b|\bflags?\b/g, " setting "],
  [/\bpermissions?\b|\brights?\b|\broles?\b|\ballowed\b|\bauthori[sz]\w*\b|\baccess\b/g, " permission "],
  [/\bvendor portal\b|\bsupplier portal\b|\bvendor side\b/g, " vendorportal "],
  [/\btemplates?\b/g, " template "],
  [/\bschedul\w*\b|\bstart time\b|\bwindow\b/g, " schedule "],
  [/\bdraft\w*\b/g, " draft "],
  [/\bclos(?:e|ed|es|ing)\b|\bended\b|\bexpir\w*\b|\bevaluation (?:time|period|window)\b/g, " closed "],
  [/\blots?\b|\blot[- ]wise\b|\bsplit\w*\b/g, " lot "],
  [/\bboq\b|\bbill of quantit\w*\b/g, " boq "],
  [/\bmask\w*\b|\bseal\w*\b|\bhidden bids?\b/g, " masking "],
  [/\bcurrenc\w*\b|\bmulti[- ]?currency\b|\bexchange rates?\b|\bconversion rates?\b/g, " currency "],
  [/\bemails?\b|\bmails?\b|\bnotif\w*\b|\balerts?\b/g, " notification "],
  [/\bactivity logs?\b|\border activity\b|\baudit\w*\b/g, " activity "],
  [/\breports?\b|\bdownload\w*\b|\bexport\w*\b|\bexcel\b/g, " report "],
  [/\bonboard\w*\b|\bregistration\b|\bregister\w*\b/g, " onboarding "],
  [/\bintake\b|\bintake requests?\b|\bir\b(?=\s|$)/g, " intake "],
  [/\bevaluat\w*\b|\bscor\w*\b|\bevaluators?\b/g, " evaluate "],
  [/\bdutch\b|\bknock-?outs?\b|\btraffic light\b|\brank based\b|\bprice based\b|\bstrateg\w*\b/g, " strategy "],
  [/\bduplicate\w*\b|\btwice\b|\bdouble\b|\bagain\b|\brevis\w*\b/g, " again "],
];
const STOP = new Set("the a an and or of to in on for with at by from as is are be was were been being this that these those it its into than then when while where which who whom whose what how do does did done can could should would may might must shall will not no yes if so such only also just very test tests testing check checks checking verify verifying case cases scenario scenarios feature flow all any some each every other another both either neither same new one two three first second user users system app page screen procol".split(" "));
export function canonical(raw: string): string {
  let t = ` ${normalizeText(raw).text.toLowerCase()} `;
  for (const [re, to] of PHRASES) t = t.replace(re, to);
  return t.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
const stem = (w: string) => (w.length > 6 ? w.slice(0, 6) : w);
export function terms(raw: string): string[] {
  return canonical(raw).split(" ").filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w)).map(stem);
}

// ── 2 · the word index ────────────────────────────────────────────────────
interface Doc { id: string; c: CatalogCase; tf: Map<string, number>; len: number; sectionTerms: Set<string> }
interface Index { docs: Doc[]; df: Map<string, number>; avgLen: number; byId: Map<string, Doc> }
let index: Index | null = null;
let indexedCount = -1;
function textOf(c: CatalogCase): { title: string; body: string; section: string } {
  const sh = c.sheet;
  return {
    title: c.title,
    body: [c.why, c.setup, c.steps, c.expected, sh?.scenario, sh?.module, sh?.testData].filter(Boolean).join(" "),
    section: `${c.section} ${c.group}`,
  };
}
function buildIndex(): Index {
  const cases = allCases();
  if (index && indexedCount === cases.length) return index;
  const docs: Doc[] = [];
  const df = new Map<string, number>();
  let total = 0;
  for (const c of cases) {
    const t = textOf(c);
    const tf = new Map<string, number>();
    const add = (ws: string[], w: number) => { for (const x of ws) tf.set(x, (tf.get(x) ?? 0) + w); };
    add(terms(t.title), 3);
    add(terms(t.section), 2);
    add(terms(t.body), 1);
    let len = 0;
    for (const v of tf.values()) len += v;
    for (const k of tf.keys()) df.set(k, (df.get(k) ?? 0) + 1);
    total += len;
    docs.push({ id: c.id, c, tf, len, sectionTerms: new Set(terms(t.section)) });
  }
  index = { docs, df, avgLen: total / Math.max(1, docs.length), byId: new Map(docs.map((d) => [d.id, d])) };
  indexedCount = cases.length;
  return index;
}
function bm25(q: string[], d: Doc, ix: Index): number {
  const k1 = 1.4, b = 0.6, N = ix.docs.length;
  let s = 0;
  for (const w of q) {
    const f = d.tf.get(w);
    if (!f) continue;
    const n = ix.df.get(w) ?? 0;
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
    s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / ix.avgLen)));
  }
  return s;
}

// ── 3 · meaning ───────────────────────────────────────────────────────────
interface Extra { embedder: string; items: Record<string, { h: string; v: string }> }
let vectors: Map<string, Float32Array> | null = null;
let storeEmbedder = "";
const b64 = (v: number[]) => Buffer.from(new Float32Array(v).buffer).toString("base64");
const unb64 = (s: string) => new Float32Array(Buffer.from(s, "base64").buffer.slice(0));
const hashOf = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);
/** Every case's vector: the store's, else the cached extra, else embedded now (when `fill`). */
async function loadVectors(fill: boolean, log: (l: string) => void): Promise<void> {
  if (vectors && !fill) return;
  const cases = allCases();
  const store = catalogCaseVectors();
  storeEmbedder = store.embedder || embedderId();
  vectors ??= new Map();
  for (const [id, v] of store.vectors) if (!vectors.has(id)) vectors.set(id, Float32Array.from(v));
  let extra: Extra = { embedder: storeEmbedder, items: {} };
  if (existsSync(EXTRA)) {
    try {
      extra = JSON.parse(readFileSync(EXTRA, "utf8"));
    } catch {
      /* rebuild */
    }
  }
  if (extra.embedder !== storeEmbedder) extra = { embedder: storeEmbedder, items: {} };
  for (const [id, it] of Object.entries(extra.items)) if (!vectors.has(id)) vectors.set(id, unb64(it.v));
  if (!fill) return;
  const missing = cases.filter((c) => !vectors!.has(c.id));
  if (!missing.length) return;
  log(`Embedding ${missing.length} cases the memory does not hold yet…`);
  const texts = missing.map((c) => { const t = textOf(c); return `${c.id} (${c.layer}, ${c.section}) — ${t.title}. ${t.body}`.slice(0, 6000); });
  try {
    for (let i = 0; i < texts.length; i += 256) {
      const vs = await embedMany(texts.slice(i, i + 256));
      vs.forEach((v, j) => { const c = missing[i + j]; vectors!.set(c.id, Float32Array.from(v)); extra.items[c.id] = { h: hashOf(texts[i + j]), v: b64(v) }; });
      log(`  ${Math.min(i + 256, texts.length)} / ${texts.length}`);
    }
    mkdirSync(dirname(EXTRA), { recursive: true });
    writeFileSync(EXTRA, JSON.stringify(extra));
  } catch (e) {
    log(`Embedding stopped: ${(e as Error).message.slice(0, 120)} — the search works by words for the rest.`);
  }
}
function dot(a: Float32Array, b: number[]): number {
  if (a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// ── 4 · the search ────────────────────────────────────────────────────────
export interface FoundCase { id: string; title: string; layer: string; section: string; group: string; priority: string; score: number; words: number; meaning: number | null; sheet?: string }
export interface FoundGroup { section: string; group: string; layer: string; total: number; shown: number; score: number; cases: FoundCase[] }
export interface SearchResult { query: string; canonical: string; terms: string[]; total: number; groups: FoundGroup[]; cases: FoundCase[]; via: string; ms: number }

export async function searchCases(query: string, opts: { k?: number; groups?: number; perGroup?: number; fill?: boolean; log?: (l: string) => void } = {}): Promise<SearchResult> {
  const t0 = Date.now();
  const log = opts.log ?? (() => {});
  const ix = buildIndex();
  const q = terms(query);
  const canon = canonical(query);
  await loadVectors(opts.fill ?? false, log);
  let qv: number[] | null = null;
  try {
    qv = await embedFor(storeEmbedder, query);
  } catch {
    qv = null;
  }
  const words = new Map<string, number>();
  let maxW = 0;
  for (const d of ix.docs) {
    const s = bm25(q, d, ix);
    if (s > 0) { words.set(d.id, s); if (s > maxW) maxW = s; }
  }
  const meaning = new Map<string, number>();
  if (qv) for (const d of ix.docs) { const v = vectors?.get(d.id); if (v) meaning.set(d.id, dot(v, qv)); }
  // blend: words say the subject is named; meaning says it is about it. A case with neither is out.
  const scored: FoundCase[] = [];
  for (const d of ix.docs) {
    const w = words.get(d.id) ?? 0;
    const m = meaning.get(d.id);
    const wn = maxW ? w / maxW : 0;
    const mn = m !== undefined ? Math.max(0, (m - 0.25) / 0.5) : 0; // cosines live roughly in 0.25–0.75 for this embedder
    let score = qv ? 0.55 * wn + 0.45 * mn : wn;
    // the section itself names the subject: a strong sign for a topic query
    let hit = 0;
    for (const t of q) if (d.sectionTerms.has(t)) hit++;
    if (q.length && hit) score += 0.15 * (hit / q.length);
    if (score < (qv ? 0.18 : 0.12)) continue;
    scored.push({ id: d.id, title: d.c.title, layer: d.c.layer, section: d.c.section, group: d.c.group, priority: d.c.priority, score, words: wn, meaning: m ?? null, sheet: d.c.sheet?.sheet });
  }
  scored.sort((a, b) => b.score - a.score);
  // roll up per section: the best few cases carry the section; a section named for the topic rises
  const bySec = new Map<string, FoundGroup & { sum: number }>();
  for (const c of scored) {
    const g = bySec.get(c.section) ?? { section: c.section, group: c.group, layer: c.layer, total: 0, shown: 0, score: 0, sum: 0, cases: [] };
    g.total++;
    if (g.cases.length < (opts.perGroup ?? 8)) g.cases.push(c);
    if (g.cases.length <= 3) g.sum += c.score;
    if (g.layer !== c.layer) g.layer = "ui/api";
    bySec.set(c.section, g);
  }
  const groups = [...bySec.values()]
    .map((g) => { const secHit = terms(g.section).filter((t) => q.includes(t)).length; g.score = g.sum / Math.min(3, Math.max(1, g.cases.length)) + 0.08 * Math.min(3, secHit) + 0.02 * Math.log1p(g.total); g.shown = g.cases.length; return g; })
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.groups ?? 8)
    .map(({ sum: _s, ...g }) => g);
  return { query, canonical: canon, terms: q, total: scored.length, groups, cases: scored.slice(0, opts.k ?? 40), via: qv ? "words + meaning" : "words only (embedder not reachable)", ms: Date.now() - t0 };
}

/** Build or refresh the extra vectors (the cases the memory store lacks). */
export async function fillCaseIndex(log: (l: string) => void = () => {}): Promise<{ total: number; fromStore: number; extra: number }> {
  buildIndex();
  await loadVectors(true, log);
  const store = catalogCaseVectors();
  return { total: allCases().length, fromStore: store.vectors.size, extra: (vectors?.size ?? 0) - store.vectors.size };
}
