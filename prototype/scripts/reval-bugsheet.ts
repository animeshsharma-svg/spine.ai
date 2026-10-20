/**
 * VENDOR REVALIDATION — the bug sheet, in plain language, with screenshots.
 *
 *   npm run reval:bugsheet
 *
 * 1. Captures the evidence again, live and READ-ONLY, with the GMMCO buyer
 *    session: run status replies on the new buyer API, the listing rows, the
 *    vendor page data, the vendor-detail error and the Excel. Tokens never
 *    reach a file; e-mails and phones in error pages are masked.
 * 2. Takes the evidence the test runs left (data/evidence/reval-<stamp>/<case>.json)
 *    for the bugs a run found: the stuck trigger (REV-19), the rolled-over date
 *    (REV-18), the own-company-only access (REV-01 fixed).
 * 3. Takes the live screen captures made by procol-ui-tests/scripts/reval-screens.ts
 *    (data/evidence/reval-screens, PNG files) — the preview dashboard's vendor list
 *    and vendor pages, real vendors masked.
 * 4. Copies the code lines behind each bug from procol-backend (git show, read-only).
 * 5. Renders one evidence card per bug and photographs it (Playwright).
 * 6. Writes, into ../vendor-revalidation-bug-sheet-<date>/:
 *      Bug sheet.html   the sheet, screenshots inside, opens in any browser
 *      Bug sheet.xlsx   Bugs · Test results · Manual tests · Summary
 *      screenshots/     one PNG per bug + the screen captures
 *      evidence/        the captured requests and replies (JSON), code excerpts, the Excel extract
 *    and zips the folder. The folder is gitignored: it holds UAT data.
 *
 * Bug wording: config/revalBugDetails.json. Test results: every revalidation
 * run of the last 36 hours in data/runs, latest result per case.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as XLSX from "xlsx";

import { openClientContext } from "../src/executor.js";
import { QA_HOST, findRole, finalsOf, latestRows, runIdFor } from "../src/checks/revalidation.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
const BACKEND = join(ROOT, "procol-backend");
const AT = "a717f107ce";
const BUILD = `procol-backend rfx-uat-main @ ${AT} (20 Oct 2026)`;
const PREVIEW = "https://client-feat-vendor-revalidation-details.preview.procol.tech";
const CLIENT = 47053;
const OTHER = 198678;
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const nowIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 16).replace("T", " ") + " IST";
const ist = (s: string) => new Date(Date.parse(s) + 5.5 * 3600_000).toISOString().slice(11, 19) + " IST";
const OUT = join(ROOT, `vendor-revalidation-bug-sheet-${today}`);
const SHOTS = join(OUT, "screenshots");
const EVID = join(OUT, "evidence");
const EVIDENCE_ROOT = join(here, "..", "data", "evidence");
const SCREENS = join(EVIDENCE_ROOT, "reval-screens");

const spec = await import(pathToFileURL(join(ROOT, "procol test", "scripts", "revalidation", "spec.ts")).href);
const details = JSON.parse(readFileSync(join(here, "..", "config", "revalBugDetails.json"), "utf8")).bugs as Record<string, any>;
const pool = await import(pathToFileURL(join(ROOT, "procol test", "src", "db", "pool.ts")).href);
const q = pool.query as (sql: string, p?: unknown[]) => Promise<any[]>;

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const maskEmail = (s: string) => s.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "***@***").replace(/\b\d{10}\b/g, "**********");
const scrub = (s: string) => maskEmail(s).replace(/[A-Za-z0-9+/]{48,}={0,2}/g, "<removed>");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
mkdirSync(EVID, { recursive: true });

// ═══ 1. live evidence (read-only) ═══════════════════════════════════════
const client: any = await openClientContext(CLIENT);
const tok = client.ctx.buyerApi.authTokens;
const who = "GMMCO buyer login (the customer's super admin)";
type Captured = { what: string; capturedAt: string; login: string; request: { method: string; url: string; headers: string }; reply: { status: number; body: unknown } };
async function get(path: string, login: "session" | "none" = "session", appVersion = "1.0.0"): Promise<Captured & { raw: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": "procol-qa-platform/bug-sheet" };
  if (login === "session") Object.assign(headers, { "access-token": tok.accessToken, "lightspeed-token": tok.lightspeedToken, "app-version": appVersion });
  const url = `${QA_HOST}${path}`;
  const t0 = Date.now();
  // UAT sometimes stalls one request; one retry, then give up
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(120_000) }).catch(() => fetch(url, { headers, signal: AbortSignal.timeout(180_000) }));
  console.log(`  ${r.status} ${path.slice(0, 80)} (${Math.round((Date.now() - t0) / 1000)} s)`);
  const raw = await r.text();
  let body: unknown = raw;
  try {
    body = JSON.parse(raw);
  } catch {
    /* html */
  }
  return {
    what: "",
    capturedAt: nowIst(),
    login: login === "session" ? who : "no login (no access-token sent)",
    request: { method: "GET", url, headers: login === "session" ? "access-token: <removed> · lightspeed-token: <removed>" : "none" },
    reply: { status: r.status, body: typeof body === "string" ? "(HTML page — see the screenshot)" : body },
    raw,
  };
}
const save = (name: string, c: Captured & { raw?: string }, what: string) => {
  const { raw: _raw, ...rest } = c;
  writeFileSync(join(EVID, name), JSON.stringify({ ...rest, what }, null, 2));
  return name;
};

const TAB_OF: Record<number, string> = { 1: "verified", 7: "verified", 2: "unverified", 3: "onboarding_in_progress", 4: "onboarding_in_progress", 6: "onboarding_in_progress", 5: "rejected" };
async function listedRow(vendor: number): Promise<{ row: any; cap: Captured } | null> {
  const link = (await finalsOf(CLIENT, [vendor])).get(vendor);
  if (!link) return null;
  const tab = TAB_OF[link.linkStatus] ?? "verified";
  for (let page = 1, pages = 1; page <= Math.min(pages, 80); page++) {
    const c = await get(`/api/companies/all_vendors?tab=${tab}&page=${page}`);
    const b: any = c.reply.body;
    pages = Number(b?.total_pages ?? 1);
    const row = (b?.companies ?? []).find((x: any) => Number(x.id) === vendor);
    if (row) {
      const keep = { id: row.id, name: row.name, vendor_validation_status: row.vendor_validation_status, vendor_last_validated_at: row.vendor_last_validated_at, vendor_validation_errors: row.vendor_validation_errors };
      return { row: keep, cap: { ...c, reply: { status: c.reply.status, body: { note: `page ${page} of the ${tab} tab; only this vendor's row is kept`, companies: [keep] } } } };
    }
  }
  return null;
}

console.log("capturing evidence (read-only)…");
const ev: Record<string, any> = {};
try {
  // the new buyer API: own company answers, another company's run does not leak (REV-01 fixed)
  const lastDate = (await q(`SELECT to_char(max(run_scheduled_on), 'YYYY-MM-DD') d FROM vendor_validation_histories WHERE client_company_id = $1`, [CLIENT]))[0]?.d ?? today;
  ev.ownRun = await get(`/api/vendor_validation/runs/${runIdFor(CLIENT, lastDate)}?workspace_id=${CLIENT}`);
  ev.otherRun = await get(`/api/vendor_validation/runs/${runIdFor(OTHER, lastDate)}?workspace_id=${OTHER}`);
  ev.noLogin = await get(`/api/vendor_validation/runs/${runIdFor(CLIENT, lastDate)}?workspace_id=${CLIENT}`, "none");
  save("REV-01-own-company-run.json", ev.ownRun, `GMMCO's buyer reads GMMCO's run of ${lastDate} — answered (allowed on purpose)`);
  save("REV-01-other-company-run.json", ev.otherRun, `GMMCO's buyer asks for PROCOL DEMO's run of ${lastDate} with workspace_id=198678 — nothing of PROCOL DEMO comes back (fixed)`);
  save("REV-01-no-login.json", ev.noLogin, "The same request with no login — refused, for comparison");

  const pan = (await findRole(CLIENT, "V-BADPAN"))!.id;
  const bank = (await findRole(CLIENT, "V-BANKFAIL"))!.id;
  const never = (await findRole(CLIENT, "V-NEVER"))!.id;
  ev.vendors = { pan, bank, never };
  ev.rowPan = await listedRow(pan);
  ev.rowBank = await listedRow(bank);
  ev.rowNever = await listedRow(never);
  if (ev.rowNever) ev.rowNever.row.name = `(vendor #${never} — name hidden)`;
  if (ev.rowNever) (ev.rowNever.cap.reply.body as any).companies[0].name = ev.rowNever.row.name;
  if (ev.rowPan) save("REV-04-listing-row-pan.json", ev.rowPan.cap, "Vendor listing row: Validation Errors shows the PAN in full");
  if (ev.rowBank) save("REV-04-listing-row-bank.json", ev.rowBank.cap, "Vendor listing row: Validation Errors shows the bank account number in full");
  if (ev.rowNever) save("REV-06-listing-row-never-checked.json", ev.rowNever.cap, "Vendor listing row of a vendor no run has checked: status 'Pending'");
  const page = await get(`/api/companies/${pan}`);
  ev.page = { ...page, reply: { status: page.reply.status, body: { note: "only revalidation_data is kept from the vendor page reply", revalidation_data: (page.reply.body as any)?.revalidation_data ?? null } } };
  save("REV-04-vendor-page-data.json", ev.page, "Vendor page data (Revalidation details): the PAN value comes back in full");
  ev.pageBank = await get(`/api/companies/${bank}`);
  ev.pageBank = { ...ev.pageBank, reply: { status: ev.pageBank.reply.status, body: { revalidation_data: (ev.pageBank.reply.body as any)?.revalidation_data ?? null } } };
  save("REV-04-vendor-page-data-bank.json", ev.pageBank, "Vendor page data: the bank account and IFSC come back in full");

  const det = await get(`/api/companies/vendor_detail?company_id=${pan}`);
  ev.detail = det;
  const title = det.raw.match(/<h1>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
  const message = det.raw.match(/<div class="exception-message">([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
  const trace = [...new Set([...det.raw.matchAll(/app\/[a-z_\/]+\.rb:\d+/g)].map((m) => m[0]))].slice(0, 5);
  ev.detailParsed = { title, message: scrub(message).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'), trace };
  writeFileSync(join(EVID, "REV-15-vendor-detail.json"), JSON.stringify({ what: `vendor_detail answered HTTP ${det.reply.status} (exception and first code lines when it failed; e-mails and phones masked)`, capturedAt: det.capturedAt, login: det.login, request: det.request, reply: { status: det.reply.status, exception: ev.detailParsed } }, null, 2));
  const style = det.raw.match(/<style[\s\S]*?<\/style>/)?.[0] ?? "";
  const header = det.raw.match(/<header[\s\S]*?<\/header>/)?.[0] ?? `<header><h1>${esc(title)}</h1></header>`;
  const msgBlock = det.raw.match(/<div class="exception-message">[\s\S]*?<\/div>/)?.[0] ?? "";
  if (det.reply.status >= 500 && title) writeFileSync(join(EVID, "REV-16-debug-page-top.html"), `<!doctype html><html><head><meta charset="utf-8">${style}</head><body>${scrub(header)}<main role="main" id="container">${scrub(msgBlock)}<div style="padding:16px 22px;font:13px monospace;color:#555">Application trace (first lines): ${esc(trace.join("  ·  "))}<br><br>[The rest of the page — request parameters, headers and session details — was removed before saving.]</div></main></body></html>`);
  ev.otherHost = await fetch(`https://sec-api-v1.ag-ri.in/api/companies/vendor_detail?company_id=${pan}`, { signal: AbortSignal.timeout(60_000), headers: { "access-token": tok.accessToken, "lightspeed-token": tok.lightspeedToken, "app-version": "1.0.0", "Content-Type": "application/json" } }).then(async (r) => ({ status: r.status, body: (await r.text()).slice(0, 200) })).catch((e) => ({ status: 0, body: String(e.message) }));

  // the Excel the product makes; only Procol test vendors' rows are kept
  ev.excelRows = [] as any[];
  ev.excelJoined = 0;
  const ex = await get("/api/companies/all_vendors?tab=verified&download_excel=true").catch((e) => (console.log(`  Excel not available: ${e.message}`), null));
  const url = (ex?.reply.body as any)?.report_url;
  if (url) {
    const wb = XLSX.read(Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(180_000) })).arrayBuffer()));
    const grid: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
    const hi = grid.findIndex((r) => r.some((c) => /validation status/i.test(String(c))));
    const head = grid[hi].map(String);
    const si = head.findIndex((c) => /validation status/i.test(c));
    const ei = head.findIndex((c) => /validation errors?/i.test(c));
    const ni = head.findIndex((c) => /name/i.test(c));
    const body = grid.slice(hi + 1);
    ev.excelJoined = body.filter((r) => String(r[ei]).includes("; ")).length;
    ev.excelHeaders = [head[ni], head[si], head[ei]];
    ev.excelRows = body.filter((r) => /^QA_Platform_|^Internal Procol vendor|^VendorOnboardingTest/i.test(String(r[ni])) && String(r[ei]).includes("; ")).slice(0, 6).map((r) => [r[ni], r[si], r[ei]]);
    const out = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([ev.excelHeaders, ...ev.excelRows]), "Extract");
    XLSX.writeFile(out, join(EVID, "REV-07-excel-extract.xlsx"));
    writeFileSync(join(EVID, "REV-07-excel-extract.json"), JSON.stringify({ what: `GMMCO's own vendor Excel (verified tab), downloaded ${nowIst()}. ${ev.excelJoined} cells join errors with '; '. Only Procol test vendors' rows are kept here.`, columns: ev.excelHeaders, rows: ev.excelRows }, null, 2));
  }

  // how many vendors show System Error although the rest passed (REV-12)
  const vs = (await q(`SELECT dealing_with_company_id v FROM buyer_seller_company_mappings WHERE client_company_id = $1 AND vendor_validation_status = 4`, [CLIENT])).map((x) => x.v);
  const cfg = (await q(`SELECT modifications->'value' v FROM custom_configurations WHERE config_key = 'vendor_revalidation_config' AND item_type = 'Company' AND item_id = $1 AND status = 1 ORDER BY id DESC LIMIT 1`, [CLIENT]))[0]?.v ?? {};
  const rows = await latestRows(CLIENT, vs, Object.keys(cfg.validations ?? {}));
  ev.syserrPassed = new Set(rows.filter((r) => r.status === "passed").map((r) => r.vendor)).size;
} finally {
  await client.dispose().catch(() => {});
}

// ═══ 2. evidence the test runs left (newest file per case) ═══════════════
function runEvidence(key: string): any | null {
  const dirs = readdirSync(EVIDENCE_ROOT).filter((d) => /^reval-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) {
    const f = join(EVIDENCE_ROOT, d, `${key}.json`);
    if (existsSync(f)) {
      const e = JSON.parse(readFileSync(f, "utf8"));
      e.calls = (e.calls ?? []).map((c: any) => ({ ...c, reply: scrub(String(c.reply ?? "")) }));
      writeFileSync(join(EVID, `run-${key}.json`), JSON.stringify(e, null, 2));
      return e;
    }
  }
  return null;
}
const evA26 = runEvidence("A-26");
const evB15 = runEvidence("B-15");
const evA23 = runEvidence("A-23");
const evA30 = runEvidence("A-30");
/** the states a trigger went through, from the run-status polls */
function timeline(e: any): Array<{ at: string; state: string; rows: string }> {
  if (!e) return [];
  return (e.calls as any[]).filter((c) => c.method === "GET" && /\/runs\//.test(c.path)).map((c) => {
    let j: any = null;
    try {
      j = JSON.parse(c.reply);
    } catch {
      /* truncated */
    }
    return { at: ist(c.at), state: j?.trigger?.state ?? (c.reply.match(/"state":"(\w+)"/)?.[1] ?? "?"), rows: String(j?.total_rows ?? c.reply.match(/"total_rows":(\d+)/)?.[1] ?? "?") };
  });
}

// ═══ 3. the live screen captures (procol-ui-tests/scripts/reval-screens.ts) ═
const screens: Record<string, string> = {};
let screenReport: any = null;
if (existsSync(SCREENS)) {
  for (const f of readdirSync(SCREENS).filter((n) => n.endsWith(".png") && !/^error-state/.test(n))) {
    copyFileSync(join(SCREENS, f), join(SHOTS, `screen-${f}`));
    screens[f.replace(/\.png$/, "")] = `screenshots/screen-${f}`;
  }
  try {
    screenReport = JSON.parse(readFileSync(join(SCREENS, "report.json"), "utf8"));
  } catch {
    screenReport = null;
  }
}
const screenAt = screenReport?.at ? new Date(Date.parse(screenReport.at) + 5.5 * 3600_000).toISOString().slice(0, 16).replace("T", " ") + " IST" : "";

// ═══ 4. code lines behind each bug (read-only git show) ══════════════════
const CODE: Record<string, Array<[string, number, number, number[]]>> = {
  "REV-02": [["app/controllers/api/vendor_validation_controller.rb", 58, 72, [71]], ["app/services/vendor_revalidation/trigger_service.rb", 99, 105, [104]]],
  "REV-03": [["lib/external_api/validation.rb", 229, 236, [233, 235]]],
  "REV-05": [["lib/external_api/validation.rb", 65, 71, [68]]],
  "REV-04": [["app/models/vendor_validation_history.rb", 47, 52, [50]], ["app/models/vendor_validation_history.rb", 68, 72, [70]]],
  "REV-06": [["app/models/vendor_validation_history.rb", 56, 65, [61]]],
  "REV-07": [["app/models/vendor_validation_history.rb", 56, 65, [63]]],
  "REV-08": [["app/services/vendor_revalidation/vendor_check_service.rb", 24, 30, [28]], ["app/services/vendor_revalidation/vendor_check_service.rb", 86, 89, [88]]],
  "REV-09": [["app/services/vendor_revalidation/trigger_service.rb", 151, 162, [156]]],
  "REV-11": [["app/models/vendor_validation_history.rb", 47, 52, [49]]],
  "REV-12": [["app/models/vendor_validation_history.rb", 37, 41, [40]]],
  "REV-13": [["app/workers/vendor_revalidation/scheduler_worker.rb", 18, 26, [24]], ["lib/external_api/validation.rb", 243, 248, [246]]],
  "REV-14": [["app/workers/vendor_revalidation/run_worker.rb", 51, 56, [54]]],
  "REV-17": [["app/workers/vendor_revalidation/scheduler_worker.rb", 88, 96, [92]]],
  "REV-18": [["app/controllers/api/vendor_validation_controller.rb", 41, 55, [53]]],
  "REV-19": [["app/services/vendor_revalidation/trigger_service.rb", 31, 50, [46, 48]], ["app/workers/vendor_revalidation/trigger_worker.rb", 4, 10, [8]]],
};
const fileCache = new Map<string, string[]>();
const codeOf = (file: string) => {
  if (!fileCache.has(file)) fileCache.set(file, execFileSync("git", ["-C", BACKEND, "show", `${AT}:${file}`], { encoding: "utf8" }).split("\n"));
  return fileCache.get(file)!;
};
for (const [bug, parts] of Object.entries(CODE)) {
  const text = parts.map(([f, a, b]) => `# ${f}  (${BUILD})\n` + codeOf(f).slice(a - 1, b).map((l, i) => `${String(a + i).padStart(4)}  ${l}`).join("\n")).join("\n\n");
  writeFileSync(join(EVID, `${bug}-code.txt`), text + "\n");
}

// ═══ 5. evidence cards → screenshots ═════════════════════════════════════
const CARD_CSS = `
  *{box-sizing:border-box} body{margin:0;background:#eef1f4;font:14px/1.45 -apple-system,"Segoe UI",Roboto,sans-serif;color:#1d2733}
  .card{width:1100px;padding:22px 24px;background:#eef1f4}
  .cap{font:600 12px/1.3 -apple-system,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#56677a;margin:0 0 10px}
  .grid{display:grid;gap:14px} .two{grid-template-columns:1fr 1fr}
  .panel{background:#fff;border:1px solid #cfd8e1;border-radius:6px;overflow:hidden}
  .bar{display:flex;gap:10px;align-items:center;padding:9px 12px;background:#f6f8fa;border-bottom:1px solid #cfd8e1;font:12.5px ui-monospace,Menlo,monospace}
  .m{font-weight:700;color:#0b6e4f} .u{color:#1d2733;word-break:break-all}
  .st{margin-left:auto;padding:2px 8px;border-radius:10px;font-weight:700;font-size:12px}
  .ok{background:#ffe1dc;color:#9b1c0c} .no{background:#dff3e8;color:#0b6e4f} .er{background:#fde9c9;color:#8a4b00} .good{background:#dff3e8;color:#0b6e4f}
  .who{padding:7px 12px;font-size:12px;color:#56677a;border-bottom:1px solid #edf1f4}
  pre{margin:0;padding:12px;font:12.5px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-word}
  mark{background:#ffe066;padding:0 2px;border-radius:2px}
  table{border-collapse:collapse;width:100%;font-size:13px} th,td{border:1px solid #d5dde5;padding:7px 9px;text-align:left;vertical-align:top}
  th{background:#f2f5f8;font-weight:600} .xl th{background:#e6efe9}
  .code pre{background:#0f1720;color:#d9e2ec} .code .ln{display:block;min-height:1.5em} .code .hl{background:#5c4b00;color:#fff3c4}
  .note{font-size:12.5px;color:#56677a;margin-top:10px}
  .screen{border:1px solid #cfd8e1;border-radius:6px;max-width:100%;display:block}`;
const json = (v: unknown, marks: string[] = []) => {
  let s = esc(JSON.stringify(v, null, 2));
  for (const m of marks) if (m) s = s.split(esc(m)).join(`<mark>${esc(m)}</mark>`);
  return s;
};
const stPill = (st: number, okIsBad = true) => `<span class="st ${st === 200 ? (okIsBad ? "ok" : "good") : st >= 500 ? "er" : st === 0 ? "er" : "no"}">${st === 200 ? "200 OK — answered" : st >= 500 ? `${st} server error` : st === 0 ? "no reply" : `${st} refused`}</span>`;
const apiPanel = (c: Captured, marks: string[] = [], label?: string, okIsBad = true) =>
  `<div class="panel"><div class="bar"><span class="m">${esc(c.request.method)}</span><span class="u">${esc(c.request.url.replace(QA_HOST, "rfx-uat-api.ag-ri.in"))}</span>${stPill(c.reply.status, okIsBad)}</div>
    <div class="who">${esc(label ?? c.login)} · captured ${esc(c.capturedAt)}</div><pre>${json(c.reply.body, marks)}</pre></div>`;
const codePanel = (bug: string) =>
  (CODE[bug] ?? []).map(([f, a, b, hl]) => `<div class="panel code"><div class="bar"><span class="u">${esc(f)}</span><span class="st no" style="background:#e8edf2;color:#33475b">rfx-uat-main @ ${AT}</span></div><pre>${codeOf(f).slice(a - 1, b).map((l, i) => {
    const n = a + i;
    const line = `${String(n).padStart(4)}  ${esc(l)}`;
    return `<span class="ln${hl.includes(n) ? " hl" : ""}">${line || " "}</span>`;
  }).join("")}</pre></div>`).join("");
const listingTable = (rows: any[], marks: string[]) => `<div class="panel"><table><tr><th>Vendor</th><th>Validation Status</th><th>Last Validated At</th><th>Validation Errors</th></tr>${rows.map((r) => {
  let e = esc(r.vendor_validation_errors);
  for (const m of marks) if (m) e = e.split(esc(m)).join(`<mark>${esc(m)}</mark>`);
  let s = esc(r.vendor_validation_status);
  if (marks.includes(r.vendor_validation_status)) s = `<mark>${s}</mark>`;
  return `<tr><td>${esc(r.name)}<br><small>#${esc(r.id)}</small></td><td>${s}</td><td>${esc(r.vendor_last_validated_at) || "<i>(blank)</i>"}</td><td>${e || "<i>(blank)</i>"}</td></tr>`;
}).join("")}</table></div>`;
const img64 = (rel: string) => (rel && existsSync(join(OUT, rel)) ? `data:image/png;base64,${readFileSync(join(OUT, rel)).toString("base64")}` : "");
const screenImg = (key: string, cap: string) => (screens[key] ? `<figure style="margin:0"><img class="screen" src="${img64(screens[key])}" alt="${esc(cap)}"><figcaption class="note">${esc(cap)}</figcaption></figure>` : "");
const timelineTable = (e: any, label: string) => {
  const t = timeline(e);
  if (!t.length) return "";
  const first = e.calls.find((c: any) => c.method === "POST");
  return `<div class="panel"><div class="bar"><span class="m">POST</span><span class="u">rfx-uat-api.ag-ri.in${esc(first?.path ?? "/api/vendor_validation/trigger")}</span>${stPill(first?.status ?? 0, false)}</div>
    <div class="who">${esc(label)} · ${esc(ist(first?.at ?? e.recordedAt))} · sent: ${esc(JSON.stringify(first?.body ?? {}))}</div>
    <pre>${esc(String(first?.reply ?? "").slice(0, 400))}</pre>
    <table><tr><th>Checked at</th><th>trigger.state</th><th>Rows created</th></tr>${t.map((x) => `<tr><td>${esc(x.at)}</td><td>${x.state === "scheduled" ? "<mark>scheduled</mark>" : esc(x.state)}</td><td>${esc(x.rows)}</td></tr>`).join("")}</table></div>`;
};

const panVal = ev.rowPan?.row?.vendor_validation_errors?.match(/PAN (\S+):/)?.[1] ?? "";
const bankVal = ev.rowBank?.row?.vendor_validation_errors?.match(/BANK (\S+ \/ \S+):/)?.[1] ?? "";
const a23 = evA23?.calls?.find((c: any) => c.method === "POST" && /2026-02-30/.test(JSON.stringify(c.body ?? "")));
const cards: Record<string, string> = {
  "REV-01": `<p class="cap">Re-checked on the 20 Oct build — the buyer API answers only for the login's own company</p>
    <div class="grid two">${apiPanel(ev.ownRun, [], `${who}, its own run`, false)}${apiPanel(ev.otherRun, ['"total_rows": 0'], `${who}, asking for PROCOL DEMO's run with workspace_id=198678`, false)}</div>
    <p class="cap" style="margin-top:14px">For comparison — no login</p>${apiPanel(ev.noLogin, [], undefined, false)}
    <p class="note">Fixed: another company's run comes back empty, and a run can be started only for the login's own company (test A-30 passed on 20 Oct). The old private controls, which answered any customer id, were removed. Tokens removed.</p>`,
  "REV-04": `<p class="cap">On the live screen (${esc(PREVIEW.replace("https://", ""))}, ${esc(screenAt)}) — full PAN and full bank account number on the vendor page</p>
    <div class="grid two">${screenImg("vendor-page-revalidation-failed", "Vendor page → Revalidation Details: the PAN is printed in full in the Value column (Procol test vendor).")}${screenImg("vendor-page-revalidation-passed", "Vendor page → Revalidation Details: the bank account number and IFSC are printed in full (Procol test vendor).")}</div>
    <p class="cap" style="margin-top:14px">What the listing and the vendor page receive from the server</p>
    ${listingTable([ev.rowPan?.row, ev.rowBank?.row].filter(Boolean), [panVal, bankVal.split(" / ")[0]])}
    <div class="grid two" style="margin-top:14px">${apiPanel(ev.page, [panVal], `${who} — vendor page data, vendor #${ev.vendors.pan}`)}${apiPanel(ev.pageBank, [bankVal.split(" / ")[0]], `${who} — vendor page data, vendor #${ev.vendors.bank}`)}</div>
    <p class="note">Expected: masked, e.g. ******789J. Values shown belong to Procol test vendors.</p>`,
  "REV-06": `<p class="cap">On the live screen — a vendor no run has checked shows "Pending"</p>
    ${screenImg("vendor-page-revalidation-pending", "Vendor page → Revalidation Details of a vendor never checked: Overall status 'Pending', no data (real vendor, name hidden).")}
    <p class="cap" style="margin-top:14px">The listing row the screen is built from</p>${listingTable([ev.rowNever?.row].filter(Boolean), ["Pending"])}
    <p class="note">Expected: blank (or "Not checked yet") — nothing is running for this vendor.</p>`,
  "REV-07": `<p class="cap">From GMMCO's own vendor Excel, downloaded ${esc(nowIst())} — ${ev.excelJoined} cells like this (test vendors shown)</p>
    <div class="panel xl"><table><tr>${(ev.excelHeaders ?? []).map((h: string) => `<th>${esc(h)}</th>`).join("")}</tr>${(ev.excelRows ?? []).map((r: any[]) => `<tr>${r.map((c, i) => `<td>${i === 2 ? esc(c).split("; ").join("<mark>; </mark>") : esc(c)}</td>`).join("")}</tr>`).join("")}</table></div>
    <p class="note">Expected: one error per line inside the cell.</p>`,
  "REV-15": `<p class="cap">Captured on UAT — the vendor_detail request</p>
    <div class="panel"><div class="bar"><span class="m">GET</span><span class="u">rfx-uat-api.ag-ri.in/api/companies/vendor_detail?company_id=${ev.vendors.pan}</span>${stPill(ev.detail.reply.status, false)}</div><div class="who">${esc(who)} · captured ${esc(ev.detail.capturedAt)}</div>
    <pre>${ev.detailParsed.title ? `<b>${esc(ev.detailParsed.title)}</b>\n\n${esc(ev.detailParsed.message).replace(/undefined method `integration_status'/, "<mark>undefined method `integration_status'</mark>")}\n\nCode path: ${esc(ev.detailParsed.trace.join(" → "))}` : esc(JSON.stringify(ev.detail.reply.body).slice(0, 600))}</pre></div>
    <div class="panel" style="margin-top:14px"><div class="bar"><span class="m">GET</span><span class="u">sec-api-v1.ag-ri.in/api/companies/vendor_detail?company_id=${ev.vendors.pan}</span>${stPill(ev.otherHost.status, false)}</div><pre>${esc(ev.otherHost.body)}</pre></div>
    <p class="note">${ev.detail.reply.status >= 500 ? "Still failing on the 20 Oct build. " : "Note: the request answered " + ev.detail.reply.status + " today — re-check whether the bug is fixed. "}E-mails and phone numbers masked.</p>`,
  "REV-18": a23
    ? `<p class="cap">Captured during test A-23 (${esc(ist(a23.at))}) — an impossible date is rolled over, not refused</p>
    <div class="panel"><div class="bar"><span class="m">POST</span><span class="u">rfx-uat-api.ag-ri.in${esc(a23.path)}</span>${stPill(a23.status)}</div><div class="who">${esc(who)} · sent: ${esc(JSON.stringify(a23.body))}</div><pre>${esc(a23.reply).replace(/run_at is in the past/, "<mark>run_at is in the past</mark>")}</pre></div>
    <p class="note">30 February 2026 does not exist. Expected: "run_at must be a time like … (IST if no offset)". Got "in the past" — the server read it as 2 March 2026.</p>`
    : "",
  "REV-19": `<p class="cap">Captured during tests A-26 and B-15 on 20 Oct — the run is accepted and then never starts</p>
    <div class="grid two">${timelineTable(evA26, "test A-26: force run, run_at 20 s ago, one vendor")}${timelineTable(evB15, "test B-15: force run scheduled 2 min ahead, one vendor")}</div>
    <p class="note">Expected: state "started" within a minute of run_at and rows for the vendor. The polls above kept answering "scheduled" with 0 rows until the test gave up; the database had no row dated 20 Oct for GMMCO afterwards.</p>`,
  "REV-20": `<p class="cap">On the live screen (${esc(PREVIEW.replace("https://", ""))}, ${esc(screenAt)}) — "23:00 PM" on the vendor page, "11:00 PM" on the list</p>
    ${screenImg("vendor-page-revalidation-passed", "Vendor page → Revalidation Details: 'Last validated: 15-Oct-2026 23:00 PM' and 'Last Run At' in the same format.")}
    <div style="margin-top:14px">${screenImg("vendor-list-validation-columns", "Vendor list → Last Validated At column: the same moment as 'October 15, 2026 11:00 PM'.")}</div>`,
};
for (const b of spec.BUGS) if (!cards[b.id]) cards[b.id] = `<p class="cap">${b.id === "REV-16" ? "" : "Found in the code — the lines behind this bug"}</p>${codePanel(b.id)}`;

const { chromium } = await import(pathToFileURL(join(ROOT, "procol test", "node_modules", "playwright", "index.mjs")).href);
const browser = await chromium.launch();
const pg = await browser.newPage({ viewport: { width: 1148, height: 900 }, deviceScaleFactor: 2 });
for (const [bug, body] of Object.entries(cards)) {
  if (bug === "REV-16" || !body.trim()) continue;
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CARD_CSS}</style></head><body><div class="card">${body}</div></body></html>`);
  await pg.locator(".card").screenshot({ path: join(SHOTS, `${bug}.png`) });
}
if (existsSync(join(EVID, "REV-16-debug-page-top.html"))) {
  await pg.goto(pathToFileURL(join(EVID, "REV-16-debug-page-top.html")).href);
  await pg.setViewportSize({ width: 1148, height: 620 });
  const box = (await pg.evaluate("Math.ceil(((document.querySelector(\"main\") ?? document.body).getBoundingClientRect().bottom) + 12)")) as number;
  await pg.screenshot({ path: join(SHOTS, "REV-16.png"), clip: { x: 0, y: 0, width: 1148, height: Math.min(box, 620) } });
}
await browser.close();
const shotOf = (bug: string) => (readdirSync(SHOTS).includes(`${bug}.png`) ? `screenshots/${bug}.png` : "");

// ═══ 6. test results in plain words — latest result per case, all runs of the last 36 h ═
const RUNS = join(here, "..", "data", "runs");
const res = new Map<string, any>();
const runIds = new Set<string>();
const since = Date.now() - 36 * 3600_000;
for (const f of readdirSync(RUNS).filter((x) => x.endsWith(".json")).sort()) {
  try {
    const r = JSON.parse(readFileSync(join(RUNS, f), "utf8"));
    if (Date.parse(r.ts) < since) continue;
    for (const c of r.checkResults ?? []) {
      if (!String(c.id).startsWith("API-XREV-")) continue;
      // a result that could not reach the server (VPN drop) never replaces a real one
      const network = c.inconclusive && /Connection terminated|ENETUNREACH|fetch failed/.test(String(c.verdict));
      if (network && res.has(c.id)) continue;
      res.set(c.id, { ...c, company: r.companyId === OTHER ? "PROCOL DEMO (198678)" : "GMMCO (47053)", runId: r.id });
      runIds.add(r.id);
    }
  } catch {
    /* skip */
  }
}

const cases = JSON.parse(readFileSync(join(here, "..", "data", "api-cases-extra", "revalidation.json"), "utf8"));
const AREA: Record<string, string> = Object.fromEntries(Object.entries(spec.MODULES).map(([, m]: any) => [m.feature, m.title]));
const NOT_RUN: Record<string, string> = {
  config: "Not run yet — this test sends a run request the API must refuse; it needs the buyer token (VR_QA_TOKEN).",
  run: "Not run yet — this test starts a real revalidation check; it needs the buyer token (VR_QA_TOKEN).",
  dev: "Not run — needs a developer (for example to fake a provider outage, shorten the 24-hour wait, or read the server logs).",
  manual: "Not run — needs a person to change real vendor data or a second customer's settings.",
  ui: "Not run — a check on the buyer's screen.",
  code: "Not run on purpose — found by reading the code. Trying it would change real data, or it needs production or Sentry access.",
  ops: "Not run — needs Procol ops to change GMMCO's revalidation settings (there is no settings API since the 20 Oct rewrite).",
  removed: "Not run — the feature this test was about was removed in the 20 Oct rewrite.",
};
const plainSaw = (v: string) => v.replace(/\s*\[after: [^\]]*\]/, "").replace(/\[vendors: ([^\]]*)\]/, (_m, x) => `(test vendor ${x.replace(/V-[A-Z0-9-]+=/g, "#")})`).replace(/^not run — /, "");
const results = cases.map((c: any) => {
  const key = c.reval.key;
  const r = res.get(c.id);
  const bug = spec.CASES.find((x: any) => x.id === key)?.finding;
  let result: string;
  let saw: string;
  if (r?.pass) {
    result = "Passed";
    saw = `Works as expected. ${plainSaw(r.verdict)}`.trim();
  } else if (r && !r.inconclusive) {
    result = "Failed";
    saw = `${bug ? `Bug ${bug}: ${details[bug]?.short ?? ""}. ` : ""}What we saw: ${plainSaw(r.verdict)}`;
  } else if (r && /^not run/.test(r.verdict)) {
    result = /VR_QA_TOKEN|employee|buyer access-token/.test(r.verdict) ? "Not run — needs the buyer token" : /no API since|settings API/.test(r.verdict) ? "Not run — needs ops to change settings" : "Not run — set-up missing";
    saw = `Not run — ${plainSaw(r.verdict)}`;
  } else if (r) {
    result = /Connection terminated|ENETUNREACH|fetch failed/.test(r.verdict) ? "Couldn't tell — network dropped" : "Couldn't tell";
    saw = /Connection terminated|ENETUNREACH|fetch failed/.test(r.verdict) ? "The VPN to UAT dropped during the run, so the test could not finish. Nothing wrong was seen in the product." : plainSaw(r.verdict);
  } else {
    result = { dev: "Not run — needs a developer", manual: "Not run — manual", ui: "Not run — screen check", code: "Not run — found in code", ops: "Not run — needs ops to change settings", removed: "No longer applies — feature removed", run: "Blocked by REV-19 — runs never start", config: "Not run yet" }[c.reval.tier as string] ?? "Not run";
    saw = c.reval.tier === "run"
      ? "Not run: this test starts a real revalidation check, and on the 20 Oct build a run never starts (bug REV-19). It runs again as soon as that is fixed."
      : `${NOT_RUN[c.reval.tier] ?? ""}${c.reval.why ? ` Detail: ${c.reval.why}` : ""}`;
  }
  return { id: key, area: AREA[c.feature] ?? c.feature, title: c.title, priority: c.severity, result, checked: c.expectedResult, saw, bug: bug ?? "", where: r?.company ?? "", at: r ? ist(r.runId.replace(/-(\d\d)-(\d\d)-(\d{3})Z$/, ":$1:$2.$3Z")) : "" };
});
const tally = (k: (x: any) => boolean) => results.filter(k).length;
const passed = tally((x: any) => x.result === "Passed");
const failed = tally((x: any) => x.result === "Failed");
const network = tally((x: any) => /network/.test(x.result));
const token = tally((x: any) => /buyer token/.test(x.result));
const ops = tally((x: any) => /needs ops/.test(x.result));
const removed = tally((x: any) => /No longer applies/.test(x.result));
const blocked = tally((x: any) => /^Blocked by REV-19/.test(x.result));
const otherNot = results.length - passed - failed - network - token - ops - removed - blocked;

// ═══ 7. the bug rows (plain words + live counts) ═════════════════════════
const fill = (s: string) => String(s).replace("{{n_excel_joined}}", String(ev.excelJoined)).replace("{{today}}", today).replace("{{n_syserr_passed}}", String(ev.syserrPassed));
const SEV_WORD: Record<string, string> = { Critical: "Critical — fix before release", High: "High", Medium: "Medium", Low: "Low" };
const evidenceFiles = readdirSync(EVID);
const bugs = spec.BUGS.map((b: any) => {
  const d = details[b.id] ?? {};
  const fixed = /^fixed/i.test(b.status) || /^Fixed/.test(d.proof ?? "");
  return {
    id: b.id, severity: b.severity, short: d.short ?? b.title, proof: d.proof ?? b.status, where: d.where ?? "", steps: d.steps ?? [], fixed,
    expected: fill(d.expected ?? ""), actual: fill(d.actual ?? b.detail), impact: fill(d.impact ?? ""), fix: d.fix ?? b.fix, tech: d.tech ?? b.evidence,
    tests: b.cases, shot: shotOf(b.id), files: evidenceFiles.filter((f) => f.startsWith(`${b.id}-`)),
    results: b.cases.map((id: string) => `${id}: ${results.find((r: any) => r.id === id)?.result ?? "—"}`).join(" · "),
  };
});
const sevOrder = ["Critical", "High", "Medium", "Low"];
bugs.sort((a: any, b: any) => Number(a.fixed) - Number(b.fixed) || sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity) || a.id.localeCompare(b.id));
const open = bugs.filter((b: any) => !b.fixed);
const confirmed = open.filter((b: any) => /^Confirmed/.test(b.proof)).length;

// ═══ 8. Excel ════════════════════════════════════════════════════════════
const wb = XLSX.utils.book_new();
const sheet = (rows: any[], widths: number[]) => {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  return ws;
};
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ["Vendor revalidation — bug sheet"], [`Tested on UAT (rfx-uat-api, ${BUILD}) for GMMCO (47053) and the preview dashboard · sheet made ${nowIst()}`], [],
  ["Open bugs", open.length], ["  confirmed on UAT or on the screen", confirmed], ["  found in the code (to confirm or decide)", open.length - confirmed],
  ["  Critical", open.filter((b: any) => b.severity === "Critical").length], ["  High", open.filter((b: any) => b.severity === "High").length], ["  Medium", open.filter((b: any) => b.severity === "Medium").length], ["  Low", open.filter((b: any) => b.severity === "Low").length],
  ["Fixed by the 20 Oct rewrite", bugs.length - open.length], [],
  ["Automated tests", results.length], ["  passed", passed], ["  failed (each one is a bug in the Bugs sheet)", failed], ["  could not finish — the VPN to UAT dropped", network], ["  blocked by REV-19 — a run never starts on this build", blocked], ["  not run yet — need the buyer token", token], ["  not run — need ops to change GMMCO's settings", ops], ["  no longer apply — feature removed on 20 Oct", removed], ["  not run — need a developer, a person, the screen, or found in code", otherNot], [],
  ["Manual tests", "143 — in the Manual tests sheet, ready to fill in"],
]), "Summary");
XLSX.utils.book_append_sheet(wb, sheet(bugs.map((b: any) => ({
  "Bug ID": b.id, "What's wrong": b.short, "How serious": SEV_WORD[b.severity], "Proven?": b.proof, Where: b.where,
  "Steps to see it": b.steps.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n"), "What should happen": b.expected, "What actually happens": b.actual,
  "Why it matters": b.impact, "Suggested fix": b.fix, Screenshot: b.shot, "Attached files": b.files.map((f: string) => `evidence/${f}`).join("\n"), "Related tests": b.results, "Technical note": b.tech,
})), [8, 46, 16, 30, 30, 50, 50, 60, 50, 44, 22, 36, 30, 60]), "Bugs");
XLSX.utils.book_append_sheet(wb, sheet(results.map((r: any) => ({
  "Test ID": r.id, Area: r.area, Test: r.title, Priority: r.priority, Result: r.result, "What should happen": r.checked, "What we saw / why not run": r.saw, Bug: r.bug, "Tested on": r.where, "Run at": r.at,
})), [8, 30, 46, 9, 30, 60, 80, 8, 20, 14]), "Test results");
const wbIn = XLSX.read(readFileSync(join(ROOT, "test-cases", "Vendor_Revalidation_Test_Cases.xlsx")));
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(XLSX.utils.sheet_to_json(wbIn.Sheets["Test Cases"] ?? wbIn.Sheets[wbIn.SheetNames[0]], { defval: "" })), "Manual tests");
XLSX.writeFile(wb, join(OUT, "Bug sheet.xlsx"));

// ═══ 9. the page ═════════════════════════════════════════════════════════
const pill = (r: string) => `<span class="pill ${r === "Passed" ? "p-ok" : r === "Failed" ? "p-bad" : /token|ops/.test(r) ? "p-wait" : "p-off"}">${esc(r)}</span>`;
const sevPill = (s: string) => `<span class="sev s-${s.toLowerCase()}">${esc(s)}</span>`;
const areas = [...new Set(results.map((r: any) => r.area))] as string[];
const screenFig = (key: string, cap: string) => (screens[key] ? `<figure><img src="${img64(screens[key])}" alt="${esc(cap)}"><figcaption>${esc(cap)}</figcaption></figure>` : "");
const html = `<title>Vendor Revalidation Bug Sheet</title>
<style>
/* Layout: one reading column; a short summary, the bug register, each bug as a self-contained section, what the screen shows, then every test result by area. */
:root{
  --bg:#f5f6f3; --paper:#ffffff; --ink:#1c2321; --muted:#5d6864; --line:#dde2df; --accent:#1f5f8b;
  --ok:#1e7a4f; --ok-bg:#e3f2ea; --bad:#b3261e; --bad-bg:#fbe5e2; --wait:#8a5a00; --wait-bg:#fbefd8; --off:#55606b; --off-bg:#eceff1;
  --crit:#8f1d16; --high:#b3261e; --med:#a26200; --low:#4c6a7d;
  --f-body:"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif; --f-head:"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif; --f-mono:"JetBrains Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#141917;--paper:#1c2220;--ink:#e6ebe8;--muted:#a3ada9;--line:#323a37;--accent:#7cb7e0;--ok:#7fd3a5;--ok-bg:#1d3a2b;--bad:#ff9a8f;--bad-bg:#45201c;--wait:#f3c66b;--wait-bg:#3d3018;--off:#b7c0c7;--off-bg:#2a3136;--crit:#ff8a80;--high:#ff9a8f;--med:#f3c66b;--low:#9cc3dc;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#141917;--paper:#1c2220;--ink:#e6ebe8;--muted:#a3ada9;--line:#323a37;--accent:#7cb7e0;--ok:#7fd3a5;--ok-bg:#1d3a2b;--bad:#ff9a8f;--bad-bg:#45201c;--wait:#f3c66b;--wait-bg:#3d3018;--off:#b7c0c7;--off-bg:#2a3136;--crit:#ff8a80;--high:#ff9a8f;--med:#f3c66b;--low:#9cc3dc;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font:16px/1.6 var(--f-body);padding:0 16px}
img{max-width:100%;height:auto} code{overflow-wrap:anywhere}
.wrap{max-width:860px;margin:0 auto;padding-block:40px 80px}
h1,h2,h3{font-family:var(--f-head);text-wrap:balance;line-height:1.25;margin:0}
h1{font-size:2rem} h2{font-size:1.4rem;margin-top:52px;padding-bottom:8px;border-bottom:2px solid var(--line)} h3{font-size:1.15rem}
p{margin:0} .muted{color:var(--muted)} .lead{font-size:1.08rem;max-width:65ch}
.stack{display:flex;flex-direction:column;gap:14px}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:22px}
.fact{background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:12px 14px}
.fact b{display:block;font-size:1.6rem;font-variant-numeric:tabular-nums} .fact span{font-size:.85rem;color:var(--muted)}
.tbl{overflow-x:auto;background:var(--paper);border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;font-size:.92rem} th,td{padding:9px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}
th{font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700} tr:last-child td{border-bottom:0}
td.id,.id{font-family:var(--f-mono);font-size:.85rem;white-space:nowrap}
a{color:var(--accent)} a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.pill,.sev{display:inline-block;padding:1px 9px;border-radius:999px;font-size:.78rem;font-weight:700;white-space:nowrap}
.p-ok{background:var(--ok-bg);color:var(--ok)} .p-bad{background:var(--bad-bg);color:var(--bad)} .p-wait{background:var(--wait-bg);color:var(--wait)} .p-off{background:var(--off-bg);color:var(--off)}
.sev{border:1.5px solid currentColor;background:transparent} .s-critical{color:var(--crit)} .s-high{color:var(--high)} .s-medium{color:var(--med)} .s-low{color:var(--low)}
.fixed-row td{color:var(--muted)}
.bug{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:22px 24px;margin-top:22px;display:flex;flex-direction:column;gap:14px;min-width:0}
.bug.is-fixed{border-style:dashed}
.bug header{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:baseline}
.bug dl{display:grid;grid-template-columns:170px 1fr;gap:10px 18px;margin:0} .bug dt{font-weight:700;color:var(--muted);font-size:.9rem} .bug dd{margin:0;min-width:0}
.bug ol{margin:0;padding-left:20px} figure{margin:0} figure img{border:1px solid var(--line);border-radius:6px;display:block}
figcaption{font-size:.85rem;color:var(--muted);margin-top:6px}
.tech{font-family:var(--f-mono);font-size:.8rem;color:var(--muted);background:var(--bg);border-radius:6px;padding:10px 12px;overflow-wrap:anywhere}
.files{font-family:var(--f-mono);font-size:.8rem}
.area{margin-top:28px} .area h3{margin-bottom:10px}
.saw{color:var(--muted);font-size:.88rem;margin-top:4px;overflow-wrap:anywhere}
.glossary{display:grid;grid-template-columns:200px 1fr;gap:8px 18px}
.shots{display:grid;gap:18px;margin-top:16px}
@media (max-width:640px){.bug dl,.glossary{grid-template-columns:1fr}.bug dt{margin-top:6px}h1{font-size:1.6rem}}
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=JetBrains+Mono:wght@400&display=swap">
<div class="wrap">
  <p class="muted">Procol QA · Vendor revalidation · UAT · ${esc(today)}</p>
  <h1>Vendor Revalidation Bug Sheet</h1>
  <p class="lead" style="margin-top:12px">Vendor revalidation re-checks every vendor's GST, PAN, MSME and bank details on a schedule, and shows the result on the buyer's vendor list and vendor page. We tested the build of 20 Oct on UAT for GMMCO, through the API and on the preview dashboard, and found <b>${open.length} open bugs</b> (${bugs.length - open.length} earlier ones were fixed by the 20 Oct rewrite). ${confirmed} of the open ones we saw happen; the rest we found by reading the code. The most serious one: <b>a revalidation run that has vendors to check never starts</b>.</p>
  <div class="facts">
    <div class="fact"><b>${open.length}</b><span>open bugs (${open.filter((b: any) => b.severity === "Critical").length} critical, ${open.filter((b: any) => b.severity === "High").length} high)</span></div>
    <div class="fact"><b>${passed}</b><span>tests passed</span></div>
    <div class="fact"><b>${failed}</b><span>tests failed — each is a bug below</span></div>
    <div class="fact"><b>${ops}</b><span>tests waiting for ops to change settings</span></div>
    <div class="fact"><b>${removed}</b><span>tests no longer apply (feature removed)</span></div>
    <div class="fact"><b>${blocked}</b><span>tests blocked by REV-19 (runs never start)</span></div>
    <div class="fact"><b>${otherNot + token + network}</b><span>tests not finished: developer, person, screen, code, or the VPN dropped</span></div>
  </div>
  <p class="muted" style="margin-top:14px;font-size:.88rem">API tests ran on https://rfx-uat-api.ag-ri.in (${esc(BUILD)}) as GMMCO's buyer on ${esc(today)}; the screen captures are from ${esc(PREVIEW)} on ${esc(screenAt)}, signed in as the same buyer. Tokens are removed; real vendors' names, PANs, e-mails and account numbers are masked. Values shown in full belong to Procol test vendors.</p>

  <h2>All bugs at a glance</h2>
  <div class="tbl" style="margin-top:16px"><table><tr><th>Bug</th><th>What's wrong</th><th>How serious</th><th>Proven?</th></tr>
  ${bugs.map((b: any) => `<tr class="${b.fixed ? "fixed-row" : ""}"><td class="id"><a href="#${b.id}">${b.id}</a></td><td>${esc(b.short)}</td><td>${b.fixed ? '<span class="pill p-ok">Fixed</span>' : sevPill(b.severity)}</td><td>${esc(b.proof)}</td></tr>`).join("")}</table></div>

  <h2>The bugs, one by one</h2>
  ${bugs.map((b: any) => `<section class="bug ${b.fixed ? "is-fixed" : ""}" id="${b.id}">
    <header><span class="id">${b.id}</span>${b.fixed ? '<span class="pill p-ok">Fixed on 20 Oct</span>' : sevPill(b.severity)}<span class="muted" style="font-size:.9rem">${esc(b.proof)}</span></header>
    <h3>${esc(b.short)}</h3>
    <dl>
      <dt>Where</dt><dd>${esc(b.where)}</dd>
      <dt>Steps to see it</dt><dd><ol>${b.steps.map((s: string) => `<li>${esc(s)}</li>`).join("")}</ol></dd>
      <dt>What should happen</dt><dd>${esc(b.expected)}</dd>
      <dt>What actually happens</dt><dd>${esc(b.actual)}</dd>
      <dt>Why it matters</dt><dd>${esc(b.impact)}</dd>
      <dt>Suggested fix</dt><dd>${esc(b.fix)}</dd>
      <dt>Related tests</dt><dd>${esc(b.results)}</dd>
      <dt>Attached files</dt><dd class="files">${b.files.map((f: string) => `evidence/${esc(f)}`).join("<br>") || "—"}${b.shot ? `<br>${esc(b.shot)}` : ""}</dd>
    </dl>
    ${b.shot ? `<figure><img src="${img64(b.shot)}" alt="Evidence for ${b.id}: ${esc(b.short)}"><figcaption>${b.id === "REV-16" ? "The UAT server's own error page (top part only; request details removed)." : b.fixed ? "Re-checked on the 20 Oct build." : /^Confirmed/.test(b.proof) ? "Captured live. Highlighted: the part that is wrong." : "The code lines behind this bug (highlighted)."}</figcaption></figure>` : ""}
    <p class="tech">${esc(b.tech)}</p>
  </section>`).join("")}

  <h2>What the buyer's screen shows</h2>
  <p class="lead" style="margin-top:14px">Captured on the preview dashboard (${esc(PREVIEW.replace("https://", ""))}) on ${esc(screenAt)}, signed in as GMMCO's buyer, with the API on rfx-uat-api. Real vendors are masked; Procol test vendors are shown as they are.</p>
  <div class="shots">
    ${screenFig("vendor-list-validation-columns", "Vendors list: the three new columns — Validation Status, Last Validated At, Validation Errors — on the Prospects tab.")}
    ${screenFig("vendor-page-revalidation-passed", "Vendor page → Revalidation Details, a vendor where every document passed (Abcd, /vendors/RGtwWkRr?tab=info).")}
    ${screenFig("vendor-page-revalidation-failed", "Vendor page → Revalidation Details, a vendor whose PAN failed: the reason is shown next to the document.")}
    ${screenFig("vendor-page-revalidation-system-error", "Vendor page → Revalidation Details, a vendor whose checks could not reach the provider (System Error).")}
    ${screenFig("vendor-page-revalidation-skipped", "Vendor page → Revalidation Details, a vendor with no documents to check (Skipped).")}
    ${screenFig("vendor-page-revalidation-pending", "Vendor page → Revalidation Details, a vendor no run has checked: 'Pending' with no data (REV-06).")}
  </div>

  <h2>Every test and its result</h2>
  <p class="lead" style="margin-top:14px">${results.length} automated tests: the 138 from the QA guide plus ${results.length - 138} we added after reading the code. Each result is the latest one from the runs of ${esc(today)} (${runIds.size} run(s)). "Needs ops to change settings" means the test needs GMMCO's revalidation settings changed, which has no API since the 20 Oct rewrite. "No longer applies" means the feature it tested was removed that day. The 143 manual tests are in the Excel (sheet "Manual tests").</p>
  ${areas.map((a) => `<div class="area"><h3>${esc(a)}</h3><div class="tbl"><table><tr><th>Test</th><th>What we tested</th><th>Result</th></tr>
    ${results.filter((r: any) => r.area === a).map((r: any) => `<tr><td class="id">${esc(r.id)}</td><td><b>${esc(r.title)}</b><div class="saw">${esc(r.saw)}</div></td><td>${pill(r.result)}${r.bug ? `<br><a class="id" href="#${r.bug}">${r.bug}</a>` : ""}${r.where ? `<div class="saw">${esc(r.where)}${r.at ? ` · ${esc(r.at)}` : ""}</div>` : ""}</td></tr>`).join("")}</table></div></div>`).join("")}

  <h2>What is still needed</h2>
  <div class="stack" style="margin-top:16px">
    <p><b>A fix for REV-19 first.</b> Until a run can start, the ${blocked + results.filter((r: any) => r.bug === "REV-19" && r.result !== "Passed").length} tests that need a real run cannot pass. They run again with <code>npm run reval:run -- --company 47053</code> as soon as it is fixed.</p>
    <p><b>Procol ops.</b> ${ops} tests need GMMCO's revalidation settings changed (cycles, start dates, document paths); there is no API for that any more.</p>
    <p><b>A developer.</b> Provider outages, the 24-hour deadline, crashes and server logs (module "Provider limits").</p>
    <p><b>A person on screen.</b> The 143 manual tests, and the screen-only checks (filters, vendor portal).</p>
  </div>

  <h2>Words used here</h2>
  <div class="glossary" style="margin-top:16px">
    <b>Revalidation run</b><span>One check of a customer's vendors on one date. Starts at 11 pm IST by itself, or when a buyer starts one.</span>
    <b>Provider</b><span>The outside service that confirms a GST, PAN, MSME or bank number. Each call costs money.</span>
    <b>Validation Status</b><span>The vendor's overall result: Passed, Failed, Skipped (nothing to check), System Error (could not be checked) or Pending (never checked).</span>
    <b>Buyer API</b><span>The requests the dashboard makes to start a run and read its progress (/api/vendor_validation). Since 20 Oct any buyer allowed to edit vendors can use it for their own company.</span>
    <b>Confirmed</b><span>We made it happen on UAT or saw it on the preview screen, and captured it.</span>
    <b>Found in the code</b><span>The code makes it certain, but we did not (or must not) make it happen, usually because it would change real data.</span>
  </div>
</div>
`;
writeFileSync(join(OUT, "Bug sheet.html"), html);
writeFileSync(join(OUT, "README.txt"), `Vendor revalidation — bug sheet (${today})\n\nOpen "Bug sheet.html" in any browser (screenshots are inside it), or "Bug sheet.xlsx".\nscreenshots/  one picture per bug, plus screen-*.png from the preview dashboard\nevidence/     the captured requests and replies (tokens removed), the code lines behind each bug, the Excel extract\n\nMade by: cd prototype && npm run reval:bugsheet\n`);
execFileSync("zip", ["-qr", `${OUT}.zip`, "."], { cwd: OUT });
await pool.closePool();
console.log(`${open.length} open bugs (${confirmed} confirmed, ${bugs.length - open.length} fixed) · ${results.length} tests: ${passed} passed, ${failed} failed, ${blocked} blocked by REV-19, ${network} network, ${token} need token, ${ops} need ops, ${removed} removed, ${otherNot} other\n→ ${OUT}\n→ ${OUT}.zip`);
process.exit(0);
