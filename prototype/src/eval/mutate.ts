/**
 * PLANTED BUGS — known defects injected between UAT and the agent, so detection can be measured
 * against bugs that exist by construction. Procol's code and data are never touched: a reply is
 * changed after UAT sent it, inside our own harness (apiPlanRunner's evaluation hook), and only
 * in the act / verify phases, so the record the case is built on is real.
 *
 * Classes (each applied only where it means something for the plan):
 *   server_error     the case's main call answers 500 — every plan should report it
 *   flipped_outcome  the main call is refused where success was expected, or succeeds where a
 *                    refusal was expected (a missing validation) — plans with an accept/reject outcome
 *   wrong_data       every read-back the case verifies comes back with its values altered (ids,
 *                    uuids and timestamps left alone) — plans with a verify read
 * The mutator records every call it changed; a detection counts only when the agent's failing
 * step is one of them ("the failure points at the right flow").
 */
import type { ApiPlan } from "../agents/apiPlanner.js";
import type { EvalCall, Reply } from "../checks/apiPlanRunner.js";

export type PlantClass = "server_error" | "flipped_outcome" | "wrong_data";

export interface Plant {
  plantClass: PlantClass;
  what: string;
}

/** The planted bugs that make sense for this plan. */
export function plantsFor(plan: ApiPlan): Plant[] {
  const out: Plant[] = [];
  const hasAct = (plan.act ?? []).length > 0;
  const hasVerify = (plan.verify ?? []).length > 0;
  if (hasAct || hasVerify) out.push({ plantClass: "server_error", what: `the ${hasAct ? "act" : "verify"} call answers 500` });
  const o = plan.expected?.outcome;
  if (hasAct && (o === "accept" || o === "reject")) out.push({ plantClass: "flipped_outcome", what: o === "accept" ? "the act call is refused (422) where success was expected" : "the act call succeeds (200) where a refusal was expected" });
  if (hasVerify) out.push({ plantClass: "wrong_data", what: "the verify read-back returns altered values" });
  return out;
}

const ID_KEY = /(^|_)(id|uuid|uuids|ids|ref|ref_id|ref_uuid|token|key)$|_at$|time|date|^(created|updated)/i;

/** Alter every scalar the response carries, except identities and timestamps. Deterministic. */
export function alterValues(v: unknown, key = ""): unknown {
  if (Array.isArray(v)) return v.map((x) => alterValues(x, key));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = ID_KEY.test(k) ? x : alterValues(x, k);
    return out;
  }
  if (typeof v === "number") return Number.isInteger(v) ? v + 7 : Math.round((v * 1.37 + 1) * 100) / 100;
  if (typeof v === "boolean") return !v;
  if (typeof v === "string") {
    if (!v || ID_KEY.test(key) || /^[A-Za-z0-9+/=]{8,12}$/.test(v)) return v; // encoded ids stay
    return `${v}_planted`;
  }
  return v;
}

/** A mutator for one planted bug on one plan, plus the calls it changed. */
export function mutatorFor(plan: ApiPlan, plant: Plant): { mutate: (c: EvalCall, r: Reply) => Reply; touched: EvalCall[] } {
  const touched: EvalCall[] = [];
  const hasAct = (plan.act ?? []).length > 0;
  let mainDone = false;
  // the call the case is decided on: the first call of the DECISIVE act step (as the planner
  // defines it), else the first verify read when the plan has no act. Planting on another act
  // step tests a step the case does not judge (2026-10-15: API-BID-005's refusal comes at the
  // bid's submit, not at opening it).
  const isMain = (c: EvalCall) => !mainDone && (hasAct ? c.phase === "act" && c.decisive : c.phase === "verify");
  const mutate = (c: EvalCall, r: Reply): Reply => {
    // n restarts at 0 on every attempt: the agent re-runs a failure on a second fresh record,
    // and the planted bug must be there again or the confirmation would "pass" and hide it
    if (c.n === 0) mainDone = false;
    if (r.notSent) return r;
    if (plant.plantClass === "server_error" && isMain(c)) {
      mainDone = true;
      touched.push(c);
      return { status: 500, ok: false, data: { error: { message: "planted: internal server error" } }, message: "planted: internal server error", ms: r.ms };
    }
    if (plant.plantClass === "flipped_outcome" && hasAct && c.phase === "act" && c.decisive) {
      if (plan.expected.outcome === "accept" && isMain(c)) {
        mainDone = true;
        touched.push(c);
        return { status: 422, ok: false, data: { error: { code: 990001, message: "planted: refused" } }, code: "990001", message: "planted: refused", ms: r.ms };
      }
      // a missing validation: every refusal the decisive step meets becomes a success
      if (plan.expected.outcome === "reject" && r.status >= 400 && r.status < 500) {
        touched.push(c);
        return { status: 200, ok: true, data: { success: true }, ms: r.ms };
      }
      return r;
    }
    if (plant.plantClass === "wrong_data" && c.phase === "verify" && r.ok && r.data && typeof r.data === "object") {
      touched.push(c);
      return { ...r, data: alterValues(r.data) };
    }
    return r;
  };
  return { mutate, touched };
}
