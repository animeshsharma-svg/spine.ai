/**
 * Evidence retention (migration 016): see what would be deleted, then delete it.
 *
 *   npm run db:retention               dry run — what WOULD be deleted, per organisation
 *   npm run db:retention -- --apply    delete it (writes one audit_log row per organisation)
 *
 * Evidence older than organisations.evidence_retention_days (90 by default) is
 * deleted unless a defect needs it. Runs, results, field checks, defects, test
 * records and the audit log are never deleted by this.
 */
import { closeSpineDb, spineDb } from "../src/db/spineDb.js";
import { withService } from "../src/db/tenant.js";

const apply = process.argv.includes("--apply");
const db = await spineDb();
if (!db) {
  console.error("✗ SPINE_DB_URL is not set, or Postgres is not running.");
  process.exit(1);
}
try {
  const rows = await withService(db, async (c) => (await c.query(`SELECT r.*, o.slug FROM spine_apply_retention(NULL, $1) r JOIN organisations o ON o.id = r.org_id`, [!apply])).rows, "db:retention");
  for (const r of rows)
    console.log(
      `${r.slug}: keep ${r.retention_days} days (before ${new Date(r.cutoff).toISOString().slice(0, 10)}) — ${r.expired} piece(s) of evidence expired, ` +
        `${r.kept_for_defects} kept because a defect needs them, ${apply ? `${r.deleted} deleted` : `${r.expired - r.kept_for_defects} would be deleted`} (${(Number(r.bytes_freed) / 1048576).toFixed(1)} MB).`,
    );
  if (!apply) console.log("Dry run. Add -- --apply to delete.");
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeSpineDb();
}
