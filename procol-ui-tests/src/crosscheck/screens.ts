import type { Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG, NAV } from "../config.js";
import { BasePage } from "../pages/BasePage.js";
import { EventsPage } from "../pages/EventsPage.js";
import type { NetworkCapture } from "./capture.js";
import { snapshotScreen, type ScreenSnapshot } from "./screenText.js";

/**
 * SCREEN DRIVERS — open one screen of an event and wait until it is READY:
 * the API calls the screen is built from have answered, spinners and
 * skeletons are gone, and the network has been quiet for a moment. Only then
 * is the screen read, because a value that has not rendered YET is not a
 * value the screen got wrong.
 *
 * Read-only: every driver navigates and reads. Nothing is clicked that
 * changes data.
 */

export interface Visit {
  /** The capture label, e.g. "summary" or "responses@RFQ-18577". */
  key: string;
  /** Which map applies (the map's `screen`). */
  map: string;
  url: string;
  snapshot: ScreenSnapshot;
  /** Relative to the run directory. */
  screenshot: string;
  toasts: Array<{ severity: string; text: string; at: string }>;
  /** Routes it waited for that never answered. */
  notArrived: string[];
  openedAt: string;
}

const base = (page: Page) => new (class extends BasePage {})(page);
const app = () => CONFIG.appUrl.replace(/\/$/, "");

export class ScreenDriver {
  constructor(
    private readonly page: Page,
    private readonly cap: NetworkCapture,
    private readonly runDir: string,
  ) {
    mkdirSync(join(runDir, "shots"), { recursive: true });
    mkdirSync(join(runDir, "screens"), { recursive: true });
  }

  private async waitFor(key: string, routes: RegExp[], timeoutMs: number, stopWhen?: () => Promise<boolean>): Promise<string[]> {
    const deadline = Date.now() + timeoutMs;
    let missing = routes;
    while (Date.now() < deadline) {
      missing = routes.filter((re) => !this.cap.forScreen(key).some((r) => re.test(r.path)));
      if (!missing.length) break;
      // The screen can say there is nothing to fetch ("No bids are placed yet!").
      if (stopWhen && (await stopWhen().catch(() => false))) break;
      await this.page.waitForTimeout(250);
    }
    return missing.map(String);
  }

  /** Quiet = no new API response for `quietMs`, bounded by `maxMs`. */
  private async settle(key: string, quietMs = 1_500, maxMs = 12_000): Promise<void> {
    const b = base(this.page);
    await b.waitForSpinnerHidden();
    await this.page.locator(".ant-skeleton").first().waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
    const end = Date.now() + maxMs;
    let last = this.cap.forScreen(key).length;
    let quietSince = Date.now();
    while (Date.now() < end) {
      await this.page.waitForTimeout(250);
      const n = this.cap.forScreen(key).length;
      if (n !== last) {
        last = n;
        quietSince = Date.now();
      } else if (Date.now() - quietSince >= quietMs) break;
    }
    await this.cap.flush();
    await b.dismissDistractions();
    await this.page.waitForTimeout(300);
  }

  private async read(key: string, map: string, routes: RegExp[], openedAt: string, waitMs = 40_000, stopWhen?: () => Promise<boolean>): Promise<Visit> {
    const t0 = Date.now();
    const phase = (name: string) => {
      if (process.env.CROSSCHECK_DEBUG === "1") console.log(`[crosscheck] ${key}: ${name} after ${Date.now() - t0} ms`);
    };
    const notArrived = await this.waitFor(key, routes, waitMs, stopWhen);
    phase("api answered");
    await this.settle(key);
    phase("settled");
    const snapshot = await snapshotScreen(this.page);
    phase("screen read");
    const safe = key.replace(/[^a-z0-9@_-]+/gi, "_");
    const shot = `shots/${safe}.png`;
    // Bounded: a page that keeps growing can make a full-page capture run for minutes.
    await this.page.screenshot({ path: join(this.runDir, shot), fullPage: true, timeout: 20_000 }).catch(() => this.page.screenshot({ path: join(this.runDir, shot), timeout: 10_000 }).catch(() => {}));
    phase("screenshot");
    writeFileSync(join(this.runDir, "screens", `${safe}.json`), JSON.stringify(snapshot, null, 2));
    const toasts = ((await this.page
      .evaluate(() => (window as unknown as { __qaToasts?: Array<{ severity: string; text: string; at: string }> }).__qaToasts ?? [])
      .catch(() => [])) as Array<{ severity: string; text: string; at: string }>).filter((t) => t.at >= openedAt);
    console.log(`[crosscheck] read ${key}: ${snapshot.segments.length} text pieces, ${this.cap.forScreen(key).length} API responses${notArrived.length ? ` — never answered: ${notArrived.join(", ")}` : ""}`);
    return { key, map, url: this.page.url(), snapshot, screenshot: shot, toasts, notArrived, openedAt };
  }

  /**
   * The events list, searched by title.
   *
   * "settled" waits for the list's first page to arrive before typing — a
   * person who looks at the list first. "at-once" types as soon as the search
   * box exists — a person who knows what they want. Both are real; the
   * difference matters because responses can arrive out of order.
   */
  async list(title: string, mode: "settled" | "at-once" = "settled"): Promise<Visit> {
    const key = mode === "settled" ? "list" : "list@typed-at-once";
    this.cap.setScreen(key);
    const openedAt = new Date().toISOString();
    const events = new EventsPage(this.page);
    await events.goto();
    if (mode === "settled") {
      await this.waitFor(key, [/^\/api\/event_groups\?filters=.*%22title%22%3Anull/], 40_000);
      await this.settle(key, 1_500, 8_000);
    }
    await events.searchByTitle(title);
    const enc = encodeURIComponent(title).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.read(key, "list", [new RegExp(`%22title%22%3A%22${enc}%22`)], openedAt);
  }

  async summary(eventUuid: string): Promise<Visit> {
    const key = "summary";
    this.cap.setScreen(key);
    const openedAt = new Date().toISOString();
    await this.page.goto(`${app()}/project/${eventUuid}/details`, NAV);
    const id = eventUuid.replace(/[+/=]/g, "\\$&");
    return this.read(key, "summary", [new RegExp(`^/api/event_groups/${id}$`), /\/get_line_items/, /\/get_audience/], openedAt);
  }

  async responses(eventUuid: string, stageUuid: string, label: string): Promise<Visit> {
    const key = `responses@${label}`;
    this.cap.setScreen(key);
    const openedAt = new Date().toISOString();
    await this.page.goto(`${app()}/project/${eventUuid}/${stageUuid}?tab=compare`, NAV);
    const v = await this.read(key, "responses", [new RegExp(`/trade/${stageUuid}/schema\\?`), new RegExp(`/trade/${stageUuid}/bidders_delivery_stats`)], openedAt);
    // Every bidder's quote is its own call; wait for as many as the schema lists bidders.
    const schema = this.cap.forScreen(key).find((r) => /\/schema\?response_type=template/.test(r.path))?.body as { layers?: unknown[] } | undefined;
    const want = Array.isArray(schema?.layers) ? (schema!.layers as Array<{ key?: string }>).filter((l) => l.key !== "default").length : 0;
    const have = () => this.cap.forScreen(key).filter((r) => /\/quote_details\//.test(r.path)).length;
    if (want > have()) {
      const end = Date.now() + 20_000;
      while (Date.now() < end && have() < want) await this.page.waitForTimeout(300);
      await this.settle(key);
      return this.read(key, "responses", [], openedAt, 0);
    }
    return v;
  }

  async overview(eventUuid: string, stageUuid: string, label: string): Promise<Visit> {
    const key = `overview@${label}`;
    this.cap.setScreen(key);
    const openedAt = new Date().toISOString();
    await this.page.goto(`${app()}/project/${eventUuid}/${stageUuid}?tab=order_info`, NAV);
    return this.read(key, "overview", [new RegExp(`/trade/${stageUuid}/event_summary`)], openedAt);
  }

  async qcs(eventUuid: string): Promise<Visit> {
    const key = "qcs";
    this.cap.setScreen(key);
    const openedAt = new Date().toISOString();
    await this.page.goto(`${app()}/project/${eventUuid}/master_qcs`, NAV);
    const noBids = () => this.page.getByText(/no bids are placed/i).first().isVisible();
    return this.read(key, "qcs", [/\/api\/sheets\/schema\?view_type=summary_view/, /\/api\/sheets\/details\?view_type=summary_view/], openedAt, 40_000, noBids);
  }
}
