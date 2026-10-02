import { ACTIVE_ENVIRONMENT, ENVIRONMENTS } from "../../config/settings.js";

/**
 * A check's request, as a command a reader can paste into a terminal.
 *
 * The reason the reports print curl instead of request/response dumps: a dump
 * is bigger, says the same thing, and cannot be re-run. One curl reproduces
 * the exact call that produced the verdict — which is the only thing a
 * developer reading a failure actually wants.
 *
 * The credential is emitted as $PROCOL_TOKEN. No token is ever written into a
 * report: these get attached to tickets.
 */

export const TOKEN_VAR = "PROCOL_TOKEN";

/** Bodies past this are cut — nobody re-runs a 20 kB payload by hand. */
const MAX_BODY_CHARS = 3_000;

const singleQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

export interface CurlRequest {
  method: string;
  path: string;
  body?: unknown;
}

function bodyText(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  let text: string;
  try {
    text = typeof body === "string" ? body : JSON.stringify(body);
  } catch {
    return undefined;
  }
  if (!text || text === "{}") return undefined;
  return text.length > MAX_BODY_CHARS
    ? `${text.slice(0, MAX_BODY_CHARS)}… TRUNCATED, ${text.length - MAX_BODY_CHARS} more chars`
    : text;
}

export function toCurl(request: CurlRequest, companyId?: number): string {
  const method = request.method.toUpperCase();
  const env = ENVIRONMENTS[ACTIVE_ENVIRONMENT];
  const base = env.apiBaseUrl.replace(/\/$/, "");
  const path = request.path.startsWith("/") ? request.path : `/${request.path}`;

  const parts = [`curl -i -X ${method} ${singleQuote(base + path)}`, `  -H 'accept: application/json'`];
  if (method !== "GET") parts.push(`  -H 'content-type: application/json'`);
  parts.push(`  -H 'app-version: ${env.appVersion}'`);
  parts.push(`  -H "authorization: $${TOKEN_VAR}"`);
  if (companyId !== undefined) parts.push(`  -H 'company-id: ${companyId}'`);

  const body = bodyText(request.body);
  if (body !== undefined) parts.push(`  -d ${singleQuote(body)}`);
  return parts.join(" \\\n");
}

/** True when a request still holds a {{placeholder}} — a template, not a run. */
export function isTemplate(request: CurlRequest): boolean {
  const text = `${request.path} ${JSON.stringify(request.body ?? "")}`;
  return /\{\{[^}]+\}\}/.test(text);
}
