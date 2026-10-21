/**
 * Support tickets → escaped bugs, for DDP and leakage (docs/METRICS.md).
 *
 * Reads the tickets the HubSpot pipeline already processed (stripped of personal data,
 * classified, mapped to features: src/hubspot/*), and records as an ESCAPED BUG every ticket that is
 *   • a defect — classified "defect" with confidence ≥ 0.8, or by an explicit rule;
 *   • in the events module (the scope the agent is measured on).
 * A ticket linked to a case the bug sheet names for a bug is that bug, found by the agent first
 * (linkedBug set) — it does not count as escaped. Lower-confidence defects are listed for a person
 * and NOT counted, so a guess never moves DDP.
 *
 *   npx tsx scripts/escaped-from-tickets.ts            # writes data/eval/escaped-bugs.json + escaped_bugs
 *   npx tsx scripts/escaped-from-tickets.ts --dry      # prints only
 */
import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
const { loadRows } = await import("../src/hubspot/store.js");
const { bugCases } = await import("../src/eval/dataset.js");
const { spineDb } = await import("../src/db/spineDb.js");

const DRY = process.argv.includes("--dry");
const { rows, from } = await loadRows();
const bugs = bugCases();
const bugOfCase = new Map<string, string>();
for (const [bug, cases] of bugs.map) for (const c of cases) bugOfCase.set(c, bug);

const real = rows.filter((r: any) => r.dataset !== "synthetic");
const defects = real.filter((r: any) => r.classification === "defect" && r.inEventsScope);
const sure = defects.filter((r: any) => (r.confidence ?? 0) >= 0.8 || r.classifiedBy === "rule");
const unsure = defects.filter((r: any) => !sure.includes(r));
const escaped = sure.map((r: any) => {
  const linked = (r.linkedCaseIds ?? []).map((c: string) => bugOfCase.get(c)).find(Boolean);
  return { id: `hubspot:${r.ticketId}`, source: "hubspot", title: String(r.subject ?? r.featureKey ?? "defect ticket").slice(0, 160), foundAt: r.createdAt ? String(r.createdAt).slice(0, 10) : null, ...(linked ? { linkedBug: linked } : {}) };
});

console.log(`tickets: ${rows.length} (${from}), real ${real.length} · events defects ${defects.length} · counted ${sure.length} (${escaped.filter((e: any) => e.linkedBug).length} already on the bug sheet) · needs review ${unsure.length}`);
for (const u of unsure.slice(0, 20)) console.log(`  review: ${u.ticketId} — confidence ${u.confidence ?? "?"} (${u.classifiedBy}) ${String(u.subject ?? "").slice(0, 80)}`);
if (DRY) process.exit(0);

const out = join(here, "..", "data", "eval", "escaped-bugs.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(escaped, null, 2));
const db: any = await spineDb().catch(() => null);
if (db) {
  for (const e of escaped) {
    await db.query(
      "INSERT INTO escaped_bugs (id, source, title, found_at, linked_bug) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, found_at = EXCLUDED.found_at, linked_bug = EXCLUDED.linked_bug",
      [e.id, e.source, e.title, e.foundAt, e.linkedBug ?? null],
    );
  }
}
console.log(`wrote ${escaped.length} escaped bug(s) → ${out}${db ? " and escaped_bugs" : ""}`);
process.exit(0);
