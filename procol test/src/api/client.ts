import {
  APIRequestContext,
  APIResponse,
  request as pwRequest,
} from "@playwright/test";
import qs from "qs";

import { CONFIG } from "../config.js";
import { recordApiCall } from "../report/apiLog.js";

export interface AuthTokens {
  accessToken: string;
  lightspeedToken: string;
  userUuid?: string;
  companyUuid?: string;
}

export interface RequestOptions {
  /** JSON body (objects are JSON.stringify-ed). Pass FormData/Buffer as `multipart`/`data` via rawOptions if needed. */
  body?: unknown;
  /** Query params — serialized with qs exactly like the app (arrays → key[0]=a&key[1]=b). */
  params?: Record<string, unknown>;
  /**
   * Body sent verbatim, without JSON.stringify. The only way to put a
   * deliberately malformed payload on the wire — `body` would re-encode an
   * invalid string into a valid JSON string and the case would prove nothing.
   */
  rawBody?: string;
  /** Extra headers merged over the defaults. */
  headers?: Record<string, string>;
  /** Per-call timeout override (ms). */
  timeoutMs?: number;
}

/** Error thrown on non 200–204 responses, surfacing `{ error: { message } }`. */
/**
 * Coerces whatever the API put in a message field into a string.
 *
 * Rails validation failures arrive as `["can't be blank"]`, and letting an
 * array through means every consumer that treats the message as text — the
 * thrown `ApiError`, the recorded evidence, the report — has to defend itself
 * against a type the field is not declared to hold. Normalising once, here,
 * is the only place that has to know.
 */
function messageText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value)) {
    const parts = value.map((v) => messageText(v)).filter(Boolean);
    return parts.length ? parts.join("; ") : undefined;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }
  return String(value);
}

export class ApiError extends Error {
  status: number;
  code?: string;
  data: unknown;
  constructor(message: string, status: number, code: string | undefined, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** Outcome of a non-throwing request — used by the contract Oracle, which
 * needs to inspect a REJECTED response (status + error code) as evidence, not
 * as an exception. */
export interface RawResult<T = unknown> {
  status: number;
  ok: boolean;
  data: T | null;
  errorCode?: string;
  errorMessage?: string;
  /** raw response text, truncated — used as the Oracle's evidence body. */
  rawText: string;
}

/**
 * Authenticated API helper. Mirrors `src/services/baseClient.js`:
 *  - headers: access-token, lightspeed-token, app-version, Content-Type
 *  - qs param serialization
 *  - success = 200..204
 *  - error contract: throws ApiError(error.message)
 */
export interface ClientOptions {
  baseURL?: string;
  /** app-version header (buyer/console vs vendor/agribid differ). */
  appVersion?: string;
  /** buyer | vendor | evaluator — recorded on every call for the report. */
  identity?: string;
  /** the company this client acts for; recorded for the report. */
  companyId?: number;
  /** config name of the environment, e.g. "clientA". */
  clientId?: string;
}

export class ApiClient {
  private ctx!: APIRequestContext;
  private ownsCtx = false;
  private baseURL: string;
  private appVersion: string;
  private identity?: string;
  private companyId?: number;
  private clientId: string;

  private constructor(private tokens: AuthTokens, opts: ClientOptions = {}) {
    this.baseURL = opts.baseURL ?? CONFIG.baseURL;
    this.appVersion = opts.appVersion ?? CONFIG.appVersion;
    this.identity = opts.identity;
    this.companyId = opts.companyId;
    this.clientId = opts.clientId ?? CONFIG.name;
  }

  /** Create a client with a fresh Playwright request context. */
  static async create(
    tokens: AuthTokens,
    opts: ClientOptions = {},
  ): Promise<ApiClient> {
    const client = new ApiClient(tokens, opts);
    client.ctx = await pwRequest.newContext({ baseURL: client.baseURL });
    client.ownsCtx = true;
    return client;
  }

  /** Wrap an existing request context (e.g. a Playwright fixture). */
  static wrap(
    ctx: APIRequestContext,
    tokens: AuthTokens,
    opts: ClientOptions = {},
  ): ApiClient {
    const client = new ApiClient(tokens, opts);
    client.ctx = ctx;
    client.ownsCtx = false;
    return client;
  }

  get context(): APIRequestContext {
    return this.ctx;
  }

  get authTokens(): AuthTokens {
    return this.tokens;
  }

  async dispose(): Promise<void> {
    if (this.ownsCtx) await this.ctx.dispose();
  }

  private buildUrl(path: string, params?: Record<string, unknown>): string {
    let endpoint = path;
    if (params) {
      const serialized = qs.stringify(params, { skipNulls: true });
      if (serialized) {
        endpoint += (endpoint.includes("?") ? "&" : "?") + serialized;
      }
    }
    return endpoint;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      "access-token": this.tokens.accessToken,
      "lightspeed-token": this.tokens.lightspeedToken,
      "app-version": this.appVersion,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  /** Absolute URL for the report — `buildUrl` returns a baseURL-relative path. */
  private absoluteUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    return `${this.baseURL.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`;
  }

  private async request(
    method: Method,
    path: string,
    opts: RequestOptions = {},
  ): Promise<unknown> {
    const url = this.buildUrl(path, opts.params);
    const hasRawBody = opts.rawBody !== undefined;
    const hasBody = !hasRawBody && opts.body !== undefined && opts.body !== null;
    const requestHeaders = this.headers(opts.headers);
    // Fixed before the call so a request that never completes is still dated.
    const timestamp = new Date().toISOString();
    const started = Date.now();

    // Shared by every exit path below, so a call is recorded exactly once
    // whether it succeeded, was rejected by the API, or never connected.
    const evidence = {
      timestamp,
      clientId: this.clientId,
      companyId: this.companyId,
      identity: this.identity,
      method,
      url: this.absoluteUrl(url),
      requestHeaders,
      requestBody: hasRawBody ? opts.rawBody : hasBody ? opts.body : undefined,
    };

    let res: APIResponse;
    try {
      res = await this.ctx.fetch(url, {
        method,
        headers: requestHeaders,
        timeout: opts.timeoutMs ?? CONFIG.timeoutMs,
        ...(hasRawBody ? { data: opts.rawBody } : {}),
        ...(hasBody ? { data: JSON.stringify(opts.body) } : {}),
      });
    } catch (err) {
      // Transport-level: DNS, refused connection, or the per-call timeout.
      const message = (err as Error).message;
      await recordApiCall({
        ...evidence,
        ok: false,
        status: 0,
        durationMs: Date.now() - started,
        error: `Request never completed: ${message}`,
      });
      throw err;
    }

    const status = res.status();
    const text = await res.text();
    const durationMs = Date.now() - started;

    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text || null;
    }

    const isSuccess = status >= 200 && status < 205;
    const errObj =
      (data as {
        error?: { code?: string; message?: unknown } | string;
        message?: unknown;
      }) ?? {};
    // The platform's documented contract is `{ error: { message } }`, but its
    // 500 handler answers `{ error: "Internal Server Error" }` — a string —
    // and its model validations answer `{ message: ["can't be blank"] }` — an
    // array. All three shapes have to be read, or a failure loses the only
    // text it carries, and `messageText` guarantees a string comes out
    // whichever one arrived.
    const errorText =
      typeof errObj.error === "string" ? errObj.error : messageText(errObj.error?.message);
    const message = isSuccess
      ? undefined
      : errorText ?? messageText(errObj.message) ?? `HTTP ${status} on ${method} ${path}`;

    await recordApiCall({
      ...evidence,
      ok: isSuccess,
      status,
      statusText: res.statusText(),
      responseHeaders: res.headers(),
      ...(typeof data === "string" ? { responseText: data } : { responseBody: data }),
      durationMs,
      error: message,
      errorCode: isSuccess || typeof errObj.error === "string" ? undefined : errObj.error?.code,
    });

    if (!isSuccess) {
      const code = typeof errObj.error === "string" ? undefined : errObj.error?.code;
      throw new ApiError(message!, status, code, data);
    }
    return data;
  }

  /**
   * Performs a call and returns the outcome instead of throwing on non-2xx.
   *
   * The typed verbs below throw, which is what a flow wants — a resolved call
   * is already a success. A negative or edge case wants the opposite: the
   * status IS the assertion, so it must come back as a value. Evidence is
   * recorded either way, because both go through `request`.
   */
  async raw(
    method: Method,
    path: string,
    opts: RequestOptions = {},
  ): Promise<{ ok: boolean; status: number; data: unknown; message?: string; code?: string }> {
    try {
      const data = await this.request(method, path, opts);
      // `request` only resolves on 200–204; the exact code is in the evidence.
      return { ok: true, status: 200, data };
    } catch (err) {
      if (err instanceof ApiError) {
        return { ok: false, status: err.status, data: err.data, message: err.message, code: err.code };
      }
      // Transport failure: no HTTP status was ever assigned.
      return { ok: false, status: 0, data: undefined, message: (err as Error).message };
    }
  }

  /**
   * Like get/post/patch/... but never throws on a non-2xx response — it
   * returns the outcome instead (status, parsed body, error code/message).
   * Used by the contract-driven Oracle suite (`src/flows/eventsContract.ts`),
   * where a "negative" case's whole point is inspecting the rejection, not
   * catching an exception for it.
   */
  async attempt<T = unknown>(
    method: Method,
    path: string,
    opts: RequestOptions = {},
  ): Promise<RawResult<T>> {
    const url = this.buildUrl(path, opts.params);
    const hasBody = opts.body !== undefined && opts.body !== null;
    const requestHeaders = this.headers(opts.headers);
    const timestamp = new Date().toISOString();
    const started = Date.now();

    // Recorded on exactly the same terms as `request` does it. A contract case
    // is the one that most needs its evidence in the report — it is the row
    // that says the product is wrong — and for a long time this path recorded
    // nothing, so those rows arrived with no call, no response and no curl.
    const evidence = {
      timestamp,
      clientId: this.clientId,
      companyId: this.companyId,
      identity: this.identity,
      method,
      url: this.absoluteUrl(url),
      requestHeaders,
      requestBody: hasBody ? opts.body : undefined,
    };

    let res: APIResponse;
    try {
      res = await this.ctx.fetch(url, {
        method,
        headers: requestHeaders,
        timeout: opts.timeoutMs ?? CONFIG.timeoutMs,
        ...(hasBody ? { data: JSON.stringify(opts.body) } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordApiCall({
        ...evidence,
        ok: false,
        status: 0,
        durationMs: Date.now() - started,
        error: `Request never completed: ${message}`,
      });
      return {
        status: 0,
        ok: false,
        data: null,
        errorMessage: message,
        rawText: "",
      };
    }
    const status = res.status();
    const text = await res.text();
    const durationMs = Date.now() - started;
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text || null;
    }
    const ok = status >= 200 && status < 205;
    const errObj =
      (data as { error?: { code?: string | number; message?: unknown }; message?: unknown } | null) ??
      {};
    const errorCode = errObj.error?.code !== undefined ? String(errObj.error.code) : undefined;
    const errorMessage = messageText(errObj.error?.message) ?? messageText(errObj.message);

    await recordApiCall({
      ...evidence,
      ok,
      status,
      statusText: res.statusText(),
      responseHeaders: res.headers(),
      ...(typeof data === "string" ? { responseText: data } : { responseBody: data }),
      durationMs,
      error: ok ? undefined : errorMessage ?? `HTTP ${status} on ${method} ${path}`,
      errorCode: ok ? undefined : errorCode,
    });

    return {
      status,
      ok,
      data: data as T,
      errorCode,
      errorMessage,
      rawText: text.slice(0, 2000),
    };
  }

  get<T = unknown>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request("GET", path, opts) as Promise<T>;
  }
  post<T = unknown>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request("POST", path, opts) as Promise<T>;
  }
  patch<T = unknown>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request("PATCH", path, opts) as Promise<T>;
  }
  put<T = unknown>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request("PUT", path, opts) as Promise<T>;
  }
  delete<T = unknown>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request("DELETE", path, opts) as Promise<T>;
  }
}
