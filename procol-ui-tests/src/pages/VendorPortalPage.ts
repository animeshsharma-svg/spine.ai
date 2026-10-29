import { Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { controlHeld, released } from "../support/liveControl.js";
import { askTester, SAYS_STOP } from "../explore/ask.js";
import { recordStuck } from "../oracle/stuck.js";
import { CONFIG, TIMEOUTS, NAV } from "../config.js";
import { uatLoginCodes, type UatCode } from "../db/uatOtp.js";

/**
 * Supplier portal (vendor app, e.g. quotes.ag-ri.in) — pure-UI vendor journey:
 * email-OTP login → open the invited event by title → fill the bid → submit.
 * Verified live: email login works (amd@gmail.com / OTP), lands on /events with
 * Live/History tabs and per-event cards. The app already points at the right
 * backend via localStorage, so no API injection needed.
 */

/** The event is not among the signed-in vendor's events: the vendor is not invited, or it is not live for them. */
export class NotOnEventError extends Error {
  constructor(public title: string, url: string) {
    super(`“${title}” is not among this vendor's events on the vendor portal (${url.replace(/^https?:\/\/[^/]+/, "")}) — the vendor is not invited, or the event is not live for them yet`);
  }
}

export class VendorPortalPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * The round the vendor answers on this event: "price" (an open RFQ or auction
   * sheet) or "technical" (the Technical Stage's submission sheet — a 2-stage
   * event keeps its RFQ locked until that is answered). Set by startBidding.
   */
  stage: "price" | "technical" = "price";
  /** What the last fillBid filled, in words, for the run's narration. */
  lastFill = "";
  /** The price the last fillBid was asked for — the RFQ quote after a technical stage uses it too. */
  private price = 100;
  /** The technical stage was answered on the way to the price bid (a 2-stage event). */
  answeredTechnical = false;
  /** Specification cells the sheet's Quick Fill filled on the last technical sheet. */
  private quickFilled = 0;

  async goto(): Promise<void> {
    await this.page.goto(`${CONFIG.vendorUrl.replace(/\/$/, "")}/login`, NAV);
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});
    await this.pause(1500);
    await this.dismissDistractions();
  }

  /**
   * The codes to try for this vendor, best first.
   *
   * A QA vendor (qa_…@example.com) never receives an email — the domain is
   * reserved — so its code is the one UAT accepts for it: the uat_login_otp
   * of the buyer that invited it (src/db/uatOtp.ts). The profile's configured
   * code belongs to the profile's own vendor and is only a fallback for it.
   */
  private async codesFor(email: string, otp?: string): Promise<UatCode[]> {
    if (otp) return [{ otp, source: "the code given" }];
    const codes = await uatLoginCodes({ email }, Number(process.env.COMPANY_ID) || undefined);
    if (CONFIG.vendorOtp && email.toLowerCase() === CONFIG.vendorEmail.toLowerCase() && !codes.some((c) => c.otp === CONFIG.vendorOtp)) {
      codes.push({ otp: CONFIG.vendorOtp, source: "the configured vendor code" });
    }
    return codes;
  }

  /**
   * Email-OTP login. Switches to email mode, sends OTP, enters the code UAT
   * accepts for this vendor, waits to leave /login. Returns where the code
   * came from, never the code.
   */
  async login(email = CONFIG.vendorEmail, otp?: string): Promise<string> {
    const codes = await this.codesFor(email, otp);
    if (!codes.length) {
      throw new Error(
        `vendor login: no one-time code for ${email} — UAT accepts the inviting buyer's uat_login_otp, ` +
          `and none could be read (is DATABASE_URL set, and does the buyer have one?)`,
      );
    }
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
    // Try each code the backend would accept, moving on only when the portal
    // says the code was wrong; anything else is the real failure and is
    // reported as it is.
    let refused = "";
    for (const [i, code] of codes.entries()) {
      await otpField.fill(code.otp);
      await this.click([this.page.getByRole("button", { name: /^log ?in$/i }), this.page.locator('button[type="submit"]')], {
        label: "vendor-login",
      });
      const outcome = await Promise.race([
        this.page
          .waitForURL((url) => !url.pathname.includes("/login"), { timeout: TIMEOUTS.LONG })
          .then(() => "in" as const),
        this.errorToastText(TIMEOUTS.LONG).then((t) => (t ? t : null)),
      ]).catch(() => null);
      if (outcome === "in") {
        await this.dismissDistractions();
        return code.source;
      }
      refused = outcome ?? "";
      const wrongCode = /invalid|incorrect|wrong|expired|otp/i.test(refused);
      if (!wrongCode || i === codes.length - 1) break;
      console.log(`[vendor] ${code.source} was refused for ${email} — trying the next code`);
    }
    throw new Error(
      `vendor login did not complete for ${email}: ` +
        (refused ? `the portal said "${refused}"` : `no error surfaced (tried ${codes.map((c) => c.source).join(", then ")})`),
    );
  }

  /** Open a Live event whose card contains the given title/ref. */
  /**
   * Open the event on this vendor's Events page. A title that is not there
   * means the vendor is not invited (or it is not live for them): that is said
   * as NotOnEventError, never covered by opening something else. The old
   * fallback clicked the first event or link: an uninvited vendor stayed on
   * /events and the step failed at Submit 40 s later with "no candidate was
   * clickable" — and a vendor with other live events would have quoted on the
   * WRONG event (15 Oct). Without a title, the first live event is still used.
   */
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
    if (!matched && match) {
      // An event published seconds ago can be missing from the portal's list on the first look (27 Oct, VB06:
      // the invited vendor "did not have" the event, the run fell back to another vendor). One more look.
      await this.pause(8_000);
      await this.page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await this.dismissDistractions();
      const again = await this.find(
        [this.page.getByPlaceholder(/search/i), this.page.getByRole("textbox", { name: /search/i })],
        { label: "vendor-search", timeout: TIMEOUTS.SHORT },
      );
      if (again) {
        await again.fill(match);
        await this.pause(1500);
      }
      const second = await this.clickIfPresent(
        [this.page.getByText(new RegExp(match, "i")), this.page.getByRole("link", { name: new RegExp(match, "i") })],
        { label: "open-event-by-title-again", timeout: TIMEOUTS.MEDIUM },
      );
      if (!second) throw new NotOnEventError(match, this.page.url());
      console.log(`[bid] “${match}” showed on the vendor portal on the second look`);
      await this.page.waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG }).catch(() => {});
      await this.dismissDistractions();
      return;
    }
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
    // 1. The round to answer. The portal's first tab is the event's Details —
    // it used to be called "Event Overview", and "the first tab that isn't
    // Event Overview" became Details itself: the bid step sat on the overview,
    // found no price cells and waited for a Submit that never came (15 Oct).
    // An open pricing round (RFQ / Auction) takes the bid. When it is locked
    // (a Technical + RFQ event shows "RFQ 🔒"), the Technical Stage is what the
    // vendor answers first.
    const tabs = this.page.getByRole("tab");
    await tabs.first().waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM }).catch(() => {});
    const names = (await tabs.allInnerTexts().catch(() => [] as string[])).map((t) => t.replace(/\s+/g, " ").trim());
    const locked = async (i: number) => {
      const t = tabs.nth(i);
      return (await t.getAttribute("aria-disabled").catch(() => null)) === "true" || /disabled/i.test((await t.getAttribute("class").catch(() => "")) ?? "");
    };
    const isPrice = (n: string) => /^(rfq|auction|commercial|price|quote)/i.test(n);
    const isTech = (n: string) => /technical|^rfp/i.test(n);
    let at = -1;
    this.stage = "price";
    // The Technical Stage tab carries a green "Submitted" once it is answered.
    if (names.some((n) => isTech(n) && /submitted/i.test(n))) this.answeredTechnical = true;
    for (let i = 0; i < names.length && at < 0; i++) if (isPrice(names[i]) && !(await locked(i))) at = i;
    const priceLocked = at < 0 && names.some(isPrice);
    if (at < 0) {
      for (let i = 0; i < names.length && at < 0; i++) if (isTech(names[i]) && !(await locked(i))) { at = i; this.stage = "technical"; }
    }
    if (at < 0) at = names.findIndex((n) => !!n && !/^(details|event overview|messages)$/i.test(n));
    if (at >= 0) {
      await tabs.nth(at).click({ timeout: TIMEOUTS.MEDIUM }).catch(() => {});
      console.log(
        `[vendor] answering the “${names[at]}” round` +
          (this.stage === "technical" && priceLocked ? " — its RFQ round is locked until the technical stage is answered" : ""),
      );
    } else {
      await this.clickIfPresent(
        [
          ...(match ? [this.page.getByRole("tab", { name: new RegExp(match, "i") })] : []),
          this.page.getByRole("tab").filter({ hasNotText: /event overview|^details$/i }),
          this.page.locator("[role='tab']").nth(1),
        ],
        { label: "stage-tab", timeout: TIMEOUTS.MEDIUM },
      );
    }
    await this.waitForSpinnerHidden();
    await this.pause(1000);
    // A technical submission sheet has no add-bid button; only a pricing round may.
    if (this.stage === "technical") return;
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
  /** How many price cells the last fillBid filled (0: the sheet had no Price column to fill). */
  async fillBid(price = 100): Promise<number> {
    this.price = price;
    if (this.stage === "technical") return this.fillTechnical();
    await this.pause(1200);
    // The sheet arrives after the tab switch (right after a technical answer, the RFQ tab only just unlocked).
    await this.page.locator("[role='columnheader']").filter({ hasText: /price/i }).first().waitFor({ state: "attached", timeout: 15_000 }).catch(() => {});
    // The submission sheet is an ARIA grid (role=columnheader / role=row /
    // role=cell), not an HTML table. Find the Price column index among the
    // column headers, then edit that cell in each data row.
    // textContent, not innerText: a sheet below the fold is not drawn yet and its innerText is "" — the RFQ of a
    // two-product PR event read no Price column and quoted nothing (29 Oct, E2E01). No named helper in a page
    // callback (tsx's __name, LESSONS 33).
    const info = await this.page.evaluate(() => {
      const headers = [...document.querySelectorAll("[role='columnheader']")];
      const priceIdx = headers.findIndex((h) => /price/i.test((h.textContent || "").replace(/\s+/g, " ")));
      return {
        priceIdx,
        headers: headers.map((h) => (h.textContent || "").trim().replace(/\s+/g, " ")).slice(0, 15),
        rowCount: document.querySelectorAll("[role='row']").length,
        url: location.href,
        buttons: [...new Set([...document.querySelectorAll("button")].map((b) => (b.textContent || "").trim().replace(/\s+/g, " ")).filter(Boolean))].slice(0, 20),
      };
    });
    // The grid draws only the columns scrolled into view. An event made from a PR adds PR Number, Item Code, Line
    // Item No, Parent Item Number… and pushes Price off to the right, out of the page altogether (29 Oct, E2E01:
    // headers ended at "Quantity Requested"). Scroll each grid sideways until a Price header exists; then fill by
    // its aria-colindex, which the grid keeps the same for the header and every row.
    let priceCol: string | null = null;
    for (let step = 0; step < 12; step++) {
      priceCol = await this.page
        .locator("[role='columnheader']")
        .filter({ hasText: /price/i })
        .first()
        .getAttribute("aria-colindex")
        .catch(() => null);
      if (priceCol) break;
      await this.page
        .evaluate(() => {
          for (const g of document.querySelectorAll("[role='grid'], .rdg")) (g as HTMLElement).scrollLeft += 500;
        })
        .catch(() => {});
      await this.pause(400);
    }
    if (info.priceIdx < 0 && !priceCol) {
      console.log("BID_DIAG=" + JSON.stringify(info));
      return 0;
    }
    if (priceCol) console.log(`[vendor] the Price column is column ${priceCol} of the sheet`);

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
      const cell = priceCol ? row.locator(`[aria-colindex="${priceCol}"]`).first() : cells.nth(info.priceIdx);
      await cell.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});
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
    // Other required columns (marked *): "Quantity Available*" kept Submit Quote
    // disabled with the price in (15 Oct). The quantity offered is the quantity
    // requested on the same row; any other required cell gets a plain value.
    const extra = await this.fillRequiredColumns();
    this.lastFill = `filled ${filled} price cell(s)${extra ? ` and ${extra} other required cell(s)` : ""}`;
    return filled;
  }

  /** Fill empty cells of required (*) columns other than Price; returns how many were filled. */
  private async fillRequiredColumns(): Promise<number> {
    const p = this.page;
    const plan = await p
      .evaluate(() => {
        const txt = (e: Element) => ((e as HTMLElement).innerText || "").replace(/\s+/g, " ").trim();
        const heads = [...document.querySelectorAll("[role='columnheader']")];
        const required = heads.map((h, i) => ({ i, name: txt(h) })).filter((h) => /\*\s*$/.test(h.name) && !/price/i.test(h.name));
        const qtyReq = heads.findIndex((h) => /quantity requested/i.test(txt(h)));
        const out: Array<{ mark: string; value: string }> = [];
        let n = 0;
        for (const row of document.querySelectorAll("[role='row']")) {
          if (row.querySelector("[role='columnheader']")) continue;
          const cells = [...row.querySelectorAll("[role='cell'], [role='gridcell']")];
          const asked = qtyReq >= 0 ? (txt(cells[qtyReq] ?? document.body).match(/[\d.]+/)?.[0] ?? "") : "";
          for (const r of required) {
            const c = cells[r.i] as HTMLElement | undefined;
            if (!c) continue;
            // A placeholder ("10 Unit" in grey) is not a value: an input inside, if any, says.
            const inp = c.querySelector("input, textarea") as HTMLInputElement | null;
            const has = inp ? !!inp.value.trim() : !!txt(c) && !c.querySelector("[class*='placeholder' i]");
            if (has) continue;
            const mark = `rq${n++}`;
            c.setAttribute("data-spine-req", mark);
            out.push({ mark, value: /quantity/i.test(r.name) ? asked || "1" : "1" });
          }
        }
        return out;
      })
      .catch(() => [] as Array<{ mark: string; value: string }>);
    let filled = 0;
    for (const { mark, value } of plan.slice(0, 40)) {
      const cell = p.locator(`[data-spine-req="${mark}"]`).first();
      await cell.scrollIntoViewIfNeeded().catch(() => {});
      await cell.click().catch(() => {});
      let input = cell.locator("input, textarea, [contenteditable='true']").first();
      if (!(await input.count().catch(() => 0))) {
        await cell.dblclick().catch(() => {});
        input = cell.locator("input, textarea, [contenteditable='true']").first();
      }
      if (await input.count().catch(() => 0)) await input.fill(value).catch(() => {});
      else await p.keyboard.type(value);
      await p.keyboard.press("Tab").catch(() => {});
      filled++;
    }
    if (filled) console.log(`[vendor] filled ${filled} other required cell(s) on the sheet (${[...new Set(plan.map((x) => x.value))].join(", ")})`);
    return filled;
  }

  /**
   * Answer the Technical Stage's submission sheet: Quick Fill copies the
   * requested specifications into "Specifications Provided", and each empty
   * question gets a plain test answer. Returns how many answers were given.
   */
  private async fillTechnical(): Promise<number> {
    const p = this.page;
    // The sheet loads behind placeholder bars for a few seconds: wait for its questions.
    await p.getByText(/submission sheet/i).first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    await p.locator("textarea").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
    await this.pause(600);
    await this.openEveryProductSection();
    // "Specifications Provided": a sheet column (required where the row says
    // "Specs*"). The sheet's own "Quick Fill" copies the requested
    // specifications into it, so it is pressed first, as a vendor would
    // (Aanya, 15 Oct). It did not fill the cell on an earlier run that day, so
    // whatever it leaves empty is then typed into, as the buyer's pricing sheet
    // is: select the cell, type, Enter.
    const before = await this.markEmptySpecs();
    let quickFilled = 0;
    const quick = p.getByRole("button", { name: /quick\s*fill/i }).or(p.getByText(/^\s*quick\s*fill\s*$/i)).first();
    if (before > 0 && (await quick.isVisible().catch(() => false))) {
      // Quick Fill opens a small menu: "Same as Requested" copies each row's
      // requested specification into the cell (seen 15 Oct). Without the pick,
      // nothing is filled. A click can land as "select the column" instead
      // and open no menu (seen the same day), so it is pressed again.
      const same = p.getByRole("menuitem", { name: /same as requested/i }).or(p.getByText(/^\s*same as requested\s*$/i)).first();
      for (let t = 0; t < 3 && !(await same.isVisible().catch(() => false)); t++) {
        await quick.click({ timeout: 5_000 }).catch(() => {});
        await same.waitFor({ state: "visible", timeout: 2_000 }).catch(() => {});
      }
      if (await same.isVisible().catch(() => false)) await same.click({ timeout: 3_000 }).catch(() => {});
      else console.log("[vendor] Quick Fill opened no menu after 3 presses");
      await this.pause(1_500);
      const after = await this.markEmptySpecs();
      quickFilled = Math.max(0, before - after);
      console.log(
        quickFilled === before
          ? `[vendor] Quick Fill → Same as Requested filled all ${before} specification(s)`
          : `[vendor] Quick Fill → Same as Requested filled ${quickFilled} of ${before} specification(s); typing the other ${after}`,
      );
    }
    const marked = quickFilled ? await this.markEmptySpecs() : before;
    let specs = 0;
    for (let i = 0; i < Math.min(marked, 30); i++) {
      const cell = p.locator(`[data-spine-spec="${i}"]`).first();
      await cell.scrollIntoViewIfNeeded().catch(() => {});
      // Short waits: a cell that will not take a click must not hold the vendor for 15 s a try.
      await cell.click({ timeout: 3_000 }).catch(() => {});
      await cell.dblclick({ timeout: 3_000 }).catch(() => {});
      const box = cell.locator("input, textarea, [contenteditable='true']").first();
      if (await box.count().catch(() => 0)) await box.fill("As requested", { timeout: 3_000 }).catch(() => {});
      else await p.keyboard.type("As requested", { delay: 15 });
      await p.keyboard.press("Enter").catch(() => {});
      await this.pause(300);
      specs++;
    }
    // Check, and type again whatever is still empty: each product's table scrolls on its own, and one pass left
    // the third product's required "Product Description*" blank (29 Oct, E2E01 on PR 0260000031).
    for (let pass = 0; pass < 2; pass++) {
      const left = await this.markEmptySpecs();
      if (!left) break;
      console.log(`[vendor] ${left} specification cell(s) still empty — typing them again`);
      for (let i = 0; i < Math.min(left, 30); i++) {
        const cell = p.locator(`[data-spine-spec="${i}"]`).first();
        await cell.scrollIntoViewIfNeeded().catch(() => {});
        await cell.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" })).catch(() => {});
        await this.pause(300);
        await cell.click({ timeout: 3_000 }).catch(() => {});
        await cell.dblclick({ timeout: 3_000 }).catch(() => {});
        const box = cell.locator("input, textarea, [contenteditable='true']").first();
        if (await box.count().catch(() => 0)) await box.fill("As requested", { timeout: 3_000 }).catch(() => {});
        else await p.keyboard.type("As requested", { delay: 15 });
        await p.keyboard.press("Enter").catch(() => {});
        await this.pause(400);
      }
    }
    specs += quickFilled;
    this.quickFilled = quickFilled;
    // The questions: every empty answer box on the sheet.
    let answers = 0;
    const boxes = p.locator("textarea");
    const nBoxes = Math.min(await boxes.count().catch(() => 0), 30);
    for (let i = 0; i < nBoxes; i++) {
      const b = boxes.nth(i);
      if (!(await b.isVisible().catch(() => false)) || (await b.isDisabled().catch(() => true))) continue;
      if ((await b.inputValue().catch(() => "x")).trim()) continue;
      await b.fill("spine.ai test response").catch(() => {});
      answers++;
    }
    this.lastFill = `answered the Technical Stage's submission sheet — ${answers} question(s)${specs ? ` and ${specs} specification(s)${quickFilled ? ` (${quickFilled} by Quick Fill)` : ""}` : ""}`;
    console.log(`[vendor] ${this.lastFill}`);
    return answers + specs;
  }

  /**
   * Bring every product's spec table onto the page. An event made from a PR carries one section per product
   * ("2. Portable Toilet SIT 2 | Code: 39000080"), each with its own required rows, and a section's table is drawn
   * only once it has been scrolled to (29 Oct, RFX-19477: the second product's "Product Description*" stayed
   * empty and Procol kept the answer a draft — "Please fill all required fields"). Opens a closed one too.
   */
  private async openEveryProductSection(): Promise<number> {
    const p = this.page;
    const heads = p.getByRole("button", { name: /^\s*\d+\.\s.*\|\s*code:/i });
    const n = Math.min(await heads.count().catch(() => 0), 20);
    for (let i = 0; i < n; i++) {
      const h = heads.nth(i);
      await h.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});
      if ((await h.getAttribute("aria-expanded").catch(() => null)) === "false") await h.click({ timeout: 3_000 }).catch(() => {});
      await this.pause(700);
    }
    // and to the foot of the sheet, so the last table is drawn too
    await p.mouse.wheel(0, 4000).catch(() => {});
    await this.pause(800);
    await p.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    if (n > 1) console.log(`[vendor] opened all ${n} product sections of the submission sheet`);
    return n;
  }

  /**
   * Mark each empty cell of the sheet's "Specifications Provided" column
   * (data-spine-spec="0", "1", …) and say how many there are. Marks from an
   * earlier look are cleared first, so the numbers always start at 0.
   */
  private async markEmptySpecs(all = false): Promise<number> {
    return this.page
      .evaluate((all) => {
        for (const old of document.querySelectorAll("[data-spine-spec]")) old.removeAttribute("data-spine-spec");
        let n = 0;
        // A <table>, or an ARIA grid (role=row / columnheader / gridcell) — the portal uses the grid.
        for (const table of document.querySelectorAll("table, [role='grid']")) {
          const grid = table.getAttribute("role") === "grid";
          const rows = [...table.querySelectorAll(grid ? "[role='row']" : "tr")];
          // No named helper in a page callback: tsx wraps it in __name, which the page does not have (LESSONS 33).
          const cellSel = grid ? "[role='columnheader'], [role='gridcell']" : ":scope > th, :scope > td";
          // textContent, not innerText: a product's table below the fold is not drawn yet, and its innerText
          // is "" (29 Oct, RFX-19477: the second product's required spec was never seen, so never filled).
          const head = rows.find((r) => /specifications provided/i.test(r.textContent || ""));
          if (!head) continue;
          const col = [...head.querySelectorAll(cellSel)].findIndex((c) => /specifications provided/i.test(c.textContent || ""));
          if (col < 0) continue;
          for (const r of rows) {
            if (r === head) continue;
            const cell = [...r.querySelectorAll(cellSel)][col] as HTMLElement | undefined;
            if (!cell || (!all && (cell.textContent || "").trim())) continue;
            cell.setAttribute("data-spine-spec", String(n++));
          }
        }
        return n;
      }, all)
      .catch(() => 0);
  }

  /**
   * Type each specification cell's own value back in (select, type, Enter).
   * Quick Fill fills the cells on screen, but on 15 Oct Procol then kept
   * Submit disabled; typing into a cell is what makes the sheet save.
   */
  private async retypeSpecs(): Promise<number> {
    const p = this.page;
    const n = await this.markEmptySpecs(true);
    for (let i = 0; i < Math.min(n, 30); i++) {
      const cell = p.locator(`[data-spine-spec="${i}"]`).first();
      const value = ((await cell.innerText().catch(() => "")) || "").trim() || "As requested";
      await cell.scrollIntoViewIfNeeded().catch(() => {});
      await cell.click({ timeout: 3_000 }).catch(() => {});
      await cell.dblclick({ timeout: 3_000 }).catch(() => {});
      const box = cell.locator("input, textarea, [contenteditable='true']").first();
      if (await box.count().catch(() => 0)) await box.fill(value, { timeout: 3_000 }).catch(() => {});
      else {
        await p.keyboard.press("ControlOrMeta+a").catch(() => {});
        await p.keyboard.type(value, { delay: 15 });
      }
      await p.keyboard.press("Enter").catch(() => {});
      await this.pause(300);
    }
    return n;
  }

  /** Submit the bid and confirm any modal. */
  async submitBid(): Promise<void> {
    await this.dismissDistractions();
    if (this.stage === "technical") return this.submitTechnical();
    // "Submit Quote" stays DISABLED until every term of the event is ticked:
    // the Terms and Conditions list under the sheet carries one checkbox per
    // term ("Your evaluation for this event will depend on Gross Total."). The
    // old step filled the sheet, never ticked them, and waited 10s for a
    // button that could not enable (UI batch 2026-10-03: "submit never
    // clickable"). Ticking the terms is the vendor's own act on their own bid.
    const submit = this.page.getByRole("button", { name: /submit quote/i }).first();
    const disabled = async () => (await submit.count()) > 0 && (await submit.isDisabled().catch(() => false));
    if (await disabled()) {
      const terms = this.page
        .getByText(/terms and conditions/i)
        .first()
        .locator("xpath=following::*[@role='checkbox' or (self::input and @type='checkbox')]");
      const n = Math.min(await terms.count().catch(() => 0), 20);
      let ticked = 0;
      for (let i = 0; i < n; i++) {
        const box = terms.nth(i);
        if (await box.isDisabled().catch(() => true)) continue;
        if (await box.isChecked().catch(() => true)) continue;
        await box.check({ timeout: 3_000 }).catch(() => box.click({ timeout: 3_000, force: true }).catch(() => {}));
        ticked += 1;
      }
      if (ticked) console.log(`[vendor] ticked ${ticked} term(s) of the event before submitting`);
      const until = Date.now() + 8_000;
      while (Date.now() < until && (await disabled())) await this.pause(400);
      // A tester who took the live browser here is looking at this very sheet:
      // wait for them, then see what they did — they may have quoted it themselves.
      if (controlHeld()) {
        console.log("[vendor] you have the browser at the quote — waiting until you hand it back");
        await released();
        await this.pause(1_000);
        if (await this.bidSubmitted()) {
          this.lastFill = `${this.lastFill}; you submitted the quote yourself`;
          console.log("[vendor] the quote is submitted (you did it while you had the browser)");
          return;
        }
      }
      if (await disabled()) {
        const empty = await this.page
          .evaluate(() =>
            [...document.querySelectorAll("[role='columnheader']")]
              .map((h) => (h as HTMLElement).innerText.trim())
              .filter((t) => /\*\s*$/.test(t)),
          )
          .catch(() => [] as string[]);
        // A Technical + RFQ event whose technical response is already in: the
        // quote waits on the buyer (see submitTechnical). Said, not failed.
        if (this.answeredTechnical) {
          this.stage = "technical";
          this.lastFill = `the Technical Stage was already submitted; the RFQ sheet took a price, but Procol keeps “Submit Quote” disabled with no message, so the quote waits until the buyer acts on the technical stage`;
          console.log(`[vendor] ${this.lastFill}`);
          return;
        }
        throw new Error(`"Submit Quote" stays disabled after the sheet was filled and ${ticked} term(s) ticked — required columns on the sheet: ${empty.join(", ") || "(none marked)"}`);
      }
    }
    await this.click(
      [
        this.page.getByRole("button", { name: /submit quote/i }),
        this.page.locator('[data-testid="submit-bid-button"]'),
        this.page.getByRole("button", { name: /submit (your )?bid|^submit$/i }),
        this.page.getByText(/^submit (quote|bid)$/i),
      ],
      { label: "submit-bid", timeout: TIMEOUTS.MEDIUM },
    );
    // A confirm dialog, when the portal shows one. It usually does not: then
    // nothing is recorded as stuck (it was, three times a bid, at 10 s each).
    await this.clickIfPresent(
      [
        this.page.getByRole("dialog").getByRole("button", { name: /submit|confirm|yes|proceed/i }),
        this.page.getByRole("button", { name: /confirm|yes, submit|proceed/i }),
      ],
      { label: "submit-confirm", timeout: 2_500 },
    ).catch(() => false);
  }

  /**
   * Submit the Technical Stage's sheet. Every edit is saved as a draft first —
   * a bar says "Your changes have been saved as draft. Submit to proceed." with
   * its own Submit — and a click that lands before that bar appears leaves the
   * response a draft (seen 15 Oct). So: wait for the bar, press its Submit,
   * confirm, and check the bar is gone; once more if it is not.
   */
  private async submitTechnical(): Promise<void> {
    const p = this.page;
    const draft = p.getByText(/saved as draft\.?\s*submit to proceed/i).first();
    await draft.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    let retyped = false;
    let asked = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const inBar = draft.locator("xpath=ancestor::*[.//button][1]").getByRole("button", { name: /^\s*submit\s*$/i }).first();
      const submit = (await inBar.isVisible().catch(() => false)) ? inBar : p.getByRole("button", { name: /^\s*submit\s*$/i }).last();
      const until = Date.now() + 10_000;
      while (Date.now() < until && (await submit.isDisabled().catch(() => true))) await this.pause(400);
      if (await submit.isDisabled().catch(() => true)) {
        const required = await p
          .evaluate(() =>
            [...document.querySelectorAll("label, [class*='question' i], td, [role='cell']")]
              .map((e) => (e as HTMLElement).innerText.trim())
              .filter((t) => /\*\s*$/.test(t) && t.length < 80)
              .slice(0, 6),
          )
          .catch(() => [] as string[]);
        const why = `the Technical Stage's "Submit" stays disabled after the sheet was answered${required.length ? ` — required on the sheet: ${required.join(", ")}` : ""}`;
        // Quick Fill filled the cells but the sheet did not save: type them in once.
        if (!retyped && this.quickFilled > 0) {
          retyped = true;
          const n = await this.retypeSpecs();
          console.log(`[vendor] Procol kept Submit disabled after Quick Fill; typed the ${n} specification(s) in again so the sheet saves`);
          await draft.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
          attempt--;
          continue;
        }
        // Stuck: ask the tester rather than fail on our own (Aanya, 15 Oct).
        // Once per sheet; with nobody to ask, the run stops and says why.
        const hand = asked ? "no" : await this.askToFinishTechnical(why);
        asked = true;
        if (hand === "no") throw new Error(why);
        if (hand === "submitted") return;
        attempt--;
        continue;
      }
      await submit.scrollIntoViewIfNeeded().catch(() => {});
      await submit.click({ timeout: TIMEOUTS.MEDIUM });
      await this.clickIfPresent(
        [
          p.getByRole("dialog").getByRole("button", { name: /submit|confirm|yes|proceed/i }),
          p.getByRole("button", { name: /confirm|yes, submit|proceed/i }),
        ],
        { label: "technical-submit-confirm", timeout: 2_500 },
      ).catch(() => false);
      await this.waitForSpinnerHidden();
      await this.pause(1_500);
      if (!(await draft.isVisible().catch(() => false))) {
        this.answeredTechnical = true;
        // The RFQ round may open as soon as the technical stage is in (it did on
        // PROCOL DEMO, 15 Oct): then the vendor quotes it too, as a person would.
        await this.pause(1_000);
        const rfq = p.getByRole("tab").filter({ hasText: /^\s*(rfq|auction|commercial|price|quote)/i }).first();
        const open = (await rfq.count().catch(() => 0)) > 0 && (await rfq.getAttribute("aria-disabled").catch(() => null)) !== "true";
        if (!open) {
          console.log("[vendor] submitted the Technical Stage — the RFQ round stays locked for now (it opens once the buyer qualifies this vendor)");
          return;
        }
        console.log("[vendor] submitted the Technical Stage — the RFQ round opened, so quoting it now");
        const technical = this.lastFill;
        await this.startBidding();
        if (this.stage !== "price") return;
        const cells = await this.fillBid(this.price);
        try {
          await this.submitBid();
          this.lastFill = `${technical}, then quoted the RFQ (${cells} price cell(s))`;
        } catch (err) {
          // Seen 15 Oct on a Technical + RFQ event: the RFQ sheet opens and takes
          // a price, but "Submit Quote" stays disabled with no message — the
          // quote waits on the buyer's side. The technical response is in; say
          // what the screen showed rather than fail the vendor's whole bid.
          if (!/stays disabled/i.test((err as Error).message)) throw err;
          this.stage = "technical";
          this.lastFill = `${technical}; the RFQ sheet opened and took a price, but Procol keeps “Submit Quote” disabled with no message, so the quote waits until the buyer acts on the technical stage`;
          console.log(`[vendor] ${this.lastFill}`);
        }
        return;
      }
    }
    throw new Error("the Technical Stage response stayed a draft — the page still says “saved as draft. Submit to proceed” after Submit was pressed twice");
  }

  /**
   * The Technical Stage will not submit: ask the tester. They can finish the
   * sheet themselves in the live browser (take control, hand back) or stop.
   * What they do by hand is said as a [by-hand] step, so the run ends
   * "Partly tested", never Passed: the run did not test that part.
   *   "retry"     — handed back; press Submit again
   *   "submitted" — they submitted it themselves
   *   "no"        — stop (or nobody to ask)
   */
  private async askToFinishTechnical(why: string): Promise<"retry" | "submitted" | "no"> {
    const p = this.page;
    // The ask can take minutes: the test's own clock must not run out while it waits.
    try {
      const { test } = await import("@playwright/test");
      test.info().setTimeout(test.info().timeout + 20 * 60_000);
    } catch {
      /* not inside a test */
    }
    const a = await askTester({
      kind: "stuck",
      question: "The vendor's Technical Stage sheet won't submit. Can you finish it in the browser?",
      detail: `${why.charAt(0).toUpperCase()}${why.slice(1)}. Quick Fill and typing did not fill everything Procol needs.`,
      options: [
        { id: "self", label: "I'll fill it in myself, then hand back" },
        { id: "stop", label: "Stop here" },
      ],
    });
    if (!a || a.option === "stop" || (!a.option && SAYS_STOP.test(a.text))) return "no";
    // The card's "self" presses Take control; wait for it, then for the hand-back.
    for (let t = 0; t < 50 && !controlHeld(); t++) await this.pause(200);
    await released();
    const draft = p.getByText(/saved as draft\.?\s*submit to proceed/i).first();
    const tabs = await p.getByRole("tab").allInnerTexts().catch(() => [] as string[]);
    const submitted = tabs.some((n) => /technical|^rfp/i.test(n) && /submitted/i.test(n)) && !(await draft.isVisible().catch(() => false));
    if (submitted) {
      this.answeredTechnical = true;
      this.lastFill = "the Technical Stage's sheet was finished and submitted by you in the browser";
      console.log("[by-hand] you finished and submitted the vendor's Technical Stage sheet in the browser — not tested by the run");
      return "submitted";
    }
    console.log("[by-hand] you finished the vendor's Technical Stage sheet in the browser — not tested by the run; pressing Submit again");
    this.lastFill = "the Technical Stage's sheet was finished by you in the browser";
    return "retry";
  }

  /** True if a bid-submitted confirmation/state is visible. */
  /**
   * Accept the buyer's counter offer, from the vendor's side.
   *
   * The supplier portal is a separate app whose source is not checked out
   * here, so this is built the way the buyer-side verb was: on the event's
   * stage view, look for the counter-offer prompt and its Accept control;
   * confirm; read the app's answer. When the control is not there, record the
   * page — buttons, tabs, tree — so the next iteration is built on evidence,
   * not on a guess. Returns what happened, in words.
   */
  async acceptCounterOffer(match?: string): Promise<string> {
    const p = this.page;
    // The prompt may sit on the overview or behind the stage tab; look on both.
    const findAccept = async () => {
      const candidates = [
        p.getByRole("button", { name: /accept counter ?offer/i }),
        p.locator("[class*='counter' i], [class*='offer' i], [data-testid*='counter' i]").getByRole("button", { name: /^accept\b/i }),
        p.getByRole("button", { name: /^accept\b/i }),
        p.getByText(/accept counter ?offer/i),
      ];
      for (const c of candidates) if ((await c.count()) && (await c.first().isVisible().catch(() => false))) return c.first();
      return null;
    };
    let control = await findAccept();
    if (!control) {
      await this.startBidding(match);
      control = await findAccept();
    }
    if (!control) {
      const buttons = (await p.getByRole("button").allTextContents()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
      const tabs = (await p.getByRole("tab").allTextContents()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
      const mentions = (await p.getByText(/counter ?offer/i).allTextContents()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 5);
      await recordStuck(p, {
        label: "accept-counter-offer:control",
        message: `no Accept control for a counter offer on the vendor's event view — counter-offer mentions: ${mentions.join(" | ") || "none"}`,
        triedCandidates: ["button /accept counter offer/i", "button /^accept/i near counter-offer text"],
        healerTried: false,
      }).catch(() => {});
      throw new Error(
        `the vendor's event view offers no Accept for a counter offer${mentions.length ? ` (it mentions: ${mentions.join(" | ")})` : " (no counter-offer text on the page — the offer may not have reached this vendor's view yet)"}. Tabs: ${tabs.join(" | ") || "none"}; buttons: ${buttons.slice(0, 14).join(" | ")}`,
      );
    }
    await control.scrollIntoViewIfNeeded({ timeout: TIMEOUTS.SHORT }).catch(() => {});
    await control.click({ timeout: TIMEOUTS.MEDIUM });
    // A confirmation may follow; take the affirmative half, never a reject.
    await this.clickIfPresent(
      [p.locator(".ant-modal-content, [role='dialog']").getByRole("button", { name: /^(accept|yes|confirm|ok|submit)/i })],
      { label: "accept-counter-offer:confirm", timeout: TIMEOUTS.SHORT },
    ).catch(() => {});
    const err = await this.errorToastText(2_500);
    if (err) throw new Error(`accepting the counter offer was refused: ${err}`);
    // Prove the click did something: a success toast, an "accepted" state on
    // the view, or the Accept control gone. None of the three within 10s is
    // reported as exactly that, with the page captured — not as "accepted".
    const ok = await this.successToastText(6_000);
    let evidence = ok ? `toast: ${ok}` : "";
    const deadline = Date.now() + 10_000;
    while (!evidence && Date.now() < deadline) {
      if (await p.getByText(/accepted/i).first().isVisible().catch(() => false)) evidence = "the view reads accepted";
      else if (!(await control.isVisible().catch(() => false))) evidence = "the Accept control is gone";
      else await p.waitForTimeout(1_000);
    }
    await this.waitForSpinnerHidden();
    if (!evidence) {
      await recordStuck(p, {
        label: "capture:accept-counter-offer-after",
        message: "Accept was pressed but no toast, no accepted state and the control is still there — captured",
        triedCandidates: [],
        healerTried: false,
      }).catch(() => {});
      throw new Error("Accept was pressed, but nothing confirmed it — no toast, no accepted state, the control still present (captured for a look)");
    }
    return `counter offer accepted — ${evidence}`;
  }

  async bidSubmitted(): Promise<boolean> {
    const toast = await this.successToastText(TIMEOUTS.SHORT);
    if (toast && /submit|success|placed/i.test(toast)) return true;
    // A technical response: submitTechnical already saw the draft bar go; the
    // sheet now reads as submitted (or offers a revision) rather than a draft.
    if (this.stage === "technical") {
      const draftGone = !(await this.page.getByText(/saved as draft/i).first().isVisible().catch(() => false));
      const said = await this.page.getByText(/response submitted|submitted successfully|revise (response|bid)|edit response|^submitted$/i).first().isVisible().catch(() => false);
      return said || draftGone;
    }
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
