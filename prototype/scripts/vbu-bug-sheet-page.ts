/**
 * The vendor bulk upload bug sheet as ONE shareable page, with every sheet
 * that was uploaded inside it.
 *
 *   npm run vbu:bugpage -- --out <file.html>
 *
 * Same content as test-cases/vendor-bulk-bug-sheet.md (bug registry + the
 * plain-language detail + the newest failing evidence of each case + the run
 * history), plus, for every case:
 *   • the exact file that was uploaded (the template filled with that run's
 *     values), rebuilt from the evidence record;
 *   • the template it was filled from, with its {{placeholders}};
 *   • the baseline sheet(s) that had to exist first;
 * and one zip holding all of them. The page offers them through the Artifact
 * `downloads` capability (a plain link cannot download inside the viewer).
 * Nothing here calls Procol.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { sheetGrid, vbuBugs, type VbuBug, type VbuEvidence } from "../src/checks/vendorBulkExtras.js";
import { bugDetail, latestEvidence, seenFromEvidence, seenFromResult, TRIPWIRE_NOTE, usesTripwire, type Seen } from "../src/report/vbuBugDetail.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const RUNS = join(ROOT, "data", "runs");
const PROCOL_TEST = join(ROOT, "..", "procol test");
const m = await import(pathToFileURL(join(PROCOL_TEST, "src", "flows", "vendorBulkUpload.ts")).href);
const CASES: any[] = JSON.parse(readFileSync(join(ROOT, "data", "api-cases-extra", "vbu.json"), "utf8"));
const CLIENT: Record<number, string> = { 47053: "GMMCO LIMITED (47053)", 198678: "PROCOL DEMO (198678)" };
const argOut = process.argv.indexOf("--out");
const OUT = argOut > 0 ? process.argv[argOut + 1] : join(ROOT, "data", "vendor-bulk-bug-sheet.html");
/** extensions the viewer's save button accepts */
const SAVEABLE = /\.(xlsx|docx|csv|pdf|png|zip)$/i;

// ── run history (same as the written sheet) ────────────────────────────────
type Hit = { run: string; companyId: number; pass: boolean; inconclusive: boolean; r: any };
const history = new Map<string, Hit[]>();
for (const f of readdirSync(RUNS).filter((f) => f.endsWith(".json")).sort()) {
  let run: any;
  try {
    run = JSON.parse(readFileSync(join(RUNS, f), "utf8"));
  } catch {
    continue;
  }
  for (const r of run.checkResults ?? []) {
    if (!String(r.id).startsWith("VBU-")) continue;
    const list = history.get(r.id) ?? [];
    list.push({ run: f.replace(/\.json$/, ""), companyId: run.companyId, pass: !!r.pass, inconclusive: !r.pass && !!r.inconclusive, r });
    history.set(r.id, list);
  }
}
const day = (iso: string) => {
  const d = new Date(iso.slice(0, 10));
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};
function tally(caseId: string) {
  const hits = (history.get(caseId) ?? []).filter((h) => !h.inconclusive);
  const fail = hits.filter((h) => !h.pass).length;
  const per = new Map<number, { f: number; p: number }>();
  for (const h of hits) {
    const t = per.get(h.companyId) ?? { f: 0, p: 0 };
    h.pass ? t.p++ : t.f++;
    per.set(h.companyId, t);
  }
  const last = hits[hits.length - 1];
  const lastFail = [...hits].reverse().find((h) => !h.pass);
  const text = hits.length
    ? `${[...per].map(([c, t]) => `${CLIENT[c] ?? c}: failed ${t.f} of ${t.f + t.p}`).join("; ")}${last ? ` · last run ${day(last.run)}: ${last.pass ? "passed" : "failed"}` : ""}`
    : "not run yet";
  return { text, fail, all: hits.length, last, lastFail };
}

// ── the files ──────────────────────────────────────────────────────────────
const files = new Map<string, Buffer>(); // download name → bytes
const addFile = (name: string, buf: Buffer) => { if (!files.has(name)) files.set(name, buf); return name; };

/** {{tokens}} a fixture uses, so the page can show the values filled in. */
function tokensOf(file: string): string[] {
  try {
    const raw = readFileSync(join(m.VBU_FIXTURE_DIR, file));
    const text = /\.(xlsx|xls)$/i.test(file) ? JSON.stringify(sheetGrid(raw.toString("base64"))) : raw.toString("utf8");
    return [...new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map((x) => x[1]))];
  } catch {
    return [];
  }
}

interface CaseView {
  id: string; title: string; tally: ReturnType<typeof tally>; tier: string;
  when?: string; client?: string; request?: string; tripwire: boolean;
  grid?: { headers: string[]; rows: string[][] };
  seen?: Seen; sent?: string; template?: string; second?: string; baselines: string[];
  vars: [string, string][]; notRun?: string;
}

function caseView(caseId: string): CaseView {
  const c = CASES.find((x) => x.id === caseId);
  const t = tally(caseId);
  const ev: VbuEvidence | undefined = latestEvidence(caseId, undefined, { failing: true });
  const v: CaseView = { id: caseId, title: c?.title ?? "", tally: t, tier: c?.tier ?? "", tripwire: usesTripwire(ev), baselines: [], vars: [] };
  if (!ev && !(t.lastFail ?? t.last)) {
    v.notRun = c?.tier === "real-mail" ? "Not run: this case would email the workspace's vendor-management team (real people), so it runs only with explicit approval." : "Not run on the sandbox yet.";
    return v;
  }
  if (ev) {
    v.when = day(new Date(Number(ev.runStamp)).toISOString());
    v.client = CLIENT[ev.companyId] ?? String(ev.companyId);
    v.grid = ev.sheet?.headers.length ? ev.sheet : undefined;
    v.seen = seenFromEvidence(ev);
    if (!ev.fixture && ev.request) v.request = `${ev.request.method} ${ev.request.path}${ev.request.body ? `  ${JSON.stringify(ev.request.body)}` : ""}`;
    if (ev.fixture) {
      const vars = ev.fixture.vars;
      const ext = ev.fixture.file.split(".").pop();
      v.sent = addFile(`${caseId}-uploaded.${ext}`, Buffer.from(m.loadFixture(ev.fixture.file, vars).base64, "base64"));
      v.template = addFile(`templates/${ev.fixture.file}`, readFileSync(join(m.VBU_FIXTURE_DIR, ev.fixture.file)));
      if (ev.fixture.file2) v.second = addFile(`${caseId}-uploaded-second.xlsx`, Buffer.from(m.loadFixture(ev.fixture.file2, vars).base64, "base64"));
      for (const b of String(c?.bulk?.baseline ?? "").split(",").filter(Boolean))
        v.baselines.push(addFile(`baselines/${b.replace(/\.xlsx$/, "")}-uploaded.xlsx`, Buffer.from(m.loadFixture(b, vars).base64, "base64")));
      v.vars = tokensOf(ev.fixture.file).filter((k) => vars[k] !== undefined).map((k) => [k, vars[k]]);
    }
  } else {
    const hit = (t.lastFail ?? t.last)!;
    v.when = day(hit.run);
    v.client = CLIENT[hit.companyId] ?? String(hit.companyId);
    v.request = String(hit.r.inputSummary ?? `${hit.r.request?.method} ${hit.r.request?.path}`).replace(/ · /, "  ");
    v.seen = seenFromResult(hit.r);
  }
  return v;
}

// ── page ───────────────────────────────────────────────────────────────────
const e = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const SEV = ["Critical", "High", "Medium", "Low"];
const bugs = [...vbuBugs()].sort(
  (a, b) => (a.status === "SUSPECTED" ? 1 : 0) - (b.status === "SUSPECTED" ? 1 : 0) || SEV.indexOf(a.severity) - SEV.indexOf(b.severity) || a.id.localeCompare(b.id),
);
const reproduced = bugs.filter((b) => b.status !== "SUSPECTED");
const views = new Map(bugs.map((b) => [b.id, b.cases.map(caseView)]));
const lastRun = [...history.values()].flat().map((h) => h.run).sort().pop() ?? "";

const btn = (name: string | undefined, label: string) =>
  name && SAVEABLE.test(name) ? `<button type="button" class="dl" data-file="${e(name)}">${e(label)}</button>` : "";

function seenList(s: Seen): string {
  const li: string[] = [];
  if (s.server) li.push(`<li><b>Server answer</b> <code>${e(s.server)}</code></li>`);
  if (s.popup) li.push(`<li><b>On screen</b> ${e(s.popup)}</li>`);
  if (s.history) li.push(`<li><b>Upload history</b> ${e(s.history)}</li>`);
  if (s.errorSheet.length) li.push(`<li><b>Error sheet</b> ${e(s.errorSheet.join("; "))}</li>`);
  if (s.changed.length) li.push(`<li><b>Changed on the way in</b> ${e(s.changed.join("; "))}</li>`);
  if (s.records.length) li.push(`<li><b>Created</b> ${e(s.records.join("; "))}</li>`);
  else if (s.server?.startsWith("HTTP 2")) li.push(`<li><b>Created</b> nothing</li>`);
  li.push(`<li><b>Test verdict</b> ${e(s.verdict)}</li>`);
  return `<ul class="seen">${li.join("")}</ul>`;
}

function caseHtml(v: CaseView): string {
  const parts = [`<div class="case" id="${e(v.id)}"><h4><span class="cid">${e(v.id)}</span> ${e(v.title)}</h4>`, `<p class="meta">Reproduced: ${e(v.tally.text)}</p>`];
  if (v.notRun) return parts.join("") + `<p>${e(v.notRun)}</p></div>`;
  if (v.grid) {
    parts.push(`<p class="cap">The sheet uploaded (${e(v.when)}, ${e(v.client)}). Column names are on row 3 and vendors start on row 4; empty columns are left out.</p>`);
    parts.push(`<div class="scroll"><table class="grid"><thead><tr><th>Row</th>${v.grid.headers.map((h) => `<th>${e(h.replace(/^ | $/g, "␣"))}</th>`).join("")}</tr></thead><tbody>${v.grid.rows
      .slice(0, 6)
      .map((r, i) => `<tr><td class="rn">${i + 4}</td>${r.map((c) => `<td>${c === "" ? "" : e(c.replace(/ $/, "␣"))}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div>`);
    if (v.grid.headers.some((h) => / $|^ /.test(h)) || v.grid.rows.flat().some((c) => / $/.test(c))) parts.push(`<p class="cap">␣ marks a space that is part of the value.</p>`);
  } else if (v.request) {
    parts.push(`<p class="cap">The request (${e(v.when)}, ${e(v.client)})</p><pre class="req">${e(v.request)}</pre>`);
  }
  const buttons = [btn(v.sent, "Save the file that was uploaded"), btn(v.second, "Save the second file"), ...v.baselines.map((b, i) => btn(b, v.baselines.length > 1 ? `Save baseline sheet ${i + 1}` : "Save the baseline sheet")), btn(v.template, "Save the template it was filled from")].filter(Boolean);
  if (buttons.length) parts.push(`<div class="btns">${buttons.join("")}</div>`);
  if (v.baselines.length) parts.push(`<p class="cap">This case needs a vendor to exist first. The baseline sheet creates it once per run, before the case is uploaded.</p>`);
  if (v.vars.length)
    parts.push(`<details class="vars"><summary>Values filled into the template for this run</summary><table class="kv">${v.vars.map(([k, val]) => `<tr><td><code>{{${e(k)}}}</code></td><td><code>${e(val)}</code></td></tr>`).join("")}</table></details>`);
  if (v.tripwire) parts.push(`<p class="note">${e(TRIPWIRE_NOTE)}</p>`);
  if (v.seen) parts.push(`<p class="cap">What the sandbox did${v.when ? ` (run of ${e(v.when)})` : ""}</p>${seenList(v.seen)}`);
  return parts.join("") + "</div>";
}

function bugHtml(b: VbuBug): string {
  const d = bugDetail(b.id);
  const sev = b.status === "SUSPECTED" ? "suspected" : b.severity.toLowerCase();
  const out = [`<section class="bug" id="${e(b.id.toLowerCase())}"><header class="bh"><span class="pill ${sev}">${e(b.status === "SUSPECTED" ? `${b.severity} · suspected` : b.severity)}</span><h3><span class="bid">${e(b.id)}</span> ${e(b.title)}</h3></header>`];
  out.push(`<p class="meta">${d ? `${e(d.area)} · ` : ""}${b.status === "SUSPECTED" ? "Suspected from the code, not reproduced" : "Open"} · found ${e(b.found)} · test case${b.cases.length > 1 ? "s" : ""} ${e(b.cases.join(", "))}</p>`);
  if (d) {
    out.push(`<dl class="facts">
      <dt>What the buyer does</dt><dd>${e(d.scenario)}</dd>
      <dt>What should happen</dt><dd><ul>${d.expected.map((x) => `<li>${e(x)}</li>`).join("")}</ul></dd>
      <dt>What happens instead</dt><dd>${e(d.actual)}</dd>
      <dt>What the buyer sees</dt><dd class="sees">${e(d.sees)}</dd>
      <dt>Why it matters</dt><dd>${e(d.impact)}</dd>
      ${d.note ? `<dt>Note on the test history</dt><dd>${e(d.note)}</dd>` : ""}
      <dt>Cause in the code</dt><dd>${e(b.cause)}</dd>
      <dt>Where</dt><dd><code>${e(b.where)}</code></dd>
      <dt>Suggested fix</dt><dd>${e(b.fix)}</dd>
    </dl>`);
  }
  out.push(...(views.get(b.id) ?? []).map(caseHtml));
  return out.join("") + "</section>";
}

const overview = bugs
  .map((b) => {
    const d = bugDetail(b.id);
    const vs = views.get(b.id) ?? [];
    const f = vs.reduce((n, v) => n + v.tally.fail, 0);
    const all = vs.reduce((n, v) => n + v.tally.all, 0);
    const sev = b.status === "SUSPECTED" ? "suspected" : b.severity.toLowerCase();
    return `<tr data-sev="${sev}"><td><a href="#${e(b.id.toLowerCase())}">${e(b.id)}</a></td><td><span class="pill ${sev}">${e(b.status === "SUSPECTED" ? "Suspected" : b.severity)}</span></td><td>${e(d?.area ?? "")}</td><td>${e(b.title)}</td><td>${e(d?.sees ?? "")}</td><td class="num">${e(d?.reproduced ?? (all ? `${f} of ${all} runs` : "not run"))}</td></tr>`;
  })
  .join("");

// one zip of every file
const tmp = mkdtempSync(join(tmpdir(), "vbu-sheets-"));
for (const [name, buf] of files) {
  mkdirSync(dirname(join(tmp, name)), { recursive: true });
  writeFileSync(join(tmp, name), buf);
}
writeFileSync(join(tmp, "README.txt"), [
  "Vendor bulk upload: every sheet behind the bug sheet.",
  "",
  "<case>-uploaded.xlsx           the exact file that was uploaded (the template filled with that run's values)",
  "<case>-uploaded-second.xlsx    the second file of a two-upload case",
  "baselines/                     sheets that create the vendor a case compares against (uploaded first, once per run)",
  "templates/                     the templates with {{placeholders}} they were filled from",
  "",
  "Rows 1-2 hold the group headings, row 3 the column names, and vendors start on row 4, as in Procol's own template.",
  "Every vendor is a test record: QA_Platform_VBU_<stamp>_..., qa_vbu_...@example.com, phone 0000000001, made-up tax numbers.",
  "A sheet that created vendors meets those vendors if uploaded again as it is: change the stamp in the names, emails and tax numbers first.",
].join("\n"));
const zipPath = join(tmp, "..", `vbu-sheets-${Date.now()}.zip`);
execFileSync("zip", ["-qr", zipPath, "."], { cwd: tmp });
files.set("vendor-bulk-upload-sheets.zip", readFileSync(zipPath));
rmSync(tmp, { recursive: true, force: true });
rmSync(zipPath, { force: true });

const fileData = Object.fromEntries([...files].map(([k, v]) => [k, v.toString("base64")]));
const bySev = SEV.map((s) => ({ s, n: reproduced.filter((b) => b.severity === s).length }));
const headers = m.GMMCO_TEMPLATE_HEADERS as string[];

const page = `<title>Vendor Bulk Upload Bugs</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap">
<style>
:root{--paper:#f5f6f3;--surface:#ffffff;--ink:#18212b;--muted:#5a6573;--rule:#d8ddd8;--accent:#1f5f8b;--code:#eef1ee;
  --crit:#a61b1b;--high:#b4470f;--med:#8a6100;--low:#55606e;--sus:#6b4fa0;
  --sans:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--cond:"IBM Plex Sans Condensed","Arial Narrow",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--paper:#10151b;--surface:#161d25;--ink:#e4e8ec;--muted:#9ba6b2;--rule:#2b343e;--accent:#73aedb;--code:#1d262f;--crit:#f07a7a;--high:#f0a06b;--med:#e3c062;--low:#a7b1bd;--sus:#b9a2ea}}
:root[data-theme="dark"]{color-scheme:dark;--paper:#10151b;--surface:#161d25;--ink:#e4e8ec;--muted:#9ba6b2;--rule:#2b343e;--accent:#73aedb;--code:#1d262f;--crit:#f07a7a;--high:#f0a06b;--med:#e3c062;--low:#a7b1bd;--sus:#b9a2ea}
body{background:var(--paper);color:var(--ink);font:15px/1.55 var(--sans);padding-inline:16px;padding-block:28px 64px}
.wrap{max-width:1020px;margin:0 auto;display:flex;flex-direction:column;gap:28px}
h1,h2,h3,h4{font-family:var(--cond);font-weight:600;text-wrap:balance;margin:0;line-height:1.25}
h1{font-size:30px}h2{font-size:21px;padding-bottom:6px;border-bottom:1px solid var(--rule)}h3{font-size:18px}h4{font-size:15px}
p{margin:0}a{color:var(--accent)}code,pre{font-family:var(--mono);font-size:12.5px}
code{background:var(--code);padding:1px 4px;border-radius:3px;overflow-wrap:anywhere}
.lede{max-width:72ch;display:flex;flex-direction:column;gap:10px}.muted,.meta,.cap{color:var(--muted)}.meta,.cap{font-size:13px}
.counts{display:flex;flex-wrap:wrap;gap:8px 18px;font-family:var(--cond);font-size:15px}.counts b{font-variant-numeric:tabular-nums}
.top{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
button.dl,button.main{font:500 13px var(--sans);color:var(--accent);background:var(--surface);border:1px solid var(--accent);border-radius:6px;padding:6px 12px;cursor:pointer}
button.main{background:var(--accent);color:var(--surface);font-size:14px;padding:9px 16px}
button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button[disabled]{opacity:.55;cursor:default}
.status{font-size:13px;color:var(--muted);min-height:1.2em}
.pill{display:inline-block;font:600 11.5px var(--cond);letter-spacing:.04em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid currentColor;white-space:nowrap}
.pill.critical{color:var(--crit)}.pill.high{color:var(--high)}.pill.medium{color:var(--med)}.pill.low{color:var(--low)}.pill.suspected{color:var(--sus)}
.scroll{overflow-x:auto;max-width:100%;border:1px solid var(--rule);border-radius:6px;background:var(--surface)}
table{border-collapse:collapse;font-size:13px}
table.ov{width:100%}table.ov th,table.ov td{padding:7px 9px;border-bottom:1px solid var(--rule);text-align:left;vertical-align:top}
table.ov th{font:600 12px var(--cond);letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
table.ov td:nth-child(5){min-width:220px}td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
table.grid{font-family:var(--mono);font-size:12px}table.grid th,table.grid td{padding:5px 8px;border-right:1px solid var(--rule);border-bottom:1px solid var(--rule);white-space:nowrap;text-align:left}
table.grid th{background:var(--code);font-weight:500}td.rn{color:var(--muted);font-variant-numeric:tabular-nums}
table.kv td{padding:3px 10px 3px 0}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.filters label{font-size:13px;display:flex;gap:5px;align-items:center}
#q{font:14px var(--sans);padding:6px 10px;border:1px solid var(--rule);border-radius:6px;background:var(--surface);color:var(--ink);min-width:0;flex:1 1 220px}
.how{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}
.how div{display:flex;flex-direction:column;gap:6px}.how h3{font-size:16px}
.bug{display:flex;flex-direction:column;gap:12px;padding-top:22px;border-top:2px solid var(--rule)}
.bh{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:baseline}.bid,.cid{font-family:var(--mono);font-weight:500;margin-right:4px}
dl.facts{display:grid;grid-template-columns:minmax(150px,190px) 1fr;gap:8px 18px;margin:0}
dl.facts dt{font:600 13px var(--cond);color:var(--muted);letter-spacing:.02em}dl.facts dd{margin:0;max-width:75ch}dl.facts ul{margin:0;padding-left:18px}
dd.sees{font-weight:500}
.case{display:flex;flex-direction:column;gap:8px;margin-left:clamp(0px,2vw,18px);padding:14px 16px;background:var(--surface);border:1px solid var(--rule);border-radius:8px}
.btns{display:flex;flex-wrap:wrap;gap:8px}
.note{font-size:13px;color:var(--muted);font-style:italic;max-width:80ch}
ul.seen{margin:0;padding-left:18px;font-size:14px;display:flex;flex-direction:column;gap:3px}ul.seen b{font-weight:600}
pre.req{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--code);padding:8px 10px;border-radius:6px}
details.vars summary{cursor:pointer;font-size:13px;color:var(--accent)}
@media (max-width:640px){dl.facts{grid-template-columns:1fr;gap:2px}dl.facts dd{margin-bottom:8px}h1{font-size:25px}}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style>
<div class="wrap">
<header class="lede">
  <h1>Vendor bulk upload — bug sheet</h1>
  <p><b>${reproduced.length} bugs reproduced on Procol's UAT sandbox, plus ${bugs.length - reproduced.length} suspected from the code.</b> Each bug lists what the buyer does, what should happen, what happens instead, the exact message the buyer sees, the sheet that was uploaded and the code line to fix. Latest run: ${e(day(lastRun))}. Backend: procol-backend main with PR 16267 (65728150bc).</p>
  <div class="counts">${bySev.map(({ s, n }) => `<span><span class="pill ${s.toLowerCase()}">${s}</span> <b>${n}</b></span>`).join("")}<span><span class="pill suspected">Suspected</span> <b>${bugs.length - reproduced.length}</b></span></div>
  <p class="muted">Clients tested: GMMCO LIMITED (47053; contactless ON; duplicate check on GST, address, pincode and account group) and PROCOL DEMO (198678; contactless OFF; required extra fields).</p>
  <div class="top"><button type="button" class="main dl" data-file="vendor-bulk-upload-sheets.zip">Save all ${files.size - 1} sheets as one zip</button><span class="status" id="status" role="status"></span></div>
</header>

<section class="how" aria-labelledby="how">
  <h2 id="how" style="grid-column:1/-1">How the sheets are formed</h2>
  <div><h3>The layout</h3><p>Every sheet uses Procol's own bulk upload template layout. Rows 1–2 hold the group headings (Mandatory Details, Optional Details), row 3 the column names, and vendors start on row 4. Columns are matched by name, so a sheet may carry only the columns a case needs. GMMCO's template has these columns:</p><p class="cap">${e(headers.join(" · "))}</p></div>
  <div><h3>Template, then values</h3><p>Each case has a template file with <code>{{placeholders}}</code>. At run time it is filled with that run's values, so every run uses fresh names and tax numbers:</p><ul class="seen"><li><code>{{stamp}}</code> a run number, used in names and emails</li><li>Company names <code>QA_Platform_VBU_&lt;stamp&gt;_&lt;case&gt;</code></li><li>Emails <code>qa_vbu_&lt;stamp&gt;_&lt;case&gt;_1@example.com</code>; phone <code>0000000001</code></li><li>GSTIN <code>27QATZQ&lt;4 digits&gt;Q1Z5</code>, PAN <code>QATZQ&lt;4 digits&gt;Q</code> (made up)</li><li>UK VAT <code>GB9&lt;4 digits&gt;00NN</code>, used where the sandbox's duplicate 'India' rows would get in the way (BUG-02)</li></ul></div>
  <div><h3>Rows that must not create anything</h3><p>A row testing a rule that should refuse it also carries a deliberate second mistake: <code>Status = QA_TRIPWIRE</code>. If the rule under test wrongly lets the row through, it stops at “Invalid Status” and nothing is created. So “Invalid Status” in an error sheet means the rule under test let the row through.</p></div>
  <div><h3>Reproducing a bug</h3><p>Save the file that was uploaded and upload it on Vendors → Bulk Upload in the same workspace (or send it base64-encoded as <code>excel_data</code> to <code>POST /api/v1/bulk_create_vendor</code>). A sheet that <i>created</i> vendors meets those vendors if uploaded again as it is. Change the stamp in its names, emails and tax numbers first, or fill the template again.</p></div>
</section>

<section aria-labelledby="ov" style="display:flex;flex-direction:column;gap:12px">
  <h2 id="ov">All bugs at a glance</h2>
  <div class="filters"><input id="q" type="search" placeholder="Filter by word, e.g. city, POC 2, 500" aria-label="Filter bugs">${["critical", "high", "medium", "low", "suspected"].map((s) => `<label><input type="checkbox" class="sevf" value="${s}" checked id="f-${s}"> ${s[0].toUpperCase() + s.slice(1)}</label>`).join("")}</div>
  <div class="scroll"><table class="ov"><thead><tr><th>Bug</th><th>Severity</th><th>Area</th><th>What goes wrong</th><th>What the buyer sees</th><th>Reproduced</th></tr></thead><tbody id="ovb">${overview}</tbody></table></div>
</section>

<main style="display:flex;flex-direction:column;gap:30px">${bugs.map(bugHtml).join("\n")}</main>
<p class="muted">Every vendor in these sheets is a test record. Generated by <code>npm run vbu:bugpage</code> in the QA repo from the bug registry and the newest evidence of each case.</p>
</div>
<script type="application/json" id="files">${JSON.stringify(fileData).replace(/</g, "\\u003c")}</script>
<script>
(function(){
  var FILES = JSON.parse(document.getElementById("files").textContent);
  var status = document.getElementById("status");
  var dl = null, ready = false;
  function say(t){ status.textContent = t; }
  function bytes(b64){ var s = atob(b64), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  var buttons = Array.prototype.slice.call(document.querySelectorAll("button.dl"));
  if (window.claude && window.claude.use) {
    window.claude.use("downloads").then(function(d){
      dl = d; ready = true;
      if (!d) { buttons.forEach(function(b){ b.disabled = true; b.title = "Saving files is not available in this view"; });
        say("Saving files is not available in this view. Open the page on claude.ai to save the sheets."); }
    }, function(){ ready = true; });
  } else { buttons.forEach(function(b){ b.disabled = true; }); say("Saving files works when the page is opened on claude.ai."); }
  document.addEventListener("click", function(ev){
    var b = ev.target.closest && ev.target.closest("button.dl"); if (!b) return;
    var name = b.getAttribute("data-file"); var data = FILES[name];
    if (!data) { say("That file is missing from the page."); return; }
    if (!dl) { say(ready ? "Saving files is not available in this view." : "One moment, the page is still starting."); return; }
    dl.save({ filename: name.split("/").pop(), data: bytes(data) }).then(function(){ say("Saved " + name.split("/").pop() + "."); }, function(err){
      var c = err && err.code;
      if (c === "declined") say("");
      else if (c === "rate_limited") say("A save is already waiting for your answer.");
      else say("Could not save " + name.split("/").pop() + (c ? " (" + c + ")" : "") + ".");
    });
  });
  var q = document.getElementById("q"), boxes = Array.prototype.slice.call(document.querySelectorAll(".sevf"));
  function filter(){
    var words = q.value.trim().toLowerCase(), on = {};
    boxes.forEach(function(x){ on[x.value] = x.checked; });
    Array.prototype.forEach.call(document.querySelectorAll("#ovb tr"), function(tr){
      var show = on[tr.getAttribute("data-sev")] && (!words || tr.textContent.toLowerCase().indexOf(words) >= 0);
      tr.hidden = !show;
      var sec = document.getElementById(tr.querySelector("a").getAttribute("href").slice(1));
      if (sec) sec.hidden = !show;
    });
  }
  q.addEventListener("input", filter); boxes.forEach(function(x){ x.addEventListener("change", filter); });
})();
</script>
`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, page);
console.log(`wrote ${OUT} — ${bugs.length} bugs, ${files.size} files, ${(Buffer.byteLength(page) / 1024 / 1024).toFixed(2)} MB`);
