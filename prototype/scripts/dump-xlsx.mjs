// Dump the structure + content of the reference test-case workbooks.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const files = process.argv.slice(2);
for (const f of files) {
  console.log("\n\n=================================================================");
  console.log("FILE:", f.split("/").pop());
  console.log("=================================================================");
  let wb;
  try {
    wb = XLSX.readFile(f);
  } catch (e) {
    console.log("  (could not read:", e.message, ")");
    continue;
  }
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
    console.log(`\n----- SHEET: "${name}"  (${rows.length} rows) -----`);
    const show = rows.slice(0, 22);
    for (let i = 0; i < show.length; i++) {
      const cells = show[i].map((c) => String(c).replace(/\s+/g, " ").trim().slice(0, 90));
      if (cells.every((c) => c === "")) continue;
      console.log(`  [${i}] ` + cells.filter((c) => c).join("  |  "));
    }
    if (rows.length > 22) console.log(`  … (${rows.length - 22} more rows)`);
  }
}
