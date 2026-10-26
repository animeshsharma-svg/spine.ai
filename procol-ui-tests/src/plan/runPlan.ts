import { Page, expect } from "@playwright/test";
import { EventsPage } from "../pages/EventsPage.js";
import { BasePage } from "../pages/BasePage.js";
import { VendorPortalPage } from "../pages/VendorPortalPage.js";
import { recordStuck } from "../oracle/stuck.js";
import { CounterOfferPage } from "../pages/CounterOfferPage.js";
import { SurrogateBidPage } from "../pages/SurrogateBidPage.js";
import { AwardPage } from "../pages/AwardPage.js";
import { eventGroupByTitle, ordersOfEventGroup, type DbOrder } from "../db/verifyRows.js";
import { decodeProcolId } from "../crosscheck/ids.js";
import { vendorNames, vendorCount } from "../master/params.js";
import { CreateEventPage, ProductInput, StageKey } from "../pages/CreateEventPage.js";
import { EventDetailPage } from "../pages/EventDetailPage.js";
import { SingleStagePage } from "../pages/SingleStagePage.js";
import { generateEventTitle } from "../helpers/data.js";
import { buildProducts } from "../master/params.js";
import { WidgetConfig } from "../helpers/inlineSheet.js";
import { PlanStep, TestPlan } from "./steps.js";
import { runGenericStep } from "./generic/run.js";
import { toastMark, appMessagesSince } from "./generic/messages.js";
import { appRuleFor, recoveryFor } from "../oracle/appRules.js";
import type { Target } from "./generic/find.js";
import { qaVendorNames, isQaVendorName, allowRealVendors } from "../db/qaVendors.js";
import { runExpectationStep } from "./expectations.js";
import { installObserver, observe, type Observation } from "./observe.js";
import { screenInventory } from "./inventory.js";
import { installSpotlight, beginStep, stepShots, spotlightVerify, spotlightMap, type SpotShot } from "./spotlight.js";
import { mkdirSync as mkdirInv, writeFileSync as writeInv } from "node:fs";
import { join as joinInv, dirname as dirnameInv } from "node:path";
import { fileURLToPath as fileUrlInv } from "node:url";
import { resolveScreen, type PlanContext } from "./screens.js";
import { CONFIG, NAV } from "../config.js";

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
  /** For generic steps: which locator strategy found the element (role+name, label, text, healer…). */
  strategy?: string;
  ms: number;
  /** What the person would have seen when this step failed or was recovered. */
  evidence?: {
    screenshot?: string;
    url?: string;
    /** the app's own words while the step ran (toasts, inline errors) */
    appSaid?: string[];
    /** the app rule those words come from, from its code (oracle/appRules.json) */
    rule?: { message: string; source: string; condition?: string };
  };
  /** The run broke one of the app's rules by its own setup, satisfied it, and retried. */
  recovered?: { appSaid: string; rule: string; why: string; did: string[] };
  /** The spotlight pictures taken during this step: each action framed, each assertion verified (spotlight.ts). */
  spotlights?: SpotShot[];
}

export interface PlanResult {
  title: string;
  steps: StepResult[];
  passed: boolean;
  /** The observation pass: what the runner saw on each screen it visited (observe.ts). */
  observations?: Observation[];
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
  /** purchase orders read back after create_po */
  orders?: DbOrder[];
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
  /** The template select_template applied, for expect_template_selected. */
  templateName?: string;
  /** Whether a counter offer went out in this plan, so the assertion can tell. */
  counterOfferSent?: boolean;
  /** Whether close_event ended the stage in this plan. */
  closed?: boolean;
  /** Whether the vendor accepted the counter offer in this plan. */
  counterOfferAccepted?: boolean;
  /** remember{} values for expect_remembered (generic steps). */
  memory: Record<string, { target: Target; text: string }>;
  /** Toast-journal marks: before the previous step, and before this one. */
  prevMark: number;
  curMark: number;
  /** The locator strategy the last generic step reported. */
  lastStrategy?: string;
  /** What the API built for this case, when its state was set up by API. */
  context: PlanContext;
  /** 1-based number of the step running now (evidence file names). */
  stepNo: number;
  /** The project id this plan published, so returning to it is a route, not a search. */
  projectId?: string;
  /** The app refused an EARLIER step (e.g. the configuration drawer would not save) — a later
   *  block assertion judges this refusal instead of a publish that can no longer be reached. */
  earlyRefusal?: string;
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


/**
 * Is the plan on the SINGLE-STAGE create screen?
 *
 * That screen has no stage tabs, no Manage Line Items drawer and no Items
 * badge: its type is chosen in a drawer, its template is the Buy template,
 * its line item is typed straight into the sheet, and its participants and
 * publish have their own controls. The same step names mean the same thing
 * to a person on either screen, so the executor dispatches them here rather
 * than making the compiler learn two vocabularies.
 */
function onSingleStage(s: RunState): boolean {
  const url = s.page.url();
  return /singleStage=true/i.test(url) && !/\/project\//.test(url);
}

/**
 * The single-stage create screen, recognised by what it shows ("Event Type" + the
 * "Select Templates" picker, no stage tab strip) as well as by its address — the
 * address alone missed it, and the eRFX steps then "succeeded" while doing nothing.
 */
async function isSingleStageScreen(s: RunState): Promise<boolean> {
  if (onSingleStage(s)) return true;
  const url = s.page.url();
  if (/\/project\//.test(url)) return false;
  // /orders/quick-create serves BOTH create screens, so the address proves nothing here.
  // By content: "Event Type" + "Publish Event", and NOT the eRFX screen's "Save as draft"
  // (both screens show a "Select Templates" picker, so that alone proves nothing).
  const eventType = await s.page.getByText(/^Event Type$/).first().isVisible().catch(() => false);
  const publishEvent = await s.page.getByRole("button", { name: /^publish event$/i }).first().isVisible().catch(() => false);
  const saveDraft = await s.page.getByRole("button", { name: /save as draft/i }).first().isVisible().catch(() => false);
  return eventType && publishEvent && !saveDraft;
}

/**
 * The Reschedule Event dialog (event Settings → "Reschedule Event", offered only while the
 * event is UPCOMING) — client-dashboard views/orderDetails/rescheduleEventModal.jsx:
 *   • "Make Order Live At" = an antd-3 DatePicker (format "Do MMM YYYY", days before today
 *     disabled) + TimePicker ("hh:mm a", 5-minute steps);
 *   • "Delivery Date" / "Pickup Date" picker only when the event has one;
 *   • the field's own help text is the refusal: "Scheduled time is invalid!" (in the past) or
 *     "Schedule time should be on or before Delivery Date"; Ok does nothing while it shows;
 *   • buttons are Cancel / Ok (there is no "Save Schedule" here — that is the create screen).
 * The new end keeps the round's length (end − start) — the API read-back checks that.
 */
const pad2 = (n: number) => String(n).padStart(2, "0");
const ordinal = (d: number) => `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayWords = (t: Date) => `${ordinal(t.getDate())} ${MONTHS.at(t.getMonth())} ${t.getFullYear()}`;
const timeWords = (t: Date) => `${pad2(t.getHours() % 12 || 12)}:${pad2(t.getMinutes())} ${t.getHours() < 12 ? "am" : "pm"}`;
/** "+2h", "-30m", "+1d", "now" → a time; minutes rounded UP to the picker's 5-minute step. */
function relTime(spec: unknown, base = new Date()): Date {
  const m = /^\s*(now)?\s*([+-])?\s*(\d+)?\s*(m|min|minutes?|h|hours?|d|days?)?\s*$/i.exec(String(spec ?? "+1h"));
  const t = new Date(base);
  if (m && m[3]) {
    const n = Number(m[3]) * (m[2] === "-" ? -1 : 1);
    const unit = (m[4] ?? "m").toLowerCase()[0];
    t.setTime(t.getTime() + n * (unit === "d" ? 864e5 : unit === "h" ? 36e5 : 6e4));
  }
  const step = 5 * 6e4;
  t.setTime(Math.ceil(t.getTime() / step) * step);
  return t;
}
/** "5th Oct 2026" + "02:11 pm" (the dialog's own formats) → a local time. */
function parseDialogTime(day: string, time: string): Date | null {
  const d = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})\s+(\d{4})$/.exec(day);
  const t = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(time);
  if (!d || !t) return null;
  const month = MONTHS.findIndex((m) => m.toLowerCase() === d[2].toLowerCase());
  if (month < 0) return null;
  let h = Number(t[1]) % 12;
  if (/pm/i.test(t[3] ?? "")) h += 12;
  if (!t[3]) h = Number(t[1]);
  return new Date(Number(d[3]), month, Number(d[1]), h, Number(t[2]), 0, 0);
}
async function rescheduleEvent(s: RunState, a: Record<string, unknown>): Promise<string> {
  const page = s.page;
  const dialog = page.locator(".ant-modal-content").filter({ hasText: /Reschedule Event/i }).filter({ visible: true }).first();
  const openDialog = async () => {
    // The Settings menu can fade shut between being read and being clicked (hover trigger),
    // so open it and click the item straight away, up to three times.
    let offered = "";
    for (let attempt = 1; attempt <= 3 && !(await dialog.isVisible().catch(() => false)); attempt++) {
      offered = (await runStep(s, { step: "open_event_settings" })) ?? "";
      if (!/Reschedule Event/i.test(offered)) throw new Error(`"Reschedule Event" is not in the Settings menu (${offered}) — it is offered only while the event is upcoming`);
      if (/Reschedule Event \(disabled\)/i.test(offered)) throw new Error(`"Reschedule Event" is disabled in the Settings menu (${offered})`);
      const item = page.locator(".ant-dropdown:not(.ant-dropdown-hidden) [role='menuitem']").filter({ hasText: /^\s*Reschedule Event\s*$/i }).filter({ visible: true }).first();
      const clicked = await item.click({ timeout: 3_000 }).then(() => true).catch(() => item.dispatchEvent("click", undefined, { timeout: 2_000 }).then(() => true).catch(() => false));
      if (clicked) await dialog.waitFor({ state: "visible", timeout: 8_000 }).catch(() => {});
      else await page.mouse.move(5, 5).catch(() => {});
    }
    if (!(await dialog.isVisible().catch(() => false))) throw new Error(`the Reschedule Event dialog did not open after three tries (${offered}) — not evidence about the product`);
    };
  if (!(await dialog.isVisible().catch(() => false))) await openDialog();
  if (process.env.UI_DUMP_DIALOG) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(process.env.UI_DUMP_DIALOG, (await dialog.evaluate((el) => el.outerHTML).catch(() => "")) || "");
  }
  const wantRefused = /^refus|^reject|^block/i.test(String(a.expect ?? ""));
  const notes: string[] = [];
  // The Settings dropdown fades out over the dialog and the modal zooms in, so a plain click
  // can lose to "another element intercepts pointer events"; retry, then click through.
  const clickInDialog = async (target: ReturnType<typeof dialog.locator>) => {
    try {
      await target.click({ timeout: 4_000 });
    } catch (e) {
      if (process.env.UI_DUMP_DIALOG) console.log(`[reschedule] plain click lost: ${String((e as Error).message).split("\n").filter((l) => /intercept|not visible|not stable|waiting/.test(l)).slice(0, 3).join(" | ")}`);
      await target.click({ timeout: 4_000, force: true });
    }
  };
  // NEVER Escape here: antd's Modal closes on Escape (and Cancel resets the fields). A click on
  // the dialog's own title is "outside" every picker popup, so it closes them and nothing else.
  const closePopups = async () => {
    await dialog.locator(".ant-modal-title").first().click({ timeout: 3_000 }).catch(() => {});
    await page.waitForTimeout(200);
  };
  const fieldHelp = async () => ((await dialog.locator(".ant-form-explain, .ant-form-item-explain").first().innerText().catch(() => "")) || "").trim();
  const openPopup = (sel: string) => page.locator(sel).filter({ visible: true }).last();

  // pick a calendar day by typing it into the open panel's own input (antd 3: the field
  // itself is read-only); a disabled day leaves the panel input marked invalid.
  const pickDay = async (picker: ReturnType<typeof dialog.locator>, when: Date): Promise<"ok" | "disabled"> => {
    await clickInDialog(picker.locator("input").first());
    const panelInput = openPopup(".ant-calendar-picker-container .ant-calendar-input");
    await panelInput.waitFor({ state: "visible", timeout: 8_000 });
    await panelInput.fill(dayWords(when));
    await page.waitForTimeout(150);
    const invalid = await page.locator(".ant-calendar-picker-container .ant-calendar-input-invalid, .ant-calendar-picker-container .ant-calendar-input.has-error").filter({ visible: true }).count().catch(() => 0);
    if (invalid) {
      await closePopups();
      return "disabled";
    }
    await panelInput.press("Enter").catch(() => {});
    await page.locator(".ant-calendar-picker-container").filter({ visible: true }).first().waitFor({ state: "hidden", timeout: 3_000 }).catch(closePopups);
    // read the field back: a pick that did not commit must not be reported as set
    const shown = ((await picker.locator("input").first().inputValue().catch(() => "")) || "").trim();
    if (shown !== dayWords(when)) throw new Error(`the date picker shows “${shown}” after picking ${dayWords(when)} — the pick did not commit (not evidence about the product)`);
    return "ok";
  };

  if (a.start !== undefined && a.start !== null && a.start !== "") {
    // fields by their LABEL: the start field's own error text names "Delivery Date", so a
    // text match on the whole form item picks the wrong field
    const live = dialog.locator(".ant-form-item").filter({ has: page.locator("label", { hasText: /^\s*Make Order Live At\s*$/i }) }).first();
    // "S+2h" = two hours after the event's CURRENT start, read from the dialog's own fields
    let base = new Date();
    const fromStart = /^\s*S\b/i.test(String(a.start));
    if (fromStart) {
      const day = ((await live.locator(".ant-calendar-picker-input").first().inputValue().catch(() => "")) || "").trim();
      const time = ((await live.locator(".ant-time-picker-input").first().inputValue().catch(() => "")) || "").trim();
      const cur = parseDialogTime(day, time);
      if (!cur) throw new Error(`could not read the event's current start from the dialog (“${day}” “${time}”)`);
      base = cur;
      notes.push(`current start ${day} ${time}`);
    }
    const when = relTime(fromStart ? String(a.start).replace(/^\s*S/i, "") || "+0m" : a.start, base);
    const dayResult = await pickDay(live.locator(".ant-calendar-picker").first(), when);
    if (dayResult === "disabled") {
      notes.push(`the calendar does not allow ${dayWords(when)} (that day is disabled)`);
    } else {
      await clickInDialog(live.locator(".ant-time-picker-input").first());
      const tInput = openPopup(".ant-time-picker-panel .ant-time-picker-panel-input");
      await tInput.waitFor({ state: "visible", timeout: 8_000 });
      await tInput.fill(timeWords(when));
      await page.waitForTimeout(150);
      await closePopups();
      const shown = ((await live.locator(".ant-time-picker-input").first().inputValue().catch(() => "")) || "").trim().toLowerCase();
      if (shown && shown !== timeWords(when)) notes.push(`the time picker shows ${shown}, not ${timeWords(when)}`);
      notes.push(`start set to ${dayWords(when)} ${timeWords(when)}`);
    }
  }
  if (a.delivery !== undefined && a.delivery !== null && a.delivery !== "") {
    const del = dialog.locator(".ant-form-item").filter({ has: page.locator("label", { hasText: /^\s*(Delivery|Pickup) Date\s*$/i }) }).first();
    if (!(await del.count().catch(() => 0))) throw new Error("this event's Reschedule dialog has no Delivery / Pickup Date field (the event has no delivery date)");
    const when = relTime(a.delivery);
    const r = await pickDay(del.locator(".ant-calendar-picker").first(), when);
    notes.push(r === "disabled" ? `the calendar does not allow delivery on ${dayWords(when)} (that day is disabled)` : `delivery set to ${dayWords(when)}`);
  }

  await page.waitForTimeout(400); // antd fades an outdated help line out — read it after the fade
  const before = await fieldHelp();
  const disabledDay = notes.some((n) => /is disabled/.test(n));
  let saveCall = "";
  let sentBody: any = null;
  if (a.confirm !== false && !disabledDay) {
    // the save is the event's edit call (editOrder → PATCH /trade/:id…); record its answer so a
    // dialog that stays open can be told apart: the field's own rule vs the server refusing
    const saved = page
      .waitForResponse((r) => ["PATCH", "PUT"].includes(r.request().method()) && /\/trade\//.test(r.url()), { timeout: 12_000 })
      .then(async (r) => {
        let msg = "";
        try {
          const j: any = await r.json();
          msg = String(j?.message ?? j?.error?.message ?? j?.detail ?? "").slice(0, 160);
        } catch {
          /* not json */
        }
        try {
          sentBody = r.request().postDataJSON();
        } catch {
          /* not json */
        }
        return `${r.request().method()} ${new URL(r.url()).pathname} → HTTP ${r.status()}${msg ? ` “${msg}”` : ""}`;
      })
      .catch(() => "");
    if (process.env.UI_DUMP_DIALOG) console.log(`[reschedule] before Ok: ${notes.join("; ")} | help “${before}”`);
    await clickInDialog(dialog.getByRole("button", { name: /^\s*ok\s*$/i }).first());
    await dialog.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
    saveCall = before ? "" : await saved; // with a field error showing, Ok sends nothing
    // a slow save closes the dialog only after its reply (and a re-fetch) — give it that long
    if (/HTTP 2\d\d/.test(saveCall)) await dialog.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  }
  const closed = !(await dialog.isVisible().catch(() => false));
  const help = closed ? "" : (await fieldHelp()) || before;
  const serverRefused = /HTTP [45]\d\d/.test(saveCall);
  if (saveCall) notes.push(`save call ${saveCall}`);
  // What the save SENT, against the window the API built: the round keeps its length and the
  // closing grace shifts with it (rescheduleEventModal: newEnd = newStart + (end − start)).
  const shape: string[] = [];
  if (sentBody && typeof sentBody === "object") {
    const [bst, bet, ect] = [Number(sentBody.bid_start_time), Number(sentBody.bid_end_time), Number(sentBody.extra_closing_time)];
    const was = s.context?.values ?? {};
    if (bst && bet) {
      const len = bet - bst;
      notes.push(`sent a ${Math.round(len / 60)}-minute round`);
      if (was.roundSeconds && Number(was.roundSeconds) !== len) shape.push(`the round was ${Math.round(Number(was.roundSeconds) / 60)} min and the save sent ${Math.round(len / 60)} min`);
    }
    if (bet && ect && was.extraSeconds && Number(was.extraSeconds) !== ect - bet) shape.push(`the closing grace was ${was.extraSeconds}s and the save sent ${ect - bet}s`);
  }
  const refused = disabledDay || (!closed && !!help) || serverRefused;
  // Read back: the screen re-fetches the event after a save — reopen the dialog and read the
  // start it now holds (the same fields a buyer sees), then close it untouched.
  let readBack = "";
  if (closed && !refused && saveCall && a.start && a.readBack !== false) {
    await page.waitForTimeout(800);
    await openDialog();
    const live2 = dialog.locator(".ant-form-item").filter({ has: page.locator("label", { hasText: /^\s*Make Order Live At\s*$/i }) }).first();
    const day = ((await live2.locator(".ant-calendar-picker-input").first().inputValue().catch(() => "")) || "").trim();
    const time = ((await live2.locator(".ant-time-picker-input").first().inputValue().catch(() => "")) || "").trim().toLowerCase();
    readBack = `${day} ${time}`;
    await dialog.getByRole("button", { name: /^\s*cancel\s*$/i }).first().click({ timeout: 5_000 }).catch(() => {});
    await dialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
    const want = notes.find((n) => n.startsWith("start set to "))?.replace("start set to ", "");
    notes.push(`reopened: the event now starts ${readBack}`);
    if (want && readBack !== want) {
      // the screen shows server times shifted by localStorage.timeDiff (= browser clock − server
      // clock, user/actions.js fetchTimeDiff) but the dialog SENDS the picked browser time
      // unshifted, so a picked start comes back moved by that clock gap
      const diff = await page.evaluate(() => window.localStorage.getItem("timeDiff")).catch(() => null);
      const sent = Number(sentBody?.bid_start_time);
      const sentWords = sent ? new Date(sent * 1000).toTimeString().slice(0, 8) : "?";
      shape.push(`after saving ${want} the event shows ${readBack} — the save sent bid_start_time ${sent || "?"} (${sentWords} browser time) and the screen adds the app's clock offset timeDiff=${diff ?? "?"}s when it shows it`);
    }
  }
  const seen = `${notes.join("; ")}${notes.length ? " — " : ""}${refused ? `refused${help ? `: “${help}”` : ""}` : closed ? "the dialog closed with no error (saved)" : "the dialog stayed open with no message"}`;
  if (refused || !closed) {
    // tidy: leave no half-filled dialog over the next step
    await dialog.getByRole("button", { name: /^\s*cancel\s*$/i }).first().click({ timeout: 5_000 }).catch(() => {});
  }
  if (a.message && refused && !help.toLowerCase().includes(String(a.message).toLowerCase()) && !disabledDay) {
    throw new Error(`the dialog refused, but its message reads “${help}”, not “${a.message}” — ${seen}`);
  }
  if (a.keepsLength !== false && shape.length) expect(shape, `reschedule did not keep what was picked: ${shape.join("; ")} — ${seen}`).toEqual([]);
  if (wantRefused) expect(refused, `reschedule should be refused — ${seen}`).toBe(true);
  else if (a.expect !== undefined || a.confirm !== false) expect(refused || !closed, `reschedule should save — ${seen}`).toBe(false);
  return seen;
}

async function runStep(s: RunState, step: PlanStep): Promise<string | undefined> {
  const a = step.args ?? {};
  // Generic read/verify/navigate/act steps (generic/run.ts). `attempt` runs
  // its inner step back through this function, so a domain step can be tried
  // as a negative ("attempt publish") with the same healed code.
  const expectation = await runExpectationStep({ page: s.page, context: s.context, prevMark: s.prevMark, stepNo: s.stepNo }, step);
  if (expectation !== null) return expectation;
  const generic = await runGenericStep(s, step, (inner) => runStep(s, inner));
  if (generic) {
    s.lastStrategy = generic.strategy;
    return generic.detail;
  }
  switch (step.step) {
    case "open_events_list": {
      await s.events.goto();
      return "opened the events list";
    }
    case "expect_events_list": {
      await s.events.expectListReady();
      return "the events list rendered";
    }
    case "filter_events": {
      const tab = String(a.tab ?? "Live");
      if (!/\/orders/.test(s.page.url())) await s.events.goto();
      const active = await s.events.openTab(tab);
      return `events list on the "${active}" tab`;
    }
    case "expect_event_in_list": {
      const title = String(a.title ?? s.title ?? "");
      if (!title) throw new Error("expect_event_in_list needs a title, and this plan has not created an event to look for");
      if (!/\/orders/.test(s.page.url())) await s.events.goto();
      // The list's search can lag behind an event made a moment ago: search
      // again, bounded (3 tries, 20 s apart), before saying it is not there.
      for (let attempt = 1; attempt <= 3; attempt++) {
        await s.events.searchByTitle(title);
        if (await s.events.hasEventMatching(title)) return `"${title}" is in the list${attempt > 1 ? ` (found on search ${attempt})` : ""}`;
        if (attempt < 3) {
          await s.page.waitForTimeout(20_000);
          await s.events.goto();
        }
      }
      throw new Error(`no event titled "${title}" in the list after searching for it three times over 40 s`);
    }
    case "expect_event_status": {
      const status = String(a.status ?? "").trim();
      if (!status) throw new Error('expect_event_status needs a "status" to look for');
      const title = String(a.title ?? s.title ?? "");
      if (!title) throw new Error("expect_event_status needs a title, and this plan has not created an event to look for");
      if (!/\/orders/.test(s.page.url())) await s.events.goto();
      await s.events.searchByTitle(title);
      const row = await s.events.rowTextFor(title);
      if (!row) throw new Error(`no row titled "${title}" in the list after searching for it`);
      if (!row.toLowerCase().includes(status.toLowerCase())) {
        throw new Error(`the row for "${title}" reads: ${row.slice(0, 200)} — no "${status}" in it`);
      }
      return `"${title}" shows "${status}"`;
    }
    case "expect_template_selected": {
      const shown = await s.create.appliedTemplateName();
      if (shown === null) throw new Error("the stage still offers 'Select Templates' — no template is applied");
      const want = a.name ? String(a.name) : s.templateName;
      if (want && !shown.toLowerCase().includes(want.toLowerCase()) && !/name not displayed/.test(shown)) {
        throw new Error(`the stage shows template "${shown}", not "${want}"`);
      }
      return `template applied: ${shown}`;
    }
    case "expect_sheet_columns": {
      const keys = await s.create.sheetHeaderKeys();
      if (!keys.length) throw new Error("no pricing-sheet header has rendered — the template's schema is not on screen");
      const want = Array.isArray(a.columns) ? a.columns.map(String) : [];
      const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const missing = want.filter((w) => !keys.some((k) => norm(k).includes(norm(w))));
      if (missing.length) throw new Error(`sheet columns are [${keys.join(", ")}] — missing: ${missing.join(", ")}`);
      return `sheet columns: ${keys.join(", ")}`;
    }
    case "open_add_stage_menu": {
      const m = await s.create.openAddStageMenu();
      return `add-stage menu: ${m.buttonDisabled ? "the + button is disabled" : `offers ${m.items.join(", ") || "(nothing)"}`}${m.tooltip ? `; tooltip “${m.tooltip}”` : ""}`;
    }
    case "expect_sheet_cells": {
      const grid = s.page.locator(".data-grid-container table").filter({ visible: true }).first();
      if (!(await grid.count().catch(() => 0))) throw new Error("no sheet (data grid) on this screen (not evidence about the product)");
      const rows = grid.locator("tr");
      const headerCells = rows.nth(0).locator("td, th");
      const heads = (await headerCells.allInnerTexts().catch(() => [] as string[])).map((h) => h.replace(/\*/g, "").replace(/\s+/g, " ").trim().toLowerCase());
      const rowNo = Math.max(1, Number(a.row) || 1);
      if ((await rows.count()) <= rowNo) throw new Error(`the sheet has no data row ${rowNo} (not evidence about the product)`);
      const colOf = (name: string) => {
        // header text or the widget key ("delivery_location" → "delivery location")
        const n = name.replace(/\*/g, "").replace(/_/g, " ").trim().toLowerCase();
        let i = heads.findIndex((h) => h === n);
        if (i < 0) i = heads.findIndex((h) => h.startsWith(n) || h.includes(n));
        return i;
      };
      const problems: string[] = [];
      const seen: string[] = [];
      const seenDetail: string[] = [];
      const check = async (names: unknown, wantReadonly: boolean) => {
        for (const name of (Array.isArray(names) ? names : []) as string[]) {
          const i = colOf(String(name));
          if (i < 0) {
            problems.push(`no "${name}" column (columns: ${heads.filter(Boolean).join(", ")})`);
            continue;
          }
          // Procol's sheet marks locked cells with its own CSS-module classes
          // (_cellReadOnly_…, _cellCreationReadOnly_…), seen on the live grid; the grid
          // library's "read-only" class is matched too. Reading the class changes nothing.
          const td = rows.nth(rowNo).locator("td").nth(i);
          const cls = (await td.getAttribute("class").catch(() => "")) ?? "";
          const ro = /read-?only/i.test(cls);
          seenDetail.push(`${name}: ${ro ? "read-only" : "editable"}`);
          seen.push(`${name} ${ro ? "read-only" : "editable"}`);
          if (ro !== wantReadonly) problems.push(`"${name}" is ${ro ? "READ-ONLY" : "EDITABLE"}, expected ${wantReadonly ? "read-only" : "editable"}`);
        }
      };
      await check(a.readonly, true);
      await check(a.editable, false);
      if (!seen.length && !problems.length) throw new Error('expect_sheet_cells needs "readonly" and/or "editable" column names');
      console.log(`[sheet] row ${rowNo}: ${seenDetail.join(" | ")}`);
      if (problems.length) throw new Error(`sheet row ${rowNo}: ${problems.join("; ")} — seen: ${seenDetail.join(" | ").slice(0, 700)}`);
      return `sheet row ${rowNo}: ${seen.join(", ")}`;
    }
    case "open_event_settings": {
      // The gear (event-settings-button) sits in a STAGE page's header; the project overview only
      // has a "⋮". Open the first stage tab when the gear is not on screen, then fall back to "⋮".
      let gear = s.page.getByTestId("event-settings-button").filter({ visible: true }).first();
      if (!(await gear.count().catch(() => 0))) {
        const tab = s.page.getByRole("tab", { name: /^(rfq|auction|rfp|technical stage|rfi)\b/i }).first();
        if (await tab.isVisible().catch(() => false)) {
          await tab.click({ timeout: 8_000 }).catch(() => {});
          await gear.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
        }
      }
      if (!(await gear.count().catch(() => 0))) gear = s.page.locator("button:has(.anticon-more)").filter({ visible: true }).first();
      if (!(await gear.count().catch(() => 0))) throw new Error("no Settings (gear) or ⋮ menu on this event (not evidence about the product)");
      const menu = s.page.locator(".ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu").filter({ visible: true }).last();
      // The menu opens on click on some event pages and on HOVER on others (antd trigger), and a
      // click on a hover menu can toggle it shut again; try click, then hover, then click again.
      for (const how of ["click", "hover", "click"] as const) {
        if (how === "click") await gear.click({ timeout: 10_000 });
        else await gear.hover({ timeout: 5_000 }).catch(() => {});
        if (await menu.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) break;
      }
      const rows = menu.locator("[role='menuitem']");
      const n = await rows.count().catch(() => 0);
      const items: string[] = [];
      for (let i = 0; i < n; i++) {
        const r = rows.nth(i);
        const text = ((await r.innerText().catch(() => "")) || "").trim();
        if (!text) continue;
        const off = (await r.getAttribute("aria-disabled").catch(() => null)) === "true" || /disabled/.test((await r.getAttribute("class").catch(() => "")) ?? "");
        items.push(off ? `${text} (disabled)` : text);
      }
      if (!items.length) throw new Error("the Settings menu did not open (not evidence about the product)");
      return `event settings offer: ${items.join(", ")}`;
    }
    case "reschedule_event":
      return rescheduleEvent(s, a);
    case "expect_add_stage_options": {
      const m = await s.create.openAddStageMenu();
      const norm = (x: string) => x.toLowerCase().replace(/[^a-z]+/g, " ").trim();
      const have = m.items.map(norm);
      const problems: string[] = [];
      if (a.disabled === true && !m.buttonDisabled) problems.push(`the "+" is enabled (offers ${m.items.join(", ") || "nothing"})`);
      if (a.disabled === false && m.buttonDisabled) problems.push('the "+" is disabled');
      for (const want of (Array.isArray(a.offers) ? a.offers : []) as string[]) if (!have.some((h) => h.includes(norm(want)))) problems.push(`"${want}" is not offered`);
      for (const no of (Array.isArray(a.absent) ? a.absent : []) as string[]) if (have.some((h) => h.includes(norm(no)))) problems.push(`"${no}" IS offered`);
      if (a.reason && !norm(m.tooltip).includes(norm(String(a.reason)))) problems.push(`the "+" tooltip reads "${m.tooltip || "(none)"}", not "${a.reason}"`);
      const seen = `${m.buttonDisabled ? "the + is disabled" : `offers ${m.items.join(", ") || "nothing"}`}${m.tooltip ? `; tooltip “${m.tooltip}”` : ""}`;
      expect(problems, `add-stage menu: ${seen}`).toEqual([]);
      return `add-stage menu as expected: ${seen}`;
    }
    case "open_stage_menu": {
      const stage = a.stage ? asStages([a.stage])[0] : undefined;
      const items = await s.create.openStageMenuFor(stage);
      return `stage menu open: ${items.map((i) => `${i.label}${i.disabled ? " (disabled)" : ""}`).join(", ") || "(no items)"}`;
    }
    case "expect_disabled":
    case "expect_enabled": {
      const control = String(a.control ?? a.label ?? a.name ?? a.text ?? "").trim();
      if (!control) throw new Error(`${step.step} needs a "control" — the visible text of the button, menu item or tab`);
      const want = new RegExp(control.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      // Some controls are named by their CONTENT, not their purpose: the
      // schedule chip reads "Now - 03:27 pm, 11th Sep (30 Mins)" and the Items
      // button "Items 0". A person calls them "the schedule" and "Items";
      // resolve those names to the controls they mean before matching text.
      const alias: Array<[RegExp, () => import("@playwright/test").Locator]> = [
        [/^schedule|bid window|time ?window$/i, () => s.page.locator("button:has(.anticon-clock-circle), button:has-text('Mins'), button:has-text(' - ')").filter({ hasText: /\d{1,2}:\d{2}|Mins|Hour|Day/i }).first()],
        [/^items?$|line items?/i, () => s.page.getByRole("button", { name: /items\s*\d+/i }).first()],
        [/^publish$/i, () => s.page.getByRole("button", { name: /^publish$/i }).first()],
      ];
      const aliased = alias.find(([re]) => re.test(control));
      const candidates = [
        ...(aliased ? [aliased[1]()] : []),
        s.page.getByRole("button", { name: want }),
        s.page.getByRole("menuitem", { name: want }),
        s.page.getByRole("tab", { name: want }),
        s.page.locator("button, [role='button'], [role='menuitem'], .ant-dropdown-menu-item, .ant-btn").filter({ hasText: want }),
      ];
      let el = null as import("@playwright/test").Locator | null;
      for (const c of candidates) {
        if ((await c.count()) > 0) {
          el = c.first();
          break;
        }
      }
      if (!el) throw new Error(`no control reading "${control}" is on this screen`);
      const disabled =
        (await el.isDisabled().catch(() => false)) ||
        (await el.getAttribute("aria-disabled")) === "true" ||
        /\b(ant-btn-disabled|ant-dropdown-menu-item-disabled|ant-tabs-tab-disabled|disabled)\b/.test((await el.getAttribute("class")) ?? "");
      if (step.step === "expect_disabled" && !disabled) throw new Error(`"${control}" is ENABLED — the case expects it disabled here`);
      if (step.step === "expect_enabled" && disabled) throw new Error(`"${control}" is DISABLED — the case expects it enabled here`);
      return `"${control}" is ${disabled ? "disabled" : "enabled"}, as expected`;
    }
    case "expect_create_options": {
      const want = Array.isArray(a.options) ? a.options.map(String) : [];
      const absent = Array.isArray(a.absent) ? a.absent.map(String) : [];
      // The menu lives on the list; go there if the plan has not already.
      if (!/\/orders\/?(\?|$)/.test(new URL(s.page.url()).pathname + new URL(s.page.url()).search)) await s.events.goto();
      const offered = await s.events.readCreateMenu();
      // "single-stage", "Single Stage" and "singlestage" are the same option
      // to a person; punctuation and spacing must not decide a verdict.
      const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const has = (t: string) => offered.some((o) => norm(o).includes(norm(t)));
      const missing = want.filter((t) => !has(t));
      const present = absent.filter((t) => has(t));
      if (missing.length || present.length) {
        throw new Error(
          `the Create Event menu offers [${offered.join(", ")}]` +
            (missing.length ? ` — missing: ${missing.join(", ")}` : "") +
            (present.length ? ` — should not offer: ${present.join(", ")}` : ""),
        );
      }
      return `the menu offers ${offered.length ? offered.join(", ") : "no menu (direct create)"}`;
    }
    case "expect_url_contains": {
      const text = String(a.text ?? a.contains ?? "");
      if (!text) throw new Error('expect_url_contains needs a "text"');
      const url = s.page.url();
      if (!url.includes(text)) throw new Error(`URL is ${url} — does not contain "${text}"`);
      return `URL contains "${text}"`;
    }
    case "place_counter_offer": {
      if (!/\/project\//.test(s.page.url())) throw new Error("place_counter_offer needs the published event's page with Master QCS open — publish, take a bid, open_master_qcs first");
      // No price named: counter just under the vendor's bid the API placed (95 %, 2 dp).
      const bid = Number(s.context.values?.bidPrice);
      const price = a.price !== undefined ? Number(a.price) : Number.isFinite(bid) && bid > 0 ? Math.round(bid * 95) / 100 : NaN;
      if (!Number.isFinite(price) || price <= 0) throw new Error('place_counter_offer needs a positive "price"');
      const co = new CounterOfferPage(s.page);
      const detail = await co.sendCounterOffer({ vendor: a.vendor ? String(a.vendor) : undefined, price, remark: a.remark ? String(a.remark) : undefined });
      s.counterOfferSent = true;
      return detail;
    }
    case "expect_counter_offer_sent": {
      if (!s.counterOfferSent) throw new Error("no counter offer was sent in this plan — expect_counter_offer_sent needs place_counter_offer before it");
      const co = new CounterOfferPage(s.page);
      const marked = await co.counterOfferVisibleFor(a.vendor ? String(a.vendor) : undefined);
      if (!marked) throw new Error("the counter offer was sent, but the grid shows no counter-offer mark on the bid yet");
      return "the grid marks the bid with a counter offer";
    }
    case "close_event": {
      if (!/\/project\//.test(s.page.url())) throw new Error("close_event needs a published event's page — publish and expect_published (or open_event) first");
      const detail = new EventDetailPage(s.page);
      let done = await detail.forceEnd(a.remark ? String(a.remark) : undefined);
      if (/waiting for the window to lapse/.test(done)) {
        // The smallest duration preset is well above a few minutes; wait long
        // enough for it (the step refuses up front if the row says longer).
        // The product's smallest duration preset is 30 minutes (30 Mins · 1 Hrs
        // · 4 Hrs · 1 Days, captured 2026-09-11), so a closed event on a tenant
        // without force-end costs a real half-hour. Budget for it.
        done = `${done}; ${await detail.waitForWindowToLapse(s.title, asInt(a.maxWaitMinutes, 36))}`;
      }
      s.closed = true;
      return `event closed: ${done}`;
    }
    case "open_event": {
      // The event the API built for this case is opened by its route, not by
      // searching the list: a search is the subject of list cases only, and the
      // list's search lagged behind fresh events (the lookups that failed).
      if (!a.id && !a.title && s.context.eventGroupUuid) {
        const { path } = resolveScreen("summary", s.context);
        await s.page.goto(`${CONFIG.appUrl.replace(/\/$/, "")}${path}`, NAV);
        await s.events.dismissDistractions().catch(() => false);
        return `opened the prepared event "${s.context.title ?? s.context.eventGroupUuid}" by its route`;
      }
      // This plan's own published event: back by its project id, not a list search.
      const own = !a.id && (!a.title || String(a.title) === s.title) && s.projectId ? s.projectId : undefined;
      const id = a.id ? String(a.id) : own;
      const title = a.title && !own ? String(a.title) : id ? undefined : s.title;
      if (!id && !title) throw new Error("open_event needs an id or a title, and this plan has not created an event to return to");
      const where = await s.events.openEvent({ id, title });
      if (title && !s.title) s.title = title;
      return `opened ${id ? `event ${id}` : `"${title}"`} at ${where}`;
    }
    case "accept_counter_offer": {
      if (!s.counterOfferSent) throw new Error("no counter offer was sent in this plan — accept_counter_offer needs place_counter_offer before it");
      const browser = s.page.context().browser();
      if (!browser) throw new Error("no browser available to open a vendor session");
      const vendorCtx = await browser.newContext();
      const vendorPage = await vendorCtx.newPage();
      try {
        const portal = new VendorPortalPage(vendorPage);
        // Only a QA test vendor (qa_…@example.com) is ever signed in as — the
        // profile's default vendor can be a real supplier.
        if (!/^qa_[a-z0-9_.-]+@example\.(com|org|net)$/i.test(CONFIG.vendorEmail) && !allowRealVendors())
          throw new Error("place_bid needs a QA test vendor identity (qa_…@example.com) — automation needs update: the runner did not hand one over");
        await portal.goto();
        await portal.login();
        await portal.openEvent(s.title);
        const detail = await portal.acceptCounterOffer(s.title);
        s.counterOfferAccepted = true;
        return detail;
      } finally {
        await vendorCtx.close().catch(() => {});
      }
    }
    case "expect_counter_offer_accepted": {
      if (!s.counterOfferAccepted) throw new Error("no counter offer was accepted in this plan — expect_counter_offer_accepted needs accept_counter_offer before it");
      // Back on the buyer's page, the Responses grid should now carry the mark.
      const co = new CounterOfferPage(s.page);
      await s.page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      const res = await co.counterOfferStatusFor(a.vendor ? String(a.vendor) : undefined, /accept/i, 60_000);
      if (!res.ok) throw new Error(`the buyer's grid does not yet mark the counter offer as accepted — the vendor header reads: ${res.text}`);
      return "the buyer's grid marks the counter offer as accepted";
    }
    case "inventory_screen": {
      // Every control the screen shows, with the screenshot and accessibility tree beside it —
      // the input for writing test cases from a screen (prototype/src/agents/screenCases.ts).
      const label = String(a.label ?? "screen").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "screen";
      await s.page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      const busy = s.page.locator(".ant-skeleton, .ant-spin-spinning").first();
      for (const until = Date.now() + 20_000; Date.now() < until && (await busy.isVisible().catch(() => false)); ) await s.page.waitForTimeout(250);
      const o = await observe(s.page, s.stepNo, `inventory-${label}`, { force: true }).catch(() => null);
      const inv = await screenInventory(s.page);
      const map = await spotlightMap(s.page, label, inv.controls).catch(() => null);
      const fallbackDir = joinInv(dirnameInv(fileUrlInv(import.meta.url)), "..", "..", "evidence", "inventories");
      const file = o?.screenshot ? o.screenshot.replace(/\.png$/, ".inventory.json") : joinInv(fallbackDir, `${label}-${Date.now()}.inventory.json`);
      mkdirInv(dirnameInv(file), { recursive: true });
      writeInv(file, JSON.stringify({ label, context: s.context?.state ?? "none", screenshot: o?.screenshot ?? null, map, aria: o?.snapshot ?? null, runId: process.env.QA_RUN_ID ?? null, stepNo: s.stepNo, ...inv }, null, 2));
      console.log(`[inventory] ${file}`);
      const by = inv.controls.reduce<Record<string, number>>((m, c) => ((m[c.kind] = (m[c.kind] ?? 0) + 1), m), {});
      return `inventory of "${label}" at ${inv.path}: ${inv.controls.length} controls (${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(", ")})`;
    }
    case "capture_screen": {
      const label = String(a.label ?? "capture").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "capture";
      // A capture of a page still drawing its skeleton documents nothing — wait (≤20 s) for the
      // loaders to go, as a person would before looking.
      await s.page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      const loading = s.page.locator(".ant-skeleton, .ant-spin-spinning").first();
      const until = Date.now() + 20_000;
      while (Date.now() < until && (await loading.isVisible().catch(() => false))) await s.page.waitForTimeout(250);
      // Reuse the stuck-report writer: same screenshot + tree, same panel on
      // the dashboard, but marked as requested rather than as a failure.
      await recordStuck(s.page, {
        label: `capture:${label}`,
        message: "captured on request by the plan — not a failure",
        triedCandidates: [],
        healerTried: false,
      });
      const buttons = (await s.page.getByRole("button").allTextContents()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
      const tabs = (await s.page.getByRole("tab").allTextContents()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
      return `captured "${label}" at ${new URL(s.page.url()).pathname} — tabs: ${tabs.slice(0, 8).join(" | ") || "none"}; buttons: ${buttons.slice(0, 14).join(" | ")}`;
    }
    case "open_participants": {
      if (!/\/project\//.test(s.page.url())) throw new Error("open_participants needs a published event's project page — publish and expect_published first");
      const sur = new SurrogateBidPage(s.page);
      await sur.openParticipants();
      const biddable = await sur.biddableVendors().catch(() => [] as string[]);
      return `participants list open — ${biddable.length} row(s) offer Add Bid${biddable.length ? `: ${biddable.slice(0, 5).join(", ")}` : " on this page"}`;
    }
    case "open_master_qcs": {
      if (!/\/project\//.test(s.page.url())) throw new Error("open_master_qcs needs a published event's project page — publish and expect_published first");
      const award = new AwardPage(s.page);
      await award.openMasterQcs();
      const grid = s.page.locator(".rdg, .rdg-cell, [role='grid'], .data-grid-container").first();
      await grid.waitFor({ state: "visible", timeout: 30_000 });
      const text = ((await s.page.locator(".rdg, [role='grid'], .data-grid-container").first().innerText().catch(() => "")) || "").replace(/\s+/g, " ");
      const want = Array.isArray(a.vendors) ? a.vendors.map(String) : [];
      const missing = want.filter((v) => !text.toLowerCase().includes(v.toLowerCase()));
      if (missing.length) throw new Error(`the comparison grid rendered but does not list: ${missing.join(", ")}`);
      return `Master QCS grid rendered${want.length ? ` with ${want.join(", ")}` : ""}`;
    }
    case "configure_single_stage": {
      const eventType = String(a.eventType ?? "rfq").toLowerCase();
      if (!["rfq", "rfp", "auction"].includes(eventType)) throw new Error(`configure_single_stage: eventType must be rfq, rfp or auction (got "${eventType}")`);
      const sub = a.auctionSubtype ? String(a.auctionSubtype).toLowerCase().replace(/[\s-]+/g, "_") : undefined;
      if (sub && !["rank", "price", "traffic_light"].includes(sub)) throw new Error(`configure_single_stage: auctionSubtype must be rank, price or traffic_light (got "${sub}")`);
      const awarding = a.awarding ? (/line/i.test(String(a.awarding)) ? "line_item" : "lot") : undefined;
      if (!/singleStage=true|single-stage/.test(s.page.url())) {
        throw new Error("configure_single_stage needs the single-stage create screen — use open_create with path \"single-stage\" first");
      }
      await s.single.configure({
        eventType: eventType as any,
        auctionSubtype: sub as any,
        awarding: awarding as any,
        rangeLower: a.rangeLower !== undefined ? Number(a.rangeLower) : undefined,
        rangeUpper: a.rangeUpper !== undefined ? Number(a.rangeUpper) : undefined,
      });
      return `single-stage configured: ${eventType}${sub ? ` · ${sub.replace("_", " ")}` : ""}${awarding ? ` · award ${awarding.replace("_", " ")}` : ""}`;
    }
    case "create_new_version": {
      if (!/\/project\//.test(s.page.url())) throw new Error("create_new_version needs a published event's project page — publish and expect_published (or open_event) first");
      const v = await new EventDetailPage(s.page).createNewVersion();
      // The copy is a new draft on the same create screen: what the plan does next edits IT.
      s.create = new CreateEventPage(s.page);
      // the copy's stages draw first and its line items a beat later — an edit before they
      // arrive finds an empty Manage Line Items panel
      let copied: number | null = null;
      for (const until = Date.now() + 45_000; Date.now() < until; await s.page.waitForTimeout(500)) {
        copied = await s.create.lineItemCountBadge().catch(() => null);
        if (copied && copied > 0) break;
      }
      s.lineItemsAdded = copied ?? s.lineItemsAdded;
      return `new version open for editing (${v.stageIds.length} stage(s) copied${s.lineItemsAdded ? `, ${s.lineItemsAdded} line item(s)` : ""}) — the previous version is archived and its bids are read-only`;
    }
    case "remove_line_items": {
      const r = await s.create.removeLineItems(asInt(a.count, 1));
      s.lineItemsAdded = r.after;
      return `removed ${r.removed.length} line item(s): ${r.before} → ${r.after}${r.removed.length ? ` (${r.removed.slice(0, 5).join("; ")})` : ""}`;
    }
    case "approve_award": {
      const r = await new AwardPage(s.page).approveAward(a.remark ? String(a.remark) : undefined);
      return `award approved — ${r.approved} approval step(s) were the run's buyer's`;
    }
    case "create_po": {
      // Two ways a PO is made (awardingQCS.jsx): with skip_custom_po the award becomes a proposal
      // and the orders are created when its approval completes; without it the awarding screen
      // offers "Create PO", which opens a PO form — not built yet, so that path is not checked.
      const customPo = s.page.getByRole("button", { name: /^\s*create po\s*$/i }).first();
      if (/\/awarding\//.test(s.page.url()) && (await customPo.isVisible().catch(() => false))) {
        throw new Error("not checked: this event makes POs through the custom PO form (skip_custom_po is off) — the PO-form step is not built yet");
      }
      const r = await new AwardPage(s.page).approveAward();
      const orders = await waitForOrders(s.page.url(), s.title, 90_000);
      if (!orders.length) throw new Error(`the award was approved (${r.approved} step(s)) but no purchase order was created within 90 s — the app creates one per awarded vendor when the award is final (bid.rb:2190-2209)`);
      s.orders = orders;
      return `award approved (${r.approved} step(s)); ${orders.length} purchase order(s): ${orders.map((o) => `#${o.id}${o.po_number ? ` ${o.po_number}` : ""} — ${o.items.length} line(s)`).join("; ")}`;
    }
    case "expect_po_items": {
      const orders = s.orders?.length ? s.orders : await waitForOrders(s.page.url(), s.title, 30_000);
      if (!orders.length) throw new Error("no purchase order exists for this event — create_po (approve the award) first");
      const lines = orders.flatMap((o) => o.items.map((it) => ({ ...it, order: o.id })));
      const want = asInt(a.count, s.lineItemsAdded || lines.length);
      const problems: string[] = [];
      if (lines.length !== want) problems.push(`the PO(s) carry ${lines.length} line(s), the award had ${want}`);
      const empty = lines.filter((l) => !(Number(l.quantity) > 0));
      if (empty.length) problems.push(`${empty.length} PO line(s) have no quantity`);
      if (a.quantity !== undefined) {
        const off = lines.filter((l) => Number(l.quantity) !== Number(a.quantity));
        if (off.length) problems.push(`${off.length} PO line(s) do not carry quantity ${a.quantity} (${off.slice(0, 3).map((l) => l.quantity).join(", ")})`);
      }
      const seen = `${orders.length} PO(s), ${lines.length} line(s): ${lines.slice(0, 6).map((l) => `${l.product || "item"} × ${l.quantity}`).join("; ")}`;
      expect(problems, `PO lines — ${seen}`).toEqual([]);
      return `PO lines as awarded — ${seen}`;
    }
    case "convert_to_auction": {
      // Needs a published RFQ's project page under the browser.
      if (!/\/project\//.test(s.page.url())) throw new Error("convert_to_auction needs a published event's project page — publish and expect_published first");
      const detail = new EventDetailPage(s.page);
      const offered = await detail.openStageOfferingConversion();
      if (!offered) throw new Error(`Convert to Auction is not offered on this event${detail.lastReason ? ` — ${detail.lastReason}` : ""}`);
      const newPage = await detail.convertToAuction();
      // The converted event opens in a new tab; every later step acts there.
      s.page = newPage;
      s.events = new EventsPage(newPage);
      s.create = new CreateEventPage(newPage);
      s.single = new SingleStagePage(newPage);
      await newPage.waitForLoadState("domcontentloaded").catch(() => {});
      return `conversion opened: ${new URL(newPage.url()).pathname}${new URL(newPage.url()).search.slice(0, 80)}`;
    }
    case "open_create": {
      const path = String(a.path ?? "erfx");
      await s.events.goto();
      await s.events.startCreate(path === "single-stage" ? "single-stage" : path === "boq" ? "boq" : "erfx");
      // Reaching the URL is not the same as the form being there. On this
      // environment the create screen can take 20s+ to hydrate, and the very
      // next step (set_title) was failing "could not fill within 10s" on a
      // page that was simply not ready yet. Wait for the one control every
      // create screen has before calling the step done.
      await s.page
        .getByPlaceholder(/title of the project|event title|title/i)
        .first()
        .waitFor({ state: "visible", timeout: 60_000 })
        .catch(() => {});
      return `opened the ${path} create screen`;
    }
    case "compose_stages": {
      const stages = asStages(a.stages);
      if (!stages.length) throw new Error('compose_stages needs a "stages" array like ["rfq"]');
      await s.create.createProjectWithStages(stages);
      return `stages: ${stages.join(", ")}`;
    }
    case "set_title": {
      if (await isSingleStageScreen(s)) {
        s.title = String(a.title ?? "") || generateEventTitle("UI_Plan");
        await s.single.setTitle(s.title);
        return `${s.title} (single-stage)`;
      }
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
      if (await isSingleStageScreen(s)) {
        const chosen = await s.single.selectBuyTemplate();
        // Prove it took: a button now carries the template's name, or its price sheet is on screen.
        // (Another "Select Templates" button exists elsewhere on the page, so its presence proves nothing.)
        let took = false;
        for (let i = 0; i < 30 && !took; i++) {
          took =
            (chosen ? await s.page.getByRole("button", { name: new RegExp(chosen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 40), "i") }).first().isVisible().catch(() => false) : false) ||
            (await s.page.locator(".data-grid-container").first().isVisible().catch(() => false));
          if (!took) await s.page.waitForTimeout(500);
        }
        if (!took) throw new Error(`the template "${chosen}" was clicked but neither its name nor a sheet appeared within 15 s (not evidence about the product)`);
        s.templateName = chosen;
        return `template: ${chosen} (single-stage)`;
      }
      const chosen = await s.create.selectTemplate(a.name ? String(a.name) : undefined);
      s.templateName = chosen;
      // Later steps need the sheet schema, and it only comes from the template
      // response — so capture it here rather than re-deriving it.
      s.widgets = await s.create.selectFirstTemplateAndExtractWidgets().catch(() => ({}));
      return `template: ${chosen}`;
    }
    case "add_line_items": {
      if (await isSingleStageScreen(s)) {
        // The single-stage sheet takes one product row typed in place; the
        // journey that publishes single-stage events does exactly this.
        await s.single.fillFirstLineItem(String(a.product ?? a.search ?? "a"));
        s.lineItemsAdded = 1;
        const ranges = await s.single.fillRangeCells();
        if (ranges) console.log(`[single-stage] filled ${ranges} traffic-light range cell(s) on the line item`);
        const wanted = asInt(a.count, 1);
        return wanted > 1
          ? `1 line item filled in the single-stage sheet (the case asked for ${wanted}; this screen's sheet takes one product row per flow here)`
          : "1 line item filled in the single-stage sheet";
      }
      const count = asInt(a.count, 1);
      s.products = a.search
        ? Array.from({ length: count }, (_, i) => ({ searchText: String(a.search), quantity: String((i + 1) * 10) }))
        : buildProducts(count);
      // An explicit quantity is typed exactly as given — including an invalid
      // one (negative, non-numeric) — so a case can test the app's own
      // validation rather than always getting the automation's safe default.
      if (a.quantity !== undefined) {
        const q = String(a.quantity);
        s.products = s.products.map((p) => ({ ...p, quantity: q }));
      }
      await s.create.addLineItems(s.products);
      s.lineItemsAdded = s.products.length;
      return `${s.products.length} line item(s)${a.quantity !== undefined ? ` (quantity: ${a.quantity})` : ""}`;
    }
    case "fill_sheet": {
      if (await isSingleStageScreen(s)) {
        return "sheet already filled with the line item (single-stage)";
      }
      if (!Object.keys(s.widgets).length) s.widgets = await s.create.selectFirstTemplateAndExtractWidgets();
      await s.create.fillSheet(s.widgets, s.lineItemsAdded || 1);
      return "sheet filled";
    }
    case "fill_questionnaires": {
      if (await isSingleStageScreen(s)) {
        // The single-stage RFP screen is the questionnaire itself: numbered questions with an
        // "Enter answer here…" box each (captured 2026-10-21, combo-s3), no RFI sections.
        const boxes = s.page.locator("textarea, input[type='text']").filter({ visible: true });
        let filled = 0;
        for (let i = 0; i < (await boxes.count()); i++) {
          const b = boxes.nth(i);
          const ph = ((await b.getAttribute("placeholder").catch(() => "")) ?? "").toLowerCase();
          if (!/answer/.test(ph)) continue;
          if (((await b.inputValue().catch(() => "")) ?? "").trim()) continue;
          await b.fill("Automated answer", { timeout: 5_000 }).then(() => filled++).catch(() => {});
        }
        return filled ? `${filled} answer(s) typed (single-stage questionnaire)` : "no empty answer boxes on this screen (single-stage)";
      }
      await s.create.fillVendorAssessment();
      return "RFI sections filled";
    }
    case "assign_evaluator": {
      if (await isSingleStageScreen(s)) {
        // One "Evaluator: Search people or teams" select above the questionnaire.
        const picker = s.page.locator(".ant-select").filter({ hasText: /people or teams/i }).first();
        const input = s.page.locator("input[placeholder*='people or teams' i]").first();
        const target = (await picker.count()) ? picker : input;
        if (!(await target.count())) throw new Error("no Evaluator picker on this single-stage screen (not evidence about the product)");
        await target.click({ timeout: 10_000 });
        await s.page.keyboard.type("a", { delay: 40 }).catch(() => {});
        const options = s.page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) [role='option'], .ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-dropdown-menu-item, .ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item");
        await options.first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
        const named = options.filter({ hasText: /\S/ }).first();
        if (!(await named.count())) throw new Error("the Evaluator picker opened but lists nobody to assign");
        const who = ((await named.innerText().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
        await named.click({ timeout: 5_000 });
        await s.page.keyboard.press("Escape").catch(() => {});
        return `evaluator assigned: ${who.slice(0, 60)} (single-stage)`;
      }
      const n = await s.create.assignEvaluatorToAllLineItems();
      if (!n) throw new Error("no evaluator could be assigned, and a technical stage cannot publish without one");
      return `${n} evaluator control(s)`;
    }
    case "set_schedule": {
      if (await isSingleStageScreen(s)) {
        return "default schedule kept (single-stage sets its window on publish)";
      }
      if (a.minutes) process.env.UI_SCHEDULE_MINUTES = String(asInt(a.minutes, 30));
      await s.create.saveSchedule();
      // Every stage must be scheduled the same way: a stage left on its old fixed end beside a
      // re-scheduled Duration is refused at publish (BUG-85) — on a new version the copied
      // stages load with the end time the server stored. A drawer opened before the page
      // settled showed one block of two (2026-10-09), so schedule again when one is missing.
      const stages = (await s.create.currentStages().catch(() => [])).length;
      if (stages > 1 && s.create.scheduleWindows.length < stages) {
        console.log(`[create-event] the schedule covered ${s.create.scheduleWindows.length} of ${stages} stages — scheduling again`);
        await s.page.waitForTimeout(2_000);
        await s.create.saveSchedule();
        if (s.create.scheduleWindows.length < stages) throw new Error(`the Schedule drawer showed ${s.create.scheduleWindows.length} of ${stages} stages — the others keep their previous end time, which the app refuses beside a Duration (BUG-85)`);
      }
      // Two stages must end together, or the technical stage ends after the RFQ and publish is
      // refused ("RFP duration exceeds RFQ end time"). A duration that is not a preset lands on
      // a different preset per block (45 asked → 60 on the technical block, 30 on the RFQ,
      // 2026-10-21), so when the blocks disagree, schedule every block on the 30-minute preset.
      const ends = new Set(s.create.scheduleWindows.map((w) => w.endsAt));
      if (stages > 1 && s.create.scheduleWindows.length > 1 && ends.size > 1) {
        console.log(`[create-event] the stages end at different times (${[...ends].join(" / ")}) — scheduling every stage on the 30-minute preset`);
        process.env.UI_SCHEDULE_MINUTES = "30";
        await s.page.waitForTimeout(1_000);
        await s.create.saveSchedule();
      }
      // Report what the app holds — each stage block's own "Event will end at" line — never
      // what was typed (a 3-minute end that did not take was reported as "saved (3 min)").
      const windows = s.create.scheduleWindows.map((w) => `${w.stage.replace(/^\d+\.\s*/, "")} ends ${w.endsAt}`).join(" · ");
      const chosen = s.create.scheduleMinutesChosen;
      const asked = a.minutes ? asInt(a.minutes, 30) : null;
      const note = asked && chosen && chosen !== asked ? ` — asked ${asked} min, the app kept ${chosen} min` : asked && !chosen ? ` — asked ${asked} min, the app kept its default` : "";
      return `schedule saved${windows ? `: ${windows}` : ""}${note}`;
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
    case "start_awarding": {
      const award = new AwardPage(s.page);
      await award.startAwarding();
      return `on the awarding screen at ${new URL(s.page.url()).pathname}`;
    }
    case "allocate_award": {
      const award = new AwardPage(s.page);
      const allocated = await award.allocate(a.vendor ? String(a.vendor) : undefined);
      return `allocated ${allocated.items} line item(s) to ${allocated.vendors} vendor(s)`;
    }
    case "expect_award_counters": {
      const c = await new AwardPage(s.page).readCounters();
      const show = (x: { selected: number; total: number } | null) => (x ? `${x.selected}/${x.total}` : "(not shown)");
      const want = (v: unknown) => String(v ?? "").replace(/\s+/g, "");
      if (a.items !== undefined && show(c.items) !== want(a.items)) throw new Error(`"Tot. selected line items" reads ${show(c.items)} — the case expects ${want(a.items)}`);
      if (a.vendors !== undefined && show(c.vendors) !== want(a.vendors)) throw new Error(`"Awarded Vendors" reads ${show(c.vendors)} — the case expects ${want(a.vendors)}`);
      if (a.items === undefined && a.vendors === undefined) throw new Error("expect_award_counters needs items or vendors to compare");
      return `line items ${show(c.items)}, vendors ${show(c.vendors)}`;
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
      if (await isSingleStageScreen(s)) {
        // The invite rule: a vendor the case names is searched for; otherwise the product's
        // own Invite Vendor takes everyone it suggests (the tester's rule, 2026-10-21).
        const asked = Array.isArray(a.vendors) ? a.vendors.map(String) : Array.isArray(a.names) ? a.names.map(String) : a.vendor ? [String(a.vendor)] : [];
        const added: string[] = [];
        for (const n of asked) {
          if (await s.single.addParticipant(n)) added.push(n);
          else console.log(`[single-stage] no vendor matched "${n}" in the participants search`);
        }
        if (!added.length) await s.single.inviteVendor();
        return added.length ? `invited ${added.join(", ")} (single-stage)` : "invited every vendor the product suggested (single-stage)";
      }
      const min = a.count !== undefined ? Number(a.count) : (vendorCount() ?? 0);
      // Names come from the CASE only (the compiler never invents one); with none, the product's
      // own Invite Vendor puts everyone it suggests on the event, and `count` tops up with QA
      // test vendors when the suggestion was short (E4, 2026-10-21: two bids need two vendors).
      const names = Array.isArray(a.vendors) ? (a.vendors as unknown[]).map(String) : vendorNames();
      const invited = await s.create.inviteVendors({ names, count: min });
      const total = await s.create.participantCount();
      return invited.length ? `invited ${invited.join(", ")} (${total} total)` : `${total} participant(s) — every vendor the product suggested`;
    }
    case "publish":
      if (await isSingleStageScreen(s)) {
        await s.single.publish(s.title);
        const redirected = await s.single.waitForRedirectToProject().then(() => true).catch(() => false);
        if (!redirected) {
          // Say what the screen says instead of "waitForURL timed out": the
          // app refuses single-stage publishes inline (form messages), not
          // with a toast, and the traffic-light range is the usual reason.
          const inline = (await s.page.locator(".ant-form-explain, .has-error, [role='alert'], .ant-message-notice").allTextContents())
            .map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 4);
          const toast = await s.single.errorToastText(800);
          await recordStuck(s.page, {
            label: "single-stage-publish",
            message: `publish did not reach a project page${toast ? ` — toast: ${toast}` : ""}${inline.length ? ` — on screen: ${inline.join(" | ")}` : ""}`,
            triedCandidates: ["waitForURL(/project|orders/:id)"],
            healerTried: false,
          }).catch(() => {});
          throw new Error(`the single-stage publish did not reach a project page${toast ? ` — the app said: ${toast}` : ""}${inline.length ? ` — on screen: ${inline.join(" | ")}` : " (captured for a look)"}`);
        }
        const id = s.single.projectId();
        if (id) s.projectId = id;
        return `published as ${id ?? "(no id in URL)"} (single-stage)`;
      }
      await s.create.publishAndAwaitOutcome(s.title);
      s.projectId = s.create.projectId() ?? s.projectId;
      return `published as ${s.create.projectId()}`;
    case "save_draft":
      // The single-stage screen offers only "Publish Event" (captured 2026-10-21): say so
      // rather than spend ten seconds looking for a button the product does not draw there.
      if (await isSingleStageScreen(s)) throw new Error("the single-stage create screen has no Save as draft — only Publish Event; a draft needs the eRFX screen");
      await s.create.saveAsDraft();
      return "saved as draft";

    // ── assertions ────────────────────────────────────────────────────────
    case "expect_line_items": {
      if (await isSingleStageScreen(s)) {
        return "single-stage sheet holds its line item (no Items badge on this screen)";
      }
      const want = asInt(a.count, s.lineItemsAdded || 1);
      const badge = await s.create.lineItemCountBadge();
      // evidence: which products the price sheet actually lists (its "Product" column)
      const rows = await s.page
        .evaluate(() => {
          const table = document.querySelector(".data-grid-container table");
          if (!table) return [] as string[];
          const trs = [...table.querySelectorAll("tr")];
          const heads = [...(trs[0]?.querySelectorAll("td,th") ?? [])].map((c) => (c.textContent || "").replace(/\*/g, "").trim().toLowerCase());
          const col = heads.findIndex((h) => /^product/.test(h));
          if (col < 0) return [] as string[];
          return trs.slice(1).map((tr) => ((tr.querySelectorAll("td")[col]?.textContent || "").trim())).filter(Boolean);
        })
        .catch(() => [] as string[]);
      const listed = rows.length ? `; the sheet lists ${rows.map((r) => `“${r.slice(0, 40)}”`).join(", ")}` : "";
      expect(badge, `the toolbar should show ${want} line item(s) — it shows ${badge}${listed}`).toBe(want);
      return `badge shows ${badge}${listed}`;
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
      // A field-level toast (e.g. an invalid quantity) can easily have fired
      // and faded well before this step runs — the step that typed the bad
      // value already captured it the instant it appeared. Only fall back to
      // a fresh live wait when nothing was captured earlier in the run.
      const captured = s.create.lastQuantityError;
      const err = captured ?? (await s.create.errorToastText(5_000));
      expect(err, "the app was expected to refuse this").toBeTruthy();
      if (a.contains) expect(err ?? "").toContain(String(a.contains));
      return captured ? `app said (caught as it appeared): ${err}` : `app said: ${err}`;
    }
    case "expect_publish_blocked": {
      if (s.earlyRefusal) {
        // Blocked before publish could be reached. Judge the app's words against the reason.
        const said = (/“([^”]*)”/.exec(s.earlyRefusal)?.[1] ?? /reads: “([^”]*)/.exec(s.earlyRefusal)?.[1] ?? s.earlyRefusal).toLowerCase();
        const because = String(a.because ?? "").toLowerCase().trim();
        if (because && !said.includes(because)) {
          throw new Error(`publishing was blocked earlier, but the app's words do not name the reason — the case expects "${because}"; ${s.earlyRefusal}`);
        }
        return `blocked before publish — ${s.earlyRefusal}`;
      }
      // Say WHY the app may have allowed it: the product audience adds vendors
      // from the line items on its own, so "no participants" is often untrue.
      const participants = await s.create.participantCount().catch(() => -1);
      const participantsNote = participants >= 0 ? ` — ${participants} participant(s) were on the event (the product audience adds vendors from the line items)` : "";
      // Two shapes of "blocked" exist on this screen and a test should accept
      // either: the confirm button rendered but disabled, or the app refusing
      // outright with a message. Insisting on one makes the test brittle about
      // something it does not care about.
      const p = s.page;
      const startUrl = p.url();
      await s.create.dismissDistractions();
      await p.getByRole("button", { name: /^publish( event)?$/i }).first().click({ timeout: 10_000 }).catch(() => {});
      await p.waitForTimeout(1_500);
      // Shape 1 of "blocked": the confirm button rendered but disabled.
      const confirm = p.locator(".ant-modal-content, [role='dialog']").getByRole("button", { name: /^publish|confirm|yes/i }).first();
      if (await confirm.count()) {
        const disabled = await confirm.isDisabled().catch(() => false);
        if (disabled) return "the confirm button is disabled, as expected";
        // A live confirm: the app is asking, not refusing. Pressing it is what
        // the case means by "publish"; a refusal may still follow.
        await confirm.click({ timeout: 5_000 }).catch(() => {});
      }
      // Now wait for ONE of three outcomes, not just a toast. UI-PART-001's
      // publish with no participants produced no toast — and no event under
      // Live, Drafts or History either: the click did nothing observable.
      // "No refusal" was being read as "allowed"; it was neither.
      const deadline = Date.now() + 20_000;
      let refusal: string | null = null;
      let published = false;
      while (Date.now() < deadline && !refusal && !published) {
        refusal = await s.create.errorToastText(500);
        if (!refusal) {
          const inline = (await p.locator(".ant-message-notice, [role='alert'], .ant-form-explain, .has-error .ant-form-explain").allTextContents())
            .map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
          if (inline.length) refusal = inline.join(" | ");
        }
        if (!refusal && BasePage.projectIdFromUrl(p.url())) published = true;
        if (!refusal && !published) await p.waitForTimeout(500);
      }
      if (refusal) {
        // Say WHAT the app said when it is not what the case expects — a bare
        // "expect(received).toContain(expected)" hid the one fact that matters
        // (the product checks participants before the template, so a publish
        // with neither is refused for participants).
        const n = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        if (a.because && !n(refusal).includes(n(String(a.because)))) {
          if (/created successfully|published successfully|event (is )?live/i.test(String(refusal))) {
            throw new Error(`publishing was ALLOWED — the app said "${refusal}"; the case expects it to be refused with "${a.because}" (check the plan really built the case's starting condition)`);
          }
          throw new Error(`publishing was blocked, but for a different reason — the app said "${refusal}"; the case expects "${a.because}"`);
        }
        return `blocked: ${refusal}`;
      }
      if (published) {
        // Decide what an allowed publish MEANS: read the published event's own
        // participant count. Zero = an event nobody can bid on went live (a
        // product defect); more = the product audience supplied vendors, so the
        // case's premise cannot be reached on this tenant.
        let note = "";
        const chip = p.getByRole("button", { name: /participants\s*\d+/i }).or(p.getByRole("tab", { name: /participants/i })).first();
        await chip.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
        const text = ((await chip.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
        const n = Number((text.match(/(\d+)/) || [])[1]);
        if (Number.isFinite(n)) note = ` The published event shows ${n} participant(s)` + (n === 0 ? " — an event nobody can bid on was published: a product defect." : " — the product audience supplied them from the line items, so this tenant cannot reach the case's premise of no participants.");
        throw new Error(`publishing was expected to be blocked, but the app published ${BasePage.projectIdFromUrl(p.url())}${participantsNote}.${note}`);
      }
      // Neither: no message, no modal refusal, no navigation — and nothing to
      // find in the events list afterwards. For a case that expects a message
      // ("Please add participants to proceed!") this is the finding.
      throw new Error(
        `publishing was expected to be blocked WITH a message, but the app neither refused visibly nor published: after Publish the page stayed at ${new URL(startUrl).pathname} with no toast, no inline message and no navigation for 20s${participantsNote}. A silent no-op where the case expects "Please add participants to proceed!".`,
      );
    }
    case "expect_stages": {
      const want = asStages(a.stages);
      // The create screen paints its stage tabs after a loading spinner; reading the strip
      // while it spins sees no stages. Wait (bounded) for the spinner to go and the tabs to settle.
      await s.create.waitForSpinnerHidden().catch(() => {});
      let have = await s.create.currentStages();
      for (let i = 0; i < 10 && have.length === 0; i++) {
        await s.create.page.waitForTimeout(1_000);
        have = await s.create.currentStages();
      }
      if (have.length === 0) throw new Error("the stage tabs never rendered within 40s — the screen did not finish loading (not evidence about the product)");
      expect(have.sort(), `the stage tabs read ${have.join(", ")}`).toEqual(want.sort());
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
    title: plan.context?.title ?? generateEventTitle("UI_Plan"),
    widgets: {},
    products: [],
    lineItemsAdded: 0,
    bidSubmitted: false,
    surrogateBids: [],
    awarded: false,
    memory: {},
    prevMark: 0,
    curMark: 0,
    context: plan.context ?? {},
    stepNo: 0,
  };

  console.log(`[plan] ${plan.title} — ${plan.steps.length} step(s)${plan.context?.state ? ` on a ${plan.context.state} event built by API` : ""}`);
  const results: StepResult[] = [];
  const observations: Observation[] = [];
  const runId = process.env.QA_RUN_ID ?? `plan-${Date.now().toString(36)}`;
  installObserver(page, runId);
  installSpotlight(page, joinInv(process.cwd(), "evidence", runId.replace(/[^\w.-]+/g, "_")));
  /** The observation pass after a step — bounded, and never the reason a step fails. */
  const look = async (i: number, name: string, force: boolean) => {
    const o = await Promise.race([
      observe(page, i + 1, name, { force }).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), 25_000)),
    ]);
    if (o && (o.findings.length || o.screenshot)) observations.push(o);
    if (o?.findings.length) console.log(`[observe] after ${name}: ${o.findings.map((f) => `${f.rule}: ${f.detail}`).join(" | ").slice(0, 300)}`);
    // Discovery (UI_DISCOVER=1): every screen the run reaches for the first time is inventoried —
    // its controls, boxes and numbered map — so the screen-cases agent can write the cases that
    // screen deserves after the run ("new test cases found on this run"). Bounded, never fatal.
    if (process.env.UI_DISCOVER === "1" && o?.screenshot && !discovered.has(screenKey(page.url()))) {
      discovered.add(screenKey(page.url()));
      await Promise.race([
        (async () => {
          const label = screenKey(page.url()).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "screen";
          const inv = await screenInventory(page);
          const map = await spotlightMap(page, label, inv.controls).catch(() => null);
          const file = o.screenshot!.replace(/\.png$/, ".inventory.json");
          writeInv(file, JSON.stringify({ label, context: s.context?.state ?? "none", screenshot: o.screenshot, map, aria: o.snapshot ?? null, runId, stepNo: i + 1, ...inv }, null, 2));
          console.log(`[inventory] ${file}`);
        })().catch(() => {}),
        new Promise<void>((r) => setTimeout(r, 20_000)),
      ]);
    }
  };
  /**
   * A screen's identity for discovery: its path with ids replaced, e.g. /project/:id/details —
   * UUIDs, numbers, and short mixed letter-digit slugs like the project code "TlpnY2RO".
   */
  const screenKey = (u: string) => {
    try {
      return (
        new URL(u).pathname
          .split("/")
          .map((seg) => (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(seg) || /^\d{3,}$/.test(seg) || (/\d/.test(seg) && /[a-z]/i.test(seg) && seg.length >= 6 && !/-/.test(seg)) ? ":id" : seg))
          .join("/")
          .replace(/\/+$/, "") || "/"
      );
    } catch {
      return u;
    }
  };
  const discovered = new Set<string>();
  let failed = false;
  let recoveries = 0;
  const recoveredRules = new Set<string>();
  const BLOCK_ASSERTION_STEPS = new Set(["expect_publish_blocked", "expect_error", "expect_message", "attempt", "expect_field_error"]);
  /** index of the block assertion to jump to after an early refusal */
  let jumpTo = -1;
  const BLOCK_ASSERTIONS = ["expect_publish_blocked", "expect_error", "expect_message"];

  for (const [i, step] of plan.steps.entries()) {
    const started = Date.now();
    if (jumpTo > i) {
      results.push({ step: step.step, args: step.args, status: "skipped", detail: "not reached — the app refused an earlier step, which the block assertion below judges", ms: 0 });
      console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} — not reached (the app refused earlier)`);
      continue;
    }
    if (failed) {
      // Once a step fails the page is in an unknown state; running the rest
      // would produce failures that say nothing about the product.
      results.push({ step: step.step, args: step.args, status: "skipped", ms: 0 });
      continue;
    }
    // Proactive, not reactive: without this, a toast like "enable browser
    // notifications" only gets dismissed after a click fails against it (or
    // after the watchdog's 60s stuck timer), sitting on screen the whole
    // time. Clearing it before every step is a ~400ms-debounced no-op when
    // nothing is showing, so it costs nothing on the steps that don't need it.
    await s.create.dismissDistractions().catch(() => false);
    try {
      s.prevMark = s.curMark;
      s.curMark = await toastMark(s.page);
      s.lastStrategy = undefined;
      s.stepNo = i + 1;
      beginStep(i + 1, step.step, plan.steps.length);
      const detail = await runStep(s, step);
      if (/^expect_/.test(step.step)) await spotlightVerify(page, `${step.step}${detail ? ` — ${detail}` : ""}`).catch(() => {});
      results.push({ step: step.step, args: step.args, status: "ok", detail, ...(s.lastStrategy ? { strategy: s.lastStrategy } : {}), ms: Date.now() - started, ...(stepShots().length ? { spotlights: stepShots() } : {}) });
      console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ✓ ${detail ?? ""}`);
      await look(i, step.step, i === plan.steps.length - 1);
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
      // What did the app SAY while this step ran — and is it one of its own rules?
      const said = [
        ...((/rejected by the app:\s*(.+)$/i.exec(first)?.[1] ?? "").trim() ? [/rejected by the app:\s*(.+)$/i.exec(first)![1].trim()] : []),
        // a refusal is an error or a warning — "Proposal submitted successfully" explains no failure
        ...(await appMessagesSince(page, s.curMark).catch(() => [])).filter((m) => m.kind === "error" || m.kind === "warning").map((m) => m.text),
      ].filter((t, k, all) => t && all.indexOf(t) === k);
      const ruled = said.map((t) => ({ t, rule: appRuleFor(t) })).find((x) => x.rule) ?? null;
      let ruledLast: typeof ruled = null;
      let lastRefusal: string | null = null;

      // RECOVER: the case is positive (it asserts no refusal), the app refused by a rule the
      // run's own setup broke, and the code says how to satisfy it — do that, retry the step
      // once, and say so. Never for a case that is testing the refusal, never twice for the
      // same rule, at most two recoveries a run.
      const negative = plan.steps.some((st) => BLOCK_ASSERTION_STEPS.has(st.step) || st.step === "skip");
      // A refusal can hide the next one: a new version's publish first wants its evaluator,
      // then its questionnaire sections. Each retry is judged afresh, and a DIFFERENT known
      // rule is recovered too — bounded by the run's cap and never the same rule twice.
      let cur = ruled;
      let recovery = cur ? recoveryFor(cur.t) : null;
      const chain: Array<{ appSaid: string; rule: string; why: string; did: string[] }> = [];
      let recoveredStep = false;
      while (cur && recovery && !negative && recoveries < 3 && !recoveredRules.has(cur.rule!.message)) {
        recoveries++;
        recoveredRules.add(cur.rule!.message);
        console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ↻ the app refused: "${cur.t}" — its rule (${cur.rule!.source}); ${recovery.why}. Doing ${recovery.steps.map((x) => x.step).join(" + ")}, then retrying`);
        const did: string[] = [];
        let recoveredOk = true;
        for (const rs of recovery.steps) {
          try {
            const d = await runStep(s, rs);
            did.push(`${rs.step}${d ? `: ${d}` : ""}`);
          } catch (re) {
            did.push(`${rs.step} could not run: ${(re instanceof Error ? re.message : String(re)).split("\n")[0]}`);
            recoveredOk = false;
            break;
          }
        }
        chain.push({ appSaid: cur.t, rule: cur.rule!.source, why: recovery.why, did });
        if (!recoveredOk) break;
        try {
          s.prevMark = s.curMark;
          s.curMark = await toastMark(s.page);
          const detail2 = await runStep(s, step);
          const told = chain.map((c) => `the app refused "${c.appSaid}" (${c.rule}); ${c.why}`).join(", then ");
          if (/^expect_/.test(step.step)) await spotlightVerify(page, `${step.step}${detail2 ? ` — ${detail2}` : ""}`).catch(() => {});
          results.push({ step: step.step, args: step.args, status: "ok", detail: `${detail2 ?? ""} — after recovering: ${told}`, recovered: { ...chain[0], did: chain.flatMap((c) => c.did) }, ms: Date.now() - started, ...(stepShots().length ? { spotlights: stepShots() } : {}) });
          console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ✓ ${detail2 ?? ""} (after recovering from ${chain.map((c) => `"${c.appSaid}"`).join(" and ")})`);
          await look(i, step.step, false);
          recoveredStep = true;
          break;
        } catch (retryErr) {
          const m2 = (retryErr instanceof Error ? retryErr.message : String(retryErr)).split("\n")[0];
          console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ✗ still refused after recovering (${did.join("; ")}): ${m2}`);
          const said2 = [
            ...((/rejected by the app:\s*(.+)$/i.exec(m2)?.[1] ?? "").trim() ? [/rejected by the app:\s*(.+)$/i.exec(m2)![1].trim()] : []),
            ...(await appMessagesSince(page, s.curMark).catch(() => [])).filter((m) => m.kind === "error" || m.kind === "warning").map((m) => m.text),
          ].filter((t, k, all) => t && all.indexOf(t) === k);
          cur = said2.map((t) => ({ t, rule: appRuleFor(t) })).find((x) => x.rule) ?? null;
          recovery = cur ? recoveryFor(cur.t) : null;
          if (cur) ruledLast = cur;
          lastRefusal = m2;
          if (!cur && said2[0]) ruledLast = null;
        }
      }
      if (recoveredStep) continue;

      // The APP refused this step (not the automation failing to perform it) and the case goes on
      // to assert a block: that refusal IS the block — judge it there rather than stopping here.
      const later = /^the app refused/i.test(first) ? plan.steps.findIndex((st, k) => k > i && BLOCK_ASSERTIONS.includes(st.step)) : -1;
      if (later > i) {
        s.earlyRefusal = first;
        jumpTo = later;
        results.push({ step: step.step, args: step.args, status: "ok", detail: `refused by the app — ${first}`, ms: Date.now() - started });
        console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ✓ refused by the app (the case asserts a block at step ${later + 1}) — ${first}`);
        continue;
      }
      // report the LAST refusal — after recoveries it is the one still standing
      const lastRule = lastRefusal ? ruledLast : ruled;
      const ruleNote = lastRule ? ` — the app's own rule (${lastRule.rule!.source})${recoveryFor(lastRule.t) ? "" : "; no known way for the run to satisfy it"}` : said.length ? ` — the app said "${said[0]}", which is not one of its known rules` : "";
      const failedAt = results.length;
      const failText = (lastRefusal ?? detail) + (lastRefusal && !lastRule ? " — the app said this after the recoveries above; it is not one of the dashboard's own rules" : ruleNote);
      results.push({ step: step.step, args: step.args, status: "failed", detail: failText, ms: Date.now() - started, ...(stepShots().length ? { spotlights: stepShots() } : {}) });
      console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ✗ ${failText}`);
      const before = observations.length;
      await look(i, step.step, true);
      const shot = observations.slice(before).find((o) => o.screenshot)?.screenshot;
      results[failedAt].evidence = {
        ...(shot ? { screenshot: shot } : {}),
        url: page.url(),
        ...(lastRefusal ? { appSaid: [lastRefusal.replace(/^.*rejected by the app:\s*/i, "")] } : said.length ? { appSaid: said.slice(0, 5) } : {}),
        ...(lastRule ? { rule: { message: lastRule.rule!.message, source: lastRule.rule!.source, ...(lastRule.rule!.condition ? { condition: lastRule.rule!.condition } : {}) } } : {}),
      };
      if (shot) console.log(`[plan] evidence: ${shot}`);
      failed = true;
    }
  }

  return { title: plan.title, steps: results, passed: !failed, observations };
}

/**
 * The run's own event's purchase orders, polled until some exist. The event is the one in the
 * page's /project/<id> (its title on screen can differ from the run's title); the newest event
 * group with the run's title is the fallback.
 */
async function waitForOrders(url: string, title: string, ms: number): Promise<DbOrder[]> {
  const fromUrl = decodeProcolId(url.match(/\/project\/([^/?#]+)/)?.[1] ?? "") ?? undefined;
  const until = Date.now() + ms;
  for (;;) {
    const egId = fromUrl ?? (await eventGroupByTitle(title).catch(() => undefined))?.id;
    const orders = egId ? await ordersOfEventGroup(egId).catch(() => [] as DbOrder[]) : [];
    if (orders.length || Date.now() > until) return orders;
    await new Promise((r) => setTimeout(r, 5_000));
  }
}
