/**
 * THE LAYER DECIDER — where can each expectation of a written case actually be
 * observed? (docs/ui-automation-design.md §1)
 *
 * A written case is split into its assertions ("the bid is refused", "the
 * Submit button is disabled", "the total shows ₹1,43,980") and each one is
 * tagged with the cheapest layer that can observe it:
 *
 *   api   a rule or data — refused / accepted / status / stored / total / rank
 *   ui    what a person sees or can do — visible, label, disabled, toast,
 *         tooltip, order, formatting, navigation, empty state
 *   both  the data changed AND the person must see it: the API holds the truth,
 *         the screen must show it (and the two are cross-checked)
 *
 * The case's layer follows from its assertions: only ui → ui, only api → api,
 * anything else → both. A case with no UI assertion stays API-only even when
 * it was written as a "UI case" — the browser is never used for what the API
 * already proves.
 *
 * Deterministic rules decide almost everything. Only an assertion that no rule
 * recognises (a tie) may be put to the fast-tier model, and only when the
 * caller asks for it; without a model a tie falls back to the case's written
 * layer and says so.
 */
import type { CatalogCase } from "../checks/testCatalog.js";

export type Layer = "api" | "ui" | "both";

export interface Assertion {
  text: string;
  layer: Layer;
  /** the words that decided it, for the report */
  because: string;
  /** "rule" — decided by the vocabulary; "model" — a tie the fast model broke; "fallback" — a tie with no model */
  by: "rule" | "model" | "fallback";
}

export interface LayerDecision {
  id?: string;
  layer: Layer;
  assertions: Assertion[];
  /** how many assertions were ties (no rule recognised them) */
  ties: number;
}

// ── vocabulary ──────────────────────────────────────────────────────────────

/** What only a screen can show: a control's state, a message, a layout, a move between screens. */
const UI_WORDS: Array<[RegExp, string]> = [
  [/\b(visible|invisible|shown|shows?|showing|displayed|displays?|appears?|hidden|hides?|absent from the (menu|list|screen|page|grid))\b/i, "visibility"],
  [/\b(greyed|grayed|disabled|enabled|clickable|read-?only|editable|uneditable|unavailable|not offered|absent|missing)\b/i, "control state"],
  [/\b(tooltip|toast|banner|badge|icon|chip|popover|pop-?up|modal|drawer|dropdown|menu( item)?|button|link|tab|tabs|checkbox|toggle|switch|radio|placeholder|spinner|pencil)\b/i, "a control or element"],
  [/\b(highlight(ed)?|bold|colou?r(ed)?|red|green|eye-?off|cut off|overlap)\b/i, "highlighting"],
  [/\b(redirect(s|ed)?|navigat\w*|lands? on|opens?|re-?opens|reload|refresh(es)? every)\b/i, "navigation"],
  [/\b(label|reads?|says|wording|column|header|row|rows|grid|sheet rows?|footer|panel|screen|page|view|list(s|ed)?)\b/i, "what the screen reads"],
  [/\b(sorted|sorter|order(ed)?|ascending|descending|first|top \d|format(ted)?|rounded|decimal|empty state|prompt)\b/i, "order or formatting"],
  [/\b(offers?|offered|option|options|picker|select(ed)? in)\b/i, "what is offered"],
  [/\b(sees?|see|can see|cannot see|user sees|vendor sees|buyer sees)\b/i, "what a person sees"],
  [/\b(message|error|warning)s? (under|next to|beside|below|on the field|inline)\b|\binline\b|\bfield error\b/i, "a field-level message"],
  [/\b(clear|readable|unpleasant(ly)?|friendly|explains?|explained)\b/i, "how a message reads"],
];

/** What the API proves on its own: a refusal, a stored value, a status, a count. */
const API_WORDS: Array<[RegExp, string]> = [
  [/\b(refused|rejected|refuses|rejects|denied|not allowed|forbidden|accepted|accepts|allowed|succeeds?|completes?|publishes)\b/i, "accepted or refused"],
  [/\b(status( moves| is| becomes| changes)?|moves to|becomes (live|closed|draft|active)|requested|withdrawn|live-and-latest)\b/i, "a status"],
  [/\b(saved|stored|persist(s|ed)?|created|deleted|recorded|unchanged|changes nothing|not created|no-?op|duplicat\w*|idempoten\w*|kept)\b/i, "stored data"],
  [/\b([1-5]\d\d|code \d+|untyped|exception|response|request|payload|body|sends?|sent|server|backend|api|re-?fetch(es)?|polls?|fetch(es|ed)?)\b/i, "the request or response"],
  [/\b(ids?|unique|non-empty|import(s|ed)?|(one|a single|two|\d+) (bid|record|event|proposal)s?)\b/i, "identity or count of records"],
  [/\b(total|sum|computed|rank(ed)?|l1|savings|count|audience|approvers have|tasks|not found|access (is )?refused)\b/i, "a computed value or rule"],
  [/\b(line items|quantit(y|ies)|prices?(?!\s+(drawer|column|field|cell|sheet|tab))|values? as|scores?|amounts?|currency|unit)\b/i, "a data value"],
];

/** Data whose truth lives in the API — when a screen word also appears, the screen must show this data: both. */
const DATA_SHOWN = /\b(line items?|quantit(y|ies)|prices?|totals?|amounts?|scores?|savings|rank|l1|currency|vendor'?s name|bidders?|bidding vendors|participants|audience|template'?s columns|templates?( name)?|questions|schema|values?|status|anonymi[sz]ed|masked|(company )?names|events? (is |are )?listed)\b/i;

/** A quoted message on its own: the screen shows it. A quoted message after "refused" is the API's message. */
const QUOTED = /["“”'‘][^"“”'‘]{6,}["“”'’]/;

function hits(text: string, words: Array<[RegExp, string]>): string[] {
  return words.filter(([re]) => re.test(text)).map(([, why]) => why);
}

/** Split the expected result (and the case's own oracle when it states one) into separate claims. */
export function splitAssertions(text: string): string[] {
  const cleaned = String(text ?? "")
    .replace(/\*\*/g, "")
    .replace(/`[^`]*`/g, (m) => m.replace(/[.;]/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(/;|\.\s+(?=[A-Z"“(])|\s+—\s+|\bthen\b/i)
    .map((s) => s.trim().replace(/^[,.:\s]+|[,.\s]+$/g, ""))
    .filter((s) => s.length >= 3);
}

/** Decide one assertion by the vocabulary; null = a tie no rule recognises. */
export function decideAssertion(text: string, writtenAs: "ui" | "api" = "ui"): { layer: Layer; because: string } | null {
  // The words INSIDE a quoted message are the message's, not the claim's:
  // Toast "Counter offer sent to supplier" is a toast, not a request that was sent.
  // A data word that only names a control ("the quantity box", "the savings card",
  // "no price drawer") is about the control, not the data.
  const bare = text
    .replace(new RegExp(QUOTED.source, "g"), " «message» ")
    .replace(/\b[\w-]+\s+(?=(box|field|column|cell|card|input|drawer|tab|button|badge|chip|icon|filter|picker|dropdown|selector)\b)/gi, "");
  const ui = hits(bare, UI_WORDS);
  const api = hits(bare, API_WORDS);
  // In a case written against the API, a quoted message is the response's message.
  const quoted = QUOTED.test(text) && writtenAs !== "api";
  const refusalMessage = !ui.length && /\b(refused|rejected|fails?|failed)\b[^.]*\b(with|message|\()/i.test(text) && !/\b(readable|clear|toast|inline|shown|displayed)\b/i.test(text);
  // "Refused with that message" / "Refused ("Only active …")" — the API's own message.
  if (refusalMessage) return { layer: "api", because: "a refusal with the API's message" };
  if (ui.length && !api.length) {
    // A screen word that names API data ("the grid renders the line items") is both.
    if (DATA_SHOWN.test(bare) && /\b(shows?|shown|displays?|renders?|visible|appears?|lists?|listed|reads?|sees?|with)\b/i.test(bare))
      return { layer: "both", because: `${ui[0]} of data the API holds` };
    return { layer: "ui", because: ui.join(", ") };
  }
  if (api.length && !ui.length) {
    if (quoted) return { layer: "both", because: `${api[0]} and a message the screen shows` };
    return { layer: "api", because: api.join(", ") };
  }
  if (ui.length && api.length) {
    // A data word alone ("line items") next to a single weak screen word is still both:
    // the API proves the data and the screen must show it.
    return { layer: "both", because: `${api[0]} + ${ui[0]}` };
  }
  if (quoted) return { layer: "ui", because: "a message the screen shows" };
  return null;
}

export interface DecideOptions {
  /** Break ties with the fast-tier model (default false: ties fall back to the written layer). */
  model?: boolean;
}

/** The claims of a case: its expected result (the oracle only when the expected result is empty). */
function claimsOf(c: Pick<CatalogCase, "expected" | "oracle" | "title">): string[] {
  const exp = splitAssertions(c.expected);
  if (exp.length) return exp;
  const or = splitAssertions(c.oracle);
  return or.length ? or : splitAssertions(c.title);
}

function combine(assertions: Assertion[]): Layer {
  const set = new Set(assertions.map((a) => a.layer));
  if (set.has("both") || (set.has("ui") && set.has("api"))) return "both";
  if (set.has("ui")) return "ui";
  return "api";
}

/** Deterministic only — ties fall back to the case's written layer. */
export function decideLayerSync(c: Pick<CatalogCase, "id" | "layer" | "expected" | "oracle" | "title">): LayerDecision {
  const assertions: Assertion[] = [];
  let ties = 0;
  for (const text of claimsOf(c)) {
    const d = decideAssertion(text, c.layer === "api" ? "api" : "ui");
    if (d) assertions.push({ text, ...d, by: "rule" });
    else {
      ties += 1;
      assertions.push({ text, layer: c.layer === "api" ? "api" : "ui", because: `no rule recognises it — the case is written as ${c.layer}`, by: "fallback" });
    }
  }
  if (!assertions.length) return { id: c.id, layer: c.layer === "api" ? "api" : "ui", assertions, ties };
  return { id: c.id, layer: combine(assertions), assertions, ties };
}

/** As decideLayerSync, but a tie may be put to the fast-tier model (opt-in). */
export async function decideLayer(c: Pick<CatalogCase, "id" | "layer" | "expected" | "oracle" | "title">, opts: DecideOptions = {}): Promise<LayerDecision> {
  const d = decideLayerSync(c);
  if (!opts.model || !d.ties) return d;
  const { chat } = await import("../ai/llm.js");
  for (const a of d.assertions) {
    if (a.by !== "fallback") continue;
    try {
      const raw = await chat(
        [
          {
            role: "system",
            content:
              'You classify ONE expectation from a software test case by where it can be observed. Answer with exactly one word: "api" (a rule or stored data: refused, accepted, status, value, count), "ui" (only a screen shows it: visible, disabled, label, message, order, navigation) or "both" (the data changes AND a person must see it).',
          },
          { role: "user", content: `Test case: ${c.title}\nExpectation: ${a.text}` },
        ],
        { tier: "fast", maxTokens: 400 },
      );
      const w = raw.trim().toLowerCase().match(/\b(api|ui|both)\b/)?.[1] as Layer | undefined;
      if (w) Object.assign(a, { layer: w, by: "model", because: "a tie the fast model broke" });
    } catch {
      /* keep the fallback */
    }
  }
  return { ...d, layer: combine(d.assertions) };
}

/** Does the case need the browser at all? */
export const needsBrowser = (d: LayerDecision): boolean => d.layer !== "api";

/** The assertions the screen must observe (ui and both). */
export const screenAssertions = (d: LayerDecision): Assertion[] => d.assertions.filter((a) => a.layer !== "api");
