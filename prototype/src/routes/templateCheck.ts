/**
 * TEMPLATE CHECK — choose a template a client really has, see the field cases
 * the product model generates for it, and run them against UAT.
 *
 *   GET /api/template-check/cases?c=<id>&type=<rfq|rfp|auction|boq>[&uuid=<template>][&mode=all|sample|full]
 *        the generated cases (nothing is fired)
 *   GET /api/template-check/run?c=<id>&type=…[&uuid=…][&mode=sample|full][&only=API-XTPL-005,…][&buyerOnly=1]
 *        Server-sent events:
 *          line    {line}                         progress sentence
 *          case    {result, i, total}             one case finished (TemplateCheckResult)
 *          done    {run}                          the whole TemplateCheckRun (runId → /api/test-report?run=)
 *          run-error {message}
 *   GET /api/template-check/status                 {busy}
 *
 * The template chooser itself is /api/product-model/templates?c=&type=.
 * One template check at a time per server process.
 */
import type { RouteHandler } from "./index.js";

const BASE = "/api/template-check";

export const handle: RouteHandler = async (ctx) => {
  if (!ctx.path.startsWith(BASE)) return false;
  const sub = ctx.path.slice(BASE.length).replace(/\/+$/, "") || "/";
  const p = ctx.url.searchParams;
  const c = Number(p.get("c")) || undefined;
  const type = (p.get("type") ?? "rfq").toLowerCase();
  const uuid = p.get("uuid") ?? undefined;
  const tc = await import("../model/templateCheck.js");

  if (sub === "/status") {
    ctx.json({ busy: tc.templateCheckBusy() });
    return true;
  }
  if (!c) {
    ctx.json({ error: "c (client id) is required" }, 400);
    return true;
  }
  if (sub === "/cases") {
    const mode = (p.get("mode") ?? "all") as "all" | "sample" | "full";
    ctx.json(await tc.previewCases(c, uuid, type, mode));
    return true;
  }
  if (sub === "/run") {
    if (tc.templateCheckBusy()) {
      ctx.json({ error: "A template check is already running; wait for it to finish." }, 409);
      return true;
    }
    const { send, end } = ctx.sse();
    try {
      const run = await tc.runTemplateCheck({
        companyId: c,
        templateUuid: uuid,
        type,
        mode: p.get("mode") === "full" ? "full" : "sample",
        only: p.get("only")?.split(",").map((s) => s.trim()).filter(Boolean),
        buyerOnly: p.get("buyerOnly") === "1",
        onLine: (line) => send("line", { line }),
        onCase: (result, i, total) => send("case", { result, i, total }),
      });
      send("done", { run });
    } catch (e) {
      send("run-error", { message: (e as Error).message });
    } finally {
      end();
    }
    return true;
  }
  ctx.json({ error: `Unknown template-check path ${sub}`, paths: ["cases", "run", "status"] }, 404);
  return true;
};
