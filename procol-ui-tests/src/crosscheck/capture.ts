import type { Page, Request, Response } from "@playwright/test";
import { redactSecrets } from "../support/redact.js";
import { routeShape } from "../oracle/evidence.js";

/**
 * NETWORK CAPTURE FOR THE UI ↔ API CROSS-CHECK.
 *
 * The question this answers is "what did the backend actually send while this
 * screen was on display?". So every JSON response the console fetched from
 * Procol's API is kept — successes as well as failures, full body — and each
 * one is filed under the SCREEN the run said it was on at that moment
 * (`setScreen`), together with the browser URL.
 *
 * The existing recorders keep only failures (EvidenceCollector) or a 4 KB
 * sample (FlowRecorder). Neither is enough to compare a line-item quantity on
 * screen with the one in the payload, so this keeps the body, capped.
 *
 * NO CREDENTIAL IS STORED. Headers are never read. URLs go through the
 * suite's own `redactSecrets`. Bodies are walked and any key that looks like a
 * credential is masked, and signed storage URLs lose their query string (the
 * signature is a bearer credential for that file).
 */

export interface CapturedResponse {
  seq: number;
  /** The screen the run was on when the response arrived (set by the driver). */
  screen: string;
  method: string;
  /** Ids collapsed to :id, so the same call is recognisable across runs. */
  route: string;
  /** Literal path + query, ids intact, secrets redacted. */
  path: string;
  status: number;
  ok: boolean;
  /** Browser URL at the time (redacted). */
  pageUrl: string;
  at: string;
  /** When the browser SENT the request — responses can arrive out of order. */
  requestedAt?: string;
  /** Parsed JSON body, secrets masked; null when not JSON or unreadable. */
  body: unknown;
  /** Bytes of the raw body, so a truncated/omitted body is visible. */
  bytes: number;
  /** True when the body was larger than the cap and was dropped. */
  truncated?: boolean;
  /** Request body for non-GET calls (JSON when parseable), masked. */
  request?: unknown;
}

const IGNORE = /google|segment|analytics|sentry|clarity|intercom|hotjar|doubleclick|lightspeed|\.(png|jpe?g|svg|gif|woff2?|css|js|ico|map)(\?|$)/i;
const SECRET_KEY = /(^|_|-)(access[-_]?token|refresh[-_]?token|token|secret|password|otp|signature|authorization|cookie|api[-_]?key|lightspeed[-_]?token)$/i;
const MAX_BODY = 2_000_000;

/** Mask credentials anywhere inside a parsed body. */
export function maskBody(value: unknown, depth = 0): unknown {
  if (depth > 40) return value;
  if (typeof value === "string") {
    // Signed storage URLs: the query string IS the credential.
    if (/^https?:\/\//.test(value) && /[?&](Signature|X-Amz-Signature|Key-Pair-Id|Expires)=/i.test(value)) {
      return value.split("?")[0] + "?<signed-query-redacted>";
    }
    return redactSecrets(value);
  }
  if (Array.isArray(value)) return value.map((v) => maskBody(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) && v !== null && typeof v !== "object" ? "<redacted>" : maskBody(v, depth + 1);
    }
    return out;
  }
  return value;
}

function parseJson(s: string | null | undefined): unknown {
  if (s == null || s === "") return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export class NetworkCapture {
  readonly responses: CapturedResponse[] = [];
  private screen = "start";
  private detach: Array<() => void> = [];
  private pending = new Set<Promise<void>>();

  constructor(
    private readonly page: Page,
    /** Which hosts are "the API". Defaults to anything with /api/ or sec-api. */
    private readonly apiHost: RegExp = /sec-api|\/api\//,
  ) {}

  /** Tell the capture which screen the run is on; later responses file under it. */
  setScreen(name: string): void {
    this.screen = name;
  }

  currentScreen(): string {
    return this.screen;
  }

  start(): void {
    const onResponse = (res: Response) => {
      const job = this.record(res).catch(() => {});
      this.pending.add(job);
      void job.finally(() => this.pending.delete(job));
    };
    this.page.on("response", onResponse);
    this.detach.push(() => this.page.off("response", onResponse));
  }

  private async record(res: Response): Promise<void> {
    const req: Request = res.request();
    const url = res.url();
    if (!this.apiHost.test(url) || IGNORE.test(url)) return;
    if (req.method() === "OPTIONS") return;
    const type = req.resourceType();
    if (type !== "xhr" && type !== "fetch") return;
    const screen = this.screen;
    const at = new Date().toISOString();
    const pageUrl = redactSecrets(this.page.url());
    let requestedAt: string | undefined;
    try {
      const t = req.timing().startTime;
      if (t > 0) requestedAt = new Date(t).toISOString();
    } catch {
      requestedAt = undefined;
    }
    let text = "";
    try {
      text = await res.text();
    } catch {
      text = "";
    }
    let path = url;
    try {
      const u = new URL(url);
      path = u.pathname + u.search;
    } catch {
      /* keep */
    }
    const big = text.length > MAX_BODY;
    const parsed = big ? null : parseJson(text);
    let request: unknown;
    if (req.method() !== "GET") {
      let raw: string | null = null;
      try {
        raw = req.postData();
      } catch {
        raw = null;
      }
      const pj = parseJson(raw);
      request = pj !== null ? maskBody(pj) : raw ? redactSecrets(raw).slice(0, 2_000) : undefined;
    }
    this.responses.push({
      seq: this.responses.length + 1,
      screen,
      method: req.method(),
      route: redactSecrets(routeShape(url)),
      path: redactSecrets(path),
      status: res.status(),
      ok: res.status() < 400,
      pageUrl,
      at,
      ...(requestedAt ? { requestedAt } : {}),
      body: parsed === null ? null : maskBody(parsed),
      bytes: text.length,
      ...(big ? { truncated: true } : {}),
      ...(request !== undefined ? { request } : {}),
    });
  }

  /** Wait for bodies still being read (a response event fires before its body is in). */
  async flush(timeoutMs = 5_000): Promise<void> {
    const all = Promise.allSettled([...this.pending]);
    await Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
  }

  /** Responses filed under one screen, in arrival order. */
  forScreen(screen: string): CapturedResponse[] {
    return this.responses.filter((r) => r.screen === screen);
  }

  stop(): void {
    for (const d of this.detach) d();
    this.detach = [];
  }
}
