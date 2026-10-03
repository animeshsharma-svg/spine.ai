/**
 * WHICH APP MAY CALL WHICH API — and why the platform must never ask the
 * wrong one.
 *
 * Every request carries an app key (the buyer's web console, or the vendor
 * website) and a session. The backend checks the session first and the app's
 * allow-list second (ApiAuth: authenticate_accessor, then authorize_app —
 * app/controllers/concerns/api_auth.rb:11-12). A request the app is not
 * allowed to make is answered 401 "This app is not authorized to use this API",
 * and every 401 rendered while a session is known marks that session
 * in_active (JsonHelpers#check_session_validity, json_helpers.rb:31-35).
 *
 * So one buyer-session call to a vendor-only endpoint — POST /v1/bids, say —
 * signs the buyer out: of the platform's run AND of the real web console the
 * session belongs to. Measured in spine.ai's history: 2026-09-30 11:52, case
 * 54 of 100 (API-BID-002) got that 401, and all 45 cases after it answered
 * "Authentication failed", buyer cases included. 101 "couldn't tell" results
 * in 14 days came from this.
 *
 * The allow-list is snapshotted from the backend by
 * scripts/build-app-access.ts into data/app-access.json, with the routes of
 * the versioned namespaces (v1, supplier_suite, approval_workflow) read from
 * config/routes.rb, so a path maps to the exact controller#action the list is
 * keyed by. Anything this module cannot map is allowed — it only ever stops a
 * request it can show the backend would refuse.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, "..", "..", "data", "app-access.json");

export type AppKind = "console" | "vendor";

interface Route {
  method: string;
  pattern: string;
  version: string;
  controller: string;
  action: string;
}

interface AccessFile {
  source: string;
  versions: string[];
  apps: Record<AppKind, Record<string, Record<string, string[]>>>;
  routes: Route[];
}

let loaded: AccessFile | null | undefined;
function access(): AccessFile | null {
  if (loaded !== undefined) return loaded;
  try {
    loaded = existsSync(FILE) ? (JSON.parse(readFileSync(FILE, "utf8")) as AccessFile) : null;
  } catch {
    loaded = null;
  }
  return loaded;
}

/**
 * Which app a sibling ApiClient signs its calls as. The access-token header is
 * base64(appKey:appSecret:session); only the app KEY (a public identifier, the
 * first field) is looked at, and nothing of it is kept or printed.
 */
export function appOf(api: unknown): AppKind | undefined {
  try {
    const tok = (api as { tokens?: { accessToken?: string } })?.tokens?.accessToken;
    if (typeof tok !== "string" || !tok) return undefined;
    const head = Buffer.from(tok, "base64").toString("utf8").split(":")[0].toLowerCase();
    if (head.includes("console")) return "console";
    if (head.includes("agribid")) return "vendor";
  } catch {
    /* not a sibling client */
  }
  return undefined;
}

/** The route a request reaches, first match in routes.rb order (":x" matches one segment). */
function routeFor(a: AccessFile, method: string, path: string): Route | undefined {
  const segs = path.split("?")[0].split("/").filter(Boolean);
  const m = method.toUpperCase();
  return a.routes.find((r) => {
    if (r.method !== m) return false;
    const p = r.pattern.split("/").filter(Boolean);
    return p.length === segs.length && p.every((x, i) => x.startsWith(":") || x === segs[i]);
  });
}

/**
 * Would the backend refuse this app this request, by its own allow-list?
 * Returns the reason when it certainly would, undefined otherwise — a path
 * that matches no route read from routes.rb is never judged.
 */
export function appRefusal(app: AppKind | undefined, method: string, path: string): string | undefined {
  if (!app) return undefined;
  const a = access();
  if (!a?.routes?.length) return undefined;
  const route = routeFor(a, method, path);
  if (!route) return undefined;
  const section = a.apps[app]?.[route.version];
  if (!section) return undefined;
  const allowed = section[route.controller] ?? [];
  if (allowed.includes(route.action)) return undefined;
  const who = app === "console" ? "the buyer's web-console session" : "the vendor's session";
  return `${who} may not call ${method.toUpperCase()} ${route.pattern} (${route.controller}#${route.action} is not on that app's list in config/app_auth_config.yml)`;
}
