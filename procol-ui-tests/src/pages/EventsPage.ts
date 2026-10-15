import { Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { CONFIG, TIMEOUTS, NAV } from "../config.js";
import { recordStuck } from "../oracle/stuck.js";

export type CreatePath = "single-stage" | "erfx" | "boq";

/**
 * Events list + the "create event" entry menu. The trigger label drifts across
 * builds ("New Event" -> "Create Event"), and the menu offers Single Stage /
 * eRFX Project / BOQ — so every locator here is multi-candidate.
 */
export class EventsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private createTriggerCandidates() {
    const p = this.page;
    return [
      p.getByRole("button", { name: /create event/i }),
      p.getByRole("button", { name: /new event/i }),
      p.getByRole("button", { name: /\+?\s*event/i }),
    ];
  }

  private menuItemCandidates(path: CreatePath) {
    const p = this.page;
    const byText = (re: RegExp) => [
      p.getByRole("menuitem", { name: re }),
      p.locator(".ant-dropdown-menu-item", { hasText: re }),
      p.locator("li", { hasText: re }),
      p.getByText(re),
    ];
    switch (path) {
      case "single-stage":
        return byText(/single stage/i);
      case "erfx":
        return byText(/eRFX Project/i);
      case "boq":
        return byText(/BOQ/i);
    }
  }

  async goto(): Promise<void> {
    await this.page.goto(`${CONFIG.appUrl.replace(/\/$/, "")}/orders`, NAV);
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});
    await this.dismissDistractions();
  }

  /**
   * Assert the list is genuinely on screen.
   *
   * "Create Event" is the one control that exists on the list and nowhere
   * else, so it is the honest signal — checking for rows would pass on an
   * empty tenant and checking the URL would pass on a page that failed to
   * render.
   */
  async expectListReady(): Promise<void> {
    const p = this.page;
    await this.expect(
      [
        p.getByRole("button", { name: /create event/i }),
        p.getByRole("link", { name: /create event/i }),
        p.locator("button, a").filter({ hasText: /create event/i }).first(),
      ],
      { label: "events list ready", timeout: TIMEOUTS.LONG },
    );
    const err = await this.errorToastText(1_000);
    if (err) throw new Error(`the events list showed an error: ${err}`);
  }

  /** The direct URL for each creation path — our reliable fallback. */
  private createUrl(path: CreatePath): string {
    const base = CONFIG.appUrl.replace(/\/$/, "");
    switch (path) {
      case "single-stage":
        return `${base}/orders/quick-create?singleStage=true`;
      case "boq":
        return `${base}/orders/quick-create?projectCreation=true&boq=true`;
      case "erfx":
      default:
        return `${base}/orders/quick-create?projectCreation=true`;
    }
  }

  /** Are we on a create/quick-create screen rather than the events list? */
  private async onCreateScreen(): Promise<boolean> {
    return /quick-create|\/create/i.test(this.page.url());
  }

  /**
   * Open the create menu and pick a creation path.
   *
   * "Create Event" is a SPLIT control: the primary half navigates straight to
   * the default create screen while only the chevron opens the Single Stage /
   * eRFX / BOQ menu. The old code always clicked the trigger and then insisted
   * on a menu item — so when the primary half navigated (or the menu label
   * drifted) the menu click matched nothing and the run sat on /orders forever.
   *
   * Now: try the menu, but check where we actually ended up after every step,
   * and fall back to the direct URL. Navigating by URL is exactly what the
   * single-stage flow already does reliably, so this can't be worse.
   */
  async startCreate(path: CreatePath, opts: { direct?: boolean } = {}): Promise<void> {
    await this.dismissDistractions();

    // A plan only needs to BE on the create screen, so it goes by address
    // first. The menu below is tried when the address does not land there.
    // In the RFQ journey's trace the menu path spent ~15 s (the chevron 5 s,
    // the menu 5 s, the trigger) and then went by address anyway.
    if (opts.direct) {
      await this.page.goto(this.createUrl(path), NAV).catch(() => {});
      await this.page.waitForLoadState("domcontentloaded").catch(() => {});
      if (await this.onCreateScreen()) {
        await this.dismissDistractions();
        return;
      }
      await this.goto();
    }

    // 1) Prefer the chevron, which is what actually opens the path menu.
    const chevron = this.page
      .getByRole("button", { name: /create event/i })
      .locator("xpath=following-sibling::*[1]")
      .first();
    await chevron.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});

    // 2) If a menu opened, pick the path from it.
    const picked = await this.clickIfPresent(this.menuItemCandidates(path), {
      label: `create-menu:${path}`,
      timeout: TIMEOUTS.SHORT,
    }).catch(() => false);

    // 3) No menu? Click the trigger itself — on many builds this navigates.
    if (!picked && !(await this.onCreateScreen())) {
      await this.click(this.createTriggerCandidates(), { label: "create-event-trigger", force: true }).catch(
        () => {},
      );
      await this.clickIfPresent(this.menuItemCandidates(path), {
        label: `create-menu-retry:${path}`,
        timeout: TIMEOUTS.SHORT,
      }).catch(() => {});
    }

    await this.page.waitForLoadState("domcontentloaded").catch(() => {});

    // 4) Still on the list? Go straight to the create URL rather than stalling.
    if (!(await this.onCreateScreen())) {
      await this.page.goto(this.createUrl(path), NAV);
      await this.page.waitForLoadState("domcontentloaded").catch(() => {});
    }

    await this.dismissDistractions();

    if (!(await this.onCreateScreen())) {
      // On /login the browser was never signed in; blaming the Create Event
      // control sends whoever reads this to the wrong screen.
      if (new URL(this.page.url()).pathname.includes("/login")) {
        throw new Error(
          `could not reach the ${path} create screen — the browser is on the login page, so it was not signed in.`,
        );
      }
      throw new Error(
        `could not reach the ${path} create screen — still on ${this.page.url()}. ` +
          `The "Create Event" control or its menu labels may have changed again.`,
      );
    }
  }

  /**
   * Open the Create Event menu and return the options it offers, as text.
   *
   * The menu is what UI-ENV-002 and its neighbours are ABOUT — which paths a
   * tenant is offered (eRFX, single-stage, BOQ) is tenant configuration made
   * visible — so a step has to be able to observe it rather than click through
   * it. Returns an empty list when the control navigates directly and there is
   * no menu, which is itself an observation worth asserting on.
   */
  async readCreateMenu(): Promise<string[]> {
    await this.dismissDistractions();
    const open = this.page.locator(".ant-dropdown:not(.ant-dropdown-hidden)");
    const menu = open.locator(".ant-dropdown-menu-item, [role='menuitem']");

    // The list hydrates slowly on this environment (the goto alone can take
    // 25s), and a chevron clicked before the dropdown is wired does nothing.
    // Try a few times, and only proceed once a menu is actually on screen.
    for (let attempt = 0; attempt < 4 && (await open.count()) === 0; attempt++) {
      // The "Want to stay updated?" card arrives 2-3s AFTER the list renders
      // and sits exactly over the Create Event control, so a dismissal at
      // page-open is too early. Dismiss again right before every attempt —
      // the stuck screenshot for this step showed the card covering the button.
      await this.dismissDistractions();
      const button = this.page.getByRole("button", { name: /create event/i }).first();
      // The accessibility tree names the control "icon: plus Create Event icon:
      // down": the chevron is INSIDE the button, not a sibling of it.
      const chevron = button.locator(".anticon-down, [aria-label='icon: down'], i[class*='down']").first();
      const clicked = await chevron
        .click({ timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);
      if (!clicked) {
        // antd Dropdown opens on hover; hovering the button is the next-best move.
        await button.hover({ timeout: TIMEOUTS.SHORT }).catch(() => {});
      }
      await open.first().waitFor({ state: "visible", timeout: TIMEOUTS.SHORT }).catch(() => {});
      if ((await open.count()) === 0) await this.page.waitForTimeout(800);
    }

    // Each item is a title plus a description; read leaf nodes separately so
    // the text does not fuse into "Single StageSource through RFP".
    const items: string[] = [];
    for (const item of await menu.all()) {
      const parts = (await item.locator("xpath=.//*[not(*)]").allTextContents()).map((t) => t.trim()).filter(Boolean);
      const text = (parts.length ? parts : [await item.innerText().catch(() => "")]).join(" — ").replace(/\s+/g, " ").trim();
      if (text) items.push(text);
    }
    if (!items.length) {
      // Say what was on screen, so an empty read is diagnosable from the report.
      await recordStuck(this.page, {
        label: "create-menu:read",
        message: "the Create Event menu did not open, or opened with no items",
        triedCandidates: ["button[name=/create event/i] + following-sibling chevron", ".ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item"],
        healerTried: false,
      }).catch(() => {});
    }
    await this.page.keyboard.press("Escape").catch(() => {});
    return items;
  }

  /**
   * Switch the events list to one of its tabs — Live, History, Drafts,
   * Recurring. The tab label carries a count badge ("LIVE 5606"), so match on
   * the word, not the whole text.
   */
  async openTab(tab: string): Promise<string> {
    await this.dismissDistractions();
    const want = new RegExp(`^\\s*${tab.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    await this.click(
      [
        this.page.getByRole("tab", { name: want }),
        this.page.locator(".ant-tabs-tab").filter({ hasText: want }).first(),
        this.page.getByText(want).first(),
      ],
      { label: `events-tab:${tab.toLowerCase()}` },
    );
    await this.waitForSpinnerHidden();
    await this.page.waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG }).catch(() => {});
    const active = await this.page.locator(".ant-tabs-tab-active, [role='tab'][aria-selected='true']").first().textContent().catch(() => null);
    // The tab text carries its count badge ("Live5618"); the word is the answer.
    return (active ?? tab).replace(/\d[\d,]*\s*$/, "").replace(/\s+/g, " ").trim() || tab;
  }

  /** Search the events list by title and report whether any row matches. */
  async searchByTitle(query: string): Promise<void> {
    const search = await this.expect(
      [
        this.page.getByRole("textbox", { name: /search title/i }),
        this.page.getByPlaceholder(/search title|search/i),
      ],
      { label: "events-search", timeout: TIMEOUTS.MEDIUM },
    );
    await search.click();
    await search.fill(query);
    await search.press("Enter");
    await this.page.waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG }).catch(() => {});
  }

  /**
   * The text of the list row (or card) that carries this title — the whole
   * block, so the status chip ("Draft", "RFQ in Progress") comes with it.
   * Returns null when no row carries the title.
   */
  async rowTextFor(title: string): Promise<string | null> {
    // Walk up from the title until the block is a plausible ROW: it contains
    // the title and is short. The old ancestor guess matched the whole list
    // container once the tabs and filters were in the same block, and a
    // lapse test then read "In - Evaluation" off the filter strip.
    const anchor = this.page.getByText(title, { exact: false }).first();
    if (!(await anchor.count())) return null;
    let node = anchor;
    for (let up = 0; up < 8; up++) {
      const parent = node.locator("xpath=..");
      if (!(await parent.count())) break;
      const text = ((await parent.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
      if (!text.includes(title) || text.length > 420) break;
      node = parent;
    }
    const text = ((await node.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    return text || null;
  }

  /**
   * Open an existing event: by project id (direct URL) or by title (search the
   * list, click the row). Lands on the project details page.
   */
  async openEvent(opts: { id?: string; title?: string }): Promise<string> {
    const base = CONFIG.appUrl.replace(/\/$/, "");
    if (opts.id) {
      await this.page.goto(`${base}/project/${opts.id}/details`, NAV);
      await this.dismissDistractions();
      return `/project/${opts.id}/details`;
    }
    if (!opts.title) throw new Error("open_event needs an id or a title");
    if (!/\/orders\/?(\?|$)/.test(new URL(this.page.url()).pathname)) await this.goto();
    // An event can sit under Live, Drafts or History. Look in each before
    // concluding it does not exist — and say where it was found, because
    // "published, but only in Drafts" is a finding in itself.
    let target = this.page.getByRole("link").filter({ hasText: opts.title }).first();
    let foundIn = "";
    for (const tab of ["Live", "Drafts", "History"]) {
      await this.openTab(tab).catch(() => {});
      await this.searchByTitle(opts.title);
      const link = this.page.getByRole("link").filter({ hasText: opts.title }).first();
      const any = this.page.getByText(opts.title, { exact: false }).first();
      target = (await link.count()) ? link : any;
      if (await target.count()) {
        foundIn = tab;
        break;
      }
    }
    if (!foundIn) throw new Error(`no event titled "${opts.title}" under Live, Drafts or History after searching each`);
    console.log(`[events] "${opts.title}" found under ${foundIn}`);
    await target.scrollIntoViewIfNeeded({ timeout: TIMEOUTS.SHORT }).catch(() => {});
    await target.click({ timeout: TIMEOUTS.MEDIUM });
    await this.page.waitForURL((u) => /\/(project|orders)\/[^/]+/.test(u.pathname) && !/quick-create/.test(u.pathname), { timeout: TIMEOUTS.LONG });
    await this.dismissDistractions();
    return new URL(this.page.url()).pathname;
  }

  /**
   * Pick the event a test case needs from the Live list itself, the way a
   * tester would — read the cards on screen and click the one that fits. No
   * search, and no event fixed in advance.
   *
   *   need "bids" (Master QCS, awarding, counter offers): Live › In - Evaluation,
   *     the events whose quotes are waiting to be evaluated. A card that says
   *     "Evaluate RFQ Commercials N" (N ≥ 1) has quotes to award; one with no
   *     technical review pending ("TR pending") is preferred.
   *   need "live" (placing a bid): Live › Live, an event still taking quotes
   *     ("Ends in …" on its RFQ round).
   *
   * Newest first among equals (the list's own order). Throws, saying what the
   * list showed, when no card fits.
   */
  /**
   * exclude: titles already tried for this case and found not to fit (runPlan's open_event).
   * vet: a check made before a card is clicked (the database's view of its
   * round). With one, the database judges every card and the card's own
   * reading only orders them: a countdown read "bidding over" on a round with
   * half an hour left, and "open" on rounds that had closed. A card it turns
   * down is passed over, and onSkip hears why.
   */
  async pickFromLive(
    need: "bids" | "live",
    exclude: string[] = [],
    vet?: (title: string) => Promise<{ ok: boolean; why: string } | null>,
    onSkip?: (title: string, why: string) => void,
  ): Promise<{ title: string; why: string; where: string }> {
    // The whole Live tab (all stages): an RFQ whose bidding time ran out can
    // stay "in progress" rather than move to In - Evaluation — the event with
    // two bids that an award case needed was not under In - Evaluation at all.
    await this.goto();
    await this.openTab("Live").catch(() => "");
    // UAT's list can take most of a minute to fill on a slow day.
    const cardsShown = await this.page
      .waitForFunction(() => /RFX-\d+/.test(document.body.innerText), null, { timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    const where = "the Live events list";
    if (!cardsShown) throw new Error(`the ${where} list showed no events within a minute`);
    await this.page.waitForTimeout(800);

    type Card = { title: string; text: string; score: number; why: string; i: number; bids: number; trPending: boolean; ended: boolean };
    const cards: Card[] = await this.page.evaluate((need) => {
      const els = Array.from(document.querySelectorAll("body *")) as HTMLElement[];
      const refs = (el: HTMLElement) => ((el.innerText || "").match(/RFX-\d+/g) || []).length;
      // A card: from each event's RFX number, the widest box that still holds
      // only that one event — and never the page around a list of one.
      const boxes: HTMLElement[] = [];
      // Each RFX number as written on screen: the element right around its text.
      const leaves: HTMLElement[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (/RFX-\d+/.test(n.nodeValue || "") && n.parentElement && !leaves.includes(n.parentElement)) leaves.push(n.parentElement);
      }
      for (const leaf of leaves) {
        let box: HTMLElement = leaf;
        while (box.parentElement && refs(box.parentElement) === 1 && !/Search Title|Create Event/i.test(box.parentElement.innerText || "")) box = box.parentElement;
        if (!boxes.includes(box)) boxes.push(box);
      }
      for (const el of Array.from(document.querySelectorAll("[data-spine-pick]"))) el.removeAttribute("data-spine-pick");
      return boxes.map((box, i) => {
        const lines = (box.innerText || "").split("\n").map((l) => l.trim()).filter(Boolean);
        const at = lines.findIndex((l) => /^\d+\s+items?$/i.test(l));
        const title = (at >= 0 ? lines[at + 1] : lines.find((l) => !/^(RFX-\d+|•|Procol Support)$/.test(l) && l.length > 3)) || "";
        const text = lines.join(" · ");
        // "1/161" on a round is 1 bid in from 161 invited vendors — the bids the
        // event really has. (The number on a "TR pending" or "Evaluate RFQ
        // Commercials" chip counts tasks, not bids: an event showing
        // "Evaluate RFQ Commercials 4" had "No bids are placed yet!" in Master QCS.)
        const bids = Math.max(0, ...Array.from(text.matchAll(/(?:^|[\s·])(\d+)\s*\/\s*(\d+)(?=$|[\s·])/g)).map((m) => Number(m[1])));
        const trPending = /TR pending/i.test(text);
        const open = /Ends in\s*\d/i.test(text) && /\bRFQ\b/.test(text);
        // Bidding over: being evaluated, overdue, or a countdown with no time left in it.
        const ended = /Evaluate\s+(RFQ\s+)?Commercials|Overdue by|Ends in\s*(·|$)|Ends in\s*(?![\s·]*\d)/i.test(text) || !open;
        let score = 0;
        let why = "";
        if (need === "bids") {
          if (bids > 0) {
            score = 100 + Math.min(bids, 10) + (ended ? 25 : 0) - (trPending ? 30 : 0);
            why =
              `${bids} bid${bids === 1 ? "" : "s"} in` +
              (ended ? ", bidding over" : ", bidding still open (awarding may wait until it closes)") +
              (trPending ? ", a technical review still pending" : "");
          }
        } else if (open) {
          score = 100 + Math.min(bids, 10);
          why = `its RFQ round is open for quotes${bids ? ` (${bids} bid${bids === 1 ? "" : "s"} in so far)` : ""}`;
        }
        // Our own test events first among equals: nobody's real work gets awarded by a test.
        if (score && /^(spine-|QA_Platform|API_Journey|UI_Auto)/i.test(title)) score += 15;
        // Mark the title so the click goes to exactly this card.
        const titleEl = (Array.from(box.querySelectorAll("*")) as HTMLElement[]).find((e) => (e.innerText || "").trim() === title && !Array.from(e.children).some((c) => ((c as HTMLElement).innerText || "").trim() === title));
        titleEl?.setAttribute("data-spine-pick", String(i));
        return { title, text: text.slice(0, 300), score, why, i, bids, trPending, ended };
      });
    }, need);
    // What the list showed, card by card — so a pick can be checked against the screen.
    for (const c of cards.slice(0, 12)) console.log(`[events]   “${c.title || "?"}” — ${c.bids} bid${c.bids === 1 ? "" : "s"}, ${c.ended ? "bidding over" : "bidding open"}${c.trPending ? ", technical review pending" : ""}${c.score ? "" : " (does not fit)"}`);

    const ours = (c: Card) => (/^(spine-|QA_Platform|API_Journey|UI_Auto)/i.test(c.title) ? 1 : 0);
    const fits = vet
      ? cards.filter((c) => c.title && !exclude.includes(c.title)).sort((a, b) => ours(b) - ours(a) || b.score - a.score || a.i - b.i)
      : cards.filter((c) => c.score > 0 && c.title && !exclude.includes(c.title)).sort((a, b) => b.score - a.score || a.i - b.i);
    console.log(
      vet
        ? `[events] ${where}: ${cards.length} event(s) on screen — asking the database which can take this case, ours first`
        : `[events] ${where}: ${cards.length} event(s) on screen, ${fits.length} fit${fits.length ? ` — best: “${fits[0].title}” (${fits[0].why})` : ""}`,
    );
    if (!fits.length) {
      const shown = cards.slice(0, 5).map((c) => `“${c.title}”`).join(", ");
      throw new Error(
        need === "bids"
          ? `no event under ${where} has bids in, which awarding needs${shown ? ` (it shows ${shown}, none with a bid)` : ""} — place a bid on an event first, or name one`
          : `no event under ${where} has an RFQ round open for quotes${shown ? ` (it shows ${shown})` : ""}`,
      );
    }
    let pick: Card | undefined;
    for (const c of fits) {
      const v = vet ? await vet(c.title).catch(() => null) : null;
      // No answer from the database: the card's own reading decides, as before.
      if (v ? v.ok : c.score > 0) {
        pick = v ? { ...c, why: v.why } : c;
        break;
      }
      exclude.push(c.title);
      onSkip?.(c.title, v?.why ?? c.why ?? "the list does not show it open");
    }
    if (!pick) throw new Error(`every event under ${where} was passed over`);
    const target = this.page.locator(`[data-spine-pick="${pick.i}"]`).first();
    await target.scrollIntoViewIfNeeded({ timeout: TIMEOUTS.SHORT }).catch(() => {});
    await target.click({ timeout: TIMEOUTS.MEDIUM });
    await this.page.waitForURL((u) => /\/project\/[^/]+/.test(u.pathname), { timeout: TIMEOUTS.LONG });
    await this.dismissDistractions();
    return { title: pick.title, why: pick.why, where };
  }

  async hasEventMatching(pattern: RegExp | string): Promise<boolean> {
    const count = await this.page.getByRole("link").filter({ hasText: pattern }).count();
    return count > 0;
  }
}
