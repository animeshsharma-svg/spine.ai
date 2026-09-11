import { Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { recordStuck } from "../oracle/stuck.js";
import { InlineSheet } from "../helpers/inlineSheet.js";
import { CONFIG, TIMEOUTS, NAV } from "../config.js";
import { randomNumber } from "../helpers/data.js";

export type EventType = "rfq" | "rfp" | "auction";
export type AuctionSubtype = "rank" | "price" | "traffic_light";
export type Awarding = "lot" | "line_item";

const EVENT_TYPE_LABEL: Record<EventType, RegExp> = {
  rfq: /^RFQ$/i,
  rfp: /^RFP$/i,
  auction: /^Auction$/i,
};
const SUBTYPE_LABEL: Record<AuctionSubtype, RegExp> = {
  rank: /Rank Based/i,
  price: /Price Based/i,
  traffic_light: /Traffic Light/i,
};
const AWARDING_LABEL: Record<Awarding, RegExp> = {
  lot: /entire lot to single vendor/i,
  line_item: /partially award .*multiple vendors/i,
};

export interface SingleStageConfig {
  eventType: EventType;
  auctionSubtype?: AuctionSubtype;
  awarding?: Awarding;
  /** Traffic light only: the specified range's bounds (defaults 50 / 150). */
  rangeLower?: number;
  rangeUpper?: number;
}

/**
 * The single-stage (non-eRFX) "quick create" event page
 * (`/orders/quick-create?singleStage=true`). Distinct from eRFX:
 *  - event type + auction sub-type + awarding mode are chosen in a
 *    "Configuration for Event" drawer opened from the Event Type chip;
 *  - line items are the pricing-template sheet itself (product/variant/qty/
 *    delivery/price cells), not a pre-sheet combobox.
 * All verified live on cpanel.ag-ri.in.
 */
export class SingleStagePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto(`${CONFIG.appUrl.replace(/\/$/, "")}/orders/quick-create?singleStage=true`, NAV);
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});
    await this.pause(1500);
    await this.dismissDistractions();
  }

  private drawer() {
    return this.page
      .locator(".ant-drawer, [role='dialog']")
      .filter({ hasText: /Configuration for Event/i })
      .first();
  }

  /** Open the config drawer via the Event Type chip (shows RFP/RFQ/Auction). */
  private async openConfigDrawer(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.dismissDistractions();
      await this.click(
        [
          this.page.getByRole("button", { name: /^(RFP|RFQ|Auction)\b/ }),
          this.page.getByText(/^(RFP|RFQ|Auction)\s*>/),
        ],
        { label: "event-type-chip", timeout: TIMEOUTS.MEDIUM, force: true },
      );
      // The drawer is open once its event-type radios have rendered.
      const ready = await this.find(
        [this.drawer().locator(".pro-radio-tabs__tab"), this.drawer().getByRole("radio")],
        { label: "config-drawer-ready", timeout: TIMEOUTS.SHORT },
      );
      if (ready) return;
    }
    throw new Error("config drawer did not open with event-type options");
  }

  /**
   * Choose event type (+ auction sub-type) and awarding mode in the drawer,
   * then Save. Selecting by role=radio name, falling back to clicking the card
   * that contains the label text.
   */
  async configure(cfg: SingleStageConfig): Promise<void> {
    await this.openConfigDrawer();
    const d = this.drawer();

    const pick = async (re: RegExp, label: string) => {
      // Options are custom cards `div.pro-radio-tabs__tab[role=radio]` (not antd
      // radios). Click the card; force bypasses the inner text-node overlay.
      // Wait for the option to render first (awarding/sub-type appear only after
      // the event type is chosen), then click.
      await this.expect(
        [d.locator(".pro-radio-tabs__tab", { hasText: re }), d.getByRole("radio", { name: re }), d.getByText(re)],
        { label: `${label}-visible`, timeout: TIMEOUTS.MEDIUM },
      );
      await this.click(
        [
          d.locator(".pro-radio-tabs__tab", { hasText: re }),
          d.getByRole("radio", { name: re }),
          d.getByText(re),
        ],
        { label, timeout: TIMEOUTS.MEDIUM, force: true },
      );
      await this.pause(500);
    };

    await pick(EVENT_TYPE_LABEL[cfg.eventType], `event-type:${cfg.eventType}`);
    // Give the conditional sections (sub-type / awarding) a beat to render.
    await this.pause(500);
    if (cfg.eventType === "auction" && cfg.auctionSubtype) {
      await pick(SUBTYPE_LABEL[cfg.auctionSubtype], `subtype:${cfg.auctionSubtype}`);
      if (cfg.auctionSubtype === "traffic_light") {
        // Traffic light needs a "specified range" before Save (the journey was
        // deferred for exactly this). The drawer's range controls have never
        // been captured, so record them here — with the tree — and try the
        // obvious shape: a range-type choice plus lower/upper number inputs.
        await recordStuck(this.page, {
          label: "capture:single-stage-traffic-light-drawer",
          message: "captured on request — the traffic light range controls, before Save",
          triedCandidates: [],
          healerTried: false,
        }).catch(() => {});
        const nums = d.locator("input[type='number'], input.ant-input-number-input");
        const n = await nums.count();
        if (n >= 2) {
          await nums.nth(0).fill(String(cfg.rangeLower ?? 50)).catch(() => {});
          await nums.nth(1).fill(String(cfg.rangeUpper ?? 150)).catch(() => {});
        } else if (n === 1) {
          await nums.nth(0).fill(String(cfg.rangeLower ?? 50)).catch(() => {});
        }
      }
    }
    if (cfg.awarding) {
      await pick(AWARDING_LABEL[cfg.awarding], `awarding:${cfg.awarding}`);
    }

    await this.click([d.getByRole("button", { name: /^Save$/i }), this.page.getByRole("button", { name: /^Save$/i })], {
      label: "config-save",
      timeout: TIMEOUTS.MEDIUM,
    });
    // Drawer closes on save.
    await this.pause(800);
    await this.dismissDistractions();
  }

  async setTitle(title: string): Promise<void> {
    await this.fill(
      [this.page.getByRole("textbox", { name: /enter the title of this event/i }), this.page.getByPlaceholder(/enter the title of this event/i)],
      title,
      { label: "event-title", timeout: TIMEOUTS.MEDIUM },
    );
  }

  /** Open the template picker and select a Buy (pricing) template. */
  async selectBuyTemplate(): Promise<void> {
    await this.dismissDistractions();
    await this.click(
      [this.page.getByRole("button", { name: /select templates/i }), this.page.getByText(/select templates/i)],
      { label: "open-templates", force: true, timeout: TIMEOUTS.MEDIUM },
    );
    const search = await this.find(
      [this.page.getByTestId("template-search-input"), this.page.getByPlaceholder(/search template/i)],
      { label: "template-search", timeout: TIMEOUTS.SHORT },
    );
    if (search) {
      await search.fill("Buy");
      await this.pause(700);
    }
    await this.click(
      [
        this.page.getByTestId(/^template-item-/).filter({ hasText: /buy/i }),
        this.page.getByTestId(/^template-item-/),
        this.page.getByRole("menuitem"),
      ],
      { label: "template-item", timeout: TIMEOUTS.MEDIUM },
    );
    await this.waitForSpinnerHidden();
    await this.pause(1000);
  }

  /**
   * Fill the first line-item row in the pricing sheet. Cells (verified):
   * product, variant, creator_quantity, buyer_hub (delivery), price,
   * participant_quantity. Order matters — product first (variant depends on it).
   */
  async fillFirstLineItem(searchText = "a"): Promise<void> {
    const sheet = new InlineSheet(this.page);
    await sheet.fillCell(0, "product", { key: "product", type: "product" }, searchText);
    await this.pause(500);
    // variant often auto-fills from the product; try dropdown, ignore if absent.
    await sheet.fillCell(0, "variant", { key: "variant", type: "dropdown" }, "").catch(() => {});
    await sheet.fillCell(0, "creator_quantity", { key: "creator_quantity", type: "number" }, randomNumber());
    await sheet.fillCell(0, "buyer_hub", { key: "buyer_hub", type: "delivery_location" }, searchText).catch(() => {});
    await sheet.fillCell(0, "price", { key: "price", type: "price" }, randomNumber());
    await sheet.fillCell(0, "participant_quantity", { key: "participant_quantity", type: "number" }, randomNumber()).catch(() => {});
  }

  /** Add a SPECIFIC vendor as a participant by searching the participants combobox. */
  async addParticipant(query: string): Promise<boolean> {
    // Open the participants select (click the wrapper), then type into its real
    // search input (an antd select — the wrapper div isn't fillable).
    await this.click(
      [
        this.page.getByText(/search vendors you want to add/i),
        this.page.locator(".ant-select-selection").filter({ hasText: /search vendors/i }),
        this.page.getByRole("combobox"),
        this.page.locator(".ant-select-selection").last(),
      ],
      { label: "open-participants", timeout: TIMEOUTS.MEDIUM, force: true },
    );
    const cb = await this.find(
      [
        this.page.locator("input.ant-select-search__field"),
        this.page.locator(".ant-select-open input, .ant-select-focused input"),
        this.page.getByPlaceholder(/search vendors you want to add/i),
      ],
      { label: "participants-input", timeout: TIMEOUTS.MEDIUM },
    );
    if (!cb) return false;
    await cb.fill(query);
    await this.pause(1500);
    const picked = await this.clickIfPresent(
      [
        this.page.locator(".ant-select-dropdown [role='option']", { hasText: new RegExp(query, "i") }),
        this.page.getByRole("option", { name: new RegExp(query, "i") }),
        this.page.getByRole("option"),
        this.page.locator(".ant-select-item-option"),
      ],
      { label: "vendor-option", timeout: TIMEOUTS.MEDIUM },
    );
    await this.dismissDistractions();
    return picked;
  }

  /** Add vendors: prefer the whole-audience Invite Vendor button, else pick one via the combobox. */
  async inviteVendor(): Promise<void> {
    const invited = await this.clickIfPresent(
      [this.page.getByRole("button", { name: /invite vendor/i }), this.page.getByText(/invite vendor/i)],
      { label: "invite-vendor", timeout: TIMEOUTS.SHORT },
    );
    if (!invited) {
      const cb = await this.find(
        [this.page.getByPlaceholder(/search vendors you want to add/i), this.page.getByRole("combobox")],
        { label: "participants", timeout: TIMEOUTS.SHORT },
      );
      if (cb) {
        await cb.click();
        await cb.fill("a");
        await this.pause(800);
        await this.click([this.page.getByRole("option"), this.page.locator(".ant-select-item-option")], {
          label: "vendor-option",
          timeout: TIMEOUTS.MEDIUM,
        }).catch(() => {});
      }
    }
    await this.dismissDistractions();
  }

  /**
   * Open the Schedule Event drawer and set the event to start later (scheduled),
   * then Save. Requires a line item to exist (the Schedule control is disabled
   * until then). scheduled_events_enabled gates this.
   */
  async scheduleForLater(): Promise<boolean> {
    await this.dismissDistractions();
    await this.click(
      [this.page.getByRole("button", { name: /Now -|Mins\)|Schedule/i }), this.page.getByText(/Now -.*Mins\)/i)],
      { label: "open-schedule", timeout: TIMEOUTS.MEDIUM, force: true },
    );
    const drawerReady = await this.find([this.page.getByText(/Schedule Event/i)], { label: "schedule-drawer", timeout: TIMEOUTS.MEDIUM });
    if (!drawerReady) return false;
    const drawer = this.page.locator(".ant-drawer, [role='dialog']").filter({ hasText: /Schedule Event/i }).first();

    // Switch Start time from "Start now" to a scheduled/later option.
    await this.click(
      [drawer.locator(".ant-select").filter({ hasText: /start now/i }), drawer.getByText(/start now/i)],
      { label: "start-time-select", timeout: TIMEOUTS.MEDIUM, force: true },
    );
    await this.pause(500);
    const pickedLater = await this.clickIfPresent(
      [
        this.page.getByRole("option", { name: /schedule for later|start later|^later|scheduled/i }),
        this.page.locator(".ant-select-item-option", { hasText: /later|scheduled/i }),
      ],
      { label: "schedule-later-option", timeout: TIMEOUTS.MEDIUM },
    );

    await this.click(
      [drawer.getByRole("button", { name: /save schedule/i }), this.page.getByRole("button", { name: /save schedule/i })],
      { label: "save-schedule", timeout: TIMEOUTS.MEDIUM },
    );
    await this.pause(800);
    await this.dismissDistractions();
    return pickedLater;
  }

  async publish(title: string): Promise<void> {
    await this.dismissDistractions();
    await this.click(
      [this.page.getByRole("button", { name: /^publish event$/i }), this.page.getByRole("button", { name: /^publish$/i })],
      { label: "publish-event", timeout: TIMEOUTS.MEDIUM },
    );
    const modalTitle = title.slice(0, 45);
    await this.click(
      [
        this.page.getByLabel(modalTitle).getByRole("button", { name: /^publish/i }),
        this.page.getByRole("dialog").getByRole("button", { name: /^publish|confirm|yes/i }),
        this.page.getByRole("button", { name: /^publish/i }),
      ],
      { label: "publish-confirm", timeout: TIMEOUTS.MEDIUM },
    ).catch(() => {});
  }

}
