import { ApiClient, AuthTokens } from "../api/client.js";
import { CONFIG, CONST } from "../config.js";
import type { DbUserSession } from "../db/clients.js";
import { buildAccessToken, buildLightspeedToken } from "./token.js";

export interface SessionAuthOptions {
  /** console (buyer/evaluator) vs agribid (vendor) app credentials. */
  app?: "console" | "agribid";
  baseURL?: string;
  appVersion?: string;
  /** recorded on every call this client makes, for the report */
  identity?: string;
  companyId?: number;
}

/**
 * Build authenticated tokens from a DB session's access_token — no OTP.
 *   access-token = base64(appKey : appSecret : session.access_token)
 * The session's app must match the app keys (console for buyers, agribid for
 * vendors), otherwise the server returns 401.
 */
export function tokensFromSession(
  session: DbUserSession,
  opts: SessionAuthOptions = {},
): AuthTokens {
  const app = opts.app ?? "console";
  const appKey = app === "console" ? CONST.consoleKey : CONST.agribidKey;
  const appSecret = app === "console" ? CONST.consoleSecret : CONST.agribidSecret;
  return {
    accessToken: buildAccessToken(appKey, appSecret, session.sessionAccessToken),
    lightspeedToken: buildLightspeedToken(),
  };
}

/** Make an authenticated ApiClient from a DB session (no OTP). */
export async function clientFromSession(
  session: DbUserSession,
  opts: SessionAuthOptions = {},
): Promise<ApiClient> {
  const app = opts.app ?? "console";
  const baseURL = opts.baseURL ?? CONFIG.baseURL;
  const appVersion =
    opts.appVersion ?? (app === "console" ? CONFIG.identities.buyer.appVersion : CONFIG.identities.vendor.appVersion);
  return ApiClient.create(tokensFromSession(session, { app }), {
    baseURL,
    appVersion,
    identity: opts.identity ?? (app === "console" ? "buyer" : "vendor"),
    companyId: opts.companyId,
  });
}
