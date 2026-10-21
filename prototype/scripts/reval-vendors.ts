/**
 * Create the vendor test data for revalidation — through vendor bulk upload,
 * the way a buyer loads vendors, with Status = rejected.
 *
 *   npm run reval:vendors -- --company 47053
 *
 * Why this way: a rejected row creates the company record and its link
 * without any invite mail, any onboarding form or any vendor login, and the
 * "rejected" group is the small, all-test-vendor group the overnight scheduler
 * run is planned on. Revalidation reads these vendors through its
 * company.* and company.misc.* paths.
 *
 * Every vendor is a Procol test record: name QA_Platform_REV_<stamp>_<ROLE>,
 * e-mail qa_rev_<stamp>_<role>@example.com, fake tax numbers whose PAN part
 * carries entity letter Z (no real PAN has it), UK VAT numbers GB9…, fake
 * IFSCs QATZ0…. Ids are written to config/revalidationVendors.json so the
 * revalidation cases find them by role.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { openClientContext, PROCOL_TEST } from "../src/executor.js";

const here = dirname(fileURLToPath(import.meta.url));
const VENDORS_FILE = join(here, "..", "config", "revalidationVendors.json");
const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const companyId = Number(arg("company") ?? 47053);
if (companyId !== 47053) throw new Error("the designed rows fit GMMCO's template (47053) — other workspaces need their own required columns");

const vbu = await import(pathToFileURL(join(PROCOL_TEST, "src", "flows", "vendorBulkUpload.ts")).href);
const stamp = String(Date.now());
const d4 = stamp.slice(-4);
const name = (role: string) => `QA_Platform_REV_${stamp}_${role}`;
const email = (role: string) => `qa_rev_${stamp}_${role.toLowerCase()}@example.com`;
const gst = (letter: string) => `27QATZQ${d4}${letter}1Z5`; // valid shape, PAN part QATZQ…: entity letter Z — no real PAN
const pan = (letter: string) => `QATZQ${d4}${letter}`;
const vat = (n: string) => `GB9${d4}${n}`; // a UK VAT number: accepted as a tax number, never a valid GSTIN

const client: any = await openClientContext(companyId);
try {
  const api = client.ctx.buyerApi;
  const userId: number = client.ctx.buyerUserId;
  if (typeof userId !== "number") throw new Error("the session has no buyer user id");
  const template = await vbu.fetchTemplate(api);
  const vars = vbu.runVars(stamp, template);
  const base = (role: string, extra: Record<string, unknown>) => ({
    "Company Name": name(role),
    "Vendor Profile": vars.profile,
    "POC - Full Name": "QA Platform Tester",
    "POC - Email Address": email(role),
    City: "Mumbai",
    Address: `QA Revalidation Road ${d4}`,
    Pincode: "400001",
    Status: "rejected",
    "Vendor Onboarding Required": "No",
    ...extra,
  });
  const vatRow = (role: string, n: string, extra: Record<string, unknown>) => base(role, { "Tax Type": "VAT", "Tax No.": vat(n), "Business Location": "United Kingdom", ...extra });

  /** role → what it is for (the revalidation case it serves) */
  const DESIGN: Array<[string, Record<string, unknown>, string]> = [
    ["GSTA", base("GSTA", { "Tax Type": "GST", "Tax No.": gst("A"), "Business Location": "India", "PAN No.": pan("A") }), "a well-formed GSTIN and matching PAN that no provider knows → gst/pan failed by the provider (E-01, E-07, G-01)"],
    ["GSTB", base("GSTB", { "Tax Type": "GST", "Tax No.": gst("B"), "Business Location": "India", "PAN No.": pan("B") }), "a second such vendor, for re-trigger and subset cases (B-13, B-14, G-13)"],
    ["VATPAN", vatRow("VATPAN", "1111", { "PAN No.": pan("C") }), "a VAT number in the GST field (format pre-check fails) and a fake PAN (E-02/E-06, E-07)"],
    ["MSMELINK", vatRow("MSMELINK", "2222", { "MSME Registration Number": "https://example.com/udyam-certificate.pdf" }), "MSME holds a link, not a number → skipped 'not provided' (D-03)"],
    ["MSMEFAKE", vatRow("MSMEFAKE", "3333", { "MSME Registration Number": `UDYAM-MH-00-${d4}001` }), "a well-formed Udyam number nobody has → msme failed by the provider (E-09)"],
    ["MSMEBAD", vatRow("MSMEBAD", "4444", { "MSME Registration Number": "MH12345" }), "a malformed Udyam number → 'MSME input is incorrect' without a provider call (E-09)"],
    ["BANKHALF", vatRow("BANKHALF", "5555", { "Bank Account Number": `000012${d4}` }), "a bank account with no IFSC → bank skipped (D-04)"],
    ["BANKFAKE", vatRow("BANKFAKE", "6666", { "Bank Account Number": `000013${d4}`, "Bank IFSC Code": `QATZ0${d4}AB` }), "a well-formed account + IFSC nobody has → bank failed by the provider (E-10)"],
    ["BANKBADIFSC", vatRow("BANKBADIFSC", "7777", { "Bank Account Number": `000014${d4}`, "Bank IFSC Code": "ABC123" }), "a malformed IFSC → 'BANK input is incorrect' without a provider call (E-10 pre-check)"],
    ["NODOCS", base("NODOCS", { "VRP Code": `QAREV${d4}` }), "no tax number, PAN, MSME or bank anywhere → every document skipped, final Skipped (D-01, G-03)"],
  ];
  const rows = DESIGN.map(([, row]) => row);
  const buf: Buffer = vbu.buildWorkbook({ rows });
  console.log(`uploading ${rows.length} designed vendors (Status = rejected) to workspace ${companyId} as user ${userId}…`);
  const out = await vbu.uploadAndWait(api, userId, { excel_data: buf.toString("base64") }, { timeoutMs: 300_000 });
  if (!out.http.ok) throw new Error(`upload refused: HTTP ${out.http.status} ${out.http.message ?? ""}`);
  console.log(`job ${out.jobId}: ${out.rows.length} row(s) in ${Math.round(out.waitedMs / 1000)} s${out.timedOut ? " (TIMED OUT — some rows still in progress)" : ""}`);

  const found: Record<string, number> = {};
  const report: string[] = [];
  for (const [role, row, why] of DESIGN) {
    const jr = out.rows.find((r: any) => String(r.companyName ?? r.name ?? "").trim() === row["Company Name"]) ?? out.rows[DESIGN.findIndex(([r]) => r === role)];
    const created = await vbu.findVendorsByName(companyId, row["Company Name"] as string);
    const v = created[0];
    if (v) found[`V-REV-${role}`] = v.companyId;
    report.push(`${v ? "OK  " : "FAIL"} ${role.padEnd(12)} ${v ? `#${v.companyId} link ${v.bscmStatus ?? "?"}` : `row ${jr?.status ?? "?"} ${jr?.error ?? ""}`} — ${why}`);
  }
  console.log(report.join("\n"));

  let file: any = {};
  if (existsSync(VENDORS_FILE)) file = JSON.parse(readFileSync(VENDORS_FILE, "utf8"));
  file[String(companyId)] = { ...(file[String(companyId)] ?? {}), ...found, _stamp: stamp, _createdAt: new Date().toISOString() };
  writeFileSync(VENDORS_FILE, JSON.stringify(file, null, 2) + "\n");
  console.log(`${Object.keys(found).length} of ${DESIGN.length} vendors recorded in config/revalidationVendors.json`);
} finally {
  await client.dispose().catch(() => {});
  try {
    const pool = await import(pathToFileURL(join(PROCOL_TEST, "src", "db", "pool.ts")).href);
    await pool.closePool();
  } catch {
    /* already closed */
  }
}
process.exit(0);
