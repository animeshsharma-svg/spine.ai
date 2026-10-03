/**
 * A REPRODUCIBLE SCENARIO FROM A DEFECT TICKET.
 *
 *   pattern   the ticket matches a hand-written defect pattern: its generic
 *             preconditions, steps and expected result (patterns.ts)
 *   llm       no pattern matched: the Slingring fast tier writes one from the
 *             STRIPPED text (clean tickets only), schema-checked here; kept
 *             in spine.ai's database only, never in the committed catalog
 *   generic   no pattern and no model answer: a placeholder a person fills in
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { findFeature } from "../../config/featureTree.js";
import { FEATURE_GROUP, matchPattern } from "./patterns.js";
import { askFastJson, slingringAvailable } from "./slingringFast.js";
import type { Scenario, StrippedTicket } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
let errorCodes: Record<string, string> | null = null;
function documentedCodes(): Record<string, string> {
  if (errorCodes) return errorCodes;
  try {
    const j = JSON.parse(readFileSync(join(here, "..", "..", "data", "app-errors.json"), "utf8"));
    const e = j.errors ?? {};
    errorCodes = Object.fromEntries(Object.entries(e).map(([k, v]) => [k, typeof v === "string" ? v : String((v as any)?.message ?? "")]));
  } catch {
    errorCodes = {};
  }
  return errorCodes;
}

export function eventTypeOf(lower: string): Scenario["eventType"] {
  const auction = /\bauction\b/.test(lower);
  const rfp = /\brfp\b|technical (?:round|stage|evaluation|bid)/.test(lower);
  const rfq = /\brfq\b|pricing round|commercial (?:round|stage)|quotation/.test(lower);
  if (rfp && auction) return "rfp_auction";
  if (rfp && rfq) return "rfp_rfq";
  if (auction) return "auction";
  if (rfp) return "rfp_only";
  if (rfq) return "rfq_only";
  return "unknown";
}

/** An error code the ticket names AND the backend documents (data/app-errors.json). */
export function documentedCodeIn(lower: string): string | undefined {
  const codes = documentedCodes();
  for (const m of lower.matchAll(/\b(?:error|code|error code)\s*[:#-]?\s*(\d{2,4})\b/g)) if (codes[m[1]]) return m[1];
  return undefined;
}

const EVENT_TYPES = ["rfq_only", "rfp_only", "rfp_rfq", "rfp_auction", "auction", "unknown"] as const;

export function validModelScenario(x: unknown): Pick<Scenario, "preconditions" | "steps" | "expected" | "observed" | "eventType"> | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);
  const pre = s(o.preconditions, 600);
  const exp = s(o.expected, 600);
  const obs = s(o.observed, 600);
  const steps = Array.isArray(o.steps) ? o.steps.map((x) => s(x, 300)).filter((x): x is string => !!x) : [];
  const et = typeof o.eventType === "string" && (EVENT_TYPES as readonly string[]).includes(o.eventType) ? (o.eventType as Scenario["eventType"]) : null;
  if (!pre || !exp || !obs || steps.length < 1 || steps.length > 10 || !et) return null;
  return { preconditions: pre, steps, expected: exp, observed: obs, eventType: et };
}

export async function buildScenario(t: StrippedTicket, featureKey: string | null, opts: { ai: boolean }): Promise<Scenario> {
  const lower = `${t.subject}\n${t.text}`.toLowerCase();
  const p = matchPattern(lower);
  if (p) {
    return {
      pattern: p.id,
      eventType: p.eventType,
      preconditions: p.preconditions,
      steps: p.steps,
      expected: p.expected,
      observed: p.observed,
      clientId: t.clientId,
      errorCode: p.errorCode,
      backendCite: p.backendCite,
      libraryTwin: p.libraryTwin,
      automatable: p.automatable,
      notAutomatableBecause: p.notAutomatableBecause,
      journeyGroup: FEATURE_GROUP[p.feature] ?? "API-XCRT",
    };
  }
  const feature = featureKey ? findFeature(featureKey) : undefined;
  const group = (featureKey && FEATURE_GROUP[featureKey]) || "API-XCRT";
  const code = documentedCodeIn(lower);
  if (opts.ai && slingringAvailable()) {
    const ans = validModelScenario(
      await askFastJson(
        "You turn a Procol support ticket (personal data already removed) into a reproducible QA scenario for a sourcing event " +
          "(RFQ / RFP / auction; buyer and invited vendor). Use QA test data only, never names from the ticket. " +
          'Answer ONLY with JSON: {"preconditions": string, "steps": [string, ...], "expected": string (the CORRECT behaviour), ' +
          '"observed": string (what the customer saw), "eventType": "rfq_only"|"rfp_only"|"rfp_rfq"|"rfp_auction"|"auction"|"unknown"}.',
        `Feature: ${feature ? `${feature.label} — ${feature.what}` : "unknown"}\nTicket subject: ${t.subject}\n\n${t.text.slice(0, 3500)}`,
        600,
      ),
    );
    if (ans) {
      return { pattern: "llm", ...ans, clientId: t.clientId, errorCode: code, automatable: true, journeyGroup: group, modelWritten: true };
    }
  }
  return {
    pattern: "generic",
    eventType: eventTypeOf(lower),
    preconditions: "To be written by a person from the ticket record in spine.ai.",
    steps: ["Follow the steps in the ticket record (stripped of personal data) in spine.ai."],
    expected: `${feature ? feature.label : "The feature"} behaves as documented.`,
    observed: "See the ticket record in spine.ai.",
    clientId: t.clientId,
    errorCode: code,
    automatable: false,
    notAutomatableBecause: "no defect pattern matched and no model-written scenario is available — a person writes the steps",
    journeyGroup: group,
  };
}
