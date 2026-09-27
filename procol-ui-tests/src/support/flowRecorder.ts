import type { Page, Response, Request } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { routeShape } from "../oracle/evidence.js";

/**
 * Record the REAL API calls a flow makes — success and failure alike.
 *
 * The Oracle's EvidenceCollector only keeps failures (status ≥ 400), because
 * that is what a defect report needs. Recording a flow for test-case
 * generation needs the opposite: every meaningful `/api/*` call the browser
 * makes while a person (or an automated plan) drives it, so the real request
 * shape and the real response can be turned into human cases with field-level
 * checks.
 *
 * What it deliberately does NOT keep: request/response HEADERS (so the access
 * token is never written to disk), static assets, third-party analytics, and
 * preflight OPTIONS. Repeated identical GETs (polling) collapse to one entry
 * with a count, so a flow reads as the handful of calls that matter, not the
 * hundred a live SPA fires.
 */
const API_HOST = /sec-api|\/api\//;
const IGNORE = /google|segment|analytics|sentry|clarity|intercom|hotjar|doubleclick|\.(png|jpe?g|svg|gif|woff2?|css|js|ico|map)(\?|$)/i;

export interface RecordedCall {
  order: number;
  method: string;
  /** Ids normalised to :id, so a call is recognisable across runs. */
  path: string;
  /** The literal path+query, ids intact, for replay. */
  rawPath: string;
  /** Parsed request body when it is JSON, else the raw string, else null. */
  request: unknown;
  status: number;
  /** Parsed response body (truncated) when JSON, else a string sample. */
  response: unknown;
  /** How many identical calls collapsed into this one (polling). */
  repeated: number;
  ms: number;
}

function parseMaybeJson(s: string | null | undefined): unknown {
  if (s == null || s === "") return null;
  try {
    return JSON.parse(s);
  } catch {
    return s.length > 2000 ? s.slice(0, 2000) + "…" : s;
  }
}

/** A stable key so polling GETs collapse but distinct calls don't. */
function keyOf(method: string, path: string, request: unknown): string {
  const body = request == null ? "" : JSON.stringify(request);
  return `${method} ${path} ${body}`.slice(0, 500);
}

export class FlowRecorder {
  private calls: RecordedCall[] = [];
  private byKey = new Map<string, RecordedCall>();
  private started = Date.now();
  private detach: Array<() => void> = [];

  constructor(private readonly page: Page, private readonly host = API_HOST) {}

  start(): void {
    const onResponse = async (res: Response) => {
      const req: Request = res.request();
      const url = res.url();
      if (!this.host.test(url) || IGNORE.test(url)) return;
      if (req.method() === "OPTIONS") return;
      const type = req.resourceType();
      if (type !== "xhr" && type !== "fetch") return;

      let responseBody = "";
      try {
        responseBody = (await res.text()).slice(0, 4000);
      } catch {
        responseBody = "";
      }
      let rawReq: string | null = null;
      try {
        rawReq = req.postData();
      } catch {
        rawReq = null;
      }
      const path = routeShape(url) || new URL(url).pathname;
      const request = parseMaybeJson(rawReq);
      const key = keyOf(req.method(), path, request);
      const existing = this.byKey.get(key);
      if (existing) {
        existing.repeated += 1;
        existing.status = res.status(); // keep the latest outcome
        return;
      }
      let rawPath = url;
      try {
        rawPath = new URL(url).pathname + new URL(url).search;
      } catch {
        /* keep full */
      }
      const call: RecordedCall = {
        order: this.calls.length + 1,
        method: req.method(),
        path,
        rawPath,
        request,
        status: res.status(),
        response: parseMaybeJson(responseBody),
        repeated: 1,
        ms: Date.now() - this.started,
      };
      this.calls.push(call);
      this.byKey.set(key, call);
    };
    this.page.on("response", onResponse);
    this.detach.push(() => this.page.off("response", onResponse));
  }

  /** Calls captured so far — mutations first-class, reads included. */
  snapshot(): RecordedCall[] {
    return this.calls.slice();
  }

  /** Write the recording and return where it went. */
  save(name: string): string {
    for (const d of this.detach) d();
    const safe = name.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "flow";
    const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "recordings");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${safe}.flow.json`);
    const mutations = this.calls.filter((c) => c.method !== "GET").length;
    writeFileSync(
      file,
      JSON.stringify(
        {
          name: safe,
          recordedAt: new Date().toISOString(),
          appApiHost: String(this.host),
          totalCalls: this.calls.length,
          mutations,
          calls: this.calls,
        },
        null,
        2,
      ),
    );
    return file;
  }
}
