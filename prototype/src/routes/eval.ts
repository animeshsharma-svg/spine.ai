/**
 * The agent's measured quality (scripts/eval-agent.ts, docs/METRICS.md).
 *
 *   GET  /api/eval/latest[?company=198678]   the newest report (metrics, gates, composite, lists)
 *   GET  /api/eval/reports                  every report, newest first: version, composite, gates
 *   GET  /api/eval/report?file=<name>.json  one report with every outcome behind its numbers
 *   POST /api/eval/label {caseId, label: "bug"|"clean", why, by?, bugKey?, planHash?}
 *        settle an unlabelled case (data/eval/labels.json); the next eval counts it
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RouteHandler } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const REPORTS = join(here, "..", "..", "data", "eval", "reports");
const LABELS = join(here, "..", "..", "data", "eval", "labels.json");

function reportFiles(): string[] {
  return existsSync(REPORTS) ? readdirSync(REPORTS).filter((f) => /^[\w.-]+\.json$/.test(f)).sort().reverse() : [];
}
const read = (f: string) => JSON.parse(readFileSync(join(REPORTS, f), "utf8"));
const brief = (f: string, r: any) => ({
  file: f,
  agentVersion: r.agentVersion,
  dataset: r.dataset?.version,
  at: r.run?.at,
  company: r.run?.company,
  k: r.run?.k,
  composite: r.composite?.score ?? null,
  gates: (r.gates ?? []).map((g: any) => ({ key: g.key, status: g.status, value: g.value, threshold: g.threshold, op: g.op })),
});

export const handle: RouteHandler = async (ctx) => {
  if (!ctx.path.startsWith("/api/eval/")) return false;
  const sp = ctx.url.searchParams;

  if (ctx.path === "/api/eval/reports") {
    ctx.json({ reports: reportFiles().map((f) => brief(f, read(f))) });
    return true;
  }
  if (ctx.path === "/api/eval/latest") {
    const company = Number(sp.get("company")) || null;
    const f = reportFiles().find((x) => !company || read(x).run?.company === company);
    if (!f) return ctx.json({ none: true, why: "no eval has run yet — npx tsx scripts/eval-agent.ts" }), true;
    const r = read(f);
    ctx.json({ ...brief(f, r), metrics: r.metrics, composite: r.composite, lists: r.lists, unlabelled: r.unlabelled ?? [], comparedWith: r.comparedWith });
    return true;
  }
  if (ctx.path === "/api/eval/report") {
    const f = String(sp.get("file") ?? "");
    if (!/^[\w.-]+\.json$/.test(f) || !reportFiles().includes(f)) return ctx.json({ why: "no such report" }, 404), true;
    ctx.json(read(f));
    return true;
  }
  if (ctx.path === "/api/eval/label" && ctx.req.method === "POST") {
    const b = await ctx.body();
    const caseId = String(b?.caseId ?? "").trim();
    const label = String(b?.label ?? "");
    const why = String(b?.why ?? "").trim();
    if (!/^[A-Z]+(-[A-Z0-9]+)+$/.test(caseId) || !["bug", "clean"].includes(label) || why.length < 10) {
      return ctx.json({ ok: false, why: "need caseId, label (bug | clean) and a why of at least 10 characters" }, 400), true;
    }
    const doc = existsSync(LABELS) ? JSON.parse(readFileSync(LABELS, "utf8")) : { about: "", labels: [] };
    doc.labels = (doc.labels ?? []).filter((l: any) => l.caseId !== caseId);
    doc.labels.push({ caseId, label, ...(b.bugKey ? { bugKey: String(b.bugKey) } : {}), ...(b.planHash ? { planHash: String(b.planHash) } : {}), why: why.slice(0, 1000), by: String(b?.by ?? "dashboard").slice(0, 80), at: new Date().toISOString().slice(0, 10) });
    writeFileSync(LABELS, JSON.stringify(doc, null, 2));
    ctx.json({ ok: true, labels: doc.labels.length });
    return true;
  }
  return false;
};
