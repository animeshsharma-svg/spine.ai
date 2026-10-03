/**
 * PERSONAL-DATA STRIPPING FOR SUPPORT TICKETS — deterministic, no model.
 *
 * Runs BEFORE anything about a ticket is stored in the spine database or
 * shown to a model. Two layers:
 *
 *   stripText()  removes what it recognises and says how much of each kind:
 *                attachments, signature blocks and quoted replies, greetings,
 *                emails, links (every link — a support link may carry a token
 *                or a record id), UPI ids, GSTIN, PAN, IFSC, bank-account
 *                numbers, Aadhaar, phone numbers, long numbers, pincodes and
 *                address lines, names (the ticket's own contact and owner
 *                fields, honorifics, "my name is …"), and company names (the
 *                ticket's associated company, "M/s …", "… Pvt Ltd" shapes).
 *                A company that maps to a known Procol client becomes "the
 *                client" and the id is kept separately; any other company is
 *                "[company]".
 *
 *   leakCheck()  looks again with BROADER patterns than the stripper uses
 *                ("name [at] domain dot com", digits split by slashes or
 *                brackets, lower-case tax ids, any surviving dictionary
 *                name). Anything it finds means the stripper missed a shape:
 *                the ticket is FLAGGED and kept away from the model, and its
 *                text is withheld from storage. It fails closed.
 *
 * Over-stripping is the accepted cost: a quantity that looks like a phone
 * number becomes "[phone]". A missed name is the failure this file exists to
 * prevent; an over-eager one costs a word.
 */
import type { PiiKind, RawTicket, StrippedTicket } from "./types.js";

// ── known Procol clients (tenant references we may keep, as an id only) ──────

export const KNOWN_CLIENTS: Array<{ id: number; name: string; aliases: string[] }> = [
  { id: 198678, name: "PROCOL DEMO", aliases: ["procol demo"] },
  { id: 32461, name: "Demo Account 2", aliases: ["demo account 2", "demo account two"] },
  { id: 39490, name: "M/s Moon Beverages", aliases: ["moon beverages"] },
  { id: 47053, name: "GMMCO LIMITED", aliases: ["gmmco"] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The Procol client a company name refers to, or null. */
export function clientIdFor(companyNames: string[]): number | null {
  for (const n of companyNames) {
    const x = ` ${norm(n)} `;
    for (const c of KNOWN_CLIENTS) if (c.aliases.some((a) => x.includes(` ${a} `))) return c.id;
  }
  return null;
}

// ── the dictionary built from the ticket's own fields ───────────────────────

/** Words that may appear as a "name" token but are ordinary words in a ticket. */
const NOT_A_NAME = new Set(
  (
    "team support admin procol event events vendor vendors buyer buyers user users client customer sales service " +
    "the and for from with india indian private limited ltd pvt llp inc company group industries enterprises " +
    "corporation corp traders solutions technologies tech steel steels pharma motors infra engineering " +
    "purchase procurement manager head dept department office account accounts qa test demo rfq rfp auction " +
    "bid bids quote quotes award order orders mr ms mrs dr shri smt sri"
  ).split(" "),
);

export interface PiiDictionary {
  /** full names and their distinctive tokens */
  names: string[];
  /** company names (full and without the legal suffix) */
  companies: string[];
  /** a company that maps to a known client → "the client" instead of "[company]" */
  clientCompanies: string[];
}

const LEGAL_SUFFIX = /\b(?:pvt\.?|private|ltd\.?|limited|llp|inc\.?|corp\.?|corporation|co\.?|company|india)\b\.?/gi;

export function buildDictionary(t: Pick<RawTicket, "contactNames" | "ownerNames" | "companyNames">): PiiDictionary {
  const names = new Set<string>();
  for (const full of [...t.contactNames, ...t.ownerNames]) {
    const f = full.replace(/\S+@\S+/g, " ").replace(/\([^)]*\)|<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!f) continue;
    if (f.length >= 3) names.add(f);
    for (const tok of f.split(/[\s,.;()/-]+/)) {
      if (tok.length >= 3 && !NOT_A_NAME.has(tok.toLowerCase()) && !/\d/.test(tok)) names.add(tok);
    }
  }
  const companies = new Set<string>();
  const clientCompanies = new Set<string>();
  for (const c of t.companyNames) {
    const f = c.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    if (!f) continue;
    const core = f.replace(/^m\/s\.?\s*/i, "").replace(LEGAL_SUFFIX, " ").replace(/\s+/g, " ").trim();
    const target = clientIdFor([f]) ? clientCompanies : companies;
    target.add(f);
    if (core.length >= 3 && !NOT_A_NAME.has(core.toLowerCase())) target.add(core);
    // An all-capitals first word ("GMMCO Limited") is how people write the company in a hurry.
    const first = core.split(" ")[0];
    if (first && first.length >= 4 && first === first.toUpperCase() && /[A-Z]/.test(first) && !NOT_A_NAME.has(first.toLowerCase())) target.add(first);
  }
  // The known clients' own names count as client companies wherever they appear.
  for (const k of KNOWN_CLIENTS) {
    clientCompanies.add(k.name.replace(/^m\/s\.?\s*/i, ""));
    for (const a of k.aliases) clientCompanies.add(a);
  }
  const byLength = (a: string, b: string) => b.length - a.length;
  return { names: [...names].sort(byLength), companies: [...companies].sort(byLength), clientCompanies: [...clientCompanies].sort(byLength) };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A whole-word, case-insensitive match that tolerates any run of spaces inside the phrase. */
const wordRe = (phrase: string) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(phrase).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`, "giu");

// ── the patterns ────────────────────────────────────────────────────────────

const RE = {
  attachmentLine: /^\s*(?:attachments?|attached(?: files?)?|files?)\s*[:\-].*$/gim,
  fileName: /[\w\-()[\] ]{0,60}?[\w\-()\]]\.(?:pdf|xlsx?|xlsm|csv|docx?|png|jpe?g|gif|bmp|zip|rar|pptx?|msg|eml|txt|heic)\b/gi,
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  url: /\b(?:https?:\/\/|www\.)[^\s<>"'\])]+/gi,
  upi: /\b[\w.-]{2,}@(?:ok\w+|ybl|paytm|upi|axl|ibl|apl|icici|hdfcbank|sbi|axisbank)\b/gi,
  gstin: /\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/gi,
  pan: /\b[A-Z]{3}[PCHABGJLFT][A-Z]\d{4}[A-Z]\b/gi,
  ifsc: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g,
  bank: /\b(?:a\/c|acct?|account)\.?\s*(?:no\.?|number|num|#)?\s*[:.#-]?\s*\d[\d\s-]{6,22}\d\b/gi,
  aadhaar: /\b\d{4}[\s-]\d{4}[\s-]\d{4}\b/g,
  phoneCandidate: /(?<![\w.])(?:\+|00)?\d[\d \t().-]{7,}\d(?![\w])/g,
  labelledPhone: /\b(?:ph(?:one)?|mob(?:ile)?|cell|tel|contact(?: no\.?| number)?|whatsapp)\s*(?:no\.?|number)?\s*[:.#-]?\s*\+?\d[\d\s-]{5,}\d/gi,
  longNumber: /\b\d{11,}\b/g,
  pincodeLabelled: /\b(?:pin\s*code|pincode|pin|zip(?:\s*code)?|postal\s*code)\s*[:.#-]?\s*[1-9]\d{2}\s?\d{3}\b/gi,
  pincodeAfterCity: /,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s*[-–]?\s*[1-9]\d{5}\b/g,
  addressLabel: /\b(?:(?:billing|shipping|delivery|site|office|registered|plant|factory)\s+)?addr(?:ess)?\s*[:\-][^\n]*?(?=\.\s|\.?$|\n)/gim,
  honorific: /\b(?:Mr|Ms|Mrs|Miss|Dr|Shri|Smt|Sri|Kumari)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]*\.?){0,2}/g,
  selfIntro: /\b(?:([Mm]y name is)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?|([Tt]his is|I am|I'm)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?=\s+(?:from|here|at|of)\b|[,.]|\s*$))/gm,
  msCompany: /\bM\/[sS]\.?\s+(?:[A-Z0-9][\w&.'-]*\s?){1,5}/g,
  suffixCompany:
    /\b(?:[A-Z][\w&.'-]*\s+){0,4}[A-Z][\w&.'-]*\s+(?:(?:Pvt\.?|Private)\s+(?:Ltd\.?|Limited)|Ltd\.?|Limited|LLP|Inc\.?|Industries|Enterprises|Corporation|Corp\.?|Traders|Solutions|Technologies|Pharmaceuticals|Infrastructure)(?![\w])/g,
};

const ADDRESS_WORD =
  /\b(road|rd|street|nagar|sector|floor|plot|building|bldg|near|opp|opposite|colony|lane|marg|phase|industrial area|industrial estate|district|dist|taluka|tehsil|tower|block|flat|house no|survey no|midc|chowk|cross|layout|apartment|society|village|post office)\b/gi;

const SIGN_OFF = /^\s*(?:regards|best regards|warm regards|kind regards|with regards|thanks\s*(?:&|and)\s*regards|thanks|thank you|thanks again|many thanks|sincerely|yours (?:sincerely|faithfully|truly)|cheers|best|br)\b\s*[,.!-]?\s*(?:[A-Z][\w.]*(?:\s+[A-Z][\w.]*){0,3})?\s*$/i;
const CUT_REST = /^\s*(?:--\s*$|__+\s*$|sent from my\b|get outlook for\b|disclaimer\b|this e-?mail (?:and any|is confidential|message)|confidentiality notice|on .{4,80} wrote:\s*$|-{3,}\s*original message|from:\s.+|>)/i;
const GREETING_LINE = /^\s*(?:hi|hello|hey|dear|good (?:morning|afternoon|evening)|greetings|namaste)\b[^\n]{0,40}$/i;
const GREETING_PREFIX = /^\s*(?:hi|hello|hey|dear)\s+[^,\n]{0,30},\s*/i;

/** Capitalised words that are product language, calendar or courtesy — never treated as a name. */
const PRODUCT_WORDS = new Set(
  (
    "procol rfq rfp rfx boq erfx qcs mqcs po pr grn asn tna event events technical commercial pricing round stage stages vendor vendors " +
    "buyer buyers supplier suppliers support team purchase purchasing procurement order orders request requests requisition quote quotes " +
    "quotation comparison sheet bid bids bidding award awards awarding auction auctions reverse forward live draft closed published " +
    "please the this that these we our you your hi hello dear thanks thank regards best kind warm sir madam team " +
    "monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october " +
    "november december jan feb mar apr jun jul aug sep sept oct nov dec today yesterday tomorrow india indian error unit units line item " +
    "items product products master data settings setting dashboard new old senior junior manager head dept department sales admin user " +
    "users account company approval approver approvers evaluation evaluator price prices total quantity version template templates " +
    "delivery location invoice bill payment goods receipt surrogate counter offer negotiation rank ranks gold silver bronze export pdf " +
    "excel upload download report reports history list status urgent issue problem bug ticket screen page button field fields option " +
    "category categories subject description lot lots currency terms conditions schedule extension deadline end start time date " +
    "senior lead executive officer engineer engineering mr ms mrs dr no yes ok also when after before while if is it in on at for of"
  ).split(" "),
);

const DATE_LIKE = /^(?:\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{2,4})/;

export interface StripResult {
  text: string;
  removed: Partial<Record<PiiKind, number>>;
}

/** Remove personal data from one block of text. Pure; the same input always gives the same output. */
export function stripText(input: string, dict: PiiDictionary): StripResult {
  const removed: Partial<Record<PiiKind, number>> = {};
  const bump = (k: PiiKind, n = 1) => {
    if (n > 0) removed[k] = (removed[k] ?? 0) + n;
  };
  const sub = (s: string, re: RegExp, kind: PiiKind, by: string | ((m: string) => string)) =>
    s.replace(re, (m: string, ...rest: unknown[]) => {
      const out = typeof by === "function" ? by(m) : by;
      if (out !== m) bump(kind);
      return out;
    });

  let text = (input ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[   ]/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li)>/gi, "\n")
    .replace(/<[^>]{1,200}>/g, " ") // HTML from the HubSpot rich-text editor
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  // 1 · signature blocks, quoted replies, greetings — line by line
  const kept: string[] = [];
  let greetingDone = false;
  for (const line of text.split("\n")) {
    if (CUT_REST.test(line)) {
      bump("signature");
      break;
    }
    if (line.trim().length <= 60 && SIGN_OFF.test(line)) {
      bump("signature");
      break;
    }
    if (!greetingDone && line.trim()) {
      greetingDone = true;
      if (GREETING_LINE.test(line) && line.trim().length <= 45) {
        bump("greeting");
        continue;
      }
      if (GREETING_PREFIX.test(line)) {
        bump("greeting");
        kept.push(line.replace(GREETING_PREFIX, ""));
        continue;
      }
    }
    kept.push(line);
  }
  text = kept.join("\n");

  // 2 · attachments
  text = sub(text, RE.attachmentLine, "attachment", "[attachment]");
  text = sub(text, RE.fileName, "attachment", " [attachment]");

  // 3 · machine-shaped identifiers
  text = sub(text, RE.email, "email", "[email]");
  text = sub(text, RE.url, "url", "[link]");
  text = sub(text, RE.upi, "upi", "[upi]");
  text = sub(text, RE.gstin, "gstin", "[gstin]");
  text = sub(text, RE.pan, "pan", "[pan]");
  text = sub(text, RE.ifsc, "ifsc", "[ifsc]");
  text = sub(text, RE.bank, "bank_account", "account [bank account]");
  text = sub(text, RE.aadhaar, "aadhaar", "[aadhaar]");
  text = sub(text, RE.labelledPhone, "phone", "[phone]");
  text = sub(text, RE.phoneCandidate, "phone", (m) => {
    const digits = m.replace(/\D/g, "").length;
    if (DATE_LIKE.test(m.trim())) return m;
    if (digits >= 10 && digits <= 14) return "[phone]";
    return m;
  });
  text = sub(text, RE.longNumber, "long_number", "[number]");

  // 4 · addresses
  text = sub(text, RE.addressLabel, "address", "[address]");
  text = sub(text, RE.pincodeLabelled, "pincode", "[pincode]");
  text = sub(text, RE.pincodeAfterCity, "address", ", [address]");
  // An address is judged sentence by sentence, so one address does not take a whole paragraph with it.
  text = text
    .split("\n")
    .map((line) =>
      line
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => {
          const words = new Set((sentence.match(ADDRESS_WORD) ?? []).map((w) => w.toLowerCase()));
          const looksLikeOne = words.size >= 2 && (/\d/.test(sentence) || (sentence.match(/,/g) ?? []).length >= 2);
          if (!looksLikeOne) return sentence;
          bump("address");
          return "[address]";
        })
        .join(" "),
    )
    .join("\n");

  // 5 · companies — the ticket's own, then the shapes companies are written in
  for (const c of dict.clientCompanies) text = sub(text, wordRe(c), "company", "the client");
  for (const c of dict.companies) text = sub(text, wordRe(c), "company", "[company]");
  text = sub(text, RE.msCompany, "company", "[company] ");
  text = sub(text, RE.suffixCompany, "company", (m) => (/procol/i.test(m) ? m : "[company]"));

  // 6 · people — the ticket's own contacts and owners, then honorifics and introductions
  for (const n of dict.names) text = sub(text, wordRe(n), "name", "[name]");
  text = sub(text, RE.honorific, "name", "[name]");
  text = sub(text, RE.selfIntro, "name", (m) => m.replace(/^(my name is|this is|i am|i'm)\s+.*$/i, "$1 [name]"));

  // 6b · any other run of two or three Capitalised Words that are not product words — a name nobody listed.
  //      Over-strips product names now and then; a surviving person's name is the worse failure.
  text = text.replace(/(?<![\p{L}\[])([A-Z][a-z]{1,20})((?:[ \t]+[A-Z][a-z]{1,20}){1,2})(?![\p{L}])/gu, (m) => {
    const words = m.split(/[ \t]+/);
    if (words.some((w) => PRODUCT_WORDS.has(w.toLowerCase()))) return m;
    bump("name");
    return "[name]";
  });

  // 7 · tidy
  text = text
    .replace(/(\[(\w[\w ]*)\])(?:\s*[,/&]?\s*\1)+/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, removed };
}

// ── the leak check: broader patterns, fails closed ──────────────────────────

const LEAK = {
  email: /[A-Za-z0-9._%+-]+\s*(?:@|\[\s*at\s*\]|\(\s*at\s*\)|\{\s*at\s*\})\s*[A-Za-z0-9-]+(?:\s*(?:\.|\[\s*dot\s*\]|\(\s*dot\s*\)|\s+dot\s+)\s*[A-Za-z0-9-]+)*\s*(?:\.|\[\s*dot\s*\]|\(\s*dot\s*\)|\s+dot\s+)\s*[A-Za-z]{2,}/i,
  url: /\b(?:https?:\/\/|www\.)|\b[a-z0-9-]+\.(?:com|in|co\.in|net|org|io)\/\S+/i,
  phoneDigits: /(?:\+|00)?\d(?:[ \t().\-\/]{0,3}\d){9,}/g,
  plusCountry: /\+\s?\d{1,3}[\s-]?\d{3,}/,
  gstin: /\b\d{2}\s?[A-Z]{5}\s?\d{4}\s?[A-Z][0-9A-Z]\s?Z\s?[0-9A-Z]\b/i,
  pan: /\b[A-Z]{3}[PCHABGJLFT][A-Z]\d{4}[A-Z]\b/i,
  ifsc: /\b[A-Z]{4}0[A-Z0-9]{6}\b/i,
  honorific: /\b(?:Mr|Mrs|Ms|Dr|Shri|Smt)\.?\s+[A-Z][a-z]{2,}/,
};

const PLACEHOLDER = /\[(?:email|link|upi|gstin|pan|ifsc|bank account|aadhaar|phone|number|address|pincode|company|name|attachment)\]/g;

/** Kinds of personal data still present in stripped text. Empty array = clean. */
export function leakCheck(text: string, dict: PiiDictionary): string[] {
  const found = new Set<string>();
  const t = text.replace(PLACEHOLDER, " "); // our own placeholders are not leaks ("[at]" in an address is)
  if (LEAK.email.test(t)) found.add("email");
  if (LEAK.url.test(t)) found.add("url");
  const undated = t.replace(/\b\d{1,4}[-./]\d{1,2}[-./]\d{1,4}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?/g, " ");
  for (const m of undated.match(LEAK.phoneDigits) ?? []) {
    const d = m.replace(/\D/g, "").length;
    if (d >= 10 && d <= 14) found.add("phone");
  }
  if (LEAK.plusCountry.test(undated)) found.add("phone");
  if (LEAK.gstin.test(t)) found.add("gstin");
  if (LEAK.pan.test(t)) found.add("pan");
  if (LEAK.ifsc.test(t)) found.add("ifsc");
  if (LEAK.honorific.test(t)) found.add("name");
  for (const n of dict.names) if (wordRe(n).test(t)) found.add("name");
  for (const c of dict.companies) if (wordRe(c).test(t)) found.add("company");
  return [...found].sort();
}

// ── one ticket ──────────────────────────────────────────────────────────────

const merge = (a: Partial<Record<PiiKind, number>>, b: Partial<Record<PiiKind, number>>) => {
  for (const [k, v] of Object.entries(b)) a[k as PiiKind] = (a[k as PiiKind] ?? 0) + (v ?? 0);
  return a;
};

function firstLines(text: string, max = 420): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return (stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, "")) + " …";
}

/**
 * Strip a whole ticket: subject, description and every thread message.
 * The raw ticket is not referenced by the result.
 */
export function stripTicket(raw: RawTicket): StrippedTicket {
  const dict = buildDictionary(raw);
  const removed: Partial<Record<PiiKind, number>> = {};
  const s = stripText(raw.subject ?? "", dict);
  merge(removed, s.removed);
  const d = stripText(raw.content ?? "", dict);
  merge(removed, d.removed);
  const parts: string[] = [];
  if (d.text) parts.push(`Customer wrote: ${d.text}`);
  for (const m of raw.thread ?? []) {
    const r = stripText(m.text ?? "", dict);
    merge(removed, r.removed);
    if (!r.text) continue;
    const who = /out|agent|support|outgoing|sent/i.test(m.direction ?? "") ? "Support replied" : "Customer wrote";
    parts.push(`${who}: ${r.text}`);
  }
  const text = parts.join("\n\n");
  const subject = s.text.replace(/\s+/g, " ").trim();
  const leaks = leakCheck(`${subject}\n${text}`, dict);
  return {
    id: String(raw.id),
    subject,
    text,
    summary: firstLines(`${subject}${subject && d.text ? " — " : ""}${d.text}`),
    category: raw.category,
    priority: raw.priority,
    pipeline: raw.pipeline,
    pipelineStage: raw.pipelineStage,
    createdAt: raw.createdAt,
    closedAt: raw.closedAt,
    sourceType: raw.sourceType,
    clientId: clientIdFor(raw.companyNames),
    removed,
    leaks,
    hasThread: (raw.thread ?? []).length > 0,
    inputKind: raw.inputKind,
  };
}

/**
 * The gate every model call sits behind: a ticket reaches the Slingring fast
 * tier (or the remote embedder) only when its stripped text is clean.
 */
export function mayReachModel(t: Pick<StrippedTicket, "leaks">, aiOn: boolean): boolean {
  return aiOn && t.leaks.length === 0;
}
