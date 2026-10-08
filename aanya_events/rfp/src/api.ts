/**
 * EVERY CALL, RECORDED AS SOMETHING A PERSON CAN REPLAY.
 *
 * The collection sent the console's own headers on every request —
 * access-token, lightspeed-token, app-version — and so does this. Each call is
 * kept with its status, its time, the body sent and the start of what came
 * back, plus a curl with the token left as $ACCESS_TOKEN so the report can be
 * shared without handing anyone a session.
 */
import type { APIRequestContext } from "@playwright/test";

import { ACCOUNT } from "./config.js";

/**
 * How a call authenticates.
 *
 * - "default": the run's access-token
 * - "none": no access-token header at all (the 401 cases)
 * - { token, shown }: a specific wrong token, and how the curl should print it
 */
export type AuthMode = "default" | "none" | { token: string; shown: string };

export interface CallRecord {
  method: string;
  /** path + query, relative to the host */
  path: string;
  status: number;
  ms: number;
  requestBody?: string;
  contentType?: string;
  responseContentType: string;
  responseSize: number;
  /** the first 4000 characters of the reply */
  responseText: string;
  /** reply headers a check looked at */
  responseHeaders: Record<string, string>;
  curl: string;
  at: string;
}

export interface ApiResponse {
  status: number;
  ms: number;
  text: string;
  json: any;
  headers: Record<string, string>;
  size: number;
}

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

function curlFor(method: string, url: string, headers: Array<[string, string]>, body?: string): string {
  const parts = [`curl -X ${method} ${shq(url)}`];
  for (const [k, v] of headers) parts.push(`  -H ${shq(`${k}: ${v}`)}`);
  if (body !== undefined) parts.push(`  --data-raw ${shq(body.length > 6000 ? body.slice(0, 6000) + "…" : body)}`);
  return parts.join(" \\\n");
}

export class Api {
  readonly calls: CallRecord[] = [];

  constructor(private readonly ctx: APIRequestContext) {}

  async call(
    method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT",
    path: string,
    opts: {
      body?: unknown;
      raw?: string;
      contentType?: string;
      auth?: AuthMode;
      /** the vendor portal's own app version, when calling as a vendor */
      appVersion?: string;
      /** extra headers, e.g. X-Proc-Client: vendor */
      headers?: Record<string, string>;
    } = {},
  ): Promise<ApiResponse> {
    const auth = opts.auth ?? "default";
    const headers: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      "app-version": opts.appVersion ?? ACCOUNT.appVersion,
      ...(opts.headers ?? {}),
    };
    const shown: Array<[string, string]> = [["Accept", headers.Accept]];
    if (auth === "default") {
      headers["access-token"] = ACCOUNT.token;
      shown.push(["access-token", "$ACCESS_TOKEN"]);
    } else if (auth !== "none") {
      headers["access-token"] = auth.token;
      shown.push(["access-token", auth.shown]);
    }
    if (ACCOUNT.lightspeed) {
      headers["lightspeed-token"] = ACCOUNT.lightspeed;
      shown.push(["lightspeed-token", "$LIGHTSPEED_TOKEN"]);
    }
    shown.push(["app-version", headers["app-version"]]);
    for (const [k, v] of Object.entries(opts.headers ?? {})) shown.push([k, v]);

    let data: string | undefined;
    if (opts.raw !== undefined) data = opts.raw;
    else if (opts.body !== undefined) data = JSON.stringify(opts.body);
    if (data !== undefined) {
      headers["Content-Type"] = opts.contentType ?? "application/json";
      shown.push(["Content-Type", headers["Content-Type"]]);
    }

    const url = ACCOUNT.baseUrl + path;
    const started = Date.now();
    const at = new Date(started).toISOString();
    let status = 0;
    let text = "";
    let resHeaders: Record<string, string> = {};
    let size = 0;
    try {
      const res = await this.ctx.fetch(url, {
        method,
        headers,
        data,
        failOnStatusCode: false,
        timeout: 60_000,
        maxRedirects: 0,
      });
      status = res.status();
      const buf = await res.body();
      size = buf.length;
      text = buf.toString("utf8");
      resHeaders = res.headers();
    } catch (e) {
      text = `request did not complete: ${(e as Error).message.split("\n")[0]}`;
    }
    const ms = Date.now() - started;
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    const keep: Record<string, string> = {};
    for (const k of ["content-type", "x-powered-by", "server", "x-runtime"]) if (resHeaders[k]) keep[k] = resHeaders[k];

    this.calls.push({
      method,
      path,
      status,
      ms,
      requestBody: data,
      contentType: headers["Content-Type"],
      responseContentType: resHeaders["content-type"] ?? "",
      responseSize: size,
      responseText: text.slice(0, 4000),
      responseHeaders: keep,
      curl: curlFor(method, url, shown, data),
      at,
    });

    return { status, ms, text, json, headers: resHeaders, size };
  }
}
