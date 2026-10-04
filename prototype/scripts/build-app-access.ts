/**
 * Snapshot which app may call which versioned API, from the backend's own
 * allow-list, into data/app-access.json (read by src/checks/appAccess.ts),
 * and the app's error codes → messages into data/app-errors.json (read by the
 * verdict engine, src/checks/engine.ts).
 *
 *   tsx scripts/build-app-access.ts
 *
 * Source (read-only): procol-backend origin/main:config/app_auth_config.yml,
 * loaded as APP_AUTH_CONFIG (config/initializers/load_config.rb:6) and checked
 * by ApiAuth#authorize_app (app/controllers/concerns/api_auth.rb). Only the two
 * apps the platform signs in with are kept: the buyer's web console
 * (client_admin_dashboard) and the vendor website (agribid_website), and only
 * their versioned sections (v1, v2, …), where the controller is the second
 * path segment and the mapping from a path to the checked entry is reliable.
 *
 * Why it matters: a refused app answers 401 AFTER the session is read, and
 * render_error_json → check_session_validity (app/controllers/concerns/
 * json_helpers.rb:31-35) then marks that session in_active. One buyer-session
 * call to a vendor-only endpoint signs the buyer out of the web console and
 * turns every later call into "Authentication failed".
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(here, "..", "..", "procol-backend");
const OUT = join(here, "..", "data", "app-access.json");
const OUT_ERRORS = join(here, "..", "data", "app-errors.json");

const VERSIONS = ["v1", "v2", "v3", "supplier_suite", "approval_workflow", "integration_builder"];
const APPS: Record<string, "console" | "vendor"> = { client_admin_dashboard: "console", agribid_website: "vendor" };

const yml = execFileSync("git", ["-C", BACKEND, "show", "origin/main:config/app_auth_config.yml"], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
const rev = execFileSync("git", ["-C", BACKEND, "rev-parse", "--short", "origin/main"], { encoding: "utf8" }).trim();
const cfg = YAML.parse(yml) as Record<string, Record<string, unknown>>;

// ── the routes of the versioned namespaces, so a request path maps to the
// controller#action the allow-list is keyed by (config/routes.rb: v1_api_routes,
// supplier_suite_routes, approval_workflow_routes). Only the simple shapes those
// blocks use are read; anything else is skipped, and an unmatched request is
// never judged.
interface Route { method: string; pattern: string; version: string; controller: string; action: string }
const routesRb = execFileSync("git", ["-C", BACKEND, "show", "origin/main:config/routes.rb"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const REST: Record<string, Array<[string, string]>> = {
  index: [["GET", ""]], create: [["POST", ""]], show: [["GET", "/:id"]], update: [["PATCH", "/:id"], ["PUT", "/:id"]], destroy: [["DELETE", "/:id"]],
};
function routesOf(fn: string, version: string): Route[] {
  const lines = routesRb.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^\\s*def ${fn}\\b`).test(l));
  if (start < 0) return [];
  const out: Route[] = [];
  // stack of blocks: { prefix, resource?, kind }
  const stack: Array<{ prefix: string; kind: "def" | "scope" | "resources" | "member" | "collection" | "other"; resource?: string }> = [{ prefix: "", kind: "def" }];
  const prefix = () => stack.map((b) => b.prefix).filter(Boolean).join("/");
  const add = (method: string, path: string, ca: string) => {
    const [controller, action] = ca.split("#");
    if (!controller || !action) return;
    const full = ("/" + version + "/" + path).replace(/\/+/g, "/").replace(/\/$/, "");
    out.push({ method: method.toUpperCase(), pattern: full, version, controller: controller.split("/").pop()!, action });
  };
  for (let i = start + 1; i < lines.length; i++) {
    // Comments start a line or follow a space; 'bids#create' is not one.
    const l = lines[i].replace(/^\s*#.*$/, "").replace(/\s+#\s.*$/, "").trim();
    if (!l) continue;
    if (l === "end") {
      stack.pop();
      if (!stack.length) break;
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^scope\s+:?['"]?([\w/]+)['"]?(?:,.*)?\s+do$/))) { stack.push({ prefix: m[1], kind: "scope" }); continue; }
    if ((m = l.match(/^resources\s+:(\w+)(.*?)(\s+do)?$/))) {
      const name = m[1];
      const opts = m[2] ?? "";
      const only = opts.match(/only:\s*\[([^\]]*)\]/)?.[1];
      const except = opts.match(/except:\s*\[([^\]]*)\]/)?.[1];
      const all = ["index", "create", "show", "update", "destroy"];
      const acts = only !== undefined ? only.split(",").map((x) => x.trim().replace(/^:/, "")).filter(Boolean)
        : all.filter((a) => !(except ?? "").includes(a));
      const base = [prefix(), name].filter(Boolean).join("/");
      for (const a of acts) for (const [verb, tail] of REST[a] ?? []) add(verb, base + tail, `${name}#${a}`);
      if (m[3]) stack.push({ prefix: "", kind: "resources", resource: name });
      continue;
    }
    if ((m = l.match(/^(member|collection)\s+do$/))) {
      const res = [...stack].reverse().find((b) => b.kind === "resources")?.resource ?? "";
      stack.push({ prefix: m[1] === "member" ? `${res}/:id` : res, kind: m[1] as "member" | "collection", resource: res });
      continue;
    }
    if ((m = l.match(/^(get|post|patch|put|delete)\s+['"]([^'"]*)['"]\s*=>\s*['"]([\w/]+#\w+)['"]/))) { add(m[1], [prefix(), m[2]].filter(Boolean).join("/"), m[3]); continue; }
    if ((m = l.match(/^(get|post|patch|put|delete)\s+:?['"]?(\w+)['"]?\s*$/))) {
      const res = [...stack].reverse().find((b) => b.kind === "member" || b.kind === "collection");
      if (res?.resource) add(m[1], [prefix(), m[2]].filter(Boolean).join("/"), `${res.resource}#${m[2]}`);
      continue;
    }
    if (/\bdo(\s*\|[^|]*\|)?$/.test(l)) stack.push({ prefix: "", kind: "other" });
  }
  return out;
}
const routes: Route[] = [
  ...routesOf("v1_api_routes", "v1"),
  ...routesOf("supplier_suite_routes", "supplier_suite"),
  ...routesOf("approval_workflow_routes", "approval_workflow"),
];

const apps: Record<string, Record<string, Record<string, string[]>>> = {};
for (const [client, app] of Object.entries(APPS)) {
  const c = cfg[client] ?? {};
  apps[app] = {};
  for (const v of VERSIONS) {
    const sec = c[v] as Record<string, Record<string, number>> | undefined;
    if (!sec || typeof sec !== "object") continue;
    apps[app][v] = Object.fromEntries(Object.entries(sec).map(([ctl, actions]) => [ctl, Object.keys(actions ?? {}).sort()]));
  }
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: `procol-backend origin/main ${rev}: config/app_auth_config.yml (client_admin_dashboard = console, agribid_website = vendor)`,
      generatedAt: new Date().toISOString(),
      versions: VERSIONS,
      apps,
      routes,
    },
    null,
    1,
  ) + "\n",
);
// The app's error codes and their messages (config/locales/en-IN.yml,
// api_errors), so a verdict can tell WHICH documented refusal came back.
const locale = execFileSync("git", ["-C", BACKEND, "show", "origin/main:config/locales/en-IN.yml"], {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});
// The file repeats some keys; Ruby (Psych) keeps the LAST one, and so does this.
const apiErrors = ((YAML.parse(locale, { uniqueKeys: false }) as any)?.["en-IN"]?.api_errors ?? {}) as Record<string, unknown>;
const errors: Record<string, string> = {};
for (const [code, v] of Object.entries(apiErrors)) {
  const msg = typeof v === "string" ? v : (v as { message?: unknown })?.message;
  if (typeof msg === "string" && msg.trim()) errors[code] = msg.trim();
}
writeFileSync(
  OUT_ERRORS,
  JSON.stringify({ source: `procol-backend origin/main ${rev}: config/locales/en-IN.yml api_errors`, generatedAt: new Date().toISOString(), errors }, null, 1) + "\n",
);
console.log(`wrote ${OUT_ERRORS}: ${Object.keys(errors).length} error codes`);

const n = (a: string) => Object.values(apps[a] ?? {}).reduce((s, x) => s + Object.keys(x).length, 0);
console.log(`${routes.length} versioned routes read from config/routes.rb`);
console.log(`wrote ${OUT}: console ${n("console")} controllers, vendor ${n("vendor")} controllers (backend ${rev})`);
