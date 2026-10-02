import { randomBytes } from 'crypto';

import { ClientConfig } from '../types';
import { resolveBaseUrl } from './auth';

/**
 * OTP login, for clients whose credentials expire.
 *
 * `apiKey` auth carries a captured token in `.env`, which is fine for an
 * environment that issues long-lived ones. Decathlon does not: its
 * `access-token` is `base64(appKey:appSecret:<session token>)`, and the session
 * expires — every captured token starts dying the moment it is pasted in, so a
 * run that worked yesterday returns 401 today.
 *
 * This mints a fresh one per run instead:
 *
 *   POST /v1/generate_otp   { phone, phone_prefix }
 *   POST /v1/verify_otp     { phone, otp, phone_prefix, push_token,
 *                             device_info, device_id }   -> access_token
 *   access-token = base64(`${appKey}:${appSecret}:${access_token}`)
 *
 * `device_info` and `device_id` are NOT optional — omitting them returns
 * 422 "Insufficient parameters", which reads like a bad OTP but is not.
 * Verified against sec-api.ag-ri.in: with them present and a deliberately
 * wrong code the answer becomes 422 "Invalid OTP".
 *
 * Only usable where the OTP is predictable — a sandbox with a fixed code, or
 * one supplied for the run. A real one-time code cannot be automated.
 */

export interface OtpLoginResult {
  /** the value to send as the `access-token` header */
  accessToken: string;
  userUuid?: string;
  companyUuid?: string;
  firstName?: string;
}

const b64 = (value: string): string => Buffer.from(value, 'utf-8').toString('base64');

/** The browser fingerprint the platform expects. Values are inert; only their
 * presence is checked, but a stable device_id per run keeps sessions tidy. */
function deviceFields(): { device_info: Record<string, string>; device_id: string } {
  return {
    device_info: {
      browser: 'Chrome',
      os: 'OS X 10.15.7 64-bit',
      browser_version: '151.0.0.0',
      resolution: '1470x956',
    },
    device_id: randomBytes(16).toString('hex'),
  };
}

function requireEnv(name: string, clientId: string, what: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing env var "${name}" — ${what} for client "${clientId}". ` +
        `OTP login needs the phone and a predictable OTP; see .env.example.`
    );
  }
  return value;
}

export async function otpLogin(client: ClientConfig): Promise<OtpLoginResult> {
  if (client.auth.type !== 'otp') {
    throw new Error(`Client "${client.id}" is not configured for OTP login.`);
  }
  const auth = client.auth;

  // A captured token, when supplied, is used as-is. Lets a fresh token get a
  // run moving now while login stays wired for when it expires.
  if (auth.tokenEnv) {
    const captured = process.env[auth.tokenEnv]?.trim().replace(/^"|"$/g, '');
    if (captured) return { accessToken: captured };
  }

  // Neither credential present: say so as one choice, not as a missing OTP.
  // Both routes are supported, so naming only one sends people down the
  // harder path when a token would have done.
  if (!process.env[auth.otpEnv] && auth.tokenEnv && !process.env[auth.tokenEnv]) {
    throw new Error(
      `No credential for client "${client.id}". Set ONE of:\n` +
        `  ${auth.tokenEnv}=<token>   a captured access-token — works now, expires in hours\n` +
        `  ${auth.otpEnv}=<code>      logs in per run — permanent, needs a predictable OTP\n` +
        `Both live in .env (git-ignored). The token wins if both are set.`
    );
  }

  const base = resolveBaseUrl(client).replace(/\/$/, '');
  const appKey = process.env[auth.appKeyEnv] ?? 'console_app_key';
  const appSecret = process.env[auth.appSecretEnv] ?? 'console_app_secret';
  const phone = requireEnv(auth.phoneEnv, client.id, 'the login phone number');
  const otp = requireEnv(auth.otpEnv, client.id, 'the OTP');
  const prefix = auth.phonePrefix ?? '+91';

  const headers = {
    'content-type': 'application/json',
    accept: 'application/json',
    // Before login the token is the two-segment bootstrap: key:secret.
    'access-token': b64(`${appKey}:${appSecret}`),
    'app-version': client.appVersion ?? '20.0.0',
  };

  const generated = await fetch(`${base}/v1/generate_otp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone, phone_prefix: prefix }),
  });
  if (!generated.ok) {
    throw new Error(
      `generate_otp failed for "${client.id}": HTTP ${generated.status} ${(await generated.text()).slice(0, 160)}`
    );
  }

  const verified = await fetch(`${base}/v1/verify_otp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      phone,
      otp,
      phone_prefix: prefix,
      push_token: null,
      ...deviceFields(),
    }),
  });
  const text = await verified.text();
  if (!verified.ok) {
    throw new Error(
      `verify_otp failed for "${client.id}": HTTP ${verified.status} ${text.slice(0, 160)}\n` +
        `  A 422 "Invalid OTP" means ${auth.otpEnv} is wrong or the code has been used; ` +
        `"Insufficient parameters" means the payload shape changed.`
    );
  }

  const body = JSON.parse(text) as {
    access_token?: string;
    user?: { uuid?: string; first_name?: string; company?: { uuid?: string } };
  };
  if (!body.access_token) {
    throw new Error(`verify_otp for "${client.id}" returned no access_token.`);
  }

  return {
    accessToken: b64(`${appKey}:${appSecret}:${body.access_token}`),
    userUuid: body.user?.uuid,
    companyUuid: body.user?.company?.uuid,
    firstName: body.user?.first_name,
  };
}

/**
 * Per-process token cache.
 *
 * Every `apiRequest` needs the header, so without this a run would log in on
 * each call — dozens of OTP verifications, and the platform would rightly
 * start refusing them.
 */
const tokens = new Map<string, Promise<OtpLoginResult>>();

export function cachedOtpLogin(client: ClientConfig): Promise<OtpLoginResult> {
  const existing = tokens.get(client.id);
  if (existing) return existing;
  const pending = otpLogin(client);
  tokens.set(client.id, pending);
  // A failed login must not be cached, or every later call reports the same
  // stale error instead of retrying.
  pending.catch(() => tokens.delete(client.id));
  return pending;
}
