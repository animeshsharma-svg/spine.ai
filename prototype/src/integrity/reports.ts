/**
 * REPORT DOWNLOADS — does the Excel say what the JSON says?
 *
 * The buyer's "Download report" asks POST /reports/download_report with
 * {item_uuid: <stage>, item_type: "auction", report_category} and gets back a
 * signed link to the file (reports_controller.rb:105-152; up to 150 lines it
 * is built synchronously, above that it is e-mailed — reports_controller_helper.rb:833-840).
 * The file is fetched into memory (never saved for a person; the run's
 * evidence keeps the parsed cells only) and read with the xlsx library.
 *
 * PDF reports are NOT covered: the repo has no reliable PDF text extraction.
 */
import * as XLSX from "xlsx";

import { Dec } from "./decimal.js";
import { allowUnversioned, send, said } from "./send.js";
import type { IntegrityCheck } from "./invariants.js";

allowUnversioned("POST", /^\/reports\/download_report$/, "reports", "download_report");

export interface ReportFile {
  ok: boolean;
  why?: string;
  category: string;
  url?: string;
  sheets?: { name: string; rows: unknown[][] }[];
  /** the reply when no file came back (e-mailed, refused) */
  reply?: unknown;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Ask for a stage report and read the Excel it links to. */
export async function fetchStageReport(trade: string, buyerApi: any, category = "auction_bids_comparison_report"): Promise<ReportFile> {
  const r = await send(buyerApi, "POST", "/reports/download_report", {
    item_uuid: trade, item_type: "auction", report_category: category, include_revised_bids: false,
  });
  if (!r.ok) return { ok: false, category, why: `the report was refused: ${said(r)}`, reply: r.data };
  const url: string | undefined = r.data?.report_url ?? r.data?.url ?? r.data?.data?.report_url;
  if (!url) return { ok: false, category, why: `no file link came back (${typeof r.data === "object" ? JSON.stringify(r.data).slice(0, 200) : String(r.data)})`, reply: r.data };
  if (!/^https:\/\/[^/]*(amazonaws\.com|procol\.(in|io|ai))\//.test(url)) return { ok: false, category, why: "the file link is not on Procol's storage — not fetched" };
  let buf: Buffer | undefined;
  for (let i = 0; i < 3 && !buf; i++) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 60_000);
      const res = await fetch(url, { signal: ac.signal });
      clearTimeout(timer);
      if (res.ok) buf = Buffer.from(await res.arrayBuffer());
      else await sleep(2000);
    } catch {
      await sleep(2000);
    }
  }
  if (!buf) return { ok: false, category, url: url.split("?")[0], why: "the file could not be fetched in 3 tries" };
  try {
    const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
    const sheets = wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) as unknown[][] }));
    return { ok: true, category, url: url.split("?")[0], sheets };
  } catch (e) {
    return { ok: false, category, url: url.split("?")[0], why: `the file is not a readable workbook (${e instanceof Error ? e.message : String(e)})` };
  }
}

export interface VendorFigures {
  label: string;
  companyUuid: string;
  name?: string;
  prices: (Dec | undefined)[];
  lineTotals: (Dec | undefined)[];
  gross?: Dec;
}

/** Every number in a sheet (cells that are numbers, or numeric text). */
function numbersIn(rows: unknown[][]): Dec[] {
  const out: Dec[] = [];
  for (const row of rows) for (const c of row ?? []) {
    if (typeof c === "number" && Number.isFinite(c)) out.push(Dec.of(c));
    else if (typeof c === "string" && /^[₹$]?\s*-?[\d,]+(\.\d+)?$/.test(c.trim())) {
      const d = Dec.tryOf(c);
      if (d) out.push(d);
    }
  }
  return out;
}

/** The column of the sheet that carries a vendor's figures: the cells under / beside the vendor's name. */
function vendorBlock(rows: unknown[][], name: string): unknown[][] | undefined {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (typeof row[c] === "string" && (row[c] as string).includes(name)) {
        // the vendor's figures sit in the columns from c up to the next vendor header in this header row
        let end = row.length;
        for (let k = c + 1; k < row.length; k++) if (typeof row[k] === "string" && /QA_Platform Vendor|Vendor\s*\d/i.test(row[k] as string)) {
          end = k;
          break;
        }
        return rows.slice(r + 1).map((x) => (x ?? []).slice(c, end));
      }
    }
  }
  return undefined;
}

/**
 * The comparison report against the JSON figures: each vendor's unit prices, line totals and bid total must
 * appear in that vendor's block of the sheet, rounded to the places the sheet shows (2 or 4).
 */
export async function checkComparisonReport(trade: string, buyerApi: any, vendors: VendorFigures[]): Promise<IntegrityCheck[]> {
  const rep = await fetchStageReport(trade, buyerApi);
  if (!rep.ok || !rep.sheets?.length) {
    return [{ inv: "INV-REPORT", title: "The comparison report (Excel) can be read", expected: "The report downloads as a workbook.", actual: `Not read: ${rep.why}.`, verdict: "couldn't tell", details: { evidence: rep.reply } }];
  }
  const out: IntegrityCheck[] = [];
  const near = (a: Dec, b: Dec) => [0, 1, 2, 3, 4].some((dp) => a.round(dp).eq(b.round(dp)) && a.sub(b).abs().lt(Dec.of(1).div(10 ** Math.max(dp - 1, 0))));
  for (const v of vendors) {
    const sheet = rep.sheets.find((s) => v.name && vendorBlock(s.rows, v.name)) ?? rep.sheets[0];
    const block = v.name ? vendorBlock(sheet.rows, v.name) : undefined;
    const pool = numbersIn(block ?? sheet.rows);
    const want: [string, Dec][] = [];
    v.prices.forEach((p, i) => p && want.push([`line ${i + 1} unit price ${p.toString()}`, p]));
    v.lineTotals.forEach((p, i) => p && want.push([`line ${i + 1} total ${p.toString()}`, p]));
    if (v.gross) want.push([`bid total ${v.gross.toString()}`, v.gross]);
    const missing = want.filter(([, d]) => !pool.some((x) => near(x, d)));
    out.push({
      inv: "INV-REPORT", title: `${v.label}: the comparison report shows the same figures as the screen`,
      expected: `The report's ${v.label} block carries ${want.map(([w]) => w).join(", ")}.`,
      actual: !block ? `The report has no block headed with ${v.label}'s name; looked across the whole sheet “${sheet.name}”${missing.length ? ` and could not find: ${missing.map(([w]) => w).join(", ")}` : " and found every figure"}.`
        : missing.length ? `Not in the report: ${missing.map(([w]) => w).join(", ")}.` : "Every figure is in the report.",
      verdict: !block && !missing.length ? "passed" : missing.length ? (block ? "failed" : "couldn't tell") : "passed",
      details: { where: `POST /reports/download_report (${rep.category}) → ${rep.url}`, evidence: { sheet: sheet.name, header: sheet.rows.slice(0, 6), missing: missing.map(([w]) => w) } },
    });
  }
  return out;
}
