/**
 * STORED API PLANS — compiled once, validated in code, run without a model.
 *
 * Some written API cases only compile to a full plan with the API test
 * compiler's model (src/agents/apiPlanner.ts): the library has no case that
 * sends their request, and no fixed rule matches their words. Compiling them
 * at run time means every run spends model tokens and can come out different.
 * So they are compiled ONCE (fast tier — scripts/compile-api-plans.ts), the
 * plan is checked by the planner's own validator (validatePlan: every op,
 * placeholder, read path and assertion must exist), and the validated plan is
 * stored here as data:
 *
 *   data/compiled-plans/api/<CASE-ID>.json   { meta, plan }
 *   data/compiled-plans/api/index.json       every case tried: full / partial / none, and why
 *
 * Only a plan the compiler judged FULL coverage counts as runnable; a partial
 * one is stored with its named gaps so a person can see what is missing, and
 * is never counted. At run time the stored plan is validated again (the
 * vocabulary may have moved since) before anything is sent.
 *
 * This module only reads files — routing (caseRouting.ts) asks it, without a
 * model and without the planner, whether a case has a stored full plan.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const COMPILED_API_DIR = join(here, "..", "..", "data", "compiled-plans", "api");

export interface StoredPlanMeta {
  caseId: string;
  title: string;
  compiledAt: string;
  /** the compiler's PLAN_VERSION when it was stored */
  planVersion: number;
  /** what produced it: "llm-fast" (model, fast tier), "library-case", "rules" */
  source: string;
  coverage: "full" | "partial" | "none";
  gaps: string[];
  warnings: string[];
  /** validatePlan answered ok when it was stored */
  validated: boolean;
  /** endpoints the plan sends, "METHOD /route/:id" */
  endpoints: string[];
  llm?: { calls: number; promptTokens: number; completionTokens: number; usd: number };
}

export interface StoredPlan {
  meta: StoredPlanMeta;
  plan: any;
}

let cache: Map<string, StoredPlan> | null = null;

function load(): Map<string, StoredPlan> {
  if (cache) return cache;
  cache = new Map();
  if (!existsSync(COMPILED_API_DIR)) return cache;
  for (const f of readdirSync(COMPILED_API_DIR)) {
    if (!f.endsWith(".json") || f === "index.json") continue;
    try {
      const sp = JSON.parse(readFileSync(join(COMPILED_API_DIR, f), "utf8")) as StoredPlan;
      if (sp?.meta?.caseId && sp.plan) cache.set(sp.meta.caseId, sp);
    } catch {
      /* a damaged file is simply not a stored plan */
    }
  }
  return cache;
}

/** Forget what was read (after the compile script writes new plans). */
export function reloadStoredPlans(): void {
  cache = null;
}

/** The stored plan for a catalog case, if one exists. */
export function storedApiPlan(caseId: string): StoredPlan | undefined {
  return load().get(caseId);
}

/** True when a validated, FULL-coverage plan is stored for this case. */
export function hasStoredFullPlan(caseId: string): boolean {
  const sp = load().get(caseId);
  return !!sp && sp.meta.validated && sp.meta.coverage === "full";
}

/**
 * Gaps that are about the case's own point. A partial plan with one of these
 * runs, but its pass or fail says nothing about the case: it expects another
 * outcome than the case does ("the case reads as refused, the plan checks
 * accepted"), checks only that the app does not crash where the case wants a
 * refusal, needs a caller or a starting state no run builds, sends a request
 * the actor's app may not send, or was compiled by a fixed rule nobody read.
 */
const GAP_ABOUT_THE_POINT =
  /the case reads as|documented correct behaviour is a refusal|not a super admin|lacks a permission|needs a starting state|may not call|session, but the plan sends it as|decisive step|cannot be executed|compiled by a fixed rule/i;

/** A case that is itself about the app not erroring — the one kind a "no server error" plan speaks for. */
const ABOUT_NO_SERVER_ERROR = /server error|\b5\d\d\b|5xx|crash|handled (safely|cleanly)|gracefully|robust|answers cleanly/i;

/**
 * True when a run of the case's plan speaks for the case: the plan is full, or
 * partial only at the edges (it does not read the record back, it checks the
 * data and not the page, a part about a PDF or an e-mail is out of its reach).
 *
 * A plan that checks only "the app answers without a server error" speaks for
 * a case about exactly that and no other — even when the compiler calls it
 * full. 15 Oct: API-BID-036 "two vendors' bids coexist and rank correctly"
 * compiled "full" from its library case as a no-5xx check; a pass said nothing
 * about the ranking.
 *
 * The stored plan is judged; a case with none (a full plan built by rules,
 * never stored) is judged by `compiled`, its compile without the model.
 */
export function planSpeaksForCase(caseId: string, caseText: string, compiled?: { plan: any; coverage: string; gaps?: string[] } | null): boolean {
  const sp = load().get(caseId);
  const p = sp
    ? { ok: sp.meta.validated, plan: sp.plan, coverage: sp.meta.coverage, gaps: sp.meta.gaps ?? [] }
    : compiled?.plan
      ? { ok: true, plan: compiled.plan, coverage: compiled.coverage, gaps: compiled.gaps ?? [] }
      : null;
  if (!p || !p.ok) return false;
  if (p.plan?.expected?.outcome === "no-5xx" && !ABOUT_NO_SERVER_ERROR.test(caseText)) return false;
  if (p.coverage === "full") return true;
  return p.coverage === "partial" && !p.gaps.some((g: string) => GAP_ABOUT_THE_POINT.test(g));
}

/** Every stored plan. */
export function allStoredApiPlans(): StoredPlan[] {
  return [...load().values()];
}

/**
 * What a model-compiled plan gets wrong that the planner's validator does not
 * look at — checked in code before a plan is stored, and again before it runs:
 *
 *   • a step sent by an actor whose APP may not call that endpoint (the buyer's
 *     console token on POST /v1/bids): refused 401 at the app gate before any
 *     rule the case is about, and that 401 signs the session out
 *     (appAccess.ts, actors.ts). Seen 2026-10-03 on API-BID-004;
 *   • a case whose caller must NOT be a super admin / Procol employee / the
 *     owner, when every run acts as the client's own super-admin buyer. Seen
 *     2026-10-03 on API-XPUB-061: "extend an expired stage without reopen
 *     permission" ran as a super admin, who may reopen, and read as a bug.
 *
 * Returns the problems in words; empty when the plan can run as this case.
 */
export async function storedPlanProblems(plan: any, caseText: string): Promise<string[]> {
  const out: string[] = [];
  const [{ OPS, libraryActProblems }, { loadCases, heldCases }, { appRefusal }, { vendorAppRefusal }] = await Promise.all([
    import("../agents/apiPlanner.js"),
    import("./caseLibrary.js"),
    import("./appAccess.js"),
    import("./actors.js"),
  ]);
  const lib = new Map([...loadCases(), ...heldCases()].map((c: any) => [c.id, c]));
  const steps = [...(plan?.act ?? []), ...(plan?.verify ?? [])];
  for (const st of steps) {
    let method: string | undefined;
    let path: string | undefined;
    const op = (OPS as any)[st?.op];
    if (st?.op === "library") {
      const lc: any = lib.get(st.caseId);
      method = lc?.method;
      path = lc?.path;
    } else if (op?.method) {
      method = op.method;
      path = op.path;
    }
    if (!method || !path) continue;
    const actor = st.as ?? op?.actor ?? "buyer";
    const why = actor === "buyer" ? appRefusal("console", method, String(path).split("?")[0]) : vendorAppRefusal(method, path);
    if (why) out.push(`the plan has the ${actor} send ${method} ${String(path).split("?")[0]}, but ${why}`);
  }
  if (/\bnot (?:a )?super[ _-]?admin\b|\bnot Procol employee\b|\bnormal buyer\b|\bwithout (?:update|create|reopen) permission\b|\bcaller without\b|\banother buyer\b|\bnot the (?:event )?owner\b/i.test(caseText))
    out.push("the case needs a caller who is not a super admin (or lacks a permission), and every run acts as the client's own super-admin buyer — a refusal it expects may legitimately not happen");
  // a library request sent as the wrong actor, or from a starting state no recipe builds
  out.push(...libraryActProblems(plan));
  return out;
}
