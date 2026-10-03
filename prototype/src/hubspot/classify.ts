/**
 * IS THIS TICKET A PRODUCT DEFECT? — rules first, the fast model only to break a tie.
 *
 *   defect   the product did something wrong (an error, a wrong number, an
 *            action allowed that should not be, something not shown)
 *   how_to   the customer asked how to do something, or support answered
 *            that the behaviour is expected
 *   request  a service request: reset a password, add a user, training, a
 *            new feature
 *   config   a company setting to change
 *   data     master data to correct (a vendor's GST, a duplicate record)
 *   unclear  neither the rules nor the model could decide
 *
 * The rules score phrases in the stripped text. Support's own reply weighs
 * more than the customer's words: "this is expected behaviour" from support
 * settles it. A CSV/XLSX export has no conversation, so its confidence is
 * scaled down. Only when the rules cannot separate the top two classes is the
 * Slingring fast tier asked — and only for a ticket that passed the leak check.
 */
import type { Classification, DecidedBy, StrippedTicket } from "./types.js";
import { askFastJson, slingringAvailable } from "./slingringFast.js";

type Scored = Exclude<Classification, "unclear">;
const CLASSES: Scored[] = ["defect", "how_to", "request", "config", "data"];

interface Rule {
  cls: Scored;
  re: RegExp;
  w: number;
  /** where to look: the customer's words, support's reply, or both */
  in?: "customer" | "support" | "any";
}

const RULES: Rule[] = [
  // defect
  { cls: "defect", re: /\berror\b|\bexception\b|something went wrong|internal server/, w: 2 },
  { cls: "defect", re: /\b(?:error|code)\s*(?:code\s*)?\d{2,4}\b/, w: 1 },
  { cls: "defect", re: /not working|doesn'?t work|does not work|stopped working|\bbroken\b|\bfail(?:s|ed|ing)?\b/, w: 2 },
  { cls: "defect", re: /\bwrong\b|\bincorrect\b|mismatch|miscalculat|not match|doesn'?t match|does not match/, w: 2 },
  { cls: "defect", re: /unable to|not able to|\bcan'?t\b|\bcannot\b|could not|couldn'?t/, w: 1 },
  { cls: "defect", re: /\bbug\b|glitch|\bdefect\b|\bcrash/, w: 3 },
  { cls: "defect", re: /even though|even after|despite|although/, w: 1 },
  { cls: "defect", re: /accepted after|allowed after|went live|should not|shouldn'?t|should have been/, w: 2 },
  { cls: "defect", re: /still (?:let|lets|allowed|allows|accepts|accepted)\b|(?:was|got) (?:accepted|allowed|published)\b|already (?:passed|closed|over|ended)/, w: 2 },
  { cls: "defect", re: /not (?:visible|showing|displayed|appearing|updating|updated|reflecting|getting|available|present|found)|\bblank\b|cut off|truncat|garbled/, w: 2 },
  { cls: "defect", re: /known (?:issue|bug)|raised (?:it |this )?(?:to|with) (?:the )?(?:tech|dev|engineering|product)|fix (?:is|will be) (?:deployed|released)|escalat\w* to (?:tech|engineering|product|dev)|bug ticket|\bjira\b|we (?:have )?reproduced/, w: 5, in: "support" },
  // how_to
  { cls: "how_to", re: /how (?:do|can|to|should) (?:i|we)\b|\bhow to\b|where (?:can|do) (?:i|we)\b|is it possible|is there (?:a|any) way|steps to|what is the process|help (?:me|us) understand/, w: 3, in: "customer" },
  { cls: "how_to", re: /this is (?:the )?expected|expected behaviou?r|by design|working as (?:expected|designed)|as designed|you (?:can|need to|should|will need to) (?:first |go to|click|use|extend|change|select)|please (?:follow|refer)|kindly (?:follow|refer)|not a (?:bug|defect)/, w: 5, in: "support" },
  // request
  { cls: "request", re: /please (?:reset|create|add|remove|share|send|unlock|activate|deactivate)|reset (?:my |the |his |her )?password|password reset|forgot (?:my )?password|unlock (?:my |the )?account|\btraining\b|demo session|walk-?through|onboarding session|new user|add (?:a |new )?users?|create (?:a |new )?users?|feature request|would like (?:to have|a|an)|can you add|enhancement|need (?:a|an) (?:report|feature|option)/, w: 3 },
  // config
  { cls: "config", re: /(?:enable|disable|turn (?:on|off)|switch (?:on|off))[^.]{0,40}(?:setting|configuration|config|flag|feature|module|option)|configuration change|change (?:the|our) settings?|settings? (?:for|of) (?:our|the) (?:company|account|workspace)/, w: 3 },
  { cls: "config", re: /for (?:our|the) (?:company|workspace)(?: account)?\b|company[- ]level|workspace setting/, w: 2 },
  // data
  { cls: "data", re: /(?:wrong|incorrect) (?:data|gst|gstin|address|name|vendor details|master)|update (?:the )?(?:gst|gstin|address|vendor (?:details|name)|master data)|duplicate (?:vendor|entry|record)s?|merge (?:the )?(?:vendor|record)s|data (?:correction|fix|upload)|uploaded (?:wrong|incorrect)|delete (?:the )?(?:vendor|record|entry)/, w: 3 },
];

/** HubSpot's own category, when the support team set one. */
function categoryHint(cat?: string): Partial<Record<Scored, number>> {
  const c = (cat ?? "").toLowerCase();
  if (/product[_ ]?issue|\bbug\b|defect/.test(c)) return { defect: 2 };
  if (/feature[_ ]?request/.test(c)) return { request: 2 };
  // "General inquiry" covers questions AND service requests in most portals — a nudge, not a verdict.
  if (/general[_ ]?inquiry|question|how[_ -]?to/.test(c)) return { how_to: 1 };
  if (/billing/.test(c)) return { request: 2 };
  if (/config/.test(c)) return { config: 2 };
  if (/data/.test(c)) return { data: 2 };
  return {};
}

export interface ClassifyResult {
  classification: Classification;
  confidence: number;
  by: DecidedBy;
  why: string;
  scores: Record<Scored, number>;
}

function split(t: StrippedTicket): { customer: string; support: string } {
  const customer: string[] = [t.subject];
  const support: string[] = [];
  for (const block of t.text.split(/\n\n(?=(?:Customer wrote|Support replied):)/)) {
    if (block.startsWith("Support replied:")) support.push(block);
    else customer.push(block);
  }
  return { customer: customer.join("\n").toLowerCase(), support: support.join("\n").toLowerCase() };
}

/** The deterministic half: scores per class and, when clear enough, a decision. */
export function classifyByRules(t: StrippedTicket): ClassifyResult {
  const { customer, support } = split(t);
  const scores: Record<Scored, number> = { defect: 0, how_to: 0, request: 0, config: 0, data: 0 };
  const hits: string[] = [];
  for (const r of RULES) {
    const where = r.in ?? "any";
    const hay = where === "customer" ? customer : where === "support" ? support : `${customer}\n${support}`;
    const m = hay.match(r.re);
    if (m) {
      scores[r.cls] += r.w;
      hits.push(`${r.cls}+${r.w} “${m[0].slice(0, 40)}”${where === "support" ? " (support's reply)" : ""}`);
    }
  }
  for (const [k, v] of Object.entries(categoryHint(t.category))) {
    scores[k as Scored] += v!;
    hits.push(`${k}+${v} (HubSpot category “${t.category}”)`);
  }
  const ranked = CLASSES.map((c) => [c, scores[c]] as const).sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  const exportScale = t.hasThread ? 1 : 0.85;
  const why = hits.length ? hits.join("; ") : "no rule matched";
  if (top[1] >= 3 && top[1] - second[1] >= 2) {
    const conf = Math.min(0.95, 0.55 + 0.08 * (top[1] - second[1])) * exportScale;
    return { classification: top[0], confidence: Number(conf.toFixed(2)), by: "rule", why, scores };
  }
  return { classification: "unclear", confidence: 0, by: "none", why, scores };
}

const SYSTEM =
  "You triage support tickets for Procol, a B2B procurement platform (sourcing events: RFQ, RFP, auctions, bids, evaluation, award). " +
  "Personal data has been removed and replaced by placeholders like [name] or [company]. " +
  'Answer ONLY with JSON: {"classification": one of "defect" | "how_to" | "request" | "config" | "data", "confidence": number 0..1, "reason": short string}. ' +
  "defect = the product behaved wrongly; how_to = a question about using the product or behaviour that is expected; request = a service request (reset password, add user, training, new feature); " +
  "config = a company setting to change; data = master data to correct.";

/** Schema check for the model's answer — anything else is no answer. */
export function validClassification(x: unknown): { classification: Scored; confidence: number; reason: string } | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.classification !== "string" || !CLASSES.includes(o.classification as Scored)) return null;
  const c = typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1 ? o.confidence : null;
  if (c === null) return null;
  return { classification: o.classification as Scored, confidence: c, reason: typeof o.reason === "string" ? o.reason.slice(0, 200) : "" };
}

/**
 * Rules, then (only when the rules tie and the ticket may reach a model) the
 * fast tier, then the rules' best guess with a low confidence.
 */
export async function classifyTicket(t: StrippedTicket, opts: { ai: boolean }): Promise<ClassifyResult> {
  const r = classifyByRules(t);
  if (r.classification !== "unclear") return r;
  const ranked = CLASSES.map((c) => [c, r.scores[c]] as const).sort((a, b) => b[1] - a[1]);
  if (opts.ai && slingringAvailable()) {
    const ans = validClassification(
      await askFastJson(SYSTEM, `Subject: ${t.subject}\n\n${t.text.slice(0, 3500)}\n\nRule scores (for context): ${JSON.stringify(r.scores)}`, 200),
    );
    if (ans) {
      const scale = t.hasThread ? 1 : 0.85;
      return {
        classification: ans.classification,
        confidence: Number((Math.min(0.8, ans.confidence) * scale).toFixed(2)),
        by: "llm",
        why: `rules tied (${r.why}); the fast model chose ${ans.classification}: ${ans.reason}`,
        scores: r.scores,
      };
    }
  }
  if (ranked[0][1] >= 2) {
    return { classification: ranked[0][0], confidence: Number((0.4 * (t.hasThread ? 1 : 0.85)).toFixed(2)), by: "rule", why: `weak: ${r.why}`, scores: r.scores };
  }
  return r;
}
