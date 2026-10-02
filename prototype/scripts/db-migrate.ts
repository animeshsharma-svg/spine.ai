/**
 * Create / update spine.ai's own database tables.
 *
 *   npm run db:migrate
 *
 * Safe to run any number of times: each file in db/migrations runs once.
 */
import { migrate, closeSpineDb } from "../src/db/spineDb.js";

try {
  const { applied, already } = await migrate();
  for (const f of already) console.log(`  ✓ ${f} (already applied)`);
  for (const f of applied) console.log(`  + ${f} applied`);
  console.log(applied.length ? `Done — ${applied.length} migration(s) applied.` : "Database is up to date.");
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeSpineDb();
}
