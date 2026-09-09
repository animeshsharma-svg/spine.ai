import { Page } from "@playwright/test";

/**
 * A watchdog for a screen that has stopped responding.
 *
 * Some failures are not "the locator was wrong" — the page genuinely freezes:
 * a modal captures focus, an overlay swallows clicks, a request hangs. The
 * automation then waits out a long timeout and reports whichever locator
 * happened to be next, which is a misleading answer to the real question.
 *
 * This samples the DOM and the URL on an interval. When neither has changed for
 * `stuckAfterMs` it says so, and attempts the cheap recoveries a human would
 * try first — dismiss whatever is covering the page, press Escape — before the
 * step's own timeout expires.
 *
 * It never reloads: a reload part-way through a create flow throws away
 * everything typed so far, which turns a recoverable stall into a lost run.
 */
export interface WatchdogOptions {
  /** How long the page must be unchanged before it counts as stuck. */
  stuckAfterMs?: number;
  /** How often to sample. */
  sampleMs?: number;
  /** Called when a stall is detected, before recovery is attempted. */
  onStuck?: (info: { forMs: number; url: string }) => void;
  /** Attempt to unstick the page. Returning true means "recovered". */
  recover?: () => Promise<boolean>;
}

export class Watchdog {
  private timer: NodeJS.Timeout | undefined;
  private lastFingerprint = "";
  private lastChangeAt = Date.now();
  private stalls = 0;
  private reported = false;

  constructor(
    private readonly page: Page,
    private readonly opts: WatchdogOptions = {},
  ) {}

  /** A cheap signature of "what the page looks like right now". */
  private async fingerprint(): Promise<string> {
    return this.page
      .evaluate(() => {
        const body = document.body;
        // Length plus a coarse structural count: sensitive enough to notice a
        // spinner finishing or a drawer opening, cheap enough to run each second.
        return [
          location.pathname + location.search,
          body?.innerText?.length ?? 0,
          document.querySelectorAll("input, button, [role='option'], .ant-spin").length,
        ].join("|");
      })
      .catch(() => "unreadable");
  }

  start(): void {
    const stuckAfter = this.opts.stuckAfterMs ?? 60_000;
    const every = this.opts.sampleMs ?? 2_000;
    this.lastChangeAt = Date.now();
    this.timer = setInterval(async () => {
      const fp = await this.fingerprint();
      if (fp !== this.lastFingerprint) {
        this.lastFingerprint = fp;
        this.lastChangeAt = Date.now();
        this.reported = false;
        return;
      }
      const forMs = Date.now() - this.lastChangeAt;
      if (forMs < stuckAfter || this.reported) return;

      this.reported = true; // report once per stall, not once per sample
      this.stalls += 1;
      const url = this.page.url();
      this.opts.onStuck?.({ forMs, url });
      console.log(`[watchdog] the screen has not changed for ${Math.round(forMs / 1000)}s — attempting recovery`);
      const recovered = await this.opts.recover?.().catch(() => false);
      await this.page.keyboard.press("Escape").catch(() => {});
      console.log(`[watchdog] recovery ${recovered ? "succeeded" : "did not change anything"}`);
      this.lastChangeAt = Date.now(); // give the recovery a fresh window
    }, every);
    // Never hold the process open on the watchdog's account.
    this.timer.unref?.();
  }

  stop(): { stalls: number } {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    return { stalls: this.stalls };
  }
}
