import { Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { CONFIG, TIMEOUTS, NAV } from "../config.js";

/**
 * Supplier portal (vendor app, e.g. quotes.ag-ri.in) — pure-UI vendor journey:
 * email-OTP login → open the invited event by title → fill the bid → submit.
 * Verified live: email login works (amd@gmail.com / OTP), lands on /events with
 * Live/History tabs and per-event cards. The app already points at the right
 * backend via localStorage, so no API injection needed.
 */
export class VendorPortalPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto(`${CONFIG.vendorUrl.replace(/\/$/, "")}/login`, NAV);
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});
    await this.pause(1500);
    await this.dismissDistractions();
  }

  /** Email-OTP login. Switches to email mode, sends OTP, submits, waits to leave /login. */
  async login(email = CONFIG.vendorEmail, otp = CONFIG.vendorOtp): Promise<void> {
    // The portal's login form renders well after its URL loads on this
    // environment. Wait for either face of it — the email box or the
    // "continue with email" switch — before the 10s fill budget starts, the
    // same readiness wait open_create needed for the create screen.
    await this.page
      .getByRole("textbox", { name: /email/i })
      .or(this.page.getByText(/continue with email/i))
      .or(this.page.getByPlaceholder(/email/i))
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
      .catch(() => {});
    await this.dismissDistractions();
    await this.clickIfPresent(
      [this.page.getByText(/continue with email/i), this.page.getByRole("button", { name: /continue with email/i })],
      { label: "email-mode", timeout: TIMEOUTS.SHORT },
    );
    await this.fill(
      [this.page.getByRole("textbox", { name: /email/i }), this.page.getByPlaceholder(/email/i), this.page.locator('input[type="email"]')],
      email,
      { label: "vendor-email", timeout: TIMEOUTS.MEDIUM },
    );
    await this.click(
      [this.page.getByRole("button", { name: /send otp/i }), this.page.getByRole("button", { name: /continue|next/i })],
      { label: "send-otp" },
    );
    const otpField = await this.expect(
      [this.page.getByRole("textbox", { name: /otp/i }), this.page.getByPlaceholder(/otp/i), this.page.locator('input[type="password"]')],
      { label: "vendor-otp", timeout: TIMEOUTS.LONG },
    );
    await otpField.fill(otp);
    await this.click([this.page.getByRole("button", { name: /^log ?in$/i }), this.page.locator('button[type="submit"]')], {
      label: "vendor-login",
    });
    const left = await this.page
      .waitForURL((url) => !url.pathname.includes("/login"), { timeout: TIMEOUTS.LONG })
      .then(() => true)
      .catch(() => false);
    if (!left) throw new Error(`vendor login did not complete: ${(await this.errorToastText(1000)) ?? "no error surfaced"}`);
    await this.dismissDistractions();
  }

  /** Open a Live event whose card contains the given title/ref. */
  async openEvent(match: string): Promise<void> {
    await this.page.goto(`${CONFIG.vendorUrl.replace(/\/$/, "")}/events`, NAV);
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});
    await this.dismissDistractions();
    // Search if a search box exists.
    const search = await this.find(
      [this.page.getByPlaceholder(/search/i), this.page.getByRole("textbox", { name: /search/i })],
      { label: "vendor-search", timeout: TIMEOUTS.SHORT },
    );
    if (search) {
      await search.fill(match);
      await this.pause(1200);
    }
    // Try to match the event by title/ref; fall back to the first Live event
    // card (the one just published sits at the top).
    const matched = await this.clickIfPresent(
      [
        this.page.getByText(new RegExp(match, "i")),
        this.page.getByRole("link", { name: new RegExp(match, "i") }),
        this.page.locator("a,[role='button']", { hasText: new RegExp(match, "i") }),
      ],
      { label: "open-event-by-title", timeout: TIMEOUTS.MEDIUM },
    );
    if (!matched) {
      await this.click(
        [
          this.page.getByText(/^RFQ$/i),
          this.page.locator("[class*='card'] a, [class*='event'] a").first(),
          this.page.getByRole("link").first(),
        ],
        { label: "open-first-event", timeout: TIMEOUTS.LONG },
      );
    }
    await this.page.waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG }).catch(() => {});
    await this.dismissDistractions();
  }

  /**
   * Enter the bid sheet. The vendor event view opens on "Event Overview"; the
   * bid sheet lives behind the STAGE tab (the tab that isn't Event Overview).
   * Then some builds need an explicit "Add bid"/"Place bid" to make cells editable.
   */
  async startBidding(match?: string): Promise<void> {
    // 1. Switch to the stage/bidding tab.
    await this.clickIfPresent(
      [
        ...(match ? [this.page.getByRole("tab", { name: new RegExp(match, "i") })] : []),
        this.page.getByRole("tab").filter({ hasNotText: /event overview/i }),
        this.page.locator("[role='tab']").nth(1),
      ],
      { label: "stage-tab", timeout: TIMEOUTS.MEDIUM },
    );
    await this.waitForSpinnerHidden();
    await this.pause(1000);
    // 2. Explicit enter-bid affordance if present.
    await this.clickIfPresent(
      [
        this.page.getByRole("button", { name: /add bid|start bidding|place bid|bid now|enter bid|add quote|participate/i }),
        this.page.locator('[data-testid="add-bid-button"]'),
        this.page.getByText(/add bid|place bid|start bidding/i),
      ],
      { label: "start-bidding", timeout: TIMEOUTS.SHORT },
    );
    await this.waitForSpinnerHidden();
    await this.pause(500);
  }

  /**
   * Fill the Price cell of every line-item row in the Submission Sheet. The
   * price cell isn't an <input> until activated, so we click/dbl-click the cell
   * in the Price column, then type into the revealed input.
   */
  async fillBid(price = 100): Promise<number> {
    await this.pause(1200);
    // The submission sheet is an ARIA grid (role=columnheader / role=row /
    // role=cell), not an HTML table. Find the Price column index among the
    // column headers, then edit that cell in each data row.
    const info = await this.page.evaluate(() => {
      const txt = (e: Element) => (e as HTMLElement).innerText?.trim().replace(/\s+/g, " ") || "";
      const headers = [...document.querySelectorAll("[role='columnheader']")];
      const priceIdx = headers.findIndex((h) => /price/i.test(txt(h)));
      return {
        priceIdx,
        headers: headers.map((h) => txt(h)).slice(0, 15),
        rowCount: document.querySelectorAll("[role='row']").length,
        url: location.href,
        buttons: [...new Set([...document.querySelectorAll("button")].map((b) => txt(b)).filter(Boolean))].slice(0, 20),
      };
    });
    if (info.priceIdx < 0) {
      console.log("BID_DIAG=" + JSON.stringify(info));
      return 0;
    }

    // Data rows = all role=row except the header row. Cells may be role=cell OR
    // role=gridcell OR plain grid divs.
    const allRows = this.page.locator("[role='row']");
    const rowTotal = await allRows.count().catch(() => 0);
    let filled = 0;
    for (let i = 0; i < rowTotal; i++) {
      const row = allRows.nth(i);
      if ((await row.locator("[role='columnheader']").count().catch(() => 0)) > 0) continue; // skip header row
      const cells = row.locator("[role='cell'], [role='gridcell']");
      let cellCount = await cells.count().catch(() => 0);
      if (cellCount === 0) {
        if (filled === 0 && i === rowTotal - 1) {
          const rowDiag = await row.evaluate((r) => ({ childRoles: [...r.children].map((c) => (c as HTMLElement).getAttribute("role") || c.tagName), html: (r as HTMLElement).innerHTML.slice(0, 300) })).catch(() => null);
          console.log("ROW_DIAG=" + JSON.stringify(rowDiag));
        }
        continue;
      }
      const cell = cells.nth(info.priceIdx);
      if (!(await cell.isVisible().catch(() => false))) continue;
      await cell.click().catch(() => {});
      let input = cell.locator("input, textarea, [contenteditable='true']").first();
      if ((await input.count()) === 0) {
        await cell.dblclick().catch(() => {});
        input = cell.locator("input, textarea, [contenteditable='true']").first();
      }
      if ((await input.count()) > 0) {
        await input.fill(String(price)).catch(async () => {
          await input.click().catch(() => {});
          await this.page.keyboard.type(String(price));
        });
        filled++;
      } else {
        await this.page.keyboard.type(String(price));
        filled++;
      }
      await this.page.keyboard.press("Tab").catch(() => {});
    }
    if (filled === 0) console.log("BID_DIAG=" + JSON.stringify(info));
    return filled;
  }

  /** Submit the bid and confirm any modal. */
  async submitBid(): Promise<void> {
    await this.dismissDistractions();
    await this.click(
      [
        this.page.getByRole("button", { name: /submit quote/i }),
        this.page.locator('[data-testid="submit-bid-button"]'),
        this.page.getByRole("button", { name: /submit (your )?bid|^submit$/i }),
        this.page.getByText(/^submit (quote|bid)$/i),
      ],
      { label: "submit-bid", timeout: TIMEOUTS.MEDIUM },
    );
    await this.click(
      [
        this.page.getByRole("dialog").getByRole("button", { name: /submit|confirm|yes|proceed/i }),
        this.page.getByRole("button", { name: /confirm|yes, submit|proceed/i }),
      ],
      { label: "submit-confirm", timeout: TIMEOUTS.MEDIUM },
    ).catch(() => {});
  }

  /** True if a bid-submitted confirmation/state is visible. */
  async bidSubmitted(): Promise<boolean> {
    const toast = await this.successToastText(TIMEOUTS.SHORT);
    if (toast && /submit|success|placed/i.test(toast)) return true;
    // The stage tab flips to a green "Submitted" badge after a successful quote.
    const marker = await this.find(
      [
        this.page.getByText(/^submitted$/i),
        this.page.locator("[role='tab'] :text('Submitted'), .ant-tabs-tab :text('Submitted')"),
        this.page.getByText(/bid submitted|submitted successfully|your bid has been|revise bid|quote submitted/i),
      ],
      { label: "submitted-marker", timeout: TIMEOUTS.LONG },
    );
    return !!marker;
  }
}
