import { ApiClient } from "./api/client.js";
import { CONFIG, Role } from "./config.js";
import { authenticate, LoginResult } from "./auth/login.js";

export interface Identity {
  login: LoginResult;
  api: ApiClient;
}

/**
 * Log in a role and return an authenticated ApiClient bound to that identity's
 * baseURL + app-version. Caller disposes `api` when done.
 */
export async function makeIdentity(role: Role): Promise<Identity> {
  const login = await authenticate(CONFIG.identities[role]);
  const api = await ApiClient.create(login, {
    baseURL: login.baseURL,
    appVersion: login.appVersion,
  });
  return { login, api };
}

export const asBuyer = () => makeIdentity("buyer");
export const asVendor = () => makeIdentity("vendor");
export const asEvaluator = () => makeIdentity("evaluator");

/**
 * Log in as a specific vendor email (the vendor to authenticate as is dynamic —
 * it must be one invited to the event). Uses the vendor app's key/secret/version.
 */
export async function asVendorEmail(email: string): Promise<Identity> {
  const base = CONFIG.identities.vendor;
  const login = await authenticate({ ...base, email });
  const api = await ApiClient.create(login, {
    baseURL: login.baseURL,
    appVersion: login.appVersion,
  });
  return { login, api };
}
