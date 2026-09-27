/**
 * NO CREDENTIAL REACHES A REPORT.
 *
 * The browser writes its own failures to the console, and some of them carry
 * the URL that failed. One of those is the Lightspeed WebSocket, whose URL
 * carries the session's `access-token` as a query parameter — so a journey
 * that passed published a live credential into its own report, which is a file
 * people attach to tickets and paste into chat.
 *
 * Redaction happens where the text is CAPTURED rather than where it is
 * rendered, because every later reader — the result file, the trail, the bug
 * sheet, a copy someone saved — is downstream of this point. The report side
 * redacts as well, for records written before this existed; belt and braces is
 * the right amount of care for a secret.
 *
 * The patterns mirror the API framework's `redactHeaders`/`redactQuery`, so
 * both suites agree about what a secret looks like.
 */

const SECRETS: Array<[RegExp, string]> = [
  // `access-token=…` / `lightspeed-token: …`, in a URL, a header dump or prose.
  // Bounded by & " ' < > and whitespace so the rest of a URL survives: a line
  // that is safe but unreadable gets deleted by the next person to read it.
  [/((?:access|api|auth|session|lightspeed|refresh)[-_]?token\s*[:=]\s*)[^\s&"'<>]+/gi, "$1<redacted>"],
  [/((?:authorization|cookie|password|secret|otp)\s*[:=]\s*(?:bearer\s+)?)[^\s&"'<>]+/gi, "$1<redacted>"],
];

/** Strip anything credential-shaped out of text about to be stored. */
export function redactSecrets(text: string): string {
  let out = String(text ?? "");
  for (const [re, to] of SECRETS) out = out.replace(re, to);
  return out;
}
