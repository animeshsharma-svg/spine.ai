/**
 * The Success page's data (public/success.js).
 *
 *   GET  /api/metrics?c=<company>            the five pillars, today / target / 14-day trend
 *   GET  /api/metrics/coverage?c=&cases=1    coverage of the written catalog (cases=1 adds every case)
 *   POST /api/metrics/input {key, value}     a number only the team knows (bugs Procol accepted…)
 *
 * `c` is optional: without it the history of every client counts.
 * Everything degrades without the spine database (see src/checks/metrics.ts);
 * only saving an input needs it, and says so when it is down.
 */
import type { RouteHandler } from "./index.js";
import { coverageTruth, isInputKey, saveInput, successMetrics } from "../checks/metrics.js";

const companyOf = (url: URL): number | undefined => {
  const n = Number(url.searchParams.get("c") ?? "");
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export const handle: RouteHandler = async (ctx) => {
  if (!ctx.path.startsWith("/api/metrics")) return false;

  if (ctx.path === "/api/metrics" && ctx.req.method === "GET") {
    try {
      ctx.json(await successMetrics({ companyId: companyOf(ctx.url) }));
    } catch (e) {
      ctx.json({ error: `could not compute the metrics: ${(e as Error).message}` }, 500);
    }
    return true;
  }

  if (ctx.path === "/api/metrics/coverage" && ctx.req.method === "GET") {
    try {
      const withCases = ctx.url.searchParams.get("cases") === "1";
      ctx.json(await coverageTruth({ companyId: companyOf(ctx.url), withCases }));
    } catch (e) {
      ctx.json({ error: `could not compute coverage: ${(e as Error).message}` }, 500);
    }
    return true;
  }

  if (ctx.path === "/api/metrics/input" && ctx.req.method === "POST") {
    // Only from this machine's own dashboard: the numbers feed what the team reports.
    const site = String(ctx.req.headers["sec-fetch-site"] ?? "same-origin");
    if (site !== "same-origin" && site !== "none") {
      ctx.json({ ok: false, error: "inputs can only be saved from the dashboard itself" }, 403);
      return true;
    }
    const b = await ctx.body();
    const key = String(b?.key ?? "");
    const value = Number(b?.value);
    if (!isInputKey(key)) {
      ctx.json({ ok: false, error: `unknown input "${key}"` }, 400);
      return true;
    }
    const by = typeof b?.by === "string" ? b.by.slice(0, 80) : undefined;
    const note = typeof b?.note === "string" ? b.note.slice(0, 500) : undefined;
    const r = await saveInput(key, value, by, note);
    ctx.json(r, r.ok ? 200 : 400);
    return true;
  }

  return false;
};
