import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TOKEN_CLIENTS, tokenClient, type TokenClient } from "../config/tokenClients.js";

/**
 * Opening a token client.
 *
 * Everything the checks touch goes through `ctx.buyerApi` — get/post/patch,
 * throwing an error that carries `.status` — so a token account only needs a
 * client of that shape pointed at its own host. That is what this builds.
 *
 * What it deliberately does NOT build is the event catalog (product, vendor,
 * evaluator uuids) that the UAT path resolves. Those exist for the sourcing
 * journeys; this account is here for the PO module. Cases that need them are
 * skipped by the usual gate with "unresolved placeholder(s)", which is the
 * honest outcome — better than firing a request with a made-up uuid.
 */

const here = dirname(fileURLToPath(import.meta.url));

/** The token, read from the API suite's .env at run time. Never cached to disk. */
/**
 * One variable out of the API suite's .env, whichever copy is present.
 *
 * Credentials belong in that file, not in this repository's source: a phone
 * number and a fixed sandbox code are still credentials, and an account's
 * login should be changeable without editing TypeScript. `readToken` is this
 * for the token specifically; accounts that log in need two or three more.
 */
export function readEnvVar(client: TokenClient, varName: string): string | undefined {
  for (const candidate of client.tokenFiles) {
    const file = resolve(here, "..", candidate);
    if (!existsSync(file)) continue;
    const match = readFileSync(file, "utf8").match(new RegExp(`^${varName}=(.+)$`, "m"));
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function readToken(client: TokenClient): string {
  const tried: string[] = [];
  for (const candidate of client.tokenFiles) {
    const file = resolve(here, "..", candidate);
    tried.push(file);
    if (!existsSync(file)) continue;
    const match = readFileSync(file, "utf8").match(new RegExp(`^${client.tokenVar}=(.+)$`, "m"));
    const token = match?.[1]?.trim();
    if (token) return token;
  }
  throw new Error(
    `${client.name}: ${client.tokenVar} is not set in any of ${tried.join(" or ")} — ` +
      `put this account's token in the API suite's .env`,
  );
}

export interface ApiError extends Error {
  status: number | null;
  body?: unknown;
}

/** An api object with the same surface the checks already use. */
function apiFor(client: TokenClient, token: string) {
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const url = `${client.apiBaseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await fetch(url, {
      method,
      headers: {
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        "app-version": client.appVersion,
        [client.headerName]: token,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    if (!res.ok) {
      // The checks classify on `.status` and read `.message`, so an error has
      // to carry both — a bare throw would be reported as "no response".
      //
      // This platform nests it as {error: {code, message}}, and reading
      // `.error` straight out produced the message "[object Object]" — which
      // told a reader nothing at the exact moment they needed the reason.
      const body = parsed as
        | { message?: string; error?: string | { code?: unknown; message?: string } }
        | undefined;
      const nested = typeof body?.error === "object" ? body?.error : undefined;
      const message =
        body?.message ??
        nested?.message ??
        (typeof body?.error === "string" ? body.error : undefined) ??
        `HTTP ${res.status}`;
      const err = new Error(message) as ApiError;
      err.status = res.status;
      err.body = parsed ?? text.slice(0, 400);
      throw err;
    }
    return parsed as T;
  };

  return {
    get: <T>(path: string) => call<T>("GET", path),
    post: <T>(path: string, opts?: { body?: unknown }) => call<T>("POST", path, opts?.body ?? {}),
    patch: <T>(path: string, opts?: { body?: unknown }) => call<T>("PATCH", path, opts?.body ?? {}),
    put: <T>(path: string, opts?: { body?: unknown }) => call<T>("PUT", path, opts?.body ?? {}),
  };
}

/** Minimal ClientConfig-compatible view over dashboard_configuration. */
function configFrom(raw: any) {
  return {
    raw,
    flag<T = unknown>(key: string): T | undefined {
      const r = raw ?? {};
      if (key in r) return r[key];
      const gc = r.configurations?.global_config ?? {};
      if (key in gc) return gc[key];
      return undefined;
    },
    isOn(key: string): boolean {
      return Boolean(this.flag(key));
    },
  };
}

export async function openTokenClient(id: number) {
  const client = tokenClient(id);
  if (!client) throw new Error(`${id} is not a token client`);
  const api = apiFor(client, readToken(client));

  // One live call, which doubles as the credential check: a stale token fails
  // here with a clear message instead of failing every case one at a time.
  let raw: any;
  try {
    raw = await api.get("/v1/dashboard_configuration");
  } catch (err: any) {
    const stale = err?.status === 401 || err?.status === 403;
    throw new Error(
      `${client.name}: ${
        stale
          ? `its API token has expired (${err.status} ${err?.message ?? ""}). Put a fresh one in ` +
            `${client.tokenVar} in the API suite's .env — the same token \`npm run po\` uses — and try again.`
          : `could not read its configuration (${err?.status ?? "no status"} ${err?.message ?? ""}).`
      }`,
    );
  }

  const config = configFrom(raw);
  return {
    // No flow registry: the sourcing journeys resolve their data from the UAT
    // database, which this account has none of. Flows are refused, not faked.
    s: null as any,
    ctx: {
      companyId: id,
      companyName: client.name,
      buyerApi: api,
      catalog: {} as Record<string, string | undefined>,
      config,
    },
    config,
    companyName: client.name,
    tokenClient: client,
    dispose: async () => {},
  };
}

/** The dropdown entries for every token client. */
export function tokenClientChoices() {
  return TOKEN_CLIENTS.map((c) => ({ id: c.id, name: c.name, note: c.note, covers: c.covers }));
}
