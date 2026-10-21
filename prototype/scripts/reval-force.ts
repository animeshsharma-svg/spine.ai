/**
 * The force check, in detail: "revalidate these vendors now" and "revalidate
 * them at this clock time". Read-only apart from the runs themselves, which
 * touch only the named Procol test vendors.
 *
 *   npm run reval:force -- --vendors 70959,47168,56616 --at-minutes 5
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PROCOL_TEST } from "../src/executor.js";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "data", "evidence", "reval-force");
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const VENDORS = (arg("vendors") ?? "70959,47168,56616").split(",").map(Number);
const AT_MIN = Number(arg("at-minutes") ?? 5);
const CLIENT = 47053;
const H = { "access-token": process.env.VR_QA_TOKEN?.trim() ?? "", "Content-Type": "application/json" };
const BASE = "https://rfx-uat-api.ag-ri.in/api/vendor_validation";
const pool = await import(pathToFileURL(join(PROCOL_TEST, "src", "db", "pool.ts")).href);
// the database is extra detail (the API status is the source of truth) — a dropped VPN must not end the check
const q = async (sql: string, p: unknown[] = []): Promise<any[]> => { for (let i = 0; i < 3; i++) { try { return await pool.query(sql, p); } catch (e) { if (i === 2) { say(`    (database unreachable: ${(e as Error).message} — continuing with the API alone)`); return []; } await sleep(10_000); } } return []; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ist = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(11, 19);
const log: string[] = [];
const say = (s: string) => { console.log(s); log.push(`${ist()} ${s}`); };
async function api(method: string, path: string, body?: unknown) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${BASE}${path}`, { method, headers: H, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60_000) });
      return { status: r.status, data: await r.json().catch(() => null) as any };
    } catch (e) { if (i === 2) throw e; await sleep(15_000); }
  }
  throw new Error("unreachable");
}
const finals = async () => q(`SELECT b.dealing_with_company_id v, b.vendor_validation_status s, to_char(b.vendor_last_validated_at at time zone 'UTC' at time zone 'Asia/Kolkata','HH24:MI:SS') lv FROM buyer_seller_company_mappings b WHERE b.client_company_id=$1 AND b.dealing_with_company_id = ANY($2::int[]) ORDER BY 1`, [CLIENT, VENDORS]);
const rows = async (runId: string) => q(`SELECT vendor_company_id v, doc_type d, status s, value, error_message e, to_char(last_run_at at time zone 'UTC' at time zone 'Asia/Kolkata','HH24:MI:SS') t FROM vendor_validation_histories WHERE client_company_id=$1 AND run_id=$2::uuid AND vendor_company_id = ANY($3::int[]) ORDER BY 1,2`, [CLIENT, runId, VENDORS]);
const DOC = ["pan", "gst", "msme", "vat", "bank"]; const ST = ["pending", "passed", "failed", "skipped", "system_error"]; const FS: any = { 1: "passed", 2: "failed", 3: "skipped", 4: "system_error" };
const showRows = async (runId: string) => { for (const r of await rows(runId)) say(`    vendor ${r.v} ${DOC[r.d].padEnd(5)} ${ST[r.s].padEnd(12)} ${String(r.value ?? "-").padEnd(28)} ${r.e ?? ""}  (${r.t})`); };
const showFinals = async (label: string) => { for (const f of await finals()) say(`    ${label} vendor ${f.v}: status ${FS[f.s] ?? "none"}, last validated ${f.lv ?? "-"} IST`); };
async function poll(run: string, job: string, maxMs: number, every = 15_000) {
  const until = Date.now() + maxMs; let s: any;
  for (;;) { s = (await api("GET", `/runs/${run}?job_id=${job}&workspace_id=${CLIENT}`)).data; say(`    state=${s?.trigger?.state} rows=${s?.total_rows} by_status=${JSON.stringify(s?.by_status ?? {})} complete=${s?.complete}`); if (s?.complete || ["nothing_due", "disabled", "failed"].includes(s?.trigger?.state) || Date.now() > until) return s; await sleep(every); }
}

say(`force check on vendors ${VENDORS.join(", ")} (GMMCO ${CLIENT})`);
await showFinals("before:");
// 1. force now
say(`1) POST /trigger {mode: force, vendor_ids} — run now`);
const t0 = Date.now();
const a = await api("POST", `/trigger?workspace_id=${CLIENT}`, { mode: "force", vendor_ids: VENDORS });
say(`   ${a.status} ${JSON.stringify(a.data).slice(0, 200)}`);
const sa = await poll(a.data.run_id, a.data.job_id, 10 * 60_000);
say(`   finished in ${Math.round((Date.now() - t0) / 1000)} s; state ${sa?.trigger?.state}, ${sa?.total_rows} rows, by_status ${JSON.stringify(sa?.by_status)}`);
await showRows(a.data.run_id);
await showFinals("after run now:");
// 2. force at a clock time
const at = new Date(Date.now() + AT_MIN * 60_000);
const atIst = new Date(at.getTime() + 5.5 * 3600_000).toISOString().replace(/\.\d{3}Z$/, "+05:30");
say(`2) POST /trigger {mode: force, vendor_ids, run_at: ${atIst}} — run at ${ist(at)} IST (${AT_MIN} min ahead)`);
const b = await api("POST", `/trigger?workspace_id=${CLIENT}`, { mode: "force", vendor_ids: VENDORS, run_at: atIst });
say(`   ${b.status} ${JSON.stringify(b.data).slice(0, 220)}`);
const checks: string[] = [];
const s1 = (await api("GET", `/runs/${b.data.run_id}?job_id=${b.data.job_id}&workspace_id=${CLIENT}`)).data;
checks.push(`${s1?.trigger?.state === "scheduled" ? "PASS" : "FAIL"} right after scheduling: state scheduled (got ${s1?.trigger?.state}; the ${s1?.total_rows} rows reported are the whole day's, the trigger has none yet)`);
const beforeAt = await finals();
await sleep(Math.max(0, at.getTime() - Date.now() - 60_000));
const s2 = (await api("GET", `/runs/${b.data.run_id}?job_id=${b.data.job_id}&workspace_id=${CLIENT}`)).data;
checks.push(`${s2?.trigger?.state === "scheduled" ? "PASS" : "FAIL"} one minute before the time: still scheduled (got ${s2?.trigger?.state})`);
const mid = await finals();
checks.push(`${!mid.length || !beforeAt.length ? "SKIP (db down)" : JSON.stringify(mid) === JSON.stringify(beforeAt) ? "PASS" : "FAIL"} one minute before the time: the vendors' shown status and last-validated time unchanged`);
say(`   waiting for ${ist(at)} IST…`);
await sleep(Math.max(0, at.getTime() - Date.now()));
const sb = await poll(b.data.run_id, b.data.job_id, 8 * 60_000, 10_000);
checks.push(`${sb?.trigger?.state === "started" ? "PASS" : "FAIL"} at the time: started (state ${sb?.trigger?.state}, complete ${sb?.complete}, ${sb?.total_rows} rows, by_status ${JSON.stringify(sb?.by_status)})`);
await showRows(b.data.run_id);
const after = await finals();
// no fired-at in the run status: the vendors' last-validated stamps (written when a check starts) are the evidence
const atIstClock = ist(at);
const stamped = after.filter((f: any) => f.lv && f.lv >= atIstClock && f.lv <= ist(new Date(at.getTime() + 120_000)));
checks.push(`${!after.length ? "SKIP (db down)" : stamped.length ? "PASS" : "FAIL"} fired within 2 minutes of the scheduled time (${after.map((f: any) => `${f.v}: last validated ${f.lv ?? "never"}`).join(", ")}; run_at ${atIstClock})`);
checks.push(`${!after.length ? "SKIP (db down)" : stamped.length === after.length ? "PASS" : "FAIL"} every vendor's last-validated time is the scheduled run's time (${after.length - stamped.length} of ${after.length} not updated: ${after.filter((f: any) => !stamped.includes(f)).map((f: any) => f.v).join(", ") || "none"})`);
await showFinals("after scheduled run:");
// 3. scheduler mode at a clock time — for comparison
say(`3) POST /trigger {mode: scheduler, vendor_ids, run_at: +2 min} — what the night run would do on that date`);
const c = await api("POST", `/trigger?workspace_id=${CLIENT}`, { mode: "scheduler", vendor_ids: VENDORS.slice(0, 1), run_at: new Date(Date.now() + 2 * 60_000 + 5.5 * 3600_000).toISOString().replace(/\.\d{3}Z$/, "+05:30") });
say(`   ${c.status} ${JSON.stringify(c.data).slice(0, 160)}`);
await sleep(2 * 60_000 + 20_000);
const sc = await poll(c.data.run_id, c.data.job_id, 4 * 60_000, 10_000);
checks.push(`${sc?.trigger?.state === "nothing_due" ? "PASS" : "FAIL"} scheduler mode at that time: nothing due under GMMCO's settings → nothing_due, nobody re-checked (got ${sc?.trigger?.state}, ${sc?.total_rows} rows)`);
say("RESULTS:"); for (const c2 of checks) say(`  ${c2}`);
writeFileSync(join(OUT, "report.json"), JSON.stringify({ at: new Date().toISOString(), vendors: VENDORS, checks, log }, null, 2));
await pool.closePool(); process.exit(0);
