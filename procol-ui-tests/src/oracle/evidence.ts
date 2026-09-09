import { Page, Request, Response } from "@playwright/test";
import { drainToasts } from "./journal.js";

/**
 * What actually happened during a flow, gathered as it runs.
 *
 * The point of separating evidence from judgement: a flow that ends in
 * "waitForURL timed out" tells you nothing, while the same flow with its HTTP
 * traffic attached tells you the publish returned 500. The Oracle reads this;
 * it never guesses.
 */
export interface HttpFailure {
  method: string;
  url: string;
  path: string;
  status: number;
  requestBody: string | null;
  responseBody: string;
  at: string;
}

export interface ToastRecord {
  severity: "error" | "warning" | "success" | "info";
  text: string;
  at: string;
}

export interface Evidence {
  flowKey: string;
  startedAt: string;
  finishedAt?: string;
  url?: string;
  httpFailures: HttpFailure[];
  toasts: ToastRecord[];
  consoleErrors: string[];
  /** Deliberate notes the flow adds, e.g. "stages composed: [rfq]". */
  notes: string[];
}

/**
 * Collapse an id-bearing URL down to its route.
 *
 * Procol ids are short base64-ish tokens (`Z3BnY2tY`), so "looks like an id" is
 * any segment that is not a plain lowercase word.
 */
export function routeShape(url: string): string {
  const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  return path
    .split("/")
    .map((seg) => (seg && !/^[a-z][a-z0-9_-]*$/.test(seg) ? ":id" : seg))
    .join("/");
}

/** API hosts worth recording. Everything else is noise (analytics, fonts, CDNs). */
const API_HOST = /sec-api|\/api\//;
const IGNORE = /google|segment|analytics|sentry|clarity|intercom|hotjar|doubleclick/;

export class EvidenceCollector {
  readonly evidence: Evidence;
  private detach: Array<() => void> = [];

  constructor(
    private readonly page: Page,
    flowKey: string,
  ) {
    this.evidence = {
      flowKey,
      startedAt: new Date().toISOString(),
      httpFailures: [],
      toasts: [],
      consoleErrors: [],
      notes: [],
    };
  }

  /**
   * Record every toast the app raises, for the whole flow.
   *
   * Polling for a toast at the moment we happen to look is hopeless: antd
   * messages live for about three seconds, so the one that explains a failure
   * has usually faded by the time the assertion fails. An init script installs
   * a MutationObserver once per document — surviving navigations — so the
   * app's own words are still available at the end of the run.
   */
  async installToastRecorder(): Promise<void> {
    await this.page.addInitScript(() => {
      const w = window as unknown as { __qaToasts?: Array<{ severity: string; text: string; at: string }> };
      if (w.__qaToasts) return;
      w.__qaToasts = [];
      const classify = (el: Element): string => {
        // antd puts the severity on the content wrapper AND uses an icon child;
        // reading the child's class returned "info" for every message, so scan
        // the wrapper's own markup instead.
        const c = (el.className?.toString() ?? "") + " " + (el.innerHTML ?? "");
        if (/error/.test(c)) return "error";
        if (/warn/.test(c)) return "warning";
        if (/success/.test(c)) return "success";
        return "info";
      };
      const harvest = () => {
        document.querySelectorAll(".ant-message-notice, .ant-notification-notice").forEach((n) => {
          const inner = n.querySelector(".ant-message-custom-content, .ant-notification-notice-content") ?? n;
          const text = (n.textContent ?? "").trim();
          if (!text) return;
          const severity = classify(inner);
          const list = w.__qaToasts!;
          if (!list.some((t) => t.text === text && t.severity === severity)) {
            list.push({ severity, text, at: new Date().toISOString() });
          }
        });
      };
      new MutationObserver(harvest).observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  /** Pull whatever the in-page recorder has seen so far. */
  async harvestToasts(): Promise<void> {
    const found = await this.page
      .evaluate(() => (window as unknown as { __qaToasts?: ToastRecord[] }).__qaToasts ?? [])
      .catch(() => [] as ToastRecord[]);
    for (const t of found as ToastRecord[]) this.toast(t.severity, t.text);
  }

  start(): void {
    const onResponse = async (res: Response) => {
      const req: Request = res.request();
      const url = res.url();
      if (res.status() < 400 || IGNORE.test(url) || !API_HOST.test(url)) return;
      // The SPA's own routes 404 as documents on hard navigation; not defects.
      if (req.resourceType() === "document") return;
      let responseBody = "";
      try {
        responseBody = (await res.text()).slice(0, 1_000);
      } catch {
        responseBody = "<unreadable>";
      }
      let requestBody: string | null = null;
      try {
        requestBody = req.postData();
      } catch {
        requestBody = null;
      }
      this.evidence.httpFailures.push({
        method: req.method(),
        url,
        // Route shape, not the literal URL: `/api/event_groups/Z3BnY2tY` and the
        // next run's `/api/event_groups/UVFnY2tO` are the SAME defect, and a
        // finding titled with a one-off id can never be recognised as a repeat.
        path: routeShape(url),
        status: res.status(),
        requestBody: requestBody?.slice(0, 4_000) ?? null,
        responseBody,
        at: new Date().toISOString(),
      });
    };
    const onConsole = (msg: { type(): string; text(): string }) => {
      if (msg.type() === "error") this.evidence.consoleErrors.push(msg.text().slice(0, 400));
    };
    this.page.on("response", onResponse);
    this.page.on("console", onConsole as never);
    this.detach.push(() => this.page.off("response", onResponse));
    this.detach.push(() => this.page.off("console", onConsole as never));

    // Tee the flow's own log lines into the evidence as reproduction steps.
    // The page objects already narrate what they do ("stages composed: [rfq]",
    // "vendor assessment filled: 4 questions"), which is exactly the sequence a
    // human needs to reproduce a finding — so capture it rather than asking
    // every call site to report itself twice.
    const realLog = console.log.bind(console);
    console.log = (...args: unknown[]) => {
      const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
      if (line.length < 500) this.evidence.notes.push(line);
      realLog(...args);
    };
    this.detach.push(() => {
      console.log = realLog;
    });
  }

  note(text: string): void {
    this.evidence.notes.push(text);
  }

  toast(severity: ToastRecord["severity"], text: string): void {
    if (this.evidence.toasts.some((t) => t.text === text && t.severity === severity)) return;
    this.evidence.toasts.push({ severity, text, at: new Date().toISOString() });
  }

  async stop(): Promise<Evidence> {
    await this.harvestToasts();
    for (const t of drainToasts()) this.toast(t.severity, t.text);
    for (const off of this.detach) off();
    this.detach = [];
    this.evidence.finishedAt = new Date().toISOString();
    this.evidence.url = this.page.url();
    return this.evidence;
  }
}
