/**
 * Nothing credential-shaped reaches the evidence table.
 *
 * The runners already redact what they keep (engine.ts redactSecrets, the
 * journey's keepResponse); evidence is passed through this a second time on
 * its way into the database, because a store that holds thousands of requests
 * must not depend on every runner having remembered. Self-contained on
 * purpose: importing engine.ts here would pull the whole run machinery into
 * the database layer.
 */

/** Keys whose VALUE is never stored, whatever it looks like. */
const SECRET_KEY = /(^|[_-])(otp|otp_code|password|passwd|secret|client_secret|api[_-]?key|apikey|authorization|cookie|set-cookie)($|[_-])|token|session_id|sessionid/i;

/** The same text patterns engine.ts uses, for secrets inside free text. */
const SECRET_TEXT: Array<[RegExp, string]> = [
  [/((?:access|api|auth|session|lightspeed)[-_]?token\s*[:=]\s*)[^\s&"'<>]+/gi, "$1<redacted>"],
  [/(authorization\s*[:=]\s*(?:bearer\s+)?)\S+/gi, "$1<redacted>"],
  [/(cookie\s*[:=]\s*)[^\n]+/gi, "$1<redacted>"],
  [/\b[A-Za-z0-9+/]{48,}={0,2}\b/g, "<redacted>"],
];

export function redactText(s: string): string {
  let out = s;
  for (const [re, to] of SECRET_TEXT) out = out.replace(re, to);
  return out;
}

/** A deep copy with secret-named keys masked and secret-shaped text redacted. */
export function redactValue(v: unknown, depth = 0): unknown {
  if (depth > 40) return "<too deep>";
  if (v === null || v === undefined) return v ?? null;
  if (typeof v === "string") return redactText(v);
  if (typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => redactValue(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    out[k] = SECRET_KEY.test(k) && x !== null && x !== "" && typeof x !== "boolean" ? "<redacted>" : redactValue(x, depth + 1);
  }
  return out;
}

/** Size in bytes of a value as stored (UTF-8 JSON). */
export function jsonBytes(v: unknown): number {
  if (v === undefined || v === null) return 0;
  return Buffer.byteLength(typeof v === "string" ? v : JSON.stringify(v), "utf8");
}
