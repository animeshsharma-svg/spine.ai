/**
 * The screenshot a screen run took when a step failed (or was recovered) — so the person sees
 * the screen the runner saw, next to the app's words and the rule they come from.
 *
 *   GET /api/ui-evidence?path=<absolute path from a step's evidence.screenshot>
 *
 * Serves only .png / .jpg files inside procol-ui-tests/evidence/ (where observe.ts writes them);
 * anything else is refused, so the route cannot be used to read other files.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { RouteHandler } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = resolve(join(here, "..", "..", "..", "procol-ui-tests", "evidence"));

export const handle: RouteHandler = async (ctx) => {
  if (ctx.path !== "/api/ui-evidence") return false;
  const asked = ctx.url.searchParams.get("path") ?? "";
  let real = "";
  try {
    real = existsSync(asked) ? realpathSync(asked) : "";
  } catch {
    real = "";
  }
  const root = existsSync(EVIDENCE) ? realpathSync(EVIDENCE) : EVIDENCE;
  if (!real || !real.startsWith(root + sep) || !/(\.(png|jpe?g)|[\/\\]trace\.zip)$/i.test(real)) {
    ctx.res.writeHead(404, { "content-type": "text/plain" });
    ctx.res.end("no such evidence");
    return true;
  }
  // A failed run's full replay (Playwright trace) is a download, opened at trace.playwright.dev.
  if (/trace\.zip$/i.test(real)) {
    ctx.res.writeHead(200, { "content-type": "application/zip", "content-disposition": `attachment; filename="${(real.split(sep).slice(-2, -1)[0] || "run").replace(/[^\w.-]+/g, "_")}-trace.zip"`, "cache-control": "private, max-age=86400" });
    ctx.res.end(readFileSync(real));
    return true;
  }
  ctx.res.writeHead(200, { "content-type": /\.png$/i.test(real) ? "image/png" : "image/jpeg", "cache-control": "private, max-age=86400" });
  ctx.res.end(readFileSync(real));
  return true;
};
