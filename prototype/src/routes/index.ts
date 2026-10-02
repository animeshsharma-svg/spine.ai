/**
 * Route modules, loaded from this folder at start-up.
 *
 * server.ts is one long if-chain; several people (and agents) adding endpoints
 * to it at once collide. A new area of the platform instead drops a file here:
 *
 *   // src/routes/productModel.ts
 *   import type { RouteHandler } from "./index.js";
 *   export const handle: RouteHandler = async (ctx) => {
 *     if (ctx.path !== "/api/product-model") return false;   // not mine
 *     ctx.json({ ... });
 *     return true;                                          // handled
 *   };
 *
 * Every module exporting `handle` is asked in file-name order before the
 * built-in routes; the first to return true answers the request.
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  path: string;
  /** 200 + JSON body */
  json: (body: unknown, status?: number) => void;
  /** Server-sent events: returns send(event, data) and end() */
  sse: () => { send: (event: string, data: unknown) => void; end: () => void };
  /** The request body parsed as JSON (POST/PATCH); {} when empty or invalid. */
  body: () => Promise<any>;
}

export type RouteHandler = (ctx: RouteContext) => Promise<boolean>;

const here = dirname(fileURLToPath(import.meta.url));
let loaded: Promise<Array<{ file: string; handle: RouteHandler }>> | undefined;

async function load(): Promise<Array<{ file: string; handle: RouteHandler }>> {
  const files = readdirSync(here)
    .filter((f) => /\.(ts|js)$/.test(f) && !/^index\./.test(f) && !/\.d\.ts$/.test(f) && !/\.test\./.test(f))
    .sort();
  const out: Array<{ file: string; handle: RouteHandler }> = [];
  for (const f of files) {
    try {
      const mod = await import(pathToFileURL(join(here, f)).href);
      if (typeof mod.handle === "function") out.push({ file: f, handle: mod.handle });
    } catch (e) {
      // One broken module must not take the dashboard down with it.
      console.warn(`[routes] ${f} failed to load: ${(e as Error).message}`);
    }
  }
  return out;
}

/** Try every route module; true when one of them answered. */
export async function dispatch(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  loaded ??= load();
  const routes = await loaded;
  if (!routes.length) return false;
  let bodyP: Promise<any> | undefined;
  const ctx: RouteContext = {
    req,
    res,
    url,
    path: url.pathname,
    json: (body, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    },
    sse: () => {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      return {
        send: (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        end: () => res.end(),
      };
    },
    body: () =>
      (bodyP ??= new Promise((resolve) => {
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", () => {
          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch {
            resolve({});
          }
        });
        req.on("error", () => resolve({}));
      })),
  };
  for (const r of routes) {
    if (await r.handle(ctx)) return true;
  }
  return false;
}
