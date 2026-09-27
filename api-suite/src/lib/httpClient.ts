import { ClientConfig } from '../types';
import { buildAuthHeaders, needsOtpLogin } from './auth';
import { cachedOtpLogin } from './otpLogin';
import { recordApiCall } from './apiLog';

/** Sent when a client config does not pin its own. See the note in apiRequest. */
const DEFAULT_APP_VERSION = '9.4.349';

export interface TimedResponse<T = unknown> {
  ok: boolean;
  status: number;
  /** milliseconds from request start to response body parsed */
  durationMs: number;
  body?: T;
  /** set when the body was not valid JSON, or the request never completed */
  error?: string;
  url: string;
  method: string;
}

/** Every API call goes through here so response time and status are captured
 * uniformly — the timing tests read the same records the functional tests
 * produce, rather than measuring separately.
 *
 * This array is per-process and only useful within a single test file. The
 * durable copy is written by `recordApiCall` to reports/api-calls/, which is
 * what the HTML report is built from. */
export const timings: TimedResponse[] = [];

function headerMap(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, name) => { out[name] = value; });
  return out;
}

export async function apiRequest<T = unknown>(
  client: ClientConfig,
  url: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<TimedResponse<T>> {
  const method = init.method ?? 'GET';
  // An otp client has no token in the environment; it logs in once per process
  // and every later call reuses the cached result.
  const loginHeaders: Record<string, string> = needsOtpLogin(client)
    ? { [(client.auth as { headerName: string }).headerName]: (await cachedOtpLogin(client)).accessToken }
    : {};
  const requestHeaders: Record<string, string> = {
    accept: 'application/json',
    ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    // The platform versions its serializers by this header. Omit it and some
    // endpoints answer 200 with a QUIETLY REDUCED payload — `get_approvals`
    // drops every step/approver uuid, which is what made approving a document
    // look impossible via the API. Always send it.
    'app-version': client.appVersion ?? DEFAULT_APP_VERSION,
    ...buildAuthHeaders(client),
    ...loginHeaders,
    ...init.headers,
  };
  // Captured before the call so a request that never completes is still dated.
  const timestamp = new Date().toISOString();
  const started = Date.now();
  let record: TimedResponse<T>;

  try {
    const res = await fetch(url, {
      method,
      headers: requestHeaders,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    const text = await res.text();
    let body: T | undefined;
    let error: string | undefined;
    if (text) {
      try {
        body = JSON.parse(text) as T;
      } catch {
        error = `Response was not JSON (${text.slice(0, 120)})`;
      }
    }
    const durationMs = Date.now() - started;
    record = { ok: res.ok, status: res.status, durationMs, body, error, url, method };

    recordApiCall({
      timestamp, clientId: client.id, method, url,
      requestHeaders, requestBody: init.body,
      ok: res.ok, status: res.status, statusText: res.statusText,
      responseHeaders: headerMap(res.headers),
      ...(body !== undefined ? { responseBody: body } : { responseText: text }),
      durationMs, error,
    });
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = (err as Error).message;
    record = { ok: false, status: 0, durationMs, error: message, url, method };

    recordApiCall({
      timestamp, clientId: client.id, method, url,
      requestHeaders, requestBody: init.body,
      ok: false, status: 0, durationMs,
      error: `Request never completed: ${message}`,
    });
  }

  timings.push(record);
  return record;
}

/** Same call without auth headers — used by the security tests to confirm the
 * API actually rejects anonymous requests. */
export async function unauthenticatedRequest(url: string): Promise<TimedResponse> {
  const requestHeaders = { accept: 'application/json' };
  const timestamp = new Date().toISOString();
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: requestHeaders });
    const text = await res.text();
    const durationMs = Date.now() - started;
    let responseBody: unknown;
    try { responseBody = text ? JSON.parse(text) : undefined; } catch { responseBody = undefined; }

    recordApiCall({
      timestamp, clientId: '(no credentials)', method: 'GET', url,
      requestHeaders, unauthenticated: true,
      ok: res.ok, status: res.status, statusText: res.statusText,
      responseHeaders: headerMap(res.headers),
      ...(responseBody !== undefined ? { responseBody } : { responseText: text }),
      durationMs,
    });
    return { ok: res.ok, status: res.status, durationMs, url, method: 'GET' };
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = (err as Error).message;
    recordApiCall({
      timestamp, clientId: '(no credentials)', method: 'GET', url,
      requestHeaders, unauthenticated: true,
      ok: false, status: 0, durationMs,
      error: `Request never completed: ${message}`,
    });
    return { ok: false, status: 0, durationMs, error: message, url, method: 'GET' };
  }
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}
