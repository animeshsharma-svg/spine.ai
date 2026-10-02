/**
 * The PRODUCT MODEL of a sourcing event — how events work, and what each
 * client really has (templates, their fields and rules, units, vendors).
 *
 *   GET /api/product-model/anatomy[?section=time_rule]
 *   GET /api/product-model/templates?c=<id>&type=<rfq|rfp|auction|boq|forward_auction>
 *   GET /api/product-model/template?c=<id>&uuid=<template uuid>
 *   GET /api/product-model/ask?c=<id>&q=<question>[&memory=1]
 *   GET /api/product-model/client?c=<id>          summary + findings + settings
 *   GET /api/product-model/history?c=<id>         snapshot versions (what changed when)
 *   GET /api/product-model/field-rules            the rule library (who enforces what)
 *
 * Read-only: these answer from the model built by `npm run model:build`
 * (spine.ai's database, else src/model/snapshots/*.json). Nothing here
 * calls Procol.
 */
import type { RouteHandler } from "./index.js";

const BASE = "/api/product-model";

export const handle: RouteHandler = async (ctx) => {
  if (!ctx.path.startsWith(BASE)) return false;
  const sub = ctx.path.slice(BASE.length).replace(/\/+$/, "") || "/";
  const p = ctx.url.searchParams;
  const c = Number(p.get("c")) || undefined;
  const q = await import("../model/query.js");
  try {
    switch (sub) {
      case "/anatomy":
        ctx.json(q.anatomyView(p.get("section") ?? undefined));
        return true;
      case "/templates": {
        if (!c) return bad(ctx, "c (client id) is required");
        ctx.json(await q.templatesFor(c, (p.get("type") ?? "rfq").toLowerCase()));
        return true;
      }
      case "/template": {
        const uuid = p.get("uuid");
        if (!c || !uuid) return bad(ctx, "c (client id) and uuid are required");
        ctx.json(await q.templateView(c, uuid));
        return true;
      }
      case "/ask": {
        const text = p.get("q");
        if (!text) return bad(ctx, "q (the question) is required");
        ctx.json(await q.ask(c, text, { memory: p.get("memory") === "1" }));
        return true;
      }
      case "/client": {
        if (!c) return bad(ctx, "c (client id) is required");
        const { model, from } = await q.modelFor(c);
        if (!model) {
          ctx.json({ error: `No product model has been built for client ${c} yet.`, hint: `npm run model:build -- --c ${c}` }, 404);
          return true;
        }
        ctx.json({
          client: { id: model.companyId, name: model.companyName },
          fetchedAt: model.fetchedAt,
          summary: model.summary,
          findings: model.findings,
          settings: model.settings,
          units: { rule: model.units.rulePlain, count: model.units.count, unusableProductUnits: model.units.unusableProductUnits, defaultUnit: model.units.defaultUnit },
          vendors: model.vendors,
          products: model.products,
          locations: model.locations,
          changes: model.changes ?? [],
          errors: model.errors,
          details: { from, hash: model.hash, snapshotId: model.snapshotId ?? null, gates: model.gates },
        });
        return true;
      }
      case "/history": {
        if (!c) return bad(ctx, "c (client id) is required");
        const { snapshotHistory } = await import("../model/store.js");
        ctx.json({ client: c, versions: await snapshotHistory(c, Number(p.get("limit")) || 20) });
        return true;
      }
      case "/field-rules": {
        const { fieldRuleRows } = await import("../model/fieldRules.js");
        ctx.json({ rules: fieldRuleRows() });
        return true;
      }
      default:
        ctx.json({ error: `Unknown product-model path ${sub}`, paths: ["anatomy", "templates", "template", "ask", "client", "history", "field-rules"] }, 404);
        return true;
    }
  } catch (e) {
    ctx.json({ error: "The product model could not answer.", details: { message: (e as Error).message } }, 500);
    return true;
  }
};

function bad(ctx: Parameters<RouteHandler>[0], msg: string): true {
  ctx.json({ error: msg }, 400);
  return true;
}
