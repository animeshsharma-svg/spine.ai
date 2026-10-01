import { config as loadEnv } from "dotenv";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { SUITE_DIR } from "../src/config.js";
import { resetState } from "../src/state.js";

/**
 * Every run starts from nothing — and, from a terminal, signs in the way the
 * UAT clients do.
 *
 * The platform hands the suite a fresh token itself. Run by hand, the suite
 * reads the freshest live console session of AANYA_EVENTS_DB_COMPANY out of
 * Procol's database (procol test's own resolveClient), so there is no token to
 * paste and nothing to expire. The pasted AANYA_EVENTS_ACCESS_TOKEN is used
 * only when the database cannot be reached.
 */
export default async function globalSetup() {
  resetState();
  const company = Number(process.env.AANYA_EVENTS_DB_COMPANY);
  if (process.env.RFP_STREAM === "1" || !company) return;
  const procolTest = join(SUITE_DIR, "..", "..", "procol test");
  loadEnv({ path: join(procolTest, ".env") });
  try {
    const imp = (rel: string) => import(pathToFileURL(join(procolTest, "src", rel)).href);
    // Only the database lookup and the token builder: procol test's sign-in
    // helper also loads Playwright, and a second copy inside a run is refused.
    const [{ resolveClient }, { buildAccessToken, buildLightspeedToken }] = await Promise.all([imp("db/clients.ts"), imp("auth/token.ts")]);
    const c = await resolveClient(company);
    process.env.AANYA_EVENTS_ACCESS_TOKEN = buildAccessToken("console_app_key", "console_app_secret", c.buyer.sessionAccessToken);
    process.env.AANYA_EVENTS_LIGHTSPEED_TOKEN = buildLightspeedToken();
    process.stdout.write(`Signed in from the database as ${c.buyer.firstName ?? "the buyer"} for ${c.companyName ?? `company ${company}`}.\n`);
  } catch (e) {
    process.stdout.write(`Could not sign in from the database (${(e as Error).message.split("\n")[0]}); using the token in .env.\n`);
  }
}
