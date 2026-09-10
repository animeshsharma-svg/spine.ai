import { Page, expect } from "@playwright/test";
import { EventsPage } from "../pages/EventsPage.js";
import { VendorPortalPage } from "../pages/VendorPortalPage.js";
import { SurrogateBidPage } from "../pages/SurrogateBidPage.js";
import { AwardPage } from "../pages/AwardPage.js";
import { vendorNames, vendorCount } from "../master/params.js";
import { CreateEventPage, ProductInput, StageKey } from "../pages/CreateEventPage.js";
import { SingleStagePage } from "../pages/SingleStagePage.js";
import { generateEventTitle } from "../helpers/data.js";
import { buildProducts } from "../master/params.js";
import { WidgetConfig } from "../helpers/inlineSheet.js";
import { PlanStep, TestPlan } from "./steps.js";

/**
 * THE PLAN EXECUTOR — runs a compiled test case.
 *
 * Every branch here delegates to the same page-object method a hand-written
 * journey calls, so a planned test is not a second-class citizen: it gets the
 * healed locators, the verification, the "prove it worked" assertions and the
 * Oracle's evidence collection, identically.
 *
 * State is threaded through the run (the chosen template's widgets, how many
 * line items were added) because later steps genuinely need what earlier ones
 * learned — filling the sheet requires the schema the template returned.
 */

export interface StepResult {
  step: string;
  args?: Record<string, unknown>;
  status: "ok" | "failed" | "skipped";
  detail?: string;
  ms: number;
}

export interface PlanResult {
  title: string;
  steps: StepResult[];
  passed: boolean;
}

interface RunState {
  events: EventsPage;
  create: CreateEventPage;
  single: SingleStagePage;
  page: Page;
  title: string;
  widgets: Record<string, WidgetConfig>;
  products: ProductInput[];
  lineItemsAdded: number;
  /**
   * Whether a bid has been placed in this plan, so `expect_bid_submitted` can
   * tell "the bid failed" from "no bid was ever attempted" — a plan that
   * asserts a submission it never made should say so rather than pass.
   */
  bidSubmitted: boolean;
  /** Vendors already surrogate-bid for, so a second bid picks a different one. */
  surrogateBids: string[];
  /** Whether an award has been submitted, so expect_awarded can tell. */
  awarded: boolean;
}

const asInt = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

const asStages = (v: unknown): StageKey[] => {
  const valid: StageKey[] = ["rfp", "rfq", "auction"];
  const arr = Array.isArray(v) ? v : [];
  return arr.map((s) => String(s).toLowerCase()).filter((s): s is StageKey => valid.includes(s as StageKey));
};

async function runStep(s: RunState, step: PlanStep): Promise<string | undefined> {
  const a = step.args ?? {};
  switch (step.step) {
    case "open_create": {
      const path = String(a.path ?? "erfx");
      await s.events.goto();
      await s.events.startCreate(path === "single-stage" ? "single-stage" : path === "boq" ? "boq" : "erfx");
      return `opened the ${path} create screen`;
    }
    case "compose_stages": {
      const stages = asStages(a.stages);
      if (!stages.length) throw new Error('compose_stages needs a "stages" array like ["rfq"]');
      await s.create.createProjectWithStages(stages);
      return `stages: ${stages.join(", ")}`;
    }
    case "set_title": {
      s.title = String(a.title ?? "") || generateEventTitle("UI_Plan");
      await s.create.setTitle(s.title);
      return s.title;
    }
    case "switch_stage": {
      const stage = asStages([a.stage])[0];
      if (!stage) throw new Error('switch_stage needs a "stage" of "rfp", "rfq" or "auction"');
      const label = { rfp: /technical stage/i, rfq: /\bRFQ\b/i, auction: /\bauction\b/i }[stage];
      await s.create.switchToStageTab(label);
      // Each stage carries its own template and sheet, so anything captured
      // from the previous tab is now wrong.
      s.widgets = {};
      return `on the ${stage} tab`;
    }
    case "select_template": {
      const chosen = await s.create.selectTemplate(a.name ? String(a.name) : undefined);
      // Later steps need the sheet schema, and it only comes from the template
      // response — so capture it here rather than re-deriving it.
      s.widgets = await s.create.selectFirstTemplateAndExtractWidgets().catch(() => ({}));
      return `template: ${chosen}`;
    }
    case "add_line_items": {
      const count = asInt(a.count, 1);
      s.products = a.search
        ? Array.from({ length: count }, (_, i) => ({ searchText: String(a.search), quantity: String((i + 1) * 10) }))
        : buildProducts(count);
      await s.create.addLineItems(s.products);
      s.lineItemsAdded = s.products.length;
      return `${s.products.length} line item(s)`;
    }
    case "fill_sheet": {
      if (!Object.keys(s.widgets).length) s.widgets = await s.create.selectFirstTemplateAndExtractWidgets();
      await s.create.fillSheet(s.widgets, s.lineItemsAdded || 1);
      return "sheet filled";
    }
    case "fill_questionnaires":
      await s.create.fillVendorAssessment();
      return "RFI sections filled";
    case "assign_evaluator": {
      const n = await s.create.assignEvaluatorToAllLineItems();
      if (!n) throw new Error("no evaluator could be assigned, and a technical stage cannot publish without one");
      return `${n} evaluator control(s)`;
    }
    case "set_schedule": {
      if (a.minutes) process.env.UI_SCHEDULE_MINUTES = String(asInt(a.minutes, 30));
      await s.create.saveSchedule();
      return a.minutes ? `schedule saved (${a.minutes} min)` : "schedule saved";
    }
    case "place_bid": {
      // The vendor bids for themselves, which means a SECOND browser context:
      // the buyer's session cannot be reused, and reusing it would quietly test
      // the buyer's view of the portal rather than the vendor's.
      const browser = s.page.context().browser();
      if (!browser) throw new Error("no browser available to open a vendor session");
      const vendorCtx = await browser.newContext();
      const vendorPage = await vendorCtx.newPage();
      try {
        const portal = new VendorPortalPage(vendorPage);
        await portal.goto();
        await portal.login();
        await portal.openEvent(s.title);
        await portal.startBidding(s.title);
        const cells = await portal.fillBid(Number(a.price ?? 100));
        await portal.submitBid();
        const ok = await portal.bidSubmitted();
        s.bidSubmitted = ok;
        if (!ok) throw new Error("the vendor portal did not confirm the quote as submitted");
        return `bid placed from the vendor portal (${cells} cell(s))`;
      } finally {
        await vendorCtx.close().catch(() => {});
      }
    }
    case "place_surrogate_bid": {
      const surrogate = new SurrogateBidPage(s.page);
      const who = await surrogate.addBidFor(
        a.vendor ? String(a.vendor) : undefined,
        Number(a.price ?? 100),
        s.surrogateBids,
      );
      s.surrogateBids.push(who);
      s.bidSubmitted = true;
      return `surrogate bid entered for ${who}`;
    }
    case "award_event": {
      const award = new AwardPage(s.page);
      await award.startAwarding();
      const allocated = await award.allocate(a.vendor ? String(a.vendor) : undefined);
      const outcome = await award.createAndSubmitProposal();
      s.awarded = true;
      return `awarded ${allocated.items} line item(s) to ${allocated.vendors} vendor(s) — ${outcome}`;
    }
    case "expect_awarded":
      expect(s.awarded, "nothing was awarded in this plan, so there is no award to confirm").toBe(true);
      return "the event is awarded";
    case "expect_bid_submitted":
      expect(s.bidSubmitted, "no bid has been placed in this plan, so there is nothing to confirm").toBe(true);
      return "the bid is submitted";
    case "invite_vendor": {
      const names = Array.isArray(a.vendors) ? (a.vendors as unknown[]).map(String) : vendorNames();
      const min = a.count !== undefined ? Number(a.count) : vendorCount();
      const invited = await s.create.inviteVendors({ names, count: min });
      const total = await s.create.participantCount();
      return invited.length ? `invited ${invited.join(", ")} (${total} total)` : `${total} participant(s)`;
    }
    case "publish":
      await s.create.publishAndAwaitOutcome(s.title);
      return `published as ${s.create.projectId()}`;
    case "save_draft":
      await s.create.saveAsDraft();
      return "saved as draft";

    // ── assertions ────────────────────────────────────────────────────────
    case "expect_line_items": {
      const want = asInt(a.count, s.lineItemsAdded || 1);
      const badge = await s.create.lineItemCountBadge();
      expect(badge, `the toolbar should show ${want} line item(s)`).toBe(want);
      return `badge shows ${badge}`;
    }
    case "expect_published": {
      const id = s.create.projectId();
      expect(id, "the browser should be on a published project page").toBeTruthy();
      return `project ${id}`;
    }
    case "expect_no_error": {
      const err = await s.create.errorToastText(1_500);
      expect(err, `the app should show no error (it said: ${err})`).toBeFalsy();
      return "no error shown";
    }
    case "expect_error": {
      const err = await s.create.errorToastText(5_000);
      expect(err, "the app was expected to refuse this").toBeTruthy();
      if (a.contains) expect(err ?? "").toContain(String(a.contains));
      return `app said: ${err}`;
    }
    case "expect_publish_blocked": {
      // Two shapes of "blocked" exist on this screen and a test should accept
      // either: the confirm button rendered but disabled, or the app refusing
      // outright with a message. Insisting on one makes the test brittle about
      // something it does not care about.
      const p = s.page;
      await s.create.dismissDistractions();
      await p.getByRole("button", { name: /^publish( event)?$/i }).first().click({ timeout: 10_000 }).catch(() => {});
      await p.waitForTimeout(2_000);
      const confirm = p
        .locator(".ant-modal-content, [role='dialog']")
        .getByRole("button", { name: /^publish|confirm|yes/i })
        .first();
      if (await confirm.count()) {
        const disabled = await confirm.isDisabled().catch(() => false);
        if (disabled) return "the confirm button is disabled, as expected";
      }
      const err = await s.create.errorToastText(6_000);
      expect(err, "publishing was expected to be blocked, but the app allowed it").toBeTruthy();
      if (a.because) expect(err ?? "").toContain(String(a.because));
      return `blocked: ${err}`;
    }
    case "expect_stages": {
      const want = asStages(a.stages);
      const have = await s.create.currentStages();
      expect(have.sort()).toEqual(want.sort());
      return `stages are ${have.join(", ")}`;
    }
    default:
      // validatePlan should have caught this long before now.
      throw new Error(`unknown step "${step.step}"`);
  }
}

export async function runPlan(page: Page, plan: TestPlan): Promise<PlanResult> {
  const s: RunState = {
    events: new EventsPage(page),
    create: new CreateEventPage(page),
    single: new SingleStagePage(page),
    page,
    title: generateEventTitle("UI_Plan"),
    widgets: {},
    products: [],
    lineItemsAdded: 0,
    bidSubmitted: false,
    surrogateBids: [],
    awarded: false,
  };

  console.log(`[plan] ${plan.title} — ${plan.steps.length} step(s)`);
  const results: StepResult[] = [];
  let failed = false;

  for (const [i, step] of plan.steps.entries()) {
    const started = Date.now();
    if (failed) {
      // Once a step fails the page is in an unknown state; running the rest
      // would produce failures that say nothing about the product.
      results.push({ step: step.step, args: step.args, status: "skipped", ms: 0 });
      continue;
    }
    try {
      const detail = await runStep(s, step);
      results.push({ step: step.step, args: step.args, status: "ok", detail, ms: Date.now() - started });
      console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ✓ ${detail ?? ""}`);
    } catch (err) {
      // Keep the first line AND the locator Playwright names in its call log.
      // Reporting only "locator.click: Timeout 15000ms exceeded" cost an
      // afternoon of grepping to find WHICH click; the call log says so
      // outright, and it is two lines.
      const message = err instanceof Error ? err.message : String(err);
      const first = message.split("\n")[0];
      const selector = message
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith("- waiting for") || l.startsWith("- locator"));
      const detail = selector ? `${first} — ${selector.replace(/^-\s*/, "")}` : first;
      results.push({ step: step.step, args: step.args, status: "failed", detail, ms: Date.now() - started });
      console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ✗ ${detail}`);
      failed = true;
    }
  }

  return { title: plan.title, steps: results, passed: !failed };
}
