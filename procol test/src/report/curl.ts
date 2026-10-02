import { ApiCallRecord } from "./apiLog.js";

/**
 * Turns a recorded call into evidence a reader can act on: a curl command they
 * can paste into a terminal, and the one line of the response that actually
 * decided the case.
 *
 * A header table plus a pretty-printed body says the same thing in ten times
 * the space and cannot be re-run — which is the only thing anyone wants from a
 * call that failed. One line of curl reproduces it.
 */

/** Name of the shell variable the redacted credential is emitted as. */
export const TOKEN_VAR = "PROCOL_TOKEN";

/** A create payload is a few hundred bytes; past this it is a bulk upload
 * nobody re-runs by hand. */
const MAX_BODY_CHARS = 4_000;

/** apiLog writes secrets as "<redacted, 412 chars>"; spot that shape. */
const REDACTED = /^<redacted,/;

/** Headers curl sets itself, or that say nothing about the request. */
const SKIP_HEADERS = /^(host|content-length|connection|user-agent)$/i;

const singleQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

function bodyString(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  const text = typeof body === "string" ? body : JSON.stringify(body);
  if (!text) return undefined;
  return text.length > MAX_BODY_CHARS
    ? `${text.slice(0, MAX_BODY_CHARS)}… TRUNCATED, ${text.length - MAX_BODY_CHARS} more chars`
    : text;
}

/**
 * One call as curl. Multi-line with trailing backslashes so it stays readable
 * in the report and still pastes as a single command.
 *
 * The credential is emitted as "$PROCOL_TOKEN", never the value — the token
 * never reached disk in the first place, and a report is something people
 * attach to tickets.
 */
export function toCurl(call: ApiCallRecord): string {
  const parts: string[] = [`curl -i -X ${call.method.toUpperCase()} ${singleQuote(call.url)}`];

  for (const [name, value] of Object.entries(call.requestHeaders ?? {})) {
    if (SKIP_HEADERS.test(name)) continue;
    parts.push(
      REDACTED.test(String(value))
        ? `  -H "${name}: $${TOKEN_VAR}"`
        : `  -H ${singleQuote(`${name}: ${value}`)}`,
    );
  }

  const body = bodyString(call.requestBody);
  if (body !== undefined) parts.push(`  -d ${singleQuote(body)}`);

  return parts.join(" \\\n");
}

/**
 * Takes `unknown`, not `string`, on purpose: these values come off recorded
 * evidence, some of it written before the client normalised message fields, so
 * the declared type is a claim about the future rather than about every file
 * on disk. A report must render what is there, not crash on it.
 */
function trim(value: unknown, max = 300): string {
  const text =
    typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join("; ")
        : typeof value === "object" && value !== null
          ? JSON.stringify(value)
          : String(value);
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/**
 * What the API said, in one short string.
 *
 * A response body on this platform runs to tens of kilobytes of schema; the
 * part that decides whether a case passed is a message field buried in it.
 * This pulls that out and leaves the rest on the floor.
 */
export function apiMessage(call: ApiCallRecord): string | undefined {
  if (call.error) return trim(call.error);

  const body = call.responseBody as Record<string, unknown> | undefined;
  if (body && typeof body === "object") {
    const nested = (body.data ?? {}) as Record<string, unknown>;
    const errorObj = (body.error ?? {}) as Record<string, unknown>;
    const candidate =
      body.message ??
      (typeof body.error === "string" ? body.error : errorObj.message) ??
      body.errors ??
      body.detail ??
      nested.message ??
      nested.error;
    if (candidate !== undefined && candidate !== null) {
      return trim(typeof candidate === "string" ? candidate : JSON.stringify(candidate));
    }
  }

  // Not JSON at all — a Rails exception page, say. The first readable line of
  // that is worth more than nothing.
  if (call.responseText) {
    const stripped = call.responseText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (stripped) return trim(stripped);
  }
  return undefined;
}

/** The record a successful create returned, when the response names one. */
export function createdRecordUuid(call: ApiCallRecord): string | undefined {
  const body = call.responseBody as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") return undefined;
  const candidates = [
    body.uuid,
    (body.data as Record<string, unknown> | undefined)?.uuid,
    (body.response as Record<string, unknown> | undefined)?.uuid,
    (body.fx_response as Record<string, unknown> | undefined)?.uuid,
  ];
  return candidates.find((v) => typeof v === "string" && v) as string | undefined;
}
