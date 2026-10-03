/**
 * THE BUG WORKBOOK, AS A VIEW OF THE DATABASE.
 *
 *   npm run db:export-bugs -- --out <file.xlsx>                       write it
 *   npm run db:export-bugs -- --out <file.xlsx> --compare <old.xlsx>  …and compare cell by cell
 *   npm run db:export-bugs -- --compare-only <old.xlsx>               compare without keeping a file
 *
 * Same sheets, columns, wording, order and Summary formulas as
 * docs/bugs/Procol_bugs_found_*.xlsx: Summary · Bugs · Needs confirmation ·
 * Data problems. The rows come from the defects table (013): verified bugs
 * that are open or confirmed, questions still awaiting confirmation, data
 * problems not fixed. With python3 + openpyxl available the sheet is also
 * styled like the original (header colours, borders, severity colours,
 * frozen panes, tables); without it the content is identical and unstyled.
 *
 * Never writes into docs/bugs unless --out says so: the committed workbook is
 * not overwritten by default. Without --out the file goes to the system temp folder.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import * as XLSX from "xlsx";
import { closeSpineDb, spineDb } from "../src/db/spineDb.js";
import { defaultContext, withService } from "../src/db/tenant.js";
import { BUG_HEADERS, DATA_HEADERS, QUESTION_HEADERS, sheetRows, type SheetRows } from "../src/db/defects.js";

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const compareOnly = opt("--compare-only");
const compareWith = opt("--compare") ?? compareOnly;
const out = resolve(opt("--out") ?? join(tmpdir(), "spine-exports", `Procol_bugs_found_${new Date().toISOString().slice(0, 10)}_from_db.xlsx`));


/** "1 Oct 2026" + "3 Oct 2026" → "1–3 Oct 2026" */
export function dateRange(first: string | null, last: string | null): string {
  if (!first || !last) return first ?? last ?? "";
  if (first === last) return first;
  const a = first.split(" ");
  const b = last.split(" ");
  if (a[1] === b[1] && a[2] === b[2]) return `${a[0]}–${b[0]} ${b[1]} ${b[2]}`;
  if (a[2] === b[2]) return `${a[0]} ${a[1]} – ${last}`;
  return `${first} – ${last}`;
}

/** The workbook, built from the rows. Pure: the same rows always give the same workbook. */
export function buildWorkbook(orgName: string, r: SheetRows): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const n = r.bugs.length + 1;

  // Summary (formulas over the Bugs sheet, as the original)
  const s: XLSX.WorkSheet = {};
  const put = (addr: string, cell: XLSX.CellObject) => (s[addr] = cell);
  const str = (v: string): XLSX.CellObject => ({ t: "s", v });
  const fml = (f: string): XLSX.CellObject => ({ t: "n", f });
  put("A1", str(`${orgName} bugs found by spine.ai — events POC`));
  put(
    "A2",
    str(
      `Only bugs confirmed with ${orgName}'s real answers on UAT test records (QA_Platform_ events, QA test vendors). ` +
        `Vendor bulk upload is not included. Every failure was reproduced on a fresh test event (${dateRange(r.confirmedRange.first, r.confirmedRange.last)}).`,
    ),
  );
  put("A4", str("Total bugs"));
  put("B4", fml(`COUNTA(Bugs!A2:A${n})`));
  put("A6", str("By severity"));
  ["Critical", "High", "Medium", "Low"].forEach((sev, i) => {
    put(`A${7 + i}`, str(sev));
    put(`B${7 + i}`, fml(`COUNTIF(Bugs!I2:I${n},A${7 + i})`));
  });
  put("A12", str("By kind"));
  r.kinds.forEach((k, i) => {
    put(`A${13 + i}`, str(k));
    put(`B${13 + i}`, fml(`COUNTIF(Bugs!J2:J${n},A${13 + i})`));
  });
  const r0 = 13 + r.kinds.length + 1;
  put(`A${r0}`, str("By client (a bug can appear on more than one)"));
  r.clients.forEach((cl, i) => {
    put(`A${r0 + 1 + i}`, str(cl));
    put(`B${r0 + 1 + i}`, fml(`COUNTIF(Bugs!H2:H${n},"*"&A${r0 + 1 + i}&"*")`));
  });
  const r1 = r0 + r.clients.length + 2;
  put(`A${r1}`, str("Also in this file"));
  put(`A${r1 + 1}`, str("Needs product confirmation"));
  put(`B${r1 + 1}`, fml(`COUNTA('Needs confirmation'!A2:A${r.questions.length + 1})`));
  put(`A${r1 + 2}`, str("Client data problems (not code bugs)"));
  put(`B${r1 + 2}`, fml(`COUNTA('Data problems'!A2:A${r.data.length + 1})`));
  s["!ref"] = `A1:D${r1 + 2}`;
  s["!merges"] = [XLSX.utils.decode_range("A2:D2")];
  s["!cols"] = [{ width: 44 }, { width: 10 }, { width: 30 }, { width: 30 }];
  s["!rows"] = [undefined as unknown as XLSX.RowInfo, { hpt: 45 }];
  XLSX.utils.book_append_sheet(wb, s, "Summary");

  const table = (headers: readonly string[], rows: string[][], widths: number[], name: string) => {
    const ws = XLSX.utils.aoa_to_sheet([[...headers], ...rows]);
    ws["!cols"] = widths.map((w) => ({ width: w }));
    ws["!rows"] = [{ hpt: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  table(BUG_HEADERS, r.bugs, [9, 18, 34, 55, 42, 34, 30, 24, 10, 16, 40, 13, 28], "Bugs");
  table(QUESTION_HEADERS, r.questions, [7, 16, 36, 60, 26, 48], "Needs confirmation");
  table(DATA_HEADERS, r.data, [7, 28, 34, 70, 44], "Data problems");
  return wb;
}

/** Cell-by-cell differences (value, or formula when the cell has one) between two workbooks. */
export function compareWorkbooks(a: XLSX.WorkBook, b: XLSX.WorkBook): string[] {
  const diffs: string[] = [];
  if (a.SheetNames.join("|") !== b.SheetNames.join("|")) diffs.push(`sheets: [${a.SheetNames.join(", ")}] vs [${b.SheetNames.join(", ")}]`);
  for (const name of a.SheetNames.filter((x) => b.SheetNames.includes(x))) {
    const sa = a.Sheets[name];
    const sb = b.Sheets[name];
    const keys = new Set([...Object.keys(sa), ...Object.keys(sb)].filter((k) => !k.startsWith("!")));
    for (const k of [...keys].sort()) {
      const ca = sa[k] as XLSX.CellObject | undefined;
      const cb = sb[k] as XLSX.CellObject | undefined;
      const show = (c?: XLSX.CellObject) => (c ? (c.f ? `=${c.f}` : String(c.v ?? "")) : "");
      if (show(ca) !== show(cb)) diffs.push(`${name}!${k}: ${JSON.stringify(show(ca)).slice(0, 120)} vs ${JSON.stringify(show(cb)).slice(0, 120)}`);
    }
    const ra = sa["!ref"];
    const rb = sb["!ref"];
    if (ra !== rb) diffs.push(`${name}: range ${ra} vs ${rb}`);
    const ma = JSON.stringify((sa["!merges"] ?? []).map((m) => XLSX.utils.encode_range(m)));
    const mb = JSON.stringify((sb["!merges"] ?? []).map((m) => XLSX.utils.encode_range(m)));
    if (ma !== mb) diffs.push(`${name}: merged cells ${ma} vs ${mb}`);
  }
  return diffs;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("export-bug-sheet.ts")) {
  const db = await spineDb();
  if (!db) {
    console.error("✗ SPINE_DB_URL is not set, or Postgres is not running.");
    process.exit(1);
  }
  try {
    const { rows, orgName } = await withService(db, async (c) => {
      const ctx = await defaultContext(c);
      const o = await c.query(`SELECT name FROM organisations WHERE id = $1`, [ctx.orgId]);
      return { rows: await sheetRows(c, ctx), orgName: String(o.rows[0].name) };
    }, "export-bug-sheet");
    const wb = buildWorkbook(orgName, rows);
    if (!compareOnly) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
      let styled = "unstyled (python3 + openpyxl not available)";
      if (!args.includes("--no-style")) {
        try {
          execFileSync("python3", [join(import.meta.dirname, "style-bug-sheet.py"), out], { timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
          styled = "styled like the original";
        } catch (e) {
          styled = `unstyled (${String((e as { stderr?: Buffer }).stderr ?? (e as Error).message).trim().split("\n").pop()})`;
        }
      }
      console.log(`Wrote ${out} — ${rows.bugs.length} bugs, ${rows.questions.length} to confirm, ${rows.data.length} data problems; ${styled}.`);
    }
    if (compareWith) {
      if (!existsSync(compareWith)) throw new Error(`no such workbook: ${compareWith}`);
      const theirs = XLSX.read(readFileSync(compareWith), { type: "buffer", cellFormula: true });
      const ours = compareOnly ? XLSX.read(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }), { type: "buffer", cellFormula: true }) : XLSX.read(readFileSync(out), { type: "buffer", cellFormula: true });
      const diffs = compareWorkbooks(theirs, ours);
      const cells = theirs.SheetNames.reduce((nn, sn) => nn + Object.keys(theirs.Sheets[sn]).filter((k) => !k.startsWith("!")).length, 0);
      if (!diffs.length) console.log(`✓ identical to ${compareWith}: every one of ${cells} cells (values and formulas), sheet order, ranges and merged cells.`);
      else {
        console.log(`✗ ${diffs.length} difference(s) from ${compareWith} (theirs vs ours):`);
        for (const d of diffs.slice(0, 50)) console.log(`   ${d}`);
        process.exitCode = 1;
      }
    }
  } catch (e) {
    console.error(`✗ ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    await closeSpineDb();
  }
}
