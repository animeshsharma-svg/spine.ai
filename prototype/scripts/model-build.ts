/**
 * Build the PRODUCT MODEL.
 *
 *   npm run model:build -- --c 198678            fetch one client live (read-only) and store a version
 *   npm run model:build -- --c 198678,32461,47053
 *   npm run model:build -- --anatomy             rebuild the event anatomy from src/model/research/*.json
 *
 * Live reads are GET-only API calls as the client's own buyer plus SELECT-only
 * queries on Procol's database (procol test/src/model/clientFacts.ts). The
 * result goes to spine.ai's database (migration 002) and to
 * src/model/snapshots/<id>.json. Prints counts and three example answers.
 */
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const PROCOL_TEST = join(ROOT, "..", "procol test");
loadEnv({ path: join(ROOT, ".env") });
loadEnv({ path: join(PROCOL_TEST, ".env") });

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const val = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const clients = (val("c") ?? "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => n > 0);

const { rebuildAnatomy, loadAnatomy, ANATOMY_FILE } = await import("../src/model/anatomy.js");
const { fieldRuleRows } = await import("../src/model/fieldRules.js");
const { saveStaticKnowledge, saveModel } = await import("../src/model/store.js");
const { buildClientModel } = await import("../src/model/build.js");
const { ask, templatesFor } = await import("../src/model/query.js");
const { closeSpineDb } = await import("../src/db/spineDb.js");

let exitCode = 0;
try {
  // ── static knowledge ──
  const anatomy = flag("anatomy") || !existsSync(ANATOMY_FILE) ? rebuildAnatomy() : loadAnatomy()!;
  const rules = fieldRuleRows();
  const stored = await saveStaticKnowledge(anatomy.rows, rules, anatomy.meta.backendRef);
  console.log(`Event anatomy: ${anatomy.rows.length} cited facts in ${new Set(anatomy.rows.map((r) => r.section)).size} sections · field-rule library: ${rules.length} rules · ${stored}`);

  if (!clients.length && !flag("anatomy")) console.log("No client given. Use --c <id>[,<id>…] to fetch a client.");

  // ── clients ──
  const factsMod = await import(pathToFileURL(join(PROCOL_TEST, "src", "model", "clientFacts.ts")).href);
  for (const c of clients) {
    const t0 = Date.now();
    console.log(`\n━━ Client ${c} ━━`);
    let facts;
    try {
      facts = await factsMod.fetchClientFacts(c, { log: (m: string) => console.log(`   … ${m}`) });
    } catch (e) {
      console.log(`✗ could not read client ${c}: ${(e as Error).message}`);
      exitCode = 1;
      continue;
    }
    const model = buildClientModel(facts);
    const saved = await saveModel(model);
    const s = model.summary as any;
    console.log(`${model.companyName} — read in ${((Date.now() - t0) / 1000).toFixed(1)}s, saved to ${saved.savedTo.join(" + ")}`);
    console.log(`   ${saved.changed ? "CHANGED" : "unchanged"} since last fetch${saved.changes.length ? `: ${saved.changes.slice(0, 5).join(" ")}` : ""}`);
    console.log(`   templates offered per list: ${Object.entries(s.templatesByType).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    for (const type of ["rfq", "rfp", "auction", "boq"]) {
      const r: any = await templatesFor(c, type);
      console.log(`   for a ${type.padEnd(7)} stage: ${r.templates?.length ?? 0} templates, ${r.templates?.filter((x: any) => x.usable).length ?? 0} usable as they are`);
    }
    console.log(`   distinct templates ${s.templates} (${s.templatesThatOpen} open) · fields ${s.fields} · rules ${s.rules}`);
    console.log(`   units ${s.units} (${model.units.companyOnly ? "company-only" : "own + Procol-wide"}) · products ${s.products} · invitable vendors ${s.invitableVendors} · delivery locations ${s.locations}`);
    for (const f of model.findings) console.log(`   ${f.severity === "defect" ? "✗ DEFECT" : f.severity === "risk" ? "! RISK" : "· info"}: ${f.plain}`);
    if (model.errors.length) console.log(`   read errors: ${model.errors.map((e: any) => `${e.section}: ${e.message}`).join(" | ")}`);
    const questions = [
      "Which templates can I use for an RFQ?",
      "Why is a line item refused with unit not present?",
      "Can a vendor bid after the bid end time?",
    ];
    for (const q of questions) {
      const a = await ask(c, q);
      console.log(`   Q: ${q}\n   A (${a.method}): ${a.answer.slice(0, 400)}${a.answer.length > 400 ? "…" : ""}`);
    }
  }
} catch (e) {
  console.error(`✗ ${(e as Error).stack ?? e}`);
  exitCode = 1;
} finally {
  await closeSpineDb();
  try {
    const pool = await import(pathToFileURL(join(PROCOL_TEST, "src", "db", "pool.ts")).href);
    await pool.closePool();
  } catch {
    /* never opened */
  }
}
process.exit(exitCode);
