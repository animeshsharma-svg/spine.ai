/**
 * A MANUAL test pack for vendor bulk upload: fresh sheets for a person to
 * upload on the screen, foldered by client and area, plus a checklist workbook
 * that says, for every case, which file to upload, what to do and exactly
 * what the tester should see.
 *
 *   npm run vbu:manualpack -- [--out <dir>] [--stamp <number>]
 *
 * Every sheet is filled with a NEW stamp, so names, emails and tax numbers
 * have never been used and nothing collides with earlier automated runs. The
 * values that come from each workspace's own template (its vendor profiles and
 * category codes) are taken from that workspace's newest evidence record.
 * Which cases apply to which client is decided by the runner's own rules
 * (vbuSkipReason) against the client's settings, read from the database
 * (SELECT only). Cases that would mail real people, change a workspace for
 * good, or need a setting neither client has get NO file: they are listed
 * on the checklist's last sheet with the reason.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as XLSX from "xlsx";

import { openClientContext } from "../src/executor.js"; // also loads the database settings (.env), as the runner does
import { resolveVbuWorkspace, vbuSkipReason, type BulkSpec } from "../src/checks/vendorBulk.js";
import { bugForCase, EVIDENCE_DIR, sheetGrid } from "../src/checks/vendorBulkExtras.js";
import { bugDetail } from "../src/report/vbuBugDetail.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const PROCOL_TEST = join(ROOT, "..", "procol test");
const m = await import(pathToFileURL(join(PROCOL_TEST, "src", "flows", "vendorBulkUpload.ts")).href);
const spec = await import(pathToFileURL(join(PROCOL_TEST, "scripts", "vendor-bulk", "spec.ts")).href);
const CASES: any[] = JSON.parse(readFileSync(join(ROOT, "data", "api-cases-extra", "vbu.json"), "utf8"));
const RUNS = join(ROOT, "data", "runs");

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const today = new Date().toISOString().slice(0, 10);
const OUT = arg("out") ?? join(ROOT, "..", `vendor-bulk-manual-pack-${today}`);

const CLIENTS = [
  { id: 47053, name: "GMMCO LIMITED", folder: "GMMCO-47053" },
  { id: 198678, name: "PROCOL DEMO", folder: "PROCOL-DEMO-198678" },
];
const SECTION_FOLDER: Record<number, string> = {
  1: "01-file-checks", 2: "02-template-history-error-sheet-access", 3: "03-row-rules-each-column", 4: "04-what-a-row-creates",
  5: "05-duplicates", 6: "06-values-kept-as-typed", 7: "07-company-settings", 8: "08-coverage-audit", 9: "09-field-combinations",
};
const FILLER = join(here, "fill_vbu_template.py");

/** The workspace's own template, exactly as the Bulk Upload screen downloads it. */
async function downloadTemplate(companyId: number, to: string): Promise<void> {
  const client: any = await openClientContext(companyId);
  try {
    const r = await client.ctx.buyerApi.raw("GET", "/v1/bulk_create_vendor_template");
    const url = (r.data as any)?.excel_url;
    if (!r.ok || !url) throw new Error(`template download refused (HTTP ${r.status}: ${r.message ?? "no excel_url"})`);
    writeFileSync(to, Buffer.from(await (await fetch(url)).arrayBuffer()));
  } finally {
    await client.dispose().catch(() => {});
  }
}

/**
 * A case whose sheet is an ordinary vendor sheet goes into the real template
 * (its dropdowns, colours and Data Sheet). One whose point is the file's own
 * shape stays as it is: its own headers or column order, blank-row gaps, a
 * second sheet, an old .xls, a wrong format, an empty file.
 */
function usesRealTemplate(caseId: string): boolean {
  const c = (spec.CASES as any[]).find((x) => x.id === caseId);
  const sh = c?.sheet;
  if (!sh || c.rawFixture) return false;
  return !sh.layout && !sh.headers && !sh.extraSheets && !sh.gapsAfter && sh.bookType !== "xls" && (sh.rows?.length ?? 0) > 0;
}

/** The filled values of a fixture, row by row, keyed by column name (numbers stay numbers). */
function filledRows(fixture: string, vars: Record<string, string>): Record<string, string | number>[] {
  const buf = Buffer.from(m.loadFixture(fixture, vars).base64, "base64");
  const wb = XLSX.read(buf, { type: "buffer" });
  const g: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: true, blankrows: true });
  const hdr = (g[2] ?? []).map((h) => String(h));
  return g.slice(3).map((r) => Object.fromEntries(hdr.map((h, i) => [h, r[i]]).filter(([h, v]) => h && v !== "" && v !== undefined)));
}
const SECTION_NAME: Record<number, string> = spec.SECTIONS;

// ── a stamp whose last four digits no earlier run used (they go into GSTIN/PAN/VAT) ──
const usedD4 = new Set<string>();
for (const d of existsSync(EVIDENCE_DIR) ? readdirSync(EVIDENCE_DIR) : []) usedD4.add(d.slice(-4));
let stamp = arg("stamp") ?? String(Date.now());
while (usedD4.has(stamp.slice(-4))) stamp = String(Number(stamp) + 1);

// ── per-client values that come from the workspace's own template ──
function templateVars(companyId: number): Record<string, string> {
  const keys = ["profile", "profileUpper", "profile2", "categoryUuid", "categoryUuid2", "categoryName"];
  for (const st of (existsSync(EVIDENCE_DIR) ? readdirSync(EVIDENCE_DIR) : []).sort().reverse()) {
    for (const f of readdirSync(join(EVIDENCE_DIR, st))) {
      try {
        const ev = JSON.parse(readFileSync(join(EVIDENCE_DIR, st, f), "utf8"));
        if (ev.companyId === companyId && ev.fixture?.vars?.categoryUuid) return Object.fromEntries(keys.map((k) => [k, ev.fixture.vars[k]]));
      } catch { /* */ }
    }
  }
  throw new Error(`no evidence for ${companyId} to take its profiles and category codes from — run one case on it first`);
}

// ── run history: the newest automated result per case per client ──
const lastResult = new Map<string, { pass: boolean; inconclusive: boolean; when: string }>();
for (const f of readdirSync(RUNS).filter((f) => f.endsWith(".json")).sort()) {
  let run: any; try { run = JSON.parse(readFileSync(join(RUNS, f), "utf8")); } catch { continue; }
  for (const r of run.checkResults ?? []) if (String(r.id).startsWith("VBU-"))
    lastResult.set(`${run.companyId}:${r.id}`, { pass: !!r.pass, inconclusive: !r.pass && !!r.inconclusive, when: f.slice(0, 10) });
}

const slug = (t: string) => t.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-$/, "");
const fill = (s: string, vars: Record<string, string>) => m.fillVars(s, vars) as string;
const TAB: Record<string, string> = { active: "Vendors (active)", invited: "Prospects", rejected: "Rejected", onboarding_in_progress: "Onboarding in progress" };
const TRIP = "“Invalid Status” is the PASS answer here: the row carries Status = QA_TRIPWIRE on purpose, so it stops there and creates nothing once the rule under test has let it through.";

type Row = Record<string, string | number>;

/** What the tester should see, in screen terms. */
function expectedText(c: any, names: string[], vars: Record<string, string>): string {
  const b = c.bulk ?? {};
  const out: string[] = [];
  if (c.id === "VBU-003") return "Red pop-up “Invalid file format”. Nothing is added to the upload history.";
  if (b.kind === "concurrent")
    return `Two SEPARATE lines appear in the upload history, one per file, each Total 1 · Failed 1 with “Invalid Status” in its error sheet. One line holding both files' rows means the two uploads were mixed.\n${TRIP}`;
  if (b.kind === "manualInvite") {
    const x = b.inviteExpect ?? {};
    const name = JSON.parse(fill(JSON.stringify(b.inviteBody ?? {}), vars)).firm_name;
    return x.http === "reject"
      ? `The form refuses it with a red message${x.message ? ` “${x.message}”` : ""}. NO vendor named ${name} appears in Vendors.`
      : `The form accepts it. ${name} appears in ${TAB[x.verify?.bscm] ?? "Vendors"}.`;
  }
  if (b.refuse) {
    out.push(`The upload is refused: red pop-up “${b.refuse.message ?? "an error"}”. No new line appears in the upload history.`);
  } else if (Array.isArray(b.rows)) {
    const rows: any[] = b.rows;
    const ok = rows.filter((r) => r.status === "success").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    out.push(`Green pop-up “Vendors Sheet Uploaded”. Upload history: Total ${rows.length} · Completed ${ok} · Failed ${failed}${b.anyOrder ? " (rows can finish in any order)" : ""}.`);
    rows.forEach((r, i) => {
      const who = names[i] ? ` (${names[i]})` : "";
      const msg = r.error ? `“${fill(r.error, vars)}”` : r.errorIncludes ? `a message containing “${fill(r.errorIncludes, vars)}”` : "";
      if (r.status === "failed") out.push(`Row ${i + 4}${who}: Failed${msg ? ` with ${msg}` : ""} in the error sheet (Download Excel).`);
      else out.push(`Row ${i + 4}${who}: Completed.`);
      const v = r.verify ?? {};
      if (v.absent) out.push(`Vendors list: NO vendor named ${names[i] ?? "this"} is created.`);
      if (v.bscm) out.push(`Vendors list: ${names[i] ?? "the vendor"} appears under ${TAB[v.bscm] ?? v.bscm}.`);
      if (v.invitations !== undefined) out.push(`It has ${v.invitations} invitation(s).`);
      if (v.teams !== undefined) out.push(`It is listed under ${v.teams} category (the Deals In code).`);
      if (v.fields) out.push(`Its details show: ${Object.entries(v.fields).map(([k, val]) => `${k.replace(/^misc\./, "")} = ${val === null ? "empty" : fill(String(val), vars)}`).join("; ")}.`);
      if (r.dataEquals) out.push(`The value is kept exactly: ${Object.entries(r.dataEquals).map(([k, val]) => `${k} = “${fill(String(val), vars)}”`).join("; ")}.`);
      if (r.dataExcludes) out.push(`The value must not turn into: ${Object.entries(r.dataExcludes).map(([k, val]) => `${k} containing “${val}”`).join("; ")}.`);
    });
    if (b.statusCounts) out.push(`Check the history line: ${Object.entries(b.statusCounts).map(([k, n]) => `${k.replace("success", "Completed").replace("already_mapped", "Duplicate").replace("failed", "Failed").replace("total", "Total")} ${n}`).join(" · ")}.`);
    if (rows.some((r) => r.error === "Invalid Status" || r.errorIncludes === "Invalid Status")) out.push(TRIP);
  }
  return out.join("\n");
}

/** How the case is carried out on the screen; null file list = no file for it. */
function howTo(c: any, vars: Record<string, string>): { mode: string; steps: string } {
  const b = c.bulk ?? {};
  const upload = "Vendors → Bulk Upload → Upload Excel → choose the file → Upload. Wait for the history line to finish, then Download Excel for the error sheet.";
  if (c.id === "VBU-003") return { mode: "screen", steps: `Upload the EMPTY file (0 bytes) in this folder the same way: ${upload}` };
  if (c.id === "VBU-036") return { mode: "screen", steps: "Open Vendors → Bulk Upload. The upload history table loads and lists your own uploads." };
  if (b.kind === "http" && !b.actor) return { mode: "api", steps: "API only: the screen cannot send this request." };
  if (b.actor === "seller-qa" || b.wrap || b.payload) return { mode: "api", steps: "API only: the screen cannot send this request." };
  if (b.actor === "member-no-company-create") {
    const what = c.path?.includes("template") ? "click Download template on the Bulk Upload screen" : c.path?.includes("status") ? "open Vendors → Bulk Upload" : c.path?.includes("error_sheet") ? "try Download Excel on an upload" : `upload the file: ${upload}`;
    return { mode: "screen (special user)", steps: `Log in as a workspace user WITHOUT permission to create vendors (a QA test user, not a real person), then ${what}.` };
  }
  if (b.kind === "template") return { mode: "screen", steps: "Vendors → Bulk Upload → Download template. Open it in Excel and check what the Expected column describes." };
  if (b.kind === "templateUpload") return { mode: "screen", steps: `Vendors → Bulk Upload → Download template. Open it, type QA_TRIPWIRE in the Status cell of row 4 (the sample row) and save. Then upload it: ${upload}` };
  if (b.kind === "manualInvite") {
    const body = JSON.parse(fill(JSON.stringify(b.inviteBody ?? {}), vars));
    const f: string[] = [`Company name “${body.firm_name}”`, `Contact name “${body.name ?? ""}”`, `Email “${body.email ?? ""}”`];
    if (body.tax_no) f.push(`Tax: VAT ${body.tax_no}, Business Location United Kingdom`);
    if (body.address) f.push(`Address “${body.address}”`);
    f.push("City Mumbai");
    if (body.pincode) f.push(`Pincode ${body.pincode}`);
    if (body.account_group) f.push(`Account Group ${body.account_group}`);
    if (body.skip_vendor_onboarding) f.push("Vendor onboarding: not required (skip)");
    return { mode: "screen (Invite Vendor form)", steps: `Vendors → Invite Vendor (the single-vendor form, not bulk upload). Fill in: ${f.join("; ")}. Leave every other field empty. Submit.` };
  }
  if (b.kind === "concurrent") return { mode: "screen", steps: "Open Vendors → Bulk Upload in TWO browser tabs. Choose file A in one and file B in the other, then click Upload in both as close together as you can." };
  if (b.kind === "errorSheetReupload") return { mode: "screen", steps: `${upload} Then upload that downloaded error sheet itself, unchanged, the same way.` };
  if (b.kind === "errorSheet") {
    if (b.errorSheetCheck === "realJob" || b.errorSheetCheck === "profileDropdown")
      return { mode: "screen", steps: `${upload} Open the error sheet in Excel and check what the Expected column describes${b.errorSheetCheck === "profileDropdown" ? " (click the Vendor Profile cell of a failed row: it should offer the profile list)" : ""}.` };
    return { mode: "api", steps: "API only: the screen disables Download Excel when nothing failed." };
  }
  if (b.kind === "formulaSheet") return { mode: "screen", steps: `${upload} Open the error sheet in Excel and click the Company Name cell of the failed row.` };
  return { mode: "screen", steps: upload };
}

// ── build ──────────────────────────────────────────────────────────────────
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const sheets: Record<string, Row[]> = {};
const notHere: Row[] = [];
const seenNotHere = new Set<string>();
let fileCount = 0;

const otherCat: Record<number, string> = {};
const tv: Record<number, Record<string, string>> = {};
for (const cl of CLIENTS) tv[cl.id] = templateVars(cl.id);
otherCat[47053] = tv[198678].categoryUuid;
otherCat[198678] = tv[47053].categoryUuid;

const comboRows: Row[] = [];
for (const cl of CLIENTS) {
  const blank = join(OUT, cl.folder, "00-blank-template-as-downloaded.xlsx");
  mkdirSync(dirname(blank), { recursive: true });
  await downloadTemplate(cl.id, blank);
  const jobs: { out: string; rows: Record<string, string | number>[] }[] = [];
  /** write a case's sheet: into the real template when it is an ordinary vendor sheet */
  const writeSheet = (caseId: string, fixture: string, rel: string, vars: Record<string, string>) => {
    mkdirSync(dirname(join(OUT, rel)), { recursive: true });
    if (/\.xlsx$/.test(rel) && (caseId === "baseline" || usesRealTemplate(caseId))) jobs.push({ out: join(OUT, rel), rows: filledRows(fixture, vars) });
    else writeFileSync(join(OUT, rel), Buffer.from(m.loadFixture(fixture, vars).base64, "base64"));
  };
  const ws = await resolveVbuWorkspace(cl.id);
  if (!ws) throw new Error(`the settings of ${cl.name} could not be read — without them the pack would hold the wrong cases`);
  const vars: Record<string, string> = { ...m.runVars(stamp), ...tv[cl.id], foreignCategoryUuid: otherCat[cl.id] };
  const rows: Row[] = [];
  const baselineDone = new Map<string, string>();
  let order = 0;

  // the vendors some cases compare against go first, once
  const writeBaseline = (fx: string): string => {
    if (baselineDone.has(fx)) return baselineDone.get(fx)!;
    const n = baselineDone.size + 1;
    const rel = join(cl.folder, "00-upload-these-first", `B${n}_${fx.replace(/\.xlsx$/, "")}.xlsx`);
    writeSheet("baseline", fx, rel, vars);
    fileCount++;
    baselineDone.set(fx, rel);
    return rel;
  };

  for (const c of CASES) {
    const b: BulkSpec | undefined = c.bulk;
    const bug = bugForCase(c.id);
    const why = c.notRunnable
      ? String(c.notRunnable).replace(/^Manual case — /, "")
      : b?.tier === "real-mail"
        ? "Would email the workspace's vendor-management team (real people). Needs approval before anyone uploads it."
        : b ? vbuSkipReason(b, ws, { realMail: false, creates: true, hasUser: true }) : "not a vendor bulk case";
    if (why) {
      // approval-only and manual cases apply to both clients: list them once
      const both = !!c.notRunnable || b?.tier === "real-mail";
      const key = both ? c.id : `${c.id}:${cl.id}`;
      if (!seenNotHere.has(key)) {
        seenNotHere.add(key);
        notHere.push({ Case: c.id, Title: c.title, Client: both ? "both" : cl.name, "Why it is not in the pack": why.replace(/^this case /, "This case "), Bug: bug?.id ?? "" });
      }
      continue;
    }
    const { mode, steps } = howTo(c, vars);
    const files: string[] = [];
    const before: string[] = [];
    for (const base of String(b?.baseline ?? "").split(",").filter(Boolean)) before.push(writeBaseline(base));
    const folder = join(cl.folder, SECTION_FOLDER[CASE_SECTION(c.id)] ?? "09-other");
    let names: string[] = [];
    if (mode !== "api" && b?.fixture) {
      const ext = b.fixture.split(".").pop();
      const rel = join(folder, `${c.id}_${slug(c.title)}${b.kind === "concurrent" ? "_A" : ""}.${ext}`);
      writeSheet(c.id, b.fixture, rel, vars);
      fileCount++;
      files.push(rel);
      const buf = Buffer.from(m.loadFixture(b.fixture, vars).base64, "base64");
      const g = /\.(xlsx|xls)$/.test(rel) ? sheetGrid(buf.toString("base64")) : undefined;
      const ni = g?.headers.indexOf("Company Name") ?? -1;
      names = ni >= 0 ? g!.rows.map((r) => r[ni]).filter((x) => x !== undefined) : [];
      if ((b as any).fixture2) {
        const rel2 = join(folder, `${c.id}_${slug(c.title)}_B.xlsx`);
        writeSheet(c.id, (b as any).fixture2, rel2, vars);
        fileCount++;
        files.push(rel2);
      }
      if (c.combo)
        for (const r of c.combo as any[])
          comboRows.push({
            Client: cl.name, Case: c.id, File: rel.replace(`${cl.folder}/`, ""), Row: r.row,
            "Kind of row": r.values.slice(1, r.values.indexOf("]")),
            "Values in the row": r.values.slice(r.values.indexOf("]") + 2),
            "Expected — what you should see": r.expected, "Safety value in the row": r.tripwire, "Known bug notes": r.notes,
            "Your result (Pass / Fail)": "", "Your notes": "",
          });
    }
    if (c.id === "VBU-003") {
      const rel = join(folder, `VBU-003_${slug(c.title)}_EMPTY-0-bytes.xlsx`);
      mkdirSync(dirname(join(OUT, rel)), { recursive: true });
      writeFileSync(join(OUT, rel), Buffer.alloc(0));
      fileCount++;
      files.push(rel);
    }
    const last = lastResult.get(`${cl.id}:${c.id}`);
    const auto = last ? `${last.pass ? "PASSED" : last.inconclusive ? "couldn't tell" : "FAILED"} on ${last.when}` : "not run on this client yet";
    const d = bug ? bugDetail(bug.id) : undefined;
    rows.push({
      "#": ++order,
      Area: SECTION_NAME[CASE_SECTION(c.id)] ?? "",
      Case: c.id,
      "What it checks": c.title,
      Kind: c.type,
      Priority: c.priority,
      "How to test": mode === "api" ? steps : (before.length ? `FIRST make sure the baseline is uploaded: ${before.map((x) => basename(x)).join(", ")} (00-upload-these-first). ` : "") + steps,
      "File(s) to upload": files.map((f) => f.replace(`${cl.folder}/`, "")).join("\n"),
      "Expected — what you should see": c.combo ? `Row by row: see the sheet 'Row-by-row (combinations)', case ${c.id}. ${String(c.expectedResult ?? "").replace(/ Rule: .*$/, "").replace(/^Row by row as listed[^.]*\. /, "")}` : mode === "api" ? fill(String(c.expectedResult ?? "").replace(/ Rule: .*$/, ""), vars) : expectedText(c, names, vars) || fill(String(c.expectedResult ?? "").replace(/ Rule: .*$/, ""), vars),
      "Detail (from the case)": fill(String(c.expectedResult ?? "").replace(/ Rule: .*$/, ""), vars),
      "Last automated result": auto,
      "Known bug": bug ? `${bug.id} (${bug.severity}) ${bug.title}${d ? `\nToday the buyer sees: ${d.sees}` : ""}` : "",
      "Done on screen?": mode === "api" ? "API only — skip" : "",
      "Your result (Pass / Fail / Blocked)": "",
      "Your notes": "",
    });
  }
  if (jobs.length) {
    const jf = join(OUT, `.jobs-${cl.id}.json`);
    writeFileSync(jf, JSON.stringify(jobs));
    execFileSync("python3", [FILLER, blank, jf], { stdio: "pipe" });
    rmSync(jf, { force: true });
  }
  // baseline rows at the top of the client's list
  const baseRows: Row[] = [...baselineDone.values()].map((rel, i) => ({
    "#": `B${i + 1}`, Area: "Upload these first", Case: "baseline", "What it checks": `Creates the vendor the duplicate / city / prospect cases compare against`,
    Kind: "Setup", Priority: "", "How to test": "Upload it once, before the cases that name it: Vendors → Bulk Upload → Upload Excel → choose the file → Upload. It must finish as Completed 1.",
    "File(s) to upload": rel.replace(`${cl.folder}/`, ""), "Expected — what you should see": "Green “Vendors Sheet Uploaded”; Upload history: Total 1 · Completed 1 · Failed 0. The vendor appears in Vendors.",
    "Detail (from the case)": "", "Last automated result": "", "Known bug": "", "Done on screen?": "", "Your result (Pass / Fail / Blocked)": "", "Your notes": "",
  }));
  sheets[`${cl.name} ${cl.id}`] = [...baseRows, ...rows];
}

function CASE_SECTION(id: string): number {
  return (spec.CASES as any[]).find((x) => x.id === id)?.section ?? 9;
}

// ── checklist workbook ─────────────────────────────────────────────────────
const wb = XLSX.utils.book_new();
const how = [
  ["Vendor bulk upload — manual test checklist"],
  [`Made ${today}. Every sheet in this pack uses run number ${stamp}: new company names, emails and tax numbers that no earlier run used.`],
  [""],
  ["How to use this pack"],
  ["1. Open the folder of the client you are testing (GMMCO-47053 or PROCOL-DEMO-198678) and log in to the UAT sandbox as a buyer admin of that workspace."],
  ["2. Upload everything in 00-upload-these-first first (one by one). Each must finish as Completed 1. Later cases compare against those vendors."],
  ["3. Then go down the client's sheet in this workbook, row by row. 'File(s) to upload' is the path inside the client folder."],
  ["4. Compare what you see with 'Expected — what you should see' and write Pass / Fail / Blocked in 'Your result'."],
  ["5. 'Known bug' tells you what the automated run saw last time; a case listed with a bug is expected to FAIL until that bug is fixed."],
  ["6. Folder 09-field-combinations holds sheets of 1 to 100 vendors that mix the column values. Check them row by row with the sheet 'Row-by-row (combinations)'."],
  [""],
  ["The sheets"],
  ["• Every ordinary sheet is the client's own template, downloaded today from Vendors → Bulk Upload: same colours, same dropdowns, same Data Sheet. The sample row is removed and our rows start on row 4. A blank copy is in each client folder (00-blank-template-as-downloaded.xlsx)."],
  ["• Sheets that test the file's own shape (odd column names, column order, a blank row, a second sheet, .xls, PDF, PNG, CSV, Word, an empty file) are kept as they are: putting them into the template would undo what they test."],
  ["• Some cells hold values the dropdowns do not offer (for example QA_TRIPWIRE, or a profile that does not exist). That is on purpose: Excel only checks a dropdown when you type into the cell."],
  [""],
  ["Field combinations (09-field-combinations)"],
  ["• Three kinds of rows, mixed in every sheet: (1) valid combinations: every pair of accepted values of every two columns appears together at least once, and these rows must be accepted; (2) one fault: each value the upload must refuse, alone in an otherwise valid row, which must fail with exactly that message; (3) two faults: every pair of refused values from different columns, which shows which message wins (the order of the checks)."],
  ["• The order of the checks on the sandbox today: tax number → mandatory columns → PAN → Deals In → POC email → POC 2 email → Vendor Profile → Status → Vendor Onboarding Required → City (only without contactless and without a tax number). After that: Vendor Code over 100 characters, the POC 2 pair, and where the vendor lands (rejected → Rejected; onboarding No → Vendors; otherwise → Prospects)."],
  ["• A row that would create a vendor AND email real people carries the safety value QA_TRIPWIRE in Status or in Vendor Onboarding Required instead; the 'Safety value in the row' column says which and why."],
  [""],
  ["Where to look on the screen"],
  ["• The pop-up after Upload: green “Vendors Sheet Uploaded” when the file can be read; red with a message when it is refused."],
  ["• The Bulk Upload history table: Total · Completed · Failed · Duplicate for each upload, and Download Excel (enabled when something failed)."],
  ["• The error sheet (Download Excel): the failed rows, each with its message in the Error column."],
  ["• The Vendors list (Vendors / Prospects / Rejected) and each vendor's details."],
  [""],
  ["Why many rows say Status = QA_TRIPWIRE"],
  ["A row that tests a rule which should refuse it also carries this deliberate second mistake. If the rule wrongly lets the row through, the row stops at “Invalid Status” and nothing is created. So for those rows “Invalid Status” is the PASS answer; any other message is what the rule said."],
  [""],
  ["Safety"],
  ["• Every vendor in these sheets is a test record: QA_Platform_VBU_<run>_…, emails qa_vbu_…@example.com, phone 0000000001, made-up tax numbers."],
  ["• Do not upload a sheet twice: rows that created vendors will then meet their own vendors. For a second round, make a new pack (npm run vbu:manualpack)."],
  ["• Cases that would email real people, change a workspace for good, or need a setting neither client has are NOT in the pack; see the sheet 'Not in this pack'."],
];
const howWs = XLSX.utils.aoa_to_sheet(how);
howWs["!cols"] = [{ wch: 140 }];
XLSX.utils.book_append_sheet(wb, howWs, "How to use");
const COLS = [6, 26, 10, 48, 11, 8, 60, 46, 70, 50, 22, 50, 14, 16, 30];
for (const [name, rows] of Object.entries(sheets)) {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = COLS.map((w) => ({ wch: w }));
  ws["!autofilter"] = { ref: ws["!ref"]! };
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}
if (comboRows.length) {
  const cr = XLSX.utils.json_to_sheet(comboRows);
  cr["!cols"] = [{ wch: 18 }, { wch: 9 }, { wch: 60 }, { wch: 5 }, { wch: 40 }, { wch: 120 }, { wch: 60 }, { wch: 50 }, { wch: 50 }, { wch: 14 }, { wch: 30 }];
  cr["!autofilter"] = { ref: cr["!ref"]! };
  XLSX.utils.book_append_sheet(wb, cr, "Row-by-row (combinations)");
}
const nh = XLSX.utils.json_to_sheet(notHere);
nh["!cols"] = [{ wch: 10 }, { wch: 60 }, { wch: 18 }, { wch: 110 }, { wch: 10 }];
XLSX.utils.book_append_sheet(wb, nh, "Not in this pack");
XLSX.writeFile(wb, join(OUT, "Vendor bulk upload - manual test checklist.xlsx"));

writeFileSync(join(OUT, "README.txt"), how.map((r) => r[0]).join("\n") + "\n");
const zip = `${OUT}.zip`;
rmSync(zip, { force: true });
execFileSync("zip", ["-qr", zip, basename(OUT)], { cwd: dirname(OUT) });
const counts = Object.entries(sheets).map(([k, v]) => `${k}: ${v.length} rows`).join(" · ");
console.log(`pack: ${OUT}\nzip:  ${zip}\nrun number ${stamp} · ${fileCount} files · ${counts} · not in pack: ${notHere.length}`);
const pool = await import(pathToFileURL(join(PROCOL_TEST, "src", "db", "pool.ts")).href);
await pool.closePool();
