/**
 * THE APP'S OWN RULES — is a refusal the product enforcing a rule, or the product misbehaving?
 *
 * appRules.json is generated from procol-client-dashboard (scripts/build-app-rules.ts): every
 * message the dashboard deliberately shows when it refuses something, with its source line.
 * A refusal in those words is the app working as built. What it means for a run depends on
 * the case:
 *   • the case EXPECTS that refusal (a negative case)       → it is the verdict;
 *   • the run's own setup broke the rule (a positive case)  → recover: satisfy the rule and
 *     retry — RECOVERY below says how, from the code that raises it;
 *   • no recovery is known                                    → stop, with the rule named.
 * Words that are NOT in the catalog are not explained by the code: only those can point at a
 * product problem, and only after a fresh-state re-run reproduces them.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PlanStep } from "../plan/steps.js";

export type AppRule = { message: string; source: string; via: string; condition?: string };

const here = dirname(fileURLToPath(import.meta.url));
let cache: AppRule[] | null = null;
function rules(): AppRule[] {
  if (cache) return cache;
  const f = join(here, "appRules.json");
  cache = existsSync(f) ? ((JSON.parse(readFileSync(f, "utf8")).rules ?? []) as AppRule[]) : [];
  return cache;
}

const norm = (s: string) => s.toLowerCase().replace(/[“”"'`!.]/g, "").replace(/\{\{[^}]+\}\}/g, " ").replace(/\s+/g, " ").trim();

/** The app rule whose message this text is (exact, or one contains the other), or null. */
export function appRuleFor(text: string | null | undefined): AppRule | null {
  const t = norm(String(text ?? ""));
  if (t.length < 8) return null;
  let best: AppRule | null = null;
  for (const r of rules()) {
    const m = norm(r.message);
    if (!m || m.length < 8) continue;
    if (t === m) return r;
    if ((t.includes(m) && m.length >= 14) || (m.includes(t) && t.length >= 14)) {
      if (!best || m.length > norm(best.message).length) best = r;
    }
  }
  return best;
}

/**
 * How to satisfy a rule the run's own setup broke — from the code that raises it
 * (projectCreation.jsx publish checks, 1597-1730, read 2026-10-08). Only rules a test can
 * break by what it did or left out are here; anything else stops the run with the rule named.
 */
export const RECOVERY: Array<{ when: RegExp; why: string; steps: PlanStep[] }> = [
  { when: /please (fill project title|enter title)/i, why: "the event needs a title", steps: [{ step: "set_title" }] },
  { when: /add participants to proceed|select atleast one participant/i, why: "publishing needs at least one participant", steps: [{ step: "invite_vendor", args: { count: 1 } }] },
  {
    when: /rfp duration exceeds rfq end time/i,
    why: "the technical stage must end no later than the RFQ; the schedule step puts every stage on the same Duration window",
    steps: [{ step: "set_schedule" }],
  },
  { when: /please add end time for the event|please select an event schedule time/i, why: "every stage needs a schedule", steps: [{ step: "set_schedule" }] },
  { when: /sheet partially filled/i, why: "every mandatory sheet cell must be filled", steps: [{ step: "fill_sheet" }] },
  {
    when: /please add evaluator/i,
    why: "a technical stage needs an evaluator (for the lot, or for every line item)",
    steps: [{ step: "switch_stage", args: { stage: "rfp" } }, { step: "assign_evaluator" }],
  },
  {
    when: /some sections are empty|errors in vendor specific sections/i,
    why: "the technical questionnaire sections must be filled",
    steps: [{ step: "switch_stage", args: { stage: "rfp" } }, { step: "fill_questionnaires" }],
  },
  { when: /choose a template and add a product/i, why: "a stage needs a template and a product before participants and publish", steps: [{ step: "select_template" }, { step: "add_line_items", args: { count: 1 } }] },
  { when: /select a valid column for savings/i, why: "the savings column comes from the template — the stage has none", steps: [{ step: "select_template" }] },
  // LAST, so the specific ones above win: anything else this client makes mandatory (Payment Terms, T&C, a custom
  // field, a date, a dropdown) is filled on screen — a client switch must not stop a run at a basic field (29 Oct).
  {
    when: /\b(mandatory|required)\b|please (fill|select|add|enter|choose|provide)|can(no|')t be (empty|blank)|cannot be empty|\bis empty\b|\bare empty\b/i,
    why: "this client makes it mandatory — the run fills it",
    steps: [{ step: "fill_required" }],
  },
];

/** fill_required carries the app's own words, so it can open the control they name. */
export function recoveryWith(text: string): { why: string; steps: PlanStep[] } | null {
  const r = recoveryFor(text);
  if (!r) return null;
  return { why: r.why, steps: r.steps.map((st) => (st.step === "fill_required" ? { ...st, args: { ...(st.args ?? {}), said: text } } : st)) };
}

export function recoveryFor(text: string): { why: string; steps: PlanStep[] } | null {
  const r = RECOVERY.find((x) => x.when.test(text));
  return r ? { why: r.why, steps: r.steps } : null;
}

/** Steps that assert a refusal: a plan holding one is a negative case — a refusal is its verdict, never something to recover from. */
export const BLOCK_ASSERTIONS = new Set(["expect_publish_blocked", "expect_error", "expect_message", "attempt", "expect_field_error"]);
