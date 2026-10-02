/**
 * The bidding matrix (several vendors, surrogate bids, time rules).
 *
 *   GET  /api/matrix/combos                 → the combinations (id, title, why, clients, vendors)
 *   GET  /api/matrix/vendors?c=<companyId>  → the QA vendors recorded for a client
 *   GET  /api/matrix/runs                   → saved runs (file, company, time, verdict counts)
 *   GET  /api/matrix/run?file=<name>        → one saved run
 *   GET  /api/matrix/latest?c=<companyId>   → newest result per combination for a client
 *   GET  /api/matrix/stream?c=<id>&combos=M1,M5[&vendors=&surrogate=&timing=&award=]
 *                                           → SSE: line, step, done (runs live; minutes per combination)
 */
import type { RouteHandler } from "./index.js";
import { COMBOS, runBiddingMatrix } from "../checks/biddingMatrix.js";
import { listQaVendors } from "../checks/matrixVendors.js";
import { latestMatrix, listMatrixRuns, readMatrixRun, saveMatrixRun } from "../checks/matrixStore.js";

let running = false;

export const handle: RouteHandler = async (ctx) => {
  if (!ctx.path.startsWith("/api/matrix/")) return false;
  const q = ctx.url.searchParams;
  const c = Number(q.get("c")) || 198678;
  switch (ctx.path) {
    case "/api/matrix/combos":
      ctx.json(COMBOS.map(({ id, title, why, clients, vendors }) => ({ id, title, why, clients, vendors })));
      return true;
    case "/api/matrix/vendors":
      ctx.json((await listQaVendors(c)).map((v) => ({ n: v.n, name: v.name, email: v.email, vendorCompanyId: v.vendorCompanyId, linkStatus: v.linkStatus, loginOk: v.loginOk })));
      return true;
    case "/api/matrix/runs":
      ctx.json(await listMatrixRuns());
      return true;
    case "/api/matrix/run": {
      const r = await readMatrixRun(q.get("file") ?? "");
      ctx.json(r ?? { error: "no such run" }, r ? 200 : 404);
      return true;
    }
    case "/api/matrix/latest":
      ctx.json((await latestMatrix(c)) ?? { none: true });
      return true;
    case "/api/matrix/stream": {
      const sse = ctx.sse();
      if (running) {
        sse.send("error", { message: "a matrix run is already going on this server" });
        sse.end();
        return true;
      }
      running = true;
      try {
        const r = await runBiddingMatrix(c, {
          combos: q.get("combos")?.split(",").filter(Boolean),
          vendorCount: q.get("vendors") ? Number(q.get("vendors")) : undefined,
          surrogate: (q.get("surrogate") as any) ?? undefined,
          timing: (q.get("timing") as any) ?? undefined,
          award: (q.get("award") as any) ?? undefined,
          onLine: (l) => sse.send("line", { line: l }),
          onStep: (combo, step) => sse.send("step", { combo, step }),
        });
        const file = await saveMatrixRun(r);
        sse.send("done", { file, result: r });
      } catch (e) {
        sse.send("error", { message: e instanceof Error ? e.message : String(e) });
      } finally {
        running = false;
        sse.end();
      }
      return true;
    }
    default:
      return false;
  }
};
