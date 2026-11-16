/**
 * How many written cases start from a state the API set-up cannot build (no model, no network).
 *
 *   npx tsx scripts/_states-baseline.ts [--list]
 *
 * UI- cases: prepFor(c).ok / why (src/ui/uiCasePrep.ts). Sheet cases: sheetPrep(c).unbuilt
 * (src/checks/sheetCases.ts). Grouped by reason with counts; --list prints the case ids too.
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });
const { allCases } = await import("../src/checks/testCatalog.js");
const { prepFor } = await import("../src/ui/uiCasePrep.js");
const { sheetCases, sheetPrep } = await import("../src/checks/sheetCases.js");

const list = process.argv.includes("--list");
const tally = (title: string, rows: Array<[string, string]>) => {
  const by = new Map<string, string[]>();
  for (const [why, id] of rows) by.set(why, [...(by.get(why) ?? []), id]);
  console.log(`\n## ${title} — ${rows.length} cases, ${by.size} reasons`);
  for (const [why, ids] of [...by.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${String(ids.length).padStart(5)}  ${why}`);
    if (list) console.log(`       ${ids.join(" ")}`);
  }
};

const ui = allCases().filter((c) => /^UI-/.test(c.group) && c.group !== "UI-XCHK");
const uiRows: Array<[string, string]> = [];
const uiOk: Array<[string, string]> = [];
for (const c of ui) {
  const p = prepFor(c);
  if (!p.ok) uiRows.push([p.why, c.id]);
  else uiOk.push([`${p.state}${p.auction ? " (auction)" : ""} → ${p.screen}`, c.id]);
}
tally("UI- cases the screen-case runner cannot start yet", uiRows);
console.log(`\n   (buildable UI- cases: ${uiOk.length} of ${ui.length})`);

const sheets = sheetCases();
const shRows: Array<[string, string]> = [];
const shBuilt: Array<[string, string]> = [];
let none = 0;
for (const c of sheets) {
  const sp = sheetPrep(c);
  if (!sp) { none++; continue; }
  if (sp.unbuilt) shRows.push([`${sp.why} — ${sp.unbuilt}`, c.id]);
  else shBuilt.push([`${sp.state}${sp.auction ? " (auction)" : ""}${sp.technical ? " (technical)" : ""} → ${sp.screen}${sp.note ? ` [note: ${sp.note}]` : ""}`, c.id]);
}
tally("Sheet cases that start from an event the API set-up does not build", shRows);
console.log(`\n   (sheet cases: ${sheets.length}; start from nothing: ${none}; built by API: ${shBuilt.length})`);
tally("Sheet cases built by API, by state (notes show partial builds)", shBuilt.filter(([w]) => /note:/.test(w)));
console.log(`\nTOTAL unbuildable: UI ${uiRows.length} + sheet ${shRows.length} = ${uiRows.length + shRows.length}`);
