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
import { embedOne, embedderId, ensureEmbedderReady } from "../rag/embedder.js";
import { retrieve } from "../rag/knowledgeBase.js";
import { chat, llmMode, usageReport } from "../ai/llm.js";

// ── 1 · UNDERSTAND ──────────────────────────────────────────────────────────

/** Hinglish function words and verbs → English. Applied before anything else. */
const HINGLISH: Array<[RegExp, string]> = [
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
  [/\b(?:sakta|sakte|sakti|paye|paaye|paega)\b/g, " can "],
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
  { id: "submit", kind: "action", label: "submitting", re: /\bsubmi\w*/ },
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
  { id: "closed", kind: "condition", label: "after the window closed", re: /\bafter (?:the )?(?:window|event|bid\w*|deadline)? ?(?:clos\w*|end\w*|expir\w*)|\bclosed\b|\bexpired\b/ },
  { id: "special", kind: "condition", label: "special characters / script input", re: /\bemoji\w*|\bspecial char\w*|\bscript\w*|\bhtml\b|\bxss\b|\binjection\b|\bunicode\b/ },
  { id: "long", kind: "condition", label: "a very long value", re: /\bvery long\b|\btoo long\b|\blong (?:title|name|text|string)\b|\bcharacters?\b/ },
  { id: "past", kind: "condition", label: "a date in the past / wrong order", re: /\bpast\b|\bbefore (?:the )?start\b|\bend before\b|\bearlier than\b/ },
];

const REFUSE = /\brefus\w*|\breject\w*|\bblock\w*|\berror\w*|\bfail\w*|\bnot allowed\b|\bcannot\b|\bshould not\b|\bmust not\b|\bdenied\b|\bprevent\w*|\bdisallow\w*|\bstops?\b|\bforbid\w*|\bnot (?:be )?(?:possible|permitted)\b|\b4\d\d\b|\bvalidation\b/;
const CRASH = /\b5\d\d\b|\bcrash\w*|\bserver error\b/;
const SUCCESS = /\bsucceed\w*|\bsuccess\w*|\bworks?\b|\baccept\w*|\bcreated\b|\bpublishes\b|\bsaved\b|\bis shown\b|\bappears?\b|\bcompletes?\b|\blands? on\b/;

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
  return { typed, normalized: text, repairs, concepts: conceptsIn(text), polarity: polarityOf(text) };
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
        const vec = built === embedderId() ? await embedOne(query) : null;
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
  /** the case expects the opposite outcome (refused vs succeeds) */
  clash: boolean;
  covered: string[];
  /** what the typed case asks for that this case does not cover, in words */
  missing: string[];
  /** one plain-English line: why this relation */
  why: string;
  llm?: { relation: Relation; missing?: string; note?: string };
}

export interface MatchResult {
  typed: string;
  understood: Understood;
  /** existing = at least one SAME · partial = only PARTIAL · new = neither */
  decision: "existing" | "partial" | "new";
  same: MatchCandidate[];
  partial: MatchCandidate[];
  /** top candidates in rank order, whatever their relation */
  candidates: MatchCandidate[];
  /** plain English, for the chat reply */
  headline: string;
  memory: string;
  llm: { used: boolean; model?: string; promptTokens?: number; completionTokens?: number; error?: string };
  ms: number;
}

/**
 * The tuned constants. Changed only through the eval (scripts/eval-matcher.ts);
 * the values and what they were tuned on are in the report it writes.
 */
export const THRESHOLDS: {
  memLow: number; memHigh: number; wMemory: number; wWords: number; wConcepts: number;
  sameFinal: number; sameConcepts: number; sameMargin: number; partialFinal: number; partialConcepts: number;
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
  sameConcepts: 0.6,
  /** and must be within this of the best candidate */
  sameMargin: 0.05,
  /** PARTIAL needs these */
  partialFinal: 0.35,
  partialConcepts: 0.3,
};

const CONCEPT_WEIGHT: Record<ConceptKind, number> = { action: 1, thing: 0.7, condition: 1.2 };

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
  const missing: string[] = [];
  for (const k of u.concepts) {
    const w = CONCEPT_WEIGHT[k.kind];
    total += w;
    if (candidateHas(k, text, words)) {
      have += w;
      covered.push(k.said);
    } else {
      missing.push(k.kind === "condition" ? `“${k.said}”` : k.label);
    }
  }
  const wordScore = wordCoverage([...new Set(tokens(u.normalized))], c);
  const conceptScore = total ? have / total : wordScore;
  // Outcome: a case expecting a refusal is not the same test as one expecting success.
  const head = normalizeLite(`${c.title} ${c.expected}`);
  const candPol = polarityOf(head);
  const polarityClash =
    (u.polarity === "refuse" && candPol === "success" && !REFUSE.test(head)) ||
    (u.polarity === "success" && (candPol === "refuse" || candPol === "crash") && !SUCCESS.test(head));
  if (polarityClash) missing.push(u.polarity === "refuse" ? "that it should be refused" : "that it should succeed");
  const T = THRESHOLDS;
  const mem = Math.max(0, Math.min(1, (memScore - T.memLow) / (T.memHigh - T.memLow)));
  const final = T.wMemory * mem + T.wWords * wordScore + T.wConcepts * conceptScore;
  return { conceptScore, wordScore, covered, missing, polarityClash, mem, memRaw: memScore, final };
}

export type Thresholds = typeof THRESHOLDS;

/** The final score from the three signals — exported so the eval can re-tune it. */
export function finalScore(memRaw: number, words: number, concepts: number, T: Thresholds = THRESHOLDS): number {
  const mem = Math.max(0, Math.min(1, (memRaw - T.memLow) / (T.memHigh - T.memLow)));
  return T.wMemory * mem + T.wWords * words + T.wConcepts * concepts;
}

/** The deterministic relation for one candidate, given the best final score in its list. */
export function decideRelation(x: { final: number; concepts: number; clash: boolean }, best: number, T: Thresholds = THRESHOLDS): Relation {
  if (!x.clash && x.final >= T.sameFinal && x.concepts >= T.sameConcepts && x.final >= best - T.sameMargin) return "same";
  if (x.final >= T.partialFinal && x.concepts >= T.partialConcepts) return "partial";
  return "unrelated";
}

function ruleRelation(j: ReturnType<typeof judge>, best: number): Relation {
  return decideRelation({ final: j.final, concepts: j.conceptScore, clash: j.polarityClash }, best);
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

export async function matchTestCase(typed: string, opts: MatchOptions = {}): Promise<MatchResult> {
  const started = Date.now();
  const u = understand(typed);
  const top = opts.top ?? 8;
  const query = u.normalized || typed;

  const [mem, words] = await Promise.all([memoryCandidates(query, 60), Promise.resolve(bm25Search(query, 40))]);
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
  const scored = ids
    .map((id) => {
      const c = caseById(id) as CatalogCase;
      full.set(id, { steps: c.steps, expected: c.expected });
      const j = judge(u, c, memById.get(id) ?? memFloor);
      return { c, j, origin: "catalog" as const };
    })
    .filter((x) => x.c);

  // Drafts the assistant wrote earlier: a typed case that matches one of them
  // is not new a second time.
  const drafts = draftSearch ? await draftSearch(mem.vec, mem.embedder, query).catch(() => []) : [];
  for (const d of drafts) {
    const memScore = d.dense !== undefined ? d.dense * 0.75 + lexicalOverlap(memTerms(query), `${d.title} ${d.steps} ${d.expected}`) * 0.25 : memFloor;
    full.set(d.id, { steps: d.steps, expected: d.expected });
    scored.push({
      c: { id: d.id, title: d.title, steps: d.steps, expected: d.expected, setup: "", layer: "draft", section: `Draft (${d.status})` } as unknown as CatalogCase,
      j: judge(u, d, memScore),
      origin: "catalog" as const,
    });
    (scored[scored.length - 1] as { origin: string }).origin = "draft";
  }

  // A case named by its id ("run UI-CRE-017") is that case, whatever the words say.
  const named = new Set((typed.match(/\b(?:UI|API|PRD|GEN)-[A-Z]+-\d{3}\b/gi) ?? []).map((x) => x.toUpperCase()));
  for (const id of named) {
    const c = caseById(id);
    if (!c) continue;
    const at = scored.findIndex((x) => x.c.id === id);
    const j = { conceptScore: 1, wordScore: 1, covered: ["named by id"], missing: [] as string[], polarityClash: false, mem: 1, memRaw: 1, final: 1 };
    if (at >= 0) scored[at].j = j;
    else scored.push({ c, j, origin: "catalog" as const });
  }

  scored.sort((a, b) => b.j.final - a.j.final);
  const best = scored[0]?.j.final ?? 0;
  let cands: MatchCandidate[] = scored.slice(0, Math.max(top, 12)).map(({ c, j, origin }) => {
    const rel = ruleRelation(j, best);
    return {
      id: c.id,
      title: c.title,
      layer: c.layer,
      section: c.section,
      origin,
      relation: rel,
      ruleRelation: rel,
      scores: { memoryRaw: +j.memRaw.toFixed(4), memory: +j.mem.toFixed(3), words: +j.wordScore.toFixed(3), concepts: +j.conceptScore.toFixed(3), final: +j.final.toFixed(3) },
      clash: j.polarityClash,
      covered: j.covered,
      missing: j.missing,
      why: whyLine(rel, c, j.covered, j.missing),
    };
  });

  // Model confirmation of the top five only.
  const llmInfo: MatchResult["llm"] = { used: false };
  if (opts.llm !== false && cands.length) {
    const before = usageReport();
    const head = cands.slice(0, 5);
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
      c.relation = combine(c, a);
      if (c.relation !== c.ruleRelation) {
        c.llm.note = `the rule said ${c.ruleRelation}, the model said ${a.relation}`;
      }
      if (c.relation === "partial" && a.missing && !c.missing.includes(a.missing)) c.missing = [a.missing, ...c.missing];
      c.why = whyLine(c.relation, c, c.covered, c.missing);
    }
  }

  // Order: SAME first, then PARTIAL, then the rest, each by score.
  cands.sort((a, b) => RANK[b.relation] - RANK[a.relation] || b.scores.final - a.scores.final);
  cands = cands.slice(0, top);
  const same = cands.filter((c) => c.relation === "same");
  const partial = cands.filter((c) => c.relation === "partial");
  const decision = same.length ? "existing" : partial.length ? "partial" : "new";
  const headline =
    decision === "existing"
      ? `This matches ${same.length} existing test case${same.length > 1 ? "s" : ""}: ${same.map((c) => `${c.id} (${c.title})`).join("; ")}.`
      : decision === "partial"
        ? `Nothing covers this exactly. ${partial.length} existing case${partial.length > 1 ? "s cover" : " covers"} part of it — ${partial
            .slice(0, 3)
            .map((c) => `${c.id}, which does not cover ${c.missing.slice(0, 2).join(" or ") || "everything you typed"}`)
            .join("; ")}.`
        : "This is new — no existing test case covers it.";
  return { typed, understood: u, decision, same, partial, candidates: cands, headline, memory: mem.via, llm: llmInfo, ms: Date.now() - started };
}
