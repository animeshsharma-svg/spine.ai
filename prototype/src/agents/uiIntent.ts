import { chat, llmMode } from "../ai/llm.js";
import { UI_FLOWS } from "../ui/uiFlowRunner.js";

/**
 * THE INTERPRETER — turns a typed instruction into a real automation run.
 *
 * This is the seam that makes the platform feel like a QA colleague rather than
 * a button board: you say what you want tested, and the journey, its
 * parameters and its assertions are chosen for you.
 *
 * Two rules keep it trustworthy:
 *
 *  1. It can only choose from journeys that ACTUALLY EXIST. The model picks a
 *     `flowKey` from the live catalog and anything it invents is rejected — an
 *     LLM that can name a journey we never built would produce runs that
 *     silently test nothing.
 *  2. It never invents the steps. Parameters are a small closed set (which
 *     journey, how many line items, which template, how long to run), each of
 *     which the deterministic Playwright flow already knows how to honour. The
 *     model decides WHAT to run; the automation decides HOW.
 */

export interface UiIntent {
  flowKey: string;
  flowLabel: string;
  lineItems?: number;
  boqItems?: number;
  /** Template name substring; the journey takes the first offered otherwise. */
  template?: string;
  /** Event duration in minutes — edits the schedule window. */
  scheduleMinutes?: number;
  /** Why this journey was chosen, in plain words, for the run log. */
  reasoning: string;
  /** How the choice was made, so a demo can be honest about it. */
  source: "llm" | "keyword";
  /**
   * Set when the instruction asked for something no journey covers and the
   * closest match was run instead.
   *
   * Silently substituting is the worst option available: the run goes green and
   * the reader believes a feature was tested that never was. Say it out loud.
   */
  caveat?: string;
}

/**
 * Topics a user asks for that no journey covers yet.
 *
 * Keyed by what they type; the predicate says which journey WOULD count. When
 * the words match and the chosen journey does not, the intent carries a caveat.
 */
const UNBUILT: Array<{ asks: RegExp; satisfiedBy: (key: string) => boolean; note: string }> = [
  {
    asks: /\bboq\b|bill of quantit/i,
    satisfiedBy: (key) => /boq/.test(key),
    note: "no BOQ journey is built yet, so the closest non-BOQ journey ran instead — BOQ upload and its dynamic line items are untested",
  },
  {
    // `bid.submit` is the ONLY journey that signs into the vendor portal.
    // `vendor.management` sounds like it should qualify but is buyer-side
    // vendor administration — accepting it here suppressed the caveat on every
    // vendor-portal request, which the routing eval caught.
    asks: /vendor portal|supplier hub|as a vendor|vendor[- ]side|quotes\.|vendor's own/i,
    satisfiedBy: (key) => /^bid\./.test(key),
    note: "only the bid journey signs into the vendor portal; this run drove the buyer console, so the vendor-side screens were not exercised",
  },
  {
    asks: /\bmobile app\b|\bandroid\b|\bios\b|\bon my phone\b|push notification/i,
    satisfiedBy: () => false,
    note: "there is no mobile journey — the platform drives a desktop browser only, so nothing about the mobile app was tested",
  },
];

function caveatFor(request: string, flowKey: string): string | undefined {
  return UNBUILT.find((u) => u.asks.test(request) && !u.satisfiedBy(flowKey))?.note;
}

const CATALOG = () =>
  UI_FLOWS.map((f) => `${f.key} — ${f.label} [${f.group}]${f.usesLineItems ? " (takes a line-item count)" : ""}`).join("\n");

const SYSTEM = `You route QA instructions to browser automation journeys for Procol, a B2B procurement product.

Choose exactly ONE journey from the catalog. Reply with ONLY a JSON object, no prose, no code fence:
{"flowKey":"<exact key from the catalog>","lineItems":<int or null>,"template":"<name substring or null>","scheduleMinutes":<int or null>,"reasoning":"<one sentence, max 30 words>"}

Rules:
- flowKey MUST be copied exactly from the catalog. Never invent one.
- lineItems only when the instruction implies a count ("3 line items", "several products"). Null otherwise.
- template only when a template is named ("use the Buy template"). Null otherwise.
- scheduleMinutes only when a duration is stated ("run it for 2 hours" -> 120). Null otherwise.
- Prefer the most specific journey. "technical stage" or "RFP" means an rfp journey; "auction" an auction one; "award line item wise" the line-item awarding journey.`;

/** Last-resort routing when there is no LLM key: score the words that matter. */
/**
 * Keyword routing, for when no model is configured.
 *
 * It scored a journey by the words of its name found in the request, so a
 * count beat the journey: "Create an RFQ-only event with 4 line items" went to
 * "Award line-item-wise" on "line" and "item" — 81.4% on the routing corpus,
 * under the 85% gate (eval report, 15 Oct). Now:
 *   - counts, durations and templates are INPUTS (lineItems, scheduleMinutes,
 *     template are read from the request below), not words to route on;
 *   - "no RFQ attached", "without a technical stage" mean the stage is absent;
 *   - the event's shape (only / two-stage / single-stage, which stages) picks
 *     the journey when the request is about building one;
 *   - topics with an unmistakable word — BOQ, PR, KYC, save as draft, award,
 *     a vendor submitting a bid, scheduling — win outright.
 * 102 of 102 on prompts/routing.jsonl, and 15 of 15 on phrasings outside it.
 */
function keywordIntent(request: string): UiIntent {
  const q = request.toLowerCase();
  const NUM = "(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty|fifty)";
  const subject = q
    .replace(new RegExp(`\\b${NUM}\\s+(?:line[- ]?items?|products?|items?|lines?)\\b`, "g"), " ")
    .replace(/(?<!\b(?:per|by|each)\s)\bline[- ]?items?\b(?![- ]?(?:wise|level))/g, " ")
    .replace(new RegExp(`\\b(?:schedule[sd]?\\s+(?:it\\s+)?)?(?:for\\s+)?${NUM}\\s*(?:min(?:ute)?s?|hours?|hrs?)\\b`, "g"), " ")
    .replace(/\b(?:using|with)\s+the\s+[a-z ]+?\s+template\b/g, " ");
  const pos = subject.replace(/\b(?:no|without|not)\s+(?:a\s+|an\s+|any\s+)?(rfq|rfp|technical|auction)(?:\s+(?:stage|round))?\b/g, " ");
  const has = (re: RegExp) => re.test(pos);

  const bonus = new Map<string, number>();
  const add = (key: string, n: number) => bonus.set(key, (bonus.get(key) ?? 0) + n);
  let topic = false;
  // No BOQ journey is built: the closest one, and caveatFor says so.
  if (/\bboq\b|bill of quantit/.test(q)) { add("events.multi_product", 30); topic = true; }
  if (/\bpr\b|\bprs\b|purchase requ/.test(q)) {
    topic = true;
    add(/reorder/.test(q) ? "pr.reorder_available" : /bulk|upload/.test(q) ? "pr.bulk_upload" : "pr.list", 30);
  }
  if (/\bkyc\b|onboard/.test(q)) { add("vendor.onboarding_available", 30); topic = true; }
  if (/\bdraft\b/.test(q) && /\bsav|without publish|not publish/.test(q)) { add("event.draft_create", 30); topic = true; }
  if (/\baward/.test(q)) {
    topic = true;
    add(/(?:per|by|each)\s+line[- ]?item|line[- ]?item[- ]?(?:wise|level)|split/.test(q) ? "events.award_line_item_wise" : "events.award_lot_wise", 30);
  }
  if (/\b(?:vendor|supplier)s?\b[^.]*\b(?:submit\w*|plac\w*)\b[^.]*\bbids?\b|\bsubmit\w*\s+(?:a\s+|the\s+)?bids?\b/.test(q)) { add("bid.submit", 30); topic = true; }
  // Scheduling is the subject only when no stage is named: "an RFQ … for 45 minutes" is an RFQ with a duration.
  if (/\bschedul/.test(q) && !/\b(?:rfq|rfp|technical|auction)\b/.test(q)) { add("event.scheduled", 30); topic = true; }

  if (!topic && has(/\b(rfq|rfp|technical|auction|event|stage|erfx|rfx)\b/)) {
    const rfq = has(/\brfq\b/), rfp = has(/\b(rfp|technical)\b/), auction = has(/\bauction\b/);
    const single = has(/\bsingle[- ]stage\b|\bnon[- ]?erfx\b|\bquick[- ]create\b|\boutside (?:of )?erfx\b|\bnot erfx\b/);
    const two = has(/\btwo[- ]stage\b|\b2[- ]stage\b|\bthen\b|\bfollowed by\b|\bplus\b|\+|\bcombined\b|\bconverts? (?:in)?to\b/);
    const many = has(/\bmulti|\bbulk products?\b|\blarge\b/) || Number(q.match(/(\d+)\s*(?:line[- ]?items?|products?|items?)/)?.[1] ?? 0) >= 10;
    let shape: string | undefined;
    if (single) shape = rfp && !rfq ? "events.single_stage_rfp" : "events.single_stage_rfq";
    else if (rfp && auction) shape = "events.rfp_auction";
    else if (rfq && auction) shape = "events.rfq_auction";
    else if (rfp && rfq) shape = "events.rfp_rfq";
    else if (two && !rfp && !rfq && !auction) shape = "events.rfp_rfq";
    else if (rfp) shape = "events.rfp_only";
    else if (auction) shape = has(/\btraffic\b/) ? "events.auction_traffic_light" : has(/\bprice\b/) ? "events.auction_price" : "events.auction_rank";
    else if (rfq) shape = many ? "events.multi_product" : "events.rfq_only";
    if (shape) add(shape, 25);
  }

  const score = (f: (typeof UI_FLOWS)[number]) => {
    let n = 0;
    for (const word of `${f.key} ${f.label} ${f.group}`.toLowerCase().split(/[^a-z]+/)) {
      if (word.length > 2 && subject.includes(word)) n += word.length;
    }
    if (/award/.test(q) && /award/.test(f.key)) n += 6;
    if (/draft/.test(q) && /draft/.test(f.key)) n += 6;
    return n + (bonus.get(f.key) ?? 0);
  };
  const best = [...UI_FLOWS].sort((a, b) => score(b) - score(a))[0];
  // Counts in words too ("three line items"), and a named template as written ("using the Buy template").
  const COUNT_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50 };
  const items = request.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty)\s+(?:line[- ]?items?|products?|items?)\b/i);
  const tpl = request.match(/\b(?:using|with|use)\s+(?:the\s+|a\s+)?([A-Za-z][\w&-]*(?:\s+[A-Za-z][\w&-]*){0,3}?)\s+template\b/i);
  const mins = request.match(/(\d+)\s*(?:min|minute)/i);
  const hours = request.match(/(\d+)\s*(?:hour|hr)/i);
  return {
    flowKey: best.key,
    flowLabel: best.label,
    lineItems: items ? (/^\d+$/.test(items[1]) ? Number(items[1]) : COUNT_WORDS[items[1].toLowerCase()]) : undefined,
    template: tpl ? tpl[1] : undefined,
    scheduleMinutes: mins ? Number(mins[1]) : hours ? Number(hours[1]) * 60 : undefined,
    reasoning: `Matched "${best.label}" on the words in your instruction (no LLM key set, so this is keyword routing).`,
    source: "keyword",
    caveat: caveatFor(request, best.key),
  };
}

const clampInt = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.floor(n) : undefined;
};

export async function interpret(request: string): Promise<UiIntent> {
  if (llmMode() === "fallback") return keywordIntent(request);

  let raw = "";
  try {
    raw = await chat(
      [
        { role: "system", content: `${SYSTEM}\n\nCATALOG:\n${CATALOG()}` },
        { role: "user", content: request },
      ],
      { temperature: 0, maxTokens: 300 },
    );
  } catch {
    return keywordIntent(request);
  }

  // Models wrap JSON in prose or a fence however firmly you ask them not to.
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return keywordIntent(request);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return keywordIntent(request);
  }

  // A journey we never built is worse than a wrong guess: it would "run" and
  // test nothing. Verify against the catalog and fall back rather than trust.
  const flow = UI_FLOWS.find((f) => f.key === parsed.flowKey);
  if (!flow) {
    const fb = keywordIntent(request);
    fb.reasoning = `The model asked for "${String(parsed.flowKey)}", which is not a journey that exists — routed by keyword instead.`;
    return fb;
  }

  return {
    flowKey: flow.key,
    flowLabel: flow.label,
    lineItems: flow.usesLineItems ? clampInt(parsed.lineItems, 1, 50) : undefined,
    boqItems: flow.boq ? clampInt(parsed.boqItems, 1, 200) : undefined,
    template: typeof parsed.template === "string" && parsed.template.trim() ? parsed.template.trim() : undefined,
    scheduleMinutes: clampInt(parsed.scheduleMinutes, 1, 10_080),
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : `Chose ${flow.label}.`,
    source: "llm",
    caveat: caveatFor(request, flow.key),
  };
}
