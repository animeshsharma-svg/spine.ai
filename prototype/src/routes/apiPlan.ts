/**
 * The API test compiler, over HTTP.
 *
 *   GET  /api/api-plan/vocabulary
 *        → the plan language: recipes, operations (with the library cases that
 *          prove each endpoint), assertion ops, placeholders, read shapes, limits.
 *
 *   GET  /api/api-plan/compile?text=…   or   ?case=API-XBID-049   [&llm=0] [&reason=1]
 *   POST /api/api-plan/compile  { text | caseId, llm?, reason? }
 *        → CompiledApiPlan: { plan, coverage, gaps, errors, warnings, source,
 *          endpoints, decisiveEndpoint, steps (plain English), llm usage }.
 *          Compiling sends nothing to Procol.
 *
 *   GET  /api/api-plan/run?c=198678&text=… | &case=API-… | &ids=API-…,API-…  [&confirm=0] [&llm=0] [&dry=1]
 *   POST /api/api-plan/run  { c, plan | text | caseId | ids, confirm? }
 *        → server-sent events: compiled · line · step · result · done
 *          Each plan runs on its OWN fresh record (minutes when the setup
 *          builds an event); a failure is re-checked on a second fresh record.
 *          Every result is saved as a normal run (runId in `result`).
 *          Runs here are on QA test vendors only; one plan after another.
 */
import type { RouteHandler } from "./index.js";
import { compileApiPlan, planInWords, validatePlan, vocabulary, type ApiPlan, type CompiledApiPlan } from "../agents/apiPlanner.js";
import { runApiPlan, planResultLine, type SetupInstance } from "../checks/apiPlanRunner.js";

const PREFIX = "/api/api-plan/";
/** one live plan run at a time on this server (each walks a journey) */
let running: string | null = null;

function withWords(c: CompiledApiPlan) {
  return { ...c, words: c.plan ? planInWords(c.plan) : null };
}

export const handle: RouteHandler = async (ctx) => {
  if (!ctx.path.startsWith(PREFIX)) return false;
  const what = ctx.path.slice(PREFIX.length);
  const q = ctx.url.searchParams;
  const isPost = ctx.req.method === "POST";
  const body = isPost ? await ctx.body() : {};
  const llm = (body.llm ?? q.get("llm")) !== false && (body.llm ?? q.get("llm")) !== "0";
  const allowReason = body.reason === true || q.get("reason") === "1";

  if (what === "vocabulary") {
    ctx.json(vocabulary());
    return true;
  }

  if (what === "compile") {
    const text = String(body.text ?? q.get("text") ?? "").trim();
    const caseId = String(body.caseId ?? q.get("case") ?? "").trim();
    if (body.plan) {
      const v = await validatePlan(body.plan);
      ctx.json({ ...v, words: v.ok ? planInWords(v.plan) : null });
      return true;
    }
    if (!text && !caseId) {
      ctx.json({ error: "text or case is required (or a plan to validate)" }, 400);
      return true;
    }
    const c = await compileApiPlan({ ...(text ? { text } : {}), ...(caseId ? { caseId } : {}) }, { llm, allowReason });
    ctx.json(withWords(c));
    return true;
  }

  if (what === "run") {
    const companyId = Number(body.c ?? q.get("c")) || 198678;
    const confirm = (body.confirm ?? q.get("confirm")) !== false && (body.confirm ?? q.get("confirm")) !== "0";
    const dry = body.dry === true || q.get("dry") === "1";
    const inputs: Array<{ text?: string; caseId?: string; plan?: ApiPlan }> = [];
    if (body.plan) inputs.push({ plan: body.plan });
    const text = String(body.text ?? q.get("text") ?? "").trim();
    if (text) inputs.push({ text });
    const one = String(body.caseId ?? q.get("case") ?? "").trim();
    if (one) inputs.push({ caseId: one });
    const ids = (Array.isArray(body.ids) ? body.ids : String(q.get("ids") ?? "").split(",")).map((x: unknown) => String(x).trim()).filter(Boolean);
    for (const id of ids.slice(0, 20)) inputs.push({ caseId: id });
    if (!inputs.length) {
      ctx.json({ error: "plan, text, case or ids is required" }, 400);
      return true;
    }
    const s = ctx.sse();
    if (running && !dry) {
      s.send("fatal", { message: `another plan run is in progress (${running}); one live run at a time` });
      s.end();
      return true;
    }
    const cache = new Map<string, SetupInstance>();
    running = dry ? null : `${inputs.length} plan(s) on ${companyId}`;
    let ran = 0;
    try {
      for (const inp of inputs) {
        let plan: ApiPlan | null = null;
        let compiled: CompiledApiPlan | null = null;
        if (inp.plan) {
          const v = await validatePlan(inp.plan);
          s.send("compiled", { ok: v.ok, errors: v.errors, warnings: v.warnings, plan: v.plan, words: v.ok ? planInWords(v.plan) : null });
          if (v.ok) plan = v.plan;
        } else {
          compiled = await compileApiPlan(inp, { llm, allowReason });
          s.send("compiled", { input: inp, ...withWords(compiled) });
          plan = compiled.plan;
        }
        if (!plan) {
          s.send("result", { input: inp, verdict: "not run", reason: `No runnable plan: ${(compiled?.gaps ?? []).join("; ") || "the plan did not validate"}.` });
          continue;
        }
        if (dry) continue;
        const r = await runApiPlan(plan, {
          companyId,
          confirm,
          setupCache: cache,
          onLine: (line) => s.send("line", { line }),
          onStep: (step) => s.send("step", { step }),
        });
        ran++;
        s.send("result", {
          input: inp,
          caseId: r.caseId,
          title: r.title,
          verdict: r.verdict,
          reason: r.reason,
          line: planResultLine(r),
          confirmed: r.confirmed,
          coverage: compiled?.coverage,
          gaps: compiled?.gaps,
          setup: r.setup,
          steps: r.steps,
          confirmation: r.confirmation,
          runId: r.runId,
          ms: r.ms,
        });
      }
      s.send("done", { plans: inputs.length, ran });
    } catch (e) {
      s.send("fatal", { message: (e as Error).message });
    } finally {
      running = null;
      s.end();
    }
    return true;
  }

  ctx.json({ error: `unknown endpoint ${ctx.path}` }, 404);
  return true;
};
