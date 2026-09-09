import {
  APIRequestContext,
  APIResponse,
  request as pwRequest,
} from "@playwright/test";
import qs from "qs";

import { CONFIG } from "../config.js";

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
  /** Extra headers merged over the defaults. */
  headers?: Record<string, string>;
  /** Per-call timeout override (ms). */
  timeoutMs?: number;
}

/** Error thrown on non 200–204 responses, surfacing `{ error: { message } }`. */
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

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

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
}

export class ApiClient {
  private ctx!: APIRequestContext;
  private ownsCtx = false;
  private baseURL: string;
  private appVersion: string;

  private constructor(private tokens: AuthTokens, opts: ClientOptions = {}) {
    this.baseURL = opts.baseURL ?? CONFIG.baseURL;
    this.appVersion = opts.appVersion ?? CONFIG.appVersion;
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

  private async request(
    method: Method,
    path: string,
    opts: RequestOptions = {},
  ): Promise<unknown> {
    const url = this.buildUrl(path, opts.params);
    const hasBody = opts.body !== undefined && opts.body !== null;

    const res: APIResponse = await this.ctx.fetch(url, {
      method,
      headers: this.headers(opts.headers),
      timeout: opts.timeoutMs ?? CONFIG.timeoutMs,
      ...(hasBody ? { data: JSON.stringify(opts.body) } : {}),
    });

    return this.parse(res, method, path);
  }

  private async parse(
    res: APIResponse,
    method: Method,
    path: string,
  ): Promise<unknown> {
    const status = res.status();
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text || null;
    }

    const isSuccess = status >= 200 && status < 205;
    if (!isSuccess) {
      const errObj = (data as { error?: { code?: string; message?: string }; message?: string }) ?? {};
      const message =
        errObj.error?.message ??
        errObj.message ??
        `HTTP ${status} on ${method} ${path}`;
      throw new ApiError(message, status, errObj.error?.code, data);
    }
    return data;
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
