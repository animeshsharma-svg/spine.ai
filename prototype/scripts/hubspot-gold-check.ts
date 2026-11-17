/**
 * How well the pipeline's ticket sorting agrees with the export's own labels — on the REAL RCA export (which carries
 * "Is Defect" and "Module" columns the support/engineering team filled in). Read-only; prints counts, never ticket text.
 *   npx tsx scripts/hubspot-gold-check.ts data/hubspot/rca_retrieval_all_2026-07-01_2026-09-30.xlsx
 */
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { PROCESSED_FILE } from "../src/hubspot/store.js";

const file = process.argv[2];
if (!file) throw new Error("give the export file");
const wb = XLSX.read(readFileSync(file), { type: "buffer" });
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
const key = (r: Record<string, unknown>, name: string) => Object.keys(r).find((k) => k.trim().toLowerCase() === name);
const gold = new Map<string, { defect: boolean | null; module: string }>();
for (const r of rows) {
  const id = String(r[key(r, "ticket id") ?? ""] ?? "").trim();
  if (!id) continue;
  const d = String(r[key(r, "is defect") ?? ""] ?? "").trim().toLowerCase();
  gold.set(id, { defect: /^(yes|true|y|1)$/.test(d) ? true : /^(no|false|n|0)$/.test(d) ? false : null, module: String(r[key(r, "module") ?? ""] ?? "").trim() });
}
const processed = JSON.parse(readFileSync(PROCESSED_FILE, "utf8"));
const tickets: any[] = (Array.isArray(processed) ? processed : processed.tickets ?? []).filter((t: any) => t.dataset !== "synthetic" && t.inputKind !== "fixture");
let tp = 0, fp = 0, fn = 0, tn = 0, unlabeled = 0, unclear = 0;
const byModule = new Map<string, { n: number; agree: number }>();
for (const t of tickets) {
  const id = String(t.ticketId ?? t.ticket?.id ?? t.id ?? "");
  const g = gold.get(id);
  if (!g) continue;
  const said = t.classification;
  if (said === "unclear") unclear++;
  if (g.defect === null) { unlabeled++; continue; }
  const saidDefect = said === "defect";
  if (saidDefect && g.defect) tp++;
  else if (saidDefect && !g.defect) fp++;
  else if (!saidDefect && g.defect) fn++;
  else tn++;
  const m = (g.module || "(blank)").toLowerCase();
  const b = byModule.get(m) ?? { n: 0, agree: 0 };
  b.n++;
  if (String(t.module ?? "").toLowerCase() && m.includes(String(t.module ?? "").toLowerCase().split(/[^a-z]/)[0])) b.agree++;
  byModule.set(m, b);
}
const p = tp + fp ? tp / (tp + fp) : 0, r = tp + fn ? tp / (tp + fn) : 0;
console.log(`export rows with a label: ${gold.size - unlabeled} (unlabeled ${unlabeled}); processed tickets matched: ${tp + fp + fn + tn}`);
console.log(`defect sorting vs the team's "Is Defect": TP ${tp} · FP ${fp} · FN ${fn} · TN ${tn} → precision ${(p * 100).toFixed(1)}% · recall ${(r * 100).toFixed(1)}% · still "unclear": ${unclear}`);
console.log(`classification tally: ${JSON.stringify(tickets.reduce((a: any, t: any) => ((a[t.classification] = (a[t.classification] ?? 0) + 1), a), {}))}`);
console.log("module agreement (the team's Module column vs the pipeline's module, first word):");
for (const [m, b] of [...byModule.entries()].sort((x, y) => y[1].n - x[1].n).slice(0, 12)) console.log(`   ${m.padEnd(28)} ${String(b.n).padStart(4)}  agree ${b.agree}`);
