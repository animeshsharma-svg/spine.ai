/**
 * Homepage uploads — drop a sheet of test cases, a PRD, or both, and spine.ai tests it (checks/homeJobs.ts).
 *
 *   POST /api/home/upload {files:[{name,data}], companyId, autoRun}   base64 files → a job (sheet / PRD / both)
 *   GET  /api/home/job?id=        the job with its run's progress (the latest job when no id)
 *   POST /api/home/job/run {id}   run the cases now (a job that waited after writing / reading them)
 *   POST /api/home/job/stop {id}
 *   GET  /api/home/job/cases?id=  the cases written from the PRD (.xlsx: Test Cases · Requirements · Questions for the PM)
 *   GET  /api/home/job/report?id= the report (.xlsx: Test Cases · Bugs in the house format · Summary · Case vs PRD)
 */
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import type { RouteHandler } from "./index.js";
import { createHomeJob, homeJobView, homeReport, listHomeJobs, loadHomeJob, resumeHomeJobs, runHomeJob, stopHomeJob } from "../checks/homeJobs.js";

resumeHomeJobs();

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const handle: RouteHandler = async (ctx) => {
  if (!ctx.path.startsWith("/api/home/")) return false;
  const sp = ctx.url.searchParams;

  if (ctx.path === "/api/home/upload" && ctx.req.method === "POST") {
    const b = await ctx.body();
    const files = (Array.isArray(b?.files) ? b.files : []).map((f: any) => ({
      name: String(f?.name ?? "").replace(/[^\w .()-]/g, "").slice(0, 120),
      data: Buffer.from(String(f?.data ?? ""), "base64"),
    }));
    if (files.some((f: { data: Buffer }) => f.data.length > 25 * 1024 * 1024)) return ctx.json({ why: "A file is larger than 25 MB." }, 400), true;
    try {
      const job = createHomeJob({ files, companyId: Number(b?.companyId) || 198678, autoRun: b?.autoRun !== false });
      return ctx.json({ job }), true;
    } catch (e) {
      return ctx.json({ why: (e as Error).message }, 400), true;
    }
  }

  if (ctx.path === "/api/home/job") {
    const j = sp.get("id") ? loadHomeJob(sp.get("id")!) : listHomeJobs(1)[0] ?? null;
    return ctx.json({ job: j ? homeJobView(j) : null }), true;
  }

  if (ctx.path === "/api/home/job/run" && ctx.req.method === "POST") {
    const b = await ctx.body();
    try {
      return ctx.json({ job: runHomeJob(String(b?.id ?? "")) }), true;
    } catch (e) {
      return ctx.json({ why: (e as Error).message }, 400), true;
    }
  }

  if (ctx.path === "/api/home/job/stop" && ctx.req.method === "POST") {
    const b = await ctx.body();
    return ctx.json({ ok: stopHomeJob(String(b?.id ?? "")) }), true;
  }

  if (ctx.path === "/api/home/job/cases") {
    const j = loadHomeJob(sp.get("id") ?? "");
    if (!j?.written || !existsSync(j.written.file)) return ctx.json({ why: "No cases were written for this upload." }, 404), true;
    ctx.res.writeHead(200, { "content-type": XLSX_MIME, "content-disposition": `attachment; filename="${basename(j.written.file)}"`, "cache-control": "no-store" });
    ctx.res.end(readFileSync(j.written.file));
    return true;
  }

  if (ctx.path === "/api/home/job/report") {
    try {
      const out = await homeReport(sp.get("id") ?? "");
      ctx.res.writeHead(200, { "content-type": XLSX_MIME, "content-disposition": `attachment; filename="${out.name}"`, "cache-control": "no-store" });
      ctx.res.end(out.body);
    } catch (e) {
      ctx.json({ why: (e as Error).message }, 400);
    }
    return true;
  }
  return false;
};
