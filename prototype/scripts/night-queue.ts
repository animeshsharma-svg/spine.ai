/**
 * Drain the guided session's overnight queue (data/night/queue.json) through the sheet runner.
 *
 *   npm run night:queue              run every waiting entry, oldest first
 *   npm run night:queue -- --dry     say what would run
 *
 * `npm run nightly` does the same first, before its journeys (one browser at a time).
 */
import { drainNightQueue } from "../src/session/nightQueue.js";

const dry = process.argv.includes("--dry");
await drainNightQueue({ dry });
process.exit(0);
