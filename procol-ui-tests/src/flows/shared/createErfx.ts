import { Page, expect } from "@playwright/test";
import { mismatches, verifyPublishedEvent, type Verification } from "./verifyEvent.js";
import { biddersWanted, vendorsBid } from "./vendorBids.js";
import { EventsPage } from "../../pages/EventsPage.js";
import { CreateEventPage, ProductInput, StageKey } from "../../pages/CreateEventPage.js";
import { generateEventTitle } from "../../helpers/data.js";
import { normalLineItems, lineItemCount } from "../../master/params.js";

/**
 * Tab label per stage kind in the multi-stage layout.
 *
 * Deliberately unanchored: the app builds tab titles with `getTitleForStage`,
 * which appends a count — `RFQ ${n > 0 ? n + 1 : ""}` — so the first RFQ tab is
 * literally "RFQ " and a second would be "RFQ 2". /^RFQ$/ matched neither.
 */
const STAGE_TAB: Record<StageKey, RegExp> = {
  rfp: /technical stage/i,
  rfq: /\bRFQ\b/i,
  auction: /\bauction\b/i,
};

export interface ErfxOptions {
  stages: StageKey[];
  products?: ProductInput[];
  titlePrefix?: string;
  /** "publish" (default) invites vendors + publishes; "draft" saves as draft. */
  mode?: "publish" | "draft";
  /** Called on the auction stage tab to apply auction-specific config. */
  configureAuction?: (createPage: CreateEventPage) => Promise<void>;
}

export interface ErfxResult {
  title: string;
  projectId: string | null;
  /** What the event turned out to be when read back — see `verifyEvent.ts`. */
  verification?: Verification;
}

/**
 * Compose and publish an eRFX event with an arbitrary set of stages.
 * Shared by every event-creation flow (rfp_only, rfp_rfq, rfq_auction, ...).
 *
 * Sequence: enter eRFX → pick stages → title →
 *   per stage: (multi-stage) switch tab, SELECT TEMPLATE FIRST, then add the
 *     line items (once — they belong to the project, not a stage),
 *     rfp → add evaluator; rfq/auction → fill sheet;
 *     auction → apply auction config →
 *   invite vendor → publish → verify project url + no error toast.
 *
 * The template MUST come before the line items. The toolbar `Items` button that
 * opens the "Manage Line Items" panel is inert until a template is chosen,
 * because the template defines the sheet schema the items are added into. The
 * old order (line items first) clicked a dead button, found no combobox, and
 * every event flow stalled on the create page with "Items 0".
 */
export async function createAndPublishErfx(page: Page, opts: ErfxOptions): Promise<ErfxResult> {
  const eventsPage = new EventsPage(page);
  const createPage = new CreateEventPage(page);

  const stages = opts.stages;
  // The default used to be a single hard-coded item, so UI_LINE_ITEMS had no
  // effect on any flow except multi_product — setting the count in the dashboard
  // appeared to do nothing. The default is now dynamic, so EVERY event flow
  // honours the requested line-item count.
  const products = opts.products ?? normalLineItems();
  console.log(`[erfx] building ${products.length} line item(s) (UI_LINE_ITEMS=${lineItemCount()})`);
  const title = generateEventTitle(opts.titlePrefix ?? "UI_Auto_Event");
  const multiStage = stages.length > 1;

  await eventsPage.goto();
  await eventsPage.startCreate("erfx");

  await createPage.createProjectWithStages(stages);
  await createPage.setTitle(title);

  // Data validation: title stuck.
  await expect(
    page.getByRole("textbox", { name: /enter the title/i }).or(page.getByPlaceholder(/enter the title/i)),
  ).toHaveValue(title, { timeout: 10_000 });

  // Line items are PROJECT-level (the `Items` button lives in the top toolbar,
  // not inside a stage tab), so they are added exactly once — right after the
  // first stage's template unlocks the panel.
  let lineItemsAdded = false;
  const addLineItemsOnce = async () => {
    if (lineItemsAdded) return;
    await createPage.addLineItems(products);
    lineItemsAdded = true;

    // Oracle: the app's own toolbar badge must agree with the count we asked
    // for. This is what proves UI_LINE_ITEMS is honoured end to end rather than
    // silently falling back to one hard-coded item.
    const badge = await createPage.lineItemCountBadge();
    if (badge !== null) {
      expect(badge, `the event should carry ${products.length} line item(s) (toolbar badge said ${badge})`).toBe(
        products.length,
      );
    }
  };

  for (const stage of stages) {
    if (multiStage) await createPage.switchToStageTab(STAGE_TAB[stage]);

    if (stage === "rfp") {
      await createPage.selectFirstTemplate();
      await addLineItemsOnce();
      // A technical stage also carries the "Vendor Assessment" questionnaire,
      // and the app refuses to publish while it is empty.
      await createPage.fillVendorAssessment();
      const n = await createPage.assignEvaluatorToAllLineItems();
      expect(n, "technical stage requires an evaluator on each line item").toBeGreaterThan(0);
    } else {
      // rfq or auction — pricing sheet driven by the template schema.
      const widgets = await createPage.selectFirstTemplateAndExtractWidgets();
      await addLineItemsOnce();
      await createPage.fillSheet(widgets, products.length);
      if (stage === "auction" && opts.configureAuction) {
        await opts.configureAuction(createPage);
      }
    }
  }

  if (opts.mode === "draft") {
    await createPage.saveAsDraft();
    // Draft saved: either redirected to the draft project or a success toast.
    await createPage.waitForRedirectToProject(10_000).catch(() => {});
    const err = await createPage.errorToastText(1_000);
    expect(err, `no error toast expected after save-as-draft (got: ${err})`).toBeFalsy();
    return { title, projectId: createPage.projectId() };
  }

  // Commit the schedule BEFORE publishing. The chip already displays a default
  // window, but until "Save Schedule" is pressed the stage has no bidding-time
  // TradeSchedule — and the backend dereferences that row unguarded while
  // activating, so publish returns a bare 500.
  await createPage.saveSchedule();
  await createPage.inviteVendor();
  await createPage.publishAndAwaitOutcome(title);

  const projectId = createPage.projectId();
  expect(projectId, "published event should have a project/order id in the URL").toBeTruthy();
  const err = await createPage.errorToastText(1_000);
  expect(err, `no error toast expected after publish (got: ${err})`).toBeFalsy();

  /**
   * The journey has driven the screens. Now check the event is the one it set
   * out to build — read back through the API, and through Postgres where it is
   * reachable. Landing on a project page proves the button worked; this is
   * what makes the green tick mean "and the event is what we asked for".
   */
  const verification = await verifyPublishedEvent({
    projectId,
    title,
    stages,
    lineItems: products.length,
  });
  const wrong = mismatches(verification);
  expect(
    wrong,
    `the published event is not what the journey built: ${wrong
      .map((c) => `${c.what} — wanted ${c.expected}, found ${c.actual}`)
      .join("; ")}`,
  ).toEqual([]);

  // "Place a bid" ticked with this event type: the vendors invited to THIS
  // event sign in and bid on it (vendorBids.ts), instead of a second journey
  // building an event of its own.
  const bidders = biddersWanted();
  if (bidders > 0) await vendorsBid(page, { title, projectId }, bidders);

  return { title, projectId, verification };
}
