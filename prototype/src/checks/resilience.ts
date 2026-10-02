/**
 * RESILIENCE — how the journey keeps going when a step fails, without ever
 * hiding the failure.
 *
 * A journey used to be a straight walk: the first refusal stopped the event
 * and every step after it was "not run". That is right for a real defect and
 * wrong for the common case where the DATA the platform picked does not fit
 * this client — Demo Account 2 has no unit "kg", so "Add the pricing round"
 * is refused with “The unit kg is not present” and the whole event, bid and
 * award are never tested. A tester would pick another unit and carry on, and
 * would still write the first refusal down.
 *
 * So each failed step is CLASSIFIED (deterministically, from the HTTP status,
 * the app's error code and its message — see RULES), and the class decides
 * what happens next:
 *
 *   environment       502/503/504, timeouts, no reply       → the same request again, with backoff
 *   timing            window closed / not yet over          → rebuild on a fresh, longer clock
 *   data-choice       a unit / product / template / location / vendor this
 *                     client cannot use                     → the next option (max 3 per choice)
 *   product-defect    5xx, or a 2xx that did not do the job → recorded; that branch stops
 *   expected-refusal  a clean 4xx with nothing else to try  → the normal verdict
 *   access            not signed in / not allowed           → the normal verdict
 *
 * Every failed try is kept on the step (`attempts`) and listed as a finding,
 * with a plain reason, whether or not a later try got past it.
 *
 * Nothing here talks to the network: it is the rule table, the ranking of
 * alternatives, the bookkeeping of what was tried, and the watchdog.
 */

import type { ChoiceKind, FailureClass, JourneyStepRecord, StepKind } from "./journeyModel.js";
import { CHOICE_WORD } from "./journeyModel.js";

// ── bounds ─────────────────────────────────────────────────────────────────

export const BOUNDS = {
  /** a request step: at most three sibling calls of 30 s each, plus margin */
  stepMs: 150_000,
  /** a sign-in step: generate + up to four verify codes + a terms retry, 30 s each */
  loginStepMs: 240_000,
  /** the wait for the bidding window — the wait step's own cap plus margin */
  waitCapMs: 5 * 60_000,
  /** the whole journey, retries and rebuilds included */
  journeyMs: 30 * 60_000,
  maxAlternativesPerChoice: 3,
  /** in-place retries with another option + event rebuilds, all choices together */
  maxBacktracks: 6,
  /** tries of the same request after an environment failure, per step */
  maxSameRequestRetries: 2,
} as const;

/** backoff before the k-th (1-based) retry of the same request */
export const backoffMs = (k: number) => [2_000, 5_000, 10_000][Math.min(k - 1, 2)];

export class WatchdogTimeout extends Error {
  constructor(public readonly label: string, public readonly ms: number) {
    super(`${label} did not finish within ${Math.round(ms / 1000)} s — the platform stopped waiting for it`);
  }
}

/**
 * Resolves with the promise, or rejects with `WatchdogTimeout` after `ms`.
 * The work itself cannot be cancelled; it is abandoned, and the caller must
 * not rely on anything it would still write.
 */
export function withWatchdog<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const bound = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new WatchdogTimeout(label, ms)), ms);
  });
  return Promise.race([p, bound]).finally(() => timer && clearTimeout(timer));
}

// ── the classifier ─────────────────────────────────────────────────────────

export interface ClassRule {
  id: string;
  cls: FailureClass;
  /** the choice to blame, for a data-choice / timing rule */
  choice?: ChoiceKind;
  /** HTTP statuses the rule applies to (any, when absent) */
  status?: number[];
  /** the app's error codes (en-IN.yml api_errors) — any one matches */
  codes?: string[];
  /** the app's message — tested case-insensitively */
  match?: RegExp;
  /** only for these steps */
  steps?: StepKind[];
  /** code AND message must both match (default: either) */
  both?: boolean;
  /** why, in words, for the reason text */
  why: string;
}

const LOGIN_STEPS: StepKind[] = ["vendor_login"];
const STAGE_STEPS: StepKind[] = ["add_stage_rfp", "add_stage_pricing"];

/**
 * The rule table, first match wins. Codes and messages are from procol-backend
 * config/locales/en-IN.yml (api_errors) and the messages seen in spine.ai's
 * own run history; codes are reused across features in that file, so a rule
 * with a code also carries the message it means where the code alone is
 * ambiguous (`both`).
 */
export const RULES: ClassRule[] = [
  // environment — the same request, again
  { id: "ENV-NO-REPLY", cls: "environment", status: [0], why: "no reply came back (a network error or a timeout)" },
  { id: "ENV-GATEWAY", cls: "environment", status: [502, 503, 504], why: "the server's gateway did not answer" },
  { id: "ENV-RATE", cls: "environment", status: [429, 408], why: "the server asked the platform to slow down" },
  { id: "ENV-MAINTENANCE", cls: "environment", codes: ["0", "171", "181", "513", "876"], match: /under maintenance|try again (after|in) some ?time/i, both: true, why: "the app said to try again later" },

  // product defects — recorded, not retried
  { id: "DEF-5XX", cls: "product-defect", status: [500, 501, 505], why: "an untyped server error is always a defect" },

  // units (code 495 = trade_template_helper.rb transform_trade_product)
  { id: "UNIT-NOT-PRESENT", cls: "data-choice", choice: "unit", codes: ["495", "574", "559", "486"], match: /\bunits? .* (is|are) not present|unit not found|unit cannot be blank|same unit as requested|multiple units|unit (is )?not (available|valid|allowed)/i, why: "the unit on the line item is not one this company can use" },

  // products / qualities
  { id: "PRODUCT-UNUSABLE", cls: "data-choice", choice: "product", codes: ["80", "500", "508", "760", "16", "569", "907", "834"], match: /product (not found|category not found)|not allowed to bid on this product|free text product|not available for selection|products have been updated|no valid products|(variant|quality) .*(not found|invalid|inactive)/i, why: "the product (or its quality) cannot be used for this event" },

  // templates — pricing or technical, by the step that sent it
  { id: "TEMPLATE-TECH", cls: "data-choice", choice: "technicalTemplate", steps: ["add_stage_rfp", "vendor_open_technical", "tech_start", "tech_answer", "tech_submit"], codes: ["477", "758", "840", "773", "1133"], match: /template (not found|response validation failed)|update the template|template .*(not configured|invalid|inactive)|vendor assessment is not created/i, why: "the technical template cannot be used here" },
  { id: "TEMPLATE-PRICING", cls: "data-choice", choice: "pricingTemplate", codes: ["477", "758", "840"], match: /template not found|update the template|template .*(not configured|invalid|inactive)/i, why: "the pricing template cannot be used here" },

  // delivery locations
  { id: "LOCATION-MISSING", cls: "data-choice", choice: "location", codes: ["125", "150", "483"], match: /delivery location not found|no delivery details|buyer ?hub .*not found|not authorized to add delivery location|location .*(not found|missing|inactive)/i, why: "the delivery location is missing or cannot be used" },

  // vendors — the invited company, or the person who signs in for it
  { id: "VENDOR-NOT-INVITABLE", cls: "data-choice", choice: "vendor", codes: ["509", "494", "1124", "778", "588", "755", "137"], match: /category not valid for vendor|no vendors found|inactive vendor profile|send invite for the company|unverified vendor|blacklisted vendor|vendor and client cannot be same/i, why: "the invited vendor cannot take part in this event" },
  { id: "VENDOR-CANNOT-SIGN-IN", cls: "data-choice", choice: "vendor", steps: LOGIN_STEPS, codes: ["705", "6", "391"], match: /registered email|invalid otp|terms of use|no user account|invalid phone|not authori[sz]ed/i, why: "no one can sign in for the invited vendor" },

  // limits of the account — nothing else to pick
  { id: "LIMIT-ACCOUNT", cls: "data-choice", choice: "limit", codes: ["511", "798", "761", "762", "493", "17"], match: /participants limit|line items? .*limit|maximum .*line items|limit of active licenses|maximum objects limit|maximum number of/i, why: "the account's own limit" },

  // the clock
  { id: "TIMING-WINDOW", cls: "timing", choice: "timing", codes: ["712", "245", "238", "248", "195", "507", "496", "102", "780"], match: /duration exceeds|time difference|invalid time|expired event|order is now closed|bid(ding)? (submission )?time is over|bidding (has )?(ended|closed)|event (has )?(ended|closed|expired)/i, why: "the bidding window was not what the step needed" },
  { id: "TIMING-TOO-EARLY", cls: "timing", codes: ["720", "9", "741"], match: /not allowed to award in bidding time|wait for the bidding to end|only in evaluation time/i, why: "the step came before the bidding window had closed" },

  // access — no retry
  { id: "ACCESS", cls: "access", status: [401, 403], why: "the user is not signed in or not allowed to do this" },
  { id: "ACCESS-MSG", cls: "access", codes: ["461"], match: /not authori[sz]ed|session expired|permission denied/i, why: "the user is not allowed to do this" },
];

export interface Classified {
  cls: FailureClass;
  rule: string;
  choice?: ChoiceKind;
  why: string;
}

/**
 * Classify one step record. A worked or not-run step has no class. A 2xx that
 * did not carry what the step needed ("broken" with a status below 300) is a
 * product defect: the app said yes and did not do it.
 */
export function classifyStep(rec: Pick<JourneyStepRecord, "kind" | "verdict" | "status" | "errorCode" | "message">): Classified | undefined {
  if (rec.verdict === "worked" || rec.verdict === "not-run") return undefined;
  const status = rec.status ?? 0;
  if (status >= 200 && status < 300) return { cls: "product-defect", rule: "DEF-WRONG-ACCEPT", why: "the app answered success but did not do what the step needed" };
  const code = rec.errorCode;
  const msg = rec.message ?? "";
  for (const r of RULES) {
    if (r.steps && !r.steps.includes(rec.kind)) continue;
    if (r.status && !r.status.includes(status)) continue;
    const hasTest = !!(r.codes || r.match);
    if (hasTest) {
      const byCode = !!(r.codes && code !== undefined && r.codes.includes(code));
      const byMsg = !!(r.match && r.match.test(msg));
      const hit = r.both ? (r.codes ? byCode : true) && (r.match ? byMsg : true) : byCode || byMsg;
      // a code alone is trusted only when it is not also some other message's code
      if (!hit) continue;
      if (!r.both && byCode && !byMsg && r.match && msg && !codeOnlyTrusted(code!)) continue;
    }
    return { cls: r.cls, rule: r.id, choice: r.choice, why: r.why };
  }
  if (status >= 400 && status < 500) return { cls: "expected-refusal", rule: "REFUSED-4XX", why: "the app refused the request cleanly" };
  return { cls: "product-defect", rule: "DEF-OTHER", why: `an unexpected HTTP ${status}` };
}

/**
 * Codes the yml file gives to exactly one of the meanings above. Others (455,
 * 6, 2…) are reused for unrelated messages, so for them the message decides.
 */
const TRUSTED_CODES = new Set(["495", "574", "559", "486", "477", "125", "712", "509", "511", "798", "761", "705"]);
const codeOnlyTrusted = (code: string) => TRUSTED_CODES.has(code);

// ── which step makes which choice ──────────────────────────────────────────

/** The steps that SEND each choice; the first one in a plan is where it is made. */
export const CHOICE_CONSUMERS: Record<ChoiceKind, StepKind[]> = {
  unit: ["create_draft", "add_stage_pricing", "bid_products", "surrogate_rfq", "counter_offer", "convert_auction"],
  product: ["create_draft", "add_stage_pricing", "bid_products", "surrogate_rfq", "counter_offer", "convert_auction"],
  location: ["add_stage_pricing", "bid_products", "surrogate_rfq", "counter_offer", "convert_auction"],
  pricingTemplate: ["add_stage_pricing", "convert_auction"],
  technicalTemplate: ["add_stage_rfp"],
  vendor: ["add_stage_rfp", "add_stage_pricing", "publish", "vendor_login"],
  timing: ["create_draft"],
  limit: [],
};

/** The choices a step's record lists under "built from". */
export const STEP_CHOICES: Partial<Record<StepKind, ChoiceKind[]>> = {
  create_draft: ["product", "unit"],
  add_stage_rfp: ["technicalTemplate", "vendor"],
  add_stage_pricing: ["pricingTemplate", "product", "unit", "location", "vendor"],
  publish: ["vendor"],
  vendor_login: ["vendor"],
  bid_products: ["unit", "location"],
  surrogate_rfq: ["unit", "location"],
  counter_offer: ["unit", "location"],
  convert_auction: ["pricingTemplate", "unit", "location"],
};

/**
 * Where to go back to for a new value of `choice`, when step `failedAt` (an
 * index into `kinds`) failed because of it:
 *  - in place, when the failing step is the first to send that choice and a
 *    refusal created nothing (a new template for a refused round);
 *  - else back to the draft, rebuilding the event, because the choice is
 *    already baked into what the earlier steps created (a line item raised
 *    in "kg" cannot be priced in "Nos").
 * Undefined when there is nowhere to go back to.
 */
export function backtrackOrigin(kinds: StepKind[], failedAt: number, choice: ChoiceKind): number | undefined {
  const consumers = CHOICE_CONSUMERS[choice];
  if (!consumers.length) return undefined;
  const firstUse = kinds.findIndex((k) => consumers.includes(k));
  if (firstUse === -1) return undefined;
  if (firstUse === failedAt && choice !== "timing") return failedAt;
  const draft = kinds.indexOf("create_draft");
  return draft >= 0 && draft <= failedAt ? draft : undefined;
}

// ── the options to try ─────────────────────────────────────────────────────

export interface ChoiceOption {
  /** what is sent: a uuid, a unit symbol, a number of seconds */
  value: string;
  /** what a reader is told */
  label: string;
  /** product: the quality uuid; vendor: the login email */
  extra?: Record<string, string>;
}

/**
 * The options for each choice, the current one first, and which have been
 * tried. `next` hands out at most `maxAlternativesPerChoice` new options per
 * choice; a choice with no list has nothing to move on to.
 */
export class ChoiceBook {
  private lists = new Map<ChoiceKind, ChoiceOption[]>();
  private pos = new Map<ChoiceKind, number>();
  private used = new Map<ChoiceKind, number>();

  constructor(private readonly maxAlternatives: number = BOUNDS.maxAlternativesPerChoice) {}

  /** Sets the ranked list; the current option is kept first (added if missing). */
  setOptions(kind: ChoiceKind, current: ChoiceOption, ranked: ChoiceOption[]): void {
    const seen = new Set<string>([norm(current.value)]);
    const list = [current];
    for (const o of ranked) {
      if (seen.has(norm(o.value))) continue;
      seen.add(norm(o.value));
      list.push(o);
    }
    this.lists.set(kind, list);
    if (!this.pos.has(kind)) this.pos.set(kind, 0);
  }

  current(kind: ChoiceKind): ChoiceOption | undefined {
    return this.lists.get(kind)?.[this.pos.get(kind) ?? 0];
  }

  /** Options not yet tried, within the cap. */
  remaining(kind: ChoiceKind): number {
    const list = this.lists.get(kind) ?? [];
    const left = list.length - 1 - (this.pos.get(kind) ?? 0);
    return Math.max(0, Math.min(left, this.maxAlternatives - (this.used.get(kind) ?? 0)));
  }

  /** Moves to the next option and returns it; undefined when none is left. */
  advance(kind: ChoiceKind): ChoiceOption | undefined {
    if (!this.remaining(kind)) return undefined;
    const p = (this.pos.get(kind) ?? 0) + 1;
    this.pos.set(kind, p);
    this.used.set(kind, (this.used.get(kind) ?? 0) + 1);
    return this.lists.get(kind)![p];
  }

  /** The options by choice, in words, for the record. */
  summary(): Partial<Record<ChoiceKind, string[]>> {
    const out: Partial<Record<ChoiceKind, string[]>> = {};
    for (const [k, list] of this.lists) out[k] = list.slice(0, this.maxAlternatives + 1).map((o) => o.label);
    return out;
  }

  has(kind: ChoiceKind): boolean {
    return this.lists.has(kind);
  }
}

const norm = (s: string) => s.trim().toLowerCase();

/** Units a buyer most often raises a line item in, as the fallback order. */
const COMMON_UNITS = ["Nos", "Pcs", "EA", "Each", "Unit", "Units", "Set", "KG", "No.", "Box", "Lot"];

/**
 * The units to try, best first: the product's own units that the company
 * also lists, then the common ones the company lists, then anything else it
 * lists. A unit the company does not list is never offered — the backend
 * checks the line item's unit against exactly that list (`Unit.for_company`).
 */
export function rankUnits(companyUnits: string[], productUnits: string[]): string[] {
  // "Set" and "Set " can both be listed; the clean spelling wins.
  const listed = new Map<string, string>();
  for (const u of companyUnits) {
    const k = norm(u);
    const had = listed.get(k);
    if (!had || (had !== had.trim() && u === u.trim())) listed.set(k, u);
  }
  const out: string[] = [];
  const add = (u: string) => {
    const hit = listed.get(norm(u));
    if (hit && !out.some((x) => norm(x) === norm(hit))) out.push(hit);
  };
  productUnits.forEach(add);
  COMMON_UNITS.forEach(add);
  // then plain alphabetic symbols (not "24.2", "0", "-")
  companyUnits.filter((u) => /^[A-Za-z][A-Za-z .]*$/.test(u.trim())).forEach(add);
  return out;
}

/** Whether the company lists a unit (the backend compares symbols case-insensitively). */
export const unitListed = (companyUnits: string[], unit: string) => companyUnits.some((u) => norm(u) === norm(unit));

/**
 * Pricing templates: Procol's default "Buy" template first, then the
 * company's saved ones; never "Sell" (a sell order) or BOQ templates (they
 * carry their own widgets, which the journey's body does not send).
 */
export function rankTemplates<T extends { name: string; source: string }>(list: T[], kind: "pricing" | "technical"): T[] {
  const bad = kind === "pricing" ? /\b(sell|boq|lot|service)\b/i : /\b(onboarding|registration|creation|boq|nfa)\b/i;
  const good = kind === "pricing" ? /\bbuy\b/i : /\b(technical|rfp|rfi)\b/i;
  const ok = list.filter((t) => !bad.test(t.name));
  return [...ok.filter((t) => t.source === "default" || good.test(t.name)), ...ok.filter((t) => !(t.source === "default" || good.test(t.name)))];
}

// ── the reason, in words ───────────────────────────────────────────────────

/** “Adding the pricing round with unit “KG” failed: the app said “…” (HTTP 422).” */
export function failureSentence(rec: Pick<JourneyStepRecord, "title" | "status" | "message" | "verdict">, choice?: ChoiceKind, value?: string): string {
  const what = rec.title.charAt(0).toLowerCase() + rec.title.slice(1);
  const withWhat = choice && value && choice !== "limit" ? ` with ${CHOICE_WORD[choice]} “${value}”` : "";
  const said = rec.message
    ? `the app said “${rec.message}”${rec.status ? ` (HTTP ${rec.status})` : ""}`
    : rec.status
      ? `the app answered HTTP ${rec.status}`
      : "no reply came back";
  return `Trying to ${what}${withWhat} failed: ${said}.`;
}

/** Whose fault a failed try looks like, in one sentence. */
export function blameSentence(c: Classified, company: string, extra?: string): string {
  switch (c.cls) {
    case "environment":
      return `This looks like the environment, not the product — ${c.why}; it may not happen next time, and it is recorded so a pattern shows up.`;
    case "timing":
      return `The bidding window did not suit the step — ${c.why}.`;
    case "data-choice":
      return extra ?? `The ${c.choice ? CHOICE_WORD[c.choice] : "data"} the platform picked cannot be used at ${company} — ${c.why}. If ${company} should accept it, this is a product bug.`;
    case "product-defect":
      return `This is a product defect — ${c.why}.`;
    case "access":
      return `The app did not let this user do it — ${c.why}.`;
    default:
      return `The app refused it cleanly and there was nothing else to try.`;
  }
}
