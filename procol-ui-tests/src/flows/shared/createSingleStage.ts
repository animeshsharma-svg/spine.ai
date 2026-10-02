import { Page, expect } from "@playwright/test";
import { EventsPage } from "../../pages/EventsPage.js";
import { SingleStagePage, SingleStageConfig } from "../../pages/SingleStagePage.js";
import { generateEventTitle } from "../../helpers/data.js";

export interface SingleStageOptions extends SingleStageConfig {
  titlePrefix?: string;
  productSearch?: string;
}

export interface SingleStageResult {
  title: string;
  projectId: string | null;
}

/**
 * Create + publish a single-stage (non-eRFX) event with a chosen event type,
 * auction sub-type and awarding mode — all selected at creation time in the
 * "Configuration for Event" drawer. Shared by every single-stage flow.
 */
export async function createAndPublishSingleStage(page: Page, opts: SingleStageOptions): Promise<SingleStageResult> {
  const events = new EventsPage(page);
  const ss = new SingleStagePage(page);
  const title = generateEventTitle(opts.titlePrefix ?? "UI_Auto_SS");

  // Enter via the Events menu (falls back to direct nav inside goto for the drawer probe).
  await events.goto();
  await events.startCreate("single-stage");

  // Configure event type + sub-type + awarding, then Save.
  await ss.configure({ eventType: opts.eventType, auctionSubtype: opts.auctionSubtype, awarding: opts.awarding });

  await ss.setTitle(title);
  await expect(
    page.getByRole("textbox", { name: /enter the title of this event/i }).or(page.getByPlaceholder(/enter the title of this event/i)),
  ).toHaveValue(title, { timeout: 10_000 });

  // RFP needs no pricing sheet; RFQ/Auction do.
  if (opts.eventType !== "rfp") {
    await ss.selectBuyTemplate();
    await ss.fillFirstLineItem(opts.productSearch ?? "a");
  } else {
    await ss.selectBuyTemplate().catch(() => {});
  }

  await ss.inviteVendor();
  await ss.publish(title);
  await ss.waitForRedirectToProject();

  const projectId = ss.projectId();
  expect(projectId, "published single-stage event should have a project/order id in the URL").toBeTruthy();
  const err = await ss.errorToastText(1_000);
  expect(err, `no error toast expected after publish (got: ${err})`).toBeFalsy();

  return { title, projectId };
}
