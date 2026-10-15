/**
 * THE CASE MATCHER — "is what you just typed a test case we already have?"
 *
 * Someone types a test case into the chat box in their own words: a
 * paraphrase, a typo, half Hindi, or only half the case. Before anything is
 * built or run, the platform has to answer one question honestly: which of the
 * 4,000-odd written cases (and the drafts the assistant wrote earlier) already
 * cover it — fully, partly, or not at all.
 *
 * How it decides, in order:
 *
 *   1. UNDERSTAND   the text is normalised: Hinglish function words mapped to
 *                   English ("bina" → without, "chahiye" → should), product
 *                   synonyms folded ("supplier" → vendor, "go live" → publish),
 *                   typos corrected against the catalog's own vocabulary.
 *                   Then the CONCEPTS are read out of it — the action, the
 *                   things acted on, the condition ("without a title"), and
 *                   what should happen (refused / succeeds / must not crash).
 *   2. CANDIDATES   from two independent sources: the memory (Postgres +
 *                   pgvector, every catalog case embedded as its own chunk,
 *                   scored 0.75 meaning + 0.25 words, as `retrieve` does) and a
 *                   plain word index (BM25) over the catalog's titles, steps
 *                   and expected results. A case either source finds is a
 *                   candidate; drafts written by the assistant are searched too.
 *   3. DECIDE       per candidate, deterministically: how close the meaning is,
 *                   how many of the typed words it shares, and — the part that
 *                   separates "publish" from "publish without a title" — how
 *                   many of the typed CONCEPTS it contains, and whether it
 *                   expects the same outcome. That gives SAME (it covers the
 *                   typed case), PARTIAL (it covers part — and which part is
 *                   missing is named), or UNRELATED.
 *   4. CONFIRM      optionally, the fast-tier model reads the top ≤5 candidates
 *                   beside the typed text and says same / partial / unrelated.
 *                   It can move a decision by ONE step (it reads meaning better
 *                   than a word list), never two, and never lift a candidate the
 *                   numbers put far away. Its answer is validated JSON; anything
 *                   else is ignored. It never decides whether a test passes.
 *
 * Thresholds were tuned on the dev half of prompts/matching.jsonl and are
 * reported on both halves by scripts/eval-matcher.ts.
 */
import { allCases, caseById, type CatalogCase } from "./testCatalog.js";
import { spineDb } from "../db/spineDb.js";
import { candidates as pgCandidates } from "../rag/pgMemory.js";
import { embedFor, embedderId, ensureEmbedderReady } from "../rag/embedder.js";
import { retrieve } from "../rag/knowledgeBase.js";
import { chat, llmMode, usageReport } from "../ai/llm.js";

// ── 1 · UNDERSTAND ──────────────────────────────────────────────────────────

/** Hinglish function words and verbs → English. Applied before anything else. */
const HINGLISH: Array<[RegExp, string]> = [
  // "deadline ke baad" is "after the deadline": Hindi puts the postposition after the noun.
  [/\b((?:bid |submission |closing |end )?(?:deadline|end time|closing time|submission time|bid end|window|time|close|closing|award\w*|publish\w*|submission|extension))\s+(?:ke|kay|ki)\s+(?:baad|bad)\b/g, " after the $1 "],
  [/\b((?:bid |submission |closing |end )?(?:deadline|end time|closing time|submission time|bid end|window|start|publish\w*|award\w*))\s+(?:ke|kay|ki|se)\s+(?:pehle|pahle|phle)\b/g, " before the $1 "],
  [/\b(?:dena|dene|deni|dijiye|dijie|dedo|de do|karne|karni|krne|karvana|karwana)\b/g, " "],
  [/\bke\s+bina\b|\bbina\b|\bbagair\b|\bbager\b|\bbegair\b/g, " without "],
  [/\b(?:hona|hone|honi)\s+(?:chahiye|chahie|chaiye)\b|\b(?:chahiye|chahie|chaiye|chahiye)\b/g, " should "],
  [/\bnahi+n?\b|\bnahee\b|\bnhi\b|\bnai\b|\bmat\b/g, " not "],
  [/\b(?:aa+na|aaye|aaega|aayega|aata|aaegi|aayegi|aati)\b/g, " "],
  [/\b(?:karo+|karna|karke|kar ke|kiya|kiye|karte|karein|kare|karta|karti|krna|kro)\b/g, " "],
  [/\bjab\b/g, " when "],
  [/\baur\b/g, " and "],
  [/\bdobara\b|\bphir\s+se\b|\bfir\s+se\b|\bdubara\b/g, " again "],
  [/\bdusri\b|\bdoosri\b|\bdusra\b|\bdoosra\b/g, " second "],
  [/\bke\s+saath\b|\bsaath\b|\bsath\b/g, " with "],
  [/\bki\s+taraf\s+se\b|\bke\s+behalf\b|\bki\s+jagah\b/g, " on behalf of "],
  [/\bnaam\s+(?:pe|par|se)\b/g, " against "],
  [/\bsirf\b|\bkewal\b/g, " only "],
  [/\bdo\s+baar\b|\bdo\s+bar\b/g, " twice "],
  [/\bkhaa?li\b/g, " empty "],
  [/\bgalat\b|\bghalat\b/g, " invalid "],
  [/\bsahi\b/g, " valid "],
  [/\b(?:dikhna|dikhne|dikhni|dikhe|dikhta|dikhti|dikhega|dikhegi|dikhana|dikhao|dikhai|dikhaye)\b/g, " shown "],
  [/\bband\b/g, " closed "],
  [/\bpura+na\b|\bpurani\b/g, " old "],
  [/\bnaya\b|\bnayi\b|\bnaye\b/g, " new "],
  [/\b(?:bhejo|bhejna|bheje|bhej)\b/g, " send "],
  [/\b(?:daalo|dalo|daal|daalna|daale|dal)\b/g, " enter "],
  [/\bsaa?re\b|\bsab\b/g, " all "],
  [/\bek\b/g, " one "],
  [/\b(?:koi|kisi)\b/g, " any "],
  [/\bpehle\b|\bpahle\b/g, " before "],
  [/\bbaad\b/g, " after "],
  [/\bzyada\b|\bjyada\b|\bzada\b|\bjada\b/g, " more "],
  [/\b(?:sakta|sakte|sakti|paye|paaye|paega|paana|pana|paayega|payega)\b/g, " can "],
  [/\b(?:khatam|khatm|khtam|khtm|khatham|nikal gaya|nikal gayi|beet gaya)\b/g, " over "],
  [/\b(?:hatao|hatana|hata)\b/g, " remove "],
  [/\b(?:banao|banana|bana|banaye)\b/g, " create "],
  [/\b(?:kholo|kholna|khol)\b/g, " open "],
  [/\b(?:dekho|dekhna|dekh)\b/g, " see "],
  [/\b(?:badlo|badalna|badal)\b/g, " change "],
  [/\b(?:wala|wali|wale|vala|vali|vale)\b/g, " "],
  [/\b(?:ko|ka|ki|ke|se|mein|mai|pe|par|hai|hain|ho|toh|tab|yeh|ye|woh|wo|bhi|na|kya|agar)\b/g, " "],
];

/** Product vocabulary folded to one spelling, so words and concepts line up. */
const SYNONYMS: Array<[RegExp, string]> = [
  [/\bw\/o\b/g, " without "],
  [/\bcan'?t\b|\bcan not\b/g, " cannot "],
  [/\b(?:doesn'?t|don'?t|dont|isn'?t|aren'?t|wasn'?t|won'?t)\b/g, " not "],
  [/\bshouldn'?t\b/g, " should not "],
  [/\bmustn'?t\b/g, " must not "],
  [/\bsuppliers?\b|\bsellers?\b/g, " vendor "],
  // An event's "audience" / "participants" ARE its vendors: "publish without
  // vendors" must find "publishing with an empty audience".
  [/\baudiences?\b/g, " vendor audience "],
  [/\bparticipants?\b/g, " vendor participant "],
  [/\btenders?\b/g, " event "],
  [/\brequest for quotations?\b|\bquotations?\b/g, " rfq "],
  [/\brequest for proposals?\b/g, " rfp "],
  [/\bline[- ]?items?\b/g, " line item "],
  [/\be-?mail\b/g, " email "],
  [/\bqty\b/g, " quantity "],
  [/\bgoes live\b|\bgo live\b|\bmake (?:it |the event )?live\b|\blaunch(?:es|ed)?\b/g, " publish "],
  [/\bpls\b|\bplz\b|\bplease\b|\bkindly\b/g, " "],
  [/\bmore then\b/g, " more than "],
  [/\bless then\b/g, " less than "],
  [/\bexcel\b|\bxlsx\b|\bspreadsheet\b/g, " excel "],
  [/\be2e\b|\bend[- ]to[- ]end\b/g, " end to end "],
];

const STOP = new Set(
  ("a an the and or of to in on for with is are was were be been being it its this that at by from as if then than so " +
    "should must will would can could may might do does did has have had when which who what there their they them " +
    "test testing check verify ensure case scenario able also any some one just only very into onto via per it's its")
    .split(" "),
);

/** Ordinary English the catalog happens not to use — never "repaired". */
const COMMON = new Set(
  ("tries try tried trying click clicks clicked press pressed forgets forget happens happen user users his her their " +
    "him says said gets got goes went comes came give gives gave given told tell tells make makes made take takes took " +
    "thing things stuff okay fine good bad works working broken check checks checked expect expects expected")
    .split(" "),
);

let vocab: Map<string, number> | null = null;
/** Every word the catalog uses, with how often — the dictionary for typo repair. */
function vocabulary(): Map<string, number> {
  if (vocab) return vocab;
  vocab = new Map();
  for (const c of allCases()) {
    for (const w of `${c.title} ${c.steps} ${c.expected}`.toLowerCase().split(/[^a-z]+/)) {
      if (w.length >= 3) vocab.set(w, (vocab.get(w) ?? 0) + 1);
    }
  }
  // Words people type that the catalog spells differently are still words.
  for (const w of ["rfq", "rfp", "boq", "vendor", "publish", "without", "refused", "should", "surrogate", "auction", "award", "bid", "excel", "hinglish"]) {
    vocab.set(w, Math.max(vocab.get(w) ?? 0, 50));
  }
  return vocab;
}

/** Damerau–Levenshtein distance with an early exit above `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** The catalog word a typo most likely meant, or the word itself. */
let stemmedVocab: Set<string> | null = null;
function repairTypo(w: string): { word: string; fixed: boolean } {
  const v = vocabulary();
  if (w.length < 4 || v.has(w) || STOP.has(w) || /\d/.test(w) || COMMON.has(w)) return { word: w, fixed: false };
  // An inflection of a word the catalog uses ("tries" when it has "tried") is
  // not a typo — without this, "tries" was "repaired" to "ties".
  stemmedVocab ??= new Set([...v.keys()].map(stem));
  if (stemmedVocab.has(stem(w))) return { word: w, fixed: false };
  const max = w.length >= 7 ? 2 : 1;
  let best = w;
  let bestD = max + 1;
  let bestF = 0;
  let bestL = 0;
  for (const [cand, f] of v) {
    if (f < 2 || Math.abs(cand.length - w.length) > max || cand[0] !== w[0] && cand[1] !== w[1]) continue;
    const dist = editDistance(w, cand, max);
    // Ties: the candidate sharing the longer prefix wins ("stags" → "stage",
    // not the more frequent "stays"), then the more frequent one.
    let lcp = 0;
    while (lcp < w.length && lcp < cand.length && w[lcp] === cand[lcp]) lcp++;
    if (dist < bestD || (dist === bestD && (lcp > bestL || (lcp === bestL && f > bestF)))) {
      best = cand;
      bestD = dist;
      bestF = f;
      bestL = lcp;
    }
  }
  return bestD <= max ? { word: best, fixed: best !== w } : { word: w, fixed: false };
}

export interface Understood {
  typed: string;
  /** the text after Hinglish, synonyms and typo repair — what is matched */
  normalized: string;
  /** "tittle → title", for the reader to see what was assumed */
  repairs: string[];
  concepts: FoundConcept[];
  /** what the typed case expects to happen */
  polarity: Polarity;
  /** who does what, in which state (see frameOf) */
  frame: Frame;
}

export type Polarity = "refuse" | "crash" | "success" | "neutral";

export function normalizeText(raw: string): { text: string; repairs: string[] } {
  // "10,000" is one number, not "10" and "000".
  let t = ` ${raw.toLowerCase().replace(/(\d),(?=\d{3}\b)/g, "$1").replace(/[“”"'`’]/g, " ").replace(/[_]/g, " ")} `;
  for (const [re, to] of HINGLISH) t = t.replace(re, to);
  for (const [re, to] of SYNONYMS) t = t.replace(re, to);
  t = t.replace(/[^a-z0-9%.+\- ]+/g, " ").replace(/\s+/g, " ").trim();
  const repairs: string[] = [];
  const words = t.split(" ").map((w) => {
    const bare = w.replace(/[^a-z]/g, "");
    if (bare !== w || !bare) return w;
    const r = repairTypo(bare);
    if (r.fixed) repairs.push(`${bare} → ${r.word}`);
    return r.word;
  });
  // Synonyms again: a repaired typo ("suplier" → "supplier") may now fold.
  let out = ` ${words.join(" ")} `;
  for (const [re, to] of SYNONYMS) out = out.replace(re, to);
  return { text: out.replace(/\s+/g, " ").trim(), repairs };
}

// ── concepts ────────────────────────────────────────────────────────────────

export type ConceptKind = "action" | "thing" | "condition";
export interface Concept {
  id: string;
  kind: ConceptKind;
  /** how it reads in "does not cover …" */
  label: string;
  re: RegExp;
}
export interface FoundConcept {
  id: string;
  kind: ConceptKind;
  label: string;
  /** the typed words that named it */
  said: string;
  /** for a condition: the thing it applies to ("title" in "without title") */
  object?: string[];
  /** an action named only in a setup clause ("create an RFQ event and check whether …") */
  setup?: boolean;
}

/**
 * The concepts a sourcing-events test case is built from.
 *
 * Deliberately a short, readable list: an action (what the case does), the
 * things it acts on, and the condition that makes it a particular case rather
 * than the happy path. Matching a candidate means it contains the SAME
 * concepts — which is what tells "publish an event" apart from "publish an
 * event without a title".
 */
export const CONCEPTS: Concept[] = [
  // actions
  { id: "publish", kind: "action", label: "publishing", re: /\bpublish\w*|\bactivat\w*|\blive\b/ },
  { id: "create", kind: "action", label: "creating it", re: /\bcreat\w*|\bnew (?:event|draft|project)|\bset(?:ting)? up\b/ },
  { id: "draft", kind: "thing", label: "a draft", re: /\bdraft\w*/ },
  { id: "save", kind: "action", label: "saving", re: /\bsav(?:e|es|ed|ing)\b/ },
  { id: "edit", kind: "action", label: "editing / changing it", re: /\bedit\w*|\bupdat\w*|\bchang\w*|\bmodif\w*|\brevis\w*|\bamend\w*/ },
  { id: "withdraw", kind: "action", label: "withdrawing the event", re: /\bwithdr[ae]w\w*/ },
  { id: "clone", kind: "action", label: "cloning / copying", re: /\bclon\w*|\bduplicat\w* (?:the |an? )?event|\bcopy\b/ },
  { id: "extend", kind: "action", label: "extending the deadline", re: /\bextend\w*|\bextension\b/ },
  { id: "convert", kind: "action", label: "converting RFQ to auction", re: /\bconvert\w*(?: \w+){0,4} (?:to|into) (?:an? )?auction|\bauction\w* (?:\w+ )?convert\w*|\bconversion\b|\bconverts? (?:to|into) an? auction/ },
  { id: "invite", kind: "action", label: "inviting vendors", re: /\binvit\w*|\baudience\b|\bparticipant\w*|\bparticipat\w*/ },
  { id: "bid", kind: "action", label: "bidding", re: /\bbid\w*|\bquot(?:e|es|ed|ing)\b|\bpric(?:e|es|ing) (?:cell|sheet)/ },
  { id: "surrogate", kind: "action", label: "a surrogate bid (buyer on the vendor's behalf)", re: /\bsurrogate\b|\bon (?:the )?(?:vendor\w* )?behalf\b|\badd bid\b/ },
  { id: "award", kind: "action", label: "awarding", re: /\bawar\w*|\bproposal\w*|\bwinner\b|\bqcs\b/ },
  { id: "approve", kind: "action", label: "approval", re: /\bapprov\w*/ },
  { id: "evaluate", kind: "action", label: "evaluation / scoring", re: /\bevaluat\w*|\bscor\w*/ },
  { id: "counter", kind: "action", label: "a counter offer", re: /\bcounter[- ]?offer\w*|\bnegotiat\w*/ },
  { id: "upload", kind: "action", label: "an upload", re: /\bupload\w*|\bbulk\b|\bimport\w*/ },
  { id: "submit", kind: "action", label: "submitting", re: /\bsubmi\w*\b(?! (?:time|date|deadline|window|end|period)\b)/ },
  { id: "delete", kind: "action", label: "removing / deleting", re: /\bdelet\w*|\bremov\w*/ },
  { id: "version", kind: "action", label: "versioning", re: /\bversion\w*|\bsupersed\w*/ },
  { id: "view", kind: "action", label: "what is shown / seen", re: /\bsee[sn]?\b|\bshown?\b|\bvisible\b|\bdisplay\w*|\bappear\w*|\bread\w*|\bview\w*|\blist\b/ },
  { id: "search", kind: "action", label: "searching / filtering", re: /\bsearch\w*|\bfilter\w*|\bsort\w*/ },
  { id: "download", kind: "action", label: "downloading / exporting", re: /\bdownload\w*|\bexport\w*/ },
  { id: "login", kind: "action", label: "signing in", re: /\blog ?in\w*|\bsign\w* in\b|\botp\b/ },
  // things
  { id: "title", kind: "thing", label: "the title", re: /\btitle\w*|\bevent name\b|\bproject name\b/ },
  { id: "description", kind: "thing", label: "the description", re: /\bdescription\w*/ },
  { id: "stage", kind: "thing", label: "stages / rounds", re: /\bstages?\b|\brounds?\b/ },
  { id: "rfq", kind: "thing", label: "an RFQ", re: /\brfq\w*|\bpricing (?:stage|round)/ },
  { id: "rfp", kind: "thing", label: "a technical (RFP) stage", re: /\brfp\w*|\btechnical\b|\bquestionnaire\w*|\bquestion\w*/ },
  { id: "auction", kind: "thing", label: "an auction", re: /\bauction\w*/ },
  { id: "dutch", kind: "thing", label: "a Dutch auction", re: /\bdutch\b/ },
  { id: "knockout", kind: "thing", label: "a knockout auction", re: /\bknock ?out\b/ },
  { id: "rank", kind: "thing", label: "rank-based", re: /\brank\w*/ },
  { id: "lineitem", kind: "thing", label: "line items", re: /\bline item\w*|\bitems?\b|\bproducts?\b/ },
  { id: "boq", kind: "thing", label: "BOQ", re: /\bboq\b|\bbill of quantit\w*/ },
  { id: "template", kind: "thing", label: "the template", re: /\btemplat\w*/ },
  { id: "schedule", kind: "thing", label: "the schedule / bid window", re: /\bschedul\w*|\bstart (?:time|date)|\bend (?:time|date)|\bwindow\b|\bdeadline\w*|\bclos(?:e|es|ing) (?:time|date)|\btimer\b/ },
  { id: "vendor", kind: "thing", label: "the vendor", re: /\bvendor\w*|\bbidder\w*/ },
  { id: "evaluator", kind: "thing", label: "the evaluator", re: /\bevaluator\w*/ },
  { id: "gst", kind: "thing", label: "GST / tax", re: /\bgst\b|\btax\w*/ },
  { id: "discount", kind: "thing", label: "a discount", re: /\bdiscount\w*/ },
  { id: "price", kind: "thing", label: "the price", re: /\bpric\w*|\brates?\b|\bamount\w*|\bcost\w*/ },
  { id: "quantity", kind: "thing", label: "the quantity", re: /\bquantit\w*/ },
  { id: "attachment", kind: "thing", label: "attachments", re: /\battach\w*|\bfiles?\b|\bpdf\b|\bdocument\w*/ },
  { id: "currency", kind: "thing", label: "currency", re: /\bcurrenc\w*/ },
  { id: "savings", kind: "thing", label: "savings", re: /\bsaving\w*/ },
  { id: "remark", kind: "thing", label: "a remark / reason", re: /\bremark\w*|\breason\w*|\bcomment\w*/ },
  { id: "permission", kind: "thing", label: "permissions / access", re: /\bpermission\w*|\baccess\w*|\bauthori[sz]\w*|\brole\w*/ },
  { id: "othercompany", kind: "thing", label: "another company", re: /\banother (?:company|buyer|tenant)|\bother company\b|\bcross[- ]tenant\b|\bdifferent company\b/ },
  { id: "email", kind: "thing", label: "an email address", re: /\bemail\w*/ },
  { id: "vendorcode", kind: "thing", label: "the vendor code", re: /\bvendor code\w*/ },
  { id: "excel", kind: "thing", label: "an Excel sheet", re: /\bexcel\b|\bsheet\w*|\bcsv\b/ },
  { id: "terms", kind: "thing", label: "terms and conditions", re: /\bterms?\b|\bt&c\b|\bconditions\b/ },
  { id: "masking", kind: "thing", label: "vendor masking", re: /\bmask\w*/ },
  { id: "category", kind: "thing", label: "a category", re: /\bcategor\w*/ },
  { id: "location", kind: "thing", label: "a location", re: /\blocation\w*|\bbuyer hub\w*|\bwarehouse\w*/ },
  { id: "team", kind: "thing", label: "a team", re: /\bteams?\b/ },
  { id: "user", kind: "thing", label: "a user", re: /\busers?\b|\bmembers?\b/ },
  { id: "pr", kind: "thing", label: "a purchase request", re: /\bpurchase request\w*|\bpr\b|\brequisition\w*/ },
  { id: "freight", kind: "thing", label: "freight", re: /\bfreight\b/ },
  // conditions — what makes it this case and not the happy path
  { id: "missing", kind: "condition", label: "leaving something out", re: /\bwithout\b|\bmissing\b|\bblank\b|\bempty\b|\bomit\w*|\bno (?!one\b)[a-z]+|\bnot (?:set|filled|given|entered|pressed|selected|provided)\b|\bleft out\b/ },
  { id: "negative", kind: "condition", label: "a negative value", re: /\bnegative\b|\bminus\b|\bbelow zero\b/ },
  { id: "zero", kind: "condition", label: "zero", re: /\bzero\b|\b0\b/ },
  { id: "twice", kind: "condition", label: "doing it twice / a duplicate", re: /\btwice\b|\bduplicat\w*|\bagain\b|\bsecond\b|\brepeat\w*|\bsame \w+ (?:twice|two)|\balready\b|\bexisting\b/ },
  { id: "invalid", kind: "condition", label: "an invalid / malformed value", re: /\binvalid\b|\bwrong\b|\bmalformed\b|\bnon[- ]?numeric\b|\bletters?\b|\btext (?:in|like)\b|\bas text\b|\bstring\b|\babc\b|\bgarbage\b|\bbad\b/ },
  { id: "nonexistent", kind: "condition", label: "something that does not exist", re: /\bnon[- ]?exist\w*|\bdoes not exist\b|\bnot exist\w*|\bunknown\b|\bbogus\b|\bfake\b|\bnot found\b/ },
  { id: "limit", kind: "condition", label: "going over a limit", re: /\bmax\w*|\blimit\w*|\bceiling\b|\bmore than\b|\bexceed\w*|\bcap(?:ped)?\b|\bover \d+|\b(?<!\b(?:an?|http|status|code|not|gives?|returns?|with) )\d{3,}\b(?! (?:error|status|response|code))/ },
  {
    id: "closed",
    kind: "condition",
    label: "after the bidding window is over",
    re: /\bafter (?:the )?(?:window|event|bid\w*|deadline|submission|closing|end)?(?: (?:end|closing|submission|bidding))? ?(?:time|date|window)? ?(?:is |has |gets )?(?:clos\w*|end\w*|expir\w*|over|passed|up)\b|\bclosed\b|\bexpired\b|\b(?:deadline|end time|bid end|bid end time|closing time|window|submission time|bidding time|time) (?:is |has |gets )?(?:over|passed|expired|ended|gone|up|lapsed)\b|\bafter (?:the )?(?:deadline|bid end|end time|closing time|submission time|bid end time|cut-?off)\b|\blate (?:bid|quote|submission|response)\w*|\bpast (?:the )?(?:deadline|end time|bid end|closing time|cut-?off)\b|\bonce (?:bidding|the round|the window|the event) (?:has )?(?:clos\w*|end\w*)/,
  },
  { id: "special", kind: "condition", label: "special characters / script input", re: /\bemoji\w*|\bspecial char\w*|\bscript\w*|\bhtml\b|\bxss\b|\binjection\b|\bunicode\b/ },
  { id: "long", kind: "condition", label: "a very long value", re: /\bvery long\b|\btoo long\b|\blong (?:title|name|text|string)\b|\bcharacters?\b/ },
  { id: "past", kind: "condition", label: "a date in the past / wrong order", re: /\bpast\b(?! (?:the )?(?:deadline|end time|bid end|closing time|cut-?off))|\bbefore (?:the )?start\b|\bend before\b|\bearlier than\b/ },
];

const REFUSE = /\bnot (?:should|can)\b|\bnot (?:be )?able\b|\brefus\w*|\breject\w*|\bblock\w*|\berror\w*|\bfail\w*|\bnot allowed\b|\bcannot\b|\bshould not\b|\bmust not\b|\bdenied\b|\bprevent\w*|\bdisallow\w*|\bstops?\b|\bforbid\w*|\bnot (?:be )?(?:possible|permitted)\b|\b4\d\d\b|\bvalidation\b/;
const CRASH = /\b5\d\d\b|\bcrash\w*|\bserver error\b/;
const SUCCESS = /\ballowed\b|\bable to\b|\bcan (?!not\b)(?:still |also )?[a-z]+|\bis possible\b|\bgoes through\b|\bsucceed\w*|\bsuccess\w*|\bworks?\b|\baccept\w*|\bcreated\b|\bpublishes\b|\bsaved\b|\bis shown\b|\bappears?\b|\bcompletes?\b|\blands? on\b/;

export function polarityOf(text: string): Polarity {
  if (CRASH.test(text)) return "crash";
  if (REFUSE.test(text)) return "refuse";
  if (SUCCESS.test(text)) return "success";
  return "neutral";
}

/** Words that, near an object, say the same condition in a candidate's text. */
const CONDITION_MARKERS: Record<string, RegExp> = {
  missing: /^(?:without|missing|blank|empty|omit\w*|no|none|null|nil|require\w*|remov\w*|absent|unset|left|nothing|lack\w*|zero)$/,
  negative: /^(?:negative|minus|-\d.*)$/,
  zero: /^(?:zero|0|blank)$/,
  twice: /^(?:twice|duplicat\w*|again|second|repeat\w*|already|same|existing|exists|taken|re\w+)$/,
  invalid: /^(?:invalid|wrong|malformed|non|numeric|text|letters?|string|type|garbage|bad|format)$/,
  limit: /^(?:max\w*|limit\w*|ceiling|more|exceed\w*|cap\w*|over|above|\d{3,})$/,
  closed: /^(?:clos\w*|after|expir\w*|ended|end)$/,
  special: /^(?:emoji\w*|script\w*|html|xss|injection|unicode|special|escap\w*)$/,
  long: /^(?:long|characters?|length|chars)$/,
  past: /^(?:past|before|earlier)$/,
};

/** Verbs whose negation ("not invited") is the whole point of a case. */
const NEGATABLE: Record<string, RegExp> = {
  invited: /^(?:invit\w*|audience|participant\w*|uninvit\w*)$/,
  awarded: /^(?:award\w*)$/,
  answered: /^(?:answer\w*|unanswer\w*|respond\w*)$/,
  submitted: /^(?:submi\w*)$/,
  published: /^(?:publish\w*|unpublish\w*|live)$/,
  saved: /^(?:sav\w*|unsav\w*)$/,
  scored: /^(?:scor\w*|unscor\w*)$/,
  approved: /^(?:approv\w*|unapprov\w*)$/,
  selected: /^(?:select\w*)$/,
  filled: /^(?:fill\w*)$/,
};
const AUX = /^(?:should|must|can|cannot|will|does|do|is|are|was|be|could|would|may|did|has|have)$/;

export function conceptsIn(normalized: string): FoundConcept[] {
  const out: FoundConcept[] = [];
  const words = normalized.split(" ").filter(Boolean);
  for (const c of CONCEPTS) {
    const m = normalized.match(c.re);
    if (!m) continue;
    let said = m[0];
    let object: string[] | undefined;
    // A condition keeps the words it applies to: "without title", "no line item".
    if (c.kind === "condition") {
      const rest = normalized.slice((m.index ?? 0) + m[0].length).split(" ").filter(Boolean).filter((w) => !STOP.has(w) && !/^(?:should|must|error|refused?|be)$/.test(w)).slice(0, 2);
      if (/^(?:without|missing|blank|empty|no|negative|zero|invalid|wrong|null)\b/.test(said) && rest.length) {
        object = rest.slice(0, rest[0] === "line" ? 2 : 1);
        said = `${said.split(" ")[0]} ${object.join(" ")}`;
      }
    }
    out.push({ id: c.id, kind: c.kind, label: c.label, said: said.trim(), object });
  }
  // "vendor not invited", "question unanswered": the negation is a condition.
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const negatedNext = w === "not" && i + 1 < words.length && !(i > 0 && AUX.test(words[i - 1]));
    const target = negatedNext ? words[i + 1] : /^un(?:invited|answered|scored|approved|saved|published)$/.test(w) ? w : null;
    if (!target) continue;
    const key = Object.keys(NEGATABLE).find((k) => NEGATABLE[k].test(target));
    if (!key || out.some((x) => x.id === `not-${key}`)) continue;
    out.push({ id: `not-${key}`, kind: "condition", label: `not ${key}`, said: negatedNext ? `not ${target}` : target });
  }
  return out;
}

/** True when the candidate's text states this concept (conditions: next to the same thing). */
function candidateHas(k: FoundConcept, text: string, words: string[]): boolean {
  if (k.id.startsWith("not-")) {
    const re = NEGATABLE[k.id.slice(4)];
    for (let i = 0; i < words.length; i++) {
      if (!re.test(words[i])) continue;
      if (/^un/.test(words[i])) return true;
      for (let j = Math.max(0, i - 3); j < i; j++) if (/^(?:not|no|non|never|without|cannot|isn't)$/.test(words[j])) return true;
    }
    // "not on the audience", "not in the audience", "not a participant"
    if (k.id === "not-invited" && /\bnot (?:on|in|part of) (?:the |an? )?(?:audience|event|invite)|\bnot (?:a )?participant/.test(text)) return true;
    return false;
  }
  const concept = CONCEPTS.find((x) => x.id === k.id)!;
  if (!concept.re.test(text)) {
    // A condition may be stated by its marker next to the object ("title is omitted").
    if (!(k.kind === "condition" && k.object)) return false;
  }
  if (k.kind !== "condition" || !k.object?.length) return concept.re.test(text);
  const marker = CONDITION_MARKERS[k.id];
  if (!marker) return concept.re.test(text);
  const obj = stem(k.object[0]);
  for (let i = 0; i < words.length; i++) {
    if (stem(words[i]) !== obj && !(obj.length > 4 && stem(words[i]).startsWith(obj))) continue;
    for (let j = Math.max(0, i - 6); j <= Math.min(words.length - 1, i + 6); j++) if (marker.test(words[j])) return true;
  }
  return false;
}

export function understand(typed: string): Understood {
  const { text, repairs } = normalizeText(typed);
  const frame = frameOf(text);
  // An action in a setup clause ("create an RFQ event and check whether …") is
  // how the case starts, not what it tests: a candidate need not contain it.
  const concepts = conceptsIn(text).map((c) => (c.kind === "action" && frame.setupVerbs.includes(c.id) && c.id !== frame.verb ? { ...c, setup: true } : c));
  return { typed, normalized: text, repairs, concepts, polarity: frame.polarity, frame };
}

// ── the case's FRAME: who does what, in which state, expecting what ─────────

export type Actor = "vendor" | "uninvited-vendor" | "buyer" | "buyer-for-vendor" | "evaluator" | "other-company" | "unknown";
export type EventState = "draft" | "open" | "closed" | "with-bid" | "awarded" | null;
export interface Frame {
  /** who performs the decisive action */
  actor: Actor;
  /** the decisive action (a CONCEPTS action id) */
  verb: string | null;
  /** actions in a setup clause — how the case starts, not what it tests */
  setupVerbs: string[];
  state: EventState;
  eventType: "rfq" | "rfp" | "auction" | null;
  polarity: Polarity;
  /** asked as a question ("check whether…", "can the vendor…?") — the outcome is not stated */
  question: boolean;
}

/** Most specific first: "vendor submits a bid" is about bidding, not submitting. */
const VERB_ORDER = [
  "surrogate", "convert", "counter", "withdraw", "extend", "clone", "version", "award", "approve", "evaluate", "bid", "upload",
  "invite", "publish", "submit", "delete", "edit", "download", "search", "login", "save", "create", "view",
];
/** "create an RFQ event and check whether …" — the part before the check is setup. */
const CHECK_SPLIT = /\b(?:and |then |, )?(?:check|verify|test|see|confirm|validate|find out|ensure)(?: \w+)? (?:whether|if|that)\b|\bthen\b/;
const QUESTION = /\?|\b(?:whether|check if|verify if|see if|find out if)\b|^(?:can|does|do|is|are|will|should|could)\b/;

function actorOf(t: string): Actor {
  if (/\bsurrogate\b|\bon (?:the |a )?(?:vendor\w* )?behalf\b|\bbuyer (?:\w+ ){0,3}(?:bid|bids|quote|quotes|price|prices|enters?|places?|submits?) (?:\w+ ){0,4}for (?:a |the |an )?(?:\w+ )?vendor\b|\bbid (?:\w+ ){0,2}for (?:a |the )?vendor\b/.test(t)) return "buyer-for-vendor";
  if (/\b(?:uninvited|not invited|not on the audience|outside the audience|not (?:a )?participant)\b/.test(t)) return "uninvited-vendor";
  if (/\banother (?:company|tenant)\b|\bother company\b|\bcross[- ]tenant\b|\bdifferent company\b|\bbuyer of (?:a |another )?(?:second|other|different) company\b/.test(t)) return "other-company";
  if (/\bevaluators? (?:can|cannot|should|must|scores?|submits?|is|tries|not)\b|\bas (?:the |an )?evaluator\b/.test(t)) return "evaluator";
  const vendorSubj = /\b(?:vendor|bidder)s? (?:\w+ ){0,2}(?:can|cannot|should|must|is|are|tries|try|bids?|submits?|opens?|places?|prices?|quotes?|sees?|views?|reads?|uploads?|responds?|answers?|accepts?|rejects?|declines?|revises?|edits?|withdraws?|not|still|able|gets?|starts?|creates?|regrets?|changes?|downloads?|asks?)\b|\bas (?:the |a |an )?(?:invited |qa )?vendor\b|\bsession: the invited vendor\b|\bvendor side\b/;
  const buyerSubj = /\b(?:buyer|owner|admin|user)s? (?:\w+ ){0,2}(?:can|cannot|should|must|is|tries|creates?|publish\w*|edits?|extends?|withdraws?|awards?|invites?|adds?|removes?|opens?|reads?|sees?|uploads?|sends?|closes?|converts?|clones?|approves?|rejects?|changes?|not|still|able)\b|\bas the buyer\b/;
  const v = t.search(vendorSubj);
  const b = t.search(buyerSubj);
  if (v >= 0 && (b < 0 || v < b)) return "vendor";
  if (b >= 0) return "buyer";
  if (/\bvendor\w*\b/.test(t) && /\bbid\w*|\bquot\w*|\btechnical response\b/.test(t)) return "vendor";
  return "unknown";
}

/** The frame of a text (typed, or a catalog case's title + setup). Pass normalized text. */
export function frameOf(normalized: string): Frame {
  const t = ` ${normalized.toLowerCase()} `;
  const m = t.match(CHECK_SPLIT);
  const setupPart = m && (m.index ?? 0) > 6 ? t.slice(0, m.index) : "";
  const core = setupPart ? t.slice((m!.index ?? 0) + m![0].length) : t;
  const actionsIn = (s: string) => CONCEPTS.filter((c) => c.kind === "action" && c.re.test(s)).map((c) => c.id);
  const coreActs = actionsIn(core);
  const setupActs = setupPart ? actionsIn(setupPart).filter((a) => !coreActs.includes(a)) : [];
  const verb = VERB_ORDER.find((v) => coreActs.includes(v)) ?? VERB_ORDER.find((v) => setupActs.includes(v)) ?? null;
  const closed = CONCEPTS.find((c) => c.id === "closed")!.re.test(t);
  const state: EventState = closed
    ? "closed"
    : /\b(?:after (?:the )?award\w*|awarded|award proposal exists)\b/.test(t) && verb !== "award"
      ? "awarded"
      : /\bdraft\b/.test(t) && !/\bdraft bid\b/.test(t)
        ? "draft"
        : /\b(?:live|published|running|open|active)\b/.test(t)
          ? "open"
          : null;
  const eventType = /\bauction\w*\b/.test(t) ? "auction" : /\brfp\w*\b|\btechnical\b/.test(t) ? "rfp" : /\brfq\w*\b|\bpricing (?:stage|round)\b/.test(t) ? "rfq" : null;
  const question = QUESTION.test(core.trim()) || QUESTION.test(t.trim());
  let polarity = polarityOf(core);
  if (polarity === "neutral") polarity = polarityOf(t);
  // "check whether a vendor can bid …" asks; it does not say what should happen.
  if (question && polarity !== "crash" && !/\b(?:should|must)(?: not)?\b|\bcannot\b|\bnot (?:be )?able\b/.test(core)) polarity = "neutral";
  return { actor: actorOf(core.trim() ? core : t), verb, setupVerbs: setupActs, state, eventType, polarity, question };
}

// ── 2 · CANDIDATES ──────────────────────────────────────────────────────────

/** Crude stemming: enough to make "refused" meet "refuses" and "publishing" meet "publish". */
function stem(w: string): string {
  return w
    .replace(/(?:ational|ations?|ings?|ments?|ness|edly|ies)$/, (s) => (s === "ies" ? "y" : ""))
    .replace(/(?:ed|es|er|s|ly)$/, "")
    .replace(/(.)\1$/, "$1");
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem)
    .filter((w) => w.length > 1);
}

interface Bm25 {
  docs: Array<{ id: string; len: number; tf: Map<string, number> }>;
  df: Map<string, number>;
  avgLen: number;
}
let bm: Bm25 | null = null;

/** A word index over every written case: title counted three times, then steps and expected. */
function bm25(): Bm25 {
  if (bm) return bm;
  const docs: Bm25["docs"] = [];
  const df = new Map<string, number>();
  for (const c of allCases()) {
    const toks = [...tokens(c.title), ...tokens(c.title), ...tokens(c.title), ...tokens(normalizeLite(c.steps)), ...tokens(normalizeLite(c.expected))];
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    docs.push({ id: c.id, len: toks.length, tf });
  }
  const avgLen = docs.reduce((n, d) => n + d.len, 0) / Math.max(1, docs.length);
  return (bm = { docs, df, avgLen });
}

/** Synonym folding only (no typo repair) — for catalog text, which is spelled right. */
function normalizeLite(raw: string): string {
  let t = ` ${raw.toLowerCase().replace(/[`*_]/g, " ")} `;
  for (const [re, to] of SYNONYMS) t = t.replace(re, to);
  return t.replace(/\s+/g, " ");
}

function bm25Search(query: string, k: number): Array<{ id: string; score: number }> {
  const idx = bm25();
  const q = [...new Set(tokens(query))];
  const N = idx.docs.length;
  const k1 = 1.2;
  const b = 0.75;
  const scored: Array<{ id: string; score: number }> = [];
  for (const d of idx.docs) {
    let s = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      const n = idx.df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / idx.avgLen)));
    }
    if (s > 0) scored.push({ id: d.id, score: s });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}

/** The literal-overlap half of the memory's hybrid score (same rule as knowledgeBase.ts). */
function lexicalOverlap(queryTerms: string[], hay: string): number {
  if (!queryTerms.length) return 0;
  const h = hay.toLowerCase();
  let hits = 0;
  for (const t of queryTerms) {
    if (!h.includes(t)) continue;
    hits += /[_:.]|\d/.test(t) || t.length > 8 ? 1.5 : 1;
  }
  return Math.min(1, hits / queryTerms.length);
}
const memTerms = (text: string) =>
  [...new Set(text.toLowerCase().split(/[^a-z0-9_.:-]+/).filter((t) => t.length > 2 && !STOP.has(t)))];

/** A case the assistant wrote earlier and stored as a draft. */
export interface DraftLike {
  id: string;
  title: string;
  steps: string;
  expected: string;
  status: string;
  dense?: number;
}

/** Drafts are looked up through a hook so this module does not own their storage. */
type DraftSearch = (vec: number[] | null, embedder: string, text: string) => Promise<DraftLike[]>;
let draftSearch: DraftSearch | null = null;
export function registerDraftSearch(fn: DraftSearch): void {
  draftSearch = fn;
}

interface MemoryHit {
  id: string;
  score: number;
}

/** Memory candidates: one embedding call, then the same hybrid score `retrieve` uses. */
async function memoryCandidates(query: string, limit: number): Promise<{ hits: MemoryHit[]; vec: number[] | null; embedder: string; via: string }> {
  const db = await spineDb();
  if (db) {
    try {
      const built = (await db.query(`SELECT embedder FROM memory_builds ORDER BY id DESC LIMIT 1`)).rows[0]?.embedder as string | undefined;
      if (built) {
        await ensureEmbedderReady();
        // Embedded by the store's own embedder, whatever the process is using (embedder.ts embedFor).
        const vec = await embedFor(built, query);
        const terms = memTerms(query);
        const rows = await pgCandidates(db, built, vec, terms, { kinds: ["test-case"] }, limit);
        const hits: MemoryHit[] = [];
        for (const r of rows) {
          const id = String(r.labels?.[0] ?? "");
          if (!caseById(id)) continue; // mined knowledge chunks are not catalog cases
          const lex = lexicalOverlap(terms, `${r.text} ${(r.labels ?? []).join(" ")} ${r.source}`);
          hits.push({ id, score: vec ? r.dense * 0.75 + lex * 0.25 : lex });
        }
        return { hits, vec, embedder: built, via: vec ? "postgres (meaning + words)" : "postgres (words only — embedder changed since the last build)" };
      }
    } catch (e) {
      console.warn(`[matcher] memory lookup failed, using the file store: ${(e as Error).message}`);
    }
  }
  try {
    const r = await retrieve(query, Math.min(limit, 40), { kinds: ["test-case"] });
    return {
      hits: r.map((x) => ({ id: String(x.labels?.[0] ?? ""), score: x.score })).filter((h) => caseById(h.id)),
      vec: null,
      embedder: embedderId(),
      via: "file store",
    };
  } catch {
    return { hits: [], vec: null, embedder: embedderId(), via: "no memory (words only)" };
  }
}

// ── 3 · DECIDE ──────────────────────────────────────────────────────────────

export type Relation = "same" | "partial" | "unrelated";

/** Everything the decision is computed from — kept so the eval can re-decide without calls. */
export interface MatchFeatures {
  memoryRaw: number;
  words: number;
  concepts: number;
  /** the case expects the opposite outcome (refused vs succeeds) */
  clash: boolean;
  /** the case is done by a different actor (the vendor vs the buyer on the vendor's behalf …) */
  actorClash: boolean;
  /** distinguishing things the case's TITLE is about that the typed text never mentions */
  extras: number;
  /** the case's title is not about the typed decisive action */
  verbMiss?: boolean;
  /** share of the typed words (rare ones counting most) that the TITLE contains */
  title?: number;
}

export interface MatchCandidate {
  id: string;
  title: string;
  layer: string;
  section: string;
  /** "catalog" — a written case; "draft" — one the assistant wrote earlier */
  origin: "catalog" | "draft";
  relation: Relation;
  /** the deterministic answer, before any model confirmation */
  ruleRelation: Relation;
  scores: { memoryRaw: number; memory: number; words: number; concepts: number; final: number };
  features: MatchFeatures;
  /** the case expects the opposite outcome (refused vs succeeds) */
  clash: boolean;
  covered: string[];
  /** what the typed case asks for that this case does not cover, in words */
  missing: string[];
  /** one plain-English line: why this relation (ids allowed — for Details) */
  why: string;
  /** plain English, no ids: what makes it a match */
  matchWhy: string;
  /** plain English, no ids: what is different ("" when nothing) */
  differs: string;
  /** a draft's review status */
  status?: string;
  llm?: { relation: Relation; missing?: string; note?: string };
}

/** One of the closest existing cases, for the reader. */
export interface Closest {
  id: string;
  title: string;
  layer: string;
  relation: Relation;
  /** 0..1, for the score bar */
  score: number;
  /** "Same action (bidding), same condition (after the bidding window is over), same actor (a vendor)." */
  why: string;
  /** "It is the buyer bidding on a vendor's behalf, not the vendor." — "" when nothing differs */
  differs: string;
  best: boolean;
}

export interface MatchResult {
  typed: string;
  understood: Understood;
  /** existing = at least one catalog case is SAME · partial = only PARTIAL · new = neither. Drafts never count. */
  decision: "existing" | "partial" | "new";
  same: MatchCandidate[];
  partial: MatchCandidate[];
  /** top candidates in rank order, whatever their relation (catalog and drafts) */
  candidates: MatchCandidate[];
  /** the 3–5 closest CATALOG cases, best first — shown even when the decision is "new" */
  closest: Closest[];
  /** a draft the assistant wrote earlier that already says this — review it instead of writing another */
  nearDraft?: { id: string; title: string; status: string; relation: Relation; score: number; why: string; differs: string };
  /** plain English, for the chat reply */
  headline: string;
  memory: string;
  llm: { used: boolean; model?: string; promptTokens?: number; completionTokens?: number; error?: string };
  ms: number;
}

/**
 * The tuned constants (2026-10-04: picked on the DEV half of data/evals/matcher-hard.json
 * (and the DEV half of prompts/matching.jsonl) among hand-picked candidates —
 * the full grid over-fitted DEV). Changed only through the evals (scripts/eval-matcher.ts on
 * prompts/matching.jsonl, scripts/eval-matcher-hard.ts on data/evals/matcher-hard.json),
 * tuned on the DEV split only; the TEST split is the reported number.
 */
export const THRESHOLDS: {
  memLow: number; memHigh: number; wMemory: number; wWords: number; wConcepts: number;
  sameFinal: number; sameConcepts: number; sameMargin: number; partialFinal: number; partialConcepts: number;
  pActor: number; pExtra: number; pClash: number; pVerb: number; wTitle: number;
} = {
  /** memory hybrid score mapped to 0..1 across this band */
  memLow: 0.4,
  memHigh: 0.72,
  /** weights of the three signals in the final score */
  wMemory: 0.4,
  wWords: 0.3,
  wConcepts: 0.3,
  /** SAME needs every one of these */
  sameFinal: 0.55,
  sameConcepts: 0.7,
  /** and must be within this of the best candidate */
  sameMargin: 0.05,
  /** PARTIAL needs these */
  partialFinal: 0.5,
  partialConcepts: 0.3,
  /** penalties: a different actor, each distinguishing extra (max 3), the opposite outcome */
  pActor: 0.12,
  pExtra: 0.08,
  pClash: 0.08,
  /** the case's title is not about the typed decisive action */
  pVerb: 0.08,
  /** bonus weight for typed words found in the case's TITLE */
  wTitle: 0,
};
export type Thresholds = typeof THRESHOLDS;

const CONCEPT_WEIGHT: Record<ConceptKind, number> = { action: 1, thing: 0.7, condition: 1.2 };
/** a concept only in the case's body (not its title or setup) counts this much */
const BODY_ONLY = 0.6;
/** actions that name the same decisive step in a title */
const VERB_EQUIV: Record<string, string[]> = {
  bid: ["bid", "submit", "surrogate"],
  submit: ["submit", "bid", "publish", "approve", "evaluate"],
  view: ["view", "search", "download"],
  create: ["create", "draft", "save"],
  save: ["save", "create", "draft"],
  edit: ["edit", "extend", "version"],
  invite: ["invite", "delete"],
  award: ["award", "approve"],
  approve: ["approve", "award"],
};

/**
 * Concepts that make a case a DIFFERENT case when its title names them and the
 * typed text does not: "a surrogate bid after close" is not "a bid after close".
 */
const DISTINGUISHING = new Set([
  "surrogate", "auction", "dutch", "knockout", "rfp", "counter", "extend", "withdraw", "clone", "convert", "approve", "evaluate", "award",
  "boq", "version", "upload", "closed", "missing", "negative", "zero", "twice", "invalid", "nonexistent", "limit", "special", "long", "past",
  "othercompany", "masking", "currency", "gst", "discount", "freight",
]);

/** What a case says, for concept matching. The section heading counts: "A missing
 *  status is refused" says nothing about creating a draft — its section does. */
function caseText(c: { title: string; steps: string; expected: string; setup?: string; section?: string }): string {
  return normalizeLite(`${c.section ?? ""} . ${c.title} . ${c.setup ?? ""} . ${c.steps} . ${c.expected}`);
}

/** How much of the typed wording the case contains, rare words counting most (IDF). */
function wordCoverage(typedTokens: string[], c: { title: string; steps: string; expected: string; section?: string }): number {
  if (!typedTokens.length) return 0;
  const idx = bm25();
  const N = idx.docs.length;
  const title = new Set(tokens(normalizeLite(c.title)));
  const body = new Set(tokens(normalizeLite(`${c.section ?? ""} ${c.steps} ${c.expected}`)));
  let got = 0;
  let total = 0;
  for (const t of typedTokens) {
    const idf = Math.log(1 + N / (1 + (idx.df.get(t) ?? 0)));
    total += idf;
    if (title.has(t)) got += idf;
    else if (body.has(t)) got += 0.75 * idf;
  }
  return total ? got / total : 0;
}

const ACTOR_WORDS: Record<Actor, string> = {
  vendor: "a vendor",
  "uninvited-vendor": "a vendor who is not invited",
  buyer: "the buyer",
  "buyer-for-vendor": "the buyer bidding on a vendor's behalf",
  evaluator: "an evaluator",
  "other-company": "a user of another company",
  unknown: "someone",
};
/** Actor pairs that make two cases different tests. */
function actorsClash(a: Actor, b: Actor): boolean {
  if (a === "unknown" || b === "unknown" || a === b) return false;
  const pair = new Set([a, b]);
  if (pair.has("evaluator") && pair.has("buyer")) return false; // an evaluator is a buyer user
  return true;
}
const OUTCOME_WORDS: Record<Polarity, string> = { refuse: "a refusal", success: "success", crash: "no server error", neutral: "" };

/** The case's frame: its title and setup say who acts; title + expected say the outcome. */
const candFrameCache = new Map<string, { actor: Actor; pol: Polarity; titleConcepts: Set<string> }>();
function candidateFrame(c: { id: string; title: string; setup?: string; expected: string }) {
  let f = candFrameCache.get(c.id);
  if (f) return f;
  const head = normalizeLite(`${c.title}. ${(c.setup ?? "").slice(0, 220)}`).trim();
  const titleNorm = normalizeLite(c.title).trim();
  const titleActor = frameOf(titleNorm).actor;
  f = {
    actor: titleActor !== "unknown" ? titleActor : frameOf(head).actor,
    pol: polarityOf(normalizeLite(`${c.title} ${c.expected}`)),
    titleConcepts: new Set(conceptsIn(titleNorm).map((x) => x.id)),
  };
  if (!c.id.startsWith("GEN-")) candFrameCache.set(c.id, f);
  return f;
}

function judge(
  u: Understood,
  c: { id: string; title: string; steps: string; expected: string; setup?: string; section?: string },
  memScore: number,
) {
  const text = caseText(c);
  const words = text.split(/[^a-z0-9-]+/).filter(Boolean);
  let have = 0;
  let total = 0;
  const covered: string[] = [];
  const coveredLabels: string[] = [];
  const missing: string[] = [];
  // A concept the case's TITLE (or setup) states counts in full; one only somewhere in
  // its long steps or notes counts for less — deep-dig cases mention everything.
  const headText = normalizeLite(`${c.title} . ${(c.setup ?? "").slice(0, 240)}`);
  const headWords = headText.split(/[^a-z0-9-]+/).filter(Boolean);
  for (const k of u.concepts) {
    if (k.setup) continue; // how the case starts, not what it tests
    const w = CONCEPT_WEIGHT[k.kind];
    total += w;
    if (candidateHas(k, headText, headWords) || candidateHas(k, text, words)) {
      have += candidateHas(k, headText, headWords) ? w : w * BODY_ONLY;
      covered.push(k.said);
      coveredLabels.push(k.kind === "condition" ? k.label : k.label);
    } else {
      missing.push(k.kind === "condition" ? `“${k.said}”` : k.label);
    }
  }
  const typedToks = [...new Set(tokens(u.normalized))];
  const wordScore = wordCoverage(typedToks, c);
  const titleScore = wordCoverage(typedToks, { title: c.title, steps: "", expected: "", section: "" });
  const conceptScore = total ? have / total : wordScore;
  // Outcome: a case expecting a refusal is not the same test as one expecting success.
  const head = normalizeLite(`${c.title} ${c.expected}`);
  const cf = candidateFrame(c);
  const candPol = cf.pol;
  const polarityClash =
    (u.polarity === "refuse" && candPol === "success" && !REFUSE.test(head)) ||
    (u.polarity === "success" && (candPol === "refuse" || candPol === "crash") && !SUCCESS.test(head));
  if (polarityClash) missing.push(u.polarity === "refuse" ? "that it should be refused" : "that it should succeed");
  const actorClash = actorsClash(u.frame.actor, cf.actor);
  const typedIds = new Set(u.concepts.map((x) => x.id));
  const extraIds = [...cf.titleConcepts].filter((id) => DISTINGUISHING.has(id) && !typedIds.has(id) && !(id === "rfp" && typedIds.has("evaluate")));
  // The decisive action must be what the case's title is about ("a vendor bids late" is not "an award stops bidding").
  const verbIds = u.frame.verb ? VERB_EQUIV[u.frame.verb] ?? [u.frame.verb] : [];
  const titleOnly = normalizeLite(c.title);
  const verbMiss = verbIds.length > 0 && !verbIds.some((id) => CONCEPTS.find((x) => x.id === id)?.re.test(titleOnly));
  const features: MatchFeatures = { memoryRaw: memScore, words: wordScore, concepts: conceptScore, clash: polarityClash, actorClash, extras: extraIds.length, verbMiss, title: titleScore };
  const final = finalFrom(features);
  const T = THRESHOLDS;
  const mem = Math.max(0, Math.min(1, (memScore - T.memLow) / (T.memHigh - T.memLow)));

  // Plain English for the reader — no ids, no field names.
  const whyParts: string[] = [];
  const verb = u.frame.verb ? CONCEPTS.find((x) => x.id === u.frame.verb) : undefined;
  if (verb && !verbMiss) whyParts.push(`same action (${verb.label})`);
  const conds = u.concepts.filter((k) => k.kind === "condition" && candidateHas(k, text, words));
  if (conds.length) whyParts.push(`same condition (${conds.map((k) => k.label).join(", ")})`);
  if (!actorClash && u.frame.actor !== "unknown" && cf.actor === u.frame.actor) whyParts.push(`same actor (${ACTOR_WORDS[cf.actor]})`);
  if (!polarityClash && u.polarity !== "neutral" && candPol === u.polarity) whyParts.push(`expects ${OUTCOME_WORDS[candPol]}`);
  else if (u.frame.question && candPol !== "neutral") whyParts.push(`answers your question: it expects ${OUTCOME_WORDS[candPol]}`);
  const things = u.concepts.filter((k) => k.kind === "thing" && !["vendor"].includes(k.id) && candidateHas(k, text, words)).map((k) => k.label);
  if (!whyParts.length && things.length) whyParts.push(`about ${things.slice(0, 3).join(", ")}`);
  const matchWhy = whyParts.length ? `${whyParts.join(", ").replace(/^./, (x) => x.toUpperCase())}.` : wordScore > 0.4 ? "Shares most of your wording." : "Only loosely related.";
  const diffParts: string[] = [];
  if (actorClash) diffParts.push(`it is ${ACTOR_WORDS[cf.actor]}, not ${ACTOR_WORDS[u.frame.actor]}`);
  if (verbMiss && verb) {
    const theirs = frameOf(titleOnly).verb;
    const tl = theirs ? CONCEPTS.find((x) => x.id === theirs)?.label : undefined;
    diffParts.push(tl ? `its main step is ${tl}, not ${verb.label}` : `its title is not about ${verb.label}`);
  }
  if (polarityClash) diffParts.push(`it expects the opposite outcome (${OUTCOME_WORDS[candPol]})`);
  const missWords = u.concepts.filter((k) => !k.setup && !candidateHas(k, text, words) && k.id !== "vendor").map((k) => (k.kind === "condition" ? k.label : k.label));
  if (missWords.length) diffParts.push(`it does not cover ${missWords.slice(0, 3).join(", ")}`);
  if (extraIds.length) diffParts.push(`it is also about ${extraIds.slice(0, 3).map((id) => CONCEPTS.find((x) => x.id === id)?.label ?? id).join(", ")}`);
  const differs = diffParts.length ? `${diffParts.join("; ").replace(/^./, (x) => x.toUpperCase())}.` : "";
  return { conceptScore, wordScore, covered, missing, polarityClash, actorClash, extras: extraIds, features, mem, memRaw: memScore, final, matchWhy, differs };
}

/** The final score from the signals — exported so the evals can re-tune it. */
export function finalScore(memRaw: number, words: number, concepts: number, T: Thresholds = THRESHOLDS, pen: { clash?: boolean; actorClash?: boolean; extras?: number; verbMiss?: boolean; title?: number } = {}): number {
  const mem = Math.max(0, Math.min(1, (memRaw - T.memLow) / (T.memHigh - T.memLow)));
  return (
    T.wMemory * mem + T.wWords * words + T.wConcepts * concepts + T.wTitle * (pen.title ?? 0) -
    (pen.actorClash ? T.pActor : 0) - (pen.clash ? T.pClash : 0) - T.pExtra * Math.min(3, pen.extras ?? 0) - (pen.verbMiss ? T.pVerb : 0)
  );
}
function finalFrom(f: MatchFeatures, T: Thresholds = THRESHOLDS): number {
  return finalScore(f.memoryRaw, f.words, f.concepts, T, f);
}

/** The deterministic relation for one candidate, given the best final score in its list. */
export function decideRelation(x: { final: number; concepts: number; clash: boolean; actorClash?: boolean }, best: number, T: Thresholds = THRESHOLDS): Relation {
  if (!x.clash && !x.actorClash && x.final >= T.sameFinal && x.concepts >= T.sameConcepts && x.final >= best - T.sameMargin) return "same";
  if (x.final >= T.partialFinal && x.concepts >= T.partialConcepts) return "partial";
  return "unrelated";
}

/**
 * Re-decide a cached candidate list under thresholds T (the hard eval's --tune).
 * Catalog candidates decide; drafts never count as coverage.
 */
export function rescore(cands: Array<{ id: string; origin: string; relation: string; f: Record<string, number | boolean> }>, T: Thresholds) {
  const withFinal = cands.map((c) => {
    const f = c.f as unknown as MatchFeatures;
    return { ...c, final: finalFrom({ memoryRaw: Number(f.memoryRaw), words: Number(f.words), concepts: Number(f.concepts), clash: !!f.clash, actorClash: !!f.actorClash, extras: Number(f.extras ?? 0), verbMiss: !!f.verbMiss, title: Number(f.title ?? 0) }, T) };
  });
  const best = Math.max(0, ...withFinal.filter((c) => c.origin !== "draft").map((c) => c.final));
  const out = withFinal.map((c) => ({ ...c, rel: decideRelation({ final: c.final, concepts: Number(c.f.concepts), clash: !!c.f.clash, actorClash: !!c.f.actorClash }, best, T) }));
  const cat = out.filter((c) => c.origin !== "draft");
  const decision = cat.some((c) => c.rel === "same") ? "existing" : cat.some((c) => c.rel === "partial") ? "partial" : "new";
  return { cands: out, decision };
}

/** The grid the hard eval searches (on DEV only). */
export function TUNE_GRID(): Thresholds[] {
  const out: Thresholds[] = [];
  for (const wMemory of [0.3, 0.4, 0.5])
    for (const wWords of [0.1, 0.2, 0.3])
      for (const wTitle of [0, 0.1, 0.2])
        for (const sameFinal of [0.5, 0.55, 0.6, 0.65, 0.7])
          for (const sameConcepts of [0.7, 0.8])
            for (const sameMargin of [0.03, 0.06, 0.1])
              for (const partialFinal of [0.42, 0.5])
                for (const pActor of [0, 0.1])
                  for (const pExtra of [0.04, 0.08, 0.14])
                    for (const pVerb of [0, 0.06, 0.12]) {
                      const wConcepts = +(1 - wMemory - wWords).toFixed(2);
                      if (wConcepts <= 0) continue;
                      out.push({ ...THRESHOLDS, wMemory, wWords, wConcepts, wTitle, sameFinal, sameConcepts, sameMargin, partialFinal, pActor, pExtra, pVerb });
                    }
  return out;
}

function ruleRelation(j: ReturnType<typeof judge>, best: number): Relation {
  return decideRelation({ final: j.final, concepts: j.conceptScore, clash: j.polarityClash, actorClash: j.actorClash }, best);
}

function whyLine(rel: Relation, cand: { id: string; title: string }, covered: string[], missing: string[]): string {
  if (rel === "same") return `${cand.id} already checks this${covered.length ? ` (${covered.slice(0, 4).join(", ")})` : ""}.`;
  if (rel === "partial")
    return `${cand.id} covers part of it${covered.length ? ` (${covered.slice(0, 3).join(", ")})` : ""}, but not ${missing.slice(0, 3).join(", ") || "all of what you typed"}.`;
  return `${cand.id} is about something else.`;
}

// ── 4 · CONFIRM (optional, fast tier) ──────────────────────────────────────

const RANK: Record<Relation, number> = { unrelated: 0, partial: 1, same: 2 };

async function confirmWithModel(
  typed: string,
  cands: MatchCandidate[],
  full: Map<string, { steps: string; expected: string }>,
): Promise<{ answers: Map<string, { relation: Relation; missing?: string }>; error?: string }> {
  const answers = new Map<string, { relation: Relation; missing?: string }>();
  if (llmMode() === "fallback" && !process.env.GOOGLE_API_KEY) return { answers, error: "no model key" };
  const list = cands
    .map((c, i) => {
      const f = full.get(c.id);
      return `${i + 1}. id=${c.id}\n   title: ${c.title}\n   steps: ${(f?.steps ?? "").slice(0, 260)}\n   expected: ${(f?.expected ?? "").slice(0, 200)}`;
    })
    .join("\n");
  const prompt =
    `A QA engineer typed this test case (it may be informal, misspelt or partly Hindi):\n"""${typed.slice(0, 600)}"""\n\n` +
    `Existing test cases:\n${list}\n\n` +
    `For EACH existing case decide:\n` +
    `- "same": running it would test what was typed (same action, same condition, same expected outcome; wording may differ; the typed text may be shorter).\n` +
    `- "partial": it tests part of what was typed but misses a condition, step or expected outcome the typed text asks for.\n` +
    `- "unrelated": different behaviour.\n` +
    `Reply with ONLY a JSON array: [{"id":"<id>","relation":"same|partial|unrelated","missing":"<for partial: what the typed case asks that this one does not, in a few words>"}]`;
  try {
    const raw = await chat(
      [
        { role: "system", content: "You compare software test cases. Reply with JSON only, no prose." },
        { role: "user", content: prompt },
      ],
      // The fast model on the gateway accepts only its default temperature (1);
      // anything else is refused with a 400 and the call falls through to Groq.
      { tier: "fast", temperature: 1, maxTokens: 500 },
    );
    const s = raw.indexOf("[");
    const e = raw.lastIndexOf("]");
    if (s < 0 || e <= s) return { answers, error: "the model did not return a JSON list" };
    const parsed = JSON.parse(raw.slice(s, e + 1));
    if (!Array.isArray(parsed)) return { answers, error: "the model's answer was not a list" };
    const allowed = new Set(cands.map((c) => c.id));
    for (const x of parsed) {
      const id = String(x?.id ?? "").trim();
      const rel = String(x?.relation ?? "").trim().toLowerCase();
      if (!allowed.has(id) || !(rel in RANK)) continue; // invented ids and bad enums are dropped
      answers.set(id, { relation: rel as Relation, missing: typeof x.missing === "string" ? x.missing.slice(0, 160) : undefined });
    }
    return { answers };
  } catch (err) {
    return { answers, error: (err as Error).message.slice(0, 160) };
  }
}

/**
 * Combine the rule and the model. The model moves an answer one step at most;
 * when the two are two steps apart (same vs unrelated) the answer is PARTIAL
 * — the honest word for "the checks disagree" — and it never lifts a candidate
 * whose numbers are below the partial floor.
 */
function combine(c: MatchCandidate, llm: { relation: Relation; missing?: string } | undefined): Relation {
  if (!llm) return c.ruleRelation;
  const r = RANK[c.ruleRelation];
  const l = RANK[llm.relation];
  if (r === l) return c.ruleRelation;
  if (Math.abs(r - l) === 2) return "partial";
  if (l > r && c.scores.final < THRESHOLDS.partialFinal) return c.ruleRelation;
  return llm.relation;
}

// ── the public entry point ─────────────────────────────────────────────────

export interface MatchOptions {
  /** ask the fast model to confirm the top candidates (default true) */
  llm?: boolean;
  /** how many candidates to return (default 8) */
  top?: number;
}

/** How the catalog itself words each concept — added to the word search only. */
const EXPAND: Record<string, string> = {
  closed: "window closes closed deadline bid end",
  surrogate: "surrogate behalf",
  missing: "without missing empty",
  twice: "duplicate twice already",
  limit: "limit exceeds maximum",
  negative: "negative",
  invalid: "invalid",
  nonexistent: "nonexistent unknown",
  "not-invited": "uninvited invited audience",
  counter: "counter offer",
  convert: "convert auction",
  extend: "extend extension bid end",
  withdraw: "withdraw",
  masking: "masked masking",
  othercompany: "another company tenant",
};

const NAMED_ID = /\b(?:(?:UI|API|PRD)-[A-Z]+(?:-[A-Z]+)?-\d{2,4}|EVI-[A-Z]+-\d{2,4}|GEN-[A-Z]+-\d{3})\b/gi;

export async function matchTestCase(typed: string, opts: MatchOptions = {}): Promise<MatchResult> {
  const started = Date.now();
  const u = understand(typed);
  const top = opts.top ?? 8;
  const query = u.normalized || typed;

  // The word index also gets the catalog's own words for each concept read out of
  // the text ("submission time is over" → window, closes, deadline …).
  const expanded = `${query} ${u.concepts.filter((k) => !k.setup).map((k) => EXPAND[k.id] ?? "").join(" ")}`.trim();
  const [mem, words] = await Promise.all([memoryCandidates(query, 60), Promise.resolve(bm25Search(expanded, 50))]);
  const memById = new Map<string, number>();
  for (const h of mem.hits) memById.set(h.id, Math.max(memById.get(h.id) ?? 0, h.score));
  const bestWords = words[0]?.score ?? 1;
  const wordsById = new Map(words.map((w) => [w.id, w.score / bestWords]));

  // Every candidate either source found. A case only the word index found has
  // no memory score of its own; it gets the lowest memory score seen, rather
  // than zero, so a good word match is not buried for lack of an embedding.
  const memFloor = mem.hits.length ? Math.min(...mem.hits.map((h) => h.score)) : 0;
  const ids = [...new Set([...memById.keys(), ...wordsById.keys()])];
  const full = new Map<string, { steps: string; expected: string }>();
  type Scored = { c: CatalogCase; j: ReturnType<typeof judge>; origin: "catalog" | "draft"; status?: string };
  const scored: Scored[] = ids
    .map((id) => caseById(id) as CatalogCase)
    .filter((c) => !!c)
    .map((c) => {
      full.set(c.id, { steps: c.steps, expected: c.expected });
      return { c, j: judge(u, c, memById.get(c.id) ?? memFloor), origin: "catalog" as const };
    });

  // Drafts the assistant wrote earlier. They NEVER count as coverage (a person
  // has not reviewed them); a close one is pointed at instead of writing another.
  // An approved draft is a catalog case (GEN-… in api-assistant-approved.md) and
  // is found above.
  const drafts = draftSearch ? await draftSearch(mem.vec, mem.embedder, query).catch(() => []) : [];
  for (const d of drafts) {
    if (d.status === "approved" || caseById(d.id)) continue;
    const memScore = d.dense !== undefined ? d.dense * 0.75 + lexicalOverlap(memTerms(query), `${d.title} ${d.steps} ${d.expected}`) * 0.25 : memFloor;
    full.set(d.id, { steps: d.steps, expected: d.expected });
    scored.push({
      c: { id: d.id, title: d.title, steps: d.steps, expected: d.expected, setup: "", layer: "draft", section: `Draft (${d.status})`, refs: [] } as unknown as CatalogCase,
      j: judge(u, d, memScore),
      origin: "draft",
      status: d.status,
    });
  }

  // A case named by its id ("run UI-CRE-017") is that case, whatever the words say.
  const named = new Set((typed.match(NAMED_ID) ?? []).map((x) => x.toUpperCase()));
  for (const id of named) {
    const c = caseById(id);
    if (!c) continue;
    const at = scored.findIndex((x) => x.c.id === id);
    const base = at >= 0 ? scored[at].j : judge(u, c, 1);
    const j = { ...base, conceptScore: 1, wordScore: 1, covered: ["named by id"], missing: [] as string[], polarityClash: false, actorClash: false, mem: 1, memRaw: 1, final: 1, matchWhy: "You named this case.", differs: "" };
    j.features = { ...j.features, memoryRaw: 1, words: 1, concepts: 1, clash: false, actorClash: false, extras: 0, verbMiss: false };
    if (at >= 0) scored[at].j = j;
    else scored.push({ c, j, origin: "catalog" });
  }

  scored.sort((a, b) => b.j.final - a.j.final);
  // The best CATALOG score anchors SAME's margin: a draft never pushes a catalog case out.
  const best = scored.find((x) => x.origin === "catalog")?.j.final ?? 0;
  const toCand = ({ c, j, origin, status }: Scored): MatchCandidate => {
    const rel = origin === "draft" ? decideRelation({ final: j.final, concepts: j.conceptScore, clash: j.polarityClash, actorClash: j.actorClash }, j.final) : ruleRelation(j, best);
    return {
      id: c.id,
      title: c.title,
      layer: c.layer,
      section: c.section,
      origin,
      relation: rel,
      ruleRelation: rel,
      scores: { memoryRaw: +j.memRaw.toFixed(4), memory: +j.mem.toFixed(3), words: +j.wordScore.toFixed(3), concepts: +j.conceptScore.toFixed(3), final: +j.final.toFixed(3) },
      features: { ...j.features, memoryRaw: +j.features.memoryRaw.toFixed(4), words: +j.features.words.toFixed(3), concepts: +j.features.concepts.toFixed(3) },
      clash: j.polarityClash,
      covered: j.covered,
      missing: j.missing,
      why: whyLine(rel, c, j.covered, j.missing),
      matchWhy: j.matchWhy,
      differs: j.differs,
      ...(status ? { status } : {}),
    };
  };
  const catalogCands = scored.filter((x) => x.origin === "catalog").slice(0, Math.max(top, 12)).map(toCand);
  const draftCands = scored.filter((x) => x.origin === "draft").slice(0, 4).map(toCand);

  // Model confirmation of the top five catalog candidates only.
  const llmInfo: MatchResult["llm"] = { used: false };
  if (opts.llm !== false && catalogCands.length) {
    const before = usageReport();
    const head = catalogCands.slice(0, 5);
    const { answers, error } = await confirmWithModel(typed, head, full);
    const after = usageReport();
    const delta = (k: "promptTokens" | "completionTokens") =>
      Object.values(after.byModel).reduce((n, t) => n + t[k], 0) - Object.values(before.byModel).reduce((n, t) => n + t[k], 0);
    llmInfo.used = answers.size > 0;
    llmInfo.error = error;
    llmInfo.model = Object.keys(after.byModel).find((m) => (after.byModel[m]?.calls ?? 0) > (before.byModel[m]?.calls ?? 0)) ?? (answers.size ? "groq/gemini (fallback)" : undefined);
    llmInfo.promptTokens = delta("promptTokens");
    llmInfo.completionTokens = delta("completionTokens");
    for (const c of head) {
      const a = answers.get(c.id);
      if (!a) continue;
      c.llm = { relation: a.relation, missing: a.missing };
      // A different actor or the opposite outcome is a fact of the words, not a judgement: the model cannot lift it to SAME.
      c.relation = (c.features.actorClash || c.clash) && combine(c, a) === "same" ? "partial" : combine(c, a);
      if (c.relation !== c.ruleRelation) c.llm.note = `the rule said ${c.ruleRelation}, the model said ${a.relation}`;
      if (c.relation === "partial" && a.missing && !c.missing.includes(a.missing)) c.missing = [a.missing, ...c.missing];
      c.why = whyLine(c.relation, c, c.covered, c.missing);
    }
  }

  // Order: SAME first, then PARTIAL, then the rest, each by score.
  catalogCands.sort((a, b) => RANK[b.relation] - RANK[a.relation] || b.scores.final - a.scores.final);
  const same = catalogCands.filter((c) => c.relation === "same").slice(0, top);
  const partial = catalogCands.filter((c) => c.relation === "partial").slice(0, top);
  const decision: MatchResult["decision"] = same.length ? "existing" : partial.length ? "partial" : "new";

  // The closest existing cases, always — even when the answer is "new".
  const closest: Closest[] = catalogCands.slice(0, 5).map((c, i) => ({
    id: c.id,
    title: c.title,
    layer: c.layer,
    relation: c.relation,
    score: +Math.max(0, Math.min(1, c.scores.final)).toFixed(3),
    why: c.matchWhy,
    differs: c.relation === "same" && !c.differs ? "" : c.differs || (c.relation === "same" ? "" : "It is about something close, but not the same test."),
    best: i === 0,
  }));

  // A draft that already says this: point at it instead of writing another.
  const dBest = draftCands.find((d) => d.relation === "same" && d.scores.final >= (catalogCands[0]?.scores.final ?? 0) - 0.15);
  const nearDraft = dBest
    ? { id: dBest.id, title: dBest.title, status: dBest.status ?? "draft", relation: dBest.relation, score: dBest.scores.final, why: dBest.matchWhy, differs: dBest.differs }
    : undefined;

  const t = (c: MatchCandidate) => `“${c.title}”`;
  const headline =
    decision === "existing"
      ? `This is already covered: ${same.slice(0, 3).map(t).join("; ")}${same.length > 3 ? ` and ${same.length - 3} more` : ""}.`
      : decision === "partial"
        ? `Nothing covers this exactly. The closest ${partial.length > 1 ? "cases cover" : "case covers"} part of it — ${t(partial[0])}${partial[0].differs ? ` (${partial[0].differs.replace(/\.$/, "").replace(/^./, (x) => x.toLowerCase())})` : ""}.`
        : `This is new — no existing test case covers it.${closest[0] ? ` The closest is ${t(catalogCands[0])}.` : ""}`;
  const candidates = [...catalogCands, ...draftCands].sort((a, b) => RANK[b.relation] - RANK[a.relation] || b.scores.final - a.scores.final).slice(0, Math.max(top, 8));
  return { typed, understood: u, decision, same, partial, candidates, closest, ...(nearDraft ? { nearDraft } : {}), headline, memory: mem.via, llm: llmInfo, ms: Date.now() - started };
}
