import { resetApiCallLog } from "../src/report/apiLog.js";

/**
 * Clears the previous run's API evidence before anything executes.
 *
 * Workers append to reports/api-calls/ as they go, so without this a report
 * would stitch two runs together and show a failure that was already fixed.
 * Runs once in the main process, before any worker starts.
 */
export default function globalSetup(): void {
  resetApiCallLog();
}
