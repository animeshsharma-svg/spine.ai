/**
 * VENDOR REVALIDATION — the bug sheet, in plain language, with screenshots.
 *
 *   npm run reval:bugsheet
 *
 * 1. Captures the evidence again, live and READ-ONLY, with the GMMCO buyer
 *    session on the revalidation host: the QA settings replies, the listing
 *    rows, the vendor page data, the vendor-detail error and the Excel.
 *    Tokens never reach a file; e-mails in error pages are masked.
 * 2. Copies the code lines behind each bug from procol-backend (git show, read-only).
 * 3. Renders one evidence card per bug and photographs it (Playwright).
 * 4. Writes, into ../vendor-revalidation-bug-sheet-<date>/:
 *      Bug sheet.html   the sheet, screenshots inside, opens in any browser
 *      Bug sheet.xlsx   Bugs · Test results · Manual tests · Summary
 *      screenshots/     one PNG per bug
 *      evidence/        the captured requests and replies (JSON), code excerpts, the Excel extract
 *    and zips the folder. The folder is gitignored: it holds UAT data.
 *
 * Bug wording: config/revalBugDetails.json. Test results: the newest
 * revalidation runs in data/runs (run npm run reval:run first).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as XLSX from "xlsx";

import { openClientContext } from "../src/executor.js";
import { QA_HOST, findRole, finalsOf, latestRows } from "../src/checks/revalidation.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
const BACKEND = join(ROOT, "procol-backend");
const AT = "76b986a012";
const CLIENT = 47053;
const OTHER = 198678;
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const nowIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 16).replace("T", " ") + " IST";
const OUT = join(ROOT, `vendor-revalidation-bug-sheet-${today}`);
const SHOTS = join(OUT, "screenshots");
const EVID = join(OUT, "evidence");

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
const who = "GMMCO admin login (super admin of the customer, not Procol staff)";
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
  ev.cfgOwn = await get(`/api/vendor_revalidation_qa/config?client_company_id=${CLIENT}`);
  ev.cfgOther = await get(`/api/vendor_revalidation_qa/config?client_company_id=${OTHER}`);
  ev.cfgNone = await get(`/api/vendor_revalidation_qa/config?client_company_id=${CLIENT}`, "none");
  save("REV-01-own-client-settings.json", ev.cfgOwn, "GMMCO's admin asks for GMMCO's revalidation settings — answered (should be refused, code 5)");
  save("REV-01-other-client-settings.json", ev.cfgOther, "GMMCO's admin asks for PROCOL DEMO's settings — answered (should be refused, code 5)");
  save("REV-01-what-a-refusal-looks-like.json", ev.cfgNone, "The same request with no login — refused, for comparison");

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
  const rd = (page.reply.body as any)?.revalidation_data ?? null;
  ev.page = { ...page, reply: { status: page.reply.status, body: { note: "only revalidation_data is kept from the vendor page reply", revalidation_data: rd } } };
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
  writeFileSync(join(EVID, "REV-15-vendor-detail-500.json"), JSON.stringify({ what: "vendor_detail answers HTTP 500 (exception and first code lines; e-mails and phones masked)", capturedAt: det.capturedAt, login: det.login, request: det.request, reply: { status: det.reply.status, exception: ev.detailParsed } }, null, 2));
  // the debug page itself, cut down to its header and message (the rest holds request details)
  const style = det.raw.match(/<style[\s\S]*?<\/style>/)?.[0] ?? "";
  const header = det.raw.match(/<header[\s\S]*?<\/header>/)?.[0] ?? `<header><h1>${esc(title)}</h1></header>`;
  const msgBlock = det.raw.match(/<div class="exception-message">[\s\S]*?<\/div>/)?.[0] ?? "";
  writeFileSync(join(EVID, "REV-16-debug-page-top.html"), `<!doctype html><html><head><meta charset="utf-8">${style}</head><body>${scrub(header)}<main role="main" id="container">${scrub(msgBlock)}<div style="padding:16px 22px;font:13px monospace;color:#555">Application trace (first lines): ${esc(trace.join("  ·  "))}<br><br>[The rest of the page — request parameters, headers and session details — was removed before saving.]</div></main></body></html>`);
  ev.otherHost = await fetch(`https://sec-api-v1.ag-ri.in/api/companies/vendor_detail?company_id=${pan}`, { signal: AbortSignal.timeout(60_000), headers: { "access-token": tok.accessToken, "lightspeed-token": tok.lightspeedToken, "app-version": "1.0.0", "Content-Type": "application/json" } }).then(async (r) => ({ status: r.status, body: (await r.text()).slice(0, 200) }));

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
  const cfg = (ev.cfgOwn.reply.body as any)?.config ?? {};
  const rows = await latestRows(CLIENT, vs, Object.keys(cfg.validations ?? {}));
  ev.syserrPassed = new Set(rows.filter((r) => r.status === "passed").map((r) => r.vendor)).size;
} finally {
  await client.dispose().catch(() => {});
}

// ═══ 2. code lines behind each bug (read-only git show) ══════════════════
const CODE: Record<string, Array<[string, number, number, number[]]>> = {
  "REV-01": [["app/controllers/api/vendor_revalidation_qa_controller.rb", 101, 107, [104]]],
  "REV-02": [["app/controllers/api/vendor_revalidation_qa_controller.rb", 164, 177, [177]], ["app/workers/vendor_revalidation/qa_trigger_worker.rb", 50, 56, [55]]],
  "REV-03": [["lib/external_api/validation.rb", 234, 241, [238, 240]]],
  "REV-05": [["lib/external_api/validation.rb", 71, 77, [74]]],
  "REV-06": [["app/controllers/concerns/companies_controller_helper.rb", 698, 708, [702]]],
  "REV-07": [["app/controllers/concerns/companies_controller_helper.rb", 698, 708, [705]]],
  "REV-08": [["app/services/vendor_revalidation/vendor_check_service.rb", 23, 30, [26, 27, 28]], ["app/services/vendor_revalidation/vendor_check_service.rb", 72, 75, [74]]],
  "REV-09": [["app/workers/vendor_revalidation/qa_trigger_worker.rb", 113, 124, [117, 118]]],
  "REV-10": [["app/workers/vendor_revalidation/qa_trigger_worker.rb", 36, 40, [39]], ["app/workers/vendor_revalidation/scheduler_worker.rb", 80, 83, [82]]],
  "REV-11": [["app/models/vendor_validation_history.rb", 47, 56, [52]]],
  "REV-12": [["app/models/vendor_validation_history.rb", 36, 40, [39]]],
  "REV-13": [["app/workers/vendor_revalidation/scheduler_worker.rb", 16, 26, [22, 23]], ["lib/external_api/validation.rb", 245, 252, [251]]],
  "REV-14": [["app/workers/vendor_revalidation/run_worker.rb", 53, 58, [56]]],
  "REV-04": [["app/models/vendor_validation_history.rb", 47, 63, [53, 62]]],
};
const fileCache = new Map<string, string[]>();
const codeOf = (file: string) => {
  if (!fileCache.has(file)) fileCache.set(file, execFileSync("git", ["-C", BACKEND, "show", `${AT}:${file}`], { encoding: "utf8" }).split("\n"));
  return fileCache.get(file)!;
};
const excerpts: Record<string, string> = {};
for (const [bug, parts] of Object.entries(CODE)) {
  excerpts[bug] = parts.map(([f, a, b]) => `# ${f}  (procol-backend rfx-uat-main @ ${AT})\n` + codeOf(f).slice(a - 1, b).map((l, i) => `${String(a + i).padStart(4)}  ${l}`).join("\n")).join("\n\n");
  writeFileSync(join(EVID, `${bug}-code.txt`), excerpts[bug] + "\n");
}

// ═══ 3. evidence cards → screenshots ═════════════════════════════════════
const CARD_CSS = `
  *{box-sizing:border-box} body{margin:0;background:#eef1f4;font:14px/1.45 -apple-system,"Segoe UI",Roboto,sans-serif;color:#1d2733}
  .card{width:1100px;padding:22px 24px;background:#eef1f4}
  .cap{font:600 12px/1.3 -apple-system,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#56677a;margin:0 0 10px}
  .grid{display:grid;gap:14px} .two{grid-template-columns:1fr 1fr}
  .panel{background:#fff;border:1px solid #cfd8e1;border-radius:6px;overflow:hidden}
  .bar{display:flex;gap:10px;align-items:center;padding:9px 12px;background:#f6f8fa;border-bottom:1px solid #cfd8e1;font:12.5px ui-monospace,Menlo,monospace}
  .m{font-weight:700;color:#0b6e4f} .u{color:#1d2733;word-break:break-all}
  .st{margin-left:auto;padding:2px 8px;border-radius:10px;font-weight:700;font-size:12px}
  .ok{background:#ffe1dc;color:#9b1c0c} .no{background:#dff3e8;color:#0b6e4f} .er{background:#fde9c9;color:#8a4b00}
  .who{padding:7px 12px;font-size:12px;color:#56677a;border-bottom:1px solid #edf1f4}
  pre{margin:0;padding:12px;font:12.5px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-word}
  mark{background:#ffe066;padding:0 2px;border-radius:2px}
  table{border-collapse:collapse;width:100%;font-size:13px} th,td{border:1px solid #d5dde5;padding:7px 9px;text-align:left;vertical-align:top}
  th{background:#f2f5f8;font-weight:600} .xl th{background:#e6efe9}
  .code pre{background:#0f1720;color:#d9e2ec} .code .ln{display:block;min-height:1.5em} .code .hl{background:#5c4b00;color:#fff3c4}
  .note{font-size:12.5px;color:#56677a;margin-top:10px}`;
const json = (v: unknown, marks: string[] = []) => {
  let s = esc(JSON.stringify(v, null, 2));
  for (const m of marks) s = s.split(esc(m)).join(`<mark>${esc(m)}</mark>`);
  return s;
};
const apiPanel = (c: Captured, marks: string[] = [], label?: string) => {
  const st = c.reply.status;
  return `<div class="panel"><div class="bar"><span class="m">GET</span><span class="u">${esc(c.request.url.replace(QA_HOST, "rfx-uat-api.ag-ri.in"))}</span><span class="st ${st === 200 ? "ok" : st >= 500 ? "er" : "no"}">${st === 200 ? "200 OK — answered" : st >= 500 ? `${st} server error` : `${st} refused`}</span></div>
    <div class="who">${esc(label ?? c.login)} · captured ${esc(c.capturedAt)}</div><pre>${json(c.reply.body, marks)}</pre></div>`;
};
const codePanel = (bug: string) => {
  const parts = CODE[bug] ?? [];
  return parts.map(([f, a, b, hl]) => `<div class="panel code"><div class="bar"><span class="u">${esc(f)}</span><span class="st no" style="background:#e8edf2;color:#33475b">rfx-uat-main @ ${AT}</span></div><pre>${codeOf(f).slice(a - 1, b).map((l, i) => {
    const n = a + i;
    const line = `${String(n).padStart(4)}  ${esc(l)}`;
    return `<span class="ln${hl.includes(n) ? " hl" : ""}">${line || " "}</span>`;
  }).join("")}</pre></div>`).join("");
};
const listingTable = (rows: any[], marks: string[]) => `<div class="panel"><table><tr><th>Vendor</th><th>Validation Status</th><th>Last Validated At</th><th>Validation Errors</th></tr>${rows.map((r) => {
  let e = esc(r.vendor_validation_errors);
  for (const m of marks) e = e.split(esc(m)).join(`<mark>${esc(m)}</mark>`);
  let s = esc(r.vendor_validation_status);
  if (marks.includes(r.vendor_validation_status)) s = `<mark>${s}</mark>`;
  return `<tr><td>${esc(r.name)}<br><small>#${esc(r.id)}</small></td><td>${s}</td><td>${esc(r.vendor_last_validated_at) || "<i>(blank)</i>"}</td><td>${e || "<i>(blank)</i>"}</td></tr>`;
}).join("")}</table></div>`;

const panVal = ev.rowPan?.row?.vendor_validation_errors?.match(/PAN (\S+):/)?.[1] ?? "";
const bankVal = ev.rowBank?.row?.vendor_validation_errors?.match(/BANK (\S+ \/ \S+):/)?.[1] ?? "";
const cards: Record<string, string> = {
  "REV-01": `<p class="cap">Captured on UAT — the revalidation controls answer a customer's admin</p>
    <div class="grid two">${apiPanel(ev.cfgOwn, ["\"client_company_id\": 47053", "\"enabled\": true"], `${who}, asking for GMMCO`)}${apiPanel(ev.cfgOther, ["\"client_company_id\": 198678"], `${who}, asking for PROCOL DEMO (another customer)`)}</div>
    <p class="cap" style="margin-top:14px">For comparison — what a refusal looks like (same request, no login)</p>${apiPanel(ev.cfgNone)}
    <p class="note">Expected for both GMMCO-admin requests: refused with code 5 "Not authorized". Tokens removed.</p>`,
  "REV-04": `<p class="cap">Captured on UAT — what the buyer's listing and vendor page receive (Procol test vendors)</p>
    ${listingTable([ev.rowPan?.row, ev.rowBank?.row].filter(Boolean), [panVal, bankVal.split(" / ")[0]])}
    <div class="grid two" style="margin-top:14px">${apiPanel(ev.page, [panVal], `${who} — vendor page data, vendor #${ev.vendors.pan}`)}${apiPanel(ev.pageBank, [bankVal.split(" / ")[0]], `${who} — vendor page data, vendor #${ev.vendors.bank}`)}</div>
    <p class="note">Highlighted: full PAN and full bank account number. Expected: masked, e.g. ******789J.</p>`,
  "REV-06": `<p class="cap">Captured on UAT — listing row of a vendor that no run has checked</p>${listingTable([ev.rowNever?.row].filter(Boolean), ["Pending"])}
    <p class="note">Expected: Validation Status blank. Vendor name hidden (real vendor).</p>`,
  "REV-07": `<p class="cap">From GMMCO's own vendor Excel, downloaded ${esc(nowIst())} — ${ev.excelJoined} cells like this (test vendors shown)</p>
    <div class="panel xl"><table><tr>${(ev.excelHeaders ?? []).map((h: string) => `<th>${esc(h)}</th>`).join("")}</tr>${(ev.excelRows ?? []).map((r: any[]) => `<tr>${r.map((c, i) => `<td>${i === 2 ? esc(c).split("; ").join("<mark>; </mark>") : esc(c)}</td>`).join("")}</tr>`).join("")}</table></div>
    <p class="note">Expected: one error per line inside the cell.</p>`,
  "REV-15": `<p class="cap">Captured on UAT — vendor_detail fails for every vendor</p>
    <div class="panel"><div class="bar"><span class="m">GET</span><span class="u">rfx-uat-api.ag-ri.in/api/companies/vendor_detail?company_id=${ev.vendors.pan}</span><span class="st er">${ev.detail.reply.status} server error</span></div><div class="who">${esc(who)} · captured ${esc(ev.detail.capturedAt)}</div>
    <pre><b>${esc(ev.detailParsed.title)}</b>\n\n${esc(ev.detailParsed.message).replace(/undefined method `integration_status'/, "<mark>undefined method `integration_status'</mark>")}\n\nCode path: ${esc(ev.detailParsed.trace.join(" → "))}</pre></div>
    <div class="panel" style="margin-top:14px"><div class="bar"><span class="m">GET</span><span class="u">sec-api-v1.ag-ri.in/api/companies/vendor_detail?company_id=${ev.vendors.pan}</span><span class="st er">${ev.otherHost.status}</span></div><pre>${esc(ev.otherHost.body)}</pre></div>
    <p class="note">E-mails and phone numbers masked.</p>`,
};
for (const b of spec.BUGS) if (!cards[b.id]) cards[b.id] = `<p class="cap">${b.id === "REV-16" ? "" : "Found in the code — the lines behind this bug"}</p>${codePanel(b.id)}`;

const { chromium } = await import(pathToFileURL(join(ROOT, "procol test", "node_modules", "playwright", "index.mjs")).href);
const browser = await chromium.launch();
const pg = await browser.newPage({ viewport: { width: 1148, height: 900 }, deviceScaleFactor: 2 });
for (const [bug, body] of Object.entries(cards)) {
  if (bug === "REV-16") continue;
  if (!body.trim()) continue;
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CARD_CSS}</style></head><body><div class="card">${body}</div></body></html>`);
  await pg.locator(".card").screenshot({ path: join(SHOTS, `${bug}.png`) });
}
// REV-16: the server's own error page (header + message only)
await pg.goto(pathToFileURL(join(EVID, "REV-16-debug-page-top.html")).href);
await pg.setViewportSize({ width: 1148, height: 620 });
const box = await pg.evaluate("Math.ceil(((document.querySelector(\"main\") ?? document.body).getBoundingClientRect().bottom) + 12)") as number;
await pg.screenshot({ path: join(SHOTS, "REV-16.png"), clip: { x: 0, y: 0, width: 1148, height: Math.min(box, 620) } });
await browser.close();
const shotOf = (bug: string) => (readdirSync(SHOTS).includes(`${bug}.png`) ? `screenshots/${bug}.png` : "");

// ═══ 4. test results in plain words ══════════════════════════════════════
const RUNS = join(here, "..", "data", "runs");
function newestRun(company: number, minCases: number) {
  for (const f of readdirSync(RUNS).filter((x) => x.endsWith(".json")).sort().reverse()) {
    try {
      const r = JSON.parse(readFileSync(join(RUNS, f), "utf8"));
      if (r.companyId === company && (r.checkResults ?? []).filter((c: any) => String(c.id).startsWith("API-XREV-")).length >= minCases) return r;
    } catch {
      /* skip */
    }
  }
  return null;
}
const main = newestRun(CLIENT, 30);
const demo = newestRun(OTHER, 1);
const res = new Map<string, any>();
for (const c of main?.checkResults ?? []) res.set(c.id, { ...c, company: "GMMCO (47053)", runId: main.id });
for (const c of demo?.checkResults ?? []) if (c.id === "API-XREV-H-01") res.set(c.id, { ...c, company: "PROCOL DEMO (198678)", runId: demo.id });

const cases = JSON.parse(readFileSync(join(here, "..", "data", "api-cases-extra", "revalidation.json"), "utf8"));
const AREA: Record<string, string> = Object.fromEntries(Object.entries(spec.MODULES).map(([, m]: any) => [m.feature, m.title]));
const NOT_RUN: Record<string, string> = {
  config: "Not run yet — this test changes the revalidation settings, which needs a Procol staff login token. We have not received one yet.",
  run: "Not run yet — this test starts a real revalidation check, which needs a Procol staff login token. We have not received one yet.",
  dev: "Not run — needs a developer (for example to fake a provider outage, shorten the 24-hour wait, or read the server logs).",
  manual: "Not run — needs a person to change real vendor data or a second customer's settings.",
  ui: "Not run — a check on the buyer's screen.",
  code: "Not run on purpose — found by reading the code. Trying it would change real data, or it needs production or Sentry access.",
};
const plainSaw = (v: string) => v.replace(/\s*\[after: [^\]]*\]/, "").replace(/\[vendors: ([^\]]*)\]/, (_m, x) => `(test vendor ${x.replace(/V-[A-Z0-9-]+=/g, "#")})`).replace(/\d+ check\(s\) held:?\s*/, "").replace(/^not run — /, "");
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
    result = /VR_QA_TOKEN|employee/.test(r.verdict) ? "Not run — needs Procol staff token" : "Not run — set-up missing";
    saw = /VR_QA_TOKEN|employee/.test(r.verdict) ? NOT_RUN[c.reval.tier] ?? plainSaw(r.verdict) : `Not run — ${plainSaw(r.verdict)}`;
  } else if (r) {
    result = "Couldn't tell";
    saw = plainSaw(r.verdict);
  } else {
    result = { dev: "Not run — needs a developer", manual: "Not run — manual", ui: "Not run — screen check", code: "Not run — found in code" }[c.reval.tier as string] ?? "Not run";
    saw = `${NOT_RUN[c.reval.tier] ?? ""}${c.reval.why ? ` Detail: ${c.reval.why}` : ""}`;
  }
  return { id: key, area: AREA[c.feature] ?? c.feature, title: c.title, priority: c.severity, result, checked: c.expectedResult, saw, bug: bug ?? "", where: r?.company ?? "" };
});
const tally = (k: (x: any) => boolean) => results.filter(k).length;
const passed = tally((x: any) => x.result === "Passed");
const failed = tally((x: any) => x.result === "Failed");
const token = tally((x: any) => x.result.includes("token"));
const otherNot = results.length - passed - failed - token;

// ═══ 5. the bug rows (plain words + live counts) ═════════════════════════
const fill = (s: string) => String(s).replace("{{n_excel_joined}}", String(ev.excelJoined)).replace("{{today}}", today).replace("{{n_syserr_passed}}", String(ev.syserrPassed));
const SEV_WORD: Record<string, string> = { Critical: "Critical — fix before release", High: "High", Medium: "Medium", Low: "Low" };
const evidenceFiles = readdirSync(EVID);
const bugs = spec.BUGS.map((b: any) => {
  const d = details[b.id] ?? {};
  return {
    id: b.id, severity: b.severity, short: d.short ?? b.title, proof: d.proof ?? b.status, where: d.where ?? "", steps: d.steps ?? [],
    expected: fill(d.expected ?? ""), actual: fill(d.actual ?? b.detail), impact: fill(d.impact ?? ""), fix: d.fix ?? b.fix, tech: d.tech ?? b.evidence,
    tests: b.cases, shot: shotOf(b.id), files: evidenceFiles.filter((f) => f.startsWith(`${b.id}-`)),
    results: b.cases.map((id: string) => `${id}: ${results.find((r: any) => r.id === id)?.result ?? "—"}`).join(" · "),
  };
});
const sevOrder = ["Critical", "High", "Medium", "Low"];
bugs.sort((a: any, b: any) => sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity) || a.id.localeCompare(b.id));
const confirmed = bugs.filter((b: any) => /^Confirmed/.test(b.proof)).length;

// ═══ 6. Excel ════════════════════════════════════════════════════════════
const wb = XLSX.utils.book_new();
const sheet = (rows: any[], widths: number[]) => {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  return ws;
};
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ["Vendor revalidation — bug sheet"], [`Tested on UAT (rfx-uat-api) for GMMCO (47053) · results of ${main?.id ?? "—"} · sheet made ${nowIst()}`], [],
  ["Bugs found", bugs.length], ["  confirmed on UAT", confirmed], ["  found in the code (to confirm or decide)", bugs.length - confirmed],
  ["  Critical", bugs.filter((b: any) => b.severity === "Critical").length], ["  High", bugs.filter((b: any) => b.severity === "High").length], ["  Medium", bugs.filter((b: any) => b.severity === "Medium").length], ["  Low", bugs.filter((b: any) => b.severity === "Low").length], [],
  ["Automated tests", results.length], ["  passed", passed], ["  failed (each one is a bug in the Bugs sheet)", failed], ["  not run yet — need a Procol staff token", token], ["  not run — need a developer, a person, the screen, or found in code", otherNot], [],
  ["Manual tests", "143 — in the Manual tests sheet, ready to fill in"],
]), "Summary");
XLSX.utils.book_append_sheet(wb, sheet(bugs.map((b: any) => ({
  "Bug ID": b.id, "What's wrong": b.short, "How serious": SEV_WORD[b.severity], "Proven?": b.proof, Where: b.where,
  "Steps to see it": b.steps.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n"), "What should happen": b.expected, "What actually happens": b.actual,
  "Why it matters": b.impact, "Suggested fix": b.fix, Screenshot: b.shot, "Attached files": b.files.map((f: string) => `evidence/${f}`).join("\n"), "Related tests": b.results, "Technical note": b.tech,
})), [8, 46, 16, 26, 30, 50, 50, 60, 50, 44, 22, 36, 30, 60]), "Bugs");
XLSX.utils.book_append_sheet(wb, sheet(results.map((r: any) => ({
  "Test ID": r.id, Area: r.area, Test: r.title, Priority: r.priority, Result: r.result, "What should happen": r.checked, "What we saw / why not run": r.saw, Bug: r.bug, "Tested on": r.where,
})), [8, 30, 46, 9, 30, 60, 80, 8, 20]), "Test results");
const wbIn = XLSX.read(readFileSync(join(ROOT, "test-cases", "Vendor_Revalidation_Test_Cases.xlsx")));
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(XLSX.utils.sheet_to_json(wbIn.Sheets["Test Cases"] ?? wbIn.Sheets[wbIn.SheetNames[0]], { defval: "" })), "Manual tests");
XLSX.writeFile(wb, join(OUT, "Bug sheet.xlsx"));

// ═══ 7. the page ═════════════════════════════════════════════════════════
const img = (rel: string) => (rel ? `data:image/png;base64,${readFileSync(join(OUT, rel)).toString("base64")}` : "");
const pill = (r: string) => `<span class="pill ${r === "Passed" ? "p-ok" : r === "Failed" ? "p-bad" : r.includes("token") ? "p-wait" : "p-off"}">${esc(r)}</span>`;
const sevPill = (s: string) => `<span class="sev s-${s.toLowerCase()}">${esc(s)}</span>`;
const areas = [...new Set(results.map((r: any) => r.area))] as string[];
const html = `<title>Vendor Revalidation Bug Sheet</title>
<style>
/* Layout: one reading column; a short summary, the bug register, then each bug as a self-contained page section, then every test result by area. */
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
.bug{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:22px 24px;margin-top:22px;display:flex;flex-direction:column;gap:14px;min-width:0}
.bug header{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:baseline}
.bug dl{display:grid;grid-template-columns:170px 1fr;gap:10px 18px;margin:0} .bug dt{font-weight:700;color:var(--muted);font-size:.9rem} .bug dd{margin:0;min-width:0}
.bug ol{margin:0;padding-left:20px} .bug figure{margin:0} .bug figure img{border:1px solid var(--line);border-radius:6px;display:block}
.bug figcaption{font-size:.85rem;color:var(--muted);margin-top:6px}
.tech{font-family:var(--f-mono);font-size:.8rem;color:var(--muted);background:var(--bg);border-radius:6px;padding:10px 12px;overflow-wrap:anywhere}
.files{font-family:var(--f-mono);font-size:.8rem}
.area{margin-top:28px} .area h3{margin-bottom:10px}
.saw{color:var(--muted);font-size:.88rem;margin-top:4px;overflow-wrap:anywhere}
.glossary{display:grid;grid-template-columns:200px 1fr;gap:8px 18px}
@media (max-width:640px){.bug dl,.glossary{grid-template-columns:1fr}.bug dt{margin-top:6px}h1{font-size:1.6rem}}
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=JetBrains+Mono:wght@400&display=swap">
<div class="wrap">
  <p class="muted">Procol QA · Vendor revalidation · UAT</p>
  <h1>Vendor Revalidation Bug Sheet</h1>
  <p class="lead" style="margin-top:12px">Vendor revalidation re-checks every vendor's GST, PAN, MSME and bank details on a schedule, and shows the result on the buyer's vendor listing. We tested it on UAT for GMMCO and found <b>${bugs.length} bugs</b>. ${confirmed} of them we saw happen on UAT; the rest we found by reading the code. The most serious one: <b>any customer's admin can use Procol's private revalidation controls, for any customer</b>.</p>
  <div class="facts">
    <div class="fact"><b>${bugs.length}</b><span>bugs (${bugs.filter((b: any) => b.severity === "Critical").length} critical, ${bugs.filter((b: any) => b.severity === "High").length} high)</span></div>
    <div class="fact"><b>${passed}</b><span>tests passed</span></div>
    <div class="fact"><b>${failed}</b><span>tests failed — each is a bug below</span></div>
    <div class="fact"><b>${token}</b><span>tests waiting for a Procol staff token</span></div>
    <div class="fact"><b>${otherNot}</b><span>tests that need a developer, a person or the screen</span></div>
  </div>
  <p class="muted" style="margin-top:14px;font-size:.88rem">Tested ${esc(main?.ts?.slice(0, 10) ?? today)} on https://rfx-uat-api.ag-ri.in (backend branch rfx-uat-main @ ${AT}), logged in as GMMCO's admin. Screenshots are of the live replies we captured on ${esc(nowIst())}; the buyer's screen for this new feature was not reachable, so the screenshots show exactly what that screen receives. Tokens are removed and real vendors' personal details are hidden. Values shown in full belong to Procol test vendors.</p>

  <h2>All bugs at a glance</h2>
  <div class="tbl" style="margin-top:16px"><table><tr><th>Bug</th><th>What's wrong</th><th>How serious</th><th>Proven?</th></tr>
  ${bugs.map((b: any) => `<tr><td class="id"><a href="#${b.id}">${b.id}</a></td><td>${esc(b.short)}</td><td>${sevPill(b.severity)}</td><td>${esc(b.proof)}</td></tr>`).join("")}</table></div>

  <h2>The bugs, one by one</h2>
  ${bugs.map((b: any) => `<section class="bug" id="${b.id}">
    <header><span class="id">${b.id}</span>${sevPill(b.severity)}<span class="muted" style="font-size:.9rem">${esc(b.proof)}</span></header>
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
    ${b.shot ? `<figure><img src="${img(b.shot)}" alt="Evidence for ${b.id}: ${esc(b.short)}"><figcaption>${b.id === "REV-16" ? "The UAT server's own error page (top part only; request details removed)." : /^Confirmed/.test(b.proof) ? "Live reply captured on UAT. Highlighted: the part that is wrong." : "The code lines behind this bug (highlighted)."}</figcaption></figure>` : ""}
    <p class="tech">${esc(b.tech)}</p>
  </section>`).join("")}

  <h2>Every test and its result</h2>
  <p class="lead" style="margin-top:14px">${results.length} automated tests: the 138 from the QA guide plus ${results.length - 138} we added after reading the code. "Not run yet — needs Procol staff token" means the test changes settings or starts a real check; it runs as soon as a Procol staff login token is added. The 143 manual tests are in the Excel (sheet "Manual tests").</p>
  ${areas.map((a) => `<div class="area"><h3>${esc(a)}</h3><div class="tbl"><table><tr><th>Test</th><th>What we tested</th><th>Result</th></tr>
    ${results.filter((r: any) => r.area === a).map((r: any) => `<tr><td class="id">${esc(r.id)}</td><td><b>${esc(r.title)}</b><div class="saw">${esc(r.saw)}</div></td><td>${pill(r.result)}${r.bug ? `<br><a class="id" href="#${r.bug}">${r.bug}</a>` : ""}</td></tr>`).join("")}</table></div></div>`).join("")}

  <h2>What is still needed</h2>
  <div class="stack" style="margin-top:16px">
    <p><b>A Procol staff login token.</b> ${token} tests change the revalidation settings or start real checks. The QA controls allow this only for Procol staff (as intended — see REV-01). Copy the <code>access-token</code> of any request to rfx-uat-api.ag-ri.in while logged in as Procol staff, and put it in <code>prototype/.env</code> as <code>VR_QA_TOKEN</code>. Every such test saves the settings first and puts them back after.</p>
    <p><b>A developer.</b> Provider outages, the 24-hour deadline, crashes and server logs (module "Provider limits").</p>
    <p><b>A person on screen.</b> The 143 manual tests, and the screen-only checks (filters, vendor portal).</p>
  </div>

  <h2>Words used here</h2>
  <div class="glossary" style="margin-top:16px">
    <b>Revalidation run</b><span>One check of a customer's vendors on one date. Starts at 11 pm IST by itself, or when Procol starts one for testing.</span>
    <b>Provider</b><span>The outside service that confirms a GST, PAN, MSME or bank number. Each call costs money.</span>
    <b>Validation Status</b><span>The vendor's overall result: Passed, Failed, Skipped (nothing to check) or System Error (could not be checked).</span>
    <b>QA controls</b><span>The private settings and "start a run" API that Procol uses to set up revalidation for a customer.</span>
    <b>Confirmed on UAT</b><span>We made it happen on the UAT system and captured the reply.</span>
    <b>Found in the code</b><span>The code makes it certain, but we did not (or must not) make it happen, usually because it would change real data.</span>
  </div>
</div>
`;
writeFileSync(join(OUT, "Bug sheet.html"), html);
writeFileSync(join(OUT, "README.txt"), `Vendor revalidation — bug sheet (${today})\n\nOpen "Bug sheet.html" in any browser (screenshots are inside it), or "Bug sheet.xlsx".\nscreenshots/  one picture per bug\nevidence/     the captured requests and replies (tokens removed), the code lines behind each bug, the Excel extract\n\nMade by: cd prototype && npm run reval:bugsheet\n`);
execFileSync("zip", ["-qr", `${OUT}.zip`, "."], { cwd: OUT });
await pool.closePool();
console.log(`${bugs.length} bugs (${confirmed} confirmed) · ${results.length} tests: ${passed} passed, ${failed} failed, ${token} waiting for the token, ${otherNot} other\n→ ${OUT}\n→ ${OUT}.zip`);
process.exit(0);
