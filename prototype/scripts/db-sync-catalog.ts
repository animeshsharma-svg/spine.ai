/**
 * Copy the catalog files into spine.ai's database: features, journeys, test
 * cases (a NEW version for every case whose content changed), assistant
 * drafts and compiled plans.
 *
 *   npm run cases:import && npm run db:sync-catalog
 *
 * Safe to repeat: nothing changes when no file changed. Cases that left the
 * files are retired, never deleted — results that ran them keep pointing at
 * the exact version they ran.
 */
import { closeSpineDb, spineDb } from "../src/db/spineDb.js";
import { defaultContext, withService } from "../src/db/tenant.js";
import { syncCatalog } from "../src/db/catalogSync.js";

const db = await spineDb();
if (!db) {
  console.error("✗ SPINE_DB_URL is not set, or Postgres is not running.");
  process.exit(1);
}
try {
  const t0 = Date.now();
  const r = await withService(db, async (c) => {
    const ctx = await defaultContext(c);
    const rep = await syncCatalog(c, ctx);
    if (rep.cases.created || rep.cases.newVersions || rep.cases.retired || rep.plans.created)
      await c.query(`INSERT INTO audit_log (org_id, actor_label, action, entity_type, entity_id, summary, after) VALUES ($1, 'db:sync-catalog', 'catalog.synced', 'catalog', 'catalog', $2, $3)`, [
        ctx.orgId,
        `Catalog synced: ${rep.cases.created} new case(s), ${rep.cases.newVersions} new version(s), ${rep.cases.retired} retired, ${rep.plans.created} new plan(s).`,
        JSON.stringify(rep),
      ]);
    return rep;
  }, "db:sync-catalog");
  console.log(`Features: ${r.features.upserted} (${r.features.retired} retired)`);
  console.log(`Journeys: ${r.journeys.upserted} (${r.journeys.retired} retired)`);
  console.log(`Cases:    ${r.cases.total} in the files — ${r.cases.created} new, ${r.cases.newVersions} with a new version, ${r.cases.retired} retired; ${r.cases.generated} assistant draft(s) added or changed`);
  console.log(`Plans:    ${r.plans.total} compiled plan file(s) — ${r.plans.created} new version(s), ${r.plans.skippedNoCase} for a case not in the catalog`);
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeSpineDb();
}
