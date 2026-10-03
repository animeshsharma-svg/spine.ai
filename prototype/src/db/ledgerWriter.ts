/**
 * Best-effort copy of a run kept OUTSIDE data/runs (a browser journey trail,
 * a purchase-order run) into the product tables. Never throws: the file the
 * caller just wrote is what the run depends on; a database that is down costs
 * the history view, never the run. npm run db:backfill picks up anything missed.
 */
import { spineDb } from "./spineDb.js";
import { defaultContext, withService } from "./tenant.js";
import { writeLedgerRun, type LedgerRun } from "./runLedger.js";

export async function recordLedger(make: () => LedgerRun): Promise<void> {
  try {
    const db = await spineDb();
    if (!db) return;
    const run = make();
    if (!Number.isInteger(run.procolCompanyId) || run.procolCompanyId <= 0) return; // a run with no company is not stored
    await withService(db, async (c) => writeLedgerRun(c, await defaultContext(c), run, { basis: "recorded", force: true }), "run writer");
  } catch (e) {
    console.warn(`[spine-db] run not copied to the product tables: ${(e as Error).message}`);
  }
}
