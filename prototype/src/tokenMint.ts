import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { TokenClient } from "../config/tokenClients.js";
import { PROCOL_TEST } from "./executor.js";
import { readToken, readEnvVar } from "./tokenClient.js";

/**
 * A FRESH TOKEN, ON DEMAND — instead of one pasted in by hand.
 *
 * The sandbox demo's `access-token` is `base64(appKey:appSecret:<session>)`,
 * and only the session part expires — in hours. So every captured token starts
 * dying the moment it is saved, and the platform's answer was to tell the
 * reader to go and paste a new one. That is a chore that recurs forever, and
 * it stops the PO automation dead in the meantime.
 *
 * This account's login can be driven instead. Its OTP is a fixed sandbox code
 * (the same one the browser suite types on the login screen), which is exactly
 * the case the API suite's own `otpLogin` was written for:
 *
 *   POST /v1/generate_otp  { phone, phone_prefix }
 *   POST /v1/verify_otp    { phone, otp, phone_prefix, push_token,
 *                            device_info, device_id }  -> access_token
 *   access-token = base64(`${appKey}:${appSecret}:${access_token}`)
 *
 * `device_info` and `device_id` are NOT optional: without them the answer is
 * 422 "Insufficient parameters", which reads like a bad OTP and is not.
 *
 * A minted token is kept in memory for the life of the process, so a run costs
 * two extra HTTP calls once, not on every request.
 */

const b64 = (value: string): string => Buffer.from(value, "utf-8").toString("base64");

/** Inert values; the API only checks that they are present. */
function deviceFields(): { device_info: Record<string, string>; device_id: string } {
  return {
    device_info: {
      browser: "Chrome",
      os: "OS X 10.15.7 64-bit",
      browser_version: "151.0.0.0",
      resolution: "1470x956",
    },
    device_id: [...crypto.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  };
}

const minted = new Map<number, { token: string; at: number }>();

/**
 * This account's login, from wherever it is kept.
 *
 * Written into the config as literals for a fixed sandbox code, or named as
 * .env variables for an account whose credentials belong in the same file as
 * its token. Either way the caller just gets a phone and a code, or nothing.
 */
function loginFor(client: TokenClient): { phone: string; code: string; prefix?: string } | undefined {
  if (client.otp) return client.otp;
  if (!client.otpFromEnv) return undefined;
  const phone = readEnvVar(client, client.otpFromEnv.phoneVar);
  const code = readEnvVar(client, client.otpFromEnv.codeVar);
  if (!phone || !code) return undefined;
  return { phone, code, prefix: client.otpFromEnv.prefix };
}

/** Log in as this account and assemble a usable `access-token`. */
export async function mintToken(client: TokenClient): Promise<string> {
  const otp = loginFor(client);
  const appSecret = client.appSecret || (client.appSecretVar ? readEnvVar(client, client.appSecretVar) : undefined);
  if (!otp || !appSecret) {
    throw new Error(
      `the stored token has expired and there is no login the platform can use for this account, ` +
        `so it cannot mint a new one. Paste a fresh token into ${client.tokenVar} in the API ` +
        `suite's .env — copy the access-token header from a signed-in console tab on ` +
        `${new URL(client.apiBaseUrl).host}.`,
    );
  }
  const base = client.apiBaseUrl.replace(/\/$/, "");
  const prefix = otp.prefix ?? "+91";
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    // Before login the token is the two-segment bootstrap: key:secret.
    "access-token": b64(`${client.appKey}:${appSecret}`),
    "app-version": client.appVersion,
  };

  const generated = await fetch(`${base}/v1/generate_otp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone: otp.phone, phone_prefix: prefix }),
  });
  if (!generated.ok) {
    throw new Error(
      `could not start a login for ${client.name}: generate_otp answered HTTP ${generated.status}`,
    );
  }

  const verified = await fetch(`${base}/v1/verify_otp`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      phone: otp.phone,
      otp: otp.code,
      phone_prefix: prefix,
      push_token: null,
      ...deviceFields(),
    }),
  });
  const text = await verified.text();
  if (!verified.ok) {
    throw new Error(
      `could not log in as ${client.name}: verify_otp answered HTTP ${verified.status}. ` +
        `A 422 "Invalid OTP" means the sandbox's fixed code has changed.`,
    );
  }
  const session = (JSON.parse(text) as { access_token?: string }).access_token;
  if (!session) throw new Error(`${client.name} logged in but returned no access_token`);

  const token = b64(`${client.appKey}:${appSecret}:${session}`);
  minted.set(client.id, { token, at: Date.now() });
  return token;
}

/**
 * Can this token do this account's work? Not merely: is it a valid token.
 *
 * These are different questions, and asking only the first is what let a
 * wrong-company session through. This deployment hosts several companies;
 * a session for any of them answers 200 on /v1/dashboard_configuration, so
 * that check passed while every datasource read came back "you are not
 * authorized to perform this action". A run then started, made five calls,
 * and failed in a way that read like a broken purchase-order API.
 *
 * When the account declares a `dataProbe`, the question asked is the real one:
 * read one row of this company's own data. Authentication is only the fallback
 * for accounts that have not named a probe.
 */
export async function tokenWorks(client: TokenClient, token: string): Promise<boolean> {
  const base = client.apiBaseUrl.replace(/\/$/, "");
  const path = client.dataProbe ?? "/v1/dashboard_configuration";
  try {
    const res = await fetch(base + path, {
      headers: {
        accept: "application/json",
        "app-version": client.appVersion,
        [client.headerName]: token,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface ResolvedToken {
  token: string;
  /** where it came from, for a message that explains itself */
  source: "minted" | "env" | "cache" | "db";
  /** the lightspeed-token that goes with it, when the source provides one */
  lightspeed?: string;
}

/**
 * The token to use for this account, whatever state the stored one is in.
 *
 * Order matters and is deliberate: a token already minted this process is
 * reused, then the stored one is tried (so a deliberately pasted token still
 * wins while it is valid), and only a missing or rejected one triggers a fresh
 * login. Nothing here writes to .env — a minted token lives in memory, so the
 * file stays whatever the reader put there.
 */
/**
 * A token from the freshest live console session of the company, read out of
 * Procol's database — exactly how the UAT clients sign in (procol test's
 * resolveClient + tokensFromSession). Throws when there is no live session.
 */
async function tokenFromDb(companyId: number): Promise<{ token: string; lightspeed: string }> {
  const imp = (rel: string) => import(pathToFileURL(join(PROCOL_TEST, "src", rel)).href);
  const [{ resolveClient }, { tokensFromSession }] = await Promise.all([imp("db/clients.ts"), imp("auth/sessionAuth.ts")]);
  const c = await resolveClient(companyId);
  const t = tokensFromSession(c.buyer);
  return { token: t.accessToken, lightspeed: t.lightspeedToken };
}

export async function resolveToken(client: TokenClient): Promise<ResolvedToken> {
  const cached = minted.get(client.id);
  if (cached && (await tokenWorks(client, cached.token))) {
    return { token: cached.token, source: "cache" };
  }

  // Accounts that sign in like the UAT clients: a fresh session every run.
  let dbProblem: string | undefined;
  if (client.dbSessionCompany) {
    try {
      const fromDb = await tokenFromDb(client.dbSessionCompany);
      if (await tokenWorks(client, fromDb.token)) return { token: fromDb.token, lightspeed: fromDb.lightspeed, source: "db" };
      dbProblem = "the database session for this company was refused by the API";
    } catch (e) {
      dbProblem = (e as Error).message;
    }
  }

  let stored: string | undefined;
  try {
    stored = readToken(client);
  } catch {
    /* not set anywhere — minting is the only route */
  }
  if (stored && (await tokenWorks(client, stored))) return { token: stored, source: "env" };

  /**
   * A minted token is checked before it is handed over, never assumed.
   *
   * Logging in proves a phone number exists on this host. It does not prove
   * the session that comes back belongs to the company whose data the run is
   * about — and substituting one silently is how a working account started
   * failing every call without anything in the platform saying why.
   */
  if (dbProblem && !loginFor(client)) {
    throw new Error(
      `could not sign in from the database (${dbProblem}). Sign in to the console once as someone who ` +
        `operates this company, so a fresh session exists — or paste a fresh token into ${client.tokenVar}.`,
    );
  }
  const fresh = await mintToken(client);
  if (!(await tokenWorks(client, fresh))) {
    throw new Error(
      `${client.name}: the configured login works, but the account it signs in as cannot see this ` +
        `company's data — every read is refused. That login belongs to a different company on the ` +
        `same deployment. Put a fresh token for this account in ${client.tokenVar} in the API suite's .env.`,
    );
  }
  return { token: fresh, source: "minted" };
}
