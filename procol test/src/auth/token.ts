import { nanoid } from "nanoid";

/**
 * Pure token builders replicating the app's `src/services/token.js`.
 * The app runs in the browser and uses `btoa`; Node has no `btoa` global on
 * every version, so we use Buffer base64 which is byte-identical for the
 * ASCII inputs used here.
 */
const btoa = (s: string): string => Buffer.from(s, "utf-8").toString("base64");

/**
 * 2-segment "bootstrap" token — used as `access-token` on the
 * generate_otp / verify_otp calls (before login).
 *   btoa(`${appKey}:${appSecret}`)
 */
export function buildBootstrapToken(appKey: string, appSecret: string): string {
  return btoa(`${appKey}:${appSecret}`);
}

/**
 * 3-segment authenticated token — used as `access-token` on all calls after
 * login. `secret` is the `access_token` field from the verify_otp response.
 *   btoa(`${appKey}:${appSecret}:${secret}`)
 */
export function buildAccessToken(
  appKey: string,
  appSecret: string,
  secret: string,
): string {
  return btoa(`${appKey}:${appSecret}:${secret}`);
}

/**
 * Lightspeed device token — sent as the `lightspeed-token` header.
 *   btoa(JSON.stringify({ "device-type": "web-console", uuid: nanoid(10) }))
 */
export function buildLightspeedToken(): string {
  return btoa(
    JSON.stringify({
      "device-type": "web-console",
      uuid: nanoid(10),
    }),
  );
}
