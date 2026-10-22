/**
 * A typed case that starts from an EXISTING event ("on an event where a vendor has bid, …")
 * compiles to a plan that opens that event by route (open_prepared). Run tests used to hand such
 * a plan to the browser with no event behind it, and the run stopped at step 1 with "the API
 * setup did not build one" (8 of 46 prompts, 22 Oct). This builds the state first, the way the
 * Screens page does, so the plan opens a real event in the state the words ask for.
 */
import { buildUiState, type UiState } from "./uiSetup.js";
import { prepFor } from "./uiCasePrep.js";

export interface PlanLike {
  steps?: Array<{ step?: string; args?: Record<string, unknown> }>;
  context?: Record<string, unknown>;
}

/** Which state the words and the plan ask for; null when the plan starts from nothing. */
export function stateForPlan(text: string, plan: PlanLike): { state: UiState; screen: string; technical: boolean; auction?: boolean } | null {
  if (plan.context?.eventGroupUuid) return null; // already built
  const first = plan.steps?.find((s) => s.step === "open_prepared");
  if (!first) return null;
  const screen = String(first.args?.screen ?? "summary");
  const p = prepFor({ id: "typed", group: "", title: text, setup: "", steps: "", expected: "" });
  if (p.ok && p.prepared && p.state !== "none") return { state: p.state, screen, technical: p.technical, auction: p.auction };
  const t = text.toLowerCase();
  const state: UiState = /proposal|nfa/.test(t) || screen === "proposal" ? "proposal" : /award|bids? in|has (already )?bid|vendor('s)? bid|master qcs|compare|responses|analytics|counter offer|l1/.test(t) || /master_qcs|responses|analytics/.test(screen) ? "bid" : /closed|history|expired/.test(t) ? "closed" : /draft/.test(t) ? "draft" : "live";
  return { state, screen, technical: /technical|rfp|questionnaire|evaluat/.test(t) };
}

/** Build that state through the API and return the context the plan needs (or why not). */
export async function contextForPlan(text: string, plan: PlanLike, companyId: number, onLine?: (l: string) => void): Promise<{ context?: Record<string, unknown>; state?: UiState; why?: string }> {
  const need = stateForPlan(text, plan);
  if (!need) return {};
  onLine?.(`building a "${need.state}" event through the API${need.state === "bid" || need.state === "closed" ? " (a vendor's bid in)" : ""} — the case starts from an existing event`);
  const b: any = await buildUiState(companyId, need.state, { technical: need.technical, auction: need.auction, onLine }).catch((e) => ({ ok: false, why: (e as Error).message }));
  const x = b.ok ? b.context : null;
  if (!x) return { state: need.state, why: `the API could not build the ${need.state} state this case starts from: ${b.why}` };
  onLine?.(`event ready: "${x.title ?? x.eventGroupUuid}" (${need.state})${x.vendorName ? ` · vendor ${x.vendorName}` : ""}`);
  return { state: need.state, context: { state: x.state, eventGroupUuid: x.eventGroupUuid, stageUuid: x.stageUuid, technicalStageUuid: x.technicalStageUuid, proposalUuid: x.made?.proposalUuid, title: x.title, vendorName: x.vendorName, vendorEmail: x.vendorEmail, values: x.values, buyerUserId: x.buyerUserId } };
}
